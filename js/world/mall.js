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
import { buildDecor } from './decor.js';
import { buildGarageDecor } from './garagedecor.js';
import { buildServiceDecor } from './servicedecor.js';
import { buildOutside, rampTop, rampSurface } from './outside.js';
import { addMapSign, buildMapSigns } from './mallmap.js';
import { Elevator } from './elevator.js';
import { SHOPS } from '../data/shops.js';
import { posterTexture, signTexture, textTexture } from '../engine/textures.js';
import { RNG } from '../engine/rng.js';
import { GeoBuilder, rectShape, circleShape, roundPath, latheGeo, trs } from '../engine/geo.js';

export const Y0 = 0, Y1 = 5, YB = -4.5, YR = 10.5;
export const CEIL0 = 4.6, CEIL1 = 10;
// Vide central de l'étage (|z| < VOID_Z) le long des galeries, traversé par des passerelles (x des trous)
export const VOID_Z = 4;
export const VOID_HOLES = [[-61.5, -46.5], [-43.5, -28], [-24, 24], [28, 43.5], [46.5, 61.5]];
export const BRIDGES_X = [-63, -45, -27, 27, 45, 63]; // nœuds de navigation reliant les deux rives à l'étage
export const ELEVATOR = { x0: -55.2, x1: -52.8, z0: 1.5, z1: 3.9, floors: [-4.5, 0, 5] }; // ascenseur panoramique (galerie ouest)
const ELEV_HOLE = { x0: ELEVATOR.x0, z0: ELEVATOR.z0, x1: ELEVATOR.x1, z1: ELEVATOR.z1 };
const holesIn = (x0, x1) => VOID_HOLES.filter(([a, b]) => b > x0 && a < x1).map(([a, b]) => ({ x0: Math.max(a, x0), z0: -VOID_Z, x1: Math.min(b, x1), z1: VOID_Z }));
const galZone = (x, f) => (Math.abs(x) <= 24 ? 'atrium' : (f ? 'gallery1_' : 'gallery0_') + (x < 0 ? 'w' : 'e'));
// Bureaux de l'administration : [zone, nom, [x0, z0, x1, z1]] (étage, y 5 → plafond suspendu 8.6)
const ADMIN_ROOMS = [
  ['adm_accueil', 'Administration — accueil', [-70, 1, -66, 7]], ['adm_reunion', 'Salle de réunion', [-70, 7, -66, 13]],
  ['adm_compta', 'Comptabilité', [-70, -7, -66, -1]], ['adm_coffre', 'Salle des coffres', [-70, -12, -66, -7]], ['adm_archives', 'Archives', [-70, -22, -66, -12]],
  ['adm_info', 'Salle informatique', [-76, 1, -72, 7]], ['adm_repro', 'Reprographie', [-76, 7, -72, 13]],
  ['adm_rh', 'Ressources humaines', [-76, -7, -72, -1]], ['adm_market', 'Marketing & événements', [-76, -14, -72, -7]], ['adm_infirm', 'Infirmerie', [-76, -22, -72, -14]],
];

export function buildMall(world) {
  const g = world.game;
  const A = new Arch(world);
  world.arch = A; // lots d'architecture ouverts pendant la construction (encadrements de portes, coffres de rideaux…)
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
  // Administration du centre (étage du bloc ouest) : couloir en croix + bureaux
  const AZ = (id, name, type, b, o = {}) => Z(id, name, type, 1, [b[0], 5, b[1], b[2], 10, b[3]], { circuit: 'service', area: 'gallery1', lightColor: [1, 0.97, 0.92], lightLevel: 0.62, cull: 45, ...o });
  AZ('adm_couloir', 'Administration — couloir', 'corridor', [-72, -22, -70, 13]);
  world.zone('adm_couloir').extra.push([-76, 5, -1, -72, 10, 1], [-70, 5, -1, -66, 10, 1]);
  for (const [id, name, b] of ADMIN_ROOMS) AZ(id, name, 'backroom', b);
  Z('gallery0_w', 'Galerie RDC — ouest', 'corridor', 0, [-66, 0, -8, -24, 4.6, 8], { circuit: 'gallery', area: 'gallery0', cull: 70 });
  Z('atrium', 'Atrium', 'atrium', 0, [-24, 0, -8, 24, 12, 8], { circuit: 'gallery', area: 'gallery0', cull: 80, void: true });
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
  Z('ramp', 'Rampe du parking', 'garage', -1, [66, -4.5, -7, 80.3, 0, -2], { circuit: 'garage', area: 'garage' }); // partie couverte (la tranchée est dehors)
  Z('warehouse', 'Entrepôt', 'warehouse', 0, [-112, 0, -25, -80, 8, 5], { circuit: 'service', area: 'warehouse', cull: 60 });
  Z('roof', 'Toit', 'roof', 2, [-82, 10.4, -27, 82, 16, 27], { circuit: 'roof', area: 'roof', outdoor: true, cull: 120 });
  Z('vent_s', 'Conduit sud', 'vent', 0, [-79.1, 3.5, -24.1, 66, 4.55, -22.9], { area: 'vents', cull: 35 });
  Z('vent_n', 'Conduit nord', 'vent', 0, [-79.1, 3.5, 22.9, 66, 4.55, 24.1], { area: 'vents', cull: 35 });
  Z('vent_w', 'Conduit ouest', 'vent', 0, [-79.1, 3.5, -24.1, -77.9, 4.55, 24.1], { area: 'vents', cull: 35 });
  Z('vent_sec', 'Conduit du poste', 'vent', 0, [-79, 3.2, -0.6, -68.3, 4.55, 0.6], { area: 'vents', cull: 35 });
  Z('outside', 'Parking extérieur', 'outside', 0, [80, -3, -75, 200, 100, 75], { area: 'outside', outdoor: true }); // visibilité : outside.js (visibleAt)
  // vides centraux sous la verrière (aucune géométrie : relient les niveaux pour la visibilité)
  Z('void_w', 'Vide central — ouest', 'void', 1, [-64, -0.5, -VOID_Z, -24, 14.5, VOID_Z], { area: 'gallery1', void: true, cull: 120 });
  Z('void_e', 'Vide central — est', 'void', 1, [24, -0.5, -VOID_Z, 64, 14.5, VOID_Z], { area: 'gallery1', void: true, cull: 120 });

  // ═══════════════════════════ GALERIE ═══════════════════════════
  // Sol RDC galerie + atrium
  A.slabWithHoles('gallery0_w', 'terrazzo', -66, -8, -24, 8, 0, 0.6, [ELEV_HOLE], { faces: 'xXzZY' }); // trémie de l'ascenseur
  A.floor('atrium', 'terrazzo', -24, -8, 24, 8, 0, 0.6, { faces: 'Y' });
  A.floor('gallery0_e', 'terrazzo', 24, -8, 66, 8, 0, 0.6, { faces: 'Y' });
  // Dalle de l'étage : vide central sur toute la longueur, passerelles aux paliers des escalators, au milieu des
  // galeries et aux extrémités
  for (const [zn, x0, x1] of [['gallery1_w', -66, -24], ['atrium', -24, 24], ['gallery1_e', 24, 66]]) {
    A.slabWithHoles(zn, 'terrazzo', x0, -8, x1, 8, 5, 0.4, holesIn(x0, x1), { faces: 'xXzZY' });
    // plafond du RDC (sous la dalle) et plafond de l'étage (sous le toit, ouvert sur la verrière), à fleur des têtes de
    // murs, des bandeaux de vitrine et des luminaires (4,60 et 10,00 : ni jour au-dessus des murs, ni plafonniers suspendus
    // à 2 cm du plafond)
    A.slabWithHoles(zn === 'atrium' ? 'atrium' : zn.replace('1', '0'), 'ceiling', x0, -8, x1, 8, 4.6, 0.02, holesIn(x0, x1), { collide: false, faces: 'y' });
    A.slabWithHoles(zn, 'ceiling', x0, -8, x1, 8, 10.0, 0.02, [{ x0: Math.max(x0, -64), z0: -VOID_Z, x1: Math.min(x1, 64), z1: VOID_Z }], { collide: false, faces: 'y' });
  }
  // Retombées de dalle côté RDC (bandeau plâtre jusqu'au nez de dalle, jonc inox arrondi en sous-face) ; garde-corps
  // vitrés côté étage : sabot inox, panneaux de verre feuilleté entre poteaux ronds (pinces), main courante ronde
  const railSeg = (x0, z0, x1, z1, o = {}) => {
    const zone = galZone((x0 + x1) / 2, 1), zone0 = galZone((x0 + x1) / 2, 0);
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const lx = Math.min(x0, x1), hx = Math.max(x0, x1), lz = Math.min(z0, z1), hz = Math.max(z0, z1);
    const len = alongX ? hx - lx : hz - lz, n = Math.max(1, Math.round(len / 1.5));
    // t : abscisse le long du garde-corps, o : décalage perpendiculaire
    const P = (t, y, o = 0) => alongX ? new THREE.Vector3(lx + t, y, lz + o) : new THREE.Vector3(lx + o, y, lz + t);
    const bx = (t0, t1, y0, y1, th, mat, zn) => alongX ? A.box(zn, mat, lx + t0, y0, lz - th, lx + t1, y1, hz + th, { collide: false }) : A.box(zn, mat, lx - th, y0, lz + t0, hx + th, y1, lz + t1, { collide: false });
    bx(-0.06, len + 0.06, 4.16, 5.0, 0.06, 'plaster_f2efe8', zone0);                                                   // retombée
    A.sweep(zone0, 'aluminium', [P(-0.068, 4.13), P(len + 0.068, 4.13)], rectShape(0.136, 0.06, 0.018, 2), 0xffffff, { caps: true }); // jonc
    if (o.glass === false) return; // palier de l'ascenseur : retombée seule, le garde-corps s'arrête contre la gaine
    A.sweep(zone, 'aluminium', [P(-0.03, 5.05), P(len + 0.03, 5.05)], rectShape(0.07, 0.1, 0.008, 1), 0xffffff, { caps: true });      // sabot
    for (let i = 0; i <= n; i++) {
      const t = len * i / n;
      A.tube(zone, 'aluminium', P(t, 5.1), P(t, 6.06), 0.021, 0xffffff, { segs: 12 });                                         // poteau
      for (const s of [-1, 1]) if ((s < 0 && i > 0) || (s > 0 && i < n)) for (const y of [5.32, 5.84]) { const c0 = s < 0 ? t - 0.057 : t + 0.012; bx(c0, c0 + 0.045, y - 0.025, y + 0.025, 0.018, 'aluminium', zone); } // pinces
      if (i < n) bx(t + 0.036, len * (i + 1) / n - 0.036, 5.1, 6.0, 0.006, 'glass', zone);                                         // verre
    }
    A.sweep(zone, 'aluminium', [P(-0.04, 6.085), P(len + 0.04, 6.085)], circleShape(0.025, 12), 0xffffff, { caps: true });    // main courante
    world.physics.add(new Box(lx - 0.06, 5, lz - 0.06, hx + 0.06, 6.15, hz + 0.06, LAYER.GLASS));
  };
  for (const [a, b] of VOID_HOLES) {
    railSeg(a, -VOID_Z, b, -VOID_Z);
    // palier de l'ascenseur : garde-corps nord interrompu sur toute la façade de la gaine (portes et boîte d'appel
    // accessibles), retombée continue sous la dalle
    const { x0: ex0, x1: ex1 } = ELEVATOR;
    if (ex1 > a && ex0 < b) { railSeg(a, VOID_Z, ex0 - 0.07, VOID_Z); railSeg(ex1 + 0.07, VOID_Z, b, VOID_Z); railSeg(ex0 - 0.07, VOID_Z, ex1 + 0.07, VOID_Z, { glass: false }); }
    else railSeg(a, VOID_Z, b, VOID_Z);
    for (const xe of [a, b]) {
      if (Math.abs(xe) === 24) { railSeg(xe, -VOID_Z, xe, -2.7); railSeg(xe, 2.7, xe, VOID_Z); } // arrivée des escalators
      else railSeg(xe, -VOID_Z, xe, VOID_Z);
    }
  }
  world.voidHoles = VOID_HOLES;
  // Éclairage : sous les coursives au RDC, plafond des coursives à l'étage, suspensions dans le vide
  for (let x = -63; x <= 63; x += 6) {
    const zn0 = galZone(x, 0), zn1 = galZone(x, 1);
    for (const z of [-6, 6]) { LP(A, zn0, x, 4.6, z, 2.4, 0.4, (x + 63) % 12 === 0 && z < 0); LP(A, zn1, x, 10, z, 2.4, 0.4, (x + 63) % 12 === 0 && z > 0); }
    if (x % 12 === 3 || x % 12 === -9) { // luminaires suspendus à la charpente : profilé d'aluminium, embouts, câbles et rosaces
      A.panel(zn1, x, 9.0, 0, 3.2, 0.22, true); // (profilé, sans cadre)
      A.rbox(zn1, 'aluminium', x, 9.02, 0, 3.3, 0.11, 0.28, 0.025, 0xffffff, { n: 2 });
      for (const sx of [-1, 1]) A.box(zn1, 'furniture', x + sx * 1.651 - 0.004, 8.968, -0.12, x + sx * 1.651 + 0.004, 9.072, 0.12, { collide: false, color: 0x2a2c2e, flat: true });
      for (const sx of [-1, 1]) { // câbles jusqu'à la panne faîtière de la verrière (dessous à 13,72 ; ils s'arrêtaient dans le vide à 11,1)
        A.tube(zn1, 'steel', V3(x + sx * 1.19, 9.075, 0), V3(x + sx * 1.19, 13.72, 0), 0.0022, 0xffffff, { segs: 4, open: true });
        A.lathe(zn1, 'aluminium', [[0.012, 0], [0.012, 0.045], [0.004, 0.06]], 8, x + sx * 1.19, 9.075, 0);
        A.lathe(zn1, 'aluminium', [[0, -0.02], [0.04, -0.02], [0.04, 0], [0, 0]], 10, x + sx * 1.19, 13.72, 0);
      }
    }
  }

  // spots carrés sous les passerelles (axe des passerelles, RDC), plinthes inox des murs de galerie et du hall
  for (const xb of [-45, -26, 26, 45]) for (const z of [-2.2, 0, 2.2]) LP(A, galZone(xb, 0), xb, 4.6, z, 0.3, 0.3, false);
  const skirt = (zn, x0, z0, x1, z1, y = 0) => A.box(zn, 'aluminium', x0, y, z0, x1, y + 0.1, z1, { collide: false });
  skirt('gallery0_w', -65.85, -8, -65.83, -0.75); skirt('gallery0_w', -65.85, 0.75, -65.83, 8);
  skirt('gallery1_w', -65.85, -8, -65.83, -0.6, 5); skirt('gallery1_w', -65.85, 0.6, -65.83, 8, 5);
  for (const s of [-1, 1]) for (const [zn, y, d0, d1] of [['entrance', 0, 77, 78.2], ['mezzanine', 5, s < 0 ? 72 : 77, s < 0 ? 73.2 : 78.2]]) { skirt(zn, 66, s * 7.85 - 0.01, d0, s * 7.85 + 0.01, y); skirt(zn, d1, s * 7.85 - 0.01, 79.9, s * 7.85 + 0.01, y); }

  // Ascenseur panoramique (parking ↔ RDC ↔ étage)
  world.elevator = new Elevator(world, world.newId('elevator'), ELEVATOR, A); world.add(world.elevator);

  // Escalators (voir buildEscalator) : deux voies parallèles par côté, terre-plein entre elles
  for (const [xb, dir] of [[-15, 'x-'], [15, 'x+']]) { buildEscalator(world, A, xb, dir, -2.6); buildEscalator(world, A, xb, dir, 0.6); escalatorMedian(world, A, xb, dir); }
  // Fontaine de l'atrium : bassin rond de 6 m (plus de coins invisibles autour de la margelle), collision assez haute
  // pour qu'on ne saute pas au-dessus de l'eau
  dev('fountain', 'atrium', 0, 0.5, 0, 0, { collide: false });
  A.disc(0, 0, 3, 0, 1.1, 12);
  // Arbres en jardinière, bancs, poubelles (jardinières de l'atrium hors des voies z = ±6 et des traversées x = ±9,
  // celles des galeries à 0,8 m des traversées x = ±39 / ±57)
  for (const [x, z] of [[-10.5, -4.4], [10.5, -4.4], [-10.5, 4.4], [10.5, 4.4], [-40.5, 0], [40.5, 0], [-55.5, 0], [55.5, 0]]) planter(A, x < -24 ? 'gallery0_w' : x > 24 ? 'gallery0_e' : 'atrium', x, z, rng);
  for (const [x, z, ry] of [[-30, -2.5, 0], [-30, 2.5, Math.PI], [30, -2.5, 0], [30, 2.5, Math.PI], [-48, -2.5, 0], [48, 2.5, Math.PI], [-5, -6.8, 0], [-5, 6.8, Math.PI]]) { // (le banc de x = 5 était dans le piano)
    const zn = x < -24 ? 'gallery0_w' : x > 24 ? 'gallery0_e' : 'atrium';
    dev('mall_bench', zn, x, 0.225, z, ry);
  }
  for (const [x, z] of [[-28.5, 5.2], [28.5, -5.2]]) dev('trash_can', x < 0 ? 'gallery0_w' : 'gallery0_e', x, 0.4, z, 0, { contents: ['banana_peel', 'newspaper'] });
  for (const [x, z, ry] of [[-31, -4.7, 0], [31, 4.7, Math.PI], [-52, 4.7, Math.PI], [52, -4.7, 0], [-38, 4.7, Math.PI], [38, -4.7, 0]]) dev('mall_bench', x < 0 ? 'gallery1_w' : 'gallery1_e', x, 5.225, z, ry);
  dev('massage_chair', 'gallery1_e', 57, 5.6, -7.2, 0); // contre le mur des toilettes, hors de la voie et de la porte
  dev('water_fountain', 'gallery0_w', -65.66, 0.6, 6.5, Math.PI / 2); // contre le mur ouest (il était planté à 1,35 m du mur)
  // mur ouest (parement à x = -65,85) : façades tournées vers la galerie, dos contre le mur
  dev('fire_alarm', 'gallery0_w', -65.825, 1.4, -6.5, Math.PI / 2);
  dev('fire_alarm', 'gallery1_w', -65.825, 6.4, -6.5, Math.PI / 2);
  dev('extinguisher_box', 'gallery0_w', -65.725, 1.0, -7.4, Math.PI / 2);
  // bout est : la galerie s'ouvre en grand sur le hall et la mezzanine (pas de mur en x = 66) ; déclencheur et armoires
  // sur les murs nord / sud du hall et de la mezzanine (ils flottaient au milieu du passage)
  dev('fire_alarm', 'entrance', 66.6, 1.4, 7.825, Math.PI);
  dev('extinguisher_box', 'entrance', 66.45, 1.0, -7.725, 0);
  dev('extinguisher_box', 'mezzanine', 66.45, 6.0, 7.725, Math.PI);
  // Affiche de Lucie près des toilettes de l'étage (et une au RDC)
  // (à 1 cm devant le parement : -65,89 les enterrait dans le mur ouest, -7,85 les mettait à fleur du mur — scintillement)
  poster(world, 'gallery0_w', -65.84, 1.7, 3.5, Math.PI / 2, 2);
  poster(world, 'gallery1_e', 55.2, 6.7, -7.84, 0, 2);
  poster(world, 'entrance', 67.45, 1.8, 7.84, Math.PI, 6);       // mur nord du hall (elle flottait dans l'ouverture galerie / hall)
  poster(world, 'atrium', -24.014, 1.7, -1.5, -Math.PI / 2, 0);  // habillage de l'about de l'escalator ouest (elle flottait devant une vitrine)
  poster(world, 'gallery1_w', -65.84, 6.8, 4, Math.PI / 2, 7);

  // Mur ouest de la galerie (côté poste) — RDC et étage
  A.wallZ('gallery0_w', 'plaster_e8e2d4', -8, 8, -66, 0, 4.6, 0.3, [{ a: -0.75, b: 0.75, y0: 0, y1: 2.5 }]);
  A.wallZ('gallery1_w', 'plaster_e8e2d4', -8, 8, -66, 5, 10, 0.3, [{ a: -0.6, b: 0.6, y0: 5, y1: 7.2 }]);
  // panneau « SÉCURITÉ » au-dessus de la porte du poste
  const secSign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.45), new THREE.MeshBasicMaterial({ map: signTexture('POSTE DE SÉCURITÉ', 0x29b6f6, { h: 120, fontSize: 70, font: 'Arial' }) }));
  secSign.position.set(-65.83, 3.0, 0); secSign.rotation.y = Math.PI / 2; world.zone('gallery0_w').group.add(secSign); world.zone('security').signMats.push(secSign.material);
  // Panneaux de sortie de secours (vert, toujours allumés)
  // (atrium : suspendu sous la coursive nord ; plaqué sur la boulangerie, il était caché derrière son enseigne)
  for (const [x, y, z, ry, zn, yc] of [[-65.83, 3.4, 5, Math.PI / 2, 'gallery0_w'], [65.83, 3.4, 0, -Math.PI / 2, 'gallery0_e', 4.6], [-65.83, 8.4, 0, Math.PI / 2, 'gallery1_w'], [0, 4.2, 5.2, Math.PI, 'atrium', 4.6]]) { exitSign(world, zn, x, y, z, ry); A.exitBox(zn, x, y, z, ry, yc); }

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
  // murs habillés du poste : boiseries découpées autour des huisseries des portes (arrière : z 2,5 … 3,5, h 2,1 ;
  // blindée : z ±0,75, h 2,5 ; chambranles de 6,5 cm) ; à l'est, contre la face du mur de la galerie (x = -66,15)
  for (const [z0, z1, y0, y1] of [[-5, 2.435, 0, 3.2], [3.565, 5, 0, 3.2], [2.435, 3.565, 2.165, 3.2]]) A.box('security', 'woodpanel', -75.88, y0, z0, -75.86, y1, z1, { collide: false });
  for (const [z0, z1, y0, y1] of [[-5, -0.815, 0, 3.2], [0.815, 5, 0, 3.2], [-0.815, 0.815, 2.565, 3.2]]) A.box('security', 'woodpanel', -66.17, y0, z0, -66.15, y1, z1, { collide: false });
  LP(A, 'security', -70, 3.2, -2.5, 1.2, 0.6); LP(A, 'security', -70, 3.2, 2.5, 1.2, 0.6, false);
  LP(A, 'secstore', -71, 4.6, -13, 1.2, 0.3); LP(A, 'vestiaire', -71, 4.6, 9, 1.2, 0.3);
  for (let z = -21; z <= 21; z += 7) LP(A, 'westwing0', -78, 4.6, z, 0.3, 1.2, z % 14 === 0);

  // Portes du bloc ouest
  door('sec_front', { zone: 'security', x: -66, y: 0, z: 0, axis: 'z', width: 1.5, height: 2.5, mat: 'metal', armored: true, name: 'Porte blindée du poste', color: 0x50606a, hinge: 'a', swing: -1, label: 'SÉCURITÉ' });
  door('sec_back', { zone: 'security', x: -76, y: 0, z: 3, axis: 'z', width: 1, mat: 'metal', lock: 'keys', locked: true, name: 'Porte arrière du poste', swing: -1, hinge: 'b' }); // charnière côté nord : le vantail ouvert ne rentre plus dans la console des écrans
  door('sec_store', { zone: 'secstore', x: -73, y: 0, z: -5, axis: 'x', width: 1, mat: 'wood', name: 'Réserve de sécurité', swing: 1 });
  door('sec_vest', { zone: 'vestiaire', x: -73, y: 0, z: 5, axis: 'x', width: 1, mat: 'wood', name: 'Vestiaire', swing: -1 });
  door('store_ww', { zone: 'secstore', x: -76, y: 0, z: -13, axis: 'z', width: 1, mat: 'metal', lock: 'keys', locked: true, name: 'Réserve (couloir)', swing: 1 });
  door('stW_0', { panic: true, zone: 'stairsW', x: -76, y: 0, z: 17.75, axis: 'z', width: 1, mat: 'metal', name: 'Escalier ouest — RDC', gate: 'service', window: true });

  buildSecurityRoom(world, A, dev);
  // Réserve de sécurité : étagères + équipement
  // (la porte du couloir, z ∈ [-13,5, -12,5], et le débattement de son vantail restent dégagés)
  for (const z of [-21.5, -17.5, -12.2]) shelfUnit(A, 'secstore', -75.4, z, 'z', 3.5, 0x6d7b84, 4);
  dev('extinguisher_box', 'secstore', -66.275, 1.0, -18, Math.PI / 2 * -1);
  // Vestiaire : casiers, banc, lavabo, miroir, douche
  for (let i = 0; i < 6; i++) { const lk = new Locker(world, world.newId('locker'), { zone: 'vestiaire', x: -75.6 + 0.0, y: 0, z: 6 + i * 0.45, ry: Math.PI / 2, name: i === 0 ? 'GÉRARD' : i === 1 ? 'VOUS' : null, contents: i === 0 ? ['gerard_note', 'battery'] : i === 1 ? ['flashlight_spare'] : rng.chance(0.5) ? [rng.pick(['coffee_pack', 'candy_bar', 'magazine', 'battery', 'coin'])] : [], locked: i === 0 }); world.add(lk); }
  dev('mall_bench', 'vestiaire', -72, 0.225, 9, Math.PI / 2);
  dev('sink', 'vestiaire', -66.4, 0.45, 11.5, -Math.PI / 2); // centre de l'appareil : dos de la vasque contre le mur (x = -66,15)
  dev('mirror_wall', 'vestiaire', -66.16, 1.6, 11.5, -Math.PI / 2);
  // faïence à hauteur d'homme, cabine de douche d'angle (receveur, paroi et porte vitrées, colonne de douche,
  // mitigeur, bonde), siphons de sol, porte-manteaux
  A.box('vestiaire', 'toilet_tiles', -75.9, 0, 12.88, -66.1, 1.6, 12.9, { collide: false });
  A.box('vestiaire', 'toilet_tiles', -75.9, 0, 5.1, -75.88, 1.6, 12.88, { collide: false });
  A.box('vestiaire', 'furniture', -75.9, 1.6, 12.86, -66.1, 1.63, 12.9, { collide: false, color: 0x9aa5a8, flat: true });
  A.rbox('vestiaire', 'furniture', -75.2, 0.03, 12.2, 1.4, 0.06, 1.36, 0.02, 0xf4f6f6);
  A.lathe('vestiaire', 'furniture_metal', [[0, 0], [0.045, 0], [0.045, 0.004], [0, 0.004]], 12, -75.2, 0.06, 12.2, 0xb8bcc0);
  world.physics.add(new Box(-74.52, 0, 11.48, -74.48, 2.0, 12.88, LAYER.GLASS)); world.physics.add(new Box(-75.88, 0, 11.48, -74.9, 2.0, 11.52, LAYER.GLASS));
  A.box('vestiaire', 'glass', -74.506, 0.06, 11.5, -74.494, 2.0, 12.88, { collide: false }); A.box('vestiaire', 'glass', -75.88, 0.06, 11.494, -74.9, 2.0, 11.506, { collide: false });
  for (const [a, b, c, d] of [[-74.52, 11.48, -74.48, 12.88], [-75.88, 11.48, -74.48, 11.52]]) A.box('vestiaire', 'aluminium', a, 1.995, b, c, 2.02, d, { collide: false });
  A.box('vestiaire', 'aluminium', -74.52, 0.06, 11.48, -74.48, 2.02, 11.52, { collide: false });
  A.tube('vestiaire', 'furniture_metal', V3(-75.85, 1.0, 12.84), V3(-75.85, 2.05, 12.84), 0.012, 0xc8ccd0, { segs: 8 });
  A.tube('vestiaire', 'furniture_metal', V3(-75.85, 2.05, 12.84), V3(-75.55, 2.05, 12.54), 0.01, 0xc8ccd0, { segs: 8 });
  A.lathe('vestiaire', 'furniture_metal', [[0, 0], [0.1, -0.005], [0.1, 0.01], [0.02, 0.03], [0, 0.03]], 14, -75.55, 2.02, 12.54, 0xc8ccd0, { rx: Math.PI });
  A.rbox('vestiaire', 'furniture_metal', -75.86, 1.05, 12.84, 0.06, 0.08, 0.18, 0.01, 0xc8ccd0);
  A.lathe('vestiaire', 'furniture_metal', [[0, 0], [0.06, 0], [0.06, 0.004], [0, 0.004]], 12, -71, 0, 10.5, 0x8d9296);
  A.box('vestiaire', 'furniture', -72.2, 1.65, 12.86, -70.2, 1.75, 12.89, { collide: false, color: 0x6d4c41, flat: true });
  for (let k = 0; k < 6; k++) A.tube('vestiaire', 'furniture_metal', V3(-72.0 + k * 0.32, 1.7, 12.86), V3(-72.0 + k * 0.32, 1.74, 12.76), 0.007, 0xa9adb1, { segs: 6 });

  // Aile ouest (couloir) : mur extérieur x = -80 avec porte de l'entrepôt
  A.wallZ('westwing0', 'block_dark', -25, 25, -80.2, 0, 4.6, 0.4, [{ a: -14, b: -11.4, y0: 0, y1: 3 }]);
  A.floor('westwing0', 'concrete_floor', -80.4, -14, -80, -11.4, 0, 0.6, { faces: 'Y' }); // seuil de la double porte (le sol s'arrêtait de part et d'autre du mur : fente de 40 cm)
  door('wh_a', { zone: 'warehouse', x: -80.2, y: 0, z: -13.35, axis: 'z', width: 1.3, height: 2.9, mat: 'metal', name: 'Entrepôt', gate: 'warehouse', hinge: 'a', swing: -1, window: true });
  door('wh_b', { zone: 'warehouse', x: -80.2, y: 0, z: -12.05, axis: 'z', width: 1.3, height: 2.9, mat: 'metal', name: 'Entrepôt', gate: 'warehouse', hinge: 'b', swing: -1, window: true });
  // robinets d'incendie armés (aile ouest, RDC et étage) : coffret rouge vitré, dévidoir et tuyau enroulé, vanne
  for (const [zn, y] of [['westwing0', 0], ['westwing1', 5]]) {
    world.physics.add(new Box(-80.0, y + 0.95, 7.6, -79.72, y + 1.85, 8.4, LAYER.FURN));
    // coffret creux : fond, quatre joues, cadre de porte autour de la vitre (le dévidoir se voit au travers)
    const R = (x0, y0, z0, x1, y1, z1, c = 0xb71c1c) => A.furn(zn, x0, y + y0, z0, x1, y + y1, z1, c, { metal: true, collide: false });
    R(-80.0, 0.95, 7.6, -79.98, 1.85, 8.4, 0x8e1616);
    R(-79.98, 0.95, 7.6, -79.74, 0.97, 8.4); R(-79.98, 1.83, 7.6, -79.74, 1.85, 8.4); R(-79.98, 0.97, 7.6, -79.74, 1.83, 7.62); R(-79.98, 0.97, 8.38, -79.74, 1.83, 8.4);
    for (const [a, b, c, d] of [[0.95, 1.0, 7.6, 8.4], [1.8, 1.85, 7.6, 8.4], [1.0, 1.8, 7.6, 7.65], [1.0, 1.8, 8.35, 8.4]]) A.rbox(zn, 'furniture_metal', -79.73, y + (a + b) / 2, (c + d) / 2, 0.02, b - a, d - c, 0.004, 0xc62828);
    A.box(zn, 'glass', -79.732, y + 1.0, 7.65, -79.728, y + 1.8, 8.35, { collide: false });
    A.lathe(zn, 'furniture', [[0.06, -0.09], [0.28, -0.09], [0.3, -0.07], [0.3, 0.07], [0.28, 0.09], [0.06, 0.09]], 18, -79.86, y + 1.42, 8, 0xd32f2f, { rz: Math.PI / 2 });
    A.lathe(zn, 'furniture_metal', [[0.05, -0.1], [0.05, 0.1]], 10, -79.86, y + 1.42, 8, 0xc9a227, { rz: Math.PI / 2 });
    A.box(zn, 'furniture', -79.8, y + 1.1, 7.75, -79.73, y + 1.16, 7.85, { collide: false, color: 0x1a1a1a, flat: true });
  }

  // ═══════════════════════════ COULOIRS DE SERVICE ═══════════════════════════
  for (const [zn, y, zc, sideZ] of [['service_s0', 0, -23.5, -25.2], ['service_n0', 0, 23.5, 25.2], ['service_s1', 5, -23.5, -25.2], ['service_n1', 5, 23.5, 25.2]]) {
    const top = y === 0 ? 4.6 : 10;
    A.floor(zn, 'concrete_floor', -76, Math.min(zc - 1.5, zc + 1.5), 80, Math.max(zc - 1.5, zc + 1.5), y, y === 0 ? 0.6 : 0.4, { faces: 'Y' });
    A.ceiling(zn, 'concrete', -76, zc - 1.5, 80, zc + 1.5, top, 0.05, { collide: false });
    A.wallX(zn, 'block_dark', -80.4, 80.4, sideZ, y, top, 0.4);
    for (let x = -72; x <= 78; x += 10) LP(A, zn, x, top, zc + (zc > 0 ? 0.9 : -0.9), 1.2, 0.2, (x + 72) % 20 === 0);
    // tuyaux le long du mur extérieur (chauffage calorifugé, eau froide) : consoles murales et colliers, manchons
    const pz = sideZ + (zc > 0 ? -0.35 : 0.35), wz = sideZ + (zc > 0 ? -0.2 : 0.2);
    for (const [py, r, c] of [[top - 0.44, 0.06, 0x7a5c3a], [top - 0.7, 0.05, 0x5f6f78]]) {
      A.tube(zn, 'furniture_metal', V3(-80, py, pz), V3(80, py, pz), r, c, { segs: 10, open: true });
      for (let x = -78; x <= 78; x += 3) {
        A.lathe(zn, 'furniture_metal', [[r + 0.002, -0.015], [r + 0.01, -0.012], [r + 0.01, 0.012], [r + 0.002, 0.015]], 10, x, py, pz, 0x4a4f53, { rz: Math.PI / 2 });
        A.box(zn, 'furniture_metal', x - 0.015, py - r - 0.04, Math.min(pz, wz), x + 0.015, py - r - 0.01, Math.max(pz, wz), { collide: false, color: 0x55595c, flat: true });
      }
      for (let x = -72; x <= 72; x += 12) A.lathe(zn, 'furniture_metal', [[r, -0.05], [r + 0.008, -0.04], [r + 0.008, 0.04], [r, 0.05]], 10, x, py, pz, c, { rz: Math.PI / 2 });
    }
  }
  A.wallZ('service_s0', 'block_dark', -25.4, -21.8, 80.2, 0, 4.6, 0.4); A.wallZ('service_n0', 'block_dark', 21.8, 25.4, 80.2, 0, 4.6, 0.4);
  A.wallZ('service_s1', 'block_dark', -25.4, -21.8, 80.2, 5, 10, 0.4); A.wallZ('service_n1', 'block_dark', 21.8, 25.4, 80.2, 5, 10, 0.4);
  // murs côté bloc ouest (z = ±22 entre x -76 et -66) : faits par les cloisons de la réserve / l'escalier
  A.wallX('stairsW', 'block', -76, -66, 22, -4.5, 13.5, 0.2);
  A.wallX('stairsW', 'block', -76, -66, 13, -4.5, 13.5, 0.2);
  buildServiceDecor(world, A, rng.fork('servicedecor'));
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
  for (let z = -21; z <= 21; z += 7) LP(A, 'westwing1', -78, 10, z, 0.3, 1.2, z % 14 === 0);
  buildAdmin(world, A, door, dev, rng);

  // ═══════════════════════════ BLOC EST ═══════════════════════════
  // Hall d'entrée
  A.floor('entrance', 'terrazzo', 66, -8, 80, 8, 0, 0.6, { faces: 'Y' });
  A.ceiling('entrance', 'ceiling', 66, -8, 80, 8, 4.6, 0.02, { collide: false });
  A.floor('mezzanine', 'terrazzo', 66, -8, 80, 8, 5, 0.4, { faces: 'Y' });
  A.ceiling('mezzanine', 'ceiling', 66, -8, 80, 8, 10, 0.02, { collide: false });
  for (const z of [-4, 4]) { LP(A, 'entrance', 71, 4.6, z, 2.4, 0.5); LP(A, 'entrance', 76, 4.6, z, 2.4, 0.5, false); LP(A, 'mezzanine', 73, 10, z, 2.4, 0.5); }
  // façade vitrée (x = 80) avec portes automatiques
  // soubassement des vitrages seulement (il traversait la baie des portes : les sabots des vantaux s'y enfonçaient et
  // il faisait une marche de 20 cm porte ouverte) ; seuil affleurant sous les portes
  for (const [z0, z1] of [[-8, -1.6], [1.6, 8]]) A.box('entrance', 'chrome', 80, 0, z0, 80.3, 0.2, z1);
  A.box('entrance', 'aluminium', 79.95, 0, -1.6, 80.35, 0.008, 1.6, { collide: false });
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
  door('entr_stE', { panic: true, zone: 'stairsE', x: 77.6, y: 0, z: 8, axis: 'x', width: 1.2, mat: 'metal', name: 'Escalier est — RDC', gate: 'service', swing: 1, window: true });
  door('entr_trash', { zone: 'trash', x: 77.6, y: 0, z: -8, axis: 'x', width: 1.2, mat: 'metal', name: 'Local poubelles', lock: 'keys', locked: true, swing: -1 });
  door('mez_stE', { panic: true, zone: 'stairsE', x: 77.6, y: 5, z: 8, axis: 'x', width: 1.2, mat: 'metal', name: 'Escalier est — étage', gate: 'gallery1', swing: 1, window: true });
  door('mez_hvac', { zone: 'hvac', x: 72.6, y: 5, z: -8, axis: 'x', width: 1.2, mat: 'metal', name: 'Local ventilation', lock: 'keys', locked: true, swing: -1 });
  // mobilier du hall
  // banque d'accueil : socle en retrait, façade à panneaux de bois clair séparés par des joints creux, bandeau inox et
  // filet lumineux sous la tablette, plateau de bois aux chants arrondis, retours latéraux, tiroirs côté personnel
  world.physics.add(new Box(70, 0, -3, 72.5, 1.1, 3, LAYER.FURN)); world.physics.add(new Box(69.9, 1.1, -3.1, 72.6, 1.15, 3.1, LAYER.FURN));
  A.furn('entrance', 70.05, 0, -2.95, 72.42, 0.1, 2.95, 0x1d1d1d, { collide: false });
  A.furn('entrance', 70, 0.1, -3, 72.45, 1.1, 3, 0xd8d0c0, { collide: false });
  for (let k = 0; k < 6; k++) { const z0 = -3 + k * 1.0; A.furn('entrance', 72.45, 0.14, z0 + 0.006, 72.5, 0.98, z0 + 0.994, k % 2 ? 0xc9a77c : 0xc19d72, { collide: false }); }
  A.box('entrance', 'chrome', 72.45, 0.98, -3.0, 72.52, 1.04, 3.0, { collide: false });
  A.furn('entrance', 72.49, 1.04, -2.95, 72.52, 1.06, 2.95, 0xfff2d6, { collide: false });
  A.rbox('entrance', 'furniture', 71.25, 1.125, 0, 2.7, 0.05, 6.2, 0.015, 0x8d6e63, { n: 2 });
  for (const s of [-1, 1]) A.furn('entrance', 70, 0.1, s * 3 - 0.005, 72.45, 1.1, s * 3 + 0.005, 0xc19d72, { collide: false });
  for (const zc of [-2.2, 2.2]) for (let k = 0; k < 3; k++) { const y0 = 0.14 + k * 0.26; A.furn('entrance', 69.985, y0, zc - 0.35, 70.0, y0 + 0.24, zc + 0.35, 0xcfc6b5, { collide: false }); A.furn('entrance', 69.97, y0 + 0.17, zc - 0.1, 69.985, y0 + 0.19, zc + 0.1, 0x9c9fa2, { metal: true, collide: false }); }
  const accueil = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.4), new THREE.MeshBasicMaterial({ map: signTexture('ACCUEIL — INFORMATIONS', 0xffd54f, { h: 110, fontSize: 60, font: 'Arial' }) }));
  accueil.position.set(72.506, 0.62, 0); accueil.rotation.y = Math.PI / 2; world.zone('entrance').group.add(accueil); world.zone('entrance').signMats.push(accueil.material);
  dev('desk_phone', 'entrance', 71.2, 1.2, 1.8, Math.PI / 2);
  dev('atm', 'entrance', 67.2, 0.95, -7.5, 0);
  dev('vending', 'entrance', 69, 0.9, -7.45, 0);
  dev('vending', 'mezzanine', 69, 5.9, 7.45, Math.PI);
  dev('mall_bench', 'entrance', 75, 0.225, 6.5, Math.PI);
  dev('mall_bench', 'mezzanine', 76, 5.225, 0, -Math.PI / 2);
  planter(A, 'entrance', 79, -6.4, rng); planter(A, 'entrance', 79, 6.4, rng); planter(A, 'mezzanine', 78, -6.5, rng); // dégagent les baies des portes latérales (x 77…78,2)
  // plan du centre : grand panneau lumineux du niveau 0, plans de l'étage et du parking à côté (mallmap.js)
  addMapSign(world, { kind: 'board', zone: 'entrance', x: 74.0, y: 1.45, z: -7.85, ry: 0, panels: [{ k: 0, w: 1.8, dx: -0.47, dy: 0 }, { k: 1, w: 0.9, dx: 0.96, dy: 0.31 }, { k: -1, w: 0.9, dx: 0.96, dy: -0.31 }] });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: signTexture('CENTRE COMMERCIAL HÉLIOS', 0xffb300, { fontSize: 80 }) }));
  logo.position.set(79.854, 3.7, 0); logo.rotation.y = -Math.PI / 2; world.zone('entrance').group.add(logo); world.zone('entrance').signMats.push(logo.material);
  A.rbox('entrance', 'steel_dark', 79.905, 3.7, 0, 0.09, 1.16, 6.06, 0.01, 0xffffff, { n: 2 }); // caisson de l'enseigne, fixé sur l'imposte des portes
  // Local poubelles
  A.floor('trash', 'concrete_floor', 66, -22, 80, -8, 0, 0.6, { faces: 'Y' });
  A.ceiling('trash', 'concrete', 66, -22, 80, -8, 4.6, 0.05, { collide: false });
  A.wallX('trash', 'block_dark', 66, 80, -22, 0, 4.6, 0.2, [{ a: 72, b: 73.2, y0: 0, y1: 2.2 }]);
  A.wallZ('trash', 'block_dark', -22, -8, 80.2, 0, 4.6, 0.4);
  LP(A, 'trash', 73, 4.6, -15, 1.2, 0.3);
  door('trash_svc', { panic: true, zone: 'trash', x: 72.6, y: 0, z: -22, axis: 'x', width: 1.2, mat: 'metal', name: 'Local poubelles (service)', swing: 1, gate: 'service' });
  // bennes : cuve tôlée à rebord, deux couvercles plastique, poches de levage, roulettes
  for (const [x, z] of [[68.5, -20.5], [70.9, -20.5], [78.5, -14]]) { // (la porte de service, x ∈ [72, 73,2], reste dégagée)
    world.physics.add(new Box(x - 1.1, 0, z - 0.7, x + 1.1, 1.3, z + 0.7, LAYER.FURN));
    A.rbox('trash', 'furniture_metal', x, 0.68, z, 2.1, 1.08, 1.3, 0.03, 0x2e5e3a);
    A.rbox('trash', 'furniture_metal', x, 1.22, z, 2.2, 0.05, 1.4, 0.015, 0x264d30);
    for (const sx of [-1, 1]) A.rbox('trash', 'furniture', x + sx * 0.53, 1.275, z, 1.04, 0.05, 1.38, 0.02, 0x1c2a20);
    for (const sx of [-1, 1]) A.box('trash', 'furniture_metal', x + sx * 1.05 - 0.04, 0.8, z - 0.25, x + sx * 1.05 + 0.04, 0.98, z + 0.25, { collide: false, color: 0x22432a, flat: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { A.box('trash', 'furniture_metal', x + sx * 0.85 - 0.05, 0.1, z + sz * 0.5 - 0.04, x + sx * 0.85 + 0.05, 0.14, z + sz * 0.5 + 0.04, { collide: false, color: 0x2a2a2a, flat: true }); A.lathe('trash', 'furniture', [[0, -0.025], [0.05, -0.025], [0.05, 0.025], [0, 0.025]], 10, x + sx * 0.85, 0.05, z + sz * 0.5, 0x151515, { rz: Math.PI / 2 }); }
    world.add(new Container(world, world.newId('bin'), { zone: 'trash', name: 'Benne', contents: rng.shuffle(['banana_peel', 'newspaper', 'cardboard_box', 'coin', 'pizza_box', 'battery']).slice(0, 2), box: [x - 1.1, 0, z - 0.7, x + 1.1, 1.35, z + 0.7] }));
  }
  // Local CVC
  A.floor('hvac', 'concrete_floor', 66, -22, 80, -8, 5, 0.4, { faces: 'Y' });
  A.ceiling('hvac', 'concrete', 66, -22, 80, -8, 10, 0.05, { collide: false });
  A.wallX('hvac', 'block_dark', 66, 80, -22, 5, 10, 0.2, [{ a: 72, b: 73.2, y0: 5, y1: 7.2 }]);
  A.wallZ('hvac', 'block_dark', -22, -8, 80.2, 5, 10, 0.4);
  LP(A, 'hvac', 73, 10, -15, 1.2, 0.3);
  door('hvac_svc', { panic: true, zone: 'hvac', x: 72.6, y: 5, z: -22, axis: 'x', width: 1.2, mat: 'metal', name: 'Local ventilation (service)', swing: 1, gate: 'service' });
  // centrales de traitement d'air : caissons à panneaux (joints, portes à poignées, hublot du ventilateur), socle,
  // gaine verticale à brides jusqu'au plafond, manchettes souples
  for (const [x, z] of [[69, -18], [69, -12], [77, -17]]) {
    world.physics.add(new Box(x - 1.4, 5, z - 1, x + 1.4, 7.2, z + 1, LAYER.FURN)); world.physics.add(new Box(x - 0.5, 7.2, z - 0.5, x + 0.5, 10, z + 0.5, LAYER.FURN));
    A.furn('hvac', x - 1.38, 5, z - 0.98, x + 1.38, 5.12, z + 0.98, 0x3a3f43, { metal: true, collide: false });
    A.rbox('hvac', 'furniture_metal', x, 6.16, z, 2.8, 2.08, 2.0, 0.02, 0x9aa3a8);
    for (const u of [-0.7, 0, 0.7]) for (const sz of [-1, 1]) A.furn('hvac', x + u - 0.004, 5.15, z + sz * 1.0 - 0.003, x + u + 0.004, 7.17, z + sz * 1.0 + 0.003, 0x5f686e, { metal: true, collide: false });
    for (const sz of [-1, 1]) for (const u of [-1.05, 0.35]) A.furn('hvac', x + u + 0.25, 6.0, z + sz * 1.008 - 0.012, x + u + 0.29, 6.25, z + sz * 1.008 + 0.012, 0x23282b, { metal: true, collide: false });
    A.lathe('hvac', 'furniture', [[0.18, 0], [0.22, 0], [0.22, 0.012], [0.18, 0.012]], 16, x - 0.35, 6.35, z + 1.0, 0x23282b, { rx: Math.PI / 2 });
    A.lathe('hvac', 'glass', [[0, 0], [0.18, 0], [0.18, 0.004], [0, 0.004]], 16, x - 0.35, 6.35, z + 1.0, 0xffffff, { rx: Math.PI / 2 });
    A.rbox('hvac', 'furniture', x, 7.3, z, 1.06, 0.2, 1.06, 0.03, 0x2a2e31);
    A.furn('hvac', x - 0.5, 7.4, z - 0.5, x + 0.5, 10, z + 0.5, 0xa5abb0, { metal: true, collide: false });
    for (let yy = 8.0; yy < 10; yy += 1.0) A.furn('hvac', x - 0.53, yy - 0.025, z - 0.53, x + 0.53, yy + 0.025, z + 0.53, 0x8d979d, { metal: true, collide: false });
  }
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

  // ═══════════════════════════ DÉCOR DES GALERIES ═══════════════════════════
  buildDecor(world, A, dev, rng.fork ? rng.fork('decor') : rng);
  buildMapSigns(world, A); // plans du centre (bornes et panneaux) : relevés sur le centre maintenant construit

  // ═══════════════════════════ EXTÉRIEUR ═══════════════════════════
  buildOutside(world);

  A.build(); world.arch = null;
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
    entranceOutside: new THREE.Vector3(84, 0, 0), garageGate: new THREE.Vector3(66, -4.5, -4.5), rampEnd: new THREE.Vector3(103.5, -0.15, -5.6),
    fountain: new THREE.Vector3(0, 0, 0), roofDoor: new THREE.Vector3(-77.5, 10.5, 17.75),
  });
  return world;
}

