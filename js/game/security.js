// Vidéosurveillance et poste de sécurité :
// - mur de 15 moniteurs cathodiques (rendu tournant d'une caméra par image, comme un vrai séquenceur CCTV) ;
// - vue plein écran au bureau (infrarouge, zoom molette, rotation motorisée, liste des caméras, journal) ;
// - console : porte blindée, trappe d'aération, éclairages, rideaux, alarmes, entrée principale, escalators,
//   fontaine, annonces, état électrique ;
// - enregistreur : images JPEG horodatées, relecture, effacement (preuves… ou trou suspect dans la bande) ;
// - détecteurs de mouvement, caméras portatives, voiture RC (pilotage + caméra embarquée), tablette,
//   mode spectateur (multijoueur), barrières d'accès et escalators.
// L'état partagé (enregistrement, caméras masquées, pilote de la voiture) vit dans l'objet monde 'security'.
import * as THREE from 'three';
import { Net } from '../net/net.js';
import { WorldObject } from '../world/world.js';
import { Box, LAYER } from '../engine/physics.js';
import { CCTV_FRAG, CRT_LIVE } from '../engine/renderer.js';
import { GLOBAL_UNIFORMS } from '../engine/materials.js';
import { quickGeometry } from '../world/meshes.js';
import { SHOPS, AREAS } from '../data/shops.js';
import { CIRCUITS } from '../world/power.js';

const FS_VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// graine stable d'une caméra (dérive de son tube : phase de la bande, scintillement, décrochages)
const camSeed = (id) => { let h = 7; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h / 9973; };
// Écran d'un moniteur du mur : l'image de sa cible (partie fixe, perceptuelle, refaite à son tour : 4 à 8 fois par
// seconde) passe à chaque image par le tube animé (CRT_LIVE, horloge du jeu), puis repasse en linéaire ; neige animée là
// où la cible signale « pas de signal » (alpha nul). Un seul programme pour les 15 écrans, chacun avec sa graine.
function crtScreen(mat, seed) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.crtT = GLOBAL_UNIFORMS.time; sh.uniforms.crtSeed = { value: seed };
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float crtT, crtSeed;\n' + CRT_LIVE + '\nvoid main() {').replace('#include <map_fragment>', `
      vec4 crtS = texture2D(map, vMapUv + vec2(crtJitter(vMapUv.y, crtT, crtSeed, 0.992), 0.0));
      vec3 crtC = crtLive(crtS.rgb, vMapUv, vMapUv * vec2(${(MON_W * 0.7).toFixed(1)}, ${(MON_H * 0.7).toFixed(1)}), crtT, crtSeed, 150.0, crtScanVis(vMapUv.y, 150.0));
      crtC = clamp(crtC + (1.0 - crtS.a) * (crtH2(floor(vMapUv * vec2(${MON_W}.0, ${MON_H}.0)) + fract(crtT * 11.0) * 577.0) - 0.5) * 0.24, 0.0, 1.0);
      diffuseColor.rgb *= crtC * crtC * (crtC * 0.3 + 0.7); // ≈ décodage sRGB`);
  };
  mat.customProgramCacheKey = () => 'crt_screen';
}
// Calques : 0 = normal, 1 = avatar du joueur local (vu seulement par les caméras), 2 = visible seulement
// sur les caméras, 3 = visible seulement en infrarouge.
export const CAM_LAYERS = { avatar: 1, cam: 2, ir: 3 };
const MON_COLS = 5, MON_ROWS = 3, MON_W = 288, MON_H = 162; // image au format des dalles (0,78 × 0,44 : plus d'étirement)
const CAP_W = 176, CAP_H = 132;
const MAX_FRAMES = 900;
const DESK_SEAT = new THREE.Vector3(-71.75, 0, 0);
// voies d'escalators : [x bas, x haut, z0, z1, sens (+1 = monte vers x haut)]
const ESCALATOR_LANES = [[-15, -24, -2.6, -0.6, 1], [-15, -24, 0.6, 2.6, -1], [15, 24, -2.6, -0.6, 1], [15, 24, 0.6, 2.6, -1]];

