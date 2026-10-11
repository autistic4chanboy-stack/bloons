// Plan du Centre Commercial Hélios (hors intérieurs de magasins, voir shopbuilder.js).
//
//  Rez-de-chaussée (y = 0)                     Étage (y = 5)              Sous-sol (y = -4.5)
//  x : -112 … -80  entrepôt                    x : -80 … -76 aile ouest   x : -80 … -76 couloir technique
//  x :  -80 … -76  aile ouest (couloir)        x : -76 … -66 archives     x : -76 … -66 groupe, tableau, régie, chaufferie
//  x :  -76 … -66  réserve / POSTE / vestiaire x : -66 …  66 galerie      x : -88 … -80 B-13
//  x :  -66 …  66  galerie + magasins          x :  66 …  80 mezzanine    x : -66 …  66 parking
//  x :   66 …  80  hall d'entrée               toit : y = 10.5            rampe : x 66 … 98
import * as THREE from 'three';
import { Arch } from './arch.js';
import { Zone } from './world.js';
import { Box, LAYER } from '../engine/physics.js';
import { Door, Shutter, GlassPane, LightSwitch, Readable, Seat, Container, Locker, VentGrate } from './fixtures.js';
import { buildShops, shopX, ventXForShop } from './shopbuilder.js';
import { SHOPS } from '../data/shops.js';
import { posterTexture, signTexture, buildingFacade, textTexture } from '../engine/textures.js';
import { RNG } from '../engine/rng.js';

export const Y0 = 0, Y1 = 5, YB = -4.5, YR = 10.5;
export const CEIL0 = 4.6, CEIL1 = 10;

