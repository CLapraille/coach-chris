/* eslint-disable */
// Moteur du mannequin des démonstrations, repris tel quel de la maquette Mobilité validée (D80).
// Mannequin 2D articulé (cinématique directe + IK 2 segments), D80
const Mannequin = (function () {
  var R = Math.PI / 180, NS = 'http://www.w3.org/2000/svg', G = 184;
  var L = { torso: 52, ua: 26, fa: 24, th: 40, sh: 38, ft: 15 };
  var C = { near: 'var(--fg)', far: 'var(--faint)', hi: 'var(--mobility)', line: 'var(--line)', surf: 'var(--surface)', muted: 'var(--muted)' };
  function v(p, len, a) { return { x: p.x + len * Math.sin(a * R), y: p.y + len * Math.cos(a * R) }; }
  function ang(a, b) { return Math.atan2(b.x - a.x, b.y - a.y) / R; }
  function sc(P, k) { return P[k + 's'] == null ? 1 : P[k + 's']; }
  function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function lerp(A, B, t) {
    if (typeof A === 'number') return typeof B === 'number' ? A + (B - A) * t : A;
    if (Array.isArray(A)) return A.map(function (a, i) { return lerp(a, B && B[i], t); });
    if (A && typeof A === 'object') { var o = {}, k; for (k in A) o[k] = lerp(A[k], B && B[k], t); for (k in B) if (!(k in A)) o[k] = B[k]; return o; }
    return A;
  }
  function ik(H, T, a, b, bend) {
    var dx = T.x - H.x, dy = T.y - H.y, d = Math.sqrt(dx * dx + dy * dy);
    d = Math.max(Math.abs(a - b) + .1, Math.min(a + b - .1, d));
    var al = Math.acos((a * a + d * d - b * b) / (2 * a * d)) / R, K = v(H, a, ang(H, T) + bend * al);
    return [K, v(K, b, ang(K, T))];
  }
  var DEF = { torso: 180, bend: 0, tos: 1, thN: 0, shN: 0, thF: 0, shF: 0, uaN: 10, faN: 25, uaF: 15, faF: 30 };
  function prep(ex) {
    if (ex._K) return ex._K;
    var K = (ex.K || [ex.A, ex.B]).map(function (f) { var o = {}, k; for (k in ex.base) o[k] = ex.base[k]; for (k in f) o[k] = f[k]; return o; });
    var keys = {};
    K.forEach(function (f) { for (var k in f) keys[k] = 1; });
    K.forEach(function (f) {
      for (var k in DEF) if (f[k] == null) f[k] = DEF[k];
      if (f.hd == null) f.hd = f.torso;
      if (f.ftN == null) f.ftN = f.shN + 90;
      if (f.ftF == null) f.ftF = f.shF + 90;
      for (k in keys) if (f[k] == null) { if (/s$/.test(k) && k !== 'pts') f[k] = 1; else if (k === 'ttN') f[k] = f.ftN; else if (k === 'ttF') f[k] = f.ftF; }
    });
    return (ex._K = K);
  }
  function solve(P, ex) {
    var o = { x: 0, y: 0 }, j = { pelvis: o }, hw = ex.front ? 9 : 0, sw = ex.front ? 14 : 0;
    var px = -Math.cos(P.torso * R), py = Math.sin(P.torso * R);
    j.hipN = { x: hw * px, y: hw * py }; j.hipF = { x: -hw * px, y: -hw * py };
    j.sho = v(o, L.torso * P.tos, P.torso);
    j.shoN = { x: j.sho.x + sw * px, y: j.sho.y + sw * py }; j.shoF = { x: j.sho.x - sw * px, y: j.sho.y - sw * py };
    j.head = v(j.sho, 23, P.hd); j.neck = v(j.sho, 13, P.hd);
    ['N', 'F'].forEach(function (s) {
      j['knee' + s] = v(j['hip' + s], L.th * sc(P, 'th' + s), P['th' + s]);
      j['ank' + s] = v(j['knee' + s], L.sh * sc(P, 'sh' + s), P['sh' + s]);
      j['elb' + s] = v(j['sho' + s], L.ua * sc(P, 'ua' + s), P['ua' + s]);
      j['hand' + s] = v(j['elb' + s], L.fa * sc(P, 'fa' + s), P['fa' + s]);
    });
    toes(j, P);
    var a = j[P.anchor.j], dx = P.anchor.x - a.x, dy = P.anchor.y - a.y, k;
    for (k in j) j[k] = { x: j[k].x + dx, y: j[k].y + dy };
    var lim = { legN: ['hipN', 'kneeN', 'ankN', L.th * sc(P, 'thN'), L.sh * sc(P, 'shN')], legF: ['hipF', 'kneeF', 'ankF', L.th * sc(P, 'thF'), L.sh * sc(P, 'shF')], armN: ['shoN', 'elbN', 'handN', L.ua * sc(P, 'uaN'), L.fa * sc(P, 'faN')], armF: ['shoF', 'elbF', 'handF', L.ua * sc(P, 'uaF'), L.fa * sc(P, 'faF')] };
    for (k in (P.ik || {})) {
      var S = P.ik[k], m = lim[k], T;
      if (typeof S === 'function') S = S(j);
      if (Array.isArray(S)) T = { x: S[0], y: S[1], b: S[2] };
      else T = { x: j[S.to].x + (S.dx || 0), y: j[S.to].y + (S.dy || 0), b: S.b };
      var r = ik(j[m[0]], T, m[3], m[4], T.b);
      j[m[1]] = r[0]; j[m[2]] = r[1];
    }
    for (k in (P.pts || {})) j[k] = { x: P.pts[k][0], y: P.pts[k][1] };
    toes(j, P);
    var mid = { x: (j.pelvis.x + j.sho.x) / 2, y: (j.pelvis.y + j.sho.y) / 2 }, ta = ang(j.pelvis, j.sho), qx = -Math.cos(ta * R), qy = Math.sin(ta * R);
    j.ctrl = { x: mid.x + P.bend * qx, y: mid.y + P.bend * qy };
    j.spine = { x: mid.x + P.bend * qx / 2, y: mid.y + P.bend * qy / 2 };
    return j;
  }
  function toes(j, P) {
    ['N', 'F'].forEach(function (s) {
      var f = L.ft * sc(P, 'ft' + s);
      if (P['tt' + s] != null) { j['ball' + s] = v(j['ank' + s], f * .7, P['ft' + s]); j['toe' + s] = v(j['ball' + s], 6, P['tt' + s]); }
      else j['toe' + s] = v(j['ank' + s], f, P['ft' + s]);
    });
  }
  function line(g, a, b, w, c, op) { g.appendChild(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', opacity: op || 1 })); }
  function pt(J, p) { return typeof p === 'string' ? J[p] : p(J); }
  function draw(svg, J, ex, t) {
    var g = svg.querySelector('g.fig'); g.innerHTML = '';
    if (ex.custom) { ex.custom(g, t, el, C, G); return; }
    var hi = ex.hi || [], col = function (part, d) { return hi.indexOf(part) >= 0 ? C.hi : d; };
    if (ex.under) ex.under(g, J, el, C, t);
    var far = ex.front ? C.near : C.far, fo = ex.front ? .8 : 1;
    function leg(s, base, op) {
      line(g, J['hip' + s], J['knee' + s], 11, col('th' + s, base), op); line(g, J['knee' + s], J['ank' + s], 9, col('sh' + s, base), op);
      if (J['ball' + s]) { line(g, J['ank' + s], J['ball' + s], 6, col('ft' + s, base), op); line(g, J['ball' + s], J['toe' + s], 4, col('ft' + s, base), op); }
      else line(g, J['ank' + s], J['toe' + s], 6, col('ft' + s, base), op);
    }
    function arm(s, base, op) { line(g, J['sho' + s], J['elb' + s], 7, col('ua' + s, base), op); line(g, J['elb' + s], J['hand' + s], 6, col('fa' + s, base), op); }
    arm('F', far, fo); leg('F', far, fo);
    g.appendChild(el('path', { d: 'M' + J.pelvis.x + ',' + J.pelvis.y + ' Q' + J.ctrl.x + ',' + J.ctrl.y + ' ' + J.sho.x + ',' + J.sho.y, stroke: col('torso', C.near), 'stroke-width': 13, 'stroke-linecap': 'round', fill: 'none', opacity: .85 }));
    if (ex.front) { line(g, J.hipF, J.hipN, 11, C.near, .85); line(g, J.shoF, J.shoN, 9, C.near, .85); }
    line(g, J.sho, J.neck, 6, C.near, .85);
    g.appendChild(el('circle', { cx: J.head.x, cy: J.head.y, r: 9, fill: C.near, opacity: .85 }));
    leg('N', C.near, .95); arm('N', C.near, .95);
    if (ex.over) ex.over(g, J, el, C, t);
    [].concat(ex.glow || []).forEach(function (p) { p = pt(J, p); g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 9, fill: C.hi, opacity: .28 })); });
  }
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function frameAt(ex, K, c) {
    var T = ex.T || 2600, H = ex.H == null ? 900 : ex.H, n = K.length, i = Math.floor(c / (T + H)) % n, l = c % (T + H), t = l < T ? ease(l / T) : 1;
    // t global 0→1→0 pour les dessins custom
    return { P: lerp(K[i], K[(i + 1) % n], t), t: n === 2 ? (i === 0 ? t : 1 - t) : t };
  }
  function setup(svg, ex) {
    svg.setAttribute('viewBox', ex.vb || '0 0 240 200');
    if (svg._raf) cancelAnimationFrame(svg._raf);
    svg.innerHTML = '';
    svg.appendChild(el('line', { x1: 8, x2: 232, y1: G, y2: G, stroke: C.line, 'stroke-width': 2 }));
    if (ex.decor) ex.decor(svg, el, C, G);
    svg.appendChild(el('g', { class: 'fig' }));
  }
  function mount(svg, ex) {
    setup(svg, ex);
    var K = ex.custom ? [{ anchor: { j: 'pelvis', x: 0, y: 0 } }, { anchor: { j: 'pelvis', x: 0, y: 0 } }] : prep(ex);
    function paint(f) { draw(svg, ex.custom ? null : solve(f.P, ex), ex, f.t); }
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { paint({ P: K[1], t: 1 }); return; }
    var start = performance.now();
    paint(frameAt(ex, K, 0));
    function frame(now) {
      if (!svg.isConnected) return;
      paint(frameAt(ex, K, Math.max(0, now - start))); // le premier horodatage rAF peut précéder start
      svg._raf = requestAnimationFrame(frame);
    }
    svg._raf = requestAnimationFrame(frame);
  }

  // ---- décors
  function wall(x, w, top) { return function (svg, el, C, G) { svg.appendChild(el('rect', { x: x, y: top == null ? 20 : top, width: w || 12, height: G - (top == null ? 20 : top), fill: C.surf, stroke: C.line })); }; }
  function cushion(x) { return function (svg, el, C, G) { svg.appendChild(el('rect', { x: x, y: G - 6, width: 30, height: 6, rx: 3, fill: C.surf, stroke: C.line })); }; }
  function chair(svg, el, C, G) {
    svg.appendChild(el('rect', { x: 56, y: G - 48, width: 58, height: 5, rx: 2, fill: C.surf, stroke: C.line }));
    [60, 108].forEach(function (x) { svg.appendChild(el('line', { x1: x, x2: x, y1: G - 43, y2: G, stroke: C.line, 'stroke-width': 3 })); });
    svg.appendChild(el('line', { x1: 58, x2: 54, y1: G - 48, y2: G - 112, stroke: C.line, 'stroke-width': 3 }));
  }
  function both() { var f = [].slice.call(arguments); return function () { var a = arguments; f.forEach(function (x) { x.apply(null, a); }); }; }
  function at(a, b, k) { return function (J) { return { x: J[a].x + (J[b].x - J[a].x) * k, y: J[a].y + (J[b].y - J[a].y) * k }; }; }
  var SEAT = { anchor: { j: 'pelvis', x: 96, y: G - 54 }, torso: 178, uaN: 30, faN: 80, uaF: 30, faF: 80, ftF: 90 };
  var SUP = { anchor: { j: 'pelvis', x: 122, y: G - 8 }, torso: -90, hd: -90, uaN: 88, faN: 88, uaF: 88, faF: 88 };
  function mix(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  var EX = {
    // ---------- Hanche
    H1: { front: true, hi: ['thN', 'thF'], T: 1500, H: 500, glow: ['hipN', 'hipF'],
      base: { anchor: { j: 'pelvis', x: 120, y: G - 12 }, uaN: 22, faN: 8, uaF: -22, faF: -8, ftN: 90, ftF: -90, ftNs: .5, ftFs: .5 },
      K: [{ pts: { kneeN: [150, G - 46], ankN: [168, G - 4], kneeF: [90, G - 46], ankF: [72, G - 4] } },
          { pts: { kneeN: [164, G - 7], ankN: [168, G - 4], kneeF: [124, G - 8], ankF: [72, G - 4] } },
          { pts: { kneeN: [150, G - 46], ankN: [168, G - 4], kneeF: [90, G - 46], ankF: [72, G - 4] } },
          { pts: { kneeN: [116, G - 8], ankN: [168, G - 4], kneeF: [76, G - 7], ankF: [72, G - 4] } }] },
    H2: {
      hi: ['thN'], glow: at('pelvis', 'kneeN', .25), decor: cushion(80),
      base: { anchor: { j: 'ankF', x: 150, y: G - 3 }, ftF: 90, ftN: -95, shN: -90 },
      A: { torso: 180, thF: 88, shF: 0, thN: -10, uaN: 15, faN: 35, uaF: 20, faF: 45 },
      B: { torso: 184, thF: 95, shF: 25, thN: -35, uaN: 172, faN: 178, uaF: 30, faF: 55 } },
    H3: { hi: ['thN'], glow: at('pelvis', 'kneeN', .5), decor: both(wall(34, 12, 70), cushion(40)),
      base: { anchor: { j: 'kneeN', x: 54, y: G - 6 }, shN: 180, ftN: 195, ik: { legF: [112, G - 3, 1] }, ftF: 90 },
      A: { torso: 140, thN: -30, uaN: 50, faN: 40, uaF: 45, faF: 35 },
      B: { torso: 178, thN: -8, uaN: -20, faN: 60, uaF: -15, faF: 65 } },
    H4: { front: true, hi: ['thN', 'thF'], T: 1300, H: 400, glow: ['hipN', 'hipF'],
      base: { anchor: { j: 'pelvis', x: 120, y: G - 12 }, tos: .85, ftN: 90, ftF: -90, ftNs: .5, ftFs: .5, ik: { armN: [152, G - 8, 1], armF: [88, G - 8, -1] } },
      K: [{ pts: { kneeN: [142, G - 48], ankN: [150, G - 4], kneeF: [98, G - 48], ankF: [90, G - 4] } },
          { pts: { kneeN: [166, G - 22], ankN: [150, G - 4], kneeF: [128, G - 28], ankF: [90, G - 4] } },
          { pts: { kneeN: [142, G - 48], ankN: [150, G - 4], kneeF: [98, G - 48], ankF: [90, G - 4] } },
          { pts: { kneeN: [112, G - 28], ankN: [150, G - 4], kneeF: [74, G - 22], ankF: [90, G - 4] } }] },
    H5: { hi: ['thN'], glow: 'pelvis',
      base: { anchor: { j: 'pelvis', x: 104, y: G - 18 }, thN: 80, shN: -95, shNs: .5, ftN: -100, ftNs: .6, thF: -75, shF: -88, ftF: -90 },
      A: { torso: 165, ik: { armN: [140, G - 20, -1], armF: [136, G - 20, -1] } },
      B: { torso: 118, ik: { armN: [184, G - 4, -1], armF: [180, G - 4, -1] } } },
    H6: { hi: ['thN'], glow: at('pelvis', 'kneeN', .5),
      base: { uaNs: .86, faNs: .86, uaFs: .86, faFs: .86, anchor: { j: 'kneeN', x: 104, y: G - 5 }, shN: -90, ftN: -90, shF: -90, ftF: -90, ik: { armN: [154, G - 3, -1], armF: [150, G - 3, -1] } },
      A: { torso: 90, thN: 0, thF: 0 }, B: { torso: 76, thN: 52, thF: 52 } },
    H7: { front: true, hi: ['thN', 'thF'], T: 1500, H: 500,
      base: { ik: { legN: [176, G - 4, 1], legF: [64, G - 4, -1] }, ftN: 90, ftF: -90, ftNs: .5, ftFs: .5, uaN: 14, faN: 30, uaF: -14, faF: -30 },
      K: [{ anchor: { j: 'pelvis', x: 120, y: G - 56 } }, { anchor: { j: 'pelvis', x: 140, y: G - 36 }, torso: 176 },
          { anchor: { j: 'pelvis', x: 120, y: G - 56 } }, { anchor: { j: 'pelvis', x: 100, y: G - 36 }, torso: 184 }] },
    H8: { hi: ['thN'], glow: 'pelvis', T: 1100, H: 150,
      base: { uaNs: .86, faNs: .86, uaFs: .86, faFs: .86, anchor: { j: 'pelvis', x: 88, y: G - 45 }, torso: 92, thF: 0, shF: -90, ftF: -90, ik: { armN: [142, G - 3, -1], armF: [138, G - 3, -1] } },
      K: [{ thN: 0, shN: -90, ftN: -90 }, { thN: 75, shN: -100, ftN: -100 }, { thN: 5, thNs: .5, shN: -90, ftN: -90 }, { thN: -55, shN: -140, ftN: -150 }] },
    H9: { glow: 'pelvis',
      base: { anchor: { j: 'sho', x: 72, y: G - 8 }, hd: -90, ik: { legN: [166, G - 4, 1], legF: [162, G - 4, 1] }, ftN: 90, ftF: 90, uaN: 86, faN: 88, uaF: 86, faF: 88 },
      A: { torso: -90 }, B: { torso: -64 } },
    H10: { front: true, hi: ['thN'], glow: 'hipN',
      base: { torso: -90, hd: -90, anchor: { j: 'pelvis', x: 122, y: G - 15 }, uaF: -90, faF: -90, uaN: 90, faN: 60, ftN: 90, ftF: 90, ftNs: .6, ftFs: .6 },
      A: { pts: { kneeN: [154, G - 17], ankN: [182, G - 12], kneeF: [154, G - 6], ankF: [182, G - 5] } },
      B: { pts: { kneeN: [148, G - 44], ankN: [182, G - 12], kneeF: [154, G - 6], ankF: [182, G - 5] } } },
    H11: { hi: ['thN'], glow: 'pelvis', T: 1000, H: 150, decor: wall(92, 10, 40),
      base: { anchor: { j: 'ankF', x: 118, y: G - 3 }, ftF: 90, ik: { armF: [99, G - 100, -1] } },
      A: { thN: 62, shN: 55, ftN: 140, uaN: -30, faN: -10 }, B: { thN: -30, shN: -40, ftN: 50, uaN: 40, faN: 70 } },
    H12: { front: true, hi: ['thN'], glow: 'hipN', T: 1000, H: 150,
      decor: function (svg, el, C, G) { svg.appendChild(el('rect', { x: 40, y: 18, width: 160, height: G - 18, fill: C.surf, opacity: .6 })); },
      base: { anchor: { j: 'ankF', x: 112, y: G - 3 }, ftF: -90, ftFs: .5, ftNs: .5, uaN: 105, faN: 150, uaF: -105, faF: -150, uaNs: .65, faNs: .55, uaFs: .65, faFs: .55 },
      A: { thN: -28, shN: -30, ftN: -90 }, B: { thN: 42, shN: 40, ftN: 90 } },
    // ---------- Pied
    P1: { hi: ['ftN'], glow: 'ballN', decor: wall(197, 12),
      base: { anchor: { j: 'ankN', x: 180, y: G - 3 }, ftN: 90, ttN: 150, ftF: 90, ik: { legF: [152, G - 3, 1], armN: [195, G - 118, -1], armF: [195, G - 110, -1] } },
      A: { torso: 174, thN: 18, shN: -6 }, B: { torso: 166, thN: 32, shN: -22 } },
    P2: { custom: function (g, t, el, C, G) {
        g.appendChild(el('path', { d: 'M120,182 C94,182 88,152 92,130 C95,112 88,100 90,86 C93,70 148,64 152,82 C155,100 150,120 151,140 C153,165 146,182 120,182 Z', fill: C.near, opacity: .85 }));
        var base = [-20, -7, 4, 14, 24], spr = [-14, -5, 3, 9, 15], rad = [66, 66, 64, 61, 57], r = [10, 7, 6.5, 6, 5.5];
        base.forEach(function (b, i) { var a = (b + t * spr[i]) * R; g.appendChild(el('circle', { cx: 121 + rad[i] * Math.sin(a), cy: 132 - rad[i] * Math.cos(a), r: r[i], fill: C.hi })); });
      } },
    P3: { custom: function (g, t, el, C, G) {
        var a = 3 + 9 * t, s = 5 * t;
        g.appendChild(el('line', { x1: 92, y1: 34, x2: 96, y2: G - 46, stroke: C.near, 'stroke-width': 18, 'stroke-linecap': 'round', opacity: .85 }));
        g.appendChild(el('path', { d: 'M70,' + (G - 1) + ' Q112,' + (G - 1 - 2 * a) + ' ' + (152 - s) + ',' + (G - 1) + ' L' + (190 - s) + ',' + (G - 1) + ' Q' + (198 - s) + ',' + (G - 1) + ' ' + (196 - s) + ',' + (G - 7) + ' L' + (190 - s) + ',' + (G - 11) + ' Q158,' + (G - 20) + ' 118,' + (G - 40) + ' L106,' + (G - 54) + ' L84,' + (G - 54) + ' L70,' + (G - 30) + ' Q62,' + (G - 12) + ' 70,' + (G - 1) + ' Z', fill: C.near, opacity: .85 }));
        g.appendChild(el('path', { d: 'M78,' + (G - 3) + ' Q112,' + (G - 3 - 2 * a) + ' ' + (148 - s) + ',' + (G - 3), stroke: C.hi, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }));
        g.appendChild(el('circle', { cx: 112, cy: G - 2 - a, r: 10, fill: C.hi, opacity: .28 }));
      } },
    P4: { hi: ['ftN'], glow: function () { return { x: 150, y: G - 9 }; }, decor: chair,
      under: function (g, J, el, C) { g.appendChild(el('circle', { cx: 150, cy: G - 8, r: 7, fill: C.surf, stroke: C.muted, 'stroke-width': 1.5 })); },
      base: mix(SEAT, { ftN: 90 }),
      A: { ik: { legN: [149, G - 18, 1], legF: [138, G - 3, 1] } }, B: { ik: { legN: [137, G - 18, 1], legF: [138, G - 3, 1] } } },
    P5: { hi: ['ftN'], glow: 'ballN',
      base: { anchor: { j: 'kneeN', x: 130, y: G - 5 }, shN: -105, ftN: -25, ttN: -90, shF: -105, ftF: -25, ttF: -90 },
      A: { torso: 180, thN: 0, thF: 0, uaN: 10, faN: 30 }, B: { torso: 172, thN: 72, thF: 72, uaN: 20, faN: 70, uaF: 20, faF: 70 } },
    // ---------- Cheville, mollet
    C1: { hi: ['shN'], glow: 'ankN', decor: wall(202, 12),
      base: { anchor: { j: 'ankN', x: 180, y: G - 3 }, ftN: 90, ftF: 90, ik: { legF: [152, G - 3, 1], armN: [200, G - 120, -1], armF: [200, G - 112, -1] } },
      A: { torso: 172, thN: 20, shN: -8 }, B: { torso: 165, thN: 35, shN: -28 } },
    C2: { hi: ['shN'], glow: at('kneeN', 'ankN', .4), decor: wall(190, 12),
      base: { ftN: 90, ftF: 90 },
      A: { anchor: { j: 'pelvis', x: 125, y: G - 75 }, torso: 160, ik: { legN: [95, G - 3, 1], legF: [150, G - 3, 1], armN: [189, G - 118, -1], armF: [189, G - 112, -1] } },
      B: { anchor: { j: 'pelvis', x: 140, y: G - 67 }, torso: 150, ik: { legN: [95, G - 3, 1], legF: [150, G - 3, 1], armN: [189, G - 118, -1], armF: [189, G - 112, -1] } } },
    C3: { hi: ['shN'], glow: at('kneeN', 'ankN', .75), decor: wall(190, 12),
      base: { ftN: 90, ftF: 90 },
      A: { anchor: { j: 'pelvis', x: 126, y: G - 74 }, torso: 160, ik: { legN: [108, G - 3, 1], legF: [152, G - 3, 1], armN: [189, G - 118, -1], armF: [189, G - 112, -1] } },
      B: { anchor: { j: 'pelvis', x: 132, y: G - 60 }, torso: 155, ik: { legN: [108, G - 3, 1], legF: [152, G - 3, 1], armN: [189, G - 112, -1], armF: [189, G - 106, -1] } } },
    C4: { hi: ['ftN'], glow: 'ankN', T: 800, H: 80, decor: chair,
      base: mix(SEAT, { thN: 88, shN: 62, ik: { legF: [138, G - 3, 1] } }),
      K: [{ ftN: 118 }, { ftN: 150, ftNs: .6 }, { ftN: 180 }, { ftN: 150, ftNs: .6 }] },
    C5: { hi: ['shN', 'ftN'], glow: 'ankN', T: 1800, H: 400,
      base: { anchor: { j: 'ankN', x: 120, y: G - 3 }, ftN: 90, thF: 20, shF: -75 },
      A: { thN: 4, shN: -4, torso: 180, uaN: 35, faN: 40, uaF: -25, faF: -15 }, B: { thN: 9, shN: -7, torso: 177, uaN: 25, faN: 30, uaF: -35, faF: -20 } },
    C6: { hi: ['shN', 'ftN'], glow: 'ankN', vb: '-10 -22 260 216',
      decor: function (svg, el, C, G) { svg.appendChild(el('rect', { x: 126, y: G - 22, width: 80, height: 22, fill: C.surf, stroke: C.line })); },
      base: { anchor: { j: 'toeN', x: 140, y: G - 25 }, torso: 180, thF: 25, shF: -40, uaN: 15, faN: 35, uaF: 20, faF: 40 },
      A: { ftN: 55 }, B: { ftN: 115 } },
    // ---------- Genou, cuisse
    G1: { hi: ['thN'], glow: at('pelvis', 'kneeN', .5), decor: wall(172, 12),
      base: { anchor: { j: 'ankF', x: 120, y: G - 3 }, ftF: 90, uaF: 85, faF: 88, ik: { armN: { to: 'ankN', dx: 0, dy: 0, b: 1 } } },
      A: { thN: 2, shN: 228, ftN: 268 }, B: { thN: -12, shN: 192, ftN: 232 } },
    G2: { hi: ['thN', 'shN'], glow: 'kneeN',
      base: mix(SUP, { thF: 90, shF: 90, ftF: 175 }),
      A: { ik: { legN: [198, G - 7, 1] }, ftN: 172 }, B: { ik: { legN: [150, G - 5, 1] }, ftN: 100 } },
    G3: { hi: ['thN'], glow: at('pelvis', 'kneeN', .55),
      over: function (g, J, el, C) { g.appendChild(el('line', { x1: J.handN.x, y1: J.handN.y, x2: (J.ankN.x + J.toeN.x) / 2, y2: (J.ankN.y + J.toeN.y) / 2, stroke: C.muted, 'stroke-width': 2 })); },
      base: mix(SUP, { thF: 90, shF: 90, ftF: 175, ik: { armN: { to: 'ankN', b: 1 }, armF: { to: 'ankN', b: 1 } } }),
      A: { thN: 125, shN: 125, ftN: 215 }, B: { thN: 160, shN: 160, ftN: 250 } },
    G4: { hi: ['thN'], glow: at('pelvis', 'kneeN', .5),
      over: function (g, J, el, C) {
        var a = ang(J.pelvis, J.sho), dx = Math.sin(a * R), dy = Math.cos(a * R), bx = -Math.cos(a * R) * -8, by = Math.sin(a * R) * -8;
        g.appendChild(el('line', { x1: J.pelvis.x + bx - dx * 14, y1: J.pelvis.y + by - dy * 14, x2: J.head.x + bx + dx * 6, y2: J.head.y + by + dy * 6, stroke: C.muted, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      },
      base: { anchor: { j: 'ankN', x: 124, y: G - 3 }, ftN: 90, ftF: 90,
        ik: { armN: function (J) { var a = ang(J.pelvis, J.sho); return [J.pelvis.x + Math.cos(a * R) * 8 + Math.sin(a * R) * 6, J.pelvis.y - Math.sin(a * R) * 8 + Math.cos(a * R) * 6, -1]; },
              armF: function (J) { var a = ang(J.pelvis, J.sho); return [J.head.x + Math.cos(a * R) * 9 - Math.sin(a * R) * 12, J.head.y - Math.sin(a * R) * 9 - Math.cos(a * R) * 12, 1]; } } },
      A: { torso: 180, thN: 0, shN: 0, thF: 0, shF: 0 }, B: { torso: 122, thN: 22, shN: -4, thF: 22, shF: -4 } },
    // ---------- Tronc, récupération
    T1: { hi: ['torso'], glow: 'spine', T: 2200, H: 600,
      base: { uaNs: .86, faNs: .86, uaFs: .86, faFs: .86, anchor: { j: 'pelvis', x: 86, y: G - 45 }, torso: 92, shN: -90, shF: -90, ftN: -90, ftF: -90, ik: { armN: [140, G - 3, -1], armF: [136, G - 3, -1] } },
      A: { bend: -22, hd: 35 }, B: { bend: 16, hd: 125 } },
    T2: { custom: function (g, t, el, C, G) {
        var px = 112, py = G - 5, rot = -42 * t;
        [G - 8, G - 21].forEach(function (y) { g.appendChild(el('circle', { cx: 176, cy: y, r: 6.5, fill: C.far })); });
        g.appendChild(el('line', { x1: px, y1: G - 6, x2: px + 50, y2: G - 6, stroke: C.far, 'stroke-width': 7, 'stroke-linecap': 'round' }));
        g.appendChild(el('ellipse', { cx: px, cy: G - 26, rx: 12, ry: 22, fill: C.hi, opacity: .85, transform: 'rotate(' + rot + ' ' + px + ' ' + py + ')' }));
        var r = rot * R, S = { x: px + 36 * Math.sin(r), y: py - 36 * Math.cos(r) }; // épaule du dessus, tourne avec le thorax
        var H = v(S, 50, 88 + 202 * t);
        g.appendChild(el('line', { x1: S.x, y1: S.y, x2: H.x, y2: H.y, stroke: C.near, 'stroke-width': 7, 'stroke-linecap': 'round', opacity: .95 }));
      } },
    R1: { hi: ['thN', 'shN', 'thF', 'shF'], T: 3000, H: 1200, decor: wall(134, 12, 60),
      base: mix(SUP, { anchor: { j: 'pelvis', x: 124, y: G - 8 }, thN: 178, shN: 178, ftN: 205, thF: 182, shF: 182, ftF: 210 }),
      A: { bend: 0 }, B: { bend: 3 } },
    // ---------- Renforcement et mobilité du plan Claude (D167)
    // Fente : statique, arrière ou marchée (pied avant à droite, pied arrière sur la pointe).
    X1: { hi: ['thN', 'thF'], glow: 'kneeN', T: 1600, H: 400,
      base: { torso: 180, uaN: 2, faN: 0, uaF: -2, faF: 0, ftN: 90, ftF: 140, ik: { legN: [156, G - 4, 1], legF: [78, G - 6, -1] } },
      A: { anchor: { j: 'pelvis', x: 116, y: G - 80 } }, B: { anchor: { j: 'pelvis', x: 112, y: G - 52 } } },
    // Squat poids du corps : hanches en arrière, bras devant pour l'équilibre.
    X2: { hi: ['thN', 'thF'], glow: 'kneeN', T: 1600, H: 400,
      base: { ftN: 90, ftF: 90, ik: { legN: [128, G - 4, 1], legF: [124, G - 4, 1] } },
      A: { anchor: { j: 'pelvis', x: 120, y: G - 80 }, torso: 180, uaN: 20, faN: 20, uaF: 15, faF: 15 },
      B: { anchor: { j: 'pelvis', x: 98, y: G - 56 }, torso: 145, uaN: 100, faN: 95, uaF: 95, faF: 92 } },
    // Soulevé de terre roumain sur une jambe : bascule du buste, jambe arrière dans l'alignement.
    X3: { hi: ['thN', 'thF'], glow: at('pelvis', 'kneeN', .5), T: 1800, H: 500,
      base: { anchor: { j: 'ankN', x: 124, y: G - 3 }, ftN: 90, ftF: 90, thN: 4, shN: -4, uaN: 0, faN: 0, uaF: 0, faF: 0 },
      A: { torso: 180, thF: 6, shF: -6 }, B: { torso: 98, thF: -82, shF: -84, ftF: 0, uaN: 0, faN: 0, uaF: 0, faF: 0 } },
    // Montée mollet sur une marche, genou fléchi (soléaire).
    X4: { hi: ['shN', 'ftN'], glow: at('kneeN', 'ankN', .7), vb: '-10 -22 260 216',
      decor: function (svg, el, C, G) { svg.appendChild(el('rect', { x: 126, y: G - 22, width: 80, height: 22, fill: C.surf, stroke: C.line })); },
      base: { anchor: { j: 'toeN', x: 140, y: G - 25 }, torso: 176, thN: 28, shN: -22, thF: 45, shF: -40, uaN: 15, faN: 35, uaF: 20, faF: 40 },
      A: { ftN: 60 }, B: { ftN: 115 } },
    // Montées sur pointes au sol.
    X5: { hi: ['shN', 'ftN'], glow: 'ankN',
      base: { anchor: { j: 'toeN', x: 140, y: G - 3 }, torso: 180, uaN: 10, faN: 20, uaF: -10, faF: -20, thF: 0, shF: 0, ftF: 90 },
      A: { ftN: 90 }, B: { ftN: 52, ftF: 52 } },
    // Relevés tibial, dos au mur : les pointes de pied montent, talons au sol.
    X6: { hi: ['shN', 'ftN'], glow: at('kneeN', 'ankN', .6), decor: wall(46, 12),
      base: { anchor: { j: 'pelvis', x: 68, y: G - 82 }, torso: 186, hd: 186, uaN: 10, faN: 10, uaF: 8, faF: 8,
        ik: { legN: [112, G - 4, -1], legF: [110, G - 4, -1] } },
      A: { ftN: 90, ftF: 90 }, B: { ftN: 128, ftF: 128 } },
    // Pont fessier sur une jambe : l'autre jambe tendue dans le prolongement de la cuisse.
    X7: { glow: 'pelvis', hi: ['thN'],
      base: { anchor: { j: 'sho', x: 72, y: G - 8 }, hd: -90, ik: { legN: [162, G - 4, 1] }, ftN: 90, uaN: 86, faN: 88, uaF: 86, faF: 88 },
      A: { torso: -90, thF: 140, shF: 140, ftF: 230 }, B: { torso: -66, thF: 112, shF: 112, ftF: 202 } },
    // Planche latérale sur l'avant-bras : le bassin monte puis tient.
    X8: { hi: ['torso'], glow: 'pelvis', T: 1800, H: 1200,
      base: { ftN: 170, ftF: 170, uaN: 0, faN: -90, uaF: 120, faF: 120 },
      A: { anchor: { j: 'pelvis', x: 124, y: G - 10 }, torso: -115, thN: 85, shN: 85, thF: 85, shF: 85 },
      B: { anchor: { j: 'pelvis', x: 124, y: G - 22 }, torso: -100, thN: 77, shN: 77, thF: 77, shF: 77 } },
    // Dead bug : bras et jambe opposés s'allongent, bas du dos collé au sol.
    X9: { hi: ['thN', 'uaF'], glow: 'spine', T: 1700, H: 500,
      base: mix(SUP, { ftN: 180, ftF: 180 }),
      A: { thN: 180, shN: 90, thF: 180, shF: 90, uaN: 180, faN: 180, uaF: 180, faF: 180 },
      B: { thN: 98, shN: 96, ftN: 186, thF: 180, shF: 90, uaN: 180, faN: 180, uaF: -88, faF: -88 } },
    // Bird dog : à quatre pattes, bras et jambe opposés tendus.
    X10: { hi: ['thN', 'uaF'], glow: 'spine', T: 1700, H: 600,
      base: { uaNs: .86, faNs: .86, uaFs: .86, faFs: .86, anchor: { j: 'pelvis', x: 86, y: G - 45 }, torso: 92, shF: -90, ftF: -90, ftN: -90 },
      A: { thN: 0, shN: -90, ik: { armN: [140, G - 3, -1], armF: [136, G - 3, -1] } },
      B: { thN: -88, shN: -90, ftN: -180, ik: { armN: [140, G - 3, -1] }, uaF: 95, faF: 95 } },
    // Glissement nerveux sciatique assis : jambe tendue tête haute, jambe pliée tête basse.
    X11: { hi: ['thN', 'shN'], glow: at('kneeN', 'ankN', .5), decor: chair,
      base: mix(SEAT, { thN: 88, ik: { legF: [138, G - 3, 1] } }),
      A: { shN: 0, ftN: 90, hd: 150 }, B: { shN: 82, ftN: 170, hd: 196 } },
    // Glissement nerveux sciatique allongé : cuisse tenue à la verticale, la jambe se tend.
    X12: { hi: ['shN'], glow: at('kneeN', 'ankN', .5),
      base: mix(SUP, { thF: 90, shF: 90, ftF: 180, thN: 178, ik: { armN: { to: 'kneeN', dy: 8, b: 1 }, armF: { to: 'kneeN', dy: 12, b: 1 } } }),
      A: { shN: 95, ftN: 185 }, B: { shN: 176, ftN: 262 } },
    // Marche latérale avec élastique au-dessus des genoux, vue de face.
    X13: { front: true, hi: ['thN', 'thF'], T: 900, H: 250,
      over: function (g, J, el, C) { g.appendChild(el('line', { x1: J.kneeF.x, y1: J.kneeF.y - 8, x2: J.kneeN.x, y2: J.kneeN.y - 8, stroke: C.hi, 'stroke-width': 3 })); },
      base: { torso: 176, uaN: 20, faN: 60, uaF: -20, faF: -60, ftN: 90, ftF: -90, ftNs: .5, ftFs: .5 },
      K: [{ anchor: { j: 'pelvis', x: 112, y: G - 70 }, ik: { legN: [138, G - 4, 1], legF: [86, G - 4, -1] } },
          { anchor: { j: 'pelvis', x: 122, y: G - 70 }, ik: { legN: [158, G - 4, 1], legF: [86, G - 4, -1] } },
          { anchor: { j: 'pelvis', x: 132, y: G - 70 }, ik: { legN: [158, G - 4, 1], legF: [106, G - 4, -1] } }] },
    // Montées de genoux sur place.
    X14: { hi: ['thN', 'thF'], T: 500, H: 80,
      base: { anchor: { j: 'pelvis', x: 120, y: G - 82 }, torso: 180, ftN: 90, ftF: 90 },
      K: [{ thN: 88, shN: 0, thF: 0, shF: 0, uaN: -30, faN: -60, uaF: 40, faF: 100 },
          { thN: 0, shN: 0, thF: 0, shF: 0, uaN: 0, faN: 30, uaF: 0, faF: 30 },
          { thN: 0, shN: 0, thF: 88, shF: 0, uaN: 40, faN: 100, uaF: -30, faF: -60 },
          { thN: 0, shN: 0, thF: 0, shF: 0, uaN: 0, faN: 30, uaF: 0, faF: 30 }] },
    // Respiration ventrale, allongé genoux pliés : le ventre monte et descend.
    X15: { hi: ['torso'], glow: 'spine', T: 3000, H: 1000,
      base: mix(SUP, { ftN: 90, ftF: 90, ik: { legN: [168, G - 4, 1], legF: [164, G - 4, 1], armN: { to: 'pelvis', dx: -20, dy: -10, b: 1 } }, uaF: 88, faF: 88 }),
      A: { bend: 0 }, B: { bend: -9 } }
  };
  return {
    mount: function (svg, code) { if (EX[code]) { mount(svg, EX[code]); return true; } return false; },
    has: function (c) { return !!EX[c]; },
    codes: Object.keys(EX),
    still: function (svg, code, i) { // pose fixe (vérification)
      var ex = EX[code]; setup(svg, ex);
      if (ex.custom) { draw(svg, null, ex, i ? 1 : 0); return; }
      var K = prep(ex); draw(svg, solve(K[i % K.length], ex), ex, 0);
    }
  };
})();

export default Mannequin;
