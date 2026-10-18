// Textures procédurales (canvas) : sols, murs, plafonds, métaux, enseignes, affiches.
// Les surfaces PBR sont calculées dans des tableaux typés (couleur sRGB, hauteur, rugosité, métal) puis empaquetées
// en DEUX textures de données (pas de canvas : pas de prémultiplication de l'alpha, pas de copie de canvas gardée) :
//  - map (sRGB) : RVB = couleur, A = rugosité ABSOLUE ;
//  - normalMap : RVB = normale déduite de la hauteur (convention OpenGL : +Y = +v), A = métal.
// Les matériaux (materials.js) lisent la rugosité et le métal dans ces canaux alpha (champ `packed`, `metal`).
// Les pixels côté CPU sont libérés dès l'envoi au GPU (voir dataTex).
// Tous les champs de bruit (fbm, cellules de Voronoï) sont périodiques : les textures se répètent sans couture.
// Tailles : 1024 pour les grands sols vus de près (terrazzo, béton de sol, marbre, granit), 512 ailleurs.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = a; }
export function getMaxAnisotropy() { return maxAniso; }

export function canvas(w, h = w) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export function toTexture(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
function rgb(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }
// Tampons de travail réutilisés d'une texture à l'autre (la génération est séquentielle) : sans eux, chaque texture
// laisserait des dizaines de Mo de tableaux temporaires au ramasse-miettes. release() au début de chaque génération.
const pools = { f: new Map(), i: new Map() }, used = { f: new Map(), i: new Map() };
function take(n, k = 'f') { const u = used[k].get(n) || 0; let l = pools[k].get(n); if (!l) pools[k].set(n, l = []); if (u >= l.length) l.push(k === 'f' ? new Float32Array(n) : new Int32Array(n)); used[k].set(n, u + 1); return l[u]; }
let freeTimer = 0; // les tampons sont rendus à la mémoire peu après la dernière génération
function release() { used.f.clear(); used.i.clear(); clearTimeout(freeTimer); freeTimer = setTimeout(() => { pools.f.clear(); pools.i.clear(); }, 1500); }
// Texture de données RVBA 8 bits, mipmaps calculées par le GPU. Une fois envoyée (onUpdate), le tableau est remplacé par
// un texel neutre `fill` : la mémoire est rendue (une ré-émission, après une perte de contexte, donnerait une teinte unie).
function dataTex(data, size, srgb, fill) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.size = size; // taille sur le GPU (l'image CPU devient 1 × 1)
  t.onUpdate = () => { t.onUpdate = null; t.image = { data: new Uint8Array(fill), width: 1, height: 1 }; };
  t.needsUpdate = true;
  return t;
}
const FILL_MAP = [150, 150, 150, 200], FILL_NORMAL = [128, 128, 255, 0];

// ───────────────────────── champs procéduraux périodiques ─────────────────────────
// Bruit de valeur fractal : grille aléatoire px × py (cellules sur la largeur / la hauteur de l'image), lissée,
// octaves de fréquence double (gain = atténuation). px ≠ py donne des stries (bois, métal brossé). Résultat ramené à [0, 1].
function fbm(size, px, py, oct, seed, gain = 0.5, keep = false) {
  const out = keep ? new Float32Array(size * size) : take(size * size).fill(0), rnd = mulberry32(seed);
  const X0 = new Int32Array(size), X1 = new Int32Array(size), SX = new Float32Array(size), top = new Float32Array(size), dif = new Float32Array(size);
  let amp = 1;
  for (let o = 0; o < oct; o++) {
    const cx = Math.min(size, px << o), cy = Math.min(size, py << o);
    const L = new Float32Array(cx * cy); for (let i = 0; i < L.length; i++) L[i] = rnd();
    const kx = cx / size, ky = cy / size; let last = -1;
    for (let x = 0; x < size; x++) { const f = x * kx, i = f | 0, t = f - i; X0[x] = i % cx; X1[x] = (i + 1) % cx; SX[x] = t * t * (3 - 2 * t); }
    for (let y = 0; y < size; y++) {
      const f = y * ky, i = f | 0, t = f - i, s = t * t * (3 - 2 * t), row = y * size;
      if (i !== last) { // interpolation horizontale des deux rangées du réseau, une seule fois par rangée
        last = i; const r0 = (i % cy) * cx, r1 = ((i + 1) % cy) * cx;
        for (let x = 0; x < size; x++) { const u = SX[x], a = L[r0 + X0[x]], c = L[r1 + X0[x]], tp = a + (L[r0 + X1[x]] - a) * u; top[x] = amp * tp; dif[x] = amp * (c + (L[r1 + X1[x]] - c) * u - tp); }
      }
      for (let x = 0; x < size; x++) out[row + x] += top[x] + dif[x] * s;
    }
    amp *= gain;
  }
  return normalize(out);
}
function normalize(f) {
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < f.length; i++) { const v = f[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = hi > lo ? 1 / (hi - lo) : 0; for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * k;
  return f;
}
// Cellules de Voronoï (n × n points perturbés) : f1/f2 = distances (px) au 1er/2e point, id = cellule la plus proche.
function cells(size, n, seed, jitter = 0.9) {
  const rnd = mulberry32(seed), cs = size / n, P = new Float32Array(n * n * 2), R = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { P[i * 2] = (0.5 + (rnd() - 0.5) * jitter) * cs; P[i * 2 + 1] = (0.5 + (rnd() - 0.5) * jitter) * cs; R[i] = rnd(); }
  const N = size * size, f1 = take(N), f2 = take(N), id = take(N, 'i');
  const qx = new Float32Array(9), qy = new Float32Array(9), qk = new Int32Array(9);
  // cellule par cellule : les 9 points voisins (coordonnées dépliées) sont rassemblés une fois, puis on parcourt ses pixels
  for (let cy = 0; cy < n; cy++) {
    const ya = Math.ceil(cy * cs), yb = Math.min(size, Math.ceil((cy + 1) * cs));
    for (let cx = 0; cx < n; cx++) {
      let q = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = cy + dy, wy = yy < 0 ? yy + n : yy >= n ? yy - n : yy;
        for (let dx = -1; dx <= 1; dx++) { const xx = cx + dx, wx = xx < 0 ? xx + n : xx >= n ? xx - n : xx, k = wy * n + wx; qx[q] = xx * cs + P[k * 2]; qy[q] = yy * cs + P[k * 2 + 1]; qk[q] = k; q++; }
      }
      const xa = Math.ceil(cx * cs), xb = Math.min(size, Math.ceil((cx + 1) * cs));
      for (let y = ya; y < yb; y++) {
        const row = y * size;
        for (let x = xa; x < xb; x++) {
          let d1 = 1e9, d2 = 1e9, b = 0;
          for (let j = 0; j < 9; j++) { const ox = qx[j] - x, oy = qy[j] - y, d = ox * ox + oy * oy; if (d < d1) { d2 = d1; d1 = d; b = j; } else if (d < d2) d2 = d; }
          f1[row + x] = Math.sqrt(d1); f2[row + x] = Math.sqrt(d2); id[row + x] = qk[b];
        }
      }
    }
  }
  return { f1, f2, id, cs, rnd: R };
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Surface PBR en cours de calcul (couleur en sRGB 0..255, hauteur 0..1, rugosité 0..1, métal 0..1 facultatif)
function surf(size, metal = false) {
  const n = size * size;
  return { size, n, r: take(n), g: take(n), b: take(n), h: take(n).fill(0.5), ro: take(n).fill(0.6), me: metal ? take(n).fill(0) : null };
}
// relief : amplitude du relief (en pixels de texture) pour une hauteur de 0 à 1. Les champs sont en ordre « image »
// (ligne 0 = haut, comme un canvas) ; les données sont écrites de bas en haut (DataTexture : pas de retournement).
function packSurf(s, relief = 2, noMap = false) {
  const { size, n } = s, m = size - 1, k = relief * 0.5, H = s.h;
  let map = null;
  if (!noMap) {
    const d = new Uint8ClampedArray(n * 4);
    for (let y = 0; y < size; y++) for (let x = 0, i = y * size, j = (m - y) * size * 4; x < size; x++, i++, j += 4) { d[j] = s.r[i]; d[j + 1] = s.g[i]; d[j + 2] = s.b[i]; d[j + 3] = s.ro[i] * 255; }
    map = dataTex(d, size, true, FILL_MAP);
  }
  const nd = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < size; y++) {
    const yy = y * size, yu = ((y - 1) & m) * size, yd = ((y + 1) & m) * size, row = (m - y) * size;
    for (let x = 0; x < size; x++) {
      const nx = (H[yy + ((x - 1) & m)] - H[yy + ((x + 1) & m)]) * k, ny = (H[yd + x] - H[yu + x]) * k; // ligne du haut de l'image = +v
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1), j = (row + x) * 4;
      nd[j] = (nx * il * 0.5 + 0.5) * 255; nd[j + 1] = (ny * il * 0.5 + 0.5) * 255; nd[j + 2] = (il * 0.5 + 0.5) * 255; nd[j + 3] = s.me ? s.me[yy + x] * 255 : 0;
    }
  }
  return { map, normalMap: dataTex(nd, size, false, FILL_NORMAL), metal: !!s.me, packed: true };
}
// pondération d'une palette : [couleur sRGB, poids]
function picker(pal, rnd) { let t = 0; for (const p of pal) t += p[1]; return () => { let v = rnd() * t; for (const p of pal) { v -= p[1]; if (v <= 0) return p[0]; } return pal[0][0]; }; }