// Plafonnier (dalle lumineuse d'A.panel) avec son cadre laqué
function LP(A, zone, x, y, z, w = 1.2, d = 0.3, light = true) { A.panel(zone, x, y, z, w, d, light); A.panelFrame(zone, x, y, z, w, d); }

// ───────────────────────── ESCALATORS ─────────────────────────
// Repère local : u = distance depuis le peigne bas dans le sens de la montée, w = position dans la voie (0 … 2 m depuis
// laneZ), y = hauteur. Les collisions des marches restent celles d'un escalier droit (u 0 → 9 m, 26 marches de 19 cm) ;
// les flancs (murs fins en escalier) sont inchangés, têtes de balustrade et terre-plein ajoutés hors des passages.
const ESC = { run: 9, rise: 5, steps: 26, newel: 1.2, R: 0.31 }; // newel : têtes en avant des peignes, dégagées des potelets « étage fermé » (x = ±13,55)
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// ligne des nez de marches prolongée par les paliers, raccords arrondis : [[u, y], …]
const escGuide = () => roundPath([V3(-2.4, 0, 0), V3(-0.35, 0, 0), V3(8.65, 5, 0), V3(11.4, 5, 0)], 1.8, 8).map(p => [p.x, p.y]);
const yAt = (L, u) => { if (u <= L[0][0]) return L[0][1]; for (let i = 1; i < L.length; i++) if (u <= L[i][0]) { const a = L[i - 1], b = L[i], t = (u - a[0]) / Math.max(1e-6, b[0] - a[0]); return a[1] + (b[1] - a[1]) * t; } return L[L.length - 1][1]; };
const uSamples = (L, u0, u1) => [u0, ...L.map(p => p[0]).filter(u => u > u0 + 1e-3 && u < u1 - 1e-3), u1];
const dedupe = (P) => P.filter((p, i) => !i || p.distanceTo(P[i - 1]) > 1e-4);
// Une voie : marches en aluminium nervuré (bandes jaunes de nez et de côtés), peignes jaunes à dents, tôles de palier,
// plinthes inox, platelage, balustrade de verre aux têtes arrondies, main courante noire faisant le tour des têtes,
// habillage inox du caisson à joints et plinthe noire
function buildEscalator(world, A, xBottom, dir, laneZ) {
  const zn = 'atrium', sgn = dir === 'x-' ? -1 : 1, { run, rise, steps, newel, R } = ESC, sd = run / steps, sr = rise / steps;
  const X = (u) => xBottom + sgn * u, Z = (w) => laneZ + w, P = (u, y, w) => V3(X(u), y, Z(w));
  (world.escalators ||= []).push({ x0: Math.min(X(-newel), X(run + newel)), x1: Math.max(X(-newel), X(run + newel)), z0: laneZ - 0.08, z1: laneZ + 2.08, dir: sgn }); // emprise (plans du centre)
  const G = escGuide(), gy = (u) => yAt(G, u);
  A.stairs(zn, 'cleats', xBottom, laneZ, dir, 2.0, run, rise, 0, steps, { solid: true, base: 0, visible: false });
  const ry = sgn * Math.PI / 2, W0 = 0.12, W1 = 1.88, yel = 0xf0c419, F = { collide: false, flat: true };
  for (let i = 0; i < steps; i++) {
    const top = sr * (i + 1), u0 = sd * i, u1 = sd * (i + 1);
    A.rbox(zn, 'cleats', X((u0 + u1) / 2), top - 0.015, Z(1), W1 - W0, 0.03, sd - 0.004, 0.004, 0xffffff, { ry });            // giron
    A.rbox(zn, 'cleats', X(u0 + 0.012), top - sr / 2 - 0.015, Z(1), W1 - W0, sr - 0.03, 0.02, 0.004, 0xffffff, { ry });     // contremarche
    A.box(zn, 'furniture', X(u0), top - 0.002, Z(W0), X(u0 + 0.045), top + 0.003, Z(W1), { ...F, color: yel });               // nez jaune
    for (const w of [W0, W1 - 0.04]) A.box(zn, 'furniture', X(u0 + 0.045), top - 0.002, Z(w), X(u1 - 0.004), top + 0.003, Z(w + 0.04), { ...F, color: yel });
  }
  // peignes (plaque jaune, dents engagées dans les nervures) et tôles de palier
  for (const [ua, ub, y] of [[-0.3, 0, 0], [run, run + 0.3, rise]]) {
    A.box(zn, 'furniture', X(ua), y, Z(W0), X(ub), y + 0.016, Z(W1), { ...F, color: yel });
    for (let k = 0; k < 30; k++) { const w = W0 + 0.03 + k * (W1 - W0 - 0.06) / 29; A.box(zn, 'furniture', X(ua + 0.04), y + 0.016, Z(w - 0.005), X(ub), y + 0.022, Z(w + 0.005), { ...F, color: 0xd9ae12 }); }
  }
  A.rbox(zn, 'cleats', X((-newel - 0.3) / 2), 0.006, Z(1), 1.96, 0.012, newel - 0.3, 0.003, 0xffffff, { ry });
  A.rbox(zn, 'cleats', X(run + (newel + 0.3) / 2), rise + 0.006, Z(1), 1.96, 0.012, newel - 0.3, 0.003, 0xffffff, { ry });
  // balustrades (côté gauche w = -0.08, côté droit w = 2.08 : lignes des murs de collision)
  const uA = -newel + R, uB = run + newel - R, ua0 = uA - 0.36, ub0 = uB + 0.36;
  for (const [wg, so] of [[-0.08, -1], [2.08, 1]]) {
    const wi = so < 0 ? W0 - 0.02 : W1 + 0.02, wo = wg + so * 0.075; // bord intérieur (plinthe), face extérieure
    const deck = uSamples(G, ua0, ub0);
    A.sweep(zn, 'aluminium', deck.map(u => P(u, gy(u) + 0.305, (wi + wo) / 2)), rectShape(Math.abs(wo - wi), 0.03, 0.008, 1), 0xffffff, { caps: true }); // platelage
    A.sweep(zn, 'aluminium', deck.map(u => P(u, gy(u) + 0.1225, wi + so * 0.01)), rectShape(0.02, 0.365, 0.004, 1), 0xffffff, { caps: true });         // plinthe
    // verre : bandeau de 62 cm au-dessus du platelage, têtes en demi-cercle
    const gl = [], cA = gy(uA) + 0.61, cB = gy(uB) + 0.61;
    for (const u of uSamples(G, uA, uB)) gl.push([X(u), gy(u) + 0.3]);
    for (let k = 1; k < 12; k++) { const a = -Math.PI / 2 + Math.PI * k / 12; gl.push([X(uB + Math.cos(a) * R), cB + Math.sin(a) * R]); }
    for (const u of uSamples(G, uA, uB).reverse()) gl.push([X(u), gy(u) + 0.92]);
    for (let k = 1; k < 12; k++) { const a = Math.PI / 2 + Math.PI * k / 12; gl.push([X(uA + Math.cos(a) * R), cA + Math.sin(a) * R]); }
    A.plate(zn, 'glass', gl, Z(wg) - 0.006, Z(wg) + 0.006);
    // main courante (profil en C arrondi) : fait le tour des têtes et rentre dans le platelage
    const Rh = R + 0.035, hp = [P(uB - 0.3, cB - Rh, wg)];
    for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + Math.PI * k / 12; hp.push(P(uB + Math.cos(a) * Rh, cB + Math.sin(a) * Rh, wg)); }
    for (const u of uSamples(G, uA, uB).reverse()) hp.push(P(u, gy(u) + 0.61 + Rh, wg));
    for (let k = 0; k <= 12; k++) { const a = Math.PI / 2 + Math.PI * k / 12; hp.push(P(uA + Math.cos(a) * Rh, cA + Math.sin(a) * Rh, wg)); }
    hp.push(P(uA + 0.3, cA - Rh, wg));
    A.sweep(zn, 'furniture', dedupe(hp), rectShape(0.075, 0.042, 0.016, 2), 0x151515, { caps: true });
    // habillage extérieur du caisson (du sol au platelage), joints verticaux, plinthe noire, joues d'about
    const poly = [[X(ua0), 0], [X(run), 0], [X(run), rise], [X(ub0), rise]];
    for (const u of uSamples(G, ua0, ub0).reverse()) poly.push([X(u), gy(u) + 0.29]);
    A.plate(zn, 'aluminium', poly, Math.min(Z(wo), Z(wo - so * 0.012)), Math.max(Z(wo), Z(wo - so * 0.012)));
    const zf = Z(wo), zj = zf + so * 0.002;
    for (let u = 0.6; u < run - 0.2; u += 1.25) A.box(zn, 'furniture', X(u) - 0.003, 0.1, Math.min(zf, zj), X(u) + 0.003, gy(u) + 0.28, Math.max(zf, zj), { ...F, color: 0x2a2d30 });
    A.box(zn, 'furniture', X(ua0), 0, Math.min(zf, zf + so * 0.006), X(run), 0.1, Math.max(zf, zf + so * 0.006), { ...F, color: 0x1a1a1a });
    for (const [u, y0] of [[ua0, 0], [ub0, rise]]) A.box(zn, 'aluminium', X(u) - 0.006, y0, Math.min(Z(wi), Z(wo)), X(u) + 0.006, y0 + 0.32, Math.max(Z(wi), Z(wo)), { collide: false });
    // collisions de la balustrade sur toute l'épaisseur visible du socle (de la plinthe intérieure à l'habillage
    // extérieur) : têtes jusqu'aux joues d'about, flancs en escalier ; le corps ne rentre plus dans la plinthe
    const zl = Math.min(Z(wi), Z(wo)), zh = Math.max(Z(wi), Z(wo));
    world.physics.add(new Box(Math.min(X(ua0), X(0)), 0, zl, Math.max(X(ua0), X(0)), 1.1, zh, LAYER.FURN));
    world.physics.add(new Box(Math.min(X(run), X(ub0)), rise, zl, Math.max(X(run), X(ub0)), rise + 1.1, zh, LAYER.FURN));
    for (let i = 0; i < 9; i++) { const xa = xBottom + sgn * i, xb = xBottom + sgn * (i + 1); const top = 5 * (i + 1) / 9 + 1.1; world.physics.add(new Box(Math.min(xa, xb), 0, zl, Math.max(xa, xb), top, zh, LAYER.FURN)); }
  }
}
// Terre-plein entre les deux voies (z ∈ [-0.445, 0.445]) : tôle inclinée à pastilles anti-glisse, joues d'about ;
// collisions en escalier (personne n'y passe : ce n'est pas une route des présences)
function escalatorMedian(world, A, xBottom, dir) {
  const zn = 'atrium', sgn = dir === 'x-' ? -1 : 1, { run, rise, newel, R } = ESC, X = (u) => xBottom + sgn * u;
  const G = escGuide(), gy = (u) => yAt(G, u), ua0 = -newel + R - 0.36, ub0 = run + newel - R + 0.36;
  A.sweep(zn, 'aluminium', uSamples(G, ua0, ub0).map(u => V3(X(u), gy(u) + 0.3, 0)), rectShape(0.89, 0.014, 0.003, 1), 0xffffff, { caps: true });
  for (let u = 0.8; u < run; u += 1.6) A.lathe(zn, 'aluminium', [[0, 0], [0.035, 0], [0.03, 0.02], [0.012, 0.035], [0, 0.037]], 10, X(u), gy(u) + 0.307, 0);
  for (const [u, y0] of [[ua0, 0], [ub0, rise]]) A.box(zn, 'aluminium', X(u) - 0.006, y0, -0.445, X(u) + 0.006, y0 + 0.31, 0.445, { collide: false });
  // about haut, côté RDC : habillage du caisson sous le nez de dalle (sinon, de derrière, on voyait le dessous des marches)
  const xe = X(run), xo = xe + sgn * 0.012, zo = 2.6 + 0.155; // xo : face extérieure (côté galerie, sous le palier)
  A.box(zn, 'aluminium', Math.min(xe, xo), 0, -zo, Math.max(xe, xo), 4.6, zo, { collide: false });
  for (let z = -2; z <= 2; z += 1) A.box(zn, 'furniture', Math.min(xo, xo + sgn * 0.002), 0.1, z - 0.003, Math.max(xo, xo + sgn * 0.002), 4.6, z + 0.003, { collide: false, flat: true, color: 0x2a2d30 });
  A.box(zn, 'furniture', Math.min(xo, xo + sgn * 0.006), 0, -zo, Math.max(xo, xo + sgn * 0.006), 0.1, zo, { collide: false, flat: true, color: 0x1a1a1a });
  // (coupées au peigne haut : au-delà, la tête repose sur la dalle de l'étage au lieu de la traverser)
  for (let u = ua0; u < ub0 - 1e-3;) { const u1 = Math.min(ub0, u + 1, u < run ? run : Infinity), y0 = u >= run ? rise : 0; world.physics.add(new Box(Math.min(X(u), X(u1)), y0, -0.44, Math.max(X(u), X(u1)), gy(u1) + 0.31, 0.44, LAYER.FURN)); u = u1; }
  // entre les têtes de balustrade intérieures, aux deux bouts : on ne monte plus sur le terre-plein (31 cm à l'étage,
  // on descendait ensuite tout le terre-plein entre les deux voies)
  world.physics.add(new Box(Math.min(X(ua0), X(0)), 0, -0.445, Math.max(X(ua0), X(0)), 1.1, 0.445, LAYER.FURN));
  world.physics.add(new Box(Math.min(X(run), X(ub0)), rise, -0.445, Math.max(X(run), X(ub0)), rise + 1.1, 0.445, LAYER.FURN));
}

