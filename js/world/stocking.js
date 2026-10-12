// Remplissage des rayons : après les articles listés dans js/data/shops.js, complète les planches restantes
// (assortiment du magasin en « facings », rangées en profondeur, présentoirs) pour des magasins bien achalandés.
// ctx : { world, game, ctl, P, s, rng, boards, floorSpots, addStatic(defId, x, y, z, ry, zone, data) }
//
// Déroulé (déterministe : flux aléatoire dérivé de ctx.rng) :
// 1. Planches → segments bornés à l'emprise du magasin ou de sa réserve (les planches de réserve de l'étage
//    débordent de la boutique dans la description du plan : on n'en garde que la partie intérieure).
// 2. Les articles listés que placeContents a posés sur des planches sont « mis en réserve » puis replacés dans le
//    planogramme (positions d'origine réécrites avant la fusion des meshes), ce qui garantit aussi qu'aucun article
//    ne reste hors du centre.
// 3. Rôle de chaque étage : produits, gros formats (bas des gondoles), cartons de surstock (haut), soubassement
//    fermé ou caisson lumineux (boutiques : décor sans objet).
// 4. Planogramme : chaque meuble est découpé en bandes verticales par famille (cat, petites familles regroupées) ;
//    chaque case (bande × étage) reçoit des blocs de produits (facings côte à côte, rangées en profondeur, piles).
//    Si le remplissage naturel dépasse le budget d'objets du magasin (BUDGET), le budget est réparti par mètre de
//    planche (plafonné au remplissage naturel de chaque case) et chaque bloc prend le produit dont la largeur colle
//    à la place disponible par objet : présentoirs, rangées, piles et lots quand le budget est serré, blocs espacés
//    régulièrement ; aucun étage ne reste vide. Les objets uniques (histoire, clés, costumes) ne sont jamais
//    dupliqués, quelques objets encombrants ou de survie (globes, piles, soins) sont plafonnés (RARE).
// 5. Décor non ramassable fusionné (un mesh par zone, matériau « props ») : bandes de prix, étiquettes, stop-rayons
//    promotionnels, panneaux de têtes de gondole, soubassements, caissons lumineux ; présentoirs de sol (palettes,
//    bacs vrac, cagettes, portants) avec collisions. Les présentoirs ouverts reçoivent leur contenu (R : Fouiller).
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { Box, LAYER } from '../engine/physics.js';
import { quickGeometry, buildItemGeometry } from './meshes.js';

// Objets « au repos » visés par magasin (zones boutique + réserve, articles listés compris). Total ≈ 16 500 : de quoi
// garnir ~90 % de chaque planche (premiers rangs, cartons du haut, réserve) ; le reste va aux rangées arrière et aux piles.
// Si les premiers rangs l'exigent, le budget peut être dépassé jusqu'à HARD × BUDGET (produits plus larges au-delà).
export const BUDGET = {
  hyper: 3900, jouets: 1250, quincaillerie: 820, tabac: 540, pharma: 560, librairie: 650, parfumerie: 480, opticien: 420, mobizone: 380, bonbons: 450,
  octet: 380, photo: 330, deco: 410, chaussures: 600, sport: 440, mode: 340, costumes: 220, pixel: 520, videoclub: 560, instruments: 250, coiffeur: 190,
  animalerie: 280, fleuriste: 280, bijouterie: 330, boulangerie: 270, cafe: 270, electro: 280, pizzeria: 120, burger: 150, sushi: 130, glacier: 150,
  cinema: 90, arcade: 150, staff: 90, direction: 130, toilettes: 60,
};
// Style d'exposition : écart entre facings, largeur visée d'un bloc de facings, rangées en profondeur et piles maximales
const STYLES = {
  dense: { gap: 0.008, target: 0.36, rows: 3, stack: 3 },
  normal: { gap: 0.014, target: 0.34, rows: 2, stack: 2 },
  premium: { gap: 0.025, target: 0.3, rows: 1, stack: 1 },
};
const SHOP_STYLE = {
  hyper: 'dense', pharma: 'dense', tabac: 'dense', quincaillerie: 'dense', bonbons: 'dense', librairie: 'dense', videoclub: 'dense', pixel: 'normal',
  opticien: 'premium', parfumerie: 'normal', bijouterie: 'premium', mode: 'premium', chaussures: 'normal', mobizone: 'normal',
};
// Boutiques : pas de gros formats imposés au premier étage
const BOUTIQUE = new Set(['parfumerie', 'opticien', 'bijouterie', 'mobizone', 'photo', 'octet', 'chaussures', 'sport', 'deco', 'mode', 'costumes', 'coiffeur', 'instruments', 'electro']);
// Taux de remplissage visé du premier rang de chaque planche, dépassement toléré du budget pour y parvenir
const FILL = 0.92, HARD = 1.3;
// Familles posées de préférence sur les tables / étals profonds
const TABLE_CATS = { hyper: ['fruits', 'legumes'], boulangerie: ['boulangerie', 'pain'], fleuriste: ['plantes', 'fleurs'], librairie: ['livres'], mode: ['vetements'], jouets: ['peluches'] };
// Noms affichés sur les panneaux de têtes de gondole
const CAT_SIGN = {
  pates: 'PÂTES · RIZ', riz: 'RIZ · LÉGUMES SECS', conserves: 'CONSERVES', sauces: 'SAUCES · CONDIMENTS', huiles: 'HUILES · VINAIGRES', apero: 'APÉRITIF', cereales: 'PETIT-DÉJEUNER',
  cafe: 'CAFÉ · THÉ', tartiner: 'CONFITURES · MIEL', biscuits: 'BISCUITS', chocolat: 'CHOCOLAT · CONFISERIE', eaux: 'EAUX', sodas: 'SODAS · SIROPS', jus: 'JUS DE FRUITS', vins: 'VINS',
  bieres: 'BIÈRES', alcools: 'SPIRITUEUX', lait: 'LAIT', cremerie: 'CRÈMERIE', surgeles: 'SURGELÉS', fruits: 'FRUITS', legumes: 'LÉGUMES', hygiene: 'HYGIÈNE · BEAUTÉ', bebe: 'BÉBÉ',
  entretien: 'ENTRETIEN', papier: 'PAPIER · MÉNAGE', animaux: 'ANIMAUX', bazar: 'BAZAR', pain: 'PAIN', outils: 'OUTILLAGE', quincaillerie: 'QUINCAILLERIE', peinture: 'PEINTURE', jardin: 'JARDIN',
};
const PROMOS = [['PROMO', '-30 %'], ['NOUVEAU', null], ['PRIX CHOC', null], ['2 + 1', 'OFFERT'], ['-50 %', 'le 2e'], ['BIO', null], ['LOCAL', null], ['LOT', 'économique'], ['SOLDES', '-20 %'], ['COUP DE CŒUR', null]];
// Formes empilables (dessus plat) et pile maximale propre à la forme
const STACK = { pbox: 3, pcan: 3, pcase: 2, pshoebox: 4, pfold: 3, ppile: 2, ptray: 2, labelbox: 3, prolls: 2 };
const FLOOR_SHAPES = new Set(['phang']);

