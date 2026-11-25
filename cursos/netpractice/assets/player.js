/* player.js: player de videoaula do curso.
   NP.Player.iniciar({
     raiz: Element,               // <section class="player">
     roteiro: "roteiro.json", cues: "cues.json",
     visuais: { "cena-01": { montar(el, api), passo(n, api), sair() } },
     transcricao: Element, painel: Element
   })
   Cada cena do roteiro: {id, titulo, narracao, visual:{descricao, passos:[âncoras]}, paradas:[...]}.
   Uma âncora é um trecho literal da narração: quando a fala chega nele, o
   visual recebe passo(n). Funciona igual com MP3 (cues.json com tempo por
   palavra) e com o plano B (Web Speech API, evento boundary).
   Modos por cena: "mp3", "voz" (voice.js) ou "relogio" (só texto, sem som). */
(function (g) {
  "use strict";

  function ls(acao, chave, valor) {
    try {
      if (acao === "get") { var v = g.localStorage.getItem(chave); return v ? JSON.parse(v) : null; }
      g.localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) { return null; }
  }
  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (filhos || []).forEach(function (f) { if (f) e.appendChild(f); });
    return e;
  }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function norm(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function tokenizar(texto) {
    var out = [], re = /[0-9A-Za-zÀ-ÿ]+(?:[-'][0-9A-Za-zÀ-ÿ]+)*/g, m;
    while ((m = re.exec(texto))) out.push({ ini: m.index, fim: m.index + m[0].length, w: m[0] });
    return out;
  }
  function frases(texto) {
    var out = [], re = /[^.!?]+[.!?]*\s*/g, m;
    while ((m = re.exec(texto))) if (m[0].trim()) out.push({ ini: m.index, fim: m.index + m[0].length });
    return out;
  }
  /* liga cada palavra com tempo (cues) a uma posição na narração */
  function alinhar(texto, palavrasCue) {
    var t = norm(texto), cursor = 0, out = [];
    (palavrasCue || []).forEach(function (p) {
      var w = norm(p.w).replace(/[^0-9a-z\- ']/g, "");
      if (!w) return;
      var i = t.indexOf(w, cursor);
      if (i >= 0 && i - cursor < 80) { out.push({ t: p.t, ini: i, fim: i + w.length }); cursor = i + w.length; }
    });
    return out;
  }

  function iniciar(op) {
    var raiz = op.raiz, roteiro, cues = { cenas: {} };
    var cenas = [], inicioCena = [], total = 0;
    var idx = 0, tocando = false, modoAtual = null, posChar = 0, passoAtual = -1;
    var audio = new Audio();
    audio.preload = "auto";
    var falaVoz = null, relogio = null, relogioT0 = 0, relogioBase = 0;
    var velocidade = 1, legendaOn = ls("get", "np-legenda") !== false;
    var chave, resultados = {}, emParada = false;

    // ---------- Estrutura ----------
    var palco = el("div", { class: "palco" });
    var tituloCena = el("p", { class: "cena-titulo" });
    var visual = el("div", { class: "visual" });
    var areaParada = el("div", { class: "parada-area", hidden: "" });
    var legenda = el("div", { class: "legenda", "aria-live": "off" });
    palco.appendChild(tituloCena); palco.appendChild(visual); palco.appendChild(areaParada); palco.appendChild(legenda);

    var bPrev = el("button", { type: "button", "aria-label": "Cena anterior (seta esquerda)", title: "Cena anterior (←)", text: "⏮" });
    var bPlay = el("button", { type: "button", class: "primario", "aria-label": "Tocar (espaço)", title: "Tocar ou pausar (espaço)", text: "▶" });
    var bNext = el("button", { type: "button", "aria-label": "Próxima cena (seta direita)", title: "Próxima cena (→)", text: "⏭" });
    var tempo = el("span", { class: "tempo", text: "0:00 / 0:00" });
    var selVel = el("select", { "aria-label": "Velocidade" });
    [0.75, 1, 1.25, 1.5].forEach(function (v) { var o = el("option", { value: v, text: v + "x" }); if (v === 1) o.selected = true; selVel.appendChild(o); });
    var bCC = el("button", { type: "button", title: "Legenda (C)", text: "CC" });
    var bTema = el("button", { type: "button", title: "Tema claro ou escuro", "aria-label": "Alternar tema", text: "◐" });
    var barra = el("div", { class: "barra", role: "slider", "aria-label": "Posição na aula", tabindex: "0" });
    var trilho = el("div", { class: "trilho" }), feito = el("div", { class: "feito" }), cabeca = el("div", { class: "cabeca" });
    barra.appendChild(trilho); barra.appendChild(feito); barra.appendChild(cabeca);
    var controles = el("div", { class: "controles" }, [bPrev, bPlay, bNext, tempo, el("span", { class: "espaco" }), selVel, bCC, bTema, barra]);
    var aviso = el("p", { class: "aviso-voz", hidden: "" });
    raiz.appendChild(palco); raiz.appendChild(controles); raiz.appendChild(aviso);

    // ---------- Tema ----------
    var tema = ls("get", "np-tema");
    if (tema) document.documentElement.setAttribute("data-theme", tema);
    bTema.addEventListener("click", function () {
      var escuro = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.getAttribute("data-theme") && g.matchMedia && g.matchMedia("(prefers-color-scheme: dark)").matches);
      var novo = escuro ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", novo);
      ls("set", "np-tema", novo);
    });

    // ---------- Carregamento ----------
    var api = {
      irPara: irPara, tocar: tocar_, pausar: pausar,
      get cena() { return cenas[idx] && cenas[idx].dados; },
      get resultados() { return resultados; }
    };
    function carregarJSON(url) { return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
    return carregarJSON(op.roteiro).then(function (r) {
      roteiro = r;
      chave = "np-aula-" + (roteiro.id || location.pathname);
      resultados = ls("get", chave + "-paradas") || {};
      return carregarJSON(op.cues).catch(function () { return { cenas: {} }; });
    }).then(function (c) {
      cues = c || { cenas: {} };
      montarCenas();
      montarTranscricao();
      montarPainel();
      var salvo = ls("get", chave + "-pos");
      irPara(salvo && salvo.cena < cenas.length ? salvo.cena : 0, salvo ? salvo.t : 0, false);
      if (!salvo) mostrarLegendaInicial();
      atualizarCC();
      return api;
    }).catch(function (e) {
      palco.innerHTML = "<p class='erro'>Não consegui carregar a aula (" + e.message + "). Abra pelo GitHub Pages ou por um servidor local.</p>";
    });

    function montarCenas() {
      var acc = 0;
      roteiro.cenas.forEach(function (c, i) {
        var cue = cues.cenas && cues.cenas[c.id];
        var temAudio = !!(cue && cue.audio && cue.duracao);
        var nPal = tokenizar(c.narracao).length;
        var dur = temAudio ? cue.duracao : nPal / 2.6;
        var ancoras = [], cur = 0;
        ((c.visual && c.visual.passos) || []).forEach(function (a) {
          var i2 = norm(c.narracao).indexOf(norm(a), cur);
          if (i2 < 0) { console.warn("Âncora não encontrada na cena " + c.id + ": " + a); i2 = cur; }
          ancoras.push(i2); cur = i2;
        });
        cenas.push({
          dados: c, dur: dur, inicio: acc, temAudio: temAudio,
          audio: temAudio ? cue.audio : null,
          palavras: temAudio ? alinhar(c.narracao, cue.palavras) : [],
          tokens: tokenizar(c.narracao), frases: frases(c.narracao), ancoras: ancoras
        });
        inicioCena.push(acc);
        acc += dur;
      });
      total = acc;
      cenas.forEach(function (c, i) {
        var m = el("div", { class: "marca", style: "left:" + (100 * c.inicio / total) + "%" });
        m.appendChild(el("span", { text: (i + 1) + ". " + c.dados.titulo }));
        barra.appendChild(m);
      });
      if (cenas.some(function (c) { return !c.temAudio; })) {
        aviso.hidden = false;
        aviso.textContent = g.NP && g.NP.Voice && g.NP.Voice.disponivel
          ? "Algumas cenas estão sem MP3: a narração usa a voz do navegador."
          : "Algumas cenas estão sem MP3 e o navegador não tem voz: a legenda avança sozinha.";
      }
    }

    // ---------- Cena ----------
    function vis() { return (op.visuais || {})[cenas[idx].dados.id]; }
    function montarVisual() {
      var v = vis();
      visual.innerHTML = "";
      passoAtual = -1;
      if (v && v.montar) v.montar(visual, api);
      else if (cenas[idx].dados.visual && cenas[idx].dados.visual.descricao) visual.appendChild(el("p", { class: "nota", text: cenas[idx].dados.visual.descricao }));
    }
    function atualizarPasso() {
      var c = cenas[idx], n = 0;
      c.ancoras.forEach(function (a) { if (posChar >= a) n++; });
      if (n !== passoAtual) {
        passoAtual = n;
        var v = vis();
        if (v && v.passo) v.passo(n, api);
      }
    }
    function sairVisual() { var v = vis(); if (v && v.sair) v.sair(); }

    function pararMidia() {
      audio.pause();
      if (falaVoz) { falaVoz.parar(); falaVoz = null; }
      if (relogio) { clearInterval(relogio); relogio = null; }
    }

    function irPara(i, t, tocar) {
      pararMidia();
      if (cenas[idx] && i !== idx) sairVisual();
      fecharParada();
      idx = Math.max(0, Math.min(cenas.length - 1, i));
      var c = cenas[idx];
      tituloCena.textContent = (idx + 1) + " de " + cenas.length + ". " + c.dados.titulo;
      montarVisual();
      modoAtual = c.temAudio ? "mp3" : (g.NP && g.NP.Voice && g.NP.Voice.disponivel ? "voz" : "relogio");
      t = Math.max(0, Math.min(t || 0, c.dur - 0.05));
      if (modoAtual === "mp3") {
        if (audio.getAttribute("data-src") !== c.audio) { audio.src = c.audio; audio.setAttribute("data-src", c.audio); }
        var aplicar = function () { try { audio.currentTime = t; } catch (e) {} audio.playbackRate = velocidade; };
        if (audio.readyState >= 1) aplicar(); else audio.addEventListener("loadedmetadata", aplicar, { once: true });
        posChar = charNoTempo(t);
      } else {
        posChar = 0; relogioBase = 0;
      }
      atualizarPasso();
      desenharLegenda();
      atualizarTempo(t);
      marcarTranscricao();
      if (tocar) tocar_();
      else setTocando(false);
      salvarPos(t);
    }

    function charNoTempo(t) {
      var p = cenas[idx].palavras, pos = 0;
      for (var k = 0; k < p.length; k++) { if (p[k].t <= t) pos = p[k].ini; else break; }
      if (p.length && t >= cenas[idx].dur - 0.1) pos = cenas[idx].dados.narracao.length;
      return pos;
    }
    function tempoLocal() {
      if (modoAtual === "mp3") return audio.currentTime || 0;
      var c = cenas[idx];
      return c.dur * (posChar / Math.max(1, c.dados.narracao.length));
    }

    function tocar_() {
      if (emParada) return;
      var c = cenas[idx];
      setTocando(true);
      if (modoAtual === "mp3") {
        audio.playbackRate = velocidade;
        var pr = audio.play();
        if (pr && pr.catch) pr.catch(function () {
          if (g.NP && g.NP.Voice && g.NP.Voice.disponivel) { modoAtual = "voz"; tocar_(); } else setTocando(false);
        });
      } else if (modoAtual === "voz") {
        if (falaVoz && falaVoz.pausado) { falaVoz.continuar(); return; }
        var texto = c.dados.narracao.slice(posChar);
        var base = posChar;
        falaVoz = g.NP.Voice.falar(texto, {
          rate: velocidade,
          aoAvancar: function (ci) { posChar = base + ci; atualizarPasso(); desenharLegenda(); atualizarTempo(tempoLocal()); },
          aoTerminar: function () { falaVoz = null; fimDaCena(); }
        });
      } else {
        relogioT0 = Date.now(); relogioBase = posChar;
        relogio = setInterval(function () {
          posChar = Math.min(c.dados.narracao.length, relogioBase + (Date.now() - relogioT0) / 1000 * 14 * velocidade);
          atualizarPasso(); desenharLegenda(); atualizarTempo(tempoLocal());
          if (posChar >= c.dados.narracao.length) { clearInterval(relogio); relogio = null; fimDaCena(); }
        }, 120);
      }
    }
    function pausar() {
      if (modoAtual === "mp3") audio.pause();
      else if (modoAtual === "voz" && falaVoz) falaVoz.pausar();
      else if (relogio) { clearInterval(relogio); relogio = null; }
      setTocando(false);
      salvarPos(tempoLocal());
    }
    function alternar() { if (emParada) return; if (tocando) pausar(); else tocar_(); }
    function setTocando(v) {
      tocando = v;
      bPlay.textContent = v ? "❚❚" : "▶";
      bPlay.setAttribute("aria-label", v ? "Pausar (espaço)" : "Tocar (espaço)");
    }

    audio.addEventListener("timeupdate", function () {
      if (modoAtual !== "mp3") return;
      posChar = charNoTempo(audio.currentTime);
      atualizarPasso(); desenharLegenda(); atualizarTempo(audio.currentTime);
      if (Math.random() < 0.1) salvarPos(audio.currentTime);
    });
    audio.addEventListener("ended", function () { if (modoAtual === "mp3") { posChar = cenas[idx].dados.narracao.length; atualizarPasso(); fimDaCena(); } });
    audio.addEventListener("error", function () {
      if (modoAtual === "mp3" && g.NP && g.NP.Voice && g.NP.Voice.disponivel) {
        cenas[idx].temAudio = false; modoAtual = "voz"; aviso.hidden = false;
        aviso.textContent = "O MP3 desta cena não carregou: a narração usa a voz do navegador.";
        if (tocando) tocar_();
      }
    });

    // ---------- Paradas ----------
    function fimDaCena() {
      setTocando(false);
      var c = cenas[idx], ps = c.dados.paradas || [];
      var k = 0;
      function proxima() {
        if (k >= ps.length) {
          fecharParada();
          if (idx < cenas.length - 1) irPara(idx + 1, 0, true);
          else { salvarPos(0, idx); concluir(); }
          return;
        }
        var p = ps[k];
        abrirParada();
        g.NP.Quiz.mostrar(areaParada, p, {
          aoRever: function (cenaId) {
            var r = resultados[p.id] || {}; r.errou = true; resultados[p.id] = r; salvarResultados();
            var alvo = cenas.findIndex(function (x) { return x.dados.id === cenaId; });
            irPara(alvo >= 0 ? alvo : idx, 0, true);
          }
        }).then(function (res) {
          var ant = resultados[p.id] || {};
          resultados[p.id] = { primeira: res.acertouDePrimeira && !ant.errou && !ant.respondida ? true : !!ant.primeira, respondida: true, errou: ant.errou || !res.acertouDePrimeira };
          salvarResultados();
          montarPainel();
          k++; proxima();
        });
      }
      proxima();
    }
    function abrirParada() {
      emParada = true; visual.hidden = true; legenda.hidden = true; areaParada.hidden = false;
      bPlay.disabled = true;
    }
    function fecharParada() {
      emParada = false; visual.hidden = false; areaParada.hidden = true; areaParada.innerHTML = "";
      bPlay.disabled = false; atualizarCC();
    }
    function salvarResultados() { ls("set", chave + "-paradas", resultados); }
    function concluir() {
      montarPainel();
      if (op.painel) op.painel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // ---------- Legenda ----------
    function mostrarLegendaInicial() {
      legenda.innerHTML = "<span class='nota'>Aperte ▶ ou a barra de espaço para começar.</span>";
    }
    function desenharLegenda() {
      var c = cenas[idx], txt = c.dados.narracao;
      var f = c.frases.find(function (fr) { return posChar >= fr.ini && posChar < fr.fim; }) || c.frases[c.frases.length - 1];
      if (!f) return;
      var html = "", cursor = f.ini;
      c.tokens.forEach(function (tk) {
        if (tk.ini < f.ini || tk.fim > f.fim) return;
        html += esc(txt.slice(cursor, tk.ini));
        var cls = tk.ini <= posChar && posChar < tk.fim + 1 ? "w agora" : (tk.fim <= posChar ? "w dita" : "w");
        html += "<span class='" + cls + "'>" + esc(txt.slice(tk.ini, tk.fim)) + "</span>";
        cursor = tk.fim;
      });
      html += esc(txt.slice(cursor, f.fim));
      legenda.innerHTML = html;
    }
    function esc(s) { return s.replace(/[&<>]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]; }); }
    function atualizarCC() {
      legenda.hidden = !legendaOn || emParada;
      bCC.setAttribute("aria-pressed", legendaOn ? "true" : "false");
      bCC.setAttribute("aria-label", legendaOn ? "Desligar legenda (C)" : "Ligar legenda (C)");
    }
    bCC.addEventListener("click", function () { legendaOn = !legendaOn; ls("set", "np-legenda", legendaOn); atualizarCC(); });

    // ---------- Tempo e barra ----------
    function atualizarTempo(tLocal) {
      var tg = cenas[idx].inicio + (tLocal || 0);
      tempo.textContent = mmss(tg) + " / " + mmss(total);
      var pct = total ? (100 * tg / total) : 0;
      feito.style.width = pct + "%"; cabeca.style.left = pct + "%";
      barra.setAttribute("aria-valuenow", Math.round(pct));
    }
    function salvarPos(t, i) { ls("set", chave + "-pos", { cena: i == null ? idx : i, t: t || 0 }); }
    function buscar(ev) {
      var r = barra.getBoundingClientRect();
      var tg = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * total;
      var i = 0;
      for (var k = 0; k < cenas.length; k++) if (cenas[k].inicio <= tg) i = k;
      var tl = tg - cenas[i].inicio;
      irPara(i, cenas[i].temAudio ? tl : 0, tocando);
    }
    barra.addEventListener("click", buscar);
    barra.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); irPara(idx + (e.key === "ArrowLeft" ? -1 : 1), 0, tocando); }
    });

    bPlay.addEventListener("click", alternar);
    bPrev.addEventListener("click", function () { irPara(tempoLocal() > 3 ? idx : idx - 1, 0, tocando); });
    bNext.addEventListener("click", function () { irPara(idx + 1, 0, tocando); });
    selVel.addEventListener("change", function () {
      velocidade = parseFloat(selVel.value);
      audio.playbackRate = velocidade;
      if (modoAtual === "voz" && tocando && falaVoz) { falaVoz.parar(); falaVoz = null; tocar_(); }
      if (modoAtual === "relogio" && relogio) { relogioBase = posChar; relogioT0 = Date.now(); }
    });

    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === " " || e.code === "Space") {
        if (tag === "BUTTON" || (e.target && e.target.getAttribute && e.target.getAttribute("role") === "button")) return;
        e.preventDefault(); alternar();
      } else if (e.key === "ArrowRight" && !emParada) { e.preventDefault(); irPara(idx + 1, 0, tocando); }
      else if (e.key === "ArrowLeft" && !emParada) { e.preventDefault(); irPara(idx - 1, 0, tocando); }
      else if (e.key === "c" || e.key === "C") { legendaOn = !legendaOn; ls("set", "np-legenda", legendaOn); atualizarCC(); }
    });

    // ---------- Transcrição e painel ----------
    function montarTranscricao() {
      if (!op.transcricao) return;
      op.transcricao.innerHTML = "";
      cenas.forEach(function (c, i) {
        var bloco = el("div", { class: "cena-trans", "data-i": i });
        var h = el("h3", { text: (i + 1) + ". " + c.dados.titulo, tabindex: "0", role: "button", title: "Ir para esta cena" });
        h.addEventListener("click", function () { irPara(i, 0, false); raiz.scrollIntoView({ behavior: "smooth" }); });
        h.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); h.click(); } });
        bloco.appendChild(h);
        bloco.appendChild(el("p", { text: c.dados.narracao }));
        op.transcricao.appendChild(bloco);
      });
    }
    function marcarTranscricao() {
      if (!op.transcricao) return;
      Array.prototype.forEach.call(op.transcricao.querySelectorAll(".cena-trans"), function (b) {
        b.classList.toggle("atual", +b.getAttribute("data-i") === idx);
      });
    }
    function todasParadas() {
      var out = [];
      cenas.forEach(function (c) { (c.dados.paradas || []).forEach(function (p) { out.push({ p: p, cena: c }); }); });
      return out;
    }
    function montarPainel() {
      if (!op.painel) return;
      var lista = todasParadas();
      var acertos = lista.filter(function (x) { return resultados[x.p.id] && resultados[x.p.id].primeira; }).length;
      var respondidas = lista.filter(function (x) { return resultados[x.p.id] && resultados[x.p.id].respondida; }).length;
      var html = "<p>Paradas acertadas de primeira: <strong>" + acertos + " de " + lista.length + "</strong>.</p><ol>";
      lista.forEach(function (x) {
        var r = resultados[x.p.id];
        var st = !r || !r.respondida ? "<span class='nota'>ainda não respondida</span>"
          : r.primeira ? "<span class='ok'>de primeira</span>" : "<span class='erro'>depois de errar</span>";
        html += "<li>" + (x.p.resumo || x.p.id) + ": " + st + "</li>";
      });
      html += "</ol>";
      var f = roteiro.fechamento || {};
      if (respondidas === lista.length && lista.length) {
        html += acertos === lista.length
          ? "<p class='cartao'>" + (f.seguir || "Você acertou tudo de primeira. Pode seguir para a próxima aula.") + "</p>"
          : "<p class='cartao'>" + (f.reforcar || "Algumas paradas exigiram segunda tentativa. Sugestão: reforçar este tópico antes de avançar.") + "</p>";
      }
      html += "<div class='acoes'><button type='button' id='np-zerar'>Zerar meus resultados</button></div>";
      op.painel.innerHTML = html;
      op.painel.querySelector("#np-zerar").addEventListener("click", function () { resultados = {}; salvarResultados(); montarPainel(); });
    }

  }

  g.NP = g.NP || {};
  g.NP.Player = { iniciar: iniciar, _alinhar: alinhar, _tokenizar: tokenizar };
})(window);