// Rideau métallique d'une baie dans un mur parallèle à Z (rampe du parking, quai) : tablier ondulé + lame finale (géométrie
// du rideau, centrée), coulisses en U dans les tableaux et coffre d'enroulement côté intérieur (sens si = +1 / -1 en x)
function sideShutter(A, zone, x, z0, z1, y0, h, si) {
  const w = z1 - z0, gb = new GeoBuilder({ uvScale: 0.3 });
  gb.box(0, 0, 0, 0.06, h, w); gb.box(0, -h / 2 + 0.035, 0, 0.085, 0.07, w);
  for (const z of [z0, z1]) { const s = z === z0 ? 1 : -1; A.box(zone, 'steel_dark', x - 0.07, y0, Math.min(z, z + s * 0.07), x + 0.07, y0 + h, Math.max(z, z + s * 0.07), { collide: false }); }
  A.rbox(zone, 'steel_dark', x + si * 0.3, y0 + h + 0.18, (z0 + z1) / 2, 0.42, 0.36, w + 0.3, 0.03, 0xffffff, { n: 2 });
  return gb.build();
}
// ─────────────────────────────────────────────────────────────────────────────
// Jardinière de galerie (1,4 × 1,4 × 0,6 m) : habillage de granit poli sur socle sombre en retrait, couvertine inox,
// terre et galets de décoration ; ficus à trois troncs tressés, charpentières, rameaux et houppier de feuilles
// (losanges pliés recto-verso, teintes variées, plus sombres au cœur). Collision inchangée.
function planter(A, zone, x, z, rng) {
  const y = zone.startsWith('gallery1') || zone === 'mezzanine' ? 5 : 0;
  for (let i = 0; i < 8; i++) rng.next(); // même consommation qu'avant : la suite des tirages (contenus des casiers…) ne change pas
  rng = rng.fork('planter' + x + '|' + z);
  A.world.physics.add(new Box(x - 0.7, y, z - 0.7, x + 0.7, y + 0.6, z + 0.7, LAYER.FURN));
  A.world.physics.add(new Box(x - 0.11, y + 0.6, z - 0.11, x + 0.11, y + 1.9, z + 0.11, LAYER.FURN)); // troncs (si l'on monte sur la jardinière)
  A.furn(zone, x - 0.66, y, z - 0.66, x + 0.66, y + 0.05, z + 0.66, 0x1c1c1c, { collide: false });
  A.rbox(zone, 'granite', x, y + 0.3, z, 1.4, 0.5, 1.4, 0.012);
  for (const [a, b, c, d] of [[-0.71, -0.71, 0.71, -0.63], [-0.71, 0.63, 0.71, 0.71], [-0.71, -0.63, -0.63, 0.63], [0.63, -0.63, 0.71, 0.63]]) A.box(zone, 'aluminium', x + a, y + 0.55, z + b, x + c, y + 0.6, z + d, { collide: false });
  A.furn(zone, x - 0.63, y + 0.5, z - 0.63, x + 0.63, y + 0.565, z + 0.63, 0x2a1d15, { collide: false });
  const PEB = latheGeo([[0, -0.5], [0.4, -0.32], [0.5, 0], [0.4, 0.32], [0, 0.5]], 6);
  for (let i = 0; i < 46; i++) {
    const r = rng.range(0.25, 0.6), a = rng.range(0, Math.PI * 2), s = rng.range(0.035, 0.06), t = rng.range(0.85, 1);
    A.shapeM(zone, 'furniture', PEB, trs(x + Math.cos(a) * r, y + 0.567, z + Math.sin(a) * r, 0, rng.range(0, 3), 0, s * 1.3, s * 0.55, s), (Math.round(0xd8 * t) << 16) | (Math.round(0xd4 * t) << 8) | Math.round(0xcc * t));
  }
  tree(A, zone, x, y + 0.565, z, rng, y === 0 && Math.abs(z) < 1 ? 3.6 : 3.1);
}
// Ficus en pot : troncs tressés (balayages effilés), charpentières courbes, rameaux, grappes de feuilles. H : hauteur
// totale au-dessus de la terre.
function tree(A, zone, x, y0, z, rng, H = 3.2) {
  const C = new THREE.Color(), tr = 0x6b5440, lv = { pos: [], nor: [], col: [], idx: [] };
  const hs = H * 0.42; // hauteur de la fourche
  for (let i = 0; i < 3; i++) {
    const ph = i * Math.PI * 2 / 3, P = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10, a = ph + t * Math.PI * 2.4, rr = 0.048 * (1 - 0.35 * t); P.push(V3(x + Math.cos(a) * rr, y0 - 0.05 + t * (hs + 0.05), z + Math.sin(a) * rr)); }
    A.sweep(zone, 'furniture', P, circleShape(0.036, 7), tr + i * 0x020202, { scale: (l) => 1 - 0.4 * Math.min(1, l / (hs + 0.3)) });
  }
  const top = V3(x, y0 + hs, z), clusters = [];
  const branch = (p0, dir, len, r0, depth) => {
    const P = [p0.clone()], d = dir.clone();
    for (let k = 1; k <= 4; k++) { d.y += 0.12 * (depth ? 0.5 : 1); d.x += rng.range(-0.08, 0.08); d.z += rng.range(-0.08, 0.08); d.normalize(); P.push(P[k - 1].clone().addScaledVector(d, len / 4)); }
    A.sweep(zone, 'furniture', P, circleShape(r0, depth ? 5 : 6), tr, { scale: (l) => 1 - 0.6 * Math.min(1, l / len), caps: true });
    clusters.push({ p: P[4], s: depth ? 0.8 : 1 });
    if (!depth) for (let j = 0; j < 2; j++) { const q = P[2 + j], nd = d.clone().applyAxisAngle(V3(0, 1, 0), (j ? 1 : -1) * rng.range(0.6, 1.1)); nd.y = Math.max(0.15, nd.y - 0.2); branch(q, nd.normalize(), len * rng.range(0.45, 0.6), r0 * 0.55, 1); }
    else clusters.push({ p: P[2], s: 0.6 });
  };
  const nb = 5, a0 = rng.range(0, 6);
  for (let i = 0; i < nb; i++) { const a = a0 + i * Math.PI * 2 / nb + rng.range(-0.3, 0.3), el = rng.range(0.55, 0.95); branch(top, V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), H * rng.range(0.24, 0.32), 0.022, 0); }
  clusters.push({ p: V3(x, y0 + H * 0.9, z), s: 1.1 });
  // feuilles : grappes ellipsoïdales autour des bouts de rameaux, orientées vers l'extérieur et le haut
  const ctr = V3(x, y0 + H * 0.72, z), e = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), sd = new THREE.Vector3();
  for (const cl of clusters) {
    const nLeaves = Math.round(56 * cl.s), R = 0.32 * cl.s;
    for (let k = 0; k < nLeaves; k++) {
      e.set(rng.range(-1, 1), rng.range(-0.7, 0.8), rng.range(-1, 1)); if (e.lengthSq() > 1) e.multiplyScalar(0.8);
      const p = cl.p.clone().addScaledVector(e, R), out = p.clone().sub(ctr).normalize();
      d.copy(out).add(V3(rng.range(-0.6, 0.6), rng.range(-0.7, 0.2), rng.range(-0.6, 0.6))).normalize();
      n.copy(out).addScaledVector(V3(0, 1, 0), 0.8).add(V3(rng.range(-0.5, 0.5), 0, rng.range(-0.5, 0.5))); n.addScaledVector(d, -n.dot(d)).normalize();
      sd.crossVectors(d, n).normalize();
      const L = rng.range(0.09, 0.13), W = L * 0.48, fold = 0.18;
      const tip = p.clone().addScaledVector(d, L), mid = p.clone().addScaledVector(d, L * 0.42);
      const l = mid.clone().addScaledVector(sd, W / 2).addScaledVector(n, W * fold), r = mid.clone().addScaledVector(sd, -W / 2).addScaledVector(n, W * fold);
      const inner = Math.min(1, p.distanceTo(ctr) / (H * 0.4)), t = rng.next();
      C.setHex(t < 0.15 ? 0x6f9a3e : t < 0.55 ? 0x3f7230 : 0x2c5a26).multiplyScalar(0.55 + 0.45 * inner);
      for (const s of [1, -1]) { // recto puis verso (normales opposées, sens inversé)
        const b = lv.pos.length / 3;
        for (const q of [p, l, tip, r]) { lv.pos.push(q.x, q.y, q.z); lv.nor.push(n.x * s, n.y * s, n.z * s); lv.col.push(C.r, C.g, C.b); }
        if (s > 0) lv.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else lv.idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
      }
    }
  }
  A.raw(zone, 'furniture', lv.pos, lv.nor, lv.col, lv.idx);
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
  const P = (x0, y0, z0, x1, y1, z1) => world.physics.add(new Box(x0, y0, z0, x1, y1, z1, LAYER.FURN)); // collisions d'origine
  const F = (x0, y0, z0, x1, y1, z1, c, metal) => A.furn(zn, x0, y0, z0, x1, y1, z1, c, { metal, collide: false });
  // pupitre de surveillance : plateau stratifié aux chants adoucis, caissons à tiroirs aux deux bouts, tiroir central,
  // voile de fond, socles en retrait, passe-câbles
  P(-74.6, 0, -2.8, -72.4, 0.74, 2.8); P(-74.7, 0.74, -2.9, -72.3, 0.78, 2.9);
  A.rbox(zn, 'furniture', -73.5, 0.76, 0, 2.4, 0.04, 5.8, 0.012, 0x3e2c1e, { n: 2 });
  for (const zc of [-2.4, 2.4]) {
    F(-74.5, 0, zc - 0.36, -72.5, 0.06, zc + 0.36, 0x1d1712);
    if (zc < 0) { // niche ouverte de l'unité centrale (côté gauche) : joues, fond, tablette basse
      F(-74.55, 0.06, zc - 0.4, -72.45, 0.74, zc - 0.38, 0x5d4632); F(-74.55, 0.06, zc + 0.38, -72.45, 0.74, zc + 0.4, 0x5d4632);
      F(-74.6, 0.06, zc - 0.38, -74.55, 0.74, zc + 0.38, 0x4f3b2a); F(-74.55, 0.06, zc - 0.38, -72.45, 0.08, zc + 0.38, 0x5d4632);
    } else {
      F(-74.55, 0.06, zc - 0.4, -72.45, 0.74, zc + 0.4, 0x5d4632);
      for (let k = 0; k < 3; k++) { const y0 = 0.09 + k * 0.215; F(-72.45, y0, zc - 0.38, -72.43, y0 + 0.2, zc + 0.38, 0x67503a); F(-72.43, y0 + 0.15, zc - 0.12, -72.41, y0 + 0.17, zc + 0.12, 0x9c9fa2, true); }
    }
  }
  F(-74.6, 0.1, -2.0, -74.55, 0.74, 2.0, 0x4f3b2a);
  F(-73.25, 0.5, -1.55, -72.45, 0.74, -0.45, 0x5d4632); F(-72.45, 0.52, -1.53, -72.43, 0.72, -0.47, 0x67503a); F(-72.43, 0.6, -1.1, -72.41, 0.62, -0.9, 0x9c9fa2, true);
  for (const z of [-1.9, 1.9]) A.lathe(zn, 'furniture', [[0, 0], [0.035, 0], [0.035, 0.004], [0, 0.004]], 12, -74.45, 0.78, z, 0x101010);
  // console du mur d'écrans (sous les moniteurs de security.js) : portes à persiennes, poignées, socle ; tablette haute
  P(-75.95, 0, -2.6, -75.2, 0.9, 2.6);
  F(-75.9, 0, -2.55, -75.25, 0.07, 2.55, 0x111111); F(-75.95, 0.07, -2.6, -75.2, 0.9, 2.6, 0x2b2b2b, true);
  for (let i = 0; i < 6; i++) {
    const z0 = -2.58 + i * (5.16 / 6), z1 = z0 + 5.16 / 6 - 0.01;
    F(-75.2, 0.09, z0, -75.19, 0.88, z1, 0x333536, true);
    for (let k = 0; k < 6; k++) F(-75.19, 0.62 + k * 0.035, z0 + 0.12, -75.185, 0.635 + k * 0.035, z1 - 0.12, 0x0e0e0e);
    F(-75.19, 0.4, (i & 1 ? z0 + 0.06 : z1 - 0.08), -75.17, 0.56, (i & 1 ? z0 + 0.08 : z1 - 0.06), 0x9aa0a4, true);
  }
  A.furn(zn, -75.95, 2.65, -2.6, -75.2, 2.72, 2.6, 0x2b2b2b, { metal: true, collide: false });
  // canapé : coussins capitonnés aux arêtes arrondies, accoudoirs rembourrés, pieds tournés
  P(-70.5, 0, -4.9, -67.5, 0.45, -4.0); P(-70.5, 0.45, -4.95, -67.5, 0.95, -4.65); P(-70.7, 0, -4.9, -70.4, 0.65, -4.0); P(-67.6, 0, -4.9, -67.3, 0.65, -4.0);
  A.rbox(zn, 'furniture', -69, 0.25, -4.45, 3.0, 0.2, 0.9, 0.03, 0x5a2f22, { n: 2 });
  for (const xc of [-69.75, -68.25]) { A.rbox(zn, 'furniture', xc, 0.41, -4.38, 1.46, 0.14, 0.76, 0.05, 0x6b3a2a, { n: 2 }); A.rbox(zn, 'furniture', xc, 0.71, -4.79, 1.46, 0.5, 0.2, 0.06, 0x6b3a2a, { n: 2, rx: -0.12 }); }
  for (const xa of [-70.55, -67.45]) A.rbox(zn, 'furniture', xa, 0.42, -4.45, 0.3, 0.46, 0.92, 0.07, 0x5f3124, { n: 2 });
  for (const [lx, lz] of [[-70.6, -4.05], [-70.6, -4.85], [-67.4, -4.05], [-67.4, -4.85]]) A.lathe(zn, 'furniture', [[0, 0], [0.022, 0], [0.03, 0.12], [0, 0.15]], 8, lx, 0, lz, 0x2a1d14);
  world.add(new Seat(world, world.newId('seat'), { zone: zn, x: -69, y: 0, z: -4.4, ry: 0, name: 'Canapé' }));
  // desserte (machine à café, radio, bouilloire) : caisson à portes, plateau ; mini frigo à porte, poignée, grille
  P(-70.8, 0, 3.9, -68.2, 0.9, 4.9);
  F(-70.75, 0, 3.95, -68.25, 0.06, 4.85, 0x1d1712); F(-70.8, 0.06, 3.92, -68.2, 0.86, 4.9, 0x4e3a28);
  A.rbox(zn, 'furniture', -69.5, 0.88, 4.4, 2.64, 0.04, 1.04, 0.01, 0x3a2a1c);
  for (const [xa, xb, h] of [[-70.78, -69.51, -69.57], [-69.49, -68.22, -69.43]]) { F(xa, 0.08, 3.9, xb, 0.84, 3.915, 0x56402c); F(h - 0.01, 0.66, 3.885, h + 0.01, 0.8, 3.9, 0x9c9fa2, true); }
  dev('coffee_maker', zn, -69.9, 1.075, 4.45, Math.PI);
  dev('radio', zn, -68.8, 0.99, 4.5, Math.PI, { security: true }); // éteinte : c'est au gardien de l'allumer
  P(-67.9, 0, 4.0, -66.5, 0.85, 4.9);
  A.rbox(zn, 'furniture_metal', -67.2, 0.44, 4.45, 1.4, 0.82, 0.9, 0.02, 0xd0d0d0);
  F(-67.88, 0.06, 3.99, -66.52, 0.84, 4.0, 0xc4c6c8, true); F(-66.66, 0.4, 3.97, -66.62, 0.78, 3.99, 0x6f7376, true); F(-67.8, 0.02, 3.995, -66.6, 0.06, 4.0, 0x202020);
  dev('kettle', zn, -69.2, 1.03, 4.15, Math.PI);
  // plante, porte-manteau, horloge
  planterSmall(A, zn, -66.8, -4.4);
  dev('wall_clock', zn, -66.2, 2.5, 3, -Math.PI / 2);
  dev('fan', zn, -72.9, 1.08, -2.4, Math.PI / 2 * 1.3);
  dev('desk_phone', zn, -73.2, 0.83, 2.1, Math.PI / 2, { security: true });
  dev('pc_tower', zn, -74.2, 0.305, -2.2, Math.PI / 2, { os: 'security', monitor: true }); // posée sur la tablette basse de la niche (y 0,08)
  dev('lamp', zn, -74.2, 0.955, 2.55, Math.PI / 2, { autoOn: true, security: true });
  dev('office_chair', zn, -71.7, 0.55, 0, Math.PI / 2);
  // armoire à clés murale : caisson tôlé, porte à hublot (crochets visibles), serrure
  P(-66.5, 1.2, 2.2, -66.15, 2.0, 3.2);
  A.rbox(zn, 'furniture_metal', -66.33, 1.6, 2.7, 0.34, 0.8, 1.0, 0.012, 0x8a7d6c);
  F(-66.51, 1.23, 2.23, -66.5, 1.97, 3.17, 0x948774, true); F(-66.515, 1.55, 2.4, -66.51, 1.85, 3.0, 0x1c2226);
  // derrière le hublot (affleurants) : crochets et clés à étiquettes de couleur
  for (let k = 0; k < 8; k++) { const yk = 1.7 + (k >> 2) * 0.12, zk = 2.48 + (k & 3) * 0.14; F(-66.518, yk, zk - 0.005, -66.515, yk + 0.01, zk + 0.005, 0xc9a227, true); F(-66.517, yk - 0.06, zk - 0.006, -66.5155, yk - 0.005, zk + 0.006, 0xb0b4b8, true); F(-66.519, yk - 0.1, zk - 0.012, -66.5165, yk - 0.06, zk + 0.012, [0xd32f2f, 0x1e88e5, 0xfdd835, 0x43a047][k & 3]); }
  F(-66.53, 1.38, 3.05, -66.51, 1.44, 3.09, 0x2a2a2a, true);
  // porte-manteau (socle lesté, fût, patères) avec la veste de rechange du gardien
  P(-66.75, 0, -3.9, -66.45, 1.8, -3.6);
  A.lathe(zn, 'furniture', [[0, 0], [0.17, 0], [0.17, 0.015], [0.12, 0.03], [0.02, 0.04], [0, 0.04]], 16, -66.6, 0, -3.75, 0x1a1a1a);
  A.tube(zn, 'furniture', V3(-66.6, 0.04, -3.75), V3(-66.6, 1.78, -3.75), 0.018, 0x1a1a1a, { segs: 10 });
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; A.tube(zn, 'furniture', V3(-66.6, 1.66, -3.75), V3(-66.6 + Math.cos(a) * 0.14, 1.74, -3.75 + Math.sin(a) * 0.14), 0.009, 0x1a1a1a, { segs: 6 }); }
  A.rbox(zn, 'furniture', -66.6, 1.3, -3.66, 0.42, 0.6, 0.14, 0.05, 0x1f2a44, { n: 2, rx: 0.06 });
  A.rbox(zn, 'furniture', -66.6, 1.62, -3.69, 0.3, 0.08, 0.1, 0.03, 0x1b2438, { n: 1 });
  // plinthes de bois, cadres des plafonniers
  for (const [x0, z0, x1, z1] of [[-75.86, -4.9, -75.84, 2.435], [-75.86, 3.565, -75.84, 4.9], [-66.19, -4.9, -66.17, -0.815], [-66.19, 0.815, -66.17, 4.9], [-75.86, -4.9, -73.565, -4.88], [-72.435, -4.9, -66.17, -4.88], [-75.86, 4.88, -73.565, 4.9], [-72.435, 4.88, -66.17, 4.9]]) F(x0, 0, z0, x1, 0.1, z1, 0x3a2a1c);
  // poster Bobby + calendrier (sur la boiserie est)
  posterAt(world, zn, -66.175, 1.9, -2.8, -Math.PI / 2, 1);
  posterAt(world, zn, -66.175, 1.8, -1.6, -Math.PI / 2, 8);
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

