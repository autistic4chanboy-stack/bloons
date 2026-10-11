// Pages : présences, téléphone, costumes & lampes, fins, lore & fragments, écrans/VHS/jeux, easter eggs.
import {
  W, html, raw, join, rich, bullets, pageHead, icon, sp, spBlock, itemChip, shopChip, hex, visible,
  fmtInt, unavailable, ENTITY_LABELS, nightMinutes, minutesToHHMM, fmtPhone, pad2, skulls, item, nightByN,
} from '../lib.js';
import {
  ENTITIES, COSTUME_EFFECTS, EASTER_EGGS, EMERGENCY_INFO, PHONE_KIND_GROUPS, COND_VARS, NIGHT_REAL_MINUTES,
} from '../content.js';

const ENT_ICONS = { cat: 'cat', shadow: 'shadow', bobby: 'bear', mannequin: 'mannequin', crawler: 'vent', robbers: 'mask', fire: 'flame', thing: 'door' };

// ═════════════════════════ PRÉSENCES ═════════════════════════
export function entityVars() {
  const nights = (W.D.NIGHTS || []).filter(Boolean);
  const first = (key) => { const n = nights.find((x) => x.entities && x.entities[key]); return n ? n.n : null; };
  const findScript = (pred) => { for (const n of nights) for (const s of n.scripted || []) if (pred(s, n)) return { s, n }; return null; };
  const v = {
    bobbyNight: first('bobby'), mannequinNight: first('mannequin'), crawlerNight: first('crawler'),
    robNight: first('robbers'), thingNight: first('thing'),
  };
  const hunt = findScript((s) => s.fx === 'entity' && s.type === 'shadow' && s.action === 'hunt');
  v.shadowHunt = hunt ? hunt.n.n : 9;
  const rob = findScript((s) => s.fx === 'entity' && s.type === 'robbers');
  if (rob) {
    const t0 = nightMinutes(rob.s.at), w = rob.s.window || [0, 0];
    v.robWindow = `${minutesToHHMM(t0 + w[0])} et ${minutesToHHMM(t0 + w[1])}`;
    v.robNight = rob.n.n;
  }
  const sparks = []; let fire = null;
  for (const n of nights) for (const s of n.scripted || []) {
    if (s.fx === 'sparks') sparks.push(s.at);
    if (s.fx === 'fire' && !fire) fire = { at: s.at, n: n.n };
  }
  v.fireSparks = sparks.join(' et ');
  v.fireTime = fire ? fire.at : '';
  v.fireNight = fire ? fire.n : (nights.find((n) => n.special === 'fire') || {}).n;
  const thing = findScript((s) => s.fx === 'entity' && s.type === 'thing');
  v.thingTime = thing ? thing.s.at : '03:33';
  if (thing) v.thingNight = thing.n.n;
  const ep = (W.D.EPILOGUES || []).find((e) => e.id === 'cat');
  const m = ep && /cat_nights\s*>=\s*(\d+)/.exec(ep.cond || '');
  v.catNights = m ? m[1] : '7';
  return v;
}

function activityChart(key) {
  const nights = (W.D.NIGHTS || []).filter(Boolean);
  if (!nights.some((n) => n.entities && n.entities[key] != null)) return '';
  const vals = nights.map((n) => ({ n: n.n, v: (n.entities && n.entities[key]) || 0 }));
  const label = ENTITY_LABELS[key] || key;
  return html`<figure class="activity">
    <figcaption>Activité par nuit (mode histoire)</figcaption>
    <ol class="cols" aria-hidden="true">${vals.map(({ n, v }) => html`<li title="Nuit ${n} : ${Math.round(v * 100)} %"><span class="col" style="height:${Math.max(v > 0 ? 6 : 0, Math.round(v * 100))}%"></span><span class="col-n">${n}</span></li>`)}</ol>
    <div class="sr-only"><table><caption>Agressivité de ${label} par nuit</caption><tr>${vals.map(({ n }) => html`<th scope="col">Nuit ${n}</th>`)}</tr><tr>${vals.map(({ v }) => html`<td>${Math.round(v * 100)} %</td>`)}</tr></table></div>
  </figure>`;
}

function entityCostumes(entId) {
  const C = W.D.COSTUMES || {};
  const out = [];
  for (const [key, c] of Object.entries(C)) {
    for (const eff of c.effects || []) {
      const info = COSTUME_EFFECTS[eff];
      if (info && info.ent === entId) out.push(html`<li><a href="#/costumes?at=costume-${key}"><i class="sw" style="--c:${hex(c.color)}"></i>${c.name}</a> : ${info.label.charAt(0).toLowerCase() + info.label.slice(1)}.</li>`);
    }
  }
  return out;
}

