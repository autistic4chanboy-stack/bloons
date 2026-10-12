// Appareils, machines, véhicules et grand mobilier (fixes des magasins, du centre et du parking) : formes détaillées
// qui remplacent celles de meshes.js de même nom (registerShape ; module importé par devices.js pour ses effets, avant
// toute cuisson). Silhouettes aux proportions réelles, arêtes chanfreinées à normales lissées (elles accrochent la
// lumière comme des arêtes arrondies), sous-pièces (poignées, charnières, vis, joints, grilles, câbles, boutons…).
// Repère : origine au centre de la boîte s de l'objet, face utilisateur vers +z ; tout tient dans s (contrat des
// objets). Couleurs par sommet sur le matériau « props » (rugosité unique) : métal, verre et plastique se distinguent
// par la valeur et les dégradés ; ce qui luit (écrans, marquees) reste aux maillages de devices.js.
// Budget : ≤ 6 000 sommets par appareil (voiture ≤ 15 000) ; sobriété pour ce qui est posé en nombre (caisses,
// chaises, portables, mannequins).
import * as THREE from 'three';
import { registerShape } from './meshes.js';
import { mulberry32 } from '../engine/rng.js';

const S = registerShape, PI = Math.PI, TAU = PI * 2;

// ───────── couleurs (hexadécimal sRGB → linéaire, comme GeoBuilder) ─────────
const _col = new THREE.Color(), LIN = new Map();
function L(c) { if (Array.isArray(c)) return c; let v = LIN.get(c); if (!v) { _col.set(c); v = [_col.r, _col.g, _col.b]; LIN.set(c, v); } return v; }
function shade(c, k) { const f = (v) => Math.min(255, Math.max(0, Math.round(v * k))); return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255); }
function mix(a, b, t) { const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); }
// teintes de matériaux
const CHROME = 0xd9dde0, STEEL = 0xa4abb1, ALU = 0xc3c8cc, INOX = 0xb9bfc4, BLACK = 0x161718;

// ───────── repères ─────────
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _sc = new THREE.Vector3();
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { _e.set(rx, ry, rz); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _sc.set(sx, sy, sz)); }
// exécute fn dans le repère m, composé avec le repère courant du kit
function at(k, m, fn) { const T = k.T; k.setT(T ? T.clone().multiply(m) : m); fn(); k.setT(T); }

// ───────── primitives brutes ─────────
// Métaux polis (chrome, inox, acier, alu) : le matériau commun a une rugosité unique, le reflet de l'environnement
// (plafond clair, sol sombre) est donc peint dans la couleur selon l'orientation de la normale
const METALS = new Set([CHROME, INOX, STEEL, ALU].map(L)), _mn = new THREE.Vector3(), _mc = [0, 0, 0];
function pv(k, x, y, z, nx, ny, nz, col, u, v) {
  if (METALS.has(col)) { _mn.set(nx, ny, nz); if (k.N) _mn.applyMatrix3(k.N).normalize(); const f = 0.72 + 0.38 * _mn.y; _mc[0] = col[0] * f; _mc[1] = col[1] * f; _mc[2] = col[2] * f; col = _mc; }
  const i = k.b.vertexCount; k.vtx(x, y, z, nx, ny, nz, u ?? k.white.u0, v ?? k.white.v0, col); return i;
}
function cross3(a, b, c) { const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2], bx = c[0] - a[0], by = c[1] - a[1], bz = c[2] - a[2]; return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]; }
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// quadrilatère à normales par sommet, orienté vers la normale moyenne ; cols : une couleur ou quatre
function q4(k, P, N, cols, R) {
  const cs = Array.isArray(cols) ? cols : [cols, cols, cols, cols], o = k.b.vertexCount;
  const uv = R ? [[R.u0, R.v0], [R.u1, R.v0], [R.u1, R.v1], [R.u0, R.v1]] : null;
  for (let i = 0; i < 4; i++) pv(k, P[i][0], P[i][1], P[i][2], N[i][0], N[i][1], N[i][2], L(cs[i]), uv?.[i][0], uv?.[i][1]);
  const g = cross3(P[0], P[1], P[3]), n = [N[0][0] + N[2][0], N[0][1] + N[2][1], N[0][2] + N[2][2]];
  if (dot3(g, n) >= 0) k.b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3); else k.b.idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
}
function t3(k, P, N, col) {
  const o = k.b.vertexCount; for (let i = 0; i < 3; i++) pv(k, P[i][0], P[i][1], P[i][2], N[i][0], N[i][1], N[i][2], L(col));
  const g = cross3(P[0], P[1], P[2]), n = [N[0][0] + N[1][0] + N[2][0], N[0][1] + N[1][1] + N[2][1], N[0][2] + N[1][2] + N[2][2]];
  if (dot3(g, n) >= 0) k.b.idx.push(o, o + 1, o + 2); else k.b.idx.push(o, o + 2, o + 1);
}

// Faces d'une boîte : normale, u (droite vue de face), v (haut) ; u × v = n
const FACE = {
  X: [[1, 0, 0], [0, 0, -1], [0, 1, 0]], x: [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  Y: [[0, 1, 0], [1, 0, 0], [0, 0, -1]], y: [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  Z: [[0, 0, 1], [1, 0, 0], [0, 1, 0]], z: [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
};
const AXK = [['x', 'X'], ['y', 'Y'], ['z', 'Z']];
const ax3 = (v) => (v[0] ? 0 : v[1] ? 1 : 2);
// Quadrilatère plaqué sur une face (orientation de FACE[f]) : décors, fentes, voyants, étiquettes (R, teintée par c)
function fq(k, x, y, z, w, h, c, f = 'Z', R = null) {
  const [, u, v] = FACE[f], hu = w / 2, hv = h / 2;
  const P = (su, sv) => [x + u[0] * su * hu + v[0] * sv * hv, y + u[1] * su * hu + v[1] * sv * hv, z + u[2] * su * hu + v[2] * sv * hv];
  k.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), R ? (c || 0xffffff) : c, R); // étiquette : c (sinon blanc) la teinte
}
// même chose avec un dégradé vertical (bas → haut) : vitres, reflets
function fqg(k, x, y, z, w, h, c0, c1, f = 'Z') {
  const [n, u, v] = FACE[f], hu = w / 2, hv = h / 2;
  const P = (su, sv) => [x + u[0] * su * hu + v[0] * sv * hv, y + u[1] * su * hu + v[1] * sv * hv, z + u[2] * su * hu + v[2] * sv * hv];
  q4(k, [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], [n, n, n, n], [c0, c0, c1, c1]);
}

// Boîte chanfreinée à normales lissées : 6 faces réduites de r, 12 bandes d'arête, 8 coins (96 sommets).
// o.skip : faces omises ('xXyYzZ') ; o.F : étiquettes par face ; o.C : couleurs par face ; o.ec : couleur des arêtes
function rbox(k, x, y, z, w, h, d, r, c, o = {}) {
  r = Math.max(0, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const sk = o.skip || '', A = [w / 2 - r, h / 2 - r, d / 2 - r], E = [w / 2, h / 2, d / 2], C0 = [x, y, z];
  for (const f in FACE) {
    if (sk.includes(f)) continue;
    const [n, u, v] = FACE[f], R = o.F?.[f], col = o.C?.[f] ?? (R ? 0xffffff : c);
    const hu = A[ax3(u)], hv = A[ax3(v)], cx = x + n[0] * E[0], cy = y + n[1] * E[1], cz = z + n[2] * E[2];
    const P = (su, sv) => [cx + u[0] * su * hu + v[0] * sv * hv, cy + u[1] * su * hu + v[1] * sv * hv, cz + u[2] * su * hu + v[2] * sv * hv];
    q4(k, [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], [n, n, n, n], col, R);
  }
  if (r <= 0) return;
  const ec = o.ec ?? c;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const t = 3 - i - j;
    for (const si of [-1, 1]) for (const sj of [-1, 1]) {
      if (sk.includes(AXK[i][si > 0 ? 1 : 0]) && sk.includes(AXK[j][sj > 0 ? 1 : 0])) continue;
      const n1 = [0, 0, 0], n2 = [0, 0, 0]; n1[i] = si; n2[j] = sj;
      const P = (st, n) => { const p = [...C0]; p[i] += si * A[i]; p[j] += sj * A[j]; p[t] += st * A[t]; p[0] += n[0] * r; p[1] += n[1] * r; p[2] += n[2] * r; return p; };
      q4(k, [P(-1, n1), P(1, n1), P(1, n2), P(-1, n2)], [n1, n1, n2, n2], ec);
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const b = [x + sx * A[0], y + sy * A[1], z + sz * A[2]];
    t3(k, [[b[0] + sx * r, b[1], b[2]], [b[0], b[1] + sy * r, b[2]], [b[0], b[1], b[2] + sz * r]], [[sx, 0, 0], [0, sy, 0], [0, 0, sz]], ec);
  }
}
// boîte simple (sans chanfrein) avec couleurs par face
const box = (k, x, y, z, w, h, d, c, o = {}) => rbox(k, x, y, z, w, h, d, 0, c, o);

// ───────── profils 2D ─────────
// rectangle à coins arrondis (sens trigonométrique), n segments par coin
function rrect(w, h, r, n = 3, cx = 0, cy = 0) {
  r = Math.min(r, w / 2, h / 2); const P = [], C = [[w / 2 - r, -h / 2 + r, -PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, PI / 2], [-w / 2 + r, -h / 2 + r, PI]];
  for (const [x, y, a0] of C) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * PI / 2; P.push([cx + x + Math.cos(a) * r, cy + y + Math.sin(a) * r]); }
  return P;
}
function arcPts(cx, cy, r, a0, a1, n) { const P = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return P; }
const area2 = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

// Prisme : polygone (x, y) extrudé de z0 à z1. o.smooth : angle (rad) sous lequel les arêtes du profil sont lissées ;
// o.r : chanfrein du pourtour des deux faces ; o.cap / o.side : couleurs ; o.capR : étiquette de la face +z
// (projetée sur la boîte du profil) ; o.noBack / o.noFront : faces omises.
function ext(k, pts, z0, z1, c, o = {}) {
  let P = pts.map((p) => [p[0], p[1]]); const rev = area2(P) < 0; if (rev) P.reverse();
  const n = P.length, r = Math.min(o.r || 0, (z1 - z0) / 2 - 1e-4), sm = o.smooth ?? 0.5, cc = o.cap ?? c;
  // couleur par arête du profil d'origine (l'ordre est inversé si le profil était horaire)
  const sc = Array.isArray(o.side) ? o.side.map((_, i) => o.side[rev ? (2 * n - 2 - i) % n : i]) : (o.side ?? c);
  const EN = P.map((p, i) => { const q = P[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });
  // normale de sommet (lissée si l'angle est faible), par côté
  const VN = (i, e) => { const a = EN[(i - 1 + n) % n], b = EN[i % n], ang = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))); if (ang > sm) return e; const m = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(m[0], m[1]) || 1; return [m[0] / l, m[1] / l]; };
  const za = z0 + r, zb = z1 - r;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ni = VN(i, EN[i]), nj = VN(j, EN[i]);
    q4(k, [[P[i][0], P[i][1], za], [P[j][0], P[j][1], za], [P[j][0], P[j][1], zb], [P[i][0], P[i][1], zb]], [[ni[0], ni[1], 0], [nj[0], nj[1], 0], [nj[0], nj[1], 0], [ni[0], ni[1], 0]], Array.isArray(sc) ? sc[i % sc.length] : sc);
  }
  let Q = P;
  if (r > 0) {
    // contour intérieur (onglets limités) et bandes de chanfrein à normales lissées
    Q = P.map((p, i) => { const a = EN[(i - 1 + n) % n], b = EN[i], m = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(m[0], m[1]) || 1, cs = Math.max(0.35, (m[0] * a[0] + m[1] * a[1]) / l); return [p[0] - m[0] / l * r / cs, p[1] - m[1] / l * r / cs]; });
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ni = VN(i, EN[i]), nj = VN(j, EN[i]), bc = Array.isArray(sc) ? sc[i % sc.length] : sc;
      if (!o.noFront) q4(k, [[P[i][0], P[i][1], zb], [P[j][0], P[j][1], zb], [Q[j][0], Q[j][1], z1], [Q[i][0], Q[i][1], z1]], [[ni[0], ni[1], 0], [nj[0], nj[1], 0], [0, 0, 1], [0, 0, 1]], bc);
      if (!o.noBack) q4(k, [[P[i][0], P[i][1], za], [P[j][0], P[j][1], za], [Q[j][0], Q[j][1], z0], [Q[i][0], Q[i][1], z0]], [[ni[0], ni[1], 0], [nj[0], nj[1], 0], [0, 0, -1], [0, 0, -1]], bc);
    }
  }
  const tris = THREE.ShapeUtils.triangulateShape(Q.map((p) => new THREE.Vector2(p[0], p[1])), []);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of Q) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (const [zz, nz, skip] of [[z1, 1, o.noFront], [z0, -1, o.noBack]]) {
    if (skip) continue;
    const R = nz > 0 ? o.capR : o.backR, col = L(R ? 0xffffff : (nz > 0 ? cc : (o.back ?? cc))), base = k.b.vertexCount;
    for (const p of Q) { const u = R ? R.u0 + (R.u1 - R.u0) * (nz > 0 ? (p[0] - x0) / (x1 - x0) : (x1 - p[0]) / (x1 - x0)) : undefined, v = R ? R.v0 + (R.v1 - R.v0) * (p[1] - y0) / (y1 - y0) : undefined; pv(k, p[0], p[1], zz, 0, 0, nz, col, u, v); }
    for (const t of tris) { const g = cross3([...Q[t[0]], 0], [...Q[t[1]], 0], [...Q[t[2]], 0]); if (g[2] * nz >= 0) k.b.idx.push(base + t[0], base + t[1], base + t[2]); else k.b.idx.push(base + t[0], base + t[2], base + t[1]); }
  }
}
// prisme d'axe x (profil dans le plan z-y, épaisseur de x0 à x1) : panneaux latéraux
function extX(k, pts, x0, x1, c, o = {}) { at(k, M(0, 0, 0, 0, PI / 2, 0), () => ext(k, pts.map((p) => [-p[0], p[1]]), x0, x1, c, o)); }

// Surface de révolution (axe y) : profil [[r, y, couleur?, 'h'?], …] (couleur du segment qui mène au point ;
// 'h' = arête vive). o.segs, o.top / o.bot (couleur des fonds, sinon ouverts), o.rz (ellipse), o.m (repère).
function lat(k, prof, c, o = {}) {
  const run = (pr) => {
    const parts = {}; const rings = pr.map((p) => { const col = p[2] ?? c, key = 'c' + col; parts[key] = { c: col }; return { r: Math.max(1e-4, p[0]), rz: o.rz ? Math.max(1e-4, p[0] * o.rz) : undefined, y: p[1], p: key }; });
    return [rings, parts];
  };
  const go = () => {
    let start = 0;
    for (let i = 1; i < prof.length; i++) {
      if (prof[i][3] === 'h' || i === prof.length - 1) {
        const [rings, parts] = run(prof.slice(start, i + 1));
        k.lathe(rings, o.segs || 12, parts, { bottom: start === 0 ? (o.bot ?? null) : null, top: i === prof.length - 1 ? (o.top ?? null) : null });
        start = i;
      }
    }
  };
  if (o.m) at(k, o.m, go); else go();
}
// cylindre plein d'axe quelconque : ax 'x' | 'y' | 'z'
function cyl(k, x, y, z, r, len, c, ax = 'y', segs = 10, o = {}) {
  const m = ax === 'x' ? M(x, y, z, 0, 0, PI / 2) : ax === 'z' ? M(x, y, z, PI / 2, 0, 0) : M(x, y, z);
  lat(k, [[o.r0 ?? r, -len / 2], [o.r1 ?? r, len / 2]], c, { segs, m, top: o.open ? null : (o.tc ?? c), bot: o.open ? null : (o.bc ?? c) });
}
// disque plat (normale n), éventuellement anneau (ri)
function disc(k, x, y, z, r, c, n = [0, 0, 1], segs = 12, ri = 0) {
  const N = new THREE.Vector3(...n).normalize(), U = new THREE.Vector3(Math.abs(N.y) < 0.9 ? 0 : 1, Math.abs(N.y) < 0.9 ? 1 : 0, 0).cross(N).normalize(), V = new THREE.Vector3().crossVectors(N, U);
  const col = L(c), o = k.b.vertexCount, nn = [N.x, N.y, N.z];
  const P = (rr, a) => [x + (U.x * Math.cos(a) + V.x * Math.sin(a)) * rr, y + (U.y * Math.cos(a) + V.y * Math.sin(a)) * rr, z + (U.z * Math.cos(a) + V.z * Math.sin(a)) * rr];
  if (ri > 0) {
    for (let j = 0; j <= segs; j++) { const a = j / segs * TAU, p = P(r, a), q = P(ri, a); pv(k, ...p, ...nn, col); pv(k, ...q, ...nn, col); }
    for (let j = 0; j < segs; j++) { const a = o + j * 2; k.b.idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
    return;
  }
  pv(k, x, y, z, ...nn, col); for (let j = 0; j < segs; j++) pv(k, ...P(r, j / segs * TAU), ...nn, col);
  for (let j = 0; j < segs; j++) k.b.idx.push(o, o + 1 + j, o + 1 + (j + 1) % segs);
}

// Tube le long d'une polyligne (repères à transport parallèle). r : rayon ou fonction (t ∈ [0, 1]) ; o.segs ;
// o.caps : fonds ; o.closed : boucle ; o.sq : section carrée orientée (4 côtés) ; o.sec : section quelconque
// [[u, v], …] (sens trigonométrique, u selon la normale N = T × up, v selon B), mise à l'échelle par r.
function sweep(k, pts, r, c, o = {}) {
  if (o.sec) { const S2 = o.sec, m = S2.length; o = { ...o, segs: m, _sec: S2.map((p, i) => { const a = S2[(i - 1 + m) % m], b = S2[(i + 1) % m], nx = b[1] - a[1], ny = -(b[0] - a[0]), l = Math.hypot(nx, ny) || 1; return [p[0], p[1], nx / l, ny / l]; }) }; }
  const n = pts.length, segs = o.segs || 6, closed = !!o.closed; if (n < 2) return;
  const P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const T = P.map((p, i) => { const a = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]; return b.clone().sub(a).normalize(); });
  const len = [0]; for (let i = 1; i < n; i++) len.push(len[i - 1] + P[i].distanceTo(P[i - 1])); const tot = len[n - 1] || 1;
  const up = o.up ? new THREE.Vector3(...o.up) : (Math.abs(T[0].y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
  const N = new THREE.Vector3().crossVectors(T[0], up).normalize(), B = new THREE.Vector3(), q = new THREE.Quaternion(), col = L(c), base = k.b.vertexCount;
  const ring = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) { q.setFromUnitVectors(T[i - 1], T[i]); N.applyQuaternion(q).normalize(); }
    B.crossVectors(T[i], N);
    const rr = typeof r === 'function' ? r(len[i] / tot) : r;
    // épaisseur conservée dans les coudes : section agrandie dans le plan de la bissectrice
    let kb = 1; if (i > 0 && i < n - 1) { const a = P[i].clone().sub(P[i - 1]).normalize(), b2 = P[i + 1].clone().sub(P[i]).normalize(); kb = 1 / Math.max(0.5, Math.cos(Math.acos(Math.max(-1, Math.min(1, a.dot(b2)))) / 2)); }
    ring.push([N.clone(), B.clone(), rr, kb]);
    for (let j = 0; j <= segs; j++) {
      if (o._sec) { const [u, v, nu, nv] = o._sec[j % segs]; pv(k, P[i].x + (N.x * u + B.x * v) * rr * kb, P[i].y + (N.y * u + B.y * v) * rr * kb, P[i].z + (N.z * u + B.z * v) * rr * kb, N.x * nu + B.x * nv, N.y * nu + B.y * nv, N.z * nu + B.z * nv, col); continue; }
      const a = (j / segs) * TAU + (o.sq ? PI / 4 : 0), ca = Math.cos(a), sa = Math.sin(a);
      const nx = N.x * ca + B.x * sa, ny = N.y * ca + B.y * sa, nz = N.z * ca + B.z * sa;
      pv(k, P[i].x + nx * rr * kb, P[i].y + ny * rr * kb, P[i].z + nz * rr * kb, nx, ny, nz, col);
    }
  }
  const row = segs + 1, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < segs; j++) { const a = base + i * row + j, b = a + 1, c2 = base + i2 * row + j + 1, d = base + i2 * row + j; k.b.idx.push(a, b, c2, a, c2, d); }
  }
  if (o.caps && !closed) for (const [i, s] of [[0, -1], [n - 1, 1]]) {
    const [Nn, Bn, rr] = ring[i], t = T[i], o2 = k.b.vertexCount;
    const cu = o._sec ? o._sec.reduce((a, p) => a + p[0], 0) / segs * rr : 0, cv = o._sec ? o._sec.reduce((a, p) => a + p[1], 0) / segs * rr : 0; // centre de la section
    pv(k, P[i].x + Nn.x * cu + Bn.x * cv, P[i].y + Nn.y * cu + Bn.y * cv, P[i].z + Nn.z * cu + Bn.z * cv, t.x * s, t.y * s, t.z * s, col);
    for (let j = 0; j < segs; j++) { const a = (j / segs) * TAU + (o.sq ? PI / 4 : 0), u = o._sec ? o._sec[j][0] : Math.cos(a), v = o._sec ? o._sec[j][1] : Math.sin(a); pv(k, P[i].x + (Nn.x * u + Bn.x * v) * rr, P[i].y + (Nn.y * u + Bn.y * v) * rr, P[i].z + (Nn.z * u + Bn.z * v) * rr, t.x * s, t.y * s, t.z * s, col); }
    for (let j = 0; j < segs; j++) { const a = o2 + 1 + j, b = o2 + 1 + (j + 1) % segs; if (s > 0) k.b.idx.push(o2, a, b); else k.b.idx.push(o2, b, a); }
  }
}
// Polyligne aux coins arrondis (rayon rad, n segments par coin)
function rpath(pts, rad, n = 3) {
  if (pts.length < 3 || rad <= 0) return pts;
  const V = pts.map((p) => new THREE.Vector3(...p)), out = [pts[0]];
  for (let i = 1; i < V.length - 1; i++) {
    const a = V[i - 1].clone().sub(V[i]), b = V[i + 1].clone().sub(V[i]), la = a.length(), lb = b.length(); a.normalize(); b.normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); if (ang > PI - 0.01) { out.push(pts[i]); continue; }
    const t = Math.min(rad / Math.tan(ang / 2), la * 0.48, lb * 0.48);
    const p0 = V[i].clone().addScaledVector(a, t), p1 = V[i].clone().addScaledVector(b, t);
    for (let j = 0; j <= n; j++) { const s = j / n, q = p0.clone().multiplyScalar((1 - s) * (1 - s)).addScaledVector(V[i], 2 * s * (1 - s)).addScaledVector(p1, s * s); out.push([q.x, q.y, q.z]); }
  }
  out.push(pts[pts.length - 1]); return out;
}
// courbe de câble pendant entre deux points (flèche sag), n points
function cable(p0, p1, sag, n = 8) { const P = []; for (let i = 0; i <= n; i++) { const t = i / n; P.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - sag * 4 * t * (1 - t), p0[2] + (p1[2] - p0[2]) * t]); } return P; }

// ───────── petits détails récurrents ─────────
// rangée de fentes d'aération sur une face (f) : n fentes de w × h, pas p le long de u (ou v si vert)
function slots(k, x, y, z, n, w, h, p, c, f = 'Z', vert = false) {
  const [, u, v] = FACE[f], d = vert ? v : u;
  for (let i = 0; i < n; i++) { const t = (i - (n - 1) / 2) * p; fq(k, x + d[0] * t, y + d[1] * t, z + d[2] * t, w, h, c, f); }
}
// étiquette de l'atlas (texte, panneaux) : rectangle UV partagé
const lab = (k, key, w, h, info) => k.shared('dev:' + key, w, h, info);
// rangée de touches/boutons d'un clavier (grille) via l'atlas (une seule face)
const keypad = (k, key, nx, nz, bg) => lab(k, 'kp' + key, nx * 14, nz * 14, { kind: 'lids', nx, nz, square: true, bg });
// outils réutilisés par devices.js (moniteurs, assiettes, poissons construits par quickGeometry)
export const DK = { M, at, rbox, box, fq, fqg, ext, extX, lat, cyl, disc, sweep, rpath, rrect, slots, lab, shade };

// Surface lissée entre anneaux successifs de même nombre de points (profils fermés dans le plan x-y, le long de z) :
// rings = [{z, pts: [[x, y], …]}] ; o.c0 / o.c1 : couleurs des fonds (null = ouvert) ; o.cols : couleur par anneau ;
// o.flip : surface vue de l'intérieur (cuvettes)
function loft(k, rings, c, o = {}) {
  const m = rings[0].pts.length, base = k.b.vertexCount, R = rings.map((r) => r.pts.map((p) => [p[0], p[1], r.z]));
  const ctr = R.map((ring) => [ring.reduce((s, p) => s + p[0], 0) / m, ring.reduce((s, p) => s + p[1], 0) / m]);
  for (let i = 0; i < R.length; i++) for (let j = 0; j < m; j++) {
    const a = R[i][(j + 1) % m], b = R[i][(j - 1 + m) % m], u = R[Math.min(R.length - 1, i + 1)][j], d = R[Math.max(0, i - 1)][j];
    let n = cross3([0, 0, 0], [a[0] - b[0], a[1] - b[1], a[2] - b[2]], [u[0] - d[0], u[1] - d[1], u[2] - d[2]]); const l = Math.hypot(...n) || 1; n = n.map((v) => v / l);
    if ((n[0] * (R[i][j][0] - ctr[i][0]) + n[1] * (R[i][j][1] - ctr[i][1]) < 0) !== !!o.flip) n = n.map((v) => -v); // vers l'extérieur (ou l'intérieur)
    pv(k, ...R[i][j], ...n, L(o.cols ? o.cols[i] : c));
  }
  for (let i = 0; i < R.length - 1; i++) for (let j = 0; j < m; j++) {
    const a = base + i * m + j, b = base + i * m + (j + 1) % m, c2 = base + (i + 1) * m + (j + 1) % m, d = base + (i + 1) * m + j;
    const g = cross3(R[i][j], R[i][(j + 1) % m], R[i + 1][j]);
    if ((g[0] * (R[i][j][0] - ctr[i][0]) + g[1] * (R[i][j][1] - ctr[i][1]) >= 0) !== !!o.flip) k.b.idx.push(a, b, c2, a, c2, d); else k.b.idx.push(a, c2, b, a, d, c2);
  }
  const dir = (Math.sign(R[R.length - 1][0][2] - R[0][0][2]) || 1) * (o.flip ? -1 : 1);
  for (const [i, col, s] of [[0, o.c0, -dir], [R.length - 1, o.c1, dir]]) {
    if (col == null) continue;
    const P = R[i], o2 = k.b.vertexCount, tris = THREE.ShapeUtils.triangulateShape(P.map((p) => new THREE.Vector2(p[0], p[1])), []);
    for (const p of P) pv(k, ...p, 0, 0, s, L(col));
    for (const t of tris) { const g = cross3(P[t[0]], P[t[1]], P[t[2]]); if (g[2] * s >= 0) k.b.idx.push(o2 + t[0], o2 + t[1], o2 + t[2]); else k.b.idx.push(o2 + t[0], o2 + t[2], o2 + t[1]); }
  }
}
// Cadre plat percé d'une ouverture à coins arrondis (face +z à z, lèvre intérieure de profondeur dep) : lunettes
// d'écrans, hublots, encadrements. Ouverture iw × ih (rayon ir) centrée en (o.ix, o.iy) dans le cadre ow × oh.
function bezel(k, x, y, z, ow, oh, iw, ih, ir, dep, c, o = {}) {
  const cx = o.ix || 0, cy = o.iy || 0, hole = rrect(iw, ih, ir, o.n ?? 3, cx, cy), outer = [[-ow / 2, -oh / 2], [ow / 2, -oh / 2], [ow / 2, oh / 2], [-ow / 2, oh / 2]];
  const tris = THREE.ShapeUtils.triangulateShape(outer.map((p) => new THREE.Vector2(p[0], p[1])), [hole.map((p) => new THREE.Vector2(p[0], p[1]))]);
  const all = outer.concat(hole), col = L(c), o2 = k.b.vertexCount;
  for (const p of all) pv(k, x + p[0], y + p[1], z, 0, 0, 1, col);
  for (const t of tris) { const g = cross3([...all[t[0]], 0], [...all[t[1]], 0], [...all[t[2]], 0]); if (g[2] >= 0) k.b.idx.push(o2 + t[0], o2 + t[1], o2 + t[2]); else k.b.idx.push(o2 + t[0], o2 + t[2], o2 + t[1]); }
  if (dep > 0) { // lèvre : parois de l'ouverture, normales vers le centre
    const n = hole.length, lc = o.lip ?? c;
    for (let i = 0; i < n; i++) {
      const p = hole[i], q = hole[(i + 1) % n], np = [cx - p[0], cy - p[1]], nq = [cx - q[0], cy - q[1]], lp = Math.hypot(...np) || 1, lq = Math.hypot(...nq) || 1;
      q4(k, [[x + p[0], y + p[1], z], [x + q[0], y + q[1], z], [x + q[0], y + q[1], z - dep], [x + p[0], y + p[1], z - dep]], [[np[0] / lp, np[1] / lp, 0], [nq[0] / lq, nq[1] / lq, 0], [nq[0] / lq, nq[1] / lq, 0], [np[0] / lp, np[1] / lp, 0]], lc);
    }
  }
}

// ═════════════════════════ ÉLECTRONIQUE ═════════════════════════
// Caisse enregistreuse (TPV) : tiroir-caisse, écran tactile incliné sur pied, imprimante à tickets, afficheur client
// tourné vers le client, scanner à main sur son socle, terminal de paiement. Avant (+z) = côté caissier.
S('register', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yt = y0 + 0.094, zf = dd / 2 + 0.0006, term = 0x1d1e20;
  rbox(k, 0, y0 + 0.047, 0, w, 0.094, dd, 0.006, c);
  // façade du tiroir : joints, prise de main, serrure à clé
  fq(k, 0, y0 + 0.084, zf, w - 0.024, 0.0025, BLACK); fq(k, 0, y0 + 0.012, zf, w - 0.024, 0.0025, BLACK);
  for (const sx of [-1, 1]) fq(k, sx * (w / 2 - 0.012), y0 + 0.048, zf, 0.0025, 0.074, BLACK);
  fq(k, 0, y0 + 0.02, zf, 0.13, 0.01, 0x0c0c0d);
  disc(k, w / 2 - 0.05, y0 + 0.06, zf + 0.0004, 0.009, CHROME, [0, 0, 1], 10); fq(k, w / 2 - 0.05, y0 + 0.06, zf + 0.0008, 0.0022, 0.009, 0x222222);
  // pied et écran tactile
  rbox(k, 0, yt + 0.006, -0.06, 0.15, 0.012, 0.12, 0.004, term);
  rbox(k, 0, yt + 0.036, -0.068, 0.06, 0.05, 0.035, 0.008, term);
  const tilt = 0.38, hw = 0.19, hh = 0.148, ht = 0.034, yc = h / 2 - (hh * Math.cos(tilt) + ht * Math.sin(tilt)) / 2 - 0.0015, zc = -0.035;
  at(k, M(0, yc, zc, -tilt), () => {
    rbox(k, 0, 0, 0, hw, hh, ht, 0.007, term);
    fq(k, 0, 0.004, ht / 2 + 0.0004, hw - 0.022, hh - 0.03, 0x050607); // dalle éteinte
    fq(k, 0, -hh / 2 + 0.008, ht / 2 + 0.0005, 0.005, 0.003, 0x00e676); // voyant
    fq(k, 0, 0.01, -ht / 2 - 0.0004, 0.1, 0.1, 0x262729, 'z'); // plaque VESA
  });
  const sc = new THREE.Vector3(0, 0.004, ht / 2 + 0.0004).applyAxisAngle(new THREE.Vector3(1, 0, 0), -tilt);
  k.meta.screen = { x: 0, y: yc + sc.y, z: zc + sc.z - 0.0018, w: hw - 0.024, h: hh - 0.032, tilt: -tilt };
  // imprimante à tickets (fente, ticket qui dépasse, voyant, bouton d'avance)
  const px = w / 2 - 0.062, pz = -dd / 2 + 0.078;
  rbox(k, px, yt + 0.042, pz, 0.11, 0.084, 0.14, 0.012, 0x2a2b2d);
  fq(k, px, yt + 0.0845, pz + 0.035, 0.07, 0.006, 0x050505, 'Y');
  at(k, M(px, yt + 0.098, pz + 0.04, -0.55), () => box(k, 0, 0, 0, 0.058, 0.03, 0.0012, 0xf4f1ea));
  fq(k, px - 0.03, yt + 0.06, pz + 0.0706, 0.004, 0.004, 0x00e676); rbox(k, px + 0.025, yt + 0.06, pz + 0.071, 0.016, 0.01, 0.004, 0.0015, 0x4a4b4e);
  // afficheur client (VFD vert, tourné vers -z)
  const ax = -w / 2 + 0.07, az = -dd / 2 + 0.05;
  cyl(k, ax, yt + 0.05, az, 0.008, 0.1, 0x3a3b3d, 'y', 8);
  rbox(k, ax, h / 2 - 0.025, az, 0.13, 0.046, 0.03, 0.006, term);
  fq(k, ax, h / 2 - 0.025, az - 0.0156, 0.112, 0.03, 0, 'z', lab(k, 'vfd', 96, 26, { kind: 'sign', name: 'BONSOIR', bg: 0x062a20, fg: 0x45ffc0, accent: 0x062a20 }));
  // scanner à main sur son socle
  const sx0 = -w / 2 + 0.06, sz0 = dd / 2 - 0.075;
  rbox(k, sx0, yt + 0.01, sz0, 0.07, 0.02, 0.085, 0.006, term);
  at(k, M(sx0, yt + 0.055, sz0 - 0.005, -0.32), () => {
    rbox(k, 0, 0, 0, 0.032, 0.085, 0.036, 0.01, 0x262729);
    rbox(k, 0, 0.055, 0.018, 0.058, 0.04, 0.07, 0.012, 0x262729);
    fq(k, 0, 0.055, 0.0532, 0.046, 0.026, 0x8b0000);
    rbox(k, 0, 0.022, 0.02, 0.012, 0.016, 0.01, 0.003, 0xfdd835); // gâchette
  });
  // terminal de paiement (écran, clavier, fente à carte)
  const tx = w / 2 - 0.055, tz = dd / 2 - 0.09;
  at(k, M(tx, yt + 0.02, tz, 0.1), () => {
    rbox(k, 0, 0, 0, 0.078, 0.03, 0.16, 0.012, 0x2a2b2d);
    fq(k, 0, 0.0152, -0.035, 0.056, 0.042, 0x0b1a26, 'Y');
    fq(k, 0, 0.0152, 0.03, 0.056, 0.066, 0, 'Y', keypad(k, 'tpe', 3, 4));
    fq(k, 0, 0.004, 0.0802, 0.05, 0.003, 0x050505);
  });
  k.meta.drawer = { x: 0, y: y0 + 0.047, z: dd / 2, w: w * 0.94, h: 0.08, d: dd * 0.8 };
});

// Téléviseur à écran plat mural : cadre fin (bas un peu plus haut : logo, voyant), coque arrière bombée, support VESA
S('tv', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], zf = dd / 2;
  rbox(k, 0, 0, zf - 0.007, w, h, 0.014, 0.004, c);
  const sw = w - 0.026, shh = h - 0.044, sy = 0.009;
  fq(k, 0, sy, zf + 0.0006, sw, shh, 0x06080a);
  rbox(k, 0, -0.04, zf - 0.035, w * 0.74, h * 0.6, 0.042, 0.018, shade(c, 1.35), { skip: 'Z' });
  rbox(k, 0, -0.03, -dd / 2 + 0.012, 0.36, 0.22, 0.024, 0.004, 0x2b2d30, { skip: 'Z' });
  for (const sx of [-1, 1]) fq(k, sx * 0.11, -0.03, -dd / 2 - 0.0004, 0.05, 0.16, 0x1a1b1d, 'z');
  fq(k, 0, -h / 2 + 0.008, zf + 0.0007, 0.07, 0.009, 0, 'Z', lab(k, 'tvlogo', 56, 8, { kind: 'plain', bg: c, fg: 0x9a9da0, brand: 'ORION' }));
  fq(k, w / 2 - 0.05, -h / 2 + 0.007, zf + 0.0007, 0.004, 0.003, 0xff1744);
  slots(k, 0, -h / 2 - 0.0004, zf - 0.006, 24, 0.012, 0.004, 0.022, 0x050505, 'y');
  for (let i = 0; i < 4; i++) fq(k, w * 0.2 + i * 0.03, -0.12, zf - 0.0565, 0.016, 0.008, 0x0a0a0a, 'z'); // connectique
  k.meta.screen = { x: 0, y: sy, z: zf + 0.0006, w: sw, h: shh };
});