export function buildMall(world) {
  const g = world.game;
  const A = new Arch(world);
  const nav = world.nav;
  const rng = new RNG('helios-1987');
  const dev = (def, zone, x, y, z, ry = 0, o = {}) => g.devices.create(def, zone, new THREE.Vector3(x, y, z), ry, o);
  const doors = {};
  const door = (key, o) => { const d = new Door(world, world.newId('door'), o); world.add(d); doors[key] = d; return d; };
  const N = (id, x, y, z, zone, tags) => nav.node(id, x, y, z, zone, tags);
  const L = (a, b, o) => nav.link(a, b, o);

  // ═══════════════════════════ ZONES ═══════════════════════════
  const Z = (id, name, type, floor, b, o = {}) => world.addZone(new Zone(id, name, type, floor, ...b, o));
  Z('security', 'Poste de sécurité', 'security', 0, [-76, 0, -5, -66, 3.6, 5], { circuit: 'security', area: 'security', lightColor: [1, 0.78, 0.5], lightLevel: 0.6, cull: 40 });
  Z('secstore', 'Réserve de sécurité', 'backroom', 0, [-76, 0, -22, -66, 4.6, -5], { circuit: 'service', area: 'security' });
  Z('vestiaire', 'Vestiaire des gardiens', 'toilets', 0, [-76, 0, 5, -66, 4.6, 13], { circuit: 'service', area: 'security' });
  Z('stairsW', 'Escalier de service ouest', 'stairs', 0, [-76, -4.5, 13, -66, 13.5, 22], { circuit: 'service', area: 'service' });
  Z('westwing0', 'Aile ouest — couloir', 'corridor', 0, [-80, 0, -25, -76, 4.6, 25], { circuit: 'service', area: 'service' });
  Z('westwing1', 'Aile ouest — couloir (étage)', 'corridor', 1, [-80, 5, -25, -76, 10, 25], { circuit: 'service', area: 'service' });
  Z('archives', 'Archives', 'backroom', 1, [-76, 5, -22, -66, 10, 13], { circuit: 'service', area: 'gallery1' });
  Z('gallery0_w', 'Galerie RDC — ouest', 'corridor', 0, [-66, 0, -8, -24, 4.6, 8], { circuit: 'gallery', area: 'gallery0', cull: 70 });
  Z('atrium', 'Atrium', 'atrium', 0, [-24, 0, -8, 24, 12, 8], { circuit: 'gallery', area: 'gallery0', cull: 80 });
  Z('gallery0_e', 'Galerie RDC — est', 'corridor', 0, [24, 0, -8, 66, 4.6, 8], { circuit: 'gallery', area: 'gallery0', cull: 70 });
  Z('gallery1_w', 'Galerie étage — ouest', 'corridor', 1, [-66, 5, -8, -24, 10, 8], { circuit: 'gallery', area: 'gallery1', cull: 70 });
  Z('gallery1_e', 'Galerie étage — est', 'corridor', 1, [24, 5, -8, 66, 10, 8], { circuit: 'gallery', area: 'gallery1', cull: 70 });
  Z('entrance', 'Hall d\'entrée', 'atrium', 0, [66, 0, -8, 80, 4.6, 8], { circuit: 'gallery', area: 'entrance', cull: 70 });
  Z('mezzanine', 'Mezzanine', 'corridor', 1, [66, 5, -8, 80, 10, 8], { circuit: 'gallery', area: 'gallery1' });
  Z('stairsE', 'Escalier de service est', 'stairs', 0, [66, -4.5, 8, 80, 10, 22], { circuit: 'service', area: 'service' });
  Z('trash', 'Local poubelles', 'backroom', 0, [66, 0, -22, 80, 4.6, -8], { circuit: 'service', area: 'service' });
  Z('hvac', 'Local de ventilation', 'backroom', 1, [66, 5, -22, 80, 10, -8], { circuit: 'service', area: 'service' });
  Z('service_s0', 'Couloir de service sud (RDC)', 'corridor', 0, [-76, 0, -25, 80, 4.6, -22], { circuit: 'service', area: 'service', cull: 60 });
  Z('service_n0', 'Couloir de service nord (RDC)', 'corridor', 0, [-76, 0, 22, 80, 4.6, 25], { circuit: 'service', area: 'service', cull: 60 });
  Z('service_s1', 'Couloir de service sud (étage)', 'corridor', 1, [-76, 5, -25, 80, 10, -22], { circuit: 'service', area: 'service', cull: 60 });
  Z('service_n1', 'Couloir de service nord (étage)', 'corridor', 1, [-76, 5, 22, 80, 10, 25], { circuit: 'service', area: 'service', cull: 60 });
  Z('westwingB', 'Couloir technique', 'basement', -1, [-80, -4.5, -24, -76, -0.6, 22], { circuit: 'basement', area: 'basement' });
  Z('generator', 'Local du groupe électrogène', 'basement', -1, [-76, -4.5, -24, -66, -0.6, -12], { circuit: 'basement', area: 'basement' });
  Z('electrical', 'Local électrique', 'basement', -1, [-76, -4.5, -12, -66, -0.6, -2], { circuit: 'basement', area: 'basement' });
  Z('pa', 'Régie d\'annonces', 'backroom', -1, [-76, -4.5, -2, -66, -0.6, 6], { circuit: 'basement', area: 'basement' });
  Z('boiler', 'Chaufferie', 'basement', -1, [-76, -4.5, 6, -66, -0.6, 13], { circuit: 'basement', area: 'basement' });
  Z('b13', 'Local B-13', 'backroom', -1, [-88, -4.5, -10, -80, -0.6, -4], { circuit: null, area: 'b13' });
  Z('garage', 'Parking souterrain', 'garage', -1, [-66, -4.5, -24, 66, -0.6, 24], { circuit: 'garage', area: 'garage', cull: 80 });
  Z('ramp', 'Rampe du parking', 'garage', -1, [66, -4.5, -7, 100, 1, -2], { circuit: 'garage', area: 'garage' });
  Z('warehouse', 'Entrepôt', 'warehouse', 0, [-112, 0, -25, -80, 8, 5], { circuit: 'service', area: 'warehouse', cull: 60 });
  Z('roof', 'Toit', 'roof', 2, [-82, 10.4, -27, 82, 16, 27], { circuit: 'roof', area: 'roof', outdoor: true, cull: 120 });
  Z('vent_s', 'Conduit sud', 'vent', 0, [-79.1, 3.5, -24.1, 66, 4.55, -22.9], { area: 'vents', cull: 35 });
  Z('vent_n', 'Conduit nord', 'vent', 0, [-79.1, 3.5, 22.9, 66, 4.55, 24.1], { area: 'vents', cull: 35 });
  Z('vent_w', 'Conduit ouest', 'vent', 0, [-79.1, 3.5, -24.1, -77.9, 4.55, 24.1], { area: 'vents', cull: 35 });
  Z('vent_sec', 'Conduit du poste', 'vent', 0, [-79, 3.2, -0.6, -68.3, 4.55, 0.6], { area: 'vents', cull: 35 });
  Z('outside', 'Parking extérieur', 'outside', 0, [80, -1, -120, 260, 30, 120], { area: 'outside', outdoor: true, alwaysVisible: true });

  // ═══════════════════════════ GALERIE ═══════════════════════════
  // Sol RDC galerie + atrium
  A.floor('gallery0_w', 'terrazzo', -66, -8, -24, 8, 0, 0.6, { faces: 'Y' });
  A.floor('atrium', 'terrazzo', -24, -8, 24, 8, 0, 0.6, { faces: 'Y' });
  A.floor('gallery0_e', 'terrazzo', 24, -8, 66, 8, 0, 0.6, { faces: 'Y' });
  // Dalle de l'étage avec le vide de l'atrium
  A.slabWithHoles('gallery1_w', 'terrazzo', -66, -8, -24, 8, 5, 0.4, [], { faces: 'Y' });
  A.slabWithHoles('atrium', 'terrazzo', -24, -8, 24, 8, 5, 0.4, [{ x0: -24, z0: -4, x1: 24, z1: 4 }], { faces: 'xXzZY' });
  A.slabWithHoles('gallery1_e', 'terrazzo', 24, -8, 66, 8, 5, 0.4, [], { faces: 'Y' });
  // Plafond RDC (dessous de la dalle)
  A.ceiling('gallery0_w', 'ceiling', -66, -8, -24, 8, 4.6, 0.02, { collide: false });
  A.ceiling('gallery0_e', 'ceiling', 24, -8, 66, 8, 4.6, 0.02, { collide: false });
  for (const [x0, x1, z0, z1] of [[-24, 24, -8, -4], [-24, 24, 4, 8]]) A.ceiling('atrium', 'ceiling', x0, z0, x1, z1, 4.6, 0.02, { collide: false });
  // Plafond étage (dessous du toit) avec la verrière
  A.ceiling('gallery1_w', 'ceiling', -66, -8, -24, 8, 10, 0.02, { collide: false });
  A.ceiling('gallery1_e', 'ceiling', 24, -8, 66, 8, 10, 0.02, { collide: false });
  for (const [x0, x1, z0, z1] of [[-24, 24, -8, -4], [-24, 24, 4, 8]]) A.ceiling('atrium', 'ceiling', x0, z0, x1, z1, 10, 0.02, { collide: false });
  // Néons de la galerie
  for (let x = -63; x <= 63; x += 6) {
    const zn0 = x < -24 ? 'gallery0_w' : x > 24 ? 'gallery0_e' : 'atrium';
    const zn1 = x < -24 ? 'gallery1_w' : x > 24 ? 'gallery1_e' : 'atrium';
    if (Math.abs(x) > 24) { A.panel(zn0, x, 4.6, 0, 2.4, 0.5, (x + 63) % 12 === 0); A.panel(zn1, x, 10, 0, 2.4, 0.5, (x + 63) % 12 === 0); }
    else { A.panel(zn0, x, 4.6, -6, 2.4, 0.4, (x + 63) % 12 === 0); A.panel(zn0, x, 4.6, 6, 2.4, 0.4, false); A.panel(zn1, x, 10, -6, 2.4, 0.4, (x + 63) % 12 === 0); A.panel(zn1, x, 10, 6, 2.4, 0.4, false); }
  }
  // Rambardes vitrées autour du vide
  const rail = (x0, z0, x1, z1) => {
    const zone = 'atrium';
    A.box(zone, 'chrome', x0, 6.05, z0 - 0.04, x1, 6.12, z1 + 0.04, { collide: false });
    A.box(zone, 'glass', x0, 5, z0 - 0.015, x1, 6.05, z1 + 0.015, { collide: false });
    world.physics.add(new Box(Math.min(x0, x1) - 0.05, 5, Math.min(z0, z1) - 0.06, Math.max(x0, x1) + 0.05, 6.15, Math.max(z0, z1) + 0.06, LAYER.GLASS));
  };
  rail(-24, -4, 24, -4); rail(-24, 4, 24, 4);
  rail(-24, -4, -24, -2.7); rail(-24, 2.7, -24, 4); rail(24, -4, 24, -2.7); rail(24, 2.7, 24, 4);
  // garde-corps (petits murets visibles sous les vitres)
  A.box('atrium', 'chrome', -24, 4.6, -4.06, 24, 5.0, -3.94, { collide: false }); A.box('atrium', 'chrome', -24, 4.6, 3.94, 24, 5.0, 4.06, { collide: false });

  // Escalators (escaliers + habillage)
  const escalator = (xBottom, dir, laneZ) => {
    const run = 9, steps = 26;
    A.stairs('atrium', 'diamond', xBottom, laneZ, dir, 2.0, run, 5, 0, steps, { solid: true, base: 0 });
    const sgn = dir === 'x-' ? -1 : 1;
    const xTop = xBottom + sgn * run;
    const len = Math.hypot(run, 5), ang = Math.atan2(5, run) * -sgn;
    const midX = (xBottom + xTop) / 2;
    for (const zz of [laneZ - 0.08, laneZ + 2.08]) {
      // jupe latérale inclinée
      const m = new THREE.Matrix4().compose(new THREE.Vector3(midX, 2.5 + 0.35, zz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ang)), new THREE.Vector3(len + 0.6, 1.3, 0.12));
      A.shape('atrium', 'furniture_metal', new THREE.BoxGeometry(1, 1, 1), m, 0x8c9399);
      const m2 = new THREE.Matrix4().compose(new THREE.Vector3(midX, 2.5 + 1.08, zz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ang)), new THREE.Vector3(len + 0.8, 0.09, 0.14));
      A.shape('atrium', 'furniture', new THREE.BoxGeometry(1, 1, 1), m2, 0x111111);
      // collision des côtés (murs fins en escalier)
      for (let i = 0; i < 9; i++) { const xa = xBottom + sgn * i, xb = xBottom + sgn * (i + 1); const top = 5 * (i + 1) / 9 + 1.1; world.physics.add(new Box(Math.min(xa, xb), 0, zz - 0.07, Math.max(xa, xb), top, zz + 0.07, LAYER.FURN)); }
    }
    // paliers métalliques
    A.box('atrium', 'diamond', xBottom + (dir === 'x-' ? 0 : -1.2), 0, laneZ, xBottom + (dir === 'x-' ? 1.2 : 0), 0.02, laneZ + 2, { collide: false });
  };
  escalator(-15, 'x-', -2.6); escalator(-15, 'x-', 0.6); escalator(15, 'x+', -2.6); escalator(15, 'x+', 0.6);
  // Fontaine de l'atrium
  dev('fountain', 'atrium', 0, 0.5, 0, 0);
  // Arbres en jardinière, bancs, poubelles
  for (const [x, z] of [[-9, -5.5], [9, -5.5], [-9, 5.5], [9, 5.5], [-40, 0], [40, 0], [-56, 0], [56, 0]]) planter(A, x < -24 ? 'gallery0_w' : x > 24 ? 'gallery0_e' : 'atrium', x, z, rng);
  for (const [x, z, ry] of [[-30, -2.5, 0], [-30, 2.5, Math.PI], [30, -2.5, 0], [30, 2.5, Math.PI], [-48, -2.5, 0], [48, 2.5, Math.PI], [-5, -6.8, 0], [5, 6.8, Math.PI]]) {
    const zn = x < -24 ? 'gallery0_w' : x > 24 ? 'gallery0_e' : 'atrium';
    dev('bench', zn, x, 0.225, z, ry);
  }
  for (const [x, z] of [[-34, 0], [34, 0], [-60, 3], [60, -3]]) dev('trash_can', x < 0 ? 'gallery0_w' : 'gallery0_e', x, 0.4, z, 0, { contents: ['banana_peel', 'newspaper'] });
  for (const [x, z, ry] of [[-30, -2.5, 0], [30, 2.5, Math.PI], [-50, 2.5, Math.PI], [50, -2.5, 0]]) dev('bench', x < 0 ? 'gallery1_w' : 'gallery1_e', x, 5.225, z, ry);
  dev('massage_chair', 'gallery1_e', 60, 5.6, -5.5, Math.PI / 2);
  dev('water_fountain', 'gallery0_w', -64.5, 0.6, 6.5, Math.PI / 2);
  dev('fire_alarm', 'gallery0_w', -65.8, 1.4, -6.5, -Math.PI / 2);
  dev('fire_alarm', 'gallery0_e', 65.6, 1.4, 6.5, Math.PI / 2);
  dev('fire_alarm', 'gallery1_w', -65.8, 6.4, -6.5, -Math.PI / 2);
  dev('extinguisher_box', 'gallery0_w', -65.8, 1.0, -7.4, -Math.PI / 2);
  dev('extinguisher_box', 'gallery0_e', 65.8, 1.0, -7.4, Math.PI / 2);
  dev('extinguisher_box', 'gallery1_e', 65.8, 6.0, 7.4, Math.PI / 2);
  // Affiche de Lucie près des toilettes de l'étage (et une au RDC)
  poster(world, 'gallery0_w', -65.89, 1.7, 3.5, Math.PI / 2, 2);
  poster(world, 'gallery1_e', 54, 6.7, -7.85, 0, 2);
  poster(world, 'gallery0_e', 65.89, 1.8, -3, -Math.PI / 2, 6);
  poster(world, 'atrium', -23.9, 2.2, -7.85, 0, 0);
  poster(world, 'gallery1_w', -65.89, 6.8, 4, Math.PI / 2, 7);

  // Mur ouest de la galerie (côté poste) — RDC et étage
  A.wallZ('gallery0_w', 'plaster_e8e2d4', -8, 8, -66, 0, 4.6, 0.3, [{ a: -0.75, b: 0.75, y0: 0, y1: 2.5 }]);
  A.wallZ('gallery1_w', 'plaster_e8e2d4', -8, 8, -66, 5, 10, 0.3, [{ a: -0.6, b: 0.6, y0: 5, y1: 7.2 }]);
  // panneau « SÉCURITÉ » au-dessus de la porte du poste
  const secSign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.45), new THREE.MeshBasicMaterial({ map: signTexture('POSTE DE SÉCURITÉ', 0x29b6f6, { h: 120, fontSize: 70, font: 'Arial' }) }));
  secSign.position.set(-65.83, 3.0, 0); secSign.rotation.y = Math.PI / 2; world.zone('gallery0_w').group.add(secSign); world.zone('security').signMats.push(secSign.material);
  // Panneaux de sortie de secours (vert, toujours allumés)
  for (const [x, y, z, ry, zn] of [[-65.83, 3.4, 5, Math.PI / 2, 'gallery0_w'], [65.83, 3.4, 0, -Math.PI / 2, 'gallery0_e'], [-65.83, 8.4, 0, Math.PI / 2, 'gallery1_w'], [0, 3.8, 7.85, Math.PI, 'atrium']]) exitSign(world, zn, x, y, z, ry);

  // ═══════════════════════════ BLOC OUEST (RDC) ═══════════════════════════
  // Mur ouest du bloc (x = -76) RDC : portes réserve, poste (arrière), escalier
  A.wallZ('westwing0', 'block', -22, 22, -76, 0, 4.6, 0.2, [{ a: -13.5, b: -12.5, y0: 0, y1: 2.1 }, { a: 2.5, b: 3.5, y0: 0, y1: 2.1 }, { a: 17.25, b: 18.25, y0: 0, y1: 2.1 }, { a: -0.6, b: 0.6, y0: 3.5, y1: 4.5 }]);
  // cloisons internes
  A.wallX('secstore', 'block', -76, -66, -5, 0, 4.6, 0.2, [{ a: -73.5, b: -72.5, y0: 0, y1: 2.1 }]);
  A.wallX('vestiaire', 'block', -76, -66, 5, 0, 4.6, 0.2, [{ a: -73.5, b: -72.5, y0: 0, y1: 2.1 }]);
  A.wallX('secstore', 'block', -76, -66, -22, 0, 4.6, 0.2);
  // sols
  A.floor('security', 'carpet_3b4655', -76, -5, -66, 5, 0, 0.6, { faces: 'Y' });
  A.floor('secstore', 'lino', -76, -22, -66, -5, 0, 0.6, { faces: 'Y' });
  A.floor('vestiaire', 'toilet_tiles', -76, 5, -66, 13, 0, 0.6, { faces: 'Y' });
  A.floor('westwing0', 'concrete_floor', -80, -25, -76, 25, 0, 0.6, { faces: 'Y' });
  // plafonds
  A.ceiling('security', 'woodpanel', -76, -5, -66, 5, 3.2, 0.05, { collide: false });
  world.physics.add(new Box(-76, 3.2, -5, -66, 3.3, 5, LAYER.WALL)); // faux plafond (avec la trappe en x=-69)
  A.ceiling('secstore', 'ceiling', -76, -22, -66, -5, 4.6, 0.05, { collide: false });
  A.ceiling('vestiaire', 'ceiling', -76, 5, -66, 13, 4.6, 0.05, { collide: false });
  A.ceiling('westwing0', 'concrete', -80, -25, -76, 25, 4.6, 0.05, { collide: false });
  // murs habillés du poste : boiseries
  A.box('security', 'woodpanel', -75.88, 0, -5, -75.86, 3.2, 5, { collide: false });
  A.box('security', 'woodpanel', -66.14, 0, -5, -66.12, 3.2, -0.75, { collide: false });
  A.box('security', 'woodpanel', -66.14, 0, 0.75, -66.12, 3.2, 5, { collide: false });
  A.panel('security', -70, 3.2, -2.5, 1.2, 0.6); A.panel('security', -70, 3.2, 2.5, 1.2, 0.6, false);
  A.panel('secstore', -71, 4.6, -13, 1.2, 0.3); A.panel('vestiaire', -71, 4.6, 9, 1.2, 0.3);
  for (let z = -21; z <= 21; z += 7) A.panel('westwing0', -78, 4.6, z, 0.3, 1.2, z % 14 === 0);

  // Portes du bloc ouest
  door('sec_front', { zone: 'security', x: -66, y: 0, z: 0, axis: 'z', width: 1.5, height: 2.5, mat: 'metal', armored: true, name: 'Porte blindée du poste', color: 0x50606a, hinge: 'a', swing: -1, label: 'SÉCURITÉ' });
  door('sec_back', { zone: 'security', x: -76, y: 0, z: 3, axis: 'z', width: 1, mat: 'metal', lock: 'keys', locked: true, name: 'Porte arrière du poste', swing: 1 });
  door('sec_store', { zone: 'secstore', x: -73, y: 0, z: -5, axis: 'x', width: 1, mat: 'wood', name: 'Réserve de sécurité', swing: 1 });
  door('sec_vest', { zone: 'vestiaire', x: -73, y: 0, z: 5, axis: 'x', width: 1, mat: 'wood', name: 'Vestiaire', swing: -1 });
  door('store_ww', { zone: 'secstore', x: -76, y: 0, z: -13, axis: 'z', width: 1, mat: 'metal', lock: 'keys', locked: true, name: 'Réserve (couloir)', swing: 1 });
  door('stW_0', { zone: 'stairsW', x: -76, y: 0, z: 17.75, axis: 'z', width: 1, mat: 'metal', name: 'Escalier ouest — RDC', gate: 'service', window: true });

  buildSecurityRoom(world, A, dev);
  // Réserve de sécurité : étagères + équipement
  for (const z of [-20.5, -16, -11.5]) shelfUnit(A, 'secstore', -75.4, z, 'z', 3.5, 0x6d7b84, 4);
  dev('extinguisher_box', 'secstore', -66.4, 1.0, -18, Math.PI / 2 * -1);
  // Vestiaire : casiers, banc, lavabo, miroir, douche
  for (let i = 0; i < 6; i++) { const lk = new Locker(world, world.newId('locker'), { zone: 'vestiaire', x: -75.6 + 0.0, y: 0, z: 6 + i * 0.45, ry: Math.PI / 2, name: i === 0 ? 'GÉRARD' : i === 1 ? 'VOUS' : null, contents: i === 0 ? ['gerard_note', 'battery'] : i === 1 ? ['flashlight_spare'] : rng.chance(0.5) ? [rng.pick(['coffee_pack', 'candy_bar', 'magazine', 'battery', 'coin'])] : [], locked: i === 0 }); world.add(lk); }
  dev('bench', 'vestiaire', -72, 0.225, 9, Math.PI / 2);
  dev('sink', 'vestiaire', -66.6, 0, 11.5, -Math.PI / 2);
  dev('mirror_wall', 'vestiaire', -66.2, 1.6, 11.5, -Math.PI / 2);

  // Aile ouest (couloir) : mur extérieur x = -80 avec porte de l'entrepôt
  A.wallZ('westwing0', 'block_dark', -25, 25, -80.2, 0, 4.6, 0.4, [{ a: -14, b: -11.4, y0: 0, y1: 3 }]);
  door('wh_a', { zone: 'warehouse', x: -80.2, y: 0, z: -13.35, axis: 'z', width: 1.3, height: 2.9, mat: 'metal', name: 'Entrepôt', gate: 'warehouse', hinge: 'a', swing: -1, window: true });
  door('wh_b', { zone: 'warehouse', x: -80.2, y: 0, z: -12.05, axis: 'z', width: 1.3, height: 2.9, mat: 'metal', name: 'Entrepôt', gate: 'warehouse', hinge: 'b', swing: -1, window: true });

  // ═══════════════════════════ COULOIRS DE SERVICE ═══════════════════════════
  for (const [zn, y, zc, sideZ] of [['service_s0', 0, -23.5, -25.2], ['service_n0', 0, 23.5, 25.2], ['service_s1', 5, -23.5, -25.2], ['service_n1', 5, 23.5, 25.2]]) {
    const top = y === 0 ? 4.6 : 10;
    A.floor(zn, 'concrete_floor', -76, Math.min(zc - 1.5, zc + 1.5), 80, Math.max(zc - 1.5, zc + 1.5), y, y === 0 ? 0.6 : 0.4, { faces: 'Y' });
    A.ceiling(zn, 'concrete', -76, zc - 1.5, 80, zc + 1.5, top, 0.05, { collide: false });
    A.wallX(zn, 'block_dark', -80.4, 80.4, sideZ, y, top, 0.4);
    for (let x = -72; x <= 78; x += 10) A.panel(zn, x, top, zc + (zc > 0 ? 0.9 : -0.9), 1.2, 0.2, (x + 72) % 20 === 0);
    // tuyaux le long du mur extérieur
    A.box(zn, 'furniture_metal', -80, top - 0.5, sideZ + (zc > 0 ? -0.35 : 0.35) - 0.06, 80, top - 0.38, sideZ + (zc > 0 ? -0.35 : 0.35) + 0.06, { collide: false, color: 0x7a5c3a });
    A.box(zn, 'furniture_metal', -80, top - 0.75, sideZ + (zc > 0 ? -0.35 : 0.35) - 0.05, 80, top - 0.65, sideZ + (zc > 0 ? -0.35 : 0.35) + 0.05, { collide: false, color: 0x5f6f78 });
  }
  A.wallZ('service_s0', 'block_dark', -25.4, -21.8, 80.2, 0, 4.6, 0.4); A.wallZ('service_n0', 'block_dark', 21.8, 25.4, 80.2, 0, 4.6, 0.4);
  A.wallZ('service_s1', 'block_dark', -25.4, -21.8, 80.2, 5, 10, 0.4); A.wallZ('service_n1', 'block_dark', 21.8, 25.4, 80.2, 5, 10, 0.4);
  // murs côté bloc ouest (z = ±22 entre x -76 et -66) : faits par les cloisons de la réserve / l'escalier
  A.wallX('stairsW', 'block', -76, -66, 22, -4.5, 13.5, 0.2);
  A.wallX('stairsW', 'block', -76, -66, 13, -4.5, 13.5, 0.2);
  // affiches de consignes
  poster(world, 'service_s0', -60, 1.7, -24.95, 0, 8); poster(world, 'service_n0', 40, 1.7, 24.95, Math.PI, 10); poster(world, 'service_s0', 30, 1.7, -24.95, 0, 4);

  // ═══════════════════════════ ESCALIER OUEST ═══════════════════════════
  buildStairsW(world, A, door);

  // ═══════════════════════════ ÉTAGE OUEST ═══════════════════════════
  A.floor('westwing1', 'concrete_floor', -80, -25, -76, 25, 5, 0.4, { faces: 'Y' });
  A.ceiling('westwing1', 'concrete', -80, -25, -76, 25, 10, 0.05, { collide: false });
  A.wallZ('westwing1', 'block_dark', -25, 25, -80.2, 5, 10, 0.4);
  A.wallZ('westwing1', 'block', -22, 13, -76, 5, 10, 0.2, [{ a: -0.6, b: 0.6, y0: 5, y1: 7.1 }]);
  A.wallZ('westwing1', 'block', 13, 22, -76, 5, 10, 0.2, [{ a: 17.25, b: 18.25, y0: 5, y1: 7.1 }]);
  for (let z = -21; z <= 21; z += 7) A.panel('westwing1', -78, 10, z, 0.3, 1.2, z % 14 === 0);
  A.floor('archives', 'lino', -76, -22, -66, 13, 5, 0.4, { faces: 'Y' });
  A.ceiling('archives', 'ceiling', -76, -22, -66, 13, 10, 0.05, { collide: false });
  A.wallX('archives', 'block', -76, -66, -22, 5, 10, 0.2);
  A.panel('archives', -71, 10, -15, 1.2, 0.3); A.panel('archives', -71, 10, 2, 1.2, 0.3, false);
  door('arch_g', { zone: 'archives', x: -66, y: 5, z: 0, axis: 'z', width: 1.2, mat: 'wood', lock: 'keys', locked: true, name: 'Archives', swing: 1 });
  door('arch_w', { zone: 'archives', x: -76, y: 5, z: 0, axis: 'z', width: 1.2, mat: 'wood', name: 'Archives (couloir)', swing: -1 });
  for (let i = 0; i < 4; i++) shelfUnit(A, 'archives', -74 + i * 2.2, -20, 'x', 1.8, 0x8d8d8d, 4, 14);
  for (let i = 0; i < 10; i++) {
    const c = new Container(world, world.newId('box'), { zone: 'archives', name: 'Carton d\'archives ' + (1987 + i * 4), contents: i === 3 ? ['lore_page'] : i === 7 ? ['old_newspaper'] : rng.chance(0.6) ? [rng.pick(['paper', 'photo_frame', 'notebook', 'magazine'])].filter(x => x !== 'paper') : [], box: [-75.5 + (i % 5) * 1.9, 5, -11 + Math.floor(i / 5) * 6, -74.7 + (i % 5) * 1.9, 5.5, -10.3 + Math.floor(i / 5) * 6] });
    world.add(c); A.furn('archives', c.pickBox.min[0], 5, c.pickBox.min[2], c.pickBox.max[0], 5.5, c.pickBox.max[2], 0xa1887f, { collide: true });
  }
  dev('crt_tv', 'archives', -67.2, 5.98, 9, -Math.PI / 2, { channel: 'channel:testcard' });
  A.furn('archives', -68, 5, 7.8, -66.4, 5.73, 10.2, 0x5d4037);
  dev('desk_phone', 'archives', -67, 5.78, 7.2, -Math.PI / 2);

  // ═══════════════════════════ BLOC EST ═══════════════════════════
  // Hall d'entrée
  A.floor('entrance', 'terrazzo', 66, -8, 80, 8, 0, 0.6, { faces: 'Y' });
  A.ceiling('entrance', 'ceiling', 66, -8, 80, 8, 4.6, 0.02, { collide: false });
  A.floor('mezzanine', 'terrazzo', 66, -8, 80, 8, 5, 0.4, { faces: 'Y' });
  A.ceiling('mezzanine', 'ceiling', 66, -8, 80, 8, 10, 0.02, { collide: false });
  for (const z of [-4, 4]) { A.panel('entrance', 71, 4.6, z, 2.4, 0.5); A.panel('entrance', 76, 4.6, z, 2.4, 0.5, false); A.panel('mezzanine', 73, 10, z, 2.4, 0.5); }
  // façade vitrée (x = 80) avec portes automatiques
  A.box('entrance', 'chrome', 80, 0, -8, 80.3, 0.2, 8, { collide: false });
  for (const [z0, z1] of [[-8, -1.6], [1.6, 8]]) {
    const gp = new GlassPane(world, world.newId('glass'), { zone: 'entrance', x0: 80, x1: 80, z0, z1, y0: 0.2, y1: 4.4, name: 'Façade vitrée', floorY: 0.01, alarmZone: 'entrance' });
    world.add(gp);
  }
  A.box('entrance', 'chrome', 79.95, 4.4, -8, 80.35, 4.6, 8, { collide: true });
  for (const z of [-8, -4.8, -1.6, 1.6, 4.8, 8]) A.box('entrance', 'chrome', 79.95, 0, z - 0.06, 80.35, 4.4, z + 0.06, { collide: true });
  door('entry_a', { zone: 'entrance', x: 80.15, y: 0, z: -0.8, axis: 'z', width: 1.6, height: 2.6, mat: 'glass', lock: 'master', locked: true, name: 'Porte principale', hinge: 'a', swing: 1, mainEntrance: true });
  door('entry_b', { zone: 'entrance', x: 80.15, y: 0, z: 0.8, axis: 'z', width: 1.6, height: 2.6, mat: 'glass', lock: 'master', locked: true, name: 'Porte principale', hinge: 'b', swing: 1, mainEntrance: true });
  A.box('entrance', 'chrome', 79.95, 2.6, -1.6, 80.35, 4.4, 1.6, { collide: true });
  // grande baie de la mezzanine
  for (const [z0, z1] of [[-8, 0], [0, 8]]) world.add(new GlassPane(world, world.newId('glass'), { zone: 'mezzanine', x0: 80, x1: 80, z0, z1, y0: 5.9, y1: 9.6, name: 'Baie vitrée', breakable: false }));
  A.box('mezzanine', 'chrome', 79.9, 5, -8, 80.3, 5.9, 8); A.box('mezzanine', 'chrome', 79.9, 9.6, -8, 80.3, 10, 8);
  A.box('mezzanine', 'chrome', 79.9, 5.9, -0.06, 80.3, 9.6, 0.06);
  // murs nord / sud du hall et de la mezzanine
  A.wallX('entrance', 'plaster_e8e2d4', 66, 80, 8, 0, 4.6, 0.3, [{ a: 77, b: 78.2, y0: 0, y1: 2.2 }]);
  A.wallX('entrance', 'plaster_e8e2d4', 66, 80, -8, 0, 4.6, 0.3, [{ a: 77, b: 78.2, y0: 0, y1: 2.2 }]);
  A.wallX('mezzanine', 'plaster_e8e2d4', 66, 80, 8, 5, 10, 0.3, [{ a: 77, b: 78.2, y0: 5, y1: 7.2 }]);
  A.wallX('mezzanine', 'plaster_e8e2d4', 66, 80, -8, 5, 10, 0.3, [{ a: 72, b: 73.2, y0: 5, y1: 7.2 }]);
  door('entr_stE', { zone: 'stairsE', x: 77.6, y: 0, z: 8, axis: 'x', width: 1.2, mat: 'metal', name: 'Escalier est — RDC', gate: 'service', swing: 1, window: true });
  door('entr_trash', { zone: 'trash', x: 77.6, y: 0, z: -8, axis: 'x', width: 1.2, mat: 'metal', name: 'Local poubelles', lock: 'keys', locked: true, swing: -1 });
  door('mez_stE', { zone: 'stairsE', x: 77.6, y: 5, z: 8, axis: 'x', width: 1.2, mat: 'metal', name: 'Escalier est — étage', gate: 'gallery1', swing: 1, window: true });
  door('mez_hvac', { zone: 'hvac', x: 72.6, y: 5, z: -8, axis: 'x', width: 1.2, mat: 'metal', name: 'Local ventilation', lock: 'keys', locked: true, swing: -1 });
  // mobilier du hall
  A.furn('entrance', 70, 0, -3, 72.5, 1.1, 3, 0xd8d0c0); A.furn('entrance', 69.9, 1.1, -3.1, 72.6, 1.15, 3.1, 0x8d6e63);
  A.box('entrance', 'chrome', 72.5, 0, -3, 72.55, 1.1, 3, { collide: false });
  const accueil = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.4), new THREE.MeshBasicMaterial({ map: signTexture('ACCUEIL — INFORMATIONS', 0xffd54f, { h: 110, fontSize: 60, font: 'Arial' }) }));
  accueil.position.set(72.58, 0.7, 0); accueil.rotation.y = Math.PI / 2; world.zone('entrance').group.add(accueil); world.zone('entrance').signMats.push(accueil.material);
  dev('desk_phone', 'entrance', 71.2, 1.2, 1.8, Math.PI / 2);
  dev('atm', 'entrance', 67.2, 0.95, -7.5, 0);
  dev('vending', 'entrance', 69, 0.9, -7.45, 0);
  dev('vending', 'mezzanine', 69, 5.9, 7.45, Math.PI);
  dev('bench', 'entrance', 75, 0.225, 6.5, Math.PI);
  dev('bench', 'mezzanine', 76, 5.225, 0, -Math.PI / 2);
  planter(A, 'entrance', 78.5, -6.5, rng); planter(A, 'entrance', 78.5, 6.5, rng); planter(A, 'mezzanine', 78, -6.5, rng);
  const dir = new Readable(world, world.newId('read'), { zone: 'entrance', name: 'Plan du centre', title: 'Plan du Centre Commercial Hélios', text: () => g.mapText(), box: [74.3, 0, -7.95, 76.7, 2.6, -7.6] });
  world.add(dir);
  directoryBoard(world, 'entrance', 75.5, 1.4, -7.85);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: signTexture('CENTRE COMMERCIAL HÉLIOS', 0xffb300, { fontSize: 80 }) }));
  logo.position.set(79.85, 3.7, 0); logo.rotation.y = -Math.PI / 2; world.zone('entrance').group.add(logo); world.zone('entrance').signMats.push(logo.material);
  // Local poubelles
  A.floor('trash', 'concrete_floor', 66, -22, 80, -8, 0, 0.6, { faces: 'Y' });
  A.ceiling('trash', 'concrete', 66, -22, 80, -8, 4.6, 0.05, { collide: false });
  A.wallX('trash', 'block_dark', 66, 80, -22, 0, 4.6, 0.2, [{ a: 72, b: 73.2, y0: 0, y1: 2.2 }]);
  A.wallZ('trash', 'block_dark', -22, -8, 80.2, 0, 4.6, 0.4);
  A.panel('trash', 73, 4.6, -15, 1.2, 0.3);
  door('trash_svc', { zone: 'trash', x: 72.6, y: 0, z: -22, axis: 'x', width: 1.2, mat: 'metal', name: 'Local poubelles (service)', swing: 1, gate: 'service' });
  for (const [x, z] of [[68.5, -20.5], [71.5, -20.5], [78.5, -14]]) { A.furn('trash', x - 1.1, 0, z - 0.7, x + 1.1, 1.3, z + 0.7, 0x2e5e3a, { metal: true }); world.add(new Container(world, world.newId('bin'), { zone: 'trash', name: 'Benne', contents: rng.shuffle(['banana_peel', 'newspaper', 'cardboard_box', 'coin', 'pizza_box', 'battery']).slice(0, 2), box: [x - 1.1, 0, z - 0.7, x + 1.1, 1.35, z + 0.7] })); }
  // Local CVC
  A.floor('hvac', 'concrete_floor', 66, -22, 80, -8, 5, 0.4, { faces: 'Y' });
  A.ceiling('hvac', 'concrete', 66, -22, 80, -8, 10, 0.05, { collide: false });
  A.wallX('hvac', 'block_dark', 66, 80, -22, 5, 10, 0.2, [{ a: 72, b: 73.2, y0: 5, y1: 7.2 }]);
  A.wallZ('hvac', 'block_dark', -22, -8, 80.2, 5, 10, 0.4);
  A.panel('hvac', 73, 10, -15, 1.2, 0.3);
  door('hvac_svc', { zone: 'hvac', x: 72.6, y: 5, z: -22, axis: 'x', width: 1.2, mat: 'metal', name: 'Local ventilation (service)', swing: 1, gate: 'service' });
  for (const [x, z] of [[69, -18], [69, -12], [77, -17]]) { A.furn('hvac', x - 1.4, 5, z - 1, x + 1.4, 7.2, z + 1, 0x9aa3a8, { metal: true }); A.furn('hvac', x - 0.5, 7.2, z - 0.5, x + 0.5, 10, z + 0.5, 0xa5abb0, { metal: true }); }
  world.points.hvac = new THREE.Vector3(70, 6, -15);

  // ═══════════════════════════ ESCALIER EST ═══════════════════════════
  buildStairsE(world, A, door);

  // ═══════════════════════════ SOUS-SOL TECHNIQUE ═══════════════════════════
  buildBasement(world, A, door, dev, rng);

  // ═══════════════════════════ PARKING ═══════════════════════════
  buildGarage(world, A, door, dev, rng);

  // ═══════════════════════════ ENTREPÔT ═══════════════════════════
  buildWarehouse(world, A, dev, rng);

  // ═══════════════════════════ TOIT ═══════════════════════════
  buildRoof(world, A, door, dev, rng);

  // ═══════════════════════════ CONDUITS ═══════════════════════════
  buildVents(world, A);

  // ═══════════════════════════ MAGASINS ═══════════════════════════
  buildShops(world, A, dev, rng);

  // ═══════════════════════════ EXTÉRIEUR ═══════════════════════════
  buildOutside(world, A, rng);

  A.build();
  buildNav(world, doors);
  world.doors = doors;
  defineAreaCameras(world);

  // points remarquables
  Object.assign(world.points, {
    spawnDay: new THREE.Vector3(76, 0, 0), spawnDayYaw: Math.PI / 2,
    securityDesk: new THREE.Vector3(-71.6, 0, 0), securityYaw: Math.PI / 2,
    securityDoorOut: new THREE.Vector3(-64.5, 0, 0), securityInside: new THREE.Vector3(-68, 0, 0),
    gerardSpot: new THREE.Vector3(-69.5, 0, -2.6),
    cafe: new THREE.Vector3(-60, 0, -12), b13: new THREE.Vector3(-84, -4.5, -7),
    entranceOutside: new THREE.Vector3(84, 0, 0), garageGate: new THREE.Vector3(66, -4.5, -4.5), rampEnd: new THREE.Vector3(97, -0.2, -4.5),
    fountain: new THREE.Vector3(0, 0, 0), roofDoor: new THREE.Vector3(-77.5, 10.5, 17.75),
  });
  return world;
}

