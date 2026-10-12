// Fabrique de formes des objets : chaque définition d'objet (js/data/items.js) est « cuite » en une seule
// BufferGeometry (couleurs par sommet + UV dans l'atlas d'étiquettes), mise en cache par id d'objet.
// Origine = centre de la boîte englobante (s[0], s[1], s[2]). meta : points d'ancrage (écran, porte, lumière…).
// Emballages : les faces étiquetées reçoivent une étiquette en couleurs réelles (atlas.pack) et un sommet blanc ;
// champs de définition utilisés : b (marque), l / label (nom imprimé), sub (variante, poids), pi (pictogramme),
// lc (fond de l'étiquette, sinon c), c2 (accent / bouchon / couvercle), pc (couleur du pictogramme), lay (mise
// en page), lk (type d'étiquette), sil (silhouette de bouteille), pk ({of, nx, nz} : lots et présentoirs).
// Budget : petits articles ≤ ~150 sommets (les étiquettes portent le détail).
import * as THREE from 'three';
import { GeoBuilder } from '../engine/geo.js';
import { mulberry32 } from '../engine/rng.js';
import { ITEMS } from '../data/items.js';

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

const _col = new THREE.Color(), _tv = new THREE.Vector3(), _tn = new THREE.Vector3();
function lin(c) { if (Array.isArray(c)) return c; _col.set(c); return [_col.r, _col.g, _col.b]; } // sRGB → linéaire (comme GeoBuilder)
const DENS = 420; // pixels d'étiquette par mètre de face
// Densité relative par type d'étiquette (cartons, bords unis et tissus n'ont pas besoin de détails fins)
const KDENS = { case: 0.5, plain: 0.6, fabric: 0.45, tray: 0.6, garment: 0.75, media: 0.8, device: 0.8, toybox: 0.8, card: 0.85, news: 0.8, mag: 0.85, spines: 0.85, book: 0.9, wrap: 0.92, box: 0.92 };
// Taille en pixels d'une étiquette fw × fh m : densité constante jusqu'à ~104 px, puis croissance ralentie (×0.4),
// plafond 176 px ; le rapport largeur/hauteur est conservé (texte non déformé).
function labelPx(kind, fw, fh, lo = 20) {
  const k = DENS * (KDENS[kind] ?? 1); const w0 = fw * k, h0 = fh * k, m = Math.max(w0, h0, 1);
  const t = Math.min(176, m <= 104 ? m : 104 + (m - 104) * 0.4), sc = t / m;
  return [Math.max(lo, Math.round(w0 * sc)), Math.max(lo, Math.round(h0 * sc))];
}
function mixc(a, b, t) { return (Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) | (Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) | Math.round((a & 255) * (1 - t) + (b & 255) * t); }
// Informations de dessin d'une étiquette à partir de la définition
function packInfo(d, kind, extra) {
  return Object.assign({ kind, brand: d.b, name: d.l ?? d.label ?? d.name, sub: d.sub, picto: d.pi, bg: d.lc ?? d.c, fg: d.fg, accent: d.c2, pc: d.pc, layout: d.lay, promo: d.promo, pat: d.pat, style: d.gs, n: d.pn, photo: d.photo }, extra);
}

// Kit de construction relatif au centre de l'objet
class Kit {
  constructor(b, atlas) { this.b = b; this.atlas = atlas; this.white = atlas.white(); this.meta = {}; this.T = null; this.N = null; this.lod = 0; }
  // ── primitives brutes (sommets poussés directement, normales et UV maîtrisées) ──
  setT(m) { this.T = m || null; this.N = m ? new THREE.Matrix3().getNormalMatrix(m) : null; return this; }
  vtx(x, y, z, nx, ny, nz, u, v, col) {
    if (this.T) { _tv.set(x, y, z).applyMatrix4(this.T); x = _tv.x; y = _tv.y; z = _tv.z; _tn.set(nx, ny, nz).applyMatrix3(this.N).normalize(); nx = _tn.x; ny = _tn.y; nz = _tn.z; }
    this.b._pushVert(x, y, z, nx, ny, nz, u, v, col);
  }
  // quadrilatère vu de l'extérieur : p0 bas-gauche, p1 bas-droite, p2 haut-droite, p3 haut-gauche (texte lisible)
  quad(p0, p1, p2, p3, c, r) {
    r = r || this.white; const col = lin(c);
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const o = this.b.vertexCount;
    this.vtx(p0[0], p0[1], p0[2], nx, ny, nz, r.u0, r.v0, col); this.vtx(p1[0], p1[1], p1[2], nx, ny, nz, r.u1, r.v0, col);
    this.vtx(p2[0], p2[1], p2[2], nx, ny, nz, r.u1, r.v1, col); this.vtx(p3[0], p3[1], p3[2], nx, ny, nz, r.u0, r.v1, col);
    this.b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    return this;
  }
  // boîte à étiquettes par face (F : rectangles UV, C : couleurs ; une face étiquetée est blanche par défaut). skip : faces omises
  pbox(x, y, z, w, h, d, c, F = {}, C = {}, skip = '') {
    const hx = w / 2, hy = h / 2, hz = d / 2, P = (a, b, e) => [x + a * hx, y + b * hy, z + e * hz];
    const col = (f) => C[f] ?? (F[f] ? 0xffffff : c);
    if (!skip.includes('Z')) this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), col('Z'), F.Z);
    if (!skip.includes('z')) this.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), col('z'), F.z);
    if (!skip.includes('X')) this.quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), col('X'), F.X);
    if (!skip.includes('x')) this.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), col('x'), F.x);
    if (!skip.includes('Y')) this.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), col('Y'), F.Y);
    if (!skip.includes('y')) this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), col('y'), F.y);
    return this;
  }
  // Surface de révolution. rings : [{r, rz?, y, p}] du bas vers le haut ; p = partie du segment qui MÈNE à cet
  // anneau ; parts : {clé: {c, rect}}. L'avant (+z) est au milieu de l'étiquette (u = 0,5). Une bande d'étiquette
  // couvre toute la longueur de sa suite de segments. o.bottom / o.top : couleur des fonds (null = ouvert),
  // o.topRect : étiquette du dessus (disque).
  lathe(rings, segs, parts, o = {}) {
    const n = rings.length, P = (i, j) => { const R = rings[i], f = 2 * Math.PI * (j / segs - 0.5); return [Math.max(1e-4, R.r) * Math.sin(f), R.y, Math.max(1e-4, R.rz ?? R.r) * Math.cos(f)]; };
    const nor = (i, j) => {
      const a = P(i, (j + 1) % segs), b = P(i, (j - 1 + segs) % segs), up = P(Math.min(n - 1, i + 1), j), dn = P(Math.max(0, i - 1), j);
      const tx = a[0] - b[0], ty = a[1] - b[1], tz = a[2] - b[2], ux = up[0] - dn[0], uy = up[1] - dn[1], uz = up[2] - dn[2];
      let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux; const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return [0, i === 0 ? -1 : 1, 0]; return [nx / l, ny / l, nz / l];
    };
    let k = 1;
    while (k < n) {
      const pk = rings[k].p; let e = k; while (e + 1 < n && rings[e + 1].p === pk) e++;
      const part = parts[pk] || { c: 0xffffff }; const r = part.rect || this.white; const col = lin(part.c ?? 0xffffff);
      const y0 = rings[k - 1].y, y1 = rings[e].y, base = this.b.vertexCount;
      for (let i = k - 1; i <= e; i++) {
        const t = y1 > y0 ? (rings[i].y - y0) / (y1 - y0) : 0, vv = r.v0 + (r.v1 - r.v0) * t;
        for (let j = 0; j <= segs; j++) { const p = P(i, j % segs), nn = nor(i, j % segs); this.vtx(p[0], p[1], p[2], nn[0], nn[1], nn[2], r.u0 + (r.u1 - r.u0) * (j / segs), vv, col); }
      }
      const rowN = segs + 1;
      for (let i = 0; i < e - k + 1; i++) for (let j = 0; j < segs; j++) { const a = base + i * rowN + j, b = a + 1, c2 = a + rowN + 1, d = a + rowN; this.b.idx.push(a, b, c2, a, c2, d); }
      k = e + 1;
    }
    const cap = (i, color, up, rect) => {
      if (color == null) return; const col = lin(color), o = this.b.vertexCount;
      for (let j = 0; j < segs; j++) {
        const p = P(i, j); let u = 0, v = 0;
        if (rect) { const f = 2 * Math.PI * (j / segs - 0.5); u = rect.u0 + (rect.u1 - rect.u0) * (0.5 + 0.5 * Math.sin(f)); v = rect.v0 + (rect.v1 - rect.v0) * (0.5 + 0.5 * Math.cos(f) * (up ? -1 : 1)); } else { u = this.white.u0; v = this.white.v0; }
        this.vtx(p[0], p[1], p[2], 0, up ? 1 : -1, 0, u, v, col);
      }
      for (let j = 1; j < segs - 1; j++) up ? this.b.idx.push(o, o + j, o + j + 1) : this.b.idx.push(o, o + j + 1, o + j);
    };
    cap(0, o.bottom, false, o.bottomRect); cap(n - 1, o.top, true, o.topRect);
    return this;
  }
  // Ellipsoïde basse définition (segs × rings), via lathe
  blob(x, y, z, rx, ry, rz, c, segs = 6, rings = 4) {
    const R = []; for (let i = 0; i <= rings; i++) { const t = Math.PI * i / rings; R.push({ r: rx * Math.sin(t), rz: rz * Math.sin(t), y: -ry * Math.cos(t), p: 'a' }); }
    const T = this.T; const m = new THREE.Matrix4().makeTranslation(x, y, z); this.setT(T ? T.clone().multiply(m) : m);
    this.lathe(R, segs, { a: { c } }); this.setT(T);
    return this;
  }
  // Cylindre basse définition (axe y), étiquette facultative sur le flanc
  tube(x, y, z, r, h, c, segs = 8, o = {}) {
    const T = this.T; const m = new THREE.Matrix4().makeTranslation(x, y, z); if (o.m) m.multiply(o.m); this.setT(T ? T.clone().multiply(m) : m);
    this.lathe([{ r, rz: o.rz, y: -h / 2 }, { r: o.r1 ?? r, rz: o.rz1 ?? o.rz, y: h / 2, p: 'a' }], segs, { a: { c: o.rect ? 0xffffff : c, rect: o.rect } }, { bottom: o.open ? null : (o.bc ?? c), top: o.open ? null : (o.tc ?? c), topRect: o.topRect });
    this.setT(T); return this;
  }
  // Copie d'une géométrie déjà cuite (couleurs et UV conservées) avec une matrice
  copyGeo(g, m) {
    const P = g.attributes.position, N = g.attributes.normal, Uv = g.attributes.uv, Co = g.attributes.color; const o = this.b.vertexCount;
    const T = this.T; this.setT(T ? T.clone().multiply(m) : m);
    const pa = P.array, na = N.array, ua = Uv.array, ca = Co ? Co.array : null, cc = [1, 1, 1]; // accès directs, couleur réutilisée (copiée par _pushVert)
    for (let i = 0, j = 0; i < P.count; i++, j += 3) { if (ca) { cc[0] = ca[j]; cc[1] = ca[j + 1]; cc[2] = ca[j + 2]; } this.vtx(pa[j], pa[j + 1], pa[j + 2], na[j], na[j + 1], na[j + 2], ua[i * 2], ua[i * 2 + 1], cc); }
    for (let i = 0; i < g.index.count; i++) this.b.idx.push(o + g.index.getX(i));
    this.setT(T); return this;
  }
  // étiquette d'emballage en couleurs réelles pour une face de fw × fh mètres
  pk(d, kind, fw, fh, extra = {}, key = null, lo = 20) { if (!this.atlas.pack) return this.white; const [w, h] = labelPx(kind, fw, fh, lo); return this.atlas.pack(key || (d.id + ':' + kind), w, h, packInfo(d, kind, extra)); }
  shared(key, w, h, info) { return this.atlas.pack ? this.atlas.pack(key, w, h, info) : this.white; }
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
// Formes ajoutées par d'autres modules (décor du centre…) : fn(kit, s, couleur, définition)
export function registerShape(names, fn) { S(names, fn); }

