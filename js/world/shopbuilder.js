// Construction des magasins : coque (murs, vitrines, rideau, enseigne, réserve, plafonds), mobilier selon le type
// d'aménagement, placement déterministe de tous les articles et appareils, caméras et navigation.
import * as THREE from 'three';
import { SHOPS, SLOT_W, GALLERY_X0 } from '../data/shops.js';
import { ITEMS } from '../data/items.js';
import { Zone } from './world.js';
import { Box, LAYER } from '../engine/physics.js';
import { Door, Shutter, GlassPane, LightSwitch, HideSpot, Container, Seat } from './fixtures.js';
import { signTexture } from '../engine/textures.js';
import { stockShop } from './stocking.js';
import { labelShop } from './shelflabels.js';
import { buildShopFront } from './shopfront.js';
import { installInteriorMaterials, designFor, finishShop, INTERIOR_LAYOUTS } from './interiors.js';

export function shopX(s) { const x0 = GALLERY_X0 + s.slot * SLOT_W; return { x0, x1: x0 + s.w * SLOT_W }; }
export function ventXForShop(s) { return shopX(s).x0 + 9; }

export const FLOORS = {
  hyper: 'tile_e8e4dc_8a857c_4', jouets: 'tile_f4e3b8_b89a5e_8', electro: 'tile_dfe3e6_9aa3a8_4', pixel: 'carpet_2a1f4a', videoclub: 'checker',
  cafe: 'wood_floor', boulangerie: 'tile_e9d8bc_9c8460_8', librairie: 'wood_floor', mode: 'wood_dark', chaussures: 'carpet_6a4a5a', sport: 'tile_d0d6dc_8a9096_4',
  instruments: 'wood_floor', costumes: 'carpet_3a1f5a', coiffeur: 'checker', photo: 'tile_eeeeee_999999_4', deco: 'wood_dark', arcade: 'carpet_1a1030',
  pizzeria: 'tile_e8d8c0_8d6e4e_8', burger: 'checker', sushi: 'wood_dark', cinema: 'carpet_4a1420', glacier: 'tile_e8f4fa_9ab8c8_8', bonbons: 'tile_fde4ef_d896b4_8',
  octet: 'tile_dfe6e6_8aa0a0_4', direction: 'carpet_3b3b48', staff: 'lino', toilettes: 'toilet_tiles', bijouterie: 'carpet_2b2b38', pharma: 'tile_eef6f0_9ab8a4_4',
  fleuriste: 'tile_e6e0d0_8a8070_8', quincaillerie: 'concrete_floor', animalerie: 'tile_e6eef0_9aa8ac_4', tabac: 'tile_e0d6c8_8a7e6e_4', mobizone: 'tile_e8eef2_9aa4ac_4',
  opticien: 'tile_f0f4f8_a0aab4_4', parfumerie: 'tile_f4eef4_b4a0b4_8',
};

