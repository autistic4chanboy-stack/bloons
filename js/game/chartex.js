// Textures des personnages, façon console 32 bits de la fin des années 90 : un atlas partagé de 1024 × 1024 texels
// (une seule texture pour tous les personnages : un matériau et un appel de dessin par personnage), rempli à la demande
// par des peintres procéduraux et mis en cache par clé :
//  - têtes de 64 × 64 : visage peint (yeux, paupières, sourcils, ombre du nez, bouche, barbe, rides, lunettes,
//    maquillage), oreilles, cheveux ras peints sur le crâne ; cagoule, maquillage de clown, visage décharné, mannequin ;
//  - hauts de 128 × 64 (moitié gauche : devant, moitié droite : dos) : uniformes, insigne, écussons, dossards en lettres
//    de 3 × 5 pixels (« SÉCURITÉ HÉLIOS », « POLICE », « POMPIERS »), bandes réfléchissantes, poches, imprimés ;
//  - manches, jambes et hanches, ceintures, chaussures, mains et gants, mèches, couvre-chefs, fourrures, plastique…
// Couleurs sur 15 bits (5 bits par canal, tramage ordonné 4 × 4) ; l'alpha sert de masque de teinte : 255 = multiplié
// par la couleur du sommet (tissus et peau teintés par personnage), 0 = couleur peinte telle quelle (insignes, yeux,
// boutons, lettres). Texels nets au grossissement (NearestFilter), mipmaps au loin (pas de scintillement des foules).
import * as THREE from 'three';

const AW = 1024, CELL = 16, GW = AW / CELL;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const hash2 = (x, y, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
// couleurs sRGB : assombrir / éclaircir, mélanger
export const mul = (h, k) => { const f = (s) => clamp(Math.round(((h >> s) & 255) * k), 0, 255); return (f(16) << 16) | (f(8) << 8) | f(0); };
export const mix = (a, b, t) => { const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };
const gray = (v) => { v = clamp(Math.round(v), 0, 255); return (v << 16) | (v << 8) | v; };

// ───────────────────────── pages de l'atlas ─────────────────────────
class Page {
  constructor(i) {
    this.i = i; this.data = new Uint8Array(AW * AW * 4); this.used = new Uint8Array(GW * GW); this.tiles = new Map();
    const t = this.tex = new THREE.DataTexture(this.data, AW, AW);
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.name = 'atlas_personnages_' + i; t.needsUpdate = true;
  }
  // premier emplacement libre de w × h texels (multiples de 16), ou null
  alloc(w, h) {
    const cw = w / CELL, ch = h / CELL;
    for (let y = 0; y + ch <= GW; y++) for (let x = 0; x + cw <= GW; x++) {
      let ok = true;
      for (let j = 0; j < ch && ok; j++) for (let k = 0; k < cw; k++) if (this.used[(y + j) * GW + x + k]) { ok = false; break; }
      if (!ok) continue;
      for (let j = 0; j < ch; j++) for (let k = 0; k < cw; k++) this.used[(y + j) * GW + x + k] = 1;
      return { x: x * CELL, y: y * CELL };
    }
    return null;
  }
  free(t) { for (let j = 0; j < t.h / CELL; j++) for (let k = 0; k < t.w / CELL; k++) this.used[(t.y / CELL + j) * GW + t.x / CELL + k] = 0; this.tiles.delete(t.key); }
  // libère la case inutilisée la plus ancienne (visages des personnages disparus)
  evict() {
    let best = null;
    for (const t of this.tiles.values()) if (t.dyn && t.refs <= 0 && (!best || t.last < best.last)) best = t;
    if (best) this.free(best);
    return !!best;
  }
}
const PAGES = [];
let _clock = 0;
export const pageTex = (i = 0) => page(i).tex;
function page(i) { while (PAGES.length <= i) PAGES.push(new Page(PAGES.length)); return PAGES[i]; }
// Case de l'atlas (clé → case en cache) ; paint(P) peint la case une seule fois. dyn : case libérable (visages) quand
// plus aucun personnage ne s'en sert. Lève 'PAGE_PLEINE' si la page n'a plus de place.
export function tile(key, w, h, paint, pg = 0, dyn = false) {
  const p = page(pg); let t = p.tiles.get(key);
  if (!t) {
    let at = p.alloc(w, h);
    while (!at && p.evict()) at = p.alloc(w, h);
    if (!at) throw new Error('PAGE_PLEINE');
    t = { key, page: pg, x: at.x, y: at.y, w, h, refs: 0, dyn, last: 0 };
    p.tiles.set(key, t);
    paint(new Painter(p, t.x, t.y, w, h));
    p.tex.needsUpdate = true;
  }
  t.last = ++_clock;
  return t;
}
export function acquire(t) { t.refs++; t.last = ++_clock; }
export function release(t) { t.refs--; }
// coordonnées de texture (atlas normalisé) d'un point (u, v) de la case, en texels ; rien ne déborde sur la voisine
export function uvAt(t, u, v) { return [(t.x + clamp(u, 0.02, t.w - 0.02)) / AW, (t.y + clamp(v, 0.02, t.h - 0.02)) / AW]; }

// ───────────────────────── pinceau ─────────────────────────
// Police de 3 × 5 pixels (lettres capitales, chiffres) ; l'accent aigu se pose sur la ligne au-dessus
const FONT = {};
for (const [k, rows] of Object.entries({
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.', E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#', I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..', Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.', U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###', 0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '##. ..# .#. #.. ###', 3: '##. ..# .#. ..# ##.',
  4: '#.# #.# ### ..# ..#', 5: '### #.. ##. ..# ##.', 6: '.## #.. ### #.# ###', 7: '### ..# .#. .#. .#.', 8: '### #.# ### #.# ###', 9: '### #.# ### ..# ##.',
  '-': '... ... ### ... ...', '.': '... ... ... ... .#.', ' ': '... ... ... ... ...',
})) FONT[k] = rows.replace(/ /g, '');
const ACC = { 'É': 'E', 'È': 'E', 'À': 'A', 'Ç': 'C' };
class Painter {
  constructor(p, x, y, w, h) { this.p = p; this.ox = x; this.oy = y; this.w = w; this.h = h; this.d = p.data; }
  // pixel (x, y) de la case : couleur sRGB quantifiée sur 15 bits avec tramage ; tint 1 : multiplié par la couleur du sommet
  set(x, y, hex, tint = 0) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const X = this.ox + x, Y = this.oy + y, i = (Y * AW + X) * 4, b = BAYER[(Y & 3) * 4 + (X & 3)] / 16 - 0.47;
    const q = (v) => clamp(Math.round(v / 8.226 + b), 0, 31) * 8.226;
    this.d[i] = q((hex >> 16) & 255); this.d[i + 1] = q((hex >> 8) & 255); this.d[i + 2] = q(hex & 255); this.d[i + 3] = tint ? 255 : 0;
  }
  get(x, y) { x = clamp(Math.floor(x), 0, this.w - 1); y = clamp(Math.floor(y), 0, this.h - 1); const i = ((this.oy + y) * AW + this.ox + x) * 4; return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2]; }
  tinted(x, y) { x = clamp(Math.floor(x), 0, this.w - 1); y = clamp(Math.floor(y), 0, this.h - 1); return this.d[((this.oy + y) * AW + this.ox + x) * 4 + 3] > 127 ? 1 : 0; }
  // assombrit / éclaircit (k) ou mêle une couleur (a) au pixel existant, en gardant son masque de teinte
  shade(x, y, k) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.set(x, y, mul(this.get(x, y), k), this.tinted(x, y)); }
  blend(x, y, hex, a, tint) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.set(x, y, mix(this.get(x, y), hex, a), tint ?? this.tinted(x, y)); }
  fill(x, y, w, h, hex, tint = 0) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, typeof hex === 'function' ? hex(x + i, y + j) : hex, tint); }
  rect(x, y, w, h, hex, tint = 0) { for (let i = 0; i < w; i++) { this.set(x + i, y, hex, tint); this.set(x + i, y + h - 1, hex, tint); } for (let j = 1; j < h - 1; j++) { this.set(x, y + j, hex, tint); this.set(x + w - 1, y + j, hex, tint); } }
  shadeRect(x, y, w, h, k) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.shade(x + i, y + j, k); }
  hline(x0, x1, y, hex, tint = 0) { for (let x = x0; x <= x1; x++) this.set(x, y, hex, tint); }
  vline(x, y0, y1, hex, tint = 0) { for (let y = y0; y <= y1; y++) this.set(x, y, hex, tint); }
  disc(cx, cy, r, hex, tint = 0) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, hex, tint); }
  // texte en lettres de 3 × 5 (largeur 4 par lettre) ; cx : centre horizontal
  text(s, cx, y, hex, tint = 0) {
    const w = s.length * 4 - 1; let x = Math.round(cx - w / 2);
    for (const ch of s) {
      const g = FONT[ACC[ch] || ch] || FONT[' '];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '#') this.set(x + i, y + j, hex, tint);
      if (ACC[ch]) this.set(x + (ch === 'È' || ch === 'À' ? 0 : 2), y - 1, hex, tint);
      x += 4;
    }
  }
  // tissu teinté : base claire, trame légère (bruit + armure), plis (k ∈ [0, 1])
  cloth(x0, y0, w, h, base = 0xf2, amp = 10, seed = 1, weave = 0) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const n = hash2(x, y, seed) - 0.5, wv = weave === 1 ? ((x + y) % 3 === 0 ? -6 : 2) : weave === 2 ? (x % 2 ? -7 : 3) : 0;
      this.set(x, y, gray(base + n * amp + wv), 1);
    }
  }
}

