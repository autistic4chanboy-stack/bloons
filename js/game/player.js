// Joueur local : déplacement FPS (marche, course, accroupi, saut, escaliers), caméra (balancement, secousses),
// lampe torche (ombres portées, faisceau volumétrique, piles), inventaire, objet en main (viewmodel),
// statistiques (santé, endurance, stress), états (assis, caché, conduit, bureau, mort), bruits de pas.
import * as THREE from 'three';
import { Net } from '../net/net.js';
import { ITEMS } from '../data/items.js';
import { FLASHLIGHTS, COSTUMES } from '../data/costumes.js';
import { buildItemGeometry } from '../world/meshes.js';
import { FLOORS } from '../world/shopbuilder.js';
import { GLOBAL_UNIFORMS } from '../engine/materials.js';
import { buildHumanoid, animateHumanoid, setHumanoidLayer, litHumanoid } from './humanoid.js';
import { useHeld } from './behaviors.js';
import { Audio } from '../engine/audio.js';

const FLASH_ITEMS = ['flashlight_tac', 'flashlight', 'headlamp', 'flashlight_uv', 'flashlight_spare', 'mobile_phone', 'smartphone'];
const SLOT_COUNT = 10;

export class Inventory {
  constructor(p) { this.p = p; this.slots = new Array(SLOT_COUNT).fill(null); this.sel = 0; this.version = 0; }
  get game() { return this.p.game; }
  prop(i) { const id = this.slots[i]; return id ? this.game.props.get(id) : null; }
  get held() { return this.prop(this.sel); }
  hasRoom() { return this.slots.includes(null); }
  ids() { return this.slots.filter(Boolean); }
  defs() { return this.ids().map(id => this.game.props.get(id)?.defId).filter(Boolean); }
  findDef(defId) { for (const id of this.slots) { if (!id) continue; const pr = this.game.props.get(id); if (pr && pr.defId === defId) return id; } return null; }
  has(defId) { return !!this.findDef(defId); }
  onPropState(pr) {
    const mine = pr.state.where === 'held' && pr.state.owner === this.p.id && this.game.world.objects.has(pr.id);
    const idx = this.slots.indexOf(pr.id);
    if (mine && idx < 0) {
      let i = this.slots[this.sel] === null ? this.sel : this.slots.indexOf(null);
      if (i < 0) { // inventaire plein : on repose l'objet
        this.game.sim.do('drop', { id: pr.id, pos: this.p.dropPos(), vel: [0, 0, 0], quat: [0, 0, 0, 1] }); return;
      }
      this.slots[i] = pr.id; this.sel = i; this.version++;
      this.game.ui?.flashSlot(i);
    } else if (!mine && idx >= 0) { this.slots[idx] = null; this.version++; }
  }
  select(i) { if (i >= 0 && i < SLOT_COUNT) { this.sel = i; this.version++; this.game.sfx('cloth', null, { volume: 0.25, bus: 'ui' }); } }
  cycle(d) { this.select((this.sel + d + SLOT_COUNT) % SLOT_COUNT); }
  clear() { this.slots.fill(null); this.version++; }
}

