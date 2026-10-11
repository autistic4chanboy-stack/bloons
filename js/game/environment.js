// Environnement : heure, ciel (dôme procédural : dégradé, soleil, lune, étoiles, nuages, pollution lumineuse),
// lumières globales, brouillard, météo (pluie, orage, éclairs), ambiances sonores, réverbération par zone,
// température (zones froides).
import * as THREE from 'three';
import { Audio } from '../engine/audio.js';

const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.9999; }';
const SKY_FRAG = /* glsl */`
uniform vec3 zenith, horizon, sunDir, moonDir, sunColor; uniform float stars, time, clouds, flash, cityGlow, sunVis, moonVis;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += noise(p) * a; p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
  if (d.y < 0.0) col = mix(horizon * 0.35, vec3(0.01), clamp(-d.y * 4.0, 0.0, 1.0));
  // pollution lumineuse de la ville
  col += vec3(0.55, 0.32, 0.12) * cityGlow * exp(-max(d.y, 0.0) * 9.0) * step(-0.05, d.y);
  // étoiles
  if (stars > 0.0 && d.y > 0.0) { vec3 sp = floor(d * 420.0); float s = hash(sp); if (s > 0.996) col += vec3(0.9, 0.95, 1.0) * (s - 0.996) * 250.0 * stars * (0.6 + 0.4 * sin(time * 3.0 + s * 100.0)) * smoothstep(0.0, 0.25, d.y); }
  // soleil
  float sd = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(sd, 1200.0) * 40.0 + pow(sd, 12.0) * 0.35) * sunVis;
  // lune
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99955, 0.99975, md) * 2.2 + pow(md, 60.0) * 0.12) * moonVis;
  // nuages
  if (clouds > 0.0 && d.y > 0.0) { vec2 uv = d.xz / (d.y + 0.15); float c = fbm(vec3(uv * 1.3 + vec2(time * 0.01, time * 0.004), time * 0.005)); c = smoothstep(0.45, 0.8, c) * clouds; vec3 cc = mix(col, horizon * 1.4 + vec3(0.05) * cityGlow, 0.6); col = mix(col, cc, c * 0.85); }
  col += vec3(0.7, 0.75, 0.9) * flash;
  gl_FragColor = vec4(col, 1.0);
}`;

function lerpC(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }

