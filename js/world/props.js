// Système d'objets (articles) :
// - Au repos à leur place d'origine, les articles d'une zone sont fusionnés en UN seul mesh (1 draw call / magasin).
// - Dès qu'un article est pris, poussé ou tombe, il est retiré du mesh fusionné (plage de sommets écrasée)
//   et devient un objet individuel (mesh + corps physique simulé par l'hôte).
// - États répliqués : where = 'home' | 'world' | 'held' | 'in' | 'gone', owner, pos, quat, data.
import * as THREE from 'three';
import { WorldObject } from './world.js';
import { ITEMS } from '../data/items.js';
import { buildItemGeometry, itemMeta } from './meshes.js';
import { concatGeometries } from '../engine/geo.js';
import { Box, LAYER } from '../engine/physics.js';
import { Net } from '../net/net.js';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
const MAT_SOUND = { plastic: 'hit_plastic', metal: 'hit_metal', wood: 'hit_wood', glass: 'hit_glass', cardboard: 'hit_cardboard', soft: 'hit_soft', paper: 'hit_paper', can: 'hit_can', ceramic: 'hit_ceramic' };
const BOUNCE = { plastic: 0.45, metal: 0.25, wood: 0.3, glass: 0.2, cardboard: 0.1, soft: 0.15, paper: 0.05, can: 0.35, ceramic: 0.15 };

export class Prop extends WorldObject {
  constructor(sys, id, defId, home, data = {}) {
    super(sys.world, id, 'prop');
    this.sys = sys; this.defId = defId; this.def = ITEMS[defId]; this.name = this.def.name;
    this.home = home; // {x,y,z,ry,zone}
    this.zone = home.zone;
    this.mesh = null; this.body = null; this.merged = null; this.range = null;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, home.ry || 0, 0));
    this.init({ where: 'home', owner: null, pos: [home.x, home.y, home.z], quat: [q.x, q.y, q.z, q.w], data });
    this.half = [Math.max(0.02, this.def.s[0] / 2), Math.max(0.01, this.def.s[1] / 2), Math.max(0.02, this.def.s[2] / 2)];
    this._setPickAt(home.x, home.y, home.z, home.ry || 0);
    this.lerp = null; // interpolation côté client
  }
  _setPickAt(x, y, z, ry = 0) {
    const r = Math.max(this.half[0], this.half[2]) + 0.02; const h = this.half[1] + 0.02;
    const pr = Math.max(r, 0.08);
    this.setPick(x - pr, y - Math.max(h, 0.06), z - pr, x + pr, y + Math.max(h, 0.06), z + pr);
    this.pickBox.layer = LAYER.PROP;
  }
  get data() { return this.state.data || {}; }
  get worldPos() { return new THREE.Vector3(...this.state.pos); }
  prompt(p) {
    if (this.state.where !== 'home' && this.state.where !== 'world') return null;
    const d = this.def; const g = this.world.game;
    if (g.isDay && !g.dayPickupAllowed(this)) return d.name + ' — les vendeurs vous surveillent (revenez cette nuit)';
    let t = 'E : Prendre — ' + d.name;
    const alt = this.sys.altLabel(this, p);
    if (alt) t += '   R : ' + alt;
    if (d.value && d.use === 'jewel') t += '  (' + d.value + ' €)';
    return t;
  }
  local(verb, p) {
    if (verb === 'use') {
      if (this.def.use === 'cart') { p.grabCart(this); return true; }
      if (!p.inv.hasRoom()) { this.world.game.toast('Inventaire plein — posez quelque chose (G).'); return true; }
      if (this.world.game.isDay && !this.world.game.dayPickupAllowed(this)) return true;
      return false; // → action 'interact' (take)
    }
    if (verb === 'alt') return this.sys.altLocal(this, p);
    return false;
  }
  interact(verb, actor) {
    const g = this.world.game;
    if (verb === 'use') { g.props.take(this.id, actor); return; }
    if (verb === 'alt') { g.props.altHost(this, actor); }
  }
  onState(patch, isReset) { this.sys.onPropState(this, patch, isReset); }
}

