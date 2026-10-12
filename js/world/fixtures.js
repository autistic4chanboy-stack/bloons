// Éléments fixes interactifs de base : portes, rideaux métalliques, vitres, interrupteurs, sièges, panneaux
// lisibles, conteneurs, casiers, grilles d'aération, trappe, cachettes.
import * as THREE from 'three';
import { WorldObject } from './world.js';
import { Box, LAYER } from '../engine/physics.js';
import { quickGeometry } from './meshes.js';
import { GeoBuilder, roundBoxGeo, latheGeo, trs } from '../engine/geo.js';
import { LORE } from '../data/lore.js';
import { ITEMS } from '../data/items.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// gabarits partagés (petites pièces de quincaillerie), UV en mètres
const T = {};
const tpl = (k, make) => T[k] || (T[k] = make());
// Ajoute une géométrie colorée à un kit de quickGeometry (couleur par sommet, texel blanc de l'atlas)
const kg = (k, geo, m, color) => k.b.geometry(geo, m, { color, rect: k.white });

// Encadrement d'une ouverture de porte (chambranles des deux faces, linteau), posé dans le lot d'architecture quand il
// existe (pendant la construction : aucun appel de rendu en plus). Les tableaux du mur sont retrouvés dans la physique.
function doorFrame(world, o, w, h) {
  const A = world.arch; if (!A || o.mat === 'glass' || o.frame === false) return;
  const ax = o.axis === 'x', y = o.y, mid = ax ? o.x : o.z, n0 = ax ? o.z : o.x;
  // murs voisins : épaisseur et position (axe n), bords réels de l'ouverture (axe u) et dessous du linteau
  const probe = (u, yy) => { const px = ax ? u : n0, pz = ax ? n0 : u; return world.physics.near(px - 0.02, pz - 0.02, px + 0.02, pz + 0.02, LAYER.WALL).find(b => b.min[1] <= yy && b.max[1] >= yy && b.min[0] <= px && b.max[0] >= px && b.min[2] <= pz && b.max[2] >= pz); };
  const side = [probe(mid - w / 2 - 0.08, y + 1), probe(mid + w / 2 + 0.08, y + 1)];
  const ref = side[0] || side[1]; if (!ref) return;
  const ni = ax ? 2 : 0, ui = ax ? 0 : 2, nLo = ref.min[ni], nHi = ref.max[ni];
  if (nHi - nLo > 0.6) return; // pas un mur (bloc plein)
  const eA = side[0] ? Math.min(side[0].max[ui], mid - w / 2 + 0.06) : mid - w / 2, eB = side[1] ? Math.max(side[1].min[ui], mid + w / 2 - 0.06) : mid + w / 2;
  const lin = [0.06, 0.25, 0.5].map(d => probe(mid, y + h + d)).find(b => b), top = lin ? lin.min[1] : y + h;
  const metal = o.mat === 'metal', mat = metal ? 'furniture_metal' : 'furniture', col = o.frameColor ?? (metal ? 0x5d666c : 0xe9e5dc);
  const B = (u0, u1, y0, y1, a, b) => A.box(o.zone, mat, ax ? u0 : a, y0, ax ? a : u0, ax ? u1 : b, y1, ax ? b : u1, { collide: false, color: col, flat: true });
  for (const [f, s] of [[nLo, -1], [nHi, 1]]) {
    const a = Math.min(f, f + s * 0.018), b = Math.max(f, f + s * 0.018);
    // chambranles seulement contre un mur (porte double : rien au milieu, entre les deux vantaux)
    if (side[0]) B(eA - 0.065, eA, y, top + (lin ? 0.065 : 0), a, b);
    if (side[1]) B(eB, eB + 0.065, y, top + (lin ? 0.065 : 0), a, b);
    if (lin) B(eA, eB, top, top + 0.065, a, b);
  }
  // huisserie pleine dans l'épaisseur du mur jusqu'au jeu de 4 mm autour du vantail (plus de jour au travers de
  // l'ouverture quand elle est plus grande que la porte)
  if (mid - w / 2 - eA >= 0.008) B(eA, mid - w / 2 - 0.004, y, top, nLo, nHi);
  if (eB - (mid + w / 2) >= 0.008) B(mid + w / 2 + 0.004, eB, y, top, nLo, nHi);
  if (lin && top - (y + h) >= 0.008) B(eA, eB, y + h + 0.004, top, nLo, nHi);
}