// Plante en pot : pot de terre cuite à bourrelet, terreau, sansevieria (feuilles effilées recto-verso, arquées, liseré
// jaune). Collision inchangée.
function planterSmall(A, zn, x, z) {
  const y = A.world.zone(zn).min[1];
  A.world.physics.add(new Box(x - 0.25, y, z - 0.25, x + 0.25, y + 1.1, z + 0.25, LAYER.FURN)); // pot et feuillage (on ne traverse plus les feuilles)
  A.lathe(zn, 'furniture', [[0, 0], [0.165, 0], [0.165, 0.012], [0.2, 0.36], [0.2, 0.36], [0.236, 0.372], [0.242, 0.45], [0.242, 0.45], [0.214, 0.45], [0.206, 0.4]], 18, x, y, z, 0xa1543a);
  A.lathe(zn, 'furniture', [[0.206, 0.4], [0, 0.41]], 18, x, y, z, 0x2a1d15);
  const lv = { pos: [], nor: [], col: [], idx: [] }, C0 = new THREE.Color(0x2c5a28), C1 = new THREE.Color(0x9c9a3c);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996, out = V3(Math.cos(a), 0, Math.sin(a)), side = V3(-out.z, 0, out.x), Hb = 0.5 + ((i * 37) % 10) * 0.035, lean = 0.08 + (i % 3) * 0.05;
    const base = V3(x + out.x * 0.05, y + 0.4, z + out.z * 0.05), rows = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, w = 0.032 * Math.pow(1 - t, 0.7) * Math.min(1, 0.45 + t * 3), c = base.clone().addScaledVector(V3(0, 1, 0), t * Hb).addScaledVector(out, t * t * lean);
      const tg = V3(out.x * 2 * t * lean, Hb, out.z * 2 * t * lean).normalize(), nn = side.clone().cross(tg).normalize();
      rows.push({ c, w, nn });
    }
    for (const s of [1, -1]) {
      const b = lv.pos.length / 3;
      for (const { c, w, nn } of rows) for (const [dx, col] of [[-1, C1], [0, C0], [1, C1]]) { const p = c.clone().addScaledVector(side, dx * w).addScaledVector(nn, dx ? -0.006 : 0); lv.pos.push(p.x, p.y, p.z); lv.nor.push(nn.x * s, nn.y * s, nn.z * s); lv.col.push(col.r, col.g, col.b); }
      for (let k = 0; k < 5; k++) for (let j = 0; j < 2; j++) { const q = b + k * 3 + j, r = q + 3; if (s > 0) lv.idx.push(q, q + 1, r + 1, q, r + 1, r); else lv.idx.push(q, r + 1, q + 1, q, r, r + 1); }
    }
  }
  A.raw(zn, 'furniture', lv.pos, lv.nor, lv.col, lv.idx);
}

function posterAt(world, zone, x, y, z, ry, i) { poster(world, zone, x, y, z, ry, i); }

// ───────────────────────── ADMINISTRATION ─────────────────────────
// Étage du bloc ouest : accès depuis la galerie (porte « Administration ») et depuis le couloir de service.
function buildAdmin(world, A, door, dev, rng) {
  const g = world.game; const y = 5, yc = 8.6;
  const wall = 'plaster_ece8df';
  // sols et plafonds suspendus
  const FLOOR = { adm_accueil: 'marble', adm_reunion: 'office_carpet', adm_compta: 'office_carpet', adm_rh: 'office_carpet', adm_market: 'office_carpet', adm_coffre: 'lino', adm_archives: 'lino', adm_info: 'rubber', adm_repro: 'lino', adm_infirm: 'toilet_tiles' };
  A.floor('adm_couloir', 'lino_blue', -72, -22, -70, 13, y, 0.4, { faces: 'Y' });
  A.floor('adm_couloir', 'lino_blue', -76, -1, -72, 1, y, 0.4, { faces: 'Y' }); A.floor('adm_couloir', 'lino_blue', -70, -1, -66, 1, y, 0.4, { faces: 'Y' });
  A.ceiling('adm_couloir', 'ceiling', -76, -22, -66, 13, yc, 0.05, { collide: false });
  for (const [id, , b] of ADMIN_ROOMS) { A.floor(id, FLOOR[id], b[0], b[1], b[2], b[3], y, 0.4, { faces: 'Y' }); LP(A, id, (b[0] + b[2]) / 2, yc, (b[1] + b[3]) / 2, 1.2, 0.6, true); if (b[3] - b[1] > 7) LP(A, id, (b[0] + b[2]) / 2, yc, (b[1] + b[3]) / 2 + 2.6, 1.2, 0.6, false); }
  for (let z = -19; z <= 11; z += 6) LP(A, 'adm_couloir', -71, yc, z, 0.6, 1.2, z % 12 === -7);
  LP(A, 'adm_couloir', -74, yc, 0, 1.2, 0.4, false); LP(A, 'adm_couloir', -68, yc, 0, 1.2, 0.4, true);
  A.wallX('adm_archives', 'block', -76, -66, -22, 5, 10, 0.2);
  // cloisons du couloir (x = -72 et -70) avec portes, passage en croix au milieu (z ∈ [-1, 1])
  const dz = { adm_reunion: 10, adm_compta: -4, adm_coffre: -9.5, adm_archives: -17, adm_info: 4, adm_repro: 10, adm_rh: -4, adm_market: -10.5, adm_infirm: -18 };
  for (const xw of [-72, -70]) {
    const ops = [{ a: -1, b: 1, y0: y, y1: y + 2.6 }];
    for (const [id, , b] of ADMIN_ROOMS) if ((xw === -70 ? b[0] === -70 : b[2] === -72) && dz[id] !== undefined) ops.push({ a: dz[id] - 0.5, b: dz[id] + 0.5, y0: y, y1: y + 2.1 });
    if (xw === -70) ops.push({ a: 2.2, b: 5.8, y0: y + 1.05, y1: y + 2.3 }); // guichet de l'accueil
    A.wallZ('adm_couloir', wall, -22, 13, xw, y, yc, 0.12, ops);
  }
  A.box('adm_couloir', 'wood_dark', -70.25, y + 1.0, 2.15, -69.75, y + 1.06, 5.85); // tablette du guichet
  // plinthes vinyle des deux cloisons du couloir, interrompues aux portes et au passage en croix
  for (const [xw, f] of [[-72, 1], [-70, -1]]) {
    const gaps = [[-1, 1], ...Object.entries(dz).filter(([id]) => { const b = ADMIN_ROOMS.find(r => r[0] === id)[2]; return xw === -70 ? b[0] === -70 : b[2] === -72; }).map(([, c]) => [c - 0.5, c + 0.5])].sort((p, q) => p[0] - q[0]);
    let z0 = -22; const xa = xw + f * 0.06, xb = xw + f * 0.072;
    for (const [a, b] of [...gaps, [13, 13]]) { if (a > z0 + 0.05) A.box('adm_couloir', 'furniture', Math.min(xa, xb), y, z0, Math.max(xa, xb), y + 0.08, a, { collide: false, color: 0x3c4043, flat: true }); z0 = Math.max(z0, b); }
  }
  // cloisons entre bureaux
  for (const [x0, x1, zs] of [[-70, -66, [7, -7, -12]], [-76, -72, [7, -7, -14]]]) for (const zw of zs) A.wallX('adm_couloir', wall, x0, x1, zw, y, yc, 0.12);
  // bras du couloir en croix : cloisons z = ±1 (accueil ouvert sur le hall par une baie vitrée)
  A.wallX('adm_couloir', wall, -76, -72, 1, y, yc, 0.12); A.wallX('adm_couloir', wall, -76, -72, -1, y, yc, 0.12); A.wallX('adm_couloir', wall, -70, -66, -1, y, yc, 0.12);
  A.wallX('adm_couloir', wall, -70, -66, 1, y, yc, 0.12, [{ a: -68.7, b: -67.3, y0: y, y1: y + 2.1 }]); // baie aux cotes de la porte vitrée sans cadre (1,4 × 2,1)
  // portes (badges en façade : nom du service)
  const labels = { adm_reunion: 'RÉUNION', adm_compta: 'COMPTA', adm_coffre: 'COFFRES', adm_archives: 'ARCHIVES', adm_info: 'INFORMATIQUE', adm_repro: 'REPRO', adm_rh: 'RH', adm_market: 'MARKETING', adm_infirm: 'INFIRMERIE' };
  for (const [id, name, b] of ADMIN_ROOMS) {
    if (dz[id] === undefined) continue;
    const xw = b[0] === -70 ? -70 : -72;
    const o = { zone: id, x: xw, y, z: dz[id], axis: 'z', width: 0.95, mat: 'wood', name, label: labels[id], swing: xw === -70 ? 1 : -1 };
    if (id === 'adm_compta' || id === 'adm_archives' || id === 'adm_info') Object.assign(o, { lock: 'keys', locked: true });
    if (id === 'adm_coffre') Object.assign(o, { mat: 'metal', sealed: true, code: '0412', codeFlag: 'coffre_admin', color: 0x6a7076, window: false });
    if (id === 'adm_reunion' || id === 'adm_repro') o.window = true;
    door(id, o);
  }
  door('arch_g', { zone: 'adm_couloir', x: -66, y, z: 0, axis: 'z', width: 1.2, mat: 'wood', lock: 'keys', locked: true, name: 'Administration', label: 'ADMINISTRATION', swing: 1, window: true });
  door('arch_w', { zone: 'adm_couloir', x: -76, y, z: 0, axis: 'z', width: 1.2, mat: 'wood', name: 'Administration (couloir de service)', swing: -1 });
  door('adm_acc', { zone: 'adm_accueil', x: -68, y, z: 1, axis: 'x', width: 1.4, mat: 'glass', name: 'Accueil de l\'administration', swing: 1, hinge: 'b' }); // s'ouvre vers l'accueil (elle barrait le couloir)
  const wh = (zn, x, yy, z, ry, title, lines) => { // tableau blanc lisible
    const c = document.createElement('canvas'); c.width = 512; c.height = 320; const x2 = c.getContext('2d');
    x2.fillStyle = '#f4f6f6'; x2.fillRect(0, 0, 512, 320); x2.strokeStyle = '#9aa'; x2.lineWidth = 8; x2.strokeRect(4, 4, 504, 312);
    x2.fillStyle = '#1a3a8a'; x2.font = 'bold 30px "Comic Sans MS", cursive'; x2.fillText(title, 24, 50);
    x2.font = '22px "Comic Sans MS", cursive'; lines.forEach((l, i) => { x2.fillStyle = i % 3 === 2 ? '#b71c1c' : '#1f2f3f'; x2.fillText(l, 28, 92 + i * 32); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.12), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 })); m.position.set(x, yy, z); m.rotation.y = ry; world.zone(zn).group.add(m);
    // cadre aluminium à coins plastique, auget à feutres (avec deux feutres)
    const sz = Math.round(Math.cos(ry)), za = Math.min(z - sz * 0.004, z + sz * 0.016), zb = Math.max(z - sz * 0.004, z + sz * 0.016);
    for (const [a, b, c, d] of [[-0.92, 0.54, 0.92, 0.58], [-0.92, -0.58, 0.92, -0.54], [-0.92, -0.54, -0.88, 0.54], [0.88, -0.54, 0.92, 0.54]]) A.box(zn, 'aluminium', x + a, yy + b, za, x + c, yy + d, zb, { collide: false });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) A.box(zn, 'furniture', x + sx * 0.925 - 0.012, yy + sy * 0.575 - 0.012, za - 0.002, x + sx * 0.925 + 0.012, yy + sy * 0.575 + 0.012, zb + 0.002, { collide: false, color: 0x30343a, flat: true });
    A.box(zn, 'aluminium', x - 0.5, yy - 0.6, Math.min(z, z + sz * 0.07), x + 0.5, yy - 0.585, Math.max(z, z + sz * 0.07), { collide: false });
    for (const [dx, c] of [[-0.2, 0x1a3a8a], [-0.05, 0xb71c1c]]) A.tube(zn, 'furniture', V3(x + dx, yy - 0.574, z + sz * 0.04), V3(x + dx + 0.12, yy - 0.574, z + sz * 0.04), 0.009, c, { segs: 8 });
    world.add(new Readable(world, world.newId('read'), { zone: zn, name: title, title, text: lines.join('\n'), box: [x - 0.9 * Math.abs(Math.cos(ry)) - 0.05, yy - 0.6, z - 0.9 * Math.abs(Math.sin(ry)) - 0.05, x + 0.9 * Math.abs(Math.cos(ry)) + 0.05, yy + 0.6, z + 0.9 * Math.abs(Math.sin(ry)) + 0.05] }));
  };
  // bureau : plateau aux chants adoucis, piétement en panneaux, voile de fond, caisson trois tiroirs, goulotte de câbles ;
  // side : côté de l'utilisateur ('x+', 'x-', 'z+', 'z-'). Collision d'origine (bloc plein).
  const desk = (zn, x0, z0, x1, z1, col = 0x6b4f3a, side = 'z+') => {
    world.physics.add(new Box(x0, y, z0, x1, y + 0.72, z1, LAYER.FURN));
    const F = (a, b, c, d, e, f, cc, metal) => A.furn(zn, a, b, c, d, e, f, cc, { metal, collide: false });
    A.rbox(zn, 'furniture', (x0 + x1) / 2, y + 0.74, (z0 + z1) / 2, x1 - x0 + 0.04, 0.04, z1 - z0 + 0.04, 0.01, 0x3e2c1e, { n: 2 });
    // repère du bureau : u le long du plan de travail, v en profondeur vers l'utilisateur (v = 0 au fond)
    const zU = side[0] === 'x', s = side[1] === '+' ? 1 : -1;
    const u0 = zU ? z0 : x0, u1 = zU ? z1 : x1, vb = zU ? (s > 0 ? x0 : x1) : (s > 0 ? z0 : z1), D = zU ? x1 - x0 : z1 - z0;
    const Q = (ua, ub, ya, yb, va, vc, c, metal) => { const a = vb + s * va, b = vb + s * vc; zU ? F(Math.min(a, b), ya, ua, Math.max(a, b), yb, ub, c, metal) : F(ua, ya, Math.min(a, b), ub, yb, Math.max(a, b), c, metal); };
    for (const ua of [u0, u1 - 0.03]) Q(ua, ua + 0.03, y, y + 0.72, 0.02, D - 0.02, col);                 // jambes
    Q(u0 + 0.03, u1 - 0.03, y + 0.3, y + 0.7, 0.04, 0.06, col);                                           // voile de fond
    Q(u0 + 0.1, u1 - 0.1, y + 0.62, y + 0.64, 0.08, 0.2, 0x2a2a2a, true);                                  // goulotte
    const up = u1 - 0.48; Q(up, u1 - 0.03, y + 0.05, y + 0.7, 0.1, D - 0.02, col);                         // caisson
    for (let k = 0; k < 3; k++) { const yy = y + 0.08 + k * 0.205; Q(up + 0.01, u1 - 0.04, yy, yy + 0.19, D - 0.02, D - 0.005, 0x7a5c44); Q(up + 0.15, u1 - 0.19, yy + 0.15, yy + 0.165, D - 0.005, D + 0.012, 0xa4a8ab, true); }
  };
  // armoire / classeur à tiroirs (h = 1,32 : quatre tiroirs à poignée et porte-étiquette ; plus haut : deux portes)
  const cabinet = (zn, x, z, ry, name, contents, h = 1.32) => {
    const w = 0.5, d = 0.62; const ax = Math.abs(Math.sin(ry)) > 0.5;
    const bx = ax ? [x - d / 2, z - w / 2, x + d / 2, z + w / 2] : [x - w / 2, z - d / 2, x + w / 2, z + d / 2];
    world.physics.add(new Box(bx[0], y, bx[1], bx[2], y + h, bx[3], LAYER.FURN));
    A.rbox(zn, 'furniture_metal', x, y + h / 2, z, ax ? d : w, h, ax ? w : d, 0.012, 0x8d949a);
    // façade (côté ry) : u le long de la façade, t en saillie
    const sg = ax ? Math.round(Math.sin(ry)) : Math.round(Math.cos(ry)), face = ax ? x + sg * d / 2 : z + sg * d / 2;
    const FB = (u0, u1, y0, y1, t0, t1, c) => { const a = face + sg * t0, b = face + sg * t1, o = { metal: true, collide: false }; if (ax) A.furn(zn, Math.min(a, b), y0, z + u0, Math.max(a, b), y1, z + u1, c, o); else A.furn(zn, x + u0, y0, Math.min(a, b), x + u1, y1, Math.max(a, b), c, o); };
    if (h < 1.5) for (let k = 0; k < 4; k++) { const y0 = y + 0.03 + k * (h - 0.06) / 4, y1 = y0 + (h - 0.06) / 4 - 0.012; FB(-0.235, 0.235, y0, y1, 0, 0.012, 0x969da3); FB(-0.08, 0.08, y1 - 0.07, y1 - 0.05, 0.012, 0.03, 0x5b6166); FB(-0.05, 0.05, y1 - 0.045, y1 - 0.02, 0.012, 0.016, 0xe8e4d8); }
    else { FB(-0.235, -0.004, y + 0.04, y + h - 0.04, 0, 0.012, 0x969da3); FB(0.004, 0.235, y + 0.04, y + h - 0.04, 0, 0.012, 0x969da3); FB(-0.02, -0.012, y + h * 0.45, y + h * 0.58, 0.012, 0.03, 0x5b6166); FB(0.012, 0.02, y + h * 0.45, y + h * 0.58, 0.012, 0.03, 0x5b6166); }
    world.add(new Container(world, world.newId('cab'), { zone: zn, name, contents, box: [bx[0] - 0.02, y, bx[1] - 0.02, bx[2] + 0.02, y + h, bx[3] + 0.02] }));
  };
  // ── accueil : banque à panneaux et socle en retrait, tablette de bois, plan de travail côté personnel ──
  world.physics.add(new Box(-69.6, y, 2.3, -68.9, y + 1.05, 5.7, LAYER.FURN)); world.physics.add(new Box(-69.7, y + 1.05, 2.2, -68.8, y + 1.1, 5.8, LAYER.FURN));
  A.furn('adm_accueil', -69.55, y, 2.35, -68.95, y + 0.08, 5.65, 0x2a2420, { collide: false }); A.furn('adm_accueil', -69.6, y + 0.08, 2.3, -68.9, y + 1.05, 5.7, 0xe8e0d0, { collide: false });
  for (const z of [3.15, 4.0, 4.85]) A.furn('adm_accueil', -69.605, y + 0.12, z - 0.003, -69.6, y + 1.0, z + 0.003, 0xb8b0a0, { collide: false });
  A.rbox('adm_accueil', 'furniture', -69.25, y + 1.075, 4.0, 0.9, 0.05, 3.6, 0.012, 0x5d4037, { n: 2 });
  A.rbox('adm_accueil', 'furniture', -68.75, y + 0.74, 4.0, 0.36, 0.03, 3.3, 0.008, 0x6d5040); world.physics.add(new Box(-68.93, y, 2.35, -68.57, y + 0.76, 5.65, LAYER.FURN)); // plan de travail (collision)
  dev('desk_phone', 'adm_accueil', -69.2, y + 1.15, 3.0, Math.PI / 2); dev('pc_tower', 'adm_accueil', -69.2, y + 1.326, 4.8, Math.PI / 2, { os: 'shop', monitor: 'right' });
  dev('office_chair', 'adm_accueil', -68.2, y + 0.55, 4.0, -Math.PI / 2);
  for (const z of [2.2, 3.4]) dev('chair', 'adm_accueil', -66.6, y + 0.45, z, -Math.PI / 2);
  planterSmall(A, 'adm_accueil', -66.5, 6.4); dev('water_fountain', 'adm_accueil', -66.5, y + 0.6, 5.2, -Math.PI / 2);
  posterAt(world, 'adm_accueil', -66.12, y + 1.8, 4.3, -Math.PI / 2, 4);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.36), new THREE.MeshBasicMaterial({ map: signTexture('ADMINISTRATION — DIRECTION DU CENTRE', 0x90a4ae, { h: 100, fontSize: 44, font: 'Arial' }) }));
  sign.position.set(-65.83, 7.75, 0); sign.rotation.y = Math.PI / 2; world.zone('gallery1_w').group.add(sign); world.zone('adm_couloir').signMats.push(sign.material);
  // ── salle de réunion ──
  world.physics.add(new Box(-69.0, y, 8.3, -67.0, y + 0.74, 11.8, LAYER.FURN)); // table : plateau aux chants arrondis, deux fûts sur patins
  A.rbox('adm_reunion', 'furniture', -68, y + 0.72, 10.05, 2.0, 0.04, 3.5, 0.016, 0x4e3a2a, { n: 2 });
  for (const zc of [9.0, 11.1]) { A.rbox('adm_reunion', 'furniture_metal', -68, y + 0.36, zc, 0.22, 0.66, 0.5, 0.02, 0x3c4146); A.rbox('adm_reunion', 'furniture_metal', -68, y + 0.02, zc, 1.1, 0.04, 0.6, 0.012, 0x3c4146); }
  for (const z of [8.8, 9.9, 11.0]) dev('office_chair', 'adm_reunion', -66.6, y + 0.55, z, -Math.PI / 2);
  for (const z of [8.6, 11.4]) dev('office_chair', 'adm_reunion', -69.4, y + 0.55, z, Math.PI / 2); // côté porte : de part et d'autre de l'entrée (z 9,5 … 10,5)
  wh('adm_reunion', -68, y + 1.6, 12.896, Math.PI, 'Réunion du lundi', ['- Sécurité : nouveau gardien de nuit (essai)', '- Bobby : costume à faire nettoyer ?!', '- NE PAS rouvrir le sous-sol B (ordre de M. D.)', '- Budget Noël : guirlandes atrium', '- Plaintes : bruits la nuit (galerie étage)']);
  dev('crt_tv', 'adm_reunion', -66.5, y + 1.15, 12.3, -Math.PI * 0.75, { channel: 'channel:news' }); // sur le meuble télé (dessus à y + 0,9)
  world.physics.add(new Box(-66.9, y, 11.9, -66.1, y + 0.9, 12.7, LAYER.FURN)); // meuble télé : caisson, deux portes, poignées
  A.rbox('adm_reunion', 'furniture', -66.5, y + 0.45, 12.3, 0.8, 0.9, 0.8, 0.01, 0x5d4037);
  for (const [z0, z1, h] of [[11.91, 12.29, 12.24], [12.31, 12.69, 12.36]]) { A.furn('adm_reunion', -66.92, y + 0.08, z0, -66.9, y + 0.86, z1, 0x6a4a3f, { collide: false }); A.furn('adm_reunion', -66.94, y + 0.55, h - 0.008, -66.92, y + 0.7, h + 0.008, 0x9c9fa2, { metal: true, collide: false }); }
  // ── comptabilité ──
  desk('adm_compta', -69.7, -6.4, -68.3, -4.9); desk('adm_compta', -67.7, -6.4, -66.3, -4.9);
  dev('pc_tower', 'adm_compta', -69.0, y + 0.986, -6.1, 0, { os: 'shop', monitor: 'right' }); dev('pc_tower', 'adm_compta', -67.0, y + 0.986, -6.1, 0, { os: 'shop', monitor: 'right' });
  dev('office_chair', 'adm_compta', -69.0, y + 0.55, -4.3, Math.PI); dev('office_chair', 'adm_compta', -67.0, y + 0.55, -4.3, Math.PI);
  dev('desk_phone', 'adm_compta', -68.5, y + 0.81, -5.2, 0);
  cabinet('adm_compta', -66.45, -2.0, -Math.PI / 2, 'Classeur — factures', ['notebook']); cabinet('adm_compta', -66.45, -2.6, -Math.PI / 2, 'Classeur — paies', []);
  // post-it oublié sur le bureau, à côté d'un sous-main et d'un stylo
  A.furn('adm_compta', -67.45, y + 0.76, -5.75, -66.85, y + 0.765, -5.3, 0x2c3a46, { collide: false });
  A.furn('adm_compta', -66.74, y + 0.76, -5.36, -66.66, y + 0.764, -5.28, 0xf2d43a, { collide: false });
  A.furn('adm_compta', -66.7, y + 0.764, -5.33, -66.62, y + 0.767, -5.25, 0xf6a5c0, { collide: false });
  A.furn('adm_compta', -67.3, y + 0.765, -5.2, -67.16, y + 0.775, -5.19, 0x1a3a8a, { collide: false });
  world.add(new Readable(world, world.newId('read'), { zone: 'adm_compta', name: 'Post-it sur le bureau', title: 'Post-it', text: 'Coffres : 0412\n(ne PAS laisser traîner — Martine)', box: [-66.82, y + 0.74, -5.42, -66.56, y + 0.82, -5.2] }));
  // ── salle des coffres ──
  dev('safe', 'adm_coffre', -66.45, y + 0.35, -10.6, -Math.PI / 2, { shop: 'adm', code: '2711', contents: ['cash', 'cash', 'cash', 'cash_drawer_money'] });
  dev('safe', 'adm_coffre', -66.45, y + 0.35, -8.6, -Math.PI / 2, { shop: 'adm', code: '1987', contents: ['cash', 'old_newspaper', 'photo_album'] });
  desk('adm_coffre', -69.6, -11.6, -68.4, -10.2, 0x4a4f55);
  world.physics.add(new Box(-69.4, y + 0.76, -11.3, -68.8, y + 0.98, -10.8, LAYER.FURN)); // compteuse de billets : trémie, afficheur, bac
  A.rbox('adm_coffre', 'furniture', -69.1, y + 0.83, -11.05, 0.6, 0.14, 0.5, 0.025, 0x2b2f33, { n: 2 });
  A.rbox('adm_coffre', 'furniture', -69.1, y + 0.93, -11.15, 0.3, 0.08, 0.2, 0.01, 0x1f2326, { rx: -0.5 });
  A.furn('adm_coffre', -69.22, y + 0.86, -10.81, -68.98, y + 0.89, -10.8, 0x6dd36d, { collide: false });
  A.furn('adm_coffre', -69.28, y + 0.76, -10.8, -68.92, y + 0.8, -10.68, 0x3a3f43, { collide: false });
  dev('cash', 'adm_coffre', -68.6, y + 0.78, -10.5, 0.2, { prop: true }); dev('cash', 'adm_coffre', -68.7, y + 0.8, -10.9, 1.1, { prop: true });
  A.furn('adm_coffre', -69.5, y + 0.76, -10.62, -69.18, y + 0.8, -10.38, 0x1f3d2b, { collide: false }); // registre relié toile
  A.furn('adm_coffre', -69.49, y + 0.765, -10.384, -69.19, y + 0.795, -10.376, 0xe8e0c8, { collide: false });
  world.add(new Readable(world, world.newId('read'), { zone: 'adm_coffre', name: 'Registre des fonds', title: 'Registre des fonds', text: 'Coffre n°1 : recettes de la semaine (code changé le 27/11).\nCoffre n°2 : « effets personnels — dossier 1987 ». Ne pas ouvrir sans M. Desmarais.', box: [-69.55, y + 0.74, -10.68, -69.12, y + 0.84, -10.32] }));
  // ── archives (cartons historiques, étagères, vieille télé) ──
  // étagères le long de la cloison du couloir (de part et d'autre de la porte, z ∈ [-17.5, -16.5], et du débattement du
  // vantail) et dans l'angle du mur sud ; cartons alignés contre le mur est
  for (const [sx, sz, ax, len] of [[-69.8, -21.85, 'z', 2.6], [-69.8, -16.1, 'z', 2.6], [-69.3, -21.9, 'x', 1.7]]) shelfUnit(A, 'adm_archives', sx, sz, ax, len, 0x8d8d8d, 4, 2.3, 0.45, y);
  for (let i = 0; i < 10; i++) {
    const bx = -67.45 + (i % 2) * 0.68, bz = -21.6 + Math.floor(i / 2) * 1.4;
    const c = new Container(world, world.newId('box'), { zone: 'adm_archives', name: 'Carton d\'archives ' + (1987 + i * 4), contents: i === 3 ? ['lore_page'] : i === 7 ? ['old_newspaper'] : rng.chance(0.6) ? [rng.pick(['photo_frame', 'notebook', 'magazine'])] : [], box: [bx, y, bz, bx + 0.6, y + 0.45, bz + 0.45] });
    world.add(c); A.furn('adm_archives', bx, y, bz, bx + 0.6, y + 0.45, bz + 0.45, 0xa1887f, { collide: true });
    A.furn('adm_archives', bx - 0.006, y + 0.41, bz - 0.006, bx + 0.606, y + 0.46, bz + 0.456, 0xae9584, { collide: false }); // couvercle
    for (const ex of [bx - 0.007, bx + 0.6]) A.furn('adm_archives', ex, y + 0.3, bz + 0.17, ex + 0.007, y + 0.34, bz + 0.28, 0x2a1f18, { collide: false }); // poignées
    A.furn('adm_archives', bx + 0.2, y + 0.18, bz - 0.002, bx + 0.4, y + 0.26, bz, 0xf0ead8, { collide: false }); // étiquette
  }
  dev('crt_tv', 'adm_archives', -67.0, y + 0.98, -13.0, Math.PI, { channel: 'channel:testcard' });
  world.physics.add(new Box(-67.9, y, -13.6, -66.2, y + 0.73, -12.4, LAYER.FURN)); // vieille table de bois à pieds tournés
  A.rbox('adm_archives', 'furniture', -67.05, y + 0.71, -13.0, 1.7, 0.04, 1.2, 0.008, 0x5d4037);
  A.furn('adm_archives', -67.85, y + 0.6, -13.55, -66.25, y + 0.69, -12.45, 0x4e3529, { collide: false });
  for (const [lx, lz] of [[-67.8, -13.5], [-66.3, -13.5], [-67.8, -12.5], [-66.3, -12.5]]) A.lathe('adm_archives', 'furniture', [[0, 0], [0.025, 0], [0.03, 0.1], [0.022, 0.25], [0.032, 0.45], [0.028, 0.6], [0, 0.6]], 8, lx, y, lz, 0x4e3529);
  dev('desk_phone', 'adm_archives', -67.6, y + 0.78, -12.8, Math.PI);
  // ── salle informatique : baies de serveurs ──
  // baies de serveurs : caisson sur socle à roulettes, porte grillagée (cadre, panneau perforé sombre), poignée, voyants
  for (let i = 0; i < 4; i++) {
    const z = 1.8 + i * 1.25, F = (a, b, c, d, e, f, col, metal = true) => A.furn('adm_info', a, b, c, d, e, f, col, { metal, collide: false });
    world.physics.add(new Box(-75.6, y, z, -74.8, y + 2.1, z + 0.9, LAYER.FURN));
    F(-75.58, y + 0.06, z + 0.02, -74.82, y + 0.08, z + 0.88, 0x0d0e0f); A.rbox('adm_info', 'furniture_metal', -75.2, y + 1.09, z + 0.45, 0.8, 2.02, 0.9, 0.012, 0x1c1f22);
    F(-74.8, y + 0.12, z + 0.04, -74.785, y + 2.06, z + 0.07, 0x2a2e31); F(-74.8, y + 0.12, z + 0.83, -74.785, y + 2.06, z + 0.86, 0x2a2e31);
    F(-74.8, y + 0.12, z + 0.07, -74.785, y + 0.16, z + 0.83, 0x2a2e31); F(-74.8, y + 2.02, z + 0.07, -74.785, y + 2.06, z + 0.83, 0x2a2e31);
    F(-74.796, y + 0.16, z + 0.07, -74.79, y + 2.02, z + 0.83, 0x08090a, false);
    for (let k = 0; k < 6; k++) F(-74.792, y + 0.4 + k * 0.28, z + 0.12, -74.782, y + 0.415 + k * 0.28, z + 0.6, k % 2 ? 0x00e676 : 0x29b6f6, false);
    F(-74.785, y + 0.95, z + 0.76, -74.765, y + 1.25, z + 0.79, 0x8a9094);
    for (const [dz] of [[0.12], [0.78]]) for (const dx of [-75.5, -74.9]) A.lathe('adm_info', 'furniture', [[0, -0.015], [0.03, -0.015], [0.03, 0.015], [0, 0.015]], 8, dx, y + 0.03, z + dz, 0x111111, { rz: Math.PI / 2 });
  }
  dev('fan', 'adm_info', -72.6, y + 0.3, 6.5, -Math.PI / 2);
  dev('pc_tower', 'adm_info', -73.0, y + 0.986, 2.0, -Math.PI / 2, { os: 'security', monitor: 'right' }); desk('adm_info', -73.4, 1.4, -72.4, 2.8, 0x37474f, 'x-');
  dev('office_chair', 'adm_info', -73.8, y + 0.55, 2.1, Math.PI / 2);
  // ── reprographie ──
  dev('printer', 'adm_repro', -75.4, y + 1.005, 9.0, Math.PI / 2); // posée sur le plateau (y + 0,88)
  world.physics.add(new Box(-75.9, y, 8.3, -74.9, y + 0.88, 9.7, LAYER.FURN)); // table d'imprimante : plateau, piètement tubulaire, tablette à ramettes
  A.rbox('adm_repro', 'furniture_metal', -75.4, y + 0.86, 9.0, 1.0, 0.04, 1.4, 0.008, 0xd0d0d0);
  for (const [lx, lz] of [[-75.86, 8.34], [-74.94, 8.34], [-75.86, 9.66], [-74.94, 9.66]]) A.tube('adm_repro', 'furniture_metal', V3(lx, y, lz), V3(lx, y + 0.84, lz), 0.02, 0x7d8387, { segs: 8 });
  A.furn('adm_repro', -75.86, y + 0.2, 8.34, -74.94, y + 0.22, 9.66, 0xbfc5c8, { metal: true, collide: false });
  for (let k = 0; k < 3; k++) A.furn('adm_repro', -75.7, y + 0.22 + k * 0.055, 8.5 + k * 0.02, -75.4, y + 0.27 + k * 0.055, 8.71 + k * 0.02, 0xf4f4f0, { collide: false });
  world.physics.add(new Box(-75.9, y, 10.4, -75.1, y + 1.05, 11.4, LAYER.FURN)); world.physics.add(new Box(-75.76, y + 0.6, 11.4, -75.24, y + 0.72, 11.58, LAYER.FURN)); // photocopieuse : caisson, cassettes, vitre d'exposition et capot, pupitre, bac de sortie
  A.rbox('adm_repro', 'furniture', -75.5, y + 0.5, 10.9, 0.8, 1.0, 1.0, 0.03, 0xc5cacd, { n: 2 });
  for (let k = 0; k < 3; k++) { A.furn('adm_repro', -75.1, y + 0.1 + k * 0.17, 10.45, -75.09, y + 0.25 + k * 0.17, 11.35, 0xb2b8bc, { collide: false }); A.furn('adm_repro', -75.09, y + 0.2 + k * 0.17, 10.75, -75.075, y + 0.22 + k * 0.17, 11.05, 0x55595c, { collide: false }); }
  A.rbox('adm_repro', 'furniture', -75.5, y + 1.025, 10.9, 0.78, 0.05, 0.98, 0.015, 0x4a4f53);
  A.rbox('adm_repro', 'furniture', -75.18, y + 0.98, 11.2, 0.18, 0.06, 0.32, 0.01, 0x2a2e31, { rz: -0.35 });
  A.furn('adm_repro', -75.15, y + 0.97, 11.1, -75.13, y + 0.99, 11.14, 0x43a047, { collide: false });
  A.rbox('adm_repro', 'furniture', -75.5, y + 0.7, 11.47, 0.5, 0.02, 0.18, 0.006, 0xd8dcdf);
  cabinet('adm_repro', -72.37, 12.2, -Math.PI / 2, 'Armoire à fournitures', ['notebook', 'battery', 'duct_tape']);
  shelfUnit(A, 'adm_repro', -75.9, 7.4, 'x', 2.8, 0x9e9e9e, 4, 2.0, 0.4, y);
  // ── ressources humaines ──
  desk('adm_rh', -75.6, -5.8, -74.0, -4.4, 0x6b4f3a, 'x+'); dev('pc_tower', 'adm_rh', -75.0, y + 0.986, -5.5, Math.PI / 2, { os: 'shop', monitor: 'left' }); dev('office_chair', 'adm_rh', -73.6, y + 0.55, -5.1, -Math.PI / 2);
  cabinet('adm_rh', -75.59, -2.0, Math.PI / 2, 'Dossiers du personnel', ['notebook']); cabinet('adm_rh', -75.59, -2.6, Math.PI / 2, 'Dossiers du personnel (anciens)', ['old_newspaper']);
  wh('adm_rh', -73.0, y + 1.6, -6.936, 0, 'Planning des gardiens', ['Lun–Dim : nuit (22 h – 6 h)', 'Gérard D. → départ en retraite', 'Remplaçant : à l\'essai (10 nuits)', 'Rappel : rondes toutes les heures !', '« Ne jamais descendre après 3 h 33 » ???']);
  // ── marketing ──
  desk('adm_market', -75.6, -12.8, -74.0, -11.2, 0x6b4f3a, 'x+'); dev('pc_tower', 'adm_market', -75.0, y + 0.986, -12.4, Math.PI / 2, { os: 'shop', monitor: 'left' }); dev('office_chair', 'adm_market', -73.6, y + 0.55, -12.0, -Math.PI / 2);
  for (const [z, i] of [[-8.0, 0], [-9.0, 6], [-10.0, 7]]) posterAt(world, 'adm_market', -75.87, y + 1.7, z, Math.PI / 2, i);
  A.furn('adm_market', -73.2, y, -8.2, -72.6, y + 1.8, -7.6, 0xffb300); // présentoir en carton « Bobby »
  // ── infirmerie ──
  world.physics.add(new Box(-75.7, y, -21.2, -74.7, y + 0.62, -19.2, LAYER.FURN)); world.physics.add(new Box(-75.7, y, -21.2, -74.7, y + 0.78, -21.12, LAYER.FURN)); // lit de repos (tête de lit : collision jusqu'au tube haut) : cadre tubulaire, sommier, matelas, oreiller, couverture pliée
  for (const [lx, lz] of [[-75.66, -21.16], [-74.74, -21.16], [-75.66, -19.24], [-74.74, -19.24]]) A.tube('adm_infirm', 'furniture_metal', V3(lx, y, lz), V3(lx, y + 0.5, lz), 0.018, 0xd8dadc, { segs: 8 });
  for (const lx of [-75.66, -74.74]) A.tube('adm_infirm', 'furniture_metal', V3(lx, y + 0.42, -21.16), V3(lx, y + 0.42, -19.24), 0.016, 0xd8dadc, { segs: 8 });
  A.tube('adm_infirm', 'furniture_metal', V3(-75.66, y + 0.75, -21.16), V3(-74.74, y + 0.75, -21.16), 0.016, 0xd8dadc, { segs: 8 });
  A.tube('adm_infirm', 'furniture_metal', V3(-75.66, y + 0.5, -21.16), V3(-75.66, y + 0.75, -21.16), 0.018, 0xd8dadc, { segs: 8 }); A.tube('adm_infirm', 'furniture_metal', V3(-74.74, y + 0.5, -21.16), V3(-74.74, y + 0.75, -21.16), 0.018, 0xd8dadc, { segs: 8 });
  A.furn('adm_infirm', -75.66, y + 0.44, -21.14, -74.74, y + 0.47, -19.26, 0x9aa0a4, { metal: true, collide: false });
  A.rbox('adm_infirm', 'furniture', -75.2, y + 0.55, -20.2, 0.92, 0.16, 1.9, 0.05, 0xe7ecee, { n: 2 });
  A.rbox('adm_infirm', 'furniture', -75.2, y + 0.66, -20.95, 0.6, 0.1, 0.32, 0.04, 0xfafafa, { n: 2 });
  A.rbox('adm_infirm', 'furniture', -75.2, y + 0.645, -19.6, 0.94, 0.05, 0.6, 0.02, 0x80cbc4, { n: 1 });
  world.add(new Seat(world, world.newId('seat'), { zone: 'adm_infirm', x: -75.2, y, z: -20.2, ry: Math.PI / 2, name: 'Lit de repos' }));
  cabinet('adm_infirm', -72.37, -15.0, -Math.PI / 2, 'Armoire à pharmacie', ['first_aid', 'first_aid'], 1.8);
  dev('sink', 'adm_infirm', -72.31, y + 0.45, -16.5, -Math.PI / 2); // contre la cloison du couloir, à l'écart de l'huisserie de la porte
  // caméras
  world.cameras.push({ id: 'cam_admin', name: 'Administration — couloir', area: 'gallery1', zone: 'adm_couloir', pos: new THREE.Vector3(-71.6, 8.4, 12.4), yaw: 0, pitch: -0.3, fov: 70 }); // (bras de fixation contre le faux plafond)
  world.cameras.push({ id: 'cam_coffre', name: 'Salle des coffres', area: 'gallery1', zone: 'adm_coffre', pos: new THREE.Vector3(-69.6, 8.39, -7.4), yaw: -0.65, pitch: -0.55, fov: 75 });
}