// ─────────────────────────────────────────────────────────────────────────────
function planter(A, zone, x, z, rng) {
  const y = zone.startsWith('gallery1') || zone === 'mezzanine' ? 5 : 0;
  A.furn(zone, x - 0.7, y, z - 0.7, x + 0.7, y + 0.6, z + 0.7, 0x6d6a64);
  A.furn(zone, x - 0.62, y + 0.6, z - 0.62, x + 0.62, y + 0.62, z + 0.62, 0x3e2a1c, { collide: false });
  const trunk = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 1.3, z), new THREE.Quaternion(), new THREE.Vector3(0.12, 1.4, 0.12));
  A.shape(zone, 'furniture', new THREE.CylinderGeometry(0.5, 0.6, 1, 8), trunk, 0x5d4037);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x + rng.range(-0.3, 0.3), y + 2.1 + i * 0.35, z + rng.range(-0.3, 0.3)), new THREE.Quaternion(), new THREE.Vector3(1.2 - i * 0.2, 0.7, 1.2 - i * 0.2));
    A.shape(zone, 'furniture', new THREE.IcosahedronGeometry(0.6, 0), m, i % 2 ? 0x2e6b30 : 0x3b7f3a);
  }
}

function poster(world, zone, x, y, z, ry, i) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.87), new THREE.MeshStandardMaterial({ map: posterTexture(i), roughness: 0.8 }));
  m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true;
  (world.zone(zone)?.group || world.root).add(m);
  if (i === 2) world.points.luciePoster = new THREE.Vector3(x, y, z);
}

