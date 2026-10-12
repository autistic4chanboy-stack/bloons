// Construction et fusion de géométries (batching statique). Réduit drastiquement les draw calls :
// toute l'architecture d'une zone et tous les produits d'un magasin finissent en quelques meshes.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
const _c = new THREE.Color();

export class GeoBuilder {
  // uvMode: 'world' (UV = coordonnées monde × uvScale, pour les textures qui se répètent) ou 'rect' (UV dans un rectangle d'atlas)
  constructor(opts = {}) {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
    this.uvScale = opts.uvScale ?? 1;
    this.colors = opts.colors ?? false;
    this.white = opts.white || { u0: 0, v0: 0, u1: 0.01, v1: 0.01 };
  }
  get vertexCount() { return this.pos.length / 3; }

  _pushVert(x, y, z, nx, ny, nz, u, v, color) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v);
    if (this.colors) { this.col.push(color[0], color[1], color[2]); }
  }

  // Boîte alignée (ou tournée autour de Y / matrice) avec UV monde.
  // faces : chaîne contenant les faces à inclure parmi 'xXyYzZ' (x = -x, X = +x…). label : {face, rect}
  box(cx, cy, cz, sx, sy, sz, opts = {}) {
    const color = this.colors ? toRGB(opts.color ?? 0xffffff) : null;
    const faces = opts.faces ?? 'xXyYzZ';
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const m = opts.matrix || null;
    const rotY = opts.rotY || 0; const cr = Math.cos(rotY), sr = Math.sin(rotY);
    const S = opts.uvScale ?? this.uvScale;
    const defs = [
      ['x', [-1, 0, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz]], 2, 1],
      ['X', [1, 0, 0], [[hx, -hy, -hz], [hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz]], 2, 1],
      ['y', [0, -1, 0], [[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz]], 0, 2],
      ['Y', [0, 1, 0], [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]], 0, 2],
      ['z', [0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], 0, 1],
      ['Z', [0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], 0, 1],
    ];
    for (const [f, n, corners, ua, va] of defs) {
      if (!faces.includes(f)) continue;
      const base = this.vertexCount;
      const rect = (opts.label && opts.label.face.includes(f)) ? opts.label.rect : (opts.rect || null);
      const lc = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let i = 0; i < 4; i++) {
        let [x, y, z] = corners[i];
        let nx = n[0], ny = n[1], nz = n[2];
        // rotation Y locale
        if (rotY) { const x2 = x * cr + z * sr, z2 = -x * sr + z * cr; x = x2; z = z2; const nx2 = nx * cr + nz * sr, nz2 = -nx * sr + nz * cr; nx = nx2; nz = nz2; }
        x += cx; y += cy; z += cz;
        if (m) { _v.set(x, y, z).applyMatrix4(m); x = _v.x; y = _v.y; z = _v.z; _m3.getNormalMatrix(m); _n.set(nx, ny, nz).applyMatrix3(_m3).normalize(); nx = _n.x; ny = _n.y; nz = _n.z; }
        let u, v;
        if (rect) { u = rect.u0 + (rect.u1 - rect.u0) * lc[i][0]; v = rect.v0 + (rect.v1 - rect.v0) * lc[i][1]; }
        else if (opts.flat) { u = this.white.u0 + (this.white.u1 - this.white.u0) * lc[i][0]; v = this.white.v0 + (this.white.v1 - this.white.v0) * lc[i][1]; }
        else {
          const w = [x, y, z];
          u = w[ua] * S; v = w[va] * S;
          if (f === 'x' || f === 'Z') u = (f === 'x' ? -w[2] : w[0]) * S; // orientation cohérente
          if (f === 'X') u = w[2] * S; if (f === 'z') u = -w[0] * S;
        }
        this._pushVert(x, y, z, nx, ny, nz, u, v, color);
      }
      // les faces x, X, y, Y sont définies dans le sens horaire : on inverse l'ordre des indices
      if (f === 'z' || f === 'Z') this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    return this;
  }

  // Ajoute une géométrie three.js quelconque (cylindre, sphère…) transformée
  geometry(geo, matrix, opts = {}) {
    const g = geo.index ? geo : geo;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const color = this.colors ? toRGB(opts.color ?? 0xffffff) : null;
    const base = this.vertexCount;
    _m3.getNormalMatrix(matrix);
    const rect = opts.rect || (opts.flat !== false ? this.white : null);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      _n.fromBufferAttribute(N, i).applyMatrix3(_m3).normalize();
      let u = 0, v = 0;
      if (rect && U) { u = rect.u0 + (rect.u1 - rect.u0) * U.getX(i); v = rect.v0 + (rect.v1 - rect.v0) * U.getY(i); }
      else if (U) { u = U.getX(i) * (opts.uvScale || 1); v = U.getY(i) * (opts.uvScale || 1); }
      let c = color;
      if (opts.colorFn) { c = toRGB(opts.colorFn(_v, i)); }
      this._pushVert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, u, v, c);
    }
    if (g.index) { for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i)); }
    else { for (let i = 0; i < P.count; i++) this.idx.push(base + i); }
    return this;
  }

  // Ajoute une autre GeoBuilder / BufferGeometry déjà construite avec une matrice
  merge(other, matrix) {
    if (other instanceof GeoBuilder) other = other.build();
    return this.geometry(other, matrix || new THREE.Matrix4(), { flat: false, keepColor: true, _raw: true });
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const vc = this.vertexCount;
    g.setIndex(vc > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

function toRGB(c) {
  if (Array.isArray(c)) return c;
  _c.set(c); return [_c.r, _c.g, _c.b]; // Color.set convertit déjà sRGB → linéaire
}

// Concatène des géométries indexées ayant les mêmes attributs (position, normal, uv, color).
// Retourne la géométrie et, pour chaque entrée, sa plage de sommets {start, count} (utile pour masquer un objet).
export function concatGeometries(list) {
  let vtot = 0, itot = 0; const hasColor = list.length && !!list[0].geo.attributes.color;
  for (const e of list) { vtot += e.geo.attributes.position.count; itot += e.geo.index.count; }
  const pos = new Float32Array(vtot * 3), nor = new Float32Array(vtot * 3), uv = new Float32Array(vtot * 2), col = hasColor ? new Float32Array(vtot * 3) : null;
  const idx = vtot > 65535 ? new Uint32Array(itot) : new Uint16Array(itot);
  let vo = 0, io = 0; const ranges = [];
  const m3 = new THREE.Matrix3(); const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const e of list) {
    const g = e.geo; const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color;
    const M = e.matrix; if (M) m3.getNormalMatrix(M);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      if (M) { v.applyMatrix4(M); n.applyMatrix3(m3).normalize(); }
      const o = (vo + i);
      pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      nor[o * 3] = n.x; nor[o * 3 + 1] = n.y; nor[o * 3 + 2] = n.z;
      uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i);
      if (col) { col[o * 3] = C.getX(i); col[o * 3 + 1] = C.getY(i); col[o * 3 + 2] = C.getZ(i); }
    }
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    ranges.push({ start: vo, count: P.count });
    vo += P.count; io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return { geometry: out, ranges };
}

