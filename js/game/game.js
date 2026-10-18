// Chef d'orchestre : construit le monde, branche les systèmes, gère la boucle de jeu et expose l'API
// utilisée par tous les modules (sons, effets répliqués, joueurs, drapeaux d'histoire…).
import * as THREE from 'three';
import { Renderer } from '../engine/renderer.js';
import { Input } from '../engine/input.js';
import { Materials, GLOBAL_UNIFORMS } from '../engine/materials.js';
import { LabelAtlas } from '../engine/atlas.js';
import { Audio } from '../engine/audio.js';
import { Music } from '../engine/music.js';
import { World } from '../world/world.js';
import { buildMall } from '../world/mall.js';
import { buildItemGeometry } from '../world/meshes.js';
import { PropSystem } from '../world/props.js';
import { DeviceFactory, ScreenManager } from '../world/devices.js';
import { PowerGrid, Lighting } from '../world/power.js';
import { Sim } from './sim.js';
import { Net } from '../net/net.js';
import { Player } from './player.js';
import { Interaction } from './interaction.js';
import { UI } from './ui.js';
import { Environment } from './environment.js';
import { Particles } from './particles.js';
import { Security } from './security.js';
import { Phone } from './phone.js';
import { Entities } from './entities.js';
import { EventSystem } from './events.js';
import { Story } from './story.js';
import { Fire } from './fire.js';
import { Alarms } from './alarms.js';
import { PhotoSystem } from './photo.js';
import { Sync } from '../net/sync.js';
import { registerBehaviorActions, Traps, ActiveProps } from './behaviors.js';
import { COSTUMES } from '../data/costumes.js';
import { Speech } from '../engine/speech.js';
import { ITEMS } from '../data/items.js';
import { SHOPS } from '../data/shops.js';
import { NIGHTS } from '../data/story.js';
import * as Save from './save.js';

export class Hooks {
  constructor() { this.map = new Map(); }
  on(n, fn) { if (!this.map.has(n)) this.map.set(n, []); this.map.get(n).push(fn); return () => this.off(n, fn); }
  off(n, fn) { const a = this.map.get(n); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(n, ...args) { const a = this.map.get(n); if (a) for (const fn of [...a]) { try { fn(...args); } catch (e) { console.error('[hook]', n, e); } } }
}

export class Game {
  constructor(canvas, settings) {
    this.canvas = canvas; this.settings = settings;
    this.hooks = new Hooks();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov || 72, window.innerWidth / window.innerHeight, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.renderer = new Renderer(canvas, settings);
    this.input = new Input(canvas);
    this.input.sensitivity = settings.sensitivity ?? 1;
    this.input.invertY = !!settings.invertY;
    this.sim = new Sim(this);
    this.clockTime = 0; this.time = 0;
    this.flags = {}; this.discovered = {};
    this.mode = 'story'; this.night = 1; this.isDay = false;
    this.lastSubtitle = '';
    this.paused = false; this.running = false;
    this.players = new Map();
    this.playerName = settings.playerName || 'Gardien';
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.resize();
  }