const _q = new THREE.Quaternion(), _e = new THREE.Euler();

export function stockShop(ctx) {
  try { new Stocker(ctx).run(); } catch (e) { console.error('[stocking]', ctx.s?.id, e); }
}

class Stocker {
  constructor(ctx) {
    Object.assign(this, ctx); this.g = ctx.game; this.R = ctx.rng.fork ? ctx.rng.fork('stock') : ctx.rng;
    this.st = STYLES[SHOP_STYLE[ctx.s.id] || 'normal'];
    this.zf = ctx.world.zone(ctx.s.id); this.zb = ctx.world.zone(ctx.s.id + '_back');
    this.floorY = ctx.ctl.y; this.decor = new Map(); this.added = 0; this.moved = 0;
    this.slots = []; this.blocks = []; this.cells = []; this.useCount = new Map(); this.placed = new Map();
  }
  run() {
    if (!this.zf) return;
    this.buildSegments();
    this.collectPool();
    this.products();
    const before = this.before = this.countHome();
    this.allowance = Math.max(0, (BUDGET[this.s.id] ?? 200) - before - 10);
    this.plan();
    this.choose();
    this.place();
    this.floorDisplays();
    this.strays();
    this.leftovers();
    this.openDisplays();
    this.buildDecor();
    const fronts = this.kept.filter((q) => q.front && !q.sg.back).length, cover = this.coverage();
    (this.world.stockStats ||= {})[this.s.id] = { before, added: this.added, moved: this.moved, slots: this.slots.length, kept: this.kept.length, fronts, allowance: this.allowance, wantP: +(this.wantP || 0).toFixed(3), cover, segs: this.segs.length };
  }
  // part de la longueur des planches de la boutique occupée par le premier rang (diagnostic)
  coverage() {
    const occ = new Map(); for (const sl of this.kept) if (sl.r === 0 && sl.k === 0) occ.set(sl.sg, (occ.get(sl.sg) || 0) + sl.p.w);
    let L = 0, U = 0; for (const sg of this.segs) if (!sg.back) { L += sg.len; U += Math.min(sg.len, occ.get(sg) || 0); }
    return L ? +(U / L).toFixed(2) : 0;
  }
  countHome() { let n = 0; for (const z of [this.s.id, this.s.id + '_back']) n += (this.g.props.byZone.get(z) || []).length; return n; }

  // ───────── 1. segments ─────────
  buildSegments() {
    const segs = []; const fx = new Map();
    for (const b of this.boards) {
      const back = b.zone === this.s.id + '_back'; if (b.noLabels && !back) continue; // plans de travail du personnel : pas de marchandise const z = back ? this.zb : (b.zone === this.s.id ? this.zf : this.world.zone(b.zone)); if (!z) continue;
      const lo = b.ax === 'x' ? z.min[0] : z.min[2], hi = b.ax === 'x' ? z.max[0] : z.max[2];
      const plo = b.ax === 'x' ? z.min[2] : z.min[0], phi = b.ax === 'x' ? z.max[2] : z.max[0];
      if (b.c < plo - 0.05 || b.c > phi + 0.05) continue;
      const a0 = Math.max(b.a0, lo + 0.22), a1 = Math.min(b.a1, hi - 0.22); if (a1 - a0 < 0.3) continue;
      const seg = { b, ax: b.ax, a0, a1, len: a1 - a0, y: b.y, c: b.c, depth: b.depth, clear: b.clear, ry: b.ry, fx: Math.sin(b.ry), fz: Math.cos(b.ry), zone: b.zone, back, h: b.y - this.floorY };
      segs.push(seg);
      const key = [b.ax, b.c.toFixed(2), a0.toFixed(1), a1.toFixed(1), b.zone, b.ry.toFixed(2)].join('|');
      if (!fx.has(key)) fx.set(key, { key, segs: [], back, order: fx.size });
      fx.get(key).segs.push(seg);
    }
    for (const f of fx.values()) {
      f.segs.sort((p, q) => p.y - q.y); f.len = f.segs[0].len; f.kind = f.back ? 'back' : f.segs[0].depth >= 0.78 ? 'table' : 'shelf';
      f.segs.forEach((sg, i) => { sg.level = i; sg.levels = f.segs.length; sg.top = i === f.segs.length - 1; sg.fix = f; sg.kind = f.kind; });
      // dernier étage d'une étagère murale : la hauteur libre n'est limitée que par le plafond
      const t = f.segs[f.segs.length - 1]; if (f.kind === 'shelf' && f.segs.length >= 3 && t.h > 1.6) t.clear = Math.max(t.clear, 0.55);
    }
    for (const sg of segs) sg.pri = sg.back ? 1 : sg.kind === 'table' ? 5 : sg.h > 2.0 ? 2 : sg.h > 1.75 ? 3 : sg.h < 0.55 ? 4 : 5;
    this.segs = segs; this.fixtures = [...fx.values()].sort((p, q) => p.order - q.order);
  }

  // ───────── 2. articles déjà posés sur les planches ─────────
  collectPool() {
    const pool = new Map(); this.pool = pool; this.poolCount = 0;
    for (const z of [this.s.id, this.s.id + '_back']) for (const pr of this.g.props.byZone.get(z) || []) {
      const d = pr.def; if (d.fixed || !pr.home) continue;
      const hy = d.s[1] / 2 + 0.002;
      const on = this.boards.some((b) => !(b.noLabels && b.zone === this.s.id) && Math.abs(pr.home.y - (b.y + hy)) < 0.012 && (b.ax === 'x' ? Math.abs(pr.home.z - b.c) < 0.012 && pr.home.x > b.a0 - 0.06 && pr.home.x < b.a1 + 0.06 : Math.abs(pr.home.x - b.c) < 0.012 && pr.home.z > b.a0 - 0.06 && pr.home.z < b.a1 + 0.06));
      if (!on) continue;
      if (!pool.has(pr.defId)) pool.set(pr.defId, []); pool.get(pr.defId).push(pr); this.poolCount++;
    }
    this.pinLeft = new Map([...pool].map(([id, l]) => [id, l.length]));
  }

  // ───────── 3. assortiment ─────────
  products() {
    const map = new Map();
    const mk = (id, d, n) => { const e = this.ext(d); return { id, d, n, cat: d.cat || 'divers', w: e.w, h: e.h, dep: e.dep, by: e.by, vol: d.s[0] * d.s[1] * d.s[2] }; };
    for (const [id, n] of this.s.items || []) {
      const d = ITEMS[id]; if (!d || d.fixed) continue;
      if (map.has(id)) { map.get(id).n += n; continue; }
      map.set(id, mk(id, d, n));
    }
    for (const [id, list] of this.pool) if (!map.has(id)) map.set(id, mk(id, ITEMS[id], list.length));
    // objets uniques (histoire, clés, costumes, articles historiques listés une seule fois) : jamais dupliqués
    // quelques objets de décor ne se multiplient pas au-delà d'un petit nombre (un globe par rayon suffit)
    for (const p of map.values()) { const d = p.d, P = d.p || {}; p.unique = !!(P.lore || P.b13 || P.master || P.tape === 'bobby_ad' || (!d.cat && !d.pk && p.n <= 1)); p.cap = RARE[p.id] ? Math.max(p.n, RARE[p.id]) : Infinity; }
    this.prods = [...map.values()];
    this.cats = new Map();
    for (const p of this.prods) { const k = p.d.shape === 'pcase' ? '#reserve' : FLOOR_SHAPES.has(p.d.shape) ? '#floor' : p.cat; if (!this.cats.has(k)) this.cats.set(k, []); this.cats.get(k).push(p); }
  }

