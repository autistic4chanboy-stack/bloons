// Personnages : corps continu en un seul mesh à squelette (THREE.SkinnedMesh) — torse, cou, tête modelée (orbites,
// yeux, paupières, sourcils, nez, lèvres, oreilles), coiffures, bras et jambes lissés, mains à cinq doigts, chaussures,
// vêtements (cols, boutons, poches, épaulettes, ceinture, radio, étui, insignes, bandes réfléchissantes) — avec couleur,
// rugosité, métal et émission par sommet : un seul appel de dessin par personnage. Les os gardent les noms des anciens
// segments (hips, torso, neck, head, armL/R, elbowL/R, handL/R, legL/R, kneeL/R ; « L » du côté −x) : animateHumanoid
// et toutes les poses du jeu sont inchangées. Joueurs, PNJ, Gérard, braqueurs, policiers, pompiers, livreur, Lucie,
// mannequins, Bobby l'Ourson, l'Ombre, la chose des conduits, costumes. Unités du corps : 1,78 m (échelle = taille).
import * as THREE from 'three';
import { ENV, patchZone } from '../engine/materials.js';

// ───────────────────────── outils ─────────────────────────
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const G = (d, s) => Math.exp(-(d * d) / (s * s));
const lerp = (a, b, t) => a + (b - a) * t;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => scl(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
// couleurs sRGB : assombrir / éclaircir, mélanger ; tissus : jamais d'un noir absolu (la lampe doit en révéler les plis)
const mul = (h, k) => { const f = (s) => Math.min(255, Math.round(((h >> s) & 255) * k)); return (f(16) << 16) | (f(8) << 8) | f(0); };
const mix = (a, b, t) => { const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };
const cloth = (c) => { const f = (s) => Math.max(0x1f, (c >> s) & 255); return (f(16) << 16) | (f(8) << 8) | f(0); };
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const _c = new THREE.Color();

// Surface en grille : rows anneaux de cols points, fermée en u ; c0 / c1 : éventail sur le premier / dernier anneau
// (true : au centroïde, ou point [x, y, z]) ; open : bande ouverte en u (sans éventails)
function surf(rows, cols, f, c0 = true, c1 = true, open = false) {
  const p = [], ix = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const v = f(r, c); p.push(v[0], v[1], v[2]); }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < (open ? cols - 1 : cols); c++) { const a = r * cols + c, b = r * cols + (c + 1) % cols; ix.push(a, a + cols, b, b, a + cols, b + cols); }
  const cap = (r, pt, end) => {
    if (pt === true) { pt = [0, 0, 0]; for (let c = 0; c < cols; c++) for (let k = 0; k < 3; k++) pt[k] += p[(r * cols + c) * 3 + k] / cols; }
    const ci = p.length / 3; p.push(pt[0], pt[1], pt[2]);
    for (let c = 0; c < cols; c++) { const a = r * cols + c, b = r * cols + (c + 1) % cols; if (end) ix.push(ci, b, a); else ix.push(ci, a, b); }
  };
  if (!open) { if (c0) cap(0, c0, false); if (c1) cap(rows - 1, c1, true); }
  return { p, i: ix };
}
// Tables d'anneaux : [y, a (demi-largeur x), b (demi-profondeur avant, +z), bb (arrière), zc, n (superellipse), xc]
const T7 = (R) => R.map((q) => [q[0], q[1], q[2], q[3] ?? q[2], q[4] ?? 0, q[5] ?? 2, q[6] ?? 0]);
function secAt(R, y) {
  if (y <= R[0][0]) return R[0]; const L = R[R.length - 1]; if (y >= L[0]) return L;
  let i = 0; while (R[i + 1][0] < y) i++;
  const A = R[i], Q = R[i + 1], t = (y - A[0]) / (Q[0] - A[0]);
  return A.map((v, k) => lerp(v, Q[k], t));
}
const secPt = (q, t, o = 0) => { const ct = Math.cos(t), st = Math.sin(t), e = 2 / q[5]; return [q[6] + (q[1] + o) * Math.sign(ct) * Math.abs(ct) ** e, q[0], q[4] + ((st >= 0 ? q[2] : q[3]) + o) * Math.sign(st) * Math.abs(st) ** e]; };
const frontZ = (q, x, o = 0) => { const u = Math.min(1, Math.abs(x - q[6]) / (q[1] + o)); return q[4] + (q[2] + o) * Math.pow(1 - Math.pow(u, q[5]), 1 / q[5]); };
// Loft le long de +y ; def(v, r, t) : déformation du point (anneau r, angle t ; t = π/2 : l'avant, +z)
function loft(R, seg, def, c0 = true, c1 = true) { return surf(R.length, seg, (r, c) => { const t = c / seg * Math.PI * 2, v = secPt(R[r], t); return def ? def(v, r, t) : v; }, c0, c1); }
// bande biseautée autour d'une table (ceinture, poignet, col, bande réfléchissante…), à o au-dessus de la surface
function band(R, y0, y1, o, seg = 24, def) {
  const q = (y, oo) => { const s = secAt(R, y); return [y, s[1] + oo, s[2] + oo, s[3] + oo, s[4], s[5], s[6]]; }, bv = Math.min(0.004, (y1 - y0) / 3);
  return loft([q(y0, o * 0.2), q(y0 + bv, o), q(y1 - bv, o), q(y1, o * 0.2)], seg, def, false, false);
}
// bande réfléchissante (jaune fluo, liseré argent) centrée en y, hauteur h, autour d'une table d'anneaux
function reflect(K, R, y, h, seg, o) { K.add(band(R, y - h / 2, y + h / 2, 0.005, seg), { ...o, c: 0xd8cf2a, r: 0.35, e: 0.12 }); K.add(band(R, y - h * 0.12, y + h * 0.12, 0.0062, seg), { ...o, c: 0xc4c8cc, r: 0.25, mt: 0.6, e: 0.08 }); }
// Sphère déformée : f(dx, dy, dz) → point ; w méridiens, h divisions de latitude (pôles en éventail)
function ball(w, h, f) { return surf(h - 1, w, (r, c) => { const ph = Math.PI * (1 - (r + 1) / h), t = c / w * Math.PI * 2, s = Math.sin(ph); return f(s * Math.cos(t), Math.cos(ph), s * Math.sin(t)); }, f(0, -1, 0), f(0, 1, 0)); }
const ell = (rx, ry, rz, w = 10, h = 8, x = 0, y = 0, z = 0) => ball(w, h, (a, b, c) => [x + a * rx, y + b * ry, z + c * rz]);
// Tube le long d'un chemin : rad (nombre, ou par point : nombre | [rayon selon la normale, selon la binormale]) ;
// repère transporté sans torsion depuis la normale n0 ; c0 / c1 comme surf (true : le point extrême)
function sweep(pts, rad, seg, n0 = [1, 0, 0], c0 = true, c1 = true) {
  const n = pts.length, T = [], N = [], Bn = [];
  for (let i = 0; i < n; i++) T.push(nrm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let nn = n0;
  for (let i = 0; i < n; i++) { nn = nrm(sub(nn, scl(T[i], dot(nn, T[i])))); N.push(nn); Bn.push(cross(nn, T[i])); }
  return surf(n, seg, (r, c) => {
    const q = typeof rad === 'number' ? rad : rad[r], qa = typeof q === 'number' ? q : q[0], qb = typeof q === 'number' ? q : q[1];
    const t = c / seg * Math.PI * 2, a = Math.cos(t) * qa, b = Math.sin(t) * qb;
    return [pts[r][0] + N[r][0] * a + Bn[r][0] * b, pts[r][1] + N[r][1] * a + Bn[r][1] * b, pts[r][2] + N[r][2] * a + Bn[r][2] * b];
  }, c0 === true ? pts[0] : c0, c1 === true ? pts[n - 1] : c1);
}
// plaque arrondie (poche, insigne, épaulette, radio…) : w × h, épaisseur t vers +z, coins superelliptiques n
const slab = (w, h, t, n = 6, seg = 16) => { const s = loft(T7([[0, w / 2, h / 2, h / 2, 0, n], [t * 0.7, w / 2, h / 2, h / 2, 0, n], [t, w / 2 - t * 0.4, h / 2 - t * 0.4, h / 2 - t * 0.4, 0, n]]), seg); for (let k = 0; k < s.p.length; k += 3) { const y = s.p[k + 1], z = s.p[k + 2]; s.p[k + 1] = -z; s.p[k + 2] = y; } return s; };
const twoSided = (s) => { const n = s.p.length / 3, i2 = []; for (let k = 0; k < s.i.length; k += 3) i2.push(s.i[k] + n, s.i[k + 2] + n, s.i[k + 1] + n); return { p: s.p.concat(s.p), i: s.i.concat(i2) }; };
// garde les triangles dont le centre vérifie keep(x, y, z) et retire les sommets orphelins
function keepTris(s, keep) {
  const P = s.p, map = new Int32Array(P.length / 3).fill(-1), p = [], i = [];
  for (let k = 0; k < s.i.length; k += 3) {
    const a = s.i[k] * 3, b = s.i[k + 1] * 3, c = s.i[k + 2] * 3;
    if (!keep((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3)) continue;
    for (let j = 0; j < 3; j++) { const v = s.i[k + j]; if (map[v] < 0) { map[v] = p.length / 3; p.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } i.push(map[v]); }
  }
  return { p, i };
}
function normals(p, ix) {
  const n = new Float32Array(p.length);
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    n[a] += nx; n[a + 1] += ny; n[a + 2] += nz; n[b] += nx; n[b + 1] += ny; n[b + 2] += nz; n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
  }
  for (let k = 0; k < n.length; k += 3) { const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1; n[k] /= l; n[k + 1] /= l; n[k + 2] /= l; }
  return n;
}

// Accumulateur de géométrie skinnée. add(surface, {m : Matrix4 de placement (pose de liaison), c : couleur (hex ou
// fn(x, y, z, nx, ny, nz) → hex), r : rugosité et e : émission (nombre ou fn(x, y, z)), mt : métal, b : os, ou
// w : fn(x, y, z) → [[os, poids]…] pour les articulations lissées, nb : pièce ignorée pour la profondeur du dos}).
// zb : z minimal des sommets du bassin, du torse, du cou et de la tête au-dessus des hanches (personnage couché sur le dos)
class Kit {
  constructor() { this.P = []; this.N = []; this.C = []; this.E = []; this.S = []; this.W = []; this.I = []; this.zb = 0; }
  add(s, o) {
    const p = s.p.slice(), m = o.m; let ix = s.i;
    if (m) {
      const e = m.elements;
      for (let k = 0; k < p.length; k += 3) { const x = p[k], y = p[k + 1], z = p[k + 2]; p[k] = e[0] * x + e[4] * y + e[8] * z + e[12]; p[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; p[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
      if (m.determinant() < 0) { ix = ix.slice(); for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } }
    }
    const n = normals(p, ix), base = this.P.length / 3, cf = typeof o.c === 'function', rf = typeof o.r === 'function', ef = typeof o.e === 'function';
    let last = -1, lr = 0, lg = 0, lb = 0; // conversion sRGB → linéaire mise en cache (sommets voisins de même couleur)
    const P = this.P, N = this.N, C = this.C, E = this.E, S = this.S, W = this.W, wi = [0, 0, 0, 0], wv = [0, 0, 0, 0];
    for (let k = 0; k < p.length; k += 3) {
      const x = p[k], y = p[k + 1], z = p[k + 2];
      P.push(x, y, z); N.push(n[k], n[k + 1], n[k + 2]);
      const hex = cf ? o.c(x, y, z, n[k], n[k + 1], n[k + 2]) : o.c;
      if (hex !== last) { _c.setHex(hex); last = hex; lr = _c.r; lg = _c.g; lb = _c.b; }
      C.push(lr, lg, lb);
      E.push(rf ? o.r(x, y, z) : o.r ?? 0.8, o.mt || 0, ef ? o.e(x, y, z) : o.e || 0);
      if (o.w) { // quatre plus forts poids, normalisés
        wv[0] = wv[1] = wv[2] = wv[3] = 0; wi[0] = wi[1] = wi[2] = wi[3] = 0;
        for (const q of o.w(x, y, z)) {
          if (q[1] <= 0.002) continue;
          let j = 4; while (j > 0 && wv[j - 1] < q[1]) j--;
          if (j < 4) { for (let h = 3; h > j; h--) { wv[h] = wv[h - 1]; wi[h] = wi[h - 1]; } wv[j] = q[1]; wi[j] = q[0]; }
        }
        const t = wv[0] + wv[1] + wv[2] + wv[3] || 1;
        S.push(wi[0], wi[1], wi[2], wi[3]); W.push(wv[0] / t, wv[1] / t, wv[2] / t, wv[3] / t);
      } else { S.push(o.b, 0, 0, 0); W.push(1, 0, 0, 0); }
      if (z < this.zb && y > 0.8 && !o.nb && (o.w ? wi[0] : o.b) < 4) this.zb = z;
    }
    for (const t of ix) this.I.push(base + t);
  }
  geometry() {
    const g = new THREE.BufferGeometry(), n = this.P.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
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
  const J = { hips: [0, 0.95, 0], torso: [0, 0.95, 0], neck: [0, pr.neck[0], pr.neck[1]], head: [0, pr.head[0], pr.head[1]] };
  for (const s of [-1, 1]) {
    const A = SD(s), [sx, sy, sz] = pr.sh;
    J['arm' + A] = [s * sx, sy, sz]; J['elbow' + A] = [s * sx, sy - pr.el, sz - 0.005]; J['hand' + A] = [s * sx, sy - pr.el - pr.wr, sz];
    J['leg' + A] = [s * pr.hip, 0.93, 0]; J['knee' + A] = [s * pr.hip, 0.5, 0.005]; J['foot' + A] = [s * pr.hip, 0.08, -0.005];
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
const wTorso = (pr) => (x, y) => {
  const t = ss(0.985, 1.12, y), ax = Math.abs(x), A = SD(x), sh = 0.25 * ss(0.15, 0.18, ax) * ss(1.37, 1.42, y), lg = 0.3 * ss(0.9, 0.835, y) * ss(0.02, 0.08, ax);
  return [[B.hips, (1 - t) * (1 - lg)], [B.torso, t * (1 - sh)], [B['arm' + A], t * sh], [B['leg' + A], (1 - t) * lg]];
};
const wNeck = (J) => (x, y) => { const a = ss(J.neck[1] - 0.025, J.neck[1] + 0.025, y), b = ss(J.head[1] - 0.015, J.head[1] + 0.02, y); return [[B.torso, 1 - a], [B.neck, a * (1 - b)], [B.head, a * b]]; };
const wArm = (J, s) => { const A = SD(s), ye = J['elbow' + A][1], yh = J['hand' + A][1]; return (x, y) => { const t = ss(ye - 0.03, ye + 0.035, y), h = ss(yh + 0.025, yh - 0.012, y); return [[B['arm' + A], t], [B['elbow' + A], (1 - t) * (1 - h)], [B['hand' + A], (1 - t) * h]]; }; };
const wLeg = (J, s) => { const A = SD(s), yk = J['knee' + A][1]; return (x, y) => { const t = ss(yk - 0.035, yk + 0.04, y); return [[B['leg' + A], t], [B['knee' + A], 1 - t]]; }; };
// jupe, robe, drap : suit le bassin en haut, à moitié les cuisses en bas (pas de jambe qui traverse le tissu)
const wSkirt = (y0, y1) => (x, y) => { const t = ss(y0, y1, y) * 0.6, l = ss(0.025, -0.025, x); return [[B.hips, 1 - t], [B.legL, t * l], [B.legR, t * (1 - l)]]; };

// ───────────────────────── gabarits ─────────────────────────
const TORSO_M = [[0.818, 0.035, 0.035, 0.035, 0, 2], [0.835, 0.105, 0.075, 0.08, -0.002, 2.2], [0.87, 0.152, 0.098, 0.106, -0.004, 2.4], [0.925, 0.166, 0.104, 0.112, -0.006, 2.5], [0.99, 0.16, 0.1, 0.104, -0.002, 2.5], [1.06, 0.15, 0.098, 0.098, 0.004, 2.4], [1.14, 0.154, 0.104, 0.1, 0.008, 2.4], [1.22, 0.161, 0.112, 0.104, 0.01, 2.5], [1.3, 0.168, 0.118, 0.106, 0.01, 2.6], [1.365, 0.174, 0.11, 0.106, 0.002, 2.7], [1.415, 0.176, 0.094, 0.1, -0.008, 2.7], [1.45, 0.15, 0.078, 0.086, -0.014, 2.5], [1.478, 0.104, 0.066, 0.072, -0.018, 2.2], [1.5, 0.064, 0.058, 0.062, -0.02, 2]];
const TORSO_F = [[0.818, 0.035, 0.035, 0.035, 0, 2], [0.835, 0.11, 0.074, 0.084, -0.004, 2.2], [0.87, 0.162, 0.096, 0.115, -0.01, 2.4], [0.925, 0.174, 0.1, 0.12, -0.012, 2.5], [0.99, 0.158, 0.094, 0.104, -0.006, 2.4], [1.06, 0.132, 0.088, 0.09, 0, 2.3], [1.14, 0.136, 0.092, 0.092, 0.004, 2.3], [1.215, 0.146, 0.104, 0.096, 0.008, 2.4], [1.29, 0.15, 0.11, 0.097, 0.01, 2.4], [1.35, 0.154, 0.104, 0.097, 0.004, 2.5], [1.4, 0.156, 0.088, 0.092, -0.006, 2.6], [1.435, 0.132, 0.072, 0.08, -0.012, 2.4], [1.462, 0.092, 0.06, 0.066, -0.016, 2.2], [1.485, 0.054, 0.05, 0.054, -0.018, 2]];
const TORSO_C = [[0.818, 0.032, 0.032, 0.032, 0, 2], [0.835, 0.095, 0.075, 0.08, -0.002, 2.2], [0.87, 0.128, 0.094, 0.1, -0.004, 2.3], [0.925, 0.136, 0.1, 0.104, -0.004, 2.4], [0.99, 0.136, 0.106, 0.1, 0.004, 2.3], [1.06, 0.138, 0.11, 0.098, 0.008, 2.3], [1.14, 0.14, 0.108, 0.096, 0.008, 2.3], [1.22, 0.144, 0.104, 0.096, 0.006, 2.4], [1.3, 0.148, 0.096, 0.094, 0, 2.5], [1.35, 0.142, 0.084, 0.088, -0.006, 2.5], [1.385, 0.114, 0.07, 0.076, -0.01, 2.3], [1.412, 0.078, 0.058, 0.062, -0.014, 2.1], [1.435, 0.05, 0.046, 0.05, -0.016, 2]];
// tête (espace de l'os de la tête, avant l'échelle) : du menton au sommet du crâne
const HEAD_M = [[-0.058, 0.01, 0.01, 0.01, 0.058, 2], [-0.054, 0.024, 0.016, 0.018, 0.054, 2.2], [-0.045, 0.04, 0.026, 0.032, 0.046, 2.4], [-0.03, 0.052, 0.038, 0.05, 0.034, 2.5], [-0.012, 0.06, 0.05, 0.066, 0.02, 2.6], [0.005, 0.066, 0.064, 0.08, 0.008, 2.7], [0.025, 0.07, 0.074, 0.09, 0, 2.7], [0.045, 0.073, 0.08, 0.097, -0.003, 2.7], [0.065, 0.074, 0.082, 0.1, -0.005, 2.6], [0.088, 0.075, 0.085, 0.102, -0.007, 2.5], [0.112, 0.074, 0.082, 0.101, -0.009, 2.4], [0.136, 0.069, 0.071, 0.094, -0.011, 2.3], [0.156, 0.058, 0.054, 0.08, -0.012, 2.2], [0.17, 0.042, 0.036, 0.06, -0.012, 2.1], [0.178, 0.022, 0.018, 0.032, -0.012, 2]];
const headTable = (pr) => T7(HEAD_M.map((q) => {
  if (pr.c) return q[0] < 0.03 ? [0.03 + (q[0] - 0.03) * 0.84, q[1] * (q[0] < -0.03 ? 0.92 : 0.99), q[2] * 0.95, q[3], q[4] - 0.003, q[5]] : [q[0], q[1] * 1.04, q[2], q[3] * 1.05, q[4], q[5] - 0.1];
  if (pr.f) return q[0] < 0.02 ? [0.02 + (q[0] - 0.02) * 0.93, q[1] * 0.94, q[2] * 0.97, q[3], q[4] - 0.002, q[5]] : [q[0], q[1] * 0.985, q[2], q[3] * 0.99, q[4], q[5]];
  return q;
}));
// relief du visage (orbites, arcade, pommettes, menton) ; st : part « avant » du point (1 face au visage)
function faceDZ(x, y, st, pr) {
  if (st <= 0.2 || pr.smooth) return 0;
  const ax = Math.abs(x), k = ss(0.2, 0.6, st);
  let d = -0.0115 * G(ax - 0.032, 0.0155) * G(y - (pr.c ? 0.058 : 0.063), 0.0115);
  d += (pr.f || pr.c ? 0.0022 : 0.0042) * G(y - 0.086, 0.0075) * ss(0.062, 0.022, ax);
  d += 0.0035 * G(ax - 0.046, 0.013) * G(y - 0.041, 0.012) - 0.003 * G(ax - 0.04, 0.012) * G(y - 0.012, 0.014) * (pr.gaunt ? 3 : 1);
  d += 0.0035 * G(y + 0.042, 0.009) * G(ax, 0.02) - 0.002 * G(y + 0.027, 0.006) * G(ax, 0.02) + 0.0025 * G(y - 0.002, 0.012) * G(ax, 0.024);
  return d * k;
}
function profile(o, kind) {
  const f = !!o.female, c = !!o.child;
  const pr = {
    f, c, kind, sh: c ? [0.15, 1.37, -0.02] : f ? [0.168, 1.4, -0.022] : [0.19, 1.415, -0.025],
    el: c ? 0.27 : f ? 0.29 : 0.31, wr: c ? 0.235 : f ? 0.245 : 0.255, hip: c ? 0.078 : f ? 0.094 : 0.092,
    neck: c ? [1.435, -0.015] : f ? [1.485, -0.018] : [1.5, -0.02], head: c ? [1.525, -0.004] : f ? [1.585, -0.004] : [1.6, -0.005],
    hs: c ? 1.3 : f ? 0.955 : 1, ar: c ? 0.82 : f ? 0.84 : 1, lr: c ? 0.8 : f ? 0.95 : 1, hd: c ? 0.8 : f ? 0.9 : 1, ft: c ? 0.78 : f ? 0.9 : 1,
    torso: T7(c ? TORSO_C : f ? TORSO_F : TORSO_M),
  };
  if (kind === 'bear') Object.assign(pr, { sh: [0.24, 1.39, -0.02], hip: 0.108, ar: 1.65, lr: 1.5, torso: T7(TORSO_M.map((q) => [q[0], q[1] * (q[0] < 1.45 ? 1.32 : 1.22), q[2] * (1.4 + 0.8 * G(q[0] - 1.06, 0.15)), q[3] * 1.36, q[4] + 0.045 * G(q[0] - 1.06, 0.15), 2.05])) }); // costume rembourré : ventre rond
  if (kind === 'crawler' || kind === 'shadow') Object.assign(pr, { gaunt: true, ar: 0.62, lr: 0.68, hd: 1.25, wr: 0.3, el: 0.34, torso: T7(TORSO_M.map((q) => [q[0], q[1] * (q[0] < 1.2 ? 0.74 : 0.86), q[2] * (q[0] < 1.2 ? 0.68 : 0.8), q[3] * 0.8, q[4], q[5]])) });
  if (kind === 'mannequin') Object.assign(pr, { smooth: true, f: true, sh: [0.178, 1.405, -0.022], neck: [1.49, -0.018], head: [1.59, -0.004], ar: 0.85, lr: 0.9, torso: T7(TORSO_F) });
  if (kind === 'firefighter') Object.assign(pr, { ar: 1.14, lr: 1.12, torso: T7(TORSO_M.map((q) => [q[0], q[1] * 1.07 + 0.006, q[2] * 1.12 + 0.008, q[3] * 1.1 + 0.008, q[4], q[5]])) }); // tenue de feu épaisse
  if (kind === 'astronaut') Object.assign(pr, { ar: 1.5, lr: 1.35, hd: 1.15, ft: 1.15, torso: T7(TORSO_M.map((q) => [q[0], q[1] * 1.18 + 0.01, q[2] * 1.3 + 0.01, q[3] * 1.25 + 0.01, q[4], 2.3])) });
  const nb = pr.neck[0], hb = pr.head[0], nr = kind === 'bear' ? 0.11 : c ? 0.046 : f ? 0.047 : pr.gaunt ? 0.04 : 0.056;
  pr.neckR = T7([[nb - 0.075, nr, nr, nr * 1.1, -0.026], [nb, nr, nr, nr * 1.12, -0.021], [lerp(nb, hb, 0.5), nr * 0.96, nr * 0.96, nr * 1.07, -0.016], [hb - 0.005, nr * 0.93, nr * 0.9, nr * 1.04, -0.013], [hb + 0.025, nr * 0.86, nr * 0.76, nr * 0.96, -0.012]]);
  pr.headT = headTable(pr);
  pr.J = joints(pr);
  return pr;
}
// silhouette du torse : poitrine, pectoraux, ventre, omoplates, fessiers ; côtes et vertèbres des créatures décharnées
const torsoDef = (pr, O) => (v, r, t) => {
  const [x, y, z] = v, st = Math.sin(t), ax = Math.abs(x);
  let dz = 0;
  if (st > 0) {
    if (pr.f && !pr.c && pr.kind !== 'mannequin') dz += 0.026 * G(y - 1.29, 0.05) * G(ax - 0.068, 0.048) * st ** 1.5;
    else if (pr.kind === 'mannequin') dz += 0.016 * G(y - 1.29, 0.045) * G(ax - 0.066, 0.042) * st ** 1.5;
    else if (!pr.c) dz += 0.006 * G(y - 1.31, 0.045) * G(ax - 0.075, 0.06) * st;
    if (O.belly) dz += O.belly * G(y - 1.08, 0.08) * G(ax, 0.11) * st;
    if (pr.gaunt) dz += (Math.max(0, Math.sin((y - 1.08) * 95)) * 0.004 * ss(1.06, 1.14, y) * ss(1.36, 1.28, y) - 0.014 * G(y - 1.03, 0.05) * G(ax, 0.08)) * st;
  } else {
    dz -= (0.006 * G(y - 1.33, 0.05) * G(ax - 0.085, 0.05) + (pr.f ? 0.018 : 0.012) * G(y - 0.885, 0.05) * G(ax - 0.075, 0.06)) * -st;
    if (pr.gaunt) dz -= 0.006 * G(ax, 0.008) * Math.max(0, Math.sin(y * 160)) * ss(0.98, 1.05, y) * -st;
  }
  return [x, y, z + dz];
};
// anneaux des membres [t sous l'articulation, rayon latéral, rayon avant-arrière, décalage z] → table de loft locale (y = −t)
const limbT = (rings) => T7(rings.map(([t, a, b, zo = 0]) => [-t, a, b, b, zo, 2]).reverse());
function armRings(pr) {
  const k = pr.ar, e = pr.el, w = pr.wr;
  return [[-0.054, 0.012, 0.012], [-0.047, 0.03, 0.031], [-0.033, 0.044, 0.046], [-0.015, 0.052, 0.054], [0.012, 0.055, 0.057], [e * 0.18, 0.054, 0.056], [e * 0.36, 0.048, 0.05], [e * 0.55, 0.045, 0.047], [e * 0.76, 0.041, 0.044], [e * 0.94, 0.037, 0.04], [e, 0.036, 0.041], [e + w * 0.1, 0.039, 0.043], [e + w * 0.32, 0.038, 0.041], [e + w * 0.6, 0.031, 0.035], [e + w * 0.86, 0.025, 0.031], [e + w, 0.023, 0.029]]
    .map(([t, a, b]) => [t < 0 ? t * Math.min(1.3, k) * 0.78 : t, a * k, b * k]);
}
// jambes : vêtues (pantalon droit, ourlet sur la chaussure) ou nues (galbe du mollet, cheville fine)
const LEG_CLOTH = [[-0.07, 0.05, 0.06, -0.012], [-0.03, 0.08, 0.088, -0.01], [0.03, 0.088, 0.094, -0.006], [0.12, 0.083, 0.088, -0.002], [0.22, 0.075, 0.08, 0.002], [0.32, 0.066, 0.071, 0.004], [0.4, 0.059, 0.064, 0.005], [0.43, 0.057, 0.062, 0.006], [0.47, 0.055, 0.059, 0.004], [0.56, 0.056, 0.06, -0.002], [0.66, 0.053, 0.057, 0], [0.76, 0.051, 0.055, 0.002], [0.84, 0.051, 0.056, 0.004]];
const LEG_BARE = [[-0.07, 0.048, 0.056, -0.012], [-0.03, 0.076, 0.084, -0.01], [0.03, 0.082, 0.088, -0.006], [0.12, 0.077, 0.082, -0.002], [0.22, 0.068, 0.072, 0.002], [0.32, 0.058, 0.062, 0.004], [0.4, 0.05, 0.054, 0.006], [0.43, 0.048, 0.052, 0.008], [0.47, 0.045, 0.05, 0.004], [0.55, 0.048, 0.056, -0.008], [0.63, 0.044, 0.05, -0.006], [0.72, 0.034, 0.038, -0.002], [0.8, 0.026, 0.03, 0], [0.87, 0.025, 0.03, 0.002]];
const legRings = (pr, bare) => (bare ? LEG_BARE : LEG_CLOTH).map(([t, a, b, z]) => [t, a * pr.lr, b * pr.lr, z]);

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
    sleeve: o.sleeves === false ? 'short' : 'long', collar: 'crew', placket: false, buttons: null, pockets: 0, tuck: false, hem: 0.93, epaul: false, badge: null,
    belt: null, duty: null, bottom: 'trousers', shoe: 'shoe', sole: 0x1c1c1c, gloves: null, bag: o.bag || null, prop: o.prop || null, ribbed: false,
    topR: 0.86, pantsR: 0.82, jacket: null, apron: null, skirt: null, legs: null, logo: null, bands: false, scba: false, patch: null, coat: null,
  };
  if (kind === 'crawler' || kind === 'shadow') return Object.assign(O, { style: kind, top: O.skin, bottom: 'none', legs: O.skin, hairStyle: kind === 'crawler' ? 'stringy' : 'none', sleeve: 'none', collar: 'none', shoe: 'none', waistY: -1, lip: mul(O.skin, 0.4), brow: O.skin, eye: 0x111111 });
  const st = o.outfit || (kind === 'police' ? 'police' : kind === 'firefighter' ? 'fire' : o.hat === 'balaclava' ? 'robber' : o.badge ? 'guard' : 'casual');
  O.style = st;
  const shirtish = (b) => Object.assign(O, { collar: 'shirt', placket: true, buttons: b ?? mix(O.top, 0xffffff, 0.15), tuck: true });
  switch (st) {
    case 'guard': shirtish(mul(O.top, 0.62)); Object.assign(O, { pockets: 2, epaul: true, badge: 'guard', belt: 0x161616, duty: 'guard', patch: 0xe8c547, shoeC: 0x121212, topR: 0.72, pantsR: 0.74 }); break;
    case 'police': shirtish(mul(O.top, 0.6)); Object.assign(O, { pockets: 2, epaul: true, badge: 'police', belt: 0x141414, duty: 'police', patch: 0xf2f2f2, shoeC: 0x111111, topR: 0.74, hat: O.hat || 'police' }); break;
    case 'fire': Object.assign(O, { collar: 'high', top: cloth(o.shirt ?? 0x1e2a3a), pants: cloth(o.pants ?? 0x1e2a3a), bands: true, scba: true, gloves: 0x2a2a24, shoe: 'boot', shoeC: 0x151515, sole: 0x262222, hem: 0.84, topR: 0.78, prop: O.prop || 'nozzle', coat: true }); break;
    case 'robber': Object.assign(O, { collar: 'hood', ribbed: true, top: cloth(o.shirt ?? 0x202020), gloves: 0x1e1e1e, shoe: 'sneaker', shoeC: 0x262626, sole: 0x303030, bottom: 'cargo', bag: O.bag || 'backpack', prop: O.prop || 'gun', hairStyle: 'none', topR: 0.92, hem: 0.9 }); break;
    case 'polo': Object.assign(O, { collar: 'polo', placket: true, buttons: mul(O.top, 0.8), sleeve: 'short', hem: 0.925, shoe: 'sneaker', shoeC: 0x2a2a2a, sole: 0xe6e6e6, logo: 0xf2f2f2 }); break;
    case 'shop': {
      const food = FOOD[o.shop];
      if (R(3) < 0.5 || food) Object.assign(O, { collar: 'polo', placket: true, buttons: mul(O.top, 0.8), sleeve: food ? 'short' : O.sleeve });
      else { shirtish(); Object.assign(O, { belt: 0x2a1c12 }); }
      Object.assign(O, { badge: 'name', pants: cloth(o.pants ?? 0x26262a) });
      if (f && R(4) < 0.4) Object.assign(O, { skirt: { c: O.pants, hem: 0.55, top: 1.0, short: true }, legs: pick(R, 13, [0x2a2a30, mix(O.skin, 0x8a6a5a, 0.25)]) });
      if (food) O.apron = food;
      if (o.shop === 'pharma') { O.inner = O.top; O.jacket = { c: 0xf4f4f2 }; O.coat = 0xf4f4f2; O.hem = 0.6; }
      break;
    }
    case 'dress': Object.assign(O, { skirt: { c: O.top, hem: pr.c ? 0.6 : 0.56, top: 1.0 }, collar: 'round', sleeve: o.sleeves === false ? 'short' : 'long', legs: 0xf2f0ea, shoe: 'flat', shoeC: o.shoes ?? 0x241614, sole: 0x161010 }); break;
    case 'catsuit': Object.assign(O, { collar: 'high', top: cloth(o.shirt ?? 0x212121), pants: cloth(o.pants ?? 0x212121), gloves: 0x232323, shoe: 'flat', shoeC: 0x1c1c1c, catEars: true, tail: true, topR: 0.7, pantsR: 0.7, hairStyle: 'buzz' }); break;
    case 'clown': Object.assign(O, { collar: 'ruff', placket: false, pompoms: [0xffeb3b, 0xffffff, 0x76ff03], gloves: 0xf6f6f6, shoe: 'clown', shoeC: 0xd50000, sole: 0x2a2a2a, hairStyle: 'clown', redNose: true, facePaint: true, hem: 0.88 }); break;
    default: { // client(e) : haut, bas, chaussures et accessoires selon la graine
      const tops = f ? ['tshirt', 'blouse', 'sweater', 'jacket', 'dress', 'polo'] : ['tshirt', 'shirt', 'sweater', 'jacket', 'hoodie', 'polo'];
      const t = pick(R, 3, tops); O.style = t;
      if (t === 'shirt') { shirtish(); if (R(9) < 0.5) Object.assign(O, { tuck: false, hem: 0.9 }); else O.belt = pick(R, 10, [0x2a1c12, 0x151515]); }
      if (t === 'blouse') Object.assign(O, { collar: 'v', hem: 0.94, topR: 0.6 });
      if (t === 'sweater') Object.assign(O, { ribbed: true, sleeve: 'long', hem: 0.92, topR: 0.95 });
      if (t === 'polo') Object.assign(O, { collar: 'polo', placket: true, buttons: mul(O.top, 0.8), sleeve: 'short' });
      if (t === 'hoodie') Object.assign(O, { collar: 'hood', ribbed: true, sleeve: 'long', hem: 0.9, topR: 0.92 });
      if (t === 'jacket') { O.inner = cloth(mix(O.top, 0xf0f0f0, 0.6)); O.jacket = { c: cloth(pick(R, 11, [0x2b2b30, 0x3e3328, 0x23324a, 0x4a3a2a, mul(O.top, 0.55)])) }; O.collar = 'crew'; O.sleeve = 'long'; O.hem = 0.87; }
      if (t === 'dress') Object.assign(O, { skirt: { c: O.top, hem: 0.52 + R(12) * 0.08, top: 1.04 }, collar: 'round', legs: pick(R, 13, [0x2a2a30, mix(O.skin, 0x8a6a5a, 0.25), O.skin]) });
      if (!O.skirt) {
        const jeans = R(5) < 0.5;
        if (jeans) Object.assign(O, { bottom: 'jeans', pants: pick(R, 6, [0x34507a, 0x2a3c5a, 0x3e5f8a, 0x2b2f38]), pantsR: 0.9 });
        if (f && R(14) < 0.35) Object.assign(O, { skirt: { c: jeans ? O.pants : cloth(o.pants ?? 0x2a2a2a), hem: 0.56, top: 1.0, short: true }, legs: pick(R, 13, [0x2a2a30, mix(O.skin, 0x8a6a5a, 0.25)]) });
      }
      if (R(7) < 0.5) Object.assign(O, { shoe: 'sneaker', shoeC: pick(R, 8, [0xe8e8e8, 0x2a2a2a, 0x8a1c1c, 0x1c3a6a]), sole: 0xf0f0f0 });
      else Object.assign(O, { shoe: f && R(15) < 0.5 ? 'boot' : 'shoe', shoeC: pick(R, 8, [0x2a1a10, 0x141414, 0x4a2c1a]) });
      if (R(16) < 0.18 && !pr.c) O.glasses = pick(R, 17, [0x111111, 0x8a7a5a, 0x3a2418]);
      if (!f && !pr.c && !O.beard) { const b = R(18); O.beard = b < 0.14 ? 'beard' : b < 0.34 ? 'stubble' : null; }
      if (O.skirt) O.legs = O.legs ?? O.skin;
    }
  }
  if (O.coat === true) O.coat = O.top;
  if (!O.hairStyle) O.hairStyle = f ? (pr.c ? 'bob' : pick(R, 2, ['long', 'bob', 'ponytail', 'bun', 'long'])) : pick(R, 2, ['short', 'short', 'side', 'buzz', 'bald', 'curly']);
  if (O.hat === 'balaclava' || O.hat === 'helmet') O.hairStyle = 'none';
  O.waistY = O.tuck || O.skirt ? 1.0 : O.hem;
  if (O.coat && O.style !== 'shop') O.waistY = O.hem;
  if (O.jacket) O.waistY = O.hem;
  O.lip = O.ghostly ? mix(O.skin, 0x6a5a62, 0.5) : mix(O.skin, f ? 0xa8424e : 0x9a5a50, f ? 0.5 : 0.32);
  if (O.ghostly) O.eye = 0x140e0c;
  O.brow = O.hair === 0xbdbdbd || O.hair === 0x9e9e9e ? mul(O.hair, 0.8) : mul(O.hair, 0.75);
  return O;
}

// ───────────────────────── pièces du corps humain ─────────────────────────
function torsoPiece(K, pr, O) {
  const R = pr.torso, J = pr.J, ny0 = J.neck[1];
  const col = (x, y, z, nx, ny, nz) => {
    if (y < O.waistY) { if (O.bottom === 'jeans' && Math.abs(x) < 0.006 && nz > 0.5 && y > 0.86) return mul(O.pants, 0.8); return O.pants; }
    let c = O.jacket ? O.jacket.c : O.top;
    if (O.jacket && nz > 0.2 && Math.abs(x) < 0.03 + (y - 0.9) * 0.12) c = O.inner;
    else if (O.placket && Math.abs(x) < 0.012 && nz > 0.55) c = mul(c, 0.9);
    if (O.collar === 'v' && nz > 0.3 && y > ny0 - 0.14 && Math.abs(x) < (y - (ny0 - 0.14)) * 0.5) c = O.skin;
    if (Math.abs(nx) > 0.97 && y > 0.95 && y < 1.36) c = mul(c, 0.88);
    return c;
  };
  const rough = (x, y) => (y < O.waistY ? O.pantsR : O.topR);
  K.add(loft(R, 26, torsoDef(pr, O)), { c: col, r: rough, w: wTorso(pr) });
}
function neckPiece(K, pr, O) {
  const J = pr.J, def = (v, r, t) => [v[0], v[1], v[2] + (!pr.f && !pr.c && Math.sin(t) > 0 ? 0.005 * G(v[1] - (J.neck[1] + 0.06), 0.014) * G(v[0], 0.012) : 0)];
  const nc = O.style === 'catsuit' ? O.top : O.hat === 'balaclava' ? 0x222222 : O.skin, hy = J.head[1];
  K.add(loft(pr.neckR, 14, def, false, false), { c: (x, y, z, nx, ny, nz) => mix(nc, 0x000000, 0.18 * ss(hy - 0.07, hy - 0.035, y) * Math.max(0, nz)), r: O.hat === 'balaclava' ? 0.95 : 0.55, w: wNeck(J) });
}
function armPiece(K, pr, O, s) {
  const J = pr.J, A = SD(s), j = J['arm' + A], R = limbT(armRings(pr)), m = M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), w = wArm(J, s);
  const ye = J['elbow' + A][1], yw = J['hand' + A][1];
  const sl = O.sleeve === 'short' ? j[1] - pr.el * 0.42 : O.sleeve === 'rolled' ? ye + 0.04 : yw + 0.012;
  const sc = O.jacket ? O.jacket.c : O.coat || O.top;
  K.add(loft(R, 14), { m, c: (x, y, z, nx, ny, nz) => (y > sl ? mix(O.patch && s > 0 && y < j[1] - 0.05 && y > j[1] - 0.13 && x * s > j[0] * s + 0.02 ? O.patch : sc, 0x000000, 0.22 * G(y - ye - 0.01, 0.03) * Math.max(0, nz)) : O.skin), r: (x, y) => (y > sl ? O.topR : 0.55), w });
  if (O.bands) for (const y of [ye + 0.07 - j[1], yw + 0.07 - j[1]]) reflect(K, R, y, 0.026, 14, { m, w });
  if (O.sleeve === 'none') return;
  if (O.sleeve !== 'short' || O.style === 'polo') { // poignet / ourlet de manche
    const y0 = (O.sleeve === 'short' ? sl : yw + 0.012) - j[1];
    K.add(band(R, y0 - (O.ribbed ? 0.035 : 0.02), y0 + 0.002, O.ribbed ? 0.0035 : 0.003, 14), { m, c: O.ribbed ? mul(sc, 0.9) : sc, r: O.topR, w });
  } else K.add(band(R, sl - j[1] - 0.012, sl - j[1] + 0.004, 0.004, 14), { m, c: sc, r: O.topR, w });
  if (s > 0 && O.style !== 'robber' && !pr.c && (O.style === 'guard' || O.style === 'police' || hash(O.top, 3, 1) < 0.5)) { // montre au poignet gauche (côté +x)
    const long = O.sleeve !== 'short', wy = (long ? yw - 0.002 : yw + 0.03) - j[1];
    K.add(band(R, wy - 0.009, wy + 0.009, long ? 0.0058 : 0.0035, 14), { m, c: 0x1a1a1a, r: 0.5, w });
    K.add(ell(0.006, 0.016, 0.016, 10, 6, 0.026 * pr.ar + 0.004, wy, 0), { m, c: 0x9a9a98, r: 0.25, mt: 0.9, w });
  }
}
// main canonique (main gauche : doigts +y, paume +x, index et pouce +z) ; grip 0 détendue → 1 poing ; hi : vue à la
// première personne (plus de segments, ongles : out.nails = [centre, axe du doigt, dos du doigt, largeur])
function handPieces(pr, grip, fat = 1, hi = false) {
  const out = [], g = grip, k = fat, fs = hi ? 10 : 7; out.nails = [];
  out.push(loft(T7([[-0.008, 0.016 * k, 0.024 * k, 0.024 * k, 0.002, 2.4], [0.012, 0.0165 * k, 0.032 * k, 0.032 * k, 0.003, 2.6], [0.04, 0.0155 * k, 0.04 * k, 0.04 * k, 0.002, 2.8], [0.07, 0.0145 * k, 0.042 * k, 0.042 * k, 0.001, 3], [0.085, 0.0125 * k, 0.04 * k, 0.04 * k, 0, 3], [0.093, 0.008 * k, 0.034 * k, 0.034 * k, 0, 2.6]]), hi ? 18 : 12));
  const Z = [0.0285, 0.0095, -0.0095, -0.0265], L = [0.074, 0.081, 0.076, 0.061], R0 = [0.0088, 0.0092, 0.0087, 0.0077], SP = [0.07, 0, -0.06, -0.13];
  for (let f = 0; f < 4; f++) {
    const flex = [lerp(0.22, 1.5, g) + f * 0.04, lerp(0.38, 1.65, g), lerp(0.22, 0.95, g)], sp = SP[f] * (1 - g), seg = [0.45, 0.3, 0.25];
    let p = [0.002, 0.08, Z[f] * k], A = 0; const pts = [p], rad = [R0[f] * k];
    for (let j = 0; j < 3; j++) {
      A += flex[j];
      const d = [Math.sin(A), Math.cos(A) * Math.cos(sp), Math.cos(A) * Math.sin(sp)], l = seg[j] * L[f] * (0.94 + 0.06 * k), r = R0[f] * k * (1 - 0.07 * j);
      p = [p[0] + d[0] * l * 0.5, p[1] + d[1] * l * 0.5, p[2] + d[2] * l * 0.5]; pts.push(p); rad.push(r * 0.93);
      p = [p[0] + d[0] * l * 0.5, p[1] + d[1] * l * 0.5, p[2] + d[2] * l * 0.5]; pts.push(p); rad.push(j < 2 ? r : r * 0.82);
    }
    const dl = nrm(sub(pts[6], pts[5])), back = [-Math.cos(A), Math.sin(A) * Math.cos(sp), Math.sin(A) * Math.sin(sp)];
    out.push(sweep(pts, rad, fs, [1, 0, 0], true, [pts[6][0] + dl[0] * R0[f] * 0.75, pts[6][1] + dl[1] * R0[f] * 0.75, pts[6][2] + dl[2] * R0[f] * 0.75]));
    out.nails.push([pts[6].map((v, i) => v - dl[i] * 0.003 + back[i] * R0[f] * k * 0.72), dl, back, R0[f] * k * 0.78]);
  }
  const T0 = [[0.004, 0.006, 0.02], [0.012, 0.03, 0.035], [0.018, 0.05, 0.043], [0.022, 0.066, 0.044]], T1 = [[0.004, 0.006, 0.02], [0.016, 0.03, 0.034], [0.03, 0.046, 0.03], [0.038, 0.056, 0.016]];
  const tp = T0.map((q, i) => q.map((v, j) => lerp(v, T1[i][j], g) * (j === 2 ? k : 1))), tr = [0.013 * k, 0.0108 * k, 0.0098 * k, 0.0085 * k];
  const td = nrm(sub(tp[3], tp[2]));
  out.push(sweep(tp, tr, fs, [0, 0, 1], true, [tp[3][0] + td[0] * 0.007, tp[3][1] + td[1] * 0.007, tp[3][2] + td[2] * 0.007]));
  const tb = nrm(cross(td, [0, 0, 1])); out.nails.push([tp[3].map((v, i) => v - td[i] * 0.002 - tb[i] * tr[3] * 0.7), td, tb.map((v) => -v), tr[3] * 0.85]);
  return out;
}
function handMatrix(pr, s) { const A = SD(s), j = pr.J['hand' + A], m = M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1); return m.multiply(M4(0, 0, 0, 0, 0, Math.PI, pr.hd)); }
function handPiece(K, pr, O, s) {
  const holds = s > 0 && O.prop, grip = holds ? (O.prop === 'torch' ? 0.7 : 1) : O.bag && s < 0 ? 0.85 : 0.12, m = handMatrix(pr, s), b = B['hand' + SD(s)];
  const c = O.gloves ?? O.skin, r = O.gloves ? 0.7 : 0.55;
  for (const p of handPieces(pr, grip, O.gloves ? 1.08 : 1)) K.add(p, { m, c, r, b });
}
function legPiece(K, pr, O, s) {
  const J = pr.J, A = SD(s), j = J['leg' + A], bare = !!O.skirt || O.bottom === 'none', R = limbT(legRings(pr, bare)), m = M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), w = wLeg(J, s);
  const pc = O.coat && O.style === 'fire' ? O.pants : O.pants, sh = O.bottom === 'jeans' ? 0xb07a3a : mul(pc, 0.8);
  const col = (x, y, z, nx, ny, nz) => {
    if (bare) return O.legs ?? O.skin;
    if (nz < -0.3 && Math.abs(y - 0.5) < 0.06) return mix(pc, 0x000000, 0.2 * G(y - 0.5, 0.03) * -nz); // creux du genou
    if (Math.abs(nx * s) > 0.95 && nx * s > 0) return sh; // couture extérieure
    if (O.bottom === 'jeans' && nz > 0.9 && y > 0.6) return mix(pc, 0xffffff, 0.06);
    return pc;
  };
  K.add(loft(R, 16), { m, c: col, r: bare ? 0.55 : O.pantsR, w });
  if (O.bands) reflect(K, R, 0.225 - j[1], 0.03, 16, { m, w });
  if (!bare && O.bottom === 'cargo') K.add(slab(0.09, 0.12, 0.012, 5), { m: M4(j[0] + s * 0.083, 0.68, 0.0, 0, s * Math.PI / 2, 0), c: mul(pc, 0.92), r: O.pantsR, w });
}
// chaussure (repère du pied : cheville à l'origine, sol en y = −0,08) — anneaux le long de +z
const SHOE = [[-0.074, 0.018, 0.03, 0.024, 0.048, 2.4], [-0.066, 0.034, 0.036, 0.046, 0.042, 2.8], [-0.042, 0.041, 0.04, 0.052, 0.038, 3.2], [-0.005, 0.044, 0.044, 0.055, 0.035, 3.2], [0.045, 0.048, 0.039, 0.045, 0.04, 3.2], [0.095, 0.051, 0.033, 0.027, 0.047, 3.2], [0.145, 0.049, 0.029, 0.021, 0.051, 3], [0.18, 0.041, 0.025, 0.017, 0.055, 2.6], [0.2, 0.026, 0.02, 0.012, 0.059, 2.2]];
function shoePiece(K, pr, O, s) {
  const J = pr.J, A = SD(s), j = J['foot' + A], k = pr.ft, kind = O.shoe;
  let R = SHOE.map((q) => [q[0] * k, q[1] * k, q[2], q[3], q[4], q[5]]);
  if (kind === 'boot') R = R.map((q, i) => (i < 4 ? [q[0], q[1] * 1.04, q[2], q[3] + 0.09, q[4], q[5]] : q));
  if (kind === 'clown') R = R.map((q) => [q[0] * (q[0] > 0 ? 1.7 : 1), q[1] * (q[0] > 0.05 ? 1.45 : 1.05), q[2] * 1.1, q[3] * (q[0] > 0.05 ? 1.6 : 1), q[4], 2.4]);
  if (kind === 'sneaker') R = R.map((q, i) => [q[0], q[1] * 1.04, q[2] + 0.002, q[3] + (i > 4 ? 0.004 : 0), q[4], q[5] - 0.3]);
  const tip = R[R.length - 1], m = M4(j[0], j[1], j[2] + 0.008, 0, 0, 0, s, 1, 1).multiply(M4(0, 0, 0, Math.PI / 2, 0, 0));
  const soleY = kind === 'sneaker' ? -0.062 : -0.071, b = B['foot' + A];
  const col = (x, y, z, nx, ny, nz) => (y < soleY ? O.sole : kind === 'sneaker' && ny > 0.55 && z - j[2] > 0.0 && z - j[2] < 0.1 && Math.abs(x - j[0]) < 0.018 ? mix(O.shoeC, 0xffffff, 0.5) : O.shoeC);
  K.add(loft(T7(R), 16, null, true, [0, tip[0] + 0.006, tip[4]]), { m, c: col, r: (x, y) => (y < soleY ? 0.9 : kind === 'sneaker' ? 0.7 : kind === 'boot' && O.style === 'fire' ? 0.5 : 0.32), b });
}
// tête : crâne et visage modelés, yeux, paupières, sourcils, nez, lèvres, oreilles
function headPiece(K, pr, O) {
  const HT = pr.headT, J = pr.J.head, S = pr.hs, m = M4(J[0], J[1], J[2], 0, 0, 0, S), b = B.head, sk = O.skin;
  const bal = O.hat === 'balaclava', paint = O.facePaint;
  const fz = (x, y) => { const q = secAt(HT, y), u = Math.min(0.999, Math.abs(x) / q[1]); return frontZ(q, x) + faceDZ(x, y, Math.sqrt(1 - u * u), pr); };
  const toH = (x, y, z) => [(x - J[0]) / S, (y - J[1]) / S, (z - J[2]) / S];
  const headCol = (X, Y, Z) => {
    const [x, y, z] = toH(X, Y, Z), ax = Math.abs(x), front = z > 0.02;
    if (bal) return front && Math.abs(y - 0.064) < 0.021 && ax < 0.058 ? sk : 0x222222;
    if (O.style === 'catsuit' && !(front && y < 0.11 && ax < 0.06 && z > 0.035)) return O.top;
    let c = sk;
    if (paint && front && z > 0.04) c = 0xf4f0ec;
    c = mix(c, 0xc0604a, 0.1 * G(ax - 0.045, 0.02) * G(y - 0.028, 0.02) * (front ? 1 : 0));
    if ((O.beard === 'stubble' || O.beard === 'beard') && y < 0.018 && (front || y < 0) && !(ax < 0.028 && y > -0.022 && y < 0.012 && z > 0.06)) c = mix(c, mul(O.hair, 0.55), O.beard === 'beard' ? 0.75 : 0.3);
    if (O.age) c = mix(c, mul(sk, 0.82), 0.25 * G(y - 0.03, 0.01) * G(ax - 0.035, 0.012));
    if (O.ghostly && front) c = mix(c, 0x4a3038, 0.55 * G(ax - 0.033, 0.016) * G(y - 0.052, 0.011) + 0.25 * G(ax - 0.032, 0.022) * G(y - 0.068, 0.016));
    return c;
  };
  K.add(loft(HT, 28, (v, r, t) => [v[0], v[1], v[2] + faceDZ(v[0], v[1], Math.sin(t), pr)], [0, HT[0][0] - 0.0015, HT[0][4]], [0, HT[HT.length - 1][0] + 0.003, HT[HT.length - 1][4]]), { m, c: headCol, r: bal ? 0.95 : 0.55, b });
  if (pr.kind === 'mannequin') return;
  // yeux et paupières
  const er = pr.c ? 0.0142 : 0.0118;
  for (const s of [-1, 1]) {
    const E = [s * (pr.c ? 0.031 : 0.032), pr.c ? 0.058 : 0.0635, (pr.c ? 0.0595 : 0.0605) - (pr.gaunt ? 0.005 : 0)];
    K.add(ell(er, er, er, 12, 9, E[0], E[1], E[2]), { m, c: (X, Y, Z) => { const [x, y, z] = toH(X, Y, Z), d = nrm([x - E[0], y - E[1], z - E[2]]); return pr.gaunt ? (d[2] > 0.8 ? 0x0c0a08 : 0x5a4a3a) : O.ghostly ? (d[2] > 0.72 ? 0x0a0808 : 0x8a8480) : d[2] > 0.965 ? 0x0a0a0a : d[2] > 0.875 ? (d[2] < 0.89 ? mul(O.eye, 0.6) : O.eye) : mix(0xe8e2d8, 0xd8b0a4, ss(0.5, -0.2, d[2])); }, r: 0.08, b });
    // fente des paupières en amande (la paupière supérieure couvre le haut de l'iris), ligne des cils
    const oc = pr.c ? 0.03 : 0.02, oh = pr.gaunt ? 0.46 : pr.c ? 0.4 : 0.33, slit = (d) => ((d[1] - oc) / (oh * (1 - 0.45 * (d[0] / 0.9) ** 2))) ** 2 + (d[0] / 0.9) ** 2;
    const lid = keepTris(ball(24, 16, (dx, dy, dz) => [E[0] + dx * er * 1.09, E[1] + dy * er * 1.09, E[2] + dz * er * 1.09]), (x, y, z) => { const d = nrm([x - E[0], y - E[1], z - E[2]]); return d[2] > -0.25 && !(d[2] > 0 && slit(d) < 1); });
    K.add(lid, { m, c: (X, Y, Z) => { const [x, y, z] = toH(X, Y, Z), d = nrm([x - E[0], y - E[1], z - E[2]]); return bal ? sk : pr.gaunt ? mix(sk, 0x3a2a2a, 0.6) : d[1] > oc && d[2] > 0.2 && slit(d) < 1.7 ? mix(sk, 0x1a1210, 0.85) : mul(sk, 0.96); }, r: 0.5, b });
    if (bal || pr.gaunt) continue;
    // sourcil
    const bp = [0.013, 0.025, 0.038, 0.05, 0.058].map((x, i) => { const y = (pr.f ? 0.084 : 0.083) + [0, 0.004, 0.0055, 0.003, -0.002][i] * (pr.f ? 1.3 : 1); return [s * x, y, fz(x, y) + 0.0012]; });
    const br = (pr.f ? [0.0022, 0.0024, 0.0022, 0.0017, 0.0011] : [0.0034, 0.0034, 0.003, 0.0024, 0.0015]).map((r) => [r, 0.0014]);
    K.add(sweep(s > 0 ? bp : bp.slice().reverse(), s > 0 ? br : br.slice().reverse(), 6, [0, 1, 0]), { m, c: O.brow, r: 0.7, b });
  }
  if (!bal) {
    // nez : arête, bout arrondi, ailes
    const nk = pr.c ? 0.68 : pr.f ? 0.86 : 1, z0 = fz(0, 0.066);
    const np = [[0, 0.068, z0 - 0.004], [0, 0.056, z0 + 0.005 * nk], [0, 0.042, z0 + 0.014 * nk], [0, 0.029, z0 + 0.023 * nk], [0, 0.019, z0 + 0.029 * nk], [0, 0.012, z0 + 0.026 * nk]];
    if (pr.gaunt) for (const p of np) p[2] = z0 - 0.004 + (p[2] - z0) * 0.25;
    K.add(sweep(np, [[0.0055, 0.004], [0.006, 0.005], [0.0068, 0.006], [0.0088 * nk, 0.0075], [0.0108 * nk, 0.0085], [0.008 * nk, 0.006]], 8, [1, 0, 0], true, [0, 0.009, z0 + 0.021 * nk]), { m, c: O.redNose ? 0xd50000 : mix(sk, 0xc0604a, 0.06), r: O.redNose ? 0.3 : 0.5, b });
    if (O.redNose) K.add(ell(0.017, 0.016, 0.016, 12, 9, 0, 0.02, z0 + 0.03), { m, c: 0xd50000, r: 0.25, b });
    if (!pr.gaunt) for (const s of [-1, 1]) K.add(ell(0.0075 * nk, 0.0062 * nk, 0.0082 * nk, 8, 6, s * 0.0115 * nk, 0.0135, z0 + 0.012 * nk), { m, c: mix(sk, 0xb05848, 0.05), r: 0.5, b });
    // lèvres et trait de la bouche
    const lip = (yc, th, dz, n = 9) => { const pts = [], rad = []; for (let i = 0; i < n; i++) { const u = i / (n - 1) * 2 - 1, x = u * (pr.c ? 0.019 : 0.0245), y = yc + (yc > 0 ? 0.0012 * G(Math.abs(u) - 0.35, 0.3) : -0.001 * (1 - u * u)), g = G(u, 0.62); pts.push([x, y, fz(x, y) - 0.003 + dz * g]); rad.push([0.0009 + th * g, 0.0018 + th * 0.8 * g]); } return sweep(pts, rad, 6, [0, 1, 0]); };
    const lt = pr.f ? 1.25 : 1;
    if (pr.gaunt) K.add(lip(-0.004, 0.0012, -0.002), { m, c: 0x140c0a, r: 0.6, b });
    else {
      K.add(lip(0.0018, 0.0026 * lt, 0.0012), { m, c: paint ? 0xd50000 : O.lip, r: 0.4, b });
      K.add(lip(-0.0078, 0.0032 * lt, 0.0016), { m, c: paint ? 0xd50000 : O.lip, r: 0.4, b });
      K.add(lip(-0.0028, 0.0006, -0.0008, 7), { m, c: mul(O.lip, 0.35), r: 0.6, b });
    }
    if (O.mustache) K.add(sweep([[-0.029, -0.002, fz(0.029, -0.002) - 0.001], [-0.022, 0.004, fz(0.022, 0.004) + 0.001], [-0.011, 0.0085, fz(0.011, 0.0085) + 0.003], [0, 0.0095, fz(0, 0.0095) + 0.0035], [0.011, 0.0085, fz(0.011, 0.0085) + 0.003], [0.022, 0.004, fz(0.022, 0.004) + 0.001], [0.029, -0.002, fz(0.029, -0.002) - 0.001]], [[0.0018, 0.0016], [0.0042, 0.0035], [0.0058, 0.0045], [0.0055, 0.0045], [0.0058, 0.0045], [0.0042, 0.0035], [0.0018, 0.0016]], 8, [0, 1, 0]), { m, c: mul(O.hair, 0.9), r: 0.8, b });
  }
  // oreilles (pavillon creusé, lobe)
  if (!bal && O.hat !== 'helmet' && O.hairStyle !== 'long' && O.hairStyle !== 'bob' && O.hairStyle !== 'stringy') for (const s of [-1, 1]) {
    const ek = pr.c ? 0.85 : pr.f ? 0.9 : 1, ear = ball(10, 9, (dx, dy, dz) => { const r2 = dx * dx * 0 + dy * dy + dz * dz; return [dx * 0.0085 - (dx > 0 ? 0.004 * Math.max(0, 1 - r2 * 1.3) : 0), dy * 0.03 * ek, dz * 0.0185 * ek]; });
    K.add(ear, { m: m.clone().multiply(M4(s * 0.0745, 0.04, -0.01, -0.15, -s * 0.35, 0, s, 1, 1)), c: O.style === 'catsuit' ? O.top : mix(sk, 0xc0604a, 0.08), r: 0.55, b });
  }
}
// cheveux : coque sur le crâne limitée à la zone chevelue, mèches, queue de cheval, chignon…
function hairPiece(K, pr, O) {
  const st = O.hairStyle; if (!st || st === 'none') return;
  const HT = pr.headT, J = pr.J.head, S = pr.hs, m = M4(J[0], J[1], J[2], 0, 0, 0, S), b = B.head, hc = O.hair;
  const cfg = {
    short: { front: 0.128, side: 0.035, ear: 0.088, nape: -0.012, top: 0.013, sides: 0.006 }, side: { front: 0.126, side: 0.038, ear: 0.09, nape: -0.01, top: 0.016, sides: 0.006, part: 1 },
    buzz: { front: 0.13, side: 0.04, ear: 0.09, nape: -0.005, top: 0.0035, sides: 0.0028 }, bald: { front: 0.2, side: 0.04, ear: 0.088, nape: -0.012, top: 0.005, sides: 0.005, crown: 0.12 },
    curly: { front: 0.126, side: 0.04, ear: 0.088, nape: -0.012, top: 0.02, sides: 0.01, curl: 1 }, long: { front: 0.13, side: -0.03, ear: -0.03, nape: -0.04, top: 0.012, sides: 0.011, part: 0 },
    bob: { front: 0.125, side: -0.02, ear: -0.02, nape: -0.03, top: 0.013, sides: 0.012 }, ponytail: { front: 0.132, side: 0.045, ear: 0.08, nape: -0.005, top: 0.007, sides: 0.005 },
    bun: { front: 0.132, side: 0.045, ear: 0.08, nape: 0.0, top: 0.007, sides: 0.005 }, clown: { front: 0.2, side: 0.04, ear: 0.088, nape: -0.012, top: 0.004, sides: 0.004, crown: 0.13 },
    stringy: { front: 0.1, side: 0.0, ear: 0.0, nape: -0.03, top: 0.004, sides: 0.004 },
  }[st] || { front: 0.128, side: 0.035, ear: 0.088, nape: -0.012, top: 0.013, sides: 0.006 };
  const line = (phi) => { const a = Math.abs(phi), h1 = lerp(cfg.front + (st === 'short' && O.age ? 0.012 * ss(0.25, 0.7, a) : 0), cfg.side, ss(0.55, 1.2, a)); return lerp(lerp(h1, cfg.ear, ss(1.2, 1.34, a)), cfg.nape, ss(1.78, 2.7, a)); };
  const C = [0, 0.06, -0.012];
  const thick = (x, y, z) => { const phi = Math.atan2(x, z - C[2]), h = line(phi), u = ss(h - 0.006, h + 0.014, y); let t = lerp(cfg.sides, cfg.top, ss(0.06, 0.15, y)) * u - 0.004 * (1 - u); if (cfg.part !== undefined) t *= 1 + 0.25 * Math.sign(x || 1) * (cfg.part ? 1 : 0) * ss(0.1, 0.16, y); if (cfg.curl) t += 0.004 * Math.sin(phi * 9) * Math.sin(y * 140) * u; return t; };
  const capY = O.hat === 'cap' || O.hat === 'police' ? 0.108 : O.hat === 'firehelmet' ? 0.06 : 1;
  const inside = (x, y, z) => { const phi = Math.atan2(x, z - C[2]); if (cfg.crown && y > cfg.crown && Math.abs(phi) < 2.2) return false; if (y > capY + 0.012 * Math.cos(phi)) return false; return y > line(phi) - 0.001; };
  const HD = []; for (let y = HT[0][0]; y < HT[HT.length - 1][0] - 0.004; y += y > 0.05 ? 0.0085 : 0.014) HD.push(secAt(HT, y)); HD.push(HT[HT.length - 1]);
  const shell = keepTris(loft(HD, 32, (v) => { const d = nrm(sub(v, C)), t = thick(v[0], v[1], v[2]) + 0.0012; return [v[0] + d[0] * t, v[1] + d[1] * t, v[2] + d[2] * t]; }, false, [0, HT[HT.length - 1][0] + 0.003 + cfg.top, HT[HT.length - 1][4]]), (x, y, z) => inside(x, y + 0.03, z));
  const hcol = (X, Y, Z) => { const y = (Y - J[1]) / S; return mix(mul(hc, 0.78), hc, ss(0.0, 0.14, y)); };
  K.add(shell, { m, c: hcol, r: 0.6, b });
  // rideau de cheveux longs / carré : surface double face qui tombe des côtés et de la nuque
  if (st === 'long' || st === 'bob' || st === 'stringy') {
    const y0 = 0.07, y1 = st === 'long' ? (pr.c ? -0.13 : -0.24) : st === 'bob' ? -0.028 : -0.3, a0 = st === 'stringy' ? 0.15 : 0.95, n = 22, rows = 7, q0 = secAt(HT, y0);
    const cols = n;
    const g = surf(rows, cols, (r, c) => {
      const v = r / (rows - 1), a = a0 + (c / (cols - 1)) * (Math.PI * 2 - 2 * a0), phi = Math.PI / 2 + a; // a0 → 2π−a0, en passant par la nuque
      const len = 1 + (st === 'stringy' ? 0.35 : 0.08) * (hash(c, 3, 1) - 0.5), y = lerp(y0, y1 * len, v);
      const p = secPt(q0, phi, 0.012 + cfg.sides);
      const out = 0.004 + v * (st === 'bob' ? 0.009 * Math.sin(v * Math.PI * 0.8) : 0.022) + (y < -0.03 ? (-0.03 - y) * 0.1 : 0);
      const d = nrm([p[0], 0, p[2] - C[2]]);
      const curl = st === 'bob' ? -0.012 * ss(0.75, 1, v) : 0;
      return [p[0] + d[0] * (out + curl), y, p[2] + d[2] * (out + curl) - (y < -0.06 ? (y + 0.06) * 0.25 * Math.max(0, -d[2]) : 0)];
    }, false, false, true);
    K.add(twoSided(g), { m, c: (X, Y) => mix(mul(hc, 0.8), hc, ss(-0.3, 0.05, (Y - J[1]) / S)), r: 0.6, b });
    if (st === 'stringy') for (let i = 0; i < 9; i++) { const x = (i / 8 - 0.5) * 0.09, z0 = fzHead(HT, x, 0.12) + 0.004, L = 0.16 + hash(i, 7, 2) * 0.12; K.add(sweep([[x, 0.15, z0 - 0.02], [x * 1.05, 0.1, z0 + 0.006], [x * 1.1, 0.04, z0 + 0.014], [x * 1.15, 0.12 - L, z0 + 0.02]], [0.004, 0.0035, 0.003, 0.0015], 5, [1, 0, 0]), { m, c: hc, r: 0.55, b }); }
  }
  if (st === 'ponytail') {
    K.add(sweep([[0, 0.09, -0.104], [0, 0.07, -0.13], [0, 0.02, -0.142], [0, -0.05, -0.138], [0, -0.12, -0.128], [0, -0.17, -0.118]], [0.012, 0.02, 0.019, 0.016, 0.011, 0.004], 10, [1, 0, 0]), { m, c: hc, r: 0.6, b });
    K.add(sweep([[0, 0.098, -0.11], [0, 0.082, -0.122]], [0.0145, 0.0145], 10, [1, 0, 0]), { m, c: 0x1a1a1a, r: 0.6, b });
  }
  if (st === 'bun') K.add(ell(0.036, 0.03, 0.032, 12, 9, 0, 0.13, -0.095), { m, c: hc, r: 0.6, b });
  if (O.bow) { const bm = m.clone().multiply(M4(0.058, 0.128, 0.03, 0.3, 0.6, -0.5)); for (const s of [-1, 1]) K.add(ell(0.026, 0.017, 0.008, 10, 6, s * 0.022, 0, 0), { m: bm.clone().multiply(M4(0, 0, 0, 0, 0, s * 0.25)), c: O.bow, r: 0.55, b }); K.add(ell(0.009, 0.011, 0.009, 8, 6), { m: bm, c: mul(O.bow, 0.8), r: 0.55, b }); }
  if (st === 'clown') for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const a = i / 5; K.add(ell(0.03, 0.03, 0.03, 9, 7, s * (0.075 + 0.012 * Math.sin(a * 3)), 0.11 - a * 0.07, -0.02 - a * 0.05 + 0.01 * Math.cos(a * 5)), { m, c: hc, r: 0.85, b }); }
  if (O.beard === 'beard') { // barbe courte : coque sur le bas du visage
    const g = keepTris(loft(HT.filter((q) => q[0] < 0.035), 28, (v, r, t) => { const d = nrm(sub(v, [0, 0.02, 0])), tt = 0.004 * ss(0.03, 0.0, v[1]); return [v[0] + d[0] * tt, v[1] + d[1] * tt, v[2] + faceDZ(v[0], v[1], Math.sin(t), pr) + d[2] * tt]; }, [0, HT[0][0] - 0.004, HT[0][4]], false), (x, y, z) => z > -0.03 && !(Math.abs(x) < 0.026 && y > -0.02 && y < 0.012 && z > 0.05));
    K.add(g, { m, c: mul(O.hair, 0.85), r: 0.85, b });
  }
}
const fzHead = (HT, x, y) => frontZ(secAt(HT, y), x);
// couvre-chefs : casquette, casquette de police, casque de pompier, casque d'astronaute ; lunettes
function hatPiece(K, pr, O) {
  const HT = pr.headT, J = pr.J.head, S = pr.hs, m = M4(J[0], J[1], J[2], 0, 0, 0, S), b = B.head, h = O.hat;
  if (O.glasses) {
    const g = O.glasses, gm = typeof g === 'number' && (g === 0x8a7a5a) ? 0.9 : 0;
    for (const s of [-1, 1]) {
      const cx = s * 0.032, cy = 0.064, z = fzHead(HT, 0.032, 0.064) + 0.012, pts = [];
      for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2; pts.push([cx + Math.cos(a) * 0.021 * Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** 0.5, cy + Math.sin(a) * 0.014 * Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** 0.5, z - 0.003 * Math.abs(Math.cos(a))]); }
      K.add(sweep(pts, 0.0016, 5, [0, 0, 1], false, false), { m, c: g, r: 0.3, mt: gm, b });
      K.add(sweep([[s * 0.053, cy + 0.004, z - 0.004], [s * 0.074, cy + 0.006, z - 0.03], [s * 0.078, cy + 0.0, -0.03]], 0.0014, 4, [0, 1, 0]), { m, c: g, r: 0.3, mt: gm, b });
    }
    K.add(sweep([[-0.011, 0.068, fzHead(HT, 0.011, 0.068) + 0.011], [0, 0.07, fzHead(HT, 0, 0.07) + 0.012], [0.011, 0.068, fzHead(HT, 0.011, 0.068) + 0.011]], 0.0014, 4, [0, 1, 0]), { m, c: g, r: 0.3, mt: gm, b });
  }
  if (!h) return;
  if (h === 'cap' || h === 'police') {
    const c = O.hatCol, pol = h === 'police', o = O.hairStyle === 'none' || O.hairStyle === 'buzz' ? 0.012 : 0.016;
    const yb = 0.098, rings = [yb, yb + 0.022, 0.142, 0.162, 0.176].map((y, i) => { const q = secAt(HT, Math.min(0.176, y)), k = pol ? [1, 1.04, 1.12, 1.18, 1.18][i] : [1, 1, 1, 0.96, 0.8][i]; return [y + (pol && i > 2 ? 0.012 * (i - 2) : 0), (q[1] + o) * k, (q[2] + o) * k, (q[3] + o) * k, q[4], 2.3]; });
    K.add(loft(T7(rings), 26, (v, r, t) => [v[0], v[1] + 0.012 * Math.sin(t) - (r === 0 ? 0 : 0), v[2]], false, [0, rings[4][0] + (pol ? 0.004 : 0.008), rings[4][4]]), { m, c: (X, Y) => (pol && (Y - J[1]) / S < yb + 0.02 ? 0x111111 : c), r: 0.75, b });
    // visière
    const zf = secAt(HT, yb)[2] + secAt(HT, yb)[4] + o, vis = surf(5, 9, (r, cc) => { const u = r / 4, x = (cc / 8 - 0.5) * 0.15, z = zf - 0.008 + u * (pol ? 0.055 : 0.068) - 0.04 * (x / 0.075) ** 2 * (1 - u * 0.4); return [x, yb + 0.012 - u * (pol ? 0.016 : 0.01) - 0.012 * (x / 0.075) ** 2, z]; }, false, false, true);
    const vis2 = { p: vis.p.map((v, i) => (i % 3 === 1 ? v - 0.004 : v)), i: vis.i };
    K.add(vis, { m, c: pol ? 0x0e0e0e : c, r: pol ? 0.25 : 0.7, b });
    K.add({ p: vis2.p, i: vis2.i.map((v, i) => vis2.i[i - (i % 3) + [0, 2, 1][i % 3]]) }, { m, c: pol ? 0x0e0e0e : mul(c, 0.8), r: 0.7, b });
    if (!pol) K.add(ell(0.007, 0.004, 0.007, 8, 5, 0, rings[4][0] + 0.009, rings[4][4]), { m, c, r: 0.7, b });
    if (O.style === 'guard' || pol) K.add(slab(0.026, 0.03, 0.004, 3), { m: m.clone().multiply(M4(0, yb + 0.03, zf + 0.004, -0.2)), c: 0xd4af37, r: 0.3, mt: 0.9, b });
  }
  if (h === 'firehelmet') {
    const c = O.fireCol, sh = (y, k = 1) => { const q = secAt(HT, Math.min(0.178, y)); return [y, (q[1] + 0.03) * k, (q[2] + 0.035) * k, (q[3] + 0.034) * k, q[4], 2.2]; };
    const R = T7([sh(0.03, 0.98), sh(0.05), sh(0.1, 1.01), sh(0.14, 1.0), sh(0.168, 0.94), sh(0.188, 0.8), sh(0.2, 0.5)]);
    K.add(loft(R, 28, (v, r, t) => [v[0], r < 2 ? lerp(v[1], 0.112, ss(0.15, 0.75, Math.sin(t))) : v[1], v[2]], false, [0, 0.204, -0.012]), { m, c, r: 0.22, mt: 0.15, b });
    K.add(twoSided(surf(7, 13, (r, cc) => { const a = (cc / 12 - 0.5) * 2.05, v = r / 6, y = 0.115 - v * 0.1; const q = secAt(HT, 0.065); return [Math.sin(a) * (q[1] + 0.048 - v * 0.012), y, q[4] + Math.cos(a) * (q[2] + 0.05 + 0.012 * Math.sin(v * Math.PI)) - v * 0.01]; }, false, false, true)), { m, c: 0xb8922a, r: 0.1, mt: 1, b });
    K.add(sweep([[0, 0.17, 0.09], [0, 0.205, 0.0], [0, 0.18, -0.1]], [[0.012, 0.01], [0.014, 0.012], [0.012, 0.01]], 8, [1, 0, 0]), { m, c: mul(c, 0.9), r: 0.25, mt: 0.15, b });
    K.add(twoSided(surf(4, 11, (r, cc) => { const a = Math.PI / 2 + 0.9 + (cc / 10) * (Math.PI * 2 - 1.8), y = 0.05 - r / 3 * 0.09; const q = secAt(HT, 0.03); return [Math.cos(a) * (q[1] + 0.034 + r * 0.006), y, q[4] + Math.sin(a) * (q[3] + 0.034 + r * 0.008)]; }, false, false, true)), { m, c: 0x1e2430, r: 0.9, b });
  }
  if (h === 'helmet') {
    const C = [0, 0.055, 0.0], R = 0.17;
    K.add(ball(26, 18, (x, y, z) => [C[0] + x * R, C[1] + y * R * 1.02, C[2] + z * R]), { m, c: (X, Y, Z) => { const y = (Y - J[1]) / S - C[1], z = (Z - J[2]) / S; return z > 0.06 && Math.abs(y) < 0.085 + 0.03 * (z - 0.06) / 0.11 ? 0xc89a3a : 0xeceff1; }, r: (X, Y, Z) => ((Z - J[2]) / S > 0.06 ? 0.08 : 0.35), mt: 0, b });
    K.add(loft(T7([[-0.12, 0.11, 0.11, 0.11, -0.005], [-0.1, 0.115, 0.115, 0.115, -0.005], [-0.085, 0.11, 0.11, 0.11, -0.005]]), 20, null, false, false), { m, c: 0x90a4ae, r: 0.3, mt: 0.6, b });
  }
}
// détails du haut : cols, patte de boutonnage, poches, épaulettes, insignes, ceinture, radio, étui, capuche, tablier…
function topDetails(K, pr, O) {
  const T = pr.torso, J = pr.J, nb = J.neck[1], wt = wTorso(pr), wn = wNeck(J), fr = (x, y, o = 0) => frontZ(secAt(T, y), x, o);
  const cTop = O.jacket ? O.jacket.c : O.coat || O.top;
  const onChest = (x, y, rx = 0) => { const z = fr(x, y), z2 = fr(x + 0.01, y); return M4(x, y, z - 0.002, rx, Math.atan2(z - z2, 0.01), 0); };
  // col
  if (O.collar === 'shirt' || O.collar === 'polo') {
    K.add(band(pr.neckR, nb - 0.045, nb + 0.018, 0.0065, 18), { c: O.top, r: O.topR, w: wn });
    for (const s of [-1, 1]) { const x = s * 0.034, y = nb - 0.05; K.add(ell(0.026, 0.034, 0.0035, 8, 6), { m: M4(x, y, fr(x, y) + 0.004, -0.35, s * 0.32, s * 0.55), c: O.top, r: O.topR, w: wt }); }
  } else if (O.collar === 'crew' || O.collar === 'round') K.add(band(pr.neckR, nb - 0.048, nb - 0.022, 0.006, 18), { c: O.ribbed ? mul(cTop, 0.88) : mul(O.jacket ? O.inner : O.top, 0.92), r: O.topR, w: wn });
  else if (O.collar === 'high') K.add(band(pr.neckR, nb - 0.05, nb + 0.035, 0.007, 18), { c: O.top, r: O.topR, w: wn });
  else if (O.collar === 'ruff') for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, q = secAt(pr.neckR, nb - 0.03); K.add(ell(0.03, 0.012, 0.022, 8, 5), { m: M4(Math.cos(a) * (q[1] + 0.03), nb - 0.035, q[4] + Math.sin(a) * (q[2] + 0.03), 0, -a, 0.4), c: 0xf6f6f6, r: 0.8, w: wt }); }
  else if (O.collar === 'hood') { // capuche rabattue dans le dos, cordons
    const q = secAt(T, 1.47), pts = []; for (let i = 0; i <= 10; i++) { const a = -0.15 - i / 10 * (Math.PI - 0.3); pts.push([Math.cos(a) * (q[1] - 0.005), 1.47 + 0.02 * Math.sin(i / 10 * Math.PI), q[4] + Math.sin(a) * (q[3] + 0.012)]); }
    K.add(sweep(pts, pts.map((p, i) => { const g = Math.sin(i / 10 * Math.PI); return [0.018 + 0.03 * g, 0.012 + 0.02 * g]; }), 10, [0, 1, 0]), { c: mul(O.top, 0.94), r: O.topR, w: wt });
    for (const s of [-1, 1]) K.add(sweep([[s * 0.03, nb - 0.03, fr(0.03, nb - 0.03) + 0.004], [s * 0.032, nb - 0.1, fr(0.032, nb - 0.1) + 0.005], [s * 0.034, nb - 0.16, fr(0.034, nb - 0.16) + 0.005]], 0.0025, 5, [1, 0, 0]), { c: 0xd8d8d8, r: 0.7, w: wt });
    K.add(slab(0.2, 0.11, 0.008, 5), { m: onChest(0, 1.04), c: mul(O.top, 0.95), r: O.topR, w: wt });
  }
  // patte de boutonnage, boutons
  if (O.buttons !== null && O.placket) {
    const n = O.collar === 'polo' ? 2 : 6, y0 = O.collar === 'polo' ? nb - 0.07 : nb - 0.06, dy = O.collar === 'polo' ? 0.035 : (y0 - (O.tuck ? 1.03 : O.hem + 0.04)) / (n - 1);
    for (let i = 0; i < n; i++) { const y = y0 - i * dy; K.add(ell(0.0052, 0.0052, 0.0022, 8, 5, 0, 0, 0), { m: M4(0, y, fr(0, y) + 0.003), c: O.buttons, r: 0.35, w: wt }); }
  }
  if (O.pockets) for (const s of [-1, 1]) { // poches de poitrine à rabat boutonné
    const x = s * 0.078, y = 1.29;
    K.add(slab(0.088, 0.105, 0.005), { m: onChest(x, y), c: mul(O.top, 0.97), r: O.topR, w: wt });
    K.add(slab(0.092, 0.03, 0.006, 4), { m: onChest(x, y + 0.045, -0.12), c: mul(O.top, 0.9), r: O.topR, w: wt });
    K.add(ell(0.0048, 0.0048, 0.002, 8, 5), { m: M4(x, y + 0.04, fr(x, y + 0.04) + 0.009), c: O.buttons ?? mul(O.top, 0.6), r: 0.35, w: wt });
  }
  if (O.epaul) for (const s of [-1, 1]) { // épaulettes le long de la pente de l'épaule
    const x = s * 0.118, y = 1.462, zc = secAt(T, y)[4];
    K.add(slab(0.11, 0.042, 0.005, 6), { m: M4(x, y + 0.004, zc - 0.004, 0, 0, s * -0.42).multiply(M4(0, 0, 0, -Math.PI / 2)), c: mul(O.top, 0.88), r: O.topR, w: wt });
    K.add(ell(0.0045, 0.0045, 0.002, 8, 5), { m: M4(s * 0.072, 1.484, zc - 0.002, -Math.PI / 2, 0, 0), c: O.buttons ?? 0x888888, r: 0.35, w: wt });
  }
  if (O.badge === 'guard' || O.badge === 'police') { // insigne métallique sur la poitrine (côté +x)
    const x = 0.08, y = 1.36;
    K.add(slab(0.046, 0.054, 0.004, 2.6), { m: onChest(x, y), c: O.badge === 'police' ? 0xc0c4c8 : 0xd4af37, r: 0.28, mt: 0.95, w: wt });
    K.add(slab(0.022, 0.026, 0.0055, 2.2), { m: onChest(x, y - 0.002), c: O.badge === 'police' ? 0x1a2a6a : 0x7a1c1c, r: 0.4, w: wt });
  }
  if (O.badge === 'name') K.add(slab(0.07, 0.022, 0.003, 6), { m: onChest(-0.085, 1.33), c: 0xf4f4f0, r: 0.4, w: wt });
  if (O.badge === 'police') K.add(slab(0.075, 0.022, 0.003, 6), { m: onChest(-0.08, 1.34), c: 0xf2f2f2, r: 0.5, w: wt });
  if (O.logo) K.add(slab(0.05, 0.032, 0.003, 4), { m: onChest(0.075, 1.32), c: O.logo, r: 0.6, w: wt });
  if (O.style === 'police' || O.style === 'guard') { // dossard au dos
    const q = secAt(T, 1.3); K.add(slab(0.22, 0.06, 0.003, 6), { m: M4(0, 1.32, q[4] - q[3] + 0.001, 0, Math.PI, 0), c: O.style === 'police' ? 0xf2f2f2 : 0xe8c547, r: 0.5, w: wt });
  }
  // ourlet du haut non rentré, ceinture et équipement
  if (!O.tuck && !O.skirt && O.waistY > 0.5) K.add(band(T, O.waistY - 0.012, O.waistY + 0.012, O.ribbed ? 0.006 : 0.0045, 26), { c: O.ribbed ? mul(cTop, 0.88) : cTop, r: O.topR, w: wt });
  if (O.jacket) for (const s of [-1, 1]) { const x = s * 0.06; K.add(slab(0.05, 0.16, 0.004, 3), { m: M4(x, 1.36, fr(x, 1.36) + 0.002, -0.08, s * 0.25, s * -0.38), c: mul(O.jacket.c, 0.92), r: O.topR, w: wt }); }
  if (O.belt) {
    K.add(band(T, 0.975, 1.012, 0.0055, 26), { c: O.belt, r: 0.38, w: wt });
    K.add(slab(0.042, 0.034, 0.005, 3), { m: M4(0, 0.993, fr(0, 0.993, 0.0055)), c: 0xb8b8b8, r: 0.25, mt: 1, w: wt });
  }
  if (O.duty) { // radio, étui de lampe (gardien) / étui d'arme, menottes (police)
    const q = secAt(T, 0.98);
    K.add(slab(0.055, 0.105, 0.032, 5), { m: M4(0.135, 0.965, q[4] + q[2] * 0.55, 0, 0.95, 0), c: 0x1c1c1c, r: 0.45, w: wt });
    K.add(sweep([[0.15, 1.015, q[4] + q[2] * 0.6], [0.152, 1.09, q[4] + q[2] * 0.6]], [0.0035, 0.0035], 6, [1, 0, 0]), { c: 0x111111, r: 0.5, w: wt });
    if (O.duty === 'guard') {
      K.add(sweep([[-0.162, 0.995, q[4] + 0.02], [-0.164, 0.88, q[4] + 0.022]], [0.02, 0.02], 10, [1, 0, 0]), { c: 0x181818, r: 0.4, w: wt });
      K.add(sweep([[-0.162, 1.035, q[4] + 0.02], [-0.162, 0.995, q[4] + 0.02]], [0.024, 0.024], 10, [1, 0, 0]), { c: 0x2a2a2a, r: 0.3, mt: 0.6, w: wt });
    } else {
      K.add(slab(0.055, 0.15, 0.035, 4), { m: M4(-0.165, 0.92, q[4] + 0.01, 0, -Math.PI / 2, 0.06), c: 0x161616, r: 0.4, w: wt });
      K.add(slab(0.04, 0.05, 0.03, 3), { m: M4(-0.04, 0.97, q[4] - q[3] - 0.012, 0, Math.PI, 0), c: 0x161616, r: 0.4, w: wt });
      K.add(slab(0.045, 0.07, 0.022, 4), { m: onChest(0.07, 1.39), c: 0x1a1a1a, r: 0.45, w: wt });
    }
  }
  // tablier, blouse
  if (O.apron) {
    const ap = surf(9, 7, (r, c) => { const v = r / 8, y = lerp(0.6, 1.33, v), hw = lerp(0.16, y > 1.0 ? 0.1 : 0.15, ss(0.9, 1.08, y)), x = (c / 6 - 0.5) * 2 * hw, z = y > 0.86 ? fr(x, y) + 0.009 : 0.118 + 0.01 * Math.cos(x * 8); return [x, y, z]; }, false, false, true);
    K.add(twoSided(ap), { c: O.apron, r: 0.85, w: (x, y) => (y > 0.97 ? wt(x, y) : wSkirt(0.95, 0.6)(x, y)) });
    K.add(band(T, 1.0, 1.02, 0.011, 26), { c: mul(O.apron, 0.93), r: 0.85, w: wt });
  }
  if (O.bands) for (const y of [0.88, 1.095, 1.3]) reflect(K, T, y, 0.034, 26, { w: wt }); // veste de feu : bandes réfléchissantes
  if (O.scba) { // appareil respiratoire : bouteille dorsale et sangles
    const q = secAt(T, 1.2), zb = q[4] - q[3] - 0.07;
    K.add(sweep([[0, 0.98, zb], [0, 1.4, zb]], [0.074, 0.074], 14, [1, 0, 0], [0, 0.96, zb], [0, 1.44, zb]), { c: 0x2e3134, r: 0.35, mt: 0.4, w: wt, nb: true });
    K.add(sweep([[0, 1.44, zb], [0, 1.47, zb]], [0.03, 0.03], 10, [1, 0, 0]), { c: 0x1a1a1a, r: 0.4, mt: 0.6, w: wt, nb: true });
    for (const s of [-1, 1]) K.add(sweep([[s * 0.09, 1.0, q[4] + q[2] - 0.01], [s * 0.1, 1.25, q[4] + q[2] + 0.006], [s * 0.11, 1.44, q[4] + 0.02], [s * 0.1, 1.46, q[4] - 0.06], [s * 0.08, 1.35, zb + 0.06]], [[0.022, 0.004], [0.022, 0.004], [0.022, 0.004], [0.022, 0.004], [0.022, 0.004]], 6, [1, 0, 0]), { c: 0x1a1a1a, r: 0.7, w: wt, nb: true });
  }
  if (O.bag === 'backpack') {
    const q = secAt(T, 1.2), zb = q[4] - q[3];
    K.add(loft(T7([[1.02, 0.12, 0.04, 0.06, zb - 0.045, 4], [1.08, 0.135, 0.05, 0.07, zb - 0.05, 4], [1.32, 0.13, 0.05, 0.068, zb - 0.05, 4], [1.38, 0.1, 0.04, 0.05, zb - 0.045, 3]]), 16), { c: 0x2a2a2e, r: 0.8, w: wt, nb: true });
    for (const s of [-1, 1]) K.add(sweep([[s * 0.09, 1.38, zb - 0.02], [s * 0.1, 1.47, q[4] - 0.03], [s * 0.11, 1.44, q[4] + 0.08], [s * 0.12, 1.25, q[4] + q[2] + 0.008], [s * 0.14, 1.13, q[4] + q[2] - 0.01]], [[0.02, 0.004], [0.02, 0.004], [0.02, 0.004], [0.02, 0.004], [0.02, 0.004]], 6, [1, 0, 0]), { c: 0x1e1e20, r: 0.75, w: wt });
  }
  if (O.tail) K.add(sweep([[0, 0.97, -0.1], [0, 0.88, -0.17], [0, 0.7, -0.2], [0.03, 0.5, -0.16], [0.06, 0.4, -0.08]], [0.022, 0.02, 0.017, 0.013, 0.008], 8, [1, 0, 0]), { c: O.top, r: 0.75, w: (x, y) => [[B.hips, 1]], nb: true });
  if (O.pompoms) for (let i = 0; i < 3; i++) { const y = 1.36 - i * 0.12; K.add(ell(0.02, 0.02, 0.016, 10, 7), { m: M4(0, y, fr(0, y) + 0.012), c: O.pompoms[i], r: 0.95, w: wt }); }
  if (O.catEars) for (const s of [-1, 1]) { const H = pr.J.head, S = pr.hs; K.add(loft(T7([[0, 0.028, 0.01, 0.012, 0, 2], [0.03, 0.016, 0.006, 0.008, 0, 2], [0.055, 0.002, 0.002, 0.002, 0, 2]]), 8), { m: M4(H[0] + s * 0.05 * S, H[1] + 0.15 * S, H[2], -0.15, 0, s * -0.35, S), c: O.top, r: 0.7, b: B.head }); }
}
// jupe, robe, blouse longue (double face ; suit le bassin et à moitié les cuisses)
function skirtPiece(K, pr, O) {
  const sk = O.skirt || (O.coat && O.style !== 'fire' ? { c: O.coat, hem: O.hem, top: 1.0, open: true } : null); if (!sk) return;
  const T = pr.torso, y0 = sk.top, y1 = sk.hem, n = 7, rows = [];
  for (let i = 0; i < n; i++) { const v = i / (n - 1), y = lerp(y1, y0, v), q = secAt(T, Math.max(0.87, y)), fl = (1 - v) * (sk.short ? 0.05 : 0.075) + 0.007; rows.push([y, q[1] + fl, q[2] + fl * 0.9, q[3] + fl, q[4], 2.4]); }
  let g = loft(T7(rows), 26, (v, r, t) => [v[0], v[1] + (r === 0 ? 0.006 * Math.sin(t * 7) : 0), v[2]], false, false);
  if (sk.open) g = keepTris(g, (x, y, z) => !(z > 0 && Math.abs(x) < 0.03));
  K.add(twoSided(g), { c: sk.c, r: O.topR, w: wSkirt(y0 - 0.05, y1) });
}
// sacs, accessoires portés
function bagPiece(K, pr, O) {
  const J = pr.J, h = J.handL;
  if (O.bag === 'shopping') {
    const c = hash(O.top, 1, 9) < 0.5 ? 0xd8c8a8 : pick(seeded(O.top), 4, [0xc62828, 0xf5f5f5, 0x1e88e5, 0x212121]);
    K.add(loft(T7([[0, 0.012, 0.11, 0.11, 0, 6], [0.015, 0.06, 0.12, 0.12, 0, 8], [0.27, 0.06, 0.12, 0.12, 0, 8], [0.275, 0.055, 0.115, 0.115, 0, 8]]), 16), { m: M4(h[0] - 0.035, h[1] - 0.38, h[2] + 0.01), c, r: 0.85, b: B.handL });
    for (const z of [-0.035, 0.035]) K.add(sweep([[h[0] - 0.035, h[1] - 0.105, h[2] + z], [h[0] - 0.03, h[1] - 0.06, h[2] + z * 0.4], [h[0] - 0.035, h[1] - 0.105, h[2] - z * 0.2]], 0.003, 4, [1, 0, 0]), { c: mul(c, 0.7), r: 0.8, b: B.handL });
  }
  if (O.bag === 'delivery') {
    K.add(loft(T7([[0, 0.055, 0.2, 0.2, 0, 6], [0.4, 0.055, 0.2, 0.2, 0, 6]]), 16), { m: M4(h[0] - 0.06, h[1] - 0.5, h[2]), c: (x, y) => (y > h[1] - 0.14 ? 0x1a1a1a : 0xc62828), r: 0.6, b: B.handL });
    K.add(sweep([[h[0] - 0.05, h[1] - 0.1, h[2] - 0.05], [h[0] - 0.035, h[1] - 0.06, h[2]], [h[0] - 0.05, h[1] - 0.1, h[2] + 0.05]], 0.006, 5, [1, 0, 0]), { c: 0x111111, r: 0.6, b: B.handL });
  }
}
// objets tenus (os propR, repère « en visée » : +z vers l'avant)
function propPiece(K, pr, O) {
  const p = O.prop; if (!p) return;
  const J = pr.J.propR, m = M4(J[0], J[1], J[2], Math.PI / 2, 0, 0), b = B.propR;
  if (p === 'gun') {
    K.add(slab(0.028, 0.035, 0.17, 5), { m: m.clone().multiply(M4(0, 0.045, -0.04, 0, 0, 0)), c: 0x1a1a1c, r: 0.35, mt: 0.6, b });
    K.add(slab(0.026, 0.09, 0.035, 4), { m: m.clone().multiply(M4(0, -0.005, -0.055, -0.25, 0, 0)), c: 0x141414, r: 0.6, b });
  }
  if (p === 'torch') {
    K.add(sweep([[0, 0.0, -0.08], [0, 0.0, 0.07]], 0.016, 10, [1, 0, 0]), { m, c: 0x1c1c1c, r: 0.35, mt: 0.6, b });
    K.add(sweep([[0, 0.0, 0.07], [0, 0.0, 0.11]], [0.024, 0.024], 12, [1, 0, 0]), { m, c: 0x2a2a2a, r: 0.3, mt: 0.7, b });
    K.add(ell(0.02, 0.02, 0.004, 12, 5, 0, 0, 0.112), { m, c: 0xfff4d8, r: 0.1, e: 2.5, b });
  }
  if (p === 'nozzle') {
    K.add(sweep([[0, 0, -0.06], [0, 0, 0.12], [0, 0, 0.2]], [0.024, 0.026, 0.02], 10, [1, 0, 0]), { m, c: 0x9a9a9a, r: 0.3, mt: 0.9, b });
    K.add(sweep([[0, -0.03, -0.06], [0, -0.2, -0.16], [0.05, -0.55, -0.12]], 0.022, 8, [1, 0, 0]), { m, c: 0xb0281e, r: 0.6, b });
  }
}

