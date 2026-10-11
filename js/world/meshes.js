// Fabrique de formes des objets : chaque définition d'objet (js/data/items.js) est « cuite » en une seule
// BufferGeometry (couleurs par sommet + UV dans l'atlas d'étiquettes), mise en cache par id d'objet.
// Origine = centre de la boîte englobante (s[0], s[1], s[2]). meta : points d'ancrage (écran, porte, lumière…).
import * as THREE from 'three';
import { GeoBuilder } from '../engine/geo.js';
import { mulberry32 } from '../engine/rng.js';

const U = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1),
  cone: new THREE.ConeGeometry(0.5, 1, 14, 1),
  sph: new THREE.SphereGeometry(0.5, 14, 10),
  sphLo: new THREE.SphereGeometry(0.5, 8, 6),
  torus: new THREE.TorusGeometry(0.4, 0.1, 6, 16),
  torusThin: new THREE.TorusGeometry(0.45, 0.05, 5, 20),
  cap: new THREE.CapsuleGeometry(0.5, 1, 4, 8),
};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function mat(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s).clone();
}

function shade(c, k) {
  const r = Math.min(255, Math.max(0, ((c >> 16) & 255) * k)), g = Math.min(255, Math.max(0, ((c >> 8) & 255) * k)), b = Math.min(255, Math.max(0, (c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

// Kit de construction relatif au centre de l'objet
class Kit {
  constructor(b, atlas) { this.b = b; this.atlas = atlas; this.white = atlas.white(); this.meta = {}; }
  box(x, y, z, w, h, d, c, opts = {}) { this.b.box(x, y, z, w, h, d, { color: c, flat: true, rotY: opts.ry || 0, matrix: opts.m, label: opts.label, faces: opts.faces }); return this; }
  boxR(x, y, z, w, h, d, c, rx, ry, rz) { this.b.geometry(U.box, mat(x, y, z, w, h, d, rx, ry, rz), { color: c, rect: this.white }); return this; }
  cyl(x, y, z, r, h, c, rx = 0, ry = 0, rz = 0, lo = false) { this.b.geometry(lo ? U.cyl8 : U.cyl, mat(x, y, z, r * 2, h, r * 2, rx, ry, rz), { color: c, rect: this.white }); return this; }
  cylS(x, y, z, rx_, h, rz_, c, ax = 0, ay = 0, az = 0) { this.b.geometry(U.cyl, mat(x, y, z, rx_ * 2, h, rz_ * 2, ax, ay, az), { color: c, rect: this.white }); return this; }
  cone(x, y, z, r, h, c, rx = 0, ry = 0, rz = 0) { this.b.geometry(U.cone, mat(x, y, z, r * 2, h, r * 2, rx, ry, rz), { color: c, rect: this.white }); return this; }
  sph(x, y, z, rx, ry, rz, c, lo = false) { this.b.geometry(lo ? U.sphLo : U.sph, mat(x, y, z, rx * 2, ry * 2, rz * 2), { color: c, rect: this.white }); return this; }
  torus(x, y, z, r, c, rx = Math.PI / 2, ry = 0, rz = 0, thin = false, sy = 1) { this.b.geometry(thin ? U.torusThin : U.torus, mat(x, y, z, r * 2.2, r * 2.2 * sy, r * 2.2, rx, ry, rz), { color: c, rect: this.white }); return this; }
  cap(x, y, z, r, len, c, rx = 0, ry = 0, rz = 0) { this.b.geometry(U.cap, mat(x, y, z, r * 2, len / 2, r * 2, rx, ry, rz), { color: c, rect: this.white }); return this; }
  label(key, text, color, style) { return this.atlas.label(key, text, color, style); }
}

const SHAPES = {};
function S(names, fn) { for (const n of names.split(',')) SHAPES[n.trim()] = fn; }

// ───────── génériques ─────────
S('box', (k, s, c) => k.box(0, 0, 0, s[0], s[1], s[2], c));
S('labelbox', (k, s, c, d) => { const r = k.label(d.id, d.label || d.name, c); k.box(0, 0, 0, s[0], s[1], s[2], c, { label: { face: 'zZ', rect: r } }); });
S('cyl', (k, s, c) => k.cylS(0, 0, 0, s[0] / 2, s[1], s[2] / 2, c));
S('sphere', (k, s, c) => k.sph(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c));
S('card', (k, s, c, d) => { const r = d.label ? k.label(d.id, d.label, c) : null; k.box(0, 0, 0, s[0], s[1], s[2], c, r ? { label: { face: 'zZ', rect: r } } : {}); });
S('cash', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, 0.001, 0, s[0] * 0.3, s[1] * 1.05, s[2] * 1.02, 0xf5f5dc); });
S('coin', (k, s, c) => k.cyl(0, 0, 0, s[0] / 2, s[1], c));
S('cone', (k, s, c, d) => {
  if (d.use === 'eat') { k.cone(0, -s[1] * 0.15, 0, s[0] / 2, s[1] * 0.7, 0xd4a056, Math.PI); k.sph(0, s[1] * 0.25, 0, s[0] / 2, s[0] / 2, s[0] / 2, c); }
  else k.cone(0, 0, 0, s[0] / 2, s[1], c);
});
S('ring_big', (k, s, c) => k.torus(0, 0, 0, s[0] / 2.2, c, 0, 0, 0));
S('rope', (k, s, c) => { k.torus(0, 0, 0, s[0] / 2.4, c, Math.PI / 2); k.torus(0, s[1] * 0.3, 0, s[0] / 2.8, c, Math.PI / 2); });

// ───────── outils ─────────
S('flashlight', (k, s, c) => { k.cyl(0, 0, -s[2] * 0.1, s[0] * 0.42, s[2] * 0.8, c, Math.PI / 2); k.cyl(0, 0, s[2] * 0.38, s[0] * 0.55, s[2] * 0.22, shade(c, 1.4), Math.PI / 2); k.cyl(0, 0, s[2] * 0.5, s[0] * 0.48, 0.005, 0xfffbe0, Math.PI / 2); k.meta.lens = [0, 0, s[2] * 0.5]; });
S('headlamp', (k, s, c) => { k.torus(0, 0, 0, s[0] / 2.2, 0x222222, Math.PI / 2, 0, 0, true); k.box(0, 0, s[2] / 2, 0.05, 0.04, 0.03, c); });
S('battery', (k, s, c) => { k.cyl(-s[0] * 0.25, 0, 0, s[2] / 2, s[1], c); k.cyl(s[0] * 0.25, 0, 0, s[2] / 2, s[1], c); k.cyl(-s[0] * 0.25, s[1] * 0.4, 0, s[2] / 2.01, s[1] * 0.2, 0x222222); k.cyl(s[0] * 0.25, s[1] * 0.4, 0, s[2] / 2.01, s[1] * 0.2, 0x222222); });
S('keys', (k, s, c) => { k.torus(0, 0, 0, s[0] * 0.25, 0xaaaaaa, Math.PI / 2, 0, 0, true); for (let i = 0; i < 3; i++) k.boxR(Math.cos(i * 2) * s[0] * 0.3, 0, Math.sin(i * 2) * s[0] * 0.3, 0.012, 0.004, 0.05, c, 0, i * 2, 0); });
S('lockpick', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2] * 0.4, c); k.box(s[0] * 0.3, 0, 0.01, s[0] * 0.5, s[1], s[2] * 0.2, 0x555555); });
S('padlock', (k, s, c) => { k.box(0, -s[1] * 0.15, 0, s[0], s[1] * 0.6, s[2], c); k.torus(0, s[1] * 0.2, 0, s[0] * 0.32, 0xc0c0c0, 0, 0, 0, false, 1.2); });
S('stick', (k, s, c, d) => {
  const L = Math.max(s[0], s[1], s[2]);
  if (d.id === 'crowbar') { k.cyl(0, 0, 0, 0.012, L * 0.9, c, Math.PI / 2); k.cyl(0, 0.03, L * 0.45, 0.012, 0.08, c, Math.PI / 4); }
  else if (d.id === 'baseball_bat') { k.cylS(0, 0, 0, 0.035, L, 0.035, c, Math.PI / 2); k.cyl(0, 0, L * 0.2, 0.04, L * 0.5, shade(c, 0.95), Math.PI / 2); }
  else if (d.id === 'screwdriver') { k.cyl(0, 0, -L * 0.25, 0.015, L * 0.45, c, Math.PI / 2); k.cyl(0, 0, L * 0.2, 0.004, L * 0.5, 0x999999, Math.PI / 2); }
  else if (d.id === 'saw') { k.box(0, 0, 0.05, 0.1, 0.004, L * 0.8, 0xbdbdbd); k.box(0, 0, -L * 0.42, 0.04, 0.03, 0.12, 0x8d5524); }
  else k.cylS(0, 0, 0, s[0] / 2, L, s[1] / 2, c, Math.PI / 2);
});
S('hammer', (k, s, c) => { k.cyl(0, 0, 0, 0.015, s[1], 0x8d5524); k.box(0, s[1] * 0.45, 0, s[0], 0.04, 0.03, 0x555555); });
S('drill', (k, s, c) => { k.box(0, s[1] * 0.15, 0, s[0], s[1] * 0.35, s[2] * 0.7, c); k.box(0, -s[1] * 0.15, -s[2] * 0.15, s[0] * 0.7, s[1] * 0.5, s[2] * 0.25, shade(c, 0.6)); k.cyl(0, s[1] * 0.15, s[2] * 0.45, 0.008, 0.1, 0x999999, Math.PI / 2); });
S('tape', (k, s, c) => { k.torus(0, 0, 0, s[0] * 0.38, c, Math.PI / 2, 0, 0, false, 1.4); });
S('extinguisher', (k, s, c) => { k.cyl(0, -s[1] * 0.05, 0, s[0] / 2, s[1] * 0.85, c); k.sph(0, s[1] * 0.37, 0, s[0] / 2, s[0] * 0.3, s[0] / 2, c); k.box(0, s[1] * 0.46, 0, 0.04, 0.05, 0.12, 0x222222); k.cyl(0.05, s[1] * 0.2, 0.06, 0.012, s[1] * 0.5, 0x111111, 0.3, 0, 0); k.box(0, 0, s[0] / 2, s[0] * 0.6, s[1] * 0.3, 0.003, 0xffffff); });
S('jerrycan', (k, s, c, d) => { const r = d.label ? k.label(d.id, d.label, c) : null; k.box(0, -s[1] * 0.05, 0, s[0], s[1] * 0.9, s[2], c, r ? { label: { face: 'zZ', rect: r } } : {}); k.box(0, s[1] * 0.45, -s[2] * 0.1, s[0] * 0.5, s[1] * 0.08, s[2] * 0.3, shade(c, 0.7)); k.cyl(s[0] * 0.3, s[1] * 0.45, 0, 0.02, 0.06, 0x222222); });
S('bulb', (k, s, c) => { k.sph(0, s[1] * 0.12, 0, s[0] / 2, s[0] / 2, s[0] / 2, c); k.cyl(0, -s[1] * 0.3, 0, s[0] * 0.22, s[1] * 0.3, 0xb0b0b0); });
S('sensor', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.sph(0, 0, s[2] / 2, s[0] * 0.3, s[0] * 0.3, s[0] * 0.15, 0x888888); k.box(s[0] * 0.3, s[1] * 0.35, s[2] / 2, 0.008, 0.008, 0.004, 0xff0000); });
S('camera', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2] * 0.7, c); k.cyl(0, 0, s[2] * 0.4, s[1] * 0.32, s[2] * 0.3, 0x111111, Math.PI / 2); k.cyl(0, 0, s[2] * 0.56, s[1] * 0.24, 0.004, 0x223344, Math.PI / 2); k.meta.lens = [0, 0, s[2] * 0.56]; });
S('rccar', (k, s, c) => { k.box(0, 0.01, 0, s[0] * 0.8, s[1] * 0.45, s[2] * 0.8, c); k.box(0, s[1] * 0.3, -s[2] * 0.05, s[0] * 0.6, s[1] * 0.35, s[2] * 0.4, shade(c, 0.6)); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(x * s[0] * 0.42, -s[1] * 0.2, z * s[2] * 0.32, s[1] * 0.3, s[0] * 0.15, 0x111111, 0, 0, Math.PI / 2); k.box(s[0] * 0.3, s[1] * 0.5, -s[2] * 0.3, 0.005, 0.15, 0.005, 0x222222); });
S('remote', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.cyl(-s[0] * 0.25, s[1] * 0.5, 0, 0.012, 0.03, 0x666666); k.cyl(s[0] * 0.25, s[1] * 0.5, 0, 0.012, 0.03, 0x666666); k.cyl(s[0] * 0.4, s[1] * 0.5 + 0.06, -s[2] * 0.4, 0.003, 0.15, 0x222222); });
S('walkie', (k, s, c) => { k.box(0, 0, 0, s[0], s[1] * 0.8, s[2], c); k.cyl(s[0] * 0.3, s[1] * 0.5, 0, 0.006, s[1] * 0.3, 0x111111); k.box(0, s[1] * 0.2, s[2] / 2, s[0] * 0.7, s[1] * 0.2, 0.003, 0x445544); });
S('phone', (k, s, c, d) => { if (d.id === 'toy_phone') { k.box(0, -s[1] * 0.2, 0, s[0], s[1] * 0.6, s[2], c); k.cylS(0, s[1] * 0.25, 0, s[0] * 0.5, s[2] * 0.4, s[1] * 0.2, 0xffeb3b, 0, 0, Math.PI / 2); return; } k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, 0, s[2] / 2, s[0] * 0.9, s[1] * 0.9, 0.002, 0x0a1220); k.meta.screen = { x: 0, y: 0, z: s[2] / 2 + 0.002, w: s[0] * 0.9, h: s[1] * 0.9 }; });
S('tablet', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, 0, s[2] / 2, s[0] * 0.92, s[1] * 0.88, 0.002, 0x0a1220); k.meta.screen = { x: 0, y: 0, z: s[2] / 2 + 0.002, w: s[0] * 0.92, h: s[1] * 0.88 }; });
S('ladder', (k, s, c) => { for (const x of [-1, 1]) k.box(x * s[0] * 0.45, 0, 0, 0.04, s[1], 0.06, c); for (let i = 0; i < 5; i++) k.box(0, -s[1] / 2 + 0.25 + i * 0.3, 0, s[0] * 0.9, 0.03, 0.1, shade(c, 0.85)); });
S('can', (k, s, c, d) => { const r = k.label(d.id, d.label || d.name, c); k.b.geometry(U.cyl, mat(0, 0, 0, s[0], s[1] * 0.9, s[2]), { color: c, rect: r }); k.cyl(0, s[1] * 0.46, 0, s[0] * 0.48, s[1] * 0.04, 0xc0c0c0); k.cyl(0, -s[1] * 0.46, 0, s[0] * 0.48, s[1] * 0.04, 0xc0c0c0); });
S('candle', (k, s, c) => { k.cyl(0, -s[1] * 0.05, 0, s[0] / 2, s[1] * 0.9, c); k.cyl(0, s[1] * 0.45, 0, 0.003, s[1] * 0.1, 0x222222); k.meta.flame = [0, s[1] * 0.55, 0]; });