// ───────────────────────── têtes (64 × 64) ─────────────────────────
// Projection de la tête : colonne selon l'angle θ autour du crâne (0 : visage, ±π : nuque ; θ > 0 vers +x), ligne selon
// la hauteur y dans le repère de la tête (avant l'échelle) : 12 lignes pour le crâne, 52 pour le front, le visage et le cou
export const HEAD = { y0: 0.192, y1: 0.112, y2: -0.072 };
export function headU(th) { const a = Math.min(Math.PI, Math.abs(th)), g = a <= Math.PI / 2 ? 0.62 * Math.sin(a) : 0.62 + 0.38 * (a - Math.PI / 2) / (Math.PI / 2); return 32 + 32 * Math.sign(th) * g; }
export function headV(y) { return y >= HEAD.y1 ? (HEAD.y0 - y) / (HEAD.y0 - HEAD.y1) * 12 : 12 + (HEAD.y1 - y) / (HEAD.y1 - HEAD.y2) * 52; }
const thOfU = (u) => { const a = Math.abs(u - 32) / 32; return Math.sign(u - 32) * (a <= 0.62 ? Math.asin(a / 0.62) : Math.PI / 2 + (a - 0.62) / 0.38 * Math.PI / 2); };
const yOfV = (v) => (v < 12 ? HEAD.y0 - v / 12 * (HEAD.y0 - HEAD.y1) : HEAD.y1 - (v - 12) / 52 * (HEAD.y1 - HEAD.y2));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// f : {skin, hair, brow, eye, lip, f (femme), c (enfant), age, beard, mustache, glasses, makeup {shadow, liner, blush},
//      scalp ('hair' | 'buzz' | 'bald' | 'none' | 'fringe' | 'part'), ghostly, clown, balaclava, hood, gaunt, plastic, seed}
// L : repères du visage {eyeTh, eyeY, browY, noseY, mouthY, mouthTh, chinY, earY0, earY1, hair : [front, tempe, oreille, nuque]}
export function headKey(f) { return 'head|' + JSON.stringify(f); }
export function paintHead(P, f, L) {
  const S = f.plastic ? 0xe6dfd0 : f.gaunt ? f.skin : f.ghostly ? mix(f.skin, 0xb8c0c8, 0.35) : f.skin;
  const R = (x, y) => hash2(x, y, f.seed || 0);
  const ex = Math.round(headU(L.eyeTh) - 32), ey = Math.round(headV(L.eyeY)), by = Math.round(headV(L.browY)), ny = Math.round(headV(L.noseY));
  const my = Math.round(headV(L.mouthY)), mw = Math.max(2, Math.round(headU(L.mouthTh) - 32)), cy = Math.round(headV(L.chinY));
  const hl = (th) => { // hauteur de la naissance des cheveux selon l'angle
    const a = Math.abs(th), H = L.hair;
    return a < 0.75 ? H[0] + (f.scalp === 'fringe' ? 0 : 0.01 * ss(0.3, 0.75, a)) : a < 1.25 ? H[0] + (H[1] - H[0]) * ss(0.75, 1.25, a) : a < 1.75 ? H[1] + (H[2] - H[1]) * ss(1.25, 1.75, a) : H[2] + (H[3] - H[2]) * ss(1.75, 2.4, a);
  };
  // fond : peau, flancs et nuque un peu plus sombres, dessous du menton dans l'ombre, grain
  for (let v = 0; v < 64; v++) for (let u = 0; u < 64; u++) {
    const th = thOfU(u + 0.5), y = yOfV(v + 0.5), a = Math.abs(th);
    let k = 1 - 0.1 * ss(1.1, 2.4, a) + (R(u, v) - 0.5) * (f.plastic ? 0.02 : 0.05);
    if (y < L.chinY - 0.004 && a < 1.5) k *= 0.8;
    if (y < L.chinY - 0.004 && a >= 1.5) k *= 0.9;
    if (a < 1.25 && y > L.chinY && y < L.mouthY) k *= 1 - 0.06 * ss(0.6, 1.2, a); // mâchoire
    if (f.gaunt && a > 0.45 && a < 1.2 && y > L.mouthY && y < L.eyeY - 0.02) k *= 0.8; // joues creuses
    P.set(u, v, mul(S, k), 0);
  }
  const at = (u, v, k) => P.shade(u, v, k), put = (u, v, c) => P.set(u, v, c, 0);
  const sym = (fn) => { fn(1); fn(-1); }; // s = 1 : côté droit de l'image (+x), -1 : miroir
  const X = (s, d) => (s > 0 ? 32 + d : 31 - d); // colonne à d pixels du centre
  // oreilles (θ = ±π/2) : pavillon clair, conque sombre, lobe
  const eu = Math.round(headU(Math.PI / 2) - 32), e0 = Math.round(headV(L.earY1)), e1 = Math.round(headV(L.earY0));
  sym((s) => { for (let v = e0; v <= e1; v++) for (let d = -1; d <= 3; d++) { const u = X(s, eu + d), t = (v - e0) / (e1 - e0); if (d === -1) at(u, v, 0.86); else if (d >= 0 && d <= 1 && t > 0.2 && t < 0.75) at(u, v, 0.72); else at(u, v, t > 0.85 ? 0.95 : 1.05); } });
  if (f.balaclava) return paintBalaclava(P, f, L, S, ex, ey, by);
  // cheveux peints sur le crâne
  if (f.scalp && f.scalp !== 'none') {
    const hc = f.hair;
    for (let v = 0; v < 64; v++) for (let u = 0; u < 64; u++) {
      const th = thOfU(u + 0.5), y = yOfV(v + 0.5), a = Math.abs(th);
      let h = hl(th);
      if (f.scalp === 'bald' && !(a > 1.3 && y < 0.115)) continue; // couronne dégarnie
      if (y < h - 0.006) continue;
      if (y < h && (u + v) % 2) continue; // lisière tramée
      if (f.scalp === 'buzz') { if (R(u, v) < 0.35) continue; put(u, v, mix(P.get(u, v), mul(hc, 0.85), 0.55)); continue; }
      const strand = 0.78 + 0.3 * hash2(u, 0, (f.seed || 0) + 3) + 0.14 * (R(u, v) - 0.5);
      put(u, v, mul(hc, strand * (y < h + 0.008 ? 0.88 : 1)));
    }
    if (f.scalp === 'part') for (let v = 0; v < 12; v++) put(32, v, mix(S, f.hair, 0.4));
    if (f.scalp === 'bald') { at(31, 4, 1.08); at(32, 4, 1.1); at(33, 5, 1.06); }
  }
  if (f.hood) for (let v = 0; v < 64; v++) for (let u = 0; u < 64; u++) { const th = thOfU(u + 0.5), y = yOfV(v + 0.5), a = Math.abs(th); if (a > 1.2 || y > L.browY + 0.016 || (y < L.chinY - 0.002 && a > 0.9)) put(u, v, mul(f.hood, 0.9 + 0.2 * R(u, v))); }
  // pommettes, sillons, menton
  sym((s) => { at(X(s, ex + 2), ey + 4, 1.05); at(X(s, ex + 3), ey + 4, 1.04); at(X(s, ex + 3), ey + 6, 0.94); at(X(s, ex + 4), ey + 7, 0.93); });
  for (let d = -2; d <= 1; d++) at(32 + d, cy - 1, 1.05);
  sym((s) => { at(X(s, 3), cy, 0.9); at(X(s, mw + 4), cy - 3, 0.9); at(X(s, mw + 5), cy - 5, 0.92); });
  if (f.plastic) return paintPlastic(P, f, L, S, ex, ey, by, ny, my, mw, sym, X, at);
  if (f.gaunt) return paintGaunt(P, f, L, S, ex, ey, ny, my, mw, sym, X, at, put);
  // orbites : ombre douce autour des yeux, plus marquée vers le coin interne et sous l'arcade
  sym((s) => {
    for (let v = ey - 3; v <= ey + 3; v++) for (let d = ex - 4; d <= ex + 4; d++) {
      const r = ((d - ex) / 4.5) ** 2 + ((v - ey + 0.3) / 3.2) ** 2; if (r > 1) continue;
      at(X(s, d), v, 1 - (f.ghostly ? 0.22 : f.c ? 0.06 : 0.1) * (1 - r) - (d < ex && v < ey ? 0.03 : 0));
    }
    if (f.ghostly) for (let d = ex - 3; d <= ex + 3; d++) { P.blend(X(s, d), ey + 2, 0x4a3a52, 0.35); P.blend(X(s, d), ey + 3, 0x4a3a52, 0.2); }
  });
  // yeux : ligne des cils, blanc, iris 2 × 2 avec pupille, paupière inférieure ; amande plus ouverte chez l'enfant
  const lash = f.ghostly ? 0x0e0a0a : mix(0x1a1210, f.brow, 0.25), W = f.ghostly ? 0xb8b4b0 : 0xd6cfc4, W2 = mul(W, 0.84);
  const eye = f.eye, half = f.c ? 3 : 3;
  sym((s) => {
    // d ∈ [-3, 2] : colonne relative au centre de l'œil (côté nez : d < 0)
    const col = (d) => (s > 0 ? 32 + ex + d : 31 - ex - d);
    for (let d = -half; d < half; d++) put(col(d), ey - 1, lash);
    if (f.makeup?.liner || f.f) { put(col(half), ey - 1, lash); if (f.makeup?.liner) put(col(half), ey - 2, mix(P.get(col(half), ey - 2), lash, 0.6)); }
    // rangée 0 : blanc / iris / blanc (l'iris touche la paupière : regard fixe)
    const iris = [-1, 0];
    for (let d = -half; d < half; d++) put(col(d), ey, d === -half || d === half - 1 ? W2 : iris.includes(d) ? (d === -1 ? mul(eye, 0.45) : eye) : W);
    // rangée 1 : amande (coins en peau sombre), iris
    for (let d = -half; d < half; d++) put(col(d), ey + 1, d === -half || d === half - 1 ? mul(S, 0.78) : iris.includes(d) ? mul(eye, d === -1 ? 0.8 : 0.95) : W2);
    if (!f.c && !f.f) { put(col(-half), ey + 1, mul(S, 0.86)); put(col(half - 1), ey + 1, mul(S, 0.82)); }
    for (let d = -half; d < half; d++) at(col(d), ey + 2, 0.86);
    if (f.age) { for (let d = -2; d < 2; d++) at(col(d), ey + 3, 0.9); at(col(half), ey, 0.86); at(col(half + 1), ey + 1, 0.88); at(col(half), ey - 2, 0.9); }
    // pli de la paupière supérieure
    for (let d = -half + 1; d < half; d++) at(col(d), ey - 2, f.makeup?.shadow ? 1 : 0.88);
    if (f.makeup?.shadow) for (let d = -half; d < half; d++) { P.blend(col(d), ey - 2, f.makeup.shadow, 0.55); if (d > -2) P.blend(col(d), ey - 3, f.makeup.shadow, 0.25); }
    if (f.makeup?.blush) for (let d = 1; d <= 3; d++) { P.blend(col(d), ey + 5, f.makeup.blush, 0.22); P.blend(col(d), ey + 6, f.makeup.blush, 0.16); }
    // sourcil : épais et droit (homme), fin et arqué (femme), peu marqué chez l'enfant
    const bc = f.brow;
    if (f.ghostly) { for (let d = -half; d <= half; d++) P.blend(col(d), by + (d > 1 ? 1 : 0), bc, 0.5); }
    else if (f.f || f.c) { for (let d = -half; d <= half; d++) put(col(d), by + (d === half ? 1 : 0) - (d >= -1 && d <= 1 ? 1 : 0), d === half ? mix(bc, S, 0.4) : bc); }
    else { for (let d = -half - 1; d <= half; d++) { put(col(d), by, bc); if (d < half - 1) put(col(d), by + 1, d === -half - 1 ? mix(bc, S, 0.4) : mul(bc, 1.1)); } }
  });
  // nez : arête claire côté lumière, ailes et narines sombres, ombre portée sur la lèvre
  for (let v = ey; v < ny - 1; v++) { at(32, v, 1.04); at(31, v, 0.96); }
  at(31, ny, 1.05); at(32, ny, 1.07); at(30, ny - 1, 0.92); at(33, ny - 1, 0.92);
  if (f.clown) { for (let v = ny - 2; v <= ny + 1; v++) for (let u = 30; u <= 33; u++) put(u, v, u === 32 && v === ny - 1 ? 0xff7a6a : 0xd01010); }
  else {
    put(30, ny + 1, mul(S, f.c ? 0.72 : 0.62)); put(33, ny + 1, mul(S, f.c ? 0.72 : 0.62)); at(31, ny + 1, 0.88); at(32, ny + 1, 0.88);
    at(29, ny, 0.9); at(34, ny, 0.9); at(29, ny - 1, 0.94); at(34, ny - 1, 0.94);
    for (let u = 30; u <= 33; u++) at(u, ny + 2, 0.9);
  }
  if (f.age) sym((s) => { const c = (d) => (s > 0 ? 32 + d : 31 - d); at(c(3), ny + 1, 0.85); at(c(4), ny + 2, 0.85); at(c(4), ny + 3, 0.86); at(c(mw + 1), my, 0.85); at(c(mw + 1), my + 2, 0.88); });
  // bouche : lèvre supérieure plus sombre, ligne des lèvres, lèvre inférieure éclairée, ombre sous la lèvre
  const lip = f.clown ? 0xd01010 : f.lip, cw = f.clown ? mw + 3 : mw;
  for (let u = 32 - cw + 1; u <= 31 + cw - 1; u++) put(u, my - 1, mix(P.get(u, my - 1), mul(lip, 0.82), f.f || f.clown ? 0.9 : 0.6));
  for (let u = 32 - cw; u <= 31 + cw; u++) put(u, my, mul(lip, f.clown ? 0.6 : 0.42));
  for (let u = 32 - cw + 1; u <= 31 + cw - 1; u++) put(u, my + 1, mix(P.get(u, my + 1), lip, f.f || f.clown ? 0.85 : 0.55));
  if (f.clown) { put(32 - cw - 1, my - 1, 0xd01010); put(31 + cw + 1, my - 1, 0xd01010); put(32 - cw - 1, my - 2, 0xd01010); put(31 + cw + 1, my - 2, 0xd01010); }
  else { at(32 - cw, my - 1, 0.9); at(31 + cw, my - 1, 0.9); at(31, my - 2, 0.94); at(32, my - 2, 0.94); at(32, my + 1, 1.06); }
  for (let u = 30; u <= 33; u++) at(u, my + 2, 0.88);
  // barbe naissante, barbe, moustache (couleur des cheveux)
  const beardRegion = (u, v) => { const th = thOfU(u + 0.5), y = yOfV(v + 0.5), a = Math.abs(th); if (a > 1.5 || y > L.noseY - 0.006 || y < L.chinY - 0.02) return false; if (a > 1.0 && y > L.mouthY + 0.02 + 0.03 * ss(1.0, 1.45, a)) return a > 1.25 && y < L.earY1 - 0.01; if (y > L.mouthY + 0.013 && a > 0.32) return false; return !(Math.abs(u - 31.5) < cw && Math.abs(v - my) < 1.5); };
  if (f.beard === 'stubble' || f.beard === 'beard') {
    const bh = mul(f.hair, 0.7);
    for (let v = 0; v < 64; v++) for (let u = 0; u < 64; u++) if (beardRegion(u, v)) {
      if (f.beard === 'beard') put(u, v, mul(f.hair, 0.72 + 0.28 * R(u, v)));
      else if (R(u, v + 7) < 0.5) put(u, v, mix(P.get(u, v), bh, 0.38));
    }
  }
  if (f.mustache) { const mc = mul(f.hair, 0.82); for (let u = 32 - cw - 1; u <= 31 + cw + 1; u++) { put(u, my - 2, mul(mc, 0.9 + 0.15 * R(u, 1))); if (Math.abs(u - 31.5) < cw) put(u, my - 3, mul(mc, 1.05)); if (Math.abs(u - 31.5) < cw - 2) put(u, my - 4, mul(mc, 1.1)); } put(32 - cw - 1, my - 1, mul(mc, 0.8)); put(31 + cw + 1, my - 1, mul(mc, 0.8)); put(32 - cw - 1, my, mul(mc, 0.7)); put(31 + cw + 1, my, mul(mc, 0.7)); }
  // rides (âge) : front, pattes d'oie
  if (f.age) { for (const dv of [5, 8]) for (let u = 26; u <= 37; u++) if ((u + dv) % 4 !== 0) at(u, by - dv, 0.9); }
  // maquillage de clown : fond blanc, losanges bleus sur les yeux, sourcils hauts
  if (f.clown) {
    for (let v = 0; v < 64; v++) for (let u = 0; u < 64; u++) { const th = thOfU(u + 0.5), y = yOfV(v + 0.5); if (Math.abs(th) < 1.15 && y > L.chinY - 0.003 && y < L.browY + 0.02) { const c = P.get(u, v); const lum = ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255); if (lum > 3 * 0x70 && !((c >> 16) > 0xb0 && ((c >> 8) & 255) < 0x60)) put(u, v, mix(0xf2efe8, c, 0.08)); } }
    sym((s) => { const c = (d) => (s > 0 ? 32 + d : 31 - d); for (let k = 0; k < 3; k++) { put(c(ex), by - 2 - k, 0x1e5bd8); put(c(ex), ey + 3 + k, 0x1e5bd8); } put(c(ex - 1), ey + 3, 0x1e5bd8); put(c(ex + 1), ey + 3, 0x1e5bd8); for (let d = -2; d <= 2; d++) put(c(ex + d), by - 1 - (Math.abs(d) < 2 ? 1 : 0), 0x141414); });
  }
  // lunettes : montures autour des yeux, pont, branches vers les oreilles, reflet
  if (f.glasses != null) {
    const g = f.glasses;
    sym((s) => {
      const c = (d) => (s > 0 ? 32 + d : 31 - d), a0 = ex - 4, a1 = ex + 3;
      for (let d = a0; d <= a1; d++) { put(c(d), ey - 2, g); put(c(d), ey + 2, mix(g, P.get(c(d), ey + 2), 0.3)); }
      for (let v = ey - 2; v <= ey + 2; v++) { put(c(a0), v, g); put(c(a1), v, g); }
      for (let d = a0 + 1; d < a1; d++) for (let v = ey - 1; v <= ey + 1; v++) P.blend(c(d), v, 0xa8bcc8, 0.12);
      put(c(a1 - 1), ey - 1, mix(P.get(c(a1 - 1), ey - 1), 0xffffff, 0.5));
      for (let d = a1 + 1; d < eu; d++) put(c(d), ey - 1, mul(g, 0.9));
    });
    put(31, ey - 1, g); put(32, ey - 1, g);
  }
}
function paintBalaclava(P, f, L, S, ex, ey, by) {
  const K = 0x1c1c1e;
  for (let v = 0; v < 64; v++) for (let u = 0; u < 64; u++) {
    const inHole = Math.abs(u - 31.5) <= ex + 4.5 && v >= ey - 3 && v <= ey + 2;
    if (inHole) continue;
    const rib = u % 2 ? 0.86 : 1.06, edge = Math.abs(u - 31.5) <= ex + 5.5 && v >= ey - 4 && v <= ey + 3;
    P.set(u, v, mul(edge ? 0x303034 : K, rib * (0.92 + 0.16 * hash2(u, v, 9))), 0);
  }
  for (let s of [1, -1]) {
    const col = (d) => (s > 0 ? 32 + ex + d : 31 - ex - d);
    for (let d = -3; d < 3; d++) { P.set(col(d), ey - 1, 0x140e0c, 0); P.set(col(d), ey, d === -1 ? 0x140e0c : d === 0 ? f.eye : 0xd6cfc4, 0); P.set(col(d), ey + 1, mul(S, 0.75), 0); }
    for (let d = -4; d < 4; d++) P.set(col(d), ey - 3, mul(f.brow, 1), 0);
  }
}
function paintPlastic(P, f, L, S, ex, ey, by, ny, my, mw, sym, X, at) {
  // mannequin de 1987 : visage lisse, orbites à peine creusées, sourcils effacés, couture du cou
  sym((s) => {
    const c = (d) => (s > 0 ? 32 + d : 31 - d);
    for (let v = ey - 2; v <= ey + 2; v++) for (let d = ex - 3; d <= ex + 3; d++) { const r = ((d - ex) / 3.6) ** 2 + ((v - ey) / 2.6) ** 2; if (r < 1) at(c(d), v, 1 - 0.07 * (1 - r)); }
    for (let d = ex - 2; d <= ex + 2; d++) at(c(d), by, 0.9);
    at(c(ex - 1), ey, 0.93); at(c(ex), ey, 0.92); at(c(ex + 1), ey, 0.93);
  });
  for (let v = ey; v < ny; v++) at(31, v, 0.97);
  at(30, ny + 1, 0.9); at(33, ny + 1, 0.9);
  for (let u = 32 - mw + 1; u <= 31 + mw - 1; u++) at(u, my, 0.9);
  for (let u = 0; u < 64; u++) at(u, 63, 0.82);
}
function paintGaunt(P, f, L, S, ex, ey, ny, my, mw, sym, X, at, put) {
  // visage décharné : orbites noires et profondes, nez réduit à deux fentes, bouche sans lèvres aux dents grises, veines
  sym((s) => {
    const c = (d) => (s > 0 ? 32 + d : 31 - d);
    for (let v = ey - 4; v <= ey + 4; v++) for (let d = ex - 5; d <= ex + 5; d++) { const r = ((d - ex) / 5) ** 2 + ((v - ey) / 4) ** 2; if (r < 1) put(c(d), v, mix(P.get(c(d), v), 0x050404, Math.min(1, (1 - r) * 1.6))); }
    for (let k = 0; k < 6; k++) put(c(ex + 6 + (k >> 1)), ey - 6 + k, mix(P.get(c(ex + 6 + (k >> 1)), ey - 6 + k), 0x40506a, 0.5));
    for (let k = 0; k < 5; k++) put(c(ex + 2 + k), 58 + (k & 1), mix(P.get(c(ex + 2 + k), 58), 0x40506a, 0.45));
  });
  put(31, ny + 1, 0x0c0808); put(32, ny + 1, 0x0c0808); put(31, ny, mul(S, 0.7)); put(32, ny, mul(S, 0.7));
  for (let u = 32 - mw - 2; u <= 31 + mw + 2; u++) { put(u, my, 0x080505); put(u, my - 1, u % 2 ? 0x8a8478 : 0x3a3430); put(u, my + 1, u % 2 ? 0x6a645a : 0x2a2420); }
  put(32 - mw - 3, my - 1, 0x1a1010); put(31 + mw + 3, my - 1, 0x1a1010);
}

