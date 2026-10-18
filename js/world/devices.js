// Appareils fixes fonctionnels. Fabrique : game.devices.create(defId, zone, pos, ry, opts).
// Tous les états sont répliqués (WorldObject.set) ; les sons/visuels sont produits localement dans onState.
import * as THREE from 'three';
import { ARCADE_ART, DK } from './meshes_devices.js'; // formes détaillées des appareils (enregistrées avant toute cuisson)
import { WorldObject } from './world.js';
import { Box, LAYER } from '../engine/physics.js';
import { ITEMS } from '../data/items.js';
import { buildItemGeometry, itemMeta, quickGeometry } from './meshes.js';
import { Locker, Container, Seat, Readable, HideSpot, GlassPane } from './fixtures.js';
import { Net } from '../net/net.js';
import { LORE } from '../data/lore.js';

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const CHANNELS = ['channel:news', 'channel:weather', 'channel:cartoon', 'channel:shopping', 'channel:music', 'channel:testcard', 'channel:night', 'static'];
const CHANNEL_MUSIC = { 'channel:cartoon': 'kiddie', 'channel:music': 'disco', 'channel:shopping': 'muzak', 'channel:weather': 'hold_music', 'channel:news': 'radio_static_voice' };

// ───────────────────────── Gestionnaire d'écrans (canvas partagés) ─────────────────────────
const _sv = new THREE.Vector3(), byDist = (a, b) => a.dist - b.dist;
export class ScreenManager {
  constructor(game, mod) {
    this.game = game; this.mod = mod; this.shared = new Map(); this.users = new Map(); this.t = 0;
  }
  _create(kind, opts = {}) {
    let s = null;
    try { if (this.mod) s = this.mod.createScreen(kind, { ctx: this.game.screenCtx(), ...opts }); } catch (e) { console.warn('[screen]', kind, e); }
    if (!s) s = fallbackScreen(kind);
    const tex = new THREE.CanvasTexture(s.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    return { kind, screen: s, texture: tex, refs: new Set(), visible: false, last: 0 };
  }
  get(kind, user) {
    let e = this.shared.get(kind);
    if (!e) { e = this._create(kind); this.shared.set(kind, e); }
    if (user) e.refs.add(user);
    return e;
  }
  release(kind, user) { const e = this.shared.get(kind); if (e) e.refs.delete(user); }
  personal(kind, opts) { return this._create(kind, opts); }
  // met à jour les écrans visibles proches (budget limité)
  update(dt, camPos) {
    this.t += dt;
    const list = this._list || (this._list = []); list.length = 0; // tableau réutilisé (aucune allocation par image)
    for (const e of this.shared.values()) {
      let best = Infinity;
      for (const u of e.refs) { if (!u.screenMesh || !u.screenVisible()) continue; const d = u.screenMesh.getWorldPosition(_sv).distanceToSquared(camPos); if (d < best) best = d; }
      e.dist = best; if (best < 900) list.push(e);
    }
    list.sort(byDist);
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; const interval = i < 3 ? 0 : i < 8 ? 0.1 : 0.25;
      if (this.t - e.last < interval) continue;
      const step = this.t - e.last; e.last = this.t;
      try { e.screen.update(Math.min(0.25, step || dt)); e.texture.needsUpdate = true; } catch (err) { /* écran défaillant */ }
    }
  }
}

function fallbackScreen(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96; const ctx = c.getContext('2d');
  let t = 0;
  const s = { canvas: c, w: 128, h: 96, title: kind, wantsInput: false, update(dt) { t += dt; const img = ctx.createImageData(128, 96); for (let i = 0; i < img.data.length; i += 4) { const v = kind === 'off' ? 0 : Math.random() * 200; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } ctx.putImageData(img, 0, 0); if (kind.startsWith('msg:')) { ctx.fillStyle = '#000'; ctx.fillRect(0, 30, 128, 36); ctx.fillStyle = '#fff'; ctx.font = '700 16px monospace'; ctx.textAlign = 'center'; ctx.fillText(kind.slice(4), 64, 54); } }, key() { }, dispose() { } };
  s.update(0); return s;
}