// Habillage d'une volée posée par A.stairs (mêmes paramètres) : nez de marche en aluminium à bande antidérapante,
// paillasse de béton sous les marches, mains courantes rondes sur consoles et rosaces murales. rails : [[w, côté du mur]]
// où w est la position transversale (0 … largeur) et le côté ±1 indique le mur qui porte les consoles.
function stairDetail(A, zn, x, z, dir, width, run, rise, y0, steps, rails = []) {
  const sr = rise / steps, sd = run / steps, alongX = dir[0] === 'x', sg = dir[1] === '+' ? 1 : -1;
  const P = (u, y, w) => alongX ? V3(x + sg * u, y, z + w) : V3(x + w, y, z + sg * u);
  const B = (u0, u1, ya, yb, w0, w1, mat, c) => { const a = P(u0, ya, w0), b = P(u1, yb, w1); A.box(zn, mat, Math.min(a.x, b.x), ya, Math.min(a.z, b.z), Math.max(a.x, b.x), yb, Math.max(a.z, b.z), { collide: false, color: c, flat: mat.startsWith('furniture') }); };
  for (let i = 0; i < steps; i++) {
    const top = y0 + sr * (i + 1), u = sd * i;
    B(u - 0.004, u + 0.05, top - 0.001, top + 0.004, 0.03, width - 0.03, 'aluminium');
    B(u - 0.006, u, top - 0.045, top + 0.004, 0.03, width - 0.03, 'aluminium');
    B(u + 0.012, u + 0.04, top + 0.004, top + 0.006, 0.05, width - 0.05, 'furniture', 0x1c1c1c);
  }
  A.beam(zn, 'concrete', P(0, y0 + sr - 0.475, width / 2), P(run - sd, y0 + rise - 0.475, width / 2), width, 0.2);
  for (const [w, ws] of rails) {
    const yL = y0 + sr + 0.9, yH = y0 + rise + 0.9, path = roundPath([P(-0.3, yL, w), P(0, yL, w), P(run - sd, yH, w), P(run - sd + 0.3, yH, w)], 0.2, 4);
    A.sweep(zn, 'steel', path, circleShape(0.021, 10), 0xffffff, { caps: true });
    // prolongements horizontaux aux deux bouts (au-delà du noyau ou du mur qui porte la rampe) : collision
    for (const [u0, u1, yy] of [[-0.3, 0, yL], [run - sd, run - sd + 0.3, yH]]) { const a = P(u0, yy, w - 0.025), b = P(u1, yy, w + 0.025); A.world.physics.add(new Box(Math.min(a.x, b.x), yy - 0.03, Math.min(a.z, b.z), Math.max(a.x, b.x), yy + 0.03, Math.max(a.z, b.z), LAYER.FURN)); }
    const n = Math.max(2, Math.round(run / 1.4));
    for (let k = 0; k <= n; k++) {
      const u = (run - sd) * k / n, yr = yL + (yH - yL) * k / n, a = P(u, yr - 0.02, w), b = P(u, yr - 0.07, w + ws * 0.065);
      A.tube(zn, 'steel', a, b, 0.008, 0xffffff, { segs: 6 });
      A.lathe(zn, 'steel', [[0, 0], [0.032, 0], [0.032, 0.008], [0, 0.01]], 10, 0, 0, 0, 0xffffff, { m: alongX ? trs(b.x, b.y, b.z, -ws * Math.PI / 2, 0, 0) : trs(b.x, b.y, b.z, 0, 0, ws * Math.PI / 2) });
    }
  }
}

// ───────────────────────── ESCALIER OUEST ─────────────────────────
function buildStairsW(world, A, door) {
  const zn = 'stairsW';
  const levels = [-4.5, 0, 5, 10.5];
  for (let li = 0; li < levels.length; li++) {
    const y = levels[li];
    A.floor(zn, 'concrete_floor', -76, 13, -73.5, 22, y, 0.3, { faces: 'xXzZYy' }); // (sous-face visible depuis les volées du dessous)
    if (li < levels.length - 1) {
      const h = levels[li + 1] - y; const half = h / 2; const steps = Math.round(half / 0.25);
      A.stairs(zn, 'concrete', -73.5, 13.2, 'x+', 2.4, 5.5, half, y, steps);
      A.floor(zn, 'concrete_floor', -68, 13, -66, 22, y + half, 0.3, { faces: 'xXzZYy' });
      A.stairs(zn, 'concrete', -68, 19.4, 'x-', 2.4, 5.5, half, y + half, steps);
      stairDetail(A, zn, -73.5, 13.2, 'x+', 2.4, 5.5, half, y, steps, [[-0.035, -1], [2.435, 1]]);
      stairDetail(A, zn, -68, 19.4, 'x-', 2.4, 5.5, half, y + half, steps, [[-0.035, -1], [2.435, 1]]);
      // appliques contre les murs (elles flottaient au milieu de la cage)
      LP(A, zn, -66.3, y + half + 2.6, 17.5, 0.3, 1.0, li % 2 === 0);
      LP(A, zn, -75.75, y + 3.2, 17.5, 0.3, 1.0, false);
    }
  }
  // noyau central plein
  A.box(zn, 'block', -73.5, -4.5, 15.7, -68, 13.5, 19.3);
  // murs est / ouest (ouest : portes aux paliers)
  A.wallZ(zn, 'block', 13, 22, -66, 10, 13.5, 0.3);
  A.wallZ(zn, 'block', 13, 22, -76, -4.5, 0, 0.2, [{ a: 17.25, b: 18.25, y0: -4.5, y1: -2.4 }]);
  A.wallZ(zn, 'block', 13, 22, -76, 10.5, 13.5, 0.2, [{ a: 17.25, b: 18.25, y0: 10.5, y1: 12.6 }]);
  A.box(zn, 'block', -76.1, 10.0, 13, -75.9, 10.5, 22, { collide: false, faces: 'X' }); // bande au droit de la dalle du toit (zone du toit masquée depuis la cage : on voyait le ciel)
  // même chose au droit de la dalle de l'étage côté ouest (entre les murs des couloirs du RDC et de l'étage) ; côté est,
  // parement de parpaing sur toute la hauteur : on y voyait l'enduit blanc des magasins voisins, une fente au droit de la
  // dalle de l'étage (avec l'intérieur du magasin au travers) et la rive en retrait de la dalle du parking
  A.box(zn, 'block', -76.1, 4.6, 13, -75.9, 5.0, 22, { collide: false, faces: 'X' });
  A.box(zn, 'block', -66.17, -4.5, 13, -66.15, 10, 22, { collide: false, faces: 'x' });
  // toit de la cage
  A.box(zn, 'concrete', -76.2, 13.5, 12.8, -65.8, 13.9, 22.2);
  door('stW_B', { panic: true, zone: zn, x: -76, y: -4.5, z: 17.75, axis: 'z', width: 1, mat: 'metal', name: 'Escalier ouest — sous-sol', gate: 'basement', window: true });
  door('stW_1', { panic: true, zone: zn, x: -76, y: 5, z: 17.75, axis: 'z', width: 1, mat: 'metal', name: 'Escalier ouest — étage', gate: 'gallery1', window: true });
  door('stW_R', { zone: zn, x: -76, y: 10.5, z: 17.75, axis: 'z', width: 1, mat: 'metal', name: 'Accès toit', gate: 'roof', lock: 'keys', locked: true });
}