function hex6(c) { return c.toString(16).padStart(6, '0'); }
function tint(c, k = 0.22, base = 0xece7dc) {
  const r = ((base >> 16) & 255) * (1 - k) + ((c >> 16) & 255) * k, g = ((base >> 8) & 255) * (1 - k) + ((c >> 8) & 255) * k, b = (base & 255) * (1 - k) + (c & 255) * k;
  return hex6(((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff));
}

// Catégorie de placement des appareils fixes
const PLACE = {
  tv: 'wallHigh', mirror_wall: 'wallHigh', notice_board: 'wallHigh', eye_chart: 'wallHigh', hand_dryer: 'wallHigh', mirror_deco: 'wallHigh',
  washer: 'wallFloor', dishwasher: 'wallFloor', fridge: 'wallFloor', freezer: 'wallFloor', vending: 'wallFloor', locker: 'wallFloor', photobooth: 'wallFloor',
  piano: 'wallFloor', organ: 'wallFloor', sink: 'wallFloor', fryer: 'wallFloor', pizza_oven: 'wallFloor', aquarium: 'wallFloor', terrarium: 'wallFloor', pc_tower: 'counter',
  register: 'register', microwave: 'counter', oven: 'counter', coffee_maker: 'counter', turntable: 'counter', vcr: 'counter', console_station: 'counter', crt_tv: 'counter',
  printer: 'counter', rice_cooker: 'counter', soda_fountain: 'counter', desk_phone: 'counter', conveyor: 'special', projector: 'special', popcorn_machine: 'floor',
  safe: 'back', toilet: 'special', massage_chair: 'floor', office_chair: 'floor',
};

export function buildShops(world, A, dev, rngRoot) {
  const g = world.game;
  installInteriorMaterials(g.mats);
  world.shops = {};
  world.shopNavHooks = world.shopNavHooks || [];
  // murs mitoyens (une seule fois par limite d'emplacement)
  for (const floor of [0, 1]) for (const side of ['N', 'S']) {
    const y = floor ? 5 : 0, top = floor ? 10 : 4.6; const sg = side === 'N' ? 1 : -1;
    const row = SHOPS.filter(s => s.floor === floor && s.side === side);
    for (let k = 0; k <= 11; k++) {
      const x = GALLERY_X0 + k * SLOT_W;
      if (row.some(s => k > s.slot && k < s.slot + s.w)) continue;
      const zone = (row.find(s => s.slot === k) || row.find(s => s.slot + s.w === k))?.id;
      A.wallZ(zone, 'plaster_e6e1d6', sg * 8, sg * 22, x, y, top, 0.3);
    }
  }
  for (const s of SHOPS) buildShop(world, A, dev, s, rngRoot.fork(s.id));
}

function buildShop(world, A, dev, s, rng) {
  const g = world.game;
  const { x0, x1 } = shopX(s);
  const W = x1 - x0, cx = (x0 + x1) / 2;
  const sg = s.side === 'N' ? 1 : -1;
  const y = s.floor ? 5 : 0, top = s.floor ? 10 : 4.6;
  const zF = sg * 8, zP = sg * 18, zB = sg * 22;
  const cinema = s.layout === 'cinema';
  const ceilS = y + 4.0, ceilB = s.floor ? y + 3.6 : 3.4;
  const id = s.id, idB = s.id + '_back';
  const design = designFor(s);
  const circuit = s.id === 'electro' ? 'electro' : (s.floor ? 'shops1' : 'shops0');
  const zone = world.addZone(new Zone(id, s.name, s.zone || (cinema ? 'atrium' : 'shop'), s.floor, x0, y, Math.min(zF, cinema ? zB : zP), x1, top, Math.max(zF, cinema ? zB : zP), { shop: id, circuit, area: id, lightColor: design.light || [1, 0.96, 0.88], lightLevel: design.level ?? (s.zone === 'bigstore' ? 0.7 : 0.6) }));
  const back = cinema ? null : world.addZone(new Zone(idB, 'Réserve — ' + s.name, 'backroom', s.floor, x0, y, Math.min(zP, zB), x1, top, Math.max(zP, zB), { shop: id, circuit, area: id }));
  const ctl = { shop: s, zone, back, x0, x1, sg, y, zF, zP, zB, glass: [], registers: [], devices: [], cams: [], ceil: (cinema ? top - 0.4 : ceilS) - y };
  world.shops[id] = ctl;

  // local → monde
  const X = (u) => x0 + u, Zc = (v) => zF + sg * v;
  const faceFront = sg > 0 ? Math.PI : 0, faceIn = sg > 0 ? 0 : Math.PI;
  const wallMat = 'plaster_' + tint(s.color, 0.18);

  // ── sols / plafonds ──
  A.floor(id, design.floor || FLOORS[id] || 'tile_e8e4dc_8a857c_4', x0, Math.min(zF, cinema ? zB : zP), x1, Math.max(zF, cinema ? zB : zP), y, s.floor ? 0.4 : 0.6, { faces: 'Y' });
  if (back) A.floor(idB, 'lino', x0, Math.min(zP, zB), x1, Math.max(zP, zB), y, s.floor ? 0.4 : 0.6, { faces: 'Y' });
  A.ceiling(id, design.ceiling || 'ceiling', x0, Math.min(zF, cinema ? zB : zP), x1, Math.max(zF, cinema ? zB : zP), cinema ? top - 0.4 : ceilS, 0.05, { collide: false });
  if (back) {
    const vx = ventXForShop(s);
    if (!s.floor) {
      const h0 = sg < 0 ? -21.2 : 20.2, h1 = h0 + 1;
      const zl = Math.min(zP, zB), zh = Math.max(zP, zB);
      A.ceiling(idB, 'concrete', x0, zl, vx - 0.5, zh, ceilB, 0.05, { collide: false });
      A.ceiling(idB, 'concrete', vx + 0.5, zl, x1, zh, ceilB, 0.05, { collide: false });
      A.ceiling(idB, 'concrete', vx - 0.5, zl, vx + 0.5, h0, ceilB, 0.05, { collide: false });
      A.ceiling(idB, 'concrete', vx - 0.5, h1, vx + 0.5, zh, ceilB, 0.05, { collide: false });
    } else A.ceiling(idB, 'concrete', x0, Math.min(zP, zB), x1, Math.max(zP, zB), ceilB, 0.05, { collide: false });
  }

  // ── cloison réserve / mur du fond ──
  const rearX = x0 + 1.6, partX = x1 - 1.6;
  if (!cinema) A.wallX(id, wallMat, x0 + 0.15, x1 - 0.15, zP, y, top, 0.2, [{ a: partX - 0.55, b: partX + 0.55, y0: y, y1: y + 2.15 }]);
  const backOps = [{ a: rearX - 0.55, b: rearX + 0.55, y0: y, y1: y + 2.15 }];
  if (!s.floor) { const vx = ventXForShop(s); backOps.push({ a: vx - 0.55, b: vx + 0.55, y0: 3.5, y1: 4.5 }); }
  A.wallX(back ? idB : id, 'block', x0 + 0.15, x1 - 0.15, zB, y, top, 0.2, backOps);

  // ── façade ──
  const ew = s.noShutter ? 1.2 : (s.w === 1 ? 4 : 6);
  const ex0 = cx - ew / 2, ex1 = cx + ew / 2;
  const frontTop = y + 3.2;
  const galleryZone = s.floor ? (cx < -24 ? 'gallery1_w' : cx > 24 ? 'gallery1_e' : 'atrium') : (cx < -24 ? 'gallery0_w' : cx > 24 ? 'gallery0_e' : 'atrium');
  if (s.noShutter) {
    A.wallX(id, 'plaster_' + tint(s.color, 0.1), x0 + 0.15, x1 - 0.15, zF, y, top, 0.3, [{ a: ex0, b: ex1, y0: y, y1: y + 2.2 }]);
    const d = new Door(world, world.newId('door'), { zone: id, x: cx, y, z: zF, axis: 'x', width: ew, mat: 'wood', lock: s.door === 'locked' ? 'keys' : s.door === 'keys' ? 'keys' : 'none', locked: s.door !== 'open', name: s.name, swing: sg, window: s.door === 'open', label: s.id === 'toilettes' ? 'WC' : null, shop: id });
    world.add(d); ctl.frontDoor = d;
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), new THREE.MeshBasicMaterial({ map: signTexture(s.name, s.color, { h: 100, fontSize: 56, font: 'Arial' }) }));
    plq.position.set(cx, y + 2.6, zF - sg * 0.16); plq.rotation.y = faceFront; world.zone(galleryZone).group.add(plq); zone.signMats.push(plq.material);
  } else {
    // allège + vitres + imposte + bandeau
    A.box(id, 'chrome', x0 + 0.15, y, zF - 0.12, ex0, y + 0.15, zF + 0.12);
    A.box(id, 'chrome', ex1, y, zF - 0.12, x1 - 0.15, y + 0.15, zF + 0.12);
    A.box(id, 'chrome', x0 + 0.15, frontTop, zF - 0.12, x1 - 0.15, frontTop + 0.2, zF + 0.12);
    A.box(galleryZone, 'plaster_' + tint(s.color, 0.35, 0x2a2a30), x0 + 0.15, frontTop + 0.2, zF - 0.15, x1 - 0.15, top, zF + 0.15);
    for (const [a, b] of [[x0 + 0.15, ex0], [ex1, x1 - 0.15]]) {
      const n = Math.max(1, Math.round((b - a) / 2.5)); const step = (b - a) / n;
      for (let i = 0; i < n; i++) {
        const gp = new GlassPane(world, world.newId('glass'), { zone: id, x0: a + i * step + 0.03, x1: a + (i + 1) * step - 0.03, z0: zF, z1: zF, y0: y + 0.15, y1: frontTop, shop: id, name: 'Vitrine — ' + s.name, floorY: y + 0.01 });
        world.add(gp); ctl.glass.push(gp);
        A.box(id, 'chrome', a + (i + 1) * step - 0.04, y, zF - 0.06, a + (i + 1) * step + 0.04, frontTop, zF + 0.06, { collide: false });
      }
    }
    A.box(id, 'chrome', ex0 - 0.08, y, zF - 0.1, ex0, frontTop, zF + 0.1); A.box(id, 'chrome', ex1, y, zF - 0.1, ex1 + 0.08, frontTop, zF + 0.1);
    const sh = new Shutter(world, world.newId('shutter'), { zone: id, x0: ex0, x1: ex1, z: zF, y0: y, y1: frontTop, closed: true, shopName: s.name, shop: id });
    world.add(sh); ctl.shutter = sh;
    buildShopFront(world, A, ctl, s, rng.fork('front'), ex0, ex1);
    // enseigne
    const signW = Math.min(W - 1.4, 10), signH = s.floor ? 1.0 : 0.85;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), new THREE.MeshBasicMaterial({ map: signTexture(s.name, s.color, { italic: ['boulangerie', 'fleuriste', 'parfumerie', 'mode', 'bijouterie'].includes(id), font: ['pixel', 'arcade', 'octet', 'mobizone', 'electro'].includes(id) ? 'Arial Black, Arial' : 'Georgia, serif' }) }));
    sign.position.set(cx, frontTop + 0.2 + (top - frontTop - 0.2) / 2, zF - sg * 0.16); sign.rotation.y = faceFront;
    world.zone(galleryZone).group.add(sign); zone.signMats.push(sign.material);
    ctl.signPos = sign.position.clone();
  }

  // ── portes de réserve ──
  if (back) {
    const pd = new Door(world, world.newId('door'), { zone: idB, x: partX, y, z: zP, axis: 'x', width: 1.0, mat: 'wood', name: 'Réserve — ' + s.name, swing: sg, label: 'PRIVÉ', shop: id });
    world.add(pd); ctl.backDoor = pd;
  }
  const rd = new Door(world, world.newId('door'), { zone: back ? idB : id, x: rearX, y, z: zB, axis: 'x', width: 1.0, mat: 'metal', name: 'Porte de service — ' + s.name, swing: sg, lock: 'shop', locked: true, shop: id, window: false, label: s.id.toUpperCase().slice(0, 10) });
  world.add(rd); ctl.rearDoor = rd;

  // ── éclairage ──
  const depth = Math.abs((cinema ? zB : zP) - zF);
  for (let u = 2.5; u < W - 1; u += 3.5) for (let v = 2; v < depth - 0.5; v += 3.2) A.panel(id, X(u), cinema ? top - 0.4 : ceilS, Zc(v), 1.2, 0.6, ((u - 2.5) / 3.5) % 2 === 0 && Math.round((v - 2) / 3.2) % 2 === 0);
  if (back) A.panel(idB, cx, ceilB, (zP + zB) / 2, 1.2, 0.3);
  const ls = new LightSwitch(world, world.newId('switch'), { zone: id, target: id, label: s.name, x: x0 + 0.17, y: y + 1.3, z: zF + sg * 0.7, ry: Math.PI / 2 });
  world.add(ls);
  if (back) world.add(new LightSwitch(world, world.newId('switch'), { zone: idB, target: idB, label: 'Réserve', x: partX + 0.75, y: y + 1.3, z: zP + sg * 0.12, ry: faceIn }));

  // ── caméras ──
  const camCount = s.cams || 0;
  const camPositions = [
    { p: [X(0.5), y + 3.6, zP - sg * 0.4], t: [X(W * 0.7), y, zF + sg * 1] },
    back ? { p: [X(W - 0.6), ceilB - 0.2, zB - sg * 0.3], t: [X(W * 0.3), y, zP + sg * 0.5], back: true } : { p: [X(W - 0.5), y + 3.6, zF + sg * 0.5], t: [X(W * 0.3), y, zP] },
    { p: [X(W - 0.5), y + 3.6, zF + sg * 0.5], t: [X(W * 0.3), y, zP - sg * 1] },
  ];
  for (let i = 0; i < camCount; i++) {
    const c = camPositions[i];
    const pos = new THREE.Vector3(...c.p), tgt = new THREE.Vector3(...c.t);
    const yaw = Math.atan2(-(tgt.x - pos.x), -(tgt.z - pos.z)); const pitch = Math.atan2(tgt.y - pos.y, Math.hypot(tgt.x - pos.x, tgt.z - pos.z));
    world.cameras.push({ id: `cam_${id}_${i + 1}`, name: s.name + (camCount > 1 ? (c.back ? ' — réserve' : ' — ' + (i + 1)) : ''), area: id, shop: id, zone: c.back ? idB : id, pos, yaw, pitch, fov: s.zone === 'bigstore' ? 85 : 75 });
  }

  // ── aménagement ──
  const P = { boards: [], floor: [], counter: [], wallHigh: [], wallFloor: [], register: [], back: [], special: {} };
  const L = new LayoutKit(world, A, ctl, P, rng); ctl.P = P; // (P gardé pour le débogage des aménagements)
  finishShop(L, design, cinema ? { back: false, depth: Math.abs(zB - zF) - 0.15 } : {});
  const fn = INTERIOR_LAYOUTS[id] || LAYOUTS[id] || LAYOUTS[s.layout] || LAYOUTS.walls;
  fn(L, s);
  if (back) L.backroom();
  placeContents(world, dev, ctl, P, s, rng);
  labelShop(world, ctl, rng.fork('labels'));

  // ── navigation ──
  world.shopNavHooks.push((nav, doors) => {
    const f = s.floor; const lane = (sg > 0 ? 'n' : 's');
    const nearX = (x, start, step, min, max) => Math.max(min, Math.min(max, Math.round((x - start) / step) * step + start));
    const inId = `${id}_in`, cId = `${id}_c`;
    nav.node(inId, cx, y, zF + sg * 1.4, id, ['shop']);
    nav.node(cId, cx, y, zF + sg * Math.min(5, depth * 0.45), id, ['shop', 'center']);
    nav.link(inId, `g${f}${lane}${nearX(cx, -63, 6, -63, 63)}`, s.noShutter ? { door: ctl.frontDoor.id } : { shutter: ctl.shutter.id });
    nav.link(inId, cId);
    let lastC = cId;
    if (s.w > 1) for (let k = 0; k < s.w; k++) { const nid = `${id}_c${k}`; nav.node(nid, x0 + 6 + k * 12, y, zF + sg * Math.min(5, depth * 0.45), id, ['shop']); nav.link(cId, nid); lastC = nid; }
    if (back) {
      // allée transversale jusqu'au couloir de droite, puis la porte de la réserve (pas de diagonale à travers les rayons)
      const mId = `${id}_m`; nav.node(mId, partX, y, zF + sg * Math.min(5, depth * 0.45), id, ['shop']);
      nav.link(cId, mId); if (s.w > 1) nav.link(lastC, mId);
      nav.node(`${id}_pd`, partX, y, zP - sg * 0.8, id); nav.link(`${id}_pd`, mId);
      nav.node(`${id}_bk`, partX - 1.2, y, (zP + zB) / 2, idB, ['back']);
      nav.link(`${id}_pd`, `${id}_bk`, { door: ctl.backDoor.id });
      nav.node(`${id}_rd`, rearX, y, zB - sg * 0.8, idB); nav.link(`${id}_bk`, `${id}_rd`);
    } else { nav.node(`${id}_rd`, rearX, y, zB - sg * 0.8, id); nav.link(cId, `${id}_rd`); }
    nav.node(`${id}_rear`, rearX, y, sg * 23.5, `service_${lane}${f}`);
    nav.link(`${id}_rd`, `${id}_rear`, { door: ctl.rearDoor.id });
    nav.link(`${id}_rear`, `sv${f}${lane}${nearX(rearX, -75, 6, -75, 75)}`);
    // grille d'aération (RDC)
    const gr = (world.ventGrates || []).find(q => q.o.shop === id);
    if (gr && back) { nav.node(`${id}_vg`, gr.o.x, y, gr.o.z, idB, ['grate']); nav.link(`${id}_vg`, `${id}_bk`); if (gr.navNode) nav.link(`${id}_vg`, gr.navNode, { grate: gr.id }); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Kit d'aménagement : coordonnées locales u (0..W le long de la façade) et v (profondeur depuis la vitrine)
class LayoutKit {
  constructor(world, A, ctl, P, rng) {
    this.world = world; this.A = A; this.c = ctl; this.P = P; this.rng = rng;
    this.W = ctl.x1 - ctl.x0; this.D = Math.abs(ctl.zP - ctl.zF); this.y = ctl.y; this.sg = ctl.sg;
    this.id = ctl.shop.id; this.color = ctl.shop.color;
  }
  X(u) { return this.c.x0 + u; } Z(v) { return this.c.zF + this.c.sg * v; }
  get faceFront() { return this.sg > 0 ? Math.PI : 0; } get faceIn() { return this.sg > 0 ? 0 : Math.PI; }
  // boîte locale (u0..u1, v0..v1, hauteur relative) : mobilier coloré
  furn(u0, v0, u1, v1, h0, h1, color, o = {}) {
    const za = this.Z(v0), zb = this.Z(v1);
    return this.A.furn(o.zone || this.id, this.X(Math.min(u0, u1)), this.y + h0, Math.min(za, zb), this.X(Math.max(u0, u1)), this.y + h1, Math.max(za, zb), color, o);
  }
  // planche (emplacement d'articles) : le long de u (axis 'u') ou de v
  // o.pad : distance entre le bord de la planche et le chant du meuble (étiquettes) ; o.picks : pique-prix (vitrine) ;
  // o.noLabels : pas d'étiquettes (côté personnel, réserve)
  board(axis, a0, a1, c, h, depth, clear, ry, zone = null, o = {}) {
    const y = this.y + h;
    let b;
    if (axis === 'u') b = { ax: 'x', a0: this.X(Math.min(a0, a1)), a1: this.X(Math.max(a0, a1)), c: this.Z(c), y, depth, clear, ry, zone: zone || this.id, cur: 0 };
    else { const za = this.Z(a0), zb = this.Z(a1); b = { ax: 'z', a0: Math.min(za, zb), a1: Math.max(za, zb), c: this.X(c), y, depth, clear, ry, zone: zone || this.id, cur: 0 }; }
    Object.assign(b, o); this.P.boards.push(b);
    return b;
  }
  // étagère murale : côté 'L' (u≈0), 'R' (u≈W), 'B' (cloison, v≈D)
  wallShelf(side, a0, a1, levels = 4, height = 2.1, depth = 0.5, color = 0xb0b4b8, zone = null, o = {}) {
    const zn = zone || this.id; const metal = o.metal ?? true;
    const base = o.base ?? 0.12;
    const step = (height - base - 0.13) / Math.max(1, levels - 1);
    for (let i = 0; i < levels; i++) {
      const h = base + i * step;
      if (side === 'L') { this.furn(0.17, a0, 0.17 + depth, a1, h - 0.03, h, color, { zone: zn, metal, collide: false }); this.board('v', a0 + 0.05, a1 - 0.05, 0.17 + depth / 2, h, depth, step - 0.04, Math.PI / 2, zn); }
      if (side === 'R') { this.furn(this.W - 0.17 - depth, a0, this.W - 0.17, a1, h - 0.03, h, color, { zone: zn, metal, collide: false }); this.board('v', a0 + 0.05, a1 - 0.05, this.W - 0.17 - depth / 2, h, depth, step - 0.04, -Math.PI / 2, zn); }
      if (side === 'B') { const v = this.D - 0.12; this.furn(a0, v - depth, a1, v, h - 0.03, h, color, { zone: zn, metal, collide: false }); this.board('u', a0 + 0.05, a1 - 0.05, v - depth / 2, h, depth, step - 0.04, this.faceFront, zn); }
    }
    // dos + montants + collision (o.back : couleur du fond ; o.plinth : socle plein sous la première tablette)
    const bk = o.back ?? 0x8a8f94, h0 = o.from ?? 0, bm = o.backMetal ?? metal;
    if (side === 'L') { this.furn(0.15, a0, 0.2, a1, h0, height, bk, { zone: zn, metal: bm }); this.furn(0.17, a0, 0.17 + depth, a1, h0, height, color, { zone: zn, visible: false }); }
    if (side === 'R') { this.furn(this.W - 0.2, a0, this.W - 0.15, a1, h0, height, bk, { zone: zn, metal: bm }); this.furn(this.W - 0.17 - depth, a0, this.W - 0.17, a1, h0, height, color, { zone: zn, visible: false }); }
    if (side === 'B') { const v = this.D - 0.12; this.furn(a0, v - 0.05, a1, v, h0, height, bk, { zone: zn, metal: bm }); this.furn(a0, v - depth, a1, v, h0, height, color, { zone: zn, visible: false }); }
    if (o.plinth !== undefined && base > 0.2) this.wallBlock(side, a0, a1, 0, base - 0.03, depth, o.plinth, zn);
    if (o.uprights) for (let a = a0; a <= a1 + 0.01; a += Math.max(0.6, (a1 - a0) / Math.max(1, Math.round((a1 - a0) / 1.0)))) {
      if (side === 'L') this.furn(0.17, a - 0.015, 0.17 + depth, a + 0.015, h0, height, o.uprights, { zone: zn, metal, collide: false });
      if (side === 'R') this.furn(this.W - 0.17 - depth, a - 0.015, this.W - 0.17, a + 0.015, h0, height, o.uprights, { zone: zn, metal, collide: false });
      if (side === 'B') { const v = this.D - 0.12; this.furn(a - 0.015, v - depth, a + 0.015, v, h0, height, o.uprights, { zone: zn, metal, collide: false }); }
    }
  }
  // gondole double face le long de u
  island(u0, u1, v0, levels = 4, height = 1.7, color = 0xd0d4d8, depth = 1.0, o = {}) {
    const step = (height - 0.25) / (levels - 1), metal = o.metal ?? true;
    this.furn(u0, v0, u1, v0 + depth, 0, 0.1, o.base ?? 0x555a60, { metal });
    this.furn(u0, v0 + depth / 2 - 0.03, u1, v0 + depth / 2 + 0.03, 0, height, o.back ?? 0x8a8f94, { metal });
    for (let i = 0; i < levels; i++) {
      const h = 0.12 + i * step;
      this.furn(u0, v0, u1, v0 + depth, h - 0.03, h, color, { metal, collide: false });
      this.board('u', u0 + 0.05, u1 - 0.05, v0 + depth * 0.25, h, depth / 2 - 0.04, step - 0.04, this.faceFront, null, { pad: 0.02 });
      this.board('u', u0 + 0.05, u1 - 0.05, v0 + depth * 0.75, h, depth / 2 - 0.04, step - 0.04, this.faceIn, null, { pad: 0.02 });
    }
    this.furn(u0, v0, u1, v0 + depth, 0, height, color, { visible: false });
    // tête de gondole
    const cap = o.cap ?? this.color, ch = height + (o.capH ?? 0.25);
    this.furn(u0 - 0.05, v0, u0, v0 + depth, 0, ch, cap, {});
    this.furn(u1, v0, u1 + 0.05, v0 + depth, 0, ch, cap, {});
    (this.P.caps ||= []).push({ x: this.X(u0 - 0.05), y: this.y + ch, z: this.Z(v0 + depth / 2), nx: -1, depth }, { x: this.X(u1 + 0.05), y: this.y + ch, z: this.Z(v0 + depth / 2), nx: 1, depth });
  }
  // table / présentoir avec plateau
  table(u0, v0, u1, v1, h, color = 0x8d6e63, levels = 1) {
    this.furn(u0, v0, u1, v1, h - 0.05, h, color);
    for (const [a, b] of [[u0 + 0.05, v0 + 0.05], [u1 - 0.1, v0 + 0.05], [u0 + 0.05, v1 - 0.1], [u1 - 0.1, v1 - 0.1]]) this.furn(a, b, a + 0.05, b + 0.05, 0, h - 0.05, 0x4e342e, { collide: false });
    this.furn(u0, v0, u1, v1, 0, h, color, { visible: false });
    const along = Math.abs(u1 - u0) >= Math.abs(v1 - v0);
    if (along) this.board('u', u0 + 0.05, u1 - 0.05, (v0 + v1) / 2, h, Math.abs(v1 - v0) - 0.1, 0.8, this.faceFront, null, { pad: 0.05, flat: true });
    else this.board('v', v0 + 0.05, v1 - 0.05, (u0 + u1) / 2, h, Math.abs(u1 - u0) - 0.1, 0.8, Math.PI / 2, null, { pad: 0.05, flat: true });
    if (levels > 1) { this.furn(u0 + 0.2, v0 + 0.2, u1 - 0.2, v1 - 0.2, h + 0.35, h + 0.38, color, { collide: false }); this.board(along ? 'u' : 'v', along ? u0 + 0.25 : v0 + 0.25, along ? u1 - 0.25 : v1 - 0.25, along ? (v0 + v1) / 2 : (u0 + u1) / 2, h + 0.38, 0.3, 0.6, along ? this.faceFront : Math.PI / 2, null, { flat: true }); }
  }
  // comptoir de caisse (le long de u) avec emplacement de caisse
  counter(u0, v0, u1, v1, h = 1.0, color = null, nRegisters = 1, top = 0x3e2c1e) {
    const c = color ?? this.color;
    this.furn(u0, v0, u1, v1, 0, h - 0.05, c);
    this.furn(u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, h - 0.05, h, top);
    const along = Math.abs(u1 - u0) >= Math.abs(v1 - v0);
    for (let i = 0; i < nRegisters; i++) {
      const t = (i + 0.5) / nRegisters;
      if (along) this.P.register.push({ x: this.X(u0 + (u1 - u0) * t), y: this.y + h, z: this.Z((v0 + v1) / 2), ry: this.faceFront + Math.PI, zone: this.id });
      else this.P.register.push({ x: this.X((u0 + u1) / 2), y: this.y + h, z: this.Z(v0 + (v1 - v0) * t), ry: Math.PI / 2, zone: this.id });
    }
    return { u0, v0, u1, v1, h };
  }
  counterSpot(u, v, h, ry, zone = null) { this.P.counter.push({ x: this.X(u), y: this.y + h, z: this.Z(v), ry, zone: zone || this.id }); }
  floorSpot(u, v, ry, zone = null) { this.P.floor.push({ x: this.X(u), y: this.y, z: this.Z(v), ry, zone: zone || this.id }); }
  wallHigh(side, a, h, zone = null) {
    if (side === 'L') this.P.wallHigh.push({ x: this.X(0.2), y: this.y + h, z: this.Z(a), ry: Math.PI / 2, zone: zone || this.id, wall: 'L' });
    if (side === 'R') this.P.wallHigh.push({ x: this.X(this.W - 0.2), y: this.y + h, z: this.Z(a), ry: -Math.PI / 2, zone: zone || this.id, wall: 'R' });
    if (side === 'B') this.P.wallHigh.push({ x: this.X(a), y: this.y + h, z: this.Z(this.D - 0.15), ry: this.faceFront, zone: zone || this.id, wall: 'B' });
  }
  wallFloor(side, a, zone = null) {
    if (side === 'L') this.P.wallFloor.push({ x: this.X(0.2), y: this.y, z: this.Z(a), ry: Math.PI / 2, zone: zone || this.id, wall: 'L' });
    if (side === 'R') this.P.wallFloor.push({ x: this.X(this.W - 0.2), y: this.y, z: this.Z(a), ry: -Math.PI / 2, zone: zone || this.id, wall: 'R' });
    if (side === 'B') this.P.wallFloor.push({ x: this.X(a), y: this.y, z: this.Z(this.D - 0.15), ry: this.faceFront, zone: zone || this.id, wall: 'B' });
  }
  // couvercle vitré d'une vitrine (crochetable / cassable), posé à 1,18 m sur un meuble bas
  vitrine(u0, v0, u1, v1) {
    const L = this, xa = L.X(u0), xb = L.X(u1), za = Math.min(L.Z(v0), L.Z(v1)), zb = Math.max(L.Z(v0), L.Z(v1));
    const gp = new GlassPane(L.world, L.world.newId('glass'), { zone: L.id, x0: xa, x1: xb, z0: za, z1: zb, y0: L.y + 1.18, y1: L.y + 1.18, shop: L.id, name: 'Vitrine à bijoux', horizontal: true, lockable: true, big: false });
    gp.mesh.geometry.dispose(); gp.mesh.geometry = new THREE.PlaneGeometry(xb - xa, zb - za); gp.mesh.rotation.set(-Math.PI / 2, 0, 0); gp.mesh.position.set((xa + xb) / 2, L.y + 1.18, (za + zb) / 2);
    gp.col.set(xa, L.y + 0.92, za, xb, L.y + 1.2, zb); L.world.physics.update(gp.col); gp.setPick(xa, L.y + 0.92, za, xb, L.y + 1.22, zb);
    L.world.add(gp); L.c.glass.push(gp);
    L.A.box(L.id, 'glass', xa, L.y + 0.92, za - 0.005, xb, L.y + 1.18, za + 0.005, { collide: false }); L.A.box(L.id, 'glass', xa, L.y + 0.92, zb - 0.005, xb, L.y + 1.18, zb + 0.005, { collide: false });
    return gp;
  }
  // ── briques d'aménagement supplémentaires (intérieurs différenciés) ──
  get H() { return this.c.ceil ?? 4.0; } // hauteur sous plafond (relative)
  // boîte d'un matériau donné (coordonnées locales), sans collision par défaut
  mbox(mat, u0, v0, u1, v1, h0, h1, o = {}) {
    const za = this.Z(v0), zb = this.Z(v1);
    return this.A.box(o.zone || this.id, mat, this.X(Math.min(u0, u1)), this.y + h0, Math.min(za, zb), this.X(Math.max(u0, u1)), this.y + h1, Math.max(za, zb), { collide: o.collide ?? false, ...o });
  }
  // bloc plein contre un mur (socle, meuble bas)
  wallBlock(side, a0, a1, h0, h1, depth, color, zone = null) {
    const zn = zone || this.id;
    if (side === 'L') return this.furn(0.17, a0, 0.17 + depth, a1, h0, h1, color, { zone: zn });
    if (side === 'R') return this.furn(this.W - 0.17 - depth, a0, this.W - 0.17, a1, h0, h1, color, { zone: zn });
    const v = this.D - 0.12; return this.furn(a0, v - depth, a1, v, h0, h1, color, { zone: zn });
  }
  // panneau plaqué sur un mur (miroir, ardoise, panneau de couleur) : matériau ou couleur
  wallPanel(side, a0, a1, h0, h1, mat, t = 0.02) {
    const W = this.W, D = this.D, col = typeof mat === 'number';
    const b = side === 'L' ? [0.165, a0, 0.165 + t, a1] : side === 'R' ? [W - 0.165 - t, a0, W - 0.165, a1] : [a0, D - 0.115 - t, a1, D - 0.115];
    if (col) return this.furn(b[0], b[1], b[2], b[3], h0, h1, mat, { collide: false });
    return this.mbox(mat, b[0], b[1], b[2], b[3], h0, h1);
  }
  mirror(side, a0, a1, h0 = 0.3, h1 = 2.0) { this.wallPanel(side, a0 - 0.03, a1 + 0.03, h0 - 0.03, h1 + 0.03, 0x2b2b2b, 0.02); this.wallPanel(side, a0, a1, h0, h1, 'chrome', 0.03); }
  // comptoir vitré réfrigéré ou d'exposition (le long de u) : socle, plateau, vitre bombée, planche visible
  glassCounter(u0, v0, u1, v1, h = 1.1, color = 0xf2efe8, top = 0x8a6440, o = {}) {
    const fv = v0, bv = v1; // face client en v0
    this.furn(u0, fv, u1, bv, 0, h - 0.42, color);
    this.furn(u0 - 0.02, fv - 0.02, u1 + 0.02, bv + 0.02, h - 0.42, h - 0.38, top, { collide: false });
    this.mbox('glass', u0 + 0.02, fv, u1 - 0.02, fv + 0.01, h - 0.38, h, {});                 // vitre avant
    this.mbox('glass', u0 + 0.02, fv, u1 - 0.02, bv - 0.25, h - 0.005, h + 0.005, {});         // vitre du dessus
    this.furn(u0, bv - 0.25, u1, bv, h - 0.06, h, top, { collide: false });                    // plan de service
    for (const u of [u0, u1]) this.furn(u - 0.02, fv, u + 0.02, bv, h - 0.38, h, 0x9aa0a6, { metal: true, collide: false });
    this.furn(u0, fv, u1, bv, 0, h, color, { visible: false });
    this.board('u', u0 + 0.06, u1 - 0.06, (fv + bv - 0.25) / 2, h - 0.38, Math.abs(bv - fv) - 0.35, 0.3, this.faceFront, null, { picks: true });
    if (o.register !== false) this.P.register.push({ x: this.X(o.regU ?? (u1 - 0.5)), y: this.y + h, z: this.Z(bv - 0.12), ry: this.faceFront + Math.PI, zone: this.id });
    return { u0, v0, u1, v1, h };
  }
  // banquette rembourrée (dossier côté 'back' : 'u0' | 'u1' | 'v0' | 'v1')
  bench(u0, v0, u1, v1, color = 0x7a1f1f, back = 'u0', h = 0.46) {
    this.furn(u0, v0, u1, v1, 0, h - 0.08, 0x2b1d14);
    this.furn(u0 + 0.02, v0 + 0.02, u1 - 0.02, v1 - 0.02, h - 0.08, h, color);
    const t = 0.12;
    const b = back === 'u0' ? [u0, v0, u0 + t, v1] : back === 'u1' ? [u1 - t, v0, u1, v1] : back === 'v0' ? [u0, v0, u1, v0 + t] : [u0, v1 - t, u1, v1];
    if (back) this.furn(b[0], b[1], b[2], b[3], h, h + 0.55, color);
  }
  stool(u, v, color = 0x222222, h = 0.72) {
    this.furn(u - 0.02, v - 0.02, u + 0.02, v + 0.02, 0, h - 0.05, 0x777b80, { metal: true, collide: false });
    this.furn(u - 0.18, v - 0.18, u + 0.18, v + 0.18, 0, 0.02, 0x555a60, { metal: true, collide: false });
    this.furn(u - 0.17, v - 0.17, u + 0.17, v + 0.17, h - 0.05, h, color, { collide: false });
  }
  chairDeco(u, v, ry = 0, color = 0x5d4037) { // chaise de décor (non interactive)
    const c = Math.cos(ry), sn = Math.sin(ry), back = (du, dv) => [u + du * c + dv * sn, v - du * sn + dv * c];
    this.furn(u - 0.2, v - 0.2, u + 0.2, v + 0.2, 0.42, 0.46, color, { collide: false });
    for (const [du, dv] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) { const [a, b] = back(du, dv); this.furn(a - 0.02, b - 0.02, a + 0.02, b + 0.02, 0, 0.42, 0x3e2723, { collide: false }); }
    const [bu, bv] = back(0, 0.19); this.furn(bu - (Math.abs(c) > 0.5 ? 0.2 : 0.02), bv - (Math.abs(c) > 0.5 ? 0.02 : 0.2), bu + (Math.abs(c) > 0.5 ? 0.2 : 0.02), bv + (Math.abs(c) > 0.5 ? 0.02 : 0.2), 0.46, 0.9, color, { collide: false });
  }
  rug(u0, v0, u1, v1, color = 0x8d3b3b, border = 0xd8c39a) {
    this.furn(u0, v0, u1, v1, 0, 0.008, border, { collide: false });
    this.furn(u0 + 0.1, v0 + 0.1, u1 - 0.1, v1 - 0.1, 0.008, 0.012, color, { collide: false });
  }
  plant(u, v, s = 1, pot = 0xd7ccc8) {
    const A = this.A, zn = this.id, x = this.X(u), z = this.Z(v), y = this.y;
    A.shape(zn, 'furniture', new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.4 * s, 10), new THREE.Matrix4().makeTranslation(x, y + 0.2 * s, z), pot);
    A.shape(zn, 'furniture', new THREE.IcosahedronGeometry(0.42 * s, 0), new THREE.Matrix4().compose(new THREE.Vector3(x, y + (0.4 + 0.55) * s, z), new THREE.Quaternion(), new THREE.Vector3(1, 1.5, 1)), 0x3f7a3a);
    A.shape(zn, 'furniture', new THREE.IcosahedronGeometry(0.3 * s, 0), new THREE.Matrix4().compose(new THREE.Vector3(x + 0.12 * s, y + 1.25 * s, z - 0.08 * s), new THREE.Quaternion(), new THREE.Vector3(1, 1.3, 1)), 0x4f8f45);
    this.world.physics.add(new Box(x - 0.22 * s, y, z - 0.22 * s, x + 0.22 * s, y + 0.5 * s, z + 0.22 * s, LAYER.FURN, null));
  }
  // suspension : fil depuis le plafond, abat-jour, disque lumineux (suit l'éclairage du magasin)
  pendant(u, v, low = 2.4, color = 0x1e1e1e, kind = 'cone', size = 0.35) {
    const A = this.A, zn = this.id, x = this.X(u), z = this.Z(v), y = this.y, H = this.H;
    this.furn(u - 0.006, v - 0.006, u + 0.006, v + 0.006, low + size * 0.6, H, 0x111111, { collide: false });
    const geo = kind === 'globe' ? new THREE.SphereGeometry(size * 0.55, 12, 8) : kind === 'drum' ? new THREE.CylinderGeometry(size * 0.6, size * 0.6, size * 0.6, 16, 1, true) : new THREE.ConeGeometry(size * 0.65, size * 0.7, 16, 1, true);
    A.shape(zn, 'furniture', geo, new THREE.Matrix4().makeTranslation(x, y + low + size * 0.3, z), color);
    if (kind === 'globe') A.panel(zn, x, y + low - size * 0.25 + 0.012, z, size * 0.4, size * 0.4, false);
    else A.panel(zn, x, y + low + 0.02, z, size * 0.9, size * 0.9, false);
  }
  floorLamp(u, v, color = 0xe8dcc0) {
    this.furn(u - 0.15, v - 0.15, u + 0.15, v + 0.15, 0, 0.03, 0x222222, { collide: false });
    this.furn(u - 0.015, v - 0.015, u + 0.015, v + 0.015, 0.03, 1.5, 0x222222, { metal: true, collide: false });
    this.A.shape(this.id, 'furniture', new THREE.CylinderGeometry(0.18, 0.24, 0.3, 14, 1, true), new THREE.Matrix4().makeTranslation(this.X(u), this.y + 1.62, this.Z(v)), color);
    this.A.panel(this.id, this.X(u), this.y + 1.5, this.Z(v), 0.3, 0.3, false);
  }
  // portant de vêtements le long de u (barre, montants, cintres colorés)
  rack(u0, u1, v, colors, h = 1.5) {
    this.furn(u0, v - 0.025, u1, v + 0.025, h - 0.05, h, 0xc0c0c0, { metal: true, collide: false });
    for (const u of [u0, u1]) { this.furn(u - 0.025, v - 0.025, u + 0.025, v + 0.025, 0, h, 0x9e9e9e, { metal: true }); this.furn(u - 0.2, v - 0.25, u + 0.2, v + 0.25, 0, 0.03, 0x9e9e9e, { metal: true, collide: false }); }
    const n = Math.max(2, Math.floor((u1 - u0 - 0.2) / 0.11));
    for (let k = 0; k < n; k++) { const u = u0 + 0.12 + k * (u1 - u0 - 0.24) / Math.max(1, n - 1); this.furn(u - 0.035, v - 0.2, u + 0.035, v + 0.2, h - 0.85 + (k % 3) * 0.05, h - 0.06, this.rng.pick(colors), { collide: false }); }
    this.furn(u0, v - 0.25, u1, v + 0.25, 0, h, 0x888888, { visible: false });
  }
  // façade de tiroirs (pharmacie, quincaillerie) contre un mur
  drawers(side, a0, a1, h0, h1, depth = 0.45, color = 0xf2f2f2, line = 0x9aa0a6, nx = 0, ny = 4) {
    this.wallBlock(side, a0, a1, h0, h1, depth, color);
    const cols = nx || Math.max(2, Math.round((a1 - a0) / 0.45));
    const f = side === 'L' ? 0.17 + depth : side === 'R' ? this.W - 0.17 - depth : this.D - 0.12 - depth;
    const d = side === 'R' || side === 'B' ? -0.008 : 0.008;
    for (let i = 1; i < cols; i++) { const a = a0 + (a1 - a0) * i / cols; if (side === 'B') this.furn(a - 0.006, f + d, a + 0.006, f, h0, h1, line, { collide: false }); else this.furn(Math.min(f, f + d), a - 0.006, Math.max(f, f + d), a + 0.006, h0, h1, line, { collide: false }); }
    for (let j = 1; j < ny; j++) { const h = h0 + (h1 - h0) * j / ny; if (side === 'B') this.furn(a0, f + d, a1, f, h - 0.006, h + 0.006, line, { collide: false }); else this.furn(Math.min(f, f + d), a0, Math.max(f, f + d), a1, h - 0.006, h + 0.006, line, { collide: false }); }
  }
  // bacs à bonbons en gradins contre un mur (avec planches pour les articles)
  bins(side, a0, a1, colors) {
    this.wallBlock(side, a0, a1, 0, 0.62, 0.62, 0xfafafa);
    const rows = [[0.62, 0.55, 0.62], [0.98, 0.42, 0.5], [1.32, 0.3, 0.38]]; // [hauteur, profondeur avant, profondeur]
    for (const [h, d] of rows) {
      const n = Math.max(2, Math.floor((a1 - a0) / 0.3));
      for (let k = 0; k < n; k++) {
        const a = a0 + k * (a1 - a0) / n, b = a + (a1 - a0) / n - 0.02, c = this.rng.pick(colors);
        if (side === 'L') this.furn(0.17, a, 0.17 + d, b, h, h + 0.05, c, { collide: false });
        else if (side === 'R') this.furn(this.W - 0.17 - d, a, this.W - 0.17, b, h, h + 0.05, c, { collide: false });
        else this.furn(a, this.D - 0.12 - d, b, this.D - 0.12, h, h + 0.05, c, { collide: false });
      }
      if (side === 'L') this.wallBlock('L', a0, a1, h, h + 0.03, d, 0xf5f5f5); else if (side === 'R') this.wallBlock('R', a0, a1, h, h + 0.03, d, 0xf5f5f5); else this.wallBlock('B', a0, a1, h, h + 0.03, d, 0xf5f5f5);
      if (side === 'L') this.board('v', a0 + 0.05, a1 - 0.05, 0.17 + d / 2, h + 0.05, d - 0.06, 0.3, Math.PI / 2, null, { pad: 0.03 });
      else if (side === 'R') this.board('v', a0 + 0.05, a1 - 0.05, this.W - 0.17 - d / 2, h + 0.05, d - 0.06, 0.3, -Math.PI / 2, null, { pad: 0.03 });
      else this.board('u', a0 + 0.05, a1 - 0.05, this.D - 0.12 - d / 2, h + 0.05, d - 0.06, 0.3, this.faceFront, null, { pad: 0.03 });
    }
  }
  // cloison basse ou pleine (cabine, salle d'examen) avec collision
  partition(u0, v0, u1, v1, h = 2.3, color = 0xe8e4dc) { this.furn(u0, v0, u1, v1, 0, h, color); }
  // panneau lumineux (enseigne intérieure, menus) : texture canvas, s'éteint avec le courant du magasin
  litPanel(side, a0, a1, h0, h1, tex) {
    const W = this.W, D = this.D, w = a1 - a0, hh = h1 - h0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: tex }));
    if (side === 'B') { m.position.set(this.X((a0 + a1) / 2), this.y + (h0 + h1) / 2, this.Z(D - 0.14)); m.rotation.y = this.faceFront; }
    else if (side === 'L') { m.position.set(this.X(0.19), this.y + (h0 + h1) / 2, this.Z((a0 + a1) / 2)); m.rotation.y = Math.PI / 2; }
    else { m.position.set(this.X(W - 0.19), this.y + (h0 + h1) / 2, this.Z((a0 + a1) / 2)); m.rotation.y = -Math.PI / 2; }
    m.matrixAutoUpdate = false; m.updateMatrix();
    this.c.zone.group.add(m); this.c.zone.signMats.push(m.material);
    return m;
  }
  // affiche ou cadre décoratif (éclairé par la scène)
  wallPicture(side, a, h, w, hh, tex) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    if (side === 'B') { m.position.set(this.X(a), this.y + h, this.Z(this.D - 0.135)); m.rotation.y = this.faceFront; }
    else if (side === 'L') { m.position.set(this.X(0.185), this.y + h, this.Z(a)); m.rotation.y = Math.PI / 2; }
    else { m.position.set(this.X(this.W - 0.185), this.y + h, this.Z(a)); m.rotation.y = -Math.PI / 2; }
    m.matrixAutoUpdate = false; m.updateMatrix(); this.c.zone.group.add(m);
    return m;
  }
  // cadres photo colorés en grille sur un mur
  frames(side, a0, a1, h0, h1, palette) {
    for (let a = a0; a < a1 - 0.3; a += this.rng.range(0.45, 0.7)) for (let h = h0; h < h1 - 0.25; h += this.rng.range(0.4, 0.55)) {
      const w = this.rng.range(0.25, 0.4), hh = this.rng.range(0.2, 0.32);
      this.wallPanel(side, a, a + w, h, h + hh, 0x222222, 0.02);
      this.wallPanel(side, a + 0.025, a + w - 0.025, h + 0.025, h + hh - 0.025, this.rng.pick(palette), 0.025);
    }
  }

  // réserve : étagères de stock, cartons, échelle de service
  backroom() {
    const s = this.c.shop, zn = this.id + '_back';
    const D0 = this.D + 0.12, D1 = Math.abs(this.c.zB - this.c.zF) - 0.12;
    const vx = s.floor ? -100 : ventXForShop(s) - this.c.x0;
    // étagères au fond (en évitant la porte de service et la grille)
    const segs = [[2.4, Math.min(vx - 1.0, this.W - 0.3)], [vx + 1.0, this.W - 2.6]].filter(([a, b]) => b - a > 1.2);
    const tmpD = this.D; this.D = D1 + 0.12;
    for (const [a, b] of segs) this.wallShelf('B', a, b, 3, 2.2, 0.6, 0x7a7f84, zn);
    this.D = tmpD;
    // cartons de stock (conteneurs)
    const items = (s.items || []).map(e => e[0]);
    const nBoxes = Math.min(6, 2 + s.w * 2);
    for (let i = 0; i < nBoxes; i++) {
      const u = 0.6 + (i % 3) * 0.7, v = D0 + 0.6 + Math.floor(i / 3) * 0.6;
      const contents = items.length ? [this.rng.pick(items), this.rng.pick(items)].filter((x, k, a) => ITEMS[x] && (k === 0 || x !== a[0])) : [];
      this.P.back.push({ def: 'cardboard_box', x: this.X(u + 0.3), y: this.y, z: this.Z(v + 0.25), ry: this.rng.range(-0.2, 0.2), zone: zn, contents, stack: i % 2 });
    }
    // bureau de réserve
    const du = this.W - 2.0;
    this.furn(du - 0.7, D0 + 0.4, du + 0.7, D0 + 1.1, 0, 0.75, 0x6d5a48, { zone: zn });
    this.P.backDesk = { x: this.X(du), y: this.y + 0.75, z: this.Z(D0 + 0.75), zone: zn };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aménagements
const LAYOUTS = {
  // Magasin générique : étagères murales + îlot + comptoir de caisse
  walls(L, s) {
    const W = L.W, D = L.D;
    L.wallShelf('L', 1.4, D - 0.8, 5, 2.2, 0.45, 0xc8c8c8);
    L.wallShelf('R', 1.4, D - 0.8, 5, 2.2, 0.45, 0xc8c8c8);
    L.wallShelf('B', 0.8, W - 2.4, 5, 2.2, 0.45, 0xc8c8c8);
    if (W >= 12) L.island(3.0, W - 3.0, D * 0.5, 4, 1.5, 0xe0e0e0, 1.0);
    if (W >= 24) L.island(3.0, W - 3.0, D * 0.5 - 2.4, 4, 1.5, 0xe0e0e0, 1.0);
    L.counter(0.9, 1.0, 2.6, 1.7, 1.0);
    L.table(W - 3.4, 0.9, W - 1.2, 1.9, 0.75, 0x9e8a78, 2);
    L.floorSpot(W - 1.0, 2.6, Math.PI / 2); L.floorSpot(1.5, D - 1.5, 0); L.floorSpot(W / 2, 1.2, L.faceIn);
    for (let a = 2; a < D - 1; a += 2.2) { L.wallHigh('L', a, 2.6); L.wallHigh('R', a, 2.6); }
    for (let a = 2; a < D - 1; a += 1.2) { L.wallFloor('L', a); L.wallFloor('R', a); }
    for (let u = 1.5; u < W - 1; u += 1.5) L.wallFloor('B', u);
    for (let u = 2; u < W - 2; u += 1) L.counterSpot(u, D * 0.5 + 0.5, 1.52, L.faceFront);
  },
  hyper(L, s) {
    const W = L.W, D = L.D;
    // caisses
    for (let i = 0; i < 4; i++) { const u = 4 + i * 4; L.counter(u, 1.6, u + 0.8, 3.6, 0.9, 0x37474f, 1); L.furn(u + 0.85, 1.6, u + 1.0, 3.6, 0, 0.6, 0xb0b0b0, { metal: true }); }
    // gondoles
    for (const v of [5.4, 7.4]) for (const [a, b] of [[1.5, 11.5], [13.5, 23.5], [25.5, 35.5], [37.5, 45.2]]) L.island(a, b, v, 5, 1.8, 0xe0e0e0, 1.0);
    L.wallShelf('B', 0.8, W - 2.4, 5, 2.2, 0.5, 0xd8d8d8);
    L.wallShelf('L', 4.2, D - 0.8, 5, 2.2, 0.5, 0xd8d8d8);
    // fruits & légumes : étals inclinés
    for (const u of [28, 32, 36, 40]) L.table(u, 1.2, u + 3, 2.6, 0.8, 0x6d4c41, 2);
    // frigos le long du mur droit
    for (let a = 3; a < D - 1; a += 1.6) L.wallFloor('R', a);
    L.wallFloor('L', 1.2); L.wallFloor('L', 2.6);
    for (let u = 30; u < 35; u += 0.75) L.floorSpot(u, 3.3, L.faceIn);
    for (let u = 44; u < 47; u += 1) L.floorSpot(u, 2.0, 0);
    L.floorSpot(2.0, 2.0, 0); L.floorSpot(2.8, 2.0, 0);
    // panneaux
    L.c.zone.extraSigns = ['FRUITS & LÉGUMES', 'ÉPICERIE', 'BOISSONS', 'DROGUERIE', 'FRAIS'];
  },
  aisles(L, s) {
    const W = L.W, D = L.D;
    for (const v of [3.4, 6.0]) L.island(2.4, W - 2.2, v, 5, 1.8, 0xd0d0d0, 1.0);
    L.wallShelf('L', 1.4, D - 0.8, 5, 2.2, 0.5, 0xbdbdbd); L.wallShelf('R', 2.2, D - 0.8, 5, 2.2, 0.5, 0xbdbdbd); L.wallShelf('B', 0.8, W - 2.4, 5, 2.2, 0.5, 0xbdbdbd);
    L.counter(W - 2.2, 0.9, W - 0.8, 1.7, 1.0);
    L.floorSpot(1.2, 1.0, 0); L.floorSpot(1.8, 1.0, 0); L.floorSpot(W / 2, 1.0, 0);
  },
  jouets(L, s) {
    const W = L.W, D = L.D;
    L.wallShelf('L', 1.6, D - 0.8, 5, 2.3, 0.5, 0xfff176);
    L.wallShelf('R', 1.6, D - 0.8, 5, 2.3, 0.5, 0x81d4fa);
    L.wallShelf('B', 0.8, W - 2.4, 5, 2.3, 0.5, 0xf8bbd0);
    L.island(4, 11, 5.6, 4, 1.4, 0xffcc80, 1.0); L.island(13, 20, 5.6, 4, 1.4, 0xa5d6a7, 1.0);
    L.island(4, 11, 7.6, 4, 1.4, 0xce93d8, 1.0); L.island(13, 20, 7.6, 4, 1.4, 0x90caf9, 1.0);
    L.island(4.6, 9.6, 2.6, 3, 1.2, 0xfff59d, 0.8);
    // pyramide de peluches
    L.table(16.5, 1.0, 19.5, 2.4, 0.6, 0xffb300, 2);
    L.counter(1.0, 1.2, 3.4, 1.9, 1.0, 0xffb300);
    L.floorSpot(W - 2.2, 1.6, -Math.PI / 2 + 0.4); // manège
    L.world.points.bobbyHome = new THREE.Vector3(L.X(W - 1.2), L.y, L.Z(3.2));
    L.world.points.bobbyHomeYaw = L.faceFront + 0.5;
    L.world.points.toyCenter = new THREE.Vector3(L.X(12), L.y, L.Z(5.6));
    L.floorSpot(5.4, 1.4, 0);
  },
  electro(L, s) {
    const W = L.W, D = L.D;
    // murs de téléviseurs
    for (let a = 1.6; a < D - 1; a += 1.6) { L.wallHigh('L', a, 1.9); L.wallHigh('R', a, 1.9); }
    L.furn(0.17, 1.2, 0.7, D - 0.6, 0, 0.9, 0x263238); L.furn(W - 0.7, 1.2, W - 0.17, D - 0.6, 0, 0.9, 0x263238);
    L.board('v', 1.3, D - 0.7, 0.45, 0.9, 0.45, 0.6, Math.PI / 2); L.board('v', 1.3, D - 0.7, W - 0.45, 0.9, 0.45, 0.6, -Math.PI / 2);
    // électroménager le long de la cloison
    for (let u = 1.2; u < W - 2.5; u += 0.9) L.wallFloor('B', u);
    // îlots de petit électroménager (comptoirs)
    for (const [a, b] of [[3, 10.5], [13.5, 21]]) {
      L.furn(a, 5.8, b, 6.8, 0, 0.9, 0xeceff1);
      for (let u = a + 0.5; u < b - 0.3; u += 0.9) { L.counterSpot(u, 6.05, 0.9, L.faceFront); L.counterSpot(u + 0.3, 6.55, 0.9, L.faceIn); }
      L.board('u', a + 0.1, b - 0.1, 6.3, 0.9, 0.9, 0.7, L.faceFront);
    }
    // présentoir des grille-pains (câblage défectueux — nuit 7)
    L.table(3, 2.0, 7.5, 2.8, 0.95, 0xd84315, 1);
    L.world.points.electroFire = new THREE.Vector3(L.X(5.2), L.y + 1.0, L.Z(2.4));
    L.counter(W - 3.0, 1.0, W - 1.0, 1.8, 1.0, 0x1565c0);
    L.c.zone.extraSigns = ['PROMO TV', 'CUISINE', 'LAVAGE'];
  },
  pixel(L, s) {
    const W = L.W, D = L.D;
    L.wallShelf('R', 1.4, D - 0.8, 6, 2.3, 0.35, 0x311b92);
    L.wallShelf('B', 0.8, W - 2.4, 6, 2.3, 0.35, 0x4527a0);
    L.furn(0.17, 2.0, 0.9, 7.5, 0, 0.8, 0x1a1a2e);
    for (const v of [2.8, 4.7, 6.6]) L.counterSpot(0.55, v, 0.8, Math.PI / 2);
    L.island(3.5, 9, 6.2, 4, 1.4, 0x7c4dff, 1.0);
    L.counter(W - 2.6, 1.0, W - 0.8, 1.8, 1.0, 0x7c4dff);
    L.floorSpot(1.3, 3.8, Math.PI / 2);
  },
  videoclub(L, s) {
    const W = L.W, D = L.D;
    L.wallShelf('L', 4.8, D - 0.8, 6, 2.2, 0.3, 0x880e4f);
    L.wallShelf('R', 1.4, D - 0.8, 6, 2.2, 0.3, 0x880e4f);
    L.wallShelf('B', 0.8, W - 2.4, 5, 2.2, 0.35, 0x4a148c);
    L.island(3.2, 8.8, 6.3, 4, 1.4, 0xad1457, 0.9);
    L.furn(0.17, 1.2, 0.9, 4.4, 0, 1.0, 0x3e2723);
    for (const v of [1.7, 2.5, 3.3, 4.0]) L.counterSpot(0.55, v, 1.0, Math.PI / 2);
    L.counter(W - 2.6, 1.0, W - 0.8, 1.8, 1.0, 0xd81b60);
  },
  food(L, s) {
    const W = L.W, D = L.D;
    // comptoir de service avec vitrine
    L.furn(0.8, 4.4, W - 2.2, 5.2, 0, 1.0, s.color);
    L.furn(0.75, 4.35, W - 2.15, 5.25, 1.0, 1.05, 0x3e2c1e);
    L.board('u', 1.0, W - 2.4, 4.8, 1.05, 0.7, 0.45, L.faceFront);
    L.P.register.push({ x: L.X(W - 2.8), y: L.y + 1.05, z: L.Z(4.8), ry: L.faceFront + Math.PI, zone: L.id });
    // cuisine : le long de la cloison
    for (let u = 1.2; u < W - 1.5; u += 1.6) L.wallFloor('B', u);
    L.furn(0.6, D - 1.0, W - 0.6, D - 0.2, 0, 0.92, 0xb0bec5, { metal: true });
    for (let u = 1.0; u < W - 1; u += 1.1) L.counterSpot(u, D - 0.6, 0.92, L.faceFront);
    L.board('u', 0.8, W - 0.8, D - 0.6, 0.92, 0.6, 0.6, L.faceFront, null, { noLabels: true });
    L.wallShelf('L', 5.6, D - 1.4, 3, 1.9, 0.35, 0x8d6e63);
    // salle : tables et chaises
    const tables = W >= 12 ? [[2.5, 2.2], [6, 2.2], [9.5, 2.2]] : [[3, 2.2]];
    for (const [u, v] of tables) {
      L.table(u - 0.5, v - 0.45, u + 0.5, v + 0.45, 0.75, 0x5d4037, 1);
      L.floorSpot(u - 0.85, v, Math.PI / 2); L.floorSpot(u + 0.85, v, -Math.PI / 2);
    }
    L.floorSpot(W - 1.0, 1.5, 0); L.floorSpot(W - 1.0, 3.0, 0);
  },
  racks(L, s) {
    const W = L.W, D = L.D, cx = W / 2, ew = s.w > 1 ? 6 : 4;
    const colors = [0x37474f, 0xc62828, 0x1565c0, 0xfafafa, 0x6d4c41, 0x2e7d32, 0x880e4f, 0xd7ccc8, 0x212121];
    // portants de part et d'autre de l'allée d'entrée, tables de pliés derrière l'allée transversale
    const front = [];
    for (let u = 1.2; u + 2.2 <= cx - 0.9; u += 2.8) front.push(u);
    for (let u = cx + 0.9; u + 2.2 <= W - 1.0; u += 2.8) front.push(u);
    for (const u of front) L.rack(u, u + 2.2, 2.6, colors);
    for (let u = 1.6; u + 2.2 <= W - 2.6; u += 3.2) L.table(u, 6.0, u + 2.2, 6.9, 0.8, 0x6d4c41, 1);
    L.wallShelf('L', 1.6, D - 3.4, 4, 2.0, 0.45, 0xbcaaa4);
    L.counter(W - 2.8, 1.0, W - 1.0, 1.8, 1.0, s.color);
    // cabines d'essayage
    const nCab = s.w > 1 ? 4 : 2;
    for (let i = 0; i < nCab; i++) {
      const u0 = 0.4 + i * 1.3, v0 = D - 1.5;
      L.furn(u0, v0, u0 + 0.06, D - 0.15, 0, 2.2, 0x6d4c41); L.furn(u0 + 1.24, v0, u0 + 1.3, D - 0.15, 0, 2.2, 0x6d4c41);
      L.furn(u0 + 0.06, v0, u0 + 1.24, v0 + 0.02, 0.15, 2.0, 0x880e4f, { collide: false });
      const p = new THREE.Vector3(L.X(u0 + 0.65), L.y, L.Z(v0 + 0.7));
      L.world.add(new HideSpot(L.world, L.world.newId('hide'), { zone: L.id, name: 'Cabine d\'essayage', box: [Math.min(L.X(u0), L.X(u0 + 1.3)), L.y, Math.min(L.Z(v0), L.Z(D - 0.15)), Math.max(L.X(u0), L.X(u0 + 1.3)), L.y + 2, Math.max(L.Z(v0), L.Z(D - 0.15))], pos: p.toArray(), ry: L.faceFront }));
    }
    // mannequins : vitrine (hors entrée) puis devant chaque portant
    for (let u = 1.4; u < W - 1; u += 1.6) if (u < cx - ew / 2 - 0.4 || u > cx + ew / 2 + 0.4) L.floorSpot(u, 0.8, L.faceFront);
    for (const u of front) L.floorSpot(u + 1.1, 3.4, L.faceFront + L.rng.range(-0.6, 0.6));
    for (let a = 1.5; a < D - 2; a += 2) { L.wallHigh('R', a, 1.5); }
    L.pendant(cx, 6.45, 2.5, 0x212121, 'drum', 0.5);
    L.world.points.modeCenter = L.world.points.modeCenter || (s.id === 'mode' ? new THREE.Vector3(L.X(W / 2), L.y, L.Z(4)) : undefined);
  },
  cases(L, s) {
    const W = L.W, D = L.D;
    const cases = [[1.0, 2.0, 0.7, 6.5, 'v'], [W - 1.7, 2.0, W - 1.0, 6.5, 'v'], [3.5, 4.0, 8.5, 4.7, 'u']];
    for (const [u0, v0, u1, v1, ax] of cases) {
      L.furn(Math.min(u0, u1), v0, Math.max(u0, u1), v1, 0, 0.9, 0x1a1a24);
      L.furn(Math.min(u0, u1), v0, Math.max(u0, u1), v1, 0.9, 0.92, 0xfafafa, { collide: false });
      L.board(ax, ax === 'v' ? v0 + 0.1 : Math.min(u0, u1) + 0.1, ax === 'v' ? v1 - 0.1 : Math.max(u0, u1) - 0.1, ax === 'v' ? (u0 + u1) / 2 : (v0 + v1) / 2, 0.92, 0.5, 0.2, ax === 'v' ? Math.PI / 2 : L.faceFront);
      // couvercle vitré (crochetable / cassable)
      const xa = L.X(Math.min(u0, u1)), xb = L.X(Math.max(u0, u1)), za = Math.min(L.Z(v0), L.Z(v1)), zb = Math.max(L.Z(v0), L.Z(v1));
      const gp = new GlassPane(L.world, L.world.newId('glass'), { zone: L.id, x0: xa, x1: xb, z0: za, z1: zb, y0: L.y + 1.18, y1: L.y + 1.18, shop: L.id, name: 'Vitrine à bijoux', horizontal: true, lockable: true, big: false });
      gp.mesh.geometry.dispose(); gp.mesh.geometry = new THREE.PlaneGeometry(xb - xa, zb - za); gp.mesh.rotation.set(-Math.PI / 2, 0, 0); gp.mesh.position.set((xa + xb) / 2, L.y + 1.18, (za + zb) / 2);
      gp.col.set(xa, L.y + 0.92, za, xb, L.y + 1.2, zb); L.world.physics.update(gp.col); gp.setPick(xa, L.y + 0.92, za, xb, L.y + 1.22, zb);
      L.world.add(gp); L.c.glass.push(gp);
      L.A.box(L.id, 'glass', xa, L.y + 0.92, za - 0.005, xb, L.y + 1.18, za + 0.005, { collide: false }); L.A.box(L.id, 'glass', xa, L.y + 0.92, zb - 0.005, xb, L.y + 1.18, zb + 0.005, { collide: false });
    }
    L.counter(W - 3.2, 1.0, W - 1.4, 1.6, 1.0, 0x2b2b38);
    L.wallShelf('B', 1.0, W - 2.6, 3, 1.8, 0.3, 0x2b2b38);
  },
  arcade(L, s) {
    const W = L.W, D = L.D;
    for (let a = 1.6; a < D - 0.6; a += 1.0) { L.wallFloor('L', a); L.wallFloor('R', a); }
    for (let u = 1.5; u < W - 2.5; u += 1.2) L.wallFloor('B', u);
    for (const [u, v, ry] of [[6, 6.6, 0], [12, 6.6, 0], [18, 6.6, 0], [8, 2.2, L.faceIn], [W - 3.5, 2.6, L.faceIn]]) L.floorSpot(u, v, ry);
    L.counter(16, 1.0, 19, 1.6, 1.0, 0xd500f9);
    L.floorSpot(3, 1.3, L.faceIn); L.floorSpot(4.4, 1.3, L.faceIn);
  },
  cinema(L, s) {
    const W = L.W, sg = L.sg; const D = Math.abs(L.c.zB - L.c.zF) - 0.3;
    const y = L.y;
    // hall : comptoir, machine à pop-corn, mur de la salle avec deux entrées
    L.counter(2, 1.0, 7, 1.8, 1.05, 0x1a237e);
    L.floorSpot(8.2, 1.4, L.faceFront);
    L.A.wallX(L.id, 'plaster_3a2f4a', L.c.x0 + 0.15, L.c.x1 - 0.15, L.Z(3.2), y, y + 4.6, 0.2, [{ a: L.X(1.5), b: L.X(3.0), y0: y, y1: y + 2.4 }, { a: L.X(W - 3.0), b: L.X(W - 1.5), y0: y, y1: y + 2.4 }]);
    // gradins (13 rangs : A … M) face à l'écran
    const rows = 13, rowD = 0.62, v0 = 4.4;
    for (let r = 0; r < rows; r++) {
      const v = v0 + (rows - 1 - r) * rowD; // rang A le plus proche de l'écran
      const h = (rows - 1 - r) * 0.13;
      if (h > 0) L.furn(3.6, v - 0.1, W - 3.6, v + rowD - 0.1, 0, h, 0x2a1a24);
      for (let k = 0; k < 10; k++) {
        const u = 4.2 + k * ((W - 8.4) / 9);
        L.furn(u - 0.25, v + 0.05, u + 0.25, v + 0.5, h, h + 0.45, 0x8e1b2e, { collide: false });
        L.furn(u - 0.25, v + 0.42, u + 0.25, v + 0.52, h + 0.45, h + 1.0, 0x8e1b2e, { collide: false });
        if (r === 12 && k === 2) { // Rang M, siège 13 (le 3e de la rangée, numérotés à partir de 11)
          L.world.points.rowM13 = new THREE.Vector3(L.X(u), y + h + 0.45, L.Z(v + 0.28));
          L.world.add(new Seat(L.world, L.world.newId('seat'), { zone: L.id, x: L.X(u), y: y + h, z: L.Z(v + 0.28), ry: L.faceIn, name: 'Rang M, siège 13' }));
        }
      }
    }
    // écran
    const scrW = W - 4, scrH = 4.2;
    L.c.screen = { x: L.c.x0 + W / 2, y: y + 2.6 + 0.4, z: L.c.zB - sg * 0.2, w: scrW, h: scrH, ry: L.faceFront };
    L.furn(1.8, D - 0.1, W - 1.8, D, 0.4, 5.2, 0x111111);
    L.P.special.projector = { x: L.X(W / 2), y: y + 3.4, z: L.Z(3.6), ry: L.faceIn };
    L.furn(W / 2 - 0.8, 3.3, W / 2 + 0.8, 4.0, 0, 3.0, 0x263238);
  },
  salon(L, s) {
    const W = L.W, D = L.D;
    for (let k = 0; k < 4; k++) { L.floorSpot(1.6, 2.0 + k * 1.8, -Math.PI / 2); L.wallHigh('L', 2.0 + k * 1.8, 1.6); }
    L.furn(0.17, 1.4, 0.6, D - 1.0, 0, 0.85, 0xf5f5f5); L.board('v', 1.5, D - 1.1, 0.4, 0.85, 0.35, 0.5, Math.PI / 2, null, { noLabels: true });
    L.wallFloor('B', W - 3); L.wallFloor('B', W - 4.5);
    L.wallShelf('R', 1.6, D - 1.0, 4, 2.0, 0.4, 0xf8bbd0);
    L.counter(W - 2.8, 1.0, W - 1.0, 1.7, 1.0, 0xf06292);
    L.floorSpot(3.2, 1.0, L.faceIn);
  },
  music(L, s) {
    const W = L.W, D = L.D;
    L.wallFloor('L', 2.4); L.wallFloor('L', 5.2); L.wallFloor('L', 7.6);
    L.floorSpot(W * 0.5, 6.6, L.faceFront);
    L.furn(W * 0.5 - 1.2, 5.6, W * 0.5 + 1.2, 7.6, 0, 0.12, 0x3e2723);
    L.wallShelf('R', 1.6, D - 0.8, 4, 2.1, 0.45, 0x8d6e63);
    L.wallShelf('B', 3.0, W - 2.4, 4, 2.1, 0.4, 0x8d6e63);
    L.table(1.6, 1.4, 4.2, 2.4, 0.8, 0x5d4037, 2);
    L.counter(W - 2.8, 1.0, W - 1.0, 1.7, 1.0, 0x6d4c41);
  },
  pets(L, s) {
    const W = L.W, D = L.D;
    L.furn(0.17, 1.4, 0.8, D - 0.8, 0, 0.75, 0x37474f);
    L.P.wallFloor.push(...[2.2, 4.4, 6.6].map(a => ({ x: L.X(0.5), y: L.y + 0.75, z: L.Z(a), ry: Math.PI / 2, zone: L.id, wall: 'L', raised: true })));
    L.furn(W - 0.8, 4.4, W - 0.17, 6.6, 0, 0.75, 0x37474f);
    L.P.wallFloor.push({ x: L.X(W - 0.55), y: L.y + 0.75, z: L.Z(5.5), ry: -Math.PI / 2, zone: L.id, wall: 'R', raised: true });
    L.floorSpot(W - 1.4, 2.0, -Math.PI / 2); L.floorSpot(4, D - 1.2, L.faceFront);
    L.island(2.8, 8.6, 6.4, 4, 1.5, 0x80deea, 1.0);
    L.wallShelf('B', 5.6, W - 2.4, 4, 2.0, 0.45, 0xb2ebf2);
    L.counter(W - 2.8, 1.0, W - 1.0, 1.6, 1.0, 0x0097a7);
    L.table(1.4, 1.0, 2.6, 1.8, 0.8, 0x6d4c41);
  },
  flowers(L, s) {
    const W = L.W, D = L.D;
    for (const [u, v] of [[2.5, 3.5], [6, 3.5], [2.5, 6.2], [6, 6.2]]) { L.table(u - 1, v - 0.6, u + 1, v + 0.6, 0.6, 0x5d4037, 2); }
    L.wallShelf('L', 1.6, D - 0.8, 3, 1.6, 0.5, 0x6d4c41); L.wallShelf('B', 1.0, W - 2.4, 3, 1.6, 0.5, 0x6d4c41);
    L.counter(W - 2.8, 1.0, W - 1.0, 1.6, 1.0, 0xad1457);
  },
  office(L, s) {
    const W = L.W, D = L.D;
    L.furn(4.5, 5.5, 7.5, 6.5, 0, 0.76, 0x4e342e);
    L.counterSpot(5.0, 5.9, 0.76, L.faceFront); L.counterSpot(6.0, 5.9, 0.76, L.faceFront); L.counterSpot(7.0, 5.9, 0.76, L.faceFront);
    L.board('u', 4.6, 7.4, 6.0, 0.76, 0.9, 0.6, L.faceFront, null, { noLabels: true });
    L.floorSpot(6, 6.9, L.faceFront);
    L.wallShelf('L', 2.0, D - 1.0, 5, 2.2, 0.35, 0x5d4037);
    L.furn(W - 1.2, 2.0, W - 0.3, 4.5, 0, 0.45, 0x3e2723); L.furn(W - 0.5, 2.0, W - 0.3, 4.5, 0.45, 0.95, 0x3e2723);
    L.P.special.safe = { x: L.X(W - 0.7), y: L.y, z: L.Z(D - 0.7), ry: -Math.PI / 2 };
    L.table(1.0, 1.0, 2.2, 1.8, 0.9, 0x5d4037);
    L.floorSpot(2.0, 4.0, Math.PI / 2);
    L.floorSpot(3.0, D - 1.0, L.faceFront);
  },
  staff(L, s) {
    const W = L.W, D = L.D;
    for (let a = 1.6; a < D - 0.6; a += 0.5) L.wallFloor('L', a);
    L.table(3.6, 6.0, 6.6, 7.4, 0.75, 0xbcaaa4);
    L.floorSpot(3.3, 6.7, Math.PI / 2); L.floorSpot(6.9, 6.7, -Math.PI / 2); L.floorSpot(5.1, 5.6, L.faceIn); L.floorSpot(5.1, 7.8, L.faceFront);
    L.furn(3.0, D - 0.8, 6.6, D - 0.15, 0, 0.92, 0xd7ccc8);
    L.counterSpot(3.5, D - 0.5, 0.92, L.faceFront); L.counterSpot(4.5, D - 0.5, 0.92, L.faceFront);
    L.board('u', 5.0, 6.5, D - 0.5, 0.92, 0.5, 0.5, L.faceFront, null, { noLabels: true });
    L.wallFloor('R', 2.0); L.wallFloor('R', 3.4);
    L.wallHigh('R', 6.0, 1.6);
    L.floorSpot(9.2, 2.2, -Math.PI / 2);
  },
  toilets(L, s) {
    const W = L.W, D = L.D;
    for (let k = 0; k < 4; k++) {
      const u0 = 0.3 + k * 1.6;
      L.furn(u0, D - 2.0, u0 + 0.05, D - 0.15, 0, 2.0, 0x90a4ae);
      L.P.special.toilets = L.P.special.toilets || [];
      L.P.special.toilets.push({ x: L.X(u0 + 0.8), y: L.y, z: L.Z(D - 0.5), ry: L.faceFront });
    }
    L.furn(6.7, D - 2.0, 6.75, D - 0.15, 0, 2.0, 0x90a4ae);
    for (let k = 0; k < 4; k++) { L.wallFloor('R', 2.0 + k * 1.2); L.wallHigh('R', 2.0 + k * 1.2, 1.7); }
    L.wallHigh('L', 2.0, 1.4); L.wallHigh('L', 3.5, 1.4);
    L.world.points.toiletMirror = new THREE.Vector3(L.X(W - 0.2), L.y + 1.7, L.Z(3.2));
  },
};
LAYOUTS.quincaillerie = LAYOUTS.aisles;

// ─────────────────────────────────────────────────────────────────────────────
function placeContents(world, dev, ctl, P, s, rng) {
  const g = world.game;
  // appareils fixes
  const take = (cat) => (P[cat] && P[cat].length ? P[cat].shift() : null);
  for (const [defId, count] of (s.fixed || [])) {
    const def = ITEMS[defId]; if (!def) { console.warn('fixe inconnu', defId); continue; }
    for (let i = 0; i < count; i++) {
      let cat = PLACE[def.use] || PLACE[defId] || (def.s[1] > 1.2 ? 'wallFloor' : def.s[1] < 0.5 ? 'counter' : 'floor');
      if (defId === 'register') cat = 'register';
      if (def.shape === 'arcade' || def.shape === 'claw' || defId === 'token_machine' || defId === 'basket_machine') cat = 'wallFloor';
      if (defId === 'mannequin' || defId === 'chair' || defId === 'kiddie_ride' || defId === 'salon_chair' || defId === 'drum_kit' || defId === 'air_hockey' || defId === 'tent' || defId === 'bike' || defId === 'basket_hoop' || defId === 'massage_chair' || defId === 'bench' || defId === 'parrot_cage' || defId === 'hamster_cage' || defId === 'gumball_machine' || defId === 'cotton_candy_machine' || defId === 'office_chair' || defId === 'dance_machine') cat = 'floor';
      let spot = null;
      if (defId === 'safe') spot = P.special.safe || (P.backDesk ? { x: P.backDesk.x + 1.2, y: ctl.y, z: P.backDesk.z, ry: Math.PI, zone: P.backDesk.zone } : null);
      else if (defId === 'projector') spot = P.special.projector;
      else if (defId === 'toilet') spot = P.special.toilets?.shift();
      else if (defId === 'conveyor') spot = P.counter.length ? { ...P.counter.shift() } : null;
      else spot = take(cat) || take('floor') || take('wallFloor') || take('counter');
      if (!spot) { console.warn('pas de place pour', defId, 'dans', s.id); continue; }
      const h = def.s[1];
      let yy = spot.y + (cat === 'wallHigh' ? 0 : h / 2);
      let x = spot.x, z = spot.z;
      // décaler les objets muraux selon leur profondeur
      if (spot.wall) {
        const off = (def.s[2] / 2) + 0.02;
        if (spot.wall === 'L') x += off; else if (spot.wall === 'R') x -= off; else z -= ctl.sg * off;
      }
      if (cat === 'wallHigh' && defId === 'tv') yy = spot.y;
      const d = dev(defId, spot.zone || s.id, x, yy, z, spot.ry, { shop: s.id, index: i });
      if (d) { ctl.devices.push(d); if (defId === 'register') ctl.registers.push(d); }
    }
  }
  // articles (produits) : planches puis sol
  const boards = P.boards;
  const floorSpots = P.floor;
  // les rayons du magasin d'abord, ceux de la réserve ensuite (un article trop grand pour les rayons ne doit pas
  // entraîner tous les suivants en réserve) ; on reste sur la même planche tant qu'elle a de la place (rayons cohérents)
  const shopBoards = boards.filter(b => !String(b.zone).endsWith('_back')), backBoards = boards.filter(b => String(b.zone).endsWith('_back'));
  const cursor = new Map([[shopBoards, 0], [backBoards, 0]]);
  const tryBoards = (list, def) => {
    const w = def.s[0], h = def.s[1], dpt = def.s[2], start = cursor.get(list);
    for (let tries = 0; tries < list.length; tries++) {
      const k = (start + tries) % list.length, b = list[k];
      if (h > b.clear || dpt > b.depth + 0.15) continue;
      const len = b.a1 - b.a0;
      if (b.cur + w + 0.03 > len) continue;
      const a = b.a0 + b.cur + w / 2 + 0.015; b.cur += w + 0.03 + rng.range(0, 0.02);
      cursor.set(list, k);
      const pos = b.ax === 'x' ? [a, b.y + h / 2 + 0.002, b.c] : [b.c, b.y + h / 2 + 0.002, a];
      return { pos, ry: b.ry + rng.range(-0.06, 0.06), zone: b.zone };
    }
    return null;
  };
  const placeOnBoards = (def) => tryBoards(shopBoards, def) || tryBoards(backBoards, def);
  // regrouper : on parcourt les articles dans l'ordre, chaque type à la suite (rayons cohérents)
  for (const [itemId, count] of (s.items || [])) {
    const def = ITEMS[itemId]; if (!def) { console.warn('article inconnu', itemId); continue; }
    for (let i = 0; i < count; i++) {
      let pl = def.fixed ? null : placeOnBoards(def);
      if (!pl) {
        const fs = floorSpots.length ? floorSpots[(i + itemId.length) % floorSpots.length] : null;
        if (fs) pl = { pos: [fs.x + rng.range(-0.25, 0.25) + (i % 3) * 0.05, fs.y + def.s[1] / 2 + 0.002, fs.z + rng.range(-0.25, 0.25)], ry: fs.ry + rng.range(-0.3, 0.3), zone: fs.zone };
        else pl = { pos: [ctl.x0 + 1 + rng.range(0, ctl.x1 - ctl.x0 - 2), ctl.y + def.s[1] / 2, ctl.zF + ctl.sg * rng.range(1, 3)], ry: rng.range(0, 6), zone: s.id };
      }
      g.props.addStatic(itemId, pl.pos[0], pl.pos[1], pl.pos[2], pl.ry, pl.zone);
    }
  }
  // rayons complétés (assortiment dense)
  stockShop({ world, game: g, ctl, P, s, rng, boards, floorSpots, addStatic: (defId, x, y, z, ry, zone, data) => g.props.addStatic(defId, x, y, z, ry, zone, data) });
  // réserve : cartons
  for (const b of P.back) {
    const def = ITEMS[b.def];
    g.props.addStatic(b.def, b.x, b.y + def.s[1] / 2 + (b.stack ? 0 : 0), b.z, b.ry, b.zone, { contents: b.contents });
  }
  // objets spéciaux de réserve
  const desk = P.backDesk;
  const special = { videoclub: ['lockpick', 'vhs_no_label'], pixel: ['controller'], jouets: ['battery'], bijouterie: ['padlock'], hyper: ['battery', 'flashlight_spare'], quincaillerie: ['ladder'], electro: ['fuse'], mobizone: ['powerbank'] }[s.id];
  if (desk && special) special.forEach((it, k) => { const d = ITEMS[it]; g.props.addStatic(it, desk.x - 0.4 + k * 0.4, desk.y + d.s[1] / 2 + 0.002, desk.z, 0.3 * k, desk.zone); });
}