// ───────────────────────── Sols ─────────────────────────
// Terrazzo poli (galeries) : la texture couvre 4 m (1024 px ≈ 4 mm/px). Liant ciment clair, gros éclats de marbre
// anguleux (cellules de Voronoï rétrécies), petits éclats, pores, joints en laiton tous les 2 m, voile d'usure.
export function terrazzo(base = 0xd8cfc0) {
  return cached('terrazzo' + base, () => {
    release();
    const size = 1024, s = surf(size, true), [br, bg, bb] = rgb(base), rnd = mulberry32(base ^ 0x5a17);
    const mott = fbm(size, 4, 4, 4, 11), fine = fbm(size, 256, 256, 1, 12), wear = fbm(size, 3, 3, 4, 13), scuff = fbm(size, 24, 6, 2, 14);
    const big = cells(size, 112, 21), small = cells(size, 300, 22);
    const pal = picker([[[240, 237, 230], 6], [[226, 221, 211], 4], [[190, 188, 183], 4], [[152, 149, 144], 3], [[98, 96, 93], 2], [[56, 55, 53], 1.3], [[170, 112, 86], 1.2], [[208, 184, 152], 2.6], [[142, 152, 138], 0.8]], rnd);
    const nb = 112 * 112, ns = 300 * 300, bc = [], br2 = new Float32Array(nb), sc = [];
    for (let k = 0; k < nb; k++) { bc.push(pal()); br2[k] = 0.3 + rnd() * 0.28; }
    for (let k = 0; k < ns; k++) sc.push(pal());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, m = mott[i], f = fine[i];
      let k = 0.955 + (m - 0.5) * 0.09 + (f - 0.5) * 0.07, r = br * k, g = bg * k, b = bb * k * 0.995, ro = 0.22 + (m - 0.5) * 0.06, h = 0.5;
      const kb = big.id[i];
      if (big.f2[i] - big.f1[i] > 1.6 && big.f1[i] < br2[kb] * big.cs) {
        const c = bc[kb], v = 1 + (big.rnd[kb] - 0.5) * 0.12 + (f - 0.5) * 0.06; r = c[0] * v; g = c[1] * v; b = c[2] * v; ro = 0.1 + big.rnd[kb] * 0.05;
      } else if (small.f2[i] - small.f1[i] > 0.9 && small.f1[i] < 0.42 * small.cs && small.rnd[small.id[i]] < 0.75) {
        const c = sc[small.id[i]], v = 0.97 + (f - 0.5) * 0.08; r = c[0] * v; g = c[1] * v; b = c[2] * v; ro = 0.13;
      } else if (f > 0.93) { r *= 0.8; g *= 0.8; b *= 0.8; h = 0.4; ro = 0.4; } // pores du liant
      // joints en laiton (dalles de 2 m)
      const jx = x & 511, jy = y & 511;
      if (jx < 3 || jy < 3) { const e = (jx < 3 ? jx : jy); r = 172 + e * 6; g = 146 + e * 5; b = 92 + e * 3; s.me[i] = 0.85; ro = 0.34; h = 0.52; }
      // usure : voile mat et salissures (passages), rayures fines
      const w = sstep(0.55, 0.85, wear[i]); const sc2 = scuff[i] > 0.78 ? (scuff[i] - 0.78) * 2.5 : 0;
      ro = Math.min(1, ro + w * 0.16 + sc2 * 0.25); const dk = 1 - w * 0.07 - sc2 * 0.08;
      s.r[i] = r * dk; s.g[i] = g * dk; s.b[i] = b * dk; s.ro[i] = ro; s.h[i] = h;
    }
    return packSurf(s, 1.5);
  });
}

// Carrelage émaillé : biseaux arrondis, joints en creux salis, légère inclinaison propre à chaque carreau (les reflets se
// brisent d'un carreau à l'autre). Le relief et la rugosité sont partagés entre les variantes de couleur de même calepinage.
function tileStruct(n, key, rough) {
  return cached('tilestruct' + n + key + rough, () => {
    const size = 512, ts = size / n, gw = Math.max(2, ts * 0.03), bw = Math.max(3, ts * 0.06), rnd = mulberry32(n * 131 + key.length * 7 + Math.round(rough * 100));
    release();
    const s = surf(size), wave = fbm(size, 4, 4, 3, 31), fine = fbm(size, 128, 128, 2, 32, 0.5, true), dirt = fbm(size, 8, 8, 4, 33, 0.5, true);
    const tilt = []; for (let t = 0; t < n * n; t++) tilt.push([(rnd() - 0.5) * 0.004, (rnd() - 0.5) * 0.004, (rnd() - 0.5) * 0.06]);
    const mask = new Float32Array(size * size), idx = new Int16Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, tx = (x / ts) | 0, ty = (y / ts) | 0, lx = x - tx * ts, ly = y - ty * ts;
      const e = Math.min(lx, ly, ts - lx, ts - ly) - gw / 2; // distance au bord du carreau (px)
      const t = tilt[ty * n + tx]; idx[i] = ty * n + tx;
      if (e <= 0) { s.h[i] = 0.18 + dirt[i] * 0.05; s.ro[i] = 0.9; mask[i] = 0; continue; }
      const prof = e >= bw ? 1 : Math.sin((e / bw) * Math.PI / 2); // biseau arrondi
      s.h[i] = 0.3 + 0.42 * prof + ((lx - ts / 2) * t[0] + (ly - ts / 2) * t[1]) + (wave[i] - 0.5) * 0.03;
      s.ro[i] = Math.min(1, Math.max(0.04, rough * (0.85 + (fine[i] - 0.5) * 0.4 + t[2]) + (dirt[i] > 0.7 ? (dirt[i] - 0.7) * 0.5 : 0)));
      mask[i] = prof;
    }
    const tex = packSurf(s, 2.2, true), rough8 = new Uint8ClampedArray(size * size);
    for (let i = 0; i < rough8.length; i++) rough8[i] = s.ro[i] * 255; // la rugosité ira dans l'alpha de chaque variante de couleur
    return { normalMap: tex.normalMap, rough8, mask, idx, dirt, fine, size, n };
  });
}
export function tiles(color = 0xe8e4dc, grout = 0x8a857c, n = 4, key = '', rough = 0.35) {
  return cached('tiles' + color + '_' + grout + '_' + n + key, () => {
    const st = tileStruct(n, key, rough), size = st.size, [cr, cg, cb] = rgb(color), [gr, gg, gb] = rgb(grout), rnd = mulberry32(color & 0xffff);
    const vari = []; for (let t = 0; t < n * n; t++) vari.push([(rnd() - 0.5) * 0.07, (rnd() - 0.5) * 0.02]);
    const d = new Uint8ClampedArray(size * size * 4), m1 = size - 1;
    for (let i = 0; i < size * size; i++) {
      const m = st.mask[i], dirt = st.dirt[i], f = st.fine[i], j = ((m1 - ((i / size) | 0)) * size + (i % size)) * 4; // de bas en haut
      d[j + 3] = st.rough8[i];
      if (m <= 0) { const k = 0.82 + dirt * 0.25; d[j] = gr * k; d[j + 1] = gg * k; d[j + 2] = gb * k * 0.97; continue; }
      const v = vari[st.idx[i]], k = 1 + v[0] + (f - 0.5) * 0.035, edge = 0.93 + 0.07 * m; // biseau un peu plus sombre (glaçure plus fine)
      d[j] = cr * k * edge * (1 + v[1]); d[j + 1] = cg * k * edge; d[j + 2] = cb * k * edge * (1 - v[1]);
    }
    return { map: dataTex(d, size, true, FILL_MAP), normalMap: st.normalMap, metal: false, packed: true };
  });
}

