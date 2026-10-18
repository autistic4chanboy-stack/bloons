// Kit de mobilier modélisé : géométrie des agencements de magasin (gondoles, rayonnages muraux, comptoirs, tables,
// sièges, portants, cabines, vitrines…). Chaque pièce est décrite en coordonnées d'objet (x : largeur, y : hauteur,
// z : profondeur, face avant vers +z), placée par un repère (position + rotation autour de Y) et versée dans les lots
// (zone, matériau) de l'Arch : un meuble détaillé coûte des sommets, jamais d'appel de dessin supplémentaire.
// Matériaux propres au kit (bibliothèque de matériaux, couleurs par sommet, textures neutres teintées par la couleur) :
// furniture_wood (fil du bois verni), furniture_fabric (tissage d'ameublement), furniture_perf (tôle perforée : fonds
// de gondole, panneaux perforés, crémaillères des montants quand les trous sont étirés).
import * as THREE from 'three';
import { ENV } from '../engine/materials.js';

// ───────────────────────── textures neutres (teintées par la couleur des sommets) ─────────────────────────
// Bruit de valeur périodique (grille px × py, lissée) : les textures se répètent sans couture.
function pnoise(size, px, py, seed) {
  let s = seed * 9301 + 49297; const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const L = new Float32Array(px * py); for (let i = 0; i < L.length; i++) L[i] = R();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = y / size * py, iy = fy | 0, ty = fy - iy, sy = ty * ty * (3 - 2 * ty), y0 = (iy % py) * px, y1 = ((iy + 1) % py) * px;
    for (let x = 0; x < size; x++) {
      const fx = x / size * px, ix = fx | 0, tx = fx - ix, sx = tx * tx * (3 - 2 * tx), x0 = ix % px, x1 = (ix + 1) % px;
      const a = L[y0 + x0] + (L[y0 + x1] - L[y0 + x0]) * sx, b = L[y1 + x0] + (L[y1 + x1] - L[y1 + x0]) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  }
  return out;
}
// couleur (0..1, gris neutre) + hauteur → map sRGB et normalMap
function texPair(size, col, hgt, relief) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), im = x.createImageData(size, size);
  const n = document.createElement('canvas'); n.width = n.height = size; const xn = n.getContext('2d'), nm = xn.createImageData(size, size);
  const m = size - 1;
  for (let y = 0; y < size; y++) for (let i = 0; i < size; i++) {
    const k = y * size + i, j = k * 4, v = Math.max(0, Math.min(255, col[k] * 255));
    im.data[j] = v; im.data[j + 1] = v; im.data[j + 2] = v; im.data[j + 3] = 255;
    const dx = (hgt[y * size + ((i - 1) & m)] - hgt[y * size + ((i + 1) & m)]) * relief, dy = (hgt[((y + 1) & m) * size + i] - hgt[((y - 1) & m) * size + i]) * relief;
    const il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
    nm.data[j] = (dx * il * 0.5 + 0.5) * 255; nm.data[j + 1] = (dy * il * 0.5 + 0.5) * 255; nm.data[j + 2] = (il * 0.5 + 0.5) * 255; nm.data[j + 3] = 255;
  }
  x.putImageData(im, 0, 0); xn.putImageData(nm, 0, 0);
  const map = new THREE.CanvasTexture(c), nrm = new THREE.CanvasTexture(n);
  for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  map.colorSpace = THREE.SRGBColorSpace;
  const R = ENV.renderer; if (R) { R.initTexture(map); R.initTexture(nrm); }
  return { map, nrm };
}
// Fil du bois (le long de u) : cernes ondulés, pores, fibres fines ; moyenne ≈ 0,86 (la couleur des sommets donne l'essence)
function woodTex() {
  const S = 512, col = new Float32Array(S * S), h = new Float32Array(S * S);
  const wav = pnoise(S, 3, 2, 11), rng = pnoise(S, 2, 24, 23), fib = pnoise(S, 64, 180, 37), pore = pnoise(S, 128, 256, 41);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x;
    const ring = (y / S) * 9 + wav[k] * 2.2 + rng[k] * 1.4, f = ring - Math.floor(ring);
    const late = Math.pow(Math.max(0, Math.sin(f * Math.PI)), 6);              // bois d'été (cerne sombre)
    const fibre = (fib[k] - 0.5) * 0.12, p = pore[k] > 0.86 ? -0.1 : 0;
    col[k] = 0.95 - late * 0.2 + fibre + p - rng[k] * 0.06;
    h[k] = 0.5 - late * 0.5 + fibre * 2 + p * 3;
  }
  return texPair(S, col, h, 1.2);
}
// Tissage d'ameublement (toile serrée, chiné) ; moyenne ≈ 0,8
function fabricTex() {
  const S = 256, col = new Float32Array(S * S), h = new Float32Array(S * S), nz = pnoise(S, 64, 64, 5), sl = pnoise(S, 8, 96, 9);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x, cx = x % 4, cy = y % 4, over = ((x >> 2) + (y >> 2)) & 1;
    const th = over ? Math.sin((cy + 0.5) / 4 * Math.PI) : Math.sin((cx + 0.5) / 4 * Math.PI);
    col[k] = 0.68 + th * 0.18 + (nz[k] - 0.5) * 0.1 + (sl[k] - 0.5) * 0.08;
    h[k] = th * 0.8 + nz[k] * 0.2;
  }
  return texPair(S, col, h, 1.6);
}
// Tôle perforée : trous ronds Ø 6 mm au pas de 25 mm (tuile de 0,4 m : 16 × 16 trous)
function perfTex() {
  const S = 512, col = new Float32Array(S * S), h = new Float32Array(S * S), nz = pnoise(S, 32, 32, 3), st = S / 16;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x, dx = (x % st) - st / 2 + 0.5, dy = (y % st) - st / 2 + 0.5, d = Math.sqrt(dx * dx + dy * dy);
    const hole = d < 3.6 ? 1 : d < 4.8 ? (4.8 - d) / 1.2 : 0;
    col[k] = 0.93 - hole * 0.8 + (nz[k] - 0.5) * 0.04;
    h[k] = 1 - hole;
  }
  return texPair(S, col, h, 2.2);
}
const KIT_TEX = {};
// Matériaux du kit (appelé par le crochet de la bibliothèque, voir interiors.js) ; null si le nom n'en est pas un
export function furnMaterial(name) {
  const mk = (key, gen, o) => {
    const t = KIT_TEX[key] || (KIT_TEX[key] = gen());
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: t.map, normalMap: t.nrm, roughness: o.rough, metalness: o.metal ?? 0, envMap: ENV.map, envMapIntensity: o.env ?? 0.7 });
    m.normalScale.set(o.ns ?? 1, o.ns ?? 1); m.userData.texRepeat = 1 / o.tile;
    return m;
  };
  if (name === 'furniture_wood') return mk('wood', woodTex, { rough: 0.5, tile: 1.2, ns: 0.6, env: 0.8 });
  if (name === 'furniture_fabric') return mk('fabric', fabricTex, { rough: 0.95, tile: 0.16, ns: 0.9, env: 0.25 });
  if (name === 'furniture_perf') return mk('perf', perfTex, { rough: 0.42, tile: 0.4, ns: 0.8, env: 0.9 });
  return null;
}

// ───────────────────────── accumulateur de sommets (coordonnées d'objet) ─────────────────────────
// Les triangles sont orientés d'après les normales voulues (ordre corrigé si besoin) : les générateurs n'ont pas à
// se soucier du sens de parcours.
class Acc {
  constructor() { this.p = []; this.n = []; this.i = []; this.uv = null; }
  v(x, y, z, nx, ny, nz) { this.p.push(x, y, z); this.n.push(nx, ny, nz); return this.p.length / 3 - 1; }
  t(a, b, c) {
    const P = this.p, N = this.n, a3 = a * 3, b3 = b * 3, c3 = c * 3;
    const ux = P[b3] - P[a3], uy = P[b3 + 1] - P[a3 + 1], uz = P[b3 + 2] - P[a3 + 2], vx = P[c3] - P[a3], vy = P[c3 + 1] - P[a3 + 1], vz = P[c3 + 2] - P[a3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const ox = N[a3] + N[b3] + N[c3], oy = N[a3 + 1] + N[b3 + 1] + N[c3 + 1], oz = N[a3 + 2] + N[b3 + 2] + N[c3 + 2];
    if (cx * ox + cy * oy + cz * oz < 0) this.i.push(a, c, b); else this.i.push(a, b, c);
  }
  q(a, b, c, d) { this.t(a, b, c); this.t(a, c, d); }
}
// polygone fermé à arêtes vives (chaque sommet doublé, retour au premier) pour extrudeX
export function hard(pts) { const o = []; pts.forEach((q, i) => { o.push(q); if (i > 0) o.push(q); }); o.push(pts[0]); return o; }
// profil 2D → normales (extérieur à droite du parcours ; points doublés = arête vive)
function profNormals(pr) {
  const n = pr.length, out = [];
  const seg = (i) => { const a = pr[i], b = pr[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; };
  for (let i = 0; i < n; i++) {
    const dupP = i > 0 && pr[i][0] === pr[i - 1][0] && pr[i][1] === pr[i - 1][1], dupN = i < n - 1 && pr[i][0] === pr[i + 1][0] && pr[i][1] === pr[i + 1][1];
    let nn;
    if (i === 0 || dupP) nn = i < n - 1 ? seg(dupN ? i + 1 : i) : seg(i - 1);
    else if (i === n - 1 || dupN) nn = seg(i - 1);
    else { const s0 = seg(i - 1), s1 = seg(i), x = s0[0] + s1[0], y = s0[1] + s1[1], l = Math.hypot(x, y) || 1; nn = [x / l, y / l]; }
    if (dupP && i < n - 1) nn = seg(i);
    out.push(nn);
  }
  return out;
}

const _M = new THREE.Matrix4(), _R = new THREE.Matrix4(), _c = new THREE.Color();
// ───────────────────────── stylo : repère courant + émission dans les lots de l'Arch ─────────────────────────
export class Pen {
  constructor(A, zone) { this.A = A; this.zone = zone; this.M = new THREE.Matrix4(); this.N = new THREE.Matrix3(); this.stack = []; this.uo = 0; this.vg = false; }
  // repère d'objet : origine monde + rotation autour de Y (la face avant +z regarde vers (sin ry, 0, cos ry))
  at(x, y, z, ry = 0) { this.M.makeRotationY(ry).setPosition(x, y, z); this.N.getNormalMatrix(this.M); this.uo = (x * 0.37 + z * 0.61) % 1; this.stack.length = 0; return this; }
  // sous-repère relatif (empilé : translation, rotation Y puis inclinaison X) ; pop() revient au précédent
  push(dx, dy, dz, ry = 0, rx = 0) {
    this.stack.push(this.M.clone()); _R.makeRotationY(ry).setPosition(dx, dy, dz); this.M.multiply(_R);
    if (rx) this.M.multiply(_M.makeRotationX(rx));
    this.N.getNormalMatrix(this.M); return this;
  }
  pop() { this.M.copy(this.stack.pop()); this.N.getNormalMatrix(this.M); return this; }
  // point d'objet → monde
  world(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.M); }
  emit(mat, acc, color) {
    const b = this.A.B(this.zone, mat), base = b.vertexCount, M = this.M.elements, N = this.N.elements, S = b.uvScale, uo = this.uo, vg = this.vg;
    let col = null; if (b.colors) { _c.set(color); col = [_c.r, _c.g, _c.b]; }
    const P = acc.p, Nn = acc.n, UV = acc.uv;
    for (let i = 0, n = P.length / 3; i < n; i++) {
      const i3 = i * 3, x = P[i3], y = P[i3 + 1], z = P[i3 + 2], nx = Nn[i3], ny = Nn[i3 + 1], nz = Nn[i3 + 2];
      const wx = M[0] * x + M[4] * y + M[8] * z + M[12], wy = M[1] * x + M[5] * y + M[9] * z + M[13], wz = M[2] * x + M[6] * y + M[10] * z + M[14];
      let tx = N[0] * nx + N[3] * ny + N[6] * nz, ty = N[1] * nx + N[4] * ny + N[7] * nz, tz = N[2] * nx + N[5] * ny + N[8] * nz;
      const il = 1 / (Math.sqrt(tx * tx + ty * ty + tz * tz) || 1); tx *= il; ty *= il; tz *= il;
      let u, v;
      if (UV) { u = UV[i * 2]; v = UV[i * 2 + 1]; }
      else { // projection sur l'axe dominant de la normale (repère d'objet : le fil suit la largeur du meuble)
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = vg ? y : z; v = vg ? z : y; } else { u = vg ? y : x; v = vg ? x : y; }
        u = (u + uo) * S; v *= S;
      }
      b._pushVert(wx, wy, wz, tx, ty, tz, u, v, col);
    }
    const I = acc.i; for (let k = 0; k < I.length; k++) b.idx.push(base + I[k]);
    return this;
  }