// Écran de texte (messages fantômes sur les TV)
export function textScreen(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const ctx = c.getContext('2d'); let t = 0;
  const img = ctx.createImageData(256, 192); for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255; // neige réutilisée (pas de relecture du canvas)
  return { canvas: c, w: 256, h: 192, title: text, wantsInput: false, update(dt) { t += dt; for (let i = 0; i < img.data.length; i += 16) { const v = Math.random() * 60; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; } ctx.putImageData(img, 0, 0); ctx.fillStyle = Math.sin(t * 9) > -0.6 ? '#fff' : '#888'; ctx.font = '900 34px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const lines = String(text).split('\n'); lines.forEach((l, i) => ctx.fillText(l, 128 + (Math.random() - 0.5) * 2, 96 + (i - (lines.length - 1) / 2) * 38)); }, key() { }, dispose() { } };
}

// ───────────────────────── Accessoires modélisés (géométries partagées, matériau « props » éclairé par zone) ─────────────────────────
const GEO = new Map();
const shared = (key, atlas, fn) => { let g = GEO.get(key); if (!g) { g = quickGeometry(atlas, fn).geometry; GEO.set(key, g); } return g; };
// Moniteur LCD : dalle à cadre fin, coque arrière, colonne et pied ovale ; sh = hauteur du centre de l'écran au plan
// de pose (même encombrement que l'ancien moniteur : écran 0,5 × 0,36 m, pied 0,2 × 0,15 m)
function monitorGeometry(atlas, sh) {
  return shared('mon' + sh, atlas, (k) => {
    const { rbox, fq, lab } = DK, c = 0x1e1f21;
    rbox(k, 0, 0, 0.018, 0.5, 0.36, 0.024, 0.006, c);
    fq(k, 0, 0.006, 0.0304, 0.452, 0.312, 0x050607);
    fq(k, 0, -0.168, 0.0304, 0.05, 0.009, 0, 'Z', lab(k, 'monlogo', 40, 8, { kind: 'plain', bg: c, fg: 0x8a8d90, brand: 'ORION' }));
    fq(k, 0.21, -0.168, 0.0304, 0.004, 0.003, 0x40c4ff);
    rbox(k, 0, -0.01, -0.012, 0.32, 0.24, 0.036, 0.014, 0x262729, { skip: 'Z' });
    const ny0 = -0.06, ny1 = -sh + 0.015;
    rbox(k, 0, (ny0 + ny1) / 2, -0.035, 0.05, ny0 - ny1, 0.022, 0.008, 0x2b2c2e);
    rbox(k, 0, -sh + 0.0075, -0.02, 0.2, 0.015, 0.15, 0.007, 0x232426);
  });
}
// Assiette du tapis à sushis (pied, marli) garnie de deux nigiris
function sushiGeometry(atlas, col, i) {
  return shared('sushi' + col, atlas, (k) => {
    const { lat, rbox } = DK;
    lat(k, [[0.055, -0.02], [0.058, -0.016], [0.06, -0.014, col, 'h'], [0.094, -0.006], [0.1, -0.002], [0.096, 0.0], [0.09, -0.004, 0xf4f1ea, 'h'], [0.05, -0.012], [0.0005, -0.012]], col, { segs: 14, bot: col });
    const fish = [0xff8a65, 0xd84315, 0xfff3e0][i % 3];
    for (const dx of [-0.036, 0.036]) { rbox(k, dx, -0.0015, 0, 0.032, 0.021, 0.058, 0.009, 0xf5f2ea); rbox(k, dx, 0.011, 0, 0.036, 0.007, 0.064, 0.003, fish); }
  });
}
// Poisson d'aquarium : corps fuselé comprimé (tête vers +z), nageoire caudale et dorsale, yeux
function fishGeometry(atlas, col) {
  return shared('fish' + col, atlas, (k) => {
    const { lat, extX, M, fq } = DK;
    lat(k, [[0.0005, -0.03], [0.004, -0.026], [0.0065, -0.012], [0.007, 0.004], [0.0055, 0.02], [0.0028, 0.03], [0.0005, 0.034]], col, { segs: 8, rz: 2.3, m: M(0, 0, 0, Math.PI / 2, 0, 0) });
    extX(k, [[-0.026, 0], [-0.05, 0.016], [-0.044, 0], [-0.05, -0.016]], -0.001, 0.001, col);
    extX(k, [[-0.01, 0.012], [0.008, 0.015], [-0.004, 0.022]], -0.0008, 0.0008, col);
    for (const sx of [-1, 1]) fq(k, sx * 0.0058, 0.003, 0.022, 0.004, 0.004, 0x050505, sx > 0 ? 'X' : 'x');
  });
}
// Marquee lumineux d'une borne : titre en lettres néon sur fond dégradé étoilé, liseré (une texture par jeu)
const MARQUEES = new Map();
function marqueeTexture(art) {
  if (MARQUEES.has(art[3])) return MARQUEES.get(art[3]);
  const c = document.createElement('canvas'); c.width = 256; c.height = 72; const x = c.getContext('2d');
  const hex = (v) => '#' + (v & 0xffffff).toString(16).padStart(6, '0');
  const g = x.createLinearGradient(0, 0, 0, 72); g.addColorStop(0, hex(art[1])); g.addColorStop(0.5, '#05050a'); g.addColorStop(1, hex(art[1])); x.fillStyle = g; x.fillRect(0, 0, 256, 72);
  let s = art[3].length * 7919; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) { x.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.75})`; x.fillRect(rnd() * 256, rnd() * 72, 1.6, 1.6); }
  x.strokeStyle = hex(art[0]); x.lineWidth = 3; x.strokeRect(4, 4, 248, 64);
  let size = 36; const font = () => `900 ${size}px Impact, "Arial Black", "Liberation Sans", sans-serif`; x.font = font();
  while (x.measureText(art[3]).width > 228 && size > 14) { size -= 2; x.font = font(); }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = hex(art[0]); x.shadowBlur = 14; x.fillStyle = '#ffffff'; x.fillText(art[3], 128, 38);
  x.shadowBlur = 0; x.lineWidth = 1.5; x.strokeStyle = hex(art[0]); x.strokeText(art[3], 128, 38);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; MARQUEES.set(art[3], t); return t;
}

// Variante de géométrie d'un appareil : couleur imposée et plaque (voitures), armoire réfrigérée vitrée (hypermarché)
function variantDef(def, opts) {
  let v = def;
  if (opts.color) v = { ...v, id: v.id + '_' + opts.color.toString(16), c: opts.color };
  if (opts.plate) v = { ...v, id: v.id + '_' + opts.plate, plate: opts.plate };
  if (def.id === 'fridge' && opts.shop === 'hyper') v = { ...v, id: v.id + '_vitre', variant: 'vitre' };
  return v;
}

// ───────────────────────── Base ─────────────────────────
export class ItemFixture extends WorldObject {
  constructor(world, id, def, zone, pos, ry, opts = {}) {
    super(world, id, def.use);
    this.def = def; this.zone = zone; this.opts = opts; this.name = def.name; this.ry = ry; this.p = def.p || {};
    const g = world.game, vd = variantDef(def, opts);
    this.group = new THREE.Group(); this.group.position.copy(pos); this.group.rotation.y = ry;
    if (!opts.noMesh) {
      const geo = buildItemGeometry(vd, g.atlas);
      this.mesh = new THREE.Mesh(geo, g.mats.get('props', zone)); this.mesh.castShadow = true; this.mesh.receiveShadow = true;
      this.group.add(this.mesh);
    }
    this.meta = itemMeta(vd.id);
    (world.zone(zone)?.group || world.root).add(this.group);
    this.group.updateMatrixWorld(true);
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)); const hx = def.s[0] / 2, hy = def.s[1] / 2, hz = def.s[2] / 2;
    const ex = c * hx + s * hz, ez = s * hx + c * hz;
    this.ext = [ex, hy, ez];
    if (opts.collide !== false && def.s[1] > 0.12 && !this.noCollide) this.col = world.physics.add(new Box(pos.x - ex, pos.y - hy, pos.z - ez, pos.x + ex, pos.y + hy, pos.z + ez, def.s[1] > 0.5 ? LAYER.FURN : LAYER.FURN, this));
    this.setPick(pos.x - ex - 0.03, pos.y - hy - 0.03, pos.z - ez - 0.03, pos.x + ex + 0.03, pos.y + hy + 0.03, pos.z + ez + 0.03);
    this.init(this.initState(opts));
    this.timer = 0;
  }
  get g() { return this.world.game; }
  initState() { return {}; }
  wp(local) { return this.group.localToWorld(V3(local)); }
  get center() { return this.group.position.clone(); }
  powered() { return this.g.power.zoneOn(this.zone); }
  loopOn(name, opts = {}) { if (!this._loop) this._loop = this.g.loop(name, opts.pos || this.center, opts); return this._loop; }
  loopOff(f = 0.25) { if (this._loop) { this._loop.stop(f); this._loop = null; } }
  musicOn(style, opts = {}) { if (!this._music) this._music = this.g.music(style, { pos: opts.pos || this.center, volume: opts.volume ?? 0.6, seed: opts.seed }); }
  musicOff(f = 0.5) { if (this._music) { this._music.stop(f); this._music = null; } }
  fx(s, v = 1) { this.g.sim.emit('fx', { s, pos: this.center.toArray(), v }); }
  toast(actor, text) { this.g.sim.emit('toast', { text }, { to: actor }); }
  heldProp(ctx) { return ctx?.held ? this.g.props.get(ctx.held) : null; }
  // timer hôte
  startTimer(sec) { this.timer = sec; this.world.setActive(this, true); }
  update(dt) {
    if (this.timer > 0 && Net.isHost) { this.timer -= dt; if (this.timer <= 0) { this.timer = 0; this.timeout(); } }
    this.animate?.(dt);
  }
  timeout() { if (this.state.on) this.set({ on: false }); }
  trigger(params = {}) { if ('on' in this.state) { this.set({ on: true }); this.startTimer(params.dur || 20); } }
  prompt() { return this.name; }
  // ── écran ──
  makeScreen(spec, opts = {}) {
    const sp = spec || this.meta.screen; if (!sp) return null;
    const geo = new THREE.PlaneGeometry(sp.w, sp.h);
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000 }); mat.toneMapped = false;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(sp.x, sp.y, sp.z + 0.003); if (sp.tilt) m.rotation.x = sp.tilt; if (sp.top) m.rotation.x = -Math.PI / 2;
    (opts.parent || this.group).add(m);
    this.screenMesh = m; this.screenKind = null;
    return m;
  }
  screenVisible() { return this.group.visible !== false && (this.world.zone(this.zone)?.group.visible ?? true); }
  setScreen(kind, brightness = 1.25) {
    if (!this.screenMesh) return;
    if (this.screenKind && this.screenKind !== kind) this.g.screens.release(this.screenKind, this);
    this.screenKind = kind;
    const mat = this.screenMesh.material;
    if (!kind || kind === 'off') { mat.map = null; mat.color.setRGB(0.01, 0.01, 0.012); mat.needsUpdate = true; this.screenLight = null; return; }
    let e;
    if (kind.startsWith('msg:')) { e = this._msgScreen && this._msgScreen.kind === kind ? this._msgScreen : (() => { const s = textScreen(kind.slice(4)); const tex = new THREE.CanvasTexture(s.canvas); tex.colorSpace = THREE.SRGBColorSpace; const r = { kind, screen: s, texture: tex, refs: new Set([this]) }; this.g.screens.shared.set(kind + '#' + this.id, r); return r; })(); this._msgScreen = e; }
    else e = this.g.screens.get(kind, this);
    mat.map = e.texture; mat.color.setScalar(brightness); mat.needsUpdate = true;
    this.screenLight = kind === 'static' ? [0.5, 0.55, 0.6] : [0.4, 0.5, 0.8];
  }
  getLight() { if (!this.screenLight || !this.screenMesh) return null; const p = this.screenMesh.getWorldPosition(new THREE.Vector3()); const dir = new THREE.Vector3(0, 0, 0.6).applyQuaternion(this.group.quaternion); p.add(dir); return { pos: p, color: this.screenLight, intensity: 1.6, distance: 5, priority: 2.5 }; }
}

// ───────────────────────── Appareils simples ─────────────────────────
class LoopDev extends ItemFixture {
  initState() { return { on: false }; }
  prompt() { return (this.state.on ? 'E : Éteindre' : 'E : Allumer') + ' — ' + this.name; }
  interact(v, actor) { if (!this.powered()) { this.toast(actor, 'Pas de courant.'); return; } this.set({ on: !this.state.on }); if (this.p.dur && !this.state.on) this.startTimer(this.p.dur); }
  onState(p, r) {
    const snd = this.p.sound || (this.def.use === 'fryer' ? 'fryer' : this.def.use === 'boiler' ? 'electric_hum' : 'fan');
    if (this.state.on && !r) this.loopOn(snd, { volume: 0.6 }); else this.loopOff();
  }
}

class Boiler extends LoopDev {
  initState() { return { on: true, knocking: true }; }
  prompt(p) { return this.name + (this.state.knocking ? (p.heldDef?.p?.tool === 'wrench' ? '   E : Resserrer les tuyaux' : ' — les tuyaux cognent') : ' — ronronne'); }
  interact(v, actor) { const p = this.g.playerById(actor); if (p?.heldDef?.p?.tool === 'wrench' && this.state.knocking) { this.set({ knocking: false }); this.fx('pipe_knock'); this.toast(actor, 'Les tuyaux ne cognent plus. Pour l\'instant.'); } }
  onState(p, r) { if (this.state.on) this.loopOn('electric_hum', { volume: 0.25, ref: 1.5, maxDist: 9 }); else this.loopOff(); }
}

class TVDev extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) { super(world, id, def, zone, pos, ry, opts); this.makeScreen(); world.game.lighting.addSource(this); }
  initState(o) { return { on: !!o.autoOn, ch: o.channel ? Math.max(0, CHANNELS.indexOf(o.channel)) : (o.index || 0) % CHANNELS.length, msg: null, media: null }; }
  prompt() { return (this.state.on ? 'E : Éteindre   R : Chaîne suivante' : 'E : Allumer') + ' — ' + this.name; }
  interact(v, actor) {
    if (!this.powered()) { this.toast(actor, 'Pas de courant.'); return; }
    if (v === 'alt' && this.state.on) this.set({ ch: (this.state.ch + 1) % CHANNELS.length, msg: null });
    else this.set({ on: !this.state.on, msg: null });
  }
  trigger(params = {}) { if (params.text) { this.set({ on: true, msg: params.text }); this.startTimer(params.dur || 12); } else { this.set({ on: true, ch: CHANNELS.length - 1 }); this.startTimer(params.dur || 25); } }
  timeout() { this.set({ on: false, msg: null }); }
  kindNow() { const s = this.state; if (!s.on || !this.powered()) return 'off'; if (s.msg) return 'msg:' + s.msg; if (s.media) return s.media; return CHANNELS[s.ch]; }
  onState(p, r) {
    const k = this.kindNow(); this.setScreen(k);
    this.musicOff(0.2); this.loopOff(0.1);
    if (k === 'static') this.loopOn('tv_static', { volume: 0.35 });
    else if (k.startsWith('msg:')) this.loopOn('tv_static', { volume: 0.5 });
    else if (CHANNEL_MUSIC[k]) this.musicOn(CHANNEL_MUSIC[k], { volume: 0.25 });
    if ('on' in p && !r) this.g.sfx(p.on ? 'tv_on' : 'tv_off', this.center, { volume: 0.6 });
  }
}

class Microwave extends ItemFixture {
  initState() { return { on: false, item: null, door: 0 }; }
  get cookTime() { return this.p.oven ? (this.p.big ? 18 : 25) : 12; }
  prompt(p) {
    const s = this.state;
    if (s.on) return this.name + ' — en marche…   E : Arrêter';
    if (!s.item && p.heldDef && !p.heldDef.fixed) return 'E : Mettre ' + p.heldDef.name + ' dedans';
    if (s.item) return 'E : Lancer la cuisson   R : Sortir ' + (this.g.props.get(s.item)?.name || 'l\'objet');
    return this.name + ' (vide)';
  }
  interact(v, actor, ctx) {
    const s = this.state; const held = this.heldProp(ctx);
    if (s.on) { this.set({ on: false }); return; }
    if (v === 'alt' && s.item) { const pr = this.g.props.get(s.item); this.set({ item: null }); if (pr) pr.set({ where: 'held', owner: actor }); return; }
    if (!s.item && held) { held.set({ where: 'in', owner: this.id }); this.set({ item: held.id }); this.fx('microwave_ding', 0.0); return; }
    if (s.item) {
      if (!this.powered()) { this.toast(actor, 'Pas de courant.'); return; }
      this.set({ on: true }); this.startTimer(this.cookTime);
      const pr = this.g.props.get(s.item);
      if (pr && pr.def.mat === 'metal' && !this.p.oven) { this.g.hooks.emit('metal_in_microwave', { dev: this, actor }); }
    }
  }
  trigger(params) { this.set({ on: true }); this.startTimer(params.dur || 8); }
  timeout() {
    const s = this.state; this.set({ on: false });
    this.fx('microwave_ding', 1);
    const pr = s.item ? this.g.props.get(s.item) : null;
    if (pr) {
      const cook = pr.def.p?.cook || (pr.def.id === 'bread' ? 'toast' : pr.def.id === 'toast' ? 'burnt_toast' : null);
      if (cook && ITEMS[cook]) { pr.set({ where: 'gone' }); const n = this.g.props.spawn(cook, this.center.toArray(), { vel: null }); if (n) { n.set({ where: 'in', owner: this.id }); this.set({ item: n.id }); } }
    }
  }
  onState(p, r) { if (this.state.on && !r) this.loopOn(this.p.oven ? 'electric_hum' : 'microwave', { volume: 0.5 }); else this.loopOff(); }
  getLight() { if (!this.state.on) return null; return { pos: this.center, color: [1, 0.85, 0.5], intensity: 0.8, distance: 3, priority: 3 }; }
}

class Washer extends ItemFixture {
  static animatesMesh = true; // corps animé : hors des lots statiques (batchStaticMeshes)
  initState() { return { on: false }; }
  prompt() { return (this.state.on ? 'E : Arrêter' : 'E : Lancer un essorage') + ' — ' + this.name; }
  interact(v, actor, ctx) { if (!this.powered()) return this.toast(actor, 'Pas de courant.'); const held = this.heldProp(ctx); if (held?.defId === 'detergent' && this.state.on) { held.set({ where: 'gone' }); this.g.sim.emit('foam', { pos: this.center.toArray() }); return; } this.set({ on: !this.state.on }); if (this.state.on) this.startTimer(40); }
  onState(p, r) { if (this.state.on && !r) this.loopOn(this.def.id === 'dishwasher' ? 'washer' : 'washer', { volume: 0.6 }); else this.loopOff(); }
  animate(dt) { if (this.state.on && this.mesh) this.mesh.position.x = Math.sin(performance.now() * 0.06) * 0.004; }
}

const FRIDGE_STOCK = { hyper: ['milk', 'yogurt', 'juice', 'soda', 'cheese', 'water', 'lemonade'], staff: ['yogurt', 'coffee', 'canned_food', 'soda'], glacier: ['ice_cream', 'sundae'], security: ['soda', 'yogurt', 'water'] };
class Fridge extends ItemFixture {
  initState(o) { const shop = o.shop || 'x'; let stock = FRIDGE_STOCK[shop] || []; if (this.p.cold) stock = shop === 'glacier' ? FRIDGE_STOCK.glacier : ['frozen_pizza', 'ice_bag', 'ice_cream']; return { open: 0, stock: stock.length ? 6 : 0, kinds: stock }; }
  prompt() { return (this.state.open ? 'E : Fermer' : 'E : Ouvrir') + (this.state.open ? (this.state.stock ? '   R : Prendre quelque chose' : '   (vide — modèle d\'exposition)') : '') + ' — ' + this.name; }
  interact(v, actor) {
    const s = this.state;
    if (v === 'alt' && s.open && s.stock > 0) { this.set({ stock: s.stock - 1 }); this.g.props.giveNew(s.kinds[Math.floor(Math.random() * s.kinds.length)], actor); return; }
    this.set({ open: s.open ? 0 : 1 });
  }
  trigger() { this.set({ open: 1 }); }
  onState(p, r) { if ('open' in p && !r) this.g.sfx(p.open ? 'fridge_open' : 'fridge_close', this.center, { volume: 0.7 }); if (this.state.open) this.loopOn('fridge_hum', { volume: 0.4 }); else this.loopOff(); }
  getLight() { if (!this.state.open || !this.powered()) return null; return { pos: this.wp([0, 0, this.def.s[2] / 2 + 0.3]), color: [0.85, 0.92, 1], intensity: 1.5, distance: 4, priority: 2 }; }
}

class Dispenser extends ItemFixture {
  initState() { return { mode: 0, busy: false }; }
  get gives() { return this.p.gives || ['coffee', 'hot_choc', 'cappuccino', 'tea_cup']; }
  prompt() { const it = ITEMS[this.gives[this.state.mode % this.gives.length]]; return 'E : Servir — ' + it.name + (this.gives.length > 1 ? '   R : Changer' : '') + ' (' + this.name + ')'; }
  interact(v, actor) {
    if (v === 'alt') { this.set({ mode: (this.state.mode + 1) % this.gives.length }); this.fx('button', 0.4); return; }
    if (this.state.busy) return;
    if (!this.powered()) return this.toast(actor, 'Pas de courant.');
    this.set({ busy: true });
    const item = this.gives[this.state.mode % this.gives.length];
    setTimeout(() => { this.set({ busy: false }); this.g.props.giveNew(item, actor); }, 2600);
  }
  onState(p, r) { if (this.state.busy && !r) this.loopOn(this.p.sound || 'coffee_machine', { volume: 0.6 }); else this.loopOff(0.2); }
}

class Register extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) { super(world, id, def, zone, pos, ry, opts); this.makeScreen(); this.setScreen('pos', 0.9); this.drawer = null; }
  initState(o) { return { open: 0, cash: 120 + ((o.index || 0) * 73 + (o.shop || '').length * 41) % 380, scratched: false, picked: false, forced: false }; }
  prompt(p) {
    const s = this.state;
    if (s.open) return s.cash > 0 ? 'E : Prendre la recette (' + s.cash + ' €)   R : Refermer' : 'Caisse ouverte (vide)   R : Refermer';
    if (p.hasItem('master_key')) return 'Caisse — E : Ouvrir (passe-partout)';
    if (p.hasItem('lockpick')) return 'Caisse verrouillée — R : Crocheter (risqué)';
    if (p.heldDef?.p?.pry) return 'Caisse verrouillée — R : Forcer (laisse des traces)';
    return 'Caisse enregistreuse — verrouillée';
  }
  local(v, p) {
    if (v === 'alt' && !this.state.open && !p.hasItem('master_key') && p.hasItem('lockpick')) {
      this.g.ui.lockpick(3, (ok, q) => this.g.sim.do('register', { id: this.id, ok, q }));
      return true;
    }
    return false;
  }
  interact(v, actor, ctx) {
    const s = this.state; const p = this.g.playerById(actor);
    if (ctx?.lockpick) { if (ctx.ok) { this.set({ open: 1, picked: true, scratched: s.scratched || ctx.q < 0.5 }); this.g.hooks.emit('register_open', { reg: this, actor, method: 'lockpick', q: ctx.q }); } else { this.set({ scratched: true }); this.fx('lock_pick_fail'); this.g.hooks.emit('register_fail', { reg: this, actor }); } return; }
    if (s.open) {
      if (v === 'alt') { this.set({ open: 0 }); return; }
      if (s.cash > 0) { const val = s.cash; this.set({ cash: 0 }); this.g.props.giveNew('cash_drawer_money', actor, { value: val }); this.g.hooks.emit('theft', { actor, value: val, reg: this, shop: this.opts.shop, kind: 'register' }); }
      return;
    }
    if (p?.hasItem('master_key') && v === 'use') { this.set({ open: 1 }); this.g.hooks.emit('register_open', { reg: this, actor, method: 'key', q: 1 }); return; }
    if (v === 'alt' && p?.heldDef?.p?.pry) { this.set({ open: 1, forced: true, scratched: true }); this.fx('metal_screech'); this.g.noise(this.center, 0.8, 'force'); this.g.hooks.emit('register_open', { reg: this, actor, method: 'force', q: 0 }); this.g.hooks.emit('alarm_trigger', { shop: this.opts.shop, reason: 'register' }); return; }
    this.fx('door_locked', 0.5);
  }
  onState(p, r) { if ('open' in p && !r) this.g.sfx(p.open ? 'register_open' : 'register_close', this.center, { volume: 0.8 }); }
}

class ConsoleDev extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) {
    super(world, id, def, zone, pos, ry, opts);
    // moniteur posé sur la console (réduit à 0,8 : sa base repose sur le dessus de la console)
    const tvDef = ITEMS.crt_tv, ty = def.s[1] / 2 + tvDef.s[1] * 0.4;
    const tv = new THREE.Mesh(buildItemGeometry(tvDef, world.game.atlas), world.game.mats.get('props', zone));
    tv.position.set(0, ty, -0.12); tv.scale.setScalar(0.8); this.group.add(tv);
    const m = itemMeta('crt_tv').screen; this.makeScreen({ x: m.x * 0.8, y: ty + m.y * 0.8, z: -0.12 + m.z * 0.8, w: m.w * 0.8, h: m.h * 0.8 });
    world.game.lighting.addSource(this);
    this.setPick(this.pickBox.min[0] - 0.1, this.pickBox.min[1], this.pickBox.min[2] - 0.1, this.pickBox.max[0] + 0.1, this.pickBox.max[1] + 0.5, this.pickBox.max[2] + 0.1);
  }
  initState() { return { cart: null, on: false, attract: false }; }
  get game() { const pr = this.state.cart ? this.g.props.get(this.state.cart) : null; return pr?.def.p?.game || null; }
  prompt(p) {
    if (!this.state.cart && p.heldDef?.use === 'cartridge') return 'E : Insérer ' + p.heldDef.name;
    if (this.state.cart) return 'E : Jouer (' + (this.g.props.get(this.state.cart)?.name || '') + ')   R : Éjecter';
    return this.name + ' — insérez une cartouche';
  }
  local(v, p) { if (v === 'use' && this.state.cart && this.game && !p.heldDef?.use?.includes('cartridge')) { this.g.ui.playScreen(this, 'game:' + this.game); return true; } return false; }
  interact(v, actor, ctx) {
    const held = this.heldProp(ctx);
    if (v === 'alt' && this.state.cart) { const pr = this.g.props.get(this.state.cart); this.set({ cart: null, on: false }); pr?.set({ where: 'held', owner: actor }); this.fx('vcr_eject', 0.6); return; }
    if (!this.state.cart && held?.def.use === 'cartridge') { held.set({ where: 'in', owner: this.id }); this.set({ cart: held.id, on: true }); this.fx('console_boot', 0.7); }
  }
  trigger(p) { this.set({ attract: true }); this.startTimer(p.dur || 40); }
  timeout() { this.set({ attract: false }); }
  onState() { const on = this.powered() && (this.state.on || this.state.attract); this.setScreen(on ? (this.game ? 'game:' + this.game : 'boot:console') : 'off'); }
}

class Turntable extends ItemFixture {
  initState() { return { vinyl: null, playing: false, ghost: null }; }
  prompt(p) {
    if (!this.state.vinyl && p.heldDef?.use === 'vinyl') return 'E : Poser ' + p.heldDef.name;
    if (this.state.vinyl) return (this.state.playing ? 'E : Arrêter' : 'E : Lecture') + '   R : Reprendre le disque';
    return this.name + ' — posez un vinyle';
  }
  interact(v, actor, ctx) {
    const held = this.heldProp(ctx); const s = this.state;
    if (v === 'alt' && s.vinyl) { const pr = this.g.props.get(s.vinyl); this.set({ vinyl: null, playing: false }); pr?.set({ where: 'held', owner: actor }); return; }
    if (!s.vinyl && held?.def.use === 'vinyl') { held.set({ where: 'in', owner: this.id }); this.set({ vinyl: held.id, playing: true }); return; }
    if (s.vinyl) this.set({ playing: !s.playing });
  }
  trigger(p) { this.set({ ghost: p.genre || 'creepy_vinyl', playing: true }); this.startTimer(p.dur || 60); }
  timeout() { this.set({ ghost: null, playing: !!this.state.vinyl && false }); }
  onState(p, r) {
    this.musicOff(0.4); this.loopOff();
    const pr = this.state.vinyl ? this.g.props.get(this.state.vinyl) : null;
    const genre = this.state.ghost || pr?.def.p?.genre;
    if (this.state.playing && genre && this.powered() && !r) { this.musicOn(genre, { volume: 0.7, seed: genre.length }); this.loopOn('turntable_crackle', { volume: 0.25 }); if (genre === 'creepy_vinyl') this.g.discover('vinyl', 'creepy'); }
  }
  animate(dt) { }
}

class VCRDev extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) {
    super(world, id, def, zone, pos, ry, opts);
    const tvDef = ITEMS.crt_tv; const tv = new THREE.Mesh(buildItemGeometry(tvDef, world.game.atlas), world.game.mats.get('props', zone));
    tv.position.set(0, def.s[1] / 2 + tvDef.s[1] / 2, -0.05); this.group.add(tv);
    const m = itemMeta('crt_tv').screen; this.makeScreen({ x: m.x, y: def.s[1] / 2 + tvDef.s[1] / 2 + m.y, z: -0.05 + m.z, w: m.w, h: m.h });
    world.game.lighting.addSource(this);
    this.setPick(this.pickBox.min[0] - 0.1, this.pickBox.min[1], this.pickBox.min[2] - 0.1, this.pickBox.max[0] + 0.1, this.pickBox.max[1] + 0.55, this.pickBox.max[2] + 0.1);
  }
  initState() { return { tape: null, playing: false, on: false, ghost: null }; }
  tapeId() { if (this.state.ghost) return this.state.ghost; const pr = this.state.tape ? this.g.props.get(this.state.tape) : null; return pr?.def.p?.tape || null; }
  prompt(p) {
    if (!this.state.tape && p.heldDef?.use === 'vhs') return 'E : Insérer ' + p.heldDef.name;
    if (this.state.tape) return (this.state.playing ? 'E : Pause' : 'E : Lecture') + '   R : Éjecter';
    return 'E : ' + (this.state.on ? 'Éteindre' : 'Allumer') + ' — ' + this.name;
  }
  local(v, p) { return false; }
  interact(v, actor, ctx) {
    const held = this.heldProp(ctx); const s = this.state;
    if (v === 'alt' && s.tape) { const pr = this.g.props.get(s.tape); this.set({ tape: null, playing: false }); pr?.set({ where: 'held', owner: actor }); this.fx('vcr_eject', 0.7); return; }
    if (!s.tape && held?.def.use === 'vhs') { held.set({ where: 'in', owner: this.id }); this.set({ tape: held.id, playing: true, on: true }); this.fx('vcr_insert', 0.7); this.g.hooks.emit('vhs_play', { dev: this, tape: held.def.p.tape, actor }); return; }
    if (s.tape) { this.set({ playing: !s.playing, on: true }); if (!s.playing) this.g.hooks.emit('vhs_play', { dev: this, tape: this.tapeId(), actor }); return; }
    this.set({ on: !s.on });
  }
  trigger(p) { this.set({ ghost: p.tape || 'no_label', playing: true, on: true }); this.startTimer(p.dur || 90); this.g.hooks.emit('vhs_play', { dev: this, tape: p.tape || 'no_label', actor: null }); }
  timeout() { this.set({ ghost: null, playing: false }); }
  onState(p, r) {
    const t = this.tapeId();
    const k = !this.state.on || !this.powered() ? 'off' : (this.state.playing && t ? 'vhs:' + t : 'blue');
    this.setScreen(k);
    this.loopOff(); if (this.state.playing && !r) this.loopOn('vcr_whirr', { volume: 0.25 });
    this.musicOff(0.3);
    const MUS = { cartoon: 'kiddie', aerobic: 'disco', karaoke: 'chanson', western: 'cinema_score', scifi: 'synthwave', horror: 'creepy_vinyl', kungfu: 'funk', birthday: 'music_box', nature: 'ambient', cooking: 'piano_bar', bobby_ad: 'kiddie', no_label: 'music_box_wrong', security_1987: null, gerard: null };
    if (this.state.playing && t && MUS[t] && !r) this.musicOn(MUS[t], { volume: 0.35 });
    if (this.state.playing && t && (t === 'security_1987' || t === 'no_label')) this.loopOn('tv_static', { volume: 0.2 });
  }
}

class ArcadeDev extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) {
    super(world, id, def, zone, pos, ry, opts); this.makeScreen();
    if (this.meta.marquee) {
      const mq = this.meta.marquee, art = def.shape === 'claw' ? ARCADE_ART.claw : def.s[0] > 1 ? ARCADE_ART.dance : (ARCADE_ART[this.p.game] || ARCADE_ART.invaders);
      const mm = new THREE.Mesh(new THREE.PlaneGeometry(mq.w, mq.h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), map: marqueeTexture(art) }));
      mm.position.set(mq.x, mq.y, mq.z + 0.006); this.group.add(mm); this.marquee = mm;
    }
    world.game.lighting.addSource(this);
  }
  initState() { return { attract: true, ghost: false }; }
  get gameId() { return this.p.game || 'invaders'; }
  prompt(p) { return 'E : Jouer — ' + this.name + (this.needsToken(p) ? ' (1 jeton ou 1 pièce)' : ''); }
  needsToken(p) { return !this.g.freePlay; }
  local(v, p) {
    if (v !== 'use') return false;
    if (!this.powered()) { this.g.toast('Hors tension.'); return true; }
    if (this.needsToken(p)) {
      const tok = p.inv.findDef('token') || p.inv.findDef('coin');
      if (!tok) { this.g.toast('Il faut un jeton (distributeur à l\'entrée de l\'arcade) ou une pièce.'); return true; }
      this.g.sim.do('consume', { id: tok }); this.g.sfx('coin_insert', this.center);
    }
    this.g.ui.playScreen(this, 'game:' + this.gameId);
    return true;
  }
  trigger(p) { this.set({ ghost: true }); this.startTimer(p.dur || 20); }
  timeout() { this.set({ ghost: false }); }
  onState(p, r) {
    const on = this.powered() && this.state.attract;
    this.setScreen(on ? 'game:' + this.gameId : 'off', 1.4);
    if (this.marquee) this.marquee.visible = on;
    if (this.state.ghost && !r) this.loopOn('arcade_ambient', { volume: 0.6 }); else this.loopOff();
  }
  getLight() { if (!this.powered() || !this.state.attract) return null; return { pos: this.wp([0, this.def.s[1] * 0.2, 0.7]), color: [0.6, 0.3, 0.9], intensity: 1.2, distance: 4, priority: 3 }; }
}
class ClawDev extends ArcadeDev {
  get gameId() { return 'claw'; }
  trigger(p) { this.fx('claw_machine', 0.8); if (Net.isHost && Math.random() < 0.5) this.g.props.spawn('prize_plush', this.wp([0.2, -this.def.s[1] * 0.35, 0.5]).toArray(), {}); }
  onScreenEvent(name, data) { if (name === 'claw_win') this.g.sim.do('claw_prize', { id: this.id }); }
}

class Kiddie extends ItemFixture {
  static animatesMesh = true;
  initState() { return { on: false }; }
  prompt(p) { return this.state.on ? 'Le Bobby-Mobile tourne…' : 'E : Insérer une pièce — ' + this.name; }
  local(v, p) { if (v === 'use' && !this.state.on) { const c = p.inv.findDef('coin') || p.inv.findDef('token'); if (!c) { this.g.toast('Il faut une pièce.'); return true; } this.g.sim.do('consume', { id: c }); this.g.sfx('coin_insert', this.center); } return false; }
  interact(v, actor) { if (!this.state.on && this.powered()) { this.set({ on: true }); this.startTimer(30); } }
  trigger(p) { if (this.powered() || true) { this.set({ on: true }); this.startTimer(p.dur || 15); } }
  onState(p, r) { if (this.state.on && !r) this.musicOn('kiddie', { volume: 0.7 }); else this.musicOff(0.8); this.world.setActive(this, true); }
  animate(dt) { if (this.mesh) { const t = performance.now() / 1000; this.mesh.rotation.z = this.state.on ? Math.sin(t * 3) * 0.08 : this.mesh.rotation.z * 0.9; this.mesh.position.y = this.state.on ? Math.abs(Math.sin(t * 3)) * 0.03 : 0; } }
}

class TokenMachine extends ItemFixture {
  prompt() { return 'E : Échanger une pièce de 2 € contre 5 jetons'; }
  local(v, p) { const c = p.inv.findDef('coin'); if (!c) { this.g.toast('Il vous faut une pièce de 2 €.'); return true; } this.g.sim.do('consume', { id: c }); this.g.sim.do('interact', { id: this.id, verb: 'use' }); return true; }
  interact(v, actor) { this.fx('coins', 0.8); for (let i = 0; i < 5; i++) this.g.props.giveNew('token', actor); }
}

class PianoDev extends ItemFixture {
  prompt() { return 'E : Jouer — ' + this.name; }
  local(v, p) { this.g.ui.instrument(this, this.p.instr || 'piano'); return true; }
  trigger(p) {
    // le piano joue tout seul (« Au clair de la lune »)
    const mel = [60, 60, 60, 62, 64, 62, 60, 64, 62, 62, 60];
    mel.forEach((n, i) => setTimeout(() => this.g.sim.emit('note', { instr: this.p.instr || 'piano', n, pos: this.center.toArray(), v: 0.6 }), i * 520 + (i === 3 || i === 7 ? 260 : 0)));
  }
}
class DrumDev extends ItemFixture {
  prompt() { return 'E : Jouer de la batterie'; }
  local(v, p) { this.g.ui.instrument(this, 'drums'); return true; }
  trigger() { [0, 1, 2, 3, 4, 5].forEach(i => setTimeout(() => this.g.sim.emit('drum', { k: i % 2 ? 'kick' : 'crash', pos: this.center.toArray() }), i * 900)); }
}

class Photobooth extends ItemFixture {
  initState() { return { busy: false }; }
  prompt() { return this.state.busy ? 'Photomaton — en cours…' : 'E : Prendre 4 photos'; }
  local(v, p) { if (!this.state.busy) this.g.photo.booth(this, p); return true; }
  interact(v, actor, ctx) { if (ctx?.strip) { this.g.props.giveNew('polaroid_strip', actor, { photo: ctx.strip }); } }
  trigger() { for (let i = 0; i < 4; i++) setTimeout(() => this.g.sim.emit('flash', { pos: this.wp(this.meta.flash || [0, 0.5, 0]).toArray() }), i * 900); }
}

const FILMS = ['cinema:silent', 'cinema:creepy'];
class Projector extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) {
    super(world, id, def, zone, pos, ry, opts);
    const ctl = world.shops?.[opts.shop]; const sc = ctl?.screen;
    if (sc) {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(sc.w, sc.h), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      scr.position.set(sc.x, sc.y, sc.z); scr.rotation.y = sc.ry; (world.zone(zone)?.group || world.root).add(scr); this.screenMesh = scr; this.bigScreen = sc;
      // toile éteinte : surface mate claire éclairée par la salle (et noire quand la salle l'est), l'image projetée
      // reste un matériau lumineux
      this.onMat = scr.material; this.offMat = world.game.mats.get('plaster_e2e2de', zone);
      // faisceau
      const len = Math.abs(sc.z - pos.z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(sc.w * 0.5, len, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0x8899bb, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.position.set(sc.x, (pos.y + sc.y) / 2, (pos.z + sc.z) / 2); cone.rotation.x = (sc.z > pos.z ? -1 : 1) * Math.PI / 2; cone.rotation.y = Math.PI / 4; cone.visible = false;
      cone.material.forceSinglePass = true; // additif : une seule passe suffit (même image)
      (world.zone(zone)?.group || world.root).add(cone); this.beam = cone;
    }
    world.game.lighting.addSource(this);
  }
  initState() { return { on: false, film: 0 }; }
  prompt() { return (this.state.on ? 'E : Arrêter la projection   R : Changer de film' : 'E : Lancer la projection') + ' — ' + this.name; }
  interact(v, actor) { if (!this.powered()) return this.toast(actor, 'Pas de courant.'); if (v === 'alt') this.set({ film: (this.state.film + 1) % FILMS.length }); else this.set({ on: !this.state.on }); }
  trigger(p) { this.set({ on: true, film: 1 }); this.startTimer(p.dur || 120); }
  screenVisible() { return true; }
  onState(p, r) {
    if (this.onMat) this.screenMesh.material = this.onMat;
    this.setScreen(this.state.on ? FILMS[this.state.film] : 'off', 1.1);
    if (this.offMat && !this.state.on) this.screenMesh.material = this.offMat;
    if (this.beam) this.beam.visible = this.state.on;
    if (this.state.on && !r) { this.loopOn('projector', { volume: 0.5 }); this.musicOff(0.1); if (this.bigScreen) this.musicOn(this.state.film === 0 ? 'piano_bar' : 'cinema_score', { pos: new THREE.Vector3(this.bigScreen.x, this.bigScreen.y, this.bigScreen.z), volume: 0.6 }); }
    else { this.loopOff(); this.musicOff(); }
  }
  getLight() { if (!this.state.on || !this.bigScreen) return null; const s = this.bigScreen; return { pos: new THREE.Vector3(s.x, s.y, s.z + (s.z > 0 ? -2 : 2)), color: [0.7, 0.75, 0.9], intensity: 4, distance: 14, priority: 2 }; }
}

class Aquarium extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) {
    super(world, id, def, zone, pos, ry, opts);
    this.fish = [];
    if (this.meta.fish) {
      const cols = [0xff7043, 0xffeb3b, 0x29b6f6, 0xe91e63, 0x76ff03, 0xffffff];
      for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(fishGeometry(world.game.atlas, cols[i % cols.length]), world.game.mats.get('props', zone)); f.scale.setScalar(0.8 + (i % 3) * 0.25); this.group.add(f); this.fish.push({ m: f, a: Math.random() * 6, r: 0.2 + Math.random() * 0.3, y: (Math.random() - 0.5) * def.s[1] * 0.5, s: 0.5 + Math.random() }); }
    }
    world.setActive(this, true); world.game.lighting.addSource(this);
    this.excite = 0;
  }
  initState() { return { fed: 0 }; }
  prompt(p) { return p.heldDef?.use === 'fish_food' && this.meta.fish ? 'E : Nourrir les poissons' : 'E : Tapoter la vitre — ' + this.name; }
  interact(v, actor, ctx) { const held = this.heldProp(ctx); if (held?.def.use === 'fish_food') { this.set({ fed: this.state.fed + 1 }); this.g.flagInc('fish_fed'); } else this.fx('hit_glass', 0.25); }
  onState(p, r) { if (!r) this.excite = 4; }
  animate(dt) {
    const t = performance.now() / 1000; this.excite = Math.max(0, this.excite - dt);
    const W = this.def.s[0] * 0.42, D = this.def.s[2] * 0.35;
    for (const f of this.fish) { f.a += dt * f.s * (1 + this.excite); const x = Math.cos(f.a) * W, z = Math.sin(f.a * 0.7) * D; f.m.position.set(x, f.y + (this.excite ? 0.15 : 0) * Math.sin(t * 5 + f.a), z); f.m.rotation.y = -f.a; }
    if (this.fish.length && !this._bub) this._bub = this.g.loop('fish_bubble', this.center, { volume: 0.2, ref: 1, maxDist: 8 });
  }
  getLight() { if (!this.powered()) return null; return { pos: this.wp([0, this.def.s[1] * 0.4, 0.3]), color: this.meta.fish ? [0.3, 0.7, 1] : [1, 0.7, 0.4], intensity: 1.0, distance: 4, priority: 3 }; }
}

const PARROT_HINTS = ['Lucie ! Lucie !', 'Cache-cache ! Cache-cache !', 'Un, neuf, huit, sept !', 'Sous-sol ! Sous-sol !', 'Bobby gentil ! Bobby gentil !', 'Ferme la porte ! Ferme la porte !', 'Gérard ! Bonne nuit Gérard !', 'Au clair de la lune !'];
class Parrot extends ItemFixture {
  initState() { return { fed: 0 }; }
  prompt(p) { return p.heldDef?.use === 'bird_seed' ? 'E : Nourrir Coco' : 'E : Parler à Coco'; }
  interact(v, actor, ctx) {
    const held = this.heldProp(ctx);
    let line;
    if (held?.def.use === 'bird_seed') { this.set({ fed: this.state.fed + 1 }); line = PARROT_HINTS[this.state.fed % PARROT_HINTS.length]; }
    else line = this.g.lastSubtitle ? this.g.lastSubtitle.slice(0, 60) : 'Coco ! Coco !';
    this.g.sim.emit('say', { who: 'Coco', text: line, pos: this.center.toArray(), voice: 'parrot' });
    this.fx('parrot', 0.8);
  }
  trigger() { this.interact('use', null, {}); }
}
class Hamster extends ItemFixture {
  initState() { return { on: false }; }
  prompt() { return 'E : Réveiller le hamster'; }
  interact() { this.set({ on: true }); this.startTimer(12); }
  trigger(p) { this.set({ on: true }); this.startTimer(p.dur || 15); }
  onState(p, r) { if (this.state.on && !r) this.loopOn('rattle', { volume: 0.3 }); else this.loopOff(); }
}

class SpinChair extends ItemFixture {
  static animatesMesh = true;
  initState() { return { spin: 0 }; }
  prompt() { return 'E : S\'asseoir et tourner'; }
  local(v, p) { p.sit(this.center.clone().add(new THREE.Vector3(0, 0.05, 0)), this.ry, true); return true; }
  trigger(p) { this.set({ spin: 1 }); this.startTimer(p.dur || 12); }
  timeout() { this.set({ spin: 0 }); }
  onState() { this.world.setActive(this, true); }
  animate(dt) { if (this.state.spin && this.mesh) this.mesh.rotation.y += dt * 1.5; }
}
class Massage extends ItemFixture {
  initState() { return { on: false }; }
  prompt() { return this.state.on ? 'Massage en cours…' : 'E : Massage (1 pièce)'; }
  local(v, p) { if (this.state.on) return true; const c = p.inv.findDef('coin'); if (!c && !this.ghostOk) { this.g.toast('Une pièce de 2 € pour 2 minutes de bonheur.'); return true; } this.g.sim.do('consume', { id: c }); p.sit(this.center, this.ry); p.stats.stress = Math.max(0, p.stats.stress - 35); return false; }
  interact() { this.set({ on: true }); this.startTimer(30); }
  trigger(p) { this.set({ on: true }); this.startTimer(p.dur || 20); }
  onState(p, r) { if (this.state.on && !r) this.loopOn('massage_chair', { volume: 0.5 }); else this.loopOff(); }
}
class Bike extends ItemFixture {
  prompt() { return 'E : Pédaler'; }
  local(v, p) { p.sit(this.center.clone().add(new THREE.Vector3(0, 0.3, 0)), this.ry); this.g.toast('Vous pédalez. Le compteur affiche 0,1 W. Le centre vous remercie.'); this.g.sfx('skate_roll', this.center); p.stats.stamina = Math.max(0, p.stats.stamina - 20); return true; }
}
class Hoop extends ItemFixture {
  initState() { return { score: 0 }; }
  constructor(world, id, def, zone, pos, ry, opts) { super(world, id, def, zone, pos, ry, opts); world.setActive(this, true); this.ring = this.wp([0, def.s[1] * 0.2, -def.s[2] * 0.3]); this.cool = 0; }
  prompt() { return this.name + ' — score : ' + this.state.score + ' (lancez un ballon dedans)'; }
  animate(dt) {
    if (!Net.isHost) return; this.cool -= dt; if (this.cool > 0) return;
    for (const pr of this.g.props.awake) { if (pr.def.use !== 'ball' || !pr.body) continue; const b = pr.body; if (b.vel[1] < -0.5 && Math.hypot(b.pos[0] - this.ring.x, b.pos[2] - this.ring.z) < 0.22 && Math.abs(b.pos[1] - this.ring.y) < 0.15) { this.set({ score: this.state.score + 1 }); this.fx('success', 0.8); this.cool = 1; } }
  }
}

class Safe extends ItemFixture {
  initState(o) { const c = o.contents || (o.shop === 'direction' ? ['cash', 'b13_key', 'usb_key'] : o.shop === 'bijouterie' ? ['diamond_ring', 'watch', 'cash', 'cash'] : ['cash']); return { open: 0, code: o.code || (o.shop === 'direction' ? '1411' : o.shop === 'bijouterie' ? '7319' : '0000'), contents: [...c], cracked: false }; }
  prompt() { return this.state.open ? (this.state.contents.length ? 'E : Prendre   R : Refermer' : 'Coffre vide   R : Refermer') : 'E : Composer le code — ' + this.name; }
  local(v, p) { if (!this.state.open && v === 'use') { this.g.ui.keypad(this.name, 4, (code) => { if (code) this.g.sim.do('interact', { id: this.id, verb: 'code', code }); }); return true; } return false; }
  interact(v, actor, ctx) {
    const s = this.state;
    if (v === 'code') { if (ctx.code === s.code) { this.set({ open: 1 }); this.fx('lock_open'); } else this.fx('error', 0.6); return; }
    if (!s.open) return;
    if (v === 'alt') { this.set({ open: 0 }); return; }
    if (s.contents.length) { const c = [...s.contents]; const it = c.shift(); this.set({ contents: c }); this.g.props.giveNew(it, actor); if (it === 'cash' || ITEMS[it]?.use === 'jewel') this.g.hooks.emit('theft', { actor, value: ITEMS[it].value || 200, shop: this.opts.shop, kind: 'safe', reg: this }); }
  }
  onState(p, r) { if ('open' in p && !r) this.g.sfx(p.open ? 'cabinet_open' : 'door_close', this.center); }
}

class Vending extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) { super(world, id, def, zone, pos, ry, opts); world.game.lighting.addSource(this); }
  prompt() { return 'E : Acheter (1 pièce)   R : Donner un coup de pied'; }
  local(v, p) { if (v === 'use') { const c = p.inv.findDef('coin'); if (!c) { this.g.toast('Il faut une pièce de 2 €.'); return true; } this.g.sim.do('consume', { id: c }); this.g.sfx('coin_insert', this.center); } return false; }
  interact(v, actor) { if (v === 'alt') { this.fx('hit_metal', 0.9); if (Math.random() < 0.12) this.dispense(); return; } this.dispense(actor); }
  dispense(actor) { const it = ['soda', 'lemonade', 'energy_drink', 'water', 'chips', 'candy_bar', 'chocolate'][Math.floor(Math.random() * 7)]; this.fx('hit_can', 0.7); this.g.props.spawn(it, this.wp([0, -this.def.s[1] * 0.38, this.def.s[2] / 2 + 0.15]).toArray(), {}); }
  trigger() { this.dispense(); }
  getLight() { if (!this.powered()) return null; return { pos: this.wp([0, 0.2, this.def.s[2] / 2 + 0.4]), color: [0.9, 0.95, 1], intensity: 1.1, distance: 3.5, priority: 3 }; }
}
class ATM extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) { super(world, id, def, zone, pos, ry, opts); this.makeScreen(); this.setScreen('atm', 1.0); }
  prompt() { return 'E : Utiliser le distributeur'; }
  local(v, p) { this.g.ui.keypad('Distributeur — code secret', 4, (code) => { if (code === '1987') this.g.ui.showText('Distributeur', 'Compte n° 14111987\nTitulaire : LUCIE MARCHAND\nSolde : 0,00 €\nDernière opération : 14/11/1987 — 21h40'); else if (code) this.g.toast('Code erroné. Carte avalée. (Vous n\'aviez pas de carte.)'); }); return true; }
}
class WaterFountain extends ItemFixture { prompt() { return 'E : Boire'; } local(v, p) { this.g.sfx('drink', this.center); p.applyEffect('calm', 5); p.stats.stamina = Math.min(100, p.stats.stamina + 15); return true; } }
class FireAlarm extends ItemFixture {
  initState() { return { pulled: false }; }
  prompt() { return this.state.pulled ? 'Déclencheur activé' : 'E : BRISER LA GLACE (alarme incendie générale)'; }
  interact(v, actor) { if (this.state.pulled) return; this.set({ pulled: true }); this.g.alarms.fireAlarm(actor, this); }
  onState(p, r) { if (p.pulled && !r) this.g.sfx('glass_break', this.center, { volume: 0.4 }); }
}
class Sink extends ItemFixture {
  initState() { return { on: false }; }
  prompt(p) { return (p.heldDef?.use === 'water_can' ? 'E : Remplir l\'arrosoir' : this.state.on ? 'E : Fermer le robinet' : 'E : Ouvrir le robinet'); }
  interact(v, actor, ctx) { const held = this.heldProp(ctx); if (held?.def.use === 'water_can') { held.set({ data: { ...held.data, water: 5 } }); this.fx('sprinkler', 0.3); return; } this.set({ on: !this.state.on }); }
  trigger(p) { this.set({ on: true }); this.startTimer(p.dur || 30); }
  onState(p, r) { if (this.state.on && !r) this.loopOn('sprinkler', { volume: 0.25, ref: 1.5 }); else this.loopOff(); }
}
class Toilet extends ItemFixture { prompt() { return 'E : Tirer la chasse'; } interact() { this.fx('pipe_knock', 0.5); this.g.sim.emit('fx', { s: 'sprinkler', pos: this.center.toArray(), v: 0.4, dur: 3 }); } }
class Mirror extends ItemFixture {
  prompt(p) { return p.heldDef?.use === 'lipstick' ? 'Clic gauche : Écrire sur le miroir' : 'E : Se regarder'; }
  local(v, p) { this.g.mirrorLook(this, p); return true; }
}
class Fountain extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) { super(world, id, def, zone, pos, ry, opts); this.water = null; world.setActive(this, true); }
  initState() { return { on: false, wishes: 0 }; }
  prompt(p) { return p.heldDef?.use === 'coin' ? 'E : Jeter la pièce et faire un vœu' : 'Fontaine de l\'atrium' + (this.state.on ? ' (en marche)' : ' (arrêtée la nuit)'); }
  interact(v, actor, ctx) { const held = this.heldProp(ctx); if (held?.def.use === 'coin') { held.set({ where: 'gone' }); this.set({ wishes: this.state.wishes + 1 }); this.g.sim.emit('fx', { s: 'coin_drop', pos: this.center.toArray(), v: 0.8 }); this.g.hooks.emit('wish', { actor, n: this.state.wishes }); } }
  trigger(p) { this.set({ on: true }); this.startTimer(p.dur || 60); }
  onState(p, r) { if (this.state.on && !r) this.loopOn('fountain', { volume: 0.4, ref: 2, maxDist: 26 }); else this.loopOff(); this.g.particles?.fountain(this, this.state.on); }
}
class Generator extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) { super(world, id, def, zone, pos, ry, opts); this.pulls = 0; world.setActive(this, true); this._gauge = null; }
  get grid() { return this.g.power; }
  prompt(p) {
    const gen = this.grid.state.gen;
    const f = Math.round(gen.fuel);
    if (p.heldDef?.use === 'fuel') return 'E : Faire le plein (réservoir : ' + f + ' %)';
    return (gen.running ? 'R : Arrêter le groupe' : 'E : Tirer le démarreur') + ' — carburant ' + f + ' %' + (this.grid.state.mains ? ' (réseau OK)' : ' — RÉSEAU COUPÉ');
  }
  interact(v, actor, ctx) {
    const gen = { ...this.grid.state.gen }; const held = this.heldProp(ctx);
    if (held?.def.use === 'fuel') { const amount = held.data.amount ?? held.def.p.amount ?? 50; gen.fuel = Math.min(100, gen.fuel + amount); held.set({ where: 'gone' }); this.grid.set({ gen }); this.fx('drink', 0.5); return; }
    if (v === 'alt') { if (gen.running) { gen.running = false; this.grid.set({ gen }); this.fx('generator_stop'); } return; }
    if (gen.running) return;
    if (gen.fuel <= 0) { this.fx('generator_fail', 0.8); this.toast(actor, 'Le réservoir est vide.'); return; }
    this.pulls++;
    const chance = 0.18 + this.pulls * 0.22;
    if (Math.random() < chance) { gen.running = true; this.pulls = 0; this.grid.set({ gen }); this.fx('generator_start', 1); this.g.hooks.emit('generator_started', { actor }); }
    else this.fx('generator_fail', 0.9);
  }
  trigger(p) { const gen = { ...this.grid.state.gen, running: true }; this.grid.set({ gen }); this.startTimer(p.dur || 20); }
  timeout() { if (this.grid.state.mains) { const gen = { ...this.grid.state.gen, running: false }; this.grid.set({ gen }); } }
  animate(dt) {
    if (!Net.isHost) return;
    const gs = this.grid.state; if (!gs.gen.running) return;
    const load = 1 + this.grid.load() * 0.25;
    const fuel = Math.max(0, gs.gen.fuel - dt * 0.055 * load);
    this._acc = (this._acc || 0) + dt;
    if (fuel <= 0) { this.grid.set({ gen: { ...gs.gen, fuel: 0, running: false } }); this.fx('generator_stop'); this.g.hooks.emit('generator_dry'); }
    else if (this._acc > 2) { this._acc = 0; this.grid.set({ gen: { ...gs.gen, fuel } }); } else gs.gen.fuel = fuel;
  }
}
class BreakerPanel extends ItemFixture { prompt() { return 'E : Ouvrir le tableau électrique'; } local(v, p) { this.g.ui.breakers(this); return true; } }
class PAConsole extends ItemFixture { prompt() { return 'E : Utiliser la régie d\'annonces'; } local(v, p) { this.g.ui.pa(this); return true; } }
class Forklift extends ItemFixture {
  initState() { return { lights: false }; }
  prompt() { return 'E : Klaxonner   R : Phares'; }
  interact(v) { if (v === 'alt') this.set({ lights: !this.state.lights }); else this.fx('car_horn', 0.8); }
  getLight() { if (!this.state.lights) return null; return { pos: this.wp([0, 0.5, 1.6]), color: [1, 0.95, 0.8], intensity: 4, distance: 9, priority: 1.5 }; }
  constructor(world, id, def, zone, pos, ry, opts) { super(world, id, def, zone, pos, ry, opts); world.game.lighting.addSource(this); }
}
class DeskPhone extends ItemFixture {
  prompt() { return 'E : Décrocher le téléphone' + (this.g.phone?.ringing ? ' (ÇA SONNE)' : ''); }
  local(v, p) { this.g.phone.open(this); return true; }
}
class Computer extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) {
    super(world, id, def, zone, pos, ry, opts);
    if (opts.monitor) {
      // monitor: true → tour au sol, écran posé sur le bureau au-dessus ; 'left' / 'right' → tour posée sur le bureau,
      // écran sur pied à côté d'elle (côté x local négatif / positif)
      // (sans côté : écran posé sur le plateau du bureau, 0,54 m au-dessus du centre de la tour)
      const side = opts.monitor === 'left' ? -1 : opts.monitor === 'right' ? 1 : 0;
      const mp = side ? [side * 0.4, 0.005, 0.03] : [0, 0.83, -0.25];
      const mon = new THREE.Mesh(monitorGeometry(world.game.atlas, side ? 0.225 : 0.29), world.game.mats.get('props', zone));
      mon.position.set(mp[0], mp[1], mp[2]); mon.castShadow = mon.receiveShadow = true; this.group.add(mon);
      this.makeScreen({ x: mp[0], y: mp[1], z: mp[2] + 0.033, w: 0.44, h: 0.3 });
      if (side) this.pickFromObject(this.group, 0.04);
      else this.setPick(this.pickBox.min[0] - 0.1, this.pickBox.min[1], this.pickBox.min[2] - 0.1, this.pickBox.max[0] + 0.1, this.pickBox.max[1] + 0.81, this.pickBox.max[2] + 0.1); // couvre l'écran posé sur le bureau
    } else this.makeScreen({ x: 0, y: this.def.s[1] * 0.3, z: this.def.s[2] / 2 + 0.002, w: this.def.s[0] * 0.6, h: this.def.s[1] * 0.2 });
    this.setScreen('computer:' + (opts.os || this.p.os || 'shop'), 0.9);
    world.game.lighting.addSource(this);
  }
  prompt(p) { return p.heldDef?.use === 'usb' ? 'E : Brancher la clé USB' : p.heldDef?.use === 'tablet' && this.opts.os === 'security' ? 'E : Configurer la tablette de surveillance' : 'E : Utiliser l\'ordinateur'; }
  local(v, p) {
    if (p.heldDef?.use === 'tablet' && this.opts.os === 'security') { this.g.sim.do('flag', { k: 'tabletLinked', v: true }); this.fx('beep', 0.6); this.g.toast('Tablette appairée au système CCTV : clic gauche en la tenant pour voir les caméras partout.', 5); return true; }
    if (p.heldDef?.use === 'usb') { this.g.ui.showText('Clé USB', LORE.usb.text); this.g.discover('lore', 'usb'); return true; } this.g.ui.playScreen(this, 'computer:' + (this.opts.os || this.p.os || 'shop'), { personal: true }); return true; }
}
class Printer extends ItemFixture {
  prompt() { return 'E : Imprimer une page'; }
  interact(v, actor) { this.print(actor); }
  print(actor) {
    if (!this.powered()) return;
    this.fx('printer', 0.8);
    const texts = ['JE TE VOIS', 'Rapport de ventes — 14/11/1987 — Royaume du Jouet : 1 peluche Bobby (non payée)', 'Liste des gardiens de nuit : Marcel R. (1987-1993) · Gérard R. (1999-2024) · ' + (this.g.playerName || 'VOUS') + ' (2024- )', 'TU RESTES AVEC MOI ?', 'Ticket n° 1987 — Article : cache-cache — Prix : une vie', 'Mesdames et messieurs, le centre ferme ses portes. Pour toujours.'];
    const t = texts[Math.floor(Math.random() * texts.length)];
    setTimeout(() => { const pr = this.g.props.spawn('lore_page', this.wp([0, 0.15, this.def.s[2] / 2 + 0.12]).toArray(), { data: { text: t } }); }, 1400);
  }
  trigger() { this.print(null); }
}
class Conveyor extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) {
    super(world, id, def, zone, pos, ry, opts); world.setActive(this, true);
    this.plates = []; for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(sushiGeometry(world.game.atlas, [0xd32f2f, 0x1565c0, 0xfdd835][i % 3], i), world.game.mats.get('props', zone)); m.position.set(-def.s[0] / 2 + i * (def.s[0] / 7), def.s[1] / 2 + 0.02, 0); this.group.add(m); this.plates.push(m); }
  }
  initState() { return { on: false }; }
  prompt() { return (this.state.on ? 'E : Arrêter' : 'E : Démarrer') + ' — ' + this.name; }
  interact() { this.set({ on: !this.state.on }); }
  onState(p, r) { if (this.state.on && !r) this.loopOn('escalator', { volume: 0.2, maxDist: 15 }); else this.loopOff(); }
  animate(dt) { if (!this.state.on) return; const L = this.def.s[0]; for (const m of this.plates) { m.position.x += dt * 0.3; if (m.position.x > L / 2) m.position.x -= L; } }
}
class Gumball extends ItemFixture {
  prompt() { return 'E : Une pièce, une boule'; }
  local(v, p) { const c = p.inv.findDef('coin'); if (!c) { this.g.toast('Il faut une pièce.'); return true; } this.g.sim.do('consume', { id: c }); return false; }
  interact(v, actor) { this.fx('rattle', 0.6); this.g.props.giveNew('gumball', actor); }
}
class Car extends ItemFixture {
  constructor(world, id, def, zone, pos, ry, opts) {
    super(world, id, def, zone, pos, ry, opts);
    this.windows = [];
    for (const w of this.meta.windows || []) {
      const c = this.wp([w.x, w.y, w.z]);
      const along = Math.abs(Math.sin(ry)) > 0.5; // fenêtres latérales : le long de z localement
      const half = w.w / 2;
      const gp = new GlassPane(world, world.newId('glass'), { zone, x0: along ? c.x - half : c.x, x1: along ? c.x + half : c.x, z0: along ? c.z : c.z - half, z1: along ? c.z : c.z + half, y0: c.y - w.h / 2, y1: c.y + w.h / 2, name: 'Vitre de voiture', car: id, big: false, floorY: pos.y - def.s[1] / 2 + 0.01 });
      gp.mesh.material = world.game.mats.get('glass_dirty'); world.add(gp); this.windows.push(gp);
    }
    world.game.lighting.addSource(this);
  }
  initState(o) { return { locked: o.locked ?? true, alarmArmed: o.alarm ?? false, alarm: false, lights: false, radio: false, horn: 0 }; }
  prompt(p) {
    const s = this.state;
    if (s.alarm) return 'L\'alarme hurle !' + '   R : Couper (si déverrouillée)';
    if (s.locked) return 'Voiture verrouillée (' + (this.opts.plate || '') + ')   E : Essayer la poignée';
    return 'E : Klaxon   R : Phares / autoradio';
  }
  interact(v, actor) {
    const s = this.state;
    if (s.locked) { this.fx('door_rattle', 0.5); if (s.alarmArmed && Math.random() < 0.35) this.alarmOn(); return; }
    if (v === 'alt') { if (s.alarm) { this.set({ alarm: false }); return; } if (!s.lights) this.set({ lights: true }); else if (!s.radio) this.set({ radio: true }); else this.set({ lights: false, radio: false }); return; }
    this.fx('car_horn', 1); this.g.noise(this.center, 1, 'horn');
  }
  alarmOn() { if (!this.state.alarm) { this.set({ alarm: true }); this.startTimer(40); this.g.noise(this.center, 1, 'car_alarm'); } }
  timeout() { if (this.state.alarm) this.set({ alarm: false }); else this.set({ lights: false, radio: false }); }
  trigger(p) { const k = p.kind; if (k === 'car_lights') { this.set({ lights: true }); this.startTimer(p.dur || 20); } else if (k === 'car_horn') this.fx('car_horn', 1); else if (k === 'car_radio') { this.set({ radio: true }); this.startTimer(p.dur || 30); } else this.alarmOn(); }
  onState(p, r) {
    if (this.state.alarm && !r) this.loopOn('car_alarm', { volume: 1, ref: 6 }); else this.loopOff();
    if (this.state.radio && !r) this.musicOn('chanson', { volume: 0.4 }); else this.musicOff();
  }
  getLight() { if (!this.state.lights && !this.state.alarm) return null; const on = this.state.lights || Math.sin(performance.now() * 0.012) > 0; if (!on) return null; return { pos: this.wp([0, 0, this.def.s[2] / 2 + 1.5]), color: [1, 0.95, 0.8], intensity: 5, distance: 10, priority: 1.5 }; }
}
class MannequinDev extends ItemFixture {
  static animatesMesh = true; // pivote et disparaît (groupe)
  initState(o) { return { pose: (o.index || 0) % 4, rot: null, away: false }; }
  prompt() { return this.state.away ? null : 'Mannequin'; }
  onState() {
    // rot : orientation imposée (mannequins qui se retournent) ; away : le mannequin a « quitté » son socle
    this.group.rotation.y = this.state.rot ?? this.ry;
    this.group.visible = !this.state.away;
    if (this.col) this.col.enabled = !this.state.away;
    if (this.pickBox) this.pickBox.enabled = !this.state.away;
  }
}
class HideDev extends ItemFixture {
  initState() { return { hidden: null }; }
  prompt(p) { return HideSpot.prototype.prompt.call(this, p); }
  interact(v, actor) {
    const g = this.g;
    if (this.state.hidden === actor) { this.set({ hidden: null }); g.sim.emit('hide', { id: actor, on: false, obj: this.id }); return; }
    if (this.state.hidden) return;
    this.set({ hidden: actor }); g.sim.emit('hide', { id: actor, on: true, obj: this.id, pos: this.center.toArray(), ry: this.ry });
  }
}
class ReadDev extends ItemFixture { prompt() { return 'E : Lire — ' + this.name; } local(v, p) { const lore = this.p.lore ? LORE[this.p.lore] : null; this.g.ui.showText(lore?.title || this.name, this.p.text || lore?.text || ''); if (this.p.lore) this.g.discover('lore', this.p.lore); return true; } }
class SeatDev extends ItemFixture { prompt() { return 'E : S\'asseoir'; } local(v, p) { p.sit(this.center.clone().add(new THREE.Vector3(0, 0.05, 0)), this.ry + Math.PI); return true; } }
class ContainerDev extends ItemFixture {
  initState(o) { const def = this.def; let c = o.contents || def.p?.contains || []; if (def.p?.random === 'trash') c = ['banana_peel', 'newspaper', 'coin'].filter((x, i) => ((this.id.length + i * 7) % 3) !== 0); return { contents: [...c] }; }
  prompt() { return this.state.contents.length ? 'E : Ouvrir — ' + this.name : this.name + ' (vide)'; }
  interact(v, actor) { const c = [...this.state.contents]; if (!c.length) return; const it = c.shift(); this.set({ contents: c }); this.g.props.giveNew(it, actor); this.fx('cabinet_open', 0.6); }
}
class Recorder extends ItemFixture { prompt() { return 'Enregistreur CCTV — utilisez la console du bureau'; } }
class InfoDev extends ItemFixture { prompt() { return this.name; } }

const CLASSES = {
  loopdevice: LoopDev, fryer: LoopDev, boiler: Boiler, tv: TVDev, microwave: Microwave, washer: Washer, fridge: Fridge, coffee_maker: Dispenser,
  register: Register, console: ConsoleDev, turntable: Turntable, vcr: VCRDev, arcade: ArcadeDev, claw: ClawDev, kiddie: Kiddie, token_machine: TokenMachine,
  piano: PianoDev, drumkit: DrumDev, photobooth: Photobooth, projector: Projector, aquarium: Aquarium, terrarium: Aquarium, parrot: Parrot, hamster: Hamster,
  chair_spin: SpinChair, massage: Massage, bike: Bike, hoop: Hoop, safe: Safe, vending: Vending, atm: ATM, water_fountain: WaterFountain, fire_alarm: FireAlarm,
  sink: Sink, toilet: Toilet, mirror_wall: Mirror, fountain: Fountain, generator: Generator, breakers: BreakerPanel, pa: PAConsole, forklift: Forklift, car: Car,
  mannequin: MannequinDev, hide: HideDev, read: ReadDev, sit: SeatDev, container: ContainerDev, recorder: Recorder, phone: DeskPhone, computer: Computer,
  printer: Printer, conveyor: Conveyor, gumball: Gumball,
};

export class DeviceFactory {
  constructor(game) { this.game = game; this.all = []; this.byKind = new Map(); this.byShop = new Map(); }
  create(defId, zone, pos, ry = 0, opts = {}) {
    const g = this.game; const def = ITEMS[defId];
    if (!def) { console.warn('[devices] inconnu', defId); return null; }
    const world = g.world;
    if (!def.fixed || opts.prop) {
      if (g.building) return g.props.addStatic(defId, pos.x, pos.y, pos.z, ry, zone, opts.data || {});
      return g.props.spawn(defId, pos.toArray(), {});
    }
    if (def.use === 'locker') { const lk = new Locker(world, world.newId('locker'), { zone, x: pos.x, y: pos.y - def.s[1] / 2, z: pos.z, ry, name: null, contents: (opts.index || 0) % 2 === 0 ? [['coin', 'battery', 'candy_bar', 'magazine', 'coffee_pack', 'gum'][((opts.index || 0) / 2) % 6 | 0]] : [] }); world.add(lk); return lk; }
    const Cls = CLASSES[def.use] || InfoDev;
    const id = world.newId('dev_' + def.use + '_');
    const d = new Cls(world, id, def, zone, pos, ry, opts);
    world.add(d); this.all.push(d);
    if (!this.byKind.has(def.use)) this.byKind.set(def.use, []);
    this.byKind.get(def.use).push(d);
    if (opts.shop) { if (!this.byShop.has(opts.shop)) this.byShop.set(opts.shop, []); this.byShop.get(opts.shop).push(d); }
    d.onState(d.state, true);
    if (d.animate || d.timer !== undefined) world.setActive(d, true);
    return d;
  }
  kind(k) { return this.byKind.get(k) || []; }
  inZone(zoneId, kind = null) { return this.all.filter(d => (d.zone === zoneId || d.opts.shop === zoneId) && (!kind || d.def.use === kind || d.def.id === kind)); }
}