function exitSign(world, zone, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: signTexture('SORTIE ➜', 0x00e676, { h: 100, fontSize: 64, font: 'Arial', bg: '#0a3d1a', textColor: '#d8ffe0' }) }));
  m.material.color.setScalar(1.6); m.position.set(x, y, z); m.rotation.y = ry; (world.zone(zone)?.group || world.root).add(m);
}

function directoryBoard(world, zone, x, y, z) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 384; const ctx = c.getContext('2d');
  ctx.fillStyle = '#10161e'; ctx.fillRect(0, 0, 512, 384); ctx.fillStyle = '#ffd54f'; ctx.font = '700 26px Arial'; ctx.fillText('VOUS ÊTES ICI ★', 20, 36);
  ctx.font = '13px Arial';
  const list = SHOPS.filter(s => s.layout !== 'toilets');
  list.forEach((s, i) => { ctx.fillStyle = '#' + s.color.toString(16).padStart(6, '0'); ctx.fillRect(20 + (i % 2) * 250, 56 + Math.floor(i / 2) * 18, 10, 10); ctx.fillStyle = '#e0e0e0'; ctx.fillText((s.floor ? 'Étage — ' : 'RDC — ') + s.name, 36 + (i % 2) * 250, 66 + Math.floor(i / 2) * 18); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshBasicMaterial({ map: t }));
  m.position.set(x, y, z); (world.zone(zone)?.group || world.root).add(m); world.zone(zone).signMats.push(m.material);
}

// Unité d'étagère métallique (avec tablettes) le long d'un axe
export function shelfUnit(A, zone, x, z, axis, len, color, levels = 4, height = 2.2, depth = 0.5, y0 = null) {
  const y = y0 ?? (A.world.zone(zone)?.min[1] || 0);
  const w = axis === 'x' ? len : depth, d = axis === 'x' ? depth : len;
  for (let i = 0; i < levels; i++) { const yy = y + 0.12 + i * (height - 0.2) / (levels - 1); A.furn(zone, x, yy - 0.03, z, x + w, yy, z + d, color, { metal: true }); }
  for (const [px, pz] of [[0, 0], [w - 0.04, 0], [0, d - 0.04], [w - 0.04, d - 0.04]]) A.furn(zone, x + px, y, z + pz, x + px + 0.04, y + height, z + pz + 0.04, 0x333333, { metal: true, collide: false });
  // collision globale
  A.world.physics.add(new Box(x, y, z, x + w, y + height, z + d, LAYER.FURN));
}

// ───────────────────────── POSTE DE SÉCURITÉ ─────────────────────────
function buildSecurityRoom(world, A, dev) {
  const g = world.game; const zn = 'security';
  // bureau
  A.furn(zn, -74.6, 0, -2.8, -72.4, 0.74, 2.8, 0x5d4632);
  A.furn(zn, -74.7, 0.74, -2.9, -72.3, 0.78, 2.9, 0x3e2c1e);
  // mur d'écrans : géré par security.js (meubles ici)
  A.furn(zn, -75.95, 0, -2.6, -75.2, 0.9, 2.6, 0x2b2b2b, { metal: true });
  A.furn(zn, -75.95, 2.65, -2.6, -75.2, 2.72, 2.6, 0x2b2b2b, { metal: true, collide: false });
  // canapé
  A.furn(zn, -70.5, 0, -4.9, -67.5, 0.45, -4.0, 0x6b3a2a); A.furn(zn, -70.5, 0.45, -4.95, -67.5, 0.95, -4.65, 0x6b3a2a);
  A.furn(zn, -70.7, 0, -4.9, -70.4, 0.65, -4.0, 0x5a2f22); A.furn(zn, -67.6, 0, -4.9, -67.3, 0.65, -4.0, 0x5a2f22);
  world.add(new Seat(world, world.newId('seat'), { zone: zn, x: -69, y: 0, z: -4.4, ry: 0, name: 'Canapé' }));
  // table d'appoint + machine à café + mini frigo
  A.furn(zn, -70.8, 0, 3.9, -68.2, 0.9, 4.9, 0x4e3a28);
  dev('coffee_maker', zn, -69.9, 1.075, 4.45, Math.PI);
  dev('radio', zn, -68.8, 0.99, 4.5, Math.PI, { security: true, autoOn: true });
  A.furn(zn, -67.9, 0, 4.0, -66.5, 0.85, 4.9, 0xd0d0d0, { metal: true });
  dev('kettle', zn, -69.2, 1.03, 4.15, Math.PI);
  // plante, porte-manteau, horloge
  planterSmall(A, zn, -66.8, -4.4);
  dev('wall_clock', zn, -66.2, 2.5, 3, -Math.PI / 2);
  dev('fan', zn, -72.9, 1.08, -2.4, Math.PI / 2 * 1.3);
  dev('desk_phone', zn, -73.2, 0.83, 2.1, Math.PI / 2, { security: true });
  dev('pc_tower', zn, -74.2, 0.24, -2.2, Math.PI / 2, { os: 'security', monitor: true });
  dev('lamp', zn, -74.2, 0.955, 2.55, Math.PI / 2, { autoOn: true, security: true });
  dev('office_chair', zn, -71.7, 0.55, 0, Math.PI / 2);
  // armoire à clés
  A.furn(zn, -66.5, 1.2, 2.2, -66.15, 2.0, 3.2, 0x6d4c41);
  // poster Bobby + calendrier
  posterAt(world, zn, -66.14, 1.9, -2.8, -Math.PI / 2, 1);
  posterAt(world, zn, -66.14, 1.8, -1.6, -Math.PI / 2, 8);
  // tiroir du bureau (équipement de la nuit)
  world.securityDrawer = new Container(world, world.newId('drawer'), { zone: zn, name: 'Tiroir du bureau', contents: [], box: [-72.5, 0.45, -1.5, -72.3, 0.7, -0.5] });
  world.add(world.securityDrawer);
  // casier du gardien (placard du poste)
  const lk = new Locker(world, world.newId('locker'), { zone: zn, x: -75.6, y: 0, z: 4.3, ry: Math.PI / 2, name: 'PLACARD', contents: [] });
  world.add(lk); world.securityCloset = lk;
  // post-it, note de Gérard : gérés par le jeu (story)
  world.points.deskTop = new THREE.Vector3(-73.4, 0.79, 0.4);
  world.points.deskNote = new THREE.Vector3(-73.0, 0.785, -0.9);
  world.points.monitorWall = new THREE.Vector3(-75.6, 1.7, 0);
  world.points.hatch = new THREE.Vector3(-69, 3.2, 0);
}

