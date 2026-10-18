// Plans du centre : modèle relevé dans le monde construit (zones, magasins, murs et vitrages de la physique, marches,
// escalators, ascenseur, portes de secours, appareils), bornes et panneaux lumineux qui l'affichent, lecture (E).
// Une texture 1536 × 1024 par niveau, partagée par tous les panneaux du niveau ; le « vous êtes ici » de chaque
// panneau est un petit calque à part (repère, pastille, plaque), une texture commune pour tout le centre.
// Rétroéclairage : allumé tant que le circuit de la zone est alimenté (veille la nuit, plein quand la zone est
// éclairée ou le jour), noir sans courant ; matériaux de zone (patchZone) : la lampe torche les éclaire.
import * as THREE from 'three';
import { Box, LAYER } from '../engine/physics.js';
import { WorldObject, levelAtY } from './world.js';
import { patchZone, ENV } from '../engine/materials.js';
import { getMaxAnisotropy } from '../engine/textures.js';
import { GeoBuilder } from '../engine/geo.js';
import { drawBoard, FONT } from './mapdraw.js';

// niveaux du plan (−1 parking, 0 rez-de-chaussée, 1 étage) ; le toit se lit sur le plan de l'étage
export const PLAN_Y = { '-1': -4.5, 0: 0, 1: 5 };
export const planLevelAt = (y) => [-1, 0, 1, 1][levelAtY(y)];
const TEX_W = 1536, TEX_H = 1024;
// catégories du répertoire
const CAT_OF = {
  hyper: 'alim', boulangerie: 'alim', bonbons: 'alim', cafe: 'resto', pizzeria: 'resto', burger: 'resto', sushi: 'resto', glacier: 'resto',
  mode: 'mode', chaussures: 'mode', bijouterie: 'mode', pharma: 'beaute', parfumerie: 'beaute', coiffeur: 'beaute', opticien: 'beaute',
  quincaillerie: 'maison', fleuriste: 'maison', deco: 'maison', electro: 'maison', animalerie: 'maison',
  jouets: 'loisirs', librairie: 'loisirs', videoclub: 'loisirs', instruments: 'loisirs', arcade: 'loisirs', cinema: 'loisirs', sport: 'loisirs', costumes: 'loisirs', pixel: 'loisirs',
  tabac: 'services', mobizone: 'services', octet: 'services', photo: 'services',
};
const catOf = (s) => CAT_OF[s.id] || (s.layout === 'food' ? 'resto' : s.layout === 'racks' ? 'mode' : 'services');
const NOT_SHOP = new Set(['staff', 'office', 'toilets']);
const PUB_AREAS = new Set(['gallery0', 'gallery1', 'entrance']);
const SHORT = { secstore: 'Réserve', vestiaire: 'Vestiaire', trash: 'Poubelles', hvac: 'Ventilation', generator: 'Groupe électrogène', electrical: 'Local électrique', pa: 'Régie', boiler: 'Chaufferie' };

// ───────── modèle ─────────
export function buildPlanModel(world) {
  const g = world.game, shops = [], kiosks = [], ctls = Object.values(world.shops || {});
  // numérotation des cellules : depuis l'entrée principale (est), côté nord vers l'ouest puis côté sud vers l'est,
  // niveau après niveau (les locaux du personnel et les toilettes n'ont pas de numéro)
  let n = 0;
  for (const f of [0, 1]) for (const side of ['N', 'S']) {
    const row = ctls.filter((c) => c.shop.floor === f && c.shop.side === side && !NOT_SHOP.has(c.shop.layout)).sort((a, b) => (side === 'N' ? b.x0 - a.x0 : a.x0 - b.x0));
    for (const c of row) shops.push({ id: c.shop.id, num: ++n, name: c.shop.name, short: c.shop.name.split(' — ')[0], cat: catOf(c.shop), floor: f });
  }
  (world.kiosks || []).forEach((q, i) => kiosks.push({ id: 'kiosk' + i, num: 'K' + (i + 1), name: 'Kiosque ' + q.name, short: q.name, cat: q.cat, floor: 0, x: q.x, z: q.z, w: q.w, d: q.d }));
  const model = { shops, kiosks, shopById: Object.fromEntries(shops.map((s) => [s.id, s])), kioskById: Object.fromEntries(kiosks.map((q) => [q.id, q])), levels: {} };
  const doors = [...world.objects.values()].filter((o) => o.kind === 'door');
  const vz = world.zone('void_w')?.max[2] ?? 4;
  for (const k of [-1, 0, 1]) model.levels[k] = buildLevel(world, g, model, k, PLAN_Y[k], doors, vz);
  return model;
}

