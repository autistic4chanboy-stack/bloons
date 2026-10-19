// Personnages façon « horreur sur console 32 bits » (fin des années 90) : corps en peu de polygones (300 à 1 200
// triangles), silhouettes lisibles, proportions d'adulte justes (7,3 têtes, épaules, bassin, bras jusqu'à mi-cuisse),
// d'enfant pour Lucie ; visages, tenues, cheveux et fourrures peints en basse définition dans un atlas partagé
// (chartex.js : texels nets, couleurs 15 bits tramées, teinte par sommet). Un seul mesh à squelette (THREE.SkinnedMesh)
// et un seul matériau par personnage : un appel de dessin. Les os gardent leurs noms (hips, torso, neck, head, armL/R,
// elbowL/R, handL/R, legL/R, kneeL/R, footL/R, propR ; « L » du côté −x) : animateHumanoid et toutes les poses du jeu
// sont inchangées. Touche d'époque réservée aux personnages, réglable (PS1) : sommets calés sur une grille d'écran basse
// définition et texture en partie affine (léger flottement). Unités du corps : 1,78 m (échelle = taille).
import * as THREE from 'three';
import { ENV, patchZone } from '../engine/materials.js';
import * as TX from './chartex.js';

// Réglages de la touche d'époque (constantes lues à la compilation des matériaux) :
//  snap : lignes de la grille d'écran virtuelle où se calent les sommets (0 : désactivé ; 360 ≈ un léger tremblement)
//  affine : part de placage affine de la texture (0 : correct en perspective, 1 : flottement franc des vieilles consoles)
export const PS1 = { snap: 360, affine: 0.35 };

