#!/usr/bin/env python3
"""Narração das aulas com o TTS neural do Edge (edge-tts).

Uso:
  python3 scripts/tts.py cursos/netpractice/lessons/0001-slug
      Gera audio/cena-NN.mp3 e cues.json a partir do roteiro.json da aula.
      Idempotente: só regenera a cena cujo texto, voz ou rate mudou.

  python3 scripts/tts.py --amostras amostras/ --texto "..." \
      --vozes pt-BR-FranciscaNeural,pt-BR-ThalitaMultilingualNeural,pt-BR-AntonioNeural
      Gera uma amostra por voz com o mesmo texto.

Opções:
  --voz VOZ     sobrescreve a voz do roteiro (padrão: campo "voz" do roteiro,
                senão pt-BR-FranciscaNeural)
  --rate RATE   sobrescreve o rate (padrão: campo "rate" do roteiro, senão +0%)
  --forcar      regenera tudo, ignorando os hashes

Rede: o edge-tts abre um WebSocket para speech.platform.bing.com. Se houver
um proxy com CA própria, o script usa HTTPS_PROXY e o CA de SSL_CERT_FILE ou
REQUESTS_CA_BUNDLE (sem nunca desligar a verificação TLS).

Saída com código 3 quando o serviço não responde: a aula cai no plano B
(narração ao vivo pela Web Speech API em assets/voice.js).
"""

import argparse
import asyncio
import hashlib
import json
import os
import re
import ssl
import sys
from pathlib import Path

try:
    import aiohttp
    import edge_tts
except ImportError:
    sys.exit("Instale as dependências: pip install edge-tts mutagen")

try:
    from mutagen.mp3 import MP3
except ImportError:
    MP3 = None

VOZ_PADRAO = "pt-BR-FranciscaNeural"
RATE_PADRAO = "+0%"
TICKS = 10_000_000  # o edge-tts mede offset e duração em unidades de 100 ns
PALAVRAS_POR_SEG = (1.6, 3.6)  # faixa plausível para narração em pt-BR


class ServicoIndisponivel(Exception):
    pass


def _conector():
    ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    if ca and Path(ca).is_file():
        return aiohttp.TCPConnector(ssl=ssl.create_default_context(cafile=ca))
    return None


async def sintetizar(texto, voz, rate, destino):
    """Grava o MP3 em destino e devolve a lista de palavras com tempos."""
    kwargs = {"rate": rate, "boundary": "WordBoundary"}
    conector = _conector()
    if conector is not None:
        kwargs["connector"] = conector
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        kwargs["proxy"] = proxy
    com = edge_tts.Communicate(texto, voz, **kwargs)
    palavras, frases = [], []
    tmp = Path(str(destino) + ".tmp")
    try:
        with open(tmp, "wb") as f:
            async for parte in com.stream():
                if parte["type"] == "audio":
                    f.write(parte["data"])
                elif parte["type"] in ("WordBoundary", "SentenceBoundary"):
                    item = {
                        "t": round(parte["offset"] / TICKS, 3),
                        "d": round(parte["duration"] / TICKS, 3),
                        "w": parte["text"],
                    }
                    (palavras if parte["type"] == "WordBoundary" else frases).append(item)
    except (aiohttp.ClientError, asyncio.TimeoutError, OSError,
            edge_tts.exceptions.WebSocketError) as e:
        tmp.unlink(missing_ok=True)
        raise ServicoIndisponivel(str(e)) from e
    if tmp.stat().st_size == 0:
        tmp.unlink(missing_ok=True)
        raise ServicoIndisponivel("nenhum áudio recebido")
    tmp.replace(destino)
    return palavras or frases, ("palavra" if palavras else "frase")


def duracao(mp3):
    if MP3 is None:
        return None
    return round(MP3(mp3).info.length, 2)


def conferir_duracao(nome, texto, seg):
    n = len(re.findall(r"\w+", texto))
    if not seg:
        return
    taxa = n / seg
    ok = PALAVRAS_POR_SEG[0] <= taxa <= PALAVRAS_POR_SEG[1]
    marca = "ok" if ok else "ATENÇÃO"
    print(f"  {nome}: {seg:.1f} s, {n} palavras, {taxa:.2f} palavras/s [{marca}]")
    if not ok:
        print(f"  {nome}: duração incoerente com o texto, confira o MP3.", file=sys.stderr)


