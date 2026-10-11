// Téléphone : poste fixe (bureau), portables, appels entrants, numéros d'urgence (police, pompiers, SAMU)
// avec dispatch réel (arrivée des secours), contacts, numéros cachés et easter eggs, appels abusifs.
import * as THREE from 'three';
import { PHONE_NUMBERS, PHONE_EASTER_LINES, normalizeNumber, formatNumber, findNumber } from '../data/phone.js';
import { Audio } from '../engine/audio.js';
import { Net } from '../net/net.js';
import { LORE } from '../data/lore.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const GERARD_LINES = {
  1: ['Allô ? Ah, c\'est toi petit. Tout se passe bien ? Les petits bruits, c\'est normal la première nuit. Le bâtiment travaille.', 'Si la boîte à musique se met à jouer, laisse-la finir. Ne me demande pas pourquoi.'],
  2: ['Les articles par terre ? C\'est le chat. Il y a un chat errant qui vit dans l\'entrepôt depuis des années. Enfin… je crois que c\'est le chat.'],
  3: ['Bobby a bougé ? Ferme la porte du poste. Il ne force jamais une porte fermée. Il tape, il attend, il repart. Et pense au miel, il adore ça.'],
  4: ['Les cassettes sans étiquette, petit… J\'en ai regardé une, une fois. Je ne dors plus vraiment depuis.'],
  5: ['Les mannequins, compte-les en arrivant. S\'il en manque un, allume le magasin. Et ne cligne pas des yeux quand tu les regardes.', 'Je t\'ai laissé une cassette. Regarde-la quand tu es seul.'],
  6: ['Des braqueurs ? Ne joue pas au héros. Le 17. Et laisse la bijouterie éclairée : ils ne viendront pas si c\'est éclairé.'],
  7: ['Ça sent le brûlé ? Disjoncteur, au sous-sol. Le tableau électrique est dans le local du milieu. Puis le 18.'],
  8: ['Ça gratte au-dessus du poste ? La trappe. Ferme la trappe. Tout de suite.'],
  9: ['Le groupe électrogène est capricieux. Tire plusieurs fois sur le démarreur. Et reste dans la lumière, quoi qu\'il arrive.'],
  10: ['… Le numéro que vous avez demandé n\'est plus attribué. … … (Une respiration.) Rends-lui ce qui lui appartient, petit.'],
};
const DIRECTOR_LINES = ['Desmarais. … Le gardien ? Il est quelle heure ? Tout va bien ? Alors pourquoi vous m\'appelez ? Faites votre travail.', 'Encore vous ? Je vous paie pour surveiller, pas pour bavarder.', 'Si vous voulez démissionner, dites-le franchement.'];
const INCOMING = {
  gerard_n1: [['Gérard', 'Allô, petit ? C\'est Gérard. Je voulais juste savoir si ça allait. Tu verras, on s\'habitue. Ah, et… ne descends pas au sous-sol après trois heures. Bonne nuit.']],
  breath: [['???', '(Une respiration lente, très proche du combiné.)'], ['???', '(On raccroche.)']],
  silence: [['???', '(Silence. Un souffle, peut-être.)']],
  child: [['Voix d\'enfant', 'Tu veux jouer avec moi ? On joue à cache-cache ? C\'est toi qui comptes.']],
  static: [['???', '(Grésillements… puis quelques notes de boîte à musique.)']],
  gerard: [['Gérard', 'C\'est Gérard. Je n\'arrive pas à dormir. Fais attention à toi cette nuit, d\'accord ? Garde les lumières allumées.']],
  director: [['M. Desmarais', 'Desmarais. Je vérifie que vous ne dormez pas. Bonne nuit.']],
  director_warn: [['M. Desmarais', '(texte)']],
  wrong: [['Vieille dame', 'Allô ? C\'est bien la boulangerie ? Je voudrais commander une galette… Ah non ? Oh, excusez-moi, jeune homme.']],
  yourself: [['Vous-même ?', 'C\'est… c\'est ta propre voix. « N\'ouvre pas la porte. Quoi qu\'il arrive, n\'ouvre pas la porte. »']],
  kevin: [['Kevin', 'Yo le gardien ! T\'as battu mon score à Glouton ou pas ? … Allô ? T\'entends ce bruit derrière toi ?']],
  police: [['Commissariat', 'Commissariat central, contrôle de routine : tout va bien au centre Hélios ? Parfait. Bonne nuit.']],
  countdown: [['Voix synthétique', 'Trois… trois… trois…']],
  lullaby: [['???', '(Quelqu\'un fredonne « Au clair de la lune », faux, très lentement.)']],
  taxi: [['Taxi', 'Votre taxi est devant l\'entrée. … Vous n\'avez pas appelé de taxi ? Pourtant quelqu\'un a appelé de ce numéro. Une petite fille.']],
  scream: [['???', '(UN HURLEMENT.)']],
  police_arrival: [['Police', 'Police nationale, nous sommes devant l\'entrée principale du centre. Déverrouillez les portes, s\'il vous plaît (bouton ENTRÉE de la console).']],
  firemen_arrival: [['Pompiers', 'Sapeurs-pompiers, nous sommes sur place, nous entrons par l\'accès de service.']],
  pizza: [['Livreur', 'Pizza Napoli ! Je suis devant l\'entrée principale, vous m\'ouvrez ?']],
};

