// Étiquetage des rayons, comme en magasin : un rail porte-étiquettes sous chaque tablette, une étiquette de prix sous
// chaque produit (ou groupe de produits identiques côte à côte), environ un produit sur dix en promotion (étiquette
// jaune « PROMO », rouge « PRIX CHOC », orange « LOT », verte « NOUVEAU »), des stop-rayons qui dépassent du rayon, des
// affichettes sur les têtes de gondole, des pique-prix dans les vitrines réfrigérées.
// Les produits sont retrouvés d'après leur position (après le placement et le réassort), donc quel que soit le module
// qui les a posés. Un seul mesh fusionné par magasin, une seule texture pour tout le centre.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { GLOBAL_UNIFORMS } from '../engine/materials.js';

const AW = 1024, AH = 512;
const TAG = { std: 0, promo: 1, choc: 2, lot: 3, nouveau: 4, pick: 5 }; // fonds d'étiquette 256 × 96
const GLYPHS = '0123456789,€%-+ ';                                         // chiffres 40 × 64 (noir puis blanc)
const WOB = { promo: 0, moins50: 1, lot: 2, nouveau: 3, prixbas: 4 };       // stop-rayons 128 × 128
const CARDS = ['PROMO', '-30 %', 'PRIX CHOC', '2 + 1 OFFERT', 'NOUVEAU'];    // affichettes de tête de gondole 256 × 128
let atlas = null;