// Béton : marbrures, nuages, granulats fins, bullage (pores), fissures capillaires, taches. key 'f' = dalle de sol
// (1024 px, surfacée et lustrée par endroits, taches d'huile), 'd' = sombre, autres = voiles et plafonds.
export function concrete(tone = 0x8d8a85, key = '') {
  return cached('concrete' + tone + key, () => {
    release();
    const floor = key === 'f', size = floor ? 1024 : 512, s = surf(size), [r0, g0, b0] = rgb(tone), seed = (tone & 0xffff) + key.length * 17;
    const big = fbm(size, 3, 3, 5, seed + 1), mid = fbm(size, 14, 14, 4, seed + 2), fine = fbm(size, size / 4, size / 4, 1, seed + 3), tint = fbm(size, 2, 2, 3, seed + 4);
    const pores = cells(size, floor ? 160 : 90, seed + 5), crack = cells(size, 5, seed + 6), cmask = fbm(size, 4, 4, 3, seed + 7), oil = floor ? fbm(size, 3, 3, 4, seed + 8) : null;
    for (let i = 0; i < size * size; i++) {
      let k = 1 + (big[i] - 0.5) * 0.2 + (mid[i] - 0.5) * 0.14 + (fine[i] - 0.5) * 0.1, h = 0.5 + (mid[i] - 0.5) * 0.25 + (fine[i] - 0.5) * 0.25;
      let ro = floor ? 0.62 + (big[i] - 0.5) * 0.36 + (fine[i] - 0.5) * 0.08 : 0.88 + (fine[i] - 0.5) * 0.08;
      const pr = pores.rnd[pores.id[i]];
      if (pr < 0.4 && pores.f1[i] < 0.6 + pr * 1.6) { k *= 0.72; h -= 0.35; ro = 0.95; } // bullage
      const ce = crack.f2[i] - crack.f1[i];
      if (ce < 1.1 && cmask[i] > 0.62) { k *= 0.6 + ce * 0.3; h -= 0.3 * (1.1 - ce); ro = 0.95; } // fissure capillaire
      if (oil && oil[i] > 0.7) { const o = (oil[i] - 0.7) * 3.3; k *= 1 - o * 0.35; ro -= o * 0.3; } // taches d'huile (sol de parking)
      const t = (tint[i] - 0.5) * 0.06;
      s.r[i] = r0 * k * (1 + t); s.g[i] = g0 * k; s.b[i] = b0 * k * (1 - t); s.h[i] = h; s.ro[i] = Math.min(1, Math.max(0.2, ro));
    }
    return packSurf(s, floor ? 1.2 : 1.6);
  });
}

// Enduit peint : peau d'orange, très légères nuances
export function plaster(color = 0xd9d4c8) {
  return cached('plaster' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), peel = fbm(size, 96, 96, 3, 41), mott = fbm(size, 3, 3, 4, 42), fine = fbm(size, 256, 256, 1, 43);
    for (let i = 0; i < size * size; i++) {
      const k = 1 + (mott[i] - 0.5) * 0.045 + (fine[i] - 0.5) * 0.02;
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = peel[i]; s.ro[i] = 0.86 + (peel[i] - 0.5) * 0.1;
    }
    return packSurf(s, 0.9);
  });
}

// Briques : appareil en panneresse, joints creux, arêtes ébréchées, nuances par brique
export function brick(color = 0x8e4b36) {
  return cached('brick' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), bw = 128, bh = 48, rnd = mulberry32(42);
    const vari = []; for (let i = 0; i < 256; i++) vari.push([(rnd() - 0.5) * 0.22, (rnd() - 0.5) * 0.08]);
    const grain = fbm(size, 48, 48, 3, 51), chip = fbm(size, 64, 64, 2, 52), mort = fbm(size, 128, 128, 2, 53);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, row = (y / bh) | 0, off = (row & 1) * bw / 2, col = (((x + off) / bw) | 0) & 15, lx = (x + off) % bw, ly = y % bh;
      const e = Math.min(lx, ly, bw - lx, bh - ly) - 3 - (chip[i] > 0.7 ? (chip[i] - 0.7) * 8 : 0);
      if (e <= 0) { const k = 0.58 + mort[i] * 0.12; s.r[i] = 200 * k; s.g[i] = 194 * k; s.b[i] = 182 * k; s.h[i] = 0.15; s.ro[i] = 0.95; continue; }
      const v = vari[(row * 16 + col) & 255], k = 1 + v[0] + (grain[i] - 0.5) * 0.18;
      s.r[i] = r0 * k * (1 + v[1]); s.g[i] = g0 * k; s.b[i] = b0 * k * (1 - v[1]); s.h[i] = 0.35 + Math.min(1, e / 3) * 0.4 + (grain[i] - 0.5) * 0.12; s.ro[i] = 0.86;
    }
    return packSurf(s, 3);
  });
}

// Parpaings peints (couloirs de service) : blocs poreux sous la peinture, joints légèrement creux
export function blockWall(color = 0xb8b4aa) {
  return cached('block' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), bw = 256, bh = 128;
    const pores = cells(size, 110, 61), mott = fbm(size, 4, 4, 4, 62), fine = fbm(size, 160, 160, 2, 63), grime = fbm(size, 2, 6, 4, 64);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, row = (y / bh) | 0, off = (row & 1) * bw / 2, lx = (x + off) % bw, ly = y % bh, e = Math.min(lx, ly, bw - lx, bh - ly) - 2.5;
      let k = 1 + (mott[i] - 0.5) * 0.07 + (fine[i] - 0.5) * 0.05 - (grime[i] > 0.7 ? (grime[i] - 0.7) * 0.3 : 0), h = 0.55 + (fine[i] - 0.5) * 0.15, ro = 0.8;
      if (pores.f1[i] < 1.1 && pores.rnd[pores.id[i]] < 0.5) { k *= 0.9; h -= 0.25; }
      if (e <= 0) { k *= 0.86; h = 0.3; ro = 0.88; } else if (e < 2) h -= (2 - e) * 0.1;
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = h; s.ro[i] = ro;
    }
    return packSurf(s, 2.4);
  });
}

// Parquet vitrifié : lames de ~20 cm, cernes et fil du bois, nœuds, aboutages décalés, joints fins
export function woodPlanks(color = 0x8d6038, key = '') {
  return cached('wood' + color + key, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), pw = 32, rnd = mulberry32(color + key.length);
    const np = size / pw, plank = []; for (let i = 0; i < np; i++) plank.push({ off: rnd() * size, len: 180 + rnd() * 200, tone: (rnd() - 0.5) * 0.22, ring: 0.35 + rnd() * 0.5, ph: rnd() * 10 });
    const fib = fbm(size, 4, 96, 3, 71), warp = fbm(size, 3, 12, 3, 72), fine = fbm(size, 32, 256, 2, 73), wear = fbm(size, 3, 3, 4, 74);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, p = plank[(x / pw) | 0], lx = x % pw, ly = (y + p.off) % p.len, seg = Math.floor((y + p.off) / p.len);
      const tone = p.tone + ((seg * 7919) % 13 - 6) * 0.012;
      if (lx < 1 || ly < 1) { s.r[i] = r0 * 0.35; s.g[i] = g0 * 0.33; s.b[i] = b0 * 0.3; s.h[i] = 0.2; s.ro[i] = 0.8; continue; }
      const rings = Math.sin((lx * p.ring + warp[i] * 9 + p.ph) * 1.7) * 0.5 + 0.5, grain = rings * 0.6 + fib[i] * 0.4;
      const k = 1 + tone + (grain - 0.5) * 0.3 + (fine[i] - 0.5) * 0.08;
      s.r[i] = r0 * k; s.g[i] = g0 * k * (0.98 + grain * 0.03); s.b[i] = b0 * k * (0.95 + grain * 0.05);
      s.h[i] = 0.55 + (fine[i] - 0.5) * 0.08 - rings * 0.04; s.ro[i] = Math.min(1, 0.32 + (1 - rings) * 0.08 + sstep(0.6, 0.9, wear[i]) * 0.25);
    }
    return packSurf(s, 1.4);
  });
}

