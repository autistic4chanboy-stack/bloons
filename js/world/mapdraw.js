// Plan du centre « façon pancarte » : dessin canvas 2D, sans three. Le même dessin sert aux bornes du centre (une
// texture 1536 × 1024 par niveau, partagée par tous les panneaux du niveau) et à la vue plein écran (à la taille de
// l'écran, repère « vous êtes ici » vivant). Le modèle (zones, murs et vitrages relevés dans la physique, escalators,
// ascenseur, escaliers, pictogrammes, numéros des boutiques) est relevé dans le monde par mallmap.js.

export const FONT = 'Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif';
// catégories du répertoire (aplats de couleur du plan)
export const CATS = [
  { id: 'mode', name: 'Mode & accessoires', color: '#c4457a' },
  { id: 'alim', name: 'Alimentation', color: '#4a9a57' },
  { id: 'resto', name: 'Restauration', color: '#e0762a' },
  { id: 'beaute', name: 'Beauté & santé', color: '#22a09e' },
  { id: 'maison', name: 'Maison & déco', color: '#c4951a' },
  { id: 'loisirs', name: 'Loisirs & culture', color: '#6a5bc3' },
  { id: 'services', name: 'Services', color: '#2f77be' },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
const C = {
  paper: '#f4f1ea', card: '#fdfcf8', ink: '#1b2430', dim: '#66717d', navy: '#13263e', navy2: '#24405f', gold: '#f2b632', cream: '#f5eedd',
  floor: '#ebe5d7', wall: '#353e49', glass: '#4b9ccb', staff: '#dcdedf', staffLine: '#c2c6c9', park: '#d0d6dc', bay: '#f6f7f8', out: '#dfe6da',
  voidC: '#c4d4df', esc: '#c9cdd2', red: '#d5232b', closed: '#c6cacd', sec: '#cddcea', wc: '#d4e5ee',
};
export const LEVEL_NAMES = { '-1': 'Parking −1', 0: 'Niveau 0', 1: 'Niveau 1' };
const LEVEL_TITLES = { '-1': 'Niveau −1 · Parking', 0: 'Niveau 0 · Rez-de-chaussée', 1: 'Niveau 1 · Étage' };
const TAB_ORDER = [-1, 0, 1];

// ───────── utilitaires ─────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mix(a, b, t) { const p = hexRGB(a), q = hexRGB(b); return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
const lum = (h) => { const [r, g, b] = hexRGB(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const font = (ctx, px, w = 700, fam = FONT) => { ctx.font = `${w} ${Math.max(1, px).toFixed(1)}px ${fam}`; };
// police ajustée à une largeur (descend jusqu'à min, puis tronque avec « … »)
function fit(ctx, text, maxW, px, min, w = 700) {
  font(ctx, px, w);
  while (px > min && ctx.measureText(text).width > maxW) { px *= 0.93; font(ctx, px, w); }
  if (ctx.measureText(text).width <= maxW) return { text, px };
  let t = text; while (t.length > 2 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return { text: t.trimEnd() + '…', px };
}
// texte espacé (petites capitales de signalétique)
function spaced(ctx, text, x, y, sp, align = 'left') {
  let w = 0; for (const ch of text) w += ctx.measureText(ch).width + sp; w -= sp;
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const a = ctx.textAlign; ctx.textAlign = 'left';
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
  ctx.textAlign = a; return w;
}
const hatches = new Map();
function hatch(ctx, k, fg, bg) { // motif de hachures (personnel) mis en cache par taille
  const n = Math.max(4, Math.round(k)), key = n + fg + bg;
  if (!hatches.has(key)) {
    const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, n, n); x.strokeStyle = fg; x.lineWidth = Math.max(1, n * 0.16);
    x.beginPath(); for (const o of [-n, 0, n]) { x.moveTo(o, n); x.lineTo(o + n, 0); } x.stroke();
    hatches.set(key, c);
  }
  return ctx.createPattern(hatches.get(key), 'repeat');
}
function arrowHead(ctx, x0, y0, x1, y1, len) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - len * Math.cos(a - 0.5), y1 - len * Math.sin(a - 0.5)); ctx.lineTo(x1 - len * Math.cos(a + 0.5), y1 - len * Math.sin(a + 0.5)); ctx.closePath(); ctx.fill();
}
function arrow(ctx, x0, y0, x1, y1, w, head) { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - (x1 - x0) * 0.12, y1 - (y1 - y0) * 0.12); ctx.stroke(); arrowHead(ctx, x0, y0, x1, y1, head); }

