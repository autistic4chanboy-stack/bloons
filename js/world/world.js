// Monde : registre des objets interactifs (identifiants déterministes), zones, graphe de navigation,
// réplication d'état (effet 'obj') et remise à zéro entre les nuits.
import * as THREE from 'three';
import { PhysicsWorld, Box, LAYER } from '../engine/physics.js';

export class WorldObject {
  constructor(world, id, kind) {
    this.world = world; this.id = id; this.kind = kind;
    this.state = {}; this.initial = {};
    this.pickBox = null; this.zone = null; this.name = kind;
    this.active = false; // reçoit update() chaque frame
  }
  init(state) { this.state = { ...state }; this.initial = JSON.parse(JSON.stringify(state)); }
  applyState(patch, isReset = false) { Object.assign(this.state, patch); this.onState(patch, isReset); }
  onState(patch, isReset) { }
  reset() { this.applyState(JSON.parse(JSON.stringify(this.initial)), true); }
  // Hôte : modifie l'état et le réplique
  set(patch) { this.world.setState(this.id, patch); }
  // Texte affiché quand le joueur vise l'objet (null = pas interactif)
  prompt(player) { return null; }
  // Interaction côté joueur local. Retourne true si gérée localement (UI), sinon l'action est envoyée à l'hôte.
  local(verb, player) { return false; }
  // Interaction côté hôte
  interact(verb, actor, ctx) { }
  update(dt, t) { }
  // Boîte de visée (pour le rayon d'interaction)
  setPick(x0, y0, z0, x1, y1, z1) {
    if (!this.pickBox) { this.pickBox = new Box(x0, y0, z0, x1, y1, z1, LAYER.ALL, this); this.world.pick.add(this.pickBox); }
    else { this.pickBox.set(x0, y0, z0, x1, y1, z1); this.world.pick.update(this.pickBox); }
  }
  pickFromObject(obj3d, pad = 0.02) {
    const b = new THREE.Box3().setFromObject(obj3d);
    this.setPick(b.min.x - pad, b.min.y - pad, b.min.z - pad, b.max.x + pad, b.max.y + pad, b.max.z + pad);
  }
  get pos() { if (this.pickBox) return new THREE.Vector3((this.pickBox.min[0] + this.pickBox.max[0]) / 2, (this.pickBox.min[1] + this.pickBox.max[1]) / 2, (this.pickBox.min[2] + this.pickBox.max[2]) / 2); return new THREE.Vector3(); }
}

export class Zone {
  constructor(id, name, type, floor, x0, y0, z0, x1, y1, z1, opts = {}) {
    this.id = id; this.name = name; this.type = type; this.floor = floor;
    this.min = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
    this.max = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    this.extra = []; // boîtes additionnelles
    this.group = new THREE.Group(); this.group.name = 'zone:' + id;
    this.shop = opts.shop || null; this.circuit = opts.circuit || null;
    this.area = opts.area || id;
    this.lit = false; this.lightColor = opts.lightColor || [1, 0.95, 0.85];
    this.lightLevel = opts.lightLevel ?? 0.55;
    this.lights = []; // positions des lumières (pool)
    this.panelMat = null; this.signMats = [];
    this.alwaysVisible = !!opts.alwaysVisible;
    this.cull = opts.cull ?? 55;
    this.outdoor = !!opts.outdoor;
    this.temp = 19;
  }
  contains(x, y, z, pad = 0) {
    if (x >= this.min[0] - pad && x <= this.max[0] + pad && y >= this.min[1] - pad && y <= this.max[1] + pad && z >= this.min[2] - pad && z <= this.max[2] + pad) return true;
    for (const b of this.extra) if (x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5]) return true;
    return false;
  }
  distTo(x, y, z) {
    const dx = Math.max(this.min[0] - x, 0, x - this.max[0]);
    const dy = Math.max(this.min[1] - y, 0, y - this.max[1]);
    const dz = Math.max(this.min[2] - z, 0, z - this.max[2]);
    return Math.hypot(dx, dy * 1.5, dz);
  }
  get center() { return new THREE.Vector3((this.min[0] + this.max[0]) / 2, this.min[1] + 0.1, (this.min[2] + this.max[2]) / 2); }
  randomPoint(rnd = Math.random, margin = 1) {
    return new THREE.Vector3(this.min[0] + margin + rnd() * Math.max(0.1, this.max[0] - this.min[0] - margin * 2), this.min[1], this.min[2] + margin + rnd() * Math.max(0.1, this.max[2] - this.min[2] - margin * 2));
  }
}