// Moquette : velours bouclé (fibres), motif discret, nuances d'usure
export function carpet(color = 0x5a2a3a) {
  return cached('carpet' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), fib = fbm(size, 256, 256, 2, 81), tuft = fbm(size, 128, 128, 1, 82), mott = fbm(size, 6, 6, 4, 83);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, pat = (((x >> 5) + (y >> 5)) & 1) ? 0.03 : -0.03;
      const k = 1 + (fib[i] - 0.5) * 0.36 + (tuft[i] - 0.5) * 0.16 + (mott[i] - 0.5) * 0.14 + pat;
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = fib[i] * 0.7 + tuft[i] * 0.3; s.ro[i] = 1;
    }
    return packSurf(s, 1.6);
  });
}
// Moquette de bureau en dalles de 50 cm posées à quart de tour (le sens du velours alterne)
export function officeCarpet(color = 0x4a5262) {
  return cached('ocarpet' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), fa = fbm(size, 32, 256, 2, 91), fb = fbm(size, 256, 32, 2, 92), mott = fbm(size, 5, 5, 4, 93), fl = fbm(size, 256, 256, 1, 94);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, tx = x >> 7, ty = y >> 7, alt = (tx + ty) & 1, f = alt ? fa[i] : fb[i], seam = (x & 127) < 1 || (y & 127) < 1;
      const k = (1 + (f - 0.5) * 0.28 + (fl[i] - 0.5) * 0.16 + (mott[i] - 0.5) * 0.1 + (alt ? 0.025 : -0.025)) * (seam ? 0.82 : 1);
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = seam ? 0.3 : 0.5 + (fl[i] - 0.5) * 0.4; s.ro[i] = 1;
    }
    return packSurf(s, 1.2);
  });
}

// Lino / sol vinyle : moucheté, marbré, lés de 2 m, cire inégale
export function linoleum(color = 0x9fa59a) {
  return cached('lino' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), mott = fbm(size, 8, 8, 4, 101), fleck = fbm(size, 256, 256, 1, 102), wax = fbm(size, 3, 3, 4, 103), scuff = fbm(size, 40, 8, 2, 104);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, seam = (x & 255) < 1;
      let k = 1 + (mott[i] - 0.5) * 0.16; if (fleck[i] > 0.82) k += 0.12; else if (fleck[i] < 0.14) k -= 0.12;
      if (scuff[i] > 0.85) k -= (scuff[i] - 0.85) * 0.8;
      if (seam) k *= 0.8;
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = seam ? 0.35 : 0.5; s.ro[i] = 0.36 + wax[i] * 0.22 + (scuff[i] > 0.85 ? 0.2 : 0);
    }
    return packSurf(s, 0.8);
  });
}

// Damier noir et blanc (carreaux de 25 cm), biseaux et brillance variable
export function checker(c1 = 0x111111, c2 = 0xeeeeee) {
  return cached('checker' + c1 + c2, () => {
    release();
    const size = 512, s = surf(size), a = rgb(c1), b = rgb(c2), ts = 64, fine = fbm(size, 128, 128, 2, 111), wear = fbm(size, 4, 4, 4, 112), dirt = fbm(size, 16, 16, 3, 113);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, lx = x % ts, ly = y % ts, e = Math.min(lx, ly, ts - lx, ts - ly) - 1;
      if (e <= 0) { const k = 70 + dirt[i] * 40; s.r[i] = k; s.g[i] = k; s.b[i] = k; s.h[i] = 0.2; s.ro[i] = 0.9; continue; }
      const c = ((((x / ts) | 0) + ((y / ts) | 0)) & 1) ? a : b, k = 1 + (fine[i] - 0.5) * 0.06 - sstep(0.6, 0.9, wear[i]) * 0.05;
      s.r[i] = c[0] * k; s.g[i] = c[1] * k; s.b[i] = c[2] * k; s.h[i] = 0.3 + 0.35 * Math.min(1, e / 2.5); s.ro[i] = 0.18 + sstep(0.55, 0.9, wear[i]) * 0.25 + (fine[i] - 0.5) * 0.04;
    }
    return packSurf(s, 1.6);
  });
}

// Tôle larmée (escalators, paliers techniques) : métal brut, saleté dans les creux
export function diamondPlate(color = 0x9a9ea3) {
  return cached('diamond' + color, () => {
    release();
    const size = 512, s = surf(size, true), [r0, g0, b0] = rgb(color), dirt = fbm(size, 8, 8, 4, 121), brush = fbm(size, 4, 128, 2, 122);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, cx = x & 63, cy = y & 63, row = (y >> 6) & 1, dx = ((cx + (row ? 32 : 0)) & 63) - 32, dy = cy - 32;
      const a1 = Math.abs(dx * 0.8 + dy * 0.6), a2 = Math.abs(-dx * 0.6 + dy * 0.8), len = Math.abs(dy * 0.8 - dx * 0.6);
      const bump = Math.max(0, 1 - a1 / 4) * (len < 18 ? 1 : 0), bump2 = Math.max(0, 1 - a2 / 4) * (Math.abs(dy * 0.6 + dx * 0.8) < 18 ? 1 : 0);
      const bb = Math.max(bump, bump2), dd = dirt[i] > 0.6 && bb < 0.2 ? (dirt[i] - 0.6) * 1.6 : 0;
      const k = 1 + (brush[i] - 0.5) * 0.12 + bb * 0.12 - dd * 0.5;
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k * 1.01; s.h[i] = 0.4 + bb * 0.5; s.ro[i] = 0.42 - bb * 0.12 + dd * 0.4; s.me[i] = 1 - dd * 0.8;
    }
    return packSurf(s, 4);
  });
}

// Marches et tôles de palier d'escalator : aluminium moulé à nervures fines (pas de 8 mm pour une texture de 50 cm),
// rainures sombres encrassées, usure brillante au centre des nervures. Les nervures sont des colonnes de l'image (u constant)
export function stepCleats(color = 0xa9adb1) {
  return cached('cleats' + color, () => {
    release();
    const size = 512, s = surf(size, true), [r0, g0, b0] = rgb(color), dirt = fbm(size, 6, 6, 4, 251), wear = fbm(size, 3, 24, 3, 252), fine = fbm(size, 128, 256, 1, 253);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, lx = x & 7, groove = lx < 3, edge = lx === 3 || lx === 7;
      if (groove) { const k = 0.22 + dirt[i] * 0.12; s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = 0.05; s.ro[i] = 0.85; s.me[i] = 0.3; continue; }
      const w = sstep(0.45, 0.8, wear[i]), dd = dirt[i] > 0.62 ? (dirt[i] - 0.62) * 1.2 : 0;
      const k = (edge ? 0.86 : 1) * (1 + (fine[i] - 0.5) * 0.08 + w * 0.1 - dd * 0.4);
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = edge ? 0.7 : 0.85; s.ro[i] = 0.42 - w * 0.16 + dd * 0.3; s.me[i] = 1 - dd * 0.6;
    }
    return packSurf(s, 3);
  });
}

// Bardage / tôle ondulée galvanisée, coulures de rouille
export function corrugated(color = 0xa7aaa8) {
  return cached('corr' + color, () => {
    release();
    const size = 512, s = surf(size, true), [r0, g0, b0] = rgb(color), streak = fbm(size, 24, 3, 3, 131), rust = fbm(size, 6, 6, 4, 132), sp = cells(size, 18, 133);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, w = Math.sin(y / size * Math.PI * 2 * 16), spang = 1 + (sp.rnd[sp.id[i]] - 0.5) * 0.08;
      let k = (1 + w * 0.08 + (streak[i] - 0.5) * 0.15) * spang, r = r0 * k, g = g0 * k, b = b0 * k, me = 1, ro = 0.42 + (streak[i] - 0.5) * 0.1;
      const ru = sstep(0.62, 0.8, rust[i] * 0.7 + streak[i] * 0.3);
      if (ru > 0) { r = r * (1 - ru) + 128 * ru; g = g * (1 - ru) + 74 * ru; b = b * (1 - ru) + 44 * ru; me = 1 - ru; ro += ru * 0.45; }
      s.r[i] = r; s.g[i] = g; s.b[i] = b; s.h[i] = w * 0.5 + 0.5; s.ro[i] = ro; s.me[i] = me;
    }
    return packSurf(s, 6);
  });
}