// ───────────────────────── Formes paramétriques (architecture, mobilier) ─────────────────────────
// Géométries indexées (position, normal, uv) dont les UV sont en MÈTRES : multipliées par la répétition du matériau
// (Arch.shapeM), une texture garde la même échelle que sur les murs. Les arêtes vives sont obtenues en doublant un
// point du profil (deux normales). Mises en cache par les appelants (une forme, de nombreuses matrices).
function mkGeo(pos, nor, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
// normales 2D d'une ligne de points (fermée ou non) : moyenne des segments voisins, sauf aux points doublés (arête vive)
function lineNormals(P, closed, side = 1) {
  const n = P.length, seg = [];
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    seg.push(l < 1e-7 ? null : [side * dy / l, -side * dx / l]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const s0 = closed ? seg[(i - 1 + n) % n] : (i > 0 ? seg[i - 1] : null), s1 = closed ? seg[i % n] : (i < n - 1 ? seg[i] : null);
    let nx = 0, ny = 0;
    if (s0 && s1) { nx = s0[0] + s1[0]; ny = s0[1] + s1[1]; } else if (s0) { nx = s0[0]; ny = s0[1]; } else if (s1) { nx = s1[0]; ny = s1[1]; }
    const l = Math.hypot(nx, ny) || 1; out.push([nx / l, ny / l]);
  }
  return out;
}
// Surface de révolution autour de Y : pts [[r, y], …] du bas vers le haut (r ≥ 0) ; o.phi0, o.phiLen (portion d'arc)
export function latheGeo(pts, segs = 16, o = {}) {
  const phi0 = o.phi0 ?? 0, phiLen = o.phiLen ?? Math.PI * 2, full = Math.abs(phiLen - Math.PI * 2) < 1e-6;
  const N = lineNormals(pts, false), rMax = Math.max(...pts.map(p => p[0]), 0.01);
  const pos = [], nor = [], uv = [], idx = [], L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const cols = segs + 1;
  for (let i = 0; i < pts.length; i++) for (let j = 0; j <= segs; j++) {
    const f = phi0 + phiLen * (full && j === segs ? 0 : j / segs), s = Math.sin(f), c = Math.cos(f);
    pos.push(pts[i][0] * s, pts[i][1], pts[i][0] * c); nor.push(N[i][0] * s, N[i][1], N[i][0] * c); uv.push(phiLen * rMax * j / segs, L[i]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) < 1e-7) continue;
    for (let j = 0; j < segs; j++) { const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1; idx.push(a, b, d, a, d, c); }
  }
  return mkGeo(pos, nor, uv, idx);
}
// Congé des angles d'une polyligne 3D (Vector3[]) : chaque angle intérieur devient un arc de rayon r (n segments)
export function roundPath(P, r, n = 4) {
  if (P.length < 3 || r <= 0) return P.map(p => p.clone());
  const out = [P[0].clone()];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const u = a.clone().sub(b), v = c.clone().sub(b), lu = u.length(), lv = v.length(); u.normalize(); v.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1));
    if (ang > Math.PI - 1e-3) { out.push(b.clone()); continue; }
    const t = Math.min(r / Math.tan(ang / 2), lu * 0.49, lv * 0.49), p0 = b.clone().addScaledVector(u, t), p1 = b.clone().addScaledVector(v, t);
    for (let k = 0; k <= n; k++) { const s = k / n; const q0 = p0.clone().lerp(b, s), q1 = b.clone().lerp(p1, s); out.push(q0.lerp(q1, s)); } // Bézier quadratique
  }
  out.push(P[P.length - 1].clone());
  return out;
}
const _q = new THREE.Quaternion(), _t0 = new THREE.Vector3(), _t1 = new THREE.Vector3();
// Balayage d'un profil fermé (shape [[x, y], …], sens trigonométrique) le long d'une polyligne 3D (Vector3[]) ; repères
// par transport parallèle (o.up : orientation initiale du profil, axe y du profil). o.scale(t, i) : facteur de taille
// (troncs, branches) ; o.caps : ferme les extrémités ; o.open : profil ouvert (bande).
export function sweepGeo(path, shape, o = {}) {
  const n = path.length, m = shape.length, closed = !o.open;
  const SN = lineNormals(shape, closed, 1), pos = [], nor = [], uv = [], idx = [];
  const T = [], Nn = [], Bn = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    T.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  let up = (o.up || new THREE.Vector3(0, 1, 0)).clone(); if (Math.abs(up.dot(T[0])) > 0.98) up.set(1, 0, 0).cross(T[0]).normalize();
  let N0 = up.sub(T[0].clone().multiplyScalar(up.dot(T[0]))).normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) { _q.setFromUnitVectors(_t0.copy(T[i - 1]), _t1.copy(T[i])); N0 = N0.clone().applyQuaternion(_q); N0.sub(T[i].clone().multiplyScalar(N0.dot(T[i]))).normalize(); }
    Nn.push(N0); Bn.push(new THREE.Vector3().crossVectors(T[i], N0).normalize());
  }
  // périmètre (u) et longueur du chemin (v), en mètres
  const per = [0]; for (let k = 1; k <= m; k++) { const a = shape[k - 1], b = shape[k % m]; per.push(per[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  let len = 0; const cols = closed ? m + 1 : m;
  for (let i = 0; i < n; i++) {
    if (i) len += path[i].distanceTo(path[i - 1]);
    const s = o.scale ? o.scale(len, i) : 1, P = path[i], N = Nn[i], B = Bn[i];
    for (let k = 0; k < cols; k++) {
      const sp = shape[k % m], sn = SN[k % m];
      // x du profil → binormale, y → normale (profil vu dans le sens du chemin)
      pos.push(P.x + (B.x * sp[0] + N.x * sp[1]) * s, P.y + (B.y * sp[0] + N.y * sp[1]) * s, P.z + (B.z * sp[0] + N.z * sp[1]) * s);
      nor.push(B.x * sn[0] + N.x * sn[1], B.y * sn[0] + N.y * sn[1], B.z * sn[0] + N.z * sn[1]); uv.push(per[k] * s, len);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < cols - 1; k++) {
    const sa = shape[k % m], sb = shape[(k + 1) % m]; if (Math.hypot(sb[0] - sa[0], sb[1] - sa[1]) < 1e-7) continue;
    const a = i * cols + k, b = a + 1, c = a + cols, d = c + 1; idx.push(a, c, d, a, d, b);
  }
  if (o.caps && closed) for (const [i, sg] of [[0, -1], [n - 1, 1]]) {
    const s = o.scale ? o.scale(i ? len : 0, i) : 1, P = path[i], N = Nn[i], B = Bn[i], base = pos.length / 3;
    for (let k = 0; k < m; k++) { const sp = shape[k]; pos.push(P.x + (B.x * sp[0] + N.x * sp[1]) * s, P.y + (B.y * sp[0] + N.y * sp[1]) * s, P.z + (B.z * sp[0] + N.z * sp[1]) * s); nor.push(T[i].x * sg, T[i].y * sg, T[i].z * sg); uv.push(sp[0] * s, sp[1] * s); }
    for (let k = 1; k < m - 1; k++) sg > 0 ? idx.push(base, base + k + 1, base + k) : idx.push(base, base + k, base + k + 1);
  }
  return mkGeo(pos, nor, uv, idx);
}
// Profils usuels pour sweepGeo
export function circleShape(r, n = 10) { const s = []; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; s.push([Math.cos(a) * r, Math.sin(a) * r]); } return s; }
export function rectShape(w, h, r = 0, n = 2) { // rectangle centré, coins arrondis (rayon r, n segments par coin)
  if (r <= 0) return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]];
  const s = [], cs = [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]];
  for (const [cx, cy, a0] of cs) for (let k = 0; k <= n; k++) { const a = a0 + (k / n) * Math.PI / 2; s.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return s;
}
// Boîte aux arêtes arrondies (rayon r, n segments par demi-congé : n = 1 donne un chanfrein lissé). Normales lisses,
// UV projetées par face (mètres). o.faces : faces à garder ('xXyYzZ').
export function roundBoxGeo(w, h, d, r, n = 1, o = {}) {
  const H = [w / 2, h / 2, d / 2], R = Math.max(1e-4, Math.min(r, H[0] * 0.999, H[1] * 0.999, H[2] * 0.999));
  const coords = (hh) => { const a = [], inner = hh - R; for (let k = n; k >= 1; k--) a.push(-inner - R * Math.tan((k / n) * Math.PI / 4)); a.push(-inner, inner); for (let k = 1; k <= n; k++) a.push(inner + R * Math.tan((k / n) * Math.PI / 4)); return a; };
  const C = [coords(H[0]), coords(H[1]), coords(H[2])], faces = o.faces ?? 'xXyYzZ';
  const pos = [], nor = [], uv = [], idx = [], v = [0, 0, 0];
  // face : axe normal, signe, axes (u, w) dans le plan tels que u × w = normale
  for (const [f, ax, sg, ua, wa] of [['x', 0, -1, 2, 1], ['X', 0, 1, 1, 2], ['y', 1, -1, 0, 2], ['Y', 1, 1, 2, 0], ['z', 2, -1, 1, 0], ['Z', 2, 1, 0, 1]]) {
    if (!faces.includes(f)) continue;
    const U = C[ua], W = C[wa], base = pos.length / 3;
    for (let j = 0; j < W.length; j++) for (let i = 0; i < U.length; i++) {
      v[ax] = sg * H[ax]; v[ua] = U[i]; v[wa] = W[j];
      const ix = Math.max(-H[0] + R, Math.min(H[0] - R, v[0])), iy = Math.max(-H[1] + R, Math.min(H[1] - R, v[1])), iz = Math.max(-H[2] + R, Math.min(H[2] - R, v[2]));
      let dx = v[0] - ix, dy = v[1] - iy, dz = v[2] - iz; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      pos.push(ix + dx * R, iy + dy * R, iz + dz * R); nor.push(dx, dy, dz);
      uv.push(ax === 0 ? -sg * v[2] : ax === 2 ? sg * v[0] : v[0], ax === 1 ? v[2] : v[1]);
    }
    for (let j = 0; j < W.length - 1; j++) for (let i = 0; i < U.length - 1; i++) { const a = base + j * U.length + i, b = a + 1, c = a + U.length, e = c + 1; idx.push(a, b, e, a, e, c); }
  }
  return mkGeo(pos, nor, uv, idx);
}
// Prisme droit : contour 2D (sens trigonométrique, plan XY) extrudé sur Z de z0 à z1, flancs à arêtes vives
export function prismGeo(shape, z0, z1) {
  const m = shape.length, pos = [], nor = [], uv = [], idx = [];
  let u = 0;
  for (let k = 0; k < m; k++) {
    const a = shape[k], b = shape[(k + 1) % m], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); if (l < 1e-7) continue;
    const nx = dy / l, ny = -dx / l, base = pos.length / 3;
    pos.push(a[0], a[1], z0, b[0], b[1], z0, b[0], b[1], z1, a[0], a[1], z1); for (let q = 0; q < 4; q++) nor.push(nx, ny, 0);
    uv.push(u, z0, u + l, z0, u + l, z1, u, z1); u += l;
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  for (const [z, sg] of [[z0, -1], [z1, 1]]) { // fonds (éventail : contours convexes ou étoilés depuis le premier point)
    const base = pos.length / 3; for (const p of shape) { pos.push(p[0], p[1], z); nor.push(0, 0, sg); uv.push(p[0], p[1]); }
    for (let k = 1; k < m - 1; k++) sg > 0 ? idx.push(base, base + k, base + k + 1) : idx.push(base, base + k + 1, base + k);
  }
  return mkGeo(pos, nor, uv, idx);
}
// Cylindre (axe Y, centré) à UV métriques ; o.open : sans fonds ; o.r1 : rayon du haut
export function cylGeo(r, h, segs = 12, o = {}) {
  const r1 = o.r1 ?? r, pts = o.open ? [[r, -h / 2], [r1, h / 2]] : [[0, -h / 2], [r, -h / 2], [r, -h / 2], [r1, h / 2], [r1, h / 2], [0, h / 2]];
  return latheGeo(pts, segs);
}
// Matrices utilitaires : objet unitaire posé entre deux points (axe Y de l'objet le long de a → b)
const _ya = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _mq = new THREE.Quaternion(), _ms = new THREE.Vector3();
export function alongMatrix(a, b, sx = 1, sz = 1, stretch = true) {
  _d.subVectors(b, a); const l = _d.length(); _mq.setFromUnitVectors(_ya, _d.normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), _mq, _ms.set(sx, stretch ? l : 1, sz));
}
export function trs(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