  // Encombrement réel (géométrie cuite, en cache) : quelques modèles débordent de leur boîte (antennes, écrans, anses)
  ext(d) {
    const g = buildItemGeometry(d, this.g.atlas); if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox;
    return { w: Math.max(d.s[0], b.max.x - b.min.x), h: Math.max(d.s[1], b.max.y - b.min.y), dep: Math.max(d.s[2], b.max.z - b.min.z), by: -b.min.y };
  }

  // ───────── 4. planogramme ─────────
  // Premier rang de chaque planche rempli à ~90 % (facings jointifs, quelques trous naturels) ; le budget ne règle
  // que la largeur visée par objet (présentoirs, rangées, lots quand il est serré) et les rangées arrière / piles.
  plan() {
    const id = this.s.id, budget = BUDGET[id] ?? 200;
    let P = 0; // largeur visée par objet (0 : tailles naturelles)
    for (let pass = 0; pass < 4; pass++) {
      this.planPass(P);
      const fronts = this.slots.filter((q) => q.front).length, hard = Math.round(budget * HARD) - this.before + this.poolCount;
      if (fronts <= hard || pass === 3) break;
      P = Math.max(P * 1.25, this.wantP * Math.min(2, fronts / Math.max(1, hard)) * 1.05); // trop d'objets : produits plus larges
    }
  }
  planPass(P0) {
    const id = this.s.id, front = this.fixtures.filter((f) => !f.back), shelves = front.filter((f) => f.kind === 'shelf'), tables = front.filter((f) => f.kind === 'table');
    this.slots = []; this.blocks = []; this.cells = []; this.useCount = new Map(); this.placed = new Map();
    this.pinLeft = new Map([...this.pool].map(([pid, l]) => [pid, l.length]));
    for (const f of this.fixtures) f.bands = [];
    const cats = [...this.cats.entries()].filter(([k]) => !k.startsWith('#'));
    const tpref = new Set(TABLE_CATS[id] || []);
    const tcats = cats.filter(([k]) => tpref.has(k)), scats = cats.filter(([k]) => !tpref.has(k));
    // budget serré ? (remplissage naturel estimé vs objets disponibles) → cartons de surstock en haut des murs
    const frontLen = front.reduce((a, f) => a + f.len * f.segs.length, 0);
    const avgPitch = this.prods.length ? this.prods.reduce((a, p) => a + p.w, 0) / this.prods.length + this.st.gap : 0.2;
    this.tight = frontLen * FILL / Math.max(0.05, avgPitch) > (BUDGET[id] ?? 200) * 0.9;
    for (const f of front) for (const sg of f.segs) {
      let role = f.kind === 'table' ? 'table' : 'normal';
      if (f.kind === 'shelf') {
        if (this.tight && sg.top && sg.levels >= 4 && sg.h > 1.55) role = 'cases';
        else if (!BOUTIQUE.has(id) && sg.level === 0 && sg.levels >= 3) role = 'big';
      }
      sg.role = role;
    }
    // bandes par famille puis cases (bande × étage)
    if (tables.length) this.allocate(tables, tcats.length ? tcats : scats);
    // familles « de table » trop nombreuses pour les tables (librairie) : elles continuent sur les étagères
    const tLen = tables.reduce((a, f) => a + f.len * f.segs.length, 0), tDemand = tcats.reduce((a, c) => a + this.weight(c), 0);
    const spill = tables.length && tDemand > tLen * 1.5 ? tcats : [];
    if (shelves.length) this.allocate(shelves, scats.length ? [...scats, ...spill] : tcats, tcats.length && !tables.length ? tcats : []);
    // cartons de surstock (haut des étagères) et réserve
    const res = this.cats.get('#reserve') || [];
    for (const f of shelves) for (const sg of f.segs) if (sg.role === 'cases') this.fillCases(sg, 0, sg.len, res);
    this.fillBack(this.fixtures.filter((f) => f.back), res);
    // largeur visée : longueur à couvrir / objets disponibles pour les premiers rangs
    const L = this.cells.reduce((a, c) => a + c.u1 - c.u0, 0), avail = (BUDGET[id] ?? 200) - this.before + this.poolCount - this.slots.length;
    this.wantP = FILL * L / Math.max(10, avail); const P = Math.max(P0, this.wantP);
    for (const c of this.cells) this.commit(c, this.layoutFill(c, P));
    this.squeeze();
  }
  // Découpe un ensemble de meubles en bandes par famille, proportionnellement à la largeur occupée par la famille
  allocate(fixtures, cats, extra = []) {
    let all = [...cats, ...extra]; if (!all.length) return;
    const weight = (c) => this.weight(c);
    // petites familles (moins de 4 % de l'assortiment) regroupées dans une bande « divers » commune
    const W0 = all.reduce((a, c) => a + weight(c), 0), small = all.filter((c) => weight(c) < W0 * 0.04);
    if (small.length > 1) all = [...all.filter((c) => !small.includes(c)), [small.map((c) => c[0]).join('+'), small.flatMap((c) => c[1])]];
    const W = all.reduce((a, c) => a + weight(c), 0), L = fixtures.reduce((a, f) => a + f.len, 0);
    let ci = 0, left = weight(all[0]) / W * L;
    for (const f of fixtures) {
      let u = 0;
      while (u < f.len - 0.05) {
        const take = Math.min(left, f.len - u); const u1 = f.len - u - take < 0.4 ? f.len : u + take;
        const [cat, ps] = all[ci]; f.bands.push({ u0: u, u1, cat });
        for (const sg of f.segs) if (sg.role !== 'cases') this.cells.push({ f, sg, u0: u, u1, ps, cat, occ: [] });
        left -= (u1 - u); u = u1;
        if (left <= 0.05 && ci < all.length - 1) { ci++; left = weight(all[ci]) / W * L; }
        else if (left <= 0.05) left = 1e9;
      }
    }
  }
  // largeur de l'assortiment d'une famille (quantités listées plafonnées)
  weight([, ps]) { return ps.reduce((a, p) => a + Math.min(p.unique ? 0.5 : Math.min(2, Math.max(1, p.n)), p.cap / 4) * this.pitch(p), 0) + 0.05; }
  // pas d'un facing : les petits articles se touchent presque, les gros gardent l'écart du style
  pitch(p) { return p.w + Math.min(this.st.gap, 0.003 + p.w * 0.06); }
  fits(p, sg) { return p.h <= sg.clear - 0.006 && p.dep <= sg.depth + 0.04 && p.w <= sg.len; }
  // ordre des candidats d'une case : articles listés à replacer d'abord, gros formats en bas, petits en haut
  order(c) {
    const { sg } = c; let cands = c.ps.filter((p) => this.fits(p, sg) && (!p.unique || (this.pinLeft.get(p.id) || 0) > 0) && (this.placed.get(p.id) || 0) < p.cap); if (!cands.length) return cands;
    const n = sg.levels, lv = sg.level;
    if ((sg.role === 'big' || lv === 0) && n > 2) cands = cands.slice().sort((a, b) => b.h * b.w - a.h * a.w);
    else if (sg.top && n > 2) cands = cands.slice().sort((a, b) => a.h * a.w - b.h * b.w);
    else { const k = (lv * 3 + ((this.R.next() * cands.length) | 0)) % cands.length; cands = cands.slice(k).concat(cands.slice(0, k)); }
    const must = cands.filter((p) => (this.pinLeft.get(p.id) || 0) > 0);
    return must.length ? must.concat(cands.filter((p) => !must.includes(p))) : cands;
  }
  rowsFor(p, sg) { return Math.max(1, Math.min(sg.kind === 'table' ? this.st.rows + 1 : this.st.rows, Math.floor((sg.depth - 0.01) / (p.dep + 0.01)))); }
  stackFor(p, sg) { const sm = (p.d.pk?.hdr ? 1 : STACK[p.d.shape]) || 1; if (sm < 2) return 1; return Math.max(1, Math.min(sm, this.st.stack + (p.d.shape === 'pshoebox' || p.d.shape === 'pfold' ? 1 : 0), Math.floor((sg.clear - 0.006) / (p.h + 0.003)))); }
  // Remplissage d'une case à ~90 % : à chaque bloc, le produit dont la largeur colle à la largeur visée P (variété,
  // objets plats évités en hauteur), facings jointifs ; la place restante devient de petits écarts et un ou deux trous
  layoutFill(c, P) {
    const st = this.st, cands = this.order(c), out = []; if (!cands.length) return out;
    const len = c.u1 - c.u0, goal = len * FILL, taken = new Map(); let used = 0;
    const add = (p, nf) => { const w = nf * this.pitch(p); out.push({ p, nf, w }); used += w; taken.set(p.id, (taken.get(p.id) || 0) + 1); };
    // articles listés à replacer : au plus un bon tiers de la case (le reste dans les cases suivantes, puis squeeze())
    let pinRoom = goal * 0.4;
    for (const p of cands) {
      const pin = this.pinLeft.get(p.id) || 0, pitch = this.pitch(p); if (pin <= 0) continue;
      const nf = Math.min(pin, 3, Math.floor(pinRoom / pitch), Math.floor((len - used) / pitch)); if (nf >= 1) { add(p, nf); pinRoom -= nf * pitch; }
    }
    const minW = Math.min(...cands.map((p) => this.pitch(p)));
    for (let guard = 0; used < goal - minW * 0.5 && guard < 300; guard++) {
      const room = len - used - out.length * 0.004; let best = null, bs = Infinity;
      for (const p of cands) {
        const pitch = this.pitch(p); if (pitch > room) continue;
        const r = P > 0 ? Math.log(pitch / P) : 0;
        const sc = (r < 0 ? -r * 1.2 : r * 0.35) + 0.12 * (taken.get(p.id) || 0) + 0.02 * (this.useCount.get(p.id) || 0) + (p.h < 0.045 && c.sg.clear > 0.2 ? 0.45 : 0)
          - ((this.pinLeft.get(p.id) || 0) > 0 ? 0.15 : 0) + this.R.next() * 0.1;
        if (sc < bs) { bs = sc; best = p; }
      }
      if (!best) break;
      const pitch = this.pitch(best), nf = Math.min(Math.max(1, Math.min(6, Math.round(st.target / pitch))), Math.floor(room / pitch));
      if (nf < 1) break; add(best, nf);
    }
    // blocs d'un même produit regroupés (ordre de la bande), écarts réguliers ; un trou plus large de temps en temps
    out.sort((a, b) => cands.indexOf(a.p) - cands.indexOf(b.p));
    const free = Math.max(0, len - used), hole = out.length > 3 && this.R.chance(0.35) ? (this.R.next() * out.length) | 0 : -1;
    const gap = free / (out.length + (hole >= 0 ? 2 : 0) + 0.5); let u = c.u0 + gap * 0.25;
    out.forEach((b, i) => { b.u = u; b.rows = this.rowsFor(b.p, c.sg); b.stack = this.stackFor(b.p, c.sg); u += b.w + gap * (i === hole ? 3 : 1); });
    return out;
  }
  commit(c, blocks) {
    for (const b of blocks) {
      const pin = this.pinLeft.get(b.p.id) || 0;
      if (b.p.unique) { if (pin <= 0) continue; b.nf = Math.min(b.nf, pin); b.rows = 1; b.stack = 1; } // pas de copie d'un objet unique
      const room = b.p.cap - (this.placed.get(b.p.id) || 0); if (room <= 0) continue;
      if (b.nf * b.rows * (b.stack || 1) > room) { b.rows = 1; b.stack = 1; b.nf = Math.min(b.nf, room); }
      this.placed.set(b.p.id, (this.placed.get(b.p.id) || 0) + b.nf * b.rows * (b.stack || 1));
      if (pin > 0) this.pinLeft.set(b.p.id, Math.max(0, pin - b.nf * b.rows * (b.stack || 1)));
      this.useCount.set(b.p.id, (this.useCount.get(b.p.id) || 0) + 1);
      this.block(c.sg, b.u, b.nf, b.rows, b.stack, b.p); c.occ.push([b.u, b.u + b.nf * this.pitch(b.p)]);
    }
  }
  // Articles listés restés sans place : insérés dans le plus grand espace libre d'une case compatible
  squeeze() {
    for (const [id, left] of this.pinLeft) {
      if (left <= 0) continue; const p = this.prods.find((q) => q.id === id); if (!p) continue;
      let n = left; const pitch = this.pitch(p);
      const cells = this.cells.filter((c) => this.fits(p, c.sg)).sort((a, b) => (b.cat === p.cat) - (a.cat === p.cat));
      for (const c of cells) {
        if (n <= 0) break;
        const occ = c.occ.slice().sort((a, b) => a[0] - b[0]); let a = c.u0, best = null;
        for (const [o0, o1] of [...occ, [c.u1, c.u1]]) { if (o0 - a > (best ? best[1] - best[0] : 0)) best = [a, o0]; a = Math.max(a, o1); }
        if (!best) continue; const k = Math.min(n, 4, Math.floor((best[1] - best[0] - 0.02) / pitch)); if (k < 1) continue;
        const u = (best[0] + best[1]) / 2 - k * pitch / 2; this.block(c.sg, u, k, 1, 1, p); c.occ.push([u, u + k * pitch]); n -= k;
      }
      this.pinLeft.set(id, n);
    }
  }
  block(sg, u, nf, rows, stack, p) {
    const bl = { sg, u, nf, rows, stack, p, slots: [] }; this.blocks.push(bl);
    const pitch = this.pitch(p), rowStep = p.dep + 0.008;
    for (let r = 0; r < rows; r++) for (let i = 0; i < nf; i++) for (let k = 0; k < stack; k++) {
      const a = sg.a0 + u + (i + 0.5) * pitch, perp = sg.c + (sg.depth / 2 - 0.006 - (r + 0.5) * rowStep); // premier rang contre le bord client
      const front = (r === 0 || sg.kind === 'table') && k === 0; // sur une table, toutes les rangées se voient
      const sl = { p, sg, a, perp, r, k, i, front, pri: (front ? 1000 : 0) + sg.pri * 100 - r * 25 - k * 30 - Math.max(0, i - 3) * 3 + this.R.next() * 4, bl };
      bl.slots.push(sl); this.slots.push(sl);
    }
    return bl;
  }
  // Cartons de surstock (haut des étagères, réserve)
  fillCases(sg, u0, u1, list) {
    const cases = list && list.length ? list : (this.cats.get('#reserve') || []);
    let u = u0 + 0.02, k = (this.R.next() * 7) | 0;
    while (u < u1 - 0.15) {
      const p = cases.length ? cases[k++ % cases.length] : null;
      if (!p || !this.fits(p, sg)) { const d = ITEMS.cardboard_box; if (u + d.s[0] > u1 || d.s[1] > sg.clear - 0.006) break; this.block(sg, u, 1, 1, 1, { id: 'cardboard_box', d, n: 0, w: d.s[0], h: d.s[1], dep: d.s[2], generic: true }); u += d.s[0] + 0.025 + this.R.next() * 0.05; continue; }
      const stack = sg.clear > p.h * 2 + 0.02 && this.R.chance(0.5) ? 2 : 1;
      this.block(sg, u, 1, 1, stack, p); u += p.w + 0.025 + this.R.next() * 0.05;
    }
  }
  fillBack(fixtures, cases) { for (const f of fixtures) for (const sg of f.segs) this.fillCases(sg, 0, sg.len, cases); }