// ───────────────────────── PORTE ─────────────────────────
// axis : 'x' = le panneau s'étend le long de X (porte dans un mur parallèle à X) ; 'z' sinon.
export class Door extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'door');
    this.o = o; this.name = o.name || 'Porte';
    this.zone = o.zone;
    const g = world.game;
    const w = o.width || 1.0, h = o.height || 2.1, t = o.thick || 0.06;
    this.w = w; this.h = h;
    this.pivot = new THREE.Group();
    const hingeSign = o.hinge === 'b' ? 1 : -1;
    // charnière à une extrémité
    if (o.axis === 'x') this.pivot.position.set(o.x + hingeSign * w / 2, o.y, o.z);
    else this.pivot.position.set(o.x, o.y, o.z + hingeSign * w / 2);
    const color = o.color ?? (o.mat === 'metal' ? 0x6f7a80 : o.mat === 'glass' ? 0x9fb8c0 : 0x8d6e4e);
    const { geometry } = quickGeometry(g.atlas, (k) => {
      // repère du vantail : u de la charnière vers le bord libre, y, n = épaisseur ; bx : boîte (u0…u1, y0…y1, n0…n1)
      const ax = o.axis === 'x', dU = -hingeSign, hw = t / 2, steel = 0xc3c7cb;
      const bx = (u0, u1, y0, y1, n0, n1, c, opt) => k.box(ax ? dU * (u0 + u1) / 2 : (n0 + n1) / 2, (y0 + y1) / 2, ax ? (n0 + n1) / 2 : dU * (u0 + u1) / 2, ax ? u1 - u0 : n1 - n0, y1 - y0, ax ? n1 - n0 : u1 - u0, c, opt);
      // pièce de révolution dont l'axe propre (Y) pointe vers la face s (n = ±)
      const onFace = (u, yy, nn, s) => ax ? trs(dU * u, yy, nn, s * Math.PI / 2, 0, 0) : trs(nn, yy, dU * u, 0, 0, -s * Math.PI / 2);
      if (o.mat === 'glass') {
        // porte vitrée sans cadre : sabots haut et bas, poignées bâtons inox sur entretoises (deux faces), verrou au sol
        bx(0, w, 0, 0.11, -0.022, 0.022, 0x9aa1a6); bx(0, w, h - 0.11, h, -0.022, 0.022, 0x9aa1a6);
        bx(w - 0.16, w - 0.04, 0.005, 0.03, -0.03, 0.03, 0x6d7378);
        for (const s of [-1, 1]) {
          kg(k, tpl('dbar', () => latheGeo([[0, -0.5], [0.016, -0.5], [0.016, -0.5], [0.016, 0.5], [0.016, 0.5], [0, 0.5]], 12)), ax ? trs(dU * (w - 0.11), 1.1, s * 0.075) : trs(s * 0.075, 1.1, dU * (w - 0.11)), steel);
          for (const yy of [0.72, 1.48]) kg(k, tpl('dstand', () => latheGeo([[0.009, 0], [0.009, 0.06]], 8)), onFace(w - 0.11, yy, s * 0.008, s), steel);
        }
      } else {
        bx(0, w, 0, h, -hw, hw, color);                                                                                  // vantail
        for (const s of [-1, 1]) bx(0.03, w - 0.03, 0.015, 0.25, s > 0 ? hw : -hw - 0.002, s > 0 ? hw + 0.002 : -hw, 0xb3b8bc); // plaques de propreté
        if (o.window) { // oculus : vitrage sombre dans un joint noir traversant
          const u0 = w * 0.3, u1 = w * 0.7, y0 = h * 0.6, y1 = h * 0.85, a = -hw - 0.005, b = hw + 0.005;
          bx(u0, u1, y0, y1, -hw - 0.001, hw + 0.001, 0x223038);
          bx(u0 - 0.022, u1 + 0.022, y0 - 0.022, y0, a, b, 0x1c1c1c); bx(u0 - 0.022, u1 + 0.022, y1, y1 + 0.022, a, b, 0x1c1c1c);
          bx(u0 - 0.022, u0, y0, y1, a, b, 0x1c1c1c); bx(u1, u1 + 0.022, y0, y1, a, b, 0x1c1c1c);
        }
        if (o.label) { const r = k.label('door_' + o.label, o.label, 0xffffff); k.box(ax ? dU * w / 2 : 0, h * 0.82, ax ? 0 : dU * w / 2, ax ? 0.4 : t * 1.2, 0.14, ax ? t * 1.2 : 0.4, 0xffffff, { label: { face: ax ? 'zZ' : 'xX', rect: r } }); }
        for (const yy of [0.24, h * 0.52, h - 0.24]) bx(-0.008, 0.012, yy - 0.055, yy + 0.055, -0.009, 0.009, 0x8a8f93);   // nœuds de paumelles
        if (o.armored) for (const s of [-1, 1]) { // porte blindée : cadre en relief sur les deux faces
          const a = s > 0 ? hw : -hw - 0.012, b = s > 0 ? hw + 0.012 : -hw, c2 = 0x47555e;
          bx(0.07, w - 0.07, 0.3, 0.36, a, b, c2); bx(0.07, w - 0.07, h - 0.36, h - 0.3, a, b, c2); bx(0.07, 0.13, 0.36, h - 0.36, a, b, c2); bx(w - 0.13, w - 0.07, 0.36, h - 0.36, a, b, c2);
        } else if (o.mat === 'metal') { // ferme-porte en applique (face +n)
          bx(0.1, 0.4, h - 0.13, h - 0.055, hw, hw + 0.052, 0x8f9498); bx(0.4, 0.62, h - 0.085, h - 0.065, hw + 0.018, hw + 0.034, 0x60666a);
        }
        // porte d'issue (o.panic) : barre anti-panique côté poussée (boîtiers d'about, barre ronde à 5,5 cm du vantail) ;
        // la porte s'ouvre vers -z (axe x) ou +x (axe z) quand swing = 1
        const push = o.panic ? (ax ? 1 : -1) * (o.swing || 1) : 0;
        if (push) {
          const f = push * hw, nn = (d0, d1) => push > 0 ? [f + d0, f + d1] : [f - d1, f - d0];
          bx(0.06, 0.16, 0.95, 1.05, ...nn(0, 0.07), 0x9ea3a7); bx(w - 0.17, w - 0.04, 0.93, 1.07, ...nn(0, 0.075), 0x9ea3a7);
          const uc = (0.16 + w - 0.17) / 2, L = w - 0.33, nc = f + push * 0.055;
          kg(k, tpl('dbar', () => latheGeo([[0, -0.5], [0.016, -0.5], [0.016, -0.5], [0.016, 0.5], [0.016, 0.5], [0, 0.5]], 12)), ax ? trs(dU * uc, 1.0, nc, 0, 0, Math.PI / 2, 1, L, 1) : trs(nc, 1.0, dU * uc, Math.PI / 2, 0, 0, 1, L, 1), steel);
        }
        // béquilles inox sur rosaces (vers la charnière), entrée de clé quand la porte a une serrure
        const uh = w - 0.075;
        for (const s of [-1, 1]) {
          if (s === push) continue;
          const f = s * hw;
          kg(k, tpl('rose', () => latheGeo([[0, 0], [0.026, 0], [0.026, 0.004], [0.02, 0.011], [0, 0.012]], 12)), onFace(uh, 1.0, f, s), steel);
          kg(k, tpl('neck', () => latheGeo([[0.009, 0], [0.009, 0.052]], 8)), onFace(uh, 1.0, f, s), steel);
          bx(uh - 0.13, uh + 0.012, 0.989, 1.011, s > 0 ? f + 0.045 : f - 0.063, s > 0 ? f + 0.063 : f - 0.045, steel);
          if (o.lock || o.locked || o.code) { kg(k, tpl('escut', () => latheGeo([[0, 0], [0.019, 0], [0.019, 0.003], [0.015, 0.008], [0, 0.009]], 10)), onFace(uh, 0.88, f, s), steel); bx(uh - 0.0025, uh + 0.0025, 0.872, 0.888, s > 0 ? f + 0.008 : f - 0.0095, s > 0 ? f + 0.0095 : f - 0.008, 0x111111); }
        }
      }
    });
    doorFrame(world, o, w, h);
    this.mesh = new THREE.Mesh(geometry, g.mats.get('props', this.zone));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.pivot.add(this.mesh);
    if (o.mat === 'glass') {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), g.mats.get('glass'));
      if (o.axis === 'x') gl.position.set(-hingeSign * w / 2, h / 2, 0); else { gl.rotation.y = Math.PI / 2; gl.position.set(0, h / 2, -hingeSign * w / 2); }
      this.pivot.add(gl);
    }
    world.zone(o.zone)?.group.add(this.pivot) ?? world.root.add(this.pivot);
    // collision quand fermée (porte vitrée : jusqu'au bout des poignées bâtons)
    const hw = w / 2, ht = o.mat === 'glass' ? 0.095 : 0.08;
    this.col = o.axis === 'x' ? new Box(o.x - hw, o.y, o.z - ht, o.x + hw, o.y + h, o.z + ht, LAYER.DOOR, this) : new Box(o.x - ht, o.y, o.z - hw, o.x + ht, o.y + h, o.z + hw, LAYER.DOOR, this);
    world.physics.add(this.col);
    // vantail ouvert : collision à sa position d'ouverture (on ne traverse plus une porte ouverte)
    this.leafCol = new Box(0, 0, 0, 0, 0, 0, LAYER.DOOR, this); this.leafCol.enabled = false; world.physics.add(this.leafCol);
    this.setPick(this.col.min[0] - 0.05, o.y, this.col.min[2] - 0.05, this.col.max[0] + 0.05, o.y + h, this.col.max[2] + 0.05);
    this.angle = 0; this.target = 0;
    this.init({ open: 0, locked: !!o.locked, padlock: 0, broken: false, oiled: false, sealed: !!o.sealed });
    this.active = true;
    this.creaky = o.creaky ?? (o.mat !== 'glass');
  }
  get lockType() { return this.o.lock || (this.state.locked ? 'keys' : 'none'); }
  gateClosed() { return this.o.gate && !this.world.game.isAreaUnlocked(this.o.gate); }
  prompt(p) {
    const s = this.state;
    if (s.sealed) return this.o.code ? this.name + ' — clavier à code (E)' : this.name + ' — condamnée';
    if (this.o.armored) return this.name + (p.hasItem('keys') || p.hasItem('master_key') ? ' — E : badge (' + (s.open ? 'fermer' : 'ouvrir') + ')' : ' — commandée depuis la console du poste');
    if (this.gateClosed() && !s.open) return this.name + ' — hors de votre secteur cette nuit';
    if (s.padlock) return this.name + ' — cadenassée' + (p.hasItem('keys') || p.hasItem('master_key') ? ' (E : retirer le cadenas)' : '');
    if (s.open) return 'E : Fermer — ' + this.name;
    if (s.locked) {
      if (this.canUnlock(p)) return 'E : Déverrouiller et ouvrir — ' + this.name + '   R : Verrouiller/Déverrouiller';
      if (p.hasItem('lockpick')) return this.name + ' — verrouillée   R : Crocheter';
      if (p.heldDef?.p?.pry) return this.name + ' — verrouillée   R : Forcer au pied-de-biche';
      return this.name + ' — verrouillée';
    }
    return 'E : Ouvrir — ' + this.name + (this.canUnlock(p) ? '   R : Verrouiller' : '');
  }
  canUnlock(p) {
    const lt = this.o.lock || 'keys';
    if (lt === 'master') return p.hasItem('master_key');
    if (lt === 'b13') return p.hasItem('b13_key');
    if (lt === 'shop') return p.hasItem('master_key') || (p.hasItem('keys') && this.world.game.isShopUnlocked(this.o.shop));
    if (lt === 'none') return true;
    return p.hasItem('keys') || p.hasItem('master_key');
  }
  local(verb, p) {
    const s = this.state;
    if (s.sealed && this.o.code && verb === 'use') {
      this.world.game.ui.keypad(this.name, 4, (code) => { if (code) this.world.game.sim.do('door', { id: this.id, verb: 'code', code }); });
      return true;
    }
    if (verb === 'alt' && s.locked && !this.canUnlock(p) && p.hasItem('lockpick') && !s.open) {
      this.world.game.ui.lockpick(2 + (this.o.difficulty || 1), (ok, q) => { this.world.game.sim.do('door', { id: this.id, verb: 'picked', ok, q }); });
      return true;
    }
    return false;
  }
  interact(verb, actor, ctx) {
    const g = this.world.game, s = this.state; const p = g.playerById(actor);
    if (!p) return;
    if (this.o.armored) {
      // lecteur de badge : les clés du gardien ouvrent/ferment la porte (si le poste est alimenté)
      if (verb !== 'use') return;
      if (!(p.hasItem('keys') || p.hasItem('master_key'))) { g.sim.emit('fx', { s: 'error', pos: this.pos.toArray() }); return; }
      if (!g.power.isOn('security')) { g.sim.emit('fx', { s: 'error', pos: this.pos.toArray() }); g.sim.emit('toast', { text: 'Le lecteur de badge est éteint (plus de courant au poste).' }, { to: actor }); return; }
      g.sim.emit('fx', { s: 'beep', pos: this.pos.toArray(), v: 0.6 });
      g.power.set({ doorClosed: !!s.open });
      return;
    }
    if (verb === 'code') {
      if (String(ctx.code) === String(this.o.code)) { this.set({ sealed: false, locked: false, open: 1 }); g.flagSet(this.o.codeFlag || 'b13_opened', true); g.hooks.emit('door_code_ok', this); }
      else g.sim.emit('fx', { s: 'error', pos: this.pos.toArray() });
      return;
    }
    if (verb === 'picked') {
      if (ctx.ok) { this.set({ locked: false }); g.hooks.emit('lockpicked', { door: this, q: ctx.q, actor }); }
      else g.sim.emit('fx', { s: 'lock_pick_fail', pos: this.pos.toArray() });
      return;
    }
    if (s.sealed) { g.sim.emit('fx', { s: 'door_locked', pos: this.pos.toArray() }); return; }
    if (this.gateClosed() && !s.open) { g.sim.emit('fx', { s: 'door_locked', pos: this.pos.toArray() }); g.sim.emit('toast', { text: 'Cette zone n\'est pas sous votre surveillance cette nuit.' }, { to: actor }); return; }
    if (s.padlock) {
      if (p.hasItem('keys') || p.hasItem('master_key')) { this.set({ padlock: 0 }); g.props.giveNew('padlock', actor); g.sim.emit('fx', { s: 'padlock_close', pos: this.pos.toArray() }); }
      else g.sim.emit('fx', { s: 'door_rattle', pos: this.pos.toArray() });
      return;
    }
    if (verb === 'alt') {
      if (s.open) return;
      if (this.canUnlock(p) && !s.broken) { this.set({ locked: !s.locked }); g.sim.emit('fx', { s: s.locked ? 'door_unlock' : 'door_unlock', pos: this.pos.toArray() }); return; }
      if (s.locked && p.heldDef?.p?.pry) { this.set({ locked: false, broken: true }); g.sim.emit('fx', { s: 'metal_screech', pos: this.pos.toArray() }); g.hooks.emit('door_forced', { door: this, actor }); return; }
      return;
    }
    if (s.locked && !s.open) {
      if (this.canUnlock(p)) { this.set({ locked: false, open: 1 }); }
      else g.sim.emit('fx', { s: 'door_locked', pos: this.pos.toArray() });
      return;
    }
    this.set({ open: s.open ? 0 : 1 });
  }
  // utilisé par les présences / l'hôte directement
  forceOpen(v) { if (this.state.open !== v) this.set({ open: v }); }
  onState(patch, isReset) {
    const g = this.world.game;
    if ('open' in patch) {
      this.target = patch.open ? (this.o.swing || 1) * Math.PI / 2 * 0.95 : 0;
      this.col.enabled = !patch.open;
      if (patch.open) this._placeLeaf();
      this.leafCol.enabled = !!patch.open;
      if (!isReset) {
        const pos = this.pos;
        if (patch.open) g.sfx(this.creaky && !this.state.oiled && Math.random() < 0.5 ? 'door_creak' : 'door_open', pos, { volume: 0.8 });
        else g.sfx(this.o.mat === 'metal' ? 'door_slam' : 'door_close', pos, { volume: 0.7 });
      } else { this.angle = this.target; this.pivot.rotation.y = this.angle; }
    }
    if ('padlock' in patch && !isReset && patch.padlock) g.sfx('padlock_close', this.pos);
    if (this.padMesh) this.padMesh.visible = !!this.state.padlock;
    else if (this.state.padlock) this._makePadlock();
  }
  // boîte englobante du vantail à l'angle d'ouverture (épaisseur avec les poignées)
  _placeLeaf() {
    const o = this.o, hs = o.hinge === 'b' ? 1 : -1, dU = -hs, phi = this.target * (o.hinge === 'b' ? -1 : 1), c = Math.cos(phi), s = Math.sin(phi), t = 0.08;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const u of [0, dU * this.w]) for (const n of [-t, t]) {
      const lx = o.axis === 'x' ? u : n, lz = o.axis === 'x' ? n : u, x = this.pivot.position.x + lx * c + lz * s, z = this.pivot.position.z - lx * s + lz * c;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    this.leafCol.set(x0, o.y, z0, x1, o.y + this.h, z1); this.world.physics.update(this.leafCol);
  }
  _makePadlock() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.03), new THREE.MeshStandardMaterial({ color: 0xb8860b, metalness: 0.8, roughness: 0.3 }));
    const c = this.col; m.position.set((c.min[0] + c.max[0]) / 2, this.o.y + 1.0, (c.min[2] + c.max[2]) / 2);
    if (this.o.axis === 'x') m.position.z += 0.1; else m.position.x += 0.1;
    this.world.root.add(m); this.padMesh = m;
  }
  update(dt) {
    if (Math.abs(this.angle - this.target) > 0.001) {
      this.angle += (this.target - this.angle) * Math.min(1, dt * 6);
      this.pivot.rotation.y = this.angle * (this.o.hinge === 'b' ? -1 : 1);
    }
  }
}

