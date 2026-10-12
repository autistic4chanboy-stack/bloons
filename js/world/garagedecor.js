// Habillage du parking souterrain : repères peints sur les piliers (lettre de travée + numéro de file), numéros
// de places, flèches de circulation, zone piétonne hachurée devant l'ascenseur, taches d'huile, butées de roues,
// ralentisseur, gabarit de hauteur, gaines de ventilation, chemins de câbles, sprinklers et panneaux suspendus.
// Tous les marquages partagent une seule planche de texture et un seul mesh (un appel de rendu).
import * as THREE from 'three';

const AT = 1024;
const ROW_COLORS = ['#1e5fb4', '#2e8b3e', '#e07b1a']; // files 1 (sud), 2 (centre), 3 (nord)
const COLS = 'ABCDEFGHIJ';
const PILLAR_X = [-54, -42, -30, -18, -6, 6, 18, 30, 42, 54], PILLAR_Z = [-12, 0, 12];
const SIGNS = { pietons: [0, 640], ascenseur: [512, 640], vehicules: [0, 768], hauteur: [512, 768], fumer: [0, 896], niveau: [512, 896] };
let sheet = null;

function uvRect(px, py, pw, ph) { return [px / AT, 1 - (py + ph) / AT, (px + pw) / AT, 1 - py / AT]; }
function fitFont(ctx, text, max, size, weight = 900, family = 'Arial, Helvetica, sans-serif') {
  let fs = size; ctx.font = `${weight} ${fs}px ${family}`;
  while (ctx.measureText(text).width > max && fs > 8) { fs -= 2; ctx.font = `${weight} ${fs}px ${family}`; }
}
function arrow(ctx, cx, cy, len, w, color, ang = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, -len / 2); ctx.lineTo(w, -len / 2 + w * 1.1); ctx.lineTo(w * 0.38, -len / 2 + w * 1.1); ctx.lineTo(w * 0.38, len / 2);
  ctx.lineTo(-w * 0.38, len / 2); ctx.lineTo(-w * 0.38, -len / 2 + w * 1.1); ctx.lineTo(-w, -len / 2 + w * 1.1); ctx.closePath(); ctx.fill(); ctx.restore();
}
function sign(ctx, key, draw) { const [x, y] = SIGNS[key]; ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y + 4, 504, 120); ctx.clip(); draw(x, y); ctx.restore(); }

