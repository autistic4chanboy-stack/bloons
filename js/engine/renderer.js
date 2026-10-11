// Rendu : WebGLRenderer + post-traitement maison (bloom, tonemapping ACES, grain, vignette, aberration
// chromatique, distorsion, modes « lunettes », effets de stress) et rendu des caméras de surveillance.
import * as THREE from 'three';
import { noiseTexture, setMaxAnisotropy } from './textures.js';

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform float threshold; uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tDiffuse, vUv + texel * vec2(-0.5, -0.5)).rgb;
  c += texture2D(tDiffuse, vUv + texel * vec2( 0.5, -0.5)).rgb;
  c += texture2D(tDiffuse, vUv + texel * vec2(-0.5,  0.5)).rgb;
  c += texture2D(tDiffuse, vUv + texel * vec2( 0.5,  0.5)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(threshold, threshold * 1.8 + 0.2, l);
  gl_FragColor = vec4(min(c * k, vec3(40.0)), 1.0);
}`;

const BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
  c += texture2D(tDiffuse, vUv + dir * 1.3846).rgb * 0.3162162;
  c += texture2D(tDiffuse, vUv - dir * 1.3846).rgb * 0.3162162;
  c += texture2D(tDiffuse, vUv + dir * 3.2307).rgb * 0.0702702;
  c += texture2D(tDiffuse, vUv - dir * 3.2307).rgb * 0.0702702;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloom1; uniform sampler2D tBloom2; uniform sampler2D tNoise;
uniform float time, exposure, bloomStrength, grain, vignette, ca, stress, fade, flash, damage, distort, drunk, cold, sleepy, kaleido, heartbeat;
uniform float glassesMode; // 0 aucun, 1 vision nocturne, 2 anaglyphe 3D, 3 lunettes de soleil, 4 VR, 5 UV
uniform float nvGain; uniform vec2 resolution; uniform float desat; uniform vec3 tint; uniform float scanline;
varying vec2 vUv;

vec3 aces(vec3 x) { const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  // ivresse : ondulation
  if (drunk > 0.0) {
    uv += vec2(sin(uv.y * 6.0 + time * 1.3), cos(uv.x * 5.0 + time * 1.1)) * 0.012 * drunk;
  }
  // kaléidoscope
  if (kaleido > 0.0) {
    vec2 p = uv - 0.5; float r = length(p); float a = atan(p.y, p.x) + time * 0.3;
    float seg = 6.2831853 / 8.0; a = mod(a, seg); a = abs(a - seg * 0.5);
    uv = mix(uv, vec2(cos(a), sin(a)) * r + 0.5, kaleido);
  }
  // distorsion en barillet légère
  vec2 cc = uv - 0.5; float r2 = dot(cc, cc);
  uv = 0.5 + cc * (1.0 + distort * r2);
  // aberration chromatique (augmente avec le stress)
  float caAmt = ca * (0.6 + r2 * 3.0) + stress * 0.004 * (0.5 + 0.5 * sin(time * 8.0));
  vec2 dir = normalize(cc + 1e-5) * caAmt;
  vec3 col;
  if (glassesMode == 2.0) {
    float rr = texture2D(tScene, uv + vec2(0.006, 0.0)).r; vec3 gb = texture2D(tScene, uv - vec2(0.006, 0.0)).rgb;
    col = vec3(rr, gb.g, gb.b);
  } else {
    col.r = texture2D(tScene, uv + dir).r; col.g = texture2D(tScene, uv).g; col.b = texture2D(tScene, uv - dir).b;
  }
  // flou (somnolence)
  if (sleepy > 0.0) {
    vec3 b = vec3(0.0); float s = sleepy * 0.006;
    b += texture2D(tScene, uv + vec2(s, 0.0)).rgb; b += texture2D(tScene, uv - vec2(s, 0.0)).rgb;
    b += texture2D(tScene, uv + vec2(0.0, s)).rgb; b += texture2D(tScene, uv - vec2(0.0, s)).rgb;
    col = mix(col, b * 0.25, clamp(sleepy, 0.0, 1.0));
  }
  vec3 bloom = texture2D(tBloom1, uv).rgb * 0.6 + texture2D(tBloom2, uv).rgb * 0.8;
  col += bloom * bloomStrength;
  if (glassesMode == 1.0) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    l = pow(l * nvGain, 0.6);
    l += (rand(uv * resolution + time) - 0.5) * 0.25;
    col = vec3(0.1, 1.0, 0.25) * l;
    float circ = smoothstep(0.62, 0.45, length((vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0)));
    col *= circ;
  }
  col *= exposure;
  col = aces(col);
  // étalonnage : désaturation nocturne, teinte
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(lum), clamp(desat + stress * 0.35, 0.0, 1.0));
  col *= tint;
  if (cold > 0.0) col = mix(col, col * vec3(0.75, 0.9, 1.25), cold);
  if (glassesMode == 3.0) col *= vec3(0.45, 0.38, 0.3);
  if (glassesMode == 4.0) { // VR : grille de pixels + double vignette
    vec2 g = fract(vUv * resolution / 3.0); col *= 0.75 + 0.25 * step(0.3, g.x) * step(0.3, g.y);
  }
  // vignette (pulsation avec le cœur quand stressé)
  float vig = smoothstep(0.85, 0.25, length(cc * vec2(1.0, 0.9)) * (1.0 + vignette));
  float pulse = heartbeat * stress;
  col *= mix(1.0, vig, 0.65 + stress * 0.25);
  col = mix(col, col * vec3(1.0, 0.35, 0.3), pulse * (1.0 - vig) * 0.8);
  // dégâts
  col = mix(col, vec3(0.5, 0.0, 0.0), damage * (1.0 - vig * 0.6));
  if (scanline > 0.0) col *= 1.0 - scanline * (0.5 + 0.5 * sin(vUv.y * resolution.y * 1.5));
  col = mix(col, vec3(1.0), flash);
  col *= 1.0 - fade;
  vec3 outc = toSRGB(max(col, 0.0));
  // grain filmique (appliqué en espace perceptuel, plus visible dans les tons moyens)
  float n = texture2D(tNoise, vUv * resolution / 256.0 + vec2(fract(time * 17.0), fract(time * 31.0))).r;
  float sl = dot(outc, vec3(0.333));
  outc += (n - 0.5) * grain * (0.35 + sl * (1.0 - sl) * 2.0);
  gl_FragColor = vec4(outc, 1.0);
}`;

