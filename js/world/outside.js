// Abords du Centre Commercial Hélios : parking de surface devant la façade est, parvis, voirie, rampe du parking
// souterrain, clôtures, façades nord et sud, cour de service, avenue et ville au loin.
//
//  Plan (x vers l'est, z vers le « nord » ; façade est en x = 80,4, portes à z = 0) :
//   x  80,4 … 98,5  parvis dallé (y = 0), tranchée de la rampe (z -7,4 … -1,6) jusqu'en x = 98
//   x  98,5 … 106   voie de desserte (y = -0,15), dépose-minute (z 9 … 21), quai de bus (z -28 … -16)
//   x  106 … 159    rangées de places le long d'allées est-ouest (z ±14,5, ±32,5, ±50,5), allée principale
//                   (z -4 … 4) vers le giratoire (162, 0), allées piétonnes plantées (z ±23,5), îlots plantés (±41,5)
//   x  159 … 176    allée de ceinture, places le long de la haie, clôture (x = 176), entrée du site (z -7 … 7)
//   x  176 … 199    accotement et totem, avenue (x 186 … 196), trottoir, écran acoustique ; avenue barrée à z = ±72
//   x  60 … 80,4    le long des façades latérales : parking du personnel (nord), cour de service (sud)
// Niveaux : parvis, trottoirs et îlots à y = 0 (comme le hall), chaussée à y = -0,15 : les bordures sont des marches
// de 15 cm. Tout est statique : regroupé par (zone, matériau) avec Arch, voitures, arbres et lampadaires fusionnés par
// famille. Quatre zones : « outside » (abords immédiats, celle où l'on se trouve dehors) et trois zones de rendu
// (parking, lointain, façades latérales) dont la visibilité suit la position de la caméra (zone.visibleAt) : rien de
// tout cela n'est dessiné depuis le cœur du centre.
import * as THREE from 'three';
import { Arch } from './arch.js';
import { Zone, WorldObject } from './world.js';
import { Box, LAYER } from '../engine/physics.js';
import { Readable, Seat } from './fixtures.js';
import { latheGeo, cylGeo, roundBoxGeo, sweepGeo, circleShape, rectShape, trs } from '../engine/geo.js';
import { RNG } from '../engine/rng.js';
import { buildingFacade, signTexture, posterTexture, canvas, toTexture } from '../engine/textures.js';
import { patchZone } from '../engine/materials.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const XF = 80.4, YP = 0, YR = -0.15;       // nu de la façade est ; dessus du parvis / de la chaussée
const FX = 176, FZ = 62, FW = 60;                   // clôture : côté est (x), nord / sud (|z|), retours ouest (x)
const RC = [162, 0], RO = 12, RI = 6.5;             // giratoire : centre, rayon extérieur, rayon de l'îlot central
const ZO = 'outside', ZL = 'outside_lot', ZF = 'outside_far', ZS = 'outside_sides';
const _c = new THREE.Color();
const lin = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };

// caméra dehors (à l'est de la façade, le long des façades latérales, sur le toit) ; zones d'où l'on voit dehors par
// la façade vitrée du hall et la baie de la mezzanine
const outdoorCam = (p) => p.x > XF + 0.05 || Math.abs(p.z) > 25.75 || p.y > 10.45 || p.x < -112.7;
const VIEW_E = new Set(['entrance', 'mezzanine', 'gallery0_e', 'gallery1_e', 'ramp']);

// ───────────────────────── lots de triangles libres (couleurs par sommet) ─────────────────────────
class Batch {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  get count() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, u, w, c) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, w); this.c.push(c[0], c[1], c[2]); return this.p.length / 3 - 1; }
  // quadrilatère a b c d (sens trigonométrique vu du côté de la normale), uv = [u0, v0, u1, v1]
  quad(a, b, c, d, n, uv = [0, 0, 1, 1], col = WHITE) {
    const k = this.count;
    this.v(a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1], col); this.v(b[0], b[1], b[2], n[0], n[1], n[2], uv[2], uv[1], col);
    this.v(c[0], c[1], c[2], n[0], n[1], n[2], uv[2], uv[3], col); this.v(d[0], d[1], d[2], n[0], n[1], n[2], uv[0], uv[3], col);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  // décalque au sol (plan horizontal) : centre, direction du « haut » de l'image (ux, uz), largeur, longueur
  floor(x, y, z, ux, uz, w, h, uv, col = WHITE) {
    const rx = -uz * w / 2, rz = ux * w / 2, hx = ux * h / 2, hz = uz * h / 2;
    this.quad([x - rx - hx, y, z - rz - hz], [x + rx - hx, y, z + rz - hz], [x + rx + hx, y, z + rz + hz], [x - rx + hx, y, z - rz + hz], [0, 1, 0], uv, col);
  }
  // panneau vertical : centre, normale horizontale (nx, nz), largeur, hauteur
  wall(x, y, z, nx, nz, w, h, uv, col = WHITE) {
    const rx = nz * w / 2, rz = -nx * w / 2;
    this.quad([x - rx, y - h / 2, z - rz], [x + rx, y - h / 2, z + rz], [x + rx, y + h / 2, z + rz], [x - rx, y + h / 2, z - rz], [nx, 0, nz], uv, col);
  }
  // géométrie indexée quelconque {p, n, c?, i} transformée (matrice), couleur unique ou par sommet
  add(g, m, col = WHITE) {
    const base = this.count, P = g.attributes ? g.attributes.position : null;
    const nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3(), nn = new THREE.Vector3();
    const pos = P ? P.array : g.p, nor = P ? g.attributes.normal.array : g.n, uvs = P ? g.attributes.uv?.array : g.u, cols = g.c;
    const cnt = pos.length / 3;
    for (let k = 0; k < cnt; k++) {
      v.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]).applyMatrix4(m); nn.set(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]).applyMatrix3(nm).normalize();
      const cc = cols ? (typeof cols === 'function' ? cols(k) : [cols[k * 3], cols[k * 3 + 1], cols[k * 3 + 2]]) : col;
      this.v(v.x, v.y, v.z, nn.x, nn.y, nn.z, uvs ? uvs[k * 2] : 0, uvs ? uvs[k * 2 + 1] : 0, cc);
    }
    const idx = P ? (g.index ? g.index.array : null) : g.i;
    if (idx) for (let k = 0; k < idx.length; k++) this.i.push(base + idx[k]); else for (let k = 0; k < cnt; k++) this.i.push(base + k);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(mat, o = {}) {
    const m = new THREE.Mesh(this.geometry(), mat); m.matrixAutoUpdate = false; m.updateMatrix();
    m.castShadow = !!o.cast; m.receiveShadow = o.receive !== false; if (o.name) m.name = o.name;
    return m;
  }
}
const WHITE = [1, 1, 1];

// ───────────────────────── planches de textures (marquages au sol, panneaux) ─────────────────────────
// Rangement en étagères : cell(nom, w, h, dessin(ctx, x, y, w, h)) → rectangle UV
function sheet(W, H) {
  const c = canvas(W, H), ctx = c.getContext('2d'); let x = 0, y = 0, rowH = 0; const uv = {};
  ctx.clearRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  return {
    c, ctx, uv,
    cell(name, w, h, draw) {
      if (x + w > W) { x = 0; y += rowH; rowH = 0; }
      if (y + h > H) { console.warn('[outside] planche pleine', name); return; }
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); draw(ctx, x, y, w, h); ctx.restore();
      uv[name] = [(x + 1) / W, 1 - (y + h - 1) / H, (x + w - 1) / W, 1 - (y + 1) / H];
      x += w; rowH = Math.max(rowH, h);
    },
  };
}
const font = (ctx, txt, max, size, weight = 900, fam = 'Arial, Helvetica, sans-serif') => { let fs = size; ctx.font = `${weight} ${fs}px ${fam}`; while (ctx.measureText(txt).width > max && fs > 8) { fs -= 2; ctx.font = `${weight} ${fs}px ${fam}`; } };
function arrowPath(ctx, cx, cy, len, w, ang = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.beginPath();
  ctx.moveTo(0, -len / 2); ctx.lineTo(w, -len / 2 + w * 1.3); ctx.lineTo(w * 0.36, -len / 2 + w * 1.3); ctx.lineTo(w * 0.36, len / 2);
  ctx.lineTo(-w * 0.36, len / 2); ctx.lineTo(-w * 0.36, -len / 2 + w * 1.3); ctx.lineTo(-w, -len / 2 + w * 1.3); ctx.closePath(); ctx.fill(); ctx.restore();
}
function wheelchair(ctx, x, y, s, col) { // pictogramme du fauteuil roulant (cadre s × s)
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 100, s / 100); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(46, 14, 9, 0, 7); ctx.fill();
  ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(44, 26); ctx.lineTo(48, 58); ctx.lineTo(72, 58); ctx.lineTo(82, 84); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(46, 40); ctx.lineTo(66, 40); ctx.stroke();
  ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(46, 66, 22, Math.PI * 0.05, Math.PI * 1.55); ctx.stroke(); ctx.restore();
}
function sunLogo(ctx, cx, cy, r) { // emblème d'Hélios : disque et rayons
  ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = '#ffb300';
  for (let k = 0; k < 12; k++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(-r * 0.12, -r * 0.62); ctx.lineTo(0, -r); ctx.lineTo(r * 0.12, -r * 0.62); ctx.fill(); }
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.55); gr.addColorStop(0, '#ffe082'); gr.addColorStop(1, '#ff8f00'); ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, 7); ctx.fill(); ctx.restore();
}
// usure de la peinture : piqûres et éraflures retirées de l'alpha
function wear(ctx, x, y, w, h, seed, k = 1) {
  const R = new RNG(seed); ctx.save(); ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < w * h / 90 * k; i++) { ctx.fillStyle = `rgba(0,0,0,${R.range(0.2, 0.9)})`; const s = R.range(1, 4); ctx.fillRect(x + R.next() * w, y + R.next() * h, s, s * R.range(0.5, 1.5)); }
  for (let i = 0; i < 6 * k; i++) { ctx.fillStyle = `rgba(0,0,0,${R.range(0.15, 0.4)})`; ctx.fillRect(x + R.next() * w, y + R.next() * h, R.range(10, w * 0.5), R.range(2, 5)); }
  ctx.restore();
}

let MARKS = null, SIGNS = null;
function markSheet() {
  if (MARKS) return MARKS;
  const S = sheet(1024, 1024), P = '#f2f1ea', Y = '#e8c21a';
  S.cell('white', 32, 32, (c, x, y, w, h) => { c.fillStyle = P; c.fillRect(x, y, w, h); });
  S.cell('yellow', 32, 32, (c, x, y, w, h) => { c.fillStyle = Y; c.fillRect(x, y, w, h); });
  S.cell('blue', 32, 32, (c, x, y, w, h) => { c.fillStyle = '#1d5bb8'; c.fillRect(x, y, w, h); });
  S.cell('dark', 32, 32, (c, x, y, w, h) => { c.fillStyle = '#26282a'; c.fillRect(x, y, w, h); });
  S.cell('arrow', 128, 256, (c, x, y, w, h) => { c.fillStyle = P; arrowPath(c, x + 64, y + 128, 236, 44); wear(c, x, y, w, h, 1); });
  S.cell('arrowL', 256, 256, (c, x, y, w, h) => { // tout droit ou à gauche
    c.fillStyle = P; arrowPath(c, x + 170, y + 128, 236, 40); c.save(); c.translate(x + 170, y + 150); c.beginPath(); c.moveTo(-14, 0); c.lineTo(-14, -26); c.quadraticCurveTo(-14, -60, -60, -60); c.lineTo(-60, -84); c.lineTo(-112, -46); c.lineTo(-60, -8); c.lineTo(-60, -32); c.quadraticCurveTo(14, -36, 14, 0); c.fill(); c.restore(); wear(c, x, y, w, h, 2);
  });
  S.cell('pmr', 256, 256, (c, x, y, w, h) => { c.fillStyle = '#1d5bb8'; c.fillRect(x + 8, y + 8, 240, 240); wheelchair(c, x + 38, y + 30, 190, P); wear(c, x, y, w, h, 3, 0.7); });
  for (let d = 0; d < 10; d++) S.cell('d' + d, 64, 128, (c, x, y, w, h) => { c.fillStyle = P; font(c, '0', 60, 120); c.fillText(String(d), x + 32, y + 68); wear(c, x, y, w, h, 10 + d, 0.6); });
  S.cell('family', 128, 128, (c, x, y, w, h) => { // adulte et enfant
    c.fillStyle = P; c.beginPath(); c.arc(x + 46, y + 22, 11, 0, 7); c.arc(x + 88, y + 52, 8, 0, 7); c.fill();
    c.strokeStyle = P; c.lineCap = 'round'; c.lineWidth = 12; c.beginPath(); c.moveTo(x + 46, y + 40); c.lineTo(x + 46, y + 78); c.moveTo(x + 46, y + 78); c.lineTo(x + 36, y + 116); c.moveTo(x + 46, y + 78); c.lineTo(x + 58, y + 116); c.moveTo(x + 46, y + 48); c.lineTo(x + 76, y + 70); c.stroke();
    c.lineWidth = 9; c.beginPath(); c.moveTo(x + 88, y + 64); c.lineTo(x + 88, y + 92); c.lineTo(x + 82, y + 116); c.moveTo(x + 88, y + 92); c.lineTo(x + 96, y + 116); c.stroke(); wear(c, x, y, w, h, 4, 0.6);
  });
  S.cell('ev', 128, 128, (c, x, y, w, h) => { c.fillStyle = '#2e9e4f'; c.fillRect(x + 6, y + 6, 116, 116); c.fillStyle = P; c.beginPath(); c.moveTo(x + 72, y + 16); c.lineTo(x + 38, y + 70); c.lineTo(x + 62, y + 70); c.lineTo(x + 52, y + 112); c.lineTo(x + 90, y + 52); c.lineTo(x + 66, y + 52); c.closePath(); c.fill(); wear(c, x, y, w, h, 5, 0.6); });
  S.cell('dots', 128, 128, (c, x, y, w, h) => { c.fillStyle = '#d9d6cc'; c.fillRect(x, y, w, h); c.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { c.beginPath(); c.arc(x + 11 + i * 21, y + 11 + j * 21, 6, 0, 7); c.fill(); } });
  S.cell('yield', 128, 128, (c, x, y, w, h) => { c.fillStyle = P; c.beginPath(); c.moveTo(x + 14, y + 10); c.lineTo(x + 114, y + 10); c.lineTo(x + 64, y + 118); c.closePath(); c.fill(); wear(c, x, y, w, h, 6); });
  S.cell('hatch', 256, 128, (c, x, y, w, h) => { c.strokeStyle = P; c.lineWidth = 14; for (let k = -h; k < w + h; k += 40) { c.beginPath(); c.moveTo(x + k, y + h); c.lineTo(x + k + h, y); c.stroke(); } c.lineWidth = 8; c.strokeRect(x + 4, y + 4, w - 8, h - 8); wear(c, x, y, w, h, 7); });
  S.cell('bus', 256, 128, (c, x, y, w, h) => { c.fillStyle = Y; font(c, 'BUS', 240, 118); c.fillText('BUS', x + 128, y + 68); wear(c, x, y, w, h, 8); });
  S.cell('zig', 256, 128, (c, x, y, w, h) => { c.strokeStyle = Y; c.lineWidth = 12; c.beginPath(); c.moveTo(x, y + 110); for (let k = 0; k <= 4; k++) { c.lineTo(x + k * 64 + 32, y + 18); c.lineTo(x + k * 64 + 64, y + 110); } c.stroke(); wear(c, x, y, w, h, 9); });
  S.cell('depose', 512, 128, (c, x, y, w, h) => { c.fillStyle = P; font(c, 'DÉPOSE MINUTE', 490, 92); c.fillText('DÉPOSE MINUTE', x + 256, y + 68); wear(c, x, y, w, h, 20); });
  S.cell('personnel', 512, 128, (c, x, y, w, h) => { c.fillStyle = P; font(c, 'PERSONNEL', 490, 100); c.fillText('PERSONNEL', x + 256, y + 68); wear(c, x, y, w, h, 21); });
  S.cell('livraisons', 512, 128, (c, x, y, w, h) => { c.fillStyle = Y; font(c, 'LIVRAISONS', 490, 100); c.fillText('LIVRAISONS', x + 256, y + 68); wear(c, x, y, w, h, 22); });
  S.cell('z30', 256, 256, (c, x, y, w, h) => { c.strokeStyle = P; c.lineWidth = 16; c.beginPath(); c.arc(x + 128, y + 128, 112, 0, 7); c.stroke(); c.fillStyle = P; font(c, '30', 170, 150); c.fillText('30', x + 128, y + 136); wear(c, x, y, w, h, 23); });
  S.cell('oil', 128, 128, (c, x, y, w, h) => { const R = new RNG('huile'); c.fillStyle = 'rgba(14,12,10,0.85)'; for (let k = 0; k < 9; k++) { const a = k * 2.4, r = 10 + R.range(0, 24); c.beginPath(); c.ellipse(x + 64 + Math.cos(a) * r, y + 64 + Math.sin(a) * r * 0.7, 26 - k * 1.5, 17 - k, a, 0, 7); c.fill(); } });
  S.cell('manhole', 128, 128, (c, x, y, w, h) => { // tampon de fonte
    c.fillStyle = '#2b2c2d'; c.beginPath(); c.arc(x + 64, y + 64, 60, 0, 7); c.fill(); c.strokeStyle = '#4a4b4c'; c.lineWidth = 4; c.beginPath(); c.arc(x + 64, y + 64, 54, 0, 7); c.stroke();
    c.lineWidth = 3; for (let k = -40; k <= 40; k += 10) { c.beginPath(); c.moveTo(x + 64 + k, y + 64 - Math.sqrt(2600 - k * k)); c.lineTo(x + 64 + k, y + 64 + Math.sqrt(2600 - k * k)); c.stroke(); }
  });
  S.cell('drain', 128, 64, (c, x, y, w, h) => { c.fillStyle = '#232425'; c.fillRect(x + 2, y + 6, w - 4, h - 12); c.fillStyle = '#4b4c4d'; for (let k = 0; k < 11; k++) c.fillRect(x + 8 + k * 11, y + 10, 5, h - 20); });
  const tex = new THREE.CanvasTexture(S.c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  MARKS = { tex, uv: S.uv };
  return MARKS;
}

function signSheet() {
  if (SIGNS) return SIGNS;
  const S = sheet(1024, 1024), B = '#1d4f9c';
  const panel = (c, x, y, w, h, bg, fg = '#ffffff', border = true) => { c.fillStyle = bg; c.fillRect(x, y, w, h); if (border) { c.strokeStyle = fg; c.lineWidth = 4; c.strokeRect(x + 7, y + 7, w - 14, h - 14); } c.fillStyle = fg; };
  const round = (c, x, y, s, ring, inner) => { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + s / 2, y + s / 2, s / 2 - 2, 0, 7); c.fill(); c.strokeStyle = ring; c.lineWidth = s * 0.11; c.beginPath(); c.arc(x + s / 2, y + s / 2, s / 2 - s * 0.07, 0, 7); c.stroke(); if (inner) inner(); };
  const tri = (c, x, y, s, down) => { c.fillStyle = '#ffffff'; c.strokeStyle = '#d32f2f'; c.lineWidth = 12; c.lineJoin = 'round'; c.beginPath(); if (down) { c.moveTo(x + 8, y + 12); c.lineTo(x + s - 8, y + 12); c.lineTo(x + s / 2, y + s - 10); } else { c.moveTo(x + s / 2, y + 10); c.lineTo(x + s - 8, y + s - 14); c.lineTo(x + 8, y + s - 14); } c.closePath(); c.fill(); c.stroke(); };
  S.cell('v30', 128, 128, (c, x, y) => round(c, x, y, 128, '#d32f2f', () => { c.fillStyle = '#111'; font(c, '30', 80, 62); c.fillText('30', x + 64, y + 68); }));
  S.cell('yield', 128, 128, (c, x, y) => tri(c, x, y, 128, true));
  S.cell('giratoire', 128, 128, (c, x, y) => { tri(c, x, y, 128, false); c.strokeStyle = '#111'; c.lineWidth = 6; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + 64, y + 78, 18, k * 2.1, k * 2.1 + 1.5); c.stroke(); } });
  S.cell('noentry', 128, 128, (c, x, y) => { c.fillStyle = '#d32f2f'; c.beginPath(); c.arc(x + 64, y + 64, 62, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(x + 20, y + 54, 88, 20); });
  S.cell('P', 128, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, B); font(c, 'P', 100, 104); c.fillText('P', x + 64, y + 70); });
  S.cell('pmr', 128, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, B); wheelchair(c, x + 26, y + 14, 76, '#fff'); font(c, 'Place réservée', 110, 16, 700); c.fillText('Place réservée', x + 64, y + 108); });
  S.cell('ev', 128, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, '#2e7d32'); c.beginPath(); c.moveTo(x + 70, y + 16); c.lineTo(x + 42, y + 62); c.lineTo(x + 62, y + 62); c.lineTo(x + 54, y + 96); c.lineTo(x + 86, y + 48); c.lineTo(x + 66, y + 48); c.closePath(); c.fill(); font(c, 'RECHARGE', 104, 18); c.fillText('RECHARGE', x + 64, y + 112); });
  S.cell('bus', 128, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, '#f2c230', '#123a6e'); font(c, 'BUS', 108, 54); c.fillText('BUS', x + 64, y + 50); font(c, '12 · 34', 100, 26, 800); c.fillText('12 · 34', x + 64, y + 96); });
  S.cell('gratuit', 256, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, B); font(c, 'P', 90, 100); c.fillText('P', x + 58, y + 68); font(c, 'GRATUIT', 150, 40); c.fillText('GRATUIT', x + 170, y + 52); font(c, 'accès libre 7 j / 7', 140, 24, 700); c.fillText('accès libre 7 j / 7', x + 170, y + 90); });
  S.cell('depose', 256, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, B); font(c, 'DÉPOSE', 220, 44); c.fillText('DÉPOSE', x + 128, y + 44); font(c, 'MINUTE — 10 min', 220, 26, 700); c.fillText('MINUTE — 10 min', x + 128, y + 92); });
  S.cell('personnel', 256, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, '#ffffff', '#1d4f9c'); font(c, 'RÉSERVÉ AU', 220, 32); c.fillText('RÉSERVÉ AU', x + 128, y + 42); font(c, 'PERSONNEL', 220, 40); c.fillText('PERSONNEL', x + 128, y + 88); });
  S.cell('video', 256, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, '#ffffff', '#111'); c.fillStyle = '#111'; c.fillRect(x + 22, y + 44, 44, 26); c.beginPath(); c.moveTo(x + 66, y + 50); c.lineTo(x + 84, y + 40); c.lineTo(x + 84, y + 74); c.lineTo(x + 66, y + 64); c.fill(); font(c, 'SITE SOUS', 140, 22); c.fillText('SITE SOUS', x + 170, y + 46); font(c, 'VIDÉOPROTECTION', 150, 22); c.fillText('VIDÉOPROTECTION', x + 170, y + 78); });
  S.cell('hauteur', 512, 128, (c, x, y, w, h) => { c.fillStyle = '#f5c518'; c.fillRect(x, y, w, h); c.fillStyle = '#111'; for (let k = -32; k < w; k += 64) { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + k + 32, y); c.lineTo(x + k + 12, y + 18); c.lineTo(x + k - 20, y + 18); c.fill(); c.beginPath(); c.moveTo(x + k, y + 110); c.lineTo(x + k + 32, y + 110); c.lineTo(x + k + 12, y + 128); c.lineTo(x + k - 20, y + 128); c.fill(); } font(c, 'HAUTEUR LIMITÉE 2,10 m', 470, 52); c.fillText('HAUTEUR LIMITÉE 2,10 m', x + 256, y + 66); });
  S.cell('dirEntree', 512, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, '#ffffff', '#123a6e'); arrowPath(c, x + 56, y + 64, 84, 28, -Math.PI / 2); font(c, 'ENTRÉE PRINCIPALE', 380, 46); c.fillText('ENTRÉE PRINCIPALE', x + 290, y + 50); font(c, 'Galeries · Hypermarché · Ciné', 380, 24, 700); c.fillText('Galeries · Hypermarché · Ciné', x + 290, y + 92); });
  S.cell('dirSortie', 256, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, '#ffffff', '#123a6e'); font(c, 'SORTIE', 170, 48); c.fillText('SORTIE', x + 104, y + 66); arrowPath(c, x + 212, y + 64, 70, 24, Math.PI / 2); });
  S.cell('dirLivr', 256, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, '#ffffff', '#123a6e'); font(c, 'LIVRAISONS', 220, 40); c.fillText('LIVRAISONS', x + 128, y + 48); font(c, 'Personnel · Pompiers', 220, 22, 700); c.fillText('Personnel · Pompiers', x + 128, y + 92); });
  S.cell('dirP1', 256, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, B); font(c, 'P', 70, 80); c.fillText('P', x + 50, y + 66); font(c, 'NIVEAU -1', 150, 34); c.fillText('NIVEAU -1', x + 160, y + 50); font(c, 'couvert', 150, 26, 700); c.fillText('couvert', x + 160, y + 88); });
  S.cell('sos', 128, 256, (c, x, y, w, h) => { c.fillStyle = '#f2c230'; c.fillRect(x, y, w, h); c.fillStyle = '#c62828'; c.fillRect(x + 10, y + 10, w - 20, 64); c.fillStyle = '#fff'; font(c, 'SOS', 100, 50); c.fillText('SOS', x + 64, y + 44); c.fillStyle = '#111'; font(c, 'APPEL', 110, 26); c.fillText('APPEL', x + 64, y + 100); c.fillText("D'URGENCE", x + 64, y + 128); c.fillStyle = '#222'; c.beginPath(); c.arc(x + 64, y + 182, 26, 0, 7); c.fill(); c.fillStyle = '#c62828'; c.beginPath(); c.arc(x + 64, y + 182, 19, 0, 7); c.fill(); for (let k = 0; k < 4; k++) { c.fillStyle = '#333'; c.fillRect(x + 30 + k * 18, y + 222, 10, 10); } });
  S.cell('barree', 128, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, '#ffffff', '#c62828'); c.fillStyle = '#c62828'; font(c, 'ROUTE', 110, 34); c.fillText('ROUTE', x + 64, y + 46); font(c, 'BARRÉE', 110, 34); c.fillText('BARRÉE', x + 64, y + 86); });
  S.cell('deviation', 128, 128, (c, x, y, w, h) => { panel(c, x, y, w, h, '#f2c230', '#111'); font(c, 'DÉVIATION', 112, 24); c.fillText('DÉVIATION', x + 64, y + 40); arrowPath(c, x + 64, y + 86, 64, 22, Math.PI / 2); });
  S.cell('horaires', 256, 256, (c, x, y, w, h) => { // fiche horaire de l'arrêt
    c.fillStyle = '#f6f4ee'; c.fillRect(x, y, w, h); c.fillStyle = '#123a6e'; c.fillRect(x, y, w, 40); c.fillStyle = '#fff'; font(c, 'HÉLIOS — Centre commercial', 236, 20); c.fillText('HÉLIOS — Centre commercial', x + 128, y + 21);
    c.fillStyle = '#222'; c.textAlign = 'left'; c.font = '700 15px Arial'; c.fillText('Ligne 12  Gare SNCF ↔ ZI Nord', x + 10, y + 56); c.font = '13px monospace';
    const rows = ['06 12 42', '07 05 25 45', '08 05 25 45', '09 15 45', '…', '18 05 25 45', '19 15 45', '20 15', '21 47 dernier'];
    rows.forEach((r, k) => c.fillText(r, x + 14, y + 78 + k * 16)); c.font = '700 13px Arial'; c.fillText('Ligne 34  dim. et fêtes', x + 10, y + 228); c.font = '11px Arial'; c.fillText('Arrêt non desservi après 22 h', x + 10, y + 245); c.textAlign = 'center';
  });
  S.cell('arret', 256, 64, (c, x, y, w, h) => { panel(c, x, y, w, h, '#123a6e', '#fff', false); font(c, 'Hélios — Centre commercial', 240, 28, 800); c.fillText('Hélios — Centre commercial', x + 128, y + 34); });
  S.cell('chariots', 256, 64, (c, x, y, w, h) => { panel(c, x, y, w, h, '#2e7d32', '#fff', false); font(c, 'CHARIOTS', 230, 40); c.fillText('CHARIOTS', x + 128, y + 34); });
  for (const [k, txt, col] of [['verre', 'VERRE', '#2e7d32'], ['papier', 'PAPIERS', '#1565c0'], ['emball', 'EMBALLAGES', '#f2c230']]) S.cell(k, 128, 48, (c, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); c.fillStyle = col === '#f2c230' ? '#111' : '#fff'; font(c, txt, 118, 30); c.fillText(txt, x + 64, y + 26); });
  const ROWS = [['A', '#e53935'], ['B', '#1e88e5'], ['C', '#43a047'], ['D', '#fb8c00'], ['E', '#8e24aa'], ['F', '#00897b']];
  for (const [l, col] of ROWS) S.cell('row' + l, 64, 64, (c, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); c.fillStyle = '#fff'; font(c, l, 50, 52); c.fillText(l, x + 32, y + 36); });
  S.cell('entreeSite', 512, 96, (c, x, y, w, h) => { panel(c, x, y, w, h, '#20262e', '#ffb300'); sunLogo(c, x + 50, y + 48, 36); c.fillStyle = '#fff'; font(c, 'CENTRE COMMERCIAL HÉLIOS', 400, 34); c.fillText('CENTRE COMMERCIAL HÉLIOS', x + 290, y + 40); c.fillStyle = '#ffb300'; font(c, 'Entrée · Parking 450 places', 380, 22, 700); c.fillText('Entrée · Parking 450 places', x + 290, y + 74); });
  S.cell('pylonTop', 256, 256, (c, x, y, w, h) => { c.fillStyle = '#1b2430'; c.fillRect(x, y, w, h); sunLogo(c, x + 128, y + 96, 78); c.fillStyle = '#ffffff'; font(c, 'HÉLIOS', 230, 66); c.fillText('HÉLIOS', x + 128, y + 204); c.fillStyle = '#ffb300'; font(c, 'CENTRE COMMERCIAL', 220, 20, 800); c.fillText('CENTRE COMMERCIAL', x + 128, y + 240); });
  S.cell('pylonBrands', 256, 384, (c, x, y, w, h) => {
    c.fillStyle = '#e9ebee'; c.fillRect(x, y, w, h);
    const L = [['Hypermarché Hélios', '#2e7d32'], ['Ciné Hélios', '#1a237e'], ['Galaxy Arcade', '#7b1fa2'], ['Hélios Sport', '#2962ff'], ['Royaume du Jouet', '#ef6c00'], ['ElectroMaison', '#1565c0'], ['Pizzeria Napoli', '#c62828']];
    L.forEach(([t, col], k) => { const yy = y + 6 + k * 54; c.fillStyle = col; c.fillRect(x + 8, yy, w - 16, 48); c.fillStyle = '#fff'; font(c, t, w - 30, 28, 800); c.fillText(t, x + 128, yy + 25); });
  });
  for (const [k, i] of [['affHelios', 6], ['affLucie', 2], ['affSoldes', 0]]) S.cell(k, 128, 180, (c, x, y, w, h) => { const img = posterTexture(i).image; if (img) c.drawImage(img, x, y, w, h); });
  S.cell('metal', 32, 32, (c, x, y, w, h) => { c.fillStyle = '#9aa0a6'; c.fillRect(x, y, w, h); });
  S.cell('ticket', 128, 128, (c, x, y, w, h) => { c.fillStyle = '#263238'; c.fillRect(x, y, w, h); c.fillStyle = '#0c1418'; c.fillRect(x + 14, y + 12, 100, 40); c.fillStyle = '#76ff03'; font(c, 'BIENVENUE', 90, 16, 700); c.fillText('BIENVENUE', x + 64, y + 26); c.fillText('Prenez un ticket', x + 64, y + 42); c.fillStyle = '#ffb300'; c.beginPath(); c.arc(x + 64, y + 78, 14, 0, 7); c.fill(); c.fillStyle = '#111'; c.fillRect(x + 34, y + 102, 60, 6); });
  const tex = new THREE.CanvasTexture(S.c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  SIGNS = { tex, uv: S.uv };
  return SIGNS;
}

