// Atlas d'étiquettes des produits (séparé de textures.js : les étiquettes des articles évoluent indépendamment
// des matériaux d'architecture).
//
// Conception : un seul canvas (donc une seule texture et un seul matériau « props » par zone) organisé en
// étagères (shelf packing) de rectangles de tailles variables. Les UV sont calculées dans un espace virtuel
// 2048 × 4096 ; finalize() recadre le canvas à la hauteur réellement utilisée (arrondie à 64 px) et compense
// par texture.repeat / texture.offset : la mémoire GPU suit le nombre d'étiquettes (≈ 2048 × 2048 × 4 o × 4/3
// ≈ 22 Mo pour un millier d'emballages), plafonnée à ≈ 45 Mo si tout l'espace était rempli.
// Deux familles d'étiquettes :
// - label(key, text, color, style) : ancien format (dessin clair multiplié par la couleur de sommet) ;
// - pack(key, w, h, info) : emballage en couleurs réelles (le sommet doit être blanc), dessiné par un petit
//   moteur de mise en page (marque, nom, variante, pictogramme, motifs) selon info.kind.
// white() renvoie un point UV dégénéré au centre d'un bloc blanc : les faces sans étiquette échantillonnent
// toujours du blanc pur, quel que soit le niveau de mipmap.
import * as THREE from 'three';
import { canvas, getMaxAnisotropy } from './textures.js';
import { mulberry32, hashString } from './rng.js';

const SANS = 'Arial, Helvetica, "Liberation Sans", sans-serif';
const BLACK = '"Arial Black", "Arial Bold", Arial, "Liberation Sans", sans-serif';
const SERIF = 'Georgia, "Times New Roman", "Liberation Serif", serif';
const COND = '"Arial Narrow", "Liberation Sans Narrow", Arial, sans-serif';
const MONO = '"Courier New", "Liberation Mono", monospace';
const IMPACT = 'Impact, "Arial Black", "Liberation Sans", sans-serif';

// ── couleurs ──
const css = (c) => '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const rgbOf = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const lum = (c) => { const [r, g, b] = rgbOf(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
function mix(a, b, t) { const A = rgbOf(a), B = rgbOf(b); return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t); }
const light = (c, t) => mix(c, 0xffffff, t), dark = (c, t) => mix(c, 0x000000, t);
const ink = (bg) => (lum(bg) > 0.62 ? 0x1b1b1b : 0xffffff);
function hsl(h, s, l) { const c = new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l); return (Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255); }
// accent par défaut : teinte complémentaire franche
function accentFor(c, rnd) { const col = new THREE.Color(css(c)); const h = {}; col.getHSL(h); const pal = [0xffd600, 0xe53935, 0xffffff, 0x1e88e5, 0x43a047, 0xff6f00, 0x6a1b9a, 0x212121]; if (h.s < 0.15) return pal[(rnd() * pal.length) | 0]; return hsl(h.h + 0.5 + (rnd() - 0.5) * 0.15, Math.min(1, h.s + 0.2), h.l > 0.5 ? 0.35 : 0.6); }

// ── primitives de dessin ──
function circ(x, cx, cy, r, f) { x.beginPath(); x.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2); if (f != null) { x.fillStyle = css(f); x.fill(); } }
function ell(x, cx, cy, rx, ry, f, rot = 0) { x.beginPath(); x.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2); if (f != null) { x.fillStyle = css(f); x.fill(); } }
function rr(x, X, Y, w, h, r, f) { r = Math.max(0, Math.min(r, w / 2, h / 2)); x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); if (f != null) { x.fillStyle = css(f); x.fill(); } }
function poly(x, pts, f) { x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); if (f != null) { x.fillStyle = css(f); x.fill(); } }
function rect(x, X, Y, w, h, f) { x.fillStyle = css(f); x.fillRect(X, Y, w, h); }
function star(x, cx, cy, r1, r2, n, f, rot = -Math.PI / 2) { const p = []; for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? r2 : r1; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } poly(x, p, f); }
function line(x, x0, y0, x1, y1, c, w) { x.strokeStyle = css(c); x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); }

