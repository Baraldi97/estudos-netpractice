/* quiz.js: paradas interativas das aulas.
   NP.Quiz.mostrar(container, parada, {aoRever}) -> Promise<{acertouDePrimeira}>
   Tipos:
   - escolha: {opcoes:[...], correta, porque:[...]?, formato:'tabela'?, cabecalho?, linhas?}
   - campos:  {campos:[{rotulo, resposta, tipo:'ip'|'numero'|'binario'|'cidr'|'texto'}]}
   - bits:    {n, inicial, alvo (string de bits) | alvoDecimal, mostrarDecimal, modo:'mascara'?}
   - netsim:  {rede} (precisa de netsim.js)
   Campos comuns: pergunta (HTML), explicacao (HTML, mostrada no acerto),
   dica (HTML, mostrada no erro), cena (id da cena para rever). */
(function (g) {
  "use strict";
  var NS = function () { return g.NP && g.NP.NetSim; };

  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (filhos || []).forEach(function (f) { if (f) e.appendChild(f); });
    return e;
  }

  function normalizar(valor, tipo) {
    var v = String(valor == null ? "" : valor).trim();
    if (tipo === "ip") { var n = NS() ? NS().ipToInt(v) : null; return n === null ? "?" + v : String(n); }
    if (tipo === "numero") { v = v.replace(/\s|\./g, ""); return /^-?\d+$/.test(v) ? String(parseInt(v, 10)) : "?" + v; }
    if (tipo === "binario") { v = v.replace(/[\s.]/g, ""); return /^[01]+$/.test(v) ? v : "?" + v; }
    if (tipo === "cidr") {
      var m = NS() ? NS().parseMask(v[0] === "/" || v.indexOf(".") >= 0 ? v : "/" + v) : null;
      return m ? String(m.bits) : "?" + v;
    }
    return v.toLowerCase().replace(/\s+/g, " ");
  }

  function mostrar(container, p, op) {
    op = op || {};
    return new Promise(function (resolve) {
      var tentativas = 0, resolvido = false;
      container.innerHTML = "";
      var raiz = el("div", { class: "parada", role: "group", "aria-label": "Parada" });
      raiz.appendChild(el("p", { class: "rotulo", text: "Sua vez" }));
      raiz.appendChild(el("div", { class: "pergunta", html: p.pergunta }));
      var corpo = el("div");
      var fb = el("div", { "aria-live": "polite" });
      raiz.appendChild(corpo);
      raiz.appendChild(fb);
      container.appendChild(raiz);

      function feedback(certo, html) {
        fb.innerHTML = "";
        var box = el("div", { class: "feedback " + (certo ? "certo" : "errado") });
        box.appendChild(el("div", { html: "<strong>" + (certo ? "Isso." : "Ainda não.") + "</strong> " + (html || "") }));
        fb.appendChild(box);
        var acoes = el("div", { class: "acoes" });
        if (certo) {
          var seguir = el("button", { type: "button", class: "primario", text: "Continuar", onclick: function () {
            resolve({ acertouDePrimeira: tentativas === 1, tentativas: tentativas });
          } });
          acoes.appendChild(seguir);
          fb.appendChild(acoes);
          seguir.focus();
        } else {
          if (p.cena && op.aoRever) acoes.appendChild(el("button", { type: "button", text: "Rever a cena", onclick: function () { op.aoRever(p.cena); } }));
          acoes.appendChild(el("button", { type: "button", text: "Tentar de novo", onclick: function () { fb.innerHTML = ""; limpar(); } }));
          fb.appendChild(acoes);
        }
      }
      function registrar(certo, html) {
        if (resolvido) return;
        tentativas++;
        if (certo) resolvido = true;
        feedback(certo, html);
      }
      var limpar = function () {};

      if (p.tipo === "escolha") {
        var botoes = [];
        var marcar = function (i, b) {
          if (resolvido) return;
          var certo = i === p.correta;
          b.classList.add(certo ? "marcada-certa" : "marcada-errada");
          var porque = p.porque && p.porque[i] ? p.porque[i] + " " : "";
          registrar(certo, certo ? (porque + (p.explicacao || "")) : (porque || p.dica || ""));
        };
        if (p.formato === "tabela") {
          var tab = el("table", { class: "dados" });
          if (p.cabecalho) tab.appendChild(el("tr", {}, p.cabecalho.map(function (h) { return el("th", { text: h }); })));
          p.linhas.forEach(function (lin, i) {
            var tr = el("tr", { class: "clicavel", tabindex: "0", role: "button" }, lin.map(function (c) { return el("td", { text: c }); }));
            var f = function () { marcar(i, tr); };
            tr.addEventListener("click", f);
            tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f(); } });
            botoes.push(tr);
            tab.appendChild(tr);
          });
          corpo.appendChild(tab);
        } else {
          var ul = el("ul", { class: "opcoes" });
          p.opcoes.forEach(function (o, i) {
            var b = el("button", { type: "button", html: o });
            b.addEventListener("click", function () { marcar(i, b); });
            botoes.push(b);
            ul.appendChild(el("li", {}, [b]));
          });
          corpo.appendChild(ul);
        }
        limpar = function () { botoes.forEach(function (b) { b.classList.remove("marcada-certa", "marcada-errada"); }); };
      } else if (p.tipo === "campos") {
        var grade = el("div", { class: "campos" });
        var inputs = p.campos.map(function (c, i) {
          var inp = el("input", { type: "text", class: "mono", autocomplete: "off", spellcheck: "false", inputmode: c.tipo === "texto" ? "text" : "decimal", "aria-label": c.rotulo, id: "campo-" + (p.id || "p") + "-" + i });
          grade.appendChild(el("label", { for: inp.id }, [el("span", { html: c.rotulo }), inp]));
          return inp;
        });
        var conferir = el("button", { type: "button", class: "primario", text: "Conferir" });
        corpo.appendChild(grade);
        corpo.appendChild(el("div", { class: "acoes" }, [conferir]));
        var checar = function () {
          var todos = true;
          p.campos.forEach(function (c, i) {
            var ok = normalizar(inputs[i].value, c.tipo) === normalizar(c.resposta, c.tipo);
            inputs[i].classList.toggle("certo", ok);
            inputs[i].classList.toggle("errado", !ok);
            if (!ok) todos = false;
          });
          registrar(todos, todos ? p.explicacao : p.dica);
        };
        conferir.addEventListener("click", checar);
        inputs.forEach(function (inp) { inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); checar(); } }); });
        limpar = function () { inputs.forEach(function (i) { i.classList.remove("certo", "errado"); }); if (inputs[0]) inputs[0].focus(); };
        setTimeout(function () { if (inputs[0]) inputs[0].focus(); }, 50);
      } else if (p.tipo === "bits") {
        var n = p.n || 8, estado = (p.inicial || new Array(n + 1).join("0")).split("").map(Number);
        var linha = el("div", { class: "bits", style: "margin-bottom:1rem" });
        var dec = el("div", { class: "mono", style: "margin:.2rem 0 1rem" });
        var botoesBit = [];
        function desenhar() {
          botoesBit.forEach(function (b, i) {
            var v = estado[i];
            b.textContent = v;
            b.className = "bit " + (p.modo === "mascara" ? (v ? "r" : "h") : (v ? "um" : "zero"));
            b.setAttribute("aria-pressed", v ? "true" : "false");
          });
          if (p.mostrarDecimal !== false) {
            var partes = [];
            for (var o = 0; o < n; o += 8) partes.push(parseInt(estado.slice(o, o + 8).join(""), 2));
            dec.textContent = "decimal: " + partes.join(".");
          }
        }
        for (var o = 0; o < n; o += 8) {
          var oct = el("div", { class: "octeto" });
          var pesos = el("div", { class: "linha" });
          var bs = el("div", { class: "linha" });
          for (var k = 0; k < 8; k++) {
            (function (idx, peso) {
              pesos.appendChild(el("span", { class: "peso", text: String(peso) }));
              var b = el("button", { type: "button", class: "bit", "aria-label": "bit de peso " + peso });
              b.addEventListener("click", function () { if (resolvido) return; estado[idx] = 1 - estado[idx]; desenhar(); });
              botoesBit.push(b);
              bs.appendChild(b);
            })(o + k, Math.pow(2, 7 - k));
          }
          if (n === 8 || p.pesos) oct.appendChild(pesos);
          oct.appendChild(bs);
          linha.appendChild(oct);
        }
        corpo.appendChild(linha);
        corpo.appendChild(dec);
        var conf = el("button", { type: "button", class: "primario", text: "Conferir" });
        corpo.appendChild(el("div", { class: "acoes" }, [conf]));
        conf.addEventListener("click", function () {
          var s = estado.join("");
          var alvo = p.alvo || (p.alvoDecimal != null ? NS().toBin(p.alvoDecimal, n) : "");
          registrar(s === alvo, s === alvo ? p.explicacao : p.dica);
        });
        desenhar();
      } else if (p.tipo === "netsim") {
        var area = el("div");
        corpo.appendChild(area);
        NS().render(area, p.rede, { aoMudar: function (r) { registrar(r.ok, r.ok ? p.explicacao : p.dica); } });
      }
    });
  }

  g.NP = g.NP || {};
  g.NP.Quiz = { mostrar: mostrar, normalizar: normalizar };
})(window);
