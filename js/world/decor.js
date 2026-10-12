// Décor du Centre Commercial Hélios : colonnes, incrustations du sol, détails de plafond, bannières sous la
// verrière, totems publicitaires et plans, signalétique suspendue, kiosques garnis, cabines téléphoniques,
// manèges, poubelles de tri, casiers de consigne, chariots, panneaux « sol glissant ».
import * as THREE from 'three';
import '../data/decor.js';
import { ITEMS } from '../data/items.js';
import { registerShape } from './meshes.js';
import { Box, LAYER } from '../engine/physics.js';
import { Readable, Locker, PushButton, Container } from './fixtures.js';
import { WorldObject } from './world.js';
import { signTexture, posterTexture } from '../engine/textures.js';
import { SHOPS } from '../data/shops.js';
import { GeoBuilder, roundBoxGeo, latheGeo, cylGeo, sweepGeo, circleShape, rectShape, roundPath, trs } from '../engine/geo.js';

// géométrie colorée ajoutée au kit d'une forme (texel blanc de l'atlas)
const kg = (k, geo, m, color) => k.b.geometry(geo, m, { color, rect: k.white });

// ───────── formes des objets de décor ─────────
// Cabine téléphonique murale : socle, mât, capot arrondi à bandeau, joues acoustiques, publiphone (afficheur, clavier
// de douze touches, fente à pièces, lecteur de carte, sébile), combiné sur son crochet et cordon spiralé
registerShape('mall_payphone', (k, s, c) => {
  const [w, h, d] = s, zb = -d * 0.28;
  k.box(0, -h / 2 + 0.05, 0, w * 0.7, 0.1, d * 0.7, 0x263238);                                   // socle
  k.box(0, -h * 0.05, -d * 0.35, w * 0.12, h * 0.9, 0.08, 0x90a4ae);                             // mât
  kg(k, roundBoxGeo(w, 0.12, d, 0.03, 1), trs(0, h * 0.42, -d * 0.05), c);                       // capot
  k.box(0, h * 0.355, -d * 0.05 + d / 2 + 0.002, w * 0.96, 0.1, 0.004, 0xfafafa);                // bandeau
  for (const sx of [-1, 1]) kg(k, roundBoxGeo(0.03, h * 0.55, d * 0.8, 0.012, 1), trs(sx * w * 0.48, h * 0.1, 0), c); // joues
  kg(k, roundBoxGeo(w * 0.5, h * 0.32, 0.14, 0.02, 1), trs(0, h * 0.08, zb), 0x37474f);          // publiphone
  const f = zb + 0.071;
  k.box(0, h * 0.19, f, w * 0.3, h * 0.05, 0.004, 0x9ccc65);                                     // afficheur
  for (let i = 0; i < 12; i++) k.box(-0.035 + (i % 3) * 0.035, h * 0.12 - Math.floor(i / 3) * 0.032, f + 0.004, 0.026, 0.022, 0.008, 0xc9d1d6); // touches
  k.box(w * 0.16, h * 0.15, f + 0.002, 0.008, 0.05, 0.004, 0x111111);                            // fente à pièces
  k.box(w * 0.16, h * 0.08, f + 0.002, 0.06, 0.006, 0.004, 0x111111);                            // lecteur de carte
  k.box(0, -h * 0.05, f + 0.02, w * 0.2, 0.05, 0.05, 0x263238);                                   // sébile
  k.box(-w * 0.2, h * 0.11, f + 0.02, 0.04, 0.06, 0.04, 0x1d2428);                               // crochet
  k.cap(-w * 0.2, h * 0.11, f + 0.05, 0.022, 0.21, 0x111111, 0, 0, 0);                            // combiné
  const P = []; for (let t = 0; t <= 48; t++) { const a = t * 0.9, y = h * 0.11 - 0.125 - t * 0.004; P.push(new THREE.Vector3(-w * 0.2 + Math.cos(a) * 0.012, y, f + 0.03 + Math.sin(a) * 0.012)); }
  kg(k, sweepGeo(P, circleShape(0.003, 4)), new THREE.Matrix4(), 0x111111);                     // cordon spiralé
});
// Chevalet « sol glissant » : deux panneaux arrondis articulés en tête, poignée évidée, bandeau imprimé sur chaque face
registerShape('mall_aframe', (k, s, c) => {
  const [w, h, d] = s; const a = 0.24, r = k.shared('wet_sign', 64, 80, { kind: 'sign', bg: 0xffd600, fg: 0x111111, accent: 0x111111, name: 'SOL', sub: 'GLISSANT' });
  for (const sz of [-1, 1]) {
    const m = trs(0, 0, sz * d * 0.22, sz * a, 0, 0);
    kg(k, roundBoxGeo(w, h, 0.02, 0.02, 1), m, c);
    k.b.box(0, h * 0.4, sz * 0.011, w * 0.36, 0.035, 0.004, { color: 0x111111, flat: true, matrix: m });             // poignée
    k.b.box(0, -h * 0.05, sz * 0.0115, w * 0.78, h * 0.5, 0.003, { color: 0xffffff, matrix: m, label: { face: sz > 0 ? 'Z' : 'z', rect: r } });
  }
  k.box(0, h * 0.47, 0, w * 0.9, 0.04, 0.08, c);                                                                      // charnière
});
registerShape('mall_cleancart', (k, s, c) => {
  const [w, h, d] = s;
  k.box(0, -h * 0.42, 0, w, 0.06, d, 0x263238);                                  // plateau
  k.box(0, -h * 0.1, d * 0.3, w * 0.9, h * 0.5, d * 0.32, c);                    // bac
  k.cyl(0, -h * 0.25, -d * 0.2, w * 0.36, h * 0.32, 0xffd600);                   // seau
  k.box(0, h * 0.2, d * 0.3, w * 0.85, 0.05, d * 0.3, 0x455a64);                 // tablette
  k.cyl(-w * 0.2, h * 0.32, d * 0.3, 0.04, 0.22, 0x43a047); k.cyl(w * 0.15, h * 0.3, d * 0.3, 0.035, 0.18, 0xe53935); // flacons
  k.cyl(w * 0.4, h * 0.05, -d * 0.35, 0.015, h * 1.1, 0x8d6e63, 0.15, 0, 0.1);    // manche de balai
  k.box(0, h * 0.42, -d * 0.48, w * 0.9, 0.04, 0.04, 0x263238);                  // poignée
  for (const [x, z] of [[-w * 0.4, -d * 0.42], [w * 0.4, -d * 0.42], [-w * 0.4, d * 0.42], [w * 0.4, d * 0.42]]) k.cyl(x, -h * 0.47, z, 0.05, 0.04, 0x111111, Math.PI / 2);
});
// Poubelle de tri à trois compartiments : caisson laqué aux angles arrondis sur socle sombre, couvercles de couleur à
// ouvertures (rond : verre, fente : papier, carré : ordures), bandeaux imprimés, joints de façade
registerShape('mall_bin', (k, s, c) => {
  const [w, h, d] = s; const cols = [0x43a047, 0x1e88e5, 0x78909c], names = ['VERRE', 'PAPIERS', 'DÉCHETS'];
  k.box(0, -h / 2 + 0.025, 0, w - 0.05, 0.05, d - 0.05, 0x1e2124);                                               // socle
  kg(k, roundBoxGeo(w, h - 0.13, d, 0.035, 2), trs(0, -h / 2 + 0.05 + (h - 0.13) / 2, 0), c);                  // caisson
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * w / 3, lw = w / 3 - 0.012;
    kg(k, roundBoxGeo(lw, 0.075, d + 0.02, 0.02, 1), trs(x, h / 2 - 0.0375, 0), cols[i]);                         // couvercle
    if (i === 0) kg(k, latheGeo([[0, 0], [0.065, 0], [0.065, 0.004], [0, 0.004]], 16), trs(x, h / 2 - 0.001, 0.02), 0x0d0d0d);
    else if (i === 1) k.box(x, h / 2 + 0.001, 0.03, lw * 0.7, 0.004, 0.035, 0x0d0d0d);
    else k.box(x, h / 2 + 0.001, 0.015, lw * 0.6, 0.004, lw * 0.5, 0x0d0d0d);
    const r = k.shared('bin_' + i, 96, 40, { kind: 'plain', bg: cols[i], brand: names[i], fg: 0xffffff });
    k.box(x, h * 0.26, d / 2 + 0.002, lw * 0.82, 0.11, 0.004, 0xffffff, { label: { face: 'Z', rect: r } });
    if (i) k.box(x - w / 6, -0.02, d / 2 + 0.0015, 0.008, h - 0.2, 0.003, 0x15181a);                                 // joints de façade
  }
});
// Banc de galerie : deux piétements en fonte d'aluminium (jambes évasées, traverse sous l'assise, patins), longeron
// d'acier, cinq lattes de bois exotique aux arêtes adoucies, vis apparentes. Même encombrement que le banc du catalogue.
ITEMS.mall_bench = { ...ITEMS.bench, id: 'mall_bench', shape: 'mall_bench', c: 0x8a5a36 };
registerShape('mall_bench', (k, s, c) => {
  const [w, h, d] = s, fr = 0x3b4145, yt = h / 2, slat = 0.032, yS = yt - slat;
  for (const sx of [-1, 1]) {
    const x = sx * w * 0.4;
    for (const sz of [-1, 1]) k.boxR(x, -h / 2 + (h - slat) / 2, sz * d * 0.33, 0.05, h - slat + 0.02, 0.045, fr, sz * 0.2, 0, 0); // jambes évasées
    k.box(x, yS - 0.025, 0, 0.055, 0.05, d * 0.94, fr);                                                                   // traverse
    k.box(x, -h / 2 + 0.06, 0, 0.04, 0.035, d * 0.62, fr);                                                                // entretoise basse
    for (const sz of [-1, 1]) k.box(x, -h / 2 + 0.006, sz * d * 0.4, 0.07, 0.012, 0.06, 0x111111);                       // patins
  }
  k.box(0, yS - 0.035, 0, w * 0.8, 0.04, 0.035, 0x5b6267);                                                                // longeron
  const n = 5, sw = (d - 0.02 - (n - 1) * 0.012) / n;
  for (let i = 0; i < n; i++) {
    const z = -d / 2 + 0.01 + sw / 2 + i * (sw + 0.012), tone = [1, 0.92, 1.06, 0.96, 1.02][i];
    const col = ((Math.min(255, ((c >> 16) & 255) * tone) << 16) | (Math.min(255, ((c >> 8) & 255) * tone) << 8) | Math.min(255, (c & 255) * tone)) >>> 0;
    kg(k, roundBoxGeo(w - 0.02, slat, sw, 0.008, 1), trs(0, yS + slat / 2, z), col);
    for (const sx of [-1, 1]) k.box(sx * w * 0.4, yt + 0.0008, z, 0.012, 0.002, 0.012, 0x2b2b2b);                       // vis
  }
});