  // ── primitives (coordonnées d'objet) ──
  // boîte ; f : faces visibles parmi 'xXyYzZ' (minuscule = côté négatif)
  box(mat, x0, y0, z0, x1, y1, z1, color, f = 'xXyYzZ') {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
    const a = new Acc();
    const F = (nx, ny, nz, p) => { const k = a.v(...p[0], nx, ny, nz); a.v(...p[1], nx, ny, nz); a.v(...p[2], nx, ny, nz); a.v(...p[3], nx, ny, nz); a.q(k, k + 1, k + 2, k + 3); };
    if (f.includes('X')) F(1, 0, 0, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
    if (f.includes('x')) F(-1, 0, 0, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
    if (f.includes('Y')) F(0, 1, 0, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]);
    if (f.includes('y')) F(0, -1, 0, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
    if (f.includes('Z')) F(0, 0, 1, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
    if (f.includes('z')) F(0, 0, -1, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]);
    return this.emit(mat, a, color);
  }
  // boîte à arêtes adoucies (chanfrein de rayon r, normales interpolées : l'arête accroche la lumière comme un
  // arrondi) ; les arêtes qui touchent une face masquée restent vives (la boîte reste fermée)
  rbox(mat, x0, y0, z0, x1, y1, z1, r, color, f = 'xXyYzZ') {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    r = Math.min(r, (x1 - x0) * 0.49, (y1 - y0) * 0.49, (z1 - z0) * 0.49);
    if (r < 0.0008) return this.box(mat, x0, y0, z0, x1, y1, z1, color, f);
    const vis = [[f.includes('x'), f.includes('X')], [f.includes('y'), f.includes('Y')], [f.includes('z'), f.includes('Z')]];
    const ins = (ax, s) => (vis[ax][s] ? r : 0), P = (ax, s) => (s ? hi[ax] : lo[ax]), I = (ax, s) => (s ? hi[ax] - r : lo[ax] + r);
    const a = new Acc();
    const vtx = (c, ax, s) => { const n = [0, 0, 0]; n[ax] = s ? 1 : -1; return a.v(c[0], c[1], c[2], n[0], n[1], n[2]); };
    for (let ax = 0; ax < 3; ax++) for (let s = 0; s < 2; s++) { // faces principales
      if (!vis[ax][s]) continue;
      const b = (ax + 1) % 3, c = (ax + 2) % 3, ks = [];
      for (const [sb, sc] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const p = [0, 0, 0]; p[ax] = P(ax, s); p[b] = sb ? hi[b] - ins(b, 1) : lo[b] + ins(b, 0); p[c] = sc ? hi[c] - ins(c, 1) : lo[c] + ins(c, 0); ks.push(vtx(p, ax, s)); }
      a.q(...ks);
    }
    for (let ax = 0; ax < 3; ax++) for (let bx = ax + 1; bx < 3; bx++) { // bandes d'arêtes
      const c = 3 - ax - bx;
      for (let sa = 0; sa < 2; sa++) for (let sb = 0; sb < 2; sb++) {
        if (!vis[ax][sa] || !vis[bx][sb]) continue;
        const ks = [];
        for (const sc of [0, 1]) {
          const cc = sc ? hi[c] - ins(c, 1) : lo[c] + ins(c, 0);
          const pa = [0, 0, 0]; pa[ax] = P(ax, sa); pa[bx] = I(bx, sb); pa[c] = cc;
          const pb = [0, 0, 0]; pb[ax] = I(ax, sa); pb[bx] = P(bx, sb); pb[c] = cc;
          ks.push(vtx(pa, ax, sa), vtx(pb, bx, sb));
        }
        a.q(ks[0], ks[1], ks[3], ks[2]);
      }
    }
    for (let sx = 0; sx < 2; sx++) for (let sy = 0; sy < 2; sy++) for (let sz = 0; sz < 2; sz++) { // coins
      if (!vis[0][sx] || !vis[1][sy] || !vis[2][sz]) continue;
      const k0 = vtx([P(0, sx), I(1, sy), I(2, sz)], 0, sx), k1 = vtx([I(0, sx), P(1, sy), I(2, sz)], 1, sy), k2 = vtx([I(0, sx), I(1, sy), P(2, sz)], 2, sz);
      a.t(k0, k1, k2);
    }
    return this.emit(mat, a, color);
  }
  // hexaèdre quelconque (8 sommets : face basse 0-3 puis face haute 4-7, même ordre) à faces planes : pieds fuselés,
  // consoles, coins biseautés ; f = faces gardées parmi 'bt0123' (bas, haut, côtés 0-1, 1-2, 2-3, 3-0)
  hexa(mat, c, color, f = 'bt0123') {
    const a = new Acc(), cen = [0, 0, 0]; for (const p of c) { cen[0] += p[0] / 8; cen[1] += p[1] / 8; cen[2] += p[2] / 8; }
    const face = (ids) => {
      const [p0, p1, p2] = [c[ids[0]], c[ids[1]], c[ids[2]]];
      let nx = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]), ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]), nz = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
      let l = Math.hypot(nx, ny, nz); if (l < 1e-9) { const p3 = c[ids[3]]; nx = (p2[1] - p0[1]) * (p3[2] - p0[2]) - (p2[2] - p0[2]) * (p3[1] - p0[1]); ny = (p2[2] - p0[2]) * (p3[0] - p0[0]) - (p2[0] - p0[0]) * (p3[2] - p0[2]); nz = (p2[0] - p0[0]) * (p3[1] - p0[1]) - (p2[1] - p0[1]) * (p3[0] - p0[0]); l = Math.hypot(nx, ny, nz) || 1; }
      nx /= l; ny /= l; nz /= l;
      const fc = ids.reduce((s, i) => [s[0] + c[i][0] / 4, s[1] + c[i][1] / 4, s[2] + c[i][2] / 4], [0, 0, 0]);
      if ((fc[0] - cen[0]) * nx + (fc[1] - cen[1]) * ny + (fc[2] - cen[2]) * nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const k = ids.map((i) => a.v(c[i][0], c[i][1], c[i][2], nx, ny, nz)); a.q(...k);
    };
    if (f.includes('b')) face([0, 1, 2, 3]); if (f.includes('t')) face([4, 5, 6, 7]);
    if (f.includes('0')) face([0, 1, 5, 4]); if (f.includes('1')) face([1, 2, 6, 5]); if (f.includes('2')) face([2, 3, 7, 6]); if (f.includes('3')) face([3, 0, 4, 7]);
    return this.emit(mat, a, color);
  }
  // pied / montant fuselé vertical, section rectangulaire (w0 × d0 en bas, w1 × d1 en haut)
  taper(mat, x, z, y0, y1, w0, d0, w1, d1, color, f = 't0123') {
    return this.hexa(mat, [[x - w0 / 2, y0, z - d0 / 2], [x + w0 / 2, y0, z - d0 / 2], [x + w0 / 2, y0, z + d0 / 2], [x - w0 / 2, y0, z + d0 / 2], [x - w1 / 2, y1, z - d1 / 2], [x + w1 / 2, y1, z - d1 / 2], [x + w1 / 2, y1, z + d1 / 2], [x - w1 / 2, y1, z + d1 / 2]], color, f);
  }
  // révolution d'un profil [[r, y], …] (de bas en haut par l'extérieur) autour de l'axe vertical passant par (cx, cy, cz)
  lathe(mat, cx, cy, cz, pr, seg, color, o = {}) {
    const a = new Acc(), nr = profNormals(pr), a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI * 2, sx = o.sx ?? 1, sz = o.sz ?? 1;
    for (let i = 0; i < pr.length; i++) for (let j = 0; j <= seg; j++) {
      const t = a0 + (a1 - a0) * j / seg, c = Math.cos(t), s = Math.sin(t), [r, y] = pr[i], [nr0, ny] = nr[i];
      let nx = nr0 * c / sx, nz = nr0 * s / sz; const l = Math.hypot(nx, ny, nz) || 1;
      a.v(cx + r * c * sx, cy + y, cz + r * s * sz, nx / l, ny / l, nz / l);
    }
    const W = seg + 1;
    for (let i = 0; i < pr.length - 1; i++) {
      if ((pr[i][0] === pr[i + 1][0] && pr[i][1] === pr[i + 1][1]) || (pr[i][0] < 1e-6 && pr[i + 1][0] < 1e-6)) continue;
      for (let j = 0; j < seg; j++) { const k = i * W + j; a.q(k, k + 1, k + W + 1, k + W); }
    }
    return this.emit(mat, a, color);
  }
  // cylindre vertical (bouchons facultatifs) ; r1 : rayon du haut (cône tronqué)
  cyl(mat, x, y0, z, r, h, seg, color, o = {}) {
    const r1 = o.r1 ?? r, pr = [];
    if (o.bottom !== false) pr.push([0, 0], [r, 0], [r, 0]); else pr.push([r, 0]);
    pr.push([r1, h]); if (o.top !== false) pr.push([r1, h], [0, h]);
    return this.lathe(mat, x, y0, z, pr, seg, color, o);
  }
  // tube droit entre deux points (rayon r), bouchons facultatifs
  tube(mat, p, q, r, seg, color, caps = false) {
    const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), L = d.length(); if (L < 1e-5) return this;
    d.divideScalar(L);
    const e1 = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(d).normalize() : new THREE.Vector3(1, 0, 0).cross(d).normalize(), e2 = d.clone().cross(e1);
    const a = new Acc(), W = seg + 1;
    for (const P of [p, q]) for (let j = 0; j <= seg; j++) { const t = j / seg * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), nx = e1.x * c + e2.x * s, ny = e1.y * c + e2.y * s, nz = e1.z * c + e2.z * s; a.v(P[0] + nx * r, P[1] + ny * r, P[2] + nz * r, nx, ny, nz); }
    for (let j = 0; j < seg; j++) a.q(j, j + 1, W + j + 1, W + j);
    if (caps) for (const [P, sg] of [[p, -1], [q, 1]]) {
      const c0 = a.v(P[0], P[1], P[2], d.x * sg, d.y * sg, d.z * sg), ks = [];
      for (let j = 0; j <= seg; j++) { const t = j / seg * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); ks.push(a.v(P[0] + (e1.x * c + e2.x * s) * r, P[1] + (e1.y * c + e2.y * s) * r, P[2] + (e1.z * c + e2.z * s) * r, d.x * sg, d.y * sg, d.z * sg)); }
      for (let j = 0; j < seg; j++) a.t(c0, ks[j], ks[j + 1]);
    }
    return this.emit(mat, a, color);
  }
  // tube le long d'une ligne brisée (cintrages : piétements, cintres, crochets) ; o.closed : boucle
  sweep(mat, pts, r, seg, color, o = {}) {
    const n = pts.length; if (n < 2) return this;
    const V = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed = !!o.closed, T = [];
    for (let i = 0; i < n; i++) {
      const pi = closed ? (i - 1 + n) % n : Math.max(0, i - 1), ni = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      const t0 = V[i].clone().sub(V[pi]), t1 = V[ni].clone().sub(V[i]);
      if (t0.lengthSq() < 1e-12) t0.copy(t1); if (t1.lengthSq() < 1e-12) t1.copy(t0);
      t0.normalize(); t1.normalize(); const t = t0.clone().add(t1); if (t.lengthSq() < 1e-8) t.copy(t1); t.normalize();
      T.push({ t, k: 1 / Math.max(0.55, t0.dot(t)) });
    }
    let e1 = Math.abs(T[0].t.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(T[0].t).normalize() : new THREE.Vector3(1, 0, 0).cross(T[0].t).normalize();
    const a = new Acc(), W = seg + 1;
    for (let i = 0; i < n; i++) {
      const t = T[i].t; e1 = e1.clone().sub(t.clone().multiplyScalar(e1.dot(t))).normalize(); const e2 = t.clone().cross(e1), rr = r * (o.radii ? o.radii[i] : 1);
      for (let j = 0; j <= seg; j++) { const th = j / seg * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), nx = e1.x * c + e2.x * s, ny = e1.y * c + e2.y * s, nz = e1.z * c + e2.z * s, kk = rr * (closed || (i > 0 && i < n - 1) ? T[i].k : 1); a.v(V[i].x + nx * kk, V[i].y + ny * kk, V[i].z + nz * kk, nx, ny, nz); }
    }
    for (let i = 0; i < n - 1 + (closed ? 1 : 0); i++) { const i1 = (i + 1) % n; for (let j = 0; j < seg; j++) a.q(i * W + j, i * W + j + 1, i1 * W + j + 1, i1 * W + j); }
    return this.emit(mat, a, color);
  }
  // profil [[z, y], …] (extérieur à droite du parcours) extrudé le long de x, de x0 à x1 ; o.caps : bouchons plats
  extrudeX(mat, pr, x0, x1, color, o = {}) {
    const a = new Acc(), nr = profNormals(pr), n = pr.length;
    for (const x of [x0, x1]) for (let i = 0; i < n; i++) a.v(x, pr[i][1], pr[i][0], 0, nr[i][1], nr[i][0]);
    for (let i = 0; i < n - 1; i++) { if (pr[i][0] === pr[i + 1][0] && pr[i][1] === pr[i + 1][1]) continue; a.q(i, i + 1, n + i + 1, n + i); }
    if (o.caps) {
      const pts = []; for (let i = 0; i < n; i++) if (!(i > 0 && pr[i][0] === pr[i - 1][0] && pr[i][1] === pr[i - 1][1])) pts.push(new THREE.Vector2(pr[i][0], pr[i][1]));
      if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
      const tris = THREE.ShapeUtils.triangulateShape(pts, []);
      for (const [x, s] of [[x0, -1], [x1, 1]]) { const ks = pts.map((p) => a.v(x, p.y, p.x, s, 0, 0)); for (const t of tris) a.t(ks[t[0]], ks[t[1]], ks[t[2]]); }
    }
    return this.emit(mat, a, color);
  }
  // surface paramétrée fn(s, t) → [x, y, z] (s, t ∈ [0, 1]) ; o.both : deux faces (rideau, tissu), o.flip : normales inversées
  sheet(mat, fn, nu, nv, color, o = {}) {
    const a = new Acc(), W = nu + 1, P = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) P.push(fn(i / nu, j / nv));
    const at = (i, j) => P[Math.max(0, Math.min(nv, j)) * W + Math.max(0, Math.min(nu, i))];
    const nrm = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const a0 = at(i - 1, j), a1 = at(i + 1, j), b0 = at(i, j - 1), b1 = at(i, j + 1);
      const ux = a1[0] - a0[0], uy = a1[1] - a0[1], uz = a1[2] - a0[2], vx = b1[0] - b0[0], vy = b1[1] - b0[1], vz = b1[2] - b0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (o.flip) { nx = -nx; ny = -ny; nz = -nz; }
      nrm.push([nx, ny, nz]);
    }
    const sides = o.both ? [1, -1] : [1], off = o.thick ?? 0.004;
    for (const sd of sides) {
      const b0 = a.p.length / 3;
      for (let k = 0; k < P.length; k++) { const p = P[k], q = nrm[k], d = sd < 0 ? -off : 0; a.v(p[0] + q[0] * d, p[1] + q[1] * d, p[2] + q[2] * d, q[0] * sd, q[1] * sd, q[2] * sd); }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = b0 + j * W + i; a.q(k, k + 1, k + W + 1, k + W); }
    }
    return this.emit(mat, a, color);
  }
  // ellipsoïde (rayons rx, ry, rz) centré en (x, y, z)
  blob(mat, x, y, z, rx, ry, rz, color, seg = 8, rings = 5) {
    const pr = []; for (let i = 0; i <= rings; i++) { const t = -Math.PI / 2 + Math.PI * i / rings; pr.push([Math.cos(t) * rx, Math.sin(t) * ry]); }
    pr[0][0] = 0; pr[rings][0] = 0;
    return this.lathe(mat, x, y, z, pr, seg, color, { sz: rz / rx });
  }
  // géométrie three.js quelconque (cache des gabarits : vêtements, cintres) dans le repère courant
  geo(mat, g, color) {
    const a = new Acc(), P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) a.v(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i));
    if (g.index) for (let i = 0; i < g.index.count; i++) a.i.push(g.index.getX(i)); else for (let i = 0; i < P.count; i++) a.i.push(i);
    return this.emit(mat, a, color);
  }
}

// ───────────────────────── couleurs et matériaux ─────────────────────────
export const FU = 'furniture', ME = 'furniture_metal', WO = 'furniture_wood', FA = 'furniture_fabric', PE = 'furniture_perf';
// teinte éclaircie (k > 0) ou assombrie (k < 0)
export function shade(c, k) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}
// couleur d'essence de bois (brun, ocre, chêne) plutôt que laque ou peinture ; les dorures (laiton) sont métalliques
const GOLD = new Set([0xb8963e, 0xc9a227, 0xd4a017, 0xc9a96e]);
export function woody(c) {
  if (GOLD.has(c)) return false;
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return r >= g && g >= b && r - b > 20 && mx < 236 && (mx - mn) / Math.max(1, mx) < 0.68;
}
export const woodMat = (c) => (woody(c) ? WO : GOLD.has(c) ? ME : FU);
export const STEEL = 0xc4c8cc, CHROME = 0xdfe2e5, DARK = 0x2e3135, RUBBER = 0x1d1f21;