  // ───────── 5. budget ─────────
  choose() {
    const keep = new Set(); const byP = new Map();
    for (const sl of this.slots) { if (!byP.has(sl.p.id)) byP.set(sl.p.id, []); byP.get(sl.p.id).push(sl); }
    // les articles listés déjà posés gardent les meilleures places de leur produit
    for (const [id, list] of this.pool) { const l = (byP.get(id) || []).sort((a, b) => b.pri - a.pri); for (let i = 0; i < Math.min(list.length, l.length); i++) { keep.add(l[i]); l[i].pin = true; } }
    // tous les premiers rangs (rayons, cartons du haut, réserve) : le remplissage passe avant le budget…
    for (const sl of this.slots) if (sl.front) keep.add(sl);
    // … qui sert ensuite aux rangées arrière et aux piles, à hauteur d'yeux d'abord
    let left = this.allowance; for (const sl of keep) if (!sl.pin) left--;
    const rest = this.slots.filter((sl) => !keep.has(sl)).sort((a, b) => b.pri - a.pri);
    for (let i = 0; i < rest.length && left > 0; i++, left--) keep.add(rest[i]);
    // une pile ou une rangée arrière sans support devant/dessous n'a pas de sens : on retire les orphelins
    for (const sl of [...keep]) if (!sl.pin && sl.k > 0 && !sl.bl.slots.some((q) => keep.has(q) && q.r === sl.r && q.i === sl.i && q.k === sl.k - 1)) keep.delete(sl);
    this.kept = [...keep];
  }