export class Player {
  constructor(game, id) {
    this.game = game; this.id = id; this.name = game.playerName; this.alive = true; this.isLocal = true;
    this.costume = 'guard';
    this.body = { pos: [0, 0, 0], vel: [0, 0, 0], radius: 0.28, height: 1.75, stepHeight: 0.42, onGround: false };
    this.yaw = Math.PI / 2; this.pitch = 0; this.crouchT = 0; this.crouching = false;
    this.stats = { health: 100, stamina: 100, stress: 0 };
    this.effects = {};
    this.inv = new Inventory(this);
    this.flashOn = false; this.flashKind = 'none'; this.flashProp = null;
    this.mode = 'walk'; this.seat = null; this.hiddenIn = null; this.inVent = false;
    this.wear = { feet: null, head: null, face: null, body: null };
    this.posV = new THREE.Vector3();
    this.bob = 0; this.stepAcc = 0; this.shakeT = 0; this.shakeAmt = 0; this.landShake = 0;
    this.noiseLevel = 0; this.lastGroundY = 0; this.fallStartY = 0;
    this.throwCharge = 0; this.useCooldown = 0;
    this.cart = null; this.zoom = 1; this.lean = 0;
    const cam = game.camera; this.camera = cam;
    // lampe torche
    const sl = new THREE.SpotLight(0xfff1d6, 0, 26, 0.42, 0.45, 1.25); // atténuation adoucie : pas de sol brûlé à un mètre
    sl.castShadow = game.settings.shadows !== false;
    sl.shadow.mapSize.set(game.settings.quality === 'low' ? 512 : 1024, game.settings.quality === 'low' ? 512 : 1024);
    sl.shadow.camera.near = 0.15; sl.shadow.camera.far = 30; sl.shadow.bias = -0.0004; sl.shadow.normalBias = 0.03;
    game.scene.add(sl); game.scene.add(sl.target);
    this.spot = sl; this.flashDir = new THREE.Vector3(0, 0, -1); this.flashPos = new THREE.Vector3();
    // faisceau volumétrique
    const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true); coneGeo.translate(0, -0.5, 0); coneGeo.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(coneGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(1, 0.95, 0.85) }, strength: { value: 0 } },
      vertexShader: 'varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ vZ = -position.z; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 color; uniform float strength; varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ float a = pow(clamp(1.0 - vZ, 0.0, 1.0), 2.2); float rim = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(color * a * rim * strength, 1.0); }',
    }));
    this.beam.frustumCulled = false; this.beam.renderOrder = 5; game.scene.add(this.beam);
    // viewmodel (objet en main) + lampe en main gauche
    this.vm = new THREE.Group(); cam.add(this.vm);
    this.vmHeld = null; this.vmHeldId = null; this.vmFlash = null; this.vmAnim = { swing: 0, raise: 0, bobX: 0, bobY: 0 };
    this.hands = new THREE.Group(); cam.add(this.hands);
    this._buildHands();
    // avatar visible uniquement par les caméras de surveillance (calque 1)
    this.avatar = buildHumanoid({ shirt: 0x2b3a55, pants: 0x1f2a44, badge: true, hat: null }); litHumanoid(this.avatar);
    setHumanoidLayer(this.avatar, 1); game.scene.add(this.avatar);
    // sons continus
    this.heart = null; this.breath = null;
    this.spawn(game.world.points.securityDesk || new THREE.Vector3(), Math.PI / 2);
  }

  get pos() { return this.posV.set(this.body.pos[0], this.body.pos[1], this.body.pos[2]); }
  get eye() { return this.camera.position; }
  get heldProp() { return this.inv.held; }
  get heldDef() { return this.inv.held?.def || null; }
  hasItem(defId) { return this.inv.has(defId); }
  get isInVent() { return this.inVent; }
  get isInVentFlag() { return this.inVent; }
  get isHigh() { return true; }
  dropPos() { const f = this.forward(); return [this.camera.position.x + f.x * 0.6, this.camera.position.y - 0.3, this.camera.position.z + f.z * 0.6]; }
  forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); }

  spawn(pos, yaw = 0) {
    this.body.pos = [pos.x, pos.y + 0.02, pos.z]; this.body.vel = [0, 0, 0];
    this.yaw = yaw; this.pitch = 0; this.mode = 'walk'; this.inVent = false; this.hiddenIn = null; this.seat = null; this.cart = null;
    this.lastGroundY = pos.y; this.fallStartY = pos.y;
    this.updateCamera(0);
  }

  _buildHands() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xd8a888, roughness: 0.7 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.85 });
    this.handMats = { skin, sleeve };
    const mk = (side) => {
      const g = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.34), sleeve); arm.position.set(0, 0, 0.12); g.add(arm);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.1), skin); hand.position.set(0, 0.0, -0.08); g.add(hand);
      g.position.set(side * 0.23, -0.27, -0.42);
      g.traverse(o => { o.castShadow = false; o.frustumCulled = false; });
      this.hands.add(g); return g;
    };
    this.handL = mk(-1); this.handR = mk(1);
  }
  setCostume(c) {
    this.costume = c in COSTUMES ? c : 'guard';
    const co = COSTUMES[this.costume];
    this.handMats.sleeve.color.set(co.color);
    if (this.avatar) { this.game.scene.remove(this.avatar); }
    this.avatar = buildHumanoid(avatarOpts(this.costume, this.wear)); litHumanoid(this.avatar); setHumanoidLayer(this.avatar, 1); this.game.scene.add(this.avatar);
    Audio.setMuffle(c === 'astronaut' ? 0.55 : 0);
    this.game.hooks.emit('costume', this.id, c);
  }
  hasEffect(e) { return (this.effects[e] || 0) > 0; }
  hasCostumeEffect(e) { return (COSTUMES[this.costume]?.effects || []).includes(e); }
  applyEffect(name, dur) {
    const S = this.stats;
    if (name === 'calm') { S.stress = Math.max(0, S.stress - dur * 2); return; }
    if (name === 'energy') { this.effects.energy = Math.max(this.effects.energy || 0, 60); S.stamina = 100; return; }
    if (name === 'sick') { this.effects.sick = 20; S.health = Math.max(5, S.health - 5); return; }
    if (name === 'heal') { S.health = Math.min(100, S.health + dur); return; }
    this.effects[name] = Math.max(this.effects[name] || 0, dur);
  }
  shake(a = 0.3, t = 0.4) { this.shakeAmt = Math.max(this.shakeAmt, a); this.shakeT = Math.max(this.shakeT, t); }
  scare(amount) { this.stats.stress = Math.min(100, this.stats.stress + amount); if (amount > 15) this.shake(0.15, 0.3); }
  damage(n, cause) {
    if (!this.alive) return;
    if (this.wear.head === 'helmet' && cause === 'fall') n *= 0.7;
    this.stats.health -= n; this.game.ui?.damageFlash(Math.min(1, n / 30));
    this.game.sfx('hit_body', null, { volume: 0.6, bus: 'ui' });
    if (this.stats.health <= 0) this.kill(cause);
  }
  kill(cause, by) {
    if (!this.alive) return;
    this.alive = false; this.mode = 'dead'; this.stats.health = 0;
    this.flashOn = false;
    this.game.hooks.emit('player_dead', { id: this.id, cause, by });
    this.game.story?.onLocalDeath(cause, by);
  }
  revive() { this.alive = true; this.mode = 'walk'; this.stats.health = 100; this.stats.stress = 20; }

  // ── états ──
  sit(pos, yaw, spin = false) { if (this.mode !== 'walk') return; this.mode = 'sit'; this.seat = { pos: pos.clone(), yaw, spin }; this.yaw = yaw; this.body.vel = [0, 0, 0]; this.game.toast('Appuyez sur E ou bougez pour vous lever.', 2); }
  stand() { if (this.mode === 'sit') { this.mode = 'walk'; this.seat = null; } }
  setHidden(on, info) {
    if (on) { this.mode = 'hide'; this.hiddenIn = info; this.body.vel = [0, 0, 0]; this._preHide = [...this.body.pos]; if (info.pos) { this.body.pos = [info.pos[0], info.pos[1] ?? this.body.pos[1], info.pos[2]]; } if (info.ry !== undefined) this.yaw = info.ry + Math.PI; this.game.toast('Caché. E pour sortir.', 2); }
    else { this.mode = 'walk'; this.hiddenIn = null; if (this._preHide) this.body.pos = this._preHide; }
  }
  useGrate(grate, enter) {
    if (!grate) return;
    if (enter && !this.inVent) { const p = grate.o.inside; this.body.pos = [p.x, p.y, p.z]; this.inVent = true; this.crouching = true; this.crouchT = 1; this.game.sfx('vent_grate', p); this.game.toast('Dans les conduits : déplacez-vous accroupi. E sur une grille ouverte pour sortir.', 3); }
    else if (!enter && this.inVent) { const p = grate.o.outside; this.body.pos = [p.x, p.y + 0.05, p.z]; this.body.vel = [0, -1, 0]; this.inVent = false; this.game.sfx('land', p); }
  }
  meditate() { this.mode = 'sit'; this.seat = { pos: this.pos.clone().add(new THREE.Vector3(0, -0.4, 0)), yaw: this.yaw }; this.effects.meditate = 20; this.game.toast('Respirez… (le stress diminue)', 3); }
  grabCart(cart) { this.cart = this.cart ? null : cart; if (this.cart) this.game.toast('Vous poussez le caddie. E pour lâcher.', 2); }

  // ── mise à jour ──
  update(dt, realDt) {
    const g = this.game, inp = g.input;
    if (this.mode === 'desk' || this.mode === 'screen' || this.mode === 'spectate') { this.updateStats(dt); this.updateFlash(dt); this.updateAvatar(dt); return; }
    const look = inp.locked ? inp.consumeMouse() : { dx: 0, dy: 0 };
    const sens = 0.0022 / this.zoom;
    if (this.mode !== 'dead') {
      this.yaw -= look.dx * sens; this.pitch -= look.dy * sens;
      this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));
    }
    if (this.mode === 'dead') { this.updateCamera(dt); return; }
    // inventaire
    for (let i = 1; i <= 9; i++) if (inp.hit('Digit' + i)) this.inv.select(i - 1);
    if (inp.hit('Digit0')) this.inv.select(9);
    const wh = inp.consumeWheel(); if (wh && !g.ui.modal) this.inv.cycle(wh > 0 ? 1 : -1);
    if (inp.hit('KeyF')) this.toggleFlash();
    if (inp.hit('KeyG')) this.dropHeld(false);
    if (inp.hit('KeyN')) g.ui.showWatch();
    if (inp.hit('KeyM') && (this.hasItem('mall_guide') || g.settings.alwaysMap)) g.ui.toggleMap();
    // objet en main
    this.useCooldown -= dt;
    const held = this.heldProp;
    if (held && !g.ui.modal) {
      if (inp.click(0) && this.useCooldown <= 0) { useHeld(g, this, held, 'primary'); }
      if (inp.mouseDown(0)) useHeld(g, this, held, 'hold', dt);
      if (inp.mouseUp(0)) useHeld(g, this, held, 'release');
      if (inp.mouseDown(2)) { this.throwCharge = Math.min(1, this.throwCharge + dt * 1.4); useHeld(g, this, held, 'secondaryHold', dt); }
      if (inp.mouseUp(2)) { if (!useHeld(g, this, held, 'secondary')) this.throwHeld(this.throwCharge); this.throwCharge = 0; }
    } else this.throwCharge = 0;
    if (this.mode === 'sit') {
      const moved = inp.down('KeyW') || inp.down('KeyS') || inp.down('KeyA') || inp.down('KeyD');
      if (moved || (inp.hit('KeyE') && !g.interaction.target)) this.stand();
      if (this.seat?.spin) this.yaw += dt * 0.0;
    } else if (this.mode === 'hide') {
      // sortie gérée par l'interaction (E sur la cachette) ; échap de secours
      if (inp.hit('KeyE') && this.hiddenIn) g.sim.do('interact', { id: this.hiddenIn.obj, verb: 'use' });
    } else this.move(dt);
    this.updateStats(dt);
    this.updateFlash(dt);
    this.updateCamera(dt);
    this.updateViewmodel(dt);
    this.updateAvatar(dt);
    this.updateAudio(dt);
  }

  move(dt) {
    const g = this.game, inp = g.input, b = this.body;
    let fx = 0, fz = 0;
    if (inp.down('KeyW')) fz -= 1; if (inp.down('KeyS')) fz += 1; if (inp.down('KeyA')) fx -= 1; if (inp.down('KeyD')) fx += 1;
    if (g.ui.modal) { fx = fz = 0; }
    const wantCrouch = inp.down('ControlLeft') || inp.down('KeyC') || this.inVent;
    if (wantCrouch) this.crouching = true;
    else if (this.crouching) { if (g.world.physics.fits(b.pos[0], b.pos[1], b.pos[2], b.radius, 1.75)) this.crouching = false; }
    this.crouchT += ((this.crouching ? 1 : 0) - this.crouchT) * Math.min(1, dt * 10);
    b.height = this.crouching ? 0.92 : 1.75;
    const slow = this.wear.feet === 'slippers';
    const sprint = inp.down('ShiftLeft') && !this.crouching && !slow && fz < 0 && (this.stats.stamina > 5 || this.hasEffect('energy'));
    let speed = this.crouching ? (this.inVent ? 1.3 : 1.6) : sprint ? 5.6 : 3.1;
    if (this.hasEffect('sugar')) speed *= 1.25;
    if (this.hasEffect('sleepy')) speed *= 0.75;
    if (this.stats.health < 30) speed *= 0.8;
    if (this.cart) speed *= 0.85;
    const len = Math.hypot(fx, fz);
    let tx = 0, tz = 0;
    if (len > 0) {
      fx /= len; fz /= len;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      tx = (fx * c + fz * s) * speed; tz = (-fx * s + fz * c) * speed;
    }
    if (this.hasEffect('drunk')) { const t = g.time; tx += Math.sin(t * 1.3) * 0.6; tz += Math.cos(t * 1.1) * 0.6; }
    const accel = b.onGround ? (len > 0 ? 12 : 14) : 2.5;
    b.vel[0] += (tx - b.vel[0]) * Math.min(1, accel * dt);
    b.vel[2] += (tz - b.vel[2]) * Math.min(1, accel * dt);
    if (inp.hit('Space') && b.onGround && !this.crouching && !g.ui.modal) { b.vel[1] = 4.6; this.stats.stamina -= 4; }
    const wasGround = b.onGround; const vyBefore = b.vel[1];
    g.world.physics.moveCharacter(b, dt);
    // escalator en marche : entraînement
    g.security?.escalatorPush?.(this, dt);
    if (b.onGround) {
      if (!wasGround) {
        const fall = this.fallStartY - b.pos[1];
        if (vyBefore < -6.5) { this.landShake = Math.min(1, -vyBefore / 14); g.sfx('land', this.pos, { volume: Math.min(1, -vyBefore / 10) }); }
        if (vyBefore < -10.5 && fall > 3.5) this.damage((-vyBefore - 10) * 14, 'fall');
      }
      this.fallStartY = b.pos[1];
    } else if (b.vel[1] > 0) this.fallStartY = Math.max(this.fallStartY, b.pos[1]);
    if (b.pos[1] < -30) { this.spawn(g.world.points.securityDesk, Math.PI / 2); }
    // pas
    const hsp = Math.hypot(b.vel[0], b.vel[2]);
    if (b.onGround && hsp > 0.4) {
      this.bob += dt * hsp * 2.1;
      this.stepAcc += hsp * dt;
      const stride = sprint ? 0.95 : this.crouching ? 0.55 : 0.72;
      if (this.stepAcc > stride) { this.stepAcc = 0; this.footstep(sprint ? 1 : this.crouching ? 0.25 : 0.6); }
      this.stats.stamina -= sprint && !this.hasEffect('energy') ? dt * 11 : 0;
    } else { this.bob *= 0.9; }
    if (!sprint) this.stats.stamina = Math.min(100, this.stats.stamina + dt * (len > 0 ? 6 : 12));
    this.noiseLevel = b.onGround ? (hsp < 0.3 ? 0.02 : sprint ? 0.85 : this.crouching ? 0.12 : 0.38) * (this.shoeNoise()) : 0.1;
    // pièges (briques, clous, peaux de banane)
    g.traps?.check(this);
    // caddie
    if (this.cart) {
      const c = this.cart; const f = this.forward(); f.y = 0; f.normalize();
      const target = [b.pos[0] + f.x * 1.05, c.state.pos[1], b.pos[2] + f.z * 1.05];
      g.sim.do('cartmove', { id: c.id, pos: target, yaw: this.yaw });
      if (hsp > 0.5) { if (!this._cartLoop) this._cartLoop = g.loop('cart_roll', new THREE.Vector3(...target), { volume: 0.6 }); else this._cartLoop.setPos(new THREE.Vector3(...target)); }
      else if (this._cartLoop) { this._cartLoop.stop(0.3); this._cartLoop = null; }
      if (g.input.hit('KeyE') && !g.interaction.target) { this.cart = null; if (this._cartLoop) { this._cartLoop.stop(0.3); this._cartLoop = null; } }
    }
  }

  shoeNoise() { const s = this.wear.feet; return s === 'sneakers' ? 0.5 : s === 'heels' ? 2 : s === 'slippers' ? 0.3 : s === 'boots' ? 1.2 : 1; }

  surface() {
    const g = this.game; const p = this.body.pos;
    if (this.inVent) return 'step_vent';
    const z = g.world.zoneAt(p[0], p[1] + 0.3, p[2]);
    if (!z) return 'step_concrete';
    const gb = this.body.groundBox;
    if (gb && gb.layer === 2 && gb.max[1] - gb.min[1] < 0.6 && (z.type === 'atrium')) return 'step_metal';
    if (z.type === 'vent') return 'step_vent';
    if (z.id === 'security') return 'step_carpet';
    if (z.shop) {
      if (z.id.endsWith('_back')) return 'step_tile';
      const f = FLOORS[z.shop] || '';
      if (f.startsWith('carpet')) return 'step_carpet';
      if (f.startsWith('wood')) return 'step_wood';
      if (f.startsWith('concrete')) return 'step_concrete';
      return 'step_tile';
    }
    if (z.circuit === 'gallery' || z.id === 'entrance' || z.id === 'mezzanine' || z.type === 'toilets') return 'step_tile';
    if (z.type === 'roof' || z.type === 'outside') return 'step_concrete';
    return 'step_concrete';
  }
  footstep(vol) {
    const g = this.game; const sh = this.wear.feet;
    let name = this.surface();
    if (sh === 'heels' && name !== 'step_vent' && name !== 'step_carpet') name = 'step_heels';
    else if (sh === 'sneakers' && (name === 'step_tile' || name === 'step_wood')) name = 'step_sneakers';
    const v = vol * (sh === 'sneakers' ? 0.45 : sh === 'slippers' ? 0.25 : sh === 'heels' ? 1.3 : 1);
    g.sfx(name, new THREE.Vector3(this.body.pos[0], this.body.pos[1] + 0.05, this.body.pos[2]), { volume: v, occlude: false, bus: 'sfx' });
  }

  updateStats(dt) {
    const g = this.game, S = this.stats;
    for (const k in this.effects) { this.effects[k] -= dt; if (this.effects[k] <= 0) delete this.effects[k]; }
    if (this.effects.meditate) S.stress = Math.max(0, S.stress - dt * 4);
    // stress : obscurité, sécurité, présences
    const p = this.body.pos; const z = g.world.zoneAt(p[0], p[1] + 1, p[2]);
    const lit = z ? (z._level || 0) > 0.3 : false;
    let ds = 0;
    if (g.isDay) ds = -3;
    else if (z?.id === 'security' && lit) ds = -2.2;
    else if (lit || (this.flashOn && this.flashKind !== 'none')) ds = -0.25;
    else ds = 1.2;
    if (z?.type === 'vent') ds += 0.6;
    if (z?.id === 'b13') ds += 3;
    ds += (g.entities?.stressNear(this) || 0);
    S.stress = Math.max(0, Math.min(100, S.stress + ds * dt));
    if (S.health < 100 && S.health > 0) S.health = Math.min(100, S.health + dt * 0.4);
    if (this.mode === 'hide') S.stress = Math.max(0, S.stress - dt * 0.5);
  }

  // ── lampe torche ──
  bestFlash() {
    const held = this.heldProp;
    if (held && FLASH_ITEMS.includes(held.defId)) return held;
    for (const d of FLASH_ITEMS) { const id = this.inv.findDef(d); if (id) return this.game.props.get(id); }
    return null;
  }
  toggleFlash() {
    const fp = this.bestFlash();
    if (!fp) { if (this.hasItem('lighter') || this.hasItem('matches')) { this.flashOn = !this.flashOn; this.flashKind = 'lighter'; this.game.sfx('switch', null, { volume: 0.3, bus: 'ui' }); return; } this.game.toast('Vous n\'avez pas de lampe torche.'); return; }
    this.flashOn = !this.flashOn; this.flashProp = fp.id;
    const kind = fp.def.p?.kind || (fp.def.use === 'mobile' ? 'phone' : 'basic');
    this.flashKind = kind;
    this.game.sfx('flashlight_click', null, { volume: 0.5, bus: 'ui' });
  }
  batteryOf(pr) { return pr?.data?.battery ?? 1; }
  reloadBattery() {
    const fp = this.flashProp ? this.game.props.get(this.flashProp) : this.bestFlash(); if (!fp) return false;
    const bat = this.inv.findDef('battery') || this.inv.findDef('powerbank'); if (!bat) { this.game.toast('Pas de piles dans l\'inventaire.'); return false; }
    this.game.sim.do('consume', { id: bat });
    this.game.sim.do('propdata', { id: fp.id, data: { battery: 1 } });
    fp.state.data = { ...fp.data, battery: 1 };
    this.game.sfx('battery_insert', null, { volume: 0.7, bus: 'ui' }); this.game.toast('Piles changées.');
    return true;
  }
  updateFlash(dt) {
    const g = this.game; const sl = this.spot;
    let fp = this.flashProp ? g.props.get(this.flashProp) : null;
    if (this.flashOn && this.flashKind !== 'lighter' && (!fp || fp.state.owner !== this.id || fp.state.where !== 'held')) { fp = this.bestFlash(); this.flashProp = fp?.id || null; if (!fp) this.flashOn = false; }
    const kindDef = FLASHLIGHTS[this.flashOn ? this.flashKind : 'none'] || FLASHLIGHTS.basic;
    let bat = this.flashKind === 'lighter' ? 1 : this.batteryOf(fp);
    if (this.flashOn && fp && this.flashKind !== 'lighter') {
      bat = Math.max(0, bat - kindDef.drain * dt * (g.settings.batteryDrain ?? 1));
      fp.state.data = { ...fp.data, battery: bat };
      this._batSync = (this._batSync || 0) + dt; if (this._batSync > 8) { this._batSync = 0; g.sim.do('propdata', { id: fp.id, data: { battery: bat } }); }
      if (bat <= 0) { this.flashOn = false; g.toast('La lampe s\'éteint : piles vides. (R pour recharger)'); g.sfx('flashlight_click', null, { bus: 'ui' }); }
    }
    this.battery = bat;
    const cam = this.camera;
    const want = this.flashOn && this.mode !== 'dead' && this.mode !== 'hide';
    let I = want ? kindDef.intensity : 0;
    if (want && bat < 0.15) I *= (Math.random() < 0.08 ? 0.1 : 0.4 + bat * 4);
    if (want && kindDef.flicker && Math.random() < 0.03) I *= 0.2;
    if (want && this.flashKind === 'lighter') I *= 0.8 + Math.random() * 0.4;
    // position : main droite, avec un léger retard (inertie)
    const fwd = this.forward();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const off = kindDef.head ? new THREE.Vector3(0, 0.08, 0) : right.clone().multiplyScalar(0.2).add(new THREE.Vector3(0, -0.18, 0));
    this.flashDir.lerp(fwd, Math.min(1, dt * (kindDef.head ? 30 : 14))).normalize();
    // la source est placée juste devant la lentille : la lampe tenue en main ne s'éclaire pas elle-même
    this.flashPos.copy(cam.position).add(off).addScaledVector(this.flashDir, kindDef.head ? 0.12 : 0.38);
    sl.position.copy(this.flashPos);
    sl.target.position.copy(this.flashPos).addScaledVector(this.flashDir, 5);
    sl.intensity = I; sl.angle = kindDef.angle; sl.distance = kindDef.range || 1; sl.color.set(kindDef.color); sl.penumbra = this.flashKind === 'lighter' ? 1 : 0.45;
    sl.castShadow = g.settings.shadows !== false && I > 0;
    // faisceau
    const len = Math.min(kindDef.range * 0.55, 9);
    this.beam.visible = I > 0 && g.settings.volumetric !== false && this.flashKind !== 'lighter';
    if (this.beam.visible) {
      this.beam.position.copy(this.flashPos).addScaledVector(this.flashDir, 0.15);
      this.beam.lookAt(this.flashPos.clone().addScaledVector(this.flashDir, -1));
      const r = Math.tan(kindDef.angle * 0.8) * len; this.beam.scale.set(r, r, len);
      this.beam.material.uniforms.strength.value = (I / 13) * 0.05 * (g.isDay ? 0.2 : 1);
      this.beam.material.uniforms.color.value.set(kindDef.color);
    }
    // UV
    GLOBAL_UNIFORMS.uvOn.value = I > 0 && kindDef.uv ? 1 : 0;
    GLOBAL_UNIFORMS.uvPos.value.copy(this.flashPos); GLOBAL_UNIFORMS.uvDir.value.copy(this.flashDir); GLOBAL_UNIFORMS.uvCos.value = Math.cos(kindDef.angle);
    g.particles?.setFlash(this.flashPos, this.flashDir, kindDef.angle, I);
    // R (sans cible) = recharger
    if (g.input.hit('KeyR') && !g.interaction?.target && this.mode === 'walk' && !g.ui.modal) { if (!useHeld(g, this, this.heldProp, 'alt')) this.reloadBattery(); }
  }

  updateCamera(dt) {
    const cam = this.camera, b = this.body;
    let eyeH = 1.62 - this.crouchT * 0.72;
    let x = b.pos[0], y = b.pos[1] + eyeH, z = b.pos[2];
    if (this.mode === 'sit' && this.seat) { x = this.seat.pos.x; y = this.seat.pos.y + 0.75; z = this.seat.pos.z; }
    if (this.mode === 'hide') { y = b.pos[1] + 1.0; }
    if (this.mode === 'dead') { y = b.pos[1] + 0.3; }
    // balancement
    const bobA = Math.min(1, Math.hypot(b.vel[0], b.vel[2]) / 5);
    const by = Math.sin(this.bob * 2) * 0.035 * bobA, bx = Math.cos(this.bob) * 0.025 * bobA;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    x += c * bx; z -= s * bx; y += by - this.landShake * 0.12;
    this.landShake *= Math.max(0, 1 - dt * 6);
    // secousses
    let sx = 0, sy = 0;
    if (this.shakeT > 0) { this.shakeT -= dt; sx = (Math.random() - 0.5) * this.shakeAmt * 0.1; sy = (Math.random() - 0.5) * this.shakeAmt * 0.1; if (this.shakeT <= 0) this.shakeAmt = 0; }
    const stress = this.stats.stress / 100;
    if (stress > 0.6) { sx += Math.sin(this.game.time * 13) * 0.002 * stress; sy += Math.cos(this.game.time * 11) * 0.002 * stress; }
    cam.position.set(x, y, z);
    let roll = 0;
    if (this.hasEffect('drunk')) roll = Math.sin(this.game.time * 0.7) * 0.05;
    if (this.effects.slip) roll = Math.sin(this.effects.slip * 10) * 0.2;
    cam.rotation.set(this.pitch + sy, this.yaw + sx, roll, 'YXZ');
    const targetFov = (this.game.settings.fov || 72) / this.zoom;
    if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix(); }
  }

  updateViewmodel(dt) {
    const held = this.heldProp; const id = held ? held.id : null;
    if (id !== this.vmHeldId) {
      if (this.vmHeld) { this.vm.remove(this.vmHeld); this.vmHeld = null; }
      this.vmHeldId = id;
      if (held) {
        const geo = buildItemGeometry(held.def, this.game.atlas);
        const m = new THREE.Mesh(geo, this.game.mats.get('props'));
        m.castShadow = false; m.frustumCulled = false; m.renderOrder = 10;
        const s = held.def.s; const size = Math.max(s[0], s[1], s[2]);
        const k = size > 0.6 ? 0.55 / size : size < 0.08 ? 1.6 : 1;
        m.scale.setScalar(k);
        m.userData.k = k; m.userData.size = size * k;
        this.vmHeld = m; this.vm.add(m);
      }
    }
    const a = this.vmAnim;
    a.swing = Math.max(0, a.swing - dt * 4); a.raise = Math.max(0, a.raise - dt * 2.5);
    const bobA = Math.min(1, Math.hypot(this.body.vel[0], this.body.vel[2]) / 5);
    const bx = Math.cos(this.bob) * 0.012 * bobA, by = Math.abs(Math.sin(this.bob)) * 0.012 * bobA;
    if (this.vmHeld) {
      const sz = this.vmHeld.userData.size || 0.2;
      this.vmHeld.position.set(0.24 + bx, -0.22 - sz * 0.25 + by + a.raise * 0.12 - this.throwCharge * 0.05, -0.45 - sz * 0.3 + a.raise * 0.15 + this.throwCharge * 0.12);
      this.vmHeld.rotation.set(-0.15 - a.swing * 1.2 + a.raise * 0.6, -0.35 + a.swing * 0.6, a.swing * 0.4);
    }
    this.handR.visible = !!this.vmHeld; this.handR.position.set(0.24 + bx, -0.3 + by + a.raise * 0.1, -0.38);
    this.handL.visible = this.flashOn && this.flashKind !== 'none';
    this.handL.position.set(-0.24 - bx, -0.29 + by, -0.4);
    this.vm.visible = this.hands.visible = this.mode !== 'hide' && this.mode !== 'dead';
  }

  updateAvatar(dt) {
    const a = this.avatar; if (!a) return;
    const b = this.body;
    a.visible = this.mode !== 'hide' && !this.inVent || this.inVent;
    a.position.set(b.pos[0], b.pos[1], b.pos[2]); a.rotation.y = this.yaw + Math.PI;
    this._azT = (this._azT || 0) - dt;
    if (this._azT <= 0 && a.userData.zoneU) { this._azT = 0.3; const z = this.game.world.zoneAt(b.pos[0], b.pos[1] + 1, b.pos[2]); if (z) a.userData.zoneU.value.copy(this.game.mats.zoneUniform(z.id).value); else a.userData.zoneU.value.setRGB(0, 0, 0); }
    const sp = Math.hypot(b.vel[0], b.vel[2]);
    animateHumanoid(a, dt, sp, this.mode === 'sit' ? 'sit' : this.crouching ? 'crouch' : this.mode === 'dead' ? 'dead' : this.flashOn ? 'flashlight' : 'auto', { pitch: this.pitch, holding: !!this.heldProp });
  }

  updateAudio(dt) {
    const g = this.game; const st = this.stats.stress;
    if (st > 45 && this.alive) {
      if (!this.heart) this.heart = g.loop('heartbeat', null, { volume: 0, bus: 'sfx' });
      this.heart.setVolume(Math.min(0.9, (st - 45) / 55), 0.3); this.heart.setParam?.('bpm', 70 + st * 0.9);
    } else if (this.heart) { this.heart.stop(1); this.heart = null; }
    if (this.stats.stamina < 30 && this.alive) {
      if (!this.breath) this.breath = g.loop('breath', null, { volume: 0, bus: 'sfx' });
      this.breath.setVolume(Math.min(0.6, (30 - this.stats.stamina) / 40), 0.4);
    } else if (this.breath) { this.breath.stop(1); this.breath = null; }
    g.renderer.fx.stress.value = st / 100;
    g.renderer.fx.heartbeat.value = 0.5 + 0.5 * Math.sin(g.time * (70 + st * 0.9) / 60 * Math.PI * 2);
    g.renderer.fx.drunk.value = this.hasEffect('drunk') ? 1 : 0;
    g.renderer.fx.sleepy.value = this.hasEffect('sleepy') ? 0.6 + 0.4 * Math.sin(g.time * 0.8) : 0;
    g.renderer.fx.cold.value = this.hasEffect('cold') ? 0.6 : (g.env?.coldAt?.(this.pos) || 0);
    g.renderer.fx.kaleido.value = this.hasEffect('kaleido') ? 1 : 0;
    const gm = this.wear.face === 'nightvision' ? 1 : this.wear.face === 'anaglyph' ? 2 : this.wear.face === 'sun' ? 3 : this.hasEffect('vr') ? 4 : 0;
    g.renderer.fx.glassesMode.value = gm;
  }

  // ── lancer / poser ──
  throwHeld(charge) {
    const pr = this.heldProp; if (!pr) return;
    const f = this.forward(); const sp = 2 + charge * 11 / Math.max(1, (pr.def.mass || 0.5) * 0.4);
    const start = this.camera.position.clone().addScaledVector(f, 0.45); start.y -= 0.1;
    const v = [f.x * sp + this.body.vel[0] * 0.5, f.y * sp + 1.2 + charge, f.z * sp + this.body.vel[2] * 0.5];
    this.game.sim.do('drop', { id: pr.id, pos: start.toArray(), vel: v, quat: [0, 0, 0, 1] });
    this.vmAnim.swing = 0.6; this.game.sfx('throw', null, { volume: 0.4 + charge * 0.5, bus: 'ui' });
  }
  dropHeld(place = true) {
    const pr = this.heldProp; if (!pr) return;
    const g = this.game; const f = this.forward();
    // poser sur ce qu'on vise (sol, table) si proche
    const hit = g.interaction.rayWorld(3);
    let pos;
    if (hit && hit.point && hit.normal && hit.normal[1] > 0.6) pos = [hit.point[0], hit.point[1] + pr.half[1] + 0.005, hit.point[2]];
    else pos = this.dropPos();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
    g.sim.do('drop', { id: pr.id, pos, vel: hit ? null : [0, 0, 0], quat: [q.x, q.y, q.z, q.w], place: !!hit });
    g.sfx('drop', null, { volume: 0.3, bus: 'ui' });
  }
  stateForNet() {
    const b = this.body;
    return { p: [+b.pos[0].toFixed(2), +b.pos[1].toFixed(2), +b.pos[2].toFixed(2)], y: +this.yaw.toFixed(3), pi: +this.pitch.toFixed(2), c: this.crouching ? 1 : 0, f: this.flashOn ? this.flashKind : 0, co: this.costume, h: this.heldDef?.id || null, inv: this.inv.defs(), a: this.alive ? 1 : 0, hid: this.mode === 'hide' ? 1 : 0, v: this.inVent ? 1 : 0, n: +this.noiseLevel.toFixed(2), m: this.mode, st: Math.round(this.stats.stress), wear: this.wear };
  }
}

export function avatarOpts(costume, wear = {}) {
  const co = COSTUMES[costume] || COSTUMES.guard;
  if (costume === 'bear') return { kind: 'bear' };
  if (costume === 'ghost') return { kind: 'ghost' };
  if (costume === 'mannequin') return { kind: 'mannequin' };
  if (costume === 'police') return { kind: 'police', shirt: co.color, pants: co.color2, hat: 'cap', hatColor: 0x0d1450 };
  if (costume === 'firefighter') return { kind: 'firefighter', shirt: co.color, pants: co.color, hat: 'firehelmet' };
  if (costume === 'astronaut') return { shirt: co.color, pants: co.color, hat: 'helmet' };
  if (costume === 'cat') return { shirt: co.color, pants: co.color, hair: 0x111111 };
  if (costume === 'clown') return { shirt: co.color, pants: co.color2, hair: 0xff6d00 };
  return { shirt: wear.bodyColor ?? 0x2b3a55, pants: 0x1f2a44, badge: true };
}
