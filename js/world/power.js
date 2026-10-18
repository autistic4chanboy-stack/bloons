// Électricité et éclairage.
// - Power : réseau (mains), disjoncteurs par circuit, fusibles grillés, groupe électrogène (carburant).
// - Lighting : état allumé/éteint des zones, rendu (lumière de zone, néons, enseignes, blocs de secours), pool de
//   lumières dynamiques (8 PointLights fixes, réassignées chaque frame aux sources les plus proches).
import * as THREE from 'three';
import { WorldObject } from './world.js';
import { patchZone, GLOBAL_UNIFORMS } from '../engine/materials.js';

export const CIRCUITS = {
  gallery: 'Galeries & hall', shops0: 'Magasins RDC', shops1: 'Magasins étage', electro: 'ElectroMaison', service: 'Couloirs de service',
  security: 'Poste de sécurité', cameras: 'Caméras & enregistreur', basement: 'Sous-sol', garage: 'Parking', pa: 'Sonorisation', hvac: 'Ventilation', roof: 'Toit',
};

export class PowerGrid extends WorldObject {
  constructor(world) {
    super(world, 'power', 'power');
    const breakers = {}; for (const c in CIRCUITS) breakers[c] = true;
    this.init({ mains: true, breakers, blown: {}, gen: { running: false, fuel: 35, rpm: 0 }, lit: {}, doorClosed: false, hatchClosed: false, alarms: {}, mainEntrance: false, escalators: false, fountain: false, emergency: true });
    this.name = 'Réseau électrique';
    world.add(this);
    this.genLoop = null;
  }
  // circuit alimenté ?
  isOn(c) {
    if (!c) return true;
    const s = this.state;
    if (s.breakers[c] === false || s.blown[c]) return false;
    if (c === 'electro' && (s.breakers.shops0 === false || s.blown.shops0)) return false;
    if (s.mains) return true;
    return s.gen.running && s.gen.fuel > 0;
  }
  zoneOn(zone) { const z = typeof zone === 'string' ? this.world.zone(zone) : zone; return z ? this.isOn(z.circuit) : true; }
  get onGenerator() { return !this.state.mains && this.state.gen.running && this.state.gen.fuel > 0; }
  get blackout() { return !this.state.mains && !(this.state.gen.running && this.state.gen.fuel > 0); }
  // charge électrique (zones éclairées + verrous magnétiques de la porte blindée et de la trappe)
  load() { let n = 0; for (const z in this.state.lit) if (this.state.lit[z]) n++; if (this.state.doorClosed) n += 4; if (this.state.hatchClosed) n += 2; return n; }
  onState(patch, isReset) {
    const g = this.world.game;
    g.lighting?.dirty();
    if ('gen' in patch || isReset) {
      const gen = this.state.gen;
      if (gen.running && !this.genLoop) this.genLoop = g.loop('generator', this.world.points.generator?.clone().setY(-3.8) || new THREE.Vector3(), { volume: 1, ref: 3, param: { rpm: 0.8 } });
      if (!gen.running && this.genLoop) { this.genLoop.stop(0.6); this.genLoop = null; }
    }
    if ('mains' in patch && !isReset && patch.mains !== this._prevMains) {
      if (!patch.mains) { g.sfx('power_down', g.camPos(), { bus: 'sfx', volume: 0.9 }); g.hooks.emit('power_lost'); }
      else { g.sfx('power_up', g.camPos(), { volume: 0.7 }); g.hooks.emit('power_back'); }
    }
    this._prevMains = this.state.mains;
    g.hooks.emit('power_state', patch);
  }
}

