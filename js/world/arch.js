// Aide à la construction de l'architecture : murs avec ouvertures, dalles, boîtes, escaliers, panneaux lumineux.
// La géométrie est accumulée par (zone, matériau) puis fusionnée en un seul mesh par couple.
import * as THREE from 'three';
import { GeoBuilder } from '../engine/geo.js';
import { Box, LAYER } from '../engine/physics.js';

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
      this.box(zone, mat, bx0, o.solid ? (o.base ?? y0 - 0.2) : top - Math.max(0.25, sr * 1.5), bz0, bx1, top, bz1, { layer: LAYER.FURN, faces: 'xXzZYy' });
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
  }
}