// Shader « écran CCTV » : utilisé pour la vue plein écran et les moniteurs du poste.
export const CCTV_FRAG = /* glsl */`
uniform sampler2D tCam; uniform sampler2D tNoise; uniform sampler2D tOverlay; uniform float time, ir, noiseAmt, offline, glitch, hasOverlay, curvature, brightness;
uniform vec2 resolution;
varying vec2 vUv;
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5; uv = 0.5 + cc * (1.0 + curvature * dot(cc, cc));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float line = floor(uv.y * resolution.y);
  float jitter = (rand(vec2(line, floor(time * 30.0))) - 0.5) * 0.004 * (1.0 + glitch * 20.0);
  if (glitch > 0.0 && rand(vec2(floor(time * 12.0), line * 0.1)) < glitch * 0.3) jitter += (rand(vec2(line)) - 0.5) * 0.1;
  vec3 c = texture2D(tCam, vec2(uv.x + jitter, uv.y)).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // tonemapping simple
  c = c / (1.0 + c);
  l = l / (1.0 + l);
  if (ir > 0.5) { c = vec3(l * 0.85, l * 1.0, l * 0.9) * 1.35; }
  else { c = mix(c, vec3(l), 0.35); }
  c *= brightness;
  float n = rand(uv * resolution + time * 60.0);
  c += (n - 0.5) * noiseAmt;
  c *= 0.82 + 0.18 * sin(uv.y * resolution.y * 3.14159);
  float roll = smoothstep(0.0, 0.02, abs(fract(uv.y - time * 0.07) - 0.5) - 0.48);
  c *= 0.9 + 0.1 * roll;
  if (offline > 0.5) c = vec3(n * 0.5);
  float vig = smoothstep(0.9, 0.3, length(cc));
  c *= mix(0.6, 1.0, vig);
  if (hasOverlay > 0.5) { vec4 o = texture2D(tOverlay, vUv); c = mix(c, o.rgb, o.a); }
  gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
}`;

