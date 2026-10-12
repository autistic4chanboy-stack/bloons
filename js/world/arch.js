// Aide à la construction de l'architecture : murs avec ouvertures, dalles, boîtes, escaliers, panneaux lumineux.
// La géométrie est accumulée par (zone, matériau) puis fusionnée en un seul mesh par couple.
import * as THREE from 'three';
import { GeoBuilder, latheGeo, sweepGeo, roundBoxGeo, cylGeo, alongMatrix, trs } from '../engine/geo.js';
import { Box, LAYER } from '../engine/physics.js';
const IDENT = new THREE.Matrix4(), GEO = new Map(), UP = new THREE.Vector3(0, 1, 0), _alt = new THREE.Vector3(1, 0, 0);
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4();

export function cutOpenings(a0, a1, y0, y1, openings) {
  const segs = []; const ops = [...openings].filter(o => o.b > a0 && o.a < a1).sort((p, q) => p.a - q.a);
  let cur = a0;
  for (const o of ops) {
    const oa = Math.max(a0, o.a), ob = Math.min(a1, o.b);
    if (oa > cur + 0.001) segs.push({ a: cur, b: oa, y0, y1 });
    const oy0 = Math.max(y0, o.y0 ?? y0), oy1 = Math.min(y1, o.y1 ?? y1);
    if (oy0 > y0 + 0.001) segs.push({ a: oa, b: ob, y0, y1: oy0 });
    if (oy1 < y1 - 0.001) segs.push({ a: oa, b: ob, y0: oy1, y1 });
    cur = Math.max(cur, ob);
  }
  if (cur < a1 - 0.001) segs.push({ a: cur, b: a1, y0, y1 });
  return segs;
}