// ───────────────────────── rayonnages ─────────────────────────
// Tablette en tôle pliée (dessus à y, de z0 au nez z1) : lèvre avant de 40 mm (porte-étiquettes posé devant par
// shelflabels.js), retour arrière ; la lèvre est coupée aux jonctions des travées (xs).
function steelShelf(p, x0, x1, z0, z1, y, c, xs) {
  p.box(FU, x0, y - 0.005, z0, x1, y, z1 - 0.012, c, 'xXyY');
  const cuts = (xs || []).filter((x) => x > x0 + 0.05 && x < x1 - 0.05);
  let a = x0; for (const x of [...cuts, x1]) { p.box(FU, a + (a > x0 ? 0.0015 : 0), y - 0.04, z1 - 0.012, x - (x < x1 ? 0.0015 : 0), y, z1, c, 'xXyYZ'); a = x; }
  p.box(FU, x0, y - 0.026, z0, x1, y - 0.005, z0 + 0.008, c, 'yZ');
}
// Console de tablette (tôle de 3 mm accrochée au montant) sous une tablette de dessus y, du montant (z0) au nez (z1)
function bracket(p, x, y, z0, z1, c) {
  const t = 0.0015, yb = y - 0.005;
  p.hexa(FU, [[x - t, yb - 0.12, z0], [x - t, yb - 0.025, z1 - 0.03], [x - t, yb, z1 - 0.03], [x - t, yb, z0], [x + t, yb - 0.12, z0], [x + t, yb - 0.025, z1 - 0.03], [x + t, yb, z1 - 0.03], [x + t, yb, z0]], c, 'bt012');
}
// Bande de crémaillère (perforations étirées en fentes) sur la face avant d'un montant, à z (nz : sens de la face)
function slotStrip(p, x, y0, y1, z, c, nz = 1) {
  const a = new Acc(), w = 0.006, ks = [];
  for (const [xx, yy] of [[x - w, y0], [x + w, y0], [x + w, y1], [x - w, y1]]) ks.push(a.v(xx, yy, z, 0, 0, nz));
  a.q(...ks); a.uv = [0, y0 * 1.25, 1 / 16, y0 * 1.25, 1 / 16, y1 * 1.25, 0, y1 * 1.25];
  p.emit(PE, a, c);
}
// Rayonnage mural (repère : x le long du mur, centré ; z = 0 à 1 cm derrière le fond des tablettes ; y = sol).
// o : { L, depth, H, hs (hauteurs des tablettes), from (bas du fond), base, color, back, metal (structure acier),
//       perf (fond perforé), uprights (couleur des montants / pilastres), plinth, rack (rayonnage de réserve) }
export function wallBay(p, o) {
  const L = o.L, hx = L / 2, d = o.depth, zf = d + 0.01, H = o.H, h0 = o.from ?? 0, hs = o.hs, sc = o.color;
  const nb = Math.max(1, Math.round(L / (o.rack ? 1.25 : 1.0))), xs = []; for (let k = 0; k <= nb; k++) xs.push(-hx + k * L / nb);
  if (o.rack) { // rayonnage de stockage : échelles bleues perforées, lisses orange, platelages galvanisés
    const blue = 0x2f5f9e, orange = 0xe2661b, galva = 0xb9bfc4;
    for (const x of xs) {
      const xx = Math.max(-hx + 0.03, Math.min(hx - 0.03, x));
      for (const z of [0.04, zf - 0.03]) { p.box(FU, xx - 0.025, 0, z - 0.025, xx + 0.025, H, z + 0.025, blue, 'xXzZY'); slotStrip(p, xx, 0.05, H - 0.05, z + 0.0255, blue); p.box(FU, xx - 0.05, 0, z - 0.05, xx + 0.05, 0.008, z + 0.05, DARK, 'xXYzZ'); }
      for (let y = 0.25; y < H - 0.2; y += 0.6) { p.box(FU, xx - 0.008, y, 0.065, xx + 0.008, y + 0.025, zf - 0.055, blue, 'xXyY'); p.tube(FU, [xx, y + 0.03, 0.065], [xx, y + 0.57, zf - 0.055], 0.009, 4, blue); }
    }
    for (const h of hs) {
      for (const z of [0.04, zf - 0.03]) p.rbox(FU, -hx + 0.03, h - 0.1, z - 0.024, hx - 0.03, h - 0.004, z + 0.024, 0.006, orange, 'yYzZ');
      p.box(PE, -hx + 0.03, h - 0.006, 0.02, hx - 0.03, h, zf - 0.005, galva, 'yY');
    }
    return;
  }
  if (o.metal) { // gondole murale acier : fond, montants à crémaillère, consoles, tablettes à lèvre, plinthe, joues
    const fr = o.uprights ?? shade(o.back, -0.18);
    p.box(o.perf ? PE : FU, -hx, h0, -0.006, hx, H, 0.004, o.back, 'Z');
    for (const x of xs) { const xx = Math.max(-hx + 0.016, Math.min(hx - 0.016, x)); p.box(FU, xx - 0.015, h0, -0.006, xx + 0.015, H, 0.012, fr, 'xXZ'); if (o.perf) slotStrip(p, xx, h0 + 0.03, H - 0.02, 0.0125, fr); else p.box(FU, xx - 0.003, h0 + 0.03, 0.012, xx + 0.003, H - 0.02, 0.0125, DARK, 'Z'); }
    for (const h of hs) {
      steelShelf(p, -hx + 0.012, hx - 0.012, 0.01, zf, h, sc, xs);
      for (const x of xs) if (h > 0.9 || x === xs[0] || x === xs[nb]) bracket(p, Math.max(-hx + 0.02, Math.min(hx - 0.02, x)), h, 0.012, zf, fr);
    }
    if (hs[0] > 0.07 && hs[0] < 0.4 && h0 < 0.05 && !o.plinthBlock) p.box(FU, -hx + 0.012, 0, zf - 0.035, hx - 0.012, hs[0] - 0.042, zf - 0.03, o.kick ?? DARK, 'YZ');
    for (const s of [-1, 1]) p.rbox(FU, s > 0 ? hx - 0.012 : -hx, h0 > 0.5 ? h0 : 0, -0.006, s > 0 ? hx : -hx + 0.012, H, zf + 0.004, 0.004, fr, h0 > 0.5 ? 'xXyYZ' : 'xXYZ');
    p.box(FU, -hx, H, -0.006, hx, H + 0.014, 0.03, fr, 'yYZ');
    return;
  }
  // menuiserie (bois ou laque) : joues, fond, tablettes à chant arrondi, plinthe en retrait, corniche, pilastres
  const m = woodMat(sc), g = 0.022, bm = woodMat(o.back), pil = o.uprights;
  p.box(bm, -hx + g, h0, -0.006, hx - g, H, 0.006, o.back, 'Z');
  p.vg = true; for (const s of [-1, 1]) p.rbox(m, s > 0 ? hx - g : -hx, h0 > 0.5 ? h0 : 0, -0.006, s > 0 ? hx : -hx + g, H, zf, 0.004, sc, h0 > 0.5 ? 'xXyYZ' : 'xXYZ'); p.vg = false;
  for (const h of hs) p.rbox(m, -hx + g, h - 0.024, 0.006, hx - g, h, zf, 0.004, sc, 'yYZ');
  if (pil !== undefined) for (const x of xs.slice(1, -1)) p.box(woodMat(pil), x - 0.01, h0, 0.006, x + 0.01, H, 0.013, pil, 'xXZ');
  if (hs[0] > 0.06 && hs[0] < 0.4 && h0 < 0.05 && !o.plinthBlock) p.box(m, -hx + g, 0, zf - 0.045, hx - g, hs[0] - 0.024, zf - 0.025, shade(sc, -0.3), 'YZ');
  p.rbox(m, -hx - 0.012, H, -0.006, hx + 0.012, H + 0.032, zf + 0.018, 0.006, sc, 'xXyYZ');
}

// Gondole double face (repère : centre de l'emprise au sol, x le long, face avant vers +z).
// o : { L, depth, H, hs, color, back, base (plinthe), cap (têtes), capH, metal, perf }
export function gondola(p, o) {
  const L = o.L, hx = L / 2, hd = o.depth / 2, H = o.H, hs = o.hs, sc = o.color, ch = H + o.capH, metal = o.metal !== false;
  const nb = Math.max(1, Math.round(L / 1.0)), xs = []; for (let k = 0; k <= nb; k++) xs.push(-hx + k * L / nb);
  const fr = metal ? shade(o.back, -0.2) : o.back, m = metal ? FU : woodMat(sc);
  // âme : fonds sur les deux faces, montants à crémaillère, chapeau
  p.box(metal && o.perf ? PE : woodMat(o.back), -hx, hs[0] - 0.03, -0.018, hx, H, 0.018, o.back, 'zZ');
  if (metal) for (const x of xs.slice(1, -1)) { p.box(FU, x - 0.015, hs[0] - 0.03, -0.021, x + 0.015, H, 0.021, fr, 'xXzZ'); for (const s of [1, -1]) { if (o.perf) slotStrip(p, x, hs[0], H - 0.02, s * 0.0215, fr, s); else p.box(FU, x - 0.003, hs[0], s > 0 ? 0.021 : -0.0215, x + 0.003, H - 0.02, s > 0 ? 0.0215 : -0.021, DARK, s > 0 ? 'Z' : 'z'); } }
  p.box(m, -hx, H, -0.024, hx, H + 0.016, 0.024, fr, 'yYzZ');
  for (const side of [0, Math.PI]) {
    p.push(0, 0, 0, side);
    p.box(m, -hx, 0, hd - 0.035, hx, hs[0] - (metal ? 0.042 : 0.024), hd - 0.028, o.base, 'YZ');            // plinthe en retrait
    for (const h of hs) {
      if (metal) { steelShelf(p, -hx, hx, 0.02, hd, h, sc, xs); for (const x of xs) if (h > 0.9 || x === xs[0] || x === xs[nb]) bracket(p, Math.max(-hx + 0.004, Math.min(hx - 0.004, x)), h, 0.021, hd, fr); }
      else p.rbox(m, -hx, h - 0.024, 0.018, hx, h, hd, 0.004, sc, 'yYZ');
    }
    p.pop();
  }
  // têtes de gondole : joue pleine à chants adoucis, plinthe en retrait, couronnement (l'affichette se pose dessous)
  const cm = woodMat(o.cap), trim = metal ? 0xb9bec3 : shade(o.cap, -0.25);
  for (const s of [-1, 1]) {
    const a = s > 0 ? hx : -hx - 0.05, b = s > 0 ? hx + 0.05 : -hx;
    p.box(FU, a + 0.006, 0, -hd + 0.012, b - 0.006, 0.1, hd - 0.012, DARK, s > 0 ? 'XzZY' : 'xzZY');
    p.vg = true; p.rbox(cm, a, 0.1, -hd, b, ch - 0.04, hd, 0.012, o.cap, s > 0 ? 'XyzZ' : 'xyzZ'); p.vg = false;
    p.rbox(metal ? ME : cm, a - 0.004, ch - 0.04, -hd - 0.006, b + 0.004, ch, hd + 0.006, 0.014, trim, 'xXyYzZ');
  }
}

