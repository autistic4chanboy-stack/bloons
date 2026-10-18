// Intérieurs des boutiques : chaque magasin a sa disposition (comptoir, rayonnages, mobilier), ses revêtements
// muraux (papiers peints procéduraux, lambris, carrelage métro, brique, béton, panneaux perforés ou rainurés),
// son plafond, sa lumière (teinte, intensité) et ses accessoires d'ambiance (suspensions, tapis, plantes, miroirs,
// menus rétroéclairés). Les aménagements laissent libres l'allée d'entrée, l'allée transversale (v ≈ 4,5) et le
// couloir de droite qui mène à la réserve : c'est là que passent les présences.
import * as THREE from 'three';
import { signTexture } from '../engine/textures.js';
import {
  furnMaterial, scale, postcardSpinner, lotteryStand, consultDesk, pouf, ballCage, photoKiosk, backdrop, softbox, lollipop, flowerBucket, workbench,
  jewelCase as kJewelCase, table as kTable, counter as kCounter, frame as kFrame, woodMat, FU, ME,
} from './furnkit.js';

// ───────────────────────── papiers peints procéduraux ─────────────────────────
// Nom de matériau : wp_<motif>_<couleur1>[_<couleur2>…] (couleurs hexadécimales sans #). tile = taille d'un motif (m).
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (h, k) => { const [r, g, b] = rgb(h); const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
function wrapDraw(S, fn) { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); } // motif raccordable
function grain(x, S, amt, seed = 1) { // léger grain papier / plâtre
  let s = seed * 9301 + 49297; const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < S * S / 60; i++) { x.fillStyle = R() < 0.5 ? `rgba(0,0,0,${amt * R()})` : `rgba(255,255,255,${amt * R()})`; x.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
}

const PATTERNS = {
  damask: { tile: 0.64, rough: 0.8, draw(x, S, [bg, fg]) {
    x.fillStyle = bg; x.fillRect(0, 0, S, S); grain(x, S, 0.05);
    const motif = (cx, cy, k) => {
      x.save(); x.translate(cx, cy); x.scale(k, k); x.fillStyle = fg;
      x.beginPath(); x.moveTo(0, -118); x.bezierCurveTo(38, -84, 58, -24, 0, 38); x.bezierCurveTo(-58, -24, -38, -84, 0, -118); x.fill();
      for (const sx of [-1, 1]) {
        x.beginPath(); x.moveTo(0, 36); x.bezierCurveTo(sx * 72, 6, sx * 112, 62, sx * 70, 112); x.bezierCurveTo(sx * 52, 80, sx * 30, 70, 0, 92); x.closePath(); x.fill();
        x.beginPath(); x.ellipse(sx * 46, -62, 13, 30, sx * 0.5, 0, Math.PI * 2); x.fill();
        x.beginPath(); x.ellipse(sx * 90, -14, 8, 18, -sx * 0.7, 0, Math.PI * 2); x.fill();
      }
      x.beginPath(); x.arc(0, 124, 11, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(0, -136, 8, 0, Math.PI * 2); x.fill();
      x.restore();
    };
    for (const [cx, cy] of [[0, 0], [S, 0], [0, S], [S, S], [S / 2, S / 2]]) motif(cx, cy, S / 560);
  } },
  stripes: { tile: 0.5, rough: 0.85, draw(x, S, [a, b, c]) {
    x.fillStyle = a; x.fillRect(0, 0, S, S); x.fillStyle = b; x.fillRect(0, 0, S * 0.36, S);
    if (c) { x.fillStyle = c; x.fillRect(S * 0.43, 0, S * 0.035, S); x.fillRect(S * 0.9, 0, S * 0.035, S); }
    grain(x, S, 0.04);
  } },
  floral: { tile: 0.56, rough: 0.85, draw(x, S, [bg, petal, leaf]) {
    x.fillStyle = bg; x.fillRect(0, 0, S, S); grain(x, S, 0.04);
    const pts = [[0.2, 0.25], [0.7, 0.14], [0.45, 0.6], [0.9, 0.7], [0.14, 0.86], [0.62, 0.93]];
    const fl = (cx, cy, r) => {
      x.fillStyle = leaf; for (const a of [0.6, 2.4, 4.3]) { x.beginPath(); x.ellipse(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5, r * 0.9, r * 0.38, a, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = petal; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; x.beginPath(); x.ellipse(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7, r * 0.55, r * 0.34, a, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = leaf; x.beginPath(); x.arc(cx, cy, r * 0.26, 0, Math.PI * 2); x.fill();
    };
    for (const [px, py] of pts) wrapDraw(S, (ox, oy) => fl(px * S + ox, py * S + oy, S * 0.045));
  } },
  geo: { tile: 0.6, rough: 0.7, draw(x, S, [bg, line]) { // éventails art déco
    x.fillStyle = bg; x.fillRect(0, 0, S, S); x.strokeStyle = line; x.lineWidth = S / 110; const R = S / 4;
    for (let row = -1; row <= 5; row++) for (let col = -1; col <= 3; col++) {
      const cx = col * R * 2 + (row % 2 ? R : 0), cy = row * R;
      for (let k = 1; k <= 4; k++) { x.beginPath(); x.arc(cx, cy + R, R * k / 4, Math.PI, 2 * Math.PI); x.stroke(); }
    }
  } },
  kids: { tile: 0.9, rough: 0.85, draw(x, S, [bg, c1, c2, c3]) {
    x.fillStyle = bg; x.fillRect(0, 0, S, S);
    const star = (cx, cy, r, c) => { x.fillStyle = c; x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); };
    const cloud = (cx, cy, r) => { x.fillStyle = 'rgba(255,255,255,0.9)'; for (const [dx, dy, k] of [[0, 0, 1], [r * 0.9, r * 0.15, 0.8], [-r * 0.9, r * 0.2, 0.75], [r * 0.3, -r * 0.5, 0.8]]) { x.beginPath(); x.arc(cx + dx, cy + dy, r * k, 0, Math.PI * 2); x.fill(); } };
    const balloon = (cx, cy, r, c) => { x.strokeStyle = 'rgba(80,80,80,0.6)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, cy + r * 1.2); x.quadraticCurveTo(cx + r * 0.4, cy + r * 2, cx, cy + r * 2.8); x.stroke(); x.fillStyle = c; x.beginPath(); x.ellipse(cx, cy, r * 0.8, r, 0, 0, Math.PI * 2); x.fill(); };
    wrapDraw(S, (ox, oy) => {
      star(0.15 * S + ox, 0.2 * S + oy, S * 0.05, c1); star(0.62 * S + ox, 0.55 * S + oy, S * 0.04, c2); star(0.85 * S + ox, 0.12 * S + oy, S * 0.03, c3);
      cloud(0.4 * S + ox, 0.18 * S + oy, S * 0.05); cloud(0.12 * S + ox, 0.7 * S + oy, S * 0.045);
      balloon(0.78 * S + ox, 0.72 * S + oy, S * 0.045, c3); balloon(0.35 * S + ox, 0.48 * S + oy, S * 0.04, c1);
      x.fillStyle = c2; for (const [px, py] of [[0.55, 0.85], [0.95, 0.4], [0.25, 0.95], [0.05, 0.45]]) { x.beginPath(); x.arc(px * S + ox, py * S + oy, S * 0.012, 0, Math.PI * 2); x.fill(); }
    });
  } },
  metro: { tile: 0.6, rough: 0.22, draw(x, S, [tile, grout]) { // carreaux métro 15 × 7,5 cm, biseautés
    x.fillStyle = grout; x.fillRect(0, 0, S, S);
    const rows = 8, h = S / rows, w = h * 2, g = Math.max(1, S / 180);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * w / 2;
      for (let c = -1; c <= S / w + 1; c++) {
        const px = c * w + off, py = r * h;
        const gr = x.createLinearGradient(0, py, 0, py + h); gr.addColorStop(0, shade(tile, 0.25)); gr.addColorStop(0.18, tile); gr.addColorStop(0.85, tile); gr.addColorStop(1, shade(tile, -0.18));
        x.fillStyle = gr; x.fillRect(px + g, py + g, w - 2 * g, h - 2 * g);
      }
    }
  } },
  pegboard: { tile: 0.4, rough: 0.8, draw(x, S, [board, hole]) {
    x.fillStyle = board; x.fillRect(0, 0, S, S); grain(x, S, 0.06, 3);
    const n = 16, st = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = hole; x.beginPath(); x.arc((i + 0.5) * st, (j + 0.5) * st, st * 0.16, 0, Math.PI * 2); x.fill(); }
  } },
  slat: { tile: 0.6, rough: 0.55, draw(x, S, [panel, groove]) { // panneau rainuré (« slatwall »)
    x.fillStyle = panel; x.fillRect(0, 0, S, S);
    for (let k = 0; k < 8; k++) { const y = k * S / 8; x.fillStyle = groove; x.fillRect(0, y, S, S / 36); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, y + S / 36, S, S / 140); }
  } },
  velvet: { tile: 1.0, rough: 1, draw(x, S, [base]) {
    for (let i = 0; i < S; i++) { const k = 0.18 * Math.sin(i / S * Math.PI * 12) + 0.08 * Math.sin(i / S * Math.PI * 30 + 1.3); x.fillStyle = shade(base, k); x.fillRect(i, 0, 1, S); }
    grain(x, S, 0.08, 5);
  } },
  acoustic: { tile: 0.5, rough: 1, draw(x, S, [base]) { // mousse acoustique en pyramides
    const n = 4, st = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x0 = i * st, y0 = j * st, cxp = x0 + st / 2, cyp = y0 + st / 2;
      for (const [pts, k] of [[[[x0, y0], [x0 + st, y0]], 0.12], [[[x0 + st, y0], [x0 + st, y0 + st]], -0.05], [[[x0 + st, y0 + st], [x0, y0 + st]], -0.2], [[[x0, y0 + st], [x0, y0]], 0.02]]) {
        x.fillStyle = shade(base, k); x.beginPath(); x.moveTo(cxp, cyp); x.lineTo(pts[0][0], pts[0][1]); x.lineTo(pts[1][0], pts[1][1]); x.closePath(); x.fill();
      }
    }
    grain(x, S, 0.1, 7);
  } },
  neon: { tile: 1.2, rough: 0.6, draw(x, S, [bg, c1, c2]) {
    x.fillStyle = bg; x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 2; for (let k = 0; k <= 8; k++) { x.beginPath(); x.moveTo(k * S / 8, 0); x.lineTo(k * S / 8, S); x.stroke(); x.beginPath(); x.moveTo(0, k * S / 8); x.lineTo(S, k * S / 8); x.stroke(); }
    const zig = (y, c) => { x.strokeStyle = c; x.lineWidth = S / 120; x.shadowColor = c; x.shadowBlur = S / 40; x.beginPath(); for (let k = 0; k <= 8; k++) x.lineTo(k * S / 8, y + (k % 2 ? -S / 24 : S / 24)); x.stroke(); x.shadowBlur = 0; };
    zig(S * 0.3, c1); zig(S * 0.72, c2);
    x.fillStyle = c2; for (const [px, py] of [[0.2, 0.1], [0.7, 0.52], [0.45, 0.9]]) { x.beginPath(); x.arc(px * S, py * S, S * 0.01, 0, Math.PI * 2); x.fill(); }
  } },
  washi: { tile: 0.9, rough: 0.9, draw(x, S, [paper, wood]) { // cloison japonaise (papier + lattes)
    x.fillStyle = paper; x.fillRect(0, 0, S, S); grain(x, S, 0.05, 11);
    x.fillStyle = wood; const t = S / 45;
    for (let k = 0; k < 3; k++) x.fillRect(k * S / 3 - t / 2, 0, t, S);
    for (let k = 0; k < 4; k++) x.fillRect(0, k * S / 4 - t / 2, S, t);
  } },
  dots: { tile: 0.35, rough: 0.85, draw(x, S, [bg, dot]) {
    x.fillStyle = bg; x.fillRect(0, 0, S, S); x.fillStyle = dot;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc((i + (j % 2) * 0.5) * S / 4, (j + 0.5) * S / 4, S * 0.03, 0, Math.PI * 2); x.fill(); }
    x.beginPath(); x.arc(S, 1.5 * S / 4, S * 0.03, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(S, 3.5 * S / 4, S * 0.03, 0, Math.PI * 2); x.fill();
  } },
  brickw: { tile: 1.0, rough: 0.92, draw(x, S, [brick, mortar]) { // brique peinte (blanchie)
    x.fillStyle = mortar; x.fillRect(0, 0, S, S);
    const rows = 14, h = S / rows, w = S / 4.6, g = S / 160; let s = 7; const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * w / 2;
      for (let c = -1; c <= 5; c++) { x.fillStyle = shade(brick, (R() - 0.5) * 0.12); x.fillRect(c * w + off + g, r * h + g, w - 2 * g, h - 2 * g); }
    }
    grain(x, S, 0.08, 13);
  } },
};
const texCache = new Map();
function wallpaperMaterial(name) {
  const [, kind, ...cols] = name.split('_'); const P = PATTERNS[kind];
  if (!P) return null;
  let tex = texCache.get(name);
  if (!tex) {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    P.draw(c.getContext('2d'), 512, cols.map(h => '#' + h));
    tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    texCache.set(name, tex);
  }
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: P.rough ?? 0.85, metalness: 0 });
  m.userData.texRepeat = 1 / (P.tile || 0.7);
  return m;
}
// Branche les papiers peints et les matériaux du kit de mobilier (bois, tissu, tôle perforée) sur la bibliothèque de
// matériaux (clones par zone : l'éclairage du magasin s'applique)
export function installInteriorMaterials(mats) {
  if (!mats || mats._interiors) return;
  mats._interiors = true;
  const make = mats._make.bind(mats);
  mats._make = (name) => (name.startsWith('wp_') && wallpaperMaterial(name)) || (name.startsWith('furniture_') && furnMaterial(name)) || make(name);
}

