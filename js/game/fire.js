// Incendies : foyers qui grandissent et se propagent, fumée, chaleur, dégâts, extincteurs, pompiers.
// Simulé par l'hôte, diffusé aux pairs (effet 'fire') pour le rendu.
import * as THREE from 'three';
import { Net } from '../net/net.js';

export class Fire {
  constructor(game) {
    this.game = game; this.cells = []; this.loops = new Map(); this.syncT = 0; this.light = null; this.status = null;
    const S = game.sim;
    S.action('ignite', (p) => this.ignite(new THREE.Vector3(...p.pos), p.cause));
    S.action('extinguish', (p) => this.extinguish(new THREE.Vector3(...p.o), new THREE.Vector3(...p.d), p.power || 0.25));
    S.effect('fire', (p) => { if (!Net.isHost) this.cells = p.c.map(a => ({ pos: new THREE.Vector3(a[0], a[1], a[2]), size: a[3], zone: a[4] })); this.refreshFx(); });
    S.effect('sparks', (p) => { const pos = new THREE.Vector3(...p.pos); game.particles.sparksAt(pos, 40); game.sfx('neon_flicker', pos, { volume: 1 }); game.sfx('electric_hum', pos, { volume: 0.6 }); game.particles.smokeAt(pos, 2, 0.25, 30); });
    this.lightSrc = { getLight: () => { if (!this.cells.length) return null; const c = this.biggest(); return { pos: c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), color: [1, 0.45 + Math.random() * 0.1, 0.12], intensity: 6 * c.size + Math.random() * 2, distance: 9 + c.size * 6, priority: 0.5 }; } };
    game.lighting.addSource(this.lightSrc);
    game.hooks.on('metal_in_microwave', (d) => { setTimeout(() => { if (Net.isHost && d.dev.state.on) { this.game.sim.emit('sparks', { pos: d.dev.center.toArray() }); if (Math.random() < 0.6) this.ignite(d.dev.center, 'micro-ondes'); } }, 3000); });
  }
  get active() { return this.cells.length > 0; }
  maxSize() { return this.cells.reduce((m, c) => Math.max(m, c.size), 0); }
  biggest() { return this.cells.reduce((a, b) => (a.size > b.size ? a : b)); }
  zoneId() { return this.cells[0]?.zone || null; }
  totalMass() { return this.cells.reduce((a, c) => a + c.size, 0); }
  reset() { this.cells = []; this.status = null; this.firemen = null; this.refreshFx(); }
  heatAt(pos) { let h = 0; for (const c of this.cells) { const d = c.pos.distanceTo(pos); if (d < 6) h += (1 - d / 6) * 25 * c.size; } return h; }

  ignite(pos, cause = '') {
    const g = this.game; if (!Net.isHost) return;
    const z = g.world.zoneAt(pos.x, pos.y + 0.5, pos.z);
    this.cells.push({ pos: pos.clone(), size: 0.12, zone: z?.id || null, spread: 0, cause });
    if (!this.status) { this.status = 'burning'; this.startedAt = g.time; g.hooks.emit('fire_started', { pos, cause, zone: z?.id }); g.story.outcome.fire = 'burning'; }
    this.syncNow();
  }
  extinguish(o, d, power) {
    if (!Net.isHost) return;
    let hit = false;
    for (const c of this.cells) {
      const to = c.pos.clone().add(new THREE.Vector3(0, 0.4, 0)).sub(o); const dist = to.length();
      if (dist < 5.5 && to.normalize().dot(d) > 0.82) { c.size -= power * 0.35 * (1.3 - dist / 6); hit = true; }
    }
    if (hit) { this.cells = this.cells.filter(c => c.size > 0.03); this.checkOut('extinguished'); this.syncNow(); }
  }
  checkOut(how) {
    const g = this.game;
    if (this.cells.length === 0 && this.status === 'burning') { this.status = 'out'; g.story.outcome.fire = how; g.sim.emit('toast', { text: how === 'firemen' ? 'Les pompiers ont maîtrisé l\'incendie.' : 'Le feu est éteint !' }); g.hooks.emit('fire_out', { how }); }
  }
  blow(o, d) { /* le ventilateur / sèche-cheveux attise légèrement le feu */ if (!Net.isHost) return; for (const c of this.cells) { const to = c.pos.clone().sub(o); if (to.length() < 3 && to.normalize().dot(d) > 0.8) c.size = Math.min(1, c.size + 0.02); } }
  firemenArrive() {
    // les pompiers éteignent tout en quelques secondes
    if (!Net.isHost) return;
    this.firemen = this.game.time;
  }

  update(dt) {
    const g = this.game;
    if (!this.cells.length) return;
    const elecCut = !g.power.isOn('electro') && !g.power.isOn('shops0');
    for (const c of [...this.cells]) {
      const rate = (c.cause === 'wiring' && elecCut ? 0.008 : 0.016) * (1 + Math.random() * 0.3);
      c.size = Math.min(1.2, c.size + rate * dt);
      c.spread += dt;
      if (c.size > 0.6 && c.spread > 18 && this.cells.length < 14) {
        c.spread = 0;
        const z = g.world.zone(c.zone);
        const np = c.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
        if (!z || z.contains(np.x, np.y + 0.5, np.z, 0.5)) this.cells.push({ pos: np, size: 0.15, zone: c.zone, spread: 0, cause: c.cause });
      }
    }
    // pompiers sur place
    if (this.firemen !== null && this.firemen !== undefined) { for (const c of this.cells) c.size -= dt * 0.08; this.cells = this.cells.filter(c => c.size > 0.03); if (!this.cells.length) { this.firemen = null; this.checkOut('firemen'); } }
    // catastrophe
    if (this.totalMass() > 11 && this.status === 'burning' && g.story.phase === 'night') { this.status = 'catastrophic'; g.story.outcome.fire = 'catastrophic'; g.story.fail('L\'incendie s\'est propagé à tout le magasin. Le centre est évacué au milieu de la nuit.'); }
    // dégâts aux joueurs (local)
    const p = g.player; if (p.alive) {
      let dmg = 0; let smoke = 0;
      for (const c of this.cells) { const d = c.pos.distanceTo(p.pos); if (d < 1.3 * (0.5 + c.size)) dmg += c.size * 18; if (d < 9) smoke += c.size * (1 - d / 9); }
      if (p.hasCostumeEffect('fire_resist')) dmg *= 0.2;
      if (dmg > 0) { p.damage(dmg * dt, 'fire'); if (Math.random() < dt * 2) g.sfx('fire_whoosh', null, { volume: 0.4, bus: 'ui' }); }
      if (smoke > 0.4 && !p.hasCostumeEffect('smoke_immune')) { p.stats.stress = Math.min(100, p.stats.stress + smoke * dt * 6); p.stats.stamina = Math.max(0, p.stats.stamina - smoke * dt * 8); if (smoke > 1.5) p.damage(dt * smoke * 1.5, 'fire'); if (Math.random() < dt * 0.4) g.sfx('breathing_heavy', null, { volume: 0.4, bus: 'ui' }); }
    }
    this.syncT += dt; if (this.syncT > 0.5) { this.syncT = 0; this.syncNow(); }
    // effets visuels locaux
    this.fxT = (this.fxT || 0) + dt;
    if (this.fxT > 0.05) { this.fxT = 0; for (const c of this.cells) { g.particles.fireAt(c.pos, 2, 0.6 + c.size); if (Math.random() < 0.5) g.particles.smokeAt(c.pos.clone().add(new THREE.Vector3(0, 1 + c.size, 0)), 1, 0.08, 50 + c.size * 40); } }
  }
  syncNow() { if (!Net.isHost) return; this.game.sim.emit('fire', { c: this.cells.map(c => [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2), +c.size.toFixed(2), c.zone]) }); }
  refreshFx() {
    const g = this.game;
    // une boucle de crépitement par foyer (max 4)
    const keep = new Set();
    this.cells.slice(0, 4).forEach((c, i) => { keep.add(i); let l = this.loops.get(i); if (!l) { l = g.loop('fire_crackle', c.pos, { volume: 0.9, ref: 3, param: { size: c.size } }); this.loops.set(i, l); } l.setPos(c.pos); l.setParam?.('size', Math.min(1, c.size)); });
    for (const [i, l] of this.loops) if (!keep.has(i)) { l.stop(0.8); this.loops.delete(i); }
    if (!Net.isHost && this.cells.length) { for (const c of this.cells) { g.particles.fireAt(c.pos, 3, 0.6 + c.size); g.particles.smokeAt(c.pos.clone().add(new THREE.Vector3(0, 1, 0)), 2, 0.08, 60); } }
  }
}