// ───────────────────────── géométries utilitaires ─────────────────────────
function mkGeo(pos, nor, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
// polygone plan convexe (sommets [x, y, z] dans l'ordre), normale tournée vers `up` ; UV = coordonnées monde (m)
function polyGeo(pts, up) {
  const a = V3(...pts[0]), n = V3(...pts[1]).sub(a).cross(V3(...pts[2]).sub(a)).normalize(); let P = pts;
  if (n.dot(up) < 0) { P = [...pts].reverse(); n.negate(); }
  const ax = Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z) ? 0 : Math.abs(n.y) >= Math.abs(n.z) ? 1 : 2;
  const pos = [], nor = [], uv = [], idx = [];
  for (const p of P) { pos.push(p[0], p[1], p[2]); nor.push(n.x, n.y, n.z); uv.push(ax === 0 ? p[2] : p[0], ax === 1 ? p[2] : p[1]); }
  for (let k = 1; k < P.length - 1; k++) idx.push(0, k, k + 1);
  return mkGeo(pos, nor, uv, idx);
}
// rectangle [x0, z0, x1, z1] moins des rectangles : liste de rectangles disjoints
function subRects(r, holes) {
  let out = [r];
  for (const h of holes) {
    const next = [];
    for (const q of out) {
      if (h[2] <= q[0] + 1e-6 || h[0] >= q[2] - 1e-6 || h[3] <= q[1] + 1e-6 || h[1] >= q[3] - 1e-6) { next.push(q); continue; }
      if (h[0] > q[0]) next.push([q[0], q[1], h[0], q[3]]);
      if (h[2] < q[2]) next.push([h[2], q[1], q[2], q[3]]);
      const xa = Math.max(q[0], h[0]), xb = Math.min(q[2], h[2]);
      if (h[1] > q[1]) next.push([xa, q[1], xb, h[1]]);
      if (h[3] < q[3]) next.push([xa, h[3], xb, q[3]]);
    }
    out = next;
  }
  return out;
}
// intervalles [a, b] moins des intervalles
function subSpans(a, b, cuts) { let out = [[a, b]]; for (const [c, d] of cuts) { const n = []; for (const [p, q] of out) { if (d <= p || c >= q) { n.push([p, q]); continue; } if (c > p) n.push([p, c]); if (d < q) n.push([d, q]); } out = n; } return out; }

// ───────────────────────── îlots, trottoirs, parvis ─────────────────────────
// Dalle surélevée (dessus à y = top) posée sur la chaussée : dessus (pavés, gazon…), bordures de béton de 15 cm sur les
// arêtes `edges` ('x' ouest, 'X' est, 'z' sud, 'Z' nord) sauf aux bateaux (bordure abaissée, rampe dallée de 1 m,
// joues, bande podotactile). bats : [{ e, a, b }] (intervalle le long de l'arête). La collision est la boîte entière
// (une marche de 15 cm : le joueur la franchit).
const CURB = 0.15, BAT = 1.0;
function island(A, Q, zone, r, mat, edges = 'xXzZ', bats = [], o = {}) {
  const [x0, z0, x1, z1] = r, top = o.top ?? YP;
  const strip = (b) => b.e === 'x' ? [x0, b.a, x0 + BAT, b.b] : b.e === 'X' ? [x1 - BAT, b.a, x1, b.b] : b.e === 'z' ? [b.a, z0, b.b, z0 + BAT] : [b.a, z1 - BAT, b.b, z1];
  for (const s of subRects(r, bats.map(strip))) A.box(zone, mat, s[0], top - 0.05, s[1], s[2], top, s[3], { faces: 'Y', collide: false });
  if (o.collide !== false) A.world.physics.add(new Box(x0, YR - 0.3, z0, x1, top, z1, LAYER.FURN));
  for (const e of edges) {
    const alongX = e === 'z' || e === 'Z', a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1, my = bats.filter((b) => b.e === e);
    const box = (a, b, yt, face) => {
      if (e === 'x') A.box(zone, 'concrete', x0, YR - 0.02, a, x0 + CURB, yt, b, { faces: 'Y' + face, collide: false });
      else if (e === 'X') A.box(zone, 'concrete', x1 - CURB, YR - 0.02, a, x1, yt, b, { faces: 'Y' + face, collide: false });
      else if (e === 'z') A.box(zone, 'concrete', a, YR - 0.02, z0, b, yt, z0 + CURB, { faces: 'Y' + face, collide: false });
      else A.box(zone, 'concrete', a, YR - 0.02, z1 - CURB, b, yt, z1, { faces: 'Y' + face, collide: false });
    };
    for (const [a, b] of subSpans(a0, a1, my.map((m) => [m.a, m.b]))) box(a, b, top + 0.012, e);
    for (const m of my) {
      box(m.a, m.b, YR + 0.03, e);
      // rampe : de la bordure abaissée (arête) au dessus de l'îlot, à 1 m à l'intérieur ; joues aux deux bouts
      const lo = YR + 0.03, P = (u, v, y) => alongX ? [u, y, v] : [v, y, u]; // u : le long de l'arête, v : perpendiculaire
      const ve = e === 'x' ? x0 + CURB : e === 'X' ? x1 - CURB : e === 'z' ? z0 + CURB : z1 - CURB, vi = e === 'x' ? x0 + BAT : e === 'X' ? x1 - BAT : e === 'z' ? z0 + BAT : z1 - BAT;
      A.shapeM(zone, mat, polyGeo([P(m.a, ve, lo), P(m.b, ve, lo), P(m.b, vi, top), P(m.a, vi, top)], V3(0, 1, 0)));
      for (const u of [m.a, m.b]) A.shapeM(zone, mat, polyGeo([P(u, ve, lo), P(u, ve, top), P(u, vi, top)], alongX ? V3(u === m.a ? 1 : -1, 0, 0) : V3(0, 0, u === m.a ? 1 : -1)));
      // bande d'éveil de vigilance en haut de la rampe
      const vm = vi + (vi > ve ? 0.25 : -0.25), mid = (m.a + m.b) / 2, len = m.b - m.a - 0.2;
      if (alongX) Q.floor(mid, top + 0.004, vm, 0, 1, len, 0.4, MARKS.uv.dots); else Q.floor(vm, top + 0.004, mid, 1, 0, len, 0.4, MARKS.uv.dots);
    }
  }
}

// ───────────────────────── marquages ─────────────────────────
const YM = YR + 0.006; // hauteur des marquages au sol
function line(Q, x0, z0, x1, z1, w = 0.12, uv = MARKS.uv.white, y = YM) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 1e-3) return;
  Q.floor((x0 + x1) / 2, y, (z0 + z1) / 2, dx / L, dz / L, w, L, uv);
}
function dashed(Q, x0, z0, x1, z1, dash = 3, gap = 3.5, w = 0.12) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  for (let t = 0; t < L; t += dash + gap) { const t1 = Math.min(L, t + dash); line(Q, x0 + ux * t, z0 + uz * t, x0 + ux * t1, z0 + uz * t1, w); }
}
// numéro peint (chiffres lus depuis l'allée : le haut des chiffres vers le fond de la place)
function number(Q, x, z, ux, uz, n) {
  const s = String(n), rx = -uz, rz = ux;
  for (let d = 0; d < s.length; d++) { const o = (d - (s.length - 1) / 2) * 0.24; Q.floor(x + rx * o, YM, z + rz * o, ux, uz, 0.22, 0.44, MARKS.uv['d' + s[d]]); }
}
// rangée de places : le long de x (places de 2,5 m sur z0…z1, ouverture `open` = ±1 selon z) ou le long de z (axis 'z' :
// places sur x0…x1, ouverture selon x). widths : largeurs successives (types : 'pmr', 'fam', 'ev', sinon standard).
// Retourne les places [{ cx, cz, w, d, ux, uz, kind }] (u : vers le fond de la place).
function bayRow(Q, row) {
  const { axis = 'x', a0, a1, b0, b1, open, n0 = 1, types = [], numbers = true } = row, out = [];
  const back = open > 0 ? b0 : b1, front = open > 0 ? b1 : b0, ub = -open; // u : de l'ouverture vers le fond
  const P = (a, b) => axis === 'x' ? [a, b] : [b, a];
  let a = a0, k = 0;
  const seg = (aa, f0, f1, w = 0.12) => { const [xa, za] = P(aa, f0), [xb, zb] = P(aa, f1); line(Q, xa, za, xb, zb, w); };
  seg(a, back + ub * -0.15, front);
  while (true) {
    const kind = types[k] || 'std', w = kind === 'pmr' ? 3.3 : kind === 'fam' ? 3.0 : 2.5;
    if (a + w > a1 + 1e-6) break;
    const ca = a + w / 2, cb = (b0 + b1) / 2;
    seg(a + w, back + ub * -0.15, front);
    const [cx, cz] = P(ca, cb), [ux, uz] = axis === 'x' ? [0, ub] : [ub, 0];
    if (kind === 'pmr') { // pictogramme et bande latérale hachurée de 0,8 m (côté a + w)
      Q.floor(cx - ux * 0.3 - (axis === 'z' ? 0 : 0.35), YM, cz - uz * 0.3 - (axis === 'z' ? 0.35 : 0), ux, uz, 1.3, 1.3, MARKS.uv.pmr);
      const [hx, hz] = P(a + w - 0.4, cb); hatch(Q, hx, hz, ux, uz, 0.8, Math.abs(b1 - b0) - 0.3, 0.5, 0.08);
    } else if (kind === 'fam') Q.floor(cx - ux * 0.4, YM, cz - uz * 0.4, ux, uz, 1.1, 1.1, MARKS.uv.family);
    else if (kind === 'ev') Q.floor(cx - ux * 0.4, YM, cz - uz * 0.4, ux, uz, 1.0, 1.0, MARKS.uv.ev);
    else if (numbers) { const [nx, nz] = P(ca, front + ub * 0.55); number(Q, nx, nz, ux, uz, n0 + k); }
    out.push({ cx, cz, w, d: Math.abs(b1 - b0), ux, uz, kind, front: P(ca, front), backAt: P(ca, back) });
    a += w; k++;
  }
  return out;
}
// passage piéton (bandes de 0,5 m tous les 1 m) en travers d'une chaussée : de (x0, z0) à (x1, z1), largeur w
function zebra(Q, x0, z0, x1, z1, w = 2.5) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  for (let t = 0.5; t < L - 0.3; t += 1.0) Q.floor(x0 + ux * (t + 0.25), YM, z0 + uz * (t + 0.25), -uz, ux, 0.5, w, MARKS.uv.white);
}
// ligne de « cédez le passage » en dents de requin (pointes vers le conducteur arrivant dans le sens (ux, uz))
function teeth(Q, x0, z0, x1, z1, ux, uz) {
  const L = Math.hypot(x1 - x0, z1 - z0), ax = (x1 - x0) / L, az = (z1 - z0) / L;
  for (let t = 0.35; t < L; t += 0.7) Q.floor(x0 + ax * t, YM, z0 + az * t, ux, uz, 0.45, 0.55, MARKS.uv.yield);
}
// hachures à 45° dans un rectangle (largeur w en travers de u, longueur L selon u), avec cadre
function hatch(Q, cx, cz, ux, uz, w, L, step = 0.55, lw = 0.1) {
  const rx = -uz, rz = ux, P = (s, t) => [cx + rx * s + ux * t, cz + rz * s + uz * t];
  for (let c = -L / 2 - w / 2; c <= L / 2 + w / 2; c += step) {
    const s0 = Math.max(-w / 2, -L / 2 - c), s1 = Math.min(w / 2, L / 2 - c); if (s1 - s0 < 0.08) continue;
    const a = P(s0, s0 + c), b = P(s1, s1 + c); line(Q, a[0], a[1], b[0], b[1], lw);
  }
  const C = [P(-w / 2, -L / 2), P(w / 2, -L / 2), P(w / 2, L / 2), P(-w / 2, L / 2)];
  for (let k = 0; k < 4; k++) line(Q, C[k][0], C[k][1], C[(k + 1) % 4][0], C[(k + 1) % 4][1], lw);
}

// ───────────────────────── zones ─────────────────────────
function setupZones(world) {
  const out = world.zone(ZO);
  out.extra.push([FW - 1, -3, 25.6, XF, 30, FZ + 1], [FW - 1, -3, -FZ - 1, XF, 30, -25.6]); // le long des façades latérales
  out.visibleAt = (p, lv, near, cz) => outdoorCam(p) || (!!cz && ((cz.circuit === 'gallery' && p.x > -30) || cz.id === 'ramp'));
  // zones de rendu seules : boîtes dans le ciel (jamais « occupées », ni prises pour une ouverture de façade)
  const mk = (id, name, b, vis) => { const z = world.addZone(new Zone(id, name, 'outside', 0, b[0], 60, b[1], b[2], 61, b[3], { area: id, cull: 1e4 })); z.visibleAt = vis; return z; };
  const seen = (p, lv, near, cz) => outdoorCam(p) || (!!cz && VIEW_E.has(cz.id));
  mk(ZL, 'Parking extérieur — rangées', [XF, -FZ, FX, FZ], seen);
  mk(ZF, 'Abords lointains', [FX, -400, 700, 400], seen);
  mk(ZS, 'Façades latérales', [-113, -FZ, XF, FZ], (p) => outdoorCam(p));
}