export class Renderer {
  constructor(canvasEl, settings) {
    this.settings = settings;
    this.gl = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    const r = this.gl;
    r.outputColorSpace = THREE.LinearSRGBColorSpace; // la conversion sRGB est faite dans le composite
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = true;
    r.info.autoReset = true;
    setMaxAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));

    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsGeo = new THREE.BufferGeometry();
    this.fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.fsMesh = new THREE.Mesh(this.fsGeo, null); this.fsMesh.frustumCulled = false;
    this.fsScene = new THREE.Scene(); this.fsScene.add(this.fsMesh);

    const noise = noiseTexture(256);
    this.brightMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: BRIGHT_FRAG, uniforms: { tDiffuse: { value: null }, threshold: { value: 0.9 }, texel: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: BLUR_FRAG, uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: null }, tBloom1: { value: null }, tBloom2: { value: null }, tNoise: { value: noise },
        time: { value: 0 }, exposure: { value: 1 }, bloomStrength: { value: 0.6 }, grain: { value: 0.06 }, vignette: { value: 0.1 }, ca: { value: 0.0015 },
        stress: { value: 0 }, fade: { value: 0 }, flash: { value: 0 }, damage: { value: 0 }, distort: { value: 0.06 }, drunk: { value: 0 }, cold: { value: 0 },
        sleepy: { value: 0 }, kaleido: { value: 0 }, heartbeat: { value: 0 }, glassesMode: { value: 0 }, nvGain: { value: 6 },
        resolution: { value: new THREE.Vector2(1, 1) }, desat: { value: 0.12 }, tint: { value: new THREE.Vector3(1, 1, 1) }, scanline: { value: 0 },
      },
    });
    this.cctvMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: CCTV_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tCam: { value: null }, tNoise: { value: noise }, tOverlay: { value: null }, hasOverlay: { value: 0 }, time: { value: 0 }, ir: { value: 1 }, noiseAmt: { value: 0.12 }, offline: { value: 0 }, glitch: { value: 0 }, curvature: { value: 0.12 }, brightness: { value: 1.1 }, resolution: { value: new THREE.Vector2(640, 400) } },
    });
    this.copyMat = new THREE.MeshBasicMaterial();
    this.rts = null;
    this.resize();
    this._time = 0;
  }

  get fx() { return this.compMat.uniforms; }

  makeRT(w, h, opts = {}) {
    return new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), Object.assign({ type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }, opts));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = this.settings.renderScale ?? 1;
    this.gl.setPixelRatio(1);
    this.gl.setSize(w, h, false);
    this.gl.domElement.style.width = w + 'px'; this.gl.domElement.style.height = h + 'px';
    const W = Math.max(320, Math.floor(w * dpr * scale)), H = Math.max(200, Math.floor(h * dpr * scale));
    this.gl.setSize(Math.floor(w * dpr), Math.floor(h * dpr), false);
    this.W = W; this.H = H;
    if (this.rts) { for (const k in this.rts) this.rts[k].dispose(); }
    const samples = this.settings.quality === 'high' ? 4 : 0;
    this.rts = {
      scene: this.makeRT(W, H, { depthBuffer: true, samples }),
      bright: this.makeRT(W / 2, H / 2),
      b1a: this.makeRT(W / 4, H / 4), b1b: this.makeRT(W / 4, H / 4),
      b2a: this.makeRT(W / 8, H / 8), b2b: this.makeRT(W / 8, H / 8),
    };
    this.compMat.uniforms.resolution.value.set(W, H);
  }

  pass(mat, target) {
    this.fsMesh.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.fsScene, this.fsCam);
  }

  // Rendu principal de la scène + post-traitement
  render(scene, camera, dt) {
    this._time += dt;
    const r = this.gl, rts = this.rts, U = this.compMat.uniforms;
    U.time.value = this._time;
    r.setRenderTarget(rts.scene);
    r.clear();
    r.render(scene, camera);
    const bloomOn = this.settings.bloom !== false;
    if (bloomOn) {
      this.brightMat.uniforms.tDiffuse.value = rts.scene.texture;
      this.brightMat.uniforms.texel.value.set(1 / this.W, 1 / this.H);
      this.pass(this.brightMat, rts.bright);
      const B = this.blurMat.uniforms;
      B.tDiffuse.value = rts.bright.texture; B.dir.value.set(1 / rts.b1a.width, 0); this.pass(this.blurMat, rts.b1a);
      B.tDiffuse.value = rts.b1a.texture; B.dir.value.set(0, 1 / rts.b1a.height); this.pass(this.blurMat, rts.b1b);
      B.tDiffuse.value = rts.b1b.texture; B.dir.value.set(1 / rts.b2a.width, 0); this.pass(this.blurMat, rts.b2a);
      B.tDiffuse.value = rts.b2a.texture; B.dir.value.set(0, 1 / rts.b2a.height); this.pass(this.blurMat, rts.b2b);
      B.tDiffuse.value = rts.b2b.texture; B.dir.value.set(2 / rts.b2a.width, 0); this.pass(this.blurMat, rts.b2a);
      B.tDiffuse.value = rts.b2a.texture; B.dir.value.set(0, 2 / rts.b2a.height); this.pass(this.blurMat, rts.b2b);
    }
    U.tScene.value = rts.scene.texture;
    U.tBloom1.value = rts.b1b.texture; U.tBloom2.value = rts.b2b.texture;
    U.bloomStrength.value = bloomOn ? (this.settings.bloomStrength ?? 0.55) : 0;
    this.pass(this.compMat, null);
  }

  // Rendu d'une caméra dans une cible (CCTV, polaroid…)
  renderTo(scene, camera, target) {
    this.gl.setRenderTarget(target);
    this.gl.clear();
    this.gl.render(scene, camera);
    this.gl.setRenderTarget(null);
  }

  // Affiche une texture de caméra en plein écran avec le shader CCTV
  renderCCTV(texture, opts = {}) {
    const U = this.cctvMat.uniforms;
    U.tCam.value = texture; U.time.value = this._time;
    U.ir.value = opts.ir ? 1 : 0; U.noiseAmt.value = opts.noise ?? 0.1; U.offline.value = opts.offline ? 1 : 0; U.glitch.value = opts.glitch || 0;
    U.tOverlay.value = opts.overlay || null; U.hasOverlay.value = opts.overlay ? 1 : 0; U.curvature.value = 0.1;
    U.resolution.value.set(texture?.image?.width || 640, texture?.image?.height || 400);
    U.brightness.value = opts.brightness ?? 1.1;
    this.pass(this.cctvMat, null);
  }

  readPixels(target, w, h) {
    const buf = new Uint8Array(w * h * 4);
    this.gl.readRenderTargetPixels(target, 0, 0, w, h, buf);
    return buf;
  }
}