// ───────── pictogrammes (carré arrondi, glyphe blanc dessiné dans un repère 100 × 100) ─────────
const BLUE = '#1d5ea8', GREEN = '#12814a';
const man = (x, P, s = 1) => { P.beginPath(); P.arc(x, 22, 8 * s, 0, 7); P.fill(); rr(P, x - 9 * s, 33, 18 * s, 28, 5); P.fill(); P.fillRect(x - 8 * s, 58, 6.5 * s, 26); P.fillRect(x + 1.5 * s, 58, 6.5 * s, 26); };
export const PICTOS = {
  wc: { bg: BLUE, label: 'Toilettes', draw(P) {
    man(30, P); P.beginPath(); P.arc(70, 22, 8, 0, 7); P.fill();
    P.beginPath(); P.moveTo(70, 32); P.lineTo(84, 66); P.lineTo(56, 66); P.closePath(); P.fill(); P.fillRect(62, 64, 6, 20); P.fillRect(72, 64, 6, 20);
    P.fillRect(48.5, 14, 3, 72);
  } },
  elev: { bg: BLUE, label: 'Ascenseur', draw(P) {
    P.lineWidth = 6; rr(P, 22, 12, 56, 76, 6); P.stroke(); P.fillRect(48, 15, 4, 70);
    P.beginPath(); P.moveTo(35, 30); P.lineTo(27, 42); P.lineTo(43, 42); P.closePath(); P.fill();
    P.beginPath(); P.moveTo(65, 70); P.lineTo(57, 58); P.lineTo(73, 58); P.closePath(); P.fill();
  } },
  esc: { bg: BLUE, label: 'Escalator', draw(P) {
    P.lineWidth = 11; P.beginPath(); P.moveTo(12, 82); P.lineTo(30, 82); P.lineTo(66, 40); P.lineTo(88, 40); P.stroke();
    P.beginPath(); P.arc(44, 30, 7, 0, 7); P.fill(); P.lineWidth = 8; P.beginPath(); P.moveTo(44, 40); P.lineTo(41, 60); P.stroke();
    P.lineWidth = 6; arrow(P, 70, 76, 88, 58, 6, 14);
  } },
  stairs: { bg: BLUE, label: 'Escalier', draw(P) {
    P.lineWidth = 8; P.beginPath(); P.moveTo(12, 84); P.lineTo(32, 84); P.lineTo(32, 66); P.lineTo(50, 66); P.lineTo(50, 48); P.lineTo(68, 48); P.lineTo(68, 30); P.lineTo(88, 30); P.stroke();
    arrow(P, 18, 56, 42, 30, 6, 14);
  } },
  exit: { bg: GREEN, label: 'Sortie', draw(P) {
    P.lineWidth = 7; P.beginPath(); P.moveTo(58, 18); P.lineTo(82, 18); P.lineTo(82, 84); P.lineTo(58, 84); P.stroke();
    arrow(P, 14, 51, 70, 51, 11, 24);
  } },
  emerg: { bg: GREEN, label: 'Sortie de secours', draw(P) {
    P.lineWidth = 5; P.strokeRect(64, 14, 22, 72);
    P.beginPath(); P.arc(42, 20, 8, 0, 7); P.fill(); P.lineWidth = 10;
    P.beginPath(); P.moveTo(40, 32); P.lineTo(32, 56); P.stroke();
    P.lineWidth = 7; P.beginPath(); P.moveTo(20, 46); P.lineTo(29, 36); P.lineTo(42, 36); P.lineTo(54, 46); P.stroke();
    P.beginPath(); P.moveTo(32, 56); P.lineTo(46, 66); P.lineTo(44, 84); P.stroke();
    P.beginPath(); P.moveTo(32, 56); P.lineTo(22, 70); P.lineTo(10, 72); P.stroke();
  } },
  info: { bg: BLUE, label: 'Accueil · informations', draw(P) { P.textAlign = 'center'; P.textBaseline = 'alphabetic'; P.font = '700 80px Georgia, "Times New Roman", serif'; P.fillText('i', 50, 82); } },
  sec: { bg: '#1c3150', label: 'Poste de sécurité', draw(P) {
    P.beginPath(); P.moveTo(50, 10); P.lineTo(83, 22); P.lineTo(81, 50); P.quadraticCurveTo(77, 76, 50, 90); P.quadraticCurveTo(23, 76, 19, 50); P.lineTo(17, 22); P.closePath(); P.fill();
    P.fillStyle = '#1c3150'; P.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 8 : 19; P.lineTo(50 + Math.cos(a) * r, 47 + Math.sin(a) * r); } P.closePath(); P.fill();
  } },
  atm: { bg: BLUE, label: 'Distributeur de billets', draw(P) {
    P.fillRect(18, 12, 64, 10); P.textAlign = 'center'; P.textBaseline = 'alphabetic'; P.font = '700 62px ' + FONT; P.fillText('€', 50, 82);
  } },
  vend: { bg: BLUE, label: 'Boissons', draw(P) {
    P.beginPath(); P.moveTo(30, 30); P.lineTo(70, 30); P.lineTo(63, 86); P.lineTo(37, 86); P.closePath(); P.fill(); P.fillRect(26, 22, 48, 8);
    P.lineWidth = 5; P.beginPath(); P.moveTo(52, 22); P.lineTo(58, 8); P.lineTo(68, 8); P.stroke();
  } },
  park: { bg: BLUE, label: 'Parking', draw(P) { P.textAlign = 'center'; P.textBaseline = 'alphabetic'; P.font = '700 84px ' + FONT; P.fillText('P', 51, 82); } },
};
export const LEGEND_PICTOS = ['info', 'sec', 'wc', 'elev', 'esc', 'stairs', 'exit', 'emerg', 'atm', 'park'];
export function picto(ctx, t, cx, cy, s, dimmed) {
  const P = PICTOS[t]; if (!P) return;
  ctx.save(); if (dimmed) ctx.globalAlpha *= 0.45;
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = s * 0.12; ctx.shadowOffsetY = s * 0.04;
  rr(ctx, cx - s / 2, cy - s / 2, s, s, s * 0.2); ctx.fillStyle = P.bg; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.translate(cx - s / 2, cy - s / 2); ctx.scale(s / 100, s / 100);
  ctx.fillStyle = ctx.strokeStyle = '#fff'; ctx.lineCap = ctx.lineJoin = 'round'; P.draw(ctx); ctx.restore();
}