// ───────────────────────── ESCALIER EST ─────────────────────────
function buildStairsE(world, A, door) {
  const zn = 'stairsE';
  const levels = [-4.5, 0, 5];
  for (let li = 0; li < levels.length; li++) {
    const y = levels[li];
    A.floor(zn, 'concrete_floor', 66, 8, 80, 10.5, y, 0.3, { faces: 'xXzZYy' });
    A.floor(zn, 'concrete_floor', 74, 10.5, 80, 22, y, 0.3, { faces: 'xXzZYy' });
    LP(A, zn, 79.85, y + 3.6, 15, 0.3, 1.2, true); // applique contre le mur est
    if (li < levels.length - 1) {
      const h = levels[li + 1] - y; const half = h / 2; const steps = Math.round(half / 0.25);
      A.stairs(zn, 'concrete', 66.6, 10.5, 'z+', 2.4, 9, half, y, steps);
      A.floor(zn, 'concrete_floor', 66, 19.5, 73.4, 22, y + half, 0.3, { faces: 'xXzZYy' });
      A.stairs(zn, 'concrete', 71.0, 19.5, 'z-', 2.4, 9, half, y + half, steps);
      stairDetail(A, zn, 66.6, 10.5, 'z+', 2.4, 9, half, y, steps, [[2.435, 1]]);
      stairDetail(A, zn, 71.0, 19.5, 'z-', 2.4, 9, half, y + half, steps, [[-0.035, -1], [2.535, 1]]);
      LP(A, zn, 69.5, y + half + 2.6, 21.75, 1.0, 0.3, false); // applique contre le mur nord
    }
  }
  A.box(zn, 'block', 69.1, -4.5, 10.5, 70.9, 10, 19.5);
  A.wallZ(zn, 'block', 10.5, 22, 73.7, -4.5, 10, 0.2);
  A.wallZ(zn, 'block_dark', 8, 22, 80.2, -4.5, 10, 0.4);
  A.wallX(zn, 'block', 66, 80, 22, -4.5, 0, 0.2);
  // un mur par niveau : deux ouvertures superposées dans le même mur, cutOpenings rebouchait la première (les portes vers
  // les couloirs de service nord étaient murées, au RDC comme à l'étage)
  A.wallX(zn, 'block', 66, 80, 22, 0, 5, 0.2, [{ a: 76.4, b: 77.6, y0: 0, y1: 2.2 }]); A.wallX(zn, 'block', 66, 80, 22, 5, 10, 0.2, [{ a: 76.4, b: 77.6, y0: 5, y1: 7.2 }]);
  A.wallX(zn, 'block', 66, 80, 8, -4.5, 0, 0.3);
  // parements de parpaing : côté ouest (mur du parking en bas, enduit du magasin voisin au-dessus avec une fente au droit
  // de la dalle de l'étage et la rive en retrait de la dalle du parking : un seul nu à x = 66,32, découpé autour de
  // l'huisserie de la porte du parking) et côté sud (enduit du hall et de la mezzanine, fente au droit de la dalle),
  // découpé autour des huisseries des deux portes
  for (const [z0, z1, y0] of [[8, 8.535, -4.5], [9.965, 22, -4.5], [8.535, 9.965, -2.235]]) A.box(zn, 'block', 66.3, y0, z0, 66.32, -0.6, z1, { collide: false, faces: 'X' });
  A.box(zn, 'block', 66.15, -0.6, 8, 66.32, 10, 22, { faces: 'X' });
  for (const [x0, x1, y0, y1] of [[66.32, 76.935, 0, 10], [78.265, 80, 0, 10], [76.935, 78.265, 2.265, 5], [76.935, 78.265, 7.265, 10]]) A.box(zn, 'block', x0, y0, 8.15, x1, y1, 8.17, { collide: false, faces: 'Z' });
  A.ceiling(zn, 'concrete', 66, 8, 80, 22, 10, 0.4);
  door('stE_svc0', { panic: true, zone: zn, x: 77, y: 0, z: 22, axis: 'x', width: 1.2, mat: 'metal', name: 'Escalier est → couloir de service', gate: 'service', swing: 1 });
  door('stE_svc1', { panic: true, zone: zn, x: 77, y: 5, z: 22, axis: 'x', width: 1.2, mat: 'metal', name: 'Escalier est → couloir de service (étage)', gate: 'service', swing: 1 });
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
  for (let z = -21; z <= 19; z += 8) LP(A, 'westwingB', -78, yc, z, 0.3, 1.2, z % 16 === -5);
  // chemin de câbles (tôle perforée sur consoles) et gaines électriques le long du mur extérieur
  A.box('westwingB', 'steel_dark', -79.95, yc - 0.42, -24, -79.55, yc - 0.4, 22, { collide: false });
  for (const xx of [-79.95, -79.57]) A.box('westwingB', 'steel_dark', xx, yc - 0.42, -24, xx + 0.02, yc - 0.34, 22, { collide: false });
  for (const [dx, c] of [[-79.85, 0x1a1a1a], [-79.78, 0x3a3a3a], [-79.7, 0x7a3a2a], [-79.64, 0x1f3a5a]]) A.tube('westwingB', 'furniture', V3(dx, yc - 0.38, -24), V3(dx, yc - 0.38, 22), 0.016, c, { segs: 6, open: true });
  for (let z = -23; z <= 21; z += 2) A.box('westwingB', 'steel_dark', -80.0, yc - 0.44, z - 0.02, -79.5, yc - 0.42, z + 0.02, { collide: false });
  const rooms = [['generator', -24, -12], ['electrical', -12, -2], ['pa', -2, 6], ['boiler', 6, 13]];
  for (const [zn, z0, z1] of rooms) {
    A.floor(zn, 'concrete_floor', -76, z0, -66, z1, yb, 0.3);
    A.ceiling(zn, 'concrete', -76, z0, -66, z1, yc, 0.6);
    A.wallX(zn, 'block', -76, -66, z1, yb, yc, 0.2);
    LP(A, zn, -71, yc, (z0 + z1) / 2, 1.2, 0.3);
  }
  A.wallZ('generator', 'block', -24, 13, -66, yb, yc, 0.3, [{ a: 9, b: 10.2, y0: yb, y1: yb + 2.1 }]);
  door('gen', { zone: 'generator', x: -76, y: yb, z: -18, axis: 'z', width: 1, mat: 'metal', name: 'Groupe électrogène', swing: 1, label: 'GROUPE' });
  door('elec', { zone: 'electrical', x: -76, y: yb, z: -7, axis: 'z', width: 1, mat: 'metal', name: 'Local électrique', swing: 1, label: 'DANGER' });
  door('pa', { zone: 'pa', x: -76, y: yb, z: 2, axis: 'z', width: 1, mat: 'wood', name: 'Régie d\'annonces', swing: 1, label: 'RÉGIE' });
  door('boiler', { zone: 'boiler', x: -76, y: yb, z: 9.5, axis: 'z', width: 1, mat: 'metal', name: 'Chaufferie', swing: 1 });
  door('boiler_g', { panic: true, zone: 'boiler', x: -66, y: yb, z: 9.6, axis: 'z', width: 1.2, mat: 'metal', name: 'Chaufferie → parking', swing: -1, gate: 'garage' });
  door('b13', { zone: 'b13', x: -80.2, y: yb, z: -7, axis: 'z', width: 1.2, mat: 'metal', name: 'Porte B-13', sealed: true, code: '1987', color: 0x5a3f2e, label: 'B-13', swing: -1 });
  // B-13
  A.floor('b13', 'concrete_dark', -88, -10, -80, -4, yb, 0.3);
  A.ceiling('b13', 'concrete_dark', -88, -10, -80, -4, yc, 0.6);
  A.wallX('b13', 'brick', -88.2, -80, -10.1, yb, yc, 0.2); A.wallX('b13', 'brick', -88.2, -80, -3.9, yb, yc, 0.2);
  A.wallZ('b13', 'brick', -10, -4, -88.1, yb, yc, 0.2);
  // petite table basse (plateau usé aux chants adoucis, pieds, ceinture) et petite chaise d'enfant jaune tournée vers
  // elle (assise, quatre pieds, entretoises, dossier à barreaux) ; collisions d'origine
  world.physics.add(new Box(-87.6, yb, -9.6, -86.4, yb + 0.3, -8.4, LAYER.FURN)); world.physics.add(new Box(-87.7, yb, -5.6, -86.9, yb + 0.45, -4.6, LAYER.FURN));
  A.rbox('b13', 'furniture', -87, yb + 0.285, -9, 1.2, 0.03, 1.2, 0.008, 0x8d6e63, { n: 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) A.furn('b13', -87 + sx * 0.52 - 0.025, yb, -9 + sz * 0.52 - 0.025, -87 + sx * 0.52 + 0.025, yb + 0.27, -9 + sz * 0.52 + 0.025, 0x6d5040, { collide: false });
  for (const s of [-1, 1]) { A.furn('b13', -87.5, yb + 0.2, -9 + s * 0.52 - 0.012, -86.5, yb + 0.27, -9 + s * 0.52 + 0.012, 0x6d5040, { collide: false }); A.furn('b13', -87 + s * 0.52 - 0.012, yb + 0.2, -9.5, -87 + s * 0.52 + 0.012, yb + 0.27, -8.5, 0x6d5040, { collide: false }); }
  const cy = 0xf2d22e, cx0 = -87.3, cz0 = -5.1;
  A.rbox('b13', 'furniture', cx0, yb + 0.27, cz0, 0.34, 0.025, 0.34, 0.006, cy, { n: 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) A.furn('b13', cx0 + sx * 0.15 - 0.014, yb, cz0 + sz * 0.15 - 0.014, cx0 + sx * 0.15 + 0.014, yb + (sz > 0 ? 0.56 : 0.258), cz0 + sz * 0.15 + 0.014, cy, { collide: false });
  for (const s of [-1, 1]) A.furn('b13', cx0 + s * 0.15 - 0.01, yb + 0.08, cz0 - 0.136, cx0 + s * 0.15 + 0.01, yb + 0.1, cz0 + 0.136, 0xd9bb22, { collide: false });
  for (const yy of [0.4, 0.52]) A.furn('b13', cx0 - 0.136, yb + yy, cz0 + 0.14, cx0 + 0.136, yb + yy + 0.04, cz0 + 0.16, cy, { collide: false });
  for (const xx of [-0.06, 0, 0.06]) A.furn('b13', cx0 + xx - 0.008, yb + 0.285, cz0 + 0.145, cx0 + xx + 0.008, yb + 0.4, cz0 + 0.155, cy, { collide: false });
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
  world.physics.add(new Box(-69, yb, -2.6, -67, yb + 0.9, -2.2, LAYER.FURN)); // établi : plateau bois, piètement tôlé, tiroir
  A.rbox('electrical', 'furniture', -68, yb + 0.88, -2.4, 2.0, 0.04, 0.4, 0.008, 0x8a6a46);
  for (const lx of [-68.97, -67.05]) A.furn('electrical', lx, yb, -2.58, lx + 0.02, yb + 0.86, -2.22, 0x5f6f78, { metal: true, collide: false });
  A.furn('electrical', -68.95, yb + 0.2, -2.58, -67.05, yb + 0.22, -2.22, 0x5f6f78, { metal: true, collide: false });
  A.furn('electrical', -68.5, yb + 0.7, -2.22, -67.9, yb + 0.85, -2.2, 0x6f7f88, { metal: true, collide: false });
  dev('fuse', 'electrical', -68.5, yb + 0.95, -2.4, 0, { prop: true }); dev('fuse', 'electrical', -68.2, yb + 0.95, -2.4, 0, { prop: true });
  dev('book_electric', 'electrical', -67.5, yb + 0.92, -2.4, 0, { prop: true });
  dev('pa_console', 'pa', -71, yb + 0.45, 4.8, Math.PI);
  dev('office_chair', 'pa', -71, yb + 0.55, 3.6, 0);
  world.physics.add(new Box(-75.6, yb, -1.5, -75, yb + 1.9, 1.5, LAYER.FURN)); // baies 19 pouces : amplis, voyants, grilles
  A.rbox('pa', 'furniture_metal', -75.3, yb + 0.95, 0, 0.6, 1.9, 3.0, 0.015, 0x37474f);
  for (let k = 0; k < 9; k++) { const yy = yb + 0.25 + k * 0.17; A.furn('pa', -75.0, yy, -1.35, -74.985, yy + 0.13, 1.35, k % 3 ? 0x2a2f33 : 0x4a5056, { metal: true, collide: false }); for (let j = 0; j < 6; j++) A.furn('pa', -74.985, yy + 0.05, -1.2 + j * 0.45, -74.98, yy + 0.07, -1.18 + j * 0.45, j % 2 ? 0x00e676 : 0xffb300, { collide: false }); }
  // chaudière et cumulus adossés au mur nord (conduit de fumée et raccords vers le mur, sous les départs du plafond ;
  // la descente de gaz tombe contre la chaudière) : le passage entre les deux portes (z ≈ 9,5) reste libre
  dev('boiler', 'boiler', -72.6, yb + 1.1, 12.3, Math.PI);
  dev('water_heater', 'boiler', -68.5, yb + 0.75, 12.6, Math.PI);
  dev('wrench', 'boiler', -74.6, yb + 0.02, 7.2, 0.5, { prop: true });
  world.points.generator = new THREE.Vector3(-71, yb, -19);
  world.points.breakers = new THREE.Vector3(-71, yb, -11.3);
  world.points.paRoom = new THREE.Vector3(-71, yb, 3);
  world.points.boiler = new THREE.Vector3(-72.6, yb, 11.2);
  basementDetail(world, A, yb, yc);
}

// Locaux techniques du sous-sol (contre les murs et au plafond, hors des passages) : grilles de ventilation, échelles à
// câbles suspendues, nourrice de fioul sur bac de rétention, marquage autour du groupe ; armoires du TGBT, tapis isolant ;
// panneaux acoustiques de la régie ; calorifuges, gaz et vase d'expansion de la chaufferie
function basementDetail(world, A, yb, yc) {
  const M = (zn, x0, y0, z0, x1, y1, z1, c) => A.furn(zn, x0, y0, z0, x1, y1, z1, c, { metal: true, collide: false });
  const galv = 0x9ea4a8, rod = 0x6f767b;
  // échelle à câbles le long de x (ax) ou de z, axe transversal en c, dessous à y : longerons, échelons, câbles, trapèzes
  const tray = (zn, ax, a0, a1, c, y, w = 0.3, cab = [0x1a1a1a, 0x3a3a3a, 0x7a3a2a]) => {
    const B = (u0, u1, y0, y1, v0, v1, col) => ax ? M(zn, u0, y0, v0, u1, y1, v1, col) : M(zn, v0, y0, u0, v1, y1, u1, col);
    for (const s of [-1, 1]) B(a0, a1, y, y + 0.08, c + s * w / 2 - 0.006, c + s * w / 2 + 0.006, galv);
    for (let u = a0 + 0.15; u < a1 - 0.05; u += 0.3) B(u - 0.012, u + 0.012, y, y + 0.012, c - w / 2, c + w / 2, galv);
    cab.forEach((col, i) => { const v = c - w / 2 + (i + 0.7) * w / (cab.length + 0.4); A.tube(zn, 'furniture', ax ? V3(a0, y + 0.03, v) : V3(v, y + 0.03, a0), ax ? V3(a1, y + 0.03, v) : V3(v, y + 0.03, a1), 0.014, col, { segs: 6, open: true }); });
    for (let u = a0 + 0.4; u < a1 - 0.1; u += 1.5) {
      B(u - 0.02, u + 0.02, y - 0.03, y, c - w / 2 - 0.04, c + w / 2 + 0.04, rod);
      for (const s of [-1, 1]) B(u - 0.005, u + 0.005, y - 0.03, yc, c + s * (w / 2 + 0.025) - 0.005, c + s * (w / 2 + 0.025) + 0.005, rod);
    }
  };
  // grille de ventilation murale à lames inclinées (mur ⊥ x si ax = false), face du mur en f, côté pièce s
  const louvre = (zn, ax, u, f, s, y, w, h) => {
    const B = (u0, u1, y0, y1, n0, n1, col) => { const a = f + s * n0, b = f + s * n1; if (ax) M(zn, u0, y0, Math.min(a, b), u1, y1, Math.max(a, b), col); else M(zn, Math.min(a, b), y0, u0, Math.max(a, b), y1, u1, col); };
    B(u - w / 2, u + w / 2, y + h / 2 - 0.04, y + h / 2, 0, 0.04, galv); B(u - w / 2, u + w / 2, y - h / 2, y - h / 2 + 0.04, 0, 0.04, galv);
    B(u - w / 2, u - w / 2 + 0.04, y - h / 2, y + h / 2, 0, 0.04, galv); B(u + w / 2 - 0.04, u + w / 2, y - h / 2, y + h / 2, 0, 0.04, galv);
    B(u - w / 2 + 0.04, u + w / 2 - 0.04, y - h / 2 + 0.04, y + h / 2 - 0.04, 0, 0.004, 0x1c1f22); // fond sombre (gaine)
    for (let yy = y - h / 2 + 0.09; yy < y + h / 2 - 0.05; yy += 0.075) A.rbox(zn, 'furniture_metal', ax ? u : f + s * 0.02, yy, ax ? f + s * 0.02 : u, ax ? w - 0.08 : 0.06, 0.006, ax ? 0.06 : w - 0.08, 0.002, galv, ax ? { rx: s * 0.6 } : { rz: -s * 0.6 });
  };
  // ── groupe électrogène : prise d'air au sud, rejet à l'est (vers le parking), échelle à câbles vers le TGBT ──
  louvre('generator', true, -71, -24.0, 1, yb + 2.6, 1.2, 0.9);
  louvre('generator', false, -19, -66.15, -1, yb + 2.9, 1.0, 0.7);
  tray('generator', true, -75.9, -66.15, -14.6, yc - 0.32);
  tray('generator', false, -14.45, -11.9, -70.6, yc - 0.32);
  M('generator', -70.8, yc - 0.42, -12.18, -70.4, yc - 0.18, -11.82, 0xb0453a); // calfeutrement coupe-feu de la traversée
  // nourrice de fioul sur bac de rétention (angle sud-est), jauge, bouchon, évent, ligne d'alimentation au sol
  world.physics.add(new Box(-69.28, yb, -23.95, -66.9, yb + 1.35, -23.05, LAYER.FURN)); // (avec la remontée de la ligne d'alimentation, x = -69,25)
  M('generator', -69.0, yb, -23.95, -66.9, yb + 0.22, -23.05, 0x3a4046);
  M('generator', -68.96, yb + 0.22, -23.91, -66.94, yb + 0.225, -23.09, 0x23272b);
  for (const lx of [-68.75, -67.15]) for (const lz of [-23.75, -23.25]) M('generator', lx - 0.03, yb + 0.22, lz - 0.03, lx + 0.03, yb + 0.32, lz + 0.03, 0x4a5056);
  A.rbox('generator', 'furniture_metal', -67.95, yb + 0.82, -23.5, 1.8, 1.0, 0.7, 0.04, 0x9b3328, { n: 2 });
  M('generator', -67.05, yb + 0.45, -23.36, -67.02, yb + 1.25, -23.3, 0xf0f0ea); M('generator', -67.052, yb + 0.6, -23.355, -67.018, yb + 0.85, -23.305, 0xe0782a);
  A.lathe('generator', 'furniture_metal', [[0, 0], [0.06, 0], [0.06, 0.04], [0.05, 0.05], [0, 0.05]], 12, -68.3, yb + 1.32, -23.5, 0x2a2d30);
  A.tube('generator', 'furniture_metal', V3(-67.4, yb + 1.32, -23.7), V3(-67.4, yc - 0.05, -23.7), 0.018, galv, { segs: 8, open: true });
  for (const [a, b] of [[V3(-68.85, yb + 0.4, -23.4), V3(-69.25, yb + 0.4, -23.4)], [V3(-69.25, yb + 0.4, -23.4), V3(-69.25, yb + 0.03, -23.4)], [V3(-69.25, yb + 0.03, -23.4), V3(-70.5, yb + 0.03, -23.4)], [V3(-70.5, yb + 0.03, -23.4), V3(-70.5, yb + 0.03, -19.62)], [V3(-70.5, yb + 0.03, -19.62), V3(-70.5, yb + 0.2, -19.62)]]) A.tube('generator', 'furniture_metal', a, b, 0.012, 0x8a6a3a, { segs: 6 });
  // marquage jaune au sol autour du groupe (0,5 m de dégagement)
  for (const [x0, z0, x1, z1] of [[-72.68, -20.18, -69.32, -20.1], [-72.68, -17.9, -69.32, -17.82], [-72.68, -20.1, -72.6, -17.9], [-69.4, -20.1, -69.32, -17.9]]) A.furn('generator', x0, yb, z0, x1, yb + 0.003, z1, 0xe8c21a, { collide: false });
  M('generator', -75.9, yb + 1.45, -19.75, -75.89, yb + 1.75, -19.45, 0xf2c230); // plaque de danger
  // ── TGBT : rangée d'armoires contre le mur est (portes, poignées, persiennes, socle, porte-étiquettes), tapis isolant ──
  world.physics.add(new Box(-66.8, yb, -9.25, -66.15, yb + 2.1, -4.35, LAYER.FURN));
  for (let k = 0; k < 6; k++) {
    const zc = -9.2 + 0.4 + k * 0.8, x0 = -66.75;
    M('electrical', x0 + 0.02, yb, zc - 0.39, -66.17, yb + 0.1, zc + 0.39, 0x2a2d30);
    A.rbox('electrical', 'furniture_metal', -66.46, yb + 1.05, zc, 0.58, 1.9, 0.78, 0.01, 0xc9cdd0);
    M('electrical', x0 - 0.01, yb + 0.14, zc - 0.37, x0, yb + 1.96, zc + 0.37, 0xbfc3c6);                 // porte
    M('electrical', x0 - 0.035, yb + 1.0, zc + 0.27, x0 - 0.01, yb + 1.18, zc + 0.3, 0x1f2224);            // poignée
    M('electrical', x0 - 0.012, yb + 1.7, zc - 0.15, x0 - 0.01, yb + 1.8, zc + 0.15, 0xf4f4f0);            // porte-étiquette
    for (const y0 of [yb + 0.22, yb + 1.78]) for (let j = 0; j < 4; j++) M('electrical', x0 - 0.014, y0 + j * 0.035, zc - 0.2, x0 - 0.01, y0 + j * 0.035 + 0.014, zc + 0.2, 0x7d8489);
    M('electrical', -66.72, yb + 2.0, zc - 0.36, -66.2, yb + 2.1, zc + 0.36, 0xb4b8bb);                     // chapeau (entrée des câbles)
  }
  A.furn('electrical', -72.0, yb, -11.6, -70.0, yb + 0.006, -10.6, 0x151515, { collide: false });
  for (let k = 0; k < 6; k++) A.furn('electrical', -71.95, yb + 0.006, -11.55 + k * 0.16, -70.05, yb + 0.008, -11.5 + k * 0.16, 0x232323, { collide: false });
  tray('electrical', false, -11.9, -6.95, -70.6, yc - 0.32);
  tray('electrical', true, -70.75, -66.45, -6.8, yc - 0.32);
  for (const s of [-1, 1]) M('electrical', -66.45 + s * 0.15 - 0.006, yb + 2.1, -6.806, -66.45 + s * 0.15 + 0.006, yc - 0.32, -6.794, galv); // descente vers les armoires
  for (let y = yb + 2.25; y < yc - 0.4; y += 0.3) M('electrical', -66.6, y, -6.806, -66.3, y + 0.012, -6.794, galv);
  for (let k = 0; k < 3; k++) A.tube('electrical', 'furniture', V3(-66.52 + k * 0.07, yb + 2.1, -6.78), V3(-66.52 + k * 0.07, yc - 0.29, -6.78), 0.014, [0x1a1a1a, 0x3a3a3a, 0x7a3a2a][k], { segs: 6, open: true });
  for (const s of [-1, 1]) M('electrical', -71.0 + s * 0.15 - 0.006, yb + 2.0, -11.9, -71.0 + s * 0.15 + 0.006, yc, -11.82, galv); // échelle verticale au-dessus du tableau
  for (let y = yb + 2.1; y < yc - 0.05; y += 0.3) M('electrical', -71.15, y, -11.9, -70.85, y + 0.012, -11.84, galv);
  for (let k = 0; k < 3; k++) A.tube('electrical', 'furniture', V3(-71.07 + k * 0.07, yb + 2.0, -11.86), V3(-71.07 + k * 0.07, yc - 0.3, -11.86), 0.014, [0x1a1a1a, 0x3a3a3a, 0x7a3a2a][k], { segs: 6, open: true });
  // ── régie : panneaux acoustiques (mur est), goulotte des baies vers le plafond ──
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) A.rbox('pa', 'furniture', -66.17, yb + 1.25 + j * 0.62, 0.55 + i * 0.62, 0.04, 0.6, 0.6, 0.012, (i + j) % 2 ? 0x2b2b2e : 0x333338, { n: 1 });
  M('pa', -75.5, yb + 1.9, -0.25, -75.2, yc, -0.05, galv);
  // ── chaufferie : départ et retour calorifugés au plafond (bagues alu, suspentes), gaz jaune au mur nord, vase
  //    d'expansion rouge sur console, siphon de sol ──
  for (const [zz, c] of [[12.55, 0xeeeeea], [12.25, 0xe6e6e2]]) {
    A.tube('boiler', 'furniture', V3(-75.9, yc - 0.3, zz), V3(-66.1, yc - 0.3, zz), 0.06, c, { segs: 12, open: true });
    for (let x = -75.2; x < -66.4; x += 1.0) A.lathe('boiler', 'furniture_metal', [[0.061, -0.012], [0.062, -0.01], [0.062, 0.01], [0.061, 0.012]], 12, x, yc - 0.3, zz, 0xc8ccd0, { rz: Math.PI / 2 });
    for (let x = -74.6; x < -66.4; x += 1.5) { M('boiler', x - 0.004, yc - 0.24, zz - 0.004, x + 0.004, yc, zz + 0.004, rod); A.lathe('boiler', 'furniture_metal', [[0.066, -0.012], [0.07, -0.012], [0.07, 0.012], [0.066, 0.012]], 12, x, yc - 0.3, zz, rod, { rz: Math.PI / 2 }); }
  }
  A.tube('boiler', 'furniture_metal', V3(-75.9, yb + 2.2, 12.82), V3(-73.2, yb + 2.2, 12.82), 0.02, 0xe8c21a, { segs: 8 });
  A.tube('boiler', 'furniture_metal', V3(-73.2, yb + 2.2, 12.82), V3(-73.2, yb, 12.82), 0.02, 0xe8c21a, { segs: 8 });
  A.lathe('boiler', 'furniture_metal', [[0, 0], [0.028, 0], [0.028, 0.06], [0, 0.06]], 10, -73.2, yb + 1.45, 12.82, 0xd4a017);
  M('boiler', -73.26, yb + 1.47, 12.62, -73.14, yb + 1.49, 12.82, 0xc62828); // poignée du robinet de gaz
  for (let x = -75.4; x < -73.3; x += 0.7) M('boiler', x - 0.015, yb + 2.17, 12.84, x + 0.015, yb + 2.23, 12.9, galv);
  A.lathe('boiler', 'furniture_metal', [[0, -0.32], [0.1, -0.31], [0.17, -0.27], [0.2, -0.2], [0.2, 0.2], [0.17, 0.27], [0.1, 0.31], [0, 0.32]], 16, -69.6, yb + 2.0, 12.6, 0xc62828);
  M('boiler', -69.75, yb + 1.64, 12.45, -69.45, yb + 1.68, 12.9, 0x5f666b); M('boiler', -69.62, yb + 1.4, 12.86, -69.58, yb + 1.64, 12.9, 0x5f666b); // console
  A.tube('boiler', 'furniture_metal', V3(-69.6, yb + 2.32, 12.6), V3(-69.6, yc - 0.36, 12.6), 0.012, 0xb87333, { segs: 6 });
  M('boiler', -70.73, yb, 8.27, -70.47, yb + 0.004, 8.53, 0x2a2d30);
  for (let k = 0; k < 5; k++) M('boiler', -70.71, yb + 0.004, 8.29 + k * 0.05, -70.49, yb + 0.006, 8.31 + k * 0.05, 0x55595c);
}

// ───────────────────────── PARKING ─────────────────────────
function buildGarage(world, A, door, dev, rng) {
  const g = world.game; const zn = 'garage'; const yb = -4.5, yc = -0.6;
  A.floor(zn, 'asphalt', -66, -24, 66, 24, yb, 0.4);
  A.slabWithHoles(zn, 'concrete', -66, -24, 66, 24, yc + 0.6, 0.6, [ELEV_HOLE], { faces: 'xXzZy' }); // plafond (trémie de l'ascenseur)
  A.wallX(zn, 'concrete_dark', -66, 66, -24.2, yb, yc, 0.4);
  A.wallX(zn, 'concrete_dark', -66, 66, 24.2, yb, yc, 0.4);
  // mur ouest : de z -24 à 13, le mur de parpaing des locaux techniques (x -66,15 … -65,85, porte de la chaufferie) sert
  // d'appui, avec un parement de béton côté parking découpé autour de l'huisserie (les deux murs se chevauchaient et
  // chacun montrait son matériau du mauvais côté) ; au nord, mur dans le même alignement (cage de l'escalier ouest)
  A.wallZ(zn, 'concrete_dark', 13, 24, -66, yb, yc, 0.3);
  for (const [z0, z1, y0] of [[-24, 8.935, yb], [10.265, 24, yb], [8.935, 10.265, yb + 2.165]]) A.box(zn, 'concrete_dark', -65.85, y0, z0, -65.84, yc, z1, { collide: false, faces: 'XzZ' });
  A.wallZ(zn, 'concrete_dark', -24, 24, 66.15, yb, yc, 0.3, [{ a: -7, b: -2, y0: yb, y1: yb + 3.4 }, { a: 8.6, b: 9.9, y0: yb, y1: yb + 2.2 }]);
  // piliers aux arêtes chanfreinées, soubassement peint, cornières de protection en caoutchouc (bandes réfléchissantes),
  // chapiteaux ; poutres de rive est-ouest sur les files de piliers (hors trémie de l'ascenseur)
  for (let x = -54; x <= 54; x += 12) for (const z of [-12, 0, 12]) {
    world.physics.add(new Box(x - 0.35, yb, z - 0.35, x + 0.35, yc, z + 0.35, LAYER.WALL));
    A.rbox(zn, 'concrete', x, (yb + yc) / 2, z, 0.7, yc - yb, 0.7, 0.025);
    A.rbox(zn, 'furniture', x, yb + 0.45, z, 0.712, 0.9, 0.712, 0.028, 0xd4a017);
    A.rbox(zn, 'concrete', x, yc - 0.11, z, 0.98, 0.22, 0.98, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // cornière en L : une aile sur chaque face
      const fx = x + sx * 0.356, fz = z + sz * 0.356, o = { collide: false, flat: true };
      for (const [y0, y1, c] of [[yb + 0.05, yb + 1.2, 0x161616], [yb + 0.32, yb + 0.4, 0xe8c21a], [yb + 0.82, yb + 0.9, 0xe8c21a]]) {
        const t = c === 0x161616 ? 0 : 0.002;
        A.box(zn, 'furniture', fx, y0, fz - sz * 0.11, fx + sx * (0.014 + t), y1, fz + sz * 0.014, { ...o, color: c });
        A.box(zn, 'furniture', fx - sx * 0.11, y0, fz, fx + sx * 0.014, y1, fz + sz * (0.014 + t), { ...o, color: c });
      }
    }
  }
  for (const z of [-12, 0, 12]) A.box(zn, 'concrete', -66, yc - 0.45, z - 0.25, 66, yc, z + 0.25, { collide: false });
  // marquages au sol
  for (let x = -60; x <= 60; x += 3) for (const [z0, z1] of [[-23.5, -18.5], [18.5, 23.5], [-11.5, -6.5], [6.5, 11.5]]) A.box(zn, 'furniture', x - 0.05, yb, z0, x + 0.05, yb + 0.005, z1, { collide: false, color: 0xe0e0e0, flat: true });
  for (let x = -62; x <= 62; x += 8) A.box(zn, 'furniture', x - 1.2, yb, -0.08, x + 1.2, yb + 0.005, 0.08, { collide: false, color: 0xffeb3b, flat: true });
  for (let x = -60; x <= 60; x += 12) for (const z of [-17, -5, 5, 17]) LP(A, zn, x, yc, z, 1.4, 0.2, (x / 12 + (z > 0 ? 1 : 0)) % 2 === 0);
  door('stE_B', { panic: true, zone: 'stairsE', x: 66.15, y: yb, z: 9.25, axis: 'z', width: 1.2, mat: 'metal', name: 'Escalier est — parking', gate: 'garage', swing: 1 });
  // rideau métallique de la rampe
  const gate = new Shutter(world, world.newId('shutter'), { zone: 'garage', x0: 66.1, x1: 66.1, z: 0, y0: yb, y1: yb + 3.4, closed: true, locked: true, garageGate: true });
  world.garageGate = gate;
  // Le Shutter est prévu pour un mur parallèle à X : on crée une variante tournée
  gate.mesh.geometry.dispose(); gate.mesh.geometry = sideShutter(A, 'garage', 66.1, -7, -2, yb, 3.4, -1);
  gate.mesh.position.set(66.1, yb + 1.7, -4.5); gate.o.x0 = 66; gate.o.x1 = 66.2; gate.o.z = -4.5; gate.cx = 66.1;
  gate.col.set(65.95, yb, -7, 66.25, yb + 3.4, -2); world.physics.update(gate.col);
  gate.setPick(65.9, yb, -7, 66.3, yb + 3.4, -2);
  gate.applyVisual = function () { const h = 3.4 * Math.max(0.03, this.pos01); this.mesh.scale.y = Math.max(0.03, this.pos01); this.mesh.position.y = yb + 3.4 - h / 2; this.col.enabled = this.pos01 > 0.55; this.col.min[1] = yb + 3.4 - h; world.physics.update(this.col); };
  gate.name = 'Rideau de la rampe du parking';
  gate.applyVisual(); world.add(gate);
  // rampe vers l'extérieur, partie couverte sous le hall (x 66 … 80) : 1,8 m de dénivelé, ce qui laisse 2,10 m sous la
  // dalle du hall ; la tranchée à ciel ouvert (x 80 … 98) est construite avec les abords (outside.js). Collision : marches
  // invisibles de 1 m ; surface visible lisse.
  A.stairs('ramp', 'asphalt', 66, -7, 'x+', 5, 14, 1.8, yb, 14, { solid: true, base: yb - 0.4, visible: false });
  rampSurface(A, 'ramp', 66, 80);
  for (const zw of [-7.2, -1.8]) A.wallX('ramp', 'concrete_dark', 66, 80.3, zw, yb, -0.6, 0.4);
  A.ceiling('ramp', 'concrete', 66, -7, 80, -2, -0.6, 0.6);
  // voitures
  const colors = [0x1565c0, 0xb71c1c, 0x2e7d32, 0x424242, 0xe0e0e0, 0x6a1b9a, 0xf9a825, 0x00695c];
  const spots = [[-49.5, -21], [-37.5, -21], [-10.5, -9], [16.5, 9], [31.5, 21], [-22.5, 9], [43.5, -9], [55.5, 21]];
  spots.forEach(([x, z], i) => dev('car', zn, x, yb + 0.72, z, z > 0 ? Math.PI : 0, { color: colors[i], plate: 'HL-' + (100 + i * 37) + '-' + 'ABCDEFGH'[i] + 'X', locked: i % 3 !== 1, alarm: i % 2 === 0 }));
  // caddies abandonnés, horodateur
  dev('shopping_cart', zn, -30, yb + 0.5, 3, 0.5, { prop: true }); dev('shopping_cart', zn, 20, yb + 0.5, -3, 2.2, { prop: true });
  // barrière levante de sortie (ouverte : lisse relevée), borne à lecteur de tickets, îlot béton
  world.physics.add(new Box(63.25, yb, -7.95, 63.75, yb + 1.1, -7.3, LAYER.FURN));
  A.rbox(zn, 'concrete', 63.5, yb + 0.06, -7.62, 0.7, 0.12, 0.8, 0.02);
  A.rbox(zn, 'furniture_metal', 63.5, yb + 0.6, -7.62, 0.34, 0.96, 0.3, 0.02, 0xe0b000, { n: 2 });
  A.furn(zn, 63.32, yb + 0.72, -7.47, 63.68, yb + 0.95, -7.465, 0x1a1a1a, { collide: false });
  A.lathe(zn, 'furniture_metal', [[0, 0], [0.07, 0], [0.07, 0.12], [0, 0.12]], 12, 63.5, yb + 1.0, -7.62, 0x3a3a3a, { rx: Math.PI / 2 });
  { const a = Math.PI / 3, p0 = V3(63.5, yb + 1.0, -7.5), d = V3(0, Math.sin(a), Math.cos(a));
    for (let k = 0; k < 8; k++) A.beam(zn, 'furniture', p0.clone().addScaledVector(d, k * 0.4), p0.clone().addScaledVector(d, (k + 1) * 0.4), 0.06, 0.09, k % 2 ? 0xf2f2f2 : 0xd32f2f);
    world.physics.add(new Box(63.46, yb + 1.0, -7.5, 63.54, yb + 2.0, -6.92, LAYER.FURN)); } // bas de la lisse (à hauteur de tête)
  // caisse automatique (façade vers l'allée) : socle, caisson laqué, auvent incliné, écran, clavier, fentes, bandeau ;
  // à 0,8 m de l'allée transversale x = 60 (elle était posée sur son bord)
  world.physics.add(new Box(60.8, yb, 2, 61.8, yb + 1.6, 2.6, LAYER.FURN)); world.physics.add(new Box(60.77, yb + 1.45, 1.86, 61.83, yb + 1.66, 2.62, LAYER.FURN)); // auvent incliné
  A.furn(zn, 60.85, yb, 2.05, 61.75, yb + 0.1, 2.55, 0x1a1a1a, { collide: false });
  A.rbox(zn, 'furniture_metal', 61.3, yb + 0.8, 2.3, 1.0, 1.4, 0.6, 0.03, 0x37474f, { n: 2 });
  A.rbox(zn, 'furniture_metal', 61.3, yb + 1.56, 2.24, 1.06, 0.06, 0.74, 0.02, 0x263238, { rx: 0.18 });
  A.furn(zn, 60.95, yb + 0.2, 1.995, 61.65, yb + 1.45, 2.0, 0x4f6470, { metal: true, collide: false });
  A.furn(zn, 61.05, yb + 1.12, 1.99, 61.55, yb + 1.38, 1.995, 0x0c1418, { collide: false });
  for (let k = 0; k < 12; k++) A.furn(zn, 61.08 + (k % 3) * 0.06, yb + 0.86 + Math.floor(k / 3) * 0.05, 1.985, 61.12 + (k % 3) * 0.06, yb + 0.9 + Math.floor(k / 3) * 0.05, 1.995, 0xd0d4d6, { collide: false });
  for (const [yy, w, c] of [[1.0, 0.12, 0x111111], [0.86, 0.1, 0x111111], [0.6, 0.2, 0x111111]]) A.furn(zn, 61.4, yb + yy, 1.985, 61.4 + w, yb + yy + 0.015, 1.995, c, { collide: false });
  A.furn(zn, 60.95, yb + 1.42, 1.99, 61.65, yb + 1.45, 1.995, 0x1e88e5, { collide: false });
  dev('extinguisher_box', zn, -65.715, yb + 1, 0, Math.PI / 2); // contre le parement (x = -65,84)
  dev('fire_alarm', zn, -65.815, yb + 1.4, 2, Math.PI / 2);
  buildGarageDecor(world, A, dev, rng.fork('garagedecor'));
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
  dock.mesh.geometry.dispose(); dock.mesh.geometry = sideShutter(A, zn, -112.1, -12, -8, 0, 4.2, 1); dock.mesh.position.set(-112.1, 2.1, -10);
  dock.col.set(-112.3, 0, -12, -111.9, 4.2, -8); world.physics.update(dock.col); dock.setPick(-112.4, 0, -12, -111.8, 4.2, -8);
  dock.applyVisual = function () { const h = 4.2 * Math.max(0.03, this.pos01); this.mesh.scale.y = Math.max(0.03, this.pos01); this.mesh.position.y = 4.2 - h / 2; this.col.enabled = this.pos01 > 0.55; this.col.min[1] = 4.2 - h; world.physics.update(this.col); };
  dock.name = 'Porte du quai de chargement'; dock.applyVisual(); world.add(dock);
  for (let x = -108; x <= -84; x += 8) for (const z of [-20, -10, 0]) LP(A, zn, x, yc, z, 0.6, 0.6, (x + z) % 16 === 0);
  // racks
  for (const z of [-21, -14, -3]) {
    for (let i = 0; i < 3; i++) {
      const x0 = -108 + i * 7.5;
      // niveaux : lisses avant et arrière orange, platelage grillagé (collisions d'origine : plateaux pleins)
      for (const yy of [0.1, 2.4, 4.7]) {
        world.physics.add(new Box(x0, yy, z, x0 + 7, yy + 0.12, z + 1.2, LAYER.FURN));
        for (const zz of [z, z + 1.12]) A.furn(zn, x0, yy, zz, x0 + 7, yy + 0.12, zz + 0.08, 0xff6f00, { metal: true, collide: false });
        A.furn(zn, x0 + 0.02, yy + 0.09, z + 0.08, x0 + 6.98, yy + 0.115, z + 1.12, 0x8a9196, { metal: true, collide: false });
        for (let k = 1; k < 14; k++) A.furn(zn, x0 + k * 0.5 - 0.01, yy + 0.115, z + 0.08, x0 + k * 0.5 + 0.01, yy + 0.12, z + 1.12, 0x6d7378, { metal: true, collide: false });
      }
      // échelles : montants perforés sur platines, entretoises en zigzag
      for (const xx of [x0, x0 + 3.45, x0 + 6.9]) {
        for (const zz of [z, z + 1.1]) { A.furn(zn, xx, 0, zz, xx + 0.1, 6.2, zz + 0.1, 0x1565c0, { metal: true, collide: false }); A.furn(zn, xx - 0.03, 0, zz - 0.03, xx + 0.13, 0.012, zz + 0.13, 0x3a3f43, { metal: true, collide: false }); }
        for (let k = 0; k < 6; k++) { const ya = 0.3 + k * 0.95; A.tube(zn, 'furniture_metal', V3(xx + 0.05, ya, z + 0.1), V3(xx + 0.05, ya + 0.95, z + 1.1), 0.018, 0x1565c0, { segs: 6 }); A.tube(zn, 'furniture_metal', V3(xx + 0.05, ya, z + 0.1), V3(xx + 0.05, ya, z + 1.1), 0.018, 0x1565c0, { segs: 6 }); }
      }
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
  dev('extinguisher_box', zn, -80.525, 1.0, -18, -Math.PI / 2);
}

// ───────────────────────── TOIT ─────────────────────────
function buildRoof(world, A, door, dev, rng) {
  const zn = 'roof'; const y = 10.5;
  // dalle de toit (dessus) avec la trémie de la verrière (toute la longueur des galeries) et la cage d'escalier
  A.slabWithHoles(zn, 'asphalt', -80.4, -25.4, 80.4, 25.4, y, 0.5, [{ x0: -64, z0: -VOID_Z, x1: 64, z1: VOID_Z }, { x0: -76, z0: 13, x1: -66, z1: 22 }], { faces: 'xXzZY' });
  // acrotère
  A.wallX(zn, 'block_dark', -80.6, 80.6, -25.5, y, y + 1.1, 0.3); A.wallX(zn, 'block_dark', -80.6, 80.6, 25.5, y, y + 1.1, 0.3);
  A.wallZ(zn, 'block_dark', -25.5, 25.5, -80.5, y, y + 1.1, 0.3); A.wallZ(zn, 'block_dark', -25.5, 25.5, 80.5, y, y + 1.1, 0.3);
  // costière autour de la trémie + verrière à deux pans
  A.wallX(zn, 'steel_dark', -64.25, 64.25, -VOID_Z - 0.12, y, y + 0.6, 0.24); A.wallX(zn, 'steel_dark', -64.25, 64.25, VOID_Z + 0.12, y, y + 0.6, 0.24);
  A.wallZ(zn, 'steel_dark', -VOID_Z, VOID_Z, -64.12, y, y + 0.6, 0.24); A.wallZ(zn, 'steel_dark', -VOID_Z, VOID_Z, 64.12, y, y + 0.6, 0.24);
  // bavettes de la costière (relevé d'étanchéité) et couvertine de la cage d'escalier
  for (const s of [-1, 1]) A.box(zn, 'aluminium', -64.3, y, Math.min(s * (VOID_Z + 0.24), s * (VOID_Z + 0.27)), 64.3, y + 0.25, Math.max(s * (VOID_Z + 0.24), s * (VOID_Z + 0.27)), { collide: false });
  for (const [a, b, c, d] of [[-76.25, 12.75, -65.75, 12.9], [-76.25, 22.1, -65.75, 22.25], [-76.25, 12.9, -76.1, 22.1], [-65.9, 12.9, -65.75, 22.1]]) A.box(zn, 'aluminium', a, 13.9, b, c, 13.95, d, { collide: false });
  buildGlassRoof(world, A, y + 0.6);
  world.skylightPanes = [];
  // centrales de traitement d'air en toiture : châssis en profilés, caisson à panneaux (joints, portes de visite à
  // poignées), batteries à ailettes derrière des persiennes, deux ventilateurs à grille et pales, coffret électrique,
  // gaines de soufflage et de reprise plongeant dans des costières
  const PAN = latheGeo([[0.36, 0], [0.42, 0], [0.42, 0.1], [0.4, 0.12]], 20), RING = latheGeo([[0.36, 0.13], [0.37, 0.13], [0.37, 0.135], [0.36, 0.135]], 20);
  for (const [x, z] of [[-50, -15], [-35, 15], [40, -15], [55, 19], [5, 18], [-10, -18]]) {
    const F = (a, b, c, d, e, f, col, metal = true) => A.furn(zn, x + a, y + b, z + c, x + d, y + e, z + f, col, { metal, collide: false });
    world.physics.add(new Box(x - 1.5, y, z - 1, x + 1.5, y + 1.6, z + 1, LAYER.FURN));
    for (const sz of [-1, 1]) F(-1.5, 0, sz * 0.85 - 0.06, 1.5, 0.12, sz * 0.85 + 0.06, 0x6d7276);
    A.rbox(zn, 'furniture_metal', x, y + 0.84, z, 3.0, 1.44, 2.0, 0.025, 0xb7c2c8, { n: 2 });
    for (const u of [-0.75, 0, 0.75]) for (const sz of [-1, 1]) F(u - 0.004, 0.16, sz * 1.0 - 0.002, u + 0.004, 1.52, sz * 1.0 + 0.002, 0x7f8a90);
    for (const sz of [-1, 1]) for (const u of [-1.1, -0.35]) { F(u - 0.004, 0.25, sz * 1.003 - 0.002, u + 0.3, 1.4, sz * 1.003 + 0.002, 0xc3cdd2); F(u + 0.25, 0.75, sz * 1.012 - 0.008, u + 0.27, 0.9, sz * 1.012 + 0.008, 0x2b2f33); }
    for (const sx of [-1, 1]) for (let k = 0; k < 11; k++) F(sx * 1.5 - 0.012, 0.25 + k * 0.105, -0.85, sx * 1.5 + 0.012, 0.29 + k * 0.105, 0.85, 0x5f686e);
    for (const fx of [-0.72, 0.72]) {
      A.shapeM(zn, 'furniture_metal', PAN, trs(x + fx, y + 1.56, z), 0x3d4448); A.shapeM(zn, 'furniture_metal', RING, trs(x + fx, y + 1.56, z), 0x2a2e31);
      for (let k = 0; k < 4; k++) A.beam(zn, 'furniture_metal', V3(x + fx, y + 1.695, z), V3(x + fx + Math.cos(k * Math.PI / 2) * 0.37, y + 1.695, z + Math.sin(k * Math.PI / 2) * 0.37), 0.012, 0.008, 0x2a2e31);
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 0.4; A.rbox(zn, 'furniture_metal', x + fx + Math.cos(a) * 0.18, y + 1.64, z + Math.sin(a) * 0.18, 0.3, 0.008, 0.1, 0.003, 0x52595e, { ry: -a, rx: 0.3 }); }
      A.lathe(zn, 'furniture_metal', [[0, 0], [0.07, 0], [0.07, 0.08], [0, 0.09]], 10, x + fx, y + 1.58, z, 0x222629);
    }
    F(1.2, 0.4, 1.0, 1.45, 0.85, 1.14, 0x9aa5ab); F(1.3, 0.12, 1.07, 1.34, 0.4, 1.11, 0x3a3a3a, false); world.physics.add(new Box(x + 1.2, y, z + 1.0, x + 1.45, y + 0.85, z + 1.14, LAYER.FURN)); // coffret électrique
    // gaines : départ latéral, coude, chute dans une costière ; brides tous les mètres
    for (const [dz, w] of [[-0.45, 0.6], [0.45, 0.5]]) {
      F(-2.4, 1.0 - w / 2 + 0.1, dz - 0.22, -1.5, 1.0 + w / 2 - 0.1, dz + 0.22, 0xa8b2b8); F(-2.85, -0.05, dz - 0.22, -2.4, 1.0 + w / 2 - 0.1, dz + 0.22, 0xa8b2b8);
      F(-3.05, 0, dz - 0.32, -2.2, 0.25, dz + 0.32, 0x7f8a90);
      for (const fxx of [-1.55, -2.0]) F(fxx - 0.02, 1.0 - w / 2 + 0.07, dz - 0.25, fxx + 0.02, 1.0 + w / 2 - 0.07, dz + 0.25, 0x8d979d);
      F(-2.88, 0.55, dz - 0.25, -2.37, 0.59, dz + 0.25, 0x8d979d);
    }
    world.physics.add(new Box(x - 3.05, y, z - 0.8, x - 1.5, y + 1.3, z + 0.8, LAYER.FURN)); // gaines : obstacle bas
  }
  // mât d'antennes : tube sur platine, haubans, panneaux et parabole, balise rouge
  world.physics.add(new Box(60.8, y, -20.2, 61.2, y + 9, -19.8, LAYER.FURN));
  A.lathe(zn, 'furniture_metal', [[0, 0], [0.3, 0], [0.3, 0.02], [0.08, 0.04], [0, 0.04]], 12, 61, y, -20, 0x7d8387);
  A.tube(zn, 'furniture_metal', V3(61, y, -20), V3(61, y + 9, -20), 0.05, 0x9e9e9e, { segs: 10, r1: 0.035 });
  for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + 0.3; A.tube(zn, 'furniture_metal', V3(61, y + 6.2, -20), V3(61 + Math.cos(a) * 3.2, y + 0.05, -20 + Math.sin(a) * 3.2), 0.006, 0x8d9297, { segs: 4, open: true }); A.lathe(zn, 'furniture_metal', [[0, 0], [0.1, 0], [0.1, 0.05], [0, 0.05]], 8, 61 + Math.cos(a) * 3.2, y, -20 + Math.sin(a) * 3.2, 0x6d7276); }
  for (const [h, a] of [[7.2, 0], [7.2, Math.PI * 0.66], [7.2, -Math.PI * 0.66]]) A.rbox(zn, 'furniture', 61 + Math.cos(a) * 0.12, y + h, -20 + Math.sin(a) * 0.12, 0.08, 1.2, 0.26, 0.02, 0xe8e8e6, { ry: -a });
  A.lathe(zn, 'furniture', [[0, 0], [0.32, 0.12], [0.36, 0.16]], 16, 61.25, y + 5.2, -20, 0xdcdcdc, { rz: -Math.PI / 2 });
  A.lathe(zn, 'furniture', [[0, 0], [0.04, 0], [0.04, 0.08], [0.03, 0.1], [0, 0.1]], 8, 61, y + 9, -20, 0xd32f2f);
  // couvertines des acrotères, chapeaux de ventilation, crapaudines, paratonnerres
  for (const [x0, z0, x1, z1] of [[-80.7, -25.7, 80.7, -25.3], [-80.7, 25.3, 80.7, 25.7], [-80.7, -25.3, -80.3, 25.3], [80.3, -25.3, 80.7, 25.3]]) A.box(zn, 'aluminium', x0, y + 1.1, z0, x1, y + 1.14, z1, { collide: false });
  for (const [x, z] of [[-60, 10], [-22, -10], [18, 9], [33, 21], [-64, -20], [70, -16]]) { A.tube(zn, 'furniture_metal', V3(x, y, z), V3(x, y + 0.7, z), 0.06, 0x8f969b, { segs: 10, open: true }); A.lathe(zn, 'furniture_metal', [[0.02, 0.62], [0.16, 0.7], [0.16, 0.74], [0, 0.82]], 12, x, y, z, 0x8f969b); world.physics.add(new Box(x - 0.16, y, z - 0.16, x + 0.16, y + 0.82, z + 0.16, LAYER.FURN)); }
  for (const [x, z] of [[-40, -21], [0, 21], [40, 21], [-20, 21], [20, -21], [60, -21]]) A.lathe(zn, 'furniture', [[0, 0.09], [0.12, 0.06], [0.16, 0.02], [0.2, 0.0]], 10, x, y, z, 0x2a2a2a);
  for (let x = -75; x <= 75; x += 25) for (const z of [-25.5, 25.5]) A.tube(zn, 'furniture_metal', V3(x, y + 1.14, z), V3(x, y + 1.9, z), 0.008, 0xb08d57, { segs: 5 });
  world.points.antenna = new THREE.Vector3(61, y + 9.2, -20);
  dev('extinguisher_box', zn, -80.225, y + 0.36, 15, Math.PI / 2); // posée sur la dalle, contre l'acrotère (face à x = -80,35)
  // potence de la caméra du toit (cam_roof, à côté de la cage d'escalier : rien au-dessus pour la suspendre) : bras
  // horizontal du haut du support de la caméra jusqu'au mur sud de la cage, platine murale
  A.furn(zn, -75.535, 13.385, 12.56, -75.505, 13.415, 12.9, 0x8a8f93, { metal: true, collide: false });
  A.furn(zn, -75.58, 13.34, 12.885, -75.46, 13.46, 12.9, 0x6d7276, { metal: true, collide: false });
  world.points.roof = new THREE.Vector3(-70, y, 0);
}

// ───────────────────────── VERRIÈRE À DEUX PANS ─────────────────────────
// Toute la longueur des galeries (x -64 … 64) au-dessus du vide central : fermes métalliques tous les 4 m
// (arbalétriers, entrait, poinçon, contrefiches), pannes, faîtage, chéneaux, vitrages et pignons vitrés.
function quadGeo(p) { // 4 points (sens trigonométrique vu de l'extérieur)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1].slice(0, p.length * 2), 2));
  g.setIndex(p.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]); g.computeVertexNormals(); return g;
}
function buildGlassRoof(world, A, y0) {
  const W = VOID_Z, yr = y0 + 2.75, X0 = -64, X1 = 64, I = new THREE.Matrix4();
  const zoneAt = (x) => galZone(x, 1);
  const L = Math.hypot(W, yr - y0), ang = Math.asin((yr - y0) / L);
  const beam = (zone, mat, cx, cy, cz, sx, sy, sz, rx = 0, rz = 0, color = 0xffffff) => A.shape(zone, mat, new THREE.BoxGeometry(1, 1, 1), new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz)), color);
  // fermes : arbalétriers en IPE (âme, semelles) sous le vitrage, entrait en tirant rond à ridoir et chapes, poinçon et
  // contrefiches en tubes ronds, goussets boulonnés au faîtage et aux appuis
  const IPE = [[-0.07, -0.26], [0.07, -0.26], [0.07, -0.246], [0.0045, -0.246], [0.0045, -0.034], [0.07, -0.034], [0.07, -0.02], [-0.07, -0.02], [-0.07, -0.034], [-0.0045, -0.034], [-0.0045, -0.246], [-0.07, -0.246]];
  for (let x = X0; x <= X1 + 0.01; x += 4) {
    const zn = zoneAt(x), yt = y0 + 0.05, foot = [];
    for (const sg of [-1, 1]) {
      const s0 = V3(x, y0, sg * W), ez = V3(0, yr - y0, -sg * W).normalize(), ex = V3(-sg, 0, 0), ey = ez.clone().cross(ex);
      const m = new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(s0);
      A.plate(zn, 'steel', IPE, 0, L, 0xffffff, { m });                                                               // arbalétrier
      const mid = s0.clone().addScaledVector(ez, L * 0.5).addScaledVector(ey, -0.26);
      A.tube(zn, 'steel', V3(x, yt, 0), mid, 0.03, 0xffffff, { segs: 8 });                                              // contrefiche
      A.box(zn, 'steel', x - 0.006, y0 - 0.02, sg * (W - 0.02) - 0.15, x + 0.006, y0 + 0.16, sg * (W - 0.02) + 0.15, { collide: false }); // gousset d'appui
      foot.push(V3(x, yt, sg * (W - 0.14)));
      A.box(zn, 'steel', x - 0.02, yt - 0.03, sg * (W - 0.14) - 0.05, x + 0.02, yt + 0.03, sg * (W - 0.14) + 0.05, { collide: false }); // chape
    }
    A.tube(zn, 'steel', foot[0], foot[1], 0.02, 0xffffff, { segs: 8 });                                                  // tirant
    A.lathe(zn, 'steel', [[0.02, -0.17], [0.034, -0.13], [0.034, 0.13], [0.02, 0.17]], 10, x, yt, 0, 0xffffff, { rx: Math.PI / 2 }); // ridoir
    A.tube(zn, 'steel', V3(x, yt, 0), V3(x, yr - 0.2, 0), 0.05, 0xffffff, { segs: 12 });                               // poinçon
    A.box(zn, 'steel', x - 0.006, yr - 0.5, -0.22, x + 0.006, yr - 0.06, 0.22, { collide: false });                     // gousset de faîtage
  }
  // pannes, faîtage, chéneaux, montants des vitrages (par zone)
  for (const [x0, x1] of [[X0, -24], [-24, 24], [24, X1]]) {
    const zn = zoneAt((x0 + x1) / 2), len = x1 - x0, cx = (x0 + x1) / 2;
    for (const t of [0.34, 0.68]) for (const sg of [-1, 1]) beam(zn, 'steel', cx, y0 + (yr - y0) * t - 0.12, sg * W * (1 - t), len, 0.12, 0.1, sg < 0 ? -ang : ang);
    beam(zn, 'steel', cx, yr - 0.05, 0, len, 0.16, 0.22); // faîtage
    for (const sg of [-1, 1]) { beam(zn, 'steel_dark', cx, y0 - 0.05, sg * (W + 0.06), len, 0.16, 0.3); } // chéneaux
    for (let x = x0 + 1; x < x1 - 0.5; x += 1) for (const sg of [-1, 1]) beam(zn, 'aluminium', x, (y0 + yr) / 2 + 0.02, sg * W / 2, 0.04, 0.05, L, sg < 0 ? -ang : ang);
    // vitrages : deux pans
    A.shape(zn, 'glass_roof', quadGeo([[x1, y0, -W], [x0, y0, -W], [x0, yr, 0], [x1, yr, 0]]), I); // normales vers l'extérieur
    A.shape(zn, 'glass_roof', quadGeo([[x0, y0, W], [x1, y0, W], [x1, yr, 0], [x0, yr, 0]]), I);
  }
  // pignons vitrés
  for (const xe of [X0, X1]) {
    const zn = zoneAt(xe);
    A.shape(zn, 'glass_roof', quadGeo(xe < 0 ? [[xe, y0, -W], [xe, y0, W], [xe, yr, 0]] : [[xe, y0, W], [xe, y0, -W], [xe, yr, 0]]), I);
    for (const sg of [-1, 0, 1]) if (sg) beam(zn, 'aluminium', xe, (y0 + yr) / 2 - 0.3, sg * W * 0.5, 0.05, (yr - y0) * 0.5, 0.05);
  }
  // collision : on ne marche pas sur la verrière (et les objets lancés rebondissent dessus)
  world.physics.add(new Box(X0 - 0.1, YR, -W - 0.1, X1 + 0.1, yr + 0.3, W + 0.1, LAYER.GLASS));
  world.points.glassRoof = { x0: X0, x1: X1, w: W, y0, yr };
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