function buildLevel(world, g, model, k, Y, doors, vz) {
  const L = { k, y: Y, fills: [], walls: [], glass: [], treads: [], pictos: [], labels: [], esc: [], voids: [], kiosks: [], mainDoors: [] };
  const zs = world.zones.filter((z) => z.min[1] <= Y + 1 && z.max[1] >= Y + 1.6 && !['vent', 'void', 'roof'].includes(z.type) && z.id !== 'b13' && (!z.outdoor || k === 0));
  const shopOf = (z) => world.shops?.[z.shop]?.shop;
  const kindOf = (z) => {
    if (z.shop) { const s = shopOf(z); if (NOT_SHOP.has(s?.layout)) return s.layout === 'toilets' && !z.id.endsWith('_back') ? 'wc' : 'staff'; return z.id.endsWith('_back') ? 'back' : 'shop'; }
    if (z.outdoor) return 'out';
    if (z.type === 'garage') return z.id === 'ramp' ? 'ramp' : 'park';
    if (z.id === 'security') return 'sec';
    if (z.type === 'stairs') return 'stairs';
    return PUB_AREAS.has(z.area) && !z.id.startsWith('adm_') ? 'public' : 'staff';
  };
  // escalier ouvert au public : une de ses portes donne sur une zone publique ou sur le parking
  const pubStairs = (z) => doors.some((d) => d.o.zone === z.id && [-0.7, 0.7].some((s) => {
    const q = world.zoneAt(d.o.x + (d.o.axis === 'z' ? s : 0), (d.o.y ?? 0) + 1, d.o.z + (d.o.axis === 'x' ? s : 0));
    return q && q !== z && ['public', 'park'].includes(kindOf(q));
  }));
  const B = [Infinity, Infinity, -Infinity, -Infinity], grow = (r) => { B[0] = Math.min(B[0], r[0]); B[1] = Math.min(B[1], r[1]); B[2] = Math.max(B[2], r[2]); B[3] = Math.max(B[3], r[3]); };
  for (const z of zs) {
    const t = kindOf(z); let r = [z.min[0], z.min[2], z.max[0], z.max[2]];
    if (t === 'out') { // parvis et parking extérieur : bande devant la façade
      const bx = Math.max(...zs.filter((q) => !q.outdoor).map((q) => q.max[0]));
      r = [bx + 0.4, -25.5, bx + 20, 25.5];
    } else grow(r);
    const f = { t, r, a: (r[2] - r[0]) * (r[3] - r[1]), zone: z.id };
    if (z.shop) { f.shop = z.shop; if (t === 'staff' && !z.id.endsWith('_back')) f.name = shopOf(z)?.name?.split(' — ')[0]; }
    if (t === 'stairs') f.pub = pubStairs(z);
    L.fills.push(f);
    for (const e of z.extra) if (t !== 'out' && e[1] <= Y + 1 && e[4] >= Y + 1.6) { const er = [e[0], e[2], e[3], e[5]]; grow(er); L.fills.push({ ...f, r: er, a: (er[2] - er[0]) * (er[3] - er[1]) }); } // boîtes annexes (bras du couloir de l'administration)
  }
  // rampe du parking vue du rez-de-chaussée : la trémie à ciel ouvert devant la façade
  const rz = world.zone('ramp'), outF = L.fills.find((f) => f.t === 'out');
  if (k === 0 && rz && outF) L.fills.push({ t: 'ramp', r: [outF.r[0], rz.min[2], Math.min(rz.max[0], outF.r[2]), rz.max[2]], a: 1 });
  if (outF) grow([outF.r[0], outF.r[1], outF.r[2], outF.r[3]]);
  L.fills.sort((a, b) => b.a - a.a);
  L.ext = { x0: B[0] - 1.6, z0: B[1] - 1.6, x1: B[2] + 1.6, z1: B[3] + 1.6 };
  // murs et vitrages : boîtes statiques de la physique qui traversent la hauteur des yeux de ce niveau (les cloisons
  // intérieures des boutiques sont omises, comme sur un vrai plan de centre)
  const inner = []; for (const c of Object.values(world.shops || {})) for (const z of [c.zone, c.back]) if (z) inner.push([z.min[0] + 0.45, z.min[2] + 0.45, z.max[0] - 0.45, z.max[2] - 0.45]);
  const inside = (x, z, r) => x > r[0] && x < r[2] && z > r[1] && z < r[3];
  const ext = L.ext;
  for (const b of world.physics.boxes) {
    if (!b.enabled) continue;
    const wall = b.layer === LAYER.WALL, glass = b.layer === LAYER.GLASS;
    if (!(wall || glass) || (wall && b.data)) continue;
    if (b.min[1] > Y + (glass ? 0.5 : 0.7) || b.max[1] < Y + (glass ? 0.9 : 1.8)) continue;
    const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2], cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    if ((w > 9 && d > 9) || b.max[0] < ext.x0 || b.min[0] > ext.x1 || b.max[2] < ext.z0 || b.min[2] > ext.z1) continue;
    if (wall && inner.some((r) => inside(cx, cz, r))) continue;
    (wall ? L.walls : L.glass).push([b.min[0], b.min[2], b.max[0], b.max[2]]);
  }
  // marches des escaliers de service (volées qui arrivent à ce niveau et qui en partent)
  const stairZones = zs.filter((z) => z.type === 'stairs');
  for (const b of world.physics.boxes) {
    if (b.layer !== LAYER.FURN || b.max[1] <= Y - 2.4 || b.max[1] > Y + 2.6) continue;
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    if (stairZones.some((z) => inside(cx, cz, [z.min[0], z.min[2], z.max[0], z.max[2]])) && (b.max[0] - b.min[0]) < 3 && (b.max[2] - b.min[2]) < 3) L.treads.push([b.min[0], b.min[2], b.max[0], b.max[2]]);
  }
  // escalators, ascenseur, vides de l'étage
  if (k >= 0) for (const e of world.escalators || []) L.esc.push({ r: [e.x0, e.z0, e.x1, e.z1], dir: e.dir });
  const el = world.elevator?.o; if (el && el.floors.some((fy) => Math.abs(fy - Y) < 0.6)) L.elev = [el.x0, el.z0, el.x1, el.z1];
  if (k === 1) for (const [a, b] of world.voidHoles || []) L.voids.push([a, -vz, b, vz]);
  // ── pictogrammes ──
  const P = (t, x, z, big) => L.pictos.push({ t, x, z, big });
  const zc = (z) => [(z.min[0] + z.max[0]) / 2, (z.min[2] + z.max[2]) / 2];
  if (L.elev) { P('elev', (el.x0 + el.x1) / 2, (el.z0 + el.z1) / 2); if (k >= 0) P('park', el.x1 + 2.6, (el.z0 + el.z1) / 2); }
  const pairs = new Map(); for (const e of world.escalators || []) { const key = Math.sign(e.x0 + e.x1); const p = pairs.get(key) || { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, dir: e.dir }; p.x0 = Math.min(p.x0, e.x0); p.x1 = Math.max(p.x1, e.x1); p.z0 = Math.min(p.z0, e.z0); p.z1 = Math.max(p.z1, e.z1); pairs.set(key, p); }
  if (k >= 0) for (const p of pairs.values()) { const top = p.dir > 0 ? p.x1 : p.x0, bot = p.dir > 0 ? p.x0 : p.x1, xe = k === 0 ? bot - p.dir * 2.2 : top + p.dir * 2.2; P('esc', xe, (p.z0 + p.z1) / 2); }
  for (const z of stairZones) { const [x, zz] = zc(z); P('stairs', x, zz); if (k >= 0 && kindOf(z) === 'stairs' && L.fills.find((f) => f.zone === z.id)?.pub) P('park', x + 2.8, z.max[2] - 2.2); }
  for (const f of L.fills) {
    if (f.t === 'wc') { P('wc', (f.r[0] + f.r[2]) / 2, (f.r[1] + f.r[3]) / 2, true); L.labels.push({ s: 'Toilettes', x: (f.r[0] + f.r[2]) / 2, z: (f.r[1] + f.r[3]) / 2 - 3.2, k: 'small', w: f.r[2] - f.r[0] }); }
    if (f.t === 'sec') { const x = (f.r[0] + f.r[2]) / 2, z = (f.r[1] + f.r[3]) / 2; P('sec', x, z + 1.6, true); L.labels.push({ s: 'Poste de sécurité', x, z: z - 2.6, k: 'small', w: f.r[2] - f.r[0] }); }
  }
  for (const d of doors) {
    const o = d.o; if (Math.abs((o.y ?? 0) - Y) > 0.6) continue;
    if (o.mainEntrance) { L.mainDoors.push(o.axis === 'z' ? [o.x - 0.15, o.z - o.width / 2, o.x + 0.15, o.z + o.width / 2] : [o.x - o.width / 2, o.z - 0.15, o.x + o.width / 2, o.z + 0.15]); continue; }
    if (o.panic && world.zone(o.zone)?.type === 'stairs') P('emerg', o.x, o.z);
  }
  if (L.mainDoors.length) { // une seule grande « sortie », dehors devant les portes
    const zm = L.mainDoors.reduce((a, r) => a + (r[1] + r[3]) / 2, 0) / L.mainDoors.length, xm = Math.max(...L.mainDoors.map((r) => r[2]));
    P('exit', xm + 3.2, zm, true); L.labels.push({ s: 'Entrée principale', x: xm + 3.2, z: zm - 3.4, k: 'small', w: 9 });
  }
  if (k === 0) { // accueil : le comptoir qui porte la sonnette
    const bell = [...world.objects.values()].find((o) => o.kind === 'bell');
    if (bell) { const desk = world.physics.near(bell.o.x - 0.05, bell.o.z - 0.05, bell.o.x + 0.05, bell.o.z + 0.05, LAYER.FURN).filter((b) => bell.o.x >= b.min[0] && bell.o.x <= b.max[0] && bell.o.z >= b.min[2] && bell.o.z <= b.max[2]).sort((a, b) => (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) - (a.max[0] - a.min[0]) * (a.max[2] - a.min[2]))[0]; P('info', desk ? (desk.min[0] + desk.max[0]) / 2 : bell.o.x, desk ? (desk.min[2] + desk.max[2]) / 2 : bell.o.z, true); }
  }
  const pubAt = (d) => { const z = world.zone(d.zone); return z && kindOf(z) === 'public'; };
  for (const d of g.devices?.kind('atm') || []) if (planLevelAt(d.center.y) === k && pubAt(d)) P('atm', d.center.x, d.center.z);
  for (const d of g.devices?.kind('vending') || []) if (planLevelAt(d.center.y) === k && pubAt(d)) P('vend', d.center.x, d.center.z);
  const ft = (g.devices?.kind('fountain') || []).find((d) => planLevelAt(d.center.y) === k); if (ft) L.fountain = { x: ft.center.x, z: ft.center.z, r: (ft.def?.s?.[0] || 6) / 2 };
  if (k === 0) for (const q of model.kiosks) L.kiosks.push(q.id);
  // ── parking : places et sens de circulation (même tracé que le marquage peint au sol) ──
  const gz = zs.find((z) => z.type === 'garage' && z.id !== 'ramp');
  if (gz) {
    L.bays = []; const x0 = gz.min[0] + 6, x1 = gz.max[0] - 6, zA = gz.min[2], zB = gz.max[2];
    for (const [a, b] of [[zA + 0.5, zA + 5.5], [zB - 5.5, zB - 0.5], [-11.5, -6.5], [6.5, 11.5]]) for (let x = x0; x <= x1 + 0.01; x += 3) L.bays.push([x, a, x, b]);
    // on entre par l'allée centrale (vers l'ouest), on ressort par les allées latérales (vers l'est)
    const zs1 = (zA + 5.5 - 11.5) / 2, zn1 = (zB - 5.5 + 11.5) / 2, xm = (gz.min[0] + gz.max[0]) / 2;
    L.arrows = []; for (let x = x0 + 8; x < x1 - 8; x += 24) { if (Math.abs(x - xm) > 12) L.arrows.push([x + 3, 0, x - 3, 0]); L.arrows.push([x - 3, zs1, x + 3, zs1]); L.arrows.push([x - 3, zn1, x + 3, zn1]); }
    L.labels.push({ s: 'Parking', x: xm + 1.5, z: 0, k: 'area', scale: 1.4, w: 22 });
    P('park', xm - 10, 0, true);
  }
  if (rz && k === -1) { L.arrows ||= []; L.arrows.push([rz.min[0] + 4, (rz.min[2] + rz.max[2]) / 2, rz.max[0] - 6, (rz.min[2] + rz.max[2]) / 2]); L.labels.push({ s: 'Sortie véhicules', x: (rz.min[0] + rz.max[0]) / 2 + 4, z: rz.max[2] + 1.6, k: 'small', w: 30 }); }
  // ── étiquettes des zones ──
  const lab = (s, x, z, kk, w, scale) => L.labels.push({ s, x, z, k: kk, w, scale });
  const union = (ids) => { const q = zs.filter((z) => ids(z)); if (!q.length) return null; return [Math.min(...q.map((z) => z.min[0])), Math.min(...q.map((z) => z.min[2])), Math.max(...q.map((z) => z.max[0])), Math.max(...q.map((z) => z.max[2]))]; };
  for (const z of zs) {
    const t = kindOf(z), [x, zz] = zc(z), w = z.max[0] - z.min[0];
    if (z.id === 'entrance') lab('Hall d\'entrée', x + 1.5, z.max[2] - 2.6, 'area', w);
    else if (z.id === 'mezzanine') lab('Mezzanine', x, zz + 2.5, 'area', w);
    else if (z.id === 'atrium' && k === 0) lab('Atrium', x, zz + 5.4, 'area', 20);
    else if (z.id === 'atrium' && k === 1) lab('Vide sur l\'atrium', x, zz + 0.2, 'small', 20);
    else if (z.id === 'warehouse') lab('Entrepôt', x, zz, 'staff', w, 1.3);
    else if (z.type === 'corridor' && t === 'staff' && w > 30) lab('Couloir de service', x, zz, 'staff', 40);
    else if (SHORT[z.id]) lab(SHORT[z.id], x, zz, 'staff', w);
  }
  const adm = union((z) => z.id.startsWith('adm_')); if (adm) lab('Administration', (adm[0] + adm[2]) / 2, (adm[1] + adm[3]) / 2 + 3, 'staff', adm[2] - adm[0]);
  if (outF) lab('Parking extérieur', (outF.r[0] + outF.r[2]) / 2, 16, 'small', outF.r[2] - outF.r[0]);
  if (k === 0 && rz && outF) lab('Accès parking −1', (outF.r[0] + outF.r[2]) / 2 + 2, rz.min[2] - 1.4, 'small', outF.r[2] - outF.r[0]);
  return L;
}