// ───────────────────────── RIDEAU MÉTALLIQUE ─────────────────────────
export class Shutter extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'shutter');
    this.o = o; this.zone = o.zone; this.name = 'Rideau métallique' + (o.shopName ? ' — ' + o.shopName : '');
    const g = world.game;
    const w = Math.abs(o.x1 - o.x0), h = o.y1 - o.y0;
    this.h = h;
    // tablier (lames ondulées, UV à l'échelle) et lame finale renforcée
    const gb = new GeoBuilder({ uvScale: 0.3 });
    gb.box(0, 0, 0, w, h, 0.06); gb.box(0, -h / 2 + 0.035, 0, w, 0.07, 0.085);
    const mat = g.mats.get('corrugated', o.zone);
    this.mesh = new THREE.Mesh(gb.build(), mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.cx = (o.x0 + o.x1) / 2;
    this.mesh.position.set(this.cx, o.y0 + h / 2, o.z);
    (world.zone(o.zone)?.group || world.root).add(this.mesh);
    // coffre d'enroulement : dans le lot d'architecture de la zone pendant la construction (pas d'appel de rendu)
    if (w > 0.1) {
      if (world.arch) world.arch.rbox(o.zone, 'chrome', this.cx, o.y1 + 0.175, o.z, w + 0.2, 0.35, 0.4, 0.03);
      else { const box = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.35, 0.4), g.mats.get('metal', o.zone)); box.position.set(this.cx, o.y1 + 0.17, o.z); (world.zone(o.zone)?.group || world.root).add(box); }
    }
    this.col = new Box(o.x0, o.y0, o.z - 0.1, o.x1, o.y1, o.z + 0.1, LAYER.DOOR, this);
    world.physics.add(this.col);
    this.setPick(o.x0, o.y0, o.z - 0.15, o.x1, o.y1, o.z + 0.15);
    this.pos01 = o.closed ? 1 : 0;
    this.init({ target: o.closed ? 1 : 0, locked: !!o.locked });
    this.active = true; this.loop = null;
    this.applyVisual();
  }
  applyVisual() {
    const h = this.h * Math.max(0.03, this.pos01);
    this.mesh.scale.y = Math.max(0.03, this.pos01);
    this.mesh.position.y = this.o.y1 - h / 2;
    this.col.enabled = this.pos01 > 0.55;
    this.col.min[1] = this.o.y1 - h; this.world.physics.update(this.col);
  }
  prompt(p) {
    if (this.state.locked) return this.name + ' — verrouillé (magasin fermé)';
    return (this.state.target > 0.5 ? 'E : Relever' : 'E : Baisser') + ' — ' + this.name;
  }
  interact(verb, actor) {
    const g = this.world.game;
    if (this.state.locked) { g.sim.emit('fx', { s: 'door_rattle', pos: this.pos.toArray() }); return; }
    this.set({ target: this.state.target > 0.5 ? 0 : 1 });
  }
  onState(patch, isReset) {
    if (isReset) { this.pos01 = this.state.target; this.applyVisual(); if (this.loop) { this.loop.stop(); this.loop = null; } }
  }
  update(dt) {
    const t = this.state.target;
    if (Math.abs(this.pos01 - t) > 0.002) {
      const dir = Math.sign(t - this.pos01);
      this.pos01 = Math.max(0, Math.min(1, this.pos01 + dir * dt * 0.35));
      if ((dir > 0 && this.pos01 > t) || (dir < 0 && this.pos01 < t)) this.pos01 = t;
      this.applyVisual();
      if (!this.loop) this.loop = this.world.game.loop('shutter_move', V(this.cx, this.o.y1, this.o.z), { volume: 0.7 });
    } else if (this.loop) { this.loop.stop(0.1); this.loop = null; this.world.game.sfx('shutter_stop', V(this.cx, this.o.y1 - 1, this.o.z)); }
  }
}

