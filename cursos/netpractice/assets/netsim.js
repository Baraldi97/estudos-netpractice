/* netsim.js: mini simulador no estilo NetPractice, escrito para o curso.
   Regras reproduzidas da mecânica da interface oficial (sem copiar código):
   - IP de interface: 4 octetos, primeiro octeto de 1 a 223, nunca 127,
     nunca o endereço de rede nem o broadcast da própria máscara.
   - Máscara em /n ou decimal com pontos, bits 1 contíguos.
   - Switch não tem IP: repassa o pacote para todos os enlaces.
   - Ao chegar numa máquina, o pacote só é aceito se o IP da interface de
     entrada for o alvo do salto (o destino final ou o gateway da rota).
   - Na saída: se o destino cabe na sub-rede de exatamente uma interface,
     sai por ela. Senão, consulta a tabela de rotas NA ORDEM e usa só a
     PRIMEIRA rota que casa (não a mais específica). O gateway precisa
     estar na sub-rede de uma interface.
   - "default" equivale a 0.0.0.0/0. A Internet não aceita rota default e
     descarta destinos privados (10/8, 172.16/12, 192.168/16).
   - Cada objetivo exige ida e volta.

   Formato da rede:
   { nos: [{id, tipo:'host'|'router'|'switch'|'internet', nome, x, y}],
     ifs: [{id, no, ip, mascara, editIp, editMascara}],
     enlaces: [[ifA, ifB]],
     rotas: [{id, no, destino, gateway, editDestino, editGateway}],
     objetivos: [{de: noId, para: noId}] }
*/
(function (g) {
  "use strict";

  // ---------- Endereços ----------
  function ipToInt(s) {
    if (typeof s !== "string") return null;
    var p = s.trim().split(".");
    if (p.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(p[i])) return null;
      var v = +p[i];
      if (v > 255) return null;
      n = n * 256 + v;
    }
    return n >>> 0;
  }
  function intToIp(n) {
    n = n >>> 0;
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }
  function maskFromBits(b) { return b === 0 ? 0 : ((0xFFFFFFFF << (32 - b)) >>> 0); }
  /* "/26" ou "255.255.255.192" -> {bits, mask} ou null */
  function parseMask(s) {
    if (typeof s !== "string") return null;
    s = s.trim();
    if (s[0] === "/") {
      if (!/^\/\d{1,2}$/.test(s)) return null;
      var b = +s.slice(1);
      if (b > 32) return null;
      return { bits: b, mask: maskFromBits(b) };
    }
    var m = ipToInt(s);
    if (m === null) return null;
    var inv = (~m) >>> 0;
    if ((inv & (inv + 1)) !== 0) return null; // 1s não contíguos
    var bits = 0;
    for (var k = 31; k >= 0; k--) { if ((m >>> k) & 1) bits++; else break; }
    return { bits: bits, mask: m };
  }
  function rede(ip, mask) { return (ip & mask) >>> 0; }
  function broadcast(ip, mask) { return ((ip & mask) | (~mask >>> 0)) >>> 0; }
  function mesmaSubrede(a, b, mask) { return rede(a, mask) === rede(b, mask); }
  function hostsUteis(bits) { return bits >= 31 ? 0 : Math.pow(2, 32 - bits) - 2; }
  function toBin(n, largura) {
    var s = (n >>> 0).toString(2);
    largura = largura || 32;
    while (s.length < largura) s = "0" + s;
    return s.slice(-largura);
  }
  function privado(ip) {
    return rede(ip, maskFromBits(8)) === ipToInt("10.0.0.0") ||
      rede(ip, maskFromBits(12)) === ipToInt("172.16.0.0") ||
      rede(ip, maskFromBits(16)) === ipToInt("192.168.0.0");
  }
  /* Motivo pelo qual um IP não serve numa interface, ou null se serve. */
  function problemaIp(ipStr, maskStr) {
    var ip = ipToInt(ipStr);
    if (ip === null) return "IP mal formado";
    var o1 = ip >>> 24;
    if (o1 === 127) return "127.x.x.x é loopback";
    if (o1 === 0 || o1 > 223) return "primeiro octeto fora de 1 a 223";
    var m = parseMask(maskStr);
    if (!m) return "máscara inválida";
    if (m.bits >= 31) return "máscara /" + m.bits + " não deixa IP utilizável aqui";
    if (ip === rede(ip, m.mask)) return "é o endereço de rede";
    if (ip === broadcast(ip, m.mask)) return "é o endereço de broadcast";
    return null;
  }
  function parseRota(s) {
    if (typeof s !== "string") return null;
    s = s.trim();
    if (s === "default") s = "0.0.0.0/0";
    var p = s.split("/");
    if (p.length !== 2) return null;
    var ip = ipToInt(p[0]);
    var m = parseMask("/" + p[1]);
    if (ip === null || !m) return null;
    return { ip: ip, mask: m.mask, bits: m.bits, padrao: m.bits === 0 };
  }

  // ---------- Simulação ----------
  function Sim(net) {
    this.net = net;
    this.log = [];
  }
  Sim.prototype.no = function (id) { return this.net.nos.find(function (n) { return n.id === id; }); };
  Sim.prototype.ifsDe = function (noId) { return this.net.ifs.filter(function (i) { return i.no === noId; }); };
  Sim.prototype.vizinhos = function (ifId) {
    var out = [];
    this.net.enlaces.forEach(function (e) {
      if (e[0] === ifId) out.push(e[1]);
      else if (e[1] === ifId) out.push(e[0]);
    });
    var self = this;
    return out.map(function (id) { return self.net.ifs.find(function (i) { return i.id === id; }); });
  };
  Sim.prototype.ipValido = function (itf) {
    if (problemaIp(itf.ip, itf.mascara)) return null;
    return ipToInt(itf.ip);
  };
  Sim.prototype.L = function (s) { this.log.push(s); };

  /* devolve a lista de interfaces onde o pacote chegou */
  Sim.prototype.passo = function (dst, alvo, inItf, no, visitados) {
    var self = this;
    if (visitados.indexOf(no.id) >= 0) { this.L(no.nome + ": loop detectado"); return []; }
    visitados.push(no.id);

    if (no.tipo === "switch") {
      var r = [];
      this.ifsDe(no.id).forEach(function (si) {
        if (inItf && si.id === inItf.id) return;
        self.vizinhos(si.id).forEach(function (viz) {
          if (!viz) return;
          r = r.concat(self.passo(dst, alvo, viz, self.no(viz.no), visitados));
        });
      });
      return r;
    }

    if (inItf) {
      var ipIn = this.ipValido(inItf);
      if (ipIn === null) { this.L(no.nome + ": IP inválido na interface " + inItf.id + " (" + problemaIp(inItf.ip, inItf.mascara) + ")"); return []; }
      if (ipIn !== alvo) { this.L(no.nome + ": pacote não é para mim (" + inItf.ip + " ≠ " + intToIp(alvo) + ")"); return []; }
    }
    if (no.tipo === "internet" && privado(dst)) {
      this.L(no.nome + ": destino privado não é roteado na Internet"); return [];
    }
    if (inItf) {
      var achou = this.ifsDe(no.id).filter(function (i) { return self.ipValido(i) === dst; });
      if (achou.length) { this.L(no.nome + ": destino alcançado"); return achou; }
    }

    // Destino numa rede diretamente ligada?
    var saidas = [];
    var ifs = this.ifsDe(no.id);
    for (var k = 0; k < ifs.length; k++) {
      var it = ifs[k];
      var ip = this.ipValido(it), m = parseMask(it.mascara);
      if (ip === null || !m) continue;
      if (ip === dst) { this.L(no.nome + ": IP duplicado " + it.ip); return []; }
      if (mesmaSubrede(ip, dst, m.mask)) saidas.push(it);
    }
    if (saidas.length > 1) { this.L(no.nome + ": destino cabe em mais de uma interface"); return []; }
    if (saidas.length === 1) {
      this.L(no.nome + ": destino na rede da interface " + saidas[0].id + ", envia direto");
      return this.enviar(saidas[0], dst, dst, visitados);
    }

    // Tabela de rotas: primeira que casa
    var rotas = this.net.rotas.filter(function (r) { return r.no === no.id; });
    for (var j = 0; j < rotas.length; j++) {
      var rt = parseRota(rotas[j].destino);
      if (!rt) { this.L(no.nome + ": rota inválida \"" + rotas[j].destino + "\""); continue; }
      if (no.tipo === "internet" && rt.padrao) { this.L(no.nome + ": a Internet não aceita rota default"); continue; }
      if (rede(dst, rt.mask) !== rede(rt.ip, rt.mask)) continue;
      this.L(no.nome + ": rota " + rotas[j].destino + " casa, next hop " + rotas[j].gateway);
      var gw = ipToInt(rotas[j].gateway);
      if (gw === null) { this.L(no.nome + ": next hop inválido"); return []; }
      var porta = ifs.filter(function (i) {
        var a = self.ipValido(i), mm = parseMask(i.mascara);
        return a !== null && mm && a !== gw && mesmaSubrede(a, gw, mm.mask);
      });
      if (porta.length !== 1) { this.L(no.nome + ": nenhuma interface na rede do next hop " + rotas[j].gateway); return []; }
      return this.enviar(porta[0], dst, gw, visitados);
    }
    this.L(no.nome + ": nenhuma rota para " + intToIp(dst));
    return [];
  };
  Sim.prototype.enviar = function (saida, dst, alvo, visitados) {
    var self = this, r = [];
    this.vizinhos(saida.id).forEach(function (viz) {
      if (!viz) return;
      r = r.concat(self.passo(dst, alvo, viz, self.no(viz.no), visitados));
    });
    if (!r.length && !this.vizinhos(saida.id).length) this.L("interface " + saida.id + " não tem enlace");
    return r;
  };
  Sim.prototype.ipDoNo = function (noId) {
    var ifs = this.ifsDe(noId);
    for (var i = 0; i < ifs.length; i++) { var ip = this.ipValido(ifs[i]); if (ip !== null) return ip; }
    return null;
  };
  Sim.prototype.sentido = function (deId, paraId, rotulo) {
    var dst = this.ipDoNo(paraId);
    var de = this.no(deId), para = this.no(paraId);
    this.L(rotulo + ": " + de.nome + " → " + para.nome);
    if (dst === null) { this.L(para.nome + " não tem IP válido"); return false; }
    var r = this.passo(dst, null, null, de, []);
    if (r.length !== 1) { if (r.length > 1) this.L("mais de uma máquina respondeu"); return false; }
    return r[0].no === paraId;
  };
  Sim.prototype.objetivo = function (o) {
    var ida = this.sentido(o.de, o.para, "Ida");
    if (!ida) return { ok: false, falha: "ida" };
    var volta = this.sentido(o.para, o.de, "Volta");
    if (!volta) return { ok: false, falha: "volta" };
    return { ok: true };
  };
  function verificar(net) {
    var s = new Sim(net);
    var res = net.objetivos.map(function (o) { return s.objetivo(o); });
    return { resultados: res, ok: res.every(function (r) { return r.ok; }), log: s.log };
  }

  // ---------- Desenho ----------
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
  function svgEl(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  var TIPO = { host: "host", router: "router", switch: "switch", internet: "Internet" };

  /* Desenha a rede editável. Devolve {verificar(), rede}.
     opcoes.aoMudar(resultado) é chamado a cada verificação. */
  function render(container, net, opcoes) {
    opcoes = opcoes || {};
    net = JSON.parse(JSON.stringify(net));
    container.innerHTML = "";
    container.classList.add("netsim");
    var W = 600, H = 260;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Topologia da rede" });
    function pos(no) { return { x: 40 + (no.x / 100) * (W - 80), y: 30 + (no.y / 100) * (H - 70) }; }
    net.enlaces.forEach(function (e) {
      var a = net.ifs.find(function (i) { return i.id === e[0]; });
      var b = net.ifs.find(function (i) { return i.id === e[1]; });
      var pa = pos(net.nos.find(function (n) { return n.id === a.no; }));
      var pb = pos(net.nos.find(function (n) { return n.id === b.no; }));
      svg.appendChild(svgEl("line", { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, class: "link" }));
    });
    var rotulosIp = {};
    net.nos.forEach(function (no) {
      var p = pos(no), gr = svgEl("g", { class: "no" });
      if (no.tipo === "router") gr.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: 16 }));
      else if (no.tipo === "switch") gr.appendChild(svgEl("rect", { x: p.x - 20, y: p.y - 10, width: 40, height: 20, rx: 2 }));
      else if (no.tipo === "internet") gr.appendChild(svgEl("ellipse", { cx: p.x, cy: p.y, rx: 30, ry: 16, fill: "var(--bg)", stroke: "var(--fg)", "stroke-width": 1.5 }));
      else gr.appendChild(svgEl("rect", { x: p.x - 14, y: p.y - 14, width: 28, height: 28, rx: 3 }));
      var t = svgEl("text", { x: p.x, y: p.y + 32, "text-anchor": "middle" });
      t.textContent = no.nome;
      gr.appendChild(t);
      var ti = svgEl("text", { x: p.x, y: p.y + 46, "text-anchor": "middle", class: "ip" });
      gr.appendChild(ti);
      rotulosIp[no.id] = ti;
      svg.appendChild(gr);
    });
    container.appendChild(svg);

    var objs = el("ul", { class: "objetivos" });
    var nos = el("div", { class: "nos" });
    net.nos.forEach(function (no) {
      var ifs = net.ifs.filter(function (i) { return i.no === no.id; });
      var rotas = net.rotas.filter(function (r) { return r.no === no.id; });
      if (no.tipo === "switch" && !rotas.length) return;
      var card = el("div", { class: "no-card" }, [el("h4", { html: "<i>" + TIPO[no.tipo] + "</i> " + no.nome })]);
      ifs.forEach(function (itf) {
        if (no.tipo === "switch") return;
        var box = el("div", { class: "itf" });
        box.appendChild(el("span", { class: "nota", text: "interface " + itf.id }));
        box.appendChild(el("span"));
        [["ip", "IP", "editIp"], ["mascara", "Mask", "editMascara"]].forEach(function (c) {
          box.appendChild(el("label", { text: c[1], for: "ns-" + itf.id + "-" + c[0] }));
          var inp = el("input", { type: "text", id: "ns-" + itf.id + "-" + c[0], value: itf[c[0]] || "", autocomplete: "off", spellcheck: "false", inputmode: "decimal" });
          if (!itf[c[2]]) inp.disabled = true;
          inp.addEventListener("input", function () { itf[c[0]] = inp.value; atualizarRotulos(); });
          box.appendChild(inp);
        });
        card.appendChild(box);
      });
      if (rotas.length) {
        card.appendChild(el("div", { class: "nota", text: "Routes (destino => next hop)" }));
        rotas.forEach(function (r) {
          var linha = el("div", { class: "rota" });
          [["destino", "editDestino"], ["gateway", "editGateway"]].forEach(function (c, idx) {
            var inp = el("input", { type: "text", value: r[c[0]] || "", "aria-label": c[0], autocomplete: "off", spellcheck: "false" });
            if (!r[c[1]]) inp.disabled = true;
            inp.addEventListener("input", function () { r[c[0]] = inp.value; });
            linha.appendChild(inp);
            if (idx === 0) linha.appendChild(el("span", { text: "=>" }));
          });
          card.appendChild(linha);
        });
      }
      nos.appendChild(card);
    });
    var log = el("div", { class: "log", "aria-live": "polite" });
    var botao = el("button", { type: "button", text: "Check again" });
    container.appendChild(el("p", { class: "nota", text: "Objetivos" }));
    container.appendChild(objs);
    container.appendChild(nos);
    container.appendChild(el("div", { class: "acoes" }, [botao]));
    container.appendChild(log);

    function atualizarRotulos() {
      net.nos.forEach(function (no) {
        var ips = net.ifs.filter(function (i) { return i.no === no.id && i.ip; }).map(function (i) { return i.ip; });
        rotulosIp[no.id].textContent = no.tipo === "switch" ? "" : ips.join("  ");
      });
    }
    function nome(id) { return net.nos.find(function (n) { return n.id === id; }).nome; }
    function checar() {
      var r = verificar(net);
      objs.innerHTML = "";
      net.objetivos.forEach(function (o, i) {
        var ok = r.resultados[i].ok;
        objs.appendChild(el("li", { html: nome(o.de) + " precisa falar com " + nome(o.para) + ": <span class='" + (ok ? "ok" : "erro") + "'>" +
          (ok ? "OK" : "KO, falha na " + r.resultados[i].falha) + "</span>" }));
      });
      log.textContent = r.log.join("\n");
      if (opcoes.aoMudar) opcoes.aoMudar(r);
      return r;
    }
    botao.addEventListener("click", checar);
    atualizarRotulos();
    net.objetivos.forEach(function (o) { objs.appendChild(el("li", { text: nome(o.de) + " precisa falar com " + nome(o.para) })); });
    return { verificar: checar, rede: net };
  }

  var API = {
    ipToInt: ipToInt, intToIp: intToIp, parseMask: parseMask, maskFromBits: maskFromBits,
    rede: rede, broadcast: broadcast, mesmaSubrede: mesmaSubrede, hostsUteis: hostsUteis,
    toBin: toBin, privado: privado, problemaIp: problemaIp, parseRota: parseRota,
    verificar: verificar, render: render
  };
  g.NP = g.NP || {};
  g.NP.NetSim = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
