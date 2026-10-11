// Déroulement des parties : mode histoire (10 nuits, journée d'accueil la 1re nuit, déblocages, scripts,
// échecs → nuit recommencée, fins) et mode infini. L'hôte décide ; les pairs appliquent l'effet 'night'.
import * as THREE from 'three';
import { NIGHTS, ENDINGS, EPILOGUES, NIGHT_REAL_MINUTES } from '../data/story.js';
import { SHOPS, AREAS } from '../data/shops.js';
import { GERARD_NOTES, FRAGMENTS, LORE } from '../data/lore.js';
import { ITEMS } from '../data/items.js';
import { Net } from '../net/net.js';
import * as Save from './save.js';

const NIGHT_RATE = (8 * 60) / (NIGHT_REAL_MINUTES * 60); // minutes de jeu par seconde réelle (0,533)
const ALL_SHOPS = SHOPS.map(s => s.id);
const ALL_AREAS = AREAS.map(a => a.id);
const parseT = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const nightMin = (min) => { let m = min - 22 * 60; if (m < -12 * 60) m += 1440; return m; };

export class Story {
  constructor(game) {
    this.game = game;
    this.mode = 'story'; this.night = 1; this.phase = 'none';
    this.unlockedShops = new Set(); this.unlockedAreas = new Set();
    this.stats = {}; this.crowdLevel = 0; this.dayFree = false;
    this.scripted = []; this.tutorial = null; this.t = 0;
    this.outcome = {}; this.slot = 0;
    const S = game.sim;
    S.effect('night', (p) => this.applyNightEffect(p));
    S.effect('dialogue', (p) => this.applyDialogue(p));
    S.action('night_continue', (p, actor) => { if (Net.isHost) this.continueAfter(p.kind); });
    S.action('restart_night', () => { if (Net.isHost) this.restartNight('Nuit recommencée.'); });
    S.action('talk', (p, actor) => this.talkHost(p.npc, actor, p.choice));
    S.action('resign', () => { this.game.flagSet('resigned', true); this.endNight(true); });
    game.hooks.on('theft', (d) => this.onTheft(d));
    game.hooks.on('register_open', (d) => { if (d.method === 'lockpick' && d.q < 0.5) this.stats.scratches = (this.stats.scratches || 0) + 1; if (d.method === 'force') this.stats.forced = (this.stats.forced || 0) + 1; });
    game.hooks.on('register_fail', () => { this.stats.scratches = (this.stats.scratches || 0) + 1; });
    game.hooks.on('discover', (kind, id) => { if (kind === 'fragment' || (kind === 'lore' && FRAGMENTS.some(f => f.id === id))) this.fragmentFound(id); });
    game.hooks.on('vhs_play', (d) => { if (d.tape === 'security_1987' || d.tape === 'gerard') setTimeout(() => this.game.discover('fragment', 'vhs_' + d.tape), 15000); if (d.tape === 'no_label') this.game.flagSet('cursed_tape', true); });
    game.hooks.on('taken', (d) => { if (d.prop.def.use === 'jewel' && d.from === 'home' && d.prop.home?.zone?.startsWith('bijouterie')) this.onTheft({ actor: d.actor, value: d.prop.def.value || 0, shop: 'bijouterie', kind: 'jewel', reg: d.prop }); });
    game.hooks.on('door_code_ok', (door) => { if (door.o.code === '1987') this.onB13Opened(); });
  }

  // ── déblocages ──
  isShopUnlocked(id) { return this.mode === 'infinite' || this.unlockedShops.has(id); }
  isAreaUnlocked(a) { if (this.mode === 'infinite') return a !== 'b13' || true; if (this.phase === 'day') return ['security', 'gallery0', 'entrance', 'gallery1', 'service'].includes(a) || this.unlockedAreas.has(a); return this.unlockedAreas.has(a); }
  computeUnlocks(n) {
    this.unlockedShops = new Set(); this.unlockedAreas = new Set();
    if (this.mode === 'infinite') { ALL_SHOPS.forEach(s => this.unlockedShops.add(s)); ALL_AREAS.forEach(a => this.unlockedAreas.add(a)); return; }
    for (let i = 1; i <= n; i++) { const N = NIGHTS[i]; (N.shops || []).forEach(s => this.unlockedShops.add(s)); (N.areas || []).forEach(a => this.unlockedAreas.add(a)); }
    if (n >= 10) { ALL_SHOPS.forEach(s => this.unlockedShops.add(s)); ALL_AREAS.forEach(a => this.unlockedAreas.add(a)); }
    if (this.unlockedAreas.has('gallery1')) { this.unlockedShops.add('staff'); this.unlockedShops.add('toilettes'); }
    this.unlockedAreas.add('b13');
  }
  features(n) { const f = new Set(); if (this.mode === 'infinite') return new Set(['flashlight', 'phone', 'cameras', 'recorder', 'sensors', 'door', 'lights', 'lockpick', 'rc', 'padlocks', 'alarms', 'basement', 'pa', 'hatch', 'portable_cams', 'costumes', 'roof']); for (let i = 1; i <= n; i++) (NIGHTS[i].features || []).forEach(x => f.add(x)); return f; }
  camerasUnlocked() {
    const out = []; const W = this.game.world;
    for (const c of W.cameras) { if (c.shop ? this.isShopUnlocked(c.shop) : this.camAreaUnlocked(c.area)) out.push(c.id); }
    return out;
  }
  camAreaUnlocked(area) {
    if (this.mode === 'infinite') return true;
    for (let i = 1; i <= this.night; i++) if ((NIGHTS[i].camAreas || []).includes(area)) return true;
    return this.night >= 10;
  }

