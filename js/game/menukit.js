// Boîte à outils des menus (écran titre et menus en jeu) : un seul langage visuel, celui du poste de sécurité
// d'Hélios — fenêtres de console (en-tête au soleil d'Hélios, filet ambre, pied avec les touches), liste façon
// incrustation vidéo, réglages en interrupteurs et curseurs de pupitre, feuilles de papier pour les rapports.
// Aucune dépendance au moteur : importé tel quel par l'écran titre (js/main.js) et par l'interface en jeu (ui.js).
import { DEFAULT_SETTINGS } from './save.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// emblème d'Hélios (le même que sur le totem et les plans du centre) : disque dégradé, 12 rayons
export const SUN = `<svg class="nb-sun" viewBox="-50 -50 100 100" aria-hidden="true"><defs><radialGradient id="nbSunG"><stop offset="0" stop-color="#ffe082"/><stop offset="1" stop-color="#ff8f00"/></radialGradient></defs><g fill="#ffb300">${Array.from({ length: 12 }, (_, k) => `<path d="M-6-30L0-49L6-30Z" transform="rotate(${k * 30})"/>`).join('')}</g><circle r="26" fill="url(#nbSunG)"/></svg>`;

// touches rappelées en pied de fenêtre : [['↑↓', 'Choisir'], ['Échap', 'Retour']]
export const keys = (list) => `<span class="nb-keys">${list.map(([k, t]) => `<span><kbd>${k}</kbd>${t}</span>`).join('')}</span>`;

// fenêtre de console : en-tête (rubrique, titre, référence de formulaire), corps défilant, pied
export function winInner({ k = 'Hélios Sécurité', title, ref = '', body = '', foot = '' }) {
  return `<header class="nb-win-h">${SUN}<div class="t"><small>${k}</small><h1>${title}</h1></div>${ref ? `<span class="ref">${ref}</span>` : ''}</header><div class="nb-win-b">${body}</div>${foot ? `<footer class="nb-win-f">${foot}</footer>` : ''}`;
}
export const win = (o) => `<section class="nb-win ${o.cls || ''}">${winInner(o)}</section>`;

// en-tête des documents papier (rapport de garde, journal, dossier clos)
export const paperHead = (sub, ref = '') => `<header class="pp-h">${SUN}<div><b>Centre commercial Hélios</b><small>${sub}</small></div>${ref ? `<span class="ref">${ref}</span>` : ''}</header>`;