  // ───────── 6. placement ─────────
  place() {
    for (const sl of this.kept) {
      const { p, sg } = sl, d = p.d;
      // posé sur la planche d'après sa boîte (s[1]/2, convention commune : étiquettes, physique) ; les rares modèles qui
      // débordent vers le bas sont légèrement relevés
      const h2 = d.s[1] / 2, y = sg.y + Math.max(h2, Math.min(p.by ?? h2, h2 + 0.03)) + 0.002 + sl.k * (p.h + 0.002);
      const jitter = (this.R.next() - 0.5) * 0.004, ry = sg.ry + (this.R.next() - 0.5) * (sl.front ? 0.05 : 0.03);
      const X = sg.ax === 'x' ? sl.a + jitter : sg.c + (sl.perp - sg.c) * sg.fx, Z = sg.ax === 'x' ? sg.c + (sl.perp - sg.c) * sg.fz : sl.a + jitter;
      const list = this.pool.get(p.id);
      if (list && list.length) { this.relocate(list.shift(), X, y, Z, ry, sg.zone); continue; }
      const data = p.generic ? { contents: this.boxContents() } : openData(d);
      if (this.addStatic(p.id, X, y, Z, ry, sg.zone, data)) this.added++;
    }
  }
  boxContents() { const ids = (this._boxIds ||= this.prods.filter((p) => !p.unique && !p.d.fixed && p.d.shape !== 'pcase' && !p.d.pk).map((p) => p.id)); return ids.length ? [this.R.pick(ids), this.R.pick(ids)] : []; }
  // Réécrit la place d'origine d'un article déjà créé (avant la fusion des meshes de zone)
  relocate(pr, x, y, z, ry, zone) {
    const P = this.g.props; const old = pr.home.zone;
    if (zone !== old) { const a = P.byZone.get(old); if (a) { const i = a.indexOf(pr); if (i >= 0) a.splice(i, 1); } if (!P.byZone.has(zone)) P.byZone.set(zone, []); P.byZone.get(zone).push(pr); pr.zone = zone; }
    pr.home = { x, y, z, ry, zone };
    _q.setFromEuler(_e.set(0, ry, 0)); const q = [_q.x, _q.y, _q.z, _q.w];
    pr.state.pos = [x, y, z]; pr.state.quat = q; if (pr.initial) { pr.initial.pos = [x, y, z]; pr.initial.quat = [...q]; }
    // présentoirs ouverts (barquettes, cagettes, rangées, piles) : contenu prêt pour « R : Fouiller » sur le rayon
    const od = openData(pr.def); if (od.contents && !pr.state.data?.contents) { pr.state.data = { ...(pr.state.data || {}), ...od }; if (pr.initial) pr.initial.data = { ...(pr.initial.data || {}), contents: [...od.contents] }; }
    pr._setPickAt?.(x, y, z, ry); this.moved++;
  }
  // Articles listés sans place dans le planogramme (trop grands pour toutes les cases) : rangés sur les planches de la
  // réserve, sinon au sol de la boutique
  strays() {
    const left = []; for (const [, list] of this.pool) while (list.length) left.push(list.shift());
    if (!left.length) return;
    const occ = new Map(); for (const sl of this.kept) if (sl.sg.back) { if (!occ.has(sl.sg)) occ.set(sl.sg, []); occ.get(sl.sg).push([sl.a - sl.p.w / 2 - sl.sg.a0, sl.a + sl.p.w / 2 - sl.sg.a0]); }
    const back = this.segs.filter((sg) => sg.back);
    for (const pr of left) {
      const d = pr.def; let done = false;
      for (const sg of (this.prods.find((q) => q.id === pr.defId)?.unique ? [] : back)) { // objets uniques : jamais en réserve
        if (d.s[1] > sg.clear - 0.006 || d.s[2] > sg.depth + 0.06) continue;
        const o = (occ.get(sg) || []).sort((a, b) => a[0] - b[0]); let a = 0.02;
        for (const [o0, o1] of [...o, [sg.len, sg.len]]) { if (o0 - a >= d.s[0] + 0.03) break; a = Math.max(a, o1 + 0.02); }
        if (a + d.s[0] + 0.02 > sg.len) continue;
        const u = a + d.s[0] / 2 + 0.01, perp = sg.c + (sg.depth / 2 - 0.006 - d.s[2] / 2 - 0.02);
        const X = sg.ax === 'x' ? sg.a0 + u : sg.c + (perp - sg.c) * sg.fx, Z = sg.ax === 'x' ? sg.c + (perp - sg.c) * sg.fz : sg.a0 + u;
        this.relocate(pr, X, sg.y + d.s[1] / 2 + 0.002, Z, sg.ry, sg.zone); if (!occ.has(sg)) occ.set(sg, []); occ.get(sg).push([a, a + d.s[0] + 0.02]); done = true; break;
      }
      if (!done) this.pool.set('#stray' + pr.id, [pr]); // leftovers() les posera au sol
    }
    // les articles restés « au sol » sont traités par leftovers() s'ils sont hors zone ; sinon ils gardent leur place
    for (const [k, list] of this.pool) if (k.startsWith('#stray')) for (const pr of list) this.floorStray(pr);
  }
  floorStray(pr) {
    const sp = this.floorSpots.length ? this.floorSpots[(this.R.next() * this.floorSpots.length) | 0] : null, z = this.zf;
    const x = sp ? sp.x + (this.R.next() - 0.5) * 0.5 : (z.min[0] + z.max[0]) / 2 + (this.R.next() - 0.5) * 3, zz = sp ? sp.z + (this.R.next() - 0.5) * 0.5 : (z.min[2] + z.max[2]) / 2 + (this.R.next() - 0.5) * 2;
    this.relocate(pr, x, this.floorY + pr.def.s[1] / 2 + 0.002, zz, this.R.next() * 6, sp?.zone || this.s.id);
  }
  // Présentoirs ouverts posés ailleurs (sol, tables) par placeContents : contenu initial aussi
  openDisplays() {
    for (const z of [this.s.id, this.s.id + '_back']) for (const pr of this.g.props.byZone.get(z) || []) {
      const od = openData(pr.def); if (!od.contents || pr.state.data?.contents) continue;
      pr.state.data = { ...(pr.state.data || {}), ...od }; if (pr.initial) pr.initial.data = { ...(pr.initial.data || {}), contents: [...od.contents] };
    }
  }
  // Articles hors du centre (planches de réserve qui débordent du plan) : remis au sol, dans la boutique
  leftovers() {
    for (const z of [this.s.id, this.s.id + '_back']) for (const pr of [...(this.g.props.byZone.get(z) || [])]) {
      if (this.world.zone(pr.home.zone)?.contains(pr.home.x, pr.home.y, pr.home.z, 0.05)) continue;
      this.floorStray(pr);
    }
  }