  // ── démarrage ──
  begin(opts) {
    const g = this.game;
    this.mode = opts.mode || 'story'; this.slot = opts.slot ?? 0;
    const d = opts.data || {};
    Object.assign(g.flags, d.flags || {});
    this.stats = { ...(d.stats || {}) };
    for (const k of d.discovered || []) g.discovered[k] = true;
    this.night = opts.night || d.night || 1;
    g.night = this.night; g.mode = this.mode;
    if (opts.mp && !Net.isHost) { g.ui.card('Connexion…', 'en attente de l\'hôte'); Net.requestFull(); return; }
    this.startNight(this.night);
  }

  // Hôte : prépare une nuit (remise à zéro, déblocages, objets, heure)
  startNight(n) {
    const g = this.game; if (!Net.isHost) return;
    const N = this.mode === 'story' ? NIGHTS[Math.min(10, n)] : null;
    const day = this.mode === 'story' && N.day && !g.flags['day_done_' + n];
    g.sim.emit('night', { phase: 'reset', n, mode: this.mode, day, flags: g.flags, stats: this.stats });
    // déblocages → verrous
    const W = g.world;
    for (const [id, ctl] of Object.entries(W.shops)) {
      const open = this.isShopUnlocked(id);
      if (ctl.shutter) ctl.shutter.set({ locked: day ? false : !open, target: day ? 0 : 1 });
      if (ctl.rearDoor) ctl.rearDoor.set({ locked: true });
      if (ctl.frontDoor && !open) ctl.frontDoor.set({ locked: true });
    }
    // éclairage initial
    const lit = {};
    for (const z of W.zones) lit[z.id] = day ? (z.circuit && z.circuit !== 'basement' && z.circuit !== 'garage' && z.type !== 'vent') : false;
    lit.security = true;
    if (!day) { for (const z of W.zones) if (z.circuit === 'service' || z.circuit === 'basement' || z.circuit === 'garage') lit[z.id] = false; }
    g.lighting.setMany(lit);
    const gen = { running: false, fuel: this.mode === 'infinite' ? 60 : (n >= 9 ? 45 : 35), rpm: 0 };
    g.power.set({ mains: true, gen, blown: {}, doorClosed: false, hatchClosed: false, alarms: {}, escalators: day, fountain: day });
    for (const [c] of Object.entries(g.power.state.breakers)) { /* tous les disjoncteurs remis */ }
    g.power.set({ breakers: Object.fromEntries(Object.keys(g.power.state.breakers).map(c => [c, true])) });
    // fontaine et escalators
    for (const f of g.devices.kind('fountain')) f.set({ on: day });
    // objets donnés
    const desk = W.points.deskTop; const give = [];
    if (this.mode === 'story') { for (const [it, cnt] of (N.give || [])) for (let i = 0; i < cnt; i++) give.push(it); }
    else give.push('motion_sensor', 'motion_sensor', 'motion_sensor', 'padlock', 'padlock', 'portable_cam', 'portable_cam', 'rc_car', 'rc_remote', 'duct_tape', 'screwdriver', 'extinguisher', 'fuel_can', 'battery', 'battery', 'lockpick');
    give.forEach((it, i) => g.props.spawn(it, [desk.x - 0.3 + (i % 5) * 0.22, desk.y + ITEMS[it].s[1] / 2 + 0.02, desk.z - 1.0 + Math.floor(i / 5) * 0.3], { vel: null }));
    // note de Gérard
    if (this.mode === 'story' && !day) { const note = g.props.spawn('gerard_note', [W.points.deskNote.x, W.points.deskNote.y + 0.005, W.points.deskNote.z], { vel: null, data: { text: GERARD_NOTES[n] } }); }
    // équipement de chaque gardien
    for (const pl of g.allPlayers()) this.equip(pl.id, day);
    // heure
    const start = day ? parseT('18:30') : parseT('21:30');
    this.phase = day ? 'day' : 'dusk';
    this.scripted = this.mode === 'story' ? (N.scripted || []).map(s => ({ ...s, t: nightMin(parseT(s.at)), done: false })).sort((a, b) => a.t - b.t) : [];
    this.outcome = { robbery: null, fire: null, deaths: 0, thefts: [], policeCalls: 0, startedAt: Date.now() };
    this.tutorial = day ? { step: 0, wait: 0 } : null;
    this.t = 0; this.endT = 0;
    g.sim.emit('night', { phase: day ? 'day' : 'dusk', n, time: start, mode: this.mode, unlockedShops: [...this.unlockedShops], unlockedAreas: [...this.unlockedAreas] });
    g.events.configure(this.mode, n);
    g.entities.configure(this.mode, n, day);
    if (day) g.entities.spawnDay();
    else g.entities.spawnDusk();
    this.lastDirectorNight = n;
  }
  equip(id, day) {
    const g = this.game;
    if (day) return; // Gérard donne les clés et la lampe pendant le tutoriel
    g.props.giveNew('keys', id); g.props.giveNew('flashlight', id);
  }

