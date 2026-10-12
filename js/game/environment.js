// Environnement : heure, ciel (dôme procédural : dégradé, soleil, lune, étoiles, nuages, pollution lumineuse),
// lumières globales, brouillard, météo (pluie, orage, éclairs), ambiances sonores, réverbération par zone,
// température (zones froides), exposition et étalonnage de la caméra selon le jour et la nuit.
// La nuit, l'intérieur n'a AUCUNE lumière ambiante globale : ce qui éclaire vient des zones allumées, de la lampe
// torche, des appareils et des ouvertures (verrière : lune, ou soleil le jour ; façades vitrées : lampadaires).
// Ouvertures : world.apertures (déclarées par l'architecture) ou déduites des vitres — voir buildApertures().
import * as THREE from 'three';
import { Audio } from '../engine/audio.js';
import { Ambience } from './ambience.js';
import { GLOBAL_UNIFORMS, NUM_APERTURES } from '../engine/materials.js';

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

// interpolation de couleurs sans allocation (out ← a → b)
const _lc = new THREE.Color();
function lerpC(out, a, b, t) { return out.setHex(a).lerp(_lc.setHex(b), t); }

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
    sc.fog = new THREE.FogExp2(0x010203, 0.02);
    this.sound = new Ambience(game, this); this.coldSpots = [];
    this.lastZoneType = null;
    // lune haute (sa lumière tombe par la verrière sur le sol de l'atrium), même direction dans le ciel
    this.moonDir = new THREE.Vector3(-0.3, 0.92, 0.16).normalize(); this.skyMat.uniforms.moonDir.value.copy(this.moonDir);
    this.apertures = null; this._fogTarget = new THREE.Color(); this._c1 = new THREE.Color();
  }

  // Ouvertures lumineuses (au plus NUM_APERTURES) : world.apertures si l'architecture les déclare, sinon déduites :
  //  - verrière : world.skylightPanes (vitres horizontales) ou world.points.glassRoof { x0, x1, w, y0 } (verrière sur
  //    x0…x1, z = ±w, base à y0) ; sous la dalle de l'étage, la lumière doit passer par une trémie : world.voidHoles
  //    ([[xa, xb], …] sur la largeur de la verrière) ou, à défaut, le rectangle de la verrière ; elle n'éclaire que la
  //    boîte englobant les vides (zones void) situés sous la verrière ;
  //  - façades : vitres verticales posées sur le bord d'une zone extérieure, regroupées par zone et par plan.
  // Format d'une ouverture déclarée : { kind: 'sky' | 'facade', axis: 'y' | 'x' | 'z', at, rect: [u0, v0, u1, v1]
  //  (plan y : x,z ; plan x : z,y ; plan z : x,y), recv: [x0, y0, z0, x1, y1, z1], slab?: y, out?: ±1 (sens de
  //  l'extérieur le long de l'axe, façades), bars?: [pasU, décalageU, pasV, largeur], soft? } ; trémies de la dalle :
  //  world.apertureHoles = [[x0, z0, x1, z1], …] (6 au plus, sinon le rectangle des ouvertures qui ont une dalle).
  buildApertures() {
    const W = this.game.world, out = [];
    let holes = null;
    if (Array.isArray(W.apertures)) { for (const a of W.apertures) out.push({ soft: 0.12, bars: [0, 0, 0, 0.08], out: 1, ...a }); holes = W.apertureHoles || out.filter((a) => a.slab != null).map((a) => a.rect); }
    else {
      const sk = W.skylightPanes || [], gr = W.points?.glassRoof;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, y = 0, bars = null;
      if (sk.length) {
        for (const gp of sk) { const b = gp.col; x0 = Math.min(x0, b.min[0]); z0 = Math.min(z0, b.min[2]); x1 = Math.max(x1, b.max[0]); z1 = Math.max(z1, b.max[2]); y = (b.min[1] + b.max[1]) / 2; }
        bars = [sk[0].col.max[0] - sk[0].col.min[0], -x0, sk[0].col.max[2] - sk[0].col.min[2], 0.09];
      } else if (gr && gr.x1 > gr.x0) { x0 = gr.x0; x1 = gr.x1; z0 = -gr.w; z1 = gr.w; y = gr.y0; bars = [1, -x0, 0, 0.06]; } // montants tous les mètres
      if (bars) {
        const vz = W.zones.filter((z) => z.void && z.min[0] < x1 && z.max[0] > x0 && z.min[2] < z1 && z.max[2] > z0);
        const up = W.zones.filter((z) => z.floor === 1 && !z.void).map((z) => z.min[1]); const slab = vz.length && up.length ? Math.min(...up) : null;
        const ext = (k, f) => f(...vz.map((z) => (k < 3 ? z.min : z.max)[k % 3]));
        const R = vz.length ? [ext(0, Math.min) - 0.6, ext(1, Math.min) - 0.1, ext(2, Math.min) - 0.6, ext(3, Math.max) + 0.6, Math.min(ext(4, Math.max), y), ext(5, Math.max) + 0.6] : [x0 - 8, y - 14, z0 - 8, x1 + 8, y, z1 + 8];
        out.push({ kind: 'sky', axis: 'y', at: y, rect: [x0, z0, x1, z1], recv: R, slab, bars, soft: 0.1 });
        holes = Array.isArray(W.voidHoles) && W.voidHoles.length ? W.voidHoles.map(([a, b]) => [a, z0, b, z1]) : [[x0, z0, x1, z1]];
      }
      const outs = W.zones.filter((z) => z.outdoor), groups = new Map();
      for (const o of W.objects.values()) {
        if (o.kind !== 'glass' || !o.o || o.o.horizontal || o.o.skylight) continue;
        const g = o.o, ax = Math.abs(g.x1 - g.x0) < 1e-3 ? 'x' : Math.abs(g.z1 - g.z0) < 1e-3 ? 'z' : null; if (!ax) continue;
        const at = ax === 'x' ? g.x0 : g.z0, i = ax === 'x' ? 0 : 2;
        const oz = outs.find((z) => Math.abs(z.min[i] - at) < 0.6 || Math.abs(z.max[i] - at) < 0.6); if (!oz) continue;
        const zn = W.zone(g.zone); if (!zn || zn.outdoor) continue;
        const k = g.zone + '|' + ax + '|' + at.toFixed(1);
        let e = groups.get(k); if (!e) groups.set(k, e = { kind: 'facade', axis: ax, at, rect: [Infinity, Infinity, -Infinity, -Infinity], out: Math.abs(oz.min[i] - at) < 0.6 ? 1 : -1, zone: zn, bars: [0, 0, 0, 0.08], soft: 0.15 });
        const u0 = ax === 'x' ? g.z0 : g.x0, u1 = ax === 'x' ? g.z1 : g.x1;
        e.rect[0] = Math.min(e.rect[0], u0, u1); e.rect[2] = Math.max(e.rect[2], u0, u1); e.rect[1] = Math.min(e.rect[1], g.y0); e.rect[3] = Math.max(e.rect[3], g.y1);
      }
      for (const e of groups.values()) { const z = e.zone; e.recv = [z.min[0] - 0.5, z.min[1] - 0.1, z.min[2] - 0.5, z.max[0] + 0.5, z.max[1], z.max[2] + 0.5]; delete e.zone; out.push(e); }
    }
    this.apertures = out.slice(0, NUM_APERTURES);
    const G = GLOBAL_UNIFORMS;
    G.apHoles.value.forEach((v, k) => { const h = holes && holes[k]; if (h) v.set(h[0], h[1], h[2], h[3]); else v.set(1e4, 1e4, -1e4, -1e4); });
    this.apertures.forEach((a, i) => {
      const ax = a.axis === 'y' ? 0 : a.axis === 'x' ? 1 : 2, b = a.bars || [0, 0, 0, 0.08], R = a.recv;
      G.apA.value[i].set(ax, a.at, a.slab ?? -1e4, b[1] || 0); G.apB.value[i].set(...a.rect);
      G.apC.value[i].set(R[0], R[1], R[2], a.soft ?? 0.12); G.apD.value[i].set(R[3], R[4], R[5], b[0] || 0);
      a.dir = new THREE.Vector3(); a.col = new THREE.Color();
    });
  }

  // Lumière des ouvertures : verrière = lune (nuit) ou soleil (jour) ; façades = lampadaires orangés la nuit
  updateApertures(dayF, night, U) {
    if (!this.apertures) this.buildApertures();
    const G = GLOBAL_UNIFORMS, clouds = this.weather === 'clear' ? 1 : this.weather === 'rain' ? 0.35 : 0.2;
    for (let i = 0; i < NUM_APERTURES; i++) {
      const a = this.apertures[i];
      if (!a) { G.apE.value[i].set(0, 0, 0, 0); continue; }
      if (a.kind === 'sky') {
        const sunUp = U.sunDir.value.y > 0.04 && dayF > 0;
        if (sunUp) { a.dir.copy(U.sunDir.value); a.col.copy(U.sunColor.value).multiplyScalar(2.6 * dayF * clouds); }
        else { a.dir.copy(this.moonDir); a.col.setRGB(0.5, 0.62, 0.95).multiplyScalar(0.12 * night * clouds); }
      } else {
        a.dir.set(a.axis === 'x' ? a.out : 0, 0.42, a.axis === 'z' ? a.out : 0).normalize();
        a.col.setRGB(1, 0.6, 0.28).multiplyScalar(0.07 * night);
      }
      const b = a.bars || [0, 0, 0, 0.08];
      G.apL.value[i].set(a.dir.x, a.dir.y, a.dir.z, b[3] || 0.08); G.apE.value[i].set(a.col.r, a.col.g, a.col.b, b[2] || 0);
    }
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
    lerpC(U.zenith.value, 0x03050c, 0x2d5fa8, dayF).lerp(this._c1.setHex(0x1a1e3a), dusk * 0.6);
    lerpC(U.horizon.value, 0x0b0d16, 0x9cc4e8, dayF).lerp(this._c1.setHex(0xff7a3c), dusk * 0.85);
    lerpC(U.sunColor.value, 0xffffff, 0xff6a20, dusk);
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
    // intérieur la nuit : aucune ambiance globale (seulement l'éclair d'un orage) ; dehors, un clair de lune
    this.hemi.intensity = outdoor ? 0.01 + dayF * 1.6 + night * 0.05 + fl * 3 : dayF * 0.22 + fl * 0.25;
    lerpC(this.hemi.color, 0x5a6c94, 0xbfd6ff, dayF); lerpC(this.hemi.groundColor, 0x080808, 0x8a7a68, dayF);
    this.sun.intensity = outdoor ? dayF * 2.5 + dusk * 0.6 : 0;
    this.sun.color.copy(U.sunColor.value);
    this.sun.position.copy(cam).addScaledVector(U.sunDir.value, 100); this.sun.target.position.copy(cam);
    g.lighting.dayFactor = g.isDay ? Math.max(dayF, 0.85) : 0;
    this.updateApertures(dayF, night, U);
    // brouillard (intérieur la nuit : noir — il éteint les enseignes lointaines au lieu de les voiler de gris)
    const fog = g.scene.fog;
    const fogTarget = outdoor ? lerpC(this._fogTarget, 0x07090f, 0x9cb8d0, dayF) : this._fogTarget.setHex(g.isDay ? 0x2a2a2a : 0x010203);
    fog.color.lerp(fogTarget, Math.min(1, dt * 2));
    const dens = outdoor ? (this.weather !== 'clear' ? 0.012 : 0.0025) : g.isDay ? 0.004 : zone?.type === 'vent' ? 0.06 : zone?.id === 'security' ? 0.01 : 0.022;
    fog.density += (dens - fog.density) * Math.min(1, dt * 2);
    // caméra : exposition de base, exposition automatique (gain borné : l'obscurité reste obscure), étalonnage
    const R = g.renderer, fx = R.fx, E = R.expoU, d = g.isDay;
    fx.exposure.value = 1.0;
    E.aeKey.value = d ? 0.2 : 0.16; E.aeStrength.value = d ? 0.6 : 0.7; E.aeMin.value = d ? 0.45 : 0.4; E.aeMax.value = d ? 1.5 : 2.1;
    fx.desat.value = d ? 0.03 : 0.2;
    fx.grain.value = d ? 0.03 : 0.06;
    fx.wb.value.set(d ? 0.95 : 0.93, 1.0, d ? 1.05 : 1.09); // néons : blancs neutralisés, pointe de vert ; nuit plus froide
    fx.lookPower.value = d ? 1.12 : 1.18; fx.lookSat.value = d ? 1.05 : 0.95;
    // réverbération
    const type = zone?.type || 'corridor';
    if (type !== this.lastZoneType) { this.lastZoneType = type; try { Audio.setReverbZone(type === 'shop' && zone?.shop === 'hyper' ? 'bigstore' : type); } catch (e) { /* */ } }
    this.sound.update(dt, zone, outdoor);
    if (this.coldSpots.length) { for (const c of this.coldSpots) c.t -= dt; this.coldSpots = this.coldSpots.filter(c => c.t > 0); }
  }
}
