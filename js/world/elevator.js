// Ascenseur panoramique vitré, dans le vide de la galerie ouest : parking (-4.5), rez-de-chaussée (0), étage (5).
// Cabine et portes palières coulissantes animées localement ; décisions (appels, trajets) prises par l'hôte.
// Les joueurs dans la cabine sont déplacés avec elle par leur propre client (chacun contrôle son joueur).
import * as THREE from 'three';
import { WorldObject } from './world.js';
import { Box, LAYER } from '../engine/physics.js';
import { Net } from '../net/net.js';

const FLOOR_NAMES = ['Parking', 'Rez-de-chaussée', 'Étage'];
const AREAS = ['garage', 'gallery0', 'gallery1'];
const RIDE = 5.2, DOOR_T = 0.9;

export class ElevatorButton extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'button');
    this.o = o; this.zone = o.zone; this.name = o.label;
    this.setPick(o.x - 0.12, o.y - 0.15, o.z - 0.12, o.x + 0.12, o.y + 0.15, o.z + 0.12);
  }
  prompt() { const e = this.o.elevator; const s = e.state; return this.o.cab ? 'E : ' + FLOOR_NAMES[this.o.floor] + (s.moving ? ' (en marche…)' : '') : 'E : Appeler l\'ascenseur' + (s.moving ? ' (en route…)' : s.floor === this.o.floor ? ' (il est là)' : ''); }
  interact(verb, actor) { if (verb === 'use') this.o.elevator.request(this.o.floor, actor); }
}