function entityCard(e, vars) {
  const name = ENTITY_LABELS[e.id] || e.id;
  const first = e.id === 'cat' ? 1 : e.id === 'fire' ? vars.fireNight : vars[{ shadow: 'shadowHunt', bobby: 'bobbyNight', mannequin: 'mannequinNight', crawler: 'crawlerNight', robbers: 'robNight', thing: 'thingNight' }[e.id]];
  const firstNight = e.id === 'shadow' ? ((W.D.NIGHTS || []).filter(Boolean).find((n) => n.entities && n.entities.shadow) || {}).n : first;
  const costumes = entityCostumes(e.id);
  const body = html`
    <p class="lead">${rich(e.summary, vars)}</p>
    <div class="ent-cols">
      <div><h3>${icon('eye')}Les signes</h3>${bullets(e.signs, vars)}</div>
      <div><h3>${icon('book')}Les règles</h3>${bullets(e.rules, vars)}</div>
      <div><h3>${icon('shield')}Se protéger</h3>
        ${e.counters.length ? bullets(e.counters, vars) : ''}
        ${costumes.length ? html`<p class="small muted ent-sub">Costumes</p><ul>${costumes}</ul>` : ''}
        ${!e.counters.length && !costumes.length ? html`<p class="muted">Aucune protection connue.</p>` : ''}
      </div>
    </div>
    <div class="ent-foot">
      ${e.items && e.items.length ? html`<div><p class="small muted ent-sub">Objets liés</p><div class="chips">${e.items.map((id) => itemChip(id))}</div></div>` : ''}
      ${e.id !== 'fire' ? activityChart(e.id) : ''}
    </div>`;
  return html`<article class="card ent ent-${e.id}" id="${e.id}">
    <header class="ent-head">
      <div class="ent-icon" aria-hidden="true">${icon(ENT_ICONS[e.id] || 'eye')}</div>
      <div>
        <p class="kicker"><span>${e.spoiler ? sp(e.tag) : e.tag}</span></p>
        <h2>${e.spoiler ? sp(name, 'Présence secrète') : name}</h2>
        <p class="ent-meta">${firstNight ? html`<span>${e.spoiler ? sp(`Nuit ${firstNight}`) : html`Dès la <a href="#/histoire?at=nuit-${firstNight}">nuit ${firstNight}</a>`}</span>` : ''}<span class="ent-danger">Danger ${skulls(e.danger)}</span></p>
      </div>
    </header>
    ${e.spoiler ? spBlock(body, 'Présence de la dernière nuit') : body}
  </article>`;
}

export const entities = {
  title: 'Présences',
  render() {
    const vars = entityVars();
    return html`
      ${pageHead({ kicker: 'Bestiaire', title: 'Présences', lead: 'Ce qui rôde dans le centre Hélios la nuit, comment le repérer et comment lui survivre. Ce sont les règles du jeu : elles valent en mode histoire, en mode infini et en multijoueur.' })}
      <nav class="ent-nav" aria-label="Présences">${ENTITIES.map((e) => html`<a href="#/presences?at=${e.id}">${icon(ENT_ICONS[e.id] || 'eye')}<span>${e.spoiler ? sp(ENTITY_LABELS[e.id]) : ENTITY_LABELS[e.id]}</span></a>`)}</nav>
      <section class="section card rules-box">
        <h2>Trois réflexes</h2>
        ${bullets([
          '**La lumière protège.** L\'Ombre s\'y dissout, les mannequins s\'y figent, les braqueurs l\'évitent.',
          '**Le regard fige.** Ce qui ne bouge que sans témoin reste immobile sous vos yeux… ou sous une caméra affichée au poste.',
          '**Écoutez.** Pas, reptation, coups dans les gaines, chat qui feule, thermomètre qui chute : on entend presque toujours le danger avant de le voir.',
        ])}
      </section>
      ${ENTITIES.map((e) => entityCard(e, vars))}`;
  },
};