// ───────────────────────── VITRE CASSABLE ─────────────────────────
export class GlassPane extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'glass');
    this.o = o; this.zone = o.zone; this.name = o.name || 'Vitre';
    const g = world.game;
    const w = Math.max(o.x1 - o.x0, o.z1 - o.z0), h = o.y1 - o.y0;
    this.alongX = (o.x1 - o.x0) > (o.z1 - o.z0);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), g.mats.get(o.dirty ? 'glass_dirty' : 'glass'));
    this.mesh.position.set((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, (o.z0 + o.z1) / 2);
    if (!this.alongX) this.mesh.rotation.y = Math.PI / 2;
    this.mesh.renderOrder = 2;
    // cadre
    this.shards = null;
    (world.zone(o.zone)?.group || world.root).add(this.mesh);
    const t = 0.04;
    this.col = this.alongX ? new Box(o.x0, o.y0, this.mesh.position.z - t, o.x1, o.y1, this.mesh.position.z + t, LAYER.GLASS, this) : new Box(this.mesh.position.x - t, o.y0, o.z0, this.mesh.position.x + t, o.y1, o.z1, LAYER.GLASS, this);
    world.physics.add(this.col);
    if (o.breakable !== false) this.setPick(this.col.min[0] - 0.02, o.y0, this.col.min[2] - 0.02, this.col.max[0] + 0.02, o.y1, this.col.max[2] + 0.02);
    this.init({ broken: false, taped: false, opened: false });
  }
  prompt(p) {
    if (this.state.broken) return null;
    let t = p.heldDef?.p?.breaks ? 'Clic gauche : Briser la vitre (bruyant !)' : null;
    if (this.o.lockable) {
      if (p.hasItem('master_key')) t = (t ? t + '   ' : '') + 'R : Ouvrir la vitrine (passe-partout)';
      else if (p.hasItem('lockpick')) t = (t ? t + '   ' : '') + 'R : Crocheter la vitrine';
      else t = t || this.name + ' — fermée à clé';
    }
    return t;
  }
  local(verb, p) {
    if (verb === 'alt' && this.o.lockable && !this.state.broken && !p.hasItem('master_key') && p.hasItem('lockpick')) {
      this.world.game.ui.lockpick(3, (ok, q) => { if (ok) this.world.game.sim.do('glass_open', { id: this.id, q }); else this.world.game.sim.do('glass_open', { id: this.id, fail: true }); });
      return true;
    }
    return false;
  }
  interact(verb, actor, ctx) {
    if (verb === 'alt' && this.o.lockable && this.world.game.playerById(actor)?.hasItem('master_key')) this.set({ broken: true, opened: true });
  }
  smash(actor, impulse = 1) {
    if (this.state.broken || this.o.breakable === false) return false;
    this.set({ broken: true });
    this.world.game.hooks.emit('glass_broken', { pane: this, actor, shop: this.o.shop, car: this.o.car });
    return true;
  }
  onState(patch, isReset) {
    this.mesh.visible = !this.state.broken;
    this.col.enabled = !this.state.broken;
    if (this.state.broken && this.state.opened && !isReset) { this.world.game.sfx('lock_open', this.mesh.position); return; }
    if (this.state.broken && !isReset) {
      const g = this.world.game; const p = this.mesh.position;
      g.sfx(this.o.big === false ? 'glass_break' : 'glass_shatter_big', p, { volume: 1 });
      g.particles?.shards(p, this.alongX ? 'z' : 'x', Math.max(this.o.x1 - this.o.x0, this.o.z1 - this.o.z0), this.o.y1 - this.o.y0);
      this._makeShardsOnFloor();
    }
    if (isReset && this.shards) { this.shards.removeFromParent(); this.shards = null; }
  }
  _makeShardsOnFloor() {
    if (this.shards) return;
    const g = this.world.game; const p = this.mesh.position; const geo = new THREE.BufferGeometry(); const pts = [];
    for (let i = 0; i < 40; i++) {
      const x = p.x + (Math.random() - 0.5) * (this.alongX ? (this.o.x1 - this.o.x0) : 1.5), z = p.z + (Math.random() - 0.5) * (this.alongX ? 1.5 : (this.o.z1 - this.o.z0));
      const y = this.o.floorY ?? (this.o.y0 > 1 ? this.o.y0 - 0.9 : 0) + 0.01; const s = 0.03 + Math.random() * 0.06; const a = Math.random() * 6;
      pts.push(x, y, z, x + Math.cos(a) * s, y, z + Math.sin(a) * s, x + Math.cos(a + 2) * s, y, z + Math.sin(a + 2) * s);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.computeVertexNormals();
    this.shards = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xcfe8ef, roughness: 0.05, metalness: 0.5, side: THREE.DoubleSide }));
    (this.world.zone(this.o.zone)?.group || this.world.root).add(this.shards);
  }
}

