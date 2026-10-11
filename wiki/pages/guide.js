// Pages « guide » : accueil, contrôles, poste de sécurité, mode histoire, mode infini, multijoueur, FAQ.
import {
  W, html, raw, join, rich, paras, bullets, pageHead, icon, spBlock, itemChip, shopChip, areaChip,
  fmtInt, barList, unavailable, ENTITY_LABELS, nightMinutes, minutesToHHMM, fmtPhone, pad2, cap, shop, area,
} from '../lib.js';
import {
  NIGHT_REAL_MINUTES, CONTROLS, PITCH, QUICK_TIPS, SECURITY_SECTIONS, POWER_PARAS, POWER_STEPS, CIRCUITS, INFINITE,
  MULTIPLAYER, FAQ, ENTITIES, SOUND_FR, DEVICE_FR, CALLER_FR, WHERE_FR,
} from '../content.js';

// ───────────────────────── Durées ─────────────────────────
export function nightTiming() {
  const start = W.D.NIGHT_START || '22:00';
  const end = W.D.NIGHT_END || '06:00';
  const hours = (nightMinutes(end) - nightMinutes(start)) / 60 || 8;
  const secPerHour = Math.floor((NIGHT_REAL_MINUTES * 60) / hours);
  const hourReal = `${Math.floor(secPerHour / 60)} min ${pad2(secPerHour % 60)} s`;
  return { start, end, hours, minutes: NIGHT_REAL_MINUTES, hourReal };
}

// ───────────────────────── ACCUEIL ─────────────────────────
const BOBBY_SVG = `<svg class="hero-bobby" viewBox="0 0 100 150" aria-hidden="true"><g class="bb-body"><circle cx="30" cy="20" r="10"/><circle cx="70" cy="20" r="10"/><circle cx="50" cy="42" r="24"/><ellipse cx="50" cy="104" rx="31" ry="40"/><ellipse cx="22" cy="92" rx="9" ry="22" transform="rotate(14 22 92)"/><ellipse cx="78" cy="92" rx="9" ry="22" transform="rotate(-14 78 92)"/></g><circle class="bb-eye" cx="41" cy="39" r="2.6"/><circle class="bb-eye" cx="59" cy="39" r="2.6"/></svg>`;