function rr(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function fakeLines(x, X, Y, w, col) { x.fillStyle = col; for (let k = 0; k < 3; k++) x.fillRect(X, Y + k * 13, w * (k === 2 ? 0.5 : 0.9 - k * 0.15), 6); }
function barcode(x, X, Y) { x.fillStyle = '#222'; let p = X; for (let k = 0; k < 22; k++) { const w = (k * 7) % 3 + 1; x.fillRect(p, Y, w, 16); p += w + 1 + (k % 2); } }
function getAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = AW; c.height = AH; const x = c.getContext('2d');
  x.clearRect(0, 0, AW, AH); x.textBaseline = 'middle';
  const tagXY = (i) => [(i % 4) * 256, Math.floor(i / 4) * 96];
  const header = (X, Y, bg, fg, text) => { x.fillStyle = bg; x.fillRect(X + 4, Y + 4, 248, 26); x.fillStyle = fg; x.font = '900 20px Arial'; x.textAlign = 'left'; x.fillText(text, X + 12, Y + 18); };
  const tags = [
    [TAG.std, '#ffffff', null], [TAG.promo, '#ffd600', ['#e3141b', '#ffffff', 'PROMO']], [TAG.choc, '#e3141b', ['#ffffff', '#e3141b', 'PRIX CHOC']],
    [TAG.lot, '#ff9800', ['#ffffff', '#e65100', '2 + 1 OFFERT']], [TAG.nouveau, '#2e9b4f', ['#ffffff', '#1b5e20', 'NOUVEAU']], [TAG.pick, '#ffffff', null],
  ];
  for (const [i, bg, hd] of tags) {
    const [X, Y] = tagXY(i);
    x.fillStyle = bg; rr(x, X + 2, Y + 2, 252, 92, 6); x.fill();
    if (i === TAG.pick) { x.strokeStyle = '#222'; x.lineWidth = 4; rr(x, X + 6, Y + 6, 244, 84, 6); x.stroke(); fakeLines(x, X + 16, Y + 22, 90, '#9e9e9e'); continue; }
    if (hd) header(X, Y, hd[0], hd[1], hd[2]); else { x.fillStyle = '#5b7083'; x.fillRect(X + 4, Y + 4, 248, 7); }
    const dark = i === TAG.choc || i === TAG.nouveau;
    fakeLines(x, X + 12, Y + (hd ? 40 : 22), 92, dark ? 'rgba(255,255,255,0.75)' : '#9e9e9e');
    if (!hd) barcode(x, X + 12, Y + 66);
  }
  // chiffres (noirs ligne 1, blancs ligne 2)
  for (let row = 0; row < 2; row++) for (let k = 0; k < GLYPHS.length; k++) {
    const X = k * 40, Y = 192 + row * 64; x.fillStyle = row ? '#ffffff' : '#111111'; x.textAlign = 'center';
    const ch = GLYPHS[k]; x.font = ch === '€' || ch === '%' ? '900 46px Arial' : '900 58px Arial Narrow, Arial'; x.fillText(ch, X + 20, Y + 35);
  }
  // stop-rayons
  const wob = [[WOB.promo, '#ffd600', '#e3141b', 'PROMO'], [WOB.moins50, '#e3141b', '#ffffff', '-50%'], [WOB.lot, '#ff9800', '#ffffff', 'LOT'], [WOB.nouveau, '#2e9b4f', '#ffffff', 'NEW'], [WOB.prixbas, '#1565c0', '#ffffff', 'PRIX BAS']];
  for (const [i, bg, fg, t] of wob) {
    const X = i * 128, Y = 320; x.fillStyle = bg; x.beginPath(); x.arc(X + 64, Y + 64, 60, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ffffff'; x.lineWidth = 5; x.beginPath(); x.arc(X + 64, Y + 64, 52, 0, Math.PI * 2); x.stroke();
    x.fillStyle = fg; x.textAlign = 'center'; let fs = 40; x.font = `900 ${fs}px Arial`; while (x.measureText(t).width > 96 && fs > 14) { fs -= 2; x.font = `900 ${fs}px Arial`; } x.fillText(t, X + 64, Y + 66);
  }
  x.fillStyle = '#ffffff'; x.fillRect(1000, 488, 20, 20);   // blanc (rails, teintés par couleur de sommet)
  // affichettes de tête de gondole (256 × 128) sur la droite
  CARDS.forEach((t, i) => {
    const X = 640 + (i % 1) * 256, Y = 192 + i * 64; // 5 bandes de 256 × 64 (format paysage)
    x.fillStyle = i === 2 ? '#e3141b' : i === 4 ? '#2e9b4f' : '#ffd600'; x.fillRect(X + 2, Y + 2, 252, 60);
    x.fillStyle = i === 2 || i === 4 ? '#ffffff' : '#e3141b'; x.textAlign = 'center'; let fs = 44; x.font = `900 ${fs}px Arial`; while (x.measureText(t).width > 236 && fs > 14) { fs -= 2; x.font = `900 ${fs}px Arial`; } x.fillText(t, X + 128, Y + 34);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const uv = (px, py, pw, ph) => [px / AW, 1 - (py + ph) / AH, (px + pw) / AW, 1 - py / AH];
  atlas = {
    tex,
    tag: (i) => { const [X, Y] = tagXY(i); return uv(X + 2, Y + 2, 252, 92); },
    glyph: (ch, white) => { const k = GLYPHS.indexOf(ch); return uv(Math.max(0, k) * 40 + 2, 192 + (white ? 64 : 0) + 2, 36, 60); },
    wob: (i) => uv(i * 128, 320, 128, 128),
    card: (i) => uv(640 + 2, 192 + i * 64 + 2, 252, 60),
    white: uv(1002, 490, 16, 16),
  };
  return atlas;
}

// Matériau par zone : la lumière d'ambiance du magasin (uniform zoneLight de la bibliothèque) et l'éclairage infrarouge
// des caméras s'appliquent aussi aux étiquettes. Faces avant seulement : chaque quad est orienté vers qui le regarde.
const mats = new Map();
function zoneMaterial(game, zone) {
  let m = mats.get(zone); if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: getAtlas().tex, vertexColors: true, alphaTest: 0.5, roughness: 0.55, metalness: 0 });
  const zu = game.mats?.zoneUniform?.(zone);
  if (zu) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.zoneLight = zu; sh.uniforms.irBoost = GLOBAL_UNIFORMS.irBoost;
      sh.fragmentShader = 'uniform vec3 zoneLight;\nuniform float irBoost;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', '#if defined( RE_IndirectDiffuse )\n\tirradiance += zoneLight + vec3(irBoost);\n#endif\n#include <lights_fragment_end>');
    };
    m.customProgramCacheKey = () => 'shelflabel-zl';
  }
  mats.set(zone, m);
  return m;
}

