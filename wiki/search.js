// Recherche globale : objets, magasins, zones, événements, numéros, lore, présences, costumes, fins, écrans, pages.
// L'index ne contient jamais de texte sous spoiler quand les spoilers sont masqués ; il est reconstruit à chaque bascule.
import { W, esc, norm, hex, visible, fmtPhone, floorShort, ENTITY_LABELS } from './lib.js';
import { useInfo } from './behaviors.js';
import { ENTITIES, CONTROLS, EASTER_EGGS } from './content.js';
import { isSpoilerEvent } from './pages/world.js';

const TYPES = {
  page: 'Pages', item: 'Objets', shop: 'Magasins', zone: 'Zones', entity: 'Présences', event: 'Événements',
  phone: 'Numéros', lore: 'Lore', costume: 'Costumes & lampes', ending: 'Fins', screen: 'Écrans', control: 'Contrôles', egg: 'Easter eggs',
};
const STAFF = new Set(['employee', 'pizza', 'self', 'gerard', 'director']);
let INDEX = [];

const strip = (s) => String(s || '').replace(/\[\[\w+:([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a).replace(/\{\{\/?sp\}\}|\*\*/g, '');

export function buildSearchIndex(routes) {
  const D = W.D, spOn = W.spoilers;
  const out = [];
  const add = (type, title, sub, href, extra = '', color = null) => out.push({ type, title, sub, href, color, n: norm(title), h: norm(`${title} ${sub} ${extra}`) });

  for (const r of routes) if (!r.hidden && !(r.optional === 'screens' && !W.screens)) add('page', r.title, r.blurb || 'Page du wiki', '#/' + r.id);
  for (const g of CONTROLS) for (const row of g.rows) {
    const keys = Array.isArray(row.keys) ? row.keys.join(' ') : `${row.keys.azerty.join('')} ${row.keys.qwerty.join('')}`;
    add('control', strip(row.action), `${g.group} · ${keys}`, '#/controles', keys);
  }
  for (const it of Object.values(D.ITEMS || {})) {
    const shops = [...new Set(((W.idx.itemShops && W.idx.itemShops.get(it.id)) || []).map((x) => x.shop.name))];
    add('item', it.name, `${useInfo(it.use).label}${shops.length ? ' · ' + shops.slice(0, 2).join(', ') : ''}`, '#/objets/' + it.id, `${it.desc || ''} ${it.id} ${it.label || ''} ${shops.join(' ')}`, it.c);
  }
  for (const s of D.SHOPS || []) add('shop', s.name, `${floorShort(s.floor)} · nuit ${s.unlock || 1}`, '#/magasins/' + s.id, s.desc, visible(s.color));
  for (const a of D.AREAS || []) add('zone', a.name, `Zone · nuit ${a.unlock}`, '#/magasins?at=zone-' + a.id, a.desc);
  for (const e of ENTITIES) {
    if (e.spoiler && !spOn) continue;
    add('entity', ENTITY_LABELS[e.id] || e.id, e.tag, '#/presences?at=' + e.id, strip(e.summary));
  }
  const cats = D.EVENT_CATEGORIES || {};
  for (const e of W.idx.catalog || []) {
    if (isSpoilerEvent(e) && !spOn) continue;
    const tpl = (D.EVENT_TEMPLATES || []).find((t) => t.id === e.tpl);
    const qs = new URLSearchParams({ q: tpl ? tpl.name : e.name });
    if (e.loc) qs.set('loc', e.loc);
    add('event', e.name, `${cats[e.cat] || e.cat} · nuit ${e.minNight}+`, '#/evenements?' + qs.toString(), e.desc);
  }
  for (const p of D.PHONE_NUMBERS || []) {
    const num = fmtPhone(p.num);
    if (p.known || spOn) add('phone', p.name, num, '#/telephone', `${p.num} ${p.found || ''}`);
    else if (STAFF.has(p.kind)) add('phone', p.name, 'Numéro à trouver', '#/telephone', p.found || '');
  }
  for (const [key, l] of Object.entries(D.LORE || {})) add('lore', l.title, 'Lore', '#/lore?at=lore-' + key, spOn ? l.text : '');
  if (spOn) {
    for (const f of D.FRAGMENTS || []) add('lore', f.name, 'Fragment de vérité', '#/lore', f.how);
    for (const [n, t] of Object.entries(D.GERARD_NOTES || {})) add('lore', `Note de Gérard — nuit ${n}`, 'Lore', '#/lore?at=notes', t);
    EASTER_EGGS.forEach((e) => add('egg', e.title, e.hint, '#/easter-eggs', strip(e.text(D))));
  }
  for (const [k, c] of Object.entries(D.COSTUMES || {})) add('costume', c.name, 'Costume', '#/costumes?at=costume-' + k, c.desc, visible(c.color));
  for (const [k, l] of Object.entries(D.FLASHLIGHTS || {})) if (k !== 'none') add('costume', l.name, 'Lampe', '#/costumes?at=lampe-' + k, '', l.color);
  for (const e of [...(D.ENDINGS || []), ...(D.EPILOGUES || [])]) add('ending', e.name, e.early ? 'Fin anticipée' : 'Fin', '#/fins?at=fin-' + e.id, spOn ? e.desc : '');
  if (W.screens) {
    const lists = [['CHANNELS', 'Chaîne', 'ch'], ['VHS_TAPES', 'Cassette VHS', 'vhs'], ['GAMES', 'Jeu', 'jeu']];
    for (const [key, label, pre] of lists) {
      const l = W.screens[key];
      const arr = Array.isArray(l) ? l : l && typeof l === 'object' ? Object.entries(l).map(([id, v]) => (typeof v === 'object' ? { id, ...v } : { id, title: v })) : [];
      for (const o of arr) {
        if (!o || typeof o !== 'object') continue;
        const t = o.title || o.name || o.id;
        const secret = key === 'VHS_TAPES' && (o.secret || o.story || o.clue || ['security_1987', 'gerard', 'no_label'].includes(o.id));
        add('screen', String(t), label, `#/ecrans?at=${pre}-${o.id}`, secret && !spOn ? '' : (o.desc || ''));
      }
    }
  }
  INDEX = out;
}

function highlight(title, toks) {
  // Repère les correspondances en ignorant accents et casse, puis les entoure de <mark>.
  const chars = [...title];
  let ns = '';
  const map = [];
  chars.forEach((ch, i) => { const n = norm(ch); for (let k = 0; k < n.length; k++) { ns += n[k]; map.push(i); } });
  const mark = new Array(chars.length).fill(false);
  for (const t of toks) {
    let from = 0, idx;
    while (t && (idx = ns.indexOf(t, from)) !== -1) {
      for (let k = idx; k < idx + t.length; k++) mark[map[k]] = true;
      from = idx + t.length;
    }
  }
  let s = '', open = false;
  chars.forEach((ch, i) => {
    if (mark[i] && !open) { s += '<mark>'; open = true; }
    if (!mark[i] && open) { s += '</mark>'; open = false; }
    s += esc(ch);
  });
  return open ? s + '</mark>' : s;
}

export function search(q) {
  const qn = norm(q).trim();
  const toks = qn.split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const res = [];
  for (const e of INDEX) {
    if (!toks.every((t) => e.h.includes(t))) continue;
    let score = 0;
    if (e.n === qn) score += 120; else if (e.n.startsWith(qn)) score += 70;
    const words = e.n.split(/[\s'’\-«»()/.,:]+/);
    for (const t of toks) {
      if (words.some((w) => w.startsWith(t))) score += 25;
      else if (e.n.includes(t)) score += 12;
    }
    if (e.type === 'page') score += 8;
    res.push({ e, score, toks });
  }
  res.sort((a, b) => b.score - a.score || a.e.title.length - b.e.title.length);
  return res;
}

/** Branche le champ de recherche de l'en-tête. */
export function initSearch(input, panel) {
  let results = [];
  let active = -1;
  const close = () => { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const open = () => { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  const setActive = (i) => {
    const opts = [...panel.querySelectorAll('[role="option"]')];
    if (!opts.length) return;
    active = (i + opts.length) % opts.length;
    opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === active)));
    opts[active].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', opts[active].id);
  };
  const draw = () => {
    const q = input.value;
    results = search(q);
    if (!q.trim()) { close(); panel.innerHTML = ''; return; }
    const groups = new Map();
    for (const r of results) {
      if (!groups.has(r.e.type)) groups.set(r.e.type, []);
      groups.get(r.e.type).push(r);
    }
    let html = '';
    let n = 0;
    if (!results.length) html = `<p class="sr-empty">Aucun résultat pour « ${esc(q)} »${W.spoilers ? '' : ' (les spoilers sont masqués)'}.</p>`;
    for (const [type, list] of groups) {
      html += `<div class="sr-group" role="group" aria-label="${esc(TYPES[type] || type)}"><p class="sr-h">${esc(TYPES[type] || type)} <span>${list.length}</span></p>`;
      for (const r of list.slice(0, type === 'item' || type === 'event' ? 6 : 4)) {
        const sw = r.e.color != null ? `<i class="sw" style="--c:${hex(r.e.color)}"></i>` : '';
        html += `<a role="option" id="sr-${n++}" aria-selected="false" href="${esc(r.e.href)}">${sw}<span class="sr-t">${highlight(r.e.title, r.toks)}</span><span class="sr-s">${esc(r.e.sub)}</span></a>`;
      }
      if (type === 'item' && list.length > 6) html += `<a role="option" id="sr-${n++}" aria-selected="false" class="sr-more" href="#/objets?q=${encodeURIComponent(q)}">Voir les ${list.length} objets →</a>`;
      if (type === 'event' && list.length > 6) html += `<a role="option" id="sr-${n++}" aria-selected="false" class="sr-more" href="#/evenements?q=${encodeURIComponent(q)}">Voir les ${list.length} événements →</a>`;
      html += '</div>';
    }
    panel.innerHTML = html;
    active = -1;
    open();
  };
  let t = 0;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 80); });
  input.addEventListener('focus', () => { if (input.value.trim()) draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (panel.hidden) draw(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      const opts = [...panel.querySelectorAll('[role="option"]')];
      const target = opts[active >= 0 ? active : 0];
      if (target) { e.preventDefault(); location.hash = target.getAttribute('href'); close(); input.blur(); }
    } else if (e.key === 'Escape') { close(); input.blur(); }
  });
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) { close(); input.value = input.value; } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); input.focus(); input.select(); }
  });
  return { close, refresh: () => { if (!panel.hidden) draw(); } };
}