// ───────────────────────── outils ─────────────────────────
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const G = (d, s) => Math.exp(-(d * d) / (s * s));
const lerp = (a, b, t) => a + (b - a) * t;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => scl(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const { mul, mix } = TX;
// tissus : jamais d'un noir absolu (la lampe doit en révéler les plis)
const cloth = (c) => { const f = (s) => Math.max(0x1f, (c >> s) & 255); return (f(16) << 16) | (f(8) << 8) | f(0); };
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const _c = new THREE.Color();
const TAU = Math.PI * 2;

// Anneau [y, a (demi-largeur x), bf (demi-profondeur avant, +z), bb (arrière), zc, n (superellipse), xc] ; point de
// l'anneau dans la direction θ (vrai angle autour de l'axe ; 0 : l'avant +z, π/2 : le côté +x)
const R7 = (q) => [q[0], q[1], q[2], q[3] ?? q[2], q[4] ?? 0, q[5] ?? 2, q[6] ?? 0];
function ringR(q, th) { const s = Math.abs(Math.sin(th)), c = Math.cos(th), b = c >= 0 ? q[2] : q[3], n = q[5]; return Math.pow(Math.pow(s / q[1], n) + Math.pow(Math.abs(c) / b, n), -1 / n); }
function ringP(q, th, off = 0) { const r = ringR(q, th) + off; return [q[6] + r * Math.sin(th), q[0], q[4] + r * Math.cos(th)]; }
function secAt(R, y) {
  if (y <= R[0][0]) return R[0]; const L = R[R.length - 1]; if (y >= L[0]) return L;
  let i = 0; while (R[i + 1][0] < y) i++;
  const A = R[i], Q = R[i + 1], t = (y - A[0]) / (Q[0] - A[0]);
  return A.map((v, k) => lerp(v, Q[k], t));
}
const colsAt = (seg, th0) => Array.from({ length: seg + 1 }, (_, c) => th0 + TAU * c / seg);
// Tube d'anneaux (R par y croissant) : cols : angles des colonnes (couture dupliquée), us / vs : coordonnées de texture
// (texels de la case) de chaque colonne / anneau ; def(p, r, c, θ) : déformation ; c0 / c1 : éventail sur le premier /
// dernier anneau (true : centroïde, ou [x, y, z]) ; uc0 / uc1 : uv du centre de l'éventail
function tube(R, cols, us, vs, o = {}) {
  const p = [], uv = [], ix = [], nc = cols.length;
  for (let r = 0; r < R.length; r++) for (let c = 0; c < nc; c++) {
    let v = ringP(R[r], cols[c], o.off ? o.off(r, c) : 0); if (o.def) v = o.def(v, r, c, cols[c]);
    p.push(v[0], v[1], v[2]); uv.push(us[c], vs[r]);
  }
  for (let r = 0; r < R.length - 1; r++) for (let c = 0; c < nc - 1; c++) { const a = r * nc + c, b = a + 1; ix.push(a, b, a + nc, b, b + nc, a + nc); }
  const cap = (r, pt, top, puv) => {
    if (pt === true) { pt = [0, 0, 0]; for (let c = 0; c < nc - 1; c++) for (let k = 0; k < 3; k++) pt[k] += p[(r * nc + c) * 3 + k] / (nc - 1); }
    const ci = p.length / 3; p.push(pt[0], pt[1], pt[2]); uv.push(...(puv || [us[(nc - 1) >> 1], vs[r]]));
    for (let c = 0; c < nc - 1; c++) { const a = r * nc + c; if (top) ix.push(ci, a, a + 1); else ix.push(ci, a + 1, a); }
  };
  if (o.c0) cap(0, o.c0, false, o.uc0); if (o.c1) cap(R.length - 1, o.c1, true, o.uc1);
  return { p, i: ix, uv };
}
// Loft le long d'anneaux orientés : [{c : centre, ax : axe « largeur », az : axe « avant » (θ = 0), rx, rz, n}] ;
// uvf(r, c) → [u, v] ; capA / capB : bouchons (pointe [x, y, z] ou true)
function loftF(rings, seg, uvf, capA, capB, th0 = -Math.PI) {
  const p = [], uv = [], ix = [], nc = seg + 1;
  rings.forEach((q, r) => { const n = q.n || 2; for (let c = 0; c < nc; c++) { const th = th0 + TAU * c / seg, s = Math.sin(th), co = Math.cos(th), X = q.rx * Math.sign(s) * Math.abs(s) ** (2 / n), Z = q.rz * Math.sign(co) * Math.abs(co) ** (2 / n); p.push(q.c[0] + q.ax[0] * X + q.az[0] * Z, q.c[1] + q.ax[1] * X + q.az[1] * Z, q.c[2] + q.ax[2] * X + q.az[2] * Z); uv.push(...uvf(r, c)); } });
  for (let r = 0; r < rings.length - 1; r++) for (let c = 0; c < seg; c++) { const a = r * nc + c, b = a + 1; ix.push(a, b, a + nc, b, b + nc, a + nc); }
  const cap = (r, pt, end) => { if (pt === true) pt = rings[r].c; const ci = p.length / 3; p.push(...pt); uv.push(...uvf(r, seg >> 1)); for (let c = 0; c < seg; c++) { const a = r * nc + c; if (end) ix.push(ci, a, a + 1); else ix.push(ci, a + 1, a); } };
  if (capA) cap(0, capA, false); if (capB) cap(rings.length - 1, capB, true);
  return { p, i: ix, uv };
}
// boîte (centre, demi-tailles) à faces plates ; uv : rectangle [u0, v0, u1, v1] de la case pour chaque face
function box(c, h, uvr = [1, 1, 15, 15]) {
  const p = [], uv = [], ix = [];
  const F = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  for (const [n, u, v] of F) {
    const b = p.length / 3;
    for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { p.push(c[0] + (n[0] + u[0] * a + v[0] * bb) * h[0], c[1] + (n[1] + u[1] * a + v[1] * bb) * h[1], c[2] + (n[2] + u[2] * a + v[2] * bb) * h[2]); uv.push(a < 0 ? uvr[0] : uvr[2], bb < 0 ? uvr[3] : uvr[1]); }
    ix.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { p, i: ix, uv };
}
const twoSided = (s) => { const n = s.p.length / 3, i2 = []; for (let k = 0; k < s.i.length; k += 3) i2.push(s.i[k] + n, s.i[k + 2] + n, s.i[k + 1] + n); return { p: s.p.concat(s.p), i: s.i.concat(i2), uv: s.uv.concat(s.uv), split: n }; };
// triangles orientés vers l'extérieur d'un point intérieur (nez, oreilles, petites pièces facettées)
function facets(pts, tris, uvs, inside) {
  const p = [], uv = [], ix = [];
  for (const t of tris) {
    const [a, b, c] = t.map((k) => pts[k]), n = cross(sub(b, a), sub(c, a)), m = scl(add3(add3(a, b), c), 1 / 3);
    const o = dot(n, sub(m, inside)) >= 0 ? t : [t[0], t[2], t[1]];
    for (const k of o) { const q = p.length / 3; p.push(...pts[k]); uv.push(...uvs[k]); ix.push(q); }
  }
  return { p, i: ix, uv };
}
// normales lissées (sommets confondus soudés : coutures de texture sans arête visible) ou plates
function normals(p, ix, flat, split = 1e9) {
  const n = new Float32Array(p.length), key = flat ? null : new Map(), acc = [];
  const kOf = (i) => Math.round(p[i * 3] * 2e4) + ',' + Math.round(p[i * 3 + 1] * 2e4) + ',' + Math.round(p[i * 3 + 2] * 2e4) + (i >= split ? 'b' : '');
  const id = new Int32Array(p.length / 3);
  if (!flat) for (let i = 0; i < p.length / 3; i++) { const k = kOf(i); let j = key.get(k); if (j === undefined) { j = acc.length / 3; key.set(k, j); acc.push(0, 0, 0); } id[i] = j; }
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (flat) { for (const q of [a, b, c]) { n[q] += nx; n[q + 1] += ny; n[q + 2] += nz; } }
    else for (const q of [ix[t], ix[t + 1], ix[t + 2]]) { const j = id[q] * 3; acc[j] += nx; acc[j + 1] += ny; acc[j + 2] += nz; }
  }
  if (!flat) for (let i = 0; i < p.length / 3; i++) { const j = id[i] * 3; n[i * 3] = acc[j]; n[i * 3 + 1] = acc[j + 1]; n[i * 3 + 2] = acc[j + 2]; }
  for (let k = 0; k < n.length; k += 3) { const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1; n[k] /= l; n[k + 1] /= l; n[k + 2] /= l; }
  return n;
}

// Accumulateur de géométrie skinnée. add(surface {p, i, uv (texels de la case)}, case de l'atlas (null : blanc),
// {m : Matrix4 de placement (pose de liaison), c : couleur (teinte des texels teintés), r : rugosité, mt : métal,
// e : émission, b : os, ou w : fn(x, y, z) → [[os, poids]…], flat : facettes, nb : pièce ignorée pour la profondeur du dos}).
// zb : z minimal des sommets du bassin, du torse, du cou et de la tête au-dessus des hanches (personnage couché sur le dos)
class Kit {
  constructor(pg = 0) { this.pg = pg; this.P = []; this.N = []; this.U = []; this.C = []; this.E = []; this.S = []; this.W = []; this.I = []; this.zb = 0; this.tiles = []; this.y0 = 0.8; }
  use(t) { if (t && !this.tiles.includes(t)) { this.tiles.push(t); TX.acquire(t); } return t; } // retenue dès la construction
  add(s, t, o) {
    t = this.use(t || TX.mat('white', this.pg));
    let p = s.p.slice(), ix = s.i, uv = s.uv;
    const m = o.m;
    if (m) {
      const e = m.elements;
      for (let k = 0; k < p.length; k += 3) { const x = p[k], y = p[k + 1], z = p[k + 2]; p[k] = e[0] * x + e[4] * y + e[8] * z + e[12]; p[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; p[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
      if (m.determinant() < 0) { ix = ix.slice(); for (let k = 0; k < ix.length; k += 3) { const q = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = q; } }
    }
    if (o.flat) { const p2 = [], u2 = []; for (const q of ix) { p2.push(p[q * 3], p[q * 3 + 1], p[q * 3 + 2]); u2.push(uv[q * 2], uv[q * 2 + 1]); } p = p2; uv = u2; ix = p.map((_, i) => i).slice(0, p.length / 3); }
    const n = normals(p, ix, !!o.flat, o.flat ? 1e9 : s.split ?? 1e9), base = this.P.length / 3;
    _c.setHex(o.c ?? 0xffffff); const cr = _c.r, cg = _c.g, cb = _c.b;
    const P = this.P, N = this.N, U = this.U, C = this.C, E = this.E, S = this.S, W = this.W, wi = [0, 0, 0, 0], wv = [0, 0, 0, 0];
    for (let k = 0, j = 0; k < p.length; k += 3, j += 2) {
      const x = p[k], y = p[k + 1], z = p[k + 2];
      P.push(x, y, z); N.push(n[k], n[k + 1], n[k + 2]);
      const q = TX.uvAt(t, uv[j], uv[j + 1]); U.push(q[0], q[1]);
      C.push(cr, cg, cb); E.push(o.r ?? 0.85, o.mt || 0, o.e || 0);
      if (o.w) { // quatre plus forts poids, normalisés
        wv[0] = wv[1] = wv[2] = wv[3] = 0; wi[0] = wi[1] = wi[2] = wi[3] = 0;
        for (const w of o.w(x, y, z)) {
          if (w[1] <= 0.002) continue;
          let h = 4; while (h > 0 && wv[h - 1] < w[1]) h--;
          if (h < 4) { for (let g = 3; g > h; g--) { wv[g] = wv[g - 1]; wi[g] = wi[g - 1]; } wv[h] = w[1]; wi[h] = w[0]; }
        }
        const tt = wv[0] + wv[1] + wv[2] + wv[3] || 1;
        S.push(wi[0], wi[1], wi[2], wi[3]); W.push(wv[0] / tt, wv[1] / tt, wv[2] / tt, wv[3] / tt);
      } else { S.push(o.b, 0, 0, 0); W.push(1, 0, 0, 0); }
      if (z < this.zb && y > this.y0 && !o.nb && (o.w ? wi[0] : o.b) < 4) this.zb = z;
    }
    for (const q of ix) this.I.push(base + q);
  }
  geometry() {
    const g = new THREE.BufferGeometry(), n = this.P.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('rme', new THREE.Float32BufferAttribute(this.E, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.S, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.W, 4));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    return g;
  }
}

// ───────────────────────── squelette ─────────────────────────
// propR : prise de la main droite (arme, lampe, lance) ; affichée selon la pose (échelle nulle sinon)
const BN = ['hips', 'torso', 'neck', 'head', 'armL', 'elbowL', 'handL', 'armR', 'elbowR', 'handR', 'legL', 'kneeL', 'footL', 'legR', 'kneeR', 'footR', 'propR'];
const PAR = { torso: 'hips', neck: 'torso', head: 'neck', armL: 'torso', elbowL: 'armL', handL: 'elbowL', armR: 'torso', elbowR: 'armR', handR: 'elbowR', legL: 'hips', kneeL: 'legL', footL: 'kneeL', legR: 'hips', kneeR: 'legR', footR: 'kneeR', propR: 'handR' };
const B = Object.fromEntries(BN.map((n, i) => [n, i]));
const SD = (s) => (s < 0 ? 'L' : 'R');
function joints(pr) {
  const L = pr.legs, J = { hips: [0, L.hips, 0], torso: [0, L.hips, 0], neck: [0, pr.neck[0], pr.neck[1]], head: [0, pr.head[0], pr.head[1]] };
  for (const s of [-1, 1]) {
    const A = SD(s), [sx, sy, sz] = pr.sh;
    J['arm' + A] = [s * sx, sy, sz]; J['elbow' + A] = [s * sx, sy - pr.el, sz - 0.005]; J['hand' + A] = [s * sx, sy - pr.el - pr.wr, sz];
    J['leg' + A] = [s * pr.hip, L.leg, 0]; J['knee' + A] = [s * pr.hip, L.knee, 0.005]; J['foot' + A] = [s * pr.hip, L.foot, -0.005];
  }
  J.propR = [J.handR[0] - 0.012 * pr.hd, J.handR[1] - 0.052 * pr.hd, J.handR[2] + 0.004];
  return J;
}
function makeBones(J) {
  const b = {};
  for (const n of BN) { b[n] = new THREE.Bone(); b[n].name = n; }
  for (const n of BN) { const p = PAR[n], q = J[n], o = p ? J[p] : [0, 0, 0]; b[n].position.set(q[0] - o[0], q[1] - o[1], q[2] - o[2]); if (p) b[p].add(b[n]); }
  return b;
}
// poids : torse (bassin → poitrine, épaules légèrement entraînées par les bras, bassin par les cuisses)
const wTorso = (pr) => { const y0 = pr.legs.hips, xs = pr.sh[0], ys = pr.sh[1]; return (x, y) => {
  const t = ss(y0 + 0.035, y0 + 0.17, y), ax = Math.abs(x), A = SD(x), sh = 0.25 * ss(xs - 0.045, xs - 0.01, ax) * ss(ys - 0.045, ys + 0.005, y), lg = 0.3 * ss(y0 - 0.05, y0 - 0.115, y) * ss(0.02, 0.08, ax);
  return [[B.hips, (1 - t) * (1 - lg)], [B.torso, t * (1 - sh)], [B['arm' + A], t * sh], [B['leg' + A], (1 - t) * lg]];
}; };
const wNeck = (J) => (x, y) => { const a = ss(J.neck[1] - 0.025, J.neck[1] + 0.025, y), b = ss(J.head[1] - 0.015, J.head[1] + 0.02, y); return [[B.torso, 1 - a], [B.neck, a * (1 - b)], [B.head, a * b]]; };
const wArm = (J, s) => { const A = SD(s), ye = J['elbow' + A][1], yh = J['hand' + A][1]; return (x, y) => { const t = ss(ye - 0.035, ye + 0.035, y), h = ss(yh + 0.025, yh - 0.012, y); return [[B['arm' + A], t], [B['elbow' + A], (1 - t) * (1 - h)], [B['hand' + A], (1 - t) * h]]; }; };
const wLeg = (J, s) => { const A = SD(s), yk = J['knee' + A][1]; return (x, y) => { const t = ss(yk - 0.04, yk + 0.04, y); return [[B['leg' + A], t], [B['knee' + A], 1 - t]]; }; };
// jupe, robe, drap : suit le bassin en haut, à moitié les cuisses en bas (pas de jambe qui traverse le tissu)
const wSkirt = (y0, y1) => (x, y) => { const t = ss(y0, y1, y) * 0.6, l = ss(0.025, -0.025, x); return [[B.hips, 1 - t], [B.legL, t * l], [B.legR, t * (1 - l)]]; };

// ───────────────────────── gabarits ─────────────────────────
// torses (anneaux par y croissant, de l'entrejambe à la base du cou)
const TORSO_M = [[0.8, 0.045, 0.04, 0.04, 0, 2], [0.845, 0.125, 0.082, 0.092, -0.004, 2.2], [0.91, 0.166, 0.098, 0.112, -0.008, 2.4], [1.1, 0.152, 0.1, 0.096, 0.004, 2.4], [1.21, 0.163, 0.112, 0.102, 0.008, 2.5], [1.31, 0.175, 0.118, 0.105, 0.008, 2.6], [1.4, 0.205, 0.104, 0.1, 0, 3.2], [1.45, 0.188, 0.085, 0.09, -0.01, 2.9], [1.485, 0.118, 0.066, 0.074, -0.016, 2.4], [1.505, 0.066, 0.058, 0.062, -0.02, 2]];
const TORSO_F = [[0.8, 0.045, 0.04, 0.04, 0, 2], [0.845, 0.13, 0.08, 0.096, -0.006, 2.2], [0.91, 0.176, 0.098, 0.122, -0.012, 2.4], [1.0, 0.158, 0.092, 0.104, -0.006, 2.4], [1.1, 0.134, 0.088, 0.09, 0, 2.3], [1.2, 0.142, 0.1, 0.094, 0.006, 2.4], [1.29, 0.15, 0.124, 0.096, 0.01, 2.4], [1.38, 0.18, 0.096, 0.094, 0, 3.1], [1.432, 0.166, 0.076, 0.082, -0.01, 2.8], [1.468, 0.1, 0.06, 0.066, -0.015, 2.4], [1.49, 0.056, 0.05, 0.054, -0.018, 2]];
const TORSO_C = [[0.71, 0.04, 0.036, 0.036, 0, 2], [0.75, 0.115, 0.08, 0.086, -0.004, 2.2], [0.82, 0.14, 0.096, 0.102, -0.004, 2.3], [0.92, 0.14, 0.106, 0.1, 0.004, 2.3], [1.04, 0.142, 0.108, 0.098, 0.008, 2.3], [1.16, 0.146, 0.1, 0.096, 0.006, 2.4], [1.27, 0.152, 0.094, 0.092, 0, 2.6], [1.345, 0.164, 0.082, 0.086, -0.008, 3], [1.395, 0.104, 0.064, 0.07, -0.012, 2.3], [1.435, 0.05, 0.046, 0.05, -0.015, 2]];
// tête (repère de l'os de la tête, avant l'échelle) : du dessous du menton au sommet du crâne
const HEAD_M = [[-0.066, 0.016, 0.012, 0.014, 0.052, 2], [-0.054, 0.036, 0.026, 0.032, 0.046, 2.2], [-0.03, 0.056, 0.044, 0.054, 0.03, 2.4], [-0.004, 0.064, 0.06, 0.074, 0.014, 2.5], [0.03, 0.07, 0.074, 0.088, 0.004, 2.6], [0.062, 0.074, 0.08, 0.097, -0.003, 2.7], [0.09, 0.075, 0.083, 0.102, -0.007, 2.6], [0.124, 0.072, 0.076, 0.1, -0.01, 2.4], [0.154, 0.061, 0.06, 0.086, -0.012, 2.3], [0.173, 0.04, 0.038, 0.06, -0.012, 2.1]];
const HEAD_TOP = 0.182;
const compressFace = (y, k = 0.84) => (y < 0.03 ? 0.03 + (y - 0.03) * k : y); // enfant (et femme, un peu) : bas du visage plus court
function headRings(pr) {
  return HEAD_M.map((q0) => {
    const q = q0.slice();
    if (pr.c) { q[0] = compressFace(q[0]); q[1] *= q0[0] < 0.03 ? 0.93 : 1.03; q[3] *= q0[0] > 0.03 ? 1.04 : 1; }
    else if (pr.f) { q[0] = compressFace(q[0], 0.94); q[1] *= q0[0] < 0.0 ? 0.9 : q0[0] < 0.04 ? 0.94 : 0.965; q[2] *= q0[0] < -0.02 ? 0.95 : 1; }
    if (pr.gaunt && q0[0] > -0.04 && q0[0] < 0.05) q[1] *= 0.9;
    return R7(q);
  });
}
// repères du visage (angles et hauteurs, repère de la tête) : partagés par la géométrie et la peinture
function faceLayout(pr) {
  const Y = pr.c ? compressFace : pr.f ? (y) => compressFace(y, 0.94) : (y) => y;
  return { eyeTh: pr.c ? 0.37 : 0.36, eyeY: 0.062, browY: pr.f || pr.c ? 0.086 : 0.085, noseY: Y(0.018), mouthY: Y(-0.012), mouthTh: pr.c ? 0.2 : pr.f ? 0.24 : 0.25, chinY: Y(-0.052), earY0: Y(0.022), earY1: 0.078 };
}
function profile(o, kind) {
  const f = !!o.female, c = !!o.child;
  const pr = {
    f, c, kind, sh: c ? [0.15, 1.37, -0.02] : f ? [0.168, 1.4, -0.022] : [0.19, 1.415, -0.025],
    el: c ? 0.25 : f ? 0.29 : 0.31, wr: c ? 0.22 : f ? 0.245 : 0.255, hip: c ? 0.078 : f ? 0.094 : 0.092,
    neck: c ? [1.43, -0.015] : f ? [1.485, -0.018] : [1.5, -0.02], head: c ? [1.52, -0.004] : f ? [1.585, -0.004] : [1.6, -0.005],
    hs: c ? 1.28 : f ? 0.955 : 1, ar: c ? 0.86 : f ? 0.86 : 1, lr: c ? 0.92 : f ? 0.95 : 1, hd: c ? 0.82 : f ? 0.9 : 1, ft: c ? 0.78 : f ? 0.9 : 1,
    torso: (c ? TORSO_C : f ? TORSO_F : TORSO_M).map(R7),
    legs: c ? { hips: 0.86, leg: 0.84, knee: 0.455, foot: 0.075 } : { hips: 0.95, leg: 0.93, knee: 0.5, foot: 0.08 },
  };
  if (kind === 'bear') Object.assign(pr, { sh: [0.24, 1.39, -0.02], hip: 0.108, ar: 1.65, lr: 1.5, torso: TORSO_M.map((q) => R7([q[0], q[1] * (q[0] < 1.45 ? 1.32 : 1.22), q[2] * (1.4 + 0.8 * G(q[0] - 1.06, 0.15)), q[3] * 1.36, q[4] + 0.045 * G(q[0] - 1.06, 0.15), 2.05])) }); // costume rembourré : ventre rond
  if (kind === 'crawler' || kind === 'shadow') Object.assign(pr, { gaunt: true, ar: 0.66, lr: 0.7, hd: 1.25, wr: 0.3, el: 0.34, torso: TORSO_M.map((q) => R7([q[0], q[1] * (q[0] < 1.2 ? 0.74 : 0.86), q[2] * (q[0] < 1.2 ? 0.68 : 0.8), q[3] * 0.8, q[4], q[5]])) });
  if (kind === 'mannequin') Object.assign(pr, { smooth: true, f: true, sh: [0.178, 1.405, -0.022], neck: [1.49, -0.018], head: [1.59, -0.004], ar: 0.85, lr: 0.9, torso: TORSO_F.map(R7) });
  if (kind === 'firefighter') Object.assign(pr, { ar: 1.14, lr: 1.12, torso: TORSO_M.map((q) => R7([q[0], q[1] * 1.07 + 0.006, q[2] * 1.12 + 0.008, q[3] * 1.1 + 0.008, q[4], q[5]])) }); // tenue de feu épaisse
  if (kind === 'astronaut') Object.assign(pr, { ar: 1.5, lr: 1.35, hd: 1.15, ft: 1.15, torso: TORSO_M.map((q) => R7([q[0], q[1] * 1.18 + 0.01, q[2] * 1.3 + 0.01, q[3] * 1.25 + 0.01, q[4], 2.3])) });
  const nb = pr.neck[0], hb = pr.head[0], nr = kind === 'bear' ? 0.11 : c ? 0.044 : f ? 0.046 : pr.gaunt ? 0.04 : 0.056;
  pr.neckR = [[nb - 0.075, nr, nr, nr * 1.1, -0.026], [lerp(nb, hb, 0.45), nr * 0.97, nr * 0.95, nr * 1.08, -0.017], [hb + 0.03, nr * 0.86, nr * 0.76, nr * 0.96, -0.012]].map((q) => R7([...q, 2.2]));
  pr.headR = headRings(pr); pr.L = faceLayout(pr);
  pr.J = joints(pr);
  return pr;
}
// silhouette du torse : ventre, creux du ventre des créatures décharnées
const torsoDef = (pr, O) => (v, r, c, th) => {
  const [x, y, z] = v, fw = Math.max(0, Math.cos(th));
  let dz = 0;
  if (O.belly) dz += O.belly * 1.6 * G(y - 1.08, 0.09) * fw ** 1.5;
  if (pr.gaunt) dz -= 0.018 * G(y - 1.03, 0.06) * fw;
  return [x, y, z + dz];
};
// membres : anneaux [t sous l'articulation, rayon latéral, rayon avant-arrière, décalage z]
function armRings(pr) {
  const k = pr.ar * 1.06, e = pr.el, w = pr.wr;
  return [[-0.03, 0.022, 0.024], [-0.004, 0.046, 0.05], [0.06, 0.052, 0.055], [e - 0.02, 0.04, 0.043], [e + 0.035, 0.043, 0.045], [e + w - 0.006, 0.026, 0.031]]
    .map(([t, a, b]) => [t < 0 ? t * Math.min(1.3, pr.ar) : t, a * k, b * k]);
}
const LEG_CLOTH = [[-0.075, 0.062, 0.068, -0.012], [0.0, 0.088, 0.093, -0.008], [0.385, 0.06, 0.064, 0.004], [0.45, 0.057, 0.062, 0.006], [0.56, 0.058, 0.062, -0.002], [0.87, 0.052, 0.056, 0.002]];
const LEG_BARE = [[-0.075, 0.06, 0.066, -0.012], [0.0, 0.084, 0.09, -0.008], [0.18, 0.072, 0.077, 0.0], [0.385, 0.054, 0.058, 0.004], [0.45, 0.05, 0.055, 0.008], [0.58, 0.052, 0.058, -0.008], [0.87, 0.028, 0.032, 0.002]];
function legRings(pr, bare) { const k = (pr.legs.leg - pr.legs.foot) / 0.85; return (bare ? LEG_BARE : LEG_CLOTH).map(([t, a, b, z]) => [t * k, a * pr.lr * 1.06, b * pr.lr * 1.06, z]); }

// ───────────────────────── tenues ─────────────────────────
const seeded = (seed) => (k) => hash(seed * 1.37 + 0.11, k * 3.17, 5.3);
const pick = (R, k, a) => a[Math.floor(R(k) * a.length) % a.length];
const FOOD = { boulangerie: 0xf5f2ea, pizzeria: 0xf5f2ea, cafe: 0x5d4037, animalerie: 0x2e7d32, fleuriste: 0x33691e, boucherie: 0xf5f2ea };
function dress(o, pr) {
  const kind = o.kind || 'human', R = seeded(o.seed ?? 1), f = pr.f;
  const O = {
    skin: o.skin ?? 0xe0b89a, hair: o.hair ?? 0x3e2723, top: cloth(o.shirt ?? 0x3b4a6b), pants: cloth(o.pants ?? 0x1f2a44), shoeC: o.shoes ?? 0x161616,
    eye: pick(R, 1, [0x4b3020, 0x2e1c10, 0x4a7090, 0x51643a, 0x5e6a70, 0x3a2414]), hairStyle: o.hairStyle, hat: o.hat, hatCol: o.hatColor ?? 0x1a237e, fireCol: o.hatColor ?? 0xffd600,
    mustache: !!o.mustache, beard: o.beard || null, glasses: o.glasses || null, belly: o.belly || 0, age: o.age || 0, ghostly: !!o.ghostly, bow: o.bow || null,
    sleeve: o.sleeves === false ? 'short' : 'long', collar: 'crew', placket: false, pockets: 0, tuck: false, hem: 0.93, epaul: false, badge: null,
    belt: null, duty: null, bottom: 'trousers', shoe: 'shoe', gloves: null, bag: o.bag || null, prop: o.prop || null, ribbed: false,
    topR: 0.86, pantsR: 0.84, jacket: null, apron: null, skirt: null, legs: null, logo: null, bands: false, scba: false, patch: null, coat: null, text: null,
  };
  if (kind === 'crawler' || kind === 'shadow') return Object.assign(O, { style: kind, top: 0xffffff, bottom: 'none', legs: O.skin, hairStyle: kind === 'crawler' ? 'stringy' : 'none', sleeve: 'none', collar: 'none', shoe: 'none', waistY: -1, lip: mul(O.skin, 0.4), brow: O.skin, eye: 0x111111 });
  const st = o.outfit || (kind === 'police' ? 'police' : kind === 'firefighter' ? 'fire' : o.hat === 'balaclava' ? 'robber' : o.badge ? 'guard' : 'casual');
  O.style = st;
  const shirtish = () => Object.assign(O, { collar: 'shirt', placket: true, tuck: true });
  switch (st) {
    case 'guard': shirtish(); Object.assign(O, { pockets: 2, epaul: true, badge: 'guard', belt: true, duty: 'guard', patch: 'sun', yoke: true, shoeC: 0x121212, topR: 0.74, pantsR: 0.76, crease: true, text: [{ s: 'SÉCURITÉ', y: 13, c: 0xe8c547 }, { s: 'HÉLIOS', y: 21, c: 0xe8c547 }] }); break;
    case 'police': shirtish(); Object.assign(O, { pockets: 2, epaul: true, badge: 'police', belt: true, duty: 'police', patch: 'police', yoke: true, shoeC: 0x111111, topR: 0.76, crease: true, hat: O.hat || 'police', text: [{ s: 'POLICE', y: 14, c: 0xf2f2f2 }] }); break;
    case 'fire': Object.assign(O, { collar: 'high', top: cloth(o.shirt ?? 0x1e2a3a), pants: cloth(o.pants ?? 0x1e2a3a), bands: true, scba: true, gloves: 0x2a2a24, shoe: 'boot', shoeC: 0x151515, hem: 0.84, topR: 0.8, prop: O.prop || 'nozzle', coat: true, zip: true, text: [{ s: 'POMPIERS', y: 8, c: 0xc9c02a }] }); break;
    case 'robber': Object.assign(O, { collar: 'crew', hood: true, ribbed: true, top: cloth(o.shirt ?? 0x202020), gloves: 0x1e1e1e, shoe: 'sneaker', shoeC: 0x262626, bottom: 'cargo', bag: O.bag || 'backpack', prop: O.prop || 'gun', hairStyle: 'none', topR: 0.92, hem: 0.9 }); break;
    case 'polo': Object.assign(O, { collar: 'polo', placket: true, sleeve: 'short', hem: 0.925, shoe: 'sneaker', shoeC: 0x2a2a2a, logo: 0xf2f2f2 }); break;
    case 'shop': {
      const food = FOOD[o.shop];
      if (R(3) < 0.5 || food) Object.assign(O, { collar: 'polo', placket: true, sleeve: food ? 'short' : O.sleeve });
      else { shirtish(); Object.assign(O, { belt: true }); }
      Object.assign(O, { nameTag: true, pants: cloth(o.pants ?? 0x26262a) });
      if (f && R(4) < 0.4) Object.assign(O, { skirt: { c: O.pants, hem: 0.55, top: 1.0, short: true }, legs: pick(R, 13, [0x2a2a30, mix(O.skin, 0x8a6a5a, 0.25)]) });
      if (food) O.apron = food;
      if (o.shop === 'pharma') { O.inner = O.top; O.coat = 0xf4f4f2; O.hem = 0.6; O.labcoat = true; }
      break;
    }
    case 'dress': Object.assign(O, { skirt: { c: O.top, hem: pr.c ? 0.56 : 0.56, top: pr.c ? 0.93 : 1.0 }, collar: 'round', collarRaw: pr.c ? 0xf2efe8 : null, placket: !!pr.c, sleeve: o.sleeves === false ? 'short' : 'long', legs: 0xf2f0ea, shoe: 'flat', shoeC: o.shoes ?? 0x241614 }); break;
    case 'catsuit': Object.assign(O, { collar: 'high', top: cloth(o.shirt ?? 0x212121), pants: cloth(o.pants ?? 0x212121), gloves: 0x232323, shoe: 'flat', shoeC: 0x1c1c1c, catEars: true, tail: true, topR: 0.7, pantsR: 0.7, hairStyle: 'buzz', hood: false, catHood: true }); break;
    case 'clown': Object.assign(O, { collar: 'ruff', gloves: 0xf6f6f6, shoe: 'clown', shoeC: 0xd50000, hairStyle: 'clown', facePaint: true, hem: 0.88, dots: [0xffeb3b, 0xffffff, 0x76ff03] }); break;
    default: { // client(e) : haut, bas, chaussures et accessoires selon la graine
      const tops = f ? ['tshirt', 'blouse', 'sweater', 'jacket', 'dress', 'polo'] : ['tshirt', 'shirt', 'sweater', 'jacket', 'hoodie', 'polo'];
      const t = pick(R, 3, tops); O.style = t;
      if (t === 'tshirt') { const k = R(20); O.print = k < 0.3 ? 0 : k < 0.5 ? 1 : k < 0.7 ? 2 : k < 0.85 ? 3 : 0; if (R(21) < 0.25) O.stripes = true; }
      if (t === 'shirt') { shirtish(); O.pocket1 = true; if (R(19) < 0.35) O.plaid = true; if (R(9) < 0.5) Object.assign(O, { tuck: false, hem: 0.9 }); else O.belt = true; }
      if (t === 'blouse') Object.assign(O, { collar: 'round', placket: true, hem: 0.94, topR: 0.6, dots: R(22) < 0.4 ? [0xf4f4f0] : null });
      if (t === 'sweater') Object.assign(O, { ribbed: true, sleeve: 'long', hem: 0.92, topR: 0.95, stripes: R(23) < 0.3 });
      if (t === 'polo') Object.assign(O, { collar: 'polo', placket: true, sleeve: 'short', logo: pick(R, 24, [0x2e7d32, 0xf2f2f2, 0x1a237e, 0xc62828]) });
      if (t === 'hoodie') Object.assign(O, { collar: 'crew', hood: true, ribbed: true, sleeve: 'long', hem: 0.9, topR: 0.92 });
      if (t === 'jacket') { O.inner = mix(cloth(O.top), 0xf0f0f0, 0.6); O.jacket = { c: cloth(pick(R, 11, [0x2b2b30, 0x3e3328, 0x23324a, 0x4a3a2a, mul(O.top, 0.55)])) }; O.collar = 'crew'; O.sleeve = 'long'; O.hem = 0.87; }
      if (t === 'dress') Object.assign(O, { skirt: { c: O.top, hem: 0.52 + R(12) * 0.08, top: 1.04 }, collar: 'round', legs: pick(R, 13, [0x2a2a30, mix(O.skin, 0x8a6a5a, 0.25), O.skin]) });
      if (!O.skirt) {
        const jeans = R(5) < 0.5;
        if (jeans) Object.assign(O, { bottom: 'jeans', pants: pick(R, 6, [0x34507a, 0x2a3c5a, 0x3e5f8a, 0x2b2f38]), pantsR: 0.9 });
        if (f && R(14) < 0.35) Object.assign(O, { skirt: { c: jeans ? O.pants : cloth(o.pants ?? 0x2a2a2a), hem: 0.56, top: 1.0, short: true }, legs: pick(R, 13, [0x2a2a30, mix(O.skin, 0x8a6a5a, 0.25)]) });
      }
      if (R(7) < 0.5) Object.assign(O, { shoe: 'sneaker', shoeC: pick(R, 8, [0xe8e8e8, 0x2a2a2a, 0x8a1c1c, 0x1c3a6a]) });
      else Object.assign(O, { shoe: f && R(15) < 0.5 ? 'boot' : 'shoe', shoeC: pick(R, 8, [0x2a1a10, 0x141414, 0x4a2c1a]) });
      if (R(16) < 0.18 && !pr.c) O.glasses = pick(R, 17, [0x111111, 0x8a7a5a, 0x3a2418]);
      if (!f && !pr.c && !O.beard) { const b = R(18); O.beard = b < 0.14 ? 'beard' : b < 0.34 ? 'stubble' : null; }
      if (O.skirt) O.legs = O.legs ?? O.skin;
    }
  }
  if (O.coat === true) O.coat = O.top;
  if (!O.hairStyle) O.hairStyle = f ? (pr.c ? pick(R, 2, ['bob', 'ponytail', 'long', 'bob']) : pick(R, 2, ['long', 'bob', 'ponytail', 'bun', 'long'])) : pick(R, 2, pr.c ? ['short', 'side', 'buzz', 'curly'] : ['short', 'short', 'side', 'buzz', 'bald', 'curly']);
  if (O.hat === 'balaclava' || O.hat === 'helmet') O.hairStyle = 'none';
  O.waistY = O.tuck || O.skirt ? 1.0 : O.hem;
  if (pr.c) O.waistY = O.skirt ? 0.93 : Math.min(O.waistY, 0.9);
  if (O.coat && !O.labcoat) O.waistY = O.hem;
  if (O.jacket) O.waistY = O.hem;
  O.waistY = Math.max(O.waistY, pr.torso[0][0] + 0.04);
  O.lip = O.ghostly ? mix(O.skin, 0x6a5a62, 0.5) : f ? pick(R, 25, [0xa8424e, 0xb05a6a, 0x8a3a4a, mix(O.skin, 0x9a5a50, 0.45)]) : mix(O.skin, 0x9a5a50, 0.32);
  if (O.ghostly) O.eye = 0x140e0c;
  O.brow = O.hair === 0xbdbdbd || O.hair === 0x9e9e9e ? mul(O.hair, 0.8) : O.hair === 0xd7b46a || O.hair === 0xb5651d ? mul(O.hair, 0.62) : mix(O.hair, 0x140c08, 0.25);
  if (f && !pr.c && !O.ghostly) O.makeup = { shadow: pick(R, 26, [null, 0x7a5a8a, 0x5a7a9a, 0x8a6a4a, null]), liner: R(27) < 0.5, blush: R(28) < 0.6 ? 0xd06070 : null };
  return O;
}

// ───────────────────────── cases de l'atlas d'un personnage ─────────────────────────
const SCALP = { short: 'hair', side: 'hair', curly: 'hair', buzz: 'buzz', bald: 'bald', long: 'part', bob: 'fringe', ponytail: 'hair', bun: 'hair', clown: 'bald', stringy: 'buzz', none: 'none' };
const HAIRLINE = { hair: [0.122, 0.104, 0.082, -0.012], part: [0.118, 0.1, 0.06, -0.04], fringe: [0.098, 0.094, 0.074, -0.03], buzz: [0.124, 0.104, 0.082, -0.008], bald: [0.124, 0.104, 0.082, -0.012], none: [0.2, 0.2, 0.2, 0.2] };
function headTile(K, pr, O) {
  const scalp = O.hat === 'balaclava' ? 'none' : SCALP[O.hairStyle] || 'hair';
  const hairline = HAIRLINE[scalp].slice(); if (O.age && scalp === 'hair') hairline[0] += 0.008;
  const L = { ...pr.L, hair: hairline };
  const f = {
    skin: O.skin, hair: O.hair, brow: O.brow, eye: O.eye, lip: O.lip, f: pr.f, c: pr.c, age: O.age, beard: O.beard, mustache: O.mustache, glasses: O.glasses, makeup: O.makeup || null,
    scalp, ghostly: O.ghostly, clown: !!O.facePaint, balaclava: O.hat === 'balaclava', hood: O.catHood ? O.top : null, gaunt: !!pr.gaunt, plastic: pr.kind === 'mannequin', hl: hairline,
    seed: (O.seed ?? 1) % 16, // variantes du visage (sourcils, bouche, grains de beauté, taches de rousseur, cernes)
  };
  return K.use(TX.tile(TX.headKey(f), 64, 64, (P) => TX.paintHead(P, f, L), K.pg, true));
}
// case propre aux tenues (libérable quand plus aucun personnage ne la porte) ; les matières (TX.mat) restent en place
const T = (K, key, w, h, paint) => K.use(TX.tile(key, w, h, paint, K.pg, true));
function outfitTiles(K, pr, O) {
  const yTop = pr.torso[pr.torso.length - 1][0], row = (y) => Math.round((yTop - y) / (yTop - O.waistY) * 64);
  const top = { style: O.style, collar: O.collar, placket: O.placket, pockets: O.pockets, pocket1: O.pocket1, epaul: O.epaul, badge: O.badge, patch: O.patch, nameTag: O.nameTag, logo: O.logo, print: O.print, yoke: O.yoke, text: O.text, inner: O.jacket ? O.inner : O.labcoat ? 0xc8d8e8 : null, hood: O.hood, zip: O.zip, plaid: O.plaid, stripes: O.stripes, dots: O.dots, ribbed: O.ribbed, collarRaw: O.collarRaw, seed: O.print || O.plaid ? (O.seed || 1) : 1 };
  if (O.bands) top.bands = [row(1.3) - 1, row(1.095) - 1, row(0.9) - 1];
  const T0 = armRings(pr)[0][0], T1 = pr.el + pr.wr, arow = (t) => Math.round((t - T0) / (T1 - T0) * 64);
  const sl = O.sleeve === 'short' ? 0.42 * pr.el : T1;
  const sleeve = { style: O.style, short: O.sleeve === 'short', end: Math.min(63, arow(sl)), elbow: arow(pr.el), patch: O.patch === 'sun' || O.patch === 'police' ? O.patch : null, plaid: O.plaid, stripes: O.stripes, dots: O.dots, ribbed: O.ribbed || O.hood, bands: O.bands ? [arow(pr.el + 0.07), arow(pr.el + pr.wr * 0.72)] : null };
  const pants = { style: O.bottom === 'jeans' ? 'jeans' : 'plain', crease: !!O.crease, cargo: O.bottom === 'cargo', bands: O.bands ? [48] : null };
  O.tex = {
    head: headTile(K, pr, O),
    top: T(K, TX.topKey(top), 128, 64, (P) => TX.paintTop(P, top)),
    sleeve: T(K, 'sleeve|' + JSON.stringify(sleeve), 32, 64, (P) => TX.paintSleeve(P, sleeve)),
    pants: T(K, 'pants|' + JSON.stringify(pants), 64, 64, (P) => TX.paintPants(P, pants)),
    shoe: T(K, 'shoe|' + O.shoe, 32, 32, (P) => TX.paintShoe(P, O.shoe)),
    hand: T(K, 'hand|' + (pr.gaunt ? 'claw' : O.gloves != null ? 'glove' : 'bare'), 32, 32, (P) => TX.paintHand(P, pr.gaunt ? 'claw' : O.gloves != null ? 'glove' : 'bare')),
    skin: TX.mat('skin', K.pg),
  };
  O.sl = sl;
}

// ───────────────────────── pièces du corps humain ─────────────────────────
const TORSO_COLS = colsAt(12, -Math.PI / 2); // couture sous le bras −x ; devant à u = 1/4, dos à u = 3/4
function torsoPieces(K, pr, O) {
  const R = pr.torso, yTop = R[R.length - 1][0], yBot = R[0][0], wy = O.waistY, def = torsoDef(pr, O), w = wTorso(pr);
  const ring = R7(secAt(R, wy)); ring[0] = wy;
  const lower = [...R.filter((q) => q[0] < wy - 0.01), ring], upper = [ring, ...R.filter((q) => q[0] > wy + 0.01)];
  const us = TORSO_COLS.map((_, c) => c / 12);
  const topC = O.jacket ? O.jacket.c : O.coat || O.top;
  K.add(tube(upper, TORSO_COLS, us.map((u) => u * 128), upper.map((q) => (yTop - q[0]) / (yTop - wy) * 64), { def }), O.tex.top, { c: topC, r: O.topR, w });
  if (lower.length > 1) K.add(tube(lower, TORSO_COLS, us.map((u) => 32 + u * 32), lower.map((q) => (wy - q[0]) / (wy - yBot) * 31.5), { def, c0: [0, yBot - 0.004, 0] }), O.tex.pants, { c: O.pants, r: O.pantsR, w });
  // ceinture : bande au-dessus de la taille
  if (O.belt && wy > 0.95) {
    const by = Math.min(wy, 1.0), b0 = R7(secAt(R, by - 0.026)), b1 = R7(secAt(R, by + 0.012)); b0[0] = by - 0.026; b1[0] = by + 0.012;
    K.add(tube([b0, b1], TORSO_COLS, us.map((u) => 32 + u * 32), [39.5, 32.5], { off: () => 0.006, def }), O.tex.pants, { c: 0xffffff, r: 0.4, w });
  }
}
function neckPiece(K, pr, O) {
  const J = pr.J, nc = O.catHood ? O.top : O.hat === 'balaclava' ? 0x222222 : O.skin;
  K.add(tube(pr.neckR, colsAt(6, -Math.PI), [0, 3, 6, 9, 12, 15, 16].map((u) => u), [15, 8, 1]), O.tex.skin, { c: nc, r: O.hat === 'balaclava' ? 0.95 : 0.6, w: wNeck(J) });
  // col de chemise, col montant, collerette
  const nb = J.neck[1];
  if (O.collar === 'shirt' || O.collar === 'polo' || O.collar === 'high') {
    const q0 = R7(secAt(pr.neckR, nb - 0.035)), q1 = R7(secAt(pr.neckR, O.collar === 'high' ? nb + 0.04 : nb + 0.016)); q0[0] = nb - 0.035; q1[0] = O.collar === 'high' ? nb + 0.04 : nb + 0.016;
    K.add(tube([q0, q1], colsAt(8, -Math.PI), [64, 72, 80, 88, 96, 104, 112, 120, 127].map((u) => u), [3, 0.5], { off: (r) => (r ? 0.008 : 0.012) }), O.tex.top, { c: O.jacket ? O.jacket.c : O.coat || O.top, r: O.topR, w: wNeck(J) });
  }
  if (O.collar === 'ruff') { // collerette de clown : étoile plate à double face
    const pts = [[0, nb - 0.03, -0.02]], uv = [[8, 8]], tris = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 0.1 : 0.135; pts.push([Math.sin(a) * r, nb - 0.035 - (i % 2 ? 0 : 0.02), -0.02 + Math.cos(a) * r]); uv.push([8, 8]); }
    for (let i = 0; i < 16; i++) tris.push([0, 1 + i, 1 + (i + 1) % 16]);
    const s = facets(pts, tris, uv, [0, nb - 0.2, -0.02]);
    K.add(twoSided(s), null, { c: 0xf6f6f6, r: 0.8, w: wTorso(pr), flat: true });
  }
}
function armPieces(K, pr, O, s) {
  const J = pr.J, A = SD(s), j = J['arm' + A], m = M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), w = wArm(J, s);
  const rings = armRings(pr), T0 = rings[0][0], T1 = pr.el + pr.wr, vrow = (t) => (t - T0) / (T1 - T0) * 64;
  const cols = colsAt(6, -Math.PI), us = cols.map((_, c) => c / 6 * 32), usS = cols.map((_, c) => c / 6 * 16);
  const toR = (rs, k = 1) => rs.map(([t, a, b]) => R7([-t, a * k, b * k, b * k, 0, 2])).reverse();
  const sc = O.jacket ? O.jacket.c : O.coat || O.top;
  if (O.sleeve === 'none') { K.add(tube(toR(rings), cols, usS, toR(rings).map((q) => 15 - (-q[0] - T0) / (T1 - T0) * 14)), O.tex.skin, { m, c: O.skin, r: 0.6, w }); return; }
  const sl = O.sl;
  if (sl >= T1 - 0.01) { // manche longue jusqu'au poignet
    const rs = toR(rings, 1.05);
    K.add(tube(rs, cols, us, rs.map((q) => vrow(-q[0]))), O.tex.sleeve, { m, c: sc, r: O.topR, w });
    return;
  }
  // manche courte : tissu jusqu'à sl (ourlet un peu plus large), puis la peau
  const at = (t) => { let i = 0; while (i < rings.length - 2 && rings[i + 1][0] < t) i++; const a = rings[i], b = rings[i + 1], k = (t - a[0]) / (b[0] - a[0]); return [t, lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; };
  const up = [...rings.filter((r) => r[0] < sl - 0.01), at(sl)], low = [at(sl), ...rings.filter((r) => r[0] > sl + 0.01)];
  const rsU = toR(up, 1.08); rsU[0] = R7([-sl, at(sl)[1] * 1.16, at(sl)[2] * 1.16, at(sl)[2] * 1.16, 0, 2]);
  K.add(tube(rsU, cols, us, rsU.map((q) => vrow(-q[0]))), O.tex.sleeve, { m, c: sc, r: O.topR, w });
  const rsL = toR(low);
  K.add(tube(rsL, cols, usS, rsL.map((q) => 15 - (-q[0] - sl) / (T1 - sl) * 14)), O.tex.skin, { m, c: O.skin, r: 0.6, w });
}
// Main canonique (main gauche : doigts +y, paume +x, index et pouce +z) en peu de polygones : paume, doigts en un bloc
// (moufle) ou séparés (fine : vue à la première personne), pouce ; grip 0 détendue → 1 poing ; uv dans la case des mains
function handShapes(grip, fat = 1, fine = false, len = 1) {
  const g = grip, out = [], k = fat;
  const uvH = (z, y) => [16 + z / 0.05 * 16, Math.min(31.5, Math.max(0.5, y / 0.17 * 32))];
  // paume : bloc arrondi du poignet aux jointures
  const ps = fine ? 8 : 4, pth = fine ? -Math.PI : -0.75 * Math.PI;
  const palm = [{ y: -0.006, rx: 0.014, rz: 0.03 }, { y: 0.04, rx: 0.0165, rz: 0.041 }, { y: 0.088, rx: 0.0135, rz: 0.042 }].map((q) => ({ c: [0.002, q.y, 0.001], ax: [1, 0, 0], az: [0, 0, 1], rx: q.rx * k * (fine ? 1 : 1.12), rz: q.rz * k * (fine ? 1 : 1.12), n: 3 }));
  out.push(loftF(palm, ps, (r, c) => uvH((c / ps - 0.5) * 0.08, palm[r].c[1]), false, false, pth));
  // doigts : trois phalanges qui s'enroulent vers la paume (+x)
  const finger = (z, L, r0, sp, flex) => {
    let p = [0.002, 0.086, z], A = 0; const rings = [];
    const seg = [0.45, 0.3, 0.25];
    rings.push({ c: p, A: 0 });
    for (let i = 0; i < 3; i++) { A += flex[i]; const d = [Math.sin(A), Math.cos(A) * Math.cos(sp), Math.cos(A) * Math.sin(sp)], l = seg[i] * L * len; p = add3(p, scl(d, l)); rings.push({ c: p, A }); }
    return rings.map((q, i) => ({ c: q.c, ax: [Math.cos(q.A), -Math.sin(q.A), 0], az: [0, 0, 1], rx: r0 * (1 - 0.1 * i) * 0.92, rz: (r0 * (1 - 0.08 * i)) * 1.0, n: 2.4 }));
  };
  const flex = (f) => [lerp(0.2, 1.5, g) + f * 0.04, lerp(0.35, 1.6, g), lerp(0.2, 0.9, g)];
  if (fine) {
    const Z = [0.0285, 0.0095, -0.0095, -0.0265], L = [0.074, 0.081, 0.076, 0.061], R0 = [0.0088, 0.0092, 0.0087, 0.0077], SP = [0.07, 0, -0.06, -0.13];
    for (let f = 0; f < 4; f++) { const rs = finger(Z[f] * k, L[f], R0[f] * k, SP[f] * (1 - g), flex(f)); out.push(loftF(rs, 4, (r, c) => uvH(Z[f] + (c / 4 - 0.5) * 0.016, 0.09 + r * 0.026), false, true, -Math.PI)); }
  } else { // moufle : les quatre doigts en un bloc
    const fl = flex(1), rs = finger(0.001 * k, 0.078, 0.0118 * k, 0, [fl[0], fl[1] + fl[2] * 0.5, fl[2] * 0.5]).filter((_, i) => i !== 2).map((q, i) => ({ ...q, rx: q.rx * 1.12, rz: (0.04 - 0.004 * i) * k * 1.12, n: 3 }));
    out.push(loftF(rs, 4, (r, c) => uvH((c / 4 - 0.5) * 0.09, 0.09 + r * 0.04), false, true, -0.75 * Math.PI));
  }
  // pouce
  const T0 = [[0.004, 0.006, 0.02], [0.012, 0.03, 0.035], [0.018, 0.05, 0.043], [0.022, 0.066, 0.044]], T1 = [[0.004, 0.006, 0.02], [0.016, 0.03, 0.034], [0.03, 0.046, 0.03], [0.038, 0.056, 0.016]];
  const tp = T0.map((q, i) => q.map((v, j) => lerp(v, T1[i][j], g) * (j === 2 ? k : 1)));
  const tps = fine ? tp : [tp[0], tp[2], tp[3]];
  const trs = tps.map((c, i) => { const d = nrm(sub(tps[Math.min(tps.length - 1, i + 1)], tps[Math.max(0, i - 1)])), ax = nrm(cross(d, [0, 0, 1])); return { c, ax, az: nrm(cross(ax, d)), rx: (0.012 - 0.0012 * i) * k * (fine ? 1 : 1.1), rz: (0.0115 - 0.001 * i) * k * (fine ? 1 : 1.1), n: 2.4 }; });
  out.push(loftF(trs, fine ? 5 : 4, (r, c) => uvH(0.045, 0.02 + r * 0.03), false, true, fine ? -Math.PI : -0.75 * Math.PI));
  return out;
}
function handMatrix(pr, s) { const A = SD(s), j = pr.J['hand' + A], m = M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1); return m.multiply(M4(0, 0, 0, 0, 0, Math.PI, pr.hd)); }
function handPiece(K, pr, O, s) {
  const holds = s > 0 && O.prop, grip = holds ? (O.prop === 'torch' ? 0.75 : 1) : O.bag && s < 0 ? 0.85 : 0.15, m = handMatrix(pr, s), b = B['hand' + SD(s)];
  const c = pr.gaunt ? O.skin : O.gloves ?? O.skin, r = O.gloves ? 0.7 : 0.6;
  for (const p of handShapes(grip, O.gloves ? 1.08 : 1, false, pr.gaunt ? 1.35 : 1)) K.add(p, O.tex.hand, { m, c, r, b });
}
function legPieces(K, pr, O, s) {
  const J = pr.J, A = SD(s), j = J['leg' + A], bare = !!O.skirt || O.bottom === 'none', m = M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), w = wLeg(J, s);
  const rings = legRings(pr, bare), t0 = rings[0][0], t1 = rings[rings.length - 1][0];
  const R = rings.map(([t, a, b, z]) => R7([-t, a, b, b, z, 2])).reverse(), cols = colsAt(6, -Math.PI);
  if (bare) K.add(tube(R, cols, cols.map((_, c) => c / 6 * 16), R.map((q) => 15 - (-q[0] - t0) / (t1 - t0) * 14)), O.tex.skin, { m, c: O.legs ?? O.skin, r: 0.6, w });
  else K.add(tube(R, cols, cols.map((_, c) => c / 6 * 32), R.map((q) => (-q[0] - t0) / (t1 - t0) * 64)), O.tex.pants, { m, c: O.pants, r: O.pantsR, w });
}
// chaussure (repère du pied : cheville à l'origine, sol en y = −0,08) : loft le long de +z, couture sous la semelle
function shoeShape(kind, k = 1) {
  let Q = [[-0.074, -0.05, 0.032, 0.028], [-0.035, -0.04, 0.044, 0.04], [0.07, -0.054, 0.049, 0.026], [0.19, -0.066, 0.034, 0.014]];
  if (kind === 'clown') Q = Q.map(([z, y, rx, ry]) => [z * (z > 0 ? 1.7 : 1), y + (z > 0.05 ? 0.01 : 0), rx * (z > 0.05 ? 1.5 : 1.05), ry * (z > 0.05 ? 1.6 : 1)]).map(([z, y, rx, ry]) => [z, -0.08 + ry, rx, ry]);
  if (kind === 'sneaker') Q = Q.map(([z, y, rx, ry]) => [z, y, rx * 1.05, ry * 1.06]);
  const rings = Q.map(([z, y, rx, ry]) => ({ c: [0, y, z * k], ax: [1, 0, 0], az: [0, 1, 0], rx: rx * k, rz: ry, n: 2.8 }));
  const zt = rings[rings.length - 1].c[2];
  return loftF(rings, 6, (r, c) => [c / 6 * 32, (Q[r][0] + 0.075) / 0.27 * 32], [0, -0.06, -0.082 * k], [0, -0.07, zt + 0.012], -Math.PI);
}
function shoePiece(K, pr, O, s) {
  const J = pr.J, A = SD(s), j = J['foot' + A], b = B['foot' + A], m = M4(j[0], j[1], j[2] + 0.008, 0, 0, 0, s, 1, 1);
  K.add(shoeShape(O.shoe, pr.ft), O.tex.shoe, { m, c: O.shoeC, r: O.shoe === 'sneaker' ? 0.75 : O.shoe === 'boot' && O.style === 'fire' ? 0.5 : 0.4, b });
  if (O.shoe === 'boot') { // tige de botte
    const rr = [{ c: [0, -0.03, -0.012], ax: [1, 0, 0], az: [0, 0, 1], rx: 0.044, rz: 0.05 }, { c: [0, 0.1, -0.008], ax: [1, 0, 0], az: [0, 0, 1], rx: 0.05, rz: 0.054 }];
    K.add(loftF(rr, 6, (r, c) => [6 + c / 6 * 20, r ? 1 : 9], false, false), O.tex.shoe, { m, c: O.shoeC, r: 0.5, w: (x, y) => (y > j[1] + 0.05 ? [[b, 0.3], [B['knee' + A], 0.7]] : [[b, 1]]) });
  }
}
// tête : volume du crâne et du visage, nez et oreilles facettés ; tout le visage est peint dans la case de la tête
function headSurf(HR, th, y, off = 0) { const q = R7(secAt(HR, y)); q[0] = y; return ringP(q, th, off); }
function headPiece(K, pr, O, hm) {
  const HR = pr.headR, b = B.head, t = O.tex.head, L = pr.L;
  const seg = 12, cols = colsAt(seg, -Math.PI), us = cols.map((th) => TX.headU(th)), vs = HR.map((q) => TX.headV(q[0]));
  const sm = pr.smooth || pr.kind === 'mannequin';
  // relief : orbites, arcade, pommettes, lèvres, menton (colonnes de face)
  const def = (v, r, c, th) => {
    const y = HR[r][0], a = Math.abs(th), d = [Math.sin(th), 0, Math.cos(th)];
    let k = 0;
    if (Math.abs(y - L.eyeY) < 0.004 && Math.abs(a - Math.PI / 6) < 0.01) k -= sm ? 0.0015 : pr.gaunt ? 0.008 : 0.004;
    if (Math.abs(y - 0.09) < 0.004 && a < 0.6) k += pr.f || pr.c || sm ? 0.0012 : 0.003;
    if (Math.abs(y - 0.03) < 0.004 && Math.abs(a - Math.PI / 3) < 0.01) k += pr.gaunt ? -0.004 : 0.002;
    if (Math.abs(y - HR[3][0]) < 0.002 && a < 0.01 && !sm) k += 0.003;
    if (Math.abs(y - HR[1][0]) < 0.002 && a < 0.6) k += a < 0.01 ? 0.004 : 0.002;
    return [v[0] + d[0] * k, v[1], v[2] + d[2] * k];
  };
  const top = HR[HR.length - 1];
  K.add(tube(HR, cols, us, vs, { def, c0: [0, HR[0][0] - 0.002, HR[0][4]], uc0: [32, 63.5], c1: [0, HEAD_TOP, top[4]], uc1: [32, 0.5] }), t, { m: hm, c: 0xffffff, r: pr.kind === 'mannequin' ? 0.32 : O.hat === 'balaclava' ? 0.95 : 0.62, b });
  const huv = (p) => [TX.headU(Math.atan2(p[0], p[2] - R7(secAt(HR, p[1]))[4])), TX.headV(p[1])];
  { // nez : arête, pointe, ailes, dessous (facettes plates)
    const nk = pr.c ? 0.7 : pr.f ? 0.86 : pr.gaunt ? 0.45 : sm ? 0.6 : 1, zf = (y, x = 0) => headSurf(HR, Math.atan2(x, 0.075), y)[2];
    const P = [[0, 0.06, zf(0.06) - 0.002], [0, L.noseY + 0.003, zf(L.noseY) + 0.017 * nk], [0, L.noseY - 0.008, zf(L.noseY - 0.008) + 0.004], [-0.015 * nk, L.noseY - 0.003, zf(L.noseY - 0.003, 0.015) - 0.003], [0.015 * nk, L.noseY - 0.003, zf(L.noseY - 0.003, 0.015) - 0.003], [-0.0075 * nk, 0.04, zf(0.04, 0.0075) + 0.004 * nk], [0.0075 * nk, 0.04, zf(0.04, 0.0075) + 0.004 * nk]];
    const tris = [[0, 1, 6], [0, 5, 1], [6, 1, 4], [5, 3, 1], [1, 2, 4], [1, 3, 2]];
    K.add(facets(P, tris, P.map(huv), [0, 0.03, 0]), t, { m: hm, c: 0xffffff, r: 0.6, b, flat: true });
  }
  // oreilles : plaques à double face sur les côtés (le pavillon est peint)
  if (O.hat !== 'helmet' && pr.kind !== 'mannequin' && !['long', 'bob', 'stringy'].includes(O.hairStyle)) for (const s of [-1, 1]) {
    const F0 = headSurf(HR, s * (Math.PI / 2 - 0.08), L.earY1 - 0.004, -0.003), F1 = headSurf(HR, s * (Math.PI / 2 - 0.06), L.earY0 + 0.004, -0.003);
    const O0 = headSurf(HR, s * (Math.PI / 2 + 0.28), L.earY1, 0.012), O1 = headSurf(HR, s * (Math.PI / 2 + 0.2), L.earY0, 0.008);
    const P = [F0, O0, O1, F1], uv = P.map(huv);
    K.add(twoSided({ p: P.flat(), i: s > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3], uv: uv.flat() }), t, { m: hm, c: 0xffffff, r: 0.6, b, flat: true });
  }
}
// cheveux : calotte en volume au-dessus de la lisière peinte, rideau (cheveux longs, carré), queue de cheval, chignon…
function hairPieces(K, pr, O, hm) {
  const st = O.hairStyle; if (!st || st === 'none' || st === 'buzz' || st === 'bald') return;
  const HR = pr.headR, b = B.head, hc = O.hair, scalp = SCALP[st] || 'hair', H = HAIRLINE[scalp].slice(); if (O.age && scalp === 'hair') H[0] += 0.008;
  const tile = K.use(TX.mat(st === 'curly' || st === 'clown' ? 'curly' : 'hair', K.pg));
  const hl = (th) => { const a = Math.abs(th); return a < 0.75 ? H[0] + (scalp === 'fringe' ? 0 : 0.01 * ss(0.3, 0.75, a)) : a < 1.25 ? lerp(H[0], H[1], ss(0.75, 1.25, a)) : a < 1.75 ? lerp(H[1], H[2], ss(1.25, 1.75, a)) : lerp(H[2], H[3], ss(1.75, 2.4, a)); };
  const capped = O.hat === 'cap' || O.hat === 'police';
  if (st !== 'clown' && st !== 'stringy') {
    const thick = st === 'curly' ? 0.02 : st === 'short' || st === 'side' ? 0.011 : 0.009, seg = 12, S = st === 'curly' ? [0, 0.38, 0.72, 0.95] : [0, 0.5, 0.92];
    const hang = scalp === 'part' || scalp === 'fringe';
    const yTop = capped ? 0.112 : 0.176;
    const p = [], uv = [], ix = [], nc = seg + 1;
    for (let r = 0; r < S.length; r++) for (let c = 0; c < nc; c++) {
      const th = -Math.PI + TAU * c / seg, y0 = Math.min(hl(th), yTop - 0.01), y = lerp(y0, yTop, S[r]), o = (capped && Math.abs(th) < 1.2 ? -0.004 : r === 0 ? (hang && Math.abs(th) > 1.1 ? thick : 0.0025) : thick * (0.6 + 0.4 * S[r])) + (st === 'curly' ? 0.004 * Math.sin(c * 2.3 + r) : 0) + (st === 'side' && th > 0 ? 0.003 * S[r] : 0);
      const q = headSurf(HR, th, y, o); p.push(...q); uv.push(c / seg * 32, 31.5 - S[r] * 30);
    }
    for (let r = 0; r < S.length - 1; r++) for (let c = 0; c < seg; c++) { const a = r * nc + c; ix.push(a, a + 1, a + nc, a + 1, a + 1 + nc, a + nc); }
    if (!capped) { const ci = p.length / 3; p.push(0, HEAD_TOP + thick * 0.9, HR[HR.length - 1][4]); uv.push(16, 0.5); for (let c = 0; c < seg; c++) { const a = (S.length - 1) * nc + c; ix.push(ci, a, a + 1); } }
    K.add({ p, i: ix, uv }, tile, { m: hm, c: hc, r: 0.7, b });
  }
  // rideau des cheveux longs / du carré : bande à double face qui tombe des côtés et de la nuque
  if (st === 'stringy') for (let i = 0; i < 14; i++) { // rampant : longues mèches raides autour du crâne, quelques-unes devant le visage
    const th = -Math.PI + (i + 0.5) / 14 * TAU + (hash(i, 2, 5) - 0.5) * 0.25, y0 = 0.13 - 0.05 * Math.abs(Math.cos(th / 2)), q = headSurf(HR, th, y0, 0.006), d = [Math.sin(th), 0, Math.cos(th)], tg = [Math.cos(th), 0, -Math.sin(th)], Lh = 0.26 + hash(i, 7, 2) * 0.18, w = 0.019;
    const P = [add3(q, scl(tg, -w)), add3(q, scl(tg, w)), add3(add3(q, scl(d, 0.03)), [-tg[0] * w * 0.5, -Lh, -tg[2] * w * 0.5]), add3(add3(q, scl(d, 0.03)), [tg[0] * w * 0.5, -Lh, tg[2] * w * 0.5])];
    K.add(twoSided({ p: P.flat(), i: [0, 2, 1, 1, 2, 3], uv: [i * 2.8, 1, i * 2.8 + 2.5, 1, i * 2.8, 30, i * 2.8 + 2.5, 30] }), tile, { m: hm, c: hc, r: 0.6, b });
  }
  if (st === 'long' || st === 'bob') {
    const y0 = 0.078, y1 = st === 'long' ? (pr.c ? -0.14 : -0.25) : -0.035, a0 = 1.2, n = 9, rows = 3, q0 = R7(secAt(HR, y0));
    const p = [], uv = [], ix = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < n; c++) {
      const v = r / (rows - 1), th = a0 + (c / (n - 1)) * (TAU - 2 * a0), y = lerp(y0, y1 * (1 + 0.06 * (hash(c, 3, 1) - 0.5)), v);
      const base = ringP(q0, th, 0.008), d = nrm([Math.sin(th), 0, Math.cos(th)]), out = 0.002 + (st === 'bob' ? 0.012 * Math.sin(v * 2.4) : v * 0.022);
      p.push(base[0] + d[0] * out, y, base[2] + d[2] * out - (y < -0.06 ? (y + 0.06) * 0.2 * Math.max(0, -d[2]) : 0)); uv.push(c / (n - 1) * 32, 2 + v * 28);
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < n - 1; c++) { const a = r * n + c; ix.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
    K.add(twoSided({ p, i: ix, uv }), tile, { m: hm, c: hc, r: 0.7, b });
  }
  const lump = (c, r, k) => { const rings = []; for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + Math.PI * i / 3; rings.push({ c: [c[0], c[1] + Math.sin(a) * r[1], c[2]], ax: [1, 0, 0], az: [0, 0, 1], rx: Math.cos(a) * r[0] + 1e-4, rz: Math.cos(a) * r[2] + 1e-4 }); } return loftF(rings, k, (rr, cc) => [cc / k * 32, rr / 3 * 31], false, false); };
  if (st === 'ponytail') {
    const P = [[0, 0.1, -0.1], [0, 0.07, -0.125], [0, 0.0, -0.138], [0, -0.09, -0.13], [0, -0.17, -0.118]], Rr = [0.012, 0.02, 0.018, 0.012, 0.004];
    K.add(loftF(P.map((c, i) => { const d = nrm(sub(P[Math.min(4, i + 1)], P[Math.max(0, i - 1)])), ax = [1, 0, 0]; return { c, ax, az: nrm(cross(ax, d)), rx: Rr[i], rz: Rr[i] }; }), 5, (r, c) => [c / 5 * 32, r / 4 * 31], false, true), tile, { m: hm, c: hc, r: 0.7, b });
  }
  if (st === 'bun') K.add(lump([0, 0.135, -0.095], [0.036, 0.03, 0.032], 6), tile, { m: hm, c: hc, r: 0.7, b });
  if (st === 'clown') for (const s of [-1, 1]) K.add(lump([s * 0.082, 0.085, -0.03], [0.045, 0.05, 0.06], 6), tile, { m: hm, c: hc, r: 0.9, b });
  if (O.bow) for (const s of [-1, 1]) K.add(lump([0.045 + s * 0.022, 0.135, 0.035], [0.024, 0.016, 0.008], 5), null, { m: hm, c: O.bow, r: 0.6, b });
}
// couvre-chefs : casquette, casquette de police, casque de pompier, casque d'astronaute
function hatPieces(K, pr, O, hm) {
  const HR = pr.headR, b = B.head, h = O.hat; if (!h || h === 'balaclava') return;
  if (h === 'cap' || h === 'police') {
    const pol = h === 'police', key = pol ? 'police' : O.style === 'guard' ? 'capGuard' : O.bag === 'delivery' ? 'capDelivery' : 'cap', t = T(K, 'hat|' + key, 32, 32, (P) => TX.paintHat(P, key));
    const o = O.hairStyle === 'none' || O.hairStyle === 'buzz' || O.hairStyle === 'bald' ? 0.008 : 0.016;
    const ys = pol ? [0.096, 0.13, 0.172, 0.19] : [0.1, 0.14, 0.172, 0.186], ks = pol ? [1, 1.04, 1.16, 1.1] : [1, 0.995, 0.88, 0.55];
    const R = ys.map((y, i) => { const q = R7(secAt(HR, Math.min(0.176, y))); return R7([y + 0.012 * (i === 0 ? 1 : 0), (q[1] + o) * ks[i], (q[2] + o) * ks[i], (q[3] + o) * ks[i], q[4], 2.3]); });
    const cols = colsAt(8, -Math.PI);
    K.add(tube(R, cols, cols.map((th) => 16 + th / Math.PI * 16), R.map((_, i) => (pol ? [21, 15, 6, 2] : [23, 14, 6, 2])[i]), { c1: [0, ys[3] + 0.004, R[3][4]], uc1: [16, 1] }), t, { m: hm, c: O.hatCol, r: 0.75, b });
    // visière (dessus et dessous)
    const q = R7(secAt(HR, ys[0])), zf = q[4] + q[2] + o, V = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) { const u = r, x = (c / 4 - 0.5) * 0.15, z = zf - 0.01 + u * (pol ? 0.055 : 0.07) - 0.04 * (x / 0.075) ** 2 * (1 - u * 0.4); V.push([x, ys[0] + 0.01 - u * (pol ? 0.016 : 0.012) - 0.01 * (x / 0.075) ** 2, z]); }
    const ix = []; for (let c = 0; c < 4; c++) ix.push(c, c + 5, c + 1, c + 1, c + 5, c + 6);
    const uv = V.map((_, i) => [4 + (i % 5) * 6, 25 + Math.floor(i / 5) * 5]);
    K.add(twoSided({ p: V.flat(), i: ix, uv: uv.flat() }), t, { m: hm, c: pol ? 0x18181a : O.hatCol, r: pol ? 0.3 : 0.7, b });
  }
  if (h === 'firehelmet') { // casque de sapeur-pompier : coque, crête, visière dorée, couvre-nuque
    const t = T(K, 'hat|firehelmet', 32, 32, (P) => TX.paintHat(P, 'firehelmet')), tv = T(K, 'hat|visor', 32, 32, (P) => TX.paintHat(P, 'visor'));
    const shR = (y, k = 1) => { const q = R7(secAt(HR, Math.min(0.176, y))); return R7([y, (q[1] + 0.03) * k, (q[2] + 0.034) * k, (q[3] + 0.034) * k, q[4], 2.2]); };
    const R = [shR(0.05, 1.0), shR(0.11, 1.01), shR(0.155, 0.96), shR(0.19, 0.74), shR(0.205, 0.4)], cols = colsAt(10, -Math.PI);
    K.add(tube(R, cols, cols.map((th) => 16 + th / Math.PI * 16), [28, 20, 12, 5, 1], { c1: [0, 0.21, R[4][4]], uc1: [16, 0.5] }), t, { m: hm, c: O.fireCol, r: 0.25, mt: 0.15, b });
    const q = R7(secAt(HR, 0.065)), V = [], ix = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) { const a = (c / 6 - 0.5) * 2.1, v = r / 2; V.push([Math.sin(a) * (q[1] + 0.05 - v * 0.012), 0.112 - v * 0.1, q[4] + Math.cos(a) * (q[2] + 0.052 + 0.012 * Math.sin(v * Math.PI)) - v * 0.01]); }
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) { const a = r * 7 + c; ix.push(a, a + 7, a + 1, a + 1, a + 7, a + 8); }
    K.add(twoSided({ p: V.flat(), i: ix, uv: V.flatMap((_, i) => [2 + (i % 7) * 4.5, 2 + Math.floor(i / 7) * 13]) }), tv, { m: hm, c: 0xffffff, r: 0.1, mt: 1, b });
    const N = [], ix2 = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 7; c++) { const a = Math.PI / 2 + 0.9 + (c / 6) * (TAU - 1.8), y = 0.05 - r * 0.09, q2 = R7(secAt(HR, 0.03)); N.push([Math.cos(a) * (q2[1] + 0.034 + r * 0.008), y, q2[4] + Math.sin(a) * (q2[3] + 0.034 + r * 0.01)]); }
    for (let c = 0; c < 6; c++) ix2.push(c, c + 7, c + 1, c + 1, c + 7, c + 8);
    K.add(twoSided({ p: N.flat(), i: ix2, uv: N.flatMap(() => [8, 8]) }), null, { m: hm, c: 0x1e2430, r: 0.9, b });
  }
  if (h === 'helmet') { // casque d'astronaute : sphère blanche, visière dorée, collerette
    const t = T(K, 'hat|helmet', 32, 32, (P) => TX.paintHat(P, 'helmet')), tv = T(K, 'hat|visor', 32, 32, (P) => TX.paintHat(P, 'visor'));
    const C = [0, 0.055, 0], Rr = 0.17, rings = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + Math.PI * i / 6; rings.push({ c: [C[0], C[1] + Math.sin(a) * Rr, C[2]], ax: [1, 0, 0], az: [0, 0, 1], rx: Math.cos(a) * Rr + 1e-4, rz: Math.cos(a) * Rr + 1e-4 }); }
    const sph = loftF(rings, 10, (r, c) => [c / 10 * 32, r / 6 * 31], false, false);
    // visière : sommets de face (|θ| < 1, hauteur moyenne) dans la case dorée
    const vis = [], rest = [];
    for (let k = 0; k < sph.i.length; k += 3) { const m = [0, 1, 2].map((j) => sph.p[sph.i[k + j] * 3 + 2]), y = [0, 1, 2].map((j) => sph.p[sph.i[k + j] * 3 + 1]); ((m[0] + m[1] + m[2]) / 3 > 0.08 && Math.abs((y[0] + y[1] + y[2]) / 3 - C[1]) < 0.09 ? vis : rest).push(sph.i[k], sph.i[k + 1], sph.i[k + 2]); }
    K.add({ p: sph.p, i: rest, uv: sph.uv }, t, { m: hm, c: 0xffffff, r: 0.35, b });
    K.add({ p: sph.p, i: vis, uv: sph.uv.map((v, i) => (i % 2 ? 4 + (v / 31) * 24 : 4 + (v / 32) * 24)) }, tv, { m: hm, c: 0xffffff, r: 0.08, mt: 0.6, b });
    K.add(tube([R7([-0.12, 0.11, 0.11, 0.11, -0.005]), R7([-0.085, 0.112, 0.112, 0.112, -0.005])], colsAt(10, -Math.PI), colsAt(10, -Math.PI).map(() => 8), [8, 8]), null, { m: hm, c: 0x90a4ae, r: 0.3, mt: 0.6, b });
  }
}
// détails : ceinturon (radio, étui, menottes), bouteille d'air, sac à dos, tablier, queue et oreilles de chat
function gearPieces(K, pr, O) {
  const T = pr.torso, wt = wTorso(pr), fr = (x, y, o = 0) => { const q = R7(secAt(T, y)); return ringP(q, Math.asin(Math.max(-1, Math.min(1, x / q[1]))) || 0, o)[2]; };
  if (O.duty) {
    const q = R7(secAt(T, 0.98)), zc = q[4];
    K.add(box([0.14, 0.965, zc + q[2] * 0.5], [0.022, 0.05, 0.016]), null, { c: 0x1c1c1c, r: 0.45, w: wt, flat: true }); // radio
    K.add(box([0.155, 1.05, zc + q[2] * 0.55], [0.003, 0.035, 0.003]), null, { c: 0x111111, r: 0.5, w: wt, flat: true }); // antenne
    if (O.duty === 'guard') K.add(box([-0.165, 0.94, zc + 0.02], [0.018, 0.06, 0.018]), null, { c: 0x202020, r: 0.4, w: wt, flat: true }); // étui de lampe
    else { K.add(box([-0.17, 0.93, zc + 0.01], [0.02, 0.075, 0.028]), null, { c: 0x161616, r: 0.4, w: wt, flat: true }); K.add(box([-0.04, 0.975, zc - q[3] - 0.012], [0.03, 0.022, 0.014]), null, { c: 0x161616, r: 0.4, w: wt, flat: true }); }
  }
  if (O.scba) { // appareil respiratoire : bouteille dorsale, sangles
    const q = R7(secAt(T, 1.2)), zb = q[4] - q[3] - 0.07;
    K.add(loftF([{ c: [0, 0.98, zb], ax: [1, 0, 0], az: [0, 0, 1], rx: 0.072, rz: 0.072 }, { c: [0, 1.4, zb], ax: [1, 0, 0], az: [0, 0, 1], rx: 0.072, rz: 0.072 }], 6, (r, c) => [2 + c * 2, r ? 2 : 14], [0, 0.96, zb], [0, 1.43, zb]), null, { c: 0x3a3e42, r: 0.35, mt: 0.4, w: wt, nb: true });
    for (const s of [-1, 1]) K.add(box([s * 0.1, 1.25, q[4] + q[2] - 0.004], [0.022, 0.2, 0.006]), null, { c: 0x1a1a1a, r: 0.7, w: wt, nb: true, flat: true });
  }
  if (O.bag === 'backpack') { const q = R7(secAt(T, 1.2)), zb = q[4] - q[3]; K.add(box([0, 1.2, zb - 0.05], [0.13, 0.17, 0.055]), null, { c: 0x2a2a2e, r: 0.8, w: wt, nb: true, flat: true }); for (const s of [-1, 1]) K.add(box([s * 0.11, 1.28, q[4] + q[2] - 0.002], [0.018, 0.17, 0.005]), null, { c: 0x1e1e20, r: 0.75, w: wt, flat: true }); }
  if (O.apron) { // tablier : panneau à double face de la poitrine aux genoux
    const t = K.use(TX.mat('apron', K.pg)), V = [], ix = [], uv = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const v = r / 3, y = lerp(0.6, 1.33, v), hw = lerp(0.17, y > 1.0 ? 0.1 : 0.16, ss(0.9, 1.08, y)), x = (c / 2 - 0.5) * 2 * hw, z = y > 0.86 ? fr(x, Math.min(1.33, y)) + 0.012 : 0.125; V.push(x, y, z); uv.push(c / 2 * 31 + 0.5, (1 - v) * 31 + 0.5); }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { const a = r * 3 + c; ix.push(a, a + 1, a + 3, a + 1, a + 4, a + 3); }
    K.add(twoSided({ p: V, i: ix, uv }), t, { c: O.apron, r: 0.85, w: (x, y) => (y > 0.97 ? wt(x, y) : wSkirt(0.95, 0.6)(x, y)) });
  }
  if (O.tail) { const P = [[0, 0.97, -0.1], [0, 0.88, -0.17], [0, 0.7, -0.2], [0.03, 0.5, -0.16], [0.06, 0.4, -0.08]], Rr = [0.022, 0.02, 0.017, 0.013, 0.008]; K.add(loftF(P.map((c, i) => { const d = nrm(sub(P[Math.min(4, i + 1)], P[Math.max(0, i - 1)])), ax = nrm(cross(d, [0, 0, 1])); return { c, ax, az: nrm(cross(ax, d)), rx: Rr[i], rz: Rr[i] }; }), 4, () => [8, 8], false, true), null, { c: O.top, r: 0.75, w: () => [[B.hips, 1]], nb: true }); }
  if (O.catEars) for (const s of [-1, 1]) { const H = pr.J.head, S = pr.hs, P = [[H[0] + s * 0.03 * S, H[1] + 0.16 * S, H[2] - 0.01], [H[0] + s * 0.075 * S, H[1] + 0.14 * S, H[2] - 0.01], [H[0] + s * 0.06 * S, H[1] + 0.215 * S, H[2] - 0.005], [H[0] + s * 0.052 * S, H[1] + 0.15 * S, H[2] + 0.02]]; K.add(facets(P, [[0, 1, 2], [0, 2, 3], [1, 3, 2], [0, 3, 1]], P.map(() => [8, 8]), [H[0] + s * 0.05 * S, H[1] + 0.14 * S, H[2] - 0.03]), null, { c: O.top, r: 0.7, b: B.head, flat: true }); }
}
// jupe, robe, blouse longue (double face ; suit le bassin et à moitié les cuisses)
function skirtPiece(K, pr, O) {
  const sk = O.skirt || (O.labcoat ? { c: O.coat, hem: O.hem, top: 1.0, open: true } : null); if (!sk) return;
  const Tt = pr.torso, y0 = sk.top, y1 = sk.hem, seg = 10, rows = [];
  const nr = sk.short ? 2 : 3;
  for (let i = 0; i < nr; i++) { const v = i / (nr - 1), y = lerp(y1, y0, v), q = R7(secAt(Tt, Math.max(Tt[1][0] + 0.03, y))), fl = (1 - v) * (sk.short ? 0.05 : 0.08) + 0.008; rows.push(R7([y, q[1] + fl, q[2] + fl * 0.9, q[3] + fl, q[4], 2.4])); }
  const cols = colsAt(seg, -Math.PI / 2);
  let g = tube(rows, cols, cols.map((_, c) => 32 + c / seg * 32), nr === 2 ? [63.5, 40.5] : [63.5, 52, 40.5], {});
  if (sk.open) { const keep = []; for (let k = 0; k < g.i.length; k += 3) { const z = (g.p[g.i[k] * 3 + 2] + g.p[g.i[k + 1] * 3 + 2] + g.p[g.i[k + 2] * 3 + 2]) / 3, x = (g.p[g.i[k] * 3] + g.p[g.i[k + 1] * 3] + g.p[g.i[k + 2] * 3]) / 3; if (!(z > 0 && Math.abs(x) < 0.04)) keep.push(g.i[k], g.i[k + 1], g.i[k + 2]); } g = { ...g, i: keep }; }
  K.add(twoSided(g), O.tex.pants, { c: sk.c, r: O.topR, w: wSkirt(y0 - 0.05, y1) });
}
// sacs portés à la main gauche (os handL)
function bagPiece(K, pr, O) {
  const h = pr.J.handL;
  if (O.bag === 'shopping') {
    const c = hash(O.top, 1, 9) < 0.5 ? 0xd8c8a8 : pick(seeded(O.top), 4, [0xc62828, 0xf5f5f5, 0x1e88e5, 0x212121]);
    K.add(box([h[0] - 0.035, h[1] - 0.24, h[2] + 0.01], [0.055, 0.135, 0.11]), null, { c, r: 0.85, b: B.handL, flat: true });
    K.add(twoSided({ p: [h[0] - 0.035, h[1] - 0.105, h[2] - 0.035, h[0] - 0.03, h[1] - 0.04, h[2], h[0] - 0.035, h[1] - 0.105, h[2] + 0.035], i: [0, 1, 2], uv: [8, 8, 8, 8, 8, 8] }), null, { c: mul(c, 0.7), r: 0.8, b: B.handL, flat: true });
  }
  if (O.bag === 'delivery') { K.add(box([h[0] - 0.06, h[1] - 0.36, h[2]], [0.055, 0.2, 0.2]), null, { c: 0xc62828, r: 0.6, b: B.handL, flat: true }); K.add(box([h[0] - 0.06, h[1] - 0.14, h[2]], [0.057, 0.025, 0.202]), null, { c: 0x1a1a1a, r: 0.6, b: B.handL, flat: true }); }
}
// objets tenus (os propR, repère « en visée » : +z vers l'avant)
function propPiece(K, pr, O) {
  const p = O.prop; if (!p) return;
  const J = pr.J.propR, m = M4(J[0], J[1], J[2], Math.PI / 2, 0, 0), b = B.propR;
  const cyl = (z0, z1, r0, r1, seg) => loftF([{ c: [0, 0, z0], ax: [1, 0, 0], az: [0, 1, 0], rx: r0, rz: r0 }, { c: [0, 0, z1], ax: [1, 0, 0], az: [0, 1, 0], rx: r1, rz: r1 }], seg, (r, c) => [2 + c * 2, r ? 2 : 14], [0, 0, z0], [0, 0, z1]);
  if (p === 'gun') { K.add(box([0, 0.045, 0.045], [0.014, 0.017, 0.085]), null, { m, c: 0x1a1a1c, r: 0.35, mt: 0.6, b, flat: true }); K.add(box([0, -0.005, -0.04], [0.013, 0.045, 0.017]), null, { m: m.clone().multiply(M4(0, 0, 0, -0.25, 0, 0)), c: 0x141414, r: 0.6, b, flat: true }); }
  if (p === 'torch') { K.add(cyl(-0.08, 0.07, 0.016, 0.016, 6), null, { m, c: 0x1c1c1c, r: 0.35, mt: 0.6, b }); K.add(cyl(0.07, 0.11, 0.024, 0.024, 6), null, { m, c: 0x2a2a2a, r: 0.3, mt: 0.7, b }); K.add(cyl(0.111, 0.113, 0.02, 0.02, 6), null, { m, c: 0xfff4d8, r: 0.1, e: 2.5, b }); }
  if (p === 'nozzle') { K.add(cyl(-0.06, 0.2, 0.025, 0.02, 6), null, { m, c: 0x9a9a9a, r: 0.3, mt: 0.9, b }); const P = [[0, -0.03, -0.06], [0, -0.2, -0.16], [0.05, -0.55, -0.12]]; K.add(loftF(P.map((c, i) => { const d = nrm(sub(P[Math.min(2, i + 1)], P[Math.max(0, i - 1)])), ax = nrm(cross(d, [1, 0, 0])); return { c, ax, az: nrm(cross(ax, d)), rx: 0.022, rz: 0.022 }; }), 5, () => [8, 8], false, false), null, { m, c: 0xb0281e, r: 0.6, b }); }
}

