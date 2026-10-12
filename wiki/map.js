// Plan schématique du centre (SVG), généré depuis SHOPS (slot, w, side, floor, color) et AREAS.
// Repère du jeu : x ouest → est, z sud → nord. Galerie : x ∈ [GALLERY_X0, GALLERY_X0 + 11 × SLOT_W],
// boutiques nord z ∈ [8, 22], sud z ∈ [-22, -8]. Plan horizontal : nord en haut. Plan vertical (mobile) :
// ouest en haut, nord à droite (le texte reste horizontal).

import { W, esc, hex, visible } from './lib.js';

const Z_N = [8, 22];
const Z_S = [-22, -8];
const CORR = 3.5;           // largeur des couloirs de service
const ATRIUM = [-24, 24];   // atrium (fontaine, escalators)
// vide central de l'étage (entre les passerelles) et pièces de l'aile administrative (repère du jeu)
const VOID_HOLES = [[-61.5, -46.5], [-43.5, -28], [-24, 24], [28, 43.5], [46.5, 61.5]];
const ADMIN_ROOMS = [
  ['Accueil', -70, 1, -66, 7], ['Réunion', -70, 7, -66, 13], ['Compta', -70, -7, -66, -1], ['Coffres', -70, -12, -66, -7], ['Archives', -70, -22, -66, -12],
  ['Informatique', -76, 1, -72, 7], ['Repro', -76, 7, -72, 13], ['RH', -76, -7, -72, -1], ['Marketing', -76, -14, -72, -7], ['Infirmerie', -76, -22, -72, -14],
];
const f = (n) => Number(n.toFixed(2));

function geom() {
  const SW = W.D.SLOT_W || 12;
  const X0 = W.D.GALLERY_X0 ?? -66;
  const shops = W.D.SHOPS || [];
  const n = Math.max(11, ...shops.map((s) => s.slot + s.w));
  return { SW, X0, X1: X0 + n * SW, n };
}

export function shopRect(s) {
  const { SW, X0 } = geom();
  const x0 = X0 + s.slot * SW;
  const [z0, z1] = s.side === 'N' ? Z_N : Z_S;
  return { x0, x1: x0 + s.w * SW, z0, z1 };
}