export const home = {
  title: 'Accueil',
  render(ctx) {
    const D = W.D;
    const T = nightTiming();
    const nights = (D.NIGHTS || []).filter(Boolean);
    const shopsCount = D.SHOP_COUNT ?? (D.SHOPS || []).length;
    const stats = [
      [Object.keys(D.ITEMS || {}).length, 'objets', '#/objets'],
      [shopsCount, 'magasins', '#/magasins'],
      [(W.idx.catalog || []).length, 'événements', '#/evenements'],
      [nights.length, 'nuits', '#/histoire'],
      [ENTITIES.length, 'dangers', '#/presences'],
      [(D.PHONE_NUMBERS || []).length, 'numéros', '#/telephone'],
      [(D.ENDINGS || []).length + (D.EPILOGUES || []).length, 'fins & épilogues', '#/fins'],
    ].filter(([n]) => n > 0);
    const n1 = nights[0], n2 = nights[1];
    const explore = (ctx.routes || []).filter((r) => r.id && r.blurb && !r.hidden && !(r.optional === 'screens' && !W.screens));
    return html`
      <section class="hero cctv" aria-label="Présentation">
        <div class="cctv-ui" aria-hidden="true"><span class="rec">● REC</span><span>CAM 01 · HALL D'ENTRÉE</span><span class="ts" data-clock>22:00</span></div>
        <div class="hero-in">
          <p class="hero-kicker">Centre Commercial Hélios · ${T.start} → ${T.end}</p>
          <h1 class="hero-title"><span class="neon">Nuit</span> <span class="neon neon-b">Blanche</span></h1>
          <p class="hero-pitch">${rich(PITCH[0])}</p>
          <div class="hero-cta">
            <a class="btn btn-play" href="../index.html">${icon('play')}<span>Jouer</span></a>
            <a class="btn btn-ghost" href="#/multijoueur">${icon('users')}<span>Version multijoueur</span></a>
          </div>
        </div>
        ${raw(BOBBY_SVG)}
      </section>

      <section class="section">
        <p class="lead-2">${rich(PITCH[1])}</p>
        <ul class="stats">${stats.map(([n, l, href]) => html`<li><a href="${href}"><b>${fmtInt(n)}</b><span>${l}</span></a></li>`)}</ul>
      </section>

      <section class="section grid-2">
        <div class="card">
          <h2>Comment jouer</h2>
          <ol class="steps">
            <li>${rich('**En solo, en ligne** : cliquez sur **Jouer**. Le jeu tourne directement dans le navigateur (GitHub Pages), rien à installer. Un clic dans la page active le son.')}</li>
            <li>${rich('**En local** : clonez le dépôt, lancez `python3 -m http.server` à la racine, puis ouvrez http://localhost:8000.')}</li>
            <li>${rich('**À plusieurs** : la version multijoueur se lance avec un petit serveur Node.js — voir [[page:multijoueur|Multijoueur]].')}</li>
          </ol>
          <p class="small muted">${rich('Clavier + souris. [[key:Z]][[key:Q]][[key:S]][[key:D]] (ou [[key:W]][[key:A]][[key:S]][[key:D]]) pour bouger, [[key:E]] pour interagir, [[key:F]] pour la lampe : tous les raccourcis sont dans [[page:controles|Contrôles]].')}</p>
        </div>
        <div class="card">
          <h2>Une nuit à Hélios</h2>
          <ol class="timeline">
            ${n1 ? html`<li><span class="tl-time">${n1.start || '18:30'}</span><span>${rich('**Nuit 1** : vous arrivez en journée, au milieu des clients. Gérard, l\'ancien gardien, vous fait tout visiter.')}</span></li>` : ''}
            ${n2 ? html`<li><span class="tl-time">${n2.start || '21:30'}</span><span>${rich('**Nuits suivantes** : prise de poste à la fermeture, pendant que le soleil se couche.')}</span></li>` : ''}
            <li><span class="tl-time">${T.start}</span><span>${rich(`**La garde commence.** Elle dure **${T.minutes} minutes réelles** (une heure de jeu ≈ ${T.hourReal}).`)}</span></li>
            <li><span class="tl-time">${T.end}</span><span>${rich('**La relève arrive.** Une nuit ratée recommence depuis le début.')}</span></li>
          </ol>
        </div>
      </section>

      <section class="section">
        <h2>Astuces rapides</h2>
        ${bullets(QUICK_TIPS, null, 'tips')}
      </section>

      <section class="section">
        <h2>Explorer le wiki</h2>
        <ul class="explore">${explore.map((r) => html`<li><a href="#/${r.id}"><span class="ex-ch">CH ${pad2(r.ch)}</span><b>${r.title}</b><span>${r.blurb}</span></a></li>`)}</ul>
      </section>`;
  },
};

// ───────────────────────── CONTRÔLES ─────────────────────────
function keyCap(k) {
  if (typeof k === 'object' && k.az) return html`<kbd><span class="k-az">${k.az}</span><span class="k-qw">${k.qw}</span></kbd>`;
  return html`<kbd>${k}</kbd>`;
}
function keyList(row) {
  let keys = row.keys;
  if (!Array.isArray(keys)) keys = keys.azerty.map((az, i) => ({ az, qw: keys.qwerty[i] }));
  const sep = row.or ? html`<span class="k-or">ou</span>` : '';
  return join(keys.map(keyCap), sep);
}