// Téléviseur cathodique des années 80 : caisson façon bois, façade sombre, dalle derrière une lunette à coins
// arrondis, colonne de commandes (haut-parleur, boutons rotatifs, touches de programmes, voyant), cul du tube conique
S('crt', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], zf = dd / 2 - 0.0145, cd = 0.3, zc = zf - cd / 2, face = 0x232425;
  rbox(k, 0, 0, zc, w, h, cd, 0.018, c, { skip: 'Z' });
  const r = 0.018, fw = w - 2 * r, fh = h - 2 * r, ix = -0.06, iy = 0.022, iw = 0.392, ih = 0.296;
  bezel(k, 0, 0, zf, fw, fh, iw, ih, 0.034, 0.014, face, { ix, iy, lip: 0x111213 });
  fqg(k, ix, iy, zf - 0.0145, iw + 0.02, ih + 0.02, 0x10161a, 0x1f2a30); // dalle du tube
  k.meta.screen = { x: ix, y: iy, z: zf - 0.0135, w: iw + 0.008, h: ih + 0.008 };
  // colonne de commandes
  const cx = w / 2 - 0.075;
  slots(k, cx, iy + 0.09, zf + 0.0005, 7, 0.07, 0.004, 0.011, 0x0a0a0a, 'Z', true);
  for (const [yy, rr] of [[iy - 0.02, 0.018], [iy - 0.075, 0.014]]) { lat(k, [[rr, 0], [rr, 0.009], [rr * 0.82, 0.0135, null, 'h'], [0.001, 0.0135]], 0x3a3b3d, { segs: 12, m: M(cx, yy, zf, PI / 2), bot: 0x3a3b3d }); fq(k, cx, yy + rr * 0.55, zf + 0.014, 0.003, rr * 0.6, 0xe0e0e0); }
  for (let i = 0; i < 6; i++) rbox(k, cx - 0.025 + (i % 3) * 0.025, iy - 0.115 - Math.floor(i / 3) * 0.02, zf + 0.003, 0.018, 0.012, 0.008, 0.002, 0x4a4b4e);
  rbox(k, cx, -h / 2 + 0.055, zf + 0.003, 0.05, 0.016, 0.008, 0.003, 0x58595c); fq(k, cx + 0.035, -h / 2 + 0.055, zf + 0.0006, 0.005, 0.005, 0xd50000);
  fq(k, ix, -h / 2 + 0.05, zf + 0.0006, 0.08, 0.012, 0, 'Z', lab(k, 'crtlogo', 64, 10, { kind: 'plain', bg: face, fg: 0xc9b98a, brand: 'Télé-Star' }));
  // cul du tube : tronc de pyramide arrondi, aérations, presse-étoupe du cordon
  loft(k, [{ z: zf - cd, pts: rrect(w - 0.08, h - 0.07, 0.05, 2, 0, 0.005) }, { z: zf - cd - 0.1, pts: rrect(w * 0.6, h * 0.62, 0.05, 2, 0, 0.02) }, { z: -dd / 2, pts: rrect(w * 0.42, h * 0.44, 0.04, 2, 0, 0.03) }], 0x2a2a2b, { c1: 0x2a2a2b });
  slots(k, 0, 0.05, -dd / 2 - 0.0005, 6, 0.012, 0.11, 0.022, 0x111111, 'z');
  cyl(k, 0.06, -0.06, -dd / 2 + 0.012, 0.007, 0.024, 0x111111, 'z', 6);
});

// ═════════════════════════ ARCADE ═════════════════════════
// Habillage par jeu : accent (moulures en T, liserés, marquee), fond des décors, pictogramme, titre
export const ARCADE_ART = {
  invaders: [0x00e676, 0x0f1a14, 'ghost', 'INVADERS'], racer: [0xff1744, 0x1c0e10, 'car', 'TURBO RACER'], glouton: [0xffea00, 0x0d1030, 'ghost', 'GLOUTON'],
  blocs: [0x00b0ff, 0x0b1826, 'cube', 'BLOCS'], platformer: [0xff9100, 0x1d1408, 'star', 'SUPER SAUT'], oiseau: [0x76ff03, 0x0b1d1a, 'sun', 'OISEAU'],
  breakout: [0xe040fb, 0x170c1d, 'ball', 'CASSE-BRIQUES'], snake: [0x64dd17, 0x0f1a0b, 'leaf', 'SERPENT'], simon: [0xff4081, 0x1b0b12, 'note', 'SIMON'],
  pong: [0x40c4ff, 0x0b1626, 'ball', 'AIR HOCKEY'], dance: [0xff4081, 0x1a0b2e, 'note', 'DANCE FEVER'], claw: [0xffea00, 0x3a0a2a, 'gift', 'ATTRAP\'PELUCHE'],
};
const artOf = (d) => (d.s[0] > 1.0 && d.shape === 'arcade' ? ARCADE_ART.dance : ARCADE_ART[d.p?.game] || ARCADE_ART.invaders);
const sphereP = (r, cy, n = 6) => Array.from({ length: n + 1 }, (_, i) => { const t = PI * i / n; return [Math.max(0.0004, r * Math.sin(t)), cy - r * Math.cos(t)]; });
// bouton d'arcade (bague noire, poussoir concave), axe local y ; rot : inclinaison autour de x
function arcBtn(k, x, y, z, rot, c, r = 0.015) { lat(k, [[r * 1.2, 0], [r * 1.2, 0.003, BLACK], [r, 0.003, BLACK, 'h'], [r, 0.01, c], [r * 0.6, 0.0085, c, 'h'], [0.001, 0.0075, c]], c, { segs: 10, m: M(x, y, z, rot) }); }

// Borne d'arcade verticale : flancs profilés (moulure en T de couleur, décor latéral), plinthe, porte à monnayeur
// (deux monnayeurs éclairés, serrure, bac de retour), pupitre (joystick à boule, 6 boutons, départs 1P/2P), lunette
// inclinée de l'écran, haut-parleurs, marquee éclairé encadré de chrome.
function arcadeCab(k, s, c, d) {
  const w = s[0], h = s[1], dd = s[2], t = 0.019, wi = w / 2 - t, W = 2 * wi, A = artOf(d), acc = A[0], body = mix(c, A[1], 0.6), g = d.p?.game || 'x';
  const sz = dd / 0.8, sy = h / 1.8, Z = (z) => z * sz, Y = (y) => y * sy, XA = new THREE.Vector3(1, 0, 0);
  const prof = [[-0.40, -0.90], [0.205, -0.90], [0.205, -0.075], [0.40, -0.03], [0.40, 0.065], [0.255, 0.115], [0.135, 0.60], [0.215, 0.645], [0.215, 0.90], [-0.40, 0.90]].map(([z, y]) => [Z(z), Y(y)]);
  const art = lab(k, 'arcside:' + g, 64, 140, { kind: 'card', bg: A[1], accent: acc, picto: A[2], pc: acc, name: A[3], sub: 'HÉLIOS ARCADE' });
  extX(k, prof, wi, w / 2, body, { side: acc, r: 0.003, capR: art });
  extX(k, prof, -w / 2, -wi, body, { side: acc, r: 0.003, backR: art });
  box(k, 0, 0, Z(-0.39), W, h - 0.004, Z(0.02), shade(body, 0.85), { skip: 'xX' }); // dos
  box(k, 0, Y(0.89), Z(-0.0875), W, Y(0.02), Z(0.585), BLACK, { skip: 'xX' }); // dessus
  box(k, 0, Y(-0.84), Z(0.19), W, Y(0.12), Z(0.02), 0x0e0f10, { skip: 'xX' }); // plinthe
  box(k, 0, Y(-0.4275), Z(0.185), W, Y(0.705), Z(0.02), body, { skip: 'xX' }); // façade
  // porte à monnayeur
  const cz = Z(0.195), cy = Y(-0.42);
  rbox(k, 0, cy, cz + 0.006, 0.3, 0.38, 0.012, 0.004, STEEL);
  for (const sx of [-1, 1]) {
    box(k, sx * 0.065, cy + 0.09, cz + 0.015, 0.072, 0.11, 0.006, 0x3c3f42);
    rbox(k, sx * 0.065, cy + 0.105, cz + 0.021, 0.034, 0.052, 0.006, 0.0025, 0xff5a1f);
    fq(k, sx * 0.065, cy + 0.105, cz + 0.0242, 0.0035, 0.032, 0x1a0500);
    box(k, sx * 0.065, cy + 0.058, cz + 0.02, 0.028, 0.018, 0.005, BLACK);
    fq(k, sx * 0.065, cy - 0.01, cz + 0.0122, 0.07, 0.022, 0, 'Z', lab(k, 'jeton', 48, 16, { kind: 'sign', name: '1 JETON', bg: 0x212121, fg: 0xffffff, accent: 0xffd600 }));
  }
  disc(k, 0, cy - 0.08, cz + 0.0122, 0.012, CHROME, [0, 0, 1], 10); fq(k, 0, cy - 0.08, cz + 0.0126, 0.002, 0.012, 0x222222);
  box(k, 0, cy - 0.15, cz + 0.016, 0.07, 0.045, 0.008, 0x2b2c2e); fq(k, 0, cy - 0.15, cz + 0.0202, 0.05, 0.028, 0x080808);
  for (const yy of [0.12, -0.12]) box(k, -0.153, cy + yy, cz + 0.004, 0.012, 0.05, 0.01, 0x7d8388);
  // pupitre
  const cpP = [[0.195, -0.075], [0.40, -0.03], [0.40, 0.065], [0.255, 0.115], [0.195, 0.115]].map(([z, y]) => [Z(z), Y(y)]);
  extX(k, cpP, -wi, wi, 0x151617, { side: [0x101010, acc, 0x1a1b1d, 0x101010, 0x101010], noFront: true, noBack: true });
  const ang = Math.atan2(Y(0.05), Z(0.145)), P0 = [Z(0.40), Y(0.065)], P1 = [Z(0.255), Y(0.115)];
  const sp = (u) => [P0[0] + (P1[0] - P0[0]) * u, P0[1] + (P1[1] - P0[1]) * u];
  { const [zz, yy] = sp(0.48); at(k, M(-W * 0.24, yy, zz, ang), () => { disc(k, 0, 0.0008, 0, 0.03, BLACK, [0, 1, 0], 12); cyl(k, 0, 0.033, 0, 0.0055, 0.064, 0x2a2a2a, 'y', 6); lat(k, sphereP(0.019, 0.083), 0xe53935, { segs: 10 }); }); }
  const BC = [0xff1744, 0xffea00, 0x00e676, 0x2979ff, 0xff9100, 0xd500f9];
  for (let i = 0; i < 6; i++) { const [zz, yy] = sp(i < 3 ? 0.64 : 0.3); arcBtn(k, W * 0.02 + (i % 3) * 0.056 + (i < 3 ? 0.014 : 0), yy, zz, ang, BC[i]); }
  for (const sx of [-1, 1]) { const [zz, yy] = sp(0.88); arcBtn(k, sx * 0.05, yy, zz, ang, 0xfafafa, 0.011); }
  // lunette et écran
  const b0 = [Z(0.255), Y(0.115)], b1 = [Z(0.135), Y(0.6)], bl = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]), ba = Math.atan2(b0[0] - b1[0], b1[1] - b0[1]), bc = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2];
  const sw = 0.48 * (W / 0.712), sh = sw * 0.75;
  at(k, M(0, bc[1], bc[0], -ba), () => {
    box(k, 0, 0, -0.008, W, bl, 0.016, 0x09090a, { skip: 'xX' });
    for (const [x, y, ww, hh] of [[0, sh / 2 + 0.02, sw + 0.05, 0.006], [0, -sh / 2 - 0.02, sw + 0.05, 0.006], [sw / 2 + 0.022, 0, 0.006, sh + 0.046], [-sw / 2 - 0.022, 0, 0.006, sh + 0.046]]) fq(k, x, y + 0.01, 0.0004, ww, hh, acc);
  });
  const sc = new THREE.Vector3(0, 0.01, 0.0006).applyAxisAngle(XA, -ba);
  k.meta.screen = { x: 0, y: bc[1] + sc.y, z: bc[0] + sc.z - 0.0022, w: sw, h: sh, tilt: -ba };
  // haut-parleurs sous le marquee
  box(k, 0, Y(0.6225), Z(0.1735), W, Y(0.045), Z(0.077), 0x141516, { skip: 'xX' });
  for (const sx of [-1, 1]) slots(k, sx * W * 0.25, Y(0.6225), Z(0.212) + 0.0004, 5, 0.012, Y(0.03), 0.02, 0x050505, 'Z');
  // marquee (impression visible éteint ; le panneau lumineux est ajouté par devices.js)
  const mq = lab(k, 'arcmq:' + g, 120, 38, { kind: 'sign', name: A[3], bg: A[1], fg: acc, accent: acc });
  box(k, 0, Y(0.7625), Z(0.156), W, Y(0.235), Z(0.112), 0x101012, { skip: 'xX', F: { Z: mq } });
  for (const yy of [Y(0.645) + 0.006, Y(0.88) - 0.006]) rbox(k, 0, yy, Z(0.212) + 0.004, W, 0.012, 0.01, 0.003, CHROME);
  k.meta.marquee = { x: 0, y: Y(0.7625), z: Z(0.212) + 0.0005, w: W - 0.03, h: Y(0.235) - 0.03 };
  slots(k, 0, Y(0.55), Z(-0.4) - 0.0004, 8, 0.02, 0.12, 0.04, 0x08080a, 'z');
}

// Machine de danse : écran sous un fronton lumineux, colonnes d'enceintes (boomers, néons), plateforme à dalles
// fléchées, barre de maintien chromée derrière le joueur
function danceCab(k, s, c, d) {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, A = artOf(d), acc = A[0], zb = -dd / 2, zc = -0.12, cd = zc - zb, body = mix(c, 0x120f22, 0.65);
  rbox(k, 0, (y0 + 0.62) / 2, (zb + zc) / 2, 0.78, 0.62 - y0, cd, 0.02, body);
  bezel(k, 0, 0.33, zc + 0.0005, 0.7, 0.56, 0.62, 0.465, 0.012, 0.01, 0x0b0b0e);
  k.meta.screen = { x: 0, y: 0.33, z: zc - 0.0085, w: 0.63, h: 0.475 };
  // fronton
  rbox(k, 0, 0.81, (zb + zc + 0.07) / 2, w, 0.38, cd + 0.07, 0.025, body);
  const mq = lab(k, 'arcmq:dance', 132, 34, { kind: 'sign', name: A[3], bg: A[1], fg: acc, accent: 0x00e5ff });
  fq(k, 0, 0.81, zc + 0.0705, 1.02, 0.26, 0, 'Z', mq);
  for (const yy of [0.66, 0.96]) rbox(k, 0, yy, zc + 0.07, 1.06, 0.014, 0.012, 0.004, CHROME);
  k.meta.marquee = { x: 0, y: 0.81, z: zc + 0.0712, w: 1.0, h: 0.24 };
  // colonnes d'enceintes
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.1);
    rbox(k, x, (y0 + 0.62) / 2, (zb + zc + 0.03) / 2, 0.2, 0.62 - y0, cd + 0.03, 0.02, 0x16161c);
    for (const [yy, rr] of [[-0.5, 0.075], [0.12, 0.075], [-0.2, 0.03]]) {
      disc(k, x, yy, zc + 0.0155, rr + 0.008, 0x2b2b33, [0, 0, 1], 14, rr);
      lat(k, [[rr, 0], [rr * 0.35, -0.03, null, 'h'], [rr * 0.3, -0.03, 0x111111], [0.001, -0.022, 0x2a2a2a]], 0x1c1c1e, { segs: 12, m: M(x, yy, zc + 0.015, PI / 2) });
    }
    fq(k, x - sx * 0.085, -0.2, zc + 0.0156, 0.012, 1.4, sx > 0 ? 0xff4081 : 0x00e5ff);
  }
  // plateforme à dalles
  const zp0 = zc, zp1 = dd / 2, zpc = (zp0 + zp1) / 2, ph = 0.14;
  rbox(k, 0, y0 + ph / 2, zpc, w, ph, zp1 - zp0, 0.012, STEEL);
  fq(k, 0, y0 + ph + 0.0005, zpc, w - 0.03, zp1 - zp0 - 0.03, 0x22232a, 'Y');
  const arrow = [[0, 0.085], [0.075, 0.01], [0.032, 0.01], [0.032, -0.08], [-0.032, -0.08], [-0.032, 0.01], [-0.075, 0.01]];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const x = i * 0.235, z = zpc + j * 0.225, isArrow = (i === 0) !== (j === 0);
    rbox(k, x, y0 + ph + 0.004, z, 0.215, 0.008, 0.205, 0.003, isArrow ? 0x2a2440 : 0x3a3b40);
    if (isArrow) at(k, M(x, y0 + ph + 0.008, z, -PI / 2, Math.atan2(-i, -j), 0), () => ext(k, arrow, 0, 0.004, (i + j) % 2 ? 0xff4081 : 0x00e5ff));
  }
  // barre de maintien
  const zr = zp1 - 0.04, yb = y0 + ph;
  sweep(k, rpath([[-0.45, yb, zr], [-0.45, yb + 0.85, zr], [0.45, yb + 0.85, zr], [0.45, yb, zr]], 0.08, 4), 0.018, CHROME, { segs: 8 });
  for (const sx of [-1, 1]) disc(k, sx * 0.45, yb + 0.002, zr, 0.04, STEEL, [0, 1, 0], 10);
}
S('arcade', (k, s, c, d) => (s[0] > 1.0 ? danceCab(k, s, c, d) : arcadeCab(k, s, c, d)));

// peluche (corps, tête, oreilles, museau, yeux) assise, hauteur ≈ 1,6 sc
function plushie(k, x, y, z, sc, c, ry) {
  at(k, M(x, y, z, 0, ry, 0), () => {
    k.blob(0, sc * 0.45, 0, sc * 0.5, sc * 0.45, sc * 0.42, c, 7, 4);
    k.blob(0, sc * 1.1, sc * 0.02, sc * 0.42, sc * 0.38, sc * 0.38, c, 7, 4);
    for (const sx of [-1, 1]) { k.blob(sx * sc * 0.3, sc * 1.42, 0, sc * 0.13, sc * 0.13, sc * 0.08, c, 5, 3); fq(k, sx * sc * 0.14, sc * 1.16, sc * 0.392, sc * 0.07, sc * 0.07, 0x111111); }
    k.blob(0, sc * 1.02, sc * 0.37, sc * 0.13, sc * 0.1, sc * 0.07, shade(c, 1.3), 5, 3);
  });
}
// Machine à pinces : meuble bas (trappe à lots, monnayeur, pupitre joystick + bouton), vitrine à montants chromés,
// tas de peluches, goulotte en plexiglas, portique (rails, chariot, câble, pince à trois griffes), fronton à ampoules
S('claw', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yb = y0 + 0.82, yt = h / 2 - 0.2, zf = dd / 2 - 0.016, zc0 = (zf - dd / 2) / 2;
  rbox(k, 0, (y0 + yb) / 2, zc0, w, yb - y0, zf + dd / 2, 0.02, c);
  box(k, 0, y0 + 0.025, zc0, w - 0.02, 0.05, zf + dd / 2 - 0.02, 0x1d1d22);
  // trappe à lots, monnayeur
  box(k, 0.22, y0 + 0.3, zf - 0.03, 0.26, 0.22, 0.06, 0x0b0b0e, { skip: 'z' }); // sous la goulotte (lots tombés : devices.js)
  at(k, M(0.22, y0 + 0.3, zf - 0.006, -0.12), () => rbox(k, 0, 0, 0, 0.23, 0.19, 0.008, 0.004, 0x30303a));
  fq(k, 0.22, y0 + 0.46, zf + 0.0006, 0.16, 0.05, 0, 'Z', lab(k, 'prix', 64, 20, { kind: 'sign', name: 'PRIX', bg: 0x212121, fg: 0xffea00, accent: 0xffea00 }));
  rbox(k, -0.2, y0 + 0.45, zf + 0.005, 0.18, 0.26, 0.01, 0.004, STEEL);
  rbox(k, -0.2, y0 + 0.5, zf + 0.012, 0.04, 0.06, 0.006, 0.003, 0xff5a1f); fq(k, -0.2, y0 + 0.5, zf + 0.0152, 0.004, 0.035, 0x1a0500);
  disc(k, -0.2, y0 + 0.39, zf + 0.0106, 0.012, CHROME, [0, 0, 1], 10);
  // pupitre
  at(k, M(0, yb - 0.02, zf - 0.09, 0.25), () => {
    rbox(k, 0, 0, 0, w - 0.08, 0.05, 0.18, 0.012, 0x1d1d22);
    disc(k, -0.15, 0.0255, 0.0, 0.03, BLACK, [0, 1, 0], 12); cyl(k, -0.15, 0.06, 0, 0.0055, 0.065, 0x2a2a2a, 'y', 6); lat(k, sphereP(0.02, 0.112), 0xffea00, { segs: 10 });
    arcBtn(k, 0.14, 0.025, 0, 0, 0xe53935, 0.032);
  });
  // vitrine : montants, cadres, plancher, goulotte, peluches
  const gh = yt - yb, gy = (yb + yt) / 2, pw = 0.035;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox(k, sx * (w / 2 - pw / 2), gy, sz > 0 ? zf - pw / 2 : -dd / 2 + pw / 2, pw, gh, pw, 0.012, CHROME);
  for (const yy of [yb + 0.01, yt - 0.01]) { for (const z of [zf - 0.01, -dd / 2 + 0.01]) box(k, 0, yy, z, w - 2 * pw, 0.02, 0.02, 0x9aa1a7); for (const sz of [-1, 1]) box(k, sz * (w / 2 - 0.01), yy, zc0, 0.02, 0.02, zf + dd / 2 - 2 * pw, 0x9aa1a7); }
  box(k, 0, yb + 0.006, 0, w - 0.06, 0.012, dd - 0.06, 0x4a148c);
  const cx = w / 2 - 0.17, cz = dd / 2 - 0.17;
  for (const [x, z] of [[cx - 0.12, cz - 0.12], [cx + 0.12, cz - 0.12], [cx + 0.12, cz + 0.12], [cx - 0.12, cz + 0.12]]) box(k, x, yb + 0.14, z, 0.012, 0.26, 0.012, 0xb3e5fc);
  for (const [x, z, ww, dz] of [[cx, cz - 0.12, 0.24, 0.012], [cx, cz + 0.12, 0.24, 0.012], [cx - 0.12, cz, 0.012, 0.24], [cx + 0.12, cz, 0.012, 0.24]]) box(k, x, yb + 0.27, z, ww, 0.012, dz, 0xb3e5fc);
  fq(k, cx, yb + 0.013, cz, 0.22, 0.22, 0x050505, 'Y');
  const rnd = mulberry32(3), PC = [0xff80ab, 0xffd54f, 0x4fc3f7, 0x81c784, 0xce93d8, 0xffab91, 0xc8873a];
  for (let i = 0; i < 13; i++) {
    let x, z; do { x = (rnd() - 0.5) * (w - 0.2); z = (rnd() - 0.5) * (dd - 0.2); } while (x > cx - 0.2 && z > cz - 0.2);
    plushie(k, x, yb + 0.012 + (i > 8 ? 0.08 : 0), z, 0.07 + rnd() * 0.025, PC[i % PC.length], rnd() * TAU);
  }
  // portique, chariot, câble, pince
  const yg = yt - 0.04;
  for (const sx of [-1, 1]) box(k, sx * (w / 2 - 0.06), yg, 0, 0.025, 0.025, dd - 0.08, 0x8a9096);
  box(k, 0, yg - 0.025, 0.05, w - 0.12, 0.025, 0.03, 0x8a9096);
  rbox(k, 0.08, yg - 0.055, 0.05, 0.08, 0.04, 0.06, 0.006, 0x37474f);
  const yc = gy + 0.05; cyl(k, 0.08, (yg - 0.075 + yc + 0.03) / 2, 0.05, 0.0025, yg - 0.075 - yc - 0.03, 0x222222, 'y', 4);
  cyl(k, 0.08, yc + 0.015, 0.05, 0.03, 0.05, CHROME, 'y', 10);
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3, ca = Math.cos(a), sa = Math.sin(a); sweep(k, [[0.08 + ca * 0.02, yc - 0.005, 0.05 + sa * 0.02], [0.08 + ca * 0.06, yc - 0.05, 0.05 + sa * 0.06], [0.08 + ca * 0.035, yc - 0.1, 0.05 + sa * 0.035]], 0.006, CHROME, { segs: 5 }); }
  k.meta.claw = [0.08, yc, 0.05];
  // fronton lumineux à ampoules
  rbox(k, 0, (yt + h / 2) / 2, zc0, w, h / 2 - yt, zf + dd / 2, 0.02, c);
  const mq = lab(k, 'arcmq:claw', 120, 32, { kind: 'sign', name: 'ATTRAP\'PELUCHE', bg: 0x3a0a2a, fg: 0xffea00, accent: 0xffea00 });
  fq(k, 0, (yt + h / 2) / 2 + 0.01, zf + 0.0006, w - 0.1, 0.13, 0, 'Z', mq);
  for (let i = 0; i < 9; i++) disc(k, -w / 2 + 0.07 + i * (w - 0.14) / 8, yt + 0.02, zf + 0.0008, 0.011, 0xfff59d, [0, 0, 1], 8);
  k.meta.marquee = { x: 0, y: (yt + h / 2) / 2 + 0.01, z: zf - 0.0045, w: w - 0.12, h: 0.12 };
  k.meta.glass = { w: w * 0.96, h: gh, y: gy };
});

// Air hockey : plateau (sous l'écran de jeu « top »), bandes alu, buts, jupe décorée, pieds et entretoises,
// soufflerie, maillets et palet, compteurs de buts
S('airhockey', (k, s, c) => {
  const w = s[0], h = s[1], L2 = s[2], y0 = -h / 2, yt = h / 2 - 0.08, rw = 0.08, ap = 0.22;
  rbox(k, 0, yt - ap / 2, 0, w - 0.004, ap, L2 - 0.004, 0.02, c);
  fq(k, 0, yt - ap / 2, L2 / 2 - 0.0014, w - 0.1, 0.05, 0xffffff); fq(k, 0, yt - ap / 2, -L2 / 2 + 0.0014, w - 0.1, 0.05, 0xffffff, 'z');
  for (const f of ['X', 'x']) fq(k, (f === 'X' ? 1 : -1) * (w / 2 - 0.0014), yt - ap / 2, 0, L2 - 0.1, 0.05, 0xffffff, f);
  fq(k, 0, yt + 0.0005, 0, w - 2 * rw, L2 - 2 * rw, 0xf4f8fb, 'Y');
  // bandes (rails) et buts
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) rbox(k, sx * (0.16 + w / 2) / 2, yt + 0.025, sz * (L2 / 2 - rw / 2), w / 2 - 0.16, 0.05, rw, 0.01, 0x9ea6ab);
    box(k, 0, yt + 0.01, sz * (L2 / 2 - rw / 2), 0.32, 0.02, rw - 0.01, 0x101010);
    fq(k, 0, yt - 0.06, sz * (L2 / 2 - 0.0012), 0.16, 0.06, 0x0f0f10, sz > 0 ? 'Z' : 'z');
    for (const dx of [-0.03, 0.03]) fq(k, dx, yt - 0.06, sz * (L2 / 2 - 0.0008), 0.022, 0.04, sz > 0 ? 0xff1744 : 0x2979ff, sz > 0 ? 'Z' : 'z');
  }
  for (const sx of [-1, 1]) rbox(k, sx * (w / 2 - rw / 2), yt + 0.025, 0, rw, 0.05, L2 - 2 * rw + 0.004, 0.01, 0x9ea6ab);
  // pieds, entretoises, soufflerie
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox(k, sx * (w / 2 - 0.1), (y0 + yt - ap) / 2, sz * (L2 / 2 - 0.14), 0.08, yt - ap - y0, 0.08, 0.01, 0x212121);
  for (const sz of [-1, 1]) box(k, 0, y0 + 0.12, sz * (L2 / 2 - 0.14), w - 0.24, 0.04, 0.03, 0x2a2a2a);
  rbox(k, 0, yt - ap - 0.12, 0, 0.5, 0.2, 0.7, 0.02, 0x2b2d30); slots(k, 0, yt - ap - 0.12, 0.3505, 8, 0.03, 0.12, 0.05, 0x0c0c0c);
  // maillets et palet (posés sur l'écran du plateau)
  for (const [z, col] of [[0.62, 0xd50000], [-0.62, 0x1565c0]]) lat(k, [[0.045, 0], [0.047, 0.006], [0.045, 0.017, null, 'h'], [0.02, 0.021], [0.018, 0.045], [0.026, 0.055], [0.024, 0.068], [0.001, 0.071]], col, { segs: 14, m: M(0, yt + 0.003, z), bot: col });
  cyl(k, 0.12, yt + 0.006, 0.15, 0.032, 0.006, 0xd50000, 'y', 14);
  k.meta.screen = { x: 0, y: yt + 0.0015, z: 0, w: w - 2 * rw, h: L2 - 2 * rw, top: true };
});

// Photomaton : colonne technique (caméra derrière une vitre sombre, écran, flash diffuseur), cabine (toit, parois),
// rideau plissé sur tringle laissant voir les jambes, tabouret réglable, enseigne, planche de photos d'exemple
S('photobooth', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zm = -dd / 2 + 0.42, zc = (zm + dd / 2) / 2, side = shade(c, 0.88);
  rbox(k, 0, 0, (-dd / 2 + zm) / 2, w, h, zm + dd / 2, 0.02, c);
  box(k, 0, h / 2 - 0.05, zc, w, 0.1, dd / 2 - zm, c);
  for (const sx of [-1, 1]) box(k, sx * (w / 2 - 0.015), -0.05, zc, 0.03, h - 0.1, dd / 2 - zm, side);
  box(k, 0, y0 + 0.02, zc, w - 0.06, 0.04, dd / 2 - zm, 0x2a2a2a);
  // face caméra (intérieur)
  rbox(k, 0, 0.32, zm + 0.01, 0.46, 0.5, 0.02, 0.01, 0x15161a);
  disc(k, 0, 0.36, zm + 0.0205, 0.04, 0x0a0f14, [0, 0, 1], 14); disc(k, 0, 0.36, zm + 0.021, 0.052, 0x2c3238, [0, 0, 1], 14, 0.04);
  fq(k, 0, 0.18, zm + 0.0206, 0.2, 0.12, 0x0b1a26);
  rbox(k, 0, 0.68, zm + 0.03, 0.4, 0.12, 0.05, 0.01, 0xf2f2f2);
  fq(k, 0, -0.05, zm + 0.0006, 0.3, 0.12, 0, 'Z', lab(k, 'pboothhelp', 72, 32, { kind: 'sign', name: 'REGARDEZ ICI', sub: '4 POSES', bg: 0x15161a, fg: 0xffffff, accent: 0xffd600 }));
  // tabouret
  disc(k, 0, y0 + 0.041, zc, 0.16, 0x2a2a2a, [0, 1, 0], 12); cyl(k, 0, y0 + 0.25, zc, 0.025, 0.42, CHROME, 'y', 8);
  cyl(k, 0, y0 + 0.48, zc, 0.17, 0.06, 0x1a1a1a, 'y', 14);
  // rideau plissé
  const ry = h / 2 - 0.13, rb = y0 + 0.42, zr = dd / 2 - 0.04, n = 22;
  cyl(k, 0, ry + 0.01, zr, 0.008, w - 0.06, CHROME, 'x', 6);
  for (let i = 0; i < n; i++) {
    const xa = -w / 2 + 0.04 + i * (w - 0.08) / n, xb = xa + (w - 0.08) / n, za = zr + (i % 2 ? 0.018 : -0.018), zb = zr + (i % 2 ? -0.018 : 0.018), nn = [(i % 2 ? 1 : -1) * 0.5, 0, 0.86];
    q4(k, [[xa, rb, za], [xb, rb, zb], [xb, ry, zb], [xa, ry, za]], [[-nn[0], 0, 0.86], [nn[0], 0, 0.86], [nn[0], 0, 0.86], [-nn[0], 0, 0.86]], 0x7a0d3a);
  }
  // enseigne, photos d'exemple et fente de sortie (flanc droit)
  box(k, 0, h / 2 - 0.05, dd / 2 - 0.004, w - 0.02, 0.1, 0.008, 0xffd600, { F: { Z: lab(k, 'pbooth', 128, 22, { kind: 'sign', name: 'PHOTOMATON', bg: 0xffd600, fg: 0xd50000, accent: 0xd50000 }) } });
  const ph = lab(k, 'pbstrip', 24, 72, { kind: 'card', bg: 0xeeeeee, accent: 0x9e9e9e, picto: 'camera', name: 'PHOTOS', pc: 0x616161 });
  for (let i = 0; i < 3; i++) fq(k, w / 2 + 0.0005, 0.25, -dd / 2 + 0.1 + i * 0.09, 0.07, 0.22, 0, 'X', ph);
  fq(k, w / 2 + 0.0005, 0.55, -dd / 2 + 0.19, 0.25, 0.07, 0, 'X', lab(k, 'pbprix', 64, 18, { kind: 'sign', name: '4 PHOTOS 5 €', bg: c, fg: 0xffffff, accent: 0xffffff }));
  rbox(k, w / 2 - 0.007, -0.1, -dd / 2 + 0.2, 0.012, 0.08, 0.18, 0.003, STEEL, { skip: 'x' }); fq(k, w / 2 - 0.0005, -0.09, -dd / 2 + 0.2, 0.004, 0.12, 0x050505, 'X');
  k.meta.flash = [0, s[1] * 0.2, -s[2] * 0.05];
});

// Fontaine à eau : meuble, niche des robinets (eau froide / chaude), égouttoir, bonbonne retournée cerclée
S('cooler', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yc = y0 + 0.78, zf = dd / 2 - 0.04;
  rbox(k, 0, (y0 + yc) / 2, (zf - dd / 2) / 2, w, yc - y0, zf + dd / 2, 0.015, c);
  fq(k, 0, yc - 0.2, zf + 0.0006, w - 0.08, 0.2, 0x8c979d);
  for (const [x, col] of [[-0.06, 0x1e88e5], [0.06, 0xe53935]]) { rbox(k, x, yc - 0.13, zf + 0.012, 0.03, 0.04, 0.024, 0.006, col); cyl(k, x, yc - 0.16, zf + 0.018, 0.006, 0.02, 0x9e9e9e, 'y', 6); }
  rbox(k, 0, yc - 0.3, zf + 0.008, w - 0.1, 0.02, 0.05, 0.006, 0x5d6870); slots(k, 0, yc - 0.289, zf + 0.008, 6, 0.004, 0.035, 0.03, 0x2a2f33, 'Y');
  slots(k, 0, y0 + 0.12, zf + 0.0006, 6, 0.18, 0.008, 0.02, shade(c, 0.75), 'Z', true);
  disc(k, 0, yc + 0.001, 0, 0.06, 0xb0bec5, [0, 1, 0], 12);
  lat(k, [[0.028, yc], [0.028, yc + 0.035, 0x1565c0], [0.04, yc + 0.045, 0x8ccbed, 'h'], [0.125, yc + 0.11], [0.135, yc + 0.14], [0.135, yc + 0.2, 0x9fd4ef], [0.132, yc + 0.205, 0x7fc0e4], [0.135, yc + 0.21, 0x9fd4ef], [0.135, h / 2 - 0.08, 0xc8e6f5], [0.12, h / 2 - 0.02], [0.08, h / 2 - 0.002], [0.001, h / 2]], 0x8ccbed, { segs: 14 });
});