// ───────── jouets ─────────
S('plush', (k, s, c, d) => {
  const w = s[0], h = s[1];
  k.sph(0, -h * 0.18, 0, w * 0.42, h * 0.32, s[2] * 0.45, c); // corps
  k.sph(0, h * 0.25, 0, w * 0.33, h * 0.24, s[2] * 0.4, c); // tête
  if (d.id === 'bunny_plush') { k.sph(-w * 0.12, h * 0.48, 0, w * 0.06, h * 0.16, w * 0.05, c); k.sph(w * 0.12, h * 0.48, 0, w * 0.06, h * 0.16, w * 0.05, c); }
  else if (d.id === 'dino_plush') { k.sph(0, -h * 0.15, -s[2] * 0.5, w * 0.12, h * 0.12, s[2] * 0.35, c); }
  else if (d.id === 'boxing_gloves') { k.sph(0, 0, 0, w * 0.5, h * 0.5, s[2] * 0.5, c); return; }
  else { k.sph(-w * 0.24, h * 0.42, 0, w * 0.1, w * 0.1, w * 0.06, c); k.sph(w * 0.24, h * 0.42, 0, w * 0.1, w * 0.1, w * 0.06, c); }
  k.sph(0, h * 0.2, s[2] * 0.33, w * 0.13, h * 0.09, s[2] * 0.1, shade(c, 1.35)); // museau
  k.sph(-w * 0.11, h * 0.3, s[2] * 0.33, 0.012 + w * 0.02, 0.012 + w * 0.02, 0.01, 0x111111);
  k.sph(w * 0.11, h * 0.3, s[2] * 0.33, 0.012 + w * 0.02, 0.012 + w * 0.02, 0.01, 0x111111);
  k.sph(-w * 0.38, -h * 0.1, 0, w * 0.12, h * 0.14, w * 0.12, c); k.sph(w * 0.38, -h * 0.1, 0, w * 0.12, h * 0.14, w * 0.12, c);
  k.sph(-w * 0.2, -h * 0.45, s[2] * 0.15, w * 0.13, h * 0.08, w * 0.15, c); k.sph(w * 0.2, -h * 0.45, s[2] * 0.15, w * 0.13, h * 0.08, w * 0.15, c);
  if (d.id === 'bobby_plush') k.box(0, -h * 0.02, s[2] * 0.4, w * 0.3, h * 0.08, 0.01, 0xd32f2f);
});
S('robot', (k, s, c) => { k.box(0, -s[1] * 0.05, 0, s[0], s[1] * 0.45, s[2], c); k.box(0, s[1] * 0.32, 0, s[0] * 0.7, s[1] * 0.3, s[2] * 0.8, shade(c, 1.1)); k.box(-s[0] * 0.18, s[1] * 0.35, s[2] * 0.41, 0.02, 0.02, 0.005, 0xffeb3b); k.box(s[0] * 0.18, s[1] * 0.35, s[2] * 0.41, 0.02, 0.02, 0.005, 0xffeb3b); k.box(-s[0] * 0.25, -s[1] * 0.4, 0, s[0] * 0.3, s[1] * 0.2, s[2] * 0.6, 0x555555); k.box(s[0] * 0.25, -s[1] * 0.4, 0, s[0] * 0.3, s[1] * 0.2, s[2] * 0.6, 0x555555); k.cyl(0, s[1] * 0.5, 0, 0.004, 0.05, 0x999999); k.meta.eyes = true; });
S('toycar', (k, s, c) => { k.box(0, -s[1] * 0.05, 0, s[0], s[1] * 0.5, s[2], c); k.box(0, s[1] * 0.25, -s[2] * 0.05, s[0] * 0.8, s[1] * 0.4, s[2] * 0.5, shade(c, 1.2)); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(x * s[0] * 0.5, -s[1] * 0.3, z * s[2] * 0.3, s[1] * 0.22, 0.012, 0x111111, 0, 0, Math.PI / 2); });
S('doll', (k, s, c, d) => {
  const h = s[1]; k.cone(0, -h * 0.2, 0, s[0] * 0.5, h * 0.5, d.p?.creepy ? 0xe8e0d8 : 0xe91e63); k.box(0, h * 0.1, 0, s[0] * 0.5, h * 0.2, s[2] * 0.6, d.p?.creepy ? 0xe8e0d8 : 0xf8bbd0);
  k.sph(0, h * 0.33, 0, s[0] * 0.33, h * 0.14, s[2] * 0.5, c); k.sph(0, h * 0.4, -s[2] * 0.05, s[0] * 0.36, h * 0.1, s[2] * 0.52, d.id === 'figurine' ? 0x00e5ff : 0xfbc02d);
  k.sph(-s[0] * 0.1, h * 0.34, s[2] * 0.42, 0.008, 0.008, 0.005, 0x1565c0); k.sph(s[0] * 0.1, h * 0.34, s[2] * 0.42, 0.008, 0.008, 0.005, 0x1565c0);
});
S('jackbox', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] / 2 + 0.003, 0, s[0], 0.006, s[2], 0xffeb3b); k.cyl(s[0] / 2 + 0.02, 0, 0, 0.006, 0.04, 0x999999, 0, 0, Math.PI / 2); });
S('ball', (k, s, c, d) => { k.sph(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c); if (d.id === 'football') { k.sph(0, 0, s[2] * 0.46, s[0] * 0.15, s[0] * 0.15, s[0] * 0.06, 0x111111); k.sph(s[0] * 0.43, 0, 0, s[0] * 0.06, s[0] * 0.15, s[0] * 0.15, 0x111111); } if (d.id === 'beach_ball') k.torus(0, 0, 0, s[0] * 0.46, 0xe53935, 0, 0, 0, true); if (d.id === 'basketball') k.torus(0, 0, 0, s[0] * 0.46, 0x111111, 0, 0, 0, true); });
S('musicbox', (k, s, c) => { k.box(0, -s[1] * 0.1, 0, s[0], s[1] * 0.8, s[2], c); k.box(0, s[1] * 0.35, -s[2] * 0.2, s[0], s[1] * 0.08, s[2] * 0.7, shade(c, 1.2), {}); k.sph(0, s[1] * 0.42, 0, s[0] * 0.08, s[0] * 0.12, s[0] * 0.08, 0xf8bbd0); k.cyl(s[0] / 2 + 0.01, 0, 0, 0.004, 0.03, 0xd4af37, 0, 0, Math.PI / 2); });
S('top', (k, s, c, d) => { if (d.id === 'metronome') { k.cone(0, 0, 0, s[0] * 0.6, s[1], c); k.box(0, s[1] * 0.1, s[2] * 0.3, 0.005, s[1] * 0.7, 0.005, 0xd4af37); return; } k.cone(0, -s[1] * 0.1, 0, s[0] / 2, s[1] * 0.6, c, Math.PI); k.cyl(0, s[1] * 0.3, 0, 0.006, s[1] * 0.4, 0x5d4037); });
S('yoyo', (k, s, c) => { k.cyl(0, 0, -s[1] * 0.25, s[0] / 2, s[1] * 0.45, c, Math.PI / 2); k.cyl(0, 0, s[1] * 0.25, s[0] / 2, s[1] * 0.45, c, Math.PI / 2); });
S('rubik', (k, s) => { const cols = [0xffffff, 0xffeb3b, 0xe53935, 0xff9800, 0x1e88e5, 0x43a047]; const e = s[0] / 3; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) k.box(x * e, y * e, z * e, e * 0.94, e * 0.94, e * 0.94, cols[(x + y * 2 + z * 3 + 9) % 6]); });
S('xylo', (k, s) => { const cols = [0xe53935, 0xff9800, 0xffeb3b, 0x43a047, 0x1e88e5, 0x3949ab, 0x8e24aa, 0xec407a]; for (let i = 0; i < 8; i++) k.box(-s[0] / 2 + (i + 0.5) * s[0] / 8, 0, 0, s[0] / 9, s[1] * 0.4, s[2] * (1 - i * 0.06), cols[i]); k.box(0, -s[1] * 0.3, -s[2] * 0.3, s[0], s[1] * 0.3, 0.02, 0x8d6e63); k.box(0, -s[1] * 0.3, s[2] * 0.3, s[0], s[1] * 0.3, 0.02, 0x8d6e63); });
S('drum', (k, s, c) => { k.cyl(0, 0, 0, s[0] / 2, s[1], c); k.cyl(0, s[1] / 2, 0, s[0] / 2 * 1.01, 0.005, 0xfafafa); k.torus(0, s[1] * 0.45, 0, s[0] * 0.46, 0xffd600, Math.PI / 2, 0, 0, true); });
S('gun', (k, s, c) => { k.box(0, s[1] * 0.2, 0, s[0], s[1] * 0.3, s[2], c); k.box(0, -s[1] * 0.15, -s[2] * 0.25, s[0] * 0.8, s[1] * 0.55, s[2] * 0.25, shade(c, 0.8)); k.cyl(0, s[1] * 0.2, s[2] * 0.55, s[1] * 0.1, s[2] * 0.15, 0xffeb3b, Math.PI / 2); });
S('horn', (k, s, c) => { const L = s[2]; k.cyl(0, 0, -L * 0.15, Math.min(s[0], s[1]) * 0.15, L * 0.7, c, Math.PI / 2); k.cone(0, 0, L * 0.35, Math.min(s[0], s[1]) * 0.5, L * 0.3, c, -Math.PI / 2); });
S('dice', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); for (const [x, y, z] of [[0, 0, 1], [0, 1, 0], [1, 0, 0], [-0.3, -1, 0.3], [-1, 0.3, 0.3]]) k.sph(x * s[0] * 0.5, y * s[1] * 0.5, z * s[2] * 0.5, s[0] * 0.08, s[0] * 0.08, s[0] * 0.08, 0x111111, true); });
S('bone', (k, s, c) => { k.cyl(0, 0, 0, s[0] * 0.25, s[2] * 0.8, c, Math.PI / 2); k.sph(-s[0] * 0.25, 0, s[2] * 0.42, s[0] * 0.3, s[0] * 0.3, s[0] * 0.3, c); k.sph(s[0] * 0.25, 0, s[2] * 0.42, s[0] * 0.3, s[0] * 0.3, s[0] * 0.3, c); k.sph(-s[0] * 0.25, 0, -s[2] * 0.42, s[0] * 0.3, s[0] * 0.3, s[0] * 0.3, c); k.sph(s[0] * 0.25, 0, -s[2] * 0.42, s[0] * 0.3, s[0] * 0.3, s[0] * 0.3, c); });