export class PropSystem {
  constructor(game) {
    this.game = game; this.world = game.world;
    this.list = []; this.byZone = new Map(); this.runtime = new Map();
    this.counter = 0; this.rcounter = 0;
    this.awake = new Set(); this.dynamicGroup = new THREE.Group(); this.world.root.add(this.dynamicGroup);
    this.snapTimer = 0;
    const sim = game.sim;
    sim.effect('prop.spawn', (p) => this._spawnLocal(p));
    sim.effect('props.snap', (p) => this.applySnap(p));
    sim.action('take', (p, actor) => this.take(p.id, actor));
    sim.action('drop', (p, actor) => this.drop(p.id, actor, p.pos, p.vel, p.quat, p.place));
    sim.action('consume', (p, actor) => this.consume(p.id, actor));
    sim.action('propdata', (p, actor) => { const pr = this.get(p.id); if (pr) pr.set({ data: { ...pr.data, ...p.data } }); });
    sim.action('spawnprop', (p, actor) => this.spawn(p.def, p.pos, { vel: p.vel, data: p.data, owner: p.held ? actor : null }));
  }

  get(id) { return this.world.objects.get(id); }

  // ── construction ──
  addStatic(defId, x, y, z, ry, zone, data = {}) {
    if (!ITEMS[defId]) { console.warn('[props] inconnu', defId); return null; }
    const id = 'p' + (++this.counter);
    const pr = new Prop(this, id, defId, { x, y, z, ry, zone }, data);
    this.world.add(pr); this.list.push(pr);
    if (!this.byZone.has(zone)) this.byZone.set(zone, []);
    this.byZone.get(zone).push(pr);
    return pr;
  }

  finalize() {
    const g = this.game;
    for (const [zone, props] of this.byZone) {
      const entries = props.map(pr => {
        const geo = buildItemGeometry(pr.def, g.atlas);
        _q.setFromEuler(_e.set(0, pr.home.ry || 0, 0));
        _m.compose(_v.set(pr.home.x, pr.home.y, pr.home.z), _q, _s);
        return { geo, matrix: _m.clone() };
      });
      // découpe en lots de 60k sommets max
      let start = 0;
      while (start < entries.length) {
        let vcount = 0, end = start;
        while (end < entries.length && vcount + entries[end].geo.attributes.position.count < 60000) { vcount += entries[end].geo.attributes.position.count; end++; }
        if (end === start) end++;
        const { geometry, ranges } = concatGeometries(entries.slice(start, end));
        const mesh = new THREE.Mesh(geometry, g.mats.get('props', zone));
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
        const merged = { mesh, orig: new Float32Array(geometry.attributes.position.array), dirty: false };
        for (let i = start; i < end; i++) { props[i].merged = merged; props[i].range = ranges[i - start]; }
        (this.world.zone(zone)?.group || this.world.root).add(mesh);
        start = end;
      }
    }
  }

