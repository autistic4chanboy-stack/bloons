// Particules et décalques : éclats de verre, étincelles, fumée, farine (révèle l'invisible), mousse, bulles,
// pulvérisations, neige, paillettes, eau de la fontaine, poussière dans le faisceau de la lampe, éclairs de flash.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute float size; attribute float alpha; attribute vec3 pcolor;
varying float vA; varying vec3 vC;
uniform float scale;
void main(){ vA = alpha; vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FRAG = /* glsl */`
varying float vA; varying vec3 vC; uniform float soft;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = vA * mix(1.0, smoothstep(0.5, 0.0, r), soft); gl_FragColor = vec4(vC, a); }`;

class PSys {
  constructor(scene, n, opts = {}) {
    this.n = n; this.i = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.base = new Float32Array(n); this.grow = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { scale: { value: 300 }, soft: { value: opts.soft ?? 1 } } });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
    this.gravity = opts.gravity ?? -9.8; this.drag = opts.drag ?? 0.5; this.fade = opts.fade ?? 1; this.active = 0;
    this.floor = opts.floor ?? null;
  }
  emit(p, v, color, size, life, grow = 0) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = size; this.base[i] = size; this.life[i] = life; this.max[i] = life; this.grow[i] = grow; this.alpha[i] = 1;
    this.active = Math.max(this.active, 1);
  }
  update(dt) {
    let any = false; const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      any = true;
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] += this.gravity * dt;
      this.vel[j] *= k; this.vel[j + 1] *= k; this.vel[j + 2] *= k;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.floor !== null && this.vel[j + 1] < 0 && this.pos[j + 1] < (this.floorAt ? this.floorAt(i) : -100)) { this.vel[j + 1] *= -0.2; this.vel[j] *= 0.5; this.vel[j + 2] *= 0.5; }
      const t = this.life[i] / this.max[i];
      this.alpha[i] = Math.min(1, t * 3) * this.fade;
      this.size[i] = this.base[i] + this.grow[i] * (1 - t);
      if (this.life[i] <= 0) this.alpha[i] = 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.pcolor.needsUpdate = true;
    this.points.visible = any;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

const R = () => Math.random() - 0.5;

export class Particles {
  constructor(game) {
    this.game = game; const sc = game.scene;
    this.sparks = new PSys(sc, 600, { additive: true, gravity: -9.8, drag: 0.3, soft: 0.3 });
    this.smoke = new PSys(sc, 500, { additive: false, gravity: 0.6, drag: 0.6, fade: 0.55 });
    this.dust = new PSys(sc, 900, { additive: false, gravity: -1.2, drag: 2.2 });
    this.glow = new PSys(sc, 300, { additive: true, gravity: 0.2, drag: 1.0 });
    this.water = new PSys(sc, 700, { additive: false, gravity: -9.8, drag: 0.1, soft: 0.5 });
    this.shardsP = new PSys(sc, 500, { additive: true, gravity: -9.8, drag: 0.2, soft: 0.1 });
    this.flashes = [];
    this.decals = []; this.decalGroup = new THREE.Group(); sc.add(this.decalGroup);
    this.fountains = new Set();
    // poussière en suspension visible dans le faisceau
    this.motes = this.makeMotes(); sc.add(this.motes);
  }
  makeMotes() {
    const n = 420; const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 3); const s = new Float32Array(n);
    for (let i = 0; i < n; i++) { p[i * 3] = R() * 16; p[i * 3 + 1] = R() * 8; p[i * 3 + 2] = R() * 16; s[i] = 0.5 + Math.random(); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { center: { value: new THREE.Vector3() }, fpos: { value: new THREE.Vector3() }, fdir: { value: new THREE.Vector3() }, fcos: { value: 0.9 }, fint: { value: 0 }, time: { value: 0 }, color: { value: new THREE.Color(1, 0.95, 0.85) } },
      vertexShader: `attribute float seed; uniform vec3 center, fpos, fdir; uniform float fcos, fint, time; varying float vA;
        void main(){ vec3 p = position; p.x += sin(time * 0.13 * seed + seed * 10.0) * 0.6; p.y += sin(time * 0.07 * seed + seed * 3.0) * 0.4; p.z += cos(time * 0.11 * seed) * 0.6;
          vec3 w = center + mod(p - center + 8.0, 16.0) - 8.0; w.y = center.y + mod(p.y + 4.0, 8.0) - 4.0;
          vec3 d = w - fpos; float dist = length(d); float c = dot(d / max(dist, 0.001), fdir);
          float inCone = smoothstep(fcos - 0.02, fcos + 0.05, c) * smoothstep(9.0, 0.5, dist) * smoothstep(0.7, 1.8, dist);
          vA = inCone * fint * (0.4 + 0.6 * seed);
          vec4 mv = modelViewMatrix * vec4(w, 1.0); gl_PointSize = min(6.0, seed * 22.0 / max(0.3, -mv.z)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5 || vA < 0.01) discard; gl_FragColor = vec4(color * vA * smoothstep(0.5, 0.0, r), 1.0); }`,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 7; return pts;
  }
  setFlash(pos, dir, angle, intensity) {
    const U = this.motes.material.uniforms; U.fpos.value.copy(pos); U.fdir.value.copy(dir); U.fcos.value = Math.cos(angle); U.center.value.copy(this.game.camera.position);
    U.fint.value = Math.min(1, intensity / 14) * (this.game.isDay ? 0.25 : 0.5);
  }