// ───────────────────────── ambiances par magasin ─────────────────────────
// wall : revêtement par défaut { upper, lower, split (hauteur de soubassement), rail (couleur de la cimaise) } ;
// L / R / B : surcharges par mur (gauche, droit, cloison du fond) ; ceiling : matériau du plafond ;
// exposed : plafond technique apparent (gaines) ; light / level : teinte et intensité de l'éclairage.
const T = (upper, lower = null, split = 0, rail = null) => ({ upper, lower, split, rail });
export const DESIGNS = {
  hyper: { wall: T('plaster_eeece6', 'tile_d9d5cd_9a958c_4', 1.2, 0x37474f), ceiling: 'ceiling', light: [0.95, 0.98, 1], level: 0.8 },
  pharma: { wall: T('plaster_f3f6f4'), B: T('plaster_d5ecdd', 'plaster_f3f6f4', 1.2, 0x1f9d55), light: [0.93, 0.97, 1], level: 0.78 },
  boulangerie: { wall: T('plaster_efe2c6', 'wp_metro_f5f1e8_b9b1a3', 1.8, 0x8a6440), light: [1, 0.9, 0.74], level: 0.72 },
  fleuriste: { wall: T('wp_brickw_efebe3_cfc8bd'), ceiling: 'wood_slats', light: [1, 0.96, 0.86], level: 0.7 },
  quincaillerie: { wall: T('plaster_dcdfd3'), L: T('wp_pegboard_c9a77a_4a3a28'), R: T('wp_pegboard_c9a77a_4a3a28'), light: [0.95, 0.98, 1], level: 0.8 },
  animalerie: { wall: T('plaster_d9f0ee', 'tile_ffffff_b0c4c4_4', 1.2, 0x00838f), light: [0.95, 1, 0.98], level: 0.72 },
  bijouterie: { wall: T('wp_damask_1b2a4a_2b3d64', 'woodpanel', 1.0, 0xc9a227), ceiling: 'plaster_f8f6f0', light: [1, 0.96, 0.9], level: 0.85 },
  tabac: { wall: T('plaster_7a2e2e', 'woodpanel', 1.1, 0x3e2723), light: [1, 0.88, 0.7], level: 0.6 },
  cafe: { wall: T('plaster_2f4a3a', 'woodpanel', 1.1, 0x3e2723), L: T('brick'), ceiling: 'wood_slats', light: [1, 0.84, 0.62], level: 0.55 },
  jouets: { wall: T('wp_kids_ffe9a0_ff7043_29b6f6_66bb6a', 'plaster_ffca28', 1.0, 0xff7043), light: [1, 0.97, 0.9], level: 0.76 },
  electro: { wall: T('plaster_e8eaec'), B: T('concrete'), ceiling: 'black', exposed: true, light: [0.92, 0.96, 1], level: 0.85 },
  pixel: { wall: T('wp_neon_14102a_7c4dff_00e5ff'), ceiling: 'black', exposed: true, light: [0.82, 0.74, 1], level: 0.5 },
  videoclub: { wall: T('wp_stripes_3a0f2a_4a1438_d4a017'), light: [1, 0.82, 0.86], level: 0.5 },
  librairie: { wall: T('wp_damask_2f4a3a_385744', 'woodpanel', 1.0, 0x3e2723), ceiling: 'plaster_efe6d6', light: [1, 0.88, 0.7], level: 0.62 },
  mobizone: { wall: T('plaster_eceff2'), B: T('brand'), ceiling: 'plaster_fbfbfb', light: [0.95, 0.98, 1], level: 0.74 },
  opticien: { wall: T('plaster_eef1f4'), B: T('wood_slats'), ceiling: 'plaster_fbfbfb', light: [0.97, 0.98, 1], level: 0.78 },
  parfumerie: { wall: T('wp_damask_161616_6e5a32'), ceiling: 'plaster_f6f2ea', floor: 'marble', light: [1, 0.94, 0.86], level: 0.72 },
  mode: { wall: T('plaster_f2efe9'), B: T('wood_slats'), ceiling: 'black', exposed: true, light: [1, 0.95, 0.88], level: 0.8 },
  chaussures: { wall: T('plaster_efe9e1'), B: T('wood_slats'), light: [1, 0.93, 0.84], level: 0.7 },
  sport: { wall: T('concrete'), L: T('wp_slat_e9ecef_9aa3ab'), R: T('wp_slat_e9ecef_9aa3ab'), ceiling: 'black', exposed: true, light: [0.95, 0.98, 1], level: 0.85 },
  instruments: { wall: T('wp_acoustic_4a4a4a', 'woodpanel', 1.0, 0x2b1d14), light: [1, 0.9, 0.75], level: 0.6 },
  costumes: { wall: T('wp_velvet_4a1a5a', 'woodpanel', 0.9, 0xc9a227), light: [1, 0.86, 0.8], level: 0.55 },
  coiffeur: { wall: T('plaster_f1bfd0', 'wp_metro_ffffff_c8c8c8', 1.4, 0xd81b60), light: [1, 0.97, 0.95], level: 0.74 },
  photo: { wall: T('plaster_b9bcc0'), B: T('plaster_3a3d42'), light: [1, 0.98, 0.95], level: 0.66 },
  deco: { wall: T('wp_floral_efe6d6_b5654f_7a8a5a'), ceiling: 'plaster_f2ebe0', light: [1, 0.85, 0.66], level: 0.52 },
  arcade: { wall: T('wp_neon_0a0618_ff2bd6_3ff0ff'), ceiling: 'black', exposed: true, light: [0.78, 0.7, 1], level: 0.42 },
  pizzeria: { wall: T('brick'), R: T('plaster_efe2c8', 'wp_metro_c8693f_7a3a1e', 1.2, 0x2e7d32), light: [1, 0.85, 0.62], level: 0.6 },
  burger: { wall: T('plaster_efe8dc', 'wp_metro_f5f5f5_b0b0b0', 1.5, 0xc62828), light: [1, 0.96, 0.88], level: 0.78 },
  sushi: { wall: T('wp_washi_efe6d2_5d4632', 'wood_slats', 1.0, 0x2b1d14), light: [1, 0.92, 0.8], level: 0.58 },
  cinema: { wall: T('wp_velvet_5a0f16'), light: [1, 0.85, 0.75], level: 0.5 },
  glacier: { wall: T('wp_stripes_f4fbff_a9d8ee', 'wp_metro_e3f2fb_8fb9cc', 1.2, 0x4fc3f7), light: [0.96, 0.99, 1], level: 0.72 },
  bonbons: { wall: T('wp_stripes_ffffff_f8bbd0_f48fb1', 'plaster_f48fb1', 0.9, 0xffffff), light: [1, 0.96, 0.97], level: 0.8 },
  octet: { wall: T('plaster_dfe4e8'), R: T('wp_pegboard_b0b5ba_3c4248'), light: [0.92, 0.96, 1], level: 0.7 },
  direction: { wall: T('plaster_e6dcc8', 'woodpanel', 1.0, 0x3e2723), light: [1, 0.9, 0.75], level: 0.55 },
  staff: { wall: T('plaster_d8d4c8', 'tile_c8c4b8_8a857c_4', 1.2, 0x8a857c), light: [1, 0.97, 0.9], level: 0.6 },
  toilettes: { wall: T('toilet_tiles'), light: [0.95, 0.98, 1], level: 0.7 },
};
const hex6 = (c) => c.toString(16).padStart(6, '0');
export function designFor(s) {
  const d = DESIGNS[s.id] || { wall: T('plaster_e6e1d6') };
  const fix = (w) => w && { ...w, upper: w.upper === 'brand' ? 'plaster_' + hex6(s.color) : w.upper, lower: w.lower === 'brand' ? 'plaster_' + hex6(s.color) : w.lower };
  return { ...d, wall: fix(d.wall), L: fix(d.L), R: fix(d.R), B: fix(d.B) };
}

