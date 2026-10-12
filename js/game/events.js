// Moteur d'événements : exécute les primitives « fx » (scripts de l'histoire et événements aléatoires du
// catalogue), planifie les événements aléatoires selon la nuit / la difficulté et le nombre de joueurs.
import * as THREE from 'three';
import { buildEventCatalog } from '../data/events.js';
import { NIGHTS } from '../data/story.js';
import { Net } from '../net/net.js';

const R = Math.random;

export class EventSystem {
  constructor(game) {
    this.game = game;
    this.catalog = buildEventCatalog();
    this.cats = new Set(['subtle']); this.rate = 1; this.next = 60; this.cool = new Map(); this.history = [];
    const S = game.sim;
    S.effect('flicker', (p) => { for (const z of p.zones) game.lighting.flickerZone(z, p.dur || 2); if (p.sound) game.sfx('neon_flicker', p.pos ? new THREE.Vector3(...p.pos) : null, { volume: 0.6 }); });
    S.effect('loopfx', (p) => { const l = game.loop(p.s, p.pos ? new THREE.Vector3(...p.pos) : null, { volume: p.v ?? 1, ref: p.ref || 2 }); setTimeout(() => l.stop(0.5), (p.dur || 5) * 1000); });
    S.effect('cold', (p) => game.env.addColdSpot(new THREE.Vector3(...p.pos), p.r || 6, p.dur || 20));
    S.effect('weather', (p) => game.env.setWeather(p.kind));
    S.effect('screamer', (p) => { if (!p.to || p.to === Net.myId) { game.ui.screamerFlash(p.kind); game.player.scare(30); } });
    S.effect('uvtext', (p) => { game.world.uvWritings = game.world.uvWritings || []; game.world.uvWritings.push({ pos: new THREE.Vector3(...p.pos), ry: p.ry || 0, text: p.text, zone: p.zone }); game.security?.refreshUV?.(); });
    S.effect('footsteps', (p) => this.playSteps(p));
  }
  get g() { return this.game; }

  configure(mode, n) {
    this.mode = mode; this.night = n; this.cool.clear(); this.history = [];
    if (mode === 'story') { const N = NIGHTS[Math.min(10, n)]; this.cats = new Set(N.random.cats); this.rate = N.random.rate; }
    else { this.cats = new Set(['subtle', 'items', 'shadow', 'devices', 'phone', 'mannequin', 'power', 'vents', 'food', 'garage', 'basement', 'weather']); if (n >= 5) this.cats.add('finale'); this.rate = Math.min(5, 1.8 + n * 0.35); }
    if (this.g.settings.screamers !== false) this.cats.add('screamer');
    this.next = 40 + R() * 40;
    this.majors = mode === 'infinite' ? this.planMajors(n) : [];
  }
  nightStart() { this.next = 30 + R() * 30; }
  planMajors(n) {
    // événements majeurs du mode infini : choisis au hasard, mais cohérents
    const list = []; const r = () => 30 + R() * 400; // minutes de nuit
    if (n >= 2 && R() < 0.35 + n * 0.04) list.push({ t: r(), kind: 'robbery' });
    if (n >= 2 && R() < 0.25 + n * 0.03) list.push({ t: r(), kind: 'fire' });
    if (n >= 3 && R() < 0.25) list.push({ t: r(), kind: 'blackout' });
    const ents = ['bobby', 'mannequin', 'crawler', 'shadow'];
    for (const e of ents) if (R() < Math.min(0.9, 0.2 + n * 0.1)) list.push({ t: 10 + R() * 200, kind: 'entity', type: e });
    if (n >= 6 && R() < 0.4) list.push({ t: 200 + R() * 150, kind: 'entity', type: 'thing' });
    return list.sort((a, b) => a.t - b.t);
  }