// ═════════════════════════ TÉLÉPHONE ═════════════════════════
const KIND_NOTES = {
  pizza: 'Commandez : un livreur se présente à l\'entrée du centre.',
  clock: 'Au quatrième top, l\'heure exacte de la nuit.',
};
function maskNum(text, num) {
  // Floute, dans un indice, toute suite de chiffres qui reproduit le numéro caché.
  const parts = String(text).split(/(\d[\d\s.]*\d)/);
  return join(parts.map((p, i) => (i % 2 && p.replace(/\D/g, '') === num ? sp(p) : p)));
}
function phoneRow(e) {
  const isEmergency = e.kind === 'emergency';
  const visibleNum = e.known;
  const isStaff = ['employee', 'pizza', 'self', 'gerard', 'director'].includes(e.kind);
  const name = visibleNum || isStaff ? e.name : sp(e.name, 'Numéro secret');
  const numHtml = html`<span class="num big">${fmtPhone(e.num)}</span>`;
  const lines = (W.D.PHONE_EASTER_LINES || {})[e.kind] || (e.kind === 'self' ? (W.D.PHONE_EASTER_LINES || {}).self_busy : null);
  const note = KIND_NOTES[e.kind];
  return html`<li class="ph ph-${e.kind}">
    <div class="ph-num">${visibleNum ? numHtml : sp(numHtml, 'Numéro')}</div>
    <div class="ph-main">
      <b class="ph-name">${name}</b>
      ${isEmergency && EMERGENCY_INFO[e.service] ? html`<p class="small">${EMERGENCY_INFO[e.service]}</p>` : ''}
      ${e.found ? html`<p class="ph-found">${icon('search')}<span>${visibleNum ? e.found : maskNum(e.found, e.num)}</span></p>` : (!visibleNum ? html`<p class="ph-found muted">${icon('search')}<span>Aucun indice : à vous de deviner…</span></p>` : '')}
      ${note ? html`<p class="small">${sp(note)}</p>` : ''}
      ${e.calls && e.calls.length ? html`<details class="ph-calls"><summary>Ce qu'on vous répond (${e.calls.length} appel${e.calls.length > 1 ? 's' : ''})</summary>${spBlock(html`<ol>${e.calls.map((c) => html`<li>${c.map(([who, t]) => html`<p><b>${who} :</b> ${t}</p>`)}</li>`)}</ol>`, 'Dialogues')}</details>` : ''}
      ${lines && lines.length ? spBlock(html`<div class="ph-lines">${lines.map(([who, t]) => html`<p><b>${who} :</b> ${t}</p>`)}</div>`, 'Réponse') : ''}
    </div>
  </li>`;
}

export const phone = {
  title: 'Téléphone',
  render() {
    const D = W.D;
    if (!D.PHONE_NUMBERS) return html`${pageHead({ kicker: 'Annuaire', title: 'Téléphone' })}${unavailable('L\'annuaire (phone.js)')}`;
    const all = D.PHONE_NUMBERS;
    const used = new Set();
    const groups = PHONE_KIND_GROUPS.map((g) => {
      const list = all.filter((e) => (g.kinds ? g.kinds.includes(e.kind) : !used.has(e)));
      list.forEach((e) => used.add(e));
      return { ...g, list };
    });
    const arrested = (D.ENDINGS || []).find((e) => e.id === 'arrested');
    const m = arrested && /pranks\s*>=\s*(\d+)/.exec(arrested.cond || '');
    const secret = all.filter((e) => !e.known).length;
    return html`
      ${pageHead({ kicker: 'Annuaire', title: 'Téléphone', lead: `Le téléphone du poste (et le portable, si vous en trouvez un) appelle n'importe quel numéro. ${all.length - secret} numéros sont notés sur le post-it ; ${secret} autres se trouvent en explorant le centre.` })}
      <section class="section grid-2">
        <div class="card">
          <h2>Comment ça marche</h2>
          ${bullets([
            'Au poste : [[key:E]] sur le téléphone fixe, puis composez. Les touches émettent les vraies tonalités DTMF.',
            'Les numéros inconnus sont **floutés** tant que les spoilers sont masqués, mais l\'**indice** pour les trouver reste visible.',
            'Les secours ([[num:police]], [[num:pompiers]], [[num:samu]], [[num:tri]]) se déplacent vraiment. Les appels abusifs finissent mal{{sp}} : à partir de ' + (m ? m[1] : '5') + ', c\'est la fin « Garde à vue »{{/sp}}.',
          ])}
        </div>
        <div class="card dialer" aria-label="Composer un numéro">
          <h2>Composer un numéro</h2>
          <div class="dial-screen" aria-live="polite"><span class="dial-num" data-dial-num>_</span><span class="dial-res" data-dial-res>Tapez un numéro pour savoir s'il existe.</span></div>
          <div class="dial-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => html`<button type="button" data-key="${k}">${k}</button>`)}</div>
          <div class="dial-actions"><button type="button" class="btn-small call" data-dial="call">${icon('phone')} Appeler</button><button type="button" class="btn-small" data-dial="back">Effacer</button></div>
        </div>
      </section>
      ${groups.filter((g) => g.list.length).map((g) => html`<section class="section"><h2>${g.title} <span class="count-badge">${g.list.length}</span></h2><ul class="ph-list">${g.list.map(phoneRow)}</ul></section>`)}`;
  },
  mount(el) {
    const numEl = el.querySelector('[data-dial-num]');
    const resEl = el.querySelector('[data-dial-res]');
    if (!numEl) return;
    let digits = '';
    let ac = null;
    const tone = (k) => {
      const F = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], '*': [941, 1209], 0: [941, 1336], '#': [941, 1477] }[k];
      if (!F) return;
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        const g = ac.createGain(); g.gain.value = 0.05; g.connect(ac.destination);
        const t = ac.currentTime;
        g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        for (const fq of F) { const o = ac.createOscillator(); o.frequency.value = fq; o.connect(g); o.start(t); o.stop(t + 0.17); }
      } catch { /* audio indisponible */ }
    };
    const show = () => { numEl.textContent = digits ? fmtPhone(digits) : '_'; };
    const press = (k) => { if (digits.length >= 14) return; digits += k; tone(k); show(); resEl.textContent = ''; };
    const call = () => {
      const n = digits.replace(/\D/g, '');
      if (!n) return;
      const e = W.D.findNumber ? W.D.findNumber(n) : (W.D.PHONE_NUMBERS || []).find((x) => x.num === n);
      if (!e) { resEl.innerHTML = 'Le numéro que vous avez demandé n\'est pas attribué.'; return; }
      if (e.known || W.spoilers) {
        resEl.innerHTML = html`<b>${e.name}</b>${e.found ? html` <span class="muted">— ${e.found}</span>` : ''}`.s;
      } else {
        resEl.innerHTML = html`Ça sonne ! Ce numéro existe : ${sp(e.name, 'Qui répond')}`.s;
        if (W.onContent) W.onContent(resEl);
      }
    };
    el.querySelectorAll('[data-key]').forEach((b) => b.addEventListener('click', () => press(b.dataset.key)));
    el.querySelector('[data-dial="call"]').addEventListener('click', call);
    el.querySelector('[data-dial="back"]').addEventListener('click', () => { digits = digits.slice(0, -1); show(); resEl.textContent = ''; });
    const dialer = el.querySelector('.dialer');
    dialer.addEventListener('keydown', (ev) => {
      if (/^[0-9*#]$/.test(ev.key)) { press(ev.key); ev.preventDefault(); }
      else if (ev.key === 'Backspace') { digits = digits.slice(0, -1); show(); ev.preventDefault(); }
      else if (ev.key === 'Enter' && ev.target.tagName !== 'BUTTON') { call(); ev.preventDefault(); }
    });
  },
};

// ═════════════════════════ COSTUMES & LAMPES ═════════════════════════
function figure(key, c) {
  const body = hex(c.color), acc = hex(c.color2), skin = '#e8c7a8';
  const extra = {
    bear: `<circle cx="22" cy="12" r="5" fill="${body}"/><circle cx="42" cy="12" r="5" fill="${body}"/>`,
    cat: `<path d="M21 17 l3 -10 l5 7z M43 17 l-3 -10 l-5 7z" fill="${body}"/>`,
    police: `<rect x="20" y="9" width="24" height="6" rx="2" fill="${acc}"/><rect x="18" y="14" width="28" height="2.4" fill="${body}"/>`,
    firefighter: `<path d="M19 16 q13 -14 26 0z" fill="${acc}"/><rect x="18" y="44" width="28" height="3" fill="${acc}"/><rect x="18" y="56" width="28" height="3" fill="${acc}"/>`,
    clown: `<circle cx="20" cy="16" r="6" fill="${acc}"/><circle cx="44" cy="16" r="6" fill="${acc}"/><circle cx="32" cy="22" r="2.2" fill="#ff1744"/>`,
    astronaut: `<circle cx="32" cy="20" r="11" fill="none" stroke="${acc}" stroke-width="2.2"/><rect x="25" y="16" width="14" height="7" rx="3" fill="#1b2a3a" opacity=".8"/>`,
  }[key] || '';
  if (key === 'ghost') {
    return raw(`<svg class="fig" viewBox="0 0 64 96" aria-hidden="true"><path d="M14 92 V30 a18 18 0 0 1 36 0 V92 l-6 -6 l-6 6 l-6 -6 l-6 6 l-6 -6z" fill="${body}" stroke="${acc}"/><ellipse cx="26" cy="30" rx="3" ry="4" fill="#111"/><ellipse cx="38" cy="30" rx="3" ry="4" fill="#111"/></svg>`);
  }
  const head = key === 'mannequin' ? body : key === 'bear' || key === 'cat' ? body : skin;
  return raw(`<svg class="fig" viewBox="0 0 64 96" aria-hidden="true">
    <rect x="18" y="30" width="28" height="36" rx="6" fill="${body}"/>
    <rect x="9" y="32" width="9" height="28" rx="4.5" fill="${body}"/><rect x="46" y="32" width="9" height="28" rx="4.5" fill="${body}"/>
    <rect x="20" y="64" width="10" height="28" rx="4" fill="${acc}"/><rect x="34" y="64" width="10" height="28" rx="4" fill="${acc}"/>
    <circle cx="32" cy="20" r="10" fill="${head}"/>
    ${key === 'guard' ? `<rect x="35" y="36" width="7" height="5" rx="1" fill="#ffd54f"/>` : ''}
    ${extra}
  </svg>`);
}

const fmtSec = (s) => `${Math.floor(s / 60)} min${s % 60 ? ' ' + pad2(Math.round(s % 60)) + ' s' : ''}`;

export const costumes = {
  title: 'Costumes & lampes',
  render() {
    const D = W.D;
    if (!D.COSTUMES) return html`${pageHead({ kicker: 'Équipement', title: 'Costumes & lampes' })}${unavailable('Le module des costumes (costumes.js)')}`;
    const costumeItems = W.idx.costumeItems || new Map();
    const lampItems = W.idx.lampItems || new Map();
    const L = Object.entries(D.FLASHLIGHTS || {}).filter(([k]) => k !== 'none');
    const maxI = Math.max(1, ...L.map(([, l]) => l.intensity));
    const maxR = Math.max(1, ...L.map(([, l]) => l.range));
    const secs = L.map(([, l]) => (l.drain ? 1 / l.drain : 0));
    const maxS = Math.max(1, ...secs);
    const nightSec = NIGHT_REAL_MINUTES * 60;
    const bar = (v, m, txt) => html`<span class="meter" title="${txt}"><span class="m-track"><span class="m-fill" style="width:${Math.max(2, Math.min(100, (v / m) * 100)).toFixed(1)}%"></span></span><span class="m-val">${txt}</span></span>`;
    return html`
      ${pageHead({ kicker: 'Équipement', title: 'Costumes & lampes', lead: 'Au magasin Mille Masques, certains costumes changent la façon dont les présences vous perçoivent. Et sans lampe, pas de ronde.' })}
      <section class="section">
        <h2>Costumes</h2>
        <div class="costume-grid">${Object.entries(D.COSTUMES).map(([key, c]) => {
          const its = costumeItems.get(key) || [];
          const sellers = [...new Set(its.flatMap((id) => (W.idx.itemShops.get(id) || []).map((x) => x.shop.id)))];
          return html`<article class="card costume" id="costume-${key}" style="--c:${hex(visible(c.color))}">
            <div class="costume-fig">${figure(key, c)}</div>
            <div class="costume-body">
              <h3>${c.name}</h3>
              <p>${c.desc}</p>
              ${(c.effects || []).length ? html`<ul class="eff-list">${c.effects.map((ef) => { const info = COSTUME_EFFECTS[ef]; return html`<li>${info && info.ent ? html`<a href="#/presences?at=${info.ent}">${info.label}</a>` : (info ? info.label : ef)}</li>`; })}</ul>` : html`<p class="small muted">Aucun effet particulier.</p>`}
              ${key === 'guard' ? html`<p class="small muted">Votre tenue de départ.</p>` : its.length ? html`<p class="small costume-src">${join(its.map((id) => itemChip(id)), ' ')}</p>${sellers.length ? html`<p class="small costume-src"><span class="muted">En vente :</span> ${join(sellers.map((s) => shopChip(s)), ' ')}</p>` : ''}` : ''}
            </div>
          </article>`;
        })}</div>
      </section>
      ${L.length ? html`<section class="section">
        <h2>Lampes</h2>
        <p class="muted">${rich(`Autonomie = durée d'un jeu de piles allumé en continu ([[key:R]] pour recharger). Une nuit dure ${NIGHT_REAL_MINUTES} minutes réelles.`)}</p>
        <div class="table-wrap"><table class="table lamps stack">
          <thead><tr><th scope="col">Lampe</th><th scope="col">Puissance</th><th scope="col">Ouverture</th><th scope="col">Portée</th><th scope="col">Autonomie</th><th scope="col">Particularités</th></tr></thead>
          <tbody>${L.map(([k, l], i) => {
            const s = secs[i];
            const deg = l.point ? '360°' : `${Math.round((l.angle * 2 * 180) / Math.PI)}°`;
            const feats = [l.uv && 'révèle l\'encre invisible', l.head && 'mains libres', l.flicker && 'clignote', l.point && 'flamme : éclaire tout autour'].filter(Boolean);
            const its = lampItems.get(k) || [];
            return html`<tr id="lampe-${k}">
              <th scope="row"><span class="lamp-name"><i class="beam" style="--c:${hex(l.color)}"></i>${l.name}</span>${its.length ? html`<span class="lamp-items">${join(its.map((id) => itemChip(id)), ' ')}</span>` : ''}</th>
              <td data-label="Puissance">${bar(l.intensity, maxI, String(l.intensity))}</td>
              <td data-label="Ouverture">${deg}</td>
              <td data-label="Portée">${bar(l.range, maxR, `${l.range} m`)}</td>
              <td data-label="Autonomie">${s ? bar(s, maxS, fmtSec(s)) : html`<span class="m-val">illimitée</span>`}${s ? html`<span class="small muted lamp-nights">≈ ${(nightSec / s).toFixed(1).replace('.', ',')} jeux de piles par nuit</span>` : ''}</td>
              <td data-label="Particularités">${feats.length ? feats.join(', ') : html`<span class="muted">—</span>`}</td>
            </tr>`;
          })}</tbody>
        </table></div>
      </section>` : ''}`;
  },
};

