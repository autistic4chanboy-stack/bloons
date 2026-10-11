// Électricité et éclairage.
// - Power : réseau (mains), disjoncteurs par circuit, fusibles grillés, groupe électrogène (carburant).
// - Lighting : état allumé/éteint des zones, rendu (lumière de zone, néons, enseignes), pool de lumières
//   dynamiques (8 PointLights fixes, réassignées chaque frame aux sources les plus proches).
import * as THREE from 'three';
import { WorldObject } from './world.js';

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
  load() { let n = 0; for (const z in this.state.lit) if (this.state.lit[z]) n++; return n; }
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

export class Lighting {
  constructor(game) {
    this.game = game; this.world = game.world;
    this.pool = []; this.sources = new Set();
    for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xfff0d8, 0, 14, 1.6); l.castShadow = false; this.pool.push(l); game.scene.add(l); }
    this._dirty = true; this.flicker = new Map(); this.t = 0;
    this.dayFactor = 0; // 1 = plein jour (magasins ouverts)
    this.nightLights = true;
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

  update(dt, camPos) {
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
      // éclairage de secours (veilleuses) dans les galeries et couloirs
      let base = 0;
      if (em && !lit) { if (z.circuit === 'gallery') base = 0.05; else if (z.circuit === 'service' || z.circuit === 'basement' || z.circuit === 'garage') base = 0.03; else if (z.circuit === 'security') base = 0.02; }
      const day = (z.circuit === 'gallery' || z.id === 'atrium') ? this.dayFactor : 0;
      const L = Math.max(level * z.lightLevel, base, day * 0.9);
      z.lit = L > 0.2;
      z._level = L;
      const c = z.lightColor;
      const K = 3.4; M.setZoneLight(z.id, c[0] * L * K, c[1] * L * K, c[2] * L * K);
      if (z.panelMat) z.panelMat.color.setRGB(0.08 + level * 3.2 * c[0] + base * 2, 0.08 + level * 3.2 * c[1] + base * 2, 0.08 + level * 3.0 * c[2] + base * 2);
      for (const sm of z.signMats) { const k = 0.18 + Math.max(level, day) * 1.6; sm.color.setRGB(k, k, k); }
    }
    // pool : sources candidates
    const cands = [];
    for (const z of this.world.zones) {
      if (!z._level || z._level < 0.15 || !z.lights.length) continue;
      if (!z.group.visible && z.distTo(camPos.x, camPos.y, camPos.z) > 25) continue;
      for (const p of z.lights) { const d = p.distanceToSquared(camPos); if (d < 1600) cands.push({ pos: p, d, color: z.lightColor, intensity: 9 * z._level, dist: 13 }); }
    }
    for (const s of this.sources) {
      const l = s.getLight && s.getLight(); if (!l) continue;
      const d = l.pos.distanceToSquared(camPos); if (d < 2500) cands.push({ pos: l.pos, d: d * (l.priority ?? 1), color: l.color, intensity: l.intensity, dist: l.distance || 8, colorHex: l.hex });
    }
    cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.pool.length; i++) {
      const L = this.pool[i]; const c = cands[i];
      if (!c) { L.intensity = 0; continue; }
      L.position.copy(c.pos);
      if (c.colorHex !== undefined) L.color.set(c.colorHex); else L.color.setRGB(c.color[0], c.color[1], c.color[2]);
      // fondu doux selon la distance (évite les « pops »)
      const fade = THREE.MathUtils.clamp(1 - (Math.sqrt(c.d) - 28) / 12, 0, 1);
      L.intensity = c.intensity * fade; L.distance = c.dist;
    }
  }
}