// ───────── prix plausibles : selon le magasin, la taille de l'article et un hasard stable ─────────
const RANGE = {
  hyper: [0.59, 12.9], pharma: [2.2, 24.9], boulangerie: [0.95, 4.9], fleuriste: [2.9, 34.9], quincaillerie: [1.49, 59], animalerie: [1.99, 49],
  bijouterie: [49, 890], tabac: [1.2, 14.9], cafe: [1.5, 7.5], jouets: [3.99, 59.9], electro: [14.9, 699], pixel: [9.99, 69.9], videoclub: [4.99, 19.9],
  librairie: [5.9, 29.9], mobizone: [9.99, 349], opticien: [29, 289], parfumerie: [9.9, 119], mode: [9.99, 89.9], chaussures: [24.9, 129],
  sport: [7.99, 149], instruments: [9.9, 499], costumes: [7.99, 59.9], coiffeur: [5.9, 24.9], photo: [4.99, 299], deco: [3.99, 149], bonbons: [0.49, 4.99],
  octet: [4.99, 299], glacier: [2.5, 7.9],
};
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
export function priceOf(defId, shop) {
  const def = ITEMS[defId]; if (def?.value) return def.value;
  const [lo, hi] = RANGE[shop] || [1.5, 29.9];
  const v = def ? def.s[0] * def.s[1] * def.s[2] : 0.001;
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(v, 1e-6)) + 5) / 4));
  let p = lo * Math.pow(hi / lo, 0.55 * t + 0.45 * hash(defId + shop));
  // terminaisons habituelles
  if (p < 10) p = Math.floor(p) + [0.49, 0.95, 0.99, 0.5, 0.79][Math.floor(hash(defId) * 5)];
  else if (p < 100) p = Math.floor(p) + [0.9, 0.99, 0.5, 0][Math.floor(hash(defId + 'c') * 4)];
  else p = Math.round(p / 10) * 10 - [1, 0.01, 0][Math.floor(hash(defId + 'k') * 3)];
  return Math.max(0.29, p);
}
const fmt = (p) => (p >= 100 && Math.abs(p - Math.round(p)) < 0.001 ? String(Math.round(p)) : p.toFixed(2).replace('.', ',')) + '€';

// ───────── construction ─────────
class Quads {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  // c : centre, r / up : demi-vecteurs, n : normale, uv : [u0, v0, u1, v1], col : [r, g, b]. Face avant visible depuis n
  // si r = droite(n) (voir side) : la texture se lit alors à l'endroit.
  quad(c, r, up, n, uv, col = [1, 1, 1]) {
    const b = this.p.length / 3;
    for (const [a, e, tu, tv] of [[-1, -1, uv[0], uv[1]], [1, -1, uv[2], uv[1]], [1, 1, uv[2], uv[3]], [-1, 1, uv[0], uv[3]]]) {
      this.p.push(c[0] + r[0] * a + up[0] * e, c[1] + r[1] * a + up[1] * e, c[2] + r[2] * a + up[2] * e); this.n.push(n[0], n[1], n[2]); this.u.push(tu, tv); this.c.push(col[0], col[1], col[2]);
    }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  mesh(mat) {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i);
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.updateMatrix(); return m;
  }
}
// vecteur « droite » d'un observateur qui regarde une face tournée vers m (horizontale)
const side = (m) => [m[2], 0, -m[0]];
// couleur du rail porte-étiquettes selon l'enseigne (gris clair par défaut)
const RAIL = { pharma: 0x8bc34a, bonbons: 0xf06292, jouets: 0x29b6f6, quincaillerie: 0xffa000, sport: 0x424242, animalerie: 0x66bb6a, librairie: 0x795548, parfumerie: 0x1a1a1a, electro: 0x263238, octet: 0x37474f, pixel: 0x5e35b1, tabac: 0x8d6e63, videoclub: 0x212121 };
const NO_LABELS = new Set(['cafe', 'pizzeria', 'burger', 'sushi', 'arcade', 'cinema', 'direction', 'staff', 'toilettes', 'bijouterie']);