// ───────────────────────── autres corps ─────────────────────────
const sphereRings = (C, Rx, Ry, Rz, n, def) => { const rings = []; for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + Math.PI * i / n, y = C[1] + Math.sin(a) * Ry; rings.push({ c: [C[0], y, C[2]], ax: [1, 0, 0], az: [0, 0, 1], rx: Math.max(1e-4, Math.cos(a) * Rx), rz: Math.max(1e-4, Math.cos(a) * Rz) }); } return def ? rings.map(def) : rings; };
// Bobby (costume d'ours de 1987) : tête ronde au masque peint (yeux boutons, sourire cousu), oreilles dont une affaissée,
// museau, nœud papillon, ventre clair cousu, fermeture dans le dos, pattes
function asmBear(K, pr, o) {
  const J = pr.J, fur = K.use(TX.mat('bearFur', K.pg)), light = K.use(TX.mat('bearLight', K.pg));
  const tt = T(K, 'top|bear', 128, 64, (P) => TX.paintBearTop(P));
  const R = pr.torso, yTop = R[R.length - 1][0], us = TORSO_COLS.map((_, c) => c / 12 * 128);
  K.add(tube(R, TORSO_COLS, us, R.map((q) => (yTop - q[0]) / (yTop - R[0][0]) * 64), { c0: [0, R[0][0] - 0.004, 0], c1: true }), tt, { c: 0xffffff, r: 0.97, w: wTorso(pr) });
  K.add(tube(pr.neckR, colsAt(6, -Math.PI), [0, 5, 10, 16, 21, 26, 31], [30, 16, 2]), fur, { c: 0xffffff, r: 0.97, w: wNeck(J) });
  // tête de mascotte (centre 5 cm au-dessus de l'os de la tête), projetée comme une tête humaine (visage peint)
  const H = J.head, hm = M4(H[0], H[1] + 0.05, H[2] + 0.01), b = B.head, ht = T(K, 'head|bear', 64, 64, (P) => TX.paintBearHead(P));
  const bv = (y) => (0.17 - y) / 0.34 * 64, bu = (x, z) => TX.headU(Math.atan2(x, z));
  const hs = sphereRings([0, 0, 0], 0.19, 0.172, 0.18, 7);
  const hp = loftF(hs, 12, () => [0, 0], false, false); // uv : projection de tête (u selon l'angle, v selon la hauteur)
  hp.uv = []; for (let k = 0; k < hp.p.length; k += 3) hp.uv.push(bu(hp.p[k], hp.p[k + 2]), bv(hp.p[k + 1]));
  K.add(hp, ht, { m: hm, c: 0xffffff, r: 0.97, b });
  // museau : demi-ellipsoïde clair projeté sur la même peinture
  const mz = sphereRings([0, -0.052, 0.115], 0.092, 0.07, 0.085, 4).slice(0);
  const mp = loftF(mz, 8, () => [0, 0], false, false); mp.uv = []; for (let k = 0; k < mp.p.length; k += 3) mp.uv.push(bu(mp.p[k], mp.p[k + 2]), bv(mp.p[k + 1]));
  const keep = []; for (let k = 0; k < mp.i.length; k += 3) if ((mp.p[mp.i[k] * 3 + 2] + mp.p[mp.i[k + 1] * 3 + 2] + mp.p[mp.i[k + 2] * 3 + 2]) / 3 > 0.1) keep.push(mp.i[k], mp.i[k + 1], mp.i[k + 2]);
  K.add({ ...mp, i: keep }, ht, { m: hm, c: 0xffffff, r: 0.95, b });
  for (const s of [-1, 1]) { // oreilles (disques aplatis), la droite affaissée
    const em = hm.clone().multiply(M4(s * 0.132, 0.148 - (s > 0 ? 0.02 : 0), -0.02, 0, 0, s * -0.42 - (s > 0 ? 0.3 : 0)));
    K.add(loftF(sphereRings([0, 0, 0], 0.07, 0.066, 0.026, 4), 8, (r, c) => [c / 8 * 32, r / 4 * 31], false, false), fur, { m: em, c: 0xffffff, r: 0.97, b });
    K.add(loftF(sphereRings([0, 0, 0.018], 0.042, 0.04, 0.012, 2), 6, (r, c) => [c / 6 * 32, r / 2 * 31], false, false), light, { m: em, c: 0xffffff, r: 0.95, b });
  }
  // nœud papillon
  const nz = ringP(R7(secAt(R, 1.46)), 0)[2] + 0.02;
  for (const s of [-1, 1]) K.add(facets([[0, 1.47, nz], [s * 0.07, 1.5, nz - 0.01], [s * 0.07, 1.44, nz - 0.01], [s * 0.035, 1.47, nz + 0.012]], [[0, 1, 3], [0, 3, 2], [3, 1, 2], [0, 2, 1]], [[8, 8], [8, 8], [8, 8], [8, 8]], [s * 0.03, 1.47, nz - 0.03]), null, { c: 0xb71c1c, r: 0.6, w: wTorso(pr), flat: true });
  for (const s of [-1, 1]) {
    const A = SD(s), j = J['arm' + A], rs = armRings(pr).map(([t, a, bb]) => R7([-t, a, bb, bb, 0, 2])).reverse(), cols = colsAt(6, -Math.PI);
    K.add(tube(rs, cols, cols.map((_, c) => c / 6 * 32), rs.map((_, i) => (i % 2 ? 31.5 : 0.5))), fur, { m: M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), c: 0xffffff, r: 0.97, w: wArm(J, s) });
    const hm2 = handMatrix(pr, s), pw = T(K, 'hand|fur', 32, 32, (P) => TX.paintHand(P, 'fur'));
    K.add(loftF(sphereRings([0.005, 0.05, 0], 0.03, 0.06, 0.05, 4), 6, (r, c) => [c / 6 * 32, r / 4 * 31], false, false), pw, { m: hm2, c: 0xffffff, r: 0.97, b: B['hand' + A] });
    const l = J['leg' + A], lr = legRings(pr, false).map(([t, a, bb, z]) => R7([-t, a, bb, bb, z, 2])).reverse();
    K.add(tube(lr, cols, cols.map((_, c) => c / 6 * 32), lr.map((_, i) => (i % 2 ? 31.5 : 0.5))), fur, { m: M4(l[0], l[1], l[2], 0, 0, 0, s, 1, 1), c: 0xffffff, r: 0.97, w: wLeg(J, s) });
    const f = J['foot' + A];
    K.add(loftF(sphereRings([0, -0.025, 0.05], 0.075, 0.06, 0.15, 4), 8, (r, c) => [c / 8 * 32, r < 1 ? 28 : r / 4 * 31], false, false), pw, { m: M4(f[0], f[1], f[2], 0, 0, 0, s, 1, 1), c: 0xffffff, r: 0.95, b: B['foot' + A] });
  }
  const ep = [0.081, 0.037, 0, 0.024]; { const q = Math.atan2(ep[0], 0.16); ep[2] = Math.cos(q) * 0.178 + 0.006; }
  return { eyePos: [ep[0], 0.05 + ep[1], 0.01 + ep[2], ep[3]] };
}
// mannequin de vitrine (1987) : plastique moulé en segments, rotules visibles, visage lisse, mains stylisées
function asmMannequin(K, pr, o) {
  const J = pr.J, pl = K.use(TX.mat('plastic', K.pg)), jt = K.use(TX.mat('joint', K.pg)), rg = 0.32, T0 = pr.torso;
  const us = TORSO_COLS.map((_, c) => c / 12 * 32), vT = (y) => (1.5 - y) / 0.7 * 31;
  const lo = T0.filter((q) => q[0] <= 1.06), hi = [R7([1.075, 0.128, 0.086, 0.088, 0.002, 2.3]), ...T0.filter((q) => q[0] > 1.07)];
  K.add(tube(lo, TORSO_COLS, us, lo.map((q) => vT(q[0])), { c0: [0, 0.796, 0], c1: true }), pl, { c: 0xffffff, r: rg, b: B.hips });
  K.add(tube(hi, TORSO_COLS, us, hi.map((q) => vT(q[0])), { c0: true, c1: true }), pl, { c: 0xffffff, r: rg, b: B.torso });
  K.add(tube(pr.neckR, colsAt(6, -Math.PI), [0, 5, 10, 16, 21, 26, 31], [30, 16, 2]), pl, { c: 0xffffff, r: rg, w: (x, y) => (y < J.neck[1] + 0.03 ? [[B.torso, 1]] : [[B.head, 1]]) });
  const O = { skin: 0xe9e2d4, hair: 0xe9e2d4, eye: 0xe9e2d4, brow: 0xd8d0c0, lip: 0xe9e2d4, hairStyle: 'none', tex: {} };
  O.tex.head = headTile(K, pr, O);
  const H = pr.J.head, hm = M4(H[0], H[1], H[2], 0, 0, 0, pr.hs);
  headPiece(K, pr, O, hm);
  const ball = (c, r, bone) => K.add(loftF(sphereRings(c, r, r, r, 3), 5, (rr, cc) => [cc / 5 * 16, rr / 3 * 15], false, false), jt, { c: 0xffffff, r: 0.45, b: bone });
  for (const s of [-1, 1]) {
    const A = SD(s), j = J['arm' + A], rs = armRings(pr), m = M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), cols = colsAt(6, -Math.PI), ucol = cols.map((_, c) => c / 6 * 32);
    const up = rs.filter((r) => r[0] <= pr.el - 0.025).map(([t, a, b]) => R7([-t, a, b, b, 0, 2])).reverse(), lw = rs.filter((r) => r[0] >= pr.el + 0.025).map(([t, a, b]) => R7([-t, a, b, b, 0, 2])).reverse();
    K.add(tube(up, cols, ucol, up.map((_, i) => 31 - i * 4), { c0: true, c1: true }), pl, { m, c: 0xffffff, r: rg, b: B['arm' + A] });
    K.add(tube(lw, cols, ucol, lw.map((_, i) => 31 - i * 4), { c0: true, c1: true }), pl, { m, c: 0xffffff, r: rg, b: B['elbow' + A] });
    ball([j[0], J['elbow' + A][1], J['elbow' + A][2]], 0.034, B['elbow' + A]); ball(j, 0.05, B['arm' + A]);
    for (const p of handShapes(0.08, 0.95)) K.add(p, pl, { m: handMatrix(pr, s), c: 0xffffff, r: rg, b: B['hand' + A] });
    const l = J['leg' + A], LR = legRings(pr, true), lm = M4(l[0], l[1], l[2], 0, 0, 0, s, 1, 1);
    const th = LR.filter((q) => q[0] <= 0.41).map(([t, a, b, z]) => R7([-t, a, b, b, z, 2])).reverse(), sh = LR.filter((q) => q[0] >= 0.49).map(([t, a, b, z]) => R7([-t, a, b, b, z, 2])).reverse();
    K.add(tube(th, cols, ucol, th.map((_, i) => 31 - i * 5), { c0: true, c1: true }), pl, { m: lm, c: 0xffffff, r: rg, b: B['leg' + A] });
    K.add(tube(sh, cols, ucol, sh.map((_, i) => 31 - i * 5), { c0: true, c1: true }), pl, { m: lm, c: 0xffffff, r: rg, b: B['knee' + A] });
    ball([l[0], J['knee' + A][1], J['knee' + A][2]], 0.045, B['knee' + A]);
    const f = J['foot' + A], fs = shoeShape('flat', 0.92);
    K.add(fs, pl, { m: M4(f[0], f[1], f[2] + 0.006, 0, 0, 0, s * 0.85, 0.9, 1), c: 0xffffff, r: rg, b: B['foot' + A] });
  }
}
// drap de fantôme (costume) : du sommet de la tête au sol, ourlet ondulé, trous des yeux peints
function asmGhost(K, pr, o) {
  const J = pr.J, H = J.head, hy = H[1], sh = K.use(TX.mat('sheet', K.pg));
  const prof = [[0.03, 0.34], [0.5, 0.29], [1.0, 0.265], [1.32, 0.278], [1.45, 0.215], [hy - 0.06, 0.12], [hy + 0.06, 0.124], [hy + 0.14, 0.098], [hy + 0.18, 0.05]];
  const R = prof.map(([y, w]) => R7([y, w, w * 0.78, w * 0.84, -0.012, 2.2])), cols = colsAt(12, -Math.PI);
  const g = tube(R, cols, cols.map((th) => TX.headU(th)), R.map((q) => (q[0] > hy - 0.07 ? (hy + 0.19 - q[0]) / 0.26 * 26 : 26 + (hy - 0.07 - q[0]) / (hy - 0.1) * 37)), { def: (v, r) => (r === 0 ? [v[0], v[1] + 0.03 * Math.sin(v[0] * 30 + v[2] * 20), v[2]] : v), c1: [0, hy + 0.195, -0.012], uc1: [32, 0.5] });
  K.add(twoSided(g), sh, { c: 0xffffff, r: 0.92, w: (x, y) => (y > 1.25 ? [[B.torso, 1 - ss(hy - 0.12, hy - 0.04, y)], [B.head, ss(hy - 0.12, hy - 0.04, y)]] : wSkirt(1.2, 0.2)(x, y)) });
  for (const s of [-1, 1]) {
    const A = SD(s), j = J['arm' + A], rs = armRings(pr).map(([t, a, b]) => R7([-t, a * 1.25, b * 1.3, b * 1.3, 0, 2])).reverse(), c6 = colsAt(6, -Math.PI);
    K.add(tube(rs, c6, c6.map((_, c) => c / 6 * 60), rs.map((_, i) => 60 - i * 5)), sh, { m: M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), c: 0xffffff, r: 0.92, w: wArm(J, s) });
    K.add(loftF(sphereRings([0, 0.03, 0], 0.036, 0.062, 0.046, 3), 6, (r, c) => [c / 6 * 60, 40 + r * 4], false, false), sh, { m: handMatrix(pr, s), c: 0xffffff, r: 0.92, b: B['hand' + A] });
  }
}
// combinaison d'astronaute : volumes gonflés, sac dorsal, casque à visière dorée
function asmAstronaut(K, pr, o) {
  const O = dress({ outfit: 'astro', shirt: 0xeceff1, pants: 0xeceff1, skin: 0xd8b090, hat: 'helmet', hairStyle: 'none', seed: 4 }, pr);
  Object.assign(O, { top: 0xeceff1, pants: 0xeceff1, collar: 'none', gloves: 0xe0e0e0, shoe: 'boot', shoeC: 0xd5d8da, waistY: 1.0, patch: null, sleeve: 'long', topR: 0.7, pantsR: 0.7 });
  O.tex = { head: headTile(K, pr, O), skin: TX.mat('skin', K.pg) };
  O.tex.top = T(K, 'top|astro', 128, 64, (P) => { TX.paintTop(P, { style: 'astro', seed: 1 }); for (let u = 0; u < 128; u++) { P.set(u, 2, 0x90a4ae, 0); P.set(u, 63, 0x90a4ae, 0); } P.fill(38, 14, 6, 4, 0xffffff, 0); P.fill(38, 14, 2, 4, 0x1e3a8a, 0); P.fill(42, 14, 2, 4, 0xc62828, 0); P.disc(23, 17, 3, 0x1e3a8a, 0); P.disc(23, 17, 1.5, 0xf2f2f2, 0); });
  O.tex.sleeve = T(K, 'sleeve|astro', 32, 64, (P) => TX.paintSleeve(P, { style: 'astro', elbow: 30, rings: [28, 31, 58], patch: 'flag' }));
  O.tex.pants = T(K, 'pants|astro', 64, 64, (P) => TX.paintPants(P, { style: 'plain' }));
  O.tex.shoe = T(K, 'shoe|boot', 32, 32, (P) => TX.paintShoe(P, 'boot'));
  O.tex.hand = T(K, 'hand|glove', 32, 32, (P) => TX.paintHand(P, 'glove'));
  O.sl = pr.el + pr.wr;
  torsoPieces(K, pr, O); neckPiece(K, pr, O);
  const H = pr.J.head, hm = M4(H[0], H[1], H[2], 0, 0, 0, pr.hs);
  headPiece(K, pr, O, hm); hatPieces(K, pr, O, hm);
  const q = R7(secAt(pr.torso, 1.2));
  K.add(box([0, 1.2, q[4] - q[3] - 0.07], [0.17, 0.23, 0.075]), null, { c: 0xdfe3e6, r: 0.6, w: wTorso(pr), nb: true, flat: true });
  K.add(box([0, 1.26, ringP(R7(secAt(pr.torso, 1.26)), 0)[2] + 0.01], [0.06, 0.04, 0.014]), null, { c: 0x546e7a, r: 0.4, w: wTorso(pr), flat: true });
  for (const s of [-1, 1]) { armPieces(K, pr, O, s); legPieces(K, pr, O, s); handPiece(K, pr, O, s); shoePiece(K, pr, O, s); }
  return O;
}
// linceul de l'Ombre : capuche pointue (tête) et manteau en lambeaux des épaules aux tibias (double face)
function shroud(K, pr) {
  const Tt = pr.torso, J = pr.J, H = J.head, HR = pr.headR;
  const hood = [-0.06, 0.02, 0.1, 0.16, 0.22].map((y, i) => { const q = R7(secAt(HR, Math.min(0.17, y))), k = [1.25, 1.3, 1.2, 0.95, 0.2][i]; return R7([y, q[1] * k + 0.01, (q[2] + 0.02) * k, (q[3] + 0.03) * k, q[4] - 0.03 * i, 2.2]); });
  const c8 = colsAt(8, -Math.PI);
  K.add(twoSided(tube(hood, c8, c8.map(() => 8), hood.map(() => 8), { def: (v, r, c, th) => [v[0], v[1], v[2] - (Math.cos(th) > 0.55 && r > 0 && r < 4 ? 0.05 * (Math.cos(th) - 0.55) : 0)], c1: [0, 0.24, -0.16] })), null, { m: M4(H[0], H[1], H[2]), c: 0x080808, r: 1, b: B.head });
  const rows = [];
  for (let i = 0; i < 4; i++) { const v = i / 3, y = lerp(0.28, 1.47, v), q = R7(secAt(Tt, Math.max(0.87, Math.min(1.45, y)))), fl = (1 - v) * 0.12 + 0.03; rows.push(R7([y, q[1] + fl + (y > 1.3 ? 0.05 : 0), q[2] + fl * 0.8, q[3] + fl, q[4], 2.3])); }
  const c10 = colsAt(10, -Math.PI);
  let cl = tube(rows, c10, c10.map(() => 8), rows.map(() => 8), { def: (v, r, c) => (r === 0 ? [v[0], v[1] + 0.09 * hash(c, 3, 1) - 0.02, v[2]] : v) });
  const keep = []; for (let k = 0; k < cl.i.length; k += 3) { const z = (cl.p[cl.i[k] * 3 + 2] + cl.p[cl.i[k + 1] * 3 + 2] + cl.p[cl.i[k + 2] * 3 + 2]) / 3, x = (cl.p[cl.i[k] * 3] + cl.p[cl.i[k + 1] * 3] + cl.p[cl.i[k + 2] * 3]) / 3, y = (cl.p[cl.i[k] * 3 + 1] + cl.p[cl.i[k + 1] * 3 + 1] + cl.p[cl.i[k + 2] * 3 + 1]) / 3; if (!(z > 0.02 && Math.abs(x) < 0.05 + (1.45 - y) * 0.08)) keep.push(cl.i[k], cl.i[k + 1], cl.i[k + 2]); }
  cl = { ...cl, i: keep };
  K.add(twoSided(cl), null, { c: 0x080808, r: 1, w: (x, y) => (y > 1.0 ? wTorso(pr)(x, y) : wSkirt(0.95, 0.3)(x, y)) });
}