function getSheet() {
  if (sheet) return sheet;
  const c = document.createElement('canvas'); c.width = c.height = AT; const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, AT, AT); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // repères de piliers
  for (let i = 0; i < 30; i++) {
    const x = (i % 8) * 128, y = Math.floor(i / 8) * 128, label = COLS[Math.floor(i / 3)] + (i % 3 + 1);
    fitFont(ctx, label, 112, 92); ctx.fillStyle = '#ffffff'; ctx.fillText(label, x + 64, y + 60);
    ctx.fillRect(x + 22, y + 108, 84, 6);
  }
  // flèche de circulation (cellule 30) et tache d'huile (cellule 31)
  arrow(ctx, 30 % 8 * 128 + 64, 3 * 128 + 64, 116, 34, '#f4f4f0');
  { const cx = 31 % 8 * 128 + 64, cy = 3 * 128 + 64; ctx.fillStyle = '#17120c';
    for (let k = 0; k < 9; k++) { const a = k * 2.4, r = 14 + (k * 37 % 23); ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.6, 26 - k, 18 - k * 0.8, a, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(cx, cy, 40, 28, 0.3, 0, Math.PI * 2); ctx.fill(); }
  // chiffres des places
  for (let d = 0; d < 10; d++) { fitFont(ctx, '0', 60, 112); ctx.fillStyle = '#f4f4f0'; ctx.fillText(String(d), d * 64 + 32, 512 + 66); }
  // hachures jaunes (zone piétonne)
  { const x = 640, y = 512, w = 384, h = 128; ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, w - 4, h - 4); ctx.clip();
    ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 8; ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    ctx.lineWidth = 14; for (let k = -h; k < w; k += 38) { ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); ctx.stroke(); }
    ctx.restore(); }
  // panneaux
  sign(ctx, 'pietons', (x, y) => {
    ctx.fillStyle = '#0b7a3b'; ctx.fillRect(x, y, 512, 128); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeRect(x + 10, y + 10, 492, 108);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + 62, y + 34, 11, 0, Math.PI * 2); ctx.fill(); // pictogramme « personne qui court »
    ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x + 58, y + 50); ctx.lineTo(x + 50, y + 80); ctx.lineTo(x + 34, y + 104);
    ctx.moveTo(x + 50, y + 80); ctx.lineTo(x + 72, y + 98); ctx.lineTo(x + 70, y + 112); ctx.moveTo(x + 56, y + 56); ctx.lineTo(x + 80, y + 70); ctx.moveTo(x + 56, y + 56); ctx.lineTo(x + 36, y + 64); ctx.stroke();
    fitFont(ctx, 'SORTIE PIÉTONS', 300, 46); ctx.fillText('SORTIE PIÉTONS', x + 270, y + 52); fitFont(ctx, 'Escalier Est · Galeries', 300, 26, 700); ctx.fillText('Escalier Est · Galeries', x + 270, y + 94);
    arrow(ctx, x + 466, y + 64, 84, 26, '#ffffff');
  });
  sign(ctx, 'ascenseur', (x, y) => {
    ctx.fillStyle = '#123a6e'; ctx.fillRect(x, y, 512, 128); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeRect(x + 10, y + 10, 492, 108);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.strokeRect(x + 30, y + 26, 64, 76); ctx.beginPath(); ctx.moveTo(x + 62, y + 26); ctx.lineTo(x + 62, y + 102); ctx.stroke();
    arrow(ctx, x + 46, y + 64, 34, 11, '#ffffff'); arrow(ctx, x + 78, y + 64, 34, 11, '#ffffff', Math.PI);
    ctx.fillStyle = '#ffffff'; fitFont(ctx, 'ASCENSEUR', 300, 50); ctx.fillText('ASCENSEUR', x + 280, y + 50); fitFont(ctx, 'RDC · Étage · Galeries', 300, 26, 700); ctx.fillText('RDC · Étage · Galeries', x + 280, y + 94);
  });
  sign(ctx, 'vehicules', (x, y) => {
    ctx.fillStyle = '#1d4f9c'; ctx.fillRect(x, y, 512, 128); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeRect(x + 10, y + 10, 492, 108);
    ctx.fillStyle = '#ffffff'; fitFont(ctx, 'SORTIE VÉHICULES', 360, 48); ctx.fillText('SORTIE VÉHICULES', x + 230, y + 64);
    arrow(ctx, x + 462, y + 64, 84, 26, '#ffffff');
  });
  sign(ctx, 'hauteur', (x, y) => {
    ctx.fillStyle = '#f5c518'; ctx.fillRect(x, y, 512, 128);
    ctx.fillStyle = '#111111'; for (let k = 0; k < 512; k += 64) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k + 32, y); ctx.lineTo(x + k + 12, y + 18); ctx.lineTo(x + k - 20, y + 18); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + k, y + 110); ctx.lineTo(x + k + 32, y + 110); ctx.lineTo(x + k + 12, y + 128); ctx.lineTo(x + k - 20, y + 128); ctx.fill(); }
    fitFont(ctx, 'HAUTEUR LIMITÉE 2,10 m', 470, 50); ctx.fillText('HAUTEUR LIMITÉE 2,10 m', x + 256, y + 64);
  });
  sign(ctx, 'fumer', (x, y) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 512, 128);
    ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(x + 66, y + 64, 44, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#333333'; ctx.fillRect(x + 34, y + 58, 52, 12); ctx.fillStyle = '#e57c2a'; ctx.fillRect(x + 86, y + 58, 10, 12);
    ctx.beginPath(); ctx.moveTo(x + 36, y + 34); ctx.lineTo(x + 96, y + 94); ctx.stroke();
    ctx.fillStyle = '#d32f2f'; fitFont(ctx, 'DÉFENSE DE FUMER', 360, 44); ctx.fillText('DÉFENSE DE FUMER', x + 300, y + 50);
    ctx.fillStyle = '#333333'; fitFont(ctx, 'Moteur à l\'arrêt — Parking -1', 360, 24, 700); ctx.fillText('Moteur à l\'arrêt — Parking -1', x + 300, y + 94);
  });
  sign(ctx, 'niveau', (x, y) => {
    ctx.fillStyle = '#123a6e'; ctx.fillRect(x, y, 128, 128); ctx.fillStyle = '#ffffff'; fitFont(ctx, 'P', 100, 104); ctx.fillText('P', x + 64, y + 68);
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x + 128, y, 384, 128);
    ctx.fillStyle = '#123a6e'; fitFont(ctx, 'NIVEAU -1', 340, 66); ctx.fillText('NIVEAU -1', x + 320, y + 64);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, roughness: 0.85, metalness: 0 });
  mat.name = 'marquages_parking';
  sheet = { tex, mat };
  return sheet;
}