// Étiquette verticale tournée vers n (nx, nz), au point (x, y, z) ; largeur w, hauteur h.
function tagAt(Q, A, x, y, z, nx, nz, w, h, type, price) {
  const n = [nx, 0, nz], right = side(n), r = [right[0] * w / 2, 0, right[2] * w / 2], up = [0, h / 2, 0];
  Q.quad([x, y, z], r, up, n, A.tag(type));
  // prix à droite (vu de face), légèrement en avant
  const white = type === TAG.choc || type === TAG.nouveau || type === TAG.lot;
  const str = fmt(price), gh = h * (type === TAG.std || type === TAG.pick ? 0.6 : 0.48), gw = gh * 0.56;
  let off = w / 2 - w * 0.05 - gw * str.length + gw / 2;
  const yy = y - (type === TAG.std || type === TAG.pick ? h * 0.06 : h * 0.15);
  for (const ch of str) {
    const k = ch === '€' ? 1.15 : 1;
    Q.quad([x + right[0] * off + nx * 0.0015, yy, z + right[2] * off + nz * 0.0015], [right[0] * gw / 2 * k, 0, right[2] * gw / 2 * k], [0, gh / 2, 0], n, A.glyph(ch, white));
    off += gw * (ch === ',' ? 0.6 : 1);
  }
}