// ───────── utilitaires ─────────
// Plan recto-verso en une seule géométrie : face vers +x décalée de +d, face vers -x décalée de -d (deux plans tournés)
function twoSided(plane, d) {
  const b = new GeoBuilder();
  for (const s of [1, -1]) b.geometry(plane, new THREE.Matrix4().makeRotationY(s * Math.PI / 2).setPosition(s * d, 0, 0), { flat: false });
  plane.dispose(); return b.build();
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function bannerTex(title, sub, bg, fg) {
  return canvasTex(256, 512, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 6; i++) x.fillRect(0, 40 + i * 80, w, 6);
    x.fillStyle = fg; x.textAlign = 'center'; x.font = '900 46px Arial';
    title.split('\n').forEach((l, i) => x.fillText(l, w / 2, 130 + i * 56));
    x.font = '700 26px Arial'; sub.split('\n').forEach((l, i) => x.fillText(l, w / 2, 330 + i * 34));
    x.fillStyle = fg; x.font = '700 20px Georgia'; x.fillText('★ HÉLIOS ★', w / 2, h - 30);
  });
}
const galZone = (x, f) => (Math.abs(x) <= 24 ? 'atrium' : (f ? 'gallery1_' : 'gallery0_') + (x < 0 ? 'w' : 'e'));