// Four à pizza à bois : dôme maçonné sur socle (réserve de bûches), voûte d'entrée en briques, bouche rougeoyante,
// sole, conduit de fumée, pelle accrochée
S('oven_big', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, ys = y0 + 0.62, R = dd / 2 - 0.13, brick = 0x9c4a2f, mortar = 0xb8a593;
  // socle maçonné percé d'une niche à bûches (ouverture, parois sombres, fond)
  const yb = (y0 + ys) / 2, ny = y0 + 0.31, nd = 0.5, zf = dd / 2;
  rbox(k, 0, yb, 0, w, ys - y0, dd, 0.02, 0x6b625b, { skip: 'Z' });
  bezel(k, 0, yb, zf, w - 0.04, ys - y0 - 0.04, w - 0.2, 0.42, 0.015, nd, 0x6b625b, { iy: ny - yb, lip: 0x2a2421 });
  fq(k, 0, ny, zf - nd, w - 0.2, 0.42, 0x1a1513);
  for (let i = 0; i < 9; i++) cyl(k, -0.45 + (i % 5) * 0.21 + (i > 4 ? 0.1 : 0), y0 + 0.16 + (i > 4 ? 0.1 : 0), zf - 0.27, 0.05, 0.38, i % 2 ? 0x6d4c41 : 0x8d6e63, 'z', 7);
  box(k, 0, ys + 0.03, 0, w, 0.06, dd, 0x7b6f66);
  const prof = []; for (let i = 0; i <= 9; i++) { const t = i / 9 * PI / 2; prof.push([Math.max(0.001, R * Math.cos(t)), ys + 0.06 + R * 0.92 * Math.sin(t), i % 2 ? shade(c, 0.92) : c]); }
  lat(k, prof, c, { segs: 20 });
  // voûte d'entrée : arc de briques, bouche
  const ay = ys + 0.06, aw = 0.25, ah = 0.24, az = R - 0.02;
  for (let i = 0; i < 11; i++) { const a = PI * i / 10; at(k, M(Math.cos(a) * (aw + 0.04), ay + Math.sin(a) * (ah + 0.03) * 0.9, az + 0.06, 0, 0, a - PI / 2), () => rbox(k, 0, 0, 0, 0.07, 0.05, 0.12, 0.006, i % 2 ? brick : shade(brick, 0.85))); }
  for (const sx of [-1, 1]) rbox(k, sx * (aw + 0.04), ay - 0.0, az + 0.06, 0.07, 0.06, 0.12, 0.006, brick);
  box(k, 0, ay + 0.1, az + 0.03, aw * 2 - 0.02, 0.2, 0.06, 0x0f0806, { skip: 'z' });
  fqg(k, 0, ay + 0.06, az + 0.061, aw * 2 - 0.04, 0.12, 0xff6d00, 0x2a0e05);
  for (let i = 0; i < 5; i++) fq(k, -0.15 + i * 0.075, ay + 0.012, az + 0.0615, 0.05, 0.02, 0xffab40);
  box(k, 0, ay - 0.005, az + 0.08, aw * 2 + 0.16, 0.03, 0.1, mortar);
  // conduit de fumée et pelle
  cyl(k, 0, h / 2 - 0.13, R * 0.45, 0.07, 0.26, 0x3a3a3a, 'y', 12); cyl(k, 0, h / 2 - 0.01, R * 0.45, 0.085, 0.02, 0x2a2a2a, 'y', 12);
  sweep(k, [[w / 2 - 0.05, ys + 0.5, dd / 2 - 0.25], [w / 2 - 0.05, y0 + 0.2, dd / 2 - 0.25]], 0.012, 0x8d6e63, { segs: 6 });
  at(k, M(w / 2 - 0.05, y0 + 0.12, dd / 2 - 0.25), () => box(k, 0, 0, 0, 0.004, 0.18, 0.2, 0xb0b6bb));
  k.meta.glow = [0, ay + 0.06, az + 0.07];
});

// Tapis roulant à sushis : châssis inox, tapis à lamelles articulées, glissières latérales, embouts
S('conveyor', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2];
  rbox(k, 0, -h * 0.12, 0, w, h * 0.76, dd, 0.012, INOX);
  box(k, 0, h / 2 - 0.016, 0, w - 0.06, 0.028, dd - 0.09, 0x26282b);
  for (let i = 0; i < 48; i++) fq(k, -w / 2 + 0.04 + i * (w - 0.08) / 47, h / 2 - 0.0015, 0, 0.005, dd - 0.1, 0x111214, 'Y');
  for (const sz of [-1, 1]) rbox(k, 0, h / 2 - 0.012, sz * (dd / 2 - 0.022), w, 0.024, 0.044, 0.008, 0xd5dadd);
  for (const sx of [-1, 1]) rbox(k, sx * (w / 2 - 0.02), 0, 0, 0.04, h, dd, 0.01, 0xa9b0b5);
  slots(k, 0, -h * 0.12, dd / 2 + 0.0006, 10, 0.12, 0.004, 0.28, 0x8a9096);
});

// Coffre-fort : caisse blindée à arêtes arrondies, porte à joint creux, charnières, poignée à trois branches,
// clavier à code et afficheur, plaque de marque, pieds
S('safe', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zf = dd / 2 - 0.08;
  rbox(k, 0, 0.01, (zf - dd / 2) / 2, w, h - 0.02, zf + dd / 2, 0.03, c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(k, sx * (w / 2 - 0.05), y0 + 0.01, sz * (dd / 2 - 0.08), 0.06, 0.02, 0.06, 0x1a1a1a);
  const dw = w - 0.08, dh = h - 0.1, door = shade(c, 1.15);
  fq(k, 0, 0.01, zf + 0.0005, dw + 0.012, dh + 0.012, 0x101214);
  rbox(k, 0, 0.01, zf + 0.012, dw, dh, 0.024, 0.01, door);
  for (const yy of [0.17, -0.15]) cyl(k, -dw / 2 + 0.004, yy, zf + 0.012, 0.016, 0.11, 0x8a9096, 'y', 10);
  // clavier, afficheur
  rbox(k, 0.1, 0.12, zf + 0.029, 0.12, 0.16, 0.012, 0.005, 0x26292c);
  fq(k, 0.1, 0.165, zf + 0.0352, 0.09, 0.03, 0x0f2a12); fq(k, 0.1, 0.09, zf + 0.0352, 0.09, 0.08, 0, 'Z', keypad(k, 'safe', 3, 4, 0x8c9399));
  // poignée à trois branches
  const hx = -0.08, hy = -0.04, hz = zf + 0.024;
  cyl(k, hx, hy, hz + 0.02, 0.028, 0.04, CHROME, 'z', 12);
  for (let i = 0; i < 3; i++) { const a = PI / 2 + i * TAU / 3, ex = hx + Math.cos(a) * 0.09, ey = hy + Math.sin(a) * 0.09; sweep(k, [[hx, hy, hz + 0.035], [ex, ey, hz + 0.035]], 0.008, CHROME, { segs: 6 }); lat(k, sphereP(0.016, 0), CHROME, { segs: 8, m: M(ex, ey, hz + 0.035) }); }
  fq(k, 0, -dh / 2 + 0.06, zf + 0.0245, 0.12, 0.03, 0, 'Z', lab(k, 'fortis', 64, 16, { kind: 'plain', bg: 0xc9a74a, fg: 0x3e2f12, brand: 'FORTIS' }));
  k.meta.door = { x: 0, y: 0.01, z: zf + 0.024, w: dw, h: dh };
});

// ═════════════════════════ DISTRIBUTEURS ═════════════════════════
// Distributeur de boissons et friandises : vitrine (spirales et produits sur six plateaux, fond éclairé), fronton à la
// marque, panneau de commande (afficheur, clavier, monnayeur, lecteur de billets et de carte, retour monnaie), trappe
// de livraison basculante, pieds réglables.
const VEND_ROWS = [
  ['bag', 0.15, [['Croustil', 'Nature', 'chips', 0xffc400], ['Croustil', 'Paprika', 'chips', 0xe64a19], ['Croustil', 'Oignon', 'chips', 0x43a047]]],
  ['bag', 0.15, [['Sucrette', 'Bonbons', 'candy', 0xec407a], ['Croustil', 'Bacon', 'chips', 0x8d6e63], ['Sucrette', 'Oursons', 'bear', 0xffb300]]],
  ['bar', 0.06, [['Mireille', 'Noir', 'choco', 0x4e342e], ['Mireille', 'Lait', 'choco', 0x6d4c41], ['Coco', 'Barre', 'cookie', 0xd84315]]],
  ['box', 0.1, [['Biscuiterie', 'Sablés', 'cookie', 0x1565c0], ['Biscuiterie', 'Gaufrettes', 'cookie', 0xf9a825], ['Mireille', 'Cookies', 'cookie', 0x6a1b9a]]],
  ['can', 0.122, [['Hélios', 'Cola', 'bubbles', 0xc62828], ['Limonaderie', 'Citron', 'lemon', 0xfdd835], ['VOLT', 'Énergie', 'bolt', 0x1e88e5]]],
  ['can', 0.122, [['Source', 'Eau', 'drop', 0x4fc3f7], ['Fruitéa', 'Orange', 'orange', 0xfb8c00], ['Zen', 'Thé vert', 'leaf', 0x2e7d32]]],
];
function vendProducts(k, x0, x1, yb, yt, zf, depth) {
  const n = VEND_ROWS.length, cols = 5, dx = (x1 - x0) / cols, dy = (yt - yb) / n;
  for (let r = 0; r < n; r++) {
    const [kind, ph, P] = VEND_ROWS[r], y = yt - (r + 1) * dy + 0.012;
    box(k, (x0 + x1) / 2, y - 0.006, zf - depth / 2, x1 - x0, 0.012, depth, 0x3a3d40); // plateau
    fq(k, (x0 + x1) / 2, y - 0.013, zf + 0.0006, x1 - x0, 0.026, 0, 'Z', lab(k, 'vstrip', 160, 12, { kind: 'strip', bg: 0x263238, accent: 0x37474f }));
    for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * dx, [b, nm, pi, bg] = P[(i + r) % P.length], key = 'vd:' + nm;
      // spirale (une tour et demie visibles)
      const hel = []; for (let j = 0; j <= 12; j++) { const a = j / 8 * TAU; hel.push([x + Math.cos(a) * dx * 0.42, y + dx * 0.42 + Math.sin(a) * dx * 0.42, zf - 0.012 - j * 0.011]); }
      sweep(k, hel, 0.0025, CHROME, { segs: 3 });
      if (kind === 'can') { k.tube(x, y + ph / 2, zf - 0.07, 0.033, ph, 0xffffff, 8, { rect: lab(k, key, 52, 40, { kind: 'wrap', brand: b, name: nm, picto: pi, bg }), tc: 0xc0c4c8, bc: 0x9ea2a6 }); continue; }
      const pw = dx * 0.78, pd = kind === 'bag' ? 0.035 : 0.025;
      rbox(k, x, y + ph / 2 + 0.001, zf - 0.06 - (depth - 0.1) / 2, pw, ph, depth - 0.1, 0, bg, { F: { Z: lab(k, key, 40, Math.round(40 * ph / pw), { kind: kind === 'bag' ? 'bag' : 'box', brand: b, name: nm, picto: pi, bg }) }, skip: 'zy' });
    }
  }
}
S('vending', (k, s, c, d) => {
  if (d.id === 'atm') return atm(k, s, c, d);
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zf = dd / 2 - 0.025, ft = 0.035, r = 0.012, yb = y0 + ft;
  rbox(k, 0, (yb + h / 2) / 2, -0.0125, w - 0.003, h - ft, dd - 0.025, r, c, { skip: 'Z' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(k, sx * (w / 2 - 0.07), y0 + ft / 2, sz * (dd / 2 - 0.07), 0.022, ft, 0x2a2a2a, 'y', 8);
  // porte : montant, fronton, panneau de commande, bas de porte (face avant à zf)
  const X0 = -w / 2 + r, X1 = w / 2 - r, Y0 = yb + r, Y1 = h / 2 - r, wx0 = -0.405 * w / 0.9, wx1 = 0.165 * w / 0.9, wy0 = y0 + 0.48 * h / 1.8 * 1, wy1 = h / 2 - 0.16;
  const dz = zf - 0.015, dth = 0.03, dark = shade(c, 0.55);
  box(k, (X0 + wx0) / 2, (Y0 + Y1) / 2, dz, wx0 - X0, Y1 - Y0, dth, c, { skip: 'z' });
  box(k, (wx0 + X1) / 2, (wy1 + Y1) / 2, dz, X1 - wx0, Y1 - wy1, dth, c, { skip: 'z', F: { Z: lab(k, 'vhead', 128, 32, { kind: 'sign', name: 'FRAÎCHEUR', sub: 'BOISSONS · SNACKS', bg: c, fg: 0xffffff, accent: 0xffd600 }) } });
  box(k, (wx1 + X1) / 2, (wy0 + wy1) / 2, dz, X1 - wx1, wy1 - wy0, dth, 0x2b2d30, { skip: 'z' });
  box(k, (wx0 + X1) / 2, (Y0 + wy0) / 2, dz, X1 - wx0, wy0 - Y0, dth, c, { skip: 'z' });
  // encadrement noir de la vitre
  const fw = 0.022;
  for (const [x, y, ww, hh] of [[(wx0 + wx1) / 2, wy1 - fw / 2, wx1 - wx0, fw], [(wx0 + wx1) / 2, wy0 + fw / 2, wx1 - wx0, fw], [wx0 + fw / 2, (wy0 + wy1) / 2, fw, wy1 - wy0], [wx1 - fw / 2, (wy0 + wy1) / 2, fw, wy1 - wy0]]) rbox(k, x, y, zf + 0.003, ww, hh, 0.012, 0.004, BLACK);
  // vitrine : fond éclairé, parois, produits
  const vd = 0.36, ix0 = wx0 + fw, ix1 = wx1 - fw, iy0 = wy0 + fw, iy1 = wy1 - fw;
  fq(k, (ix0 + ix1) / 2, (iy0 + iy1) / 2, zf - vd, ix1 - ix0, iy1 - iy0, 0xe9eef1);
  fqg(k, ix0, (iy0 + iy1) / 2, zf - vd / 2, vd, iy1 - iy0, 0xb8c0c6, 0xdfe5e9, 'X'); fqg(k, ix1, (iy0 + iy1) / 2, zf - vd / 2, vd, iy1 - iy0, 0xb8c0c6, 0xdfe5e9, 'x');
  fq(k, (ix0 + ix1) / 2, iy1, zf - vd / 2, ix1 - ix0, vd, 0xf4f8fa, 'y'); fq(k, (ix0 + ix1) / 2, iy0, zf - vd / 2, ix1 - ix0, vd, 0x55595d, 'Y');
  vendProducts(k, ix0 + 0.005, ix1 - 0.005, iy0 + 0.02, iy1 - 0.03, zf - 0.03, vd - 0.04);
  // panneau de commande
  const px = (wx1 + X1) / 2, pz = zf;
  fq(k, px, wy1 - 0.09, pz + 0.0005, 0.15, 0.05, 0, 'Z', lab(k, 'vdisp', 72, 24, { kind: 'sign', name: 'CHOISIR', bg: 0x05210f, fg: 0x5dff8f, accent: 0x05210f }));
  rbox(k, px, wy1 - 0.27, pz + 0.007, 0.15, 0.2, 0.014, 0.006, 0x3a3d40);
  fq(k, px, wy1 - 0.27, pz + 0.0142, 0.126, 0.168, 0, 'Z', keypad(k, 'vend', 3, 4));
  rbox(k, px - 0.035, wy1 - 0.48, pz + 0.006, 0.07, 0.09, 0.012, 0.005, CHROME); fq(k, px - 0.035, wy1 - 0.47, pz + 0.0122, 0.004, 0.03, 0x111111);
  fq(k, px - 0.035, wy1 - 0.505, pz + 0.0122, 0.05, 0.016, 0, 'Z', lab(k, 'v2e', 40, 14, { kind: 'sign', name: '2 €', bg: 0x37474f, fg: 0xffffff, accent: 0x37474f }));
  rbox(k, px + 0.05, wy1 - 0.47, pz + 0.012, 0.06, 0.09, 0.024, 0.005, BLACK); fq(k, px + 0.05, wy1 - 0.45, pz + 0.0242, 0.045, 0.004, 0x050505); fq(k, px + 0.05, wy1 - 0.49, pz + 0.0242, 0.03, 0.004, 0x00e676);
  fq(k, px, wy1 - 0.6, pz + 0.0005, 0.09, 0.06, 0, 'Z', lab(k, 'vcb', 48, 32, { kind: 'sign', name: 'CB', sub: 'SANS CONTACT', bg: 0xeceff1, fg: 0x1565c0, accent: 0x1565c0 }));
  rbox(k, px, wy1 - 0.7, pz + 0.006, 0.03, 0.03, 0.012, 0.004, 0xb0b6bb);
  box(k, px, wy0 + 0.11, pz - 0.02, 0.09, 0.07, 0.04, 0x0c0c0d, { skip: 'Z' }); rbox(k, px, wy0 + 0.11, pz + 0.002, 0.11, 0.09, 0.005, 0.003, CHROME, { skip: 'z' });
  fq(k, px, wy0 + 0.11, pz + 0.0047, 0.088, 0.068, 0x0a0a0b);
  // trappe de livraison
  const tx = (wx0 + wx1) / 2, ty = (Y0 + wy0) / 2 + 0.03, tw = wx1 - wx0 - 0.02, th = 0.24;
  rbox(k, tx, ty, zf + 0.003, tw + 0.03, th + 0.03, 0.008, 0.004, BLACK);
  at(k, M(tx, ty, zf + 0.004, -0.08), () => { rbox(k, 0, 0, 0, tw, th, 0.008, 0.003, 0x2e3236); fq(k, 0, th * 0.3, 0.0045, 0.12, 0.03, 0, 'Z', lab(k, 'vpush', 64, 16, { kind: 'sign', name: 'POUSSER', bg: 0x2e3236, fg: 0xffffff, accent: 0x2e3236 })); });
  slots(k, 0, Y0 + 0.03, zf + 0.0005, 14, 0.03, 0.008, 0.055, dark, 'Z');
  // flancs : décor à la marque ; dos : grille d'aération
  const sideArt = lab(k, 'vside', 64, 128, { kind: 'banner', name: 'FRAÎCHEUR', sub: '24 H / 24', bg: c, picto: 'bubbles', accent: 0xffffff });
  for (const f of ['X', 'x']) fq(k, (f === 'X' ? 1 : -1) * (w / 2 - 0.0009), 0.1, -0.0125, dd * 0.8, h * 0.62, 0, f, sideArt);
  slots(k, 0, h / 2 - 0.25, -dd / 2 - 0.0005, 10, 0.025, 0.2, 0.05, 0x111111, 'z');
  k.meta.glow = [(wx0 + wx1) / 2, (wy0 + wy1) / 2, zf + 0.02];
});
// Distributeur de billets autonome : coffre, tablette inclinée (clavier EPP, touches de fonction), façade en retrait
// (écran sous visière de confidentialité, touches latérales, lecteur de carte éclairé, fente à billets, tickets), fronton
function atm(k, s, c, d) {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zf = dd / 2, ys = y0 + 0.95, zr = zf - 0.07;
  rbox(k, 0, (y0 + ys) / 2, 0, w, ys - y0, dd, 0.01, c);
  for (const sx of [-1, 1]) fq(k, sx * (w / 2 - 0.04), (y0 + ys) / 2, zf + 0.0006, 0.003, 0.82, 0x15181a);
  fq(k, 0, ys - 0.065, zf + 0.0006, w - 0.08, 0.003, 0x15181a); fq(k, 0, y0 + 0.065, zf + 0.0006, w - 0.08, 0.003, 0x15181a);
  disc(k, w / 2 - 0.09, (y0 + ys) / 2, zf + 0.0008, 0.014, CHROME, [0, 0, 1], 10);
  slots(k, 0, y0 + 0.03, zf + 0.0006, 12, 0.03, 0.01, 0.055, 0x15181a);
  // façade utilisateur en retrait
  const yh = h / 2 - 0.23;
  box(k, 0, (ys + yh) / 2, (zr - dd / 2) / 2, w, yh - ys, zr + dd / 2, shade(c, 1.15));
  // tablette inclinée + clavier
  at(k, M(0, ys + 0.03, zf - 0.09, 0.26), () => {
    rbox(k, 0, 0, 0, w - 0.04, 0.03, 0.17, 0.01, 0x3a3f44);
    rbox(k, -0.03, 0.017, 0.005, 0.16, 0.006, 0.12, 0.003, STEEL);
    fq(k, -0.045, 0.0205, 0.005, 0.11, 0.1, 0, 'Y', keypad(k, 'atm', 3, 4, 0x9ea4aa));
    [0xd32f2f, 0xfbc02d, 0x388e3c].forEach((col, i) => rbox(k, 0.03, 0.022, -0.03 + i * 0.033, 0.026, 0.006, 0.026, 0.002, col));
  });
  // écran sous visière, touches latérales
  const sy = ys + 0.33;
  bezel(k, 0, sy, zr + 0.001, 0.44, 0.34, 0.3, 0.228, 0.006, 0.008, 0x1b1d20);
  k.meta.screen = { x: 0, y: sy, z: zr - 0.0085, w: 0.306, h: 0.234 };
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) rbox(k, sx * 0.185, sy + 0.08 - i * 0.055, zr + 0.006, 0.03, 0.022, 0.01, 0.003, 0xb0b6bb);
    box(k, sx * 0.25, sy + 0.01, zr + 0.035, 0.012, 0.44, 0.07, 0x2b2f33); // visière
  }
  box(k, 0, sy + 0.23, zr + 0.035, 0.512, 0.012, 0.07, 0x2b2f33);
  // lecteur de carte, fente à billets, tickets
  rbox(k, 0.27, sy - 0.12, zr + 0.012, 0.09, 0.07, 0.024, 0.008, 0x2b2f33); fq(k, 0.27, sy - 0.11, zr + 0.0242, 0.06, 0.004, 0x050505); fq(k, 0.27, sy - 0.135, zr + 0.0242, 0.07, 0.008, 0x00e676);
  rbox(k, 0, ys + 0.115, zr + 0.01, 0.26, 0.05, 0.02, 0.006, CHROME); fq(k, 0, ys + 0.115, zr + 0.0202, 0.22, 0.012, 0x050505);
  rbox(k, 0.27, ys + 0.13, zr + 0.008, 0.08, 0.035, 0.016, 0.005, 0x2b2f33); fq(k, 0.27, ys + 0.13, zr + 0.0162, 0.06, 0.004, 0x050505);
  // fronton lumineux
  box(k, 0, (yh + h / 2) / 2, 0, w, h / 2 - yh, dd, 0x0d47a1, { F: { Z: lab(k, 'atmhead', 128, 36, { kind: 'sign', name: 'RETRAIT', sub: 'BANQUE HÉLIOS · 24 H / 24', bg: 0x0d47a1, fg: 0xffffff, accent: 0xffd600 }) } });
}

// ═════════════════════════ FROID ═════════════════════════
// produits frais vus en vitrine : bouteille (profil tourné), brique, pot, fromage ; renvoie la largeur occupée
function bottle(k, x, y, z, hgt, r, c, cap, rect) {
  lat(k, [[r * 0.9, 0], [r, hgt * 0.04], [r, hgt * 0.6, rect ? 0xffffff : c], [r * 0.45, hgt * 0.82, c], [r * 0.32, hgt * 0.9], [r * 0.34, hgt * 0.91, cap, 'h'], [r * 0.34, hgt, cap], [0.001, hgt, cap]], c, { segs: 7, m: M(x, y, z), bot: c });
}
const FRESH = [ // [type, marque, nom, picto, couleur, hauteur]
  ['brick', 'Laiterie Clément', 'Lait', 'cow', 0x1e88e5, 0.2], ['brick', 'Fruitéa', 'Orange', 'orange', 0xfb8c00, 0.19], ['pot', 'Laiterie Clément', 'Yaourt', 'strawberry', 0xec407a, 0.07],
  ['bottle', 'Hélios', 'Cola', 'bubbles', 0xc62828, 0.25], ['bottle', 'Source', 'Eau', 'drop', 0x4fc3f7, 0.25], ['cheese', 'Fromagerie', 'Brie', 'cheese', 0xfff3c4, 0.05],
  ['brick', 'Limonaderie', 'Citron', 'lemon', 0xfdd835, 0.19], ['pot', 'Laiterie Clément', 'Crème', 'milk', 0xeceff1, 0.08],
];
function freshRow(k, x0, x1, y, z, depth, kinds) {
  const n = kinds.length; let x = x0 + 0.01; const step = (x1 - x0 - 0.02) / n;
  for (let i = 0; i < n; i++, x += step) {
    const [t, b, nm, pi, bg, ph] = FRESH[kinds[i]], cx = x + step / 2, key = 'fr:' + nm;
    if (t === 'brick') { for (const dz of [0, -0.1]) rbox(k, cx, y + ph / 2, z + dz - 0.04, step * 0.8, ph, 0.07, 0, bg, { F: { Z: lab(k, key, 32, 56, { kind: 'box', brand: b, name: nm, picto: pi, bg }) }, skip: 'zy' }); continue; }
    if (t === 'bottle') { for (const dz of [0, -0.09]) bottle(k, cx, y, z + dz - 0.045, ph, Math.min(step * 0.4, 0.04), bg, 0xeeeeee, true); continue; }
    if (t === 'pot') { for (let j = 0; j < 2; j++) k.tube(cx + (j - 0.5) * step * 0.45, y + ph / 2, z - 0.04, step * 0.2, ph, 0xffffff, 8, { rect: lab(k, key, 40, 24, { kind: 'wrap', brand: b, name: nm, picto: pi, bg }), r1: step * 0.23, tc: bg }); continue; }
    for (const dx of step > 0.2 ? [-0.25, 0.25] : [0]) k.tube(cx + dx * step, y + ph / 2, z - 0.07, Math.min(step * 0.42, 0.06), ph, bg, 10, { tc: 0xfffbe8 });
  }
}
// Réfrigérateur combiné ménager : caisse, porte du réfrigérateur et tiroir-porte du congélateur à arêtes arrondies,
// joints, poignées barres sur entretoises, charnières, plinthe ajourée, badge de marque. Variante « vitre » (rayon
// frais de l'hypermarché) : armoire réfrigérée à porte vitrée, fronton lumineux, clayettes garnies.
S('fridge', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  if (d.variant === 'vitre') return fridgeGlass(k, s, c, d);
  const pl = 0.06, zb = dd / 2 - 0.1, dt = 0.055, gap = 0.006, yf = y0 + pl + 0.6, white = shade(c, 1.03);
  rbox(k, 0, (y0 + pl + h / 2) / 2, (zb - dd / 2) / 2, w, h - pl, zb + dd / 2, 0.02, c, { skip: 'Z', C: { z: 0x55595c } });
  box(k, 0, y0 + pl / 2, (zb - dd / 2) / 2 - 0.02, w - 0.04, pl, zb + dd / 2 - 0.04, 0x1b1c1d, { skip: 'y' });
  slots(k, 0, y0 + pl / 2, zb - 0.0195, 12, 0.03, 0.01, 0.05, 0x050505);
  fq(k, 0, (y0 + pl + h / 2) / 2, zb - 0.0004, w - 0.04, h - pl - 0.04, 0x2f3336); // fond (visible dans les jours)
  const doors = [[yf + gap / 2, h / 2], [y0 + pl, yf - gap / 2]];
  doors.forEach(([a, b], i) => {
    const yc = (a + b) / 2, hh = b - a;
    box(k, 0, yc, zb + 0.004, w - 0.02, hh - 0.02, 0.008, 0x45494c); // joint
    rbox(k, 0, yc, zb + 0.008 + dt / 2, w - 0.004, hh - 0.002, dt, 0.016, white, { skip: 'z' });
    // poignée barre sur deux entretoises, côté gauche (charnières à droite)
    const hl = i === 0 ? 0.36 : 0.22, hy = i === 0 ? a + 0.08 + hl / 2 : b - 0.06 - hl / 2, hx = -w / 2 + 0.05, hz = zb + 0.008 + dt;
    rbox(k, hx, hy, hz + 0.026, 0.024, hl, 0.018, 0.008, ALU);
    for (const sy of [-1, 1]) box(k, hx, hy + sy * (hl / 2 - 0.03), hz + 0.009, 0.016, 0.02, 0.018, 0x9aa0a5);
  });
  fq(k, 0, yf, zb + 0.0004, w - 0.02, gap + 0.002, 0x0e0f10);
  // charnières (capots) à droite
  for (const yy of [h / 2 - 0.012, yf, y0 + pl + 0.01]) box(k, w / 2 - 0.05, yy, zb + 0.008 + dt / 2, 0.06, 0.012, dt + 0.006, 0xb4babf);
  fq(k, 0, h / 2 - 0.09, zb + 0.008 + dt + 0.0006, 0.12, 0.022, 0, 'Z', lab(k, 'froidex', 72, 14, { kind: 'plain', bg: white, fg: 0x8a9298, brand: 'FROIDEX' }));
  fq(k, w / 2 - 0.09, h / 2 - 0.16, zb + 0.008 + dt + 0.0006, 0.05, 0.03, 0x1c2a33); // afficheur de température
  k.meta.door = { x: 0, y: (yf + h / 2) / 2, z: zb + 0.008 + dt, w, h: h / 2 - yf };
});
function fridgeGlass(k, s, c, d) {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zf = dd / 2 - 0.045, gb = 0.14, hd = 0.2, fr = 0x2f353a;
  const yb = y0 + gb, yt = h / 2 - hd;
  rbox(k, 0, 0, (zf - dd / 2) / 2, w, h, zf + dd / 2, 0.015, c, { skip: 'Z' });
  box(k, 0, (h / 2 + yt) / 2, zf - 0.01, w - 0.03, hd - 0.01, 0.02, fr, { F: { Z: lab(k, 'frais', 112, 32, { kind: 'sign', name: 'PRODUITS FRAIS', sub: 'CONSERVER ENTRE 0 ET 4 °C', bg: 0x0d47a1, fg: 0xffffff, accent: 0x4fc3f7 }) } });
  box(k, 0, (y0 + yb) / 2, zf - 0.01, w - 0.03, gb - 0.01, 0.02, 0x1a1c1e); slots(k, 0, (y0 + yb) / 2, zf + 0.0005, 10, 0.04, 0.012, 0.06, 0x050505);
  // intérieur : fond, parois, rampe lumineuse, clayettes garnies
  const iw = w - 0.07, id = zf + dd / 2 - 0.06, iz = zf - id / 2 - 0.01;
  fq(k, 0, (yb + yt) / 2, iz - id / 2, iw, yt - yb, 0xf1f4f6);
  fqg(k, -iw / 2, (yb + yt) / 2, iz, id, yt - yb, 0xc5ccd1, 0xe8edf0, 'X'); fqg(k, iw / 2, (yb + yt) / 2, iz, id, yt - yb, 0xc5ccd1, 0xe8edf0, 'x');
  fq(k, 0, yt - 0.003, iz, iw, id, 0xffffff, 'y'); fq(k, 0, yb, iz, iw, id, 0x9aa3a8, 'Y');
  const rows = [[0, 1, 1, 0], [2, 7, 2], [3, 4, 3], [6, 1, 6, 0], [5, 5]], ns = rows.length, sh = (yt - yb) / ns;
  rows.forEach((kinds, i) => {
    const y = yb + i * sh + 0.01;
    if (i > 0) { box(k, 0, y - 0.006, iz, iw, 0.008, id, 0xb9c0c5); fq(k, 0, y - 0.016, iz + id / 2 + 0.0005, iw, 0.022, 0, 'Z', lab(k, 'vstrip', 160, 12, { kind: 'strip', bg: 0x263238, accent: 0x37474f })); }
    freshRow(k, -iw / 2, iw / 2, y, iz + id / 2 - 0.01, id, kinds);
  });
  // porte vitrée : cadre, poignée barre
  const fw = 0.04;
  for (const [x, y, ww, hh] of [[0, yt - fw / 2, w - 0.02, fw], [0, yb + fw / 2, w - 0.02, fw], [-w / 2 + 0.01 + fw / 2, (yb + yt) / 2, fw, yt - yb], [w / 2 - 0.01 - fw / 2, (yb + yt) / 2, fw, yt - yb]]) rbox(k, x, y, zf + 0.012, ww, hh, 0.024, 0.006, fr);
  rbox(k, -w / 2 + 0.06, (yb + yt) / 2, zf + 0.034, 0.024, 0.8, 0.018, 0.008, ALU);
  for (const sy of [-1, 1]) box(k, -w / 2 + 0.06, (yb + yt) / 2 + sy * 0.36, zf + 0.0245, 0.016, 0.02, 0.012, 0x9aa0a5);
  fq(k, 0.18, yb + 0.06, zf + 0.0245, 0.12, 0.04, 0, 'Z', lab(k, 'frtemp', 48, 16, { kind: 'sign', name: '+3 °C', bg: 0x101418, fg: 0x40c4ff, accent: 0x101418 }));
  k.meta.door = { x: 0, y: (yb + yt) / 2, z: zf + 0.024, w, h: yt - yb };
}
// Congélateur coffre à glaces : caisse aux angles arrondis, bandeau de protection, rebord, couvercles vitrés
// coulissants (cadres alu), cuve garnie de bacs, décor « GLACES », thermostat, socle à roulettes
S('freezer', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, pb = 0.06, yR = h / 2 - 0.068, rim = 0x8fa3ad;
  rbox(k, 0, (y0 + pb + yR) / 2, 0, w, yR - y0 - pb, dd, 0.035, c, { skip: 'Y' });
  box(k, 0, y0 + pb / 2, 0, w - 0.06, pb, dd - 0.06, 0x2a2d30, { skip: 'y' });
  slots(k, 0, y0 + pb / 2, dd / 2 - 0.0295, 16, 0.04, 0.012, 0.07, 0x0a0a0a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(k, sx * (w / 2 - 0.08), y0 + 0.025, sz * (dd / 2 - 0.08), 0.025, 0.04, 0x1c1c1c, 'x', 8);
  // bandeau de protection
  for (const sz of [-1, 1]) rbox(k, 0, y0 + 0.32, sz * (dd / 2 - 0.0062), w - 0.03, 0.04, 0.012, 0.005, 0x78909c, { skip: sz > 0 ? 'z' : 'Z' });
  // rebord et cuve
  const rw = 0.065, cw = w - 2 * rw, cd = dd - 2 * rw;
  for (const [x, z, ww, dz] of [[0, dd / 2 - rw / 2, w, rw], [0, -dd / 2 + rw / 2, w, rw], [w / 2 - rw / 2, 0, rw, cd], [-w / 2 + rw / 2, 0, rw, cd]]) rbox(k, x, yR + 0.015, z, ww, 0.03, dz, 0.01, rim, { skip: 'y' });
  const yp = yR - 0.07;
  for (const [x, z, f, ww] of [[0, cd / 2, 'z', cw], [0, -cd / 2, 'Z', cw], [cw / 2, 0, 'x', cd], [-cw / 2, 0, 'X', cd]]) fqg(k, x, (yp + yR) / 2, z, ww, yR - yp, 0xb5c3ca, 0xf5f8fa, f);
  // bacs garnis (vus de dessus)
  const ICE = [['Banquise', 'Vanille', 0xfff3e0], ['Banquise', 'Chocolat', 0x5d4037], ['Glacier', 'Fraise', 0xf06292], ['Glacier', 'Pistache', 0x9ccc65], ['Banquise', 'Cônes', 0x1e88e5], ['Glacier', 'Sorbet', 0xffb300]];
  const nx = 6, nz = 2;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = -cw / 2 + (i + 0.5) * cw / nx, z = -cd / 2 + (j + 0.5) * cd / nz, [b, nm, bg] = ICE[(i + j * 3) % ICE.length];
    const R = lab(k, 'ice:' + nm, 56, 40, { kind: 'box', brand: b, name: nm, picto: 'icecream', bg });
    if ((i + j) % 3 === 2) k.tube(x, yp + 0.04, z, Math.min(cw / nx, cd / nz) * 0.38, 0.08, bg, 10, { topRect: R, tc: 0xffffff });
    else rbox(k, x, yp + 0.035, z, cw / nx - 0.02, 0.07, cd / nz - 0.03, 0, bg, { F: { Y: R }, skip: 'y' });
  }
  for (let i = 1; i < nx; i++) box(k, -cw / 2 + i * cw / nx, yp + 0.05, 0, 0.004, 0.1, cd - 0.01, 0xcfd8dc);
  // couvercles coulissants (cadres alu, poignées)
  for (const [x, yy] of [[-w / 4 + rw / 4, yR + 0.036], [w / 4 - rw / 4, yR + 0.05]]) {
    const pw = w / 2 + 0.03;
    for (const [dx, dz, ww, ddz] of [[0, dd / 2 - rw * 0.75, pw, 0.03], [0, -dd / 2 + rw * 0.75, pw, 0.03], [pw / 2 - 0.015, 0, 0.03, dd - rw * 1.5], [-pw / 2 + 0.015, 0, 0.03, dd - rw * 1.5]]) box(k, x + dx, yy, dz, ww, 0.012, ddz, 0xc8d0d4);
    rbox(k, x + (x < 0 ? 1 : -1) * (pw / 2 - 0.06), yy + 0.01, 0, 0.05, 0.012, 0.16, 0.004, 0x37474f);
  }
  // décor et thermostat
  fq(k, -0.15, y0 + 0.19, dd / 2 + 0.0006, 0.9, 0.2, 0, 'Z', lab(k, 'glaces', 160, 36, { kind: 'banner', name: 'GLACES', sub: 'CRÈMES GLACÉES · SORBETS', bg: 0x1e88e5, picto: 'icecream', accent: 0xffffff }));
  fq(k, w / 2 - 0.15, y0 + 0.2, dd / 2 + 0.0006, 0.1, 0.04, 0, 'Z', lab(k, 'frztemp', 48, 18, { kind: 'sign', name: '-18 °C', bg: 0x101418, fg: 0xff5252, accent: 0x101418 }));
  k.meta.lid = true;
});