function planterSmall(A, zn, x, z) {
  const y = A.world.zone(zn).min[1];
  A.furn(zn, x - 0.25, y, z - 0.25, x + 0.25, y + 0.45, z + 0.25, 0xa1543a);
  for (let i = 0; i < 6; i++) { const a = i; const m = new THREE.Matrix4().compose(new THREE.Vector3(x + Math.cos(a) * 0.12, y + 0.8, z + Math.sin(a) * 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a) * 0.5, a, Math.sin(a) * 0.5)), new THREE.Vector3(0.12, 0.9, 0.03)); A.shape(zn, 'furniture', new THREE.BoxGeometry(1, 1, 1), m, 0x2e7d32); }
}

function posterAt(world, zone, x, y, z, ry, i) { poster(world, zone, x, y, z, ry, i); }

// ───────────────────────── ESCALIER OUEST ─────────────────────────
function buildStairsW(world, A, door) {
  const zn = 'stairsW';
  const levels = [-4.5, 0, 5, 10.5];
  for (let li = 0; li < levels.length; li++) {
    const y = levels[li];
    A.floor(zn, 'concrete_floor', -76, 13, -73.5, 22, y, 0.3);
    if (li < levels.length - 1) {
      const h = levels[li + 1] - y; const half = h / 2; const steps = Math.round(half / 0.25);
      A.stairs(zn, 'concrete', -73.5, 13.2, 'x+', 2.4, 5.5, half, y, steps);
      A.floor(zn, 'concrete_floor', -68, 13, -66, 22, y + half, 0.3);
      A.stairs(zn, 'concrete', -68, 19.4, 'x-', 2.4, 5.5, half, y + half, steps);
      A.panel(zn, -67, y + half + 2.6, 17.5, 0.3, 1.0, li % 2 === 0);
      A.panel(zn, -75, y + 3.2, 17.5, 0.3, 1.0, false);
    }
  }
  // noyau central plein
  A.box(zn, 'block', -73.5, -4.5, 15.7, -68, 13.5, 19.3);
  // murs est / ouest (ouest : portes aux paliers)
  A.wallZ(zn, 'block', 13, 22, -66, 10, 13.5, 0.3);
  A.wallZ(zn, 'block', 13, 22, -76, -4.5, 0, 0.2, [{ a: 17.25, b: 18.25, y0: -4.5, y1: -2.4 }]);
  A.wallZ(zn, 'block', 13, 22, -76, 10.5, 13.5, 0.2, [{ a: 17.25, b: 18.25, y0: 10.5, y1: 12.6 }]);
  // toit de la cage
  A.box(zn, 'concrete', -76.2, 13.5, 12.8, -65.8, 13.9, 22.2);
  door('stW_B', { zone: zn, x: -76, y: -4.5, z: 17.75, axis: 'z', width: 1, mat: 'metal', name: 'Escalier ouest — sous-sol', gate: 'basement', window: true });
  door('stW_1', { zone: zn, x: -76, y: 5, z: 17.75, axis: 'z', width: 1, mat: 'metal', name: 'Escalier ouest — étage', gate: 'gallery1', window: true });
  door('stW_R', { zone: zn, x: -76, y: 10.5, z: 17.75, axis: 'z', width: 1, mat: 'metal', name: 'Accès toit', gate: 'roof', lock: 'keys', locked: true });
}

// ───────────────────────── ESCALIER EST ─────────────────────────
function buildStairsE(world, A, door) {
  const zn = 'stairsE';
  const levels = [-4.5, 0, 5];
  for (let li = 0; li < levels.length; li++) {
    const y = levels[li];
    A.floor(zn, 'concrete_floor', 66, 8, 80, 10.5, y, 0.3);
    A.floor(zn, 'concrete_floor', 74, 10.5, 80, 22, y, 0.3);
    A.panel(zn, 77, y + 3.6, 15, 0.3, 1.2, true);
    if (li < levels.length - 1) {
      const h = levels[li + 1] - y; const half = h / 2; const steps = Math.round(half / 0.25);
      A.stairs(zn, 'concrete', 66.6, 10.5, 'z+', 2.4, 9, half, y, steps);
      A.floor(zn, 'concrete_floor', 66, 19.5, 73.4, 22, y + half, 0.3);
      A.stairs(zn, 'concrete', 71.0, 19.5, 'z-', 2.4, 9, half, y + half, steps);
      A.panel(zn, 69.5, y + half + 2.6, 20.8, 1.0, 0.3, false);
    }
  }
  A.box(zn, 'block', 69.1, -4.5, 10.5, 70.9, 10, 19.5);
  A.wallZ(zn, 'block', 10.5, 22, 73.7, -4.5, 10, 0.2);
  A.wallZ(zn, 'block_dark', 8, 22, 80.2, -4.5, 10, 0.4);
  A.wallX(zn, 'block', 66, 80, 22, -4.5, 0, 0.2);
  A.wallX(zn, 'block', 66, 80, 22, 0, 10, 0.2, [{ a: 76.4, b: 77.6, y0: 0, y1: 2.2 }, { a: 76.4, b: 77.6, y0: 5, y1: 7.2 }]);
  A.wallX(zn, 'block', 66, 80, 8, -4.5, 0, 0.3);
  A.ceiling(zn, 'concrete', 66, 8, 80, 22, 10, 0.4);
  door('stE_svc0', { zone: zn, x: 77, y: 0, z: 22, axis: 'x', width: 1.2, mat: 'metal', name: 'Escalier est → couloir de service', gate: 'service', swing: 1 });
  door('stE_svc1', { zone: zn, x: 77, y: 5, z: 22, axis: 'x', width: 1.2, mat: 'metal', name: 'Escalier est → couloir de service (étage)', gate: 'service', swing: 1 });
}

// ───────────────────────── SOUS-SOL ─────────────────────────
function buildBasement(world, A, door, dev, rng) {
  const yb = -4.5, yc = -0.6;
  A.floor('westwingB', 'concrete_floor', -80, -24, -76, 22, yb, 0.3);
  A.ceiling('westwingB', 'concrete', -80, -24, -76, 22, yc, 0.6);
  A.wallZ('westwingB', 'block_dark', -24, 22, -80.2, yb, yc, 0.4, [{ a: -7.6, b: -6.4, y0: yb, y1: yb + 2.2 }]);
  A.wallX('westwingB', 'block_dark', -80.4, -76, 22.1, yb, yc, 0.2);
  A.wallX('westwingB', 'block_dark', -80.4, -66, -24.2, yb, yc, 0.4);
  A.wallZ('westwingB', 'block', -24, 13, -76, yb, yc, 0.2, [{ a: -18.5, b: -17.5, y0: yb, y1: yb + 2.1 }, { a: -7.5, b: -6.5, y0: yb, y1: yb + 2.1 }, { a: 1.5, b: 2.5, y0: yb, y1: yb + 2.1 }, { a: 9, b: 10, y0: yb, y1: yb + 2.1 }]);
  for (let z = -21; z <= 19; z += 8) A.panel('westwingB', -78, yc, z, 0.3, 1.2, z % 16 === -5);
  const rooms = [['generator', -24, -12], ['electrical', -12, -2], ['pa', -2, 6], ['boiler', 6, 13]];
  for (const [zn, z0, z1] of rooms) {
    A.floor(zn, 'concrete_floor', -76, z0, -66, z1, yb, 0.3);
    A.ceiling(zn, 'concrete', -76, z0, -66, z1, yc, 0.6);
    A.wallX(zn, 'block', -76, -66, z1, yb, yc, 0.2);
    A.panel(zn, -71, yc, (z0 + z1) / 2, 1.2, 0.3);
  }
  A.wallZ('generator', 'block', -24, 13, -66, yb, yc, 0.3, [{ a: 9, b: 10.2, y0: yb, y1: yb + 2.1 }]);
  door('gen', { zone: 'generator', x: -76, y: yb, z: -18, axis: 'z', width: 1, mat: 'metal', name: 'Groupe électrogène', swing: 1, label: 'GROUPE' });
  door('elec', { zone: 'electrical', x: -76, y: yb, z: -7, axis: 'z', width: 1, mat: 'metal', name: 'Local électrique', swing: 1, label: 'DANGER' });
  door('pa', { zone: 'pa', x: -76, y: yb, z: 2, axis: 'z', width: 1, mat: 'wood', name: 'Régie d\'annonces', swing: 1, label: 'RÉGIE' });
  door('boiler', { zone: 'boiler', x: -76, y: yb, z: 9.5, axis: 'z', width: 1, mat: 'metal', name: 'Chaufferie', swing: 1 });
  door('boiler_g', { zone: 'boiler', x: -66, y: yb, z: 9.6, axis: 'z', width: 1.2, mat: 'metal', name: 'Chaufferie → parking', swing: -1, gate: 'garage' });
  door('b13', { zone: 'b13', x: -80.2, y: yb, z: -7, axis: 'z', width: 1.2, mat: 'metal', name: 'Porte B-13', sealed: true, code: '1987', color: 0x5a3f2e, label: 'B-13', swing: -1 });
  // B-13
  A.floor('b13', 'concrete_dark', -88, -10, -80, -4, yb, 0.3);
  A.ceiling('b13', 'concrete_dark', -88, -10, -80, -4, yc, 0.6);
  A.wallX('b13', 'brick', -88.2, -80, -10.1, yb, yc, 0.2); A.wallX('b13', 'brick', -88.2, -80, -3.9, yb, yc, 0.2);
  A.wallZ('b13', 'brick', -10, -4, -88.1, yb, yc, 0.2);
  A.furn('b13', -87.6, yb, -9.6, -86.4, yb + 0.3, -8.4, 0x8d6e63); // petite table
  A.furn('b13', -87.7, yb, -5.6, -86.9, yb + 0.45, -4.6, 0xffeb3b);   // petite chaise jaune
  world.points.b13Altar = new THREE.Vector3(-87, yb + 0.3, -9);
  // dessins d'enfant sur les murs (visibles à la lampe UV)
  world.uvWritings = world.uvWritings || [];
  world.uvWritings.push({ pos: new THREE.Vector3(-88.0, yb + 1.5, -7), ry: Math.PI / 2, text: 'LUCIE ♥ BOBBY', zone: 'b13' });
  world.uvWritings.push({ pos: new THREE.Vector3(-79.95, yb + 1.6, -10), ry: -Math.PI / 2, text: '1987', zone: 'westwingB' });
  world.uvWritings.push({ pos: new THREE.Vector3(-65.9, 1.6, 9.5), ry: -Math.PI / 2, text: 'ELLE EST EN BAS', zone: 'vestiaire' });
  world.uvWritings.push({ pos: new THREE.Vector3(10, 1.4, 22.9), ry: Math.PI, text: 'NE CLIGNE PAS', zone: 'service_n0' });
  // équipements
  dev('generator', 'generator', -71, yb + 0.8, -19, 0);
  dev('fuel_can', 'generator', -74.8, yb + 0.15, -23, 0, { prop: true });
  dev('fuel_can', 'generator', -74.2, yb + 0.15, -23.2, 0.4, { prop: true });
  dev('breaker_panel', 'electrical', -71, yb + 1.0, -11.8, Math.PI);
  A.furn('electrical', -69, yb, -2.6, -67, yb + 0.9, -2.2, 0x5f6f78, { metal: true });
  dev('fuse', 'electrical', -68.5, yb + 0.95, -2.4, 0, { prop: true }); dev('fuse', 'electrical', -68.2, yb + 0.95, -2.4, 0, { prop: true });
  dev('book_electric', 'electrical', -67.5, yb + 0.92, -2.4, 0, { prop: true });
  dev('pa_console', 'pa', -71, yb + 0.45, 4.8, Math.PI);
  dev('office_chair', 'pa', -71, yb + 0.55, 3.6, 0);
  A.furn('pa', -75.6, yb, -1.5, -75, yb + 1.9, 1.5, 0x37474f, { metal: true });
  dev('boiler', 'boiler', -72, yb + 1.1, 9.5, 0);
  dev('water_heater', 'boiler', -68.5, yb + 0.75, 11.5, 0);
  dev('wrench', 'boiler', -74.6, yb + 0.02, 7.2, 0.5, { prop: true });
  world.points.generator = new THREE.Vector3(-71, yb, -19);
  world.points.breakers = new THREE.Vector3(-71, yb, -11.3);
  world.points.paRoom = new THREE.Vector3(-71, yb, 3);
  world.points.boiler = new THREE.Vector3(-72, yb, 9.5);
}