function hhmmss(min) {
  const t = ((min % 1440) + 1440) % 1440; const h = Math.floor(t / 60), m = Math.floor(t % 60), s = Math.floor((t * 60) % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ── objets monde ──
class SecurityState extends WorldObject {
  constructor(world, sec) { super(world, 'security', 'security'); this.sec = sec; this.init({ rec: false, blocked: {}, mounted: {}, rc: null, erased: {} }); world.add(this); }
  onState(patch, isReset) { this.sec.onState(patch, isReset); }
}
class MonitorWall extends WorldObject {
  constructor(world, sec) {
    super(world, 'monitor_wall', 'monitors'); this.sec = sec; this.zone = 'security'; this.name = 'Mur d\'écrans';
    // au-dessus des objets du bureau : on vise les écrans par-dessus le bureau
    this.setPick(-75.95, 1.2, -2.7, -72.3, 2.66, 2.7); this.init({}); world.add(this);
  }
  prompt(p) { return 'E : S\'asseoir au poste — surveiller les caméras'; }
  local(v, p) { if (v === 'use') this.sec.enterDesk(); return true; }
}
class CamObj extends WorldObject {
  constructor(world, sec, cam) {
    super(world, 'cam:' + cam.id, 'camera'); this.sec = sec; this.cam = cam; this.zone = cam.zone; this.name = 'Caméra';
    const p = cam.pos; this.setPick(p.x - 0.18, p.y - 0.18, p.z - 0.18, p.x + 0.18, p.y + 0.14, p.z + 0.18); this.init({}); world.add(this);
  }
  prompt(p) {
    const b = this.sec.state.state.blocked[this.cam.id];
    if (b) return 'Caméra « ' + this.cam.name + ' » — objectif masqué   R : Nettoyer l\'objectif';
    return 'Caméra « ' + this.cam.name + ' »' + (this.sec.state.state.rec ? ' — voyant rouge : elle enregistre' : '');
  }
  interact(verb, actor) { if (verb === 'alt' && this.sec.state.state.blocked[this.cam.id]) this.sec.setBlocked(this.cam.id, false); }
}

export class Security {
  constructor(g) {
    this.game = g; this.world = g.world;
    this.fullscreen = false; this.mode = null; // null | 'desk' | 'tablet' | 'spectate'
    this.tab = 'cams'; this.selId = null; this.irMode = 'auto'; this.zoom = 1; this.pans = new Map();
    this.glitchT = 0; this.glitchFigure = false;
    this.log = []; this.motion = new Map(); this.frames = []; this.lastCap = new Map(); this.capT = 0; this.capRR = 0;
    this.sensorCD = new Map(); this.sensorLast = new Map(); this.sensT = 0; this.motionT = 0;
    this.monIdx = 0; this.monPage = 0; this.monPageT = 0; this.uiT = 0; this.listT = -1; this._list = [];
    this.playback = null; this.rcLocal = null; this.rcInput = { t: 0, s: 0, at: 0 }; this.rcSendT = 0; this.rcLoop = null;
    this.deskLook = { yaw: 0, pitch: 0 }; this.lastMouse = null; this.dragging = false;
    this.state = new SecurityState(g.world, this);
    this.wall = new MonitorWall(g.world, this);
    this.cctvCam = new THREE.PerspectiveCamera(70, 4 / 3, 0.05, 160); this.cctvCam.rotation.order = 'YXZ';
    this.irLight = new THREE.AmbientLight(0xffffff, 0); g.scene.add(this.irLight);
    const noise = g.renderer.cctvMat.uniforms.tNoise.value;
    // moniteurs : partie fixe du tube seulement (l'écran anime le reste, crtScreen) ; enregistreur : image sRGB
    const mkMat = (defines) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: CCTV_FRAG, defines, depthTest: false, depthWrite: false, uniforms: { tCam: { value: null }, tNoise: { value: noise }, tOverlay: { value: null }, hasOverlay: { value: 0 }, time: { value: 0 }, ir: { value: 0 }, noiseAmt: { value: 0.12 }, offline: { value: 0 }, glitch: { value: 0 }, curvature: { value: 0.0 }, brightness: { value: 1.1 }, resolution: { value: new THREE.Vector2(MON_W, MON_H) }, swap: { value: 0 }, lines: { value: 0 }, seed: { value: 0 }, analog: { value: 1 } } });
    this.monMat = mkMat({ CCTV_RT: 1 }); this.capMat = mkMat({});
    this.camRT = g.renderer.makeRT(MON_W, MON_H, { depthBuffer: true });
    this.capRT = new THREE.WebGLRenderTarget(CAP_W, CAP_H, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.capScene = g.renderer.makeRT(CAP_W, CAP_H, { depthBuffer: true });
    this.capCanvas = document.createElement('canvas'); this.capCanvas.width = CAP_W; this.capCanvas.height = CAP_H;
    this.fsRT = null; this.fsSize = [0, 0];
    this.overlayCanvas = document.createElement('canvas'); this.overlayCanvas.width = 512; this.overlayCanvas.height = 384;
    this.overlayTex = new THREE.CanvasTexture(this.overlayCanvas);
    this.buildMonitorWall();
    this.buildCameraMeshes();
    this.buildHatch();
    this.buildBarriers();
    this.registerNet();
    this._cap = (code, down, e) => this.onKey(code, down, e);
    g.hooks.on('power_state', (patch) => this.onPower(patch));
    g.hooks.on('player_left', (id) => { if (Net.isHost && this.state.state.rc?.driver === id) this.rcStopHost(); });
    g.hooks.on('shop_alarm', (d) => this.addLog('Alarme : ' + (SHOPS.find(s => s.id === d.shop)?.name || d.shop), 'alarm'));
    g.hooks.on('fire_alarm', () => this.addLog('ALARME INCENDIE', 'alarm'));
    g.hooks.on('power_lost', () => { if (g.story?.phase === 'night') this.addLog('Coupure de courant secteur', 'alarm'); });
    g.hooks.on('power_back', () => { if (g.story?.phase === 'night') this.addLog('Retour du secteur', ''); });
    g.lighting.addSource({ getLight: () => this.wallLight() });
    this.escLoops = [];
    this.uvMeshes = new Map(); this.refreshUV();
  }

  // ───────────────────────── construction ─────────────────────────
  buildMonitorWall() {
    const g = this.game; const zone = g.world.zone('security');
    this.monitors = [];
    const { geometry } = quickGeometry(g.atlas, (k) => {
      for (let r = 0; r < MON_ROWS; r++) for (let c = 0; c < MON_COLS; c++) {
        const y = 1.25 + r * 0.53, z = -2.0 + c * 1.0;
        k.box(-75.65, y, z, 0.5, 0.5, 0.92, 0x2a2a2c); // caisson cathodique
        k.box(-75.86, y, z, 0.12, 0.36, 0.6, 0x1c1c1e); // culot
        k.box(-75.395, y - 0.215, z + 0.36, 0.01, 0.025, 0.06, 0x6a6a6a); // bouton
      }
      // étagères du rack
      for (let r = 0; r <= MON_ROWS; r++) k.box(-75.6, 0.98 + r * 0.53, 0, 0.7, 0.03, 5.15, 0x3a3a3a);
      for (const z of [-2.58, 2.58]) k.box(-75.6, 1.78, z, 0.7, 1.62, 0.04, 0x333333);
      // console de commande sur le bureau (rangées de boutons)
      k.box(-73.9, 0.82, -1.6, 0.42, 0.06, 1.1, 0x303438);
      for (let i = 0; i < 12; i++) k.box(-73.72 - (i % 2) * 0.14, 0.86, -2.05 + Math.floor(i / 2) * 0.17, 0.08, 0.02, 0.1, [0xc62828, 0x2e7d32, 0xf9a825, 0x1565c0][i % 4]);
    });
    const body = new THREE.Mesh(geometry, g.mats.get('props', 'security')); body.castShadow = true; body.receiveShadow = true;
    zone.group.add(body);
    // collision du rack
    g.world.physics.add(new Box(-75.95, 0.9, -2.6, -75.38, 2.65, 2.6, LAYER.FURN));
    for (let r = 0; r < MON_ROWS; r++) for (let c = 0; c < MON_COLS; c++) {
      const rt = new THREE.WebGLRenderTarget(MON_W, MON_H, { type: THREE.UnsignedByteType, depthBuffer: false });
      const mat = new THREE.MeshBasicMaterial({ map: rt.texture, color: 0x000000 }); crtScreen(mat, ((r * MON_COLS + c) * 0.618034) % 1);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.44), mat);
      scr.rotation.y = Math.PI / 2; scr.position.set(-75.392, 1.25 + r * 0.53, -2.0 + c * 1.0);
      zone.group.add(scr);
      const oc = document.createElement('canvas'); oc.width = MON_W; oc.height = MON_H;
      const ot = new THREE.CanvasTexture(oc);
      // index : rangée du haut d'abord, de gauche à droite vu depuis le bureau (z croissant = gauche du joueur → on inverse)
      this.monitors.push({ rt, mat, mesh: scr, oc, ot, row: MON_ROWS - 1 - r, col: MON_COLS - 1 - c, cam: null, drawnKey: '', lastT: 0 });
    }
    this.monitors.sort((a, b) => a.row * MON_COLS + a.col - (b.row * MON_COLS + b.col));
  }
  wallLight() {
    if (!this.powered('security')) return null;
    return { pos: new THREE.Vector3(-74.9, 1.8, 0), color: [0.45, 0.75, 0.9], intensity: 2.2 + Math.random() * 0.15, distance: 6, priority: 0.8 };
  }
  buildCameraMeshes() {
    const g = this.game;
    const { geometry } = quickGeometry(g.atlas, (k) => {
      k.box(0, 0, 0.02, 0.13, 0.11, 0.26, 0xe8e8e4); // boîtier (objectif vers -z)
      k.box(0, 0.075, 0.03, 0.16, 0.025, 0.3, 0xd0d0cc); // visière
      k.cyl(0, 0, -0.12, 0.04, 0.03, 0x111111, Math.PI / 2, 0, 0);
      k.box(0, 0.11, 0.1, 0.03, 0.14, 0.03, 0x9a9a9a); // bras
    });
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
    const ledGeo = new THREE.SphereGeometry(0.012, 6, 4);
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.9 });
    const tapeGeo = new THREE.BoxGeometry(0.11, 0.1, 0.02);
    this.camMeshes = new Map();
    for (const c of g.world.cameras) {
      const grp = new THREE.Group(); grp.position.copy(c.pos); grp.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
      const m = new THREE.Mesh(geometry, g.mats.get('props', c.zone)); m.castShadow = true; grp.add(m);
      const led = new THREE.Mesh(ledGeo, this.ledMat); led.position.set(0.045, -0.035, -0.11); grp.add(led);
      const tape = new THREE.Mesh(tapeGeo, tapeMat); tape.position.set(0, 0, -0.14); tape.visible = false; grp.add(tape);
      (g.world.zone(c.zone)?.group || g.world.root).add(grp);
      this.camMeshes.set(c.id, { grp, tape });
      new CamObj(g.world, this, c);
    }
  }
  buildHatch() {
    const g = this.game; const zone = g.world.zone('security');
    const hm = new THREE.MeshStandardMaterial({ color: 0x5b6066, metalness: 0.7, roughness: 0.45 });
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 1.0), hm); housing.position.set(-69, 3.24, 1.05); zone.group.add(housing);
    const plateGeo = new THREE.BoxGeometry(1.02, 0.03, 1.02);
    const stripes = new THREE.MeshStandardMaterial({ color: 0xd8a200, metalness: 0.5, roughness: 0.5 });
    this.hatch = new THREE.Mesh(plateGeo, [hm, hm, hm, stripes, hm, hm]); this.hatch.position.set(-69, 3.17, 1.05); zone.group.add(this.hatch);
    this.hatchT = 0;
  }
  buildBarriers() {
    const g = this.game; const zone = g.world.zone('atrium');
    this.barriers = [];
    const postMat = g.mats.get('chrome'); const beltMat = new THREE.MeshStandardMaterial({ color: 0xb71c1c, roughness: 0.6 });
    for (const x of [-13.55, 13.55]) {
      const grp = new THREE.Group();
      for (const z of [-2.7, 0, 2.7]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.0, 10), postMat); post.position.set(x, 0.5, z); grp.add(post); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 14), postMat); base.position.set(x, 0.015, z); grp.add(base); }
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 5.4), beltMat); belt.position.set(x, 0.92, 0); grp.add(belt);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: this.signTexture('ÉTAGE FERMÉ'), transparent: false }));
      sign.position.set(x + (x < 0 ? 0.02 : -0.02), 0.72, 0); sign.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; grp.add(sign);
      zone.group.add(grp);
      const box = g.world.physics.add(new Box(x - 0.08, 0, -2.75, x + 0.08, 1.2, 2.75, LAYER.WALL)); box.enabled = false;
      this.barriers.push({ grp, box });
    }
    this.barrierOpen = null;
  }
  signTexture(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#b71c1c'; x.fillRect(0, 0, 256, 128); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(8, 8, 240, 112);
    x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ───────────────────────── réseau ─────────────────────────
  registerNet() {
    const g = this.game, S = g.sim;
    S.action('cam_block', (p) => this.setBlocked(p.id, !!p.on));
    S.action('rec', (p, actor) => {
      if (!this.powered('cameras')) { g.sim.emit('toast', { text: 'L\'enregistreur n\'est pas alimenté.' }, { to: actor }); return; }
      if (!p.on && this.state.state.rec && g.story.phase === 'night') g.story.outcome.recordGap = true;
      this.state.set({ rec: !!p.on });
    });
    S.action('rec_erase', (p) => {
      const er = { ...this.state.state.erased, [p.cam]: true }; this.state.set({ erased: er });
      for (const t of g.story.outcome.thefts || []) if (t.recordedId === p.cam) { t.recorded = null; t.erased = true; }
      g.story.outcome.recordGap = true;
    });
    S.action('sec_door', (p) => { if (this.powered('security')) g.power.set({ doorClosed: !!p.closed }); });
    S.action('sec_hatch', (p) => { if (this.powered('security')) g.power.set({ hatchClosed: !!p.closed }); });
    S.action('sec_light', (p) => { const m = {}; for (const z of p.zones) m[z] = !!p.on; g.lighting.setMany(m); });
    S.action('sec_shutter', (p) => { const ctl = g.world.shops[p.shop]; if (!ctl?.shutter) return; if (ctl.shutter.state.locked && !p.close) return; ctl.shutter.set({ target: p.close ? 1 : 0 }); });
    S.action('sec_entrance', (p) => { g.power.set({ mainEntrance: !!p.open }); for (const id of ['entry_a', 'entry_b']) { const d = g.world.doors?.[id]; if (d) d.set({ locked: !p.open, ...(p.open ? {} : { open: 0 }) }); } });
    S.action('sec_escalators', (p) => g.power.set({ escalators: !!p.on }));
    S.action('sec_fountain', (p) => { g.power.set({ fountain: !!p.on }); for (const f of g.devices.kind('fountain')) f.set({ on: !!p.on }); });
    S.action('rc_start', (p, actor) => this.rcStartHost(p.id, actor));
    S.action('rc_stop', (p, actor) => { if (this.state.state.rc && (this.state.state.rc.driver === actor || p.force)) this.rcStopHost(); });
    S.action('rc_input', (p, actor) => { if (this.state.state.rc?.driver === actor) this.rcInput = { t: Math.max(-1, Math.min(1, p.t)), s: Math.max(-1, Math.min(1, p.s)), at: g.time }; if (p.horn) g.sim.emit('fx', { s: 'toy_horn', pos: this.rcPos()?.toArray() }); });
    S.action('rc_mount', (p) => { const car = g.props.get(p.car), cam = g.props.get(p.cam); if (!car || !cam || car.data.camMounted) return; cam.set({ where: 'gone', owner: null }); car.set({ data: { ...car.data, camMounted: true } }); g.sim.emit('fx', { s: 'camera_switch', pos: car.state.pos }); });
    S.effect('sensor', (p) => this.onSensorFx(p));
    S.effect('secglitch', (p) => { this.glitchT = Math.max(this.glitchT, p.dur || 3); this.glitchFigure = !!p.figure; if (p.figure) this.drawFigure(); });
  }
  get S() { return this.state.state; }
  powered(c) { return this.game.power.isOn(c); }

  onState(patch, isReset) {
    const g = this.game;
    if ('blocked' in patch || isReset) for (const [id, m] of this.camMeshes) m.tape.visible = !!this.S.blocked[id];
    if ('rec' in patch && !isReset) { this.addLog(patch.rec ? 'Enregistrement démarré' : 'Enregistrement arrêté', patch.rec ? '' : 'warn'); if (this.mode === 'desk') g.sfx(patch.rec ? 'rec_start' : 'button', null, { bus: 'ui', volume: 0.6 }); }
    if ('rc' in patch || isReset) {
      const rc = this.S.rc;
      if (rc && rc.driver === Net.myId && !this.rcLocal) this.beginLocalRC(rc.car);
      if ((!rc || rc.driver !== Net.myId) && this.rcLocal) this.endLocalRC();
      if (rc && !this.rcLoop) { this.rcLoop = g.loop('toy_car', this.rcPos(), { volume: 0.7, ref: 2 }); this.rcLast = this.rcPos(); }
      if (!rc && this.rcLoop) { this.rcLoop.stop(0.3); this.rcLoop = null; }
    }
    if (this.mode) this.renderUI(true);
  }
  setBlocked(id, on) { const b = { ...this.S.blocked }; if (on) b[id] = true; else delete b[id]; this.state.set({ blocked: b }); }

  onPower(patch) {
    const g = this.game;
    if (!Net.isHost) return;
    const door = g.world.doors?.sec_front;
    if ('doorClosed' in patch && door) {
      door.set({ open: patch.doorClosed ? 0 : 1 });
      g.sim.emit('fx', { s: patch.doorClosed ? 'door_slam' : 'relay', pos: door.pos.toArray(), v: 1 });
    }
    // verrou électromagnétique : sans courant au poste, la porte blindée lâche
    if (('breakers' in patch || 'mains' in patch || 'gen' in patch || 'blown' in patch) && door && g.power.state.doorClosed && !this.powered('security')) {
      clearTimeout(this._doorFail);
      this._doorFail = setTimeout(() => { if (g.power.state.doorClosed && !this.powered('security')) { g.power.set({ doorClosed: false }); g.sim.emit('toast', { text: 'Le verrou magnétique de la porte blindée a lâché (plus de courant au poste).' }); g.sim.emit('fx', { s: 'metal_screech', pos: door.pos.toArray() }); } }, 2500);
    }
  }

  // ───────────────────────── liste des caméras ─────────────────────────
  list() {
    const g = this.game;
    if (this._list && g.time - this.listT < 0.4 && this.listT >= 0) return this._list;
    this.listT = g.time;
    const out = [];
    const feat = g.story.features(g.night);
    if (feat.has('cameras') || g.mode === 'infinite') {
      const unlocked = new Set(g.story.camerasUnlocked());
      let n = 0;
      for (const c of g.world.cameras) { if (!unlocked.has(c.id)) continue; n++; c.kind = 'fixed'; c.short = 'CAM ' + String(n).padStart(2, '0'); out.push(c); }
    }
    let pn = 0;
    for (const pr of g.props.find(x => x.def.use === 'place_cam')) {
      if (!pr.data.cam || pr.state.where !== 'world') continue; pn++;
      const pos = new THREE.Vector3(...pr.state.pos).add(new THREE.Vector3(0, 0.05, 0));
      const z = g.world.zoneAt(pos.x, pos.y + 0.2, pos.z);
      out.push({ id: 'pc:' + pr.id, name: (pr.defId === 'webcam' ? 'Webcam ' : 'Caméra portative ') + pn + (z ? ' (' + z.name + ')' : ''), short: 'PORT ' + pn, kind: 'portable', pos, yaw: pr.data.yaw || 0, pitch: Math.max(-0.7, Math.min(0.4, pr.data.pitch || 0)), fov: 72, zone: z?.id, prop: pr });
    }
    for (const pr of g.props.find('rc_car')) {
      if (!pr.data.camMounted || pr.state.where !== 'world') continue;
      out.push({ id: 'rc:' + pr.id, name: 'Voiture RC — caméra embarquée', short: 'RC', kind: 'rc', prop: pr, fov: 88, zone: null });
    }
    if (this.mode === 'spectate') for (const pl of g.alivePlayers()) if (pl.id !== Net.myId) out.push({ id: 'pl:' + pl.id, name: 'Regard de ' + (pl.name || 'gardien'), short: 'POV', kind: 'player', player: pl, fov: 75 });
    this._list = out;
    return out;
  }
  find(id) { return this.list().find(c => c.id === id) || null; }
  selected() { const L = this.list(); let c = L.find(x => x.id === this.selId); if (!c && L.length) { c = L[0]; this.selId = c.id; } return c || null; }
  // transformation courante d'une caméra (rotation motorisée incluse)
  camTransform(c) {
    if (c.kind === 'rc') { const pr = c.prop; const m = pr.mesh; const pos = m ? m.position.clone() : new THREE.Vector3(...pr.state.pos); pos.y += 0.09; const ry = m ? m.rotation.y : 0; return { pos, yaw: ry + Math.PI, pitch: -0.04, fov: c.fov }; }
    if (c.kind === 'player') { const pl = c.player; const pos = pl.eyePos ? pl.eyePos() : pl.pos.clone().add(new THREE.Vector3(0, 1.6, 0)); return { pos, yaw: pl.yaw, pitch: pl.pitch || 0, fov: c.fov }; }
    const pan = this.pans.get(c.id) || { yaw: 0, pitch: 0 };
    return { pos: c.pos, yaw: c.yaw + pan.yaw, pitch: c.pitch + pan.pitch, fov: c.fov };
  }
  camStatus(c) {
    if (c.kind === 'fixed' && !this.powered('cameras')) return 'offline';
    if (this.S.blocked[c.id]) return 'blocked';
    return 'ok';
  }
  camZoneDark(c, t) {
    const z = c.zone ? this.world.zone(c.zone) : this.world.zoneAt(t.pos.x, t.pos.y, t.pos.z);
    return !z || (z._level ?? 0) < 0.25;
  }
  useIR(c, t) { if (this.irMode === 'on') return true; if (this.irMode === 'off') return false; return this.camZoneDark(c, t); }

  // ───────────────────────── rendu ─────────────────────────
  cullExtras() { return []; }
  renderCam(c, target, w, h, opts = {}) {
    const g = this.game; const R = g.renderer.gl; const t = this.camTransform(c);
    const cam = this.cctvCam;
    cam.position.copy(t.pos); cam.rotation.set(t.pitch, t.yaw, 0, 'YXZ');
    cam.fov = t.fov / (opts.zoom || 1); cam.aspect = w / h; cam.near = c.kind === 'rc' ? 0.02 : 0.05; cam.updateProjectionMatrix();
    const ir = opts.ir ?? this.useIR(c, t);
    cam.layers.mask = 1 | (1 << CAM_LAYERS.avatar) | (1 << CAM_LAYERS.cam) | (ir ? (1 << CAM_LAYERS.ir) : 0);
    if (c.kind === 'player') cam.layers.mask = 1 | (1 << CAM_LAYERS.avatar);
    g.world.cull(t.pos, [], cam, w < 400 ? 0.65 : 0.85);
    if (opts.lights) g.lighting.update(0, t.pos);
    if (ir) { GLOBAL_UNIFORMS.irBoost.value = 0.32; this.irLight.intensity = 1.5; }
    const auto = R.shadowMap.autoUpdate; R.shadowMap.autoUpdate = false;
    // la caméra ne doit pas filmer son propre boîtier
    const own = this.camMeshes.get(c.id); if (own) own.grp.visible = false;
    const ownProp = c.prop?.mesh; const ownVis = ownProp?.visible; if (ownProp && c.kind === 'portable') ownProp.visible = false;
    g.renderer.renderTo(g.scene, cam, target);
    if (own) own.grp.visible = true; if (ownProp && c.kind === 'portable') ownProp.visible = ownVis;
    R.shadowMap.autoUpdate = auto;
    GLOBAL_UNIFORMS.irBoost.value = 0; this.irLight.intensity = 0;
    return ir;
  }
  cctvPass(mat, src, target, w, h, opts) {
    const U = mat.uniforms;
    U.tCam.value = src; U.time.value = this.game.time; U.ir.value = opts.ir ? 1 : 0; U.noiseAmt.value = opts.noise ?? 0.1; U.offline.value = opts.offline ? 1 : 0;
    U.glitch.value = opts.glitch || 0; U.tOverlay.value = opts.overlay || null; U.hasOverlay.value = opts.overlay ? 1 : 0; U.curvature.value = opts.curvature ?? 0.05;
    U.brightness.value = opts.brightness ?? 1.15; U.resolution.value.set(w, h);
    this.game.renderer.pass(mat, target);
    this.game.renderer.gl.setRenderTarget(null);
  }
  clearRT(rt, v = 0.02) { const R = this.game.renderer.gl; const old = R.getClearColor(new THREE.Color()); const oa = R.getClearAlpha(); R.setRenderTarget(rt); R.setClearColor(new THREE.Color(v, v, v), 1); R.clear(); R.setClearColor(old, oa); R.setRenderTarget(null); }

  renderMonitors(dt) {
    const g = this.game;
    this.renderCaptures(dt);
    const cp = g.camera.position;
    const near = (this.mode === 'desk' && !this.fullscreen) || g.world.zone('security').contains(cp.x, cp.y, cp.z, 1.5);
    if (!near) return;
    const powered = this.powered('security');
    if (!powered) { for (const m of this.monitors) m.mat.color.setRGB(0, 0, 0); return; }
    const L = this.list();
    this.monPageT += dt;
    const pages = Math.max(1, Math.ceil(L.length / this.monitors.length));
    if (this.monPageT > 12) { this.monPageT = 0; this.monPage = (this.monPage + 1) % pages; }
    if (this.monPage >= pages) this.monPage = 0;
    // 1 à 2 écrans rafraîchis par 1/60 s, jamais plus d'un lot par image : sur un écran 144 Hz on ne refait pas
    // 288 rendus de caméra par seconde, sur une machine lente on ne rattrape pas le retard
    const n = this.mode === 'desk' && g.settings.quality !== 'low' ? 2 : 1;
    this.monAcc = Math.min((this.monAcc || 0) + dt * 60 * n, n);
    const todo = Math.floor(this.monAcc); this.monAcc -= todo;
    for (let k = 0; k < todo; k++) {
      const i = this.monIdx = (this.monIdx + 1) % this.monitors.length;
      const m = this.monitors[i];
      const c = L.length ? L[(this.monPage * this.monitors.length + i)] || null : null;
      m.cam = c;
      this.drawMonitor(m);
    }
    g.world.cull(cp, [], g.camera, g.settings.quality === 'low' ? 0.8 : 1);
  }
  drawMonitor(m) {
    const g = this.game; const c = m.cam;
    m.mat.color.setRGB(1.5, 1.5, 1.5);
    const st = c ? this.camStatus(c) : 'nosignal';
    this.drawMonOverlay(m, c, st);
    let ir = false;
    if (st === 'ok') { ir = this.renderCam(c, this.camRT, MON_W, MON_H); }
    else this.clearRT(this.camRT, st === 'blocked' ? 0.015 : 0);
    // grain léger dans l'image fixe : l'écran ajoute le sien, animé (crtScreen)
    this.cctvPass(this.monMat, this.camRT.texture, m.rt, MON_W, MON_H, { ir, offline: st === 'offline' || st === 'nosignal', noise: 0.06, glitch: this.glitchT > 0 ? 0.6 : 0, overlay: m.ot, brightness: st === 'blocked' ? 0.4 : 1.08 });
    if (st === 'ok' && c) this.maybeCapture(c, this.camRT.texture, ir);
  }
  drawMonOverlay(m, c, st) {
    const g = this.game; const sec = Math.floor(g.env.minutes * 60);
    const key = (c?.id || '-') + '|' + st + '|' + sec + '|' + this.S.rec + '|' + (this.motionRecent(c) ? 1 : 0);
    if (key === m.drawnKey) return; m.drawnKey = key;
    const x = m.oc.getContext('2d'); x.clearRect(0, 0, MON_W, MON_H);
    x.font = 'bold 13px monospace'; x.textBaseline = 'top'; x.shadowColor = '#000'; x.shadowBlur = 3;
    x.fillStyle = 'rgba(230,255,235,0.95)';
    if (c) { x.fillText(c.short || 'CAM', 8, 7); x.font = '11px monospace'; x.fillText((c.name || '').slice(0, 30), 8, 23); }
    x.font = '12px monospace'; x.fillText(hhmmss(g.env.minutes), 8, MON_H - 20);
    if (this.S.rec && st === 'ok') { x.fillStyle = (sec % 2) ? '#ff4040' : '#801010'; x.beginPath(); x.arc(MON_W - 44, 14, 5, 0, 7); x.fill(); x.fillText('REC', MON_W - 36, 8); }
    if (c && this.motionRecent(c)) { x.fillStyle = '#ffd040'; x.fillText('MOUVEMENT', MON_W - 86, MON_H - 20); }
    if (st !== 'ok') { x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = 'bold 15px monospace'; x.textAlign = 'center'; x.fillText(st === 'blocked' ? 'OBJECTIF OBSTRUÉ' : st === 'offline' ? 'PAS D\'ALIMENTATION' : 'PAS DE SIGNAL', MON_W / 2, MON_H / 2 - 8); x.textAlign = 'left'; }
    m.ot.needsUpdate = true;
  }

  renderFullscreen(dt) {
    const g = this.game;
    this.renderCaptures(dt);
    const R = g.renderer.gl;
    const W = window.innerWidth, H = window.innerHeight;
    const fw = Math.min(1100, Math.round(W * 0.8)), fh = Math.max(120, Math.round(fw * H / W));
    if (!this.fsRT || this.fsSize[0] !== fw || this.fsSize[1] !== fh) { this.fsRT?.dispose(); this.fsRT = g.renderer.makeRT(fw, fh, { depthBuffer: true }); this.fsSize = [fw, fh]; }
    if (this.playback) { R.setRenderTarget(null); R.setClearColor(0x000000, 1); R.clear(); return; }
    const c = this.rcLocal?.cam ? this.find('rc:' + this.rcLocal.id) || { id: 'rc:' + this.rcLocal.id, kind: 'rc', prop: g.props.get(this.rcLocal.id), fov: 88 } : this.selected();
    const deskDead = this.mode === 'desk' && !this.powered('security');
    let st = !c ? 'nosignal' : this.camStatus(c);
    if (deskDead) st = 'dead';
    let ir = false;
    if (st === 'ok') ir = this.renderCam(c, this.fsRT, fw, fh, { zoom: this.zoom, lights: true });
    else this.clearRT(this.fsRT, st === 'blocked' ? 0.012 : 0);
    if (st === 'ok' && c) this.maybeCapture(c, this.fsRT.texture, ir);
    if (st === 'dead') { R.setRenderTarget(null); R.setClearColor(0x000000, 1); R.clear(); return; }
    const overlay = this.glitchT > 0 && this.glitchFigure ? this.overlayTex : null;
    // changement de caméra (select) : l'image roule et se brouille 0,15 s
    const swap = this.switchFlash > 0 ? Math.min(1, this.switchFlash / 0.15) : 0; this.switchFlash = Math.max(0, (this.switchFlash || 0) - dt);
    g.renderer.renderCCTV(this.fsRT.texture, { ir, offline: st === 'offline' || st === 'nosignal', noise: this.mode === 'tablet' ? 0.1 : 0.07, glitch: this.glitchT > 0 ? Math.min(1, 0.4 + this.glitchT * 0.2) : (c?.kind === 'rc' ? 0.05 : 0), overlay, brightness: st === 'blocked' ? 0.35 : 1.0, time: g.time, swap, seed: c ? camSeed(c.id) : 0, analog: this.mode !== 'tablet' });
    g.world.cull(g.camera.position, [], g.camera, g.settings.quality === 'low' ? 0.8 : 1);
  }
  drawFigure() {
    const x = this.overlayCanvas.getContext('2d'); const W = 512, H = 384;
    x.clearRect(0, 0, W, H);
    const cx = 160 + Math.random() * 200, s = 0.8 + Math.random() * 0.6;
    x.fillStyle = 'rgba(0,0,0,0.92)';
    x.beginPath(); x.ellipse(cx, 150 * s + 40, 26 * s, 34 * s, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(cx - 40 * s, 190 * s + 40); x.quadraticCurveTo(cx, 170 * s + 40, cx + 40 * s, 190 * s + 40); x.lineTo(cx + 60 * s, H); x.lineTo(cx - 60 * s, H); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.arc(cx - 9 * s, 146 * s + 40, 2.6 * s, 0, 7); x.arc(cx + 9 * s, 146 * s + 40, 2.6 * s, 0, 7); x.fill();
    this.overlayTex.needsUpdate = true;
  }

  // ───────────────────────── enregistreur ─────────────────────────
  motionRecent(c) { return c && (this.game.time - (this.motion.get(c.id) ?? -99)) < 3; }
  renderCaptures(dt) {
    const g = this.game;
    if (!this.S.rec || !this.powered('cameras')) return;
    this.capT += dt; if (this.capT < 0.9) return; this.capT = 0;
    const L = this.list().filter(c => c.kind === 'fixed' || c.kind === 'portable');
    if (!L.length) return;
    // priorité aux caméras qui voient du mouvement
    let c = L.find(x => this.motionRecent(x) && g.time - (this.lastCap.get(x.id) ?? -99) > 1.6);
    if (!c) { for (let k = 0; k < L.length; k++) { const x = L[(this.capRR + k) % L.length]; if (g.time - (this.lastCap.get(x.id) ?? -99) > 7) { c = x; this.capRR = (this.capRR + k + 1) % L.length; break; } } }
    if (!c || this.camStatus(c) !== 'ok') return;
    const ir = this.renderCam(c, this.capScene, CAP_W, CAP_H);
    this.capture(c, this.capScene.texture, ir);
    g.world.cull(g.camera.position, [], g.camera, g.settings.quality === 'low' ? 0.8 : 1);
  }
  maybeCapture(c, tex, ir) {
    if (!this.S.rec || c.kind === 'player' || c.kind === 'rc') return;
    const g = this.game; const last = this.lastCap.get(c.id) ?? -99;
    if (g.time - last < (this.motionRecent(c) ? 1.6 : 7)) return;
    this.capture(c, tex, ir);
  }
  capture(c, tex, ir) {
    const g = this.game; this.lastCap.set(c.id, g.time);
    try {
      this.cctvPass(this.capMat, tex, this.capRT, CAP_W, CAP_H, { ir, noise: 0.08, curvature: 0, brightness: 1.15 });
      // tampons réutilisés d'une prise à l'autre (deux fois 93 Ko de moins à ramasser par image enregistrée)
      const px = g.renderer.readPixels(this.capRT, CAP_W, CAP_H, this._capPx || (this._capPx = new Uint8Array(CAP_W * CAP_H * 4)));
      const ctx = this.capCanvas.getContext('2d'); const img = this._capImg || (this._capImg = ctx.createImageData(CAP_W, CAP_H));
      for (let y = 0; y < CAP_H; y++) img.data.set(px.subarray((CAP_H - 1 - y) * CAP_W * 4, (CAP_H - y) * CAP_W * 4), y * CAP_W * 4);
      ctx.putImageData(img, 0, 0);
      ctx.font = '10px monospace'; ctx.fillStyle = '#e8ffe8'; ctx.fillText((c.short || '') + '  ' + hhmmss(g.env.minutes), 4, CAP_H - 5);
      const url = this.capCanvas.toDataURL('image/jpeg', 0.6);
      this.frames.push({ cam: c.id, name: c.name, t: g.env.minutes, motion: this.motionRecent(c), url });
      if (this.frames.length > MAX_FRAMES) { const i = this.frames.findIndex(f => !f.motion); this.frames.splice(i >= 0 ? i : 0, 1); }
    } catch (e) { /* lecture GPU indisponible */ }
  }
  framesOf(camId) { return this.frames.filter(f => f.cam === camId && !this.S.erased[camId]); }

  // Hôte : quelle caméra enregistrait et voyait ce joueur ? (null si aucune, ou si méconnaissable)
  whoSaw(actorId) {
    const g = this.game; const pl = g.playerById(actorId);
    if (!pl || !this.S.rec || !this.powered('cameras')) return null;
    const chest = pl.pos.clone().add(new THREE.Vector3(0, pl.crouching ? 0.8 : 1.25, 0));
    const disguised = (pl.costume && pl.costume !== 'guard') || !!pl.wear?.face;
    for (const c of this.list()) {
      if (c.kind !== 'fixed' && c.kind !== 'portable') continue;
      if (this.camStatus(c) !== 'ok') continue;
      if (this.sees(c, chest, 24)) {
        if (disguised) { this.addLog('Individu déguisé filmé : ' + c.name, 'warn'); return null; }
        this._lastSawId = c.id;
        return c.name;
      }
    }
    return null;
  }
  sees(c, p, maxD = 22) {
    const t = this.camTransform(c);
    const d = p.clone().sub(t.pos); const dist = d.length(); if (dist > maxD || dist < 0.2) return false;
    d.divideScalar(dist);
    const fwd = new THREE.Vector3(-Math.sin(t.yaw) * Math.cos(t.pitch), Math.sin(t.pitch), -Math.cos(t.yaw) * Math.cos(t.pitch));
    const half = THREE.MathUtils.degToRad(t.fov) * 0.5 * 1.25; // champ horizontal plus large que le vertical
    if (fwd.dot(d) < Math.cos(half)) return false;
    const hit = this.world.physics.raycast(t.pos.x, t.pos.y, t.pos.z, d.x, d.y, d.z, dist - 0.3, LAYER.WALL | LAYER.DOOR);
    return !hit;
  }
  // Caméra visée (pour la masquer au scotch / chewing-gum)
  cameraAt(pos, dir) {
    let best = null, bd = 3.2;
    for (const c of this.list()) {
      if (c.kind !== 'fixed' && c.kind !== 'portable') continue;
      const to = c.pos.clone().sub(pos); const along = to.dot(dir); if (along < 0 || along > 3.2) continue;
      const off = to.clone().addScaledVector(dir, -along).length();
      if (off < 0.45 && along < bd) { bd = along; best = c; }
    }
    if (!best) for (const c of this.world.cameras) { const to = c.pos.clone().sub(pos); const along = to.dot(dir); if (along > 0 && along < 3.2 && to.clone().addScaledVector(dir, -along).length() < 0.45) { best = c; break; } }
    return best ? { id: best.id, name: best.name } : null;
  }

  // ───────────────────────── détecteurs ─────────────────────────
  sensors() { return this.game.props.find('motion_sensor').filter(p => p.state.where === 'world'); }
  updateSensorsHost(dt) {
    const g = this.game; this.sensT += dt; if (this.sensT < 0.3) return; this.sensT = 0;
    const list = this.sensors().filter(s => s.data.armed); if (!list.length) return;
    const movers = [];
    for (const pl of g.alivePlayers()) { const sp = pl.speed ?? Math.hypot(pl.body?.vel?.[0] || 0, pl.body?.vel?.[2] || 0); if (sp > 0.9 && pl.mode !== 'desk' && !pl.inVent) movers.push({ pos: pl.pos.clone().add(new THREE.Vector3(0, 1, 0)), what: 'player' }); }
    for (const a of g.entities.actors?.() || []) if (a.moving !== false) movers.push({ pos: a.pos.clone().add(new THREE.Vector3(0, a.h ?? 0.8, 0)), what: a.kind });
    const rp = this.S.rc ? this.rcPos() : null; if (rp) movers.push({ pos: rp, what: 'rc' });
    for (const s of list) {
      if (g.time < (this.sensorCD.get(s.id) || 0)) continue;
      const sp = new THREE.Vector3(...s.state.pos);
      for (const m of movers) {
        const d = m.pos.clone().sub(sp); const dist = d.length(); if (dist > 5.5 || Math.abs(d.y) > 2.6) continue;
        d.divideScalar(dist || 1);
        if (this.world.physics.raycast(sp.x, sp.y, sp.z, d.x, d.y, d.z, Math.max(0, dist - 0.3), LAYER.WALL | LAYER.DOOR | LAYER.GLASS)) continue;
        this.sensorCD.set(s.id, g.time + 6);
        const z = g.world.zoneAt(sp.x, sp.y + 0.3, sp.z);
        g.sim.emit('sensor', { id: s.id, pos: s.state.pos, zone: z?.id || null, zname: z?.name || 'zone inconnue', what: m.what });
        g.hooks.emit('sensor_trip', { sensor: s, what: m.what, zone: z?.id });
        break;
      }
    }
  }
  onSensorFx(p) {
    const g = this.game;
    this.sensorLast.set(p.id, g.time);
    g.sfx('beep', new THREE.Vector3(...p.pos), { volume: 0.5, ref: 1.5 });
    const desk = g.world.points.deskTop; g.sfx('alert', desk, { volume: 0.7, ref: 3 });
    this.addLog('Détecteur — ' + p.zname + ' : mouvement', 'sensor');
    const p0 = g.player;
    const nearDesk = this.mode || p0.pos.distanceTo(desk) < 9 || p0.hasItem('tablet');
    if (nearDesk) g.ui.alert('Détecteur de mouvement — ' + p.zname, 'info', 5);
  }

  // ───────────────────────── mouvement vu par les caméras ─────────────────────────
  updateMotion(dt) {
    const g = this.game; this.motionT += dt; if (this.motionT < 0.5) return; this.motionT = 0;
    const L = this.list(); if (!L.length) return;
    const pts = [];
    for (const pl of g.alivePlayers()) { const sp = pl.speed ?? Math.hypot(pl.body?.vel?.[0] || 0, pl.body?.vel?.[2] || 0); if (sp > 0.4) pts.push(pl.pos.clone().add(new THREE.Vector3(0, 1.2, 0))); }
    for (const a of g.entities.actors?.() || []) if (a.moving !== false && a.cam !== false) pts.push(a.pos.clone().add(new THREE.Vector3(0, a.h ?? 0.8, 0)));
    for (const pr of g.props.awake) pts.push(new THREE.Vector3(...pr.state.pos));
    if (this.S.rc) { const rp = this.rcPos(); if (rp) pts.push(rp); }
    if (!pts.length) return;
    for (const c of L) {
      if (c.kind === 'player' || c.kind === 'rc' || this.camStatus(c) !== 'ok') continue;
      for (const p of pts) if (this.sees(c, p, 26)) { this.motion.set(c.id, g.time); break; }
    }
  }

  // ───────────────────────── voiture RC ─────────────────────────
  rcPos() { const rc = this.S.rc; if (!rc) return null; const pr = this.game.props.get(rc.car); if (!pr) return null; return pr.mesh ? pr.mesh.position.clone() : new THREE.Vector3(...pr.state.pos); }
  driveRC(id) {
    const g = this.game; const pr = g.props.get(id);
    if (!pr || pr.state.where !== 'world') { g.toast('La voiture doit être posée au sol.'); return; }
    if (this.S.rc && this.S.rc.driver !== Net.myId) { g.toast('Quelqu\'un pilote déjà la voiture.'); return; }
    if (this.mode && !pr.data.camMounted) { g.toast('Sans caméra fixée dessus, impossible de piloter depuis l\'écran. (Tenez une caméra portative et appuyez sur R en visant la voiture.)'); return; }
    if (!this.mode && !g.player.hasItem('rc_remote') && !pr.data.camMounted) { g.toast('Il vous faut la télécommande.'); return; }
    g.sim.do('rc_start', { id });
  }
  rcStartHost(id, actor) {
    const g = this.game; const pr = g.props.get(id); if (!pr || pr.state.where !== 'world') return;
    if (this.S.rc && this.S.rc.driver !== actor) return;
    if (pr.body) { g.world.physics.removeBody(pr.body); g.props.awake.delete(pr); pr.body = null; }
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...pr.state.quat), 'YXZ');
    this.rcBody = { pos: [pr.state.pos[0], pr.state.pos[1] - pr.half[1], pr.state.pos[2]], vel: [0, 0, 0], radius: 0.16, height: 0.14, stepHeight: 0.06, onGround: false };
    this.rcYaw = e.y; this.rcSpeed = 0; this.rcSnapT = 0; this.rcNoiseT = 0;
    this.rcInput = { t: 0, s: 0, at: g.time };
    this.state.set({ rc: { car: id, driver: actor } });
  }
  rcStopHost() {
    const g = this.game; const rc = this.S.rc; if (!rc) return;
    const pr = g.props.get(rc.car);
    if (pr && this.rcBody) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.rcYaw, 0)); pr.set({ pos: [this.rcBody.pos[0], this.rcBody.pos[1] + pr.half[1], this.rcBody.pos[2]], quat: [q.x, q.y, q.z, q.w] }); }
    this.rcBody = null; this.state.set({ rc: null });
  }
  updateRCHost(dt) {
    const g = this.game; const rc = this.S.rc; if (!rc || !this.rcBody) return;
    const pr = g.props.get(rc.car); if (!pr || pr.state.where !== 'world') { this.rcStopHost(); return; }
    const I = g.time - this.rcInput.at > 0.6 ? { t: 0, s: 0 } : this.rcInput;
    const maxF = 5.5, maxB = 2.4;
    this.rcSpeed += (I.t * 10 - this.rcSpeed * 1.6) * dt;
    this.rcSpeed = Math.max(-maxB, Math.min(maxF, this.rcSpeed));
    this.rcYaw += I.s * dt * 2.8 * Math.max(-1, Math.min(1, this.rcSpeed / 1.5));
    const b = this.rcBody; const before = [b.pos[0], b.pos[2]];
    b.vel[0] = Math.sin(this.rcYaw) * this.rcSpeed; b.vel[2] = Math.cos(this.rcYaw) * this.rcSpeed;
    g.world.physics.moveCharacter(b, dt);
    const moved = Math.hypot(b.pos[0] - before[0], b.pos[2] - before[1]);
    if (Math.abs(this.rcSpeed) > 1.5 && moved < Math.abs(this.rcSpeed) * dt * 0.3) { g.sim.emit('fx', { s: 'hit_plastic', pos: [b.pos[0], b.pos[1] + 0.1, b.pos[2]], v: Math.min(1, Math.abs(this.rcSpeed) / 5) }); this.rcSpeed *= -0.3; }
    if (b.pos[1] < -40) { this.rcStopHost(); return; }
    const y = b.pos[1] + pr.half[1];
    pr.state.pos = [b.pos[0], y, b.pos[2]];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.rcYaw, 0)); pr.state.quat = [q.x, q.y, q.z, q.w];
    g.props._ensureMesh(pr); pr.mesh.position.set(b.pos[0], y, b.pos[2]); pr.mesh.rotation.set(0, this.rcYaw, 0, 'YXZ'); pr._setPickAt(b.pos[0], y, b.pos[2]);
    this.rcSnapT += dt;
    if (Net.online && this.rcSnapT > 0.08) { this.rcSnapT = 0; g.sim.emit('props.snap', { a: [pr.id, +b.pos[0].toFixed(3), +y.toFixed(3), +b.pos[2].toFixed(3), 0, +this.rcYaw.toFixed(3), 0] }, { exceptHost: true }); }
    this.rcNoiseT += dt;
    if (this.rcNoiseT > 0.8 && Math.abs(this.rcSpeed) > 0.6) { this.rcNoiseT = 0; g.noise(new THREE.Vector3(...pr.state.pos), 0.25, 'rc'); if (Math.random() < 0.15) g.entities.catPlay?.(new THREE.Vector3(...pr.state.pos)); }
  }
  beginLocalRC(id) {
    const g = this.game; const pr = g.props.get(id); if (!pr) return;
    this.rcLocal = { id, cam: !!pr.data.camMounted, prevMode: this.mode, prevFull: this.fullscreen, prevPlayerMode: g.player.mode };
    if (this.rcLocal.cam) { this.fullscreen = true; if (!this.mode) { this.mode = 'rc'; this.lockPlayer('screen'); } }
    else { this.lockPlayer('screen'); }
    this.ensureUI(); this.renderUI(true);
    g.toast('Pilotage : ZQSD / flèches · Espace : klaxon · Échap : arrêter', 5);
  }
  endLocalRC() {
    const g = this.game; const L = this.rcLocal; this.rcLocal = null; if (!L) return;
    if (this.mode === 'rc') { this.mode = null; this.fullscreen = false; this.unlockPlayer(); }
    else if (!this.mode) this.unlockPlayer();
    else this.fullscreen = L.prevFull;
    this.renderUI(true);
  }
  updateLocalRC(dt) {
    const g = this.game; const L = this.rcLocal; if (!L) return;
    const k = this.keys || {};
    const t = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const s = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
    this.rcSendT += dt;
    if (this.rcSendT > 0.066 || this._horn) { this.rcSendT = 0; g.sim.do('rc_input', { t, s, horn: !!this._horn }); this._horn = false; }
    if (!L.cam) {
      // sans caméra : le joueur suit la voiture des yeux
      const rp = this.rcPos(); const p = g.player;
      if (rp) {
        const eye = g.camera.position; const d = rp.clone().sub(eye);
        const yaw = Math.atan2(-d.x, -d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
        p.yaw += Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)) * Math.min(1, dt * 6); p.pitch += (pitch - p.pitch) * Math.min(1, dt * 6);
        g.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
        if (d.length() > 45) { g.toast('La voiture est hors de portée de la télécommande.'); g.sim.do('rc_stop', {}); }
      }
    }
  }

  // ───────────────────────── modes : bureau, tablette, spectateur ─────────────────────────
  lockPlayer(mode) {
    const g = this.game; const p = g.player;
    if (p.mode !== 'desk') p.mode = mode;
    p.body.vel = [0, 0, 0];
    g.ui._noPauseOnUnlock = true; g.input.wantLock = false; g.input.unlock(); setTimeout(() => { g.ui._noPauseOnUnlock = false; }, 400);
    g.input.captureHandler = this._cap; this.keys = {};
  }
  unlockPlayer() {
    const g = this.game; const p = g.player;
    if (p.mode === 'desk' || p.mode === 'screen' || p.mode === 'spectate') p.mode = p.alive ? 'walk' : 'dead';
    if (g.input.captureHandler === this._cap) g.input.captureHandler = null;
    g.input.wantLock = true; this.keys = {};
    if (!g.ui.modal) g.input.lock();
  }
  enterDesk() {
    const g = this.game; const p = g.player;
    if (!p.alive || p.mode !== 'walk' || this.mode) return;
    this.mode = 'desk';
    // multijoueur : place libre au bureau (le bureau fait plus de cinq mètres de long)
    this.seat = DESK_SEAT.clone();
    for (const dz of [0, 1.3, -1.3, 2.2]) { const c = DESK_SEAT.clone().add(new THREE.Vector3(0, 0, dz)); if (!g.allPlayers().some(o => o !== p && o.mode === 'desk' && o.pos.distanceTo(c) < 0.6)) { this.seat = c; break; } }
    p.mode = 'desk'; p.body.pos = [this.seat.x, this.seat.y, this.seat.z]; p.body.vel = [0, 0, 0]; p.yaw = Math.PI / 2; p.pitch = 0;
    this.lockPlayer('desk');
    this.fullscreen = this.powered('security') && this.list().length > 0;
    this.deskLook = { yaw: 0, pitch: -0.05 };
    g.sfx('cloth', null, { volume: 0.4, bus: 'ui' });
    this.ensureUI(); this.renderUI(true);
    g.hooks.emit('desk_enter', p);
    if (!this.powered('security')) g.toast('Le poste n\'est plus alimenté : écrans noirs.');
  }
  exitMode() {
    const g = this.game; const p = g.player;
    if (this.rcLocal) g.sim.do('rc_stop', {});
    this.playback = null;
    if (this.mode === 'desk') { const st = this.seat || DESK_SEAT; p.mode = 'walk'; p.body.pos = [st.x + 0.75, st.y, st.z]; p.yaw = Math.PI / 2; p.pitch = 0; p.updateCamera?.(0); }
    if (this.mode === 'spectate') { this.mode = null; this.fullscreen = false; this.hideUI(); return; }
    this.mode = null; this.fullscreen = false;
    this.unlockPlayer(); this.hideUI();
    setTimeout(() => { if (!g.input.locked && !g.ui.modal && !this.mode && g.player.alive) g.toast('Cliquez dans la fenêtre pour reprendre le contrôle.', 2.5); }, 250);
    g.hooks.emit('desk_exit', p);
  }
  enterTablet() {
    const g = this.game; const p = g.player;
    if (this.mode || p.mode !== 'walk') return;
    this.mode = 'tablet'; this.fullscreen = true; this.tab = 'cams';
    this.lockPlayer('screen'); this.ensureUI(); this.renderUI(true);
    g.sfx('beep', null, { volume: 0.3, bus: 'ui' });
  }
  enterSpectator() {
    const g = this.game;
    if (this.mode === 'desk' || this.mode === 'tablet') this.exitMode();
    this.mode = 'spectate'; this.fullscreen = true; this.tab = 'cams';
    g.player.mode = 'spectate';
    g.ui._noPauseOnUnlock = true; g.input.wantLock = false; g.input.unlock(); setTimeout(() => { g.ui._noPauseOnUnlock = false; }, 400);
    g.input.captureHandler = this._cap; this.keys = {};
    this.listT = -1; const L = this.list(); const pov = L.find(c => c.kind === 'player'); if (pov) this.selId = pov.id;
    this.ensureUI(); this.renderUI(true);
  }

  // ───────────────────────── clavier / souris ─────────────────────────
  onKey(code, down, e) {
    const g = this.game;
    if (!this.mode && !this.rcLocal) return false;
    this.keys = this.keys || {}; this.keys[code] = down;
    if (!down) return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code);
    if (e?.repeat && !['ArrowLeft', 'ArrowRight'].includes(code)) return true;
    if (this.rcLocal) {
      if (code === 'Escape' || code === 'KeyE') { g.sim.do('rc_stop', {}); return true; }
      if (code === 'Space') { this._horn = true; return true; }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) return true;
      return false;
    }
    if (code === 'KeyT' && Net.online) { g.ui.openChat('local'); return true; }
    if (code === 'Escape') {
      if (this.playback) { this.playback = null; this.renderUI(true); return true; }
      if (this.mode === 'desk' && this.fullscreen) { this.fullscreen = false; this.renderUI(true); return true; }
      if (this.mode !== 'spectate') this.exitMode();
      return true;
    }
    if (code === 'Tab') { if (this.mode === 'desk') { this.fullscreen = !this.fullscreen && this.powered('security'); this.renderUI(true); } return true; }
    if (!this.fullscreen) {
      if (code === 'Space' || code === 'ArrowUp') { if (this.powered('security')) { this.fullscreen = true; this.renderUI(true); } return true; }
      return code === 'KeyW' || code === 'KeyS' || code === 'KeyA' || code === 'KeyD';
    }
    if (this.playback) {
      if (code === 'Space') { this.playback.playing = !this.playback.playing; this.renderUI(true); return true; }
      if (code === 'ArrowLeft') { this.pbStep(-1); return true; }
      if (code === 'ArrowRight') { this.pbStep(1); return true; }
      return true;
    }
    if (code === 'ArrowRight' || code === 'ArrowDown') { this.cycle(1); return true; }
    if (code === 'ArrowLeft' || code === 'ArrowUp') { this.cycle(-1); return true; }
    if (code === 'Space') { this.irMode = this.irMode === 'auto' ? 'on' : this.irMode === 'on' ? 'off' : 'auto'; g.sfx('switch', null, { volume: 0.4, bus: 'ui' }); this.renderUI(true); return true; }
    if (code === 'KeyR') { this.toggleRec(); return true; }
    if (code === 'KeyL') { this.toggleViewLight(); return true; }
    if (code === 'KeyZ' || code === 'KeyX') { this.zoom = Math.max(1, Math.min(4, this.zoom * (code === 'KeyZ' ? 1.25 : 0.8))); return true; }
    if (/^Digit[1-9]$/.test(code)) { const i = +code.slice(5) - 1; const L = this.list(); if (L[i]) this.select(L[i].id); return true; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code)) return true;
    return false;
  }
  cycle(d) { const L = this.list(); if (!L.length) return; const i = Math.max(0, L.findIndex(c => c.id === this.selId)); this.select(L[(i + d + L.length) % L.length].id); }
  select(id) {
    const g = this.game; if (id === this.selId && this.fullscreen) return;
    this.selId = id; this.zoom = 1; this.playback = null;
    g.sfx('camera_switch', null, { volume: 0.3, bus: 'ui' });
    this.switchFlash = 0.15; this.renderUI(true);
    const c = this.find(id); if (c) g.hooks.emit('cam_view', { cam: c, player: g.player });
  }
  toggleRec() {
    const g = this.game;
    if (this.mode === 'spectate' || this.mode === 'tablet') return;
    if (!this.feature('recorder')) { g.toast('Pas d\'enregistreur branché pour l\'instant (« on te le branchera demain »).'); return; }
    g.sim.do('rec', { on: !this.S.rec });
  }
  toggleViewLight() {
    const g = this.game; const c = this.selected(); if (!c || this.mode === 'spectate') return;
    if (!this.feature('lights')) { g.toast('Commande d\'éclairage non disponible.'); return; }
    const t = this.camTransform(c); const z = c.zone ? this.world.zone(c.zone) : this.world.zoneAt(t.pos.x, t.pos.y - 1, t.pos.z);
    if (!z) return;
    const zones = this.lightGroupFor(z);
    if (!zones) { g.toast('Cette zone n\'est pas reliée à la console.'); return; }
    const on = !g.lighting.isLit(z.id);
    g.sim.do('sec_light', { zones, on }); g.sfx('switch', null, { volume: 0.35, bus: 'ui' });
  }
  lightGroupFor(z) {
    if (z.shop) { const ctl = this.world.shops[z.shop]; if (ctl && !this.game.isShopUnlocked(z.shop)) return null; return this.shopZones(z.shop); }
    if (z.area && this.game.isAreaUnlocked(z.area) && z.type !== 'vent') return [z.id];
    return null;
  }
  shopZones(id) { const ctl = this.world.shops[id]; if (!ctl) return [id]; const a = []; const zid = typeof ctl.zone === 'string' ? ctl.zone : ctl.zone?.id; const bid = typeof ctl.back === 'string' ? ctl.back : ctl.back?.id; if (zid) a.push(zid); if (bid) a.push(bid); return a.length ? a : [id]; }
  feature(f) { const g = this.game; if (g.mode === 'infinite') return true; return g.story.features(g.night).has(f); }

  // ───────────────────────── interface (DOM) ─────────────────────────
  ensureUI() {
    if (this.ui) { this.ui.root.style.display = 'block'; return; }
    const g = this.game;
    const root = document.createElement('div'); root.className = 'cctv';
    root.innerHTML = `<div class="tabletFrame"></div><img class="pbimg" alt=""><div class="top"><span class="tl"></span><span class="tr"></span></div><div class="log"></div><div class="side"></div><div class="cpanel"></div><div class="tabs"></div><div class="bottom"></div><div class="pb"></div><div class="hint2"></div><div class="roomhint"></div>`;
    g.ui.root.insertBefore(root, g.ui.root.firstChild);
    const q = (s) => root.querySelector(s);
    this.ui = { root, top: q('.top'), tl: q('.tl'), tr: q('.tr'), log: q('.log'), side: q('.side'), panel: q('.cpanel'), tabs: q('.tabs'), bottom: q('.bottom'), pb: q('.pb'), hint: q('.hint2'), room: q('.roomhint'), img: q('.pbimg'), frame: q('.tabletFrame') };
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; e.preventDefault(); this.onButton(b.dataset.a, b.dataset.v, b); });
    root.addEventListener('input', (e) => { if (e.target.matches('.pbrange') && this.playback) { this.playback.i = +e.target.value; this.playback.playing = false; this.showFrame(); } });
    // souris : clic sur un écran (vue pièce), glisser = rotation motorisée (plein écran), molette = zoom
    const isUI = (e) => !!e.target.closest('button, input, .side, .cpanel, .bottom, .tabs, .pb, .log');
    this._md = (e) => { if (!this.mode || isUI(e)) return; if (!this.fullscreen && this.mode === 'desk') this.roomClick(e); else if (e.button === 0) { this.dragging = true; this.lastMouse = [e.clientX, e.clientY]; } };
    this._mu = () => { this.dragging = false; };
    this._mm = (e) => { if (!this.mode) return; this.mouseXY = [e.clientX, e.clientY]; if (this.dragging && this.fullscreen && this.lastMouse) { const c = this.selected(); if (c && c.kind === 'fixed' && !this.playback) { const p = this.pans.get(c.id) || { yaw: 0, pitch: 0 }; p.yaw = Math.max(-0.7, Math.min(0.7, p.yaw - (e.clientX - this.lastMouse[0]) * 0.003 / this.zoom)); p.pitch = Math.max(-0.35, Math.min(0.35, p.pitch - (e.clientY - this.lastMouse[1]) * 0.003 / this.zoom)); this.pans.set(c.id, p); if (!this._motorT || g.time - this._motorT > 0.25) { this._motorT = g.time; g.sfx('relay', null, { volume: 0.12, bus: 'ui' }); } } this.lastMouse = [e.clientX, e.clientY]; } };
    this._wh = (e) => { if (!this.mode || !this.fullscreen || this.playback || isUI(e)) return; this.zoom = Math.max(1, Math.min(4, this.zoom * (e.deltaY < 0 ? 1.12 : 0.89))); };
    root.addEventListener('mousedown', this._md); window.addEventListener('mouseup', this._mu); window.addEventListener('mousemove', this._mm); root.addEventListener('wheel', this._wh, { passive: true });
  }
  hideUI() { if (this.ui) this.ui.root.style.display = 'none'; }

  onButton(a, v, el) {
    const g = this.game; const ro = this.mode === 'spectate';
    g.sfx('button', null, { volume: 0.35, bus: 'ui' });
    switch (a) {
      case 'tab': this.tab = v; this.playback = null; this.renderUI(true); return;
      case 'cam': this.select(v); if (this.mode === 'desk' && !this.fullscreen) this.fullscreen = true; return;
      case 'ir': this.irMode = this.irMode === 'auto' ? 'on' : this.irMode === 'on' ? 'off' : 'auto'; this.renderUI(true); return;
      case 'zoomin': this.zoom = Math.min(4, this.zoom * 1.25); return;
      case 'zoomout': this.zoom = Math.max(1, this.zoom * 0.8); return;
      case 'center': this.pans.delete(this.selId); this.zoom = 1; return;
      case 'room': this.fullscreen = false; this.renderUI(true); return;
      case 'screens': if (this.powered('security')) { this.fullscreen = true; this.renderUI(true); } return;
      case 'leave': this.exitMode(); return;
      case 'map': g.ui.toggleMap?.(); return;
      case 'phone': { const ph = g.devices.kind('desk_phone').find(d => d.opts?.security) || g.devices.kind('desk_phone')[0]; if (ph) g.phone.open(ph); return; }
    }
    if (ro) return;
    if (this.mode === 'desk' && !this.powered('security')) { g.toast('La console n\'est plus alimentée.'); return; }
    switch (a) {
      case 'rec': this.toggleRec(); return;
      case 'light': this.toggleViewLight(); return;
      case 'door': g.sim.do('sec_door', { closed: !g.power.state.doorClosed }); return;
      case 'hatch': g.sim.do('sec_hatch', { closed: !g.power.state.hatchClosed }); return;
      case 'lz': { const zones = v.split(','); const on = !zones.some(z => g.lighting.isLit(z) || g.power.state.lit[z]); g.sim.do('sec_light', { zones, on }); setTimeout(() => this.renderUI(true), 150); return; }
      case 'shutter': { const ctl = this.world.shops[v]; if (!ctl?.shutter) return; if (ctl.shutter.state.locked && ctl.shutter.state.target === 1) { g.toast('Rideau verrouillé : ce magasin n\'est pas sous votre responsabilité.'); return; } g.sim.do('sec_shutter', { shop: v, close: ctl.shutter.state.target !== 1 }); setTimeout(() => this.renderUI(true), 150); return; }
      case 'alarm': g.sim.do('shop_alarm', { shop: v, on: !g.power.state.alarms[v] }); setTimeout(() => this.renderUI(true), 150); return;
      case 'entrance': g.sim.do('sec_entrance', { open: !g.power.state.mainEntrance }); setTimeout(() => this.renderUI(true), 150); return;
      case 'escal': g.sim.do('sec_escalators', { on: !g.power.state.escalators }); setTimeout(() => this.renderUI(true), 150); return;
      case 'fountain': g.sim.do('sec_fountain', { on: !g.power.state.fountain }); setTimeout(() => this.renderUI(true), 150); return;
      case 'pa': this.announce(); return;
      case 'sensor': { const pr = g.props.get(v); if (pr) g.sim.do('propdata', { id: v, data: { armed: !pr.data.armed } }); setTimeout(() => this.renderUI(true), 150); return; }
      case 'sensorcam': { const pr = g.props.get(v); if (!pr) return; const sp = new THREE.Vector3(...pr.state.pos); let best = null, bd = 1e9; for (const c of this.list()) { if (c.kind === 'player') continue; const t = this.camTransform(c); const d = t.pos.distanceTo(sp); if (d < bd && this.sees(c, sp.clone().add(new THREE.Vector3(0, 0.3, 0)), 30)) { bd = d; best = c; } } if (best) { this.tab = 'cams'; this.select(best.id); } else g.toast('Aucune caméra ne voit ce détecteur.'); return; }
      case 'rc': this.driveRC(v); return;
      case 'pb': this.startPlayback(v || this.selId); return;
      case 'pbplay': if (this.playback) { this.playback.playing = !this.playback.playing; this.renderUI(true); } return;
      case 'pbstep': this.pbStep(+v); return;
      case 'pbjump': if (this.playback) { this.playback.i = +v; this.playback.playing = false; this.showFrame(); this.renderUI(true); } return;
      case 'pbclose': this.playback = null; this.renderUI(true); return;
      case 'erase': if (confirm('Effacer l\'enregistrement de cette caméra pour la nuit ? (Un trou dans la bande, ça se remarque…)')) { g.sim.do('rec_erase', { cam: v }); this.playback = null; this.renderUI(true); } return;
    }
  }
  announce() {
    const g = this.game;
    if (!this.feature('pa')) { g.toast('Le micro d\'annonces n\'est pas encore relié au poste.'); return; }
    const box = document.createElement('div'); box.className = 'nb-chatinput';
    box.innerHTML = '<span>📢 Annonce</span><input maxlength="160" placeholder="Votre annonce… (Entrée pour diffuser, Échap pour annuler)">';
    const inp = box.querySelector('input'); g.ui.root.appendChild(box); g.input.textMode = true; inp.focus();
    const close = () => { box.remove(); g.input.textMode = false; };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const t = inp.value.trim(); if (t) g.sim.do('pa', { chime: true, text: t }); close(); } if (e.key === 'Escape') close(); });
  }
  startPlayback(camId) {
    const fr = this.framesOf(camId);
    if (!fr.length) { this.game.toast('Aucun enregistrement pour cette caméra (le bouton REC était-il allumé ?).'); return; }
    this.playback = { cam: camId, frames: fr, i: Math.max(0, fr.length - 40), playing: true, acc: 0 };
    this.showFrame(); this.renderUI(true);
  }
  pbStep(d) { const P = this.playback; if (!P) return; P.i = Math.max(0, Math.min(P.frames.length - 1, P.i + d)); P.playing = false; this.showFrame(); this.renderUI(true); }
  showFrame() { const P = this.playback; if (!P || !this.ui) return; const f = P.frames[P.i]; if (f) this.ui.img.src = f.url; const r = this.ui.pb.querySelector('.pbrange'); if (r) r.value = P.i; const tl = this.ui.pb.querySelector('.pbt'); if (tl && f) tl.textContent = hhmmss(f.t) + (f.motion ? ' · mouvement' : ''); }

  renderUI(force) {
    const g = this.game; const U = this.ui; if (!U) return;
    if (!this.mode && !this.rcLocal) { this.hideUI(); return; }
    U.root.style.display = 'block';
    const room = this.mode === 'desk' && !this.fullscreen;
    const rcOnly = !!this.rcLocal && (!this.mode || this.mode === 'rc');
    U.root.classList.toggle('roomview', room); U.root.classList.toggle('tablet', this.mode === 'tablet'); U.root.classList.toggle('rcview', !!this.rcLocal);
    U.frame.style.display = this.mode === 'tablet' ? 'block' : 'none';
    U.img.style.display = this.playback ? 'block' : 'none';
    for (const k of ['side', 'tabs', 'bottom', 'log', 'top']) U[k].style.display = room || rcOnly ? 'none' : '';
    U.room.style.display = room ? 'block' : 'none';
    if (room) { U.room.innerHTML = `<b>Poste de sécurité</b> — bougez la souris pour regarder autour de vous · <b>clic</b> sur un écran ou un objet du bureau · <b>Espace</b> : relever les écrans · <b>Échap</b> : se lever`; U.panel.style.display = 'none'; U.pb.style.display = 'none'; U.hint.style.display = 'none'; return; }
    if (this.rcLocal) { U.hint.style.display = 'block'; U.hint.innerHTML = this.rcLocal.cam ? '🚗 Caméra embarquée — ZQSD/flèches : piloter · Espace : klaxon · Échap : arrêter' : '🚗 Télécommande — ZQSD/flèches : piloter · Espace : klaxon · Échap : arrêter'; U.panel.style.display = 'none'; U.pb.style.display = 'none'; if (rcOnly) return; }
    const L = this.list(); const sel = this.selected();
    // onglets
    const tabs = [['cams', 'Caméras']];
    if (this.mode === 'desk') tabs.push(['console', 'Console']);
    if (this.mode !== 'spectate') { tabs.push(['rec', 'Enregistrements']); if (this.feature('sensors')) tabs.push(['sensors', 'Détecteurs']); if (this.feature('rc')) tabs.push(['rc', 'RC']); }
    if (!tabs.some(t => t[0] === this.tab)) this.tab = 'cams';
    U.tabs.innerHTML = tabs.map(([k, n]) => `<button data-a="tab" data-v="${k}" class="${this.tab === k ? 'sel' : ''}">${n}</button>`).join('');
    // liste latérale
    U.side.innerHTML = (L.length ? L.map((c, i) => `<button data-a="cam" data-v="${esc(c.id)}" class="${c.id === this.selId ? 'sel' : ''}">${i < 9 ? (i + 1) + ' · ' : ''}${esc(c.short || '')} ${esc(c.name)}${this.motionRecent(c) ? '<span class="r">●</span>' : ''}${this.S.blocked[c.id] ? '<span class="r">✖</span>' : ''}</button>`).join('') : '<div style="padding:6px;opacity:.7">Aucune caméra reliée.</div>');
    // barre du bas
    const P = g.power.state; const b = [];
    if (this.mode === 'desk') {
      b.push(`<button data-a="room">⬇ Baisser les écrans</button>`);
      if (this.feature('recorder')) b.push(`<button data-a="rec" class="${this.S.rec ? 'on' : ''}">● REC ${this.S.rec ? 'ON' : 'OFF'}</button>`);
      if (this.feature('door')) b.push(`<button data-a="door" class="${P.doorClosed ? 'on' : ''}">PORTE ${P.doorClosed ? 'FERMÉE' : 'OUVERTE'}</button>`);
      if (this.feature('hatch')) b.push(`<button data-a="hatch" class="${P.hatchClosed ? 'on' : ''}">TRAPPE ${P.hatchClosed ? 'FERMÉE' : 'OUVERTE'}</button>`);
      if (this.feature('lights')) b.push(`<button data-a="light">💡 Lumière (L)</button>`);
      b.push(`<button data-a="phone">☎ Téléphone</button>`);
    }
    b.push(`<button data-a="ir" class="${this.irMode === 'on' ? 'lit' : ''}">IR : ${this.irMode === 'auto' ? 'AUTO' : this.irMode === 'on' ? 'FORCÉ' : 'COUPÉ'}</button>`, `<button data-a="zoomin">＋</button>`, `<button data-a="zoomout">－</button>`, `<button data-a="center">⟲</button>`);
    if (this.mode !== 'desk') b.push(`<button data-a="leave">${this.mode === 'spectate' ? 'Spectateur' : 'Quitter (Échap)'}</button>`);
    U.bottom.innerHTML = b.join('');
    // panneau central
    U.panel.style.display = 'none'; U.pb.style.display = 'none';
    if (this.tab === 'console' && this.mode === 'desk') { U.panel.style.display = 'block'; U.panel.innerHTML = this.consoleHTML(); }
    if (this.tab === 'rec') { U.panel.style.display = this.playback ? 'none' : 'block'; if (!this.playback) U.panel.innerHTML = this.recHTML(); else this.pbHTML(); }
    if (this.tab === 'sensors') { U.panel.style.display = 'block'; U.panel.innerHTML = this.sensorsHTML(); }
    if (this.tab === 'rc') { U.panel.style.display = 'block'; U.panel.innerHTML = this.rcHTML(); }
    U.hint.style.display = this.rcLocal ? 'block' : (this.tab === 'cams' && !this.playback ? 'block' : 'none');
    if (!this.rcLocal) U.hint.innerHTML = '←/→ ou 1-9 : caméra · Espace : infrarouge · glisser : orienter · molette : zoom' + (this.mode === 'desk' ? ' · L : lumière · R : REC · Tab : la pièce' : '') + ' · Échap : ' + (this.mode === 'desk' ? 'retour' : 'quitter');
    this.updateTop(true);
  }
  updateTop(force) {
    const g = this.game; const U = this.ui; if (!U) return;
    const c = this.rcLocal?.cam ? { short: 'RC', name: 'Voiture RC' } : this.selected();
    const pbf = this.playback ? this.playback.frames[this.playback.i] : null;
    U.tl.innerHTML = this.playback ? `▶ LECTURE — ${esc(pbf?.name || '')}` : c ? `${esc(c.short || '')} — ${esc(c.name)}${this.zoom > 1.01 ? ' · x' + this.zoom.toFixed(1) : ''}` : 'AUCUNE CAMÉRA';
    const ir = c && !this.playback && this.irMode !== 'off' && (this.irMode === 'on' || (c.kind ? this.camZoneDark(c, this.camTransform(c)) : false));
    U.tr.innerHTML = `${ir ? 'IR · ' : ''}14/11 ${hhmmss(pbf ? pbf.t : g.env.minutes)} ${this.S.rec ? '<span class="rec">● REC</span>' : ''}`;
    U.log.innerHTML = this.log.slice(-6).map(l => `<div class="${l.kind}">${hhmmss(l.t).slice(0, 5)} ${esc(l.text)}</div>`).join('');
  }
  consoleHTML() {
    const g = this.game; const P = g.power.state; const W = this.world; const h = [];
    const btn = (a, v, label, cls = '', dis = false) => `<button data-a="${a}" data-v="${esc(v)}" class="${cls}" ${dis ? 'disabled' : ''}>${label}</button>`;
    // énergie
    const pw = P.mains ? 'Secteur : normal' : P.gen.running && P.gen.fuel > 0 ? `Groupe électrogène (${Math.round(P.gen.fuel)} %)` : 'COUPURE — aucune alimentation';
    const cut = Object.keys(CIRCUITS).filter(c => !g.power.isOn(c));
    h.push(`<h3>Énergie</h3><div>${pw}${cut.length ? ' · <span style="color:#ff8080">circuits coupés : ' + cut.map(c => CIRCUITS[c]).join(', ') + '</span>' : ''}</div>`);
    // poste
    const poste = [];
    if (this.feature('door')) poste.push(btn('door', '', 'Porte blindée : ' + (P.doorClosed ? 'FERMÉE' : 'ouverte'), P.doorClosed ? 'on' : ''));
    if (this.feature('hatch')) poste.push(btn('hatch', '', 'Trappe d\'aération : ' + (P.hatchClosed ? 'FERMÉE' : 'ouverte'), P.hatchClosed ? 'on' : ''));
    if (this.feature('lights')) poste.push(btn('lz', 'security', 'Éclairage du poste', g.power.state.lit.security ? 'lit' : ''));
    if (this.feature('recorder')) poste.push(btn('rec', '', 'Enregistreur : ' + (this.S.rec ? 'REC' : 'arrêt'), this.S.rec ? 'on' : ''));
    if (this.feature('pa')) poste.push(btn('pa', '', '📢 Annonce au micro'));
    poste.push(btn('phone', '', '☎ Téléphone'));
    h.push(`<h3>Poste</h3><div class="grid">${poste.join('')}</div>`);
    if (this.feature('lights')) {
      // éclairage des zones communes
      const ar = [];
      for (const a of AREAS) {
        if (a.id === 'security' || a.id === 'vents' || !g.isAreaUnlocked(a.id)) continue;
        const zones = W.zones.filter(z => z.area === a.id && !z.shop && z.type !== 'vent' && z.circuit).map(z => z.id);
        if (!zones.length) continue;
        const lit = zones.some(z => P.lit[z]);
        ar.push(btn('lz', zones.join(','), '💡 ' + a.name, lit ? 'lit' : ''));
      }
      h.push(`<h3>Éclairage — zones</h3><div class="grid">${ar.join('')}</div>`);
      const sh = [], ru = [];
      for (const s of SHOPS) {
        if (!g.isShopUnlocked(s.id) || !W.shops[s.id]) continue;
        const zones = this.shopZones(s.id); const lit = zones.some(z => P.lit[z]);
        sh.push(btn('lz', zones.join(','), '💡 ' + s.name, lit ? 'lit' : ''));
        const ctl = W.shops[s.id];
        if (ctl.shutter) { const closed = ctl.shutter.state.target === 1; ru.push(btn('shutter', s.id, (closed ? '▮ ' : '▯ ') + s.name + (closed ? ' — fermé' : ' — ouvert'), closed ? '' : 'lit')); }
      }
      h.push(`<h3>Éclairage — magasins</h3><div class="grid">${sh.join('')}</div>`);
      h.push(`<h3>Rideaux métalliques</h3><div class="grid">${ru.join('')}</div>`);
    }
    if (this.feature('alarms')) {
      const al = [];
      for (const s of SHOPS) { if (!g.isShopUnlocked(s.id) || !W.shops[s.id]) continue; const on = !!P.alarms[s.id]; al.push(btn('alarm', s.id, (on ? '🔔 ' : '🔕 ') + s.name, on ? 'on' : '')); }
      h.push(`<h3>Alarmes des magasins</h3><div class="grid">${al.join('')}</div>`);
    }
    const bt = [btn('entrance', '', 'Portes d\'entrée : ' + (P.mainEntrance ? 'DÉVERROUILLÉES' : 'verrouillées'), P.mainEntrance ? 'lit' : '')];
    bt.push(btn('escal', '', 'Escalators : ' + (P.escalators ? 'en marche' : 'arrêtés'), P.escalators ? 'lit' : ''));
    bt.push(btn('fountain', '', 'Fontaine : ' + (P.fountain ? 'en marche' : 'arrêtée'), P.fountain ? 'lit' : ''));
    h.push(`<h3>Bâtiment</h3><div class="grid">${bt.join('')}</div>`);
    return h.join('');
  }
  recHTML() {
    const g = this.game; const L = this.list().filter(c => c.kind === 'fixed' || c.kind === 'portable');
    if (!this.feature('recorder')) return '<h3>Enregistreur</h3><div>Pas encore branché. Gérard : « on te le branchera demain ».</div>';
    const rows = L.map(c => { const fr = this.framesOf(c.id); const mot = fr.filter(f => f.motion); return `<div style="display:flex;gap:6px;align-items:center;margin:3px 0"><button data-a="pb" data-v="${esc(c.id)}" ${fr.length ? '' : 'disabled'}>▶ ${esc(c.short)} ${esc(c.name)}</button><span style="opacity:.75">${fr.length} image(s)${mot.length ? ' · <span style="color:#ffd040">' + mot.length + ' mouvement(s)</span>' : ''}${this.S.erased[c.id] ? ' · <span style="color:#ff8080">effacé</span>' : ''}</span></div>`; }).join('');
    return `<h3>Enregistreur — ${this.S.rec ? '<span style="color:#ff6b6b">● enregistrement en cours</span>' : 'à l\'arrêt'}</h3><div style="opacity:.8;margin-bottom:6px">Bande de la nuit : ${this.frames.length} image(s). Les images sont prises toutes les quelques secondes, plus souvent quand il y a du mouvement.</div>${rows || '<div>Aucune caméra.</div>'}`;
  }
  pbHTML() {
    const U = this.ui; const P = this.playback; U.pb.style.display = 'flex';
    const mot = P.frames.map((f, i) => f.motion ? i : -1).filter(i => i >= 0).slice(-8);
    U.pb.innerHTML = `<button data-a="pbstep" data-v="-1">⏮</button><button data-a="pbplay">${P.playing ? '⏸' : '▶'}</button><button data-a="pbstep" data-v="1">⏭</button><input class="pbrange" type="range" min="0" max="${P.frames.length - 1}" value="${P.i}"><span class="pbt"></span>${mot.map(i => `<button data-a="pbjump" data-v="${i}" title="mouvement">${hhmmss(P.frames[i].t).slice(0, 5)}</button>`).join('')}<button data-a="erase" data-v="${esc(P.cam)}" class="danger">Effacer</button><button data-a="pbclose">✕</button>`;
    this.showFrame();
  }
  sensorsHTML() {
    const g = this.game; const S = this.sensors();
    if (!S.length) return '<h3>Détecteurs de mouvement</h3><div>Aucun détecteur posé. Prenez-en un sur le bureau et posez-le (clic gauche) là où vous voulez être prévenu.</div>';
    return '<h3>Détecteurs de mouvement</h3>' + S.map((s, i) => { const sp = s.state.pos; const z = g.world.zoneAt(sp[0], sp[1] + 0.3, sp[2]); const last = this.sensorLast.get(s.id); const ago = last !== undefined ? Math.round(g.time - last) : null; return `<div style="display:flex;gap:6px;align-items:center;margin:3px 0"><button data-a="sensor" data-v="${s.id}" class="${s.data.armed ? 'on' : ''}">${s.data.armed ? 'ARMÉ' : 'désarmé'}</button><span>Détecteur ${i + 1} — ${esc(z?.name || '?')}${ago !== null ? ' · <span style="color:#ffd040">déclenché il y a ' + ago + ' s</span>' : ''}</span><button data-a="sensorcam" data-v="${s.id}">📷 voir</button></div>`; }).join('');
  }
  rcHTML() {
    const g = this.game; const cars = g.props.find('rc_car').filter(p => p.state.where === 'world');
    if (!cars.length) return '<h3>Voiture radiocommandée</h3><div>Aucune voiture posée. Posez-la au sol (clic gauche en la tenant).</div>';
    return '<h3>Voiture radiocommandée</h3>' + cars.map(c => { const sp = c.state.pos; const z = g.world.zoneAt(sp[0], sp[1] + 0.3, sp[2]); return `<div style="margin:4px 0"><button data-a="rc" data-v="${c.id}" ${c.data.camMounted ? '' : 'disabled'}>🚗 Piloter</button> ${esc(z?.name || '?')} ${c.data.camMounted ? '· caméra embarquée' : '· <span style="color:#ff8080">pas de caméra fixée</span> (tenez une caméra portative et appuyez sur R en visant la voiture)'}${this.S.rc?.car === c.id ? ' · <b>en cours de pilotage</b>' : ''}</div>`; }).join('');
  }
  addLog(text, kind = '') { this.log.push({ t: this.game.env?.minutes || 0, text, kind }); if (this.log.length > 40) this.log.shift(); if (this.ui && this.mode) this.updateTop(); }

  // vue « pièce » depuis la chaise : clic sur un écran ou un objet du bureau
  roomClick(e) {
    const g = this.game; const cam = g.camera;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, cam);
    const d = rc.ray.direction; const o = cam.position;
    // écrans
    let best = null, bt = 4;
    for (const m of this.monitors) { const hit = rc.intersectObject(m.mesh, false)[0]; if (hit && hit.distance < bt) { bt = hit.distance; best = m; } }
    if (best) { if (best.cam) { this.selId = best.cam.id; this.fullscreen = this.powered('security'); this.zoom = 1; g.sfx('camera_switch', null, { volume: 0.4, bus: 'ui' }); this.renderUI(true); } return; }
    const hit = g.world.pick.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 3.2, LAYER.ALL);
    const obj = hit?.box?.data;
    if (obj && obj !== this.wall && obj.prompt && obj.prompt(g.player)) {
      if (obj.local && obj.local('use', g.player)) return;
      g.sim.do('interact', { id: obj.id, verb: 'use', held: g.player.heldProp?.id || null });
    }
  }

  // ───────────────────────── boucle ─────────────────────────
  update(dt) {
    const g = this.game; const p = g.player;
    if (this.glitchT > 0) this.glitchT -= dt;
    if ((this.mode || this.rcLocal) && !g.ui.modal && !g.input.textMode && g.input.captureHandler !== this._cap) g.input.captureHandler = this._cap;
    // caméra du joueur assis au poste (vue « pièce »)
    if (this.mode === 'desk') {
      if (!p.alive) { this.exitMode(); return; }
      const st = this.seat || DESK_SEAT; p.body.pos = [st.x, st.y, st.z];
      const mx = this.mouseXY ? this.mouseXY[0] / window.innerWidth : 0.5, my = this.mouseXY ? this.mouseXY[1] / window.innerHeight : 0.5;
      const ty = this.fullscreen ? 0 : (0.5 - mx) * 2.4, tp = this.fullscreen ? -0.05 : (0.5 - my) * 0.9 - 0.02;
      this.deskLook.yaw += (ty - this.deskLook.yaw) * Math.min(1, dt * 5); this.deskLook.pitch += (tp - this.deskLook.pitch) * Math.min(1, dt * 5);
      p.yaw = Math.PI / 2 + this.deskLook.yaw; p.pitch = this.deskLook.pitch;
      g.camera.position.set(st.x, st.y + 1.22, st.z); g.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    }
    if (this.mode === 'tablet' && (!p.alive || !p.hasItem('tablet'))) this.exitMode();
    if (this.mode === 'spectate' && p.alive) this.exitMode();
    if (Net.isHost) { this.updateSensorsHost(dt); this.updateRCHost(dt); }
    if (this.rcLocal) this.updateLocalRC(dt);
    this.updateMotion(dt);
    // son du moteur de la voiture
    if (this.rcLoop) { const rp = this.rcPos(); if (rp) { this.rcLoop.setPos(rp); const sp = this.rcLast ? rp.distanceTo(this.rcLast) / Math.max(dt, 1e-3) : 0; this.rcLast = rp; this.rcLoop.setVolume(0.25 + Math.min(1, sp / 5) * 0.75); } }
    // lecture d'enregistrement
    if (this.playback?.playing) { this.playback.acc += dt; if (this.playback.acc > 0.35) { this.playback.acc = 0; if (this.playback.i < this.playback.frames.length - 1) { this.playback.i++; this.showFrame(); } else { this.playback.playing = false; this.renderUI(true); } } }
    // voyants des caméras (clignotent pendant l'enregistrement)
    const on = this.S.rec && this.powered('cameras');
    this.ledMat.color.setHex(on ? ((g.time % 1.2) < 0.6 ? 0xff1a1a : 0x400000) : 0x220000);
    // trappe blindée
    const ht = g.power.state.hatchClosed ? 1 : 0; this.hatchT += (ht - this.hatchT) * Math.min(1, dt * 2.5);
    this.hatch.position.z = 1.05 - this.hatchT * 1.05;
    if (this._hatchPrev !== undefined && this._hatchPrev !== ht) g.sfx(ht ? 'hatch_close' : 'hatch_open', new THREE.Vector3(-69, 3.2, 0), { volume: 0.8 });
    this._hatchPrev = ht;
    // barrières d'accès à l'étage + escalators
    this._bT = (this._bT || 0) + dt;
    if (this._bT > 0.5) { this._bT = 0; this.updateBarriers(); this.updateEscalatorSound(); }
    // interface
    this.uiT += dt;
    if ((this.mode || this.rcLocal) && this.ui) { if (this.uiT > 0.25) { this.uiT = 0; this.updateTop(); if (this.tab !== 'console' || !this._consoleHover) this.refreshDynamic(); } }
  }
  refreshDynamic() {
    // rafraîchit la liste (mouvements) et l'onglet courant sans reconstruire si rien n'a changé
    const key = this.list().map(c => c.id + (this.motionRecent(c) ? '*' : '') + (this.S.blocked[c.id] ? 'x' : '')).join('|') + this.tab + JSON.stringify([this.game.power.state.doorClosed, this.game.power.state.hatchClosed, this.S.rec, this.irMode, this.selId, !!this.playback, this.playback?.playing, this.fullscreen, this.sensors().map(s => s.data.armed + ':' + (this.sensorLast.get(s.id) | 0)).join(), this.game.power.state.mains, this.game.power.state.gen.running]);
    if (key !== this._dynKey) { this._dynKey = key; const sc = this.ui.panel.scrollTop; this.renderUI(true); this.ui.panel.scrollTop = sc; }
  }
  updateBarriers() {
    const g = this.game; const open = g.isAreaUnlocked('gallery1');
    if (open === this.barrierOpen) return; this.barrierOpen = open;
    for (const b of this.barriers) { b.grp.visible = !open; b.box.enabled = !open; }
  }
  updateEscalatorSound() {
    const g = this.game; const on = g.power.state.escalators && g.power.isOn('gallery');
    if (on && !this.escLoops.length) for (const x of [-19.5, 19.5]) this.escLoops.push(g.loop('escalator', new THREE.Vector3(x, 2.5, 0), { volume: 0.3, ref: 3, maxDist: 30 }));
    if (!on && this.escLoops.length) { for (const l of this.escLoops) l.stop(0.8); this.escLoops = []; }
  }
  // Appelé par le joueur local : les escalators en marche entraînent le joueur
  escalatorPush(p, dt) {
    const g = this.game; if (!g.power.state.escalators || !g.power.isOn('gallery')) return;
    const b = p.body; const x = b.pos[0], y = b.pos[1], z = b.pos[2];
    if (y < -0.1 || y > 5.3) return;
    for (const [xb, xt, z0, z1, dir] of ESCALATOR_LANES) {
      const lo = Math.min(xb, xt) - 0.6, hi = Math.max(xb, xt) + 0.6;
      if (x < lo || x > hi || z < z0 || z > z1) continue;
      const s = Math.sign(xt - xb) * dir; b.pos[0] += s * 0.55 * dt; return;
    }
  }

  // Inscriptions invisibles, révélées par le cône d'une lampe UV
  refreshUV() {
    const g = this.game;
    for (const w of g.world.uvWritings || []) {
      const key = w.text + '|' + w.pos.x.toFixed(2) + '|' + w.pos.y.toFixed(2) + '|' + w.pos.z.toFixed(2);
      if (this.uvMeshes.has(key)) continue;
      const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
      let fs = 64; const fam = '"Comic Sans MS", "Segoe Print", cursive';
      do { x.font = 'bold ' + fs + 'px ' + fam; fs -= 4; } while (fs > 20 && x.measureText(w.text).width > 470);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = '#fff'; x.shadowColor = '#fff'; x.shadowBlur = 6; x.fillText(w.text, 256, 60);
      // coulures
      for (let i = 0; i < 14; i++) { const px = 60 + Math.random() * 392; x.fillRect(px, 70 + Math.random() * 10, 2 + Math.random() * 2, 10 + Math.random() * 40); }
      const tex = new THREE.CanvasTexture(c);
      const U = GLOBAL_UNIFORMS;
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { map: { value: tex }, uvPos: U.uvPos, uvDir: U.uvDir, uvCos: U.uvCos, uvOn: U.uvOn },
        vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: 'uniform sampler2D map; uniform vec3 uvPos, uvDir; uniform float uvCos, uvOn; varying vec2 vUv; varying vec3 vW; void main(){ float t = texture2D(map, vUv).a; vec3 d = vW - uvPos; float dist = length(d); float c = dot(d / max(dist, 0.001), uvDir); float cone = smoothstep(uvCos, mix(uvCos, 1.0, 0.4), c); float fall = clamp(1.0 - dist / 9.0, 0.0, 1.0); float a = t * cone * fall * uvOn; gl_FragColor = vec4(vec3(0.7, 0.45, 1.0) * 2.4 * a, a); }',
      });
      const len = Math.max(1.2, w.text.length * 0.16);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, len / 4), mat);
      m.position.copy(w.pos); m.rotation.y = w.ry || 0; m.renderOrder = 6; m.frustumCulled = true;
      // recale l'inscription à 1,5 cm de la surface du mur (les coordonnées peuvent tomber dans l'épaisseur)
      const nrm = new THREE.Vector3(Math.sin(w.ry || 0), 0, Math.cos(w.ry || 0));
      for (const back of [0.6, 1.2]) {
        const st = w.pos.clone().addScaledVector(nrm, back);
        const hit = g.world.physics.raycast(st.x, st.y, st.z, -nrm.x, 0, -nrm.z, back + 0.8, LAYER.WALL | LAYER.FURN | LAYER.DOOR);
        if (hit && hit.t > 0.02) { m.position.copy(st).addScaledVector(nrm, -hit.t + 0.015); break; }
      }
      (w.zone && g.world.zone(w.zone)?.group || g.world.root).add(m);
      this.uvMeshes.set(key, m);
    }
  }

  // Événement : parasites sur les caméras (hôte → tout le monde)
  glitch(dur = 3, figure = false) { if (Net.isHost) this.game.sim.emit('secglitch', { dur, figure: !!figure }); else { this.glitchT = dur; this.glitchFigure = !!figure; } }

  reset() {
    const g = this.game;
    if (this.mode === 'desk' || this.mode === 'tablet' || this.mode === 'rc') { this.mode = null; this.fullscreen = false; const p = g.player; if (p.mode === 'desk' || p.mode === 'screen') p.mode = 'walk'; if (g.input.captureHandler === this._cap) g.input.captureHandler = null; g.input.wantLock = true; }
    if (this.mode === 'spectate') { this.mode = null; this.fullscreen = false; if (g.input.captureHandler === this._cap) g.input.captureHandler = null; g.input.wantLock = true; }
    this.rcLocal = null; this.rcBody = null; this.playback = null; this.glitchT = 0;
    if (this.rcLoop) { this.rcLoop.stop(0.2); this.rcLoop = null; }
    this.frames = []; this.lastCap.clear(); this.motion.clear(); this.sensorCD.clear(); this.sensorLast.clear(); this.log = [];
    this.listT = -1; this.selId = null; this.zoom = 1; this.irMode = 'auto';
    this.hideUI();
  }
}