// ───────────────────────── autres corps ─────────────────────────
// Bobby (costume d'ours de 1987) : tête ronde, oreilles, museau, nœud papillon, ventre clair, pattes, coutures, usure
function asmBear(K, pr, o) {
  const J = pr.J, fur = 0xb87a38, light = 0xe8c48e, dirty = (c, x, y, z) => mix(c, mul(c, 0.6), 0.45 * ss(0.55, 0.95, hash(Math.round(x * 40), Math.round(y * 40), Math.round(z * 40))));
  const furC = (x, y, z) => dirty(fur, x, y, z);
  K.add(loft(pr.torso, 24, null), { c: (x, y, z, nx, ny, nz) => (nz > 0.35 && Math.abs(x) < 0.15 && y > 0.95 && y < 1.36 && ((x / 0.15) ** 2 + ((y - 1.14) / 0.2) ** 2 < 1) ? dirty(light, x, y, z) : Math.abs(nx) > 0.97 ? mul(fur, 0.6) : furC(x, y, z)), r: 0.97, w: wTorso(pr) });
  K.add(loft(pr.neckR, 14, null, false, false), { c: furC, r: 0.97, w: wNeck(J) });
  // tête de mascotte (centre 5 cm au-dessus de l'os de la tête) : oreilles (dont une affaissée), yeux boutons, museau, truffe, bouche cousue
  const H = J.head, hm = M4(H[0], H[1] + 0.05, H[2] + 0.01), b = B.head;
  K.add(ball(24, 16, (x, y, z) => [x * 0.19, y * 0.172, z * 0.18]), { m: hm, c: (X, Y, Z) => furC(X, Y, Z), r: 0.97, b });
  for (const s of [-1, 1]) {
    const em = hm.clone().multiply(M4(s * 0.132, 0.148 - (s > 0 ? 0.02 : 0), -0.02, 0, 0, s * -0.42 - (s > 0 ? 0.3 : 0)));
    K.add(ell(0.07, 0.066, 0.028, 12, 8), { m: em, c: furC, r: 0.97, b });
    K.add(ell(0.042, 0.04, 0.012, 10, 6, 0, 0, 0.022), { m: em, c: light, r: 0.95, b });
    K.add(ell(0.031, 0.031, 0.017, 12, 8, s * 0.072, 0.045 - (s > 0 ? 0.008 : 0), 0.158), { m: hm, c: 0x0c0a0a, r: 0.1, b });
  }
  K.add(ell(0.092, 0.07, 0.078, 16, 10, 0, -0.052, 0.13), { m: hm, c: light, r: 0.95, b });
  K.add(ell(0.035, 0.025, 0.024, 12, 8, 0, -0.018, 0.204), { m: hm, c: 0x141010, r: 0.2, b });
  K.add(sweep([[-0.05, -0.068, 0.188], [-0.025, -0.084, 0.204], [0, -0.077, 0.21], [0.025, -0.084, 0.204], [0.05, -0.068, 0.188]], 0.0035, 5, [0, 1, 0]), { m: hm, c: 0x2a1a10, r: 0.8, b });
  K.add(sweep([[0, -0.04, 0.214], [0, -0.077, 0.211]], 0.003, 5, [1, 0, 0]), { m: hm, c: 0x2a1a10, r: 0.8, b });
  for (let i = 0; i < 5; i++) { const x = -0.04 + i * 0.02; K.add(sweep([[x, -0.074 - 0.004 * Math.cos(x * 30), 0.2], [x, -0.09 - 0.004 * Math.cos(x * 30), 0.196]], 0.0018, 4, [1, 0, 0]), { m: hm, c: 0x2a1a10, r: 0.8, b }); }
  // nœud papillon
  const nz = secAt(pr.torso, 1.46)[2] + 0.02;
  for (const s of [-1, 1]) K.add(loft(T7([[0, 0.01, 0.02, 0.02, 0, 2], [0.06, 0.03, 0.045, 0.045, 0, 2.5], [0.075, 0.012, 0.03, 0.03, 0, 2]]), 10), { m: M4(s * 0.008, 1.47, nz, 0, 0, s * -Math.PI / 2), c: 0xb71c1c, r: 0.6, w: wTorso(pr) });
  K.add(ell(0.018, 0.02, 0.016, 8, 6), { m: M4(0, 1.47, nz + 0.005), c: 0x8e1414, r: 0.6, w: wTorso(pr) });
  for (const s of [-1, 1]) {
    const A = SD(s), j = J['arm' + A];
    K.add(loft(limbT(armRings(pr)), 14), { m: M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), c: furC, r: 0.97, w: wArm(J, s) });
    const hm2 = handMatrix(pr, s);
    K.add(ell(0.03, 0.06, 0.05, 12, 8, 0.005, 0.05, 0), { m: hm2, c: furC, r: 0.97, b: B['hand' + A] });
    K.add(ell(0.012, 0.035, 0.032, 10, 6, 0.028, 0.05, 0), { m: hm2, c: 0x4a2c18, r: 0.8, b: B['hand' + A] });
    const l = J['leg' + A];
    K.add(loft(limbT(legRings(pr, false)), 16), { m: M4(l[0], l[1], l[2], 0, 0, 0, s, 1, 1), c: furC, r: 0.97, w: wLeg(J, s) });
    const f = J['foot' + A];
    K.add(ell(0.075, 0.06, 0.15, 14, 9, 0, -0.025, 0.05), { m: M4(f[0], f[1], f[2], 0, 0, 0, s, 1, 1), c: (x, y) => (y < 0.025 ? 0x4a2c18 : furC(x, y, 0)), r: 0.95, b: B['foot' + A] });
  }
  const fz = (x, y) => frontZ(secAt(pr.torso, y), x);
  K.add(sweep([[0.07, 1.4, fz(0.07, 1.4)], [0.105, 1.35, fz(0.105, 1.35)], [0.135, 1.3, fz(0.135, 1.3)]], [[0.011, 0.004], [0.015, 0.005], [0.009, 0.004]], 6, [0, 0, 1]), { c: 0x3a2412, r: 0.95, w: wTorso(pr) });
  for (let i = 0; i < 5; i++) { const x = 0.078 + i * 0.014, y = 1.39 - i * 0.022; K.add(ell(0.013, 0.011, 0.01, 7, 5), { m: M4(x, y, fz(x, y) + 0.004, i, i * 2, 0), c: 0xe8e2d0, r: 1, w: wTorso(pr) }); }
  return { eyePos: [0.072, 0.093, 0.19, 0.024] };
}
// mannequin de vitrine (1987) : plastique moulé en segments, rotules visibles, visage lisse, mains stylisées
function asmMannequin(K, pr, o) {
  const J = pr.J, pl = 0xe9e2d4, jt = 0xb9b0a0, scuff = (x, y, z) => mix(pl, 0xc8bca6, 0.5 * ss(0.8, 0.98, hash(Math.round(x * 30), Math.round(y * 30), Math.round(z * 30))));
  const T = pr.torso, rg = 0.32;
  K.add(loft(T.filter((q) => q[0] <= 1.06), 24, torsoDef(pr, {}), true, true), { c: scuff, r: rg, b: B.hips });
  K.add(loft(T7([[1.075, 0.128, 0.086, 0.088, 0.002, 2.3], ...T.filter((q) => q[0] > 1.07)]), 24, torsoDef(pr, {}), true, true), { c: scuff, r: rg, b: B.torso });
  K.add(band(T, 1.055, 1.08, -0.004, 24), { c: jt, r: 0.5, b: B.torso });
  K.add(loft(pr.neckR, 14, null, false, false), { c: scuff, r: rg, w: (x, y) => (y < J.neck[1] + 0.03 ? [[B.torso, 1]] : [[B.head, 1]]) });
  headPiece(K, pr, { skin: pl, hair: pl, eye: pl, brow: pl, lip: pl });
  for (const s of [-1, 1]) {
    const A = SD(s), j = J['arm' + A], R = limbT(armRings(pr)), m = M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), ye = J['elbow' + A][1];
    K.add(loft(T7(R.filter((q) => q[0] >= -pr.el + 0.025)), 14), { m, c: scuff, r: rg, b: B['arm' + A] });
    K.add(loft(T7(R.filter((q) => q[0] < -pr.el - 0.025)), 14), { m, c: scuff, r: rg, b: B['elbow' + A] });
    K.add(ell(0.034, 0.034, 0.034, 10, 8), { m: M4(j[0], ye, J['elbow' + A][2]), c: jt, r: 0.45, b: B['elbow' + A] });
    K.add(ell(0.05, 0.05, 0.05, 12, 9), { m: M4(j[0], j[1], j[2]), c: jt, r: 0.45, b: B['arm' + A] });
    const hm = handMatrix(pr, s);
    K.add(loft(T7([[-0.01, 0.014, 0.022, 0.022, 0, 2.4], [0.04, 0.013, 0.038, 0.038, 0, 3], [0.09, 0.011, 0.036, 0.036, 0, 3], [0.15, 0.008, 0.028, 0.028, 0.0, 2.6], [0.17, 0.004, 0.012, 0.012, 0, 2]]), 12, (v) => [v[0] + 0.012 * ss(0.08, 0.17, v[1]), v[1], v[2]]), { m: hm, c: scuff, r: rg, b: B['hand' + A] });
    K.add(sweep([[0.004, 0.006, 0.02], [0.014, 0.035, 0.036], [0.02, 0.06, 0.04]], [0.011, 0.009, 0.007], 7, [0, 0, 1]), { m: hm, c: scuff, r: rg, b: B['hand' + A] });
    const l = J['leg' + A], LR = limbT(legRings(pr, true)), lm = M4(l[0], l[1], l[2], 0, 0, 0, s, 1, 1);
    K.add(loft(T7(LR.filter((q) => q[0] >= -0.415)), 16), { m: lm, c: scuff, r: rg, b: B['leg' + A] });
    K.add(loft(T7(LR.filter((q) => q[0] < -0.445)), 16), { m: lm, c: scuff, r: rg, b: B['knee' + A] });
    K.add(ell(0.045, 0.045, 0.045, 10, 8), { m: M4(l[0], J['knee' + A][1], J['knee' + A][2]), c: jt, r: 0.45, b: B['knee' + A] });
    const f = J['foot' + A];
    K.add(loft(T7(SHOE.map((q) => [q[0] * 0.92, q[1] * 0.78, q[2] * 0.85, q[3] * 0.8, q[4] + 0.008, 2.4])), 14, null, true, [0, 0.19, 0.06]), { m: M4(f[0], f[1], f[2], 0, 0, 0, s, 1, 1).multiply(M4(0, 0, 0, Math.PI / 2, 0, 0)), c: scuff, r: rg, b: B['foot' + A] });
  }
}
// drap de fantôme (costume) : du sommet de la tête au sol, ourlet ondulé, trous des yeux
function asmGhost(K, pr, o) {
  const J = pr.J, H = J.head, c = 0xf2f2ee, hy = H[1];
  const prof = [[0.03, 0.34], [0.3, 0.31], [0.7, 0.275], [1.0, 0.265], [1.25, 0.272], [1.37, 0.282], [1.45, 0.215], [hy - 0.075, 0.12], [hy - 0.02, 0.112], [hy + 0.06, 0.124], [hy + 0.13, 0.104], [hy + 0.175, 0.06]];
  const g = loft(T7(prof.map(([y, w]) => [y, w, w * 0.78, w * 0.84, -0.012, 2.2])), 30, (v, r, t) => r === 0 ? [v[0] * (1 + 0.05 * Math.sin(t * 5)), v[1] + 0.035 * Math.sin(t * 7) + 0.02 * Math.sin(t * 3), v[2] * (1 + 0.05 * Math.sin(t * 5))] : [v[0] * (1 + 0.012 * Math.sin(t * 9 + v[1] * 6)), v[1], v[2]], false, [0, hy + 0.19, -0.012]);
  const hole = (x, y, z) => z > 0.05 && Math.abs(Math.abs(x) - 0.042) / 0.017 + Math.abs(y - (hy + 0.065)) / 0.022 < 1;
  K.add(twoSided(g), { c: (x, y, z) => (hole(x, y, z) ? 0x060606 : mix(c, 0xd8d6d0, 0.5 + 0.5 * Math.sin(x * 40 + y * 9))), r: 0.92, w: (x, y) => (y > 1.25 ? [[B.torso, 1 - ss(hy - 0.12, hy - 0.04, y)], [B.head, ss(hy - 0.12, hy - 0.04, y)]] : wSkirt(1.2, 0.2)(x, y)) });
  for (const s of [-1, 1]) {
    const A = SD(s), j = J['arm' + A];
    K.add(loft(limbT(armRings(pr).map(([t, a, b]) => [t, a * 1.25, b * 1.3])), 12), { m: M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), c, r: 0.92, w: wArm(J, s) });
    K.add(ell(0.036, 0.062, 0.046, 10, 8, 0, 0.03, 0), { m: handMatrix(pr, s), c, r: 0.92, b: B['hand' + A] });
  }
}
// combinaison d'astronaute : volumes gonflés, soufflets aux articulations, sac dorsal, casque à visière dorée
function asmAstronaut(K, pr, o) {
  const J = pr.J, w = 0xeceff1, g = 0x90a4ae, O = { skin: 0xd8b090, hat: 'helmet', hairStyle: 'none', hatCol: w };
  K.add(loft(pr.torso, 26, null), { c: (x, y, z, nx, ny, nz) => (nz > 0.6 && Math.abs(x) < 0.06 && y > 1.2 && y < 1.32 ? 0x546e7a : w), r: 0.7, w: wTorso(pr) });
  K.add(slab(0.12, 0.08, 0.025, 4), { m: M4(0, 1.26, frontZ(secAt(pr.torso, 1.26), 0) - 0.004), c: (x, y) => (x > 0.02 ? 0xd32f2f : x < -0.02 ? 0x1976d2 : 0x37474f), r: 0.4, w: wTorso(pr) });
  const q = secAt(pr.torso, 1.2);
  K.add(slab(0.34, 0.46, 0.15, 6), { m: M4(0, 1.2, q[4] - q[3] + 0.005, 0, Math.PI, 0), c: 0xdfe3e6, r: 0.6, w: wTorso(pr), nb: true });
  K.add(loft(pr.neckR, 14, null, false, false), { c: w, r: 0.7, w: wNeck(J) });
  hatPiece(K, pr, O);
  for (const s of [-1, 1]) {
    const A = SD(s), j = J['arm' + A], R = limbT(armRings(pr)), ye = J['elbow' + A][1] - j[1];
    K.add(loft(R, 14, (v) => { const k = 1 + 0.08 * Math.max(0, Math.sin((v[1] - ye) * 140)) * G(v[1] - ye, 0.04); return [v[0] * k, v[1], v[2] * k]; }), { m: M4(j[0], j[1], j[2], 0, 0, 0, s, 1, 1), c: (x, y) => (Math.abs(y - J['hand' + A][1] - 0.03) < 0.02 ? g : w), r: 0.7, w: wArm(J, s) });
    for (const p of handPieces(pr, 0.25, 1.25)) K.add(p, { m: handMatrix(pr, s), c: 0xe0e0e0, r: 0.65, b: B['hand' + A] });
    const l = J['leg' + A], LR = limbT(legRings(pr, false)), yk = J['knee' + A][1] - l[1];
    K.add(loft(LR, 16, (v) => { const k = 1 + 0.07 * Math.max(0, Math.sin((v[1] - yk) * 140)) * G(v[1] - yk, 0.045); return [v[0] * k, v[1], v[2] * k]; }), { m: M4(l[0], l[1], l[2], 0, 0, 0, s, 1, 1), c: w, r: 0.7, w: wLeg(J, s) });
    shoePiece(K, pr, { shoe: 'boot', shoeC: 0xd5d8da, sole: 0x455a64 }, s);
  }
}