// ───────────────────────── sol, parvis, îlots ─────────────────────────
// surfaces surélevées : { zn, mat, r: rect, edges: arêtes à bordure, bats: bateaux }
const ISLANDS = (() => {
  const L = [], add = (zn, mat, r, edges = 'xXzZ', bats = []) => L.push({ zn, mat, r, edges, bats });
  // parvis (y = 0) autour de la tranchée, du dépose-minute (z 9 … 21) et du quai de bus (z -20 … -10)
  add(ZO, 'paving', [XF, -1.6, 96, 9], ''); add(ZO, 'paving', [96, -1.6, 98.5, 9], 'XZ', [{ e: 'X', a: 4.2, b: 6.4 }]);
  add(ZO, 'paving', [XF, 9, 96, 21], 'X');
  add(ZO, 'paving', [XF, 21, 96, 30], ''); add(ZO, 'paving', [96, 21, 98.5, 30], 'Xz', [{ e: 'X', a: 22.5, b: 24.5 }]);
  add(ZO, 'paving', [XF, -10, 95.5, -7.4], ''); add(ZO, 'paving', [95.5, -10, 98.5, -7.4], 'Xz');
  add(ZO, 'paving', [XF, -20, 95.5, -10], 'X');
  add(ZO, 'paving', [XF, -30, 95.5, -20], ''); add(ZO, 'paving', [95.5, -30, 98.5, -20], 'XZ', [{ e: 'X', a: -24.5, b: -22.5 }]);
  // le long de la façade nord : trottoir, pelouse et allée vers la porte de service, parking du personnel
  add(ZS, 'paving', [FW, 25.6, XF, 28.6], '');
  add(ZS, 'grass', [FW, 28.6, 73, 42.5], 'Z'); add(ZS, 'paving', [73, 28.6, 75, 42.5], 'Z', [{ e: 'Z', a: 73.2, b: 74.8 }]); add(ZS, 'grass', [75, 28.6, XF, 42.5], 'Z');
  add(ZL, 'grass', [XF, 30, 98.5, 42.5], 'XZ');
  add(ZS, 'grass', [FW, 42.5, 62, 47.5], 'XZ'); add(ZS, 'grass', [FW, 53.5, 62, 58.5], 'Xz');
  add(ZS, 'grass', [FW, 58.5, XF, FZ], 'z'); add(ZL, 'grass', [XF, 58.5, 98.5, FZ], 'z');
  // côté sud : trottoir devant la cour de service, pelouses, point de collecte (dalle)
  add(ZS, 'paving', [FW, -47.5, XF, -46], 'z');
  add(ZL, 'grass', [XF, -47.5, 98.5, -33.5], 'Xz'); add(ZL, 'grass', [XF, -33.5, 83, -30], ''); add(ZL, 'paving', [83, -33.5, 93, -30], ''); add(ZL, 'grass', [93, -33.5, 98.5, -30], 'X');
  add(ZS, 'grass', [FW, -FZ, XF, -53.5], 'Z'); add(ZL, 'grass', [XF, -FZ, 98.5, -53.5], 'XZ');
  // rangées : trottoirs de l'allée principale, nez d'îlots, allées piétonnes (±23,5), îlots plantés (±41,5), coins
  for (const s of [1, -1]) {
    const R = (x0, a, x1, b) => s > 0 ? [x0, a, x1, b] : [x0, -b, x1, -a];
    const E = (e) => s > 0 ? e : e.replace(/[zZ]/g, (m) => m === 'z' ? 'Z' : 'z');
    const B = (e, a, b) => s > 0 ? { e, a, b } : { e: e === 'z' ? 'Z' : e === 'Z' ? 'z' : e, a: e === 'x' || e === 'X' ? -b : a, b: e === 'x' || e === 'X' ? -a : b };
    add(ZL, 'paving', R(106, 4, 151.5, 6.5), 'xXzZ', s > 0 ? [B('x', 4.2, 6.4), B('z', 110, 112.5)] : [B('z', 110, 112.5)]);
    add(ZL, 'grass', R(106, 6.5, 108.5, 11.5), E('xXZ')); add(ZL, 'grass', R(146, 6.5, 151.5, 11.5), E('xXZ'));
    add(ZL, 'grass', R(106, 17.5, 108.5, 29.5), 'xXzZ', [B('x', 22.5, 24.5)]); add(ZL, 'paving', R(108.5, 22.5, 156, 24.5), 'zZ'); add(ZL, 'grass', R(156, 17.5, 159, 29.5), 'xXzZ');
    add(ZL, 'grass', R(106, 35.5, 108.5, 47.5), 'xXzZ'); add(ZL, 'grass', R(108.5, 40.5, 156, 42.5), 'zZ'); add(ZL, 'grass', R(156, 35.5, 159, 47.5), 'xXzZ');
    add(ZL, 'grass', R(98.5, 53.5, 108.5, 58.5), E('xXz')); add(ZL, 'grass', R(156, 53.5, 170, 58.5), E('xz')); add(ZL, 'grass', R(165, 52, 170, 53.5), E('xz'));
    add(ZL, 'grass', R(165, 7, 170, 14), E('xzZ'));
    add(ZL, 'grass', R(98.5, 58.5, 170, FZ), E('z')); add(ZL, 'grass', R(170, 7, FX, 58.5), E('xz'));
    add(ZL, 'paving', R(172, 4, FX, 7), E('xz')); add(ZF, 'paving', R(FX, 4, 186, 7), E('zX'), [B('z', 176.5, 179.5)]);
    add(ZF, 'grass', R(FX, 7, 186, 72), 'X');
  }
  add(ZL, 'paving', [143, -0.8, 150.3, 0.8], 'xXzZ'); add(ZL, 'paving', [173.7, -0.8, 181, 0.8], 'xXzZ');
  add(ZF, 'paving', [196, -72, 199, 72], 'x');
  return L;
})();

function buildGround(A, Q, world) {
  // chaussée (sol des voitures et des piétons), trouée par la tranchée de la rampe ; l'avenue se prolonge au loin
  for (const [x0, z0, x1, z1, zn] of [[98, -FZ, FX, FZ, ZO], [XF, -FZ, 98, -7.4, ZO], [XF, -1.6, 98, FZ, ZO], [FW, 25.6, XF, FZ, ZS], [FW, -FZ, XF, -25.6, ZS], [FX, -7.5, 186, 7.5, ZF], [186, -72, 196, 72, ZF]])
    A.box(zn, 'asphalt', x0, YR - 0.6, z0, x1, YR, z1, { faces: 'Y' });
  for (const s of [1, -1]) { A.box(ZF, 'asphalt', 186, YR - 0.6, s > 0 ? 72 : -420, 196, YR, s > 0 ? 420 : -72, { faces: 'Y', collide: false }); A.box(ZF, 'paving', 196, YR - 0.6, s > 0 ? 72 : -420, 199, YP, s > 0 ? 420 : -72, { faces: 'Y', collide: false }); }
  for (const it of ISLANDS) island(A, Q[it.zn], it.zn, it.r, it.mat, it.edges, it.bats);
  // cour de service : dalle de béton balayée au niveau de la chaussée
  A.box(ZS, 'concrete_floor', FW, YR - 0.1, -46, XF, YR + 0.012, -25.6, { faces: 'Y', collide: false });
  // giratoire : îlot central bombé (gazon), anneau franchissable pavé, bordure ; collision en octogone
  const [cx, cz] = RC;
  A.lathe(ZL, 'grass', [[5.55, YP + 0.01], [4.5, YP + 0.12], [2.8, YP + 0.24], [0, YP + 0.3]], 40, cx, 0, cz);
  A.lathe(ZL, 'paving', [[RI - 0.15, YP - 0.06], [5.55, YP - 0.06]], 40, cx, 0, cz);
  A.lathe(ZL, 'paving', [[5.55, YP - 0.06], [5.55, YP + 0.01]], 40, cx, 0, cz);
  A.lathe(ZL, 'concrete', [[RI, YR - 0.02], [RI, YP - 0.02], [RI - 0.15, YP - 0.02]], 48, cx, 0, cz);
  for (const [a, b] of [[RI - 0.2, 2.7], [2.7, RI - 0.2], [4.6, 4.6]]) world.physics.add(new Box(cx - a, YR - 0.3, cz - b, cx + a, YP, cz + b, LAYER.FURN));
  // fond lointain : prés et friches jusqu'à l'horizon (sous la chaussée)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), world.game.mats.get('grass', ZO));
  far.rotation.x = -Math.PI / 2; far.position.set(60, YR - 0.12, 0); far.receiveShadow = true; far.matrixAutoUpdate = false; far.updateMatrix();
  const uv = far.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 750, uv.getY(i) * 750);
  world.zone(ZO).group.add(far);
}

// ───────────────────────── marquages de la voirie et des places ─────────────────────────
function buildMarkings(Q, rng) {
  const q = Q[ZL], q0 = Q[ZO], bays = [];
  for (const s of [1, -1]) {
    const row = (a0, a1, b0, b1, open, n0, types = []) => { const r = s > 0 ? { a0, a1, b0, b1, open } : { a0, a1, b0: -b1, b1: -b0, open: -open }; bays.push(...bayRow(q, { ...r, n0, types })); };
    const n = s > 0 ? 100 : 700;
    row(108.5, 146, 6.5, 11.5, 1, n + 1, s > 0 ? ['pmr', 'pmr', 'pmr', 'pmr', 'fam', 'fam'] : ['pmr', 'pmr', 'ev', 'ev', 'ev', 'ev']);
    row(108.5, 156, 17.5, 22.5, -1, n + 101); row(108.5, 156, 24.5, 29.5, 1, n + 201); row(108.5, 156, 35.5, 40.5, -1, n + 301);
    row(108.5, 156, 42.5, 47.5, 1, n + 401); row(108.5, 156, 53.5, 58.5, -1, n + 501);
    const re = s > 0 ? { a0: 14, a1: 51.5 } : { a0: -51.5, a1: -14 };
    bays.push(...bayRow(q, { axis: 'z', ...re, b0: 165, b1: 170, open: -1, n0: s > 0 ? 1301 : 1401 }));
    // flèches des allées à double sens (on roule à droite : vers +x du côté +z) et de l'allée principale
    for (const zc of [14.5, 32.5, 50.5]) for (let x = 114; x < 156; x += 14) { q.floor(x, YM, s * zc + 1.5, 1, 0, 0.9, 2.2, MARKS.uv.arrow); q.floor(x + 7, YM, s * zc - 1.5, -1, 0, 0.9, 2.2, MARKS.uv.arrow); }
    for (let x = 118; x < 142; x += 12) q.floor(x, YM, s * 2, s, 0, 1.0, 2.6, MARKS.uv.arrow);
    for (let z = 20; z < 50; z += 14) { q.floor(163.5, YM, s * z, 0, -1, 0.9, 2.2, MARKS.uv.arrow); q.floor(160.5, YM, s * (z + 7), 0, 1, 0.9, 2.2, MARKS.uv.arrow); } // allée de ceinture
  }
  // places du personnel (le long de la façade nord)
  bays.push(...bayRow(Q[ZS], { a0: 62, a1: 98.5, b0: 42.5, b1: 47.5, open: 1, numbers: false }).map((b) => ({ ...b, staff: true })));
  bays.push(...bayRow(Q[ZS], { a0: 62, a1: 98.5, b0: 53.5, b1: 58.5, open: -1, numbers: false }).map((b) => ({ ...b, staff: true })));
  for (const x of [68, 88]) Q[ZS].floor(x, YM, 50.5, -1, 0, 1.0, 4.0, MARKS.uv.personnel);
  // voie de desserte : axe, flèches, dépose-minute, quai de bus ; passages piétons
  dashed(q0, 102.25, -47, 102.25, -8, 3, 3.5); dashed(q0, 102.25, 8, 102.25, 47, 3, 3.5);
  for (const z of [-40, -2, 30]) { q0.floor(100.4, YM, z, 0, 1, 0.9, 2.2, MARKS.uv.arrow); q0.floor(104.1, YM, z + 6, 0, -1, 0.9, 2.2, MARKS.uv.arrow); }
  for (const z of [9, 21]) line(q0, 96, z, 98.5, z); dashed(q0, 98.4, 9, 98.4, 21, 1, 1); q0.floor(97.25, YM, 15, 0, 1, 1.6, 6.4, MARKS.uv.depose);
  q0.floor(98.25, YM, -15, -1, 0, 9.8, 0.5, MARKS.uv.zig); q0.floor(97, YM, -15, 0, 1, 1.5, 3.0, MARKS.uv.bus);
  zebra(q0, 98.5, 5.3, 106, 5.3, 2.1); zebra(q0, 98.5, 23.5, 106, 23.5, 2.0); zebra(q0, 98.5, -23.5, 106, -23.5, 2.0);
  zebra(q, 111.25, 4, 111.25, -4, 2.4); zebra(Q[ZF], 178, -4, 178, 4, 3.0);
  // allée principale (axe), entrée du site, giratoire : cédez-le-passage aux quatre entrées, flèches sur l'anneau
  dashed(q, 114, 0, 143, 0, 3, 3.5); line(Q[ZF], 181, 0, 186, 0, 0.12); q.floor(183.5, YM, -2, -1, 0, 1.6, 1.6, MARKS.uv.z30);
  const [cx, cz] = RC;
  teeth(q, 150.6, 0.8, 150.6, 4, 1, 0); teeth(q, 173.4, -0.8, 173.4, -4, -1, 0); teeth(q, 162, 11.6, 165, 11.6, 0, -1); teeth(q, 159, -11.6, 162, -11.6, 0, 1);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, r = (RO + RI) / 2; q.floor(cx + Math.cos(a) * r, YM, cz + Math.sin(a) * r, Math.sin(a), -Math.cos(a), 0.9, 2.2, MARKS.uv.arrow); }
  // avenue : axe et rives
  dashed(Q[ZF], 191, -400, 191, 400, 3, 10, 0.15); line(Q[ZF], 186.3, -400, 186.3, 400, 0.15); line(Q[ZF], 195.7, -400, 195.7, 400, 0.15);
  // rampe : flèches d'entrée (côté sud) et de sortie (côté nord)
  q0.floor(101, YM, -5.8, -1, 0, 0.9, 2.2, MARKS.uv.arrow); q0.floor(101, YM, -3.2, 1, 0, 0.9, 2.2, MARKS.uv.arrow);
  // usure : taches d'huile au milieu des places, regards et avaloirs
  for (const b of bays) if (rng.chance(0.3)) { const qq = b.staff ? Q[ZS] : q, a = rng.range(0, 6.28), sz = rng.range(0.5, 1.2); qq.floor(b.cx + b.ux * rng.range(-0.5, 0.8), YM - 0.002, b.cz + b.uz * rng.range(-0.5, 0.8), Math.cos(a), Math.sin(a), sz, sz * 0.8, MARKS.uv.oil); }
  for (const [x, z] of [[102.3, -30], [102.3, 40], [130, 14.5], [140, -32.5], [120, 50.5], [162, -30], [125, -14.5], [152, 2.2]]) q.floor(x, YM + 0.001, z, 1, 0, 0.75, 0.75, MARKS.uv.manhole);
  for (let z = -45; z <= 45; z += 15) q0.floor(98.75, YM + 0.001, z + 2, 0, 1, 0.3, 0.6, MARKS.uv.drain);
  return bays;
}

// ───────────────────────── tranchée de la rampe du parking souterrain ─────────────────────────
// Partie à ciel ouvert (x 80,3 … 98) : murets de 0,45 m au-dessus du parvis surmontés de garde-corps, rampe lisse en
// béton rainuré (collision : marches invisibles de 1 m), caniveau à grille en haut, portique « Hauteur limitée
// 2,10 m », borne à ticket et barrière levante (lisse relevée) sur l'axe, appliques murales.
// surface visible de la rampe : partie couverte (x 66 … 80, 1,8 m) puis tranchée (x 80 … 98, 2,55 m)
export const rampTop = (x) => x <= 80 ? -4.5 + (x - 66) * 1.8 / 14 : -2.7 + (x - 80) * 2.55 / 18;
export function rampSurface(A, zone, x0, x1) { A.shapeM(zone, 'concrete_floor', polyGeo([[x0, rampTop(x0), -7], [x1, rampTop(x1), -7], [x1, rampTop(x1), -2], [x0, rampTop(x0), -2]], V3(0, 1, 0))); }
const SIGN_Q = []; // faces imprimées des panneaux, posées à la fin dans les lots de la planche
function buildTrench(A, Q, world, lamps) {
  A.stairs(ZO, 'asphalt', 80, -7, 'x+', 5, 18, 2.55, -2.7, 18, { solid: true, base: -3.1, visible: false });
  rampSurface(A, ZO, 80, 98);
  for (let x = 81; x < 97; x += 0.5) { const y = rampTop(x) + 0.003, y1 = rampTop(x + 0.06) + 0.003; Q[ZO].quad([x, y, -2.1], [x, y, -6.9], [x + 0.06, y1, -6.9], [x + 0.06, y1, -2.1], [0, 0.99, -0.14], MARKS.uv.dark); } // rainures
  for (const zw of [-7.2, -1.8]) {
    const inn = Math.sign(-4.5 - zw); // vers l'intérieur de la tranchée
    A.box(ZO, 'concrete', 80.3, -3.1, zw - 0.2, 98, 0.45, zw + 0.2, { layer: LAYER.WALL });
    A.box(ZO, 'aluminium', 80.3, 0.45, zw - 0.23, 98.04, 0.49, zw + 0.23, { collide: false });                    // couvertine
    world.physics.add(new Box(80.3, 0.45, zw - 0.2, 98.04, 1.2, zw + 0.2, LAYER.FURN));                           // garde-corps
    for (let x = 80.9; x < 98; x += 1.42) A.tube(ZO, 'steel', V3(x, 0.49, zw), V3(x, 1.12, zw), 0.022, 0xffffff, { segs: 8 });
    A.tube(ZO, 'steel', V3(80.5, 1.13, zw), V3(98, 1.13, zw), 0.03, 0xffffff, { segs: 10 });
    A.tube(ZO, 'steel', V3(80.5, 0.8, zw), V3(98, 0.8, zw), 0.016, 0xffffff, { segs: 8 });
    A.lathe(ZO, 'steel', [[0, -0.03], [0.034, -0.03], [0.034, 0.03], [0, 0.03]], 10, 98.02, 1.13, zw, 0xffffff, { rz: Math.PI / 2 });
    for (const x of [86, 93]) { A.furn(ZO, x - 0.15, -0.55, zw + inn * 0.2, x + 0.15, -0.45, zw + inn * 0.32, 0x2a2c2e, { metal: true, collide: false }); lamps.push({ kind: 'wall', x, y: -0.6, z: zw + inn * 0.3, nz: inn, zone: ZO }); }
  }
  // caniveau à grille au sommet, sur la pente
  { const x0 = 97.1, x1 = 97.45, y0 = rampTop(x0) + 0.005, y1 = rampTop(x1) + 0.005; Q[ZO].quad([x0, y0, -2], [x0, y0, -7], [x1, y1, -7], [x1, y1, -2], [0, 0.99, -0.14], MARKS.uv.drain); }
  // portique de gabarit (traverse dont le dessous est à 2,10 m de la chaussée)
  const yb = YR + 2.1;
  for (const z of [-7.75, -1.25]) {
    world.physics.add(new Box(98.15, YP, z - 0.09, 98.45, yb + 0.5, z + 0.09, LAYER.FURN));
    A.rbox(ZO, 'furniture_metal', 98.3, (YP + yb + 0.5) / 2, z, 0.16, yb + 0.5 - YP, 0.16, 0.012, 0xe0b000);
    for (let k = 0; k < 5; k++) A.furn(ZO, 98.215, 0.15 + k * 0.42, z - 0.085, 98.385, 0.36 + k * 0.42, z + 0.085, 0x1a1a1a, { collide: false });
    A.furn(ZO, 98.12, YP, z - 0.18, 98.48, YP + 0.02, z + 0.18, 0x3a3a3a, { metal: true, collide: false });
  }
  for (let k = 0; k < 13; k++) A.furn(ZO, 98.2, yb, -7.75 + k * 0.5, 98.4, yb + 0.2, -7.25 + k * 0.5, k % 2 ? 0xeeeeee : 0xd32f2f, { collide: false });
  A.furn(ZO, 98.2, yb + 0.2, -5.5, 98.4, yb + 0.7, -3.5, 0x2a2a2a, { collide: false });
  for (const nx of [1, -1]) SIGN_Q.push({ zone: ZO, x: 98.3 + nx * 0.105, y: yb + 0.45, z: -4.5, nx, nz: 0, w: 1.9, h: 0.47, key: 'hauteur' });
  // borne à ticket et barrière levante sur l'axe de la rampe (entrée au sud, sortie au nord)
  const yT = rampTop(95.6);
  world.physics.add(new Box(95.35, yT - 0.4, -4.7, 95.85, yT + 1.25, -4.3, LAYER.FURN));
  A.rbox(ZO, 'concrete', 95.6, yT + 0.05, -4.5, 0.62, 0.2, 0.5, 0.03);
  A.rbox(ZO, 'furniture_metal', 95.6, yT + 0.68, -4.5, 0.42, 1.1, 0.36, 0.03, 0x37474f, { n: 2 });
  A.rbox(ZO, 'furniture_metal', 95.6, yT + 1.25, -4.52, 0.48, 0.06, 0.46, 0.02, 0x263238, { rx: -0.15 });
  SIGN_Q.push({ zone: ZO, x: 95.6, y: yT + 0.9, z: -4.685, nx: 0, nz: -1, w: 0.36, h: 0.36, key: 'ticket' });
  world.physics.add(new Box(94.25, yT - 0.4, -4.75, 94.75, yT + 1.05, -4.25, LAYER.FURN));
  A.rbox(ZO, 'furniture_metal', 94.5, yT + 0.5, -4.5, 0.36, 1.0, 0.32, 0.02, 0xe0b000, { n: 2 });
  A.lathe(ZO, 'furniture_metal', [[0, 0], [0.08, 0], [0.08, 0.14], [0, 0.14]], 12, 94.5, yT + 0.95, -4.66, 0x3a3a3a, { rx: Math.PI / 2 });
  { const p0 = V3(94.5, yT + 0.95, -4.62), d = V3(0.08, 0.97, -0.22).normalize(); for (let k = 0; k < 9; k++) A.beam(ZO, 'furniture', p0.clone().addScaledVector(d, k * 0.4), p0.clone().addScaledVector(d, (k + 1) * 0.4), 0.06, 0.1, k % 2 ? 0xf2f2f2 : 0xd32f2f); }
}