export class Arch {
  constructor(world) {
    this.world = world; this.game = world.game; this.mats = world.game.mats; this.atlas = world.game.atlas;
    this.geo = new Map(); this.panels = new Map();
    this.boxes = 0;
  }
  B(zone, mat) {
    const k = zone + '|' + mat; let e = this.geo.get(k);
    if (!e) {
      const m = this.mats.get(mat, zone);
      const colors = mat.startsWith('furniture');
      e = { b: new GeoBuilder({ uvScale: m.userData.texRepeat ?? 0.5, colors, white: this.atlas.white() }), zone, mat };
      this.geo.set(k, e);
    }
    return e.b;
  }
  // Boîte texturée (UV monde) + collision
  box(zone, mat, x0, y0, z0, x1, y1, z1, o = {}) {
    const lx = Math.min(x0, x1), hx = Math.max(x0, x1), ly = Math.min(y0, y1), hy = Math.max(y0, y1), lz = Math.min(z0, z1), hz = Math.max(z0, z1);
    if (hx - lx < 1e-4 || hy - ly < 1e-4 || hz - lz < 1e-4) return null;
    if (o.visible !== false) this.B(zone, mat).box((lx + hx) / 2, (ly + hy) / 2, (lz + hz) / 2, hx - lx, hy - ly, hz - lz, { faces: o.faces, color: o.color, flat: o.flat });
    let col = null;
    if (o.collide !== false) { col = this.world.physics.add(new Box(lx, ly, lz, hx, hy, hz, o.layer ?? LAYER.WALL, o.data || null)); this.boxes++; }
    return col;
  }
  // Mobilier coloré (couleurs par sommet)
  furn(zone, x0, y0, z0, x1, y1, z1, color, o = {}) {
    return this.box(zone, o.metal ? 'furniture_metal' : 'furniture', x0, y0, z0, x1, y1, z1, { ...o, color, layer: o.layer ?? LAYER.FURN, flat: true });
  }
  // Géométrie three.js libre (cylindres…) dans le batch d'une zone
  shape(zone, mat, geometry, matrix, color = 0xffffff) {
    this.B(zone, mat).geometry(geometry, matrix, { color, rect: mat.startsWith('furniture') ? this.atlas.white() : null, flat: mat.startsWith('furniture') });
  }
  // Géométrie à UV métriques (formes de geo.js : latheGeo, sweepGeo, roundBoxGeo…) : UV × répétition du matériau,
  // la texture garde l'échelle des murs ; mobilier : couleur par sommet
  shapeM(zone, mat, geometry, matrix = null, color = 0xffffff) {
    const fur = mat.startsWith('furniture');
    this.B(zone, mat).geometry(geometry, matrix || IDENT, { color, rect: fur ? this.atlas.white() : null, flat: fur, uvScale: fur ? 1 : (this.mats.get(mat, zone).userData.texRepeat ?? 0.5) });
  }
  // ── formes paramétriques posées dans les lots (gabarits mis en cache par dimensions, vidé au build) ──
  _g(key, make) { let g = GEO.get(key); if (!g) GEO.set(key, g = make()); return g; }
  // tube (cylindre) entre deux points a et b (Vector3) ; o.open : sans fonds, o.r1 : rayon en b, o.segs
  tube(zone, mat, a, b, r, color = 0xffffff, o = {}) {
    const len = a.distanceTo(b); if (len < 1e-4) return;
    const segs = o.segs ?? 10, g = this._g(['t', r, o.r1 ?? r, len.toFixed(3), segs, !!o.open].join('|'), () => cylGeo(r, len, segs, { open: o.open, r1: o.r1 }));
    this.shapeM(zone, mat, g, alongMatrix(a, b, 1, 1, false), color);
  }
  // boîte aux arêtes arrondies centrée en (x, y, z) ; o.rx / o.ry / o.rz : rotation, o.n : segments de congé, o.faces
  rbox(zone, mat, x, y, z, w, h, d, r, color = 0xffffff, o = {}) {
    const g = this._g(['rb', w, h, d, r, o.n ?? 1, o.faces ?? ''].join('|'), () => roundBoxGeo(w, h, d, r, o.n ?? 1, { faces: o.faces }));
    this.shapeM(zone, mat, g, trs(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0), color);
  }
  // surface de révolution (profil [[r, y], …]) posée en (x, y, z) ; o.m : matrice complète, o.s : échelle
  lathe(zone, mat, pts, segs, x, y, z, color = 0xffffff, o = {}) {
    const g = this._g('la' + JSON.stringify(pts) + '|' + segs + '|' + (o.phi0 ?? '') + '|' + (o.phiLen ?? ''), () => latheGeo(pts, segs, o));
    this.shapeM(zone, mat, g, o.m || trs(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.s || 1, o.s || 1, o.s || 1), color);
  }
  // profil balayé le long d'un chemin (Vector3[]), voir sweepGeo
  sweep(zone, mat, path, shape, color = 0xffffff, o = {}) { this.shapeM(zone, mat, sweepGeo(path, shape, o), null, color); }
  // triangles bruts dans un lot de mobilier (feuillages…) : pos / nor [x, y, z, …], col [r, g, b linéaires, …], idx
  raw(zone, mat, pos, nor, col, idx) {
    const b = this.B(zone, mat), base = b.vertexCount, w = this.atlas.white(), u = (w.u0 + w.u1) / 2, v = (w.v0 + w.v1) / 2, c = [1, 1, 1];
    for (let i = 0; i < pos.length; i += 3) { c[0] = col[i]; c[1] = col[i + 1]; c[2] = col[i + 2]; b._pushVert(pos[i], pos[i + 1], pos[i + 2], nor[i], nor[i + 1], nor[i + 2], u, v, c); }
    for (const i of idx) b.idx.push(base + i);
  }
  // plaque plane : contour 2D quelconque (x, y ; sens indifférent, concave admis) extrudé selon z de z0 à z1 ;
  // o.m : matrice appliquée ensuite (plaque posée dans un autre plan)
  plate(zone, mat, pts, z0, z1, color = 0xffffff, o = {}) {
    let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    const P = a < 0 ? [...pts].reverse() : pts;
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(P.map(p => new THREE.Vector2(p[0], p[1]))), { depth: z1 - z0, bevelEnabled: false, steps: 1, curveSegments: 1 });
    const m = new THREE.Matrix4().makeTranslation(0, 0, z0); if (o.m) m.premultiply(o.m);
    this.shapeM(zone, mat, g, m, color); g.dispose();
  }
  // poutre droite de a à b : section w (largeur) × h (hauteur, mesurée selon up), UV monde
  beam(zone, mat, a, b, w, h, color = 0xffffff, up = UP) {
    const ex = _bx.subVectors(b, a), L = ex.length(); if (L < 1e-4) return; ex.divideScalar(L);
    const ey = _by.copy(Math.abs(up.dot(ex)) > 0.99 ? _alt : up); ey.addScaledVector(ex, -ey.dot(ex)).normalize();
    const ez = _bz.crossVectors(ex, ey);
    _bm.makeBasis(ex.multiplyScalar(L), ey.multiplyScalar(h), ez.multiplyScalar(w)).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.B(zone, mat).box(0, 0, 0, 1, 1, 1, { matrix: _bm, color, flat: mat.startsWith('furniture') });
  }
  // Mur parallèle à X (de x0 à x1, centré en z, épaisseur t), ouvertures [{a, b, y0, y1}] en coordonnées x
  wallX(zone, mat, x0, x1, z, y0, y1, t = 0.2, openings = [], o = {}) {
    for (const s of cutOpenings(Math.min(x0, x1), Math.max(x0, x1), y0, y1, openings)) this.box(zone, mat, s.a, s.y0, z - t / 2, s.b, s.y1, z + t / 2, o);
  }
  // Mur parallèle à Z
  wallZ(zone, mat, z0, z1, x, y0, y1, t = 0.2, openings = [], o = {}) {
    for (const s of cutOpenings(Math.min(z0, z1), Math.max(z0, z1), y0, y1, openings)) this.box(zone, mat, x - t / 2, s.y0, s.a, x + t / 2, s.y1, s.b, o);
  }
  // Sol : dessus à y
  floor(zone, mat, x0, z0, x1, z1, y, t = 0.3, o = {}) { return this.box(zone, mat, x0, y - t, z0, x1, y, z1, { faces: o.faces ?? 'xXzZY', ...o }); }
  // Plafond : dessous à y
  ceiling(zone, mat, x0, z0, x1, z1, y, t = 0.2, o = {}) { return this.box(zone, mat, x0, y, z0, x1, y + t, z1, { faces: o.faces ?? 'xXzZy', ...o }); }
  // Dalle avec trous rectangulaires [{x0,z0,x1,z1}] (découpe en bandes)
  slabWithHoles(zone, mat, x0, z0, x1, z1, y, t, holes, o = {}) {
    // découpe en x selon les bords des trous
    const xs = new Set([x0, x1]); for (const h of holes) { xs.add(Math.max(x0, Math.min(x1, h.x0))); xs.add(Math.max(x0, Math.min(x1, h.x1))); }
    const X = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < X.length - 1; i++) {
      const a = X[i], b = X[i + 1]; const mid = (a + b) / 2;
      const hs = holes.filter(h => h.x0 <= mid && h.x1 >= mid).sort((p, q) => p.z0 - q.z0);
      let cz = z0;
      for (const h of hs) { if (h.z0 > cz) this.box(zone, mat, a, y - t, cz, b, y, h.z0, o); cz = Math.max(cz, h.z1); }
      if (cz < z1) this.box(zone, mat, a, y - t, cz, b, y, z1, o);
    }
  }
  // Escalier droit : marches le long d'un axe. dir = 'x+','x-','z+','z-'. (x, z) = coin de départ côté bas.
  stairs(zone, mat, x, z, dir, width, run, rise, y0, steps, o = {}) {
    const sr = rise / steps, sd = run / steps;
    for (let i = 0; i < steps; i++) {
      const top = y0 + sr * (i + 1);
      const a = sd * i, b = sd * (i + 1) + (o.overlap ?? 0.02);
      let bx0, bx1, bz0, bz1;
      if (dir === 'x+') { bx0 = x + a; bx1 = x + b; bz0 = z; bz1 = z + width; }
      else if (dir === 'x-') { bx0 = x - b; bx1 = x - a; bz0 = z; bz1 = z + width; }
      else if (dir === 'z+') { bz0 = z + a; bz1 = z + b; bx0 = x; bx1 = x + width; }
      else { bz0 = z - b; bz1 = z - a; bx0 = x; bx1 = x + width; }
      this.box(zone, mat, bx0, o.solid ? (o.base ?? y0 - 0.2) : top - Math.max(0.25, sr * 1.5), bz0, bx1, top, bz1, { layer: LAYER.FURN, faces: 'xXzZYy', visible: o.visible }); // visible: false → collisions seules
    }
  }
  // Panneau lumineux (néon de plafond) + point de lumière pour le pool
  panel(zone, x, y, z, w = 1.2, d = 0.3, addLight = true) {
    let b = this.panels.get(zone);
    if (!b) { b = new GeoBuilder({ colors: false }); this.panels.set(zone, b); }
    b.box(x, y - 0.02, z, w, 0.04, d, { faces: 'xXzZy', flat: true });
    const zn = this.world.zone(zone);
    if (zn && addLight) zn.lights.push(new THREE.Vector3(x, y - 0.35, z));
  }
  // cadre laqué d'une dalle lumineuse (panel) de w × d au plafond y : la lèvre dépasse le diffuseur de 6 mm
  panelFrame(zone, x, y, z, w, d, color = 0xf1f1ef, fw = 0.03) {
    const hw = w / 2 + 0.002, hd = d / 2 + 0.002, o = { collide: false, color, flat: true };
    this.box(zone, 'furniture', x - hw - fw, y - 0.046, z - hd - fw, x + hw + fw, y, z - hd, o); this.box(zone, 'furniture', x - hw - fw, y - 0.046, z + hd, x + hw + fw, y, z + hd + fw, o);
    this.box(zone, 'furniture', x - hw - fw, y - 0.046, z - hd, x - hw, y, z + hd, o); this.box(zone, 'furniture', x + hw, y - 0.046, z - hd, x + hw + fw, y, z + hd, o);
  }
  // boîtier d'un bloc de secours derrière son plan lumineux (orientation ry multiple de 90°, plan 0,6 × 0,22 m) ;
  // suspendu si yc (hauteur du plafond) est donné : deux tiges filetées
  exitBox(zone, x, y, z, ry, yc = null) {
    const nx = Math.round(Math.sin(ry)), nz = Math.round(Math.cos(ry)), tx = nz, tz = -nx, o = { collide: false, flat: true };
    const a = [x - nx * 0.05 - tx * 0.33, z - nz * 0.05 - tz * 0.33], b = [x - nx * 0.003 + tx * 0.33, z - nz * 0.003 + tz * 0.33];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
    this.box(zone, 'furniture', x0, y - 0.14, z0, x1, y + 0.14, z1, { ...o, color: 0xf2f2ee });
    this.box(zone, 'furniture', x0 - 0.002, y - 0.142, z0 - 0.002, x1 + 0.002, y - 0.125, z1 + 0.002, { ...o, color: 0x2e7d32 });
    if (yc != null) for (const s of [-1, 1]) { const px = x - nx * 0.026 + tx * s * 0.22, pz = z - nz * 0.026 + tz * s * 0.22; this.tube(zone, 'furniture_metal', new THREE.Vector3(px, y + 0.14, pz), new THREE.Vector3(px, yc, pz), 0.004, 0x8a8f93, { segs: 4, open: true }); }
  }
  build() {
    for (const e of this.geo.values()) {
      const geom = e.b.build(); if (!geom.attributes.position.count) continue;
      const mesh = new THREE.Mesh(geom, this.mats.get(e.mat, e.zone));
      mesh.receiveShadow = true; mesh.castShadow = !e.mat.startsWith('glass');
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      const zn = this.world.zone(e.zone);
      (zn ? zn.group : this.world.root).add(mesh);
    }
    for (const [zone, b] of this.panels) {
      const zn = this.world.zone(zone);
      const geom = b.build();
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.15, 0.15) }); mat.toneMapped = false;
      const mesh = new THREE.Mesh(geom, mat); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      if (zn) { zn.group.add(mesh); zn.panelMat = mat; } else this.world.root.add(mesh);
    }
    this.geo.clear(); this.panels.clear();
    for (const g of GEO.values()) g.dispose(); GEO.clear();
  }
}