// linceul de l'Ombre : capuche pointue (tête) et manteau en lambeaux des épaules aux tibias (double face)
function shroud(K, pr) {
  const T = pr.torso, J = pr.J, H = J.head, HT = pr.headT, c = 0x080808;
  const hood = loft(T7([-0.06, -0.02, 0.04, 0.1, 0.15, 0.19, 0.22].map((y, i) => { const q = secAt(HT, Math.min(0.17, y)), k = [1.25, 1.3, 1.28, 1.2, 1.05, 0.7, 0.2][i]; return [y, q[1] * k + 0.01, (q[2] + 0.02) * k, (q[3] + 0.03) * k, q[4] - 0.02 * i, 2.2]; })), 20, (v, r, t) => [v[0], v[1], v[2] - (Math.sin(t) > 0.55 && r > 0 && r < 5 ? 0.05 * (Math.sin(t) - 0.55) : 0)], false, [0, 0.24, -0.16]);
  K.add(twoSided(hood), { m: M4(H[0], H[1], H[2]), c, r: 1, b: B.head });
  const rows = [];
  for (let i = 0; i < 9; i++) { const v = i / 8, y = lerp(0.28, 1.47, v), q = secAt(T, Math.max(0.87, Math.min(1.45, y))), fl = (1 - v) * 0.12 + 0.03; rows.push([y, q[1] + fl + (y > 1.3 ? 0.05 : 0), q[2] + fl * 0.8, q[3] + fl, q[4], 2.3]); }
  const cl = loft(T7(rows), 28, (v, r, t) => r === 0 ? [v[0], v[1] + 0.09 * hash(Math.round(t * 9), 3, 1) - 0.02, v[2]] : v, false, false);
  K.add(twoSided(keepTris(cl, (x, y, z) => !(z > 0.02 && Math.abs(x) < 0.05 + (1.45 - y) * 0.08))), { c, r: 1, w: (x, y) => (y > 1.0 ? wTorso(pr)(x, y) : wSkirt(0.95, 0.3)(x, y)) });
}