class QuadBatch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  // c : centre, r / u : demi-vecteurs « droite » et « haut », n : normale
  push(c, r, u, n, uv) {
    const b = this.pos.length / 3;
    const C = [[-1, -1, uv[0], uv[1]], [1, -1, uv[2], uv[1]], [1, 1, uv[2], uv[3]], [-1, 1, uv[0], uv[3]]];
    for (const [a, e, tu, tv] of C) { this.pos.push(c[0] + r[0] * a + u[0] * e, c[1] + r[1] * a + u[1] * e, c[2] + r[2] * a + u[2] * e); this.nor.push(n[0], n[1], n[2]); this.uv.push(tu, tv); }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  wall(x, y, z, nx, nz, w, h, uv) { this.push([x, y, z], [nz * w / 2, 0, -nx * w / 2], [0, h / 2, 0], [nx, 0, nz], uv); }
  floor(x, y, z, ux, uz, w, h, uv) { this.push([x, y, z], [-uz * w / 2, 0, ux * w / 2], [ux * h / 2, 0, uz * h / 2], [0, 1, 0], uv); }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.updateMatrix(); m.receiveShadow = true;
    return m;
  }
}

export function buildGarageDecor(world, A, dev, rng) {
  const zn = 'garage', yb = -4.5, yc = -0.6;
  const Q = new QuadBatch();
  // ── piliers : bande de couleur de la file + repère sur les quatre faces ──
  PILLAR_X.forEach((x, i) => PILLAR_Z.forEach((z, j) => {
    const col = parseInt(ROW_COLORS[j].slice(1), 16);
    A.furn(zn, x - 0.357, yb + 1.7, z - 0.357, x + 0.357, yb + 2.6, z + 0.357, col, { collide: false });
    const k = i * 3 + j, uv = uvRect((k % 8) * 128, Math.floor(k / 8) * 128, 128, 128);
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) Q.wall(x + nx * 0.362, yb + 2.15, z + nz * 0.362, nx, nz, 0.62, 0.62, uv);
  }));
  // extincteurs sur quelques piliers (face côté allée)
  dev('extinguisher_box', zn, -6, yb + 1.0, 12.49, 0); dev('extinguisher_box', zn, 30, yb + 1.0, -12.49, Math.PI);
  // ── numéros de places (files 1xx à 4xx), taches d'huile et butées de roues ──
  const rows = [{ z0: -23.5, z1: -18.5, n: 100, num: -19.2, u: -1, wall: true }, { z0: -11.5, z1: -6.5, n: 200, num: -7.2, u: -1 }, { z0: 6.5, z1: 11.5, n: 300, num: 7.2, u: 1 }, { z0: 18.5, z1: 23.5, n: 400, num: 19.2, u: 1, wall: true }];
  const stainUV = uvRect(31 % 8 * 128, 3 * 128, 128, 128);
  for (const r of rows) {
    for (let s = 0; s < 40; s++) {
      const x = -58.5 + s * 3, label = String(r.n + s + 1);
      // chiffres lus depuis l'allée : de gauche à droite pour un lecteur tourné vers le fond de la place
      const right = -r.u; // axe x du lecteur
      for (let d = 0; d < 3; d++) Q.floor(x + right * (d - 1) * 0.19, yb + 0.007, r.num, 0, r.u, 0.18, 0.36, uvRect(+label[d] * 64, 512, 64, 128));
      if (rng.chance(0.28)) { const zc = (r.z0 + r.z1) / 2 + rng.range(-0.8, 0.8), a = rng.range(0, Math.PI * 2), sz = rng.range(0.6, 1.3); Q.floor(x + rng.range(-0.5, 0.5), yb + 0.003, zc, Math.sin(a), Math.cos(a), sz, sz * 0.8, stainUV); }
      if (r.wall) { const zw = r.u < 0 ? -23.0 : 23.0; A.furn(zn, x - 0.75, yb, zw - 0.09, x + 0.75, yb + 0.11, zw + 0.09, 0x8e8c86, { collide: false }); A.furn(zn, x - 0.6, yb + 0.11, zw - 0.091, x - 0.3, yb + 0.112, zw + 0.091, 0xd4a017, { collide: false }); A.furn(zn, x + 0.3, yb + 0.11, zw - 0.091, x + 0.6, yb + 0.112, zw + 0.091, 0xd4a017, { collide: false }); }
    }
  }
  // ── flèches de circulation : on entre par l'allée centrale (vers l'ouest), on ressort par les allées latérales (vers l'est) ──
  const arrowUV = uvRect(30 % 8 * 128, 3 * 128, 128, 128);
  for (let x = -48; x <= 48; x += 24) { Q.floor(x, yb + 0.007, 15, 1, 0, 1.0, 2.0, arrowUV); Q.floor(x + 12, yb + 0.007, -15, 1, 0, 1.0, 2.0, arrowUV); }
  for (const x of [-30, 0, 30]) { Q.floor(x + 3, yb + 0.007, 3.4, -1, 0, 1.0, 2.0, arrowUV); Q.floor(x - 3, yb + 0.007, -3.4, -1, 0, 1.0, 2.0, arrowUV); }
  Q.floor(61, yb + 0.007, -3.2, -1, 0, 1.0, 2.0, arrowUV); // depuis la rampe
  // zone piétonne hachurée devant l'ascenseur et devant l'escalier est
  Q.floor(-54, yb + 0.007, 5.0, 0, -1, 5.2, 1.7, uvRect(640, 512, 384, 128));
  Q.floor(64.3, yb + 0.007, 9.25, -1, 0, 3.4, 2.4, uvRect(640, 512, 384, 128));
  // ── ralentisseur à l'arrivée de la rampe ──
  for (let k = 0; k < 12; k++) A.furn(zn, 58.2, yb, -6.4 + k * 0.5, 58.8, yb + 0.05, -5.9 + k * 0.5, k % 2 ? 0x1c1c1c : 0xf2c230, { collide: false });
  // ── gabarit de hauteur suspendu (2,10 m) au pied de la rampe ──
  for (let k = 0; k < 10; k++) A.furn(zn, 64.4, yb + 2.1, -7 + k * 0.5, 64.56, yb + 2.26, -6.5 + k * 0.5, k % 2 ? 0xe8e8e8 : 0xd32f2f, { collide: false });
  for (const z of [-6.6, -2.4]) A.furn(zn, 64.46, yb + 2.26, z - 0.015, 64.5, yc, z + 0.015, 0x2a2a2a, { collide: false, metal: true });
  const hUV = uvRect(SIGNS.hauteur[0], SIGNS.hauteur[1], 512, 128);
  Q.wall(64.565, yb + 2.5, -4.5, 1, 0, 1.6, 0.4, hUV); Q.wall(64.395, yb + 2.5, -4.5, -1, 0, 1.6, 0.4, hUV);
  A.furn(zn, 64.4, yb + 2.3, -5.3, 64.56, yb + 2.7, -3.7, 0x2a2a2a, { collide: false });
  // ── panneaux suspendus (deux faces) ──
  const hang = (x, z, key, alongX = true) => {
    const [px, py] = SIGNS[key]; const uv = uvRect(px, py, 512, 128); const y = yc - 0.75, w = 1.6, h = 0.4;
    if (alongX) { A.furn(zn, x - w / 2 - 0.02, y - h / 2 - 0.02, z - 0.025, x + w / 2 + 0.02, y + h / 2 + 0.02, z + 0.025, 0x2a2a2a, { collide: false }); Q.wall(x, y, z + 0.027, 0, 1, w, h, uv); Q.wall(x, y, z - 0.027, 0, -1, w, h, uv); }
    else { A.furn(zn, x - 0.025, y - h / 2 - 0.02, z - w / 2 - 0.02, x + 0.025, y + h / 2 + 0.02, z + w / 2 + 0.02, 0x2a2a2a, { collide: false }); Q.wall(x + 0.027, y, z, 1, 0, w, h, uv); Q.wall(x - 0.027, y, z, -1, 0, w, h, uv); }
    for (const d of [-w * 0.35, w * 0.35]) A.furn(zn, (alongX ? x + d : x) - 0.01, y + h / 2 + 0.02, (alongX ? z : z + d) - 0.01, (alongX ? x + d : x) + 0.01, yc, (alongX ? z : z + d) + 0.01, 0x2a2a2a, { collide: false, metal: true });
  };
  // en travers des allées (lisibles dans le sens de la marche), au-dessus de l'ascenseur, vers la rampe
  hang(42, 16.6, 'pietons', false); hang(42, -16.6, 'pietons', false); hang(-30, 16.6, 'ascenseur', false); hang(-30, -16.6, 'ascenseur', false);
  hang(-54, 5.2, 'ascenseur'); hang(56, -4.5, 'vehicules', false); hang(12, 16.6, 'vehicules', false); hang(12, -16.6, 'vehicules', false);
  // panneaux muraux
  const fUV = uvRect(SIGNS.fumer[0], SIGNS.fumer[1], 512, 128), nUV = uvRect(SIGNS.niveau[0], SIGNS.niveau[1], 512, 128);
  for (const x of [-36, 12, 48]) { Q.wall(x, yb + 1.9, -23.99, 0, 1, 1.4, 0.35, fUV); Q.wall(x - 12, yb + 1.9, 23.99, 0, -1, 1.4, 0.35, fUV); }
  Q.wall(65.99, yb + 2.6, 11.4, -1, 0, 1.6, 0.4, nUV); Q.wall(-65.99, yb + 2.6, 4.4, 1, 0, 1.6, 0.4, nUV);
  // ── plafond : gaine de ventilation, chemin de câbles, sprinklers ──
  A.box(zn, 'aluminium', -64, yc - 0.55, 14.6, 64, yc - 0.05, 15.4, { collide: false });
  for (let x = -63; x <= 63; x += 3) {
    A.box(zn, 'steel_dark', x - 0.02, yc - 0.6, 14.5, x + 0.02, yc, 14.54, { collide: false }); A.box(zn, 'steel_dark', x - 0.02, yc - 0.6, 15.46, x + 0.02, yc, 15.5, { collide: false });
    A.box(zn, 'steel_dark', x - 0.03, yc - 0.62, 14.5, x + 0.03, yc - 0.56, 15.5, { collide: false });
  }
  for (const x of [-48, -24, 0, 24, 48]) { A.box(zn, 'aluminium', x - 0.3, yc - 0.62, 15.4, x + 0.3, yc - 0.22, 15.42, { collide: false }); A.box(zn, 'steel_dark', x - 0.26, yc - 0.58, 15.42, x + 0.26, yc - 0.26, 15.43, { collide: false }); } // grilles de soufflage
  // chemin de câbles le long du mur sud, au-dessus des voitures
  const ZT = -21.5;
  A.box(zn, 'steel_dark', -64, yc - 0.34, ZT - 0.2, 64, yc - 0.3, ZT + 0.2, { collide: false });
  A.box(zn, 'steel_dark', -64, yc - 0.3, ZT - 0.2, 64, yc - 0.24, ZT - 0.18, { collide: false }); A.box(zn, 'steel_dark', -64, yc - 0.3, ZT + 0.18, 64, yc - 0.24, ZT + 0.2, { collide: false });
  for (const [dz, col] of [[-0.1, 0x1a1a1a], [0, 0x3a3a3a], [0.1, 0x1f3a5a]]) A.furn(zn, -64, yc - 0.3, ZT + dz - 0.025, 64, yc - 0.27, ZT + dz + 0.025, col, { collide: false });
  for (let x = -63; x <= 63; x += 4) A.box(zn, 'steel_dark', x - 0.015, yc - 0.34, ZT - 0.01, x + 0.015, yc, ZT + 0.01, { collide: false });
  const red = 0xb3261e, Y = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2), one = new THREE.Vector3(1, 1, 1);
  const pipe = new THREE.CylinderGeometry(0.045, 0.045, 128, 8, 1, true), head = new THREE.CylinderGeometry(0.02, 0.03, 0.08, 6);
  for (const z of [-9, 9]) {
    A.shape(zn, 'furniture_metal', pipe, new THREE.Matrix4().compose(new THREE.Vector3(0, yc - 0.18, z), q, one), red);
    for (let x = -63; x <= 63; x += 3) {
      A.shape(zn, 'furniture_metal', head, new THREE.Matrix4().makeTranslation(x, yc - 0.26, z), 0xc9a227);
      if (x % 6 === 0) A.box(zn, 'steel_dark', x - 0.01, yc - 0.18, z - 0.01, x + 0.01, yc, z + 0.01, { collide: false });
    }
  }
  pipe.dispose(); head.dispose();
  const mesh = Q.mesh(getSheet().mat);
  world.zone(zn).group.add(mesh);
}
