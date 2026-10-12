// Bornes de ronde (« pointeaux ») : petits lecteurs de badge vissés sur un mur ou un pilier, E : « Pointer ». Les quêtes
// (js/game/quests.js) en font des rondes. Construites une fois le centre bâti (sans toucher aux constructeurs du monde) :
// chaque borne cherche, près de son point de référence, une portion de mur dégagée (ni meuble, ni article, ni appareil
// devant). Coût de rendu : un mesh par zone pour les boîtiers (matériau d'objets de la zone, donc son éclairage), un seul
// mesh pour toutes les étiquettes « RONDE 07 » et une seule InstancedMesh pour les témoins lumineux (orange : à pointer,
// vert : pointée, rouge sombre : au repos ; couleurs fixées par quests.js).
import * as THREE from 'three';
import { WorldObject } from './world.js';
import { Box, LAYER } from '../engine/physics.js';
import { GeoBuilder, roundBoxGeo, latheGeo, trs } from '../engine/geo.js';
import { patchZone } from '../engine/materials.js';
import { CHECKPOINTS } from '../data/quests.js';

const H = 1.35;      // hauteur du lecteur au-dessus du sol
const GAP = 0.016;   // décollement du mur (plinthes, boiseries, faïence)

// Points de référence : p = point dans la pièce devant le mur, d = direction du mur (la borne regarde vers -d),
// span = intervalle de recherche le long du mur (m)
function specs(world) {
  const S = world.shops || {};
  const shop = (id, back = false) => {
    const c = S[id]; if (!c) return null;
    if (back) return { p: [c.x0 + 3.1, c.y, c.zB - c.sg * 0.9], d: [0, c.sg], span: [-1.2, 3.6] };   // réserve : mur du fond, près de la porte de service
    return { p: [c.x1 - 3.0, c.y, c.zP - c.sg * 0.9], d: [0, c.sg], span: [-3.6, 0.9] };             // magasin : cloison de la réserve, à gauche de la porte « PRIVÉ »
  };
  return {
    poste: { p: [-67.2, 0, 1.45], d: [1, 0], span: [-0.5, 0.5] },
    vestiaire: { p: [-68.6, 0, 12.0], d: [0, 1], span: [-1.5, 1.5] },
    galerie_o: { p: [-48, 0, -5.4], d: [0, 1], span: [0, 0] },        // face sud de la colonne (-48, -4,4)
    galerie_e: { p: [48, 0, 5.4], d: [0, -1], span: [0, 0] },         // face nord de la colonne (48, 4,4)
    hall: { p: [71, 0, 7.0], d: [0, 1], span: [-2, 2] },
    jouets: shop('jouets'), hyper: shop('hyper'), hyper_reserve: shop('hyper', true), electro: shop('electro'),
    pixel: shop('pixel'), videoclub: shop('videoclub'), bijouterie: shop('bijouterie'), mode: shop('mode'),
    service_n: { p: [-45, 0, 24.2], d: [0, 1], span: [-4, 4] },
    service_s: { p: [10, 0, -24.2], d: [0, -1], span: [-4, 4] },
    galerie1_o: { p: [-48, 5, 5.4], d: [0, -1], span: [0, 0] },       // colonnes de l'étage : face côté coursive
    galerie1_e: { p: [48, 5, -5.4], d: [0, 1], span: [0, 0] },
    parking_est: { p: [55.4, -4.5, 0], d: [-1, 0], span: [0, 0] },   // piliers du parking
    parking_rampe: { p: [64.6, -4.5, -10.5], d: [1, 0], span: [-2, 1.5] },
    parking_ouest: { p: [-43.4, -4.5, 0], d: [1, 0], span: [0, 0] },
    soussol: { p: [-78.8, -4.5, 4], d: [-1, 0], span: [-3, 3] },
    groupe: { p: [-67.4, -4.5, -15.5], d: [1, 0], span: [-2, 2] },
    electrique: { p: [-67.4, -4.5, -6], d: [1, 0], span: [-2, 2] },
    regie: { p: [-67.4, -4.5, 2.5], d: [1, 0], span: [-1.5, 2] },
    toit: { p: [-77.6, 10.5, 15.2], d: [1, 0], span: [-1.5, 1.5] },   // cage de l'escalier ouest, côté toit
    entrepot: { p: [-81.8, 0, -8.6], d: [1, 0], span: [-1.5, 2.5] },
  };
}