// ───────────────────────── INTERRUPTEUR D'ÉCLAIRAGE ─────────────────────────
export class LightSwitch extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'switch');
    this.o = o; this.zone = o.zone; this.target = o.target; this.name = 'Interrupteur — ' + (o.label || o.target);
    const g = world.game;
    const { geometry } = quickGeometry(g.atlas, (k) => { // plaque arrondie, bascule inclinée, voyant orange
      kg(k, tpl('sw_plate', () => roundBoxGeo(0.086, 0.086, 0.022, 0.005, 1)), trs(0, 0, 0), 0xf1efea);
      kg(k, tpl('sw_rock', () => roundBoxGeo(0.042, 0.054, 0.012, 0.004, 1)), trs(0, 0, 0.013, -0.12, 0, 0), 0xe4e2dc);
      k.box(0, 0.018, 0.0205, 0.007, 0.003, 0.002, 0xff8a3d);
    });
    this.mesh = new THREE.Mesh(geometry, g.mats.get('props', o.zone));
    this.mesh.position.set(o.x, o.y, o.z); this.mesh.rotation.y = o.ry || 0;
    (world.zone(o.zone)?.group || world.root).add(this.mesh);
    this.setPick(o.x - 0.12, o.y - 0.12, o.z - 0.12, o.x + 0.12, o.y + 0.12, o.z + 0.12);
    this.init({});
  }
  prompt() { const z = this.world.zone(this.target); return 'E : ' + (z?.lit ? 'Éteindre' : 'Allumer') + ' — ' + (this.o.label || z?.name || ''); }
  interact(verb, actor) { this.world.game.lighting.toggle(this.target, actor); this.world.game.sim.emit('fx', { s: 'switch', pos: [this.o.x, this.o.y, this.o.z] }); }
}