// Largeur d'un texte mesurée une seule fois à 100 px (proportionnelle à la taille) : changer x.font coûte cher
// (contexte de mesure dédié : les save()/restore() du dessin ne touchent pas sa police courante)
const _mw = new Map(); let _mf = '', _mx = null;
function mw(x, f100, str) {
  const k = f100 + '|' + str; let w = _mw.get(k);
  if (w === undefined) { _mx ||= canvas(8, 8).getContext('2d'); if (_mf !== f100) { _mx.font = f100; _mf = f100; } w = _mx.measureText(str).width; _mw.set(k, w); }
  return w;
}
// Texte ajusté dans une boîte (1 ou 2 lignes), centré par défaut. Renvoie la taille de police retenue.
function txt(x, s, cx, cy, maxW, maxH, o = {}) {
  s = String(s ?? ''); if (!s || maxW < 3 || maxH < 3) return 0;
  const fam = o.font || BLACK, wt = o.weight ?? 900, it = o.italic ? 'italic ' : '';
  const font = (sz) => `${it}${wt} ${sz}px ${fam}`, f100 = font(100);
  const one = (str, h) => { let sz = Math.floor(h); const w = mw(x, f100, str) * sz / 100; if (w > maxW) sz = Math.floor(sz * maxW / w); return sz; };
  let lines = [s], sz = one(s, maxH * (o.scale || 0.82));
  if (o.lines !== 1 && s.includes(' ') && sz < maxH * 0.42) {
    const words = s.split(' '); let best = null;
    for (let k = 1; k < words.length; k++) { const a = words.slice(0, k).join(' '), b = words.slice(k).join(' '); const z = Math.min(one(a, maxH * 0.44), one(b, maxH * 0.44)); if (!best || z > best.z) best = { z, a, b }; }
    if (best && best.z > sz * 1.12) { lines = [best.a, best.b]; sz = best.z; }
  }
  sz = Math.max(o.min || 6, Math.min(sz, o.max || 999)); x.font = font(sz);
  x.textAlign = o.align || 'center'; x.textBaseline = 'middle';
  const lh = sz * 1.02, y0 = cy - (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => {
    const yy = y0 + i * lh + sz * 0.04;
    if (o.stroke != null) { x.lineJoin = 'round'; x.lineWidth = Math.max(1.5, sz * (o.strokeW || 0.16)); x.strokeStyle = css(o.stroke); x.strokeText(l, cx, yy, maxW); }
    if (o.shadow != null) { x.fillStyle = css(o.shadow); x.fillText(l, cx + Math.max(1, sz * 0.06), yy + Math.max(1, sz * 0.06), maxW); }
    x.fillStyle = css(o.color ?? 0x111111); x.fillText(l, cx, yy, maxW);
  });
  return sz;
}
// lettres espacées (marques de luxe)
function spaced(x, s, cx, cy, maxW, h, color, fam = SERIF, wt = 400) { s = String(s).toUpperCase().split('').join(' '); txt(x, s, cx, cy, maxW, h, { font: fam, weight: wt, color, lines: 1 }); }
function barcode(x, X, Y, w, h, rnd) { rect(x, X, Y, w, h, 0xffffff); let px = X + w * 0.08; while (px < X + w * 0.92) { const bw = Math.max(0.6, (1 + ((rnd() * 3) | 0)) * w / 70); rect(x, px, Y + h * 0.08, bw, h * 0.72, 0x111111); px += bw + Math.max(0.6, (1 + ((rnd() * 2) | 0)) * w / 80); } }
function gloss(x, X, Y, w, h, a = 0.18) { const g = x.createLinearGradient(X, Y, X, Y + h); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(0,0,0,${a * 0.6})`); x.fillStyle = g; x.fillRect(X, Y, w, h); }

// ── pictogrammes (dessinés dans un carré de côté s centré en (cx, cy)) ──
const PICTO = {
  apple(x, cx, cy, s, A) { circ(x, cx - s * 0.12, cy + s * 0.05, s * 0.3, A || 0xd32f2f); circ(x, cx + s * 0.12, cy + s * 0.05, s * 0.3, A || 0xd32f2f); line(x, cx, cy - s * 0.2, cx + s * 0.04, cy - s * 0.38, 0x5d4037, s * 0.05); ell(x, cx + s * 0.15, cy - s * 0.3, s * 0.13, s * 0.06, 0x43a047, -0.5); circ(x, cx - s * 0.18, cy - s * 0.04, s * 0.07, 0xffffff); },
  orange(x, cx, cy, s, A) { circ(x, cx, cy + s * 0.04, s * 0.36, A || 0xfb8c00); for (let i = 0; i < 6; i++) circ(x, cx + Math.cos(i) * s * 0.2, cy + s * 0.04 + Math.sin(i * 1.7) * s * 0.18, s * 0.025, light(A || 0xfb8c00, 0.3)); ell(x, cx + s * 0.1, cy - s * 0.33, s * 0.14, s * 0.06, 0x2e7d32, -0.3); },
  lemon(x, cx, cy, s) { ell(x, cx, cy, s * 0.38, s * 0.27, 0xfdd835, -0.2); circ(x, cx + s * 0.36, cy - s * 0.08, s * 0.06, 0xfdd835); circ(x, cx - s * 0.36, cy + s * 0.08, s * 0.06, 0xfdd835); ell(x, cx - s * 0.1, cy - s * 0.08, s * 0.12, s * 0.06, 0xfff59d, -0.2); },
  strawberry(x, cx, cy, s) { poly(x, [cx - s * 0.32, cy - s * 0.15, cx + s * 0.32, cy - s * 0.15, cx + s * 0.22, cy + s * 0.18, cx, cy + s * 0.38, cx - s * 0.22, cy + s * 0.18], 0xe53935); circ(x, cx - s * 0.16, cy - s * 0.12, s * 0.17, 0xe53935); circ(x, cx + s * 0.16, cy - s * 0.12, s * 0.17, 0xe53935); for (let i = 0; i < 8; i++) circ(x, cx + ((i * 37) % 9 - 4) * s * 0.06, cy - s * 0.05 + ((i * 23) % 5) * s * 0.07, s * 0.02, 0xfff59d); star(x, cx, cy - s * 0.27, s * 0.2, s * 0.07, 5, 0x43a047, Math.PI / 2); },
  cherry(x, cx, cy, s) { line(x, cx - s * 0.15, cy + s * 0.1, cx + s * 0.05, cy - s * 0.35, 0x33691e, s * 0.04); line(x, cx + s * 0.18, cy + s * 0.05, cx + s * 0.05, cy - s * 0.35, 0x33691e, s * 0.04); circ(x, cx - s * 0.15, cy + s * 0.18, s * 0.17, 0xb71c1c); circ(x, cx + s * 0.18, cy + s * 0.13, s * 0.17, 0xc62828); circ(x, cx - s * 0.2, cy + s * 0.13, s * 0.04, 0xffcdd2); ell(x, cx + s * 0.15, cy - s * 0.33, s * 0.12, s * 0.05, 0x43a047, 0.4); },
  grape(x, cx, cy, s, A) { const c = A || 0x6a1b9a; for (const [i, j] of [[-2, 0], [0, 0], [2, 0], [-1, 1], [1, 1], [0, 2], [-3, -0.6], [3, -0.6]]) circ(x, cx + i * s * 0.1, cy - s * 0.05 + j * s * 0.16, s * 0.11, j > 1 ? dark(c, 0.15) : c); ell(x, cx + s * 0.12, cy - s * 0.3, s * 0.16, s * 0.07, 0x558b2f, -0.3); },
  banana(x, cx, cy, s) { x.beginPath(); x.arc(cx + s * 0.05, cy - s * 0.35, s * 0.55, 0.9, 2.3); x.arc(cx + s * 0.05, cy - s * 0.2, s * 0.4, 2.3, 0.9, true); x.closePath(); x.fillStyle = '#fdd835'; x.fill(); circ(x, cx - s * 0.32, cy + s * 0.05, s * 0.04, 0x5d4037); },
  tomato(x, cx, cy, s) { ell(x, cx, cy + s * 0.05, s * 0.38, s * 0.32, 0xe53935); star(x, cx, cy - s * 0.22, s * 0.18, s * 0.06, 6, 0x2e7d32); ell(x, cx - s * 0.15, cy - s * 0.02, s * 0.08, s * 0.05, 0xff8a80, -0.5); },
  carrot(x, cx, cy, s) { poly(x, [cx - s * 0.12, cy - s * 0.2, cx + s * 0.12, cy - s * 0.2, cx + s * 0.02, cy + s * 0.42], 0xfb8c00); for (let i = -1; i <= 1; i++) ell(x, cx + i * s * 0.08, cy - s * 0.32, s * 0.04, s * 0.13, 0x43a047, i * 0.4); },
  pepper(x, cx, cy, s, A) { x.beginPath(); x.moveTo(cx - s * 0.25, cy - s * 0.2); x.quadraticCurveTo(cx + s * 0.35, cy - s * 0.25, cx + s * 0.28, cy + s * 0.4); x.quadraticCurveTo(cx - s * 0.05, cy + s * 0.05, cx - s * 0.25, cy - s * 0.2); x.fillStyle = css(A || 0xd50000); x.fill(); line(x, cx - s * 0.24, cy - s * 0.2, cx - s * 0.3, cy - s * 0.36, 0x2e7d32, s * 0.06); },
  leaf(x, cx, cy, s, A) { ell(x, cx, cy, s * 0.4, s * 0.2, A || 0x43a047, -0.6); line(x, cx - s * 0.32, cy + s * 0.22, cx + s * 0.28, cy - s * 0.2, light(A || 0x43a047, 0.4), s * 0.03); },
  wheat(x, cx, cy, s, A) { const c = A || 0xf9a825; line(x, cx, cy + s * 0.42, cx, cy - s * 0.35, dark(c, 0.2), s * 0.035); for (let i = 0; i < 5; i++) { const y = cy - s * 0.3 + i * s * 0.12; ell(x, cx - s * 0.08, y, s * 0.07, s * 0.04, c, -0.6); ell(x, cx + s * 0.08, y, s * 0.07, s * 0.04, c, 0.6); } },
  bowl(x, cx, cy, s, A) { for (let i = 0; i < 9; i++) circ(x, cx - s * 0.28 + i * s * 0.07, cy - s * 0.02 - Math.sin(i * 0.7) * s * 0.05, s * 0.07, i % 3 ? (A || 0xffb300) : 0x8d6e63); x.beginPath(); x.arc(cx, cy, s * 0.38, 0, Math.PI); x.closePath(); x.fillStyle = '#ffffff'; x.fill(); x.strokeStyle = '#1565c0'; x.lineWidth = s * 0.04; x.stroke(); },
  cup(x, cx, cy, s, A) { rr(x, cx - s * 0.25, cy - s * 0.12, s * 0.42, s * 0.42, s * 0.08, A || 0xffffff); x.beginPath(); x.arc(cx + s * 0.2, cy + s * 0.07, s * 0.1, -1.4, 1.4); x.strokeStyle = css(A || 0xffffff); x.lineWidth = s * 0.05; x.stroke(); ell(x, cx - s * 0.04, cy - s * 0.1, s * 0.19, s * 0.04, 0x4e342e); for (const k of [-0.1, 0.04]) { x.beginPath(); x.moveTo(cx + k * s, cy - s * 0.2); x.quadraticCurveTo(cx + (k + 0.08) * s, cy - s * 0.3, cx + k * s, cy - s * 0.42); x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = s * 0.035; x.stroke(); } },
  bean(x, cx, cy, s) { for (const [dx, dy, r] of [[-0.15, 0.05, -0.5], [0.16, -0.06, 0.6]]) { ell(x, cx + dx * s, cy + dy * s, s * 0.17, s * 0.24, 0x4e342e, r); x.beginPath(); x.moveTo(cx + dx * s - s * 0.05, cy + dy * s - s * 0.18); x.quadraticCurveTo(cx + dx * s + s * 0.06, cy + dy * s, cx + dx * s - s * 0.04, cy + dy * s + s * 0.18); x.strokeStyle = '#2b1a12'; x.lineWidth = s * 0.03; x.stroke(); } },
  tea(x, cx, cy, s, A) { PICTO.cup(x, cx - s * 0.05, cy + s * 0.08, s * 0.85, 0xffffff); line(x, cx + s * 0.05, cy - s * 0.05, cx + s * 0.3, cy - s * 0.3, 0xeeeeee, s * 0.02); rr(x, cx + s * 0.24, cy - s * 0.4, s * 0.14, s * 0.12, 2, A || 0x2e7d32); },
  drop(x, cx, cy, s, A) { x.beginPath(); x.moveTo(cx, cy - s * 0.4); x.bezierCurveTo(cx + s * 0.1, cy - s * 0.2, cx + s * 0.3, cy, cx + s * 0.3, cy + s * 0.15); x.arc(cx, cy + s * 0.15, s * 0.3, 0, Math.PI); x.bezierCurveTo(cx - s * 0.3, cy, cx - s * 0.1, cy - s * 0.2, cx, cy - s * 0.4); x.fillStyle = css(A || 0x29b6f6); x.fill(); ell(x, cx - s * 0.1, cy + s * 0.12, s * 0.06, s * 0.1, 0xffffff, 0.3); },
  bubbles(x, cx, cy, s, A) { for (const [dx, dy, r] of [[-0.15, 0.12, 0.17], [0.15, -0.05, 0.13], [0.02, -0.25, 0.09], [0.22, 0.22, 0.08], [-0.25, -0.18, 0.06]]) { circ(x, cx + dx * s, cy + dy * s, r * s, null); x.strokeStyle = css(A || 0xffffff); x.lineWidth = Math.max(1, s * 0.03); x.stroke(); circ(x, cx + (dx - r * 0.35) * s, cy + (dy - r * 0.35) * s, r * s * 0.22, A || 0xffffff); } },
  fish(x, cx, cy, s, A) { ell(x, cx - s * 0.05, cy, s * 0.3, s * 0.17, A || 0x4fc3f7); poly(x, [cx + s * 0.2, cy, cx + s * 0.42, cy - s * 0.17, cx + s * 0.42, cy + s * 0.17], A || 0x4fc3f7); circ(x, cx - s * 0.22, cy - s * 0.04, s * 0.035, 0x111111); },
  chicken(x, cx, cy, s) { ell(x, cx - s * 0.08, cy - s * 0.06, s * 0.26, s * 0.22, 0xd4893a, -0.6); line(x, cx + s * 0.08, cy + s * 0.1, cx + s * 0.28, cy + s * 0.32, 0xfff3e0, s * 0.08); circ(x, cx + s * 0.31, cy + s * 0.31, s * 0.06, 0xfff3e0); circ(x, cx + s * 0.25, cy + s * 0.36, s * 0.06, 0xfff3e0); },
  cheese(x, cx, cy, s) { poly(x, [cx - s * 0.38, cy + s * 0.25, cx + s * 0.38, cy + s * 0.25, cx + s * 0.38, cy - s * 0.02, cx - s * 0.38, cy - s * 0.02], 0xfbc02d); poly(x, [cx - s * 0.38, cy - s * 0.02, cx + s * 0.38, cy - s * 0.02, cx + s * 0.2, cy - s * 0.3], 0xffe082); for (const [dx, dy, r] of [[-0.2, 0.1, 0.06], [0.1, 0.14, 0.05], [0.25, 0.05, 0.04]]) circ(x, cx + dx * s, cy + dy * s, r * s, 0xf9a825); },
  bread(x, cx, cy, s) { rr(x, cx - s * 0.38, cy - s * 0.12, s * 0.76, s * 0.34, s * 0.15, 0xc68642); ell(x, cx, cy - s * 0.1, s * 0.38, s * 0.16, 0xd9a066); for (let i = -1; i <= 1; i++) line(x, cx + i * s * 0.18 - s * 0.06, cy - s * 0.18, cx + i * s * 0.18 + s * 0.06, cy - s * 0.04, 0x8d5524, s * 0.03); },
  cookie(x, cx, cy, s) { circ(x, cx, cy, s * 0.36, 0xc8954f); for (const [dx, dy] of [[-0.15, -0.1], [0.12, -0.14], [0.05, 0.12], [-0.12, 0.16], [0.2, 0.08]]) circ(x, cx + dx * s, cy + dy * s, s * 0.05, 0x3e2723); },
  choco(x, cx, cy, s) { rr(x, cx - s * 0.36, cy - s * 0.26, s * 0.72, s * 0.52, s * 0.04, 0x4e342e); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) rr(x, cx - s * 0.33 + i * s * 0.17, cy - s * 0.23 + j * s * 0.165, s * 0.15, s * 0.14, s * 0.02, 0x6d4c41); },
  candy(x, cx, cy, s, A) { const c = A || 0xec407a; poly(x, [cx - s * 0.2, cy, cx - s * 0.42, cy - s * 0.16, cx - s * 0.42, cy + s * 0.16], c); poly(x, [cx + s * 0.2, cy, cx + s * 0.42, cy - s * 0.16, cx + s * 0.42, cy + s * 0.16], c); circ(x, cx, cy, s * 0.22, c); x.save(); x.beginPath(); x.arc(cx, cy, s * 0.22, 0, 7); x.clip(); for (let i = -3; i <= 3; i++) line(x, cx + i * s * 0.09 - s * 0.2, cy - s * 0.25, cx + i * s * 0.09 + s * 0.2, cy + s * 0.25, 0xffffff, s * 0.04); x.restore(); },
  heart(x, cx, cy, s, A) { x.beginPath(); x.moveTo(cx, cy + s * 0.35); x.bezierCurveTo(cx - s * 0.5, cy, cx - s * 0.25, cy - s * 0.4, cx, cy - s * 0.15); x.bezierCurveTo(cx + s * 0.25, cy - s * 0.4, cx + s * 0.5, cy, cx, cy + s * 0.35); x.fillStyle = css(A || 0xe53935); x.fill(); },
  star(x, cx, cy, s, A) { star(x, cx, cy, s * 0.42, s * 0.18, 5, A || 0xffd600); },
  sun(x, cx, cy, s, A) { const c = A || 0xffb300; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; poly(x, [cx + Math.cos(a - 0.12) * s * 0.26, cy + Math.sin(a - 0.12) * s * 0.26, cx + Math.cos(a) * s * 0.44, cy + Math.sin(a) * s * 0.44, cx + Math.cos(a + 0.12) * s * 0.26, cy + Math.sin(a + 0.12) * s * 0.26], c); } circ(x, cx, cy, s * 0.24, c); },
  snow(x, cx, cy, s, A) { const c = A || 0xffffff; for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; line(x, cx - Math.cos(a) * s * 0.4, cy - Math.sin(a) * s * 0.4, cx + Math.cos(a) * s * 0.4, cy + Math.sin(a) * s * 0.4, c, s * 0.05); } for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, px = cx + Math.cos(a) * s * 0.28, py = cy + Math.sin(a) * s * 0.28; line(x, px, py, px + Math.cos(a + 0.7) * s * 0.1, py + Math.sin(a + 0.7) * s * 0.1, c, s * 0.035); line(x, px, py, px + Math.cos(a - 0.7) * s * 0.1, py + Math.sin(a - 0.7) * s * 0.1, c, s * 0.035); } },
  flame(x, cx, cy, s, A) { x.beginPath(); x.moveTo(cx, cy - s * 0.42); x.bezierCurveTo(cx + s * 0.45, cy - s * 0.05, cx + s * 0.3, cy + s * 0.38, cx, cy + s * 0.38); x.bezierCurveTo(cx - s * 0.3, cy + s * 0.38, cx - s * 0.4, cy, cx, cy - s * 0.42); x.fillStyle = css(A || 0xff6f00); x.fill(); ell(x, cx, cy + s * 0.18, s * 0.12, s * 0.17, 0xffeb3b); },
  bolt(x, cx, cy, s, A) { poly(x, [cx + s * 0.08, cy - s * 0.44, cx - s * 0.22, cy + s * 0.05, cx - s * 0.02, cy + s * 0.05, cx - s * 0.1, cy + s * 0.44, cx + s * 0.24, cy - s * 0.08, cx + s * 0.03, cy - s * 0.08], A || 0xffd600); },
  paw(x, cx, cy, s, A) { const c = A || 0x5d4037; ell(x, cx, cy + s * 0.12, s * 0.2, s * 0.17, c); for (const [dx, dy] of [[-0.24, -0.06], [-0.09, -0.24], [0.09, -0.24], [0.24, -0.06]]) ell(x, cx + dx * s, cy + dy * s, s * 0.08, s * 0.1, c); },
  bone(x, cx, cy, s, A) { const c = A || 0xfff8e1; rr(x, cx - s * 0.3, cy - s * 0.07, s * 0.6, s * 0.14, s * 0.05, c); for (const dx of [-0.32, 0.32]) { circ(x, cx + dx * s, cy - s * 0.08, s * 0.09, c); circ(x, cx + dx * s, cy + s * 0.08, s * 0.09, c); } },
  baby(x, cx, cy, s) { circ(x, cx, cy + s * 0.04, s * 0.32, 0xffe0bd); x.beginPath(); x.arc(cx + s * 0.02, cy - s * 0.3, s * 0.08, 3.5, 6.5); x.strokeStyle = '#8d6e63'; x.lineWidth = s * 0.04; x.stroke(); circ(x, cx - s * 0.11, cy, s * 0.035, 0x3e2723); circ(x, cx + s * 0.11, cy, s * 0.035, 0x3e2723); x.beginPath(); x.arc(cx, cy + s * 0.1, s * 0.1, 0.3, 2.8); x.stroke(); circ(x, cx - s * 0.2, cy + s * 0.1, s * 0.05, 0xffab91); circ(x, cx + s * 0.2, cy + s * 0.1, s * 0.05, 0xffab91); },
  tooth(x, cx, cy, s) { x.beginPath(); x.moveTo(cx - s * 0.3, cy - s * 0.2); x.bezierCurveTo(cx - s * 0.32, cy - s * 0.45, cx - s * 0.05, cy - s * 0.38, cx, cy - s * 0.3); x.bezierCurveTo(cx + s * 0.05, cy - s * 0.38, cx + s * 0.32, cy - s * 0.45, cx + s * 0.3, cy - s * 0.2); x.lineTo(cx + s * 0.18, cy + s * 0.4); x.lineTo(cx + s * 0.04, cy + s * 0.1); x.lineTo(cx - s * 0.04, cy + s * 0.1); x.lineTo(cx - s * 0.18, cy + s * 0.4); x.closePath(); x.fillStyle = '#ffffff'; x.fill(); x.strokeStyle = '#90caf9'; x.lineWidth = s * 0.03; x.stroke(); star(x, cx + s * 0.28, cy - s * 0.32, s * 0.1, s * 0.03, 4, 0xffffff); },
  flower(x, cx, cy, s, A) { const c = A || 0xec407a; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ell(x, cx + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.2, s * 0.15, s * 0.1, c, a); } circ(x, cx, cy, s * 0.12, 0xffd600); },
  cross(x, cx, cy, s, A) { const c = A || 0x00a152; rr(x, cx - s * 0.13, cy - s * 0.4, s * 0.26, s * 0.8, s * 0.04, c); rr(x, cx - s * 0.4, cy - s * 0.13, s * 0.8, s * 0.26, s * 0.04, c); },
  pill(x, cx, cy, s, A) { x.save(); x.translate(cx, cy); x.rotate(-0.6); rr(x, -s * 0.38, -s * 0.13, s * 0.76, s * 0.26, s * 0.13, 0xffffff); x.save(); x.beginPath(); x.rect(-s * 0.4, -s * 0.15, s * 0.4, s * 0.3); x.clip(); rr(x, -s * 0.38, -s * 0.13, s * 0.76, s * 0.26, s * 0.13, A || 0xe53935); x.restore(); x.restore(); },
  bottle(x, cx, cy, s, A) { const c = A || 0x2e7d32; rr(x, cx - s * 0.13, cy - s * 0.05, s * 0.26, s * 0.45, s * 0.05, c); poly(x, [cx - s * 0.13, cy - s * 0.04, cx - s * 0.05, cy - s * 0.22, cx + s * 0.05, cy - s * 0.22, cx + s * 0.13, cy - s * 0.04], c); rect(x, cx - s * 0.05, cy - s * 0.42, s * 0.1, s * 0.22, c); rect(x, cx - s * 0.12, cy + s * 0.08, s * 0.24, s * 0.14, 0xfff8e1); },
  glass(x, cx, cy, s, A) { x.beginPath(); x.moveTo(cx - s * 0.22, cy - s * 0.38); x.lineTo(cx + s * 0.22, cy - s * 0.38); x.quadraticCurveTo(cx + s * 0.22, cy, cx, cy + s * 0.02); x.quadraticCurveTo(cx - s * 0.22, cy, cx - s * 0.22, cy - s * 0.38); x.fillStyle = 'rgba(255,255,255,0.85)'; x.fill(); x.beginPath(); x.moveTo(cx - s * 0.2, cy - s * 0.2); x.lineTo(cx + s * 0.2, cy - s * 0.2); x.quadraticCurveTo(cx + s * 0.2, cy, cx, cy + s * 0.01); x.quadraticCurveTo(cx - s * 0.2, cy, cx - s * 0.2, cy - s * 0.2); x.fillStyle = css(A || 0x880e4f); x.fill(); line(x, cx, cy, cx, cy + s * 0.32, 0xffffff, s * 0.04); rect(x, cx - s * 0.14, cy + s * 0.32, s * 0.28, s * 0.05, 0xffffff); },
  beer(x, cx, cy, s, A) { rr(x, cx - s * 0.22, cy - s * 0.2, s * 0.36, s * 0.58, s * 0.04, A || 0xffb300); x.beginPath(); x.arc(cx + s * 0.18, cy + s * 0.08, s * 0.11, -1.3, 1.3); x.strokeStyle = css(A || 0xffb300); x.lineWidth = s * 0.05; x.stroke(); for (let i = 0; i < 3; i++) circ(x, cx - s * 0.14 + i * s * 0.1, cy - s * 0.24, s * 0.09, 0xfffde7); },
  shirt(x, cx, cy, s, A) { poly(x, [cx - s * 0.18, cy - s * 0.36, cx - s * 0.42, cy - s * 0.2, cx - s * 0.32, cy - s * 0.02, cx - s * 0.22, cy - s * 0.08, cx - s * 0.22, cy + s * 0.38, cx + s * 0.22, cy + s * 0.38, cx + s * 0.22, cy - s * 0.08, cx + s * 0.32, cy - s * 0.02, cx + s * 0.42, cy - s * 0.2, cx + s * 0.18, cy - s * 0.36, cx, cy - s * 0.28], A || 0x1e88e5); },
  shoe(x, cx, cy, s, A) { x.beginPath(); x.moveTo(cx - s * 0.4, cy + s * 0.15); x.lineTo(cx - s * 0.36, cy - s * 0.18); x.lineTo(cx - s * 0.12, cy - s * 0.2); x.quadraticCurveTo(cx + s * 0.05, cy + s * 0.0, cx + s * 0.36, cy + s * 0.02); x.quadraticCurveTo(cx + s * 0.44, cy + s * 0.08, cx + s * 0.42, cy + s * 0.15); x.closePath(); x.fillStyle = css(A || 0x37474f); x.fill(); rect(x, cx - s * 0.4, cy + s * 0.15, s * 0.82, s * 0.07, 0xffffff); },
  ball(x, cx, cy, s, A) { circ(x, cx, cy, s * 0.38, A || 0xffffff); star(x, cx, cy, s * 0.13, s * 0.11, 5, 0x111111); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 0.4; circ(x, cx + Math.cos(a) * s * 0.33, cy + Math.sin(a) * s * 0.33, s * 0.06, 0x111111); } x.beginPath(); x.arc(cx, cy, s * 0.38, 0, 7); x.strokeStyle = '#111'; x.lineWidth = s * 0.02; x.stroke(); },
  note(x, cx, cy, s, A) { const c = A || 0x111111; ell(x, cx - s * 0.16, cy + s * 0.25, s * 0.12, s * 0.09, c, -0.4); ell(x, cx + s * 0.2, cy + s * 0.18, s * 0.12, s * 0.09, c, -0.4); line(x, cx - s * 0.06, cy + s * 0.24, cx - s * 0.06, cy - s * 0.32, c, s * 0.05); line(x, cx + s * 0.3, cy + s * 0.17, cx + s * 0.3, cy - s * 0.38, c, s * 0.05); poly(x, [cx - s * 0.08, cy - s * 0.3, cx + s * 0.32, cy - s * 0.4, cx + s * 0.32, cy - s * 0.28, cx - s * 0.08, cy - s * 0.18], c); },
  pad(x, cx, cy, s, A) { const c = A || 0x37474f; rr(x, cx - s * 0.3, cy - s * 0.12, s * 0.6, s * 0.26, s * 0.12, c); circ(x, cx - s * 0.28, cy + s * 0.08, s * 0.14, c); circ(x, cx + s * 0.28, cy + s * 0.08, s * 0.14, c); rect(x, cx - s * 0.26, cy - s * 0.02, s * 0.14, s * 0.04, 0xffffff); rect(x, cx - s * 0.21, cy - s * 0.07, s * 0.04, s * 0.14, 0xffffff); circ(x, cx + s * 0.2, cy - s * 0.03, s * 0.035, 0xe53935); circ(x, cx + s * 0.28, cy + s * 0.04, s * 0.035, 0x43a047); },
  phone(x, cx, cy, s, A) { rr(x, cx - s * 0.18, cy - s * 0.38, s * 0.36, s * 0.76, s * 0.06, A || 0x212121); rr(x, cx - s * 0.15, cy - s * 0.32, s * 0.3, s * 0.6, s * 0.02, 0x4fc3f7); const g = x.createLinearGradient(cx - s * 0.15, cy - s * 0.32, cx + s * 0.15, cy + s * 0.28); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(cx - s * 0.15, cy - s * 0.32, s * 0.3, s * 0.6); },
  camera(x, cx, cy, s, A) { rr(x, cx - s * 0.38, cy - s * 0.18, s * 0.76, s * 0.46, s * 0.06, A || 0x263238); rect(x, cx - s * 0.12, cy - s * 0.27, s * 0.24, s * 0.1, A || 0x263238); circ(x, cx, cy + s * 0.05, s * 0.17, 0x9e9e9e); circ(x, cx, cy + s * 0.05, s * 0.11, 0x1a237e); circ(x, cx - s * 0.03, cy + s * 0.02, s * 0.03, 0xffffff); },
  book(x, cx, cy, s, A) { rr(x, cx - s * 0.32, cy - s * 0.36, s * 0.6, s * 0.72, s * 0.03, A || 0x1565c0); rect(x, cx - s * 0.28, cy - s * 0.36, s * 0.04, s * 0.72, dark(A || 0x1565c0, 0.3)); rect(x, cx - s * 0.18, cy - s * 0.2, s * 0.38, s * 0.06, 0xffffff); rect(x, cx - s * 0.18, cy - s * 0.08, s * 0.28, s * 0.04, 0xffffff); },
  bulb(x, cx, cy, s, A) { circ(x, cx, cy - s * 0.08, s * 0.28, A || 0xfff176); rect(x, cx - s * 0.11, cy + s * 0.16, s * 0.22, s * 0.18, 0x9e9e9e); for (let i = 0; i < 3; i++) line(x, cx - s * 0.11, cy + s * 0.2 + i * s * 0.05, cx + s * 0.11, cy + s * 0.2 + i * s * 0.05, 0x616161, s * 0.02); for (let i = 0; i < 5; i++) { const a = -Math.PI * 0.9 + i * Math.PI * 0.2; line(x, cx + Math.cos(a) * s * 0.34, cy - s * 0.08 + Math.sin(a) * s * 0.34, cx + Math.cos(a) * s * 0.44, cy - s * 0.08 + Math.sin(a) * s * 0.44, 0xffd600, s * 0.03); } },
  battery(x, cx, cy, s, A) { rr(x, cx - s * 0.36, cy - s * 0.16, s * 0.66, s * 0.32, s * 0.04, 0x212121); rect(x, cx + s * 0.3, cy - s * 0.07, s * 0.07, s * 0.14, 0x9e9e9e); rect(x, cx - s * 0.36, cy - s * 0.16, s * 0.22, s * 0.32, A || 0xffb300); txt(x, '+', cx + s * 0.14, cy, s * 0.2, s * 0.28, { color: 0xffffff }); },
  house(x, cx, cy, s, A) { poly(x, [cx - s * 0.4, cy - s * 0.02, cx, cy - s * 0.38, cx + s * 0.4, cy - s * 0.02], A || 0xd84315); rect(x, cx - s * 0.3, cy - s * 0.02, s * 0.6, s * 0.38, 0xfff8e1); rect(x, cx - s * 0.07, cy + s * 0.12, s * 0.14, s * 0.24, 0x6d4c41); },
  sparkle(x, cx, cy, s, A) { const c = A || 0xffffff; star(x, cx - s * 0.08, cy + s * 0.05, s * 0.32, s * 0.07, 4, c, 0); star(x, cx + s * 0.25, cy - s * 0.25, s * 0.14, s * 0.035, 4, c, 0); star(x, cx + s * 0.28, cy + s * 0.28, s * 0.09, s * 0.025, 4, c, 0); },
  spray(x, cx, cy, s, A) { rr(x, cx - s * 0.12, cy - s * 0.15, s * 0.24, s * 0.55, s * 0.04, A || 0x1e88e5); rect(x, cx - s * 0.06, cy - s * 0.28, s * 0.12, s * 0.13, 0xbdbdbd); for (let i = 0; i < 6; i++) circ(x, cx + s * 0.16 + (i % 3) * s * 0.08, cy - s * 0.32 + ((i / 3) | 0) * s * 0.08 + (i % 2) * s * 0.03, s * 0.025, 0xb3e5fc); },
  olive(x, cx, cy, s) { line(x, cx - s * 0.38, cy + s * 0.2, cx + s * 0.38, cy - s * 0.25, 0x6d4c41, s * 0.03); for (let i = 0; i < 4; i++) ell(x, cx - s * 0.28 + i * s * 0.18, cy + s * 0.12 - i * s * 0.11 - s * 0.1, s * 0.1, s * 0.04, 0x689f38, -0.5); for (const [dx, dy] of [[-0.12, 0.2], [0.1, 0.05]]) ell(x, cx + dx * s, cy + dy * s, s * 0.09, s * 0.12, 0x33691e, 0.3); },
  pasta(x, cx, cy, s, A) { for (let i = 0; i < 4; i++) { x.save(); x.translate(cx - s * 0.2 + (i % 2) * s * 0.3, cy - s * 0.14 + ((i / 2) | 0) * s * 0.28); x.rotate(0.6 + i * 0.4); rr(x, -s * 0.16, -s * 0.06, s * 0.32, s * 0.12, s * 0.02, A || 0xffca28); for (let k = -2; k <= 2; k++) line(x, k * s * 0.05, -s * 0.06, k * s * 0.05 + s * 0.02, s * 0.06, dark(A || 0xffca28, 0.2), 1); x.restore(); } },
  rice(x, cx, cy, s) { for (let i = 0; i < 16; i++) { const a = i * 2.4, r = Math.sqrt(i / 16) * s * 0.34; ell(x, cx + Math.cos(a) * r, cy + Math.sin(a) * r, s * 0.06, s * 0.025, 0xfafafa, a); } },
  soup(x, cx, cy, s, A) { PICTO.bowl(x, cx, cy + s * 0.08, s, A || 0xef6c00); for (const k of [-0.12, 0.02, 0.16]) { x.beginPath(); x.moveTo(cx + k * s, cy - s * 0.08); x.quadraticCurveTo(cx + (k + 0.08) * s, cy - s * 0.2, cx + k * s, cy - s * 0.34); x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = s * 0.03; x.stroke(); } },
  pizza(x, cx, cy, s) { poly(x, [cx - s * 0.32, cy - s * 0.3, cx + s * 0.32, cy - s * 0.3, cx, cy + s * 0.4], 0xffca28); rect(x, cx - s * 0.34, cy - s * 0.36, s * 0.68, s * 0.08, 0xd4a056); for (const [dx, dy] of [[-0.12, -0.15], [0.1, -0.12], [0, 0.08]]) circ(x, cx + dx * s, cy + dy * s, s * 0.06, 0xc62828); },
  icecream(x, cx, cy, s, A) { poly(x, [cx - s * 0.17, cy - s * 0.02, cx + s * 0.17, cy - s * 0.02, cx, cy + s * 0.42], 0xd4a056); circ(x, cx, cy - s * 0.12, s * 0.2, A || 0xf8bbd0); circ(x, cx - s * 0.1, cy - s * 0.25, s * 0.12, light(A || 0xf8bbd0, 0.3)); },
  lips(x, cx, cy, s, A) { x.beginPath(); x.moveTo(cx - s * 0.38, cy); x.quadraticCurveTo(cx - s * 0.2, cy - s * 0.25, cx, cy - s * 0.1); x.quadraticCurveTo(cx + s * 0.2, cy - s * 0.25, cx + s * 0.38, cy); x.quadraticCurveTo(cx, cy + s * 0.32, cx - s * 0.38, cy); x.fillStyle = css(A || 0xc2185b); x.fill(); line(x, cx - s * 0.36, cy, cx + s * 0.36, cy, dark(A || 0xc2185b, 0.35), s * 0.025); },
  eye(x, cx, cy, s, A) { x.beginPath(); x.moveTo(cx - s * 0.42, cy); x.quadraticCurveTo(cx, cy - s * 0.32, cx + s * 0.42, cy); x.quadraticCurveTo(cx, cy + s * 0.32, cx - s * 0.42, cy); x.fillStyle = '#fff'; x.fill(); circ(x, cx, cy, s * 0.15, A || 0x1e88e5); circ(x, cx, cy, s * 0.07, 0x111111); circ(x, cx - s * 0.04, cy - s * 0.04, s * 0.025, 0xffffff); },
  moon(x, cx, cy, s, A) { x.save(); x.beginPath(); x.arc(cx, cy, s * 0.36, 0, 7); x.clip(); x.beginPath(); x.arc(cx, cy, s * 0.36, 0, 7); x.arc(cx + s * 0.16, cy - s * 0.1, s * 0.3, 0, 7); x.fillStyle = css(A || 0xfff59d); x.fill('evenodd'); x.restore(); },
  tool(x, cx, cy, s, A) { x.save(); x.translate(cx, cy); x.rotate(-0.78); rr(x, -s * 0.06, -s * 0.2, s * 0.12, s * 0.6, s * 0.04, A || 0x9e9e9e); circ(x, 0, -s * 0.28, s * 0.16, A || 0x9e9e9e); rect(x, -s * 0.05, -s * 0.48, s * 0.1, s * 0.2, 0x000000); x.restore(); },
  film(x, cx, cy, s) { rect(x, cx - s * 0.4, cy - s * 0.24, s * 0.8, s * 0.48, 0x212121); for (let i = 0; i < 7; i++) { rect(x, cx - s * 0.36 + i * s * 0.11, cy - s * 0.21, s * 0.06, s * 0.05, 0xffffff); rect(x, cx - s * 0.36 + i * s * 0.11, cy + s * 0.16, s * 0.06, s * 0.05, 0xffffff); } rect(x, cx - s * 0.3, cy - s * 0.11, s * 0.26, s * 0.22, 0x90caf9); rect(x, cx + s * 0.04, cy - s * 0.11, s * 0.26, s * 0.22, 0xffcc80); },
  gift(x, cx, cy, s, A) { rect(x, cx - s * 0.32, cy - s * 0.12, s * 0.64, s * 0.48, A || 0xe53935); rect(x, cx - s * 0.36, cy - s * 0.24, s * 0.72, s * 0.14, light(A || 0xe53935, 0.15)); rect(x, cx - s * 0.05, cy - s * 0.24, s * 0.1, s * 0.6, 0xffd600); ell(x, cx - s * 0.12, cy - s * 0.3, s * 0.12, s * 0.06, 0xffd600, 0.4); ell(x, cx + s * 0.12, cy - s * 0.3, s * 0.12, s * 0.06, 0xffd600, -0.4); },
  paint(x, cx, cy, s, A) { rr(x, cx - s * 0.3, cy - s * 0.15, s * 0.6, s * 0.5, s * 0.04, 0xbdbdbd); ell(x, cx, cy - s * 0.15, s * 0.3, s * 0.08, A || 0x1e88e5); x.beginPath(); x.moveTo(cx - s * 0.3, cy - s * 0.15); x.quadraticCurveTo(cx - s * 0.2, cy + s * 0.15, cx - s * 0.1, cy - s * 0.1); x.quadraticCurveTo(cx, cy + s * 0.2, cx + s * 0.1, cy - s * 0.12); x.lineTo(cx + s * 0.3, cy - s * 0.15); x.fillStyle = css(A || 0x1e88e5); x.fill(); },
  plant(x, cx, cy, s, A) { poly(x, [cx - s * 0.2, cy + s * 0.1, cx + s * 0.2, cy + s * 0.1, cx + s * 0.15, cy + s * 0.42, cx - s * 0.15, cy + s * 0.42], 0xa1543a); for (let i = 0; i < 5; i++) ell(x, cx + (i - 2) * s * 0.1, cy - s * 0.1 - Math.abs(i - 2) * -s * 0.05, s * 0.07, s * 0.2, A || 0x43a047, (i - 2) * 0.4); },
  dog(x, cx, cy, s, A) { const c = A || 0xa1887f; circ(x, cx, cy, s * 0.28, c); ell(x, cx - s * 0.26, cy - s * 0.02, s * 0.09, s * 0.2, dark(c, 0.3), 0.3); ell(x, cx + s * 0.26, cy - s * 0.02, s * 0.09, s * 0.2, dark(c, 0.3), -0.3); ell(x, cx, cy + s * 0.12, s * 0.13, s * 0.1, light(c, 0.4)); circ(x, cx, cy + s * 0.07, s * 0.05, 0x212121); circ(x, cx - s * 0.1, cy - s * 0.06, s * 0.035, 0x212121); circ(x, cx + s * 0.1, cy - s * 0.06, s * 0.035, 0x212121); },
  cat(x, cx, cy, s, A) { const c = A || 0xff8f00; poly(x, [cx - s * 0.28, cy - s * 0.05, cx - s * 0.25, cy - s * 0.38, cx - s * 0.06, cy - s * 0.22], c); poly(x, [cx + s * 0.28, cy - s * 0.05, cx + s * 0.25, cy - s * 0.38, cx + s * 0.06, cy - s * 0.22], c); ell(x, cx, cy + s * 0.04, s * 0.3, s * 0.26, c); ell(x, cx - s * 0.11, cy, s * 0.04, s * 0.06, 0x33691e); ell(x, cx + s * 0.11, cy, s * 0.04, s * 0.06, 0x33691e); poly(x, [cx - s * 0.04, cy + s * 0.1, cx + s * 0.04, cy + s * 0.1, cx, cy + s * 0.15], 0xf06292); },
  car(x, cx, cy, s, A) { rr(x, cx - s * 0.42, cy - s * 0.02, s * 0.84, s * 0.22, s * 0.06, A || 0xe53935); poly(x, [cx - s * 0.24, cy - s * 0.02, cx - s * 0.14, cy - s * 0.2, cx + s * 0.14, cy - s * 0.2, cx + s * 0.26, cy - s * 0.02], A || 0xe53935); poly(x, [cx - s * 0.18, cy - s * 0.04, cx - s * 0.11, cy - s * 0.16, cx + s * 0.11, cy - s * 0.16, cx + s * 0.19, cy - s * 0.04], 0xb3e5fc); circ(x, cx - s * 0.24, cy + s * 0.2, s * 0.09, 0x212121); circ(x, cx + s * 0.24, cy + s * 0.2, s * 0.09, 0x212121); },
  robot(x, cx, cy, s, A) { const c = A || 0x90a4ae; rr(x, cx - s * 0.2, cy - s * 0.36, s * 0.4, s * 0.3, s * 0.05, c); rr(x, cx - s * 0.26, cy - s * 0.02, s * 0.52, s * 0.4, s * 0.05, c); circ(x, cx - s * 0.08, cy - s * 0.22, s * 0.05, 0xffeb3b); circ(x, cx + s * 0.08, cy - s * 0.22, s * 0.05, 0xffeb3b); line(x, cx, cy - s * 0.36, cx, cy - s * 0.46, c, s * 0.03); rect(x, cx - s * 0.12, cy + s * 0.1, s * 0.24, s * 0.12, 0x37474f); },
  bear(x, cx, cy, s, A) { const c = A || 0x9c6b3e; circ(x, cx - s * 0.22, cy - s * 0.24, s * 0.11, c); circ(x, cx + s * 0.22, cy - s * 0.24, s * 0.11, c); circ(x, cx, cy, s * 0.3, c); ell(x, cx, cy + s * 0.1, s * 0.13, s * 0.1, light(c, 0.4)); circ(x, cx, cy + s * 0.06, s * 0.04, 0x212121); circ(x, cx - s * 0.11, cy - s * 0.06, s * 0.035, 0x212121); circ(x, cx + s * 0.11, cy - s * 0.06, s * 0.035, 0x212121); },
  dino(x, cx, cy, s, A) { const c = A || 0x43a047; ell(x, cx - s * 0.05, cy + s * 0.08, s * 0.25, s * 0.17, c); ell(x, cx + s * 0.22, cy - s * 0.2, s * 0.12, s * 0.09, c); line(x, cx + s * 0.12, cy - s * 0.02, cx + s * 0.2, cy - s * 0.16, c, s * 0.1); poly(x, [cx - s * 0.25, cy + s * 0.05, cx - s * 0.45, cy + s * 0.2, cx - s * 0.22, cy + s * 0.18], c); for (let i = 0; i < 4; i++) star(x, cx - s * 0.18 + i * s * 0.1, cy - s * 0.08, s * 0.05, s * 0.02, 3, light(c, 0.4)); circ(x, cx + s * 0.25, cy - s * 0.23, s * 0.025, 0x111111); },
  cube(x, cx, cy, s) { const cols = [0xe53935, 0xffd600, 0x1e88e5, 0x43a047, 0xff9800, 0xffffff]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rr(x, cx - s * 0.33 + i * s * 0.22, cy - s * 0.33 + j * s * 0.22, s * 0.2, s * 0.2, s * 0.03, cols[(i + j * 2) % 6]); },
  puzzle(x, cx, cy, s, A) { const c = A || 0x26a69a; rect(x, cx - s * 0.3, cy - s * 0.2, s * 0.5, s * 0.5, c); circ(x, cx + s * 0.2, cy + s * 0.05, s * 0.1, c); circ(x, cx - s * 0.05, cy - s * 0.2, s * 0.1, c); },
  mask(x, cx, cy, s, A) { x.beginPath(); x.moveTo(cx - s * 0.36, cy - s * 0.15); x.quadraticCurveTo(cx, cy - s * 0.32, cx + s * 0.36, cy - s * 0.15); x.quadraticCurveTo(cx + s * 0.3, cy + s * 0.38, cx, cy + s * 0.38); x.quadraticCurveTo(cx - s * 0.3, cy + s * 0.38, cx - s * 0.36, cy - s * 0.15); x.fillStyle = css(A || 0xffffff); x.fill(); ell(x, cx - s * 0.13, cy - s * 0.02, s * 0.08, s * 0.06, 0x111111); ell(x, cx + s * 0.13, cy - s * 0.02, s * 0.08, s * 0.06, 0x111111); x.beginPath(); x.arc(cx, cy + s * 0.16, s * 0.1, 0.2, 2.9); x.strokeStyle = '#111'; x.lineWidth = s * 0.03; x.stroke(); },
  ghost(x, cx, cy, s) { x.beginPath(); x.moveTo(cx - s * 0.28, cy + s * 0.38); x.lineTo(cx - s * 0.28, cy - s * 0.08); x.arc(cx, cy - s * 0.08, s * 0.28, Math.PI, 0); x.lineTo(cx + s * 0.28, cy + s * 0.38); for (let i = 0; i < 4; i++) x.lineTo(cx + s * 0.28 - (i + 0.5) * s * 0.14, cy + s * (i % 2 ? 0.38 : 0.28)); x.closePath(); x.fillStyle = '#fff'; x.fill(); circ(x, cx - s * 0.1, cy - s * 0.1, s * 0.05, 0x111111); circ(x, cx + s * 0.1, cy - s * 0.1, s * 0.05, 0x111111); },
  skull(x, cx, cy, s) { circ(x, cx, cy - s * 0.08, s * 0.3, 0xfafafa); rr(x, cx - s * 0.16, cy + s * 0.1, s * 0.32, s * 0.22, s * 0.04, 0xfafafa); circ(x, cx - s * 0.11, cy - s * 0.06, s * 0.08, 0x111111); circ(x, cx + s * 0.11, cy - s * 0.06, s * 0.08, 0x111111); poly(x, [cx, cy + s * 0.04, cx - s * 0.04, cy + s * 0.12, cx + s * 0.04, cy + s * 0.12], 0x111111); },
  scissors(x, cx, cy, s) { line(x, cx - s * 0.3, cy - s * 0.3, cx + s * 0.25, cy + s * 0.2, 0x9e9e9e, s * 0.06); line(x, cx + s * 0.3, cy - s * 0.3, cx - s * 0.25, cy + s * 0.2, 0x9e9e9e, s * 0.06); for (const dx of [-1, 1]) { circ(x, cx + dx * s * 0.28, cy + s * 0.3, s * 0.11, null); x.strokeStyle = '#e53935'; x.lineWidth = s * 0.05; x.stroke(); } },
  comb(x, cx, cy, s) { rect(x, cx - s * 0.38, cy - s * 0.15, s * 0.76, s * 0.1, 0x212121); for (let i = 0; i < 12; i++) rect(x, cx - s * 0.36 + i * s * 0.063, cy - s * 0.05, s * 0.03, s * 0.25, 0x212121); },
  watch(x, cx, cy, s, A) { rect(x, cx - s * 0.1, cy - s * 0.42, s * 0.2, s * 0.84, 0x5d4037); circ(x, cx, cy, s * 0.24, A || 0xd4af37); circ(x, cx, cy, s * 0.19, 0xfafafa); line(x, cx, cy, cx, cy - s * 0.13, 0x111111, s * 0.03); line(x, cx, cy, cx + s * 0.09, cy, 0x111111, s * 0.03); },
  ring(x, cx, cy, s, A) { circ(x, cx, cy + s * 0.08, s * 0.28, null); x.strokeStyle = css(A || 0xd4af37); x.lineWidth = s * 0.08; x.stroke(); poly(x, [cx, cy - s * 0.42, cx + s * 0.12, cy - s * 0.28, cx, cy - s * 0.16, cx - s * 0.12, cy - s * 0.28], 0xb3e5fc); },
  glasses(x, cx, cy, s, A) { const c = A || 0x212121; for (const dx of [-1, 1]) { circ(x, cx + dx * s * 0.2, cy, s * 0.15, 0x90caf9); x.strokeStyle = css(c); x.lineWidth = s * 0.05; x.stroke(); } line(x, cx - s * 0.05, cy - s * 0.02, cx + s * 0.05, cy - s * 0.02, c, s * 0.04); line(x, cx - s * 0.35, cy - s * 0.04, cx - s * 0.44, cy - s * 0.1, c, s * 0.04); line(x, cx + s * 0.35, cy - s * 0.04, cx + s * 0.44, cy - s * 0.1, c, s * 0.04); },
  headphones(x, cx, cy, s, A) { x.beginPath(); x.arc(cx, cy + s * 0.05, s * 0.3, Math.PI, 0); x.strokeStyle = css(A || 0x212121); x.lineWidth = s * 0.06; x.stroke(); rr(x, cx - s * 0.38, cy, s * 0.14, s * 0.26, s * 0.05, A || 0x212121); rr(x, cx + s * 0.24, cy, s * 0.14, s * 0.26, s * 0.05, A || 0x212121); },
  laptop(x, cx, cy, s, A) { rr(x, cx - s * 0.32, cy - s * 0.28, s * 0.64, s * 0.42, s * 0.03, A || 0x424242); rect(x, cx - s * 0.28, cy - s * 0.24, s * 0.56, s * 0.34, 0x29b6f6); poly(x, [cx - s * 0.4, cy + s * 0.2, cx + s * 0.4, cy + s * 0.2, cx + s * 0.34, cy + s * 0.14, cx - s * 0.34, cy + s * 0.14], A || 0x616161); },
  tv(x, cx, cy, s, A) { rr(x, cx - s * 0.4, cy - s * 0.3, s * 0.8, s * 0.5, s * 0.03, A || 0x212121); rect(x, cx - s * 0.36, cy - s * 0.26, s * 0.72, s * 0.42, 0x1e88e5); rect(x, cx - s * 0.1, cy + s * 0.2, s * 0.2, s * 0.06, A || 0x212121); rect(x, cx - s * 0.2, cy + s * 0.26, s * 0.4, s * 0.04, A || 0x212121); },
  cd(x, cx, cy, s) { circ(x, cx, cy, s * 0.38, 0xcfd8dc); const g = x.createLinearGradient(cx - s * 0.38, cy - s * 0.38, cx + s * 0.38, cy + s * 0.38); g.addColorStop(0, 'rgba(255,0,128,0.35)'); g.addColorStop(0.5, 'rgba(0,200,255,0.35)'); g.addColorStop(1, 'rgba(255,255,0,0.35)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, s * 0.38, 0, 7); x.fill(); circ(x, cx, cy, s * 0.08, 0xffffff); },
  key(x, cx, cy, s, A) { circ(x, cx - s * 0.22, cy, s * 0.15, null); x.strokeStyle = css(A || 0xd4af37); x.lineWidth = s * 0.07; x.stroke(); line(x, cx - s * 0.08, cy, cx + s * 0.38, cy, A || 0xd4af37, s * 0.07); line(x, cx + s * 0.25, cy, cx + s * 0.25, cy + s * 0.12, A || 0xd4af37, s * 0.06); line(x, cx + s * 0.35, cy, cx + s * 0.35, cy + s * 0.1, A || 0xd4af37, s * 0.06); },
  lock(x, cx, cy, s, A) { x.beginPath(); x.arc(cx, cy - s * 0.08, s * 0.18, Math.PI, 0); x.strokeStyle = '#9e9e9e'; x.lineWidth = s * 0.07; x.stroke(); rr(x, cx - s * 0.26, cy - s * 0.08, s * 0.52, s * 0.42, s * 0.05, A || 0xd4a017); circ(x, cx, cy + s * 0.1, s * 0.05, 0x212121); },
  hammer(x, cx, cy, s) { x.save(); x.translate(cx, cy); x.rotate(0.6); rect(x, -s * 0.04, -s * 0.15, s * 0.08, s * 0.55, 0x8d5524); rect(x, -s * 0.24, -s * 0.3, s * 0.48, s * 0.15, 0x616161); x.restore(); },
  drill(x, cx, cy, s, A) { rr(x, cx - s * 0.3, cy - s * 0.25, s * 0.5, s * 0.2, s * 0.05, A || 0x2e7d32); rr(x, cx - s * 0.2, cy - s * 0.08, s * 0.16, s * 0.4, s * 0.04, dark(A || 0x2e7d32, 0.3)); rect(x, cx + s * 0.2, cy - s * 0.18, s * 0.2, s * 0.06, 0x9e9e9e); },
  brush(x, cx, cy, s, A) { x.save(); x.translate(cx, cy); x.rotate(-0.7); rect(x, -s * 0.04, 0, s * 0.08, s * 0.42, 0xc8a165); rect(x, -s * 0.1, -s * 0.08, s * 0.2, s * 0.1, 0x9e9e9e); rr(x, -s * 0.11, -s * 0.36, s * 0.22, s * 0.3, s * 0.03, A || 0x1e88e5); x.restore(); },
  screw(x, cx, cy, s) { rect(x, cx - s * 0.06, cy - s * 0.25, s * 0.12, s * 0.6, 0x9e9e9e); for (let i = 0; i < 7; i++) line(x, cx - s * 0.09, cy - s * 0.2 + i * s * 0.08, cx + s * 0.09, cy - s * 0.16 + i * s * 0.08, 0x616161, s * 0.025); rr(x, cx - s * 0.18, cy - s * 0.36, s * 0.36, s * 0.12, s * 0.04, 0xbdbdbd); line(x, cx - s * 0.1, cy - s * 0.3, cx + s * 0.1, cy - s * 0.3, 0x424242, s * 0.03); },
  cake(x, cx, cy, s, A) { rect(x, cx - s * 0.32, cy - s * 0.05, s * 0.64, s * 0.36, 0xf8bbd0); rect(x, cx - s * 0.32, cy - s * 0.12, s * 0.64, s * 0.1, A || 0x6d4c41); for (let i = 0; i < 3; i++) { rect(x, cx - s * 0.2 + i * s * 0.2 - s * 0.02, cy - s * 0.32, s * 0.04, s * 0.2, 0x42a5f5); PICTO.flame(x, cx - s * 0.2 + i * s * 0.2, cy - s * 0.36, s * 0.14); } },
  croissant(x, cx, cy, s) { for (let i = -2; i <= 2; i++) ell(x, cx + i * s * 0.14, cy + Math.abs(i) * s * 0.06, s * (0.15 - Math.abs(i) * 0.025), s * 0.17, i % 2 ? 0xd4893a : 0xe0a040, i * 0.35); },
  egg(x, cx, cy, s) { ell(x, cx - s * 0.12, cy + s * 0.04, s * 0.18, s * 0.24, 0xf5e6d0); ell(x, cx + s * 0.16, cy + s * 0.08, s * 0.18, s * 0.24, 0xe8cfa8); },
  milk(x, cx, cy, s, A) { poly(x, [cx - s * 0.2, cy - s * 0.18, cx + s * 0.2, cy - s * 0.18, cx + s * 0.2, cy + s * 0.4, cx - s * 0.2, cy + s * 0.4], 0xffffff); poly(x, [cx - s * 0.2, cy - s * 0.18, cx, cy - s * 0.36, cx + s * 0.2, cy - s * 0.18], 0xe3f2fd); for (const [dx, dy, r] of [[-0.08, 0.05, 0.06], [0.08, 0.2, 0.05], [0.1, -0.05, 0.04]]) circ(x, cx + dx * s, cy + dy * s, r * s, A || 0x212121); },
  cow(x, cx, cy, s) { ell(x, cx, cy, s * 0.3, s * 0.26, 0xffffff); ell(x, cx - s * 0.1, cy - s * 0.08, s * 0.1, s * 0.08, 0x212121); ell(x, cx, cy + s * 0.14, s * 0.2, s * 0.11, 0xf8bbd0); circ(x, cx - s * 0.07, cy + s * 0.14, s * 0.025, 0x5d4037); circ(x, cx + s * 0.07, cy + s * 0.14, s * 0.025, 0x5d4037); poly(x, [cx - s * 0.25, cy - s * 0.18, cx - s * 0.38, cy - s * 0.3, cx - s * 0.2, cy - s * 0.26], 0xfff3e0); poly(x, [cx + s * 0.25, cy - s * 0.18, cx + s * 0.38, cy - s * 0.3, cx + s * 0.2, cy - s * 0.26], 0xfff3e0); },
  pig(x, cx, cy, s) { circ(x, cx, cy, s * 0.3, 0xf8bbd0); ell(x, cx, cy + s * 0.06, s * 0.12, s * 0.09, 0xf48fb1); circ(x, cx - s * 0.04, cy + s * 0.06, s * 0.025, 0xad1457); circ(x, cx + s * 0.04, cy + s * 0.06, s * 0.025, 0xad1457); circ(x, cx - s * 0.12, cy - s * 0.08, s * 0.03, 0x212121); circ(x, cx + s * 0.12, cy - s * 0.08, s * 0.03, 0x212121); poly(x, [cx - s * 0.22, cy - s * 0.2, cx - s * 0.3, cy - s * 0.36, cx - s * 0.1, cy - s * 0.26], 0xf48fb1); poly(x, [cx + s * 0.22, cy - s * 0.2, cx + s * 0.3, cy - s * 0.36, cx + s * 0.1, cy - s * 0.26], 0xf48fb1); },
  waves(x, cx, cy, s, A) { for (let k = 0; k < 3; k++) { x.beginPath(); for (let i = 0; i <= 20; i++) { const px = cx - s * 0.4 + i * s * 0.04, py = cy - s * 0.18 + k * s * 0.18 + Math.sin(i * 0.9) * s * 0.05; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.strokeStyle = css(A || 0x29b6f6); x.lineWidth = s * 0.06; x.stroke(); } },
  mountain(x, cx, cy, s, A) { poly(x, [cx - s * 0.45, cy + s * 0.3, cx - s * 0.12, cy - s * 0.25, cx + s * 0.12, cy + s * 0.05, cx + s * 0.22, cy - s * 0.08, cx + s * 0.45, cy + s * 0.3], A || 0x546e7a); poly(x, [cx - s * 0.2, cy - s * 0.12, cx - s * 0.12, cy - s * 0.25, cx - s * 0.04, cy - s * 0.12], 0xffffff); },
  chips(x, cx, cy, s, A) { const c = A || 0xffca28; for (const [dx, dy, r] of [[-0.18, 0.12, -0.4], [0.16, 0.1, 0.5], [0, -0.08, 0.1], [-0.08, 0.28, 0.9], [0.2, 0.3, -0.7]]) { ell(x, cx + dx * s, cy + dy * s, s * 0.2, s * 0.13, c, r); ell(x, cx + dx * s - s * 0.03, cy + dy * s - s * 0.02, s * 0.1, s * 0.05, light(c, 0.4), r); } },
  fries(x, cx, cy, s) { for (let i = 0; i < 7; i++) rect(x, cx - s * 0.22 + i * s * 0.07, cy - s * 0.38 + (i % 3) * s * 0.05, s * 0.05, s * 0.4, 0xffd54f); poly(x, [cx - s * 0.3, cy - s * 0.02, cx + s * 0.3, cy - s * 0.02, cx + s * 0.22, cy + s * 0.4, cx - s * 0.22, cy + s * 0.4], 0xd32f2f); },
  sushi(x, cx, cy, s) { circ(x, cx - s * 0.16, cy, s * 0.17, 0x212121); circ(x, cx - s * 0.16, cy, s * 0.12, 0xfafafa); circ(x, cx - s * 0.16, cy, s * 0.06, 0xff7043); ell(x, cx + s * 0.18, cy + s * 0.05, s * 0.18, s * 0.09, 0xfafafa); ell(x, cx + s * 0.18, cy - s * 0.02, s * 0.19, s * 0.07, 0xff8a65); },
};
export const PICTOS = Object.keys(PICTO);

// ── motifs textiles ──
function fabric(x, X, Y, w, h, c, pat, rnd, c2) {
  rect(x, X, Y, w, h, c); const a = c2 ?? (lum(c) > 0.5 ? dark(c, 0.35) : light(c, 0.35));
  if (pat === 'stripes') { const n = 4 + ((rnd() * 6) | 0); for (let i = 0; i < n * 2; i += 2) rect(x, X, Y + i * h / (n * 2), w, h / (n * 2) * 0.6, a); }
  else if (pat === 'vstripes') { const n = 6 + ((rnd() * 8) | 0); for (let i = 0; i < n; i++) rect(x, X + i * w / n, Y, w / n * 0.35, h, a); }
  else if (pat === 'check') { const n = 4 + ((rnd() * 4) | 0); x.globalAlpha = 0.45; for (let i = 0; i < n; i++) { rect(x, X + i * w / n, Y, w / n * 0.4, h, a); rect(x, X, Y + i * h / n, w, h / n * 0.4, a); } x.globalAlpha = 1; }
  else if (pat === 'dots') { const n = 5 + ((rnd() * 4) | 0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) circ(x, X + (i + (j % 2) * 0.5 + 0.25) * w / n, Y + (j + 0.5) * h / n, Math.min(w, h) / n * 0.18, a); }
  else if (pat === 'floral') { for (let i = 0; i < 14; i++) PICTO.flower(x, X + rnd() * w, Y + rnd() * h, Math.min(w, h) * 0.2, a); }
  else if (pat === 'denim') { for (let i = 0; i < w + h; i += 2) line(x, X + i, Y, X + i - h, Y + h, dark(c, 0.15), 0.8); }
  else if (pat === 'camo') { for (let i = 0; i < 18; i++) ell(x, X + rnd() * w, Y + rnd() * h, w * (0.05 + rnd() * 0.1), h * (0.04 + rnd() * 0.08), [dark(c, 0.3), light(c, 0.2), mix(c, 0x5d4037, 0.5)][i % 3], rnd() * 3); }
  else if (pat === 'logo') { circ(x, X + w / 2, Y + h * 0.4, Math.min(w, h) * 0.18, a); }
}

// ─────────────────────────────────────────────────────────────────────────────
export class LabelAtlas {
  constructor() {
    this.W = 2048; this.H = 4096; // espace virtuel des UV ; recadré par finalize()
    this.size = this.W; // compatibilité
    this.c = canvas(this.W, this.H); this.ctx = this.c.getContext('2d');
    this.ctx.fillStyle = '#ffffff'; this.ctx.fillRect(0, 0, this.W, this.H); // fond blanc : pas de noir au mipmap
    this.map = new Map(); this.shelves = []; this.top = 0; this.limit = this.H;
    this.texture = null; this.count = 0; this.full = 0;
    const r = this._alloc(60, 60); rect(this.ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 0xffffff);
    const cx = (r.x + r.w / 2) / this.W, cy = 1 - (r.y + r.h / 2) / this.H;
    this._white = { u0: cx, v0: cy, u1: cx, v1: cy };
  }
  // rectangle UV {u0, v0, u1, v1} de la zone blanche (point dégénéré : jamais de mélange au mipmap)
  white() { return this._white; }
  has(key) { return this.map.has(key); }
  get used() { return this.top; }
  // Rangement « skyline » (ligne d'horizon, placement le plus haut possible) : bien plus compact que des étagères
  // quand les hauteurs d'étiquettes sont très variées. 2 px de marge autour (remplie de la couleur du bord).
  _alloc(w, h) {
    w = Math.max(4, Math.min(this.W - 8, Math.round(w))); h = Math.max(4, Math.min(512, Math.round(h)));
    const AW = w + 4, AH = h + 4, S = this.shelves, W = this.W;
    if (!S.length) S.push({ x: 0, y: 0, w: W });
    let bi = -1, bx = 0, by = 0, bs = Infinity;
    for (let i = 0; i < S.length; i++) {
      const x = S[i].x; if (x + AW > W) break;
      let y = 0, j = i, rem = AW; while (rem > 0) { if (S[j].y > y) y = S[j].y; rem -= S[j].w; j++; }
      if (y + AH < bs) { bs = y + AH; bi = i; bx = x; by = y; }
    }
    if (bi < 0 || bs > this.limit) { this.full++; return null; }
    // nouvelle marche de l'horizon, puis découpe / fusion des segments recouverts
    const out = [];
    for (const s of S) {
      const s1 = s.x + s.w;
      if (s1 <= bx || s.x >= bx + AW) out.push(s);
      else { if (s.x < bx) out.push({ x: s.x, y: s.y, w: bx - s.x }); if (s1 > bx + AW) out.push({ x: bx + AW, y: s.y, w: s1 - bx - AW }); }
    }
    out.push({ x: bx, y: by + AH, w: AW }); out.sort((a, b) => a.x - b.x);
    S.length = 0; for (const s of out) { const l = S[S.length - 1]; if (l && l.y === s.y) l.w += s.w; else S.push(s); }
    if (by + AH > this.top) this.top = by + AH;
    return { x: bx + 2, y: by + 2, w, h };
  }
  _uv(r) { return { u0: (r.x + 0.5) / this.W, v0: 1 - (r.y + r.h - 0.5) / this.H, u1: (r.x + r.w - 0.5) / this.W, v1: 1 - (r.y + 0.5) / this.H }; }
  _done(key, r) { const uv = this._uv(r); this.map.set(key, uv); this.count++; if (this.texture) this.texture.needsUpdate = true; return uv; }
  // Ancien format : dessin clair, coloré par la couleur de sommet (portes, cassettes, objets historiques)
  label(key, text, color, style = 'box') {
    if (this.map.has(key)) return this.map.get(key);
    const C = 96, r = this._alloc(C, C); if (!r) return this.white();
    const ctx = this.ctx; const rnd = mulberry32(hashString(key));
    ctx.save(); ctx.translate(r.x, r.y);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-2, -2, C + 4, C + 4);
    const accent = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1'][(rnd() * 7) | 0];
    if (style === 'vinyl' || style === 'vhs') {
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, C, C);
      for (let k = 0; k < 4; k++) { ctx.fillStyle = `hsl(${(rnd() * 360) | 0},70%,${40 + rnd() * 30}%)`; ctx.fillRect(rnd() * C, rnd() * C, 18 + rnd() * 52, 18 + rnd() * 52); }
    } else {
      ctx.fillStyle = accent; ctx.fillRect(0, C * 0.62, C, C * 0.12);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(C * 0.5, C * 0.32, C * 0.22, 0, 7); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.stroke();
    }
    const t = (text || '').toUpperCase().slice(0, 18);
    txt(ctx, t, C / 2, style === 'vinyl' || style === 'vhs' ? C * 0.5 : C * 0.32, C - 10, 26, { color: 0x111111, lines: 1, scale: 1, min: 9 });
    if (style !== 'vinyl' && style !== 'vhs') txt(ctx, 'HÉLIOS', C / 2, C * 0.86, C - 20, 12, { font: SANS, weight: 700, color: 0x333333, scale: 1 });
    ctx.restore();
    return this._done(key, r);
  }
  // Emballage en couleurs réelles : w × h pixels, info = {kind, brand, name, sub, picto, bg, fg, accent, ...}
  pack(key, w, h, info = {}) {
    if (this.map.has(key)) return this.map.get(key);
    const r = this._alloc(w, h); if (!r) return this.white();
    const ctx = this.ctx; const rnd = mulberry32(hashString(key) ^ (info.seed || 0));
    ctx.save(); ctx.translate(r.x, r.y);
    const bg = info.bg ?? 0xffffff;
    rect(ctx, -2, -2, r.w + 4, r.h + 4, info.edge ?? bg);
    ctx.beginPath(); ctx.rect(0, 0, r.w, r.h); ctx.clip();
    try { (KINDS[info.kind] || KINDS.box)(ctx, r.w, r.h, info, rnd); } catch (e) { console.warn('[atlas]', key, e); }
    ctx.restore(); // la marge de 2 px garde la couleur de fond de l'étiquette (pas de copie du canvas sur lui-même : trop lent)
    return this._done(key, r);
  }
  stats() { return { labels: this.count, usedRows: this.top, width: this.W, height: this.texture ? this.texture.image.height : this.H, full: this.full, mb: +(this.W * (this.texture ? this.texture.image.height : this.top) * 4 * 4 / 3 / 1048576).toFixed(1) }; }
  finalize() {
    if (this.texture) return this.texture;
    // recadrage à la hauteur utilisée ; les UV (espace 2048 × 4096) sont remappées par repeat/offset
    const used = Math.min(this.H, Math.max(256, Math.ceil((this.top + 32) / 64) * 64));
    let img = this.c;
    if (used < this.H) {
      img = canvas(this.W, used); const cx = img.getContext('2d'); cx.drawImage(this.c, 0, 0);
      this.c.width = this.c.height = 1; // libère le grand canvas
      this.c = img; this.ctx = cx; this.limit = used;
    }
    const t = new THREE.CanvasTexture(img);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = getMaxAnisotropy(); t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.repeat.set(1, this.H / used); t.offset.set(0, 1 - this.H / used); t.needsUpdate = true;
    this.texture = t; return t;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mises en page des emballages. Signature : (ctx, W, H, info, rnd)
function picto(ctx, name, cx, cy, s, col) { const f = PICTO[name]; if (f) { ctx.save(); f(ctx, cx, cy, s, col); ctx.restore(); return true; } return false; }
function badge(ctx, text, cx, cy, w, h, bg, fg, shape = 'pill') {
  if (shape === 'burst') { star(ctx, cx, cy, Math.max(w, h) * 0.55, Math.max(w, h) * 0.42, 14, bg); txt(ctx, text, cx, cy, w * 0.82, h * 0.7, { color: fg, font: BLACK }); return; }
  rr(ctx, cx - w / 2, cy - h / 2, w, h, shape === 'pill' ? h / 2 : h * 0.15, bg); txt(ctx, text, cx, cy, w * 0.86, h * 0.86, { color: fg, font: BLACK, lines: 1 });
}
function brandMark(ctx, brand, cx, cy, w, h, bg, rnd, style) {
  if (!brand) return;
  const v = style ?? ((rnd() * 5) | 0), fg = ink(bg);
  if (v === 0) { ell(ctx, cx, cy, w / 2, h / 2, 0xffffff); ctx.strokeStyle = css(bg); ctx.lineWidth = Math.max(1, h * 0.08); ctx.stroke(); txt(ctx, brand, cx, cy, w * 0.78, h * 0.62, { color: dark(bg, 0.2), font: SERIF, italic: true, weight: 700, lines: 1 }); }
  else if (v === 1) { rr(ctx, cx - w / 2, cy - h / 2, w, h, h * 0.2, 0xffffff); txt(ctx, brand, cx, cy, w * 0.86, h * 0.7, { color: bg === 0xffffff ? 0xc62828 : dark(bg, 0.15), font: BLACK, lines: 1 }); }
  else if (v === 2) { txt(ctx, brand, cx, cy, w, h, { color: fg, font: SERIF, italic: true, weight: 700, lines: 1, stroke: lum(bg) > 0.62 ? null : dark(bg, 0.45), strokeW: 0.12 }); }
  else if (v === 3) { txt(ctx, brand.toUpperCase(), cx, cy, w, h * 0.8, { color: fg, font: IMPACT, weight: 400, lines: 1 }); }
  else { rr(ctx, cx - w / 2, cy - h / 2, w, h, h / 2, 0xd32f2f); txt(ctx, brand, cx, cy, w * 0.84, h * 0.66, { color: 0xffffff, font: BLACK, lines: 1 }); }
}

const KINDS = {
  // Emballage générique (boîtes, faces de conditionnements) : 6 variantes de mise en page
  box(x, W, H, I, rnd) {
    const bg = I.bg ?? 0xffffff, ac = I.accent ?? accentFor(bg, rnd), fg = I.fg ?? ink(bg);
    const v = I.layout ?? ((rnd() * 6) | 0);
    if (W < 26 || H < 26) { rect(x, 0, 0, W, H, bg); rect(x, 0, H * 0.62, W, H * 0.16, ac); txt(x, I.brand || I.name, W / 2, H * 0.32, W * 0.92, H * 0.5, { color: fg, lines: 1 }); return; }
    if (W > H * 1.45) { // paysage : pictogramme à gauche, texte à droite
      rect(x, 0, 0, W, H, bg);
      if (v % 2) { const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, css(light(bg, 0.25))); g.addColorStop(1, css(dark(bg, 0.12))); x.fillStyle = g; x.fillRect(0, 0, W, H); }
      rect(x, 0, H * 0.84, W, H * 0.16, ac);
      const ps = Math.min(H * 0.86, W * 0.36); circ(x, ps * 0.56, H * 0.46, ps * 0.42, light(bg, v % 3 === 0 ? 0.55 : 0.3));
      picto(x, I.picto, ps * 0.56, H * 0.46, ps * 0.78, I.pc);
      const tx = ps * 1.12, tw = W - tx - W * 0.03;
      brandMark(x, I.brand, tx + tw / 2, H * 0.2, Math.min(tw * 0.8, H * 1.6), H * 0.24, bg, rnd);
      txt(x, I.name, tx + tw / 2, H * 0.52, tw, H * 0.34, { color: fg, shadow: lum(bg) < 0.45 ? dark(bg, 0.5) : null });
      if (I.sub) txt(x, I.sub, tx + tw / 2, H * 0.92, tw * 0.9, H * 0.13, { color: ink(ac), font: SANS, weight: 700, lines: 1 });
      return;
    }
    rect(x, 0, 0, W, H, bg);
    const ps = Math.min(W, H) * (H > W * 1.6 ? 0.62 : 0.5);
    if (v === 0) { // bandeau de marque + pictogramme + nom
      rect(x, 0, 0, W, H * 0.22, ac); brandMark(x, I.brand, W / 2, H * 0.11, W * 0.8, H * 0.15, ac, rnd, 3);
      circ(x, W / 2, H * 0.47, ps * 0.5, light(bg, 0.45)); picto(x, I.picto, W / 2, H * 0.47, ps * 0.85, I.pc);
      txt(x, I.name, W / 2, H * 0.78, W * 0.9, H * 0.18, { color: fg }); if (I.sub) badge(x, I.sub, W * 0.72, H * 0.92, W * 0.46, H * 0.08, ac, ink(ac));
    } else if (v === 1) { // diagonale
      x.save(); x.translate(W / 2, H * 0.55); x.rotate(-0.35); rect(x, -W, -H * 0.1, W * 2, H * 0.2, ac); x.restore();
      brandMark(x, I.brand, W * 0.5, H * 0.13, W * 0.78, H * 0.14, bg, rnd, 1);
      txt(x, I.name, W / 2, H * 0.36, W * 0.92, H * 0.22, { color: fg, stroke: lum(bg) > 0.62 ? 0xffffff : dark(bg, 0.5), strokeW: 0.1 });
      picto(x, I.picto, W * 0.62, H * 0.74, ps * 0.9, I.pc); if (I.sub) txt(x, I.sub, W * 0.24, H * 0.9, W * 0.4, H * 0.1, { color: fg, font: SANS, weight: 700 });
    } else if (v === 2) { // soleil
      const g = x.createRadialGradient(W / 2, H * 0.42, 1, W / 2, H * 0.42, Math.max(W, H) * 0.7); g.addColorStop(0, css(light(bg, 0.45))); g.addColorStop(1, css(dark(bg, 0.15))); x.fillStyle = g; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; poly(x, [W / 2, H * 0.42, W / 2 + Math.cos(a) * W, H * 0.42 + Math.sin(a) * W, W / 2 + Math.cos(a + 0.1) * W, H * 0.42 + Math.sin(a + 0.1) * W], light(bg, 0.12)); }
      brandMark(x, I.brand, W / 2, H * 0.12, W * 0.72, H * 0.14, bg, rnd, 0);
      picto(x, I.picto, W / 2, H * 0.44, ps, I.pc);
      txt(x, I.name, W / 2, H * 0.76, W * 0.92, H * 0.2, { color: 0xffffff, stroke: dark(bg, 0.55), strokeW: 0.18 }); if (I.sub) txt(x, I.sub, W / 2, H * 0.92, W * 0.8, H * 0.09, { color: fg, font: SANS, weight: 700 });
    } else if (v === 3) { // bicolore
      rect(x, 0, H * 0.56, W, H * 0.44, 0xfafafa); rect(x, 0, H * 0.54, W, H * 0.03, ac);
      brandMark(x, I.brand, W / 2, H * 0.12, W * 0.78, H * 0.15, bg, rnd, 2);
      circ(x, W / 2, H * 0.42, ps * 0.48, 0xffffff); picto(x, I.picto, W / 2, H * 0.42, ps * 0.82, I.pc);
      txt(x, I.name, W / 2, H * 0.74, W * 0.9, H * 0.18, { color: dark(bg, 0.25) }); if (I.sub) txt(x, I.sub, W / 2, H * 0.9, W * 0.8, H * 0.09, { color: 0x555555, font: SANS, weight: 700 });
    } else if (v === 4) { // cadre classique
      rect(x, 0, 0, W, H, light(bg, 0.82)); const m = Math.max(2, Math.min(W, H) * 0.06); x.strokeStyle = css(bg); x.lineWidth = m; x.strokeRect(m, m, W - m * 2, H - m * 2);
      rect(x, m * 2, H * 0.08, W - m * 4, H * 0.18, bg); txt(x, I.brand || '', W / 2, H * 0.17, W * 0.78, H * 0.13, { color: ink(bg), font: SERIF, weight: 700, lines: 1 });
      picto(x, I.picto, W / 2, H * 0.47, ps * 0.8, I.pc);
      txt(x, I.name, W / 2, H * 0.75, W * 0.8, H * 0.16, { color: dark(bg, 0.2), font: SERIF, weight: 700 }); if (I.sub) txt(x, I.sub, W / 2, H * 0.88, W * 0.7, H * 0.07, { color: 0x333333, font: SANS, weight: 400 });
    } else { // vague
      x.beginPath(); x.moveTo(0, H * 0.68); for (let i = 0; i <= 10; i++) x.lineTo(i * W / 10, H * 0.68 + Math.sin(i * 0.9 + rnd()) * H * 0.04); x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fillStyle = css(ac); x.fill();
      brandMark(x, I.brand, W / 2, H * 0.12, W * 0.8, H * 0.15, bg, rnd, 4);
      txt(x, I.name, W / 2, H * 0.35, W * 0.9, H * 0.22, { color: fg });
      picto(x, I.picto, W / 2, H * 0.72, ps * 0.8, I.pc); if (I.sub) txt(x, I.sub, W / 2, H * 0.93, W * 0.8, H * 0.08, { color: ink(ac), font: SANS, weight: 700 });
    }
    if (I.promo && W > 40) badge(x, I.promo, W * 0.8, H * 0.3, W * 0.36, W * 0.36, 0xffd600, 0xd50000, 'burst');
    gloss(x, 0, 0, W, H, 0.1);
  },
  // Étiquette enveloppante (canettes, bocaux, bouteilles) : face avant au centre (u = 0,5), dos à gauche/droite
  wrap(x, W, H, I, rnd) {
    const bg = I.bg ?? 0xffffff, ac = I.accent ?? accentFor(bg, rnd), fg = I.fg ?? ink(bg);
    const v = I.layout ?? ((rnd() * 4) | 0);
    rect(x, 0, 0, W, H, bg);
    if (v === 0) { rect(x, 0, 0, W, H * 0.14, ac); rect(x, 0, H * 0.86, W, H * 0.14, ac); }
    else if (v === 1) { for (let i = 0; i < 3; i++) rect(x, 0, H * (0.08 + i * 0.05), W, H * 0.025, ac); }
    else if (v === 2) { const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, css(dark(bg, 0.25))); g.addColorStop(0.5, css(light(bg, 0.2))); g.addColorStop(1, css(dark(bg, 0.25))); x.fillStyle = g; x.fillRect(0, 0, W, H); rect(x, 0, H * 0.8, W, H * 0.06, ac); }
    else { x.beginPath(); x.moveTo(0, H * 0.75); for (let i = 0; i <= 16; i++) x.lineTo(i * W / 16, H * 0.75 + Math.sin(i * 1.3) * H * 0.05); x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fillStyle = css(ac); x.fill(); }
    const fw = Math.min(W * 0.5, H * 1.5), fx = W / 2;
    // dos : marque en petit + code-barres + lignes de texte
    for (const bx of [W * 0.1, W * 0.9]) { txt(x, I.brand || I.name, bx, H * 0.3, W * 0.16, H * 0.14, { color: fg, font: SANS, weight: 700, lines: 1 }); for (let i = 0; i < 3; i++) rect(x, bx - W * 0.07, H * (0.45 + i * 0.07), W * 0.14 * (0.6 + rnd() * 0.4), Math.max(1, H * 0.025), mix(bg, fg, 0.45)); }
    barcode(x, W * 0.03, H * 0.62, W * 0.12, H * 0.2, rnd);
    // face
    if (H > fw * 0.9) { // étiquette haute (bouteilles) : empilement vertical
      brandMark(x, I.brand, fx, H * 0.2, fw * 0.9, H * 0.13, bg, rnd);
      picto(x, I.picto, fx, H * 0.48, Math.min(fw, H * 0.3) * 0.9, I.pc);
      txt(x, I.name, fx, H * 0.72, fw * 0.95, H * 0.16, { color: fg }); if (I.sub) txt(x, I.sub, fx, H * 0.86, fw * 0.8, H * 0.08, { color: fg, font: SANS, weight: 700 });
    } else {
      const ps = H * 0.62;
      brandMark(x, I.brand, fx, H * 0.2, fw * 0.85, H * 0.2, bg, rnd);
      picto(x, I.picto, fx - fw * 0.3, H * 0.58, ps * 0.85, I.pc);
      txt(x, I.name, fx + fw * 0.1, H * 0.55, fw * 0.62, H * 0.32, { color: fg, shadow: lum(bg) < 0.45 ? dark(bg, 0.5) : null }); if (I.sub) txt(x, I.sub, fx + fw * 0.1, H * 0.78, fw * 0.5, H * 0.12, { color: fg, font: SANS, weight: 700 });
    }
    if (I.promo) badge(x, I.promo, fx + fw * 0.42, H * 0.3, H * 0.34, H * 0.34, 0xffd600, 0xd50000, 'burst');
    if (I.rim) { for (const yy of [0, H * 0.92]) { const g2 = x.createLinearGradient(0, yy, 0, yy + H * 0.08); g2.addColorStop(0, '#9e9e9e'); g2.addColorStop(0.5, '#eeeeee'); g2.addColorStop(1, '#8a8a8a'); x.fillStyle = g2; x.fillRect(0, yy, W, H * 0.08); } }
    // ombrage cylindrique léger
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.35, 'rgba(255,255,255,0.08)'); g.addColorStop(0.5, 'rgba(255,255,255,0.14)'); g.addColorStop(0.65, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.18)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  },
  // Sachet (chips, bonbons, croquettes) : fond plein, éclat lumineux, gros pictogramme, bannière de marque
  bag(x, W, H, I, rnd) {
    const bg = I.bg ?? 0xffc107, ac = I.accent ?? accentFor(bg, rnd), fg = I.fg ?? ink(bg);
    const g = x.createRadialGradient(W / 2, H * 0.62, 2, W / 2, H * 0.62, Math.max(W, H) * 0.75); g.addColorStop(0, css(light(bg, 0.5))); g.addColorStop(0.5, css(bg)); g.addColorStop(1, css(dark(bg, 0.3))); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) rect(x, 0, i * 2 * Math.max(1, H * 0.012), W, Math.max(1, H * 0.012), dark(bg, 0.2)); // soudure
    x.save(); x.translate(W / 2, H * 0.24); x.rotate(-0.08); rr(x, -W * 0.44, -H * 0.08, W * 0.88, H * 0.16, H * 0.04, ac); txt(x, I.brand || '', 0, 0, W * 0.8, H * 0.12, { color: ink(ac), font: IMPACT, weight: 400, lines: 1 }); x.restore();
    txt(x, I.name, W / 2, H * 0.43, W * 0.9, H * 0.16, { color: 0xffffff, stroke: dark(bg, 0.6), strokeW: 0.18 });
    const ps = Math.min(W * 0.75, H * 0.42); picto(x, I.picto, W / 2, H * 0.7, ps, I.pc);
    if (I.sub) badge(x, I.sub, W * 0.78, H * 0.88, W * 0.38, W * 0.38, 0xffeb3b, 0xd50000, 'burst');
    gloss(x, 0, 0, W, H, 0.22);
  },
  // Boîte de médicament : fond blanc, bandeau coloré, dosage
  pharma(x, W, H, I, rnd) {
    const ac = I.bg ?? 0x00897b; rect(x, 0, 0, W, H, 0xffffff);
    const v = I.layout ?? ((rnd() * 3) | 0);
    if (v === 0) { rect(x, 0, H * 0.7, W, H * 0.3, ac); rect(x, 0, H * 0.66, W, H * 0.03, light(ac, 0.4)); }
    else if (v === 1) { poly(x, [0, H, W * 0.55, H, W * 0.25, H * 0.45, 0, H * 0.6], ac); poly(x, [W * 0.6, H, W, H, W, H * 0.5], light(ac, 0.35)); }
    else { rect(x, 0, 0, W * 0.12, H, ac); rect(x, W * 0.12, 0, W * 0.03, H, light(ac, 0.5)); }
    const tx = v === 2 ? W * 0.57 : W / 2, tw = v === 2 ? W * 0.8 : W * 0.9;
    txt(x, I.name, tx, H * 0.26, tw, H * 0.24, { color: 0x1b1b1b, font: SANS, weight: 700 });
    if (I.sub) txt(x, I.sub, tx, H * 0.48, tw * 0.8, H * 0.14, { color: dark(ac, 0.2), font: SANS, weight: 700, lines: 1 });
    if (I.brand) txt(x, I.brand, v === 0 ? W * 0.72 : tx, H * 0.86, W * 0.4, H * 0.1, { color: v === 0 ? 0xffffff : 0x555555, font: SANS, weight: 400, italic: true, lines: 1 });
    picto(x, I.picto || 'cross', W * 0.16, H * 0.84, Math.min(W, H) * 0.24, v === 0 ? 0xffffff : I.pc);
  },
  // Cosmétique / parfum : élégant, lettres espacées, filets dorés
  cosmetic(x, W, H, I, rnd) {
    const bg = I.bg ?? 0x212121, fg = I.fg ?? (lum(bg) > 0.6 ? 0x3e2723 : 0xf5e6c8), gold = I.accent ?? 0xc9a24a;
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, css(light(bg, 0.12))); g.addColorStop(1, css(dark(bg, 0.12))); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const m = Math.max(2, Math.min(W, H) * 0.07); x.strokeStyle = css(gold); x.lineWidth = Math.max(1, m * 0.25); x.strokeRect(m, m, W - 2 * m, H - 2 * m);
    spaced(x, I.brand || I.name, W / 2, H * 0.38, W * 0.82, H * 0.16, fg);
    line(x, W * 0.3, H * 0.5, W * 0.7, H * 0.5, gold, Math.max(1, H * 0.01));
    txt(x, I.name, W / 2, H * 0.62, W * 0.78, H * 0.11, { color: fg, font: SERIF, weight: 400, italic: true });
    if (I.sub) txt(x, I.sub, W / 2, H * 0.8, W * 0.6, H * 0.07, { color: gold, font: SANS, weight: 400, lines: 1 });
  },
  // Couverture de livre
  book(x, W, H, I, rnd) {
    const bg = I.bg ?? 0x1565c0, fg = I.fg ?? ink(bg), ac = I.accent ?? accentFor(bg, rnd);
    const v = I.layout ?? ((rnd() * 5) | 0);
    rect(x, 0, 0, W, H, bg);
    if (v === 0) { for (let i = 0; i < 5; i++) circ(x, W * (0.2 + rnd() * 0.6), H * (0.3 + rnd() * 0.35), W * (0.08 + rnd() * 0.22), mix(bg, ac, 0.3 + rnd() * 0.5)); }
    else if (v === 1) { const g = x.createLinearGradient(0, H * 0.3, 0, H * 0.8); g.addColorStop(0, css(light(bg, 0.3))); g.addColorStop(1, css(dark(bg, 0.5))); x.fillStyle = g; x.fillRect(0, H * 0.3, W, H * 0.5); picto(x, I.picto || 'mountain', W / 2, H * 0.6, W * 0.6, dark(bg, 0.6)); }
    else if (v === 2) { rect(x, W * 0.08, H * 0.06, W * 0.84, H * 0.88, light(bg, 0.85)); x.strokeStyle = css(bg); x.lineWidth = Math.max(1, W * 0.02); x.strokeRect(W * 0.12, H * 0.09, W * 0.76, H * 0.82); picto(x, I.picto || 'star', W / 2, H * 0.55, W * 0.32, bg); }
    else if (v === 3) { for (let i = 0; i < 8; i++) rect(x, 0, H * (0.35 + i * 0.07), W, H * 0.035, i % 2 ? ac : light(bg, 0.25)); }
    else { picto(x, I.picto || 'moon', W / 2, H * 0.55, W * 0.7, ac); }
    const tc = v === 2 ? dark(bg, 0.2) : fg;
    txt(x, I.name, W / 2, H * 0.18, W * 0.84, H * 0.2, { color: tc, font: v % 2 ? SERIF : BLACK, weight: 700 });
    if (I.sub) txt(x, I.sub, W / 2, H * 0.88, W * 0.8, H * 0.07, { color: tc, font: SANS, weight: 400, lines: 1 });
    if (I.brand) txt(x, I.brand, W / 2, H * 0.95, W * 0.4, H * 0.04, { color: tc, font: SANS, weight: 700, lines: 1 });
    rect(x, 0, 0, Math.max(1, W * 0.03), H, dark(bg, 0.3));
  },
  // Dos de livre (titre vertical, lu de bas en haut)
  spine(x, W, H, I, rnd) {
    const bg = I.bg ?? 0x1565c0, fg = I.fg ?? ink(bg), ac = I.accent ?? accentFor(bg, rnd);
    rect(x, 0, 0, W, H, bg); rect(x, 0, H * 0.06, W, H * 0.02, ac); rect(x, 0, H * 0.9, W, H * 0.02, ac);
    x.save(); x.translate(W / 2, H * 0.48); x.rotate(-Math.PI / 2); txt(x, I.name, 0, 0, H * 0.72, W * 0.8, { color: fg, font: COND, weight: 700, lines: 1 }); x.restore();
    if (I.brand) txt(x, (I.brand || '').slice(0, 3).toUpperCase(), W / 2, H * 0.95, W * 0.9, H * 0.04, { color: fg, font: SANS, weight: 700, lines: 1 });
  },
  // Rangée de dos de livres (lots, séries) : n dos côte à côte
  spines(x, W, H, I, rnd) {
    const n = I.n || 8; rect(x, 0, 0, W, H, 0x2b2b2b); let px = 0;
    const pal = I.palette || [0x1565c0, 0xc62828, 0x2e7d32, 0xf9a825, 0x4e342e, 0x6a1b9a, 0x37474f, 0xad1457, 0x00838f, 0xef6c00];
    for (let i = 0; i < n; i++) {
      const bw = W / n * (0.8 + rnd() * 0.4), bh = H * (I.even ? 0.98 : 0.84 + rnd() * 0.16), c = I.bg != null && I.even ? I.bg : pal[(rnd() * pal.length) | 0];
      const bx = Math.min(px, W - bw); rect(x, bx, H - bh, bw - 1, bh, c); rect(x, bx, H - bh + bh * 0.08, bw - 1, Math.max(1, bh * 0.02), light(c, 0.5)); rect(x, bx, H - bh * 0.12, bw - 1, Math.max(1, bh * 0.02), light(c, 0.5));
      x.save(); x.translate(bx + bw / 2, H - bh / 2); x.rotate(-Math.PI / 2); txt(x, I.titles ? I.titles[i % I.titles.length] : (I.name || 'TOME ' + (i + 1)), 0, 0, bh * 0.66, bw * 0.62, { color: ink(c), font: COND, weight: 700, lines: 1 }); x.restore();
      px += bw;
    }
  },
  // Couverture de magazine
  mag(x, W, H, I, rnd) {
    const bg = I.bg ?? 0xe91e63, ac = I.accent ?? 0xffeb3b;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, css(light(bg, 0.35))); g.addColorStop(1, css(dark(bg, 0.25))); x.fillStyle = g; x.fillRect(0, 0, W, H);
    // « photo » de couverture
    const ph = I.photo || ['face', 'car', 'house', 'ball', 'mountain', 'flower', 'pad', 'tv'][(rnd() * 8) | 0];
    if (ph === 'face') { ell(x, W * 0.55, H * 0.62, W * 0.26, H * 0.24, 0xf1c8a4); ell(x, W * 0.55, H * 0.42, W * 0.27, H * 0.16, [0x3e2723, 0xffd54f, 0x8d4a1d, 0x212121][(rnd() * 4) | 0]); circ(x, W * 0.47, H * 0.6, W * 0.025, 0x1b1b1b); circ(x, W * 0.63, H * 0.6, W * 0.025, 0x1b1b1b); x.beginPath(); x.arc(W * 0.55, H * 0.7, W * 0.07, 0.3, 2.8); x.strokeStyle = '#c2185b'; x.lineWidth = Math.max(1, W * 0.015); x.stroke(); rect(x, W * 0.28, H * 0.84, W * 0.54, H * 0.16, mix(bg, 0x212121, 0.5)); }
    else picto(x, ph, W * 0.55, H * 0.62, W * 0.62, null);
    txt(x, I.name, W / 2, H * 0.1, W * 0.94, H * 0.17, { color: I.fg ?? 0xffffff, font: IMPACT, weight: 400, lines: 1, stroke: dark(bg, 0.5), strokeW: 0.08 });
    for (let i = 0; i < 3; i++) { rect(x, W * 0.05, H * (0.3 + i * 0.13), W * 0.3, Math.max(1, H * 0.025), 0xffffff); rect(x, W * 0.05, H * (0.34 + i * 0.13), W * 0.22, Math.max(1, H * 0.02), 0xffffff); }
    if (I.sub) badge(x, I.sub, W * 0.22, H * 0.82, W * 0.36, W * 0.36, ac, 0xd50000, 'burst');
    barcode(x, W * 0.78, H * 0.86, W * 0.18, H * 0.1, rnd);
    gloss(x, 0, 0, W, H, 0.16);
  },
  // Une de journal
  news(x, W, H, I, rnd) {
    rect(x, 0, 0, W, H, I.bg ?? 0xf3f0e8);
    txt(x, I.name || 'LE JOURNAL', W / 2, H * 0.08, W * 0.92, H * 0.11, { color: 0x111111, font: SERIF, weight: 700, lines: 1 });
    rect(x, W * 0.04, H * 0.15, W * 0.92, Math.max(1, H * 0.006), 0x111111);
    txt(x, I.sub || 'NUIT AGITÉE AU CENTRE', W / 2, H * 0.22, W * 0.92, H * 0.08, { color: 0x111111, font: BLACK, lines: 1 });
    rect(x, W * 0.05, H * 0.3, W * 0.5, H * 0.3, 0x9e9e9e); picto(x, ['house', 'car', 'mountain', 'moon'][(rnd() * 4) | 0], W * 0.3, H * 0.45, H * 0.25, 0x616161);
    for (let c = 0; c < 3; c++) for (let i = 0; i < 18; i++) { const cx = c === 0 ? W * 0.6 : W * (0.05 + (c - 1) * 0.47); const top = c === 0 ? H * 0.3 : H * 0.64; if (top + i * H * 0.02 > H * 0.97) break; rect(x, cx, top + i * H * 0.02, (c === 0 ? W * 0.35 : W * 0.43) * (i % 6 === 5 ? 0.6 : 1), Math.max(1, H * 0.008), 0x777777); }
  },
  // Jaquette (VHS, DVD, jeu vidéo, vinyle)
  media(x, W, H, I, rnd) {
    const bg = I.bg ?? 0x212121, ac = I.accent ?? accentFor(bg, rnd);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, css(dark(bg, 0.6))); g.addColorStop(0.55, css(bg)); g.addColorStop(1, css(dark(bg, 0.7))); x.fillStyle = g; x.fillRect(0, 0, W, H);
    picto(x, I.picto || ['moon', 'skull', 'star', 'car', 'mountain', 'ghost', 'robot', 'heart'][(rnd() * 8) | 0], W / 2, H * 0.55, Math.min(W, H) * 0.62, ac);
    txt(x, I.name, W / 2, H * 0.17, W * 0.9, H * 0.2, { color: 0xffffff, font: IMPACT, weight: 400, stroke: dark(ac, 0.4), strokeW: 0.12 });
    if (I.sub) txt(x, I.sub, W / 2, H * 0.88, W * 0.86, H * 0.07, { color: light(ac, 0.5), font: SANS, weight: 700, lines: 1 });
    if (I.brand) { rr(x, W * 0.04, H * 0.92, W * 0.3, H * 0.06, 2, I.band ?? 0xffffff); txt(x, I.brand, W * 0.19, H * 0.95, W * 0.27, H * 0.05, { color: 0x111111, font: BLACK, lines: 1 }); }
    gloss(x, 0, 0, W, H, 0.14);
  },
  // Carton d'emballage (réserve, palettes) : kraft imprimé
  case(x, W, H, I, rnd) {
    const kraft = I.bg ?? 0xc8a46e; rect(x, 0, 0, W, H, kraft);
    for (let i = 0; i < 8; i++) rect(x, 0, rnd() * H, W, 1, dark(kraft, 0.06));
    const pc = I.accent ?? 0x3e2723;
    brandMark(x, I.brand, W * 0.5, H * 0.18, W * 0.6, H * 0.18, kraft, rnd, 3);
    txt(x, I.name, W / 2, H * 0.48, W * 0.86, H * 0.2, { color: pc, font: BLACK });
    if (I.sub) txt(x, I.sub, W / 2, H * 0.7, W * 0.5, H * 0.14, { color: pc, font: BLACK, lines: 1 });
    // pictos de manutention
    for (const k of [0, 1]) { const bx = W * (0.08 + k * 0.06), by = H * 0.86; line(x, bx, by + H * 0.08, bx, by - H * 0.06, pc, Math.max(1, W * 0.008)); poly(x, [bx - W * 0.02, by - H * 0.03, bx, by - H * 0.08, bx + W * 0.02, by - H * 0.03], pc); }
    if (I.fragile) { picto(x, 'glass', W * 0.88, H * 0.84, H * 0.22, 0xffffff); }
    else barcode(x, W * 0.74, H * 0.8, W * 0.2, H * 0.14, rnd);
  },
  // Dessus de carton : kraft + ruban adhésif
  casetop(x, W, H, I) { const kraft = I.bg ?? 0xc8a46e; rect(x, 0, 0, W, H, kraft); rect(x, 0, H * 0.42, W, H * 0.16, I.accent ?? 0xd9c49a); rect(x, 0, H * 0.49, W, Math.max(1, H * 0.02), dark(kraft, 0.25)); },
  // Bord de barquette / présentoir carton (prêt-à-vendre)
  tray(x, W, H, I, rnd) {
    const bg = I.bg ?? 0xffffff, fg = ink(bg); rect(x, 0, 0, W, H, bg); rect(x, 0, H * 0.78, W, H * 0.22, I.accent ?? dark(bg, 0.25));
    txt(x, I.brand || I.name, W * 0.32, H * 0.42, W * 0.56, H * 0.6, { color: fg, font: BLACK, lines: 1 });
    picto(x, I.picto, W * 0.8, H * 0.42, H * 0.7, I.pc);
  },
  // Boîte à chaussures (petit côté) : marque, pointure, pastille couleur
  shoebox(x, W, H, I, rnd) {
    const bg = I.bg ?? 0xff7043, fg = I.fg ?? ink(bg); rect(x, 0, 0, W, H, bg);
    rect(x, 0, 0, W, H * 0.22, dark(bg, 0.25)); // couvercle
    txt(x, I.brand || '', W * 0.42, H * 0.58, W * 0.7, H * 0.32, { color: fg, font: I.serif ? SERIF : IMPACT, weight: I.serif ? 700 : 400, italic: !!I.serif, lines: 1 });
    rr(x, W * 0.8, H * 0.38, W * 0.14, H * 0.42, 2, 0xffffff); txt(x, I.sub || String(36 + ((rnd() * 10) | 0)), W * 0.87, H * 0.59, W * 0.12, H * 0.3, { color: 0x111111, font: BLACK, lines: 1 });
    circ(x, W * 0.08, H * 0.6, H * 0.1, I.accent ?? 0xffffff);
  },
  // Pile de vêtements pliés (vue de face) : n couches
  // Tranche d'une pile de livres / magazines : couvertures colorées et pages crème alternées
  pages(x, W, H, I) {
    const n = I.n || 5, c = I.bg ?? 0x1565c0; rect(x, 0, 0, W, H, 0xf3eee2);
    for (let i = 0; i < n; i++) { const y0 = i * H / n, h = H / n, b = Math.max(1, h * 0.2); rect(x, 0, y0, W, b, c); rect(x, 0, y0 + h - b, W, b, dark(c, 0.18)); if (h > 5) rect(x, W * 0.01, y0 + h * 0.5, W * 0.98, Math.max(1, h * 0.05), 0xd9d0bd); }
  },
  folded(x, W, H, I, rnd) {
    const n = I.n || 5, c = I.bg ?? 0x1565c0; rect(x, 0, 0, W, H, dark(c, 0.35));
    for (let i = 0; i < n; i++) {
      const y0 = i * H / n, h = H / n, cc = I.mixed ? [c, light(c, 0.3), dark(c, 0.2), I.accent ?? light(c, 0.5)][(rnd() * 4) | 0] : (i % 2 ? c : mix(c, 0xffffff, 0.06));
      rr(x, W * 0.02, y0 + h * 0.06, W * 0.96, h * 0.9, h * 0.35, cc);
      if (I.pat) { x.save(); x.beginPath(); x.rect(W * 0.02, y0 + h * 0.06, W * 0.96, h * 0.9); x.clip(); fabric(x, W * 0.02, y0 + h * 0.06, W * 0.96, h * 0.9, cc, I.pat, rnd, I.accent); x.restore(); }
      rect(x, W * 0.04, y0 + h * 0.55, W * 0.92, Math.max(1, h * 0.12), dark(cc, 0.22)); rect(x, W * 0.04, y0 + h * 0.12, W * 0.92, Math.max(1, h * 0.08), light(cc, 0.18));
    }
  },
  // Vêtement suspendu (face avant) : motif + col + boutons/zip
  garment(x, W, H, I, rnd) {
    const c = I.bg ?? 0x1565c0; fabric(x, 0, 0, W, H, c, I.pat || 'plain', rnd, I.accent);
    const t = I.style || 'shirt';
    if (t === 'shirt') { poly(x, [W * 0.35, 0, W * 0.5, H * 0.12, W * 0.65, 0], light(c, 0.35)); for (let i = 0; i < 5; i++) circ(x, W * 0.5, H * (0.18 + i * 0.15), Math.max(1, W * 0.018), dark(c, 0.4)); rect(x, W * 0.495, H * 0.12, Math.max(1, W * 0.01), H * 0.88, dark(c, 0.25)); rect(x, W * 0.62, H * 0.22, W * 0.14, H * 0.1, dark(c, 0.12)); }
    else if (t === 'tee') { ell(x, W * 0.5, 0, W * 0.14, H * 0.06, dark(c, 0.3)); if (I.picto) picto(x, I.picto, W * 0.5, H * 0.4, Math.min(W, H) * 0.45, I.accent ?? 0xffffff); else if (I.brand) txt(x, I.brand, W * 0.5, H * 0.38, W * 0.7, H * 0.14, { color: I.accent ?? ink(c), font: IMPACT, weight: 400, lines: 1 }); }
    else if (t === 'jacket') { rect(x, W * 0.49, 0, Math.max(1, W * 0.02), H, 0x9e9e9e); poly(x, [W * 0.3, 0, W * 0.48, H * 0.3, W * 0.48, 0], dark(c, 0.2)); poly(x, [W * 0.7, 0, W * 0.52, H * 0.3, W * 0.52, 0], dark(c, 0.2)); rect(x, W * 0.12, H * 0.55, W * 0.2, Math.max(1, H * 0.02), dark(c, 0.4)); rect(x, W * 0.68, H * 0.55, W * 0.2, Math.max(1, H * 0.02), dark(c, 0.4)); }
    else if (t === 'dress') { rect(x, 0, H * 0.36, W, Math.max(1, H * 0.04), dark(c, 0.25)); ell(x, W * 0.5, 0, W * 0.16, H * 0.07, dark(c, 0.3)); }
    else if (t === 'pants') { rect(x, 0, 0, W, H * 0.1, dark(c, 0.2)); rect(x, W * 0.495, H * 0.1, Math.max(1, W * 0.01), H * 0.9, dark(c, 0.3)); rect(x, W * 0.1, H * 0.12, W * 0.2, Math.max(1, H * 0.015), dark(c, 0.3)); }
    gloss(x, 0, 0, W, H, 0.08);
  },
  // Carte blister (suspendue) : en-tête troué, marque, nom
  blister(x, W, H, I, rnd) {
    const bg = I.bg ?? 0x1e88e5, ac = I.accent ?? accentFor(bg, rnd), fg = ink(bg); rect(x, 0, 0, W, H, bg);
    rect(x, 0, 0, W, H * 0.2, ac); rr(x, W * 0.38, H * 0.05, W * 0.24, H * 0.07, H * 0.035, 0x1a1a1a);
    brandMark(x, I.brand, W / 2, H * 0.28, W * 0.82, H * 0.1, bg, rnd);
    rr(x, W * 0.12, H * 0.36, W * 0.76, H * 0.42, W * 0.06, light(bg, 0.55)); picto(x, I.picto, W / 2, H * 0.57, Math.min(W * 0.6, H * 0.36), I.pc);
    txt(x, I.name, W / 2, H * 0.87, W * 0.9, H * 0.12, { color: fg });
  },
  // Boîte de jouet avec fenêtre
  toybox(x, W, H, I, rnd) {
    const bg = I.bg ?? 0xffb300, ac = I.accent ?? accentFor(bg, rnd), fg = ink(bg);
    rect(x, 0, 0, W, H, bg); for (let i = 0; i < 9; i++) star(x, rnd() * W, rnd() * H, Math.min(W, H) * 0.05, Math.min(W, H) * 0.02, 5, light(bg, 0.3));
    x.save(); x.translate(W * 0.5, H * 0.12); x.rotate(-0.05); txt(x, I.brand || 'JOUÉCLAT', 0, 0, W * 0.8, H * 0.12, { color: 0xffffff, font: IMPACT, weight: 400, stroke: ac, strokeW: 0.25, lines: 1 }); x.restore();
    const wx = W * 0.12, wy = H * 0.24, ww = W * 0.76, wh = H * 0.52; rr(x, wx - 3, wy - 3, ww + 6, wh + 6, W * 0.05, ac); rr(x, wx, wy, ww, wh, W * 0.04, 0x1d2a36);
    picto(x, I.picto || 'star', W / 2, wy + wh / 2, Math.min(ww, wh) * 0.86, I.pc);
    const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.4, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
    txt(x, I.name, W / 2, H * 0.86, W * 0.9, H * 0.14, { color: fg, stroke: lum(bg) > 0.62 ? null : dark(bg, 0.5) });
    if (I.sub) badge(x, I.sub, W * 0.86, H * 0.94, W * 0.22, H * 0.07, 0xffffff, 0xd50000, 'rect');
  },
  // Boîte d'appareil électronique : sobre, silhouette du produit
  device(x, W, H, I, rnd) {
    const bg = I.bg ?? 0xfafafa, fg = I.fg ?? ink(bg), ac = I.accent ?? 0x1e88e5;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, css(light(bg, 0.12))); g.addColorStop(1, css(dark(bg, 0.12))); x.fillStyle = g; x.fillRect(0, 0, W, H);
    picto(x, I.picto || 'phone', W / 2, H * 0.48, Math.min(W, H) * 0.66, I.pc);
    txt(x, I.brand || '', W * 0.06, H * 0.1, W * 0.6, H * 0.1, { color: fg, font: SANS, weight: 700, align: 'left', lines: 1 });
    txt(x, I.name, W / 2, H * 0.86, W * 0.86, H * 0.1, { color: fg, font: SANS, weight: 400, lines: 1 });
    rect(x, 0, H * 0.96, W, H * 0.04, ac);
  },
  // Étiquette de prix (bande de gondole)
  price(x, W, H, I) {
    const promo = I.promo; rect(x, 0, 0, W, H, promo ? 0xffd600 : 0xffffff); rect(x, 0, 0, W, H * 0.2, promo ? 0xd50000 : (I.bg ?? 0x1565c0));
    txt(x, I.name || '', W / 2, H * 0.1, W * 0.9, H * 0.16, { color: 0xffffff, font: SANS, weight: 700, lines: 1 });
    txt(x, I.sub || '1,99 €', W * 0.5, H * 0.6, W * 0.9, H * 0.5, { color: promo ? 0xd50000 : 0x111111, font: BLACK, lines: 1 });
  },
  // Panneau promotionnel
  sign(x, W, H, I) {
    const bg = I.bg ?? 0xd50000, fg = I.fg ?? 0xffffff; rect(x, 0, 0, W, H, bg);
    const m = Math.max(2, Math.min(W, H) * 0.05); x.strokeStyle = css(I.accent ?? 0xffd600); x.lineWidth = m; x.strokeRect(m, m, W - 2 * m, H - 2 * m);
    if (I.sub) { txt(x, I.name, W / 2, H * 0.4, W * 0.86, H * 0.42, { color: fg, font: IMPACT, weight: 400 }); txt(x, I.sub, W / 2, H * 0.76, W * 0.8, H * 0.2, { color: I.accent ?? 0xffd600, font: BLACK, lines: 1 }); }
    else txt(x, I.name, W / 2, H / 2, W * 0.86, H * 0.7, { color: fg, font: IMPACT, weight: 400 });
  },
  // Caisson lumineux de boutique (haut des murs) : dégradé, grand pictogramme, enseigne et accroche
  banner(x, W, H, I) {
    const bg = I.bg ?? 0x37474f, g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, css(light(bg, 0.35))); g.addColorStop(0.55, css(bg)); g.addColorStop(1, css(dark(bg, 0.35))); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const r = x.createRadialGradient(W * 0.2, H * 0.5, 1, W * 0.2, H * 0.5, H * 0.9); r.addColorStop(0, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, W, H);
    picto(x, I.picto || 'star', W * 0.17, H * 0.5, H * 0.78, I.accent ?? 0xffffff);
    txt(x, I.name || '', W * 0.6, H * 0.36, W * 0.7, H * 0.38, { color: I.fg ?? 0xffffff, font: BLACK, lines: 1 });
    if (I.sub) txt(x, I.sub, W * 0.6, H * 0.74, W * 0.66, H * 0.2, { color: I.accent ?? 0xffffff, font: SANS, weight: 700, lines: 1 });
    rect(x, 0, H - Math.max(2, H * 0.05), W, Math.max(2, H * 0.05), light(bg, 0.6));
  },
  // Grille de couvercles / bouchons vus de dessus (en niveaux de gris : teintée par la couleur de sommet)
  lids(x, W, H, I) {
    const nx = I.nx || 3, nz = I.nz || 3; rect(x, 0, 0, W, H, 0x2a2a2a);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const cx = (i + 0.5) * W / nx, cy = (j + 0.5) * H / nz, r = Math.min(W / nx, H / nz) * 0.44;
      if (I.square) { rr(x, cx - W / nx * 0.46, cy - H / nz * 0.46, W / nx * 0.92, H / nz * 0.92, 2, 0xe8e8e8); rect(x, cx - W / nx * 0.46, cy - H / nz * 0.06, W / nx * 0.92, Math.max(1, H / nz * 0.08), 0xbdbdbd); }
      else { circ(x, cx, cy, r, 0xbdbdbd); circ(x, cx, cy, r * 0.82, 0xf2f2f2); if (I.ring) { circ(x, cx + r * 0.3, cy, r * 0.22, null); x.strokeStyle = '#9e9e9e'; x.lineWidth = Math.max(1, r * 0.1); x.stroke(); } }
    }
  },
  // Dessus de boîte d'œufs : bosses ombrées + vignette
  eggs(x, W, H, I) {
    const c = I.bg ?? 0xd7ccc8; rect(x, 0, 0, W, H, c); const nx = I.nx || 3, nz = 2;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const cx = (i + 0.5) * W / nx, cy = (j + 0.5) * H / nz; const g = x.createRadialGradient(cx - W / nx * 0.15, cy - H / nz * 0.15, 1, cx, cy, Math.min(W / nx, H / nz) * 0.5); g.addColorStop(0, css(light(c, 0.35))); g.addColorStop(1, css(dark(c, 0.2))); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, Math.min(W / nx, H / nz) * 0.46, 0, 7); x.fill(); }
    rr(x, W * 0.25, H * 0.3, W * 0.5, H * 0.4, 3, I.accent ?? 0xfff8e1); txt(x, I.brand || 'ŒUFS', W / 2, H * 0.43, W * 0.44, H * 0.16, { color: 0x5d4037, font: SERIF, weight: 700, italic: true, lines: 1 }); txt(x, I.name || '', W / 2, H * 0.6, W * 0.44, H * 0.12, { color: 0x5d4037, font: SANS, weight: 700, lines: 1 });
  },
  // Cartes (postales, vœux, tickets)
  card(x, W, H, I, rnd) {
    const bg = I.bg ?? 0x4fc3f7, ac = I.accent ?? accentFor(bg, rnd);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, css(light(bg, 0.3))); g.addColorStop(1, css(dark(bg, 0.2))); x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (I.picto) picto(x, I.picto, W * 0.5, H * 0.56, Math.min(W, H) * 0.6, I.pc);
    for (let i = 0; i < 5; i++) star(x, rnd() * W, rnd() * H, Math.min(W, H) * 0.04, Math.min(W, H) * 0.015, 5, light(ac, 0.3));
    txt(x, I.name, W / 2, H * 0.17, W * 0.9, H * 0.2, { color: I.fg ?? 0xffffff, font: SERIF, italic: true, weight: 700, stroke: dark(bg, 0.45), strokeW: 0.12 });
    if (I.sub) txt(x, I.sub, W / 2, H * 0.9, W * 0.86, H * 0.1, { color: I.fg ?? 0xffffff, font: SANS, weight: 700, lines: 1 });
  },
  // Motif textile seul (dessus de vêtements, tissus)
  fabric(x, W, H, I, rnd) { fabric(x, 0, 0, W, H, I.bg ?? 0x1565c0, I.pat || 'plain', rnd, I.accent); gloss(x, 0, 0, W, H, 0.06); },
  // Fond uni + petite marque (faces secondaires)
  plain(x, W, H, I, rnd) { rect(x, 0, 0, W, H, I.bg ?? 0xffffff); if (I.brand && W > 24 && H > 12) txt(x, I.brand, W / 2, H / 2, W * 0.8, H * 0.5, { color: I.fg ?? ink(I.bg ?? 0xffffff), font: SANS, weight: 700, lines: 1 }); },
  // Touches de clavier vues de dessus
  keys(x, W, H, I) {
    const bg = I.bg ?? 0x212121; rect(x, 0, 0, W, H, dark(bg, 0.2)); const kc = lum(bg) > 0.5 ? dark(bg, 0.12) : light(bg, 0.25);
    const rows = 5, cols = 14, kw = W / cols, kh = H / (rows + 0.4);
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) { if (r === rows - 1 && i > 3 && i < 10) { if (i === 4) rr(x, 4 * kw + 1, H - kh * 1.1, kw * 6 - 2, kh * 0.86, 2, kc); continue; } rr(x, i * kw + 1, kh * 0.2 + r * kh, kw - 2, kh * 0.86, Math.min(kw, kh) * 0.15, kc); }
  },
  // Dessus de pizza
  pizza(x, W, H, I, rnd) {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2; rect(x, 0, 0, W, H, 0xd4a056); circ(x, cx, cy, R * 0.98, 0xd4a056); circ(x, cx, cy, R * 0.84, 0xc62828);
    for (let i = 0; i < 18; i++) { const a = rnd() * 7, r = Math.sqrt(rnd()) * R * 0.72; ell(x, cx + Math.cos(a) * r, cy + Math.sin(a) * r, R * (0.1 + rnd() * 0.08), R * (0.07 + rnd() * 0.06), 0xfff3c4, rnd() * 3); }
    for (let i = 0; i < 8; i++) { const a = i * 0.8 + rnd(), r = R * (0.3 + rnd() * 0.4); circ(x, cx + Math.cos(a) * r, cy + Math.sin(a) * r, R * 0.1, I.top2 ?? 0x8d2a2a); }
    for (let i = 0; i < 6; i++) { const a = rnd() * 7, r = R * rnd() * 0.7; ell(x, cx + Math.cos(a) * r, cy + Math.sin(a) * r, R * 0.06, R * 0.03, 0x2e7d32, a); }
  },
  // Tas de fruits / légumes vu de dessus (cagettes)
  fruits(x, W, H, I, rnd) {
    const c = I.bg ?? 0xd32f2f; rect(x, 0, 0, W, H, dark(c, 0.55)); const r = Math.min(W, H) * 0.14;
    for (let i = 0; i < 40; i++) { const px = rnd() * W, py = rnd() * H, rr2 = r * (0.8 + rnd() * 0.35); const g = x.createRadialGradient(px - rr2 * 0.3, py - rr2 * 0.3, 1, px, py, rr2); g.addColorStop(0, css(light(c, 0.35))); g.addColorStop(0.7, css(c)); g.addColorStop(1, css(dark(c, 0.3))); x.fillStyle = g; x.beginPath(); x.arc(px, py, rr2, 0, 7); x.fill(); }
  },
  // Paquet de rouleaux (papier toilette, essuie-tout) : extrémités des rouleaux sous film
  rolls(x, W, H, I, rnd) {
    const nx = I.nx || 3, ny = I.ny || 2, bg = I.bg ?? 0xffffff; rect(x, 0, 0, W, H, 0xe8e8e8);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const cx = (i + 0.5) * W / nx, cy = (j + 0.5) * H / ny, r = Math.min(W / nx, H / ny) * 0.48; circ(x, cx, cy, r, 0xfafafa); x.strokeStyle = '#d5d5d5'; x.lineWidth = Math.max(1, r * 0.05); for (let k = 1; k < 4; k++) { x.beginPath(); x.arc(cx, cy, r * (0.35 + k * 0.16), 0, 7); x.stroke(); } circ(x, cx, cy, r * 0.3, 0xa1887f); circ(x, cx, cy, r * 0.22, 0x5d4037); }
    if (!I.top) { rr(x, W * 0.1, H * 0.06, W * 0.8, Math.max(10, H * 0.22), 3, bg); brandMark(x, I.brand, W * 0.5, H * 0.06 + Math.max(10, H * 0.22) / 2, W * 0.72, Math.max(8, H * 0.16), bg, rnd, 2); if (I.sub) badge(x, I.sub, W * 0.82, H * 0.86, W * 0.26, W * 0.26, I.accent ?? 0xffd600, 0x0d47a1, 'burst'); }
    gloss(x, 0, 0, W, H, 0.25);
  },
  // Bande de prix continue (bord d'étagère) : étiquettes répétées
  strip(x, W, H, I, rnd) {
    rect(x, 0, 0, W, H, I.bg ?? 0xeceff1); rect(x, 0, H * 0.82, W, H * 0.18, I.accent ?? 0x1565c0);
    const n = Math.max(1, Math.round(W / (H * 2.6)));
    for (let i = 0; i < n; i++) { if (rnd() < 0.15) continue; const tx = (i + 0.15) * W / n, tw = W / n * 0.7, promo = rnd() < 0.12; rect(x, tx, H * 0.1, tw, H * 0.66, promo ? 0xffd600 : 0xffffff); txt(x, (1 + ((rnd() * 9) | 0)) + ',' + String((rnd() * 99) | 0).padStart(2, '0'), tx + tw / 2, H * 0.45, tw * 0.9, H * 0.5, { color: promo ? 0xd50000 : 0x111111, font: BLACK, lines: 1 }); }
  },
};