// La portion de mur devant la borne est-elle dégagée ? (meubles, murs, portes, vitres ; boîtes de visée des objets)
function clear(world, c, along) {
  const y0 = c.y - 0.75, y1 = c.y + 0.55;
  const box = (d0, d1, w) => {
    const a = [c.x + c.nx * d0, c.z + c.nz * d0], b = [c.x + c.nx * d1, c.z + c.nz * d1];
    let x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
    if (along[0]) { x0 = c.x - w; x1 = c.x + w; } else { z0 = c.z - w; z1 = c.z + w; }
    return [x0, z0, x1, z1];
  };
  const hits = (list, r, ya, yb) => list.some(b => b.data?.kind !== 'ronde' && b.max[0] > r[0] && b.min[0] < r[2] && b.max[2] > r[1] && b.min[2] < r[3] && b.max[1] > ya && b.min[1] < yb);
  const R = box(0.03, 0.8, 0.32);
  if (hits(world.physics.near(R[0], R[1], R[2], R[3], LAYER.FURN | LAYER.WALL | LAYER.DOOR | LAYER.GLASS), R, y0, y1)) return false;
  if (hits(world.pick.near(R[0], R[1], R[2], R[3], LAYER.PROP), R, y0, y1)) return false;
  const Q = box(0.0, 0.45, 0.2);
  if (hits(world.pick.near(Q[0], Q[1], Q[2], Q[3], LAYER.ALL), Q, c.y - 0.3, c.y + 0.3)) return false;
  return true;
}
// Emplacement : rayon vers le mur depuis le point de référence (décalé le long du mur jusqu'à trouver de la place)
function locate(world, sp) {
  const [px, py, pz] = sp.p, [dx, dz] = sp.d, y = py + H, along = dz ? [1, 0] : [0, 1];
  const [lo, hi] = sp.span || [-2, 2];
  const offs = [0]; for (let k = 1; k <= 10; k++) offs.push(k * 0.4, -k * 0.4);
  let first = null;
  for (const o of offs) {
    if (o < lo - 1e-6 || o > hi + 1e-6) continue;
    const sx = px + along[0] * o, sz = pz + along[1] * o;
    const hit = world.physics.raycast(sx, y, sz, dx, 0, dz, 3.5, LAYER.WALL);
    if (!hit) continue;
    // assez de mur au-dessus et au-dessous du lecteur
    const up = world.physics.raycast(sx, y + 0.12, sz, dx, 0, dz, 3.5, LAYER.WALL), dn = world.physics.raycast(sx, y - 0.12, sz, dx, 0, dz, 3.5, LAYER.WALL);
    if (!up || !dn || Math.abs(up.t - hit.t) > 0.03 || Math.abs(dn.t - hit.t) > 0.03) continue;
    const c = { x: sx + dx * (hit.t - GAP), y, z: sz + dz * (hit.t - GAP), nx: -dx, nz: -dz, floor: py };
    if (!first) first = c;
    if (clear(world, c, along)) return c;
  }
  return first || { x: px, y, z: pz, nx: -dx, nz: -dz, floor: py, post: true };
}

export class RondeReader extends WorldObject {
  constructor(world, id, o) {
    super(world, 'ronde:' + id, 'ronde');
    this.cp = id; this.o = o; this.num = o.num; this.zone = o.zone; this.name = 'Borne de ronde — ' + o.name;
    this.center = new THREE.Vector3(o.c.x, o.c.y, o.c.z);
    const c = o.c, ex = Math.abs(c.nz) > 0.5 ? 0.075 : 0.035, ez = Math.abs(c.nz) > 0.5 ? 0.035 : 0.075;
    this.setPick(c.x + c.nx * 0.025 - ex, c.y - 0.11, c.z + c.nz * 0.025 - ez, c.x + c.nx * 0.025 + ex, c.y + 0.11, c.z + c.nz * 0.025 + ez);
    this.init({});
  }
  get pos() { return this.center.clone(); }
  prompt() {
    const st = this.world.game.quests?.readerStatus(this.cp), n = String(this.num).padStart(2, '0');
    if (st === 'done') return 'Borne de ronde n°' + n + ' « ' + this.o.name + ' » — pointée ✓';
    return 'E : Pointer — borne de ronde n°' + n + ' « ' + this.o.name + ' »';
  }
  interact(verb, actor) { if (verb === 'use') this.world.game.quests?.punch(this.cp, actor); }
}