// ───────────────────────── PANNEAU LISIBLE / NOTE ─────────────────────────
export class Readable extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'read'); this.o = o; this.name = o.name || 'Panneau'; this.zone = o.zone;
    this.setPick(o.box[0], o.box[1], o.box[2], o.box[3], o.box[4], o.box[5]);
    this.init({});
  }
  prompt() { return 'E : Lire — ' + this.name; }
  local(verb, p) {
    const g = this.world.game;
    const lore = this.o.lore ? LORE[this.o.lore] : null;
    const text = typeof this.o.text === 'function' ? this.o.text() : (this.o.text || lore?.text || '');
    g.ui.showText(this.o.title || lore?.title || this.name, text);
    if (this.o.lore) g.discover('lore', this.o.lore);
    return true;
  }
}

// ───────────────────────── SIÈGE ─────────────────────────
export class Seat extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'seat'); this.o = o; this.name = o.name || 'Siège'; this.zone = o.zone;
    this.setPick(o.x - 0.35, o.y, o.z - 0.35, o.x + 0.35, o.y + 0.9, o.z + 0.35);
    this.init({});
  }
  prompt() { return 'E : S\'asseoir'; }
  local(verb, p) { p.sit(new THREE.Vector3(this.o.x, this.o.y + 0.45, this.o.z), this.o.ry || 0); return true; }
}

// ───────────────────────── CONTENEUR (carton, poubelle, caisse à outils fixe…) ─────────────────────────
export class Container extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'container'); this.o = o; this.name = o.name || 'Conteneur'; this.zone = o.zone;
    if (o.box) this.setPick(...o.box);
    this.init({ contents: o.contents || [], opened: false });
  }
  prompt() { return this.state.contents.length ? 'E : Fouiller — ' + this.name : this.name + ' (vide)'; }
  interact(verb, actor) {
    const g = this.world.game; const c = [...this.state.contents];
    if (!c.length) { g.sim.emit('toast', { text: 'C\'est vide.' }, { to: actor }); return; }
    const item = c.shift();
    this.set({ contents: c, opened: true });
    g.props.giveNew(item, actor);
    g.sim.emit('fx', { s: 'cardboard_drop', pos: this.pos.toArray(), v: 0.4 });
  }
}