  update(dt) {
    const g = this.g; if (g.story.phase !== 'night') return;
    const nm = g.env.nightMinutes;
    // majeurs (infini)
    for (const m of this.majors || []) if (!m.done && nm >= m.t) { m.done = true; this.major(m); }
    // aléatoires : `rate` événements par heure de jeu
    this.next -= dt;
    if (this.next <= 0) {
      const players = Math.max(1, g.alivePlayers().length);
      const perSec = this.rate * (1 + 0.25 * (players - 1)) / (60 / (g.env.timeScale || 0.53)); // événements par seconde réelle
      this.next = (0.5 + R()) / Math.max(0.0005, perSec);
      this.randomEvent();
    }
  }
  candidates() {
    const g = this.g; const nm = g.env.nightMinutes;
    return this.catalog.filter(e => {
      if (!this.cats.has(e.cat)) return false;
      if (this.mode === 'story' && e.minNight > this.night) return false;
      if (this.mode === 'infinite' && e.minNight > this.night + 2) return false;
      if (e.loc && !this.locUnlocked(e.loc)) return false;
      const c = this.cool.get(e.tpl); if (c !== undefined && nm - c < 25) return false;
      return true;
    });
  }
  locUnlocked(loc) { const s = this.g.story; return s.isShopUnlocked(loc) || s.isAreaUnlocked(loc) || ['security', 'staff', 'toilettes', 'service_n0', 'service_s0'].includes(loc); }
  randomEvent() {
    const list = this.candidates(); if (!list.length) return;
    let total = 0; for (const e of list) total += e.weight; let r = R() * total; let ev = list[0];
    for (const e of list) { r -= e.weight; if (r <= 0) { ev = e; break; } }
    this.cool.set(ev.tpl, this.g.env.nightMinutes);
    this.execute(ev, false);
  }
  execute(ev, scripted) {
    const fxs = ev.fx ? (Array.isArray(ev.fx) ? ev.fx : [ev]) : [ev];
    this.history.push({ id: ev.id || ev.fx, t: this.g.clockString() }); if (this.history.length > 50) this.history.shift();
    this.g.hooks.emit('event', ev);
    for (const f of fxs) {
      const run = () => { try { const fn = PRIM[f.fx]; if (fn) fn(this, f, ev); else console.warn('[events] primitive inconnue', f.fx); } catch (e) { console.error('[events]', f.fx, e); } };
      if (f.delay) setTimeout(run, f.delay * 1000); else run();
    }
  }
  major(m) {
    const g = this.g;
    if (m.kind === 'robbery') g.entities.activate('robbers', 'spawn', { target: R() < 0.6 ? 'bijouterie' : ['electro', 'pixel', 'mobizone', 'octet', 'hyper'][Math.floor(R() * 5)] });
    if (m.kind === 'fire') { const cands = g.devices.all.filter(d => ['microwave', 'tv', 'washer', 'fryer', 'loopdevice', 'coffee_maker'].includes(d.def.use)); const d = cands[Math.floor(R() * cands.length)]; if (d) { g.sim.emit('sparks', { pos: d.center.toArray() }); setTimeout(() => { if (g.power.zoneOn(d.zone)) g.fire.ignite(d.center.clone().add(new THREE.Vector3(0, 0.3, 0)), 'wiring'); }, 50000); } }
    if (m.kind === 'blackout') PRIM.power(this, { action: 'cut', dur: 0 });
    if (m.kind === 'entity') g.entities.activate(m.type, 'activate', { level: Math.min(1, 0.3 + this.night * 0.08) });
  }