// ───────── repère « vous êtes ici » : point rouge cerclé de blanc et cône du regard ─────────
// yaw : convention du jeu (0 regarde vers −z, le sud ; le nord est en haut du plan)
export function youMarker(ctx, x, y, r, yaw, cone = true) {
  ctx.save();
  if (cone && yaw !== undefined && yaw !== null) {
    const a = Math.atan2(Math.cos(yaw), -Math.sin(yaw)), L = r * 5.2, h = 0.62;
    const gr = ctx.createRadialGradient(x, y, r * 0.5, x, y, L); gr.addColorStop(0, 'rgba(213,35,43,0.62)'); gr.addColorStop(1, 'rgba(213,35,43,0.04)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, L, a - h, a + h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(213,35,43,0.8)'; ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a - h) * L * 0.85, y + Math.sin(a - h) * L * 0.85); ctx.lineTo(x, y); ctx.lineTo(x + Math.cos(a + h) * L * 0.85, y + Math.sin(a + h) * L * 0.85); ctx.stroke();
  }
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = r * 0.6;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, 7); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.28, 0, 7); ctx.fill();
  ctx.restore();
}
function youLabel(ctx, x, y, r, u, box) {
  const fs = Math.max(13 * u, 8.5); font(ctx, fs, 800); const t = 'VOUS ÊTES ICI', w = ctx.measureText(t).width + fs * 1.1, h = fs * 1.55;
  let lx = x + r * 2.2, ly = y - r * 1.5 - h;
  if (lx + w > box.x + box.w) lx = x - r * 2.2 - w; if (ly < box.y) ly = y + r * 1.5;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 4 * u; rr(ctx, lx, ly, w, h, h / 2); ctx.fillStyle = C.red; ctx.fill(); ctx.restore();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, lx + fs * 0.55, ly + h / 2 + 0.5);
}