export function labelShop(world, ctl, rng) {
  const g = world.game, s = ctl.shop, id = s.id, P = ctl.P;
  if (!P || NO_LABELS.has(id)) return;
  const A = getAtlas(), Q = new Quads(), stats = { tags: 0, promos: 0, wobblers: 0, cards: 0 };
  const props = (g.props.byZone.get(id) || []).filter(p => p.home && ITEMS[p.defId]);
  const railCol = new THREE.Color(RAIL[id] ?? 0xd3d7db), rail = [railCol.r, railCol.g, railCol.b];
  const assortment = (s.items || []).map(([d]) => d).filter(d => ITEMS[d]);
  for (const b of P.boards) {
    if (b.zone !== id || b.noLabels) continue;
    const nx = Math.sin(b.ry), nz = Math.cos(b.ry);
    const nCross = b.ax === 'x' ? nz : nx;
    if (Math.abs(nCross) < 0.6) continue;
    // produits posés sur cette planche (bas de l'objet au niveau de la planche)
    const on = [];
    for (const p of props) {
      const h = p.home, def = ITEMS[p.defId];
      const along = b.ax === 'x' ? h.x : h.z, cross = b.ax === 'x' ? h.z : h.x;
      if (along < b.a0 - 0.03 || along > b.a1 + 0.03 || Math.abs(cross - b.c) > b.depth / 2 + 0.12) continue;
      if (Math.abs(h.y - def.s[1] / 2 - b.y) > 0.035) continue;
      on.push({ along, def: p.defId, w: Math.max(def.s[0], 0.04) });
    }
    if (!on.length) continue;
    on.sort((a, c) => a.along - c.along);
    const groups = [];
    for (const o of on) {
      const last = groups[groups.length - 1];
      if (last && last.def === o.def && o.along - last.a1 < 0.3) { last.a1 = o.along; last.w1 = o.w; }
      else groups.push({ def: o.def, a0: o.along, a1: o.along, w0: o.w, w1: o.w });
    }
    // trous dans le rayon (article en rupture) : l'étiquette reste, une tous les ~40 cm ; pas sur les longs vides
    const holes = [], ends = [b.a0, ...groups.flatMap(gr => [gr.a0 - gr.w0 / 2, gr.a1 + gr.w1 / 2]), b.a1];
    for (let k = 0; k + 1 < ends.length; k += 2) {
      const g0 = ends[k], g1 = ends[k + 1], len = g1 - g0;
      if (len < 0.24 || len > 1.2 || !assortment.length) continue;
      const n = Math.max(1, Math.floor(len / 0.4));
      for (let j = 0; j < n; j++) holes.push({ def: rng.pick(assortment), a0: g0 + (j + 0.5) * len / n, hole: true });
    }
    const edge = b.c + nCross * (b.depth / 2 + (b.pad || 0)) + nCross * 0.004;
    const pos = (along, y, out = 0) => (b.ax === 'x' ? [along, y, edge + nCross * out] : [edge + nCross * out, y, along]);
    // une étiquette par produit, et une de plus tous les ~70 cm quand le même produit occupe une grande longueur
    const spots = (gr, step) => { const s0 = gr.a0 - gr.w0 / 2, len = gr.a1 + gr.w1 / 2 - s0, n = Math.max(1, Math.round(len / step)); return Array.from({ length: n }, (_, k) => s0 + (k + 0.5) * len / n); };
    if (b.picks) { // pique-prix plantés devant les produits
      for (const gr of groups) for (const a of spots(gr, 0.9)) { const [x, , z] = pos(a, 0, -0.06); tagAt(Q, A, x, b.y + 0.07, z, nx, nz, 0.075, 0.032, TAG.pick, priceOf(gr.def, id)); stats.tags++; }
      continue;
    }
    // rail porte-étiquettes sur toute la longueur
    if (!b.flat) { const mid = pos((b.a0 + b.a1) / 2, b.y - 0.02, -0.001), half = (b.a1 - b.a0) / 2 + 0.04, rt = side([nx, 0, nz]); Q.quad(mid, [rt[0] * half, 0, rt[2] * half], [0, 0.02, 0], [nx, 0, nz], A.white, rail); }
    for (const h of holes) {
      const w = 0.095, hh = 0.034, center = Math.max(b.a0 + w / 2, Math.min(b.a1 - w / 2, h.a0));
      const [x, , z] = pos(center, 0, b.flat ? -0.07 : 0.002);
      tagAt(Q, A, x, b.flat ? b.y + 0.005 + hh / 2 : b.y - 0.003 - hh / 2, z, nx, nz, w, hh, TAG.std, priceOf(h.def, id)); stats.tags++; stats.holes = (stats.holes || 0) + 1;
    }
    for (const gr of groups) {
      const promo = rng.chance(id === 'hyper' || id === 'quincaillerie' || id === 'jouets' ? 0.13 : 0.09);
      const type = promo ? rng.pick([TAG.promo, TAG.promo, TAG.choc, TAG.lot, TAG.nouveau]) : TAG.std;
      let price = priceOf(gr.def, id); if (type === TAG.promo || type === TAG.choc) price = Math.max(0.29, Math.round(price * (type === TAG.choc ? 55 : 70)) / 100 - 0.01);
      const w = promo ? 0.13 : 0.095, h = promo ? 0.05 : 0.034;
      const y = b.flat ? b.y + 0.005 + h / 2 : b.y - 0.003 - h / 2;
      let center = 0;
      for (const a of spots(gr, 0.7)) {
        center = Math.max(b.a0 + w / 2, Math.min(b.a1 - w / 2, a));
        const [x, , z] = pos(center, 0, b.flat ? -0.07 : 0.002);
        tagAt(Q, A, x, y, z, nx, nz, w, h, type, price);              // (sur une table : petit chevalet debout près du bord)
        stats.tags++; if (promo) stats.promos++;
      }
      if (promo && !b.flat && rng.chance(0.4)) { // stop-rayon : disque perpendiculaire au rayon au bout d'une tige, imprimé des deux côtés
        const [wx, , wz] = pos(center, 0, 0.095), d = 0.055;
        const kind = type === TAG.lot ? WOB.lot : type === TAG.nouveau ? WOB.nouveau : type === TAG.choc ? WOB.moins50 : rng.pick([WOB.promo, WOB.prixbas]);
        const [sx, , sz] = pos(center, 0, 0.022); stats.wobblers++;
        for (const sgn of [1, -1]) {
          const m = b.ax === 'x' ? [sgn, 0, 0] : [0, 0, sgn], rt = side(m);
          Q.quad([wx + m[0] * 0.0008, y - 0.012, wz + m[2] * 0.0008], [rt[0] * d, 0, rt[2] * d], [0, d, 0], m, A.wob(kind));
          Q.quad([sx + m[0] * 0.0008, y - 0.012, sz + m[2] * 0.0008], [rt[0] * 0.022, 0, rt[2] * 0.022], [0, 0.003, 0], m, A.white, [0.85, 0.88, 0.9]);
        }
      }
    }
  }
  // affichettes sur la moitié des têtes de gondole
  for (const cap of P.caps || []) {
    if (!rng.chance(0.5)) continue;
    const i = rng.int(0, CARDS.length - 1), w = Math.min(0.55, cap.depth * 0.9), h = w * 0.25; stats.cards++;
    Q.quad([cap.x + cap.nx * 0.003, cap.y - h / 2 - 0.04, cap.z], [0, 0, -cap.nx * w / 2], [0, h / 2, 0], [cap.nx, 0, 0], A.card(i)); // haut du panneau de bout
  }
  const mesh = Q.mesh(zoneMaterial(g, id));
  if (mesh) { mesh.name = 'labels_' + id; ctl.zone.group.add(mesh); }
  ctl.labelStats = stats;
}