// ───────────────────────── façade est ─────────────────────────
// Habillage (cassettes métalliques à joints creux, bandeau d'acrotère), marquise d'entrée (poutres cintrées sur tirants,
// vitrage, chéneau), enseigne extérieure (même texture que le logo du hall, pilotée par l'éclairage du hall).
function buildEastFacade(A, world) {
  const F = (x0, y0, z0, x1, y1, z1, c, metal = true) => A.furn(ZO, x0, y0, z0, x1, y1, z1, c, { metal, collide: false }), o = { collide: false };
  for (const s of [-1, 1]) {
    const za = s * 8.3, zb = s * 25.45, lo = Math.min(za, zb), hi = Math.max(za, zb);
    F(XF, 0.45, lo, XF + 0.05, 10.0, hi, 0x8b9095);
    for (let y = 1.25; y < 10; y += 1.25) F(XF + 0.05, y - 0.008, lo, XF + 0.055, y + 0.008, hi, 0x2a2d30);
    for (let z = 10.8; z < 25.4; z += 2.5) F(XF + 0.05, 0.45, s * z - 0.008, XF + 0.055, 10.0, s * z + 0.008, 0x2a2d30);
    F(XF, 0, lo, XF + 0.1, 0.45, hi, 0x2b2b2b, false); // soubassement
  }
  F(80.65, 10.0, -25.5, 80.7, 11.62, 25.5, 0x8b9095); F(80.62, 11.62, -25.55, 80.74, 11.67, 25.55, 0xb8bdc2); // bandeau, couvertine
  const y0 = 4.3, ext = 3.2, cy = (t) => y0 + Math.sin(t * Math.PI * 0.5) * 0.25 - t * 0.1;
  for (const z of [-4.8, -1.6, 1.6, 4.8]) {
    const P = []; for (let k = 0; k <= 8; k++) { const t = k / 8; P.push(V3(80.42 + t * ext, cy(t), z)); }
    A.sweep(ZO, 'steel_dark', P, rectShape(0.08, 0.22, 0.01, 1), 0xffffff, { caps: true });
    A.tube(ZO, 'steel', V3(80.36, 5.45, z), V3(80.42 + ext - 0.15, cy(0.95) + 0.08, z), 0.016, 0xffffff, { segs: 8 });
    A.lathe(ZO, 'steel', [[0, 0], [0.055, 0], [0.055, 0.025], [0, 0.025]], 10, 80.35, 5.45, z, 0xffffff, { rz: -Math.PI / 2 });
    A.box(ZO, 'steel_dark', 80.35, y0 - 0.16, z - 0.12, 80.42, y0 + 0.32, z + 0.12, o);
  }
  for (let k = 1; k <= 3; k++) { const t = k / 4, xx = 80.42 + t * ext, yy = cy(t) + 0.13; A.box(ZO, 'steel_dark', xx - 0.04, yy - 0.04, -5.0, xx + 0.04, yy + 0.04, 5.0, o); }
  const gl = []; for (let k = 0; k <= 8; k++) { const t = k / 8; gl.push([80.42 + t * ext, cy(t) + 0.18]); }
  A.plate(ZO, 'glass', gl.concat(gl.slice().reverse().map(([x, y]) => [x, y + 0.02])), -5.05, 5.05);
  A.box(ZO, 'steel_dark', 80.42 + ext - 0.05, cy(1) + 0.02, -5.1, 80.42 + ext + 0.12, cy(1) + 0.28, 5.1, o);
  const sm = new THREE.MeshBasicMaterial({ map: signTexture('CENTRE COMMERCIAL HÉLIOS', 0xffb300, { fontSize: 80 }) });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 1.4), sm); sign.position.set(80.706, 10.8, 0); sign.rotation.y = Math.PI / 2;
  world.zone('entrance').group.add(sign); world.zone('entrance').signMats.push(sm);
}

// ───────────────────────── lampadaires ─────────────────────────
// Familles : 'lot' (mât de 8 m, crosse simple ou double, tête LED plate), 'parvis' (4,5 m, tête cylindrique), 'avenue'
// (10 m, crosse cintrée, tête « cobra »), 'wall' (applique), 'bollard' (borne lumineuse), 'canopy' (spot sous la
// marquise). Lampe : { kind, x, z, y0 (pied), arms: [angles], zone, circuit ('garage' parking, 'gallery' parvis,
// null : éclairage public), state: 'on' | 'off' | 'flicker' }. Les mâts vont dans les lots d'Arch ; les optiques dans
// un lot émissif par groupe (zone, circuit, état), avec un halo (points additifs), une flaque lointaine (disques
// additifs estompés près de la caméra, où la vraie lumière prend le relais) et, pour chaque lampe allumée, une source du
// pool de lumières (lighting.addSource) bornée à sa boîte (elle ne traverse pas la façade).
const LAMP_C = [1, 0.6, 0.27];                       // sodium haute pression
const LAMP_K = { lot: [7, 20, 7.6], parvis: [3.2, 12, 4.1], avenue: [8.5, 24, 9.5], wall: [1.6, 7, null], bollard: [0, 0, 0.8], canopy: [2.6, 10, 4.2], beacon: [0.7, 6, null] }; // intensité, portée, flaque (hauteur)
const LAMP_COLS = { sodium: LAMP_C, white: [1, 0.86, 0.66], amber: [1, 0.5, 0.08] };
const lampCol = (l) => l.kind === 'beacon' ? 'amber' : l.kind === 'canopy' || l.kind === 'parvis' || l.kind === 'bollard' ? 'white' : 'sodium';
const POLE_LOT = [[0, 0], [0.15, 0], [0.15, 0.03], [0.1, 0.08], [0.095, 0.5], [0.08, 0.53], [0.062, 7.5], [0.05, 7.66], [0, 7.68]];
const POLE_PARVIS = [[0, 0], [0.11, 0], [0.11, 0.03], [0.07, 0.07], [0.055, 0.12], [0.05, 4.18], [0, 4.18]];
const POLE_AVE = [[0, 0], [0.2, 0], [0.2, 0.04], [0.13, 0.1], [0.12, 0.7], [0.1, 0.73], [0.075, 9.3], [0.06, 9.45], [0, 9.47]];
class LampGroup {
  constructor(key, zone, circuit, flicker) { this.key = key; this.zone = zone; this.circuit = circuit; this.flicker = flicker; this.lens = new Batch(); this.glow = []; this.pool = new Batch(); this.k = 0; this.seed = key.length * 7.3 + key.charCodeAt(key.length - 1); }
}
function lensDown(B, cx, cy, cz, ux, uz, w, h) { // optique plate tournée vers le bas
  const rx = -uz * h / 2, rz = ux * h / 2, hx = ux * w / 2, hz = uz * w / 2;
  B.quad([cx - hx + rx, cy, cz - hz + rz], [cx - hx - rx, cy, cz - hz - rz], [cx + hx - rx, cy, cz + hz - rz], [cx + hx + rx, cy, cz + hz + rz], [0, -1, 0]);
}
function buildLamps(A, world, lamps) {
  const g = world.game, groups = new Map(), darks = [];
  const grp = (l) => { const cc = lampCol(l), k = l.zone + '|' + (l.circuit || 'ville') + '|' + (l.state === 'flicker' ? 'f' + l.x.toFixed(0) : l.state) + '|' + cc; let G = groups.get(k); if (!G) { groups.set(k, G = new LampGroup(k, l.zone, l.circuit, l.state === 'flicker')); G.blink = l.state === 'blink'; G.col = LAMP_COLS[cc]; } return G; };
  const DISC = new THREE.CircleGeometry(1, 20);
  for (const l of lamps) {
    if (l.circuit === undefined) l.circuit = 'garage'; if (!l.state) l.state = 'on';
    const zn = l.zone, y0 = l.y0 ?? YP, G = l.state === 'off' ? null : grp(l), dark = new Batch(), heads = [];
    const L = G ? G.lens : dark;
    if (l.kind === 'lot') {
      A.lathe(zn, 'furniture_metal', POLE_LOT, 10, l.x, y0, l.z, 0x4a5157);
      A.furn(zn, l.x - 0.04, y0 + 0.55, l.z - 0.105, l.x + 0.04, y0 + 0.85, l.z - 0.098, 0x3a4045, { metal: true, collide: false }); // trappe de visite
      for (const a of l.arms) {
        const ux = Math.cos(a), uz = Math.sin(a), hx = l.x + ux * 1.05, hz = l.z + uz * 1.05, hy = y0 + 7.62;
        A.beam(zn, 'furniture_metal', V3(l.x, y0 + 7.48, l.z), V3(hx - ux * 0.3, hy, hz - uz * 0.3), 0.06, 0.06, 0x4a5157);
        A.rbox(zn, 'furniture_metal', hx, hy, hz, 0.72, 0.09, 0.3, 0.03, 0x3a3f44, { ry: -a });
        lensDown(L, hx, hy - 0.047, hz, ux, uz, 0.56, 0.22); heads.push([hx, hy, hz]);
      }
      if (l.row) SIGN_Q.push(...[0, Math.PI].map((r) => ({ zone: zn, x: l.x + Math.cos(r) * 0.072, y: y0 + 3.2, z: l.z, nx: Math.cos(r), nz: 0, w: 0.3, h: 0.3, key: 'row' + l.row })));
      if (l.row) A.furn(zn, l.x - 0.07, y0 + 3.04, l.z - 0.16, l.x + 0.07, y0 + 3.36, l.z + 0.16, 0x2a2a2a, { metal: true, collide: false });
      world.physics.add(new Box(l.x - 0.13, y0, l.z - 0.13, l.x + 0.13, y0 + 7.6, l.z + 0.13, LAYER.FURN));
    } else if (l.kind === 'parvis') {
      A.lathe(zn, 'furniture_metal', POLE_PARVIS, 10, l.x, y0, l.z, 0x2e3236);
      A.lathe(zn, 'furniture_metal', [[0.06, 4.16], [0.19, 4.2], [0.2, 4.24], [0.2, 4.27]], 14, l.x, y0, l.z, 0x2e3236);
      A.lathe(zn, 'furniture_metal', [[0.2, 4.42], [0.2, 4.45], [0.15, 4.52], [0, 4.54]], 14, l.x, y0, l.z, 0x2e3236);
      L.add(latheGeo([[0.19, 4.27], [0.19, 4.42]], 14), new THREE.Matrix4().makeTranslation(l.x, y0, l.z)); heads.push([l.x, y0 + 4.34, l.z]);
      world.physics.add(new Box(l.x - 0.1, y0, l.z - 0.1, l.x + 0.1, y0 + 4.5, l.z + 0.1, LAYER.FURN));
    } else if (l.kind === 'avenue') {
      A.lathe(zn, 'furniture_metal', POLE_AVE, 10, l.x, y0, l.z, 0x6b7177);
      const a = l.arms[0], ux = Math.cos(a), uz = Math.sin(a), P = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; P.push(V3(l.x + ux * Math.sin(t * Math.PI / 2) * 2.0, y0 + 9.2 + (1 - Math.cos(t * Math.PI / 2)) * 0.2 + t * 0.55, l.z + uz * Math.sin(t * Math.PI / 2) * 2.0)); }
      A.sweep(zn, 'furniture_metal', P, circleShape(0.045, 6), 0x6b7177);
      const hx = l.x + ux * 2.25, hz = l.z + uz * 2.25, hy = y0 + 9.92;
      A.rbox(zn, 'furniture_metal', hx, hy, hz, 0.8, 0.16, 0.34, 0.06, 0x8a9096, { ry: -a, n: 2 });
      lensDown(L, hx + ux * 0.05, hy - 0.083, hz + uz * 0.05, ux, uz, 0.6, 0.26); heads.push([hx, hy, hz]);
      if (Math.abs(l.z) < 76) world.physics.add(new Box(l.x - 0.15, y0, l.z - 0.15, l.x + 0.15, y0 + 9.3, l.z + 0.15, LAYER.FURN));
    } else if (l.kind === 'wall') {
      lensDown(L, l.x, l.y - 0.002, l.z, 1, 0, 0.26, 0.1); heads.push([l.x, l.y, l.z]);
    } else if (l.kind === 'bollard') {
      A.lathe(zn, 'furniture_metal', [[0, 0], [0.1, 0], [0.1, 0.62], [0.1, 0.64]], 12, l.x, y0, l.z, 0x2e3236);
      A.lathe(zn, 'furniture_metal', [[0.1, 0.84], [0.1, 0.86], [0.06, 0.9], [0, 0.91]], 12, l.x, y0, l.z, 0x2e3236);
      L.add(latheGeo([[0.095, 0.64], [0.095, 0.84]], 12), new THREE.Matrix4().makeTranslation(l.x, y0, l.z)); heads.push([l.x, y0 + 0.74, l.z]);
      world.physics.add(new Box(l.x - 0.1, y0, l.z - 0.1, l.x + 0.1, y0 + 0.9, l.z + 0.1, LAYER.FURN));
    } else if (l.kind === 'beacon') { // feu clignotant de chantier sur une balise
      L.add(latheGeo([[0.07, 0], [0.07, 0.06], [0.04, 0.1], [0, 0.11]], 10), new THREE.Matrix4().makeTranslation(l.x, l.y, l.z)); heads.push([l.x, l.y + 0.06, l.z]);
      A.lathe(zn, 'furniture', [[0.075, -0.05], [0.075, 0]], 10, l.x, l.y, l.z, 0x222222);
    } else if (l.kind === 'canopy') {
      L.add(latheGeo([[0, 0.0001], [0.09, 0]], 14), new THREE.Matrix4().makeTranslation(l.x, l.y, l.z)); heads.push([l.x, l.y, l.z]);
      A.lathe(zn, 'furniture_metal', [[0.11, 0], [0.11, 0.06], [0, 0.07]], 14, l.x, l.y, l.z, 0x2a2c2e);
    }
    if (!G) { if (dark.count) { dark.c.fill(0.05); darks.push([zn, dark]); } continue; }
    const K = LAMP_K[l.kind];
    for (const [hx, hy, hz] of heads) {
      G.glow.push(hx, hy - (l.kind === 'lot' || l.kind === 'avenue' ? 0.12 : 0), hz);
      if (K[2]) { const r = l.kind === 'avenue' ? 9 : l.kind === 'lot' ? 7.5 : 4.5; G.pool.add(DISC, new THREE.Matrix4().makeRotationX(-Math.PI / 2).scale(V3(r, r, 1)).setPosition(hx, (l.kind === 'canopy' || l.kind === 'parvis' || l.kind === 'bollard' ? YP : y0) + 0.025, hz)); }
      if (!K[0]) continue;
      const side = hx > XF ? { x0: XF + 0.1 } : {}, R = K[1];
      const box = l.kind === 'wall' && hx > XF && hz < 0 && hz > -8 ? { min: [80.3, -3.3, -7.05], max: [98.5, 1.6, -1.95] } : { min: [Math.max(side.x0 ?? -1e4, hx - R), -3.3, hz - R], max: [hx + R, hy + 2, hz + R] };
      if (hx < XF && Math.abs(hz) > 25.6) { if (hz > 0) box.min[2] = Math.max(box.min[2], 25.75); else box.max[2] = Math.min(box.max[2], -25.75); }
      const src = { pos: V3(hx, hy - (l.kind === 'beacon' ? -0.1 : 0.4), hz), color: G.col, intensity: 0, distance: R, priority: 1.25, zone: box };
      g.lighting.addSource({ getLight: () => (G.k > 0.03 ? (src.intensity = K[0] * G.k, src) : null) });
    }
  }
  DISC.dispose();
  return { groups: [...groups.values()], darks };
}
// halos et flaques : textures et matériaux (additifs, sans écrire l'alpha : le masque de SSAO reste intact)
let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = canvas(64), ctx = c.getContext('2d'), gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,230,190,1)'); gr.addColorStop(0.18, 'rgba(255,190,120,0.55)'); gr.addColorStop(0.5, 'rgba(255,160,80,0.12)'); gr.addColorStop(1, 'rgba(255,150,70,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64); GLOW_TEX = new THREE.CanvasTexture(c); GLOW_TEX.colorSpace = THREE.SRGBColorSpace; return GLOW_TEX;
}
const addBlend = (m) => { m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; m.transparent = true; m.depthWrite = false; return m; };
const POOL_VS = 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const POOL_FS = 'uniform vec3 color; uniform float k; varying vec2 vUv; varying vec3 vW; void main(){ float r = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - r), 2.0) * smoothstep(16.0, 34.0, distance(cameraPosition.xz, vW.xz)); gl_FragColor = vec4(color * k, a); }';
function lampMeshes(world, { groups, darks }) {
  for (const G of groups) {
    const z = world.zone(G.zone).group;
    const lm = new THREE.MeshBasicMaterial({ color: 0x050505 }); lm.toneMapped = false; G.lensMat = lm;
    z.add(G.lens.mesh(lm, { name: 'optiques' }));
    if (G.glow.length) {
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(G.glow, 3));
      G.glowMat = addBlend(new THREE.PointsMaterial({ map: glowTex(), size: 2.6, sizeAttenuation: true, color: 0xffffff, opacity: 0, fog: true }));
      G.points = new THREE.Points(gg, G.glowMat); G.points.frustumCulled = false; z.add(G.points);
    }
    if (G.pool.count) {
      G.poolMat = addBlend(new THREE.ShaderMaterial({ vertexShader: POOL_VS, fragmentShader: POOL_FS, uniforms: { color: { value: new THREE.Color(G.col[0] * 0.55, G.col[1] * 0.55, G.col[2] * 0.55) }, k: { value: 0 } } }));
      G.poolMesh = G.pool.mesh(G.poolMat, { name: 'flaques' }); G.poolMesh.renderOrder = 2; z.add(G.poolMesh);
    }
  }
  for (const [zn, B] of darks) world.zone(zn).group.add(B.mesh(world.game.mats.get('furniture', zn), { name: 'optiques_eteintes' }));
}

// ───────────────────────── végétation ─────────────────────────
let ICO = null;
function ico() { // icosphère de rang 1 (42 sommets) : sommets unitaires et faces (sens direct vu de l'extérieur)
  if (ICO) return ICO;
  const t = (1 + Math.sqrt(5)) / 2;
  const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => { const l = Math.hypot(...v); return v.map((c) => c / l); });
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const mid = new Map(), m = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (mid.has(k)) return mid.get(k); const p = V[a].map((c, i) => (c + V[b][i]) / 2), l = Math.hypot(...p); V.push(p.map((c) => c / l)); mid.set(k, V.length - 1); return V.length - 1; };
  const NF = []; for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); NF.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); } F = NF;
  ICO = { V, F: F.flat() }; return ICO;
}
// boule bosselée (houppier, arbuste) : centre, rayons, couleur de base ; ombrée vers le bas, éclaircie au sommet
function blob(B, rng, cx, cy, cz, rx, ry, rz, base, bump = 0.16) {
  const { V, F } = ico(), b0 = B.count, c = new THREE.Color();
  for (const v of V) {
    const k = 1 + rng.range(-bump, bump), x = v[0] * rx * k, y = v[1] * ry * k, z = v[2] * rz * k;
    const n = V3(v[0] / rx, v[1] / ry, v[2] / rz).normalize();
    c.copy(base).multiplyScalar((0.62 + 0.38 * (v[1] * 0.5 + 0.5)) * rng.range(0.9, 1.08));
    B.v(cx + x, cy + y, cz + z, n.x, n.y, n.z, 0, 0, [c.r, c.g, c.b]);
  }
  for (const i of F) B.i.push(b0 + i);
}
const LEAF = [0x4a6b2a, 0x3d5f2b, 0x57762f, 0x30522a, 0x47652c], AUTUMN = [0xb8922a, 0xbf6a28, 0x8e4a24, 0xa8a033];
// feuillu d'alignement (érable, tilleul…) : tronc conique, trois charpentières, houppier de 4 à 6 boules
function tree(B, rng, x, y0, z, o = {}) {
  const H = o.h ?? rng.range(5.6, 7.4), cr = o.r ?? rng.range(2.1, 2.8), fork = H * 0.42, bark = new THREE.Color(0x5a4f45).multiplyScalar(rng.range(0.85, 1.1));
  const base = new THREE.Color(rng.next() < (o.autumn ?? 0.22) ? AUTUMN[rng.int(0, AUTUMN.length - 1)] : LEAF[rng.int(0, LEAF.length - 1)]);
  B.add(cylGeo(0.15, fork + 0.2, 7, { open: true, r1: 0.11 }), new THREE.Matrix4().makeTranslation(x, y0 + (fork + 0.2) / 2 - 0.05, z), [bark.r, bark.g, bark.b]);
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + rng.range(-0.4, 0.4), p0 = V3(x, y0 + fork, z), p1 = V3(x + Math.cos(a) * cr * 0.45, y0 + fork + H * 0.28, z + Math.sin(a) * cr * 0.45);
    const L = p0.distanceTo(p1), q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), p1.clone().sub(p0).normalize());
    B.add(cylGeo(0.075, L, 5, { open: true, r1: 0.045 }), new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), q, V3(1, 1, 1)), [bark.r, bark.g, bark.b]);
  }
  const yc = y0 + fork + (H - fork) * 0.5, n = rng.int(4, 6);
  for (let k = 0; k < n; k++) { const a = k / n * 6.28 + rng.range(-0.3, 0.3), d = cr * rng.range(0.3, 0.5), r = cr * rng.range(0.5, 0.68); blob(B, rng, x + Math.cos(a) * d, yc + rng.range(-0.3, 0.5), z + Math.sin(a) * d, r, r * rng.range(0.75, 0.9), r, base.clone().multiplyScalar(rng.range(0.9, 1.1))); }
  blob(B, rng, x, yc + cr * 0.45, z, cr * 0.62, cr * 0.5, cr * 0.62, base.clone().multiplyScalar(1.08));
}
// peuplier d'Italie (rideaux lointains) : très peu de sommets
function poplar(B, rng, x, y0, z) {
  const H = rng.range(13, 18), base = new THREE.Color(rng.next() < 0.3 ? 0x9a8a30 : 0x3f5a2a).multiplyScalar(rng.range(0.85, 1.05));
  B.add(cylGeo(0.2, 3, 5, { open: true, r1: 0.14 }), new THREE.Matrix4().makeTranslation(x, y0 + 1.4, z), lin(0x4d463e));
  blob(B, rng, x, y0 + H * 0.55, z, 1.7, H * 0.45, 1.7, base, 0.1);
}
function shrub(B, rng, x, y0, z, r = 0.6) { blob(B, rng, x, y0 + r * 0.55, z, r, r * 0.7, r, new THREE.Color(LEAF[rng.int(0, LEAF.length - 1)]).multiplyScalar(0.85), 0.2); }
// haie taillée (boîte arrondie texturée) et sa collision
function hedge(A, zn, x0, z0, x1, z1, h = 1.6, y0 = YP) {
  A.rbox(zn, 'hedge', (x0 + x1) / 2, y0 + h / 2 - 0.05, (z0 + z1) / 2, x1 - x0, h + 0.1, z1 - z0, Math.min(0.3, (z1 - z0) / 2.5, (x1 - x0) / 2.5), 0xffffff, { n: 2 });
  A.world.physics.add(new Box(x0, y0, z0, x1, y0 + h, z1, LAYER.FURN));
}