// ═════════════════════════ LOCAUX TECHNIQUES ═════════════════════════
const hazard = (k) => lab(k, 'dangerelec', 48, 40, { kind: 'banner', name: 'DANGER', sub: '400 V', bg: 0xffd600, picto: 'bolt', accent: 0x111111, fg: 0x111111 });
// manomètre / cadran rond (face vers n) : boîtier, cadran clair, aiguille
function gauge(k, x, y, z, r, n = [0, 0, 1], body = 0x2a2a2a) {
  const N = new THREE.Vector3(...n);
  disc(k, x, y, z, r * 1.15, body, n, 12); disc(k, x + N.x * 0.001, y + N.y * 0.001, z + N.z * 0.001, r, 0xeeeae0, n, 12);
  const U = new THREE.Vector3(Math.abs(N.y) < 0.9 ? 0 : 1, Math.abs(N.y) < 0.9 ? 1 : 0, 0).cross(N).normalize(), V = new THREE.Vector3().crossVectors(N, U);
  const a = 0.7, d = new THREE.Vector3().addScaledVector(U, Math.cos(a)).addScaledVector(V, Math.sin(a)), o = new THREE.Vector3(x, y, z).addScaledVector(N, 0.002), e = o.clone().addScaledVector(d, r * 0.8), t = new THREE.Vector3().crossVectors(N, d).multiplyScalar(r * 0.04);
  q4(k, [o.clone().sub(t).toArray(), e.clone().sub(t).toArray(), e.clone().add(t).toArray(), o.clone().add(t).toArray()], [n, n, n, n], 0xd50000);
}
// Groupe électrogène diesel sur châssis : longerons, réservoir, moteur (culasse, filtre à air, lanceur à tirette),
// radiateur et sa calandre, alternateur ajouré, boîte à bornes, pupitre de commande (cadrans, arrêt d'urgence),
// silencieux et pot d'échappement, batterie, boîtier de sortie du câble, signalétique
S('generator', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, dk = 0x2b2e31, steel = 0x4a4f54;
  for (const sz of [-1, 1]) rbox(k, 0, y0 + 0.06, sz * (dd / 2 - 0.12), w, 0.12, 0.1, 0.008, dk);
  for (const x of [-0.9, 0, 0.9]) box(k, x, y0 + 0.06, 0, 0.08, 0.1, dd - 0.3, dk);
  rbox(k, 0.05, y0 + 0.24, 0, 1.7, 0.24, 0.8, 0.02, 0x3a3e42);
  rbox(k, 0.55, y0 + 0.37, 0.2, 0.12, 0.03, 0.12, 0.008, 0x222222); cyl(k, 0.55, y0 + 0.4, 0.2, 0.04, 0.04, 0x1a1a1a, 'y', 10);
  // moteur
  const ex = -0.5, ey = y0 + 0.36;
  rbox(k, ex, ey + 0.27, 0, 0.8, 0.54, 0.55, 0.03, c);
  rbox(k, ex, ey + 0.6, 0, 0.62, 0.12, 0.38, 0.03, 0x262829);
  for (let i = 0; i < 4; i++) cyl(k, ex - 0.22 + i * 0.145, ey + 0.67, 0, 0.012, 0.02, 0x8a9096, 'y', 6);
  cyl(k, ex + 0.12, ey + 0.76, -0.12, 0.11, 0.16, 0x1e1f21, 'y', 14); cyl(k, ex + 0.12, ey + 0.845, -0.12, 0.05, 0.012, 0x8a9096, 'y', 10);
  sweep(k, [[ex + 0.12, ey + 0.7, -0.12], [ex + 0.04, ey + 0.64, -0.05]], 0.03, 0x1a1a1a, { segs: 8 });
  cyl(k, ex + 0.3, ey + 0.2, 0.29, 0.045, 0.1, 0xe65100, 'z', 10);
  // lanceur à tirette (carter rond, poignée en T)
  lat(k, [[0.15, 0], [0.15, 0.04], [0.13, 0.055, null, 'h'], [0.03, 0.06], [0.001, 0.062]], 0x2e3134, { segs: 16, m: M(ex - 0.15, ey + 0.28, 0.275, PI / 2), bot: 0x2e3134 });
  sweep(k, [[ex - 0.15, ey + 0.28, 0.337], [ex - 0.12, ey + 0.2, 0.375]], 0.004, 0x111111, { segs: 4 });
  at(k, M(ex - 0.12, ey + 0.19, 0.38, 0, 0, 0.2), () => { cyl(k, 0, 0, 0, 0.016, 0.11, 0xd32f2f, 'x', 8); });
  // radiateur
  const rx = -w / 2 + 0.08;
  rbox(k, rx, ey + 0.42, 0, 0.14, 0.84, 0.86, 0.02, dk);
  for (let i = 0; i < 18; i++) fq(k, rx - 0.0705, ey + 0.06 + i * 0.042, 0, 0.78, 0.012, 0x0c0c0c, 'x');
  cyl(k, rx + 0.02, ey + 0.86, 0.25, 0.03, 0.03, 0x8a9096, 'y', 10);
  // alternateur
  const ax = 0.42; lat(k, [[0.28, -0.32], [0.3, -0.29], [0.3, 0.26], [0.27, 0.3], [0.12, 0.34], [0.001, 0.34]], shade(c, 0.9), { segs: 18, m: M(ax, ey + 0.28, 0, 0, 0, -PI / 2), bot: 0x333333 });
  for (let i = 0; i < 10; i++) { const a = -0.6 + i * 0.13; fq(k, ax + 0.12, ey + 0.28 + Math.sin(a) * 0.301, Math.cos(a) * 0.301, 0.1, 0.012, 0x161616, 'Z'); }
  rbox(k, ax - 0.05, ey + 0.62, 0, 0.3, 0.12, 0.26, 0.01, 0x37474f);
  // pupitre de commande
  const px = 0.82, py = ey + 0.62, pz = 0.25;
  box(k, px, ey + 0.31, pz - 0.05, 0.04, 0.62, 0.04, steel);
  rbox(k, px, py, pz, 0.46, 0.38, 0.14, 0.012, 0x37474f);
  gauge(k, px - 0.12, py + 0.07, pz + 0.071, 0.05); gauge(k, px + 0.02, py + 0.07, pz + 0.071, 0.05); k.meta.gauge = [px + 0.02, py + 0.07, pz + 0.075];
  for (let i = 0; i < 3; i++) { disc(k, px - 0.12 + i * 0.07, py - 0.08, pz + 0.071, 0.012, [0x00e676, 0xffd600, 0xff1744][i], [0, 0, 1], 8); cyl(k, px - 0.12 + i * 0.07, py - 0.035, pz + 0.08, 0.004, 0.02, 0xd0d0d0, 'z', 5); }
  cyl(k, px + 0.15, py - 0.07, pz + 0.08, 0.035, 0.02, 0xffd600, 'z', 12); lat(k, [[0.03, 0], [0.032, 0.012], [0.026, 0.026], [0.001, 0.03]], 0xd50000, { segs: 12, m: M(px + 0.15, py - 0.07, pz + 0.09, PI / 2) });
  fq(k, px + 0.13, py + 0.11, pz + 0.0705, 0.12, 0.1, 0, 'Z', hazard(k));
  // silencieux et échappement
  cyl(k, ex, ey + 0.95, 0.12, 0.11, 0.62, 0x5d5f61, 'x', 14);
  sweep(k, rpath([[ex + 0.2, ey + 0.95, 0.12], [ex + 0.42, ey + 0.95, 0.12], [ex + 0.42, h / 2 - 0.02, 0.12]], 0.1, 5), 0.04, 0x4a4c4e, { segs: 10 });
  for (const sx of [-0.2, 0.2]) box(k, ex + sx, ey + 0.8, 0.12, 0.03, 0.2, 0.05, dk);
  // batterie, boîtier de sortie et câble
  rbox(k, 0.88, y0 + 0.47, -0.25, 0.26, 0.2, 0.17, 0.01, 0x111111); for (const bx of [0.8, 0.96]) cyl(k, bx, y0 + 0.58, -0.25, 0.012, 0.02, bx < 0.9 ? 0xd50000 : 0x111111, 'y', 8);
  const cx = -w * 0.45, cz = dd * 0.5 - 0.06; rbox(k, cx, 0, cz, 0.14, 0.16, 0.1, 0.01, 0x37474f); disc(k, cx, 0, cz + 0.0505, 0.035, 0x1d1d1d, [0, 0, 1], 12);
  sweep(k, rpath([[cx, -0.08, cz], [cx, y0 + 0.03, cz], [cx + 0.35, y0 + 0.02, cz + 0.02]], 0.08, 4), 0.016, 0x151515, { segs: 6 });
  k.meta.cord = [cx, 0, dd * 0.5];
  fq(k, 0.05, y0 + 0.24, 0.4006, 0.4, 0.1, 0, 'Z', lab(k, 'gofuel', 96, 24, { kind: 'sign', name: 'GAZOLE', sub: 'RÉSERVOIR 200 L', bg: 0x212121, fg: 0xffd600, accent: 0xffd600 }));
});
// Tableau électrique général : trois armoires (portes, poignées à levier, charnières, ouïes), interrupteur général
// rotatif, voyants, appareils de mesure, signalétique, socle, chemin de câbles au-dessus
S('panel', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, n = 3, cw = w / n, ph = 0.1, zf = dd / 2 - 0.065, top = h / 2 - 0.12;
  box(k, 0, y0 + ph / 2, -0.015, w - 0.02, ph, dd - 0.06, 0x1d1d1d);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + cw * (i + 0.5), yc = (y0 + ph + top) / 2, ch = top - y0 - ph;
    rbox(k, x, yc, -0.015 - 0.015, cw - 0.006, ch, zf + dd / 2 - 0.03, 0.01, c);
    rbox(k, x, yc, zf + 0.01, cw - 0.03, ch - 0.03, 0.02, 0.006, shade(c, 1.08));
    for (const yy of [yc + ch * 0.36, yc - ch * 0.36]) cyl(k, x - cw / 2 + 0.02, yy, zf + 0.012, 0.01, 0.07, 0x7d858b, 'y', 8);
    rbox(k, x + cw / 2 - 0.07, yc, zf + 0.026, 0.04, 0.12, 0.012, 0.006, 0x37474f); at(k, M(x + cw / 2 - 0.07, yc - 0.03, zf + 0.04, 0, 0, 0), () => rbox(k, 0, 0, 0, 0.022, 0.1, 0.018, 0.008, 0x212121));
    slots(k, x, y0 + ph + 0.12, zf + 0.0205, 6, 0.3, 0.012, 0.03, 0x37474f, 'Z', true);
    slots(k, x, top - 0.12, zf + 0.0205, 4, 0.3, 0.012, 0.03, 0x37474f, 'Z', true);
    fq(k, x, yc + ch * 0.28, zf + 0.0205, 0.13, 0.11, 0, 'Z', hazard(k));
    fq(k, x, yc + ch * 0.12, zf + 0.0205, 0.2, 0.04, 0, 'Z', lab(k, 'tgbt' + i, 72, 16, { kind: 'plain', bg: 0xffffff, fg: 0x111111, brand: ['DÉPART GALERIE', 'TGBT · ARRIVÉE', 'DÉPART PARKING'][i] }));
  }
  // interrupteur général (porte centrale), voyants, appareils de mesure
  rbox(k, 0, 0.05, zf + 0.024, 0.16, 0.16, 0.01, 0.006, 0xffd600);
  at(k, M(0, 0.05, zf + 0.04, 0, 0, -0.5), () => { cyl(k, 0, 0, 0, 0.04, 0.02, 0xd50000, 'z', 12); rbox(k, 0, 0.04, 0.01, 0.03, 0.11, 0.025, 0.01, 0xd50000); });
  for (let i = 0; i < 3; i++) { disc(k, -0.06 + i * 0.06, -0.15, zf + 0.0206, 0.014, [0x00c853, 0xffab00, 0xd50000][i], [0, 0, 1], 10); disc(k, -0.06 + i * 0.06, -0.15, zf + 0.0204, 0.019, 0x26292c, [0, 0, 1], 10, 0.014); }
  for (const mx of [-0.08, 0.08]) { rbox(k, mx, 0.32, zf + 0.026, 0.1, 0.1, 0.012, 0.004, 0x212121); fq(k, mx, 0.32, zf + 0.0322, 0.08, 0.08, 0xf2efe6); fq(k, mx + 0.01, 0.3, zf + 0.0326, 0.004, 0.05, 0x111111); }
  // chemin de câbles
  box(k, 0, h / 2 - 0.05, -0.02, w, 0.006, dd - 0.06, 0x9aa1a6);
  for (const sz of [-1, 1]) box(k, 0, h / 2 - 0.03, -0.02 + sz * (dd / 2 - 0.035), w, 0.05, 0.006, 0x9aa1a6);
  for (let i = 0; i < 6; i++) sweep(k, rpath([[-0.7 + i * 0.28, h / 2 - 0.04, -0.06 + (i % 3) * 0.04], [-0.7 + i * 0.28, top + 0.01, -0.06 + (i % 3) * 0.04]], 0, 1), 0.012, [0x1a1a1a, 0x263238, 0x4e342e][i % 3], { segs: 6 });
});
// Régie d'annonces : meuble pupitre (baie de rack : amplis à voyants), table de mixage (curseurs, boutons),
// microphone col-de-cygne à bague rouge, carillon, retour de contrôle, voyant « ANTENNE »
S('console_pa', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yt = y0 + 0.72, dk = 0x1b1d1f;
  rbox(k, 0, (y0 + yt) / 2, -0.01, w, yt - y0, dd - 0.02, 0.015, c);
  box(k, 0, yt + 0.008, 0, w, 0.016, dd, 0x3a2a1f);
  fq(k, -0.2, y0 + 0.32, dd / 2 - 0.0195, 0.5, 0.52, 0x0c0c0d);
  // baie de rack (face avant)
  for (let i = 0; i < 4; i++) {
    const y = y0 + 0.14 + i * 0.12;
    rbox(k, -0.2, y, dd / 2 - 0.026, 0.48, 0.1, 0.012, 0.003, dk);
    for (const sx of [-1, 1]) for (const yy of [-0.03, 0.03]) disc(k, -0.2 + sx * 0.22, y + yy, dd / 2 - 0.0198, 0.005, 0x9aa1a6, [0, 0, 1], 6);
    for (let j = 0; j < 5; j++) fq(k, -0.32 + j * 0.03, y + 0.02, dd / 2 - 0.0198, 0.018, 0.006, j < 3 + (i % 2) ? 0x00e676 : 0xff9100);
    for (let j = 0; j < 3; j++) cyl(k, -0.08 + j * 0.06, y - 0.01, dd / 2 - 0.014, 0.011, 0.012, 0x2b2b2b, 'z', 8);
  }
  fq(k, 0.35, y0 + 0.33, dd / 2 - 0.0194, 0.36, 0.5, shade(c, 0.8));
  // table de mixage
  at(k, M(-0.12, yt + 0.016, 0.02, 0.18), () => {
    rbox(k, 0, 0.025, 0, 0.76, 0.05, 0.44, 0.01, 0x2a2d30);
    fq(k, 0, 0.0505, -0.09, 0.72, 0.22, 0x6a6c70, 'Y', lab(k, 'mixknobs', 120, 40, { kind: 'lids', nx: 12, nz: 4 })); // boutons sombres
    for (let i = 0; i < 12; i++) { const x = -0.33 + i * 0.06; fq(k, x, 0.0505, 0.12, 0.006, 0.14, 0x080808, 'Y'); box(k, x, 0.058, 0.1 + ((i * 37) % 7) * 0.008, 0.026, 0.014, 0.014, i === 11 ? 0xd50000 : 0xdedede); }
  });
  // micro col-de-cygne
  const mx = 0.36, mz = 0.05;
  lat(k, [[0.07, 0], [0.07, 0.015], [0.05, 0.025, null, 'h'], [0.012, 0.03], [0.001, 0.03]], 0x1a1a1a, { segs: 14, m: M(mx, yt + 0.016, mz), bot: 0x1a1a1a });
  const neck = []; for (let i = 0; i <= 10; i++) { const t = i / 10; neck.push([mx - 0.02 * Math.sin(t * 2), yt + 0.046 + 0.11 * Math.sin(t * PI / 2), mz + 0.13 * (1 - Math.cos(t * PI / 2))]); }
  sweep(k, neck, 0.0075, 0x2a2a2a, { segs: 6 });
  const tip = neck[10]; cyl(k, tip[0], tip[1] + 0.005, tip[2] + 0.02, 0.012, 0.012, 0xd50000, 'z', 10); lat(k, [[0.015, 0], [0.018, 0.02], [0.018, 0.06], [0.016, 0.075], [0.001, 0.08]], 0x111111, { segs: 10, m: M(tip[0], tip[1] + 0.005, tip[2] + 0.025, PI / 2) });
  // carillon, retour, voyant antenne
  rbox(k, 0.36, yt + 0.046, -0.2, 0.22, 0.06, 0.14, 0.01, 0xd7ccc8); for (let i = 0; i < 3; i++) cyl(k, 0.29 + i * 0.07, yt + 0.08, -0.2, 0.018, 0.012, [0x43a047, 0xfbc02d, 0xe53935][i], 'y', 10);
  rbox(k, -0.48, yt + 0.096, -0.24, 0.14, 0.16, 0.14, 0.012, 0x161616); disc(k, -0.48, yt + 0.08, -0.1695, 0.042, 0x2b2b2b, [0, 0, 1], 14); disc(k, -0.48, yt + 0.145, -0.1695, 0.014, 0x2b2b2b, [0, 0, 1], 10);
  rbox(k, 0.0, yt + 0.06, -0.3, 0.2, 0.06, 0.05, 0.008, 0x161616); fq(k, 0, yt + 0.06, -0.2745, 0.18, 0.045, 0, 'Z', lab(k, 'onair', 64, 16, { kind: 'sign', name: 'ANTENNE', bg: 0x5a0000, fg: 0xff5252, accent: 0x5a0000 }));
});
// Chariot élévateur thermique (GPL) : châssis et contrepoids, roues (bandages pleins), protège-conducteur à toit
// grillagé, siège, volant, leviers, mât (montants, vérin, chaînes), tablier, fourches, bouteille de gaz, gyrophare
S('forklift', (k, s, c) => {
  const w = s[0], h = s[1], L2 = s[2], y0 = -h / 2, yb = y0 + 0.2, yd = y0 + 0.82, dk = 0x2b2d30, zr = -L2 / 2;
  // châssis, capot moteur, contrepoids
  rbox(k, 0, (yb + yd) / 2, -0.5, 1.02, yd - yb, 1.4, 0.05, c);
  rbox(k, 0, yd + 0.03, -0.82, 0.9, 0.06, 0.6, 0.03, c);
  rbox(k, 0, yb + 0.3, zr + 0.2, 1.1, 0.62, 0.4, 0.08, dk);
  for (const sx of [-1, 1]) { fq(k, sx * 0.42, yb + 0.42, zr - 0.0005, 0.08, 0.05, 0xd50000, 'z'); fq(k, sx * 0.42, yb + 0.36, zr - 0.0005, 0.08, 0.03, 0xff9800, 'z'); }
  rbox(k, 0, yb + 0.06, -0.45, 1.06, 0.12, 1.3, 0.03, dk);
  // roues
  for (const [z, R, W] of [[0.02, 0.3, 0.2], [-0.95, 0.22, 0.16]]) for (const sx of [-1, 1]) wheel(k, sx * (w / 2 - W / 2 - 0.005), y0 + R, z, sx, R, W, 0xffa000, 0);
  // poste de conduite : plancher, siège, tableau, volant, leviers
  box(k, 0, yd - 0.06, -0.2, 0.84, 0.03, 0.5, 0x1a1a1a);
  rbox(k, 0, yd + 0.13, -0.72, 0.46, 0.1, 0.42, 0.04, 0x1c1c1c); at(k, M(0, yd + 0.42, -0.92, -0.18), () => rbox(k, 0, 0, 0, 0.46, 0.5, 0.1, 0.04, 0x1c1c1c));
  rbox(k, 0, yd + 0.16, -0.05, 0.5, 0.32, 0.18, 0.03, c);
  const cw = new THREE.Vector3(0, yd + 0.55, -0.18), cd = new THREE.Vector3(0, 0.75, 0.66).normalize(), U = new THREE.Vector3(1, 0, 0), V = new THREE.Vector3().crossVectors(cd, U);
  sweep(k, [[0, yd + 0.3, -0.04], cw.toArray()], 0.025, 0x1a1a1a, { segs: 8 });
  { const ring = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; ring.push(cw.clone().addScaledVector(U, Math.cos(a) * 0.16).addScaledVector(V, Math.sin(a) * 0.16).toArray()); } sweep(k, ring, 0.014, 0x111111, { closed: true, segs: 6 }); }
  for (let i = 0; i < 3; i++) { const lx = 0.2 + i * 0.05; sweep(k, [[lx, yd + 0.3, -0.02], [lx, yd + 0.5, -0.06]], 0.006, 0x222222, { segs: 4 }); lat(k, sphereP(0.016, yd + 0.51), [0xd50000, 0x111111, 0x111111][i], { segs: 8, m: M(lx, 0, -0.06) }); }
  // protège-conducteur
  const yr = h / 2 - 0.1;
  for (const sx of [-1, 1]) { sweep(k, [[sx * 0.45, yd + 0.05, 0.1], [sx * 0.45, yr, -0.1]], 0.03, 0x1d1d1d, { sq: true, segs: 4 }); sweep(k, [[sx * 0.45, yd + 0.05, -1.05], [sx * 0.45, yr, -1.05]], 0.03, 0x1d1d1d, { sq: true, segs: 4 }); }
  rbox(k, 0, yr + 0.02, -0.575, 0.98, 0.04, 1.03, 0.01, 0x1d1d1d, { skip: 'Yy' });
  for (let i = 0; i < 7; i++) box(k, 0, yr + 0.02, -1.02 + i * 0.148, 0.94, 0.03, 0.025, 0x1d1d1d);
  cyl(k, 0.3, yr + 0.07, -0.9, 0.04, 0.06, 0xff9100, 'y', 10); cyl(k, 0.3, yr + 0.045, -0.9, 0.05, 0.012, 0x111111, 'y', 10);
  for (const sx of [-0.3, 0.3]) { rbox(k, sx, yr - 0.05, -0.1, 0.12, 0.08, 0.08, 0.02, 0x222222); disc(k, sx, yr - 0.05, -0.0595, 0.03, 0xfffde7, [0, 0, 1], 10); }
  k.meta.light = [0, yr - 0.05, -0.05];
  // bouteille de gaz sur le contrepoids
  lat(k, [[0.13, -0.38], [0.15, -0.34], [0.15, 0.34], [0.13, 0.38], [0.05, 0.4], [0.001, 0.4]], 0xd84315, { segs: 14, m: M(0, yd + 0.24, zr + 0.3, 0, 0, PI / 2), bot: 0xd84315 });
  for (const sx of [-0.25, 0.25]) box(k, sx, yd + 0.16, zr + 0.3, 0.04, 0.16, 0.22, dk);
  // mât, vérin, chaînes, tablier et fourches
  const zm = 0.3, ym = (y0 + 0.1 + yr - 0.05) / 2, hm = yr - 0.05 - y0 - 0.1;
  for (const sx of [-1, 1]) { rbox(k, sx * 0.36, ym, zm, 0.08, hm, 0.12, 0.01, 0x30343a); rbox(k, sx * 0.28, ym + 0.05, zm + 0.04, 0.06, hm - 0.1, 0.1, 0.01, 0x3a3e44); box(k, sx * 0.17, ym, zm + 0.02, 0.02, hm - 0.2, 0.012, 0x111111); }
  for (const yy of [y0 + 0.3, ym, yr - 0.15]) box(k, 0, yy, zm, 0.64, 0.06, 0.06, 0x30343a);
  cyl(k, 0, ym, zm - 0.05, 0.045, hm - 0.3, 0x8a9096, 'y', 10); cyl(k, 0, ym - (hm - 0.3) / 2 + 0.15, zm - 0.05, 0.06, 0.3, 0x30343a, 'y', 10);
  const yc = y0 + 0.25;
  rbox(k, 0, yc, zm + 0.13, 0.9, 0.36, 0.05, 0.01, 0x2a2d31);
  for (let i = 0; i < 5; i++) box(k, -0.36 + i * 0.18, yc + 0.38, zm + 0.12, 0.03, 0.4, 0.03, 0x2a2d31);
  box(k, 0, yc + 0.57, zm + 0.12, 0.9, 0.03, 0.03, 0x2a2d31);
  const fl = L2 / 2 - zm - 0.17 - 0.005;
  for (const sx of [-0.27, 0.27]) { rbox(k, sx, yc + 0.02, zm + 0.18, 0.1, 0.45, 0.04, 0.008, 0x1d1f21); rbox(k, sx, y0 + 0.025, zm + 0.17 + fl / 2, 0.1, 0.04, fl, 0.008, 0x1d1f21); }
  fq(k, 0, yd - 0.05, 0.2006, 0.3, 0.12, 0, 'Z', lab(k, 'fkcap', 64, 24, { kind: 'sign', name: '2 500 kg', sub: 'CHARGE MAXI', bg: 0x212121, fg: 0xffffff, accent: 0xffd600 }));
});
// Chaudière à fioul sur socle : corps cylindrique calorifugé (viroles, colliers), brûleur et coffret, manomètre,
// thermomètre, départ et retour à vannes à volant, conduit de fumée coudé vers le mur, purgeur. Variante chauffe-eau
// électrique (cumulus) : cuve émaillée, capot de thermostat, groupe de sécurité, raccords bleu / rouge, pieds.
S('boiler', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  if (w < 0.8) {
    const R = w / 2 - 0.02, yb = y0 + 0.22;
    lat(k, [[0.001, yb], [R * 0.6, yb + 0.02], [R * 0.92, yb + 0.07], [R, yb + 0.14], [R, h / 2 - 0.12, null], [R * 0.92, h / 2 - 0.05], [R * 0.6, h / 2 - 0.01], [0.001, h / 2]], c, { segs: 20 });
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; sweep(k, [[Math.cos(a) * R * 0.7, yb + 0.06, Math.sin(a) * R * 0.7], [Math.cos(a) * R * 0.85, y0 + 0.005, Math.sin(a) * R * 0.85]], 0.012, 0x9aa1a6, { segs: 5 }); }
    rbox(k, 0, yb + 0.02, R - 0.02, 0.22, 0.14, 0.06, 0.02, 0xdfe3e6);
    disc(k, -0.04, yb + 0.03, R + 0.011, 0.025, 0x37474f, [0, 0, 1], 12); disc(k, 0.06, yb + 0.03, R + 0.011, 0.007, 0x76ff03, [0, 0, 1], 8);
    fq(k, 0, yb + 0.5, R + 0.0005, 0.14, 0.05, 0, 'Z', lab(k, 'cumulus', 64, 20, { kind: 'plain', bg: c, fg: 0x5d6b73, brand: 'THERMOR 200 L' }));
    for (const [x, col] of [[-0.09, 0x1e88e5], [0.09, 0xd32f2f]]) { sweep(k, rpath([[x, yb + 0.01, 0.0], [x, y0 + 0.12, 0.0], [x, y0 + 0.12, -dd / 2 + 0.02]], 0.04, 3), 0.012, col, { segs: 6 }); }
    rbox(k, -0.09, y0 + 0.16, 0.0, 0.04, 0.06, 0.05, 0.008, 0xc9a74a); cyl(k, -0.09, y0 + 0.13, 0.04, 0.008, 0.04, 0xd50000, 'z', 6);
    return;
  }
  const R = 0.42, zc = -0.15, yb = y0 + 0.18, yt = h / 2 - 0.35, yf = h / 2 - 0.1;
  rbox(k, 0, y0 + 0.09, zc, w - 0.1, 0.18, dd - 0.32, 0.02, 0x3a3c3e);
  lat(k, [[0.001, yb], [R, yb + 0.002], [R, yb + 0.25, shade(c, 0.94)], [R, yb + 0.26, 0x2a2a2a], [R, yt - 0.26, c], [R, yt - 0.25, 0x2a2a2a], [R, yt, shade(c, 0.94)], [R * 0.6, yt + 0.12, c], [0.001, yt + 0.14]], c, { segs: 20, m: M(0, 0, zc) });
  // brûleur et coffret
  const bz = zc + R + 0.02;
  rbox(k, 0, yb + 0.45, bz + 0.06, 0.32, 0.28, 0.22, 0.04, 0x1565c0);
  lat(k, [[0.09, 0], [0.1, 0.1], [0.08, 0.12]], 0x0d47a1, { segs: 14, m: M(0, yb + 0.45, bz + 0.17, PI / 2), top: 0x0a0a0a });
  rbox(k, 0.24, yb + 0.78, zc + R * 0.82, 0.26, 0.3, 0.12, 0.01, 0xeceff1); fq(k, 0.24, yb + 0.83, zc + R * 0.82 + 0.0605, 0.12, 0.05, 0x0f2a12);
  for (let i = 0; i < 3; i++) disc(k, 0.18 + i * 0.06, yb + 0.71, zc + R * 0.82 + 0.061, 0.012, [0x00e676, 0xffd600, 0xff1744][i], [0, 0, 1], 8);
  gauge(k, -0.2, yb + 0.95, zc + Math.sqrt(R * R - 0.04) + 0.012, 0.05); gauge(k, -0.2, yb + 0.8, zc + Math.sqrt(R * R - 0.04) + 0.012, 0.04);
  // départ / retour, vannes à volant
  for (const [x, col] of [[-0.25, 0xb71c1c], [0.25, 0x1565c0]]) {
    sweep(k, rpath([[x, yt + 0.05, zc], [x, yf, zc], [x, yf, -dd / 2 + 0.01]], 0.08, 4), 0.045, col, { segs: 10 });
    const vy = yf - 0.15; cyl(k, x, vy, zc, 0.06, 0.1, 0xc9a74a, 'y', 10);
    sweep(k, [[x, vy, zc + 0.05], [x, vy, zc + 0.11]], 0.008, 0x9e9e9e, { segs: 5 });
    const ring = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ring.push([x + Math.cos(a) * 0.075, vy + Math.sin(a) * 0.075, zc + 0.115]); }
    sweep(k, ring, 0.009, 0xd50000, { closed: true, segs: 6 });
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; sweep(k, [[x, vy, zc + 0.115], [x + Math.cos(a) * 0.072, vy + Math.sin(a) * 0.072, zc + 0.115]], 0.005, 0xd50000, { segs: 4 }); }
  }
  // conduit de fumée coudé vers le mur
  sweep(k, rpath([[0, yt, zc + 0.05], [0, yf, zc + 0.05], [0, yf, -dd / 2 + 0.01]], 0.14, 6), 0.08, 0x5d5f61, { segs: 14 });
  fq(k, 0, y0 + 0.09, zc + (dd - 0.32) / 2 + 0.0005, 0.26, 0.09, 0, 'Z', lab(k, 'chaud', 72, 24, { kind: 'plain', bg: c, fg: 0xf0e6d8, brand: 'CHAUFFERIE · 1987' }));
});