// ───────── plan d'un niveau dans un rectangle ─────────
// o : { closed(id) → vrai si le magasin est fermé cette nuit, you: {x, z, yaw}, u : unité typographique, live }
export function drawPlan(ctx, model, L, box, o = {}) {
  const e = L.ext, u = o.u || 1, s = Math.min(box.w / (e.x1 - e.x0), box.h / (e.z1 - e.z0));
  const ox = box.x + (box.w - (e.x1 - e.x0) * s) / 2, oy = box.y + (box.h - (e.z1 - e.z0) * s) / 2;
  const X = (x) => ox + (x - e.x0) * s, Y = (z) => oy + (e.z1 - z) * s;
  const R = (r) => [X(r[0]), Y(r[3]), (r[2] - r[0]) * s, (r[3] - r[1]) * s];
  const shops = model.shopById, closed = o.closed || (() => false);
  const hp = hatch(ctx, 7 * u, C.staffLine, C.staff);
  ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  ctx.lineJoin = 'miter';
  // ── aplats des zones ──
  for (const f of L.fills) {
    const [px, py, pw, ph] = R(f.r);
    if (f.t === 'out') {
      ctx.fillStyle = C.out; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#f7faf4'; ctx.lineWidth = Math.max(1, 0.12 * s); // places du parking extérieur (stylisées)
      for (const zc of [-16, 16]) for (let x = f.r[0] + 6; x < f.r[2] - 1; x += 2.6) { ctx.beginPath(); ctx.moveTo(X(x), Y(zc - 2.4)); ctx.lineTo(X(x), Y(zc + 2.4)); ctx.stroke(); }
      continue;
    }
    if (f.t === 'shop') { const sh = shops[f.shop]; ctx.fillStyle = sh && closed(sh.id) ? C.closed : (CAT[sh?.cat]?.color || '#8a96a3'); }
    else if (f.t === 'back') { const sh = shops[f.shop]; const col = sh && !closed(sh.id) ? (CAT[sh.cat]?.color || '#8a96a3') : C.closed; ctx.fillStyle = hatch(ctx, 6 * u, mix(col, '#ffffff', 0.25), mix(col, '#b9bfc5', 0.62)); }
    else if (f.t === 'staff' || (f.t === 'stairs' && !f.pub)) ctx.fillStyle = hp;
    else if (f.t === 'sec') ctx.fillStyle = C.sec;
    else if (f.t === 'wc') ctx.fillStyle = C.wc;
    else if (f.t === 'park') ctx.fillStyle = C.park;
    else if (f.t === 'ramp') ctx.fillStyle = '#bcc3ca';
    else ctx.fillStyle = C.floor;
    ctx.fillRect(px, py, pw, ph);
  }
  // ── parking : places, sens de circulation ──
  if (L.bays) {
    ctx.strokeStyle = C.bay; ctx.lineWidth = Math.max(1, 0.13 * s);
    for (const b of L.bays) { ctx.beginPath(); ctx.moveTo(X(b[0]), Y(b[1])); ctx.lineTo(X(b[2]), Y(b[3])); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    for (const a of L.arrows || []) arrow(ctx, X(a[0]), Y(a[1]), X(a[2]), Y(a[3]), Math.max(1.2, 0.35 * s), Math.max(4, 1.2 * s));
  }
  // ── vides de l'étage (garde-corps : vitrages relevés plus bas) ──
  for (const v of L.voids || []) {
    const [px, py, pw, ph] = R(v); const gr = ctx.createLinearGradient(0, py, 0, py + ph);
    gr.addColorStop(0, '#b7c9d6'); gr.addColorStop(0.5, '#cfdce5'); gr.addColorStop(1, '#b7c9d6'); ctx.fillStyle = gr; ctx.fillRect(px, py, pw, ph);
  }
  // ── fontaine, kiosques ──
  if (L.fountain) {
    const f = L.fountain, cx = X(f.x), cy = Y(f.z);
    ctx.fillStyle = '#e4ddd0'; ctx.beginPath(); ctx.arc(cx, cy, f.r * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#8fc6e0'; ctx.beginPath(); ctx.arc(cx, cy, f.r * s * 0.82, 0, 7); ctx.fill();
    ctx.fillStyle = '#d9eef7'; ctx.beginPath(); ctx.arc(cx, cy, f.r * s * 0.3, 0, 7); ctx.fill();
  }
  // ── escalators : marches, sens de la montée ──
  for (const esc of L.esc || []) {
    const [px, py, pw, ph] = R(esc.r);
    ctx.fillStyle = C.esc; ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#a6acb3'; ctx.lineWidth = Math.max(0.7, 0.06 * s);
    for (let x = esc.r[0] + 0.5; x < esc.r[2]; x += 0.45) { ctx.beginPath(); ctx.moveTo(X(x), py + ph * 0.12); ctx.lineTo(X(x), py + ph * 0.88); ctx.stroke(); }
    ctx.strokeStyle = '#5d6670'; ctx.lineWidth = Math.max(1, 0.12 * s); ctx.strokeRect(px, py, pw, ph);
    ctx.fillStyle = '#3f4852'; const cy = py + ph / 2, n = 3;
    for (let i = 0; i < n; i++) { // chevrons dans le sens de la montée
      const cx = px + pw * (0.3 + i * 0.2), d = esc.dir * Math.min(ph * 0.32, 0.9 * s);
      ctx.beginPath(); ctx.moveTo(cx + d, cy); ctx.lineTo(cx - d * 0.2, cy - ph * 0.3); ctx.lineTo(cx - d * 0.2, cy + ph * 0.3); ctx.closePath(); ctx.fill();
    }
  }
  // ── marches des escaliers (relevées dans la physique) ──
  if (L.treads?.length) {
    ctx.strokeStyle = 'rgba(70,78,88,0.55)'; ctx.lineWidth = Math.max(0.6, 0.05 * s);
    for (const t of L.treads) { const [px, py, pw, ph] = R(t); ctx.strokeRect(px, py, pw, ph); }
  }
  // ── kiosques (îlots numérotés) ──
  for (const k of L.kiosks || []) {
    const kq = model.kioskById[k], [px, py, pw, ph] = R([kq.x - kq.w / 2, kq.z - kq.d / 2, kq.x + kq.w / 2, kq.z + kq.d / 2]);
    rr(ctx, px, py, pw, ph, Math.min(pw, ph) * 0.25); ctx.fillStyle = CAT[kq.cat]?.color || '#888'; ctx.fill();
  }
  // ── ascenseur ──
  if (L.elev) { const [px, py, pw, ph] = R(L.elev); ctx.fillStyle = '#d9ebf2'; ctx.fillRect(px, py, pw, ph); }
  // ── murs, puis vitrages ──
  ctx.fillStyle = C.wall; const mw = Math.max(1.1, 1.1 * u);
  for (const w of L.walls) { let [px, py, pw, ph] = R(w); if (pw < mw) { px -= (mw - pw) / 2; pw = mw; } if (ph < mw) { py -= (mw - ph) / 2; ph = mw; } ctx.fillRect(px, py, pw, ph); }
  ctx.fillStyle = C.glass; const gw = Math.max(1.3, 1.3 * u);
  for (const w of L.glass) { let [px, py, pw, ph] = R(w); if (pw < gw) { px -= (gw - pw) / 2; pw = gw; } if (ph < gw) { py -= (gw - ph) / 2; ph = gw; } ctx.fillRect(px, py, pw, ph); }
  if (L.elev) { const [px, py, pw, ph] = R(L.elev); ctx.strokeStyle = C.glass; ctx.lineWidth = gw; ctx.strokeRect(px, py, pw, ph); }
  // entrée principale : seuil marqué en vert
  for (const d of L.mainDoors || []) { const [px, py, pw, ph] = R(d); ctx.fillStyle = GREEN; ctx.fillRect(px - gw, py, Math.max(pw, gw * 2), ph); }
  // ── numéros des boutiques (et nom quand la place le permet) ──
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const minPx = o.live ? 8 : 10;
  for (const f of L.fills) {
    if (f.t !== 'shop' && f.t !== 'wc' && !(f.t === 'staff' && f.shop)) continue;
    const sh = shops[f.shop], [px, py, pw, ph] = R(f.r), cx = px + pw / 2, cy = py + ph / 2;
    if (f.t === 'wc') continue; // pictogramme posé plus bas
    if (!sh) { // locaux du personnel (direction, salle du personnel) : nom discret
      const t = fit(ctx, f.name || '', pw - 6 * u, 11 * u, minPx * 0.9, 600); if (t.px < minPx * 0.85) continue;
      ctx.fillStyle = '#7b848d'; ctx.fillText(t.text, cx, cy); continue;
    }
    const shut = closed(sh.id), col = shut ? C.closed : (CAT[sh.cat]?.color || '#888'), light = lum(col) > 0.62;
    const nPx = clamp(Math.min(pw * 0.36, ph * 0.34), minPx + 1, 44 * u);
    font(ctx, nPx, 800); ctx.fillStyle = shut ? '#7d858c' : light ? C.ink : '#ffffff';
    const nm = fit(ctx, sh.short, pw - 8 * u, nPx * 0.42, minPx, 700), showName = nm.px >= minPx && ph > nPx * 1.9 && !nm.text.endsWith('…');
    const ny = showName ? cy - nm.px * 0.75 : cy - (shut ? nPx * 0.2 : 0);
    font(ctx, nPx, 800); ctx.fillText(String(sh.num), cx, ny);
    if (showName) { font(ctx, nm.px, 700); ctx.fillText(nm.text, cx, ny + nPx * 0.5 + nm.px * 0.8); }
    if (shut) { font(ctx, Math.max(minPx, nPx * 0.34), 700, 'Georgia, serif'); ctx.fillStyle = '#6e767d'; ctx.fillText('fermé', cx, ny + nPx * 0.62 + (showName ? nm.px * 1.4 : 0)); }
  }
  for (const k of L.kiosks || []) {
    const kq = model.kioskById[k], cx = X(kq.x), cy = Y(kq.z), px = clamp(Math.min(kq.w, kq.d) * s * 0.5, minPx, 20 * u);
    font(ctx, px, 800); ctx.fillStyle = '#fff'; ctx.fillText(kq.num, cx, cy);
  }
  // ── étiquettes des zones ──
  for (const l of L.labels || []) {
    const big = l.k === 'area', px0 = Math.max((big ? 15 : 11) * u * (l.scale || 1), o.live ? 8 : 0), maxW = l.w ? l.w * s * (big ? 1.25 : 1.05) - 4 * u : 260 * u;
    const t = fit(ctx, big ? l.s.toUpperCase() : l.s, maxW, px0, minPx * (big ? 1 : 0.85), big ? 800 : 600);
    if (t.text.endsWith('…')) continue; // une étiquette qui ne tient pas est omise (jamais tronquée sur le plan)
    ctx.fillStyle = l.k === 'staff' ? '#737c85' : big ? C.navy2 : C.ink;
    if (big) { font(ctx, t.px, 800); spaced(ctx, t.text, X(l.x), Y(l.z), t.px * 0.08, 'center'); }
    else { font(ctx, t.px, 600); ctx.fillText(t.text, X(l.x), Y(l.z)); }
  }
  // ── pictogrammes ──
  const ps = o.live ? clamp(2.9 * s, 11, 26) : clamp(2.9 * s, 15 * u, 30 * u);
  for (const p of L.pictos) picto(ctx, p.t, X(p.x), Y(p.z), p.big ? ps * 1.25 : ps);
  ctx.restore();
  const tf = { X, Y, s, box };
  if (o.you) drawYou(ctx, tf, o.you, u);
  return tf;
}
// repère « vous êtes ici » sur un plan déjà dessiné (tf : transformation renvoyée par drawPlan) ; pulse 0..1
export function drawYou(ctx, tf, you, u, pulse = 0) {
  const { X, Y, s, box } = tf, r = clamp(0.95 * s, Math.max(5 * u, 4.5), Math.max(11 * u, 6.5));
  const mx = clamp(X(you.x), box.x + r, box.x + box.w - r), my = clamp(Y(you.z), box.y + r, box.y + box.h - r);
  if (pulse) { ctx.save(); ctx.strokeStyle = `rgba(213,35,43,${0.55 * (1 - pulse)})`; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(mx, my, r * (1.5 + pulse * 1.6), 0, 7); ctx.stroke(); ctx.restore(); }
  youMarker(ctx, mx, my, r, you.yaw); youLabel(ctx, mx, my, r, u, box);
}

// ───────── pancarte complète : en-tête, onglets, plan, répertoire, services ─────────
// o : { you: {x, z, yaw, k} (repère dessiné sur son niveau ; marker: false → seulement la pastille de son onglet),
//       closed(id), levelClosed(k), live (vue plein écran), hint (pied de page) }
// Renvoie { tf, tabs: [{k, x, y, w, h}], u } (onglets cliquables, transformation du plan)
// Petit écran (vue plein écran sous 1000 × 560) : titre du niveau dans les onglets, services et catégories sur deux
// lignes sous le plan, répertoire sur toute la largeur — tout reste lisible en 640 × 360.
const SVC_SHORT = { info: 'Accueil', sec: 'Sécurité', wc: 'WC', elev: 'Ascenseur', esc: 'Escalator', stairs: 'Escalier', exit: 'Sortie', emerg: 'Secours', atm: 'Billets', park: 'Parking' };
const CAT_SHORT = { mode: 'Mode', alim: 'Alimentation', resto: 'Restauration', beaute: 'Beauté · santé', maison: 'Maison · déco', loisirs: 'Loisirs', services: 'Services' };
export function drawBoard(ctx, model, k, W, H, o = {}) {
  const L = model.levels[k]; if (!L) return null;
  const live = !!o.live, base = Math.min(W / 1536, H / 1024), compact = live && (W < 1000 || H < 560);
  const u = live ? Math.max(base, Math.min(0.5, H / 720)) : base, m = compact ? 10 : 22 * u;
  const T = (n, min = 9) => (live ? Math.max(n * u, min) : n * u); // taille de texte, plancher lisible à l'écran
  const out = { tabs: [], u };
  ctx.save(); ctx.textBaseline = 'middle'; ctx.lineCap = 'butt';
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  // ── en-tête : soleil d'Hélios, titre, onglets de niveaux ──
  const hh = compact ? Math.max(34, 74 * u) : 92 * u, sr = hh * 0.34, sx = m + sr, sy = hh / 2;
  ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, hh); ctx.fillStyle = C.gold; ctx.fillRect(0, hh, W, Math.max(2, 4 * u));
  ctx.strokeStyle = C.gold; ctx.lineWidth = sr * 0.13; ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * sr * 0.72, sy + Math.sin(a) * sr * 0.72); ctx.lineTo(sx + Math.cos(a) * sr, sy + Math.sin(a) * sr); ctx.stroke(); }
  ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(sx, sy, sr * 0.52, 0, 7); ctx.fill();
  ctx.fillStyle = C.navy; ctx.beginPath(); ctx.arc(sx + sr * 0.14, sy - sr * 0.1, sr * 0.37, 0, 7); ctx.fill(); ctx.lineCap = 'butt';
  const tabH = compact ? hh * 0.62 : 40 * u, tabW = compact ? clamp(W * 0.14, 72, 132) : 168 * u, tg = compact ? 5 : 8 * u;
  const tx0 = W - m - TAB_ORDER.length * tabW - (TAB_ORDER.length - 1) * tg, tlx = sx + sr + (compact ? 8 : 14 * u), titleMax = tx0 - tlx - 10;
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
  let t = fit(ctx, 'CENTRE COMMERCIAL HÉLIOS', titleMax, compact ? hh * 0.36 : 36 * u, 9, 800); font(ctx, t.px, 800);
  const tw = spaced(ctx, t.text, tlx, sy - (compact ? hh * 0.15 : 12 * u), t.px * 0.06);
  ctx.fillStyle = C.gold; t = fit(ctx, '— Plan du centre —', Math.max(tw, 90), compact ? Math.max(9, hh * 0.27) : 21 * u, 8, 'italic 400'); font(ctx, t.px, 'italic 400', 'Georgia, "Times New Roman", serif');
  ctx.fillText(t.text, tlx + 1, sy + (compact ? hh * 0.24 : 20 * u));
  TAB_ORDER.forEach((lk, i) => {
    const x = tx0 + i * (tabW + tg), y = sy - tabH / 2, on = String(lk) === String(k), shut = o.levelClosed?.(lk);
    rr(ctx, x, y, tabW, tabH, tabH / 2); ctx.fillStyle = on ? C.gold : C.navy2; ctx.fill();
    if (!on) { ctx.strokeStyle = 'rgba(245,238,221,0.35)'; ctx.lineWidth = Math.max(1, 1.5 * u); ctx.stroke(); }
    const dot = o.you && String(o.you.k) === String(lk), lt = fit(ctx, LEVEL_NAMES[lk], tabW - (dot ? 30 : 18) * Math.max(u, 0.5), T(19, 9.5), 8, 800); font(ctx, lt.px, 800);
    ctx.fillStyle = on ? C.navy : shut ? 'rgba(245,238,221,0.45)' : C.cream; ctx.textAlign = 'center'; ctx.fillText(lt.text, x + tabW / 2 + (dot ? 5 * Math.max(u, 0.5) : 0), sy + 1);
    if (dot) { const r = Math.max(3, 5 * u); ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x + tabH * 0.42, sy, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, 1.5 * u); ctx.stroke(); }
    out.tabs.push({ k: lk, x, y, w: tabW, h: tabH });
  });
  // ── carte du plan ──
  const fh = compact ? 15 : (live ? 26 : 38) * u, cardY = hh + (compact ? 6 : 16 * u), cardX = m, cardW = W - 2 * m, pad = compact ? 5 : 14 * u, titleH = compact ? 0 : 30 * u;
  const e = L.ext, aspect = (e.x1 - e.x0) / (e.z1 - e.z0), keysH = compact ? 34 : 0;
  const planW = cardW - 2 * pad, legendMin = compact ? 64 : (live ? 120 : 330) * u;
  const planH = Math.max(50, Math.min(planW / aspect, H - cardY - titleH - 2 * pad - keysH - legendMin - fh - (compact ? 10 : 16 * u)));
  const cardH = planH + 2 * pad + titleH;
  ctx.save(); ctx.shadowColor = 'rgba(20,30,45,0.22)'; ctx.shadowBlur = 14 * u; ctx.shadowOffsetY = 4 * u;
  rr(ctx, cardX, cardY, cardW, cardH, compact ? 7 : 14 * u); ctx.fillStyle = C.card; ctx.fill(); ctx.restore();
  if (!compact) { // titre du niveau (pastille)
    ctx.textAlign = 'left'; t = fit(ctx, (LEVEL_TITLES[k] || '').toUpperCase(), cardW * 0.6, T(17), 8, 800); font(ctx, t.px, 800);
    const lw = ctx.measureText(t.text).width + 26 * u; rr(ctx, cardX + pad, cardY + 7 * u, lw, titleH - 6 * u, (titleH - 6 * u) / 2); ctx.fillStyle = C.navy; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(t.text, cardX + pad + 13 * u, cardY + 4 * u + titleH / 2);
  }
  const planBox = { x: cardX + pad, y: cardY + pad + titleH * 0.95, w: planW, h: planH };
  out.tf = drawPlan(ctx, model, L, planBox, { closed: o.closed, you: o.marker !== false && o.you && String(o.you.k) === String(k) ? o.you : null, u, live });
  { // nord et échelle (en haut à droite de la carte ; sur le plan en petit écran)
    const s = out.tf.s, q = compact ? 0.62 : u, nx = cardX + cardW - pad - 16 * q, ny = compact ? planBox.y + 14 : cardY + titleH / 2 + 2 * u;
    if (compact) { ctx.fillStyle = 'rgba(253,252,248,0.85)'; rr(ctx, nx - 80, ny - 11, 92, 22, 6); ctx.fill(); }
    ctx.fillStyle = C.navy; ctx.beginPath(); ctx.moveTo(nx, ny - 13 * q); ctx.lineTo(nx + 8 * q, ny + 9 * q); ctx.lineTo(nx, ny + 4 * q); ctx.lineTo(nx - 8 * q, ny + 9 * q); ctx.closePath(); ctx.fill();
    font(ctx, T(13), 800); ctx.textAlign = 'right'; ctx.fillText('N', nx - 11 * q, ny);
    const sm = s * 10 > 70 * q ? 10 : s * 20 > 70 * q ? 20 : 50, bw = sm * s, bx = nx - 30 * q - bw, by = ny + 2 * q;
    ctx.fillStyle = C.ink; ctx.fillRect(bx, by, bw, 3 * q); ctx.fillRect(bx, by - 4 * q, 1.6 * q, 10 * q); ctx.fillRect(bx + bw - 1.6 * q, by - 4 * q, 1.6 * q, 10 * q);
    font(ctx, T(11), 600); ctx.textAlign = 'right'; ctx.fillText(sm + ' m', bx - 4 * q, by + 1);
  }
  if (o.levelClosed?.(k)) { // niveau entier fermé cette nuit
    ctx.save(); ctx.fillStyle = 'rgba(232,234,236,0.72)'; ctx.fillRect(planBox.x, planBox.y, planBox.w, planBox.h);
    font(ctx, T(20, 11), 800); const msg = 'NIVEAU FERMÉ CETTE NUIT', mh = T(40, 22), mw2 = ctx.measureText(msg).width + mh;
    rr(ctx, planBox.x + planBox.w / 2 - mw2 / 2, planBox.y + planBox.h / 2 - mh / 2, mw2, mh, mh / 2); ctx.fillStyle = '#5c6670'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(msg, planBox.x + planBox.w / 2, planBox.y + planBox.h / 2 + 1); ctx.restore();
  }
  // ── légendes : répertoire des boutiques, services ──
  const ly0 = cardY + cardH + (compact ? 4 : 14 * u), ly1 = H - fh - (compact ? 4 : 10 * u);
  if (compact) {
    keyRow(ctx, { x: m, y: ly0, w: cardW, h: 15 }, LEGEND_PICTOS.map((p) => ({ picto: p, label: SVC_SHORT[p] })));
    keyRow(ctx, { x: m, y: ly0 + 17, w: cardW, h: 14 }, [...CATS.map((c) => ({ color: c.color, label: CAT_SHORT[c.id] })), { staff: true, label: 'Personnel' }]);
    drawDirectory(ctx, model, L, { x: m, y: ly0 + keysH + 2, w: cardW, h: ly1 - ly0 - keysH - 2 }, u, o, true);
  } else {
    const svcW = Math.min(cardW * 0.3, 430 * u), dirW = cardW - svcW - 18 * u;
    drawDirectory(ctx, model, L, { x: m, y: ly0, w: dirW, h: ly1 - ly0 }, u, o, false);
    drawServices(ctx, { x: m + dirW + 18 * u, y: ly0, w: svcW, h: ly1 - ly0 }, u, T);
  }
  // ── pied : horaires, ou touches de la vue plein écran ──
  ctx.fillStyle = C.navy; ctx.fillRect(0, H - fh, W, fh);
  ctx.textAlign = 'center'; ctx.fillStyle = C.cream;
  const foot = o.hint || 'Horaires : du lundi au samedi, 9 h – 21 h · nocturne le vendredi jusqu\'à 22 h · Accueil au niveau 0, hall d\'entrée';
  t = fit(ctx, foot, W - 2 * m, compact ? 9.5 : T(live ? 13 : 16), 7, 600); font(ctx, t.px, 600); ctx.fillText(t.text, W / 2, H - fh / 2 + 1);
  ctx.restore();
  return out;
}

