// Utilitaires partagés du wiki : rendu HTML sûr, couleurs, texte riche, spoilers, liens vers les fiches.
// Aucune dépendance : importé par wiki.js et par toutes les pages.

// État global du wiki (rempli par wiki.js au démarrage).
export const W = {
  D: {},          // données du jeu (exports des modules js/data/*.js)
  idx: {},        // index dérivés (voir wiki.js → buildIndex)
  missing: [],    // modules de données qui n'ont pas pu être chargés
  screens: null,  // exports de js/screens/screens.js s'il a pu être chargé
  spoilers: false,
  onContent: null, // rappel (racine DOM) après un rendu partiel : accessibilité des spoilers
};

// ───────────────────────── HTML sûr ─────────────────────────
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export class Raw { constructor(s) { this.s = String(s); } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

function fmt(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}
/** Gabarit étiqueté : les valeurs interpolées sont échappées, sauf si elles sont Raw (ou issues de html``). */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += fmt(vals[i]) + strings[i + 1];
  return new Raw(out);
}
export const join = (arr, sep = '') => new Raw(arr.map(fmt).join(fmt(sep)));

// ───────────────────────── Texte & nombres ─────────────────────────
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’‘]/g, "'").toLowerCase();
export const fmtInt = (n) => Number(n).toLocaleString('fr-FR');
export const fmtEuro = (n) => fmtInt(n) + ' €';
export const pad2 = (n) => String(n).padStart(2, '0');
export const plural = (n, one, many) => (Math.abs(n) >= 2 ? many : one);
export const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
/** Typographie française : espace fine insécable avant : ; ! ? » et après «. */
export const typo = (s) => String(s).replace(/ ([:;!?»])/g, ' $1').replace(/« /g, '« ');

/** Minutes de jeu depuis 'HH:MM' (les heures < 12 sont après minuit). */
export function nightMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h < 12 ? h + 24 : h) * 60 + (m || 0);
}
export function minutesToHHMM(min) {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60);
}