  // ── émetteurs ──
  shards(pos, normalAxis, w, h) {
    for (let i = 0; i < 160; i++) {
      const p = pos.clone().add(new THREE.Vector3(normalAxis === 'x' ? R() * 0.1 : R() * w, R() * h, normalAxis === 'z' ? R() * 0.1 : R() * w));
      const v = new THREE.Vector3(R() * 3, Math.random() * 2, R() * 3); if (normalAxis === 'x') v.x += R() * 6; else v.z += R() * 6;
      this.shardsP.emit(p, v, new THREE.Color(0.75, 0.88, 0.95).multiplyScalar(0.4 + Math.random() * 0.8), 2 + Math.random() * 3, 0.6 + Math.random() * 0.9);
    }
  }
  sparksAt(pos, n = 30, color = 0xffb040) { for (let i = 0; i < n; i++) this.sparks.emit(pos, new THREE.Vector3(R() * 4, Math.random() * 3, R() * 4), color, 2.5 + Math.random() * 2, 0.3 + Math.random() * 0.6); }
  smokeAt(pos, n = 4, dark = 0.12, size = 60) { for (let i = 0; i < n; i++) this.smoke.emit(pos.clone().add(new THREE.Vector3(R() * 0.6, 0, R() * 0.6)), new THREE.Vector3(R() * 0.3, 0.6 + Math.random() * 0.6, R() * 0.3), new THREE.Color(dark, dark, dark * 1.05), size, 4 + Math.random() * 4, size * 2.5); }
  fireAt(pos, n = 3, scale = 1) { for (let i = 0; i < n; i++) this.glow.emit(pos.clone().add(new THREE.Vector3(R() * 0.5 * scale, 0, R() * 0.5 * scale)), new THREE.Vector3(R() * 0.3, 1 + Math.random() * 1.5, R() * 0.3), new THREE.Color().setHSL(0.05 + Math.random() * 0.06, 1, 0.5), (20 + Math.random() * 25) * scale, 0.4 + Math.random() * 0.5, -10 * scale); }
  fireBurst(pos) { for (let i = 0; i < 40; i++) this.glow.emit(pos, new THREE.Vector3(R() * 3, R() * 2, R() * 3).add(this.game.player.forward().multiplyScalar(4)), new THREE.Color(1, 0.5, 0.1), 30, 0.5); }
  flour(pos) { for (let i = 0; i < 160; i++) this.dust.emit(pos.clone().add(new THREE.Vector3(R() * 0.3, R() * 0.3, R() * 0.3)), new THREE.Vector3(R() * 5, Math.random() * 3, R() * 5), 0xf4f1ea, 30 + Math.random() * 40, 3 + Math.random() * 4, 60); }
  foam(pos) { for (let i = 0; i < 120; i++) this.dust.emit(pos.clone().add(new THREE.Vector3(R() * 0.5, Math.random() * 0.4, R() * 0.5)), new THREE.Vector3(R() * 1.5, Math.random() * 1.5, R() * 1.5), 0xffffff, 20 + Math.random() * 20, 5 + Math.random() * 5, 20); }
  spray(pos, dir, color, n = 20, spread = 0.3) { for (let i = 0; i < n; i++) { const v = dir.clone().multiplyScalar(5 + Math.random() * 3).add(new THREE.Vector3(R() * spread * 8, R() * spread * 8, R() * spread * 8)); this.dust.emit(pos, v, color, 6 + Math.random() * 10, 0.6 + Math.random() * 0.8, 20); } }
  bubbles(pos, dir) { for (let i = 0; i < 4; i++) { const v = dir.clone().multiplyScalar(1.5).add(new THREE.Vector3(R(), Math.random() * 0.5, R())); this.glow.emit(pos, v, new THREE.Color(0.5, 0.7, 0.9), 8 + Math.random() * 12, 3 + Math.random() * 3); } }
  sparkle(pos) { for (let i = 0; i < 40; i++) this.sparks.emit(pos, new THREE.Vector3(R() * 2, Math.random() * 2, R() * 2), new THREE.Color().setHSL(Math.random(), 1, 0.7), 3, 0.8 + Math.random()); }
  snow(pos) { for (let i = 0; i < 30; i++) this.dust.emit(pos.clone().add(new THREE.Vector3(R() * 0.1, Math.random() * 0.1, R() * 0.1)), new THREE.Vector3(R() * 0.2, 0.3, R() * 0.2), 0xffffff, 2, 2); }
  // éclair de flash : emprunte une lumière du pool (priorité maximale) au lieu d'ajouter une PointLight à la scène,
  // ce qui forcerait la recompilation de tous les shaders (le nombre de lumières fait partie du programme)
  flash(pos) {
    const f = { pos: pos.clone(), t: 0.15 };
    f.getLight = () => (f.t > 0 ? { pos: f.pos, color: [1, 0.98, 0.95], intensity: 40 * Math.max(0, f.t / 0.15), distance: 12, priority: 0.02 } : null);
    this.game.lighting.addSource(f); this.flashes.push(f);
  }
  fountain(dev, on) { if (on) this.fountains.add(dev); else this.fountains.delete(dev); }