// ───────────────────────── quincaillerie de meuble ─────────────────────────
// matériau d'un plateau d'après sa couleur : bois, métal (zinc, inox, laiton) ou stratifié
export function topMat(c) {
  if (woody(c)) return WO;
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return (mx - mn < 24 && mx > 150 && mx < 215) || GOLD.has(c) ? ME : FU;
}
// poignée barre (entraxe len) sur une face avant à z, verticale ou horizontale
export function handleBar(p, x, y, z, len, vertical = true, c = CHROME) {
  const a = vertical ? [x, y - len / 2, z + 0.03] : [x - len / 2, y, z + 0.03], b = vertical ? [x, y + len / 2, z + 0.03] : [x + len / 2, y, z + 0.03];
  p.tube(ME, a, b, 0.006, 6, c, true);
  for (const q of [a, b]) p.tube(ME, [q[0], q[1], z], [q[0], q[1], z + 0.03], 0.004, 5, c);
}
// façade de porte ou de tiroir (panneau à chants adoucis, 18 mm, posé devant z) avec poignée
export function front(p, mat, x0, y0, x1, y1, z, c, o = {}) {
  const vg = p.vg; p.vg = !o.drawer; // fil vertical sur les portes, horizontal sur les tiroirs
  p.rbox(mat, x0 + 0.002, y0 + 0.002, z, x1 - 0.002, y1 - 0.002, z + 0.018, 0.004, c, 'xXyYZ'); p.vg = vg;
  if (o.handle === false) return;
  const hc = o.hc ?? CHROME;
  if (o.drawer) handleBar(p, (x0 + x1) / 2, y1 - Math.min(0.05, (y1 - y0) * 0.35), z + 0.018, Math.min(0.16, (x1 - x0) * 0.45), false, hc);
  else handleBar(p, o.right ? x1 - 0.04 : x0 + 0.04, y1 - Math.min(0.12, (y1 - y0) * 0.25), z + 0.018, Math.min(0.14, (y1 - y0) * 0.4), true, hc);
}
// Meuble bas contre un mur (repère : x le long, dos à z = 0, façade à z = depth, dessus à h).
// o : { L, depth, h, color, top, style: 'kitchen' | 'wood' | 'doors' | 'plain', doors (largeur visée) }
export function cabinet(p, o) {
  const hx = o.L / 2, d = o.depth, h = o.h, c = o.color, st = o.style || 'doors';
  if (st === 'plain' || h < 0.3) return p.rbox(woodMat(c), -hx, o.h0 ?? 0, 0, hx, h, d, 0.006, c, 'xXYZ');
  const kitchen = st === 'kitchen', tc = o.top ?? (kitchen ? 0xc9cdd1 : shade(c, -0.15)), tt = kitchen ? 0.04 : 0.03, m = kitchen ? ME : woodMat(c), plinth = 0.1;
  p.box(FU, -hx, 0, 0, hx, plinth, d - 0.06, DARK, 'xXYZ');                                                   // socle en retrait
  p.box(m, -hx, plinth, 0, hx, h - tt, d - 0.02, shade(c, -0.25), 'Z'); p.box(m, -hx, plinth, 0, hx, h - tt, d, c, 'xX'); // caissons (joints sombres entre les façades), joues
  const n = Math.max(1, Math.round(o.L / (o.doors ?? 0.6))), w = o.L / n, dh = h - tt - plinth - 0.01;
  for (let i = 0; i < n; i++) {
    const a = -hx + i * w, b = a + w;
    if (kitchen || (st === 'doors' && i % 3 === 1)) { front(p, m, a, plinth + dh * 0.72, b, h - tt - 0.006, d - 0.02, c, { drawer: true }); front(p, m, a, plinth + 0.004, b, plinth + dh * 0.72 - 0.004, d - 0.02, c, { right: i % 2 === 1 }); }
    else front(p, m, a, plinth + 0.004, b, h - tt - 0.006, d - 0.02, c, { right: i % 2 === 1 });
  }
  p.rbox(topMat(tc), -hx - 0.005, h - tt, 0, hx + 0.005, h, kitchen ? d + 0.02 : d, kitchen ? 0.004 : 0.006, tc, 'xXyYZ'); // plan de travail (affleurant hors cuisine : porte-étiquettes visibles)
  if (kitchen) p.box(ME, -hx, h, 0, hx, h + 0.06, 0.012, tc, 'xXYZ');                                               // remontée
}
// Comptoir (repère : centre, x le long, face client vers +z, dessus à h). o : { L, D, h, color, top, staff: true (côté personnel aménagé), panels }
export function counter(p, o) {
  const hx = o.L / 2, hz = o.D / 2, h = o.h, c = o.color, m = woodMat(c), tc = o.top, tt = 0.05;
  p.box(FU, -hx + 0.02, 0, -hz + 0.035, hx - 0.02, 0.1, hz - 0.06, DARK, 'xXzZ');                          // socle en retrait
  p.rbox(m, -hx, 0.1, -hz + 0.018, hx, h - tt, hz - 0.012, 0.006, c, 'xXyzZ');                             // caisson
  const n = Math.max(1, Math.round(o.L / 0.75)), pw = o.L / n, pc = shade(c, woody(c) ? -0.12 : 0.07);
  for (let i = 0; i < n; i++) { // panneaux en relief côté client, filet sous le plateau
    const a = -hx + i * pw + 0.06, b = -hx + (i + 1) * pw - 0.06;
    p.rbox(m, a, 0.2, hz - 0.012, b, h - tt - 0.09, hz, 0.005, pc, 'xXyYZ');
  }
  p.box(m, -hx, h - tt - 0.05, hz - 0.012, hx, h - tt - 0.04, hz + 0.004, shade(c, -0.2), 'yYZ');
  // côté personnel : tiroirs sous le plateau, portes, niche ouverte
  const k = Math.max(1, Math.round(o.L / 0.55)), w = o.L / k, ys = h - tt - 0.16;
  for (let i = 0; i < k; i++) {
    const a = -hx + i * w, b = a + w;
    p.push(0, 0, 0, Math.PI);
    front(p, m, -b, ys, -a, h - tt - 0.006, hz - 0.018, c, { drawer: true });
    if (i === k - 1 && k > 2) { p.box(FU, -b + 0.02, 0.12, hz - 0.06, -a - 0.02, ys - 0.02, hz - 0.017, 0x1c1c1e, 'Z'); p.box(m, -b + 0.02, (0.12 + ys) / 2, hz - 0.017, -a - 0.02, (0.12 + ys) / 2 + 0.02, hz - 0.004, c, 'yYZ'); }
    else front(p, m, -b, 0.104, -a, ys - 0.004, hz - 0.018, c, { right: i % 2 === 0 });
    p.pop();
  }
  p.rbox(topMat(tc), -hx - 0.03, h - tt, -hz - 0.03, hx + 0.03, h, hz + 0.03, 0.012, tc);                  // plateau débordant
}
// Caisse de supermarché (repère : centre, x le long du meuble — tapis côté x < 0 —, caissière vers +z, dessus à h)
export function checkout(p, o) {
  const hx = o.L / 2, hz = o.D / 2, h = o.h, c = o.color, inox = 0xc6cacd;
  p.box(FU, -hx + 0.02, 0, -hz + 0.05, hx - 0.02, 0.1, hz - 0.02, DARK, 'xXzZ');
  p.rbox(FU, -hx, 0.1, -hz, hx, h - 0.04, hz - 0.018, 0.008, c, 'xXzZ');
  front(p, FU, -0.26, h - 0.2, 0.26, h - 0.045, hz - 0.018, shade(c, 0.12), { drawer: true });                    // tiroir-caisse, portes côté caissière
  front(p, FU, -hx + 0.03, 0.11, -0.3, h - 0.05, hz - 0.018, c); front(p, FU, 0.3, 0.11, hx - 0.03, h - 0.05, hz - 0.018, c, { right: true });
  p.box(FU, -hx + 0.002, 0.5, -hz - 0.004, hx - 0.002, 0.56, -hz, o.accent ?? 0x2e7d32, 'z');               // bandeau aux couleurs du magasin
  p.rbox(ME, -hx - 0.01, h - 0.03, -hz - 0.01, hx + 0.01, h, hz + 0.01, 0.006, inox);                       // plateau inox
  // tapis roulant (côté magasin) : bande caoutchouc, rouleaux d'extrémité, glissières
  const b0 = -hx + 0.05, b1 = -0.32, bz = 0.3;
  p.box(FU, b0, h, -bz, b1, h + 0.01, bz, RUBBER, 'xXY');
  for (let x = b0 + 0.06; x < b1; x += 0.16) p.box(FU, x, h + 0.01, -bz, x + 0.004, h + 0.0105, bz, 0x2a2c2f, 'Y');
  p.tube(FU, [b0, h + 0.002, -bz], [b0, h + 0.002, bz], 0.012, 8, RUBBER);
  for (const s of [-1, 1]) p.rbox(ME, b0 - 0.02, h, s * bz + (s > 0 ? 0 : -0.04), b1, h + 0.035, s * bz + (s > 0 ? 0.04 : 0), 0.008, inox, 'xXYzZ');
  // scanner à plat (vitre) et tour du scanner
  p.box(FU, 0.28, h, -0.18, 0.5, h + 0.004, 0.18, 0x15181a, 'xXYzZ');
  p.box('glass', 0.29, h + 0.004, -0.17, 0.49, h + 0.006, 0.17, 0xffffff, 'Y');
  p.rbox(FU, 0.27, h, 0.18, 0.51, h + 0.17, 0.26, 0.01, 0x2b2e31, 'xXYzZ');
  p.box('glass', 0.29, h + 0.04, 0.179, 0.49, h + 0.15, 0.18, 0xffffff, 'z');
  // zone d'ensachage : rebords relevés, séparateur
  p.rbox(ME, 0.56, h, -hz - 0.01, hx + 0.01, h + 0.05, -hz + 0.03, 0.01, inox, 'xXYzZ');
  p.rbox(ME, 0.56, h, -0.03, hx, h + 0.06, 0.0, 0.008, inox, 'xXYzZ');
  // terminal de paiement sur flexible (côté client) et afficheur client
  p.tube(FU, [0.12, h, -hz + 0.07], [0.12, h + 0.18, -hz + 0.07], 0.012, 6, DARK);
  p.push(0.12, h + 0.2, -hz + 0.07, 0); p.box(FU, -0.04, -0.02, -0.08, 0.04, 0.02, 0.08, 0x202326, 'xXyYzZ'); p.box(FU, -0.03, 0.02, -0.06, 0.03, 0.022, 0.0, 0x0e3a52, 'Y'); p.box(FU, -0.03, 0.02, 0.005, 0.03, 0.022, 0.07, 0x3a3e42, 'Y'); p.pop();
  p.tube(ME, [-0.2, h, -hz + 0.05], [-0.2, h + 0.32, -hz + 0.05], 0.015, 8, inox);
  p.rbox(FU, -0.31, h + 0.3, -hz + 0.02, -0.09, h + 0.45, -hz + 0.08, 0.01, 0x222528, 'xXyYzZ'); p.box(FU, -0.3, h + 0.31, -hz + 0.018, -0.1, h + 0.44, -hz + 0.02, 0x10324a, 'z');
  // mât de caisse avec lanterne numérotée
  p.tube(ME, [-hx + 0.06, h, hz - 0.06], [-hx + 0.06, h + 1.25, hz - 0.06], 0.02, 8, inox);
  p.rbox(FU, -hx - 0.06, h + 1.25, hz - 0.18, -hx + 0.18, h + 1.5, hz + 0.06, 0.03, o.accent ?? 0x2e7d32, 'xXyYzZ');
  for (const s of [-1, 1]) p.box(FU, -hx - 0.03, h + 1.29, s > 0 ? hz + 0.06 : hz - 0.181, -hx + 0.15, h + 1.46, s > 0 ? hz + 0.061 : hz - 0.18, 0xf4f1e6, s > 0 ? 'Z' : 'z');
}
// Garde-corps de file de caisse (repère : x le long, centré) : soubassement, poteaux, deux lisses
export function laneRail(p, L, H, c = 0xc6cacd) {
  const hx = L / 2;
  p.rbox(FU, -hx, 0, -0.05, hx, 0.3, 0.05, 0.01, 0x8a9096, 'xXYzZ');
  for (const x of [-hx + 0.04, 0, hx - 0.04]) p.cyl(ME, x, 0.3, 0, 0.02, H - 0.3, 8, c, { bottom: false });
  for (const y of [H - 0.15, H - 0.01]) p.tube(ME, [-hx + 0.04, y, 0], [hx - 0.04, y, 0], 0.018, 8, c, true);
}
// Table (repère : centre de l'emprise, dessus du plateau à h). o : { w, d, h, color, legs, style: 'legs' | 'pedestal', tt }
export function table(p, o) {
  const hw = o.w / 2, hd = o.d / 2, h = o.h, c = o.color, m = woodMat(c), tt = o.tt ?? 0.035, lc = o.legs ?? (woody(c) ? shade(c, -0.25) : 0x2a2c2f);
  p.rbox(m, -hw, h - tt, -hd, hw, h, hd, 0.008, c);
  if (o.style === 'pedestal') { // pied central en fonte : platine, fût, embase
    const r = Math.min(hw, hd) * 0.82;
    p.cyl(FU, 0, h - tt - 0.02, 0, 0.11, 0.02, 12, lc, { top: false });
    p.cyl(FU, 0, 0.05, 0, 0.032, h - tt - 0.07, 10, lc, { top: false, bottom: false });
    p.lathe(FU, 0, 0, 0, [[r, 0], [r, 0.014], [r * 0.55, 0.03], [0.06, 0.05], [0.04, 0.07], [0, 0.07]], 16, lc);
    return;
  }
  const lm = woody(lc) ? WO : FU, ins = Math.min(0.06, hw * 0.25, hd * 0.25), ah = Math.min(0.09, h * 0.18);
  for (const [a, b, zz] of [[-hw + ins, hw - ins, hd - ins], [-hw + ins, hw - ins, -hd + ins]]) p.box(m, a, h - tt - ah, zz - 0.01, b, h - tt, zz + 0.01, c, 'yzZ'); // ceinture
  for (const xx of [hw - ins, -hw + ins]) p.box(m, xx - 0.01, h - tt - ah, -hd + ins, xx + 0.01, h - tt, hd - ins, c, 'xXy');
  p.vg = true;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.taper(lm, sx * (hw - ins), sz * (hd - ins), 0, h - tt, 0.032, 0.032, 0.045, 0.045, lc);
  p.vg = false;
}
// Plateau surélevé sur deux joues (gradin de présentation)
export function riser(p, w, d, y0, y1, c) {
  const m = woodMat(c), hw = w / 2, hd = d / 2;
  p.rbox(m, -hw, y1 - 0.025, -hd, hw, y1, hd, 0.005, c);
  for (const s of [-1, 1]) p.rbox(m, s * hw - (s > 0 ? 0.022 : 0), y0, -hd + 0.02, s * hw + (s < 0 ? 0.022 : 0), y1 - 0.025, hd - 0.02, 0.003, shade(c, -0.08), 'xXzZ');
}
// Bloc de tiroirs (pharmacie, visserie) : façades jointives, poignées coquille, porte-étiquettes (repère du meuble bas)
export function drawerBank(p, o) {
  const hx = o.L / 2, d = o.depth, c = o.color, cols = o.cols, rows = o.rows, w = o.L / cols, hh = (o.h1 - o.h0) / rows;
  p.box(FU, -hx, o.h0, 0, hx, o.h1, d - 0.016, shade(c, -0.08), 'xXYZ');
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const a = -hx + i * w, b = a + w, y0 = o.h0 + j * hh, y1 = y0 + hh;
    p.rbox(FU, a + 0.003, y0 + 0.003, d - 0.016, b - 0.003, y1 - 0.003, d, 0.003, c, 'xXyYZ');
    const cx = (a + b) / 2, yh = y0 + hh * 0.42;
    p.box(ME, cx - 0.035, yh - 0.012, d, cx + 0.035, yh + 0.004, d + 0.012, o.line, 'xXyYZ');            // poignée coquille
    if (hh > 0.12) p.box(FU, cx - 0.03, yh + 0.025, d, cx + 0.03, yh + 0.05, d + 0.002, 0xf7f5ee, 'Z');   // étiquette
  }
}

// ───────────────────────── vitrines ─────────────────────────
// Vitrine réfrigérée à vitre bombée (repère : centre, x le long, face client vers +z, dessus de la vitre à h)
export function displayCase(p, o) {
  const hx = o.L / 2, hz = o.D / 2, h = o.h, c = o.color, tc = o.top, dk = h - 0.38, zb = -hz + 0.25, gz = hz - 0.12, m = woodMat(c);
  p.box(FU, -hx + 0.02, 0, -hz + 0.02, hx - 0.02, 0.1, hz - 0.06, DARK, 'xXzZ');                             // socle en retrait
  p.rbox(m, -hx, 0.1, -hz, hx, dk - 0.04, hz, 0.006, c, 'xXzZ');                                             // caisson
  const n = Math.max(1, Math.round(o.L / 0.9)), w = o.L / n;
  for (let i = 0; i < n; i++) p.rbox(m, -hx + i * w + 0.05, 0.18, hz, -hx + (i + 1) * w - 0.05, dk - 0.12, hz + 0.01, 0.004, shade(c, -0.06), 'xXyYZ');
  p.rbox(topMat(tc), -hx - 0.02, dk - 0.04, -hz - 0.02, hx + 0.02, dk, hz + 0.02, 0.01, tc);                 // ceinture (plateau du bas)
  p.box(ME, -hx + 0.02, dk - 0.004, zb, hx - 0.02, dk + 0.002, hz - 0.01, 0xd9dcdf, 'Y');                             // sole inox
  // vitre avant presque droite, bombée en haut, puis vitre du dessus
  const curve = (s, t) => { const x = -hx + 0.02 + s * (o.L - 0.04); if (t < 0.5) { const k = t / 0.5; return [x, dk + 0.004 + k * (h - 0.1 - dk), hz - 0.005 - k * 0.015]; } const a = (t - 0.5) / 0.5 * Math.PI / 2; return [x, h - 0.1 + Math.sin(a) * 0.1, hz - 0.12 + Math.cos(a) * 0.1]; };
  p.sheet('glass', curve, 1, 6, 0xffffff, { both: true, thick: 0.002 });
  p.box('glass', -hx + 0.02, h - 0.003, zb, hx - 0.02, h, gz - 0.002, 0xffffff, 'yY');
  for (let x = -hx + 0.02; x < hx - 0.05; x += o.L / 2) p.box('glass', x, dk + 0.004, zb - 0.004, x + o.L / 2 - 0.04, h - 0.005, zb, 0xffffff, 'zZ'); // portes coulissantes côté personnel
  p.box(FU, -hx + 0.02, h - 0.018, gz - 0.035, hx - 0.02, h - 0.004, gz - 0.005, 0xfff6e0, 'y');            // réglette LED sous la vitre
  // joues profilées suivant la vitre
  const cheek = hard([[hz, dk - 0.04], [hz, dk], [hz - 0.02, h - 0.1], [hz - 0.05, h - 0.03], [gz, h + 0.012], [zb - 0.02, h + 0.012], [zb - 0.02, h], [-hz, h], [-hz, dk - 0.04]]);
  for (const s of [-1, 1]) p.extrudeX(ME, cheek, s * hx - 0.02, s * hx + 0.02, o.cheek ?? 0xb8bdc2, { caps: true });
  p.rbox(topMat(tc), -hx, h - 0.06, -hz, hx, h, zb - 0.02, 0.006, tc);                                       // plan de service
}
// Vitrine à bijoux (repère : centre de l'emprise, dessus du plateau d'exposition à y = 0.92) : socle laqué, filets
// laiton, plateau de velours ; les vitres longues et le couvercle (cassable) sont posés par le kit d'aménagement
export function jewelCase(p, o) {
  const hx = o.L / 2, hz = o.D / 2, c = o.color, brass = 0xc9a227, top = 1.18;
  p.box(FU, -hx + 0.03, 0, -hz + 0.03, hx - 0.03, 0.08, hz - 0.03, 0x111116, 'xXzZ');
  p.rbox(FU, -hx, 0.08, -hz, hx, 0.86, hz, 0.008, c, 'xXzZ');
  for (const s of [-1, 1]) {
    p.push(0, 0, 0, s > 0 ? 0 : Math.PI);
    const n = Math.max(1, Math.round(o.L / 0.7)), w = o.L / n;
    for (let i = 0; i < n; i++) p.box(ME, -hx + i * w + 0.06, 0.2, hz, -hx + (i + 1) * w - 0.06, 0.205, hz + 0.004, brass, 'yYZ');
    p.pop();
  }
  p.rbox(ME, -hx - 0.006, 0.86, -hz - 0.006, hx + 0.006, 0.9, hz + 0.006, 0.004, brass);                      // ceinture laiton
  p.box(FA, -hx + 0.004, 0.9, -hz + 0.004, hx - 0.004, 0.92, hz - 0.004, o.velvet ?? 0x1d2747, 'Y');          // velours
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(ME, sx * hx - (sx > 0 ? 0.012 : 0), 0.9, sz * hz - (sz > 0 ? 0.012 : 0), sx * hx + (sx < 0 ? 0.012 : 0), top + 0.006, sz * hz + (sz < 0 ? 0.012 : 0), brass, 'xXzZY');
  for (const sx of [-1, 1]) p.box('glass', sx * hx - 0.005, 0.92, -hz + 0.012, sx * hx + 0.005, top, hz - 0.012, 0xffffff, 'xX');  // vitres
  for (const sz of [-1, 1]) p.box('glass', -hx + 0.012, 0.92, sz * hz - 0.005, hx - 0.012, top, sz * hz + 0.005, 0xffffff, 'zZ');
  for (const sz of [-1, 1]) p.box(ME, -hx, top, sz * hz - 0.008, hx, top + 0.008, sz * hz + 0.008, brass, 'YzZ');                 // cadre du couvercle
  for (const sx of [-1, 1]) p.box(ME, sx * hx - 0.008, top, -hz, sx * hx + 0.008, top + 0.008, hz, brass, 'xXY');
}

