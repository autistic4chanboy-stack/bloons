// Synchronisation multijoueur (au-dessus de Net et Sim) :
// - avatars des autres gardiens (position lissée, posture, costume, lampe torche réelle, nom, bulle de chat) ;
// - envoi de l'état du joueur local (15 Hz) ;
// - état complet pour un joueur qui rejoint (monde, objets, présences, histoire, heure, feu) ;
// - état d'histoire périodique (pour la migration d'hôte) ;
// - chat de proximité et radio (talkie-walkie) ; déconnexion → la partie continue en solo.
import * as THREE from 'three';
import { Net } from './net.js';
import { ITEMS } from '../data/items.js';
import { COSTUMES } from '../data/costumes.js';
import { buildHumanoid, animateHumanoid, litHumanoid, torchLens, disposeHumanoid } from '../game/humanoid.js';
import { avatarOpts } from '../game/player.js';

const MAX_REMOTE_LIGHTS = 3;
const _lens = new THREE.Vector3();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function nameSprite(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  const draw = (t, bubble) => {
    x.clearRect(0, 0, 256, 64);
    x.font = bubble ? '18px sans-serif' : 'bold 22px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = Math.min(250, x.measureText(t).width + 18);
    x.fillStyle = bubble ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.5)'; x.beginPath(); x.roundRect ? x.roundRect(128 - w / 2, 12, w, 40, 10) : x.rect(128 - w / 2, 12, w, 40); x.fill();
    x.fillStyle = bubble ? '#111' : '#fff'; x.fillText(t.length > 26 ? t.slice(0, 25) + '…' : t, 128, 33);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(1.2, 0.3, 1); sp.renderOrder = 10;
  draw(text, false);
  sp.userData.draw = draw;
  return sp;
}