// Sonnette de comptoir : « ding ». La nuit, il arrive (rarement) que quelqu'un réponde.
class DeskBell extends WorldObject {
  constructor(world, id, o) {
    super(world, id, 'bell'); this.o = o; this.zone = o.zone; this.name = 'Sonnette de l\'accueil';
    // socle de caoutchouc, timbre chromé, poussoir : posés dans les lots d'architecture (aucun appel de rendu)
    const A = o.A, dome = []; for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; dome.push([0.04 * Math.cos(a), 0.015 + 0.04 * Math.sin(a)]); }
    A.lathe(o.zone, 'furniture', [[0, 0], [0.05, 0], [0.05, 0.004], [0.047, 0.015], [0, 0.015]], 16, o.x, o.y, o.z, 0x161616);
    A.lathe(o.zone, 'furniture_metal', dome, 16, o.x, o.y, o.z, 0xe2e4e6);
    A.lathe(o.zone, 'furniture_metal', [[0.005, 0.053], [0.005, 0.068], [0.009, 0.07], [0.008, 0.074], [0, 0.075]], 8, o.x, o.y, o.z, 0xd0d2d4);
    this.setPick(o.x - 0.07, o.y, o.z - 0.07, o.x + 0.07, o.y + 0.09, o.z + 0.07);
    this.init({}); this.n = 0;
  }
  prompt() { return 'E : Sonner'; }
  interact(verb, actor) {
    const g = this.world.game, pos = [this.o.x, this.o.y + 0.05, this.o.z];
    g.sim.emit('fx', { s: 'bell_shop', pos, v: 0.9 });
    g.noise(new THREE.Vector3(...pos), 0.3, 'bell');
    if (!g.isDay && ++this.n >= 3 && Math.random() < 0.25) {
      this.n = 0;
      setTimeout(() => { g.sim.emit('fx', { s: 'footsteps_distant', pos: [this.o.x - 6, this.o.y, this.o.z + 3], v: 0.6 }); g.sim.emit('say', { who: '???', text: 'Un instant… j\'arrive.', pitch: 0.55, rate: 0.8 }); }, 2200);
    }
  }
}