// ───────────────────────── clôtures, portails ─────────────────────────
// Clôture de site : muret de béton (0,5 m) surmonté de panneaux rigides en treillis soudé vert (1,53 m) entre poteaux
// tous les 2,5 m ; W : lot du matériau grillagé (texture de fils à alpha découpé, teinte par sommet).
const GREEN = 0x23402e;
function fence(A, W, zn, x0, z0, x1, z1, o = {}) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1), c = alongX ? z0 : x0;
  const y0 = o.y0 ?? YP, hm = o.muret ?? 0.5, hp = o.h ?? 1.53, t = 0.1, col = lin(o.color ?? GREEN), P = (a, b, y) => alongX ? [a, y, c + b] : [c + b, y, a];
  const B = (a, b, ya, yb, bb, color, mat) => { const [p, q] = [P(a, -bb, ya), P(b, bb, yb)]; if (mat) A.box(zn, mat, Math.min(p[0], q[0]), ya, Math.min(p[2], q[2]), Math.max(p[0], q[0]), yb, Math.max(p[2], q[2]), { collide: false }); else A.furn(zn, Math.min(p[0], q[0]), ya, Math.min(p[2], q[2]), Math.max(p[0], q[0]), yb, Math.max(p[2], q[2]), color, { metal: true, collide: false }); };
  if (hm > 0) { B(a0, a1, YR - 0.05, y0 + hm, t, 0, 'concrete'); B(a0 - 0.01, a1 + 0.01, y0 + hm, y0 + hm + 0.03, t + 0.015, 0, 'concrete'); }
  const n = Math.max(1, Math.round((a1 - a0) / 2.5)), st = (a1 - a0) / n, top = y0 + hm + hp;
  for (let k = 0; k <= n; k++) { const a = a0 + k * st; B(a - 0.03, a + 0.03, y0 + hm, top + 0.04, 0.03, o.color ?? GREEN); }
  for (let k = 0; k < n; k++) {
    const a = a0 + k * st + 0.04, b = a0 + (k + 1) * st - 0.04, L = b - a;
    W.quad(P(a, 0, y0 + hm + 0.05), P(b, 0, y0 + hm + 0.05), P(b, 0, top), P(a, 0, top), alongX ? [0, 0, 1] : [1, 0, 0], [0, 0, L / 0.2, (hp - 0.05) / 0.2], col);
    for (const yy of [0.35, 0.95]) B(a, b, y0 + hm + yy, y0 + hm + yy + 0.035, 0.012, o.color ?? GREEN); // plis en V des panneaux
  }
  const p = P(a0, -0.14, YR - 0.1), q = P(a1, 0.14, top + 0.05);
  A.world.physics.add(new Box(Math.min(p[0], q[0]), YR - 0.1, Math.min(p[2], q[2]), Math.max(p[0], q[0]), top + 0.05, Math.max(p[2], q[2]), LAYER.FURN));
}
// portail coulissant fermé (barreaudage dans le treillis, cadre, roulettes, poteau de guidage)
function gate(A, W, zn, x0, z0, x1, z1, h = 1.9, y0 = YR) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1), c = alongX ? z0 : x0, P = (a, y) => alongX ? [a, y, c] : [c, y, a];
  const F = (a, b, ya, yb) => { const p = P(a, ya), q = P(b, yb); A.furn(zn, Math.min(p[0], q[0]) - (alongX ? 0 : 0.03), ya, Math.min(p[2], q[2]) - (alongX ? 0.03 : 0), Math.max(p[0], q[0]) + (alongX ? 0 : 0.03), yb, Math.max(p[2], q[2]) + (alongX ? 0.03 : 0), 0x2b3a33, { metal: true, collide: false }); };
  F(a0, a1, y0 + 0.08, y0 + 0.16); F(a0, a1, y0 + h - 0.08, y0 + h); F(a0, a0 + 0.08, y0 + 0.08, y0 + h); F(a1 - 0.08, a1, y0 + 0.08, y0 + h);
  for (let a = a0 + 0.6; a < a1 - 0.3; a += 1.2) F(a, a + 0.05, y0 + 0.16, y0 + h - 0.08);
  W.quad(P(a0 + 0.08, y0 + 0.16), P(a1 - 0.08, y0 + 0.16), P(a1 - 0.08, y0 + h - 0.08), P(a0 + 0.08, y0 + h - 0.08), alongX ? [0, 0, 1] : [1, 0, 0], [0, 0, (a1 - a0) / 0.2, (h - 0.24) / 0.2], lin(0x2b3a33));
  const p = P(a0, y0), q = P(a1, y0 + h); A.world.physics.add(new Box(Math.min(p[0], q[0]) - 0.08, y0, Math.min(p[2], q[2]) - 0.08, Math.max(p[0], q[0]) + 0.08, y0 + h, Math.max(p[2], q[2]) + 0.08, LAYER.FURN));
}

// ───────────────────────── panneaux sur poteau, totem ─────────────────────────
const ROUND = new Set(['v30', 'noentry']), TRI = { yield: true, giratoire: false };
// poteau galvanisé et panneaux : face tournée vers `a` (angle de la normale dans le plan xz), panneaux [{ key, w, h, y }]
function signPost(A, zn, x, z, a, panels, o = {}) {
  const y0 = o.y0 ?? YP, nx = Math.cos(a), nz = Math.sin(a), top = Math.max(...panels.map((p) => p.y + p.h / 2)) + 0.05;
  A.tube(zn, 'steel', V3(x, y0, z), V3(x, y0 + top, z), 0.032, 0xffffff, { segs: 8 });
  A.lathe(zn, 'steel', [[0, 0], [0.034, 0], [0.034, 0.02], [0, 0.03]], 8, x, y0 + top, z);
  for (const p of panels) {
    const cx = x + nx * 0.05, cz = z + nz * 0.05, cy = y0 + p.y;
    if (ROUND.has(p.key)) A.lathe(zn, 'furniture_metal', [[0, -0.01], [p.w / 2, -0.01], [p.w / 2, 0.01], [0, 0.01]], 20, cx - nx * 0.012, cy, cz - nz * 0.012, 0x9aa0a6, { m: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2, 0, 0, 'YXZ').set(Math.PI / 2, -a + Math.PI / 2, 0, 'YXZ')).setPosition(cx - nx * 0.012, cy, cz - nz * 0.012) });
    else if (p.key in TRI) { const h = p.h, w = p.w, pts = TRI[p.key] ? [[-w / 2, h / 2 - 0.02], [w / 2, h / 2 - 0.02], [0, -h / 2 + 0.03]] : [[0, h / 2 - 0.03], [w / 2, -h / 2 + 0.03], [-w / 2, -h / 2 + 0.03]]; A.plate(zn, 'furniture_metal', pts, -0.012, 0.012, 0x9aa0a6, { m: new THREE.Matrix4().makeRotationY(-a + Math.PI / 2).setPosition(cx - nx * 0.014, cy, cz - nz * 0.014) }); }
    else A.rbox(zn, 'furniture_metal', cx - nx * 0.014, cy, cz - nz * 0.014, Math.abs(nz) * p.w + Math.abs(nx) * 0.022 + 0.004, p.h + 0.02, Math.abs(nx) * p.w + Math.abs(nz) * 0.022 + 0.004, 0.006, 0x9aa0a6);
    SIGN_Q.push({ zone: zn, x: cx + nx * 0.001, y: cy, z: cz + nz * 0.001, nx, nz, w: p.w, h: p.h, key: p.key });
    if (o.both && !ROUND.has(p.key) && !(p.key in TRI)) SIGN_Q.push({ zone: zn, x: cx - nx * 0.03, y: cy, z: cz - nz * 0.03, nx: -nx, nz: -nz, w: p.w, h: p.h, key: p.key });
  }
  A.world.physics.add(new Box(x - 0.07, y0, z - 0.07, x + 0.07, y0 + top, z + 0.07, LAYER.FURN));
}
// totem « HÉLIOS » au bord de l'avenue : socle, fût d'acier, faces lumineuses (logo, enseignes) des deux côtés
function pylon(A, zn, x, z, lit) {
  A.box(zn, 'concrete', x - 0.75, YP - 0.1, z - 1.7, x + 0.75, YP + 0.45, z + 1.7, { collide: false });
  A.rbox(zn, 'furniture_metal', x, YP + 5.95, z, 0.7, 11, 2.7, 0.04, 0x262d36, { n: 2 });
  for (const sx of [-1, 1]) for (const [y, h] of [[YP + 9.45, 2.4], [YP + 6.15, 3.5]]) A.furn(zn, x + sx * 0.36 - 0.012, y - h / 2 - 0.06, z - 1.26, x + sx * 0.36 + 0.012, y + h / 2 + 0.06, z + 1.26, 0x8f969b, { metal: true, collide: false });
  for (const sx of [-1, 1]) { lit.wall(x + sx * 0.374, YP + 9.45, z, sx, 0, 2.4, 2.4, SIGNS.uv.pylonTop); lit.wall(x + sx * 0.374, YP + 6.15, z, sx, 0, 2.3, 3.45, SIGNS.uv.pylonBrands); }
  A.world.physics.add(new Box(x - 0.75, YP - 0.1, z - 1.7, x + 0.75, YP + 11.5, z + 1.7, LAYER.FURN));
}

// ───────────────────────── mobilier urbain ─────────────────────────
// banc : pieds de béton, assise et dossier à lattes de bois sur consoles d'acier (a : orientation de l'assise)
function bench(A, zn, x, z, a, o = {}) {
  const ux = Math.cos(a), uz = Math.sin(a), rx = -uz, rz = ux, y0 = o.y0 ?? YP; // u : vers l'avant (côté assis)
  const P = (s, f, y) => V3(x + rx * s + ux * f, y0 + y, z + rz * s + uz * f);
  for (const s of [-0.7, 0.7]) A.rbox(zn, 'concrete', x + rx * s, y0 + 0.2, z + rz * s, Math.abs(ux) * 0.5 + Math.abs(rx) * 0.12, 0.4, Math.abs(uz) * 0.5 + Math.abs(rz) * 0.12, 0.02);
  for (let k = 0; k < 4; k++) A.beam(zn, 'furniture', P(-0.9, 0.2 - k * 0.12, 0.43), P(0.9, 0.2 - k * 0.12, 0.43), 0.1, 0.035, 0x8a5a34);
  if (!o.noBack) { for (const s of [-0.7, 0.7]) A.beam(zn, 'furniture_metal', P(s, -0.24, 0.4), P(s, -0.3, 0.85), 0.03, 0.05, 0x2e3236); for (let k = 0; k < 3; k++) A.beam(zn, 'furniture', P(-0.9, -0.26 - k * 0.012, 0.52 + k * 0.12), P(0.9, -0.26 - k * 0.012, 0.52 + k * 0.12), 0.035, 0.09, 0x8a5a34, V3(-ux, 0.15, -uz).normalize()); }
  const b = [P(-0.95, 0.28, 0), P(0.95, -0.33, 0)];
  A.world.physics.add(new Box(Math.min(b[0].x, b[1].x), y0, Math.min(b[0].z, b[1].z), Math.max(b[0].x, b[1].x), y0 + (o.noBack ? 0.46 : 0.9), Math.max(b[0].z, b[1].z), LAYER.FURN));
  if (o.seat) A.world.add(new Seat(A.world, A.world.newId('out_seat'), { zone: ZO, x: x + ux * 0.02, y: y0, z: z + uz * 0.02, ry: Math.atan2(ux, uz) + Math.PI, name: 'Banc' }));
}
// corbeille de propreté (cylindre vert, couvercle, anneau à sac) ; potelet ; arceau à vélos
function bin(A, zn, x, z, y0 = YP) {
  A.lathe(zn, 'furniture_metal', [[0, 0.02], [0.23, 0.02], [0.25, 0.08], [0.25, 0.78], [0.23, 0.8], [0, 0.8]], 14, x, y0, z, 0x2f4a3a);
  A.lathe(zn, 'furniture_metal', [[0.27, 0.8], [0.27, 0.84], [0.12, 0.92], [0, 0.93]], 14, x, y0, z, 0x26392e);
  A.lathe(zn, 'furniture_metal', [[0.03, 0], [0.03, 0.02]], 8, x, y0, z, 0x26392e);
  A.world.physics.add(new Box(x - 0.27, y0, z - 0.27, x + 0.27, y0 + 0.93, z + 0.27, LAYER.FURN));
}
function bollard(A, zn, x, z, y0 = YP) {
  A.lathe(zn, 'furniture_metal', [[0, 0], [0.055, 0], [0.055, 0.86], [0.04, 0.9], [0, 0.91]], 10, x, y0, z, 0x34393e);
  A.lathe(zn, 'furniture', [[0.057, 0.72], [0.057, 0.78]], 10, x, y0, z, 0xe8e8e8);
  A.world.physics.add(new Box(x - 0.07, y0, z - 0.07, x + 0.07, y0 + 0.9, z + 0.07, LAYER.FURN));
}
function bikeHoop(A, zn, x, z, a, y0 = YP) {
  const ux = Math.cos(a), uz = Math.sin(a), P = [];
  for (let k = 0; k <= 10; k++) { const t = k / 10, ang = Math.PI * t; P.push(V3(x + ux * Math.cos(ang) * 0.35, y0 + (k === 0 || k === 10 ? 0 : 0.5 + Math.sin(ang) * 0.3), z + uz * Math.cos(ang) * 0.35)); }
  P[1].y = y0 + 0.45; P[9].y = y0 + 0.45;
  A.sweep(zn, 'steel', [V3(P[0].x, y0, P[0].z), V3(P[0].x, y0 + 0.5, P[0].z), ...P.slice(2, 9), V3(P[10].x, y0 + 0.5, P[10].z), V3(P[10].x, y0, P[10].z)], circleShape(0.026, 6));
  A.world.physics.add(new Box(x - Math.abs(ux) * 0.38 - 0.04, y0, z - Math.abs(uz) * 0.38 - 0.04, x + Math.abs(ux) * 0.38 + 0.04, y0 + 0.82, z + Math.abs(uz) * 0.38 + 0.04, LAYER.FURN));
}
// chariot de supermarché : panier grillagé évasé, châssis, poignée de couleur, roulettes ; a : direction de l'avant
function caddy(A, W, zn, x, z, a, y0 = YR, handle = 0xc62828) {
  const ux = Math.cos(a), uz = Math.sin(a), rx = -uz, rz = ux, P = (f, s, y) => [x + ux * f + rx * s, y0 + y, z + uz * f + rz * s], Vp = (f, s, y) => V3(...P(f, s, y));
  const fr = 0.42, bk = -0.5, wf = 0.24, wb = 0.3, yb0 = 0.42, yf = 0.88, yk = 0.95, grey = lin(0x9ea4a8);
  const c = [P(fr, -wf, yb0), P(fr, wf, yb0), P(bk, wb, yb0 + 0.04), P(bk, -wb, yb0 + 0.04), P(fr, -wf - 0.03, yf), P(fr, wf + 0.03, yf), P(bk, wb + 0.03, yk), P(bk, -wb - 0.03, yk)];
  const q = (i, j, k, l, L, H) => W.quad(c[i], c[j], c[k], c[l], [0, 1, 0], [0, 0, L / 0.2, H / 0.2], grey);
  q(0, 1, 2, 3, 0.55, 0.92); q(1, 0, 4, 5, 0.5, 0.46); q(0, 3, 7, 4, 0.92, 0.5); q(2, 1, 5, 6, 0.92, 0.5); q(3, 2, 6, 7, 0.6, 0.52);
  for (const [i, j] of [[4, 5], [5, 6], [6, 7], [7, 4], [0, 1], [2, 3], [0, 3], [1, 2]]) A.tube(zn, 'furniture_metal', V3(...c[i]), V3(...c[j]), 0.011, 0xb8bec2, { segs: 4 });
  for (const s of [-1, 1]) { A.tube(zn, 'furniture_metal', Vp(fr - 0.02, s * 0.2, 0.12), Vp(bk, s * 0.26, 0.12), 0.013, 0xb8bec2, { segs: 4 }); A.tube(zn, 'furniture_metal', Vp(bk, s * 0.26, 0.12), Vp(bk - 0.05, s * 0.28, 1.0), 0.013, 0xb8bec2, { segs: 4 }); }
  A.tube(zn, 'furniture', Vp(bk - 0.06, -0.27, 1.02), Vp(bk - 0.06, 0.27, 1.02), 0.02, handle, { segs: 6 });
  for (const f of [fr - 0.04, bk + 0.04]) for (const s of [-0.19, 0.19]) A.tube(zn, 'furniture', Vp(f, s - 0.015, 0.05), Vp(f, s + 0.015, 0.05), 0.05, 0x1c1c1c, { segs: 8 });
}
// abri à chariots : quatre poteaux, toiture cintrée, bardage grillagé sur trois côtés, enseigne ; caddies emboîtés
function trolleyShelter(A, W, zn, x0, z0, x1, z1, open, n = 2, y0 = YR) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), h = 2.25, col = 0x2e7d32;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1]]) { A.furn(zn, x - 0.04, y0, z - 0.04, x + 0.04, y0 + h, z + 0.04, col, { metal: true, collide: false }); A.world.physics.add(new Box(x - 0.06, y0, z - 0.06, x + 0.06, y0 + h, z + 0.06, LAYER.FURN)); }
  const span = alongX ? z1 - z0 : x1 - x0, P = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8 - 0.5; P.push([t * (span + 0.3), h + 0.1 + Math.cos(t * Math.PI) * 0.22]); }
  A.plate(zn, 'furniture_metal', P.concat(P.slice().reverse().map(([a, b]) => [a, b + 0.03])), alongX ? x0 - 0.15 : z0 - 0.15, alongX ? x1 + 0.15 : z1 + 0.15, 0xd6dadc, { m: alongX ? new THREE.Matrix4().makeBasis(V3(0, 0, -1), V3(0, 1, 0), V3(1, 0, 0)).setPosition(0, y0, (z0 + z1) / 2) : new THREE.Matrix4().makeTranslation((x0 + x1) / 2, y0, 0) });
  // grillage : fond et côtés (le côté `open` reste ouvert)
  const side = (a, b, c, d) => { W.quad([a[0], y0 + 0.1, a[1]], [b[0], y0 + 0.1, b[1]], [b[0], y0 + 1.4, b[1]], [a[0], y0 + 1.4, a[1]], [0, 0, 1], [0, 0, Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2, 6.5], lin(col)); };
  const E = { x: [[x0, z0], [x0, z1]], X: [[x1, z0], [x1, z1]], z: [[x0, z0], [x1, z0]], Z: [[x0, z1], [x1, z1]] };
  for (const e of 'xXzZ') if (e !== open && e !== (open === 'x' ? 'X' : open === 'X' ? 'x' : open === 'z' ? 'Z' : 'z')) side(...E[e]);
  { const [a, b] = E[open === 'x' ? 'X' : open === 'X' ? 'x' : open === 'z' ? 'Z' : 'z']; side(a, b); }
  for (const e of 'xXzZ') if (e !== open) { const [a, b] = E[e]; const minx = Math.min(a[0], b[0]) - 0.05, maxx = Math.max(a[0], b[0]) + 0.05, minz = Math.min(a[1], b[1]) - 0.05, maxz = Math.max(a[1], b[1]) + 0.05; A.world.physics.add(new Box(minx, y0, minz, maxx, y0 + 1.45, maxz, LAYER.FURN)); }
  const sx = open === 'X' ? x1 + 0.05 : open === 'x' ? x0 - 0.05 : (x0 + x1) / 2, sz = open === 'Z' ? z1 + 0.05 : open === 'z' ? z0 - 0.05 : (z0 + z1) / 2, nx = open === 'X' ? 1 : open === 'x' ? -1 : 0, nz = open === 'Z' ? 1 : open === 'z' ? -1 : 0;
  SIGN_Q.push({ zone: zn, x: sx, y: y0 + h - 0.2, z: sz, nx, nz, w: 1.2, h: 0.3, key: 'chariots' });
  // caddies emboîtés en n rangées, tournés vers le fond
  const len = alongX ? x1 - x0 : z1 - z0, dep = alongX ? z1 - z0 : x1 - x0;
  for (let r = 0; r < n; r++) {
    const off = (r + 0.5) / n * dep, cnt = Math.floor((len - 1.2) / 0.3);
    for (let k = 0; k < cnt; k++) {
      const t = 0.6 + k * 0.3;
      if (alongX) caddy(A, W, zn, x0 + t, z0 + off, open === 'x' ? 0 : Math.PI, y0, r ? 0x1565c0 : 0xc62828);
      else caddy(A, W, zn, x0 + off, z0 + t, open === 'z' ? Math.PI / 2 : -Math.PI / 2, y0, r ? 0x1565c0 : 0xc62828);
    }
  }
}

