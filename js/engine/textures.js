// Textures procédurales (canvas) : sols, murs, plafonds, enseignes, affiches, atlas d'étiquettes produits.
import * as THREE from 'three';
import { makeNoise2D, mulberry32 } from './rng.js';

const noise = makeNoise2D(1987);
let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = a; }

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
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

// Génère un canvas couleur + hauteur via une fonction pixel f(x, y) -> [r, g, b, h, rough]
function pixelGen(size, f) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const H = new Float32Array(size * size);
  const R = new Uint8ClampedArray(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = f(x, y);
    const i = (y * size + x);
    img.data[i * 4] = clamp(o[0]); img.data[i * 4 + 1] = clamp(o[1]); img.data[i * 4 + 2] = clamp(o[2]); img.data[i * 4 + 3] = 255;
    H[i] = o[3] ?? 0.5; R[i] = clamp((o[4] ?? 0.6) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return { c, H, R, size };
}

function normalCanvas(H, size, strength = 2) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = H[y * size + ((x - 1 + size) % size)], r = H[y * size + ((x + 1) % size)];
    const u = H[((y - 1 + size) % size) * size + x], d = H[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * size + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function roughCanvas(R, size) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { img.data[i * 4] = 0; img.data[i * 4 + 1] = R[i]; img.data[i * 4 + 2] = 0; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

function pack(g, rx, ry, nStrength = 2) {
  return {
    map: toTexture(g.c, rx, ry),
    normalMap: toTexture(normalCanvas(g.H, g.size, nStrength), rx, ry, false),
    roughnessMap: toTexture(roughCanvas(g.R, g.size), rx, ry, false),
  };
}

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

// ── Sols ──
export function terrazzo(base = 0xd8cfc0) {
  return cached('terrazzo' + base, () => {
    const [br, bg, bb] = rgb(base); const rnd = mulberry32(7);
    const size = 512;
    const chips = []; for (let i = 0; i < 3800; i++) chips.push([rnd() * size, rnd() * size, 0.7 + rnd() * 1.6, rnd()]);
    // grille de chips pour lookup rapide
    const grid = new Map(); const cs = 16;
    for (const ch of chips) { const k = ((ch[0] / cs) | 0) + ',' + ((ch[1] / cs) | 0); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(ch); }
    const g = pixelGen(size, (x, y) => {
      const n = noise.tile(x / 64, y / 64, 8, 3);
      let r = br + (n - 0.5) * 18, gg = bg + (n - 0.5) * 18, b = bb + (n - 0.5) * 16, h = 0.5, ro = 0.28;
      const gx = (x / cs) | 0, gy = (y / cs) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(((gx + dx + 32) % 32) + ',' + ((gy + dy + 32) % 32)); if (!arr) continue;
        for (const ch of arr) {
          let ddx = Math.abs(ch[0] - x); ddx = Math.min(ddx, size - ddx); let ddy = Math.abs(ch[1] - y); ddy = Math.min(ddy, size - ddy);
          if (ddx * ddx + ddy * ddy < ch[2] * ch[2]) {
            const t = ch[3];
            if (t < 0.3) { r = 120; gg = 116; b = 110; } else if (t < 0.6) { r = 236; gg = 232; b = 224; } else if (t < 0.8) { r = 190; gg = 150; b = 120; } else { r = 150; gg = 156; b = 150; }
            h = 0.52; ro = 0.18;
          }
        }
      }
      // grandes dalles 2 m (la texture couvre 4 m)
      if (x % 256 < 2 || y % 256 < 2) { r *= 0.7; gg *= 0.7; b *= 0.7; h = 0.35; ro = 0.6; }
      return [r, gg, b, h, ro];
    });
    return pack(g, 1, 1, 3);
  });
}

export function tiles(color = 0xe8e4dc, grout = 0x8a857c, n = 4, key = '', rough = 0.35) {
  return cached('tiles' + color + grout + n + key, () => {
    const [cr, cg, cb] = rgb(color), [gr, gg2, gb] = rgb(grout); const size = 512; const ts = size / n; const rnd = mulberry32(color & 0xffff);
    const vari = []; for (let i = 0; i < n * n; i++) vari.push((rnd() - 0.5) * 16);
    const g = pixelGen(size, (x, y) => {
      const tx = (x / ts) | 0, ty = (y / ts) | 0, lx = x % ts, ly = y % ts;
      const gw = 3;
      if (lx < gw || ly < gw) return [gr, gg2, gb, 0.3, 0.9];
      const v = vari[ty * n + tx]; const nn = (noise.tile(x / 40, y / 40, 512 / 40 | 0, 2) - 0.5) * 10;
      const edge = Math.min(lx - gw, ly - gw, ts - lx, ts - ly);
      const bev = edge < 4 ? 0.5 + edge * 0.04 : 0.66;
      return [cr + v + nn, cg + v + nn, cb + v + nn, bev, rough];
    });
    return pack(g, 1, 1, 2.5);
  });
}

export function concrete(tone = 0x8d8a85, key = '') {
  return cached('concrete' + tone + key, () => {
    const [r0, g0, b0] = rgb(tone); const size = 512; const rnd = mulberry32(tone);
    const spots = []; for (let i = 0; i < 40; i++) spots.push([rnd() * size, rnd() * size, 10 + rnd() * 60, rnd() * 0.25]);
    const g = pixelGen(size, (x, y) => {
      const n = noise.tile(x / 32, y / 32, 16, 5); const fine = noise.tile(x / 3, y / 3, 170, 1);
      let d = (n - 0.5) * 40 + (fine - 0.5) * 12;
      for (const s of spots) { let dx = Math.abs(s[0] - x); dx = Math.min(dx, size - dx); let dy = Math.abs(s[1] - y); dy = Math.min(dy, size - dy); const q = Math.hypot(dx, dy) / s[2]; if (q < 1) d -= (1 - q) * 30 * s[3] * 4; }
      return [r0 + d, g0 + d, b0 + d * 0.95, 0.5 + (n - 0.5) * 0.6 + (fine - 0.5) * 0.1, 0.85 - (n - 0.5) * 0.3];
    });
    return pack(g, 1, 1, 1.5);
  });
}

export function plaster(color = 0xd9d4c8) {
  return cached('plaster' + color, () => {
    const [r0, g0, b0] = rgb(color); const size = 256;
    const g = pixelGen(size, (x, y) => {
      const n = noise.tile(x / 16, y / 16, 16, 4); const d = (n - 0.5) * 14;
      return [r0 + d, g0 + d, b0 + d, n * 0.4, 0.9];
    });
    return pack(g, 1, 1, 0.8);
  });
}

export function brick(color = 0x8e4b36) {
  return cached('brick' + color, () => {
    const [r0, g0, b0] = rgb(color); const size = 512; const bw = 128, bh = 48; const rnd = mulberry32(42);
    const vari = []; for (let i = 0; i < 200; i++) vari.push((rnd() - 0.5) * 40);
    const g = pixelGen(size, (x, y) => {
      const row = (y / bh) | 0; const off = (row % 2) * bw / 2; const col = (((x + off) / bw) | 0);
      const lx = (x + off) % bw, ly = y % bh;
      if (lx < 5 || ly < 5) { const m = 150 + (noise.tile(x / 4, y / 4, 128, 1) - 0.5) * 30; return [m, m * 0.97, m * 0.92, 0.2, 0.95]; }
      const v = vari[(row * 7 + col) % 200]; const n = (noise.tile(x / 12, y / 12, 42, 3) - 0.5) * 30;
      return [r0 + v + n, g0 + v * 0.6 + n, b0 + v * 0.5 + n, 0.6 + n / 200, 0.9];
    });
    return pack(g, 1, 1, 3);
  });
}

export function blockWall(color = 0xb8b4aa) {
  return cached('block' + color, () => {
    const [r0, g0, b0] = rgb(color); const size = 512; const bw = 256, bh = 128;
    const g = pixelGen(size, (x, y) => {
      const row = (y / bh) | 0; const off = (row % 2) * bw / 2; const lx = (x + off) % bw, ly = y % bh;
      const n = (noise.tile(x / 10, y / 10, 51, 3) - 0.5) * 22;
      if (lx < 4 || ly < 4) return [r0 * 0.75, g0 * 0.75, b0 * 0.75, 0.2, 0.95];
      return [r0 + n, g0 + n, b0 + n, 0.55 + n / 300, 0.92];
    });
    return pack(g, 1, 1, 2);
  });
}

export function woodPlanks(color = 0x8d6038, key = '') {
  return cached('wood' + color + key, () => {
    const [r0, g0, b0] = rgb(color); const size = 512; const pw = 64; const rnd = mulberry32(color);
    const offs = []; for (let i = 0; i < 16; i++) offs.push([rnd() * 512, (rnd() - 0.5) * 30]);
    const g = pixelGen(size, (x, y) => {
      const p = (x / pw) | 0; const lx = x % pw; const o = offs[p % 16];
      const ly = (y + o[0]) % 512;
      if (lx < 2 || ly < 2) return [r0 * 0.4, g0 * 0.4, b0 * 0.4, 0.2, 0.8];
      const grain = Math.sin((lx * 0.3 + noise.tile(x / 8, ly / 40, 64, 2) * 18)) * 0.5 + 0.5;
      const v = o[1] + (grain - 0.5) * 24 + (noise.tile(x / 30, y / 30, 17, 2) - 0.5) * 20;
      return [r0 + v, g0 + v * 0.8, b0 + v * 0.6, 0.5 + grain * 0.1, 0.55];
    });
    return pack(g, 1, 1, 1.2);
  });
}

export function carpet(color = 0x5a2a3a) {
  return cached('carpet' + color, () => {
    const [r0, g0, b0] = rgb(color); const size = 256;
    const g = pixelGen(size, (x, y) => {
      const n = noise.tile(x / 2, y / 2, 128, 2), m = noise.tile(x / 30, y / 30, 8, 2);
      const pat = ((x >> 4) + (y >> 4)) % 2 ? 6 : -6;
      const d = (n - 0.5) * 40 + (m - 0.5) * 20 + pat;
      return [r0 + d, g0 + d, b0 + d, n, 1];
    });
    return pack(g, 1, 1, 1);
  });
}

export function linoleum(color = 0x9fa59a) {
  return cached('lino' + color, () => {
    const [r0, g0, b0] = rgb(color); const size = 256;
    const g = pixelGen(size, (x, y) => {
      const n = noise.tile(x / 6, y / 6, 42, 3); const d = (n - 0.5) * 30 + (noise.tile(x / 1.5, y / 1.5, 170, 1) > 0.8 ? 25 : 0);
      return [r0 + d, g0 + d, b0 + d, 0.5, 0.45];
    });
    return pack(g, 1, 1, 0.5);
  });
}

export function checker(c1 = 0x111111, c2 = 0xeeeeee) {
  return cached('checker' + c1 + c2, () => {
    const a = rgb(c1), b = rgb(c2); const size = 256;
    const g = pixelGen(size, (x, y) => {
      const n = (noise.tile(x / 8, y / 8, 32, 2) - 0.5) * 12;
      const lx = x % 128, ly = y % 128;
      if (lx < 1 || ly < 1) return [90, 90, 90, 0.3, 0.8];
      const c = (((x / 128) | 0) + ((y / 128) | 0)) % 2 ? a : b;
      return [c[0] + n, c[1] + n, c[2] + n, 0.55, 0.3];
    });
    return pack(g, 1, 1, 1.5);
  });
}

export function diamondPlate(color = 0x9a9ea3) {
  return cached('diamond' + color, () => {
    const [r0, g0, b0] = rgb(color); const size = 256;
    const g = pixelGen(size, (x, y) => {
      const cx = x % 32, cy = y % 32; const row = ((y / 32) | 0) % 2;
      const ox = row ? 16 : 0;
      const dx = ((cx + ox) % 32) - 16, dy = cy - 16;
      const a = Math.abs(dx * 0.8 + dy * 0.6), b = Math.abs(-dx * 0.6 + dy * 0.8);
      const bump = (a < 2.2 && Math.abs(dy) < 9) ? 1 : 0;
      const n = (noise.tile(x / 6, y / 6, 42, 3) - 0.5) * 30;
      const v = bump ? 30 : 0;
      return [r0 + n + v, g0 + n + v, b0 + n + v, 0.4 + bump * 0.4 + b * 0, 0.45 - bump * 0.1];
    });
    return pack(g, 1, 1, 4);
  });
}

export function corrugated(color = 0xa7aaa8) {
  return cached('corr' + color, () => {
    const [r0, g0, b0] = rgb(color); const size = 256;
    const g = pixelGen(size, (x, y) => {
      const s = Math.sin(y / 256 * Math.PI * 2 * 16);
      const n = (noise.tile(x / 10, y / 30, 25, 3) - 0.5) * 30; const rust = noise.tile(x / 40, y / 40, 6, 3);
      const v = s * 22 + n;
      let r = r0 + v, gg = g0 + v, b = b0 + v;
      if (rust > 0.68) { r += 30; gg -= 5; b -= 30; }
      return [r, gg, b, s * 0.5 + 0.5, 0.5];
    });
    return pack(g, 1, 1, 3);
  });
}

export function ceilingTiles(color = 0xe6e3dc) {
  return cached('ceil' + color, () => {
    const [r0, g0, b0] = rgb(color); const size = 256;
    const g = pixelGen(size, (x, y) => {
      const lx = x % 128, ly = y % 128;
      if (lx < 3 || ly < 3) return [150, 150, 150, 0.2, 0.6];
      const n = noise.tile(x / 1.7, y / 1.7, 150, 1); const hole = n > 0.82 ? -40 : 0;
      const m = (noise.tile(x / 25, y / 25, 10, 2) - 0.5) * 16;
      return [r0 + hole + m, g0 + hole + m, b0 + hole + m * 1.1, hole ? 0.3 : 0.55, 0.95];
    });
    return pack(g, 1, 1, 1);
  });
}

export function asphalt() {
  return cached('asphalt', () => {
    const size = 512;
    const g = pixelGen(size, (x, y) => {
      const n = noise.tile(x / 1.5, y / 1.5, 341, 1), m = noise.tile(x / 50, y / 50, 10, 3);
      const d = (n - 0.5) * 50 + (m - 0.5) * 30 + (n > 0.85 ? 30 : 0);
      return [70 + d, 70 + d, 72 + d, n, 0.9 - (m > 0.62 ? 0.5 : 0)];
    });
    return pack(g, 1, 1, 2);
  });
}

export function metalPanel(color = 0x8f969c) {
  return cached('metal' + color, () => {
    const [r0, g0, b0] = rgb(color); const size = 256;
    const g = pixelGen(size, (x, y) => {
      const lx = x % 128, ly = y % 128;
      const seam = lx < 2 || ly < 2;
      const rivet = (Math.hypot(lx - 8, ly - 8) < 3 || Math.hypot(lx - 120, ly - 8) < 3 || Math.hypot(lx - 8, ly - 120) < 3 || Math.hypot(lx - 120, ly - 120) < 3);
      const brushed = (noise.tile(x / 40, y / 0.8, 6, 2) - 0.5) * 18;
      const dirt = noise.tile(x / 30, y / 30, 8, 3);
      let v = brushed - (dirt > 0.6 ? (dirt - 0.6) * 120 : 0);
      if (seam) v -= 50;
      return [r0 + v, g0 + v, b0 + v, seam ? 0.2 : rivet ? 0.9 : 0.5, 0.35 + dirt * 0.4];
    });
    return pack(g, 1, 1, 2);
  });
}

export function woodPanelWall(color = 0x6b4a2e) {
  return cached('panelwall' + color, () => {
    const [r0, g0, b0] = rgb(color); const size = 256;
    const g = pixelGen(size, (x, y) => {
      const lx = x % 64; const grain = noise.tile(x / 6, y / 60, 42, 3);
      const v = (grain - 0.5) * 40 + (lx < 2 ? -40 : 0);
      return [r0 + v, g0 + v * 0.8, b0 + v * 0.6, lx < 2 ? 0.2 : 0.5 + grain * 0.1, 0.6];
    });
    return pack(g, 1, 1, 1);
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

export function noiseTexture(size = 256) {
  return cached('noisetex' + size, () => {
    const c = canvas(size), ctx = c.getContext('2d'); const img = ctx.createImageData(size, size); const rnd = mulberry32(99);
    for (let i = 0; i < size * size; i++) { const v = rnd() * 255; img.data[i * 4] = v; img.data[i * 4 + 1] = rnd() * 255; img.data[i * 4 + 2] = rnd() * 255; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t;
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

// ── Atlas d'étiquettes produits ──
// Toutes les étiquettes sont dessinées dans un unique canvas 2048×2048 (cellules 128×128) afin que
// tous les produits partagent un seul matériau (une seule draw call par magasin après fusion).
export class LabelAtlas {
  constructor() {
    this.size = 2048; this.cell = 128; this.cols = this.size / this.cell;
    this.c = canvas(this.size); this.ctx = this.c.getContext('2d');
    this.ctx.fillStyle = '#ffffff'; this.ctx.fillRect(0, 0, this.size, this.size);
    this.next = 1; // cellule 0 = blanc uni (faces sans étiquette)
    this.map = new Map();
    this.texture = null;
  }
  // rectangle UV {u0, v0, u1, v1} de la cellule blanche
  white() { return this.rect(0); }
  rect(i) {
    const cx = i % this.cols, cy = (i / this.cols) | 0; const s = this.cell / this.size; const pad = 2 / this.size;
    return { u0: cx * s + pad, v0: 1 - (cy + 1) * s + pad, u1: (cx + 1) * s - pad, v1: 1 - cy * s - pad };
  }
  label(key, text, color, style = 'box') {
    if (this.map.has(key)) return this.map.get(key);
    if (this.next >= this.cols * this.cols) return this.white();
    const i = this.next++;
    const cx = (i % this.cols) * this.cell, cy = ((i / this.cols) | 0) * this.cell; const ctx = this.ctx; const C = this.cell;
    const rnd = mulberry32(i * 97);
    ctx.save(); ctx.translate(cx, cy);
    // les couleurs du produit sont appliquées par la couleur de vertex : on dessine en niveaux clairs
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, C, C);
    const accent = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1'][(rnd() * 7) | 0];
    if (style === 'vinyl' || style === 'vhs') {
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, C, C);
      for (let k = 0; k < 4; k++) { ctx.fillStyle = `hsl(${(rnd() * 360) | 0},70%,${40 + rnd() * 30}%)`; ctx.fillRect(rnd() * C, rnd() * C, 20 + rnd() * 60, 20 + rnd() * 60); }
    } else {
      ctx.fillStyle = accent; ctx.fillRect(0, C * 0.62, C, C * 0.12);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(C * 0.5, C * 0.32, C * 0.22, 0, 7); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let fs = 26; ctx.font = `900 ${fs}px Arial`;
    const t = (text || '').toUpperCase().slice(0, 18);
    while (ctx.measureText(t).width > C - 10 && fs > 10) { fs -= 2; ctx.font = `900 ${fs}px Arial`; }
    ctx.fillText(t, C / 2, style === 'vinyl' || style === 'vhs' ? C * 0.5 : C * 0.32);
    ctx.font = '700 11px Arial'; ctx.fillStyle = '#333';
    if (style !== 'vinyl' && style !== 'vhs') ctx.fillText('HÉLIOS', C / 2, C * 0.86);
    ctx.restore();
    const r = this.rect(i); this.map.set(key, r);
    if (this.texture) this.texture.needsUpdate = true;
    return r;
  }
  finalize() {
    const t = new THREE.CanvasTexture(this.c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
    this.texture = t; return t;
  }
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