// ───────────────────────── assemblage ─────────────────────────
function asmHuman(K, pr, o) {
  const O = dress(o, pr); O.seed = o.seed ?? 1;
  outfitTiles(K, pr, O);
  const H = pr.J.head, hm = M4(H[0], H[1], H[2], 0, 0, 0, pr.hs);
  if (pr.gaunt) O.tex.top = O.tex.pants = K.use(TX.mat(pr.kind === 'crawler' ? 'ribs' : 'gauntSkin', K.pg)), O.tex.skin = K.use(TX.mat('gauntSkin', K.pg));
  if (pr.gaunt) { // corps décharné : torse nu (côtes peintes), membres nus
    const R = pr.torso, us = TORSO_COLS.map((_, c) => c / 12 * 32), yTop = R[R.length - 1][0];
    K.add(tube(R, TORSO_COLS, us, R.map((q) => (yTop - q[0]) / (yTop - R[0][0]) * 31.5), { def: torsoDef(pr, O), c0: [0, R[0][0] - 0.004, 0], c1: true }), O.tex.top, { c: 0xffffff, r: 0.5, w: wTorso(pr) });
  } else torsoPieces(K, pr, O);
  neckPiece(K, pr, O); headPiece(K, pr, O, hm); hairPieces(K, pr, O, hm); hatPieces(K, pr, O, hm); gearPieces(K, pr, O); skirtPiece(K, pr, O); bagPiece(K, pr, O); propPiece(K, pr, O);
  if (pr.kind === 'shadow') shroud(K, pr);
  for (const s of [-1, 1]) {
    if (pr.gaunt) { // bras et jambes nus, mains griffues, pieds nus
      const gO = { ...O, sleeve: 'none', skirt: true, legs: 0xffffff, skin: 0xffffff };
      armPieces(K, pr, gO, s); legPieces(K, pr, gO, s); handPiece(K, pr, gO, s);
      const f = pr.J['foot' + SD(s)];
      K.add(shoeShape('flat', 1.12), O.tex.skin, { m: M4(f[0], f[1], f[2] + 0.01, 0, 0, 0, s * 0.62, 0.7, 1), c: 0xffffff, r: 0.5, b: B['foot' + SD(s)] });
    } else { armPieces(K, pr, O, s); legPieces(K, pr, O, s); handPiece(K, pr, O, s); if (O.shoe !== 'none') shoePiece(K, pr, O, s); }
  }
  return O;
}
const ASM = { bear: asmBear, mannequin: asmMannequin, ghost: asmGhost, astronaut: asmAstronaut };

