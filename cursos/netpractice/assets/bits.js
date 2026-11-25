/* bits.js: componentes visuais de bits para as aulas.
   Cores fixas do curso: classe "r" = bit de rede, "h" = bit de host.
   NP.Bits.colunas(ip, prefixo, op) desenha cada octeto numa coluna:
   bits do IP em cima, bits da máscara embaixo e o decimal. Como cada
   coluna é um octeto, a quebra de linha no celular não desalinha nada. */
(function (g) {
  "use strict";
  var PESOS = [128, 64, 32, 16, 8, 4, 2, 1];
  function bin8(n) { return ("00000000" + (n >>> 0).toString(2)).slice(-8); }
  function cel(b, cls) { return "<span class='bit " + (cls || (b === "1" ? "um" : "zero")) + "'>" + b + "</span>"; }

  function octeto(bits, op) {
    op = op || {};
    var h = "<div class='octeto'>";
    if (op.pesos) h += "<div class='linha'>" + PESOS.map(function (p) { return "<span class='peso'>" + p + "</span>"; }).join("") + "</div>";
    h += "<div class='linha'>" + bits.split("").map(function (b, i) { return cel(b, op.classe ? op.classe(i, b) : null); }).join("") + "</div>";
    if (op.dec != null) h += "<span class='dec mono'>" + op.dec + "</span>";
    return h + "</div>";
  }

  function mascaraBits(prefixo) {
    var s = "";
    for (var i = 0; i < 32; i++) s += i < prefixo ? "1" : "0";
    return s;
  }

  /* op: {ip:true, mascara:true, cores:true, decIp:true, decMascara:true, rotulos:true, marcar:fn(i,linha)->cls extra} */
  function colunas(ip, prefixo, op) {
    op = op || {};
    var ipBits = ip ? ip.split(".").map(function (o) { return bin8(+o); }).join("") : null;
    var mBits = op.mascaraBits || mascaraBits(prefixo);
    var mDec = [0, 1, 2, 3].map(function (k) { return parseInt(mBits.slice(8 * k, 8 * k + 8), 2); });
    var h = "<div class='colunas'>";
    if (op.rotulos) {
      h += "<div class='col-rotulos'>" + (ipBits && op.ip !== false ? "<span>IP</span>" + (op.decIp ? "<span class='esp'></span>" : "") : "") +
        (op.mascara !== false ? "<span>Mask</span>" : "") + "</div>";
    }
    for (var k = 0; k < 4; k++) {
      h += "<div class='col'>";
      if (ipBits && op.ip !== false) {
        h += "<div class='linha'>" + ipBits.slice(8 * k, 8 * k + 8).split("").map(function (b, i) {
          var idx = 8 * k + i, cls = null;
          if (op.cores) cls = (mBits[idx] === "1" ? "r" : "h");
          var extra = op.marcar ? op.marcar(idx, "ip") : "";
          return cel(b, (cls || (b === "1" ? "um" : "zero")) + (extra ? " " + extra : ""));
        }).join("") + "</div>";
        if (op.decIp) h += "<span class='dec mono'>" + ip.split(".")[k] + "</span>";
      }
      if (op.mascara !== false) {
        h += "<div class='linha'>" + mBits.slice(8 * k, 8 * k + 8).split("").map(function (b, i) {
          var idx = 8 * k + i;
          var cls = op.coresMascara ? (b === "1" ? "r" : "h") : (b === "1" ? "um" : "zero");
          var extra = op.marcar ? op.marcar(idx, "mascara") : "";
          return cel(b, cls + (extra ? " " + extra : ""));
        }).join("") + "</div>";
        if (op.decMascara) h += "<span class='dec mono'>" + mDec[k] + "</span>";
      }
      h += "</div>";
    }
    return h + "</div>";
  }

  g.NP = g.NP || {};
  g.NP.Bits = { PESOS: PESOS, bin8: bin8, cel: cel, octeto: octeto, colunas: colunas, mascaraBits: mascaraBits };
})(window);