  // Effet répliqué : étapes de la nuit
  applyNightEffect(p) {
    const g = this.game;
    if (p.phase === 'reset') {
      this.night = p.n; this.mode = p.mode; g.night = p.n; g.mode = p.mode;
      if (!Net.isHost) { Object.assign(g.flags, p.flags || {}); this.stats = p.stats || this.stats; }
      this.computeUnlocks(p.n);
      g.world.resetAll(); g.props.resetRuntime(); g.traps.clear(); g.particles.clearDecals();
      g.fire.reset(); g.alarms.reset(); g.entities.reset(); g.security.reset(); g.phone.reset();
      g.player.inv.clear(); g.player.revive(); g.player.setCostume(g.settings.costume && Net.online ? g.settings.costume : 'guard'); g.player.wear = { feet: null, head: null, face: null, body: null };
      const sp = g.world.points.securityDesk; const off = Net.online ? (parseInt(String(Net.myId).replace(/\D/g, '') || '1') % 4) * 0.8 : 0;
      g.player.spawn(new THREE.Vector3(sp.x + 1.2 + off, sp.y, sp.z - 1 + off), Math.PI / 2);
      g.player.flashOn = false;
      if (g.ui.modal) g.ui.closeModal(true);
      g.ui.setObjective('');
      return;
    }
    if (p.phase === 'day' || p.phase === 'dusk') {
      this.phase = p.phase; g.isDay = p.phase === 'day';
      if (p.unlockedShops) { this.unlockedShops = new Set(p.unlockedShops); this.unlockedAreas = new Set(p.unlockedAreas); }
      g.env.setTime(p.time); g.env.timeScale = p.phase === 'day' ? 0.5 : NIGHT_RATE;
      g.env.weather = 'clear';
      const N = NIGHTS[Math.min(10, p.n)];
      if (this.mode === 'story') { g.ui.card(N.title, N.subtitle, 5); setTimeout(() => (N.news || []).forEach((t, i) => setTimeout(() => g.toast(t, 6), i * 2500)), 3500); }
      else g.ui.card('Mode infini', 'Nuit ' + p.n, 4);
      if (p.phase === 'day') g.ui.setObjective('Rejoignez Gérard au poste de sécurité (extrémité ouest du rez-de-chaussée).');
      else g.ui.setObjective(this.mode === 'story' ? 'Lisez la note de Gérard sur le bureau. La nuit commence à 22 h.' : 'Survivez jusqu\'à 6 h.');
      if (p.phase === 'day') { g.player.spawn(g.world.points.spawnDay, g.world.points.spawnDayYaw ?? Math.PI / 2); }
      this.save();
      return;
    }
    if (p.phase === 'night') {
      this.phase = 'night'; g.isDay = false; g.env.timeScale = NIGHT_RATE; g.env.setTime(22 * 60);
      g.ui.card(this.mode === 'story' ? 'Nuit ' + p.n : 'Nuit ' + p.n, '22:00', 3.5);
      g.ui.setObjective(this.mode === 'story' ? 'Surveillez le centre jusqu\'à 6 h.' : 'Survivez jusqu\'à 6 h.');
      g.sfx('pa_chime_end', null, { volume: 0.4, bus: 'ambience' });
      return;
    }
    if (p.phase === 'dusk_soft') { this.phase = 'dusk'; g.isDay = false; g.env.timeScale = NIGHT_RATE; g.ui.setObjective('Retournez au poste : la nuit commence à 22 h.'); return; }
    if (p.phase === 'end') { this.showSummary(p); return; }
    if (p.phase === 'fail') { this.showFail(p); return; }
    if (p.phase === 'ending') { this.showEnding(p); return; }
    if (p.phase === 'gameover') { this.showGameOver(p); return; }
  }