// ───────────────────────── sièges ─────────────────────────
// Banquette rembourrée (repère : centre de l'emprise, assise vers +z, dossier au fond vers -z).
// o : { L, D, h (assise), color, back (dossier), backH, wall (dossier contre un mur : pas de dos fini), base }
export function banquette(p, o) {
  const hx = o.L / 2, hz = o.D / 2, h = o.h, c = o.color, base = o.base ?? 0x2b1d14, bt = o.back ? 0.14 : 0;
  p.box(woodMat(base), -hx, 0, -hz, hx, 0.08, hz - 0.06, shade(base, -0.3), 'xXzZ');                          // socle en retrait
  p.rbox(woodMat(base), -hx, 0.08, -hz, hx, h - 0.1, hz, 0.006, base, 'xXzZ');
  p.rbox(FA, -hx + 0.005, h - 0.1, -hz + bt, hx - 0.005, h + 0.01, hz + 0.01, 0.04, c, 'xXYzZ');               // coussin d'assise
  p.tube(FA, [-hx + 0.03, h - 0.005, hz + 0.003], [hx - 0.03, h - 0.005, hz + 0.003], 0.006, 5, shade(c, -0.25)); // passepoil
  if (!o.back) return;
  const bh = o.backH ?? 0.55, n = Math.max(1, Math.round(o.L / 0.32)), w = (o.L - 0.01) / n;
  p.push(0, h, -hz + 0.02, 0, -0.1);
  for (let i = 0; i < n; i++) p.rbox(FA, -hx + 0.005 + i * w + 0.004, 0.02, 0.0, -hx + 0.005 + (i + 1) * w - 0.004, bh - 0.02, 0.11, 0.045, c, 'xXyYZ'); // capitons verticaux
  p.pop();
  if (!o.wall) { p.rbox(woodMat(base), -hx, h - 0.1, -hz, hx, h + bh + 0.02, -hz + 0.03, 0.008, base, 'xXyYz'); p.rbox(woodMat(base), -hx - 0.005, h + bh, -hz, hx + 0.005, h + bh + 0.035, -hz + 0.07, 0.01, base, 'xXyYzZ'); }
}
// Canapé (accoudoirs, coussins d'assise et de dossier, petits pieds) — repère de la banquette
export function sofa(p, o) {
  const hx = o.L / 2, hz = o.D / 2, h = o.h, c = o.color, fm = o.mat ?? FA, aw = o.arm ?? 0.2, legs = 0x3b2a1e, n = Math.max(1, Math.round((o.L - 2 * aw) / 0.62)), w = (o.L - 2 * aw) / n;
  p.vg = true; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.taper(WO, sx * (hx - 0.05), sz * (hz - 0.05), 0, 0.08, 0.03, 0.03, 0.04, 0.04, legs); p.vg = false;
  p.rbox(fm, -hx, 0.08, -hz, hx, h - 0.12, hz, 0.02, shade(c, -0.08));                                         // caisse
  for (let i = 0; i < n; i++) p.rbox(fm, -hx + aw + i * w + 0.004, h - 0.13, -hz + 0.16, -hx + aw + (i + 1) * w - 0.004, h, hz + 0.01, 0.05, c);
  p.rbox(fm, -hx, h - 0.13, -hz, hx, h + 0.5, -hz + 0.16, 0.05, shade(c, -0.05), 'xXyYzZ');                       // dossier
  p.push(0, h, -hz + 0.15, 0, -0.16);
  for (let i = 0; i < n; i++) p.rbox(fm, -hx + aw + i * w + 0.006, 0.0, 0.0, -hx + aw + (i + 1) * w - 0.006, 0.44, 0.15, 0.06, c);
  p.pop();
  for (const s of [-1, 1]) p.rbox(fm, s > 0 ? hx - aw : -hx, 0.08, -hz, s > 0 ? hx : -hx + aw, h + 0.24, hz + 0.01, 0.07, shade(c, -0.03)); // accoudoirs
}
// Tabouret de bar (repère : axe au sol) : assise ronde rembourrée, fût chromé, repose-pieds, embase
export function barStool(p, h, c) {
  p.lathe(ME, 0, 0, 0, [[0.2, 0], [0.205, 0.008], [0.2, 0.018], [0.12, 0.03], [0.05, 0.04], [0, 0.04]], 20, CHROME);
  p.cyl(ME, 0, 0.035, 0, 0.026, h - 0.11, 10, CHROME, { top: false, bottom: false });
  p.cyl(FU, 0, h - 0.11, 0, 0.045, 0.04, 10, DARK, { bottom: false, top: false, r1: 0.06 });
  p.sweep(ME, Array.from({ length: 16 }, (_, i) => [Math.cos(i / 16 * Math.PI * 2) * 0.16, h * 0.4, Math.sin(i / 16 * Math.PI * 2) * 0.16]), 0.01, 6, CHROME, { closed: true });
  for (const a of [0.4, 2.5, 4.6]) p.tube(ME, [Math.cos(a) * 0.03, h * 0.4, Math.sin(a) * 0.03], [Math.cos(a) * 0.155, h * 0.4, Math.sin(a) * 0.155], 0.007, 5, CHROME);
  p.cyl(FU, 0, h - 0.075, 0, 0.15, 0.02, 14, DARK, { bottom: true });
  p.lathe(FA, 0, h - 0.06, 0, [[0, 0], [0.165, 0], [0.175, 0.025], [0.17, 0.05], [0.14, 0.065], [0, 0.07]], 18, c);
}
// Chaise en bois (repère : centre de l'assise au sol, face avant vers +z, dossier vers -z)
export function chair(p, c, o = {}) {
  const m = woodMat(c), sh = 0.45, legs = shade(c, -0.12);
  p.vg = true;
  for (const sx of [-1, 1]) {
    p.taper(m, sx * 0.175, 0.17, 0, sh - 0.03, 0.026, 0.026, 0.034, 0.034, legs);                               // pieds avant
    p.hexa(m, [[sx * 0.175 - 0.014, 0, -0.2], [sx * 0.175 + 0.014, 0, -0.2], [sx * 0.175 + 0.017, 0, -0.17], [sx * 0.175 - 0.017, 0, -0.17],
      [sx * 0.175 - 0.014, 0.9, -0.24], [sx * 0.175 + 0.014, 0.9, -0.24], [sx * 0.175 + 0.014, 0.9, -0.212], [sx * 0.175 - 0.014, 0.9, -0.212]], legs, 't0123'); // pieds arrière et montants du dossier
    p.box(m, sx * 0.175 - 0.008, 0.16, -0.17, sx * 0.175 + 0.008, 0.19, 0.17, legs, 'xXyY');                    // barreaux
  }
  p.vg = false;
  p.rbox(m, -0.2, sh - 0.035, -0.2, 0.2, sh, 0.2, 0.012, c);                                                    // assise
  if (o.cushion) p.rbox(FA, -0.18, sh, -0.17, 0.18, sh + 0.035, 0.18, 0.02, o.cushion);
  p.push(0, 0, -0.185, 0, -0.0456);
  p.rbox(m, -0.19, 0.76, -0.015, 0.19, 0.86, 0.015, 0.01, c);                                                   // traverse haute
  for (const x of [-0.08, 0, 0.08]) p.box(m, x - 0.018, sh + 0.04, -0.008, x + 0.018, 0.76, 0.008, c, 'xXzZ'); // barrettes
  p.box(m, -0.17, sh + 0.02, -0.012, 0.17, sh + 0.06, 0.012, c, 'xXyYzZ');
  p.pop();
}
// Fauteuil de cinéma (repère : centre de l'assise sur le gradin, face à l'écran vers +z) ; accoudoirs posés à part
export function cinemaSeat(p, c) {
  p.box(FU, -0.19, 0.12, -0.12, 0.19, 0.36, 0.14, 0x1d1d22, 'xXzZ');                                           // coque sous l'assise
  p.rbox(FA, -0.235, 0.36, -0.16, 0.235, 0.47, 0.27, 0.045, c, 'xXYzZ');                                                 // assise
  p.push(0, 0.42, -0.2, 0, -0.2);
  p.rbox(FA, -0.24, 0.0, -0.02, 0.24, 0.62, 0.1, 0.06, c, 'xXyYZ');                                                       // dossier
  p.box(FU, -0.245, 0.0, -0.07, 0.245, 0.64, -0.02, 0x1d1d22, 'xXyYz');                                          // coque arrière
  p.pop();
}
// Accoudoir de cinéma (montant + manchette + porte-gobelet), centré en x
export function cinemaArm(p, c) {
  p.box(FU, -0.025, 0, -0.18, 0.025, 0.6, 0.2, 0x1d1d22, 'xXzZ');
  p.rbox(FA, -0.035, 0.6, -0.2, 0.035, 0.65, 0.25, 0.02, shade(c, -0.35), 'xXYzZ');
  p.lathe(FU, 0, 0.58, 0.29, [[0.034, 0], [0.04, 0.07], [0.034, 0.07], [0.028, 0.012], [0, 0.012]], 8, 0x1d1d22);
}

// ───────────────────────── portants, vêtements, cabines ─────────────────────────
// Vêtement sur cintre (repère : milieu de l'encolure, épaules le long de x, épaisseur en z) : corps souple (deux
// nappes bombées qui se rejoignent sur les côtés, épaules tombantes, plis), manches tubulaires.
// GARMENT : [demi-largeurs de l'encolure à l'ourlet, longueur, épaisseur, longueur de manche (0 : sans)]
const GARMENT = {
  tee: [[0.085, 0.2, 0.2, 0.19, 0.19, 0.19], 0.68, 0.05, 0.22],
  dress: [[0.08, 0.16, 0.15, 0.13, 0.18, 0.25], 0.95, 0.045, 0],
  coat: [[0.09, 0.235, 0.23, 0.22, 0.215, 0.21], 0.86, 0.07, 0.6],
  pants: [[0.2, 0.205, 0.205, 0.2, 0.2, 0.2], 0.56, 0.04, 0],
};
export function garment(p, kind, c, rnd = Math.random) {
  const [wp, len, T, sl] = GARMENT[kind] || GARMENT.tee, n = wp.length - 1, ph = rnd() * 6;
  const W = (t) => { const f = t * n, i = Math.min(n - 1, Math.floor(f)), k = f - i; return wp[i] + (wp[i + 1] - wp[i]) * k; };
  for (const sd of [1, -1]) p.sheet(FA, (s, t) => {
    const e = 2 * s - 1, x = e * W(t), drop = kind === 'pants' ? 0 : 0.045 * Math.min(1, Math.abs(e) * 1.4);
    const z = sd * (T / 2) * Math.sqrt(Math.max(0, 1 - e * e)) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.3))) + 0.005 * Math.sin(t * 17 + e * 3 + ph) * (1 - Math.abs(e));
    return [x, -drop - t * len, z];
  }, 6, 8, c, { flip: sd > 0 });
  if (sl > 0) for (const e of [-1, 1]) { const x0 = e * (wp[1] - 0.025); p.sweep(FA, [[x0, -0.05, 0], [x0 + e * 0.04, -0.05 - sl * 0.5, 0], [x0 + e * 0.05, -0.05 - sl, 0.005]], 0.045, 6, shade(c, -0.06), { radii: [0.9, 0.82, 0.7] }); }
}
// Portant (repère : x le long de la barre, centré, barre à h) : montants, piètements en T à roulettes, barre, cintres
// et vêtements (couleurs données dans l'ordre, kinds : silhouettes)
export function clothesRail(p, L, h, colors, kinds, rnd = Math.random) {
  const hx = L / 2;
  for (const s of [-1, 1]) {
    const x = s * hx;
    p.cyl(ME, x, 0.06, 0, 0.0125, h - 0.06, 8, CHROME, { bottom: false, top: false });
    p.tube(ME, [x, 0.06, -0.25], [x, 0.06, 0.25], 0.014, 8, CHROME, true);
    for (const z of [-0.23, 0.23]) { p.cyl(FU, x, 0.0, z, 0.022, 0.035, 8, RUBBER); p.box(FU, x - 0.012, 0.035, z - 0.012, x + 0.012, 0.06, z + 0.012, 0x3a3d40, 'xXzZ'); }
    p.lathe(ME, x, h - 0.02, 0, [[0.016, 0], [0.018, 0.02], [0.012, 0.035], [0, 0.04]], 8, CHROME);
  }
  p.tube(ME, [-hx, h - 0.02, 0], [hx, h - 0.02, 0], 0.0125, 8, CHROME);
  colors.forEach((c, k) => {
    const x = -hx + 0.12 + k * (L - 0.24) / Math.max(1, colors.length - 1), kind = kinds[k % kinds.length];
    const hb = h - 0.02, hy = hb - 0.055;
    p.sweep(ME, [[x, hy, 0], [x, hb - 0.022, 0.016], [x, hb + 0.006, 0.022], [x, hb + 0.024, 0.008], [x, hb + 0.024, -0.008], [x, hb + 0.012, -0.02], [x, hb - 0.004, -0.022]], 0.0025, 4, 0xb0b4b8);
    p.box(FU, x - 0.007, hy - 0.022, -0.2, x + 0.007, hy, 0.2, 0x2a2420, 'xXyYzZ');                                  // cintre
    p.push(x, hy - 0.006, 0, Math.PI / 2 + (rnd() - 0.5) * 0.22); garment(p, kind, c, rnd); p.pop();
  });
}
// Rideau à plis (repère : x le long de la tringle, de x0 à x1, du bas y0 au haut y1) ; open : part repliée (0..1)
export function curtain(p, x0, x1, y0, y1, c, open = 0.25, folds = 9) {
  const w = (x1 - x0) * (1 - open), n = Math.max(12, folds * 6);
  p.sheet(FA, (s, t) => { const a = s * folds * Math.PI * 2 + Math.PI / 2, amp = 0.045 + 0.03 * s * open; return [x0 + s * w, y0 + t * (y1 - y0), Math.sin(a) * amp * (1 + (1 - t) * 0.25)]; }, n, 3, c, { both: true, thick: 0.004 });
  for (let k = 0; k <= folds * 2; k += 2) { const x = x0 + k / (folds * 2) * w; p.sweep(ME, Array.from({ length: 6 }, (_, i) => [x, y1 + 0.016 + Math.sin(i / 6 * Math.PI * 2) * 0.016, Math.cos(i / 6 * Math.PI * 2) * 0.016]), 0.003, 4, CHROME, { closed: true }); } // anneaux
}