// ───────────────────────── matériaux ─────────────────────────
// texture de l'atlas : texels × (couleur du sommet selon le masque de teinte alpha) ; sommets calés sur la grille PS1,
// placage en partie affine
function ps1Patch(m, snap = PS1.snap) {
  const base = m.onBeforeCompile, key = m.customProgramCacheKey(), af = PS1.affine.toFixed(3), sn = snap > 0 ? snap.toFixed(1) : '';
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.vertexShader = 'varying vec3 vPs1Aff;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' +
      (sn ? `\t{ vec2 g = vec2( ${sn} * projectionMatrix[1][1] / projectionMatrix[0][0], ${sn} ) * 0.5; gl_Position.xy = floor( gl_Position.xy / gl_Position.w * g + 0.5 ) / g * gl_Position.w; }\n` : '') +
      '\tvPs1Aff = vec3( vMapUv * gl_Position.w, gl_Position.w );');
    sh.fragmentShader = 'varying vec3 vPs1Aff;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `vec4 ps1Tex = texture2D( map, mix( vMapUv, vPs1Aff.xy / vPs1Aff.z, ${af} ) );\n\tdiffuseColor.rgb *= ps1Tex.rgb;`)
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix( vec3( 1.0 ), vColor, ps1Tex.a );');
  };
  m.customProgramCacheKey = () => key + '|ps1' + sn + af;
  const obr = m.onBeforeRender; // cases d'atlas peintes depuis le dernier rendu : envoyées avant de dessiner
  m.onBeforeRender = function (r, s, c, g, o, gr) { TX.flushAtlas(); obr.call(this, r, s, c, g, o, gr); };
  return m;
}
const _mats = new Map();
const humanMat = (pg = 0) => { let m = _mats.get(pg); if (!m) { m = ps1Patch(new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.pageTex(pg), roughness: 0.85, metalness: 0, envMap: ENV.map, envMapIntensity: 0.6 })); m.userData.page = pg; _mats.set(pg, m); } return m; };
// objet tenu affiché selon la pose : l'arme (lâchée mains en l'air ou à terre), la lampe allumée, la lance en action
const PROP_POSES = { gun: (p) => p !== 'cheer' && p !== 'dead' && p !== 'tpose' && p !== 'crawl' && p !== 'sit', torch: (p) => p === 'flashlight', nozzle: (p) => p === 'aim' };