// Faux plafond : dalles minérales de 50 cm fissurées, ossature en T laquée, quelques auréoles d'infiltration
export function ceilingTiles(color = 0xe6e3dc) {
  return cached('ceil' + color, () => {
    release();
    const size = 512, s = surf(size, true), [r0, g0, b0] = rgb(color), ts = 128, fis = fbm(size, 128, 128, 2, 141), worm = cells(size, 140, 142), mott = fbm(size, 8, 8, 3, 143), rnd = mulberry32(144);
    const stain = []; for (let t = 0; t < 16; t++) stain.push(rnd() < 0.12 ? { x: 20 + rnd() * 88, y: 20 + rnd() * 88, r: 20 + rnd() * 30 } : null);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, lx = x % ts, ly = y % ts, e = Math.min(lx, ly, ts - lx, ts - ly);
      if (e < 3) { const k = 0.97 + (fis[i] - 0.5) * 0.02; s.r[i] = 236 * k; s.g[i] = 235 * k; s.b[i] = 232 * k; s.h[i] = 0.8; s.ro[i] = 0.42; s.me[i] = 0; continue; } // ossature
      let k = 1 + (mott[i] - 0.5) * 0.05, h = 0.45 + (fis[i] - 0.5) * 0.12;
      if (worm.f2[i] - worm.f1[i] < 0.9 && worm.rnd[worm.id[i]] < 0.55) { k -= 0.16; h -= 0.18; } // fissures du minéral
      if (e < 5) h -= (5 - e) * 0.05;
      let r = r0 * k, g = g0 * k, b = b0 * k;
      const st = stain[((y / ts) | 0) * 4 + ((x / ts) | 0)];
      if (st) { const d = Math.hypot(lx - st.x, ly - st.y) / st.r; if (d < 1) { const ring = sstep(0.75, 0.95, d) * (1 - sstep(0.95, 1, d)), a = 0.06 + ring * 0.22; r *= 1 - a * 0.6; g *= 1 - a * 0.75; b *= 1 - a; } }
      s.r[i] = r; s.g[i] = g; s.b[i] = b; s.h[i] = h; s.ro[i] = 0.95; s.me[i] = 0;
    }
    return packSurf(s, 1.5);
  });
}

// Enrobé : granulats, liant usé, fissures, flaques plus lisses
export function asphalt() {
  return cached('asphalt', () => {
    release();
    const size = 512, s = surf(size), agg = cells(size, 170, 151), mott = fbm(size, 6, 6, 4, 152), fine = fbm(size, 256, 256, 1, 153), crack = cells(size, 6, 154), cm = fbm(size, 4, 4, 3, 155);
    for (let i = 0; i < size * size; i++) {
      const ar = agg.rnd[agg.id[i]], isAgg = agg.f2[i] - agg.f1[i] > 0.8 && agg.f1[i] < 1.4;
      let k = 66 + (mott[i] - 0.5) * 22 + (fine[i] - 0.5) * 18 + (isAgg ? (ar - 0.3) * 40 : 0), h = 0.5 + (isAgg ? 0.25 : 0) + (fine[i] - 0.5) * 0.15, ro = 0.9 - (mott[i] > 0.72 ? (mott[i] - 0.72) * 1.6 : 0);
      if (crack.f2[i] - crack.f1[i] < 1.2 && cm[i] > 0.6) { k *= 0.55; h = 0.2; ro = 0.95; }
      s.r[i] = k; s.g[i] = k; s.b[i] = k * 1.03; s.h[i] = h; s.ro[i] = Math.max(0.3, ro);
    }
    return packSurf(s, 2);
  });
}

// ───────────────────────── Métaux ─────────────────────────
// Panneau métallique (habillages, gaines) : brossé, joints, rivets, rayures, crasse ; rouille sans métal
export function metalPanel(color = 0x8f969c) {
  return cached('metal' + color, () => {
    release();
    const size = 512, s = surf(size, true), [r0, g0, b0] = rgb(color), brush = fbm(size, 3, 192, 3, 161), dirt = fbm(size, 6, 6, 4, 162), scr = fbm(size, 128, 4, 2, 163), rust = fbm(size, 8, 8, 4, 164);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, lx = x & 255, ly = y & 255, e = Math.min(lx, ly, 256 - lx, 256 - ly);
      const rv = Math.min(Math.hypot(lx - 14, ly - 14), Math.hypot(lx - 242, ly - 14), Math.hypot(lx - 14, ly - 242), Math.hypot(lx - 242, ly - 242));
      let k = 1 + (brush[i] - 0.5) * 0.14, h = 0.5 + (brush[i] - 0.5) * 0.04, ro = 0.32 + (brush[i] - 0.5) * 0.12, me = 1;
      const dd = dirt[i] > 0.58 ? (dirt[i] - 0.58) * 1.4 : 0; k -= dd * 0.35; ro += dd * 0.4; me -= dd * 0.5;
      if (scr[i] > 0.9) { k += 0.1; ro -= 0.08; }
      if (e < 2) { k *= 0.55; h = 0.2; ro = 0.6; } else if (rv < 4) { h = 0.5 + (1 - rv / 4) * 0.5; k *= 0.95; }
      let r = r0 * k, g = g0 * k, b = b0 * k;
      const ru = sstep(0.74, 0.86, rust[i] * 0.6 + dirt[i] * 0.4);
      if (ru > 0) { r = r * (1 - ru) + 120 * ru; g = g * (1 - ru) + 70 * ru; b = b * (1 - ru) + 42 * ru; me *= 1 - ru; ro += ru * 0.4; }
      s.r[i] = r; s.g[i] = g; s.b[i] = b; s.h[i] = h; s.ro[i] = Math.min(1, ro); s.me[i] = Math.max(0, me);
    }
    return packSurf(s, 2);
  });
}
// Métal brossé (aluminium, inox, acier galvanisé) : stries longues, micro-rayures, fleurs de zinc pour le galvanisé
export function brushedMetal(color = 0xb8bdc2, kind = 'alu') {
  return cached('brushed' + color + kind, () => {
    release();
    const size = 512, s = surf(size, true), [r0, g0, b0] = rgb(color), st = fbm(size, 2, 256, 3, 171), st2 = fbm(size, 8, 512, 1, 172), smudge = fbm(size, 4, 4, 4, 173), scr = cells(size, 9, 174);
    const galva = kind === 'galva' ? cells(size, 14, 175) : null;
    for (let i = 0; i < size * size; i++) {
      let k = 1 + (st[i] - 0.5) * 0.1 + (st2[i] - 0.5) * 0.06, ro = (kind === 'alu' ? 0.26 : 0.34) + (st[i] - 0.5) * 0.1 + (smudge[i] > 0.65 ? (smudge[i] - 0.65) * 0.5 : 0);
      if (galva) { const g = galva.rnd[galva.id[i]]; k *= 0.975 + g * 0.05; ro += (g - 0.5) * 0.08; }
      if (scr.f2[i] - scr.f1[i] < 0.6 && scr.rnd[scr.id[i]] < 0.3) { k += 0.08; ro -= 0.1; }
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = 0.5 + (st2[i] - 0.5) * 0.15; s.ro[i] = Math.min(1, Math.max(0.08, ro)); s.me[i] = 1;
    }
    return packSurf(s, 0.6);
  });
}
// Acier peint (charpente) : laque satinée, peau d'orange, éclats laissant voir le métal
export function paintedSteel(color = 0x4a5056) {
  return cached('psteel' + color, () => {
    release();
    const size = 512, s = surf(size, true), [r0, g0, b0] = rgb(color), peel = fbm(size, 64, 64, 3, 181), mott = fbm(size, 4, 4, 4, 182), chips = cells(size, 40, 183), dirt = fbm(size, 3, 12, 4, 184);
    for (let i = 0; i < size * size; i++) {
      const ch = chips.rnd[chips.id[i]] < 0.06 && chips.f1[i] < 2.5 + chips.rnd[chips.id[i]] * 30;
      let k = 1 + (mott[i] - 0.5) * 0.06 - (dirt[i] > 0.7 ? (dirt[i] - 0.7) * 0.4 : 0);
      if (ch) { s.r[i] = 150; s.g[i] = 152; s.b[i] = 155; s.h[i] = 0.3; s.ro[i] = 0.45; s.me[i] = 1; continue; }
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = 0.5 + (peel[i] - 0.5) * 0.3; s.ro[i] = 0.38 + (peel[i] - 0.5) * 0.08 + (dirt[i] > 0.7 ? 0.2 : 0); s.me[i] = 0;
    }
    return packSurf(s, 1);
  });
}