  // ───────── 7. présentoirs de sol ─────────
  freeAt(x, z, hw, hd, zone) {
    const y0 = this.floorY;
    for (const b of this.world.physics.near(x - hw, z - hd, x + hw, z + hd, LAYER.WALL | LAYER.FURN | LAYER.DOOR | LAYER.GLASS)) if (b.max[1] > y0 + 0.04 && b.min[1] < y0 + 1.2 && b.max[0] > x - hw && b.min[0] < x + hw && b.max[2] > z - hd && b.min[2] < z + hd) return false;
    for (const zid of [zone, this.s.id]) for (const pr of this.g.props.byZone.get(zid) || []) { const h = pr.home; if (h && Math.abs(h.y - y0) < 1.3 && Math.abs(h.x - x) < hw + 0.25 && Math.abs(h.z - z) < hd + 0.25) return false; }
    return true;
  }
  floorDisplays() {
    const spots = [...this.floorSpots]; const id = this.s.id;
    if (id === 'hyper') this.endCaps(spots);
    const hangers = (this.cats.get('#floor') || []).filter((p) => !p.unique || (this.pool.get(p.id) || []).length);
    let budget = Math.max(0, Math.min(90, (BUDGET[id] ?? 200) - this.countHome()));
    for (const sp of spots) {
      if (budget <= 4) break;
      if (hangers.length) { if (this.rail(sp, hangers)) { budget -= 10; continue; } }
      const kind = DISPLAY[id]; if (!kind) continue;
      const used = kind === 'pallet' ? this.pallet(sp) : kind === 'bin' ? this.bin(sp) : kind === 'crates' ? this.crates(sp) : 0;
      budget -= used;
    }
  }
  // Têtes de gondole de l'hypermarché : palettes promotionnelles devant une extrémité de chaque gondole
  endCaps(spots) {
    const islands = this.fixtures.filter((f) => f.kind === 'shelf' && !f.back && f.segs.length >= 4 && f.segs[0].ax === 'x');
    const ends = new Map();
    for (const f of islands) { const sg = f.segs[0]; const key = sg.a0.toFixed(1) + '|' + sg.a1.toFixed(1); const e = ends.get(key) || { a0: sg.a0, a1: sg.a1, cs: [] }; e.cs.push(sg.c); ends.set(key, e); }
    let n = 0;
    for (const e of ends.values()) {
      if (e.cs.length < 2) continue; const c = (Math.min(...e.cs) + Math.max(...e.cs)) / 2;
      const x = (n % 2 ? e.a1 + 0.55 : e.a0 - 0.55); n++;
      spots.push({ x, y: this.floorY, z: c, ry: n % 2 ? -Math.PI / 2 : Math.PI / 2, zone: this.s.id, endcap: true });
    }
  }
  rail(sp, hangers) {
    const L = 1.1, ax = Math.abs(Math.sin(sp.ry)) > 0.5 ? 'z' : 'x'; const hw = ax === 'x' ? L / 2 + 0.1 : 0.3, hd = ax === 'x' ? 0.3 : L / 2 + 0.1;
    if (!this.freeAt(sp.x, sp.z, hw, hd, sp.zone)) return false;
    const y0 = this.floorY, barY = y0 + 1.42;
    this.dec(sp.zone, (k) => { k.box(sp.x, barY, sp.z, ax === 'x' ? L : 0.025, 0.025, ax === 'x' ? 0.025 : L, 0xbdbdbd); for (const s of [-1, 1]) { const px = sp.x + (ax === 'x' ? s * L / 2 : 0), pz = sp.z + (ax === 'z' ? s * L / 2 : 0); k.box(px, y0 + 0.71, pz, 0.03, 1.42, 0.03, 0x9e9e9e); k.box(px, y0 + 0.02, pz, ax === 'x' ? 0.06 : 0.45, 0.04, ax === 'x' ? 0.45 : 0.06, 0x616161); } });
    this.collider(sp.x, sp.z, hw - 0.05, hd - 0.05, 1.45);
    const n = 9; for (let i = 0; i < n; i++) {
      const p = hangers[(i + ((this.R.next() * hangers.length) | 0)) % hangers.length]; const d = p.d; const t = (i + 0.5) / n - 0.5;
      if (p.unique && !(this.pool.get(p.id) || []).length) continue;
      const x = sp.x + (ax === 'x' ? t * L * 0.92 : 0), z = sp.z + (ax === 'z' ? t * L * 0.92 : 0), y = barY + 0.03 - d.s[1] / 2;
      const ry = (ax === 'x' ? 0 : Math.PI / 2) + Math.PI / 2 + (this.R.next() - 0.5) * 0.15;
      this.takeOrAdd(p.id, x, y, z, ry, sp.zone);
    }
    return true;
  }
  takeOrAdd(id, x, y, z, ry, zone, data) { const list = this.pool.get(id); if (list && list.length) { this.relocate(list.shift(), x, y, z, ry, zone); return true; } const pr = this.addStatic(id, x, y, z, ry, zone, data || {}); if (pr) this.added++; return !!pr; }
  pallet(sp) {
    const w = 1.0, dd = 0.8; if (!this.freeAt(sp.x, sp.z, w / 2 + 0.05, dd / 2 + 0.05, sp.zone)) return 0;
    const y0 = this.floorY; const zone = sp.zone;
    const pool = PALLET_GOODS.filter((id) => ITEMS[id] && (this.s.items || []).some((e) => e[0] === id)); if (!pool.length) return 0;
    this.dec(zone, (k) => { k.box(sp.x, y0 + 0.07, sp.z, w, 0.03, dd, 0xb08d57); k.box(sp.x, y0 + 0.13, sp.z, w, 0.025, dd, 0xc29a62); for (const t of [-0.42, 0, 0.42]) k.box(sp.x + t * w, y0 + 0.04, sp.z, 0.1, 0.08, dd, 0x9c7a4a); });
    this.collider(sp.x, sp.z, w / 2, dd / 2, 0.15);
    const id = pool[(this.R.next() * pool.length) | 0], d = ITEMS[id]; let used = 0;
    const nx = Math.max(1, Math.floor(w / (d.s[0] + 0.01))), nz = Math.max(1, Math.floor(dd / (d.s[2] + 0.01))), ny = Math.max(1, Math.min(4, Math.floor(0.9 / d.s[1])));
    for (let j = 0; j < ny; j++) for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      if (j === ny - 1 && this.R.chance(0.35)) continue;
      // couches inférieures pleines et cachées : seules la couche du dessus et les faces visibles comptent comme objets
      const inner = j < ny - 1 && a > 0 && a < nx - 1 && b > 0 && b < nz - 1; if (inner) continue;
      const x = sp.x + (a - (nx - 1) / 2) * (d.s[0] + 0.01), z = sp.z + (b - (nz - 1) / 2) * (d.s[2] + 0.01), y = y0 + 0.145 + d.s[1] / 2 + j * (d.s[1] + 0.002);
      if (this.takeOrAdd(id, x, y, z, sp.ry + (this.R.next() - 0.5) * 0.04, zone)) used++;
    }
    this.signAt(zone, sp.x, y0 + 0.145 + ny * d.s[1] + 0.35, sp.z, sp.ry, PROMOS[(this.R.next() * PROMOS.length) | 0]);
    return used;
  }
  bin(sp) {
    const w = 0.7, dd = 0.55, h = 0.5; if (!this.freeAt(sp.x, sp.z, w / 2 + 0.05, dd / 2 + 0.05, sp.zone)) return 0;
    const goods = this.prods.filter((p) => p.h < 0.25 && p.w < 0.3 && !p.unique && !RARE[p.id] && !p.d.fixed && !['pcase', 'phang', 'ptray', 'pspines', 'ppile', 'pcrate'].includes(p.d.shape)); if (!goods.length) return 0;
    const y0 = this.floorY, zone = sp.zone, col = this.s.color ?? 0xd32f2f;
    this.dec(zone, (k) => { k.box(sp.x, y0 + 0.1, sp.z, w, 0.2, dd, col); for (const s of [-1, 1]) { k.box(sp.x + s * w / 2, y0 + h / 2, sp.z, 0.02, h, dd, 0xb0bec5); k.box(sp.x, y0 + h / 2, sp.z + s * dd / 2, w, h, 0.02, 0xb0bec5); } });
    this.collider(sp.x, sp.z, w / 2, dd / 2, h);
    const pick = goods.slice().sort((a, b) => (b.n - a.n) || (a.vol - b.vol)).slice(0, 3); let used = 0;
    for (let i = 0; i < 16; i++) {
      const p = pick[i % pick.length], d = p.d;
      const x = sp.x + (this.R.next() - 0.5) * (w - d.s[0] - 0.05), z = sp.z + (this.R.next() - 0.5) * (dd - d.s[2] - 0.05), y = y0 + 0.2 + d.s[1] / 2 + (i % 3) * d.s[1] * 0.7;
      if (this.takeOrAdd(p.id, x, y, z, this.R.next() * 6, zone)) used++;
    }
    this.signAt(zone, sp.x, y0 + h + 0.3, sp.z, sp.ry, PROMOS[(this.R.next() * PROMOS.length) | 0]);
    return used;
  }
  crates(sp) {
    const ids = (this.s.items || []).map((e) => e[0]).filter((id) => ITEMS[id]?.shape === 'pcrate'); if (!ids.length) return 0;
    const w = 1.05, dd = 0.75; if (!this.freeAt(sp.x, sp.z, w / 2, dd / 2, sp.zone)) return 0;
    let used = 0; const y0 = this.floorY;
    for (let j = 0; j < 2; j++) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const id = ids[(a + b * 2 + j + ((this.R.next() * ids.length) | 0)) % ids.length], d = ITEMS[id];
      if (this.takeOrAdd(id, sp.x + (a - 0.5) * 0.52, y0 + d.s[1] / 2 + j * (d.s[1] + 0.005), sp.z + (b - 0.5) * 0.38, sp.ry, sp.zone, { contents: [...(d.p?.contains || [])] })) used++;
    }
    this.collider(sp.x, sp.z, w / 2, dd / 2, 0.42);
    return used;
  }
  collider(x, z, hw, hd, h) { const y0 = this.floorY; this.world.physics.add(new Box(x - hw, y0, z - hd, x + hw, y0 + h, z + hd, LAYER.FURN, null)); }

  // ───────── 8. décor (panneaux de rayon, présentoirs de sol) ─────────
  // (les étiquettes de prix et stop-rayons sont posés ensuite par js/world/shelflabels.js d'après les objets)
  dec(zone, fn) { if (!this.decor.has(zone)) this.decor.set(zone, []); this.decor.get(zone).push(fn); }
  signAt(zone, x, y, z, ry, promo) {
    const [t, sub] = promo; const key = 'promo:' + t + ':' + (sub || '');
    this.dec(zone, (k) => {
      const r = k.shared(key, 96, 64, { kind: 'sign', name: t, sub, bg: 0xd50000 });
      const fx = Math.sin(ry), fz = Math.cos(ry), rx = fz, rz = -fx, w = 0.34, h = 0.22;
      const P = (a, b, o) => [x + rx * a + fx * o, y + b, z + rz * a + fz * o];
      k.quad(P(-w / 2, -h / 2, 0.006), P(w / 2, -h / 2, 0.006), P(w / 2, h / 2, 0.006), P(-w / 2, h / 2, 0.006), 0xffffff, r);
      k.quad(P(w / 2, -h / 2, -0.006), P(-w / 2, -h / 2, -0.006), P(-w / 2, h / 2, -0.006), P(w / 2, h / 2, -0.006), 0xffffff, r);
      k.box(x, y - h / 2 - 0.15, z, 0.015, 0.3, 0.015, 0x9e9e9e);
    });
  }
  buildDecor() {
    // panneaux suspendus des rayons (hypermarché, quincaillerie)
    if (this.s.id === 'hyper' || this.s.id === 'quincaillerie') this.gondolaSigns(this.s.color ?? 0x1565c0);
    for (const [zone, list] of this.decor) {
      const zn = this.world.zone(zone); if (!zn) continue;
      const { geometry } = quickGeometry(this.g.atlas, (k) => { for (const fn of list) fn(k); });
      if (!geometry.attributes.position.count) continue;
      const mesh = new THREE.Mesh(geometry, this.g.mats.get('props', zone)); mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.name = 'stock-decor:' + zone;
      zn.group.add(mesh);
    }
  }
  gondolaSigns(col) {
    const groups = new Map();
    for (const f of this.fixtures) { if (f.back || f.kind !== 'shelf' || f.segs.length < 4 || f.segs[0].ax !== 'x') continue; const sg = f.segs[0]; const key = sg.a0.toFixed(1) + '|' + sg.a1.toFixed(1) + '|' + sg.y.toFixed(2); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(f); }
    for (const fs of groups.values()) {
      if (fs.length < 2) continue; const sg = fs[0].segs[0], top = Math.max(...fs[0].segs.map((s) => s.y));
      const c = (Math.min(...fs.map((f) => f.segs[0].c)) + Math.max(...fs.map((f) => f.segs[0].c))) / 2, a = (sg.a0 + sg.a1) / 2;
      const dflt = this.s.id === 'quincaillerie' ? 'BRICOLAGE' : 'BAZAR · DIVERS';
      const cat = (fs[0].bands || [])[0]?.cat, cat2 = (fs[1].bands || [])[0]?.cat; const t1 = CAT_SIGN[cat] || dflt, t2 = CAT_SIGN[cat2] || t1;
      const y = top + 0.75, zone = this.s.id;
      this.dec(zone, (k) => {
        const w = 1.9, h = 0.34, f1 = fs[0].segs[0].fz;
        const r1 = k.shared('gsign:' + t1, 192, 36, { kind: 'sign', name: t1, bg: col, fg: 0xffffff, accent: 0xffffff }), r2 = k.shared('gsign:' + t2, 192, 36, { kind: 'sign', name: t2, bg: col, fg: 0xffffff, accent: 0xffffff });
        k.box(a, y, c, w, h, 0.03, col);
        const sd = f1 > 0 ? 1 : -1; // face côté premier rayon
        k.quad([a - w / 2 * sd, y - h / 2, c + sd * 0.016], [a + w / 2 * sd, y - h / 2, c + sd * 0.016], [a + w / 2 * sd, y + h / 2, c + sd * 0.016], [a - w / 2 * sd, y + h / 2, c + sd * 0.016], 0xffffff, r1);
        k.quad([a + w / 2 * sd, y - h / 2, c - sd * 0.016], [a - w / 2 * sd, y - h / 2, c - sd * 0.016], [a - w / 2 * sd, y + h / 2, c - sd * 0.016], [a + w / 2 * sd, y + h / 2, c - sd * 0.016], 0xffffff, r2);
        for (const s of [-0.7, 0.7]) k.box(a + s, (top + y - h / 2) / 2 + 0.05, c, 0.025, y - h / 2 - top, 0.025, 0x9e9e9e);
      });
    }
  }
}