// ───────────────────────── PARKING ─────────────────────────
function buildGarage(world, A, door, dev, rng) {
  const g = world.game; const zn = 'garage'; const yb = -4.5, yc = -0.6;
  A.floor(zn, 'asphalt', -66, -24, 66, 24, yb, 0.4);
  A.ceiling(zn, 'concrete', -66, -24, 66, 24, yc, 0.6);
  A.wallX(zn, 'concrete_dark', -66, 66, -24.2, yb, yc, 0.4);
  A.wallX(zn, 'concrete_dark', -66, 66, 24.2, yb, yc, 0.4);
  A.wallZ(zn, 'concrete_dark', -24, 6, -66.15, yb, yc, 0.3);
  A.wallZ(zn, 'concrete_dark', 13, 24, -66.15, yb, yc, 0.3);
  A.wallZ(zn, 'concrete_dark', -24, 24, 66.15, yb, yc, 0.3, [{ a: -7, b: -2, y0: yb, y1: yb + 3.4 }, { a: 8.6, b: 9.9, y0: yb, y1: yb + 2.2 }]);
  // piliers
  for (let x = -54; x <= 54; x += 12) for (const z of [-12, 0, 12]) {
    A.box(zn, 'concrete', x - 0.35, yb, z - 0.35, x + 0.35, yc, z + 0.35);
    A.box(zn, 'furniture', x - 0.36, yb, z - 0.36, x + 0.36, yb + 0.9, z + 0.36, { collide: false, color: 0xd4a017, flat: true });
  }
  // marquages au sol
  for (let x = -60; x <= 60; x += 3) for (const [z0, z1] of [[-23.5, -18.5], [18.5, 23.5], [-11.5, -6.5], [6.5, 11.5]]) A.box(zn, 'furniture', x - 0.05, yb, z0, x + 0.05, yb + 0.005, z1, { collide: false, color: 0xe0e0e0, flat: true });
  for (let x = -62; x <= 62; x += 8) A.box(zn, 'furniture', x - 1.2, yb, -0.08, x + 1.2, yb + 0.005, 0.08, { collide: false, color: 0xffeb3b, flat: true });
  for (let x = -60; x <= 60; x += 12) for (const z of [-17, -5, 5, 17]) A.panel(zn, x, yc, z, 1.4, 0.2, (x / 12 + (z > 0 ? 1 : 0)) % 2 === 0);
  door('stE_B', { zone: 'stairsE', x: 66.15, y: yb, z: 9.25, axis: 'z', width: 1.2, mat: 'metal', name: 'Escalier est — parking', gate: 'garage', swing: 1 });
  // rideau métallique de la rampe
  const gate = new Shutter(world, world.newId('shutter'), { zone: 'garage', x0: 66.1, x1: 66.1, z: 0, y0: yb, y1: yb + 3.4, closed: true, locked: true, garageGate: true });
  world.garageGate = gate;
  // Le Shutter est prévu pour un mur parallèle à X : on crée une variante tournée
  gate.mesh.geometry.dispose(); gate.mesh.geometry = new THREE.BoxGeometry(0.06, 3.4, 5);
  gate.mesh.position.set(66.1, yb + 1.7, -4.5); gate.o.x0 = 66; gate.o.x1 = 66.2; gate.o.z = -4.5; gate.cx = 66.1;
  gate.col.set(65.95, yb, -7, 66.25, yb + 3.4, -2); world.physics.update(gate.col);
  gate.setPick(65.9, yb, -7, 66.3, yb + 3.4, -2);
  gate.applyVisual = function () { const h = 3.4 * Math.max(0.03, this.pos01); this.mesh.scale.y = Math.max(0.03, this.pos01); this.mesh.position.y = yb + 3.4 - h / 2; this.col.enabled = this.pos01 > 0.55; this.col.min[1] = yb + 3.4 - h; world.physics.update(this.col); };
  gate.name = 'Rideau de la rampe du parking';
  gate.applyVisual(); world.add(gate);
  // rampe vers l'extérieur
  A.stairs('ramp', 'asphalt', 66, -7, 'x+', 5, 32, 4.5, yb, 32, { solid: true, base: yb - 0.4 });
  A.wallX('ramp', 'concrete_dark', 66, 98, -7.2, yb, 1, 0.4); A.wallX('ramp', 'concrete_dark', 66, 98, -1.8, yb, 1, 0.4);
  A.ceiling('ramp', 'concrete', 66, -7, 80, -2, -0.6, 0.6);
  A.box('ramp', 'concrete', 98, -1, -7.4, 98.4, 3, -1.6); // barrière (mur fin : le reste du monde n'est pas modélisé)
  // voitures
  const colors = [0x1565c0, 0xb71c1c, 0x2e7d32, 0x424242, 0xe0e0e0, 0x6a1b9a, 0xf9a825, 0x00695c];
  const spots = [[-49.5, -21], [-37.5, -21], [-10.5, -9], [16.5, 9], [31.5, 21], [-22.5, 9], [43.5, -9], [55.5, 21]];
  spots.forEach(([x, z], i) => dev('car', zn, x, yb + 0.72, z, z > 0 ? Math.PI : 0, { color: colors[i], plate: 'HL-' + (100 + i * 37) + '-' + 'ABCDEFGH'[i] + 'X', locked: i % 3 !== 1, alarm: i % 2 === 0 }));
  // caddies abandonnés, horodateur
  dev('shopping_cart', zn, -30, yb + 0.5, 3, 0.5, { prop: true }); dev('shopping_cart', zn, 20, yb + 0.5, -3, 2.2, { prop: true });
  A.furn(zn, 60, yb, 2, 61, yb + 1.6, 2.6, 0x37474f, { metal: true });
  dev('extinguisher_box', zn, -65.95, yb + 1, 0, Math.PI / 2);
  dev('fire_alarm', zn, -65.95, yb + 1.4, 2, Math.PI / 2);
  world.points.garageCenter = new THREE.Vector3(0, yb, 0);
}

// ───────────────────────── ENTREPÔT ─────────────────────────
function buildWarehouse(world, A, dev, rng) {
  const zn = 'warehouse'; const yc = 8;
  A.floor(zn, 'concrete_floor', -112, -25, -80.4, 5, 0, 0.4);
  A.ceiling(zn, 'corrugated', -112, -25, -80.4, 5, yc, 0.4);
  A.wallX(zn, 'brick', -112.4, -80.4, -25.2, 0, yc, 0.4); A.wallX(zn, 'brick', -112.4, -80.4, 5.2, 0, yc, 0.4);
  A.wallZ(zn, 'brick', -25, 5, -112.2, 0, yc, 0.4, [{ a: -12, b: -8, y0: 0, y1: 4.2 }]);
  A.wallZ(zn, 'brick', -25, 5, -80.2, 4.6, yc, 0.4);
  const dock = new Shutter(world, world.newId('shutter'), { zone: zn, x0: -112.1, x1: -112.1, z: -10, y0: 0, y1: 4.2, closed: true, locked: true });
  dock.mesh.geometry.dispose(); dock.mesh.geometry = new THREE.BoxGeometry(0.06, 4.2, 4); dock.mesh.position.set(-112.1, 2.1, -10);
  dock.col.set(-112.3, 0, -12, -111.9, 4.2, -8); world.physics.update(dock.col); dock.setPick(-112.4, 0, -12, -111.8, 4.2, -8);
  dock.applyVisual = function () { const h = 4.2 * Math.max(0.03, this.pos01); this.mesh.scale.y = Math.max(0.03, this.pos01); this.mesh.position.y = 4.2 - h / 2; this.col.enabled = this.pos01 > 0.55; this.col.min[1] = 4.2 - h; world.physics.update(this.col); };
  dock.name = 'Porte du quai de chargement'; dock.applyVisual(); world.add(dock);
  for (let x = -108; x <= -84; x += 8) for (const z of [-20, -10, 0]) A.panel(zn, x, yc, z, 0.6, 0.6, (x + z) % 16 === 0);
  // racks
  for (const z of [-21, -14, -3]) {
    for (let i = 0; i < 3; i++) {
      const x0 = -108 + i * 7.5;
      for (const yy of [0.1, 2.4, 4.7]) A.furn(zn, x0, yy, z, x0 + 7, yy + 0.12, z + 1.2, 0xff6f00, { metal: true });
      for (const xx of [x0, x0 + 3.45, x0 + 6.9]) for (const zz of [z, z + 1.1]) A.furn(zn, xx, 0, zz, xx + 0.1, 6.2, zz + 0.1, 0x1565c0, { metal: true, collide: false });
      world.physics.add(new Box(x0, 0, z, x0 + 7, 6.2, z + 1.2, LAYER.FURN));
      for (const yy of [0.22, 2.52, 4.82]) for (let k = 0; k < 3; k++) {
        if (rng.chance(0.25)) continue;
        const bx = x0 + 0.3 + k * 2.3; const h = rng.range(0.6, 1.4);
        A.furn(zn, bx, yy, z + 0.1, bx + 1.8, yy + h, z + 1.1, rng.pick([0xa1887f, 0x8d6e63, 0xbcaaa4]), { collide: false });
        if (yy < 1 && rng.chance(0.5)) world.add(new Container(world, world.newId('crate'), { zone: zn, name: 'Carton de stock', contents: [rng.pick(['battery', 'toilet_paper', 'canned_food', 'water', 'chips', 'cereal', 'light_bulbs', 'duct_tape', 'cat_food', 'soda', 'lego', 'candle'])], box: [bx, yy, z + 0.1, bx + 1.8, yy + h, z + 1.1] }));
      }
    }
  }
  // palettes, chariot élévateur, établi, panier du chat
  for (let i = 0; i < 6; i++) { const x = -100 + i * 2.6, z = 2.5; A.furn(zn, x, 0, z, x + 1.2, 0.15, z + 1.0, 0xb08d57); if (i % 2) A.furn(zn, x + 0.1, 0.15, z + 0.1, x + 1.1, rng.range(0.6, 1.6), z + 0.9, 0x9e9e9e, { collide: true }); }
  dev('forklift', zn, -88, 1.1, -8, Math.PI / 2);
  A.furn(zn, -111.5, 0, -24.5, -109, 0.9, -21.5, 0x6d4c41);
  dev('hammer', zn, -110.5, 0.92, -23, 0.3, { prop: true });
  dev('flashlight_tac', zn, -110, 0.94, -22.4, 1, { prop: true, night: 9 });
  A.furn(zn, -84.5, 0, 3.3, -83.5, 0.15, 4.4, 0x8d6e63, { collide: false });
  world.points.catBed = new THREE.Vector3(-84, 0.05, 3.8);
  world.points.warehouse = new THREE.Vector3(-96, 0, -8);
  dev('extinguisher_box', zn, -80.6, 1.0, -18, -Math.PI / 2);
}

// ───────────────────────── TOIT ─────────────────────────
function buildRoof(world, A, door, dev, rng) {
  const zn = 'roof'; const y = 10.5;
  // dalle de toit (dessus) avec la verrière et la cage d'escalier
  A.slabWithHoles(zn, 'asphalt', -80.4, -25.4, 80.4, 25.4, y, 0.5, [{ x0: -24, z0: -4, x1: 24, z1: 4 }, { x0: -76, z0: 13, x1: -66, z1: 22 }], { faces: 'xXzZY' });
  // acrotère
  A.wallX(zn, 'block_dark', -80.6, 80.6, -25.5, y, y + 1.1, 0.3); A.wallX(zn, 'block_dark', -80.6, 80.6, 25.5, y, y + 1.1, 0.3);
  A.wallZ(zn, 'block_dark', -25.5, 25.5, -80.5, y, y + 1.1, 0.3); A.wallZ(zn, 'block_dark', -25.5, 25.5, 80.5, y, y + 1.1, 0.3);
  // verrière : muret + vitres (marchables, cassables)
  A.wallX(zn, 'metal', -24.2, 24.2, -4.1, y, y + 1.0, 0.2); A.wallX(zn, 'metal', -24.2, 24.2, 4.1, y, y + 1.0, 0.2);
  A.wallZ(zn, 'metal', -4.1, 4.1, -24.1, y, y + 1.0, 0.2); A.wallZ(zn, 'metal', -4.1, 4.1, 24.1, y, y + 1.0, 0.2);
  world.skylightPanes = [];
  for (let x = -24; x < 24; x += 4) {
    for (const [z0, z1] of [[-4, 0], [0, 4]]) {
      const gp = new GlassPane(world, world.newId('glass'), { zone: 'atrium', x0: x, x1: x + 4, z0, z1, y0: y + 1.0, y1: y + 1.0, name: 'Verrière', horizontal: true, skylight: true });
      gp.mesh.geometry.dispose(); gp.mesh.geometry = new THREE.PlaneGeometry(4, 4); gp.mesh.rotation.set(-Math.PI / 2, 0, 0); gp.mesh.position.set(x + 2, y + 1.0, (z0 + z1) / 2);
      gp.col.set(x, y + 0.96, z0, x + 4, y + 1.04, z1); world.physics.update(gp.col); gp.setPick(x, y + 0.9, z0, x + 4, y + 1.1, z1);
      world.add(gp); world.skylightPanes.push(gp);
    }
    A.box(zn, 'metal', x - 0.04, y + 0.95, -4, x + 0.04, y + 1.06, 4, { collide: false });
  }
  A.box(zn, 'metal', -24, y + 0.95, -0.04, 24, y + 1.06, 0.04, { collide: false });
  // climatiseurs, antenne
  for (const [x, z] of [[-50, -15], [-35, 15], [40, -15], [55, 12], [5, 18], [-10, -18]]) {
    A.furn(zn, x - 1.5, y, z - 1, x + 1.5, y + 1.6, z + 1, 0xb0bec5, { metal: true });
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 1.62, z), new THREE.Quaternion(), new THREE.Vector3(1.6, 0.05, 1.6)); A.shape(zn, 'furniture_metal', new THREE.CylinderGeometry(0.5, 0.5, 1, 16), m, 0x37474f);
  }
  A.furn(zn, 60.8, y, -20.2, 61.2, y + 9, -19.8, 0x9e9e9e, { metal: true });
  world.points.antenna = new THREE.Vector3(61, y + 9.2, -20);
  dev('extinguisher_box', zn, -79.9, y + 0.5, 15, Math.PI / 2);
  world.points.roof = new THREE.Vector3(-70, y, 0);
}