// ───────────────────────── CAMÉRAS DE ZONES ─────────────────────────
function defineAreaCameras(world) {
  const C = (id, name, area, zone, pos, yaw, pitch = -0.35, fov = 70) => world.cameras.push({ id, name, area, zone, pos: new THREE.Vector3(...pos), yaw, pitch, fov });
  C('cam_g0w', 'Galerie RDC ouest', 'gallery0', 'gallery0_w', [-65.3, 4.2, -7.2], -Math.PI / 2 - 0.25, -0.3, 75);
  C('cam_g0e', 'Galerie RDC est', 'gallery0', 'gallery0_e', [65.3, 4.2, 7.2], Math.PI / 2 - 0.25, -0.3, 75);
  C('cam_atrium', 'Atrium', 'gallery0', 'atrium', [-23.5, 9.6, -7.5], -Math.PI * 0.75 - 0.4, -0.45, 80);
  C('cam_entrance', 'Hall d\'entrée', 'entrance', 'entrance', [67, 4.2, -7.4], Math.PI * 0.75 + 0.2, -0.35, 80);
  C('cam_g1w', 'Galerie étage ouest', 'gallery1', 'gallery1_w', [-65.3, 9.6, 7.2], -Math.PI / 2 + 0.25, -0.3, 75);
  C('cam_g1e', 'Galerie étage est', 'gallery1', 'gallery1_e', [65.3, 9.6, -7.2], Math.PI / 2 + 0.25, -0.3, 75);
  // (hauteurs : le bras de fixation de la caméra touche le plafond, ou le dessous de la poutre pour la rampe)
  C('cam_svc_s', 'Couloir de service sud', 'service', 'service_s0', [-75.5, 4.4, -22.4], -Math.PI / 2, -0.25, 60);
  C('cam_svc_n', 'Couloir de service nord', 'service', 'service_n0', [79.5, 4.4, 22.4], Math.PI / 2, -0.25, 60);
  C('cam_garage1', 'Parking — ouest', 'garage', 'garage', [-65.4, -0.8, -23.5], -Math.PI * 0.75, -0.3, 80);
  C('cam_garage2', 'Parking — est', 'garage', 'garage', [65.5, -0.8, 23.5], Math.PI * 0.25, -0.3, 80);
  C('cam_ramp', 'Rideau de la rampe', 'garage', 'garage', [60, -1.25, -12], Math.PI * 0.62, -0.25, 70);
  C('cam_basement', 'Couloir technique', 'basement', 'westwingB', [-79.4, -0.8, 21.5], 0, -0.3, 70);
  C('cam_gen', 'Groupe électrogène', 'basement', 'generator', [-66.6, -0.81, -12.6], -Math.PI * 0.25, -0.45, 75);
  C('cam_vent_s', 'Conduit sud', 'vents', 'vent_s', [-77.5, 4.25, -23.5], -Math.PI / 2, -0.05, 60);
  C('cam_vent_w', 'Conduit ouest', 'vents', 'vent_w', [-78.5, 4.25, -23], Math.PI, -0.05, 60);
  C('cam_roof', 'Toit', 'roof', 'roof', [-75.5, 13.2, 12.6], -Math.PI * 0.8, -0.35, 80);
  C('cam_warehouse', 'Entrepôt', 'warehouse', 'warehouse', [-80.8, 7.8, 4.6], -Math.PI * 0.25, -0.4, 80);
  C('cam_dock', 'Quai de chargement', 'warehouse', 'warehouse', [-111.6, 7.8, -24.6], Math.PI * 0.75 + 0.4, -0.4, 75);
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
      if (f === 0 ? (Math.abs(x) > 24 || Math.abs(x) === 9) : BRIDGES_X.includes(x)) L(`g${f}n${x}`, `g${f}s${x}`);
    }
  }
  // escalators : nœud d'approche devant la barrière « étage fermé », peignes bas et haut (le trajet suit la ligne des
  // marches à ±10 cm), palier de l'étage ; les liens vers les voies de la galerie contournent les têtes de balustrade
  for (const [k, s, zl] of [['W', -1, -1.6], ['E', 1, 1.6]]) {
    const top = s < 0 ? 'gallery1_w' : 'gallery1_e';
    N(`esc${k}0`, s * 12.9, 0, zl, 'atrium'); N(`esc${k}b`, s * 15, 0.1, zl, 'atrium'); N(`esc${k}t`, s * 24, 5.1, zl, 'atrium'); N(`esc${k}1`, s * 25.6, 5, zl, top);
    L(`esc${k}0`, `esc${k}b`); L(`esc${k}b`, `esc${k}t`, { escalator: k }); L(`esc${k}t`, `esc${k}1`);
    for (const sz of [-1, 1]) { const id = `esc${k}0${sz < 0 ? 's' : 'n'}`; N(id, s * 12.7, 0, sz * 3.6, 'atrium'); L(`esc${k}0`, id); L(id, `g0${sz < 0 ? 's' : 'n'}${s * 15}`); }
    L(`esc${k}1`, `g1s${s * 27}`); L(`esc${k}1`, `g1n${s * 27}`);
  }
  // poste de sécurité : le bureau se contourne par le nord (porte arrière, vestiaire) et par le sud (réserve) ; chaque
  // porte est franchie dans l'axe de son ouverture
  N('sec_out', -64.2, 0, 0, 'gallery0_w'); N('sec_in', -67.6, 0, 0, 'security', ['security']); N('sec_desk', -70.8, 0, -0.6, 'security', ['security', 'desk']); N('sec_rear', -75.2, 0, 3.25, 'security');
  N('sec_n', -71.3, 0, 3.4, 'security'); N('sec_nw', -73, 0, 3.7, 'security'); N('sec_s', -71.3, 0, -3.4, 'security'); N('sec_sw', -73, 0, -3.7, 'security');
  L('sec_out', 'g0n-63'); L('sec_out', 'g0s-63');
  L('sec_out', 'sec_in', { door: doors.sec_front.id }); L('sec_in', 'sec_desk'); L('sec_desk', 'sec_n'); L('sec_n', 'sec_nw'); L('sec_nw', 'sec_rear'); L('sec_desk', 'sec_s'); L('sec_s', 'sec_sw');
  N('vest', -70.6, 0, 8.6, 'vestiaire'); N('vest_d', -73, 0, 6.2, 'vestiaire'); N('store', -71, 0, -13, 'secstore'); N('store_d', -73, 0, -6.2, 'secstore');
  L('sec_nw', 'vest_d', { door: doors.sec_vest.id }); L('vest_d', 'vest'); L('sec_sw', 'store_d', { door: doors.sec_store.id }); L('store_d', 'store');
  // aile ouest : nœuds tous les 4 m environ, plus un nœud dans l'axe de chaque porte (réserve, poste, escalier, entrepôt,
  // administration)
  const wwStops = [[-23, -19, -15, -13, -7, -3, 3, 5, 9, 13, 17.75, 21], [-23, -19, -15, -11, -7, -3, 0, 5, 9, 13, 17.75, 21]];
  wwStops.forEach((zs, f) => zs.forEach((z, i) => { N(`ww${f}_${z}`, -78, f * 5, z, `westwing${f}`); if (i) L(`ww${f}_${zs[i - 1]}`, `ww${f}_${z}`); }));
  L('sec_rear', 'ww0_3', { door: doors.sec_back.id }); L('store', 'ww0_-13', { door: doors.store_ww.id });
  // couloirs de service
  for (const [f, y] of [[0, 0], [1, 5]]) for (const side of ['s', 'n']) {
    const zc = side === 's' ? -23.5 : 23.5;
    for (let x = -75; x <= 78; x += 6) { N(`sv${f}${side}${x}`, x, y, zc, `service_${side}${f}`); if (x > -75) L(`sv${f}${side}${x - 6}`, `sv${f}${side}${x}`); }
    L(`sv${f}${side}-75`, `ww${f}_${side === 's' ? -23 : 21}`);
  }
  // escalier ouest : volées le long des faces nord et sud du noyau plein, paliers intermédiaires à l'est (x -68 … -66) ;
  // on traverse le palier intermédiaire au lieu du noyau
  const sw = [[-4.5, 'B'], [0, '0'], [5, '1'], [10.5, 'R']];
  for (const [y, k] of sw) N(`stW${k}`, -74.8, y, 17.75, 'stairsW');
  // nœuds au milieu du premier et du dernier giron de chaque volée : la hauteur interpolée suit la ligne des marches, à
  // une demi-contremarche près (les présences ne s'enfoncent plus dans les volées)
  const swMid = (a, b, y0, y1) => {
    const h = (y1 - y0) / 2, n = Math.round(h / 0.25), sd = 5.5 / n, sr = h / n;
    N(`stW${a}l`, -74.3, y0, 15.0, 'stairsW'); // sur le palier, à l'écart du bout de la main courante (côté noyau)
    N(`stW${a}a`, -73.5 + sd / 2, y0 + sr, 14.4, 'stairsW'); N(`stW${a}a2`, -68 - sd / 2, y0 + h, 14.4, 'stairsW');
    N(`stW${a}b`, -67.3, y0 + h, 14.4, 'stairsW'); N(`stW${a}c`, -67.3, y0 + h, 20.6, 'stairsW');
    N(`stW${a}d`, -68 - sd / 2, y0 + h + sr, 20.6, 'stairsW'); N(`stW${a}d2`, -73.5 + sd / 2, y1, 20.6, 'stairsW');
    nav.chain([`stW${a}`, `stW${a}l`, `stW${a}a`, `stW${a}a2`, `stW${a}b`, `stW${a}c`, `stW${a}d`, `stW${a}d2`, `stW${b}`]);
  };
  swMid('B', '0', -4.5, 0); swMid('0', '1', 0, 5); swMid('1', 'R', 5, 10.5);
  L('stW0', 'ww0_17.75', { door: doors.stW_0.id }); L('stW1', 'ww1_17.75', { door: doors.stW_1.id });
  // sous-sol : couloir technique, un nœud dans l'axe de chaque porte
  [-23, -18, -15, -11, -7, -3, 2, 5, 9.5, 13, 17.75, 21].forEach((z, i, zs) => { N(`wwB_${z}`, -78, -4.5, z, 'westwingB'); if (i) L(`wwB_${zs[i - 1]}`, `wwB_${z}`); });
  L('stWB', 'wwB_17.75', { door: doors.stW_B.id });
  N('genr', -71, -4.5, -17.5, 'generator'); N('elecr', -71, -4.5, -7, 'electrical'); N('par', -71, -4.5, 2, 'pa'); N('boilr', -71, -4.5, 9.5, 'boiler');
  L('genr', 'wwB_-18', { door: doors.gen.id }); L('elecr', 'wwB_-7', { door: doors.elec.id }); L('par', 'wwB_2', { door: doors.pa.id }); L('boilr', 'wwB_9.5', { door: doors.boiler.id });
  N('b13n', -84, -4.5, -7, 'b13'); L('b13n', 'wwB_-7', { door: doors.b13.id });
  // parking
  for (let x = -60; x <= 60; x += 12) for (const z of [-6, 6]) { N(`gar${x}_${z}`, x, -4.5, z, 'garage'); }
  for (let x = -60; x <= 60; x += 12) { L(`gar${x}_-6`, `gar${x}_6`); if (x > -60) { L(`gar${x - 12}_-6`, `gar${x}_-6`); L(`gar${x - 12}_6`, `gar${x}_6`); } }
  N('gar_w', -64, -4.5, 9.6, 'garage'); L('gar_w', 'gar-60_6'); L('gar_w', 'boilr', { door: doors.boiler_g.id });
  N('gar_gate', 63.5, -4.5, -4.5, 'garage'); L('gar_gate', 'gar60_-6');
  // rampe : couverte (ramp0), tranchée côté voie d'entrée (ramp1), sommet sur la voie de desserte (ramp2)
  N('ramp0', 68, -4.24, -4.5, 'ramp'); N('ramp1', 84, rampTop(84), -5.8, 'outside'); N('rampT', 98.2, -0.15, -5.8, 'outside', ['outside']); N('ramp2', 99.6, -0.15, -5.8, 'outside', ['outside']);
  L('gar_gate', 'ramp0', { shutter: true }); L('ramp0', 'ramp1'); L('ramp1', 'rampT'); L('rampT', 'ramp2');
  // escalier est
  for (const [y, k] of [[-4.5, 'B'], [0, '0'], [5, '1']]) { N(`stE${k}`, 77.6, y, 9.2, 'stairsE'); N(`stE${k}s`, 77, y, 20.5, 'stairsE'); L(`stE${k}`, `stE${k}s`); }
  const seMid = (a, b, y0, y1) => {
    const h = (y1 - y0) / 2, n = Math.round(h / 0.25), sd = 9 / n, sr = h / n;
    N(`stE${a}w`, 67.8, y0, 9.6, 'stairsE'); N(`stE${a}a`, 67.8, y0 + sr, 10.5 + sd / 2, 'stairsE'); N(`stE${a}a2`, 67.8, y0 + h, 19.5 - sd / 2, 'stairsE');
    N(`stE${a}b`, 67.8, y0 + h, 20.4, 'stairsE'); N(`stE${a}c`, 72.2, y0 + h, 20.4, 'stairsE'); // (à l'écart des bouts bas des mains courantes de la 2e volée)
    N(`stE${a}d`, 72.2, y0 + h + sr, 19.5 - sd / 2, 'stairsE'); N(`stE${a}d2`, 72.2, y1, 10.5 + sd / 2, 'stairsE'); N(`stE${a}e`, 72.2, y1, 9.6, 'stairsE');
    nav.chain([`stE${a}`, `stE${a}w`, `stE${a}a`, `stE${a}a2`, `stE${a}b`, `stE${a}c`, `stE${a}d`, `stE${a}d2`, `stE${a}e`, `stE${b}`]);
  };
  seMid('B', '0', -4.5, 0); seMid('0', '1', 0, 5);
  N('gar_e', 64, -4.5, 9.25, 'garage'); L('gar_e', 'gar60_6'); L('gar_e', 'stEB', { door: doors.stE_B.id });
  N('sv0n_e', 77, 0, 23.3, 'service_n0'); N('sv1n_e', 77, 5, 23.3, 'service_n1'); L('sv0n_e', 'sv0n75'); L('sv1n_e', 'sv1n75');
  L('stE0s', 'sv0n_e', { door: doors.stE_svc0.id }); L('stE1s', 'sv1n_e', { door: doors.stE_svc1.id });
  // hall, mezzanine, poubelles, CVC
  N('ent', 74, 0, 0, 'entrance', ['entrance']); N('ent_door', 78.8, 0, 0, 'entrance'); N('mez', 72, 5, 0, 'mezzanine');
  // le hall rejoint les deux voies de la galerie en contournant la banque d'accueil (x 70…72,5, z ±3)
  N('ent_n', 73.6, 0, 4.4, 'entrance'); N('ent_s', 73.6, 0, -4.4, 'entrance');
  L('ent', 'ent_n'); L('ent_n', 'g0n63'); L('ent', 'ent_s'); L('ent_s', 'g0s63'); L('ent', 'ent_door'); L('mez', 'g1n63'); L('mez', 'g1s63');
  // portes latérales du hall et de la mezzanine (x 77…78,2) : franchies en face de la baie, plus en diagonale à
  // travers le mur ou le vantail ouvert
  N('ent_stE', 77.6, 0, 6.5, 'entrance'); N('ent_trash', 77.6, 0, -6.5, 'entrance'); N('mez_stE', 77.6, 5, 6.5, 'mezzanine');
  L('ent', 'ent_stE'); L('ent', 'ent_trash'); L('mez', 'mez_stE');
  L('ent_stE', 'stE0', { door: doors.entr_stE.id }); L('mez_stE', 'stE1', { door: doors.mez_stE.id });
  N('trashr', 73, 0, -15, 'trash'); N('trash_d', 77.6, 0, -9.2, 'trash'); N('trash_s', 72.6, 0, -20.8, 'trash'); N('sv0s_t', 72.6, 0, -23.3, 'service_s0');
  L('trashr', 'trash_d'); L('trash_d', 'ent_trash', { door: doors.entr_trash.id }); L('trashr', 'trash_s'); L('trash_s', 'sv0s_t', { door: doors.trash_svc.id }); L('sv0s_t', 'sv0s69'); L('sv0s_t', 'sv0s75');
  N('hvacr', 73, 5, -15, 'hvac'); N('hvac_s', 72.6, 5, -20.8, 'hvac'); N('sv1s_h', 72.6, 5, -23.3, 'service_s1');
  L('hvacr', 'mez', { door: doors.mez_hvac.id }); L('hvacr', 'hvac_s'); L('hvac_s', 'sv1s_h', { door: doors.hvac_svc.id }); L('sv1s_h', 'sv1s69'); L('sv1s_h', 'sv1s75');
  // administration : croisée (bras est vers la galerie et l'accueil, bras ouest vers l'aile ouest), couloir le long de
  // x = -71 avec un nœud face à chaque porte ; chaque bureau est relié dans l'axe de sa porte
  N('arch', -71, 5, 0, 'adm_couloir'); N('adm_x', -68, 5, 0, 'adm_couloir'); N('adm_w', -74.6, 5, 0, 'adm_couloir'); N('adm_go', -64.6, 5, 0, 'gallery1_w');
  L('arch', 'adm_x'); L('arch', 'adm_w'); L('adm_x', 'adm_go', { door: doors.arch_g.id }); L('adm_go', 'g1n-63'); L('adm_go', 'g1s-63'); L('adm_w', 'ww1_0', { door: doors.arch_w.id });
  const ac = [...new Set([11, 8, 4, 0, -4, -8, -12, -16, -20, ...ADMIN_ROOMS.map(([id]) => doors[id]?.o.z).filter(z => z !== undefined)])].sort((a, b) => b - a)
    .map(z => { const id = z === 0 ? 'arch' : 'adm_c' + z; if (z) N(id, -71, 5, z, 'adm_couloir'); return id; });
  for (let i = 1; i < ac.length; i++) L(ac[i - 1], ac[i]);
  N('adm_acc', -68, 5, 2.6, 'adm_accueil'); L('adm_x', 'adm_acc', { door: doors.adm_acc.id });
  for (const [id, , b] of ADMIN_ROOMS) { // à 2 m de la cloison (salle de réunion : allée entre la cloison et la table)
    const d = doors[id]; if (!d) continue;
    const xw = b[0] === -70 ? -70 : -72;
    N(id + '_n', id === 'adm_reunion' ? -69.45 : xw + (xw === -70 ? 2 : -2), 5, d.o.z, id);
    L(id + '_n', 'adm_c' + d.o.z, { door: d.id });
  }
  // entrepôt : on contourne les rayonnages (rangée z -3 … -1,8 de x -108 à -86) par l'allée est
  N('wh', -82.2, 0, -13.35, 'warehouse'); N('wh2', -100, 0, -8, 'warehouse'); N('wh3', -96, 0, 1, 'warehouse'); N('wh4', -84, 0, -0.6, 'warehouse');
  L('wh', 'ww0_-13', { door: doors.wh_a.id }); L('wh', 'wh2'); L('wh', 'wh4'); L('wh4', 'wh3');
  // toit
  N('roofA', -78, 10.5, 17.75, 'roof'); L('roofA', 'stWR', { door: doors.stW_R.id });
  // le toit se parcourt autour de la verrière (rives nord et sud reliées aux deux pignons)
  const RN = [['roofN1', -78, 23.6], ['roofN2', -62, 23.6], ['roofB', -50, 12], ['roofC', -25, 12], ['roofD', 0, 12], ['roofE', 25, 12], ['roofF', 50, 12], ['roofF2', 68, 10], ['roofG', 72, 0], ['roofH2', 68, -10], ['roofH', 50, -12], ['roofI', 25, -12], ['roofJ', 0, -12], ['roofK', -25, -12], ['roofL', -50, -12], ['roofM', -70, -10], ['roofN', -78, 8]];
  for (const [k, x, z] of RN) N(k, x, 10.5, z, 'roof');
  nav.chain(['roofA', ...RN.map(r => r[0]), 'roofA']);
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
  // entrées des boutiques : un nœud côté galerie en face de la baie ; le lien entrée ↔ voie de la galerie (en biais à
  // travers l'allège ou le mur des portes étroites) devient entrée ↔ seuil (porte ou rideau) ↔ voie
  for (const [id, ctl] of Object.entries(world.shops || {})) {
    const I = nav.nodes.get(id + '_in'); if (!I) continue;
    for (const [nb, ed] of Object.entries({ ...(I.edges || {}) })) {
      const G = nav.nodes.get(nb); if (!G || !(ed.door || ed.shutter) || !/^g[01][ns]-?\d+$/.test(nb)) continue;
      for (const [P, Q] of [[I, G], [G, I]]) { P.links.delete(Q.id); delete P.edges[Q.id]; if (P.doors) delete P.doors[Q.id]; }
      const out = id + '_out'; N(out, I.x, I.y, ctl.zF - ctl.sg * 1.1, galZone(I.x, ctl.shop.floor));
      L(I.id, out, ed); L(out, nb);
    }
  }
}
