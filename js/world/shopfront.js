// Détails de façade des boutiques : portiques antivol (ils sonnent si l'on franchit l'entrée avec un article du
// magasin, et le bruit attire ce qui rôde), autocollants de vitrine (promotions, horaires, moyens de paiement,
// vidéoprotection). Les autocollants sont des enfants des vitres : ils disparaissent avec elles si on les brise.
import * as THREE from 'three';
import { WorldObject } from './world.js';
import { Box, LAYER } from '../engine/physics.js';
import { canvas, toTexture } from '../engine/textures.js';

// Boutiques équipées de portiques (commerce de détail ; pas les restaurants, le coiffeur, le cinéma…)
const GATED = new Set(['hyper', 'pharma', 'quincaillerie', 'animalerie', 'jouets', 'electro', 'pixel', 'videoclub', 'librairie', 'mobizone',
  'opticien', 'parfumerie', 'mode', 'chaussures', 'sport', 'instruments', 'costumes', 'photo', 'deco', 'octet']);
const FOOD = new Set(['cafe', 'boulangerie', 'pizzeria', 'burger', 'sushi', 'glacier']);

// ── Planche d'autocollants (une seule texture pour tout le centre) ──
const AW = 2048, AH = 1024, SW = 512, SH = 256;
const PROMOS = { soldes: 0, collection: 1, second: 2, black: 3, cadeaux: 4, fidelite: 5, titres: 6, emporter: 7, wifi: 8, coiffeur: 9, opticien: 10, pharma: 11, arcade: 12, cinema: 13 };
const HOURS = { std: [14, 0], late: [14, 1], early: [15, 0], salon: [15, 1] };
const RETAIL_PROMOS = ['soldes', 'collection', 'second', 'black', 'cadeaux', 'fidelite'];
const SPECIAL = { coiffeur: 'coiffeur', opticien: 'opticien', pharma: 'pharma', arcade: 'arcade', cinema: 'cinema' };
let sheet = null;

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fit(ctx, text, max, size, weight = 700, family = 'Arial, Helvetica, sans-serif', style = '') {
  let fs = size; ctx.font = `${style}${weight} ${fs}px ${family}`;
  while (ctx.measureText(text).width > max && fs > 10) { fs -= 2; ctx.font = `${style}${weight} ${fs}px ${family}`; }
  return fs;
}
function txt(ctx, text, x, y, max, size, color, o = {}) {
  fit(ctx, text, max, size, o.weight ?? 700, o.family, o.style || '');
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  if (o.stroke) { ctx.lineWidth = o.lw || 6; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); }
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function snowflake(ctx, x, y, r) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r);
    ctx.moveTo(0, -r * 0.55); ctx.lineTo(-r * 0.25, -r * 0.75); ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.25, -r * 0.75); ctx.stroke();
  }
  ctx.restore();
}
function cbLogos(ctx, x, y, s) {
  // « CB » (bleu/vert) et « VISA » génériques, plus « sans contact »
  ctx.fillStyle = '#ffffff'; rr(ctx, x, y, 46 * s, 30 * s, 4 * s); ctx.fill();
  const gr = ctx.createLinearGradient(x, y, x + 46 * s, y + 30 * s); gr.addColorStop(0, '#1f5fa8'); gr.addColorStop(1, '#2e9b4f');
  ctx.fillStyle = gr; rr(ctx, x + 2 * s, y + 2 * s, 42 * s, 26 * s, 3 * s); ctx.fill();
  txt(ctx, 'CB', x + 23 * s, y + 15.5 * s, 38 * s, 19 * s, '#ffffff', { weight: 900 });
  ctx.fillStyle = '#ffffff'; rr(ctx, x + 52 * s, y, 46 * s, 30 * s, 4 * s); ctx.fill();
  txt(ctx, 'VISA', x + 75 * s, y + 15.5 * s, 40 * s, 16 * s, '#1a2b88', { weight: 900, style: 'italic ' });
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4 * s; ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + 106 * s, y + 15 * s, (5 + k * 5) * s, -0.75, 0.75); ctx.stroke(); }
}
function camIcon(ctx, x, y, s, color = '#ffffff') {
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2 * s;
  ctx.save(); ctx.translate(x, y); ctx.rotate(0.35); rr(ctx, -12 * s, -6 * s, 24 * s, 12 * s, 2 * s); ctx.fill();
  ctx.beginPath(); ctx.moveTo(12 * s, -4 * s); ctx.lineTo(18 * s, -7 * s); ctx.lineTo(18 * s, 7 * s); ctx.lineTo(12 * s, 4 * s); ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.moveTo(x - 10 * s, y + 4 * s); ctx.lineTo(x - 14 * s, y + 14 * s); ctx.lineTo(x - 22 * s, y + 14 * s); ctx.stroke();
}