// ───────────────────────── CASIER (ouvrable, cachette) ─────────────────────────
export class Locker extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'locker'); this.o = o; this.name = o.name || 'Casier'; this.zone = o.zone;
    const g = world.game; const w = 0.4, h = 1.8, d = 0.5;
    this.group = new THREE.Group(); this.group.position.set(o.x, o.y, o.z); this.group.rotation.y = o.ry || 0;
    const col = o.color || 0x546e7a, dk = 0x2f3a40;
    const { geometry: body } = quickGeometry(g.atlas, (k) => { // caisson (ouvert devant), dessus à rebord, socle sombre, tablette et patère
      k.box(0, h / 2, 0, w, h, d, col, { faces: 'xXyYz' }); k.box(0, h * 0.78, 0, w * 0.96, 0.02, d * 0.9, 0x37474f);
      k.box(0, h + 0.006, -0.005, w + 0.012, 0.012, d + 0.01, dk); k.box(0, 0.04, 0, w + 0.004, 0.08, d - 0.04, 0x1f2427);
      k.box(0, h * 0.72, -d / 2 + 0.06, 0.02, 0.02, 0.08, 0x9ea4a8);
    });
    const bm = new THREE.Mesh(body, g.mats.get('props', o.zone)); bm.castShadow = bm.receiveShadow = true; this.group.add(bm);
    this.doorPivot = new THREE.Group(); this.doorPivot.position.set(-w / 2, 0, d / 2); this.group.add(this.doorPivot);
    const { geometry: door } = quickGeometry(g.atlas, (k) => { // porte : persiennes embouties, poignée à palette, porte-cadenas, paumelles
      k.box(w / 2, h / 2 + 0.04, 0.01, w, h - 0.08, 0.02, col);
      for (const y0 of [h * 0.86, 0.22]) for (let i = 0; i < 5; i++) k.b.box(0, 0, 0, w * 0.62, 0.012, 0.006, { color: dk, flat: true, matrix: trs(w / 2, y0 + i * 0.028, 0.022, -0.5, 0, 0) });
      k.box(w * 0.86, h * 0.52, 0.026, 0.035, 0.12, 0.012, 0x23292c); k.box(w * 0.86, h * 0.53, 0.036, 0.016, 0.07, 0.012, 0xa9afb3); k.box(w * 0.86, h * 0.45, 0.03, 0.02, 0.025, 0.02, 0xa9afb3);
      for (const y of [0.25, h * 0.5, h - 0.25]) k.box(0.004, y, 0.012, 0.012, 0.07, 0.02, 0x7d8387);
      if (o.name) { const r = k.label('lk_' + o.name, o.name, 0xffffff); k.box(w / 2, h * 0.7, 0.022, w * 0.6, 0.06, 0.003, 0xffffff, { label: { face: 'Z', rect: r } }); }
    });
    this.door = new THREE.Mesh(door, g.mats.get('props', o.zone)); this.doorPivot.add(this.door);
    (world.zone(o.zone)?.group || world.root).add(this.group);
    world.physics.add(new Box(o.x - 0.25, o.y, o.z - 0.25, o.x + 0.25, o.y + h, o.z + 0.25, LAYER.FURN));
    this.setPick(o.x - 0.26, o.y, o.z - 0.26, o.x + 0.26, o.y + h, o.z + 0.26);
    this.init({ open: 0, contents: o.contents || [], locked: !!o.locked, hidden: null });
    this.ang = 0; this.active = true;
  }
  prompt(p) {
    if (this.state.hidden && this.state.hidden !== p.id) return null;
    if (this.state.hidden === p.id) return 'E : Sortir du casier';
    if (this.state.locked && !p.hasItem('master_key')) return this.name + ' — fermé à clé' + (p.hasItem('lockpick') ? '   R : Crocheter' : '');
    return (this.state.open ? 'E : Fermer' : 'E : Ouvrir') + (this.state.open && this.state.contents.length ? '   R : Prendre' : '') + (!this.state.open ? '   R : Se cacher dedans' : '');
  }
  local(verb, p) {
    if (verb === 'alt' && this.state.locked && !p.hasItem('master_key') && p.hasItem('lockpick')) {
      this.world.game.ui.lockpick(2, (ok, q) => { if (ok) this.world.game.sim.do('interact', { id: this.id, verb: 'unlock' }); });
      return true;
    }
    return false;
  }
  interact(verb, actor) {
    const g = this.world.game; const s = this.state;
    if (verb === 'unlock') { this.set({ locked: false }); return; }
    if (s.hidden === actor) { this.set({ hidden: null }); g.sim.emit('hide', { id: actor, on: false, obj: this.id }); return; }
    if (s.locked && !g.playerById(actor)?.hasItem('master_key')) { g.sim.emit('fx', { s: 'door_locked', pos: this.pos.toArray() }); return; }
    if (verb === 'alt') {
      if (s.open && s.contents.length) { const c = [...s.contents]; const it = c.shift(); this.set({ contents: c }); g.props.giveNew(it, actor); return; }
      if (!s.open && !s.hidden) { this.set({ hidden: actor }); g.sim.emit('hide', { id: actor, on: true, obj: this.id, pos: [this.o.x, this.o.y, this.o.z], ry: this.o.ry || 0 }); return; }
    }
    this.set({ open: s.open ? 0 : 1 });
  }
  onState(patch, isReset) {
    if ('open' in patch && !isReset) this.world.game.sfx(patch.open ? 'cabinet_open' : 'cabinet_close', this.pos, { volume: 0.7 });
    if (isReset) { this.ang = 0; this.doorPivot.rotation.y = 0; }
  }
  update(dt) {
    const t = this.state.open ? -1.9 : 0;
    if (Math.abs(this.ang - t) > 0.001) { this.ang += (t - this.ang) * Math.min(1, dt * 8); this.doorPivot.rotation.y = this.ang; }
  }
}

