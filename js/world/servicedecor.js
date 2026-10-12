// Habillage des couloirs de service (RDC et étage, nord et sud) : lisses de protection et marquage au sol,
// rolls de livraison chargés, conteneurs à déchets (fouillables), palettes filmées ou empilées, transpalettes,
// balles de carton, armoires électriques. Tout est rangé contre le mur extérieur : le milieu du couloir (là où
// passent les présences) et les portes arrière des réserves restent dégagés.
import { Box, LAYER } from '../engine/physics.js';
import { Container } from './fixtures.js';
import { ITEMS } from '../data/items.js';

const CORRIDORS = [['service_s0', 0, -1], ['service_n0', 0, 1], ['service_s1', 5, -1], ['service_n1', 5, 1]];
// emplacements à laisser libres (affiches, inscription, chariot de ménage…) : [zone, x, demi-largeur]
const KEEP = [['service_s0', -60, 1.4], ['service_n0', 40, 1.4], ['service_s0', 30, 1.4], ['service_n0', 10, 1.6], ['service_n0', -20, 1.2], ['service_n0', -14, 1.2]];
const TRASH = ['soda', 'banana_peel', 'newspaper', 'pizza_box', 'magazine', 'water', 'apple'];
const LOOT = ['battery', 'duct_tape', 'gloves', 'fuse', 'screwdriver'];

export function buildServiceDecor(world, A, rng) {
  for (const [zn, y, s] of CORRIDORS) {
    const wallZ = s * 25.0;                 // face intérieure du mur extérieur
    const Zw = (d) => wallZ - s * d;        // à d mètres du mur extérieur
    // lisses de protection (mur extérieur) et marquage jaune le long des deux murs
    for (const [y0, y1] of [[0.25, 0.37], [0.85, 0.97]]) A.furn(zn, -74, y + y0, Math.min(Zw(0), Zw(0.07)), 78, y + y1, Math.max(Zw(0), Zw(0.07)), 0x8c9399, { metal: true, collide: false });
    for (const d of [1.0, 2.42]) A.furn(zn, -74, y, Math.min(Zw(d), Zw(d + 0.08)), 78, y + 0.004, Math.max(Zw(d), Zw(d + 0.08)), 0xd8b21a, { collide: false }); // zone de stockage | passage
    // armoire électrique murale (une par couloir)
    const ex = rng.range(-50, 50);
    A.furn(zn, ex - 0.4, y, Math.min(Zw(0), Zw(0.35)), ex + 0.4, y + 1.95, Math.max(Zw(0), Zw(0.35)), 0x9aa1a6, { metal: true });
    // double porte (joint central, paumelles, poignées à clé), persiennes basses, socle, chapeau, pictogramme de danger
    box(A, zn, ex - 0.4, y, 0.35, ex + 0.4, y + 0.1, 0.355, Zw, 0x2a2d30); box(A, zn, ex - 0.42, y + 1.95, -0.01, ex + 0.42, y + 1.98, 0.37, Zw, 0x7d858b);
    box(A, zn, ex - 0.004, y + 0.1, 0.35, ex + 0.004, y + 1.95, 0.353, Zw, 0x3a3f43);
    for (const sx of [-1, 1]) {
      for (const yy of [0.35, 1.0, 1.65]) box(A, zn, ex + sx * 0.39 - 0.01, y + yy, 0.35, ex + sx * 0.39 + 0.01, y + yy + 0.08, 0.36, Zw, 0x5f666b);
      box(A, zn, ex + sx * 0.06 - 0.012, y + 0.9, 0.35, ex + sx * 0.06 + 0.012, y + 1.08, 0.385, Zw, 0x222222);
      for (let k = 0; k < 5; k++) box(A, zn, ex + sx * 0.2 - 0.12, y + 0.2 + k * 0.04, 0.35, ex + sx * 0.2 + 0.12, y + 0.215 + k * 0.04, 0.356, Zw, 0x3a3f43);
    }
    A.furn(zn, ex - 0.25, y + 1.5, Math.min(Zw(0.351), Zw(0.356)), ex - 0.11, y + 1.64, Math.max(Zw(0.351), Zw(0.356)), 0xf2c230, { collide: false });
    // amas le long du mur extérieur
    let bins = 0;
    for (let x = -57 + rng.range(0, 3); x < 58; x += rng.range(7.5, 11)) {
      if (Math.abs(x - ex) < 2) continue;
      if (KEEP.some(([z, kx, w]) => z === zn && Math.abs(x - kx) < w + 1)) continue;
      const kind = rng.pick(['roll', 'roll', 'bin', 'pallet_load', 'pallets', 'jack', 'bale']);
      if (kind === 'roll') roll(A, zn, x, y, Zw, s, rng, rng.int(1, 2));
      else if (kind === 'bin') { bin(world, A, zn, x, y, Zw, s, rng, bins++ < 2); }
      else if (kind === 'pallet_load') { pallet(A, zn, x, y, Zw(0.5), s); A.furn(zn, x - 0.57, y + 0.145, Math.min(Zw(0.12), Zw(0.9)), x + 0.57, y + 0.145 + rng.range(0.7, 1.3), Math.max(Zw(0.12), Zw(0.9)), rng.pick([0xc9d3d8, 0xbfc9cf, 0xd6dde0]), { collide: false }); solid(world, x, y, Zw, 0.62, 0, 1.0, 1.5); }
      else if (kind === 'pallets') { const n = rng.int(3, 7); for (let k = 0; k < n; k++) pallet(A, zn, x, y + k * 0.144, Zw(0.5), s); solid(world, x, y, Zw, 0.62, 0, 1.0, n * 0.144); }
      else if (kind === 'jack') jack(A, zn, x, y, Zw, s);
      else { A.furn(zn, x - 0.55, y, Math.min(Zw(0.05), Zw(0.85)), x + 0.55, y + 0.75, Math.max(Zw(0.05), Zw(0.85)), 0xa07a50, { collide: false }); for (const dx of [-0.3, 0, 0.3]) A.furn(zn, x + dx - 0.012, y, Math.min(Zw(0.04), Zw(0.86)), x + dx + 0.012, y + 0.752, Math.max(Zw(0.04), Zw(0.86)), 0x2a2a2a, { collide: false }); solid(world, x, y, Zw, 0.56, 0.05, 0.86, 0.76); }
    }
  }
}