// ═════════════════════════ FINS ═════════════════════════
const NEG = { ritual: 'sans accomplir le rituel', resigned: 'sans démissionner' };
export function condFR(cond) {
  if (!cond) return '';
  return cond.split('&&').map((part) => {
    part = part.trim();
    let m;
    if ((m = /^!(\w+)$/.exec(part))) return NEG[m[1]] || `pas : ${COND_VARS[m[1]] || m[1]}`;
    if ((m = /^(\w+)\s*(>=|<=|==|>|<)\s*(\d+)$/.exec(part))) {
      const op = { '>=': '≥', '<=': '≤', '==': '=', '>': '>', '<': '<' }[m[2]];
      return `${COND_VARS[m[1]] || m[1]} ${op} ${fmtInt(m[3])}`;
    }
    if ((m = /^(\w+)$/.exec(part))) return COND_VARS[m[1]] || m[1];
    return part;
  }).join(' et ');
}
function endingCard(e, i, kind) {
  return html`<article class="card ending ${e.early ? 'early' : ''}" id="fin-${e.id}">
    <header><span class="end-n">${kind === 'epi' ? 'É' : pad2(i + 1)}</span><h3>${e.name}</h3>${e.early ? html`<span class="badge">fin anticipée</span>` : ''}</header>
    ${spBlock(html`<p>${e.desc}</p><p class="cond"><span class="muted small">Condition :</span> ${condFR(e.cond)} <code>${e.cond}</code></p>`, 'Fin')}
  </article>`;
}
export const endings = {
  title: 'Fins',
  render() {
    const E = W.D.ENDINGS, P = W.D.EPILOGUES || [];
    if (!E) return html`${pageHead({ kicker: 'Dénouements', title: 'Fins' })}${unavailable('Le module de l\'histoire (story.js)')}`;
    return html`
      ${pageHead({ kicker: 'Dénouements', title: 'Fins & épilogues', lead: `${E.length} fins et ${P.length} épilogues secrets. Les noms sont visibles ; les descriptions et les conditions sont des spoilers.` })}
      <section class="section card">
        <h2>Comment la fin est choisie</h2>
        ${bullets([
          'Les fins sont évaluées **dans l\'ordre** ci-dessous : la première dont la condition est remplie l\'emporte.',
          'Les **fins anticipées** peuvent tomber après n\'importe quelle nuit, sans attendre la dixième.',
          'Un **épilogue secret** peut s\'ajouter à n\'importe quelle fin.',
        ])}
      </section>
      <section class="section"><h2>Fins</h2><div class="end-grid">${E.map((e, i) => endingCard(e, i, 'end'))}</div></section>
      ${P.length ? html`<section class="section"><h2>Épilogues secrets</h2><div class="end-grid">${P.map((e, i) => endingCard(e, i, 'epi'))}</div></section>` : ''}`;
  },
};