// opts : {shirt, pants, skin, hair, shoes, hat ('cap' | 'police' | 'helmet' | 'balaclava' | 'firehelmet'), hatColor,
//   kind ('human' | 'mannequin' | 'bear' | 'firefighter' | 'police' | 'ghost' | 'astronaut' | 'crawler' | 'shadow'), height,
//   female, child, seed, outfit ('guard' | 'casual' | 'shop' | 'polo' | 'dress' | 'robber' | 'catsuit' | 'clown'…),
//   hairStyle, mustache, beard, glasses, belly, age, bag ('shopping' | 'backpack' | 'delivery'), prop ('gun' | 'torch' |
//   'nozzle'), shop, badge, sleeves, ghostly, bow, glowEyes}
export function buildHumanoid(opts = {}) {
  const kind = opts.kind || 'human';
  const H = opts.height || 1.78, k = H / 1.78;
  const root = new THREE.Group(); root.name = 'humanoid';
  const body = new THREE.Group(); root.add(body); body.scale.setScalar(k);
  const pr = profile(opts, kind), bones = makeBones(pr.J);
  // toutes les cases d'un personnage sur la même page de l'atlas (une page pleine : la suivante)
  let K = null, O = null;
  for (let pg = 0; pg < 8 && !K; pg++) {
    try { K = new Kit(pg); K.y0 = pr.legs.hips - 0.15; O = (ASM[kind] || asmHuman)(K, pr, opts) || {}; }
    catch (e) { if (K) for (const t of K.tiles) TX.release(t); if (e.message !== 'PAGE_PLEINE') throw e; K = null; }
  }
  body.add(bones.hips);
  const mesh = new THREE.SkinnedMesh(K.geometry(), humanMat(K.pg));
  mesh.name = 'body'; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.4);
  body.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(BN.map((n) => bones[n])), mesh.matrixWorld);
  const parts = { ...bones };
  if (kind === 'mannequin') { // socle (costume ; masqué pour la présence)
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.35, metalness: 0.6 }));
    st.position.y = 0.015; st.receiveShadow = true; root.add(st); parts.stand = st;
  }
  root.userData.parts = parts; root.userData.kind = kind;
  root.userData.anim = { phase: 0, speed: 0 };
  root.userData.tiles = K.tiles;
  const L = pr.legs; root.userData.legs = { L1: L.leg - L.knee, L2: L.knee - L.foot, LF: L.foot, k: L.leg / 0.93 };
  root.userData.propPoses = O.prop ? PROP_POSES[O.prop] : undefined; root.userData.prop = O.prop || null;
  root.userData.back = -K.zb; root.userData.backW = -K.zb * k; // couché sur le dos : dos, fessiers et crâne posés au sol
  if (O.eyePos) root.userData.eyePos = O.eyePos;
  else { const e = headSurf(pr.headR, pr.L.eyeTh, pr.L.eyeY), S = pr.hs; root.userData.eyePos = [e[0] * S, e[1] * S, (e[2] - (pr.gaunt ? 0.009 : 0.003)) * S, (pr.c ? 0.013 : 0.0118) * S]; } // yeux (repère de la tête) : x, y, z, rayon
  if (!O.prop) bones.propR.scale.setScalar(0.001);
  return root;
}