export class Environment {
  constructor(game) {
    this.game = game;
    this.minutes = 22 * 60; this.timeScale = 0; this.day = 0;
    this.weather = 'clear'; this.rainAmt = 0; this.flashT = 0; this.nextThunder = 20;
    const sc = game.scene;
    this.hemi = new THREE.HemisphereLight(0x8090b0, 0x202020, 0.02); sc.add(this.hemi);
    this.ambLight = new THREE.AmbientLight(0xffffff, 0.0); sc.add(this.ambLight);
    this.sun = new THREE.DirectionalLight(0xffeedd, 0); this.sun.position.set(100, 80, 40); sc.add(this.sun); sc.add(this.sun.target);
    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, moonDir: { value: new THREE.Vector3(-0.4, 0.5, 0.6).normalize() }, sunColor: { value: new THREE.Color(1, 0.8, 0.5) }, stars: { value: 1 }, time: { value: 0 }, clouds: { value: 0.4 }, flash: { value: 0 }, cityGlow: { value: 1 }, sunVis: { value: 1 }, moonVis: { value: 1 } } });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(650, 32, 16), this.skyMat); this.sky.renderOrder = -10; this.sky.frustumCulled = false; sc.add(this.sky);
    sc.fog = new THREE.FogExp2(0x05060a, 0.02);
    this.ambience = {}; this.coldSpots = [];
    this.lastZoneType = null;
  }
  setTime(min) { this.minutes = ((min % 1440) + 1440) % 1440; }
  hhmm() { const m = Math.floor(this.minutes); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  // minutes depuis 22:00 (la nuit), peut être négatif le jour
  get nightMinutes() { let m = this.minutes - 22 * 60; if (m < -12 * 60) m += 1440; return m; }
  setWeather(kind) {
    if (kind === 'thunder') { this.thunder(); return; }
    if (kind === 'hail') { this.weather = 'storm'; this.game.sfx('hit_glass', null, { volume: 0.5 }); return; }
    this.weather = kind; if (kind === 'storm') this.nextThunder = 5;
  }
  thunder() { this.flashT = 0.25; const d = 1 + Math.random() * 3; setTimeout(() => this.game.sfx('thunder', null, { volume: 1, bus: 'ambience' }), d * 1000); this.game.hooks.emit('lightning'); }
  addColdSpot(pos, r, dur) { this.coldSpots.push({ pos: pos.clone(), r, t: dur }); }
  temperatureAt(pos) {
    let t = 19.5;
    const z = this.game.world.zoneAt(pos.x, pos.y + 1, pos.z);
    if (z?.outdoor) t = 9; if (z?.type === 'garage' || z?.type === 'basement') t = 14; if (z?.id === 'b13') t = 4; if (z?.type === 'vent') t = 16;
    for (const c of this.coldSpots) { const d = c.pos.distanceTo(pos); if (d < c.r) t -= (1 - d / c.r) * 14; }
    t -= (this.game.entities?.coldAt(pos) || 0) * 12;
    if (this.game.fire) t += this.game.fire.heatAt(pos);
    return t;
  }
  coldAt(pos) { return Math.max(0, Math.min(1, (14 - this.temperatureAt(pos)) / 10)) * 0.7; }

  update(dt) {
    const g = this.game;
    this.minutes += dt * this.timeScale; if (this.minutes >= 1440) { this.minutes -= 1440; this.day++; }
    const m = this.minutes; const hour = m / 60;
    // facteur de jour (soleil) : couchant vers 20h30 (automne)
    const sunAlt = Math.sin(((hour - 7.5) / 13) * Math.PI); // >0 entre 7h30 et 20h30
    const dayF = THREE.MathUtils.clamp(sunAlt * 3, 0, 1);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(sunAlt) * 4, 0, 1) * (hour > 12 ? 1 : 0.6);
    const U = this.skyMat.uniforms;
    const az = ((hour - 13) / 12) * Math.PI;
    U.sunDir.value.set(Math.sin(az) * Math.cos(Math.asin(THREE.MathUtils.clamp(sunAlt, -1, 1))), sunAlt * 0.8, -0.5).normalize();
    const night = 1 - dayF;
    U.zenith.value.copy(lerpC(0x03050c, 0x2d5fa8, dayF)).lerp(new THREE.Color(0x1a1e3a), dusk * 0.6);
    U.horizon.value.copy(lerpC(0x0b0d16, 0x9cc4e8, dayF)).lerp(new THREE.Color(0xff7a3c), dusk * 0.85);
    U.sunColor.value.copy(lerpC(0xffffff, 0xff6a20, dusk));
    U.stars.value = THREE.MathUtils.clamp(night * 1.2 - 0.2, 0, 1) * (this.weather === 'clear' ? 1 : 0.15);
    U.clouds.value = this.weather === 'storm' ? 0.95 : this.weather === 'rain' ? 0.8 : 0.35;
    U.cityGlow.value = 0.25 + night * 0.9; U.sunVis.value = dayF > 0 || dusk > 0 ? 1 : 0; U.moonVis.value = night;
    U.time.value = g.time;
    // éclairs
    if (this.weather === 'storm') { this.nextThunder -= dt; if (this.nextThunder <= 0) { this.thunder(); this.nextThunder = 12 + Math.random() * 25; } }
    this.flashT = Math.max(0, this.flashT - dt);
    const fl = this.flashT > 0 ? (Math.sin(this.flashT * 80) > 0 ? 1 : 0.2) * this.flashT * 4 : 0;
    U.flash.value = fl;
    this.sky.position.copy(g.camera.position);
    // lumières globales
    const cam = g.camera.position; const zone = g.world.zoneAt(cam.x, cam.y, cam.z);
    const outdoor = !!zone?.outdoor;
    this.hemi.intensity = 0.015 + dayF * (outdoor ? 1.6 : 0.25) + night * (outdoor ? 0.09 : 0) + fl * (outdoor ? 3 : 0.4);
    this.hemi.color.copy(lerpC(0x506080, 0xbfd6ff, dayF)); this.hemi.groundColor.copy(lerpC(0x101010, 0x8a7a68, dayF));
    this.sun.intensity = outdoor ? dayF * 2.5 + dusk * 0.6 : 0;
    this.sun.color.copy(U.sunColor.value);
    this.sun.position.copy(cam).addScaledVector(U.sunDir.value, 100); this.sun.target.position.copy(cam);
    g.lighting.dayFactor = g.isDay ? Math.max(dayF, 0.85) : 0;
    // brouillard
    const fog = g.scene.fog;
    const fogTarget = outdoor ? lerpC(0x0a0c14, 0x9cb8d0, dayF) : (g.isDay ? new THREE.Color(0x2a2a2a) : new THREE.Color(0x020306));
    fog.color.lerp(fogTarget, Math.min(1, dt * 2));
    const dens = outdoor ? (this.weather !== 'clear' ? 0.012 : 0.0025) : g.isDay ? 0.004 : zone?.type === 'vent' ? 0.06 : zone?.id === 'security' ? 0.01 : 0.022;
    fog.density += (dens - fog.density) * Math.min(1, dt * 2);
    g.renderer.fx.exposure.value = g.isDay ? 1.0 : 1.15;
    g.renderer.fx.desat.value = g.isDay ? 0.02 : 0.15;
    g.renderer.fx.grain.value = g.isDay ? 0.035 : 0.075;
    // réverbération
    const type = zone?.type || 'corridor';
    if (type !== this.lastZoneType) { this.lastZoneType = type; try { Audio.setReverbZone(type === 'shop' && zone?.shop === 'hyper' ? 'bigstore' : type); } catch (e) { /* */ } }
    this.updateAmbience(dt, zone, outdoor);
    for (const c of this.coldSpots) c.t -= dt; this.coldSpots = this.coldSpots.filter(c => c.t > 0);
  }

  amb(name, vol, param) {
    let a = this.ambience[name];
    if (vol <= 0.001) { if (a) { a.stop(1.5); delete this.ambience[name]; } return; }
    if (!a) { a = this.ambience[name] = this.game.loop(name, null, { volume: 0, bus: 'ambience' }); }
    a.setVolume(vol, 0.8); if (param) for (const k in param) a.setParam?.(k, param[k]);
  }
  updateAmbience(dt, zone, outdoor) {
    const g = this.game; const t = zone?.type;
    const night = !g.isDay;
    const stress = (g.player?.stats.stress || 0) / 100;
    this.amb('drone', night && zone?.id !== 'security' ? 0.12 + stress * 0.35 : 0, { tension: stress });
    this.amb('hvac', !outdoor && t !== 'vent' && g.power?.isOn('hvac') ? (t === 'corridor' || t === 'backroom' ? 0.18 : 0.08) : 0);
    this.amb('wind', outdoor ? 0.4 + (this.weather === 'storm' ? 0.4 : 0) : t === 'vent' ? 0.08 : 0, { strength: this.weather === 'storm' ? 1 : 0.4 });
    this.amb('distant_traffic', outdoor || zone?.id === 'entrance' || zone?.id === 'ramp' ? 0.25 : t === 'atrium' ? 0.04 : 0);
    const rain = this.weather === 'rain' || this.weather === 'storm';
    this.amb('rain', rain ? (outdoor ? 0.7 : t === 'atrium' ? 0.35 : zone?.floor === 1 || zone?.id === 'entrance' ? 0.15 : 0.05) : 0, { intensity: this.weather === 'storm' ? 1 : 0.5 });
    this.amb('crowd', g.isDay && g.story?.crowdLevel ? g.story.crowdLevel * (t === 'corridor' || t === 'atrium' ? 0.5 : 0.25) : 0, { density: g.story?.crowdLevel || 0 });
    this.amb('fluorescent_buzz', zone && zone._level > 0.3 && (t === 'corridor' || t === 'backroom' || t === 'garage' || t === 'basement') ? 0.06 : 0);
    this.amb('electric_hum', zone?.type === 'basement' ? 0.15 : 0);
  }
}