// Revêtements muraux (gauche, droite, cloison du fond côté magasin), plinthes, cimaises, plafond technique apparent.
export function finishShop(L, d, opts = {}) {
  const W = L.W, D = opts.depth ?? L.D, H = L.H;
  const spec = (side) => ({ ...d.wall, ...(d[side] || {}) });
  const layer = (side, a0, a1, h0, h1, mat) => {
    if (a1 - a0 < 0.01 || h1 - h0 < 0.01 || !mat) return;
    if (side === 'L') L.mbox(mat, 0.15, a0, 0.16, a1, h0, h1);
    else if (side === 'R') L.mbox(mat, W - 0.16, a0, W - 0.15, a1, h0, h1);
    else L.mbox(mat, a0, D - 0.11, a1, D - 0.1, h0, h1);
  };
  // cimaise moulurée (doucine) et plinthe à bord adouci, posées sur le revêtement
  const RAIL = [[0, -0.026], [0.008, -0.024], [0.016, -0.016], [0.02, -0.006], [0.02, -0.006], [0.025, -0.002], [0.025, 0.006], [0.018, 0.014], [0.009, 0.022], [0, 0.026]];
  const wall = (side, a0, a1, h0 = 0, h1 = H) => {
    const w = spec(side);
    if (w.split > 0 && w.lower) {
      layer(side, a0, a1, Math.max(h0, 0), Math.min(h1, w.split), w.lower);
      layer(side, a0, a1, Math.max(h0, w.split), h1, w.upper);
      if (w.rail != null && h0 < w.split && h1 > w.split) L.wallPen(side, a0, a1, null, w.split).extrudeX(woodMat(w.rail), RAIL, -(a1 - a0) / 2, (a1 - a0) / 2, w.rail, { caps: true });
    } else layer(side, a0, a1, h0, h1, w.upper);
    if (h0 < 0.01) L.wallPen(side, a0, a1).rbox(FU, -(a1 - a0) / 2, 0, 0, (a1 - a0) / 2, 0.1, 0.016, 0.005, d.skirting ?? 0x3a3a3a, 'xXYZ');
  };
  const front = 0.12, back = opts.back === false ? D : D - 0.1;
  wall('L', front, back); wall('R', front, back);
  if (opts.back !== false) { // cloison du fond, avec l'ouverture de la porte de la réserve
    const p0 = W - 2.15, p1 = W - 1.05;
    wall('B', 0.16, p0); wall('B', p1, W - 0.16); wall('B', p0, p1, 2.15, H);
  }
  if (d.exposed) { // gaines spiralées (brides, colliers, tiges filetées) et chemin de câbles en échelle sous un plafond noir
    const hl = (W - 0.6) / 2;
    for (const v of [2.6, 7.2]) {
      if (v > D - 0.5) continue;
      const p = L.penAt(W / 2, v, L.ryX(1, 0), null, H - 0.35);
      p.tube(ME, [-hl, 0, 0], [hl, 0, 0], 0.22, 18, 0x9aa0a6, true);
      for (let x = -hl + 0.6; x < hl - 0.3; x += 1.5) p.tube(ME, [x - 0.02, 0, 0], [x + 0.02, 0, 0], 0.228, 18, 0x868c92);
      for (let u = 1.2; u < W - 0.8; u += 2.4) {
        const x = u - W / 2;
        p.sweep(ME, Array.from({ length: 12 }, (_, i) => [x, Math.cos(i / 12 * Math.PI * 2) * 0.232, Math.sin(i / 12 * Math.PI * 2) * 0.232]), 0.006, 4, 0x55595e, { closed: true });
        p.tube(ME, [x, 0.232, 0], [x, 0.35, 0], 0.005, 4, 0x2a2c2e);
      }
    }
    const p = L.penAt(W / 2, 5.05, L.ryX(1, 0), null, H - 0.22), hw = (W - 1.2) / 2;
    for (const s of [-1, 1]) p.box(ME, -hw, 0, s * 0.15 - 0.004, hw, 0.05, s * 0.15 + 0.004, 0x30343a, 'xXyYzZ');
    for (let x = -hw + 0.15; x < hw; x += 0.3) p.box(ME, x - 0.012, 0, -0.15, x + 0.012, 0.012, 0.15, 0x30343a, 'xXyY');
    for (let k = 0; k < 4; k++) p.tube(FU, [-hw, 0.025 + (k % 2) * 0.02, -0.09 + k * 0.06], [hw, 0.025 + (k % 2) * 0.02, -0.09 + k * 0.06], 0.012, 5, [0x1a1a1a, 0x3a3a3a, 0x7a1f1f, 0x1a1a1a][k]);
    for (let x = -hw + 0.6; x < hw; x += 2.4) for (const s of [-1, 1]) p.tube(ME, [x, 0.05, s * 0.155], [x, 0.22, s * 0.155], 0.005, 4, 0x2a2c2e);
  }
}