def hash_cena(texto, voz, rate):
    return hashlib.sha256(f"{voz}|{rate}|{texto}".encode()).hexdigest()[:16]


async def gerar_aula(pasta, voz_cli, rate_cli, forcar):
    pasta = Path(pasta)
    roteiro = json.loads((pasta / "roteiro.json").read_text(encoding="utf-8"))
    voz = voz_cli or roteiro.get("voz") or VOZ_PADRAO
    rate = rate_cli or roteiro.get("rate") or RATE_PADRAO
    audio_dir = pasta / "audio"
    audio_dir.mkdir(exist_ok=True)
    cues_path = pasta / "cues.json"
    cues = json.loads(cues_path.read_text(encoding="utf-8")) if cues_path.exists() else {}
    cenas_cues = cues.get("cenas", {})
    novo = {"voz": voz, "rate": rate, "cenas": {}}

    for i, cena in enumerate(roteiro["cenas"], 1):
        cid = cena["id"]
        texto = cena["narracao"].strip()
        h = hash_cena(texto, voz, rate)
        arquivo = f"audio/{cid}.mp3"
        mp3 = pasta / arquivo
        antigo = cenas_cues.get(cid)
        if not forcar and antigo and antigo.get("hash") == h and mp3.exists():
            print(f"  {cid}: sem mudança, mantido")
            novo["cenas"][cid] = antigo
            continue
        print(f"  {cid}: gerando...")
        palavras, granul = await sintetizar(texto, voz, rate, mp3)
        seg = duracao(mp3)
        conferir_duracao(cid, texto, seg)
        novo["cenas"][cid] = {
            "hash": h,
            "audio": arquivo,
            "duracao": seg,
            "granularidade": granul,
            "palavras": palavras,
        }

    # remove MP3 de cenas que saíram do roteiro
    ids = {c["id"] for c in roteiro["cenas"]}
    for velho in audio_dir.glob("*.mp3"):
        if velho.stem not in ids:
            velho.unlink()
            print(f"  {velho.name}: removido (cena não existe mais)")

    cues_path.write_text(json.dumps(novo, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum((c.get("duracao") or 0) for c in novo["cenas"].values())
    print(f"Total: {total/60:.1f} min em {len(novo['cenas'])} cenas. cues.json salvo.")


async def gerar_amostras(saida, texto, vozes, rate):
    saida = Path(saida)
    saida.mkdir(parents=True, exist_ok=True)
    for voz in vozes:
        nome = voz.replace("pt-BR-", "").replace("Neural", "").lower()
        mp3 = saida / f"amostra-{nome}.mp3"
        await sintetizar(texto, voz, rate, mp3)
        seg = duracao(mp3)
        conferir_duracao(mp3.name, texto, seg)
    (saida / "texto.txt").write_text(texto + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("aula", nargs="?", help="pasta da aula com roteiro.json")
    ap.add_argument("--voz")
    ap.add_argument("--rate")
    ap.add_argument("--forcar", action="store_true")
    ap.add_argument("--amostras", metavar="PASTA")
    ap.add_argument("--texto")
    ap.add_argument("--vozes")
    a = ap.parse_args()
    try:
        if a.amostras:
            if not (a.texto and a.vozes):
                ap.error("--amostras exige --texto e --vozes")
            asyncio.run(gerar_amostras(a.amostras, a.texto, a.vozes.split(","), a.rate or RATE_PADRAO))
        elif a.aula:
            asyncio.run(gerar_aula(a.aula, a.voz, a.rate, a.forcar))
        else:
            ap.print_help()
    except ServicoIndisponivel as e:
        print(f"Serviço de voz indisponível ({e}).", file=sys.stderr)
        print("Plano B: a aula usa assets/voice.js (Web Speech API). "
              "Libere speech.platform.bing.com para gerar os MP3.", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