// ═════════════════════════ ÉLECTROMÉNAGER ═════════════════════════
// bouton rotatif (axe z) : jupe, prise striée, repère
function knob(k, x, y, z, r, c = 0xd8d8d8) { lat(k, [[r, 0], [r, r * 0.6], [r * 0.8, r * 0.9, null, 'h'], [0.001, r * 0.9]], c, { segs: 12, m: M(x, y, z, PI / 2), bot: c }); fq(k, x, y + r * 0.45, z + r * 0.905, r * 0.18, r * 0.6, 0x222222); }
// Lave-linge à hublot (bandeau : tiroir à lessive, programmateur, touches, afficheur ; hublot chromé à vitre sombre
// bombée, trappe de filtre, plinthe), lave-vaisselle (porte pleine à poignée, bandeau de commande) et friteuse
// professionnelle (inox, cuve d'huile, deux paniers, thermostat, porte, dosseret)
S('washer', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zf = dd / 2 - 0.03;
  if (d.id === 'fryer') {
    const yt = h / 2 - 0.12, zb = dd / 2 - 0.035, zc = (zb - dd / 2) / 2, bd = zb + dd / 2;
    rbox(k, 0, (y0 + 0.04 + yt) / 2, zc, w, yt - y0 - 0.04, bd, 0.01, INOX, { skip: 'Y' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(k, sx * (w / 2 - 0.05), y0 + 0.02, sz * (dd / 2 - 0.06), 0.02, 0.04, 0x8a9096, 'y', 8);
    box(k, 0, yt - 0.005, zc, w, 0.01, bd, 0xc7ccd0, { skip: 'y' });
    fq(k, 0, yt + 0.0004, zc + 0.03, w - 0.08, bd - 0.2, 0x3e2a14, 'Y');
    rbox(k, 0, yt + 0.06, -dd / 2 + 0.02, w, 0.12, 0.04, 0.01, INOX);
    slots(k, 0, yt + 0.06, -dd / 2 + 0.0405, 6, 0.05, 0.07, 0.07, 0x2a2a2a);
    for (const sx of [-1, 1]) { // paniers : grille, anse, poignée
      const bx = sx * 0.11; box(k, bx, yt + 0.03, zc + 0.02, 0.19, 0.06, 0.28, 0x9aa1a6, { skip: 'Y' }); sweep(k, [[bx, yt + 0.06, zc + 0.16], [bx, yt + 0.09, zc + 0.19], [bx, yt + 0.1, zc + 0.23]], 0.006, 0x9aa1a6, { segs: 4 }); cyl(k, bx, yt + 0.1, zc + 0.27, 0.012, 0.08, 0x111111, 'z', 8);
    }
    fq(k, 0, yt - 0.07, zb + 0.0005, w - 0.06, 0.1, 0x2b2d30);
    knob(k, -0.12, yt - 0.07, zb + 0.0006, 0.022, 0x111111); disc(k, 0.0, yt - 0.07, zb + 0.0008, 0.008, 0xff9100, [0, 0, 1], 8); disc(k, 0.04, yt - 0.07, zb + 0.0008, 0.008, 0x00e676, [0, 0, 1], 8);
    fq(k, 0, (y0 + 0.08 + yt - 0.14) / 2, zb + 0.0005, w - 0.06, yt - 0.14 - y0 - 0.08, shade(INOX, 1.05)); rbox(k, 0, yt - 0.2, zb + 0.022, 0.24, 0.02, 0.02, 0.008, 0xd7dbde);
    for (const sx of [-0.1, 0.1]) box(k, sx, yt - 0.2, zb + 0.008, 0.015, 0.015, 0.016, 0x9aa1a6);
    return;
  }
  rbox(k, 0, 0, -0.015, w, h, dd - 0.03, 0.018, c);
  if (d.id === 'dishwasher') {
    fq(k, 0, h / 2 - 0.05, zf + 0.0005, w - 0.04, 0.08, 0x2a2d30);
    for (let i = 0; i < 5; i++) rbox(k, -0.18 + i * 0.05, h / 2 - 0.05, zf + 0.004, 0.03, 0.02, 0.008, 0.003, 0x9aa1a6);
    fq(k, 0.18, h / 2 - 0.05, zf + 0.0008, 0.1, 0.04, 0x0f2a12);
    fq(k, 0, -0.04, zf + 0.0005, w - 0.03, h - 0.24, shade(c, 1.06)); rbox(k, 0, h / 2 - 0.13, zf + 0.018, 0.4, 0.025, 0.025, 0.01, 0xd0d4d8);
    for (const sx of [-0.18, 0.18]) box(k, sx, h / 2 - 0.13, zf + 0.007, 0.02, 0.02, 0.014, 0x9aa1a6);
    fq(k, 0, y0 + 0.05, zf + 0.0005, w - 0.03, 0.08, 0x1d1d1d);
    fq(k, -0.18, h / 2 - 0.2, zf + 0.0008, 0.12, 0.025, 0, 'Z', lab(k, 'lvv', 56, 12, { kind: 'plain', bg: shade(c, 1.06), fg: 0x546e7a, brand: 'AQUAPRO' }));
    return;
  }
  // lave-linge
  const by = h / 2 - 0.07;
  fq(k, 0, by, zf + 0.0005, w - 0.03, 0.11, shade(c, 0.97));
  rbox(k, -0.17, by, zf + 0.01, 0.18, 0.07, 0.02, 0.006, shade(c, 0.95)); fq(k, -0.17, by - 0.005, zf + 0.0202, 0.12, 0.012, 0x9e9e9e);
  knob(k, 0.06, by, zf + 0.0006, 0.03, 0xe0e0e0);
  fq(k, 0.18, by + 0.015, zf + 0.0008, 0.09, 0.028, 0x0f2a12); for (let i = 0; i < 3; i++) rbox(k, 0.15 + i * 0.03, by - 0.025, zf + 0.004, 0.02, 0.012, 0.008, 0.003, 0xbdbdbd);
  const dy = -h * 0.06, R = w * 0.3;
  lat(k, [[R * 0.78, 0, 0x1c2328], [R * 0.82, 0.002, 0x9aa1a6], [R, 0.008, CHROME], [R * 1.04, 0.02], [R * 0.98, 0.03], [R * 0.84, 0.026], [R * 0.8, 0.022, 0x30383e, 'h'], [R * 0.55, 0.012, 0x22292e], [0.001, 0.006, 0x1a2024]], CHROME, { segs: 22, m: M(0, dy, zf, PI / 2) });
  rbox(k, R * 0.95, dy, zf + 0.016, 0.03, 0.08, 0.025, 0.01, 0x9aa1a6);
  fq(k, w / 2 - 0.08, y0 + 0.06, zf + 0.0005, 0.07, 0.07, shade(c, 0.9)); fq(k, 0, y0 + 0.015, zf + 0.0005, w - 0.03, 0.02, 0x2a2a2a);
  fq(k, -0.18, by - 0.085, zf + 0.0008, 0.13, 0.025, 0, 'Z', lab(k, 'lavlinge', 56, 12, { kind: 'plain', bg: c, fg: 0x78909c, brand: 'AQUAPRO 8 KG' }));
  k.meta.drum = [0, dy, zf + 0.03, R * 0.8];
});
// Micro-ondes (porte à vitre grillagée sombre, bandeau : afficheur, clavier, bouton rotatif, ouverture ; pieds,
// ouïes) et four électrique (porte vitrée noire à poignée barre, bandeau à boutons et minuterie, cadre inox)
S('microwave', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zf = dd / 2 - (d.p?.oven ? 0.055 : 0.025);
  if (d.p?.oven) {
    rbox(k, 0, 0, (zf - dd / 2) / 2, w, h, zf + dd / 2, 0.012, INOX);
    const bh = 0.1, dh = h - bh - 0.03;
    fq(k, 0, h / 2 - bh / 2 - 0.005, zf + 0.0005, w - 0.03, bh, 0x1d1f21);
    knob(k, -w / 2 + 0.09, h / 2 - bh / 2 - 0.005, zf + 0.0006, 0.022, 0xcfd3d6); knob(k, w / 2 - 0.09, h / 2 - bh / 2 - 0.005, zf + 0.0006, 0.022, 0xcfd3d6);
    fq(k, 0, h / 2 - bh / 2 - 0.005, zf + 0.0008, 0.12, 0.035, 0x200d00); fq(k, 0, h / 2 - bh / 2 - 0.005, zf + 0.001, 0.07, 0.016, 0xff6d00);
    rbox(k, 0, y0 + 0.015 + dh / 2, zf + 0.008, w - 0.03, dh, 0.016, 0.008, c);
    fqg(k, 0, y0 + 0.02 + dh * 0.45, zf + 0.0165, w - 0.16, dh * 0.55, 0x0b0d0f, 0x262b30);
    rbox(k, 0, y0 + dh - 0.03, zf + 0.04, w - 0.12, 0.02, 0.02, 0.009, 0xd5d9dc); for (const sx of [-1, 1]) box(k, sx * (w / 2 - 0.1), y0 + dh - 0.03, zf + 0.025, 0.016, 0.016, 0.02, 0x9aa1a6);
    k.meta.door = { x: 0, y: y0 + 0.015 + dh / 2, z: zf + 0.016, w: w - 0.03, h: dh };
    return;
  }
  rbox(k, 0, 0.005, (zf - dd / 2) / 2, w, h - 0.01, zf + dd / 2, 0.014, c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(k, sx * (w / 2 - 0.05), y0 + 0.004, sz * (dd / 2 - 0.06), 0.012, 0.008, 0x222222, 'y', 8);
  const dw = w * 0.7, dx = -w / 2 + dw / 2 + 0.01;
  rbox(k, dx, 0.005, zf + 0.006, dw, h - 0.03, 0.012, 0.008, shade(c, 1.02));
  fqg(k, dx - 0.01, 0.005, zf + 0.0124, dw - 0.09, h - 0.1, 0x0c0e10, 0x2a3036);
  rbox(k, dx + dw / 2 - 0.025, 0.005, zf + 0.018, 0.02, h - 0.1, 0.012, 0.006, 0xd0d4d8);
  const px = w / 2 - (w - dw - 0.02) / 2 - 0.005;
  fq(k, px, h / 2 - 0.05, zf + 0.0005, 0.09, 0.03, 0x061a06); k.meta.display = [px, h / 2 - 0.05, zf + 0.002];
  fq(k, px, 0.0, zf + 0.0005, 0.08, 0.1, 0, 'Z', keypad(k, 'mo', 3, 4, 0x9e9e9e));
  knob(k, px, -h / 2 + 0.06, zf + 0.0006, 0.02, 0xd0d0d0);
  slots(k, w / 2 - 0.0002, 0.05, -0.05, 8, 0.012, 0.12, 0.022, shade(c, 0.6), 'X');
  k.meta.door = { x: dx, y: 0, z: zf + 0.012, w: dw, h: h - 0.03 };
});

// ═════════════════════════ RESTAURATION, BUREAU ═════════════════════════
// tasse (soucoupe, anse) posée en (x, y, z)
function cup(k, x, y, z, r = 0.028, c = 0xf5f5f0) {
  lat(k, [[0.001, 0], [r * 1.6, 0.001], [r * 1.65, 0.004], [r * 0.9, 0.006, null, 'h'], [r * 0.7, 0.007], [r, r * 1.5], [r * 0.92, r * 1.5, null, 'h'], [r * 0.6, r * 0.5]], c, { segs: 10, m: M(x, y, z) });
  sweep(k, [[x + r * 0.95, y + r * 1.25, z], [x + r * 1.45, y + r * 1.0, z], [x + r * 0.95, y + r * 0.45, z]], r * 0.12, c, { segs: 4 });
}
// Machine à expresso (corps noir, façade inox, groupe et porte-filtre, grille d'égouttoir, réservoir translucide,
// touches, buse vapeur, chauffe-tasses) ; fontaine à soda (trois becs à levier, panneaux des marques, égouttoir)
S('coffee_maker', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zf = dd / 2;
  if (d.id === 'soda_fountain') {
    const zb = zf - 0.12;
    rbox(k, 0, 0, (zb - dd / 2) / 2, w, h, zb + dd / 2, 0.02, c, { skip: 'Z' });
    fq(k, 0, h / 2 - 0.13, zb, w - 0.04, 0.22, 0x0d0d0d);
    const BR = [['Hélios', 'Cola', 'bubbles', 0xc62828], ['Limonaderie', 'Citron', 'lemon', 0xfdd835], ['Fruitéa', 'Orange', 'orange', 0xfb8c00]];
    BR.forEach(([b, nm, pi, bg], i) => {
      const x = (i - 1) * w * 0.3;
      fq(k, x, h / 2 - 0.13, zb + 0.0006, w * 0.27, 0.2, 0, 'Z', lab(k, 'sodab:' + nm, 40, 56, { kind: 'box', brand: b, name: nm, picto: pi, bg }));
      rbox(k, x, h / 2 - 0.29, zb + 0.04, 0.07, 0.07, 0.08, 0.012, 0x37474f);
      cyl(k, x, h / 2 - 0.345, zb + 0.05, 0.012, 0.04, 0xbdbdbd, 'y', 8);
      at(k, M(x, h / 2 - 0.36, zb + 0.07, -0.25), () => rbox(k, 0, 0, 0, 0.05, 0.08, 0.008, 0.003, 0x263238));
    });
    fq(k, 0, h / 2 - 0.29, zb + 0.0006, w - 0.04, 0.12, shade(c, 0.6));
    box(k, 0, y0 + 0.04, zf - 0.07, w - 0.04, 0.03, 0.14, 0x37474f); slots(k, 0, y0 + 0.056, zf - 0.07, 12, 0.006, 0.11, 0.035, 0x15181a, 'Y');
    fq(k, 0, y0 + 0.16, zb + 0.0006, w - 0.04, 0.18, 0x2b2b2b);
    k.meta.spout = [0, h / 2 - 0.36, zb + 0.05];
    return;
  }
  const zb = zf - 0.13, ht = h / 2 - 0.036;
  rbox(k, 0, (y0 + ht) / 2, (zb - dd / 2) / 2, w, ht - y0, zb + dd / 2, 0.012, c, { skip: 'Z' });
  fq(k, 0, (y0 + ht) / 2, zb + 0.0004, w - 0.02, ht - y0 - 0.02, 0xa9b0b5);
  // réservoir arrière translucide
  rbox(k, 0, (y0 + ht) / 2 + 0.01, -dd / 2 + 0.035, w - 0.06, ht - y0 - 0.08, 0.06, 0.01, 0x8fc8e8);
  // chauffe-tasses + tasses
  box(k, 0, ht - 0.004, (zb - dd / 2) / 2, w - 0.02, 0.008, zb + dd / 2 - 0.04, 0xc0c6ca);
  cup(k, -0.05, ht, -0.04, 0.022); cup(k, 0.05, ht, -0.04, 0.022);
  // groupe, porte-filtre, bouton, voyants
  const gy = h * 0.12;
  cyl(k, 0, gy, zb + 0.035, 0.04, 0.03, 0xd0d4d8, 'y', 14);
  cyl(k, 0, gy - 0.03, zb + 0.035, 0.035, 0.03, 0x9aa1a6, 'y', 14);
  at(k, M(0, gy - 0.032, zb + 0.05, 0.12), () => rbox(k, 0, 0, 0.035, 0.022, 0.02, 0.07, 0.008, 0x111111));
  for (let i = 0; i < 3; i++) disc(k, -0.06 + i * 0.06, ht - 0.05, zb + 0.0008, 0.011, [0xeceff1, 0xeceff1, 0x00e676][i], [0, 0, 1], 10);
  // buse vapeur
  sweep(k, rpath([[w / 2 - 0.03, h * 0.28, zb + 0.01], [w / 2 - 0.02, h * 0.28, zb + 0.05], [w / 2 - 0.02, h * 0.0, zb + 0.06]], 0.02, 3), 0.004, 0xd0d4d8, { segs: 5 });
  // égouttoir
  rbox(k, 0, y0 + 0.025, zb + 0.04, w - 0.03, 0.03, 0.09, 0.006, 0x26292c); slots(k, 0, y0 + 0.0405, zb + 0.04, 8, 0.004, 0.07, 0.022, 0x0c0c0c, 'Y');
  cup(k, 0, y0 + 0.04, zb + 0.04, 0.024);
  k.meta.spout = [0, gy - 0.06, zb + 0.04];
});
// Imprimante laser : corps à arêtes arrondies, bac de sortie avec feuille imprimée, tiroir à papier, pupitre (écran,
// touches), ouïes, logo
S('printer', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zf = dd / 2 - 0.012;
  rbox(k, 0, 0, -0.006, w, h, dd - 0.012, 0.018, c);
  box(k, -0.03, h / 2 - 0.022, -0.04, w * 0.7, 0.03, dd * 0.55, shade(c, 0.78), { skip: 'y' });
  at(k, M(-0.03, h / 2 - 0.035, -0.04, 0.12), () => box(k, 0, 0, 0, w * 0.5, 0.002, dd * 0.48, 0xfbfbf8));
  fq(k, -0.03, h / 2 - 0.0345, -0.06, w * 0.38, 0.06, 0x8a8a8a, 'Y');
  rbox(k, 0, y0 + 0.045, zf + 0.004, w - 0.04, 0.07, 0.01, 0.005, shade(c, 0.95)); fq(k, 0, y0 + 0.05, zf + 0.0095, 0.12, 0.012, 0x7d8388);
  fq(k, w * 0.32, h / 2 - 0.045, zf + 0.0005, 0.07, 0.03, 0x0b1a26); for (let i = 0; i < 3; i++) rbox(k, w * 0.22 + i * 0.018, h / 2 - 0.08, zf + 0.003, 0.012, 0.012, 0.006, 0.002, 0x9e9e9e);
  disc(k, w * 0.42, h / 2 - 0.08, zf + 0.0006, 0.006, 0x00e676, [0, 0, 1], 8);
  slots(k, w / 2 + 0.0004, 0, 0, 8, 0.15, 0.006, 0.018, shade(c, 0.6), 'X', true);
  fq(k, -0.12, h / 2 - 0.06, zf + 0.0005, 0.12, 0.022, 0, 'Z', lab(k, 'printlogo', 56, 12, { kind: 'plain', bg: c, fg: 0x546e7a, brand: 'LASERJET 2000' }));
});
// Ordinateur portable (fermé) : coque inférieure et capot à arêtes arrondies, jour entre les deux, logo, patins,
// connectique latérale, charnière
S('laptop', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  rbox(k, 0, y0 + 0.0055, 0, w, 0.011, dd, 0.004, shade(c, 0.85));
  rbox(k, 0, y0 + 0.0155, 0, w - 0.002, 0.008, dd - 0.002, 0.003, c);
  fq(k, 0, y0 + 0.0112, dd / 2 + 0.0004, w - 0.03, 0.0012, 0x1a1a1a);
  disc(k, 0, h / 2 + 0.0002, 0.0, 0.018, shade(c, 1.25), [0, 1, 0], 12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) fq(k, sx * (w / 2 - 0.03), y0 - 0.0003, sz * (dd / 2 - 0.03), 0.02, 0.012, 0x111111, 'y');
  for (let i = 0; i < 3; i++) fq(k, w / 2 + 0.0004, y0 + 0.005, -0.05 + i * 0.022, 0.012, 0.005, 0x111111, 'X');
  cyl(k, 0, y0 + 0.012, -dd / 2 + 0.006, 0.0055, w - 0.06, 0x2a2a2a, 'x', 8);
  k.meta.screen = { x: 0, y: h / 2, z: 0, w: w * 0.92, h: dd * 0.8, top: true };
});
// Projecteur de cinéma 35 mm : socle, mécanisme (couloir, objectif), lanterne à cheminée, bobines débitrice et
// réceptrice sur bras, moteur, armoire électrique
S('projector', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, dk = 0x26292c;
  rbox(k, 0, y0 + 0.12, -0.05, w * 0.8, 0.24, dd * 0.8, 0.03, dk);
  rbox(k, 0, y0 + 0.3, 0.1, 0.24, 0.14, 0.4, 0.02, c);
  rbox(k, 0, y0 + 0.47, 0.25, 0.26, 0.24, 0.28, 0.02, c);
  lat(k, [[0.06, 0], [0.06, 0.12], [0.07, 0.14, null, 'h'], [0.07, 0.2], [0.055, 0.21, 0x111111, 'h'], [0.001, 0.21, 0x0a0f14]], 0x2a2a2a, { segs: 14, m: M(0, y0 + 0.47, 0.39, PI / 2) });
  k.meta.lens = [0, y0 + 0.47, 0.6];
  rbox(k, 0, y0 + 0.47, -0.15, 0.3, 0.3, 0.5, 0.04, shade(c, 1.1));
  cyl(k, 0, y0 + 0.66, -0.2, 0.06, 0.1, 0x3a3e42, 'y', 12); cyl(k, 0, y0 + 0.73, -0.2, 0.075, 0.04, 0x3a3e42, 'y', 12);
  slots(k, w * 0.19 + 0.0005, y0 + 0.47, -0.15, 6, 0.4, 0.012, 0.035, 0x111111, 'X', true);
  for (const [z, yy] of [[0.25, h / 2 - 0.2], [-0.33, h / 2 - 0.2]]) {
    box(k, 0.14, (y0 + 0.35 + yy) / 2, z, 0.03, yy - y0 - 0.35, 0.03, 0x30343a);
    at(k, M(0.17, yy, z), () => { lat(k, [[0.19, -0.012], [0.195, -0.008], [0.195, 0.008], [0.19, 0.012]], 0x9aa1a6, { segs: 20, m: M(0, 0, 0, 0, 0, PI / 2) }); lat(k, [[0.16, -0.01], [0.16, 0.01]], 0x2a2a2a, { segs: 20, m: M(0, 0, 0, 0, 0, PI / 2), top: 0x2a2a2a, bot: 0x2a2a2a }); cyl(k, 0.015, 0, 0, 0.025, 0.03, 0x111111, 'x', 8); });
  }
  sweep(k, [[0.17, h / 2 - 0.2 - 0.16, 0.25], [0.12, y0 + 0.47, 0.25]], 0.004, 0x3a2a1a, { segs: 3 });
  rbox(k, -0.25, y0 + 0.3, -0.35, 0.2, 0.18, 0.24, 0.015, 0x37474f); for (let i = 0; i < 2; i++) disc(k, -0.25 + (i - 0.5) * 0.08, y0 + 0.33, -0.2295, 0.012, [0x00e676, 0xff1744][i], [0, 0, 1], 8);
});
// Machine à pop-corn sur chariot : meuble (portes), roues, vitrine à montants, marmite suspendue (couvercle,
// moteur), tas de pop-corn, pelle, fronton « POP CORN »
S('popcorn_machine', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yc = y0 + 0.78, yg = h / 2 - 0.2;
  rbox(k, 0, (y0 + 0.08 + yc) / 2, -0.0075, w, yc - y0 - 0.08, dd - 0.015, 0.02, c);
  for (const sx of [-1, 1]) { fq(k, sx * w * 0.23, (y0 + 0.08 + yc) / 2, dd / 2 - 0.0145, w * 0.42, yc - y0 - 0.2, shade(c, 0.85)); rbox(k, sx * 0.04, (y0 + yc) / 2 + 0.05, dd / 2 - 0.009, 0.015, 0.1, 0.01, 0.004, 0xffd600); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cyl(k, sx * (w / 2 - 0.07), y0 + 0.045, sz * (dd / 2 - 0.07), 0.04, 0.03, 0x111111, 'x', 10); box(k, sx * (w / 2 - 0.07), y0 + 0.075, sz * (dd / 2 - 0.07), 0.03, 0.03, 0.05, 0x8a9096); }
  box(k, 0, yc + 0.01, 0, w, 0.02, dd, 0xffd600);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox(k, sx * (w / 2 - 0.02), (yc + yg) / 2, sz * (dd / 2 - 0.02), 0.035, yg - yc, 0.035, 0.01, c);
  // tas de pop-corn
  const rnd = mulberry32(17);
  for (let i = 0; i < 26; i++) k.blob((rnd() - 0.5) * (w - 0.1), yc + 0.02 + rnd() * 0.06, (rnd() - 0.5) * (dd - 0.1), 0.05 + rnd() * 0.03, 0.03 + rnd() * 0.02, 0.05 + rnd() * 0.03, rnd() < 0.5 ? 0xfff3c4 : 0xffe082, 6, 3);
  // marmite suspendue
  const ky = yg - 0.16;
  lat(k, [[0.001, ky - 0.09], [0.1, ky - 0.085], [0.12, ky - 0.05], [0.12, ky + 0.03], [0.13, ky + 0.035, 0xdfe3e6, 'h'], [0.0, ky + 0.05]], 0xb9bfc4, { segs: 16 });
  cyl(k, 0, ky + 0.09, 0, 0.012, 0.08, 0x9aa1a6, 'y', 6); box(k, 0, yg - 0.02, 0, 0.12, 0.04, 0.08, 0x37474f);
  sweep(k, [[-0.12, ky + 0.01, 0], [-0.22, ky + 0.0, 0]], 0.008, 0x111111, { segs: 5 });
  at(k, M(0.15, yc + 0.07, 0.12, 0, 0.6, 0.15), () => { box(k, 0, 0, 0, 0.1, 0.004, 0.08, 0xc0c6ca); box(k, 0.08, 0.006, 0, 0.08, 0.008, 0.012, 0xc0c6ca); });
  // fronton
  rbox(k, 0, (yg + h / 2) / 2, 0, w, h / 2 - yg, dd, 0.02, c);
  fq(k, 0, (yg + h / 2) / 2, dd / 2 + 0.0006, w - 0.06, 0.15, 0, 'Z', lab(k, 'popcorn', 128, 32, { kind: 'sign', name: 'POP CORN', sub: 'TOUT CHAUD', bg: 0xd50000, fg: 0xffd600, accent: 0xffffff }));
  k.meta.glass = true;
});
// Distributeur de boules de chewing-gum : pied fonte, mécanisme (bouton tournant, goulotte et trappe), globe de
// boules colorées sous un chapeau, cerclages
S('gumball', (k, s, c) => {
  const w = s[0], h = s[1], y0 = -h / 2, R = w / 2 - 0.005, yg = h / 2 - R - 0.03;
  lat(k, [[0.11, y0], [0.115, y0 + 0.012], [0.09, y0 + 0.03], [0.035, y0 + 0.08], [0.03, y0 + 0.32], [0.05, y0 + 0.35], [0.001, y0 + 0.36]], c, { segs: 14, bot: c });
  const yb = y0 + 0.36;
  lat(k, [[0.06, yb], [0.085, yb + 0.02], [0.09, yb + 0.11], [0.1, yb + 0.12, CHROME, 'h'], [0.1, yb + 0.13], [0.001, yb + 0.13]], c, { segs: 14 });
  cyl(k, 0, yb + 0.06, 0.088, 0.03, 0.02, CHROME, 'z', 12); rbox(k, 0, yb + 0.06, 0.105, 0.05, 0.01, 0.01, 0.004, CHROME);
  rbox(k, 0, yb + 0.02, 0.085, 0.04, 0.025, 0.02, 0.006, 0x8a9096);
  const rnd = mulberry32(9), GC = [0xff1744, 0x00e5ff, 0xffea00, 0x76ff03, 0xff9100, 0xffffff, 0xd500f9];
  { // cœur sombre moucheté (boules du fond, dans l'ombre), puis boules contre la paroi en demi-sphères tournées vers
    // l'extérieur (répartition de Fibonacci, rayons et profondeurs un peu irréguliers)
    const o = k.b.vertexCount, nr = 8, ns = 12, rc = R * 0.8;
    for (let i = 0; i <= nr; i++) for (let j = 0; j <= ns; j++) { const t = PI * i / nr, a = TAU * j / ns, n = [Math.sin(t) * Math.cos(a), -Math.cos(t), Math.sin(t) * Math.sin(a)]; pv(k, n[0] * rc, yg + n[1] * rc, n[2] * rc, ...n, L(shade(GC[(i * 7 + j * 3) % GC.length], 0.3))); }
    for (let i = 0; i < nr; i++) for (let j = 0; j < ns; j++) { const a = o + i * (ns + 1) + j; k.b.idx.push(a, a + ns + 1, a + ns + 2, a, a + ns + 2, a + 1); }
    const nb = 170, Yv = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < nb; i++) {
      const u = 1 - 2 * (i + 0.5) / nb; if (u < -0.8 || u > 0.92) continue;
      const a = i * 2.39996, qq = Math.sqrt(1 - u * u), rb = 0.0155 + rnd() * 0.003, rr = R * 0.83 + (rnd() - 0.5) * 0.004; n.set(Math.cos(a) * qq, u, Math.sin(a) * qq);
      at(k, new THREE.Matrix4().compose(new THREE.Vector3(n.x * rr, yg + n.y * rr, n.z * rr), q.setFromUnitVectors(Yv, n), one), () => lat(k, [[rb, 0], [rb * 0.71, rb * 0.71], [0.0005, rb]], GC[(i * 5) % GC.length], { segs: 7 }));
    }
  }
  lat(k, [[R * 0.6, yg - R * 0.8], [R * 0.62, yg - R * 0.78, 0xdfe7ea]], 0xdfe7ea, { segs: 16 });
  lat(k, [[R * 0.55, yg + R * 0.83], [R * 0.6, yg + R * 0.85], [R * 0.62, yg + R * 0.9], [R * 0.3, yg + R * 1.02], [0.001, h / 2 - 0.012]], c, { segs: 14 });
  lat(k, sphereP(0.012, h / 2 - 0.012), CHROME, { segs: 8 });
});
// Barbe à papa (sur bâtonnet) : nuage rose irrégulier de plusieurs lobes, cône de carton
S('cotton_candy', (k, s, c) => {
  const w = s[0], h = s[1], y0 = -h / 2, rnd = mulberry32(5);
  lat(k, [[0.004, y0], [0.005, y0 + 0.12], [0.012, y0 + 0.16]], 0xffffff, { segs: 6 });
  for (let i = 0; i < 6; i++) { const a = i * 1.1, r = w * 0.2; k.blob(Math.cos(a) * r * rnd(), h * 0.15 + (rnd() - 0.5) * h * 0.2, Math.sin(a) * r * rnd(), w * (0.26 + rnd() * 0.1), h * (0.18 + rnd() * 0.06), w * (0.26 + rnd() * 0.1), i % 2 ? c : shade(c, 1.06), 7, 4); }
});
// Machine à barbe à papa : chariot rayé, bac inox et tête de centrifugeuse, réserve de bâtonnets, enseigne
S('cotton', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yt = y0 + 0.78;
  rbox(k, 0, (y0 + yt) / 2, 0, w, yt - y0, dd, 0.02, 0xfafafa);
  for (let i = 0; i < 5; i++) fq(k, -w / 2 + 0.06 + i * (w - 0.12) / 4, (y0 + yt) / 2 + 0.02, dd / 2 + 0.0005, 0.06, yt - y0 - 0.16, c);
  box(k, 0, y0 + 0.03, 0, w - 0.02, 0.06, dd - 0.02, 0x37474f);
  box(k, 0, yt + 0.01, 0, w, 0.02, dd, shade(c, 0.85));
  lat(k, [[0.06, yt + 0.02], [0.24, yt + 0.03], [0.27, yt + 0.12], [0.275, yt + 0.15, 0xe0e4e7, 'h'], [0.26, yt + 0.145], [0.235, yt + 0.06, 0x9aa1a6], [0.001, yt + 0.055]], 0xb9bfc4, { segs: 22 });
  lat(k, [[0.06, yt + 0.055], [0.06, yt + 0.09], [0.075, yt + 0.1, 0xd0d4d8, 'h'], [0.001, yt + 0.105]], 0x8a9096, { segs: 12 });
  const rnd = mulberry32(21); for (let i = 0; i < 8; i++) { const a = rnd() * TAU, r = 0.16 + rnd() * 0.06; k.blob(Math.cos(a) * r, yt + 0.09 + rnd() * 0.03, Math.sin(a) * r, 0.05, 0.03, 0.05, shade(c, 1.12), 6, 3); }
  cyl(k, w / 2 - 0.08, yt + 0.09, -dd / 2 + 0.08, 0.04, 0.12, 0xeceff1, 'y', 10, { open: true });
  for (let i = 0; i < 6; i++) cyl(k, w / 2 - 0.08 + Math.cos(i) * 0.02, yt + 0.12, -dd / 2 + 0.08 + Math.sin(i) * 0.02, 0.003, 0.2, 0xf5f0e0, 'y', 4);
  fq(k, 0, yt - 0.07, dd / 2 + 0.0007, w - 0.08, 0.1, 0, 'Z', lab(k, 'bapapa', 112, 26, { kind: 'sign', name: 'BARBE À PAPA', bg: c, fg: 0xffffff, accent: 0xffffff }));
});
// Fontaine de l'atrium : bassin circulaire (margelle arrondie, faïence, eau), colonne à deux vasques, becs
S('fountainbig', (k, s, c) => {
  const R = s[0] / 2, h = s[1], y0 = -h / 2, yw = y0 + 0.36, tile = 0x2f6f7c;
  lat(k, [[R - 0.04, y0], [R, y0 + 0.03], [R, y0 + 0.4], [R - 0.02, y0 + 0.46, shade(c, 1.08)], [R - 0.12, y0 + 0.48], [R - 0.22, y0 + 0.46], [R - 0.24, y0 + 0.42, tile, 'h'], [R - 0.24, yw]], c, { segs: 48 });
  lat(k, [[R - 0.24, yw], [0.3, yw, 0x1f4a52]], 0x2a5c66, { segs: 48 });
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; fq(k, Math.cos(a) * (R - 0.0005), y0 + 0.2, Math.sin(a) * (R - 0.0005), 0.004, 0.36, shade(c, 0.85)); }
  // colonne, vasques, becs
  lat(k, [[0.44, yw - 0.02], [0.46, yw + 0.05], [0.3, yw + 0.1], [0.2, yw + 0.17], [0.2, yw + 0.2], [0.84, yw + 0.25], [0.9, yw + 0.29, shade(c, 1.1)], [0.84, yw + 0.3, shade(c, 1.1), 'h'], [0.16, yw + 0.3, 0x2a5c66]], c, { segs: 36 }); // vasque basse (eau)
  lat(k, [[0.16, yw + 0.3], [0.12, yw + 0.4], [0.08, yw + 0.45], [0.32, yw + 0.5], [0.35, yw + 0.53, shade(c, 1.1)], [0.31, yw + 0.54, shade(c, 1.1), 'h'], [0.04, yw + 0.54, 0x2a5c66, 'h'], [0.03, h / 2 - 0.02, c, 'h'], [0.001, h / 2 - 0.01]], c, { segs: 24 }); // vasque haute, bec
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; sweep(k, [[Math.cos(a) * 0.84, yw + 0.28, Math.sin(a) * 0.84], [Math.cos(a) * 0.97, yw + 0.26, Math.sin(a) * 0.97]], 0.014, 0xb08d57, { segs: 6 }); }
  k.meta.water = [0, h / 2 - 0.02, 0];
});

// ═════════════════════════ MANÈGES ═════════════════════════
// socle de manège : plateau antidérapant, monnayeur éclairé
function rideBase(k, s, col) {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  rbox(k, 0, y0 + 0.11, 0, w, 0.22, dd, 0.05, col);
  fq(k, 0, y0 + 0.2205, 0, w - 0.12, dd - 0.12, shade(col, 0.6), 'Y');
  for (let i = 0; i < 6; i++) fq(k, -w / 2 + 0.11 + i * (w - 0.22) / 5, y0 + 0.2208, 0, 0.012, dd - 0.16, shade(col, 0.45), 'Y');
  rbox(k, w / 2 - 0.1, y0 + 0.31, dd / 2 - 0.08, 0.14, 0.18, 0.1, 0.02, 0x37474f);
  rbox(k, w / 2 - 0.1, y0 + 0.34, dd / 2 - 0.028, 0.04, 0.05, 0.006, 0.003, 0xff5a1f); fq(k, w / 2 - 0.1, y0 + 0.34, dd / 2 - 0.0248, 0.004, 0.03, 0x1a0500);
  fq(k, w / 2 - 0.1, y0 + 0.28, dd / 2 - 0.0296, 0.1, 0.03, 0, 'Z', lab(k, 'ride1', 48, 14, { kind: 'sign', name: '1 PIÈCE', bg: 0x37474f, fg: 0xffffff, accent: 0xffd600 }));
}
// ourson Bobby (assis, conduisant) : hauteur ≈ 0,6 sc
function bobby(k, x, y, z, sc, c) {
  at(k, M(x, y, z), () => {
    k.blob(0, sc * 0.3, 0, sc * 0.3, sc * 0.32, sc * 0.26, c, 8, 5);
    k.blob(0, sc * 0.3, sc * 0.2, sc * 0.18, sc * 0.2, sc * 0.08, shade(c, 1.3), 6, 4);
    k.blob(0, sc * 0.78, 0, sc * 0.24, sc * 0.22, sc * 0.22, c, 8, 5);
    k.blob(0, sc * 0.72, sc * 0.19, sc * 0.1, sc * 0.08, sc * 0.07, shade(c, 1.35), 6, 3);
    disc(k, 0, sc * 0.75, sc * 0.262, sc * 0.03, 0x111111, [0, 0.3, 1], 8);
    for (const sx of [-1, 1]) {
      k.blob(sx * sc * 0.17, sc * 0.98, 0, sc * 0.09, sc * 0.09, sc * 0.05, c, 6, 3);
      disc(k, sx * sc * 0.085, sc * 0.84, sc * 0.205, sc * 0.03, 0x111111, [sx * 0.2, 0.1, 1], 8);
      sweep(k, [[sx * sc * 0.26, sc * 0.45, 0], [sx * sc * 0.22, sc * 0.4, sc * 0.22], [sx * sc * 0.13, sc * 0.42, sc * 0.36]], sc * 0.07, c, { segs: 6, caps: true });
      sweep(k, [[sx * sc * 0.14, sc * 0.08, sc * 0.1], [sx * sc * 0.15, sc * 0.1, sc * 0.38]], sc * 0.08, c, { segs: 6, caps: true });
    }
    for (const sx of [-1, 1]) at(k, M(sx * sc * 0.05, sc * 0.56, sc * 0.2, 0, 0, sx * 0.8), () => k.blob(0, 0, 0, sc * 0.05, sc * 0.03, sc * 0.02, 0xd50000, 5, 3));
  });
}
// Manèges à pièce : « Bobby-Mobile » (voiturette conduite par l'ourson), voiture de police (rampe bleu-rouge,
// marquages), cheval de bois (selle, crinière, rênes)
S('kiddie', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yb = y0 + 0.22;
  if (d.id === 'mall_kiddie_horse') {
    rideBase(k, s, 0x5d4037);
    const by = yb + 0.42, body = c, mane = 0x3e2723;
    cyl(k, 0, yb + 0.22, 0, 0.03, 0.44, CHROME, 'y', 8);
    k.blob(0, by, 0, 0.17, 0.17, 0.36, body, 10, 6);
    sweep(k, [[0, by + 0.05, 0.28], [0, by + 0.25, 0.4], [0, by + 0.34, 0.44]], (t) => 0.1 - t * 0.03, body, { segs: 8 });
    k.blob(0, by + 0.36, 0.5, 0.075, 0.08, 0.15, body, 8, 4);
    for (const sx of [-1, 1]) { k.blob(sx * 0.045, by + 0.46, 0.43, 0.022, 0.05, 0.02, body, 5, 3); disc(k, sx * 0.07, by + 0.39, 0.53, 0.014, 0x111111, [sx, 0.2, 0.3], 8); }
    for (let i = 0; i < 7; i++) k.blob(0, by + 0.12 + i * 0.045, 0.27 + i * 0.03, 0.03, 0.05, 0.04, mane, 5, 3);
    sweep(k, [[0, by + 0.06, -0.34], [0, by - 0.05, -0.45], [0, by - 0.22, -0.48]], (t) => 0.05 - t * 0.03, mane, { segs: 6, caps: true });
    for (const [x, z, f] of [[0.09, 0.22, 1], [-0.09, 0.22, -1], [0.09, -0.22, -1], [-0.09, -0.22, 1]]) sweep(k, [[x, by - 0.06, z], [x, by - 0.24, z + f * 0.1], [x, yb + 0.06, z + f * 0.04]], 0.035, body, { segs: 6, caps: true });
    rbox(k, 0, by + 0.16, -0.02, 0.26, 0.05, 0.3, 0.02, 0xc62828); for (const sx of [-1, 1]) { sweep(k, [[sx * 0.14, by + 0.15, -0.02], [sx * 0.17, by - 0.08, -0.02]], 0.005, 0x3e2723, { segs: 4 }); disc(k, sx * 0.17, by - 0.1, -0.02, 0.03, 0xc9a74a, [1, 0, 0], 8, 0.018); }
    sweep(k, [[-0.07, by + 0.36, 0.56], [-0.12, by + 0.25, 0.3], [0, by + 0.27, 0.15], [0.12, by + 0.25, 0.3], [0.07, by + 0.36, 0.56]], 0.006, 0x8b0000, { segs: 4 });
    return;
  }
  const police = d.id === 'mall_kiddie_car', body = police ? 0xf5f5f5 : c, acc = police ? c : 0xd84315;
  rideBase(k, s, police ? 0x263238 : 0x1a237e);
  // caisse de la voiturette (lobes arrondis), ailes, roues, phares, volant, siège
  rbox(k, 0, yb + 0.2, 0, w - 0.12, 0.3, dd - 0.2, 0.12, body);
  rbox(k, 0, yb + 0.38, -0.05, w - 0.22, 0.08, dd - 0.5, 0.04, shade(body, 0.9));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.blob(sx * (w / 2 - 0.1), yb + 0.24, sz * (dd / 2 - 0.25), 0.06, 0.1, 0.15, acc, 8, 4); cyl(k, sx * (w / 2 - 0.08), yb + 0.11, sz * (dd / 2 - 0.25), 0.09, 0.07, 0x161616, 'x', 12); disc(k, sx * (w / 2 - 0.044), yb + 0.11, sz * (dd / 2 - 0.25), 0.045, 0xd0d4d8, [sx, 0, 0], 10); }
  for (const sx of [-1, 1]) { disc(k, sx * 0.17, yb + 0.26, dd / 2 - 0.1 + 0.002, 0.055, 0xfff9c4, [0, 0.1, 1], 12); disc(k, sx * 0.17, yb + 0.26, dd / 2 - 0.1 + 0.001, 0.068, CHROME, [0, 0.1, 1], 12, 0.054); }
  rbox(k, 0, yb + 0.12, dd / 2 - 0.08, w - 0.16, 0.06, 0.06, 0.02, CHROME);
  if (police) {
    for (const sx of [-1, 1]) fq(k, sx * (w / 2 - 0.059), yb + 0.22, 0, 0.5, 0.12, 0, sx > 0 ? 'X' : 'x', lab(k, 'kpolice', 96, 24, { kind: 'sign', name: 'POLICE', bg: 0x1565c0, fg: 0xffffff, accent: 0xffffff }));
    for (const sx of [-1, 1]) sweep(k, [[sx * 0.3, yb + 0.4, -0.28], [sx * 0.3, yb + 0.72, -0.24]], 0.015, 0x212121, { segs: 6 });
    rbox(k, 0, yb + 0.74, -0.24, 0.64, 0.05, 0.12, 0.02, 0x212121);
    for (const sx of [-1, 1]) rbox(k, sx * 0.16, yb + 0.79, -0.24, 0.24, 0.06, 0.1, 0.025, sx > 0 ? 0xd50000 : 0x2962ff);
    rbox(k, 0, yb + 0.48, 0.12, 0.3, 0.12, 0.05, 0.02, 0x1d2a33);
  } else bobby(k, 0, yb + 0.33, 0.06, 0.55, 0xc8873a);
  const cw = new THREE.Vector3(0, yb + 0.58, police ? 0.08 : 0.38), cdir = new THREE.Vector3(0, 0.55, -0.83).normalize(), U = new THREE.Vector3(1, 0, 0), V = new THREE.Vector3().crossVectors(cdir, U);
  { const ring = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ring.push(cw.clone().addScaledVector(U, Math.cos(a) * 0.1).addScaledVector(V, Math.sin(a) * 0.1).toArray()); } sweep(k, ring, 0.012, 0xd50000, { closed: true, segs: 6 }); }
  sweep(k, [cw.toArray(), cw.clone().addScaledVector(cdir, -0.2).toArray()], 0.012, 0x212121, { segs: 6 });
  rbox(k, 0, yb + 0.42, -0.32, w - 0.3, 0.06, 0.28, 0.03, police ? 0x263238 : 0x1a237e);
  at(k, M(0, yb + 0.58, -0.48, -0.15), () => rbox(k, 0, 0, 0, w - 0.3, 0.3, 0.06, 0.03, police ? 0x263238 : 0x1a237e));
});

