// Pages « monde » : magasins (plan + fiches), objets (catalogue + fiches), événements (catalogue filtrable).
import {
  W, html, raw, join, rich, pageHead, icon, sp, spBlock, itemChip, locLink, hex, visible,
  lighten, fmtInt, fmtEuro, norm, barList, skulls, unavailable, floorName, sideName, item, shop, nightByN,
} from '../lib.js';
import { USE_GROUPS, useInfo, EFFECTS, effectInfo, MATERIALS, matName, describeParams, ITEM_WHERE, ITEM_WHERE_SECRET } from '../behaviors.js';
import { LAYOUTS, DOORS, SHOP_INTERIORS } from '../content.js';
import { floorMaps, sectionSVG } from '../map.js';

const setQuery = (base, params) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null && v !== false) qs.set(k, v);
  const s = qs.toString();
  history.replaceState(null, '', '#/' + base + (s ? '?' + s : ''));
};
const byName = (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

// ═════════════════════════ MAGASINS ═════════════════════════
function shopFacts(s) {
  const span = s.w > 1 ? `${s.slot + 1} à ${s.slot + s.w}` : `${s.slot + 1}`;
  return [
    ['Niveau', `${floorName(s.floor)}, ${sideName(s.side)}`],
    ['Emplacement', `${s.w > 1 ? 'cases' : 'case'} ${span} sur 11 (depuis l'ouest)`],
    ['Surface', `${s.w * (W.D.SLOT_W || 12)} × 14 m`],
    ['Ouverture', html`<a href="#/histoire?at=nuit-${s.unlock || 1}">nuit ${s.unlock || 1}</a>`],
    ['Caméras', s.cams ? String(s.cams) : 'aucune'],
    ['Agencement', SHOP_INTERIORS[s.id] || LAYOUTS[s.layout] || s.layout || '—'],
    ['Accès', s.noShutter ? (DOORS[s.door] || 'Porte') : 'Rideau métallique (déverrouillé quand le magasin ouvre)'],
  ];
}
function shopCard(s) {
  const n = (s.items || []).length;
  return html`<a class="shop-card" href="#/magasins/${s.id}" style="--c:${hex(visible(s.color))}">
    <span class="sc-bar" aria-hidden="true"></span>
    <span class="sc-body"><b>${s.name}</b><span class="sc-meta">nuit ${s.unlock || 1} · ${s.cams || 0} cam. · ${n} article${n > 1 ? 's' : ''}</span></span>
  </a>`;
}

function mapBlock(opts = {}) {
  return html`<div class="maps" data-floor="0">
    <div class="map-tabs seg" role="group" aria-label="Niveau affiché"><button type="button" data-floor-btn="0" aria-pressed="true">Rez-de-chaussée</button><button type="button" data-floor-btn="1" aria-pressed="false">Étage</button></div>
    <figure class="map cctv-frame"><figcaption><span class="rec-dot"></span>Rez-de-chaussée</figcaption>${raw(floorMaps(0, opts))}</figure>
    <figure class="map cctv-frame"><figcaption><span class="rec-dot"></span>Étage</figcaption>${raw(floorMaps(1, opts))}</figure>
  </div>`;
}

function shopList() {
  const D = W.D;
  if (!D.SHOPS) return html`${pageHead({ kicker: 'Plan', title: 'Magasins' })}${unavailable('Le module des magasins (shops.js)')}`;
  const groups = [[0, 'N'], [0, 'S'], [1, 'N'], [1, 'S']].map(([f, sd]) => ({
    f, sd, list: D.SHOPS.filter((s) => s.floor === f && s.side === sd).sort((a, b) => a.slot - b.slot),
  }));
  const areas = D.AREAS || [];
  const evByLoc = W.idx.eventsByLoc || new Map();
  const total = D.SHOP_COUNT ?? D.SHOPS.length;
  return html`
    ${pageHead({ kicker: 'Plan du centre', title: 'Magasins & plan', lead: `${total} boutiques sur deux niveaux, plus le bureau du directeur, la salle du personnel et les toilettes. Cliquez sur un magasin pour voir sa fiche : produits, équipements, caméras, événements.` })}
    <div class="map-tools card">
      <label for="map-night"><span>Ouvert à la nuit</span> <b id="map-night-v">10</b></label>
      <input type="range" id="map-night" min="1" max="10" step="1" value="10">
      <span class="small muted" id="map-night-c" aria-live="polite"></span>
    </div>
    ${mapBlock()}
    <p class="small muted">Plan schématique : la galerie court d'ouest en est sur 132 m (11 cases de 12 m de chaque côté), avec l'atrium, sa fontaine et ses escalators au centre. Le poste de sécurité est au bout ouest du rez-de-chaussée, le hall d'entrée au bout est. « N5 » = ouvert à partir de la nuit 5.</p>
    <p class="small muted">${rich('Dans le centre, les bornes lumineuses « Plan du centre » (atrium, haut des escalators, bouts de l\'étage, ascenseur du parking) et les panneaux du hall, du poste de sécurité et du parking affichent le vrai plan de leur niveau : cellules numérotées depuis l\'entrée, couleurs par catégorie (mode, alimentation, restauration, beauté et santé, maison, loisirs, services), kiosques K1 à K4, services (toilettes, ascenseur, escalators, escaliers, sorties, accueil, distributeurs), zones réservées au personnel hachurées et « vous êtes ici » avec le sens du regard. [[key:E]] pour les lire en plein écran ; [[key:M]] avec le [[item:mall_guide|guide du centre]] pour suivre sa position en direct.')}</p>
    ${groups.map((g) => html`
      <section class="section">
        <h2>${floorName(g.f)} — ${sideName(g.sd)}</h2>
        <div class="shop-grid">${g.list.map(shopCard)}</div>
      </section>`)}
    <section class="section">
      <h2>Les autres zones</h2>
      <div class="zone-grid">${areas.map((a) => {
        const ev = (evByLoc.get(a.id) || []).length;
        return html`<article class="card zone" id="zone-${a.id}">
          <h3>${a.name}</h3>
          <p>${a.desc}</p>
          <p class="small muted">Accessible dès la <a href="#/histoire?at=nuit-${a.unlock}">nuit ${a.unlock}</a>${ev ? html` · <a href="#/evenements?loc=${a.id}">${ev} événement${ev > 1 ? 's' : ''} possible${ev > 1 ? 's' : ''}</a>` : ''}</p>
        </article>`;
      })}</div>
    </section>
    <section class="section">
      <h2>Coupe schématique</h2>
      <div class="hscroll cctv-frame section-wrap">${raw(sectionSVG())}</div>
      <p class="small muted">Schéma non à l'échelle. Sous le centre : le parking souterrain (entrée par la rampe, côté est) et le sous-sol technique. L'entrepôt est à l'ouest, le toit au-dessus, accessible par l'escalier de service ouest.</p>
    </section>`;
}

function shopDetail(id) {
  const s = shop(id);
  if (!s) return notFound('Ce magasin n\'existe pas (ou plus).', '#/magasins', 'Tous les magasins');
  const evs = ((W.idx.eventsByLoc || new Map()).get(s.id) || []).slice().sort((a, b) => a.minNight - b.minNight || a.name.localeCompare(b.name, 'fr'));
  const same = (W.D.SHOPS || []).filter((x) => x.floor === s.floor && x.side === s.side).sort((a, b) => a.slot - b.slot);
  const i = same.indexOf(s);
  const west = same[i - 1], east = same[i + 1];
  const qty = (s.items || []).reduce((a, [, q]) => a + q, 0);
  return html`
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="#/magasins">Magasins</a><span aria-hidden="true">›</span><span>${s.name}</span></nav>
    <header class="shop-head" style="--c:${hex(visible(s.color))};--c0:${hex(s.color)}">
      <div class="sh-sign"><span class="neon-sign">${s.name}</span></div>
      <p class="lead">${s.desc}</p>
    </header>
    <section class="section grid-2 shop-top">
      <dl class="facts card">${shopFacts(s).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      <figure class="map mini cctv-frame"><figcaption><span class="rec-dot"></span>${floorName(s.floor)}</figcaption>${raw(floorMaps(s.floor, { highlight: s.id }))}</figure>
    </section>
    ${(s.items || []).length ? html`<section class="section">
      <h2>En rayon <span class="count-badge">${s.items.length} produits · ${fmtInt(qty)} articles</span></h2>
      <div class="chips">${s.items.map(([iid, q]) => itemChip(iid, q))}</div>
      <p class="small"><a href="#/objets?shop=${s.id}">Voir ces objets dans le catalogue →</a></p>
    </section>` : ''}
    ${(s.fixed || []).length ? html`<section class="section">
      <h2>Équipements fixes</h2>
      <div class="chips">${s.fixed.map(([iid, q]) => itemChip(iid, q, 'fixed'))}</div>
    </section>` : ''}
    <section class="section">
      <h2>Événements possibles ici <span class="count-badge">${evs.length}</span></h2>
      ${evs.length ? html`<ul class="ev-mini">${evs.map((e) => html`<li>${evLine(e)}</li>`)}</ul>` : html`<p class="muted">Aucun événement propre à ce lieu (les événements « partout » peuvent toujours y survenir).</p>`}
    </section>
    <nav class="pager" aria-label="Magasins voisins">
      ${west ? html`<a href="#/magasins/${west.id}">← ${west.name}</a>` : html`<span></span>`}
      ${east ? html`<a href="#/magasins/${east.id}">${east.name} →</a>` : html`<span></span>`}
    </nav>`;
}

export const shops = {
  title: 'Magasins & plan',
  render(ctx) { return ctx.segs[1] ? shopDetail(ctx.segs[1]) : shopList(); },
  docTitle(ctx) { const s = ctx.segs[1] && shop(ctx.segs[1]); return s ? s.name : null; },
  mount(el, ctx) {
    if (ctx.segs[1]) return;
    const maps = el.querySelector('.maps');
    el.querySelectorAll('[data-floor-btn]').forEach((b) => b.addEventListener('click', () => {
      maps.dataset.floor = b.dataset.floorBtn;
      el.querySelectorAll('[data-floor-btn]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    const r = el.querySelector('#map-night');
    if (!r) return;
    const upd = () => {
      const n = Number(r.value);
      el.querySelector('#map-night-v').textContent = String(n);
      let open = 0, all = 0;
      el.querySelectorAll('.m-shop').forEach((g) => { g.classList.toggle('locked', Number(g.dataset.unlock) > n); });
      for (const s of W.D.SHOPS || []) { all++; if ((s.unlock || 1) <= n) open++; }
      el.querySelector('#map-night-c').textContent = `${open} lieux ouverts sur ${all}`;
    };
    r.addEventListener('input', upd);
    upd();
  },
};

// ═════════════════════════ OBJETS ═════════════════════════
const itemState = { q: '', use: '', shop: '', mat: '', type: '', effect: '', sort: 'name' };
const ITEM_KEYS = Object.keys(itemState);

function itemShopsText(id) {
  const l = (W.idx.itemShops && W.idx.itemShops.get(id)) || [];
  const names = [...new Set(l.map((x) => x.shop.name))];
  return names;
}
function itemHaystack(it) {
  if (it._h) return it._h;
  const u = useInfo(it.use);
  return (it._h = norm([it.name, it.desc, it.id, it.label, u.label, matName(it.mat), ...itemShopsText(it.id)].filter(Boolean).join(' ')));
}
function filterItems(st) {
  const all = Object.values(W.D.ITEMS || {});
  const toks = norm(st.q).split(/\s+/).filter(Boolean);
  let list = all.filter((it) => {
    if (st.use && (st.use.startsWith('g:') ? useInfo(it.use).group !== st.use.slice(2) : it.use !== st.use)) return false;
    if (st.shop) {
      const l = (W.idx.itemShops.get(it.id) || []);
      if (st.shop === '-' ? l.length : !l.some((x) => x.shop.id === st.shop)) return false;
    }
    if (st.mat && it.mat !== st.mat) return false;
    if (st.type === 'fixed' && !it.fixed) return false;
    if (st.type === 'portable' && it.fixed) return false;
    if (st.effect && !(it.p && it.p.effect === st.effect)) return false;
    if (toks.length) { const h = itemHaystack(it); if (!toks.every((t) => h.includes(t))) return false; }
    return true;
  });
  if (st.sort === 'value') list.sort((a, b) => (b.value || 0) - (a.value || 0) || byName(a, b));
  else if (st.sort === 'food') list.sort((a, b) => ((b.p && b.p.food) || 0) - ((a.p && a.p.food) || 0) || byName(a, b));
  else if (st.sort === 'use') list.sort((a, b) => useInfo(a.use).label.localeCompare(useInfo(b.use).label, 'fr') || byName(a, b));
  else list.sort(byName);
  return list;
}
function itemCard(it) {
  const u = useInfo(it.use);
  const shopsN = itemShopsText(it.id);
  const where = shopsN.length ? shopsN.slice(0, 2).join(', ') + (shopsN.length > 2 ? ` +${shopsN.length - 2}` : '') : 'hors rayons';
  const eff = it.p && it.p.effect;
  return html`<a class="icard" href="#/objets/${it.id}">
    <span class="icard-sw" style="--c:${hex(it.c)}" ${it.fixed ? raw('title="Installation fixe"') : ''}>${it.fixed ? icon('pin') : ''}</span>
    <span class="icard-body">
      <span class="icard-name">${it.name}</span>
      <span class="icard-meta"><span class="tag tag-use g-${u.group}">${u.label}</span>${eff ? html`<span class="eff eff-${eff}">${effectInfo(eff).label}</span>` : ''}</span>
      <span class="icard-where">${where}</span>
    </span>
    ${it.value ? html`<span class="icard-val">${fmtEuro(it.value)}</span>` : ''}
  </a>`;
}

function itemsList(ctx) {
  const D = W.D;
  if (!D.ITEMS) return html`${pageHead({ kicker: 'Catalogue', title: 'Objets' })}${unavailable('Le catalogue des objets (items.js)')}`;
  for (const k of ITEM_KEYS) itemState[k] = ctx.q[k] != null ? ctx.q[k] : (k === 'sort' ? 'name' : '');
  const all = Object.values(D.ITEMS);
  const useCount = {};
  for (const it of all) useCount[it.use] = (useCount[it.use] || 0) + 1;
  const groups = {};
  for (const u of Object.keys(useCount)) { const g = useInfo(u).group; (groups[g] = groups[g] || []).push(u); }
  const gOrder = Object.keys(USE_GROUPS).filter((g) => groups[g]);
  const st = itemState;
  const opt = (v, label, cur) => html`<option value="${v}" ${cur === v ? raw('selected') : ''}>${label}</option>`;
  const shopsSorted = (D.SHOPS || []).slice().sort(byName);
  const mats = [...new Set(all.map((i) => i.mat))].sort((a, b) => matName(a).localeCompare(matName(b), 'fr'));
  const effects = [...new Set(all.map((i) => i.p && i.p.effect).filter(Boolean))];
  return html`
    ${pageHead({ kicker: 'Catalogue', title: 'Objets', lead: `Les ${fmtInt(all.length)} objets du centre : où les trouver, à quoi ils servent, ce qu'ils font. Tout se ramasse (E), se lance (clic droit) et se pose (G) — sauf les installations fixes.` })}
    <div class="filters card" role="search" aria-label="Filtrer les objets">
      <label class="f-q"><span class="sr-only">Rechercher</span>${icon('search')}<input type="search" data-f="q" value="${st.q}" placeholder="Nom, description, magasin…" autocomplete="off"></label>
      <label><span>Usage</span><select data-f="use">
        ${opt('', 'Tous les usages', st.use)}
        ${gOrder.map((g) => html`<optgroup label="${USE_GROUPS[g]}">${opt('g:' + g, `— ${USE_GROUPS[g]} (tous)`, st.use)}${groups[g].sort((a, b) => useInfo(a).label.localeCompare(useInfo(b).label, 'fr')).map((u) => opt(u, `${useInfo(u).label} (${useCount[u]})`, st.use))}</optgroup>`)}
      </select></label>
      <label><span>Magasin</span><select data-f="shop">${opt('', 'Tous', st.shop)}${opt('-', 'Hors rayons', st.shop)}${shopsSorted.map((s) => opt(s.id, s.name, st.shop))}</select></label>
      <label><span>Matériau</span><select data-f="mat">${opt('', 'Tous', st.mat)}${mats.map((m) => opt(m, matName(m), st.mat))}</select></label>
      <label><span>Type</span><select data-f="type">${opt('', 'Tous', st.type)}${opt('portable', 'Portables', st.type)}${opt('fixed', 'Installations fixes', st.type)}</select></label>
      <label><span>Effet</span><select data-f="effect">${opt('', 'Tous', st.effect)}${effects.map((e) => opt(e, effectInfo(e).label, st.effect))}</select></label>
      <label><span>Tri</span><select data-f="sort">${opt('name', 'Nom', st.sort)}${opt('use', 'Usage', st.sort)}${opt('value', 'Valeur (€)', st.sort)}${opt('food', 'Nourriture', st.sort)}</select></label>
      <button type="button" class="btn-small" data-reset>Réinitialiser</button>
    </div>
    <p class="result-count" aria-live="polite" data-count></p>
    <div class="igrid" data-list></div>
    <details class="card uses-legend" id="usages">
      <summary>Les ${Object.keys(useCount).length} comportements d'objets, expliqués</summary>
      ${gOrder.map((g) => html`<h3>${USE_GROUPS[g]}</h3><dl class="uses">${groups[g].map((u) => html`<div><dt><a href="#/objets?use=${u}">${useInfo(u).label}</a> <code>${u}</code> <span class="muted small">×${useCount[u]}</span></dt><dd>${useInfo(u).text}</dd></div>`)}</dl>`)}
      <h3>Effets</h3>
      <dl class="uses">${Object.entries(EFFECTS).map(([k, e]) => html`<div><dt><span class="eff eff-${k}">${e.label}</span> <code>${k}</code></dt><dd>${e.text}.</dd></div>`)}</dl>
      <h3>Matériaux</h3>
      <p class="small">${rich('Le matériau (`mat`) donne le son d\'impact quand l\'objet tombe ou est lancé : ' + Object.values(MATERIALS).join(', ') + '. Le verre et la céramique fragiles se brisent.')}</p>
    </details>`;
}
function mountItems(el) {
  const list = el.querySelector('[data-list]');
  const count = el.querySelector('[data-count]');
  const total = Object.keys(W.D.ITEMS || {}).length;
  const update = () => {
    const res = filterItems(itemState);
    count.textContent = `${res.length} objet${res.length > 1 ? 's' : ''} sur ${total}`;
    list.innerHTML = res.length ? res.map((it) => itemCard(it).s).join('') : '<p class="empty">Aucun objet ne correspond à ces filtres.</p>';
    setQuery('objets', { ...itemState, sort: itemState.sort === 'name' ? '' : itemState.sort });
    if (W.onContent) W.onContent(list);
  };
  let t = 0;
  el.querySelectorAll('[data-f]').forEach((inp) => {
    const ev = inp.tagName === 'INPUT' ? 'input' : 'change';
    inp.addEventListener(ev, () => { itemState[inp.dataset.f] = inp.value; clearTimeout(t); t = setTimeout(update, inp.tagName === 'INPUT' ? 120 : 0); });
  });
  el.querySelector('[data-reset]').addEventListener('click', () => {
    for (const k of ITEM_KEYS) itemState[k] = k === 'sort' ? 'name' : '';
    el.querySelectorAll('[data-f]').forEach((inp) => { inp.value = itemState[inp.dataset.f]; });
    update();
  });
  update();
}

const darken = (c, t) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; const m = (v) => Math.round(v * (1 - t)); return (m(r) << 16) | (m(g) << 8) | m(b); };
function isoBox(it) {
  const [w, h, d] = it.s || [0.2, 0.2, 0.2];
  const k = 64 / Math.max(w, h, d, 0.001);
  const X = Math.max(w * k, 3), Y = Math.max(h * k, 3), Z = Math.max(d * k, 3);
  const c = Math.cos(Math.PI / 6), s = 0.5;
  const p = (x, y, z) => [(x - z) * c, (x + z) * s - y];
  const P = { B: p(X, 0, 0), C: p(X, 0, Z), D: p(0, 0, Z), E: p(0, Y, 0), F: p(X, Y, 0), G: p(X, Y, Z), H: p(0, Y, Z) };
  const xs = Object.values(P).map((q) => q[0]), ys = Object.values(P).map((q) => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 6;
  const pt = (q) => `${(q[0] - minX + pad).toFixed(1)},${(q[1] - minY + pad).toFixed(1)}`;
  const poly = (keys, col) => `<polygon points="${keys.map((key) => pt(P[key])).join(' ')}" fill="${hex(col)}"/>`;
  const base = Number(it.c) >>> 0;
  const top = lighten(base, 0.28), right = base, left = darken(base, 0.3);
  const vw = maxX - minX + pad * 2, vh = maxY - minY + pad * 2;
  return raw(`<svg class="iso" viewBox="0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}" role="img" aria-label="Volume de l'objet">${poly(['E', 'F', 'G', 'H'], top)}${poly(['B', 'C', 'G', 'F'], right)}${poly(['D', 'C', 'G', 'H'], left)}</svg>`);
}
function fmtDim(v) { return v >= 1.5 ? `${String(+v.toFixed(2)).replace('.', ',')} m` : `${Math.round(v * 100)} cm`; }

function itemDetail(id) {
  const it = item(id);
  if (!it) return notFound('Cet objet n\'existe pas dans le catalogue.', '#/objets', 'Tous les objets');
  const u = useInfo(it.use);
  const ix = W.idx;
  const shopsL = (ix.itemShops.get(id) || []);
  const sell = shopsL.filter((x) => !x.fixed), fixedIn = shopsL.filter((x) => x.fixed);
  const nights = ix.itemNights.get(id) || [];
  const inCont = ix.containedIn.get(id) || [];
  const givers = ix.givenBy.get(id) || [];
  const cooked = ix.cookedFrom.get(id) || [];
  const params = describeParams(it);
  const p = it.p || {};
  const lore = p.lore && W.D.LORE ? W.D.LORE[p.lore] : null;
  const lamp = it.use === 'flashlight' && p.kind && W.D.FLASHLIGHTS ? W.D.FLASHLIGHTS[p.kind] : null;
  const costume = p.costume && W.D.COSTUMES ? W.D.COSTUMES[p.costume] : null;
  const similar = Object.values(W.D.ITEMS).filter((x) => x.use === it.use && x.id !== it.id).sort(byName).slice(0, 14);
  const [w, h, d] = it.s || [];
  const hasWhere = sell.length || fixedIn.length || nights.length || inCont.length || givers.length || cooked.length || ITEM_WHERE[id] || ITEM_WHERE_SECRET[id];
  return html`
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="#/objets">Objets</a><span aria-hidden="true">›</span><a href="#/objets?use=${it.use}">${u.label}</a><span aria-hidden="true">›</span><span>${it.name}</span></nav>
    <header class="item-head">
      <div class="item-visual cctv-frame">${isoBox(it)}</div>
      <div class="item-title">
        <p class="kicker"><span class="rec-dot" aria-hidden="true"></span><span class="cam cam-id">${it.id}</span><span>${it.fixed ? 'Installation fixe' : 'Objet portable'}</span></p>
        <h1>${it.name}</h1>
        ${it.label ? html`<p class="item-label">Étiquette : <span>${it.label}</span></p>` : ''}
        ${it.desc ? html`<p class="lead">${it.desc}</p>` : ''}
      </div>
    </header>
    <section class="section grid-2">
      <div class="card use-box">
        <h2>Utilisation <span class="tag tag-use g-${u.group}">${u.label}</span></h2>
        <p>${u.text}</p>
        ${params.length ? html`<dl class="params">${params.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : ''}
      </div>
      <div class="card">
        <h2>Caractéristiques</h2>
        <dl class="params">
          <div><dt>Matériau</dt><dd>${matName(it.mat)}</dd></div>
          ${w != null ? html`<div><dt>Dimensions</dt><dd>${fmtDim(w)} × ${fmtDim(h)} × ${fmtDim(d)} <span class="muted small">(L × H × P)</span></dd></div>` : ''}
          ${it.mass ? html`<div><dt>Poids</dt><dd>${it.mass} kg</dd></div>` : ''}
          ${it.value != null && (it.value > 0 || it.use === 'jewel') ? html`<div><dt>Valeur</dt><dd class="money">${it.value > 0 ? fmtEuro(it.value) : 'sans prix'}</dd></div>` : ''}
          <div><dt>Type</dt><dd>${it.fixed ? 'Installation fixe (ne se ramasse pas)' : 'Portable'}</dd></div>
          <div><dt>Couleur</dt><dd><i class="sw big" style="--c:${hex(it.c)}"></i> <code>${hex(it.c)}</code></dd></div>
        </dl>
      </div>
    </section>
    <section class="section card">
      <h2>Où le trouver</h2>
      ${hasWhere ? html`<dl class="where">
        ${sell.length ? html`<div><dt>En rayon</dt><dd>${join(sell.map((x) => html`<a class="chip schip" href="#/magasins/${x.shop.id}" style="--c:${hex(visible(x.shop.color))}"><i class="dot"></i>${x.shop.name}<b class="qty">×${x.qty}</b></a>`), ' ')}</dd></div>` : ''}
        ${fixedIn.length ? html`<div><dt>Installé dans</dt><dd>${join(fixedIn.map((x) => html`<a class="chip schip" href="#/magasins/${x.shop.id}" style="--c:${hex(visible(x.shop.color))}"><i class="dot"></i>${x.shop.name}<b class="qty">×${x.qty}</b></a>`), ' ')}</dd></div>` : ''}
        ${nights.length ? html`<div><dt>Fourni au poste</dt><dd>${join(nights.map((x) => html`<a class="chip" href="#/histoire?at=nuit-${x.n}">Nuit ${x.n} <b class="qty">×${x.qty}</b></a>`), ' ')}</dd></div>` : ''}
        ${inCont.length ? html`<div><dt>Contenu dans</dt><dd>${join(inCont.map((c) => itemChip(c)), ' ')}</dd></div>` : ''}
        ${givers.length ? html`<div><dt>Distribué par</dt><dd>${join(givers.map((c) => itemChip(c)), ' ')}</dd></div>` : ''}
        ${cooked.length ? html`<div><dt>En cuisant</dt><dd>${join(cooked.map((c) => itemChip(c)), ' ')} <span class="muted small">(micro-ondes ou four)</span></dd></div>` : ''}
        ${ITEM_WHERE[id] ? html`<div><dt>Ailleurs</dt><dd>${ITEM_WHERE[id]}</dd></div>` : ''}
        ${ITEM_WHERE_SECRET[id] ? html`<div><dt>Ailleurs</dt><dd>${sp(ITEM_WHERE_SECRET[id])}</dd></div>` : ''}
      </dl>` : html`<p class="muted">Emplacement non documenté : explorez !</p>`}
    </section>
    ${p.text ? html`<section class="section card"><h2>Ce qu'on y lit</h2>${spBlock(html`<p class="prewrap">${p.text}</p>`, 'Texte de l\'objet')}</section>` : ''}
    ${lore ? html`<section class="section card"><h2>Lecture : ${lore.title}</h2>${spBlock(html`<p class="prewrap">${lore.text}</p>`, 'Texte du lore')}<p class="small"><a href="#/lore?at=lore-${p.lore}">Voir dans Lore & fragments →</a></p></section>` : ''}
    ${lamp ? html`<section class="section card"><h2>Lampe : ${lamp.name}</h2><p>Puissance ${lamp.intensity}, portée ${lamp.range} m, autonomie ${lamp.drain ? `${(1 / lamp.drain / 60).toFixed(1).replace('.', ',')} min par jeu de piles` : 'illimitée'}. <a href="#/costumes?at=lampe-${p.kind}">Comparer les lampes →</a></p></section>` : ''}
    ${costume ? html`<section class="section card"><h2>Costume : ${costume.name}</h2><p>${costume.desc}</p><p class="small"><a href="#/costumes?at=costume-${p.costume}">Tous les costumes →</a></p></section>` : ''}
    ${similar.length ? html`<section class="section"><h2>Même usage</h2><div class="chips">${similar.map((x) => itemChip(x.id))}</div></section>` : ''}`;
}

export const items = {
  title: 'Objets',
  render(ctx) { return ctx.segs[1] ? itemDetail(ctx.segs[1]) : itemsList(ctx); },
  docTitle(ctx) { const it = ctx.segs[1] && item(ctx.segs[1]); return it ? it.name : null; },
  mount(el, ctx) { if (!ctx.segs[1] && W.D.ITEMS) mountItems(el); },
};

// ═════════════════════════ ÉVÉNEMENTS ═════════════════════════
export const isSpoilerEvent = (e) => e.scare >= 3 || e.cat === 'finale' || e.cat === 'screamer';
const evState = { q: '', cat: '', night: '', story: '', loc: '', scare: '', view: '' };
const EV_KEYS = Object.keys(evState);

function evLine(e) {
  const cats = W.D.EVENT_CATEGORIES || {};
  const spoil = isSpoilerEvent(e);
  const body = html`<b class="ev-name">${e.name}</b><span class="ev-desc">${e.desc}</span>`;
  return html`<span class="ev-l"><span class="tag cat-${e.cat}">${cats[e.cat] || e.cat}</span><span class="ev-n">N${e.minNight}+</span>${skulls(e.scare)}</span><span class="ev-r">${spoil ? sp(body, 'Événement effrayant') : body}</span>`;
}
function evRow(e, tpl = false) {
  const cats = W.D.EVENT_CATEGORIES || {};
  const spoil = isSpoilerEvent(e);
  const fx = [...new Set((e.fx || []).map((f) => f.fx))];
  const desc = tpl ? join(e.desc.split('{loc}').map((part, i) => (i ? html`<span class="loc-ph">lieu</span>${part}` : part))) : e.desc;
  const main = html`<b class="ev-name">${e.name}</b><span class="ev-desc">${desc}</span>`;
  const locs = tpl ? (e.locs || []) : null;
  return html`<li class="ev ${spoil ? 'ev-spoil' : ''}">
    <div class="ev-head"><span class="tag cat-${e.cat}">${cats[e.cat] || e.cat}</span><span class="ev-n" title="Nuit minimale (mode histoire)">nuit ${e.minNight}+</span>${skulls(e.scare)}</div>
    <div class="ev-main">${spoil ? sp(main, 'Événement effrayant') : main}</div>
    <div class="ev-foot">
      ${tpl ? (locs.length ? html`<span class="ev-locs">${locs.length} lieu${locs.length > 1 ? 'x' : ''} : ${join(locs.slice(0, 8).map((l) => locLink(l)), ' ')}${locs.length > 8 ? html` <span class="muted">+${locs.length - 8}</span>` : ''}</span>` : html`<span class="muted small">Partout</span>`) : locLink(e.loc)}
      <span class="ev-fx" title="Primitives d'effet">${fx.join(' · ')}</span>
    </div>
  </li>`;
}
function filterEvents(st, list) {
  const toks = norm(st.q).split(/\s+/).filter(Boolean);
  const scares = st.scare ? new Set(st.scare.split(',').map(Number)) : null;
  const night = Number(st.night) || 0;
  const N = night ? nightByN(night) : null;
  const allowed = st.story && N && N.random ? new Set(N.random.cats) : null;
  return list.filter((e) => {
    if (st.cat && e.cat !== st.cat) return false;
    if (night && e.minNight > night) return false;
    if (allowed && !allowed.has(e.cat)) return false;
    if (scares && !scares.has(e.scare)) return false;
    if (st.loc) {
      if (st.view === 'tpl') { if (st.loc === '-' ? e.locs : !(e.locs || []).includes(st.loc)) return false; }
      else if (st.loc === '-' ? e.loc : e.loc !== st.loc) return false;
    }
    if (toks.length) {
      const hidden = isSpoilerEvent(e) && !W.spoilers;
      const h = norm([e.name, hidden ? '' : e.desc, e.id].join(' '));
      if (!toks.every((t) => h.includes(t))) return false;
    }
    return true;
  });
}

export const events = {
  title: 'Événements',
  render(ctx) {
    const D = W.D;
    const cat = W.idx.catalog;
    if (!cat || !D.EVENT_TEMPLATES) return html`${pageHead({ kicker: 'Catalogue', title: 'Événements' })}${unavailable('Le catalogue des événements (events.js)')}`;
    for (const k of EV_KEYS) evState[k] = ctx.q[k] != null ? ctx.q[k] : '';
    const st = evState;
    const cats = D.EVENT_CATEGORIES || {};
    const counts = {};
    for (const e of cat) counts[e.cat] = (counts[e.cat] || 0) + 1;
    const scareCounts = [0, 1, 2, 3].map((s) => cat.filter((e) => e.scare === s).length);
    const rows = Object.keys(cats).filter((k) => counts[k]).map((k) => ({ label: cats[k], value: counts[k], href: `#/evenements?cat=${k}`, title: `Filtrer : ${cats[k]}` }));
    const opt = (v, label, cur) => html`<option value="${v}" ${String(cur) === String(v) ? raw('selected') : ''}>${label}</option>`;
    const nights = (D.NIGHTS || []).filter(Boolean);
    const scareSel = st.scare ? st.scare.split(',') : ['0', '1', '2', '3'];
    const locs = [...(D.SHOPS || []).slice().sort(byName).map((s) => [s.id, s.name]), ...(D.AREAS || []).map((a) => [a.id, a.name])];
    return html`
      ${pageHead({ kicker: 'Catalogue', title: 'Événements', lead: `Ce qui peut arriver pendant une nuit. Chaque modèle d'événement est décliné pour chacun de ses lieux : ${fmtInt(D.EVENT_TEMPLATES.length)} modèles donnent ${fmtInt(cat.length)} événements distincts.` })}
      <section class="section grid-2 ev-overview">
        <div class="card">
          <h2>Par catégorie</h2>
          ${barList(rows)}
        </div>
        <div class="card">
          <h2>En chiffres</h2>
          <ul class="stats compact">
            <li><b>${fmtInt(D.EVENT_TEMPLATES.length)}</b><span>modèles</span></li>
            <li><b>${fmtInt(cat.length)}</b><span>événements</span></li>
            <li><b>${Object.keys(counts).length}</b><span>catégories</span></li>
          </ul>
          <p class="small muted">${rich('**Nuit** : nuit minimale à partir de laquelle l\'événement peut être tiré en mode histoire. En mode infini, tout le catalogue est disponible. Les crânes indiquent la frayeur (0 à 3). Les événements les plus effrayants (3 crânes, finale, screamers) sont floutés tant que les spoilers sont masqués.')}</p>
        </div>
      </section>
      <div class="filters card" role="search" aria-label="Filtrer les événements">
        <label class="f-q"><span class="sr-only">Rechercher</span>${icon('search')}<input type="search" data-f="q" value="${st.q}" placeholder="Nom, description…" autocomplete="off"></label>
        <label><span>Catégorie</span><select data-f="cat">${opt('', 'Toutes', st.cat)}${Object.entries(cats).map(([k, v]) => opt(k, `${v} (${counts[k] || 0})`, st.cat))}</select></label>
        <label><span>Nuit</span><select data-f="night">${opt('', 'Toutes', st.night)}${nights.map((n) => opt(n.n, `Nuit ${n.n} — ${n.subtitle}`, st.night))}</select></label>
        <label class="f-check"><input type="checkbox" data-f="story" ${st.story ? raw('checked') : ''}><span>Seulement les catégories tirées cette nuit-là</span></label>
        <label><span>Lieu</span><select data-f="loc">${opt('', 'Tous', st.loc)}${opt('-', 'Partout (sans lieu)', st.loc)}${locs.map(([id, n]) => opt(id, n, st.loc))}</select></label>
        <fieldset class="f-scare"><legend>Frayeur</legend>${[0, 1, 2, 3].map((s) => html`<label class="scare-chip"><input type="checkbox" data-scare="${s}" ${scareSel.includes(String(s)) ? raw('checked') : ''}>${skulls(s, { label: false })}<span class="sr-only">${s} crâne${s > 1 ? 's' : ''}</span><span class="small muted">${scareCounts[s]}</span></label>`)}</fieldset>
        <div class="seg" role="group" aria-label="Affichage">
          <button type="button" data-view="" aria-pressed="${st.view !== 'tpl'}">Catalogue</button>
          <button type="button" data-view="tpl" aria-pressed="${st.view === 'tpl'}">Modèles</button>
        </div>
        <button type="button" class="btn-small" data-reset>Réinitialiser</button>
      </div>
      <p class="result-count" aria-live="polite" data-count></p>
      <ul class="ev-list" data-list></ul>`;
  },
  mount(el) {
    if (!W.idx.catalog) return;
    const list = el.querySelector('[data-list]');
    const count = el.querySelector('[data-count]');
    const storyBox = el.querySelector('[data-f="story"]');
    const update = () => {
      const tpl = evState.view === 'tpl';
      const src = tpl ? W.D.EVENT_TEMPLATES : W.idx.catalog;
      const res = filterEvents(evState, src);
      const tot = src.length;
      count.textContent = `${res.length} ${tpl ? 'modèle' : 'événement'}${res.length > 1 ? 's' : ''} sur ${tot}`;
      list.innerHTML = res.length ? res.map((e) => evRow(e, tpl).s).join('') : '<li class="empty">Aucun événement ne correspond à ces filtres.</li>';
      storyBox.disabled = !evState.night;
      storyBox.closest('label').classList.toggle('disabled', !evState.night);
      setQuery('evenements', evState);
      if (W.onContent) W.onContent(list);
    };
    let t = 0;
    el.querySelectorAll('[data-f]').forEach((inp) => {
      const isText = inp.type === 'search';
      inp.addEventListener(isText ? 'input' : 'change', () => {
        evState[inp.dataset.f] = inp.type === 'checkbox' ? (inp.checked ? '1' : '') : inp.value;
        clearTimeout(t); t = setTimeout(update, isText ? 120 : 0);
      });
    });
    const scareBoxes = [...el.querySelectorAll('[data-scare]')];
    scareBoxes.forEach((b) => b.addEventListener('change', () => {
      const on = scareBoxes.filter((x) => x.checked).map((x) => x.dataset.scare);
      evState.scare = on.length === 4 ? '' : on.join(',') || 'none';
      update();
    }));
    el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      evState.view = b.dataset.view;
      el.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      update();
    }));
    el.querySelector('[data-reset]').addEventListener('click', () => {
      for (const k of EV_KEYS) evState[k] = '';
      el.querySelectorAll('[data-f]').forEach((inp) => { if (inp.type === 'checkbox') inp.checked = false; else inp.value = ''; });
      scareBoxes.forEach((b) => { b.checked = true; });
      el.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === '')));
      update();
    });
    update();
  },
};

// ═════════════════════════ Divers ═════════════════════════
export function notFound(msg, href, label) {
  return html`<section class="notfound cctv-frame">
    <p class="nf-code">SIGNAL PERDU</p>
    <h1>Rien à cet endroit</h1>
    <p>${msg}</p>
    <p><a class="btn btn-ghost" href="${href}">${label}</a></p>
  </section>`;
}