// ───────────────────────── textures de détail ─────────────────────────
function cnv(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
let _cross = null;
function crossTex() {
  return _cross || (_cross = cnv(128, 128, (x, w, h) => {
    x.fillStyle = '#062a14'; x.fillRect(0, 0, w, h);
    x.shadowColor = '#3cff7a'; x.shadowBlur = 14; x.fillStyle = '#25d366';
    x.fillRect(w * 0.38, h * 0.12, w * 0.24, h * 0.76); x.fillRect(w * 0.12, h * 0.38, w * 0.76, h * 0.24);
  }));
}
// ardoise / menu : lignes [titre, [plat, prix]…] ; style 'chalk' (craie sur ardoise) ou 'lit' (caisson lumineux)
function menuTex(title, lines, style = 'chalk', accent = '#ffcc00') {
  return cnv(512, 256, (x, w, h) => {
    if (style === 'chalk') { x.fillStyle = '#1f2622'; x.fillRect(0, 0, w, h); x.strokeStyle = '#6d4c41'; x.lineWidth = 14; x.strokeRect(7, 7, w - 14, h - 14); }
    else { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b2b2b'); gr.addColorStop(1, '#111'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = accent; x.fillRect(0, 0, w, 54); }
    x.textBaseline = 'middle';
    x.fillStyle = style === 'chalk' ? '#f4f1e8' : '#111'; x.font = style === 'chalk' ? 'italic 700 40px Georgia, serif' : '900 38px Arial'; x.textAlign = 'center'; x.fillText(title, w / 2, style === 'chalk' ? 44 : 28);
    x.font = style === 'chalk' ? '26px Georgia, serif' : '700 25px Arial'; x.fillStyle = style === 'chalk' ? '#ece6d6' : '#f5f5f5';
    lines.forEach(([a, b], i) => { const y = 92 + i * 34; x.textAlign = 'left'; x.fillText(a, 30, y); x.textAlign = 'right'; x.fillStyle = style === 'chalk' ? '#ffe9a8' : accent; x.fillText(b, w - 30, y); x.fillStyle = style === 'chalk' ? '#ece6d6' : '#f5f5f5'; });
  });
}

// affiche de cinéma (portrait 2:3) : fond dégradé, silhouette, titre sur deux lignes, mention
function posterTex(kind) {
  return cnv(256, 384, (x, w, h) => {
    const P = kind === 'mannequins' ? { bg0: '#2a0508', bg1: '#060203', ink: '#e8dcc8', acc: '#c62828', t1: 'LA NUIT DES', t2: 'MANNEQUINS', sub: 'Séance de 23 h · Salle 1' }
      : { bg0: '#d9c9a3', bg1: '#8a7550', ink: '#2a2118', acc: '#5a4630', t1: 'LES GRANDS', t2: 'MAGASINS', sub: 'Film muet · 1924' };
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, P.bg0); gr.addColorStop(1, P.bg1); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = P.acc; x.globalAlpha = 0.9;
    if (kind === 'mannequins') { // silhouette de mannequin de vitrine sous un projecteur
      x.beginPath(); x.ellipse(w / 2, 92, 22, 27, 0, 0, Math.PI * 2); x.fill();
      x.fillRect(w / 2 - 6, 116, 12, 16); x.beginPath(); x.moveTo(w / 2 - 46, 140); x.lineTo(w / 2 + 46, 140); x.lineTo(w / 2 + 30, 250); x.lineTo(w / 2 - 30, 250); x.closePath(); x.fill();
      x.fillRect(w / 2 - 26, 250, 18, 70); x.fillRect(w / 2 + 8, 250, 18, 70);
      x.globalAlpha = 0.18; x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(w / 2 - 10, 0); x.lineTo(w / 2 + 10, 0); x.lineTo(w / 2 + 90, 330); x.lineTo(w / 2 - 90, 330); x.closePath(); x.fill();
    } else { // chapeau melon et escalier roulant
      x.beginPath(); x.ellipse(w / 2, 120, 60, 12, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.ellipse(w / 2, 100, 34, 30, 0, Math.PI, Math.PI * 2); x.fill(); x.fillRect(w / 2 - 34, 99, 68, 14);
      for (let k = 0; k < 7; k++) x.fillRect(40 + k * 24, 300 - k * 22, 30, 6);
      x.lineWidth = 5; x.strokeStyle = P.acc; x.beginPath(); x.moveTo(36, 312); x.lineTo(220, 150); x.stroke();
    }
    x.globalAlpha = 1; x.textAlign = 'center'; x.fillStyle = P.ink;
    x.font = '700 26px Georgia, serif'; x.fillText(P.t1, w / 2, 340);
    x.font = '900 34px Georgia, serif'; x.fillText(P.t2, w / 2, 372);
    x.font = 'italic 15px Georgia, serif'; x.fillText(P.sub, w / 2, 30);
    x.strokeStyle = P.ink; x.globalAlpha = 0.5; x.lineWidth = 3; x.strokeRect(7, 7, w - 14, h - 14); x.globalAlpha = 1;
  });
}
// Affiches rétroéclairées des films à l'affiche, sur le mur de la salle côté hall (plan v, face au hall) ; elles
// s'éteignent avec le courant
export function cinemaPosters(L, v, us) {
  ['magasins', 'mannequins'].forEach((kind, i) => {
    const u = us[i], w = 0.78, hh = 1.17, y0 = 1.62;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: posterTex(kind) }));
    m.position.set(L.X(u), L.y + y0, L.Z(v - 0.034)); m.rotation.y = L.faceFront; m.matrixAutoUpdate = false; m.updateMatrix();
    L.c.zone.group.add(m); L.c.zone.signMats.push(m.material);
    const p = L.penAt(u, v, L.faceFront, null, y0);
    p.box(FU, -w / 2 - 0.04, -hh / 2 - 0.04, 0, w / 2 + 0.04, hh / 2 + 0.04, 0.03, 0x15151a, 'xXyYZ');            // caisson
    kFrame(p, w, hh, 0.035, 0.04, 0xb8963e);                                                                         // cadre doré
  });
}

