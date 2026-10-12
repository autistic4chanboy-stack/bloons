// Ambiances sonores (boucles d'ambiance selon le lieu, l'heure, la météo et le stress du joueur).
// Appelé par Environment.update() à chaque image.
export class Ambience {
  constructor(game, env) { this.game = game; this.env = env; this.ambience = {}; }
  amb(name, vol, param) {
    let a = this.ambience[name];
    if (vol <= 0.001) { if (a) { a.stop(1.5); delete this.ambience[name]; } return; }
    if (!a) { a = this.ambience[name] = this.game.loop(name, null, { volume: 0, bus: 'ambience' }); }
    a.setVolume(vol, 0.8); if (param) for (const k in param) a.setParam?.(k, param[k]);
  }
  update(dt, zone, outdoor) {
    const g = this.game; const t = zone?.type;
    const night = !g.isDay;
    const stress = (g.player?.stats.stress || 0) / 100;
    this.amb('drone', night && zone?.id !== 'security' ? 0.12 + stress * 0.35 : 0, { tension: stress });
    this.amb('hvac', !outdoor && t !== 'vent' && g.power?.isOn('hvac') ? (t === 'corridor' || t === 'backroom' ? 0.18 : 0.08) : 0);
    this.amb('wind', outdoor ? 0.4 + (this.env.weather === 'storm' ? 0.4 : 0) : t === 'vent' ? 0.08 : 0, { strength: this.env.weather === 'storm' ? 1 : 0.4 });
    this.amb('distant_traffic', outdoor || zone?.id === 'entrance' || zone?.id === 'ramp' ? 0.25 : t === 'atrium' ? 0.04 : 0);
    const rain = this.env.weather === 'rain' || this.env.weather === 'storm';
    this.amb('rain', rain ? (outdoor ? 0.7 : t === 'atrium' ? 0.35 : zone?.floor === 1 || zone?.id === 'entrance' ? 0.15 : 0.05) : 0, { intensity: this.env.weather === 'storm' ? 1 : 0.5 });
    this.amb('crowd', g.isDay && g.story?.crowdLevel ? g.story.crowdLevel * (t === 'corridor' || t === 'atrium' ? 0.5 : 0.25) : 0, { density: g.story?.crowdLevel || 0 });
    this.amb('fluorescent_buzz', zone && zone._level > 0.3 && (t === 'corridor' || t === 'backroom' || t === 'garage' || t === 'basement') ? 0.06 : 0);
    this.amb('electric_hum', zone?.type === 'basement' ? 0.15 : 0);
  }
}