// ───────── génériques ─────────
// Habillage des anciens articles étiquetés (emballages en couleurs réelles) : type d'étiquette, marque, pictogramme
const LEGACY = {
  cereal: ['box', 'Matinal', 'bowl'], bread: ['box', 'Fournil Doré', 'bread'], chocolate: ['box', 'Mireille', 'choco'], pasta: ['box', 'Pastavia', 'pasta'],
  frozen_pizza: ['box', 'Grand Froid', 'pizza'], sugar: ['box', 'Sucrerie du Nord', 'sparkle'], coffee_pack: ['box', 'Arôme Noir', 'bean'], tea: ['box', 'Thé des Brumes', 'tea'],
  macarons: ['box', 'Maison Rose', 'heart'], nuggets: ['box', 'Big Burger', 'chicken'], lego: ['toybox', 'Joué-Club Hélios', 'cube'], puzzle: ['toybox', 'Ravenel', 'puzzle'],
  board_game: ['toybox', 'Jeux Lunaires', 'ghost'], toy_blocks: ['box', 'Bois & Malice', 'cube'], light_bulbs: ['box', 'Lumina', 'bulb'], game_box: ['media', 'PIXEL', 'pad'],
  shoe_box: ['shoebox', 'Pas de Deux'], candle_set: ['box', 'Cire & Mèche', 'flame'], pizza_box: ['box', 'Pizzeria Napoli', 'pizza'], cardboard_box: ['case', 'HÉLIOS'],
  soda: ['wrap', 'Hélios', 'bubbles'], lemonade: ['wrap', 'Limonaderie Dubois', 'lemon'], energy_drink: ['wrap', 'VOLT', 'bolt'], canned_food: ['wrap', 'Bonne Table', 'soup'],
  hot_ravioli: ['wrap', 'Bonne Table', 'soup'], green_tea: ['wrap', 'Zen', 'leaf'], deodorant: ['wrap', 'Fraîcheur Alpine', 'snow'], hair_spray: ['wrap', 'Tif\'Hair', 'sparkle'],
  air_horn: ['wrap', 'Tonnerre', 'bolt'], paint_can: ['wrap', 'Couleurs Martin', 'paint'], milk: ['box', 'Laiterie Clément', 'cow'], juice: ['box', 'Fruitéa', 'orange'],
  chips: ['bag', 'Croustil', 'chips'], flour: ['bag', 'Moulin de Lune', 'wheat'], cat_food: ['bag', 'Miaou', 'cat'], ice_bag: ['bag', 'Banquise', 'snow'], marshmallow: ['bag', 'Sucrette', 'candy'],
  bird_seed: ['bag', 'Arche de Noé', 'wheat'], water: ['wrap', 'Source des Aiguilles', 'mountain'], bleach: ['wrap', 'Javelor', 'sparkle'], cough_syrup: ['wrap', 'Pharmalys', 'cross'],
  sanitizer: ['wrap', 'Pharmalys', 'drop'], sunscreen: ['wrap', 'Soleil d\'Été', 'sun'], wd40: ['wrap', 'Dégripp\'Tout', 'tool'], shampoo: ['wrap', 'Brillance', 'drop'],
  contact_lens: ['wrap', 'Clairvoyance', 'eye'], ketchup: ['wrap', 'Tomatissima', 'tomato'], baby_bottle: ['wrap', 'Bébé Câlin', 'baby'], honey: ['wrap', 'Rucher du Val', 'flower'],
  jam: ['wrap', 'Mère Odile', 'strawberry'], vitamins: ['wrap', 'Pharmalys', 'orange'], fish_food: ['wrap', 'Arche de Noé', 'fish'], detergent: ['wrap', 'Lave+', 'sparkle'],
};
const LEG = (d) => LEGACY[d.id] || [];
const legacyInfo = (d, extra = {}) => { const L = LEG(d); return { brand: d.b ?? L[1], picto: d.pi ?? L[2], name: d.l ?? d.label ?? d.name, ...extra }; };
S('box', (k, s, c) => k.box(0, 0, 0, s[0], s[1], s[2], c));
S('labelbox', (k, s, c, d) => {
  const L = LEG(d), kind = d.lk || L[0] || (d.use === 'scatter' || d.use === 'read' ? 'toybox' : 'box');
  if (kind === 'eggs' || d.id === 'eggs') { k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Y: k.pk(d, 'eggs', s[0], s[2], { brand: 'Ferme du Coq', name: 'x6', nx: 3 }), Z: k.pk(d, 'plain', s[0], s[1], { bg: c, brand: 'ŒUFS FRAIS' }, d.id + ':edge') }); return; }
  const flat = s[1] < Math.min(s[0], s[2]) * 0.45;
  if (flat) { const r = k.pk(d, kind, s[0], s[2], legacyInfo(d)); const e = k.pk(d, 'plain', s[0], s[1], { bg: c, brand: legacyInfo(d).brand || d.label }, d.id + ':edge'); k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Y: r, Z: e, z: e }); return; }
  const r = k.pk(d, kind, s[0], s[1], legacyInfo(d)); k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Z: r, z: kind === 'shoebox' || kind === 'case' ? r : r, ...(kind === 'case' ? { X: r, x: r, Y: k.shared('casetop', 64, 64, { kind: 'casetop' }) } : {}) });
});
S('cyl', (k, s, c) => k.cylS(0, 0, 0, s[0] / 2, s[1], s[2] / 2, c));
S('sphere', (k, s, c) => k.sph(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c, s[0] < 0.2));
const CARD = { postcard: ['card', 'Hélios', 'sun', 'Bons baisers d\'Hélios'], scratch_card: ['card', 'FDJ Hélios', 'star', 'MILLIONNAIRE'], lottery: ['card', 'Loto Hélios', 'star', 'LOTO'], seeds: ['box', 'Jardins de Lune', 'flower', 'Belle-de-nuit'], movie_poster: ['media', '', 'skull', 'LA NUIT DES MANNEQUINS'], ticket: ['price', '', null, 'CINÉ HÉLIOS · SALLE 1'] };
S('card', (k, s, c, d) => {
  const C = CARD[d.id]; const r = C ? k.pk(d, C[0], s[0], s[1], { brand: C[1], picto: C[2], name: C[3], sub: d.id === 'ticket' ? '23 H 00 · M13' : C[0] === 'card' ? 'Centre Commercial Hélios' : undefined, bg: d.lc ?? (C[0] === 'card' ? c : undefined) }) : d.label ? k.label(d.id, d.label, c) : null;
  if (C) { k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Z: r, z: d.id === 'movie_poster' ? r : null }); return; }
  k.box(0, 0, 0, s[0], s[1], s[2], c, r ? { label: { face: 'zZ', rect: r } } : {});
});
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
S('battery', (k, s, c) => { const r = s[2] / 2, h = s[1]; for (const sx of [-1, 1]) { k.setT(new THREE.Matrix4().makeTranslation(sx * s[0] * 0.25, 0, 0)); k.lathe([{ r, y: -h / 2 }, { r, y: h * 0.3, p: 'a' }, { r, y: h / 2, p: 'k' }], 8, { a: { c }, k: { c: 0x222222 } }, { bottom: 0x9e9e9e, top: 0xbdbdbd }); k.setT(null); } });
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
S('jerrycan', (k, s, c, d) => { const r = d.label || d.b ? k.pk(d, 'box', s[0], s[1] * 0.7, legacyInfo(d, { layout: 3 })) : null; k.pbox(0, -s[1] * 0.05, 0, s[0], s[1] * 0.9, s[2], c, r ? { Z: r, z: r } : {}); k.box(0, s[1] * 0.45, -s[2] * 0.1, s[0] * 0.5, s[1] * 0.08, s[2] * 0.3, shade(c, 0.7)); k.cyl(s[0] * 0.3, s[1] * 0.45, 0, 0.02, 0.06, 0x222222); });
S('bulb', (k, s, c) => { k.sph(0, s[1] * 0.12, 0, s[0] / 2, s[0] / 2, s[0] / 2, c); k.cyl(0, -s[1] * 0.3, 0, s[0] * 0.22, s[1] * 0.3, 0xb0b0b0); });
S('sensor', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.sph(0, 0, s[2] / 2, s[0] * 0.3, s[0] * 0.3, s[0] * 0.15, 0x888888); k.box(s[0] * 0.3, s[1] * 0.35, s[2] / 2, 0.008, 0.008, 0.004, 0xff0000); });
S('camera', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2] * 0.7, c); k.cyl(0, 0, s[2] * 0.4, s[1] * 0.32, s[2] * 0.3, 0x111111, Math.PI / 2); k.cyl(0, 0, s[2] * 0.56, s[1] * 0.24, 0.004, 0x223344, Math.PI / 2); k.meta.lens = [0, 0, s[2] * 0.56]; });
S('rccar', (k, s, c) => { k.box(0, 0.01, 0, s[0] * 0.8, s[1] * 0.45, s[2] * 0.8, c); k.box(0, s[1] * 0.3, -s[2] * 0.05, s[0] * 0.6, s[1] * 0.35, s[2] * 0.4, shade(c, 0.6)); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(x * s[0] * 0.42, -s[1] * 0.2, z * s[2] * 0.32, s[1] * 0.3, s[0] * 0.15, 0x111111, 0, 0, Math.PI / 2); k.box(s[0] * 0.3, s[1] * 0.5, -s[2] * 0.3, 0.005, 0.15, 0.005, 0x222222); });
S('remote', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.cyl(-s[0] * 0.25, s[1] * 0.5, 0, 0.012, 0.03, 0x666666); k.cyl(s[0] * 0.25, s[1] * 0.5, 0, 0.012, 0.03, 0x666666); k.cyl(s[0] * 0.4, s[1] * 0.5 + 0.06, -s[2] * 0.4, 0.003, 0.15, 0x222222); });
S('walkie', (k, s, c) => { k.box(0, 0, 0, s[0], s[1] * 0.8, s[2], c); k.cyl(s[0] * 0.3, s[1] * 0.5, 0, 0.006, s[1] * 0.3, 0x111111); k.box(0, s[1] * 0.2, s[2] / 2, s[0] * 0.7, s[1] * 0.2, 0.003, 0x445544); });
S('phone', (k, s, c, d) => { if (d.id === 'toy_phone') { k.box(0, -s[1] * 0.2, 0, s[0], s[1] * 0.6, s[2], c); k.cylS(0, s[1] * 0.25, 0, s[0] * 0.5, s[2] * 0.4, s[1] * 0.2, 0xffeb3b, 0, 0, Math.PI / 2); return; } k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, 0, s[2] / 2, s[0] * 0.9, s[1] * 0.9, 0.002, 0x0a1220); k.meta.screen = { x: 0, y: 0, z: s[2] / 2 + 0.002, w: s[0] * 0.9, h: s[1] * 0.9 }; });
S('tablet', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, 0, s[2] / 2, s[0] * 0.92, s[1] * 0.88, 0.002, 0x0a1220); k.meta.screen = { x: 0, y: 0, z: s[2] / 2 + 0.002, w: s[0] * 0.92, h: s[1] * 0.88 }; });
S('ladder', (k, s, c) => { for (const x of [-1, 1]) k.box(x * s[0] * 0.45, 0, 0, 0.04, s[1], 0.06, c); for (let i = 0; i < 5; i++) k.box(0, -s[1] / 2 + 0.25 + i * 0.3, 0, s[0] * 0.9, 0.03, 0.1, shade(c, 0.85)); });
S('can', (k, s, c, d) => {
  const aero = ['deodorant', 'hair_spray', 'air_horn'].includes(d.id), paint = d.use === 'paint';
  const r = k.pk(d, 'wrap', Math.PI * s[0] * 0.5 + Math.PI * s[2] * 0.5, s[1] * (aero ? 0.7 : 0.92), legacyInfo(d, { bg: d.lc ?? c, name: d.label || d.l || d.name }));
  const h = s[1], R = s[0] / 2, Rz = s[2] / 2;
  if (aero) { k.lathe([{ r: R, rz: Rz, y: -h / 2 }, { r: R, rz: Rz, y: h * 0.22, p: 'l' }, { r: R * 0.7, rz: Rz * 0.7, y: h * 0.32, p: 'm' }], 10, { l: { c: 0xffffff, rect: r }, m: { c: 0xc0c0c0 } }, { bottom: 0xa0a0a0 }); k.tube(0, h * 0.4, 0, R * 0.72, h * 0.18, d.c2 ?? shade(c, 0.8), 8); return; }
  k.lathe([{ r: R, rz: Rz, y: -h / 2 }, { r: R, rz: Rz, y: h / 2, p: 'l' }], paint ? 12 : 10, { l: { c: 0xffffff, rect: r } }, { bottom: 0xa8a8a8, top: paint ? 0xb0b0b0 : 0xc8c8c8 });
  if (paint) k.box(0, h * 0.5 + 0.004, 0, R * 1.6, 0.006, 0.01, 0x9e9e9e);
});
S('candle', (k, s, c) => { k.tube(0, -s[1] * 0.05, 0, s[0] / 2, s[1] * 0.9, c, 10, { tc: shade(c, 0.92) }); k.tube(0, s[1] * 0.45, 0, 0.003, s[1] * 0.1, 0x222222, 3, { open: true }); k.meta.flame = [0, s[1] * 0.55, 0]; });

