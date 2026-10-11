// Alarmes et sonorisation : alarmes de magasins (armement depuis la console), alarme incendie générale,
// régie d'annonces (voix, carillon, musique diffusée dans tout le centre), disjoncteurs et fusibles.
import * as THREE from 'three';
import { Net } from '../net/net.js';

export class Alarms {
  constructor(game) {
    this.game = game; this.sirens = new Map(); this.paMusic = null; this.fireBell = null; this.fireAlarmOn = false;
    const S = game.sim;
    // ── régie / annonces ──
    S.action('pa', (p, actor) => {
      if (!game.power.isOn('pa') && !p.system) { game.sim.emit('toast', { text: 'La sonorisation n\'est pas alimentée (disjoncteur « Sonorisation »).' }, { to: actor }); return; }
      game.sim.emit('pa', p);
      if (p.text) game.hooks.emit('pa_announce', { text: p.text, actor });
    });
    S.effect('pa', (p) => this.applyPA(p));
    // ── disjoncteurs ──
    S.action('breaker', (p, actor) => { const b = { ...game.power.state.breakers, [p.c]: !!p.on }; game.power.set({ breakers: b }); game.hooks.emit('breaker', { c: p.c, on: p.on, actor }); });
    S.action('fuse', (p, actor) => { const pr = game.props.get(p.prop); if (!pr) return; pr.set({ where: 'gone' }); const bl = { ...game.power.state.blown }; delete bl[p.c]; game.power.set({ blown: bl }); game.sim.emit('fx', { s: 'breaker', pos: game.world.points.breakers?.toArray() }); });
    // ── alarmes de magasin ──
    S.action('shop_alarm', (p) => { const a = { ...game.power.state.alarms, [p.shop]: !!p.on }; game.power.set({ alarms: a }); });
    game.hooks.on('glass_broken', (d) => { if (d.shop) this.trigger(d.shop, 'vitre brisée'); if (d.car) { const car = game.world.get(d.car); car?.alarmOn?.(); } this.game.noise(d.pane.mesh.position, 1, 'glass'); });
    game.hooks.on('door_forced', (d) => { if (d.door.o.shop) this.trigger(d.door.o.shop, 'porte forcée'); });
    game.hooks.on('alarm_trigger', (d) => { if (d.shop) this.trigger(d.shop, d.reason); });
    S.effect('siren', (p) => this.applySiren(p));
    S.effect('firebell', (p) => this.applyFireBell(p.on));
  }
  get power() { return this.game.power; }
  reset() {
    for (const s of this.sirens.values()) s.stop(0.2); this.sirens.clear();
    if (this.paMusic) { this.paMusic.stop(0.5); this.paMusic = null; }
    this.applyFireBell(false); this.fireAlarmOn = false; this.fireAlarmT = 0;
  }
  // Hôte : déclenche l'alarme d'un magasin si elle est armée
  trigger(shop, reason) {
    const g = this.game; if (!Net.isHost) return;
    if (!this.power.state.alarms[shop]) return;
    g.sim.emit('siren', { shop, on: true, reason });
    g.hooks.emit('shop_alarm', { shop, reason });
    setTimeout(() => g.sim.emit('siren', { shop, on: false }), 45000);
  }
  applySiren(p) {
    const g = this.game; const ctl = g.world.shops[p.shop];
    if (p.on) {
      if (!this.sirens.has(p.shop) && ctl) { const pos = ctl.signPos || new THREE.Vector3((ctl.x0 + ctl.x1) / 2, ctl.y + 3, ctl.zF); this.sirens.set(p.shop, g.loop('shop_alarm', pos, { volume: 1, ref: 8, maxDist: 120 })); }
      g.ui.alert('ALARME — ' + (ctl?.shop.name || p.shop) + (p.reason ? ' (' + p.reason + ')' : ''), 'warn', 10);
      g.lighting.flickerZone(p.shop, 3);
    } else { const s = this.sirens.get(p.shop); if (s) { s.stop(0.3); this.sirens.delete(p.shop); } }
  }
  // Alarme incendie générale (déclencheur manuel ou fumée)
  fireAlarm(actor, src) {
    const g = this.game; if (this.fireAlarmOn) return;
    this.fireAlarmOn = true; this.fireAlarmT = 60;
    g.sim.emit('firebell', { on: true });
    g.hooks.emit('fire_alarm', { actor, src });
    // la télésurveillance prévient les pompiers automatiquement
    g.phone.dispatch('pompiers', { auto: true, reason: 'alarme incendie', location: src?.zone });
  }
  applyFireBell(on) {
    const g = this.game;
    if (on && !this.fireBell) { this.fireBell = g.loop('fire_bell', null, { volume: 0.55, bus: 'ambience' }); g.ui.alert('ALARME INCENDIE GÉNÉRALE', 'warn', 12); }
    if (!on && this.fireBell) { this.fireBell.stop(0.5); this.fireBell = null; }
  }
  applyPA(p) {
    const g = this.game;
    const voice = () => { if (p.text) g.say(p.child ? 'Haut-parleurs (voix d\'enfant)' : 'Annonce', p.text, { pitch: p.child ? 1.8 : 1, rate: p.child ? 0.9 : 0.95 }); };
    if (p.feedback) { g.sfx('crt_whine', null, { volume: 0.5, bus: 'ambience' }); g.sfx('static_burst', null, { volume: 0.6, bus: 'ambience' }); return; }
    if (p.bell) { const b = g.loop('fire_bell', null, { volume: 0.5, bus: 'ambience' }); setTimeout(() => b.stop(0.3), 3000); return; }
    if (p.music !== undefined) {
      if (this.paMusic) { this.paMusic.stop(1); this.paMusic = null; }
      if (p.music && p.music !== 'stop') this.paMusic = g.music(p.music, { volume: 0.32, bus: 'music' });
      return;
    }
    if (p.chime) { g.sfx('pa_chime', null, { volume: 0.7, bus: 'ambience' }); setTimeout(voice, 2600); } else voice();
  }
  update(dt) {
    const g = this.game;
    if (this.fireAlarmOn) { this.fireAlarmT -= dt; if (this.fireAlarmT <= 0 && !g.fire.active) { this.fireAlarmOn = false; g.sim.emit('firebell', { on: false }); for (const d of g.devices.kind('fire_alarm')) if (d.state.pulled) d.set({ pulled: false }); } }
    // détecteurs de fumée : feu actif → alarme générale
    if (g.fire.active && g.fire.maxSize() > 0.25 && !this.fireAlarmOn) this.fireAlarm(null, { zone: g.fire.zoneId() });
  }
}