export class Elevator extends WorldObject {
  constructor(world, id, o, A) {
    super(world, id, 'elevator');
    const g = world.game; this.o = o; this.name = 'Ascenseur';
    const { x0, x1, z0, z1 } = o; this.floors = o.floors; const F = this.floors;
    const zDoor = z1, cx = (x0 + x1) / 2, dw = 1.2;
    this.cx = cx; this.zDoor = zDoor;
    // ── gaine : montants d'acier et vitrages (3 faces), linteaux côté portes ──
    const levelZone = (y) => (y < -0.6 ? 'garage' : y < 5 ? 'gallery0_w' : 'gallery1_w');
    const top = F[F.length - 1] + 3.3;
    const segs = [[F[0], -0.6], [0, 4.6], [4.6, top]];
    for (const [ya, yb] of segs) {
      const zn = levelZone((ya + yb) / 2);
      for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) A.box(zn, 'steel_dark', px - 0.06, ya, pz - 0.06, px + 0.06, yb, pz + 0.06, { collide: false });
      A.box(zn, 'glass', x0 - 0.01, ya, z0, x0 + 0.01, yb, z1, { collide: false }); A.box(zn, 'glass', x1 - 0.01, ya, z0, x1 + 0.01, yb, z1, { collide: false });
      A.box(zn, 'glass', x0, ya, z0 - 0.01, x1, yb, z0 + 0.01, { collide: false });
    }
    world.physics.add(new Box(x0 - 0.04, F[0], z0, x0 + 0.04, top, z1, LAYER.GLASS)); world.physics.add(new Box(x1 - 0.04, F[0], z0, x1 + 0.04, top, z1, LAYER.GLASS));
    world.physics.add(new Box(x0, F[0], z0 - 0.04, x1, top, z0 + 0.04, LAYER.GLASS));
    A.box(levelZone(top - 0.5), 'steel_dark', x0 - 0.08, top, z0 - 0.08, x1 + 0.08, top + 0.35, z1 + 0.08, { collide: false }); // machinerie
    // côté portes : vitrage au-dessus des portes à chaque niveau, panneaux pleins autour
    for (const y of F) {
      const zn = levelZone(y + 1);
      A.box(zn, 'steel_dark', x0, y + 2.2, zDoor - 0.03, x1, y + 2.35, zDoor + 0.03, { collide: false });
      A.box(zn, 'glass', x0, y + 2.35, zDoor - 0.01, x1, Math.min(y + 4.5, top), zDoor + 0.01, { collide: false });
      A.box(zn, 'steel', x0, y, zDoor - 0.03, cx - dw / 2, y + 2.2, zDoor + 0.03); A.box(zn, 'steel', cx + dw / 2, y, zDoor - 0.03, x1, y + 2.2, zDoor + 0.03);
      world.physics.add(new Box(x0, y + 2.2, zDoor - 0.04, x1, Math.min(y + 4.5, top), zDoor + 0.04, LAYER.GLASS));
      A.box(zn, 'granite', x0 - 0.05, y, zDoor, x1 + 0.05, y + 0.012, zDoor + 0.35, { collide: false }); // seuil
    }
    // ── portes palières (deux vantaux vitrés coulissants par niveau) ──
    const glassMat = g.mats.get('glass'), frameMat = g.mats.get('steel', 'gallery0_w');
    this.landings = F.map((y, i) => {
      const grp = new THREE.Group(); const leaves = [];
      for (const s of [-1, 1]) {
        const leaf = new THREE.Group();
        const pane = new THREE.Mesh(new THREE.BoxGeometry(dw / 2, 2.15, 0.03), glassMat); pane.position.y = 1.075; leaf.add(pane);
        const fr = new THREE.Mesh(new THREE.BoxGeometry(dw / 2, 0.06, 0.05), frameMat); fr.position.y = 2.15; leaf.add(fr);
        const fr2 = fr.clone(); fr2.position.y = 0.03; leaf.add(fr2);
        leaf.position.set(cx + s * dw / 4, y, zDoor + 0.06); grp.add(leaf); leaves.push({ leaf, s });
      }
      (world.zone(levelZone(y + 1))?.group || world.root).add(grp);
      const col = world.physics.add(new Box(cx - dw / 2, y, zDoor + 0.02, cx + dw / 2, y + 2.15, zDoor + 0.1, LAYER.DOOR));
      return { y, leaves, col, open: 0 };
    });
    // ── cabine ──
    const cab = this.cab = new THREE.Group(); world.root.add(cab);
    const cw = x1 - x0 - 0.12, cd = z1 - z0 - 0.12;
    const floorM = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.12, cd), g.mats.get('granite', 'gallery0_w')); floorM.position.y = -0.06; cab.add(floorM);
    const ceilM = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.08, cd), g.mats.get('steel_dark', 'gallery0_w')); ceilM.position.y = 2.5; cab.add(ceilM);
    this.lightMat = new THREE.MeshBasicMaterial({ color: 0xfff4dd }); const lamp = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.6, cd * 0.6), this.lightMat); lamp.rotation.x = Math.PI / 2; lamp.position.y = 2.455; cab.add(lamp);
    for (const [w, d, px, pz] of [[0.03, cd, -cw / 2, 0], [0.03, cd, cw / 2, 0], [cw, 0.03, 0, -cd / 2]]) { const gl = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), glassMat); gl.position.set(px, 1.25, pz); cab.add(gl); }
    for (const [px, pz] of [[-cw / 2, -cd / 2], [cw / 2, -cd / 2], [-cw / 2, cd / 2], [cw / 2, cd / 2]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.5, 0.06), frameMat); p.position.set(px, 1.25, pz); cab.add(p); }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.2, 0.04, 0.04), g.mats.get('chrome')); rail.position.set(0, 0.95, -cd / 2 + 0.06); cab.add(rail);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.22), frameMat); panel.position.set(cw / 2 - 0.03, 1.25, cd / 2 - 0.3); cab.add(panel);
    this.cabDoors = [];
    for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(dw / 2, 2.2, 0.03), glassMat); d.position.set(s * dw / 4, 1.1, cd / 2 - 0.02); cab.add(d); this.cabDoors.push({ d, s }); }
    this.cabFloor = world.physics.add(new Box(x0, 0, z0, x1, 0, z1, LAYER.FURN));
    this.cabCols = [world.physics.add(new Box(0, 0, 0, 0, 0, 0, LAYER.GLASS)), world.physics.add(new Box(0, 0, 0, 0, 0, 0, LAYER.GLASS)), world.physics.add(new Box(0, 0, 0, 0, 0, 0, LAYER.GLASS))];
    this.cabDoorCol = world.physics.add(new Box(0, 0, 0, 0, 0, 0, LAYER.DOOR));
    this.cw = cw; this.cd = cd;
    // ── boutons : appels aux paliers, boutons de cabine ──
    this.buttons = [];
    F.forEach((y, i) => { const b = new ElevatorButton(world, world.newId('elevbtn'), { elevator: this, floor: i, label: 'Appel ascenseur', zone: levelZone(y + 1), x: x1 + 0.22, y: y + 1.15, z: zDoor + 0.12 }); world.add(b); this.buttons.push(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.03), frameMat); m.position.set(x1 + 0.22, y + 1.15, zDoor + 0.06); (world.zone(levelZone(y + 1))?.group || world.root).add(m);
      const led = new THREE.Mesh(new THREE.CircleGeometry(0.025, 10), new THREE.MeshBasicMaterial({ color: 0xffb300 })); led.position.set(x1 + 0.22, y + 1.15, zDoor + 0.077); (world.zone(levelZone(y + 1))?.group || world.root).add(led); });
    this.cabButtons = F.map((y, i) => { const b = new ElevatorButton(world, world.newId('elevcab'), { elevator: this, floor: i, cab: true, label: 'Cabine', zone: 'gallery0_w', x: 0, y: 0, z: 0 }); world.add(b); return b; });
    this.init({ floor: 1, to: 1, moving: 0, doors: 0 });
    this.y = F[1]; this.animT = 0; this.doorOpen = 0; this.idle = 0; this.queue = [];
    this.active = true; this.place();
    this.setPick(x0, F[0], z0, x1, top, z1); this.pickBox.enabled = false; // seule la gaine : pas d'interaction directe
  }
  areaOk(i) { return this.world.game.isAreaUnlocked ? this.world.game.isAreaUnlocked(AREAS[i]) : true; }
  // hôte : demande d'un étage
  request(floor, actor) {
    const g = this.world.game; const s = this.state;
    g.sim.emit('fx', { s: 'button', pos: [this.cx, this.floors[floor] + 1.1, this.zDoor], v: 0.5 });
    if (!this.areaOk(floor)) { g.sim.emit('toast', { text: FLOOR_NAMES[floor] + ' : hors de votre secteur cette nuit.' }, { to: actor }); g.sim.emit('fx', { s: 'beep', pos: [this.cx, this.floors[floor] + 1.1, this.zDoor], v: 0.4 }); return; }
    if (s.moving) { if (!this.queue.includes(floor)) this.queue.push(floor); return; }
    if (floor === s.floor) { if (!s.doors) this.set({ doors: 1 }); this.idle = 0; return; }
    this.go(floor);
  }
  go(floor) {
    if (this.state.doors) { this.set({ doors: 0 }); this.pending = { floor, t: DOOR_T + 0.3 }; }
    else this.set({ moving: 1, to: floor });
  }
  onState(p, isReset) {
    if ('moving' in p && p.moving) { this.animT = 0; this.from = this.y; this._arriving = false; this.loop = this.loop || this.world.game.loop('electric_hum', new THREE.Vector3(this.cx, this.y + 2, this.zDoor), { volume: 0.25, ref: 3 }); }
    if ('moving' in p && !p.moving) { this.loop?.stop(0.4); this.loop = null; this.y = this.floors[this.state.floor]; if (!isReset) this.world.game.sfx('elevator_ding', new THREE.Vector3(this.cx, this.y + 2.2, this.zDoor), { volume: 0.7 }); }
    if (isReset) { this.y = this.floors[this.state.floor]; this.doorOpen = this.state.doors; this.loop?.stop(0.1); this.loop = null; this.pending = null; this.queue = []; this.place(); }
    if ('doors' in p && !isReset) this.world.game.sfx(p.doors ? 'door_open' : 'door_close', new THREE.Vector3(this.cx, this.y + 1, this.zDoor), { volume: 0.35, pitch: 1.4 });
  }
  update(dt) {
    const g = this.world.game; const s = this.state; const F = this.floors;
    // trajet (animé sur chaque pair)
    const oldY = this.y;
    if (s.moving) {
      this.animT += dt; const T = RIDE * Math.abs(F[s.to] - (this.from ?? this.y)) / 5 + 0.6;
      const k = Math.min(1, this.animT / T), e = k * k * (3 - 2 * k);
      this.y = (this.from ?? this.y) + (F[s.to] - (this.from ?? this.y)) * e;
      this.loop?.setPos(new THREE.Vector3(this.cx, this.y + 2, this.zDoor));
      if (k >= 1 && this.isHost() && !this._arriving) { this._arriving = true; this.set({ moving: 0, floor: s.to, doors: 1 }); this.idle = 0; }
    }
    // joueur local dans la cabine : déplacé avec elle
    const dy = this.y - oldY;
    if (dy) { const p = g.player; const P = p.body.pos; if (P[0] > this.o.x0 && P[0] < this.o.x1 && P[2] > this.o.z0 && P[2] < this.o.z1 && P[1] > oldY - 0.4 && P[1] < oldY + 2.4) { P[1] = this.y + 0.01; p.body.vel[1] = 0; } }
    // portes (cabine + palier de l'étage courant)
    const want = s.doors && !s.moving ? 1 : 0;
    this.doorOpen += Math.sign(want - this.doorOpen) * Math.min(Math.abs(want - this.doorOpen), dt / DOOR_T);
    // hôte : enchaînements
    if (this.isHost()) {
      if (this.pending) { this.pending.t -= dt; if (this.pending.t <= 0) { const f = this.pending.floor; this.pending = null; this.set({ moving: 1, to: f }); } }
      else if (!s.moving && s.doors) { this.idle += dt; if (this.idle > 9) { if (this.someoneInDoor()) this.idle = 6; else { this.set({ doors: 0 }); this.idle = 0; } } }
      else if (!s.moving && !s.doors && this.queue.length) { const f = this.queue.shift(); if (f === s.floor) this.set({ doors: 1 }); else this.go(f); }
    }
    this.place();
  }
  isHost() { return Net.isHost; }
  someoneInDoor() { // un joueur dans l'embrasure : les portes ne se referment pas
    const y = this.floors[this.state.floor];
    for (const p of this.world.game.allPlayers()) { const P = p.pos; if (Math.abs(P.x - this.cx) < 0.75 && Math.abs(P.z - this.zDoor) < 0.6 && Math.abs(P.y - y) < 1) return true; }
    return false;
  }
  place() {
    const W = this.world, o = this.o; const y = this.y, cx = this.cx, cz = (o.z0 + o.z1) / 2;
    this.cab.position.set(cx, y, cz);
    this.cabFloor.set(o.x0, y - 0.12, o.z0, o.x1, y, o.z1); W.physics.update(this.cabFloor);
    const [a, b, c] = this.cabCols; const cw = this.cw, cd = this.cd;
    a.set(cx - cw / 2 - 0.03, y, cz - cd / 2, cx - cw / 2 + 0.03, y + 2.5, cz + cd / 2); b.set(cx + cw / 2 - 0.03, y, cz - cd / 2, cx + cw / 2 + 0.03, y + 2.5, cz + cd / 2); c.set(cx - cw / 2, y, cz - cd / 2 - 0.03, cx + cw / 2, y + 2.5, cz - cd / 2 + 0.03);
    for (const q of this.cabCols) W.physics.update(q);
    const open = this.doorOpen;
    for (const { d, s } of this.cabDoors) d.position.x = s * (0.3 + open * 0.55);
    this.cabDoorCol.set(cx - 0.6, y, cz + cd / 2 - 0.06, cx + 0.6, y + 2.2, cz + cd / 2 + 0.02); this.cabDoorCol.enabled = open < 0.6; W.physics.update(this.cabDoorCol);
    const cur = this.state.moving ? -1 : this.state.floor;
    this.landings.forEach((L, i) => {
      const op = i === cur ? open : 0; L.open = op;
      for (const { leaf, s } of L.leaves) leaf.position.x = cx + s * (0.3 + op * 0.55);
      L.col.enabled = op < 0.6; W.physics.update(L.col);
    });
    // boutons de cabine (suivent la cabine)
    this.cabButtons.forEach((bt, i) => { const bx = cx + cw / 2 - 0.08, by = y + 1.42 - i * 0.16, bz = cz + cd / 2 - 0.3; bt.o.x = bx; bt.o.y = by; bt.o.z = bz; bt.setPick(bx - 0.08, by - 0.07, bz - 0.1, bx + 0.02, by + 0.07, bz + 0.1); });
    this.lightMat.color.setRGB(1.6, 1.5, 1.35);
  }
}