// Animation de marche / pose. speed en m/s. pose : 'idle' | 'walk' | 'run' | 'crouch' | 'sit' | 'reach' | 'aim' | 'tpose' |
// 'dead' | 'crawl' | 'cheer' | 'hunched' | 'flashlight' | poses de mannequin 0..4 (nombre). Le bassin se cale sur le
// pied d'appui (plus de pieds qui flottent), les pieds restent à plat, le buste contre-tourne le bassin. Longueurs des
// jambes par personnage (userData.legs : cuisse, tibia, cheville ; k : rapport à l'adulte) ; adulte par défaut.
const LEG0 = { L1: 0.43, L2: 0.42, LF: 0.08, k: 1 };
// os remis à zéro à chaque image (liste et fonction hors de animateHumanoid : rien n'est alloué par personnage et par image)
const ANIM_BONES = ['hips', 'torso', 'neck', 'head', 'handL', 'handR', 'footL', 'footR', 'legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR'];
const legReach = (Lg, a, b) => Lg.L1 * Math.cos(a) + 0.005 * Math.sin(a) + Lg.L2 * Math.cos(a + b) - 0.01 * Math.sin(a + b) + Lg.LF; // os de la cuisse et du tibia (légèrement inclinés au repos)
const NO_EXTRA = {};
export function animateHumanoid(h, dt, speed, pose = 'auto', extra = NO_EXTRA) {
  const P = h.userData.parts, A = h.userData.anim, Lg = h.userData.legs || LEG0;
  const moving = speed > 0.15;
  A.phase += dt * (moving ? 2.2 + speed * 1.6 : 1.2);
  const s = Math.sin(A.phase * 2);
  const amp = moving ? Math.min(1, speed / 3) : 0;
  h.rotation.x = 0;
  for (let i = 0; i < ANIM_BONES.length; i++) P[ANIM_BONES[i]].rotation.set(0, 0, 0);
  P.hips.position.z = 0;
  const pp = h.userData.propPoses;
  if (pp) P.propR.scale.setScalar(pp(pose) ? 1 : 0.001);
  if (typeof pose === 'number') { mannequinPose(P, pose); return; }
  const crouch = pose === 'crouch' || pose === 'crawl';
  P.legL.rotation.x = s * 0.7 * amp + (crouch ? -1.2 : 0); P.legR.rotation.x = -s * 0.7 * amp + (crouch ? -1.2 : 0);
  P.kneeL.rotation.x = Math.max(0, -s) * 0.9 * amp + (crouch ? 1.9 : 0.04); P.kneeR.rotation.x = Math.max(0, s) * 0.9 * amp + (crouch ? 1.9 : 0.04);
  // bassin à la hauteur de la jambe d'appui (la plus longue verticalement)
  P.hips.position.y = Math.max(legReach(Lg, P.legL.rotation.x, P.kneeL.rotation.x), legReach(Lg, P.legR.rotation.x, P.kneeR.rotation.x)) + 0.02 + (moving ? 0 : Math.sin(A.phase) * 0.003);
  P.armL.rotation.x = -s * 0.6 * amp; P.armR.rotation.x = s * 0.6 * amp;
  P.elbowL.rotation.x = -0.25 - amp * 0.3 - Math.max(0, -s) * 0.2 * amp; P.elbowR.rotation.x = -0.25 - amp * 0.3 - Math.max(0, s) * 0.2 * amp;
  P.armL.rotation.z = -0.07 - amp * 0.03; P.armR.rotation.z = 0.07 + amp * 0.03;
  P.torso.rotation.x = crouch ? 0.35 : (pose === 'run' ? 0.15 : 0.02) + (moving ? 0 : Math.sin(A.phase * 0.7) * 0.006);
  P.hips.rotation.y = -s * 0.07 * amp; P.torso.rotation.y = s * 0.13 * amp;
  P.head.rotation.x = extra.pitch ? -extra.pitch * 0.6 : 0; P.head.rotation.y = -s * 0.06 * amp;
  P.handL.rotation.x = P.handR.rotation.x = -0.1;
  if (pose === 'sit') { P.hips.position.y = 0.5 * Lg.k; P.legL.rotation.x = P.legR.rotation.x = -1.5; P.kneeL.rotation.x = P.kneeR.rotation.x = 1.95; P.legL.rotation.z = -0.06; P.legR.rotation.z = 0.06; P.armL.rotation.x = P.armR.rotation.x = -0.3; P.elbowL.rotation.x = P.elbowR.rotation.x = -0.7; P.torso.rotation.x = -0.04; }
  if (pose === 'reach' || extra.holding) { P.armR.rotation.x = -1.1; P.elbowR.rotation.x = -0.4; }
  if (pose === 'aim') { P.armR.rotation.x = -1.5; P.armL.rotation.x = -1.4; P.armL.rotation.z = 0.34; P.armR.rotation.z = -0.08; P.elbowR.rotation.x = 0; P.elbowL.rotation.x = -0.2; P.handR.rotation.x = 0; P.torso.rotation.y = 0.12; P.head.rotation.y = -0.1; }
  if (pose === 'flashlight') { P.armR.rotation.x = -1.42 - (extra.pitch || 0); P.armR.rotation.z = -0.12; P.elbowR.rotation.x = -0.1; P.handR.rotation.x = 0; }
  if (pose === 'tpose') { P.armL.rotation.z = -1.5; P.armR.rotation.z = 1.5; P.armL.rotation.x = P.armR.rotation.x = 0; P.elbowL.rotation.x = P.elbowR.rotation.x = 0; }
  if (P.stand) P.stand.rotation.x = pose === 'dead' ? Math.PI / 2 : 0; // mannequin tombé : le socle reste à plat
  if (pose === 'dead') { h.rotation.x = -Math.PI / 2; P.hips.position.y = 0.15 * Lg.k; P.hips.position.z = h.userData.back ?? 0.11; P.armL.rotation.set(0.15, 0, -0.55); P.armR.rotation.set(-0.1, 0, 0.4); P.elbowL.rotation.x = -0.4; P.elbowR.rotation.x = -0.15; P.legL.rotation.set(0, 0, -0.08); P.legR.rotation.set(-0.12, 0, 0.1); P.kneeL.rotation.x = 0.05; P.kneeR.rotation.x = 0.25; P.head.rotation.set(0, 0.45, 0.1); P.torso.rotation.set(0, 0, 0); P.hips.rotation.set(0, 0, 0); }
  if (pose === 'crawl') { // à quatre pattes : genoux au sol ; chaque main se pose à plat (bras résolu de l'épaule au poignet)
    const m = moving ? 1 : 0.25, tp = 1.3, c = Math.cos(A.phase * 2);
    P.torso.rotation.set(tp, 0, 0); P.hips.rotation.set(0, 0, 0); P.hips.position.y = 0.38 * Lg.k;
    P.legL.rotation.set(-0.86 + s * 0.22 * m, 0, -0.08); P.legR.rotation.set(-0.86 - s * 0.22 * m, 0, 0.08); P.kneeL.rotation.x = P.kneeR.rotation.x = 2.42;
    for (const [A2, ph, up] of [['L', s, c], ['R', -s, -c]]) { // main en diagonale du genou opposé ; levée quand elle revient vers l'avant
      const arm = P['arm' + A2], el = P['elbow' + A2], hd = P['hand' + A2], sg = A2 === 'L' ? -1 : 1, l1 = el.position.length(), l2 = hd.position.length();
      const sy = P.hips.position.y + arm.position.y * Math.cos(tp) - arm.position.z * Math.sin(tp), d = 0.1 + 0.13 * ph * m, dy = sy - 0.035 * l2 / 0.255 - 0.06 * Math.max(0, up) * m;
      const D = Math.min(l1 + l2 - 1e-4, Math.hypot(d, dy)), al = Math.acos(Math.min(1, (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D))), be = Math.PI - Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2))));
      const ts = Math.atan2(d, dy) - al; // bras vers l'arrière, coude plié vers l'arrière, avant-bras vers l'avant
      arm.rotation.set(-ts - tp, 0, sg * 0.1); el.rotation.x = -be;
      hd.rotation.set(-(Math.PI / 2 - ts - be) * 0.85, -sg * 1.2, 0); // poignet en extension, paume tournée vers le sol
    }
    P.neck.rotation.x = -0.75; P.head.rotation.set(-0.35, 0, 0);
  }
  if (pose === 'cheer') { P.armL.rotation.set(-2.85 + s * 0.15, 0, -0.32); P.armR.rotation.set(-2.85 - s * 0.15, 0, 0.32); P.elbowL.rotation.x = P.elbowR.rotation.x = -0.45; P.handL.rotation.x = P.handR.rotation.x = 0.3; }
  if (pose === 'hunched') { P.torso.rotation.x = 0.55; P.neck.rotation.x = -0.4; P.armL.rotation.x = -0.4 + s * 0.3; P.armR.rotation.x = -0.4 - s * 0.3; P.elbowL.rotation.x = P.elbowR.rotation.x = -1.2; }
  // pieds à plat : compensent la chaîne hanche-genou (talon-pointe en marchant)
  const fl = pose === 'dead' ? 0 : pose === 'crawl' ? 1.05 : -(P.legL.rotation.x + P.kneeL.rotation.x) * (moving && !crouch ? 0.75 : 1), fr = pose === 'dead' ? 0 : pose === 'crawl' ? 1.05 : -(P.legR.rotation.x + P.kneeR.rotation.x) * (moving && !crouch ? 0.75 : 1);
  P.footL.rotation.x = pose === 'dead' ? 0.45 : fl; P.footR.rotation.x = pose === 'dead' ? 0.35 : fr;
}