// rangée de clés (petit écran) : pictogrammes ou pastilles de couleur avec un libellé court, centrée
function keyRow(ctx, box, items) {
  const ic = box.h * 0.86, gap = 7, fs = Math.max(8.5, box.h * 0.62);
  font(ctx, fs, 600); let tot = 0; for (const it of items) tot += ic + 3 + ctx.measureText(it.label).width + gap; tot -= gap;
  const k = Math.min(1, box.w / tot); let x = box.x + (box.w - tot * k) / 2; const cy = box.y + box.h / 2;
  if (k < 1) font(ctx, fs * k, 600);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const it of items) {
    if (it.picto) picto(ctx, it.picto, x + ic * k / 2, cy, ic * k);
    else if (it.staff) { ctx.fillStyle = hatch(ctx, 4, C.staffLine, C.staff); rr(ctx, x, cy - ic * k * 0.4, ic * k, ic * k * 0.8, 2); ctx.fill(); ctx.strokeStyle = '#aeb4b9'; ctx.lineWidth = 1; ctx.stroke(); }
    else { ctx.fillStyle = it.color; rr(ctx, x + ic * k * 0.1, cy - ic * k * 0.4, ic * k * 0.8, ic * k * 0.8, 2.5); ctx.fill(); }
    ctx.fillStyle = C.ink; ctx.fillText(it.label, x + (ic + 3) * k, cy + 0.5);
    x += (ic + 3 + ctx.measureText(it.label).width / k + gap) * k;
  }
}