// ───────────────────────── aménagements ─────────────────────────
// Repères (magasin d'une case : W = 12, D = 10) : entrée au centre de la façade (u = W/2), comptoirs et rayons hors de
// l'allée d'entrée, de l'allée transversale v ∈ [3,9 ; 5,1] et du couloir de droite u ∈ [W-2,2 ; W-1] (v > 4,5).
const PI = Math.PI;
function jewelCase(L, u0, v0, u1, v1, ax) {
  const ua = Math.min(u0, u1), ub = Math.max(u0, u1), along = ub - ua >= Math.abs(v1 - v0);
  L.solid(ua, v0, ub, v1, 0, 0.9);
  L.board(ax, ax === 'v' ? v0 + 0.1 : Math.min(u0, u1) + 0.1, ax === 'v' ? v1 - 0.1 : Math.max(u0, u1) - 0.1, ax === 'v' ? (u0 + u1) / 2 : (v0 + v1) / 2, 0.92, 0.5, 0.2, ax === 'v' ? PI / 2 : L.faceFront);
  L.vitrine(ua, v0, ub, v1);
  kJewelCase(L.penAt((ua + ub) / 2, (v0 + v1) / 2, along ? L.faceFront : L.ryOf(1, 0)), { L: along ? ub - ua : Math.abs(v1 - v0), D: along ? Math.abs(v1 - v0) : ub - ua, color: 0x1a1a24 });
}
export const INTERIOR_LAYOUTS = {
  pharma(L) {
    const W = L.W, white = 0xf6f7f6, green = 0x1f9d55, oak = 0xc8a46e;
    const sh = { back: 0xe9f5ee, backMetal: false, plinth: green, base: 0.3 };
    L.wallShelf('L', 1.4, 5.8, 5, 2.1, 0.4, white, null, sh);
    L.wallShelf('R', 1.6, 8.8, 5, 2.1, 0.4, white, null, sh);
    L.island(1.3, 4.3, 2.0, 3, 1.35, white, 0.9, { cap: green, capH: 0.1 }); L.island(7.7, 10.4, 2.0, 3, 1.35, white, 0.9, { cap: green, capH: 0.1 });
    // comptoir du pharmacien au fond, face à l'entrée ; tiroirs à médicaments et rayonnages derrière
    L.counter(2.2, 6.7, 8.8, 7.4, 1.0, white, 2, oak);
    L.penAt(5.5, 6.69, L.faceFront).rbox(FU, -3.3, 0.3, -0.01, 3.3, 0.42, 0.01, 0.005, green); // bandeau vert
    L.drawers('B', 0.8, 8.8, 0, 1.15, 0.5, white, 0xb0b8b4, 0, 5);
    L.wallShelf('B', 0.8, 8.8, 3, 2.35, 0.3, white, null, { base: 1.4, from: 1.15, back: 0xf0f3f1, backMetal: false });
    L.litPanel('B', 5.0, 6.0, 2.6, 3.6, crossTex());
    L.solid(10.6, 3.0, 11.2, 3.4, 0, 1.25); scale(L.penAt(10.9, 3.2, L.faceFront), 0xdfe5e2); // balance pèse-personne
    L.plant(0.7, 6.4, 0.8); L.floorSpot(10.9, 6.0, -PI / 2); L.floorSpot(1.2, 6.6, PI / 2);
  },
  tabac(L) {
    const W = L.W, wood = 0x4e3524, dark = 0x2b1d14, rk = { back: 0x5d4037, backMetal: false, uprights: 0x3e2723, metal: false };
    L.counter(0.9, 6.0, 6.6, 6.8, 1.05, wood, 1, 0x2a1a10);
    L.wallBlock('B', 0.8, 6.6, 0, 0.95, 0.55, dark, null, 'doors', { top: 0x2a1a10 });
    L.wallShelf('B', 0.8, 6.6, 7, 2.55, 0.28, 0x3a2a20, null, { base: 1.1, from: 0.95, back: 0x1e140e, backMetal: false, uprights: 0x1e140e, metal: false });
    L.wallShelf('R', 1.4, 8.8, 6, 2.0, 0.32, 0x6d4c41, null, rk);   // presse
    L.wallShelf('L', 1.4, 5.2, 5, 1.9, 0.3, 0x6d4c41, null, rk);    // cartes, briquets, confiserie
    L.table(7.6, 1.6, 9.4, 2.4, 0.8, 0x5d4037, 1);                   // quotidiens
    L.solid(1.0, 1.6, 2.4, 2.2, 0, 1.1); lotteryStand(L.penAt(1.7, 1.9, L.faceIn), 1.4, 0.6, 0x1565c0); // stand de jeux
    L.board('u', 1.1, 2.3, 1.9, 1.14, 0.5, 0.3, L.faceFront, null, { noLabels: true });
    L.solid(3.15, 2.45, 3.65, 2.95, 0, 1.75);                           // tourniquet à cartes postales (socle Ø 50 cm, poches)
    const cards = []; for (let h = 0.5; h < 1.7; h += 0.3) cards.push(L.rng.pick([0xffffff, 0xfff3e0, 0xe3f2fd, 0xfce4ec]));
    postcardSpinner(L.penAt(3.4, 2.7, 0), cards);
    L.pendant(2.4, 6.4, 2.35, 0x8a6d3b, 'cone', 0.32); L.pendant(5.0, 6.4, 2.35, 0x8a6d3b, 'cone', 0.32);
    L.floorSpot(10.6, 2.2, -PI / 2);
  },
  librairie(L) {
    const wood = 0x5d4037, oak = 0x8d6e63, bc = { back: 0x4e342e, backMetal: false, uprights: 0x3e2723, metal: false };
    L.wallShelf('L', 1.2, 9.2, 6, 2.45, 0.32, wood, null, bc);
    L.wallShelf('R', 4.4, 9.2, 6, 2.45, 0.32, wood, null, bc);
    L.wallShelf('B', 0.8, 8.8, 6, 2.45, 0.32, wood, null, bc);
    L.table(1.4, 1.5, 3.6, 2.5, 0.78, oak, 2); L.table(1.4, 2.9, 3.6, 3.6, 0.78, oak, 1);
    L.island(1.6, 7.6, 6.3, 4, 1.45, wood, 0.8, { metal: false, cap: 0x3e2723, back: 0x4e342e, base: 0x3e2723, capH: 0.05 });
    L.rug(1.0, 7.8, 4.2, 9.3, 0x7a2f2f, 0xd8c39a);
    L.floorSpot(1.7, 8.6, L.faceFront + 0.35); L.floorSpot(3.1, 8.6, L.faceFront - 0.35); // fauteuils (chaises)
    L.floorLamp(3.9, 9.0);
    L.counter(8.6, 2.9, 10.8, 3.6, 1.0, wood, 1, 0x3e2723);
    L.pendant(2.5, 2.0, 2.3, 0x2f4a3a, 'cone'); L.pendant(2.5, 3.25, 2.3, 0x2f4a3a, 'cone'); L.pendant(9.7, 3.25, 2.4, 0x2f4a3a, 'cone', 0.3);
    L.plant(10.9, 1.0, 0.9);
  },
  mobizone(L, s) {
    const W = L.W, white = 0xf7f7f7, oak = 0xd8c3a5, grey = 0x9aa3ab, sh = { back: 0xeceff1, backMetal: false, base: 0.4, plinth: grey };
    L.wallShelf('L', 1.4, 9.0, 6, 2.2, 0.25, white, null, sh);
    L.wallShelf('R', 1.4, 7.6, 6, 2.2, 0.25, white, null, sh);
    for (const [u0, v0, u1, v1] of [[1.4, 2.0, 4.4, 2.9], [7.6, 2.0, 10.6, 2.9], [1.6, 6.0, 4.6, 6.9], [5.6, 6.0, 8.6, 6.9]]) L.table(u0, v0, u1, v1, 0.9, oak, 1);
    L.counter(2.4, 8.3, 8.0, 9.0, 1.05, white, 1, 0x37474f);
    L.litPanel('B', 3.4, 7.0, 2.45, 3.15, signTexture(s.name.toUpperCase(), s.color, { h: 120, fontSize: 70, font: 'Arial Black, Arial' }));
    for (const u of [3.2, 4.6, 6.0, 7.4]) L.stool(u, 7.9, 0x37474f);
  },
  opticien(L) {
    const W = L.W, oak = 0xcaa77a, white = 0xfafafa, fr = { back: 0xffffff, backMetal: false, base: 0.9, plinth: oak, metal: false };
    L.wallShelf('L', 1.4, 7.2, 7, 2.2, 0.18, oak, null, fr);
    L.wallShelf('R', 3.2, 9.0, 7, 2.2, 0.18, oak, null, fr);
    L.table(1.4, 1.8, 3.6, 2.6, 0.85, oak, 2);                     // solaires
    for (const u0 of [1.6, 4.2]) {                                  // bureaux de conseil
      L.solid(u0, 6.0, u0 + 1.3, 6.7, 0, 0.75); consultDesk(L.penAt(u0 + 0.65, 6.35, L.faceFront), 1.3, 0.7, white, oak);
      L.chairDeco(u0 + 0.65, 5.55, 0, 0x37474f); L.chairDeco(u0 + 0.65, 7.1, PI, 0x8d6e63);
    }
    L.partition(0.17, 7.5, 2.6, 7.58, 2.4, 0xe8e4dc); L.partition(3.4, 7.5, 3.48, 9.88, 2.4, 0xe8e4dc); // salle d'examen
    L.wallHigh('B', 1.5, 1.5);                                      // tableau d'acuité (1er emplacement mural)
    L.wallHigh('R', 9.35, 1.5);                                     // miroir
    L.chairDeco(1.6, 8.4, L.faceIn === 0 ? PI : 0, 0x37474f);
    L.counter(8.8, 1.4, 10.8, 2.1, 1.0, oak, 1, 0x5d4037);
    L.pendant(2.5, 2.2, 2.4, 0xffffff, 'globe', 0.32);
  },
  parfumerie(L) {
    const black = 0x151515, gold = 0xb8963e, white = 0xf5f2ee, sh = { back: 0x0e0e0e, backMetal: false, base: 0.35, plinth: black, uprights: gold, metal: false };
    L.wallShelf('L', 1.4, 8.8, 5, 2.2, 0.35, black, null, sh);
    L.wallShelf('R', 1.4, 8.8, 5, 2.2, 0.35, black, null, sh);
    for (const [a, b] of [[1.6, 4.0], [8.0, 10.4]]) L.island(a, b, 2.0, 3, 1.2, white, 0.9, { metal: false, cap: gold, back: 0xe8e2d8, base: black, capH: 0.02 });
    L.counter(2.0, 6.6, 8.6, 7.3, 1.0, white, 1, gold);
    L.board('u', 2.15, 7.6, 6.95, 1.0, 0.5, 0.35, L.faceFront, null, { noLabels: true }); // testeurs
    L.wallHigh('B', 5.3, 1.3);                                         // miroir derrière le comptoir
    for (const [u, v, h] of [[2.8, 2.45, 2.35], [9.2, 2.45, 2.35], [4.2, 6.95, 2.3], [6.4, 6.95, 2.3]]) L.pendant(u, v, h, gold, 'globe', 0.3);
  },
  chaussures(L) {
    const oak = 0xc8a46e, cream = 0xf3ece2, sh = { back: 0xe9dfd0, backMetal: false, base: 0.3, plinth: oak, metal: false };
    L.wallShelf('L', 3.0, 9.0, 6, 2.25, 0.32, oak, null, sh);
    L.wallShelf('R', 1.4, 9.0, 6, 2.25, 0.32, oak, null, sh);
    L.wallShelf('B', 0.8, 8.8, 4, 1.8, 0.35, oak, null, sh);
    L.counter(0.6, 1.5, 2.4, 2.2, 1.0, cream, 1, oak);
    L.table(3.2, 2.0, 4.5, 2.8, 0.45, oak, 1, { style: 'podium' }); L.table(7.4, 2.0, 9.4, 2.8, 0.45, cream, 1, { style: 'podium' }); // podiums bas
    L.rug(2.4, 5.6, 6.0, 7.4, 0xb08968, 0x6d4c41);
    L.floorSpot(4.2, 6.5, L.faceFront);                                 // banc d'essayage
    for (const u of [2.75, 5.65]) { L.solid(u - 0.22, 6.28, u + 0.22, 6.72, 0, 0.42); pouf(L.penAt(u, 6.5, 0), 0.44, 0.44, 0.42, 0x8d6e63); } // poufs
    L.wallHigh('L', 0.8, 0.75);                                         // miroir bas (fixe), devant la caisse et non derrière
    L.pendant(4.2, 6.5, 2.4, 0x3e2723, 'drum', 0.5);
    L.plant(10.9, 9.3, 0.9);
  },
  sport(L) {
    const white = 0xeceff1, dark = 0x263238, sw = { back: 0xdde2e6, backMetal: false, base: 0.25, plinth: dark };
    const kit = [0x1565c0, 0xc62828, 0x212121, 0x43a047, 0xffffff, 0xff9800, 0x00acc1];
    L.wallShelf('L', 3.9, 9.0, 6, 2.3, 0.4, white, null, sw);
    L.wallShelf('R', 1.4, 9.0, 6, 2.3, 0.4, white, null, sw);
    L.rack(1.4, 3.6, 2.4, kit, 1.5, ['tee', 'coat', 'tee', 'pants']); L.rack(7.6, 9.8, 2.4, kit, 1.5, ['tee', 'coat', 'tee', 'pants']);
    L.solid(1.6, 6.0, 2.8, 7.0, 0, 0.06);                                // bac à ballons grillagé
    L.solid(1.6, 6.0, 2.8, 7.0, 0, 0.9); ballCage(L.penAt(2.2, 6.5, L.faceFront), 1.2, 1.0, 0.9, dark);
    L.board('u', 1.65, 2.75, 6.5, 0.4, 0.9, 0.6, L.faceFront, null, { noLabels: true });
    L.counter(0.9, 3.0, 2.8, 3.7, 1.0, dark, 1, 0x455a64);
    L.floorSpot(3.4, 8.0, L.faceFront);                                 // tente
    L.floorSpot(8.4, 1.5, L.faceFront); L.floorSpot(9.4, 1.5, L.faceFront); // vélos
    L.floorSpot(6.4, 9.35, L.faceFront);                                // panier de basket
  },
  photo(L) {
    const W = L.W, grey = 0x37474f, white = 0xf5f5f5;
    L.counter(0.9, 1.4, 3.6, 2.1, 1.0, grey, 1, 0x212121);
    L.wallShelf('L', 2.8, 8.4, 4, 2.0, 0.28, white, null, { back: 0xe0e0e0, backMetal: false });
    for (const v of [1.6, 2.8]) { L.wallBlock('R', v, v + 0.7, 0, 1.0, 0.45, grey, null, 'none'); photoKiosk(L.wallPen('R', v, v + 0.7), 0.7, 0.46, grey); } // bornes d'impression
    L.frames('R', 4.4, 9.0, 1.2, 2.6, [0xe0c9a6, 0x90a4ae, 0xffccbc, 0xc5e1a5, 0xb3e5fc, 0xffffff, 0x3e2723]);
    L.table(7.4, 2.0, 10.4, 2.8, 0.9, white, 2);
    // studio : fond blanc arrondi, deux réflecteurs, tabouret
    L.solid(1.05, 9.3, 5.35, 9.36, 0, 3.0); backdrop(L.penAt(3.2, 9.36, L.faceFront), 4.0, 0xfafafa); // fond et ses deux mâts
    for (const u of [0.9, 5.5]) { softbox(L.penAt(u, 7.6, L.ryOf(3.2 - u, 1.0)), 1.85, 0xf8f8f8); L.solid(u - 0.4, 7.2, u + 0.4, 8.0, 0, 2.0); } // trépied et boîte à lumière
    L.stool(3.2, 8.6, 0x212121, 0.65);
    L.wallFloor('B', 7.4);                                              // photomaton
  },
  deco(L) {
    const white = 0xf2ece4, wood = 0x8d6e63, sage = 0x8a9a7b, sh = { back: 0xe8dfd2, backMetal: false, metal: false };
    L.wallShelf('L', 1.4, 4.4, 4, 2.0, 0.35, white, null, sh);
    L.wallShelf('R', 3.2, 9.0, 4, 2.0, 0.35, white, null, sh);
    L.table(1.4, 2.0, 3.6, 2.8, 0.75, wood, 2);
    // salon d'exposition
    L.rug(1.0, 5.6, 4.8, 8.6, 0xb5654f, 0xe8d8bf);
    L.bench(1.2, 7.9, 4.4, 8.7, sage, 'v1', 0.46, { sofa: true });
    L.solid(1.2, 7.9, 1.4, 8.7, 0.46, 0.72); L.solid(4.2, 7.9, 4.4, 8.7, 0.46, 0.72);
    L.table(2.2, 6.4, 3.6, 7.0, 0.42, wood, 1);
    L.floorLamp(4.65, 8.75);
    // coin salle à manger
    L.table(5.6, 6.2, 8.0, 7.2, 0.76, wood, 1);
    for (const [u, v, r] of [[6.2, 5.8, 0], [7.4, 5.8, 0], [6.2, 7.6, PI], [7.4, 7.6, PI]]) L.chairDeco(u, v, r, 0x6d5a48);
    L.counter(8.8, 1.4, 10.8, 2.1, 1.0, white, 1, wood);
    const shades = [0xd8c39a, 0x8a9a7b, 0xb5654f, 0x2b2b2b];
    for (const u of [1.6, 3.2, 8.6, 10.2]) L.pendant(u, 2.6, 2.5, L.rng.pick(shades), L.rng.pick(['cone', 'globe', 'drum']), 0.38);
    L.pendant(6.8, 6.7, 2.2, 0xd8c39a, 'drum', 0.45);
    L.wallHigh('L', 6.2, 1.55); L.wallHigh('L', 7.4, 1.55);             // miroirs décoratifs
    L.plant(11.2, 9.45, 1.0); L.plant(0.65, 5.0, 0.8);                 // (hors du débattement de la porte de la réserve)
  },
  bonbons(L) {
    const W = L.W, pink = 0xf48fb1, white = 0xfafafa;
    const candy = [0xe53935, 0xffeb3b, 0x43a047, 0x1e88e5, 0xff9800, 0x8e24aa, 0xf06292, 0x00bcd4, 0xffffff];
    L.bins('L', 1.4, 8.8, candy); L.bins('R', 1.4, 7.2, candy);
    L.wallShelf('L', 1.4, 8.8, 1, 2.1, 0.25, white, null, { base: 1.85, from: 1.75, back: 0xffffff, backMetal: false });
    L.table(2.2, 2.0, 4.4, 3.0, 0.8, pink, 2); L.table(7.6, 2.0, 9.6, 3.0, 0.8, 0xfff59d, 2);
    L.counter(5.8, 7.6, 9.4, 8.3, 1.0, white, 1, pink);
    L.floorSpot(8.7, 6.9, L.faceFront);                                 // barbe à papa
    L.floorSpot(3.6, 1.0, L.faceIn); L.floorSpot(8.4, 1.0, L.faceIn);   // distributeurs de boules
    for (const [u, c] of [[1.4, 0xe91e63], [2.6, 0x29b6f6], [3.8, 0xffeb3b]]) { // sucettes géantes (bâton : collision ; le disque passe au-dessus de la tête)
      lollipop(L.penAt(u, 9.62, L.faceFront), 2.2, c); L.solid(u - 0.05, 9.57, u + 0.05, 9.67, 0, 1.9);
    }
  },
  octet(L, s) {
    const white = 0xf2f4f6, grey = 0x455a64;
    L.solid(0.17, 1.6, 0.95, 7.8, 0, 0.75); workbench(L.wallPen('L', 1.6, 7.8), 6.2, 0.79, 0.78, white, grey); // établi de réparation
    for (const v of [2.2, 3.4, 4.6, 5.8, 7.0]) L.counterSpot(0.55, v, 0.78, PI / 2);
    L.board('v', 1.7, 7.7, 0.55, 0.78, 0.7, 0.5, PI / 2, null, { noLabels: true });
    L.wallShelf('R', 1.4, 9.0, 5, 2.2, 0.4, white, null, { back: 0xd7d2c6, backMetal: false });
    L.table(7.6, 2.0, 10.6, 2.8, 0.9, white, 1); L.table(2.2, 2.0, 4.6, 2.8, 0.9, white, 1);
    L.island(2.4, 7.6, 6.2, 4, 1.5, white, 0.9, { cap: grey });
    L.counter(2.4, 8.3, 8.4, 9.0, 1.0, grey, 1, 0x263238);
    L.litPanel('B', 3.6, 7.2, 2.5, 3.0, signTexture('SAV · RÉPARATIONS', s.color, { h: 100, fontSize: 56, font: 'Arial Black, Arial' }));
  },
  boulangerie(L) {
    const cream = 0xf2ead8, wood = 0x8a6440;
    L.glassCounter(0.9, 5.3, 9.6, 6.3, 1.1, cream, wood, { regU: 8.9 });
    L.wallShelf('B', 0.8, 8.8, 4, 2.0, 0.45, wood, null, { back: 0x6d4c41, backMetal: false, metal: false, base: 0.7, plinth: 0x5d4037 }); // panetières
    L.wallBlock('L', 7.0, 9.0, 0, 0.92, 0.68, 0xb0bec5, null, 'kitchen'); // plan de travail (four, cafetière)
    L.counterSpot(0.5, 7.5, 0.92, PI / 2); L.counterSpot(0.5, 8.5, 0.92, PI / 2);
    L.wallShelf('L', 1.2, 4.6, 4, 1.8, 0.35, wood, null, { back: 0x6d4c41, backMetal: false, metal: false }); // épicerie fine
    L.solid(9.8, 2.0, 10.6, 2.8, 0, 1.08); kTable(L.penAt(10.2, 2.4, L.faceFront), { w: 0.9, d: 0.9, h: 1.12, color: wood, style: 'pedestal', legs: 0x2a2826 }); // mange-debout
    L.wallPicture('B', 4.8, 2.85, 4.4, 1.0, menuTex('Nos pains & viennoiseries', [['Baguette tradition', '1,20 €'], ['Croissant pur beurre', '1,10 €'], ['Pain au chocolat', '1,25 €'], ['Éclair café', '2,80 €']]));
    for (const u of [2.4, 5.0, 7.6]) L.pendant(u, 5.8, 2.35, 0xd8c39a, 'drum', 0.36);
  },
  cafe(L) {
    const wood = 0x4e342e, zinc = 0xb8bcc0, red = 0x7a1f1f;
    L.counter(0.9, 5.6, 9.6, 6.4, 1.1, wood, 1, zinc);
    for (let u = 1.4; u < 9.2; u += 1.0) L.stool(u, 5.28, red, 0.76);
    L.mirror('B', 1.0, 8.6, 1.3, 2.4);
    L.wallShelf('B', 1.0, 8.6, 3, 2.5, 0.25, wood, null, { base: 1.4, from: 1.3, back: 0x2b1d14, backMetal: false, metal: false }); // arrière-bar
    L.wallBlock('B', 1.0, 8.6, 0, 0.95, 0.55, wood, null, 'doors', { top: 0x2b1d14 });
    L.counterSpot(2.2, 9.55, 0.95, L.faceFront); L.counterSpot(3.4, 9.55, 0.95, L.faceFront); // percolateurs
    L.board('u', 4.2, 8.4, 9.55, 0.95, 0.45, 0.4, L.faceFront);
    L.bench(0.17, 1.2, 0.8, 3.8, red, 'u0');                            // banquette
    for (const v of [1.8, 3.1]) { L.table(1.05, v - 0.32, 1.7, v + 0.32, 0.75, wood, 1); L.floorSpot(2.15, v, -PI / 2); }
    for (const [u, v] of [[8.2, 2.0], [10.4, 2.0], [8.2, 3.4], [10.4, 3.4]]) { L.table(u - 0.3, v - 0.3, u + 0.3, v + 0.3, 0.74, wood, 1); L.floorSpot(u - 0.55, v, PI / 2); }
    L.floorSpot(10.95, 2.0, -PI / 2); L.floorSpot(10.95, 3.4, -PI / 2);
    for (const u of [2.5, 5.0, 7.5]) L.pendant(u, 6.0, 2.4, 0x2f4a3a, 'cone', 0.34);
    L.wallPicture('R', 2.6, 2.3, 1.8, 0.9, menuTex('Le Petit Noir', [['Expresso', '1,60 €'], ['Café crème', '2,90 €'], ['Chocolat chaud', '3,20 €'], ['Croque-monsieur', '6,50 €']]));
  },
  pizzeria(L) {
    const wood = 0x6d4c41, cream = 0xf3e9d2, red = 0xc62828;
    L.counter(0.9, 5.6, 9.6, 6.4, 1.05, wood, 1, cream);
    L.wallFloor('B', 3.0);                                              // four à pizza
    L.counterSpot(8.6, 6.0, 1.05, L.faceFront + PI);                    // fontaine à sodas
    L.wallBlock('B', 5.0, 8.8, 0, 0.92, 0.7, 0xb0bec5, null, 'kitchen'); L.board('u', 5.1, 8.7, 9.53, 0.92, 0.6, 0.4, L.faceFront);
    for (const [u, v] of [[2.0, 1.9], [2.0, 3.3], [9.8, 2.4]]) { L.table(u - 0.4, v - 0.4, u + 0.4, v + 0.4, 0.75, red, 1); L.floorSpot(u - 0.72, v, PI / 2); L.floorSpot(u + 0.72, v, -PI / 2); }
    for (const [a, c] of [[0.8, 0x2e7d32], [3.73, 0xfafafa], [6.67, 0xc62828]]) L.wallPanel('B', a, a + 2.93, 3.45, 3.62, c, 0.02); // bandeau tricolore
    L.wallPicture('B', 6.9, 2.5, 3.4, 1.0, menuTex('Pizzas au feu de bois', [['Margherita', '9,00 €'], ['Regina', '11,50 €'], ['Quatre fromages', '12,00 €'], ['Calzone', '12,50 €']]));
    L.pendant(2.0, 2.6, 2.3, 0x6d4c41, 'cone', 0.32); L.pendant(9.8, 2.4, 2.3, 0x6d4c41, 'cone', 0.32);
  },
  burger(L) {
    const red = 0xc62828, steel = 0xb0bec5;
    L.counter(0.9, 5.6, 9.6, 6.4, 1.05, red, 2, steel);
    L.wallFloor('B', 1.4); L.wallFloor('B', 2.1);                         // friteuses
    L.counterSpot(8.9, 6.0, 1.05, L.faceFront + PI);                     // fontaine à sodas
    L.wallBlock('B', 2.8, 8.8, 0, 0.92, 0.7, steel, null, 'kitchen'); L.board('u', 3.0, 8.6, 9.53, 0.92, 0.6, 0.4, L.faceFront);
    const lines = [[['Big Burger', '8,90 €'], ['Double cheese', '6,50 €'], ['Chicken crispy', '7,40 €'], ['Veggie', '7,90 €']], [['Menu Maxi', '11,90 €'], ['Frites', '2,90 €'], ['Nuggets x9', '5,20 €'], ['Soda', '2,50 €']], [['Sundae', '3,20 €'], ['Milkshake', '3,90 €'], ['Cookie', '1,90 €']]];
    L.litPanel('B', 1.0, 3.9, 2.35, 3.35, menuTex('BURGERS', lines[0], 'lit', '#ffc107'));
    L.litPanel('B', 4.05, 6.95, 2.35, 3.35, menuTex('MENUS', lines[1], 'lit', '#ffc107'));
    L.litPanel('B', 7.1, 8.8, 2.35, 3.35, menuTex('DESSERTS', lines[2], 'lit', '#ffc107'));
    for (const v0 of [1.0, 2.65]) { // box le long du mur gauche : deux banquettes face à face et une table
      L.bench(0.17, v0, 1.5, v0 + 0.5, red, 'v0'); L.bench(0.17, v0 + 1.1, 1.5, v0 + 1.6, red, 'v1');
      L.table(0.25, v0 + 0.55, 1.4, v0 + 1.05, 0.74, 0xfafafa, 1, { style: 'pedestal' });
    }
    for (const [u, v] of [[8.3, 2.0], [10.3, 2.0], [8.3, 3.4]]) { L.table(u - 0.35, v - 0.35, u + 0.35, v + 0.35, 0.74, 0xfafafa, 1); L.floorSpot(u - 0.62, v, PI / 2); L.floorSpot(u + 0.62, v, -PI / 2); }
  },
  sushi(L) {
    const wood = 0xc8a46e, dark = 0x2b1d14;
    L.solid(0.9, 1.6, 2.1, 8.6, 0, 0.95); kCounter(L.penAt(1.5, 5.1, L.ryOf(1, 0)), { L: 7.0, D: 1.2, h: 1.0, color: dark, top: wood }); // comptoir du tapis
    L.counterSpot(1.5, 5.1, 1.0, PI / 2);                                // tapis à sushis (1er emplacement)
    for (const v of [2.3, 3.4, 4.5, 5.6, 6.7, 7.8]) L.floorSpot(2.55, v, -PI / 2); // tabourets (chaises)
    L.wallBlock('B', 3.0, 8.8, 0, 0.92, 0.65, 0xb0bec5, null, 'kitchen'); L.counterSpot(4.0, 9.55, 0.92, L.faceFront); // cuisine, cuiseur à riz
    L.board('u', 5.0, 8.6, 9.55, 0.92, 0.5, 0.4, L.faceFront);
    L.counter(8.8, 1.4, 10.8, 2.1, 1.0, dark, 1, wood);
    L.table(7.6, 2.6, 8.6, 3.4, 0.4, wood, 1); L.rug(7.3, 2.3, 8.9, 3.7, 0x9e2b25, 0xd8c39a);
    for (const v of [2.6, 4.6, 6.6]) L.pendant(1.5, v, 2.3, 0xf5efe0, 'globe', 0.4);
    L.plant(10.9, 9.2, 1.1, 0x2b1d14);
  },
  glacier(L) {
    const white = 0xfafafa, blue = 0x81d4fa;
    L.glassCounter(1.0, 5.4, 9.6, 6.2, 1.15, white, blue, { regU: 8.9 });
    L.wallFloor('B', 2.2); L.wallFloor('B', 4.0);                         // congélateurs
    L.wallBlock('B', 5.2, 8.8, 0, 0.92, 0.6, white, null, 'doors', { top: 0xdfe6ea }); L.board('u', 5.3, 8.7, 9.58, 0.92, 0.5, 0.4, L.faceFront, null, { noLabels: true });
    for (const [u, v] of [[2.0, 2.2], [9.6, 2.2]]) { L.table(u - 0.35, v - 0.35, u + 0.35, v + 0.35, 0.74, white, 1); L.floorSpot(u - 0.62, v, PI / 2); L.floorSpot(u + 0.62, v, -PI / 2); }
    for (const [u, c] of [[2.4, 0xf8bbd0], [5.0, 0xb3e5fc], [7.6, 0xfff59d]]) L.pendant(u, 5.8, 2.35, c, 'globe', 0.34);
    L.wallPicture('B', 7.0, 2.7, 3.2, 0.9, menuTex('Nos parfums', [['1 boule', '2,50 €'], ['2 boules', '4,50 €'], ['3 boules', '6,00 €'], ['Coupe Banquise', '7,90 €']]));
  },
  fleuriste(L) {
    const wood = 0x6d4c41;
    for (const [u, v] of [[2.3, 2.4], [9.4, 2.6], [2.4, 6.6], [6.4, 6.6]]) L.table(u - 1, v - 0.6, u + 1, v + 0.6, 0.6, wood, 2);
    L.wallShelf('L', 4.0, 9.0, 3, 1.6, 0.5, wood, null, { metal: false, back: 0x5d4037, backMetal: false });
    // étagère du fond arrêtée avant le comptoir : la fleuriste a la place de se tenir derrière sa caisse
    L.wallShelf('B', 1.0, 7.0, 3, 1.6, 0.5, wood, null, { metal: false, back: 0x5d4037, backMetal: false });
    L.counter(7.6, 8.4, 9.6, 9.1, 1.0, 0xad1457, 1, wood);
    const flowers = [0xe53935, 0xffeb3b, 0xf8bbd0, 0xffffff, 0x8e24aa, 0xff9800];
    for (const [u, v] of [[4.6, 1.2], [7.4, 1.2], [10.9, 4.0], [10.9, 5.4], [0.62, 3.62]]) { // seaux de fleurs (le dernier devant l'étagère, plus dedans)
      const cols = []; for (let k = 0; k < 5; k++) cols.push(L.rng.pick(flowers));
      flowerBucket(L.penAt(u, v, 0), [...cols, ...cols.slice(0, 2)], () => L.frng.next());
      L.solid(u - 0.21, v - 0.21, u + 0.21, v + 0.21, 0, 0.8); // seau et bouquet
    }
    L.plant(10.8, 9.0, 1.1); L.plant(0.6, 9.45, 0.9);
  },
  quincaillerie(L) {
    const grey = 0xbdbdbd, orange = 0xef6c00;
    L.island(0.9, 8.9, 5.6, 5, 1.9, 0xd0d0d0, 1.0); L.island(0.9, 8.9, 7.6, 5, 1.9, 0xd0d0d0, 1.0);
    L.wallShelf('L', 1.4, 4.8, 5, 2.2, 0.4, grey); L.wallShelf('R', 2.6, 9.0, 5, 2.2, 0.4, grey);
    L.wallShelf('B', 0.8, 8.8, 4, 2.2, 0.45, grey);
    L.table(1.4, 2.0, 4.0, 2.8, 0.8, orange, 2);                           // promotions
    L.drawers('R', 1.0, 2.4, 0, 1.0, 0.5, 0x546e7a, 0x263238, 3, 6);       // casiers de visserie
    L.counter(8.8, 1.2, 10.8, 2.0, 1.0, orange, 1, 0x424242);
    L.floorSpot(1.2, 1.0, 0); L.floorSpot(1.8, 1.0, 0);
  },
  bijouterie(L) {
    const dark = 0x2b2b38, gold = 0xc9a227;
    jewelCase(L, 0.95, 2.0, 1.65, 8.0, 'v');
    jewelCase(L, 2.6, 6.4, 8.0, 7.1, 'u');
    jewelCase(L, 9.4, 1.6, 10.6, 3.4, 'v');
    L.counter(8.06, 6.4, 9.66, 7.1, 1.0, dark, 1, gold);                // contre la vitrine, sans y entrer (plateau débordant)
    L.wallShelf('B', 1.0, 8.8, 3, 1.8, 0.3, dark, null, { back: 0x1a1a24, backMetal: false, metal: false });
    for (const u of [4.0, 6.2]) L.chairDeco(u, 5.85, 0, 0x5a1f3a);
    for (const u of [3.4, 5.3, 7.2]) L.pendant(u, 6.75, 2.3, 0xe8e8e8, 'globe', 0.26);
    L.plant(10.9, 9.2, 0.8);
  },
};