// ───────── alimentation ─────────
S('fruit', (k, s, c, d) => { k.sph(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c); if (d.id !== 'lemon') k.cyl(0, s[1] * 0.5, 0, 0.004, s[1] * 0.25, 0x5d4037); if (d.id === 'tomato') k.cone(0, s[1] * 0.48, 0, s[0] * 0.25, 0.01, 0x2e7d32); });
S('banana', (k, s, c) => { for (let i = -2; i <= 2; i++) k.cylS(i * 0.004, Math.abs(i) * s[2] * 0.06, i * s[2] * 0.18, s[0] * 0.45, s[2] * 0.24, s[0] * 0.45, c, Math.PI / 2 - i * 0.25, 0, 0); });
S('baguette', (k, s, c) => { k.cap(0, 0, 0, s[0] / 2, s[2], c, Math.PI / 2); for (let i = -2; i <= 2; i++) k.boxR(0, s[1] * 0.42, i * s[2] * 0.17, s[0] * 0.5, 0.006, s[2] * 0.07, shade(c, 1.25), 0, 0.4, 0); });
S('croissant', (k, s, c) => { for (let i = -2; i <= 2; i++) { const a = i * 0.45; k.sph(Math.sin(a) * s[0] * 0.38, 0, Math.cos(a) * s[2] * 0.4 - s[2] * 0.2, s[0] * (0.2 - Math.abs(i) * 0.04), s[1] * 0.5, s[0] * 0.17, i % 2 ? c : shade(c, 1.15)); } });
S('cake', (k, s, c, d) => { k.cyl(0, -s[1] * 0.1, 0, s[0] / 2, s[1] * 0.8, c); k.cyl(0, s[1] * 0.32, 0, s[0] / 2 * 0.98, s[1] * 0.16, d.id === 'tarte' ? 0xd32f2f : shade(c, 1.1)); if (d.id === 'birthday_cake') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.cyl(Math.cos(a) * s[0] * 0.3, s[1] * 0.55, Math.sin(a) * s[0] * 0.3, 0.004, 0.05, 0x42a5f5); } k.meta.candles = true; } if (d.id === 'muffin') { k.sph(0, s[1] * 0.35, 0, s[0] * 0.55, s[1] * 0.3, s[0] * 0.55, 0x6d4c41); } });
S('carton', (k, s, c, d) => { const r = k.label(d.id, d.label || d.name, c); k.box(0, -s[1] * 0.08, 0, s[0], s[1] * 0.84, s[2], c, { label: { face: 'zZxX', rect: r } }); k.boxR(0, s[1] * 0.4, 0, s[0] * 0.98, s[1] * 0.12, s[2] * 0.5, c, 0, 0, 0); k.cyl(s[0] * 0.2, s[1] * 0.48, 0, 0.012, 0.02, 0x1e88e5); });
S('bottle', (k, s, c, d) => { const r = k.label(d.id, d.label || d.name, c); k.b.geometry(U.cyl, mat(0, -s[1] * 0.15, 0, s[0], s[1] * 0.65, s[2]), { color: c, rect: r }); k.cone(0, s[1] * 0.25, 0, s[0] / 2, s[1] * 0.2, c); k.cyl(0, s[1] * 0.42, 0, s[0] * 0.18, s[1] * 0.14, shade(c, 0.6)); });
S('wine', (k, s, c, d) => { k.cyl(0, -s[1] * 0.15, 0, s[0] / 2, s[1] * 0.68, c); k.sph(0, s[1] * 0.19, 0, s[0] / 2, s[1] * 0.08, s[0] / 2, c); k.cyl(0, s[1] * 0.35, 0, s[0] * 0.16, s[1] * 0.28, c); k.cyl(0, s[1] * 0.46, 0, s[0] * 0.17, s[1] * 0.08, d.id === 'champagne' ? 0xffd700 : 0x7b1f1f); k.cyl(0, -s[1] * 0.12, 0, s[0] / 2 * 1.01, s[1] * 0.25, 0xf5f0e0); });
S('bag', (k, s, c, d) => { const r = k.label(d.id, d.label || d.name, c); k.box(0, 0, 0, s[0], s[1] * 0.9, s[2], c, { label: { face: 'zZ', rect: r } }); k.boxR(0, s[1] * 0.46, 0, s[0] * 0.95, s[1] * 0.06, s[2] * 0.3, shade(c, 0.85), 0, 0, 0); });
S('jar', (k, s, c) => { k.cyl(0, -s[1] * 0.08, 0, s[0] / 2, s[1] * 0.84, c); k.cyl(0, s[1] * 0.42, 0, s[0] * 0.45, s[1] * 0.16, 0xd4af37); });
S('pills', (k, s, c, d) => { const r = k.label(d.id, d.name.split(' ')[0], c); k.box(0, 0, 0, s[0], s[1], s[2], c, { label: { face: 'Y', rect: r } }); });
S('pizza', (k, s, c) => { k.cyl(0, 0, 0, s[0] / 2, s[1], 0xd4a056); k.cyl(0, s[1] * 0.5, 0, s[0] * 0.45, s[1] * 0.3, 0xd84315); const rnd = mulberry32(5); for (let i = 0; i < 10; i++) k.cyl((rnd() - 0.5) * s[0] * 0.6, s[1] * 0.7, (rnd() - 0.5) * s[0] * 0.6, 0.02, 0.005, i % 2 ? 0x8d2a2a : 0xfff8e1); });
S('burger', (k, s, c) => { k.sph(0, s[1] * 0.25, 0, s[0] / 2, s[1] * 0.3, s[2] / 2, 0xd4a056); k.cyl(0, 0, 0, s[0] * 0.48, s[1] * 0.2, 0x5d3a1a); k.cyl(0, s[1] * 0.1, 0, s[0] * 0.5, s[1] * 0.06, 0x7cb342); k.cyl(0, s[1] * 0.12, 0, s[0] * 0.47, s[1] * 0.05, 0xffc107); k.cyl(0, -s[1] * 0.3, 0, s[0] * 0.48, s[1] * 0.2, 0xd4a056); });
S('fries', (k, s, c, d) => { k.box(0, -s[1] * 0.15, 0, s[0], s[1] * 0.7, s[2], c); const rnd = mulberry32(d.id.length); for (let i = 0; i < 9; i++) k.box((rnd() - 0.5) * s[0] * 0.7, s[1] * 0.22, (rnd() - 0.5) * s[2] * 0.6, 0.01, s[1] * 0.4, 0.01, d.id === 'popcorn' ? 0xfffde7 : 0xffd54f); });
S('cup', (k, s, c, d) => { k.cylS(0, 0, 0, s[0] / 2, s[1], s[2] / 2, c); k.cyl(0, s[1] * 0.48, 0, s[0] * 0.44, 0.005, d.id === 'coffee' ? 0x3e2723 : d.id === 'milkshake' ? 0xf8bbd0 : 0x8d6e63); if (d.mat === 'ceramic') k.torus(s[0] * 0.55, 0, 0, s[1] * 0.18, c, 0, 0, 0, true); });
S('lollipop', (k, s, c) => { k.cyl(0, s[1] * 0.2, 0, s[0] / 2, s[2], c, Math.PI / 2); k.cyl(0, -s[1] * 0.2, 0, 0.004, s[1] * 0.6, 0xffffff); });
S('cotton_candy', (k, s, c) => { k.sph(0, s[1] * 0.15, 0, s[0] / 2, s[1] * 0.35, s[2] / 2, c); k.cyl(0, -s[1] * 0.3, 0, 0.005, s[1] * 0.4, 0xffffff); });

// ───────── fleurs ─────────
S('bouquet', (k, s, c) => { k.cone(0, -s[1] * 0.2, 0, s[0] * 0.35, s[1] * 0.6, 0xfafafa, Math.PI); for (let i = 0; i < 7; i++) { const a = i * 0.9; k.cyl(Math.cos(a) * 0.03, s[1] * 0.1, Math.sin(a) * 0.03, 0.004, s[1] * 0.5, 0x2e7d32); k.sph(Math.cos(a) * s[0] * 0.3, s[1] * 0.38, Math.sin(a) * s[0] * 0.3, s[0] * 0.18, s[0] * 0.15, s[0] * 0.18, c); } });
S('flowerpot', (k, s, c, d) => { k.cone(0, -s[1] * 0.35, 0, s[0] * 0.5, s[1] * 0.3, 0xa1543a, Math.PI); k.cyl(0, -s[1] * 0.2, 0, s[0] * 0.48, 0.01, 0x3e2723); if (d.id === 'bonsai') { k.cyl(0, -s[1] * 0.05, 0, 0.02, s[1] * 0.3, 0x5d4037, 0, 0, 0.3); k.sph(0.04, s[1] * 0.2, 0, s[0] * 0.4, s[1] * 0.2, s[2] * 0.4, c); return; } k.cyl(0, s[1] * 0.1, 0, 0.006, s[1] * 0.6, 0x2e7d32); k.sph(0, s[1] * 0.4, 0, s[0] * 0.25, s[0] * 0.2, s[0] * 0.25, c); k.sph(0.03, s[1] * 0.05, 0, s[0] * 0.15, 0.01, s[0] * 0.08, 0x43a047); });
S('cactus', (k, s, c) => { k.cone(0, -s[1] * 0.38, 0, s[0] * 0.5, s[1] * 0.25, 0xa1543a, Math.PI); k.cap(0, s[1] * 0.05, 0, s[0] * 0.25, s[1] * 0.55, c); k.cap(s[0] * 0.3, s[1] * 0.1, 0, s[0] * 0.12, s[1] * 0.2, c); });
S('watering', (k, s, c) => { k.cyl(0, 0, 0, s[1] * 0.45, s[1] * 0.9, c); k.cyl(s[0] * 0.3, s[1] * 0.1, 0, 0.012, s[0] * 0.6, c, 0, 0, -1.0); k.torus(-s[0] * 0.15, s[1] * 0.3, 0, s[1] * 0.25, c, 0, 0, 0, true); });

// ───────── bijoux ─────────
S('ring', (k, s, c, d) => { k.torus(0, 0, 0, s[0] * 0.4, c, Math.PI / 2, 0, 0, true); if (d.id === 'diamond_ring') k.sph(0, s[1] * 0.4, 0, 0.006, 0.006, 0.006, 0xe0f7fa); if (d.id === 'cursed_brooch') k.cyl(0, 0, 0, s[0] * 0.45, 0.004, 0xcfd8dc, Math.PI / 2); });
S('necklace', (k, s, c) => { k.torus(0, 0, 0, s[0] * 0.45, c, Math.PI / 2, 0, 0, true); k.sph(0, 0, s[2] * 0.5, 0.01, 0.012, 0.006, 0xe0f7fa); });
S('watch', (k, s, c) => { k.cyl(0, 0, 0, s[0] * 0.38, s[1], c); k.cyl(0, s[1] * 0.5, 0, s[0] * 0.33, 0.002, 0xfafafa); k.box(0, 0, 0, s[0] * 0.3, s[1] * 0.6, s[2] * 1.6, 0x3e2723); });