  async init(opts, progress = () => { }) {
    this.mode = opts.mode || 'story';
    this.night = opts.night || 1;
    progress(0.05, 'Initialisation du son…');
    Audio.init();
    Audio.setOcclusionFn((pos) => this.world ? this.world.physics.countWalls([this.camera.position.x, this.camera.position.y, this.camera.position.z], [pos.x, pos.y, pos.z], 3) : 0);
    Audio.setBusVolume('master', this.settings.volume ?? 0.9);
    Audio.setBusVolume('music', this.settings.musicVolume ?? 0.8);
    let screensMod = null;
    try { screensMod = await import('../screens/screens.js'); } catch (e) { console.warn('Module écrans indisponible', e); }
    this.screensModule = screensMod;
    try { const lp = await import('../screens/lockpick.js'); this.lockpickModule = lp; } catch (e) { /* */ }
    try { const kp = await import('../screens/keypad.js'); this.keypadModule = kp; } catch (e) { /* */ }
    progress(0.12, 'Textures procédurales…');
    await tick();
    this.atlas = new LabelAtlas();
    this.mats = new Materials(null);
    this.world = new World(this);
    this.props = new PropSystem(this);
    this.devices = new DeviceFactory(this);
    this.screens = new ScreenManager(this, screensMod);
    this.power = new PowerGrid(this.world);
    this.lighting = new Lighting(this);
    this.particles = new Particles(this);
    this.traps = new Traps(this);
    this.activeProps = new ActiveProps(this);
    this.sim.effect('obj', (p) => this.world.applyEffectState(p));
    this.registerEffects();
    progress(0.25, 'Construction du centre commercial…');
    await tick();
    this.building = true;
    buildMall(this.world);
    this.building = false;
    progress(0.55, 'Étiquetage de 2 000 produits…');
    await tick();
    // l'atlas doit être finalisé après la cuisson de toutes les géométries
    for (const def of Object.values(ITEMS)) buildItemGeometry(def, this.atlas);
    this.props.finalize();
    const atlasTex = this.atlas.finalize();
    this.mats.atlas = atlasTex;
    for (const [k, m] of this.mats.cache) if (k.startsWith('props|')) { m.map = atlasTex; m.needsUpdate = true; }
    progress(0.7, 'Systèmes…');
    await tick();
    this.env = new Environment(this);
    this.player = new Player(this, Net.myId);
    this.players.set(Net.myId, this.player);
    this.interaction = new Interaction(this);
    this.ui = new UI(this);
    this.photo = new PhotoSystem(this);
    this.alarms = new Alarms(this);
    this.fire = new Fire(this);
    this.security = new Security(this);
    this.phone = new Phone(this);
    this.entities = new Entities(this);
    this.events = new EventSystem(this);
    this.story = new Story(this);
    this.sync = new Sync(this);
    this.speech = Speech;
    Speech.init(); Speech.volume = voiceVol(this.settings);
    progress(0.85, 'Compilation des shaders…');
    await tick();
    this.world.resetAll();
    this.renderer.gl.compile(this.scene, this.camera);
    progress(1, 'Prêt.');
    this.registerActions();
    registerBehaviorActions(this);
    // événements émis par les écrans (ordinateurs, jeux)
    this.hooks.on('screen:discover', (d) => { if (d?.kind && d?.id) this.discover(d.kind, d.id); });
    this.hooks.on('screen:fragment', (d) => { if (d?.id) this.discover('fragment', d.id); });
    this.ready = true;
    return this;
  }