  // ── résolution des lieux ──
  zoneOf(where) {
    if (!where) return null;
    if (where.startsWith('shop:')) return this.g.world.zone(where.slice(5));
    if (where.startsWith('zone:')) return this.g.world.zone(where.slice(5));
    return this.g.world.zone(where);
  }
  target() { const ps = this.g.alivePlayers(); return ps[Math.floor(R() * ps.length)] || this.g.player; }
  pos(where) {
    const g = this.g; const W = g.world; const p = this.target();
    switch (where) {
      case 'near_player': return p.pos.clone().add(new THREE.Vector3(R() * 6 - 3, 1, R() * 6 - 3));
      case 'behind_player': { const yaw = p.yaw ?? 0; return p.pos.clone().add(new THREE.Vector3(Math.sin(yaw) * 2.5, 1.4, Math.cos(yaw) * 2.5)); }
      case 'above_player': return p.pos.clone().add(new THREE.Vector3(R() * 4 - 2, 5.5, R() * 4 - 2));
      case 'player_far': { const yaw = p.yaw ?? 0; return p.pos.clone().add(new THREE.Vector3(-Math.sin(yaw) * 18, 0, -Math.cos(yaw) * 18)); }
      case 'outside': return new THREE.Vector3(95 + R() * 30, 2, R() * 60 - 30);
      case 'vents': { const vz = ['vent_s', 'vent_n', 'vent_w'][Math.floor(R() * 3)]; return W.zone(vz).randomPoint(R, 0.4).setY(3.8); }
      case 'security': return W.points.securityDesk.clone().setY(1.5);
      case 'security_door': return W.points.securityDoorOut.clone().setY(1.2);
      case 'security_vent': return W.points.hatch.clone().setY(3.6);
      case 'b13': return W.points.b13.clone().setY(-3.2);
      case 'garage_gate': return W.points.garageGate.clone().setY(-3);
      case 'generator': return W.points.generator.clone().setY(-3.5);
      case 'entrance_glass': return new THREE.Vector3(80.6, 1.6, R() * 10 - 5);
      case 'skylight': return new THREE.Vector3(R() * 120 - 60, 13.2, R() < 0.5 ? -0.9 : 0.9); // debout sur la verrière, près du faîtage
      case 'escalator': return new THREE.Vector3(-20, 2.5, -1.6);
      case 'cinema_seat': return W.points.rowM13?.clone() || new THREE.Vector3();
      case 'mirror': return W.points.toiletMirror?.clone() || p.pos.clone();
    }
    const z = this.zoneOf(where);
    if (z) return z.randomPoint(R, 1).setY(z.min[1] + 1.2);
    return p.pos.clone().add(new THREE.Vector3(R() * 10 - 5, 1, R() * 10 - 5));
  }
  zonesFor(where) {
    const W = this.g.world;
    if (where === 'all') return W.zones.map(z => z.id);
    if (where === 'gallery_wave') return ['gallery0_e', 'atrium', 'gallery0_w', 'security'];
    const z = this.zoneOf(where); if (!z) return [];
    const out = [z.id]; if (z.shop && W.zone(z.shop + '_back')) out.push(z.shop + '_back');
    if (z.id === 'gallery0' || z.id.startsWith('gallery0')) out.push('atrium');
    return out;
  }
  playSteps(p) {
    const g = this.g; const pts = p.pts.map(a => new THREE.Vector3(...a));
    pts.forEach((pt, i) => setTimeout(() => g.sfx(p.heavy ? 'footstep_heavy' : p.light ? 'step_sneakers' : 'step_tile', pt, { volume: p.heavy ? 1 : 0.7 }), i * (p.light ? 260 : p.heavy ? 900 : 560)));
  }
}

function devicesIn(ev, f, kinds) {
  const g = ev.g; const zones = f.where === 'all' ? null : new Set(ev.zonesFor(f.where));
  return g.devices.all.filter(d => kinds.includes(d.def.use) || kinds.includes(d.def.id)).filter(d => !zones || zones.has(d.zone) || zones.has(d.opts.shop));
}
function propsIn(ev, f, defIds) {
  const g = ev.g; const zones = f.where === 'all' ? null : new Set(ev.zonesFor(f.where));
  return g.props.find(p => defIds.includes(p.defId) && (p.state.where === 'home' || p.state.where === 'world')).filter(p => !zones || zones.has(p.zone) || zones.has(g.world.zoneAt(...p.state.pos)?.id));
}
const pick = (a) => a[Math.floor(R() * a.length)];