// ── réglages : une seule liste pour l'écran titre et la pause (game : réglages modifiables en jeu) ──
const pct = (v) => Math.round(v * 100) + ' %';
export const OPTIONS = [
  { g: 'Profil', k: 'playerName', l: 'Nom du gardien', t: 'text', menu: true },
  { g: 'Image', k: 'quality', l: 'Qualité', t: 'select', o: [['low', 'Basse'], ['medium', 'Moyenne'], ['high', 'Haute (anticrénelage)']] },
  { g: 'Image', k: 'renderScale', l: 'Échelle de rendu', t: 'range', min: 0.4, max: 1, step: 0.05, f: pct },
  { g: 'Image', k: 'autoScale', l: 'Résolution dynamique', h: 'baisse la définition si le jeu rame', t: 'sw' },
  { g: 'Image', k: 'fov', l: 'Champ de vision', t: 'range', min: 55, max: 100, step: 1, f: (v) => Math.round(v) + '°' },
  { g: 'Image', k: 'shadows', l: 'Ombres de la lampe torche', t: 'sw' },
  { g: 'Image', k: 'bloom', l: 'Halo lumineux', t: 'sw' },
  { g: 'Image', k: 'volumetric', l: 'Faisceau volumétrique', t: 'sw' },
  { g: 'Image', k: 'bodycam', l: 'Effet caméra-piéton', h: 'objectif, incrustation, mouvements', t: 'sw' },
  { g: 'Son', k: 'volume', l: 'Volume général', t: 'range', min: 0, max: 1, step: 0.05, f: pct },
  { g: 'Son', k: 'musicVolume', l: 'Musique', t: 'range', min: 0, max: 1, step: 0.05, f: pct },
  { g: 'Son', k: 'voiceVolume', l: 'Voix des personnages', t: 'range', min: 0, max: 1, step: 0.05, f: pct, d: 1 },
  { g: 'Son', k: 'voices', l: 'Babillage des personnages', h: 'petites syllabes à la place des voix', t: 'sw' },
  { g: 'Son', k: 'subtitles', l: 'Sous-titres', t: 'sw' },
  { g: 'Commandes', k: 'sensitivity', l: 'Sensibilité de la souris', t: 'range', min: 0.2, max: 3, step: 0.1, f: (v) => '×' + (+v).toFixed(1) },
  { g: 'Commandes', k: 'invertY', l: 'Inverser l\'axe vertical', t: 'sw' },
  { g: 'Commandes', k: 'screamers', l: 'Screamers (sursauts)', t: 'sw' },
  { g: 'Commandes', k: 'questHud', l: 'Suivi des objectifs à l\'écran', h: 'touche H en jeu', t: 'sw' },
];
const optVal = (s, o) => s[o.k] ?? DEFAULT_SETTINGS[o.k] ?? o.d;
const rangeP = (o, v) => ((v - o.min) / (o.max - o.min) * 100).toFixed(1) + '%';
function optRow(s, o) {
  const v = optVal(s, o), l = `<span class="l">${o.l}${o.h ? `<small>${o.h}</small>` : ''}</span>`;
  if (o.t === 'sw') return `<label class="nb-opt sw">${l}<input type="checkbox" data-o="${o.k}" ${v ? 'checked' : ''}></label>`;
  if (o.t === 'range') return `<label class="nb-opt rg">${l}<input type="range" data-o="${o.k}" min="${o.min}" max="${o.max}" step="${o.step}" value="${v}" style="--p:${rangeP(o, v)}"><output>${o.f(v)}</output></label>`;
  if (o.t === 'select') return `<label class="nb-opt">${l}<select data-o="${o.k}">${o.o.map(([k, n]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  return `<label class="nb-opt tx">${l}<input type="text" data-o="${o.k}" maxlength="20" value="${esc(v)}" spellcheck="false" autocomplete="off"></label>`;
}
export function optionsHTML(s, { game = false } = {}) {
  const groups = new Map();
  for (const o of OPTIONS) { if (game && o.menu) continue; if (!groups.has(o.g)) groups.set(o.g, []); groups.get(o.g).push(optRow(s, o)); }
  return `<div class="nb-opts">${[...groups].map(([g, rows]) => `<section class="nb-grp"><h3>${g}</h3>${rows.join('')}</section>`).join('')}</div>`;
}
// branche les réglages : met à jour l'objet, l'affichage de la valeur, puis prévient (k, v)
export function bindOptions(root, s, onChange) {
  root.querySelectorAll('[data-o]').forEach(inp => inp.oninput = inp.onchange = () => {
    const k = inp.dataset.o, o = OPTIONS.find(x => x.k === k);
    const v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? parseFloat(inp.value) : inp.value;
    s[k] = v;
    if (o?.t === 'range') { inp.style.setProperty('--p', rangeP(o, v)); const out = inp.parentNode.querySelector('output'); if (out) out.textContent = o.f(v); }
    onChange?.(k, v);
  });
}

// ── navigation au clavier ──
// ↑ ↓ d'un élément à l'autre (← → aussi, sauf sur les curseurs et les champs texte), Entrée coche un interrupteur.
// Le survol d'une ligne de liste (.nb-osdmenu) la sélectionne : souris et clavier partagent la même surbrillance.
const FOCUSABLE = 'button:not(:disabled), a[href], input:not([type=hidden]):not([type=file]), select, textarea, label.btn';
export const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter(e => e.offsetParent !== null && !e.closest('[hidden]'));
export function focusFirst(root, sel) {
  const t = (sel && root.querySelector(sel)) || root.querySelector('[data-focus]') || focusables(root)[0];
  try { t?.focus({ preventScroll: true }); } catch (e) { /* */ }
}
// horiz : ↑ ↓ laissés au défilement (documents longs : journal, rapports), ← → passent d'un bouton à l'autre
export function navKey(root, e, horiz = false) {
  const a = document.activeElement, inside = root.contains(a) && a !== root, t = inside ? (a.type || a.tagName.toLowerCase()) : '';
  const k = e.key, text = t === 'text' || t === 'password' || t === 'textarea';
  if (k === 'Enter' && t === 'checkbox') { e.preventDefault(); a.click(); return true; }
  if (k === 'Enter' && a?.matches?.('label.btn')) { e.preventDefault(); a.click(); return true; }
  // en jeu, les flèches et l'espace sont déjà « consommés » par les commandes (preventDefault) : on fait nous-mêmes
  // ce que le navigateur aurait fait (curseur, liste, case, bouton, défilement), pareil sur l'écran titre
  if (k === ' ' && e.defaultPrevented && (t === 'checkbox' || t === 'submit' || t === 'button')) { a.click(); return true; }
  if ((k === 'ArrowRight' || k === 'ArrowLeft') && (t === 'range' || t === 'select-one')) {
    e.preventDefault(); const up = k === 'ArrowRight';
    if (t === 'range') { up ? a.stepUp() : a.stepDown(); a.dispatchEvent(new Event('input', { bubbles: true })); }
    else { const j = Math.max(0, Math.min(a.options.length - 1, a.selectedIndex + (up ? 1 : -1))); if (j !== a.selectedIndex) { a.selectedIndex = j; a.dispatchEvent(new Event('change', { bubbles: true })); } }
    return true;
  }
  let d = 0;
  if (horiz && (k === 'ArrowDown' || k === 'ArrowUp')) { // documents : ↑ ↓ font défiler la feuille
    let sc = inside ? a : root.firstElementChild;
    while (sc && sc !== root.parentNode && !(sc.scrollHeight > sc.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if (!sc || sc === root.parentNode) return false;
    e.preventDefault(); sc.scrollBy({ top: k === 'ArrowDown' ? 56 : -56 }); return true;
  }
  if (k === 'ArrowDown') d = 1; else if (k === 'ArrowUp') d = -1;
  else if ((k === 'ArrowRight' || k === 'ArrowLeft') && !text && t !== 'range' && t !== 'select-one') d = k === 'ArrowRight' ? 1 : -1;
  if (!d) return false;
  const list = focusables(root); if (!list.length) return false;
  e.preventDefault();
  const i = inside ? list.indexOf(a) : -1;
  const n = list[i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length];
  n.focus({ preventScroll: false });
  return true;
}
export function hoverFocus(root) {
  root.addEventListener('pointerover', (e) => { const b = e.target.closest?.('.nb-osdmenu > *'); if (b && root.contains(b) && document.activeElement !== b) b.focus({ preventScroll: true }); });
}

export function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60;
  return h ? h + ' h ' + String(m).padStart(2, '0') : (m || 1) + ' min';
}
