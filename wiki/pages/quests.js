// Page « Objectifs de nuit » : mini-quêtes scriptées du mode histoire (js/data/quests.js), bornes de ronde, suivi à
// l'écran et journal (J), rapport de l'aube, multijoueur et ronde du mode infini. Les consignes de Gérard restent
// visibles ; les objectifs qui surviennent avec les événements (et les facultatifs sans donneur) sont sous spoiler.
import { W, html, join, rich, bullets, paras, pageHead, spBlock, unavailable, pad2, shopChip, areaChip, itemChip } from '../lib.js';

export const isSpoilerQuest = (q) => !q.giver;

// zone d'une borne → zone du wiki (pastille)
const CP_AREA = {
  security: 'security', vestiaire: 'security', gallery0_w: 'gallery0', gallery0_e: 'gallery0', entrance: 'entrance', service_n0: 'service',
  service_s0: 'service', gallery1_w: 'gallery1', gallery1_e: 'gallery1', garage: 'garage', westwingB: 'basement', generator: 'basement',
  electrical: 'basement', pa: 'basement', roof: 'roof', warehouse: 'warehouse',
};
const KIND = { goto: 'Aller', ronde: 'Ronde', state: 'Agir', flag: 'Agir', items: 'Objet', cctv: 'Caméras', call: 'Appel', answer: 'Téléphone', wait: 'Tenir', signal: 'Micro', choice: 'Choix' };

function rewardText(rw) {
  const a = [];
  if (rw.coins) a.push(html`${rw.coins} pièce${rw.coins > 1 ? 's' : ''} de 2 €`);
  for (const id of rw.items || []) a.push(itemChip(id));
  if (rw.note) a.push(html`une note de Gérard`);
  if (rw.bonus) a.push(html`une prime de ${rw.bonus} €`);
  return join(a, ', ');
}
function startText(q, list) {
  const s = q.start || {};
  const name = (ref) => {
    const [qid, sid] = String(ref).split('.'); const qq = list.find((x) => x.id === qid); if (!qq) return ref;
    const st = sid ? qq.steps.find((x) => x.id === sid) : null; return st ? st.title : qq.title;
  };
  if (s.test === 'robbery_arriving') return 'seulement si les braqueurs passent à l\'action';
  if (s.test === 'fire_started') return 'seulement si un incendie se déclare';
  const a = [];
  if (s.at) a.push(s.at === '22:00' ? 'dès la prise de poste' : 'à ' + s.at);
  if (s.after) a.push(`après « ${name(s.after)} »${s.delay ? ` (+${s.delay} min)` : ''}`);
  if (s.on) a.push('quand l\'événement se produit');
  if (s.fallback) a.push('au plus tard à ' + s.fallback);
  return a.join(', ') || 'dès la prise de poste';
}
function stepHtml(st, q) {
  const cps = W.D.CHECKPOINTS || {};
  let route = '';
  if (st.kind === 'ronde' && st.points) route = join(st.points.map((id) => cps[id]?.name || id), st.ordered ? ' → ' : ' · ');
  if (st.kind === 'choice' && st.branches) route = join(st.branches.map((b) => b.label), ' — ou — ');
  const when = st.kind === 'wait' ? 'jusqu\'à ' + st.until : st.until ? 'avant ' + st.until : '';
  return html`<li><span class="q-kind">${KIND[st.kind] || st.kind}</span><div>
    <b>${st.title}</b>${st.optional && !q.optional ? html` <span class="badge">facultatif</span>` : ''}${when ? html` <span class="q-when">${when}</span>` : ''}
    ${route ? html`<span class="q-route">${st.kind === 'ronde' && st.ordered ? 'dans l\'ordre : ' : st.kind === 'ronde' ? 'dans n\'importe quel ordre : ' : ''}${route}</span>` : ''}
    ${st.desc ? html`<p>${rich(st.desc)}</p>` : ''}${st.reward ? html`<p class="q-rw">Récompense : ${rewardText(st.reward)}</p>` : ''}</div></li>`;
}
function questHtml(q, list) {
  return html`<section class="q-quest" id="q-${q.id}">
    <h3>${q.title}${q.giver ? html` <span class="tag" style="--tc:#ffbe3b">${q.giver}</span>` : ''}${q.optional ? html` <span class="badge">facultative</span>` : ''}${q.maybe ? html` <span class="badge badge-night">selon la nuit</span>` : ''}</h3>
    <p class="small muted">Commence ${startText(q, list)}.</p>
    <ol class="q-steps">${q.steps.map((st) => stepHtml(st, q))}</ol>
    ${q.reward ? html`<p class="q-rw">Récompense : ${rewardText(q.reward)}${q.reward.text ? html` — <i>${q.reward.text}</i>` : ''}</p>` : ''}
  </section>`;
}