// ───────── textures ─────────
function freeAfterUpload(t) { t.onUpdate = () => { t.onUpdate = null; const c = document.createElement('canvas'); c.width = c.height = 1; t.image = c; }; }
function canvasTexture(c, mips = true) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = getMaxAnisotropy();
  t.generateMipmaps = mips; t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  freeAfterUpload(t); ENV.renderer?.initTexture(t); // envoyée tout de suite : le canvas est libéré pendant le chargement
  return t;
}
export function boardCanvas(model, k, W = TEX_W, H = TEX_H, o = {}) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const info = drawBoard(c.getContext('2d'), model, k, W, H, o); return { canvas: c, info };
}
// calque commun : repère (pointe vers le haut), pastille « VOUS ÊTES ICI », plaque « i · Plan du centre »
const OV = { mark: [0, 0, 128, 128], label: [128, 16, 384, 112], plaque: [0, 128, 512, 256] };
function overlayTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  // repère plein (le calque est découpé à l'alpha) : cône du regard vers le haut, point rouge cerclé de blanc au centre
  // de la case (pivot de la rotation)
  x.save(); x.translate(64, 64);
  x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 62, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); x.closePath(); x.fill();
  x.fillStyle = '#ee666d'; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 56, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); x.closePath(); x.fill();
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(0, 0, 25, 0, 7); x.fill();
  x.fillStyle = '#d5232b'; x.beginPath(); x.arc(0, 0, 19, 0, 7); x.fill(); x.restore();
  x.fillStyle = '#d5232b'; x.beginPath(); x.roundRect(134, 28, 244, 72, 36); x.fill();
  x.fillStyle = '#fff'; x.font = '800 30px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('VOUS ÊTES ICI', 256, 65);
  x.fillStyle = '#13263e'; x.beginPath(); x.roundRect(4, 132, 504, 120, 18); x.fill();
  x.fillStyle = '#f2b632'; x.fillRect(4, 236, 504, 6);
  x.fillStyle = '#1d5ea8'; x.beginPath(); x.roundRect(24, 146, 80, 80, 14); x.fill();
  x.fillStyle = '#fff'; x.font = '700 70px Georgia, serif'; x.fillText('i', 64, 192);
  x.fillStyle = '#f5eedd'; x.textAlign = 'left'; x.font = '800 34px ' + FONT; x.fillText('PLAN DU CENTRE', 126, 172);
  x.fillStyle = '#f2b632'; x.font = '400 25px Georgia, serif'; x.fillText('Centre Commercial Hélios', 128, 210);
  return canvasTexture(c);
}

