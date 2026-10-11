// Wiki des joueurs de NUIT BLANCHE — point d'entrée.
// Charge les données du jeu (js/data/*.js) à l'exécution : le wiki suit toujours les données du jeu.
// Routage par hash : #/objets, #/objets/teddy, #/magasins/jouets, #/evenements?cat=power…
import { W, html, icon, pad2, nightMinutes, minutesToHHMM } from './lib.js';
import * as G from './pages/guide.js';
import * as M from './pages/world.js';
import * as X from './pages/extras.js';
import { buildSearchIndex, initSearch } from './search.js';
import { NIGHT_REAL_MINUTES } from './content.js';

const DATA_MODULES = {
  items: '../js/data/items.js',
  shops: '../js/data/shops.js',
  events: '../js/data/events.js',
  story: '../js/data/story.js',
  phone: '../js/data/phone.js',
  lore: '../js/data/lore.js',
  costumes: '../js/data/costumes.js',
};
const SCREENS_MODULE = '../js/screens/screens.js';

// Ordre = numérotation des « chaînes » (CH 01…17) affichée dans la navigation.
export const ROUTES = [
  { id: '', title: 'Accueil', group: 'Démarrer', page: G.home },
  { id: 'controles', title: 'Contrôles', group: 'Démarrer', page: G.controls, blurb: 'Clavier, souris, AZERTY ou QWERTY.' },
  { id: 'poste', title: 'Poste de sécurité', group: 'Jouer', page: G.security, blurb: 'Caméras, porte blindée, alarmes, électricité.' },
  { id: 'histoire', title: 'Mode histoire', group: 'Jouer', page: G.story, blurb: 'Les dix nuits, une par une.' },
  { id: 'infini', title: 'Mode infini', group: 'Jouer', page: G.infinite, blurb: 'Tenir le plus de nuits possible.' },
  { id: 'presences', title: 'Présences', group: 'Encyclopédie', page: X.entities, blurb: 'Ce qui rôde la nuit, et comment y survivre.' },
  { id: 'magasins', title: 'Magasins & plan', group: 'Encyclopédie', page: M.shops, blurb: 'Le plan des deux niveaux et chaque boutique.' },
  { id: 'objets', title: 'Objets', group: 'Encyclopédie', page: M.items, blurb: 'Tous les objets : où les trouver, à quoi ils servent.' },
  { id: 'evenements', title: 'Événements', group: 'Encyclopédie', page: M.events, blurb: 'Tout ce qui peut arriver pendant une nuit.' },
  { id: 'telephone', title: 'Téléphone', group: 'Encyclopédie', page: X.phone, blurb: 'Urgences, employés, numéros secrets.' },
  { id: 'costumes', title: 'Costumes & lampes', group: 'Encyclopédie', page: X.costumes, blurb: 'Déguisements utiles et comparatif des lampes.' },
  { id: 'fins', title: 'Fins', group: 'Histoire & secrets', page: X.endings, blurb: 'Les fins et les épilogues secrets.' },
  { id: 'lore', title: 'Lore & fragments', group: 'Histoire & secrets', page: X.lore, blurb: 'Livres, journaux, notes : l\'histoire du centre.' },
  { id: 'ecrans', title: 'Écrans, VHS & jeux', group: 'Histoire & secrets', page: X.screensPage, optional: 'screens', blurb: 'Chaînes de télé, cassettes et jeux vidéo.' },
  { id: 'easter-eggs', title: 'Easter eggs', group: 'Histoire & secrets', page: X.eggs, blurb: 'Les petits secrets cachés.' },
  { id: 'multijoueur', title: 'Multijoueur', group: 'Aide', page: G.multiplayer, blurb: 'Jusqu\'à quatre gardiens en coopération.' },
  { id: 'faq', title: 'FAQ & astuces', group: 'Aide', page: G.faq, blurb: 'Performances, sauvegardes, options.' },
];
ROUTES.forEach((r, i) => { r.ch = i + 1; });

const $ = (s, r = document) => r.querySelector(s);
const STORE_SPOILERS = 'nb-wiki-spoilers';
let searchUI = null;

