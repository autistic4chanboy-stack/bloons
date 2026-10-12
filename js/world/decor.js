// Décor du Centre Commercial Hélios : colonnes, incrustations du sol, détails de plafond, bannières sous la
// verrière, totems publicitaires et plans, signalétique suspendue, kiosques garnis, cabines téléphoniques,
// manèges, poubelles de tri, casiers de consigne, chariots, panneaux « sol glissant ».
import * as THREE from 'three';
import '../data/decor.js';
import { ITEMS } from '../data/items.js';
import { registerShape } from './meshes.js';
import { Box, LAYER } from '../engine/physics.js';
import { Readable, Locker, PushButton } from './fixtures.js';
import { signTexture, posterTexture } from '../engine/textures.js';
import { SHOPS } from '../data/shops.js';

// ───────── formes des objets de décor ─────────
registerShape('mall_payphone', (k, s, c) => {
  const [w, h, d] = s;
  k.box(0, -h / 2 + 0.06, 0, w * 0.7, 0.12, d * 0.7, 0x263238);                 // socle
  k.box(0, -h * 0.05, -d * 0.35, w * 0.12, h * 0.9, 0.08, 0x90a4ae);           // mât
  k.box(0, h * 0.42, -d * 0.05, w, 0.1, d, c);                                  // auvent
  k.box(0, h * 0.36, -d * 0.05, w, 0.12, d, 0xfafafa, {});                      // bandeau
  k.box(-w * 0.48, h * 0.1, 0, 0.03, h * 0.55, d * 0.8, c); k.box(w * 0.48, h * 0.1, 0, 0.03, h * 0.55, d * 0.8, c); // joues
  k.box(0, h * 0.08, -d * 0.28, w * 0.5, h * 0.3, 0.14, 0x37474f);             // appareil
  k.box(0, h * 0.16, -d * 0.2, w * 0.3, h * 0.08, 0.02, 0x9ccc65);             // afficheur
  k.box(0, h * 0.02, -d * 0.2, w * 0.24, h * 0.1, 0.02, 0xb0bec5);             // clavier
  k.cap(-w * 0.2, h * 0.11, -d * 0.18, 0.025, 0.2, 0x111111, 0, 0, Math.PI / 2); // combiné
});
registerShape('mall_aframe', (k, s, c) => {
  const [w, h, d] = s; const a = 0.24;
  k.boxR(0, 0, -d * 0.22, w, h, 0.02, c, -a, 0, 0); k.boxR(0, 0, d * 0.22, w, h, 0.02, c, a, 0, 0);
  k.boxR(0, h * 0.05, -d * 0.235, w * 0.7, h * 0.18, 0.005, 0x111111, -a, 0, 0); k.boxR(0, h * 0.05, d * 0.235, w * 0.7, h * 0.18, 0.005, 0x111111, a, 0, 0);
  k.box(0, h * 0.47, 0, w * 0.9, 0.04, 0.08, c);
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
registerShape('mall_bin', (k, s, c) => {
  const [w, h, d] = s; const cols = [0xfdd835, 0x43a047, 0x78909c];
  k.box(0, -h * 0.05, 0, w, h * 0.9, d, c);
  for (let i = 0; i < 3; i++) { const x = (i - 1) * w / 3; k.box(x, h * 0.42, 0, w / 3 - 0.02, 0.08, d * 1.02, cols[i]); k.box(x, h * 0.3, d / 2 + 0.003, w / 3 - 0.12, 0.1, 0.005, 0x111111); }
});

// ───────── utilitaires ─────────
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

export function buildDecor(world, A, dev, rng) {
  const g = world.game;
  const add = (zone, mesh) => (world.zone(zone)?.group || world.root).add(mesh);
  const shapeIn = (zone, mat, geo, pos, rot, scl, color) => A.shape(zone, mat, geo, new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot || new THREE.Euler()), scl || new THREE.Vector3(1, 1, 1)), color);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── colonnes au bord du vide (RDC et étage), décalées des passages des présences ──
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  for (const x of [-60, -48, -36, 36, 48, 60]) for (const sz of [-1, 1]) {
    const z = sz * 4.4;
    for (const [y0, y1, f] of [[0, 4.1, 0], [5, 9.95, 1]]) {
      const zn = galZone(x, f);
      shapeIn(zn, 'aluminium', cyl, V(x, (y0 + y1) / 2, z), null, V(0.6, y1 - y0, 0.6));
      shapeIn(zn, 'granite', cyl, V(x, y0 + 0.06, z), null, V(0.72, 0.12, 0.72));
      world.physics.add(new Box(x - 0.31, y0, z - 0.31, x + 0.31, y1, z + 0.31, LAYER.WALL));
    }
  }
  // ── incrustations de granit au sol (RDC) ──
  for (const [x0, x1] of [[-63, -25], [25, 63]]) for (const z of [-3.1, 3.1]) A.box(galZone((x0 + x1) / 2, 0), 'granite', x0, 0.002, z - 0.14, x1, 0.006, z + 0.14, { collide: false });
  for (const [x0, x1] of [[-63, -25], [25, 63]]) for (let x = x0 + 4; x < x1 - 2; x += 8) A.box(galZone(x, 0), 'granite', x - 0.14, 0.002, -3.1, x + 0.14, 0.006, 3.1, { collide: false });
  // ── détails de plafond sous les coursives : haut-parleurs, détecteurs, sprinklers ──
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  for (let x = -61.5; x <= 61.5; x += 4.5) for (const z of [-6.8, 6.8]) for (const [yc, f] of [[4.6, 0], [10, 1]]) {
    const zn = galZone(x, f); const k = Math.round(x / 4.5) & 3;
    if (k === 0) shapeIn(zn, 'furniture', disc, V(x, yc - 0.015, z), null, V(0.26, 0.03, 0.26), 0xeceff1);      // haut-parleur
    else if (k === 2) shapeIn(zn, 'furniture', disc, V(x, yc - 0.03, z), null, V(0.13, 0.05, 0.13), 0xf5f5f5); // détecteur de fumée
    else shapeIn(zn, 'furniture_metal', disc, V(x, yc - 0.02, z + 0.6), null, V(0.05, 0.05, 0.05), 0xd4a017);  // sprinkler
  }
  // ── bannières suspendues sous la verrière ──
  const banners = [
    ['SOLDES\nD\'AUTOMNE', 'jusqu\'à -50 %\ndans vos boutiques', '#b71c1c', '#fff8e1'], ['HÉLIOS\n1987', '37 ans de sourires\nmerci à vous !', '#0d47a1', '#ffecb3'],
    ['NOUVEAU', 'Galaxy Arcade\nétage — côté est', '#4a148c', '#e1f5fe'], ['CARTE\nFIDÉLITÉ', '-10 % toute l\'année\nà l\'accueil', '#1b5e20', '#f1f8e9'],
    ['NOCTURNES', 'le vendredi\njusqu\'à 22 h', '#263238', '#ffd54f'], ['BOBBY\nVOUS ATTEND', 'Royaume du Jouet\nrez-de-chaussée', '#e65100', '#fff3e0'],
  ];
  const bgeo = new THREE.PlaneGeometry(1.6, 3.2);
  [-56, -36, -10, 10, 36, 56].forEach((x, i) => {
    const b = banners[i % banners.length]; const zn = galZone(x, 1);
    const bm = new THREE.MeshStandardMaterial({ map: bannerTex(b[0], b[1], b[2], b[3]), roughness: 0.9 });
    for (const s of [1, -1]) { const m = new THREE.Mesh(bgeo, bm); m.position.set(x + s * 0.004, 8.5, 0); m.rotation.y = s * Math.PI / 2; add(zn, m); } // recto-verso (texte lisible des deux côtés)
    A.box(zn, 'steel_dark', x - 0.01, 10.1, -0.85, x + 0.01, 11.2, -0.83, { collide: false }); A.box(zn, 'steel_dark', x - 0.01, 10.1, 0.83, x + 0.01, 11.2, 0.85, { collide: false });
    A.box(zn, 'steel_dark', x - 0.02, 10.08, -0.85, x + 0.02, 10.12, 0.85, { collide: false });
  });
  // ── totems publicitaires lumineux (double face) ──
  const totem = (zone, x, y, z, ry, p1, p2) => {
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.1, 0.32), g.mats.get('aluminium', zone)); body.position.y = 1.05; grp.add(body);
    for (const [s, p] of [[1, p1], [-1, p2]]) { const pm = new THREE.MeshBasicMaterial({ map: posterTexture(p) }); const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.42), pm); pl.position.set(0, 1.15, s * 0.165); if (s < 0) pl.rotation.y = Math.PI; grp.add(pl); world.zone(zone).signMats.push(pm); }
    add(zone, grp); const c = Math.abs(Math.sin(ry)) > 0.5; world.physics.add(new Box(x - (c ? 0.17 : 0.63), y, z - (c ? 0.63 : 0.17), x + (c ? 0.17 : 0.63), y + 2.1, z + (c ? 0.63 : 0.17), LAYER.FURN));
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
  const directory = (zone, x, y, z, ry) => {
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.22), g.mats.get('steel_dark', zone)); body.position.y = 1.0; grp.add(body);
    const sm = new THREE.MeshBasicMaterial({ map: dirTex }); const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.15), sm); pl.position.set(0, 1.2, 0.115); grp.add(pl); world.zone(zone).signMats.push(sm);
    add(zone, grp);
    const c = Math.abs(Math.sin(ry)) > 0.5;
    world.add(new Readable(world, world.newId('read'), { zone, name: 'Plan du centre', title: 'Plan du Centre Commercial Hélios', text: () => g.mapText(), box: [x - (c ? 0.15 : 0.6), y, z - (c ? 0.6 : 0.15), x + (c ? 0.15 : 0.6), y + 2, z + (c ? 0.6 : 0.15)] }));
    world.physics.add(new Box(x - (c ? 0.12 : 0.56), y, z - (c ? 0.56 : 0.12), x + (c ? 0.12 : 0.56), y + 2, z + (c ? 0.56 : 0.12), LAYER.FURN));
  };
  directory('atrium', -18.5, 0, -5.6, 0); directory('atrium', 18.5, 0, 5.6, Math.PI); directory('gallery1_w', -29.5, 5, 5.6, Math.PI); directory('gallery1_e', 29.5, 5, -5.6, 0);
  // ── signalétique suspendue (double face) sous les coursives ──
  const wayTex = (lines) => canvasTex(512, 128, (x, w, h) => { x.fillStyle = '#1a237e'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '700 30px Arial'; x.textBaseline = 'middle'; lines.forEach((l, i) => x.fillText(l, 18, 34 + i * 58)); });
  const hang = (zone, x, y, z, lines) => {
    const wm = new THREE.MeshBasicMaterial({ map: wayTex(lines) }); world.zone(zone).signMats.push(wm);
    for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), wm); m.position.set(x + s * 0.004, y - 0.55, z); m.rotation.y = s * Math.PI / 2; add(zone, m); }
    A.box(zone, 'steel_dark', x - 0.01, y - 0.3, z - 0.8, x + 0.01, y, z - 0.79, { collide: false }); A.box(zone, 'steel_dark', x - 0.01, y - 0.3, z + 0.79, x + 0.01, y, z + 0.8, { collide: false });
  };
  hang('gallery0_w', -26, 4.6, -6, ['← Poste de sécurité', 'Toilettes : étage →']); hang('gallery0_e', 26, 4.6, 6, ['Sortie · Parking →', '← Escalators']);
  hang('gallery1_w', -26, 10, 6, ['← Administration', 'Restauration · Ciné']); hang('gallery1_e', 26, 10, -6, ['Toilettes · Arcade →', '← Escalators']);
  // ── blocs de secours supplémentaires ──
  const exitTex = signTexture('SORTIE ➜', 0x00e676, { h: 100, fontSize: 64, font: 'Arial', bg: '#0a3d1a', textColor: '#d8ffe0' });
  for (const [zone, x, y, z, ry] of [['gallery0_w', -24.1, 4.2, 6.5, -Math.PI / 2], ['gallery0_e', 24.1, 4.2, -6.5, Math.PI / 2], ['gallery1_w', -24.1, 9.6, -6.5, -Math.PI / 2], ['gallery1_e', 65.83, 8.4, 0, -Math.PI / 2], ['gallery1_e', 24.1, 9.6, 6.5, Math.PI / 2], ['entrance', 66.2, 3.6, 0, Math.PI / 2], ['adm_couloir', -71, 8.3, 12.9, Math.PI]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: exitTex })); m.material.color.setScalar(1.6); m.position.set(x, y, z); m.rotation.y = ry; add(zone, m);
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
  const kiosk = (cx, title, color, stock) => {
    const zn = galZone(cx, 0);
    A.furn(zn, cx - 1.5, 0, -0.6, cx + 1.5, 0.95, 0.6, 0xf2efe8);                         // comptoir
    A.furn(zn, cx - 1.55, 0.95, -0.65, cx + 1.55, 1.0, 0.65, 0x3e2c1e, { collide: false });
    A.furn(zn, cx - 1.5, 0, 1.15, cx + 1.5, 1.9, 1.5, 0xf2efe8);                          // présentoir arrière
    for (const yy of [1.25, 1.6]) A.furn(zn, cx - 1.45, yy - 0.02, 0.8, cx + 1.45, yy, 1.15, 0xbdbdbd, { metal: true, collide: false });
    for (const [px, pz] of [[-1.7, -1.4], [1.7, -1.4], [-1.7, 1.6], [1.7, 1.6]]) A.furn(zn, cx + px - 0.04, 0, pz - 0.04, cx + px + 0.04, 2.7, pz + 0.04, 0x37474f, { metal: true });
    A.furn(zn, cx - 1.85, 2.7, -1.55, cx + 1.85, 2.82, 1.75, color, { collide: false });     // auvent
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.42), new THREE.MeshBasicMaterial({ map: signTexture(title, color, { h: 100, fontSize: 56, font: 'Arial' }) })); m.position.set(cx, 2.55, s > 0 ? 1.77 : -1.57); if (s < 0) m.rotation.y = Math.PI; add(zn, m); world.zone(zn).signMats.push(m.material); }
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
  A.box('entrance', 'rubber', 77.2, 0.001, -1.8, 79.9, 0.012, 1.8, { collide: false }); // tapis d'entrée
  // ── arrêts d'urgence des escalators (au pied de chaque escalator) ──
  const stopEsc = (game, actor, btn) => {
    game.sim.emit('fx', { s: 'beep', pos: [btn.o.x, btn.o.y, btn.o.z], v: 0.8 });
    if (!game.power.state.escalators) { game.sim.emit('toast', { text: 'Les escalators sont déjà à l\'arrêt.' }, { to: actor }); return; }
    game.power.set({ escalators: false }); game.noise?.(new THREE.Vector3(btn.o.x, btn.o.y, btn.o.z), 0.6, 'machine');
    game.sim.emit('toast', { text: 'Arrêt d\'urgence : escalators stoppés (relance depuis la console du poste).' }, { to: actor });
  };
  for (const [x, z, ry] of [[-15.2, -2.78, Math.PI], [-15.2, 2.78, 0], [15.2, -2.78, Math.PI], [15.2, 2.78, 0]]) world.add(new PushButton(world, world.newId('btn'), { zone: 'atrium', x, y: 0.95, z, ry, label: 'Arrêt d\'urgence de l\'escalator', press: stopEsc }));

  // ── entretien : panneaux « sol glissant », chariots de ménage ──
  dev('mall_wetsign', 'atrium', 2.6, 0.31, -2.4, 0.4, { prop: true }); dev('mall_wetsign', 'gallery1_e', 55, 5.31, -6.5, 1.2, { prop: true });
  dev('mall_wetsign', 'service_n0', -20, 0.31, 23.2, 0.2, { prop: true });
  dev('mall_cleancart', 'service_n0', -14, 0.5, 23.6, Math.PI / 2, { prop: true }); dev('mall_cleancart', 'gallery1_e', 60.5, 5.5, -6.6, 0.3, { prop: true });
}