// ───────────────────────── GRILLE D'AÉRATION (entrée de conduit) ─────────────────────────
export class VentGrate extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'grate'); this.o = o; this.zone = o.zone; this.name = 'Grille d\'aération';
    const g = world.game;
    // cadre à quatre profils, lames inclinées, vis aux angles : une seule géométrie (un seul appel de rendu)
    const W = o.w || 0.9, D = o.d || 0.9, fr = 0.05, gb = new GeoBuilder({ uvScale: 1 });
    gb.box(0, 0, -D / 2 + fr / 2, W, 0.04, fr); gb.box(0, 0, D / 2 - fr / 2, W, 0.04, fr);
    gb.box(-W / 2 + fr / 2, 0, 0, fr, 0.04, D - 2 * fr); gb.box(W / 2 - fr / 2, 0, 0, fr, 0.04, D - 2 * fr);
    const nl = Math.round((D - 2 * fr) / 0.055);
    for (let i = 0; i < nl; i++) gb.box(0, 0, 0, W - 2 * fr, 0.004, 0.062, { matrix: trs(0, -0.004, -D / 2 + fr + (i + 0.5) * (D - 2 * fr) / nl, 0.75, 0, 0) });
    const screw = tpl('screw', () => latheGeo([[0, 0], [0.008, 0], [0.007, 0.003], [0.004, 0.005], [0, 0.0055]], 8));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.geometry(screw, trs(sx * (W / 2 - fr / 2), -0.02, sz * (D / 2 - fr / 2), Math.PI, 0, 0), { flat: false });
    this.mesh = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.4 }));
    this.mesh.position.set(o.x, o.y, o.z);
    if (o.wall) { this.mesh.rotation.x = Math.PI / 2; }
    (world.zone(o.zone)?.group || world.root).add(this.mesh);
    this.setPick(o.x - 0.5, o.y - 0.3, o.z - 0.5, o.x + 0.5, o.y + 0.1, o.z + 0.5);
    this.init({ open: false, screws: 4, taped: false });
  }
  hatchClosed() { return this.o.security && this.world.game.power.state.hatchClosed; }
  prompt(p) {
    if (this.hatchClosed()) return 'Trappe blindée fermée (commande au poste de sécurité)';
    if (this.state.taped) return 'Grille scellée au scotch' + (p.isInVent ? '' : '   R : Retirer le scotch');
    if (this.state.open) return p.isInVent ? 'E : Sortir du conduit' : 'E : Entrer dans le conduit' + (p.isHigh ? '' : ' (il faut monter dessus : escabeau, cartons…)');
    if (p.heldDef?.p?.tool === 'screw') return 'Clic gauche / E : Dévisser la grille';
    if (p.heldDef?.use === 'tape') return 'Clic gauche : Sceller la grille au scotch';
    return 'Grille vissée (il faut un tournevis)';
  }
  interact(verb, actor, ctx) {
    const g = this.world.game; const p = g.playerById(actor); const s = this.state;
    if (this.hatchClosed()) { g.sim.emit('fx', { s: 'vent_bang', pos: [this.o.x, this.o.y, this.o.z], v: 0.5 }); return; }
    if (s.taped) { if (verb === 'alt') this.set({ taped: false }); return; }
    if (!s.open) {
      if (p?.heldDef?.p?.tool === 'screw' || verb === 'unscrew') { this.set({ open: true }); g.sim.emit('fx', { s: 'vent_grate', pos: [this.o.x, this.o.y, this.o.z] }); }
      return;
    }
    g.sim.emit('vent', { id: actor, grate: this.id, enter: !ctx?.inVent }, { to: actor });
  }
  onState(patch, isReset) {
    this.mesh.visible = !this.state.open;
    if (this.state.taped) this.mesh.material.color.set(0x8a8a8a); else this.mesh.material.color.set(0x9aa0a6);
    if ('open' in patch && patch.open && !isReset) {
      // la grille tombe
      const g = this.world.game; g.sfx('vent_grate', new THREE.Vector3(this.o.x, this.o.y, this.o.z));
    }
  }
}

// ───────────────────────── CACHETTE (tente, cabine d'essayage) ─────────────────────────
export class HideSpot extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'hide'); this.o = o; this.zone = o.zone; this.name = o.name || 'Cachette';
    this.setPick(...o.box);
    this.init({ hidden: null });
  }
  prompt(p) { if (this.state.hidden === p.id) return 'E : Sortir'; if (this.state.hidden) return null; return 'E : Se cacher — ' + this.name; }
  interact(verb, actor) {
    const g = this.world.game;
    if (this.state.hidden === actor) { this.set({ hidden: null }); g.sim.emit('hide', { id: actor, on: false, obj: this.id }); return; }
    if (this.state.hidden) return;
    this.set({ hidden: actor });
    g.sim.emit('hide', { id: actor, on: true, obj: this.id, pos: this.o.pos, ry: this.o.ry || 0 });
  }
}

// ───────────────────────── BOUTON-POUSSOIR (arrêt d'urgence…) ─────────────────────────
// o : { zone, x, y, z, ry, label, press(game, actor, bouton), color, plate } — press est exécuté par l'hôte.
export class PushButton extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'button'); this.o = o; this.zone = o.zone; this.name = o.label;
    // boîtier jaune arrondi, collerette noire, champignon rouge, bandeau « ARRÊT » : un seul mesh (couleurs par sommet)
    const { geometry } = quickGeometry(world.game.atlas, (k) => {
      kg(k, tpl('pb_box', () => roundBoxGeo(0.13, 0.17, 0.03, 0.01, 1)), trs(0, 0, 0), o.plate ?? 0xffd600);
      kg(k, tpl('pb_ring', () => latheGeo([[0, 0], [0.047, 0], [0.047, 0.01], [0.041, 0.015], [0, 0.015]], 16)), trs(0, 0.012, 0.015, Math.PI / 2, 0, 0), 0x1a1a1a);
      kg(k, tpl('pb_cap', () => latheGeo([[0, 0], [0.024, 0], [0.024, 0.012], [0.038, 0.016], [0.039, 0.026], [0.03, 0.035], [0, 0.038]], 16)), trs(0, 0.012, 0.03, Math.PI / 2, 0, 0), o.color ?? 0xd50000);
      const r = k.shared('pb_arret', 72, 22, { kind: 'plain', bg: 0x1a1a1a, brand: 'ARRÊT', fg: 0xffffff }); k.box(0, -0.06, 0.0155, 0.09, 0.026, 0.002, 0xffffff, { label: { face: 'Z', rect: r } });
    });
    const grp = new THREE.Mesh(geometry, world.game.mats.get('props', o.zone)); grp.position.set(o.x, o.y, o.z); grp.rotation.y = o.ry || 0; grp.castShadow = true;
    (world.zone(o.zone)?.group || world.root).add(grp);
    this.setPick(o.x - 0.11, o.y - 0.11, o.z - 0.11, o.x + 0.11, o.y + 0.11, o.z + 0.11);
  }
  prompt() { return 'E : ' + this.name; }
  interact(verb, actor) { if (verb === 'use' && this.o.press) this.o.press(this.world.game, actor, this); }
}