// ───────── papier ─────────
S('newspaper', (k, s, c, d) => { const r = k.label(d.id, d.id === 'old_newspaper' ? 'L\'ÉCHO 1987' : 'LE JOURNAL', 0xffffff); k.box(0, 0, 0, s[0], s[1], s[2], c, { label: { face: 'Y', rect: r } }); });
S('book', (k, s, c, d) => { const r = k.label(d.id, d.name.replace(/^(Roman|Album|Livre de|Manuel d')\s*/i, '').replace(/[«»]/g, ''), c); k.box(0, 0, 0, s[0], s[1], s[2], c, { label: { face: 'zZ', rect: r } }); k.box(s[0] * 0.02, 0, 0, s[0] * 0.94, s[1] * 0.96, s[2] * 0.9, 0xfff8e1, { faces: 'X' }); });

// ───────── électronique ─────────
S('tv', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, -s[1] / 2 - 0.12, -0.02, 0.25, 0.02, 0.18, 0x222222); k.box(0, -s[1] / 2 - 0.06, -0.02, 0.05, 0.12, 0.03, 0x222222); k.meta.screen = { x: 0, y: 0, z: s[2] / 2 + 0.002, w: s[0] * 0.95, h: s[1] * 0.92 }; });
S('crt', (k, s, c) => { k.box(0, 0, -s[2] * 0.05, s[0], s[1], s[2] * 0.9, c); k.box(0, -s[1] * 0.02, -s[2] * 0.4, s[0] * 0.7, s[1] * 0.7, s[2] * 0.3, shade(c, 0.8)); k.box(s[0] * 0.38, -s[1] * 0.3, s[2] * 0.4, 0.06, 0.12, 0.01, 0x111111); k.meta.screen = { x: -s[0] * 0.08, y: s[1] * 0.04, z: s[2] * 0.4 + 0.003, w: s[0] * 0.66, h: s[1] * 0.72 }; });
S('microwave', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(-s[0] * 0.12, 0, s[2] / 2, s[0] * 0.68, s[1] * 0.8, 0.004, 0x111111); k.box(s[0] * 0.37, 0, s[2] / 2, s[0] * 0.2, s[1] * 0.8, 0.004, 0x333333); k.box(s[0] * 0.37, s[1] * 0.25, s[2] / 2 + 0.003, s[0] * 0.14, s[1] * 0.12, 0.003, 0x113311); k.meta.door = { x: -s[0] * 0.12, y: 0, z: s[2] / 2, w: s[0] * 0.7, h: s[1] * 0.85 }; k.meta.display = [s[0] * 0.37, s[1] * 0.25, s[2] / 2 + 0.005]; });
S('oven_big', (k, s, c) => { k.box(0, -s[1] * 0.25, 0, s[0], s[1] * 0.5, s[2], 0x9e9e9e); k.sph(0, s[1] * 0.1, 0, s[0] * 0.5, s[1] * 0.45, s[2] * 0.5, c); k.box(0, s[1] * 0.05, s[2] * 0.45, s[0] * 0.4, s[1] * 0.2, 0.05, 0x111111); k.cyl(0, s[1] * 0.45, -s[2] * 0.2, 0.08, s[1] * 0.3, 0x5d4037); k.meta.glow = [0, s[1] * 0.05, s[2] * 0.48]; });
S('blender', (k, s, c) => { k.box(0, -s[1] * 0.35, 0, s[0], s[1] * 0.3, s[2], c); k.cone(0, s[1] * 0.12, 0, s[0] * 0.45, s[1] * 0.65, 0xcfe8ef, Math.PI); k.cyl(0, s[1] * 0.47, 0, s[0] * 0.42, s[1] * 0.06, 0x222222); });
S('toaster', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(-s[0] * 0.18, s[1] / 2, 0, s[0] * 0.12, 0.004, s[2] * 0.7, 0x111111); k.box(s[0] * 0.18, s[1] / 2, 0, s[0] * 0.12, 0.004, s[2] * 0.7, 0x111111); k.box(s[0] / 2 + 0.01, s[1] * 0.2, 0, 0.02, 0.03, 0.03, 0x222222); });
S('kettle', (k, s, c) => { k.cyl(0, -s[1] * 0.05, 0, s[0] * 0.45, s[1] * 0.85, c); k.cyl(0, -s[1] * 0.47, 0, s[0] * 0.5, s[1] * 0.06, 0x333333); k.torus(-s[0] * 0.45, 0, 0, s[1] * 0.25, 0x333333, 0, 0, 0, true); k.cone(s[0] * 0.5, s[1] * 0.2, 0, 0.03, 0.1, c, 0, 0, -1.2); });
S('fan', (k, s, c) => { k.cyl(0, -s[1] * 0.47, 0, s[0] * 0.35, 0.03, c); k.cyl(0, -s[1] * 0.15, 0, 0.015, s[1] * 0.6, c); k.torus(0, s[1] * 0.25, 0, s[0] * 0.45, 0xbdbdbd, 0, 0, 0, true); k.cyl(0, s[1] * 0.25, -0.02, 0.05, 0.08, c, Math.PI / 2); k.meta.blades = [0, s[1] * 0.25, 0.02, s[0] * 0.4]; });
S('lamp', (k, s, c, d) => { if (d.id === 'nightlight') { k.sph(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c); k.meta.light = [0, 0, 0]; return; } k.cyl(0, -s[1] * 0.45, 0, s[0] * 0.3, s[1] * 0.08, 0x8d6e63); k.cyl(0, -s[1] * 0.1, 0, 0.012, s[1] * 0.6, 0x8d6e63); k.cone(0, s[1] * 0.3, 0, s[0] * 0.5, s[1] * 0.35, c); k.meta.light = [0, s[1] * 0.25, 0]; });
S('lavalamp', (k, s, c) => { k.cone(0, -s[1] * 0.38, 0, s[0] * 0.5, s[1] * 0.25, 0x9e9e9e); k.cyl(0, s[1] * 0.08, 0, s[0] * 0.35, s[1] * 0.6, 0xffcc80); k.sph(0, 0, 0, s[0] * 0.2, s[0] * 0.3, s[0] * 0.2, c); k.cone(0, s[1] * 0.44, 0, s[0] * 0.3, s[1] * 0.1, 0x9e9e9e); k.meta.light = [0, 0, 0]; });
S('vacuum', (k, s, c) => { k.box(0, -s[1] * 0.2, 0, s[0], s[1] * 0.55, s[2], c); k.cyl(0, s[1] * 0.15, s[2] * 0.4, 0.02, s[1] * 0.6, 0x333333, 0.4, 0, 0); k.cyl(-s[0] * 0.4, -s[1] * 0.4, -s[2] * 0.3, 0.06, 0.04, 0x111111, 0, 0, Math.PI / 2); k.cyl(s[0] * 0.4, -s[1] * 0.4, -s[2] * 0.3, 0.06, 0.04, 0x111111, 0, 0, Math.PI / 2); });
S('washer', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] * 0.42, s[2] / 2, s[0], s[1] * 0.12, 0.01, 0xdddddd); if (d.id === 'fryer') { k.box(0, s[1] / 2, 0, s[0] * 0.8, 0.02, s[2] * 0.7, 0x5d4037); return; } k.cyl(0, -s[1] * 0.05, s[2] / 2 + 0.01, s[0] * 0.32, 0.02, 0x37474f, Math.PI / 2); k.cyl(0, -s[1] * 0.05, s[2] / 2 + 0.02, s[0] * 0.26, 0.01, 0x7da8c0, Math.PI / 2); k.meta.drum = [0, -s[1] * 0.05, s[2] / 2 + 0.025, s[0] * 0.26]; });
S('fridge', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] * 0.18, s[2] / 2 + 0.003, s[0] * 0.98, 0.01, 0.005, 0x9e9e9e); k.box(s[0] * 0.4, s[1] * 0.3, s[2] / 2 + 0.03, 0.02, 0.3, 0.03, 0xbdbdbd); k.meta.door = { x: 0, y: -s[1] * 0.1, z: s[2] / 2, w: s[0], h: s[1] * 0.8 }; });
S('freezer', (k, s, c) => { k.box(0, -s[1] * 0.08, 0, s[0], s[1] * 0.84, s[2], c); k.box(0, s[1] * 0.42, 0, s[0], 0.03, s[2], 0xcfe8ef); k.meta.lid = true; });
S('coffee_maker', (k, s, c, d) => { k.box(0, 0, -s[2] * 0.15, s[0], s[1], s[2] * 0.7, c); k.box(0, s[1] * 0.42, s[2] * 0.15, s[0], s[1] * 0.16, s[2] * 0.4, c); k.box(0, -s[1] * 0.45, s[2] * 0.2, s[0] * 0.8, s[1] * 0.06, s[2] * 0.4, 0x555555); k.box(0, s[1] * 0.25, s[2] * 0.2, s[0] * 0.2, s[1] * 0.08, 0.005, 0x113311); if (d.id === 'soda_fountain') { for (let i = -1; i <= 1; i++) k.box(i * s[0] * 0.28, s[1] * 0.05, s[2] * 0.25, s[0] * 0.2, s[1] * 0.2, 0.01, [0xd50000, 0xc0ca33, 0xff9800][i + 1]); } k.meta.spout = [0, s[1] * 0.25, s[2] * 0.25]; });
S('cotton', (k, s, c) => { k.cyl(0, -s[1] * 0.3, 0, s[0] * 0.3, s[1] * 0.4, c); k.cyl(0, s[1] * 0.05, 0, s[0] * 0.5, s[1] * 0.25, 0xeeeeee); k.cyl(0, s[1] * 0.18, 0, s[0] * 0.48, 0.005, 0xf8bbd0); });
S('radio', (k, s, c, d) => { if (d.p?.speaker) { k.cyl(0, 0, 0, s[0] / 2, s[1], c); return; } k.box(0, 0, 0, s[0], s[1], s[2], c); k.cyl(-s[0] * 0.25, 0, s[2] / 2, s[1] * 0.35, 0.01, 0x3e2723, Math.PI / 2); k.box(s[0] * 0.2, s[1] * 0.15, s[2] / 2, s[0] * 0.4, s[1] * 0.25, 0.006, 0xfff3c0); k.cyl(s[0] * 0.3, -s[1] * 0.25, s[2] / 2, 0.015, 0.02, 0x222222, Math.PI / 2); k.cyl(s[0] * 0.4, s[1] * 0.5 + 0.1, -s[2] * 0.3, 0.003, 0.2, 0x999999); k.meta.dial = [s[0] * 0.2, s[1] * 0.15, s[2] / 2 + 0.004]; });
S('iron', (k, s, c) => { k.box(0, -s[1] * 0.3, 0, s[0], s[1] * 0.35, s[2], 0xcfd8dc); k.box(0, s[1] * 0.1, -s[2] * 0.05, s[0] * 0.8, s[1] * 0.3, s[2] * 0.75, c); k.box(0, s[1] * 0.4, -s[2] * 0.1, s[0] * 0.4, s[1] * 0.2, s[2] * 0.5, 0x333333); });
S('console', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] / 2, s[2] * 0.2, s[0] * 0.3, 0.004, 0.08, 0x333333); k.box(s[0] * 0.35, s[1] * 0.2, s[2] / 2, 0.02, 0.01, 0.004, 0xff1744); k.box(-s[0] * 0.4, 0, s[2] / 2 + 0.08, 0.12, 0.03, 0.08, 0x212121); });
S('controller', (k, s, c) => { k.box(0, 0, 0, s[0] * 0.6, s[1], s[2] * 0.6, c); k.sph(-s[0] * 0.32, 0, s[2] * 0.1, s[0] * 0.2, s[1] * 0.6, s[2] * 0.35, c); k.sph(s[0] * 0.32, 0, s[2] * 0.1, s[0] * 0.2, s[1] * 0.6, s[2] * 0.35, c); k.cyl(s[0] * 0.2, s[1] * 0.5, 0, 0.008, 0.006, 0xe53935); k.cyl(-s[0] * 0.2, s[1] * 0.5, 0, 0.01, 0.006, 0x444444); });
S('handheld', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] * 0.18, s[2] / 2, s[0] * 0.75, s[1] * 0.42, 0.003, 0x8bac0f); k.box(-s[0] * 0.22, -s[1] * 0.22, s[2] / 2, 0.025, 0.008, 0.004, 0x222222); k.box(-s[0] * 0.22, -s[1] * 0.22, s[2] / 2, 0.008, 0.025, 0.004, 0x222222); k.cyl(s[0] * 0.2, -s[1] * 0.2, s[2] / 2, 0.008, 0.004, 0x9c27b0, Math.PI / 2); k.meta.screen = { x: 0, y: s[1] * 0.18, z: s[2] / 2 + 0.002, w: s[0] * 0.75, h: s[1] * 0.42 }; });
S('vr', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2] * 0.6, c); k.torus(0, 0, -s[2] * 0.3, s[0] * 0.45, 0x222222, Math.PI / 2, 0, 0, true); });
S('headset', (k, s, c) => { k.torus(0, s[1] * 0.1, 0, s[0] * 0.42, 0x222222, 0, Math.PI / 2, 0, true); k.cyl(-s[0] * 0.42, -s[1] * 0.2, 0, s[1] * 0.25, 0.04, c, 0, 0, Math.PI / 2); k.cyl(s[0] * 0.42, -s[1] * 0.2, 0, s[1] * 0.25, 0.04, c, 0, 0, Math.PI / 2); });
S('turntable', (k, s, c) => { k.box(0, -s[1] * 0.2, 0, s[0], s[1] * 0.6, s[2], c); k.cyl(-s[0] * 0.1, s[1] * 0.15, 0, s[2] * 0.42, 0.015, 0x222222); k.cyl(-s[0] * 0.1, s[1] * 0.16, 0, 0.004, 0.02, 0xc0c0c0); k.box(s[0] * 0.32, s[1] * 0.2, -s[2] * 0.2, 0.012, 0.012, s[2] * 0.5, 0xc0c0c0, { ry: 0.3 }); k.meta.platter = [-s[0] * 0.1, s[1] * 0.16, 0]; });
S('vcr', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(-s[0] * 0.1, 0, s[2] / 2, s[0] * 0.5, s[1] * 0.25, 0.004, 0x111111); k.box(s[0] * 0.3, 0, s[2] / 2, s[0] * 0.2, s[1] * 0.3, 0.004, 0x003311); k.meta.display = [s[0] * 0.3, 0, s[2] / 2 + 0.003]; });
S('vinyl', (k, s, c, d) => { const r = k.label(d.id, d.label || d.name, c, 'vinyl'); k.box(0, 0, 0, s[0], s[1], s[2], c, { label: { face: 'zZ', rect: r } }); });
S('vhs', (k, s, c, d) => { const r = k.label(d.id, d.label || d.name, c, 'vhs'); k.box(0, 0, 0, s[0], s[1], s[2], 0x1a1a1a, { label: { face: 'Y', rect: r } }); k.box(0, 0, s[2] / 2, s[0] * 0.95, s[1] * 0.7, 0.002, 0xeeeeee); });
S('cart', (k, s, c, d) => {
  if (d.id === 'shopping_cart') {
    const w = s[0], h = s[1], L = s[2];
    for (const x of [-1, 1]) { k.box(x * w * 0.45, h * 0.15, 0, 0.02, h * 0.45, L * 0.9, c); }
    k.box(0, h * 0.15, L * 0.45, w * 0.9, h * 0.45, 0.02, c); k.box(0, h * 0.15, -L * 0.42, w * 0.9, h * 0.45, 0.02, c);
    k.box(0, -h * 0.08, 0, w * 0.9, 0.02, L * 0.88, c);
    for (let i = -3; i <= 3; i++) k.box(0, h * 0.15, i * L * 0.12, w * 0.9, h * 0.44, 0.005, shade(c, 0.9), { faces: 'zZ' });
    k.cyl(0, h * 0.45, -L * 0.48, 0.02, w * 0.95, 0xd32f2f, 0, 0, Math.PI / 2);
    k.box(0, -h * 0.35, 0, w * 0.6, 0.03, L * 0.7, c);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(x * w * 0.35, -h * 0.45, z * L * 0.38, 0.05, 0.03, 0x222222, 0, 0, Math.PI / 2);
    return;
  }
  // cartouche de jeu
  const r = k.label(d.id, d.name.replace(/Cartouche «\s*|\s*»/g, ''), c); k.box(0, 0, 0, s[0], s[1], s[2], 0x9e9e9e, { label: { face: 'Z', rect: r } }); k.box(0, -s[1] * 0.45, 0, s[0] * 0.8, s[1] * 0.1, s[2] * 0.6, 0xd4af37);
});
S('globe', (k, s, c) => { k.sph(0, s[1] * 0.1, 0, s[0] * 0.42, s[0] * 0.42, s[0] * 0.42, c); k.sph(0.04, s[1] * 0.15, 0.1, s[0] * 0.2, s[0] * 0.18, s[0] * 0.08, 0x43a047, true); k.torus(0, s[1] * 0.1, 0, s[0] * 0.46, 0xd4af37, 0, 0, 0.4, true); k.cyl(0, -s[1] * 0.42, 0, s[0] * 0.25, 0.04, 0x5d4037); k.cyl(0, -s[1] * 0.3, 0, 0.01, s[1] * 0.2, 0xd4af37); });
S('glasses', (k, s, c, d) => { const lens = d.p?.mode === 'anaglyph' ? null : 0x111111; k.torus(-s[0] * 0.25, 0, 0, s[1] * 0.45, c, 0, 0, 0, true); k.torus(s[0] * 0.25, 0, 0, s[1] * 0.45, c, 0, 0, 0, true); if (d.p?.mode === 'anaglyph') { k.cyl(-s[0] * 0.25, 0, 0, s[1] * 0.42, 0.003, 0xff0000, Math.PI / 2); k.cyl(s[0] * 0.25, 0, 0, s[1] * 0.42, 0.003, 0x00e5ff, Math.PI / 2); } else k.cyl(-s[0] * 0.25, 0, 0, s[1] * 0.42, 0.003, lens, Math.PI / 2), k.cyl(s[0] * 0.25, 0, 0, s[1] * 0.42, 0.003, lens, Math.PI / 2); k.box(-s[0] * 0.5, 0, -s[2] * 0.4, 0.005, 0.008, s[2] * 0.8, c); k.box(s[0] * 0.5, 0, -s[2] * 0.4, 0.005, 0.008, s[2] * 0.8, c); });
S('goggles', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2] * 0.5, c); k.cyl(-s[0] * 0.22, 0, s[2] * 0.35, s[1] * 0.4, s[2] * 0.3, 0x111111, Math.PI / 2); k.cyl(s[0] * 0.22, 0, s[2] * 0.35, s[1] * 0.4, s[2] * 0.3, 0x111111, Math.PI / 2); });
S('binoculars', (k, s, c) => { k.cyl(-s[0] * 0.25, 0, 0, s[1] * 0.45, s[2], c, Math.PI / 2); k.cyl(s[0] * 0.25, 0, 0, s[1] * 0.45, s[2], c, Math.PI / 2); k.box(0, 0, 0, s[0] * 0.3, s[1] * 0.3, s[2] * 0.4, 0x111111); });
S('magnifier', (k, s, c) => { k.torus(0, 0, s[2] * 0.25, s[0] * 0.45, 0x5d4037, Math.PI / 2); k.cyl(0, 0, s[2] * 0.25, s[0] * 0.42, 0.004, 0xcfe8ef); k.cyl(0, 0, -s[2] * 0.2, 0.01, s[2] * 0.5, 0x5d4037, Math.PI / 2); });
S('perfume', (k, s, c) => { k.box(0, -s[1] * 0.1, 0, s[0], s[1] * 0.75, s[2], c); k.cyl(0, s[1] * 0.35, 0, s[0] * 0.15, s[1] * 0.15, 0xd4af37); k.sph(0, s[1] * 0.45, 0, s[0] * 0.2, s[0] * 0.15, s[0] * 0.2, 0x111111); });
S('shirt', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] * 0.4, -s[2] * 0.35, s[0] * 0.3, s[1] * 0.3, s[2] * 0.2, shade(c, 0.85)); });
S('hat', (k, s, c, d) => { if (d.id === 'helmet') { k.sph(0, 0, 0, s[0] / 2, s[1], s[2] / 2, c); k.cyl(0, -s[1] * 0.4, 0.02, s[0] * 0.55, 0.01, c); return; } if (d.id === 'cap') { k.sph(0, 0, -0.02, s[0] / 2, s[1] * 0.9, s[0] / 2, c); k.box(0, -s[1] * 0.35, s[2] * 0.3, s[0] * 0.8, 0.01, s[2] * 0.35, c); return; } k.cyl(0, -s[1] * 0.45, 0, s[0] / 2, 0.012, c); k.cyl(0, 0, 0, s[0] * 0.3, s[1] * 0.9, c); k.cyl(0, -s[1] * 0.25, 0, s[0] * 0.31, s[1] * 0.15, 0x222222); });
S('shoe', (k, s, c, d) => { k.box(0, -s[1] * 0.35, 0, s[0], s[1] * 0.3, s[2], d.id === 'sneakers' ? 0xffffff : shade(c, 0.6)); k.sph(0, -s[1] * 0.05, -s[2] * 0.1, s[0] * 0.5, s[1] * 0.4, s[2] * 0.45, c); if (d.id === 'heels') k.cyl(0, -s[1] * 0.3, -s[2] * 0.42, 0.008, s[1] * 0.4, 0x111111); if (d.id === 'boots') k.cyl(0, s[1] * 0.2, -s[2] * 0.2, s[0] * 0.48, s[1] * 0.6, c); });
S('racket', (k, s, c) => { k.torus(0, s[1] * 0.2, 0, s[0] * 0.45, c, 0, 0, 0, true, 1.3); k.cyl(0, -s[1] * 0.25, 0, 0.012, s[1] * 0.5, 0x222222); k.box(0, s[1] * 0.2, 0, s[0] * 0.75, s[1] * 0.45, 0.002, 0xeeeeee); });
S('dumbbell', (k, s, c) => { k.cyl(0, 0, 0, 0.015, s[0], 0x9e9e9e, 0, 0, Math.PI / 2); k.cyl(-s[0] * 0.38, 0, 0, s[1] / 2, s[0] * 0.2, c, 0, 0, Math.PI / 2); k.cyl(s[0] * 0.38, 0, 0, s[1] / 2, s[0] * 0.2, c, 0, 0, Math.PI / 2); });
S('skate', (k, s, c) => { k.box(0, s[1] * 0.2, 0, s[0], s[1] * 0.15, s[2], c); for (const z of [-1, 1]) { k.box(0, -s[1] * 0.05, z * s[2] * 0.35, s[0] * 0.6, 0.02, 0.04, 0x9e9e9e); for (const x of [-1, 1]) k.cyl(x * s[0] * 0.35, -s[1] * 0.25, z * s[2] * 0.35, 0.028, 0.035, 0xfff176, 0, 0, Math.PI / 2); } });
S('tent', (k, s, c) => { k.boxR(-s[0] * 0.25, 0, 0, s[0] * 0.03, s[1] * 1.15, s[2], c, 0, 0, -0.52); k.boxR(s[0] * 0.25, 0, 0, s[0] * 0.03, s[1] * 1.15, s[2], c, 0, 0, 0.52); k.box(0, -s[1] / 2 + 0.01, 0, s[0], 0.02, s[2], shade(c, 0.5)); k.box(0, 0, -s[2] / 2, s[0] * 0.5, s[1] * 0.8, 0.02, shade(c, 0.8)); });
S('bike', (k, s, c) => { k.box(0, -s[1] * 0.45, 0, s[0] * 0.8, 0.06, s[2] * 0.9, 0x333333); k.cyl(0, -s[1] * 0.1, s[2] * 0.3, s[1] * 0.3, 0.06, 0x111111, 0, 0, Math.PI / 2); k.box(0, 0, -s[2] * 0.1, 0.06, s[1] * 0.6, 0.06, c, { ry: 0 }); k.box(0, s[1] * 0.3, -s[2] * 0.25, 0.25, 0.06, 0.12, 0x111111); k.box(0, s[1] * 0.35, s[2] * 0.35, s[0] * 0.8, 0.04, 0.04, c); k.box(0, s[1] * 0.1, s[2] * 0.35, 0.05, s[1] * 0.5, 0.05, c); });
S('hoop', (k, s, c, d) => { if (d.p?.arcade) { k.box(0, -s[1] * 0.35, 0, s[0], s[1] * 0.3, s[2], 0x1565c0); k.boxR(0, -s[1] * 0.15, 0, s[0] * 0.95, 0.04, s[2] * 0.9, 0x0d47a1, -0.25, 0, 0); for (const x of [-1, 1]) k.box(x * s[0] * 0.48, 0.1, -s[2] * 0.4, 0.05, s[1] * 0.9, 0.05, 0x111111); } k.box(0, s[1] * 0.3, -s[2] * 0.45, s[0] * 0.95, s[1] * 0.35, 0.03, 0xfafafa); k.torus(0, s[1] * 0.2, -s[2] * 0.3, 0.2, c, Math.PI / 2, 0, 0, true); if (!d.p?.arcade) k.cyl(0, -s[1] * 0.1, -s[2] * 0.48, 0.03, s[1] * 0.8, 0x555555); });
S('piano', (k, s, c, d) => { k.box(0, 0.05, -s[2] * 0.25, s[0], s[1] * 0.9, s[2] * 0.5, c); k.box(0, -s[1] * 0.1, s[2] * 0.15, s[0], 0.1, s[2] * 0.3, c); k.box(0, -s[1] * 0.04, s[2] * 0.18, s[0] * 0.92, 0.02, s[2] * 0.22, 0xfafafa); for (let i = 0; i < 36; i++) { if ([1, 3, 6, 8, 10].includes(i % 12)) k.box(-s[0] * 0.46 + i * s[0] * 0.92 / 36, -s[1] * 0.02, s[2] * 0.14, s[0] * 0.012, 0.025, s[2] * 0.12, 0x111111); } for (const x of [-1, 1]) k.box(x * s[0] * 0.47, -s[1] * 0.3, s[2] * 0.15, 0.05, s[1] * 0.4, 0.05, c); k.meta.keys = { x: 0, y: -s[1] * 0.02, z: s[2] * 0.18, w: s[0] * 0.92 }; });
S('keyboardsynth', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] * 0.5, s[2] * 0.15, s[0] * 0.9, 0.01, s[2] * 0.5, 0xfafafa); k.box(0, s[1] * 0.5, -s[2] * 0.3, s[0] * 0.3, 0.012, s[2] * 0.2, 0x113311); for (const x of [-1, 1]) k.boxR(x * s[0] * 0.4, -0.4, 0, 0.03, 0.8, 0.03, 0x222222, 0.3, 0, 0); });
S('drumkit', (k, s, c) => { k.cyl(0, -s[1] * 0.2, 0, s[1] * 0.28, s[2] * 0.3, c, Math.PI / 2); k.cyl(0, -s[1] * 0.2, s[2] * 0.15, s[1] * 0.27, 0.01, 0xfafafa, Math.PI / 2); k.cyl(-s[0] * 0.32, 0, s[2] * 0.25, 0.18, 0.14, c); k.cyl(s[0] * 0.25, 0.05, s[2] * 0.15, 0.16, 0.16, c); k.cyl(-s[0] * 0.15, s[1] * 0.1, -s[2] * 0.05, 0.12, 0.12, c); k.cyl(s[0] * 0.38, s[1] * 0.35, 0, 0.22, 0.008, 0xd4af37); k.cyl(-s[0] * 0.45, s[1] * 0.15, s[2] * 0.3, 0.17, 0.008, 0xd4af37); k.cyl(s[0] * 0.38, 0, 0, 0.01, s[1] * 0.7, 0x9e9e9e); k.cyl(-s[0] * 0.45, -0.1, s[2] * 0.3, 0.01, s[1] * 0.5, 0x9e9e9e); });
S('guitar', (k, s, c, d) => { k.sph(0, -s[1] * 0.25, 0, s[0] * 0.5, s[1] * 0.22, s[2] * 0.5, c); k.sph(0, -s[1] * 0.02, 0, s[0] * 0.38, s[1] * 0.14, s[2] * 0.5, c); k.cyl(0, -s[1] * 0.18, s[2] * 0.5, s[0] * 0.12, 0.005, 0x111111, Math.PI / 2); k.box(0, s[1] * 0.25, 0, s[0] * 0.13, s[1] * 0.5, s[2] * 0.4, 0x3e2723); k.box(0, s[1] * 0.48, 0, s[0] * 0.2, s[1] * 0.08, s[2] * 0.4, 0x3e2723); });
S('maracas', (k, s, c) => { k.sph(0, s[1] * 0.2, 0, s[0] / 2, s[0] * 0.6, s[2] / 2, c); k.cyl(0, -s[1] * 0.2, 0, 0.012, s[1] * 0.5, 0x5d4037); });
S('triangle', (k, s, c) => { for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; k.boxR(Math.sin(a + Math.PI / 3) * s[0] * 0.22, Math.cos(a + Math.PI / 3) * s[1] * 0.22, 0, 0.006, s[1] * 0.8, 0.006, c, 0, 0, -a); } });
S('mask', (k, s, c, d) => { k.sph(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c); k.sph(-s[0] * 0.18, s[1] * 0.08, s[2] * 0.4, s[0] * 0.08, s[1] * 0.06, 0.01, 0x111111); k.sph(s[0] * 0.18, s[1] * 0.08, s[2] * 0.4, s[0] * 0.08, s[1] * 0.06, 0.01, 0x111111); if (d.id === 'mask_clown') { k.sph(0, -s[1] * 0.05, s[2] * 0.5, s[0] * 0.1, s[0] * 0.1, s[0] * 0.1, 0xff1744); k.box(0, -s[1] * 0.25, s[2] * 0.42, s[0] * 0.4, s[1] * 0.05, 0.01, 0xd50000); } if (d.id === 'mask_pig') k.cyl(0, -s[1] * 0.08, s[2] * 0.5, s[0] * 0.14, s[2] * 0.2, 0xf48fb1, Math.PI / 2); });
S('scissors', (k, s, c) => { k.boxR(0, 0, s[2] * 0.15, 0.012, 0.004, s[2] * 0.7, c, 0, 0.12, 0); k.boxR(0, 0.004, s[2] * 0.15, 0.012, 0.004, s[2] * 0.7, c, 0, -0.12, 0); k.torus(-0.02, 0, -s[2] * 0.32, 0.018, 0x212121, Math.PI / 2, 0, 0, true); k.torus(0.02, 0, -s[2] * 0.32, 0.018, 0x212121, Math.PI / 2, 0, 0, true); });
S('salonchair', (k, s, c, d) => { k.cyl(0, -s[1] * 0.45, 0, s[0] * 0.35, 0.05, 0xc0c0c0); k.cyl(0, -s[1] * 0.3, 0, 0.05, s[1] * 0.3, 0xc0c0c0); k.box(0, -s[1] * 0.08, 0, s[0] * 0.8, s[1] * 0.12, s[2] * 0.75, c); k.box(0, s[1] * 0.2, -s[2] * 0.35, s[0] * 0.8, s[1] * 0.55, s[2] * 0.1, c); for (const x of [-1, 1]) k.box(x * s[0] * 0.42, s[1] * 0.02, 0, s[0] * 0.1, s[1] * 0.08, s[2] * 0.6, c); if (d.id === 'massage_chair') k.box(0, -s[1] * 0.3, s[2] * 0.35, s[0] * 0.6, s[1] * 0.3, s[2] * 0.25, c); });
S('head', (k, s, c) => { k.sph(0, s[1] * 0.1, 0, s[0] / 2, s[1] * 0.4, s[2] / 2, c); k.cyl(0, -s[1] * 0.35, 0, s[0] * 0.2, s[1] * 0.3, c); k.sph(0, s[1] * 0.08, s[2] * 0.48, s[0] * 0.08, s[1] * 0.1, 0.03, c); });
S('photobooth', (k, s, c) => { k.box(0, 0, -s[2] * 0.2, s[0], s[1], s[2] * 0.6, c); k.box(0, s[1] * 0.42, s[2] * 0.1, s[0], s[1] * 0.16, s[2] * 0.6, c); k.box(s[0] * 0.48, 0, s[2] * 0.3, 0.02, s[1] * 0.68, s[2] * 0.4, 0x880e4f); k.box(-s[0] * 0.45, -s[1] * 0.2, s[2] * 0.1, s[0] * 0.1, s[1] * 0.05, s[2] * 0.3, 0x333333); k.box(0, s[1] * 0.42, s[2] * 0.4, s[0] * 0.8, s[1] * 0.1, 0.01, 0xffeb3b); k.meta.flash = [0, s[1] * 0.2, -s[2] * 0.05]; });
S('clock', (k, s, c, d) => { if (d.id === 'cuckoo_clock') { k.box(0, s[1] * 0.1, 0, s[0], s[1] * 0.6, s[2], c); k.boxR(-s[0] * 0.28, s[1] * 0.42, 0, s[0] * 0.6, 0.03, s[2] * 1.1, shade(c, 0.7), 0, 0, 0.6); k.boxR(s[0] * 0.28, s[1] * 0.42, 0, s[0] * 0.6, 0.03, s[2] * 1.1, shade(c, 0.7), 0, 0, -0.6); k.cyl(0, 0.05, s[2] / 2, s[0] * 0.3, 0.01, 0xfff8e1, Math.PI / 2); k.cyl(-0.05, -s[1] * 0.35, 0, 0.004, s[1] * 0.3, 0xd4af37); k.cone(-0.05, -s[1] * 0.48, 0, 0.025, 0.06, 0xd4af37); return; } k.cyl(0, 0, 0, s[0] / 2, s[2], c, Math.PI / 2); k.cyl(0, 0, s[2] * 0.5, s[0] * 0.45, 0.003, 0xfafafa, Math.PI / 2); k.box(0, s[1] * 0.12, s[2] * 0.55, 0.008, s[1] * 0.25, 0.004, 0x111111); k.box(s[0] * 0.08, 0, s[2] * 0.55, s[0] * 0.18, 0.008, 0.004, 0x111111); });
S('snowglobe', (k, s, c) => { k.cyl(0, -s[1] * 0.35, 0, s[0] * 0.45, s[1] * 0.3, 0x5d4037); k.sph(0, s[1] * 0.1, 0, s[0] * 0.45, s[0] * 0.45, s[0] * 0.45, c); k.box(0, s[1] * 0.0, 0, s[0] * 0.4, s[1] * 0.12, s[0] * 0.2, 0xfafafa); });
S('mirror', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], 0x6d4c41); k.box(0, 0, s[2] / 2 + 0.001, s[0] * 0.94, s[1] * 0.92, 0.002, 0xcfd8dc); k.meta.mirror = { w: s[0] * 0.94, h: s[1] * 0.92, z: s[2] / 2 + 0.003 }; });