// ───────────────────────── hauts (128 × 64 : devant 0-63, dos 64-127) ─────────────────────────
// Repères (lignes) : col 0, épaules 0-3, poitrine (poches, insigne) 20-32, ceinture en bas. o : {style, hem, seed,
// pockets, patch, badge, logo, print, inner, plaid, dots, ribbed, zip, bands, text}
export function topKey(o) { return 'top|' + JSON.stringify(o); }
export function paintTop(P, o) {
  const seed = o.seed || 1, raw = 0;
  const knit = o.ribbed || o.style === 'sweater';
  P.cloth(0, 0, 128, 64, 0xf3, knit ? 8 : 9, seed, knit ? 2 : o.style === 'jacket' || o.style === 'fire' ? 1 : 0);
  // plis : sous les bras, au creux du dos, à la taille
  for (let v = 4; v < 64; v++) for (const u of [0, 1, 63, 64, 65, 127]) P.shade(u, v, 0.9);
  for (let v = 6; v < 30; v++) { P.shade(62 - (v >> 3), v, 0.93); P.shade(1 + (v >> 3), v, 0.93); P.shade(66 + (v >> 3), v, 0.93); P.shade(125 - (v >> 3), v, 0.93); }
  if (o.plaid) for (let v = 0; v < 64; v++) for (let u = 0; u < 128; u++) { const a = (u % 8 < 2) + (v % 8 < 2); if (a) P.shade(u, v, a === 2 ? 0.72 : 0.84); }
  if (o.stripes) for (let v = 14; v < 64; v += 7) for (let u = 0; u < 128; u++) { P.shade(u, v, 0.78); P.shade(u, v + 1, 0.78); }
  if (o.dots) for (let v = 2; v < 62; v += 6) for (let u = (v % 12 ? 0 : 3); u < 128; u += 6) P.disc(u + 1.5, v + 1.5, 1.4, o.dots[(u + v) % o.dots.length], raw);
  // encolure
  const neck = o.collar || 'crew';
  if (neck === 'crew' || neck === 'round') { for (let u = 22; u <= 41; u++) { const d = Math.round(2.5 * Math.cos((u - 31.5) / 10 * Math.PI / 2)); P.shade(u, d, 0.78); P.shade(u, d + 1, 0.86); } for (let u = 64; u < 128; u++) P.shade(u, 0, 0.8); }
  if (neck === 'round' && o.collarRaw != null) for (let u = 20; u <= 43; u++) for (let v = 0; v < 4 - Math.round(Math.abs(u - 31.5) / 8); v++) P.set(u, v, o.collarRaw, raw);
  if (neck === 'shirt' || neck === 'polo') { // pointes du col
    for (let v = 0; v < 5; v++) { for (let u = 26 + v; u <= 30; u++) P.set(u, v, gray(0xfc), 1); for (let u = 33; u <= 37 - v; u++) P.set(u, v, gray(0xfc), 1); P.shade(26 + v, v, 0.75); P.shade(37 - v, v, 0.75); }
    for (let u = 64; u < 128; u++) { P.set(u, 0, gray(0xfa), 1); P.shade(u, 1, 0.75); }
  }
  if (neck === 'high') { for (let u = 0; u < 128; u++) { P.shade(u, 0, 0.84); P.shade(u, 1, 0.84); P.shade(u, 2, 0.7); } }
  if (neck === 'v') for (let v = 0; v < 12; v++) { P.shade(31 - (v >> 1), v, 0.75); P.shade(32 + (v >> 1), v, 0.75); }
  // patte de boutonnage et boutons
  if (o.placket) { for (let v = 3; v < 64; v++) { P.shade(31, v, 0.9); P.shade(33, v, 0.86); } const n = neck === 'polo' ? 2 : 6, dy = neck === 'polo' ? 6 : 10; for (let i = 0; i < n; i++) { const v = 6 + i * dy; P.set(32, v, gray(0xb8), 1); P.set(32, v + 1, gray(0xd8), 1); } }
  if (o.zip) for (let v = 3; v < 64; v++) { P.set(31, v, v % 2 ? 0x8a8a88 : 0x5a5a58, raw); P.shade(30, v, 0.8); P.shade(33, v, 0.8); }
  // poches de poitrine à rabat
  if (o.pockets) for (const u0 of [19, 35]) { P.rect(u0, 22, 10, 11, gray(0xc8), 1); P.fill(u0, 22, 10, 3, gray(0xd8), 1); P.hline(u0, u0 + 9, 25, gray(0xb8), 1); P.set(u0 + 4, 24, gray(0xa8), 1); P.set(u0 + 5, 24, gray(0xa8), 1); }
  if (o.pocket1) { P.rect(19, 22, 9, 10, gray(0xcc), 1); P.hline(19, 27, 23, gray(0xd8), 1); }
  // épaulettes (dessus des épaules, de part et d'autre des emmanchures)
  if (o.epaul) for (const u0 of [0, 57, 121]) for (let u = u0; u < u0 + 7; u++) { P.shade(u, 1, 0.8); P.shade(u, 2, 0.84); P.shade(u, 3, 0.74); }
  // insignes
  if (o.badge === 'guard' || o.badge === 'police') {
    const g = o.badge === 'police' ? 0xc4c8cc : 0xd4af37, d = o.badge === 'police' ? 0x1a2a6a : 0x7a1c1c;
    const B = ['.###.', '#####', '##.##', '#####', '.###.', '..#..'];
    B.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') P.set(39 + i, 14 + j, i === 2 && j === 2 ? d : j < 2 ? mix(g, 0xffffff, 0.25) : g, raw); }));
    P.set(41, 16, d, raw);
  }
  if (o.patch === 'sun') sunLogo(P, 23, 16, 0xe8c547, 0x1f2a44);
  if (o.patch === 'police') { P.fill(20, 15, 10, 3, 0xf2f2f2, raw); for (let u = 21; u < 29; u += 2) P.set(u, 16, 0x1a2a6a, raw); }
  if (o.nameTag) { P.fill(19, 17, 9, 4, 0xf4f4f0, raw); P.rect(19, 17, 9, 4, 0xb0b0a8, raw); P.hline(21, 25, 18, 0x404040, raw); P.hline(21, 23, 19, 0x707070, raw); }
  if (o.logo != null) { P.fill(38, 16, 4, 3, o.logo, raw); P.set(41, 16, mul(o.logo, 0.6), raw); }
  if (o.print) printOn(P, o.print, seed);
  // dos : empiècement, dossard en lettres
  if (o.yoke) P.hline(64, 127, 8, gray(0xd0), 1);
  if (o.text) o.text.forEach((t, i) => P.text(t.s, 96, t.y ?? 12 + i * 8, t.c, raw));
  // veste ouverte : t-shirt clair dans l'ouverture, revers
  if (o.inner != null) {
    for (let v = 0; v < 64; v++) { const w = Math.round(5 - v * 0.03); for (let u = 32 - w; u < 32 + w; u++) P.set(u, v, mul(o.inner, 0.95 + 0.06 * hash2(u, v, 4)), raw); P.shade(32 - w - 1, v, 0.75); P.shade(32 + w, v, 0.75); }
    for (let v = 0; v < 18; v++) { P.shade(32 - 6 - (v >> 2), v, 0.82); P.shade(32 + 5 + (v >> 2), v, 0.82); }
    for (const u0 of [17, 39]) P.hline(u0, u0 + 7, 50, gray(0xb4), 1);
  }
  // capuche rabattue dans le dos, poche kangourou, cordons
  if (o.hood) {
    for (let v = 0; v < 12; v++) { const w = Math.round(16 - v * 0.9); for (let u = 96 - w; u < 96 + w; u++) P.shade(u, v, v === 11 || Math.abs(u - 96) >= w - 1 ? 0.7 : 0.9); }
    for (let v = 1; v < 14; v++) { P.set(29, v, 0xd8d8d4, raw); P.set(34, v, 0xd8d8d4, raw); }
    for (let v = 42; v < 57; v++) { const w = Math.round(9 + (v - 42) * 0.25); P.shade(32 - w, v, 0.78); P.shade(31 + w, v, 0.78); if (v === 42) for (let u = 32 - w; u < 32 + w; u++) P.shade(u, v, 0.8); }
  }
  // bas côtelé (pulls, sweats) ou ourlet
  if (knit || o.hood) for (let v = 59; v < 64; v++) for (let u = 0; u < 128; u++) P.shade(u, v, u % 2 ? 0.82 : 0.95);
  else for (let u = 0; u < 128; u++) P.shade(u, 63, 0.84);
  // bandes réfléchissantes (tenue de feu) : jaune fluo, liseré argent
  if (o.bands) for (const v0 of o.bands) for (let u = 0; u < 128; u++) { P.set(u, v0, 0xc9c02a, raw); P.set(u, v0 + 1, 0xb8bcc0, raw); P.set(u, v0 + 2, 0xc9c02a, raw); }
  if (o.belly != null) for (let v = 10; v < 60; v++) for (let u = 14; u < 50; u++) { const r = ((u - 31.5) / 17) ** 2 + ((v - 34) / 24) ** 2; if (r < 1) P.set(u, v, mul(o.belly, 0.92 + 0.12 * hash2(u, v, 2)), raw); else if (r < 1.12 && (u + v) % 3 === 0) P.set(u, v, mul(o.belly, 0.55), raw); }
}
// logo du centre Hélios : soleil à rayons (écussons des agents)
function sunLogo(P, x, y, c, bg) {
  P.fill(x - 1, y - 1, 8, 8, bg, 0); P.rect(x - 1, y - 1, 8, 8, c, 0);
  P.disc(x + 3, y + 3, 1.6, c, 0); for (const [a, b] of [[3, 0], [3, 6], [0, 3], [6, 3], [1, 1], [5, 1], [1, 5], [5, 5]]) P.set(x + a, y + b, c, 0);
}
function printOn(P, k, seed) {
  const c = [0xe8e2d0, 0xc62828, 0x1e88e5, 0xffd54f, 0x202020][Math.floor(hash2(seed, 2) * 5)];
  if (k === 1) { P.fill(25, 18, 14, 9, c, 0); P.fill(27, 20, 10, 5, mix(c, 0x000000, 0.45), 0); P.text('87', 32, 20, c, 0); }
  if (k === 2) for (let u = 0; u < 128; u++) { P.set(u, 20, c, 0); P.set(u, 21, c, 0); P.set(u, 24, c, 0); }
  if (k === 3) { P.disc(32, 22, 4.5, c, 0); P.disc(32, 22, 2.5, mix(c, 0xffffff, 0.5), 0); }
}