  // ── boucle (hôte) ──
  update(dt) {
    const g = this.game; this.t += dt;
    if (this.phase === 'none' || this.phase === 'end' || this.phase === 'fail' || this.phase === 'ending') return;
    const m = g.env.minutes;
    if (this.phase === 'day') this.updateDay(dt, m);
    if (this.phase === 'dusk' && m >= 22 * 60 - 0.5 && m < 23 * 60) this.beginNight();
    if (this.phase === 'night') {
      const nm = nightMin(m);
      for (const s of this.scripted) if (!s.done && nm >= s.t) { s.done = true; if (!s.cond || this.cond(s.cond)) g.events.execute(s, true); }
      if (nm >= 480 - 0.01) this.endNight(false);
      // abandon de poste
      for (const pl of g.alivePlayers()) { if (pl.pos.x > 112) { this.fail('Vous avez quitté le centre en pleine nuit. Abandon de poste.'); return; } }
      if (g.alivePlayers().length === 0) { if (this.mode === 'infinite') this.gameOver(); else this.fail(this.deathReason || 'Vous n\'avez pas survécu à la nuit.'); }
      // rituel de la dernière nuit
      if (this.mode === 'story' && this.night === 10 && !g.flags.ritual) this.checkRitual();
    }
  }
  cond(c) { const g = this.game; if (c === 'electro_powered') return g.power.isOn('electro'); return true; }

  beginNight() {
    const g = this.game;
    g.sim.emit('night', { phase: 'night', n: this.night });
    this.phase = 'night';
    // extinction des galeries, fermeture
    const lit = { ...g.power.state.lit };
    for (const z of g.world.zones) if (z.id !== 'security' && !this.keepLit?.has(z.id)) lit[z.id] = false;
    g.lighting.setMany(lit);
    g.power.set({ escalators: false, fountain: false });
    for (const f of g.devices.kind('fountain')) f.set({ on: false });
    for (const [id, ctl] of Object.entries(g.world.shops)) if (ctl.shutter && ctl.shutter.state.target !== 1) ctl.shutter.set({ target: 1, locked: !this.isShopUnlocked(id) });
    g.entities.nightStart();
    g.events.nightStart();
    if (this.mode === 'story' && this.night === 1) g.flagSet('day_done_1', true);
    // appel du directeur au sujet de la nuit précédente
    if (this.mode === 'story' && this.stats.warn) { const w = this.stats.warn; this.stats.warn = null; setTimeout(() => g.phone.incoming('director_warn', { text: w }), 25000); }
  }

  // ── journée d'accueil (nuit 1) ──
  updateDay(dt, m) {
    const g = this.game; const T = this.tutorial;
    // l'horloge ne dépasse pas 19:40 tant que le tutoriel n'est pas fini
    if (T && T.step < 99 && m > parseT('19:40')) g.env.setTime(parseT('19:40'));
    if (m < parseT('20:00')) this.crowdLevel = 1; else this.crowdLevel = Math.max(0, 1 - (m - parseT('20:00')) / 30);
    if (!this._closingAnnounce && m >= parseT('19:45')) { this._closingAnnounce = true; g.sim.emit('pa', { chime: true, text: 'Mesdames et messieurs, le centre commercial Hélios fermera ses portes dans quinze minutes. Merci de vous diriger vers les caisses.' }); }
    if (!this._closed && m >= parseT('20:00')) {
      this._closed = true; g.sim.emit('pa', { chime: true, text: 'Le centre commercial Hélios est maintenant fermé. Merci de votre visite et à demain.' });
      g.entities.crowdLeave();
      for (const [id, ctl] of Object.entries(g.world.shops)) if (ctl.shutter) setTimeout(() => ctl.shutter.set({ target: 1 }), 20000 + Math.random() * 40000);
      g.env.timeScale = 1.0;
    }
    if (!this._lightsOff && m >= parseT('20:45')) { this._lightsOff = true; const lit = { ...g.power.state.lit }; for (const z of g.world.zones) if (z.shop) lit[z.id] = false; lit.service_n0 = lit.service_s0 = false; g.lighting.setMany(lit); }
    if (!this._gerardLeaves && m >= parseT('21:50')) { this._gerardLeaves = true; g.entities.gerardLeave(); g.sim.emit('dialogue', { who: 'Gérard', text: 'Allez, j\'y vais. Bonne nuit, petit. Et… ne descends pas au sous-sol après trois heures. Je rigole. Enfin… presque.' }); }
    if (m >= parseT('21:30') && this.phase === 'day') { this.phase = 'dusk'; g.sim.emit('night', { phase: 'dusk_soft', n: this.night }); g.env.timeScale = NIGHT_RATE; g.isDay = false; this.dayToDusk(); }
    if (T) this.updateTutorial(dt);
  }
  dayToDusk() { const g = this.game; g.isDay = false; g.sim.emit('dialogue', { who: '', text: '' }); }