// ───────── panneaux ─────────
// déclaration (avant la fin de la construction) ; buildMapSigns les fabrique quand les boutiques existent
export function addMapSign(world, o) { (world.mapSignDefs ||= []).push(o); }

class MapSign extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'mapsign'); this.o = o; this.zone = o.zone; this.name = 'Plan du centre';
    this.setPick(...o.pick); this.init({});
  }
  prompt() { return 'E : Consulter le plan du centre'; }
  // le point de vue de la lecture : devant la face où se tient le joueur (bornes à deux faces)
  view(p) {
    const o = this.o, nx = Math.sin(o.ry), nz = Math.cos(o.ry);
    const side = o.twoSided && p && ((p.pos.x - o.x) * nx + (p.pos.z - o.z) * nz) < 0 ? -1 : 1;
    return { x: o.x + nx * side * 0.7, z: o.z + nz * side * 0.7, yaw: o.ry + (side < 0 ? Math.PI : 0), k: o.level };
  }
  local(verb, p) { if (verb === 'use') this.world.game.ui.openMapView?.({ sign: this, level: this.o.level, you: this.view(p) }); return true; }
}

export function buildMapSigns(world, A) {
  const defs = world.mapSignDefs || []; world.mapSignDefs = null;
  const model = world.mallPlan = buildPlanModel(world);
  if (!defs.length) return model;
  const tex = {}, info = {}, mats = new Map(), g = world.game;
  const levelTex = (k) => { if (!tex[k]) { const b = boardCanvas(model, k); tex[k] = canvasTexture(b.canvas); info[k] = b.info; } return tex[k]; };
  let ovTex = null;
  // un matériau par (zone, texture) : le rétroéclairage suit le circuit de la zone
  const matFor = (zone, key, map, alpha) => {
    const mk = zone + '|' + key; if (mats.has(mk)) return mats.get(mk);
    const m = patchZone(new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, roughness: alpha ? 0.45 : 0.32, metalness: 0, envMap: ENV.map, envMapIntensity: 0.5, alphaTest: alpha ? 0.5 : 0 }), g.mats.zoneUniform(zone));
    m.userData.mapZone = world.zone(zone); m.userData.boost = alpha ? 1.3 : 1; mats.set(mk, m); return m;
  };
  for (const d of defs) {
    d.level = d.level ?? planLevelAt(d.y + 0.2);
    ovTex ||= overlayTexture();
    if (d.kind === 'totem') totem(world, A, d, levelTex, info, matFor, ovTex);
    else board(world, A, d, levelTex, info, matFor, ovTex);
  }
  return model;
}