// ───────────────────────── CONDUITS D'AÉRATION ─────────────────────────
// Section intérieure 1,0 × 0,9 m, plancher à y = 3.55. Embranchements vers le poste et les réserves du RDC.
function buildVents(world, A) {
  const yf = 3.5, yt = 4.5;
  const t = 0.05;
  const branchesS = [], branchesN = [];
  for (const s of SHOPS) { if (s.floor !== 0) continue; const x = ventXForShop(s); (s.side === 'S' ? branchesS : branchesN).push({ x, shop: s.id }); }
  // conduit principal le long d'un axe x (sud : zc < 0, nord : zc > 0), embranchements vers les réserves
  const mainX = (zn, zc, branches) => {
    const sg = Math.sign(zc);
    const inner = zc - sg * 0.5, outer = zc + sg * 0.5;
    const ops = branches.map(b => ({ a: b.x - 0.5, b: b.x + 0.5, y0: yf, y1: yt }));
    A.box(zn, 'vent', -79, yf, zc - 0.55, 65.5, yf + 0.05, zc + 0.55, { layer: LAYER.VENT | LAYER.FURN });
    A.box(zn, 'vent', -79, yt - 0.05, zc - 0.55, 65.5, yt, zc + 0.55, { layer: LAYER.WALL });
    A.wallX(zn, 'vent', -78, 65.5, inner, yf, yt, t * 2, ops, { layer: LAYER.WALL });
    A.wallX(zn, 'vent', -79, 65.5, outer, yf, yt, t * 2, [], { layer: LAYER.WALL });
    A.wallZ(zn, 'vent', zc - 0.5, zc + 0.5, 65.5, yf, yt, t * 2);
    for (const b of branches) {
      const endZ = sg * 20.2;
      const lo = Math.min(inner, endZ), hi = Math.max(inner, endZ);
      const h0 = sg < 0 ? endZ - 1.0 : endZ, h1 = h0 + 1.0; // trou de la grille au bout de la branche
      // plancher (avec le trou), plafond, parois, bout
      if (h0 > lo) A.box(zn, 'vent', b.x - 0.55, yf, lo, b.x + 0.55, yf + 0.05, h0, { layer: LAYER.VENT | LAYER.FURN });
      if (h1 < hi) A.box(zn, 'vent', b.x - 0.55, yf, h1, b.x + 0.55, yf + 0.05, hi, { layer: LAYER.VENT | LAYER.FURN });
      A.box(zn, 'vent', b.x - 0.55, yt - 0.05, lo, b.x + 0.55, yt, hi, { layer: LAYER.WALL });
      A.wallZ(zn, 'vent', lo, hi, b.x - 0.5, yf, yt, t * 2);
      A.wallZ(zn, 'vent', lo, hi, b.x + 0.5, yf, yt, t * 2);
      A.wallX(zn, 'vent', b.x - 0.5, b.x + 0.5, endZ, yf, yt, t * 2);
      world.zone(zn).extra.push([b.x - 0.55, yf - 0.1, lo - 0.05, b.x + 0.55, yt + 0.05, hi + 0.05]);
      const gz = (h0 + h1) / 2;
      const gr = new VentGrate(world, world.newId('grate'), { zone: b.shop + '_back', x: b.x, y: 3.42, z: gz, shop: b.shop, ventZone: zn, inside: new THREE.Vector3(b.x, yf + 0.06, gz), outside: new THREE.Vector3(b.x, 0, gz) });
      world.add(gr); (world.ventGrates ||= []).push(gr);
    }
  };
  mainX('vent_s', -23.5, branchesS);
  mainX('vent_n', 23.5, branchesN);
  // conduit ouest (le long de z) reliant nord et sud, avec embranchement vers le poste
  const zn = 'vent_w';
  A.box(zn, 'vent', -79.05, yf, -24.05, -77.95, yf + 0.05, 24.05, { layer: LAYER.VENT | LAYER.FURN });
  A.box(zn, 'vent', -79.05, yt - 0.05, -24.05, -77.95, yt, 24.05, { layer: LAYER.WALL });
  A.wallZ(zn, 'vent', -24, 24, -79, yf, yt, t * 2);
  A.wallZ(zn, 'vent', -23, 23, -78, yf, yt, t * 2, [{ a: -0.5, b: 0.5, y0: yf, y1: yt }]);
  A.wallX(zn, 'vent', -79, -78, -24.05, yf, yt, t * 2); A.wallX(zn, 'vent', -79, -78, 24.05, yf, yt, t * 2);
  // branche du poste (x de -78 à -68.5, z ∈ [-0.5, 0.5]) avec la trappe en x = -69
  const zs = 'vent_sec';
  A.box(zs, 'vent', -78, yf, -0.55, -69.5, yf + 0.05, 0.55, { layer: LAYER.VENT | LAYER.FURN });
  A.box(zs, 'vent', -68.5, yf, -0.55, -68.3, yf + 0.05, 0.55, { layer: LAYER.VENT | LAYER.FURN });
  A.box(zs, 'vent', -78, yt - 0.05, -0.55, -68.3, yt, 0.55, { layer: LAYER.WALL });
  A.wallX(zs, 'vent', -78, -68.3, -0.5, yf, yt, t * 2); A.wallX(zs, 'vent', -78, -68.3, 0.5, yf, yt, t * 2);
  A.wallZ(zs, 'vent', -0.5, 0.5, -68.35, yf, yt, t * 2);
  // puits vertical vers le faux plafond du poste
  A.box(zs, 'vent', -69.55, 3.3, -0.55, -69.5, yf, 0.55, { collide: true }); A.box(zs, 'vent', -68.5, 3.3, -0.55, -68.45, yf, 0.55, { collide: true });
  A.box(zs, 'vent', -69.5, 3.3, -0.55, -68.5, yf, -0.5, { collide: true }); A.box(zs, 'vent', -69.5, 3.3, 0.5, -68.5, yf, 0.55, { collide: true });
  const sg = new VentGrate(world, world.newId('grate'), { zone: 'security', x: -69, y: 3.22, z: 0, security: true, ventZone: zs, inside: new THREE.Vector3(-69, yf + 0.06, 0), outside: new THREE.Vector3(-69, 0, 0.9) });
  world.add(sg); world.securityGrate = sg; (world.ventGrates ||= []).push(sg);
  // grille du couloir ouest (accès facile depuis le couloir avec un escabeau)
  const wg = new VentGrate(world, world.newId('grate'), { zone: 'westwing0', x: -78.5, y: 3.48, z: 10, ventZone: zn, inside: new THREE.Vector3(-78.5, yf + 0.06, 10), outside: new THREE.Vector3(-77.6, 0, 10) });
  // trou dans le plancher du conduit ouest à z=10
  world.add(wg); world.ventGrates.push(wg);
  world.ventY = yf;
}

// ───────────────────────── EXTÉRIEUR ─────────────────────────
function buildOutside(world, A, rng) {
  const g = world.game; const zone = world.zone('outside');
  // parking extérieur
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(520, 440), g.mats.get('asphalt', 'outside'));
  lot.rotation.x = -Math.PI / 2; lot.position.set(0, -0.03, 0); lot.receiveShadow = true;
  const uv = lot.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 104, uv.getY(i) * 88);
  zone.group.add(lot);
  // murs extérieurs (périmètre de jeu : on peut sortir si on brise la façade, mais pas trop loin)
  world.physics.add(new Box(80.4, -1, -60, 130, 0, 60, LAYER.WALL));
  for (const [x0, z0, x1, z1] of [[130, -60, 131, 60], [80.4, 60, 131, 61], [80.4, -61, 131, -60]]) world.physics.add(new Box(x0, 0, z0, x1, 3, z1, LAYER.WALL));
  // lampadaires
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6) }); lampMat.toneMapped = false;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.6, metalness: 0.5 });
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'); const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,160,0.9)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  world.streetLamps = [];
  for (let x = 95; x <= 190; x += 24) for (const z of [-50, -18, 18, 50]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 8, 6), poleMat); pole.position.set(x, 4, z);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.4), lampMat); head.position.set(x, 8, z);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); glow.scale.set(5, 5, 1); glow.position.set(x, 7.8, z);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 })); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.01, z);
    zone.group.add(pole, head, glow, pool); world.streetLamps.push({ head, glow, pool, pos: new THREE.Vector3(x, 8, z) });
  }
  // marquage des places
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x9e9e9e });
  for (let x = 88; x <= 200; x += 3) for (const z of [-35, 35, -10, 10]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 5), lineMat); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.005, z); zone.group.add(l); }
  // ville au loin
  const city = new THREE.Group(); const R = new RNG('city');
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + R.range(-0.02, 0.02); const d = R.range(330, 520);
    const w = R.range(14, 40), h = R.range(18, 110);
    const mat = new THREE.MeshBasicMaterial({ map: buildingFacade(1 + (i % 7)), fog: false, color: new THREE.Color(0.55, 0.55, 0.6) });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat); b.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d); b.rotation.y = R.range(0, 3);
    city.add(b);
  }
  zone.group.add(city);
  world.city = city;
}

// ───────────────────────── CAMÉRAS DE ZONES ─────────────────────────
function defineAreaCameras(world) {
  const C = (id, name, area, zone, pos, yaw, pitch = -0.35, fov = 70) => world.cameras.push({ id, name, area, zone, pos: new THREE.Vector3(...pos), yaw, pitch, fov });
  C('cam_g0w', 'Galerie RDC ouest', 'gallery0', 'gallery0_w', [-65.3, 4.2, -7.2], -Math.PI / 2 - 0.25, -0.3, 75);
  C('cam_g0e', 'Galerie RDC est', 'gallery0', 'gallery0_e', [65.3, 4.2, 7.2], Math.PI / 2 - 0.25, -0.3, 75);
  C('cam_atrium', 'Atrium', 'gallery0', 'atrium', [-23.5, 9.6, -7.5], -Math.PI * 0.75 - 0.4, -0.45, 80);
  C('cam_entrance', 'Hall d\'entrée', 'entrance', 'entrance', [67, 4.2, -7.4], Math.PI * 0.75 + 0.2, -0.35, 80);
  C('cam_g1w', 'Galerie étage ouest', 'gallery1', 'gallery1_w', [-65.3, 9.6, 7.2], -Math.PI / 2 + 0.25, -0.3, 75);
  C('cam_g1e', 'Galerie étage est', 'gallery1', 'gallery1_e', [65.3, 9.6, -7.2], Math.PI / 2 + 0.25, -0.3, 75);
  C('cam_svc_s', 'Couloir de service sud', 'service', 'service_s0', [-75.5, 4.2, -22.4], -Math.PI / 2, -0.25, 60);
  C('cam_svc_n', 'Couloir de service nord', 'service', 'service_n0', [79.5, 4.2, 22.4], Math.PI / 2, -0.25, 60);
  C('cam_garage1', 'Parking — ouest', 'garage', 'garage', [-65.5, -1, -23.5], -Math.PI * 0.75, -0.3, 80);
  C('cam_garage2', 'Parking — est', 'garage', 'garage', [65.5, -1, 23.5], Math.PI * 0.25, -0.3, 80);
  C('cam_ramp', 'Rideau de la rampe', 'garage', 'garage', [60, -1, -12], Math.PI * 0.62, -0.25, 70);
  C('cam_basement', 'Couloir technique', 'basement', 'westwingB', [-79.4, -1.0, 21.5], 0, -0.3, 70);
  C('cam_gen', 'Groupe électrogène', 'basement', 'generator', [-66.6, -1.0, -12.6], -Math.PI * 0.25, -0.45, 75);
  C('cam_vent_s', 'Conduit sud', 'vents', 'vent_s', [-77.5, 4.25, -23.5], -Math.PI / 2, -0.05, 60);
  C('cam_vent_w', 'Conduit ouest', 'vents', 'vent_w', [-78.5, 4.25, -23], Math.PI, -0.05, 60);
  C('cam_roof', 'Toit', 'roof', 'roof', [-75.5, 13.2, 12.6], -Math.PI * 0.8, -0.35, 80);
  C('cam_warehouse', 'Entrepôt', 'warehouse', 'warehouse', [-80.8, 7.4, 4.6], -Math.PI * 0.25, -0.4, 80);
  C('cam_dock', 'Quai de chargement', 'warehouse', 'warehouse', [-111.6, 7.4, -24.6], Math.PI * 0.75 + 0.4, -0.4, 75);
}