// Étiquettes : une rangée par borne dans une petite texture (jaune, « RONDE 07 » + le lieu)
function labelTexture(list) {
  const W = 256, Hh = 64, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh * list.length;
  const x = cv.getContext('2d');
  list.forEach((r, i) => {
    const y = i * Hh;
    x.fillStyle = '#f2c200'; x.fillRect(0, y, W, Hh);
    x.fillStyle = '#16181a'; x.fillRect(0, y, W, 4); x.fillRect(0, y + Hh - 4, W, 4);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 30px Arial, sans-serif'; x.fillText('RONDE ' + String(r.num).padStart(2, '0'), W / 2, y + 24);
    x.font = '15px Arial, sans-serif'; let name = r.name.toUpperCase(); while (x.measureText(name).width > W - 16 && name.length > 4) name = name.slice(0, -2) + '…';
    x.fillText(name, W / 2, y + 48);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

export function buildCheckpoints(world) {
  if (world.checkpoints) return world.checkpoints;
  const g = world.game, sp = specs(world), out = {}, order = [], placed = [];
  Object.entries(CHECKPOINTS).forEach(([id, def], i) => {
    const s = sp[id]; if (!s || !world.zone(def.zone)) return;
    placed.push({ id, def, num: i + 1, c: locate(world, s) });
  });
  if (!placed.length) { world.checkpoints = out; return out; }
  // boîtiers : plaque arrondie, corps, plage de lecture cerclée, voyant ; fusionnés par zone
  const bodies = new Map(), white = g.atlas.white();
  const plate = roundBoxGeo(0.12, 0.18, 0.012, 0.006, 1), body = roundBoxGeo(0.094, 0.112, 0.026, 0.008, 1), screw = latheGeo([[0, 0], [0.006, 0], [0.005, 0.002], [0, 0.003]], 8);
  const pad = latheGeo([[0, 0], [0.029, 0], [0.029, 0.002], [0, 0.003]], 18), ring = latheGeo([[0.028, 0], [0.033, 0], [0.033, 0.003], [0.028, 0.003]], 18), bezel = latheGeo([[0.006, 0], [0.01, 0], [0.01, 0.002], [0.006, 0.002]], 10);
  const lab = new GeoBuilder({ uvScale: 1 }), labTex = labelTexture(placed.map(r => ({ num: r.num, name: r.def.name }))), n = placed.length;
  const leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0065, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
  leds.frustumCulled = false; leds.castShadow = false; leds.name = 'checkpoint_leds';
  const red = new THREE.Color(0.45, 0.03, 0.02), M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  placed.forEach((r, i) => {
    const c = r.c, ry = Math.atan2(c.nx, c.nz);
    q.setFromAxisAngle(up, ry);
    const base = new THREE.Matrix4().compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(1, 1, 1));
    const L = (m) => base.clone().multiply(m);
    let b = bodies.get(r.def.zone); if (!b) { b = new GeoBuilder({ colors: true, white }); bodies.set(r.def.zone, b); }
    b.geometry(plate, L(trs(0, 0, 0.006)), { color: 0x2b3036 });
    b.geometry(body, L(trs(0, -0.024, 0.025)), { color: 0x454d56 });
    for (const sy of [-0.078, 0.078]) b.geometry(screw, L(trs(0, sy, 0.012, Math.PI / 2, 0, 0)), { color: 0x9aa0a6 });
    b.geometry(ring, L(trs(0, -0.032, 0.038, Math.PI / 2, 0, 0)), { color: 0x8e959c });
    b.geometry(pad, L(trs(0, -0.032, 0.038, Math.PI / 2, 0, 0)), { color: 0x15181b });
    b.geometry(bezel, L(trs(0.032, 0.018, 0.038, Math.PI / 2, 0, 0)), { color: 0x111315 });
    if (c.post) { // pas de mur : borne sur pied (poteau jusqu'au sol)
      const h = c.y - c.floor - 0.09;
      b.geometry(roundBoxGeo(0.05, h, 0.05, 0.01, 1), L(trs(0, -0.09 - h / 2, -0.03)), { color: 0x23272b });
      b.geometry(roundBoxGeo(0.22, 0.02, 0.22, 0.008, 1), L(trs(0, -(c.y - c.floor) + 0.01, -0.03)), { color: 0x23272b });
      world.physics.add(new Box(c.x - 0.06, c.floor, c.z - 0.06, c.x + 0.06, c.y, c.z + 0.06, LAYER.FURN));
    }
    // étiquette (rangée i de la texture)
    const v0 = 1 - (i + 1) / n, v1 = 1 - i / n;
    lab.box(0, 0.064, 0.0125, 0.1, 0.025, 0.0004, { faces: 'Z', matrix: base, rect: { u0: 0, v0, u1: 1, v1 } });
    // témoin
    v.set(0.032, 0.018, 0.0405).applyMatrix4(base); M.makeTranslation(v.x, v.y, v.z); leds.setMatrixAt(i, M); leds.setColorAt(i, red);
    const rd = new RondeReader(world, r.id, { name: r.def.name, zone: r.def.zone, num: r.num, c });
    world.add(rd); out[r.id] = rd; order.push(r.id);
  });
  for (const [zone, b] of bodies) {
    const mesh = new THREE.Mesh(b.build(), g.mats.get('props', zone)); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'checkpoints:' + zone;
    (world.zone(zone)?.group || world.root).add(mesh);
  }
  const lm = new THREE.Mesh(lab.build(), patchZone(new THREE.MeshStandardMaterial({ map: labTex, roughness: 0.55, metalness: 0 }), g.mats.zoneUniform(null)));
  lm.name = 'checkpoint_labels'; lm.frustumCulled = false; lm.receiveShadow = false; lm.castShadow = false;
  world.root.add(lm); world.root.add(leds);
  leds.instanceMatrix.needsUpdate = true; if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
  world.checkpoints = out; world.checkpointOrder = order; world.checkpointLeds = leds;
  return out;
}