// ───────── jouets ─────────
S('plush', (k, s, c, d) => {
  const w = s[0], h = s[1];
  k.blob(0, -h * 0.18, 0, w * 0.42, h * 0.32, s[2] * 0.45, c, 9, 5); // corps
  k.blob(0, h * 0.25, 0, w * 0.33, h * 0.24, s[2] * 0.4, c, 9, 5); // tête
  if (d.id === 'bunny_plush') { k.blob(-w * 0.12, h * 0.48, 0, w * 0.06, h * 0.16, w * 0.05, c, 6, 3); k.blob(w * 0.12, h * 0.48, 0, w * 0.06, h * 0.16, w * 0.05, c, 6, 3); }
  else if (d.id === 'dino_plush') { k.blob(0, -h * 0.15, -s[2] * 0.5, w * 0.12, h * 0.12, s[2] * 0.35, c, 6, 4); }
  else if (d.id === 'boxing_gloves') { k.b.pos.length = k.b.nor.length = k.b.uv.length = k.b.col.length = k.b.idx.length = 0; k.blob(0, 0, 0, w * 0.5, h * 0.5, s[2] * 0.5, c, 10, 6); k.blob(w * 0.42, h * 0.05, s[2] * 0.15, w * 0.18, h * 0.2, s[2] * 0.2, c, 6, 3); k.tube(0, -h * 0.45, -s[2] * 0.1, w * 0.3, h * 0.15, 0xfafafa, 8); return; }
  else { k.blob(-w * 0.24, h * 0.42, 0, w * 0.1, w * 0.1, w * 0.06, c, 6, 3); k.blob(w * 0.24, h * 0.42, 0, w * 0.1, w * 0.1, w * 0.06, c, 6, 3); }
  k.blob(0, h * 0.2, s[2] * 0.33, w * 0.13, h * 0.09, s[2] * 0.1, shade(c, 1.35), 6, 3); // museau
  k.blob(-w * 0.11, h * 0.3, s[2] * 0.33, 0.012 + w * 0.02, 0.012 + w * 0.02, 0.01, 0x111111, 5, 2);
  k.blob(w * 0.11, h * 0.3, s[2] * 0.33, 0.012 + w * 0.02, 0.012 + w * 0.02, 0.01, 0x111111, 5, 2);
  k.blob(-w * 0.38, -h * 0.1, 0, w * 0.12, h * 0.14, w * 0.12, c, 6, 3); k.blob(w * 0.38, -h * 0.1, 0, w * 0.12, h * 0.14, w * 0.12, c, 6, 3);
  k.blob(-w * 0.2, -h * 0.45, s[2] * 0.15, w * 0.13, h * 0.08, w * 0.15, c, 6, 3); k.blob(w * 0.2, -h * 0.45, s[2] * 0.15, w * 0.13, h * 0.08, w * 0.15, c, 6, 3);
  if (d.id === 'bobby_plush') k.box(0, -h * 0.02, s[2] * 0.4, w * 0.3, h * 0.08, 0.01, 0xd32f2f);
});
S('robot', (k, s, c) => { k.box(0, -s[1] * 0.05, 0, s[0], s[1] * 0.45, s[2], c); k.box(0, s[1] * 0.32, 0, s[0] * 0.7, s[1] * 0.3, s[2] * 0.8, shade(c, 1.1)); k.box(-s[0] * 0.18, s[1] * 0.35, s[2] * 0.41, 0.02, 0.02, 0.005, 0xffeb3b); k.box(s[0] * 0.18, s[1] * 0.35, s[2] * 0.41, 0.02, 0.02, 0.005, 0xffeb3b); k.box(-s[0] * 0.25, -s[1] * 0.4, 0, s[0] * 0.3, s[1] * 0.2, s[2] * 0.6, 0x555555); k.box(s[0] * 0.25, -s[1] * 0.4, 0, s[0] * 0.3, s[1] * 0.2, s[2] * 0.6, 0x555555); k.cyl(0, s[1] * 0.5, 0, 0.004, 0.05, 0x999999); k.meta.eyes = true; });
S('toycar', (k, s, c) => { k.box(0, -s[1] * 0.05, 0, s[0], s[1] * 0.5, s[2], c); k.box(0, s[1] * 0.25, -s[2] * 0.05, s[0] * 0.8, s[1] * 0.4, s[2] * 0.5, shade(c, 1.2)); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(x * s[0] * 0.5, -s[1] * 0.3, z * s[2] * 0.3, s[1] * 0.22, 0.012, 0x111111, 0, 0, Math.PI / 2); });
S('doll', (k, s, c, d) => {
  const h = s[1], dress = d.p?.creepy ? 0xe8e0d8 : d.c2 ?? 0xe91e63; k.lathe([{ r: s[0] * 0.5, y: -h * 0.45 }, { r: s[0] * 0.14, y: h * 0.05, p: 'a' }], 8, { a: { c: dress } }, { bottom: dress }); k.box(0, h * 0.1, 0, s[0] * 0.5, h * 0.2, s[2] * 0.6, d.p?.creepy ? 0xe8e0d8 : d.c2 != null ? shade(d.c2, 1.2) : 0xf8bbd0);
  k.blob(0, h * 0.33, 0, s[0] * 0.33, h * 0.14, s[2] * 0.5, c, 8, 5); k.blob(0, h * 0.4, -s[2] * 0.05, s[0] * 0.36, h * 0.1, s[2] * 0.52, d.id === 'figurine' ? 0x00e5ff : d.c3 ?? 0xfbc02d, 8, 4);
  k.box(-s[0] * 0.1, h * 0.34, s[2] * 0.42, 0.012, 0.012, 0.006, 0x1565c0); k.box(s[0] * 0.1, h * 0.34, s[2] * 0.42, 0.012, 0.012, 0.006, 0x1565c0);
});
S('jackbox', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] / 2 + 0.003, 0, s[0], 0.006, s[2], 0xffeb3b); k.cyl(s[0] / 2 + 0.02, 0, 0, 0.006, 0.04, 0x999999, 0, 0, Math.PI / 2); });
S('ball', (k, s, c, d) => { k.sph(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c, s[0] < 0.12); if (d.id === 'football') { k.sph(0, 0, s[2] * 0.46, s[0] * 0.15, s[0] * 0.15, s[0] * 0.06, 0x111111); k.sph(s[0] * 0.43, 0, 0, s[0] * 0.06, s[0] * 0.15, s[0] * 0.15, 0x111111); } if (d.id === 'beach_ball') k.torus(0, 0, 0, s[0] * 0.46, 0xe53935, 0, 0, 0, true); if (d.id === 'basketball') k.torus(0, 0, 0, s[0] * 0.46, 0x111111, 0, 0, 0, true); });
S('musicbox', (k, s, c) => { k.box(0, -s[1] * 0.1, 0, s[0], s[1] * 0.8, s[2], c); k.box(0, s[1] * 0.35, -s[2] * 0.2, s[0], s[1] * 0.08, s[2] * 0.7, shade(c, 1.2), {}); k.sph(0, s[1] * 0.42, 0, s[0] * 0.08, s[0] * 0.12, s[0] * 0.08, 0xf8bbd0); k.cyl(s[0] / 2 + 0.01, 0, 0, 0.004, 0.03, 0xd4af37, 0, 0, Math.PI / 2); });
S('top', (k, s, c, d) => { if (d.id === 'metronome') { k.cone(0, 0, 0, s[0] * 0.6, s[1], c); k.box(0, s[1] * 0.1, s[2] * 0.3, 0.005, s[1] * 0.7, 0.005, 0xd4af37); return; } k.cone(0, -s[1] * 0.1, 0, s[0] / 2, s[1] * 0.6, c, Math.PI); k.cyl(0, s[1] * 0.3, 0, 0.006, s[1] * 0.4, 0x5d4037); });
S('yoyo', (k, s, c) => { k.cyl(0, 0, -s[1] * 0.25, s[0] / 2, s[1] * 0.45, c, Math.PI / 2); k.cyl(0, 0, s[1] * 0.25, s[0] / 2, s[1] * 0.45, c, Math.PI / 2); });
S('rubik', (k, s) => { const cols = [0xffffff, 0xffeb3b, 0xe53935, 0xff9800, 0x1e88e5, 0x43a047]; const e = s[0] / 3; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) k.box(x * e, y * e, z * e, e * 0.94, e * 0.94, e * 0.94, cols[(x + y * 2 + z * 3 + 9) % 6]); });
S('xylo', (k, s) => { const cols = [0xe53935, 0xff9800, 0xffeb3b, 0x43a047, 0x1e88e5, 0x3949ab, 0x8e24aa, 0xec407a]; for (let i = 0; i < 8; i++) k.box(-s[0] / 2 + (i + 0.5) * s[0] / 8, 0, 0, s[0] / 9, s[1] * 0.4, s[2] * (1 - i * 0.06), cols[i]); k.box(0, -s[1] * 0.3, -s[2] * 0.3, s[0], s[1] * 0.3, 0.02, 0x8d6e63); k.box(0, -s[1] * 0.3, s[2] * 0.3, s[0], s[1] * 0.3, 0.02, 0x8d6e63); });
S('drum', (k, s, c) => { k.cyl(0, 0, 0, s[0] / 2, s[1], c); k.cyl(0, s[1] / 2, 0, s[0] / 2 * 1.01, 0.005, 0xfafafa); k.torus(0, s[1] * 0.45, 0, s[0] * 0.46, 0xffd600, Math.PI / 2, 0, 0, true); });
S('gun', (k, s, c) => { k.box(0, s[1] * 0.2, 0, s[0], s[1] * 0.3, s[2], c); k.box(0, -s[1] * 0.15, -s[2] * 0.25, s[0] * 0.8, s[1] * 0.55, s[2] * 0.25, shade(c, 0.8)); k.cyl(0, s[1] * 0.2, s[2] * 0.55, s[1] * 0.1, s[2] * 0.15, 0xffeb3b, Math.PI / 2); });
S('horn', (k, s, c) => { const L = s[2]; k.cyl(0, 0, -L * 0.15, Math.min(s[0], s[1]) * 0.15, L * 0.7, c, Math.PI / 2); k.cone(0, 0, L * 0.35, Math.min(s[0], s[1]) * 0.5, L * 0.3, c, -Math.PI / 2); });
S('dice', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); for (const [x, y, z] of [[0, 0, 1], [0, 1, 0], [1, 0, 0], [-0.3, -1, 0.3], [-1, 0.3, 0.3]]) k.sph(x * s[0] * 0.5, y * s[1] * 0.5, z * s[2] * 0.5, s[0] * 0.08, s[0] * 0.08, s[0] * 0.08, 0x111111, true); });
S('bone', (k, s, c) => { k.tube(0, 0, 0, s[0] * 0.25, s[2] * 0.8, c, 6, { m: new THREE.Matrix4().makeRotationX(Math.PI / 2) }); for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) k.blob(x * s[0] * 0.25, 0, z * s[2] * 0.42, s[0] * 0.3, s[0] * 0.3, s[0] * 0.3, c, 6, 4); });