// ───────────────────────── Murs ─────────────────────────
// Lambris vertical (bureau, poste) : planches de 25 cm à rainures, fil du bois
export function woodPanelWall(color = 0x6b4a2e) {
  return cached('panelwall' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), pw = 64, fib = fbm(size, 96, 4, 3, 191), warp = fbm(size, 12, 3, 3, 192), fine = fbm(size, 256, 32, 2, 193), rnd = mulberry32(color);
    const tone = []; for (let p = 0; p < size / pw; p++) tone.push((rnd() - 0.5) * 0.16);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, lx = x % pw, groove = lx < 2 ? 1 : 0;
      const rings = Math.sin((lx * 0.5 + warp[i] * 10) * 1.4) * 0.5 + 0.5, k = (1 + tone[(x / pw) | 0] + (rings * 0.6 + fib[i] * 0.4 - 0.5) * 0.3 + (fine[i] - 0.5) * 0.06) * (groove ? 0.45 : 1);
      s.r[i] = r0 * k; s.g[i] = g0 * k * (0.98 + rings * 0.03); s.b[i] = b0 * k * (0.95 + rings * 0.05); s.h[i] = groove ? 0.15 : 0.55 - rings * 0.04; s.ro[i] = groove ? 0.8 : 0.45 + (1 - rings) * 0.1;
    }
    return packSurf(s, 2);
  });
}
// Tasseaux de bois (habillage acoustique) : lattes de 6 cm séparées par des fentes sombres
export function woodSlats(color = 0x9a6b42) {
  return cached('slats' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), pw = 40, gap = 10, fib = fbm(size, 128, 3, 3, 201), warp = fbm(size, 16, 3, 3, 202), rnd = mulberry32(color ^ 77);
    const tone = []; for (let p = 0; p < size / pw; p++) tone.push((rnd() - 0.5) * 0.18);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, lx = x % pw;
      if (lx < gap) { const k = 0.12 + (lx === 0 || lx === gap - 1 ? 0.05 : 0); s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = 0; s.ro[i] = 0.95; continue; }
      const e = Math.min(lx - gap, pw - lx), rings = Math.sin(((lx - gap) * 0.45 + warp[i] * 9) * 1.5) * 0.5 + 0.5, k = 1 + tone[(x / pw) | 0] + (rings * 0.55 + fib[i] * 0.45 - 0.5) * 0.3;
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k * 0.97; s.h[i] = 0.4 + Math.min(1, e / 3) * 0.5; s.ro[i] = 0.5 + (1 - rings) * 0.1;
    }
    return packSurf(s, 3);
  });
}

// ───────────────────────── Pierres de prestige ─────────────────────────
// Marbre blanc veiné : grandes dalles (1,25 × 0,625 m pour une texture de 5 m), veines déformées par du bruit,
// veinules secondaires, poli miroir (veines un peu plus mates), joints fins
export function marble(color = 0xe9e5de) {
  return cached('marble' + color, () => {
    release();
    const size = 1024, s = surf(size), [r0, g0, b0] = rgb(color), w1 = fbm(size, 3, 3, 6, 211), w2 = fbm(size, 6, 6, 5, 212), cloud = fbm(size, 4, 4, 5, 213), fine = fbm(size, 256, 256, 1, 214);
    const sw = 256, sh = 128, rnd = mulberry32(215), slabs = []; for (let k = 0; k < 64; k++) slabs.push({ a: (rnd() - 0.5) * 1.2 + 0.6, o: rnd() * 40, t: (rnd() - 0.5) * 0.05 });
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, row = (y / sh) | 0, off = (row & 1) * sw / 2, sx = (((x + off) / sw) | 0) % 4, sl = slabs[(row * 4 + sx) & 63], lx = (x + off) % sw, ly = y % sh;
      if (lx < 1 || ly < 1) { s.r[i] = r0 * 0.7; s.g[i] = g0 * 0.7; s.b[i] = b0 * 0.7; s.h[i] = 0.35; s.ro[i] = 0.5; continue; }
      const u = (x * Math.cos(sl.a) + y * Math.sin(sl.a)) / size;
      const t1 = 1 - Math.abs(Math.sin((u * 7 + w1[i] * 2.6 + sl.o) * Math.PI)), t2 = 1 - Math.abs(Math.sin((u * 19 + w2[i] * 3.5) * Math.PI));
      const a2 = t1 * t1, a4 = a2 * a2, a8 = a4 * a4, b2 = t2 * t2, b4 = b2 * b2, b8 = b4 * b4, b32 = b8 * b8 * b8 * b8;
      const vein = a8 * a4 * a2 * 0.85 + b32 * b8 * 0.45;
      const k = (1 + sl.t + (cloud[i] - 0.5) * 0.08 + (fine[i] - 0.5) * 0.02) * (1 - vein * 0.42);
      s.r[i] = r0 * k * (1 - vein * 0.02); s.g[i] = g0 * k; s.b[i] = b0 * k * (1 + vein * 0.03); s.h[i] = 0.5 - vein * 0.04; s.ro[i] = 0.07 + vein * 0.06 + (fine[i] - 0.5) * 0.02;
    }
    return packSurf(s, 0.6);
  });
}
// Granit poli : cristaux (quartz, feldspath, mica) à deux échelles, paillettes de mica brillantes, dalles de 60 cm
export function granite(color = 0x4a4744) {
  return cached('granite' + color, () => {
    release();
    const size = 1024, s = surf(size, true), [r0, g0, b0] = rgb(color), big = cells(size, 200, 221), small = cells(size, 360, 222), cloud = fbm(size, 4, 4, 4, 223), rnd = mulberry32(224);
    const dark = (r0 + g0 + b0) / 3 < 110;
    const pal = dark ? [[[22, 22, 23], 5], [[48, 47, 47], 4], [[86, 84, 82], 2], [[150, 148, 145], 1], [[205, 202, 198], 0.8], [[120, 96, 88], 0.5]] : [[[210, 204, 196], 4], [[176, 170, 164], 3], [[120, 116, 112], 2], [[60, 58, 57], 1.5], [[196, 160, 150], 1.2], [[30, 30, 31], 0.8]];
    const pk = picker(pal, rnd), bc = []; for (let k = 0; k < 200 * 200; k++) bc.push(pk()); const scc = []; for (let k = 0; k < 360 * 360; k++) scc.push(pk());
    const tint = [r0 / 74, g0 / 71, b0 / 68];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, lx = x % 192, ly = y % 192;
      if (lx < 1 || ly < 1) { s.r[i] = r0 * 0.5; s.g[i] = g0 * 0.5; s.b[i] = b0 * 0.5; s.h[i] = 0.35; s.ro[i] = 0.6; s.me[i] = 0; continue; }
      const sm = small.rnd[small.id[i]] < 0.5, c = sm ? scc[small.id[i]] : bc[big.id[i]], k = (0.94 + (cloud[i] - 0.5) * 0.12) * (dark ? 1 : 1);
      const mica = small.rnd[small.id[i]] > 0.985 && small.f1[i] < 1.2;
      s.r[i] = c[0] * k * (dark ? tint[0] : 1); s.g[i] = c[1] * k * (dark ? tint[1] : 1); s.b[i] = c[2] * k * (dark ? tint[2] : 1);
      s.h[i] = 0.5; s.ro[i] = mica ? 0.05 : 0.1 + big.rnd[big.id[i]] * 0.06; s.me[i] = mica ? 0.6 : 0;
    }
    return packSurf(s, 0.5);
  });
}
// Pierre calcaire adoucie : nuances crème, petits fossiles et vacuoles, dalles de 80 × 40 cm
export function stone(color = 0xb3aa9a) {
  return cached('stone' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), cloud = fbm(size, 3, 3, 5, 231), mid = fbm(size, 12, 12, 4, 232), vac = cells(size, 70, 233), fos = cells(size, 24, 234);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, row = (y / 128) | 0, off = (row & 1) * 128, lx = (x + off) % 256, ly = y % 128;
      if (lx < 2 || ly < 2) { s.r[i] = r0 * 0.62; s.g[i] = g0 * 0.6; s.b[i] = b0 * 0.58; s.h[i] = 0.2; s.ro[i] = 0.9; continue; }
      let k = 1 + (cloud[i] - 0.5) * 0.12 + (mid[i] - 0.5) * 0.08, h = 0.5 + (mid[i] - 0.5) * 0.1;
      if (vac.f1[i] < 1 + vac.rnd[vac.id[i]] * 1.2 && vac.rnd[vac.id[i]] < 0.35) { k *= 0.8; h -= 0.3; }
      const fr = fos.rnd[fos.id[i]]; if (fr < 0.25) { const d = fos.f1[i]; if (d < 6 && Math.abs(Math.sin(d * 2.2)) < 0.25) k *= 0.88; }
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = h; s.ro[i] = 0.62 + (cloud[i] - 0.5) * 0.12;
    }
    return packSurf(s, 1.4);
  });
}
// Sol caoutchouc à pastilles (escaliers, locaux techniques)
export function rubber(color = 0x2c2e30) {
  return cached('rubber' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), fine = fbm(size, 256, 256, 1, 241), dirt = fbm(size, 6, 6, 4, 242);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, dx = (x & 31) - 16, dy = (y & 31) - 16, d = Math.sqrt(dx * dx + dy * dy), stud = d < 9 ? (d < 7 ? 1 : (9 - d) / 2) : 0;
      const k = 1 + (fine[i] - 0.5) * 0.1 + stud * 0.06 - (dirt[i] > 0.6 ? (dirt[i] - 0.6) * 0.3 : 0) + (dirt[i] < 0.3 && stud < 0.5 ? 0.04 : 0);
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = 0.4 + stud * 0.45; s.ro[i] = 0.78 - stud * 0.1 + (fine[i] - 0.5) * 0.06;
    }
    return packSurf(s, 3);
  });
}