// ───────────────────────── décor ─────────────────────────
// Plante en pot (repère : centre du pot au sol, échelle s) : pot à lèvre, terreau, tronc, branches, feuillage
export function plant(p, s, pot, rnd) {
  p.lathe(FU, 0, 0, 0, [[0.15 * s, 0], [0.2 * s, 0.38 * s], [0.22 * s, 0.385 * s], [0.22 * s, 0.42 * s], [0.195 * s, 0.42 * s], [0.19 * s, 0.37 * s], [0, 0.37 * s]], 16, pot);
  p.cyl(FU, 0, 0.37 * s, 0, 0.19 * s, 0.01, 12, 0x3a2a1e, { bottom: false });
  const tip = [0, 0.75 * s, 0]; p.tube(FU, [0, 0.37 * s, 0], tip, 0.018 * s, 6, 0x5d4632);
  const greens = [0x2f6a2c, 0x3f7a3a, 0x4f8f45, 0x2a5c2a, 0x5a9a4a];
  for (let b = 0; b < 5; b++) {
    const a = b * 2.4 + rnd() * 0.5, r = (0.12 + rnd() * 0.12) * s, end = [Math.cos(a) * r, (0.95 + rnd() * 0.35) * s, Math.sin(a) * r];
    p.tube(FU, tip, end, 0.008 * s, 4, 0x5d4632);
    for (let k = 0; k < 9; k++) { // feuilles elliptiques double face autour de l'extrémité de la branche
      const t = 0.35 + k / 9 * 0.75, cx = tip[0] + (end[0] - tip[0]) * t, cy = tip[1] + (end[1] - tip[1]) * t, cz = tip[2] + (end[2] - tip[2]) * t;
      const la = rnd() * Math.PI * 2, tilt = -0.3 - rnd() * 0.6, L = (0.11 + rnd() * 0.06) * s, W = L * 0.42, dx = Math.cos(la), dz = Math.sin(la);
      const col = greens[(b + k) % greens.length];
      p.sheet(FU, (u, v) => { const along = u * L, wide = Math.sin(u * Math.PI) * W * (v - 0.5), sag = -u * u * L * 0.35; return [cx + dx * along * Math.cos(tilt) - dz * wide, cy + along * Math.sin(-tilt) * 0.4 + sag, cz + dz * along * Math.cos(tilt) + dx * wide]; }, 3, 1, col, { both: true, thick: 0.002 });
    }
  }
}
// Suspension (repère : point bas du luminaire ; H : hauteur du plafond au-dessus) : rosace, câble, douille, abat-jour
// à double paroi (intérieur clair) ; kind : 'cone' | 'globe' | 'drum'
export function pendantLamp(p, H, c, kind, size) {
  p.cyl(FU, 0, H - 0.025, 0, 0.055, 0.025, 12, 0x1a1a1a, { top: false });
  p.tube(FU, [0, size * 0.75, 0], [0, H - 0.025, 0], 0.003, 4, 0x111111);
  p.cyl(FU, 0, size * 0.62, 0, 0.022, size * 0.14, 8, 0x2a2a2a, { bottom: false });
  if (kind === 'globe') { p.blob(FU, 0, size * 0.3, 0, size * 0.55, size * 0.52, size * 0.55, c, 16, 8); return; }
  const r0 = size * (kind === 'drum' ? 0.6 : 0.65), r1 = size * (kind === 'drum' ? 0.6 : 0.12), y0 = kind === 'drum' ? 0.0 : 0.0, y1 = size * (kind === 'drum' ? 0.6 : 0.68);
  p.lathe(FU, 0, 0, 0, [[r0 - 0.004, y0], [r0, y0], [r0, y0], [r1, y1], [r1, y1], [0, y1 + 0.004]], 18, c);                  // paroi extérieure
  p.lathe(FU, 0, 0, 0, [[0, y1 - 0.004], [r1 - 0.004, y1 - 0.004], [r1 - 0.004, y1 - 0.004], [r0 - 0.004, y0 + 0.002]], 18, kind === 'drum' ? 0xf3ead8 : 0xf2efe8); // intérieur clair
}
// Lampadaire (repère : centre au sol) : socle lesté, tige, abat-jour tambour
export function floorLamp(p, c) {
  p.lathe(FU, 0, 0, 0, [[0.15, 0], [0.15, 0.012], [0.13, 0.03], [0.02, 0.035], [0, 0.035]], 16, 0x222222);
  p.cyl(ME, 0, 0.035, 0, 0.012, 1.45, 8, 0x8a7a5a, { bottom: false, top: false });
  p.lathe(FU, 0, 1.47, 0, [[0.24, 0], [0.24, 0], [0.18, 0.3], [0.18, 0.3], [0.175, 0.3], [0.235, 0.002]], 18, c);
}
// Cadre (repère : centre du tableau sur le mur, face vers +z) : moulure de largeur fw autour d'une ouverture w × h
export function frame(p, w, h, fw, depth, c) {
  const m = woodMat(c), hw = w / 2 + fw, hh = h / 2 + fw;
  p.rbox(m, -hw, -hh, 0, hw, -h / 2, depth, 0.004, c, 'xXyYZ'); p.rbox(m, -hw, h / 2, 0, hw, hh, depth, 0.004, c, 'xXyYZ');
  p.rbox(m, -hw, -h / 2, 0, -w / 2, h / 2, depth, 0.004, c, 'xXZ'); p.rbox(m, w / 2, -h / 2, 0, hw, h / 2, depth, 0.004, c, 'xXZ');
}