// Graphe de navigation pour les présences (A*).
export class NavGraph {
  constructor() { this.nodes = new Map(); }
  node(id, x, y, z, zone, tags = []) { const n = { id, x, y, z, zone, tags, links: new Set() }; this.nodes.set(id, n); return n; }
  link(a, b, opts = {}) {
    const A = this.nodes.get(a), B = this.nodes.get(b);
    if (!A || !B) { console.warn('[nav] lien invalide', a, b); return; }
    A.links.add(b); B.links.add(a);
    (A.edges ||= {})[b] = opts; (B.edges ||= {})[a] = opts;
    if (opts.door) { (A.doors ||= {})[b] = opts.door; (B.doors ||= {})[a] = opts.door; }
    if (opts.vent) { A.vent = B.vent = true; }
  }
  chain(ids, opts) { for (let i = 0; i < ids.length - 1; i++) this.link(ids[i], ids[i + 1], opts); }
  nearest(x, y, z, filter = null) {
    let best = null, bd = Infinity;
    for (const n of this.nodes.values()) {
      if (filter && !filter(n)) continue;
      const d = (n.x - x) ** 2 + ((n.y - y) * 3) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  // A* ; blocked(nodeA, nodeB) -> true si le passage est bloqué (porte fermée…)
  path(fromId, toId, blocked = null, costFn = null) {
    if (fromId === toId) return [fromId];
    const open = new Map([[fromId, 0]]); const g = new Map([[fromId, 0]]); const came = new Map();
    const T = this.nodes.get(toId); if (!T) return null;
    const h = (id) => { const n = this.nodes.get(id); return Math.hypot(n.x - T.x, (n.y - T.y) * 2, n.z - T.z); };
    const f = new Map([[fromId, h(fromId)]]);
    let guard = 0;
    while (open.size && guard++ < 5000) {
      let cur = null, cf = Infinity;
      for (const [id] of open) { const v = f.get(id); if (v < cf) { cf = v; cur = id; } }
      if (cur === toId) { const out = [cur]; while (came.has(cur)) { cur = came.get(cur); out.unshift(cur); } return out; }
      open.delete(cur);
      const N = this.nodes.get(cur);
      for (const nb of N.links) {
        if (blocked && blocked(N, this.nodes.get(nb))) continue;
        const M = this.nodes.get(nb);
        const step = Math.hypot(M.x - N.x, (M.y - N.y) * 2, M.z - N.z) * (costFn ? costFn(N, M) : 1);
        const ng = g.get(cur) + step;
        if (ng < (g.get(nb) ?? Infinity)) { came.set(nb, cur); g.set(nb, ng); f.set(nb, ng + h(nb)); open.set(nb, true); }
      }
    }
    return null;
  }
}

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.physics = new PhysicsWorld(4);
    this.pick = new PhysicsWorld(2);
    this.objects = new Map();
    this.counters = new Map();
    this.zones = []; this.zoneMap = new Map();
    this.nav = new NavGraph();
    this.active = new Set();
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.points = {}; // points nommés (spawn, poste, b13…)
    this.cameras = []; // définitions de caméras CCTV
  }

  newId(prefix) { const n = (this.counters.get(prefix) || 0) + 1; this.counters.set(prefix, n); return prefix + n; }

  add(obj) {
    if (this.objects.has(obj.id)) console.warn('[world] id dupliqué', obj.id);
    this.objects.set(obj.id, obj);
    if (obj.active) this.active.add(obj);
    return obj;
  }
  get(id) { return this.objects.get(id); }
  setActive(obj, on) { obj.active = on; if (on) this.active.add(obj); else this.active.delete(obj); }

  addZone(z) { this.zones.push(z); this.zoneMap.set(z.id, z); this.root.add(z.group); return z; }
  zone(id) { return this.zoneMap.get(id); }
  zoneAt(x, y, z) {
    // la plus petite zone qui contient le point (les magasins avant la galerie…)
    let best = null, bv = Infinity;
    for (const zn of this.zones) {
      if (!zn.contains(x, y, z)) continue;
      const v = (zn.max[0] - zn.min[0]) * (zn.max[1] - zn.min[1]) * (zn.max[2] - zn.min[2]);
      if (v < bv) { bv = v; best = zn; }
    }
    return best;
  }

  // ── Réplication ──
  setState(id, patch) { this.game.sim.emit('obj', { id, s: patch }); }
  applyEffectState(p) { const o = this.objects.get(p.id); if (o) o.applyState(p.s); }

  // État complet (objets dont l'état diffère de l'initial) pour un joueur qui rejoint
  serialize() {
    const out = {};
    for (const [id, o] of this.objects) {
      if (o.transient) continue;
      const diff = {}; let any = false;
      for (const k in o.state) { if (JSON.stringify(o.state[k]) !== JSON.stringify(o.initial[k])) { diff[k] = o.state[k]; any = true; } }
      if (any) out[id] = diff;
    }
    return out;
  }
  deserialize(states) { for (const id in states) { const o = this.objects.get(id); if (o) o.applyState(states[id]); } }

  resetAll() { for (const o of this.objects.values()) { try { o.reset(); } catch (e) { console.error('[reset]', o.id, e); } } }

  update(dt, t) { for (const o of this.active) o.update(dt, t); }

  // Visibilité des zones selon la distance à la caméra (culling grossier)
  cull(pos, extraPositions = []) {
    for (const z of this.zones) {
      if (z.alwaysVisible) { z.group.visible = true; continue; }
      let d = z.distTo(pos.x, pos.y, pos.z);
      for (const p of extraPositions) d = Math.min(d, z.distTo(p.x, p.y, p.z));
      z.group.visible = d < z.cull;
    }
  }
}