// ═════════════════════════ LORE & FRAGMENTS ═════════════════════════
export const lore = {
  title: 'Lore & fragments',
  render() {
    const D = W.D;
    if (!D.LORE) return html`${pageHead({ kicker: 'Archives', title: 'Lore & fragments' })}${unavailable('Le module du lore (lore.js)')}`;
    const loreItems = W.idx.loreItems || new Map();
    const readable = Object.values(D.ITEMS || {}).filter((it) => it.p && it.p.text).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const notes = D.GERARD_NOTES || {};
    const frag = D.FRAGMENTS || [];
    const fragItem = (id) => (item(id) ? id : ((loreItems.get(id) || [])[0] || null));
    return html`
      ${pageHead({ kicker: 'Archives', title: 'Lore & fragments', lead: 'Livres, journaux, notes et cassettes racontent l\'histoire du centre Hélios depuis son inauguration. Les titres sont visibles ; les textes sont floutés tant que les spoilers sont masqués.' })}
      ${frag.length ? html`<section class="section">
        <h2>Les ${frag.length} fragments de vérité</h2>
        <p class="muted">Cinq pièces du puzzle sont dispersées dans le centre. Leur nom et l'endroit où les trouver sont des spoilers.</p>
        <ol class="frag-grid">${frag.map((f, i) => { const it = fragItem(f.id); return html`<li class="card frag"><span class="frag-n">${pad2(i + 1)}</span>${spBlock(html`<b>${f.name}</b><p class="small">${f.how}</p>${it ? html`<div>${itemChip(it)}</div>` : ''}`, 'Fragment')}</li>`; })}</ol>
      </section>` : ''}
      <section class="section">
        <h2>Textes à lire</h2>
        <div class="lore-list">${Object.entries(D.LORE).map(([key, l]) => {
          const its = loreItems.get(key) || [];
          const shopsOf = [...new Set(its.flatMap((id) => (W.idx.itemShops.get(id) || []).map((x) => x.shop.id)))];
          const isNote = key === 'gerard_note';
          return html`<article class="card lore-entry" id="lore-${key}">
            <h3>${l.title}</h3>
            <p class="small muted lore-src">${its.length ? html`Se lit sur : ${join(its.map((id) => itemChip(id)), ' ')}` : ''}${shopsOf.length ? html` · ${join(shopsOf.map((s) => shopChip(s)), ' ')}` : ''}</p>
            ${isNote ? html`<p><a href="#/lore?at=notes">Les notes de Gérard, nuit par nuit ↓</a></p>` : spBlock(html`<p class="prewrap">${l.text}</p>`, 'Texte')}
          </article>`;
        })}</div>
      </section>
      ${readable.length ? html`<section class="section">
        <h2>Inscriptions & petits textes</h2>
        <div class="lore-list compact">${readable.map((it) => html`<article class="card lore-entry"><h3>${itemChip(it.id)}</h3>${spBlock(html`<p class="prewrap">${it.p.text}</p>`, 'Texte')}</article>`)}</div>
      </section>` : ''}
      ${Object.keys(notes).length ? html`<section class="section" id="notes">
        <h2>Les notes de Gérard</h2>
        <p class="muted">Une note par nuit, laissée sur le bureau du poste.</p>
        <ol class="notes">${Object.entries(notes).map(([n, t]) => html`<li class="card"><h3>Nuit ${n}${nightByN(n) ? html` — ${nightByN(n).subtitle}` : ''}</h3>${spBlock(html`<blockquote class="note-gerard"><p>${t}</p></blockquote>`, 'Note de Gérard')}</li>`)}</ol>
      </section>` : ''}`;
  },
};