// ───────────────────────── Extérieur ─────────────────────────
// Dalles de béton du parvis et des trottoirs (40 × 40 cm, texture de 1,6 m) : nuance par dalle, granulats lavés,
// arêtes chanfreinées, joints sablés, salissures et usure au centre des dalles
export function paving(color = 0xaca79c) {
  return cached('paving' + color, () => {
    release();
    const size = 512, s = surf(size), [r0, g0, b0] = rgb(color), cw = 128, rnd = mulberry32(color & 0xfff), tone = [];
    for (let i = 0; i < 16; i++) tone.push([(rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.03]);
    const agg = cells(size, 150, 271), mott = fbm(size, 5, 5, 4, 272), fine = fbm(size, 256, 256, 1, 273), dirt = fbm(size, 3, 3, 4, 274);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, cx = (x / cw) | 0, cy = (y / cw) | 0, lx = x % cw, ly = y % cw, e = Math.min(lx, ly, cw - 1 - lx, cw - 1 - ly);
      if (e < 2) { const k = 0.46 + fine[i] * 0.12; s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k * 0.95; s.h[i] = 0.08; s.ro[i] = 0.96; continue; }
      const t = tone[cy * 4 + cx], ar = agg.rnd[agg.id[i]], isAgg = agg.f2[i] - agg.f1[i] > 0.9 && agg.f1[i] < 1.3;
      let k = 1 + t[0] + (mott[i] - 0.5) * 0.08 + (fine[i] - 0.5) * 0.1 + (isAgg ? (ar - 0.5) * 0.22 : 0) - (dirt[i] > 0.62 ? (dirt[i] - 0.62) * 0.35 : 0);
      s.r[i] = r0 * k * (1 + t[1]); s.g[i] = g0 * k; s.b[i] = b0 * k * (1 - t[1]); s.h[i] = 0.45 + Math.min(1, (e - 2) / 4) * 0.35 + (isAgg ? 0.08 : 0); s.ro[i] = 0.84 + (fine[i] - 0.5) * 0.1;
    }
    return packSurf(s, 2.2);
  });
}
// Gazon tondu (texture de 2 m) : brins en stries courtes orientées par touffes, trèfle, plaques jaunies, terre nue
export function grass() {
  return cached('grass', () => {
    release();
    const size = 512, s = surf(size), big = fbm(size, 3, 3, 4, 281), mid = fbm(size, 20, 20, 3, 282), bl1 = fbm(size, 96, 384, 1, 283), bl2 = fbm(size, 384, 96, 1, 284), tuft = cells(size, 36, 285), dry = fbm(size, 4, 4, 4, 286), clo = cells(size, 60, 287);
    for (let i = 0; i < size * size; i++) {
      const b = tuft.rnd[tuft.id[i]] < 0.5 ? bl1[i] : bl2[i], k = 0.62 + (b - 0.5) * 0.9 + (mid[i] - 0.5) * 0.35;
      const d = Math.max(0, (dry[i] - 0.58) * 2.4), cl = clo.rnd[clo.id[i]] < 0.12 && clo.f1[i] < 3.5 ? 1 : 0;
      let r = (56 + d * 46) * k, gg = (92 + d * 14 + cl * 10) * k, bb = (34 + d * 4) * k, h = 0.25 + b * 0.6 + cl * 0.1;
      if (big[i] < 0.16 && mid[i] < 0.45) { const t = Math.min(1, (0.16 - big[i]) * 9); r += (84 - r) * t; gg += (70 - gg) * t; bb += (52 - bb) * t; h -= t * 0.25; } // terre
      s.r[i] = r; s.g[i] = gg; s.b[i] = bb; s.h[i] = h; s.ro[i] = 0.9 + (b - 0.5) * 0.08;
    }
    return packSurf(s, 2.2);
  });
}
// Haie taillée (troène, charme ; texture de 1 m) : petites feuilles serrées, creux d'ombre, rameaux secs par endroits
export function hedge() {
  return cached('hedge', () => {
    release();
    const size = 512, s = surf(size), lf = cells(size, 110, 291), lf2 = cells(size, 190, 292), sh = fbm(size, 7, 7, 4, 293), fine = fbm(size, 256, 256, 1, 294), tw = fbm(size, 40, 40, 2, 295);
    for (let i = 0; i < size * size; i++) {
      const a = lf.rnd[lf.id[i]], e = Math.min(1, (lf.f2[i] - lf.f1[i]) / 2.5), b = lf2.rnd[lf2.id[i]], e2 = Math.min(1, (lf2.f2[i] - lf2.f1[i]) / 2);
      const top = a > b ? e : e2, hole = sh[i] < 0.3 ? (0.3 - sh[i]) * 3.3 : 0;
      let k = (0.5 + (a > b ? a : b) * 0.45 + (sh[i] - 0.5) * 0.6) * (0.45 + top * 0.55) * (1 - hole * 0.75);
      let r = 38 * k, g = 70 * k + fine[i] * 6, bb = 26 * k;
      if (tw[i] > 0.82 && hole < 0.2) { r = 70 * k + 10; g = 58 * k + 6; bb = 40 * k; } // rameaux secs
      s.r[i] = r; s.g[i] = g; s.b[i] = bb; s.h[i] = 0.2 + top * 0.55 * (1 - hole) + (sh[i] - 0.5) * 0.3; s.ro[i] = 0.62 + (1 - top) * 0.3;
    }
    return packSurf(s, 3.2);
  });
}
// Bardage de façade (cassettes de 2,5 × 1,25 m, texture de 2,5 m) : tôle laquée à grain fin, joints creux, légères
// ondulations de planéité, coulures sous les joints horizontaux
export function cladding(color = 0x8b9095) {
  return cached('cladding' + color, () => {
    release();
    const size = 512, s = surf(size, true), [r0, g0, b0] = rgb(color), fine = fbm(size, 256, 256, 1, 301), wav = fbm(size, 2, 4, 3, 302), streak = fbm(size, 64, 2, 3, 303), rnd = mulberry32(color & 0xfff), tone = [rnd(), rnd()];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, row = (y / 256) | 0, ly = y % 256, e = Math.min(x, 511 - x, ly, 255 - ly);
      if (e < 3) { const k = 0.24; s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = 0; s.ro[i] = 0.7; s.me[i] = 0.2; continue; }
      const run = ly < 90 ? (1 - ly / 90) * Math.max(0, streak[i] - 0.55) * 0.5 : 0;
      const k = 1 + (tone[row] - 0.5) * 0.05 + (fine[i] - 0.5) * 0.03 + (wav[i] - 0.5) * 0.04 - run;
      s.r[i] = r0 * k; s.g[i] = g0 * k; s.b[i] = b0 * k; s.h[i] = 0.55 + Math.min(1, (e - 3) / 3) * 0.2 + (wav[i] - 0.5) * 0.1; s.ro[i] = 0.42 + (fine[i] - 0.5) * 0.08 + run * 0.6; s.me[i] = 0.35;
    }
    return packSurf(s, 1.6);
  });
}

export function grate() {
  return cached('grate', () => {
    const size = 128; const c = canvas(size), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#9aa0a6';
    for (let i = 0; i < size; i += 16) { ctx.fillRect(i, 0, 4, size); ctx.fillRect(0, i, size, 4); }
    const t = toTexture(c, 1, 1); return { map: t };
  });
}