const PRIM = {
  sound(ev, f) {
    const g = ev.g; const n = f.count || 1;
    for (let i = 0; i < n; i++) setTimeout(() => {
      const pos = ev.pos(f.where);
      if (f.dur) g.sim.emit('loopfx', { s: f.sound, pos: pos.toArray(), dur: f.dur, v: f.volume ?? 1 });
      else g.sim.emit('fx', { s: f.sound, pos: pos.toArray(), v: f.volume ?? 1 });
    }, i * (f.interval || 0.8) * 1000);
    if (/knock|scratch|breath|whisper|giggle|thud|footstep/.test(f.sound)) g.noise(ev.pos(f.where), 0, 'event');
  },
  knock(ev, f) {
    const g = ev.g; const z = ev.zoneOf(f.where); if (!z) return;
    const n = Array.isArray(f.n) ? f.n[0] + Math.floor(R() * (f.n[1] - f.n[0] + 1)) : (f.n || 2);
    const filter = f.item ? (p) => p.defId === f.item || p.def.use === f.item : null;
    let list = g.props.knock(z.id, n, filter);
    if (!list.length && f.item) { const pos = z.randomPoint(R, 1).setY(z.min[1] + 1.5); g.props.spawn(f.item === 'ball' ? 'ball' : f.item, pos.toArray(), { vel: [R() * 2 - 1, 0, R() * 2 - 1] }); }
  },
  flicker(ev, f) { const zones = ev.zonesFor(f.where || 'gallery0_w'); ev.g.sim.emit('flicker', { zones, dur: f.dur || 3, sound: true, pos: ev.pos(f.where || 'near_player').toArray() }); },
  lights(ev, f) { for (const z of ev.zonesFor(f.where)) ev.g.lighting.set(z, !!f.on); ev.g.sim.emit('fx', { s: 'switch', pos: ev.pos(f.where).toArray(), v: 0.6 }); },
  device(ev, f) {
    const g = ev.g; const k = f.kind; const dur = f.dur || 20;
    const trig = (list, params = {}) => { if (!list.length) return false; const d = pick(list); d.trigger({ dur, ...params, ...f }); return true; };
    const propOn = (defIds, d2 = dur) => { const ps = propsIn(ev, f, defIds); if (!ps.length) return false; const p = pick(ps); p.set({ data: { ...p.data, on: true } }); setTimeout(() => { if (g.world.objects.has(p.id)) p.set({ data: { ...p.data, on: false } }); }, d2 * 1000); return true; };
    switch (k) {
      case 'tv': case 'tv_crt': trig(devicesIn(ev, f, ['tv']).filter(d => k === 'tv_crt' ? d.p.crt : true)); break;
      case 'music_box': if (f.where === 'all') { for (const p of g.props.find('music_box')) { p.set({ data: { ...p.data, on: true } }); setTimeout(() => p.set({ data: { ...p.data, on: false } }), dur * 1000); } } else if (!propOn(['music_box'])) { const mine = g.props.find('music_box', { any: true }).find(p => p.state.where === 'held'); if (mine) { mine.set({ data: { ...mine.data, on: true } }); setTimeout(() => mine.set({ data: { ...mine.data, on: false } }), dur * 1000); } } break;
      case 'radio': propOn(['radio']); break;
      case 'speaker': if (propOn(['speaker'])) g.sim.emit('say', { who: 'Enceinte', text: 'Appareil connecté : LUCIE.', pos: ev.pos(f.where).toArray() }); break;
      case 'metronome': propOn(['metronome']); break;
      case 'lamps': for (const p of propsIn(ev, f, ['lava_lamp', 'lamp']).slice(0, 4)) { p.set({ data: { ...p.data, on: true } }); setTimeout(() => p.set({ data: { ...p.data, on: false } }), dur * 1000); } break;
      case 'disco': propOn(['disco_ball']); break;
      case 'blender': propOn(['blender'], 8); break;
      case 'toy_robot': { const ps = propsIn(ev, f, ['robot']); if (ps.length) { const p = pick(ps); g.props.push(p, [0, 0.5, 0]); setTimeout(() => p.set({ data: { ...p.data, walk: 'walk', wyaw: R() * 6.28, t: 20, speed: 0.25 } }), 900); } break; }
      case 'jack': case 'doll': case 'toy_phone': case 'cuckoo': case 'snowglobe': case 'popcorn': case 'soda': case 'cotton': {
        const ids = { jack: ['jack_box'], doll: ['doll', 'porcelain_doll'], toy_phone: ['toy_phone'], cuckoo: ['cuckoo_clock'], snowglobe: ['snow_globe'] }[k];
        const ps = ids ? propsIn(ev, f, ids) : []; const pos = ps.length ? new THREE.Vector3(...pick(ps).state.pos) : ev.pos(f.where);
        if (k === 'jack') { g.sim.emit('loopfx', { s: 'jack_music', pos: pos.toArray(), dur: 4 }); setTimeout(() => g.sim.emit('fx', { s: 'jack_in_box', pos: pos.toArray(), v: 1 }), 4200); }
        if (k === 'doll') g.sim.emit('say', { who: 'Poupée', text: pick(['Elle est en bas.', 'Tu restes avec moi ?', 'Un, deux, trois…', 'Il fait froid.', 'Maman ?']), pos: pos.toArray() });
        if (k === 'toy_phone') g.sim.emit('loopfx', { s: 'phone_ring', pos: pos.toArray(), dur: 6, v: 0.5 });
        if (k === 'cuckoo') for (let i = 0; i < 13; i++) setTimeout(() => g.sim.emit('fx', { s: 'bell_shop', pos: pos.toArray(), v: 0.6 }), i * 900);
        if (k === 'snowglobe') g.sim.emit('fx', { s: 'wind_chime', pos: pos.toArray(), v: 0.4 });
        if (k === 'popcorn') g.sim.emit('loopfx', { s: 'popcorn', pos: pos.toArray(), dur: 6 });
        if (k === 'soda') g.sim.emit('loopfx', { s: 'sprinkler', pos: pos.toArray(), dur: 6, v: 0.4 });
        if (k === 'cotton') g.sim.emit('loopfx', { s: 'blender', pos: pos.toArray(), dur: 8, v: 0.5 });
        break;
      }
      case 'kiddie': trig(devicesIn(ev, f, ['kiddie'])); break;
      case 'console': trig(devicesIn(ev, f, ['console'])); break;
      case 'arcade': trig(devicesIn(ev, f, ['arcade'])); break;
      case 'claw': trig(devicesIn(ev, f, ['claw'])); break;
      case 'vcr': trig(devicesIn(ev, f, ['vcr']), { tape: f.tape || 'no_label' }); break;
      case 'turntable': trig(devicesIn(ev, f, ['turntable']), { genre: f.genre || 'creepy_vinyl' }); break;
      case 'piano': trig(devicesIn(ev, f, ['piano'])); break;
      case 'drums': trig(devicesIn(ev, f, ['drumkit'])); break;
      case 'printer': trig(devicesIn(ev, f, ['printer'])); break;
      case 'pc': { const pcs = g.devices.kind('computer').filter(d => d.zone === 'security'); for (const d of pcs) { d.setScreen('msg:Tu restes\navec moi ?'); setTimeout(() => d.setScreen('computer:' + (d.opts.os || 'security'), 0.9), 9000); } g.sim.emit('fx', { s: 'computer_boot', pos: g.world.points.securityDesk.toArray(), v: 0.6 }); break; }
      case 'projector': trig(devicesIn(ev, f, ['projector'])); break;
      case 'conveyor': trig(devicesIn(ev, f, ['conveyor'])); break;
      case 'microwave': trig(devicesIn(ev, f, ['microwave'])); break;
      case 'washer': trig(devicesIn(ev, f, ['washer'])); break;
      case 'hand_dryer': trig(devicesIn(ev, f, ['hand_dryer'])); break;
      case 'water': trig(devicesIn(ev, f, ['sink'])); break;
      case 'massage': trig(devicesIn(ev, f, ['massage'])); break;
      case 'vending': trig(devicesIn(ev, f, ['vending'])); break;
      case 'photobooth': trig(devicesIn(ev, f, ['photobooth'])); break;
      case 'fryer': trig(devicesIn(ev, f, ['fryer'])); break;
      case 'parrot': trig(devicesIn(ev, f, ['parrot'])); break;
      case 'hamster': trig(devicesIn(ev, f, ['hamster'])); break;
      case 'chair_spin': trig(devicesIn(ev, f, ['chair_spin'])); break;
      case 'oven_glow': trig(devicesIn(ev, f, ['pizza_oven'])); break;
      case 'freezer_open': trig(devicesIn(ev, f, ['freezer'])); break;
      case 'generator': trig(g.devices.kind('generator')); break;
      case 'fountain': trig(g.devices.kind('fountain')); break;
      case 'escalator': g.power.set({ escalators: true }); setTimeout(() => g.power.set({ escalators: false }), dur * 1000); break;
      case 'radio_voice': g.sim.emit('say', { who: 'Radio', text: '… un … neuf … huit … sept … un … neuf … huit … sept …', pos: g.world.points.securityDesk.toArray() }); g.sim.emit('fx', { s: 'static_burst', pos: g.world.points.securityDesk.toArray(), v: 0.6 }); break;
      case 'car_lights': case 'car_horn': case 'car_radio': trig(g.devices.kind('car'), { kind: k }); break;
      default: console.warn('[events] appareil inconnu', k);
    }
  },
  door(ev, f) {
    const g = ev.g; const z = ev.zoneOf(f.where);
    if (f.action === 'grate_fall') { const gr = (g.world.ventGrates || []).find(x => x.o.shop === z?.shop); if (gr && !gr.state.open) gr.set({ open: true }); return; }
    let d = null;
    if (f.target === 'backroom' && z?.shop) d = g.world.shops[z.shop]?.backDoor;
    if (!d) return;
    if (f.action === 'creak') { g.sim.emit('fx', { s: 'door_creak', pos: d.pos.toArray(), v: 0.8 }); if (!d.state.open && !d.state.locked) d.forceOpen(1); }
    else if (f.action === 'slam') { if (d.state.open) d.forceOpen(0); g.sim.emit('fx', { s: 'door_slam', pos: d.pos.toArray(), v: 1 }); }
    else if (f.action === 'open') d.forceOpen(1); else if (f.action === 'close') d.forceOpen(0);
    else g.sim.emit('fx', { s: f.action === 'knock' ? 'knock_triple' : 'door_rattle', pos: d.pos.toArray(), v: 1 });
  },
  shutter(ev, f) { const z = ev.zoneOf(f.where); const sh = z?.shop && ev.g.world.shops[z.shop]?.shutter; if (sh) sh.set({ target: f.to ?? 0.7 }); },
  phone(ev, f) { ev.g.phone.incoming(f.caller); },
  pa(ev, f) { ev.g.sim.emit('pa', { chime: f.chime, text: f.line || '', feedback: f.feedback, child: f.child, system: true }); },
  shadow(ev, f) { ev.g.entities.apparition({ pos: ev.pos(f.where || 'player_far'), dur: f.dur || 3, cam: !!f.cam, eyes: !!f.eyes, where: f.where }); },
  cam_glitch(ev, f) { ev.g.security.glitch(f.dur || 3, f.figure); },
  cat(ev, f) { ev.g.entities.catAct(f.act || 'meow', ev.zoneOf(f.where)?.id); },
  move(ev, f) { ev.g.entities.moveThing(f.what); },
  whisper(ev, f) { const p = ev.target(); const yaw = p.yaw ?? 0; const pos = p.pos.clone().add(new THREE.Vector3(Math.sin(yaw) * 0.8, 1.6, Math.cos(yaw) * 0.8)); ev.g.sim.emit('fx', { s: 'whisper', pos: pos.toArray(), v: 0.6 }); if (R() < 0.3) setTimeout(() => ev.g.sim.emit('say', { who: '…', text: R() < 0.5 ? (p.name || 'Gardien') + '…' : 'Derrière toi…', voice: false }), 900); },
  footsteps(ev, f) {
    const g = ev.g; const p = ev.target(); const pts = [];
    if (f.path === 'behind') { const yaw = p.yaw ?? 0; for (let i = 0; i < 6; i++) pts.push(p.pos.clone().add(new THREE.Vector3(Math.sin(yaw) * (6 - i * 0.7), 0.05, Math.cos(yaw) * (6 - i * 0.7))).toArray()); }
    else if (f.path === 'above_security') { for (let i = 0; i < 8; i++) pts.push([-75 + i * 1.2, 4.9, R() * 2 - 1]); }
    else if (f.path === 'gallery_run') { for (let i = 0; i < 16; i++) pts.push([-40 + i * 3, 0.05, 2 * Math.sin(i * 0.6)]); }
    else { const base = ev.pos(f.where); const dir = new THREE.Vector3(R() - 0.5, 0, R() - 0.5).normalize(); for (let i = 0; i < (f.n || 8); i++) pts.push(base.clone().addScaledVector(dir, i * 0.8).setY(base.y - 1.1).toArray()); }
    g.sim.emit('footsteps', { pts, heavy: !!f.heavy, light: !!f.light });
  },
  power(ev, f) {
    const g = ev.g; const P = g.power;
    if (f.action === 'flicker') { g.sim.emit('flicker', { zones: g.world.zones.map(z => z.id), dur: f.dur || 2, sound: true }); return; }
    if (f.action === 'trip') { const c = f.circuit === 'gallery' ? 'gallery' : f.circuit; P.set({ breakers: { ...P.state.breakers, [c]: false } }); g.sim.emit('fx', { s: 'breaker', pos: g.world.points.breakers.toArray(), v: 1 }); return; }
    if (f.action === 'cut') {
      P.set({ mains: false });
      g.hooks.emit('blackout');
      if (f.dur > 0) setTimeout(() => P.set({ mains: true }), f.dur * 1000);
    }
  },
  car_alarm(ev, f) { const cars = ev.g.devices.kind('car'); if (cars.length) pick(cars).alarmOn(); },
  water(ev, f) { PRIM.device(ev, { ...f, kind: 'water' }); },
  cold(ev, f) { const pos = f.where ? ev.pos(f.where) : ev.target().pos; ev.g.sim.emit('cold', { pos: pos.toArray(), r: 7, dur: f.dur || 20 }); },
  uv_writing(ev, f) { const z = ev.zoneOf(f.where); const p = z ? z.randomPoint(R, 0.5) : ev.target().pos.clone(); ev.g.sim.emit('uvtext', { pos: p.setY((z?.min[1] || 0) + 1.5).toArray(), text: f.text || 'ICI', zone: z?.id }); },
  tv_message(ev, f) { const txt = Array.isArray(f.text) ? pick(f.text) : f.text; const tvs = f.where === 'all' ? ev.g.devices.kind('tv') : devicesIn(ev, f, ['tv']); for (const d of tvs) d.trigger({ text: txt, dur: 12 }); },
  print(ev, f) { PRIM.device(ev, { ...f, kind: 'printer' }); },
  pc_message(ev, f) { PRIM.device(ev, { ...f, kind: 'pc' }); },
  balloon(ev, f) { for (let i = 0; i < (f.count || 1); i++) ev.g.entities.balloon(ev.pos(f.where || 'gallery0')); },
  toy_parade(ev, f) { const g = ev.g; const robots = g.props.inZone('jouets').filter(p => p.defId === 'robot'); const sg = -1; robots.slice(0, 6).forEach((p, i) => setTimeout(() => { g.props.push(p, [0, 0.4, 0]); setTimeout(() => p.set({ data: { ...p.data, walk: 'walk', wyaw: 0, t: 25, speed: 0.3 } }), 800); }, i * 1200)); },
  mannequin_pose(ev, f) { ev.g.entities.mannequinPose(f.face); },
  screamer(ev, f) { const p = ev.target(); ev.g.sim.emit('screamer', { kind: f.kind, to: p.id }); },
  radio_voice(ev, f) { PRIM.device(ev, { kind: 'radio_voice' }); },
  rats(ev, f) { ev.g.entities.rats(ev.zoneOf(f.where)?.id || 'basement'); },
  pipe(ev, f) { const g = ev.g; for (let i = 0; i < 5; i++) setTimeout(() => g.sim.emit('fx', { s: 'pipe_knock', pos: [-72 + R() * 6, -2, R() * 30 - 15], v: 0.8 }), i * 450); },
  weather(ev, f) { ev.g.sim.emit('weather', { kind: f.kind }); },
  item_rain(ev, f) { const g = ev.g; const items = ['apple', 'orange', 'ball', 'toilet_paper', 'teddy', 'shoe_box', 'soda']; for (let i = 0; i < 6; i++) setTimeout(() => g.props.spawn(pick(items), [R() * 40 - 20, 6.3, (R() < 0.5 ? -1 : 1) * 3.6], { vel: [R() - 0.5, 0, (R() - 0.5)] }), i * 400); },
  cart_roll(ev, f) {
    const g = ev.g; const z = ev.zoneOf(f.where); let carts = g.props.find('shopping_cart');
    if (z) carts = carts.filter(c => z.contains(...c.state.pos, 2)); let c = carts[0];
    const pos = z ? z.randomPoint(R, 2).setY(z.min[1] + 0.5) : ev.target().pos.clone();
    if (!c) c = g.props.spawn('shopping_cart', pos.toArray(), { vel: [0, 0, 0] });
    if (c) { const b = g.props._ensureBody(c); setTimeout(() => g.props.push(c, [R() < 0.5 ? 2.2 : -2.2, 0, R() - 0.5]), 200); g.sim.emit('loopfx', { s: 'cart_roll', pos: c.state.pos, dur: 4 }); }
  },
  kids_laugh(ev, f) { const pos = ev.pos(f.where); ev.g.sim.emit('fx', { s: 'giggle', pos: pos.toArray(), v: 0.6 }); },
  entity(ev, f) { ev.g.entities.activate(f.type, f.action, f); },
  fire(ev, f) { const g = ev.g; const pos = f.where === 'shop:electro' && g.world.points.electroFire ? g.world.points.electroFire.clone() : ev.pos(f.where); if (f.cause === 'wiring' && !g.power.isOn('electro')) { g.story.outcome.fire = 'prevented'; return; } g.fire.ignite(pos, f.cause || 'inconnue'); },
  sparks(ev, f) { const g = ev.g; const pos = f.where === 'shop:electro' && g.world.points.electroFire ? g.world.points.electroFire : ev.pos(f.where); g.sim.emit('sparks', { pos: pos.toArray() }); },
  sprinkler(ev, f) { ev.g.sim.emit('loopfx', { s: 'sprinkler', pos: ev.pos(f.where).toArray(), dur: 10 }); },
  alarm(ev, f) { const z = ev.zoneOf(f.where); if (z?.shop) ev.g.sim.emit('siren', { shop: z.shop, on: true, reason: 'fausse alerte' }); setTimeout(() => z?.shop && ev.g.sim.emit('siren', { shop: z.shop, on: false }), 8000); },
  police_patrol(ev, f) { const g = ev.g; for (let i = 0; i < 6; i++) setTimeout(() => g.sim.emit('fx', { s: 'police_siren', pos: [100, 1, -60 + i * 24], v: 0.6 }), i * 700); },
  fountain(ev, f) { PRIM.device(ev, { kind: 'fountain', dur: 40 }); },
  escalator(ev, f) { PRIM.device(ev, { kind: 'escalator', dur: 30 }); },
};