export const quests = {
  title: 'Objectifs de nuit',
  render() {
    const D = W.D;
    if (!D.QUESTS) return html`${pageHead({ kicker: 'Mini-quêtes', title: 'Objectifs de nuit' })}${unavailable('Le module des quêtes (quests.js)')}`;
    const nights = (D.NIGHTS || []).filter(Boolean);
    const cps = Object.entries(D.CHECKPOINTS || {});
    const used = new Map();
    for (const [n, list] of Object.entries(D.QUESTS)) for (const q of list) for (const st of q.steps) if (st.kind === 'ronde') for (const id of st.points || []) { if (!used.has(id)) used.set(id, new Set()); used.get(id).add(Number(n)); }
    const IQ = D.INFINITE_QUEST;
    return html`
      ${pageHead({ kicker: 'Mini-quêtes', title: 'Objectifs de nuit', lead: 'Chaque nuit du mode histoire vous confie de petites missions : faire sa première ronde, aller voir ce qui ne va pas au Royaume du Jouet, refermer un frigo, couper un disjoncteur avant qu\'il ne soit trop tard…' })}
      <nav class="toc" aria-label="Sur cette page"><a href="#/objectifs?at=obj-regles">Comment ça marche</a><a href="#/objectifs?at=obj-bornes">Bornes de ronde</a>${nights.map((n) => html`<a href="#/objectifs?at=obj-nuit-${n.n}">Nuit ${n.n}</a>`)}</nav>
      <section class="section grid-2" id="obj-regles">
        <div class="card">
          <h2>Comment ça marche</h2>
          ${bullets([
            'Chaque nuit a **deux à quatre quêtes** : les consignes de **Gérard** (sa note, un appel au poste) et des objectifs qui surviennent avec les événements de la nuit.',
            'Une quête est une suite d\'**étapes** : aller quelque part, pointer une ronde, agir sur un appareil du centre, trouver ou rapporter un objet, surveiller une caméra, téléphoner, tenir jusqu\'à une heure… parfois avec un **choix**.',
            'Les événements scriptés **réagissent** à ce que vous faites : le bruit au Royaume du Jouet arrive quand vous avez fini votre ronde, la boîte à musique se lance quand vous entrez dans le magasin. Si vous traînez, tout finit par arriver à l\'heure prévue.',
            'Certaines étapes ont une **échéance** (« avant 01:30 »). Passée l\'heure, l\'objectif est **manqué**, mais la nuit continue : **rien ne bloque jamais**, la garde se termine toujours à 06:00.',
            'Les quêtes **facultatives** rapportent des pièces de 2 €, des piles ou des notes de Gérard. Certains choix (arrêter la boîte à musique ou la laisser finir, regarder la cassette…) sont retenus par la suite de l\'histoire.',
            '**Recommencer une nuit** remet ses objectifs à zéro.',
          ])}
        </div>
        <div class="card">
          <h2>À l'écran</h2>
          ${bullets([
            'Le **suivi**, en haut à gauche : l\'étape en cours, sa progression (« Ronde 2/4 »), une flèche et la distance jusqu\'à la cible. Trois objectifs au plus ; les autres sont dans le journal.',
            'Un bandeau et un petit son annoncent chaque **nouvel objectif**, chaque réussite et chaque échec.',
            '[[key:J]] ouvre le **journal de garde** : quêtes révélées, étapes faites, en cours ou manquées, récompenses.',
            '[[key:H]] masque ou réaffiche le suivi (réglage conservé).',
            'Au **rapport de l\'aube** : « Objectifs : X/Y », une ligne par objectif manqué, les facultatifs réussis et vos choix.',
          ])}
          <h3>À plusieurs</h3>
          ${paras('L\'**hôte** fait avancer les objectifs pour tout le monde : n\'importe quel gardien peut pointer une borne, décrocher le téléphone ou regarder la bonne caméra. Un joueur qui rejoint en cours de nuit reçoit l\'état des objectifs.')}
          ${IQ ? html`<h3>Mode infini</h3>${paras(`Une seule quête, facultative : la **${IQ.title.toLowerCase()}**, ${IQ.points} bornes tirées au hasard (les mêmes pour tous les joueurs), à pointer dans n'importe quel ordre avant ${IQ.steps[0].until}. Récompense : deux pièces et des piles.`)}` : ''}
        </div>
      </section>

      <section class="section" id="obj-bornes">
        <h2>Les bornes de ronde</h2>
        ${paras('Petits lecteurs de badge vissés au mur, avec une étiquette jaune « RONDE 01 » à « RONDE ' + pad2(cps.length) + ' ». Face à une borne, [[key:E]] : **Pointer** (double bip quand le pointage compte). Témoin **orange clignotant** : à pointer ; **orange fixe** : fait partie de la ronde, mais pas encore (ronde dans l\'ordre) ; **vert** : pointée ; **rouge sombre** : au repos. Une ronde « dans l\'ordre » refuse un pointage dans le désordre.')}
        <div class="table-wrap"><table class="table stack">
          <thead><tr><th scope="col" class="num-col">N°</th><th scope="col">Borne</th><th scope="col">Lieu</th><th scope="col">Rondes</th></tr></thead>
          <tbody>${cps.map(([id, c], i) => html`<tr>
            <td class="num-col" data-label="N°">${pad2(i + 1)}</td>
            <th scope="row">${c.name}</th>
            <td data-label="Lieu">${c.shop ? shopChip(c.shop) : CP_AREA[c.zone] ? areaChip(CP_AREA[c.zone]) : html`<span class="muted">—</span>`}</td>
            <td data-label="Rondes">${used.has(id) ? join([...used.get(id)].sort((a, b) => a - b).map((n) => html`<a href="#/objectifs?at=obj-nuit-${n}">nuit ${n}</a>`), ', ') : html`<span class="muted">mode infini</span>`}</td>
          </tr>`)}</tbody>
        </table></div>
      </section>

      ${nights.map((N) => {
        const list = D.QUESTS[N.n] || [];
        const open = list.filter((q) => !isSpoilerQuest(q)), hidden = list.filter(isSpoilerQuest);
        return html`
        <article class="night card q-night" id="obj-nuit-${N.n}">
          <header class="night-head">
            <div class="night-num" aria-hidden="true">${pad2(N.n)}</div>
            <div><p class="night-kicker">${N.title} · ${list.length} quête${list.length > 1 ? 's' : ''} · <a href="#/histoire?at=nuit-${N.n}">la nuit en détail</a></p><h2>${N.subtitle}</h2></div>
          </header>
          ${open.map((q) => questHtml(q, list))}
          ${hidden.length ? spBlock(html`${hidden.map((q) => questHtml(q, list))}`, `Objectifs qui surviennent pendant la nuit (${hidden.length})`) : ''}
        </article>`;
      })}`;
  },
};
