/* voice.js: plano B de narração pela Web Speech API.
   Usado quando o MP3 da cena não existe (o serviço do Edge não respondeu na
   geração). Prioriza vozes pt-BR com "Natural" no nome, como
   "Microsoft Francisca Online (Natural)". Fala frase a frase (evita o corte
   de falas longas em alguns navegadores) e informa a posição do caractere
   pelo evento boundary, para a legenda acompanhar. */
(function (g) {
  "use strict";
  var synth = g.speechSynthesis;
  var vozEscolhida = null;

  function escolherVoz() {
    if (!synth) return null;
    var vozes = synth.getVoices();
    function p(f) { return vozes.filter(f)[0] || null; }
    var br = function (v) { return /^pt[-_]BR/i.test(v.lang); };
    vozEscolhida =
      p(function (v) { return br(v) && /Francisca/i.test(v.name) && /Natural/i.test(v.name); }) ||
      p(function (v) { return br(v) && /Natural/i.test(v.name); }) ||
      p(br) ||
      p(function (v) { return /^pt/i.test(v.lang); });
    return vozEscolhida;
  }
  if (synth) {
    escolherVoz();
    if (typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", escolherVoz);
  }

  function frases(texto) {
    var out = [], re = /[^.!?]+[.!?]*\s*/g, m;
    while ((m = re.exec(texto))) if (m[0].trim()) out.push({ ini: m.index, txt: m[0] });
    return out.length ? out : [{ ini: 0, txt: texto }];
  }

  /* falar(texto, {rate, aoAvancar(charIndex), aoTerminar()}) -> controle */
  function falar(texto, op) {
    op = op || {};
    var lista = frases(texto), i = 0, parado = false, pausado = false;
    function proxima() {
      if (parado) return;
      if (i >= lista.length) { if (op.aoTerminar) op.aoTerminar(); return; }
      var f = lista[i];
      var u = new SpeechSynthesisUtterance(f.txt);
      u.lang = "pt-BR";
      if (vozEscolhida || escolherVoz()) u.voice = vozEscolhida;
      u.rate = op.rate || 1;
      u.onboundary = function (e) { if (op.aoAvancar && e.name !== "sentence") op.aoAvancar(f.ini + e.charIndex); };
      u.onend = function () { if (op.aoAvancar) op.aoAvancar(f.ini + f.txt.length); i++; proxima(); };
      u.onerror = function (e) { if (e.error !== "interrupted" && e.error !== "canceled") { i++; proxima(); } };
      synth.speak(u);
    }
    synth.cancel();
    proxima();
    return {
      pausar: function () { pausado = true; synth.pause(); },
      continuar: function () { pausado = false; synth.resume(); },
      parar: function () { parado = true; synth.cancel(); },
      get pausado() { return pausado; }
    };
  }

  g.NP = g.NP || {};
  g.NP.Voice = {
    get disponivel() { return !!synth && synth.getVoices().length > 0; },
    falar: falar,
    nomeDaVoz: function () { var v = vozEscolhida || escolherVoz(); return v ? v.name : null; }
  };
})(window);