function drawDirectory(ctx, model, L, box, u, o, compact) {
  const closed = o.closed || (() => false), list = [];
  const here = model.shops.filter((s) => s.floor === L.k), kios = L.k === 0 ? model.kiosks : [];
  if (here.length) {
    for (const c of CATS) {
      const items = [...here.filter((s) => s.cat === c.id), ...kios.filter((q) => q.cat === c.id)];
      if (!items.length) continue;
      if (!compact) list.push({ head: c.name, color: c.color });
      for (const s of items) list.push({ s });
    }
  } else { // parking : tout le centre, niveau par niveau
    for (const f of [0, 1]) { list.push({ head: LEVEL_TITLES[f], color: C.navy2 }); for (const s of model.shops.filter((q) => q.floor === f)) list.push({ s }); }
  }
  // colonnes : le moins possible, tant que l'interligne reste confortable
  const minCol = compact ? 112 : 240 * u, maxCols = Math.max(1, Math.floor(box.w / minCol)), minLh = compact ? 13 : 26 * u;
  let cols = 1, rows = list.length;
  for (; cols <= maxCols; cols++) { rows = Math.ceil(list.length / cols); if (box.h / rows >= minLh) break; }
  cols = Math.min(cols, maxCols); rows = Math.ceil(list.length / cols);
  // un titre ne reste pas seul en bas de colonne : une ligne de plus si besoin
  const lh = Math.min(box.h / (rows + 0.5), compact ? 18 : 34 * u), colW = box.w / cols, fs = Math.min(lh * (compact ? 0.72 : 0.64), compact ? 11.5 : 21 * u);
  let i = 0;
  for (let c = 0; c < cols && i < list.length; c++) {
    const x = box.x + c * colW;
    for (let r = 0; r < rows + 1 && i < list.length; r++) {
      const it = list[i]; if ((it.head && r >= rows - 1) || r >= rows + (list[i + 1] ? 0 : 1)) break;
      const y = box.y + r * lh + lh / 2;
      if (it.head) {
        ctx.fillStyle = it.color; rr(ctx, x, y - lh * 0.3, Math.max(3, 5 * u), lh * 0.6, 2); ctx.fill();
        const t = fit(ctx, it.head.toUpperCase(), colW - 16 * u, fs * 0.9, 7, 800); font(ctx, t.px, 800); ctx.fillStyle = C.navy; ctx.textAlign = 'left';
        spaced(ctx, t.text, x + Math.max(6, 11 * u), y + 1, t.px * 0.05);
      } else {
        const s = it.s, shut = closed(s.id), col = shut ? C.closed : (CAT[s.cat]?.color || '#888');
        const cw = fs * 2.05;
        rr(ctx, x, y - fs * 0.64, cw, fs * 1.28, fs * 0.32); ctx.fillStyle = col; ctx.fill();
        font(ctx, fs * 0.84, 800); ctx.fillStyle = lum(col) > 0.62 ? C.ink : '#fff'; ctx.textAlign = 'center'; ctx.fillText(String(s.num), x + cw / 2, y + 1);
        const nmW = colW - cw - fs * 0.9, full = !compact && nmW > fs * 14, t = fit(ctx, full ? s.name : s.short, nmW, fs, Math.min(fs, compact ? 8.5 : 7), 600);
        font(ctx, t.px, 600); ctx.fillStyle = shut ? '#8b9399' : C.ink; ctx.textAlign = 'left'; ctx.fillText(t.text, x + cw + fs * 0.45, y + 1);
        if (shut) { const w = ctx.measureText(t.text).width; font(ctx, t.px * 0.8, 400, 'Georgia, serif'); if (x + cw + fs * 0.7 + w + ctx.measureText(' fermé').width < x + colW) { ctx.fillStyle = '#8b9399'; ctx.fillText(' fermé', x + cw + fs * 0.45 + w + 2, y + 1); } }
      }
      i++;
    }
  }
}