function drawPromo(ctx, key, X, Y) {
  const W = SW, H = SH, cx = X + W / 2, cy = Y + H / 2;
  ctx.save(); ctx.beginPath(); ctx.rect(X + 6, Y + 6, W - 12, H - 12); ctx.clip();
  // affiche imprimée collée derrière la vitre (fond plein : lisible même devant un intérieur éclairé)
  const bg = { collection: '#141414', second: '#c8141c', cadeaux: '#7a1420', fidelite: '#0f3d7a', emporter: '#2a2420', wifi: '#18283a', coiffeur: '#26161e', opticien: '#10223a', pharma: '#12884a', arcade: '#1a0830', cinema: '#5a0f16' }[key];
  if (bg) { ctx.fillStyle = bg; rr(ctx, X + 12, Y + 12, W - 24, H - 24, 18); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; rr(ctx, X + 22, Y + 22, W - 44, H - 44, 12); ctx.stroke(); }
  switch (key) {
    case 'soldes':
      txt(ctx, 'SOLDES', cx, Y + 92, W - 50, 120, '#e3141b', { stroke: '#ffffff', lw: 10, weight: 900 });
      ctx.fillStyle = '#e3141b'; rr(ctx, cx - 150, Y + 160, 300, 74, 14); ctx.fill();
      txt(ctx, 'jusqu\'à -30 %', cx, Y + 198, 270, 50, '#ffffff', { weight: 800 });
      break;
    case 'collection':
      txt(ctx, 'NOUVELLE', cx, Y + 70, W - 70, 70, '#ffffff', { weight: 400, family: 'Georgia, serif' });
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 150, Y + 118, 300, 4);
      txt(ctx, 'COLLECTION', cx, Y + 164, W - 60, 62, '#ffffff', { weight: 400, family: 'Georgia, serif' });
      txt(ctx, 'automne · hiver', cx, Y + 220, W - 120, 32, '#ffffff', { weight: 400, family: 'Georgia, serif', style: 'italic ' });
      break;
    case 'second':
      ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.arc(X + 128, cy, 92, 0, Math.PI * 2); ctx.fill();
      txt(ctx, '-50%', X + 128, cy - 4, 160, 72, '#c8141c', { weight: 900 });
      txt(ctx, 'sur le', X + 360, Y + 70, 250, 44, '#ffffff', { weight: 700 });
      txt(ctx, '2e article*', X + 360, Y + 130, 260, 56, '#ffffff', { weight: 900 });
      txt(ctx, '*le moins cher des deux', X + 360, Y + 196, 250, 22, '#ffffff', { weight: 400 });
      break;
    case 'black':
      ctx.fillStyle = '#0c0c0c'; rr(ctx, X + 16, Y + 22, W - 32, H - 44, 10); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; rr(ctx, X + 26, Y + 32, W - 52, H - 64, 6); ctx.stroke();
      txt(ctx, 'BLACK FRIDAY', cx, Y + 104, W - 90, 66, '#ffffff', { weight: 900 });
      txt(ctx, 'jusqu\'à -40 %', cx, Y + 172, W - 140, 44, '#ff2a2a', { weight: 800 });
      break;
    case 'cadeaux':
      for (const [sx, sy, r] of [[X + 54, Y + 60, 30], [X + 460, Y + 70, 24], [X + 90, Y + 200, 18], [X + 430, Y + 196, 32], [X + 250, Y + 32, 14]]) snowflake(ctx, sx, sy, r);
      txt(ctx, 'Idées cadeaux', cx, cy - 8, W - 140, 74, '#f2c94c', { weight: 700, family: 'Georgia, serif', style: 'italic ' });
      txt(ctx, 'emballage offert', cx, cy + 62, W - 200, 30, '#ffffff', { weight: 400 });
      break;
    case 'fidelite':
      ctx.fillStyle = '#ffffff'; rr(ctx, X + 30, Y + 58, 170, 108, 12); ctx.fill();
      ctx.fillStyle = '#1d6fd6'; rr(ctx, X + 36, Y + 64, 158, 96, 9); ctx.fill();
      ctx.fillStyle = '#f2c94c'; rr(ctx, X + 52, Y + 92, 34, 26, 4); ctx.fill();
      txt(ctx, 'HÉLIOS', X + 130, Y + 140, 100, 22, '#ffffff', { weight: 900 });
      txt(ctx, 'Demandez votre', X + 356, Y + 84, 270, 34, '#ffffff', { weight: 400 });
      txt(ctx, 'CARTE FIDÉLITÉ', X + 356, Y + 132, 280, 44, '#ffffff', { weight: 900 });
      txt(ctx, '1 achat = des points', X + 356, Y + 182, 270, 26, '#ffffff', { weight: 400 });
      break;
    case 'titres':
      ctx.fillStyle = '#ffffff'; rr(ctx, X + 30, Y + 40, W - 60, H - 80, 22); ctx.fill();
      ctx.fillStyle = '#e63b2e'; rr(ctx, X + 40, Y + 50, 120, H - 100, 16); ctx.fill();
      txt(ctx, 'TR', X + 100, cy, 100, 72, '#ffffff', { weight: 900 });
      txt(ctx, 'TITRES-RESTAURANT', X + 320, cy - 26, 300, 36, '#e63b2e', { weight: 900 });
      txt(ctx, 'ACCEPTÉS', X + 320, cy + 26, 300, 44, '#222222', { weight: 900 });
      break;
    case 'emporter':
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(X + 50, Y + 80); ctx.lineTo(X + 66, Y + 190); ctx.lineTo(X + 136, Y + 190); ctx.lineTo(X + 152, Y + 80); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X + 44, Y + 80); ctx.lineTo(X + 158, Y + 80); ctx.stroke();
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(X + 76 + k * 24, Y + 66); ctx.bezierCurveTo(X + 66 + k * 24, Y + 50, X + 90 + k * 24, Y + 40, X + 80 + k * 24, Y + 24); ctx.stroke(); }
      txt(ctx, 'SUR PLACE', X + 340, Y + 82, 300, 50, '#ffffff', { weight: 900 });
      txt(ctx, 'ou', X + 340, Y + 128, 300, 32, '#ffffff', { weight: 400, style: 'italic ' });
      txt(ctx, 'À EMPORTER', X + 340, Y + 174, 300, 50, '#ffffff', { weight: 900 });
      break;
    case 'wifi':
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12; ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(X + 120, Y + 180, 34 + k * 34, -Math.PI * 0.78, -Math.PI * 0.22); ctx.stroke(); }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X + 120, Y + 180, 12, 0, Math.PI * 2); ctx.fill();
      txt(ctx, 'WI-FI', X + 360, Y + 100, 260, 70, '#ffffff', { weight: 900 });
      txt(ctx, 'GRATUIT', X + 360, Y + 168, 260, 50, '#ffffff', { weight: 400 });
      break;
    case 'coiffeur': {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(X + 70, cy + s * 44, 24, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X + 90, cy + s * 32); ctx.lineTo(X + 190, cy - s * 30); ctx.stroke(); }
      txt(ctx, 'AVEC OU SANS', X + 350, Y + 96, 290, 46, '#ffffff', { weight: 700 });
      txt(ctx, 'RENDEZ-VOUS', X + 350, Y + 156, 290, 54, '#ffffff', { weight: 900 });
      break;
    }
    case 'opticien':
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8;
      for (const ox of [X + 70, X + 170]) { rr(ctx, ox - 40, cy - 28, 80, 56, 22); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(X + 110, cy - 8); ctx.quadraticCurveTo(X + 120, cy - 20, X + 130, cy - 8); ctx.stroke();
      txt(ctx, '2e PAIRE', X + 370, Y + 100, 250, 56, '#ffffff', { weight: 900 });
      txt(ctx, 'OFFERTE', X + 370, Y + 162, 250, 50, '#3fd07a', { weight: 900 });
      break;
    case 'pharma':
      ctx.fillStyle = '#ffffff'; for (const [w, h] of [[50, 150], [150, 50]]) ctx.fillRect(X + 120 - w / 2, cy - h / 2, w, h);
      txt(ctx, 'PARAPHARMACIE', X + 360, Y + 96, 260, 38, '#ffffff', { weight: 800 });
      txt(ctx, '-20 %', X + 360, Y + 160, 260, 70, '#fff36a', { weight: 900 });
      break;
    case 'arcade':
      ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 0;
      txt(ctx, 'NOUVEAUX JEUX', cx, Y + 92, W - 60, 64, '#ff4fd8', { weight: 900, stroke: '#ffffff', lw: 4 });
      txt(ctx, 'tournoi le samedi', cx, Y + 170, W - 100, 46, '#3ff0ff', { weight: 700, style: 'italic ' });
      break;
    case 'cinema':
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; rr(ctx, X + 30, cy - 50, 170, 100, 10); ctx.stroke();
      ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(X + 150, cy - 46); ctx.lineTo(X + 150, cy + 46); ctx.stroke(); ctx.setLineDash([]);
      txt(ctx, 'CINÉ', X + 90, cy, 100, 36, '#ffffff', { weight: 900 });
      txt(ctx, 'MERCREDI', X + 360, Y + 84, 260, 50, '#ffffff', { weight: 900 });
      txt(ctx, 'tarif réduit', X + 360, Y + 138, 260, 38, '#ffffff', { weight: 400, style: 'italic ' });
      txt(ctx, '6,50 €', X + 360, Y + 190, 260, 48, '#ffd400', { weight: 900 });
      break;
  }
  ctx.restore();
}