export class Phone {
  constructor(game) {
    this.game = game; this.ringing = null; this.ringLoop = null; this.ui = null; this.callCounts = {}; this.dispatches = []; this.knownExtra = new Set();
    const S = game.sim;
    S.effect('ring', (p) => this.applyRing(p));
    S.action('call', (p, actor) => this.hostCall(p, actor));
    S.action('answer', (p, actor) => { if (this.ringingHost) { const c = this.ringingHost; this.ringingHost = null; game.sim.emit('ring', { on: false }); game.sim.emit('phoneline', { caller: c.caller, data: c.data }, { to: actor }); } });
    S.effect('phoneline', (p) => this.playIncoming(p.caller, p.data));
    game.hooks.on('discover', (k, id) => { if (k === 'number') this.knownExtra.add(id); if (k === 'lore' && LORE[id]?.text) this.scanNumbers(LORE[id].text); });
    game.hooks.on('text_read', (t) => this.scanNumbers(t));
  }
  // Les numéros lus quelque part (panneau d'affichage, post-it, e-mail…) s'ajoutent au répertoire
  scanNumbers(text) {
    const g = this.game; let added = 0;
    for (const m of String(text || '').matchAll(/\d(?:[\s.]?\d){3,9}/g)) {
      const e = findNumber(m[0]);
      if (e && !e.known && !g.discovered['number:' + e.num]) { g.discover('number', e.num); added++; }
    }
    if (added) g.toast(added > 1 ? added + ' numéros ajoutés au répertoire du téléphone.' : 'Numéro ajouté au répertoire du téléphone.', 3);
  }
  reset() { this.stopRing(); this.ringingHost = null; this.dispatches = []; if (this.ui) this.close(); }

  get deskPos() { const d = this.game.devices.kind('phone').find(x => x.zone === 'security'); return d ? d.center : this.game.world.points.securityDesk; }
  // ── sonnerie (répliquée) ──
  incoming(caller, data = {}) {
    if (!Net.isHost) return;
    if (this.ringingHost) return;
    this.ringingHost = { caller, data, t: 30 };
    this.game.sim.emit('ring', { on: true, caller });
  }
  applyRing(p) {
    const g = this.game;
    if (p.on) { this.ringing = p.caller; if (!this.ringLoop) this.ringLoop = g.loop('phone_ring', this.deskPos, { volume: 1, ref: 3, maxDist: 80 }); g.ui.alert('📞 Le téléphone du poste sonne', 'info', 8); }
    else this.stopRing();
  }
  stopRing() { this.ringing = null; if (this.ringLoop) { this.ringLoop.stop(0.1); this.ringLoop = null; } }