// rétroéclairage : veille la nuit si le circuit est alimenté, plein quand la zone est éclairée (ou le jour)
function backlight(mesh, world) {
  mesh.onBeforeRender = () => {
    const m = mesh.material, z = m.userData.mapZone, P = world.game.power; if (!z || !P) return;
    const on = P.zoneOn(z), lit = (z._level || 0) > 0.2;
    m.emissive.setScalar(on ? (lit ? 0.62 : 0.3) * m.userData.boost : 0.004);
  };
}
// position d'un point du plan (monde) sur un panneau : coordonnées locales du panneau (largeur pw, hauteur ph)
function onPanel(inf, x, z, pw, ph) { return [(inf.tf.X(x) / TEX_W - 0.5) * pw, (0.5 - inf.tf.Y(z) / TEX_H) * ph]; }
const quad = (b, w, h, m, rect) => { const pg = new THREE.PlaneGeometry(w, h); b.geometry(pg, m, { flat: false, rect: rect ? { u0: rect[0] / 512, v0: 1 - rect[3] / 256, u1: rect[2] / 512, v1: 1 - rect[1] / 256 } : null }); pg.dispose(); };
// calque d'une face : repère tourné selon le regard (nord en haut du plan), pastille à côté
function youOverlay(ob, inf, d, M, pw, ph, yaw) {
  const [lx, ly] = onPanel(inf, d.x, d.z, pw, ph), ms = pw * 0.08;
  quad(ob, ms, ms, M.clone().multiply(new THREE.Matrix4().makeTranslation(lx, ly, 0.003)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI - yaw)), OV.mark);
  const lw = pw * 0.105, lh = lw * 96 / 256, right = lx + ms * 0.6 + lw < pw / 2 - 0.02;
  quad(ob, lw, lh, M.clone().multiply(new THREE.Matrix4().makeTranslation(right ? lx + ms * 0.55 + lw / 2 : lx - ms * 0.55 - lw / 2, ly + ms * 0.55, 0.0025)), OV.label);
}