// ───────────────────────── Couleurs ─────────────────────────
export const hex = (c) => '#' + ((Number(c) >>> 0) & 0xffffff).toString(16).padStart(6, '0');
function chan(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
export function luminance(c) {
  const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = chan(Number(c) >>> 0);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** Mélange avec le blanc (t = 0..1) : sert à rendre visibles les couleurs sombres sur le fond nuit. */
export function lighten(c, t) {
  const [r, g, b] = chan(Number(c) >>> 0);
  const m = (v) => Math.round(v + (255 - v) * t);
  return (m(r) << 16) | (m(g) << 8) | m(b);
}
/** Couleur assez lumineuse pour ressortir sur le fond sombre. */
export function visible(c) {
  const L = luminance(c);
  if (L >= 0.12) return Number(c);
  return lighten(c, Math.min(0.75, 0.25 + (0.12 - L) * 4));
}
export const inkOn = (c) => (luminance(c) > 0.33 ? '#0b0b12' : '#ffffff');

// ───────────────────────── Icônes (symboles définis dans index.html) ─────────────────────────
export const icon = (name, cls = '') => raw(`<svg class="ico ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`);

export function skulls(n, { label = true } = {}) {
  const lv = Math.max(0, Math.min(3, Number(n) || 0));
  const t = lv === 0 ? 'Aucune frayeur' : `Frayeur ${lv} sur 3`;
  let s = '';
  for (let i = 1; i <= 3; i++) s += `<svg class="ico skull ${i <= lv ? 'on' : ''}" aria-hidden="true" focusable="false"><use href="#i-skull"/></svg>`;
  return raw(`<span class="skulls" ${label ? `role="img" aria-label="${t}"` : ''} title="${t}">${s}</span>`);
}

// ───────────────────────── Spoilers ─────────────────────────
// Le contenu reste dans le DOM mais flouté tant que les spoilers sont masqués (cliquer pour révéler un seul bloc).
export const sp = (content, label = 'Spoiler') =>
  html`<span class="sp" data-sp data-label="${label}"><span class="sp-c">${content}</span></span>`;
export const spBlock = (content, label = 'Spoiler') =>
  html`<div class="sp sp-block" data-sp data-label="${label}"><div class="sp-c">${content}</div></div>`;

// ───────────────────────── Noms des présences ─────────────────────────
export const ENTITY_LABELS = {
  cat: 'Le chat errant', shadow: 'L\'Ombre', bobby: 'Bobby l\'Ourson', mannequin: 'Les mannequins',
  crawler: 'Le Rampant', robbers: 'Les braqueurs', fire: 'L\'incendie', thing: 'La Chose',
};
export const SPOILER_ENTITIES = new Set(['thing']);

// ───────────────────────── Téléphone ─────────────────────────
export function phoneEntry(key) {
  const list = W.D.PHONE_NUMBERS || [];
  return list.find((e) => e.service === key) || list.find((e) => e.kind === key) || list.find((e) => e.num === key) || null;
}
export function fmtPhone(num) {
  const n = String(num).replace(/\D/g, '');
  if (/^0800/.test(n)) { const r = n.slice(4); return '0 800 ' + (r.length % 2 ? r : r.replace(/(\d{2})(?=\d)/g, '$1 ')); }
  if (W.D.formatNumber) return W.D.formatNumber(n);
  return n.length === 10 ? n.replace(/(\d{2})(?=\d)/g, '$1 ') : n;
}

// ───────────────────────── Liens & pastilles ─────────────────────────
export const item = (id) => (W.D.ITEMS || {})[id] || null;
export const shop = (id) => (W.idx.shopById ? W.idx.shopById.get(id) : null) || null;
export const area = (id) => (W.idx.areaById ? W.idx.areaById.get(id) : null) || null;
export const nightByN = (n) => (W.D.NIGHTS || []).find((x) => x && Number(x.n) === Number(n)) || null;
export const floorName = (f) => (f === 0 ? 'Rez-de-chaussée' : f === 1 ? 'Étage' : 'Niveau ' + f);
export const floorShort = (f) => (f === 0 ? 'RDC' : f === 1 ? 'Étage' : 'N' + f);
export const sideName = (s) => (s === 'N' ? 'côté nord' : s === 'S' ? 'côté sud' : '');

export function itemChip(id, qty = null, extra = '') {
  const it = item(id);
  if (!it) return html`<span class="chip chip-missing">${id}</span>`;
  return html`<a class="chip ichip ${extra}" href="#/objets/${id}"><i class="sw" style="--c:${hex(it.c)}"></i><span>${it.name}</span>${qty != null ? html`<b class="qty">×${qty}</b>` : ''}</a>`;
}
export function shopChip(id, extra = '') {
  const s = shop(id);
  if (!s) { const a = area(id); return a ? areaChip(id) : html`<span class="chip chip-missing">${id}</span>`; }
  return html`<a class="chip schip ${extra}" href="#/magasins/${id}" style="--c:${hex(visible(s.color))}"><i class="dot"></i><span>${s.name}</span></a>`;
}
export function areaChip(id) {
  const a = area(id);
  return html`<a class="chip achip" href="#/magasins?at=zone-${id}"><i class="dot"></i><span>${a ? a.name : id}</span></a>`;
}
export function locLink(loc) {
  if (!loc) return html`<span class="muted">Partout</span>`;
  if (shop(loc)) return shopChip(loc);
  if (area(loc)) return areaChip(loc);
  return html`<span class="chip">${loc}</span>`;
}

// ───────────────────────── Texte riche ─────────────────────────
// [[item:id]] [[item:id|libellé]] [[shop:id]] [[area:id]] [[costume:clé]] [[lamp:clé]] [[page:route|libellé]]
// [[key:E]] [[num:service|kind|numéro]] [[night:3]] [[ent:bobby]] [[end:id]] [[v:variable]]
// {{sp}}…{{/sp}} : spoiler en ligne · **gras**
function token(type, arg, label, vars) {
  const { D } = W;
  switch (type) {
    case 'item': {
      const it = item(arg);
      if (!it) return label || esc(arg);
      return `<a class="ilink" href="#/objets/${esc(arg)}"><i class="sw" style="--c:${hex(it.c)}"></i>${label || esc(it.name)}</a>`;
    }
    case 'shop': {
      const s = shop(arg);
      if (!s) return label || esc(arg);
      return `<a class="slink" href="#/magasins/${esc(arg)}" style="--c:${hex(visible(s.color))}">${label || esc(s.name)}</a>`;
    }
    case 'area': {
      const a = area(arg);
      return `<a class="alink" href="#/magasins?at=zone-${esc(arg)}">${label || esc(a ? a.name : arg)}</a>`;
    }
    case 'costume': {
      const c = (D.COSTUMES || {})[arg];
      return `<a class="clink" href="#/costumes?at=costume-${esc(arg)}">${label || esc(c ? c.name : arg)}</a>`;
    }
    case 'lamp': {
      const f = (D.FLASHLIGHTS || {})[arg];
      return `<a class="clink" href="#/costumes?at=lampe-${esc(arg)}">${label || esc(f ? f.name : arg)}</a>`;
    }
    case 'page': return `<a href="#/${arg}">${label || esc(arg)}</a>`;
    case 'key': return `<kbd>${label || arg}</kbd>`;
    case 'num': {
      const e = phoneEntry(arg);
      return e ? `<span class="num">${esc(fmtPhone(e.num))}</span>` : (label || esc(arg));
    }
    case 'night': return `<a class="nlink" href="#/histoire?at=nuit-${esc(arg)}">${label || 'nuit ' + esc(arg)}</a>`;
    case 'ent': return `<a class="elink" href="#/presences?at=${esc(arg)}">${label || esc(ENTITY_LABELS[arg] || arg)}</a>`;
    case 'end': {
      const e = [...(D.ENDINGS || []), ...(D.EPILOGUES || [])].find((x) => x.id === arg);
      return `<a class="elink" href="#/fins?at=fin-${esc(arg)}">${label || esc(e ? e.name : arg)}</a>`;
    }
    case 'v': {
      const v = vars && vars[arg];
      return v == null ? (label || '') : (v instanceof Raw ? v.s : esc(v));
    }
    default: return null;
  }
}
export function rich(text, vars = null) {
  let s = esc(text);
  s = s.replace(/\[\[(\w+):([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, type, arg, label) => {
    const r = token(type, arg, label, vars);
    return r == null ? m : r;
  });
  s = s.replace(/\[([^[\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\{\{sp\}\}([\s\S]*?)\{\{\/sp\}\}/g, (m, inner) => sp(raw(inner)).s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return raw(typo(s));
}
/** Paragraphes de texte riche. */
export const paras = (list, vars) => join((Array.isArray(list) ? list : [list]).map((p) => html`<p>${rich(p, vars)}</p>`));
export const bullets = (list, vars, cls = '') => html`<ul class="${cls}">${(list || []).map((p) => html`<li>${rich(p, vars)}</li>`)}</ul>`;

// ───────────────────────── Divers ─────────────────────────
export function pageHead({ kicker, title, lead = null, cam = null }) {
  if (!cam && W.route && W.route.ch) cam = 'CH ' + pad2(W.route.ch);
  return html`<header class="page-head">
    <div class="kicker"><span class="rec-dot" aria-hidden="true"></span>${cam ? html`<span class="cam">${cam}</span>` : ''}<span>${kicker}</span></div>
    <h1>${title}</h1>
    ${lead ? html`<p class="lead">${lead}</p>` : ''}
  </header>`;
}
export function unavailable(what) {
  return html`<div class="notice warn">${icon('alert')}<div><strong>Données indisponibles.</strong> ${what} n'a pas pu être chargé. Le reste du wiki fonctionne normalement.</div></div>`;
}
/** Petit graphique en barres (une série, une teinte). rows : [{label, value, href?, title?}] */
export function barList(rows, { max = null, unit = '', cls = '' } = {}) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return html`<ul class="barlist ${cls}">${rows.map((r) => {
    const pct = Math.max(0, Math.min(100, (r.value / m) * 100));
    const inner = html`<span class="bl-label">${r.label}</span><span class="bl-track"><span class="bl-bar" style="width:${pct.toFixed(1)}%"></span></span><span class="bl-val">${r.display ?? fmtInt(r.value)}${unit}</span>`;
    return html`<li>${r.href ? html`<a href="${r.href}" title="${r.title || ''}" ${r.data ? raw(r.data) : ''}>${inner}</a>` : html`<div title="${r.title || ''}">${inner}</div>`}</li>`;
  })}</ul>`;
}