// ───────────────────────── manches (32 × 64 : épaule → poignet ; côté extérieur vers la colonne 24) ─────────────────────────
export function paintSleeve(P, o) {
  const knit = o.ribbed || o.style === 'sweater';
  if (o.fur != null) return furFill(P, 0, 0, 32, 64, o.fur, 5);
  if (o.plastic != null) return plasticFill(P, 0, 0, 32, 64, o.plastic);
  P.cloth(0, 0, 32, 64, 0xf3, knit ? 8 : 9, (o.seed || 1) + 5, knit ? 2 : 0);
  if (o.plaid) for (let v = 0; v < 64; v++) for (let u = 0; u < 32; u++) { const a = (u % 8 < 2) + (v % 8 < 2); if (a) P.shade(u, v, a === 2 ? 0.72 : 0.84); }
  if (o.stripes) for (let v = 6; v < 64; v += 7) for (let u = 0; u < 32; u++) { P.shade(u, v, 0.78); P.shade(u, v + 1, 0.78); }
  if (o.dots) for (let v = 2; v < 62; v += 6) for (let u = (v % 12 ? 0 : 3); u < 32; u += 6) P.disc(u + 1.5, v + 1.5, 1.4, o.dots[(u + v) % o.dots.length], 0);
  // plis du coude (face interne), couture
  for (const v of [o.elbow - 2, o.elbow, o.elbow + 2]) for (let u = 12; u < 20; u++) if ((u + v) % 3) P.shade(u, v, 0.86);
  for (let v = 0; v < 64; v++) P.shade(0, v, 0.86);
  const end = o.end ?? 63;
  if (o.short) { for (let u = 0; u < 32; u++) { P.shade(u, end - 1, 0.86); P.shade(u, end, 0.78); } }
  else if (knit || o.cuffRib) for (let v = 58; v < 64; v++) for (let u = 0; u < 32; u++) P.shade(u, v, u % 2 ? 0.82 : 0.95);
  else { for (let u = 0; u < 32; u++) { P.shade(u, 57, 0.82); P.shade(u, 63, 0.86); } P.set(10, 60, 0xb8b8b0, 0); }
  if (o.patch === 'sun') sunLogo(P, 21, 6, 0xe8c547, 0x1f2a44);
  if (o.patch === 'police') { P.fill(21, 6, 2, 4, 0x1e3a8a, 0); P.fill(23, 6, 2, 4, 0xf2f2f2, 0); P.fill(25, 6, 2, 4, 0xc62828, 0); }
  if (o.patch === 'flag') { P.fill(20, 8, 3, 5, 0x1e3a8a, 0); P.fill(23, 8, 3, 5, 0xf2f2f2, 0); P.fill(26, 8, 3, 5, 0xc62828, 0); }
  if (o.bands) for (const v0 of o.bands) for (let u = 0; u < 32; u++) { P.set(u, v0, 0xc9c02a, 0); P.set(u, v0 + 1, 0xb8bcc0, 0); P.set(u, v0 + 2, 0xc9c02a, 0); }
  if (o.rings) for (const v0 of o.rings) for (let u = 0; u < 32; u++) { P.set(u, v0, 0x90a4ae, 0); P.set(u, v0 + 1, 0x78909c, 0); }
}
// ───────────────────────── jambes et hanches (64 × 64 : jambe 32 × 64, hanches 32 × 32, ceinture 32 × 8) ─────────────────────────
export function paintPants(P, o) {
  const jeans = o.style === 'jeans';
  if (o.fur != null) { furFill(P, 0, 0, 64, 64, o.fur, 6); return; }
  if (o.plastic != null) { plasticFill(P, 0, 0, 64, 64, o.plastic); return; }
  P.cloth(0, 0, 64, 64, jeans ? 0xee : 0xf2, jeans ? 16 : 9, (o.seed || 1) + 9, jeans ? 1 : 0);
  // jambe : couture extérieure (col 24), pli de repassage (col 16), plis du genou, ourlet
  for (let v = 0; v < 64; v++) { P.shade(24, v, 0.84); if (o.crease) P.shade(16, v, 1.06); if (jeans) P.set(25, v, v % 2 ? 0xc88a3a : mul(P.get(25, v), 0.95), v % 2 ? 0 : 1); }
  if (jeans) for (let v = 6; v < 34; v++) for (let u = 12; u < 21; u++) P.shade(u, v, 1.05 + 0.04 * Math.sin(v * 0.4));
  for (const v of [33, 35, 38]) for (let u = 10; u < 22; u++) if ((u * 3 + v) % 5) P.shade(u, v, 0.88);
  for (let u = 0; u < 32; u++) { P.shade(u, 62, 0.86); P.shade(u, 63, 0.8); }
  if (o.cargo) { P.rect(19, 22, 10, 13, gray(0xb8), 1); P.fill(19, 22, 10, 3, gray(0xd0), 1); P.hline(19, 28, 25, gray(0xa8), 1); }
  if (o.bands) for (const v0 of o.bands) for (let u = 0; u < 32; u++) { P.set(u, v0, 0xc9c02a, 0); P.set(u, v0 + 1, 0xb8bcc0, 0); P.set(u, v0 + 2, 0xc9c02a, 0); }
  // hanches (32 × 32 en haut à droite) : devant col 40, côté +x col 48, dos col 56 ; braguette, poches
  const H = 32;
  for (let v = 0; v < 32; v++) { if (v < 20 && !o.skirtish) P.shade(H + 8, v, v < 18 ? 0.84 : 1); P.shade(H + 16, v, 0.86); P.shade(H, v, 0.86); }
  for (let v = 2; v < 14; v++) { P.shade(H + 2 + (v >> 2), v, 0.82); P.shade(H + 13 - (v >> 2), v, 0.82); }
  if (jeans) { for (const u0 of [H + 19, H + 25]) { P.rect(u0, 6, 5, 9, 0xc88a3a, 0); P.fill(u0 + 1, 7, 3, 7, mul(P.get(u0 + 1, 8), 1), 1); } }
  for (let u = H; u < H + 32; u += 5) { P.shade(u, 0, 0.8); P.shade(u, 1, 0.84); }
  for (let v = 30; v < 32; v++) for (let u = H; u < H + 32; u++) P.shade(u, v, 0.86);
  // ceinture (32 × 8 en bas à droite) : cuir, boucle au centre du devant (colonne 8)
  for (let v = 32; v < 40; v++) for (let u = H; u < H + 32; u++) P.set(u, v, mix(0x1a1a1a, 0x2a2622, hash2(u, v, 3)), 0);
  for (let u = H; u < H + 32; u++) { P.set(u, 32, 0x0e0e0e, 0); P.set(u, 39, 0x0e0e0e, 0); }
  P.rect(H + 6, 33, 5, 6, 0xb8b8b0, 0); P.set(H + 8, 35, 0xe0e0d8, 0);
  // bande de jupe (32 × 24, en bas à droite) : plis verticaux
  for (let v = 40; v < 64; v++) for (let u = H; u < H + 32; u++) P.set(u, v, gray(0xf0 - (u % 6 === 0 ? 26 : u % 6 === 1 ? 12 : 0) + (hash2(u, v, 5) - 0.5) * 8 - (v > 61 ? 22 : 0)), 1);
}
// ───────────────────────── chaussures (32 × 32 : talon → pointe, semelle aux bords) ─────────────────────────
export function paintShoe(P, k) {
  const sole = { sneaker: 0xf0f0ec, boot: 0x262222, clown: 0x2a2a2a, flat: 0x161010, shoe: 0x1c1a18 }[k] ?? 0x1c1a18;
  for (let v = 0; v < 32; v++) for (let u = 0; u < 32; u++) {
    const edge = u < 5 || u > 26;
    if (edge) P.set(u, v, mul(sole, u === 4 || u === 27 ? 0.8 : 0.95 + 0.08 * hash2(u, v)), 0);
    else P.set(u, v, gray((k === 'shoe' || k === 'flat' ? 0xe8 : 0xf0) + (hash2(u, v, 2) - 0.5) * 12 - (v < 4 ? 12 : 0)), 1);
  }
  if (k === 'sneaker') { for (let v = 13; v < 25; v += 2) for (let u = 13; u < 19; u++) P.set(u, v, (u + v) % 2 ? 0xf4f4f0 : 0xd8d8d4, 0); for (let v = 8; v < 26; v++) { P.set(7 + (v >> 3), v, 0xf2f2ee, 0); P.set(24 - (v >> 3), v, 0xf2f2ee, 0); } }
  if (k === 'shoe' || k === 'boot') { for (let v = 14; v < 24; v += 2) P.hline(14, 17, v, 0x2a2420, 0); for (let u = 8; u < 24; u++) P.shade(u, 26, 0.78); P.set(15, 29, 0xffffff, 0); }
  if (k === 'boot') for (let v = 0; v < 10; v++) for (let u = 5; u < 27; u++) P.shade(u, v, 0.86);
  if (k === 'clown') for (let v = 18; v < 32; v++) for (let u = 10; u < 22; u++) if (hash2(u, v, 7) > 0.85) P.set(u, v, 0xffd0d0, 0);
}
// ───────────────────────── mains et gants (32 × 32 : u en travers de la main, v du poignet au bout des doigts) ─────────────────────────
export function paintHand(P, k) {
  if (k === 'fur') { furFill(P, 0, 0, 32, 32, 0xb07434, 7); for (let v = 20; v < 32; v++) for (let u = 8; u < 24; u++) if (((u - 16) / 8) ** 2 + ((v - 26) / 6) ** 2 < 1) P.set(u, v, 0x4a2c18, 0); return; }
  if (k === 'plastic') { plasticFill(P, 0, 0, 32, 32, 0xe9e2d4); return; }
  const glove = k === 'glove';
  P.cloth(0, 0, 32, 32, glove ? 0xee : 0xf4, glove ? 10 : 6, 21);
  for (const v of [13, 20, 25]) for (let u = 2; u < 30; u++) if (u % 8 !== 0 && (glove ? (u + v) % 3 : true)) P.shade(u, v, v === 13 ? 0.86 : 0.9);
  for (let v = 13; v < 32; v++) for (const u of [8, 16, 24]) P.shade(u, v, 0.86);
  if (!glove) for (let v = 28; v < 32; v++) for (let u = 0; u < 32; u++) if (u % 8 > 1 && u % 8 < 7) P.set(u, v, gray(0xff), 1);
  if (glove) for (let v = 0; v < 4; v++) for (let u = 0; u < 32; u++) P.shade(u, v, u % 2 ? 0.8 : 0.92);
}
// ───────────────────────── matières (fourrure, plastique, peau, mèches, chair…) ─────────────────────────
function furFill(P, x0, y0, w, h, c, seed) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const n = hash2(x, y >> 1, seed), dirt = hash2(x >> 3, y >> 3, seed + 1) > 0.78 ? 0.72 : 1;
    P.set(x, y, mul(c, (0.78 + 0.34 * n) * dirt * (hash2(x, y, seed + 2) > 0.93 ? 0.7 : 1)), 0);
  }
}
function plasticFill(P, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) P.set(x, y, mul(c, hash2(x >> 2, y >> 2, 31) > 0.9 ? 0.9 : 0.98 + 0.04 * hash2(x, y, 3)), 0);
}
export const MATS = {
  skin: (P) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P.set(x, y, gray(0xf2 + (hash2(x, y, 41) - 0.5) * 10), 1); },
  white: (P) => P.fill(0, 0, 16, 16, 0xffffff, 1),
  // mèches : stries verticales, pointes plus sombres (teintées par la couleur des cheveux)
  hair: (P) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const s = hash2(x, 0, 51), n = hash2(x, y >> 2, 52); P.set(x, y, gray((0xd8 + 0x26 * s) * (0.9 + 0.12 * n) * (1 - 0.18 * (y / 32) ** 2)), 1); } },
  curly: (P) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const n = Math.sin(x * 1.3 + Math.sin(y * 0.9) * 2) * Math.sin(y * 1.1 + x * 0.3); P.set(x, y, gray(0xd8 + 0x24 * n + (hash2(x, y, 53) - 0.5) * 20), 1); } },
  bearFur: (P) => furFill(P, 0, 0, 32, 32, 0xb07434, 3),
  bearLight: (P) => furFill(P, 0, 0, 32, 32, 0xe2c08a, 4),
  plastic: (P) => plasticFill(P, 0, 0, 32, 32, 0xe9e2d4),
  joint: (P) => plasticFill(P, 0, 0, 16, 16, 0xb9b0a0),
  // peau décharnée : pâle, marbrures et veines
  gauntSkin: (P) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const b = hash2(x >> 2, y >> 2, 61), v = Math.abs(Math.sin(x * 0.7 + Math.sin(y * 0.5) * 3)) < 0.06; P.set(x, y, v ? 0x707a88 : mul(0xc9c0b2, 0.86 + 0.16 * b + (hash2(x, y, 62) - 0.5) * 0.06), 0); } },
  // côtes du rampant (torse 32 × 32 : devant 0-15, dos 16-31)
  ribs: (P) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { let k = 0.88 + 0.14 * hash2(x >> 1, y >> 1, 63) + (hash2(x, y, 64) - 0.5) * 0.05; const d = Math.abs(x - 8); if (y > 5 && y < 20 && y % 3 === 0 && d > 1 && d < 6 - (y > 14 ? 1 : 0)) k *= 0.8; if (d <= 1 && y > 4 && y < 18) k *= 1.06; if (x >= 16 && Math.abs(x - 24) < 1 && y % 2 === 0) k *= 1.12; if (y > 20 && y < 27 && d < 4) k *= 0.86; P.set(x, y, mul(0xc9c0b2, k), 0); } },
  // chair de la Chose : noire et luisante, veines rouges
  flesh: (P) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const v = Math.abs(Math.sin(x * 0.55 + Math.sin(y * 0.35) * 2.4)) < 0.09 || Math.abs(Math.sin(y * 0.6 + Math.sin(x * 0.3) * 2)) < 0.05; P.set(x, y, v ? mix(0x5a0c0c, 0x8a1a14, hash2(x, y, 71)) : mul(0x161214, 0.8 + 0.5 * hash2(x >> 1, y >> 1, 72)), 0); } },
  catFur: (P) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) P.set(x, y, mix(0x1c1b1d, 0x34302e, hash2(x, y >> 1, 81) * 0.8), 0); },
  ratFur: (P) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) P.set(x, y, mix(0x4c4540, 0x8a7f76, (y > 22 ? 0.6 : 0) + hash2(x, y >> 1, 82) * 0.35), 0); },
  pink: (P) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P.set(x, y, mix(0xb08888, 0xc8a0a0, hash2(x, y, 83)), 0); },
  metal: (P) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P.set(x, y, gray(0xc8 + 0x30 * (y < 3 ? 1 : 0) - (hash2(x, y, 84) * 20)), 1); },
  // drap de fantôme : plis, trous des yeux (case 64 × 64 : le haut de la tête en haut)
  sheet: (P) => { for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) P.set(x, y, gray(0xf0 - 14 * (0.5 + 0.5 * Math.sin(x * 0.8 + y * 0.12)) + (hash2(x, y, 91) - 0.5) * 8), 0); for (const cx of [26, 37]) for (let y = 8; y < 14; y++) for (let x = cx - 3; x <= cx + 2; x++) if (((x + 0.5 - cx) / 3) ** 2 + ((y - 10.8) / 3) ** 2 < 1) P.set(x, y, 0x080808, 0); },
  // tablier (teinté) : poche ventrale, liseré
  apron: (P) => { P.cloth(0, 0, 32, 32, 0xf4, 8, 93); P.rect(9, 18, 14, 7, gray(0xc8), 1); P.vline(16, 18, 24, gray(0xc8), 1); for (let y = 0; y < 32; y++) { P.shade(0, y, 0.82); P.shade(31, y, 0.82); } },
};
export const MAT_SIZE = { skin: 16, white: 16, joint: 16, pink: 16, metal: 16, sheet: 64 };
export function mat(name, pg = 0) { const s = MAT_SIZE[name] || 32; return tile('mat|' + name, s, s, MATS[name], pg); }