// boîte de collision unique pour un amas (x ± hw, entre d0 et d1 du mur, hauteur h)
function solid(world, x, y, Zw, hw, d0, d1, h) {
  const z0 = Zw(d0), z1 = Zw(d1);
  world.physics.add(new Box(x - hw, y, Math.min(z0, z1), x + hw, y + h, Math.max(z0, z1), LAYER.FURN, null));
}
function box(A, zn, x0, y0, d0, x1, y1, d1, Zw, color) { A.furn(zn, x0, y0, Math.min(Zw(d0), Zw(d1)), x1, y1, Math.max(Zw(d0), Zw(d1)), color, { collide: false, metal: color === 0x9aa1a6 || color === 0x7d858b }); }

// roll de livraison (chariot grillagé), chargé de cartons ; n rolls côte à côte
function roll(A, zn, x, y, Zw, s, rng, n) {
  const W = 0.82, D0 = 0.08, D1 = 0.8, H = 1.72, metal = 0x7d858b;
  for (let k = 0; k < n; k++) {
    const cx = x + (k - (n - 1) / 2) * (W + 0.08), x0 = cx - W / 2, x1 = cx + W / 2;
    for (const [px, pd] of [[x0, D0], [x1, D0], [x0, D1], [x1, D1]]) box(A, zn, px - 0.04, y, pd - 0.04, px + 0.04, y + 0.12, pd + 0.04, Zw, 0x222222); // roulettes
    box(A, zn, x0, y + 0.12, D0, x1, y + 0.17, D1, Zw, metal);                                                                 // plateau
    for (const px of [x0, x1]) for (const pd of [D0, D1]) box(A, zn, px - 0.015, y + 0.17, pd - 0.015, px + 0.015, y + H, pd + 0.015, Zw, metal);
    for (let h = 0.45; h < H; h += 0.4) {
      box(A, zn, x0, y + h, D0 - 0.01, x1, y + h + 0.02, D0 + 0.01, Zw, metal);                     // fond (côté mur)
      for (const px of [x0, x1]) box(A, zn, px - 0.01, y + h, D0, px + 0.01, y + h + 0.02, D1, Zw, metal); // côtés
    }
    for (let i = 1; i < 6; i++) { const px = x0 + i * W / 6; box(A, zn, px - 0.006, y + 0.17, D0 - 0.006, px + 0.006, y + H, D0 + 0.006, Zw, metal); }
    // cartons empilés
    let hy = y + 0.17;
    while (hy < y + 1.45 && rng.chance(0.85)) {
      const bh = rng.range(0.22, 0.42), inset = rng.range(0.02, 0.08);
      box(A, zn, x0 + inset, hy, D0 + 0.05, x1 - inset, hy + bh, D1 - rng.range(0.02, 0.15), Zw, rng.pick([0xa47a4a, 0xb08858, 0x9c7040, 0xc0a070]));
      hy += bh + 0.004;
    }
  }
  const z0 = Zw(D0 - 0.05), z1 = Zw(D1 + 0.05), hw = (n * (W + 0.08)) / 2;
  A.world.physics.add(new Box(x - hw, y, Math.min(z0, z1), x + hw, y + H, Math.max(z0, z1), LAYER.FURN, null));
}