// Bruit blanc (grain de capteur du composite) : 3 canaux indépendants, échantillonnage au plus proche
export function noiseTexture(size = 256) {
  return cached('noisetex' + size, () => {
    const c = canvas(size), ctx = c.getContext('2d'); const img = ctx.createImageData(size, size); const rnd = mulberry32(99);
    for (let i = 0; i < size * size; i++) { img.data[i * 4] = rnd() * 255; img.data[i * 4 + 1] = rnd() * 255; img.data[i * 4 + 2] = rnd() * 255; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
  });
}

// Masque (« cookie ») du faisceau de la lampe torche, projeté par la SpotLight : point chaud, halo, anneaux du
// réflecteur, légère frange colorée et imperfections (traces sur la lentille). Valeurs linéaires (pas de sRGB).
export function flashlightCookie(size = 256) {
  return cached('cookie' + size, () => {
    const data = new Uint8Array(size * size * 4), rnd = mulberry32(4242), smudge = fbm(size, 6, 6, 4, 4243), ang = [];
    for (let k = 0; k < 24; k++) ang.push(rnd());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1, r = Math.sqrt(dx * dx + dy * dy), i = (y * size + x) * 4;
      if (r >= 1) { data[i] = data[i + 1] = data[i + 2] = 0; data[i + 3] = 255; continue; }
      const a = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5, sector = ang[Math.floor(a * 24) % 24] * 0.5 + ang[Math.floor(a * 24 + 0.5) % 24] * 0.5;
      const hot = Math.exp(-r * r / (0.21 * 0.21)), spill = 0.2 * (1 - sstep(0.6, 1, r)), rings = 0.045 * Math.pow(Math.sin(r * 34), 2) * sstep(0.25, 0.5, r) * (1 - r);
      const dip = -0.05 * Math.exp(-Math.pow((r - 0.3) / 0.05, 2)), imp = 1 + (smudge[y * size + x] - 0.5) * 0.12 + (sector - 0.5) * 0.05 * sstep(0.2, 0.6, r);
      let v = Math.max(0, (hot * 0.82 + spill + rings + dip) * imp);
      const fr = Math.exp(-Math.pow((r - 0.24) / 0.05, 2)); // frange : bleutée côté chaud, jaunâtre dans le halo
      const R = v * (1 - fr * 0.05 + sstep(0.3, 0.9, r) * 0.05), G = v, B = v * (1 + fr * 0.08 - sstep(0.3, 0.9, r) * 0.12);
      data[i] = Math.min(255, R * 255); data[i + 1] = Math.min(255, G * 255); data[i + 2] = Math.min(255, B * 255); data[i + 3] = 255;
    }
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  });
}

// ── Enseignes de magasins ──
export function signTexture(text, color, opts = {}) {
  const w = opts.w || 1024, h = opts.h || 160;
  const c = canvas(w, h), ctx = c.getContext('2d');
  const col = hex(color);
  ctx.fillStyle = opts.bg || '#0b0b10'; ctx.fillRect(0, 0, w, h);
  // bordure
  ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.globalAlpha = 0.6; ctx.strokeRect(8, 8, w - 16, h - 16); ctx.globalAlpha = 1;
  let fs = opts.fontSize || 92;
  ctx.font = `${opts.italic ? 'italic ' : ''}700 ${fs}px ${opts.font || 'Georgia, serif'}`;
  while (ctx.measureText(text).width > w - 60 && fs > 20) { fs -= 4; ctx.font = `${opts.italic ? 'italic ' : ''}700 ${fs}px ${opts.font || 'Georgia, serif'}`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = col; ctx.shadowBlur = 24;
  ctx.fillStyle = opts.textColor || '#fff8ee';
  ctx.fillText(text, w / 2, h / 2 + 4);
  ctx.shadowBlur = 8; ctx.fillStyle = opts.textColor || '#ffffff'; ctx.fillText(text, w / 2, h / 2 + 4);
  const t = toTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ── Affiches ──
const POSTERS = [
  { title: 'SOLDES', sub: 'jusqu\'à -70 %', bg: '#d32f2f', fg: '#fff' },
  { title: 'BOBBY', sub: 'Royaume du Jouet', bg: '#ffb300', fg: '#3e2723', bear: true },
  { title: 'AVEZ-VOUS VU LUCIE ?', sub: '8 ans — disparue le 14/11/1987\n0 800 19 87 13', bg: '#e8dcc0', fg: '#222', missing: true },
  { title: 'LA NUIT DES\nMANNEQUINS', sub: 'Au Ciné Hélios', bg: '#111', fg: '#e53935' },
  { title: 'SORTIE DE\nSECOURS', sub: '→', bg: '#1b5e20', fg: '#fff' },
  { title: 'INTERDIT', sub: 'au public', bg: '#fff', fg: '#c62828' },
  { title: 'HÉLIOS', sub: 'votre centre depuis 1987', bg: '#0d47a1', fg: '#ffeb3b' },
  { title: 'NOUVEAU !', sub: 'Galaxy Arcade — étage', bg: '#6a1b9a', fg: '#00e5ff' },
  { title: 'CONSIGNES', sub: 'Gardiens : pas de sous-sol\naprès 3h00', bg: '#fafafa', fg: '#111' },
  { title: 'PIZZA', sub: '01 47 70 12 34', bg: '#2e7d32', fg: '#fff' },
  { title: 'DANGER', sub: 'Haute tension', bg: '#ffd600', fg: '#111' },
  { title: 'B-13', sub: 'local condamné', bg: '#37474f', fg: '#ddd' },
];
export const POSTER_COUNT = POSTERS.length;
export function posterTexture(i) {
  return cached('poster' + i, () => {
    const p = POSTERS[i % POSTERS.length];
    const w = 256, h = 360; const c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = p.bg; ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(i * 31 + 7);
    // usure
    for (let k = 0; k < 300; k++) { ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`; ctx.fillRect(rnd() * w, rnd() * h, rnd() * 30, rnd() * 3); }
    ctx.fillStyle = p.fg; ctx.textAlign = 'center';
    if (p.missing) {
      ctx.font = '700 22px Arial'; ctx.fillText('AVEZ-VOUS VU', w / 2, 40); ctx.font = '900 46px Arial'; ctx.fillText('LUCIE ?', w / 2, 90);
      ctx.fillStyle = '#9e9e9e'; ctx.fillRect(48, 108, 160, 150);
      // visage stylisé (photo noir et blanc)
      ctx.fillStyle = '#d7ccc8'; ctx.beginPath(); ctx.arc(128, 175, 42, 0, 7); ctx.fill();
      ctx.fillStyle = '#5d4037'; ctx.beginPath(); ctx.arc(128, 160, 46, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(110, 170, 7, 7); ctx.fillRect(140, 170, 7, 7); ctx.fillRect(118, 196, 20, 3);
      ctx.fillStyle = '#ffeb3b'; ctx.fillRect(80, 220, 96, 38);
      ctx.fillStyle = p.fg; ctx.font = '15px Arial';
      p.sub.split('\n').forEach((l, j) => ctx.fillText(l, w / 2, 290 + j * 22));
    } else if (p.bear) {
      ctx.fillStyle = '#8d5a24'; ctx.beginPath(); ctx.arc(128, 170, 70, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(70, 110, 28, 0, 7); ctx.arc(186, 110, 28, 0, 7); ctx.fill();
      ctx.fillStyle = '#f3d2a2'; ctx.beginPath(); ctx.ellipse(128, 195, 34, 26, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(100, 150, 9, 0, 7); ctx.arc(156, 150, 9, 0, 7); ctx.arc(128, 185, 10, 0, 7); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(128, 195, 18, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = p.fg; ctx.font = '900 54px Arial'; ctx.fillText(p.title, w / 2, 300); ctx.font = '18px Arial'; ctx.fillText(p.sub, w / 2, 330);
    } else {
      ctx.font = '900 40px Arial';
      p.title.split('\n').forEach((l, j) => ctx.fillText(l, w / 2, 110 + j * 46));
      ctx.font = '20px Arial';
      p.sub.split('\n').forEach((l, j) => ctx.fillText(l, w / 2, 250 + j * 26));
    }
    const t = toTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  });
}

// ── Ciel nocturne de la ville (vu à travers les vitres) : texture de façades d'immeubles ──
export function buildingFacade(seed = 1) {
  return cached('facade' + seed, () => {
    const w = 256, h = 512; const c = canvas(w, h), ctx = c.getContext('2d'); const rnd = mulberry32(seed);
    ctx.fillStyle = '#0c0d12'; ctx.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 8; y += 22) for (let x = 8; x < w - 8; x += 18) {
      const on = rnd() < 0.18;
      ctx.fillStyle = on ? (rnd() < 0.5 ? '#ffd890' : '#bfd7ff') : '#15161d';
      ctx.globalAlpha = on ? 0.6 + rnd() * 0.4 : 1;
      ctx.fillRect(x, y, 11, 14);
    }
    ctx.globalAlpha = 1;
    const t = toTexture(c); return t;
  });
}

// Texture de texte libre (panneaux, post-it, notes)
export function textTexture(lines, opts = {}) {
  const w = opts.w || 256, h = opts.h || 256;
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = opts.bg || '#fff59d'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = opts.color || '#1a1a1a'; ctx.font = opts.font || '20px "Comic Sans MS", cursive';
  ctx.textBaseline = 'top';
  let y = opts.pad ?? 14;
  for (const l of lines) { ctx.fillText(l, opts.pad ?? 14, y); y += opts.lh || 26; }
  const t = toTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