export function buildDecor(world, A, dev, rng) {
  const g = world.game;
  const add = (zone, mesh) => (world.zone(zone)?.group || world.root).add(mesh);
  const shapeIn = (zone, mat, geo, pos, rot, scl, color) => A.shape(zone, mat, geo, new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot || new THREE.Euler()), scl || new THREE.Vector3(1, 1, 1)), color);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── colonnes au bord du vide (RDC et étage), décalées des passages des présences : socle de granit chanfreiné,
  //    plinthe inox, habillage en quatre coquilles d'inox brossé (joints verticaux et horizontaux laissant voir le fût
  //    sombre), bague haute et rosace au plafond ──
  for (const x of [-60, -48, -36, 36, 48, 60]) for (const sz of [-1, 1]) {
    const z = sz * 4.4;
    for (const [y0, y1, yc, f] of [[0, 4.1, 4.6, 0], [5, 9.95, 10.0, 1]]) {
      const zn = galZone(x, f);
      A.lathe(zn, 'granite', [[0, 0], [0.37, 0], [0.37, 0], [0.37, 0.085], [0.36, 0.1], [0.34, 0.11], [0.34, 0.11], [0, 0.11]], 24, x, y0, z);
      A.lathe(zn, 'aluminium', [[0.29, 0.11], [0.309, 0.113], [0.314, 0.125], [0.314, 0.235], [0.309, 0.247], [0.29, 0.25]], 24, x, y0, z);
      A.lathe(zn, 'steel_dark', [[0.293, 0.25], [0.293, yc - y0 - 0.14]], 16, x, y0, z); // fût (vu par les joints)
      const n = Math.max(2, Math.round((yc - y0 - 0.4) / 1.25)), hs = (yc - y0 - 0.4) / n;
      for (let i = 0; i < n; i++) for (let q = 0; q < 4; q++) A.lathe(zn, 'aluminium', [[0.293, 0], [0.3, 0.004], [0.3, hs - 0.01], [0.293, hs - 0.006]], 7, x, y0 + 0.255 + i * hs, z, 0xffffff, { phi0: Math.PI / 4 + q * Math.PI / 2 + 0.008, phiLen: Math.PI / 2 - 0.016 });
      A.lathe(zn, 'aluminium', [[0.293, -0.145], [0.31, -0.14], [0.318, -0.128], [0.318, -0.03], [0.326, -0.022], [0.326, 0]], 24, x, yc, z); // bague haute
      A.lathe(zn, 'aluminium', [[0.326, -0.008], [0.38, -0.008], [0.385, -0.004], [0.385, 0]], 24, x, yc, z);                        // rosace
      world.physics.add(new Box(x - 0.31, y0, z - 0.31, x + 0.31, y1, z + 0.31, LAYER.WALL));
    }
  }
  // ── incrustations de granit au sol (RDC) ──
  for (const [x0, x1] of [[-63, -25], [25, 63]]) for (const z of [-3.1, 3.1]) A.box(galZone((x0 + x1) / 2, 0), 'granite', x0, 0.002, z - 0.14, x1, 0.006, z + 0.14, { collide: false });
  for (const [x0, x1] of [[-63, -25], [25, 63]]) for (let x = x0 + 4; x < x1 - 2; x += 8) A.box(galZone(x, 0), 'granite', x - 0.14, 0.002, -3.1, x + 0.14, 0.006, 3.1, { collide: false });
  // ── détails de plafond sous les coursives : haut-parleurs encastrés (grille bombée, couronne), détecteurs de fumée
  //    (socle, dôme à fentes, voyant), sprinklers pendants (rosace chromée, corps laiton, ampoule rouge, déflecteur),
  //    diffuseurs carrés à quatre voies, trappes de visite, diffuseurs linéaires le long des vitrines ──
  for (let x = -61.5; x <= 61.5; x += 4.5) for (const z of [-6.8, 6.8]) for (const [yc, f] of [[4.6, 0], [10, 1]]) {
    const zn = galZone(x, f); const k = Math.round(x / 4.5) & 3;
    if (k === 0) { // haut-parleur
      A.lathe(zn, 'furniture', [[0, -0.016], [0.07, -0.014], [0.105, -0.01], [0.112, -0.007]], 18, x, yc, z, 0xd5d8da);
      A.lathe(zn, 'furniture', [[0.108, -0.011], [0.122, -0.012], [0.132, -0.008], [0.134, 0]], 18, x, yc, z, 0xf0f0ee);
    } else if (k === 2) { // détecteur de fumée
      A.lathe(zn, 'furniture', [[0, -0.048], [0.026, -0.047], [0.045, -0.04], [0.05, -0.03], [0.05, -0.03], [0.052, -0.018], [0.066, -0.016], [0.068, 0]], 16, x, yc, z, 0xf4f4f2);
      A.lathe(zn, 'furniture', [[0.0505, -0.034], [0.0515, -0.025]], 16, x, yc, z, 0x55595c);
      A.box(zn, 'furniture', x + 0.035, yc - 0.044, z - 0.004, x + 0.043, yc - 0.038, z + 0.004, { collide: false, color: 0xc01818, flat: true });
    } else { // sprinkler pendant
      A.lathe(zn, 'furniture_metal', [[0, -0.004], [0.034, -0.003], [0.036, 0]], 14, x, yc, z + 0.6, 0xd8dadc);
      A.lathe(zn, 'furniture_metal', [[0, -0.05], [0.018, -0.05], [0.018, -0.047], [0.005, -0.045], [0.005, -0.03], [0.009, -0.026], [0.009, -0.004]], 10, x, yc, z + 0.6, 0xc9a227);
      A.box(zn, 'furniture', x - 0.003, yc - 0.044, z + 0.597, x + 0.003, yc - 0.03, z + 0.603, { collide: false, color: 0xd42a1e, flat: true });
    }
  }
  const DIFF = [[0, -0.07], [0.14, -0.07], [0.14, -0.07], [0.17, -0.05], [0.17, -0.05], [0.24, -0.05], [0.24, -0.05], [0.27, -0.03], [0.27, -0.03], [0.34, -0.03], [0.34, -0.03], [0.37, -0.012], [0.424, -0.008], [0.424, 0]];
  for (let x = -60; x <= 60; x += 6) for (const z of [-6, 6]) for (const [yc, f] of [[4.6, 0], [10, 1]]) {
    const zn = galZone(x, f);
    if ((x / 6) % 2 === 0) A.lathe(zn, 'furniture', DIFF, 4, x, yc, z, 0xeeeeec, { phi0: Math.PI / 4 }); // diffuseur 60 × 60 (lathe carrée)
    else for (const [a, b, c, d] of [[-0.3, -0.3, 0.3, -0.288], [-0.3, 0.288, 0.3, 0.3], [-0.3, -0.288, -0.288, 0.288], [0.288, -0.288, 0.3, 0.288]]) A.box(zn, 'furniture', x + a, yc - 0.004, z - 0.8 * Math.sign(z) + b, x + c, yc, z - 0.8 * Math.sign(z) + d, { collide: false, color: 0xdedfdc, flat: true }); // trappe de visite
  }
  for (const [x0, x1] of [[-65.6, -24], [-24, 24], [24, 65.6]]) for (const s of [-1, 1]) for (const [yc, f] of [[4.6, 0], [10, 1]]) {
    const zn = galZone((x0 + x1) / 2, f), z = s * 7.62;
    A.box(zn, 'furniture', x0, yc - 0.006, z - 0.06, x1, yc, z + 0.06, { collide: false, color: 0xf0f0ee, flat: true });
    for (const dz of [-0.022, 0.022]) A.box(zn, 'furniture', x0 + 0.02, yc - 0.0065, z + dz - 0.009, x1 - 0.02, yc - 0.005, z + dz + 0.009, { collide: false, color: 0x1b1c1d, flat: true });
  }
  // ── joints de dilatation au sol (profilés aluminium en travers des galeries, RDC et étage) ──
  for (const x of [-42, -18, 18, 42]) {
    A.box(galZone(x, 0), 'aluminium', x - 0.025, 0.001, -8, x + 0.025, 0.004, 8, { collide: false });
    A.box(galZone(x, 0), 'furniture', x - 0.006, 0.0042, -8, x + 0.006, 0.0046, 8, { collide: false, color: 0x1a1a1a, flat: true });
    for (const s of [-1, 1]) { A.box(galZone(x, 1), 'aluminium', x - 0.025, 5.001, s * 4.08, x + 0.025, 5.004, s * 8, { collide: false }); }
  }
  // ── bannières suspendues sous la verrière ──
  const banners = [
    ['SOLDES\nD\'AUTOMNE', 'jusqu\'à -50 %\ndans vos boutiques', '#b71c1c', '#fff8e1'], ['HÉLIOS\n1987', '37 ans de sourires\nmerci à vous !', '#0d47a1', '#ffecb3'],
    ['NOUVEAU', 'Galaxy Arcade\nétage — côté est', '#4a148c', '#e1f5fe'], ['CARTE\nFIDÉLITÉ', '-10 % toute l\'année\nà l\'accueil', '#1b5e20', '#f1f8e9'],
    ['NOCTURNES', 'le vendredi\njusqu\'à 22 h', '#263238', '#ffd54f'], ['BOBBY\nVOUS ATTEND', 'Royaume du Jouet\nrez-de-chaussée', '#e65100', '#fff3e0'],
  ];
  // toile recto-verso (une seule géométrie : un appel de rendu), barres lestées haute et basse, suspentes inox
  const bgeo = twoSided(new THREE.PlaneGeometry(1.6, 3.2), 0.004);
  [-56, -36, -10, 10, 36, 56].forEach((x, i) => {
    const b = banners[i % banners.length]; const zn = galZone(x, 1);
    const bm = new THREE.MeshStandardMaterial({ map: bannerTex(b[0], b[1], b[2], b[3]), roughness: 0.9 });
    const m = new THREE.Mesh(bgeo, bm); m.position.set(x, 8.5, 0); add(zn, m);
    for (const y of [10.12, 6.88]) A.tube(zn, 'steel_dark', V(x, y, -0.84), V(x, y, 0.84), 0.016, 0xffffff, { segs: 10 });
    for (const sz of [-1, 1]) { A.tube(zn, 'aluminium', V(x, 10.135, sz * 0.78), V(x, 11.1, sz * 0.78), 0.0025, 0xffffff, { segs: 4, open: true }); A.lathe(zn, 'aluminium', [[0, 0], [0.012, 0], [0.012, 0.03], [0, 0.03]], 8, x, 10.13, sz * 0.78); }
  });
  // ── totems publicitaires lumineux (double face) : caisson inox arrondi sur socle de granit, cadres d'affiche
  //    noirs sous verre, bandeau lumineux en tête ──
  const totem = (zone, x, y, z, ry, p1, p2) => {
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry;
    const c = Math.cos(ry), s = Math.sin(ry), P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    A.rbox(zone, 'aluminium', ...P(0, 1.1, 0), 1.25, 2.0, 0.32, 0.04, 0xffffff, { ry, n: 2 });
    A.rbox(zone, 'granite', ...P(0, 0.05, 0), 1.31, 0.1, 0.38, 0.012, 0xffffff, { ry });
    A.rbox(zone, 'furniture', ...P(0, 2.07, 0), 1.18, 0.05, 0.26, 0.015, 0xf3f1ea, { ry });
    for (const sz of [-1, 1]) {
      for (const [lx, ly, w, h] of [[0, 1.89, 1.1, 0.045], [0, 0.42, 1.1, 0.045], [-0.528, 1.155, 0.044, 1.47], [0.528, 1.155, 0.044, 1.47]]) A.rbox(zone, 'furniture', ...P(lx, ly, sz * 0.162), w, h, 0.012, 0.004, 0x151515, { ry });
    }
    for (const [sg, p] of [[1, p1], [-1, p2]]) { const pm = new THREE.MeshBasicMaterial({ map: posterTexture(p) }); const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.42), pm); pl.position.set(0, 1.155, sg * 0.1635); if (sg < 0) pl.rotation.y = Math.PI; grp.add(pl); world.zone(zone).signMats.push(pm); }
    add(zone, grp); const cc = Math.abs(Math.sin(ry)) > 0.5; world.physics.add(new Box(x - (cc ? 0.17 : 0.63), y, z - (cc ? 0.63 : 0.17), x + (cc ? 0.17 : 0.63), y + 2.1, z + (cc ? 0.63 : 0.17), LAYER.FURN));
  };
  totem('gallery0_w', -64.2, 0, -3.2, Math.PI / 2, 0, 3); totem('gallery0_e', 64.2, 0, 3.2, -Math.PI / 2, 5, 6);
  totem('atrium', -20.5, 0, 5.5, 0, 7, 9); totem('atrium', 20.5, 0, -5.5, Math.PI, 4, 1);
  totem('gallery1_w', -64.2, 5, 3.2, Math.PI / 2, 9, 0); totem('gallery1_e', 64.2, 5, -3.2, -Math.PI / 2, 3, 7);
  // ── plans du centre (bornes lisibles) ──
  const dirTex = canvasTex(512, 640, (x, w, h) => {
    x.fillStyle = '#10161e'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffd54f'; x.font = '700 30px Arial'; x.fillText('PLAN DU CENTRE', 24, 46);
    x.fillStyle = '#90caf9'; x.font = '700 16px Arial'; x.fillText('★ VOUS ÊTES ICI', 24, 74);
    SHOPS.filter(s => s.layout !== 'toilets').forEach((s, i) => { const col = i % 2, row = (i / 2) | 0; x.fillStyle = '#' + s.color.toString(16).padStart(6, '0'); x.fillRect(24 + col * 240, 96 + row * 28, 12, 12); x.fillStyle = '#e0e0e0'; x.font = '14px Arial'; x.fillText((s.floor ? 'ét. ' : 'rdc ') + s.name, 42 + col * 240, 107 + row * 28); });
  });
  const directory = (zone, x, y, z, ry) => { // borne-plan : caisson laqué arrondi, socle, cadre inox, tablette de lecture
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry;
    const cs = Math.cos(ry), sn = Math.sin(ry), P = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
    A.rbox(zone, 'steel_dark', ...P(0, 1.04, 0), 1.1, 1.92, 0.22, 0.035, 0xffffff, { ry, n: 2 });
    A.rbox(zone, 'granite', ...P(0, 0.04, 0), 1.16, 0.08, 0.28, 0.01, 0xffffff, { ry });
    for (const [lx, ly, w, h] of [[0, 1.79, 0.99, 0.03], [0, 0.61, 0.99, 0.03], [-0.48, 1.2, 0.03, 1.15], [0.48, 1.2, 0.03, 1.15]]) A.rbox(zone, 'aluminium', ...P(lx, ly, 0.112), w, h, 0.012, 0.004, 0xffffff, { ry });
    A.rbox(zone, 'aluminium', ...P(0, 0.52, 0.15), 0.9, 0.03, 0.12, 0.01, 0xffffff, { ry, rx: 0 });
    const sm = new THREE.MeshBasicMaterial({ map: dirTex }); const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.15), sm); pl.position.set(0, 1.2, 0.1115); grp.add(pl); world.zone(zone).signMats.push(sm);
    add(zone, grp);
    const c = Math.abs(Math.sin(ry)) > 0.5;
    world.add(new Readable(world, world.newId('read'), { zone, name: 'Plan du centre', title: 'Plan du Centre Commercial Hélios', text: () => g.mapText(), box: [x - (c ? 0.15 : 0.6), y, z - (c ? 0.6 : 0.15), x + (c ? 0.15 : 0.6), y + 2, z + (c ? 0.6 : 0.15)] }));
    world.physics.add(new Box(x - (c ? 0.12 : 0.56), y, z - (c ? 0.56 : 0.12), x + (c ? 0.12 : 0.56), y + 2, z + (c ? 0.56 : 0.12), LAYER.FURN));
  };
  directory('atrium', -18.5, 0, -5.6, 0); directory('atrium', 18.5, 0, 5.6, Math.PI); directory('gallery1_w', -29.5, 5, 5.6, Math.PI); directory('gallery1_e', 29.5, 5, -5.6, 0);
  // ── signalétique suspendue (double face) sous les coursives ──
  const wayTex = (lines) => canvasTex(512, 128, (x, w, h) => { x.fillStyle = '#1a237e'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '700 30px Arial'; x.textBaseline = 'middle'; lines.forEach((l, i) => x.fillText(l, 18, 34 + i * 58)); });
  const hang = (zone, x, y, z, lines) => { // caisson double face (une géométrie), tiges filetées et platines au plafond
    const wm = new THREE.MeshBasicMaterial({ map: wayTex(lines) }); world.zone(zone).signMats.push(wm);
    const m = new THREE.Mesh(twoSided(new THREE.PlaneGeometry(2.0, 0.5), 0.031), wm); m.position.set(x, y - 0.55, z); add(zone, m);
    A.rbox(zone, 'steel_dark', x, y - 0.55, z, 0.06, 0.54, 2.04, 0.012);
    for (const sz of [-1, 1]) { A.tube(zone, 'steel_dark', V(x, y - 0.28, z + sz * 0.8), V(x, y, z + sz * 0.8), 0.006, 0xffffff, { segs: 6, open: true }); A.lathe(zone, 'steel_dark', [[0, -0.006], [0.035, -0.006], [0.035, 0]], 10, x, y, z + sz * 0.8); }
  };
  hang('gallery0_w', -26, 4.6, -6, ['← Poste de sécurité', 'Toilettes : étage →']); hang('gallery0_e', 26, 4.6, 6, ['Sortie · Parking →', '← Escalators']);
  hang('gallery1_w', -26, 10, 6, ['← Administration', 'Restauration · Ciné']); hang('gallery1_e', 26, 10, -6, ['Toilettes · Arcade →', '← Escalators']);
  // ── blocs de secours supplémentaires ──
  const exitTex = signTexture('SORTIE ➜', 0x00e676, { h: 100, fontSize: 64, font: 'Arial', bg: '#0a3d1a', textColor: '#d8ffe0' });
  for (const [zone, x, y, z, ry, yc] of [['gallery0_w', -24.1, 4.2, 6.5, -Math.PI / 2, 4.6], ['gallery0_e', 24.1, 4.2, -6.5, Math.PI / 2, 4.6], ['gallery1_w', -24.1, 9.6, -6.5, -Math.PI / 2, 10], ['gallery1_e', 65.83, 8.4, 0, -Math.PI / 2, 10], ['gallery1_e', 24.1, 9.6, 6.5, Math.PI / 2, 10], ['entrance', 66.2, 3.6, 0, Math.PI / 2, 4.6], ['adm_couloir', -71, 8.3, 12.9, Math.PI]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: exitTex })); m.material.color.setScalar(1.6); m.position.set(x, y, z); m.rotation.y = ry; add(zone, m);
    A.exitBox(zone, x, y, z, ry, yc);
  }
  // ── mobilier de galerie : poubelles de tri, extincteurs, cabines, manèges ──
  for (const [x, z, f] of [[-44, 3.2, 0], [44, -3.2, 0], [-52, -3.2, 0], [52, 3.2, 0], [-41, 5.2, 1], [41, -5.2, 1], [-58, -5.2, 1], [58, 5.2, 1]]) dev('mall_bin', galZone(x, f), x, (f ? 5 : 0) + 0.5, z, z > 0 ? Math.PI : 0);
  for (const [x, y, z, ry, zn] of [[-24.4, 1.0, 7.6, -Math.PI / 2, 'gallery0_w'], [24.4, 1.0, -7.6, Math.PI / 2, 'gallery0_e'], [-24.4, 6.0, -7.6, -Math.PI / 2, 'gallery1_w'], [24.4, 6.0, 7.6, Math.PI / 2, 'gallery1_e']]) dev('extinguisher_box', zn, x, y, z, ry);
  dev('mall_payphone', 'gallery0_w', -65.45, 1.1, -3.6, Math.PI / 2); dev('mall_payphone', 'gallery0_w', -65.45, 1.1, -4.8, Math.PI / 2);
  dev('mall_payphone', 'gallery1_w', -65.45, 6.1, -5.6, Math.PI / 2);
  dev('mall_kiddie_car', 'gallery0_w', -48.5, 0.6, 2.2, Math.PI / 2); dev('mall_kiddie_horse', 'gallery0_e', 48.5, 0.6, -2.2, -Math.PI / 2);
  dev('massage_chair', 'gallery1_w', -60, 5.6, 5.6, Math.PI);
  dev('vending', 'gallery1_e', 63.0, 5.9, 7.45, Math.PI); dev('vending', 'gallery0_w', -63.2, 0.9, -7.45, 0);
  dev('atm', 'gallery0_e', 63.0, 0.95, -7.65, 0);
  dev('photobooth', 'entrance', 68.6, 1.0, 7.25, Math.PI);
  // ── kiosques garnis au centre des galeries (sous le vide) ──
  // kiosque : comptoir sur socle en retrait (bandeau de couleur, joints de panneaux, plateau de bois aux arêtes adoucies),
  // présentoir à rainures (tablettes sur consoles, nez de tablette), quatre poteaux ronds sur platines, auvent caissonné
  // (bandeaux d'enseigne, réglettes lumineuses en sous-face). Collisions inchangées.
  const kiosk = (cx, title, color, stock) => {
    const zn = galZone(cx, 0), F = (x0, y0, z0, x1, y1, z1, c, metal) => A.furn(zn, cx + x0, y0, z0, cx + x1, y1, z1, c, { metal, collide: false });
    for (const b of [[-1.5, 0, -0.6, 1.5, 0.95, 0.6], [-1.5, 0, 1.15, 1.5, 1.9, 1.5]]) world.physics.add(new Box(cx + b[0], b[1], b[2], cx + b[3], b[4], b[5], LAYER.FURN));
    F(-1.45, 0, -0.55, 1.45, 0.1, 0.55, 0x222222); F(-1.5, 0.1, -0.6, 1.5, 0.95, 0.6, 0xf2efe8);                         // comptoir
    F(-1.505, 0.74, -0.605, 1.505, 0.8, 0.605, color);
    for (const u of [-0.75, 0, 0.75]) F(u - 0.003, 0.1, -0.604, u + 0.003, 0.74, -0.6, 0xc9c5bc);
    A.rbox(zn, 'furniture', cx, 0.975, 0, 3.1, 0.05, 1.3, 0.015, 0x3e2c1e);
    F(-1.45, 0, 1.2, 1.45, 0.1, 1.5, 0x222222); F(-1.5, 0.1, 1.15, 1.5, 1.9, 1.5, 0xf2efe8); F(-1.53, 1.9, 1.12, 1.53, 1.96, 1.52, color); // présentoir
    for (let y = 1.02; y < 1.86; y += 0.1) F(-1.44, y, 1.145, 1.44, y + 0.012, 1.15, 0xb9b5ad);
    for (const yy of [1.25, 1.6]) {
      F(-1.45, yy - 0.02, 0.8, 1.45, yy, 1.15, 0xbdbdbd, true); F(-1.45, yy - 0.045, 0.795, 1.45, yy + 0.012, 0.81, color);
      for (const u of [-1.35, 0, 1.35]) F(u - 0.008, yy - 0.16, 1.0, u + 0.008, yy - 0.02, 1.15, 0x8d9297, true);
    }
    for (const [px, pz] of [[-1.7, -1.4], [1.7, -1.4], [-1.7, 1.6], [1.7, 1.6]]) {
      world.physics.add(new Box(cx + px - 0.04, 0, pz - 0.04, cx + px + 0.04, 2.7, pz + 0.04, LAYER.FURN));
      A.tube(zn, 'steel_dark', V(cx + px, 0.012, pz), V(cx + px, 2.7, pz), 0.04, 0xffffff, { segs: 12, open: true });
      A.lathe(zn, 'steel_dark', [[0, 0], [0.09, 0], [0.09, 0.012], [0.05, 0.016], [0, 0.016]], 12, cx + px, 0, pz);
    }
    A.rbox(zn, 'furniture', cx, 2.85, 0.1, 3.72, 0.08, 3.32, 0.02, color);                                                   // auvent
    F(-1.86, 2.33, -1.56, 1.86, 2.81, -1.5, 0x2a2c2e); F(-1.86, 2.33, 1.7, 1.86, 2.81, 1.76, 0x2a2c2e);
    for (const sx of [-1, 1]) F(sx * 1.86 - 0.03, 2.33, -1.5, sx * 1.86 + 0.03, 2.81, 1.7, 0x2a2c2e);
    for (const z of [-0.9, 1.0]) A.panel(zn, cx, 2.81, z, 3.0, 0.1, false);
    const sm = new THREE.MeshBasicMaterial({ map: signTexture(title, color, { h: 100, fontSize: 56, font: 'Arial' }) }), sb = new GeoBuilder(), sp = new THREE.PlaneGeometry(3.4, 0.42);
    sb.geometry(sp, new THREE.Matrix4().makeTranslation(0, 0, 1.77), { flat: false }); sb.geometry(sp, new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, 0, -1.57), { flat: false });
    const sgm = new THREE.Mesh(sb.build(), sm); sgm.position.set(cx, 2.55, 0); add(zn, sgm); world.zone(zn).signMats.push(sm); sp.dispose();
    // marchandise : comptoir puis tablettes
    const spots = []; for (let u = -1.3; u <= 1.31; u += 0.32) { spots.push([cx + u, 1.0, -0.25]); spots.push([cx + u, 1.0, 0.2]); }
    for (let u = -1.3; u <= 1.31; u += 0.29) { spots.push([cx + u, 1.25, 0.97]); spots.push([cx + u, 1.6, 0.97]); }
    let si = 0;
    for (const [id, n] of stock) for (let i = 0; i < n && si < spots.length; i++, si++) { const def = ITEMS[id]; if (!def) continue; const [x, y, z] = spots[si]; g.props.addStatic(id, x + rng.range(-0.03, 0.03), y + def.s[1] / 2 + 0.002, z, Math.PI + rng.range(-0.15, 0.15), zn); }
  };
  kiosk(-60, 'PRESSE · LOTO', 0x1565c0, [['newspaper', 6], ['magazine', 10], ['postcard', 8], ['candy_bar', 8], ['gum', 6], ['lighter', 3]]);
  kiosk(-36, 'COQUE & CO', 0x00897b, [['phone_case', 16], ['charger', 8], ['sunglasses', 6]]);
  kiosk(36, 'GAUFRES & CAFÉ', 0xe65100, [['waffle', 8], ['croissant', 6], ['eclair', 4], ['coffee', 6], ['soda', 6], ['juice', 4], ['water', 4]]);
  kiosk(60, 'MONTRES · ACCESSOIRES', 0x6a1b9a, [['watch', 8], ['sunglasses', 8], ['scarf', 8], ['teddy', 2]]);
  // ── hall d'entrée : consigne, baie de caddies ──
  for (let i = 0; i < 6; i++) { const lk = new Locker(world, world.newId('locker'), { zone: 'entrance', x: 70.5 + i * 0.46, y: 0, z: 7.6, ry: Math.PI, name: 'Consigne n°' + (11 + i), contents: i === 2 ? ['umbrella_lost'].filter(id => ITEMS[id]) : i === 4 ? ['magazine'] : [], locked: i % 2 === 1 }); world.add(lk); }
  for (let i = 0; i < 5; i++) dev('shopping_cart', 'entrance', 78.9, 0.5, -5.0 + i * 0.62, -Math.PI / 2, { prop: true });
  A.box('entrance', 'rubber', 77.2, 0.001, -1.8, 79.9, 0.012, 1.8, { collide: false }); // tapis d'entrée encastré, cornière aluminium
  for (const [a, b, c, d] of [[77.17, -1.83, 79.93, -1.8], [77.17, 1.8, 79.93, 1.83], [77.17, -1.8, 77.2, 1.8]]) A.box('entrance', 'aluminium', a, 0.0, b, c, 0.014, d, { collide: false });
  // ── arrêts d'urgence des escalators (au pied de chaque escalator) ──
  const stopEsc = (game, actor, btn) => {
    game.sim.emit('fx', { s: 'beep', pos: [btn.o.x, btn.o.y, btn.o.z], v: 0.8 });
    if (!game.power.state.escalators) { game.sim.emit('toast', { text: 'Les escalators sont déjà à l\'arrêt.' }, { to: actor }); return; }
    game.power.set({ escalators: false }); game.noise?.(new THREE.Vector3(btn.o.x, btn.o.y, btn.o.z), 0.6, 'machine');
    game.sim.emit('toast', { text: 'Arrêt d\'urgence : escalators stoppés (relance depuis la console du poste).' }, { to: actor });
  };
  for (const [x, z, ry] of [[-15.2, -2.78, Math.PI], [-15.2, 2.78, 0], [15.2, -2.78, Math.PI], [15.2, 2.78, 0]]) {
    world.add(new PushButton(world, world.newId('btn'), { zone: 'atrium', x, y: 0.95, z, ry, label: 'Arrêt d\'urgence de l\'escalator', press: stopEsc }));
    A.rbox('atrium', 'aluminium', x, 0.81, Math.sign(z) * 2.7275, 0.15, 0.5, 0.075, 0.012); // borne inox du bouton, posée sur le platelage contre le verre
  }

  // ── entretien : panneaux « sol glissant », chariots de ménage ──
  dev('mall_wetsign', 'atrium', 2.6, 0.31, -2.4, 0.4, { prop: true }); dev('mall_wetsign', 'gallery1_e', 55, 5.31, -6.5, 1.2, { prop: true });
  dev('mall_wetsign', 'service_n0', -20, 0.31, 23.2, 0.2, { prop: true });
  dev('mall_cleancart', 'service_n0', -14, 0.5, 23.6, Math.PI / 2, { prop: true }); dev('mall_cleancart', 'gallery1_e', 60.5, 5.5, -6.6, 0.3, { prop: true });

  // ── piano en libre-service dans l'atrium (devant la boulangerie, hors des passages) ──
  dev('piano', 'atrium', 5.2, 0.625, 6.95, Math.PI);
  // banquette de piano : caisse laquée noire, coussin de velours capitonné, pieds tournés, entretoises
  A.rbox('atrium', 'furniture', 5.2, 0.44, 6.125, 0.6, 0.06, 0.35, 0.012, 0x141414);
  A.rbox('atrium', 'furniture', 5.2, 0.495, 6.125, 0.56, 0.05, 0.31, 0.022, 0x5d1f1f, { n: 2 });
  for (const [dx, dz] of [[-0.26, -0.135], [0.26, -0.135], [-0.26, 0.135], [0.26, 0.135]]) A.lathe('atrium', 'furniture', [[0, 0], [0.018, 0], [0.022, 0.06], [0.016, 0.15], [0.024, 0.3], [0.02, 0.41], [0, 0.41]], 10, 5.2 + dx, 0, 6.125 + dz, 0x141414);
  for (const dz of [-0.135, 0.135]) A.box('atrium', 'furniture', 4.95, 0.12, 6.125 + dz - 0.01, 5.45, 0.14, 6.125 + dz + 0.01, { collide: false, color: 0x141414, flat: true });
  // panneau sur pied : platine ronde, mât, cadre aluminium
  A.lathe('atrium', 'steel_dark', [[0, 0], [0.16, 0], [0.16, 0.012], [0.12, 0.02], [0, 0.02]], 16, 6.44, 0, 6.9);
  A.tube('atrium', 'aluminium', V(6.44, 0.02, 6.9), V(6.44, 1.1, 6.9), 0.016, 0xffffff, { segs: 10, open: true });
  A.furn('atrium', 6.2, 1.1, 6.86, 6.68, 1.45, 6.94, 0xf4f1ea, { collide: false });
  for (const [a, b, c, d] of [[6.19, 1.09, 6.69, 1.105], [6.19, 1.445, 6.69, 1.46], [6.19, 1.09, 6.205, 1.46], [6.675, 1.09, 6.69, 1.46]]) A.box('atrium', 'aluminium', a, b, 6.855, c, d, 6.945, { collide: false });
  world.add(new Readable(world, world.newId('read'), { zone: 'atrium', name: 'Panneau du piano', title: 'Piano en libre-service', box: [6.18, 1.05, 6.82, 6.7, 1.48, 6.98],
    text: 'Offert par l\'association des commerçants d\'Hélios.\nJouez ce que vous voulez !\n\n(Merci de ne pas poser de boissons sur le piano.)\n\nAu feutre, dans un coin : « il joue tout seul quand le centre est fermé. Toujours la même comptine. »' }));

  // ── comptoir d'accueil du hall d'entrée (x 70..72,5, z -3..3, face côté portes) : poste de travail, sonnette,
  //    dépliants, micro, bac d'objets trouvés, cube « i » ──
  {
    const zn = 'entrance', T = 1.15; // dessus du comptoir
    dev('pc_tower', zn, 70.55, T + 0.226, -1.3, -Math.PI / 2, { os: 'shop', monitor: 'right' });
    dev('office_chair', zn, 69.25, 0.55, -0.6, Math.PI / 2);
    // micro d'annonce : socle lesté, col de cygne, capsule à bonnette, bouton de parole
    A.lathe(zn, 'furniture', [[0, 0], [0.05, 0], [0.05, 0.012], [0.04, 0.025], [0, 0.026]], 14, 70.94, T, 0.59, 0x1b1b1b);
    A.box(zn, 'furniture', 70.965, T + 0.02, 0.575, 70.985, T + 0.03, 0.605, { collide: false, color: 0xb71c1c, flat: true });
    const neck = []; for (let k = 0; k <= 8; k++) { const a = (k / 8) * 1.2; neck.push(V(70.94 + (1 - Math.cos(a)) * 0.12, T + 0.026 + Math.sin(a) * 0.2, 0.59)); }
    A.sweep(zn, 'furniture', neck, circleShape(0.006, 6), 0x2a2a2a);
    const tip = neck[8], dir = tip.clone().sub(neck[7]).normalize();
    A.tube(zn, 'furniture', tip, tip.clone().addScaledVector(dir, 0.05), 0.012, 0x111111, { segs: 10 });
    A.lathe(zn, 'furniture', [[0, -0.022], [0.012, -0.018], [0.018, 0], [0.012, 0.018], [0, 0.022]], 10, 0, 0, 0, 0x202020, { m: trs(tip.x + dir.x * 0.07, tip.y + dir.y * 0.07, tip.z, 0, 0, -Math.acos(Math.min(1, dir.y))) });
    world.add(new DeskBell(world, world.newId('bell'), { zone: zn, x: 72.25, y: T, z: -0.5, A }));
    // présentoir à dépliants (lisible)
    A.furn(zn, 72.0, T, -2.85, 72.45, T + 0.03, -2.25, 0xd8dde0, { collide: false });
    [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa].forEach((c, i) => A.furn(zn, 72.05 + (i % 2) * 0.17, T + 0.03, -2.8 + i * 0.1, 72.2 + (i % 2) * 0.17, T + 0.24 - (i % 3) * 0.02, -2.73 + i * 0.1, c, { collide: false }));
    world.add(new Readable(world, world.newId('read'), { zone: zn, name: 'Dépliants — programme du centre', title: 'Hélios — le programme du mois', box: [71.98, T - 0.02, -2.9, 72.5, T + 0.28, -2.2],
      text: 'ANIMATIONS\n• Mercredi : atelier maquillage pour les enfants (Fête & Costumes).\n• Samedi 14 : grande chasse au trésor avec Bobby l\'ourson — ANNULÉE.\n• Concours de dessin « Dessine-moi Hélios » : déposez vos dessins à l\'accueil.\n\nINFOS PRATIQUES\n• Ascenseur panoramique : galerie ouest, du parking à l\'étage.\n• Objets trouvés : à demander à l\'accueil.\n• Le centre ferme à 21 h. Merci de quitter les lieux à l\'annonce.\n\n(Au dos, au stylo :) « il y avait 14 dessins dans la boîte. On n\'avait inscrit que 13 enfants. »' }));
    // bac des objets trouvés, côté personnel
    world.physics.add(new Box(69.2, 0, 1.2, 69.75, 0.38, 1.85, LAYER.FURN)); // bac en plastique : rebord, poignées évidées
    A.rbox(zn, 'furniture', 69.475, 0.18, 1.525, 0.53, 0.36, 0.63, 0.02, 0x37474f);
    A.rbox(zn, 'furniture', 69.475, 0.37, 1.525, 0.55, 0.025, 0.65, 0.01, 0x2b3a42);
    for (const s of [-1, 1]) A.box(zn, 'furniture', 69.39, 0.28, 1.525 + s * 0.318, 69.56, 0.32, 1.525 + s * 0.322, { collide: false, color: 0x101010, flat: true });
    const lost = ['scarf', 'sunglasses', 'teddy', 'cap', 'walkman', 'lipstick', 'watch', 'ball'].filter(id => ITEMS[id]);
    const picks = lost.filter(() => rng.chance(0.5)).slice(0, 4);
    world.add(new Container(world, world.newId('box'), { zone: zn, name: 'Bac « objets trouvés »', contents: picks.length ? picks : ['scarf'], box: [69.18, 0, 1.18, 69.77, 0.42, 1.87] }));
    // cube « i » sur son mât, à l'angle du comptoir
    world.physics.add(new Box(69.75, 0, -3.45, 69.85, 3.0, -3.35, LAYER.FURN)); // mât rond sur platine
    A.tube(zn, 'aluminium', V(69.8, 0.015, -3.4), V(69.8, 3.03, -3.4), 0.035, 0xffffff, { segs: 12, open: true });
    A.lathe(zn, 'aluminium', [[0, 0], [0.14, 0], [0.14, 0.01], [0.1, 0.016], [0.045, 0.02], [0, 0.02]], 16, 69.8, 0, -3.4);
    const iTex = canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#1d4f9c'; x.fillRect(0, 0, w, h); x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = '#ffffff'; x.font = '900 92px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('i', w / 2, h / 2 + 6); });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshStandardMaterial({ map: iTex, roughness: 0.5 }));
    cube.position.set(69.8, 3.3, -3.4); add(zn, cube);
  }
}