// ───────────────────────── assemblage ─────────────────────────
function asmHuman(K, pr, o) {
  const O = dress(o, pr);
  torsoPiece(K, pr, O); neckPiece(K, pr, O); headPiece(K, pr, O); hairPiece(K, pr, O); hatPiece(K, pr, O); topDetails(K, pr, O); skirtPiece(K, pr, O); bagPiece(K, pr, O); propPiece(K, pr, O);
  if (pr.kind === 'shadow') shroud(K, pr);
  for (const s of [-1, 1]) {
    armPiece(K, pr, O, s); legPiece(K, pr, O, s);
    if (pr.gaunt) { // mains et pieds décharnés, griffes
      const m = handMatrix(pr, s);
      const jh = pr.J['hand' + SD(s)];
      for (const p of handPieces(pr, 0.3, 0.85)) K.add(p, { m: m.clone().multiply(M4(0, 0, 0, 0, 0, 0, 1, 1.35, 1)), c: (x, y, z) => (Math.hypot(x - jh[0], y - jh[1], z - jh[2]) > 0.19 * pr.hd ? 0x1a1410 : O.skin), r: 0.5, b: B['hand' + SD(s)] });
      const f = pr.J['foot' + SD(s)];
      K.add(loft(T7(SHOE.map((q) => [q[0] * 1.15, q[1] * 0.62, q[2] * 0.7, q[3] * 0.5, q[4] + 0.012, 2.2])), 12, null, true, [0, 0.235, 0.06]), { m: M4(f[0], f[1], f[2], 0, 0, 0, s, 1, 1).multiply(M4(0, 0, 0, Math.PI / 2, 0, 0)), c: O.skin, r: 0.5, b: B['foot' + SD(s)] });
    } else { handPiece(K, pr, O, s); if (O.shoe !== 'none') shoePiece(K, pr, O, s); }
  }
  return O;
}
const ASM = { bear: asmBear, mannequin: asmMannequin, ghost: asmGhost, astronaut: asmAstronaut };
let _mat = null;
const humanMat = () => _mat || (_mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, envMap: ENV.map, envMapIntensity: 1 }));
// objet tenu affiché selon la pose : l'arme (lâchée mains en l'air ou à terre), la lampe allumée, la lance en action
const PROP_POSES = { gun: (p) => p !== 'cheer' && p !== 'dead' && p !== 'tpose' && p !== 'crawl' && p !== 'sit', torch: (p) => p === 'flashlight', nozzle: (p) => p === 'aim' };