  // ── API commune ──
  camPos() { return this.camera.position.clone(); }
  sfx(name, pos, opts = {}) { try { return Audio.play(name, { pos, ...opts }); } catch (e) { return null; } }
  loop(name, pos, opts = {}) { try { return Audio.loop(name, { pos, ...opts }); } catch (e) { return { stop() { }, setPos() { }, setVolume() { }, setParam() { } }; } }
  music(style, opts = {}) { try { return Music.play(style, opts); } catch (e) { return { stop() { }, setPos() { }, setVolume() { }, setParam() { } }; } }
  toast(text, dur) { this.ui?.toast(text, dur); }
  playerById(id) { return this.players.get(id) || null; }
  get localPlayer() { return this.player; }
  allPlayers() { return [...this.players.values()]; }
  alivePlayers() { return this.allPlayers().filter(p => p.alive !== false); }
  isAreaUnlocked(area) { return this.story ? this.story.isAreaUnlocked(area) : true; }
  isShopUnlocked(shop) { return this.story ? this.story.isShopUnlocked(shop) : true; }
  flagSet(k, v) { this.flags[k] = v; this.hooks.emit('flag', k, v); }
  flagInc(k, n = 1) { this.flags[k] = (this.flags[k] || 0) + n; this.hooks.emit('flag', k, this.flags[k]); }
  discover(kind, id) { const k = kind + ':' + id; if (this.discovered[k]) return; this.discovered[k] = true; this.hooks.emit('discover', kind, id); Save.markDiscovered(k); }
  noise(pos, loud, kind) { this.entities?.hear(pos, loud, kind); }
  screenCtx() { return { time: () => this.clockString(), night: this.night, flags: this.flags, emit: (n, d) => this.hooks.emit('screen:' + n, d) }; }
  clockString() { return this.env ? this.env.hhmm() : '22:00'; }
  dayPickupAllowed(prop) { return prop.zone === 'security' || prop.zone === 'cafe' || !prop.home?.zone || this.story?.dayFree; }
  mapText() { return this.ui ? this.ui.mapText() : ''; }
  // Réplique : sous-titre + voix babillée (js/engine/speech.js). Avec opts.pos, la voix baisse avec la distance et les
  // murs : pleine à 4 m, muette au-delà de ~25 m ; au-delà de 35 m on n'entend plus rien du tout (pas de sous-titre non
  // plus). Sans position, la voix vient du personnage qui parle s'il est là (le plus proche portant ce nom ou tenant ce
  // rôle) : même atténuation, mais le sous-titre reste toujours. opts.channel : 'phone' (combiné), 'pa', 'radio', 'spk' ;
  // opts.voice === false : réplique muette (sauf si le personnage est là pour la dire)
  say(who, text, opts = {}) {
    let vol = 0.9, pos = opts.pos || null, walls = 0, src = null;
    const c = this.camera?.position;
    if (!pos && c && !opts.channel) { src = this.speakerOf(who); if (src) pos = src.pos; }
    if (pos && c) {
      const d = Math.hypot(pos[0] - c.x, pos[1] - c.y, pos[2] - c.z);
      if (d > 35 && !src) return;
      try { walls = this.world.physics.countWalls([c.x, c.y, c.z], pos, 3); } catch (e) { /* */ }
      vol *= Math.max(0, Math.min(1, 1 - (d - 4) / 21)) * Math.pow(0.45, walls);
      if (!src && (d > 15 || walls)) who = (who || '') + ' (au loin)';
    }
    this.lastSubtitle = text; this.ui?.subtitle(who, text, opts.dur);
    if ((opts.voice !== false || src) && this.settings.voices !== false && vol > 0.03) Speech.say(text, { who, volume: vol, pos, walls, channel: opts.channel, style: opts.style, pitch: opts.pitch, rate: opts.rate, fem: src?.f, seed: src?.v });
  }
  // personnage qui dit une réplique sans position : le plus proche portant ce nom (commerçants, clients nommés) ou tenant
  // ce rôle (braqueurs, police, pompiers, livreur, Gérard, clients) → { pos (tête), f (voix de femme), v (variante) }
  speakerOf(who) {
    const L = this.entities?.list; if (!L || !who) return null;
    const w = String(who).toLowerCase().trim(), c = this.camera.position;
    const role = /braqueur|parking/.test(w) ? 'robber' : /^polic/.test(w) ? 'police' : /^pompier/.test(w) ? 'fireman' : /^livreur/.test(w) ? 'visitor' : /^gérard/.test(w) ? 'gerard' : /^client/.test(w) ? 'shopper' : null;
    let best = null, bd = Infinity; // même très loin : il parle de là-bas (voix muette), pas dans l'oreille du joueur
    for (const e of L.values()) {
      if (!e.pos || e.camOnly) continue;
      if (role) { if (e.type !== role || (role === 'shopper' && !!e.o?.f !== (w === 'cliente'))) continue; }
      else { const n = String(e.o?.name || '').toLowerCase(); if (!n || (n !== w && !n.startsWith(w + ' ('))) continue; }
      const d = e.pos.distanceTo(c); if (d < bd) { bd = d; best = e; }
    }
    return best ? { pos: [best.pos.x, best.pos.y + 1.55 * (best.o?.h || 1.75) / 1.75, best.pos.z], f: !!best.o?.f, v: best.o?.v | 0 } : null;
  }
  mirrorLook(mirror, p) { this.story?.mirrorLook(mirror, p); }
  costumeDesc(c) { return COSTUMES[c]?.desc || ''; }
  applySettings(k) {
    const s = this.settings;
    if (k === 'volume') Audio.setBusVolume('master', s.volume);
    if (k === 'musicVolume') Audio.setBusVolume('music', s.musicVolume);
    if (k === 'voiceVolume') Speech.volume = voiceVol(s);
    if (k === 'voices' && s.voices === false) Speech.stop();
    if (k === 'sensitivity') this.input.sensitivity = s.sensitivity;
    if (k === 'invertY') this.input.invertY = s.invertY;
    if (k === 'renderScale' || k === 'quality' || k === 'autoScale') { this.renderer.dynScale = 1; this.renderer.resize(); }
    if (k === 'fov') { this.camera.fov = s.fov; this.camera.updateProjectionMatrix(); }
    this.hooks.emit('settings', k);
    this.onSettingsChanged?.(k);
  }
  get freePlay() { return this.mode === 'infinite' && this.settings.freeArcade; }