  // ── interface ──
  open(device) { this.openUI(device?.opts?.security ? 'desk' : 'other'); }
  openMobile() { this.openUI('mobile'); }
  openUI(kind) {
    const g = this.game;
    const wrap = el('div', 'phone-ui');
    wrap.innerHTML = `<div class="disp"></div><div class="st"></div>
      <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(d => `<button data-d="${d}">${d}</button>`).join('')}</div>
      <div class="act"><button class="call">📞 Appeler</button><button class="hang">⛔ Raccrocher</button><button class="del">⌫</button></div>
      <div class="choices"></div>
      ${kind === 'desk' ? `<div class="postit"><b>Numéros utiles</b><br>Police : 17 · Pompiers : 18 · SAMU : 15<br>Gérard : 06 47 22 19 87<br>Direction (M. Desmarais) : 01 44 87 19 87</div>` : ''}
      <div class="contacts"></div><p class="hint">Chiffres au clavier ou à la souris, Entrée pour appeler, Échap pour raccrocher.</p>`;
    this.ui = { wrap, num: '', state: 'idle', kind };
    const disp = wrap.querySelector('.disp'), st = wrap.querySelector('.st');
    this.uiRefresh = () => { disp.textContent = formatNumber(this.ui.num) || (this.ui.state === 'idle' ? '' : '…'); };
    this.setStatus = (t) => { st.textContent = t; };
    this.dialTone = g.loop('dial_tone', null, { volume: 0.25, bus: 'ui' });
    this.setStatus(this.ringing ? 'Appel entrant… (Appeler pour décrocher)' : 'Tonalité');
    wrap.querySelectorAll('[data-d]').forEach(b => b.onclick = () => this.press(b.dataset.d));
    wrap.querySelector('.call').onclick = () => this.dial();
    wrap.querySelector('.hang').onclick = () => this.close();
    wrap.querySelector('.del').onclick = () => { this.ui.num = this.ui.num.slice(0, -1); this.uiRefresh(); };
    const contacts = wrap.querySelector('.contacts');
    const known = PHONE_NUMBERS.filter(n => n.known || this.knownExtra.has(n.num) || g.discovered['number:' + n.num]);
    contacts.innerHTML = known.map(n => `<div data-n="${n.num}"><span>${esc(n.name)}</span><b>${formatNumber(n.num)}</b></div>`).join('');
    contacts.querySelectorAll('[data-n]').forEach(d => d.onclick = () => { this.ui.num = d.dataset.n; this.uiRefresh(); });
    g.sfx('phone_pickup', null, { bus: 'ui' });
    g.ui.openModal('phone', wrap, { onClose: () => this.cleanup() });
    g.input.captureHandler = (code, down, e) => {
      if (!down) return true;
      if (code === 'Escape') return false;
      if (/^Digit\d$/.test(code)) this.press(code.slice(5)); else if (/^Numpad\d$/.test(code)) this.press(code.slice(6));
      else if (code === 'Enter' || code === 'NumpadEnter') this.dial(); else if (code === 'Backspace') { this.ui.num = this.ui.num.slice(0, -1); this.uiRefresh(); }
      return true;
    };
    if (this.ringing) { this.answer(); }
  }
  press(d) { if (!this.ui || (this.ui.state !== 'idle' && this.ui.state !== 'dialing')) return; this.ui.state = 'dialing'; if (this.dialTone) { this.dialTone.stop(0.05); this.dialTone = null; } this.ui.num += d; this.uiRefresh(); try { Audio.dtmf(d); } catch (e) { /* */ } }
  close() { this.game.ui.closeModal(); }
  cleanup() {
    const g = this.game;
    if (this.dialTone) { this.dialTone.stop(0.05); this.dialTone = null; }
    if (this.tone) { this.tone.stop(0.05); this.tone = null; }
    if (this.hold) { this.hold.stop(0.3); this.hold = null; }
    clearTimeout(this._t); this._seq = null;
    g.sfx('phone_hangup', null, { bus: 'ui' });
    g.speech?.stop();
    this.ui = null;
  }
  answer() {
    const g = this.game; if (!this.ui) return;
    if (this.dialTone) { this.dialTone.stop(0.05); this.dialTone = null; }
    this.ui.state = 'connected'; this.setStatus('En ligne…');
    g.sim.do('answer', {});
  }
  playIncoming(caller, data) {
    if (!this.ui) return;
    let lines = INCOMING[caller] || INCOMING.silence;
    if (caller === 'director_warn') lines = [['M. Desmarais', data?.text || 'Faites attention.']];
    if (caller === 'scream') { this.game.ui.screamerFlash('phone', 0.5); }
    this.playLines(lines, () => this.setStatus('L\'interlocuteur a raccroché.'));
  }
  playLines(lines, done) {
    const g = this.game; let i = 0;
    const next = () => {
      if (!this.ui) return;
      if (i >= lines.length) { done?.(); return; }
      const [who, text] = lines[i++];
      g.say(who, text, { voice: !/^\(/.test(text) });
      this._t = setTimeout(next, Math.max(2500, text.length * 65 + 900));
    };
    next();
  }
  showChoices(choices) {
    const box = this.ui?.wrap.querySelector('.choices'); if (!box) return;
    box.innerHTML = '';
    for (const [label, fn] of choices) { const b = el('button', '', esc(label)); b.onclick = () => { box.innerHTML = ''; fn(); }; box.appendChild(b); }
  }

  // ── appel sortant ──
  dial() {
    const g = this.game; const u = this.ui; if (!u) return;
    if (this.ringing && u.state !== 'connected') { this.answer(); return; }
    if (u.state !== 'dialing' || !u.num) return;
    const num = normalizeNumber(u.num); u.state = 'calling'; this.setStatus('Appel en cours…');
    const entry = findNumber(num);
    if (entry) g.discover('number', num);
    this.tone = g.loop('ringback', null, { volume: 0.35, bus: 'ui' });
    const rings = entry?.kind === 'emergency' ? 1500 : entry ? 2500 + Math.random() * 3000 : 1200;
    this._t = setTimeout(() => { if (this.tone) { this.tone.stop(0.05); this.tone = null; } if (!this.ui) return; u.state = 'connected'; this.connect(num, entry); }, rings);
  }
  connect(num, entry) {
    const g = this.game;
    if (!entry) {
      if (num.length < 2) { this.setStatus('Numéro incomplet.'); return; }
      g.sfx('error', null, { bus: 'ui' }); this.setStatus('Numéro non attribué');
      this.playLines([['Message', 'Le numéro que vous avez demandé n\'est pas attribué. Veuillez consulter l\'annuaire.']]); return;
    }
    this.setStatus('En ligne : ' + entry.name);
    const count = this.callCounts[num] = (this.callCounts[num] || 0) + 1;
    switch (entry.kind) {
      case 'emergency': this.emergency(entry); return;
      case 'gerard': { const n = Math.min(10, g.night); const ls = GERARD_LINES[n]; this.playLines(ls.map(t => ['Gérard', t])); return; }
      case 'director': {
        this.playLines([['M. Desmarais', DIRECTOR_LINES[Math.min(count - 1, DIRECTOR_LINES.length - 1)]]], () => {
          if (g.mode === 'story') this.showChoices([['Rien, désolé.', () => this.playLines([['M. Desmarais', 'Alors ne me dérangez plus.']])], ['Je démissionne.', () => this.showChoices([['Oui, je démissionne vraiment.', () => { this.playLines([['M. Desmarais', 'Très bien. Rendez votre badge demain matin. Vous ne saurez jamais ce que vous avez manqué.']], () => g.sim.do('resign', {})); }], ['Non, oubliez.', () => this.playLines([['M. Desmarais', 'Je préfère ça.']])]])]]);
        }); return;
      }
      case 'employee': {
        const calls = entry.calls || [[['?', 'Allô ?']]];
        const lines = calls[Math.min(count - 1, calls.length - 1)];
        this.playLines(lines);
        if (count >= calls.length + 1) { g.story.stats.complaints = (g.story.stats.complaints || 0) + 1; if (g.story.stats.complaints === 3) g.story.stats.warn = 'Plusieurs commerçants se plaignent de vos appels nocturnes. Arrêtez ça.'; }
        return;
      }
      case 'pizza': {
        if (g.isDay) { this.playLines([['Pizzeria Napoli', 'Pizzeria Napoli, bonjour ! Une commande ? On livre jusqu\'à minuit.']]); return; }
        this.playLines([['Pizzeria Napoli', 'Pizzeria Napoli, service de nuit ! Une margherita au centre Hélios ? À cette heure-là ? Bon… vingt minutes. Ouvrez au livreur, hein.']], () => g.sim.do('call', { kind: 'pizza' }));
        return;
      }
      case 'clock': { const t = g.clockString().split(':'); const s = Math.floor(Math.random() * 60); this.playLines([['Horloge parlante', `Au quatrième top, il sera exactement ${+t[0]} heures ${+t[1]} minutes et ${s} secondes.`]]); for (let i = 0; i < 4; i++) setTimeout(() => g.sfx('beep', null, { bus: 'ui', volume: 0.5 }), 4200 + i * 1000); return; }
      case 'self': { this.tone = g.loop('busy_tone', null, { volume: 0.35, bus: 'ui' }); this.setStatus('Occupé'); return; }
      case 'mom': this.playLines(PHONE_EASTER_LINES.mom, () => { g.player.stats.stress = Math.max(0, g.player.stats.stress - 40); g.discover('egg', 'mom'); }); return;
      case 'lucie': g.player.scare(20); this.playLines(PHONE_EASTER_LINES.lucie); g.discover('egg', 'lucie_phone'); return;
      case 'bobby': this.hold = g.music('kiddie', { volume: 0.3, bus: 'ui' }); this.playLines(PHONE_EASTER_LINES.bobby, () => { if (this.hold) { this.hold.stop(1); this.hold = null; } }); g.discover('egg', 'bobby_phone'); return;
      default: { const ls = PHONE_EASTER_LINES[entry.kind] || [['???', '…']]; this.playLines(ls); g.discover('egg', 'phone_' + entry.kind); return; }
    }
  }
  emergency(entry) {
    const g = this.game; const svc = entry.service;
    const intro = { police: 'Police secours, quelle est votre urgence ?', pompiers: 'Sapeurs-pompiers, j\'écoute.', samu: 'SAMU, quelle est la situation ?', tri: 'Numéro d\'urgence européen. Quel service souhaitez-vous ?' }[svc];
    this.playLines([['Opérateur', intro]], () => {
      if (svc === 'tri') { this.showChoices([['La police', () => this.emergency({ service: 'police' })], ['Les pompiers', () => this.emergency({ service: 'pompiers' })], ['Le SAMU', () => this.emergency({ service: 'samu' })]]); return; }
      const send = (reason) => { g.sim.do('call', { kind: 'dispatch', service: svc, reason }); this.playLines([['Opérateur', svc === 'police' ? 'Une patrouille arrive au centre Hélios. Restez en sécurité et déverrouillez l\'entrée principale à leur arrivée.' : svc === 'pompiers' ? 'Les secours sont en route. Évacuez la zone et n\'utilisez pas d\'eau sur un feu électrique.' : 'Une équipe arrive. Restez auprès de la victime.']]); };
      const choices = svc === 'police' ? [['Intrusion / cambriolage en cours', () => send('intrusion')], ['Activité suspecte', () => send('suspect')], ['Il y a… quelque chose dans le centre', () => send('paranormal')], ['Rien, désolé', () => this.playLines([['Opérateur', 'Les lignes d\'urgence ne sont pas un jeu, monsieur.']], () => g.sim.do('call', { kind: 'prank' }))]]
        : svc === 'pompiers' ? [['Incendie', () => send('fire')], ['Odeur de brûlé / étincelles', () => send('smell')], ['Personne blessée', () => this.playLines([['Opérateur', 'Pour un blessé, appelez le 15.']])], ['Rien, désolé', () => this.playLines([['Opérateur', 'Raccrochez, s\'il vous plaît.']], () => g.sim.do('call', { kind: 'prank' }))]]
          : [['Je suis blessé', () => send('hurt')], ['Rien, désolé', () => this.playLines([['Opérateur', 'Bonne nuit.']], () => g.sim.do('call', { kind: 'prank' }))]];
      this.showChoices(choices);
    });
  }

  // ── hôte : traitement des appels ──
  hostCall(p, actor) {
    const g = this.game;
    if (p.kind === 'prank') { this.addPrank('appel inutile'); return; }
    if (p.kind === 'pizza') { this.schedule('pizza', 75 + Math.random() * 40, { actor }); return; }
    if (p.kind === 'dispatch') this.dispatch(p.service, { reason: p.reason, actor });
  }
  dispatch(service, info = {}) {
    const g = this.game; if (!Net.isHost) return;
    if (this.dispatches.some(d => d.service === service && !d.arrived)) return; // déjà en route
    // braquage en cours : la police arrive en priorité (gyrophares, sirène)
    const ro = g.story.outcome.robbery; const robberyLive = service === 'police' && ro && !ro.result && g.entities.robbery && g.entities.robbery.state !== 'planned';
    const eta = service === 'police' ? (robberyLive ? 60 + Math.random() * 25 : 120 + Math.random() * 40) : service === 'pompiers' ? (g.fire.active ? 75 + Math.random() * 30 : 110 + Math.random() * 40) : 150;
    // un appel pendant un braquage = signalé
    if (service === 'police') { if (ro && ro.result !== 'aborted') ro.reported = true; g.story.outcome.policeCalls++; }
    this.schedule(service, eta, info);
    g.hooks.emit('dispatch', { service, info });
  }
  schedule(service, eta, info) { const d = { service, eta, info, t: 0, arrived: false }; this.dispatches.push(d); }
  addPrank(why) { const g = this.game; g.story.stats.pranks = (g.story.stats.pranks || 0) + 1; g.story.stats.pranksTonight = (g.story.stats.pranksTonight || 0) + 1; g.sim.emit('toast', { text: 'Appel abusif enregistré (' + g.story.stats.pranks + ')' + (why ? ' : ' + why : '') + '.' }); }
  update(dt) {
    const g = this.game;
    if (Net.isHost) {
      if (this.ringingHost) { this.ringingHost.t -= dt; if (this.ringingHost.t <= 0) { this.ringingHost = null; g.sim.emit('ring', { on: false }); } }
      for (const d of this.dispatches) {
        if (d.arrived) continue; d.t += dt;
        if (d.t >= d.eta) { d.arrived = true; this.arrive(d); }
      }
    }
  }
  arrive(d) {
    const g = this.game;
    if (d.service === 'pizza') { g.entities.spawnVisitor('pizza'); this.incoming('pizza'); return; }
    if (d.service === 'police') { g.entities.spawnPolice(d.info); this.incoming('police_arrival'); return; }
    if (d.service === 'pompiers') {
      g.sim.emit('loopfx', { s: 'fire_truck', pos: [95, 1, 0], dur: 12 });
      if (g.fire.active) { g.fire.firemenArrive(); g.entities.spawnFiremen(); this.incoming('firemen_arrival'); }
      else { g.sim.emit('toast', { text: 'Les pompiers sont venus… et n\'ont trouvé aucun feu.' }); if (!d.info.auto || g.alarms.fireAlarmOn) this.addPrank('fausse alerte incendie'); }
      return;
    }
    if (d.service === 'samu') { const hurt = g.alivePlayers().some(p => p.stats?.health < 60); if (hurt) { for (const p of g.alivePlayers()) if (p.stats) p.stats.health = 100; g.sim.emit('toast', { text: 'Le SAMU vous soigne et repart.' }); } else { g.sim.emit('toast', { text: 'Le SAMU repart : personne n\'est blessé.' }); this.addPrank('SAMU dérangé pour rien'); } }
  }
}