// opts : {shirt, pants, skin, hair, shoes, hat ('cap' | 'police' | 'helmet' | 'balaclava' | 'firehelmet'), hatColor,
//   kind ('human' | 'mannequin' | 'bear' | 'firefighter' | 'police' | 'ghost' | 'astronaut' | 'crawler' | 'shadow'), height,
//   female, child, seed, outfit ('guard' | 'casual' | 'shop' | 'polo' | 'dress' | 'robber' | 'catsuit' | 'clown'…),
//   hairStyle, mustache, beard, glasses, belly, age, bag ('shopping' | 'backpack' | 'delivery'), prop ('gun' | 'torch' |
//   'nozzle'), shop, badge, sleeves, glowEyes}
export function buildHumanoid(opts = {}) {
  const kind = opts.kind || 'human';
  const H = opts.height || 1.78, k = H / 1.78;
  const root = new THREE.Group(); root.name = 'humanoid';
  const body = new THREE.Group(); root.add(body); body.scale.setScalar(k);
  const pr = profile(opts, kind), bones = makeBones(pr.J), K = new Kit();
  body.add(bones.hips);
  const O = (ASM[kind] || asmHuman)(K, pr, opts) || {};
  const mesh = new THREE.SkinnedMesh(K.geometry(), humanMat());
  mesh.name = 'body'; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.4);
  body.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(BN.map((n) => bones[n])), mesh.matrixWorld);
  const parts = { ...bones };
  if (kind === 'mannequin') { // socle (costume ; masqué pour la présence)
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.35, metalness: 0.6 }));
    st.position.y = 0.015; st.receiveShadow = true; root.add(st); parts.stand = st;
  }
  root.userData.parts = parts; root.userData.kind = kind;
  root.userData.anim = { phase: 0, speed: 0 };
  root.userData.propPoses = O.prop ? PROP_POSES[O.prop] : undefined; root.userData.prop = O.prop || null;
  root.userData.back = -K.zb; root.userData.backW = -K.zb * k; // couché sur le dos : dos, fessiers et crâne posés au sol
  root.userData.eyePos = O.eyePos || (pr.c ? [0.031 * pr.hs, 0.058 * pr.hs, 0.0735 * pr.hs, 0.0142 * pr.hs] : [0.032 * pr.hs, 0.0635 * pr.hs, (0.0735 - (pr.gaunt ? 0.005 : 0)) * pr.hs, 0.0118 * pr.hs]); // yeux (repère de la tête) : x, y, z, rayon
  if (!O.prop) bones.propR.scale.setScalar(0.001);
  return root;
}