// Joueur distant : même interface minimale que Player pour le reste du jeu
export class RemotePlayer {
  constructor(game, id, info = {}) {
    this.game = game; this.id = id; this.isLocal = false; this.name = info.name || 'Gardien';
    this.alive = true; this.costume = info.costume || 'guard'; this.wear = { feet: null, head: null, face: null, body: null };
    this.body = { pos: [0, -100, 0], vel: [0, 0, 0] }; this.posV = new THREE.Vector3(); this.target = null;
    this.yaw = 0; this.pitch = 0; this.crouching = false; this.flashOn = false; this.flashKind = 0; this.mode = 'walk'; this.inVent = false;
    this.camView = null; this.stats = { health: 100, stamina: 100, stress: 0 }; this.held = null; this.invDefs = []; this.speed = 0; this.lastSeen = performance.now();
    this.light = null; this.chatT = 0;
    this.build();
  }
  build() {
    const g = this.game;
    if (this.avatar) { this.avatar.removeFromParent(); disposeHumanoid(this.avatar); } // (l'étiquette du nom, un sprite, est réutilisée)
    this.avatar = buildHumanoid(avatarOpts(this.costume, this.wear)); litHumanoid(this.avatar);
    this.label = this.label || nameSprite(this.name);
    this.label.position.set(0, 2.15, 0); this.avatar.add(this.label);
    this.beam = this.beam || new THREE.Mesh(new THREE.ConeGeometry(1.2, 7, 16, 1, true).translate(0, -3.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.frustumCulled = false; g.scene.add(this.beam);
    g.scene.add(this.avatar);
  }
  get pos() { return this.posV.set(this.body.pos[0], this.body.pos[1], this.body.pos[2]); }
  get heldDef() { return this.held ? ITEMS[this.held] || null : null; }
  hasItem(d) { return this.invDefs.includes(d) || this.held === d; }
  hasCostumeEffect(e) { return (COSTUMES[this.costume]?.effects || []).includes(e); }
  eyePos() { return this.pos.clone().add(new THREE.Vector3(0, this.crouching ? 1.0 : 1.6, 0)); }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  dropPos() { const f = this.forward(); const e = this.eyePos(); return [e.x + f.x * 0.6, e.y - 0.3, e.z + f.z * 0.6]; }
  damage() { } kill() { } scare() { } shake() { } revive() { this.alive = true; }
  apply(s) {
    this.lastSeen = performance.now();
    const first = !this.target;
    this.target = s.p; if (first) this.body.pos = [...s.p];
    this.tyaw = s.y; this.pitch = s.pi || 0; this.crouching = !!s.c; this.flashOn = !!s.f; this.flashKind = s.f || 0;
    this.held = s.h || null; this.invDefs = s.inv || []; this.alive = s.a !== 0; this.mode = s.m || 'walk'; this.inVent = !!s.v;
    this.camView = s.cv || null; this.stats.stress = s.st || 0;
    if (s.nm && s.nm !== this.name) { this.name = s.nm; this.label.userData.draw(this.name, false); }
    const wearKey = JSON.stringify(s.wear || {});
    if ((s.co && s.co !== this.costume) || wearKey !== this._wearKey) { this.costume = s.co || this.costume; this.wear = s.wear || this.wear; this._wearKey = wearKey; this.build(); }
    if (first) this.yaw = this.tyaw;
  }
  say(text) { this.label.userData.draw(text, true); this.chatT = 5; }
  update(dt) {
    if (this.target) {
      const b = this.body.pos; const k = Math.min(1, dt * 12);
      const ox = b[0], oz = b[2];
      if (Math.abs(this.target[0] - b[0]) + Math.abs(this.target[2] - b[2]) > 8) b.splice(0, 3, ...this.target);
      else { b[0] += (this.target[0] - b[0]) * k; b[1] += (this.target[1] - b[1]) * k; b[2] += (this.target[2] - b[2]) * k; }
      const sp = Math.hypot(b[0] - ox, b[2] - oz) / Math.max(dt, 1e-3); this.speed += (sp - this.speed) * Math.min(1, dt * 8);
      this.body.vel = [(b[0] - ox) / Math.max(dt, 1e-3), 0, (b[2] - oz) / Math.max(dt, 1e-3)];
      this.yaw += Math.atan2(Math.sin(this.tyaw - this.yaw), Math.cos(this.tyaw - this.yaw)) * k;
    }
    const a = this.avatar; const b = this.body.pos;
    a.position.set(b[0], b[1], b[2]); a.rotation.y = this.yaw + Math.PI;
    a.visible = this.mode !== 'hide' && this.mode !== 'spectate';
    animateHumanoid(a, dt, this.speed, !this.alive ? 'dead' : this.mode === 'sit' || this.mode === 'desk' ? 'sit' : this.crouching ? 'crouch' : this.flashOn ? 'flashlight' : 'auto', { pitch: this.pitch, holding: !!this.held });
    this._zt = (this._zt || 0) - dt;
    if (this._zt <= 0 && a.userData.zoneU) { this._zt = 0.3; const z = this.game.world.zoneAt(b[0], b[1] + 1, b[2]); if (z) a.userData.zoneU.value.copy(this.game.mats.zoneUniform(z.id).value); else a.userData.zoneU.value.setRGB(0, 0, 0); }
    if (this.chatT > 0) { this.chatT -= dt; if (this.chatT <= 0) this.label.userData.draw(this.name, false); }
    const camD = this.game.camera.position.distanceTo(this.pos);
    this.label.visible = camD < 28 && this.alive;
    // faisceau de la lampe
    const on = this.flashOn && this.alive && a.visible;
    this.beam.visible = on;
    if (on) { const f = this.forward(), L = torchLens(a, _lens), e = L || this.eyePos(); this.beam.position.copy(e).addScaledVector(f, L ? 0.04 : 0.3); this.beam.lookAt(e.clone().addScaledVector(f, 5)); }
  }
  dispose() { this.avatar.removeFromParent(); disposeHumanoid(this.avatar); this.beam.removeFromParent(); if (this.light) this.light.intensity = 0; }
}

export class Sync {
  constructor(game) {
    this.game = game; this.remotes = new Map(); this.sendT = 0; this.stateT = 0; this.joinedToast = new Set();
    // lampes des autres joueurs : pré-allouées (pas de recompilation des shaders quand quelqu'un rejoint)
    this.lights = [];
    for (let i = 0; i < MAX_REMOTE_LIGHTS; i++) { const l = new THREE.SpotLight(0xfff1d6, 0, 22, 0.42, 0.45, 1.25); l.castShadow = false; game.scene.add(l); game.scene.add(l.target); this.lights.push(l); }
    const S = game.sim;
    S.effect('sstate', (p) => this.applyStoryState(p));
    Net.on('ps', (m) => this.onPlayerState(m));
    Net.on('join', (m) => this.onJoin(m.player));
    Net.on('leave', (m) => this.onLeave(m.id));
    Net.on('host', (m) => this.onHost(m.id));
    Net.on('needfull', (m) => this.sendFull(m.from));
    Net.on('full', (m) => this.applyFull(m.s));
    Net.on('chat', (m) => this.onChat(m));
    Net.on('error', (m) => game.toast('Serveur : ' + (m.message || 'erreur'), 5));
    Net.on('saved', () => { /* sauvegarde du salon confirmée */ });
    Net.on('disconnect', () => this.onDisconnect());
    for (const p of Net.peers.values()) this.ensure(p.id, p);
  }
  get g() { return this.game; }

  ensure(id, info) {
    if (id === Net.myId) return null;
    let r = this.remotes.get(id);
    if (!r) { r = new RemotePlayer(this.game, id, info || Net.peers.get(id) || {}); this.remotes.set(id, r); this.game.players.set(id, r); }
    return r;
  }
  onJoin(p) {
    if (!p || p.id === Net.myId) return;
    this.ensure(p.id, p);
    this.game.toast('👤 ' + (p.name || 'Un gardien') + ' a rejoint la partie.', 4);
    this.game.ui.chatLine('★', (p.name || 'Un gardien') + ' a rejoint la partie.', 'sys');
  }
  onLeave(id) {
    const r = this.remotes.get(id); if (!r) return;
    this.game.toast('👤 ' + r.name + ' a quitté la partie.', 4);
    r.dispose(); this.remotes.delete(id); this.game.players.delete(id);
    this.game.hooks.emit('player_left', id);
  }
  onHost(id) {
    const g = this.game;
    if (id === Net.myId) { g.toast('Vous êtes maintenant l\'hôte de la partie (l\'ancien hôte est parti).', 6); g.hooks.emit('became_host'); }
    else g.toast('Nouvel hôte : ' + (this.remotes.get(id)?.name || id), 4);
  }
  onDisconnect() {
    const g = this.game;
    for (const id of [...this.remotes.keys()]) this.onLeave(id);
    g.toast('Connexion au serveur perdue : la partie continue en solo.', 8);
  }
  onPlayerState(m) {
    if (!m.from || m.from === Net.myId) return;
    const r = this.ensure(m.from);
    if (r && m.s) r.apply(m.s);
  }

  // ── état complet (hôte → nouveau joueur) ──
  sendFull(to) {
    const g = this.game; if (!Net.isHost || !to) return;
    const st = g.story;
    const data = {
      v: 1,
      story: { mode: st.mode, night: st.night, phase: st.phase, unlockedShops: [...st.unlockedShops], unlockedAreas: [...st.unlockedAreas], flags: g.flags, stats: st.stats, scripted: st.scripted.map(s => s.done ? 1 : 0), outcome: st.outcome, isDay: g.isDay, tutorial: st.tutorial },
      env: { minutes: g.env.minutes, timeScale: g.env.timeScale, weather: g.env.weather },
      world: g.world.serialize(), props: g.props.serializeRuntime(), ents: g.entities.serialize(),
      fire: g.fire.cells.map(c => [c.pos.x, c.pos.y, c.pos.z, c.size, c.zone]),
      discovered: Object.keys(g.discovered),
    };
    Net.sendFull(to, data);
    // équipement de base pour un gardien qui arrive en pleine nuit
    if (st.phase !== 'day') setTimeout(() => { g.props.giveNew('keys', to); g.props.giveNew('flashlight', to); }, 300);
  }
  applyFull(s) {
    const g = this.game; if (!s || Net.isHost) return;
    try {
      const st = g.story;
      st.applyNightEffect({ phase: 'reset', n: s.story.night, mode: s.story.mode, flags: s.story.flags, stats: s.story.stats });
      g.world.deserialize(s.world || {});
      g.props.deserializeRuntime(s.props || { list: [] });
      g.entities.deserialize(s.ents || { l: [] });
      st.phase = s.story.phase; st.mode = s.story.mode; st.night = s.story.night; g.night = st.night; g.mode = st.mode;
      st.unlockedShops = new Set(s.story.unlockedShops || []); st.unlockedAreas = new Set(s.story.unlockedAreas || []);
      st.outcome = s.story.outcome || st.outcome; st.tutorial = s.story.tutorial || null;
      g.isDay = !!s.story.isDay;
      g.env.setTime(s.env.minutes); g.env.timeScale = s.env.timeScale; if (s.env.weather) g.env.setWeather?.(s.env.weather);
      for (const k of s.discovered || []) g.discovered[k] = true;
      if (s.fire?.length) { g.fire.cells = s.fire.map(a => ({ pos: new THREE.Vector3(a[0], a[1], a[2]), size: a[3], zone: a[4] })); g.fire.refreshFx(); }
      if (s.story.scripted) this._scriptedMask = s.story.scripted;
      g.ui.card(st.mode === 'story' ? 'Nuit ' + st.night : 'Mode infini — nuit ' + st.night, 'Vous rejoignez la garde', 4);
      g.ui.setObjective(st.phase === 'day' ? 'Rejoignez Gérard au poste de sécurité.' : 'Surveillez le centre avec les autres gardiens jusqu\'à 6 h.');
      if (st.phase === 'day') g.player.spawn(g.world.points.spawnDay, g.world.points.spawnDayYaw ?? Math.PI / 2);
    } catch (e) { console.error('[sync] état complet', e); g.toast('Erreur de synchronisation : ' + e.message, 6); }
  }

  // ── état d'histoire périodique (permet à un nouvel hôte de reprendre) ──
  sendStoryState() {
    const g = this.game; const st = g.story;
    g.sim.emit('sstate', { ph: st.phase, n: st.night, mo: st.mode, min: +g.env.minutes.toFixed(2), ts: g.env.timeScale, day: g.isDay ? 1 : 0, sc: st.scripted.map(s => s.done ? 1 : 0), out: { robbery: st.outcome.robbery, fire: st.outcome.fire, thefts: st.outcome.thefts, policeCalls: st.outcome.policeCalls, recordGap: st.outcome.recordGap }, stats: st.stats, tut: st.tutorial ? st.tutorial.step : null }, { exceptHost: true });
  }
  applyStoryState(p) {
    const g = this.game; if (Net.isHost) return; const st = g.story;
    st.phase = p.ph; st.night = p.n; st.mode = p.mo; g.night = p.n; g.isDay = !!p.day;
    if (Math.abs(g.env.minutes - p.min) > 0.6 && Math.abs(g.env.minutes - p.min) < 1400) g.env.setTime(p.min);
    g.env.timeScale = p.ts;
    if (st.scripted && p.sc) p.sc.forEach((d, i) => { if (st.scripted[i]) st.scripted[i].done = !!d; });
    this._scriptedMask = p.sc;
    if (p.out) Object.assign(st.outcome, p.out);
    if (p.stats) st.stats = p.stats;
    if (p.tut !== null && p.tut !== undefined) st.tutorial = st.tutorial ? Object.assign(st.tutorial, { step: p.tut }) : { step: p.tut, wait: 0 };
  }

  // ── chat ──
  sendChat(text, channel = 'local') {
    const g = this.game; const p = g.player;
    if (!Net.online) { g.ui.chatLine(g.playerName, text); return; }
    Net.sendChat(text, channel, p.pos.toArray().map(v => +v.toFixed(1)));
    g.ui.chatLine((channel === 'radio' ? '📻 ' : '') + g.playerName, text, channel);
    if (channel === 'radio') g.sfx('static_burst', null, { volume: 0.3, bus: 'ui' });
  }
  onChat(m) {
    const g = this.game; const r = this.remotes.get(m.from);
    const name = m.name || r?.name || 'Gardien';
    if (m.channel === 'radio') {
      if (!g.player.hasItem('walkie') && !g.security.mode) { g.ui.chatLine('📻', '(grésillements — il vous faudrait un talkie-walkie)', 'sys'); return; }
      g.sfx('static_burst', null, { volume: 0.35, bus: 'ui' }); g.ui.chatLine('📻 ' + name, m.text, 'radio'); return;
    }
    const pos = Array.isArray(m.pos) ? new THREE.Vector3(...m.pos) : r?.pos;
    const d = pos ? pos.distanceTo(g.player.pos) : 0;
    if (d > 30) return;
    // à travers les murs, on comprend mal
    const walls = pos ? g.world.physics.countWalls(g.player.pos.toArray(), pos.toArray(), 3) : 0;
    const text = walls >= 2 ? m.text.replace(/[^\s]/g, (c, i) => (i % 3 ? '·' : c)) : m.text;
    g.ui.chatLine(name, text, '');
    r?.say(text);
  }

  // ── boucle ──
  update(dt) {
    const g = this.game;
    for (const r of this.remotes.values()) r.update(dt);
    this.assignLights();
    if (!Net.online) return;
    this.sendT += dt;
    if (this.sendT > 1 / 15) {
      this.sendT = 0;
      const s = g.player.stateForNet();
      s.nm = g.playerName;
      s.cv = g.security.fullscreen && g.security.mode && !g.security.playback ? g.security.selId : null;
      Net.sendPlayerState(s);
    }
    if (Net.isHost) { this.stateT += dt; if (this.stateT > 4) { this.stateT = 0; this.sendStoryState(); } }
  }
  assignLights() {
    const cam = this.game.camera.position;
    const list = [...this.remotes.values()].filter(r => r.flashOn && r.alive && r.avatar.visible).sort((a, b) => a.pos.distanceTo(cam) - b.pos.distanceTo(cam));
    this.lights.forEach((l, i) => {
      const r = list[i];
      if (!r) { l.intensity = 0; return; }
      const f = r.forward(), L = torchLens(r.avatar, _lens), e = L || r.eyePos();
      l.position.copy(e).addScaledVector(f, L ? 0.04 : 0.25); l.target.position.copy(e).addScaledVector(f, 6); l.target.updateMatrixWorld();
      l.intensity = 11; l.distance = 22;
    });
  }
}
