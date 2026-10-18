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
import { installInteriorMaterials, designFor, finishShop, INTERIOR_LAYOUTS, cinemaPosters } from './interiors.js';
import {
  Pen, wallBay, gondola, table as kTable, riser, podium, stall, counter as kCounter, checkout as kCheckout, laneRail, cabinet, drawerBank,
  displayCase, candyBins, partitionWall, banquette, sofa, barStool, chair, clothesRail, plant as kPlant, pendantLamp, floorLamp as kFloorLamp,
  frame, desk, fittingRoom, wcDivider, wcDoor, cinemaStep, cinemaSeat, cinemaArm, stairRail, keyboardStand, stage, projBooth, woodMat, shade, FU, ME, FA,
  sill, transom, mullion, shutterPost, doorCasing, troffer, diffuser, sprinkler, cardTerminal, exitSign,
} from './furnkit.js';

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
  piano: 'wallFloor', organ: 'wallFloor', synth_keyboard: 'counter', sink: 'wallFloor', fryer: 'wallFloor', pizza_oven: 'wallFloor', aquarium: 'wallFloor', terrarium: 'wallFloor', pc_tower: 'counter',
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
    doorCasing(new Pen(A, id).at(cx, y, zF, 0), ew, 2.2, 0.3, 0x5d4632, { lining: 0 });                      // chambranles
    const pq = new Pen(A, galleryZone).at(cx, y + 2.6, zF - sg * 0.15, faceFront);                                   // plaque
    pq.box(FU, -0.82, -0.17, -0.002, 0.82, 0.17, 0.009, 0x2a2c30, 'xXyYZ');
  } else {
    // allège + vitres + imposte + bandeau : boîtes de collision d'origine, profilés d'aluminium (nez arrondis, capots
    // de meneaux, joints de vitrage), poteaux d'entrée avec les coulisses du rideau
    A.box(id, 'chrome', x0 + 0.15, y, zF - 0.12, ex0, y + 0.15, zF + 0.12, { visible: false });
    A.box(id, 'chrome', ex1, y, zF - 0.12, x1 - 0.15, y + 0.15, zF + 0.12, { visible: false });
    A.box(id, 'chrome', x0 + 0.15, frontTop, zF - 0.12, x1 - 0.15, frontTop + 0.2, zF + 0.12, { visible: false });
    A.box(galleryZone, 'plaster_' + tint(s.color, 0.35, 0x2a2a30), x0 + 0.15, frontTop + 0.2, zF - 0.15, x1 - 0.15, top, zF + 0.15);
    const fp = new Pen(A, id).at(0, y, zF, 0), ft = frontTop - y;
    transom(fp, x0 + 0.15, x1 - 0.15, ft);
    for (const [a, b] of [[x0 + 0.15, ex0], [ex1, x1 - 0.15]]) {
      const n = Math.max(1, Math.round((b - a) / 2.5)); const step = (b - a) / n;
      sill(fp, a, b);
      for (let i = 0; i < n; i++) {
        const gp = new GlassPane(world, world.newId('glass'), { zone: id, x0: a + i * step + 0.03, x1: a + (i + 1) * step - 0.03, z0: zF, z1: zF, y0: y + 0.15, y1: frontTop, shop: id, name: 'Vitrine — ' + s.name, floorY: y + 0.01 });
        world.add(gp); ctl.glass.push(gp);
        if (i < n - 1) mullion(fp, a + (i + 1) * step, ft);
      }
    }
    mullion(fp, x0 + 0.15, ft); mullion(fp, x1 - 0.15, ft); // dormants contre les murs mitoyens
    A.box(id, 'chrome', ex0 - 0.08, y, zF - 0.1, ex0, frontTop, zF + 0.1, { visible: false }); A.box(id, 'chrome', ex1, y, zF - 0.1, ex1 + 0.08, frontTop, zF + 0.1, { visible: false });
    shutterPost(fp, ex0, -1, ft); shutterPost(fp, ex1, 1, ft);
    fp.rbox(FU, ex0 + 0.25, 0, Math.min(sg * 0.25, sg * 1.45), ex1 - 0.25, 0.008, Math.max(sg * 0.25, sg * 1.45), 0.004, 0x2c2d2f, 'xXYzZ'); // tapis d'entrée
    // bandeau : filet d'aluminium sous l'enseigne
    const gpn = new Pen(A, galleryZone).at(0, y, zF, 0);
    gpn.rbox(ME, x0 + 0.15, ft + 0.2, -0.165, x1 - 0.15, ft + 0.245, 0.165, 0.006, 0x9ea4aa, 'xXyYzZ');
    const sh = new Shutter(world, world.newId('shutter'), { zone: id, x0: ex0, x1: ex1, z: zF, y0: y, y1: frontTop, closed: true, shopName: s.name, shop: id });
    world.add(sh); ctl.shutter = sh;
    buildShopFront(world, A, ctl, s, rng.fork('front'), ex0, ex1);
    // enseigne
    const signW = Math.min(W - 1.4, 10), signH = s.floor ? 1.0 : 0.85;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), new THREE.MeshBasicMaterial({ map: signTexture(s.name, s.color, { italic: ['boulangerie', 'fleuriste', 'parfumerie', 'mode', 'bijouterie'].includes(id), font: ['pixel', 'arcade', 'octet', 'mobizone', 'electro'].includes(id) ? 'Arial Black, Arial' : 'Georgia, serif' }) }));
    sign.position.set(cx, frontTop + 0.2 + (top - frontTop - 0.2) / 2, zF - sg * 0.16); sign.rotation.y = faceFront;
    world.zone(galleryZone).group.add(sign); zone.signMats.push(sign.material);
    ctl.signPos = sign.position.clone();
    { // caisson de l'enseigne : cadre en aluminium laqué sombre, en saillie sur le panneau
      const za = Math.min(-sg * 0.15, -sg * 0.178), zb = Math.max(-sg * 0.15, -sg * 0.178), ys = sign.position.y - y, hw = signW / 2, hh = signH / 2, b = 0.035, c = 0x2b2d31;
      gpn.rbox(ME, cx - hw - b, ys - hh - b, za, cx + hw + b, ys - hh, zb, 0.006, c); gpn.rbox(ME, cx - hw - b, ys + hh, za, cx + hw + b, ys + hh + b, zb, 0.006, c);
      gpn.rbox(ME, cx - hw - b, ys - hh, za, cx - hw, ys + hh, zb, 0.006, c, 'xXzZ'); gpn.rbox(ME, cx + hw, ys - hh, za, cx + hw + b, ys + hh, zb, 0.006, c, 'xXzZ');
    }
  }

  // ── portes de réserve ──
  if (back) {
    const pd = new Door(world, world.newId('door'), { zone: idB, x: partX, y, z: zP, axis: 'x', width: 1.0, mat: 'wood', name: 'Réserve — ' + s.name, swing: sg, label: 'PRIVÉ', shop: id });
    world.add(pd); ctl.backDoor = pd;
  }
  const rd = new Door(world, world.newId('door'), { zone: back ? idB : id, x: rearX, y, z: zB, axis: 'x', width: 1.0, mat: 'metal', name: 'Porte de service — ' + s.name, swing: sg, lock: 'shop', locked: true, shop: id, window: false, label: s.id.toUpperCase().slice(0, 10) });
  world.add(rd); ctl.rearDoor = rd;
  // huisseries métalliques des portes de la réserve et de service (ébrasements, linteau, chambranles)
  if (back) doorCasing(new Pen(A, idB).at(partX, y, zP, 0), 1.1, 2.15, 0.2, 0xb4b9bd, sg > 0 ? { face0: 0.11, face1: 0.1 } : { face0: 0.1, face1: 0.11 });
  doorCasing(new Pen(A, back ? idB : id).at(rearX, y, zB, 0), 1.1, 2.15, 0.2, 0x7d858b);
  // blocs de sécurité « sortie » au-dessus des portes (pictogramme lumineux sur batterie, comme en vrai)
  if (back) zone.group.add(exitSign(new Pen(A, id).at(partX, y + 2.42, zP - sg * 0.11, faceFront)));
  world.zone(back ? idB : id).group.add(exitSign(new Pen(A, back ? idB : id).at(rearX, y + 2.42, zB - sg * 0.1, faceFront)));

  // ── éclairage ──
  const depth = Math.abs((cinema ? zB : zP) - zF);
  const tp = new Pen(A, id);
  for (let u = 2.5; u < W - 1; u += 3.5) for (let v = 2; v < depth - 0.5; v += 3.2) { A.panel(id, X(u), cinema ? top - 0.4 : ceilS, Zc(v), 1.2, 0.6, ((u - 2.5) / 3.5) % 2 === 0 && Math.round((v - 2) / 3.2) % 2 === 0); troffer(tp.at(X(u), cinema ? top - 0.4 : ceilS, Zc(v), 0), 1.2, 0.6); }
  if (!design.exposed) { // diffuseurs de soufflage et têtes de sprinkler entre les dalles
    const cy = cinema ? top - 0.4 : ceilS;
    for (let u = 4.25; u < W - 1.5; u += 7) for (let v = 3.6; v < depth - 1; v += 6.4) diffuser(tp.at(X(u), cy, Zc(v), 0));
    for (let u = 4.25; u < W - 1; u += 3.5) for (let v = 2; v < depth - 0.5; v += 3.2) sprinkler(tp.at(X(u), cy, Zc(v), 0));
  }
  if (back) { A.panel(idB, cx, ceilB, (zP + zB) / 2, 1.2, 0.3); tp.zone = idB; troffer(tp.at(cx, ceilB, (zP + zB) / 2, 0), 1.2, 0.3); sprinkler(tp.at(cx + 1.5, ceilB, (zP + zB) / 2, 0)); }
  const ls = new LightSwitch(world, world.newId('switch'), { zone: id, target: id, label: s.name, x: x0 + 0.17, y: y + 1.3, z: zF + sg * 0.7, ry: Math.PI / 2 });
  world.add(ls);
  if (back) world.add(new LightSwitch(world, world.newId('switch'), { zone: idB, target: idB, label: 'Réserve', x: partX + 0.75, y: y + 1.3, z: zP + sg * 0.12, ry: faceIn }));

  // ── caméras ──
  const camCount = s.cams || 0;
  const camPositions = cinema ? [
    { p: [X(1.0), y + 4.2, zF + sg * 13.3], t: [X(W * 0.5), y + 1.2, zF + sg * 4.6] },  // salle, depuis l'avant-scène : tous les rangs
    { p: [X(W - 0.5), y + 3.6, zF + sg * 0.5], t: [X(W * 0.3), y, zF + sg * 3.0] },    // hall
  ] : [
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
  L.finish();
  placeContents(world, dev, ctl, P, s, rng);
  labelShop(world, ctl, rng.fork('labels'));

  // ── navigation ──
  world.shopNavHooks.push((nav, doors) => {
    const f = s.floor; const lane = (sg > 0 ? 'n' : 's');
    const nearX = (x, start, step, min, max) => Math.max(min, Math.min(max, Math.round((x - start) / step) * step + start));
    const inId = `${id}_in`, cId = `${id}_c`;
    const vc = cinema ? 2.4 : Math.min(5, depth * 0.45); // cinéma : le centre est dans le hall, devant le mur de la salle
    nav.node(inId, cx, y, zF + sg * 1.4, id, ['shop']);
    nav.node(cId, cx, y, zF + sg * vc, id, ['shop', 'center']);
    nav.link(inId, `g${f}${lane}${nearX(cx, -63, 6, -63, 63)}`, s.noShutter ? { door: ctl.frontDoor.id } : { shutter: ctl.shutter.id });
    nav.link(inId, cId);
    let lastC = cId;
    if (s.w > 1) for (let k = 0; k < s.w; k++) { const nid = `${id}_c${k}`; nav.node(nid, x0 + 6 + k * 12, y, zF + sg * vc, id, ['shop']); nav.link(cId, nid); lastC = nid; }
    if (cinema) {
      // porte de service (au pied de l'écran) : par l'entrée de gauche et le couloir latéral de plain-pied, sans
      // traverser le mur du hall ni les gradins
      const dl = `${id}_dl`, al = `${id}_al`, fl = `${id}_fl`;
      nav.node(dl, x0 + 0.95, y, zF + sg * 2.6, id); nav.node(al, x0 + 0.95, y, zF + sg * 4.2, id); nav.node(fl, x0 + 0.95, y, zF + sg * 12.9, id);
      nav.chain([cId, dl, al, fl]);
      nav.node(`${id}_rd`, rearX, y, zB - sg * 0.8, id); nav.link(fl, `${id}_rd`);
    } else if (back) {
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
// Kit d'aménagement : coordonnées locales u (0..W le long de la façade) et v (profondeur depuis la vitrine).
// Chaque meuble garde ses boîtes de collision d'origine (invisibles : solid) et ses emplacements (planches, comptoirs,
// sol, caisses, têtes de gondole) ; sa géométrie détaillée vient de furnkit.js, posée dans un repère d'objet (penAt,
// wallPen) et versée dans les lots (zone, matériau) de l'Arch.
class LayoutKit {
  constructor(world, A, ctl, P, rng) {
    this.world = world; this.A = A; this.c = ctl; this.P = P; this.rng = rng;
    this.frng = rng.fork('mobilier'); // hasard du décor seul : le flux principal (placement des articles) reste inchangé
    this.W = ctl.x1 - ctl.x0; this.D = Math.abs(ctl.zP - ctl.zF); this.y = ctl.y; this.sg = ctl.sg;
    this.id = ctl.shop.id; this.color = ctl.shop.color;
    this.pen = new Pen(A, this.id);
  }
  X(u) { return this.c.x0 + u; } Z(v) { return this.c.zF + this.c.sg * v; }
  get faceFront() { return this.sg > 0 ? Math.PI : 0; } get faceIn() { return this.sg > 0 ? 0 : Math.PI; }
  // orientation monde d'une direction locale (du, dv) ; repère d'objet au point local (u, v), face avant vers ry
  ryOf(du, dv) { return Math.atan2(du, this.sg * dv); }
  ryX(du, dv) { return Math.atan2(-this.sg * dv, du); } // orientation qui aligne l'axe x de l'objet sur (du, dv)
  penAt(u, v, ry = 0, zone = null, h = 0) { this.pen.zone = zone || this.id; return this.pen.at(this.X(u), this.y + h, this.Z(v), ry); }
  // repère d'un meuble mural : x le long du mur (centré sur a0..a1), z sortant du revêtement mural
  wallPen(side, a0, a1, zone = null, h = 0) {
    const a = (a0 + a1) / 2;
    if (side === 'L') return this.penAt(0.16, a, Math.PI / 2, zone, h);
    if (side === 'R') return this.penAt(this.W - 0.16, a, -Math.PI / 2, zone, h);
    return this.penAt(a, this.D - 0.11, this.faceFront, zone, h);
  }
  // boîte locale (u0..u1, v0..v1, hauteur relative) : mobilier coloré
  furn(u0, v0, u1, v1, h0, h1, color, o = {}) {
    const za = this.Z(v0), zb = this.Z(v1);
    return this.A.furn(o.zone || this.id, this.X(Math.min(u0, u1)), this.y + h0, Math.min(za, zb), this.X(Math.max(u0, u1)), this.y + h1, Math.max(za, zb), color, o);
  }
  // boîte de collision seule (le meuble est dessiné par le kit)
  solid(u0, v0, u1, v1, h0, h1, zone = null) { return this.furn(u0, v0, u1, v1, h0, h1, 0, { zone: zone || this.id, visible: false }); }
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
  // étagère murale : côté 'L' (u≈0), 'R' (u≈W), 'B' (cloison, v≈D). Acier (montants à crémaillère, consoles, tablettes
  // à lèvre porte-étiquettes, fond perforé) ou menuiserie (joues, tablettes à chant arrondi, corniche) ; o.rack :
  // rayonnage de réserve
  wallShelf(side, a0, a1, levels = 4, height = 2.1, depth = 0.5, color = 0xb0b4b8, zone = null, o = {}) {
    const zn = zone || this.id; const metal = o.metal ?? true;
    const base = o.base ?? 0.12;
    const step = (height - base - 0.13) / Math.max(1, levels - 1), hs = [];
    for (let i = 0; i < levels; i++) {
      const h = base + i * step; hs.push(h);
      if (side === 'L') this.board('v', a0 + 0.05, a1 - 0.05, 0.17 + depth / 2, h, depth, step - 0.04, Math.PI / 2, zn);
      if (side === 'R') this.board('v', a0 + 0.05, a1 - 0.05, this.W - 0.17 - depth / 2, h, depth, step - 0.04, -Math.PI / 2, zn);
      if (side === 'B') { const v = this.D - 0.12; this.board('u', a0 + 0.05, a1 - 0.05, v - depth / 2, h, depth, step - 0.04, this.faceFront, zn); }
    }
    // fond + volume (collisions d'origine)
    const bk = o.back ?? 0x8a8f94, h0 = o.from ?? 0, bm = o.backMetal ?? metal;
    if (side === 'L') { this.solid(0.15, a0, 0.2, a1, h0, height, zn); this.solid(0.17, a0, 0.17 + depth, a1, h0, height, zn); }
    if (side === 'R') { this.solid(this.W - 0.2, a0, this.W - 0.15, a1, h0, height, zn); this.solid(this.W - 0.17 - depth, a0, this.W - 0.17, a1, h0, height, zn); }
    if (side === 'B') { const v = this.D - 0.12; this.solid(a0, v - 0.05, a1, v, h0, height, zn); this.solid(a0, v - depth, a1, v, h0, height, zn); }
    const plinth = o.plinth !== undefined && base > 0.2;
    if (plinth) this.wallBlock(side, a0, a1, 0, base - 0.03, depth, o.plinth, zn);
    wallBay(this.wallPen(side, a0, a1, zn), { L: a1 - a0, depth, H: height, hs, from: h0, base, color, back: bk, metal, perf: metal && bm !== false, uprights: o.uprights, plinthBlock: plinth, rack: o.rack });
  }
  // gondole double face le long de u
  island(u0, u1, v0, levels = 4, height = 1.7, color = 0xd0d4d8, depth = 1.0, o = {}) {
    const step = (height - 0.25) / (levels - 1), metal = o.metal ?? true, hs = [];
    this.solid(u0, v0, u1, v0 + depth, 0, 0.1);
    this.solid(u0, v0 + depth / 2 - 0.03, u1, v0 + depth / 2 + 0.03, 0, height);
    for (let i = 0; i < levels; i++) {
      const h = 0.12 + i * step; hs.push(h);
      this.board('u', u0 + 0.05, u1 - 0.05, v0 + depth * 0.25, h, depth / 2 - 0.04, step - 0.04, this.faceFront, null, { pad: 0.02 });
      this.board('u', u0 + 0.05, u1 - 0.05, v0 + depth * 0.75, h, depth / 2 - 0.04, step - 0.04, this.faceIn, null, { pad: 0.02 });
    }
    this.solid(u0, v0, u1, v0 + depth, 0, height);
    // tête de gondole
    const cap = o.cap ?? this.color, ch = height + (o.capH ?? 0.25);
    this.solid(u0 - 0.05, v0, u0, v0 + depth, 0, ch);
    this.solid(u1, v0, u1 + 0.05, v0 + depth, 0, ch);
    (this.P.caps ||= []).push({ x: this.X(u0 - 0.05), y: this.y + ch, z: this.Z(v0 + depth / 2), nx: -1, depth }, { x: this.X(u1 + 0.05), y: this.y + ch, z: this.Z(v0 + depth / 2), nx: 1, depth });
    gondola(this.penAt((u0 + u1) / 2, v0 + depth / 2, this.faceFront), { L: u1 - u0, depth, H: height, hs, color, back: o.back ?? 0x8a8f94, base: o.base ?? 0x555a60, cap, capH: o.capH ?? 0.25, metal, perf: metal });
  }
  // table / présentoir avec plateau (o.style : 'legs' | 'pedestal' | 'podium' | 'stall' ; par défaut pied central pour
  // les petites tables de restaurant)
  table(u0, v0, u1, v1, h, color = 0x8d6e63, levels = 1, o = {}) {
    this.solid(u0, v0, u1, v1, h - 0.05, h);
    this.solid(u0, v0, u1, v1, 0, h);
    const along = Math.abs(u1 - u0) >= Math.abs(v1 - v0);
    if (along) this.board('u', u0 + 0.05, u1 - 0.05, (v0 + v1) / 2, h, Math.abs(v1 - v0) - 0.1, 0.8, this.faceFront, null, { pad: 0.05, flat: true });
    else this.board('v', v0 + 0.05, v1 - 0.05, (u0 + u1) / 2, h, Math.abs(u1 - u0) - 0.1, 0.8, Math.PI / 2, null, { pad: 0.05, flat: true });
    if (levels > 1) this.board(along ? 'u' : 'v', along ? u0 + 0.25 : v0 + 0.25, along ? u1 - 0.25 : v1 - 0.25, along ? (v0 + v1) / 2 : (u0 + u1) / 2, h + 0.38, 0.3, 0.6, along ? this.faceFront : Math.PI / 2, null, { flat: true, pad: Math.max(0, (along ? Math.abs(v1 - v0) : Math.abs(u1 - u0)) / 2 - 0.35) });
    const w = Math.abs(u1 - u0), d = Math.abs(v1 - v0), L = along ? w : d, D = along ? d : w;
    const p = this.penAt((u0 + u1) / 2, (v0 + v1) / 2, along ? this.faceFront : this.ryOf(1, 0));
    const style = o.style ?? (w <= 0.9 && d <= 0.9 && h >= 0.7 ? 'pedestal' : 'legs');
    if (style === 'podium') podium(p, L, D, h, color);
    else if (style === 'stall') stall(p, L, D, h, color);
    else kTable(p, { w: L, d: D, h, color, style, legs: o.legs });
    if (levels > 1) riser(p, L - 0.4, D - 0.4, h, h + 0.38, color);
  }
  // comptoir de caisse (le long de u) avec emplacement de caisse
  counter(u0, v0, u1, v1, h = 1.0, color = null, nRegisters = 1, top = 0x3e2c1e) {
    const c = color ?? this.color;
    this.solid(u0, v0, u1, v1, 0, h - 0.05);
    this.solid(u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, h - 0.05, h);
    const along = Math.abs(u1 - u0) >= Math.abs(v1 - v0);
    for (let i = 0; i < nRegisters; i++) {
      const t = (i + 0.5) / nRegisters;
      if (along) this.P.register.push({ x: this.X(u0 + (u1 - u0) * t), y: this.y + h, z: this.Z((v0 + v1) / 2), ry: this.faceFront + Math.PI, zone: this.id });
      else this.P.register.push({ x: this.X((u0 + u1) / 2), y: this.y + h, z: this.Z(v0 + (v1 - v0) * t), ry: Math.PI / 2, zone: this.id });
    }
    const L = along ? Math.abs(u1 - u0) : Math.abs(v1 - v0), D = along ? Math.abs(v1 - v0) : Math.abs(u1 - u0);
    const p = this.penAt((u0 + u1) / 2, (v0 + v1) / 2, along ? this.faceFront : this.ryOf(-1, 0));
    kCounter(p, { L, D, h, color: c, top });
    for (let i = 0; i < nRegisters; i++) { // terminal de paiement à côté de chaque caisse, côté client
      const t = (i + 0.5) / nRegisters, ox = along ? -this.sg * (t - 0.5) * (u1 - u0) : this.sg * (t - 0.5) * (v1 - v0);
      if (Math.abs(ox) + 0.42 < L / 2) (this.later ||= []).push({ at: p.world(ox + 0.36, 0, D / 2 - 0.1), ry: along ? this.faceFront : this.ryOf(-1, 0), h });
    }
    return { u0, v0, u1, v1, h };
  }
  // caisse de supermarché (le long de v, caissière côté u1) : mêmes collisions et emplacement que counter()
  checkout(u0, v0, u1, v1, h, color) {
    this.solid(u0, v0, u1, v1, 0, h - 0.05);
    this.solid(u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, h - 0.05, h);
    this.P.register.push({ x: this.X((u0 + u1) / 2), y: this.y + h, z: this.Z(v0 + (v1 - v0) * 0.5), ry: Math.PI / 2, zone: this.id });
    const p = this.penAt((u0 + u1) / 2, (v0 + v1) / 2, this.sg * Math.PI / 2), hz = Math.abs(u1 - u0) / 2, hx = Math.abs(v1 - v0) / 2;
    kCheckout(p, { L: Math.abs(v1 - v0), D: Math.abs(u1 - u0), h, color, accent: this.color });
    // au-dessus du plateau : afficheur client et terminal sur flexible (côté client), mât et lanterne de caisse
    for (const [x0, z0, x1, z1, y0, y1] of [[-0.33, -hz - 0.01, 0.18, -hz + 0.16, 0, 0.47], [-hx + 0.03, hz - 0.09, -hx + 0.09, hz - 0.03, 0, 1.25], [-hx - 0.06, hz - 0.18, -hx + 0.18, hz + 0.06, 1.25, 1.5]]) {
      const a = p.world(x0, 0, z0), b = p.world(x1, 0, z1);
      this.world.physics.add(new Box(a.x, this.y + h + y0, a.z, b.x, this.y + h + y1, b.z, LAYER.FURN, null));
    }
  }
  // garde-corps de file de caisse (le long de v)
  laneRail(u0, v0, u1, v1, h) { this.solid(u0, v0, u1, v1, 0, h); laneRail(this.penAt((u0 + u1) / 2, (v0 + v1) / 2, this.ryOf(1, 0)), Math.abs(v1 - v0), h); }
  // podium plein (présentoir d'électroménager, de chaussures)
  podium(u0, v0, u1, v1, h, color) {
    this.solid(u0, v0, u1, v1, 0, h);
    const along = Math.abs(u1 - u0) >= Math.abs(v1 - v0);
    podium(this.penAt((u0 + u1) / 2, (v0 + v1) / 2, along ? this.faceFront : this.ryOf(1, 0)), along ? Math.abs(u1 - u0) : Math.abs(v1 - v0), along ? Math.abs(v1 - v0) : Math.abs(u1 - u0), h, color);
  }
  // accessoires posés après l'aménagement : terminaux de paiement, sauf là où une planche occupe le comptoir
  finish() {
    for (const t of this.later || []) {
      const x = t.at.x, z = t.at.z, busy = this.P.boards.some((b) => Math.abs(b.y - this.y - t.h) < 0.05 && (b.ax === 'x' ? x > b.a0 - 0.1 && x < b.a1 + 0.1 && Math.abs(z - b.c) < b.depth / 2 + 0.1 : z > b.a0 - 0.1 && z < b.a1 + 0.1 && Math.abs(x - b.c) < b.depth / 2 + 0.1));
      if (!busy) {
        this.pen.zone = this.id; cardTerminal(this.pen.at(x, this.y + t.h, z, t.ry));
        this.world.physics.add(new Box(x - 0.07, this.y + t.h, z - 0.07, x + 0.07, this.y + t.h + 0.2, z + 0.07, LAYER.FURN, null)); // le terminal arrête les objets lancés
      }
    }
  }
  counterSpot(u, v, h, ry, zone = null) { this.P.counter.push({ x: this.X(u), y: this.y + h, z: this.Z(v), ry, zone: zone || this.id }); }
  // emplacement au sol (h : hauteur du plancher local, estrade par exemple)
  floorSpot(u, v, ry, zone = null, h = 0) { this.P.floor.push({ x: this.X(u), y: this.y + h, z: this.Z(v), ry, zone: zone || this.id }); }
  // appareil mural (miroir, téléviseur, tableau) : dos à 3 cm du revêtement (de quoi passer devant une cimaise)
  wallHigh(side, a, h, zone = null) {
    if (side === 'L') this.P.wallHigh.push({ x: this.X(0.17), y: this.y + h, z: this.Z(a), ry: Math.PI / 2, zone: zone || this.id, wall: 'L' });
    if (side === 'R') this.P.wallHigh.push({ x: this.X(this.W - 0.17), y: this.y + h, z: this.Z(a), ry: -Math.PI / 2, zone: zone || this.id, wall: 'R' });
    if (side === 'B') this.P.wallHigh.push({ x: this.X(a), y: this.y + h, z: this.Z(this.D - 0.12), ry: this.faceFront, zone: zone || this.id, wall: 'B' });
  }
  wallFloor(side, a, zone = null) {
    if (side === 'L') this.P.wallFloor.push({ x: this.X(0.2), y: this.y, z: this.Z(a), ry: Math.PI / 2, zone: zone || this.id, wall: 'L' });
    if (side === 'R') this.P.wallFloor.push({ x: this.X(this.W - 0.2), y: this.y, z: this.Z(a), ry: -Math.PI / 2, zone: zone || this.id, wall: 'R' });
    if (side === 'B') this.P.wallFloor.push({ x: this.X(a), y: this.y, z: this.Z(this.D - 0.15), ry: this.faceFront, zone: zone || this.id, wall: 'B' });
  }
  // couvercle vitré d'une vitrine (crochetable / cassable), posé à 1,18 m sur un meuble bas (vitres latérales : jewelCase)
  vitrine(u0, v0, u1, v1) {
    const L = this, xa = L.X(u0), xb = L.X(u1), za = Math.min(L.Z(v0), L.Z(v1)), zb = Math.max(L.Z(v0), L.Z(v1));
    const gp = new GlassPane(L.world, L.world.newId('glass'), { zone: L.id, x0: xa, x1: xb, z0: za, z1: zb, y0: L.y + 1.18, y1: L.y + 1.18, shop: L.id, name: 'Vitrine à bijoux', horizontal: true, lockable: true, big: false });
    gp.mesh.geometry.dispose(); gp.mesh.geometry = new THREE.PlaneGeometry(xb - xa, zb - za); gp.mesh.rotation.set(-Math.PI / 2, 0, 0); gp.mesh.position.set((xa + xb) / 2, L.y + 1.18, (za + zb) / 2);
    gp.col.set(xa, L.y + 0.92, za, xb, L.y + 1.2, zb); L.world.physics.update(gp.col); gp.setPick(xa, L.y + 0.92, za, xb, L.y + 1.22, zb);
    L.world.add(gp); L.c.glass.push(gp);
    return gp;
  }
  // ── briques d'aménagement supplémentaires (intérieurs différenciés) ──
  get H() { return this.c.ceil ?? 4.0; } // hauteur sous plafond (relative)
  // boîte d'un matériau donné (coordonnées locales), sans collision par défaut
  mbox(mat, u0, v0, u1, v1, h0, h1, o = {}) {
    const za = this.Z(v0), zb = this.Z(v1);
    return this.A.box(o.zone || this.id, mat, this.X(Math.min(u0, u1)), this.y + h0, Math.min(za, zb), this.X(Math.max(u0, u1)), this.y + h1, Math.max(za, zb), { collide: o.collide ?? false, ...o });
  }
  // bloc plein contre un mur (socle, meuble bas) ; style : 'plain' (bloc à chants adoucis), 'doors' (portes),
  // 'kitchen' (inox, tiroirs, plan de travail), 'none' (collision seule)
  wallBlock(side, a0, a1, h0, h1, depth, color, zone = null, style = 'plain', o = {}) {
    const zn = zone || this.id;
    let col;
    if (side === 'L') col = this.solid(0.17, a0, 0.17 + depth, a1, h0, h1, zn);
    else if (side === 'R') col = this.solid(this.W - 0.17 - depth, a0, this.W - 0.17, a1, h0, h1, zn);
    else { const v = this.D - 0.12; col = this.solid(a0, v - depth, a1, v, h0, h1, zn); }
    if (style !== 'none') {
      const p = this.wallPen(side, a0, a1, zn);
      if (style === 'plain' || h1 - h0 < 0.3) p.rbox(woodMat(color), -(a1 - a0) / 2, h0, 0.01, (a1 - a0) / 2, h1, depth + 0.01, 0.006, color, h0 > 0.01 ? 'xXyYZ' : 'xXYZ');
      else cabinet(p, { L: a1 - a0, depth: depth + 0.01, h: h1, color, style, top: o.top, doors: o.doors });
    }
    return col;
  }
  // panneau plaqué sur un mur (miroir, ardoise, panneau de couleur) : matériau ou couleur
  wallPanel(side, a0, a1, h0, h1, mat, t = 0.02) {
    const W = this.W, D = this.D, col = typeof mat === 'number';
    const b = side === 'L' ? [0.165, a0, 0.165 + t, a1] : side === 'R' ? [W - 0.165 - t, a0, W - 0.165, a1] : [a0, D - 0.115 - t, a1, D - 0.115];
    if (col) return this.furn(b[0], b[1], b[2], b[3], h0, h1, mat, { collide: false });
    return this.mbox(mat, b[0], b[1], b[2], b[3], h0, h1);
  }
  // miroir : cadre mouluré, glace (chrome)
  mirror(side, a0, a1, h0 = 0.3, h1 = 2.0) {
    const p = this.wallPen(side, a0, a1, null, (h0 + h1) / 2);
    frame(p, a1 - a0, h1 - h0, 0.045, 0.042, 0x2b2b2b);
    this.wallPanel(side, a0, a1, h0, h1, 'chrome', 0.03);
  }
  // comptoir vitré réfrigéré ou d'exposition (le long de u) : socle, ceinture, vitre bombée, joues profilées, sole
  glassCounter(u0, v0, u1, v1, h = 1.1, color = 0xf2efe8, top = 0x8a6440, o = {}) {
    const fv = v0, bv = v1; // face client en v0
    this.solid(u0, fv, u1, bv, 0, h - 0.42);
    this.solid(u0, fv, u1, bv, 0, h);
    this.board('u', u0 + 0.06, u1 - 0.06, (fv + bv - 0.25) / 2, h - 0.38, Math.abs(bv - fv) - 0.35, 0.3, this.faceFront, null, { picks: true });
    if (o.register !== false) this.P.register.push({ x: this.X(o.regU ?? (u1 - 0.5)), y: this.y + h, z: this.Z(bv - 0.12), ry: this.faceFront + Math.PI, zone: this.id });
    displayCase(this.penAt((u0 + u1) / 2, (fv + bv) / 2, this.faceFront), { L: u1 - u0, D: Math.abs(bv - fv), h, color, top });
    return { u0, v0, u1, v1, h };
  }
  // banquette rembourrée (dossier côté 'back' : 'u0' | 'u1' | 'v0' | 'v1')
  bench(u0, v0, u1, v1, color = 0x7a1f1f, back = 'u0', h = 0.46, o = {}) {
    this.solid(u0, v0, u1, v1, 0, h - 0.08);
    this.solid(u0 + 0.02, v0 + 0.02, u1 - 0.02, v1 - 0.02, h - 0.08, h);
    const t = 0.12;
    const b = back === 'u0' ? [u0, v0, u0 + t, v1] : back === 'u1' ? [u1 - t, v0, u1, v1] : back === 'v0' ? [u0, v0, u1, v0 + t] : [u0, v1 - t, u1, v1];
    if (back) this.solid(b[0], b[1], b[2], b[3], h, h + 0.55);
    const dir = back === 'u0' ? [1, 0] : back === 'u1' ? [-1, 0] : back === 'v0' ? [0, 1] : [0, -1], alongU = dir[0] === 0;
    const wall = (back === 'u0' && u0 < 0.3) || (back === 'u1' && u1 > this.W - 0.3) || (back === 'v1' && v1 > this.D - 0.3);
    const p = this.penAt((u0 + u1) / 2, (v0 + v1) / 2, this.ryOf(dir[0], dir[1])), dim = { L: alongU ? Math.abs(u1 - u0) : Math.abs(v1 - v0), D: alongU ? Math.abs(v1 - v0) : Math.abs(u1 - u0), h, color, back: !!back, wall };
    if (o.sofa) sofa(p, dim); else banquette(p, dim);
  }
  // tabouret de bar (embase Ø 41 cm, assise Ø 35 cm) : collision sur toute sa hauteur
  stool(u, v, color = 0x222222, h = 0.72) { barStool(this.penAt(u, v, 0), h, color); this.solid(u - 0.19, v - 0.19, u + 0.19, v + 0.19, 0, h + 0.01); }
  chairDeco(u, v, ry = 0, color = 0x5d4037) { // chaise de décor (non interactive) tournée vers (sin ry, cos ry) : face à sa table
    const c = Math.cos(ry), sn = Math.sin(ry);
    chair(this.penAt(u, v, this.ryOf(sn, c)), color);
    this.solid(u - 0.22, v - 0.22, u + 0.22, v + 0.22, 0, 0.9); // assise, pieds et dossier
  }
  // tapis : bordure tissée à chants arrondis, champ central, frange aux extrémités
  rug(u0, v0, u1, v1, color = 0x8d3b3b, border = 0xd8c39a) {
    const along = Math.abs(u1 - u0) >= Math.abs(v1 - v0), L = along ? Math.abs(u1 - u0) : Math.abs(v1 - v0), D = along ? Math.abs(v1 - v0) : Math.abs(u1 - u0);
    const p = this.penAt((u0 + u1) / 2, (v0 + v1) / 2, along ? this.faceFront : this.ryOf(1, 0));
    p.rbox(FA, -L / 2, 0, -D / 2, L / 2, 0.01, D / 2, 0.004, border, 'xXYzZ');
    p.box(FA, -L / 2 + 0.1, 0.01, -D / 2 + 0.1, L / 2 - 0.1, 0.0115, D / 2 - 0.1, color, 'Y');
    p.box(FA, -L / 2 + 0.14, 0.0115, -D / 2 + 0.14, L / 2 - 0.14, 0.012, -D / 2 + 0.16, shade(border, -0.15), 'Y'); p.box(FA, -L / 2 + 0.14, 0.0115, D / 2 - 0.16, L / 2 - 0.14, 0.012, D / 2 - 0.14, shade(border, -0.15), 'Y');
    for (const s of [-1, 1]) for (let z = -D / 2 + 0.03; z < D / 2 - 0.02; z += 0.03) p.box(FA, s * L / 2 - (s > 0 ? 0 : 0.05), 0, z, s * L / 2 + (s > 0 ? 0.05 : 0), 0.004, z + 0.012, border, 'Y');
  }
  plant(u, v, s = 1, pot = 0xd7ccc8) {
    const x = this.X(u), z = this.Z(v), y = this.y;
    kPlant(this.penAt(u, v, 0), s, pot, () => this.frng.next());
    // pot, tronc et ramure (le feuillage dépasse à peine de la boîte : on ne traverse plus l'arbuste)
    this.world.physics.add(new Box(x - 0.26 * s, y, z - 0.26 * s, x + 0.26 * s, y + 1.25 * s, z + 0.26 * s, LAYER.FURN, null));
  }
  // suspension : rosace et câble depuis le plafond, abat-jour à double paroi, disque lumineux (suit l'éclairage du magasin)
  pendant(u, v, low = 2.4, color = 0x1e1e1e, kind = 'cone', size = 0.35) {
    const A = this.A, zn = this.id, x = this.X(u), z = this.Z(v), y = this.y, H = this.H;
    pendantLamp(this.penAt(u, v, 0, null, low), H - low, color, kind, size);
    if (kind === 'globe') A.panel(zn, x, y + low - size * 0.25 + 0.012, z, size * 0.4, size * 0.4, false);
    else A.panel(zn, x, y + low + 0.02, z, size * 0.9, size * 0.9, false);
  }
  floorLamp(u, v, color = 0xe8dcc0) {
    kFloorLamp(this.penAt(u, v, 0), color);
    this.A.panel(this.id, this.X(u), this.y + 1.5, this.Z(v), 0.3, 0.3, false);
    this.solid(u - 0.17, v - 0.17, u + 0.17, v + 0.17, 0, 1.77); // socle, tige et abat-jour
  }
  // portant de vêtements le long de u (barre chromée, piètements à roulettes, cintres et vêtements)
  rack(u0, u1, v, colors, h = 1.5, kinds = ['tee', 'dress', 'coat', 'pants']) {
    for (const u of [u0, u1]) this.solid(u - 0.025, v - 0.025, u + 0.025, v + 0.025, 0, h);
    const n = Math.max(2, Math.floor((u1 - u0 - 0.2) / 0.11)), cols = [];
    for (let k = 0; k < n; k++) cols.push(this.rng.pick(colors));
    this.solid(u0, v - 0.25, u1, v + 0.25, 0, h);
    clothesRail(this.penAt((u0 + u1) / 2, v, this.faceFront), u1 - u0, h, cols, cols.map(() => kinds[Math.floor(this.frng.next() * kinds.length)]), () => this.frng.next());
  }
  // façade de tiroirs (pharmacie, quincaillerie) contre un mur
  drawers(side, a0, a1, h0, h1, depth = 0.45, color = 0xf2f2f2, line = 0x9aa0a6, nx = 0, ny = 4) {
    this.wallBlock(side, a0, a1, h0, h1, depth, color, null, 'none');
    const cols = nx || Math.max(2, Math.round((a1 - a0) / 0.45));
    drawerBank(this.wallPen(side, a0, a1), { L: a1 - a0, depth: depth + 0.01, h0, h1, color, line, cols, rows: ny });
  }
  // bacs à bonbons en gradins contre un mur (avec planches pour les articles)
  bins(side, a0, a1, colors) {
    this.wallBlock(side, a0, a1, 0, 0.62, 0.62, 0xfafafa, null, 'doors', { top: 0xf4f4f4, doors: 0.7 });
    const rows = [[0.62, 0.55, 0.62], [0.98, 0.42, 0.5], [1.32, 0.3, 0.38]]; // [hauteur, profondeur avant, profondeur]
    const p = this.wallPen(side, a0, a1), L = a1 - a0;
    let prev = null;
    rows.forEach(([h, d], i) => {
      const n = Math.max(2, Math.floor((a1 - a0) / 0.3)), fill = [];
      for (let k = 0; k < n; k++) fill.push(this.rng.pick(colors));
      this.wallBlock(side, a0, a1, h, rows[i + 1]?.[0] ?? h + 0.12, d, 0xf5f5f5, null, 'none'); // gradin plein jusqu'au suivant (bacs compris)
      if (side === 'L') this.board('v', a0 + 0.05, a1 - 0.05, 0.17 + d / 2, h + 0.05, d - 0.06, 0.3, Math.PI / 2, null, { pad: 0.03 });
      else if (side === 'R') this.board('v', a0 + 0.05, a1 - 0.05, this.W - 0.17 - d / 2, h + 0.05, d - 0.06, 0.3, -Math.PI / 2, null, { pad: 0.03 });
      else this.board('u', a0 + 0.05, a1 - 0.05, this.D - 0.12 - d / 2, h + 0.05, d - 0.06, 0.3, this.faceFront, null, { pad: 0.03 });
      candyBins(p, L, h, d + 0.01, fill, prev);
      prev = [h, d + 0.01];
    });
  }
  // cloison basse ou pleine (cabine, salle d'examen) avec collision
  partition(u0, v0, u1, v1, h = 2.3, color = 0xe8e4dc) {
    this.solid(u0, v0, u1, v1, 0, h);
    const along = Math.abs(u1 - u0) >= Math.abs(v1 - v0);
    partitionWall(this.penAt((u0 + u1) / 2, (v0 + v1) / 2, along ? this.faceFront : this.ryOf(1, 0)), along ? Math.abs(u1 - u0) : Math.abs(v1 - v0), along ? Math.abs(v1 - v0) : Math.abs(u1 - u0), h, color);
  }
  // panneau lumineux (enseigne intérieure, menus) : texture canvas dans un caisson alu, s'éteint avec le courant
  litPanel(side, a0, a1, h0, h1, tex) {
    const W = this.W, D = this.D, w = a1 - a0, hh = h1 - h0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: tex }));
    if (side === 'B') { m.position.set(this.X((a0 + a1) / 2), this.y + (h0 + h1) / 2, this.Z(D - 0.14)); m.rotation.y = this.faceFront; }
    else if (side === 'L') { m.position.set(this.X(0.19), this.y + (h0 + h1) / 2, this.Z((a0 + a1) / 2)); m.rotation.y = Math.PI / 2; }
    else { m.position.set(this.X(W - 0.19), this.y + (h0 + h1) / 2, this.Z((a0 + a1) / 2)); m.rotation.y = -Math.PI / 2; }
    m.matrixAutoUpdate = false; m.updateMatrix();
    this.c.zone.group.add(m); this.c.zone.signMats.push(m.material);
    const p = this.wallPen(side, a0, a1, null, (h0 + h1) / 2);
    p.box(FU, -w / 2, -hh / 2, 0, w / 2, hh / 2, 0.025, 0x1c1d20, 'xXyY');                                  // caisson
    frame(p, w, hh, 0.022, side === 'B' ? 0.034 : 0.034, 0xb9bec3);                                          // cadre alu
    return m;
  }
  // affiche ou cadre décoratif (éclairé par la scène) dans une baguette
  wallPicture(side, a, h, w, hh, tex) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    if (side === 'B') { m.position.set(this.X(a), this.y + h, this.Z(this.D - 0.135)); m.rotation.y = this.faceFront; }
    else if (side === 'L') { m.position.set(this.X(0.185), this.y + h, this.Z(a)); m.rotation.y = Math.PI / 2; }
    else { m.position.set(this.X(this.W - 0.185), this.y + h, this.Z(a)); m.rotation.y = -Math.PI / 2; }
    m.matrixAutoUpdate = false; m.updateMatrix(); this.c.zone.group.add(m);
    const p = this.wallPen(side, a - w / 2, a + w / 2, null, h);
    p.box(FU, -w / 2, -hh / 2, 0, w / 2, hh / 2, 0.022, 0x2a2a2a, 'xXyY');
    frame(p, w, hh, 0.03, 0.033, 0x3a2a1e);
    return m;
  }
  // cadres photo en grille sur un mur (baguette, passe-partout, tirage)
  frames(side, a0, a1, h0, h1, palette) {
    for (let a = a0; a < a1 - 0.3; a += this.rng.range(0.45, 0.7)) for (let h = h0; h < h1 - 0.25; h += this.rng.range(0.4, 0.55)) {
      const w = this.rng.range(0.25, 0.4), hh = this.rng.range(0.2, 0.32), photo = this.rng.pick(palette);
      const p = this.wallPen(side, a, a + w, null, h + hh / 2);
      p.box(FU, -w / 2 + 0.02, -hh / 2 + 0.02, 0.006, w / 2 - 0.02, hh / 2 - 0.02, 0.014, 0xf4f1ea, 'Z');            // passe-partout
      p.box(FU, -w / 2 + 0.05, -hh / 2 + 0.05, 0.014, w / 2 - 0.05, hh / 2 - 0.05, 0.0145, photo, 'Z');             // tirage
      frame(p, w - 0.04, hh - 0.04, 0.02, 0.024, this.frng.next() < 0.6 ? 0x1e1e1e : 0x8a6a48);
    }
  }

  // réserve : rayonnages de stockage, cartons, bureau
  backroom() {
    const s = this.c.shop, zn = this.id + '_back';
    const D0 = this.D + 0.12, D1 = Math.abs(this.c.zB - this.c.zF) - 0.12;
    // étagères au fond (en évitant la porte de service et, au rez-de-chaussée, la grille de ventilation)
    const vx = s.floor ? null : ventXForShop(s) - this.c.x0;
    const segs = (vx === null ? [[2.4, this.W - 2.6]] : [[2.4, Math.min(vx - 1.0, this.W - 0.3)], [vx + 1.0, this.W - 2.6]]).filter(([a, b]) => b - a > 1.2);
    const tmpD = this.D; this.D = D1 + 0.12;
    for (const [a, b] of segs) this.wallShelf('B', a, b, 3, 2.2, 0.6, 0x7a7f84, zn, { rack: true });
    this.D = tmpD;
    // cartons de stock (conteneurs)
    const items = (s.items || []).map(e => e[0]);
    const nBoxes = Math.min(6, 2 + s.w * 2);
    for (let i = 0; i < nBoxes; i++) {
      const u = 0.6 + (i % 3) * 0.7, v = D0 + 0.6 + Math.floor(i / 3) * 0.6;
      const contents = items.length ? [this.rng.pick(items), this.rng.pick(items)].filter((x, k, a) => ITEMS[x] && (k === 0 || x !== a[0])) : [];
      this.P.back.push({ def: 'cardboard_box', x: this.X(u + 0.3), y: this.y, z: this.Z(v + 0.25), ry: this.rng.range(-0.2, 0.2), zone: zn, contents, stack: i % 2 });
    }
    // bureau de réserve : contre le mur du fond, dans l'angle droit (après les rayonnages), hors du passage qui va de
    // la porte de la réserve à la porte de service ; le coffre éventuel dans l'angle, à côté du bureau
    const du = this.W - 1.6, dv = D1 - 0.36;
    this.solid(du - 0.7, dv - 0.35, du + 0.7, dv + 0.35, 0, 0.75, zn);
    desk(this.penAt(du, dv, this.faceFront, zn), 1.4, 0.7, 0.75, 0x6d5a48);
    this.P.backDesk = { x: this.X(du), y: this.y + 0.75, z: this.Z(dv), zone: zn, safe: { x: this.X(this.W - 0.55), y: this.y, z: this.Z(dv), ry: this.faceFront, zone: zn } };
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
    // caisses : garde-corps côté client (allée de 0,8 m le long du tapis), la caissière garde sa place de l'autre côté
    for (let i = 0; i < 4; i++) {
      const u = 4 + i * 4; L.checkout(u, 1.6, u + 0.8, 3.6, 0.9, 0x37474f);
      if (L.sg > 0) L.laneRail(u - 0.95, 1.6, u - 0.8, 3.6, 0.6); else L.laneRail(u + 1.6, 1.6, u + 1.75, 3.6, 0.6);
    }
    // gondoles
    for (const v of [5.4, 7.4]) for (const [a, b] of [[1.5, 11.5], [13.5, 23.5], [25.5, 35.5], [37.5, 45.2]]) L.island(a, b, v, 5, 1.8, 0xe0e0e0, 1.0);
    L.wallShelf('B', 0.8, W - 2.4, 5, 2.2, 0.5, 0xd8d8d8);
    L.wallShelf('L', 4.2, D - 0.8, 5, 2.2, 0.5, 0xd8d8d8);
    // fruits & légumes : étals inclinés
    for (const u of [28, 32, 36, 40]) L.table(u, 1.2, u + 3, 2.6, 0.8, 0x6d4c41, 2, { style: 'stall' });
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
    L.wallBlock('L', 1.2, D - 0.6, 0, 0.9, 0.53, 0x263238, null, 'doors', { top: 0x1b2227, doors: 0.8 }); L.wallBlock('R', 1.2, D - 0.6, 0, 0.9, 0.53, 0x263238, null, 'doors', { top: 0x1b2227, doors: 0.8 }); // meubles TV
    L.board('v', 1.3, D - 0.7, 0.45, 0.9, 0.45, 0.6, Math.PI / 2, null, { pad: 0.025 }); L.board('v', 1.3, D - 0.7, W - 0.45, 0.9, 0.45, 0.6, -Math.PI / 2, null, { pad: 0.025 });
    // électroménager le long de la cloison
    for (let u = 1.2; u < W - 2.5; u += 0.9) L.wallFloor('B', u);
    // îlots de petit électroménager (comptoirs)
    for (const [a, b] of [[3, 10.5], [13.5, 21]]) {
      L.podium(a, 5.8, b, 6.8, 0.9, 0xeceff1);
      for (let u = a + 0.5; u < b - 0.3; u += 0.9) { L.counterSpot(u, 6.05, 0.9, L.faceFront); L.counterSpot(u + 0.3, 6.55, 0.9, L.faceIn); }
      L.board('u', a + 0.1, b - 0.1, 6.3, 0.9, 0.9, 0.7, L.faceFront, null, { pad: 0.05 });
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
    L.wallBlock('L', 2.0, 7.5, 0, 0.8, 0.73, 0x1a1a2e, null, 'doors', { top: 0x2b2546, doors: 0.9 }); // bornes de démonstration
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
    L.wallBlock('L', 1.2, 4.4, 0, 1.0, 0.73, 0x3e2723, null, 'doors', { top: 0x2a1a14 });
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
    const kinds = s.id === 'costumes' ? ['coat', 'dress', 'coat', 'tee'] : ['dress', 'tee', 'coat', 'pants', 'tee'];
    for (const u of front) L.rack(u, u + 2.2, 2.6, colors, 1.5, kinds);
    for (let u = 1.6; u + 2.2 <= W - 2.6; u += 3.2) L.table(u, 6.0, u + 2.2, 6.9, 0.8, 0x6d4c41, 1);
    L.wallShelf('L', 1.6, D - 3.4, 4, 2.0, 0.45, 0xbcaaa4);
    L.counter(W - 2.8, 1.0, W - 1.0, 1.8, 1.0, s.color);
    // cabines d'essayage
    const nCab = s.w > 1 ? 4 : 2;
    for (let i = 0; i < nCab; i++) {
      const u0 = 0.4 + i * 1.3, v0 = D - 1.5;
      L.solid(u0, v0, u0 + 0.06, D - 0.15, 0, 2.2); L.solid(u0 + 1.24, v0, u0 + 1.3, D - 0.15, 0, 2.2);
      // rideau tiré aux deux tiers (cabine libre) : on entre par la partie ouverte, la partie tirée et le pouf arrêtent
      const fp = L.penAt(u0 + 0.65, v0, L.faceFront);
      const fr = fittingRoom(fp, 1.3, D - 0.15 - v0, 0x6d4c41, s.id === 'costumes' ? 0x4a148c : 0x880e4f, () => L.frng.next(), 0.58 + L.frng.next() * 0.14);
      for (const [[a0, b0, a1, b1], h] of [[fr.curtain, 1.95], [fr.pouf, 0.45]]) {
        const p0 = fp.world(a0, 0, b0), p1 = fp.world(a1, 0, b1);
        L.world.physics.add(new Box(p0.x, L.y, p0.z, p1.x, L.y + h, p1.z, LAYER.FURN, null));
      }
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
    const W = L.W, sg = L.sg; const D = Math.abs(L.c.zB - L.c.zF) - 0.3, H = L.H;
    const y = L.y;
    // hall : comptoir, machine à pop-corn, mur de la salle ; ses deux entrées donnent sur les couloirs latéraux
    L.counter(2, 1.0, 7, 1.8, 1.05, 0x1a237e);
    L.floorSpot(8.2, 1.4, L.faceFront);
    // confiserie : rayonnage mural du hall (friandises, boissons, programmes) — les articles n'attendent plus par terre
    L.wallShelf('R', 0.5, 2.75, 5, 1.9, 0.4, 0x1a237e, null, { back: 0x101a4a, backMetal: false });
    const ent = [[0.3, 1.6], [W - 1.6, W - 0.3]];
    L.A.wallX(L.id, 'plaster_3a2f4a', L.c.x0 + 0.15, L.c.x1 - 0.15, L.Z(3.2), y, y + 4.6, 0.2, ent.map(([a, b]) => ({ a: L.X(a), b: L.X(b), y0: y, y1: y + 2.4 })));
    for (const [a, b] of ent) doorCasing(L.penAt((a + b) / 2, 3.2, 0), b - a, 2.4, 0.2, 0x2a1a14, { lining: 0.03, arch: 0.09 }); // encadrements des entrées de salle
    cinemaPosters(L, 3.1, [10.2, 13.8]);                                                                   // affiches côté hall
    // gradins en stadium (13 rangs : A … M) : le rang A, au plus près de l'écran, est au niveau du sol, chaque rang
    // suivant 13 cm plus haut, le rang M devant le palier de la cabine de projection (pente vers le fond : chacun voit
    // l'écran par-dessus le rang de devant). Couloirs latéraux de plain-pied (u < 1,85) des entrées jusqu'à
    // l'avant-scène et à la porte de service ; escaliers de 1,9 m de part et d'autre des fauteuils (les marches sont les
    // gradins eux-mêmes), garde-corps côté couloir. Fauteuils au pas de 58 cm, accoudoirs partagés : chaque rangée
    // occupe toute sa marche, une boîte de collision par rangée.
    const rows = 13, rowD = 0.62, v0 = 4.4, rise = 0.13, pitch = (W - 8.4) / 27, red = 0x8e1b2e;
    const sA = 1.85, sB = W - 1.85, top = 3.3, rail = [[], []];
    for (let r = 0; r < rows; r++) {
      const v = v0 + (rows - 1 - r) * rowD; // rang A le plus proche de l'écran
      const h = r * rise;
      const va = r === rows - 1 ? top : v - 0.1, vb = v + rowD - 0.1; // marche du rang (le rang M se prolonge en palier)
      if (h > 0) { L.solid(sA, va, sB, vb, 0, h); cinemaStep(L.penAt(W / 2, (va + vb) / 2, L.faceIn), sB - sA, vb - va, h, 0x2a1a24); }
      for (let j = 0; j < 28; j++) cinemaSeat(L.penAt(4.2 + j * pitch, v + 0.28, L.faceIn, null, h), red);
      for (let j = 0; j <= 28; j++) cinemaArm(L.penAt(4.2 + (j - 0.5) * pitch, v + 0.28, L.faceIn, null, h), red);
      L.solid(3.85, v - 0.12, W - 3.85, v + 0.56, h, h + 1.05); // rangée de fauteuils (dossiers inclinés compris)
      if (h > 0.25) for (const [k, u] of [[0, sA + 0.05], [1, sB - 0.05]]) { // garde-corps (le bas des gradins reste ouvert sur le couloir)
        L.solid(u - 0.05, va, u + 0.05, vb, h, h + 1.0);
        rail[k].push([vb - 0.04, h]); if (r === rows - 1) rail[k].push([va + 0.06, h]);
      }
      for (let k = 0; k < 10; k++) {
        const u = 4.2 + k * ((W - 8.4) / 9);
        if (r === 12 && k === 2) { // Rang M, siège 13 (le 3e de la rangée, numérotés à partir de 11)
          L.world.points.rowM13 = new THREE.Vector3(L.X(u), y + h + 0.45, L.Z(v + 0.28));
          L.world.add(new Seat(L.world, L.world.newId('seat'), { zone: L.id, x: L.X(u), y: y + h, z: L.Z(v + 0.28), ry: L.faceIn, name: 'Rang M, siège 13' }));
        }
      }
    }
    for (const k of [0, 1]) stairRail(L.penAt(k ? sB - 0.05 : sA + 0.05, 0, L.faceIn), rail[k], 0.95, 0x8a9096);
    // écran (l'image est posée par le projecteur) : image 4/3, le format des films projetés, bordée par le cache de
    // velours noir ; elle tient sous le plafond. Le cache et le nez de scène s'arrêtent avant la porte de service.
    const sb = 0.9, scrH = 3.4, scrW = scrH * 4 / 3, m0 = 2.3;
    L.c.screen = { x: L.c.x0 + W / 2, y: y + sb + scrH / 2, z: L.c.zB - sg * 0.2, w: scrW, h: scrH, ry: L.faceFront };
    L.solid(m0, D - 0.1, W - m0, D, 0.4, H);
    const sp = L.penAt(W / 2, D + 0.098, L.faceFront), mt = H - 0.02, black = 0x0b0b0e;
    sp.box(FU, -W / 2 + m0, 0.4, 0, -scrW / 2, mt, 0.06, black, 'xXyZ'); sp.box(FU, scrW / 2, 0.4, 0, W / 2 - m0, mt, 0.06, black, 'xXyZ');
    sp.box(FU, -scrW / 2, 0.4, 0, scrW / 2, sb, 0.06, black, 'yYZ'); sp.box(FU, -scrW / 2, sb + scrH, 0, scrW / 2, mt, 0.06, black, 'yZ');
    sp.box(FU, -W / 2 + m0, 0, 0.0, W / 2 - m0, 0.4, 0.3, 0x1a1418, 'xXYZ');                                      // nez de scène
    L.solid(m0, D - 0.2, W - m0, D + 0.1, 0, 0.4);
    // velours du mur du fond au bout des couloirs (autour de la porte de service à gauche)
    const vel = 'wp_velvet_5a0f16', vb0 = D + 0.18, vb1 = D + 0.2, dr = 1.6; // dr : axe de la porte de service (rearX)
    for (const [a, b, h0] of [[0.15, dr - 0.62, 0], [dr - 0.62, dr + 0.62, 2.22], [dr + 0.62, m0, 0], [W - m0, W - 0.15, 0]]) L.mbox(vel, a, vb0, b, vb1, h0, H);
    // cabine de projection posée sur le palier haut, derrière le rang M ; le projecteur sur son toit, face à l'écran
    const bh = (rows - 1) * rise;
    L.solid(W / 2 - 0.8, top, W / 2 + 0.8, top + 0.95, 0, bh + 2.0);
    projBooth(L.penAt(W / 2, top + 0.475, L.faceIn, null, bh), 1.6, 0.95, 2.0, 0x263238);
    L.P.special.projector = { x: L.X(W / 2), y: y + bh + 2.0, z: L.Z(top + 0.62), ry: L.faceIn };
  },
  salon(L, s) {
    const W = L.W, D = L.D;
    for (let k = 0; k < 4; k++) { L.floorSpot(1.6, 2.0 + k * 1.8, -Math.PI / 2); L.wallHigh('L', 2.0 + k * 1.8, 1.6); }
    L.wallBlock('L', 1.4, D - 1.0, 0, 0.85, 0.43, 0xf5f5f5, null, 'doors', { top: 0xe8e2dc, doors: 0.45 }); L.board('v', 1.5, D - 1.1, 0.4, 0.85, 0.35, 0.5, Math.PI / 2, null, { noLabels: true }); // coiffeuses
    L.wallFloor('B', W - 3); L.wallFloor('B', W - 4.5);
    L.wallShelf('R', 1.6, D - 1.0, 4, 2.0, 0.4, 0xf8bbd0);
    L.counter(W - 2.8, 1.0, W - 1.0, 1.7, 1.0, 0xf06292);
    L.floorSpot(3.2, 1.0, L.faceIn);
  },
  music(L, s) {
    const W = L.W, D = L.D;
    L.wallFloor('L', 2.4); L.wallFloor('L', 5.2); // piano droit, orgue
    L.solid(0.25, 7.05, 0.75, 8.15, 0, 0.78); keyboardStand(L.penAt(0.5, 7.6, Math.PI / 2), 1.0, 0.78); // clavier de synthèse sur son stand
    L.counterSpot(0.5, 7.6, 0.78, Math.PI / 2);
    L.floorSpot(W * 0.5, 6.6, L.faceFront, null, 0.12);                  // batterie, posée sur l'estrade
    L.solid(W * 0.5 - 1.2, 5.6, W * 0.5 + 1.2, 7.6, 0, 0.12); stage(L.penAt(W * 0.5, 6.6, L.faceFront), 2.4, 2.0, 0.12, 0x5d4037); // estrade de démonstration
    L.wallShelf('R', 1.6, D - 0.8, 4, 2.1, 0.45, 0x8d6e63, null, { metal: false, back: 0x5d4037, uprights: 0x4e342e });
    L.wallShelf('B', 3.0, W - 2.4, 4, 2.1, 0.4, 0x8d6e63, null, { metal: false, back: 0x5d4037, uprights: 0x4e342e });
    // guitares debout sur un socle, devant un panneau rainuré, dans l'angle du fond (trop hautes pour les étagères,
    // elles traînaient par terre) ; la planche n'accepte que les instruments à manche plus hauts que les étagères
    // (guitares, basse, violon) ; les ukulélés vont sur les étagères et laissent la place à la basse
    L.wallBlock('B', 0.35, 2.85, 0, 0.12, 0.45, 0x4e342e, null, 'plain');
    L.wallPanel('B', 0.3, 2.9, 0.12, 1.75, 'wp_slat_6d4c41_3e2723', 0.02);
    L.board('u', 0.4, 2.8, D - 0.12 - 0.225, 0.12, 0.42, 1.25, L.faceFront, null, { pad: 0.03, shapes: ['guitar'], minH: 0.58 });
    L.solid(0.35, D - 0.57, 2.85, D - 0.12, 0.12, 1.25); // on ne marche pas dans les guitares
    L.table(1.6, 1.4, 4.2, 2.4, 0.8, 0x5d4037, 2);
    L.counter(W - 2.8, 1.0, W - 1.0, 1.7, 1.0, 0x6d4c41);
  },
  pets(L, s) {
    const W = L.W, D = L.D;
    L.wallBlock('L', 1.4, D - 0.8, 0, 0.75, 0.63, 0x37474f, null, 'doors', { top: 0x263238, doors: 0.55 }); // meubles d'aquariums
    // aquariums posés sur les meubles (dos contre le mur : le décalage de profondeur est ajouté au placement)
    L.P.wallFloor.push(...[2.2, 4.4, 6.6].map(a => ({ x: L.X(0.19), y: L.y + 0.75, z: L.Z(a), ry: Math.PI / 2, zone: L.id, wall: 'L', raised: true })));
    L.wallBlock('R', 4.4, 6.6, 0, 0.75, 0.63, 0x37474f, null, 'doors', { top: 0x263238, doors: 0.55 });
    L.P.wallFloor.push({ x: L.X(W - 0.19), y: L.y + 0.75, z: L.Z(5.5), ry: -Math.PI / 2, zone: L.id, wall: 'R', raised: true });
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
    L.solid(4.5, 5.5, 7.5, 6.5, 0, 0.76); desk(L.penAt(6.0, 6.0, L.faceIn), 3.0, 1.0, 0.76, 0x4e342e, { frame: 0x3e2723 }); // bureau du directeur
    L.counterSpot(5.0, 5.9, 0.76, L.faceFront); L.counterSpot(6.0, 5.9, 0.76, L.faceFront); L.counterSpot(7.0, 5.9, 0.76, L.faceFront);
    L.board('u', 4.6, 7.4, 6.0, 0.76, 0.9, 0.6, L.faceFront, null, { noLabels: true });
    L.floorSpot(6, 6.9, L.faceFront);
    L.wallShelf('L', 2.0, D - 1.0, 5, 2.2, 0.35, 0x5d4037, null, { metal: false, back: 0x4e342e });
    L.solid(W - 1.2, 2.0, W - 0.3, 4.5, 0, 0.45); L.solid(W - 0.5, 2.0, W - 0.3, 4.5, 0.45, 0.95); // canapé de cuir
    L.solid(W - 1.2, 2.0, W - 0.5, 2.2, 0.45, 0.69); L.solid(W - 1.2, 4.3, W - 0.5, 4.5, 0.45, 0.69); // accoudoirs
    sofa(L.penAt(W - 0.75, 3.25, L.ryOf(-1, 0)), { L: 2.5, D: 0.9, h: 0.45, color: 0x3e2723, mat: FU });
    L.P.special.safe = { x: L.X(W - 0.7), y: L.y, z: L.Z(D - 0.7), ry: -Math.PI / 2 };
    L.table(1.0, 1.0, 2.2, 1.8, 0.9, 0x5d4037);
    L.floorSpot(2.0, 4.0, Math.PI / 2);
    L.floorSpot(3.0, D - 1.0, L.faceFront);
  },
  staff(L, s) {
    const W = L.W, D = L.D;
    for (let a = 1.6; a < D - 0.6; a += 0.5) L.wallFloor('L', a);
    L.table(3.6, 6.0, 6.6, 7.4, 0.75, 0xe6e1d8, 1, { legs: 0x9aa0a6 });
    L.floorSpot(3.3, 6.7, Math.PI / 2); L.floorSpot(6.9, 6.7, -Math.PI / 2); L.floorSpot(5.1, 5.6, L.faceIn); L.floorSpot(5.1, 7.8, L.faceFront);
    L.solid(3.0, D - 0.8, 6.6, D - 0.15, 0, 0.92); cabinet(L.penAt(4.8, D - 0.15, L.faceFront), { L: 3.6, depth: 0.65, h: 0.92, color: 0xd7ccc8, style: 'doors', top: 0x6d6a66 }); // kitchenette
    L.counterSpot(3.5, D - 0.5, 0.92, L.faceFront); L.counterSpot(4.5, D - 0.5, 0.92, L.faceFront);
    L.board('u', 5.0, 6.5, D - 0.5, 0.92, 0.5, 0.5, L.faceFront, null, { noLabels: true });
    L.wallFloor('R', 2.0); L.wallFloor('R', 3.4);
    L.wallHigh('R', 6.0, 1.6);
    L.floorSpot(9.2, 2.2, -Math.PI / 2);
  },
  toilets(L, s) {
    const W = L.W, D = L.D;
    // cabines : séparations stratifiées sur pieds, pilastres, bandeau haut, portes ouvertes rabattues
    const lam = 0x90a4ae;
    for (let k = 0; k < 5; k++) {
      const u0 = k < 4 ? 0.3 + k * 1.6 : 6.7;
      L.solid(u0, D - 2.0, u0 + 0.05, D - 0.15, 0, 2.0);
      wcDivider(L.penAt(u0 + 0.025, D - 1.075, L.ryX(0, -1)), 1.85, 1.9, lam);
      if (k < 4) {
        L.P.special.toilets = L.P.special.toilets || [];
        L.P.special.toilets.push({ x: L.X(u0 + 0.8), y: L.y, z: L.Z(D - 0.5), ry: L.faceFront });
        wcDoor(L.penAt(u0 + 0.073, D - 2.0, L.ryX(0, 1)), 0.62, 1.9, shade(lam, 0.12));
      }
    }
    const hp = L.penAt(3.525, D - 2.0, L.faceFront); hp.rbox(FU, -3.225, 1.95, -0.04, 3.225, 2.05, 0.0, 0.006, shade(lam, -0.1)); // bandeau des cabines
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
      // l'identifiant prime sur l'usage (téléviseur cathodique : sur un comptoir, pas au mur ; four à pizza : au sol)
      let cat = PLACE[defId] || PLACE[def.use] || (def.s[1] > 1.2 ? 'wallFloor' : def.s[1] < 0.5 ? 'counter' : 'floor');
      if (defId === 'register') cat = 'register';
      if (def.shape === 'arcade' || def.shape === 'claw' || defId === 'token_machine' || defId === 'basket_machine') cat = 'wallFloor';
      if (defId === 'mannequin' || defId === 'chair' || defId === 'kiddie_ride' || defId === 'salon_chair' || defId === 'drum_kit' || defId === 'air_hockey' || defId === 'tent' || defId === 'bike' || defId === 'basket_hoop' || defId === 'massage_chair' || defId === 'bench' || defId === 'parrot_cage' || defId === 'hamster_cage' || defId === 'gumball_machine' || defId === 'cotton_candy_machine' || defId === 'office_chair' || defId === 'dance_machine') cat = 'floor';
      let spot = null, got = cat; // got : catégorie de l'emplacement réellement obtenu (repli : la hauteur en dépend)
      if (defId === 'safe') spot = P.special.safe || P.backDesk?.safe || null;
      else if (defId === 'projector') spot = P.special.projector;
      else if (defId === 'toilet') spot = P.special.toilets?.shift();
      else if (defId === 'conveyor') { spot = P.counter.length ? { ...P.counter.shift() } : null; got = 'counter'; }
      else for (const c of [cat, 'floor', 'wallFloor', 'counter']) { spot = take(c); if (spot) { got = c; break; } }
      if (!spot) { console.warn('pas de place pour', defId, 'dans', s.id); continue; }
      const h = def.s[1];
      let yy = spot.y + (got === 'wallHigh' ? 0 : h / 2);
      let x = spot.x, z = spot.z;
      // décaler les objets muraux selon leur profondeur
      if (spot.wall) {
        const off = (def.s[2] / 2) + 0.02;
        if (spot.wall === 'L') x += off; else if (spot.wall === 'R') x -= off; else z -= ctl.sg * off;
      }
      if (got === 'wallHigh' && defId === 'tv') yy = spot.y;
      const d = dev(defId, spot.zone || s.id, x, yy, z, spot.ry, { shop: s.id, index: i });
      if (d) { ctl.devices.push(d); if (defId === 'register') ctl.registers.push(d); }
    }
  }
  // articles (produits) : planches puis sol
  const boards = P.boards;
  const floorSpots = P.floor;
  // appareils posés sur une planche (podium de démonstration, bureau, établi) : les articles laissent leur place libre
  // (intervalles le long de la planche, repris par le réassort)
  for (const b of boards) b.blocked = [];
  for (const d of ctl.devices) {
    const p = d.group?.position, e = d.ext; if (!p || !e) continue;
    for (const b of boards) {
      if (Math.abs(p.y - e[1] - b.y) > 0.04) continue;
      const q0 = b.ax === 'x' ? p.z - e[2] : p.x - e[0], q1 = b.ax === 'x' ? p.z + e[2] : p.x + e[0];
      if (q1 <= b.c - b.depth / 2 || q0 >= b.c + b.depth / 2) continue;
      const a0 = (b.ax === 'x' ? p.x - e[0] : p.z - e[2]) - 0.03, a1 = (b.ax === 'x' ? p.x + e[0] : p.z + e[2]) + 0.03;
      if (a1 > b.a0 && a0 < b.a1) b.blocked.push([a0, a1]);
    }
  }
  for (const b of boards) b.blocked.sort((m, n) => m[0] - n[0]);
  // les rayons du magasin d'abord, ceux de la réserve ensuite (un article trop grand pour les rayons ne doit pas
  // entraîner tous les suivants en réserve) ; on reste sur la même planche tant qu'elle a de la place (rayons cohérents)
  const shopBoards = boards.filter(b => !String(b.zone).endsWith('_back')), backBoards = boards.filter(b => String(b.zone).endsWith('_back'));
  const cursor = new Map([[shopBoards, 0], [backBoards, 0]]);
  const tryBoards = (list, def) => {
    const w = def.s[0], h = def.s[1], dpt = def.s[2], start = cursor.get(list);
    for (let tries = 0; tries < list.length; tries++) {
      const k = (start + tries) % list.length, b = list[k];
      if (h > b.clear || dpt > b.depth + 0.15 || (b.shapes && !b.shapes.includes(def.shape)) || h < (b.minH || 0)) continue;
      const len = b.a1 - b.a0;
      for (const [x0, x1] of b.blocked) if (b.a0 + b.cur + w + 0.03 > x0 && b.a0 + b.cur < x1) b.cur = x1 - b.a0; // appareil : on passe derrière
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
