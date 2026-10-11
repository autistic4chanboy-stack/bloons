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