// Borne « monolithe » à deux faces : socle de granit, caisson laqué sombre, plan lumineux 1,5 × 1 m à hauteur des
// yeux dans un cadre d'aluminium, plaque « i · Plan du centre » en partie basse, chapeau d'aluminium
function totem(world, A, d, levelTex, info, matFor, ovTex) {
  const { zone, x, y, z, ry } = d, cs = Math.cos(ry), sn = Math.sin(ry), PW = 1.5, PH = 1.0, PY = 1.48, D = 0.091;
  const P = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
  A.rbox(zone, 'granite', ...P(0, 0.04, 0), 1.82, 0.08, 0.32, 0.012, 0xffffff, { ry });
  A.rbox(zone, 'steel_dark', ...P(0, 1.14, 0), 1.72, 2.12, 0.18, 0.03, 0xffffff, { ry, n: 2 });
  A.rbox(zone, 'aluminium', ...P(0, 2.215, 0), 1.76, 0.035, 0.22, 0.012, 0xffffff, { ry });
  A.rbox(zone, 'aluminium', ...P(0, 0.095, 0), 1.74, 0.03, 0.2, 0.008, 0xffffff, { ry });
  for (const s of [1, -1]) {
    for (const [lx, ly, w, h] of [[0, PY + PH / 2 + 0.016, PW + 0.064, 0.032], [0, PY - PH / 2 - 0.016, PW + 0.064, 0.032], [-PW / 2 - 0.016, PY, 0.032, PH], [PW / 2 + 0.016, PY, 0.032, PH]]) A.rbox(zone, 'aluminium', ...P(lx, ly, s * (D + 0.006)), w, h, 0.014, 0.004, 0xffffff, { ry });
    A.rbox(zone, 'aluminium', ...P(0, 0.56, s * (D - 0.002)), 1.28, 0.36, 0.008, 0.004, 0xffffff, { ry }); // cadre de la plaque
  }
  const inf = (levelTex(d.level), info[d.level]), pb = new GeoBuilder(), ob = new GeoBuilder();
  for (const s of [1, -1]) {
    const M = new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI).multiply(new THREE.Matrix4().makeTranslation(0, PY, D));
    quad(pb, PW, PH, M);
    youOverlay(ob, inf, d, M, PW, PH, ry + (s > 0 ? 0 : Math.PI));
    quad(ob, 1.2, 0.3, new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI).multiply(new THREE.Matrix4().makeTranslation(0, 0.56, D + 0.003)), OV.plaque);
  }
  place(world, d, pb.build(), matFor(zone, 'L' + d.level, levelTex(d.level)), ob.build(), matFor(zone, 'ov', ovTex, true));
  const ax = Math.abs(sn) > 0.5, hw = 0.9, hd = 0.15;
  world.physics.add(new Box(x - (ax ? hd : hw), y, z - (ax ? hw : hd), x + (ax ? hd : hw), y + 2.24, z + (ax ? hw : hd), LAYER.FURN));
  d.twoSided = true; d.pick = [x - (ax ? 0.2 : 0.88), y + 0.9, z - (ax ? 0.88 : 0.2), x + (ax ? 0.2 : 0.88), y + 2.05, z + (ax ? 0.88 : 0.2)];
  world.add(new MapSign(world, world.newId('mapsign'), d));
}