  // ── rendu ──
  _hideStatic(pr) {
    if (!pr.merged || pr._hidden) return;
    const a = pr.merged.mesh.geometry.attributes.position; const arr = a.array; const { start, count } = pr.range;
    for (let i = start; i < start + count; i++) { arr[i * 3] = 0; arr[i * 3 + 1] = -500; arr[i * 3 + 2] = 0; }
    a.needsUpdate = true; pr._hidden = true;
  }
  _showStatic(pr) {
    if (!pr.merged || !pr._hidden) return;
    const a = pr.merged.mesh.geometry.attributes.position; const arr = a.array; const o = pr.merged.orig; const { start, count } = pr.range;
    arr.set(o.subarray(start * 3, (start + count) * 3), start * 3);
    a.needsUpdate = true; pr._hidden = false;
  }
  _ensureMesh(pr) {
    if (pr.mesh) return pr.mesh;
    const geo = buildItemGeometry(pr.def, this.game.atlas);
    pr.mesh = new THREE.Mesh(geo, this.game.mats.get('props'));
    pr.mesh.castShadow = true; pr.mesh.receiveShadow = true;
    this.dynamicGroup.add(pr.mesh);
    return pr.mesh;
  }
  _removeMesh(pr) { if (pr.mesh) { pr.mesh.removeFromParent(); pr.mesh = null; } }
  _ensureBody(pr) {
    if (pr.body) return pr.body;
    const m = pr.def.mat;
    pr.body = { pos: [...pr.state.pos], vel: [0, 0, 0], half: pr.half, bounce: pr.def.p?.bounce ?? BOUNCE[m] ?? 0.3, friction: pr.def.mass > 5 ? 9 : 5, rot: [0, 0, 0], spin: [0, 0, 0], prop: pr, gravityScale: pr.def.p?.light ? 0.35 : 1, drag: pr.def.p?.light ? 0.6 : 0 };
    const q = new THREE.Quaternion(...pr.state.quat); const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); pr.body.rot = [e.x, e.y, e.z];
    pr.body.onSleep = (b) => this._bodySlept(b);
    return pr.body;
  }

  onPropState(pr, patch, isReset) {
    const s = pr.state;
    if (isReset) {
      if (pr.body) { this.world.physics.removeBody(pr.body); this.awake.delete(pr); pr.body = null; }
      this._removeMesh(pr); this._showStatic(pr); pr._setPickAt(pr.home.x, pr.home.y, pr.home.z, pr.home.ry);
      pr.pickBox.enabled = true; pr.lerp = null;
      if (pr.runtime) { this._destroyRuntime(pr); }
      this.game.hooks.emit('prop_reset', pr);
      return;
    }
    if ('where' in patch || 'owner' in patch) {
      const w = s.where;
      if (w === 'home') { this._removeMesh(pr); this._showStatic(pr); pr.pickBox.enabled = true; if (pr.body) { this.world.physics.removeBody(pr.body); pr.body = null; } }
      else { this._hideStatic(pr); }
      if (w === 'world') { this._ensureMesh(pr); pr.mesh.visible = true; pr.pickBox.enabled = true; this._applyTransform(pr); }
      if (w === 'held' || w === 'in' || w === 'gone') {
        this._removeMesh(pr); pr.pickBox.enabled = false;
        if (pr.body) { this.world.physics.removeBody(pr.body); this.awake.delete(pr); pr.body = null; }
      }
      if (w === 'gone' && pr.runtime) this._destroyRuntime(pr);
      this.game.player?.inv.onPropState(pr);
      this.game.hooks.emit('prop_state', pr, patch);
    } else if ('pos' in patch && s.where === 'world') {
      this._ensureMesh(pr); this._applyTransform(pr);
    }
    if ('data' in patch) this.game.hooks.emit('prop_data', pr);
  }

  _applyTransform(pr) {
    const s = pr.state;
    if (pr.mesh) { pr.mesh.position.set(s.pos[0], s.pos[1], s.pos[2]); pr.mesh.quaternion.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]); }
    pr._setPickAt(s.pos[0], s.pos[1], s.pos[2]);
  }

  // ── actions hôte ──
  take(id, actor) {
    const pr = this.get(id); if (!pr || pr.kind !== 'prop') return;
    if (pr.state.where !== 'home' && pr.state.where !== 'world') return;
    const prev = pr.state.where;
    pr.set({ where: 'held', owner: actor });
    this.game.sim.emit('fx', { s: 'pickup', pos: pr.state.pos, v: 0.5 });
    this.game.hooks.emit('taken', { prop: pr, actor, from: prev });
  }
  drop(id, actor, pos, vel, quat, place) {
    const pr = this.get(id); if (!pr) return;
    if (pr.state.where === 'held' && pr.state.owner !== actor) return;
    const q = quat || [0, 0, 0, 1];
    pr.set({ where: 'world', owner: null, pos, quat: q });
    if (!place) {
      const b = this._ensureBody(pr); b.pos = [...pos]; b.vel = vel ? [...vel] : [0, 0, 0];
      const sp = Math.hypot(b.vel[0], b.vel[1], b.vel[2]);
      b.spin = [(Math.random() - 0.5) * sp * 2, (Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp * 2];
      b.thrower = actor; b.sleeping = false; b.sleepTimer = 0;
      this.world.physics.addBody(b); this.awake.add(pr);
      if (sp > 3) this.game.noise(new THREE.Vector3(...pos), 0.3, 'throw');
    }
    this.game.hooks.emit('dropped', { prop: pr, actor, place, vel });
  }
  consume(id, actor) {
    const pr = this.get(id); if (!pr) return;
    pr.set({ where: 'gone', owner: null });
  }
  // Fait tomber un article (événements, chat, explosion…)
  push(pr, vel) {
    if (!pr || (pr.state.where !== 'home' && pr.state.where !== 'world')) return;
    pr.set({ where: 'world', owner: null });
    const b = this._ensureBody(pr); b.pos = [...pr.state.pos]; b.vel = [...vel]; b.spin = [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6];
    b.sleeping = false; b.sleepTimer = 0; this.world.physics.addBody(b); this.awake.add(pr);
  }
  knock(zoneId, n = 3, filter = null) {
    const list = (this.byZone.get(zoneId) || []).filter(p => p.state.where === 'home' && p.home.y > (this.world.zone(zoneId)?.min[1] || 0) + 0.4 && (!filter || filter(p)));
    const rng = Math.random; const out = [];
    for (let i = 0; i < n && list.length; i++) {
      const pr = list.splice(Math.floor(rng() * list.length), 1)[0];
      // pousse vers l'allée (direction de la face avant de l'objet)
      const ry = pr.home.ry || 0; const dir = [Math.sin(ry), 0, Math.cos(ry)];
      this.push(pr, [dir[0] * (1 + rng() * 1.5), 0.5 + rng(), dir[2] * (1 + rng() * 1.5)]);
      out.push(pr);
    }
    return out;
  }
  spawn(defId, pos, opts = {}) {
    if (!Net.isHost) return null;
    const id = 'r' + (++this.rcounter);
    const q = opts.quat || [0, 0, 0, 1];
    const state = { where: opts.owner ? 'held' : 'world', owner: opts.owner || null, pos: [...pos], quat: q, data: opts.data || {} };
    this.game.sim.emit('prop.spawn', { id, def: defId, state });
    const pr = this.get(id);
    if (pr && !opts.owner && opts.vel !== null) {
      const b = this._ensureBody(pr); b.pos = [...pos]; b.vel = opts.vel ? [...opts.vel] : [0, 0, 0]; b.sleeping = false; this.world.physics.addBody(b); this.awake.add(pr);
    }
    return pr;
  }
  giveNew(defId, actor, data) {
    const p = this.game.playerById(actor);
    const pos = p ? p.pos.toArray() : [0, 1, 0];
    return this.spawn(defId, pos, { owner: actor, data, vel: null });
  }
  _spawnLocal(p) {
    if (this.world.objects.has(p.id)) { this.get(p.id).applyState(p.state); return; }
    const pr = new Prop(this, p.id, p.def, { x: p.state.pos[0], y: p.state.pos[1], z: p.state.pos[2], ry: 0, zone: null }, p.state.data || {});
    pr.runtime = true; pr.transient = true;
    this.world.add(pr); this.runtime.set(p.id, pr);
    pr.state = { ...p.state };
    pr.initial = { where: 'gone', owner: null, pos: p.state.pos, quat: p.state.quat, data: {} };
    this.onPropState(pr, { where: pr.state.where, owner: pr.state.owner }, false);
    const n = parseInt(p.id.slice(1)); if (n > this.rcounter) this.rcounter = n;
  }
  _destroyRuntime(pr) {
    this._removeMesh(pr); if (pr.body) { this.world.physics.removeBody(pr.body); pr.body = null; }
    this.awake.delete(pr);
    if (pr.pickBox) { this.world.pick.remove(pr.pickBox); pr.pickBox = null; }
    this.world.objects.delete(pr.id); this.runtime.delete(pr.id);
    this.game.player?.inv.onPropState(pr);
  }
  serializeRuntime() { const out = []; for (const pr of this.runtime.values()) if (pr.state.where !== 'gone') out.push({ id: pr.id, def: pr.defId, state: pr.state }); return { list: out, rc: this.rcounter }; }
  deserializeRuntime(d) { for (const e of d.list) this._spawnLocal(e); this.rcounter = Math.max(this.rcounter, d.rc || 0); }
  resetRuntime() { for (const pr of [...this.runtime.values()]) this._destroyRuntime(pr); this.rcounter = 0; }

  // ── physique (hôte) ──
  _bodySlept(b) {
    const pr = b.prop; if (!pr) return;
    this.awake.delete(pr);
    if (Net.isHost) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(b.rot[0], b.rot[1], b.rot[2], 'YXZ'));
      pr.set({ pos: [b.pos[0], b.pos[1], b.pos[2]], quat: [q.x, q.y, q.z, q.w] });
      this.game.hooks.emit('prop_rest', pr);
    }
  }
  onImpact(b, speed, box, axis) {
    const pr = b.prop; if (!pr) return;
    const d = pr.def; const pos = [b.pos[0], b.pos[1], b.pos[2]];
    const intensity = Math.min(1, speed / 9);
    const now = performance.now();
    if (!b._lastHit || now - b._lastHit > 90) {
      b._lastHit = now;
      const snd = d.p?.sound === 'basketball' ? 'basketball' : d.use === 'ball' && d.p?.bounce > 0.7 ? 'ball_bounce' : MAT_SOUND[d.mat] || 'hit_plastic';
      this.game.sim.emit('fx', { s: snd, pos, v: intensity, i: intensity });
      this.game.noise(new THREE.Vector3(...pos), 0.15 + intensity * 0.5, 'impact');
    }
    // vitre heurtée
    const obj = box?.data;
    if (obj && obj.kind === 'glass' && speed > 6.5 && (d.mass || 0.5) * speed > 3) obj.smash(b.thrower, speed);
    // casse
    if ((d.p?.breakable || d.mat === 'glass' && d.use !== 'jewel') && speed > 4.5) {
      pr.set({ where: 'gone' });
      this.game.sim.emit('fx', { s: d.shape === 'wine' || d.shape === 'bottle' || d.shape === 'jar' ? 'bottle_break' : 'glass_break', pos, v: 0.9 });
      this.game.sim.emit('decal', { kind: d.id === 'wine' ? 'wine' : 'wet', pos: [pos[0], box ? box.max[1] + 0.005 : pos[1], pos[2]] });
      this.game.hooks.emit('broke', { prop: pr, actor: b.thrower });
      return;
    }
    if (d.p?.splat && speed > 4) { pr.set({ where: 'gone' }); this.game.sim.emit('fx', { s: 'hit_soft', pos, v: 1 }); this.game.sim.emit('decal', { kind: d.id === 'eggs' ? 'egg' : 'splat', pos, color: d.c }); return; }
    if (d.use === 'flour' && speed > 3) { pr.set({ where: 'gone' }); this.game.sim.emit('flour', { pos }); return; }
    if (d.use === 'paint' && speed > 3) { pr.set({ where: 'gone' }); this.game.sim.emit('fx', { s: 'hit_metal', pos, v: 1 }); this.game.sim.emit('decal', { kind: 'paint', pos, color: d.c, size: 1.6 }); return; }
    if (d.use === 'toilet_paper' && speed > 4) this.game.sim.emit('decal', { kind: 'tp', pos, color: 0xffffff });
    this.game.hooks.emit('impact', { prop: pr, speed, box });
  }

  update(dt) {
    const g = this.game;
    if (Net.isHost) {
      this.world.physics.stepBodies(dt, (b, sp, box, ax) => this.onImpact(b, sp, box, ax));
      for (const pr of this.awake) {
        const b = pr.body; if (!b) continue;
        pr.state.pos[0] = b.pos[0]; pr.state.pos[1] = b.pos[1]; pr.state.pos[2] = b.pos[2];
        if (pr.mesh) { pr.mesh.position.set(b.pos[0], b.pos[1], b.pos[2]); pr.mesh.rotation.set(b.rot[0], b.rot[1], b.rot[2], 'YXZ'); }
        pr._setPickAt(b.pos[0], b.pos[1], b.pos[2]);
      }
      // instantané pour les clients
      if (Net.online && this.awake.size) {
        this.snapTimer += dt;
        if (this.snapTimer > 0.08) {
          this.snapTimer = 0;
          const arr = [];
          for (const pr of this.awake) { const b = pr.body; if (!b) continue; arr.push(pr.id, +b.pos[0].toFixed(3), +b.pos[1].toFixed(3), +b.pos[2].toFixed(3), +b.rot[0].toFixed(2), +b.rot[1].toFixed(2), +b.rot[2].toFixed(2)); }
          if (arr.length) g.sim.emit('props.snap', { a: arr }, { exceptHost: true });
        }
      }
    } else {
      // interpolation client
      for (const pr of this.runtime.values()) this._lerpStep(pr, dt);
      for (const pr of this._lerping || []) this._lerpStep(pr, dt);
    }
  }
  applySnap(p) {
    if (Net.isHost) return;
    const a = p.a; this._lerping = this._lerping || new Set();
    for (let i = 0; i < a.length; i += 7) {
      const pr = this.get(a[i]); if (!pr || pr.state.where !== 'world') continue;
      this._ensureMesh(pr);
      pr.lerp = { to: [a[i + 1], a[i + 2], a[i + 3]], rot: [a[i + 4], a[i + 5], a[i + 6]] };
      this._lerping.add(pr);
    }
  }
  _lerpStep(pr, dt) {
    if (!pr.lerp || !pr.mesh) return;
    const k = Math.min(1, dt * 15); const m = pr.mesh;
    m.position.x += (pr.lerp.to[0] - m.position.x) * k; m.position.y += (pr.lerp.to[1] - m.position.y) * k; m.position.z += (pr.lerp.to[2] - m.position.z) * k;
    m.rotation.set(pr.lerp.rot[0], pr.lerp.rot[1], pr.lerp.rot[2], 'YXZ');
    pr.state.pos = [m.position.x, m.position.y, m.position.z];
    pr._setPickAt(m.position.x, m.position.y, m.position.z);
    if (Math.abs(m.position.x - pr.lerp.to[0]) + Math.abs(m.position.y - pr.lerp.to[1]) + Math.abs(m.position.z - pr.lerp.to[2]) < 0.002) { pr.lerp = null; this._lerping?.delete(pr); }
  }

  // ── actions secondaires (R) sur un objet posé ──
  altLabel(pr, p) {
    const d = pr.def;
    if (d.use === 'container' || pr.data.contents?.length) return pr.data.contents?.length ? 'Fouiller' : null;
    if (d.use === 'sit' || d.use === 'chair_spin') return 'S\'asseoir';
    if (d.use === 'candle') return pr.data.lit ? 'Souffler' : (p.hasItem('lighter') || p.hasItem('matches') ? 'Allumer' : null);
    if (d.use === 'radio' || d.use === 'lamp' || d.use === 'nightlight' || d.use === 'disco' || d.use === 'loopdevice') return pr.data.on ? 'Éteindre' : 'Allumer';
    if (d.use === 'place_sensor' && pr.data.armed) return 'Désarmer';
    if (d.use === 'rc_car' && pr.state.where === 'world' && p.heldDef?.id === 'portable_cam' && !pr.data.camMounted) return 'Fixer la caméra sur la voiture';
    if (d.use === 'rc_car' && pr.state.where === 'world') return 'Piloter (télécommande)' + (pr.data.camMounted ? ' — caméra embarquée' : '');
    if (d.use === 'cat_food' && pr.data.placed) return null;
    if (d.use === 'pet_bed') return null;
    if (d.use === 'yoga') return 'Méditer';
    return null;
  }
  altLocal(pr, p) {
    const d = pr.def;
    if (d.use === 'sit' || d.use === 'chair_spin') { p.sit(new THREE.Vector3(...pr.state.pos).add(new THREE.Vector3(0, 0.1, 0)), 0, d.use === 'chair_spin'); return true; }
    if (d.use === 'rc_car' && p.heldDef?.id === 'portable_cam' && !pr.data.camMounted) { this.game.sim.do('rc_mount', { car: pr.id, cam: p.heldProp.id }); this.game.toast('Caméra fixée : la voiture apparaît dans le système CCTV (onglet RC du poste).'); return true; }
    if (d.use === 'rc_car') { this.game.security?.driveRC(pr.id); return true; }
    if (d.use === 'yoga') { p.meditate(); return true; }
    return false;
  }
  altHost(pr, actor) {
    const g = this.game; const d = pr.def;
    if (pr.data.contents?.length) {
      const c = [...pr.data.contents]; const it = c.shift();
      pr.set({ data: { ...pr.data, contents: c } });
      g.props.giveNew(it, actor);
      g.sim.emit('fx', { s: 'hit_cardboard', pos: pr.state.pos, v: 0.4 });
      return;
    }
    if (d.use === 'candle') { const p = g.playerById(actor); if (pr.data.lit || p?.hasItem('lighter') || p?.hasItem('matches')) pr.set({ data: { ...pr.data, lit: !pr.data.lit } }); return; }
    if (['radio', 'lamp', 'nightlight', 'disco', 'loopdevice'].includes(d.use)) { pr.set({ data: { ...pr.data, on: !pr.data.on } }); return; }
    if (d.use === 'place_sensor') { pr.set({ data: { ...pr.data, armed: false } }); return; }
  }

  // Articles statiques au repos dans une zone
  inZone(zoneId) { return (this.byZone.get(zoneId) || []).filter(p => p.state.where === 'home'); }
  // Articles d'un type dans le monde (au repos ou posés)
  find(defIdOrFn, opts = {}) {
    const f = typeof defIdOrFn === 'function' ? defIdOrFn : (p) => p.defId === defIdOrFn;
    const out = [];
    for (const o of this.world.objects.values()) if (o.kind === 'prop' && f(o) && (opts.any || o.state.where === 'home' || o.state.where === 'world')) out.push(o);
    return out;
  }
}