// ───────────────────────── couvre-chefs (32 × 32) ─────────────────────────
export function paintHat(P, k) {
  if (k === 'cap' || k === 'capGuard' || k === 'capDelivery') {
    P.cloth(0, 0, 32, 32, 0xf0, 10, 101);
    for (let x = 0; x < 32; x += 5) for (let y = 4; y < 24; y++) P.shade(x, y, 0.86); // coutures des pans
    for (let x = 0; x < 32; x++) { P.shade(x, 24, 0.8); for (let y = 25; y < 32; y++) P.shade(x, y, 0.78); } // visière (dessous)
    if (k === 'capGuard') { const g = 0xd4af37; P.fill(14, 14, 4, 5, g, 0); P.set(15, 15, 0x7a1c1c, 0); P.set(16, 15, 0x7a1c1c, 0); P.set(14, 14, mul(g, 0.7), 0); }
    if (k === 'capDelivery') { P.disc(16, 16, 3.5, 0xf4f4f0, 0); P.text('P', 16, 14, 0xc62828, 0); }
  }
  if (k === 'police') { // casquette de police : calot marine, bandeau noir à galon argent, écusson
    P.cloth(0, 0, 32, 32, 0xf0, 8, 102);
    for (let x = 0; x < 32; x++) { for (let y = 14; y < 22; y++) P.set(x, y, mix(0x121418, 0x1a1c22, hash2(x, y)), 0); P.set(x, 15, x % 2 ? 0xb8bcc0 : 0x8a8e92, 0); P.set(x, 20, 0x8a8e92, 0); }
    P.fill(14, 10, 4, 4, 0xc4c8cc, 0); P.set(15, 11, 0x1a2a6a, 0); P.set(16, 11, 0xc62828, 0);
    for (let x = 0; x < 32; x++) for (let y = 23; y < 32; y++) P.set(x, y, mix(0x0c0c0e, 0x2a2c30, y === 23 ? 0.8 : 0.1), 0);
  }
  if (k === 'firehelmet') { // casque de sapeur-pompier : coque teintée et brillante, bande réfléchissante, écusson
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) P.set(x, y, gray(0xf0 + 10 * Math.sin(x * 0.4) - (y > 26 ? 30 : 0)), 1);
    for (let x = 0; x < 32; x++) { P.set(x, 18, 0xc9c02a, 0); P.set(x, 19, 0xb8bcc0, 0); P.set(x, 20, 0xc9c02a, 0); }
    P.fill(14, 9, 4, 5, 0xc0a040, 0); P.set(15, 10, 0xc62828, 0); P.set(16, 11, 0xc62828, 0);
  }
  if (k === 'visor') { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) P.set(x, y, mix(0xb8922a, 0xf0d070, Math.max(0, 1 - Math.hypot(x - 10, y - 10) / 9) * 0.8), 0); }
  if (k === 'helmet') { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) P.set(x, y, gray(0xe8 + (hash2(x, y, 104) - 0.5) * 10), 0); for (let x = 0; x < 32; x++) P.set(x, 30, 0x90a4ae, 0); }
}
// ───────────────────────── tête de Bobby (64 × 64 : projection de tête ; museau, yeux boutons, couture du sourire) ─────────────────────────
export function paintBearHead(P) {
  furFill(P, 0, 0, 64, 64, 0xb07434, 11);
  const cream = 0xe2c08a;
  // museau clair (bas du visage)
  for (let v = 30; v < 58; v++) for (let u = 18; u < 46; u++) { const r = ((u - 31.5) / 13) ** 2 + ((v - 44) / 13) ** 2; if (r < 1) P.set(u, v, mul(cream, 0.86 + 0.18 * hash2(u, v >> 1, 12) - (r > 0.8 ? 0.12 : 0)), 0); }
  // yeux boutons : noirs, reflet terne, fil de couture ; l'un pend
  for (const [cx, cy] of [[23.5, 25], [40.5, 27]]) { P.disc(cx, cy, 3.6, 0x0c0a0a, 0); P.disc(cx, cy, 2.2, 0x1c1814, 0); P.set(cx - 1, cy - 2, 0x6a6460, 0); P.set(cx - 1, cy, 0x4a3a30, 0); P.set(cx + 1, cy, 0x4a3a30, 0); }
  P.vline(40, 30, 32, 0x2a1a10, 0);
  // truffe
  for (let v = 35; v < 41; v++) for (let u = 27; u < 37; u++) if (Math.abs(u - 31.5) < 5 - (v - 35) * 0.7) P.set(u, v, mix(0x141010, 0x2a2420, hash2(u, v)), 0);
  P.set(30, 36, 0x5a5450, 0);
  // sourire cousu, trop large, dents jaunies
  for (let u = 19; u <= 44; u++) { const v = Math.round(48 + 4 * Math.cos((u - 31.5) / 13 * Math.PI / 2) * -1 + 4); P.set(u, v, 0x1a0c08, 0); if (u % 2 === 0 && u > 21 && u < 42) { P.set(u, v - 1, 0xd8cca0, 0); P.set(u, v + 1, 0xc8b888, 0); } }
  P.vline(31, 41, 47, 0x2a1a10, 0); P.vline(32, 41, 47, 0x2a1a10, 0);
  for (let u = 20; u <= 43; u += 3) { P.set(u, 47, 0x2a1a10, 0); P.set(u, 55, 0x2a1a10, 0); }
  // taches, accroc recousu sur le front
  for (let v = 8; v < 16; v++) { P.set(44 + (v & 1), v, 0x3a2412, 0); if (v % 2 === 0) { P.set(43, v, 0x2a1a10, 0); P.set(46, v, 0x2a1a10, 0); } }
  for (let k = 0; k < 40; k++) { const u = Math.floor(hash2(k, 1, 13) * 64), v = Math.floor(hash2(k, 2, 13) * 64); P.shade(u, v, 0.7); P.shade(u + 1, v, 0.75); }
}
// haut du costume d'ours (128 × 64) : fourrure, ventre clair cousu, fermeture éclair dans le dos, accroc recousu
export function paintBearTop(P) {
  furFill(P, 0, 0, 128, 64, 0xb07434, 5);
  const cream = 0xe2c08a;
  for (let v = 10; v < 60; v++) for (let u = 12; u < 52; u++) { const r = ((u - 31.5) / 19) ** 2 + ((v - 35) / 24) ** 2; if (r < 1) P.set(u, v, mul(cream, 0.86 + 0.18 * hash2(u, v >> 1, 2)), 0); else if (r < 1.1 && (u + v) % 3 === 0) P.set(u, v, 0x3a2412, 0); }
  for (let v = 2; v < 54; v++) { P.set(96, v, v % 2 ? 0x9a9a98 : 0x5a5a58, 0); P.set(95, v, 0x2a1a10, 0); P.set(97, v, 0x2a1a10, 0); }
  for (let k = 0; k < 5; k++) { P.set(38 + k * 2, 20 - k, 0x2a1a10, 0); P.set(39 + k * 2, 21 - k, 0xe8e2d0, 0); }
}
// ───────────────────────── chat (32 × 32 : face) ─────────────────────────
export function paintCatFace(P) {
  MATS.catFur(P);
  for (const cx of [10.5, 21.5]) { P.disc(cx, 13, 3, 0x7ac83a, 0); P.disc(cx, 13, 1.6, 0x9cff57, 0); P.vline(Math.floor(cx), 10, 16, 0x050505, 0); }
  P.fill(15, 20, 2, 2, 0x2a1c1e, 0); P.set(15, 22, 0x2a1c1e, 0); P.set(16, 22, 0x2a1c1e, 0);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) P.hline(s < 0 ? 3 : 20, s < 0 ? 11 : 28, 21 + k * 2 - (k === 1 ? 0 : 0), 0x8a8680, 0);
}