function wrap(label, maxChars) {
  const words = label.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
/** Nom affiché sur le plan : la partie avant « — ». */
export const mapLabel = (name) => String(name).split(' — ')[0];

/**
 * Plan d'un étage.
 * opts : vertical (orientation mobile), highlight (id de magasin), night (grise les magasins pas encore ouverts),
 *        interactive (liens vers les fiches).
 */
export function floorSVG(floor, opts = {}) {
  const { vertical = false, highlight = null, night = 99, interactive = true } = opts;
  const { X0, X1 } = geom();
  const SEC = [X0 - 12, X0];
  const HALL = [X1, X1 + 14];
  const minX = X0 - 14, maxX = X1 + 16, minZ = -28, maxZ = 28;
  const P = vertical ? (x, z) => [z, x] : (x, z) => [x, -z];
  const R = (x0, x1, z0, z1) => (vertical ? [z0, x0, z1 - z0, x1 - x0] : [x0, -z1, x1 - x0, z1 - z0]);
  const vb = vertical ? [minZ, minX, maxZ - minZ, maxX - minX] : [minX, -maxZ, maxX - minX, maxZ - minZ];
  const out = [];
  const rect = (x0, x1, z0, z1, attrs = '') => {
    const [x, y, w, h] = R(x0, x1, z0, z1);
    return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" ${attrs}/>`;
  };
  // Texte centré multi-lignes ; rot : rotation (degrés) autour du centre.
  const text = (x, z, lines, fs, cls = '', rot = 0) => {
    const [tx, ty] = P(x, z);
    const lh = fs * 1.12;
    const y0 = ty - ((lines.length - 1) * lh) / 2 + fs * 0.36;
    const spans = lines.map((l, i) => `<tspan x="${f(tx)}" y="${f(y0 + i * lh)}">${esc(l)}</tspan>`).join('');
    return `<text class="${cls}" font-size="${f(fs)}" text-anchor="middle"${rot ? ` transform="rotate(${rot} ${f(tx)} ${f(ty)})"` : ''}>${spans}</text>`;
  };
  const fitLabel = (label, boxW, boxH, fs0 = 2.1) => {
    const cw = 0.5; // largeur moyenne d'un caractère (em) d'une police condensée
    const maxChars = Math.max(4, Math.floor((boxW - 1.6) / (fs0 * cw)));
    let lines = wrap(label, maxChars);
    const longest = Math.max(...lines.map((l) => l.length));
    let fs = Math.min(fs0, (boxW - 1.6) / (longest * cw));
    while (lines.length * fs * 1.12 > boxH - 2.4 && fs > 1.1) fs -= 0.1;
    return { lines, fs };
  };

  // Bâtiment, couloirs de service, galerie
  out.push(rect(X0, X1, -22 - CORR, 22 + CORR, 'class="m-bld"'));
  out.push(rect(X0, X1, 22, 22 + CORR, 'class="m-corr"'));
  out.push(rect(X0, X1, -22 - CORR, -22, 'class="m-corr"'));
  const corrLbl = 'COULOIR DE SERVICE';
  for (const zc of [22 + CORR / 2, -22 - CORR / 2]) {
    if (vertical) {
      const [tx, ty] = P(-30, zc);
      out.push(`<text class="m-lbl-faint" font-size="1.3" text-anchor="middle" transform="rotate(90 ${f(tx)} ${f(ty)})"><tspan x="${f(tx)}" y="${f(ty + 0.45)}">${corrLbl}</tspan></text>`);
    } else {
      out.push(text(-30, zc, [corrLbl], 1.3, 'm-lbl-faint'));
      out.push(text(36, zc, [corrLbl], 1.3, 'm-lbl-faint'));
    }
  }
  out.push(rect(X0, X1, -8, 8, 'class="m-gal"'));
  out.push(rect(ATRIUM[0], ATRIUM[1], -8, 8, 'class="m-atrium"'));

  // Atrium : fontaine (RDC) ou vide sur l'atrium (étage), escalators
  const [fx, fy] = P(0, 0);
  if (floor === 0) {
    out.push(`<circle cx="${f(fx)}" cy="${f(fy)}" r="3.2" class="m-fountain"/><circle cx="${f(fx)}" cy="${f(fy)}" r="1.4" class="m-fountain-in"/>`);
    out.push(text(0, -5.2, ['Fontaine'], 1.4, 'm-lbl-soft'));
  } else {
    // vide central sur toute la longueur, coupé par les passerelles (sous la verrière)
    for (const [x0, x1] of VOID_HOLES) out.push(rect(x0, x1, -4, 4, 'class="m-void"'));
    out.push(`<circle cx="${f(fx)}" cy="${f(fy)}" r="3.2" class="m-fountain ghost"/>`);
    out.push(text(0, -2.6, ['Vide sur l\'atrium'], 1.4, 'm-lbl-soft'));
    out.push(text(-36, -2.6, ['Vide'], 1.1, 'm-lbl-faint')); out.push(text(36, -2.6, ['Vide'], 1.1, 'm-lbl-faint'));
  }
  // ascenseur panoramique (galerie ouest : parking, RDC, étage)
  out.push(rect(-55.2, -52.8, 1.5, 3.9, 'class="m-esc"'));
  out.push(text(-54, 5.4, ['Ascenseur'], 1.1, 'm-lbl-faint'));
  // deux paires d'escalators de part et d'autre de l'atrium (montée vers l'ouest et vers l'est)
  for (const [x0, x1, z0, z1] of [[-24, -15, -2.6, -0.6], [-24, -15, 0.6, 2.6], [15, 24, -2.6, -0.6], [15, 24, 0.6, 2.6]]) {
    out.push(rect(x0, x1, z0, z1, 'class="m-esc"'));
  }
  out.push(text(-19.5, 4.2, ['Escalators'], 1.2, 'm-lbl-faint'));
  out.push(text(19.5, -4.2, ['Escalators'], 1.2, 'm-lbl-faint'));
  out.push(text(X0 + 15, 0, ['GALERIE'], 1.7, 'm-lbl-gal'));
  out.push(text(X1 - 15, 0, ['GALERIE'], 1.7, 'm-lbl-gal'));

  // Poste de sécurité & hall d'entrée (RDC)
  if (floor === 0) {
    const sec = rect(SEC[0], SEC[1], -8, 8, 'class="m-sec"') + text((SEC[0] + SEC[1]) / 2, 0, ['Poste de', 'sécurité'], 1.8, 'm-lbl-sec');
    out.push(interactive ? `<a href="#/poste" class="m-room"><title>Poste de sécurité</title>${sec}</a>` : sec);
    out.push(rect(HALL[0], HALL[1], -10, 10, 'class="m-hall"'));
    out.push(text((HALL[0] + HALL[1]) / 2, 0, ['Hall', 'd\'entrée'], 1.8, 'm-lbl-room'));
    const [d1x, d1y] = P(HALL[1], -4.5), [d2x, d2y] = P(HALL[1], 4.5);
    out.push(`<line x1="${f(d1x)}" y1="${f(d1y)}" x2="${f(d2x)}" y2="${f(d2y)}" class="m-doors"/>`);
  }

  // Aile administrative (étage, au bout de la galerie ouest)
  if (floor === 1) {
    out.push(rect(-76, -66, -22, 13, 'class="m-hall"'));
    out.push(rect(-72, -70, -22, 13, 'class="m-corr"'));
    for (const [name, x0, z0, x1, z1] of ADMIN_ROOMS) {
      out.push(rect(x0 + 0.2, x1 - 0.2, z0 + 0.2, z1 - 0.2, 'class="m-sec"'));
      out.push(text((x0 + x1) / 2, (z0 + z1) / 2, wrap(name, 7), 0.75, 'm-lbl-room'));
    }
    out.push(text(-71, 15.2, ['Administration'], 1.3, 'm-lbl-soft'));
  }

  // Boutiques
  for (const s of (W.D.SHOPS || []).filter((x) => x.floor === floor)) {
    const r = shopRect(s);
    const g = 0.45;
    const [x, y, w, h] = R(r.x0 + g, r.x1 - g, r.z0 + g, r.z1 - g);
    const locked = (s.unlock || 1) > night;
    const hl = highlight === s.id;
    const { lines, fs } = fitLabel(mapLabel(s.name), w, h);
    const cls = `m-shop${locked ? ' locked' : ''}${hl ? ' hl' : ''}${highlight && !hl ? ' dim' : ''}`;
    const style = `--c:${hex(s.color)};--cv:${hex(visible(s.color))}`;
    const cx = x + w / 2, cy = y + h / 2;
    const lh = fs * 1.12;
    const ty0 = cy - ((lines.length - 1) * lh) / 2 + fs * 0.36;
    const label = `<text class="m-lbl" font-size="${f(fs)}" text-anchor="middle">${lines.map((l, i) => `<tspan x="${f(cx)}" y="${f(ty0 + i * lh)}">${esc(l)}</tspan>`).join('')}</text>`;
    const badge = `<text class="m-badge" font-size="1.45" x="${f(x + 0.9)}" y="${f(y + 2)}">N${s.unlock || 1}</text>`;
    const body = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="0.8"/>${label}${badge}`;
    const title = `${s.name} — nuit ${s.unlock || 1}`;
    out.push(interactive
      ? `<a href="#/magasins/${esc(s.id)}" class="${cls}" style="${style}" data-unlock="${s.unlock || 1}" aria-label="${esc(title)}"><title>${esc(title)}</title>${body}</a>`
      : `<g class="${cls}" style="${style}" data-unlock="${s.unlock || 1}">${body}</g>`);
  }

  // Boussole + échelle
  if (vertical) {
    const ax = maxZ - 6, ay = minX + 4;
    out.push(`<g class="m-compass"><line x1="${ax - 3}" y1="${ay}" x2="${ax + 2.4}" y2="${ay}"/><path d="M${ax + 3.6} ${ay} l-2.2 -1.3 v2.6z"/><text x="${ax + 0.2}" y="${ay - 1.6}" font-size="1.7" text-anchor="middle">N</text></g>`);
    out.push(`<g class="m-scale"><line x1="${minZ + 2}" y1="${maxX - 3}" x2="${minZ + 14}" y2="${maxX - 3}"/><text x="${minZ + 8}" y="${maxX - 4.2}" font-size="1.5" text-anchor="middle">12 m</text></g>`);
  } else {
    const ax = maxX - 5, ay = -maxZ + 6.5;
    out.push(`<g class="m-compass"><line x1="${ax}" y1="${ay + 3}" x2="${ax}" y2="${ay - 2.4}"/><path d="M${ax} ${ay - 3.6} l-1.3 2.2 h2.6z"/><text x="${ax + 2.4}" y="${ay + 0.5}" font-size="1.7">N</text></g>`);
    out.push(`<g class="m-scale"><line x1="${minX + 2}" y1="${maxZ - 2.5}" x2="${minX + 14}" y2="${maxZ - 2.5}"/><text x="${minX + 8}" y="${maxZ - 3.7}" font-size="1.5" text-anchor="middle">12 m</text></g>`);
  }

  const title = floor === 0 ? 'Plan du rez-de-chaussée' : 'Plan de l\'étage';
  return `<svg class="map-svg ${vertical ? 'is-v' : 'is-h'}" viewBox="${vb.map(f).join(' ')}" role="img" aria-label="${title}" preserveAspectRatio="xMidYMid meet">${out.join('')}</svg>`;
}

/** Les deux orientations ; le CSS affiche la bonne selon la largeur de l'écran. */
export function floorMaps(floor, opts = {}) {
  return `<div class="map-pair">${floorSVG(floor, { ...opts, vertical: false })}${floorSVG(floor, { ...opts, vertical: true })}</div>`;
}

/** Coupe schématique (non à l'échelle) : toit, étage, RDC, sous-sol, entrepôt, parking. */
export function sectionSVG() {
  const A = (id) => (W.idx.areaById && W.idx.areaById.get(id)) || null;
  const N = (id) => { const a = A(id); return a ? ` · nuit ${a.unlock}` : ''; };
  const nm = (id, fb) => { const a = A(id); return a ? a.name : fb; };
  const t = (x, y, s, cls = 'c-lbl', anchor = 'middle', fs = 3) => `<text x="${x}" y="${y}" font-size="${fs}" text-anchor="${anchor}" class="${cls}">${esc(s)}</text>`;
  const o = [];
  // sol extérieur
  o.push('<line x1="0" y1="62" x2="200" y2="62" class="c-ground"/>');
  // toit + verrière
  o.push('<rect x="26" y="12" width="160" height="2.4" class="c-slab"/>');
  o.push('<path d="M84 12 L100 3.5 L116 12" class="c-glass"/>');
  o.push('<rect x="44" y="8.4" width="7" height="3.6" class="c-box"/><rect x="54" y="8.4" width="7" height="3.6" class="c-box"/><rect x="150" y="8.4" width="7" height="3.6" class="c-box"/>');
  o.push(t(146, 6.5, nm('roof', 'Toit') + N('roof'), 'c-lbl c-dim', 'end', 2.8));
  o.push(t(100, 1.8, 'Verrière', 'c-lbl c-dim', 'middle', 2.4));
  // étage
  o.push('<rect x="42" y="14.4" width="42" height="21.6" class="c-floor"/><rect x="116" y="14.4" width="60" height="21.6" class="c-floor"/>');
  o.push('<rect x="26" y="36" width="160" height="2.4" class="c-slab"/>');
  o.push(t(63, 27, 'Étage — boutiques', 'c-lbl'));
  o.push(t(146, 27, nm('gallery1', 'Galerie — Étage') + N('gallery1'), 'c-lbl c-dim', 'middle', 2.6));
  // atrium double hauteur
  o.push('<rect x="84" y="14.4" width="32" height="47.6" class="c-atrium"/>');
  o.push('<path d="M88 61 L99 38.6" class="c-esc"/><path d="M101 38.6 L112 61" class="c-esc"/>');
  o.push(t(100, 30, 'Atrium', 'c-lbl', 'middle', 2.8));
  o.push(t(100, 57.5, 'fontaine', 'c-lbl c-dim', 'middle', 2.3));
  // RDC
  o.push('<rect x="26" y="38.4" width="16" height="23.6" class="c-sec"/>');
  o.push(t(34, 44.2, 'Poste de', 'c-lbl c-sec-t', 'middle', 2.5) + t(34, 47.4, 'sécurité', 'c-lbl c-sec-t', 'middle', 2.5));
  o.push('<rect x="42" y="38.4" width="42" height="23.6" class="c-floor"/><rect x="116" y="38.4" width="60" height="23.6" class="c-floor"/>');
  o.push(t(63, 54, 'RDC — boutiques', 'c-lbl'));
  o.push(t(146, 54, nm('gallery0', 'Galerie — Rez-de-chaussée'), 'c-lbl c-dim', 'middle', 2.6));
  o.push('<rect x="176" y="44" width="14" height="18" class="c-hall"/>');
  o.push(t(183, 51.5, 'Hall', 'c-lbl', 'middle', 2.4) + t(183, 54.6, 'd\'entrée', 'c-lbl', 'middle', 2.4));
  // conduits
  o.push('<path d="M30 41 H150" class="c-vent"/>');
  o.push(t(118, 44.6, nm('vents', 'Conduits d\'aération') + N('vents'), 'c-lbl c-vent-t', 'middle', 2.4));
  // escalier de service ouest (toit)
  o.push('<path d="M29 62 v-2.2 h2 v-2.2 h2 v-2.2 h2 v-2.2 h2" class="c-stair"/>');
  o.push('<path d="M38.5 53 V14.6" class="c-stair-up"/>');
  o.push(t(34, 61, 'escalier', 'c-lbl c-dim', 'middle', 1.7));
  // entrepôt
  o.push('<rect x="2" y="44" width="24" height="18" class="c-ware"/>');
  o.push(t(14, 51.5, nm('warehouse', 'Entrepôt'), 'c-lbl', 'middle', 2.6) + t(14, 55, N('warehouse').replace(' · ', ''), 'c-lbl c-dim', 'middle', 2.2));
  // sous-sol
  o.push('<rect x="26" y="66" width="160" height="28" class="c-base"/>');
  o.push('<line x1="98" y1="66" x2="98" y2="94" class="c-wall"/>');
  o.push(t(62, 71.5, nm('basement', 'Sous-sol technique') + N('basement'), 'c-lbl', 'middle', 2.8));
  const rooms = ['Groupe électrogène', 'Tableau électrique', 'Régie d\'annonces', 'Chaudière'];
  rooms.forEach((r, i) => {
    const x = 30 + (i % 2) * 34, y = 77 + Math.floor(i / 2) * 7;
    o.push(`<rect x="${x}" y="${y}" width="31" height="5.2" rx="0.8" class="c-room"/>`);
    o.push(t(x + 15.5, y + 3.5, r, 'c-lbl c-room-t', 'middle', 2.3));
  });
  o.push('<rect x="79" y="88.6" width="16" height="4.4" rx="0.8" class="c-room c-b13"/>');
  o.push(`<text x="87" y="91.7" font-size="2.3" text-anchor="middle" class="c-lbl c-b13-t"><tspan class="sp-off-only">???</tspan><tspan class="sp-on-only">B-13</tspan></text>`);
  o.push(t(142, 71.5, nm('garage', 'Parking souterrain') + N('garage'), 'c-lbl', 'middle', 2.8));
  for (let i = 0; i < 5; i++) o.push(`<rect x="${106 + i * 15}" y="82" width="10" height="6" rx="1.4" class="c-car"/>`);
  // rampe du parking
  o.push('<path d="M186 90 L199 62" class="c-ramp"/>');
  o.push(t(190, 89, 'rampe', 'c-lbl c-dim', 'start', 2.2));
  o.push(t(4, 60, 'OUEST', 'c-lbl c-axis', 'start', 2.2) + t(198, 60, 'EST', 'c-lbl c-axis', 'end', 2.2));
  return `<svg class="section-svg" viewBox="0 0 200 96" role="img" aria-label="Coupe schématique du centre commercial">${o.join('')}</svg>`;
}