// ───────────────────────── présentoirs, bureaux, pièces de magasin ─────────────────────────
// Podium plein (repère : centre, dessus à h) : socle en retrait, caisson, plateau à chant adouci
export function podium(p, w, d, h, c) {
  const hw = w / 2, hd = d / 2, m = woodMat(c);
  p.box(FU, -hw + 0.03, 0, -hd + 0.03, hw - 0.03, 0.06, hd - 0.03, DARK, 'xXzZ');
  p.rbox(m, -hw + 0.008, 0.06, -hd + 0.008, hw - 0.008, h - 0.03, hd - 0.008, 0.006, c, 'xXyzZ');
  p.rbox(m, -hw, h - 0.03, -hd, hw, h, hd, 0.008, shade(c, woody(c) ? 0.05 : -0.04));
}
// Étal de primeur en bois (repère : centre, plateau à h) : poteaux d'angle, bardage à claire-voie, rebord, tablette basse
export function stall(p, w, d, h, c) {
  const hw = w / 2, hd = d / 2, dk = shade(c, -0.2);
  p.vg = true; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(WO, sx * hw - (sx > 0 ? 0.06 : 0), 0, sz * hd - (sz > 0 ? 0.06 : 0), sx * hw + (sx < 0 ? 0.06 : 0), h - 0.03, sz * hd + (sz < 0 ? 0.06 : 0), dk, 'xXzZ'); p.vg = false;
  for (let y = 0.14; y < h - 0.12; y += 0.16) {
    for (const s of [-1, 1]) { p.box(WO, -hw + 0.06, y, s * hd - 0.01, hw - 0.06, y + 0.1, s * hd + 0.01, c, 'yYzZ'); p.box(WO, s * hw - 0.01, y, -hd + 0.06, s * hw + 0.01, y + 0.1, hd - 0.06, c, 'xXyY'); }
  }
  p.box(WO, -hw + 0.06, 0.1, -hd + 0.06, hw - 0.06, 0.12, hd - 0.06, dk, 'Y');
  for (let x = -hw; x < hw - 0.01; x += 0.12) p.box(WO, x + 0.004, h - 0.03, -hd, Math.min(hw, x + 0.12) - 0.004, h, hd, c, 'xXyYzZ'); // lattes du plateau
  for (const s of [-1, 1]) { p.rbox(WO, -hw, h, s * hd - (s > 0 ? 0.015 : 0), hw, h + 0.025, s * hd + (s < 0 ? 0.015 : 0), 0.004, dk, 'xXYzZ'); p.rbox(WO, s * hw - (s > 0 ? 0.015 : 0), h, -hd + 0.015, s * hw + (s < 0 ? 0.015 : 0), h + 0.025, hd - 0.015, 0.004, dk, 'xXYzZ'); }
}
// Bureau (repère : centre, utilisateur côté +z, dessus à h) : plateau, joues, voile de fond, caisson à trois tiroirs
export function desk(p, L, D, h, c, o = {}) {
  const hx = L / 2, hz = D / 2, m = woodMat(c), fr = o.frame ?? c, fm = woodMat(fr);
  p.rbox(m, -hx, h - 0.03, -hz, hx, h, hz, 0.005, c);
  p.box(fm, -hx + 0.01, 0, -hz + 0.02, -hx + 0.035, h - 0.03, hz - 0.02, fr, 'xXzZ');
  p.box(fm, -hx + 0.035, 0.3, -hz + 0.03, hx - 0.03, h - 0.03, -hz + 0.048, fr, 'yzZ');
  const px = hx - 0.44;
  p.box(fm, px, 0, -hz + 0.03, hx - 0.01, h - 0.03, hz - 0.03, fr, 'xXz');
  for (let i = 0; i < 3; i++) front(p, fm, px, 0.02 + i * (h - 0.06) / 3, hx - 0.01, 0.02 + (i + 1) * (h - 0.06) / 3, hz - 0.03, fr, { drawer: true });
  p.box(FU, px, 0, hz - 0.03, hx - 0.01, 0.02, hz - 0.01, DARK, 'YZ');
}
// Bacs à bonbons d'un gradin (repère du meuble mural) : bacs en plexiglas, bonbons en tas, contremarche vers le gradin
// inférieur (prev = [hauteur, profondeur] du gradin du dessous)
export function candyBins(p, L, h, d, fill, prev) {
  const hx = L / 2, n = fill.length, w = L / n, white = 0xf6f6f6;
  if (prev) { p.box(FU, -hx, prev[0] + 0.03, d - 0.012, hx, h - 0.03, d, white, 'xXZ'); p.rbox(FU, -hx, h - 0.03, 0.01, hx, h, d, 0.004, white, 'xXyYZ'); }
  p.box(FU, -hx, h - 0.028, d, hx, h - 0.006, d + 0.002, 0xf8bbd0, 'Z');                                      // bandeau d'étiquettes
  for (let k = 0; k < n; k++) {
    const a = -hx + k * w, b = a + w;
    p.box(FU, a + 0.01, h - 0.004, 0.02, b - 0.01, h + 0.03, d - 0.014, fill[k], 'xXzZ');                          // tas de bonbons : flancs, dessus bosselé
    p.sheet(FU, (s, t) => { const x = a + 0.01 + s * (w - 0.02), z = 0.02 + t * (d - 0.034), e = Math.sin(s * Math.PI) * Math.sin(t * Math.PI); return [x, h + 0.03 + e * 0.022 + 0.006 * Math.sin(x * 97 + z * 61) * Math.sin(z * 83 - x * 41), z]; }, 6, 4, fill[k], { flip: true });
    p.box('glass', a + 0.004, h, d - 0.006, b - 0.004, h + 0.09, d, 0xffffff, 'zZ');                         // façade en plexiglas
    p.box('glass', a - 0.002, h, 0.02, a + 0.002, h + 0.09, d - 0.006, 0xffffff, 'xX');                      // séparation
    p.box(FU, (a + b) / 2 - 0.03, h - 0.024, d + 0.002, (a + b) / 2 + 0.03, h - 0.01, d + 0.003, 0xffffff, 'Z');
  }
  p.box('glass', hx - 0.002, h, 0.02, hx + 0.002, h + 0.09, d - 0.006, 0xffffff, 'xX');
}
// Cloison de cabine (repère : centre, x le long) : panneau à chants adoucis, plinthe, couvre-chant haut
export function partitionWall(p, L, T, h, c) {
  const hx = L / 2, hz = T / 2;
  p.rbox(woodMat(c), -hx, 0.08, -hz, hx, h - 0.02, hz, 0.006, c, 'xXzZ');
  p.box(FU, -hx, 0, -hz - 0.006, hx, 0.08, hz + 0.006, 0x3a3a3a, 'xXYzZ');
  p.rbox(ME, -hx - 0.005, h - 0.02, -hz - 0.006, hx + 0.005, h, hz + 0.006, 0.006, 0xbfc3c7);
}
// Cabine d'essayage (repère : centre de l'entrée au sol, intérieur vers -z ; largeur w, profondeur d) : joues pleines,
// fronton, tringle et rideau à plis tiré, miroir, patère, tabouret. open : part du rideau repliée (l'entrée de la
// cabine). Renvoie les emprises (repère de la cabine) du rideau tiré et du pouf, pour leurs boîtes de collision.
export function fittingRoom(p, w, d, c, curtainC, rnd, open = 0.25 + rnd() * 0.3) {
  const hx = w / 2, wood = woodMat(c), c0 = -hx + 0.07, c1 = hx - 0.07;
  for (const s of [-1, 1]) p.rbox(wood, s * hx - (s > 0 ? 0.06 : 0), 0, -d - 0.04, s * hx + (s < 0 ? 0.06 : 0), 2.2, 0, 0.008, c, 'xXYZ'); // joues (jusqu'au mur)
  p.rbox(wood, -hx, 2.0, -0.06, hx, 2.2, 0.0, 0.006, c, 'yzZ');                                                // fronton
  p.tube(ME, [-hx + 0.06, 1.97, -0.03], [hx - 0.06, 1.97, -0.03], 0.012, 8, CHROME);
  p.push(0, 0, -0.03); curtain(p, c0, c1, 0.12, 1.94, curtainC, open, 8); p.pop();
  p.box(FU, -0.28, 0.35, -d - 0.04, 0.28, 1.95, -d + 0.02, 0x2b2b2b, 'xXyYZ');                                   // miroir
  p.box('chrome', -0.25, 0.38, -d + 0.02, 0.25, 1.92, -d + 0.024, 0xffffff, 'Z');
  for (const s of [-1, 1]) { p.push(s * (hx - 0.06), 1.7, -d * 0.5, s > 0 ? -Math.PI / 2 : Math.PI / 2); p.sweep(ME, [[0, 0, 0], [0, 0, 0.04], [0, 0.03, 0.06]], 0.006, 5, CHROME); p.pop(); } // patères
  p.push(hx - 0.3, 0, -d + 0.35); pouf(p, 0.36, 0.36, 0.42, shade(curtainC, -0.3)); p.pop();
  return { curtain: [c0, -0.11, c0 + (c1 - c0) * (1 - open), 0.05], pouf: [hx - 0.48, -d + 0.17, hx - 0.12, -d + 0.53] };
}
// Cabines de toilettes : séparation sur pieds (repère : centre de la séparation au sol, x le long de la profondeur)
export function wcDivider(p, L, h, c) {
  const hx = L / 2;
  p.rbox(FU, -hx + 0.1, 0.15, -0.013, hx - 0.03, h, 0.013, 0.006, c, 'xXyYzZ');
  p.rbox(FU, hx - 0.1, 0, -0.025, hx, h + 0.1, 0.025, 0.006, shade(c, -0.12), 'xXYzZ');                         // pilastre
  for (const x of [-hx + 0.25, hx - 0.25]) { p.cyl(ME, x, 0, 0, 0.018, 0.15, 8, CHROME, { bottom: false }); }
}
// Porte de cabine ouverte (repère : charnière au sol, porte rabattue le long de x)
export function wcDoor(p, w, h, c) {
  p.rbox(FU, 0.005, 0.15, -0.013, w - 0.005, h, 0.013, 0.006, c);
  handleBar(p, w - 0.06, 1.0, 0.013, 0.12, true);
  p.box(ME, w - 0.09, 0.95, -0.03, w - 0.03, 0.99, -0.013, 0x9aa0a6, 'xXyYz');                                    // verrou
}
// Contremarche de gradin de cinéma (repère : centre, x le long, nez de marche vers +z) : moquette, nez alu, balisage
export function cinemaStep(p, L, D, h, c) {
  const hx = L / 2, hz = D / 2;
  p.box(FU, -hx, 0, -hz, hx, h - 0.01, hz, c, 'xXzZ');
  p.box(FA, -hx, h - 0.01, -hz, hx, h, hz - 0.03, shade(c, 0.15), 'Y');
  p.rbox(ME, -hx, h - 0.03, hz - 0.03, hx, h, hz + 0.004, 0.005, 0x9aa0a6, 'yYZ');                                 // nez de marche
  for (let x = -hx + 0.8; x < hx - 0.5; x += 1.6) p.box(FU, x, h - 0.06, hz, x + 0.05, h - 0.045, hz + 0.002, 0xffe9a8, 'Z'); // balisage
}
// Garde-corps de gradins (repère : x = 0 dans le plan du garde-corps, z le long ; pts = [[z, y]…] points d'appui sur
// les nez de marche puis le palier, du bas vers le haut) : poteaux, main courante et lisse qui suivent la pente
export function stairRail(p, pts, h, c = 0x9aa0a6) {
  p.sweep(ME, pts.map(([z, y]) => [0, y + h, z]), 0.022, 8, c);
  p.sweep(ME, pts.map(([z, y]) => [0, y + h * 0.5, z]), 0.012, 6, c);
  for (const [z, y] of pts) { p.cyl(ME, 0, y, z, 0.02, h, 8, c, { bottom: false, top: false }); p.cyl(ME, 0, y, z, 0.04, 0.012, 10, c, { bottom: false }); }
}
// Stand de clavier (repère : centre au sol, x le long du clavier, musicien vers +z ; dessus des bras à h) : deux
// montants sur pieds en T, bras porteurs à embouts caoutchouc, entretoise basse
export function keyboardStand(p, w, h, c = 0x26292c) {
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.12);
    p.tube(ME, [x, 0.022, -0.24], [x, 0.022, 0.24], 0.018, 8, c, true);
    for (const z of [-0.24, 0.24]) p.cyl(FU, x, 0, z, 0.024, 0.012, 8, RUBBER);
    p.tube(ME, [x, 0.03, 0], [x, h - 0.03, 0], 0.02, 8, c);
    p.tube(ME, [x, h - 0.015, -0.17], [x, h - 0.015, 0.17], 0.015, 8, c, true);
    for (const z of [-0.17, 0.17]) p.cyl(FU, x, h - 0.03, z, 0.02, 0.03, 8, RUBBER);
  }
  p.tube(ME, [-(w / 2 - 0.12), 0.26, 0], [w / 2 - 0.12, 0.26, 0], 0.016, 8, c);
}
// Cadre de cache d'écran (velours noir) autour d'une ouverture w × h, face vers +z
export function screenMask(p, w, h, c = 0x0b0b0e) {
  const b = 0.35, hw = w / 2, hh = h / 2;
  p.box(FA, -hw - b, -hh - b, 0, hw + b, -hh, 0.06, c, 'xXyYZ'); p.box(FA, -hw - b, hh, 0, hw + b, hh + b, 0.06, c, 'xXyYZ');
  p.box(FA, -hw - b, -hh, 0, -hw, hh, 0.06, c, 'xXZ'); p.box(FA, hw, -hh, 0, hw + b, hh, 0.06, c, 'xXZ');
}
// Estrade de scène (repère : centre, dessus à h) : plancher, jupe de scène, nez alu
export function stage(p, w, d, h, c) {
  const hw = w / 2, hd = d / 2;
  p.box(FA, -hw, 0, -hd, hw, h - 0.02, hd, 0x141414, 'xXzZ');
  p.box(WO, -hw, h - 0.02, -hd, hw, h, hd, c, 'Y');
  for (const s of [-1, 1]) { p.rbox(ME, -hw, h - 0.025, s * hd - (s > 0 ? 0.02 : 0), hw, h + 0.002, s * hd + (s < 0 ? 0.02 : 0), 0.004, 0x8a9096, 'xXyYzZ'); p.rbox(ME, s * hw - (s > 0 ? 0.02 : 0), h - 0.025, -hd, s * hw + (s < 0 ? 0.02 : 0), h + 0.002, hd, 0.004, 0x8a9096, 'xXyYzZ'); }
}
// Balance de pharmacie (repère : centre, face vers +z) : plateau, colonne, tête à afficheur
export function scale(p, c) {
  p.rbox(FU, -0.3, 0, -0.2, 0.3, 0.07, 0.2, 0.02, c);
  p.box(FA, -0.26, 0.07, -0.16, 0.26, 0.075, 0.16, 0x37474f, 'Y');
  p.rbox(FU, -0.07, 0.07, -0.2, 0.07, 1.0, -0.12, 0.02, c, 'xXYzZ');
  p.rbox(FU, -0.26, 0.95, -0.22, 0.26, 1.25, -0.1, 0.03, c);
  p.box(FU, -0.2, 1.0, -0.1, 0.2, 1.2, -0.098, 0x263238, 'Z');
  p.box(FU, -0.12, 1.08, -0.098, 0.12, 1.15, -0.097, 0x0e3a2a, 'Z');
}
// Présentoir à cartes postales tournant (repère : axe au sol) : mât, quatre étages de poches grillagées, cartes
export function postcardSpinner(p, colors) {
  p.lathe(FU, 0, 0, 0, [[0.25, 0], [0.25, 0.02], [0.05, 0.04], [0, 0.045]], 14, DARK);
  p.cyl(ME, 0, 0.04, 0, 0.018, 1.71, 8, CHROME, { bottom: false });
  colors.forEach((c, i) => {
    const y = 0.5 + i * 0.3;
    for (let k = 0; k < 4; k++) {
      p.push(0, y, 0, k * Math.PI / 2);
      p.box(ME, -0.14, 0, 0.18, 0.14, 0.006, 0.24, 0x9aa0a6, 'xXyYzZ');
      for (let j = 0; j < 3; j++) p.box(FU, -0.13 + j * 0.09, 0.006, 0.19 + j * 0.0, -0.05 + j * 0.09, 0.2, 0.2, j === 1 ? c : shade(c, -0.08 * j), 'xXYzZ');
      p.box(ME, -0.14, 0.03, 0.235, 0.14, 0.036, 0.24, 0x9aa0a6, 'yYZ');
      p.pop();
    }
    p.cyl(ME, 0, y - 0.01, 0, 0.2, 0.012, 12, 0x9aa0a6);
  });
}
// Comptoir de jeux (loterie) : caisson, pupitre incliné, présentoirs à bulletins (repère : centre, face vers +z)
export function lotteryStand(p, w, d, c) {
  const hw = w / 2, hd = d / 2;
  p.box(FU, -hw + 0.03, 0, -hd + 0.03, hw - 0.03, 0.08, hd - 0.03, DARK, 'xXzZ');
  p.rbox(FU, -hw, 0.08, -hd, hw, 1.0, hd, 0.01, c, 'xXzZ');
  p.push(0, 1.0, 0, 0, 0.18); p.rbox(FU, -hw - 0.02, 0, -hd - 0.02, hw + 0.02, 0.04, hd + 0.02, 0.012, shade(c, -0.25)); p.box(FU, -hw + 0.04, 0.04, -hd + 0.06, hw - 0.04, 0.042, hd - 0.1, 0xf4f1e6, 'Y'); p.pop();
  for (let i = 0; i < 4; i++) p.box(FU, -hw + 0.08 + i * (w - 0.16) / 4, 0.25, hd, -hw + 0.08 + (i + 1) * (w - 0.16) / 4 - 0.03, 0.85, hd + 0.03, [0xfdd835, 0xffffff, 0xe53935, 0x43a047][i], 'xXYZ');
}
// Bac grillagé à ballons (repère : centre, au sol) : cadre, barreaux, cerceaux
export function ballCage(p, w, d, h, c) {
  const hw = w / 2, hd = d / 2;
  p.rbox(FU, -hw, 0, -hd, hw, 0.06, hd, 0.01, c);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.cyl(ME, sx * (hw - 0.02), 0.06, sz * (hd - 0.02), 0.014, h - 0.06, 6, 0x9aa0a6, { bottom: false });
  for (const y of [0.3, h - 0.01]) p.sweep(ME, [[-hw + 0.02, y, -hd + 0.02], [hw - 0.02, y, -hd + 0.02], [hw - 0.02, y, hd - 0.02], [-hw + 0.02, y, hd - 0.02]], 0.008, 4, 0x9aa0a6, { closed: true });
  for (let x = -hw + 0.12; x < hw - 0.06; x += 0.1) for (const s of [-1, 1]) p.tube(ME, [x, 0.06, s * (hd - 0.02)], [x, h, s * (hd - 0.02)], 0.004, 3, 0x9aa0a6);
  for (let z = -hd + 0.12; z < hd - 0.06; z += 0.1) for (const s of [-1, 1]) p.tube(ME, [s * (hw - 0.02), 0.06, z], [s * (hw - 0.02), h, z], 0.004, 3, 0x9aa0a6);
}
// Borne d'impression photo (repère du meuble mural) : caisson, écran tactile incliné, fentes, tablette
export function photoKiosk(p, w, d, c) {
  const hx = w / 2;
  p.box(FU, -hx + 0.02, 0, 0, hx - 0.02, 0.08, d - 0.05, DARK, 'xXYZ');
  p.rbox(FU, -hx, 0.08, 0.01, hx, 1.0, d, 0.012, c, 'xXYZ');
  p.box(FU, -hx + 0.06, 0.62, d, hx - 0.06, 0.64, d + 0.002, 0x111111, 'Z');                                     // fente de sortie
  for (let i = 0; i < 3; i++) p.box(FU, -hx + 0.08 + i * 0.1, 0.8, d, -hx + 0.15 + i * 0.1, 0.81, d + 0.002, 0x111111, 'Z'); // lecteurs de cartes
  p.push(0, 1.0, d * 0.45, 0, -0.45); p.rbox(FU, -hx + 0.04, 0, -0.03, hx - 0.04, 0.42, 0.02, 0.015, 0x1b1d20); p.box(FU, -hx + 0.07, 0.03, 0.02, hx - 0.07, 0.39, 0.022, 0x0d2d3f, 'Z'); p.pop();
}
// Fond de studio (repère : pied du mur de fond, face vers +z) : rouleau de papier, cyclo arrondi au sol, supports
export function backdrop(p, w, c) {
  const hw = w / 2;
  p.sheet(FU, (s, t) => { const x = -hw + s * w; if (t < 0.6) return [x, 3.0 - t / 0.6 * 2.6, 0.065]; const a = (t - 0.6) / 0.4 * Math.PI / 2; return [x, 0.4 - Math.sin(a) * 0.396, 0.065 + (1 - Math.cos(a)) * 0.4]; }, 1, 8, c, { flip: true });
  p.box(FU, -hw, 0.002, 0.465, hw, 0.004, 1.46, c, 'Y');
  p.tube(FU, [-hw - 0.05, 3.05, 0.09], [hw + 0.05, 3.05, 0.09], 0.06, 12, c, true);
  for (const s of [-1, 1]) { p.tube(ME, [s * (hw + 0.1), 0, 0.09], [s * (hw + 0.1), 3.12, 0.09], 0.016, 6, 0x222222); p.box(FU, s * (hw + 0.1) - 0.04, 3.0, 0.04, s * (hw + 0.1) + 0.04, 3.12, 0.14, 0x222222, 'xXyYzZ'); }
}
// Boîte à lumière sur trépied (repère : pied, face vers +z) ; tilt : plongée de la tête
export function softbox(p, h, c, tilt = 0.25) {
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; p.tube(ME, [Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38], [0, 0.75, 0], 0.01, 4, 0x222222); }
  p.tube(ME, [0, 0.7, 0], [0, h, 0], 0.014, 6, 0x222222);
  p.push(0, h, 0, 0, Math.PI / 2 + tilt);
  p.lathe(FU, 0, 0, 0, [[0.06, -0.12], [0.42, 0.18], [0.42, 0.18], [0.0, 0.18]], 4, 0x1a1a1a, { a0: Math.PI / 4, a1: Math.PI * 2 + Math.PI / 4 });
  p.box(FU, -0.29, 0.181, -0.29, 0.29, 0.183, 0.29, c, 'Y');
  p.pop();
}
// Sucette géante (repère : pied du bâton) : bâton, disque en spirale bicolore
export function lollipop(p, h, c) {
  p.tube(FU, [0, 0, 0], [0, h - 0.3, 0], 0.018, 8, 0xfafafa, true);
  p.push(0, h, 0, 0, Math.PI / 2);
  p.cyl(FU, 0, -0.03, 0, 0.32, 0.06, 28, 0xfafafa);
  const pts = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 6, r = 0.03 + i / 60 * 0.27; pts.push([Math.cos(a) * r, 0.031, Math.sin(a) * r]); }
  p.sweep(FU, pts, 0.022, 5, c);
  p.sweep(FU, pts.map(([x, y, z]) => [x, -y, z]), 0.022, 5, c);
  p.pop();
}
// Seau de fleuriste en zinc (repère : centre au sol) : seau à lèvre et oreilles, tiges, fleurs, feuillage. Zinc
// galvanisé mat (matériau standard teinté) : en métal poli, le seau renvoyait tout l'éclairage et paraissait blanc.
export function flowerBucket(p, colors, rnd) {
  p.lathe(FU, 0, 0, 0, [[0.16, 0], [0.16, 0.01], [0.2, 0.4], [0.212, 0.42], [0.2, 0.425], [0.19, 0.4], [0.16, 0.03], [0, 0.03]], 16, 0x7d858c);
  for (const y of [0.13, 0.28]) p.lathe(FU, 0, y, 0, [[0.16 + y * 0.1 - 0.002, 0], [0.164 + y * 0.1, 0.006], [0.164 + y * 0.1, 0.014], [0.16 + y * 0.1 - 0.002, 0.02]], 16, 0x6c747a); // cerclages
  p.cyl(FU, 0, 0.36, 0, 0.19, 0.01, 12, 0x3b2f22, { bottom: false });                                         // eau trouble / mousse
  colors.forEach((c, k) => {
    const a = k * 1.3 + rnd() * 0.4, r = 0.05 + rnd() * 0.07, top = [Math.cos(a) * (r + 0.08), 0.62 + (k % 2) * 0.08 + rnd() * 0.06, Math.sin(a) * (r + 0.08)];
    p.tube(FU, [Math.cos(a) * r * 0.5, 0.36, Math.sin(a) * r * 0.5], top, 0.005, 3, 0x3f7a3a);
    p.blob(FU, top[0], top[1] + 0.02, top[2], 0.045, 0.03, 0.045, c, 8, 3);
    p.blob(FU, top[0], top[1] + 0.045, top[2], 0.018, 0.012, 0.018, shade(c, -0.3), 6, 2);
  });
  for (let k = 0; k < 6; k++) { const a = k * 1.05; p.sheet(FU, (u, v) => [Math.cos(a) * (0.05 + u * 0.18), 0.38 + u * 0.22 - u * u * 0.12, Math.sin(a) * (0.05 + u * 0.18) + (v - 0.5) * 0.05 * Math.sin(u * Math.PI)], 3, 1, 0x4f8f45, { both: true, thick: 0.002 }); }
}
// Pouf (repère : centre au sol)
export function pouf(p, w, d, h, c) { p.rbox(FA, -w / 2, 0.03, -d / 2, w / 2, h, d / 2, 0.05, c); p.box(FU, -w / 2 + 0.03, 0, -d / 2 + 0.03, w / 2 - 0.03, 0.03, d / 2 - 0.03, 0x2a2a2a, 'xXzZ'); }
// Établi de réparation contre un mur (repère du meuble mural, dessus à h) : piètement acier, plateau, caisson, tablette basse
export function workbench(p, L, d, h, c, top) {
  const hx = L / 2;
  for (const x of [-hx + 0.04, hx - 0.04]) for (const z of [0.05, d - 0.05]) p.box(FU, x - 0.02, 0, z - 0.02, x + 0.02, h - 0.03, z + 0.02, 0x8a9096, 'xXzZ');
  p.box(FU, -hx + 0.02, 0.18, 0.04, hx - 0.02, 0.2, d - 0.04, 0x8a9096, 'yYZ');
  p.rbox(FU, -hx, h - 0.03, 0.0, hx, h, d, 0.006, top);
  for (let x = -hx + 0.1; x < hx - 0.6; x += 1.4) { p.box(FU, x, 0.2, 0.05, x + 0.5, h - 0.04, d - 0.04, c, 'xXZ'); for (let i = 0; i < 3; i++) front(p, FU, x, 0.2 + i * (h - 0.24) / 3, x + 0.5, 0.2 + (i + 1) * (h - 0.24) / 3, d - 0.04, c, { drawer: true }); }
}
// Bureau de conseil (opticien) : caisson laqué, plateau chêne, miroir sur pied (repère : centre, client vers +z)
export function consultDesk(p, w, d, c, top) {
  const hw = w / 2, hd = d / 2;
  p.box(FU, -hw + 0.03, 0, -hd + 0.03, hw - 0.03, 0.06, hd - 0.03, DARK, 'xXzZ');
  p.rbox(FU, -hw, 0.06, -hd, hw, 0.75, hd, 0.006, c, 'xXzZ');
  p.rbox(woodMat(top), -hw - 0.02, 0.75, -hd - 0.02, hw + 0.02, 0.78, hd + 0.02, 0.008, top);
  p.cyl(ME, -hw + 0.65, 0.78, hd - 0.1, 0.06, 0.012, 12, CHROME);
  p.tube(ME, [-hw + 0.65, 0.79, hd - 0.1], [-hw + 0.65, 1.0, hd - 0.1], 0.006, 5, CHROME);
  p.push(-hw + 0.65, 1.08, hd - 0.1, 0, Math.PI / 2 - 0.15); p.cyl(ME, 0, -0.008, 0, 0.11, 0.016, 18, CHROME); p.cyl('chrome', 0, 0.008, 0, 0.1, 0.001, 18, 0xffffff, { bottom: false }); p.pop();
}
// Cabine de projection (repère : centre, écran vers +z) : caisson peint, lucarne, grille de ventilation, porte
export function projBooth(p, w, d, h, c) {
  const hw = w / 2, hd = d / 2;
  p.rbox(FU, -hw, 0, -hd, hw, h, hd, 0.01, c, 'xXYzZ');
  p.box(FU, -0.2, h - 0.6, hd, 0.2, h - 0.35, hd + 0.004, 0x0a0c10, 'Z'); p.box('glass', -0.18, h - 0.58, hd + 0.004, 0.18, h - 0.37, hd + 0.006, 0xffffff, 'Z');
  for (let k = 0; k < 6; k++) p.box(FU, -0.5, 0.4 + k * 0.03, -hd - 0.004, -0.2, 0.41 + k * 0.03, -hd, 0x15171a, 'z');
  p.box(FU, 0.05, 0.0, -hd - 0.004, 0.75, 2.0, -hd, shade(c, -0.15), 'z');
  p.push(0, 0, 0, Math.PI); handleBar(p, -0.68, 1.0, hd + 0.004, 0.12, true); p.pop();
}