  updateTutorial(dt) {
    const g = this.game; const T = this.tutorial; if (T.step >= 99) return;
    T.wait -= dt; if (T.wait > 0) return;
    const ger = g.entities.gerard; const near = g.alivePlayers().find(p => ger && p.pos.distanceTo(ger.pos) < 4.5);
    const say = (text, dur) => { g.sim.emit('dialogue', { who: 'Gérard', text, dur }); T.wait = dur || Math.max(3, text.length * 0.06 + 1.2); };
    switch (T.step) {
      case 0: if (near) { say('Ah, te voilà ! C\'est toi le nouveau ? Gérard, enchanté. Vingt-cinq ans que je garde ce centre. Vingt-cinq ans… et toutes mes nuits.'); T.step = 1; } break;
      case 1: say('Assieds-toi au bureau, là. Les écrans, c\'est ta vie maintenant. Appuie sur E en regardant les moniteurs.'); g.sim.emit('dialogue', { objective: 'Asseyez-vous au bureau du poste : E en visant le mur d\'écrans.' }); T.step = 2; break;
      case 2: if (g.allPlayers().some(p => p.mode === 'desk')) { g.sim.emit('dialogue', { objective: 'Écoutez Gérard.' }); say('Voilà. Pour l\'instant, t\'as que le magasin de jouets : la direction est radine. Flèches gauche et droite pour changer de caméra, Espace pour l\'infrarouge.'); T.step = 3; } else T.wait = 0.5; break;
      case 3: say('En bas, les boutons : les lumières des magasins, les rideaux, la porte blindée du poste. Le bouton REC, on te le branchera demain.'); T.step = 4; break;
      case 4: say('Le téléphone est sur le bureau. Les numéros utiles sont sur le post-it : police, le 17. Pompiers, le 18. Et mon portable, si t\'as un souci. N\'appelle pas le directeur pour rien.'); T.step = 5; break;
      case 5: say('Tiens, prends ça : le trousseau de clés et ma vieille lampe. Touche F pour l\'allumer, R pour changer les piles. Elle a vu des choses, cette lampe.'); for (const p of g.allPlayers()) { g.props.giveNew('keys', p.id); g.props.giveNew('flashlight', p.id); } T.step = 6; break;
      case 6: say('La radio, c\'est pour pas devenir fou. Et la machine à café… elle marche mieux que moi.'); T.step = 7; break;
      case 7: say('Le centre ferme à vingt heures. Fais un tour, parle aux commerçants, ils sont sympas. Moi je reste jusqu\'à dix heures, après… c\'est toi le gardien.'); g.sim.emit('toast', { text: 'Explorez le centre et parlez aux commerçants (E). La nuit tombe progressivement.' }); T.step = 99; g.sim.emit('dialogue', { objective: 'Explorez le centre jusqu\'à la fermeture (20 h), puis revenez au poste avant 22 h.' }); break;
    }
  }

  // Dialogue répliqué (sous-titres + voix)
  applyDialogue(p) {
    const g = this.game;
    if (p.objective) { g.ui.setObjective(p.objective); return; }
    if (!p.text) return;
    g.say(p.who, p.text, { dur: p.dur });
  }
  // Parler à un PNJ (hôte)
  talkHost(npcId, actor, choice) { this.game.entities.talk(npcId, actor, choice); }

