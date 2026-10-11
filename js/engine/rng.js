// Générateur pseudo-aléatoire déterministe (mulberry32). Indispensable au multijoueur :
// tous les pairs construisent exactement le même centre commercial à partir de la même graine.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1) { this.seed = typeof seed === 'string' ? hashString(seed) : seed >>> 0; this.f = mulberry32(this.seed); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return Math.floor(a + (b - a + 1) * this.f()); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  weighted(items, wfn) {
    let total = 0; for (const it of items) total += wfn(it);
    let r = this.f() * total;
    for (const it of items) { r -= wfn(it); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  fork(label) { return new RNG(hashString(this.seed + ':' + label)); }
}

// Bruit de valeur 2D lissé (pour les textures procédurales).
export function makeNoise2D(seed = 1) {
  const rnd = mulberry32(seed);
  const P = new Uint8Array(512); const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const V = new Float32Array(256); for (let i = 0; i < 256; i++) V[i] = rnd();
  const fade = t => t * t * (3 - 2 * t);
  function n(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]], c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
    const u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  n.fbm = (x, y, oct = 4) => { let s = 0, amp = 0.5, f = 1, norm = 0; for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; } return s / norm; };
  // version périodique (tuile sans couture) de période p
  n.tile = (x, y, p, oct = 4) => {
    let s = 0, amp = 0.5, norm = 0, f = 1;
    for (let i = 0; i < oct; i++) {
      const pp = p * f;
      const xx = x * f, yy = y * f;
      const xi = Math.floor(xx), yi = Math.floor(yy), xf = xx - xi, yf = yy - yi;
      const g = (ix, iy) => V[P[P[((ix % pp) + pp) % pp & 255] + (((iy % pp) + pp) % pp & 255)]];
      const u = fade(xf), v = fade(yf);
      const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
      s += (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return s / norm;
  };
  return n;
}