// ───────────────────────── façades et huisseries ─────────────────────────
// Repère : axes du monde, origine au pied de la façade dans le plan du vitrage (z = 0), x = x monde.
// Allège : socle en aluminium, nez arrondi, joints de vitrage noirs de part et d'autre de la glace
export function sill(p, a, b) {
  p.box('aluminium', a, 0, -0.1, b, 0.125, 0.1, 0, 'xXzZ');
  p.rbox('aluminium', a, 0.12, -0.12, b, 0.15, 0.12, 0.012, 0, 'xXyYzZ');
  p.box(FU, a, 0.005, -0.103, b, 0.1, -0.1, 0x8f959b, 'z'); p.box(FU, a, 0.005, 0.1, b, 0.1, 0.103, 0x8f959b, 'Z'); // tôle de soubassement
  for (const s of [-1, 1]) p.box(FU, a, 0.15, s > 0 ? 0.003 : -0.012, b, 0.163, s > 0 ? 0.012 : -0.003, RUBBER, 'xXYzZ');
}
// Imposte (traverse haute) : profilé à chants arrondis, parclose sous la traverse, joints
export function transom(p, a, b, ft) {
  p.rbox('aluminium', a, ft, -0.12, b, ft + 0.2, 0.12, 0.01, 0);
  for (const s of [-1, 1]) p.box(FU, a, ft - 0.013, s > 0 ? 0.003 : -0.012, b, ft, s > 0 ? 0.012 : -0.003, RUBBER, 'xXyzZ');
}
// Meneau entre deux glaces (âme + capots clipsés des deux côtés, joints)
export function mullion(p, x, ft) {
  p.box('aluminium', x - 0.024, 0.15, -0.05, x + 0.024, ft, 0.05, 0, 'xX');
  for (const s of [-1, 1]) {
    p.rbox('aluminium', x - 0.034, 0.15, s > 0 ? 0.045 : -0.07, x + 0.034, ft, s > 0 ? 0.07 : -0.045, 0.008, 0, 'xXzZ');
    for (const e of [-1, 1]) p.box(FU, x + e * 0.034 - (e > 0 ? 0 : 0.004), 0.15, s > 0 ? 0.003 : -0.045, x + e * 0.034 + (e > 0 ? 0.004 : 0), ft, s > 0 ? 0.045 : -0.003, RUBBER, e > 0 ? 'X' : 'x');
  }
}
// Poteau d'entrée habillé d'aluminium avec la coulisse en U du rideau métallique (ailes de part et d'autre du tablier)
export function shutterPost(p, ex, s, ft) {
  const lo = s < 0 ? ex - 0.08 : ex, hi = s < 0 ? ex : ex + 0.08;
  p.rbox('aluminium', lo, 0, -0.1, hi, ft, 0.1, 0.012, 0, 'xXYzZ');
  const a = s < 0 ? ex - 0.012 : ex - 0.028, b = s < 0 ? ex + 0.028 : ex + 0.012;
  for (const z of [-1, 1]) p.box(FU, a, 0, z > 0 ? 0.038 : -0.05, b, ft, z > 0 ? 0.05 : -0.038, 0x5d6268, 'xXzZ');
  p.box(FU, a, 0, -0.05, b, 0.012, 0.05, 0x3a3e43, 'xXYzZ');                                                  // sabot bas
}
// Huisserie de porte (repère : axes du monde, origine au pied de la baie, centre de l'épaisseur du mur) : ébrasements,
// linteau et chambranles sur les deux faces ; w : largeur de la baie, h : hauteur, t : épaisseur du mur, lin : ébrasement
export function doorCasing(p, w, h, t, c, o = {}) {
  const hw = w / 2, lin = o.lining ?? 0.05, aw = o.arch ?? 0.07, ad = 0.015, m = woodMat(c), f0 = o.face0 ?? t / 2, f1 = o.face1 ?? t / 2;
  if (lin > 0) {
    for (const s of [-1, 1]) p.rbox(m, s > 0 ? hw - lin : -hw, 0, -t / 2, s > 0 ? hw : -hw + lin, h, t / 2, 0.003, c, s > 0 ? 'xYzZ' : 'XYzZ');
    p.box(m, -hw, h - lin, -t / 2, hw, h, t / 2, c, 'yzZ');
  }
  for (const [z, s] of [[-f0, -1], [f1, 1]]) {
    const za = s > 0 ? z : z - ad, zb = s > 0 ? z + ad : z;
    for (const e of [-1, 1]) p.rbox(m, e > 0 ? hw : -hw - aw, 0, za, e > 0 ? hw + aw : -hw, h + aw, zb, 0.004, c, s > 0 ? 'xXYZ' : 'xXYz');
    p.rbox(m, -hw, h, za, hw, h + aw, zb, 0.004, c, s > 0 ? 'yYZ' : 'yYz');
  }
}
// Portique antivol (repère : centre du pied au sol, x à travers, z le long du portique) : socle arrondi, deux montants
// ronds en aluminium, traverse haute (le bandeau lumineux est posé dessus à part), panneau en plexiglas sérigraphié
export function gatePedestal(p, h, ink) {
  p.rbox(FU, -0.06, 0, -0.34, 0.06, 0.1, 0.34, 0.025, 0x2a2c30, 'xXYzZ');
  p.box(FU, -0.075, 0, -0.36, 0.075, 0.008, 0.36, 0x1a1b1d, 'xXYzZ');                                           // semelle
  for (const z of [-0.29, 0.29]) p.cyl(ME, 0, 0.1, z, 0.024, h - 0.17, 12, 0xbcc1c6, { bottom: false, top: false });
  p.rbox(ME, -0.035, h - 0.08, -0.32, 0.035, h, 0.32, 0.02, 0xbcc1c6);
  p.box('glass', -0.008, 0.1, -0.265, 0.008, h - 0.08, 0.265, 0xffffff, 'xXyYzZ');
  for (const [a0, a1, b0, b1] of [[0.24, 0.26, -0.2, 0.2], [h - 0.22, h - 0.2, -0.2, 0.2], [0.24, h - 0.2, -0.2, -0.185], [0.24, h - 0.2, 0.185, 0.2]]) p.box(FU, -0.0095, a0, b0, 0.0095, a1, b1, ink, 'xX'); // boucle d'antenne
}
// Diffuseur de soufflage carré (repère : centre au plafond) : cadre, ailettes concentriques
export function diffuser(p, s = 0.6) {
  const c = 0xe9e9e6;
  for (let k = 0; k < 4; k++) {
    const h = s / 2 - k * 0.07, w = 0.025, y0 = -0.012 - k * 0.012;
    p.box(FU, -h, y0, -h, h, 0, -h + w, c, 'xXyzZ'); p.box(FU, -h, y0, h - w, h, 0, h, c, 'xXyzZ');
    p.box(FU, -h, y0, -h + w, -h + w, 0, h - w, c, 'xXy'); p.box(FU, h - w, y0, -h + w, h, 0, h - w, c, 'xXy');
  }
  p.box(FU, -s / 2 + 0.28, -0.002, -s / 2 + 0.28, s / 2 - 0.28, 0, s / 2 - 0.28, 0x1a1a1a, 'y');
}
// Tête de sprinkler pendante (repère : point au plafond)
export function sprinkler(p) {
  p.cyl(ME, 0, -0.012, 0, 0.035, 0.012, 10, 0xd8d8d0, { top: false });
  p.cyl(ME, 0, -0.04, 0, 0.007, 0.028, 6, 0xc9a227, { top: false, bottom: false });
  p.cyl(ME, 0, -0.05, 0, 0.018, 0.006, 8, 0xc9a227);
  p.cyl(FU, 0, -0.043, 0, 0.004, 0.006, 4, 0xd32f2f);
}
// Terminal de paiement sur pied pivotant (repère : pied sur le comptoir, client vers +z)
export function cardTerminal(p) {
  p.cyl(FU, 0, 0, 0, 0.055, 0.012, 12, 0x202224);
  p.cyl(ME, 0, 0.012, 0, 0.012, 0.07, 8, 0x8a9096, { bottom: false });
  p.push(0, 0.1, 0, 0, -0.5);
  p.rbox(FU, -0.04, -0.085, -0.02, 0.04, 0.085, 0.02, 0.01, 0x24272a);
  p.box(FU, -0.03, 0.02, 0.02, 0.03, 0.07, 0.021, 0x10324a, 'Z');
  p.box(FU, -0.028, -0.052, 0.02, 0.028, 0.008, 0.0215, 0xc9ccd0, 'Z');                                                 // clavier
  for (let k = 0; k < 3; k++) p.box(FU, -0.026 + k * 0.019, -0.072, 0.02, -0.012 + k * 0.019, -0.06, 0.023, [0xc62828, 0xf9a825, 0x2e7d32][k], 'yYZ');
  p.pop();
}
// Pictogramme « sortie de secours » (bloc autonome d'éclairage de sécurité : reste allumé sur batterie)
let _exit = null;
export function exitSignMaterial() {
  if (_exit) return _exit;
  const c = document.createElement('canvas'); c.width = 256; c.height = 80; const x = c.getContext('2d');
  x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 256, 80); x.fillStyle = '#0a9a48'; x.fillRect(6, 6, 244, 68);
  x.strokeStyle = '#ffffff'; x.fillStyle = '#ffffff'; x.lineCap = 'round'; x.lineJoin = 'round';
  x.lineWidth = 5; x.strokeRect(150, 14, 34, 52);                                                              // porte
  x.beginPath(); x.arc(112, 20, 7, 0, Math.PI * 2); x.fill();                                                   // tête
  x.lineWidth = 9; x.beginPath(); x.moveTo(108, 31); x.lineTo(100, 50); x.stroke();                             // buste
  x.lineWidth = 7; x.beginPath(); x.moveTo(100, 50); x.lineTo(112, 58); x.lineTo(110, 70); x.moveTo(100, 50); x.lineTo(90, 60); x.lineTo(78, 62); x.stroke(); // jambes
  x.beginPath(); x.moveTo(106, 35); x.lineTo(120, 42); x.lineTo(130, 36); x.moveTo(106, 35); x.lineTo(94, 38); x.lineTo(86, 46); x.stroke(); // bras
  x.lineWidth = 8; x.beginPath(); x.moveTo(24, 40); x.lineTo(62, 40); x.stroke();                               // flèche
  x.beginPath(); x.moveTo(30, 26); x.lineTo(16, 40); x.lineTo(30, 54); x.stroke();
  x.font = '700 15px Arial'; x.textAlign = 'center'; x.fillText('SORTIE', 218, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _exit = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.15, 1.15, 1.15) });
  return _exit;
}
// Bloc de sécurité au mur (repère : point d'accroche au mur, face vers +z) : boîtier, diffuseur pictogramme (renvoie le mesh)
export function exitSign(p) {
  p.rbox(FU, -0.19, -0.065, 0, 0.19, 0.065, 0.055, 0.012, 0xf2f2ef, 'xXyYZ');
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), exitSignMaterial());
  m.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0.0555).premultiply(p.M)); m.matrixAutoUpdate = false; m.updateMatrix();
  return m;
}
// Cadre de dalle lumineuse encastrée (repère monde aligné, centre de la dalle au plafond)
export function troffer(p, w, d) {
  const hw = w / 2 + 0.03, hd = d / 2 + 0.03, c = 0xe6e6e2;
  p.box(FU, -hw, -0.045, -hd, hw, 0, -d / 2, c, 'xXyzZ'); p.box(FU, -hw, -0.045, d / 2, hw, 0, hd, c, 'xXyzZ');
  p.box(FU, -hw, -0.045, -d / 2, -w / 2, 0, d / 2, c, 'xXy'); p.box(FU, w / 2, -0.045, -d / 2, hw, 0, d / 2, c, 'xXy');
}