// ───────────────────────── Données ─────────────────────────
async function loadData() {
  const keys = Object.keys(DATA_MODULES);
  const res = await Promise.allSettled(keys.map((k) => import(DATA_MODULES[k])));
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') Object.assign(W.D, r.value);
    else { W.missing.push(keys[i]); console.warn('[wiki] Module de données indisponible :', DATA_MODULES[keys[i]], r.reason); }
  });
}
function push(map, k, v) { if (!map.has(k)) map.set(k, []); map.get(k).push(v); }
function buildIndex() {
  const D = W.D, ix = W.idx;
  // Tolère les noms de champs de la doc (color/size) si les données évoluent.
  for (const it of Object.values(D.ITEMS || {})) {
    if (it.c == null && it.color != null) it.c = it.color;
    if (it.s == null && Array.isArray(it.size)) it.s = it.size;
    if (it.c == null) it.c = 0x888888;
  }
  ix.shopById = new Map((D.SHOPS || []).map((s) => [s.id, s]));
  ix.areaById = new Map((D.AREAS || []).map((a) => [a.id, a]));
  ix.itemShops = new Map();
  for (const s of D.SHOPS || []) {
    for (const [id, qty] of s.items || []) push(ix.itemShops, id, { shop: s, qty, fixed: false });
    for (const [id, qty] of s.fixed || []) push(ix.itemShops, id, { shop: s, qty, fixed: true });
  }
  ix.itemNights = new Map();
  for (const n of (D.NIGHTS || []).filter(Boolean)) for (const [id, qty] of n.give || []) push(ix.itemNights, id, { n: n.n, qty });
  ix.containedIn = new Map(); ix.givenBy = new Map(); ix.cookedFrom = new Map(); ix.loreItems = new Map();
  ix.costumeItems = new Map(); ix.lampItems = new Map(); ix.gameItems = new Map();
  for (const it of Object.values(D.ITEMS || {})) {
    const p = it.p || {};
    for (const c of new Set(p.contains || [])) push(ix.containedIn, c, it.id);
    for (const g of new Set(p.gives || [])) push(ix.givenBy, g, it.id);
    if (p.cook) push(ix.cookedFrom, p.cook, it.id);
    if (p.lore) push(ix.loreItems, p.lore, it.id);
    if (p.costume) push(ix.costumeItems, p.costume, it.id);
    if (p.game) push(ix.gameItems, p.game, it.id);
    if (it.use === 'flashlight' && p.kind) push(ix.lampItems, p.kind, it.id);
    if (it.use === 'mobile') push(ix.lampItems, 'phone', it.id);
    if (it.use === 'lighter') push(ix.lampItems, 'lighter', it.id);
  }
  ix.catalog = null;
  try { if (D.buildEventCatalog) ix.catalog = D.buildEventCatalog(); } catch (e) { console.warn('[wiki] Catalogue des événements indisponible', e); }
  ix.eventsByLoc = new Map();
  for (const e of ix.catalog || []) if (e.loc) push(ix.eventsByLoc, e.loc, e);
  ix.featureNight = {};
  for (const n of (D.NIGHTS || []).filter(Boolean)) for (const f of n.features || []) if (!(f in ix.featureNight)) ix.featureNight[f] = n.n;
}
async function loadScreens() {
  try {
    const mod = await import(SCREENS_MODULE);
    if (mod && (mod.SCREEN_LIST || mod.VHS_TAPES || mod.GAMES || mod.CHANNELS)) {
      W.screens = mod;
      buildNav();
      buildSearchIndex(ROUTES);
      const { segs } = parseHash();
      if (['ecrans', 'objets'].includes(segs[0] || '')) render({ keepScroll: true });
    }
  } catch {
    // Module des écrans absent ou en cours d'écriture : la section reste masquée.
    console.info('[wiki] Écrans non disponibles pour le moment.');
  }
}