// ───────── alimentation ─────────
S('fruit', (k, s, c, d) => { k.sph(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c, true); if (d.id !== 'lemon') k.tube(0, s[1] * 0.5, 0, 0.004, s[1] * 0.25, 0x5d4037, 3, { open: true }); if (d.id === 'tomato') { k.setT(new THREE.Matrix4().makeTranslation(0, s[1] * 0.46, 0)); k.lathe([{ r: s[0] * 0.25, y: 0 }, { r: 0.004, y: 0.012, p: 'a' }], 6, { a: { c: 0x2e7d32 } }); k.setT(null); } });
S('banana', (k, s, c) => { for (let i = -2; i <= 2; i++) k.tube(i * 0.004, Math.abs(i) * s[2] * 0.06, i * s[2] * 0.18, s[0] * 0.45, s[2] * 0.24, c, 6, { m: new THREE.Matrix4().makeRotationX(Math.PI / 2 - i * 0.25), r1: Math.abs(i) === 2 ? s[0] * 0.25 : undefined, tc: Math.abs(i) === 2 ? 0x5d4037 : undefined }); });
S('baguette', (k, s, c) => { k.blob(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c, 8, 6); const n = Math.max(2, Math.min(6, Math.round(s[2] / 0.1))); for (let i = 0; i < n; i++) { const z = (i - (n - 1) / 2) * s[2] * 0.75 / n, y = s[1] * 0.49 * Math.sqrt(Math.max(0, 1 - (2 * z / s[2]) ** 2)); k.setT(new THREE.Matrix4().makeTranslation(0, y, z).multiply(new THREE.Matrix4().makeRotationY(0.5))); k.quad([-s[0] * 0.18, 0, s[2] * 0.04], [s[0] * 0.18, 0, s[2] * 0.04], [s[0] * 0.18, 0, -s[2] * 0.04], [-s[0] * 0.18, 0, -s[2] * 0.04], shade(c, 1.28)); k.setT(null); } });
S('croissant', (k, s, c) => { for (let i = -2; i <= 2; i++) { const a = i * 0.45; k.blob(Math.sin(a) * s[0] * 0.38, 0, Math.cos(a) * s[2] * 0.4 - s[2] * 0.2, s[0] * (0.2 - Math.abs(i) * 0.04), s[1] * 0.5, s[0] * 0.17, i % 2 ? c : shade(c, 1.15), 7, 4); } });
S('cake', (k, s, c, d) => { k.tube(0, -s[1] * 0.1, 0, s[0] / 2, s[1] * 0.8, c, 12, { tc: shade(c, 1.05) }); k.tube(0, s[1] * 0.32, 0, s[0] / 2 * 0.98, s[1] * 0.16, d.id === 'tarte' ? 0xd32f2f : d.c2 ?? shade(c, 1.1), 12); if (d.id === 'birthday_cake') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.cyl(Math.cos(a) * s[0] * 0.3, s[1] * 0.55, Math.sin(a) * s[0] * 0.3, 0.004, 0.05, 0x42a5f5); } k.meta.candles = true; } if (d.id === 'muffin') { k.sph(0, s[1] * 0.35, 0, s[0] * 0.55, s[1] * 0.3, s[0] * 0.55, 0x6d4c41); } });
S('carton', (k, s, c, d) => S_BRICK(k, s, c, { ...d, b: d.b ?? LEG(d)[1], pi: d.pi ?? LEG(d)[2], l: d.l ?? d.label ?? d.name }, true));
const BOTTLE_SIL = { water: 'water', baby_bottle: 'baby', bleach: 'bleach', cough_syrup: 'syrup', sanitizer: 'pump', sunscreen: 'flat', wd40: 'aero', shampoo: 'shampoo', nail_polish: 'polish', contact_lens: 'lotion', ketchup: 'sauce' };
S('bottle', (k, s, c, d) => S_BOTTLE(k, s, c, { ...d, sil: d.sil || BOTTLE_SIL[d.id] || 'water', b: d.b ?? LEG(d)[1], pi: d.pi ?? LEG(d)[2], l: d.l ?? d.label ?? d.name.replace(/^(Bouteille d'|Sirop pour la |Gel |Crème |Solution pour )/i, '') }));
const WINE = { wine: ['wine', 'Château Lacombe', 'Bordeaux', 'grape', 0x7b1f1f], champagne: ['bubbly', 'Maison Hélios', 'Champagne', 'star', 0xffd700], director_whisky: ['liquor', 'Glen Desmarais', '18 ans d\'âge', 'mountain', 0x3e2723] };
S('wine', (k, s, c, d) => { const W = WINE[d.id] || ['wine', 'Domaine', d.name, 'grape', 0x7b1f1f]; S_BOTTLE(k, s, c, { ...d, sil: d.sil || W[0], b: d.b ?? W[1], l: d.l ?? W[2], pi: d.pi ?? W[3], c2: d.c2 ?? W[4], lc: d.lc ?? 0xf5f0e0 }); });
S('bag', (k, s, c, d) => {
  if (d.id === 'handbag') { k.box(0, -s[1] * 0.1, 0, s[0], s[1] * 0.8, s[2], c); k.box(0, -s[1] * 0.02, s[2] / 2 + 0.002, s[0] * 0.9, s[1] * 0.25, 0.004, shade(c, 0.8)); k.box(0, s[1] * 0.12, s[2] / 2 + 0.005, 0.03, 0.02, 0.006, 0xd4af37); k.torus(0, s[1] * 0.3, 0, s[0] * 0.25, shade(c, 0.7), 0, 0, 0, true, 0.8); return; }
  S_PILLOW(k, s, c, { ...d, b: d.b ?? LEG(d)[1], pi: d.pi ?? LEG(d)[2], l: d.l ?? d.label ?? d.name });
});
S('jar', (k, s, c, d) => {
  if (d.id === 'vase') { k.lathe([{ r: s[0] * 0.3, y: -s[1] / 2 }, { r: s[0] * 0.5, y: -s[1] * 0.1, p: 'a' }, { r: s[0] * 0.28, y: s[1] * 0.38, p: 'a' }, { r: s[0] * 0.34, y: s[1] / 2, p: 'a' }], 12, { a: { c } }, { bottom: c, top: shade(c, 0.4) }); return; }
  if (d.id === 'candy_jar') { k.lathe([{ r: s[0] * 0.45, y: -s[1] / 2 }, { r: s[0] * 0.5, y: s[1] * 0.3, p: 'g' }, { r: s[0] * 0.38, y: s[1] * 0.4, p: 'g' }], 10, { g: { c: 0xd8eef2 } }, { bottom: 0xd8eef2, top: 0xd8eef2 }); k.tube(0, -s[1] * 0.05, 0, s[0] * 0.44, s[1] * 0.6, c, 10); k.tube(0, s[1] * 0.45, 0, s[0] * 0.36, s[1] * 0.1, 0xd4af37, 10); return; }
  S_JAR(k, s, c, { ...d, b: d.b ?? LEG(d)[1], pi: d.pi ?? LEG(d)[2], l: d.l ?? d.label ?? d.name.replace(/^(Pot de |Pot d'|Nourriture pour )/i, ''), c2: d.c2 ?? (d.id === 'slime' ? 0xffffff : 0xd4af37) });
});
S('pills', (k, s, c, d) => { const r = k.pk(d, 'pharma', s[0], s[2], { bg: c === 0xffffff ? 0x00897b : c, name: d.l ?? d.name.split(' ')[0], sub: d.sub ?? (d.p?.amount ? '500 mg' : '16 comprimés'), brand: d.b ?? 'Pharmalys' }); k.pbox(0, 0, 0, s[0], s[1], s[2], 0xffffff, { Y: r }, { Z: c, z: c }); });
S('pizza', (k, s, c, d) => { k.lathe([{ r: s[0] * 0.47, y: -s[1] / 2 }, { r: s[0] / 2, y: s[1] * 0.2, p: 'a' }, { r: s[0] * 0.46, y: s[1] / 2, p: 'a' }], 14, { a: { c: 0xd4a056 } }, { bottom: 0xc8954f, top: 0xffffff, topRect: k.shared('top:pizza', 96, 96, { kind: 'pizza' }) }); });
S('burger', (k, s, c) => { k.sph(0, s[1] * 0.25, 0, s[0] / 2, s[1] * 0.3, s[2] / 2, 0xd4a056); k.cyl(0, 0, 0, s[0] * 0.48, s[1] * 0.2, 0x5d3a1a); k.cyl(0, s[1] * 0.1, 0, s[0] * 0.5, s[1] * 0.06, 0x7cb342); k.cyl(0, s[1] * 0.12, 0, s[0] * 0.47, s[1] * 0.05, 0xffc107); k.cyl(0, -s[1] * 0.3, 0, s[0] * 0.48, s[1] * 0.2, 0xd4a056); });
S('fries', (k, s, c, d) => { k.box(0, -s[1] * 0.15, 0, s[0], s[1] * 0.7, s[2], c); const rnd = mulberry32(d.id.length); for (let i = 0; i < 9; i++) k.box((rnd() - 0.5) * s[0] * 0.7, s[1] * 0.22, (rnd() - 0.5) * s[2] * 0.6, 0.01, s[1] * 0.4, 0.01, d.id === 'popcorn' ? 0xfffde7 : 0xffd54f); });
S('cup', (k, s, c, d) => { k.cylS(0, 0, 0, s[0] / 2, s[1], s[2] / 2, c); k.cyl(0, s[1] * 0.48, 0, s[0] * 0.44, 0.005, d.id === 'coffee' ? 0x3e2723 : d.id === 'milkshake' ? 0xf8bbd0 : 0x8d6e63); if (d.mat === 'ceramic') k.torus(s[0] * 0.55, 0, 0, s[1] * 0.18, c, 0, 0, 0, true); });
S('lollipop', (k, s, c) => { k.cyl(0, s[1] * 0.2, 0, s[0] / 2, s[2], c, Math.PI / 2); k.cyl(0, -s[1] * 0.2, 0, 0.004, s[1] * 0.6, 0xffffff); });
S('cotton_candy', (k, s, c) => { k.sph(0, s[1] * 0.15, 0, s[0] / 2, s[1] * 0.35, s[2] / 2, c); k.cyl(0, -s[1] * 0.3, 0, 0.005, s[1] * 0.4, 0xffffff); });

// ───────── fleurs ─────────
S('bouquet', (k, s, c, d) => { k.lathe([{ r: 0.008, y: -s[1] / 2 }, { r: s[0] * 0.36, y: s[1] * 0.12, p: 'a' }], 8, { a: { c: d.c2 ?? 0xfafafa } }); for (let i = 0; i < 7; i++) { const a = i * 0.9; k.tube(Math.cos(a) * 0.02, s[1] * 0.05, Math.sin(a) * 0.02, 0.004, s[1] * 0.55, 0x2e7d32, 4, { open: true }); k.blob(Math.cos(a) * s[0] * 0.3, s[1] * 0.36, Math.sin(a) * s[0] * 0.3, s[0] * 0.18, s[0] * 0.15, s[0] * 0.18, i % 3 ? c : shade(c, 1.2), 7, 4); } });
S('flowerpot', (k, s, c, d) => { POT(k, 0, -s[1] * 0.35, s[0] * 0.5, s[1] * 0.3, d.c2 ?? 0xa1543a); if (d.id === 'bonsai') { k.cyl(0, -s[1] * 0.05, 0, 0.02, s[1] * 0.3, 0x5d4037, 0, 0, 0.3, true); k.blob(0.04, s[1] * 0.2, 0, s[0] * 0.4, s[1] * 0.2, s[2] * 0.4, c, 8, 4); return; } k.tube(0, s[1] * 0.1, 0, 0.006, s[1] * 0.6, 0x2e7d32, 4, { open: true }); k.blob(0, s[1] * 0.4, 0, s[0] * 0.25, s[0] * 0.2, s[0] * 0.25, c, 8, 4); k.blob(0.03, s[1] * 0.05, 0, s[0] * 0.15, 0.01, s[0] * 0.08, 0x43a047, 5, 2); });
S('cactus', (k, s, c) => { k.cone(0, -s[1] * 0.38, 0, s[0] * 0.5, s[1] * 0.25, 0xa1543a, Math.PI); k.cap(0, s[1] * 0.05, 0, s[0] * 0.25, s[1] * 0.55, c); k.cap(s[0] * 0.3, s[1] * 0.1, 0, s[0] * 0.12, s[1] * 0.2, c); });
S('watering', (k, s, c) => { k.cyl(0, 0, 0, s[1] * 0.45, s[1] * 0.9, c); k.cyl(s[0] * 0.3, s[1] * 0.1, 0, 0.012, s[0] * 0.6, c, 0, 0, -1.0); k.torus(-s[0] * 0.15, s[1] * 0.3, 0, s[1] * 0.25, c, 0, 0, 0, true); });

// ───────── bijoux ─────────
S('ring', (k, s, c, d) => { k.torus(0, 0, 0, s[0] * 0.4, c, Math.PI / 2, 0, 0, true); if (d.id === 'diamond_ring') k.sph(0, s[1] * 0.4, 0, 0.006, 0.006, 0.006, 0xe0f7fa); if (d.id === 'cursed_brooch') k.cyl(0, 0, 0, s[0] * 0.45, 0.004, 0xcfd8dc, Math.PI / 2); });
S('necklace', (k, s, c) => { k.torus(0, 0, 0, s[0] * 0.45, c, Math.PI / 2, 0, 0, true); k.sph(0, 0, s[2] * 0.5, 0.01, 0.012, 0.006, 0xe0f7fa); });
S('watch', (k, s, c) => { k.cyl(0, 0, 0, s[0] * 0.38, s[1], c); k.cyl(0, s[1] * 0.5, 0, s[0] * 0.33, 0.002, 0xfafafa); k.box(0, 0, 0, s[0] * 0.3, s[1] * 0.6, s[2] * 1.6, 0x3e2723); });

// ───────── papier ─────────
S('newspaper', (k, s, c, d) => { const old = d.id === 'old_newspaper'; const r = k.pk(d, 'news', s[0], s[2], { name: d.l ?? (old ? 'L\'ÉCHO D\'HÉLIOS' : 'LE JOURNAL'), sub: d.sub ?? (old ? 'DRAME AU CENTRE HÉLIOS' : 'NUIT AGITÉE AU CENTRE'), bg: old ? 0xe8d9b0 : 0xf3f0e8 }); k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Y: r }); });
S('book', (k, s, c, d) => S_BOOK(k, s, c, { ...d, l: d.l ?? d.label ?? d.name.replace(/^(Roman|Album|Livre de|Manuel d')\s*/i, '').replace(/[«»]/g, '').trim() }));

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
S('headset', (k, s, c) => { k.torus(0, s[1] * 0.1, 0, s[0] * 0.42, 0x222222, 0, Math.PI / 2, 0, true); for (const sx of [-1, 1]) k.tube(sx * s[0] * 0.42, -s[1] * 0.2, 0, s[1] * 0.25, 0.04, c, 10, { m: new THREE.Matrix4().makeRotationZ(Math.PI / 2) }); });
S('turntable', (k, s, c) => { k.box(0, -s[1] * 0.2, 0, s[0], s[1] * 0.6, s[2], c); k.cyl(-s[0] * 0.1, s[1] * 0.15, 0, s[2] * 0.42, 0.015, 0x222222); k.cyl(-s[0] * 0.1, s[1] * 0.16, 0, 0.004, 0.02, 0xc0c0c0); k.box(s[0] * 0.32, s[1] * 0.2, -s[2] * 0.2, 0.012, 0.012, s[2] * 0.5, 0xc0c0c0, { ry: 0.3 }); k.meta.platter = [-s[0] * 0.1, s[1] * 0.16, 0]; });
S('vcr', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(-s[0] * 0.1, 0, s[2] / 2, s[0] * 0.5, s[1] * 0.25, 0.004, 0x111111); k.box(s[0] * 0.3, 0, s[2] / 2, s[0] * 0.2, s[1] * 0.3, 0.004, 0x003311); k.meta.display = [s[0] * 0.3, 0, s[2] / 2 + 0.003]; });
const VINYL_PI = { jazz: 'note', disco: 'star', rock: 'bolt', classical: 'note', synthwave: 'sun', funk: 'star', chanson: 'heart', reggae: 'leaf', metal: 'skull', ambient: 'moon', piano_bar: 'note', xmas: 'snow', creepy_vinyl: 'moon' };
S('vinyl', (k, s, c, d) => { const g = d.p?.genre; const r = k.pk(d, 'media', s[0], s[1], { name: d.label || d.name, picto: VINYL_PI[g], bg: c, sub: g === 'creepy_vinyl' ? '1987' : '33 tours', brand: g === 'creepy_vinyl' ? '' : 'DISQUES HÉLIOS' }); k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Z: r, z: r }); });
S('vhs', (k, s, c, d) => { const r = k.pk(d, 'media', s[0], s[2], { name: d.label || d.name, bg: c, sub: 'VHS · PAL', brand: '' }); k.pbox(0, 0, 0, s[0], s[1], s[2], 0x1a1a1a, { Y: r }); k.box(0, 0, s[2] / 2, s[0] * 0.95, s[1] * 0.7, 0.002, 0xeeeeee); });
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
S('mask', (k, s, c, d) => { k.blob(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c, 10, 6); k.blob(-s[0] * 0.18, s[1] * 0.08, s[2] * 0.4, s[0] * 0.08, s[1] * 0.06, 0.01, 0x111111, 6, 2); k.blob(s[0] * 0.18, s[1] * 0.08, s[2] * 0.4, s[0] * 0.08, s[1] * 0.06, 0.01, 0x111111, 6, 2); if (d.id === 'mask_clown') { k.blob(0, -s[1] * 0.05, s[2] * 0.5, s[0] * 0.1, s[0] * 0.1, s[0] * 0.1, 0xff1744, 6, 3); k.box(0, -s[1] * 0.25, s[2] * 0.42, s[0] * 0.4, s[1] * 0.05, 0.01, 0xd50000); } if (d.id === 'mask_pig') k.cyl(0, -s[1] * 0.08, s[2] * 0.5, s[0] * 0.14, s[2] * 0.2, 0xf48fb1, Math.PI / 2); });
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
S('keyboard', (k, s, c, d) => { k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Y: k.pk(d, 'keys', s[0], s[2], { bg: c }) }); });
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


// ═════════════════════ EMBALLAGES & ARTICLES DE RAYON (couleurs réelles, budget bas) ═════════════════════
const segsOf = (k, d, n = 8) => (k.lod ? Math.max(5, n - 3) : (d.segs || n));
const R01 = (rings, R, Rz, h) => rings.map((q) => ({ r: q[0] * R, rz: q[0] * Rz, y: -h / 2 + q[1] * h, p: q[2] }));
// silhouettes de bouteilles : [rayon relatif, hauteur relative, partie du segment] (g verre/plastique, l étiquette,
// c bouchon, k capsule, m métal, w tétine), rz : aplatissement (flacons ovales)
const SIL = {
  water: { r: [[0.86, 0], [1, 0.05, 'g'], [1, 0.24, 'g'], [1, 0.62, 'l'], [0.95, 0.7, 'g'], [0.4, 0.86, 'g'], [0.36, 0.9, 'g'], [0.42, 0.91, 'c'], [0.42, 1, 'c']] },
  soda: { r: [[0.78, 0], [1, 0.07, 'g'], [1, 0.22, 'g'], [1, 0.56, 'l'], [0.94, 0.64, 'g'], [0.36, 0.86, 'g'], [0.33, 0.9, 'g'], [0.4, 0.91, 'c'], [0.4, 1, 'c']] },
  juice: { r: [[0.9, 0], [1, 0.05, 'g'], [1, 0.66, 'l'], [0.9, 0.74, 'g'], [0.5, 0.86, 'g'], [0.55, 0.87, 'c'], [0.55, 1, 'c']] },
  wine: { r: [[0.96, 0], [1, 0.12, 'g'], [1, 0.5, 'l'], [1, 0.58, 'g'], [0.8, 0.67, 'g'], [0.34, 0.76, 'g'], [0.31, 0.86, 'g'], [0.34, 0.87, 'k'], [0.34, 1, 'k']] },
  bubbly: { r: [[0.96, 0], [1, 0.1, 'g'], [1, 0.45, 'l'], [0.98, 0.52, 'g'], [0.6, 0.66, 'g'], [0.36, 0.76, 'g'], [0.38, 0.77, 'k'], [0.4, 1, 'k']] },
  oil: { r: [[0.9, 0], [1, 0.04, 'g'], [1, 0.6, 'l'], [0.9, 0.7, 'g'], [0.36, 0.82, 'g'], [0.33, 0.88, 'g'], [0.4, 0.89, 'c'], [0.4, 1, 'c']] },
  beer: { r: [[0.95, 0], [1, 0.1, 'g'], [1, 0.48, 'l'], [0.94, 0.56, 'g'], [0.42, 0.72, 'g'], [0.34, 0.92, 'g'], [0.4, 0.93, 'k'], [0.4, 1, 'k']] },
  liquor: { r: [[1, 0], [1, 0.56, 'l'], [0.96, 0.63, 'g'], [0.46, 0.72, 'g'], [0.36, 0.8, 'g'], [0.44, 0.81, 'c'], [0.44, 1, 'c']] },
  sauce: { r: [[0.84, 0], [1, 0.08, 'g'], [1, 0.62, 'l'], [0.9, 0.72, 'g'], [0.5, 0.8, 'g'], [0.52, 0.81, 'c'], [0.34, 1, 'c']] },
  shampoo: { rz: 0.56, r: [[0.86, 0], [1, 0.06, 'g'], [1, 0.72, 'l'], [0.86, 0.82, 'g'], [0.56, 0.86, 'g'], [0.58, 0.87, 'c'], [0.52, 1, 'c']] },
  flat: { rz: 0.5, r: [[0.8, 0], [1, 0.08, 'g'], [1, 0.74, 'l'], [0.7, 0.84, 'g'], [0.46, 0.86, 'c'], [0.46, 1, 'c']] },
  bleach: { rz: 0.72, r: [[0.92, 0], [1, 0.05, 'g'], [1, 0.68, 'l'], [0.9, 0.78, 'g'], [0.36, 0.9, 'g'], [0.42, 0.91, 'c'], [0.42, 1, 'c']] },
  aero: { r: [[1, 0], [1, 0.72, 'l'], [0.74, 0.8, 'm'], [0.6, 0.83, 'm'], [0.64, 0.84, 'c'], [0.64, 1, 'c']] },
  syrup: { r: [[0.95, 0], [1, 0.05, 'g'], [1, 0.6, 'l'], [0.9, 0.68, 'g'], [0.44, 0.76, 'g'], [0.42, 0.8, 'g'], [0.52, 0.81, 'c'], [0.52, 1, 'c']] },
  pump: { r: [[0.95, 0], [1, 0.05, 'g'], [1, 0.7, 'l'], [0.88, 0.76, 'g'], [0.38, 0.8, 'c'], [0.36, 0.9, 'c'], [0.16, 0.92, 'c'], [0.16, 1, 'c']] },
  lotion: { rz: 0.7, r: [[0.95, 0], [1, 0.05, 'g'], [1, 0.72, 'l'], [0.8, 0.8, 'g'], [0.34, 0.83, 'c'], [0.3, 0.92, 'c'], [0.14, 0.94, 'c'], [0.14, 1, 'c']] },
  baby: { r: [[0.95, 0], [1, 0.05, 'g'], [1, 0.68, 'l'], [1.02, 0.7, 'c'], [1.02, 0.8, 'c'], [0.5, 0.84, 'w'], [0.3, 0.96, 'w'], [0.12, 1, 'w']] },
  polish: { r: [[1, 0], [1, 0.48, 'l'], [0.5, 0.5, 'c'], [0.44, 1, 'c']] },
  milkjug: { rz: 0.8, r: [[0.92, 0], [1, 0.05, 'g'], [1, 0.66, 'l'], [0.86, 0.78, 'g'], [0.36, 0.88, 'g'], [0.4, 0.89, 'c'], [0.4, 1, 'c']] },
  vial: { r: [[1, 0], [1, 0.7, 'l'], [0.9, 0.74, 'g'], [0.6, 0.78, 'c'], [0.6, 1, 'c']] },
};
const S_BOTTLE = (k, s, c, d) => {
  const sil = SIL[d.sil] || SIL.water, R = s[0] / 2, Rz = (s[2] / 2) * (sil.rz && s[2] === s[0] ? sil.rz : 1), h = s[1];
  const rings = R01(sil.r, R, Rz, h); let lh = 0; for (let i = 1; i < rings.length; i++) if (rings[i].p === 'l') lh += rings[i].y - rings[i - 1].y;
  const lab = k.pk(d, d.lk || 'wrap', Math.PI * (R + Rz), lh, {});
  const capC = d.cc ?? d.c2 ?? 0xeeeeee;
  k.lathe(rings, segsOf(k, d, sil.rz ? 9 : 8), { g: { c }, l: { c: 0xffffff, rect: lab }, c: { c: capC }, k: { c: d.c2 ?? 0x7b1f1f }, m: { c: 0xc0c0c0 }, w: { c: 0xfff3e0 } }, { bottom: c, top: rings[rings.length - 1].p === 'g' ? c : rings[rings.length - 1].p === 'k' ? (d.c2 ?? 0x7b1f1f) : rings[rings.length - 1].p === 'w' ? 0xfff3e0 : capC });
  if (d.sil === 'pump' || d.sil === 'lotion') k.box(R * 0.35, h * 0.47, 0, R * 0.7, h * 0.03, R * 0.25, capC);
};
S('pbot', S_BOTTLE);
// Boîte de conserve / canette : flanc entièrement étiqueté, fonds métalliques
S('pcan', (k, s, c, d) => {
  const R = s[0] / 2, Rz = s[2] / 2, h = s[1];
  const lab = k.pk(d, 'wrap', Math.PI * (R + Rz), h, d.rim ? { rim: 1 } : {});
  const metal = d.mc ?? 0xc9c9c9;
  if (d.rim) k.lathe([{ r: R * 0.9, rz: Rz * 0.9, y: -h / 2 }, { r: R, rz: Rz, y: -h * 0.42, p: 'm' }, { r: R, rz: Rz, y: h * 0.4, p: 'l' }, { r: R * 0.82, rz: Rz * 0.82, y: h / 2, p: 'm' }], segsOf(k, d, 10), { l: { c: 0xffffff, rect: lab }, m: { c: metal } }, { bottom: metal, top: metal });
  else k.lathe([{ r: R, rz: Rz, y: -h / 2 }, { r: R, rz: Rz, y: h / 2, p: 'l' }], segsOf(k, d, s[0] > 0.12 ? 12 : 9), { l: { c: 0xffffff, rect: lab } }, { bottom: metal, top: d.lid ?? metal });
});
// Bocal : étiquette + couvercle
const S_JAR = (k, s, c, d) => {
  const R = s[0] / 2, Rz = s[2] / 2, h = s[1], lab = k.pk(d, 'wrap', Math.PI * (R + Rz), h * 0.72);
  const lid = d.c2 ?? 0xd4af37;
  k.lathe([{ r: R * 0.94, rz: Rz * 0.94, y: -h / 2 }, { r: R, rz: Rz, y: h * 0.28, p: 'l' }, { r: R * 1.02, rz: Rz * 1.02, y: h * 0.31, p: 'c' }, { r: R * 1.02, rz: Rz * 1.02, y: h / 2, p: 'c' }], segsOf(k, d, 9), { l: { c: 0xffffff, rect: lab }, c: { c: lid } }, { bottom: d.gc ?? c, top: lid });
};
S('pjar', S_JAR);
// Tube (crème, dentifrice, colle) posé sur son bouchon, extrémité soudée en haut
S('ptube', (k, s, c, d) => {
  const R = Math.min(s[0], s[2]) / 2, W = s[0] / 2, h = s[1], cap = d.c2 ?? 0xfafafa, ch = h * 0.16;
  const lab = k.pk(d, 'wrap', Math.PI * R * 2, h * 0.72);
  k.lathe([{ r: R * 0.8, y: -h / 2 }, { r: R * 0.85, y: -h / 2 + ch, p: 'c' }, { r: R, y: -h / 2 + ch + 0.002, p: 'c' }, { r: R, y: -h * 0.12, p: 'l' }, { r: W * 0.9, rz: R * 0.5, y: h * 0.3, p: 'l' }, { r: W, rz: 0.002, y: h * 0.44, p: 'l' }, { r: W, rz: 0.0015, y: h / 2, p: 's' }], segsOf(k, d, 8), { c: { c: cap }, l: { c: 0xffffff, rect: lab }, s: { c: d.lc ?? c } }, { bottom: cap });
});
// Sachet « oreiller » (chips, bonbons, farine) : faces bombées, soudures haute et basse
const S_PILLOW = (k, s, c, d) => {
  const w = s[0] / 2, h = s[1], dz = s[2] / 2, lab = k.pk(d, d.lk || 'bag', s[0], h * 0.86);
  const rows = [[-h * 0.43, 0.006], [-h * 0.28, dz], [h * 0.26, dz], [h * 0.43, 0.004]]; // (y, z) du bas vers le haut
  const col = lin(0xffffff), n0 = [[0, -0.75, 0.66], [0, -0.25, 0.97], [0, 0.25, 0.97], [0, 0.75, 0.66]];
  for (const side of [1, -1]) {
    const o = k.b.vertexCount;
    rows.forEach(([y, z], i) => { const t = i === 0 ? 0 : i === 3 ? 1 : (y - rows[0][0]) / (rows[3][0] - rows[0][0]); const v = lab.v0 + (lab.v1 - lab.v0) * t; const n = n0[i];
      for (const sx of [-1, 1]) { const u = side > 0 ? (sx < 0 ? lab.u0 : lab.u1) : (sx < 0 ? lab.u1 : lab.u0); k.vtx(sx * w, y, side * z, 0, n[1], side * n[2], u, v, col); } });
    for (let i = 0; i < 3; i++) { const a = o + i * 2; side > 0 ? k.b.idx.push(a, a + 1, a + 3, a, a + 3, a + 2) : k.b.idx.push(a, a + 3, a + 1, a, a + 2, a + 3); }
  }
  const sc = d.sc ?? shade(d.lc ?? c, 0.75);
  for (const sx of [-1, 1]) { const pts = [...rows.map(([y, z]) => [sx * w, y, z]), ...rows.slice().reverse().map(([y, z]) => [sx * w, y, -z])]; const o = k.b.vertexCount, cl = lin(sc); for (const p of pts) k.vtx(p[0], p[1], p[2], sx, 0, 0, k.white.u0, k.white.v0, cl); for (let i = 1; i < pts.length - 1; i++) sx > 0 ? k.b.idx.push(o, o + i + 1, o + i) : k.b.idx.push(o, o + i, o + i + 1); }
  for (const [y0, y1] of [[h * 0.43, h / 2], [-h / 2, -h * 0.43]]) { k.quad([-w, y0, 0.004], [w, y0, 0.004], [w, y1, 0.002], [-w, y1, 0.002], sc); k.quad([w, y0, -0.004], [-w, y0, -0.004], [-w, y1, -0.002], [w, y1, -0.002], sc); }
};
S('pbag', S_PILLOW);
// Sachet tenant debout (doypack) : face avant inclinée
S('ppouch', (k, s, c, d) => {
  const w = s[0] / 2, h = s[1], dz = s[2] / 2, top = h * 0.4, lab = k.pk(d, d.lk || 'box', s[0], h * 0.9);
  k.quad([-w, -h / 2, dz], [w, -h / 2, dz], [w, top, 0.004], [-w, top, 0.004], 0xffffff, lab);
  k.quad([w, -h / 2, -dz], [-w, -h / 2, -dz], [-w, top, -0.004], [w, top, -0.004], 0xffffff, lab);
  const sc = shade(d.lc ?? c, 0.8);
  k.quad([w, -h / 2, dz], [w, -h / 2, -dz], [w, top, -0.004], [w, top, 0.004], sc); k.quad([-w, -h / 2, -dz], [-w, -h / 2, dz], [-w, top, 0.004], [-w, top, -0.004], sc);
  k.quad([-w, -h / 2, -dz], [w, -h / 2, -dz], [w, -h / 2, dz], [-w, -h / 2, dz], sc);
  k.pbox(0, (top + h / 2) / 2, 0, s[0], h / 2 - top, 0.006, sc, {}, {}, 'y');
});
// Brique (lait, jus, soupe) : toit à pignon ou dessus plat avec bouchon
const S_BRICK = (k, s, c, d, gable = d.gable) => {
  const w = s[0], h = s[1], dd = s[2], bh = gable ? h * 0.8 : h * 0.94, y0 = -h / 2;
  const lab = k.pk(d, d.lk || 'box', w, bh), side = k.pk(d, 'plain', dd, bh, { bg: d.lc ?? c, brand: d.b || d.l }, d.id + ':side');
  k.pbox(0, y0 + bh / 2, 0, w, bh, dd, c, { Z: lab, z: lab, X: side, x: side }, {}, gable ? 'Y' : '');
  const cap = d.c2 ?? 0x1e88e5;
  if (gable) {
    const yt = y0 + bh, ya = h / 2 - h * 0.04, sc = shade(d.lc ?? c, 0.92);
    k.quad([-w / 2, yt, dd / 2], [w / 2, yt, dd / 2], [w / 2, ya, 0], [-w / 2, ya, 0], sc); k.quad([w / 2, yt, -dd / 2], [-w / 2, yt, -dd / 2], [-w / 2, ya, 0], [w / 2, ya, 0], sc);
    k.quad([w / 2, yt, dd / 2], [w / 2, yt, -dd / 2], [w / 2, ya, 0], [w / 2, ya, 0], sc); k.quad([-w / 2, yt, -dd / 2], [-w / 2, yt, dd / 2], [-w / 2, ya, 0], [-w / 2, ya, 0], sc);
    k.box(0, ya + h * 0.02, 0, w, h * 0.04, 0.006, sc);
    k.tube(w * 0.18, yt + (ya - yt) * 0.45, dd * 0.22, Math.min(w, dd) * 0.14, 0.014, cap, 6, { m: new THREE.Matrix4().makeRotationX(0.75) });
  } else k.tube(w * 0.2, y0 + bh + h * 0.03, dd * 0.15, Math.min(w, dd) * 0.13, h * 0.06, cap, 6);
};
S('pbrick', (k, s, c, d) => S_BRICK(k, s, c, d));
// Boîte en carton imprimée (céréales, biscuits, jouets, appareils…) ; boîte plate : étiquette dessus
S('pbox', (k, s, c, d) => {
  const kind = d.lk || 'box', flat = d.top ?? (s[1] < Math.min(s[0], s[2]) * 0.45);
  if (flat) { const r = k.pk(d, kind, s[0], s[2]); const e = k.pk(d, 'plain', s[0], Math.max(0.02, s[1]), { bg: d.lc ?? c, brand: d.b || d.l }, d.id + ':edge'); k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Y: r, Z: e, z: e }); return; }
  const r = k.pk(d, kind, s[0], s[1]);
  const sideL = d.sides ? k.pk(d, 'plain', s[2], s[1], { bg: d.lc ?? c, brand: d.b }, d.id + ':side') : null;
  k.pbox(0, 0, 0, s[0], s[1], s[2], d.sc ?? c, { Z: r, z: d.back === false ? null : r, X: sideL, x: sideL });
});
// Paquet de rouleaux (papier toilette, essuie-tout) : extrémités des rouleaux visibles
S('prolls', (k, s, c, d) => { const r = k.pk(d, 'rolls', s[0], s[1], { nx: d.rx || 3, ny: d.ry || 2 }); const t = k.pk(d, 'rolls', s[0], s[2], { nx: d.rx || 3, ny: d.rz || 2, top: 1 }, d.id + ':top'); k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Z: r, z: r, Y: t }); });
// Boîte d'œufs
S('peggs', (k, s, c, d) => { const top = k.pk(d, 'eggs', s[0], s[2], { nx: d.pn || 3, bg: c }); const e = k.pk(d, 'plain', s[0], s[1], { bg: d.lc ?? c, brand: d.l || 'ŒUFS' }, d.id + ':edge'); k.pbox(0, -s[1] * 0.1, 0, s[0], s[1] * 0.8, s[2], c, { Y: top, Z: e, z: e }); k.box(0, s[1] * 0.35, 0, s[0] * 0.9, s[1] * 0.1, s[2] * 0.08, shade(c, 0.9)); });
// Blister sur carte
S('pblist', (k, s, c, d) => { const r = k.pk(d, 'blister', s[0], s[1]); k.pbox(0, 0, -s[2] * 0.4, s[0], s[1], s[2] * 0.2, d.lc ?? c, { Z: r }); k.box(0, -s[1] * 0.06, s[2] * 0.1, s[0] * 0.7, s[1] * 0.4, s[2] * 0.8, d.c2 ?? 0xdde8ee); });
// Vêtement sur cintre (portants) : cintre + corps + manches ; l'origine est au centre de la boîte englobante
S('phang', (k, s, c, d) => {
  const w = s[0], h = s[1], t = Math.max(0.03, s[2] * 0.6), st = d.gs || 'shirt';
  const lab = k.pk(d, 'garment', w * 0.7, h * 0.86, { style: st });
  const yb = h / 2 - 0.06; // haut du vêtement (sous le cintre)
  const bodyH = st === 'pants' ? h * 0.86 : st === 'dress' ? h * 0.88 : h * 0.72, bw = st === 'pants' ? w * 0.62 : w * 0.66;
  k.pbox(0, yb - bodyH / 2, 0, bw, bodyH, t, shade(c, 0.85), { Z: lab, z: lab });
  if (st !== 'pants' && st !== 'dress') for (const sx of [-1, 1]) k.setT(new THREE.Matrix4().makeTranslation(sx * w * 0.37, yb - h * 0.2, 0).multiply(new THREE.Matrix4().makeRotationZ(sx * 0.32))).pbox(0, 0, 0, w * 0.15, h * (st === 'tee' ? 0.22 : 0.5), t * 0.85, shade(c, 0.92)).setT(null);
  k.box(0, h / 2 - 0.045, 0, w * 0.72, 0.012, 0.012, d.hc ?? 0x8d6e63); k.box(0, h / 2 - 0.016, 0, 0.006, 0.032, 0.006, 0xb0b0b0);
});
// Pile de vêtements pliés
S('pfold', (k, s, c, d) => { const f = k.pk(d, 'folded', s[0], s[1], { n: d.pn || Math.max(2, Math.round(s[1] / 0.04)) }); const t = k.pk(d, 'fabric', s[0], s[2], { pat: d.pat || 'plain' }, d.id + ':top'); k.pbox(0, 0, 0, s[0], s[1], s[2], shade(c, 0.85), { Z: f, z: f, Y: t }); });
// Boîte à chaussures (petit côté vers l'allée) : fond + couvercle débordant
S('pshoebox', (k, s, c, d) => { const r = k.pk(d, 'shoebox', s[0], s[1], { serif: d.serif }); k.pbox(0, -s[1] * 0.06, 0, s[0] * 0.98, s[1] * 0.88, s[2] * 0.98, c, { Z: r, z: r }); k.pbox(0, s[1] * 0.4, 0, s[0], s[1] * 0.2, s[2], d.c2 ?? shade(c, 0.75), {}, {}, 'y'); });
// Paire de chaussures (exposées)
S('ppair', (k, s, c, d) => {
  const w = s[0] / 2, h = s[1], L = s[2], sole = d.c2 ?? (d.st === 'heel' ? 0x212121 : 0xf5f5f5), st = d.st || 'sneaker';
  for (const sx of [-1, 1]) {
    const x = sx * w * 0.52, sw = w * 0.9;
    k.box(x, -h / 2 + h * 0.08, 0, sw, h * 0.16, L, sole);
    const top = st === 'boot' ? h / 2 : st === 'heel' ? -h * 0.05 : h * 0.12;
    const y0 = -h / 2 + h * 0.16;
    k.quad([x - sw / 2, y0, L / 2], [x + sw / 2, y0, L / 2], [x + sw / 2, y0 + (top - y0) * 0.35, L * 0.22], [x - sw / 2, y0 + (top - y0) * 0.35, L * 0.22], c);
    k.quad([x - sw / 2, y0 + (top - y0) * 0.35, L * 0.22], [x + sw / 2, y0 + (top - y0) * 0.35, L * 0.22], [x + sw / 2, top, -L * 0.15], [x - sw / 2, top, -L * 0.15], shade(c, 1.1));
    k.quad([x + sw / 2, y0, -L / 2], [x - sw / 2, y0, -L / 2], [x - sw / 2, top, -L / 2], [x + sw / 2, top, -L / 2], c);
    k.quad([x - sw / 2, top, -L * 0.15], [x + sw / 2, top, -L * 0.15], [x + sw / 2, top, -L / 2], [x - sw / 2, top, -L / 2], shade(c, 0.5));
    for (const e of [-1, 1]) { const ex = x + e * sw / 2; const pts = e > 0 ? [[ex, y0, L / 2], [ex, y0, -L / 2], [ex, top, -L / 2], [ex, top, -L * 0.15], [ex, y0 + (top - y0) * 0.35, L * 0.22]] : [[ex, y0, -L / 2], [ex, y0, L / 2], [ex, y0 + (top - y0) * 0.35, L * 0.22], [ex, top, -L * 0.15], [ex, top, -L / 2]]; const o = k.b.vertexCount, cl = lin(shade(c, 0.9)); for (const p of pts) k.vtx(p[0], p[1], p[2], e, 0, 0, k.white.u0, k.white.v0, cl); for (let i = 1; i < pts.length - 1; i++) k.b.idx.push(o, o + i, o + i + 1); }
    if (st === 'heel') k.box(x, -h / 2 + h * 0.2, -L * 0.42, sw * 0.25, h * 0.4, L * 0.08, sole);
    if (st === 'sneaker' && d.c3 != null) k.box(x + sw * 0.5 + 0.001, y0 + h * 0.12, 0, 0.002, h * 0.08, L * 0.5, d.c3);
  }
});
// Livre : couverture (avant), 4e de couverture, dos (côté gauche) et tranche
const S_BOOK = (k, s, c, d) => {
  const cov = k.pk(d, 'book', s[0], s[1]), spine = k.pk(d, 'spine', Math.max(0.03, s[2]), s[1], {}, d.id + ':spine', 16);
  const back = d.bk ? k.pk(d, 'plain', s[0], s[1], { bg: c, brand: '' }, d.id + ':back') : null;
  k.pbox(0, 0, 0, s[0], s[1], s[2], 0xfff8e1, { Z: cov, z: back, x: spine }, { z: back ? 0xffffff : c });
};
S('pbook', S_BOOK);
// Magazine / revue
S('pmag', (k, s, c, d) => { const r = k.pk(d, d.lk || 'mag', s[0], s[1]); k.pbox(0, 0, 0, s[0], s[1], s[2], 0xf5f5f5, { Z: r }, { z: c, x: c }); });
// Rangée de livres (lot / série) : dos visibles de face, tranches au-dessus
S('pspines', (k, s, c, d) => { const r = k.pk(d, 'spines', s[0], s[1], { n: d.pn || Math.max(3, Math.round(s[0] / 0.028)), titles: d.titles, palette: d.pal, even: d.even }); k.pbox(0, 0, 0, s[0], s[1], s[2], 0xf3ead6, { Z: r }, { z: c }); });
// Pile de livres identiques posés à plat
S('ppile', (k, s, c, d) => { const cov = k.pk(d, d.lk || 'book', s[0], s[2], {}, d.id + ':cover'); const ed = k.pk(d, 'pages', s[0], s[1], { n: d.pn || 5 }, d.id + ':edge'); k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Y: cov, Z: ed, X: ed, x: ed }); });
// Carte (postale, vœux, jeu à gratter)
S('pcard', (k, s, c, d) => { const r = k.pk(d, d.lk || 'card', s[0], s[1]); k.pbox(0, 0, 0, s[0], s[1], s[2], 0xffffff, { Z: r }); });
// Pot de fleurs (terre cuite) avec terre
function POT(k, x, y, r, h, c) { k.setT(new THREE.Matrix4().makeTranslation(x, y, 0)); k.lathe([{ r: r * 0.72, y: -h / 2 }, { r: r * 0.96, y: h * 0.36, p: 'a' }, { r, y: h * 0.38, p: 'a' }, { r, y: h / 2, p: 'a' }], 8, { a: { c } }, { bottom: shade(c, 0.7), top: 0x3e2723 }); k.setT(null); }
// Plante en pot : feuillage en volumes simples (pas de transparence dans le matériau des articles)
S('pplant', (k, s, c, d) => {
  const w = s[0], h = s[1], ph = Math.min(h * 0.38, w * 0.9), py = -h / 2 + ph / 2; POT(k, 0, py, w * 0.36, ph, d.c2 ?? 0xb5653a);
  const f = d.fo || 'bush', top = -h / 2 + ph; if (f === 'none') return;
  if (f === 'succulent') { for (let i = 0; i < 7; i++) { const a = i * 0.9; k.blob(Math.cos(a) * w * 0.12, top + 0.02, Math.sin(a) * w * 0.12, w * 0.1, w * 0.05, w * 0.06, i % 2 ? c : shade(c, 1.2), 5, 3); } return; }
  if (f === 'cactus') { k.blob(0, top + (h - ph) * 0.45, 0, w * 0.16, (h - ph) * 0.46, w * 0.16, c, 7, 4); k.blob(w * 0.15, top + (h - ph) * 0.45, 0, w * 0.07, (h - ph) * 0.16, w * 0.07, c, 5, 3); return; }
  if (f === 'palm') { k.tube(0, top + (h - ph) * 0.3, 0, w * 0.04, (h - ph) * 0.6, 0x6d4c41, 5, { open: true }); for (let i = 0; i < 6; i++) { const a = i * 1.05; k.setT(new THREE.Matrix4().makeTranslation(Math.cos(a) * w * 0.2, top + (h - ph) * 0.72, Math.sin(a) * w * 0.2).multiply(new THREE.Matrix4().makeRotationY(-a)).multiply(new THREE.Matrix4().makeRotationZ(-0.6))).pbox(0, 0, 0, w * 0.42, 0.006, w * 0.12, i % 2 ? c : shade(c, 1.15)).setT(null); } return; }
  if (f === 'tall') { k.blob(0, top + (h - ph) * 0.55, 0, w * 0.34, (h - ph) * 0.45, w * 0.34, c, 7, 4); k.blob(w * 0.08, top + (h - ph) * 0.3, w * 0.06, w * 0.3, (h - ph) * 0.25, w * 0.28, shade(c, 1.15), 6, 3); return; }
  if (f === 'flower') { k.blob(0, top + (h - ph) * 0.25, 0, w * 0.4, (h - ph) * 0.25, w * 0.4, 0x43a047, 7, 3); for (let i = 0; i < 5; i++) { const a = i * 1.26; k.blob(Math.cos(a) * w * 0.2, top + (h - ph) * 0.62, Math.sin(a) * w * 0.2, w * 0.12, w * 0.09, w * 0.12, i % 2 ? c : shade(c, 1.25), 6, 3); } return; }
  k.blob(0, top + (h - ph) * 0.45, 0, w * 0.48, (h - ph) * 0.48, w * 0.48, c, 7, 4); k.blob(w * 0.12, top + (h - ph) * 0.62, -w * 0.08, w * 0.3, (h - ph) * 0.3, w * 0.3, shade(c, 1.18), 6, 3);
});
// Seau de fleurs coupées (fleuriste)
S('pbucket', (k, s, c, d) => {
  const w = s[0], h = s[1], bh = h * 0.4; k.lathe([{ r: w * 0.32, y: -h / 2 }, { r: w * 0.4, y: -h / 2 + bh, p: 'a' }], 8, { a: { c: d.c2 ?? 0x90a4ae } }, { bottom: 0x78909c, top: 0x37474f });
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = (i % 3) * w * 0.12; k.blob(Math.cos(a) * r, h / 2 - h * 0.12 - (i % 2) * 0.03, Math.sin(a) * r, w * 0.13, w * 0.1, w * 0.13, i % 3 === 2 ? shade(c, 1.25) : c, 6, 3); }
  k.blob(0, -h / 2 + bh + (h - bh) * 0.3, 0, w * 0.3, (h - bh) * 0.32, w * 0.3, 0x2e7d32, 6, 3);
});
// Peluche basse définition : animal paramétrable (an)
S('pplush', (k, s, c, d) => {
  const w = s[0], h = s[1], dz = s[2], an = d.an || 'bear', c2 = d.c2 ?? shade(c, 1.35);
  if (an === 'snake') { for (let i = 0; i < 5; i++) k.blob(Math.sin(i) * w * 0.25, -h / 2 + h * 0.1 + i * h * 0.08, (i - 2) * dz * 0.15, w * 0.16, h * 0.1, w * 0.16, i % 2 ? c : c2, 6, 3); k.blob(0, h * 0.32, 0, w * 0.18, h * 0.14, w * 0.2, c, 6, 3); return; }
  const bodyY = -h * 0.18, headY = an === 'penguin' ? h * 0.2 : h * 0.24;
  k.blob(0, bodyY, 0, w * 0.4, h * 0.3, dz * 0.42, c, 7, 4);
  if (an === 'penguin') { k.blob(0, bodyY, dz * 0.2, w * 0.28, h * 0.24, dz * 0.25, 0xffffff, 6, 3); k.blob(0, h * 0.22, 0, w * 0.3, h * 0.2, dz * 0.36, c, 6, 3); k.blob(0, h * 0.2, dz * 0.33, w * 0.07, h * 0.03, dz * 0.12, 0xffa000, 4, 2); }
  else k.blob(0, headY, 0, w * 0.33, h * 0.24, dz * 0.4, c, 7, 4);
  if (an === 'bunny') { k.blob(-w * 0.12, h * 0.48, 0, w * 0.06, h * 0.15, w * 0.04, c, 5, 3); k.blob(w * 0.12, h * 0.48, 0, w * 0.06, h * 0.15, w * 0.04, c, 5, 3); }
  else if (an === 'cat' || an === 'fox') { k.blob(-w * 0.2, h * 0.44, 0, w * 0.08, h * 0.08, w * 0.04, an === 'fox' ? c : c, 4, 2); k.blob(w * 0.2, h * 0.44, 0, w * 0.08, h * 0.08, w * 0.04, c, 4, 2); }
  else if (an === 'dog') { k.blob(-w * 0.3, h * 0.2, 0, w * 0.08, h * 0.14, w * 0.05, shade(c, 0.7), 4, 2); k.blob(w * 0.3, h * 0.2, 0, w * 0.08, h * 0.14, w * 0.05, shade(c, 0.7), 4, 2); }
  else if (an === 'elephant') { k.blob(-w * 0.34, h * 0.24, 0, w * 0.14, h * 0.16, w * 0.04, c, 5, 3); k.blob(w * 0.34, h * 0.24, 0, w * 0.14, h * 0.16, w * 0.04, c, 5, 3); k.blob(0, h * 0.1, dz * 0.42, w * 0.06, h * 0.14, w * 0.06, c, 5, 3); }
  else if (an === 'unicorn') { k.blob(-w * 0.18, h * 0.44, 0, w * 0.06, h * 0.07, w * 0.04, c, 4, 2); k.blob(w * 0.18, h * 0.44, 0, w * 0.06, h * 0.07, w * 0.04, c, 4, 2); k.setT(new THREE.Matrix4().makeTranslation(0, h * 0.47, dz * 0.12)); k.lathe([{ r: w * 0.04, y: 0 }, { r: 0.002, y: h * 0.12, p: 'a' }], 5, { a: { c: 0xffd54f } }); k.setT(null); }
  else if (an === 'lion') { k.blob(0, headY, -dz * 0.05, w * 0.45, h * 0.32, dz * 0.35, d.c3 ?? 0x8d4a1d, 7, 3); k.blob(0, headY, dz * 0.08, w * 0.33, h * 0.24, dz * 0.38, c, 7, 4); }
  else if (an === 'frog') { k.blob(-w * 0.15, h * 0.42, dz * 0.1, w * 0.09, w * 0.09, w * 0.09, c, 5, 3); k.blob(w * 0.15, h * 0.42, dz * 0.1, w * 0.09, w * 0.09, w * 0.09, c, 5, 3); }
  else if (an !== 'penguin') { k.blob(-w * 0.24, h * 0.42, 0, w * 0.1, w * 0.1, w * 0.06, an === 'panda' ? 0x212121 : c, 5, 3); k.blob(w * 0.24, h * 0.42, 0, w * 0.1, w * 0.1, w * 0.06, an === 'panda' ? 0x212121 : c, 5, 3); }
  if (an !== 'penguin' && an !== 'frog') k.blob(0, h * 0.19, dz * 0.33, w * 0.13, h * 0.08, dz * 0.12, c2, 5, 3);
  const eye = an === 'panda' ? [0x212121, 0.05] : [0x111111, 0.025];
  for (const sx of [-1, 1]) { if (an === 'panda') k.blob(sx * w * 0.11, h * 0.29, dz * 0.31, w * 0.07, h * 0.05, 0.012, 0x212121, 4, 2); k.box(sx * w * 0.11, h * 0.3, dz * 0.36, 0.012 + w * 0.03, 0.012 + w * 0.03, 0.006, an === 'panda' ? 0xffffff : eye[0]); }
  for (const sx of [-1, 1]) { if (an !== 'penguin') k.blob(sx * w * 0.38, -h * 0.1, 0, w * 0.11, h * 0.13, w * 0.11, an === 'panda' ? 0x212121 : c, 5, 3); k.blob(sx * w * 0.2, -h * 0.44, dz * 0.12, w * 0.13, h * 0.07, w * 0.14, an === 'panda' ? 0x212121 : c, 5, 3); }
  if (d.c3 != null && an !== 'lion') k.box(0, -h * 0.02, dz * 0.4, w * 0.3, h * 0.06, 0.008, d.c3); // nœud / foulard
});
// Fruits & légumes basse définition (fr = variété)
S('pfruit', (k, s, c, d) => {
  const w = s[0] / 2, h = s[1] / 2, dz = s[2] / 2, f = d.fr || 'round', st = 0x5d4037, leaf = 0x43a047;
  if (f === 'pear') { k.blob(0, -h * 0.3, 0, w, h * 0.65, dz, c, 7, 4); k.blob(0, h * 0.35, 0, w * 0.6, h * 0.5, dz * 0.6, c, 6, 3); k.tube(0, h * 0.92, 0, 0.003, h * 0.3, st, 3, { open: true }); return; }
  if (f === 'long') { k.blob(0, 0, 0, w, h, dz, c, 6, 4); k.tube(0, h * 0.98, 0, w * 0.25, h * 0.12, d.c2 ?? leaf, 5); return; } // aubergine, courgette (verticale)
  if (f === 'leek') { k.tube(0, -h * 0.25, 0, w, h * 1.5, 0xfafafa, 6); k.lathe([{ r: w, y: h * 0.5 }, { r: w * 1.6, y: h, p: 'a' }], 6, { a: { c: leaf } }, { top: 0x2e7d32 }); return; }
  if (f === 'onion') { k.blob(0, -h * 0.1, 0, w, h * 0.85, dz, c, 7, 4); k.setT(new THREE.Matrix4().makeTranslation(0, h * 0.7, 0)); k.lathe([{ r: w * 0.25, y: 0 }, { r: 0.002, y: h * 0.32, p: 'a' }], 5, { a: { c: shade(c, 0.8) } }); k.setT(null); return; }
  if (f === 'pepper') { for (let i = 0; i < 3; i++) { const a = i * 2.1; k.blob(Math.cos(a) * w * 0.35, 0, Math.sin(a) * dz * 0.35, w * 0.6, h * 0.95, dz * 0.6, c, 6, 3); } k.tube(0, h * 0.95, 0, w * 0.12, h * 0.2, 0x33691e, 5); return; }
  if (f === 'pineapple') { k.blob(0, -h * 0.25, 0, w, h * 0.7, dz, c, 7, 4); for (let i = 0; i < 5; i++) { const a = i * 1.26; k.setT(new THREE.Matrix4().makeTranslation(Math.cos(a) * w * 0.15, h * 0.55, Math.sin(a) * w * 0.15).multiply(new THREE.Matrix4().makeRotationZ(Math.cos(a) * 0.4)).multiply(new THREE.Matrix4().makeRotationX(-Math.sin(a) * 0.4))).lathe([{ r: w * 0.12, y: 0 }, { r: 0.002, y: h * 0.5, p: 'a' }], 4, { a: { c: leaf } }).setT(null); } return; }
  if (f === 'cabbage') { k.blob(0, 0, 0, w, h, dz, c, 8, 4); k.blob(0, h * 0.15, w * 0.15, w * 0.85, h * 0.8, dz * 0.8, shade(c, 1.15), 6, 3); return; }
  if (f === 'grapes') { for (let i = 0; i < 9; i++) { const yy = h * 0.5 - (i < 4 ? 0 : i < 7 ? 0.45 : 0.85) * h, n = i < 4 ? 4 : i < 7 ? 3 : 2, j = i < 4 ? i : i < 7 ? i - 4 : i - 7; k.blob((j - (n - 1) / 2) * w * 0.45, yy, (i % 2) * dz * 0.3, w * 0.28, w * 0.28, w * 0.28, i % 2 ? c : shade(c, 1.15), 5, 3); } k.tube(0, h * 0.85, 0, 0.003, h * 0.3, st, 3, { open: true }); return; }
  if (f === 'mushroom') { k.tube(0, -h * 0.35, 0, w * 0.35, h * 0.7, 0xf5efe6, 6); k.blob(0, h * 0.25, 0, w, h * 0.6, dz, c, 7, 3); return; }
  if (f === 'banana') { for (let i = 0; i < 3; i++) k.setT(new THREE.Matrix4().makeTranslation((i - 1) * w * 0.35, 0, 0).multiply(new THREE.Matrix4().makeRotationX(0.5))).tube(0, 0, 0, w * 0.22, s[2] * 0.9, c, 5, { tc: 0x5d4037 }).setT(null); return; }
  if (f === 'melon') { k.blob(0, 0, 0, w, h, dz, c, 8, 5); return; }
  if (f === 'loaf') { k.blob(0, 0, 0, w, h, dz, c, 8, 5); for (let i = -1; i <= 1; i++) { const z = i * dz * 0.45; k.setT(new THREE.Matrix4().makeTranslation(0, h * 0.96 * Math.sqrt(Math.max(0, 1 - (z / dz) ** 2)), z).multiply(new THREE.Matrix4().makeRotationY(0.4))); k.quad([-w * 0.45, 0, dz * 0.05], [w * 0.45, 0, dz * 0.05], [w * 0.45, 0, -dz * 0.05], [-w * 0.45, 0, -dz * 0.05], shade(c, 1.3)); k.setT(null); } return; }
  k.blob(0, 0, 0, w, h, dz, c, f === 'small' ? 6 : 7, 4); // round : pêche, kiwi, prune, abricot, pomme de terre, citron vert…
  if (d.fl !== false && f !== 'small') { k.tube(0, h * 0.95, 0, 0.003, h * 0.25, st, 3, { open: true }); if (d.lf) k.blob(w * 0.25, h * 0.98, 0, w * 0.3, 0.004, w * 0.14, leaf, 4, 2); }
});
// Cagette de fruits ou légumes : cageot + tas texturé + quelques fruits en volume
S('pcrate', (k, s, c, d) => {
  const W = s[0], H = s[1], D = s[2], wood = d.c2 ?? 0xc8a165, y0 = -H / 2, wh = H * 0.55;
  const lab = k.pk(d, 'plain', W, wh, { bg: wood, brand: d.b || 'VERGERS DE FRANCE', fg: 0x5d4037 }, (d.b || 'crate') + ':crate');
  k.quad([-W / 2, y0, D / 2], [W / 2, y0, D / 2], [W / 2, y0 + wh, D / 2], [-W / 2, y0 + wh, D / 2], 0xffffff, lab);
  k.quad([W / 2, y0, -D / 2], [-W / 2, y0, -D / 2], [-W / 2, y0 + wh, -D / 2], [W / 2, y0 + wh, -D / 2], wood);
  k.quad([W / 2, y0, D / 2], [W / 2, y0, -D / 2], [W / 2, y0 + wh, -D / 2], [W / 2, y0 + wh, D / 2], shade(wood, 0.9)); k.quad([-W / 2, y0, -D / 2], [-W / 2, y0, D / 2], [-W / 2, y0 + wh, D / 2], [-W / 2, y0 + wh, -D / 2], shade(wood, 0.9));
  const U = ITEMS[d.pk?.of]; const fc = U ? U.c : c; const top = k.shared('fruits:' + (fc >>> 0).toString(16), 96, 72, { kind: 'fruits', bg: fc });
  const my = y0 + wh * 0.92; k.pbox(0, (y0 + my) / 2, 0, W * 0.98, my - y0, D * 0.98, shade(fc, 0.7), { Y: top }, {}, 'yzZxX');
  if (U) { const g = unitGeo(U, k.atlas, 1); const rnd = mulberry32((d.id.length * 7) | 0); const n = Math.min(5, Math.max(2, Math.round(W * D / (U.s[0] * U.s[2]) / 6))); for (let i = 0; i < n; i++) k.copyGeo(g, new THREE.Matrix4().makeTranslation((rnd() - 0.5) * (W - U.s[0]), my + U.s[1] * 0.38, (rnd() - 0.5) * (D - U.s[2])).multiply(new THREE.Matrix4().makeRotationY(rnd() * 6))); }
});
// unités à couvercle (pots, boîtes, bouteilles) : dessus des rangs arrière couleur couvercle ; sinon couleur du produit
const JARLIKE = new Set(['pjar', 'jar', 'pcan', 'can', 'pbot', 'bottle', 'cyl', 'carton', 'pbrick']);
// Présentoir prêt-à-vendre (barquette carton) : premier rang réel, rangs arrière en bloc à dessus imprimé
S('ptray', (k, s, c, d) => {
  const P = d.pk || {}, U = ITEMS[P.of]; if (!U) { k.box(0, 0, 0, s[0], s[1], s[2], c); return; }
  const nx = P.nx || 3, nz = P.nz || 3, W = s[0], H = s[1], D = s[2], y0 = -H / 2, t = 0.003, uh = U.s[1];
  const gx = (W - 2 * t) / nx, gz = (D - 2 * t) / nz, fh = Math.min(H, Math.max(0.025, uh * 0.3)), wh = Math.min(H, Math.max(0.03, uh * 0.5));
  const lab = k.pk(d, 'tray', W, fh, { bg: d.lc ?? 0xffffff, brand: U.b, name: U.l ?? U.name, picto: U.pi, accent: U.lc ?? U.c }, null, 12);
  const kc = d.c2 ?? shade(d.lc ?? 0xf5f5f5, 0.92);
  k.quad([-W / 2, y0, D / 2], [W / 2, y0, D / 2], [W / 2, y0 + fh, D / 2], [-W / 2, y0 + fh, D / 2], 0xffffff, lab);
  k.quad([W / 2, y0, -D / 2], [-W / 2, y0, -D / 2], [-W / 2, y0 + wh, -D / 2], [W / 2, y0 + wh, -D / 2], kc);
  k.quad([W / 2, y0, D / 2], [W / 2, y0, -D / 2], [W / 2, y0 + wh, -D / 2], [W / 2, y0 + fh, D / 2], kc); k.quad([-W / 2, y0, -D / 2], [-W / 2, y0, D / 2], [-W / 2, y0 + fh, D / 2], [-W / 2, y0 + wh, -D / 2], kc);
  if (P.hdr) { const hl = k.pk(d, 'box', W, H, { bg: U.lc ?? U.c, brand: U.b, name: U.l ?? U.name, picto: U.pi, sub: '× ' + nx * nz }, d.id + ':hdr'); k.pbox(0, 0, -D / 2 + 0.004, W, H, 0.008, kc, { Z: hl }); } // fronton imprimé
  const g = unitGeo(U, k.atlas, 1), uy = y0 + 0.002 + uh / 2;
  const rot = P.rot ? new THREE.Matrix4().makeRotationY(P.rot) : null, heavy = g.attributes.position.count * nx > 340; // unités détaillées : simple bloc coloré
  for (let i = 0; i < nx; i++) { const x = -W / 2 + t + gx * (i + 0.5), z = D / 2 - t - gz * 0.5; if (heavy) { k.box(x, uy, z, Math.min(U.s[0], gx * 0.92), uh, Math.min(U.s[2], gz * 0.92), U.c); continue; } const m = new THREE.Matrix4().makeTranslation(x, uy, z); if (rot) m.multiply(rot); k.copyGeo(g, m); }
  if (nz > 1) {
    const z0 = -D / 2 + t, z1 = D / 2 - t - gz, top = y0 + 0.002 + uh * (P.tf ?? 0.97);
    const lids = k.shared(`lids:${nx}:${nz - 1}:${P.sq ? 1 : 0}`, Math.min(192, 20 * nx), Math.min(192, 20 * (nz - 1)), { kind: 'lids', nx, nz: nz - 1, square: !!P.sq, ring: !!P.ring });
    k.pbox(0, (y0 + top) / 2, (z0 + z1) / 2, W - 2 * t, top - y0, z1 - z0, shade(P.bc ?? U.lc ?? U.c, 0.75), { Y: lids }, { Y: P.lid ?? (JARLIKE.has(U.shape) ? U.c2 ?? 0xd6d6d6 : U.lc ?? U.c) }, 'y');
  }
});
// Lot sous film / étui carton (packs de bouteilles, yaourts, canettes)
S('pmulti', (k, s, c, d) => {
  const P = d.pk || {}, U = ITEMS[P.of]; if (!U) { k.box(0, 0, 0, s[0], s[1], s[2], c); return; }
  const nx = P.nx || 3, nz = P.nz || 2, W = s[0], H = s[1], D = s[2], y0 = -H / 2, uh = U.s[1], gx = W / nx, gz = D / nz;
  const g = unitGeo(U, k.atlas, 1);
  if (P.sleeve) { // étui carton imprimé qui cache le bas des unités
    const sh = Math.min(H, uh * (P.sh ?? 0.72)), lab = k.pk(d, d.lk || 'box', W, sh, { layout: d.lay ?? 3 }), side = k.pk(d, 'plain', D, sh, { bg: d.lc ?? c, brand: d.b }, d.id + ':side');
    k.pbox(0, y0 + sh / 2, 0, W, sh, D, c, { Z: lab, z: lab, X: side, x: side }, {}, 'Y');
    const top = y0 + uh * 0.98, lids = k.shared(`lids:${nx}:${nz}:0`, Math.min(192, 20 * nx), Math.min(192, 20 * nz), { kind: 'lids', nx, nz });
    if (P.tops !== false) k.pbox(0, (y0 + sh + top) / 2, 0, W * 0.96, top - y0 - sh, D * 0.96, shade(U.lc ?? U.c, 0.7), { Y: lids }, { Y: P.lid ?? U.c2 ?? 0xd6d6d6 }, 'y');
    if (P.handle) k.box(0, y0 + sh + 0.012, 0, W * 0.3, 0.024, D * 0.15, c);
    return;
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const m = new THREE.Matrix4().makeTranslation(-W / 2 + gx * (i + 0.5), y0 + uh / 2, D / 2 - gz * (j + 0.5));
    if (j === 0 || nx * nz <= 4 || P.all) k.copyGeo(g, m);
  }
  if (nz > 1 && !(nx * nz <= 4 || P.all)) { const top = y0 + uh * (P.tf ?? 0.8), lids = k.shared(`lids:${nx}:${nz - 1}:0`, Math.min(192, 20 * nx), Math.min(192, 20 * (nz - 1)), { kind: 'lids', nx, nz: nz - 1 }); k.pbox(0, (y0 + top) / 2, -gz / 2, W * 0.96, top - y0, D - gz, shade(U.c, 0.8), { Y: lids }, { Y: P.lid ?? U.c2 ?? 0xd6d6d6 }, 'y'); }
  if (P.handle) k.box(0, H / 2 - 0.01, 0, W * 0.3, 0.02, 0.03, 0xfafafa);
});
// Carton de réserve fermé (étiquette imprimée, ruban adhésif sur le dessus)
S('pcase', (k, s, c, d) => { const r = k.pk(d, 'case', s[0], s[1], { bg: d.lc ?? c, fragile: d.fragile }); const kc = ((d.lc ?? c) >>> 0).toString(16), sd = k.shared('caseside:' + (d.b || '') + ':' + kc + (d.fragile ? ':f' : ''), 88, 64, { kind: 'case', bg: d.lc ?? c, brand: d.b || '', name: d.b ? '' : 'HÉLIOS', fragile: d.fragile }); k.pbox(0, 0, 0, s[0], s[1], s[2], c, { Z: r, z: r, X: sd, x: sd, Y: k.shared('casetop:' + ((d.lc ?? c) >>> 0).toString(16), 64, 64, { kind: 'casetop', bg: d.lc ?? c }) }); });
// Parfum : flacon facetté + col + bouchon
S('pperf', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], bh = h * 0.66, y0 = -h / 2, lab = k.pk(d, 'cosmetic', w * 0.7, bh * 0.5, { bg: d.lc ?? 0xfafafa });
  k.pbox(0, y0 + bh / 2, 0, w, bh, dd, c, { Z: lab }, { Z: 0xffffff });
  k.tube(0, y0 + bh + h * 0.04, 0, Math.min(w, dd) * 0.14, h * 0.08, d.c2 ?? 0xd4af37, 6);
  if (d.cap === 'ball') k.blob(0, y0 + bh + h * 0.2, 0, w * 0.26, h * 0.13, w * 0.26, d.c3 ?? 0x212121, 6, 3); else k.pbox(0, y0 + bh + h * 0.2, 0, w * 0.42, h * 0.24, dd * 0.6, d.c3 ?? 0x212121);
});
// Lunettes (optique) : verres teintés, cerclage et branches en boîtes fines
S('pglass', (k, s, c, d) => {
  const w = s[0], h = s[1], L = s[2], lens = d.c2 ?? 0x37474f, lw = w * 0.4, lh = h * 0.8;
  for (const sx of [-1, 1]) { k.box(sx * w * 0.24, 0, L / 2 - 0.004, lw, lh, 0.003, lens); k.box(sx * w * 0.24, lh / 2, L / 2 - 0.002, lw * 1.04, h * 0.14, 0.007, c); k.box(sx * w * 0.24, -lh / 2, L / 2 - 0.002, lw * 1.02, h * 0.06, 0.006, c); k.box(sx * w * 0.48, lh * 0.3, 0, 0.006, h * 0.1, L, c); }
  k.box(0, lh * 0.25, L / 2 - 0.002, w * 0.1, h * 0.08, 0.006, c);
});
// Mug / tasse
S('pmug', (k, s, c, d) => {
  const R = Math.min(s[0] * 0.78, s[2]) / 2, h = s[1], lab = d.l || d.pi ? k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.7, { bg: c }) : null;
  k.lathe([{ r: R * 0.9, y: -h / 2 }, { r: R, y: -h / 2 + h * 0.12, p: 'a' }, { r: R, y: h / 2, p: lab ? 'l' : 'a' }, { r: R * 0.86, y: h / 2, p: 'i' }, { r: R * 0.86, y: h * 0.25, p: 'i' }], segsOf(k, d, 10), { a: { c }, l: { c: 0xffffff, rect: lab }, i: { c: d.c2 ?? shade(c, 0.9) } }, { bottom: shade(c, 0.8), top: d.c2 ?? shade(c, 0.85) });
  k.box(R + 0.012, 0, 0, 0.012, h * 0.55, 0.012, c); k.box(R + 0.006, h * 0.22, 0, 0.022, 0.01, 0.012, c); k.box(R + 0.006, -h * 0.22, 0, 0.022, 0.01, 0.012, c);
});
// Casserole / poêle / saladier
S('ppan', (k, s, c, d) => {
  const R = Math.min(s[0], s[2]) / 2, h = s[1], t = d.pt || 'pot';
  if (t === 'bowl') { k.lathe([{ r: R * 0.55, y: -h / 2 }, { r: R, y: h / 2, p: 'a' }, { r: R * 0.92, y: h / 2, p: 'i' }, { r: R * 0.5, y: -h * 0.35, p: 'i' }], 10, { a: { c }, i: { c: d.c2 ?? shade(c, 1.1) } }, { bottom: c, top: d.c2 ?? shade(c, 1.1) }); return; }
  const ph = t === 'pan' ? h * 0.5 : h; k.lathe([{ r: R * 0.95, y: -h / 2 }, { r: R, y: -h / 2 + ph, p: 'a' }, { r: R * 0.94, y: -h / 2 + ph, p: 'i' }, { r: R * 0.94, y: -h / 2 + 0.006, p: 'i' }], 12, { a: { c }, i: { c: d.c2 ?? 0x424242 } }, { bottom: 0x616161, top: d.c2 ?? 0x424242 });
  if (t === 'pan') k.box(R + s[0] * 0.18, -h / 2 + ph * 0.8, 0, s[0] * 0.36, 0.014, 0.022, 0x212121); else for (const sx of [-1, 1]) k.box(sx * (R + 0.02), h * 0.3, 0, 0.04, 0.014, 0.03, 0x212121);
});
// Outils (variantes simples)
S('ptool', (k, s, c, d) => {
  const w = s[0], h = s[1], L = s[2], t = d.tl || 'pliers', m = 0x9e9e9e;
  if (t === 'pliers') { for (const sx of [-1, 1]) { k.setT(new THREE.Matrix4().makeRotationY(sx * 0.12)).pbox(sx * w * 0.12, 0, -L * 0.15, w * 0.18, h, L * 0.65, c).pbox(sx * w * 0.06, 0, L * 0.32, w * 0.1, h * 0.8, L * 0.32, m).setT(null); } return; }
  if (t === 'brush') { k.box(0, 0, -L * 0.2, w * 0.3, h * 0.6, L * 0.6, c); k.box(0, 0, L * 0.12, w * 0.8, h * 0.8, L * 0.06, m); k.box(0, 0, L * 0.3, w, h, L * 0.3, 0xd7ccc8); return; }
  if (t === 'trowel') { k.box(0, 0, -L * 0.3, w * 0.25, h, L * 0.38, c); k.box(0, -h * 0.3, L * 0.2, w, h * 0.12, L * 0.55, m); return; }
  if (t === 'cutter') { k.box(0, 0, -L * 0.1, w, h, L * 0.8, c); k.box(0, 0, L * 0.4, w * 0.4, h * 0.3, L * 0.2, 0xe0e0e0); return; }
  if (t === 'level') { k.box(0, 0, 0, w, h, L, c); k.box(0, h * 0.5, 0, w * 0.5, 0.004, L * 0.12, 0xc6ff00); return; }
  if (t === 'roller') { k.tube(0, h * 0.25, L * 0.25, h * 0.25, w, c, 8, { m: new THREE.Matrix4().makeRotationZ(Math.PI / 2) }); k.box(0, -h * 0.1, -L * 0.2, w * 0.08, h * 0.08, L * 0.6, 0x9e9e9e); k.box(0, -h * 0.25, -L * 0.42, w * 0.12, h * 0.25, L * 0.18, 0x212121); return; }
  k.box(0, 0, 0, w, h, L, c);
});
// Lampe d'ambiance / veilleuse simple (déco)
S('plamp', (k, s, c, d) => {
  const w = s[0], h = s[1], st = d.lt || 'table';
  if (st === 'globe') { k.tube(0, -h * 0.42, 0, w * 0.3, h * 0.16, d.c2 ?? 0x5d4037, 8); k.blob(0, h * 0.1, 0, w * 0.48, h * 0.4, w * 0.48, c, 8, 5); k.meta.light = [0, h * 0.1, 0]; return; }
  k.tube(0, -h * 0.46, 0, w * 0.28, h * 0.08, d.c2 ?? 0x424242, 8); k.tube(0, -h * 0.12, 0, 0.01, h * 0.6, d.c2 ?? 0x424242, 5, { open: true });
  k.lathe([{ r: w * 0.5, y: h * 0.1 }, { r: w * 0.32, y: h / 2, p: 'a' }], 10, { a: { c } }); k.meta.light = [0, h * 0.25, 0];
});

const geoCache = new Map();
const metaCache = new Map();

function bake(def, atlas, lod) {
  const b = new GeoBuilder({ colors: true, white: atlas.white() });
  const kit = new Kit(b, atlas); kit.lod = lod;
  const fn = SHAPES[def.shape] || SHAPES.box;
  try { fn(kit, def.s, def.c, def); } catch (e) { console.warn('forme', def.id, e); b.pos.length = b.nor.length = b.uv.length = b.col.length = b.idx.length = 0; SHAPES.box(kit, def.s, def.c, def); }
  if (b.vertexCount === 0) SHAPES.box(kit, def.s, def.c, def);
  return { g: b.build(), meta: kit.meta };
}
export function buildItemGeometry(def, atlas) {
  if (geoCache.has(def.id)) return geoCache.get(def.id);
  const { g, meta } = bake(def, atlas, 0);
  geoCache.set(def.id, g); metaCache.set(def.id, meta);
  return g;
}
// Géométrie simplifiée d'une unité (dans les lots, présentoirs et cagettes)
function unitGeo(def, atlas, lod = 1) {
  const key = def.id + '#' + lod; if (geoCache.has(key)) return geoCache.get(key);
  const { g } = bake(def, atlas, lod); geoCache.set(key, g); return g;
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