// ───────────────────────── voitures garées ─────────────────────────
// Modèles stylisés (≈ 550 sommets) : caisse lissée par sections (bas de caisse, flancs, vitrages, pavillon), faces avant
// et arrière avec optiques, calandre et plaques, rétroviseurs, roues (bande de roulement, flanc, jante) devant un passage
// de roue sombre. Repère : avant vers +z, largeur selon x, sol à y = 0. Sections : [z, hauteur du dessus, largeur
// relative du dessus, zone jusqu'à la section suivante] ; zones : 'cab' (vitres latérales), 'pil' (montant), 'ws'
// (pare-brise), 'rw' (lunette), 'hood', 'trunk', 'tail', 'nose', 'van' (caisse aveugle).
const CARS = {
  citadine: { L: 4.05, W: 1.74, H: 1.47, wr: 0.31, axles: [1.28, -1.27], belt: 0.9, rock: 0.3, st: [[-2.025, 0.93, 0.88, 'tail'], [-1.96, 1.1, 0.82, 'rw'], [-1.63, 1.43, 0.74, 'cab'], [-0.1, 1.46, 0.74, 'pil'], [0.02, 1.46, 0.74, 'cab'], [0.58, 1.43, 0.75, 'ws'], [1.3, 0.99, 0.86, 'hood'], [1.95, 0.86, 0.8, 'nose'], [2.025, 0.72, 0.74, null]] },
  berline: { L: 4.6, W: 1.8, H: 1.46, wr: 0.32, axles: [1.42, -1.38], belt: 0.92, rock: 0.3, st: [[-2.3, 0.88, 0.86, 'tail'], [-2.22, 1.02, 0.84, 'trunk'], [-1.55, 1.05, 0.82, 'rw'], [-0.95, 1.42, 0.74, 'cab'], [-0.05, 1.45, 0.74, 'pil'], [0.07, 1.45, 0.74, 'cab'], [0.6, 1.42, 0.75, 'ws'], [1.4, 1.0, 0.86, 'hood'], [2.2, 0.86, 0.8, 'nose'], [2.3, 0.72, 0.74, null]] },
  break: { L: 4.65, W: 1.8, H: 1.49, wr: 0.32, axles: [1.42, -1.42], belt: 0.93, rock: 0.3, st: [[-2.325, 0.95, 0.88, 'tail'], [-2.26, 1.1, 0.84, 'rw'], [-2.12, 1.46, 0.76, 'cab'], [-0.9, 1.48, 0.75, 'pil'], [-0.8, 1.48, 0.75, 'cab'], [0.05, 1.48, 0.75, 'pil'], [0.17, 1.48, 0.75, 'cab'], [0.65, 1.45, 0.76, 'ws'], [1.45, 1.0, 0.86, 'hood'], [2.25, 0.86, 0.8, 'nose'], [2.325, 0.72, 0.74, null]] },
  suv: { L: 4.45, W: 1.86, H: 1.67, wr: 0.36, axles: [1.38, -1.33], belt: 1.08, rock: 0.42, plastic: true, st: [[-2.225, 1.08, 0.88, 'tail'], [-2.16, 1.25, 0.84, 'rw'], [-1.85, 1.62, 0.78, 'cab'], [-0.15, 1.66, 0.78, 'pil'], [-0.03, 1.66, 0.78, 'cab'], [0.6, 1.62, 0.78, 'ws'], [1.35, 1.16, 0.86, 'hood'], [2.1, 1.02, 0.82, 'nose'], [2.225, 0.86, 0.76, null]] },
  ludospace: { L: 4.35, W: 1.83, H: 1.82, wr: 0.32, axles: [1.45, -1.27], belt: 1.0, rock: 0.33, rearGlass: true, st: [[-2.175, 1.75, 0.82, 'rw'], [-2.12, 1.8, 0.8, 'cab'], [-0.6, 1.82, 0.8, 'pil'], [-0.48, 1.82, 0.8, 'cab'], [0.55, 1.8, 0.8, 'ws'], [1.45, 1.1, 0.86, 'hood'], [2.1, 0.98, 0.82, 'nose'], [2.175, 0.8, 0.76, null]] },
  fourgon: { L: 5.2, W: 2.0, H: 2.35, wr: 0.34, axles: [1.75, -1.6], belt: 1.15, rock: 0.38, st: [[-2.6, 2.3, 0.9, 'van'], [-2.55, 2.35, 0.9, 'van'], [0.85, 2.35, 0.9, 'cab'], [1.2, 2.3, 0.86, 'ws'], [1.95, 1.2, 0.86, 'hood'], [2.5, 1.1, 0.82, 'nose'], [2.6, 0.9, 0.76, null]] },
};
const SLOT = [null, 0x141b20, 0x18191a, 0x101010, 0xa9aeb2, 0xd9dee2, 0x9e1a1a, 0xf0f0f0, 0x1e3a9e, 0x0f1011, 0x0b0b0b].map((c) => (c == null ? null : lin(c)));
const MODEL_CACHE = new Map();
function carModel(key) {
  if (MODEL_CACHE.has(key)) return MODEL_CACHE.get(key);
  const d = CARS[key], S = d.st, ns = S.length, p = [], n = [], sl = [], idx = [];
  const v = (x, y, z, nx, ny, nz, s) => { p.push(x, y, z); n.push(nx, ny, nz); sl.push(s); return sl.length - 1; };
  const quad = (a, b, c, e, N, s) => { const k = v(...a, ...N[0], s); v(...b, ...N[1], s); v(...c, ...N[2], s); v(...e, ...N[3], s); idx.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const P = S.map(([z, yt, tf], i) => { const end = i === 0 || i === ns - 1, hw = d.W / 2 * (end ? 0.955 : 1), belt = Math.min(d.belt, yt - 0.05); return [[hw * 0.93, d.rock], [hw, d.rock + 0.14], [hw, belt], [hw * tf, yt - 0.05], [hw * tf * 0.55, yt], [0, yt + 0.012]].map(([x, y]) => [x, y, z]); });
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const FN = []; for (let i = 0; i < ns - 1; i++) { FN.push([]); for (let s = 0; s < 5; s++) FN[i].push(nrm(cr(sub(P[i][s + 1], P[i][s]), sub(P[i + 1][s], P[i][s])))); }
  const VN = (i, s) => { const a = [0, 0, 0]; for (const [ii, ss] of [[i - 1, s - 1], [i - 1, s], [i, s - 1], [i, s]]) if (ii >= 0 && ii < ns - 1 && ss >= 0 && ss < 5) { a[0] += FN[ii][ss][0]; a[1] += FN[ii][ss][1]; a[2] += FN[ii][ss][2]; } return nrm(a); };
  for (let i = 0; i < ns - 1; i++) for (let s = 0; s < 5; s++) {
    const reg = S[i][3], glassSide = reg === 'cab' || reg === 'ws' || reg === 'rw', glassTop = reg === 'ws' || reg === 'rw';
    const slot = s === 0 ? (d.plastic ? 2 : 0) : s === 1 ? 0 : s === 2 ? (glassSide ? 1 : reg === 'pil' ? 9 : 0) : (glassTop ? 1 : 0);
    for (const sd of [1, -1]) {
      const m = (q) => [q[0] * sd, q[1], q[2]], mn = (q) => [q[0] * sd, q[1], q[2]];
      const a = m(P[i][s]), b = m(P[i][s + 1]), c = m(P[i + 1][s + 1]), e = m(P[i + 1][s]), N = [VN(i, s), VN(i, s + 1), VN(i + 1, s + 1), VN(i + 1, s)].map(mn);
      if (sd > 0) quad(a, b, c, e, N, slot); else quad(a, e, c, b, [N[0], N[3], N[2], N[1]], slot);
    }
  }
  // faces avant et arrière (éventail depuis le centre de la section)
  for (const [i, nz] of [[0, -1], [ns - 1, 1]]) {
    const half = P[i], ring = half.concat(half.slice(0, -1).reverse().map((q) => [-q[0], q[1], q[2]])), c = ring.reduce((a, q) => [a[0] + q[0] / ring.length, a[1] + q[1] / ring.length, a[2] + q[2] / ring.length], [0, 0, 0]);
    const k0 = v(c[0], c[1], c[2], 0, 0, nz, 0); for (const q of ring) v(q[0], q[1], q[2], 0, 0, nz, 0);
    for (let k = 0; k < ring.length; k++) { const a = k0 + 1 + k, b = k0 + 1 + (k + 1) % ring.length; if (nz > 0) idx.push(k0, a, b); else idx.push(k0, b, a); }
  }
  const zf = S[ns - 1][0] + 0.004, zr = S[0][0] - 0.004, hwf = d.W / 2 * 0.955, ytf = S[ns - 1][1], ytr = S[0][1];
  const fq = (xa, y0, xb, y1, z, nz, s) => { const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), N = [[0, 0, nz], [0, 0, nz], [0, 0, nz], [0, 0, nz]]; if (nz > 0) quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], N, s); else quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], N, s); };
  for (const sx of [-1, 1]) { fq(sx * (hwf - 0.48), ytf - 0.2, sx * (hwf - 0.1), ytf - 0.07, zf, 1, 5); fq(sx * (hwf - 0.4), ytr - 0.24, sx * (hwf - 0.08), ytr - 0.09, zr, -1, 6); }
  fq(-0.32, d.rock + 0.18, 0.32, Math.max(d.rock + 0.26, ytf - 0.2), zf, 1, 9); fq(-0.26, d.rock + 0.05, 0.26, d.rock + 0.16, zf + 0.001, 1, 7); fq(-0.26, d.rock + 0.2, 0.26, d.rock + 0.31, zr - 0.001, -1, 7);
  for (const sx of [-1, 1]) { fq(sx * 0.26 - 0.02, d.rock + 0.05, sx * 0.26 + 0.02, d.rock + 0.16, zf + 0.002, 1, 8); fq(sx * 0.26 - 0.02, d.rock + 0.2, sx * 0.26 + 0.02, d.rock + 0.31, zr - 0.002, -1, 8); }
  if (d.rearGlass) fq(-hwf * 0.72, d.belt + 0.08, hwf * 0.72, ytr - 0.12, zr - 0.001, -1, 1);
  if (key === 'fourgon') fq(-0.02, d.belt - 0.6, 0.02, ytr - 0.15, zr - 0.002, -1, 9);
  // roues : passage de roue sombre, bande de roulement, flanc, jante ; rétroviseurs
  const T = cylGeo(d.wr, 0.21, 9, { open: true }), RIM = latheGeo([[d.wr * 0.62, 0], [0, 0]], 9), SW = latheGeo([[d.wr, 0], [d.wr * 0.62, 0]], 9);
  const put = (g, m, s) => { const P2 = g.attributes.position, N2 = g.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(m), t = new THREE.Vector3(), tn = new THREE.Vector3(), k0 = sl.length; for (let k = 0; k < P2.count; k++) { t.fromBufferAttribute(P2, k).applyMatrix4(m); tn.fromBufferAttribute(N2, k).applyMatrix3(nm).normalize(); v(t.x, t.y, t.z, tn.x, tn.y, tn.z, s); } for (let k = 0; k < g.index.count; k++) idx.push(k0 + g.index.getX(k)); };
  for (const za of d.axles) for (const sd of [1, -1]) {
    const hx = d.W / 2, xw = sd * (hx - 0.095), R = d.wr + 0.06, k0 = v(sd * (hx + 0.003), d.wr, za, sd, 0, 0, 10);
    for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; v(sd * (hx + 0.003), d.wr + Math.sin(a) * R, za + Math.cos(a) * R, sd, 0, 0, 10); }
    for (let k = 0; k < 8; k++) if (sd > 0) idx.push(k0, k0 + 2 + k, k0 + 1 + k); else idx.push(k0, k0 + 1 + k, k0 + 2 + k);
    const rot = new THREE.Matrix4().makeRotationZ(-sd * Math.PI / 2);
    put(T, rot.clone().setPosition(xw, d.wr, za), 3);
    put(SW, rot.clone().setPosition(sd * (hx + 0.011), d.wr, za), 3); put(RIM, rot.clone().setPosition(sd * (hx + 0.012), d.wr, za), 4);
  }
  const ws = S.find((q) => q[3] === 'ws'), zm = ws ? ws[0] + 0.05 : 0.6, RB = roundBoxGeo(0.12, 0.1, 0.2, 0.03, 1);
  for (const sd of [1, -1]) put(RB, new THREE.Matrix4().makeTranslation(sd * (d.W / 2 + 0.07), d.belt + 0.1, zm), 0);
  T.dispose(); RIM.dispose(); SW.dispose(); RB.dispose();
  const M = { p, n, sl, i: idx, d }; MODEL_CACHE.set(key, M); return M;
}
// pose d'une voiture dans un lot : position du centre au sol, cap (angle de l'avant dans le plan xz), couleur de caisse
function placeCar(B, key, x, y, z, heading, color, dirt = 1) {
  const M = carModel(key), c = Math.cos(heading), s = Math.sin(heading), body = lin(color).map((v) => v * dirt), k0 = B.count;
  // avant (+z local) tourné vers (cos h, sin h) : x' = z·cos h + x·sin h ; z' = z·sin h − x·cos h
  for (let k = 0; k < M.sl.length; k++) {
    const lx = M.p[k * 3], ly = M.p[k * 3 + 1], lz = M.p[k * 3 + 2], nx = M.n[k * 3], ny = M.n[k * 3 + 1], nz = M.n[k * 3 + 2], sl = M.sl[k];
    B.v(x + lz * c + lx * s, y + ly, z + lz * s - lx * c, nz * c + nx * s, ny, nz * s - nx * c, 0, 0, sl ? SLOT[sl] : body);
  }
  for (const i of M.i) B.i.push(k0 + i);
  const d = M.d, hx = Math.abs(c) * d.L / 2 + Math.abs(s) * d.W / 2 + 0.03, hz = Math.abs(s) * d.L / 2 + Math.abs(c) * d.W / 2 + 0.03;
  return new Box(x - hx, y, z - hz, x + hx, y + d.H, z + hz, LAYER.FURN);
}
const PAINT = [[0xe9eaeb, 22], [0xbfc3c6, 14], [0x8d9296, 12], [0x4a4e52, 10], [0x16181a, 16], [0x1f3a63, 7], [0x7a1414, 6], [0xb3261e, 3], [0x2f4f3a, 3], [0xc9b99a, 3], [0x5a3b28, 2], [0xd97a1f, 2]];

// ───────────────────────── façades nord et sud, entrepôt ─────────────────────────
// Bardage à cassettes (texture) du sol à l'acrotère, soubassement, bandeau et couvertine, pilastres et descentes d'eaux
// pluviales tous les 20 m, issues de secours ; à l'ouest, l'entrepôt en bardage ondulé et son quai. Ces faces
// extérieures n'étaient dessinées que par les zones intérieures (étage et toit masqués depuis le parking).
function fakeDoor(A, zn, x, zf, s, w = 1.8, h = 2.2, col = 0x4f5a60) { // porte pleine à deux vantaux dans la façade z = zf (s : sens de l'extérieur)
  const Z = (d0, d1) => [Math.min(zf + s * d0, zf + s * d1), Math.max(zf + s * d0, zf + s * d1)];
  let [a, b] = Z(0, 0.04); A.furn(zn, x - w / 2 - 0.08, YR, a, x + w / 2 + 0.08, h + 0.08, b, 0x2a2d30, { metal: true, collide: false });
  for (const sx of [-1, 1]) {
    const x0 = Math.min(x + sx * 0.01, x + sx * w / 2), x1 = Math.max(x + sx * 0.01, x + sx * w / 2);
    [a, b] = Z(0.04, 0.055); A.furn(zn, x0, YR + 0.02, a, x1, h, b, col, { metal: true, collide: false });
    [a, b] = Z(0.055, 0.09); A.furn(zn, x0 + 0.1, 1.0, a, x1 - 0.1, 1.06, b, 0x9aa0a6, { metal: true, collide: false }); // barre anti-panique
  }
  [a, b] = Z(0, 0.9); A.furn(zn, x - w / 2 - 0.3, h + 0.3, a, x + w / 2 + 0.3, h + 0.38, b, 0x6d747a, { metal: true, collide: false }); // auvent
}
function buildSides(A, world, lamps) {
  for (const s of [1, -1]) {
    const f = s > 0 ? 'Z' : 'z', Zs = (a, b) => [Math.min(s * a, s * b), Math.max(s * a, s * b)];
    let [a, b] = Zs(25.66, 25.72); A.box(ZS, 'cladding', -80.7, 0.45, a, 80.75, 10.0, b, { faces: f + 'xX', collide: false });
    [a, b] = Zs(25.6, 25.8); A.box(ZS, 'concrete_dark', -80.7, YR - 0.05, a, 80.75, 0.45, b, { faces: f + 'Y', collide: false });
    [a, b] = Zs(25.7, 25.8); A.furn(ZS, -80.75, 10.0, a, 80.78, 11.62, b, 0x8b9095, { metal: true, collide: false });
    [a, b] = Zs(25.3, 25.86); A.furn(ZS, -80.8, 11.62, a, 80.8, 11.67, b, 0xb8bdc2, { metal: true, collide: false });
    [a, b] = Zs(25.45, 25.8); A.furn(ZS, 80.4, 0.45, a, 80.8, 11.62, b, 0x7d848a, { metal: true, collide: false }); // cornière d'angle
    for (let x = -70; x <= 70; x += 20) {
      [a, b] = Zs(25.72, 25.86); A.furn(ZS, x - 0.25, 0.45, a, x + 0.25, 11.62, b, 0x5c6268, { metal: true, collide: false });
      A.tube(ZS, 'furniture_metal', V3(x + 0.5, YR + 0.1, s * 25.85), V3(x + 0.5, 10.0, s * 25.85), 0.05, 0x7d848a, { segs: 8 });
      A.tube(ZS, 'furniture_metal', V3(x + 0.5, YR + 0.1, s * 25.85), V3(x + 0.5, YR + 0.1, s * 26.05), 0.05, 0x7d848a, { segs: 8 });
    }
    for (const x of [-40, 0, 40]) { fakeDoor(A, ZS, x, s * 25.72, s); [a, b] = Zs(25.72, 25.75); A.furn(ZS, x - 0.32, 2.62, a, x + 0.32, 2.84, b, 0x1b5e20, { collide: false }); }
    world.physics.add(new Box(54, YR - 0.2, s > 0 ? 25.3 : -25.9, 80.85, 4, s > 0 ? 25.9 : -25.3, LAYER.FURN));
  }
  // porte de service du personnel (façade nord, face au parking du personnel), interphone, applique allumée
  fakeDoor(A, ZS, 74, 25.72, 1, 1.0, 2.2, 0x3d464c); A.furn(ZS, 75.0, 1.2, 25.74, 75.16, 1.45, 25.79, 0x2a2d30, { metal: true, collide: false });
  for (const [x, sg, state] of [[74, 1, 'on'], [70, -1, 'on'], [62, 1, 'off']]) { // appliques au-dessus des portes
    A.furn(ZS, x - 0.18, 2.95, Math.min(sg * 25.72, sg * 26.4), x + 0.18, 3.1, Math.max(sg * 25.72, sg * 26.4), 0x2a2d30, { metal: true, collide: false });
    lamps.push({ kind: 'wall', x, y: 2.948, z: sg * 26.25, zone: ZS, circuit: 'service', state });
  }
  // entrepôt : bardage ondulé (sud, ouest, nord), quai et porte sectionnelle, couvertine ; façade ouest du centre au nord
  A.box(ZS, 'corrugated', -112.66, YR, -25.72, -80.7, 8.3, -25.66, { faces: 'zY', collide: false });
  A.box(ZS, 'corrugated', -112.72, YR, -25.72, -112.66, 8.3, 5.66, { faces: 'xY', collide: false });
  A.box(ZS, 'corrugated', -112.66, YR, 5.6, -80.7, 8.3, 5.66, { faces: 'ZY', collide: false });
  A.furn(ZS, -112.8, 8.3, -25.8, -80.7, 8.38, 5.74, 0xb8bdc2, { metal: true, collide: false });
  A.furn(ZS, -112.78, YR, -12.1, -112.72, 4.3, -7.9, 0x8d9499, { metal: true, collide: false });
  A.box(ZS, 'concrete_dark', -116, YR, -13, -112.72, 1.1, -7, { collide: false });
  A.box(ZS, 'cladding', -80.76, 0.45, 5.6, -80.7, 10.0, 25.72, { faces: 'x', collide: false });
  A.furn(ZS, -80.8, 10.0, 5.6, -80.7, 11.62, 25.8, 0x8b9095, { metal: true, collide: false });
}

// ───────────────────────── cour de service (angle sud-est) ─────────────────────────
function buildYard(A, W, world) {
  const o = { muret: 0, h: 2.2, y0: YR, color: 0x2b3a33 };
  fence(A, W, ZS, FW + 0.15, -46, FW + 0.15, -25.9, o); fence(A, W, ZS, FW + 0.15, -46, 70, -46, o); gate(A, W, ZS, 70, -46, 77, -46, 2.05);
  fence(A, W, ZS, 77, -46, XF - 0.15, -46, o); fence(A, W, ZS, XF - 0.15, -46, XF - 0.15, -25.9, o);
  const solid = (x0, z0, x1, z1, h) => world.physics.add(new Box(x0, YR, z0, x1, YR + h, z1, LAYER.FURN));
  // conteneurs à roulettes de 770 l (cuve, couvercle de couleur, roues) contre la façade
  [[62, 0x2f5e3a, 0x2f5e3a], [63.5, 0x2f5e3a, 0xf2c230], [65, 0x55595c, 0x2f5e3a], [66.5, 0x2f5e3a, 0x1565c0]].forEach(([x, c, lid]) => {
    A.rbox(ZS, 'furniture', x, YR + 0.62, -26.6, 1.2, 1.0, 0.95, 0.04, c); A.rbox(ZS, 'furniture', x, YR + 1.16, -26.62, 1.26, 0.07, 1.02, 0.02, lid);
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.32, 0.32]) A.tube(ZS, 'furniture', V3(x + sx - 0.02, YR + 0.06, -26.6 + sz), V3(x + sx + 0.02, YR + 0.06, -26.6 + sz), 0.06, 0x151515, { segs: 8 });
    solid(x - 0.62, -27.12, x + 0.62, -26.1, 1.2);
  });
  // compacteur à carton, benne ouverte, palettes, balles de carton
  A.rbox(ZS, 'furniture_metal', 72, YR + 1.2, -28.3, 5.0, 2.3, 2.4, 0.05, 0x2e5638, { n: 2 }); A.rbox(ZS, 'furniture_metal', 70.3, YR + 2.55, -28.3, 1.4, 0.5, 2.0, 0.04, 0x26462e); solid(69.5, -29.5, 74.5, -27.1, 2.6);
  { const P = [[-2, 0], [2, 0], [2.5, 1.5], [-2.5, 1.5]]; A.plate(ZS, 'furniture_metal', P, -1.25, 1.25, 0xd8a31a, { m: new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(77.2, YR + 0.1, -42.5) }); solid(75.9, -45, 78.5, -40, 1.7); }
  for (let k = 0; k < 4; k++) { const x = 62.2 + (k % 2) * 1.4, z = -44.6 + Math.floor(k / 2) * 1.1, n = [6, 4, 8, 3][k]; for (let j = 0; j < n; j++) A.furn(ZS, x - 0.6, YR + j * 0.15, z - 0.4, x + 0.6, YR + j * 0.15 + 0.13, z + 0.4, j % 2 ? 0xb08d57 : 0xa07d4a, { collide: false }); solid(x - 0.6, z - 0.4, x + 0.6, z + 0.4, n * 0.15); }
  for (let k = 0; k < 3; k++) { const x = 66.5 + k * 1.35; A.furn(ZS, x - 0.6, YR, -44.9, x + 0.6, YR + 1.0, -44.1, 0x9c7a52, { collide: false }); for (const yy of [0.25, 0.75]) A.furn(ZS, x - 0.61, YR + yy, -44.91, x + 0.61, YR + yy + 0.03, -44.09, 0x2a2a2a, { collide: false }); solid(x - 0.6, -44.9, x + 0.6, -44.1, 1.0); }
}