// Animation de marche / pose. speed en m/s. pose : 'idle' | 'walk' | 'run' | 'crouch' | 'sit' | 'reach' | 'aim' | 'tpose' |
// 'dead' | 'crawl' | 'cheer' | 'hunched' | 'flashlight' | poses de mannequin 0..4 (nombre). Le bassin se cale sur le
// pied d'appui (plus de pieds qui flottent), les pieds restent à plat, le buste contre-tourne le bassin.
const L1 = 0.43, L2 = 0.42, LF = 0.08;
export function animateHumanoid(h, dt, speed, pose = 'auto', extra = {}) {
  const P = h.userData.parts, A = h.userData.anim;
  const moving = speed > 0.15;
  A.phase += dt * (moving ? 2.2 + speed * 1.6 : 1.2);
  const s = Math.sin(A.phase * 2);
  const amp = moving ? Math.min(1, speed / 3) : 0;
  h.rotation.x = 0;
  for (const n of ['hips', 'torso', 'neck', 'head', 'handL', 'handR', 'footL', 'footR', 'legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR']) P[n].rotation.set(0, 0, 0);
  P.hips.position.z = 0;
  const pp = h.userData.propPoses;
  if (pp) P.propR.scale.setScalar(pp(pose) ? 1 : 0.001);
  if (typeof pose === 'number') { mannequinPose(P, pose); return; }
  const crouch = pose === 'crouch' || pose === 'crawl';
  P.legL.rotation.x = s * 0.7 * amp + (crouch ? -1.2 : 0); P.legR.rotation.x = -s * 0.7 * amp + (crouch ? -1.2 : 0);
  P.kneeL.rotation.x = Math.max(0, -s) * 0.9 * amp + (crouch ? 1.9 : 0.04); P.kneeR.rotation.x = Math.max(0, s) * 0.9 * amp + (crouch ? 1.9 : 0.04);
  // bassin à la hauteur de la jambe d'appui (la plus longue verticalement)
  const reach = (a, b) => L1 * Math.cos(a) + 0.005 * Math.sin(a) + L2 * Math.cos(a + b) - 0.01 * Math.sin(a + b) + LF; // os de la cuisse et du tibia (légèrement inclinés au repos)
  P.hips.position.y = Math.max(reach(P.legL.rotation.x, P.kneeL.rotation.x), reach(P.legR.rotation.x, P.kneeR.rotation.x)) + 0.02 + (moving ? 0 : Math.sin(A.phase) * 0.003);
  P.armL.rotation.x = -s * 0.6 * amp; P.armR.rotation.x = s * 0.6 * amp;
  P.elbowL.rotation.x = -0.25 - amp * 0.3 - Math.max(0, -s) * 0.2 * amp; P.elbowR.rotation.x = -0.25 - amp * 0.3 - Math.max(0, s) * 0.2 * amp;
  P.armL.rotation.z = -0.07 - amp * 0.03; P.armR.rotation.z = 0.07 + amp * 0.03;
  P.torso.rotation.x = crouch ? 0.35 : (pose === 'run' ? 0.15 : 0.02) + (moving ? 0 : Math.sin(A.phase * 0.7) * 0.006);
  P.hips.rotation.y = -s * 0.07 * amp; P.torso.rotation.y = s * 0.13 * amp;
  P.head.rotation.x = extra.pitch ? -extra.pitch * 0.6 : 0; P.head.rotation.y = -s * 0.06 * amp;
  P.handL.rotation.x = P.handR.rotation.x = -0.1;
  if (pose === 'sit') { P.hips.position.y = 0.5; P.legL.rotation.x = P.legR.rotation.x = -1.5; P.kneeL.rotation.x = P.kneeR.rotation.x = 1.95; P.legL.rotation.z = -0.06; P.legR.rotation.z = 0.06; P.armL.rotation.x = P.armR.rotation.x = -0.3; P.elbowL.rotation.x = P.elbowR.rotation.x = -0.7; P.torso.rotation.x = -0.04; }
  if (pose === 'reach' || extra.holding) { P.armR.rotation.x = -1.1; P.elbowR.rotation.x = -0.4; }
  if (pose === 'aim') { P.armR.rotation.x = -1.5; P.armL.rotation.x = -1.4; P.armL.rotation.z = 0.34; P.armR.rotation.z = -0.08; P.elbowR.rotation.x = 0; P.elbowL.rotation.x = -0.2; P.handR.rotation.x = 0; P.torso.rotation.y = 0.12; P.head.rotation.y = -0.1; }
  if (pose === 'flashlight') { P.armR.rotation.x = -1.42 - (extra.pitch || 0); P.armR.rotation.z = -0.12; P.elbowR.rotation.x = -0.1; P.handR.rotation.x = 0; }
  if (pose === 'tpose') { P.armL.rotation.z = -1.5; P.armR.rotation.z = 1.5; P.armL.rotation.x = P.armR.rotation.x = 0; P.elbowL.rotation.x = P.elbowR.rotation.x = 0; }
  if (P.stand) P.stand.rotation.x = pose === 'dead' ? Math.PI / 2 : 0; // mannequin tombé : le socle reste à plat
  if (pose === 'dead') { h.rotation.x = -Math.PI / 2; P.hips.position.y = 0.15; P.hips.position.z = h.userData.back ?? 0.11; P.armL.rotation.set(0.15, 0, -0.55); P.armR.rotation.set(-0.1, 0, 0.4); P.elbowL.rotation.x = -0.4; P.elbowR.rotation.x = -0.15; P.legL.rotation.set(0, 0, -0.08); P.legR.rotation.set(-0.12, 0, 0.1); P.kneeL.rotation.x = 0.05; P.kneeR.rotation.x = 0.25; P.head.rotation.set(0, 0.45, 0.1); P.torso.rotation.set(0, 0, 0); P.hips.rotation.set(0, 0, 0); }
  if (pose === 'crawl') { // à quatre pattes : genoux au sol ; chaque main se pose à plat (bras résolu de l'épaule au poignet)
    const m = moving ? 1 : 0.25, tp = 1.3, c = Math.cos(A.phase * 2);
    P.torso.rotation.set(tp, 0, 0); P.hips.rotation.set(0, 0, 0); P.hips.position.y = 0.38;
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
// libère la géométrie, les matériaux et le squelette propres à un personnage ou une présence retirés de la scène
export function disposeHumanoid(h) { h.traverse((o) => { if (!o.isMesh) return; o.geometry.dispose(); if (o.material !== _mat) o.material.dispose(); if (o.isSkinnedMesh) o.skeleton.dispose(); }); }

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
    if (!m) { m = o.material.clone(); patchZone(m, u); if (o.geometry.attributes.rme) perVertexPBR(m); cache.set(o.material, m); }
    o.material = m;
  });
  root.userData.zoneU = u;
  return u;
}