// Panneau mural lumineux : caisson peu profond, cadre d'aluminium ; panels : [{ k, w, dx, dy }] (niveaux affichés,
// largeur, décalage dans le plan du mur) — le repère « vous êtes ici » sur le panneau du niveau du mur
function board(world, A, d, levelTex, info, matFor, ovTex) {
  const { zone, x, y, z, ry } = d, cs = Math.cos(ry), sn = Math.sin(ry), D = 0.075;
  const P = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
  const panels = d.panels || [{ k: d.level, w: 1.2, dx: 0, dy: 0 }];
  let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
  for (const p of panels) { const h = p.w * 2 / 3; xa = Math.min(xa, p.dx - p.w / 2); xb = Math.max(xb, p.dx + p.w / 2); ya = Math.min(ya, p.dy - h / 2); yb = Math.max(yb, p.dy + h / 2); }
  const cw = xb - xa + 0.16, ch = yb - ya + 0.16, ccx = (xa + xb) / 2, ccy = (ya + yb) / 2;
  A.rbox(zone, 'steel_dark', ...P(ccx, ccy, D / 2), cw, ch, D, 0.02, 0xffffff, { ry, n: 2 });
  const byLevel = new Map(); let ov = null;
  for (const p of panels) {
    const h = p.w * 2 / 3;
    for (const [lx, ly, w, hh] of [[p.dx, p.dy + h / 2 + 0.014, p.w + 0.056, 0.028], [p.dx, p.dy - h / 2 - 0.014, p.w + 0.056, 0.028], [p.dx - p.w / 2 - 0.014, p.dy, 0.028, h], [p.dx + p.w / 2 + 0.014, p.dy, 0.028, h]]) A.rbox(zone, 'aluminium', ...P(lx, ly, D + 0.006), w, hh, 0.014, 0.004, 0xffffff, { ry });
    let e = byLevel.get(p.k); if (!e) byLevel.set(p.k, e = new GeoBuilder());
    const M = new THREE.Matrix4().makeTranslation(p.dx, p.dy, D + 0.002); quad(e, p.w, h, M);
    if (p.k === d.level && !ov) { ov = new GeoBuilder(); levelTex(p.k); youOverlay(ov, info[p.k], d, M, p.w, h, ry); }
  }
  for (const [k, b] of byLevel) place(world, d, b.build(), matFor(zone, 'L' + k, levelTex(k)), null, null);
  if (ov) place(world, d, null, null, ov.build(), matFor(zone, 'ov', ovTex, true));
  const a = P(xa - 0.08, 0, -0.02), b = P(xb + 0.08, 0, D + 0.03), c = P(0, 0, D + 0.2);
  world.physics.add(new Box(Math.min(a[0], b[0]), y + ya - 0.08, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y + yb + 0.08, Math.max(a[2], b[2]), LAYER.FURN));
  d.pick = [Math.min(a[0], b[0], c[0]), y + ya - 0.05, Math.min(a[2], b[2], c[2]), Math.max(a[0], b[0], c[0]), y + yb + 0.05, Math.max(a[2], b[2], c[2])];
  world.add(new MapSign(world, world.newId('mapsign'), d));
}

function place(world, d, pgeo, pmat, ogeo, omat) {
  const grp = (world.zone(d.zone)?.group || world.root);
  for (const [geo, mat] of [[pgeo, pmat], [ogeo, omat]]) {
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat); m.position.set(d.x, d.y, d.z); m.rotation.y = d.ry; m.matrixAutoUpdate = false; m.updateMatrix();
    backlight(m, world); grp.add(m);
  }
}