  registerEffects() {
    const S = this.sim;
    S.effect('fx', (p) => { const pos = p.pos ? new THREE.Vector3(...p.pos) : null; this.sfx(p.s, pos, { volume: p.v ?? 1, intensity: p.i ?? p.v ?? 1 }); });
    S.effect('toast', (p) => this.toast(p.text, p.dur));
    S.effect('say', (p) => this.say(p.who, p.text, { voice: p.voice === 'parrot' ? undefined : p.voice, style: p.voice === 'parrot' ? 'parrot' : undefined, pitch: p.pitch, rate: p.rate, pos: p.pos }));
    S.effect('note', (p) => Audio.note(p.instr, p.n, { pos: p.pos ? new THREE.Vector3(...p.pos) : null, volume: p.v ?? 0.8 }));
    S.effect('drum', (p) => Audio.drum(p.k, { pos: p.pos ? new THREE.Vector3(...p.pos) : null }));
    S.effect('flash', (p) => this.particles.flash(new THREE.Vector3(...p.pos)));
    S.effect('decal', (p) => this.particles.decal(p));
    S.effect('flour', (p) => { this.particles.flour(new THREE.Vector3(...p.pos)); this.entities?.revealAt(new THREE.Vector3(...p.pos), 6); this.sfx('hit_paper', new THREE.Vector3(...p.pos)); });
    S.effect('foam', (p) => this.particles.foam(new THREE.Vector3(...p.pos)));
    S.effect('hide', (p) => { const pl = this.playerById(p.id); if (pl) pl.setHidden(p.on, p); });
    S.effect('vent', (p) => { if (p.id === Net.myId) this.player.useGrate(this.world.get(p.grate), p.enter); });
    S.effect('night', (p) => this.story.applyNightEffect(p));
    S.effect('dialogue', (p) => this.story.applyDialogue(p));
  }