function mannequinPose(P, i) {
  // [bras L, bras R, coude L, coude R, tête] (rotation z négative : bras L vers l'extérieur)
  const poses = [
    { aL: [0, 0, -0.12], aR: [0, 0, 0.12], eL: -0.15, eR: -0.15, h: [0, 0, 0] },
    { aL: [0.2, 0, -0.62], aR: [-0.2, 0, 0.12], eL: -1.75, eR: -0.25, h: [0, 0.4, 0] },
    { aL: [0, 0, -1.2], aR: [-1.0, 0, 0.2], eL: -0.2, eR: -0.35, h: [0.2, -0.3, 0] },
    { aL: [-2.4, 0, -0.2], aR: [-2.4, 0, 0.2], eL: -0.15, eR: -0.15, h: [-0.3, 0, 0] },
    { aL: [-1.4, 0, 0], aR: [-1.4, 0, 0], eL: -0.08, eR: -0.08, h: [0, 0, 0] }, // bras tendus (en approche)
  ];
  const p = poses[i % poses.length];
  P.armL.rotation.set(...p.aL); P.armR.rotation.set(...p.aR); P.head.rotation.set(...p.h); P.elbowL.rotation.x = p.eL; P.elbowR.rotation.x = p.eR;
  P.legL.rotation.x = P.legR.rotation.x = 0; P.kneeL.rotation.x = P.kneeR.rotation.x = 0; P.hips.position.y = 0.95; P.torso.rotation.x = 0;
}

export function setHumanoidLayer(h, layer) { h.traverse(o => o.layers.set(layer)); }
// lentille de la lampe tenue (pose « flashlight ») en coordonnées monde, ou null : la lampe est dans l'axe de la main
// (repère de l'os propR, lentille 11 cm vers le bout des doigts), sa tête et son faisceau pointent devant le personnage
const TORCH_LENS = new THREE.Vector3(0, -0.112, 0);
export function torchLens(h, out = new THREE.Vector3()) {
  const b = h.userData.parts?.propR; if (h.userData.prop !== 'torch' || !b || b.scale.x < 0.5) return null;
  b.updateWorldMatrix(true, false); return out.copy(TORCH_LENS).applyMatrix4(b.matrixWorld);
}
// libère la géométrie, les matériaux et le squelette propres à un personnage ou une présence retirés de la scène, et ses
// cases d'atlas (les visages qui ne servent plus peuvent être repeints pour d'autres)
export function disposeHumanoid(h) {
  h.traverse((o) => { if (!o.isMesh) return; o.geometry.dispose(); if (![..._mats.values()].includes(o.material)) o.material.dispose(); if (o.isSkinnedMesh) o.skeleton.dispose(); });
  for (const t of h.userData.tiles || []) TX.release(t);
  h.userData.tiles = null;
}

// Matériaux éclairés comme le décor (patchZone : ambiance de la zone de la présence, ouvertures, masque des lumières du
// pool, part directe pour la SSAO) ; rugosité, métal et émission lus par sommet. Chaque présence a son propre uniform.
function perVertexPBR(m) {
  const base = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.vertexShader = 'attribute vec3 rme;\nvarying vec3 vRme;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvRme = rme;');
    sh.fragmentShader = 'varying vec3 vRme;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRme.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRme.y;').replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * vRme.z;');
  };
  m.customProgramCacheKey = () => key + 'h';
}
export function litHumanoid(root) {
  const u = { value: new THREE.Color(0, 0, 0) }; const cache = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.material || o.material.isMeshBasicMaterial || o.material.isShaderMaterial) return;
    let m = cache.get(o.material);
    if (!m) {
      const atlas = [..._mats.values()].includes(o.material);
      m = o.material.clone(); patchZone(m, u); if (o.geometry.attributes.rme) perVertexPBR(m); if (atlas) ps1Patch(m);
      cache.set(o.material, m);
    }
    o.material = m;
  });
  root.userData.zoneU = u;
  return u;
}

// ───────────────────────── bras à la première personne ─────────────────────────
// Repère de la main canonique (poignet à l'origine) ; m : placement (la main droite est le miroir de la gauche) ;
// l'avant-bras part du poignet vers fa (repère canonique). o : {m, grip, skin, glove, fat, sleeve, cuff ('shirt' | 'rib' |
// 'ring' | 'ruff' | 'none'), band (bande réfléchissante), watch, fur, plastic} ; peu de polygones, textures de l'atlas
// (page 0) : main (peau, gant, patte de fourrure, plastique), manche de la tenue
const _pinned = new Set();
const fpTiles = (o) => {
  const hand = o.fur ? 'fur' : o.plastic ? 'plastic' : o.glove != null ? 'glove' : 'bare';
  const th = TX.tile('hand|' + hand, 32, 32, (P) => TX.paintHand(P, hand), 0);
  const sk = { style: o.fur ? 'fur' : 'fp', short: false, elbow: 30, cuffRib: o.cuff === 'rib', bands: o.band ? [20] : null, fur: o.fur ? 0xb07434 : undefined, plastic: o.plastic ? 0xe9e2d4 : undefined };
  const ts = TX.tile('sleeve|' + JSON.stringify(sk), 32, 64, (P) => TX.paintSleeve(P, sk), 0);
  for (const t of [th, ts]) if (!_pinned.has(t)) { _pinned.add(t); TX.acquire(t); } // la géométrie des bras ne libère rien : cases épinglées
  return { th, ts, skin: TX.mat('skin', 0), white: TX.mat('white', 0), metal: TX.mat('metal', 0) };
};
export function buildFPArm(o) {
  const K = new Kit(0), m = o.m, fat = o.fat || 1, skin = o.skin ?? 0xd8a888, hc = o.fur ? 0xffffff : o.plastic ? 0xffffff : o.glove ?? skin, hr = o.glove ? 0.7 : o.plastic ? 0.32 : 0.55, t = fpTiles(o);
  for (const p of handShapes(o.grip ?? 0.8, fat, true)) K.add(p, t.th, { m, c: hc, r: o.fur ? 0.95 : hr, b: 0 });
  // avant-bras : poignet nu puis manchette et manche, le long de fa
  const fa = nrm(o.fa || [0.1, -1, -0.5]), ax = nrm(cross(fa, [0, 0, 1])), az = cross(ax, fa);
  const fm = m.clone().multiply(new THREE.Matrix4().makeBasis(new THREE.Vector3(...ax), new THREE.Vector3(...fa.map((v) => -v)), new THREE.Vector3(...az.map((v) => -v)))); // +x local : dos de la main
  const k = fat, sl = o.sleeve ?? 0x2b3a55, cuffY = -0.055, c8 = colsAt(8, -Math.PI);
  const arm = [[-0.42, 0.05, 0.052], [-0.24, 0.043, 0.047], [-0.1, 0.033, 0.037], [-0.03, 0.025, 0.03], [0.008, 0.022, 0.028]].map(([y, a, b]) => R7([y, a * k, b * k, b * k, 0, 2.2]));
  if (o.cuff !== 'none') {
    const sleeve = [[-0.43, 0.058, 0.06], [-0.26, 0.053, 0.056], [-0.12, 0.047, 0.05], [cuffY - 0.006, 0.042, 0.046]].map(([y, a, b]) => R7([y, a * k, b * k, b * k, 0, 2.2]));
    K.add(tube(sleeve, c8, c8.map((_, c) => c / 8 * 32), sleeve.map((q) => 63.5 - (q[0] - (cuffY - 0.006)) / (-0.43 - (cuffY - 0.006)) * 40), { c1: true }), t.ts, { m: fm, c: o.fur ? 0xffffff : o.plastic ? 0xffffff : sl, r: o.fur ? 0.95 : 0.85, b: 0 });
    const cy0 = cuffY - 0.04;
    if (o.cuff === 'ruff') for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; K.add(loftF(sphereRings([0, 0, 0], 0.02, 0.008, 0.014, 2), 4, () => [8, 8], false, false), t.white, { m: fm.clone().multiply(M4(Math.cos(a) * 0.04, cuffY, Math.sin(a) * 0.044, 0, -a, 0.5)), c: 0xf6f6f6, r: 0.8, b: 0 }); }
    else {
      const cf = [R7([cy0, 0.046 * k, 0.05 * k, 0.05 * k, 0, 2.2]), R7([cuffY, 0.046 * k, 0.05 * k, 0.05 * k, 0, 2.2])];
      K.add(tube(cf, c8, c8.map((_, c) => c / 8 * 32), [56, 63.5], {}), o.cuff === 'ring' ? t.metal : t.ts, { m: fm, c: o.cuff === 'ring' ? 0x90a4ae : o.fur ? 0xffffff : mul(sl, o.cuff === 'rib' ? 0.88 : 0.95), r: o.cuff === 'ring' ? 0.35 : 0.8, mt: o.cuff === 'ring' ? 0.6 : 0, b: 0 });
      if (o.cuff === 'shirt') K.add(box([0.047 * k, cuffY - 0.02, 0.012], [0.002, 0.005, 0.005]), t.white, { m: fm, c: mul(sl, 0.6), r: 0.35, b: 0, flat: true });
    }
    if (o.band) { const bd = [R7([-0.2, 0.051 * k, 0.054 * k, 0.054 * k, 0, 2.2]), R7([-0.17, 0.05 * k, 0.053 * k, 0.053 * k, 0, 2.2])]; K.add(tube(bd, c8, c8.map((_, c) => c / 8 * 32), [20.5, 22.5], { off: () => 0.003 }), t.ts, { m: fm, c: 0xffffff, r: 0.35, e: 0.12, b: 0 }); }
  }
  K.add(tube(arm, c8, c8.map((_, c) => c / 8 * 16), arm.map((q, i) => 1 + i * 3), {}), o.glove != null || o.fur || o.plastic ? t.th : t.skin, { m: fm, c: o.glove ?? (o.fur || o.plastic ? 0xffffff : skin), r: o.plastic ? 0.32 : 0.55, b: 0 });
  if (o.watch) { // montre : bracelet, boîtier, verre
    const wb = [R7([-0.045, 0.029 * k, 0.034 * k, 0.034 * k, 0, 2.2]), R7([-0.03, 0.028 * k, 0.033 * k, 0.033 * k, 0, 2.2])];
    K.add(tube(wb, c8, c8.map(() => 8), [8, 8], { off: () => 0.003 }), t.white, { m: fm, c: 0x1c1c1c, r: 0.5, b: 0 });
    K.add(loftF([{ c: [0.0225, -0.0375, 0], ax: [0, 0, 1], az: [0, 1, 0], rx: 0.0145, rz: 0.0145 }, { c: [0.0315, -0.0375, 0], ax: [0, 0, 1], az: [0, 1, 0], rx: 0.0125, rz: 0.0125 }], 8, () => [8, 8], false, [0.0318, -0.0375, 0]), t.metal, { m: fm, c: 0x9a9a98, r: 0.22, mt: 0.95, b: 0 });
  }
  const g = K.geometry(); g.userData.tiles = K.tiles; return g;
}
// matériau éclairé comme le décor (uniform de zone fourni), rugosité / métal / émission par sommet, atlas des personnages
// (page 0) ; pas de calage des sommets sur la grille (les mains suivent la caméra : elles trembleraient sans cesse)
export function litMaterial(u) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.pageTex(0), roughness: 0.6, metalness: 0, envMap: ENV.map });
  patchZone(m, u); perVertexPBR(m); ps1Patch(m, 0); return m;
}

// ───────────────────────── outils partagés avec les présences (chat, rats, la Chose, ballon) ─────────────────────────
// rig(J, par) : os placés aux positions J (pose de liaison), par : parent de chaque os ; skinned : un SkinnedMesh unique
// (matériau commun, atlas, couleurs / rugosité / émission par sommet) lié à ces os, ajouté sous parent.
export function rig(J, par) {
  const b = {};
  for (const n in J) { b[n] = new THREE.Bone(); b[n].name = n; }
  for (const n in J) { const p = par[n], q = J[n], o = p ? J[p] : [0, 0, 0]; b[n].position.set(q[0] - o[0], q[1] - o[1], q[2] - o[2]); if (p) b[p].add(b[n]); }
  return b;
}
export function skinned(K, parent, bones, rootBone, sphere) {
  parent.add(rootBone);
  parent.userData.tiles = K.tiles;
  const mesh = new THREE.SkinnedMesh(K.geometry(), humanMat(K.pg));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.boundingSphere = sphere;
  parent.add(mesh); parent.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones), mesh.matrixWorld);
  return mesh;
}
export const MK = { Kit, tube, loftF, box, twoSided, facets, sphereRings, colsAt, R7, ringP, M4, mix, mul, hash, G, ss, lerp, nrm, sub, cross, TX };