// ───────── grandes bornes / mobilier ─────────
S('arcade', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2];
  k.box(0, -h * 0.2, 0, w, h * 0.6, dd * 0.7, c);
  k.boxR(0, h * 0.18, dd * 0.1, w, h * 0.3, dd * 0.15, c, -0.25, 0, 0);
  k.box(0, h * 0.38, -dd * 0.1, w, h * 0.24, dd * 0.6, c);
  k.box(0, h * 0.0, dd * 0.38, w * 0.9, 0.05, dd * 0.25, 0x212121);
  k.cyl(-w * 0.2, h * 0.06, dd * 0.4, 0.012, 0.08, 0x222222); k.sph(-w * 0.2, h * 0.11, dd * 0.4, 0.025, 0.025, 0.025, 0xe53935);
  for (let i = 0; i < 3; i++) k.cyl(w * (0.05 + i * 0.1), h * 0.035, dd * 0.42, 0.018, 0.01, [0xffeb3b, 0x43a047, 0x1e88e5][i]);
  k.box(0, h * 0.46, dd * 0.21, w * 0.92, h * 0.07, 0.01, 0xd500f9);
  k.box(0, -h * 0.25, dd * 0.36, w * 0.12, h * 0.08, 0.01, 0xffd600);
  for (const x of [-1, 1]) k.box(x * w * 0.5, 0, 0, 0.02, h, dd * 0.7, shade(c, 1.4));
  k.meta.screen = { x: 0, y: h * 0.2, z: dd * 0.19, w: w * 0.78, h: h * 0.22, tilt: -0.25 };
  k.meta.marquee = { x: 0, y: h * 0.46, z: dd * 0.22, w: w * 0.92, h: h * 0.07 };
});
S('claw', (k, s, c) => { const w = s[0], h = s[1], dd = s[2]; k.box(0, -h * 0.3, 0, w, h * 0.4, dd, c); k.box(0, h * 0.45, 0, w, h * 0.1, dd, c); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(x * w * 0.48, h * 0.15, z * dd * 0.48, 0.04, h * 0.6, 0.04, 0xc0c0c0); k.box(0, -h * 0.08, 0, w * 0.92, 0.02, dd * 0.92, 0x7e57c2); const rnd = mulberry32(3); for (let i = 0; i < 12; i++) k.sph((rnd() - 0.5) * w * 0.7, -h * 0.03 + rnd() * 0.05, (rnd() - 0.5) * dd * 0.7, 0.07, 0.07, 0.07, [0xff4081, 0xffeb3b, 0x29b6f6, 0x66bb6a, 0xab47bc][i % 5]); k.box(0, -h * 0.05, dd * 0.47, w * 0.4, 0.04, 0.12, 0x212121); k.meta.glass = { w: w * 0.96, h: h * 0.6, y: h * 0.15 }; k.meta.claw = [0, h * 0.35, 0]; });
S('kiddie', (k, s, c) => { const w = s[0], h = s[1], dd = s[2]; k.box(0, -h * 0.42, 0, w, h * 0.16, dd, 0x1e88e5); k.sph(0, -h * 0.05, 0, w * 0.42, h * 0.3, dd * 0.45, c); k.sph(0, h * 0.28, dd * 0.3, w * 0.28, h * 0.2, dd * 0.18, c); k.sph(-w * 0.2, h * 0.43, dd * 0.3, 0.07, 0.07, 0.04, c); k.sph(w * 0.2, h * 0.43, dd * 0.3, 0.07, 0.07, 0.04, c); k.sph(0, h * 0.24, dd * 0.47, 0.07, 0.05, 0.04, 0xf3d2a2); k.sph(-0.08, h * 0.32, dd * 0.45, 0.02, 0.02, 0.01, 0x111111); k.sph(0.08, h * 0.32, dd * 0.45, 0.02, 0.02, 0.01, 0x111111); k.box(0, h * 0.12, -dd * 0.1, w * 0.4, 0.06, dd * 0.4, 0xd32f2f); k.box(w * 0.45, -h * 0.3, dd * 0.45, 0.12, 0.2, 0.08, 0x333333); });
S('locker', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); if (d.id === 'locker') { k.box(0, s[1] * 0.35, s[2] / 2 + 0.002, s[0] * 0.6, 0.004, 0.003, 0x333333); k.box(0, s[1] * 0.3, s[2] / 2 + 0.002, s[0] * 0.6, 0.004, 0.003, 0x333333); k.box(s[0] * 0.35, 0, s[2] / 2 + 0.01, 0.02, 0.1, 0.02, 0x9e9e9e); k.meta.door = { x: 0, y: 0, z: s[2] / 2, w: s[0] * 0.95, h: s[1] * 0.95 }; } else if (d.id === 'token_machine') { k.box(0, s[1] * 0.2, s[2] / 2, s[0] * 0.6, s[1] * 0.2, 0.01, 0xffd600); k.box(0, -s[1] * 0.25, s[2] / 2, s[0] * 0.3, s[1] * 0.1, 0.04, 0x111111); } else if (d.id === 'extinguisher_box') { k.box(0, 0, s[2] / 2, s[0] * 0.85, s[1] * 0.85, 0.005, 0xb0bec5); } });
S('airhockey', (k, s, c) => { k.box(0, 0.1, 0, s[0], s[1] * 0.25, s[2], c); k.box(0, s[1] * 0.24, 0, s[0] * 0.92, 0.01, s[2] * 0.92, 0xe3f2fd); k.box(0, -s[1] * 0.25, 0, s[0] * 0.6, s[1] * 0.5, s[2] * 0.6, 0x111111); k.cyl(0, s[1] * 0.25, s[2] * 0.3, 0.05, 0.03, 0xd50000); k.cyl(0, s[1] * 0.25, -s[2] * 0.3, 0.05, 0.03, 0x1565c0); k.meta.screen = { x: 0, y: s[1] * 0.25, z: 0, w: s[0] * 0.9, h: s[2] * 0.9, top: true }; });
S('conveyor', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] / 2, 0, s[0] * 0.98, 0.01, s[2] * 0.7, 0x424242); });
S('gumball', (k, s, c) => { k.box(0, -s[1] * 0.3, 0, s[0] * 0.7, s[1] * 0.4, s[0] * 0.7, c); k.sph(0, s[1] * 0.18, 0, s[0] * 0.5, s[0] * 0.5, s[0] * 0.5, 0xe0f7fa); const rnd = mulberry32(9); for (let i = 0; i < 14; i++) k.sph((rnd() - 0.5) * s[0] * 0.6, s[1] * 0.08 + rnd() * s[0] * 0.3, (rnd() - 0.5) * s[0] * 0.6, 0.02, 0.02, 0.02, [0xff1744, 0x00e5ff, 0xffea00, 0x76ff03][i % 4], true); k.cyl(0, s[1] * 0.42, 0, s[0] * 0.2, 0.04, c); });
S('popcorn_machine', (k, s, c) => { k.box(0, -s[1] * 0.3, 0, s[0], s[1] * 0.4, s[2], c); k.box(0, s[1] * 0.15, 0, s[0], s[1] * 0.5, s[2], 0xfff8e1); k.box(0, s[1] * 0.45, 0, s[0], s[1] * 0.1, s[2], c); k.box(0, s[1] * 0.0, 0, s[0] * 0.9, s[1] * 0.15, s[2] * 0.9, 0xffffff); k.meta.glass = true; });
S('projector', (k, s, c) => { k.box(0, 0, 0, s[0], s[1] * 0.6, s[2], c); k.cyl(-s[0] * 0.3, s[1] * 0.45, -s[2] * 0.2, s[1] * 0.3, 0.05, 0x546e7a, 0, 0, Math.PI / 2); k.cyl(-s[0] * 0.3, s[1] * 0.45, s[2] * 0.25, s[1] * 0.3, 0.05, 0x546e7a, 0, 0, Math.PI / 2); k.cyl(0, 0, s[2] / 2 + 0.08, 0.08, 0.16, 0x111111, Math.PI / 2); k.meta.lens = [0, 0, s[2] / 2 + 0.16]; });
S('laptop', (k, s, c) => { k.box(0, -s[1] / 2, 0, s[0], s[1], s[2], c); k.boxR(0, s[2] * 0.42, -s[2] * 0.45, s[0], s[2] * 0.9, 0.01, c, -0.2, 0, 0); k.boxR(0, s[2] * 0.42, -s[2] * 0.443, s[0] * 0.92, s[2] * 0.8, 0.002, 0x0a1220, -0.2, 0, 0); k.box(0, -s[1] * 0.45, s[2] * 0.1, s[0] * 0.85, 0.002, s[2] * 0.45, 0x222222); k.meta.screen = { x: 0, y: s[2] * 0.42, z: -s[2] * 0.438, w: s[0] * 0.92, h: s[2] * 0.8, tilt: -0.2 }; });
S('keyboard', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); for (let r = 0; r < 4; r++) for (let i = 0; i < 12; i++) k.box(-s[0] * 0.44 + i * s[0] * 0.08, s[1] * 0.55, -s[2] * 0.35 + r * s[2] * 0.22, s[0] * 0.065, s[1] * 0.3, s[2] * 0.18, 0x424242); });
S('printer', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] * 0.1, s[2] / 2 + 0.05, s[0] * 0.6, 0.01, 0.12, 0xfafafa); k.box(0, s[1] / 2, -s[2] * 0.2, s[0] * 0.6, 0.06, 0.15, 0xfafafa); k.box(s[0] * 0.35, s[1] * 0.4, s[2] / 2 + 0.002, 0.05, 0.03, 0.003, 0x113311); });
S('register', (k, s, c) => { k.box(0, -s[1] * 0.3, 0, s[0], s[1] * 0.4, s[2], c); k.boxR(0, s[1] * 0.05, s[2] * 0.15, s[0] * 0.8, s[1] * 0.12, s[2] * 0.4, 0x424242, -0.3, 0, 0); k.box(0, s[1] * 0.35, -s[2] * 0.2, s[0] * 0.5, s[1] * 0.35, 0.04, 0x212121); k.box(0, s[1] * 0.35, -s[2] * 0.2 + 0.021, s[0] * 0.45, s[1] * 0.28, 0.002, 0x0a2a1a); k.box(0, -s[1] * 0.3, s[2] / 2 + 0.002, s[0] * 0.9, s[1] * 0.28, 0.003, shade(c, 0.8)); k.meta.drawer = { x: 0, y: -s[1] * 0.3, z: s[2] / 2, w: s[0] * 0.9, h: s[1] * 0.3, d: s[2] * 0.8 }; k.meta.screen = { x: 0, y: s[1] * 0.35, z: -s[2] * 0.2 + 0.023, w: s[0] * 0.45, h: s[1] * 0.28 }; });
S('safe', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.cyl(s[0] * 0.15, s[1] * 0.05, s[2] / 2 + 0.02, s[0] * 0.1, 0.04, 0x9e9e9e, Math.PI / 2); k.box(-s[0] * 0.2, s[1] * 0.1, s[2] / 2 + 0.01, s[0] * 0.18, s[1] * 0.2, 0.02, 0x212121); k.box(s[0] * 0.38, 0, s[2] / 2 + 0.03, 0.03, s[1] * 0.25, 0.04, 0xbdbdbd); k.meta.door = { x: 0, y: 0, z: s[2] / 2, w: s[0] * 0.95, h: s[1] * 0.95 }; });
S('vending', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); if (d.id === 'atm') { k.box(0, s[1] * 0.15, s[2] / 2 + 0.01, s[0] * 0.5, s[1] * 0.2, 0.01, 0x0a1a2a); k.box(0, -s[1] * 0.05, s[2] / 2 + 0.05, s[0] * 0.5, 0.02, 0.12, 0x333333); k.meta.screen = { x: 0, y: s[1] * 0.15, z: s[2] / 2 + 0.016, w: s[0] * 0.48, h: s[1] * 0.18 }; return; } k.box(-s[0] * 0.12, s[1] * 0.08, s[2] / 2 + 0.005, s[0] * 0.65, s[1] * 0.7, 0.01, 0x223038); const rnd = mulberry32(4); for (let r = 0; r < 5; r++) for (let i = 0; i < 4; i++) k.box(-s[0] * 0.36 + i * s[0] * 0.16, s[1] * 0.36 - r * s[1] * 0.13, s[2] * 0.35, s[0] * 0.1, s[1] * 0.09, 0.05, [0xd50000, 0x1e88e5, 0xffeb3b, 0x43a047, 0xff9800][(rnd() * 5) | 0]); k.box(s[0] * 0.35, s[1] * 0.1, s[2] / 2 + 0.005, s[0] * 0.2, s[1] * 0.3, 0.01, 0x333333); k.box(0, -s[1] * 0.38, s[2] / 2 + 0.005, s[0] * 0.6, s[1] * 0.1, 0.02, 0x111111); k.meta.glow = [-s[0] * 0.12, s[1] * 0.08, s[2] / 2 + 0.02]; });
S('cooler', (k, s, c) => { k.box(0, -s[1] * 0.15, 0, s[0], s[1] * 0.7, s[2], c); k.cyl(0, s[1] * 0.35, 0, s[0] * 0.4, s[1] * 0.3, 0x81d4fa); });
S('sink', (k, s, c) => { k.box(0, s[1] * 0.35, 0, s[0], s[1] * 0.15, s[2], c); k.box(0, s[1] * 0.43, 0, s[0] * 0.75, 0.01, s[2] * 0.6, 0xb0bec5); k.cyl(0, -s[1] * 0.1, -s[2] * 0.2, 0.06, s[1] * 0.75, c); k.cyl(0, s[1] * 0.5, -s[2] * 0.4, 0.015, 0.12, 0xc0c0c0); k.cyl(0, s[1] * 0.55, -s[2] * 0.33, 0.012, 0.12, 0xc0c0c0, Math.PI / 2); k.meta.tap = [0, s[1] * 0.53, -s[2] * 0.27]; });
S('toilet', (k, s, c) => { k.cyl(0, -s[1] * 0.25, s[2] * 0.05, s[0] * 0.45, s[1] * 0.45, c); k.cylS(0, -s[1] * 0.01, s[2] * 0.05, s[0] * 0.5, 0.04, s[2] * 0.4, c); k.box(0, s[1] * 0.25, -s[2] * 0.35, s[0], s[1] * 0.5, s[2] * 0.25, c); });
S('bench', (k, s, c) => { k.box(0, s[1] * 0.1, 0, s[0], 0.06, s[2], c); for (const x of [-1, 1]) k.box(x * s[0] * 0.42, -s[1] * 0.2, 0, 0.06, s[1] * 0.6, s[2] * 0.9, 0x37474f); });
S('chair', (k, s, c, d) => { if (d.id === 'office_chair') { k.box(0, 0, 0, s[0] * 0.8, 0.08, s[2] * 0.8, c); k.box(0, s[1] * 0.3, -s[2] * 0.38, s[0] * 0.75, s[1] * 0.5, 0.06, c); k.cyl(0, -s[1] * 0.25, 0, 0.03, s[1] * 0.45, 0x555555); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.boxR(Math.cos(a) * s[0] * 0.2, -s[1] * 0.45, Math.sin(a) * s[0] * 0.2, s[0] * 0.4, 0.03, 0.04, 0x333333, 0, -a, 0); } return; } k.box(0, 0, 0, s[0], 0.05, s[2], c); k.box(0, s[1] * 0.27, -s[2] * 0.46, s[0], s[1] * 0.5, 0.04, c); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(x * s[0] * 0.44, -s[1] * 0.25, z * s[2] * 0.44, 0.03, s[1] * 0.5, 0.03, 0x37474f); });
S('fountainbig', (k, s, c) => { k.cyl(0, -s[1] * 0.25, 0, s[0] / 2, s[1] * 0.5, c); k.cyl(0, -s[1] * 0.02, 0, s[0] / 2 * 0.93, 0.02, 0x2c5866); k.cyl(0, s[1] * 0.3, 0, 0.3, s[1] * 0.9, c); k.cyl(0, s[1] * 0.75, 0, 1.0, 0.12, c); k.cyl(0, s[1] * 0.81, 0, 0.92, 0.02, 0x2c5866); k.meta.water = [0, s[1] * 0.9, 0]; });
S('board', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, 0, s[2] / 2, s[0] * 0.92, s[1] * 0.88, 0.003, 0xc8a165); const rnd = mulberry32(11); for (let i = 0; i < 9; i++) k.box((rnd() - 0.5) * s[0] * 0.75, (rnd() - 0.5) * s[1] * 0.7, s[2] / 2 + 0.004, 0.12 + rnd() * 0.1, 0.12 + rnd() * 0.08, 0.002, [0xfff59d, 0xffffff, 0xb3e5fc, 0xf8bbd0][i % 4]); });
S('generator', (k, s, c) => { const w = s[0], h = s[1], dd = s[2]; k.box(0, -h * 0.4, 0, w, h * 0.2, dd, 0x37474f); k.box(-w * 0.15, h * 0.05, 0, w * 0.6, h * 0.7, dd * 0.85, c); k.cyl(w * 0.32, 0, 0, dd * 0.38, w * 0.3, 0x455a64, 0, 0, Math.PI / 2); k.box(-w * 0.15, h * 0.45, 0, w * 0.4, h * 0.1, dd * 0.5, 0x263238); k.cyl(-w * 0.35, h * 0.5, dd * 0.2, 0.06, 0.15, 0x111111); k.box(w * 0.25, h * 0.3, dd * 0.45, w * 0.25, h * 0.25, 0.04, 0x263238); k.box(w * 0.25, h * 0.33, dd * 0.47, 0.08, 0.05, 0.005, 0x113311); k.box(-w * 0.45, 0, dd * 0.43, 0.05, 0.05, 0.1, 0x111111); k.meta.gauge = [w * 0.25, h * 0.33, dd * 0.475]; k.meta.cord = [-w * 0.45, 0, dd * 0.5]; });
S('panel', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, 0, s[2] / 2, s[0] * 0.94, s[1] * 0.94, 0.005, 0x546e7a); });
S('console_pa', (k, s, c) => { k.box(0, -s[1] * 0.2, 0, s[0], s[1] * 0.6, s[2], c); k.boxR(0, s[1] * 0.15, 0, s[0], 0.05, s[2] * 0.9, 0x37474f, -0.2, 0, 0); for (let i = 0; i < 12; i++) k.box(-s[0] * 0.4 + i * s[0] * 0.07, s[1] * 0.2, 0, 0.015, 0.03, 0.12, 0x9e9e9e); k.cyl(s[0] * 0.3, s[1] * 0.35, -s[2] * 0.2, 0.008, 0.3, 0x212121, 0.4, 0, 0); k.sph(s[0] * 0.3, s[1] * 0.48, -s[2] * 0.14, 0.025, 0.035, 0.025, 0x333333); });
S('boiler', (k, s, c) => { k.cyl(0, 0, 0, s[0] / 2, s[1], c); k.cyl(0, s[1] * 0.3, s[0] * 0.45, 0.1, 0.02, 0xfafafa, Math.PI / 2); k.cyl(s[0] * 0.3, s[1] * 0.55, 0, 0.06, s[1] * 0.4, 0x8d6e63); k.cyl(-s[0] * 0.3, s[1] * 0.55, 0, 0.06, s[1] * 0.4, 0x8d6e63); });
S('forklift', (k, s, c) => { const w = s[0], h = s[1], L = s[2]; k.box(0, -h * 0.3, -L * 0.1, w, h * 0.3, L * 0.7, c); k.box(0, -h * 0.05, -L * 0.35, w, h * 0.25, L * 0.2, 0x37474f); for (const x of [-1, 1]) { k.box(x * w * 0.45, h * 0.15, -L * 0.05, 0.05, h * 0.7, 0.05, 0x212121); k.box(x * w * 0.45, h * 0.15, -L * 0.3, 0.05, h * 0.7, 0.05, 0x212121); } k.box(0, h * 0.48, -L * 0.18, w, 0.05, L * 0.3, 0x212121); k.box(0, -h * 0.05, -L * 0.15, w * 0.6, h * 0.1, L * 0.2, 0x111111); for (const x of [-1, 1]) { k.box(x * w * 0.3, 0, L * 0.3, 0.12, h * 0.9, 0.08, 0x37474f); k.box(x * w * 0.25, -h * 0.45, L * 0.42, 0.12, 0.05, L * 0.3, 0x9e9e9e); } for (const [x, z] of [[-1, -1], [1, -1], [-1, 0.6], [1, 0.6]]) k.cyl(x * w * 0.48, -h * 0.4, z * L * 0.3, 0.22, 0.2, 0x111111, 0, 0, Math.PI / 2); k.meta.light = [0, h * 0.5, L * 0.0]; });
S('car', (k, s, c) => {
  const w = s[0], h = s[1], L = s[2];
  k.box(0, -h * 0.2, 0, w, h * 0.38, L, c);
  k.box(0, h * 0.16, -L * 0.05, w * 0.88, h * 0.34, L * 0.5, c);
  k.box(0, h * 0.18, L * 0.205, w * 0.84, h * 0.28, 0.02, 0x101418); k.box(0, h * 0.18, -L * 0.305, w * 0.84, h * 0.28, 0.02, 0x101418);
  k.box(-w * 0.441, h * 0.17, -L * 0.05, 0.01, h * 0.26, L * 0.46, 0x101418); k.box(w * 0.441, h * 0.17, -L * 0.05, 0.01, h * 0.26, L * 0.46, 0x101418);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { k.cyl(x * w * 0.43, -h * 0.38, z * L * 0.32, h * 0.22, w * 0.16, 0x111111, 0, 0, Math.PI / 2); k.cyl(x * w * 0.5, -h * 0.38, z * L * 0.32, h * 0.12, 0.01, 0xbdbdbd, 0, 0, Math.PI / 2); }
  k.box(-w * 0.32, -h * 0.12, L * 0.5, w * 0.2, h * 0.08, 0.02, 0xfffde7); k.box(w * 0.32, -h * 0.12, L * 0.5, w * 0.2, h * 0.08, 0.02, 0xfffde7);
  k.box(-w * 0.35, -h * 0.1, -L * 0.5, w * 0.16, h * 0.07, 0.02, 0xb71c1c); k.box(w * 0.35, -h * 0.1, -L * 0.5, w * 0.16, h * 0.07, 0.02, 0xb71c1c);
  k.box(0, -h * 0.25, L * 0.505, w * 0.3, h * 0.08, 0.01, 0xfafafa); k.box(0, -h * 0.25, -L * 0.505, w * 0.3, h * 0.08, 0.01, 0xfafafa);
  k.meta.headlights = [[-w * 0.32, -h * 0.12, L * 0.51], [w * 0.32, -h * 0.12, L * 0.51]];
  k.meta.windows = [{ x: -w * 0.445, y: h * 0.17, z: -L * 0.05, w: L * 0.46, h: h * 0.26, side: -1 }, { x: w * 0.445, y: h * 0.17, z: -L * 0.05, w: L * 0.46, h: h * 0.26, side: 1 }];
});
S('mannequin', (k, s, c) => {
  const h = s[1];
  k.cyl(0, -h * 0.49, 0, 0.18, 0.02, 0x333333); k.cyl(0, -h * 0.28, 0, 0.012, h * 0.42, 0x9e9e9e);
  k.cylS(0, h * 0.12, 0, 0.17, h * 0.3, 0.1, c); k.cylS(0, -h * 0.05, 0, 0.15, h * 0.1, 0.1, c);
  k.cyl(0, h * 0.31, 0, 0.04, h * 0.06, c); k.sph(0, h * 0.4, 0, 0.1, 0.13, 0.11, c);
  k.cylS(-0.2, h * 0.08, 0, 0.04, h * 0.32, 0.04, c, 0, 0, 0.15); k.cylS(0.2, h * 0.08, 0, 0.04, h * 0.32, 0.04, c, 0, 0, -0.15);
  k.cylS(-0.08, -h * 0.28, 0, 0.055, h * 0.42, 0.055, c); k.cylS(0.08, -h * 0.28, 0, 0.055, h * 0.42, 0.055, c);
});
S('deskphone', (k, s, c) => { k.boxR(0, -s[1] * 0.2, 0, s[0], s[1] * 0.5, s[2], c, 0.15, 0, 0); k.cap(0, s[1] * 0.25, -s[2] * 0.1, 0.025, s[0] * 0.8, c, 0, 0, Math.PI / 2); for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) k.box(-0.03 + i * 0.03, s[1] * 0.07, s[2] * 0.25 - r * 0.025, 0.02, 0.006, 0.018, 0xe0e0e0); k.meta.handset = [0, s[1] * 0.25, -s[2] * 0.1]; });
S('cage', (k, s, c, d) => { k.box(0, -s[1] * 0.47, 0, s[0], s[1] * 0.06, s[2], 0x5d4037); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.cyl(Math.cos(a) * s[0] * 0.45, 0, Math.sin(a) * s[2] * 0.45, 0.004, s[1] * 0.9, c); } k.cyl(0, s[1] * 0.45, 0, s[0] * 0.46, 0.01, c); k.cyl(0, 0, 0, 0.006, s[0] * 0.9, 0x8d6e63, 0, 0, Math.PI / 2); if (d.use === 'parrot') { k.sph(0, s[1] * 0.12, 0, 0.06, 0.09, 0.06, 0x43a047); k.sph(0, s[1] * 0.24, 0.02, 0.045, 0.045, 0.045, 0x66bb6a); k.cone(0, s[1] * 0.22, 0.07, 0.015, 0.04, 0xffb300, Math.PI / 2); k.box(0, s[1] * 0.0, -0.05, 0.04, 0.1, 0.02, 0xd32f2f); } if (d.use === 'hamster') { k.torus(s[0] * 0.15, -s[1] * 0.2, 0, s[1] * 0.25, 0xb0bec5, 0, 0, 0, true); k.sph(-s[0] * 0.2, -s[1] * 0.38, 0, 0.04, 0.03, 0.05, 0xffcc80); } });
S('aquarium', (k, s, c, d) => { k.box(0, -s[1] * 0.45, 0, s[0], s[1] * 0.1, s[2], 0x212121); k.box(0, s[1] * 0.47, 0, s[0], s[1] * 0.06, s[2], 0x212121); k.box(0, 0, 0, s[0] * 0.98, s[1] * 0.84, s[2] * 0.96, d.use === 'terrarium' ? 0x3e2a14 : 0x1b4f72); k.box(0, -s[1] * 0.38, 0, s[0] * 0.96, s[1] * 0.06, s[2] * 0.9, d.use === 'terrarium' ? 0x8d6e63 : 0xe6d3a3); if (d.use === 'terrarium') { k.cap(0, -s[1] * 0.3, 0, 0.04, s[0] * 0.6, 0x5d7a3a, 0, 0.3, Math.PI / 2); } else { for (let i = 0; i < 5; i++) k.box(-s[0] * 0.35 + i * s[0] * 0.17, -s[1] * 0.2, -s[2] * 0.2, 0.02, s[1] * (0.25 + (i % 3) * 0.12), 0.02, 0x2e7d32); } k.meta.light = [0, s[1] * 0.4, 0]; k.meta.fish = d.use === 'aquarium'; });

const geoCache = new Map();
const metaCache = new Map();

export function buildItemGeometry(def, atlas) {
  if (geoCache.has(def.id)) return geoCache.get(def.id);
  const b = new GeoBuilder({ colors: true, white: atlas.white() });
  const kit = new Kit(b, atlas);
  const fn = SHAPES[def.shape] || SHAPES.box;
  try { fn(kit, def.s, def.c, def); } catch (e) { console.warn('forme', def.id, e); SHAPES.box(kit, def.s, def.c, def); }
  if (b.vertexCount === 0) SHAPES.box(kit, def.s, def.c, def);
  const g = b.build();
  geoCache.set(def.id, g); metaCache.set(def.id, kit.meta);
  return g;
}
export function itemMeta(id) { return metaCache.get(id) || {}; }
export const SHAPE_NAMES = Object.keys(SHAPES);

// Petite géométrie générique colorée (pour les fixtures construites à la volée)
export function quickGeometry(atlas, fn) {
  const b = new GeoBuilder({ colors: true, white: atlas.white() });
  const kit = new Kit(b, atlas);
  fn(kit);
  return { geometry: b.build(), meta: kit.meta };
}