// Plafonds par magasin : décor encombrant, et ressources de survie (piles, lampes, soins) pour garder l'équilibre du jeu
const RARE = {
  globe: 4, toolbox: 8, ladder: 2, helmet: 6, extension_cord: 8, rope: 8, chain: 8, paint_can: 10, sleeping_bag: 6, skateboard: 6, birthday_cake: 6, wall_clock: 8, lava_lamp: 8, rc_car: 8, music_box: 6, porcelain_doll: 4, snow_globe: 6, kite: 6, metronome: 6, telescope: 3, bonsai_juniper: 4, olive_tree: 2, ficus: 3, monstera: 3,
  battery: 10, case_battery: 1, batteries_aaa: 8, batteries_9v: 6, tray_batteries_aaa: 2, tray_batteries_9v: 2, powerbank: 4, tray_powerbank: 1, flashlight_spare: 4, flashlight_led: 6, keychain_torch: 6, tray_keychain_torch: 1,
  first_aid: 2, headlamp: 3, bandage: 8, tray_bandage: 2, band_aids: 10, tray_band_aids: 2, case_band_aids: 1, energy_drink: 10, energy_gel: 8, tray_energy_gel: 2,
};
const DISPLAY = { hyper: 'pallet', jouets: 'bin', sport: 'bin', bonbons: 'bin', animalerie: 'bin', quincaillerie: 'bin', tabac: 'bin', pharma: 'bin', parfumerie: 'bin', librairie: 'bin', photo: 'bin', deco: 'bin', octet: 'bin', mobizone: 'bin', costumes: 'bin', videoclub: 'bin', pixel: 'bin' };
const PALLET_GOODS = ['pack_water6', 'pack_sparkling6', 'case_soda', 'case_water', 'tp_pack', 'case_chips', 'case_beer_blonde', 'pack_cola6', 'case_cat_food', 'dog_food_bag', 'case_detergent', 'charcoal', 'case_coffee_ground', 'case_cereal_choco'];
// Contenu initial des présentoirs ouverts (les cartons et lots sous film s'ouvrent en main, clic gauche)
const OPEN_SHAPES = new Set(['ptray', 'pcrate', 'pspines', 'ppile']);
function openData(d) { return d.use === 'container' && d.p?.contains && OPEN_SHAPES.has(d.shape) ? { contents: [...d.p.contains] } : {}; }
function mixc(a, b, t) { return (Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) | (Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) | Math.round((a & 255) * (1 - t) + (b & 255) * t); }