function drawHours(ctx, key, X, Y) {
  const S = 256, cx = X + S / 2;
  ctx.save(); ctx.beginPath(); ctx.rect(X + 4, Y + 4, S - 8, S - 8); ctx.clip();
  ctx.fillStyle = '#17191d'; rr(ctx, X + 8, Y + 8, S - 16, S - 16, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; rr(ctx, X + 13, Y + 13, S - 26, S - 26, 9); ctx.stroke();
  txt(ctx, 'HORAIRES D\'OUVERTURE', cx, Y + 26, S - 30, 19, '#ffffff', { weight: 800 });
  ctx.fillStyle = '#ffffff'; ctx.fillRect(X + 24, Y + 42, S - 48, 2);
  const rows = {
    std: [['Lundi – Samedi', ''], ['9h30 – 20h00', ''], ['Dimanche', 'fermé']],
    late: [['7 jours sur 7', ''], ['10h00 – 22h00', ''], ['Service continu', '']],
    early: [['Lundi – Samedi', ''], ['9h00 – 19h30', ''], ['Dimanche', '10h – 13h']],
    salon: [['Mardi – Samedi', ''], ['9h00 – 19h00', ''], ['Dim. et lundi', 'fermé']],
  }[key];
  let yy = Y + 66;
  for (const [a, b] of rows) {
    if (b) { txt(ctx, a, X + 26, yy, 120, 20, '#ffffff', { weight: 400, align: 'left' }); txt(ctx, b, X + S - 26, yy, 100, 20, '#ffffff', { weight: 700, align: 'right' }); }
    else txt(ctx, a, cx, yy, S - 40, a.match(/\d/) ? 30 : 20, '#ffffff', { weight: a.match(/\d/) ? 800 : 400 });
    yy += a.match(/\d/) ? 36 : 30;
  }
  cbLogos(ctx, X + 26, Y + 172, 1);
  camIcon(ctx, X + S - 48, Y + 186, 0.9);
  txt(ctx, 'Établissement sous vidéoprotection', cx, Y + 232, S - 30, 13, '#ffffff', { weight: 400 });
  ctx.restore();
}

function getSheet() {
  if (sheet) return sheet;
  const c = canvas(AW, AH), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, AW, AH);
  for (const k in PROMOS) { const i = PROMOS[k]; drawPromo(ctx, k, (i % 4) * SW, Math.floor(i / 4) * SH); }
  for (const k in HOURS) { const [i, h] = HOURS[k]; drawHours(ctx, k, (i % 4) * SW + h * 256, Math.floor(i / 4) * SH); }
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, roughness: 0.45, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'vitrophanie';
  sheet = { tex, mat };
  return sheet;
}
function rect(px, py, pw, ph) { return [px / AW, 1 - (py + ph) / AH, (px + pw) / AW, 1 - py / AH]; }
function promoRect(key) { const i = PROMOS[key]; return rect((i % 4) * SW, Math.floor(i / 4) * SH, SW, SH); }
function hoursRect(key) { const [i, h] = HOURS[key]; return rect((i % 4) * SW + h * 256, Math.floor(i / 4) * SH, 256, 256); }