// ═════════════════════════ ÉCRANS, VHS & JEUX ═════════════════════════
function toList(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.map((v, i) => (typeof v === 'string' ? { id: v } : v && typeof v === 'object' ? v : { id: String(i), title: String(v) }));
  if (typeof x === 'object') return Object.entries(x).map(([k, v]) => (v && typeof v === 'object' ? { id: k, ...v } : { id: k, title: String(v) }));
  return [];
}
const title = (o) => o.title || o.name || o.label || o.kind || o.id;
const descOf = (o) => o.desc || o.description || o.text || o.summary || '';
const STORY_TAPES = new Set(['security_1987', 'gerard', 'no_label']);
const isSecret = (o) => !!(o.secret || o.spoiler || o.story || o.clue || o.lore || o.hidden);
const fmtKeys = (k) => (Array.isArray(k) ? k.join(', ') : typeof k === 'object' && k ? Object.entries(k).map(([a, b]) => `${a} : ${b}`).join(' · ') : String(k));

export const screensPage = {
  title: 'Écrans, VHS & jeux',
  render() {
    const S = W.screens;
    if (!S) return html`${pageHead({ kicker: 'Écrans', title: 'Écrans, VHS & jeux' })}<div class="notice">${icon('alert')}<div>Cette section n'est pas encore disponible : le module des écrans du jeu n'a pas pu être chargé.</div></div>`;
    const channels = toList(S.CHANNELS), tapes = toList(S.VHS_TAPES), games = toList(S.GAMES), screensL = toList(S.SCREEN_LIST);
    const gameItems = W.idx.gameItems || new Map();
    const fragIds = new Set((W.D.FRAGMENTS || []).map((f) => f.id));
    return html`
      ${pageHead({ kicker: 'Écrans', title: 'Écrans, VHS & jeux', lead: 'Tout ce qui s\'affiche sur les téléviseurs, les bornes et les ordinateurs du centre : chaînes, cassettes vidéo, jeux.' })}
      ${channels.length ? html`<section class="section"><h2>Chaînes de télévision <span class="count-badge">${channels.length}</span></h2>
        <p class="muted small">${rich('Allumez un téléviseur ([[key:E]]) et zappez ([[key:R]]).')}</p>
        <div class="screen-grid">${channels.map((c) => html`<article class="card scr" id="ch-${c.id}"><div class="scr-tv" aria-hidden="true"><span>${title(c)}</span></div><h3>${title(c)}</h3>${descOf(c) ? html`<p>${descOf(c)}</p>` : ''}</article>`)}</div></section>` : ''}
      ${tapes.length ? html`<section class="section"><h2>Cassettes VHS <span class="count-badge">${tapes.length}</span></h2>
        <p class="muted small">${rich('À regarder dans un magnétoscope ([[item:vcr]]). Certaines sont des indices de l\'histoire : leur contenu est un spoiler.')}</p>
        <div class="screen-grid">${tapes.map((t) => {
          const iid = 'vhs_' + t.id;
          const secret = isSecret(t) || STORY_TAPES.has(t.id) || fragIds.has(iid);
          const d = descOf(t);
          return html`<article class="card scr vhs" id="vhs-${t.id}"><h3>${title(t)}</h3>${item(iid) ? html`<div>${itemChip(iid)}</div>` : ''}${d ? (secret ? spBlock(html`<p>${d}</p>`, 'Contenu de la cassette') : html`<p>${d}</p>`) : ''}${t.duration ? html`<p class="small muted">Durée : ${t.duration} s</p>` : ''}</article>`;
        })}</div></section>` : ''}
      ${games.length ? html`<section class="section"><h2>Jeux <span class="count-badge">${games.length}</span></h2>
        <p class="muted small">Jouables sur les consoles de démo de Pixel Planet, la PocketBoy ou les bornes de la Galaxy Arcade.</p>
        <div class="screen-grid">${games.map((g) => {
          const its = gameItems.get(g.id) || [];
          const keys = g.controls || g.keys || g.help;
          return html`<article class="card scr game" id="jeu-${g.id}"><h3>${title(g)}</h3>${descOf(g) ? html`<p>${descOf(g)}</p>` : ''}${keys ? html`<p class="small"><b>Commandes :</b> ${fmtKeys(keys)}</p>` : ''}${g.secret && typeof g.secret === 'string' ? html`<p class="small">${sp(g.secret)}</p>` : ''}${its.length ? html`<div class="chips">${its.map((id) => itemChip(id))}</div>` : ''}</article>`;
        })}</div></section>` : ''}
      ${screensL.length ? html`<section class="section"><h2>Tous les écrans <span class="count-badge">${screensL.length}</span></h2>
        <ul class="chips screen-kinds">${screensL.map((s) => html`<li class="chip" title="${s.kind || s.id}">${title(s)}</li>`)}</ul></section>` : ''}`;
  },
};