  // ── fin de nuit ──
  endNight(forced) {
    const g = this.game; if (this.phase === 'end') return;
    // échecs de fin de nuit
    const ro = this.outcome.robbery;
    if (ro && ro.result === 'success' && !ro.reported) { this.fail('Les braqueurs ont vidé la bijouterie et personne n\'a prévenu la police.'); return; }
    this.phase = 'end';
    const stolen = this.outcome.thefts.reduce((a, t) => a + (t.value || 0), 0);
    // conséquences des vols
    let suspicionAdd = 0; const notes = [];
    for (const t of this.outcome.thefts) {
      if (t.recorded) { suspicionAdd += 2; notes.push(`Vol (${t.value} €) enregistré par ${t.recorded} : le directeur a vu la vidéo.`); }
      else if (t.scratched) { suspicionAdd += 1; notes.push(`Caisse rayée (${t.shop}) : le gérant a porté plainte contre X.`); }
      else notes.push(`Il manque ${t.value} € (${t.shop}) : « erreur de caisse », d'après le gérant.`);
    }
    if (this.outcome.recordGap && this.outcome.thefts.length) { suspicionAdd += 0.5; notes.push('Coupure d\'enregistrement pendant un vol : suspect.'); }
    if ((this.stats.forced || 0) > 0) { suspicionAdd += 1; this.stats.forced = 0; }
    this.stats.suspicion = (this.stats.suspicion || 0) + suspicionAdd;
    this.stats.stolen = (this.stats.stolen || 0) + stolen;
    if (suspicionAdd >= 2) this.stats.warn = 'Je ne sais pas ce qui s\'est passé hier, mais je vous ai à l\'œil. Une fois de plus et c\'est la porte.';
    if (g.flags.cat_fed_tonight) { this.stats.catNights = (this.stats.catNights || 0) + 1; g.flags.cat_fed_tonight = false; }
    g.flags.cat_nights = this.stats.catNights || 0;
    g.flags.pranks = this.stats.pranks || 0;
    const summary = this.buildSummary(notes, stolen);
    // fins anticipées
    const early = this.mode === 'story' ? this.checkEarlyEnding() : null;
    if (early) { this.ending(early); return; }
    if (this.mode === 'story' && this.night >= 10) { this.ending(this.finalEnding()); return; }
    g.sim.emit('night', { phase: 'end', n: this.night, mode: this.mode, summary });
    if (this.mode === 'infinite') { Save.recordInfinite(this.night); }
  }
  buildSummary(notes, stolen) {
    const o = this.outcome; const lines = [];
    if (o.robbery) lines.push(o.robbery.result === 'aborted' ? ['good', 'Les braqueurs ont renoncé (trop de lumière / alarme).'] : o.robbery.result === 'arrested' ? ['good', 'Les braqueurs ont été arrêtés par la police !'] : o.robbery.reported ? ['bad', 'Les braqueurs se sont enfuis, mais vous avez prévenu la police.'] : ['bad', 'Cambriolage.']);
    if (o.fire) lines.push(o.fire === 'prevented' ? ['good', 'Aucun départ de feu : le disjoncteur était coupé à temps.'] : o.fire === 'extinguished' ? ['good', 'Incendie maîtrisé.'] : o.fire === 'firemen' ? ['good', 'Les pompiers ont éteint l\'incendie.'] : ['bad', 'Incendie.']);
    if (this.stats.pranksTonight) lines.push(['bad', `Appels abusifs aux secours : ${this.stats.pranksTonight}`]);
    for (const n of notes) lines.push(['bad', n]);
    if (stolen) lines.push(['', `Argent « emprunté » cette nuit : ${stolen} €.`]);
    if (this.game.flags.cat_fed_tonight) lines.push(['good', 'Vous avez nourri le chat errant.']);
    this.stats.pranksTonight = 0;
    return lines;
  }
  continueAfter(kind) {
    if (kind === 'end') { this.night++; this.game.night = this.night; this.startNight(this.night); }
    else if (kind === 'fail') this.startNight(this.night);
  }
  restartNight(msg) { if (!Net.isHost) { this.game.sim.do('restart_night', {}); return; } this.startNight(this.night); if (msg) this.game.sim.emit('toast', { text: msg }); }

  fail(reason) {
    const g = this.game; if (this.phase === 'fail') return;
    this.phase = 'fail';
    g.sim.emit('night', { phase: 'fail', n: this.night, reason });
  }
  gameOver() { this.phase = 'fail'; Save.recordInfinite(this.night - 1); this.game.sim.emit('night', { phase: 'gameover', n: this.night }); }
  onLocalDeath(cause, by) {
    const g = this.game;
    this.deathReason = by ? ({ bobby: 'Bobby vous a trouvé.', mannequin: 'Les mannequins vous ont rattrapé.', shadow: 'L\'Ombre vous a emporté dans le noir.', crawler: 'Quelque chose est descendu des conduits.', robbers: 'Les braqueurs vous ont abattu.', thing: 'La Chose de B-13 vous a gardé.', fire: 'Vous avez péri dans les flammes.' }[by] || 'Vous êtes mort.') : cause === 'fall' ? 'Une mauvaise chute.' : cause === 'fire' ? 'Vous avez péri dans les flammes.' : 'Vous êtes mort.';
    if (Net.online) { g.toast('Vous êtes mort. Vous pouvez encore regarder les caméras du poste (spectateur).', 8); g.security.enterSpectator(); g.sim.do('flag', { k: 'deaths', inc: 1 }); }
    if (Net.isHost && !Net.online) setTimeout(() => { if (this.phase === 'night' || this.phase === 'dusk') { if (this.mode === 'infinite') this.gameOver(); else this.fail(this.deathReason); } }, 2500);
  }