// ═════════════════════════ MOBILIER, SANITAIRES ═════════════════════════
// anneau elliptique (section horizontale) : n points, demi-axes a (x) et b (z)
const ell = (a, b, n = 12, cx = 0, cz = 0) => Array.from({ length: n }, (_, i) => { const t = i / n * TAU; return [cx + Math.cos(t) * a, cz + Math.sin(t) * b]; });
// surface verticale lissée par sections horizontales [{y, pts:[[x, z]…]}] (loft tourné : axe y)
function vloft(k, rings, c, o = {}) { at(k, M(0, 0, 0, -PI / 2, 0, 0), () => loft(k, rings.map((r) => ({ z: r.y, pts: r.pts.map(([x, z]) => [x, -z]) })), c, o)); }
// Mannequin de vitrine : tête ovoïde sans visage, cou, buste lissé (épaules, poitrine, taille, hanches), bras
// légèrement fléchis, mains, jambes galbées, pieds, tige de maintien et socle en verre
S('mannequin', (k, s, c) => {
  const h = s[1], y0 = -h / 2, Y = (v) => y0 + v * h / 1.85;
  rbox(k, 0, y0 + 0.008, 0, 0.42, 0.016, 0.28, 0.006, 0x9fb8bf);
  cyl(k, 0.09, (Y(0.016) + Y(0.3)) / 2, -0.03, 0.007, Y(0.3) - Y(0.016), CHROME, 'y', 6);
  vloft(k, [
    { y: Y(0.8), pts: ell(0.07, 0.07, 12) }, { y: Y(0.86), pts: ell(0.16, 0.1, 12) }, { y: Y(0.95), pts: ell(0.17, 0.11, 12) }, { y: Y(1.05), pts: ell(0.13, 0.085, 12) },
    { y: Y(1.18), pts: ell(0.15, 0.1, 12, 0, 0.008) }, { y: Y(1.28), pts: ell(0.165, 0.105, 12, 0, 0.012) }, { y: Y(1.38), pts: ell(0.18, 0.09, 12) }, { y: Y(1.43), pts: ell(0.14, 0.075, 12) },
    { y: Y(1.48), pts: ell(0.055, 0.05, 12) }, { y: Y(1.57), pts: ell(0.048, 0.048, 12) },
  ], c, { c1: c });
  k.blob(0, Y(1.69), 0.005, 0.085, 0.118, 0.1, c, 10, 6);
  for (const sx of [-1, 1]) {
    sweep(k, [[sx * 0.085, Y(0.86), 0], [sx * 0.09, Y(0.62), 0.008], [sx * 0.085, Y(0.47), 0.02], [sx * 0.085, Y(0.3), -0.005], [sx * 0.09, Y(0.1), -0.01]], (t) => 0.072 - 0.04 * t + (t > 0.4 && t < 0.62 ? 0.008 : 0), c, { segs: 9 });
    k.blob(sx * 0.09, Y(0.045), 0.03, 0.042, 0.035, 0.1, c, 7, 4);
    sweep(k, [[sx * 0.175, Y(1.4), 0], [sx * 0.2, Y(1.2), -0.01], [sx * 0.21, Y(1.07), 0.01], [sx * 0.205, Y(0.9), 0.05]], (t) => 0.04 - 0.015 * t, c, { segs: 8 });
    k.blob(sx * 0.205, Y(0.84), 0.06, 0.02, 0.06, 0.033, c, 6, 4);
  }
});
// Banc de galerie : lattes de bois vernis à chants arrondis, trois piétements en fonte d'alu, vis, patins
S('bench', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, ys = h / 2 - 0.035, n = 5, sl = (dd - 0.02) / n;
  for (let i = 0; i < n; i++) rbox(k, 0, ys, -dd / 2 + 0.01 + sl * (i + 0.5), w, 0.035, sl - 0.012, 0.01, i % 2 ? c : shade(c, 0.94));
  const leg = [[-0.2, y0], [-0.17, y0], [-0.12, ys - 0.06], [0.12, ys - 0.06], [0.17, y0], [0.2, y0], [0.16, ys - 0.018], [-0.16, ys - 0.018]];
  for (const x of [-w / 2 + 0.18, 0, w / 2 - 0.18]) {
    extX(k, leg.map(([z, y]) => [z * dd / 0.45, y]), x - 0.02, x + 0.02, 0x37474f, { r: 0.004 });
    for (let i = 0; i < n; i++) disc(k, x, ys + 0.0178, -dd / 2 + 0.01 + sl * (i + 0.5), 0.006, 0x2a2a2a, [0, 1, 0], 6);
    for (const sz of [-1, 1]) box(k, x, y0 + 0.004, sz * 0.185 * dd / 0.45, 0.05, 0.008, 0.04, 0x111111);
  }
});
// Famille « casier » : distributeur de jetons, tour PC, armoire à extincteur (vitre, extincteur visible), casier
S('locker', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zf = dd / 2;
  if (d.id === 'pc_tower') {
    rbox(k, 0, 0.005, 0, w, h - 0.01, dd, 0.008, c);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(k, sx * (w / 2 - 0.025), y0 + 0.004, sz * (dd / 2 - 0.04), 0.03, 0.008, 0.04, 0x111111);
    fq(k, 0, h / 2 - 0.035, zf + 0.0005, w - 0.03, 0.04, 0x111214); fq(k, 0, h / 2 - 0.035, zf + 0.0008, w - 0.05, 0.004, 0x050505);
    fq(k, 0, h * 0.3, zf + 0.0005, w * 0.72, h * 0.25, 0x0a0b0c); // afficheur de façade (écran de l'appareil)
    disc(k, 0, 0.035, zf + 0.0008, 0.016, 0x2b2d30, [0, 0, 1], 12); disc(k, 0, 0.035, zf + 0.0007, 0.02, 0x40c4ff, [0, 0, 1], 12, 0.016);
    for (let i = 0; i < 2; i++) fq(k, -0.025 + i * 0.05, -0.01, zf + 0.0006, 0.016, 0.006, 0x050505);
    slots(k, 0, -0.13, zf + 0.0005, 7, w - 0.05, 0.006, 0.022, shade(c, 0.6), 'Z', true);
    slots(k, w / 2 + 0.0005, 0.02, -0.03, 10, 0.2, 0.006, 0.02, 0x0c0c0c, 'X', true);
    fq(k, 0, y0 + 0.03, zf + 0.0006, 0.08, 0.012, 0, 'Z', lab(k, 'pclogo', 40, 8, { kind: 'plain', bg: c, fg: 0x8a8d90, brand: 'ORION PC' }));
    return;
  }
  if (d.id === 'extinguisher_box') {
    const zb = zf - 0.025;
    rbox(k, 0, 0, (zb - dd / 2) / 2, w, h, zb + dd / 2, 0.012, c, { skip: 'Z' });
    fq(k, 0, 0, -dd / 2 + 0.012, w - 0.03, h - 0.03, 0xe8e8e8);
    for (const [x, z, f, ww] of [[w / 2 - 0.012, (zb - dd / 2) / 2, 'x', zb + dd / 2 - 0.02], [-w / 2 + 0.012, (zb - dd / 2) / 2, 'X', zb + dd / 2 - 0.02]]) fq(k, x, 0, z, ww, h - 0.03, shade(c, 0.7), f);
    lat(k, [[0.001, -0.25], [0.07, -0.248], [0.075, -0.24], [0.075, 0.12], [0.06, 0.16], [0.025, 0.18], [0.02, 0.2, 0x222222, 'h'], [0.02, 0.21], [0.001, 0.215]], 0xd50000, { segs: 12, m: M(0, -0.04, -0.01) });
    rbox(k, 0.02, 0.19, -0.01, 0.08, 0.015, 0.03, 0.005, 0x2a2a2a);
    sweep(k, [[0.03, 0.17, 0.0], [0.09, 0.12, 0.04], [0.085, -0.12, 0.05], [0.07, -0.18, 0.04]], 0.01, 0x111111, { segs: 6 });
    fq(k, -0.02, 0.0, 0.066, 0.1, 0.08, 0, 'Z', lab(k, 'extlab', 32, 28, { kind: 'card', bg: 0xd50000, picto: 'flame', name: 'EAU', pc: 0xffffff }));
    const fw = 0.04, wy = 0.03;
    for (const [x, y, ww, hh] of [[0, h / 2 - fw / 2 - 0.01, w - 0.02, fw], [0, wy - 0.24, w - 0.02, 0.06], [-w / 2 + fw / 2 + 0.01, (h / 2 - 0.01 + wy - 0.21) / 2, fw, h / 2 - wy + 0.2], [w / 2 - fw / 2 - 0.01, (h / 2 - 0.01 + wy - 0.21) / 2, fw, h / 2 - wy + 0.2]]) rbox(k, x, y, zb + 0.008, ww, hh, 0.016, 0.004, c);
    rbox(k, 0, y0 + 0.07, zb + 0.008, w - 0.02, 0.12, 0.016, 0.004, c);
    fq(k, 0, y0 + 0.07, zb + 0.0165, w - 0.06, 0.07, 0, 'Z', lab(k, 'extin', 64, 18, { kind: 'sign', name: 'EXTINCTEUR', bg: 0xd50000, fg: 0xffffff, accent: 0xffffff }));
    rbox(k, w / 2 - 0.05, wy - 0.24, zb + 0.02, 0.025, 0.04, 0.012, 0.004, 0xbdbdbd);
    return;
  }
  if (d.id === 'token_machine') {
    rbox(k, 0, 0, -0.0125, w, h, dd - 0.025, 0.02, c);
    const zb = dd / 2 - 0.025;
    box(k, 0, h / 2 - 0.12, zb - 0.004, w - 0.04, 0.2, 0.008, 0xffd600, { F: { Z: lab(k, 'jetons', 80, 36, { kind: 'sign', name: 'JETONS', sub: '2 € = 5 JETONS', bg: 0xffd600, fg: 0x0d47a1, accent: 0x0d47a1 }) } });
    fq(k, 0, h / 2 - 0.32, zb + 0.0005, 0.22, 0.07, 0x0b1a10); fq(k, 0, h / 2 - 0.32, zb + 0.0008, 0.16, 0.03, 0x76ff03);
    rbox(k, -0.08, 0.1, zb + 0.006, 0.12, 0.16, 0.012, 0.005, CHROME); fq(k, -0.08, 0.14, zb + 0.0122, 0.005, 0.045, 0x111111);
    fq(k, -0.08, 0.05, zb + 0.0122, 0.08, 0.03, 0, 'Z', lab(k, 'v2e', 40, 14, { kind: 'sign', name: '2 €', bg: 0x37474f, fg: 0xffffff, accent: 0x37474f }));
    rbox(k, 0.1, 0.1, zb + 0.012, 0.1, 0.12, 0.024, 0.006, 0x1d1d1d); fq(k, 0.1, 0.13, zb + 0.0242, 0.07, 0.005, 0x050505); fq(k, 0.1, 0.07, zb + 0.0242, 0.05, 0.005, 0x00e676);
    box(k, 0, -0.3, zb - 0.03, 0.18, 0.12, 0.06, 0x0a0a0a, { skip: 'Z' }); rbox(k, 0, -0.3, zb + 0.004, 0.22, 0.16, 0.008, 0.004, CHROME, { skip: 'z' }); fq(k, 0, -0.3, zb + 0.0082, 0.18, 0.12, 0x0b0b0b);
    for (const sx of [-1, 1]) box(k, sx * (w / 2 - 0.007), 0, -0.0125, 0.012, h - 0.04, dd - 0.06, CHROME);
    return;
  }
  rbox(k, 0, 0, -0.015, w, h, dd - 0.03, 0.01, c);
  slots(k, 0, h * 0.38, zf - 0.0295, 5, w * 0.6, 0.008, 0.025, 0x263238, 'Z', true);
  rbox(k, w * 0.35, 0, zf - 0.02, 0.02, 0.1, 0.02, 0.006, 0x9e9e9e);
  k.meta.door = { x: 0, y: 0, z: zf - 0.03, w: w * 0.95, h: h * 0.95 };
});
// Lavabo sur colonne : vasque en céramique (cuvette, trop-plein, bonde), colonne galbée, mitigeur chromé
S('sink', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yb = h / 2 - 0.3, rx = w / 2 - 0.01, rz = dd / 2 - 0.01;
  at(k, M(0, 0, 0.0), () => lat(k, [[0.0, yb], [0.6, yb + 0.02], [0.92, yb + 0.08], [1.0, yb + 0.16], [0.99, yb + 0.18], [0.94, yb + 0.185, null, 'h'], [0.86, yb + 0.17], [0.6, yb + 0.1], [0.12, yb + 0.06, 0xb7bec2, 'h'], [0.0005, yb + 0.06]].map(([r, y, col, hh]) => [r * rx, y, col, hh]), c, { segs: 20, rz: rz / rx }));
  lat(k, [[0.11, y0], [0.12, y0 + 0.02], [0.08, y0 + 0.15], [0.07, yb - 0.1], [0.1, yb + 0.02]], c, { segs: 14, rz: 0.85, m: M(0, 0, -0.04) });
  disc(k, 0, yb + 0.0605, 0, 0.022, 0x9aa1a6, [0, 1, 0], 10);
  // mitigeur
  const tz = -rz + 0.06;
  lat(k, [[0.026, 0], [0.024, 0.012], [0.02, 0.07], [0.022, 0.08], [0.001, 0.085]], CHROME, { segs: 12, m: M(0, yb + 0.165, tz) });
  sweep(k, rpath([[0, yb + 0.22, tz + 0.01], [0, yb + 0.245, tz + 0.05], [0, yb + 0.215, tz + 0.14]], 0.04, 4), 0.012, CHROME, { segs: 8 });
  at(k, M(0, yb + 0.258, tz - 0.005, 0.5), () => rbox(k, 0, 0, -0.025, 0.016, 0.012, 0.06, 0.005, CHROME));
  k.meta.tap = [0, yb + 0.21, tz + 0.14];
});
// WC : cuvette en céramique (pied, bord), abattant et couvercle, réservoir à arêtes arrondies, double chasse
S('toilet', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yb = y0 + 0.4, zc = 0.045;
  vloft(k, [{ y: y0, pts: ell(0.12, 0.18, 14, 0, zc - 0.02) }, { y: y0 + 0.18, pts: ell(0.1, 0.16, 14, 0, zc) }, { y: yb - 0.08, pts: ell(0.16, 0.22, 14, 0, zc + 0.01) }, { y: yb, pts: ell(0.18, 0.24, 14, 0, zc + 0.01) }], c, {});
  poly(k, ell(0.18, 0.24, 14, 0, zc + 0.01), [ell(0.12, 0.16, 14, 0, zc + 0.025)], ([x, z]) => [x, yb, z], [0, 1, 0], c);
  vloft(k, [{ y: yb, pts: ell(0.12, 0.16, 14, 0, zc + 0.025) }, { y: yb - 0.17, pts: ell(0.05, 0.06, 14, 0, zc + 0.03) }], c, { c1: 0x7d97a0, flip: true });
  vloft(k, [{ y: yb + 0.002, pts: ell(0.18, 0.24, 14, 0, zc + 0.01) }, { y: yb + 0.02, pts: ell(0.18, 0.24, 14, 0, zc + 0.01) }], 0xf7f7f7, {});
  poly(k, ell(0.18, 0.24, 14, 0, zc + 0.01), [ell(0.11, 0.15, 14, 0, zc + 0.025)], ([x, z]) => [x, yb + 0.02, z], [0, 1, 0], 0xf7f7f7);
  at(k, M(0, yb + 0.03, zc - 0.21, -1.35), () => vloft(k, [{ y: 0, pts: ell(0.17, 0.215, 14, 0, -0.205) }, { y: 0.02, pts: ell(0.165, 0.21, 14, 0, -0.205) }], 0xf7f7f7, { c1: 0xf7f7f7, c0: 0xf7f7f7 }));
  rbox(k, 0, yb + 0.18, -dd / 2 + 0.085, w - 0.02, 0.36, 0.17, 0.03, c);
  rbox(k, 0, h / 2 - 0.01, -dd / 2 + 0.085, w - 0.04, 0.02, 0.16, 0.01, shade(c, 0.98));
  for (const sx of [-0.03, 0.03]) rbox(k, sx, h / 2 + 0.0005 - 0.0035, -dd / 2 + 0.085, 0.05, 0.007, 0.07, 0.003, 0xcfd3d6);
});
// Miroir mural : cadre à profil arrondi, glace à reflet dégradé, pattes de fixation
S('mirror', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], fw = 0.03;
  for (const [x, y, ww, hh] of [[0, h / 2 - fw / 2, w, fw], [0, -h / 2 + fw / 2, w, fw], [-w / 2 + fw / 2, 0, fw, h - 2 * fw], [w / 2 - fw / 2, 0, fw, h - 2 * fw]]) rbox(k, x, y, 0, ww, hh, dd, 0.007, 0x8a9399);
  q4(k, [[-w / 2 + fw, -h / 2 + fw, 0.002], [w / 2 - fw, -h / 2 + fw, 0.002], [w / 2 - fw, h / 2 - fw, 0.002], [-w / 2 + fw, h / 2 - fw, 0.002]], [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]], [0x8c9ba3, 0xaab7bd, 0xe3eaee, 0xc5d0d5]);
  box(k, 0, 0, -0.004, w - 2 * fw, h - 2 * fw, 0.008, 0x2a2d30, { skip: 'Z' });
  k.meta.mirror = { w: w - 2 * fw, h: h - 2 * fw, z: 0.004 };
});
// Fauteuil de coiffure (embase chromée, vérin hydraulique et pédale, assise et dossier capitonnés, appui-tête,
// accoudoirs, repose-pieds) ; fauteuil massant (coque, assise, dossier incliné, repose-jambes, accoudoirs, monnayeur)
S('salonchair', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  if (d.id === 'massage_chair') {
    const ys = y0 + 0.45;
    rbox(k, 0, y0 + 0.12, 0, w - 0.1, 0.24, dd - 0.2, 0.05, 0x2a2a2a);
    rbox(k, 0, ys - 0.06, 0.05, w - 0.3, 0.2, 0.55, 0.08, c);
    at(k, M(0, ys + 0.24, -0.33, -0.38), () => { rbox(k, 0, 0, 0, w - 0.32, 0.74, 0.22, 0.09, c); rbox(k, 0, 0.38, 0.05, 0.36, 0.14, 0.14, 0.06, shade(c, 1.15)); for (let i = 0; i < 3; i++) fq(k, 0, 0.25 - i * 0.18, 0.111, w - 0.42, 0.006, shade(c, 0.7)); });
    at(k, M(0, ys - 0.2, dd / 2 - 0.24, 0.85), () => rbox(k, 0, 0, 0, 0.44, 0.42, 0.14, 0.06, c));
    for (const sx of [-1, 1]) { rbox(k, sx * (w / 2 - 0.09), ys + 0.08, -0.02, 0.18, 0.3, 0.72, 0.07, shade(c, 0.9)); }
    rbox(k, w / 2 - 0.09, ys + 0.25, 0.2, 0.14, 0.03, 0.16, 0.01, 0x1a1a1a); for (let i = 0; i < 4; i++) disc(k, w / 2 - 0.12 + (i % 2) * 0.06, ys + 0.266, 0.17 + Math.floor(i / 2) * 0.06, 0.012, [0x00e676, 0xff1744, 0x40c4ff, 0xffd600][i], [0, 1, 0], 8);
    rbox(k, -w / 2 + 0.005, ys - 0.05, 0.2, 0.012, 0.2, 0.16, 0.003, STEEL, { skip: 'X' }); fq(k, -w / 2 - 0.0005, ys - 0.02, 0.2, 0.004, 0.05, 0x111111, 'x');
    fq(k, -w / 2 - 0.0005, ys - 0.11, 0.2, 0.12, 0.04, 0, 'x', lab(k, 'massage', 64, 18, { kind: 'sign', name: '1 PIÈCE · 2 MIN', bg: 0x3e2723, fg: 0xffd600, accent: 0xffd600 }));
    return;
  }
  const ys = y0 + 0.5;
  lat(k, [[0.001, y0], [0.29, y0 + 0.004], [0.3, y0 + 0.012], [0.27, y0 + 0.03], [0.06, y0 + 0.05], [0.001, y0 + 0.055]], CHROME, { segs: 22 });
  cyl(k, 0, y0 + 0.17, 0, 0.045, 0.24, 0x161616, 'y', 12); cyl(k, 0, ys - 0.12, 0, 0.035, 0.12, CHROME, 'y', 12);
  at(k, M(0.12, y0 + 0.07, 0.18, 0, -0.4, 0), () => { box(k, 0, 0, 0, 0.03, 0.012, 0.16, CHROME); rbox(k, 0, 0.01, 0.08, 0.07, 0.015, 0.05, 0.005, 0x161616); });
  rbox(k, 0, ys - 0.03, 0.02, 0.5, 0.14, 0.5, 0.06, c);
  at(k, M(0, ys + 0.3, -0.24, -0.16), () => { rbox(k, 0, 0, 0, 0.48, 0.58, 0.12, 0.07, c); for (let i = 0; i < 4; i++) fq(k, 0, 0.18 - i * 0.12, 0.0605, 0.38, 0.005, shade(c, 1.6)); });
  rbox(k, 0, h / 2 - 0.06, -0.31, 0.26, 0.12, 0.08, 0.04, c); cyl(k, 0, h / 2 - 0.15, -0.32, 0.01, 0.1, CHROME, 'y', 6);
  for (const sx of [-1, 1]) { rbox(k, sx * 0.29, ys + 0.12, 0.0, 0.08, 0.06, 0.42, 0.03, c); sweep(k, [[sx * 0.29, ys + 0.09, 0.15], [sx * 0.28, ys - 0.06, 0.15], [sx * 0.26, ys - 0.08, 0.05]], 0.012, CHROME, { segs: 6 }); }
  sweep(k, rpath([[-0.18, ys - 0.12, 0.22], [-0.2, y0 + 0.2, dd / 2 - 0.03], [0.2, y0 + 0.2, dd / 2 - 0.03], [0.18, ys - 0.12, 0.22]], 0.05, 3), 0.012, CHROME, { segs: 6 });
  box(k, 0, y0 + 0.2, dd / 2 - 0.05, 0.36, 0.012, 0.06, 0x2a2a2a);
});
// Chaise de café (structure tubulaire, assise et dossier galbé) ; fauteuil de bureau (piétement 5 branches à
// roulettes, vérin, assise et dossier rembourrés, mécanisme, accoudoirs)
S('chair', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  if (d.id === 'office_chair') {
    const ys = y0 + 0.47;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + 0.3, ca = Math.cos(a), sa = Math.sin(a), R = w / 2 - 0.035;
      sweep(k, [[ca * 0.04, y0 + 0.1, sa * 0.04], [ca * R, y0 + 0.075, sa * R]], 0.018, 0x1d1d1d, { sq: true, segs: 4 });
      at(k, M(ca * R, y0 + 0.032, sa * R, 0, -a, 0), () => { for (const sz of [-1, 1]) cyl(k, 0, 0, sz * 0.012, 0.03, 0.012, 0x111111, 'z', 10); box(k, 0, 0.03, 0, 0.02, 0.02, 0.02, 0x222222); });
    }
    cyl(k, 0, y0 + 0.1, 0, 0.04, 0.04, 0x1d1d1d, 'y', 12);
    cyl(k, 0, y0 + 0.22, 0, 0.026, 0.22, 0x222222, 'y', 10); cyl(k, 0, ys - 0.1, 0, 0.018, 0.1, CHROME, 'y', 10);
    rbox(k, 0, ys - 0.045, 0, 0.2, 0.03, 0.2, 0.01, 0x1d1d1d); sweep(k, [[0.08, ys - 0.05, 0.05], [0.18, ys - 0.07, 0.07]], 0.006, 0x1d1d1d, { segs: 4 });
    rbox(k, 0, ys, 0.02, 0.5, 0.08, 0.48, 0.035, c);
    sweep(k, rpath([[0, ys - 0.03, -0.1], [0, ys - 0.02, -0.26], [0, ys + 0.12, -0.27]], 0.04, 3), 0.018, 0x1d1d1d, { sq: true, segs: 4 });
    at(k, M(0, ys + 0.33, -0.23, -0.12), () => { rbox(k, 0, 0, 0, 0.46, 0.5, 0.07, 0.04, c); rbox(k, 0, -0.12, 0.03, 0.4, 0.12, 0.03, 0.015, shade(c, 1.2)); });
    for (const sx of [-1, 1]) { sweep(k, [[sx * 0.2, ys - 0.03, -0.02], [sx * 0.24, ys + 0.02, -0.02], [sx * 0.24, ys + 0.2, -0.02]], 0.012, 0x1d1d1d, { segs: 6 }); rbox(k, sx * 0.24, ys + 0.21, 0.0, 0.06, 0.025, 0.22, 0.012, 0x1a1a1a); }
    return;
  }
  const ys = y0 + 0.46, fr = 0x2b2e31, tr = 0.011;
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.035);
    sweep(k, [[x, y0 + 0.005, dd / 2 - 0.04], [x, ys - 0.02, dd / 2 - 0.05]], tr, fr, { segs: 6 });
    sweep(k, rpath([[x, y0 + 0.005, -dd / 2 + 0.04], [x, ys - 0.02, -dd / 2 + 0.06], [x, h / 2 - 0.02, -dd / 2 + 0.02]], 0.04, 3), tr, fr, { segs: 6 });
    sweep(k, [[x, ys - 0.025, dd / 2 - 0.05], [x, ys - 0.025, -dd / 2 + 0.06]], tr * 0.9, fr, { segs: 6 });
    for (const z of [dd / 2 - 0.04, -dd / 2 + 0.04]) cyl(k, x, y0 + 0.005, z, tr * 1.15, 0.01, 0x111111, 'y', 6);
  }
  sweep(k, [[-(w / 2 - 0.035), ys - 0.025, dd / 2 - 0.05], [w / 2 - 0.035, ys - 0.025, dd / 2 - 0.05]], tr * 0.9, fr, { segs: 6 });
  rbox(k, 0, ys, 0.005, w - 0.03, 0.022, dd - 0.06, 0.009, c);
  const R = 1.0, t = 0.016, band = arcPts(0, R, R, -PI / 2 - 0.2, -PI / 2 + 0.2, 8).concat(arcPts(0, R, R - t, -PI / 2 + 0.2, -PI / 2 - 0.2, 8));
  at(k, M(0, h / 2 - 0.1, -dd / 2 + 0.012, PI / 2 - 0.12), () => ext(k, band, -0.075, 0.075, c, { r: 0.004 }));
});

// ═════════════════════════ INSTRUMENTS ═════════════════════════
// clavier : touches blanches (plan, jours), noires (touches en relief) ; x0..x1 le long de x, devant à z1
function keyboard(k, x0, x1, y, z0, z1, nWhite, black = 0x111111) {
  const kw = (x1 - x0) / nWhite, kd = z1 - z0;
  box(k, (x0 + x1) / 2, y - 0.008, (z0 + z1) / 2, x1 - x0, 0.016, kd, 0xf6f4ee);
  for (let i = 1; i < nWhite; i++) fq(k, x0 + i * kw, y + 0.0002, (z0 + z1) / 2, 0.0015, kd, 0x6d6a63, 'Y');
  const pat = [1, 1, 0, 1, 1, 1, 0]; // touche noire après chaque blanche (do ré _ fa sol la _)
  for (let i = 0; i < nWhite - 1; i++) if (pat[(i + 5) % 7]) box(k, x0 + (i + 1) * kw, y + 0.006, z0 + kd * 0.33, kw * 0.55, 0.012, kd * 0.62, black);
}
// Piano droit (caisse laquée, joues, clavier 52 + 36 touches, cylindre et pupitre, pieds, trois pédales, marque) ;
// orgue électrique (deux claviers, tirettes, pédalier, pupitre)
S('piano', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, organ = d.p?.instr === 'organ', yk = y0 + (organ ? 0.78 : 0.72), zb = -dd / 2 + 0.36, kz1 = zb + 0.17;
  const hi = shade(c, organ ? 1.25 : 2.2);
  rbox(k, 0, 0, (-dd / 2 + zb) / 2, w, h, zb + dd / 2, 0.015, c);
  for (const sx of [-1, 1]) rbox(k, sx * (w / 2 - 0.03), (y0 + yk + 0.05) / 2 + (organ ? 0.0 : 0.15), zb + 0.12, 0.06, yk + 0.05 - y0 - (organ ? 0 : 0.3), 0.24, 0.01, c);
  rbox(k, 0, yk - 0.035, zb + 0.12, w - 0.12, 0.05, 0.24, 0.006, c);
  if (organ) {
    keyboard(k, -w / 2 + 0.1, w / 2 - 0.1, yk, zb + 0.06, kz1 + 0.06, 36);
    rbox(k, 0, yk + 0.07, zb + 0.03, w - 0.12, 0.04, 0.14, 0.006, c);
    keyboard(k, -w / 2 + 0.1, w / 2 - 0.1, yk + 0.1, zb - 0.02, zb + 0.09, 36);
    for (let i = 0; i < 12; i++) rbox(k, -0.4 + i * 0.07, yk + 0.18, zb - 0.02, 0.04, 0.03, 0.02, 0.004, [0xfafafa, 0x111111, 0x8d6e63, 0xd32f2f][i % 4]);
    for (let i = 0; i < 9; i++) box(k, -0.45 + i * 0.11, y0 + 0.03, zb + 0.12, 0.06, 0.04, 0.24, i % 2 ? 0x2a1b10 : 0xd7c49e);
    at(k, M(0, yk + 0.24, zb - 0.02, -0.25), () => rbox(k, 0, 0, 0, 0.7, 0.14, 0.02, 0.005, c));
  } else {
    keyboard(k, -w / 2 + 0.08, w / 2 - 0.08, yk, zb, kz1, 52);
    rbox(k, 0, yk + 0.1, zb + 0.015, w - 0.12, 0.2, 0.03, 0.008, c);
    at(k, M(0, yk + 0.205, zb + 0.06, -0.15), () => rbox(k, 0, 0, 0, w - 0.13, 0.012, 0.09, 0.004, c));
    fq(k, 0, yk + 0.1, zb + 0.0305, 0.16, 0.03, 0, 'Z', lab(k, 'pianologo', 64, 12, { kind: 'plain', bg: c, fg: 0xc9a74a, brand: 'LUNA · PARIS' }));
    at(k, M(0, yk + 0.36, zb + 0.03, -0.2), () => { rbox(k, 0, 0, 0, w * 0.55, 0.24, 0.018, 0.006, c); box(k, 0, -0.13, 0.03, w * 0.55, 0.02, 0.05, c); });
    for (const sx of [-1, 1]) { rbox(k, sx * (w / 2 - 0.03), y0 + 0.31, zb + 0.13, 0.06, 0.62, 0.06, 0.01, c); rbox(k, sx * (w / 2 - 0.03), y0 + 0.03, zb + 0.14, 0.06, 0.06, 0.12, 0.01, c); }
    box(k, 0, y0 + 0.08, zb + 0.005, w - 0.12, 0.16, 0.02, c);
    for (let i = -1; i <= 1; i++) at(k, M(i * 0.07, y0 + 0.05, zb + 0.05, 0.12), () => rbox(k, 0, 0, 0, 0.025, 0.01, 0.1, 0.004, 0xc9a74a));
  }
  fq(k, 0, h / 2 - 0.0, (-dd / 2 + zb) / 2, w - 0.06, zb + dd / 2 - 0.04, hi, 'Y');
  k.meta.keys = { x: 0, y: yk, z: (zb + kz1) / 2, w: w - 0.16 };
});
// fût de batterie (axe local y) : fût, cercles chromés, peaux, tirants
function drumShell(k, m, r, len, c, lugs = 6) {
  at(k, m, () => {
    lat(k, [[r * 0.98, -len / 2], [r, -len / 2 + 0.012, CHROME], [r, -len / 2 + 0.014, c, 'h'], [r, len / 2 - 0.014], [r, len / 2 - 0.012, CHROME, 'h'], [r * 0.98, len / 2, CHROME]], c, { segs: 18, top: 0xf2efe6, bot: 0xf2efe6 });
    for (let i = 0; i < lugs; i++) { const a = i / lugs * TAU; box(k, Math.cos(a) * (r + 0.006), 0, Math.sin(a) * (r + 0.006), 0.012, len * 0.5, 0.012, CHROME); }
  });
}
function cymbal(k, x, y, z, r, tilt = 0) { lat(k, [[0.001, 0.012], [0.03, 0.01], [r * 0.4, 0.004], [r, -0.004], [r * 0.4, 0.0], [0.03, 0.006], [0.001, 0.008]], 0xc9a23b, { segs: 18, m: M(x, y, z, tilt, 0, tilt * 0.5) }); }
// Batterie : grosse caisse (peau frontale à logo), caisse claire, deux toms suspendus, tom basse, charleston,
// cymbales sur perches, pédale, tabouret
S('drumkit', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, st = 0x8a9096;
  const bR = 0.26, bz = 0.15;
  drumShell(k, M(0, y0 + bR + 0.02, bz, PI / 2), bR, 0.4, c, 8);
  fq(k, 0, y0 + bR + 0.02, bz + 0.2015, 0.24, 0.12, 0, 'Z', lab(k, 'drumlogo', 64, 32, { kind: 'card', bg: 0x111111, picto: 'note', name: 'Hélios', pc: 0xffd600 }));
  for (const sx of [-1, 1]) sweep(k, [[sx * 0.22, y0 + 0.12, bz + 0.12], [sx * 0.3, y0 + 0.005, bz + 0.2]], 0.01, st, { segs: 5 });
  for (const [x, rr, ln] of [[-0.14, 0.11, 0.1], [0.14, 0.12, 0.11]]) { drumShell(k, M(x, y0 + 0.62, bz - 0.02, 0.45, 0, x < 0 ? 0.15 : -0.15), rr, ln, c, 6); sweep(k, [[x * 0.5, y0 + 0.52, bz], [x, y0 + 0.58, bz - 0.01]], 0.008, st, { segs: 4 }); }
  drumShell(k, M(0.55, y0 + 0.36, -0.05), 0.17, 0.28, c, 8);
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.5; sweep(k, [[0.55 + Math.cos(a) * 0.18, y0 + 0.4, -0.05 + Math.sin(a) * 0.18], [0.55 + Math.cos(a) * 0.24, y0 + 0.005, -0.05 + Math.sin(a) * 0.24]], 0.008, st, { segs: 4 }); }
  drumShell(k, M(-0.32, y0 + 0.56, 0.0, 0.12, 0, 0), 0.17, 0.12, 0xeceff1, 8);
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; sweep(k, [[-0.32, y0 + 0.4, 0], [-0.32 + Math.cos(a) * 0.2, y0 + 0.005, Math.sin(a) * 0.2]], 0.008, st, { segs: 4 }); }
  cyl(k, -0.32, y0 + 0.45, 0, 0.01, 0.1, st, 'y', 6);
  const hx = -0.62, hz = 0.0;
  cyl(k, hx, y0 + 0.36, hz, 0.012, 0.7, st, 'y', 6); cymbal(k, hx, y0 + 0.72, hz, 0.18); cymbal(k, hx, y0 + 0.69, hz, 0.18);
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.3; sweep(k, [[hx, y0 + 0.2, hz], [hx + Math.cos(a) * 0.22, y0 + 0.005, hz + Math.sin(a) * 0.22]], 0.008, st, { segs: 4 }); }
  for (const [x, z, r, t] of [[0.55, -0.3, 0.22, 0.2], [-0.45, -0.35, 0.21, -0.25]]) { sweep(k, [[x, y0 + 0.005, z], [x, h / 2 - 0.1, z]], 0.012, st, { segs: 6 }); cymbal(k, x, h / 2 - 0.08, z, r, t); for (let i = 0; i < 3; i++) { const a = i * TAU / 3; sweep(k, [[x, y0 + 0.25, z], [x + Math.cos(a) * 0.22, y0 + 0.005, z + Math.sin(a) * 0.22]], 0.008, st, { segs: 4 }); } }
  rbox(k, 0.05, y0 + 0.02, bz + 0.33, 0.08, 0.02, 0.22, 0.006, 0x37474f); at(k, M(0.05, y0 + 0.1, bz + 0.24, -0.5), () => box(k, 0, 0, 0, 0.02, 0.12, 0.02, st));
  cyl(k, 0.0, y0 + 0.25, -0.36, 0.016, 0.42, st, 'y', 8); cyl(k, 0.0, y0 + 0.48, -0.36, 0.17, 0.08, 0x111111, 'y', 16);
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.4; sweep(k, [[0, y0 + 0.2, -0.36], [Math.cos(a) * 0.2, y0 + 0.005, -0.36 + Math.sin(a) * 0.2]], 0.008, st, { segs: 4 }); }
});
// Clavier synthé : coque à joues arrondies, 61 touches, molettes, boutons, écran, grilles de haut-parleurs, marque
S('keyboardsynth', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  rbox(k, 0, y0 + 0.035, 0, w, 0.07, dd, 0.02, c);
  for (const sx of [-1, 1]) rbox(k, sx * (w / 2 - 0.02), y0 + 0.05, 0, 0.04, 0.1, dd, 0.018, shade(c, 0.8));
  keyboard(k, -w / 2 + 0.1, w / 2 - 0.04, y0 + 0.078, dd / 2 - 0.15, dd / 2 - 0.005, 36);
  box(k, 0, y0 + 0.065, dd / 2 - 0.0745, w - 0.08, 0.012, 0.15, shade(c, 0.6));
  for (const x of [-w / 2 + 0.055, -w / 2 + 0.08]) cyl(k, x, y0 + 0.075, dd / 2 - 0.08, 0.02, 0.012, 0x111111, 'x', 12);
  fq(k, 0.05, y0 + 0.0705, -dd / 2 + 0.07, 0.12, 0.04, 0x0f2a12, 'Y');
  fq(k, -0.25, y0 + 0.0705, -dd / 2 + 0.07, 0.2, 0.05, 0, 'Y', lab(k, 'synthk', 64, 16, { kind: 'lids', nx: 8, nz: 2 }));
  for (const sx of [-1, 1]) slots(k, sx * 0.36, y0 + 0.0705, -dd / 2 + 0.07, 5, 0.1, 0.006, 0.014, 0x0c0c0c, 'Y', true);
  fq(k, 0.3, y0 + 0.0705, -dd / 2 + 0.03, 0.1, 0.02, 0, 'Y', lab(k, 'synthlogo', 48, 10, { kind: 'plain', bg: c, fg: 0xe0e0e0, brand: 'SYNTHIA 61' }));
});