// Autocollant posé sur une vitre (enfant du mesh de la vitre)
function sticker(pane, uv, w, h, dx, yWorld, sg) {
  const geo = new THREE.PlaneGeometry(w, h);
  const a = geo.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  const m = new THREE.Mesh(geo, getSheet().mat);
  m.position.set(dx, yWorld - pane.mesh.position.y, -sg * 0.012);
  m.rotation.y = sg > 0 ? Math.PI : 0;
  m.castShadow = false; m.receiveShadow = false;
  pane.mesh.add(m);
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Portique antivol : chaque client surveille son propre joueur ; l'hôte fait sonner (état répliqué).
export class TheftGate extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'theftgate');
    this.o = o; this.zone = o.zone; this.name = 'Portique antivol — ' + o.name;
    this.init({ ring: 0 });
    this.active = true;
    this.center = new THREE.Vector3((o.x0 + o.x1) / 2, o.y + 1.2, o.z);
    this.ringT = 0; this.beepAcc = 0; this._side = 0; this._lastZ = null; this._sent = -99; this._lit = -1;
    this.led = o.led; // matériau des bandeaux lumineux
  }
  onState(patch, isReset) {
    if (isReset) { this.ringT = 0; return; }
    if (patch.ring) { this.ringT = 3.4; this.beepAcc = 0; }
  }
  interact(verb, actor) {
    if (verb !== 'trip') return;
    const g = this.world.game;
    if (!g.power.zoneOn(this.o.zone)) return;
    if (g.time - (this._last ?? -99) < 3) return;
    this._last = g.time;
    this.set({ ring: (this.state.ring || 0) + 1 });
    g.noise(this.center, 0.75, 'alarm');
    g.hooks.emit('theft_gate', { shop: this.o.shop, actor });
  }
  carriesShopItem(p) {
    const g = this.world.game, shop = this.o.shop;
    for (const id of p.inv.ids()) { const z = g.props.get(id)?.home?.zone; if (z && (z === shop || z === shop + '_back')) return true; }
    return false;
  }
  update(dt) {
    const g = this.world.game; const on = g.power.zoneOn(this.o.zone);
    // sonnerie : bips aigus en rafale + bandeau rouge clignotant
    let lit = on ? 0.18 : 0;
    if (this.ringT > 0) {
      this.ringT -= dt;
      if (on) {
        this.beepAcc -= dt;
        if (this.beepAcc <= 0) { this.beepAcc += 0.21; g.sfx('beep', this.center, { pitch: 2.15, volume: 0.9 }); }
        lit = (this.ringT * 4.8) % 1 < 0.55 ? 1 : 0.25;
      }
    }
    if (lit !== this._lit) { this._lit = lit; if (this.led) this.led.color.setRGB(0.1 + 2.2 * lit, 0.04 + 0.12 * lit, 0.04 + 0.1 * lit); }
    // franchissement par le joueur local, avec un article du magasin
    const p = g.player; if (!p || !p.alive || !on) { this._lastZ = null; return; }
    const P = p.body.pos, o = this.o;
    if (P[0] < o.x0 - 0.3 || P[0] > o.x1 + 0.3 || P[1] < o.y - 0.6 || P[1] > o.y + 2) { this._lastZ = null; return; }
    const side = (P[2] - o.z) * o.sg > 0 ? 1 : -1;
    if (this._lastZ !== null && side !== this._side && Math.abs(P[2] - o.z) < 1.5 && Math.abs(this._lastZ - o.z) < 1.5 && g.time - this._sent > 3 && this.carriesShopItem(p)) {
      this._sent = g.time;
      g.sim.do('interact', { id: this.id, verb: 'trip' });
      if (!g._gateToast) { g._gateToast = true; g.toast('Le portique antivol sonne… tout le centre l\'a entendu.', 4); }
    }
    this._side = side; this._lastZ = P[2];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Construit les détails de façade d'une boutique à vitrine (appelé par shopbuilder après les vitres).
export function buildShopFront(world, A, ctl, s, rng, ex0, ex1) {
  const id = s.id, sg = ctl.sg, y = ctl.y, zF = ctl.zF;
  const panes = ctl.glass.filter(gp => gp.o.y0 < y + 0.5 && Math.abs(gp.o.z0 - zF) < 0.01);
  if (!panes.length) return;
  // ── autocollants ──
  const doorPane = panes.reduce((best, gp) => { const d = Math.min(Math.abs(gp.o.x1 - ex0), Math.abs(gp.o.x0 - ex1)); return !best || d < best.d ? { gp, d } : best; }, null).gp;
  const hk = s.layout === 'food' || s.layout === 'cinema' || s.layout === 'arcade' ? 'late' : s.id === 'coiffeur' ? 'salon' : s.id === 'pharma' || s.id === 'boulangerie' || s.id === 'tabac' ? 'early' : 'std';
  const nearLeft = Math.abs(doorPane.o.x1 - ex0) < Math.abs(doorPane.o.x0 - ex1); // vitre à gauche de l'entrée (x croissant)
  const pcx = (doorPane.o.x0 + doorPane.o.x1) / 2, pw = doorPane.o.x1 - doorPane.o.x0;
  const hx = (nearLeft ? doorPane.o.x1 - 0.36 : doorPane.o.x0 + 0.36) - pcx;
  if (pw > 0.9) sticker(doorPane, hoursRect(hk), 0.42, 0.42, hx, y + 1.42, sg);
  const others = panes.filter(gp => gp !== doorPane && gp.o.x1 - gp.o.x0 > 1.6);
  const key = SPECIAL[s.id] || (FOOD.has(s.id) ? rng.pick(['titres', 'emporter', 'wifi']) : rng.pick(RETAIL_PROMOS));
  const promoPane = others.length ? others[rng.int(0, others.length - 1)] : (pw > 2 ? doorPane : null);
  if (promoPane) {
    const w = Math.min(1.5, promoPane.o.x1 - promoPane.o.x0 - 0.3);
    const off = promoPane === doorPane ? -hx * 0.6 : rng.range(-0.15, 0.15);
    sticker(promoPane, promoRect(key), w, w / 2, off, y + 2.05, sg);
  }
  if (FOOD.has(s.id) && others.length > 1) { // deuxième autocollant pour les restaurants
    const p2 = others.find(gp => gp !== promoPane); const k2 = key === 'titres' ? 'wifi' : 'titres';
    if (p2) sticker(p2, promoRect(k2), 1.1, 0.55, 0, y + 1.7, sg);
  }
  // ── portiques antivol ──
  if (!GATED.has(id)) return;
  const cx = (ex0 + ex1) / 2, zG = zF + sg * 0.75;
  const xs = ex1 - ex0 > 5 ? [cx - 2.7, cx - 0.9, cx + 0.9, cx + 2.7] : [cx - 0.9, cx + 0.9];
  const ledGeo = [];
  for (const px of xs) {
    const base = 0x2a2c30, alu = 0xb9bdc2, ink = 0x5a5e66;
    A.furn(id, px - 0.06, y, zG - 0.33, px + 0.06, y + 0.1, zG + 0.33, base, { collide: false });
    for (const dz of [-0.29, 0.29]) A.furn(id, px - 0.03, y + 0.1, zG + dz - 0.025, px + 0.03, y + 1.5, zG + dz + 0.025, alu, { collide: false, metal: true });
    A.furn(id, px - 0.04, y + 1.5, zG - 0.33, px + 0.04, y + 1.56, zG + 0.33, alu, { collide: false, metal: true });
    A.box(id, 'glass', px - 0.01, y + 0.1, zG - 0.265, px + 0.01, y + 1.5, zG + 0.265, { collide: false });
    // boucle d'antenne sérigraphiée
    for (const [a0, a1, b0, b1] of [[y + 0.24, y + 0.26, -0.2, 0.2], [y + 1.36, y + 1.38, -0.2, 0.2], [y + 0.24, y + 1.38, -0.2, -0.185], [y + 0.24, y + 1.38, 0.185, 0.2]]) A.furn(id, px - 0.013, a0, zG + b0, px + 0.013, a1, zG + b1, ink, { collide: false });
    world.physics.add(new Box(px - 0.07, y, zG - 0.34, px + 0.07, y + 1.58, zG + 0.34, LAYER.FURN, null));
    const lg = new THREE.BoxGeometry(0.05, 0.014, 0.6); lg.translate(px, y + 1.567, zG); ledGeo.push(lg);
  }
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.04, 0.04) }); led.toneMapped = false;
  const geo = mergeBoxes(ledGeo);
  const mesh = new THREE.Mesh(geo, led); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  ctl.zone.group.add(mesh);
  const gate = new TheftGate(world, world.newId('gate'), { shop: id, zone: id, name: s.name, x0: ex0, x1: ex1, y, z: zG, sg, led });
  world.add(gate); ctl.gate = gate;
}

function mergeBoxes(list) {
  let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), idx = new Uint32Array(ni); let o = 0, oi = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + o;
    o += g.attributes.position.count; oi += ix.length; g.dispose();
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