// ───────────────────────── bras à la première personne ─────────────────────────
// Repère de la main canonique (poignet à l'origine) ; m : placement (la main droite est le miroir de la gauche) ;
// l'avant-bras part du poignet vers fa (repère canonique). o : {m, grip, skin, glove, fat, sleeve, cuff ('shirt' | 'rib' |
// 'ring' | 'ruff' | 'none'), band (bande réfléchissante), watch, fur, plastic}
export function buildFPArm(o) {
  const K = new Kit(), m = o.m, fat = o.fat || 1, skin = o.skin ?? 0xd8a888, hc = o.glove ?? skin, hr = o.glove ? 0.7 : o.plastic ? 0.32 : 0.52;
  const hp = handPieces({ hd: 1 }, o.grip ?? 0.8, fat, true);
  for (const p of hp) K.add(p, { m, c: o.fur ? (x, y, z) => mix(hc, mul(hc, 0.7), hash(Math.round(x * 300), Math.round(y * 300), Math.round(z * 300))) : hc, r: o.fur ? 0.95 : hr, b: 0 });
  if (!o.glove && !o.plastic && !o.fur) for (const [c, d, bk, w] of hp.nails) { // ongles
    const X = nrm(cross(bk, d)), nm = new THREE.Matrix4().makeBasis(new THREE.Vector3(...X), new THREE.Vector3(...bk), new THREE.Vector3(...d)).setPosition(...c);
    K.add(ell(w, w * 0.32, w * 1.25, 8, 6), { m: m.clone().multiply(nm), c: mix(skin, 0xf2d8d0, 0.55), r: 0.3, b: 0 });
  }
  // avant-bras : poignet nu puis manchette et manche (plis), le long de fa
  const fa = nrm(o.fa || [0.1, -1, -0.5]), ax = nrm(cross(fa, [0, 0, 1])), az = cross(ax, fa);
  const fm = m.clone().multiply(new THREE.Matrix4().makeBasis(new THREE.Vector3(...ax), new THREE.Vector3(...fa.map((v) => -v)), new THREE.Vector3(...az.map((v) => -v)))); // +x local : dos de la main
  const k = fat, sl = o.sleeve ?? 0x2b3a55, cuffY = -0.055;
  const arm = T7([[-0.42, 0.05 * k, 0.052 * k], [-0.3, 0.046 * k, 0.049 * k], [-0.2, 0.04 * k, 0.044 * k], [-0.12, 0.034 * k, 0.038 * k], [-0.06, 0.028 * k, 0.033 * k], [-0.02, 0.024 * k, 0.03 * k], [0.008, 0.022 * k, 0.028 * k]]);
  if (o.cuff !== 'none') {
    const sleeve = T7([[-0.43, 0.058 * k, 0.06 * k], [-0.32, 0.055 * k, 0.058 * k], [-0.2, 0.05 * k, 0.053 * k], [-0.1, 0.045 * k, 0.048 * k], [cuffY - 0.006, 0.041 * k, 0.045 * k]]);
    K.add(loft(sleeve, 18, (v, r, t) => { const f = 1 + 0.035 * Math.sin(t * 3 + v[1] * 40) * ss(-0.06, -0.2, v[1]); return [v[0] * f, v[1], v[2] * f]; }, true, false), { m: fm, c: (x, y, z) => mix(sl, mul(sl, 0.82), 0.5 + 0.5 * Math.sin(x * 140 + y * 60)), r: o.fur ? 0.95 : 0.82, b: 0 });
    const cy0 = cuffY - 0.04, cy1 = cuffY;
    if (o.cuff === 'ruff') for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; K.add(ell(0.02, 0.008, 0.014, 6, 4), { m: fm.clone().multiply(M4(Math.cos(a) * 0.04, cy1, Math.sin(a) * 0.044, 0, -a, 0.5)), c: 0xf6f6f6, r: 0.8, b: 0 }); }
    else {
      K.add(band(sleeve.concat([[cy1 + 0.002, 0.041 * k, 0.045 * k, 0.045 * k, 0, 2, 0]]), cy0, cy1, o.cuff === 'ring' ? 0.007 : 0.0035, 18), { m: fm, c: o.cuff === 'ring' ? 0x90a4ae : o.cuff === 'rib' ? mul(sl, 0.88) : sl, r: o.cuff === 'ring' ? 0.35 : 0.8, mt: o.cuff === 'ring' ? 0.6 : 0, b: 0 });
      if (o.cuff === 'shirt') K.add(ell(0.0055, 0.0055, 0.0024, 8, 5), { m: fm.clone().multiply(M4(0.044 * k, cuffY - 0.02, 0.012, 0, Math.PI / 2, 0)), c: mul(sl, 0.6), r: 0.35, b: 0 });
    }
    if (o.band) K.add(band(sleeve, -0.2, -0.17, 0.003, 18), { m: fm, c: 0xd8cf2a, r: 0.35, e: 0.12, b: 0 });
  }
  K.add(loft(arm, 16, null, true, false), { m: fm, c: o.glove ? hc : o.fur ? sl : skin, r: o.plastic ? 0.32 : 0.55, b: 0 });
  if (o.watch) { // montre : bracelet, boîtier, verre
    K.add(band(arm, -0.045, -0.03, 0.004, 16), { m: fm, c: 0x1c1c1c, r: 0.5, b: 0 });
    K.add(sweep([[0.0225, -0.0375, 0], [0.0305, -0.0375, 0]], 0.0145, 14, [0, 1, 0]), { m: fm, c: 0x9a9a98, r: 0.22, mt: 0.95, b: 0 });
    K.add(sweep([[0.0306, -0.0375, 0], [0.0312, -0.0375, 0]], 0.0122, 14, [0, 1, 0], true, [0.0314, -0.0375, 0]), { m: fm, c: 0x10161a, r: 0.05, b: 0 });
  }
  return K.geometry();
}
// matériau éclairé comme le décor (uniform de zone fourni), rugosité / métal / émission par sommet
export function litMaterial(u) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, envMap: ENV.map });
  patchZone(m, u); perVertexPBR(m); return m;
}

// ───────────────────────── outils partagés avec les présences (chat, rats, la Chose, ballon) ─────────────────────────
// rig(J, par) : os placés aux positions J (pose de liaison), par : parent de chaque os ; skinned : un SkinnedMesh unique
// (matériau commun, couleurs / rugosité / émission par sommet) lié à ces os, ajouté sous parent.
export function rig(J, par) {
  const b = {};
  for (const n in J) { b[n] = new THREE.Bone(); b[n].name = n; }
  for (const n in J) { const p = par[n], q = J[n], o = p ? J[p] : [0, 0, 0]; b[n].position.set(q[0] - o[0], q[1] - o[1], q[2] - o[2]); if (p) b[p].add(b[n]); }
  return b;
}
export function skinned(K, parent, bones, rootBone, sphere) {
  parent.add(rootBone);
  const mesh = new THREE.SkinnedMesh(K.geometry(), humanMat());
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.boundingSphere = sphere;
  parent.add(mesh); parent.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones), mesh.matrixWorld);
  return mesh;
}
export const MK = { Kit, surf, loft, T7, ell, ball, sweep, slab, twoSided, keepTris, M4, mix, mul, hash, G, ss, lerp, nrm, sub };