// ═════════════════════════ SPORT, LOISIRS ═════════════════════════
// Vélo d'appartement : pieds stabilisateurs, cadre tubulaire, volant d'inertie caréné, pédalier, selle sur tige,
// guidon et compteur
S('bike', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, fr = c, gr = 0x9aa1a6;
  for (const z of [dd / 2 - 0.08, -dd / 2 + 0.08]) { sweep(k, [[-w / 2 + 0.03, y0 + 0.03, z], [w / 2 - 0.03, y0 + 0.03, z]], 0.025, fr, { segs: 8, caps: true }); for (const sx of [-1, 1]) cyl(k, sx * (w / 2 - 0.03), y0 + 0.03, z, 0.03, 0.04, 0x111111, 'x', 8); }
  sweep(k, rpath([[0, y0 + 0.05, dd / 2 - 0.08], [0, y0 + 0.4, dd / 2 - 0.14], [0, y0 + 0.2, -0.02], [0, y0 + 0.05, -dd / 2 + 0.08]], 0.08, 4), 0.03, fr, { segs: 10 });
  sweep(k, [[0, y0 + 0.2, -0.02], [0, y0 + 0.62, -0.16]], 0.032, fr, { segs: 10 });
  for (const sx of [-1, 1]) lat(k, [[0.001, -0.02], [0.2, -0.02], [0.21, -0.012], [0.21, 0.012], [0.2, 0.02], [0.001, 0.02]], sx > 0 ? 0x37474f : 0x2b2d30, { segs: 20, m: M(sx * 0.025, y0 + 0.33, dd / 2 - 0.22, 0, 0, PI / 2) });
  for (const sx of [-1, 1]) { at(k, M(sx * 0.07, y0 + 0.25, 0.0, 0.6), () => { box(k, 0, -0.085, 0, 0.015, 0.17, 0.02, gr); rbox(k, sx * 0.04, -0.17, 0, 0.08, 0.02, 0.1, 0.006, 0x111111); }); }
  cyl(k, 0, y0 + 0.25, 0, 0.045, 0.12, 0x2b2d30, 'x', 12);
  cyl(k, 0, y0 + 0.7, -0.19, 0.016, 0.18, gr, 'y', 8);
  vloft(k, [{ y: y0 + 0.78, pts: ell(0.06, 0.08, 10, 0, -0.17) }, { y: y0 + 0.81, pts: ell(0.11, 0.12, 10, 0, -0.2) }, { y: y0 + 0.83, pts: ell(0.1, 0.11, 10, 0, -0.2) }], 0x111111, { c1: 0x111111 });
  sweep(k, [[0, y0 + 0.4, dd / 2 - 0.14], [0, h / 2 - 0.12, dd / 2 - 0.22]], 0.025, fr, { segs: 8 });
  sweep(k, rpath([[-0.22, h / 2 - 0.04, dd / 2 - 0.12], [-0.16, h / 2 - 0.1, dd / 2 - 0.2], [0.16, h / 2 - 0.1, dd / 2 - 0.2], [0.22, h / 2 - 0.04, dd / 2 - 0.12]], 0.05, 3), 0.014, 0x111111, { segs: 6 });
  at(k, M(0, h / 2 - 0.09, dd / 2 - 0.25, -0.6), () => { rbox(k, 0, 0, 0, 0.14, 0.09, 0.03, 0.01, 0x212121); fq(k, 0, 0.005, 0.0155, 0.1, 0.05, 0x0f2a12); });
});
// Tente dôme deux places : double toit tendu sur arceaux croisés, porte zippée entrouverte (intérieur sombre),
// tapis de sol baignoire, sardines et haubans
S('tent', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, rx = w / 2 - 0.03, rz = dd / 2 - 0.08, nT = 36, nP = 9, base = k.b.vertexCount;
  const door = (t, p) => { const a = Math.abs(((t - PI / 2 + PI) % TAU + TAU) % TAU - PI); return a < 0.55 - p * 0.3 && p < 0.95 ? (a < 0.35 - p * 0.25 && p < 0.75 ? 2 : 1) : 0; };
  const G = [];
  for (let i = 0; i <= nP; i++) for (let j = 0; j <= nT; j++) {
    const p = i / nP * PI / 2, t = j / nT * TAU, sp = Math.cos(p), x = Math.cos(t) * rx * sp, z = Math.sin(t) * rz * sp, y = y0 + 0.03 + (h - 0.06) * Math.sin(p) * (1 - 0.06 * Math.cos(2 * t) * sp);
    const dc = door(t, i / nP), col = i === 0 ? 0x263238 : dc === 2 ? 0x0c0f0c : dc === 1 ? shade(c, 0.6) : (j % 6 < 3 ? c : shade(c, 0.9));
    const n = new THREE.Vector3(Math.cos(t) * sp / rx, Math.sin(p) / (h - 0.06), Math.sin(t) * sp / rz).normalize();
    G.push(n); pv(k, x, y, z, n.x, n.y, n.z, L(col));
  }
  for (let i = 0; i < nP; i++) for (let j = 0; j < nT; j++) { const a = base + i * (nT + 1) + j; k.b.idx.push(a, a + nT + 1, a + nT + 2, a, a + nT + 2, a + 1); }
  for (const s2 of [1, -1]) { const P = []; for (let i = 0; i <= 12; i++) { const t = -PI / 2 + i / 12 * PI; P.push([Math.sin(t) * rx * 0.714 * s2, y0 + 0.03 + (h - 0.05) * Math.cos(t), Math.sin(t) * rz * 0.714]); } sweep(k, P, 0.008, 0x37474f, { segs: 5 }); } // arceaux en diagonale
  sweep(k, rpath([[0.02, y0 + 0.08, rz * 0.98], [0.2, y0 + 0.45, rz * 0.62], [0.04, y0 + 0.82, rz * 0.2]], 0.1, 3), 0.004, 0xffd600, { segs: 3 });
  for (const [x, z] of [[rx, 0], [-rx, 0], [0, -rz], [rx * 0.7, rz * 0.7], [-rx * 0.7, rz * 0.7]]) { const px = x * 1.04 + Math.sign(x) * 0.02, pz = z * 1.08 + Math.sign(z) * 0.02; sweep(k, [[x * 0.8, y0 + 0.35, z * 0.8], [Math.max(-w / 2 + 0.01, Math.min(w / 2 - 0.01, px)), y0 + 0.005, Math.max(-dd / 2 + 0.01, Math.min(dd / 2 - 0.01, pz))]], 0.002, 0xe0e0e0, { segs: 3 }); }
  vloft(k, [{ y: y0, pts: ell(rx + 0.01, rz + 0.01, 24) }, { y: y0 + 0.06, pts: ell(rx + 0.004, rz + 0.004, 24) }], 0x263238, {});
});
// Escabeau aluminium replié : montants profilés, marches striées, plateau supérieur, pieds caoutchouc, compas
S('ladder', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  for (const sx of [-1, 1]) { rbox(k, sx * (w / 2 - 0.02), -0.02, 0.025, 0.04, h - 0.06, 0.05, 0.006, c); rbox(k, sx * (w / 2 - 0.05), -0.04, -0.035, 0.03, h - 0.12, 0.04, 0.005, shade(c, 0.9)); box(k, sx * (w / 2 - 0.02), y0 + 0.012, 0.025, 0.04, 0.024, 0.05, 0x1a1a1a); box(k, sx * (w / 2 - 0.05), y0 + 0.042, -0.035, 0.035, 0.024, 0.045, 0x1a1a1a); }
  for (let i = 0; i < 5; i++) { const y = y0 + 0.28 + i * 0.27; rbox(k, 0, y, 0.025, w - 0.08, 0.02, 0.05, 0.004, shade(c, 1.05)); for (let j = 0; j < 3; j++) fq(k, 0, y + 0.0102, 0.012 + j * 0.013, w - 0.1, 0.003, shade(c, 0.7), 'Y'); }
  rbox(k, 0, h / 2 - 0.04, 0.0, w - 0.02, 0.06, dd - 0.01, 0.012, 0x455a64);
  for (const sx of [-1, 1]) at(k, M(sx * (w / 2 - 0.035), 0.1, 0.0, 0, 0, sx * 0.05), () => box(k, 0, 0, 0, 0.012, 0.3, 0.008, 0x8a9096));
});

// ═════════════════════════ ANIMALERIE ═════════════════════════
// Aquarium (couvercle à rampe lumineuse, cadres, décor de fond, gravier, roches, plantes, diffuseur et bulles,
// filtre, ligne d'eau) ; terrarium (sable, branche, gamelle, lampe chauffante, python enroulé)
S('aquarium', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, terra = d.use === 'terrarium', fr = 0x1d1e20, yt = h / 2 - 0.06, yb = y0 + 0.05;
  rbox(k, 0, (yt + h / 2) / 2, 0, w, h / 2 - yt, dd, 0.012, fr);
  fq(k, 0, yt - 0.0005, 0, w - 0.08, dd - 0.08, terra ? 0xffcc80 : 0xe8f6ff, 'y');
  box(k, 0, (y0 + yb) / 2, 0, w, yb - y0, dd, fr);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(k, sx * (w / 2 - 0.008), (yb + yt) / 2, sz * (dd / 2 - 0.008), 0.016, yt - yb, 0.016, 0x2a2b2d);
  fqg(k, 0, (yb + yt) / 2, -dd / 2 + 0.02, w - 0.04, yt - yb, terra ? 0x3e2a14 : 0x0d47a1, terra ? 0x8d6e63 : 0x4fc3f7);
  for (const sx of [-1, 1]) fqg(k, sx * (w / 2 - 0.02), (yb + yt) / 2, 0, dd - 0.04, yt - yb, terra ? 0x5d4037 : 0x1565c0, terra ? 0x8d6e63 : 0x81d4fa, sx > 0 ? 'x' : 'X');
  const rnd = mulberry32(terra ? 13 : 7);
  box(k, 0, yb + 0.03, 0, w - 0.04, 0.06, dd - 0.04, terra ? 0xc8a46e : 0xd9c9a3);
  for (let i = 0; i < 18; i++) k.blob((rnd() - 0.5) * (w - 0.1), yb + 0.06, (rnd() - 0.5) * (dd - 0.1), 0.03 + rnd() * 0.03, 0.01 + rnd() * 0.01, 0.03 + rnd() * 0.03, terra ? shade(0xb08d57, 0.8 + rnd() * 0.4) : [0xe0d0b0, 0xc9b28a, 0x8d7b68, 0x5d6b73][i % 4], 5, 2);
  for (let i = 0; i < 4; i++) k.blob(-w * 0.3 + i * w * 0.2 + (rnd() - 0.5) * 0.1, yb + 0.08, -dd * 0.15 + (rnd() - 0.5) * 0.1, 0.06 + rnd() * 0.04, 0.05 + rnd() * 0.05, 0.05, terra ? 0x6d5a4a : 0x6b6f72, 7, 4);
  if (terra) {
    sweep(k, rpath([[-w * 0.4, yb + 0.06, -0.1], [-w * 0.15, yb + 0.22, -0.05], [w * 0.1, yb + 0.28, 0.02], [w * 0.38, yb + 0.12, -0.06]], 0.1, 3), (t) => 0.025 - t * 0.012, 0x5d4037, { segs: 7 });
    k.tube(w * 0.3, yb + 0.075, 0.1, 0.08, 0.03, 0x37474f, 12, { open: false }); fq(k, w * 0.3, yb + 0.0905, 0.1, 0.12, 0.12, 0x3a6b7a, 'Y');
    const coil = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * TAU * 2.3, r = 0.04 + t * 0.12; coil.push([-0.05 + Math.cos(a) * r, yb + 0.075 + 0.025 * Math.max(0, 1 - t * 1.4) + (i > 36 ? 0.04 * (i - 36) / 4 : 0), 0.05 + Math.sin(a) * r * 0.8]); }
    sweep(k, coil, (t) => 0.022 * Math.min(1, t * 6) * (t > 0.9 ? 1.3 : 1) + 0.004, 0x8a7b3d, { segs: 6, caps: true });
    cyl(k, -w * 0.3, yt - 0.04, 0, 0.05, 0.05, 0x2b2b2b, 'y', 12); disc(k, -w * 0.3, yt - 0.066, 0, 0.04, 0xff6d00, [0, -1, 0], 12);
  } else {
    for (let i = 0; i < 9; i++) { const x = -w * 0.42 + i * w * 0.1 + (rnd() - 0.5) * 0.04, z = -dd * 0.3 + rnd() * dd * 0.25, hh = 0.15 + rnd() * 0.25; sweep(k, [[x, yb + 0.06, z], [x + (rnd() - 0.5) * 0.06, yb + 0.06 + hh * 0.5, z], [x + (rnd() - 0.5) * 0.1, yb + 0.06 + hh, z + 0.02]], (t) => 0.012 * (1 - t) + 0.002, i % 3 ? 0x2e7d32 : 0x558b2f, { segs: 3, up: [0, 0, 1] }); }
    cyl(k, w * 0.4, (yb + yt) / 2, -dd / 2 + 0.07, 0.03, yt - yb - 0.08, 0x263238, 'y', 10);
    sweep(k, [[w * 0.3, yt - 0.02, -dd / 2 + 0.05], [w * 0.3, yb + 0.08, -dd / 2 + 0.05]], 0.004, 0x1a1a1a, { segs: 4 });
    for (let i = 0; i < 8; i++) lat(k, sphereP(0.006 + i * 0.0006, 0, 3), 0xe1f5fe, { segs: 5, m: M(w * 0.3 + Math.sin(i) * 0.01, yb + 0.12 + i * 0.045, -dd / 2 + 0.06) });
    fq(k, 0, yt - 0.03, dd / 2 - 0.0005, w - 0.04, 0.006, 0xb3e5fc);
  }
  rbox(k, 0, h / 2 - 0.005, dd / 2 - 0.06, 0.3, 0.012, 0.08, 0.004, 0x2b2d30);
  k.meta.light = [0, h * 0.4, 0]; k.meta.fish = d.use === 'aquarium';
});
// perroquet (Coco) perché : corps, tête, bec crochu, ailes, queue, œil
function parrot(k, x, y, z) {
  at(k, M(x, y, z), () => {
    k.blob(0, 0.07, 0, 0.045, 0.075, 0.05, 0x43a047, 8, 5);
    k.blob(0, 0.15, 0.012, 0.038, 0.038, 0.04, 0x66bb6a, 8, 4);
    lat(k, [[0.014, 0], [0.011, 0.012], [0.004, 0.024], [0.001, 0.026]], 0xffb300, { segs: 6, m: M(0, 0.142, 0.05, 1.9) });
    for (const sx of [-1, 1]) { k.blob(sx * 0.04, 0.07, -0.005, 0.014, 0.06, 0.035, sx > 0 ? 0x2e7d32 : 0x2e7d32, 6, 4); disc(k, sx * 0.034, 0.158, 0.026, 0.007, 0xfafafa, [sx, 0, 0.6], 8); disc(k, sx * 0.0345, 0.158, 0.027, 0.0035, 0x111111, [sx, 0, 0.6], 6); k.blob(sx * 0.044, 0.04, 0.0, 0.006, 0.02, 0.02, 0xd32f2f, 5, 3); }
    extX(k, [[-0.02, 0.02], [-0.07, -0.12], [-0.04, -0.13], [0.0, 0.0]], -0.012, 0.012, 0xd32f2f);
  });
}
// Cage à perroquet (fond, barreaux cintrés en dôme, cerclages, perchoir, mangeoires, porte, crochet) et cage à
// hamster (bac plastique, grille, roue, maisonnette, biberon, litière, hamster)
S('cage', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  if (d.use === 'parrot') {
    const R = Math.min(w, dd) / 2 - 0.02, yb = y0 + 0.08, yd = h / 2 - 0.25;
    lat(k, [[R + 0.01, y0], [R + 0.01, yb - 0.01, 0x5d4037], [R - 0.01, yb, 0x6d4c41, 'h'], [0.001, yb]], 0x5d4037, { segs: 20, bot: 0x3e2723 });
    const nb = 20;
    for (let i = 0; i < nb; i++) { const a = i / nb * TAU, P = [[Math.cos(a) * R, yb, Math.sin(a) * R], [Math.cos(a) * R, yd, Math.sin(a) * R]]; for (let j = 1; j <= 4; j++) { const t = j / 4 * PI / 2; P.push([Math.cos(a) * R * Math.cos(t), yd + 0.16 * Math.sin(t), Math.sin(a) * R * Math.cos(t)]); } sweep(k, P, 0.003, c, { segs: 3 }); }
    for (const yy of [yb + 0.02, (yb + yd) / 2, yd]) { const ring = []; for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; ring.push([Math.cos(a) * R, yy, Math.sin(a) * R]); } sweep(k, ring, 0.005, c, { closed: true, segs: 4 }); }
    lat(k, [[0.03, yd + 0.155], [0.025, yd + 0.17]], c, { segs: 10, top: c });
    const hook = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * PI * 1.4 - PI / 2; hook.push([Math.cos(a) * 0.02, yd + 0.19 + Math.sin(a) * 0.02 + 0.02, 0]); } sweep(k, hook, 0.004, c, { segs: 4 });
    cyl(k, 0, y0 + 0.4, 0, 0.012, 2 * R - 0.01, 0x8d6e63, 'x', 8);
    parrot(k, 0, y0 + 0.41, 0);
    for (const sx of [-1, 1]) lat(k, [[0.03, -0.02], [0.035, 0.02], [0.031, 0.02, null, 'h'], [0.025, -0.012]], sx > 0 ? 0xffb300 : 0x29b6f6, { segs: 10, m: M(sx * (R - 0.05), yb + 0.18, R * 0.4), bot: 0xffffff });
    sweep(k, [[-0.06, yb + 0.25, R + 0.002], [-0.06, yb + 0.05, R + 0.002], [0.06, yb + 0.05, R + 0.002], [0.06, yb + 0.25, R + 0.002], [-0.06, yb + 0.25, R + 0.002]], 0.004, shade(c, 0.8), { segs: 3 });
    return;
  }
  const yb = y0 + 0.12;
  rbox(k, 0, (y0 + yb) / 2, 0, w, yb - y0, dd, 0.02, c);
  box(k, 0, yb - 0.02, 0, w - 0.03, 0.02, dd - 0.03, 0xe8d58a);
  for (let i = 0; i <= 12; i++) { const x = -w / 2 + 0.01 + i * (w - 0.02) / 12; for (const sz of [-1, 1]) sweep(k, [[x, yb, sz * (dd / 2 - 0.01)], [x, h / 2 - 0.01, sz * (dd / 2 - 0.01)]], 0.0022, 0xb0bec5, { segs: 3 }); sweep(k, [[x, h / 2 - 0.01, -(dd / 2 - 0.01)], [x, h / 2 - 0.01, dd / 2 - 0.01]], 0.0022, 0xb0bec5, { segs: 3 }); }
  for (let i = 0; i <= 7; i++) { const z = -dd / 2 + 0.01 + i * (dd - 0.02) / 7; for (const sx of [-1, 1]) sweep(k, [[sx * (w / 2 - 0.01), yb, z], [sx * (w / 2 - 0.01), h / 2 - 0.01, z]], 0.0022, 0xb0bec5, { segs: 3 }); }
  const wheelP = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; wheelP.push([w * 0.15, yb + 0.1 + Math.sin(a) * 0.08, Math.cos(a) * 0.08]); }
  sweep(k, wheelP, 0.006, 0x29b6f6, { closed: true, segs: 4 }); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; sweep(k, [[w * 0.15, yb + 0.1, 0], [w * 0.15, yb + 0.1 + Math.sin(a) * 0.08, Math.cos(a) * 0.08]], 0.003, 0x29b6f6, { segs: 3 }); }
  box(k, w * 0.15 - 0.02, yb + 0.05, 0, 0.012, 0.1, 0.02, 0x0277bd);
  lat(k, sphereP(0.07, yb - 0.01).filter((p, i) => i >= 3), 0xffd54f, { segs: 12, m: M(-w * 0.25, 0, 0.0) });
  k.blob(-w * 0.02, yb + 0.02, 0.06, 0.035, 0.03, 0.05, 0xffcc80, 7, 4); for (const sx of [-1, 1]) { k.blob(-w * 0.02 + sx * 0.018, yb + 0.05, 0.085, 0.01, 0.01, 0.006, 0xffab91, 5, 3); disc(k, -w * 0.02 + sx * 0.015, yb + 0.035, 0.105, 0.004, 0x111111, [sx * 0.3, 0.2, 1], 6); }
  lat(k, [[0.001, 0], [0.02, 0.01], [0.022, 0.12], [0.015, 0.13], [0.004, 0.14], [0.004, 0.17, 0x9aa1a6]], 0x81d4fa, { segs: 10, m: M(w * 0.38, yb + 0.06, -dd / 2 + 0.035) });
});

// ═════════════════════════ PETITE ÉLECTRONIQUE ═════════════════════════
// Téléphone de bureau : socle incliné, combiné sur son berceau, cordon spiralé, clavier, écran, touches de fonction
S('deskphone', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  extX(k, [[-dd / 2, y0], [dd / 2, y0], [dd / 2, y0 + 0.025], [-dd / 2 + 0.02, h / 2 - 0.035], [-dd / 2, h / 2 - 0.035]], -w / 2, w / 2, c, { r: 0.006 });
  const P = (u) => [dd / 2 - u * (dd - 0.02), y0 + 0.025 + u * (h - 0.06)], tilt = Math.atan2(h - 0.06, dd - 0.02);
  at(k, M(0.035, P(0.3)[1] + 0.0008, P(0.3)[0], tilt), () => { fq(k, 0, 0, 0, 0.07, 0.09, 0, 'Y', keypad(k, 'phone', 3, 4)); });
  at(k, M(-0.06, P(0.5)[1] + 0.0008, P(0.5)[0], tilt), () => { fq(k, 0, 0, 0, 0.05, 0.03, 0x0b1a26, 'Y'); for (let i = 0; i < 3; i++) fq(k, 0, 0, 0.03 + i * 0.012, 0.04, 0.007, 0x5d6b73, 'Y'); });
  const hy = h / 2 - 0.025, hz = -dd / 2 + 0.04;
  at(k, M(0, hy, hz, 0, 0, 0), () => { sweep(k, [[-w / 2 + 0.025, 0, 0], [w / 2 - 0.025, 0, 0]], 1, c, { sec: rrect(0.03, 0.022, 0.008, 2), caps: true }); for (const sx of [-1, 1]) rbox(k, sx * (w / 2 - 0.03), -0.004, 0.0, 0.045, 0.03, 0.05, 0.012, c); });
  sweep(k, cable([-w / 2 + 0.01, hy - 0.012, hz], [-w / 2 + 0.008, y0 + 0.02, hz + 0.05], 0.01, 8), 0.0022, 0x161616, { segs: 4 });
  k.meta.handset = [0, hy, hz];
});
// Magnétoscope (trappe à cassette, afficheur « 12:00 », touches de transport) ; enregistreur de vidéosurveillance
S('vcr', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, zf = dd / 2 - 0.006;
  rbox(k, 0, 0.004, -0.003, w, h - 0.008, dd - 0.006, 0.006, c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(k, sx * (w / 2 - 0.04), y0 + 0.002, sz * (dd / 2 - 0.04), 0.04, 0.004, 0.03, 0x111111);
  fq(k, 0, 0.004, zf + 0.0005, w - 0.012, h - 0.02, shade(c, 1.25));
  if (d.id === 'cassette_rec') { for (let i = 0; i < 4; i++) { fq(k, -w * 0.3 + i * 0.07, 0.012, zf + 0.0008, 0.05, 0.012, 0x050505); disc(k, -w * 0.3 + i * 0.07, -0.015, zf + 0.0008, 0.004, i === 0 ? 0xff1744 : 0x00e676, [0, 0, 1], 6); } fq(k, w * 0.28, 0.008, zf + 0.0008, 0.11, 0.03, 0, 'Z', lab(k, 'cctvrec', 56, 16, { kind: 'sign', name: 'REC 04:12', bg: 0x05140a, fg: 0x5dff8f, accent: 0x05140a })); k.meta.display = [w * 0.28, 0.008, zf + 0.002]; return; }
  rbox(k, -w * 0.12, 0.008, zf + 0.002, w * 0.48, 0.03, 0.004, 0.002, 0x0f0f10); fq(k, -w * 0.12, 0.008, zf + 0.0042, w * 0.44, 0.004, 0x050505);
  fq(k, w * 0.3, 0.012, zf + 0.0008, 0.09, 0.025, 0, 'Z', lab(k, 'vcr1200', 48, 14, { kind: 'sign', name: '12:00', bg: 0x0a1018, fg: 0x40c4ff, accent: 0x0a1018 }));
  for (let i = 0; i < 5; i++) rbox(k, w * 0.2 + i * 0.022, -0.022, zf + 0.002, 0.016, 0.008, 0.004, 0.0015, 0x4a4b4e);
  fq(k, -w * 0.38, -0.022, zf + 0.0008, 0.05, 0.01, 0, 'Z', lab(k, 'vcrlogo', 40, 8, { kind: 'plain', bg: shade(c, 1.25), fg: 0xb0b0b0, brand: 'HiFi VHS' }));
  k.meta.display = [w * 0.3, 0.012, zf + 0.002];
});
// Console de jeu de démonstration : boîtier à rainures, fente à cartouche, interrupteurs, voyant, ports manettes
S('console', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2;
  rbox(k, 0, 0, 0, w, h, dd - 0.003, 0.012, c);
  for (let i = 0; i < 6; i++) fq(k, 0, h / 2 + 0.0003, dd / 2 - 0.02 - i * 0.012, w - 0.04, 0.004, 0x0c0c0c, 'Y');
  rbox(k, 0, h / 2 - 0.0055, -0.04, 0.14, 0.01, 0.05, 0.004, 0x2b2b2b); fq(k, 0, h / 2 - 0.0003, -0.04, 0.12, 0.012, 0x050505, 'Y');
  for (const sx of [-1, 1]) { rbox(k, sx * 0.1, h / 2 - 0.0045, 0.02, 0.03, 0.008, 0.02, 0.003, 0x666666); fq(k, sx * 0.06, -0.005, dd / 2 - 0.001, 0.025, 0.012, 0x050505); }
  disc(k, w / 2 - 0.03, 0.01, dd / 2 - 0.0009, 0.004, 0xff1744, [0, 0, 1], 6);
  fq(k, -0.09, 0.012, dd / 2 - 0.001, 0.08, 0.015, 0, 'Z', lab(k, 'consolelogo', 40, 8, { kind: 'plain', bg: c, fg: 0xd50000, brand: 'PIXEL 16' }));
});
// Platine vinyle : socle bois, plateau (couvre-plateau, points stroboscopiques), axe, bras en S (cellule,
// contrepoids, pivot, repose-bras), boutons marche/vitesse, curseur de pitch, pieds
S('turntable', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yt = y0 + 0.07, px = -w * 0.1;
  rbox(k, 0, (y0 + 0.012 + yt) / 2, 0, w, yt - y0 - 0.012, dd, 0.008, c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(k, sx * (w / 2 - 0.04), y0 + 0.006, sz * (dd / 2 - 0.04), 0.018, 0.012, 0x1a1a1a, 'y', 10);
  fq(k, 0, yt + 0.0004, 0, w - 0.02, dd - 0.02, 0x1d1d1f, 'Y');
  lat(k, [[0.15, yt], [0.152, yt + 0.008, 0xb9bfc4], [0.15, yt + 0.016], [0.145, yt + 0.017, 0x111111, 'h'], [0.02, yt + 0.019], [0.006, yt + 0.019, 0x9aa1a6, 'h'], [0.003, yt + 0.035], [0.001, yt + 0.036]], 0xb9bfc4, { segs: 24, m: M(px, 0, 0) });
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; fq(k, px + Math.cos(a) * 0.151, yt + 0.008, Math.sin(a) * 0.151, 0.006, 0.004, 0x5d6b73, 'Z'); }
  k.meta.platter = [px, yt + 0.02, 0];
  const ax = w / 2 - 0.07, az = -dd / 2 + 0.08;
  cyl(k, ax, yt + 0.012, az, 0.025, 0.024, 0x9aa1a6, 'y', 12);
  sweep(k, [[ax, yt + 0.03, az + 0.01], [ax - 0.01, yt + 0.032, az + 0.1], [ax - 0.05, yt + 0.034, az + 0.2], [ax - 0.08, yt + 0.034, az + 0.24]], 0.0035, CHROME, { segs: 6 });
  at(k, M(ax - 0.085, yt + 0.03, az + 0.25, 0, 0.5, 0), () => rbox(k, 0, 0, 0, 0.018, 0.008, 0.03, 0.003, 0x111111));
  cyl(k, ax + 0.005, yt + 0.03, az - 0.035, 0.014, 0.025, 0x2a2a2a, 'z', 10);
  cyl(k, ax + 0.03, yt + 0.025, az + 0.12, 0.004, 0.03, 0x111111, 'y', 6);
  for (let i = 0; i < 3; i++) rbox(k, -w / 2 + 0.04 + i * 0.03, yt + 0.004, dd / 2 - 0.03, 0.022, 0.008, 0.018, 0.003, i ? 0x444444 : 0xd50000);
  fq(k, w / 2 - 0.04, yt + 0.0008, 0.06, 0.012, 0.09, 0x0a0a0a, 'Y'); box(k, w / 2 - 0.04, yt + 0.005, 0.07, 0.022, 0.008, 0.012, 0xcfd3d6);
});
// Panneau d'affichage du personnel : liège dans un cadre bois, notes épinglées (plannings, consignes), photo, punaises
S('board', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], fw = 0.035;
  box(k, 0, 0, -0.009, w - 0.02, h - 0.02, 0.012, 0xb98c55, { skip: 'z' });
  for (const [x, y, ww, hh] of [[0, h / 2 - fw / 2, w, fw], [0, -h / 2 + fw / 2, w, fw], [-w / 2 + fw / 2, 0, fw, h - 2 * fw], [w / 2 - fw / 2, 0, fw, h - 2 * fw]]) rbox(k, x, y, 0.0, ww, hh, dd, 0.006, c);
  const NOTES = [['PLANNING', 'GARDES DE NUIT', 0xffffff], ['RÉUNION', 'LUNDI 9 H', 0xfff59d], ['CHAT PERDU', 'RÉPOND À « CARAMEL »', 0xb3e5fc], ['RAPPEL', 'NE PAS OUVRIR B-13', 0xf8bbd0], ['CONSIGNES', 'RONDES TOUTES LES 2 H', 0xffffff], ['À VENDRE', 'VÉLO · 50 €', 0xc8e6c9]];
  const rnd = mulberry32(11), zf = -0.003;
  NOTES.forEach(([t, sub, bg], i) => {
    const x = -w * 0.36 + (i % 3) * w * 0.33 + (rnd() - 0.5) * 0.05, y = (i < 3 ? 0.17 : -0.16) + (rnd() - 0.5) * 0.06, nw = 0.2 + rnd() * 0.06, nh = 0.22 + rnd() * 0.06;
    at(k, M(x, y, zf + 0.001 + i * 0.0003, 0, 0, (rnd() - 0.5) * 0.12), () => { fq(k, 0, 0, 0, nw, nh, 0, 'Z', lab(k, 'note' + i, 48, 54, { kind: 'price', name: t, sub, bg: 0x37474f, promo: false })); lat(k, sphereP(0.005, 0.0045, 3), [0xd50000, 0x1565c0, 0x2e7d32, 0xffd600][i % 4], { segs: 6, m: M(0, nh / 2 - 0.02, 0) }); });
  });
  fq(k, w * 0.38, -0.22, zf + 0.003, 0.12, 0.09, 0, 'Z', lab(k, 'boardphoto', 40, 30, { kind: 'card', bg: 0x8d6e63, picto: 'house', name: '1987', pc: 0xffffff }));
});
// Tête à perruque en polystyrène : crâne ovoïde, nez, oreilles, yeux peints (trait de cils, blanc, iris, pupille,
// sourcils), lèvres peintes, cou et socle. Perruque au carré : calotte d'épaisseur variable bordée par la ligne des
// cheveux (front, tempes, nuque), mèches peignées (bandes alternées, reflet en couronne), lisière rentrée contre le
// crâne, petite mèche collée sur la tempe.
S('head', (k, s, c) => {
  const w = s[0], h = s[1], dd = s[2], y0 = -h / 2, yc = y0 + 0.18, rx = w * 0.39, ry = h * 0.33, rz = dd * 0.4, hair = 0x5d4037, sn = Math.sin, cs = Math.cos;
  lat(k, [[0.06, y0], [0.062, y0 + 0.012], [0.035, y0 + 0.02, null, 'h'], [0.034, y0 + 0.06], [0.03, y0 + 0.1]], c, { segs: 12, bot: c });
  k.blob(0, yc, 0, rx, ry, rz, c, 14, 9);
  // nez : sections en demi-ellipse de l'arête au bout, dos noyé dans le visage (repère : z local vers le bas, y local vers l'avant)
  at(k, M(0, yc + 0.006, rz * 0.994, PI / 2), () => loft(k, [[0, 0.0035, 0.0015], [0.008, 0.0045, 0.0045], [0.016, 0.0055, 0.0075], [0.022, 0.0075, 0.0105], [0.026, 0.0085, 0.0095], [0.029, 0.008, 0.0055]].map(([z, hw, pr]) => ({ z, pts: Array.from({ length: 7 }, (_, i) => [hw * Math.cos(PI * i / 6), -0.005 + (pr + 0.005) * Math.sin(PI * i / 6)]) })), shade(c, 0.98), { c1: shade(c, 0.9) }));
  for (const sx of [-1, 1]) k.blob(sx * rx * 0.95, yc - 0.004, -0.004, 0.007, 0.02, 0.013, shade(c, 0.95), 5, 3); // oreilles
  // traits peints plaqués sur l'ellipsoïde du crâne (x, y vus de face ; sx, sy : étirement ; lift : décollement)
  const onS = (x, y, sx, sy, lift, fn) => {
    const z = rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - ((y - yc) / ry) ** 2)), n = new THREE.Vector3(x / rx ** 2, (y - yc) / ry ** 2, z / rz ** 2).normalize();
    at(k, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z).addScaledVector(n, lift), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n), new THREE.Vector3(sx, sy, 1)), fn);
  };
  const surf = (x, y, lift) => { const z = rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - ((y - yc) / ry) ** 2)), n = new THREE.Vector3(x / rx ** 2, (y - yc) / ry ** 2, z / rz ** 2).normalize(); return [x + n.x * lift, y + n.y * lift, z + n.z * lift]; };
  for (const sx of [-1, 1]) {
    const ex = sx * 0.024, ey = yc + 0.01;
    onS(ex, ey + 0.0012, 1.9, 0.85, 0.0005, () => disc(k, 0, 0, 0, 0.0072, 0x2b1d16, [0, 0, 1], 12)); // trait de cils
    onS(ex, ey, 1.75, 0.72, 0.0008, () => disc(k, 0, 0, 0, 0.0072, 0xf3eee8, [0, 0, 1], 12)); // blanc de l'œil
    onS(ex + sx * 0.001, ey + 0.0004, 1, 1, 0.0011, () => { disc(k, 0, 0, 0, 0.0043, 0x3d6a9e, [0, 0, 1], 10); disc(k, 0, 0, 0.0003, 0.0019, 0x0d0d0f, [0, 0, 1], 8); }); // iris, pupille
    sweep(k, [-1, -0.5, 0, 0.5, 1].map((u) => surf(ex + sx * u * 0.0125, ey + 0.017 + 0.0035 * (1 - u * u) - u * 0.0015, 0.0006)), 0.0011, 0x4e342e, { segs: 4 }); // sourcil
  }
  onS(0, yc - 0.0395, 2.2, 0.5, 0.0006, () => disc(k, 0, 0, 0, 0.006, 0xb8605d, [0, 0, 1], 12)); // lèvre supérieure
  onS(0, yc - 0.0428, 1.9, 0.62, 0.0007, () => disc(k, 0, 0, 0, 0.0058, 0xc9746f, [0, 0, 1], 12)); // lèvre inférieure
  onS(0, yc - 0.0411, 2.3, 0.07, 0.0009, () => disc(k, 0, 0, 0, 0.006, 0x6e3533, [0, 0, 1], 8)); // commissure
  // perruque : calotte entre le sommet (t = 0) et la ligne des cheveux e(a) (a = 0 : front, π : nuque) ; épaisseur
  // fine au front, volume sur les côtés et la nuque (carré)
  const bk = (a) => (1 - cs(a)) / 2, edge = (a) => 0.8 + 1.3 * Math.pow(bk(a), 0.6), ss = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const th = (t, a) => { const b = bk(a), tp = 1 - (1 - b) * (1 - ss((edge(a) - t) / 0.35)); return 0.0035 + tp * (0.004 + 0.009 * sn(t) * (0.7 + 0.3 * b) + 0.003 * b * sn(t)); };
  const hp = (t, a, d) => [(rx + d) * sn(t) * sn(a), yc + (ry + d) * cs(t), (rz + d) * sn(t) * cs(a)];
  const hn = (t, a, d) => { const p = hp(t, a, d), n = [p[0] / (rx + d) ** 2, (p[1] - yc) / (ry + d) ** 2, p[2] / (rz + d) ** 2], l = Math.hypot(...n) || 1; return l < 1e-6 ? [0, 1, 0] : n.map((v) => v / l); };
  const NU = 24, NV = 7, W = NU + 1, o = k.b.vertexCount, PP = [], NN = [];
  const put = (p, n, f) => { pv(k, ...p, ...n, L(shade(hair, f))); PP.push(p); NN.push(n); };
  for (let i = 0; i <= NV; i++) for (let j = 0; j <= NU; j++) {
    const a = j / NU * TAU, e = edge(a), t = e * i / NV, d = th(t, a);
    put(hp(t, a, d), t < 1e-6 ? [0, 1, 0] : hn(t, a, d), (j % 2 ? 0.88 : 1) * (1 + 0.22 * Math.exp(-(((t - 0.55) / 0.22) ** 2))) * (1 - 0.14 * (i / NV) ** 3));
  }
  for (let j = 0; j <= NU; j++) { // lisière : du bord de la calotte au crâne, un peu plus bas
    const a = j / NU * TAU, e = edge(a), p0 = hp(e, a, th(e, a)), p1 = hp(e + 0.03, a, -0.0008), n0 = hn(e, a, th(e, a)), dn = hp(e + 0.05, a, th(e, a)).map((v, q) => v - p0[q]), ld = Math.hypot(...dn) || 1;
    const nl = n0.map((v, q) => v * 0.7 + dn[q] / ld); const ll = Math.hypot(...nl) || 1;
    for (const p of [p0, p1]) put(p, nl.map((v) => v / ll), (j % 2 ? 0.88 : 1) * 0.86);
  }
  const tri = (a, b, c2) => { const g = cross3(PP[a], PP[b], PP[c2]), n = [0, 1, 2].map((q) => NN[a][q] + NN[b][q] + NN[c2][q]); if (dot3(g, n) >= 0) k.b.idx.push(o + a, o + b, o + c2); else k.b.idx.push(o + a, o + c2, o + b); };
  for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++) { const a = i * W + j; tri(a, a + 1, a + W + 1); tri(a, a + W + 1, a + W); }
  const LB = W * (NV + 1); for (let j = 0; j < NU; j++) { const a = LB + j * 2; tri(a, a + 2, a + 3); tri(a, a + 3, a + 1); }
  // mèche collée sur la tempe (part sous la calotte)
  const a0 = 1.25, e0 = edge(a0);
  sweep(k, [[-0.1, 0], [0.05, 0.04], [0.15, 0.1], [0.24, 0.2], [0.29, 0.3]].map(([dt, da]) => hp(e0 + dt, a0 - da, 0.0022)), (u) => 0.0032 * (1 - 0.7 * u), hair, { segs: 4 });
});