  showSummary(p) {
    const g = this.game; g.paused = false;
    const lines = (p.summary || []).map(([c, t]) => `<li class="${c}">${t}</li>`).join('') || '<li class="good">Nuit calme. Rien à signaler.</li>';
    const html = `<h1>06:00 — ${p.mode === 'story' ? 'Nuit ' + p.n + ' terminée' : 'Nuit ' + p.n + ' survécue'}</h1><p>Le jour se lève sur le centre Hélios. Les premiers employés arrivent.</p><ul>${lines}</ul>`;
    g.ui.showSummary(html, Net.isHost ? [[p.mode === 'story' && p.n < 10 ? 'Nuit suivante' : 'Continuer', () => g.sim.do('night_continue', { kind: 'end' })], ['Menu principal', () => g.onQuit()]] : [['En attente de l\'hôte…', () => { }]]);
    g.sfx('success', null, { bus: 'ui' });
  }
  showFail(p) {
    const g = this.game;
    g.ui.showSummary(`<h1>Nuit ${p.n} — échec</h1><p class="bad">${p.reason}</p><p>La nuit va recommencer.</p>`, Net.isHost ? [['Recommencer la nuit', () => g.sim.do('night_continue', { kind: 'fail' })], ['Menu principal', () => g.onQuit()]] : [['En attente de l\'hôte…', () => { }]]);
  }
  showGameOver(p) {
    const g = this.game; const best = Save.load().infinite.best;
    g.ui.showSummary(`<h1>Fin de partie</h1><p>Vous avez tenu <b>${Math.max(0, p.n - 1)}</b> nuit(s) complète(s).</p><p>Record : ${best}</p>`, [['Rejouer', () => { this.night = 1; this.game.night = 1; if (Net.isHost) this.startNight(1); }], ['Menu principal', () => g.onQuit()]]);
  }

  // ── vols ──
  onTheft(d) {
    const g = this.game;
    const rec = g.security.whoSaw ? g.security.whoSaw(d.actor) : null; // caméra qui enregistrait et voyait le voleur
    const scratched = d.reg?.state?.scratched || false;
    this.outcome.thefts.push({ value: d.value || 0, shop: d.shop || '?', recorded: rec, recordedId: rec ? g.security._lastSawId : null, scratched, kind: d.kind });
    if (rec) g.sim.emit('toast', { text: '⚠ La caméra « ' + rec + ' » enregistrait…' }, { to: d.actor });
  }

  // ── fragments, B-13, rituel ──
  fragmentFound(id) {
    const g = this.game; const fid = id.startsWith('fragment:') ? id.slice(9) : id;
    const f = FRAGMENTS.find(x => x.id === fid || 'vhs_' + x.id === fid || x.id === 'vhs_' + fid);
    if (!f) return;
    if (g.flags['frag_' + f.id]) return;
    g.flags['frag_' + f.id] = true;
    const n = FRAGMENTS.filter(x => g.flags['frag_' + x.id]).length;
    g.flags.fragments = n;
    g.toast('Fragment de vérité trouvé (' + n + '/5) : ' + f.name);
    g.sfx('stinger', null, { volume: 0.5, bus: 'ui' });
  }
  onB13Opened() { const g = this.game; g.flagSet('b13_opened', true); g.sim.emit('toast', { text: 'La porte B-13 s\'ouvre dans un grincement interminable.' }); g.entities.b13Opened?.(); }
  checkRitual() {
    const g = this.game; const alt = g.world.points.b13Altar; if (!alt) return;
    const near = (def) => g.props.find(def).some(p => new THREE.Vector3(...p.state.pos).distanceTo(alt) < 2.2) || g.alivePlayers().some(pl => pl.pos.distanceTo(alt) < 2.5 && pl.hasItem?.(def));
    const brooch = near('cursed_brooch'), bobby = near('bobby_plush');
    const music = g.props.find('music_box', { any: true }).some(p => p.data.on && (new THREE.Vector3(...p.state.pos).distanceTo(alt) < 3 || (p.state.where === 'held' && g.playerById(p.state.owner)?.pos.distanceTo(alt) < 3)));
    if (brooch && bobby && music) {
      if ((g.flags.fragments || 0) >= 5) { g.flagSet('ritual', true); g.sim.emit('say', { who: 'Voix d\'enfant', text: 'Tu m\'as trouvée. Merci… je peux rentrer à la maison, maintenant.' }); setTimeout(() => this.endNight(true), 9000); }
      else if (!this._ritualFail) { this._ritualFail = true; g.sim.emit('say', { who: 'Voix d\'enfant', text: 'Tu ne sais pas qui je suis. Tu ne sais rien. Reste. Reste avec moi.' }); }
    }
  }

