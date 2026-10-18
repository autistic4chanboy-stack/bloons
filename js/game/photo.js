// Photos : polaroid et appareil jetable (vraie image de la scène, flash qui éclaire et éblouit,
// et l'objectif « voit » ce que les yeux ne voient pas : les présences visibles seulement sur caméra),
// photomaton (bande de 4 photos, parfois quelqu'un derrière vous), visionneuse, rétroviseur (miroir de poche).
import * as THREE from 'three';
import { Net } from '../net/net.js';
import { CAM_LAYERS } from './security.js';
import { GLOBAL_UNIFORMS } from '../engine/materials.js';

const FS_VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// développement « argentique » : tonemapping doux, dominante chaude, vignettage, grain, sortie sRGB
const DEV_FRAG = `uniform sampler2D tSrc; uniform float time, warm, exposure; varying vec2 vUv;
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * exposure;
  c = c / (1.0 + c);
  c = mix(c, c * vec3(1.08, 1.0, 0.86), warm);
  float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, 0.82);
  vec2 cc = vUv - 0.5; c *= smoothstep(0.95, 0.25, length(cc));
  c += (rand(vUv * 512.0 + time) - 0.5) * 0.05;
  gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class PhotoSystem {
  constructor(game) {
    this.game = game;
    this.cam = new THREE.PerspectiveCamera(60, 4 / 3, 0.05, 120); this.cam.rotation.order = 'YXZ';
    this._flashSave = null; // flash : emprunte un emplacement du pool de lumières le temps de la prise de vue (flashOn)
    this.devMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: DEV_FRAG, depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, time: { value: 0 }, warm: { value: 1 }, exposure: { value: 1.2 } } });
    this.rtScene = null; this.rtOut = null; this.size = [0, 0];
    this.rear = null; this.rearTimer = null;
    game.sim.action('flashstun', (p) => game.entities.flashStun?.(new THREE.Vector3(...p.pos), new THREE.Vector3(...p.dir)));
  }
  // Le flash n'éclaire que la prise de vue (rendu synchrone) : plutôt qu'une PointLight éteinte en permanence dans la
  // scène (chaque lumière, même à 0, coûte son calcul à chaque pixel de chaque matériau), on emprunte le dernier
  // emplacement du pool, sans masque de zone, puis on le rend tel quel
  flashOn(pos, intensity) {
    const pool = this.game.lighting.pool, k = pool.length - 1, L = pool[k], PM = GLOBAL_UNIFORMS.poolMin.value[k];
    if (!this._flashSave) this._flashSave = { pos: L.position.clone(), color: L.color.clone(), intensity: L.intensity, distance: L.distance, w: PM.w };
    L.position.copy(pos); L.color.setHex(0xfff6ea); L.intensity = intensity; L.distance = 16; PM.w = 0;
  }
  flashOff() {
    const s = this._flashSave; if (!s) return; this._flashSave = null;
    const pool = this.game.lighting.pool, k = pool.length - 1, L = pool[k];
    L.position.copy(s.pos); L.color.copy(s.color); L.intensity = s.intensity; L.distance = s.distance; GLOBAL_UNIFORMS.poolMin.value[k].w = s.w;
  }
  targets(w, h) {
    if (this.size[0] !== w || this.size[1] !== h) {
      this.rtScene?.dispose(); this.rtOut?.dispose();
      this.rtScene = this.game.renderer.makeRT(w, h, { depthBuffer: true });
      this.rtOut = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false });
      this.size = [w, h];
    }
  }
  // Rend une vue (position, yaw, pitch) dans un canvas
  shoot(pos, yaw, pitch, w, h, opts = {}) {
    const g = this.game; const R = g.renderer.gl;
    this.targets(w, h);
    const c = this.cam; c.position.copy(pos); c.rotation.set(pitch, yaw, 0, 'YXZ'); c.fov = opts.fov || 60; c.aspect = w / h; c.updateProjectionMatrix();
    c.layers.mask = 1 | (opts.self ? (1 << CAM_LAYERS.avatar) : 0) | (opts.spirits ? (1 << CAM_LAYERS.cam) : 0);
    g.world.cull(pos, [], c);
    const auto = R.shadowMap.autoUpdate; R.shadowMap.autoUpdate = false;
    g.renderer.renderTo(g.scene, c, this.rtScene);
    R.shadowMap.autoUpdate = auto;
    const U = this.devMat.uniforms; U.tSrc.value = this.rtScene.texture; U.time.value = g.time; U.warm.value = opts.warm ?? 1; U.exposure.value = opts.exposure ?? 1.2;
    g.renderer.pass(this.devMat, this.rtOut); R.setRenderTarget(null);
    const px = g.renderer.readPixels(this.rtOut, w, h);
    const cv = opts.canvas || document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(img, 0, 0);
    g.world.cull(g.camera.position, [], g.camera);
    return cv;
  }

  // ── polaroid / appareil jetable ──
  snapshot(p, flash = true) {
    const g = this.game; const cam = g.camera;
    const dir = p.forward();
    g.sfx('camera_shutter', null, { volume: 0.7, bus: 'ui' });
    if (flash) {
      this.flashOn(cam.position.clone().addScaledVector(dir, 0.2), 60);
      g.sfx('photo_flash', null, { volume: 0.6, bus: 'ui' });
      g.renderer.fx.flash.value = 0.85; setTimeout(() => { g.renderer.fx.flash.value = 0; }, 90);
      g.sim.do('flashstun', { pos: cam.position.toArray(), dir: dir.toArray() });
      g.sim.do('noise', { pos: p.pos.toArray(), l: 0.25, k: 'flash' });
    }
    let photo;
    try { photo = this.shoot(cam.position, p.yaw, p.pitch, 320, 240, { spirits: true, fov: 62, exposure: flash ? 1.0 : 1.4 }); }
    catch (e) { console.warn('[photo]', e); }
    this.flashOff();
    if (!photo) return;
    // y a-t-il une présence « invisible » dans le cadre ?
    let ghost = null;
    for (const e of g.entities.list.values()) {
      if (!e.camOnly) continue;
      const to = e.chest.sub(cam.position); const d = to.length(); if (d > 30) continue;
      if (dir.dot(to.divideScalar(d)) > 0.8) { ghost = e; break; }
    }
    const url = this.frame(photo, g.clockString() + (ghost ? '  — ?' : ''), 'polaroid');
    setTimeout(() => {
      g.sfx('polaroid_eject', null, { volume: 0.6, bus: 'ui' });
      g.sim.do('spawnprop', { def: 'photo', pos: p.dropPos(), held: true, data: { photo: url, caption: 'Photo prise à ' + g.clockString() + (g.isDay ? '' : ', nuit ' + g.night), ghost: !!ghost } });
      if (ghost) { g.discover('egg', 'ghost_photo'); setTimeout(() => g.toast('La photo se développe… il y a quelqu\'un dessus que vous n\'aviez pas vu.', 5), 2500); p.scare(15); }
    }, 900);
  }
  frame(cv, caption, style) {
    const W = cv.width, H = cv.height; const out = document.createElement('canvas');
    if (style === 'polaroid') { out.width = W + 24; out.height = H + 70; }
    else { out.width = W + 16; out.height = H + 16; }
    const x = out.getContext('2d');
    x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, out.width, out.height);
    x.drawImage(cv, style === 'polaroid' ? 12 : 8, style === 'polaroid' ? 12 : 8);
    if (style === 'polaroid') { x.fillStyle = '#333'; x.font = 'italic 16px "Comic Sans MS", cursive'; x.fillText(caption, 16, H + 46); }
    return out.toDataURL('image/jpeg', 0.72);
  }

  // ── photomaton : 4 poses ──
  booth(dev, p) {
    const g = this.game; if (this._booth) return; this._booth = true;
    const W = 200, H = 150; const frames = [];
    const eye = g.camera.position.clone(); const yaw = p.yaw; const f = p.forward().setY(0).normalize();
    const camPos = eye.clone().addScaledVector(f, 0.85).add(new THREE.Vector3(0, 0.02, 0));
    const ghostFrame = !g.isDay && Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 3) : -1;
    g.toast('Souriez ! (4 photos)', 2);
    let i = 0;
    const shot = () => {
      g.sfx('photo_flash', dev.center, { volume: 0.5 }); g.particles.flash(dev.wp(dev.meta?.flash || [0, 0.5, 0]));
      this.flashOn(camPos, 30);
      try {
        // avatar du joueur visible (calque 1) : l'objectif est devant son visage
        const cv = this.shoot(camPos, yaw + Math.PI, -0.02, W, H, { self: true, spirits: true, fov: 55, exposure: 1.1, warm: 0.4 });
        if (i === ghostFrame) this.drawGhost(cv);
        frames.push(cv);
      } catch (e) { console.warn('[photomaton]', e); }
      this.flashOff();
      i++;
      if (i < 4) setTimeout(shot, 1100);
      else {
        setTimeout(() => {
          const strip = document.createElement('canvas'); strip.width = W + 16; strip.height = (H + 8) * 4 + 30; const x = strip.getContext('2d');
          x.fillStyle = '#fafafa'; x.fillRect(0, 0, strip.width, strip.height);
          frames.forEach((cv, k) => { x.filter = 'grayscale(0.85) contrast(1.15)'; x.drawImage(cv, 8, 8 + k * (H + 8)); });
          x.filter = 'none'; x.fillStyle = '#555'; x.font = '12px monospace'; x.fillText('HÉLIOS · ' + g.clockString(), 10, strip.height - 10);
          const url = strip.toDataURL('image/jpeg', 0.7);
          g.sfx('printer', dev.center, { volume: 0.5 });
          g.sim.do('interact', { id: dev.id, verb: 'use', strip: url });
          if (ghostFrame >= 0) { g.discover('egg', 'booth_ghost'); setTimeout(() => g.toast('Sur la bande… il y a une petite fille derrière vous, sur une des photos.', 5), 1500); }
          this._booth = false;
        }, 1500);
      }
    };
    setTimeout(shot, 800);
  }
  drawGhost(cv) {
    const x = cv.getContext('2d'); const W = cv.width, H = cv.height;
    const cx = W * (0.68 + Math.random() * 0.15), cy = H * 0.5;
    x.globalAlpha = 0.55;
    const gr = x.createRadialGradient(cx, cy - 10, 2, cx, cy, 40); gr.addColorStop(0, 'rgba(235,235,230,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.beginPath(); x.ellipse(cx, cy - 12, 14, 18, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(20,20,20,0.9)'; x.beginPath(); x.arc(cx - 5, cy - 14, 2.2, 0, 7); x.arc(cx + 5, cy - 14, 2.2, 0, 7); x.fill();
    x.fillStyle = 'rgba(120,10,10,0.6)'; x.fillRect(cx - 16, cy + 6, 32, H - cy);
    x.globalAlpha = 1;
  }

  // ── visionneuse ──
  view(pr) {
    const g = this.game; const d = pr.data || {};
    const img = d.photo;
    const node = document.createElement('div'); node.className = 'nb-paper';
    if (img) node.innerHTML = `<h2>${esc(pr.def.name)}</h2><img src="${img}" style="max-width:min(90vw,420px);max-height:70vh;display:block;margin:6px auto;box-shadow:0 4px 18px #000"><p class="hint">${esc(d.caption || '')}${d.ghost ? ' — Qui est-ce ?' : ''}</p><p class="hint">Échap ou clic pour fermer</p>`;
    else node.innerHTML = `<h2>${esc(pr.def.name)}</h2><div class="txt">${esc(d.text || pr.def.desc || 'Une vieille photo jaunie : l\'inauguration du centre Hélios, le 14 novembre 1987. Au premier plan, une petite fille en robe rouge tient la main de Bobby l\'Ourson.')}</div><p class="hint">Échap ou clic pour fermer</p>`;
    node.addEventListener('click', () => g.ui.closeModal());
    g.ui.openModal('photo', node);
    g.sfx('paper', null, { volume: 0.4, bus: 'ui' });
    if (!img) g.discover('lore', 'photo_1987');
  }

  // ── rétroviseur (miroir de poche) : vue arrière en incrustation ──
  rearView(canvas) {
    clearInterval(this.rearTimer); this.rearTimer = null; this.rear = canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    this.rearTimer = setInterval(() => {
      const g = this.game; if (!g.running || !this.rear) return;
      try {
        const p = g.player; const cam = g.camera;
        const cv = this.shoot(cam.position, p.yaw + Math.PI, -p.pitch * 0.5, 240, 135, { fov: 70, exposure: 1.3, warm: 0.2, spirits: Math.random() < 0.04 });
        ctx.save(); ctx.scale(-1, 1); ctx.drawImage(cv, -canvas.width, 0, canvas.width, canvas.height); ctx.restore();
      } catch (e) { clearInterval(this.rearTimer); }
    }, 80);
  }
}