// ═════════════════════════ VÉHICULES ═════════════════════════
// interpolation lissée (smoothstep) dans une table [[z, v], …] à z croissants
function tab(T, z) { if (z <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (z <= T[i][0]) { const [a, va] = T[i - 1], [b, vb] = T[i], t = (z - a) / (b - a); return va + (vb - va) * t * t * (3 - 2 * t); } return T[T.length - 1][1]; }
// Polygone plan (trous possibles) : contour 2D projeté par map(p) → [x, y, z] ; normale n
function poly(k, outer, holes, map, n, c) {
  const tris = THREE.ShapeUtils.triangulateShape(outer.map((p) => new THREE.Vector2(p[0], p[1])), holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))));
  const P3 = outer.concat(...holes).map(map), col = L(c), o = k.b.vertexCount;
  for (const p of P3) pv(k, ...p, ...n, col);
  for (const t of tris) { const g = cross3(P3[t[0]], P3[t[1]], P3[t[2]]); if (dot3(g, n) >= 0) k.b.idx.push(o + t[0], o + t[1], o + t[2]); else k.b.idx.push(o + t[0], o + t[2], o + t[1]); }
}
// polygone convexe agrandi de d (onglets)
function grow(P, d) { const n = P.length, a2 = area2(P) > 0 ? 1 : -1; return P.map((p, i) => { const a = P[(i - 1 + n) % n], b = P[(i + 1) % n], e1 = [p[1] - a[1], a[0] - p[0]], e2 = [b[1] - p[1], p[0] - b[0]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1, m = [e1[0] / l1 + e2[0] / l2, e1[1] / l1 + e2[1] / l2], lm = Math.hypot(...m) || 1, cs = Math.max(0.4, (m[0] * e1[0] / l1 + m[1] * e1[1] / l1) / lm); return [p[0] + a2 * m[0] / lm * d / cs, p[1] + a2 * m[1] / lm * d / cs]; }); }
// tranches d'un polygone du plan (z, y) entre x0 et x1 (côté sd) : normales vers l'extérieur (ou vers le centre : inward)
function rims(k, P, x0, x1, sd, c, inward) {
  const n = P.length, cz = P.reduce((s, p) => s + p[0], 0) / n, cy = P.reduce((s, p) => s + p[1], 0) / n;
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n]; let nz = q[1] - p[1], ny = -(q[0] - p[0]); const l = Math.hypot(nz, ny) || 1; nz /= l; ny /= l;
    const out = nz * ((p[0] + q[0]) / 2 - cz) + ny * ((p[1] + q[1]) / 2 - cy) > 0; if (out === !!inward) { nz = -nz; ny = -ny; }
    const N = [0, ny, nz]; q4(k, [[sd * x0, p[1], p[0]], [sd * x0, q[1], q[0]], [sd * x1, q[1], q[0]], [sd * x1, p[1], p[0]]], [N, N, N, N], c);
  }
}
// Roue : pneu profilé (flancs bombés, épaulements), jante et enjoliveur ajouré, cache-moyeu ; axe x, sd = côté
function wheel(k, x, y, z, sd, R, W, rimC, slotsN = 8) {
  at(k, M(x, y, z, 0, 0, -sd * PI / 2), () => {
    const h = W / 2, b = R * 0.66;
    lat(k, [[b, -h * 0.86], [R * 0.82, -h * 0.97], [R * 0.95, -h * 0.9], [R * 0.99, -h * 0.72], [R, -h * 0.5], [R, h * 0.5], [R * 0.99, h * 0.72], [R * 0.95, h * 0.9], [R * 0.82, h * 0.97], [b, h * 0.86]], 0x1b1b1c, { segs: 18 });
    lat(k, [[b, h * 0.86], [b * 0.97, h * 0.93, rimC], [b * 0.9, h * 0.86], [b * 0.62, h * 0.8], [b * 0.32, h * 0.84], [b * 0.2, h * 0.9, 0x2a2b2d, 'h'], [0.001, h * 0.9, 0x2a2b2d]], rimC, { segs: 16 });
    for (let i = 0; i < slotsN; i++) { // ajours de l'enjoliveur
      const a = i / slotsN * TAU, ca = Math.cos(a), sa = Math.sin(a), r0 = b * 0.42, r1 = b * 0.8, t = 0.022, yy = h * 0.825;
      const P = [[ca * r0 - sa * t, yy, sa * r0 + ca * t], [ca * r1 - sa * t * 1.6, yy - 0.004, sa * r1 + ca * t * 1.6], [ca * r1 + sa * t * 1.6, yy - 0.004, sa * r1 - ca * t * 1.6], [ca * r0 + sa * t, yy, sa * r0 - ca * t]];
      q4(k, P, [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]], 0x0d0d0e);
    }
  });
}
const PLATE = (k, x, y, z, txt, f) => { // plaque d'immatriculation française (bandes bleues, caractères noirs)
  const s = f === 'Z' ? 1 : -1;
  fq(k, x, y, z, 0.52, 0.11, 0xffffff, f, lab(k, 'plate:' + txt, 96, 20, { kind: 'plain', bg: 0xffffff, fg: 0x111111, brand: txt }));
  for (const e of [-1, 1]) fq(k, x + s * e * 0.24, y, z + s * 0.0004, 0.04, 0.11, 0x1e3a9e, f);
};
const HWT = [[-2.08, 0.7], [-2.065, 0.77], [-2.04, 0.81], [-1.98, 0.835], [-1.85, 0.85], [1.85, 0.85], [1.98, 0.838], [2.04, 0.81], [2.065, 0.765], [2.08, 0.69]];
const YBT = [[-2.08, -0.5], [-1.95, -0.54], [-1.72, -0.56], [1.72, -0.56], [1.95, -0.53], [2.08, -0.49]];
const CAR = {
  berline: { roofR: -1.2, glR: -1.66, cabR: -1.2, out: [[1.0, 0.062], [0.74, 0.47], [-1.2, 0.47], [-1.66, 0.075], [-1.66, 0.062]], rear: [[-0.25, 0.085], [-1.165, 0.085], [-1.165, 0.3], [-1.06, 0.43], [-0.25, 0.43]], belt: [[-2.08, 0.0], [-2.0, 0.062], [-1.85, 0.08], [-1.2, 0.072], [0.95, 0.07], [1.5, 0.035], [1.95, -0.005], [2.08, -0.04]] },
  bicorps: { roofR: -1.25, glR: -1.94, cabR: -1.25, out: [[1.0, 0.062], [0.74, 0.47], [-1.25, 0.47], [-1.94, 0.14], [-1.94, 0.062]], rear: [[-0.25, 0.085], [-1.165, 0.085], [-1.165, 0.33], [-1.09, 0.43], [-0.25, 0.43]], belt: [[-2.08, 0.04], [-2.0, 0.125], [-1.94, 0.14], [-1.75, 0.105], [-1.25, 0.075], [0.95, 0.07], [1.5, 0.035], [1.95, -0.005], [2.08, -0.04]] },
  break: { roofR: -1.93, glR: -1.99, cabR: -1.25, open: true, out: [[1.0, 0.062], [0.74, 0.47], [-1.93, 0.465], [-1.99, 0.12], [-1.99, 0.062]], rear: [[-0.25, 0.085], [-1.165, 0.085], [-1.165, 0.43], [-0.25, 0.43]], q: [[-1.25, 0.085], [-1.84, 0.085], [-1.88, 0.37], [-1.82, 0.43], [-1.25, 0.43]], belt: [[-2.08, 0.05], [-2.0, 0.1], [-1.25, 0.075], [0.95, 0.07], [1.5, 0.035], [1.95, -0.005], [2.08, -0.04]] },
};
const FDLO = [[0.745, 0.085], [-0.17, 0.085], [-0.17, 0.43], [0.676, 0.43], [0.745, 0.324]];
const AXLES = [1.27, -1.33], WCY = -0.427, RA = 0.355, YFL = -0.42;
S('car', (k, s, c, d) => {
  const w = s[0], h = s[1], L2 = s[2];
  const hc = ((c >> 16) & 255) * 3 + ((c >> 8) & 255) * 5 + (c & 255) * 7, T = CAR[['berline', 'bicorps', 'break'][hc % 3]];
  const trim = [0x2b2d31, 0x4f4337, 0x34383f][(hc >> 2) % 3], seat = shade(trim, 1.35), carpet = shade(trim, 0.7), plastic = 0x232426, dark = shade(c, 0.82);
  const reach = Math.sqrt(RA * RA - (-0.56 - WCY) ** 2);
  // ── caisse : sections successives (demi-profil du dessous jusqu'au milieu du dessus) ──
  const region = (z) => (z > 1.0 ? 'bonnet' : z > 0.975 ? 'cowl' : z > T.cabR ? 'cab' : z > T.glR ? (T.open ? 'cab' : 'shelf') : 'trunk');
  const sec = (z) => {
    const hw = tab(HWT, z), yb = tab(YBT, z), belt = tab(T.belt, z), rg = region(z);
    let ar = null; for (const zw of AXLES) { const dz = z - zw; if (Math.abs(dz) < RA) { const y = WCY + Math.sqrt(RA * RA - dz * dz); if (y > yb + 0.001) ar = y; } }
    const yw = ar ?? yb, lip = Math.max(yw + 0.012, yb + 0.07), ych = Math.max(-0.13, lip + 0.035), yu = Math.max(belt - 0.07, ych + 0.03);
    const top = rg === 'cab' ? [[hw - 0.088, belt + 0.004], [hw - 0.105, YFL], [0, YFL]] : rg === 'shelf' ? [[hw - 0.088, belt + 0.004], [hw - 0.1, belt + 0.008], [0, belt + 0.01]] : [[hw - 0.075, belt + 0.006], [hw * 0.55, belt + 0.02], [0, belt + 0.026]];
    const P = [[0, yb], [0.55, yb], [0.55, yw], [hw - 0.03, yw], [hw - 0.006, lip], [hw, ych], [hw - 0.012, yu], [hw - 0.035, belt], ...top];
    const topC = rg === 'cab' ? [BLACK, trim, carpet] : rg === 'shelf' ? [BLACK, carpet, carpet] : rg === 'cowl' ? [BLACK, BLACK, BLACK] : [c, c, c];
    return { z, P, C: [0x151515, 0x0b0b0b, 0x0e0e0e, dark, c, c, c, ...topC] };
  };
  const zs = [-2.08, -2.07, -2.05, -2.02, -1.97, -1.9, -1.8, 2.08, 2.07, 2.05, 2.02, 1.97, 1.9, 1.8, 1.0, 0.99, 0.976, 0.968, T.cabR + 0.012, T.cabR - 0.012, T.glR + 0.01, T.glR - 0.01, 0.6, 0.25, -0.1, -0.45, -0.8];
  for (const zw of AXLES) for (const f of [-1.02, -0.92, -0.8, -0.62, -0.4, -0.15, 0.15, 0.4, 0.62, 0.8, 0.92, 1.02]) zs.push(zw + f * reach);
  zs.sort((a, b) => a - b); const st = []; for (const z of zs) if (z >= -2.08 && z <= 2.08 && (!st.length || z - st[st.length - 1].z > 0.004)) st.push(sec(z));
  const nP = st[0].P.length, HARD = new Set([1, 2, 3, 7, 8]);
  // tronçons séparés aux cloisons (tablier, dossier, lunette) : arêtes vives transversales
  const cuts = [0.976, 0.968, T.cabR + 0.012, T.cabR - 0.012, T.glR + 0.01, T.glR - 0.01], runs = [[]];
  for (const S1 of st) { runs[runs.length - 1].push(S1); if (cuts.some((zc) => Math.abs(zc - S1.z) < 1e-6)) runs.push([S1]); }
  for (const run of runs) if (run.length > 1) for (const sd of [1, -1]) for (let j = 0; j < nP - 1; j++) {
    const base = k.b.vertexCount;
    for (let i = 0; i < run.length; i++) {
      const P = run[i].P, prev = run[Math.max(0, i - 1)], next = run[Math.min(run.length - 1, i + 1)];
      const e = (a) => { const p = P[a], q = P[a + 1], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return l < 1e-6 ? null : [dy / l, -dx / l]; };
      for (const jj of [j, j + 1]) {
        let n2 = e(j) || [0, -1];
        if (jj === 0) n2 = [0, -1]; else if (jj === nP - 1) n2 = [0, 1];
        else if (!HARD.has(jj)) { const a = e(jj - 1) || n2, b = e(jj) || n2, m = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(...m) || 1; n2 = [m[0] / l, m[1] / l]; }
        const dz = next.z - prev.z || 1, dxdz = (next.P[jj][0] - prev.P[jj][0]) / dz, dydz = (next.P[jj][1] - prev.P[jj][1]) / dz;
        const n3 = [n2[0], n2[1], -(n2[0] * dxdz + n2[1] * dydz)], l3 = Math.hypot(...n3) || 1;
        pv(k, sd * P[jj][0], P[jj][1], run[i].z, sd * n3[0] / l3, n3[1] / l3, n3[2] / l3, L(run[i].C[j]));
      }
    }
    for (let i = 0; i < run.length - 1; i++) { const a = base + i * 2, b = a + 1, c2 = a + 3, d2 = a + 2; if (sd > 0) k.b.idx.push(a, b, c2, a, c2, d2); else k.b.idx.push(a, c2, b, a, d2, c2); }
  }
  for (const [S0, nz] of [[st[0], -1], [st[st.length - 1], 1]]) { // faces avant / arrière
    const half = S0.P.filter((p, i) => i === 0 || Math.hypot(p[0] - S0.P[i - 1][0], p[1] - S0.P[i - 1][1]) > 1e-5);
    const full = half.concat(half.slice(1, -1).reverse().map((p) => [-p[0], p[1]]));
    poly(k, full, [], (p) => [p[0], p[1], S0.z], [0, 0, nz], c);
  }
  // ── pavillon, montants, encadrements ──
  const X1 = 0.825, X0 = 0.795, holes = [FDLO, T.rear].concat(T.q ? [T.q] : []);
  for (const sd of [1, -1]) {
    poly(k, T.out, holes, (p) => [sd * X1, p[1], p[0]], [sd, 0, 0], c);
    poly(k, T.out, holes, (p) => [sd * X0, p[1], p[0]], [-sd, 0, 0], trim);
    rims(k, T.out, X0, X1, sd, BLACK, false);
    for (const H of holes) { rims(k, H, X0, X1, sd, 0x111111, true); poly(k, grow(H, 0.016), [H], (p) => [sd * (X1 + 0.001), p[1], p[0]], [sd, 0, 0], 0x161718); }
    poly(k, [[-0.166, 0.07], [-0.254, 0.07], [-0.254, 0.446], [-0.166, 0.446]], [], (p) => [sd * (X1 + 0.0015), p[1], p[0]], [sd, 0, 0], 0x161718); // montant central noir
    poly(k, [[0.761, 0.075], [0.875, 0.075], [0.761, 0.31]], [], (p) => [sd * (X1 + 0.0015), p[1], p[0]], [sd, 0, 0], 0x161718); // triangle de rétroviseur
    if (T.q) poly(k, T.q, [], (p) => [sd * 0.806, p[1], p[0]], [sd, 0, 0], 0x1c252b); // custode teintée (break)
  }
  // pavillon bombé (dessus carrosserie, ciel de toit dessous, tranches avant/arrière)
  {
    const zF = 0.74, zR = T.roofR, NX = 8, NZ = 9, yR = (x, z) => { const e = Math.min(1, Math.abs(x) / X1); let y = 0.466 + 0.064 * Math.pow(1 - e * e, 0.7); const m = Math.min(z - zR, zF - z); if (m < 0.08) y -= 0.024 * (1 - m / 0.08) ** 2; return y; };
    const base = k.b.vertexCount, G = [];
    for (let i = 0; i <= NZ; i++) { const z = zF + (zR - zF) * i / NZ; for (let j = 0; j <= NX; j++) { const x = X1 * (1 - 2 * j / NX); G.push([x, yR(x, z), z]); } }
    for (let i = 0; i <= NZ; i++) for (let j = 0; j <= NX; j++) {
      const p = G[i * (NX + 1) + j], a = G[i * (NX + 1) + Math.min(NX, j + 1)], b = G[i * (NX + 1) + Math.max(0, j - 1)], u = G[Math.min(NZ, i + 1) * (NX + 1) + j], dn = G[Math.max(0, i - 1) * (NX + 1) + j];
      let n = cross3([0, 0, 0], [b[0] - a[0], b[1] - a[1], b[2] - a[2]], [u[0] - dn[0], u[1] - dn[1], u[2] - dn[2]]); if (n[1] < 0) n = n.map((v) => -v); const l = Math.hypot(...n) || 1;
      pv(k, ...p, n[0] / l, n[1] / l, n[2] / l, L(c));
    }
    for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) { const a = base + i * (NX + 1) + j, b = a + 1, c2 = a + NX + 2, d2 = a + NX + 1; const g = cross3(G[a - base], G[b - base], G[d2 - base]); if (g[1] >= 0) k.b.idx.push(a, b, c2, a, c2, d2); else k.b.idx.push(a, c2, b, a, d2, c2); }
    q4(k, [[X0, 0.436, zF - 0.01], [-X0, 0.436, zF - 0.01], [-X0, 0.436, zR + 0.01], [X0, 0.436, zR + 0.01]], [[0, -1, 0], [0, -1, 0], [0, -1, 0], [0, -1, 0]], 0xa39f97);
    for (const [z, nz] of [[zF, 1], [zR, -1]]) for (let j = 0; j < NX; j++) { const x0 = X1 * (1 - 2 * j / NX), x1 = X1 * (1 - 2 * (j + 1) / NX); q4(k, [[x0, 0.436, z], [x1, 0.436, z], [x1, yR(x1, z), z], [x0, yR(x0, z), z]], [[0, 0, nz], [0, 0, nz], [0, 0.6, nz], [0, 0.6, nz]], c); }
  }
  // vitrages avant / arrière : verre teinté (matériau opaque) dont le dégradé peint le reflet du plafond, reflets
  // obliques, bandeaux sérigraphiés noirs aux bords ; de A (bas) à B (haut) sur la largeur intérieure, so : sens de la
  // normale (+1 : vers l'avant), fr : part des bandeaux noirs. Vu de l'intérieur (faces arrière), le verre disparaît.
  const pane = (A, B, so, fr) => {
    const dz = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dz, dy), n = [0, -so * dz / l, so * dy / l];
    const P = (u, x, off) => [x, A[1] + dy * u - n[1] * off, A[0] + dz * u - n[2] * off];
    const strip = (u0, u1, c0, c1, x0, x1, off) => q4(k, [P(u0, x1, off), P(u0, x0, off), P(u1, x0, off), P(u1, x1, off)], [n, n, n, n], [c0, c0, c1, c1]);
    if (fr) { strip(0, fr, BLACK, BLACK, -X0, X0, 0.003); strip(1 - fr, 1, BLACK, BLACK, -X0, X0, 0.003); }
    strip(fr, 1 - fr, 0x0a0e11, 0x1f2c35, -X0, X0, 0.003);
    for (const [xa, xb, sh, c0] of [[0.02, 0.24, 0.26, 0x1c2830], [0.33, 0.39, 0.26, 0x26343e]]) q4(k, [P(fr + 0.04, xb, 0.0024), P(fr + 0.04, xa, 0.0024), P(1 - fr - 0.04, xa + sh, 0.0024), P(1 - fr - 0.04, xb + sh, 0.0024)], [n, n, n, n], [c0, c0, shade(c0, 1.25), shade(c0, 1.25)]);
  };
  pane([1.0, 0.075], [0.745, 0.465], 1, 0); pane(T.out[3], T.out[2], -1, 0.07);
  // bandeaux sérigraphiés du pare-brise, grille d'auvent, essuie-glaces
  const wsY = (z) => 0.075 + (1.0 - z) / 0.26 * 0.39;
  q4(k, [[X0, 0.075, 1.0], [-X0, 0.075, 1.0], [-X0, 0.13, 0.963], [X0, 0.13, 0.963]], [[0, 0.83, 0.55], [0, 0.83, 0.55], [0, 0.83, 0.55], [0, 0.83, 0.55]], 0x0c0c0d);
  q4(k, [[X0, wsY(0.775), 0.775], [-X0, wsY(0.775), 0.775], [-X0, 0.47, 0.745], [X0, 0.47, 0.745]], [[0, 0.83, 0.55], [0, 0.83, 0.55], [0, 0.83, 0.55], [0, 0.83, 0.55]], 0x0c0c0d);
  box(k, 0, 0.068, 1.025, 1.56, 0.018, 0.05, 0x141516);
  for (const sx of [-0.12, 0.42]) at(k, M(sx, 0.085, 1.0, 0, 0.12, 0), () => { box(k, 0, 0, 0, 0.6, 0.012, 0.012, 0x101010); box(k, -0.28, -0.006, 0.02, 0.06, 0.02, 0.03, 0x101010); });
  // ── intérieur ──
  box(k, 0, 0.03, 0.8, 1.56, 0.14, 0.34, 0x202224, { skip: 'z' }); // planche de bord
  rbox(k, 0, -0.14, 0.76, 1.5, 0.2, 0.18, 0.03, 0x1c1d1f);
  rbox(k, 0.37, 0.125, 0.69, 0.36, 0.06, 0.13, 0.02, 0x18191a); // casquette des compteurs
  for (const gx of [0.29, 0.45]) disc(k, gx, 0.08, 0.624, 0.045, 0x8f969b, [0, 0.2, -1], 12, 0.036);
  rbox(k, 0, -0.06, 0.64, 0.22, 0.2, 0.04, 0.008, 0x161718); fq(k, 0, 0.0, 0.619, 0.17, 0.04, 0, 'z', lab(k, 'carradio', 64, 16, { kind: 'sign', name: 'FM 98.4', bg: 0x101010, fg: 0x76ff03, accent: 0x101010 }));
  for (const vx of [-0.55, -0.12, 0.12, 0.62]) fq(k, vx, 0.05, 0.629, 0.12, 0.035, 0x070707, 'z');
  const cd = new THREE.Vector3(0, 0.42, -0.91).normalize(), wc = new THREE.Vector3(0.37, 0.04, 0.53); // volant
  { const U = new THREE.Vector3(1, 0, 0), V = new THREE.Vector3().crossVectors(cd, U), ring = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; ring.push(wc.clone().addScaledVector(U, Math.cos(a) * 0.18).addScaledVector(V, Math.sin(a) * 0.18).toArray()); } sweep(k, ring, 0.016, 0x151515, { closed: true, segs: 6 });
    for (const a of [PI / 2, PI * 7 / 6, -PI / 6]) sweep(k, [wc.toArray(), wc.clone().addScaledVector(U, Math.cos(a) * 0.17).addScaledVector(V, Math.sin(a) * 0.17).toArray()], 0.012, 0x1a1a1a, { segs: 4 });
    sweep(k, [wc.clone().addScaledVector(cd, -0.02).toArray(), wc.clone().addScaledVector(cd, 0.04).toArray()], 0.045, 0x1e1f21, { segs: 10, caps: true });
    sweep(k, [wc.toArray(), wc.clone().addScaledVector(cd, -0.25).toArray()], 0.03, 0x1a1b1c, { segs: 8 }); }
  rbox(k, 0, -0.34, 0.33, 0.18, 0.12, 0.5, 0.03, 0x1e1f21); sweep(k, [[0, -0.28, 0.42], [0, -0.17, 0.38]], 0.007, 0x2a2a2a, { segs: 5 }); lat(k, sphereP(0.025, -0.165), 0x111111, { segs: 8, m: M(0, 0, 0.38) });
  for (const sx of [-0.37, 0.37]) { // sièges avant
    rbox(k, sx, -0.31, 0.1, 0.46, 0.11, 0.48, 0.035, seat);
    at(k, M(sx, -0.02, -0.17, -0.24), () => { rbox(k, 0, 0, 0, 0.46, 0.56, 0.11, 0.04, seat); for (const px of [-0.07, 0.07]) cyl(k, px, 0.31, 0, 0.006, 0.08, CHROME, 'y', 5); rbox(k, 0, 0.39, -0.01, 0.26, 0.15, 0.085, 0.035, seat); });
  }
  rbox(k, 0, -0.31, -0.78, 1.32, 0.11, 0.46, 0.035, seat); // banquette
  at(k, M(0, -0.03, -1.06, -0.3), () => { rbox(k, 0, 0, 0, 1.32, 0.52, 0.11, 0.04, seat); for (const hx of [-0.42, 0.42]) rbox(k, hx, 0.33, -0.01, 0.24, 0.13, 0.08, 0.03, seat); });
  if (!T.open) for (const sx of [-0.45, 0.45]) disc(k, sx, tab(T.belt, -1.35) + 0.012, -1.35, 0.06, 0x111111, [0, 1, 0], 10);
  rbox(k, 0, 0.405, 0.71, 0.22, 0.055, 0.025, 0.012, 0x1a1a1a); cyl(k, 0, 0.44, 0.72, 0.008, 0.04, 0x1a1a1a, 'y', 5); // rétroviseur intérieur
  for (const sx of [-0.35, 0.35]) at(k, M(sx, 0.443, 0.665, 0.15), () => box(k, 0, 0, 0, 0.34, 0.012, 0.14, 0xb5afa4));
  // ── face avant ──
  const bumpC = T === CAR.berline ? c : 0x262729, bsec = rrect(0.075, 0.15, 0.03, 2, -0.005, 0).map(([u, v]) => [u, v]);
  const front = rpath([[-0.828, -0.445, 1.75], [-0.826, -0.445, 1.92], [-0.775, -0.445, 2.01], [-0.6, -0.445, 2.045], [0, -0.445, 2.052], [0.6, -0.445, 2.045], [0.775, -0.445, 2.01], [0.826, -0.445, 1.92], [0.828, -0.445, 1.75]], 0.08, 3);
  sweep(k, front, 1, bumpC, { sec: bsec, caps: true });
  sweep(k, front.map(([x, y, z]) => [x, y + 0.01, z]), 1, 0x1b1c1d, { sec: rrect(0.02, 0.03, 0.008, 1, 0.03, 0), caps: true });
  rbox(k, 0, -0.205, 2.072, 0.6, 0.15, 0.03, 0.012, 0x101112);
  for (let i = 0; i < 4; i++) box(k, 0, -0.255 + i * 0.033, 2.088, 0.56, 0.008, 0.004, 0x60666b);
  at(k, M(0, -0.2, 2.09, 0, 0, PI / 4), () => rbox(k, 0, 0, 0, 0.04, 0.04, 0.008, 0.003, CHROME));
  for (const sx of [-1, 1]) {
    rbox(k, sx * 0.47, -0.2, 2.07, 0.3, 0.13, 0.032, 0.01, 0x8d959a);
    fq(k, sx * 0.47, -0.2, 2.0865, 0.28, 0.112, 0xd9e4ea);
    for (const ox of [-0.07, 0.07]) { disc(k, sx * 0.47 + ox, -0.2, 2.087, 0.042, 0xb4c1c8, [0, 0, 1], 12); disc(k, sx * 0.47 + ox, -0.2, 2.0874, 0.012, 0xf7f7f2, [0, 0, 1], 8); }
    at(k, M(sx * 0.665, -0.2, 2.048, 0, sx * 0.55, 0), () => rbox(k, 0, 0, 0, 0.09, 0.13, 0.03, 0.01, 0xff9800));
    disc(k, sx * 0.5, -0.47, 2.0825, 0.032, 0xe8eef2, [0, 0, 1], 10, 0); disc(k, sx * 0.5, -0.47, 2.082, 0.04, 0x161616, [0, 0, 1], 10, 0.031);
    fq(k, sx * 0.845, -0.05, 1.6, 0.04, 0.018, 0xff8f00, sx > 0 ? 'X' : 'x');
  }
  PLATE(k, 0, -0.445, 2.0875, d.plate || 'HL-000-AA', 'Z');
  // ── face arrière ──
  const back = rpath([[0.828, -0.44, -1.75], [0.826, -0.44, -1.92], [0.775, -0.44, -2.01], [0.6, -0.44, -2.045], [0, -0.44, -2.052], [-0.6, -0.44, -2.045], [-0.775, -0.44, -2.01], [-0.826, -0.44, -1.92], [-0.828, -0.44, -1.75]], 0.08, 3);
  sweep(k, back, 1, bumpC, { sec: bsec, caps: true });
  const ty = T === CAR.break ? -0.06 : -0.115;
  for (const sx of [-1, 1]) {
    rbox(k, sx * 0.55, ty, -2.07, 0.4, 0.15, 0.03, 0.01, 0x2a1414);
    fq(k, sx * 0.62, ty, -2.0865, 0.24, 0.13, 0xb3171c, 'z'); fq(k, sx * 0.455, ty, -2.0865, 0.075, 0.13, 0xff8f00, 'z'); fq(k, sx * 0.39, ty, -2.0865, 0.045, 0.13, 0xe9e9e9, 'z');
    for (let i = 0; i < 3; i++) fq(k, sx * 0.55, ty - 0.045 + i * 0.045, -2.087, 0.38, 0.004, 0x3a0d0d, 'z');
  }
  PLATE(k, 0, -0.27, -2.0875, d.plate || 'HL-000-AA', 'z');
  box(k, 0, -0.2, -2.085, 0.1, 0.012, 0.02, 0x1a1a1a);
  rbox(k, 0, ty + 0.02, -2.081, 0.07, 0.025, 0.006, 0.003, CHROME);
  cyl(k, 0.52, -0.53, -1.98, 0.028, 0.2, 0x3a3b3c, 'z', 10); disc(k, 0.52, -0.53, -2.0802, 0.022, 0x0a0a0a, [0, 0, -1], 10);
  // ── flancs : poignées, baguettes, jours de portes, trappe à carburant, rétroviseurs ──
  const sideX = (z, y) => { const P = sec(z).P; for (let i = 4; i < 7; i++) { const a = P[i], b = P[i + 1]; if (y >= a[1] && y <= b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1] || 1); } return P[5][0]; };
  for (const sd of [1, -1]) {
    for (const zh of [-0.07, -0.95]) at(k, M(sd * (sideX(zh, 0.005) + 0.004), 0.005, zh), () => rbox(k, 0, 0, 0, 0.012, 0.026, 0.13, 0.004, 0x1c1c1d));
    rbox(k, sd * (sideX(-0.06, -0.2) + 0.004), -0.2, -0.06, 0.012, 0.035, 1.82, 0.004, 0x1d1e1f);
    for (const zg of [0.885, -0.21, -0.985]) { // jours de portes
      const pts = []; for (let i = 0; i <= 6; i++) { const y = -0.48 + i * (0.06 + 0.48) / 6; pts.push([sd * (sideX(zg, y) + 0.0012), y]); }
      for (let i = 0; i < 6; i++) q4(k, [[pts[i][0], pts[i][1], zg - 0.0022], [pts[i][0], pts[i][1], zg + 0.0022], [pts[i + 1][0], pts[i + 1][1], zg + 0.0022], [pts[i + 1][0], pts[i + 1][1], zg - 0.0022]], [[sd, 0, 0], [sd, 0, 0], [sd, 0, 0], [sd, 0, 0]], 0x0a0a0a);
    }
    at(k, M(sd * 0.86, 0.14, 0.75, 0, -sd * 0.08, 0), () => { rbox(k, 0, 0, 0, 0.062, 0.095, 0.15, 0.025, c); fq(k, 0, 0, -0.0756, 0.05, 0.08, 0x31404a, 'z'); });
    box(k, sd * 0.828, 0.13, 0.78, 0.012, 0.05, 0.05, 0x161718);
  }
  for (const [zz, yy, ww, hh] of [[-1.72, 0.03, 0.1, 0.003], [-1.72, -0.07, 0.1, 0.003], [-1.67, -0.02, 0.003, 0.1], [-1.77, -0.02, 0.003, 0.1]]) fq(k, -(sideX(-1.72, -0.02) + 0.0012), yy, zz, ww, hh, 0x0a0a0a, 'x');
  // antenne
  sweep(k, [[0.3, 0.522, -0.95], [0.3, 0.71, -1.12]], 0.0022, 0x111111, { segs: 4 }); disc(k, 0.3, 0.521, -0.95, 0.012, 0x111111, [0, 1, 0], 8);
  // ── roues ──
  for (const zw of AXLES) for (const sd of [1, -1]) wheel(k, sd * 0.722, WCY, zw, sd, 0.295, 0.185, T === CAR.bicorps ? 0x34373a : 0xb6bbc0);
  k.meta.headlights = [[-0.47, -0.2, 2.09], [0.47, -0.2, 2.09]];
  k.meta.windows = [{ x: -w * 0.445, y: h * 0.17, z: -L2 * 0.05, w: L2 * 0.46, h: h * 0.26, side: -1 }, { x: w * 0.445, y: h * 0.17, z: -L2 * 0.05, w: L2 * 0.46, h: h * 0.26, side: 1 }];
});