// ═════════════════════════ EASTER EGGS ═════════════════════════
export const eggs = {
  title: 'Easter eggs',
  render() {
    const D = W.D;
    const specials = (D.PHONE_NUMBERS || []).filter((e) => ['devil', 'minitel', 'taxi', '333', 'factory', 'lucie'].includes(e.kind));
    return html`
      ${pageHead({ kicker: 'Secrets', title: 'Easter eggs', lead: 'Les petits secrets cachés dans le centre Hélios. Tout est flouté : l\'indice de lieu vous suffit peut-être pour les chercher vous-même.' })}
      <ol class="egg-grid">${EASTER_EGGS.map((e, i) => html`<li class="card egg">
        <p class="egg-head"><span class="egg-n">Secret n°${pad2(i + 1)}</span><span class="egg-hint">${icon('pin')}${e.hint}</span></p>
        ${spBlock(html`<h3>${e.title}</h3><p>${rich(e.text(D))}</p>`, 'Easter egg')}
      </li>`)}</ol>
      ${specials.length ? html`<section class="section card"><h2>Et aussi…</h2><p>${rich(`Une poignée de numéros de téléphone ne mènent à aucun employé… mais quelqu'un (ou quelque chose) décroche. ${specials.length} d'entre eux sont listés, floutés, dans la page [[page:telephone|Téléphone]].`)}</p></section>` : ''}`;
  },
};