// ───────────────────────── abords lointains : avenue, écran acoustique, chantier, ville ─────────────────────────
function roadworks(A, W, Q, world, zc, lamps) { // avenue barrée : clôtures de chantier, balises K2, panneaux, feux clignotants
  for (let x = 176.4; x < 198.6; x += 3.45) {
    const x1 = Math.min(x + 3.4, 198.9);
    for (const xx of [x + 0.05, x1 - 0.05]) A.rbox(ZF, 'concrete', xx, YR + 0.07, zc, 0.6, 0.14, 0.24, 0.02);
    for (const xx of [x + 0.04, x1 - 0.04]) A.tube(ZF, 'steel', V3(xx, YR + 0.12, zc), V3(xx, YR + 2.05, zc), 0.02, 0xffffff, { segs: 6 });
    A.tube(ZF, 'steel', V3(x + 0.04, YR + 2.05, zc), V3(x1 - 0.04, YR + 2.05, zc), 0.02, 0xffffff, { segs: 6 }); A.tube(ZF, 'steel', V3(x + 0.04, YR + 0.18, zc), V3(x1 - 0.04, YR + 0.18, zc), 0.02, 0xffffff, { segs: 6 });
    W.quad([x + 0.04, YR + 0.18, zc], [x1 - 0.04, YR + 0.18, zc], [x1 - 0.04, YR + 2.05, zc], [x + 0.04, YR + 2.05, zc], [0, 0, 1], [0, 0, (x1 - x) / 0.2, 1.87 / 0.2], lin(0xb0b4b6));
  }
  world.physics.add(new Box(176.2, YR - 0.2, zc - 0.25, 199, YR + 2.1, zc + 0.25, LAYER.FURN));
  const sd = -Math.sign(zc); // côté du parking
  for (let x = 186.6; x < 196; x += 1.25) { const z = zc + sd * 1.0; A.rbox(ZF, 'furniture', x, YR + 0.5, z, 1.0, 1.0, 0.16, 0.03, Math.round((x - 186.6) / 1.25) % 2 ? 0xf4f4f4 : 0xc62828); }
  world.physics.add(new Box(186, YR, zc + sd * 1.0 - 0.1, 196, YR + 1.0, zc + sd * 1.0 + 0.1, LAYER.FURN));
  signPost(A, ZF, 191, zc + sd * 1.6, sd > 0 ? Math.PI / 2 : -Math.PI / 2, [{ key: 'barree', w: 0.8, h: 0.8, y: 1.7 }, { key: 'deviation', w: 0.6, h: 0.6, y: 0.95 }], { y0: YR });
  for (const x of [187, 195]) lamps.push({ kind: 'beacon', x, y: YR + 1.08, z: zc + sd * 1.0, zone: ZF, circuit: null, state: 'blink' });
}
function cityTextures() { // façades d'immeubles lointains : de nuit (fenêtres allumées) et de jour (voilées par la brume)
  const out = [];
  for (let k = 0; k < 3; k++) {
    const night = buildingFacade(1 + k * 2), c = canvas(128, 256), ctx = c.getContext('2d'), R = new RNG('ville' + k);
    const base = ['#9aa7b4', '#a7a29a', '#8f9aa6'][k]; ctx.fillStyle = base; ctx.fillRect(0, 0, 128, 256);
    for (let y = 4; y < 252; y += 11) for (let x = 4; x < 124; x += 9) { ctx.fillStyle = R.next() < 0.15 ? '#c9d3dc' : '#6f7c88'; ctx.fillRect(x, y, 5, 7); }
    const day = toTexture(c); day.wrapS = day.wrapT = THREE.RepeatWrapping; out.push({ night, day });
  }
  return out;
}
function buildCity(world) {
  const tx = cityTextures(), R = new RNG('city'), parts = [[], [], []];
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + R.range(-0.02, 0.02), d = R.range(330, 520), w = R.range(14, 40), h = R.range(18, 110);
    parts[i % 3].push({ g: new THREE.BoxGeometry(w, h, w), m: trs(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d, 0, R.range(0, 3), 0) });
  }
  const meshes = parts.map((L, k) => {
    const B = new Batch(); for (const { g, m } of L) { B.add(g, m); g.dispose(); }
    const geo = B.geometry(); geo.deleteAttribute('color');
    const mat = new THREE.MeshBasicMaterial({ map: tx[k].night, fog: false, color: new THREE.Color(0.55, 0.55, 0.6) });
    const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.updateMatrix(); world.zone(ZF).group.add(mesh);
    return { mesh, mat, tx: tx[k] };
  });
  world.city = world.zone(ZF).group;
  return meshes;
}

// ───────────────────────── pilotage : jour / nuit, éclairage, enseignes ─────────────────────────
// Voitures du jour (clients) ou de la nuit (personnel, fourgon) : la bascule se fait quand la caméra n'est pas dehors
// (jamais sous les yeux du joueur). Lampadaires allumés au crépuscule selon leur circuit (parking : « garage », parvis :
// « galerie », avenue : éclairage public), quelques-uns en panne ou qui clignotent. Totem allumé la nuit tant que la
// galerie est alimentée. Fourgon des braqueurs garé près de la rampe pendant leur venue.
class OutsideCtl extends WorldObject {
  constructor(world, parts) { super(world, 'outside_ctl', 'outside'); this.active = true; Object.assign(this, parts); this.init({}); this.shown = null; this.t = 0; this.cityDay = null; this.van = false; }
  setCars(day) {
    this.shown = day;
    for (const c of this.cars) { const on = c.day === day; for (const m of c.meshes) m.visible = on; for (const b of c.boxes) b.enabled = on; }
  }
  update(dt) {
    const g = this.world.game; if (!g.env || !g.power) return;
    this.t += dt;
    const cam = g.camera.position, out = outdoorCam(cam), day = !!g.isDay;
    if (this.shown !== day && (!out || this.shown === null)) this.setCars(day);
    const hour = g.env.minutes / 60, sunAlt = Math.sin(((hour - 7.5) / 13) * Math.PI), dark = THREE.MathUtils.clamp((0.1 - sunAlt) * 5, 0, 1);
    let street = 0;
    for (const G of this.groups) {
      let k = dark * (G.circuit ? (g.power.isOn(G.circuit) ? 1 : 0) : 1);
      if (G.flicker && k > 0) { const n = Math.sin(this.t * 23 + G.seed) * Math.sin(this.t * 7.3 + G.seed * 2.1) + Math.sin(this.t * 1.7 + G.seed) * 0.6; k *= n > 0.25 ? 1 : n > -0.4 ? 0.15 : 0.6; }
      if (G.blink) k = dark * (Math.sin(this.t * 6.2 + G.seed) > 0.2 ? 1 : 0.04);
      G.k = k; if (G.circuit === 'garage') street = Math.max(street, k);
      const e = 0.02 + k * (G.blink ? 3.2 : 2.4); G.lensMat.color.setRGB(G.col[0] * e, G.col[1] * e, G.col[2] * e);
      if (G.glowMat) G.glowMat.opacity = k * (G.blink ? 0.8 : 0.5);
      if (G.poolMat) G.poolMat.uniforms.k.value = k;
    }
    this.world.streetLight = street; // façade vitrée : la lumière des lampadaires entre dans le hall (environment.js)
    const lit = dark * (g.power.isOn('gallery') ? 1 : 0), e = 0.004 + lit * 1.4;
    this.litMat.emissive.setRGB(e, e, e);
    this.pubMat.emissive.setRGB(0.01 + dark * 1.1, 0.01 + dark * 1.1, 0.01 + dark * 1.1);
    const cd = dark < 0.5;
    if (this.cityDay !== cd) { this.cityDay = cd; for (const c of this.city) { c.mat.map = cd ? c.tx.day : c.tx.night; c.mat.color.setRGB(cd ? 0.95 : 0.55, cd ? 0.97 : 0.55, cd ? 1.0 : 0.6); } }
    // fourgon des braqueurs : là pendant le braquage, reparti quand c'est fini (hors de la vue)
    const Rb = g.entities?.robbery, want = !!Rb && Rb.state !== 'planned' && !Rb.done;
    if (want !== this.van && (want || !out || cam.distanceTo(this.vanPos) > 45)) { this.van = want; this.vanMesh.visible = want; this.vanBox.enabled = want; }
  }
}

// ───────────────────────── équipements ─────────────────────────
// abribus (x0…x1 × z0…z1, ouvert côté +x) : parois vitrées sur cadre d'aluminium, toit, banc, panneau publicitaire
// éclairé (côté sud), fiche horaire lisible, affiche « AVEZ-VOUS VU LUCIE ? » scotchée sur la vitre du fond
function busShelter(A, world, x0, z0, x1, z1, pub) {
  const zn = ZO, y0 = YP, h = 2.45, G = (a, b, c, d, e, f) => A.box(zn, 'glass', a, b, c, d, e, f, { collide: false });
  for (const [x, z] of [[x0, z0], [x0, z1], [x0, (z0 + z1) / 2], [x1, z0], [x1, z1]]) A.box(zn, 'aluminium', x - 0.04, y0, z - 0.04, x + 0.04, y0 + h, z + 0.04, { collide: false });
  G(x0 - 0.01, y0 + 0.15, z0, x0 + 0.01, y0 + h - 0.1, z1); G(x0, y0 + 0.15, z1 - 0.01, x1 - 0.05, y0 + h - 0.1, z1 + 0.01);
  A.box(zn, 'aluminium', x0, y0 + 0.12, z0 - 0.08, x1, y0 + h - 0.08, z0 + 0.08, { collide: false }); // caisson publicitaire (côté sud)
  pub.wall((x0 + x1) / 2, y0 + 1.3, z0 + 0.085, 0, 1, 1.1, 1.55, SIGNS.uv.affHelios); pub.wall((x0 + x1) / 2, y0 + 1.3, z0 - 0.085, 0, -1, 1.1, 1.55, SIGNS.uv.affSoldes);
  A.box(zn, 'furniture_metal', x0 - 0.15, y0 + h, z0 - 0.2, x1 + 0.25, y0 + h + 0.12, z1 + 0.2, { collide: false, color: 0x5c6670 });
  A.box(zn, 'glass_roof', x0 - 0.05, y0 + h + 0.12, z0 - 0.1, x1 + 0.15, y0 + h + 0.14, z1 + 0.1, { collide: false });
  bench(A, zn, x0 + 0.45, (z0 + z1) / 2 + 0.4, 0, { noBack: true, seat: true });
  SIGN_Q.push({ zone: zn, x: x1 - 0.6, y: y0 + 1.45, z: z1 - 0.025, nx: 0, nz: -1, w: 0.62, h: 0.62, key: 'horaires' });
  SIGN_Q.push({ zone: zn, x: x0 + 0.018, y: y0 + 1.5, z: z1 - 1.0, nx: 1, nz: 0, w: 0.42, h: 0.59, key: 'affLucie' });
  world.add(new Readable(world, world.newId('out_read'), { zone: zn, name: 'Horaires de bus', title: 'Arrêt « Hélios — Centre commercial »', box: [x1 - 1.0, y0 + 1.0, z1 - 0.2, x1 - 0.2, y0 + 1.9, z1 + 0.05], text: 'Ligne 12 — Gare SNCF ↔ ZI Nord\nPremier départ 6 h 12, puis toutes les 20 minutes aux heures de pointe.\nDernier passage : 21 h 47.\n\nLigne 34 — dimanches et fêtes uniquement.\n\nArrêt non desservi après 22 h. En cas d\'urgence, adressez-vous au poste de sécurité du centre (entrée principale).' }));
  world.add(new Readable(world, world.newId('out_read'), { zone: zn, name: 'Affiche', box: [x0, y0 + 1.1, z1 - 1.3, x0 + 0.2, y0 + 1.9, z1 - 0.7], lore: null, title: 'AVEZ-VOUS VU LUCIE ?', text: 'Lucie, 8 ans. Disparue le 14/11/1987 au centre commercial Hélios.\nVêtue d\'un ciré jaune.\nToute information : 0 800 19 87 13.\n\nL\'affiche est délavée, recollée plusieurs fois. Quelqu\'un a écrit au feutre, dans un coin : « elle est encore dedans ».' }));
  world.physics.add(new Box(x0 - 0.08, y0, z0 - 0.1, x0 + 0.06, y0 + h, z1 + 0.06, LAYER.GLASS)); world.physics.add(new Box(x0, y0, z1 - 0.06, x1, y0 + h, z1 + 0.06, LAYER.GLASS));
  world.physics.add(new Box(x0, y0, z0 - 0.1, x1, y0 + h, z0 + 0.1, LAYER.FURN));
}
// borne d'appel d'urgence (fût jaune, boîtier SOS, feu bleu) ; a : direction de la face
function sosPost(A, world, zn, x, z, a, y0 = YP) {
  const nx = Math.cos(a), nz = Math.sin(a);
  A.rbox(zn, 'furniture_metal', x, y0 + 0.9, z, 0.16, 1.8, 0.16, 0.02, 0xe0b000);
  A.rbox(zn, 'furniture_metal', x + nx * 0.1, y0 + 1.45, z + nz * 0.1, Math.abs(nz) * 0.34 + Math.abs(nx) * 0.14, 0.66, Math.abs(nx) * 0.34 + Math.abs(nz) * 0.14, 0.02, 0xf2c230);
  SIGN_Q.push({ zone: zn, x: x + nx * 0.172, y: y0 + 1.45, z: z + nz * 0.172, nx, nz, w: 0.3, h: 0.6, key: 'sos' });
  A.lathe(zn, 'furniture', [[0.06, 0], [0.06, 0.08], [0.03, 0.12], [0, 0.13]], 10, x, y0 + 1.8, z, 0x1e5bd6);
  world.physics.add(new Box(x - 0.12, y0, z - 0.12, x + 0.12, y0 + 1.9, z + 0.12, LAYER.FURN));
  world.add(new Readable(world, world.newId('out_read'), { zone: ZO, name: 'Borne d\'appel d\'urgence', box: [x - 0.25, y0 + 1.0, z - 0.25, x + 0.25, y0 + 1.9, z + 0.25], title: 'APPEL D\'URGENCE', text: 'Maintenez le bouton enfoncé trois secondes : vous êtes mis en relation avec le poste de sécurité du centre commercial.\n\n(Le poste de sécurité, la nuit, c\'est vous. Personne ne décroche.)' }));
}
// conteneur d'apport volontaire en forme de cloche (verre, papiers, emballages)
function bell(A, world, zn, x, z, color, key) {
  A.lathe(zn, 'furniture', [[0, 0.02], [0.72, 0.02], [0.78, 0.12], [0.78, 1.25], [0.62, 1.6], [0.2, 1.78], [0, 1.8]], 16, x, YP, z, color);
  A.tube(zn, 'furniture_metal', V3(x, YP + 1.78, z), V3(x, YP + 2.05, z), 0.03, 0x6d7276, { segs: 6 }); A.lathe(zn, 'furniture_metal', [[0.1, 0], [0.12, 0.02], [0.1, 0.04], [0.08, 0.02]], 10, x, YP + 2.05, z, 0x6d7276);
  A.lathe(zn, 'furniture', [[0.13, 0], [0.13, 0.01]], 12, x + 0.78, YP + 1.05, z, 0x111111, { rz: -Math.PI / 2 });
  SIGN_Q.push({ zone: zn, x: x + 0.785, y: YP + 0.72, z, nx: 1, nz: 0, w: 0.62, h: 0.23, key });
  world.physics.add(new Box(x - 0.78, YP, z - 0.78, x + 0.78, YP + 1.85, z + 0.78, LAYER.FURN));
}
// borne de recharge (fût blanc à liseré vert, écran, câble lové) ; a : direction de la face
function evCharger(A, world, zn, x, z, a) {
  const nx = Math.cos(a), nz = Math.sin(a);
  A.rbox(zn, 'furniture', x, YP + 0.75, z, Math.abs(nz) * 0.36 + Math.abs(nx) * 0.24, 1.5, Math.abs(nx) * 0.36 + Math.abs(nz) * 0.24, 0.05, 0xeceff1, { n: 2 });
  A.furn(zn, x - 0.13 * Math.abs(nz) + nx * 0.121 - 0.005, YP + 0.95, z - 0.13 * Math.abs(nx) + nz * 0.121 - 0.005, x + 0.13 * Math.abs(nz) + nx * 0.121 + 0.005, YP + 1.2, z + 0.13 * Math.abs(nx) + nz * 0.121 + 0.005, 0x0c1418, { collide: false });
  A.furn(zn, x - 0.185 * Math.abs(nz) - 0.12 * Math.abs(nx), YP + 1.42, z - 0.185 * Math.abs(nx) - 0.12 * Math.abs(nz), x + 0.185 * Math.abs(nz) + 0.12 * Math.abs(nx), YP + 1.48, z + 0.185 * Math.abs(nx) + 0.12 * Math.abs(nz), 0x2e9e4f, { collide: false });
  const P = []; for (let k = 0; k <= 10; k++) { const t = k / 10 * Math.PI * 1.6; P.push(V3(x + nx * (0.16 + Math.sin(t) * 0.08) - nz * Math.cos(t) * 0.12, YP + 0.85 - t * 0.09, z + nz * (0.16 + Math.sin(t) * 0.08) + nx * Math.cos(t) * 0.12)); }
  A.sweep(zn, 'furniture', P, circleShape(0.018, 5), 0x1a1a1a);
  world.physics.add(new Box(x - 0.2, YP, z - 0.2, x + 0.2, YP + 1.5, z + 0.2, LAYER.FURN));
}
// mât de vidéosurveillance (6 m) : potence, caméra dôme ; position et visée exposées pour la vidéosurveillance
function camPole(A, world, zn, x, z, yaw, y0 = YP) {
  A.lathe(zn, 'furniture_metal', [[0, 0], [0.13, 0], [0.13, 0.03], [0.08, 0.07], [0.07, 6.0], [0, 6.0]], 10, x, y0, z, 0x6b7177);
  const ux = -Math.sin(yaw), uz = -Math.cos(yaw);
  A.beam(zn, 'furniture_metal', V3(x, y0 + 5.85, z), V3(x + ux * 0.6, y0 + 5.85, z + uz * 0.6), 0.06, 0.06, 0x6b7177);
  A.rbox(zn, 'furniture_metal', x + ux * 0.62, y0 + 5.8, z + uz * 0.62, 0.22, 0.12, 0.22, 0.03, 0xdfe3e6);
  A.lathe(zn, 'furniture', [[0.1, 0], [0.09, -0.07], [0.05, -0.11], [0, -0.12]], 12, x + ux * 0.62, y0 + 5.74, z + uz * 0.62, 0x14181b);
  world.physics.add(new Box(x - 0.13, y0, z - 0.13, x + 0.13, y0 + 6, z + 0.13, LAYER.FURN));
  (world.points.parkingCams ||= []).push({ pos: V3(x + ux * 0.62, y0 + 5.65, z + uz * 0.62), yaw, pitch: -0.45, fov: 75 });
}