function drawServices(ctx, box, u, T) {
  ctx.save(); rr(ctx, box.x, box.y, box.w, box.h, 12 * u); ctx.fillStyle = '#e8e3d6'; ctx.fill();
  const items = [...LEGEND_PICTOS.map((t) => ({ t })), { you: true }, { staff: true }];
  const pad = 14 * u, titleH = 30 * u, cols = 2, rows = Math.ceil(items.length / cols), colW = (box.w - 2 * pad) / cols;
  font(ctx, T(15), 800); ctx.fillStyle = C.navy; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; spaced(ctx, 'SERVICES', box.x + pad, box.y + pad + titleH / 2 - 4 * u, 1.5 * u);
  const lh = Math.min((box.h - 2 * pad - titleH) / rows, 52 * u), ps = Math.min(lh * 0.7, 32 * u), fs = Math.min(lh * 0.42, T(17)), y0 = box.y + pad + titleH;
  items.forEach((it, i) => {
    const c = Math.floor(i / rows), r = i % rows, x = box.x + pad + c * colW, y = y0 + r * lh + lh / 2;
    let label;
    if (it.t) { picto(ctx, it.t, x + ps / 2, y, ps); label = PICTOS[it.t].label; }
    else if (it.you) { youMarker(ctx, x + ps / 2, y, ps * 0.24, Math.PI, true); label = 'Vous êtes ici'; }
    else { ctx.fillStyle = hatch(ctx, 6 * u, C.staffLine, C.staff); rr(ctx, x + ps * 0.05, y - ps * 0.4, ps * 0.9, ps * 0.8, 3 * u); ctx.fill(); ctx.strokeStyle = '#aeb4b9'; ctx.lineWidth = 1; ctx.stroke(); label = 'Réservé au personnel'; }
    const t = fit(ctx, label, colW - ps - 14 * u, fs, 7, it.you ? 800 : 600); font(ctx, t.px, it.you ? 800 : 600);
    ctx.fillStyle = it.you ? C.red : C.ink; ctx.textAlign = 'left'; ctx.fillText(t.text, x + ps + 8 * u, y + 1);
  });
  ctx.restore();
}