// Éclairage. La nuit, une zone éteinte est presque noire (veilleuses très faibles) : la lampe torche est la vraie source
// de lumière. Restent visibles : les blocs de secours (panneaux SORTIE, qui éclairent un peu le mur et le sol autour
// d'eux via le pool), les sources d'appareils (distributeurs, écrans…), la lune et les lampadaires (ouvertures, voir
// environment.js). Au premier update, les néons et enseignes (MeshBasicMaterial posés par l'architecture) deviennent des
// matériaux standard émissifs : éteints, ils ne brillent plus mais la lampe torche les éclaire comme une vraie surface.
// Conventions pour l'architecture :
//  - world.emergencyLights = [{ pos: Vector3 | [x, y, z], color?: [r, g, b], intensity?, distance? }] : blocs de secours
//    explicites ; sinon tout mesh avec userData.exitSign / userData.emergency (ou, à défaut, un plan 0,6 × 0,22 en
//    MeshBasicMaterial : les panneaux SORTIE actuels) en devient un, 0,35 m devant sa face avant (+Z local) ;
//  - zone.panelMat / zone.signMats : pilotés ici (émissif selon le niveau de la zone).
// Les lumières du pool gardent la boîte de leur zone (masque dans le shader des matériaux de zone, voir materials.js) :
// une lampe de magasin n'éclaire pas à travers le mur du voisin ; le fondu (1,5 m) laisse filer un peu de lumière par
// les vitrines et sous les portes.
const POOL = 8, MAXC = 96;
export class Lighting {
  constructor(game) {
    this.game = game; this.world = game.world;
    this.pool = []; this.sources = new Set();
    // decay 1,6 + n × 0,001 : identifie l'emplacement n du pool dans le shader (masque de zone)
    for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xfff0d8, 0, 14, 1.6 + (i + 1) * 0.001); l.castShadow = false; this.pool.push(l); game.scene.add(l); }
    this._dirty = true; this.flicker = new Map(); this.t = 0;
    this.dayFactor = 0; // 1 = plein jour (magasins ouverts)
    this.nightLights = true;
    // candidats du pool (préalloués : aucune allocation par image)
    this.cands = []; for (let i = 0; i < MAXC; i++) this.cands.push({ pos: null, d: 0, r: 1, g: 1, b: 1, hex: undefined, intensity: 0, dist: 8, zone: null });
    this.best = new Array(POOL).fill(null);
    this.emergency = null; this.prepared = false;
  }
  dirty() { this._dirty = true; }
  get power() { return this.game.power; }
  isLit(zoneId) {
    const z = this.world.zone(zoneId); if (!z) return false;
    return !!this.power.state.lit[zoneId] && this.power.zoneOn(z);
  }
  // hôte : bascule une zone
  toggle(zoneId, actor) { const cur = !!this.power.state.lit[zoneId]; this.set(zoneId, !cur); }
  set(zoneId, on) { const lit = { ...this.power.state.lit, [zoneId]: on }; this.power.set({ lit }); }
  setMany(map) { this.power.set({ lit: { ...this.power.state.lit, ...map } }); }
  addSource(src) { this.sources.add(src); }
  removeSource(src) { this.sources.delete(src); }
  flickerZone(zoneId, dur = 2) { this.flicker.set(zoneId, { t: dur, seed: Math.random() * 100 }); }

  // Une fois le centre construit : néons et enseignes en matériaux émissifs éclairables, repérage des blocs de secours
  prepare() {
    this.prepared = true;
    const M = this.game.mats, users = new Map();
    const scan = (root, zone) => root.traverse((o) => { if (!o.isMesh || !o.material || Array.isArray(o.material)) return; let e = users.get(o.material); if (!e) users.set(o.material, e = []); e.push({ mesh: o, zone }); });
    for (const z of this.world.zones) scan(z.group, z);
    for (const z of this.world.zones) {
      const pm = z.panelMat;
      if (pm && pm.isMeshBasicMaterial) {
        const nm = patchZone(new THREE.MeshStandardMaterial({ color: 0xe9eef0, roughness: 0.45, metalness: 0 }), M.zoneUniform(z.id));
        for (const u of users.get(pm) || []) u.mesh.material = nm;
        z.panelMat = nm;
      }
      z.signMats = z.signMats.map((sm) => {
        if (!sm || !sm.isMeshBasicMaterial) return sm;
        const us = users.get(sm) || [];
        const nm = patchZone(new THREE.MeshStandardMaterial({ map: sm.map, emissiveMap: sm.map, emissive: 0xffffff, roughness: 0.4, metalness: 0, side: sm.side, transparent: sm.transparent }), M.zoneUniform(us[0]?.zone?.id || z.id));
        for (const u of us) u.mesh.material = nm;
        return nm;
      });
    }
    // blocs de secours
    const em = [], V = THREE.Vector3;
    for (const e of this.world.emergencyLights || []) em.push({ pos: e.pos instanceof V ? e.pos.clone() : new V(...e.pos), color: e.color || [0.72, 1, 0.78], intensity: e.intensity ?? 0.6, dist: e.distance ?? 5 });
    this.world.root.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry?.parameters;
      if (!(o.userData.exitSign || o.userData.emergency || (o.material?.isMeshBasicMaterial && o.geometry?.type === 'PlaneGeometry' && p && Math.abs(p.width - 0.6) < 1e-3 && Math.abs(p.height - 0.22) < 1e-3))) return;
      o.updateWorldMatrix(true, false);
      const pos = new V().setFromMatrixPosition(o.matrixWorld).addScaledVector(new V(0, 0, 1).transformDirection(o.matrixWorld), 0.35); pos.y -= 0.2;
      em.push({ pos, color: [0.72, 1, 0.78], intensity: 0.6, dist: 5 });
    });
    for (const e of em) e.zone = this.world.zoneAt(e.pos.x, e.pos.y, e.pos.z);
    this.emergency = em;
  }

  _cand(n, pos, d, r, g, b, hex, intensity, dist, zone = null) {
    if (n >= MAXC) return n;
    const c = this.cands[n]; c.pos = pos; c.d = d; c.r = r; c.g = g; c.b = b; c.hex = hex; c.intensity = intensity; c.dist = dist; c.zone = zone;
    return n + 1;
  }

  update(dt, camPos) {
    if (!this.prepared) this.prepare();
    this.t += dt;
    const P = this.power; const M = this.game.mats;
    const em = P.state.emergency && !P.blackout;
    for (const z of this.world.zones) {
      let lit = !!P.state.lit[z.id] && P.zoneOn(z);
      let level = lit ? 1 : 0;
      const fl = this.flicker.get(z.id);
      if (fl) {
        fl.t -= dt; if (fl.t <= 0) this.flicker.delete(z.id);
        const n = Math.sin(this.t * 37 + fl.seed) * Math.sin(this.t * 13.7 + fl.seed * 2);
        level = (lit ? 1 : 0.6) * (n > 0.1 ? 1 : 0.05);
        if (!lit) level *= 0.5;
      }
      // veilleuses de secours : à peine de quoi deviner les volumes (la nuit doit être noire)
      let base = 0;
      if (em && !lit) { if (z.circuit === 'gallery') base = 0.0035; else if (z.circuit === 'service' || z.circuit === 'basement' || z.circuit === 'garage') base = 0.002; }
      const day = (z.circuit === 'gallery' || z.id === 'atrium') ? this.dayFactor : 0;
      const L = Math.max(level * z.lightLevel, base, day * 0.9);
      z.lit = L > 0.2;
      z._level = L;
      const c = z.lightColor;
      const K = 3.4; M.setZoneLight(z.id, c[0] * L * K, c[1] * L * K, c[2] * L * K);
      const pm = z.panelMat;
      if (pm) { const e = pm.emissive || pm.color, k = pm.emissive ? 0 : 0.01; e.setRGB(k + level * 3.2 * c[0] + base * 1.5, k + level * 3.2 * c[1] + base * 1.5, k + level * 3.0 * c[2] + base * 1.5); }
      for (const sm of z.signMats) { const k = 0.003 + Math.max(level, day) * 1.6; (sm.emissive || sm.color).setRGB(k, k, k); }
    }
    // matériaux sans zone (objets lâchés, objet en main, vitres) : lumière de la zone où se trouve la caméra
    const cz = this.world.zoneAt(camPos.x, camPos.y, camPos.z);
    M.zoneUniform(null).value.copy(cz ? M.zoneUniform(cz.id).value : _black);
    // pool : sources candidates
    let n = 0;
    for (const z of this.world.zones) {
      if (!z._level || z._level < 0.15 || !z.lights.length) continue;
      if (!z.group.visible && z.distTo(camPos.x, camPos.y, camPos.z) > 25) continue;
      for (const p of z.lights) { const d = p.distanceToSquared(camPos); if (d < 1600) n = this._cand(n, p, d, z.lightColor[0], z.lightColor[1], z.lightColor[2], undefined, 9 * z._level, 13, z); }
    }
    for (const s of this.sources) {
      const l = s.getLight && s.getLight(); if (!l) continue;
      const d = l.pos.distanceToSquared(camPos); if (d < 2500) n = this._cand(n, l.pos, d * (l.priority ?? 1), l.color[0], l.color[1], l.color[2], l.hex, l.intensity, l.distance || 8, l.zone || null); // l.zone : boîte {min, max} qui borne la lumière (lampadaires)
    }
    // blocs de secours (sur batterie : toujours là, plus faibles pendant une panne totale) dans les zones éteintes
    if (this.emergency && P.state.emergency) {
      const k = P.blackout ? 0.6 : 1;
      for (const e of this.emergency) {
        if (e.zone && (e.zone._level || 0) > 0.3) continue;
        const d = e.pos.distanceToSquared(camPos); if (d < 900) n = this._cand(n, e.pos, d * 1.6, e.color[0], e.color[1], e.color[2], undefined, e.intensity * k, e.dist, e.zone);
      }
    }
    // les POOL plus proches (sélection partielle, sans tri ni allocation)
    const best = this.best; best.fill(null);
    for (let i = 0; i < n; i++) {
      const c = this.cands[i]; let j = POOL - 1;
      if (best[j] && best[j].d <= c.d) continue;
      while (j > 0 && (!best[j - 1] || best[j - 1].d > c.d)) { best[j] = best[j - 1]; j--; }
      best[j] = c;
    }
    const PM = GLOBAL_UNIFORMS.poolMin.value, PX = GLOBAL_UNIFORMS.poolMax.value;
    for (let i = 0; i < POOL; i++) {
      const L = this.pool[i]; const c = best[i];
      if (!c) { L.intensity = 0; PM[i].w = 0; continue; }
      const z = c.zone;
      if (z) { PM[i].set(z.min[0] - 0.1, z.min[1] - 0.1, z.min[2] - 0.1, 1); PX[i].set(z.max[0] + 0.1, z.max[1] + 0.1, z.max[2] + 0.1, 1.5); } else PM[i].w = 0;
      L.position.copy(c.pos);
      if (c.hex !== undefined) L.color.set(c.hex); else L.color.setRGB(c.r, c.g, c.b);
      // fondu doux selon la distance (évite les « pops »)
      const fade = THREE.MathUtils.clamp(1 - (Math.sqrt(c.d) - 28) / 12, 0, 1);
      L.intensity = c.intensity * fade; L.distance = c.dist;
    }
  }
}
const _black = new THREE.Color(0, 0, 0);