export const controls = {
  title: 'Contrôles',
  render() {
    const mv = CONTROLS[0].rows[0].keys;
    const cap4 = (i) => keyCap({ az: mv.azerty[i], qw: mv.qwerty[i] });
    return html`
      ${pageHead({ kicker: 'Clavier & souris', title: 'Contrôles', lead: 'Le jeu se joue au clavier et à la souris. Choisissez votre disposition de clavier : les touches de déplacement s\'adaptent.' })}
      <div class="layout-switch" role="group" aria-label="Disposition du clavier">
        <button type="button" data-layout="azerty">AZERTY</button>
        <button type="button" data-layout="qwerty">QWERTY</button>
      </div>
      <section class="section grid-2 controls-top">
        <div class="card keys-visual" aria-label="Touches de déplacement">
          <div class="kv-row">${cap4(0)}</div>
          <div class="kv-row">${cap4(1)}${cap4(2)}${cap4(3)}</div>
          <div class="kv-row kv-mods"><kbd class="wide">Maj</kbd><kbd class="wide">Ctrl</kbd><kbd class="space">Espace</kbd></div>
          <p class="small muted center">Courir · s'accroupir · sauter</p>
        </div>
        <div class="card">
          <h2>Positions physiques</h2>
          ${paras([
            'Le déplacement utilise la **position physique** des touches, pas la lettre imprimée dessus : [[key:Z]][[key:Q]][[key:S]][[key:D]] sur un clavier AZERTY, c\'est exactement la même chose que [[key:W]][[key:A]][[key:S]][[key:D]] sur un clavier QWERTY. Aucun réglage à faire.',
            'Les autres raccourcis sont désignés par leur lettre. Dans les conduits d\'aération, il faut rester **accroupi** ([[key:Ctrl]] ou [[key:C]]).',
          ])}
        </div>
      </section>
      ${CONTROLS.map((g) => html`
        <section class="section">
          <h2>${g.group}</h2>
          <div class="ctl-table" role="table" aria-label="${g.group}">
            ${g.rows.map((r) => html`<div class="ctl-row" role="row"><div class="ctl-keys" role="cell">${keyList(r)}</div><div class="ctl-act" role="cell">${rich(r.action)}</div></div>`)}
          </div>
        </section>`)}`;
  },
  mount(el) {
    const root = document.documentElement;
    let layout = 'azerty';
    try { layout = localStorage.getItem('nb-wiki-layout') || 'azerty'; } catch { /* stockage indisponible */ }
    const apply = (l) => {
      layout = l;
      root.classList.toggle('layout-qwerty', l === 'qwerty');
      el.querySelectorAll('[data-layout]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === l)));
      try { localStorage.setItem('nb-wiki-layout', l); } catch { /* stockage indisponible */ }
    };
    el.querySelectorAll('[data-layout]').forEach((b) => b.addEventListener('click', () => apply(b.dataset.layout)));
    apply(layout);
  },
};

// ───────────────────────── POSTE DE SÉCURITÉ ─────────────────────────
function nightBadge(n) {
  return n ? html`<a class="badge badge-night" href="#/histoire?at=nuit-${n}" title="Disponible à partir de la nuit ${n} (mode histoire)">nuit ${n}+</a>` : '';
}

export const security = {
  title: 'Poste de sécurité',
  render() {
    const D = W.D;
    const FN = W.idx.featureNight || {};
    const nights = (D.NIGHTS || []).filter(Boolean);
    let total = 0;
    const camRows = nights.map((n) => {
      const added = (n.shops || []).map(shop).filter(Boolean);
      const cams = added.reduce((a, s) => a + (s.cams || 0), 0);
      total += cams;
      return { n: n.n, added, cams, total, camAreas: n.camAreas || [] };
    });
    const known = (D.PHONE_NUMBERS || []).filter((e) => e.known);
    const tripCircuits = new Set((W.idx.catalog || []).flatMap((e) => (e.fx || []).filter((x) => x.fx === 'power' && x.action === 'trip').map((x) => x.circuit)));
    return html`
      ${pageHead({ kicker: 'Systèmes', title: 'Le poste de sécurité', lead: 'Votre bureau, votre refuge : écrans, enregistreur, porte blindée, éclairages, alarmes, téléphone… et une machine à café. Tour complet des systèmes, puis de l\'électricité du centre.' })}
      <nav class="toc" aria-label="Sur cette page">${SECURITY_SECTIONS.map((s) => html`<a href="#/poste?at=sys-${s.id}">${s.title}</a>`)}<a href="#/poste?at=sys-power">Électricité</a></nav>
      <div class="sys-grid">
        ${SECURITY_SECTIONS.map((s) => html`
          <section class="card sys" id="sys-${s.id}">
            <h2>${s.title} ${s.feature ? nightBadge(FN[s.feature]) : ''}</h2>
            ${paras(s.paras)}
            ${s.id === 'phone' ? html`<ul class="postit">${known.map((e) => html`<li><span class="num">${fmtPhone(e.num)}</span><span>${e.name}</span></li>`)}</ul>` : ''}
          </section>`)}
      </div>

      <section class="section">
        <h2>Les caméras, nuit après nuit</h2>
        <p class="muted">${rich('Caméras des magasins ajoutées à chaque nuit du mode histoire (d\'après les magasins qui ouvrent), plus les zones filmées. Les caméras portatives viennent en plus.')}</p>
        <div class="table-wrap"><table class="table stack">
          <thead><tr><th scope="col">Nuit</th><th scope="col">Magasins ajoutés</th><th scope="col" class="num-col">Caméras</th><th scope="col">Zones filmées</th></tr></thead>
          <tbody>${camRows.map((r) => html`<tr>
            <th scope="row"><a href="#/histoire?at=nuit-${r.n}">Nuit ${r.n}</a></th>
            <td data-label="Magasins ajoutés">${r.added.length ? join(r.added.map((s) => shopChip(s.id)), ' ') : html`<span class="muted">—</span>`}</td>
            <td data-label="Caméras" class="num-col">${r.cams ? `+${r.cams}` : '—'} <span class="muted small">(total ${r.total})</span></td>
            <td data-label="Zones filmées">${r.camAreas.length ? join(r.camAreas.map((a) => areaChip(a)), ' ') : html`<span class="muted">—</span>`}</td>
          </tr>`)}</tbody>
        </table></div>
      </section>

      <section class="section" id="sys-power">
        <h2>Électricité ${nightBadge(FN.basement)}</h2>
        ${paras(POWER_PARAS)}
        ${bullets(POWER_STEPS, null, 'steps-list')}
        <h3>Les circuits du tableau électrique</h3>
        <div class="table-wrap"><table class="table stack">
          <thead><tr><th scope="col">Circuit</th><th scope="col">Ce qu'il alimente</th><th scope="col">Saute parfois ?</th></tr></thead>
          <tbody>${CIRCUITS.map((c) => html`<tr><th scope="row"><code>${c.id}</code> <span class="small">${c.name}</span></th><td data-label="Alimente">${c.desc}</td><td data-label="Saute parfois ?">${tripCircuits.has(c.id) ? html`<span class="badge">oui</span>` : html`<span class="muted">non</span>`}</td></tr>`)}</tbody>
        </table></div>
        <p class="small muted">${rich('« Saute parfois » : un événement aléatoire (catégorie Électricité, dès la [[night:7]]) peut faire sauter ce disjoncteur.')}</p>
      </section>`;
  },
};

// ───────────────────────── MODE HISTOIRE ─────────────────────────
function whereRich(w) {
  if (!w) return '';
  if (WHERE_FR[w]) return ' ' + WHERE_FR[w];
  const m = /^(shop|zone):(.+)$/.exec(w);
  const id = m ? m[2] : w;
  if (shop(id)) return ` — [[shop:${id}]]`;
  if (area(id)) return ` — [[area:${id}]]`;
  return '';
}
const durTxt = (d) => (d ? ` (${d} s)` : '');
const COND_FR = { electro_powered: ' — si le circuit ElectroMaison est encore alimenté' };

export function fxText(e) {
  const where = whereRich(e.where);
  switch (e.fx) {
    case 'sound': return cap(SOUND_FR[e.sound] || `un son (${e.sound})`) + where;
    case 'knock': return (e.item ? `Un objet tombe et roule ([[item:${e.item}]])` : `${e.n || 'Des'} articles tombent des étagères`) + where;
    case 'device': {
      let s = cap(DEVICE_FR[e.kind] || `un appareil (${e.kind}) se met en marche`);
      if (e.tape) s += ` : [[item:vhs_${e.tape}]]`;
      if (e.genre) s += ` : [[item:vinyl_${e.genre}]]`;
      return s + where + durTxt(e.dur);
    }
    case 'cat': return 'Le chat errant fait tomber quelque chose' + where;
    case 'phone': return 'Le téléphone sonne : ' + (CALLER_FR[e.caller] || 'un appel');
    case 'flicker': return 'Les lumières clignotent' + where + durTxt(e.dur);
    case 'shadow': return 'Une silhouette apparaît' + where + (e.cam ? ' (sur les caméras)' : '');
    case 'cart_roll': return 'Un caddie roule tout seul' + where;
    case 'pa': return 'Le carillon des annonces retentit' + (e.line ? ` : « ${e.line} »` : '… puis rien');
    case 'tv_message': return `Les écrans affichent « ${[].concat(e.text).join(' / ')} »` + where;
    case 'mannequin_pose': return 'Les mannequins changent de pose' + where;
    case 'police_patrol': return 'Une patrouille de police passe devant le centre';
    case 'sparks': return 'Des étincelles jaillissent' + where + (COND_FR[e.cond] || '');
    case 'fire': return 'Départ de feu' + (e.cause === 'wiring' ? ' (câblage défectueux)' : '') + where + (COND_FR[e.cond] || '');
    case 'pipe': return 'Les canalisations cognent';
    case 'weather': return ({ storm: 'L\'orage éclate', thunder: 'Coup de tonnerre', rain: 'Il se met à pleuvoir', hail: 'La grêle crépite sur la verrière' })[e.kind] || 'Changement de temps';
    case 'power':
      if (e.action === 'flicker') return 'Baisse de tension' + durTxt(e.dur);
      if (e.action === 'cut') return e.dur ? 'Coupure de courant' + durTxt(e.dur) : '**Coupure de courant générale** — jusqu\'à ce que vous rétablissiez le courant';
      if (e.action === 'trip') return `Le disjoncteur « ${e.circuit} » saute`;
      return 'Problème électrique';
    case 'entity': {
      const name = ENTITY_LABELS[e.type] || e.type;
      if (e.type === 'robbers' && e.action === 'spawn') {
        const w = e.window || [0, 0];
        const t0 = nightMinutes(e.at);
        return `**Les braqueurs arrivent** par le parking, entre ${minutesToHHMM(t0 + w[0])} et ${minutesToHHMM(t0 + w[1])}` + (e.target ? ` — cible : [[shop:${e.target}]]` : '');
      }
      if (e.type === 'mannequin' && e.count) return `**${e.count} mannequin${e.count > 1 ? 's' : ''}** ${e.count > 1 ? 's\'éveillent' : 's\'éveille'}`;
      if (e.type === 'shadow' && e.action === 'hunt') return '**L\'Ombre passe en chasse** : malheur à qui reste dans le noir';
      if (e.type === 'crawler') return '**Le Rampant** entre dans les conduits';
      if (e.type === 'thing') return '**La Chose s\'éveille**';
      return `**${name}** ${e.action === 'activate' ? 's\'active' : e.action || ''}`;
    }
    default: return `Événement « ${e.fx} »` + where;
  }
}

function levelBar(v) {
  const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
  return html`<span class="lvl" title="${pct} %"><span class="lvl-track"><span class="lvl-fill" style="width:${pct}%"></span></span><span class="lvl-v">${pct} %</span></span>`;
}

export const story = {
  title: 'Mode histoire',
  render() {
    const D = W.D;
    if (!D.NIGHTS) return html`${pageHead({ kicker: 'Mode histoire', title: 'Les dix nuits' })}${unavailable('Le module de l\'histoire (story.js)')}`;
    const T = nightTiming();
    const nights = D.NIGHTS.filter(Boolean);
    const F = D.FEATURES || {};
    const cats = D.EVENT_CATEGORIES || {};
    const notes = D.GERARD_NOTES || {};
    let camTotal = 0;
    return html`
      ${pageHead({ kicker: 'Campagne', title: 'Mode histoire', lead: `${nights.length} nuits pour découvrir le centre Hélios… et ce qu'il cache depuis son inauguration. Chaque nuit ouvre de nouveaux magasins, de nouvelles zones et de nouveaux outils.` })}
      <section class="section grid-2">
        <div class="card">
          <h2>Déroulement</h2>
          ${bullets([
            `La **nuit 1** commence en journée (${nights[0] && nights[0].start ? nights[0].start : '18:30'}) : le centre est ouvert, il y a des clients, et **Gérard**, l'ancien gardien, vous montre tout.`,
            `Les nuits suivantes commencent à la **fermeture (${nights[1] && nights[1].start ? nights[1].start : '21:30'})**, pendant que le soleil se couche.`,
            `La garde dure de **${T.start} à ${T.end}** : **${T.minutes} minutes réelles**, toujours (une heure de jeu ≈ ${T.hourReal}).`,
            'Une **nuit ratée recommence** depuis son début.',
            'Chaque soir, une **note de Gérard** vous attend sur le bureau.',
          ])}
        </div>
        <div class="card">
          <h2>Les nuits en un coup d'œil</h2>
          <ol class="night-strip">${nights.map((n) => html`<li><a href="#/histoire?at=nuit-${n.n}"><span class="ns-n">${pad2(n.n)}</span><span class="ns-t">${n.subtitle}</span></a></li>`)}</ol>
          <p class="small muted">Les présences et les événements scriptés de chaque nuit sont masqués (spoilers).</p>
        </div>
      </section>
      ${nights.map((n) => {
        const added = (n.shops || []).map(shop).filter(Boolean);
        const cams = added.reduce((a, s) => a + (s.cams || 0), 0);
        camTotal += cams;
        const ents = Object.entries(n.entities || {});
        const scripted = (n.scripted || []).slice().sort((a, b) => nightMinutes(a.at) - nightMinutes(b.at));
        const r = n.random || {};
        return html`
        <article class="night card" id="nuit-${n.n}">
          <header class="night-head">
            <div class="night-num" aria-hidden="true">${pad2(n.n)}</div>
            <div>
              <p class="night-kicker">${n.title} · prise de poste ${n.start || '21:30'}${n.day ? ' (en journée)' : ''}</p>
              <h2>${n.subtitle}</h2>
            </div>
          </header>
          ${n.news && n.news.length ? html`<div class="news" aria-label="Journal de la nuit">${n.news.map((x) => html`<p>${x}</p>`)}</div>` : ''}
          <dl class="night-facts">
            <div><dt>Magasins ouverts</dt><dd>${added.length ? join(added.map((s) => shopChip(s.id)), ' ') : html`<span class="muted">Aucun nouveau magasin${n.n === nights.length ? ' : tout le centre est déjà sous votre garde.' : '.'}</span>`}</dd></div>
            ${(n.areas || []).length ? html`<div><dt>Zones accessibles</dt><dd>${join(n.areas.map((a) => areaChip(a)), ' ')}</dd></div>` : ''}
            <div><dt>Caméras</dt><dd>${cams ? `+${cams} caméra${cams > 1 ? 's' : ''} de magasin` : 'Pas de nouvelle caméra de magasin'} <span class="muted">(total ${camTotal})</span>${(n.camAreas || []).length ? html` · zones filmées : ${join(n.camAreas.map((a) => areaChip(a)), ' ')}` : ''}</dd></div>
            ${(n.features || []).length ? html`<div><dt>Nouveautés</dt><dd><ul class="feat">${n.features.map((k) => html`<li><b>${F[k] ? F[k].name : k}</b>${F[k] ? html` — ${F[k].desc}` : ''}</li>`)}</ul></dd></div>` : ''}
            ${(n.give || []).length ? html`<div><dt>Fourni au poste</dt><dd>${join(n.give.map(([id, q]) => itemChip(id, q)), ' ')}</dd></div>` : ''}
            <div><dt>Événements aléatoires</dt><dd>~${String(r.rate || 0).replace('.', ',')} par heure de jeu · ${join((r.cats || []).map((c) => html`<span class="tag">${cats[c] || c}</span>`), ' ')} <a class="more" href="#/evenements?night=${n.n}&story=1">voir la liste →</a></dd></div>
          </dl>
          ${spBlock(html`
            <div class="night-spoil">
              ${ents.length ? html`<div><h3>Présences actives</h3><ul class="ent-levels">${ents.map(([k, v]) => html`<li><a href="#/presences?at=${k}">${ENTITY_LABELS[k] || k}</a>${levelBar(v)}</li>`)}</ul></div>` : ''}
              ${scripted.length ? html`<div><h3>Événements scriptés</h3><ol class="script">${scripted.map((s) => html`<li><time>${s.at}</time><span>${rich(fxText(s))}</span></li>`)}</ol></div>` : ''}
              ${n.special ? html`<p class="small"><b>Nuit spéciale :</b> ${({ robbery: 'braquage', fire: 'incendie', blackout: 'panne générale', finale: 'finale' })[n.special] || n.special}.</p>` : ''}
              ${notes[n.n] ? html`<blockquote class="note-gerard"><p>${notes[n.n]}</p></blockquote>` : ''}
            </div>`, 'Présences, événements scriptés et note de Gérard')}
        </article>`;
      })}`;
  },
};

// ───────────────────────── MODE INFINI ─────────────────────────
export const infinite = {
  title: 'Mode infini',
  render() {
    const cat = W.idx.catalog || [];
    const cats = W.D.EVENT_CATEGORIES || {};
    const counts = {};
    for (const e of cat) counts[e.cat] = (counts[e.cat] || 0) + 1;
    const rows = Object.keys(cats).filter((k) => counts[k]).map((k) => ({ label: cats[k], value: counts[k], href: `#/evenements?cat=${k}`, title: `${counts[k]} événements « ${cats[k]} »` }))
      .sort((a, b) => b.value - a.value);
    const vars = { events: fmtInt(cat.length) };
    return html`
      ${pageHead({ kicker: 'Survie', title: 'Mode infini', lead: 'Combien de nuits tiendrez-vous ? Tout le centre est ouvert, tous les outils sont là, et la nuit ne s\'arrête jamais vraiment.' })}
      <section class="section">${paras(INFINITE.intro, vars)}</section>
      <section class="section grid-2">
        <div class="card">
          <h2>Événements majeurs</h2>
          <p class="muted small">Tirés au hasard, mais toujours de façon cohérente avec l'état du centre.</p>
          <dl class="majors">${INFINITE.majors.map((m) => html`<div><dt>${m.title}</dt><dd>${rich(m.text)}</dd></div>`)}</dl>
        </div>
        <div class="card">
          <h2>Le catalogue par catégorie</h2>
          <p class="muted small">${fmtInt(cat.length)} événements possibles en mode infini. Cliquez sur une catégorie pour la parcourir.</p>
          ${rows.length ? barList(rows) : unavailable('Le catalogue des événements')}
        </div>
      </section>
      <section class="section">
        <h2>Conseils de survie</h2>
        ${bullets(INFINITE.tips)}
        <p>${rich('Les présences suivent les mêmes règles qu\'en mode histoire : voir [[page:presences|Présences]].')}</p>
      </section>`;
  },
};

// ───────────────────────── MULTIJOUEUR ─────────────────────────
export const multiplayer = {
  title: 'Multijoueur',
  render() {
    const M = MULTIPLAYER;
    return html`
      ${pageHead({ kicker: 'Coopération', title: 'Multijoueur', lead: 'Gardez Hélios à plusieurs : jusqu\'à quatre gardiens, un poste de sécurité partagé, et des présences qui choisissent leur cible.' })}
      <section class="section">${paras(M.intro)}</section>
      <section class="section grid-2">
        <div class="card">
          <h2>Lancer une partie</h2>
          <ol class="steps">${M.steps.map((s) => html`<li>${rich(s)}</li>`)}</ol>
        </div>
        <div class="card">
          <h2>Héberger un serveur</h2>
          ${paras(M.hosting)}
          <div class="mp-diagram" aria-label="Schéma : l'hôte et les invités se connectent au serveur">
            <div class="mp-node host">${icon('crown')}<b>Hôte</b><span>simule le monde</span></div>
            <div class="mp-link" aria-hidden="true"></div>
            <div class="mp-node server">${icon('server')}<b>Serveur Node</b><span>salons · sauvegardes</span></div>
            <div class="mp-link" aria-hidden="true"></div>
            <div class="mp-node guests">${icon('users')}<b>Invités</b><span>3 de plus par défaut</span></div>
          </div>
        </div>
      </section>
      <section class="section">
        <h2>Règles de la coopération</h2>
        ${bullets(M.rules, null, 'rules')}
      </section>`;
  },
};

// ───────────────────────── FAQ ─────────────────────────
export const faq = {
  title: 'FAQ & astuces',
  render() {
    const T = nightTiming();
    const fired = (W.D.ENDINGS || []).find((e) => e.id === 'fired');
    const m = fired && /suspicion\s*>=\s*(\d+)/.exec(fired.cond || '');
    const vars = { nightMinutes: T.minutes, hourReal: T.hourReal, suspicion: m ? m[1] : '3' };
    return html`
      ${pageHead({ kicker: 'Aide', title: 'FAQ & astuces', lead: 'Les questions qui reviennent le plus souvent, des réglages de performance aux sauvegardes.' })}
      <section class="section faq">
        ${FAQ.map((x, i) => html`<details class="card" ${i < 2 ? raw('open') : ''}><summary>${x.q}</summary>${paras(x.a, vars)}</details>`)}
      </section>`;
  },
};