// ───────────────────────── GRAPHE DE NAVIGATION ─────────────────────────
function buildNav(world, doors) {
  const nav = world.nav; const N = (id, x, y, z, zone, tags) => nav.node(id, x, y, z, zone, tags); const L = (a, b, o) => nav.link(a, b, o);
  // galeries : deux voies (z = ±6) par étage
  for (const [f, y] of [[0, 0], [1, 5]]) {
    for (let x = -63; x <= 63; x += 6) {
      const zn = (f ? 'gallery1_' : 'gallery0_') + (x < 0 ? 'w' : 'e');
      const zone = Math.abs(x) <= 24 ? 'atrium' : zn;
      N(`g${f}n${x}`, x, y, 6, zone); N(`g${f}s${x}`, x, y, -6, zone);
      if (x > -63) { L(`g${f}n${x - 6}`, `g${f}n${x}`); L(`g${f}s${x - 6}`, `g${f}s${x}`); }
      if (Math.abs(x) > 24 || (f === 0 && Math.abs(x) === 9)) L(`g${f}n${x}`, `g${f}s${x}`);
    }
  }
  // escalators
  N('escW0', -13.6, 0, -1.6, 'atrium'); N('escW1', -25.5, 5, -1.6, 'gallery1_w');
  N('escE0', 13.6, 0, 1.6, 'atrium'); N('escE1', 25.5, 5, 1.6, 'gallery1_e');
  L('escW0', 'escW1', { escalator: 'W' }); L('escE0', 'escE1', { escalator: 'E' });
  L('escW0', 'g0s-15'); L('escW0', 'g0n-15'); L('escE0', 'g0n15'); L('escE0', 'g0s15');
  L('escW1', 'g1s-27'); L('escW1', 'g1n-27'); L('escE1', 'g1n27'); L('escE1', 'g1s27');
  // poste de sécurité
  N('sec_out', -64.2, 0, 0, 'gallery0_w'); N('sec_in', -67.6, 0, 0, 'security', ['security']); N('sec_desk', -70.8, 0, -0.6, 'security', ['security', 'desk']); N('sec_rear', -75, 0, 3, 'security');
  L('sec_out', 'g0n-63'); L('sec_out', 'g0s-63');
  L('sec_out', 'sec_in', { door: doors.sec_front.id }); L('sec_in', 'sec_desk'); L('sec_desk', 'sec_rear');
  N('vest', -71, 0, 9, 'vestiaire'); N('store', -71, 0, -13, 'secstore'); L('sec_desk', 'vest', { door: doors.sec_vest.id }); L('sec_desk', 'store', { door: doors.sec_store.id });
  // aile ouest
  for (let z = -23; z <= 23; z += 4) { N(`ww0_${z}`, -78, 0, z, 'westwing0'); N(`ww1_${z}`, -78, 5, z, 'westwing1'); if (z > -23) { L(`ww0_${z - 4}`, `ww0_${z}`); L(`ww1_${z - 4}`, `ww1_${z}`); } }
  L('sec_rear', 'ww0_1', { door: doors.sec_back.id }); L('store', 'ww0_-11', { door: doors.store_ww.id });
  // couloirs de service
  for (const [f, y] of [[0, 0], [1, 5]]) for (const side of ['s', 'n']) {
    const zc = side === 's' ? -23.5 : 23.5;
    for (let x = -75; x <= 78; x += 6) { N(`sv${f}${side}${x}`, x, y, zc, `service_${side}${f}`); if (x > -75) L(`sv${f}${side}${x - 6}`, `sv${f}${side}${x}`); }
    L(`sv${f}${side}-75`, `ww${f}_${side === 's' ? -23 : 21}`);
  }
  // escalier ouest
  const sw = [[-4.5, 'B'], [0, '0'], [5, '1'], [10.5, 'R']];
  for (const [y, k] of sw) N(`stW${k}`, -74.8, y, 17.75, 'stairsW');
  const swMid = (a, b, y0, y1) => { const h = (y1 - y0) / 2; N(`stW${a}a`, -73, y0, 14.4, 'stairsW'); N(`stW${a}b`, -68.5, y0 + h, 14.4, 'stairsW'); N(`stW${a}c`, -68.5, y0 + h, 20.6, 'stairsW'); N(`stW${a}d`, -73.3, y1, 20.6, 'stairsW'); nav.chain([`stW${a}`, `stW${a}a`, `stW${a}b`, `stW${a}c`, `stW${a}d`, `stW${b}`]); };
  swMid('B', '0', -4.5, 0); swMid('0', '1', 0, 5); swMid('1', 'R', 5, 10.5);
  L('stW0', 'ww0_17', { door: doors.stW_0.id }); L('stW1', 'ww1_17', { door: doors.stW_1.id });
  // sous-sol
  for (let z = -23; z <= 21; z += 4) { N(`wwB_${z}`, -78, -4.5, z, 'westwingB'); if (z > -23) L(`wwB_${z - 4}`, `wwB_${z}`); }
  L('stWB', 'wwB_17', { door: doors.stW_B.id });
  N('genr', -71, -4.5, -17, 'generator'); N('elecr', -71, -4.5, -7, 'electrical'); N('par', -71, -4.5, 2, 'pa'); N('boilr', -71, -4.5, 9.5, 'boiler');
  L('genr', 'wwB_-19', { door: doors.gen.id }); L('elecr', 'wwB_-7', { door: doors.elec.id }); L('par', 'wwB_1', { door: doors.pa.id }); L('boilr', 'wwB_9', { door: doors.boiler.id });
  N('b13n', -84, -4.5, -7, 'b13'); L('b13n', 'wwB_-7', { door: doors.b13.id });
  // parking
  for (let x = -60; x <= 60; x += 12) for (const z of [-6, 6]) { N(`gar${x}_${z}`, x, -4.5, z, 'garage'); }
  for (let x = -60; x <= 60; x += 12) { L(`gar${x}_-6`, `gar${x}_6`); if (x > -60) { L(`gar${x - 12}_-6`, `gar${x}_-6`); L(`gar${x - 12}_6`, `gar${x}_6`); } }
  N('gar_w', -64, -4.5, 9.6, 'garage'); L('gar_w', 'gar-60_6'); L('gar_w', 'boilr', { door: doors.boiler_g.id });
  N('gar_gate', 63.5, -4.5, -4.5, 'garage'); L('gar_gate', 'gar60_-6');
  N('ramp0', 68, -4.2, -4.5, 'ramp'); N('ramp1', 82, -2.5, -4.5, 'ramp'); N('ramp2', 96, -0.2, -4.5, 'ramp', ['outside']);
  L('gar_gate', 'ramp0', { shutter: true }); L('ramp0', 'ramp1'); L('ramp1', 'ramp2');
  // escalier est
  for (const [y, k] of [[-4.5, 'B'], [0, '0'], [5, '1']]) { N(`stE${k}`, 77.6, y, 9.2, 'stairsE'); N(`stE${k}s`, 77, y, 20.5, 'stairsE'); L(`stE${k}`, `stE${k}s`); }
  const seMid = (a, b, y0, y1) => { const h = (y1 - y0) / 2; N(`stE${a}a`, 67.8, y0, 11, 'stairsE'); N(`stE${a}b`, 67.8, y0 + h, 20.6, 'stairsE'); N(`stE${a}c`, 72.2, y0 + h, 20.6, 'stairsE'); N(`stE${a}d`, 72.2, y1, 11, 'stairsE'); nav.chain([`stE${a}`, `stE${a}a`, `stE${a}b`, `stE${a}c`, `stE${a}d`, `stE${b}`]); };
  seMid('B', '0', -4.5, 0); seMid('0', '1', 0, 5);
  N('gar_e', 64, -4.5, 9.25, 'garage'); L('gar_e', 'gar60_6'); L('gar_e', 'stEB', { door: doors.stE_B.id });
  L('stE0s', 'sv0n75', { door: doors.stE_svc0.id }); L('stE1s', 'sv1n75', { door: doors.stE_svc1.id });
  // hall, mezzanine, poubelles, CVC
  N('ent', 74, 0, 0, 'entrance', ['entrance']); N('ent_door', 78.8, 0, 0, 'entrance'); N('mez', 72, 5, 0, 'mezzanine');
  L('ent', 'g0n63'); L('ent', 'g0s63'); L('ent', 'ent_door'); L('mez', 'g1n63'); L('mez', 'g1s63');
  L('ent', 'stE0', { door: doors.entr_stE.id }); L('mez', 'stE1', { door: doors.mez_stE.id });
  N('trashr', 73, 0, -15, 'trash'); L('trashr', 'ent', { door: doors.entr_trash.id }); L('trashr', 'sv0s75', { door: doors.trash_svc.id });
  N('hvacr', 73, 5, -15, 'hvac'); L('hvacr', 'mez', { door: doors.mez_hvac.id }); L('hvacr', 'sv1s75', { door: doors.hvac_svc.id });
  // archives
  N('arch', -71, 5, 0, 'archives'); L('arch', 'g1n-63', { door: doors.arch_g.id }); L('arch', 'g1s-63', { door: doors.arch_g.id }); L('arch', 'ww1_1', { door: doors.arch_w.id });
  // entrepôt
  N('wh', -90, 0, -12.7, 'warehouse'); N('wh2', -100, 0, -8, 'warehouse'); N('wh3', -96, 0, 1, 'warehouse'); L('wh', 'ww0_-11', { door: doors.wh_a.id }); L('wh', 'wh2'); L('wh2', 'wh3'); L('wh', 'wh3');
  // toit
  N('roofA', -78, 10.5, 17.75, 'roof'); L('roofA', 'stWR', { door: doors.stW_R.id });
  for (const [k, x, z] of [['roofB', -50, 0], ['roofC', -30, 10], ['roofD', 0, 12], ['roofE', 30, -10], ['roofF', 60, 0]]) N(k, x, 10.5, z, 'roof');
  nav.chain(['roofA', 'roofB', 'roofC', 'roofD', 'roofE', 'roofF']);
  // conduits (graphe séparé, relié par les grilles)
  const vy = world.ventY + 0.06;
  for (let x = -78; x <= 64; x += 6) { N(`vs${x}`, x, vy, -23.5, 'vent_s', ['vent']); N(`vn${x}`, x, vy, 23.5, 'vent_n', ['vent']); if (x > -78) { L(`vs${x - 6}`, `vs${x}`, { vent: true }); L(`vn${x - 6}`, `vn${x}`, { vent: true }); } }
  for (let z = -18; z <= 18; z += 6) { N(`vw${z}`, -78.5, vy, z, 'vent_w', ['vent']); if (z > -18) L(`vw${z - 6}`, `vw${z}`, { vent: true }); }
  N('vw-23', -78.5, vy, -23.5, 'vent_w', ['vent']); N('vw23', -78.5, vy, 23.5, 'vent_w', ['vent']); L('vw-23', 'vw-18', { vent: true }); L('vw18', 'vw23', { vent: true });
  L('vw-23', 'vs-78', { vent: true }); L('vw23', 'vn-78', { vent: true });
  N('vsec0', -75, vy, 0, 'vent_sec', ['vent']); N('vsec1', -69.6, vy, 0, 'vent_sec', ['vent', 'security_vent']); N('vw0', -78.5, vy, 0, 'vent_w', ['vent']);
  L('vw-6', 'vw0', { vent: true }); L('vw0', 'vw6', { vent: true }); L('vw0', 'vsec0', { vent: true }); L('vsec0', 'vsec1', { vent: true });
  for (const gr of world.ventGrates) {
    if (!gr.o.shop) continue;
    const s = gr.o; const side = s.z > 0 ? 'n' : 's'; const id = `vb_${s.shop}`;
    N(id, s.x, vy, s.z, side === 'n' ? 'vent_n' : 'vent_s', ['vent', 'grate']);
    const near = nav.nearest(s.x, vy, side === 'n' ? 23.5 : -23.5, n => n.id.startsWith('v' + side) && n.id !== id && !n.id.startsWith('vb_'));
    if (near) L(id, near.id, { vent: true });
    gr.navNode = id;
  }
  // les magasins se branchent eux-mêmes (shopbuilder.linkNav)
  world.shopNavHooks?.forEach(fn => fn(nav, doors));
}