  registerActions() {
    const S = this.sim;
    S.action('interact', (p, actor) => {
      const o = this.world.get(p.id); if (!o) return;
      const pl = this.playerById(actor);
      if (pl && o.pickBox && pl.pos && !this._inReach(pl, o)) return; // anti-triche grossier
      o.interact(p.verb || 'use', actor, p);
    });
    S.action('door', (p, actor) => { const o = this.world.get(p.id); if (o) o.interact(p.verb, actor, p); });
    S.action('register', (p, actor) => { const o = this.world.get(p.id); if (o) o.interact('alt', actor, { lockpick: true, ok: p.ok, q: p.q }); });
    S.action('glass_open', (p, actor) => { const o = this.world.get(p.id); if (!o) return; if (p.fail) { this.sim.emit('fx', { s: 'lock_pick_fail', pos: o.mesh.position.toArray() }); if (Math.random() < 0.5) this.hooks.emit('alarm_trigger', { shop: o.o.shop, reason: 'case' }); return; } o.set({ broken: true, opened: true }); this.hooks.emit('case_opened', { pane: o, actor, q: p.q }); });
    S.action('claw_prize', (p) => { const o = this.world.get(p.id); if (o) this.props.spawn('prize_plush', o.wp([0.25, -o.def.s[1] * 0.35, 0.55]).toArray(), {}); });
    S.action('sfx', (p) => this.sim.emit('fx', p));
    S.action('note', (p) => this.sim.emit('note', p, { exceptHost: p.from === Net.myId }));
    S.action('drum', (p) => this.sim.emit('drum', p));
    S.action('smash', (p, actor) => { const o = this.world.get(p.id); if (o && o.smash) o.smash(actor, p.f || 1); });
    S.action('flag', (p) => { if (p.inc) this.flagInc(p.k, p.inc); else this.flagSet(p.k, p.v); });
    S.action('noise', (p) => this.noise(new THREE.Vector3(...p.pos), p.l, p.k));
    S.action('decal', (p) => this.sim.emit('decal', p));
    S.action('flour', (p) => this.sim.emit('flour', p));
    S.action('say', (p) => this.sim.emit('say', p));
  }
  _inReach(pl, o) { const b = o.pickBox; if (!b) return true; const p = pl.pos; const dx = Math.max(b.min[0] - p.x, 0, p.x - b.max[0]), dy = Math.max(b.min[1] - p.y - 1.6, 0, p.y - b.max[1]), dz = Math.max(b.min[2] - p.z, 0, p.z - b.max[2]); return Math.hypot(dx, dy, dz) < 4.5; }

  // ── Boucle ──
  start() {
    this.running = true; this._last = performance.now();
    const frame = () => {
      if (!this.running) return;
      requestAnimationFrame(frame);
      const now = performance.now(); let dt = (now - this._last) / 1000; this._last = now;
      if (dt > 0.1) dt = 0.1;
      try { this.update(dt); } catch (e) { console.error(e); this.ui?.error(e); }
    };
    requestAnimationFrame(frame);
  }
  stop() { this.running = false; }

  update(dt) {
    const paused = this.paused && !Net.online;
    const sdt = paused ? 0 : dt;
    this.time += sdt;
    GLOBAL_UNIFORMS.time.value = this.time;
    this.player.update(sdt, dt);
    if (!paused) {
      this.interaction.update(dt);
      if (Net.isHost) { this.story.update(sdt); this.events.update(sdt); this.entities.update(sdt); this.fire.update(sdt); this.alarms.update(sdt); }
      else this.entities.updateClient(sdt);
      this.props.update(sdt);
      this.activeProps.update(sdt);
      this.world.update(sdt, this.time);
      this.env.update(sdt);
      this.security.update(sdt);
      this.phone.update(sdt);
      this.particles.update(sdt);
      this.sync.update(sdt);
    }
    const cam = this.camera;
    this.world.cull(cam.position, this.security.cullExtras(), cam, this.settings.quality === 'low' ? 0.8 : 1);
    this.lighting.update(dt, cam.position);
    this.screens.update(dt, cam.position);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    Audio.setListener(cam.position, fwd, up);
    Audio.update(dt);
    this.ui.update(dt);
    // rendu
    if (this.security.fullscreen) this.security.renderFullscreen(dt);
    else { this.security.renderMonitors(dt); this.renderer.render(this.scene, cam, dt); }
    this.input.endFrame();
  }
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
function voiceVol(s) { const v = +(s.voiceVolume ?? 1); return isFinite(v) ? Math.max(0, Math.min(1.5, v)) : 1; } // volume du babillage des personnages