// conteneur à déchets 660 L (fouillable pour les deux premiers de chaque couloir)
// cuve en polyéthylène aux angles arrondis (nervures, tourillons de levage), couvercle bombé à charnières, barre de
// préhension, quatre roulettes pivotantes (chapes, roues)
function bin(world, A, zn, x, y, Zw, s, rng, searchable) {
  const col = rng.pick([0x2e6b3a, 0x5b6066, 0x2e6b3a, 0xc9a227]), dk = shade(col, 0.82);
  const zc = (Zw(0.08) + Zw(0.86)) / 2;
  A.rbox(zn, 'furniture', x, y + 0.61, zc, 1.26, 0.98, 0.78, 0.05, col, { n: 2 });
  for (const dx of [-0.42, -0.14, 0.14, 0.42]) box(A, zn, x + dx - 0.02, y + 0.16, 0.86, x + dx + 0.02, y + 1.05, 0.875, Zw, dk); // nervures
  A.rbox(zn, 'furniture', x, y + 1.13, (Zw(0.05) + Zw(0.9)) / 2, 1.32, 0.07, 0.85, 0.03, dk, { n: 2 });
  for (const dx of [-0.45, 0.45]) box(A, zn, x + dx - 0.05, y + 1.08, 0.04, x + dx + 0.05, y + 1.14, 0.08, Zw, 0x1d1d1d);   // charnières
  box(A, zn, x - 0.55, y + 0.98, 0.88, x + 0.55, y + 1.02, 0.93, Zw, 0x333333);                                         // poignée
  for (const dx of [-0.64, 0.64]) box(A, zn, x + dx - 0.04, y + 0.8, 0.4, x + dx + 0.04, y + 0.88, 0.54, Zw, dk);         // tourillons
  for (const px of [x - 0.5, x + 0.5]) for (const pd of [0.2, 0.74]) {
    box(A, zn, px - 0.045, y + 0.085, pd - 0.035, px + 0.045, y + 0.12, pd + 0.035, Zw, 0x2a2a2a);
    A.lathe(zn, 'furniture', [[0, -0.02], [0.05, -0.02], [0.055, -0.012], [0.055, 0.012], [0.05, 0.02], [0, 0.02]], 10, px, y + 0.055, Zw(pd), 0x141414, { rz: Math.PI / 2 });
  }
  const z0 = Zw(0.05), z1 = Zw(0.93);
  const b = [x - 0.67, y, Math.min(z0, z1), x + 0.67, y + 1.17, Math.max(z0, z1)];
  world.physics.add(new Box(b[0], b[1], b[2], b[3], b[4], b[5], LAYER.FURN, null));
  if (!searchable) return;
  const contents = TRASH.filter(id => ITEMS[id] && rng.chance(0.4)).slice(0, 3);
  if (rng.chance(0.45)) { const l = LOOT.filter(id => ITEMS[id]); if (l.length) contents.push(rng.pick(l)); }
  world.add(new Container(world, world.newId('box'), { zone: zn, name: 'Conteneur à déchets', contents, box: [b[0] - 0.02, b[1], b[2] - 0.02, b[3] + 0.02, b[4] + 0.02, b[5] + 0.02] }));
}

// palette (1,2 × 0,8 m) posée à d (centre) du mur
function pallet(A, zn, x, y, zc, s) {
  const wood = 0xb08a5a, dark = 0x8d6a40;
  for (const dz of [-0.36, 0, 0.36]) A.furn(zn, x - 0.6, y, zc + dz - 0.05, x + 0.6, y + 0.1, zc + dz + 0.05, dark, { collide: false });
  for (let i = 0; i < 5; i++) { const px = x - 0.6 + 0.12 + i * 0.24; A.furn(zn, px - 0.07, y + 0.1, zc - 0.4, px + 0.07, y + 0.144, zc + 0.4, wood, { collide: false }); }
}

// transpalette garé le long du mur (fourches parallèles au mur)
function jack(A, zn, x, y, Zw, s) {
  const red = 0xd84315;
  for (const d of [0.12, 0.5]) box(A, zn, x - 0.62, y, d, x + 0.5, y + 0.08, d + 0.16, Zw, 0x3a3a3a);             // fourches
  box(A, zn, x + 0.5, y, 0.1, x + 0.78, y + 0.32, 0.68, Zw, red);                                                  // bloc hydraulique
  box(A, zn, x + 0.62, y + 0.32, 0.36, x + 0.67, y + 1.25, 0.41, Zw, 0x333333);                                    // timon
  box(A, zn, x + 0.6, y + 1.22, 0.2, x + 0.69, y + 1.27, 0.58, Zw, 0x222222);                                      // poignée
  solid(A.world, x + 0.08, y, Zw, 0.72, 0.1, 0.68, 0.35);
  solid(A.world, x + 0.645, y, Zw, 0.055, 0.2, 0.58, 1.27); // timon et poignée
}

function shade(c, k) { return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k); }