  // ── fins ──
  checkEarlyEnding() {
    const g = this.game;
    if ((this.stats.pranks || 0) >= 5) return 'arrested';
    if ((this.stats.suspicion || 0) >= 3) return 'fired';
    if (g.flags.resigned) return 'resign';
    return null;
  }
  finalEnding() {
    const g = this.game; const F = g.flags;
    if ((F.fragments || 0) >= 5 && F.ritual) return 'truth';
    if (F.b13_opened && !F.ritual) return 'replacement';
    if ((this.stats.stolen || 0) >= 5000) return 'rich';
    return 'guardian';
  }
  ending(id) {
    const g = this.game; this.phase = 'ending';
    const F = g.flags; const ep = [];
    if ((this.stats.catNights || 0) >= 7) ep.push('cat'); if (F.played_lune) ep.push('musician'); if (F.glouton_secret) ep.push('gamer');
    g.sim.emit('night', { phase: 'ending', id, epilogues: ep, n: this.night });
  }
  showEnding(p) {
    const g = this.game; const e = ENDINGS.find(x => x.id === p.id);
    Save.recordEnding(p.id);
    if (this.mode === 'story') Save.deleteSlot(this.slot);
    const eps = (p.epilogues || []).map(id => EPILOGUES.find(x => x.id === id)).filter(Boolean);
    g.ui.showSummary(`<h1>FIN — ${e.name}</h1><p>${e.desc}</p>${eps.map(x => `<h3>Épilogue : ${x.name}</h3><p>${x.desc}</p>`).join('')}<p class="small">Fins débloquées : ${Object.keys(Save.load().endings).length}/${ENDINGS.length}</p>`, [['Menu principal', () => g.onQuit()]]);
    g.music(p.id === 'truth' ? 'music_box' : p.id === 'guardian' ? 'lofi' : 'creepy_vinyl', { volume: 0.6 });
  }

  // ── sauvegarde ──
  save() {
    if (this.mode !== 'story') return;
    const g = this.game;
    const data = { night: this.night, flags: { ...g.flags }, stats: { ...this.stats }, discovered: Object.keys(g.discovered) };
    if (Net.online) { if (Net.isHost) Net.saveRoom({ ...data, mode: this.mode }); }
    else Save.saveSlot(this.slot, data);
  }

  // ── divers ──
  mirrorLook(mirror, p) {
    const g = this.game;
    if (p.heldDef?.use === 'lipstick') return;
    const r = Math.random();
    if (!g.isDay && r < 0.12 && g.settings.screamers !== false) { g.ui.screamerFlash('mirror'); p.scare(25); return; }
    if (!g.isDay && r < 0.3) { g.toast('Votre reflet cligne des yeux… une fraction de seconde après vous.'); p.scare(10); return; }
    g.toast(['Vous avez une sale tête.', 'Les cernes de la nuit blanche.', 'Votre uniforme est mal boutonné.', 'Vous vous trouvez fatigué. Le miroir aussi.'][Math.floor(Math.random() * 4)]);
  }
  newspaperText(mag) {
    const n = this.night;
    if (mag) return ['« 10 astuces pour mieux dormir quand on travaille de nuit » (l\'astuce n°1 : ne pas travailler au centre Hélios).', '« Horoscope : Gémeaux — une porte longtemps fermée va s\'ouvrir. »', '« Spécial rétro : les jouets des années 80. Qui se souvient de Bobby l\'Ourson ? »'][n % 3];
    const heads = {
      1: '« Le centre Hélios recrute un gardien de nuit. » — « Météo : nuit claire, températures en baisse. »',
      2: '« Des clients se plaignent d\'articles retrouvés au sol chaque matin à l\'hypermarché. »',
      3: '« La peluche Bobby fait son retour en rayon pour l\'anniversaire du Royaume du Jouet. »',
      4: '« Rétro Vidéo Club : une cassette mystérieuse ferait le tour des collectionneurs. »',
      5: '« Mode : la boutique Élégance renouvelle ses mannequins… pour la première fois depuis 1987. »',
      6: '« Vague de cambriolages : une bande vise les bijouteries de la région. La police appelle à la vigilance. »',
      7: '« Un électricien alerte sur la vétusté de certaines installations commerciales. »',
      8: '« Bruits étranges dans les conduits : les riverains du centre Hélios s\'interrogent. »',
      9: '« Alerte orage : risques de coupures de courant sur tout le département. »',
      10: '« Le centre commercial Hélios fête ses 37 ans. La direction promet une nuit inoubliable. »',
    };
    return (heads[Math.min(10, n)] || heads[10]) + '\n\nEn page 7 : « Disparition de Lucie M. : l\'affaire jamais élucidée. »';
  }
  computerNotes() { return [GERARD_NOTES[Math.min(10, this.night)] || '', LORE.page.text]; }
}