// ───────────────────────── aménagement : lampes, plantations, clôtures, mobilier, panneaux ─────────────────────────
function furnish(A, W, Q, world, rng, lamps, bays, lit, pub, TB) {
  // ── lampadaires (circuit « garage » : parking ; « gallery » : parvis et marquise ; avenue : éclairage public) ──
  const L = (kind, x, z, arms, zone = ZL, o = {}) => lamps.push({ kind, x, z, arms, zone, circuit: 'garage', state: 'on', ...o });
  for (const s of [1, -1]) {
    const up = Math.PI / 2, n = s > 0;
    L('lot', 120, s * 23.5, [up, -up], ZL, { row: n ? 'A' : 'D', state: n ? 'on' : 'flicker' }); L('lot', 144, s * 23.5, [up, -up], ZL, { row: n ? 'B' : 'E' });
    L('lot', 120, s * 41.5, [up, -up]); L('lot', 144, s * 41.5, [up, -up], ZL, { row: n ? 'C' : 'F', state: n ? 'on' : 'off' });
    for (const x of [125, 133]) if (x === 125) L('lot', x, s * 5.75, [-s * up], ZL, { state: !n ? 'flicker' : 'on' });
    L('lot', 118, s * 58.85, [-s * up], ZL, { state: n ? 'off' : 'on' }); L('lot', 140, s * 58.85, [-s * up]);
    for (const z of [24, 44]) L('lot', 170.35, s * z, [Math.PI], ZL, { state: !n && z === 44 ? 'off' : 'on' });
    L('lot', 150.2, s * 9.6, [Math.atan2(-s * 9.6, 11.8)]); L('lot', 171.0, s * 10.2, [Math.atan2(-s * 10.2, -9.0)]);
    for (const z of [9, 27, 45]) L('lot', 107.25, s * z, [Math.PI]);
  }
  L('lot', 68, 42.2, [Math.PI / 2], ZS); L('lot', 90, 42.2, [Math.PI / 2]); L('lot', 72, -46.9, [-Math.PI / 2], ZS); L('lot', 90, -47.1, [-Math.PI / 2]);
  for (const [x, z] of [[96.8, 1.4], [94.5, 14.5], [94.5, 27.8], [96.8, -9.2], [93, -25.5], [84.2, 28.6], [84.2, -28.6]]) L('parvis', x, z, [], ZO, { circuit: 'gallery' });
  for (const x of [83.2, 87.2, 91.2]) L('bollard', x, 3.6, [], ZO, { circuit: 'gallery' });
  for (const z of [-3.2, 0, 3.2]) L('canopy', 82.4, z, [], ZO, { circuit: 'gallery', y: 4.47 });
  for (let z = -160; z <= 160; z += 32) L('avenue', 185.3, z, [0], ZF, { circuit: null, state: z === 96 ? 'off' : 'on' });
  // ── arbres (troncs solides), arbustes, haies ──
  const T = TB[ZL], TO = TB[ZO], TS = TB[ZS], TF = TB[ZF];
  const tr = (B, x, z, o = {}) => { tree(B, rng, x, o.y0 ?? YP, z, o); world.physics.add(new Box(x - 0.17, o.y0 ?? YP, z - 0.17, x + 0.17, (o.y0 ?? YP) + 2.6, z + 0.17, LAYER.FURN)); };
  const pit = (zn, x, z) => { A.box(zn, 'concrete', x - 0.72, YP - 0.02, z - 0.72, x + 0.72, YP + 0.01, z + 0.72, { faces: 'Y', collide: false }); A.furn(zn, x - 0.6, YP + 0.012, z - 0.6, x + 0.6, YP + 0.018, z + 0.6, 0x2a2b2c, { metal: true, collide: false }); for (let k = -4; k <= 4; k++) A.furn(zn, x - 0.56, YP + 0.018, z + k * 0.12 - 0.02, x + 0.56, YP + 0.022, z + k * 0.12 + 0.02, 0x3c3e40, { metal: true, collide: false }); };
  for (const s of [1, -1]) {
    for (const x of [113, 127, 137, 151]) { tr(T, x, s * 23.5); pit(ZL, x, s * 23.5); }
    for (const x of [112, 128, 136, 152]) tr(T, x, s * 41.5);
    for (const x of [141, 148]) tr(T, x, s * 5.4, { h: 6, r: 2.0 });
    for (const [x, z] of [[107.25, 20], [157.5, 21.5], [157.5, 27.5], [107.25, 38.5], [157.5, 38], [157.5, 45], [103.5, 56], [160.5, 56], [167, 56], [167.5, 10.5]]) tr(T, x, s * z);
    // haies : contre la clôture (nord, sud), le long de l'allée de ceinture, basses sur les îlots plantés
    hedge(A, ZS, 62, s > 0 ? 59.1 : -60.5, XF, s > 0 ? 60.5 : -59.1); hedge(A, ZL, XF, s > 0 ? 59.1 : -60.5, 172, s > 0 ? 60.5 : -59.1);
    hedge(A, ZL, 170.6, s > 0 ? 16 : -59.1, 172, s > 0 ? 59.1 : -16);
    for (const [a, b] of [[109, 110.8], [113.3, 118.7], [121.3, 126.6], [129.4, 134.6], [137.4, 142.6], [145.4, 150.6], [153.4, 155.5]]) hedge(A, ZL, a, s * 41.5 - 0.4, b, s * 41.5 + 0.4, 0.62);
  }
  for (const [x, z] of [[86.5, 15], [86.5, 26], [86.5, -14.5], [86.5, -25.5]]) { tr(TO, x, z, { h: 7.2, r: 2.6 }); pit(ZO, x, z); }
  for (const [x, z] of [[85, 36], [92, 39.2], [96.3, 33.5], [85, -40], [91, -44.5], [96.2, -37.5], [88, -57], [95.5, -56.5]]) tr(T, x, z);
  for (const [x, z] of [[64, 32], [68, 38.5], [78, 37], [66, -57], [76, -56.5]]) tr(TS, x, z);
  for (let x = -70; x <= 50; x += 15) for (const s of [1, -1]) tree(TS, rng, x + (s > 0 ? 0 : 7), YR, s * 34, { h: rng.range(6.5, 8.5), r: 2.6 });
  for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28; shrub(T, rng, RC[0] + Math.cos(a) * 3.6, YP + 0.18, RC[1] + Math.sin(a) * 3.6, 0.55); }
  for (let x = 63; x < 174; x += 8.5) for (const s of [1, -1]) poplar(TF, rng, x + rng.range(-1, 1), YR, s * rng.range(67, 70));
  for (let z = -150; z <= 150; z += 14) tree(TF, rng, 207 + rng.range(-2, 4), YR, z + rng.range(-3, 3), { h: rng.range(8, 11), r: rng.range(3, 4) });
  // soleil d'Hélios au centre du giratoire : disque de laiton à rayons sur un socle de pierre
  A.box(ZL, 'stone', RC[0] - 0.7, YP, RC[1] - 0.7, RC[0] + 0.7, YP + 1.1, RC[1] + 0.7, { collide: true, layer: LAYER.FURN });
  A.lathe(ZL, 'furniture_metal', [[0, -0.06], [1.1, -0.04], [1.15, 0], [1.1, 0.04], [0, 0.06]], 24, RC[0], YP + 3.0, RC[1], 0xc9a227, { rx: Math.PI / 2 });
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; A.beam(ZL, 'furniture_metal', V3(RC[0] + Math.cos(a) * 1.15, YP + 3.0 + Math.sin(a) * 1.15, RC[1]), V3(RC[0] + Math.cos(a) * 1.9, YP + 3.0 + Math.sin(a) * 1.9, RC[1]), 0.05, 0.12, 0xc9a227, V3(0, 0, 1)); }
  A.tube(ZL, 'furniture_metal', V3(RC[0], YP + 1.1, RC[1]), V3(RC[0], YP + 1.9, RC[1]), 0.06, 0x8d6e2a, { segs: 8 });
  // ── clôtures, portails d'accès pompiers, piliers de l'entrée du site ──
  for (const s of [1, -1]) {
    fence(A, W[ZS], ZS, FW, s * 61.8, XF, s * 61.8); fence(A, W[ZL], ZL, XF, s * 61.8, FX, s * 61.8);
    fence(A, W[ZL], ZL, 175.8, s * 7.7, 175.8, s * 61.8); fence(A, W[ZF], ZF, 175.8, s * 61.8, 175.8, s * 72.3); // jusqu'aux barrières de chantier : le bas-côté reste fermé
    for (const [a, b] of s > 0 ? [[25.9, 47.4], [53.6, 61.8]] : [[-61.8, -53.6], [-47.4, -46]]) fence(A, W[ZS], ZS, FW + 0.2, a, FW + 0.2, b);
    gate(A, W[ZS], ZS, FW + 0.2, s * 47.5, FW + 0.2, s * 53.5, 1.9);
    A.box(ZL, 'brick', 175.45, YR, s * 7.3 - 0.35, 176.15, YP + 2.3, s * 7.3 + 0.35, { layer: LAYER.FURN }); A.box(ZL, 'concrete', 175.38, YP + 2.3, s * 7.3 - 0.42, 176.22, YP + 2.42, s * 7.3 + 0.42, { collide: false });
  }
  A.furn(ZL, 176.0, YP + 0.85, 8.85, 176.08, YP + 1.65, 11.75, 0x20262e, { collide: false }); SIGN_Q.push({ zone: ZL, x: 176.085, y: YP + 1.25, z: 10.3, nx: 1, nz: 0, w: 2.8, h: 0.52, key: 'entreeSite' });
  // ── parvis : bancs, corbeilles, potelets, arceaux à vélos, abri à chariots, abribus, borne d'urgence ──
  bench(A, ZO, 89.4, 17.6, 0, { seat: true }); bench(A, ZO, 89.4, 24.4, 0); bench(A, ZO, 89.4, -24.4, 0, { seat: true }); bench(A, ZO, 84.5, 9.8, Math.PI / 2);
  for (const [x, z] of [[82.4, 7.6], [91.5, 20.6], [91.5, -22.5], [90, -10.8], [109.4, 22.85], [109.4, -22.85], [131, 24.15], [131, -24.15]]) bin(A, x < 98 ? ZO : ZL, x, z);
  for (const z of [-0.6, 0.8, 2.2, 3.8, 6.8, 22.1, 24.9, -22.1, -24.9]) bollard(A, ZO, 98.15, z);
  for (let z = 16.4; z < 20.6; z += 0.9) bikeHoop(A, ZO, 82.9, z, 0);
  trolleyShelter(A, W[ZO], ZO, 89.4, 10.4, 94.6, 12.7, 'X', 2, YP);
  busShelter(A, world, 91.8, -17.2, 95.3, -12.8, pub);
  signPost(A, ZO, 96.0, -20.5, -Math.PI / 2, [{ key: 'bus', w: 0.5, h: 0.5, y: 2.45 }, { key: 'arret', w: 1.0, h: 0.25, y: 1.98 }], { both: true });
  signPost(A, ZO, 96.45, 8.6, -Math.PI / 2, [{ key: 'depose', w: 0.8, h: 0.4, y: 2.1 }], { both: true });
  sosPost(A, world, ZO, 97.4, -8.3, 0);
  for (const [x, c, k] of [[85.2, 0x2e7d32, 'verre'], [88.2, 0x1565c0, 'papier'], [91.2, 0xe0b000, 'emball']]) bell(A, world, ZL, x, -31.8, c, k);
  camPole(A, world, ZO, 84, -8.7, Math.PI * 0.75);
  // ── parking : abris à chariots dans des places, bornes de recharge, signalisation, caméras, bornes SOS ──
  trolleyShelter(A, W[ZL], ZL, 116.2, 19.7, 121.0, 22.35, 'x'); trolleyShelter(A, W[ZL], ZL, 136.2, -27.35, 141.0, -24.65, 'x');
  for (const b of bays) if (!b.staff && ((b.cz > 17 && b.cz < 23 && b.cx > 115 && b.cx < 122) || (b.cz < -24 && b.cz > -30 && b.cx > 135 && b.cx < 142))) b.blocked = true;
  for (const x of [117.6, 122.6]) evCharger(A, world, ZL, x, -6.05, -Math.PI / 2);
  signPost(A, ZL, 120.1, -6.2, -Math.PI / 2, [{ key: 'ev', w: 0.45, h: 0.45, y: 2.0 }]);
  for (const b of bays) if (b.kind === 'pmr') signPost(A, ZL, b.cx - (b.cz > 0 ? 0.4 : 0.4), b.cz > 0 ? 6.2 : -6.2, b.cz > 0 ? Math.PI / 2 : -Math.PI / 2, [{ key: 'pmr', w: 0.42, h: 0.42, y: 1.95 }]);
  signPost(A, ZL, 172.8, -8.2, 0, [{ key: 'v30', w: 0.65, h: 0.65, y: 2.35 }, { key: 'gratuit', w: 1.1, h: 0.55, y: 1.5 }]);
  signPost(A, ZL, 172.8, 8.3, 0, [{ key: 'video', w: 0.8, h: 0.4, y: 1.9 }]);
  signPost(A, ZL, 149.9, 5.0, Math.PI, [{ key: 'yield', w: 0.7, h: 0.62, y: 2.1 }]); signPost(A, ZL, 174.3, -4.6, 0, [{ key: 'yield', w: 0.7, h: 0.62, y: 2.1 }]); signPost(A, ZL, 165.6, 12.9, Math.PI / 2, [{ key: 'yield', w: 0.7, h: 0.62, y: 2.1 }]);
  signPost(A, ZL, 178.2, 0, 0, [{ key: 'dirEntree', w: 1.8, h: 0.45, y: 2.15 }, { key: 'dirP1', w: 0.9, h: 0.45, y: 1.6 }]);
  signPost(A, ZL, 146.6, 0, Math.PI, [{ key: 'dirSortie', w: 0.9, h: 0.45, y: 2.0 }]);
  signPost(A, ZL, 97.8, 42.0, 0, [{ key: 'personnel', w: 0.9, h: 0.45, y: 1.9 }]); signPost(A, ZL, 97.8, -47.0, 0, [{ key: 'dirLivr', w: 0.9, h: 0.45, y: 1.9 }]);
  for (const s of [1, -1]) { camPole(A, world, ZL, 132.5, s * 23.5, s > 0 ? Math.PI * 0.85 : Math.PI * 0.15); sosPost(A, world, ZL, 133.0, s * 23.5 - s * 0.05, s > 0 ? -Math.PI / 2 : Math.PI / 2); }
  camPole(A, world, ZL, 157.5, 46.5, Math.PI * 0.3); camPole(A, world, ZL, 172.6, -12.5, -Math.PI * 0.35);
  for (const [x, z, a] of [[128, 13.1, 0.4], [147.6, -16.0, 2.1], [112, 31.2, 1.2]]) { caddy(A, W[ZL], ZL, x, z, a); world.physics.add(new Box(x - 0.55, YR, z - 0.55, x + 0.55, YR + 1.05, z + 0.55, LAYER.FURN)); }
  Q[ZS].floor(70, YM, -50.5, 1, 0, 1.0, 4.0, MARKS.uv.livraisons);
  // ── abords lointains : totem, panneaux de l'avenue, écran acoustique, chantier ──
  pylon(A, ZF, 181, 14, lit);
  for (const s of [1, -1]) signPost(A, ZF, 185.0, s * 24, s > 0 ? Math.PI / 2 : -Math.PI / 2, [{ key: 'gratuit', w: 1.4, h: 0.7, y: 2.2 }, { key: 'P', w: 0.7, h: 0.7, y: 3.1 }]);
  signPost(A, ZF, 181.6, -5.2, 0, [{ key: 'giratoire', w: 0.8, h: 0.72, y: 2.0 }]);
  A.box(ZF, 'wood_slats', 199.05, YP, -420, 199.35, YP + 3.4, 420, { faces: 'xXY', collide: false });
  for (let z = -150; z <= 150; z += 4) A.box(ZF, 'concrete', 198.98, YP, z - 0.12, 199.42, YP + 3.55, z + 0.12, { collide: false });
  world.physics.add(new Box(198.95, YR - 0.3, -80, 199.45, YP + 3.5, 80, LAYER.WALL));
  for (const s of [1, -1]) roadworks(A, W[ZF], Q, world, s * 72, lamps);
}

// ───────────────────────── voitures : jeux du jour et de la nuit ─────────────────────────
function parkCars(world, rng, bays) {
  const sets = { day: {}, night: {} }, boxes = { day: [], night: [] }, keys = ['citadine', 'citadine', 'citadine', 'berline', 'break', 'suv', 'suv', 'ludospace', 'berline'];
  const put = (set, zn, key, x, z, h, color, dirt = 1) => { const B = sets[set][zn] ||= new Batch(); const b = placeCar(B, key, x, YR, z, h, color, dirt); world.physics.add(b); boxes[set].push(b); };
  const paint = () => rng.weighted(PAINT, (p) => p[1])[0];
  for (const b of bays) {
    if (b.blocked) continue;
    const p = b.staff ? 0.35 : b.kind === 'pmr' ? 0.4 : b.kind === 'ev' ? 0.5 : b.kind === 'fam' ? 0.6 : Math.max(0.1, 0.8 - Math.max(0, Math.abs(b.cx - 108) + Math.abs(b.cz) * 0.4) / 70);
    if (!rng.chance(p)) continue;
    const key = rng.pick(keys), M = CARS[key], back = Math.max(0, (b.d - M.L) / 2 - 0.25), nose = rng.chance(0.72);
    const lat = rng.range(-0.12, 0.12), x = b.cx + b.ux * back + (b.uz ? lat : 0), z = b.cz + b.uz * back + (b.ux ? lat : 0);
    put('day', b.staff ? ZS : ZL, key, x, z, Math.atan2(b.uz, b.ux) + (nose ? 0 : Math.PI) + rng.range(-0.03, 0.03), paint(), rng.range(0.85, 1));
  }
  // la nuit : la voiture du gardien et celles du personnel près de la porte de service, une camionnette de livraison dans
  // la voie de service, une voiture oubliée au fond du parking, une autre le long de la haie
  put('night', ZS, 'citadine', 73.25, 44.8, -Math.PI / 2, 0x6e1f1f, 0.8); put('night', ZS, 'berline', 78.25, 45.0, -Math.PI / 2 + 0.02, 0x8d9296);
  put('night', ZS, 'fourgon', 73.5, -50.6, 0, 0xe9eaeb, 0.9);
  put('night', ZL, 'break', 152.25, -56.1, -Math.PI / 2, 0xc9b99a, 0.72); put('night', ZL, 'suv', 167.55, 30.25, 0, 0x16181a);
  return { sets, boxes };
}

// ───────────────────────── matériaux propres ─────────────────────────
function marksMat(g) { // décalques au sol (planche des marquages) : alpha découpé, légèrement décollés du sol
  const m = new THREE.MeshStandardMaterial({ map: MARKS.tex, alphaTest: 0.4, roughness: 0.72, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.name = 'marquages_exterieur'; return patchZone(m, g.mats.zoneUniform(ZO));
}
function signsMat(g, o = {}) { // faces imprimées des panneaux (o.lit : faces lumineuses, émissives selon l'éclairage)
  const m = new THREE.MeshStandardMaterial({ map: SIGNS.tex, alphaTest: 0.5, roughness: 0.45, metalness: 0.05, vertexColors: true });
  if (o.lit) { m.emissiveMap = SIGNS.tex; m.emissive.setRGB(0, 0, 0); }
  m.name = o.lit ? 'enseignes_exterieur' : 'panneaux_exterieur'; return patchZone(m, g.mats.zoneUniform(ZO));
}
let WIRE_TEX = null;
function wireMat(g) { // treillis soudé (clôtures, portails, paniers des chariots) : fils blancs sur fond transparent, teinte par sommet
  if (!WIRE_TEX) {
    const c = canvas(64), x = c.getContext('2d'); x.clearRect(0, 0, 64, 64); x.fillStyle = '#ffffff';
    for (let i = 0; i < 64; i += 16) x.fillRect(i, 0, 4, 64); x.fillRect(0, 0, 64, 5);
    WIRE_TEX = new THREE.CanvasTexture(c); WIRE_TEX.wrapS = WIRE_TEX.wrapT = THREE.RepeatWrapping; WIRE_TEX.anisotropy = 4; WIRE_TEX.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.MeshStandardMaterial({ map: WIRE_TEX, alphaTest: 0.24, vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.3 });
  m.name = 'grillage_exterieur'; return patchZone(m, g.mats.zoneUniform(ZO));
}
function carMat(g) { // carrosseries, vitrages et pneus (couleurs par sommet), vernis légèrement métallisé
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.28 });
  m.name = 'voitures_exterieur'; return patchZone(m, g.mats.zoneUniform(ZO));
}

// ───────────────────────── construction ─────────────────────────
export function buildOutside(world) {
  const g = world.game, A = new Arch(world), rng = new RNG('helios-abords');
  markSheet(); signSheet(); SIGN_Q.length = 0; world.points.parkingCams = [];
  setupZones(world);
  const Z4 = [ZO, ZL, ZF, ZS], mk = () => Object.fromEntries(Z4.map((z) => [z, new Batch()]));
  const Q = mk(), W = mk(), TB = mk(), lit = new Batch(), pub = new Batch(), lamps = [];
  buildGround(A, Q, world);
  const bays = buildMarkings(Q, rng.fork('marquages'));
  buildTrench(A, Q, world, lamps);
  buildEastFacade(A, world);
  buildSides(A, world, lamps);
  buildYard(A, W[ZS], world);
  furnish(A, W, Q, world, rng.fork('mobilier'), lamps, bays, lit, pub, TB);
  const cars = parkCars(world, rng.fork('voitures'), bays);
  const lampGroups = buildLamps(A, world, lamps);
  // fourgon des braqueurs (nuit du braquage) : garé phares allumés sur la voie de desserte, près de la rampe
  const vanB = new Batch(), vanPos = V3(104.6, YR, -12.8), vanBox = placeCar(vanB, 'fourgon', vanPos.x, YR, vanPos.z, Math.PI / 2, 0x1c1e20, 0.85);
  world.physics.add(vanBox); vanBox.enabled = false;
  for (const sx of [-0.62, 0.62]) lensDown(vanB, vanPos.x + sx, YR + 0.85, vanPos.z + 2.61, 1, 0, 0.3, 0.1);
  A.build();
  // les sols et les bordures ne portent pas d'ombre (lampe torche)
  const flat = new Set(); for (const zn of Z4) for (const n of ['asphalt', 'paving', 'grass', 'concrete_floor', 'concrete']) flat.add(g.mats.get(n, zn));
  for (const zn of Z4) world.zone(zn).group.traverse((o) => { if (o.isMesh && flat.has(o.material)) o.castShadow = false; });
  const add = (zn, mesh) => { world.zone(zn).group.add(mesh); return mesh; };
  const mm = marksMat(g), wm = wireMat(g), cm = carMat(g);
  for (const zn of Z4) {
    if (Q[zn].count) add(zn, Q[zn].mesh(mm, { name: 'marquages' }));
    if (W[zn].count) add(zn, W[zn].mesh(wm, { name: 'grillages' }));
    if (TB[zn].count) add(zn, TB[zn].mesh(g.mats.get('furniture', zn), { name: 'arbres', cast: true }));
  }
  const SQ = {}; for (const sq of SIGN_Q) (SQ[sq.zone] ||= new Batch()).wall(sq.x, sq.y, sq.z, sq.nx, sq.nz, sq.w, sq.h, SIGNS.uv[sq.key]);
  const sgm = signsMat(g); for (const zn in SQ) add(zn, SQ[zn].mesh(sgm, { name: 'panneaux' }));
  const litMat = signsMat(g, { lit: true }), pubMat = signsMat(g, { lit: true });
  add(ZF, lit.mesh(litMat, { name: 'totem' })); add(ZO, pub.mesh(pubMat, { name: 'affiches' }));
  const carSets = [];
  for (const set of ['day', 'night']) { const meshes = []; for (const zn in cars.sets[set]) meshes.push(add(zn, cars.sets[set][zn].mesh(cm, { name: 'voitures_' + set, cast: true }))); carSets.push({ day: set === 'day', meshes, boxes: cars.boxes[set] }); }
  const vanMesh = add(ZO, vanB.mesh(cm, { name: 'fourgon', cast: true })); vanMesh.visible = false;
  const vanLight = { pos: V3(vanPos.x, YR + 1.0, vanPos.z + 4.5), color: [0.85, 0.9, 1], intensity: 2.2, distance: 12, priority: 1, zone: { min: [96, -1, -12], max: [112, 3, 4] } };
  lampMeshes(world, lampGroups);
  const city = buildCity(world);
  const ctl = new OutsideCtl(world, { groups: lampGroups.groups, cars: carSets, litMat, pubMat, city, vanMesh, vanBox, vanPos });
  world.add(ctl); ctl.setCars(true);
  g.lighting.addSource({ getLight: () => (ctl.van ? vanLight : null) });
  world.streetLamps = lamps.filter((l) => l.kind === 'lot' || l.kind === 'avenue').map((l) => ({ pos: V3(l.x, (l.y0 ?? YP) + 7.6, l.z), state: l.state, circuit: l.circuit }));
  world.offSite = (p) => p.x > FX + 0.4; // au-delà de la clôture (entrée du site) : on a quitté le centre
  world.outside = ctl;
  return ctl;
}