// ───────────────────────── Spoilers ─────────────────────────
function applySpoilers(root = document) {
  root.querySelectorAll('.sp').forEach((el) => {
    const hidden = !W.spoilers && !el.classList.contains('revealed');
    const c = el.querySelector(':scope > .sp-c');
    if (hidden) {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${el.dataset.label || 'Spoiler'} : masqué, activer pour révéler`);
      if (c) { c.setAttribute('aria-hidden', 'true'); c.inert = true; }
    } else {
      el.removeAttribute('tabindex'); el.removeAttribute('role'); el.removeAttribute('aria-label');
      if (c) { c.removeAttribute('aria-hidden'); c.inert = false; }
    }
  });
}
function reveal(el) {
  el.classList.add('revealed');
  el.querySelectorAll('.sp').forEach((x) => x.classList.add('revealed'));
  applySpoilers(el.parentNode || document);
}
function setSpoilers(on, { save = true } = {}) {
  W.spoilers = !!on;
  document.documentElement.classList.toggle('spoilers-on', W.spoilers);
  const box = $('#spoilers');
  if (box) box.checked = W.spoilers;
  if (!W.spoilers) document.querySelectorAll('.sp.revealed').forEach((x) => x.classList.remove('revealed'));
  if (save) { try { localStorage.setItem(STORE_SPOILERS, W.spoilers ? '1' : '0'); } catch { /* stockage indisponible */ } }
  applySpoilers(document);
}

// ───────────────────────── Navigation ─────────────────────────
function buildNav() {
  const nav = $('#nav');
  const groups = [];
  for (const r of ROUTES) {
    if (r.optional === 'screens' && !W.screens) continue;
    let g = groups.find((x) => x.name === r.group);
    if (!g) groups.push((g = { name: r.group, items: [] }));
    g.items.push(r);
  }
  nav.innerHTML = groups.map((g) => html`<div class="nav-group"><p class="nav-h">${g.name}</p><ul>${g.items.map((r) => html`<li><a href="#/${r.id}" data-route="${r.id}"><span class="nav-ch">CH ${pad2(r.ch)}</span><span>${r.title}</span></a></li>`)}</ul></div>`).join('');
  updateNav((parseHash().segs[0]) || '');
}
function updateNav(id) {
  document.querySelectorAll('#nav a[data-route]').forEach((a) => {
    if (a.dataset.route === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
function setMenu(open) {
  document.body.classList.toggle('nav-open', open);
  const b = $('.menu-btn');
  if (b) b.setAttribute('aria-expanded', String(open));
}

// ───────────────────────── Routage ─────────────────────────
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  let segs = [];
  try { segs = (path || '').split('/').filter(Boolean).map(decodeURIComponent); } catch { segs = []; }
  const q = {};
  for (const [k, v] of new URLSearchParams(qs || '')) q[k] = v;
  return { segs, q };
}
function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  let p = el;
  while (p) { if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; }
  el.scrollIntoView({ block: 'start' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  return true;
}
function render({ keepScroll = false } = {}) {
  const { segs, q } = parseHash();
  const route = ROUTES.find((r) => r.id === (segs[0] || ''));
  const main = $('#main');
  const ctx = { segs, q, routes: ROUTES };
  W.route = route || null;
  let out;
  try {
    out = route ? route.page.render(ctx) : M.notFound('Cette page n\'existe pas dans le wiki.', '#/', 'Retour à l\'accueil');
  } catch (e) {
    console.warn('[wiki] Erreur de rendu', e);
    out = html`<div class="notice warn">${icon('alert')}<div><strong>Cette page n'a pas pu s'afficher.</strong> Les données du jeu ont peut-être changé de format.</div></div>`;
  }
  main.innerHTML = String(out);
  if (route && route.page.mount) {
    try { route.page.mount(main, ctx); } catch (e) { console.warn('[wiki] Erreur d\'initialisation de la page', e); }
  }
  applySpoilers(main);
  updateNav(route ? route.id : null);
  const sub = route && route.page.docTitle ? route.page.docTitle(ctx) : null;
  document.title = `${sub || (route ? route.title : 'Page introuvable')} — Wiki Nuit Blanche`;
  setMenu(false);
  if (searchUI) searchUI.close();
  if (!(q.at && scrollToId(q.at)) && !keepScroll) window.scrollTo(0, 0);
  if (!keepScroll && !q.at) main.focus({ preventScroll: true });
}

// ───────────────────────── Horloge de nuit (décor) ─────────────────────────
function startClock() {
  const start = nightMinutes(W.D.NIGHT_START || '22:00');
  const end = nightMinutes(W.D.NIGHT_END || '06:00');
  const span = end - start;
  const t0 = performance.now();
  const tick = () => {
    const realSec = (performance.now() - t0) / 1000;
    const gameMin = (realSec / (NIGHT_REAL_MINUTES * 60)) * span;
    const m = start + (gameMin % span);
    const txt = minutesToHHMM(m);
    document.querySelectorAll('#clock, [data-clock]').forEach((el) => { if (el.textContent !== txt) el.textContent = txt; });
  };
  tick();
  setInterval(tick, 1000);
}

// ───────────────────────── Démarrage ─────────────────────────
function initChrome() {
  let on = false;
  try { on = localStorage.getItem(STORE_SPOILERS) === '1'; } catch { /* stockage indisponible */ }
  setSpoilers(on, { save: false });
  $('#spoilers').addEventListener('change', (e) => {
    setSpoilers(e.target.checked);
    buildSearchIndex(ROUTES);
    if (searchUI) searchUI.refresh();
  });
  $('.menu-btn').addEventListener('click', () => setMenu(!document.body.classList.contains('nav-open')));
  $('.nav-backdrop').addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('nav-open')) setMenu(false);
    const sp = e.target.closest && e.target.closest('.sp');
    if (sp && !W.spoilers && !sp.classList.contains('revealed') && (e.key === 'Enter' || e.key === ' ') && e.target === sp) { e.preventDefault(); reveal(sp); }
  });
  document.addEventListener('click', (e) => {
    const sp = e.target.closest('.sp');
    if (sp && !W.spoilers && !sp.classList.contains('revealed')) { e.preventDefault(); e.stopPropagation(); reveal(sp); return; }
    const a = e.target.closest('a[href^="#/"]');
    if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); render({ keepScroll: true }); }
  }, true);
  window.addEventListener('hashchange', () => render());
}

async function boot() {
  initChrome();
  await loadData();
  buildIndex();
  W.onContent = applySpoilers;
  buildNav();
  buildSearchIndex(ROUTES);
  searchUI = initSearch($('#q'), $('#search-results'));
  if (W.missing.length) {
    const b = $('#data-banner');
    b.innerHTML = html`${icon('alert')}<span>Certaines données du jeu n'ont pas pu être chargées (${W.missing.join(', ')}). Les pages concernées sont incomplètes.</span>`.s;
    b.hidden = false;
  }
  document.documentElement.classList.add('ready');
  render();
  startClock();
  loadScreens();
}
boot();