  // ── décalques au sol / murs ──
  decal(p) {
    const pos = new THREE.Vector3(...p.pos);
    let mesh;
    if (p.kind === 'text') {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128; const ctx = c.getContext('2d');
      ctx.fillStyle = '#' + (p.color || 0xc2185b).toString(16).padStart(6, '0'); ctx.font = 'italic 900 44px "Comic Sans MS", cursive'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.text || '?', 128, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      mesh.position.copy(pos); mesh.rotation.y = (p.n || 0) + Math.PI; mesh.position.add(new THREE.Vector3(Math.sin(p.n || 0), 0, Math.cos(p.n || 0)).multiplyScalar(-0.01));
    } else {
      const size = p.size || (p.kind === 'wine' ? 0.9 : p.kind === 'wet' ? 0.7 : p.kind === 'tp' ? 1.2 : 0.5);
      const col = p.kind === 'wine' ? 0x4a0e0e : p.kind === 'wet' ? 0x203038 : p.kind === 'egg' ? 0xffd54f : p.kind === 'tp' ? 0xffffff : (p.color ?? 0x8a1a1a);
      const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d');
      ctx.fillStyle = '#' + col.toString(16).padStart(6, '0');
      if (p.kind === 'tp') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(10, 64); for (let x = 10; x < 120; x += 10) ctx.lineTo(x, 64 + Math.sin(x * 0.2) * 30); ctx.stroke(); }
      else { for (let i = 0; i < 14; i++) { ctx.globalAlpha = 0.5 + Math.random() * 0.5; ctx.beginPath(); ctx.arc(64 + R() * 70, 64 + R() * 70, 6 + Math.random() * 26, 0, 7); ctx.fill(); } }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: p.kind === 'wet' || p.kind === 'wine' ? 0.05 : 0.6, opacity: p.kind === 'wet' ? 0.6 : 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
      // posé au sol sous le point
      const ground = this.game.world.physics.groundAt(pos.x, pos.z, pos.y + 0.6, 0.1);
      mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = Math.random() * 6; mesh.position.set(pos.x, (ground.y > -50 ? ground.y : pos.y) + 0.004, pos.z);
    }
    this.decalGroup.add(mesh); this.decals.push(mesh);
    while (this.decals.length > 80) { const d = this.decals.shift(); this.decalGroup.remove(d); d.geometry.dispose(); }
  }
  clearDecals() { for (const d of this.decals) { this.decalGroup.remove(d); d.geometry.dispose(); } this.decals = []; this.sparks.clear(); this.smoke.clear(); this.dust.clear(); this.glow.clear(); this.water.clear(); this.shardsP.clear(); }

  update(dt) {
    for (const s of [this.sparks, this.smoke, this.dust, this.glow, this.water, this.shardsP]) s.update(dt);
    if (this.flashes.length) {
      for (const f of this.flashes) { f.t -= dt; if (f.t <= 0) this.game.lighting.removeSource(f); }
      this.flashes = this.flashes.filter(f => f.t > 0);
    }
    for (const dev of this.fountains) {
      const top = dev.wp(dev.meta.water || [0, 0.9, 0]);
      for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28; this.water.emit(top, new THREE.Vector3(Math.cos(a) * 1.4, 3 + Math.random(), Math.sin(a) * 1.4), new THREE.Color(0.6, 0.75, 0.85), 6, 1.0); }
    }
    this.motes.material.uniforms.time.value = this.game.time;
    // pluie quand on est dehors
    const env = this.game.env;
    if (env && (env.weather === 'rain' || env.weather === 'storm')) {
      const cam = this.game.camera.position; const z = this.game.world.zoneAt(cam.x, cam.y, cam.z);
      if (z?.outdoor) for (let i = 0; i < (env.weather === 'storm' ? 25 : 12); i++) this.water.emit(new THREE.Vector3(cam.x + R() * 20, cam.y + 8, cam.z + R() * 20), new THREE.Vector3(0.5, -14, 0.2), new THREE.Color(0.55, 0.6, 0.7), 3, 1.0);
    }
  }
}
