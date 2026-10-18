// Moteur audio 100 % procédural (aucun fichier son) : bruitages synthétisés par modèles physiques (bruit
// filtré, synthèse modale, friction « stick-slip », formants vocaux, FM, moteurs), spatialisation HRTF,
// occlusion par les murs (passe-bas + atténuation par source) et réverbération par convolution, avec des
// réponses impulsionnelles générées selon le type de lieu (bureau feutré ≠ atrium vitré ≠ parking béton).
// Contrat : docs/ARCHITECTURE.md. Toutes les méthodes publiques sont sûres : jamais d'exception.

// ───────────────────────────── utilitaires ─────────────────────────────
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// mulberry32 : aléatoire déterministe (chaque variante d'un son est reproductible)
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// table de sinus (phase en cycles) : évite Math.sin dans les boucles de synthèse
const SIN_N = 4096, SIN = new Float32Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin(TAU * i / SIN_N);
function fsin(ph) { ph -= Math.floor(ph); const x = ph * SIN_N, i = x | 0; return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i); }
function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const warned = new Set();
function warnOnce(key, ...msg) { if (warned.has(key)) return; warned.add(key); try { console.warn('[Audio]', ...msg); } catch (e) { /* console indisponible */ } }

// vecteur {x,y,z} (THREE.Vector3, objet ou tableau) → copie, ou null si invalide
function vec(p) {
  if (!p) return null;
  const x = Array.isArray(p) ? p[0] : p.x, y = Array.isArray(p) ? p[1] : p.y, z = Array.isArray(p) ? p[2] : p.z;
  return isFinite(x) && isFinite(y) && isFinite(z) ? { x: +x, y: +y, z: +z } : null;
}

// ───────────────────────────── DSP : filtres ─────────────────────────────
// Coefficients biquad RBJ normalisés : c = [b0, b1, b2, a1, a2]
function bqc(c, type, f, q, sr, g) {
  f = clamp(f, 8, sr * 0.49); q = q < 0.05 ? 0.05 : q;
  const w = TAU * f / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1 = -2 * cw, a2;
  if (type === 'lp') { b1 = 1 - cw; b0 = b2 = b1 * 0.5; a0 = 1 + al; a2 = 1 - al; }
  else if (type === 'hp') { b1 = -(1 + cw); b0 = b2 = -b1 * 0.5; a0 = 1 + al; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a2 = 1 - al; }
  else if (type === 'no') { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a2 = 1 - al; }
  else if (type === 'pk') { const A = Math.pow(10, g / 40); b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a2 = 1 - al / A; }
  else if (type === 'ls' || type === 'hs') {
    const A = Math.pow(10, g / 40), s = 2 * Math.sqrt(A) * al, p = A + 1, m = A - 1;
    if (type === 'ls') { b0 = A * (p - m * cw + s); b1 = 2 * A * (m - p * cw); b2 = A * (p - m * cw - s); a0 = p + m * cw + s; a1 = -2 * (m + p * cw); a2 = p + m * cw - s; }
    else { b0 = A * (p + m * cw + s); b1 = -2 * A * (m + p * cw); b2 = A * (p + m * cw - s); a0 = p - m * cw + s; a1 = 2 * (m - p * cw); a2 = p - m * cw - s; }
  } else { b0 = 1 - al; b1 = -2 * cw; b2 = 1 + al; a0 = 1 + al; a2 = 1 - al; } // passe-tout
  c[0] = b0 / a0; c[1] = b1 / a0; c[2] = b2 / a0; c[3] = a1 / a0; c[4] = a2 / a0;
}

// Biquad en place. f : nombre ou fonction du temps (s). circ : amorçage sur la fin du tampon (boucle sans couture).
function bq(a, sr, type, f, q = 0.707, g = 0, circ = false) {
  const n = a.length; if (!n) return a;
  const fn = typeof f === 'function', c = new Float64Array(5);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, b1, b2, a1, a2;
  const coef = (t) => { bqc(c, type, t, q, sr, g); b0 = c[0]; b1 = c[1]; b2 = c[2]; a1 = c[3]; a2 = c[4]; };
  coef(fn ? f(0) : f);
  if (circ) {
    for (let i = n - Math.min(n, Math.round(0.3 * sr)); i < n; i++) {
      if (fn && (i & 31) === 0) coef(f(i / sr));
      const x = a[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
    }
  }
  for (let i = 0; i < n; i++) {
    if (fn && (i & 31) === 0) coef(f(i / sr));
    const x = a[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; a[i] = y;
  }
  return a;
}

// filtre à un pôle (passe-bas, ou passe-haut si hp)
function op1(a, sr, f, hp = false, circ = false) {
  const k = 1 - Math.exp(-TAU * f / sr), n = a.length; let s = 0;
  if (circ) for (let i = n - Math.min(n, Math.round(0.3 * sr)); i < n; i++) s += k * (a[i] - s);
  for (let i = 0; i < n; i++) { const x = a[i]; s += k * (x - s); a[i] = hp ? x - s : s; }
  return a;
}

// correction polyBLEP (oscillateurs à bande limitée)
function blep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }

// bruit blanc / rose (Kellet) / brun — xorshift32 en ligne (amorcé par le générateur déterministe du son)
function noiseFill(a, r, c) {
  const n = a.length, K = 4.656612873077393e-10; let x = ((r() * 4294967295) | 0) || 0x9E3779B9;
  if (c === 'p') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5; const w = x * K;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      a[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else if (c === 'b') { let s = 0; for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s = (s + 0.02 * x * K) / 1.02; a[i] = s * 3.5; } }
  else for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; a[i] = x * K; }
  return a;
}

// Enveloppe sur a[0, n) (le reste = traîne des filtres, mise à zéro) :
// att, hold, dec (constante de temps exp.), rel (fondu final), env [[t, v]…], am [f, prof, phase], ef(t)
function envl(a, n, sr, o) {
  const att = Math.max(1, (o.att ?? 0.0015) * sr), hold = (o.hold || 0) * sr;
  const rel = Math.max(1, (o.rel ?? Math.min(0.012, n / sr * 0.25)) * sr);
  const k = o.dec ? Math.exp(-1 / (o.dec * sr)) : 1, ac = o.ac || 1, E = o.env, am = o.am, ef = o.ef;
  let e = 1, ei = 0, f0 = ef ? ef(0) : 1, f1 = f0;
  for (let i = 0; i < n; i++) {
    let g;
    if (E) {
      const t = i / sr; while (ei < E.length - 2 && t > E[ei + 1][0]) ei++;
      const p0 = E[ei], p1 = E[Math.min(ei + 1, E.length - 1)];
      g = p1[0] > p0[0] ? p0[1] + (p1[1] - p0[1]) * clamp((t - p0[0]) / (p1[0] - p0[0]), 0, 1) : p1[1];
    } else {
      g = i < att ? (ac === 1 ? i / att : Math.pow(i / att, ac)) : 1;
      if (i >= att + hold) e *= k;
      g *= e;
    }
    const rr = n - i; if (rr < rel) g *= rr / rel;
    if (am) g *= 1 - am[1] * (0.5 + 0.5 * fsin(am[0] * i / sr + (am[2] || 0) / TAU));
    if (ef) { const j = i & 7; if (!j) { f0 = f1; f1 = ef((i + 8) / sr); } g *= f0 + (f1 - f0) * j * 0.125; }
    a[i] *= g;
  }
  if (a.length > n) a.fill(0, n);
}
// modulation seule (couches couvrant toute une boucle : ni attaque ni fondu)
function mulEnv(a, sr, o) {
  const am = o.am, ef = o.ef; if (!am && !ef) return;
  let f0 = ef ? ef(0) : 1, f1 = f0;
  for (let i = 0; i < a.length; i++) {
    let g = 1;
    if (am) g *= 1 - am[1] * (0.5 + 0.5 * fsin(am[0] * i / sr + (am[2] || 0) / TAU));
    if (ef) { const j = i & 7; if (!j) { f0 = f1; f1 = ef((i + 8) / sr); } g *= f0 + (f1 - f0) * j * 0.125; } // contrôle tous les 8 échantillons
    a[i] *= g;
  }
}
function drive(a, k) { const t = Math.tanh(k); for (let i = 0; i < a.length; i++) a[i] = Math.tanh(a[i] * k) / t; return a; }

// chaîne de filtres décrite par options
function fx(a, sr, o, circ = false) {
  if (o.hp) bq(a, sr, 'hp', o.hp, o.hq ?? 0.707, 0, circ);
  if (o.lp) bq(a, sr, 'lp', o.lp, o.lq ?? 0.707, 0, circ);
  if (o.bp) { bq(a, sr, 'bp', o.bp, o.q ?? 1, 0, circ); if (o.bp2) bq(a, sr, 'bp', o.bp, o.q ?? 1, 0, circ); }
  if (o.pk) for (const p of o.pk) bq(a, sr, 'pk', p[0], p[1], p[2], circ);
  if (o.ls) bq(a, sr, 'ls', o.ls[0], 0.707, o.ls[1], circ);
  if (o.hs) bq(a, sr, 'hs', o.hs[0], 0.707, o.hs[1], circ);
  if (o.dr) drive(a, o.dr);
}

// table d'onde d'un cycle (somme d'harmoniques limitée sous Nyquist pour fmax)
function makeTable(H, fmax, sr, ph) {
  const N = 2048, T = new Float32Array(N + 1), ny = sr * 0.47;
  for (let k = 0; k < H.length; k++) {
    if (!H[k] || (k + 1) * fmax > ny) continue;
    const p = ph ? ph[k] || 0 : 0, m = (k + 1) * TAU / N;
    for (let i = 0; i < N; i++) T[i] += H[k] * Math.sin(m * i + p);
  }
  T[N] = T[0];
  return T;
}

// ───────────────────────────── tampon de synthèse ─────────────────────────────
// Un son = une fonction r(B) qui écrit dans B.d (Float32Array). En mode boucle, tout est circulaire :
// les événements débordant à la fin reviennent au début, les filtres sont amorcés → aucune couture.
class Buf {
  constructor(sr, dur, seed, loop) {
    this.sr = sr; this.n = Math.max(32, Math.round(dur * sr)); this.d = new Float32Array(this.n);
    this.loop = !!loop; this.r = mulberry(seed); this.v = 0; this.c = 0;
  }
  get dur() { return this.n / this.sr; }
  rr(a, b) { return a + (b - a) * this.r(); }
  ri(a, b) { return Math.floor(a + (b - a + 1) * this.r()); }
  ch(p) { return this.r() < p; }
  pick(a) { return a[Math.floor(this.r() * a.length) % a.length]; }
  sg() { return this.r() < 0.5 ? -1 : 1; }
  // fréquence arrondie à un nombre entier de cycles sur la durée (boucles parfaitement périodiques)
  per(f) { return Math.max(1, Math.round(f * this.dur)) / this.dur; }
  // courbe aléatoire lisse (points de contrôle à `rate` Hz, interpolation en S), périodique en boucle
  rnd(rate, lo = 0, hi = 1) {
    const K = Math.max(2, Math.round(this.dur * rate)), P = new Float32Array(K + 1), sc = K / this.dur, loop = this.loop;
    for (let i = 0; i < K; i++) P[i] = lo + (hi - lo) * this.r();
    P[K] = loop ? P[0] : lo + (hi - lo) * this.r();
    return (t) => {
      let x = t * sc;
      if (loop) { x %= K; if (x < 0) x += K; } else x = clamp(x, 0, K - 1e-6);
      const i = Math.floor(x), u = x - i, w = u * u * (3 - 2 * u);
      return P[i] + (P[i + 1] - P[i]) * w;
    };
  }
  full(t, dur) { return this.loop && t <= 0 && dur >= this.dur - 1e-6; }
  // mélange un signal à l'instant t (circulaire en mode boucle)
  add(s, t, g = 1) {
    const d = this.d, n = this.n, L = s.length; let j = Math.round(t * this.sr);
    if (!this.loop) {
      let i0 = 0; if (j < 0) { i0 = -j; j = 0; }
      const m = Math.min(L, i0 + n - j);
      for (let i = i0; i < m; i++, j++) d[j] += s[i] * g;
    } else {
      j = ((j % n) + n) % n;
      for (let i = 0; i < L; i++) { d[j] += s[i] * g; if (++j >= n) j = 0; }
    }
    return this;
  }

  // ── générateurs ──
  // bouffée de bruit filtré : c (couleur 'w'|'p'|'b'), enveloppe, filtres (hp, lp, bp…), tail (traîne de filtre)
  nz(t, dur, o = {}) {
    const sr = this.sr, full = this.full(t, dur), n = full ? this.n : Math.max(1, Math.round(dur * sr));
    const a = new Float32Array(full ? n : n + Math.round((o.tail ?? 0.02) * sr));
    noiseFill(n < a.length ? a.subarray(0, n) : a, this.r, o.c);
    if (full) mulEnv(a, sr, o); else envl(a, n, sr, o);
    fx(a, sr, o, full);
    return this.add(a, t, o.a ?? 1);
  }
  // oscillateur : w 'sin'|'tri'|'saw'|'sqr'|'tab' (harm)|'fm' ; f→f1 (glissando exp. sur gt), fe(t), vib [f, prof], jit
  osc(t, dur, o = {}) {
    const sr = this.sr, full = this.full(t, dur), n = full ? this.n : Math.max(1, Math.round(dur * sr));
    const a = new Float32Array(full ? n : n + Math.round((o.tail ?? 0) * sr));
    const w = o.w || 'sin', vib = o.vib, du = o.duty ?? 0.5, fm = o.fm, r = this.r, jit = full ? 0 : o.jit || 0;
    let f0 = o.f ?? 440; const f1 = o.f1 ?? f0, gt = o.gt ?? dur, lr = Math.log(f1 / f0);
    let fe = o.fe || (full && f1 !== f0 ? (x) => f0 * Math.exp(lr * Math.min(1, x / gt)) : null);
    const gl = !fe && f1 !== f0, gk = gl ? Math.exp(lr / Math.max(1, gt * sr)) : 1, gn = Math.round(gt * sr); let fg = f0;
    if (full) { // boucle : nombre entier de cycles sur la durée totale
      if (fe) { let I = 0; for (let i = 0; i < n; i++) I += fe(i / sr); I /= sr; const k = Math.max(1, Math.round(I)) / I, g0 = fe; fe = (x) => g0(x) * k; }
      else f0 = this.per(f0);
    }
    let T = null;
    if (w === 'tab') {
      let fmx = Math.max(f0, f1);
      if (o.fe) for (let i = 0; i <= 64; i++) fmx = Math.max(fmx, o.fe(dur * i / 64));
      if (vib) fmx *= 1 + vib[1];
      T = makeTable(o.harm || [1], fmx, sr, o.hph);
    }
    let ph = o.ph ?? 0, pm = 0, jv = 0;
    for (let i = 0; i < n; i++) {
      const x = i / sr; let f = fe ? fe(x) : gl ? (i < gn ? (fg *= gk) : f1) : f0;
      if (vib) f *= 1 + vib[1] * fsin(vib[0] * x + (vib[2] || 0) / TAU);
      if (jit) { jv += (r() * 2 - 1 - jv) * 0.02; f *= 1 + jit * jv; }
      const dt = f / sr; ph += dt; ph -= Math.floor(ph);
      let v;
      if (w === 'sin') { const y = ph * SIN_N, j = y | 0; v = SIN[j] + (SIN[j + 1] - SIN[j]) * (y - j); }
      else if (T) { const y = ph * 2048, j = y | 0; v = T[j] + (T[j + 1] - T[j]) * (y - j); }
      else if (w === 'saw') v = 2 * ph - 1 - blep(ph, dt);
      else if (w === 'sqr') v = (ph < du ? 1 : -1) + blep(ph, dt) - blep((ph + 1 - du) % 1, dt);
      else if (w === 'tri') v = 1 - 4 * Math.abs(ph - 0.5);
      else if (w === 'fm') { pm += f * fm[0] / sr; pm -= Math.floor(pm); v = fsin(ph + fm[1] * (fm[2] ? Math.exp(-x / fm[2]) : 1) * fsin(pm) / TAU); }
      else v = fsin(ph);
      a[i] = v;
    }
    if (full) mulEnv(a, sr, o); else envl(a, n, sr, o);
    fx(a, sr, o, full);
    return this.add(a, t, o.a ?? 1);
  }
  // synthèse modale : M = [[f, amp, amortissement (s)], …] ; ct = temps de contact (dureté : plus court = plus brillant)
  modal(t, M, o = {}) {
    const sr = this.sr, ny = sr * 0.46, ct = o.ct ?? 0.0004, lf = o.lf ?? 5.8;
    let dm = 0; for (const m of M) if (m[2] > dm) dm = m[2];
    let n = Math.round(Math.min(o.len ?? dm * lf, 12) * sr) + 1;
    n = this.loop ? Math.min(n, this.n) : Math.max(1, Math.min(n, this.n - Math.round(t * sr)));
    const a = new Float32Array(n);
    for (const m of M) {
      const f = m[0]; if (!(f > 20 && f < ny) || !(m[2] > 0)) continue;
      const w = TAU * f / sr, r = Math.exp(-1 / (m[2] * sr)), c = 2 * r * Math.cos(w), r2 = r * r;
      const W = m[1] / Math.sqrt(1 + Math.pow(f * ct * 2, 4));
      const L = Math.min(n, Math.ceil(m[2] * lf * sr));
      let p1 = 0, p2 = -W * Math.sin(w) / r;
      for (let i = 0; i < L; i++) { const y = c * p1 - r2 * p2; p2 = p1; p1 = y; a[i] += y; }
    }
    const na = Math.round(ct * sr); for (let i = 0; i < na && i < n; i++) a[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / na);
    if (o.lp || o.hp || o.bp || o.pk) fx(a, sr, o);
    return this.add(a, t, o.a ?? 1);
  }
  // banc de résonateurs excité par un signal x (longueur ≥ n) : équivaut à modal() pour chaque impulsion,
  // mais coûte une seule passe (sonneries à marteau, cloches frappées en rafale)
  res(x, M, a = 1) {
    const sr = this.sr, n = this.n, d = this.d, ny = sr * 0.46;
    for (const [f, amp, dec] of M) {
      if (!(f > 20 && f < ny) || !(dec > 0)) continue;
      const w = TAU * f / sr, r = Math.exp(-1 / (dec * sr)), c = 2 * r * Math.cos(w), r2 = r * r, k = amp * a * r * Math.sin(w);
      let y1 = 0, y2 = 0, xp = 0;
      if (this.loop) for (let i = n - Math.min(n, Math.ceil(dec * 6.9 * sr)); i < n; i++) { const y = c * y1 - r2 * y2 + k * xp; xp = x[i]; y2 = y1; y1 = y; }
      for (let i = 0; i < n; i++) { const y = c * y1 - r2 * y2 + k * xp; xp = x[i]; y2 = y1; y1 = y; d[i] += y; }
    }
    return this;
  }
  // impact grave : sinus à hauteur décroissante (f0 → f1, constante k), amortissement dec, saturation drive
  thump(t, o = {}) {
    const sr = this.sr, f0 = o.f0 ?? 120, f1 = o.f1 ?? 50, k = o.k ?? 0.03, dec = o.dec ?? 0.12, dr = o.drive || 0;
    const n = Math.max(8, Math.round((o.dur ?? Math.min(3, dec * 6.5 + 0.01)) * sr)), a = new Float32Array(n);
    const att = Math.max(1, (o.att ?? 0.0015) * sr), kd = Math.exp(-1 / (dec * sr)), kk = Math.exp(-1 / (k * sr)), td = dr ? Math.tanh(dr) : 1;
    let ph = 0, e = 1, p = 1;
    for (let i = 0; i < n; i++) {
      ph += (f1 + (f0 - f1) * p) / sr; p *= kk; e *= kd;
      let v = fsin(ph); if (dr) v = Math.tanh(v * dr) / td;
      a[i] = v * e * (i < att ? i / att : 1);
    }
    const rel = Math.min(n, Math.round(0.004 * sr)); for (let i = 0; i < rel; i++) a[n - 1 - i] *= i / rel;
    if (o.lp) bq(a, sr, 'lp', o.lp);
    return this.add(a, t, o.a ?? 1);
  }
  // friction « stick-slip » (grincements, raclements) : impulsions à cadence rate(t) excitant des résonateurs res [[f, q, g]]
  fric(t, dur, o = {}) {
    const sr = this.sr, n = Math.max(1, Math.round(dur * sr)), a = new Float32Array(n + Math.round((o.tail ?? 0.06) * sr)), r = this.r;
    const rate = typeof o.rate === 'function' ? o.rate : () => o.rate || 30;
    const jit = o.jit ?? 0.15, av = o.av ?? 0.4, nzf = o.nz || 0, bl = o.blip || 0;
    let ph = r();
    for (let i = 0; i < n; i++) {
      ph += Math.max(0, rate(i / sr)) / sr * (1 + jit * (r() * 2 - 1));
      if (ph >= 1) {
        ph -= Math.floor(ph); const amp = 1 - av * r();
        if (bl) { for (let k = 0; k < bl && i + k < n; k++) a[i + k] += amp * (r() * 2 - 1) * Math.exp(-k / (bl * 0.3)); } else a[i] += amp;
      }
      if (nzf) a[i] += (r() * 2 - 1) * nzf;
    }
    envl(a, n, sr, o);
    const out = new Float32Array(a.length);
    for (const [f, q, g] of o.res || [[1000, 5, 1]]) {
      const c = a.slice(); bq(c, sr, 'bp', f, q); if (o.res2) bq(c, sr, 'bp', f, q);
      for (let i = 0; i < c.length; i++) out[i] += c[i] * g;
    }
    fx(out, sr, o);
    return this.add(out, t, o.a ?? 1);
  }
  // voix (formants en cascade, source glottique de Rosenberg dérivée) : f0(t), F(t) → [F1..F4], asp(t) souffle 0..1
  voice(t, dur, o = {}) {
    const sr = this.sr, n = Math.max(1, Math.round(dur * sr)), a = new Float32Array(n + Math.round(0.04 * sr)), r = this.r;
    const f0 = typeof o.f0 === 'function' ? o.f0 : () => o.f0 || 120;
    const oq = o.oq ?? 0.6, tp = oq * 0.65, tn = oq * 0.35, jit = o.jit ?? 0.012, shim = o.shim ?? 0.12, asp = o.asp, br = o.br ?? 0.04;
    const GN = 1024, gt = new Float32Array(GN + 1); // dérivée de l'onde de Rosenberg sur un cycle
    for (let i = 0; i <= GN; i++) { const p = i / GN; gt[i] = p < tp ? Math.sin(Math.PI * p / tp) * (0.06 * Math.PI / tp) : p < tp + tn ? -Math.sin(0.5 * Math.PI * (p - tp) / tn) * (0.06 * Math.PI / tn) : 0; }
    let ph = 0, jc = 1, amp = 1, fv = 0, s = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 7) === 0) { const x = i / sr; fv = f0(x); s = asp ? clamp(asp(x), 0, 1) : 0; }
      let g = 0;
      if (fv > 0) {
        ph += fv * jc / sr;
        if (ph >= 1) { ph -= Math.floor(ph); jc = 1 + jit * (r() * 2 - 1); amp = 1 + shim * (r() * 2 - 1); }
        const y = ph * GN, j = y | 0; g = gt[j] + (gt[j + 1] - gt[j]) * (y - j);
      }
      const open = fv > 0 && ph < tp + tn ? 1 : 0.3;
      a[i] = g * amp * (1 - s) + (r() * 2 - 1) * (s * 0.7 + br * open * (1 - s));
    }
    envl(a, n, sr, o);
    const F = typeof o.F === 'function' ? o.F : () => o.F || [500, 1500, 2500, 3500];
    const BW = o.bw || [80, 100, 140, 200], K = 4;
    const y1 = new Float64Array(K), y2 = new Float64Array(K), A = new Float64Array(K), Bc = new Float64Array(K), C = new Float64Array(K);
    for (let i = 0; i < a.length; i++) {
      if ((i & 31) === 0) {
        const tt = Math.min(i, n - 1) / sr, fr = F(tt), bw = typeof BW === 'function' ? BW(tt) : BW;
        for (let k = 0; k < K; k++) {
          const fk = fr[k] || 0, b = bw[k] || 150;
          if (!(fk > 0 && fk < sr * 0.47)) { A[k] = 1; Bc[k] = 0; C[k] = 0; continue; }
          const e = Math.exp(-Math.PI * b / sr); C[k] = -e * e; Bc[k] = 2 * e * Math.cos(TAU * fk / sr); A[k] = 1 - Bc[k] - C[k];
        }
      }
      let v = a[i];
      for (let k = 0; k < K; k++) { const y = A[k] * v + Bc[k] * y1[k] + C[k] * y2[k]; y2[k] = y1[k]; y1[k] = y; v = y; }
      a[i] = v;
    }
    fx(a, sr, o);
    return this.add(a, t, o.a ?? 1);
  }
  // sous-tampon (même cadence, non bouclé) pour traiter une composante à part avant de la mélanger
  sub(dur) { return new Buf(this.sr, dur, (this.r() * 4294967296) >>> 0, false); }

  // ── traitements globaux ──
  lp(f, q = 0.707) { bq(this.d, this.sr, 'lp', f, q, 0, this.loop); return this; }
  hp(f, q = 0.707) { bq(this.d, this.sr, 'hp', f, q, 0, this.loop); return this; }
  bp(f, q = 1) { bq(this.d, this.sr, 'bp', f, q, 0, this.loop); return this; }
  pk(f, q, g) { bq(this.d, this.sr, 'pk', f, q, g, this.loop); return this; }
  ls(f, g) { bq(this.d, this.sr, 'ls', f, 0.707, g, this.loop); return this; }
  hs(f, g) { bq(this.d, this.sr, 'hs', f, 0.707, g, this.loop); return this; }
  drive(k) { drive(this.d, k); return this; }
  gain(fn) { const d = this.d, sr = this.sr; for (let i = 0; i < d.length; i++) d[i] *= fn(i / sr); return this; }
  // petit haut-parleur (jouet, combiné téléphonique, téléviseur, sonorisation)
  spk(lo = 400, hi = 4000, pf = 1500, pg = 6, dr = 0) { this.hp(lo, 0.8).lp(hi, 0.8); if (pg) this.pk(pf, 1.2, pg); if (dr) this.drive(dr); return this; }
  // quantification + échantillonneur-bloqueur (puce sonore bon marché)
  crush(bits = 8, hold = 1) {
    const d = this.d, q = Math.pow(2, bits - 1); let v = 0;
    for (let i = 0; i < d.length; i++) { if (i % hold === 0) v = Math.round(d[i] * q) / q; d[i] = v; }
    return this;
  }
  // réverbération intégrée (Schroeder/Moorer) pour les sons « lointains » ou diffusés (sono, extérieur)
  verb(mix = 0.3, rt = 1.2, damp = 0.4, pre = 0.008) {
    const sr = this.sr, d = this.d, n = this.n, wet = new Float32Array(n), w0 = this.loop ? n - Math.min(n, Math.round((rt + 0.1) * sr)) : n;
    const CD = [0.0297, 0.0371, 0.0411, 0.0437, 0.0503, 0.0571]; let gs = 0;
    for (const c0 of CD) {
      const c = c0 + pre, L = Math.max(1, Math.round(c * sr)), g = Math.pow(10, -3 * c / rt), buf = new Float32Array(L); gs += g * g;
      let idx = 0, lp = 0;
      for (let i = w0; i < n; i++) { const y = buf[idx]; lp = y + (lp - y) * damp; buf[idx] = d[i] + lp * g; if (++idx >= L) idx = 0; }
      for (let i = 0; i < n; i++) { const y = buf[idx]; lp = y + (lp - y) * damp; buf[idx] = d[i] + lp * g; if (++idx >= L) idx = 0; wet[i] += y; }
    }
    for (const c of [0.0050, 0.0017]) {
      const L = Math.max(1, Math.round(c * sr)), buf = new Float32Array(L); let idx = 0;
      for (let i = this.loop ? n - Math.min(n, L * 4) : n; i < n; i++) { const x = wet[i], y = buf[idx] - 0.7 * x; buf[idx] = x + 0.7 * y; if (++idx >= L) idx = 0; }
      for (let i = 0; i < n; i++) { const x = wet[i], y = buf[idx] - 0.7 * x; buf[idx] = x + 0.7 * y; if (++idx >= L) idx = 0; wet[i] = y; }
    }
    const k = mix / Math.sqrt(CD.length / Math.max(0.05, 1 - gs / CD.length));
    for (let i = 0; i < n; i++) d[i] = d[i] * (1 - mix * 0.35) + wet[i] * k;
    return this;
  }
}

// ───────────────────────────── familles de sons ─────────────────────────────
// Matériaux des impacts : plage de fondamentale (Hz), rapports des modes, amplitudes, amortissements (s),
// temps de contact (dureté), claquement de surface [hp, lp, niveau], « corps » grave [f, niveau].
const MAT = {
  plastic: { f: [330, 820], r: [1, 1.52, 2.21, 2.93, 3.81, 5.07], a: [1, 0.75, 0.55, 0.42, 0.3, 0.2], d: [0.055, 0.042, 0.032, 0.025, 0.02, 0.015], ct: 0.0005, cl: [1200, 7000, 0.55], th: [190, 0.35] },
  metal: { f: [280, 760], r: [1, 2.756, 5.404, 8.933, 13.34, 18.64], a: [1, 0.85, 0.65, 0.5, 0.35, 0.22], d: [1.1, 0.8, 0.55, 0.38, 0.26, 0.18], ct: 0.00025, cl: [2500, 12000, 0.35], th: [220, 0.25] },
  wood: { f: [150, 420], r: [1, 2.31, 3.88, 5.6, 7.42], a: [1, 0.62, 0.42, 0.27, 0.16], d: [0.075, 0.05, 0.034, 0.024, 0.017], ct: 0.0011, cl: [500, 4500, 0.6], th: [130, 0.45] },
  glass: { f: [1300, 2700], r: [1, 2.32, 4.25, 6.63, 9.38], a: [1, 0.62, 0.45, 0.3, 0.2], d: [0.55, 0.38, 0.26, 0.17, 0.11], ct: 0.00015, cl: [3500, 14000, 0.35], th: null },
  ceramic: { f: [850, 2000], r: [1, 2.07, 3.43, 5.12, 6.95], a: [1, 0.58, 0.42, 0.3, 0.2], d: [0.3, 0.22, 0.15, 0.1, 0.07], ct: 0.0002, cl: [2500, 12000, 0.4], th: [260, 0.2] },
  can: { f: [650, 1150], r: [1, 1.38, 1.97, 2.61, 3.36, 4.32, 5.4], a: [1, 0.8, 0.7, 0.55, 0.4, 0.3, 0.2], d: [0.14, 0.11, 0.09, 0.07, 0.055, 0.04, 0.03], ct: 0.0003, cl: [2000, 10000, 0.5], th: [300, 0.15] },
};
// impact modal d'un matériau ; renvoie la fondamentale (pour un rebond du même objet)
function hit(B, m, t = 0.002, k = 1, o = {}) {
  const M = MAT[m], f0 = o.f ?? B.rr(M.f[0], M.f[1]), md = [];
  for (let i = 0; i < M.r.length; i++) md.push([f0 * M.r[i] * (i ? B.rr(0.97, 1.03) : 1), M.a[i] * B.rr(0.6, 1), M.d[i] * B.rr(0.8, 1.2) * (o.dm ?? 1)]);
  B.modal(t, md, { ct: M.ct * (o.ctm ?? 1), a: k });
  if (M.cl) B.nz(t, 0.006, { dec: 0.0015, hp: M.cl[0], lp: M.cl[1], a: M.cl[2] * k });
  if (M.th) B.thump(t, { f0: M.th[0], f1: M.th[0] * 0.55, k: 0.01, dec: 0.02, a: M.th[1] * k });
  return f0;
}
// petit déclic métallique (mécanismes, serrures, interrupteurs)
function tick(B, t, f, a = 0.5, d = 0.012) {
  B.nz(t, 0.003, { dec: 0.0007, hp: Math.min(f * 0.8, 3000), a });
  B.modal(t, [[f, 1, d], [f * 1.58, 0.6, d * 0.7], [f * 2.41, 0.35, d * 0.5]], { ct: 0.0002, a: a * 0.55 });
}
// éclat de verre (tintement inharmonique court)
function shard(B, t, a, lo = 2200, hi = 9000, dd = 1) {
  const f = B.rr(lo, hi), d = B.rr(0.02, 0.09) * dd;
  B.modal(t, [[f, 1, d], [f * B.rr(2.1, 2.5), 0.5, d * 0.6], [f * B.rr(3.8, 4.6), 0.3, d * 0.4]], { ct: 0.0001, a, lf: 4.6 });
}
// pièce de monnaie (disque mince : modes de plaque circulaire)
function coin(B, t, a = 1, f = 0) {
  f = f || B.rr(3600, 6400); const d = B.rr(0.08, 0.25);
  B.modal(t, [[f, 1, d], [f * 1.73, 0.7, d * 0.8], [f * 2.33, 0.5, d * 0.6], [f * 3.91, 0.3, d * 0.4]], { ct: 0.0001, a });
}
// cloche, gong, timbre : partiels inharmoniques doublés (battements)
function bell(B, t, f, a = 1, o = {}) {
  const r = o.r ?? [1, 2.32, 4.25, 6.63, 9.38], am = o.am ?? [1, 0.6, 0.42, 0.28, 0.18], d = o.d ?? 0.8, md = [];
  for (let i = 0; i < r.length; i++) { const dd = d * Math.pow(o.dk ?? 0.62, i); md.push([f * r[i], am[i] ?? 0.1, dd], [f * r[i] * (1 + (o.bt ?? 0.0015)), (am[i] ?? 0.1) * 0.4, dd * 0.9]); }
  B.modal(t, md, { ct: o.ct ?? 0.0002, a, lf: o.lf });
}
// lame de boîte à musique (poutre encastrée : 1, 6.27, 17.55) pincée par un picot
const TINE = (f, ct = 0.00025) => { const d0 = 2.2 * Math.pow(1000 / f, 0.4), w = (x) => 1 / Math.sqrt(1 + Math.pow(x * ct * 2, 4)); return [[f, 1, d0], [f * 1.0021, 0.22, d0 * 0.8], [f * 6.267, 0.3 * w(f * 6.267), 0.1], [f * 17.55, 0.08 * w(f * 17.55), 0.025]]; };
function tine(B, t, midi, a = 1, o = {}) {
  const md = TINE(mtof(midi) * (o.det ?? 1)); if (o.dm) for (const m of md) m[2] *= o.dm;
  B.modal(t, md, { ct: 0.00002, a, lf: 5.5, len: 3.5 });
  B.nz(t, 0.002, { dec: 0.0005, hp: 2500, a: 0.1 * a, tail: 0.003 });
}
// mélodie complète de lames en une passe par hauteur (banc de résonateurs excité à chaque note) : notes [[t, midi, gain], …]
function tines(B, notes, a = 1) {
  const by = new Map();
  for (const [t, m, g] of notes) {
    let x = by.get(m); if (!x) by.set(m, (x = new Float32Array(B.n)));
    x[((Math.round(t * B.sr) % B.n) + B.n) % B.n] += g;
    B.nz(t, 0.002, { dec: 0.0005, hp: 2500, a: 0.1 * g * a, tail: 0.003 });
  }
  for (const [m, x] of by) B.res(x, TINE(mtof(m)), a);
}
// mélodie « 8 bits » : notes [[midi|0, durée en temps], …]
function chip(B, t, notes, o = {}) {
  let tt = t; const bt = o.beat ?? 0.12;
  for (const [m, d] of notes) {
    const L = d * bt;
    if (m > 0) B.osc(tt, Math.max(0.02, L * (o.leg ?? 0.85)), { w: o.w ?? 'sqr', duty: o.duty ?? 0.5, f: mtof(m + (o.tr ?? 0)), att: 0.003, rel: 0.015, dec: o.dec, vib: o.vib, a: o.a ?? 0.4 });
    tt += L;
  }
  return tt;
}
// allumages successifs d'un moteur thermique : rate(t) explosions/s, ratés miss(t), amplitude amp(t)
function firing(B, t0, dur, rate, o = {}) {
  let t = t0; const end = t0 + dur;
  while (t < end) {
    const x = t - t0;
    if (!o.miss || !B.ch(o.miss(x))) {
      const a = (o.amp ? o.amp(x) : 1) * B.rr(0.75, 1);
      if (a > 0.001) {
        B.thump(t, { f0: o.f0 ?? 110, f1: o.f1 ?? 52, k: 0.006, dec: o.dec ?? 0.026, a: a * 0.8 });
        B.nz(t, 0.025, { dec: 0.006, bp: o.knock ?? 1600, q: 0.9, a: a * (o.kn ?? 0.45) });
        B.nz(t, 0.04, { dec: 0.012, lp: 600, a: a * 0.45 });
      }
    }
    t += (1 / Math.max(0.5, rate(x))) * (1 + (o.jit ?? 0.04) * (B.r() * 2 - 1));
  }
}

// ── voix : formants (Hz) des voyelles, voix d'homme ; facteur k : femme ≈ 1.17, enfant ≈ 1.35, chat ≈ 1.7 ──
const VW = {
  a: [750, 1350, 2500, 3400], e: [420, 2050, 2650, 3450], E: [570, 1800, 2550, 3450], i: [290, 2250, 2950, 3600],
  o: [460, 880, 2550, 3350], O: [580, 950, 2500, 3350], u: [320, 760, 2350, 3250], y: [290, 1850, 2250, 3350],
  2: [410, 1480, 2400, 3350], 9: [560, 1450, 2450, 3400], '@': [510, 1500, 2500, 3400], A: [680, 1080, 2550, 3350],
  m: [270, 1100, 2300, 3200], h: [650, 1450, 2550, 3450],
};
// piste de formants interpolée (lissage en S) : seq = [[t, voyelle], …]
function ftrack(seq, k = 1) {
  const out = [0, 0, 0, 0]; let i = 0;
  return (t) => {
    if (t < seq[i][0]) i = 0;
    while (i < seq.length - 1 && t > seq[i + 1][0]) i++;
    const p0 = seq[i], p1 = seq[Math.min(i + 1, seq.length - 1)], A = VW[p0[1]] || p0[1], C = VW[p1[1]] || p1[1];
    const u = p1[0] > p0[0] ? clamp((t - p0[0]) / (p1[0] - p0[0]), 0, 1) : 0, w = u * u * (3 - 2 * u);
    for (let j = 0; j < 4; j++) out[j] = (A[j] + (C[j] - A[j]) * w) * k;
    return out;
  };
}
// phrase inintelligible (foule, chuchotements) : syllabes CV aléatoires, intonation déclinante
function babble(B, t, dur, o = {}) {
  const k = o.k ?? 1, f0b = o.f0 ?? 120, seq = [], st = [], vs = 'aeEioOuy29@A';
  for (let x = 0; x < dur;) { const sd = B.rr(o.syl?.[0] ?? 0.09, o.syl?.[1] ?? 0.22); seq.push([x + sd * 0.45, B.pick(vs)]); st.push([x, sd]); x += sd; }
  let si = 0; const ph = B.rr(0, 1), acc = B.rnd(3, -1, 1);
  const ef = (x) => { // enveloppe syllabique (polynôme : pas de fonction transcendante par échantillon)
    if (x < st[si][0]) si = 0;
    while (si < st.length - 1 && x >= st[si + 1][0]) si++;
    const u = clamp((x - st[si][0]) / st[si][1], 0, 1), q = 4 * u * (1 - u);
    return 0.2 + 0.8 * q * (1.6 - 0.6 * q);
  };
  const wh = o.wh ?? 0.05;
  B.voice(t, dur, {
    f0: o.whisper ? () => 0 : (x) => f0b * (1.12 - 0.22 * x / dur) * (1 + 0.07 * fsin(2.3 * x + ph) + 0.05 * acc(t + x)),
    F: ftrack(seq, k), ef, asp: o.whisper ? () => 1 : () => wh, oq: 0.6, jit: 0.02, shim: 0.15, att: 0.03, rel: 0.06,
    bw: [90 * k, 110 * k, 160 * k, 220 * k], a: o.a ?? 1,
  });
}

// ── mélodies (demi-tons depuis do, durées en temps) ──
const CLAIR = [ // « Au clair de la lune »
  [0, 1], [0, 1], [0, 1], [2, 1], [4, 2], [2, 2], [0, 1], [4, 1], [2, 1], [2, 1], [0, 4],
  [0, 1], [0, 1], [0, 1], [2, 1], [4, 2], [2, 2], [0, 1], [4, 1], [2, 1], [2, 1], [0, 4],
  [2, 1], [2, 1], [2, 1], [2, 1], [-3, 2], [-3, 2], [2, 1], [0, 1], [-1, 1], [-3, 1], [-5, 4],
  [0, 1], [0, 1], [0, 1], [2, 1], [4, 2], [2, 2], [0, 1], [4, 1], [2, 1], [2, 1], [0, 4],
];
const WEASEL = [ // « Pop Goes the Weasel » (6/8, en croches) — mélodie de la boîte à diable
  [0, 2], [0, 1], [2, 2], [2, 1], [4, 1], [7, 1], [4, 1], [0, 3],
  [0, 2], [0, 1], [2, 2], [2, 1], [4, 3], [0, 3],
  [0, 2], [0, 1], [2, 2], [2, 1], [4, 1], [7, 1], [4, 1], [0, 3],
  [9, 3], [2, 2], [5, 1], [4, 3], [0, 3],
];
const JACQUES = [ // « Frère Jacques » (manège)
  [0, 1], [2, 1], [4, 1], [0, 1], [0, 1], [2, 1], [4, 1], [0, 1], [4, 1], [5, 1], [7, 2], [4, 1], [5, 1], [7, 2],
  [7, 0.5], [9, 0.5], [7, 0.5], [5, 0.5], [4, 1], [0, 1], [7, 0.5], [9, 0.5], [7, 0.5], [5, 0.5], [4, 1], [0, 1],
  [0, 1], [-5, 1], [0, 2], [0, 1], [-5, 1], [0, 2],
];

// ── pas : talon puis plante ; variantes ≥ 4 = « course » (impact franc, talon et plante rapprochés) ──
function stepT(B) { const run = B.v >= 4; return [0.004, 0.004 + (run ? B.rr(0.016, 0.03) : B.rr(0.045, 0.085)), run ? 1 : B.rr(0.6, 0.8)]; }
const STEP = {
  tile(B) {
    const [t0, t1, k] = stepT(B);
    B.nz(t0, 0.012, { dec: 0.0022, hp: 1700, lp: 10000, a: 0.9 * k });
    B.modal(t0, [[B.rr(2200, 2800), 1, 0.022], [B.rr(3500, 4200), 0.6, 0.016], [B.rr(5200, 6400), 0.4, 0.011]], { ct: 0.0003, a: 0.25 * k });
    B.thump(t0, { f0: 210, f1: 95, k: 0.008, dec: 0.016, a: 0.55 * k });
    B.nz(t1, 0.018, { dec: 0.004, hp: 700, lp: 6000, a: 0.45 * k });
    B.thump(t1, { f0: 160, f1: 85, k: 0.008, dec: 0.018, a: 0.3 * k });
    if (B.ch(0.55)) B.nz(t1 + 0.008, B.rr(0.03, 0.08), { att: 0.008, dec: 0.02, bp: B.rr(2500, 4500), q: 0.9, a: 0.07 });
  },
  concrete(B) {
    const [t0, t1, k] = stepT(B);
    B.nz(t0, 0.02, { dec: 0.0035, hp: 350, lp: 3800, a: 0.85 * k });
    B.thump(t0, { f0: 150, f1: 70, k: 0.01, dec: 0.022, a: 0.6 * k });
    for (let i = 0; i < 14; i++) B.nz(t0 + B.rr(0, 0.09), 0.002, { dec: 0.0005, hp: 2500, lp: 8000, a: B.rr(0.02, 0.1) * k });
    B.nz(t1, 0.022, { dec: 0.005, hp: 250, lp: 3000, a: 0.45 * k });
    B.thump(t1, { f0: 130, f1: 70, dec: 0.02, a: 0.3 * k });
    B.nz(t1, B.rr(0.04, 0.09), { att: 0.01, dec: 0.025, bp: B.rr(1500, 2500), q: 0.7, a: 0.09 });
  },
  metal(B) { // caillebotis / marche métallique
    const [t0, t1, k] = stepT(B), f = B.rr(260, 380);
    const md = (s) => [[f, 1, 0.3 * s], [f * 1.63, 0.8, 0.24 * s], [f * 2.28, 0.6, 0.2 * s], [f * 3.05, 0.5, 0.15 * s], [f * 4.1, 0.35, 0.11 * s], [f * 5.3, 0.25, 0.08 * s], [f * 7.2, 0.15, 0.05 * s]];
    B.nz(t0, 0.008, { dec: 0.0018, hp: 1500, lp: 9000, a: 0.7 * k });
    B.modal(t0, md(1), { ct: 0.0006, a: 0.55 * k }); B.thump(t0, { f0: 160, f1: 90, dec: 0.02, a: 0.4 * k });
    B.modal(t1, md(0.6), { ct: 0.0008, a: 0.3 * k }); B.nz(t1, 0.01, { dec: 0.0025, hp: 1200, a: 0.3 * k });
    for (let i = 0, tt = t0 + B.rr(0.015, 0.03); i < 3; i++, tt += B.rr(0.012, 0.03)) B.nz(tt, 0.004, { dec: 0.001, hp: 2500, lp: 7000, a: 0.18 * k / (i + 1) });
  },
  carpet(B) {
    const [t0, t1, k] = stepT(B);
    B.nz(t0, 0.06, { att: 0.004, dec: 0.016, lp: 650, a: 0.9 * k }); B.thump(t0, { f0: 105, f1: 60, dec: 0.03, a: 0.55 * k });
    B.nz(t0 + 0.006, 0.08, { att: 0.02, dec: 0.03, bp: 2600, q: 0.6, a: 0.05 });
    B.nz(t1, 0.05, { att: 0.006, dec: 0.014, lp: 500, a: 0.5 * k });
  },
  wood(B) { // parquet sur lambourdes
    const [t0, t1, k] = stepT(B), f = B.rr(170, 250), md = [[f, 1, 0.06], [f * 2.12, 0.6, 0.042], [f * 3.35, 0.45, 0.03], [f * 4.9, 0.3, 0.022], [f * 6.8, 0.2, 0.016]];
    B.nz(t0, 0.01, { dec: 0.002, hp: 500, lp: 4500, a: 0.65 * k }); B.modal(t0, md, { ct: 0.001, a: 0.6 * k }); B.thump(t0, { f0: 125, f1: 70, dec: 0.025, a: 0.45 * k });
    B.nz(t1, 0.012, { dec: 0.003, hp: 400, lp: 3500, a: 0.35 * k }); B.modal(t1, md, { ct: 0.0013, a: 0.3 * k });
    if (B.v % 3 === 1) B.fric(t1 + 0.02, B.rr(0.12, 0.2), { rate: (x) => 70 + 120 * x, jit: 0.25, res: [[B.rr(600, 800), 9, 1], [B.rr(1200, 1500), 11, 0.6]], att: 0.03, a: 0.08 });
  },
  vent(B) { // tôle de gaine : « boum » creux et résonnant
    const [t0, t1, k] = stepT(B), f = B.rr(105, 140);
    const md = (s) => [[f, 1, 0.22 * s], [f * 1.6, 0.85, 0.18 * s], [f * 2.45, 0.7, 0.15 * s], [f * 3.7, 0.5, 0.11 * s], [f * 5.6, 0.35, 0.08 * s], [f * 8.3, 0.25, 0.05 * s], [f * 12.1, 0.15, 0.035 * s]];
    B.modal(t0, md(1), { ct: 0.002, a: 0.75 * k }); B.thump(t0, { f0: 95, f1: 50, dec: 0.05, a: 0.6 * k }); B.nz(t0, 0.02, { dec: 0.005, lp: 2500, a: 0.3 * k });
    B.osc(t0 + B.rr(0.01, 0.03), 0.03, { f: B.rr(380, 460), f1: B.rr(230, 280), dec: 0.008, a: 0.18 * k }); // la tôle qui se déforme
    B.modal(t1, md(0.7), { ct: 0.0025, a: 0.35 * k });
    for (let i = 0; i < 3; i++) B.nz(t0 + B.rr(0.02, 0.12), 0.004, { dec: 0.001, hp: 2200, lp: 8000, a: 0.08 });
  },
  grass(B) {
    const [t0, t1, k] = stepT(B);
    B.nz(t0, 0.05, { att: 0.003, dec: 0.015, lp: 400, a: 0.5 * k });
    for (let i = 0; i < 28; i++) B.nz(t0 + B.rr(0, 0.11), 0.003, { dec: 0.0008, hp: 1500, lp: 7000, a: B.rr(0.03, 0.12) * k });
    B.nz(t0, 0.13, { att: 0.02, dec: 0.04, bp: 3200, q: 0.5, a: 0.12 * k });
    B.nz(t1, 0.06, { att: 0.01, dec: 0.02, bp: 2500, q: 0.5, a: 0.08 * k });
  },
  heels(B) { // plante puis talon aiguille : claquement très sec
    const [t0, , k] = stepT(B);
    B.nz(t0, 0.01, { dec: 0.0025, hp: 900, lp: 5000, a: 0.3 * k });
    const t2 = t0 + (B.v >= 4 ? 0.03 : B.rr(0.06, 0.09));
    B.nz(t2, 0.006, { dec: 0.0011, hp: 2500, a: 1 * k });
    B.modal(t2, [[B.rr(2900, 3400), 1, 0.028], [B.rr(4500, 5100), 0.6, 0.02], [B.rr(6500, 7400), 0.4, 0.013], [B.rr(1900, 2300), 0.5, 0.03]], { ct: 0.00012, a: 0.45 * k });
    B.thump(t2, { f0: 260, f1: 150, dec: 0.01, a: 0.25 * k });
  },
  sneakers(B) { // semelle caoutchouc, crissement occasionnel
    const [t0, t1, k] = stepT(B);
    B.nz(t0, 0.03, { att: 0.002, dec: 0.008, lp: 1400, hp: 90, a: 0.7 * k }); B.thump(t0, { f0: 130, f1: 70, dec: 0.022, a: 0.5 * k });
    B.nz(t1, 0.02, { dec: 0.006, lp: 1800, a: 0.38 * k });
    if (B.v === 1 || B.v === 4) B.osc(t1 + 0.012, B.rr(0.05, 0.1), { w: 'tab', harm: [1, 0.6, 0.4, 0.25, 0.15, 0.08], f: B.rr(900, 1400), f1: B.rr(1400, 2100), att: 0.006, dec: 0.04, jit: 0.03, a: 0.16 });
  },
};
// frottement du pantalon et de la veste à chaque pas : doux, à peine audible, il donne la présence du corps
function swish(B, t, k) { B.nz(t, B.rr(0.09, 0.15), { att: 0.035, dec: 0.045, bp: B.rr(1300, 2100), q: 0.6, a: B.rr(0.035, 0.055) * k, am: [B.rr(16, 28), 0.35] }); }
// pas simplifié (séquences lointaines, foule)
function stepLite(B, t, a = 1, hard = true) {
  B.nz(t, 0.016, { dec: 0.004, hp: hard ? 500 : 200, lp: hard ? 5000 : 2500, a: 0.8 * a });
  B.thump(t, { f0: 150, f1: 75, dec: 0.022, a: 0.55 * a });
  B.nz(t + B.rr(0.04, 0.07), 0.02, { dec: 0.005, lp: 2500, a: 0.35 * a });
}
// grincement (porte, plancher, structure) : vitesse en cloche, hauteur qui vacille
function creak(B, t, D, o = {}) {
  const wob = B.rnd(o.wr ?? 7, -1, 1), vel = (x) => Math.pow(Math.max(0, Math.sin(Math.PI * clamp(x / D, 0, 1))), 0.6);
  B.fric(t, D, { rate: (x) => o.r0 + o.r1 * vel(x) * (1 + (o.wd ?? 0.28) * wob(t + x)), jit: o.jit ?? 0.12, av: 0.35, res: o.res, blip: o.blip, att: o.att ?? 0.1, rel: 0.12, ef: (x) => 0.3 + 0.7 * vel(x), a: o.a ?? 1 });
}

// ───────────────────────────── catalogue des sons ─────────────────────────────
// d : durée (s) · v : variantes · sr : 'H' (cadence du contexte) | 'M' 32 kHz | 'L' 22,05 kHz | 'V' 16 kHz
// g : niveau · pk : crête (nombre, ou liste par variante) · loop : son continu (boucle sans couture) · ch : canaux · rev : envoi vers la réverbération
// split : variantes ≥ split réservées aux impacts forts (course) · ivol : intensité déduite du volume
// graph : synthèse temps réel paramétrable · os : durée d'un son continu joué en ponctuel · ref/md : distances
const SND = {};
const def = (name, o) => { SND[name] = o; };

// ── pas ──
for (const s of ['tile', 'concrete', 'metal', 'carpet', 'wood', 'vent', 'grass', 'heels', 'sneakers'])
  def('step_' + s, { d: s === 'metal' || s === 'vent' ? 0.7 : 0.32, v: 6, split: 4, ivol: 1, g: s === 'carpet' ? 0.45 : s === 'heels' ? 0.55 : 0.48, rev: 0.8, r(B) { STEP[s](B); if (s !== 'vent') swish(B, 0, B.v >= 4 ? 1 : 0.75); } });
def('land', { d: 0.4, v: 4, g: 0.75, r(B) {
  B.thump(0.004, { f0: 115, f1: 45, k: 0.02, dec: 0.065, a: 1, drive: 1.6 });
  B.nz(0.004, 0.05, { dec: 0.012, lp: 1500, a: 0.7 }); B.nz(0.004 + B.rr(0.008, 0.025), 0.04, { dec: 0.01, hp: 300, lp: 4000, a: 0.4 });
  B.nz(0, 0.18, { att: 0.03, dec: 0.05, bp: 2200, q: 0.5, a: 0.12 }); // vêtements
  for (let i = 0; i < 5; i++) { const f = B.rr(2600, 5200), d = B.rr(0.04, 0.12); B.modal(0.01 + B.rr(0, 0.12), [[f, 1, d], [f * 2.7, 0.4, d * 0.6]], { a: B.rr(0.02, 0.06) }); } // trousseau de clés
} });
def('footstep_heavy', { d: 0.8, v: 4, sr: 'L', g: 1, rev: 1.3, r(B) {
  B.thump(0.01, { f0: 72, f1: 30, k: 0.04, dec: 0.17, a: 1, drive: 2.2 });
  B.nz(0.005, 0.5, { att: 0.005, dec: 0.12, c: 'b', lp: 160, a: 0.9 });
  B.nz(0.006, 0.05, { dec: 0.012, lp: 900, a: 0.5 });
  B.nz(0.04, 0.22, { att: 0.03, dec: 0.08, bp: B.rr(700, 1000), q: 1.4, a: 0.12 }); // griffes, chair
  for (let i = 0; i < 9; i++) B.nz(0.03 + B.rr(0, 0.35), 0.003, { dec: 0.0008, hp: 2000, lp: 7000, a: B.rr(0.02, 0.07) }); // gravats
} });
def('footsteps_distant', { d: 5, v: 3, sr: 'L', g: 0.7, rev: 1.5, r(B) {
  const n = B.ri(6, 9), dt = B.rr(0.5, 0.62), away = B.v !== 1;
  for (let i = 0; i < n; i++) stepLite(B, 0.05 + i * dt * B.rr(0.95, 1.05), away ? 1 - i / (n + 1) : (i + 1) / (n + 1));
  B.lp(1600); B.verb(0.45, 1.6, 0.5);
} });

// ── impacts (opts.intensity : plus fort et plus brillant) ──
def('hit_plastic', { d: 0.35, v: 5, g: 0.65, r(B) { const f = hit(B, 'plastic'); if (B.ch(0.5)) hit(B, 'plastic', B.rr(0.07, 0.14), 0.3, { f }); } });
def('hit_metal', { d: 1.6, v: 5, sr: 'H', g: 0.6, r(B) { const f = hit(B, 'metal'); if (B.ch(0.4)) hit(B, 'metal', B.rr(0.08, 0.16), 0.25, { f }); } });
def('hit_wood', { d: 0.4, v: 5, g: 0.7, r(B) { const f = hit(B, 'wood'); if (B.ch(0.5)) hit(B, 'wood', B.rr(0.08, 0.15), 0.3, { f }); } });
def('hit_glass', { d: 1.0, v: 5, sr: 'H', g: 0.55, r(B) { const f = hit(B, 'glass'); if (B.ch(0.35)) hit(B, 'glass', B.rr(0.05, 0.1), 0.25, { f }); } });
def('hit_ceramic', { d: 0.8, v: 5, sr: 'H', g: 0.6, r(B) { const f = hit(B, 'ceramic'); if (B.ch(0.3)) hit(B, 'ceramic', B.rr(0.04, 0.09), 0.25, { f }); } });
def('hit_can', { d: 0.7, v: 5, sr: 'H', g: 0.55, r(B) {
  const f = hit(B, 'can'); hit(B, 'can', B.rr(0.04, 0.08), 0.3, { f });
  if (B.ch(0.5)) for (let i = 0, t = 0.15; i < 8; i++, t += B.rr(0.025, 0.05)) B.nz(t, 0.003, { dec: 0.0008, hp: 2500, lp: 9000, a: 0.12 * (1 - i / 8) }); // roule
} });
def('hit_cardboard', { d: 0.3, v: 4, g: 0.7, r(B) {
  B.nz(0.002, 0.05, { dec: 0.011, lp: 1000, hp: 70, a: 1 }); B.thump(0.002, { f0: 165, f1: 90, dec: 0.028, a: 0.6 });
  const f = B.rr(200, 280); B.modal(0.002, [[f, 1, 0.025], [f * 1.8, 0.6, 0.02], [f * 2.9, 0.4, 0.014]], { ct: 0.0015, a: 0.5 });
  B.nz(0.01, 0.07, { att: 0.005, dec: 0.02, bp: 2500, q: 0.7, a: 0.12 });
} });
def('hit_soft', { d: 0.3, v: 4, g: 0.6, r(B) {
  B.nz(0.002, 0.08, { att: 0.003, dec: 0.02, lp: 350, a: 1 }); B.thump(0.002, { f0: 90, f1: 55, dec: 0.035, a: 0.6 });
  B.nz(0.002, 0.1, { att: 0.01, dec: 0.03, bp: 1800, q: 0.5, a: 0.06 });
} });
def('hit_paper', { d: 0.3, v: 4, g: 0.55, r(B) {
  B.nz(0.002, 0.05, { dec: 0.012, bp: 1800, q: 0.6, a: 0.6 }); B.thump(0.002, { f0: 130, f1: 80, dec: 0.02, a: 0.3 });
  for (let i = 0; i < 12; i++) B.nz(0.004 + B.rr(0, 0.08), 0.002, { dec: 0.0006, hp: 3000, lp: 10000, a: B.rr(0.04, 0.15) });
} });
def('hit_body', { d: 0.35, v: 4, g: 0.8, r(B) {
  B.thump(0.002, { f0: 140, f1: 60, k: 0.015, dec: 0.04, a: 1, drive: 1.2 });
  B.nz(0.002, 0.02, { dec: 0.004, bp: 1500, q: 0.8, a: 0.6 }); B.nz(0.004, 0.1, { att: 0.01, dec: 0.03, bp: 2200, q: 0.5, a: 0.12 });
} });
def('thud', { d: 0.6, v: 4, sr: 'L', g: 0.85, rev: 1.2, r(B) {
  B.thump(0.003, { f0: 95, f1: 40, k: 0.03, dec: 0.09, a: 1, drive: 1.5 });
  B.nz(0.003, 0.08, { dec: 0.02, lp: 600, a: 0.7 }); B.nz(0.003, 0.02, { dec: 0.004, lp: 2500, hp: 300, a: 0.25 });
} });
def('glass_break', { d: 1.6, v: 4, sr: 'H', g: 0.85, rev: 1.3, r(B) {
  B.nz(0.002, 0.012, { dec: 0.002, hp: 2500, a: 1 }); hit(B, 'glass', 0.002, 0.6);
  B.nz(0.003, 0.2, { dec: 0.035, hp: 2200, lp: 14000, a: 0.55 }); B.thump(0.002, { f0: 160, f1: 80, dec: 0.02, a: 0.25 });
  for (let i = 0; i < 70; i++) { const t = 0.004 + Math.pow(B.r(), 2.2) * 1.1; shard(B, t, B.rr(0.05, 0.3) * (1 - t * 0.6), 2200, 9500); }
} });
def('glass_crack', { d: 0.6, v: 4, sr: 'H', g: 0.6, r(B) {
  B.nz(0, 0.004, { dec: 0.001, hp: 2500, a: 1 }); hit(B, 'glass', 0.001, 0.25, { dm: 0.4 });
  for (let i = 0, t = 0.01; i < B.ri(4, 8); i++, t += B.rr(0.01, 0.06)) { B.nz(t, 0.003, { dec: 0.0007, hp: 3000, a: B.rr(0.3, 0.8) }); shard(B, t, 0.06, 3000, 9000, 0.5); }
  B.fric(0.02, 0.18, { rate: (x) => 900 + 3000 * x, jit: 0.5, av: 0.7, res: [[4200, 6, 1], [6800, 8, 0.6]], att: 0.01, a: 0.1 }); // verre qui travaille
} });
def('glass_shatter_big', { duck: 0.3, dkT: 2, d: 5, v: 2, sr: 'M', g: 1, rev: 1.6, ref: 4, md: 90, r(B) {
  B.thump(0.005, { f0: 90, f1: 40, k: 0.03, dec: 0.12, a: 0.9, drive: 1.5 });
  B.nz(0.003, 0.6, { att: 0.001, dec: 0.12, hp: 1500, a: 0.9 }); B.nz(0.003, 0.03, { dec: 0.006, a: 0.8 });
  for (const w of [0, 0.18, 0.5, 0.95, 1.5]) { // la vitrine s'effondre par pans successifs
    B.nz(w + 0.01, 0.4, { dec: 0.1, hp: 2500, lp: 12000, a: 0.35 });
    const nn = w < 0.6 ? 60 : 35;
    for (let i = 0; i < nn; i++) shard(B, w + Math.pow(B.r(), 1.6) * 0.7, B.rr(0.04, 0.25) * (1 - w * 0.3), w ? 1800 : 2500, 9500, w > 0.5 ? 1.3 : 1);
  }
  for (let i = 0; i < 60; i++) { const t = 1.8 + Math.pow(B.r(), 1.4) * 2.9; shard(B, t, B.rr(0.01, 0.07) * (1 - (t - 1.8) / 3.2), 2500, 9000, 0.8); } // débris qui glissent
} });
def('bottle_break', { d: 1.3, v: 4, sr: 'H', g: 0.85, rev: 1.2, r(B) {
  const f = B.rr(900, 1400);
  B.modal(0.002, [[f, 1, 0.12], [f * 2.1, 0.6, 0.09], [f * 3.6, 0.45, 0.06], [f * 5.3, 0.3, 0.04]], { ct: 0.0002, a: 0.6 });
  B.nz(0.002, 0.012, { dec: 0.002, hp: 2000, a: 1 }); B.nz(0.003, 0.18, { dec: 0.03, hp: 1800, lp: 12000, a: 0.5 });
  B.thump(0.002, { f0: 180, f1: 90, dec: 0.025, a: 0.35 });
  for (let i = 0; i < 40; i++) { const t = 0.004 + Math.pow(B.r(), 2) * 0.8; shard(B, t, B.rr(0.05, 0.25) * (1 - t * 0.7), 1800, 8000); }
  B.nz(0.01, 0.45, { att: 0.01, dec: 0.12, lp: 2500, hp: 200, a: 0.3, am: [17, 0.5] }); // le liquide éclabousse
} });
def('cardboard_drop', { d: 0.6, v: 3, g: 0.75, r(B) {
  B.thump(0.003, { f0: 125, f1: 60, k: 0.02, dec: 0.05, a: 1 }); B.nz(0.003, 0.08, { dec: 0.018, lp: 900, hp: 60, a: 0.8 });
  const f = B.rr(150, 220); B.modal(0.003, [[f, 1, 0.04], [f * 1.7, 0.6, 0.03], [f * 2.8, 0.4, 0.02]], { ct: 0.002, a: 0.6 });
  B.thump(0.065, { f0: 140, f1: 80, dec: 0.03, a: 0.4 }); B.nz(0.065, 0.05, { dec: 0.012, lp: 1200, a: 0.35 }); // l'autre coin
  for (let i = 0; i < 6; i++) B.nz(0.02 + B.rr(0, 0.15), 0.004, { dec: 0.0012, hp: 1500, lp: 6000, a: B.rr(0.05, 0.15) }); // contenu
  B.nz(0.01, 0.12, { att: 0.01, dec: 0.04, bp: 2500, q: 0.6, a: 0.1 });
} });

// ── portes, bâtiment ──
function latch(B, t, a = 0.5) { B.modal(t, [[B.rr(1700, 2100), 1, 0.025], [B.rr(2800, 3300), 0.6, 0.018], [B.rr(4300, 5000), 0.35, 0.012]], { ct: 0.0002, a }); B.nz(t, 0.006, { dec: 0.0015, hp: 2200, a: a * 0.8 }); }
function doorHit(B, t, a = 1) {
  B.thump(t, { f0: 110, f1: 58, k: 0.02, dec: 0.06, a: 0.9 * a, drive: 1.2 });
  const f = B.rr(85, 105); B.modal(t, [[f, 1, 0.08], [f * 1.9, 0.7, 0.06], [f * 2.75, 0.5, 0.05], [f * 4.3, 0.35, 0.04], [f * 6.8, 0.2, 0.03]], { ct: 0.003, a: 0.6 * a });
  B.nz(t, 0.04, { dec: 0.01, lp: 2500, hp: 150, a: 0.5 * a });
}
def('door_open', { d: 0.9, v: 3, g: 0.7, r(B) {
  tick(B, 0.02, B.rr(2000, 2500), 0.35); // poignée
  latch(B, 0.09 + B.rr(0, 0.03), 0.5); B.thump(0.1, { f0: 220, f1: 140, dec: 0.015, a: 0.3 });
  B.nz(0.12, 0.6, { att: 0.2, dec: 0.25, lp: 700, hp: 80, a: 0.25 }); // déplacement d'air
  creak(B, 0.13, B.rr(0.35, 0.6), { r0: 30, r1: 40, res: [[B.rr(800, 1000), 6, 1], [B.rr(1400, 1700), 8, 0.5]], a: 0.06 });
  B.thump(0.11, { f0: 120, f1: 80, dec: 0.03, a: 0.25 });
} });
def('door_close', { d: 0.8, v: 3, g: 0.8, rev: 1.1, r(B) {
  const t = B.rr(0.28, 0.36);
  B.nz(0, t + 0.02, { att: t * 0.6, dec: 0.15, lp: 600, a: 0.22 });
  doorHit(B, t, 0.9); latch(B, t + 0.004, 0.45); B.thump(t + 0.03, { f0: 160, f1: 100, dec: 0.015, a: 0.15 });
} });
def('door_slam', { d: 1.3, v: 3, g: 1, rev: 1.4, ref: 3, r(B) { // porte métallique claquée
  B.thump(0.002, { f0: 90, f1: 45, k: 0.025, dec: 0.12, a: 1, drive: 2 }); B.nz(0.002, 0.08, { dec: 0.02, lp: 3000, a: 0.8 });
  const f = B.rr(64, 76), r = [1, 1.89, 3.11, 4.87, 7.17, 10.4, 14.9, 21.1, 30], md = r.map((x, i) => [f * x * B.rr(0.98, 1.02), 1 / (1 + i * 0.35), 0.45 * Math.pow(0.82, i)]);
  B.modal(0.002, md, { ct: 0.002, a: 0.8 });
  latch(B, 0.006, 0.5);
  for (let i = 0, t = 0.05; i < 5; i++, t += B.rr(0.03, 0.06)) B.nz(t, 0.01, { dec: 0.003, hp: 600, lp: 5000, a: 0.15 * (1 - i / 5) }); // la porte vibre dans le bâti
} });
def('door_creak', { d: 2.4, v: 3, g: 0.75, rev: 1.2, r(B) {
  const D = B.rr(1.2, 1.9), metal = B.v === 2;
  const res = metal ? [[B.rr(1000, 1200), 18, 1], [B.rr(1800, 2100), 22, 0.6], [B.rr(2900, 3300), 24, 0.35], [B.rr(600, 700), 14, 0.4]]
    : [[B.rr(420, 520), 9, 1], [B.rr(760, 880), 11, 0.75], [B.rr(1250, 1450), 12, 0.5], [B.rr(2000, 2300), 14, 0.3]];
  creak(B, 0.02, D, { r0: metal ? 60 : 22, r1: metal ? 260 : 150, res, a: 1 });
} });
def('door_locked', { d: 1.0, v: 3, g: 0.75, r(B) { // la poignée bute contre la serrure
  const n = 3 + (B.v % 2);
  for (let k = 0, t = 0.01; k < n; k++, t += B.rr(0.14, 0.22)) {
    tick(B, t, B.rr(1800, 2600), 0.3);
    B.thump(t + 0.03, { f0: 150, f1: 90, dec: 0.02, a: 0.5 });
    B.nz(t + 0.03, 0.03, { dec: 0.008, lp: 2500, hp: 300, a: 0.4 });
    B.modal(t + 0.03, [[B.rr(850, 950), 1, 0.04], [B.rr(1450, 1600), 0.6, 0.03], [B.rr(2500, 2800), 0.4, 0.02]], { ct: 0.0005, a: 0.4 });
  }
} });
def('door_unlock', { d: 0.7, v: 3, g: 0.7, r(B) {
  B.nz(0, 0.12, { att: 0.02, dec: 0.05, bp: 4500, q: 1.5, a: 0.15 }); // clé qu'on insère
  for (let i = 0; i < 4; i++) tick(B, 0.02 + i * 0.022 + B.rr(0, 0.008), B.rr(4500, 6500), 0.12, 0.006);
  B.fric(0.2, 0.12, { rate: 60, jit: 0.5, res: [[3000, 4, 1]], a: 0.08 });
  const t = B.rr(0.33, 0.38); // le pêne recule
  B.modal(t, [[B.rr(650, 750), 1, 0.05], [B.rr(1250, 1400), 0.7, 0.04], [B.rr(2100, 2400), 0.5, 0.03], [B.rr(3300, 3700), 0.3, 0.02]], { ct: 0.0004, a: 0.8 });
  B.thump(t, { f0: 180, f1: 110, dec: 0.025, a: 0.4 }); B.nz(t, 0.005, { dec: 0.0012, hp: 1500, a: 0.5 });
} });
def('door_rattle', { d: 2.0, v: 3, g: 0.9, rev: 1.2, r(B) { // quelqu'un secoue la porte violemment
  for (let t = 0.01; t < 1.7; t += B.rr(0.07, 0.16)) {
    const a = B.rr(0.4, 1);
    B.thump(t, { f0: 120, f1: 70, dec: 0.03, a: 0.6 * a }); B.nz(t, 0.035, { dec: 0.008, lp: 3000, hp: 200, a: 0.45 * a });
    tick(B, t + B.rr(0.005, 0.02), B.rr(1500, 2400), 0.25 * a);
    if (B.ch(0.3)) B.modal(t, [[B.rr(90, 110), 1, 0.06], [B.rr(190, 230), 0.6, 0.04]], { ct: 0.003, a: 0.4 * a });
  }
} });
def('shutter_move', { cap: 2, d: 3, loop: true, g: 0.8, rev: 1.1, os: 2.5, r(B) { // rideau métallique qui s'enroule
  for (let t = 0; t < B.dur; t += 1 / B.rr(8, 11)) {
    B.modal(t, [[B.rr(380, 520), 1, 0.06], [B.rr(900, 1200), 0.6, 0.05], [B.rr(1700, 2300), 0.4, 0.03], [B.rr(3000, 3800), 0.25, 0.02]], { ct: 0.0008, a: B.rr(0.25, 0.5) });
    B.nz(t, 0.01, { dec: 0.003, hp: 1500, a: 0.15 });
  }
  B.nz(0, B.dur, { c: 'p', lp: 500, hp: 60, a: 0.5, ef: B.rnd(6, 0.6, 1) });
  B.fric(0, B.dur, { rate: 60, jit: 0.8, res: [[2500, 3, 1], [4200, 4, 0.6]], att: 0, rel: 0, a: 0.06 });
  B.osc(0, B.dur, { w: 'tab', f: 100, harm: [1, 0.5, 0.3, 0.2], a: 0.12 }); B.osc(0, B.dur, { f: 680, a: 0.025 }); // moteur
} });
def('shutter_stop', { d: 1.0, v: 2, g: 0.9, rev: 1.3, r(B) {
  B.thump(0, { f0: 100, f1: 55, dec: 0.1, a: 0.9 });
  B.modal(0, [[180, 1, 0.3], [410, 0.8, 0.25], [690, 0.6, 0.2], [1050, 0.5, 0.15], [1600, 0.4, 0.1], [2400, 0.3, 0.08]].map((m) => [m[0] * B.rr(0.95, 1.05), m[1], m[2]]), { ct: 0.001, a: 0.8 });
  for (let i = 0, t = 0.04; i < 10; i++, t += B.rr(0.025, 0.06)) B.nz(t, 0.008, { dec: 0.002, hp: 1200, lp: 7000, a: 0.25 * (1 - i / 10) });
} });
function slide(B, t, d, a = 1, wood = true) { // tiroir qui coulisse
  B.fric(t, d, { rate: (x) => 120 + 200 * x / d, jit: 0.6, res: wood ? [[350, 3, 1], [800, 4, 0.6], [1600, 5, 0.3]] : [[900, 5, 1], [2100, 6, 0.6], [3400, 7, 0.4]], nz: 0.2, att: 0.05, rel: 0.05, a: 0.35 * a });
  B.nz(t, d, { att: 0.05, lp: 400, a: 0.2 * a, am: [25, 0.5] });
}
def('drawer_open', { d: 0.6, v: 3, g: 0.65, r(B) {
  const d = B.rr(0.3, 0.4); slide(B, 0.02, d, 1, B.v !== 2);
  for (let i = 0; i < 4; i++) B.nz(0.05 + B.rr(0, d), 0.004, { dec: 0.0012, hp: 1500, lp: 6000, a: B.rr(0.04, 0.12) }); // stylos
  B.thump(0.02 + d, { f0: 160, f1: 100, dec: 0.02, a: 0.4 }); B.nz(0.02 + d, 0.01, { dec: 0.003, lp: 3000, a: 0.3 });
} });
def('drawer_close', { d: 0.6, v: 3, g: 0.7, r(B) {
  const d = B.rr(0.2, 0.3); slide(B, 0.01, d, 0.8, B.v !== 2);
  B.thump(0.01 + d, { f0: 140, f1: 80, dec: 0.03, a: 0.8 }); B.nz(0.01 + d, 0.02, { dec: 0.005, lp: 3500, a: 0.5 });
  for (let i = 0; i < 4; i++) B.nz(0.02 + d + B.rr(0, 0.05), 0.004, { dec: 0.0012, hp: 1500, lp: 6000, a: B.rr(0.04, 0.12) });
} });
def('cabinet_open', { d: 0.7, v: 3, g: 0.6, r(B) {
  B.nz(0, 0.005, { dec: 0.0015, hp: 800, lp: 5000, a: 0.5 }); B.thump(0, { f0: 300, f1: 180, dec: 0.012, a: 0.3 }); // loqueteau magnétique
  creak(B, 0.04, B.rr(0.2, 0.35), { r0: 50, r1: 70, res: [[B.rr(1100, 1300), 15, 1], [B.rr(2000, 2300), 18, 0.5]], a: 0.1 });
  B.nz(0.05, 0.35, { att: 0.12, dec: 0.12, lp: 900, a: 0.12 });
} });
def('cabinet_close', { d: 0.5, v: 3, g: 0.65, r(B) {
  B.nz(0, 0.12, { att: 0.08, dec: 0.04, lp: 700, a: 0.12 });
  const t = 0.1, f = B.rr(160, 220);
  B.modal(t, [[f, 1, 0.05], [f * 2.2, 0.6, 0.035], [f * 3.6, 0.4, 0.025]], { ct: 0.0015, a: 0.6 }); B.thump(t, { f0: 150, f1: 90, dec: 0.025, a: 0.5 });
  B.nz(t + 0.005, 0.005, { dec: 0.0012, hp: 1200, lp: 6000, a: 0.4 });
} });
def('fridge_open', { d: 0.9, v: 2, g: 0.6, r(B) {
  B.thump(0.01, { f0: 140, f1: 70, dec: 0.04, a: 0.6 }); B.nz(0.01, 0.08, { att: 0.003, dec: 0.03, lp: 600, a: 0.4 }); // joint qui se décolle
  for (let i = 0; i < 3; i++) { const f = B.rr(1800, 3200), d = B.rr(0.1, 0.25); B.modal(0.05 + B.rr(0, 0.15), [[f, 1, d], [f * 2.3, 0.5, d * 0.6]], { ct: 0.0002, a: B.rr(0.08, 0.2) }); } // bouteilles
  B.nz(0.05, 0.6, { att: 0.15, dec: 0.25, lp: 1200, a: 0.1 });
} });
def('fridge_close', { d: 0.8, v: 2, g: 0.7, r(B) {
  B.nz(0, 0.12, { att: 0.08, dec: 0.04, lp: 600, a: 0.15 });
  B.thump(0.1, { f0: 110, f1: 60, dec: 0.05, a: 0.8 }); B.nz(0.1, 0.06, { dec: 0.02, bp: 500, q: 1, a: 0.3 });
  for (let i = 0; i < 5; i++) { const f = B.rr(1800, 3200), d = B.rr(0.08, 0.2); B.modal(0.11 + B.rr(0, 0.08), [[f, 1, d], [f * 2.3, 0.5, d * 0.6]], { ct: 0.0002, a: B.rr(0.06, 0.18) }); }
} });
def('vent_grate', { d: 0.8, v: 3, g: 0.7, r(B) {
  B.fric(0, 0.25, { rate: (x) => 300 + 900 * x, jit: 0.7, av: 0.6, res: [[2300, 4, 1], [3700, 5, 0.6], [1200, 3, 0.4]], nz: 0.15, att: 0.03, a: 0.25 });
  for (let i = 0; i < 4; i++) tick(B, B.rr(0.02, 0.2), B.rr(1500, 2800), 0.15);
  const t = 0.22; B.modal(t, [[B.rr(580, 660), 1, 0.12], [B.rr(1380, 1500), 0.7, 0.1], [B.rr(2300, 2500), 0.5, 0.08], [B.rr(3700, 4100), 0.35, 0.05]], { ct: 0.0005, a: 0.6 });
  B.thump(t, { f0: 200, f1: 120, dec: 0.02, a: 0.3 });
} });
function clang(B, t, a = 1, f = 120) { // gros impact de tôle épaisse
  B.thump(t, { f0: 95, f1: 50, dec: 0.08, a: 0.8 * a, drive: 1.5 });
  B.modal(t, [[f, 1, 0.5], [f * 2.15, 0.8, 0.4], [f * 3.6, 0.6, 0.3], [f * 5.8, 0.5, 0.25], [f * 9.2, 0.3, 0.2], [f * 13.5, 0.2, 0.12]].map((m) => [m[0] * B.rr(0.97, 1.03), m[1], m[2]]), { ct: 0.0012, a: 0.7 * a });
  B.nz(t, 0.05, { dec: 0.012, lp: 4000, a: 0.4 * a });
}
def('hatch_open', { d: 2.4, v: 2, g: 0.9, rev: 1.3, r(B) {
  B.modal(0, [[420, 1, 0.08], [980, 0.7, 0.06], [1700, 0.4, 0.04]], { ct: 0.0006, a: 0.6 }); B.thump(0, { f0: 160, f1: 90, dec: 0.03, a: 0.5 }); // loquet
  creak(B, 0.1, 0.9, { r0: 18, r1: 30, res: [[220, 8, 1], [380, 10, 0.6], [610, 12, 0.4]], a: 0.5 });
  clang(B, 1.05, 1, B.rr(110, 130));
} });
def('hatch_close', { d: 1.8, v: 2, g: 0.95, rev: 1.3, r(B) {
  B.nz(0, 0.25, { att: 0.18, dec: 0.05, lp: 500, a: 0.2 });
  clang(B, 0.25, 1, B.rr(110, 130));
  B.modal(0.4, [[420, 1, 0.08], [980, 0.7, 0.06], [1700, 0.4, 0.04]], { ct: 0.0006, a: 0.5 }); B.nz(0.4, 0.005, { dec: 0.0015, hp: 1200, a: 0.4 });
} });
def('building_creak', { d: 3.2, v: 3, sr: 'L', g: 0.85, rev: 1.5, r(B) {
  creak(B, 0.1, B.rr(1.8, 2.8), { r0: 6, r1: 16, wr: 3, wd: 0.4, blip: 40, res: [[B.rr(80, 100), 6, 1], [B.rr(150, 175), 7, 0.7], [B.rr(250, 290), 8, 0.5], [B.rr(420, 470), 9, 0.3]], a: 1 });
  for (let i = 0; i < B.ri(1, 3); i++) { const t = B.rr(0.2, 2.8); B.nz(t, 0.004, { dec: 0.001, hp: 1000, lp: 6000, a: 0.3 }); B.modal(t, [[B.rr(300, 600), 1, 0.05]], { a: 0.2 }); } // dilatation
} });
def('creak', { d: 1.4, v: 4, g: 0.7, rev: 1.2, r(B) {
  creak(B, 0.02, B.rr(0.6, 1.1), { r0: 25, r1: 70, res: [[B.rr(320, 400), 8, 1], [B.rr(580, 680), 10, 0.6], [B.rr(1000, 1200), 12, 0.4], [B.rr(1700, 1900), 14, 0.2]], a: 1 });
} });
def('metal_screech', { d: 2.4, v: 3, sr: 'H', g: 0.85, rev: 1.3, r(B) {
  const D = B.rr(1.4, 2.2), wob = B.rnd(5, -1, 1), base = B.rr(420, 600);
  B.fric(0, D, { rate: (x) => base * (1 + 0.45 * wob(x)) + 300 * Math.sin(Math.PI * x / D), jit: 0.05, av: 0.2, res: [[B.rr(1150, 1350), 25, 1], [B.rr(2500, 2800), 30, 0.7], [B.rr(3700, 4100), 30, 0.5], [B.rr(5100, 5600), 30, 0.35], [B.rr(650, 750), 20, 0.5]], att: 0.08, rel: 0.2, a: 1 });
  B.nz(0, D, { att: 0.1, rel: 0.2, bp: 3000, q: 2, a: 0.12 });
} });

// ── interface, électricité ──
def('switch', { d: 0.12, v: 3, sr: 'H', g: 0.5, r(B) {
  B.nz(0.001, 0.003, { dec: 0.0007, hp: 2000, a: 0.9 });
  B.modal(0.001, [[B.rr(2400, 2900), 1, 0.012], [B.rr(3900, 4400), 0.6, 0.008], [B.rr(6000, 6600), 0.4, 0.006]], { ct: 0.0002, a: 0.4 });
  B.thump(0.001, { f0: 420, f1: 250, dec: 0.008, a: 0.35 });
  B.nz(0.012, 0.003, { dec: 0.0008, hp: 1500, lp: 8000, a: 0.3 }); // le basculeur se cale
} });
def('button', { d: 0.12, v: 3, g: 0.45, r(B) {
  B.nz(0, 0.004, { dec: 0.001, hp: 1200, lp: 7000, a: 0.7 }); B.thump(0, { f0: 600, f1: 350, dec: 0.006, a: 0.3 });
  B.nz(0.06 + B.rr(0, 0.02), 0.003, { dec: 0.0008, hp: 1500, lp: 7000, a: 0.3 });
} });
def('beep', { d: 0.16, g: 0.5, rev: 0.5, r(B) { B.osc(0.002, 0.12, { w: 'sqr', f: 1200, att: 0.003, rel: 0.01, lp: 4000, a: 0.5 }); B.spk(300, 6000, 2400, 4); } });
def('error', { d: 0.5, g: 0.55, r(B) { B.osc(0, 0.16, { w: 'sqr', f: 330, lp: 2000, rel: 0.01, a: 0.5 }); B.osc(0.2, 0.24, { w: 'sqr', f: 247, lp: 2000, rel: 0.02, a: 0.5 }); B.spk(200, 5000, 1200, 3); } });
def('success', { d: 1.2, g: 0.5, r(B) { [523.25, 659.25, 783.99].forEach((f, i) => B.osc(i * 0.09, 0.9, { w: 'tab', harm: [1, 0.25, 0.1, 0.05], f, att: 0.004, dec: 0.25, a: 0.35 })); } });
def('notify', { d: 1.0, g: 0.45, r(B) {
  B.osc(0, 0.6, { w: 'tab', harm: [1, 0.2, 0.06], f: 783.99, att: 0.004, dec: 0.18, a: 0.4 });
  B.osc(0.13, 0.8, { w: 'tab', harm: [1, 0.2, 0.06], f: 1046.5, att: 0.004, dec: 0.25, a: 0.4 });
} });
def('alert', { d: 0.7, g: 0.6, rev: 0.6, r(B) { for (let i = 0; i < 3; i++) B.osc(i * 0.15, 0.09, { w: 'sqr', f: 2400, att: 0.002, rel: 0.006, a: 0.4 }); B.spk(500, 7000, 2400, 5); } });
def('page', { d: 0.6, sr: 'H', g: 0.45, r(B) { for (let i = 0; i < 4; i++) B.osc(i * 0.1, 0.05, { w: 'sqr', f: i % 2 ? 3200 : 2800, att: 0.002, rel: 0.005, a: 0.35 }); B.spk(800, 9000, 3000, 6); } });
def('relay', { d: 0.06, v: 3, sr: 'H', g: 0.4, r(B) { tick(B, 0, B.rr(3400, 4200), 0.8, 0.008); B.nz(0.004 + B.rr(0, 0.002), 0.002, { dec: 0.0004, hp: 3000, a: 0.3 }); } });
def('breaker', { d: 1.6, v: 2, g: 0.8, rev: 1.1, r(B) { // gros disjoncteur de tableau
  B.nz(0, 0.006, { dec: 0.0015, hp: 800, a: 1 });
  B.modal(0, [[420, 1, 0.05], [980, 0.8, 0.04], [1750, 0.6, 0.03], [2900, 0.4, 0.02], [4300, 0.25, 0.015]].map((m) => [m[0] * B.rr(0.95, 1.05), m[1], m[2]]), { ct: 0.0005, a: 0.8 });
  B.thump(0, { f0: 160, f1: 90, dec: 0.03, a: 0.6 });
  B.modal(0.003, [[3300, 0.3, 0.15], [5100, 0.2, 0.1]], { a: 0.2 }); // ressort
  B.nz(0, 0.05, { dec: 0.015, bp: 3000, q: 1, a: 0.3, am: [100, 0.8] }); // petit arc
  B.osc(0.01, 1.5, { w: 'tab', f: 50, harm: [0.5, 1, 0.3, 0.4, 0.1, 0.2, 0.05, 0.08], env: [[0, 0], [0.02, 1], [0.25, 0.55], [1.5, 0]], a: 0.35 }); // le ronflement change
} });
def('power_down', { d: 4, sr: 'L', g: 0.9, rev: 1.3, r(B) { // tout le bâtiment s'éteint
  B.nz(0, 0.008, { dec: 0.002, hp: 600, a: 1 }); B.thump(0, { f0: 140, f1: 70, dec: 0.05, a: 0.8, drive: 1.3 });
  B.modal(0, [[380, 1, 0.08], [870, 0.7, 0.06], [1500, 0.5, 0.04], [2600, 0.3, 0.03]], { ct: 0.0006, a: 0.7 }); // contacteur principal
  B.osc(0.01, 2.8, { w: 'tab', harm: [0.5, 1, 0.35, 0.45, 0.15, 0.25, 0.08, 0.1], fe: (x) => 50 * (1 - 0.62 * Math.pow(Math.min(1, x / 2.6), 0.8)), env: [[0, 1], [0.4, 0.8], [2.8, 0]], a: 0.5 });
  B.nz(0, 3.6, { c: 'p', lp: (x) => 150 + 1400 * Math.exp(-x / 0.9), env: [[0, 0.6], [3.6, 0]], a: 0.5 }); // la ventilation ralentit
  for (let i = 0; i < 6; i++) tick(B, B.rr(0.1, 1.8), B.rr(2000, 4000), B.rr(0.15, 0.35), 0.01); // relais qui retombent
  for (let i = 0; i < 3; i++) B.nz(B.rr(0.05, 0.6), 0.003, { dec: 0.0008, hp: 3000, a: 0.25 }); // tubes
} });
def('power_up', { d: 3.5, sr: 'L', g: 0.8, rev: 1.3, r(B) {
  B.nz(0, 0.008, { dec: 0.002, hp: 600, a: 0.9 }); B.thump(0, { f0: 140, f1: 70, dec: 0.05, a: 0.7 });
  B.modal(0, [[380, 1, 0.08], [870, 0.7, 0.06], [1500, 0.5, 0.04]], { ct: 0.0006, a: 0.6 });
  B.osc(0.02, 3.4, { w: 'tab', harm: [0.5, 1, 0.35, 0.45, 0.15, 0.25, 0.08, 0.1], fe: (x) => 50 * (0.35 + 0.65 * (1 - Math.exp(-x / 0.5))) * (1 + 0.04 * Math.exp(-x / 0.6) * Math.sin(x * 9)), env: [[0, 0], [0.4, 0.9], [1.2, 0.6], [3.4, 0.5]], a: 0.45 });
  B.nz(0.1, 3.3, { c: 'p', lp: (x) => 150 + 1200 * (1 - Math.exp(-x / 0.8)), env: [[0, 0], [1.5, 0.5], [3.3, 0.45]], a: 0.5 });
  for (let i = 0; i < 5; i++) tick(B, B.rr(0.05, 1.2), B.rr(2000, 4000), B.rr(0.15, 0.3), 0.01);
  for (let i = 0; i < 9; i++) { const t = B.rr(0.5, 2.2); B.nz(t, 0.003, { dec: 0.0008, hp: 2500, a: 0.3 }); B.osc(t, B.rr(0.04, 0.12), { w: 'tab', f: 100, harm: [0.3, 0.5, 0.4, 0.3, 0.25, 0.2], att: 0.002, rel: 0.01, a: 0.12 }); } // les tubes s'amorcent
} });
def('camera_switch', { d: 0.25, v: 3, sr: 'H', g: 0.5, r(B) { // relais de commutation CCTV + neige
  tick(B, 0, B.rr(3000, 3800), 0.7, 0.008);
  B.nz(0.004, 0.14, { att: 0.002, dec: 0.05, hp: 700, lp: 9000, a: 0.35, am: [B.rr(50, 70), 0.5] });
  for (let i = 0; i < 6; i++) B.nz(0.005 + B.rr(0, 0.1), 0.002, { dec: 0.0005, hp: 2500, a: B.rr(0.1, 0.3), tail: 0.004 });
  B.nz(0.01, 0.003, { dec: 0.001, hp: 6000, a: 0.25 }); // THT du moniteur
} });
def('rec_start', { d: 1.0, g: 0.55, r(B) {
  B.nz(0, 0.006, { dec: 0.0015, hp: 700, a: 0.8 }); B.thump(0, { f0: 180, f1: 100, dec: 0.02, a: 0.5 }); // solénoïde
  B.osc(0.03, 0.7, { w: 'saw', f: 80, f1: 140, gt: 0.4, lp: 900, att: 0.05, rel: 0.2, a: 0.18 }); // moteur
  B.osc(0.1, 0.8, { f: 600, f1: 1500, gt: 0.6, att: 0.2, rel: 0.2, a: 0.04 }); // tambour de têtes
  B.osc(0.3, 0.1, { w: 'sqr', f: 2000, att: 0.002, rel: 0.008, a: 0.25, lp: 6000 }); // bip
} });

// ── caisse, serrures ──
def('register_open', { d: 1.5, v: 2, sr: 'H', g: 0.75, r(B) {
  tick(B, 0, 1800, 0.4); tick(B, 0.06, 1600, 0.4); // touches mécaniques
  bell(B, 0.12, B.rr(2500, 2700), 0.8, { d: 0.55 });
  B.thump(0.15, { f0: 120, f1: 70, dec: 0.04, a: 0.6 });
  B.fric(0.15, 0.25, { rate: 200, jit: 0.7, res: [[900, 3, 1], [2000, 4, 0.6]], a: 0.2 }); // le tiroir jaillit
  for (let i = 0; i < 10; i++) coin(B, 0.16 + B.rr(0, 0.25), B.rr(0.05, 0.15));
  B.modal(0.4, [[260, 1, 0.08], [610, 0.7, 0.06], [1150, 0.5, 0.04], [2100, 0.3, 0.03]], { ct: 0.0006, a: 0.6 }); B.thump(0.4, { f0: 130, f1: 80, dec: 0.03, a: 0.5 });
} });
def('register_close', { d: 0.8, v: 2, sr: 'H', g: 0.75, r(B) {
  B.fric(0, 0.2, { rate: 180, jit: 0.7, res: [[900, 3, 1], [2000, 4, 0.6]], a: 0.2 });
  const t = 0.22; B.thump(t, { f0: 130, f1: 75, dec: 0.04, a: 0.8 });
  B.modal(t, [[260, 1, 0.08], [610, 0.7, 0.06], [1150, 0.5, 0.04], [2100, 0.3, 0.03]], { ct: 0.0006, a: 0.7 });
  tick(B, t + 0.01, 2100, 0.5);
  for (let i = 0; i < 8; i++) coin(B, t + B.rr(0, 0.1), B.rr(0.04, 0.12));
} });
def('cash_register_ding', { d: 1.6, v: 2, sr: 'H', g: 0.7, r(B) { tick(B, 0, 1500, 0.4); B.nz(0, 0.05, { dec: 0.01, lp: 2500, a: 0.3 }); bell(B, 0.07, B.rr(2450, 2650), 1, { d: 0.6 }); } });
def('coins', { d: 1.0, v: 4, sr: 'H', g: 0.55, r(B) {
  const n = B.ri(12, 20); for (let i = 0; i < n; i++) coin(B, Math.pow(B.r(), 1.6) * 0.45, B.rr(0.15, 0.6));
  for (let i = 0; i < 4; i++) coin(B, B.rr(0.4, 0.7), B.rr(0.05, 0.15));
} });
def('cash_rustle', { d: 0.8, v: 3, g: 0.45, r(B) {
  for (let i = 0, t = 0; i < B.ri(3, 5); i++, t += B.rr(0.08, 0.16)) B.nz(t, B.rr(0.06, 0.14), { att: 0.01, dec: 0.04, bp: B.rr(2500, 5500), q: 0.7, a: B.rr(0.3, 0.6) });
  for (let i = 0; i < 25; i++) B.nz(B.rr(0, 0.6), 0.002, { dec: 0.0006, hp: 3000, lp: 12000, a: B.rr(0.05, 0.2), tail: 0.004 });
  B.nz(B.rr(0.3, 0.5), 0.01, { dec: 0.002, hp: 1500, a: 0.6 }); // claquement du billet tendu
} });
def('lock_pick_click', { d: 0.05, v: 4, sr: 'H', g: 0.4, r(B) { B.nz(0, 0.0015, { dec: 0.0004, hp: 3000, a: 0.9 }); B.modal(0, [[B.rr(5500, 7500), 1, 0.006], [B.rr(8500, 10000), 0.5, 0.004]], { ct: 0.0001, a: 0.3 }); } });
def('lock_pick_set', { d: 0.08, v: 3, sr: 'H', g: 0.5, r(B) {
  B.nz(0, 0.002, { dec: 0.0005, hp: 2500, a: 1 }); B.modal(0, [[B.rr(4000, 4500), 1, 0.012], [B.rr(6500, 7100), 0.6, 0.008]], { ct: 0.0001, a: 0.45 });
  B.nz(0.012, 0.003, { dec: 0.001, hp: 1200, lp: 5000, a: 0.45 }); B.thump(0.012, { f0: 900, f1: 600, dec: 0.005, a: 0.2 }); // le barillet tourne d'un cheveu
} });
def('lock_pick_fail', { d: 0.4, v: 3, sr: 'H', g: 0.5, r(B) {
  for (let i = 0, t = 0; i < B.ri(4, 6); i++, t += B.rr(0.015, 0.03)) tick(B, t, B.rr(4000, 7000), 0.3, 0.006); // goupilles qui retombent
  B.modal(0.12, [[B.rr(2600, 3000), 1, 0.05], [B.rr(5600, 6200), 0.5, 0.03]], { ct: 0.0001, a: 0.3 }); // la clé de tension glisse
  B.nz(0.15, 0.006, { dec: 0.002, hp: 1000, lp: 5000, a: 0.4 }); B.thump(0.15, { f0: 700, f1: 400, dec: 0.008, a: 0.2 });
} });
def('lock_open', { d: 0.5, v: 3, sr: 'H', g: 0.7, r(B) {
  B.nz(0, 0.004, { dec: 0.001, hp: 1500, a: 0.8 });
  B.modal(0, [[B.rr(1100, 1300), 1, 0.04], [B.rr(2200, 2500), 0.7, 0.03], [B.rr(3500, 3900), 0.5, 0.02], [B.rr(5400, 5900), 0.3, 0.015]], { ct: 0.0002, a: 0.8 });
  B.thump(0, { f0: 260, f1: 150, dec: 0.02, a: 0.4 });
  B.modal(0.03, [[B.rr(750, 850), 1, 0.05], [B.rr(1800, 2000), 0.6, 0.04]], { ct: 0.0003, a: 0.5 }); // l'anse saute
  B.nz(0.05, 0.08, { dec: 0.02, hp: 2000, lp: 8000, a: 0.1 });
} });
def('padlock_close', { d: 0.4, v: 3, sr: 'H', g: 0.65, r(B) {
  B.nz(0, 0.05, { att: 0.01, dec: 0.02, bp: 3000, q: 2, a: 0.15 });
  const t = 0.06; B.nz(t, 0.003, { dec: 0.0008, hp: 2000, a: 1 });
  B.modal(t, [[B.rr(2300, 2600), 1, 0.03], [B.rr(3800, 4200), 0.6, 0.02], [B.rr(5900, 6400), 0.4, 0.015]], { ct: 0.0001, a: 0.6 });
  B.thump(t, { f0: 400, f1: 250, dec: 0.01, a: 0.25 });
  for (let i = 0; i < 3; i++) tick(B, t + 0.02 + B.rr(0, 0.08), B.rr(3000, 5000), 0.1, 0.008);
} });
def('keys', { d: 0.9, v: 4, sr: 'H', g: 0.5, r(B) { // trousseau secoué
  for (let s = 0; s < 3; s++) {
    const t0 = s * B.rr(0.18, 0.26);
    for (let i = 0; i < B.ri(6, 10); i++) { const f = B.rr(2500, 6000), d = B.rr(0.05, 0.2); B.modal(t0 + B.rr(0, 0.08), [[f, 1, d], [f * 2.76, 0.4, d * 0.6], [f * 5.4, 0.2, d * 0.3]], { ct: 0.0001, a: B.rr(0.1, 0.35) * (1 - s * 0.2) }); }
    B.nz(t0, 0.08, { dec: 0.02, hp: 3000, a: 0.05 });
  }
} });
def('coin_insert', { d: 0.8, v: 3, sr: 'H', g: 0.55, r(B) {
  B.nz(0, 0.06, { att: 0.005, dec: 0.02, bp: 4000, q: 2, a: 0.2 }); // la pièce glisse dans la fente
  const f = B.rr(4200, 5200);
  for (let i = 0, t = 0.07, dt = 0.07, n = B.ri(5, 8); i < n; i++, t += dt, dt *= 0.8) { coin(B, t, 0.5 * (1 - i * 0.08), f * B.rr(0.98, 1.02)); B.modal(t, [[900, 0.5, 0.05], [1500, 0.4, 0.04]], { a: 0.2 }); }
  B.thump(0.5, { f0: 220, f1: 130, dec: 0.02, a: 0.4 }); B.modal(0.5, [[600, 1, 0.04], [1300, 0.6, 0.03]], { ct: 0.0005, a: 0.4 }); // le monnayeur accepte
} });
def('coin_drop', { d: 1.5, v: 3, sr: 'H', g: 0.55, r(B) {
  const f = B.rr(4000, 6000); let t = 0, dt = B.rr(0.1, 0.14), a = 1;
  for (let i = 0; i < 5; i++) { coin(B, t, a, f * B.rr(0.99, 1.01)); t += dt; dt *= 0.62; a *= 0.6; }
  for (let p = 0.04; t < 1.35 && p > 0.003; p *= 0.9) { B.nz(t, 0.002, { dec: 0.0005, hp: 2500, a: 0.12, tail: 0.004 }); coin(B, t, 0.04, f); t += p; } // elle tournoie puis se couche
} });

// ── nourriture ──
function crunch(B, t, a, n, hp = 800) {
  for (let i = 0; i < n; i++) B.nz(t + Math.pow(B.r(), 1.5) * 0.11, 0.003, { dec: 0.0008, hp: B.rr(hp, hp * 5), lp: 9000, a: B.rr(0.2, 1) * a, tail: 0.004 });
  B.thump(t, { f0: 95, f1: 60, dec: 0.04, a: 0.5 * a }); B.nz(t, 0.08, { dec: 0.03, lp: 500, a: 0.3 * a }); // conduction osseuse
}
def('eat_crunch', { d: 1.0, v: 4, g: 0.6, r(B) { crunch(B, 0.01, 1, 26); crunch(B, B.rr(0.33, 0.4), 0.6, 16); crunch(B, B.rr(0.62, 0.7), 0.45, 12); } });
def('eat_chips', { d: 1.1, v: 3, g: 0.6, r(B) {
  crunch(B, 0.01, 1, 40, 2000); crunch(B, B.rr(0.3, 0.36), 0.7, 25, 1800); crunch(B, B.rr(0.58, 0.65), 0.5, 18, 1500);
  for (let i = 0; i < 20; i++) B.nz(B.rr(0, 1), 0.003, { dec: 0.001, hp: 3000, lp: 11000, a: B.rr(0.03, 0.1), tail: 0.004 }); // le paquet crisse
} });
def('eat_soft', { d: 1.0, v: 4, g: 0.55, r(B) {
  for (let i = 0, t = 0.01; i < 3; i++, t += B.rr(0.22, 0.3)) {
    B.nz(t, 0.14, { att: 0.02, dec: 0.05, lp: 900, hp: 120, a: 0.5, am: [B.rr(20, 40), 0.6] });
    for (let j = 0; j < 3; j++) B.nz(t + B.rr(0, 0.1), 0.01, { dec: 0.003, bp: B.rr(1200, 2000), q: 3, a: 0.15 }); // bruits mouillés
  }
  B.osc(0.82, 0.12, { f: 180, f1: 110, dec: 0.05, a: 0.25 }); B.nz(0.82, 0.08, { dec: 0.03, bp: 400, q: 1.5, a: 0.2 }); // déglutition
} });
def('drink', { d: 1.3, v: 3, g: 0.55, r(B) {
  for (let i = 0, t = 0.1, n = B.ri(2, 3); i < n; i++, t += B.rr(0.32, 0.42)) {
    B.nz(t - 0.08, 0.15, { att: 0.03, dec: 0.06, bp: 1200, q: 1, a: 0.12 });
    B.osc(t, 0.09, { f: B.rr(250, 350), f1: B.rr(150, 200), att: 0.005, dec: 0.03, a: 0.5 }); // gorgée
    B.nz(t, 0.06, { dec: 0.02, bp: 600, q: 2, a: 0.3 });
  }
  B.voice(1.0, 0.28, { f0: () => 0, F: VW.a, asp: () => 1, att: 0.03, dec: 0.12, a: 0.1 }); // « ahh »
} });
def('drink_can_open', { d: 1.0, v: 3, sr: 'H', g: 0.6, r(B) {
  B.nz(0, 0.003, { dec: 0.0008, hp: 2000, a: 1 }); B.modal(0, [[B.rr(2600, 3000), 1, 0.02], [B.rr(4300, 4700), 0.6, 0.015]], { ct: 0.0001, a: 0.4 });
  B.nz(0.004, 0.5, { att: 0.002, dec: 0.12, hp: 3500, lp: 14000, a: 0.7 }); // le gaz s'échappe
  for (let i = 0; i < 40; i++) B.nz(B.rr(0.1, 0.9), 0.001, { dec: 0.0003, hp: 4000, a: B.rr(0.02, 0.08), tail: 0.003 }); // pétillement
} });
def('bottle_open', { d: 0.7, v: 3, sr: 'H', g: 0.55, r(B) {
  for (let i = 0, t = 0; i < 4; i++, t += B.rr(0.015, 0.03)) B.nz(t, 0.003, { dec: 0.0008, hp: 1500, lp: 9000, a: B.rr(0.3, 0.6) }); // la bague cède
  B.nz(0.08, 0.3, { att: 0.003, dec: 0.08, hp: 2500, lp: 12000, a: 0.5 });
  B.nz(0.3, 0.06, { dec: 0.015, bp: 2500, q: 1, a: 0.15 });
} });
def('burp', { d: 0.8, v: 3, sr: 'L', g: 0.6, r(B) {
  const d = B.rr(0.4, 0.6), b = B.rr(80, 100), w = B.rnd(14, -1, 1);
  B.voice(0.02, d, { f0: (x) => b * (1 + 0.2 * Math.sin(Math.PI * x / d)) * (1 + 0.08 * w(x)), F: ftrack([[0, 'O'], [d * 0.5, 'o'], [d, 'u']], 0.95), oq: 0.75, jit: 0.08, shim: 0.3, br: 0.08, att: 0.03, dec: d * 0.7, rel: 0.08, a: 1 });
} });

// ── jouets ──
def('squeak', { d: 0.55, v: 3, g: 0.55, r(B) { // jouet couineur : on presse, puis l'air revient
  const f = B.rr(1000, 1300);
  B.osc(0, 0.18, { w: 'tab', harm: [1, 0.5, 0.35, 0.2, 0.1], f, f1: f * 1.45, att: 0.02, dec: 0.15, jit: 0.03, vib: [30, 0.02], a: 0.5 });
  B.nz(0, 0.18, { att: 0.02, dec: 0.1, bp: 2500, q: 1.5, a: 0.08 });
  B.osc(0.24, 0.22, { w: 'tab', harm: [1, 0.45, 0.3, 0.15], f: f * 1.35, f1: f * 0.85, att: 0.015, dec: 0.12, jit: 0.03, a: 0.35 });
  B.nz(0.24, 0.2, { att: 0.02, dec: 0.1, bp: 2200, q: 1.5, a: 0.06 });
} });
def('toy_robot', { cap: 2, d: 4, loop: true, o0: 1, g: 0.6, r(B) {
  for (let t = 0; t < 4; t += 0.5) {
    B.osc(t, 0.3, { w: 'saw', f: 260, f1: 300, lp: 2500, att: 0.02, rel: 0.05, a: 0.16 }); // moteur
    B.fric(t, 0.3, { rate: 55, jit: 0.2, res: [[2500, 4, 1], [4000, 5, 0.5]], att: 0.02, rel: 0.03, a: 0.12 }); // engrenages
    B.nz(t + 0.32, 0.01, { dec: 0.003, hp: 800, lp: 6000, a: 0.4 }); B.thump(t + 0.32, { f0: 300, f1: 200, dec: 0.012, a: 0.25 }); // pied en plastique
  }
  chip(B, 1.55, [[81, 1], [76, 1], [84, 2]], { beat: 0.07, a: 0.22 }); // « bip-boup »
  B.osc(2.45, 0.25, { w: 'sqr', duty: 0.3, f: 1800, f1: 300, gt: 0.25, att: 0.002, dec: 0.12, a: 0.2 }); // « piou »
  chip(B, 3.25, [[88, 1], [84, 1], [79, 1]], { beat: 0.06, a: 0.2 });
} });
def('doll_laugh', { d: 1.6, v: 3, sr: 'L', g: 0.6, rev: 1.2, r(B) { // puce vocale d'une poupée : « hi-hi-hi-ha… »
  const n = 5, f = B.rr(480, 560), S = B.sub(1.6);
  for (let i = 0; i < n; i++) {
    const t = 0.03 + i * 0.16, last = i === n - 1, d = last ? 0.35 : 0.11;
    S.voice(t, d, { f0: (x) => f * (1 - i * 0.05) * (last ? 1 - 0.35 * x / d : 1 + 0.06 * Math.sin(x * 40)), F: ftrack([[0, 'h'], [0.02, last ? 'a' : 'i']], 1.4), asp: (x) => (x < 0.02 ? 0.9 : 0.12), oq: 0.5, att: 0.01, dec: d * 0.6, rel: 0.03, a: 1 });
  }
  S.spk(500, 3800, 1500, 6, 1.5); S.crush(6, 2); B.add(S.d, 0);
} });
def('doll_voice', { d: 1.4, v: 2, sr: 'L', g: 0.65, rev: 1.2, r(B) { // « ma-man » d'une puce vocale fatiguée
  const S = B.sub(1.4), b = B.rr(360, 420), slow = (x) => 1 - 0.3 * clamp((x - 0.6) / 0.55, 0, 1); // les piles faiblissent
  const F = ftrack([[0, 'm'], [0.1, 'm'], [0.16, 'a'], [0.32, 'a'], [0.38, 'm'], [0.46, 'm'], [0.54, 'A'], [1.1, 'A']], 1.35);
  S.voice(0.05, 1.15, {
    f0: (x) => b * (x < 0.4 ? 1.05 : 0.92 - 0.1 * (x - 0.4)) * slow(x),
    F: (x) => { const v = F(x), k = slow(x); return [v[0] * k, v[1] * k, v[2] * k, v[3] * k]; },
    oq: 0.55, jit: 0.015, att: 0.04, rel: 0.15, ef: (x) => (x < 0.12 || (x > 0.36 && x < 0.5) ? 0.45 : 1), bw: [120, 140, 200, 260], a: 1,
  });
  S.spk(450, 3600, 1600, 6, 1.4); S.crush(6, 2); B.add(S.d, 0);
} });
def('jack_in_box', { d: 2.2, v: 2, g: 0.8, rev: 1.1, r(B) { // derniers tours de manivelle… puis le diable jaillit
  let t = 0; for (const [m, d] of [[0, 2], [0, 1], [2, 2], [2, 1], [4, 3]]) { tine(B, t, 84 + m, 0.5); B.nz(t, 0.004, { dec: 0.001, hp: 2000, a: 0.08 }); t += d * 0.14; }
  const p = t + 0.25;
  B.thump(p, { f0: 160, f1: 80, dec: 0.04, a: 0.8 }); B.nz(p, 0.02, { dec: 0.005, hp: 600, lp: 6000, a: 0.7 }); // couvercle
  B.osc(p, 0.6, { f: 190, vib: [13, 0.22], dec: 0.2, a: 0.5 }); B.osc(p, 0.5, { f: 520, vib: [13, 0.15], dec: 0.12, a: 0.15 }); // ressort « boing »
  B.voice(p + 0.12, 0.35, { f0: (x) => 600 - 300 * x, F: ftrack([[0, 'h'], [0.03, 'i']], 1.4), asp: (x) => (x < 0.03 ? 0.9 : 0.1), att: 0.01, dec: 0.2, a: 0.3 });
} });
def('jack_music', { d: 48 * 0.15, loop: true, o0: 1, sr: 'L', g: 0.6, r(B) { // « Pop Goes the Weasel » à la manivelle
  let t = 0; const N = []; for (const [m, d] of WEASEL) { N.push([t, 84 + m, 0.6]); t += d * 0.15; } tines(B, N);
  for (let k = 0; k < 48; k++) B.nz(k * 0.15, 0.004, { dec: 0.001, hp: 1800, lp: 7000, a: 0.06 }); // cliquet
} });
def('ball_bounce', { d: 0.25, v: 4, g: 0.6, r(B) {
  B.thump(0.002, { f0: B.rr(300, 420), f1: B.rr(200, 280), k: 0.01, dec: 0.03, a: 0.8 });
  const f = B.rr(250, 350); B.modal(0.002, [[f, 1, 0.06], [f * 2.6, 0.4, 0.03]], { ct: 0.001, a: 0.5 });
  B.nz(0.002, 0.008, { dec: 0.002, bp: 2000, q: 0.7, a: 0.4 });
} });
def('rattle', { d: 0.9, v: 3, g: 0.5, r(B) { // hochet : perles dans une coque en plastique
  for (const t0 of [0, B.rr(0.25, 0.32), B.rr(0.52, 0.6)]) for (let i = 0, n = B.ri(15, 25); i < n; i++) B.nz(t0 + Math.pow(B.r(), 1.3) * 0.12, 0.002, { dec: 0.0006, hp: 1500, lp: 8000, a: B.rr(0.1, 0.5), tail: 0.004 });
  B.pk(1800, 4, 6).pk(3200, 5, 5);
} });
def('spinning_top', { cap: 2, d: 2, loop: true, g: 0.5, r(B) { // toupie ronflante
  B.osc(0, 2, { w: 'tab', harm: [1, 0.4, 0.25, 0.12], f: 330, am: [B.per(9), 0.5], a: 0.4 });
  B.fric(0, 2, { rate: 45, jit: 0.3, res: [[1500, 3, 1]], att: 0, rel: 0, a: 0.06 }); // la pointe sur le sol
  B.nz(0, 2, { bp: 900, q: 1.2, a: 0.2, am: [B.per(9), 0.6, 1] });
} });
def('bubbles', { d: 1.8, v: 3, g: 0.45, r(B) {
  B.nz(0, 0.5, { att: 0.1, dec: 0.2, bp: 1500, q: 0.6, a: 0.1 }); // souffle
  for (let i = 0, n = B.ri(8, 14); i < n; i++) { const t = B.rr(0.1, 1.6), f = B.rr(500, 1500); B.osc(t, B.rr(0.02, 0.06), { f, f1: f * B.rr(1.3, 2), att: 0.002, dec: 0.015, a: B.rr(0.2, 0.5) }); if (B.ch(0.5)) B.nz(t + 0.03, 0.002, { dec: 0.0005, hp: 3000, a: 0.1, tail: 0.004 }); }
} });
def('yoyo', { d: 1.3, v: 2, g: 0.5, r(B) {
  B.osc(0, 0.5, { w: 'tab', harm: [1, 0.3, 0.2], fe: (x) => 60 + 160 * x, am: [30, 0.5], att: 0.05, rel: 0.05, a: 0.25 }); B.nz(0, 0.5, { att: 0.05, bp: 2500, q: 2, a: 0.08 });
  B.nz(0.55, 0.004, { dec: 0.001, hp: 800, lp: 6000, a: 0.6 }); B.thump(0.55, { f0: 500, f1: 300, dec: 0.01, a: 0.3 }); // il remonte d'un coup
  B.osc(0.57, 0.45, { w: 'tab', harm: [1, 0.3, 0.2], fe: (x) => 140 - 100 * x, am: [26, 0.5], att: 0.02, rel: 0.05, a: 0.2 });
  B.nz(1.05, 0.004, { dec: 0.001, hp: 800, lp: 5000, a: 0.5 }); B.thump(1.05, { f0: 300, f1: 200, dec: 0.015, a: 0.3 }); // dans la main
} });
def('rubik', { d: 1.0, v: 3, g: 0.5, r(B) {
  for (let i = 0, t = 0, n = B.ri(3, 4); i < n; i++, t += B.rr(0.18, 0.3)) {
    B.nz(t, 0.08, { att: 0.01, dec: 0.03, bp: 2000, q: 2, a: 0.2 });
    B.nz(t + 0.07, 0.004, { dec: 0.001, hp: 1500, a: 0.7 }); B.modal(t + 0.07, [[B.rr(1800, 2400), 1, 0.015], [B.rr(3500, 4200), 0.5, 0.01]], { a: 0.3 });
  }
} });
def('xylo_hit', { d: 1.2, v: 6, jit: 0, g: 0.55, r(B) { xylo(B, 0.002, [72, 74, 76, 79, 81, 84][B.v % 6]); } });
def('toy_drum', { d: 0.5, v: 3, g: 0.6, r(B) {
  const f = B.rr(220, 280); B.modal(0.002, [1, 1.59, 2.14, 2.3, 2.65, 2.92].map((r, i) => [f * r, 1 / (1 + i * 0.5), 0.12 / (1 + i * 0.4)]), { ct: 0.0008, a: 0.8 }); // membrane circulaire
  B.nz(0.002, 0.008, { dec: 0.002, hp: 1500, a: 0.5 }); B.nz(0.004, 0.15, { dec: 0.04, bp: 3500, q: 1, a: 0.15 });
} });
def('toy_gun', { d: 0.6, v: 3, g: 0.6, r(B) { // pistolet laser des années 80
  B.nz(0, 0.004, { dec: 0.001, hp: 1500, lp: 6000, a: 0.5 }); // gâchette
  const f = B.rr(1800, 2600), k = B.rr(0.06, 0.1);
  B.osc(0.01, 0.38, { w: 'sqr', duty: 0.3, fe: (x) => f * Math.exp(-x / k) + 250, vib: [30, 0.1], att: 0.002, dec: 0.16, a: 0.5 });
  B.spk(400, 5000, 2000, 5, 1.2); B.crush(7, 1);
} });
def('toy_horn', { d: 0.8, v: 3, g: 0.6, r(B) { // trompe à poire « pouet »
  const f = B.rr(380, 460), n = B.v === 2 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const t = i * 0.3;
    B.osc(t, 0.25, { w: 'saw', f, f1: f * 0.88, att: 0.02, dec: 0.2, a: 0.6, pk: [[1200, 2, 8], [2400, 3, 6]], lp: 4500 });
    B.nz(t, 0.25, { att: 0.02, dec: 0.15, bp: 2500, q: 1, a: 0.05 });
  }
} });
def('music_box_wrong', { d: 9.5, g: 0.6, rev: 1.3, r(B) { // la comptine se dérègle : désaccord, ralentissement, une note manque
  let t = 0.05, bt = 0.55, det = 1;
  for (let i = 0; i < 24 && t < 8; i++) {
    const [m, d] = CLAIR[i]; det *= Math.pow(2, -B.rr(2, 9) / 1200);
    if (i !== 6) tine(B, t, 84 + m, 0.7 * (1 - i / 40), { det: det * Math.pow(2, B.rr(-25, 15) / 1200), dm: 1 - i / 40 });
    else B.nz(t, 0.003, { dec: 0.001, hp: 2000, a: 0.08 }); // le picot cassé
    t += d * bt; bt *= 1.07;
  }
  B.thump(t + 0.1, { f0: 300, f1: 200, dec: 0.01, a: 0.15 }); B.nz(t + 0.1, 0.005, { dec: 0.0015, hp: 1500, a: 0.15 }); // le mécanisme se bloque
  B.nz(0, 8, { att: 0.5, rel: 1, bp: 1200, q: 2, a: 0.012 });
} });

// ── téléphone ──
// sonnerie électromécanique : marteau à ~25 Hz alternant entre deux timbres (banc de résonateurs)
function ringer(B, t0, dur, rate, fa, fb, a = 1, d = 0.6) {
  const xa = new Float32Array(B.n), xb = new Float32Array(B.n);
  for (let t = t0, k = 0; t < t0 + dur; t += 1 / rate, k++) { const tj = t + B.rr(-0.0025, 0.0025), i = ((Math.round(tj * B.sr) % B.n) + B.n) % B.n; (k & 1 ? xb : xa)[i] += B.rr(0.8, 1); B.nz(tj, 0.003, { dec: 0.0008, hp: 2500, a: 0.05 * a, tail: 0.004 }); } // le marteau n'est jamais parfaitement régulier
  const md = (f) => { const out = []; [1, 2.32, 4.25, 6.63].forEach((r, i) => { const dd = d * Math.pow(0.6, i), am = [1, 0.55, 0.35, 0.2][i]; out.push([f * r, am, dd], [f * r * 1.002, am * 0.4, dd * 0.9]); }); return out; };
  B.res(xa, md(fa), a); B.res(xb, md(fb), a);
}
def('phone_ring', { d: 5, loop: true, o0: 1, sr: 'L', g: 0.85, ref: 3, os: 2.2, r(B) { ringer(B, 0, 1.5, 25, 1150, 1340, 1); } }); // cadence 1,5 s / 3,5 s
def('dial_tone', { d: 1, loop: true, sr: 'L', g: 0.5, r(B) { B.osc(0, 1, { w: 'tab', harm: [1, 0.02, 0.015], f: 440, a: 0.8 }); B.osc(0, 1, { f: 50, a: 0.01 }); } }); // 440 Hz continu
def('busy_tone', { d: 1, loop: true, o0: 1, sr: 'L', g: 0.5, r(B) { B.osc(0, 0.5, { w: 'tab', harm: [1, 0.02, 0.015], f: 440, att: 0.004, rel: 0.004, a: 0.8 }); } }); // 0,5 / 0,5
def('ringback', { d: 5, loop: true, o0: 1, sr: 'L', g: 0.5, r(B) { B.osc(0, 1.5, { w: 'tab', harm: [1, 0.02, 0.015], f: 440, att: 0.004, rel: 0.004, a: 0.8 }); } }); // 1,5 / 3,5
def('phone_pickup', { d: 0.5, v: 2, g: 0.6, r(B) {
  B.nz(0, 0.01, { dec: 0.003, hp: 400, lp: 4000, a: 0.6 }); B.thump(0, { f0: 220, f1: 140, dec: 0.02, a: 0.4 }); // le combiné quitte le socle
  B.nz(0.03, 0.006, { dec: 0.002, hp: 600, lp: 5000, a: 0.35 });
  tick(B, 0.06, B.rr(2600, 3200), 0.5, 0.01); // crochet commutateur
  B.thump(0.1, { f0: 90, f1: 40, dec: 0.02, a: 0.25 }); // la ligne s'ouvre
  bell(B, 0.06, 1150, 0.03, { d: 0.3 }); // le timbre frémit
  B.nz(0.11, 0.35, { att: 0.05, hp: 300, lp: 3400, a: 0.02 });
} });
def('phone_hangup', { d: 0.7, v: 2, g: 0.7, r(B) {
  B.nz(0, 0.012, { dec: 0.003, hp: 300, lp: 3500, a: 0.8 }); B.thump(0, { f0: 180, f1: 100, dec: 0.03, a: 0.6 }); B.modal(0, [[420, 1, 0.03], [900, 0.6, 0.02]], { ct: 0.001, a: 0.3 });
  tick(B, 0.012, B.rr(2400, 2900), 0.5, 0.01);
  bell(B, 0.015, 1150, 0.12, { d: 0.4 }); bell(B, 0.02, 1340, 0.08, { d: 0.4 }); // « ting » du timbre
  B.nz(0.03, 0.006, { dec: 0.002, hp: 500, lp: 4000, a: 0.3 });
} });
def('mobile_ring', { d: 3.2, loop: true, o0: 1, g: 0.6, r(B) { // sonnerie monophonique rétro (mélodie originale)
  chip(B, 0, [[81, 1], [84, 1], [88, 1], [84, 1], [77, 1], [81, 1], [84, 1], [81, 1], [84, 1], [88, 1], [91, 1], [88, 1], [79, 1], [83, 1], [86, 1], [83, 1], [81, 3]], { beat: 0.105, a: 0.4, leg: 0.8 });
  B.spk(500, 4500, 2500, 6, 1.3);
} });
def('vibrate', { d: 1.2, v: 2, g: 0.6, r(B) {
  for (const t of [0, 0.6]) {
    B.osc(t, 0.4, { w: 'saw', f: B.rr(165, 180), jit: 0.02, att: 0.03, rel: 0.04, lp: 1800, a: 0.45 });
    B.fric(t, 0.4, { rate: 170, jit: 0.1, res: [[900, 4, 1], [2200, 5, 0.5]], att: 0.03, rel: 0.04, a: 0.25 }); // ça claque contre la table
  }
} });

// ── alarmes ──
def('alarm_siren', { d: 4, loop: true, o0: 1, g: 0.9, ref: 6, md: 120, r(B) { // sirène électronique montante/descendante
  B.osc(0, 4, { w: 'sqr', fe: (x) => { const u = (x % 2) / 2; return u < 0.6 ? 600 + 700 * (u / 0.6) : 1300 - 700 * ((u - 0.6) / 0.4); }, a: 0.5 });
  B.lp(4500).pk(1400, 0.8, 5).drive(1.6);
} });
def('car_alarm', { cap: 1, d: 12, loop: true, o0: 1, sr: 'L', g: 0.85, ref: 6, md: 140, r(B) { // alarme auto années 90 : six motifs enchaînés
  const seg = (x) => { const m = Math.min(5, Math.floor(x / 2)); return [m, x - m * 2]; };
  const fe = (x) => {
    const [m, u] = seg(x);
    if (m === 0) return 700 + 1100 * ((u % 0.2) / 0.2);                                  // « wouip-wouip »
    if (m === 1) return (Math.floor(u * 8) & 1) ? 1600 : 1200;                            // trille
    if (m === 2) return 600 + 1000 * (0.5 - 0.5 * Math.cos(TAU * u)); // sirène lente
    if (m === 3) return 1450;                                                            // mitraillette (hachée)
    if (m === 4) return (Math.floor(u / 0.35) & 1) ? 700 : 1000;                          // « hi-han »
    return 2000 - 1200 * ((u % 0.13) / 0.13);                                            // « piou » descendant
  };
  B.osc(0, 12, { w: 'sqr', fe, ef: (x) => { const [m, u] = seg(x); return m === 3 ? ((u * 32) % 1 < 0.5 ? 1 : 0.03) : 1; }, a: 0.5 });
  B.hp(500).pk(2200, 1, 6).lp(6000).drive(2);
} });
def('smoke_alarm', { d: 4, loop: true, o0: 1, sr: 'H', g: 0.75, ref: 4, r(B) { // motif T3 normalisé : trois bips de 0,5 s, pause
  for (const t of [0, 1, 2]) B.osc(t, 0.5, { w: 'tab', harm: [1, 0.08, 0.25, 0.03, 0.08], f: 3150, vib: [11, 0.004], att: 0.004, rel: 0.006, a: 0.6 });
  B.pk(3150, 2, 4);
} });
def('shop_alarm', { cap: 2, d: 2, loop: true, o0: 1, g: 0.95, ref: 8, md: 120, r(B) { // grosse cloche d'alarme + sirène « yelp »
  const x = new Float32Array(B.n); for (let k = 0; k < 44; k++) x[((Math.round((k / 22 + B.rr(-0.003, 0.003)) * B.sr) % B.n) + B.n) % B.n] += B.rr(0.85, 1);
  B.res(x, [[620, 1, 1.1], [622, 0.4, 1], [1440, 0.6, 0.7], [2635, 0.4, 0.45], [4110, 0.25, 0.3], [5820, 0.15, 0.2]], 1);
  B.osc(0, 2, { w: 'sqr', fe: (t) => 900 + 800 * ((t * 3) % 1), a: 0.08, lp: 5000 });
  B.drive(1.3);
} });
def('fire_bell', { d: 2, loop: true, g: 0.9, ref: 6, md: 120, r(B) { // sonnerie incendie électrique
  const x = new Float32Array(B.n); for (let k = 0; k < 48; k++) { const i = Math.round((k / 24 + B.rr(-0.002, 0.002)) * B.sr); x[((i % B.n) + B.n) % B.n] += B.rr(0.8, 1); }
  const f = 1050; B.res(x, [[f, 1, 0.9], [f * 1.0015, 0.4, 0.85], [f * 2.32, 0.6, 0.55], [f * 4.25, 0.4, 0.35], [f * 6.63, 0.25, 0.22], [f * 9.38, 0.15, 0.14]], 1);
  for (let k = 0; k < 48; k++) B.nz(k / 24, 0.004, { dec: 0.001, hp: 2000, lp: 8000, a: 0.05, tail: 0.004 }); // le marteau
} });
// deux-tons français (« pin-pon ») : avertisseur pneumatique cuivré, petite attaque glissée sur chaque note
function deuxTons(B, f1, f2, half, a = 0.5) {
  const fe = (t) => { const u = t % (2 * half), hi = u >= half, v = hi ? u - half : u, base = hi ? f2 : f1, prev = hi ? f1 : f2; return base + (prev - base) * Math.exp(-v / 0.018) * 0.6; };
  B.osc(0, B.dur, { w: 'saw', fe, vib: [B.per(5.5), 0.004], a });
}
def('police_siren', { d: 4.4, loop: true, sr: 'L', g: 0.9, ref: 6, md: 160, r(B) { deuxTons(B, 435, 580, 0.55); B.pk(1100, 1.5, 7).pk(2400, 2, 5).lp(5000).drive(1.4); } });
def('fire_truck', { d: 5.6, loop: true, sr: 'L', g: 0.95, ref: 6, md: 160, r(B) {
  deuxTons(B, 435, 580, 0.7, 0.45); B.pk(1000, 1.5, 7).pk(2300, 2, 5).lp(5000).drive(1.3);
  B.osc(0, B.dur, { w: 'tab', f: 28, harm: [1, 0.8, 0.6, 0.5, 0.35, 0.25, 0.15, 0.1], a: 0.25 }); // diesel du camion
  B.nz(0, B.dur, { c: 'p', lp: 700, a: 0.25, am: [B.per(28), 0.6] });
} });

// ── feu ──
def('fire_crackle', { graph: (...a) => gFire(...a), param: { size: 0.5 }, g: 0.9, os: 2.5 });
def('_fire_roar', { d: 4, loop: true, sr: 'L', r(B) { // grondement turbulent de la combustion
  B.nz(0, 4, { c: 'b', lp: 500, a: 1, ef: B.rnd(6, 0.5, 1) }); B.nz(0, 4, { c: 'p', bp: 300, q: 0.7, a: 0.4, ef: B.rnd(15, 0.3, 1) });
  B.nz(0, 4, { lp: 2000, hp: 600, a: 0.1, ef: B.rnd(8, 0.3, 1) });
} });
def('_fire_crk', { d: 4, loop: true, r(B) { // craquements du bois (amas de micro-ruptures)
  for (let i = 0; i < 90; i++) { const t = B.rr(0, 4), n = B.ch(0.3) ? B.ri(3, 9) : 1; for (let j = 0, tt = t; j < n; j++, tt += B.rr(0.002, 0.012)) B.nz(tt, 0.002, { dec: B.rr(0.0003, 0.001), hp: B.rr(800, 4000), lp: 9000, a: B.rr(0.2, 1), tail: 0.004 }); }
  B.nz(0, 4, { bp: 5000, q: 0.8, a: 0.06, ef: B.rnd(10, 0.3, 1) });
} });
def('_fire_pop', { d: 0.2, v: 4, r(B) { B.nz(0, 0.004, { dec: 0.001, hp: 600, a: 1 }); B.nz(0.002, 0.05, { dec: 0.012, bp: B.rr(1000, 2500), q: 1, a: 0.5 }); B.thump(0, { f0: 300, f1: 150, dec: 0.01, a: 0.3 }); } });
def('fire_whoosh', { d: 1.5, v: 3, g: 0.85, rev: 1.2, r(B) { // embrasement soudain
  B.nz(0, 1.3, { att: 0.12, dec: 0.35, c: 'p', lp: (x) => 250 + 3000 * Math.exp(-Math.pow((x - 0.15) / 0.25, 2)), hp: 50, a: 1 });
  B.thump(0.06, { f0: 70, f1: 38, dec: 0.3, a: 0.6 });
  for (let i = 0; i < 25; i++) B.nz(B.rr(0.1, 1.2), 0.003, { dec: 0.0008, hp: 1500, lp: 8000, a: B.rr(0.05, 0.25), tail: 0.004 });
} });
def('extinguisher', { d: 3, loop: true, g: 0.85, start: '_ext_start', r(B) {
  B.nz(0, 3, { hp: 350, lp: 11000, a: 0.9, ef: B.rnd(9, 0.75, 1) }); B.nz(0, 3, { bp: 2600, q: 0.8, a: 0.35, ef: B.rnd(13, 0.6, 1) }); B.nz(0, 3, { c: 'b', lp: 180, a: 0.4 });
} });
def('_ext_start', { d: 0.4, g: 0.8, r(B) { B.nz(0, 0.006, { dec: 0.002, hp: 800, a: 1 }); tick(B, 0, 1800, 0.6); B.nz(0.004, 0.35, { att: 0.002, dec: 0.12, hp: 600, a: 0.9 }); } });
def('sprinkler', { d: 3, loop: true, g: 0.75, r(B) {
  B.nz(0, 3, { hp: 900, lp: 9000, a: 0.55, ef: B.rnd(6, 0.8, 1) });
  for (let i = 0; i < 900; i++) B.nz(B.rr(0, 3), 0.002, { dec: 0.0006, hp: B.rr(1500, 4000), lp: 9000, a: B.rr(0.05, 0.3), tail: 0.004 }); // gouttes au sol
  B.nz(0, 3, { bp: 5000, q: 1.5, a: 0.15 });
} });
def('smoke_hiss', { d: 1.8, v: 2, g: 0.6, r(B) {
  B.nz(0, 1.6, { att: 0.1, dec: 0.5, hp: 2500, lp: 12000, a: 0.8, am: [B.rr(5, 9), 0.3] });
  for (let i = 0; i < 6; i++) B.nz(B.rr(0.1, 1.2), 0.003, { dec: 0.001, hp: 2000, a: 0.15, tail: 0.004 });
} });

// ── machines du bâtiment ──
def('generator', { graph: (...a) => gGenerator(...a), param: { rpm: 0.8 }, g: 1, ref: 3, os: 3 });
function pullCord(B) { // tirage du lanceur : la corde file, le cliquet crépite
  B.nz(0.02, 0.45, { att: 0.02, dec: 0.25, bp: (x) => Math.max(400, 2200 - 2600 * x), q: 1.3, a: 0.45 });
  for (let t = 0.03, r = 35; t < 0.45; t += 1 / r, r *= 0.93) B.nz(t, 0.003, { dec: 0.0008, hp: 1800, a: 0.25, tail: 0.004 });
}
def('generator_start', { d: 3.2, sr: 'L', g: 0.95, rev: 1.2, ref: 3, r(B) {
  pullCord(B);
  firing(B, 0.55, 0.15, () => 7, { miss: () => 0.2, f0: 100 }); // toux
  firing(B, 0.85, 2.3, (x) => 9 + 16 * Math.min(1, x / 1.1), { miss: (x) => (x < 0.6 ? 0.35 : 0.02), amp: (x) => Math.min(1, 0.6 + x) * (x > 1.6 ? Math.max(0, 1 - (x - 1.6) / 0.7) : 1) }); // il accroche
  B.nz(0.85, 2.3, { att: 0.4, dec: 1.2, bp: 2600, q: 0.8, a: 0.05 });
} });
def('generator_fail', { d: 2.6, sr: 'L', g: 0.9, rev: 1.2, ref: 3, r(B) {
  pullCord(B);
  firing(B, 0.55, 1.4, (x) => Math.max(2, 8 - 5 * x), { miss: (x) => 0.25 + x * 0.3, amp: (x) => Math.max(0, 1 - x / 1.4) });
  B.nz(2.0, 0.3, { dec: 0.1, lp: 500, a: 0.3 }); B.modal(2.1, [[300, 1, 0.08], [720, 0.6, 0.05]], { ct: 0.001, a: 0.3 });
} });
def('generator_stop', { d: 2.2, sr: 'L', g: 0.9, rev: 1.2, ref: 3, r(B) {
  firing(B, 0, 1.6, (x) => 25 * Math.max(0.12, 1 - x / 1.3), { amp: (x) => Math.max(0, 1 - x / 1.7), miss: (x) => x * 0.25 });
  B.thump(1.55, { f0: 70, f1: 40, dec: 0.12, a: 0.5 }); B.modal(1.6, [[220, 1, 0.15], [530, 0.6, 0.1], [980, 0.4, 0.06]], { ct: 0.001, a: 0.4 }); // dernier soubresaut
} });
def('electric_hum', { cap: 2, d: 2, loop: true, sr: 'L', g: 0.55, r(B) { // secteur 50 Hz : magnétostriction (100 Hz) et harmoniques
  B.osc(0, 2, { w: 'tab', f: 50, harm: [0.55, 1, 0.3, 0.42, 0.12, 0.2, 0.05, 0.09, 0.03, 0.05], a: 0.6, ef: (x) => 1 + 0.12 * Math.sin(TAU * 0.5 * x) });
  B.osc(0, 2, { f: 100.5, a: 0.06 }); // battement lent entre deux transformateurs
  B.nz(0, 2, { c: 'p', lp: 800, a: 0.04 });
} });
def('fluorescent_buzz', { d: 4, loop: true, g: 0.45, r(B) { // ballast 100 Hz riche en harmoniques, claquements du starter
  const H = []; for (let k = 1; k <= 40; k++) H.push((k % 2 ? 0.8 : 1) / Math.pow(k, 0.85));
  B.osc(0, 4, { w: 'tab', f: 100, harm: H, a: 0.35, ef: B.rnd(3, 0.85, 1) });
  B.osc(0, 4, { w: 'tab', f: 100, harm: [0, 1, 0, 0.4], a: 0.2 });
  for (let i = 0, n = B.ri(3, 6); i < n; i++) B.nz(B.rr(0, 4), 0.003, { dec: 0.0008, hp: 2000, a: B.rr(0.15, 0.4), tail: 0.004 });
  B.nz(0, 4, { hp: 3000, a: 0.02 });
} });
def('neon_flicker', { d: 1.8, v: 3, g: 0.6, r(B) { // « tic-tic-bzzz » d'un tube qui peine à s'allumer
  const H = [0.6, 1, 0.5, 0.6, 0.35, 0.4, 0.25, 0.3, 0.18, 0.2, 0.12, 0.12];
  for (let t = 0.01; t < 1.5;) {
    const on = B.rr(0.03, 0.18);
    B.nz(t, 0.003, { dec: 0.0008, hp: 1800, a: B.rr(0.4, 0.9), tail: 0.004 }); // l'arc s'amorce
    B.osc(t, on, { w: 'tab', f: 100, harm: H, att: 0.003, rel: 0.008, a: B.rr(0.25, 0.5), jit: 0.01 });
    if (B.ch(0.5)) B.nz(t, on, { att: 0.002, rel: 0.01, hp: 2500, a: 0.05 });
    t += on + B.rr(0.02, 0.2);
  }
} });
def('hvac', { d: 6, loop: true, ch: 2, sr: 'L', g: 0.7, rms: 0.25, r(B) { // soufflage, grondement de gaine, passage des pales
  B.nz(0, 6, { c: 'p', lp: 1400, hp: 40, a: 1, ef: B.rnd(1.5, 0.85, 1) }); B.nz(0, 6, { c: 'b', lp: 90, a: 0.7 });
  B.osc(0, 6, { w: 'tab', f: 118, harm: [1, 0.5, 0.25], a: 0.04 });
  B.pk(240, 3, 4).pk(520, 4, 3);
} });
def('escalator', { cap: 2, d: 4, loop: true, g: 0.7, ref: 4, r(B) {
  for (let k = 0; k < 5; k++) { // marches qui passent le peigne
    const t = k * 0.8 + B.rr(-0.01, 0.01);
    B.modal(t, [[B.rr(180, 220), 1, 0.08], [B.rr(450, 520), 0.6, 0.06], [B.rr(900, 1100), 0.4, 0.04], [2200, 0.2, 0.02]], { ct: 0.001, a: 0.5 });
    B.thump(t, { f0: 90, f1: 60, dec: 0.04, a: 0.4 });
  }
  B.fric(0, 4, { rate: 42, jit: 0.3, res: [[1100, 3, 1], [2400, 4, 0.5]], att: 0, rel: 0, a: 0.06 }); // chaîne
  B.osc(0, 4, { w: 'tab', f: 50, harm: [0.4, 1, 0.3, 0.2], a: 0.12 }); B.osc(0, 4, { f: 310, a: 0.025 }); // moteur, réducteur
  B.nz(0, 4, { c: 'p', lp: 300, a: 0.3 });
  B.fric(B.rr(0.5, 3), 0.3, { rate: 600, jit: 0.1, res: [[1800, 12, 1]], att: 0.1, rel: 0.1, a: 0.03 }); // main courante
} });
// gouttes / bulles : résonance de Minnaert (sinus bref dont la hauteur monte)
function drops(B, n, t0, t1, lo = 500, hi = 3000, a = 0.3) {
  for (let i = 0; i < n; i++) { const t = B.rr(t0, t1), f = B.rr(lo, hi); B.osc(t, B.rr(0.015, 0.05), { f, f1: f * B.rr(1.3, 1.9), att: 0.001, dec: B.rr(0.006, 0.02), a: B.rr(0.2, 1) * a }); }
}
def('fountain', { d: 8, loop: true, sr: 'L', g: 0.6, ref: 2, md: 26, cap: 1, r(B) { // filet d'eau qui retombe dans le bassin : doux, rond, presque pas de souffle aigu
  B.nz(0, B.dur, { c: 'p', hp: 120, lp: 2000, lq: 0.6, a: 0.5, ef: B.rnd(3, 0.75, 1) });  // nappe d'eau, feutrée
  B.nz(0, B.dur, { bp: 420, q: 0.8, a: 0.4, ef: B.rnd(6, 0.35, 1) });                  // clapotis grave du bassin
  drops(B, 90, 0, B.dur, 330, 1300, 0.22);                                              // gouttes rondes, graves
  for (let i = 0; i < 60; i++) B.nz(B.rr(0, B.dur), 0.004, { dec: 0.0015, bp: B.rr(700, 2000), q: 1.2, a: B.rr(0.03, 0.09), tail: 0.004 }); // éclaboussures légères
  B.lp(3000);
} });
def('elevator_ding', { d: 2.5, g: 0.6, rev: 1.2, r(B) { const f = 1318.5; B.modal(0.002, [[f, 1, 1.3], [f * 1.001, 0.4, 1.2], [f * 2.76, 0.3, 0.5], [f * 5.4, 0.12, 0.2], [f * 0.5, 0.1, 0.8]], { ct: 0.0004, a: 1 }); } });
def('water_drip', { d: 0.25, v: 5, g: 0.5, rev: 1.4, r(B) {
  const f = B.rr(900, 1500); B.nz(0, 0.003, { dec: 0.0008, hp: 2000, a: 0.3 });
  B.osc(0.001, 0.06, { f, f1: f * B.rr(1.6, 2.3), gt: 0.05, att: 0.001, dec: B.rr(0.012, 0.025), a: 0.7 });
  if (B.ch(0.4)) { const g = B.rr(1800, 2600); B.osc(0.07, 0.03, { f: g, f1: g * 1.5, att: 0.001, dec: 0.008, a: 0.2 }); } // rebond
} });
def('pipe_knock', { d: 1.4, v: 4, sr: 'L', g: 0.75, rev: 1.3, r(B) { // coup de bélier
  const n = B.ri(1, 3), f = B.rr(180, 240);
  for (let i = 0; i < n; i++) { const t = i * B.rr(0.12, 0.2); B.thump(t, { f0: 160, f1: 110, dec: 0.05, a: 0.6 }); B.modal(t, [[f, 1, 0.25], [f * 2.4, 0.7, 0.2], [f * 4.6, 0.4, 0.12], [f * 7.4, 0.25, 0.08]], { ct: 0.002, a: 0.6 }); }
  B.nz(0, 0.6, { att: 0.02, dec: 0.2, c: 'b', lp: 200, a: 0.3 });
} });

// ── extérieur, météo ──
def('wind', { graph: (...a) => gWind(...a), param: { strength: 0.5, deep: 0 }, g: 1.8, os: 3 });
def('rain', { graph: (...a) => gRain(...a), param: { intensity: 0.5 }, g: 0.9, os: 3 });
def('_rain_wash', { d: 4, loop: true, ch: 2, r(B) { B.nz(0, 4, { c: 'p', hp: 300, lp: 7500, a: 1, ef: B.rnd(4, 0.85, 1) }); B.nz(0, 4, { c: 'b', lp: 250, a: 0.3 }); } });
def('_rain_drops', { d: 4, loop: true, ch: 2, r(B) {
  for (let i = 0; i < 1400; i++) B.nz(B.rr(0, 4), 0.0015, { dec: B.rr(0.0002, 0.0008), hp: B.rr(1500, 5000), lp: 11000, a: B.rr(0.05, 0.4), tail: 0.003 });
  drops(B, 60, 0, 4, 1500, 4500, 0.15); // gouttes dans les flaques
  for (let i = 0; i < 90; i++) B.nz(B.rr(0, 4), 0.008, { dec: 0.002, bp: B.rr(300, 900), q: 1.5, a: B.rr(0.05, 0.2) }); // sur les toits, les carrosseries
} });
def('thunder', { d: 8, v: 3, sr: 'V', g: 1, rev: 0.6, r(B) { // tonnerre lointain qui roule
  const t0 = B.rr(0, 0.3);
  B.nz(t0, 0.3, { dec: 0.08, lp: 2500, hp: 150, a: 0.5 });
  let t = t0 + B.rr(0.05, 0.25);
  for (let k = 0, n = B.ri(5, 8); k < n; k++) { const d = B.rr(0.9, 2.4); B.nz(t, d, { att: B.rr(0.04, 0.3), dec: B.rr(0.35, 0.9), c: 'b', lp: B.rr(250, 700), a: B.rr(0.5, 1) * (1 - k * 0.08), ef: B.rnd(12, 0.4, 1), tail: 0.05 }); t += B.rr(0.25, 1.1); }
  B.nz(0, 7.5, { att: 0.4, dec: 2.2, c: 'b', lp: 90, a: 0.7, tail: 0.1 });
} });
def('distant_traffic', { d: 8, loop: true, ch: 2, sr: 'V', g: 0.7, r(B) { // rumeur de circulation lointaine : sourde, grave
  B.nz(0, 8, { c: 'b', lp: 300, a: 0.7, ef: B.rnd(0.6, 0.6, 1) });
  for (let i = 0; i < 3; i++) { // voitures qui passent au loin (pneus étouffés par la distance : petite bosse vers 600 Hz)
    const t = B.rr(0, 8), d = B.rr(3, 5);
    B.nz(t, d, { c: 'p', env: [[0, 0], [d * 0.5, 1], [d, 0]], lp: 800, hp: 90, pk: [[600, 0.8, 3]], a: B.rr(0.2, 0.4) });
  }
} });
function bark(B, t, a = 1, k = 1) {
  const d = B.rr(0.12, 0.18), f = B.rr(450, 600) * k;
  B.voice(t, d, { f0: (x) => f * (1.1 - 0.65 * x / d), F: ftrack([[0, 'a'], [d, 'O']], 1.05 / k), oq: 0.45, jit: 0.05, shim: 0.3, asp: () => 0.25, att: 0.004, dec: d * 0.5, rel: 0.03, a });
  B.nz(t, 0.05, { dec: 0.015, bp: 1100, q: 0.8, a: 0.4 * a });
}
def('dog_bark_far', { d: 2.6, v: 3, sr: 'L', g: 0.75, rev: 0.5, r(B) {
  const k = B.rr(0.85, 1.15); let t = 0.05; for (let i = 0, n = B.ri(2, 4); i < n; i++) { bark(B, t, B.rr(0.7, 1), k); t += B.rr(0.25, 0.5); }
  B.lp(2200); B.verb(0.4, 1.1, 0.5, 0.06); // écho sur les façades
} });
def('dog_whine', { d: 1.6, v: 2, sr: 'L', g: 0.55, r(B) {
  const d = B.rr(1, 1.3), f = B.rr(700, 900);
  B.voice(0.03, d, { f0: (x) => f * (1 + 0.35 * Math.sin(Math.PI * x / d) - 0.15 * x) * (1 + 0.03 * Math.sin(x * 37)), F: ftrack([[0, 'u'], [d * 0.5, 'i'], [d, 'u']], 1.5), oq: 0.4, br: 0.12, asp: () => 0.2, att: 0.08, rel: 0.2, a: 1 });
} });
def('owl', { d: 3.2, v: 2, sr: 'L', g: 0.55, rev: 0.6, r(B) { // chouette hulotte : « hou… hou-hou-houuu »
  const f = B.rr(380, 440), hoot = (t, d, k = 1, trem = 0) => {
    B.osc(t, d, { w: 'tab', harm: [1, 0.15, 0.05], f: f * k, f1: f * k * 0.94, att: 0.04, rel: 0.12, am: trem ? [trem, 0.6] : null, a: 0.6 });
    B.nz(t, d, { att: 0.04, rel: 0.1, bp: f * k, q: 4, a: 0.12 });
  };
  hoot(0.05, 0.4); hoot(1.0, 0.12, 1.02); hoot(1.25, 0.12, 1.02); hoot(1.5, 0.9, 1, 16);
  B.lp(1800); B.verb(0.35, 1.4, 0.5, 0.04);
} });
def('city_night', { d: 16, loop: true, ch: 2, sr: 'V', g: 0.6, r(B) { // rumeur de la ville la nuit (les sirènes lointaines : amb_far, rares)
  B.nz(0, B.dur, { lp: 260, lq: 0.6, hp: 24, a: 1, ef: B.rnd(0.35, 0.6, 1) });
  for (let i = 0; i < 4; i++) { const t = B.rr(0, B.dur), d = B.rr(3, 5); B.nz(t, d, { env: [[0, 0], [d / 2, 1], [d, 0]], lp: 800, hp: 110, a: B.rr(0.15, 0.3), tail: 0.05 }); } // voitures au loin
  B.nz(0, B.dur, { bp: 300, q: 0.6, a: 0.09, ef: B.rnd(0.6, 0.2, 1) }); // vent, au loin
} });

// ── nuit : fond sonore du bâtiment (« pesant », jamais musical, jamais de sursaut) ──
// Ton de salle (graphe room_tone : grondement, souffle, houles rares), couches propres aux lieux (boucles longues de
// bruit blanc filtré : jonctions invisibles), bruits lointains ponctuels joués positionnés par js/game/ambience.js
// (distance de référence élevée : audibles à 10-40 m, assourdis par les murs, noyés dans la réverbération du lieu).
def('room_tone', { graph: (...a) => gRoomTone(...a), param: { dark: 1, tension: 0.3, air: 1 }, g: 0.3, os: 6 });
def('_rt_low', { d: 17, loop: true, sr: 'V', r(B) { // grondement ressenti plus qu'entendu (25-120 Hz), qui pulse lentement
  B.nz(0, B.dur, { lp: 75, lq: 0.6, hp: 24, a: 1, ef: B.rnd(0.12, 0.55, 1) });
  B.nz(0, B.dur, { bp: 31, q: 3, a: 2.2, ef: B.rnd(0.09, 0.15, 1) });    // houle infra-grave (pression)
  B.nz(0, B.dur, { bp: 57, q: 5, a: 1.1, ef: B.rnd(0.15, 0.3, 1) });     // grosse centrale de traitement d'air, très loin
  B.nz(0, B.dur, { bp: 170, q: 0.8, a: 0.12, ef: B.rnd(0.3, 0.35, 1) }); // bas-médium : présence du bâtiment
  B.lp(210).lp(260); // rien au-dessus : aucun souffle ne fuit des flancs des passe-bande
} });
def('_rt_air', { d: 11, loop: true, ch: 2, sr: 'L', r(B) { // souffle des bouches d'air, sifflement ténu des diffuseurs
  B.nz(0, B.dur, { hp: 150, lp: 1700, lq: 0.5, pk: [[380, 1.2, 3]], a: 1, ef: B.rnd(0.25, 0.75, 1) });
  B.nz(0, B.dur, { hp: 2500, lp: 6500, a: 0.07, ef: B.rnd(0.4, 0.55, 1) }); // à peine : un souffle doux, pas un sifflement
} });
def('_rt_swell', { d: 10, v: 3, sr: 'V', r(B) { // houle lente : le bâtiment « respire »
  const D = B.rr(6.5, 9), lo = B.v === 2;
  B.nz(0.05, D, { env: [[0, 0], [D * B.rr(0.4, 0.55), 1], [D, 0]], lp: lo ? 85 : 300, hp: lo ? 22 : 45, a: 1, ef: B.rnd(0.7, 0.6, 1), tail: 0.3 });
  if (!lo) B.nz(0.05, D, { env: [[0, 0], [D * 0.5, 1], [D, 0]], bp: B.rr(150, 240), q: 1.3, a: 0.35, tail: 0.2 });
  B.lp(lo ? 140 : 520).lp(lo ? 180 : 650);
} });
def('hall_air', { d: 16, loop: true, ch: 2, sr: 'L', g: 0.5, r(B) { // galeries, atrium : immense volume vide, l'air qui circule, très large
  B.nz(0, B.dur, { hp: 110, lp: 1300, lq: 0.5, a: 1, ef: B.rnd(0.16, 0.35, 1) }); // masse d'air
  for (let i = 0; i < 3; i++) { const t = B.rr(0, B.dur), D = B.rr(4.5, 8); B.nz(t, D, { env: [[0, 0], [D * 0.5, 1], [D, 0]], bp: (x) => 200 + 420 * Math.sin(Math.PI * Math.min(1, x / D)), q: 0.9, a: 0.55, tail: 0.1 }); } // courants d'air
  B.nz(0, B.dur, { hp: 3500, lp: 9000, a: 0.07, ef: B.rnd(0.3, 0.5, 1) });        // brillance du hall vitré
  B.nz(0, B.dur, { lp: 80, hp: 24, a: 0.6, ef: B.rnd(0.1, 0.5, 1) });              // mode grave du volume
} });
def('glass_roof', { graph: (...a) => gGlassRoof(...a), param: { rain: 0, wind: 0.3, muffle: 0 }, g: 0.5, os: 6 });
def('_glass_rain', { d: 5, loop: true, ch: 2, sr: 'M', r(B) { // pluie sur la verrière, entendue d'une dizaine de mètres plus bas
  B.nz(0, B.dur, { hp: 450, lp: 5500, a: 0.45, ef: B.rnd(3, 0.8, 1) });           // ruissellement
  for (let i = 0; i < 1100; i++) {
    const t = B.rr(0, B.dur); B.nz(t, 0.0012, { dec: B.rr(0.0002, 0.0006), hp: B.rr(1400, 3200), lp: 8500, a: B.rr(0.04, 0.3), tail: 0.003 });
    if (B.ch(0.16)) { const f = B.rr(1800, 5000); B.modal(t, [[f, 1, B.rr(0.004, 0.012)], [f * 2.32, 0.4, 0.004]], { ct: 0.0001, a: B.rr(0.02, 0.07) }); } // la goutte fait tinter le verre
  }
  for (let i = 0; i < 160; i++) B.nz(B.rr(0, B.dur), 0.006, { dec: 0.0018, bp: B.rr(220, 650), q: 1.4, a: B.rr(0.04, 0.15) }); // le vitrage tambourine
  B.lp(6500);
} });
def('_glass_gust', { d: 13, loop: true, ch: 2, sr: 'L', r(B) { // rafales sur la toiture vitrée : poussées sourdes, un joint qui siffle
  const gust = B.rnd(0.35, 0, 1);
  B.nz(0, B.dur, { lp: 360, hp: 35, a: 1, ef: (x) => 0.25 + 0.75 * gust(x) * gust(x) });
  B.nz(0, B.dur, { bp: 650, q: 0.7, a: 0.25, ef: (x) => gust(x) * gust(x) * gust(x) });
  B.nz(0, B.dur, { bp: B.rr(950, 1350), q: 14, a: 0.5, ef: (x) => Math.max(0, gust(x) - 0.62) * 2.6 });
} });
def('service_hum', { d: 13, loop: true, ch: 2, sr: 'V', g: 0.5, r(B) { // couloirs de service, réserves : machinerie lointaine, eau dans les colonnes
  B.nz(0, B.dur, { lp: 140, hp: 28, a: 1, ef: B.rnd(0.15, 0.6, 1) });             // machinerie au loin
  B.nz(0, B.dur, { bp: 100, q: 9, a: 1.6, ef: B.rnd(0.2, 0.5, 1) }); B.nz(0, B.dur, { bp: 50, q: 7, a: 0.9 }); // ronflement secteur instable (bande étroite, pas un son pur)
  B.nz(0, B.dur, { bp: 520, q: 0.9, a: 0.2, ef: B.rnd(5, 0.55, 1) });             // filet d'eau dans une colonne
  B.nz(0, B.dur, { hp: 1500, lp: 5000, a: 0.03 });
} });
def('boiler_room', { d: 9, loop: true, ch: 2, sr: 'L', g: 0.55, r(B) { // chaufferie : flamme du brûleur, circulateur, roulement
  B.nz(0, B.dur, { lp: 320, hp: 45, a: 1, ef: B.rnd(7, 0.75, 1) });               // turbulence de la flamme
  B.nz(0, B.dur, { bp: 140, q: 2, a: 0.5, ef: B.rnd(11, 0.6, 1) });               // vrombissement
  B.osc(0, B.dur, { w: 'tab', f: 47, harm: [0.4, 1, 0.5, 0.3, 0.15], a: 0.055, ef: B.rnd(0.5, 0.75, 1) }); // moteur du circulateur
  B.nz(0, B.dur, { bp: 1250, q: 6, a: 0.05 });                                     // roulement
  B.nz(0, B.dur, { hp: 2000, lp: 8000, a: 0.03, ef: B.rnd(2, 0.5, 1) });           // souffle du brûleur
} });
def('garage_air', { d: 15, loop: true, ch: 2, sr: 'V', g: 0.55, r(B) { // parking souterrain : le béton résonne, le vent s'engouffre par la rampe
  B.nz(0, B.dur, { lp: 160, hp: 22, pk: [[38, 6, 7], [61, 7, 6], [89, 7, 5], [127, 8, 4]], a: 1, ef: B.rnd(0.12, 0.6, 1) }); // modes du volume de béton
  const gust = B.rnd(0.22, 0, 1);
  B.nz(0, B.dur, { bp: 480, q: 0.6, a: 0.45, ef: (x) => 0.15 + 0.85 * gust(x) * gust(x) });
  B.nz(0, B.dur, { hp: 1800, lp: 5500, a: 0.04, ef: (x) => 0.3 + 0.7 * gust(x) });
} });
def('vent_air', { d: 7, loop: true, ch: 2, sr: 'L', g: 0.5, r(B) { // dans la gaine : souffle tout proche, la tôle résonne
  const fl = B.rnd(0.6, 0.6, 1);
  B.nz(0, B.dur, { lp: 2200, hp: 60, pk: [[150, 6, 5], [290, 10, 9], [575, 12, 7], [870, 12, 5], [1160, 14, 4]], a: 1, ef: fl });
  B.nz(0, B.dur, { bp: 3200, q: 2, a: 0.05, ef: fl });
} });
def('equipment_hum', { d: 6, loop: true, ch: 2, sr: 'L', g: 0.45, r(B) { // poste de sécurité : ventilateurs de l'enregistreur et des moniteurs, transformateur (calme, stable, feutré)
  B.nz(0, B.dur, { hp: 120, lp: 1200, lq: 0.5, a: 1, ef: B.rnd(0.5, 0.92, 1) });
  B.osc(0, B.dur, { w: 'tab', f: 100, harm: [1, 0.35, 0.5, 0.12, 0.15], a: 0.025 });
  B.nz(0, B.dur, { bp: 50, q: 4, a: 0.5 });
  B.nz(0, B.dur, { hp: 4000, lp: 8000, a: 0.008 });
} });
// bruits lointains (ponctuels, positionnés) : variantes nombreuses, filtrés comme entendus de loin ou à travers les dalles
def('amb_creak', { d: 3.4, v: 6, pk: [0.9, 0.9, 0.6, 0.6, 0.4, 0.4], sr: 'L', g: 0.7, rev: 1.6, ref: 6, md: 90, r(B) { // le bâtiment travaille : charpente qui se tasse, cloison, poutre qui se dilate
  const k = B.v;
  if (k < 2) creak(B, 0.1, B.rr(1.4, 2.6), { r0: B.rr(4, 8), r1: B.rr(10, 18), wr: 2.5, wd: 0.45, blip: 40, res: [[B.rr(70, 95), 7, 1], [B.rr(140, 170), 8, 0.7], [B.rr(230, 280), 9, 0.5], [B.rr(400, 460), 10, 0.3]], att: 0.3, a: 1 });
  else if (k < 4) creak(B, 0.05, B.rr(0.5, 1), { r0: B.rr(14, 24), r1: B.rr(35, 60), res: [[B.rr(300, 380), 9, 1], [B.rr(520, 620), 11, 0.6], [B.rr(900, 1100), 12, 0.35]], a: 0.8 });
  else {
    const f = B.rr(85, 150), t = 0.05;
    B.modal(t, [[f, 1, 0.3], [f * 2.31, 0.6, 0.2], [f * 3.9, 0.4, 0.12], [f * 5.6, 0.25, 0.08]], { ct: 0.002, a: 0.9 });
    B.nz(t, 0.008, { dec: 0.002, hp: 700, lp: 4000, a: 0.35 }); B.thump(t, { f0: 90, f1: 50, dec: 0.05, a: 0.4 });
    if (B.ch(0.6)) creak(B, t + B.rr(0.15, 0.4), B.rr(0.3, 0.6), { r0: 10, r1: 25, res: [[B.rr(180, 240), 8, 1], [B.rr(380, 450), 10, 0.5]], a: 0.25 });
  }
  B.lp(k < 2 ? 1400 : 2600);
} });
def('amb_tick', { d: 2.2, v: 6, pk: [0.9, 0.9, 0.9, 0.72, 0.72, 0.54], sr: 'L', g: 0.5, rev: 1.3, ref: 5, md: 70, r(B) { // gaines et tuyaux qui se rétractent dans la fraîcheur de la nuit
  const k = B.v, hollow = k === 3 || k === 4, n = k === 5 ? B.ri(5, 7) : B.ri(1, 3), f0 = B.rr(1300, 3200);
  for (let i = 0, t = 0.02; i < n; i++) {
    const a = B.rr(0.5, 1) * (k === 5 ? 1 - i / (n + 2) : 1);
    tick(B, t, f0 * B.rr(0.92, 1.08), 0.35 * a, B.rr(0.015, 0.04));
    if (hollow) { const f = B.rr(160, 300); B.modal(t, [[f, 1, 0.09], [f * 1.6, 0.6, 0.07], [f * 2.45, 0.4, 0.05]], { ct: 0.002, a: 0.5 * a }); } // la tôle de la gaine résonne
    t += k === 5 ? B.rr(0.06, 0.16) : B.rr(0.18, 0.9);
  }
  B.lp(6500);
} });
def('amb_thud', { d: 2, v: 4, sr: 'L', g: 0.8, rev: 1.8, ref: 8, md: 100, r(B) { // quelque chose de lourd, très loin (à travers les dalles)
  const hit2 = (t, a) => {
    B.thump(t, { f0: B.rr(75, 95), f1: B.rr(36, 45), k: 0.03, dec: B.rr(0.1, 0.18), a, drive: 1.3 }); B.nz(t, 0.25, { dec: 0.06, lp: 300, a: 0.6 * a });
    const f = B.rr(100, 150); B.modal(t, [[f, 1, 0.07], [f * 1.9, 0.5, 0.05]], { ct: 0.004, a: 0.4 * a });
  };
  hit2(0.02, 1); if (B.v >= 2) hit2(0.02 + B.rr(0.15, 0.35), B.rr(0.25, 0.45)); // l'objet se recale
  B.lp(B.v % 2 ? 650 : 900);
} });
def('amb_door', { d: 2.6, v: 4, pk: [0.9, 0.54, 0.9, 0.9], sr: 'L', g: 0.7, rev: 1.9, ref: 8, md: 100, r(B) { // une porte, loin dans le bâtiment
  const k = B.v;
  if (k === 0) { const t = B.rr(0.3, 0.45); B.nz(0, t, { att: t * 0.7, dec: 0.2, lp: 400, a: 0.15 }); doorHit(B, t, 0.8); latch(B, t + 0.004, 0.3); } // porte coupe-feu qui se referme
  else if (k === 1) { B.thump(0.02, { f0: 85, f1: 45, k: 0.025, dec: 0.1, a: 0.8, drive: 1.5 }); const f = B.rr(64, 80); B.modal(0.02, [1, 1.89, 3.11, 4.87, 7.17].map((x, i) => [f * x, 1 / (1 + i * 0.4), 0.35 * Math.pow(0.8, i)]), { ct: 0.002, a: 0.6 }); latch(B, 0.025, 0.3); } // porte métallique
  else if (k === 2) { creak(B, 0.05, B.rr(0.7, 1.1), { r0: 40, r1: 120, res: [[B.rr(900, 1100), 16, 1], [B.rr(1700, 2000), 20, 0.5]], a: 0.25 }); latch(B, 1.25, 0.35); B.thump(1.25, { f0: 140, f1: 90, dec: 0.02, a: 0.3 }); } // porte qui dérive puis se cale
  else { tick(B, 0.02, B.rr(1500, 1900), 0.4); B.thump(0.05, { f0: 120, f1: 70, dec: 0.04, a: 0.6 }); tick(B, 0.06, B.rr(1100, 1400), 0.3); doorHit(B, 0.5, 0.5); latch(B, 0.505, 0.4); } // barre anti-panique
  B.lp(k === 2 ? 2400 : 1700);
} });
def('amb_pipe', { d: 3.4, v: 6, pk: [0.57, 0.45, 0.9, 0.9, 0.9, 0.4], sr: 'L', g: 0.65, rev: 1.5, ref: 6, md: 80, r(B) { // canalisations : coup de bélier, dilatation, gargouillis, chasse d'eau lointaine
  const k = B.v;
  if (k < 2) {
    const f = B.rr(160, 250), bang = (t, a) => { B.thump(t, { f0: 150, f1: 100, dec: 0.04, a: 0.5 * a }); B.modal(t, [[f, 1, 0.45], [f * 2.4, 0.7, 0.3], [f * 4.6, 0.4, 0.18], [f * 7.4, 0.25, 0.1]], { ct: 0.0015, a: 0.6 * a }); };
    bang(0.02, 1); if (k === 1) bang(0.02 + B.rr(0.1, 0.18), 0.5);
    B.nz(0.3, 0.9, { att: 0.05, dec: 0.35, bp: 800, q: 1.2, a: 0.08, am: [B.rr(15, 25), 0.6] }); // l'eau repart
  } else if (k < 4) { // tuyau d'eau chaude qui refroidit : tic… tic… de plus en plus espacés
    const f = B.rr(700, 1400);
    for (let i = 0, n = B.ri(4, 8), t = 0.02, dt = B.rr(0.12, 0.25); i < n; i++, t += dt, dt *= B.rr(1.05, 1.35)) { B.modal(t, [[f * B.rr(0.95, 1.05), 1, 0.02], [f * 2.7, 0.4, 0.012]], { ct: 0.0003, a: B.rr(0.3, 0.6) }); B.nz(t, 0.003, { dec: 0.0008, hp: 1500, a: 0.15 }); }
  } else if (k === 4) { drops(B, B.ri(25, 45), 0.05, 1.4, 150, 600, 0.35); B.nz(0.05, 1.5, { att: 0.2, dec: 0.6, lp: 500, a: 0.15, am: [9, 0.5] }); } // gargouillis
  else { // chasse d'eau lointaine : le réservoir se remplit
    const D = B.rr(2.2, 2.8); B.nz(0.05, D, { env: [[0, 0], [0.3, 1], [D - 0.4, 0.8], [D, 0]], bp: 2200, q: 0.7, a: 0.4, ef: B.rnd(12, 0.7, 1) });
    B.nz(0.05, D, { env: [[0, 0], [0.4, 1], [D, 0]], lp: 300, a: 0.3 }); tick(B, D + 0.1, 1800, 0.2);
  }
  B.lp(k === 5 ? 3000 : 4000);
} });
def('amb_knock', { d: 4.2, v: 4, sr: 'L', g: 0.65, rev: 1.7, ref: 8, md: 100, r(B) { // coups sourds irréguliers, très loin : des pas ? des tuyaux ?
  const n = B.v === 3 ? 3 : B.ri(2, 5), f = B.rr(110, 160);
  for (let i = 0, t = 0.05; i < n; i++) {
    const a = B.rr(0.55, 1);
    B.thump(t, { f0: B.rr(110, 140), f1: 60, dec: B.rr(0.03, 0.05), a: 0.8 * a });
    B.modal(t, [[f * B.rr(0.95, 1.05), 1, 0.045], [f * 1.8, 0.6, 0.035], [f * 2.9, 0.35, 0.025]], { ct: 0.0025, a: 0.5 * a });
    B.nz(t, 0.04, { dec: 0.01, lp: 600, a: 0.3 * a });
    t += B.v === 3 ? B.rr(0.85, 1.1) : B.ch(0.3) ? B.rr(0.25, 0.4) : B.rr(0.5, 0.95);
  }
  B.lp(B.rr(600, 850));
} });
def('amb_glass', { d: 2.2, v: 5, pk: [0.32, 0.28, 0.9, 0.9, 0.9], sr: 'L', g: 1, rev: 1.6, ref: 8, md: 100, r(B) { // verrière : profilés qui travaillent, vitrage qui fléchit
  const k = B.v;
  if (k < 2) { creak(B, 0.03, B.rr(0.25, 0.5), { r0: 60, r1: 160, res: [[B.rr(900, 1200), 18, 1], [B.rr(1600, 2000), 20, 0.5], [B.rr(2600, 3100), 22, 0.3]], a: 0.5 }); const f = B.rr(1800, 3000); B.modal(0.05, [[f, 1, 0.18], [f * 2.32, 0.4, 0.1]], { ct: 0.0002, a: 0.08 }); }
  else if (k < 4) {
    const f = B.rr(190, 380), g = B.rr(2200, 3400);
    B.modal(0.02, [[f, 1, 0.09], [f * 1.59, 0.7, 0.07], [f * 2.14, 0.5, 0.05], [f * 3, 0.3, 0.04]], { ct: 0.001, a: 0.7 }); // panneau qui fléchit
    B.modal(0.021, [[g, 1, 0.35], [g * 2.32, 0.3, 0.15]], { ct: 0.0002, a: 0.06 }); B.nz(0.02, 0.006, { dec: 0.0015, hp: 900, lp: 6000, a: 0.25 });
  } else for (let i = 0, n = B.ri(2, 3), t = 0.02; i < n; i++, t += B.rr(0.25, 0.7)) tick(B, t, B.rr(2400, 3600), 0.25, 0.02);
  B.lp(6500);
} });
def('amb_vent', { d: 1.8, v: 4, pk: [0.57, 0.9, 0.5, 0.9], sr: 'L', g: 0.5, rev: 1.2, ref: 3, md: 40, r(B) { // dans la gaine : tôle qui claque, cliquetis, poussée d'air, vis qui vibre
  const k = B.v;
  if (k === 0) { const f = B.rr(110, 150); B.modal(0.02, [[f, 1, 0.22], [f * 1.55, 0.8, 0.18], [f * 2.35, 0.6, 0.14], [f * 3.7, 0.4, 0.1], [f * 5.8, 0.25, 0.07]], { ct: 0.003, a: 0.8 }); tick(B, 0.02, B.rr(1500, 2200), 0.2, 0.02); }
  else if (k === 1) for (let i = 0, n = B.ri(2, 3), t = 0.02; i < n; i++, t += B.rr(0.2, 0.6)) { tick(B, t, B.rr(1800, 3000), 0.3, 0.03); duct(B, t, 0.15); }
  else if (k === 2) B.nz(0.02, 1.4, { env: [[0, 0], [0.6, 1], [1.4, 0]], lp: 1300, hp: 80, pk: [[290, 8, 8], [580, 10, 6]], a: 0.8 });
  else for (let i = 0, n = B.ri(3, 6), t = 0.02; i < n; i++, t += B.rr(0.03, 0.07)) { B.nz(t, 0.003, { dec: 0.0008, hp: 2000, lp: 7000, a: 0.3 }); B.modal(t, [[B.rr(2500, 3500), 1, 0.01]], { ct: 0.0002, a: 0.15 }); }
} });
def('amb_far', { d: 6, v: 5, pk: [0.71, 0.9, 0.54, 0.67, 0.48], sr: 'V', g: 0.6, rev: 0.6, ref: 12, md: 160, r(B) { // la ville au loin : voiture, camion, klaxon, scooter, sirène
  const k = B.v, D = B.rr(3.5, 5);
  if (k === 0) B.nz(0.05, D, { env: [[0, 0], [D * 0.55, 1], [D, 0]], lp: (x) => 700 + 700 * Math.sin(Math.PI * Math.min(1, x / D)), hp: 90, pk: [[1300, 0.8, 4]], a: 0.6, tail: 0.05 });
  else if (k === 1) { B.nz(0.05, D, { env: [[0, 0], [D * 0.5, 1], [D, 0]], lp: 320, a: 0.6, tail: 0.05 }); B.osc(0.05, D, { w: 'tab', fe: (x) => 34 + 8 * x / D, harm: [1, 0.8, 0.6, 0.45, 0.3, 0.2], env: [[0, 0], [D * 0.5, 1], [D, 0]], a: 0.25 }); }
  else if (k === 2) for (let i = 0, t = 0.3; i < 2; i++, t += B.rr(0.2, 0.3)) { const d = B.rr(0.12, 0.22); B.osc(t, d, { w: 'sqr', f: 410, att: 0.01, rel: 0.03, a: 0.25 }); B.osc(t, d, { w: 'sqr', f: 512, att: 0.01, rel: 0.03, a: 0.25 }); }
  else if (k === 3) B.osc(0.05, D, { w: 'saw', fe: (x) => 95 - 25 * x / D, env: [[0, 0], [D * 0.45, 1], [D, 0]], a: 0.2, lp: 1600 });
  else B.osc(0.05, 5.5, { fe: (x) => 650 + 250 * Math.sin(TAU * x / 1.6), env: [[0, 0], [2, 1], [5.5, 0]], a: 0.3 });
  B.lp(1500); B.verb(0.4, 1.4, 0.5, 0.05); // écho des façades
} });

// ── foule, journée ──
def('crowd', { graph: (...a) => gCrowd(...a), param: { density: 0.5 }, g: 0.9, os: 3 });
def('_babble', { d: 6, loop: true, sr: 'V', r(B) { // brouhaha de galerie : voix d'hommes et de femmes inintelligibles
  for (let v = 0; v < 4; v++) {
    const fem = B.ch(0.5), k = fem ? 1.17 : 1, f0 = fem ? B.rr(185, 235) : B.rr(100, 135), a = B.rr(0.35, 1);
    for (let t = B.rr(0, 1.5); t < 6;) { const d = B.rr(0.8, 2.4); babble(B, t, d, { k, f0, a }); t += d + B.rr(0.3, 1.2); }
  }
  B.lp(3200); B.verb(0.35, 1.3, 0.5);
} });
def('cart_roll', { d: 3, loop: true, g: 0.7, r(B) { // chariot : roulettes, panier grillagé, joints du carrelage
  B.nz(0, 3, { c: 'p', lp: 350, a: 0.4, am: [B.per(4), 0.3] });
  B.fric(0, 3, { rate: 28, jit: 0.4, res: [[700, 2, 1], [1600, 3, 0.6]], att: 0, rel: 0, a: 0.25 });
  B.fric(0, 3, { rate: 13, jit: 0.9, res: [[3200, 6, 1], [4700, 8, 0.6], [2100, 5, 0.5]], blip: 20, att: 0, rel: 0, a: 0.12 });
  for (let k = 0; k < 9; k++) { const t = k / 3; B.thump(t, { f0: 120, f1: 80, dec: 0.02, a: 0.25 }); B.nz(t, 0.01, { dec: 0.003, lp: 2000, a: 0.15 }); }
} });
def('baby_cry', { d: 3.4, v: 2, sr: 'L', g: 0.7, rev: 1.1, r(B) {
  let t = 0.05;
  for (let i = 0; i < 3; i++) {
    const d = B.rr(0.6, 0.9), f = B.rr(420, 520), w = B.rnd(18, -1, 1);
    B.voice(t, d, { f0: (x) => f * (1 + 0.15 * Math.sin(Math.PI * x / d)) * (1 + 0.025 * w(t + x)), F: ftrack([[0, 'E'], [d * 0.3, 'a'], [d, 'a']], 1.45), oq: 0.5, jit: 0.03, shim: 0.2, br: 0.06, att: 0.05, rel: 0.12, a: 1 });
    t += d + 0.06;
    B.voice(t, 0.18, { f0: () => 0, F: VW.i.map((x) => x * 1.4), asp: () => 1, att: 0.04, rel: 0.05, a: 0.25 }); // reprise de souffle
    t += 0.24;
  }
} });
function laughs(B, t, f, n, k, a = 1) { // « ha-ha-ha » : bouffées voisées, attaques aspirées
  for (let i = 0; i < n; i++) {
    const tt = t + i * B.rr(0.15, 0.2), d = B.rr(0.09, 0.13), ff = f * (1 - i * 0.05);
    B.voice(tt, d, { f0: (x) => ff * (1 - 0.15 * x / d), F: ftrack([[0, 'h'], [0.025, 'a']], k), asp: (x) => (x < 0.025 ? 0.9 : 0.15), oq: 0.55, att: 0.006, dec: d * 0.5, rel: 0.03, a: a * (1 - i * 0.07) });
  }
}
def('laugh', { d: 1.7, v: 3, sr: 'L', g: 0.6, rev: 1.1, r(B) { const fem = B.v === 1; laughs(B, 0.02, fem ? B.rr(230, 280) : B.rr(140, 180), B.ri(5, 7), fem ? 1.17 : 1); } });
function chime(B, t, f, a = 1) { B.modal(t, [[f, 1, 1.4], [f * 1.002, 0.35, 1.3], [f * 3.98, 0.22, 0.4], [f * 9.1, 0.06, 0.12]], { ct: 0.0008, a }); }
function paChime(B, notes) { // carillon d'annonce diffusé par la sonorisation du centre commercial
  notes.forEach((f, i) => chime(B, 0.02 + i * 0.45, f, 1));
  B.gain((x) => 1 - 0.18 * (0.5 + 0.5 * Math.sin(TAU * 5 * x))); B.spk(250, 6500, 2000, 3); B.verb(0.45, 2.2, 0.4, 0.02);
}
def('pa_chime', { d: 4, g: 0.7, rev: 0, r(B) { paChime(B, [392, 523.25, 659.25]); } });   // « ding-dang-dong » montant
def('pa_chime_end', { d: 4, g: 0.7, rev: 0, r(B) { paChime(B, [659.25, 523.25, 392]); } }); // descendant

// ── horreur ──
def('whisper', { d: 2.4, v: 4, g: 0.6, rev: 1.3, r(B) { // chuchotement inintelligible : souffle filtré par des formants mouvants
  const d = B.rr(1.4, 2.1); babble(B, 0.05, d, { whisper: true, k: 1.15, syl: [0.1, 0.2], a: 1 });
  for (let i = 0, n = B.ri(2, 4); i < n; i++) B.nz(B.rr(0.1, d), B.rr(0.05, 0.1), { att: 0.015, rel: 0.03, hp: B.rr(3500, 5500), lp: 11000, a: B.rr(0.15, 0.3) }); // sifflantes
} });
function breathCycle(B, t, k = 1) {
  B.voice(t, 1.0, { f0: () => 0, F: VW.h, asp: () => 1, env: [[0, 0], [0.35, 0.7], [0.85, 0.5], [1, 0]], bw: [200, 250, 300, 350], a: 0.6 * k }); // inspiration
  B.voice(t + 1.1, 1.1, { f0: () => 0, F: VW['@'], asp: () => 1, env: [[0, 0], [0.15, 1], [0.8, 0.3], [1.1, 0]], bw: [160, 200, 260, 320], a: 0.9 * k }); // expiration
  B.nz(t + 1.1, 1.1, { env: [[0, 0], [0.15, 1], [0.8, 0.3], [1.1, 0]], c: 'p', lp: 500, a: 0.12 * k });
}
def('breath', { d: 4.4, loop: true, sr: 'L', g: 0.6, r(B) { breathCycle(B, 0, 1); breathCycle(B, 2.2, 0.85); } });
def('heartbeat', { graph: (...a) => gHeart(...a), param: { bpm: 72 }, g: 0.9, os: 2.5 });
def('_lub', { d: 0.3, sr: 'V', r(B) { B.thump(0.002, { f0: 70, f1: 42, k: 0.03, dec: 0.06, a: 1, drive: 1.3 }); B.nz(0.002, 0.08, { dec: 0.025, lp: 180, a: 0.5 }); } });
def('_dub', { d: 0.25, sr: 'V', r(B) { B.thump(0.002, { f0: 95, f1: 55, k: 0.02, dec: 0.045, a: 1, drive: 1.2 }); B.nz(0.002, 0.06, { dec: 0.02, lp: 250, a: 0.4 }); } });
def('scream', { duck: 0.35, dkT: 1.5, d: 2.0, v: 3, g: 0.95, rev: 1.4, r(B) {
  const male = B.v === 2, f = male ? B.rr(320, 420) : B.rr(650, 850), D = B.rr(1.3, 1.8), w = B.rnd(9, -1, 1);
  B.voice(0.02, D, {
    f0: (x) => f * (0.7 + 0.3 * Math.min(1, x / 0.18)) * (1 + 0.05 * Math.sin(TAU * 6 * x) + 0.04 * w(x)) * (x > D - 0.4 ? 1 - 0.25 * (x - D + 0.4) / 0.4 : 1),
    F: ftrack([[0, 'E'], [0.25, 'a'], [D, 'a']], male ? 1.05 : 1.2), oq: 0.42, jit: 0.035, shim: 0.25, br: 0.1, asp: () => 0.12, att: 0.04, rel: 0.3, bw: [110, 130, 180, 250], a: 1,
  });
  B.drive(2.2).hp(150);
} });
def('jumpscare', { duck: 0.5, dkT: 2, d: 2.4, v: 2, g: 1, rev: 1.2, r(B) { // accord dissonant brutal + déchirement de bruit + infra
  B.nz(0, 0.7, { att: 0.002, dec: 0.2, hp: 300, a: 0.8 });
  for (const m of [36, 37, 42, 48, 49, 54, 60, 61, 66, 67, 73]) B.osc(0, 2.2, { w: 'saw', f: mtof(m) * B.rr(0.995, 1.005), f1: mtof(m) * 0.97, att: 0.008, dec: 0.7, rel: 0.3, vib: [B.rr(5, 7), 0.006], a: 0.22 });
  B.osc(0, 1.2, { w: 'sqr', f: 73.4, att: 0.01, dec: 0.4, a: 0.3 }); B.osc(0, 1.2, { w: 'sqr', f: 77.8, att: 0.01, dec: 0.4, a: 0.3 }); // cuivres
  B.thump(0, { f0: 62, f1: 28, k: 0.2, dec: 0.7, a: 1 });
  B.fric(0.02, 0.9, { rate: (x) => 700 + 600 * x, jit: 0.05, av: 0.2, res: [[2600, 20, 1], [3900, 25, 0.6]], att: 0.01, dec: 0.4, a: 0.25 }); // crissement
  B.lp(7000).drive(1.6);
} });
def('stinger', { duck: 0.4, dkT: 2.5, d: 3.2, v: 2, sr: 'L', g: 0.85, rev: 1.3, r(B) { // coup d'orchestre dissonant
  for (const m of [43, 44, 50, 55, 56, 62, 63]) B.osc(0, 2.8, { w: 'saw', f: mtof(m) * B.rr(0.996, 1.004), att: 0.03, dec: 1.1, rel: 0.4, vib: [B.rr(4.5, 6.5), 0.008], a: 0.2 });
  for (const m of [31, 32, 38]) { const f = mtof(m); B.modal(0, [1, 2, 3, 4, 5, 6].map((k) => [f * k * (1 + 0.0004 * k * k), 1 / k, 1.6 / (1 + k * 0.3)]), { ct: 0.002, a: 0.4, lf: 4 }); } // cluster de piano grave
  B.nz(0, 3, { att: 0.005, dec: 0.9, c: 'p', lp: 3000, hp: 200, a: 0.25 }); // tam-tam
  B.lp(6000);
} });
def('drone', { cap: 1, graph: (...a) => gDrone(...a), param: { tension: 0 }, g: 0.8, os: 4 });
function rap(B, t, a = 1) { // jointure de doigt sur une porte en bois
  const f = B.rr(140, 180);
  B.nz(t, 0.006, { dec: 0.0015, hp: 300, lp: 4000, a: 0.6 * a });
  B.modal(t, [[f, 1, 0.06], [f * 1.8, 0.7, 0.05], [f * 2.9, 0.5, 0.04], [f * 4.7, 0.3, 0.03], [f * 7.1, 0.2, 0.02]], { ct: 0.0015, a: 0.8 * a });
  B.thump(t, { f0: 150, f1: 90, dec: 0.03, a: 0.4 * a });
}
def('knock', { d: 0.7, v: 3, g: 0.8, rev: 1.2, r(B) { rap(B, 0.01, 1); rap(B, 0.01 + B.rr(0.16, 0.21), 0.9); } });
def('knock_triple', { d: 0.9, v: 3, g: 0.8, rev: 1.2, r(B) { let t = 0.01; for (let i = 0; i < 3; i++) { rap(B, t, 1 - i * 0.05); t += B.rr(0.17, 0.22); } } });
def('scratch', { d: 1.8, v: 3, g: 0.6, rev: 1.1, r(B) { // griffes / ongles sur le bois
  let t = 0.02;
  for (let i = 0, n = B.ri(3, 4); i < n; i++) {
    const d = B.rr(0.22, 0.4);
    B.fric(t, d, { rate: (x) => 180 + 500 * x / d, jit: 0.7, av: 0.7, res: [[B.rr(1600, 2000), 2, 1], [B.rr(3000, 3600), 3, 0.7], [B.rr(800, 1000), 2, 0.5]], nz: 0.3, env: [[0, 0], [d * 0.3, 1], [d, 0]], a: 0.5 });
    t += d + B.rr(0.05, 0.15);
  }
  B.pk(300, 2, 4);
} });
def('giggle', { d: 1.6, v: 3, g: 0.6, rev: 1.3, r(B) { // rire d'enfant : « hi-hi-hi » (formants d'enfant)
  const f = B.rr(420, 500), n = B.ri(5, 8);
  for (let i = 0; i < n; i++) {
    const t = 0.03 + i * B.rr(0.12, 0.15), d = B.rr(0.07, 0.1), ff = f * (1 - i * 0.025);
    B.voice(t, d, { f0: (x) => ff * (1.05 - 0.1 * x / d), F: ftrack([[0, 'h'], [0.02, B.ch(0.6) ? 'i' : 'e']], 1.38), asp: (x) => (x < 0.02 ? 0.9 : 0.15), oq: 0.5, att: 0.005, dec: d * 0.5, rel: 0.02, bw: [100, 130, 180, 250], a: 1 - i * 0.06 });
  }
  B.voice(0.05 + n * 0.135, 0.2, { f0: () => 0, F: VW.i.map((x) => x * 1.38), asp: () => 1, att: 0.05, rel: 0.05, a: 0.3 }); // reprise de souffle
} });
def('static_burst', { d: 0.8, v: 3, g: 0.55, r(B) { // friture radio / télé
  const d = B.rr(0.35, 0.7), gate = B.rnd(30, 0, 1);
  B.nz(0, d, { att: 0.003, rel: 0.05, bp: 2500, q: 0.4, a: 0.7, ef: (x) => (gate(x) > 0.25 ? 1 : 0.15) });
  for (let i = 0; i < 20; i++) B.nz(B.rr(0, d), 0.002, { dec: 0.0005, hp: 1500, a: B.rr(0.2, 0.6), tail: 0.004 });
  B.osc(0, d, { w: 'tab', f: 50, harm: [0.3, 0.5, 0.3, 0.2], att: 0.01, rel: 0.05, a: 0.15 });
  B.crush(6, 3);
} });
def('low_boom', { duck: 0.3, dkT: 2, d: 3, v: 2, sr: 'V', g: 1, rev: 1.5, r(B) { // impact infra-grave
  B.thump(0.002, { f0: 75, f1: 28, k: 0.25, dec: 0.7, a: 1 }); B.nz(0, 2.2, { att: 0.01, dec: 0.5, c: 'b', lp: 150, a: 0.6 });
  B.nz(0, 0.01, { dec: 0.003, lp: 1500, a: 0.2 });
} });
function duct(B, t, a = 1) { // coup dans une gaine de tôle
  const f = B.rr(110, 140);
  B.modal(t, [[f, 1, 0.18], [f * 1.55, 0.8, 0.15], [f * 2.35, 0.6, 0.12], [f * 3.7, 0.4, 0.09], [f * 5.8, 0.3, 0.07], [f * 9.5, 0.2, 0.05]], { ct: 0.003, a });
  B.thump(t, { f0: 90, f1: 55, dec: 0.04, a: 0.5 * a });
}
def('vent_crawl', { cap: 1, d: 4, loop: true, g: 0.75, rev: 1.2, r(B) { // quelque chose rampe dans les conduits
  for (let t = 0.1; t < 4; t += B.rr(0.35, 0.7)) {
    duct(B, t, B.rr(0.4, 0.9));
    if (B.ch(0.5)) B.fric(t + 0.05, B.rr(0.15, 0.35), { rate: B.rr(150, 300), jit: 0.8, res: [[1800, 3, 1], [3000, 4, 0.6]], nz: 0.3, att: 0.03, rel: 0.05, a: 0.12 }); // raclement
  }
  for (let i = 0; i < 6; i++) tick(B, B.rr(0, 4), B.rr(1500, 3000), 0.08, 0.02);
} });
def('vent_bang', { d: 2, v: 3, g: 1, rev: 1.6, ref: 3, r(B) {
  B.thump(0, { f0: 90, f1: 45, dec: 0.12, a: 1, drive: 2 }); const f = B.rr(100, 130);
  B.modal(0, [[f, 1, 0.6], [f * 1.55, 0.8, 0.5], [f * 2.35, 0.7, 0.4], [f * 3.7, 0.5, 0.3], [f * 5.8, 0.35, 0.22], [f * 9.5, 0.25, 0.15], [f * 14, 0.15, 0.1]], { ct: 0.002, a: 0.9 });
  B.nz(0, 0.1, { dec: 0.025, lp: 4000, a: 0.6 });
  for (let i = 0, t = 0.06; i < 8; i++, t += B.rr(0.03, 0.08)) tick(B, t, B.rr(1200, 2500), 0.15 * (1 - i / 8), 0.03);
} });
def('breathing_heavy', { d: 3.4, v: 2, sr: 'L', g: 0.7, r(B) { // souffle rauque, expiration grondante
  let t = 0.05;
  for (let i = 0; i < 3; i++) {
    const d = B.rr(0.5, 0.65); B.voice(t, d, { f0: () => 0, F: VW.h, asp: () => 1, env: [[0, 0], [d * 0.6, 0.8], [d, 0]], bw: [200, 250, 300, 350], a: 0.6 }); t += d + 0.05;
    const e = B.rr(0.5, 0.7); B.voice(t, e, { f0: (x) => 75 + 10 * Math.sin(x * 9), F: VW['@'], asp: () => 0.75, jit: 0.1, shim: 0.4, env: [[0, 0], [0.08, 1], [e, 0]], a: 0.9 }); t += e + 0.15;
  }
} });

// ── animaux ──
def('meow', { d: 1.1, v: 3, g: 0.65, rev: 1.1, r(B) { // « miaou » : la bouche s'ouvre puis se referme
  const d = B.rr(0.55, 0.85), f = B.rr(480, 620);
  B.voice(0.02, d, { f0: (x) => f * (1 + 0.45 * Math.sin(Math.PI * Math.min(1, x / d) * 0.9)) * (1 + 0.02 * Math.sin(x * 40)), F: ftrack([[0, 'm'], [0.06, 'i'], [d * 0.45, 'a'], [d, 'u']], 1.75), oq: 0.5, jit: 0.02, br: 0.06, att: 0.03, rel: 0.12, bw: [150, 180, 250, 320], a: 1 });
} });
def('hiss', { d: 1.0, v: 3, g: 0.6, r(B) { B.nz(0, 0.03, { dec: 0.008, hp: 1500, a: 0.7 }); B.nz(0.01, B.rr(0.6, 0.9), { att: 0.01, dec: 0.4, hp: 2500, lp: 10000, a: 0.9, pk: [[4500, 1.5, 4]] }); } });
def('cat_run', { d: 1.1, v: 3, g: 0.5, r(B) { // galop feutré, griffes sur le carrelage
  let t = 0.02, a = 1;
  for (let s = 0; s < 4; s++) {
    for (const o of [0, 0.04, 0.11, 0.15]) { B.nz(t + o, 0.015, { dec: 0.004, lp: 1200, a: B.rr(0.3, 0.6) * a }); B.thump(t + o, { f0: 180, f1: 110, dec: 0.012, a: 0.25 * a }); B.nz(t + o + 0.004, 0.002, { dec: 0.0005, hp: 3000, a: 0.2 * a, tail: 0.004 }); }
    t += 0.24; a *= 0.75;
  }
} });
def('purr', { d: 4, loop: true, sr: 'L', g: 0.6, r(B) { // ronronnement : ~25 impulsions/s, expiration plus forte que l'inspiration
  const pulses = (t0, d, rate, a) => { for (let t = t0; t < t0 + d; t += 1 / rate) { const env = Math.sin(Math.PI * (t - t0) / d); B.nz(t, 0.012, { dec: 0.004, lp: 600, a: a * env * B.rr(0.7, 1), tail: 0.01 }); B.thump(t, { f0: 60, f1: 45, dec: 0.01, a: 0.3 * a * env }); } };
  pulses(0, 1.1, 26, 1); pulses(1.2, 0.8, 23, 0.6); pulses(2, 1.1, 26, 1); pulses(3.2, 0.8, 23, 0.6);
  B.pk(180, 2, 6).pk(450, 3, 3);
} });
def('rat_squeak', { d: 0.6, v: 4, sr: 'H', g: 0.5, r(B) {
  let t = 0.01; for (let i = 0, n = B.ri(2, 3); i < n; i++) { const f = B.rr(2500, 4000), d = B.rr(0.04, 0.1); B.osc(t, d, { w: 'tab', harm: [1, 0.3, 0.1], f, f1: f * B.rr(0.8, 1.3), vib: [B.rr(30, 60), 0.05], att: 0.005, dec: d * 0.6, a: 0.5 }); t += d + B.rr(0.03, 0.12); }
} });
def('parrot', { d: 1.2, v: 3, g: 0.65, rev: 1.1, r(B) { // cri rauque puis sifflement
  const d = B.rr(0.3, 0.45), w = B.rnd(20, -1, 1);
  B.voice(0.02, d, { f0: (x) => 1100 * (1 + 0.25 * w(x)), F: [1800, 2900, 4200, 5500], oq: 0.4, jit: 0.06, shim: 0.4, asp: () => 0.2, att: 0.01, rel: 0.05, bw: [200, 250, 300, 400], a: 1 });
  B.drive(1.8);
  B.osc(d + 0.15, 0.35, { fe: (x) => 1800 + 900 * Math.sin(Math.PI * x / 0.35) - 300 * x, att: 0.02, rel: 0.05, a: 0.35 });
} });
def('bird_chirp', { d: 1.1, v: 4, sr: 'H', g: 0.45, rev: 0.8, r(B) {
  let t = 0.02; const f = B.rr(3200, 4800);
  for (let i = 0, n = B.ri(3, 6); i < n; i++) { const d = B.rr(0.04, 0.09), up = B.ch(0.5); B.osc(t, d, { fe: (x) => f * (up ? 0.8 + 0.5 * x / d : 1.3 - 0.5 * x / d), am: [B.rr(30, 60), 0.4], att: 0.004, dec: d * 0.6, a: 0.5 }); t += d + B.rr(0.03, 0.1); }
} });
def('fish_bubble', { cap: 1, d: 3, loop: true, g: 0.5, ref: 1.5, r(B) { // aquarium : bulles du diffuseur, pompe à membrane
  drops(B, 45, 0, 3, 450, 1800, 0.4);
  for (let i = 0; i < 25; i++) B.nz(B.rr(0, 3), 0.003, { dec: 0.001, hp: 2000, a: B.rr(0.05, 0.15), tail: 0.004 });
  B.osc(0, 3, { w: 'tab', f: 100, harm: [0.4, 0.3, 0.2, 0.1], a: 0.05 });
  B.nz(0, 3, { bp: 1500, q: 0.8, a: 0.08 });
} });

// ── appareils ──
def('tv_static', { cap: 2, d: 3, loop: true, sr: 'H', g: 0.55, r(B) { // neige d'un téléviseur cathodique
  B.nz(0, 3, { hp: 200, lp: 7000, a: 0.8, ef: B.rnd(8, 0.85, 1) });
  B.osc(0, 3, { w: 'tab', f: 50, harm: [0.2, 0.3, 0.2, 0.15, 0.1], a: 0.08 }); B.osc(0, 3, { f: 15625, a: 0.012 }); // trame, ligne
  B.pk(1500, 1, 3);
} });
def('tv_on', { d: 1.6, sr: 'H', g: 0.6, r(B) {
  B.nz(0, 0.006, { dec: 0.0015, hp: 700, a: 0.8 }); B.thump(0, { f0: 200, f1: 120, dec: 0.02, a: 0.4 }); // interrupteur
  B.osc(0.05, 0.9, { w: 'tab', f: 50, harm: [1, 0.6, 0.5, 0.3, 0.2], dec: 0.3, a: 0.5 }); B.nz(0.05, 0.8, { dec: 0.25, lp: 300, a: 0.3, am: [100, 0.8] }); // démagnétisation « bwoum »
  for (let i = 0; i < 14; i++) B.nz(B.rr(0.08, 0.6), 0.002, { dec: 0.0006, hp: 3000, a: B.rr(0.1, 0.3), tail: 0.004 }); // électricité statique sur la dalle
  B.osc(0.1, 1.45, { f: 9000, f1: 15625, gt: 0.6, att: 0.3, a: 0.04 }); // la THT monte
} });
def('tv_off', { d: 0.9, sr: 'H', g: 0.55, r(B) {
  B.nz(0, 0.006, { dec: 0.0015, hp: 700, a: 0.8 }); B.thump(0.005, { f0: 120, f1: 60, dec: 0.02, a: 0.4 });
  B.osc(0, 0.35, { f: 15625, f1: 8000, att: 0.002, dec: 0.12, a: 0.06 });
  for (let i = 0; i < 8; i++) B.nz(B.rr(0.02, 0.7), 0.002, { dec: 0.0006, hp: 3000, a: B.rr(0.05, 0.2), tail: 0.004 });
} });
def('radio_tune', { d: 4, loop: true, g: 0.6, r(B) { // on cherche une station
  B.nz(0, 4, { bp: (x) => 1700 + 1300 * Math.sin(TAU * x / 4), q: 0.6, a: 0.7, ef: B.rnd(3, 0.4, 1) });
  for (let i = 0; i < 5; i++) { const t = B.rr(0, 4), d = B.rr(0.2, 0.6), f = B.rr(500, 2500); B.osc(t, d, { f, f1: f * B.rr(0.3, 3), att: 0.03, rel: 0.05, a: 0.15 }); } // sifflements d'hétérodyne
  for (let i = 0; i < 3; i++) babble(B, B.rr(0, 4), B.rr(0.3, 0.7), { k: 1, f0: 130, a: 0.25 }); // bribes de voix
  for (let i = 0; i < 2; i++) { const t = B.rr(0, 4), d = B.rr(0.3, 0.6), m = B.ri(55, 70); for (const k of [0, 4, 7]) B.osc(t, d, { w: 'tri', f: mtof(m + k), att: 0.03, rel: 0.05, a: 0.06 }); } // bribes de musique
  B.spk(250, 4500, 1500, 3);
} });
def('microwave', { d: 3, loop: true, g: 0.65, r(B) {
  B.osc(0, 3, { w: 'tab', f: 100, harm: [1, 0.7, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1, 0.08, 0.06], a: 0.35, dr: 1.4 }); // transformateur du magnétron
  B.nz(0, 3, { c: 'p', lp: 1800, hp: 100, a: 0.3 }); B.osc(0, 3, { w: 'tab', f: 240, harm: [1, 0.4], a: 0.04 }); // ventilateur
  B.nz(0, 3, { c: 'b', lp: 120, a: 0.25, ef: (x) => 0.8 + 0.2 * Math.sin(TAU * x / 3) }); // plateau tournant
} });
def('microwave_ding', { d: 1.8, sr: 'H', g: 0.6, r(B) { tick(B, 0, 1500, 0.3); bell(B, 0.01, B.rr(2350, 2500), 1, { d: 0.7 }); } });
def('blender', { d: 3, loop: true, g: 0.75, r(B) {
  const ld = B.rnd(2, 0.92, 1.05); // la charge fait varier le régime
  B.osc(0, 3, { w: 'tab', fe: (x) => 310 * ld(x), harm: [1, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08], a: 0.3 });
  B.nz(0, 3, { bp: 1200, q: 0.5, a: 0.35, am: [B.per(7), 0.4] });
  B.fric(0, 3, { rate: 90, jit: 0.6, res: [[2600, 5, 1]], att: 0, rel: 0, a: 0.05 }); // le bocal vibre
} });
def('vacuum', { d: 3, loop: true, g: 0.75, r(B) {
  B.osc(0, 3, { w: 'tab', f: 780, harm: [1, 0.5, 0.35, 0.2, 0.1], a: 0.2, ef: B.rnd(2, 0.9, 1) });
  B.nz(0, 3, { c: 'p', hp: 150, lp: 5000, a: 0.7, pk: [[520, 4, 6], [1040, 5, 4]] }); B.osc(0, 3, { w: 'tab', f: 130, harm: [1, 0.5], a: 0.1 }); // flexible résonant
} });
def('hairdryer', { d: 3, loop: true, g: 0.7, r(B) {
  B.osc(0, 3, { w: 'tab', f: 280, harm: [1, 0.5, 0.4, 0.3, 0.2], a: 0.15 }); B.nz(0, 3, { hp: 300, lp: 6000, a: 0.65, pk: [[1800, 1, 4]] }); B.osc(0, 3, { w: 'tab', f: 100, harm: [0.3, 0.2], a: 0.04 });
} });
def('washer', { d: 6, loop: true, sr: 'L', g: 0.65, r(B) {
  for (let k = 0; k < 4; k++) B.nz(k * 1.5, 0.9, { env: [[0, 0], [0.4, 1], [0.9, 0]], c: 'p', lp: 900, hp: 100, a: 0.5, am: [B.rr(5, 8), 0.4] }); // l'eau ballotte
  B.osc(0, 6, { w: 'tab', f: 50, harm: [0.3, 1, 0.4, 0.3], a: 0.15 }); B.nz(0, 6, { c: 'b', lp: 150, a: 0.25 });
  B.fric(B.rr(0, 5), 0.4, { rate: 40, jit: 0.3, res: [[600, 8, 1]], att: 0.1, rel: 0.1, a: 0.05 }); // le tambour grince
} });
def('toaster_tick', { d: 2, loop: true, g: 0.45, r(B) { for (let k = 0; k < 10; k++) tick(B, k * 0.2, k % 2 ? 3200 : 3500, 0.5, 0.01); B.osc(0, 2, { w: 'tab', f: 100, harm: [0.2, 0.1], a: 0.03 }); } });
def('toaster_pop', { d: 0.7, v: 2, g: 0.7, r(B) {
  B.nz(0, 0.01, { dec: 0.003, hp: 500, a: 0.9 });
  B.modal(0, [[520, 1, 0.1], [1250, 0.7, 0.08], [2300, 0.5, 0.05], [3700, 0.3, 0.03]].map((m) => [m[0] * B.rr(0.95, 1.05), m[1], m[2]]), { ct: 0.0006, a: 0.7 });
  B.osc(0, 0.25, { f: 340, vib: [25, 0.15], dec: 0.08, a: 0.25 }); // ressort
  B.nz(0.12, 0.01, { dec: 0.003, lp: 3000, a: 0.3 }); B.nz(0.2, 0.01, { dec: 0.003, lp: 3000, a: 0.2 }); // les tartines retombent
} });
def('kettle', { d: 4, loop: true, g: 0.6, r(B) {
  B.nz(0, 4, { c: 'b', lp: 400, a: 0.5, ef: B.rnd(6, 0.5, 1) });
  for (let i = 0; i < 300; i++) B.nz(B.rr(0, 4), 0.002, { dec: 0.0006, hp: B.rr(1500, 4000), a: B.rr(0.05, 0.25), tail: 0.004 }); // ébullition nucléée
  B.nz(0, 4, { bp: 3000, q: 0.7, a: 0.15, ef: B.rnd(4, 0.6, 1) }); drops(B, 30, 0, 4, 300, 900, 0.15);
} });
def('kettle_whistle', { d: 3, loop: true, g: 0.6, r(B) {
  const wb = B.rnd(3, 0.985, 1.015);
  B.osc(0, 3, { w: 'tab', fe: (x) => 2250 * wb(x), harm: [1, 0.1, 0.05], a: 0.5 }); B.osc(0, 3, { fe: (x) => 2272 * wb(x), a: 0.15 });
  B.nz(0, 3, { bp: 2250, q: 4, a: 0.3 }); B.nz(0, 3, { hp: 3000, a: 0.08 });
} });
def('fan', { cap: 2, d: 6, loop: true, sr: 'L', g: 0.6, r(B) {
  B.osc(0, 6, { w: 'tab', f: 60, harm: [1, 0.5, 0.3, 0.2], a: 0.2 }); B.osc(0, 6, { w: 'tab', f: 100, harm: [0.3, 0.2], a: 0.06 });
  B.nz(0, 6, { c: 'p', lp: 2000, a: 0.5, am: [B.per(60), 0.15], ef: (x) => 0.8 + 0.2 * Math.sin(TAU * x / 6) }); // pales, balayage lent
} });
def('fridge_hum', { cap: 2, d: 4, loop: true, sr: 'L', g: 0.5, r(B) {
  B.osc(0, 4, { w: 'tab', f: 50, harm: [0.5, 1, 0.3, 0.25, 0.1, 0.1], a: 0.4 }); // compresseur
  B.fric(0, 4, { rate: 100, jit: 0.05, res: [[800, 6, 1]], att: 0, rel: 0, a: 0.03 }); B.nz(0, 4, { c: 'p', lp: 900, a: 0.2 });
  drops(B, 4, 0, 4, 200, 500, 0.05); // gargouillis du fluide
} });
def('coffee_machine', { cap: 2, d: 4, loop: true, g: 0.65, r(B) {
  B.osc(0, 4, { w: 'tab', f: 50, harm: [1, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2], a: 0.4, dr: 1.5 }); // pompe vibrante
  drops(B, 40, 0, 4, 250, 900, 0.2); for (let i = 0; i < 12; i++) { const t = B.rr(0, 4), f = B.rr(1200, 2000); B.osc(t, 0.03, { f, f1: f * 1.5, dec: 0.01, a: 0.15 }); }
  B.nz(0, 4, { hp: 2500, a: 0.15, ef: B.rnd(3, 0.3, 1) }); // vapeur
} });
def('printer', { d: 4, loop: true, o0: 1, g: 0.6, r(B) { // imprimante matricielle : aiguilles, chariot, saut de ligne
  for (const t0 of [0, 2]) {
    B.fric(t0, 1.5, { rate: 820, jit: 0.15, res: [[1800, 2, 1], [3500, 3, 0.6]], ef: (x) => ((x * 14) % 1 < 0.7 ? 1 : 0.05), att: 0.01, rel: 0.02, a: 0.4 });
    B.osc(t0, 1.5, { w: 'saw', f: 420, lp: 1500, att: 0.02, rel: 0.05, a: 0.06 });
    B.fric(t0 + 1.55, 0.3, { rate: 150, jit: 0.1, res: [[600, 3, 1], [1200, 4, 0.5]], att: 0.01, rel: 0.02, a: 0.25 });
    B.thump(t0 + 1.85, { f0: 200, f1: 120, dec: 0.02, a: 0.4 }); B.modal(t0 + 1.85, [[700, 1, 0.04], [1500, 0.6, 0.03]], { ct: 0.0005, a: 0.3 });
  }
} });
def('computer_fan', { cap: 2, d: 4, loop: true, sr: 'L', g: 0.45, r(B) {
  B.osc(0, 4, { w: 'tab', f: 220, harm: [1, 0.4, 0.2], a: 0.12 }); B.nz(0, 4, { c: 'p', lp: 3000, hp: 100, a: 0.5, ef: (x) => 0.9 + 0.1 * Math.sin(TAU * x / 2) });
  B.osc(0, 4, { f: 1480, a: 0.01 }); // roulement
} });
def('computer_boot', { d: 4.6, g: 0.6, r(B) { // PC 1987 : interrupteur, ventilateur, disque dur, bip du POST, disquette
  B.nz(0, 0.008, { dec: 0.002, hp: 600, a: 0.9 }); B.thump(0, { f0: 150, f1: 80, dec: 0.04, a: 0.6 }); tick(B, 0.003, 1800, 0.4);
  B.nz(0.05, 4.5, { c: 'p', lp: (x) => 300 + 2000 * Math.min(1, x / 1.5), a: 0.3, att: 0.5 }); B.osc(0.05, 4.5, { w: 'tab', harm: [1, 0.4], fe: (x) => 30 + 190 * Math.min(1, x / 1.5), att: 0.5, a: 0.08 });
  B.osc(0.2, 4.4, { w: 'tab', harm: [1, 0.3, 0.2], fe: (x) => 20 + 40 * Math.min(1, x / 2), att: 0.3, a: 0.1 }); B.osc(0.2, 4.4, { fe: (x) => 200 + 1000 * Math.min(1, x / 2), att: 0.8, a: 0.03 });
  B.osc(1.2, 0.25, { w: 'sqr', f: 900, att: 0.002, rel: 0.01, lp: 3000, a: 0.35 });
  for (let i = 0; i < 10; i++) tick(B, B.rr(2.0, 3.6), B.rr(2000, 3000), 0.15, 0.01); // têtes du disque
  B.fric(2.5, 0.4, { rate: 120, jit: 0.2, res: [[600, 3, 1], [1200, 4, 0.5]], att: 0.02, rel: 0.05, a: 0.3 }); // lecteur de disquettes
} });
def('vcr_insert', { d: 1.7, g: 0.6, r(B) {
  B.nz(0, 0.25, { att: 0.02, dec: 0.1, bp: 1500, q: 1, a: 0.3 }); // la cassette glisse
  B.thump(0.3, { f0: 180, f1: 100, dec: 0.02, a: 0.5 }); tick(B, 0.3, 1600, 0.4);
  B.osc(0.35, 0.75, { w: 'saw', f: 140, f1: 180, lp: 900, att: 0.05, rel: 0.1, a: 0.15 }); B.fric(0.35, 0.75, { rate: 140, jit: 0.3, res: [[1500, 4, 1]], a: 0.06 });
  for (const t of [0.6, 0.9, 1.15]) { B.thump(t, { f0: 160, f1: 100, dec: 0.02, a: 0.35 }); tick(B, t, B.rr(1200, 2000), 0.25); } // chargement de la bande
  B.osc(0.9, 0.7, { f: 300, f1: 1500, att: 0.3, rel: 0.1, a: 0.03 });
} });
def('vcr_eject', { d: 1.4, g: 0.6, r(B) {
  tick(B, 0, 2000, 0.4); B.osc(0.05, 0.8, { w: 'saw', f: 180, f1: 140, lp: 900, att: 0.05, rel: 0.1, a: 0.15 });
  for (const t of [0.3, 0.6]) { B.thump(t, { f0: 160, f1: 100, dec: 0.02, a: 0.35 }); tick(B, t, 1500, 0.25); }
  B.thump(0.9, { f0: 200, f1: 120, dec: 0.02, a: 0.5 }); B.nz(0.9, 0.2, { att: 0.01, dec: 0.08, bp: 1500, q: 1, a: 0.3 }); // la cassette sort
} });
def('vcr_whirr', { d: 2, loop: true, g: 0.4, r(B) {
  B.osc(0, 2, { w: 'tab', f: 25, harm: [0, 0.3, 0.2, 0.3, 0.1, 0.1], a: 0.15 }); B.osc(0, 2, { f: 1500, a: 0.02, am: [B.per(25), 0.5] }); // tambour de têtes
  B.nz(0, 2, { bp: 3000, q: 0.5, a: 0.06 }); B.osc(0, 2, { w: 'tab', f: 100, harm: [0.3, 0.2], a: 0.05 });
} });
def('turntable_crackle', { d: 1.8, loop: true, g: 0.45, r(B) { // 33 tours : un tour = 1,8 s, la rayure revient à chaque tour
  for (let i = 0; i < 160; i++) B.nz(B.rr(0, 1.8), 0.002, { dec: 0.0005, hp: B.rr(1000, 3000), lp: 9000, a: B.rr(0.05, 0.35), tail: 0.004 });
  B.nz(B.rr(0, 1.8), 0.008, { dec: 0.002, hp: 300, lp: 4000, a: 0.8 });
  B.nz(0, 1.8, { hp: 1000, lp: 8000, a: 0.05 }); B.nz(0, 1.8, { c: 'b', lp: 80, a: 0.1 });
} });
def('cd_tray', { d: 1.1, v: 2, g: 0.55, r(B) {
  tick(B, 0, 2200, 0.3); B.osc(0.05, 0.7, { w: 'saw', f: 260, f1: 230, lp: 2500, att: 0.03, rel: 0.05, a: 0.2 }); B.fric(0.05, 0.7, { rate: 260, jit: 0.2, res: [[3000, 5, 1]], a: 0.05 });
  B.nz(0.78, 0.006, { dec: 0.0015, hp: 800, lp: 6000, a: 0.6 }); B.thump(0.78, { f0: 300, f1: 180, dec: 0.012, a: 0.3 });
} });
def('console_boot', { d: 2.4, g: 0.6, r(B) { // jingle de démarrage (original)
  tick(B, 0, 1800, 0.4);
  chip(B, 0.15, [[72, 1], [76, 1], [79, 1], [84, 1]], { beat: 0.07, a: 0.3 });
  for (const m of [84, 88, 91]) B.osc(0.45, 1.6, { w: 'tri', f: mtof(m), att: 0.004, dec: 0.6, a: 0.25 });
  B.nz(0.45, 0.5, { att: 0.01, dec: 0.15, bp: (x) => 3000 + 6000 * x, q: 3, a: 0.08 }); // scintillement
} });
def('arcade_ambient', { cap: 2, d: 8, loop: true, sr: 'L', g: 0.6, r(B) { // salle d'arcade : bornes en mode démo
  for (let m = 0; m < 3; m++) {
    const key = B.ri(57, 69), bt = B.pick([0.1, 0.125, 0.15]), pat = Array.from({ length: 8 }, () => [B.pick([0, 3, 5, 7, 10, 12, 0]) + key, B.pick([1, 1, 2])]);
    for (let t = B.rr(0, 1); t < 8;) t = chip(B, t, pat, { beat: bt, a: 0.08, w: m === 2 ? 'tri' : 'sqr', duty: m ? 0.25 : 0.5 }) + B.rr(0.2, 1.5);
  }
  for (let i = 0; i < 4; i++) B.nz(B.rr(0, 8), 0.5, { att: 0.002, dec: 0.15, lp: (x) => 4000 * Math.exp(-x / 0.15) + 200, a: 0.15 }); // explosions
  for (let i = 0; i < 2; i++) coin(B, B.rr(0, 8), 0.1, 4000);
  for (let i = 0; i < 30; i++) B.nz(B.rr(0, 8), 0.004, { dec: 0.001, hp: 1000, lp: 5000, a: B.rr(0.05, 0.15), tail: 0.004 }); // boutons
  B.nz(0, 8, { c: 'p', lp: 600, a: 0.08 });
} });
def('crt_whine', { cap: 1, d: 1, loop: true, sr: 'H', g: 0.12, os: 1.5, r(B) { B.osc(0, 1, { f: 14000, a: 0.6 }); B.osc(0, 1, { f: 15625, a: 0.45 }); } }); // sifflement THT, audible
def('drill', { d: 2, loop: true, g: 0.75, r(B) {
  B.osc(0, 2, { w: 'tab', f: 420, harm: [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.3, 0.2, 0.2, 0.15], a: 0.35, ef: B.rnd(3, 0.9, 1) });
  B.nz(0, 2, { bp: 3000, q: 1, a: 0.1, am: [B.per(420), 0.5] }); B.osc(0, 2, { f: 1900, a: 0.05 }); // collecteur, engrenages
  B.fric(0, 2, { rate: 70, jit: 0.4, res: [[1500, 4, 1]], att: 0, rel: 0, a: 0.05 }); // mandrin
} });
def('saw', { d: 2, loop: true, g: 0.75, r(B) { // scie circulaire qui mord le bois
  B.osc(0, 2, { w: 'tab', f: 80, harm: [1, 0.8, 0.7, 0.6, 0.5, 0.4, 0.35, 0.3, 0.25, 0.2, 0.18, 0.15], a: 0.3 }); B.osc(0, 2, { f: 3200, a: 0.04 });
  B.nz(0, 2, { bp: 2500, q: 1, a: 0.4, am: [B.per(400), 0.4], ef: B.rnd(4, 0.6, 1) });
} });
def('shaver', { d: 2, loop: true, g: 0.55, r(B) {
  B.osc(0, 2, { w: 'tab', f: 120, harm: [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2], a: 0.35 });
  B.fric(0, 2, { rate: 120, jit: 0.05, res: [[2400, 3, 1]], att: 0, rel: 0, a: 0.12 }); B.pk(1800, 2, 6);
} });
def('electric_toothbrush', { d: 2, loop: true, g: 0.5, r(B) {
  B.osc(0, 2, { w: 'tab', f: 260, harm: [1, 0.5, 0.4, 0.3, 0.2], a: 0.4 }); B.fric(0, 2, { rate: 260, jit: 0.05, res: [[3000, 4, 1]], att: 0, rel: 0, a: 0.08 });
  B.nz(0, 2, { bp: 4000, q: 1, a: 0.05 });
} });
def('massage_chair', { d: 4, loop: true, sr: 'L', g: 0.55, r(B) {
  B.osc(0, 4, { w: 'tab', f: 75, harm: [1, 0.5, 0.3], a: 0.2 });
  for (let k = 0; k < 5; k++) { const t = k * 0.8; B.thump(t, { f0: 100, f1: 70, dec: 0.05, a: 0.35 }); B.nz(t, 0.08, { dec: 0.02, lp: 600, a: 0.2 }); } // rouleaux
  B.fric(B.rr(0, 3), 0.5, { rate: 25, jit: 0.3, res: [[400, 6, 1], [900, 8, 0.5]], att: 0.1, rel: 0.1, a: 0.1 }); // le cuir grince
} });
def('popcorn', { d: 4, loop: true, g: 0.65, r(B) {
  for (let i = 0; i < 55; i++) { const t = B.rr(0, 4); B.nz(t, 0.015, { dec: 0.004, bp: B.rr(800, 2500), q: 1.2, a: B.rr(0.3, 1) }); B.thump(t, { f0: B.rr(250, 400), f1: 150, dec: 0.01, a: 0.2 }); }
  B.nz(0, 4, { hp: 3000, a: 0.08 }); B.osc(0, 4, { w: 'tab', f: 60, harm: [0.3, 0.2], a: 0.05 }); // huile, mélangeur
} });
def('fryer', { d: 3, loop: true, g: 0.6, r(B) {
  for (let i = 0; i < 800; i++) B.nz(B.rr(0, 3), 0.0015, { dec: 0.0004, hp: B.rr(2000, 6000), a: B.rr(0.05, 0.3), tail: 0.003 });
  B.nz(0, 3, { hp: 2500, lp: 9000, a: 0.3, ef: B.rnd(10, 0.6, 1) }); drops(B, 20, 0, 3, 200, 600, 0.15);
} });
def('grinder', { d: 2, loop: true, g: 0.7, r(B) {
  B.osc(0, 2, { w: 'tab', f: 380, harm: [1, 0.7, 0.5, 0.4, 0.3, 0.2], a: 0.3, ef: B.rnd(6, 0.85, 1) });
  for (let i = 0; i < 400; i++) B.nz(B.rr(0, 2), 0.002, { dec: 0.0006, hp: B.rr(1000, 4000), a: B.rr(0.05, 0.3), tail: 0.004 }); // grains broyés
  B.nz(0, 2, { bp: 2000, q: 1, a: 0.3, ef: B.rnd(15, 0.4, 1) });
} });
def('projector', { d: 2, loop: true, g: 0.55, r(B) { // projecteur de cinéma : griffe à 24 images/s, obturateur, ventilation
  for (let k = 0; k < 48; k++) { const t = k / 24; B.nz(t, 0.003, { dec: 0.001, hp: 1500, a: 0.5, tail: 0.004 }); B.modal(t, [[1800, 1, 0.015], [3100, 0.5, 0.01]], { a: 0.2 }); }
  B.nz(0, 2, { bp: 600, q: 1, a: 0.15, am: [48, 0.5] }); B.nz(0, 2, { c: 'p', lp: 2500, a: 0.2 }); B.osc(0, 2, { w: 'tab', f: 100, harm: [0.3, 0.2], a: 0.05 });
} });
def('kiddie_ride', { cap: 1, d: 8, loop: true, o0: 1, sr: 'L', g: 0.6, r(B) { // manège à pièces : « Frère Jacques » à l'orgue bon marché
  let t = 0;
  for (const [m, d] of JACQUES) { const L = d * 0.25; B.osc(t, L * 0.85, { w: 'sqr', duty: 0.3, f: mtof(72 + m), att: 0.004, rel: 0.02, vib: [6, 0.006], a: 0.25 }); B.osc(t, L * 0.85, { w: 'tri', f: mtof(60 + m), att: 0.004, rel: 0.02, a: 0.12 }); t += L; }
  for (let k = 0; k < 5; k++) { const tt = k * 1.6; B.thump(tt, { f0: 110, f1: 70, dec: 0.04, a: 0.25 }); B.fric(tt + 0.2, 0.4, { rate: 35, jit: 0.3, res: [[500, 6, 1]], att: 0.05, rel: 0.1, a: 0.06 }); } // la bascule
  B.osc(0, 8, { w: 'tab', f: 50, harm: [0.3, 0.5, 0.2], a: 0.06 });
} });
def('claw_machine', { cap: 1, d: 8, loop: true, o0: 1, sr: 'L', g: 0.55, r(B) { // jingle de la pince + moteurs du portique
  const pat = [[72, 1], [76, 1], [79, 1], [84, 1], [79, 1], [76, 1], [77, 1], [81, 1], [84, 1], [89, 1], [84, 1], [81, 1], [79, 1], [83, 1], [86, 1], [91, 1]];
  for (let t = 0; t < 7.9;) t = chip(B, t, pat, { beat: 0.125, a: 0.18, duty: 0.25 });
  for (const [t0, d] of [[2, 1.2], [5.4, 1]]) { B.osc(t0, d, { w: 'saw', f: 180, lp: 1200, att: 0.05, rel: 0.1, a: 0.12 }); B.fric(t0, d, { rate: 90, jit: 0.4, res: [[2200, 5, 1]], att: 0.05, rel: 0.1, a: 0.04 }); }
} });

// ── divers ──
def('pickup', { d: 0.3, v: 4, g: 0.45, r(B) { B.nz(0, 0.12, { att: 0.02, dec: 0.04, bp: 2000, q: 0.6, a: 0.25 }); B.nz(0.04, 0.005, { dec: 0.0015, hp: 1000, lp: 6000, a: 0.3 }); B.thump(0.04, { f0: 260, f1: 160, dec: 0.012, a: 0.2 }); } });
def('drop', { d: 0.35, v: 4, g: 0.55, r(B) { B.thump(0.002, { f0: 180, f1: 90, dec: 0.03, a: 0.6 }); B.nz(0.002, 0.02, { dec: 0.005, lp: 3000, a: 0.5 }); B.thump(0.1, { f0: 200, f1: 110, dec: 0.02, a: 0.2 }); B.nz(0.1, 0.01, { dec: 0.003, lp: 3000, a: 0.15 }); } });
def('throw', { d: 0.45, v: 3, g: 0.5, r(B) { B.nz(0, 0.35, { env: [[0, 0], [0.14, 1], [0.35, 0]], bp: (x) => 600 + 1500 * Math.sin(Math.PI * Math.min(1, x / 0.35)), q: 1.5, a: 0.6 }); B.nz(0, 0.15, { att: 0.02, dec: 0.05, bp: 2200, q: 0.5, a: 0.1 }); } });
def('swing', { d: 0.5, v: 3, g: 0.55, r(B) { B.nz(0, 0.4, { env: [[0, 0], [0.18, 1], [0.4, 0]], bp: (x) => 400 + 700 * Math.sin(Math.PI * Math.min(1, x / 0.4)), q: 1.2, a: 0.7 }); } });
def('air_horn', { d: 1.5, v: 2, g: 0.95, ref: 5, md: 120, r(B) { // corne de brume en bombe : anche saturée
  const f = B.rr(420, 440);
  B.osc(0, 1.3, { w: 'saw', f, f1: f * 0.96, att: 0.02, rel: 0.1, jit: 0.01, a: 0.5 }); B.osc(0, 1.3, { w: 'saw', f: f * 1.007, f1: f * 0.965, att: 0.02, rel: 0.1, a: 0.4 });
  B.pk(900, 2, 6).pk(1800, 3, 6).pk(3200, 3, 3).lp(6000).drive(2);
  B.nz(0, 1.3, { att: 0.02, rel: 0.1, hp: 3000, a: 0.04 });
} });
def('camera_shutter', { d: 0.5, v: 2, sr: 'H', g: 0.55, r(B) { // reflex : miroir, rideau, retour, avance du film
  B.nz(0, 0.005, { dec: 0.0015, hp: 800, a: 0.9 }); B.modal(0, [[1300, 1, 0.03], [2600, 0.6, 0.02], [4100, 0.4, 0.015]], { ct: 0.0002, a: 0.5 });
  B.nz(0.025, 0.003, { dec: 0.0008, hp: 2500, a: 0.6 });
  B.nz(0.06, 0.005, { dec: 0.0015, hp: 900, a: 0.5 }); B.thump(0.06, { f0: 250, f1: 150, dec: 0.01, a: 0.2 });
  B.fric(0.12, 0.25, { rate: 90, jit: 0.2, res: [[2200, 4, 1], [3600, 5, 0.5]], att: 0.01, rel: 0.02, a: 0.2 });
} });
def('polaroid_eject', { d: 1.1, g: 0.55, r(B) {
  B.osc(0.02, 0.9, { w: 'saw', f: 210, jit: 0.01, lp: 2200, att: 0.02, rel: 0.05, a: 0.3 }); B.fric(0.02, 0.9, { rate: 630, jit: 0.1, res: [[2500, 4, 1]], att: 0.02, rel: 0.05, a: 0.08 }); // moteur, engrenages
  B.nz(0.05, 0.85, { att: 0.05, rel: 0.05, bp: 2500, q: 1, a: 0.15 }); tick(B, 0.95, 1500, 0.3); // le tirage glisse
} });
def('paper', { d: 0.8, v: 4, g: 0.45, r(B) {
  for (let i = 0, t = 0, n = B.ri(2, 3); i < n; i++, t += B.rr(0.15, 0.25)) B.nz(t, B.rr(0.1, 0.25), { att: 0.02, dec: 0.08, bp: B.rr(2500, 4500), q: 0.5, a: 0.4, am: [B.rr(20, 40), 0.6] });
  for (let i = 0; i < 30; i++) B.nz(B.rr(0, 0.6), 0.002, { dec: 0.0006, hp: 3000, lp: 11000, a: B.rr(0.03, 0.15), tail: 0.004 });
} });
def('book_page', { d: 0.5, v: 3, g: 0.45, r(B) { B.nz(0, 0.35, { env: [[0, 0], [0.2, 1], [0.35, 0]], bp: (x) => 1500 + 2000 * x, q: 0.6, a: 0.5, am: [30, 0.3] }); B.nz(0.33, 0.02, { dec: 0.006, bp: 1200, q: 0.8, a: 0.4 }); } });
def('zipper', { d: 0.6, v: 3, sr: 'H', g: 0.5, r(B) { const d = B.rr(0.35, 0.5); B.fric(0, d, { rate: (x) => 250 + 300 * Math.sin(Math.PI * x / d), jit: 0.3, res: [[2500, 3, 1], [4500, 4, 0.6], [1400, 3, 0.4]], blip: 6, att: 0.02, rel: 0.03, a: 0.5 }); } });
def('cloth', { d: 0.45, v: 4, g: 0.4, r(B) { B.nz(0, 0.35, { att: 0.05, dec: 0.1, bp: 1800, q: 0.5, a: 0.5, am: [B.rr(8, 15), 0.5] }); B.nz(0, 0.3, { att: 0.05, dec: 0.1, lp: 600, a: 0.2 }); } });
def('spray', { d: 0.9, v: 2, sr: 'H', g: 0.5, r(B) { B.nz(0, 0.004, { dec: 0.001, hp: 2000, a: 0.5 }); B.nz(0.005, 0.7, { att: 0.01, dec: 0.4, hp: 3000, lp: 13000, a: 0.7, am: [B.rr(20, 30), 0.1] }); } });
def('perfume_spray', { d: 0.6, v: 2, sr: 'H', g: 0.45, r(B) { for (const t of [0, 0.3]) { tick(B, t, 2500, 0.3); B.nz(t + 0.01, 0.15, { att: 0.005, dec: 0.05, hp: 3500, lp: 14000, a: 0.6 }); } } });
def('photo_flash', { d: 1.5, sr: 'H', g: 0.55, r(B) {
  B.nz(0, 0.01, { dec: 0.003, hp: 1000, a: 1 }); B.thump(0, { f0: 300, f1: 150, dec: 0.01, a: 0.3 }); // éclair
  B.osc(0.05, 1.35, { w: 'tab', harm: [1, 0.3], f: 1500, f1: 9000, gt: 1.2, att: 0.05, rel: 0.2, a: 0.12 }); // le condensateur se recharge
} });
def('battery_insert', { d: 0.75, v: 2, g: 0.55, r(B) {
  for (const t of [0, 0.25]) { B.nz(t, 0.06, { att: 0.01, dec: 0.02, bp: 2000, q: 1, a: 0.15 }); tick(B, t + 0.05, B.rr(2600, 3000), 0.4, 0.03); } // ressorts
  B.nz(0.55, 0.004, { dec: 0.001, hp: 1200, lp: 7000, a: 0.6 }); B.thump(0.55, { f0: 500, f1: 300, dec: 0.008, a: 0.25 }); // couvercle clipsé
} });
def('flashlight_click', { d: 0.08, v: 3, sr: 'H', g: 0.5, r(B) { B.nz(0, 0.002, { dec: 0.0005, hp: 2500, a: 1 }); B.modal(0, [[B.rr(3300, 3700), 1, 0.008], [B.rr(5400, 5800), 0.5, 0.006]], { ct: 0.0001, a: 0.4 }); B.thump(0, { f0: 600, f1: 400, dec: 0.006, a: 0.25 }); } });
def('gunshot', { duck: 0.3, dkT: 1, d: 1.4, v: 3, sr: 'H', g: 1, rev: 1.8, ref: 6, md: 150, r(B) { // pistolet en intérieur
  B.nz(0, 0.25, { att: 0.0003, dec: 0.035, a: 1 }); B.nz(0, 0.004, { dec: 0.0008, hp: 3000, a: 1 }); // détonation, onde de choc
  B.thump(0, { f0: 180, f1: 60, k: 0.01, dec: 0.06, a: 0.9, drive: 3 });
  tick(B, 0.02, 2500, 0.3); tick(B, 0.035, 1900, 0.3); // culasse
  for (let i = 0, t = B.rr(0.45, 0.6), a = 0.15; i < 3; i++, t += B.rr(0.08, 0.15), a *= 0.6) coin(B, t, a, B.rr(6000, 7500)); // la douille rebondit
  B.verb(0.3, 0.7, 0.3, 0.005);
} });
def('car_engine', { graph: (...a) => gCar(...a), param: { rpm: 0.12 }, g: 0.9, ref: 3, os: 3 });
def('car_horn', { d: 0.8, v: 2, g: 0.9, ref: 5, md: 120, r(B) { // deux avertisseurs à membrane
  const n = B.v === 1 ? 2 : 1;
  for (let i = 0; i < n; i++) { const t = i * 0.28, d = n === 2 ? 0.18 : 0.55; B.osc(t, d, { w: 'sqr', f: 410, att: 0.008, rel: 0.03, a: 0.45 }); B.osc(t, d, { w: 'sqr', f: 512, att: 0.008, rel: 0.03, a: 0.45 }); }
  B.lp(3500).pk(2500, 2, 4).drive(1.5);
} });
def('car_door', { d: 0.7, v: 3, g: 0.85, rev: 1.1, r(B) { // « chtonk » bien amorti
  B.thump(0.002, { f0: 85, f1: 45, k: 0.02, dec: 0.07, a: 1, drive: 1.3 }); B.nz(0.002, 0.05, { dec: 0.012, lp: 1800, a: 0.5 });
  B.modal(0.006, [[B.rr(1050, 1200), 1, 0.03], [B.rr(2200, 2400), 0.6, 0.02], [B.rr(3700, 3900), 0.3, 0.015]], { ct: 0.0002, a: 0.45 }); // gâche
  B.modal(0.002, [[140, 1, 0.08], [230, 0.6, 0.06]], { ct: 0.002, a: 0.4 });
  for (let i = 0; i < 3; i++) shard(B, B.rr(0.01, 0.06), 0.02, 3000, 6000, 0.5); // la vitre tremble
} });
def('car_lock', { d: 0.7, v: 2, g: 0.75, r(B) {
  B.osc(0, 0.07, { w: 'sqr', f: 2400, att: 0.002, rel: 0.005, lp: 5000, a: 0.35 }); if (B.v === 1) B.osc(0.12, 0.07, { w: 'sqr', f: 2400, att: 0.002, rel: 0.005, lp: 5000, a: 0.35 });
  for (let i = 0; i < 4; i++) { const t = 0.15 + i * 0.012 + B.rr(0, 0.006); B.thump(t, { f0: 160, f1: 100, dec: 0.02, a: 0.35 }); tick(B, t, B.rr(1200, 1800), 0.2); } // condamnation centralisée
} });
def('clock_tick', { cap: 2, d: 2, loop: true, g: 0.4, r(B) { // tic… tac (échappement + caisse en bois)
  for (const [t, f] of [[0, 1150], [1, 870]]) {
    B.nz(t, 0.002, { dec: 0.0006, hp: 2000, a: 0.8, tail: 0.004 }); B.modal(t, [[f, 1, 0.02], [f * 2.1, 0.5, 0.015], [f * 3.2, 0.3, 0.01]], { ct: 0.0003, a: 0.5 });
    B.nz(t + 0.008, 0.002, { dec: 0.0005, hp: 2500, a: 0.25, tail: 0.004 });
  }
} });
def('wind_chime', { d: 3, v: 3, g: 0.5, rev: 1.1, r(B) { // carillon à tubes (barres libres : 1 ; 2,756 ; 5,404)
  const tubes = [84, 86, 88, 91, 93].map(mtof);
  for (let i = 0, n = B.ri(6, 10); i < n; i++) { const f = B.pick(tubes), t = Math.pow(B.r(), 1.3) * 1.6; B.modal(t, [[f, 1, 2], [f * 1.0012, 0.4, 1.8], [f * 2.756, 0.45, 0.9], [f * 5.404, 0.2, 0.4]], { ct: 0.0002, a: B.rr(0.2, 0.6), lf: 5 }); }
} });
def('bowling_pins', { d: 1.6, v: 2, g: 0.85, rev: 1.2, r(B) {
  B.thump(0, { f0: 90, f1: 50, dec: 0.06, a: 0.8 }); B.nz(0, 0.02, { dec: 0.005, lp: 3000, a: 0.6 });
  for (let i = 0, n = B.ri(15, 25); i < n; i++) { const t = 0.01 + Math.pow(B.r(), 1.5) * 0.6, f = B.rr(500, 900); B.modal(t, [[f, 1, 0.05], [f * 2.2, 0.6, 0.04], [f * 3.7, 0.4, 0.03]], { ct: 0.0008, a: B.rr(0.2, 0.7) }); B.nz(t, 0.004, { dec: 0.001, hp: 1000, lp: 6000, a: 0.3 }); }
  for (let i = 0; i < 12; i++) B.nz(B.rr(0.5, 1.3), 0.01, { dec: 0.003, lp: 2500, a: B.rr(0.05, 0.15) }); // les quilles roulent
} });
def('basketball', { d: 0.4, v: 4, g: 0.75, r(B) {
  B.thump(0.002, { f0: 140, f1: 95, k: 0.015, dec: 0.05, a: 1 });
  B.modal(0.002, [[B.rr(260, 300), 1, 0.12], [B.rr(570, 640), 0.4, 0.07], [B.rr(980, 1100), 0.25, 0.05]], { ct: 0.002, a: 0.6 }); // air sous pression
  B.nz(0.002, 0.01, { dec: 0.003, bp: 1500, q: 0.6, a: 0.5 });
} });
def('skate_roll', { d: 3, loop: true, g: 0.65, r(B) {
  B.nz(0, 3, { c: 'p', lp: 600, hp: 60, a: 0.5, ef: B.rnd(20, 0.7, 1) });
  for (let k = 0; k < 9; k++) { const t = k / 3; B.thump(t, { f0: 140, f1: 90, dec: 0.015, a: 0.3 }); B.nz(t, 0.006, { dec: 0.002, hp: 800, lp: 5000, a: 0.25 }); } // joints
  B.osc(0, 3, { f: 320, a: 0.02 }); // roulements
} });
def('typewriter', { d: 2.8, v: 3, g: 0.6, r(B) {
  let t = 0.02;
  for (let i = 0, n = B.ri(10, 14); i < n; i++) {
    B.nz(t, 0.004, { dec: 0.001, hp: 1500, lp: 6000, a: 0.25 }); // touche
    const s = t + 0.012; B.nz(s, 0.006, { dec: 0.0015, hp: 600, lp: 5000, a: 0.8 }); // le marteau frappe le cylindre
    B.modal(s, [[B.rr(900, 1300), 1, 0.03], [B.rr(2200, 2800), 0.6, 0.02], [B.rr(3800, 4500), 0.4, 0.015]], { ct: 0.0003, a: 0.4 });
    B.thump(s, { f0: 200, f1: 120, dec: 0.015, a: 0.4 }); tick(B, s + 0.02, B.rr(2500, 3200), 0.15, 0.006); // échappement
    t += B.ch(0.15) ? B.rr(0.25, 0.4) : B.rr(0.09, 0.18);
  }
  if (B.v === 2) { bell(B, t, 2600, 0.3, { d: 0.4 }); B.fric(t + 0.1, 0.25, { rate: 300, jit: 0.4, res: [[1500, 3, 1]], a: 0.2 }); B.thump(t + 0.36, { f0: 160, f1: 100, dec: 0.03, a: 0.5 }); } // fin de ligne
} });
def('sticker', { d: 0.5, v: 3, g: 0.45, r(B) { B.fric(0, 0.3, { rate: (x) => 300 + 3000 * x, jit: 0.8, av: 0.8, res: [[2500, 1.5, 1], [5000, 2, 0.5]], nz: 0.2, att: 0.02, rel: 0.02, a: 0.4 }); B.nz(0.36, 0.03, { dec: 0.008, lp: 1200, a: 0.3 }); } });
def('bell_shop', { d: 1.8, v: 2, sr: 'H', g: 0.55, rev: 1.1, r(B) { // clochette sur ressort au-dessus de la porte
  const f = B.rr(2200, 2600), x = new Float32Array(B.n);
  [0, 0.09, 0.19, 0.3, 0.43, 0.58].forEach((t, i) => { x[Math.round((t + B.rr(0, 0.01)) * B.sr)] = Math.pow(0.68, i); });
  B.res(x, [[f, 1, 0.9], [f * 1.003, 0.4, 0.8], [f * 2.2, 0.6, 0.5], [f * 3.6, 0.4, 0.3], [f * 5.2, 0.25, 0.2], [f * 7.1, 0.15, 0.12]], 1);
  for (const t of [0, 0.09, 0.19]) B.nz(t, 0.002, { dec: 0.0005, hp: 3000, a: 0.1, tail: 0.004 });
} });
def('tick', { d: 0.04, v: 3, g: 0.35, r(B) { B.nz(0, 0.003, { dec: 0.0008, hp: 1500, lp: 7000, a: 0.6 }); B.thump(0, { f0: 900, f1: 600, dec: 0.004, a: 0.2 }); } });

// ── instruments (Audio.note) : un échantillon tous les 3 demi-tons, transposé à la lecture ──
function piano(B, m) { // cordes inharmoniques (B), deux cordes désaccordées, double décroissance, marteau
  const f = mtof(m), Bi = 0.00035 * Math.pow(2, (m - 60) / 24), N = Math.max(1, Math.min(24, Math.floor(B.sr * 0.42 / f))), d0 = clamp(7 * Math.pow(261.6 / f, 0.75), 0.6, 14), md = [];
  for (let n = 1; n <= N; n++) {
    const fn = n * f * Math.sqrt(1 + Bi * n * n), amp = (0.15 + Math.abs(Math.sin(Math.PI * n / 7.3))) / Math.pow(n, 0.9), d = d0 / (1 + 0.35 * n);
    md.push([fn, amp, d * 0.5], [fn * 1.0007, amp * 0.6, d * 1.4]);
  }
  B.modal(0.002, md, { ct: 0.0008, a: 1, lf: 4 });
  B.nz(0.002, 0.012, { dec: 0.003, lp: 2000, a: 0.08 });
}
function guitar(B, m) { // Karplus-Strong accordé (passe-tout) + résonances de caisse
  const sr = B.sr, f = mtof(m), L = sr / f - 0.5, N = Math.max(2, Math.floor(L)), fr = L - N, c = (1 - fr) / (1 + fr);
  const T60 = clamp(3.5 * Math.pow(196 / f, 0.6), 0.8, 6), g = Math.pow(10, -3 / (f * T60)), line = new Float32Array(N), d = B.d;
  for (let i = 0; i < N; i++) line[i] = B.r() * 2 - 1;
  const pp = Math.max(1, Math.round(N / 5)); for (let i = N - 1; i >= pp; i--) line[i] -= line[i - pp]; // pincée au cinquième de la corde
  op1(line, sr, 7000);
  let idx = 0, last = 0, ax = 0, ay = 0; const n = Math.min(B.n - 100, Math.round((T60 * 1.2 + 0.05) * sr)), o = Math.round(0.002 * sr);
  for (let i = 0; i < n; i++) {
    const y = line[idx], avg = 0.5 * (y + last); last = y;
    const ap = c * avg + ax - c * ay; ax = avg; ay = ap;
    line[idx] = ap * g; if (++idx >= N) idx = 0;
    d[i + o] += y;
  }
  B.pk(105, 2, 5).pk(215, 2, 4).pk(420, 1.5, 2);
}
function xylo(B, t, m) { const f = mtof(m); B.modal(t, [[f, 1, 0.5 * Math.pow(523 / f, 0.3)], [f * 3.0, 0.3, 0.12], [f * 6.1, 0.1, 0.05], [f * 1.001, 0.3, 0.6]], { ct: 0.0006, a: 1 }); B.nz(t, 0.004, { dec: 0.001, hp: 1500, lp: 8000, a: 0.25 }); }
function noteDef(instr, m) {
  const f = mtof(m);
  if (instr === 'guitar') return { d: clamp(4 * Math.pow(196 / f, 0.5), 1.2, 5), jit: 0, g: 0.7, r(B) { guitar(B, m); } };
  if (instr === 'xylo') return { d: 1.2, jit: 0, g: 0.6, r(B) { xylo(B, 0.002, m); } };
  if (instr === 'bell') return { d: 3.2, jit: 0, g: 0.55, r(B) { B.osc(0.002, 3, { w: 'fm', f, fm: [1.4, 3, 0.6], att: 0.002, dec: 1.2, a: 0.6 }); B.osc(0.002, 3, { f: f * 0.5, att: 0.01, dec: 1.5, a: 0.12 }); } };
  if (instr === 'musicbox') return { d: 3, jit: 0, g: 0.55, r(B) { tine(B, 0.002, m, 1); } };
  return { d: clamp(6 * Math.pow(261.6 / f, 0.6), 1.2, 6), jit: 0, g: 0.6, r(B) { piano(B, m); } };
}
def('_organ', { graph: (...a) => gOrgan(...a), param: { midi: 60, dur: 0.5 }, g: 0.6 });
def('_synth', { graph: (...a) => gSynth(...a), param: { midi: 60, dur: 0.5 }, g: 0.6 });
def('_keyclick', { d: 0.02, sr: 'H', r(B) { B.nz(0, 0.004, { dec: 0.001, hp: 2000, a: 1 }); } });

// ── batterie (Audio.drum) ──
function metal(B, t, dur, dec, hp, k = 1.9) { // six carrés inharmoniques (cymbale analogique)
  const S = B.sub(dur + 0.05);
  for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) S.osc(0, dur, { w: 'sqr', f: f * k, dec, a: 0.25 });
  S.hp(hp).hp(hp); B.add(S.d, t);
}
def('_dr_kick', { d: 0.6, v: 3, jit: 0.01, g: 0.9, r(B) { B.thump(0.001, { f0: 150, f1: 48, k: 0.03, dec: 0.22, a: 1, drive: 1.3 }); B.nz(0.001, 0.004, { dec: 0.001, hp: 1500, a: 0.35 }); } });
def('_dr_snare', { d: 0.5, v: 3, jit: 0.01, g: 0.8, r(B) { B.thump(0.001, { f0: 260, f1: 185, k: 0.015, dec: 0.06, a: 0.6 }); B.osc(0.001, 0.08, { f: 330, dec: 0.03, a: 0.25 }); B.nz(0.001, 0.3, { dec: 0.07, hp: 1200, lp: 10000, a: 0.8 }); } });
def('_dr_hat', { d: 0.15, v: 3, sr: 'H', jit: 0.01, g: 0.45, r(B) { metal(B, 0.001, 0.12, 0.025, 7000); } });
def('_dr_tom', { d: 0.7, v: 3, jit: 0.01, g: 0.8, r(B) { B.thump(0.001, { f0: 170, f1: 105, k: 0.05, dec: 0.18, a: 1 }); B.nz(0.001, 0.05, { dec: 0.015, lp: 3000, a: 0.25 }); } });
def('_dr_crash', { d: 2.4, v: 2, jit: 0.01, g: 0.6, r(B) { metal(B, 0.001, 2.2, 0.7, 4000, 2.6); B.nz(0.001, 2.2, { dec: 0.6, hp: 5000, a: 0.3 }); } });

// ───────────────────────────── synthèse temps réel (sons paramétrables) ─────────────────────────────
// Un contrôleur reçoit (E moteur, out entrée de la voix, P paramètres, pitch, V voix, t0 départ) et
// renvoie {set(k, v), tick(maintenant, horizon), stop(t), dispose(), dur?}. tick() programme à l'avance.
class Kit {
  constructor(E, out, t0) { this.E = E; this.ctx = E.ctx; this.out = out; this.t0 = t0; this.nodes = []; this.srcs = []; this.live = new Set(); this.stopped = false; }
  g(v = 1) { const n = this.ctx.createGain(); n.gain.value = v; this.nodes.push(n); return n; }
  f(type, freq, q = 0.707) { const n = this.ctx.createBiquadFilter(); n.type = type; n.frequency.value = freq; n.Q.value = q; this.nodes.push(n); return n; }
  o(type, freq, wave) {
    const n = this.ctx.createOscillator(); if (wave) n.setPeriodicWave(wave); else n.type = type;
    n.frequency.value = freq; n.start(this.t0); this.srcs.push(n); this.nodes.push(n); return n;
  }
  b(buf, loop = true, rate = 1) {
    const n = this.ctx.createBufferSource(); n.buffer = buf; n.loop = loop; n.playbackRate.value = rate;
    n.start(this.t0, loop ? Math.random() * buf.duration : 0); this.srcs.push(n); this.nodes.push(n); return n;
  }
  noise() { return this.b(this.E.noiseBuf(), true, 1); }
  // boucle d'un tampon du catalogue, branchée dès que sa synthèse est prête (prise renvoyée tout de suite)
  bn(name, rate = 1) {
    const sock = this.g(1);
    this.E.bufAsync(name, 0, (buf) => {
      if (this.stopped) return;
      const n = this.ctx.createBufferSource(); n.buffer = buf; n.loop = true; n.playbackRate.value = rate;
      n.connect(sock); n.start(Math.max(this.t0, this.ctx.currentTime), Math.random() * buf.duration); this.srcs.push(n); this.nodes.push(n);
    });
    return sock;
  }
  ws(curve) { const n = this.ctx.createWaveShaper(); n.curve = curve; this.nodes.push(n); return n; }
  chain(...ns) { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); return ns[ns.length - 1]; }
  // événement ponctuel programmé (pas, bulles, battements…) : se déconnecte seul
  shot(buf, t, gain = 1, rate = 1, dest = this.out, pan = null) {
    if (this.stopped || !buf) return;
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; s.playbackRate.value = rate; g.gain.value = gain;
    let p = null;
    if (pan != null && ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); s.connect(g).connect(p).connect(dest); } else s.connect(g).connect(dest);
    s.start(Math.max(t, ctx.currentTime)); this.live.add(s);
    s.onended = () => { this.live.delete(s); try { s.disconnect(); g.disconnect(); p && p.disconnect(); } catch (e) { /* déjà déconnecté */ } };
  }
  stop(t) { this.stopped = true; for (const s of this.srcs) try { s.stop(t); } catch (e) { /* */ } for (const s of this.live) try { s.stop(t); } catch (e) { /* */ } }
  dispose() { this.stop(this.ctx.currentTime); for (const n of this.nodes) try { n.disconnect(); } catch (e) { /* */ } this.nodes.length = 0; this.srcs.length = 0; }
  ctl(o) { return { set: o.set || (() => { }), tick: o.tick || null, dur: o.dur, stop: (t) => this.stop(t), dispose: () => this.dispose() }; }
}
const smooth = (p, v, t, tc) => p.setTargetAtTime(v, t, tc);

// groupe électrogène diesel : train d'impulsions (explosions) → corps grave ; bruit modulé par les impulsions → cognement
function gGenerator(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), rpm = () => clamp(num(+P.rpm, 0.8), 0, 1), fr = () => (9 + 18 * rpm()) * pitch;
  const ts = t0 + (P.warm ? 0 : 0.8); // le lanceur (generator_start) couvre la première seconde : le moteur prend ensuite
  const m = K.g(0); m.connect(out); m.gain.setTargetAtTime(1, ts, 0.35);
  const pulse = K.o(null, fr() * 0.45, E.wave('diesel'));
  const lp = K.f('lowpass', 200 + 250 * rpm(), 1.2), pk = K.f('peaking', 95, 1.5); pk.gain.value = 8;
  K.chain(pulse, lp, pk, K.g(0.9), m);
  const shp = K.ws(E.curve('peaks')); pulse.connect(shp);
  const nz = K.noise(), bp = K.f('bandpass', 1700, 1.1), gK = K.g(0); K.chain(nz, bp, gK, m);
  const a1 = K.g(0.9); shp.connect(a1); a1.connect(gK.gain); // cognement synchronisé
  const hp = K.f('highpass', 3500), gM = K.g(0); K.chain(nz, hp, gM, m);
  const a2 = K.g(0.12); shp.connect(a2); a2.connect(gM.gain); // claquements des culbuteurs
  K.chain(K.o('sine', 100 * pitch), K.g(0.05), m); // alternateur
  pulse.frequency.setTargetAtTime(fr(), ts + 0.1, 0.5); // montée en régime
  let next = ts + 0.15;
  return K.ctl({
    set(k) {
      if (k !== 'rpm') return; const t = E.ctx.currentTime;
      pulse.frequency.cancelScheduledValues(t); smooth(pulse.frequency, fr(), t, 0.4); smooth(lp.frequency, 200 + 250 * rpm(), t, 0.4); next = t + 0.12;
    },
    tick(now, until) { // irrégularités d'un vieux diesel, quelques ratés au démarrage
      if (next < now) next = now;
      while (next < until) { const st = next - ts < 2 && Math.random() < 0.3; smooth(pulse.frequency, fr() * (st ? 0.75 : 1 + (Math.random() - 0.5) * 0.03), next, st ? 0.03 : 0.06); next += st ? 0.12 : 0.1 + Math.random() * 0.08; }
    },
  });
}
// moteur de voiture (4 cylindres) : rpm 0..1 = ralenti 800 → 6000 tr/min
function gCar(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), rpm = () => clamp(num(+P.rpm, 0.12), 0, 1), fq = () => (800 + 5200 * rpm()) / 30 * pitch;
  const m = K.g(0); m.connect(out); m.gain.setTargetAtTime(1, t0, 0.1);
  const p = K.o(null, fq(), E.wave('petrol')), half = K.o(null, fq() / 2, E.wave('half')), gh = K.g(0.25); half.connect(gh);
  const sh = K.ws(E.curve('soft')), lp = K.f('lowpass', 600, 0.8), ex = K.f('peaking', 130, 1.2), gB = K.g(0.8); ex.gain.value = 6;
  p.connect(sh); gh.connect(sh); K.chain(sh, lp, ex, gB, m);
  const nz = K.noise(), bp = K.f('bandpass', 1200, 1.4), gN = K.g(0); K.chain(nz, bp, gN, m);
  const shp = K.ws(E.curve('peaks')), amt = K.g(0.35); p.connect(shp); shp.connect(amt); amt.connect(gN.gain); // admission, échappement
  const apply = (t, tc = 0.25) => {
    const r = rpm(); smooth(p.frequency, fq(), t, tc); smooth(half.frequency, fq() / 2, t, tc);
    smooth(lp.frequency, 350 + 3200 * Math.pow(r, 1.2), t, tc); smooth(bp.frequency, 900 + 1600 * r, t, tc); smooth(gB.gain, 0.55 + 0.45 * r, t, tc);
  };
  apply(t0, 0.01);
  let next = t0 + 0.1;
  return K.ctl({
    set(k) { if (k !== 'rpm') return; const t = E.ctx.currentTime; p.frequency.cancelScheduledValues(t); half.frequency.cancelScheduledValues(t); apply(t); next = t + 0.15; },
    tick(now, until) { // ralenti un peu instable
      if (next < now) next = now;
      while (next < until) { if (rpm() < 0.3) { const j = 1 + (Math.random() - 0.5) * 0.04; smooth(p.frequency, fq() * j, next, 0.05); smooth(half.frequency, fq() * j / 2, next, 0.05); } next += 0.12 + Math.random() * 0.1; }
    },
  });
}
// voiture radiocommandée : petit moteur à courant continu qui geint ; vitesse = paramètre ou déduite des déplacements
function gToyCar(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0);
  const mo = K.o('sawtooth', 200), pk = K.f('peaking', 1500, 1.5), gM = K.g(0); pk.gain.value = 6; K.chain(mo, pk, K.f('lowpass', 5000), gM, out);
  const ge = K.o('square', 600), bp = K.f('bandpass', 600, 5), gG = K.g(0); K.chain(ge, bp, gG, out); // pignons
  const wl = K.f('lowpass', 800), gW = K.g(0); K.chain(K.noise(), wl, gW, out); // roues sur le sol
  const speed = () => (P.speed != null && isFinite(P.speed) ? clamp(+P.speed, 0, 1) : V && V.vel != null ? clamp(V.vel / 2.5, 0, 1) : 0.6);
  let s = speed();
  const apply = (t) => {
    const f = (140 + 900 * s) * pitch;
    smooth(mo.frequency, f, t, 0.06); smooth(ge.frequency, f * 3.1, t, 0.06); smooth(bp.frequency, f * 3.1, t, 0.06);
    smooth(gM.gain, 0.12 + 0.88 * s, t, 0.06); smooth(gG.gain, 0.05 * s, t, 0.06); smooth(gW.gain, 0.35 * s, t, 0.08); smooth(wl.frequency, 500 + 1500 * s, t, 0.08);
  };
  apply(t0);
  return K.ctl({ set() { s = speed(); apply(E.ctx.currentTime); }, tick(now) { const ns = speed(); if (Math.abs(ns - s) > 0.01) { s += (ns - s) * 0.5; apply(now); } } });
}
// nappe d'angoisse : oscillateurs désaccordés (battements), sous-grave, couches dissonantes selon la tension
function gDrone(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), ten = () => clamp(num(+P.tension, 0), 0, 1), base = 49 * pitch;
  const m = K.g(0); m.connect(out); m.gain.setTargetAtTime(1, t0, 0.8);
  const lpf = K.f('lowpass', 200, 2); lpf.connect(m);
  const O = [];
  const mk = (type, mul, g, dest = lpf, tens = false) => { const o = K.o(type, base * mul), gg = K.g(g); o.connect(gg); gg.connect(dest); O.push({ o, gg, mul, tens }); return o; };
  mk('sawtooth', 1, 0.22); const o2 = mk('sawtooth', 1.0035, 0.22); const o3 = mk('sawtooth', 1.4983, 0.14); mk('sine', 0.5, 0.5, m);
  mk('sawtooth', 2.1189, 0, lpf, true); mk('triangle', 1.4142, 0, lpf, true); mk('sawtooth', 4.02, 0, lpf, true); // seconde mineure, triton, scintillement
  const nb = K.f('bandpass', 400, 2), gN = K.g(0.04); K.chain(K.noise(), K.f('lowpass', 900), nb, gN, m);
  const lfo = (f, depth, param) => { const o = K.o('sine', f), g = K.g(depth); o.connect(g); g.connect(param); return [o, g]; };
  const [, l1] = lfo(0.07, 80, lpf.frequency), [l2o, l2] = lfo(0.11, 6, o2.detune); lfo(0.05, 250, nb.frequency); lfo(0.09, 5, o3.detune);
  const apply = (t, tc = 1.2) => {
    const v = ten(), k = Math.pow(2, v * 4 / 12);
    for (const x of O) { smooth(x.o.frequency, base * x.mul * k, t, tc); if (x.tens) smooth(x.gg.gain, 0.1 * v, t, tc); }
    smooth(lpf.frequency, 140 + 2200 * v * v, t, tc); smooth(lpf.Q, 2 + 6 * v, t, tc); smooth(gN.gain, 0.04 + 0.12 * v, t, tc);
    smooth(l1.gain, 80 + 400 * v, t, tc); smooth(l2.gain, 6 + 14 * v, t, tc); smooth(l2o.frequency, 0.11 + 0.6 * v, t, tc);
  };
  apply(t0, 0.01);
  return K.ctl({ set(k) { if (k === 'tension') apply(E.ctx.currentTime); } });
}
// vent : bruit stéréo filtré, rafales (processus aléatoire lissé), sifflement quand il force.
// deep 0..1 : vent entendu de loin, dehors la nuit — grondement sourd et grave (passe-bas, bande basse), sans sifflement
function gWind(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), S = () => clamp(num(+P.strength, 0.5), 0, 1), D = () => clamp(num(+P.deep, 0), 0, 1);
  const m = K.g(0), lo = K.f('lowpass', 20000, 0.5); K.chain(m, lo, out); m.gain.setTargetAtTime(1, t0, 0.5);
  const nz = K.noise(), pre = K.f('lowpass', 1200); nz.connect(pre);
  const bA = K.f('bandpass', 500, 0.6), gA = K.g(0); K.chain(pre, bA, gA, m);
  const bB = K.f('bandpass', 900, 12), gB = K.g(0); K.chain(nz, bB, gB, m);
  const bC = K.f('lowpass', 140), gC = K.g(0); K.chain(pre, bC, gC, m);
  let x = 0.4, tgt = 0.5, next = t0, nt = t0, dl = -1;
  return K.ctl({
    set(k) { if (k === 'deep') next = Math.min(next, E.ctx.currentTime); },
    tick(now, until) {
      if (next < now) next = now;
      while (next < until) {
        const s = S(), d = D(), t = next;
        if (d !== dl) { smooth(lo.frequency, 20000 * Math.pow(420 / 20000, d), t, dl < 0 ? 0.01 : 0.6); dl = d; }
        if (t >= nt) { tgt = clamp(0.15 + Math.random() * (0.5 + 0.5 * s), 0, 1); nt = t + 1 + Math.random() * (4 - 2.5 * s) * (1 + d); }
        x = clamp(x + (tgt - x) * 0.12 + (Math.random() - 0.5) * 0.05 * s, 0, 1);
        smooth(gA.gain, 6 * (0.3 + 0.7 * s) * (0.35 + 0.65 * x) * (1 - 0.4 * d), t, 0.25); smooth(bA.frequency, (250 + 900 * x * (0.5 + s)) * (1 - 0.6 * d) * pitch, t, 0.3);
        smooth(gB.gain, 20 * s * s * x * x * (1 - d), t, 0.3); smooth(bB.frequency, (600 + 1000 * x + 150 * Math.sin(t * 1.7)) * pitch, t, 0.4);
        smooth(gC.gain, 12 * (0.25 + 0.6 * x) * (0.4 + 0.6 * s), t, 0.3);
        next += 0.15;
      }
    },
  });
}
// pluie : nappe + gouttes (tampons stéréo), mélange selon l'intensité
function gRain(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), I = () => clamp(num(+P.intensity, 0.5), 0, 1);
  const m = K.g(0); m.connect(out); m.gain.setTargetAtTime(1, t0, 0.5);
  const w = K.bn('_rain_wash', pitch), d = K.bn('_rain_drops', pitch);
  const lw = K.f('lowpass', 5000), gW = K.g(0), gD = K.g(0); K.chain(w, lw, gW, m); K.chain(d, gD, m);
  const apply = (t, tc = 0.6) => { const i = I(); smooth(gW.gain, 2 * (0.2 + 0.8 * i), t, tc); smooth(lw.frequency, 1800 + 7000 * i, t, tc); smooth(gD.gain, 2 * (0.75 - 0.25 * i + 0.3 * i * i), t, tc); };
  apply(t0, 0.01);
  return K.ctl({ set(k) { if (k === 'intensity') apply(E.ctx.currentTime); } });
}
// ton de salle nocturne : grondement grave + souffle de ventilation (deux boucles), niveaux qui errent lentement
// (marche aléatoire : jamais deux fois pareil), rares houles. Que des gains automatisés : coût négligeable.
// dark 0..1 : pénombre (plus lourd) · tension 0..1 : avancée de la nuit, stress · air 0..1 : ventilation en marche
function gRoomTone(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), p = (k, d) => clamp(num(+P[k], d), 0, 1);
  const m = K.g(0); m.connect(out); m.gain.setTargetAtTime(1, t0, 1.5);
  const gL = K.g(0), gA = K.g(0), gS = K.g(1); gS.connect(m);
  K.chain(K.bn('_rt_low', pitch), gL, m); K.chain(K.bn('_rt_air', pitch), gA, m);
  let wl = 1, wa = 1, nw = t0 + 2, ns = t0 + 10 + Math.random() * 25;
  const apply = (t, tc) => {
    const d = p('dark', 1), te = p('tension', 0.3), a = p('air', 1);
    smooth(gL.gain, wl * (0.4 + 0.6 * d) * (0.75 + 0.6 * te), t, tc); smooth(gA.gain, wa * 0.3 * (0.1 + 0.9 * a) * (0.75 + 0.25 * d), t, tc);
  };
  apply(t0, 0.05);
  return K.ctl({
    set() { apply(E.ctx.currentTime, 1.5); },
    tick(now, until) {
      if (nw < now) nw = now;
      while (nw < until) { wl = 0.8 + 0.35 * Math.random(); wa = 0.85 + 0.3 * Math.random(); apply(nw, 1.5 + 2.5 * Math.random()); nw += 3 + 6 * Math.random(); } // ±1,5 dB
      if (ns < now) ns = now;
      while (ns < until) { // houle : le bâtiment « respire » (plus souvent quand la nuit avance)
        const te = p('tension', 0.3);
        K.shot(E.bufIfReady('_rt_swell', (Math.random() * 3) | 0), ns, (0.35 + 0.4 * Math.random()) * (0.3 + 0.7 * p('dark', 1)) * (0.7 + 0.6 * te), pitch * (0.92 + 0.16 * Math.random()), gS);
        ns += (25 + 50 * Math.random()) / (0.7 + 0.8 * te);
      }
    },
  });
}
// verrière des galeries, entendue d'en dessous : pluie qui crépite sur le vitrage, rafales sourdes, joint qui siffle.
// rain 0..1 · wind 0..1 · muffle 0..1 (depuis une boutique : fondu vers une version filtrée, aucun filtre automatisé)
function gGlassRoof(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), p = (k, d) => clamp(num(+P[k], d), 0, 1);
  const m = K.g(0), dry = K.g(1), mf = K.g(0); m.gain.setTargetAtTime(1, t0, 1);
  K.chain(m, dry, out); K.chain(m, K.f('lowpass', 650, 0.6), mf, out);
  const gR = K.g(0), gW = K.g(0); K.chain(K.bn('_glass_rain', pitch), gR, m); K.chain(K.bn('_glass_gust', pitch), gW, m);
  let x = 0.5, next = t0;
  const apply = (t, tc = 1) => { const r = p('rain', 0), u = p('muffle', 0); smooth(gR.gain, 0.9 * r * (0.5 + 0.5 * r), t, tc); smooth(dry.gain, 1 - u, t, tc); smooth(mf.gain, 0.6 * u, t, tc); };
  apply(t0, 0.01);
  return K.ctl({
    set() { apply(E.ctx.currentTime); },
    tick(now, until) { // rafales : processus aléatoire lissé, ramené vers la moyenne
      if (next < now) next = now;
      while (next < until) { const w = p('wind', 0.3); x = clamp(x + (0.5 - x) * 0.25 + (Math.random() - 0.5) * 0.7, 0.05, 1); smooth(gW.gain, 1.6 * w * (0.2 + 0.8 * x), next, 0.8 + Math.random()); next += 0.8 + 2.4 * Math.random(); }
    },
  });
}
// feu : grondement + crépitement en boucle, éclats ponctuels plus fréquents quand il grossit
function gFire(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), S = () => clamp(num(+P.size, 0.5), 0, 1);
  const m = K.g(0); m.connect(out); m.gain.setTargetAtTime(1, t0, 0.3);
  const lp = K.f('lowpass', 600), gR = K.g(0), gC = K.g(0);
  K.chain(K.bn('_fire_roar', pitch), lp, gR, m); K.chain(K.bn('_fire_crk', pitch), gC, m);
  const apply = (t, tc = 0.4) => { const s = S(); smooth(gR.gain, 0.15 + 0.85 * s, t, tc); smooth(lp.frequency, 250 + 1500 * s, t, tc); smooth(gC.gain, 0.35 + 0.65 * Math.sqrt(s), t, tc); };
  apply(t0, 0.01);
  let next = t0 + 0.2;
  return K.ctl({
    set(k) { if (k === 'size') apply(E.ctx.currentTime); },
    tick(now, until) {
      if (next < now) next = now;
      while (next < until) { const s = S(); K.shot(E.bufIfReady('_fire_pop', (Math.random() * 4) | 0), next, (0.3 + 0.7 * Math.random()) * (0.3 + 0.7 * s), pitch * (0.8 + Math.random() * 0.4), m); next += -Math.log(1 - Math.random() * 0.999) / (0.4 + 3 * s); }
    },
  });
}
// foule de galerie marchande : brouhaha (deux lectures décorrélées) + événements épars (rires, talons, caisse…)
const CROWD_FX = [['laugh', 3], ['step_heels', 3], ['step_sneakers', 2], ['coins', 1], ['cash_register_ding', 1], ['giggle', 0.6], ['baby_cry', 0.3], ['bell_shop', 0.5]];
function gCrowd(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), D = () => clamp(num(+P.density, 0.5), 0, 1);
  const m = K.g(0); m.connect(out); m.gain.setTargetAtTime(1, t0, 0.8);
  const lp = K.f('lowpass', 2500), gA = K.g(0), gB = K.g(0), sp = (v) => { const n = E.ctx.createStereoPanner ? E.ctx.createStereoPanner() : E.ctx.createGain(); if (n.pan) n.pan.value = v; K.nodes.push(n); return n; };
  K.chain(K.bn('_babble', 0.97 * pitch), gA, sp(-0.65), lp); K.chain(K.bn('_babble', 1.03 * pitch), gB, sp(0.65), lp); lp.connect(m);
  const ev = K.f('lowpass', 3500); ev.connect(m);
  // deux nappes de voix lointaines, adoucies (filtre plus bas) : un fond de galerie, pas des gens qui parlent à côté
  const apply = (t, tc = 0.8) => { const d = D(); smooth(gA.gain, 1.5 * (0.25 + 0.75 * Math.min(1, d * 1.6)), t, tc); smooth(gB.gain, 1.2 * (0.15 + 0.85 * Math.min(1, d * 1.3)), t, tc); smooth(lp.frequency, 1100 + 1500 * d, t, tc); };
  apply(t0, 0.01);
  const tot = CROWD_FX.reduce((s, x) => s + x[1], 0);
  let next = t0 + 1;
  return K.ctl({
    set(k) { if (k === 'density') apply(E.ctx.currentTime); },
    tick(now, until) {
      if (next < now) next = now;
      while (next < until) {
        const d = D();
        if (d > 0.02) {
          let r = Math.random() * tot, nm = CROWD_FX[0][0];
          for (const [n, w] of CROWD_FX) { r -= w; if (r <= 0) { nm = n; break; } }
          const def = SND[nm];
          K.shot(E.bufIfReady(nm, (Math.random() * (def.v || 1)) | 0), next, (0.06 + 0.18 * Math.random()) * (def.g || 0.7), (0.95 + Math.random() * 0.1) * pitch, ev, Math.random() * 1.6 - 0.8);
        }
        next += (1.5 + Math.random() * 4) / (0.3 + d); // rires, talons, monnaie : un toutes les 1 à 4 s, pas en rafale
      }
    },
  });
}
// cœur : « lub-dub », l'intervalle systolique raccourcit quand le rythme s'accélère
function gHeart(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), lub = () => E.bufIfReady('_lub') || E.buf('_lub'), dub = () => E.bufIfReady('_dub') || E.buf('_dub');
  // souffle court et retenu du joueur stressé, sous le cœur, plus présent quand le rythme s'emballe (rien si le souffle
  // d'essoufflement joue déjà)
  const gB = K.g(0); K.chain(K.bn('breath', 1.18 * pitch), K.f('lowpass', 2400, 0.6), gB, out);
  let next = t0 + 0.05, bt = 0;
  const breath = (t) => { let busy = false; for (const v of E.voices) if (v.name === 'breath' && v.alive && !v.stopping) { busy = true; break; } smooth(gB.gain, busy ? 0 : 0.2 * clamp((num(+P.bpm, 72) - 95) / 60, 0, 1), t, 0.8); };
  return K.ctl({
    tick(now, until) {
      if (now >= bt) { bt = now + 0.5; breath(now); }
      if (next < now) next = now + 0.02;
      while (next < until) { const T = 60 / clamp(num(+P.bpm, 72), 30, 220) * (1 + (Math.random() - 0.5) * 0.03); K.shot(lub(), next, 1, pitch); K.shot(dub(), next + 0.32 * Math.sqrt(T), 0.65, pitch); next += T; }
    },
  });
}
// boîte à musique : « Au clair de la lune », tempo 0..2 (0 = ressort arrêté)
function gMusicBox(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0);
  for (const [s, d] of CLAIR) { E.bufIfReady('_mb' + (84 + s)); if (d >= 2) E.bufIfReady('_mb' + (72 + s)); }
  let next = t0 + 0.12, i = 0;
  return K.ctl({
    tick(now, until) {
      const tp = clamp(num(+P.tempo, 1), 0, 2);
      if (tp < 0.05) { next = Math.max(next, until); return; } // ressort arrêté
      if (next < now) next = now + 0.02;
      while (next < until) {
        const [s, d] = CLAIR[i], beat = 0.55 / tp, b = E.bufIfReady('_mb' + (84 + s));
        if (!b) { next = Math.max(next, now + 0.05); break; } // lame pas encore synthétisée : on attend
        K.shot(b, next + (Math.random() - 0.5) * 0.012, 0.8, pitch);
        if (d >= 2) K.shot(E.bufIfReady('_mb' + (72 + s)), next + 0.004, 0.3, pitch); // basse sur les notes longues
        next += d * beat; if (++i >= CLAIR.length) { i = 0; next += 2 * beat; }
      }
    },
  });
}
// son ponctuel demandé en boucle : répétitions espacées, variantes aléatoires
function gRepeat(E, out, P, pitch, V, t0, name) {
  const K = new Kit(E, out, t0), def = SND[name];
  let next = t0 + 0.02;
  return K.ctl({
    tick(now, until) {
      if (next < now - 0.5) next = now;
      while (next < until) {
        const buf = E.bufIfReady(name, (Math.random() * (def.v || 1)) | 0) || E.bufIfReady(name, 0);
        if (!buf) { next = Math.max(next, now + 0.05); break; } // première synthèse en cours
        const r = pitch * (1 + (Math.random() - 0.5) * 2 * (def.jit ?? 0.03)), gp = def.gap || [0.3, 1.6];
        K.shot(buf, next, 0.85 + Math.random() * 0.3, r);
        next += buf.duration / r + gp[0] + Math.random() * (gp[1] - gp[0]);
      }
    },
  });
}
// orgue à roues phoniques (tirettes 16' 8' 5⅓' 4' 2⅔' 2'), vibrato de cabine tournante, clic de touche
function gOrgan(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), f = mtof(num(+P.midi, 60)) * pitch, dur = Math.max(0.05, num(+P.dur, 0.5));
  const o = K.o(null, f / 2, E.wave('organ')), g = K.g(0); o.connect(g); g.connect(out);
  K.chain(K.o('sine', 6.2), K.g(5), o.detune);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.5, t0 + 0.006); g.gain.setValueAtTime(0.5, t0 + dur); g.gain.linearRampToValueAtTime(0, t0 + dur + 0.07);
  K.shot(E.buf('_keyclick'), t0, 0.2);
  return K.ctl({ dur: dur + 0.12 });
}
// synthé analogique : deux dents de scie désaccordées + sous-oscillateur, filtre résonant à enveloppe
function gSynth(E, out, P, pitch, V, t0) {
  const K = new Kit(E, out, t0), f = mtof(num(+P.midi, 60)) * pitch, dur = Math.max(0.05, num(+P.dur, 0.5));
  const a = K.o('sawtooth', f), b = K.o('sawtooth', f), s = K.o('square', f / 2); a.detune.value = -8; b.detune.value = 8;
  const lp = K.f('lowpass', 3000, 5), g = K.g(0), gs = K.g(0.3);
  a.connect(lp); b.connect(lp); s.connect(gs); gs.connect(lp); lp.connect(g); g.connect(out);
  lp.frequency.setValueAtTime(3500, t0); lp.frequency.setTargetAtTime(900, t0 + 0.01, 0.12);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.35, t0 + 0.01); g.gain.setTargetAtTime(0.22, t0 + 0.01, 0.1); g.gain.setTargetAtTime(0, t0 + dur, 0.08);
  return K.ctl({ dur: dur + 0.5 });
}
for (const m of [67, 69, 72, 74, 76, 79, 81, 83, 84, 86, 88]) def('_mb' + m, { d: 3, sr: 'L', g: 1, jit: 0, r(B) { tine(B, 0.002, m, 1); } }); // lames de la boîte à musique
def('toy_car', { graph: (...a) => gToyCar(...a), param: { speed: null }, g: 0.6, os: 2 });
def('music_box', { graph: (...a) => gMusicBox(...a), param: { tempo: 1 }, g: 0.6, rev: 1.2, os: 4 });

// ───────────────────────────── acoustique des lieux ─────────────────────────────
// rt : RT60 (s) aux fréquences moyennes · pre : pré-délai de la queue diffuse · hf : brillance initiale (Hz)
// hi : rapport de décroissance des aigus (plus petit = aigus absorbés plus vite) · lo : rallongement des graves
// er : réflexions précoces [nombre, première (ms), dernière (ms)] · flut : écho flottant [période, nombre, gain]
// comb : résonances métalliques (Hz) · slap : échos de façade [t, g, …] · wet : niveau de retour
const ZONES = {
  security: { rt: 0.45, pre: 0.006, hf: 4500, hi: 0.45, lo: 1.1, er: [6, 3, 22], wet: 0.15 },             // petit bureau moquetté, mat
  shop: { rt: 0.9, pre: 0.012, hf: 7000, hi: 0.55, lo: 1.1, er: [8, 5, 40], wet: 0.21 },
  bigstore: { rt: 1.8, pre: 0.025, hf: 8000, hi: 0.5, lo: 1.15, er: [10, 11, 80], wet: 0.27 },
  backroom: { rt: 0.7, pre: 0.008, hf: 3500, hi: 0.42, lo: 1.2, er: [7, 4, 30], wet: 0.19 },              // cartons : sourd
  atrium: { rt: 3.2, pre: 0.045, hf: 11000, hi: 0.68, lo: 1.05, er: [12, 18, 140], wet: 0.33 },          // grand hall vitré, brillant
  corridor: { rt: 1.4, pre: 0.012, hf: 9000, hi: 0.6, lo: 1.1, er: [8, 4, 50], flut: [0.021, 14, 0.62], wet: 0.25 },
  garage: { rt: 2.6, pre: 0.03, hf: 6000, hi: 0.45, lo: 1.45, er: [12, 9, 110], wet: 0.31 },            // béton : bourdonnement grave
  vent: { rt: 0.35, pre: 0.002, hf: 6500, hi: 0.6, lo: 1, er: [6, 1.2, 9], comb: [330, 470, 610], wet: 0.3 },
  roof: { rt: 0.15, pre: 0.004, hf: 6000, hi: 0.6, lo: 1, er: [3, 8, 30], slap: [0.14, 0.12], wet: 0.06 },
  basement: { rt: 1.6, pre: 0.018, hf: 5000, hi: 0.45, lo: 1.35, er: [10, 6, 70], wet: 0.28 },          // béton humide
  warehouse: { rt: 2.2, pre: 0.03, hf: 7000, hi: 0.5, lo: 1.25, er: [12, 11, 120], wet: 0.3 },
  stairs: { rt: 1.9, pre: 0.01, hf: 8000, hi: 0.55, lo: 1.2, er: [10, 3, 45], flut: [0.016, 18, 0.66], wet: 0.3 },
  toilets: { rt: 1.1, pre: 0.008, hf: 10000, hi: 0.7, lo: 1.05, er: [8, 3, 30], flut: [0.012, 10, 0.5], wet: 0.24 }, // carrelage
  outside: { rt: 0.1, pre: 0.003, hf: 5000, hi: 0.6, lo: 1, er: [2, 10, 25], slap: [0.18, 0.18, 0.31, 0.08], wet: 0.07 },
  // grand hall vide où porte la sono (queue de la chaîne « pa ») : calculé seulement à la première utilisation
  pahall: { rt: 3.7, pre: 0.03, hf: 4200, hi: 0.5, lo: 1.15, er: [16, 24, 170], slap: [0.23, 0.07, 0.37, 0.045], wet: 0.5, lazy: 1 },
};

// Réponse impulsionnelle stéréo : queue de bruit à décroissance exponentielle dont les aigus s'éteignent plus
// vite (passe-bas dont la coupure baisse), graves prolongés, densité qui s'installe, réflexions précoces,
// écho flottant entre murs parallèles, résonances de conduit, échos de façade. Énergie normalisée.
// Fonction pure (canaux Float32Array) : calculable dans le worker de synthèse.
function irData(z, seed, sr) {
  const len = Math.min(4.5, z.pre + z.rt * 1.15 + 0.06 + (z.slap ? 0.4 : 0)), n = Math.max(256, Math.round(len * sr));
  const ch = [new Float32Array(n), new Float32Array(n)], r = mulberry(seed);
  const kM = Math.exp(-6.9078 / (z.rt * sr)), kL = Math.exp(-6.9078 / (z.rt * (z.lo || 1) * sr)), aLo = 1 - Math.exp(-TAU * 220 / sr);
  const pre = Math.round(z.pre * sr), build = Math.max(1, Math.round(Math.min(0.08, z.rt * 0.06 + 0.004) * sr));
  let E = 0;
  for (let c = 0; c < 2; c++) {
    const d = ch[c];
    let eM = 1, eL = 1, lp = 0, l1 = 0, l2 = 0, a = 1;
    for (let i = pre; i < n; i++) {
      const j = i - pre;
      if ((j & 63) === 0) a = 1 - Math.exp(-TAU * (z.hf * Math.exp(-j / sr / (z.rt * z.hi)) + 300) / sr);
      const w = r() * 2 - 1;
      lp += a * (w - lp); l1 += aLo * (w - l1); l2 += aLo * (l1 - l2);
      d[i] = (lp * eM + l2 * Math.max(0, eL - eM) * 2) * (j < build ? j / build : 1);
      eM *= kM; eL *= kL;
    }
    const [cnt, t0, t1] = z.er; // réflexions précoces (murs, sol, plafond)
    for (let k = 0; k < cnt; k++) {
      const tms = t0 + (t1 - t0) * Math.pow(k / Math.max(1, cnt - 1), 1.3) * (0.85 + 0.3 * r()), idx = Math.round(tms * 0.001 * sr);
      if (idx >= n - 3) continue;
      const g = (1.2 / (1 + tms / 12)) * (r() < 0.5 ? -1 : 1) * (c === (k & 1) ? 1 : 0.55);
      d[idx] += g; d[idx + 1] += g * 0.45; d[idx + 2] += g * 0.15;
    }
    if (z.flut) { // écho flottant : allers-retours entre deux parois parallèles, de plus en plus ternes
      const [dt, cnt2, fb] = z.flut; let g = 0.7;
      for (let k = 1; k <= cnt2; k++) {
        const idx = Math.round((dt * k + (c ? 0.0007 : 0)) * sr); if (idx >= n - 6) break;
        g *= fb; const s = k & 1 ? 1 : -1, wdt = 1 + Math.floor(k / 3);
        for (let q = 0; q < wdt + 2; q++) d[idx + q] += g * s * 0.5 / (wdt + 1);
      }
    }
    if (z.slap) for (let k = 0; k < z.slap.length; k += 2) { // façades lointaines
      const idx = Math.round((z.slap[k] + c * 0.004) * sr);
      if (idx < n - 64) for (let q = 0; q < 48; q++) d[idx + q] += z.slap[k + 1] * (r() * 2 - 1) * Math.exp(-q / 10);
    }
    if (z.comb) { // tôle de gaine : peignes résonants, puis on recontraint la décroissance
      for (const f of z.comb) { const D = Math.max(1, Math.round(sr / f)); for (let i = D; i < n; i++) d[i] += 0.86 * d[i - D]; }
      const k = Math.exp(-6.9078 / (z.rt * sr)); let e = 1; for (let i = 0; i < n; i++) { d[i] *= e; e *= k; }
    }
    const f = Math.min(n, Math.round(0.03 * sr)); for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f;
    for (let i = 0; i < n; i++) E += d[i] * d[i];
  }
  const g = E > 0 ? 1 / Math.sqrt(E / 2) : 0;
  for (const d of ch) for (let i = 0; i < n; i++) d[i] *= g;
  return ch;
}

// ───────────────────────────── synthèse d'une variante ─────────────────────────────
// Canaux normalisés (crête pour les ponctuels, niveau efficace pour les boucles). Fonction pure :
// exécutée par le worker de synthèse, ou sur le fil principal en repli.
function synth(name, def, k, sr) {
  const ch = def.ch || 1, loop = !!def.loop, dur = typeof def.d === 'function' ? def.d(k) : def.d || 1, data = [];
  for (let c = 0; c < ch; c++) {
    const B = new Buf(sr, dur, (hash(name) ^ Math.imul(k + 1, 0x9E3779B1) ^ Math.imul(c + 1, 0x85EBCA6B)) >>> 0, loop);
    B.v = k; B.c = c;
    try { def.r(B, def); } catch (e) { warnOnce('r:' + name, 'synthèse impossible :', name, e); }
    data.push(B.d);
  }
  const n = data[0].length; let pk = 0, ss = 0;
  for (const d of data) {
    op1(d, sr, 15, true, loop); // composante continue, infrasons
    if (!loop) { const f = Math.min(n, Math.round(0.004 * sr)); for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f; }
    for (let i = 0; i < n; i++) { const x = d[i]; if (x !== x) { d[i] = 0; continue; } const ax = x < 0 ? -x : x; if (ax > pk) pk = ax; ss += x * x; }
  }
  const rms = Math.sqrt(ss / (n * ch));
  const pt = Array.isArray(def.pk) ? def.pk[k] ?? 0.9 : def.pk ?? 0.9; // crête visée (par variante : équilibre des sonies)
  const gn = pk > 1e-9 ? (loop ? Math.min(0.95 / pk, (def.rms ?? 0.22) / Math.max(rms, 1e-9)) : pt / pk) : 0;
  for (const d of data) for (let i = 0; i < n; i++) d[i] *= gn;
  return data;
}

// ───────────────────────────── moteur ─────────────────────────────
const RATES = { M: 32000, L: 22050, V: 16000 };
const BUSES = ['sfx', 'music', 'ambience', 'voice', 'ui']; // + 'pa' (sonorisation du centre, chaîne dédiée : Engine.buildPA)
// sono : haut-parleurs du plafond à des distances différentes : retard (s), niveau, panoramique, passe-bas (air ; 0 = aucun)
const PA_TAPS = [[0.011, 1, -0.1, 0], [0.019, 0.62, 0.32, 4200], [0.032, 0.45, -0.36, 3600], [0.045, 0.33, 0.16, 3000], [0.058, 0.24, -0.04, 2500]];
const PA_DRY = 0.35, PA_WET = 0.4; // calibrés : même sonie que le bus musique direct pour une musique ordinaire
const WORLD_2D = { sfx: 1, ambience: 1, voice: 1 }; // bus 2D « diégétiques » soumis à l'étouffement (musique 2D et UI y échappent : baladeur, interface)
const SEND_2D = { sfx: 0.16, voice: 0.2 };          // réverbération des sons 2D du joueur (ses propres gestes sonnent dans la pièce)
const OCC_CUT = [20000, 2500, 900, 400];            // coupure du passe-bas selon le nombre de murs
const REV = 0.5, MAX_SHOTS = 48, MAX_HRTF = 6, OCC_BUDGET = 10, MEM_LIMIT = 40e6;
// même son joué par plusieurs sources : au plus CAP_LOOP boucles spatialisées audibles (les plus audibles ; les autres se
// taisent en fondu et reviennent si l'on s'approche), au plus CAP_SHOT ponctuels simultanés, une seule boucle 2D (def.cap :
// réglage par son)
const CAP_LOOP = 3, CAP_SHOT = 4;
const INSTR = { piano: 1, guitar: 1, xylo: 1, bell: 1, organ: 1, synth: 1, musicbox: 1 };
const DRUMS = { kick: 1, snare: 1, hat: 1, tom: 1, crash: 1 };
const DTMF = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], A: [697, 1633], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], B: [770, 1633], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], C: [852, 1633], '*': [941, 1209], 0: [941, 1336], '#': [941, 1477], D: [941, 1633] };
// préchargés en tâche de fond juste après init (le premier pas ne doit pas attendre la synthèse)
const PREWARM = ['step_tile', 'step_concrete', 'step_carpet', 'step_metal', 'step_vent', 'step_wood', 'step_heels', 'step_sneakers', 'step_grass', 'land',
  'switch', 'button', 'beep', 'flashlight_click', 'cloth', 'paper', 'camera_switch', 'relay', 'pickup', 'drop', 'throw', 'tick',
  'hit_plastic', 'hit_metal', 'hit_wood', 'hit_glass', 'hit_cardboard', 'hit_soft', 'hit_paper', 'hit_can', 'hit_ceramic', 'hit_body',
  'door_open', 'door_close', 'door_slam', 'door_creak', 'eat_soft', 'eat_crunch', 'hvac', 'fluorescent_buzz', 'electric_hum', '_lub', '_dub', 'breath'];
const CORE = new Set(PREWARM);
const PREWARM2 = ['_mb84', '_mb86', '_mb88', '_mb83', '_mb81', '_mb79', '_mb76', '_mb74', '_mb72', '_mb69', '_mb67', 'error', 'success', 'static_burst',
  'phone_pickup', 'phone_hangup', 'phone_ring', 'dial_tone', 'ringback', 'busy_tone', 'knock', 'knock_triple', 'creak', 'whisper', 'thud', 'jumpscare', 'stinger', 'low_boom',
  'neon_flicker', 'vent_grate', 'footstep_heavy', 'glass_break', 'scream', 'giggle', 'vent_bang', 'door_locked', 'breaker', 'power_down', 'power_up', '_fire_pop', 'escalator', '_rt_low', '_rt_air', '_rt_swell'];

const dummy = () => ({ playing: false, setPos() { }, setVolume() { }, setParam() { }, stop() { } });
const mkGain = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
function hold(p, t) { // fige la valeur courante (annule les automatismes futurs)
  try { if (p.cancelAndHoldAtTime) { p.cancelAndHoldAtTime(t); return; } } catch (e) { /* repli ci-dessous */ }
  const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t);
}
// fondu exponentiel : un nouvel appel reprend simplement depuis la valeur courante (aucun conflit d'automatismes)
function fadeTo(p, v, t, d) { p.setTargetAtTime(v, t, Math.max(0.005, d / 3)); }
function setPannerPos(p, v) { if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z); }
function wallCut(w) { if (w <= 0) return 20000; if (w >= 3) return 400; const i = Math.floor(w), f = w - i; return Math.exp(Math.log(OCC_CUT[i]) * (1 - f) + Math.log(OCC_CUT[i + 1]) * f); }

// Une voix = une source (tampon, graphe temps réel, ou entrée externe) et sa chaîne :
//   2D      : source → g → [passe-bas d'intensité] → bus (+ envoi réverbération)
//   spatial : source → g → passe-bas (occlusion/intensité) → d (murs, portée) → panner HRTF → bus
//                                                        ↘ s (envoi selon distance et murs) → réverbération
class Voice {
  constructor(E, name, def, o, mode) {
    const ctx = E.ctx;
    this.E = E; this.name = name; this.def = def; this.mode = mode; this.alive = true; this.stopping = false;
    this.t0 = ctx.currentTime; this.endAt = 0; this.src = null; this.ctl = null; this.P = null; this.rg = 1; this.culled = false; this.capped = false;
    this.bus = E.bus[o.bus] ? o.bus : def.bus && E.bus[def.bus] ? def.bus : 'sfx';
    if (this.bus === 'pa') E.paUse();
    const p = vec(o.pos);
    this.sp = !!p && this.bus !== 'ui' && this.bus !== 'pa'; // interface, sono : jamais spatialisées
    this.pos = this.sp ? p : null;
    this.ref = Math.max(0.1, num(+o.ref, def.ref ?? 2)); this.maxD = Math.max(this.ref, num(+o.maxDist, def.md ?? 60));
    this.occ = this.sp && o.occlude !== false; this.walls = 0; this.occT = -1;
    this.vol = Math.max(0, num(+o.volume, 1));
    const it = typeof o.intensity === 'number' && isFinite(o.intensity) ? clamp(o.intensity, 0, 1) : def.ivol ? clamp(this.vol, 0, 1) : null;
    this.it = it;
    this.base = num(def.g, 0.8) * (it == null ? 1 : 0.55 + 0.45 * it);       // plus fort…
    this.cut0 = it == null || it > 0.97 ? 20000 : 1500 * Math.pow(13.3, it); // …et plus brillant
    this.g = mkGain(ctx, 0);
    let tail = this.g;
    if (this.sp || this.cut0 < 19000) { this.f = ctx.createBiquadFilter(); this.f.type = 'lowpass'; this.f.Q.value = 0.55; this.f.frequency.value = this.cut0; tail.connect(this.f); tail = this.f; }
    const B = E.bus[this.bus];
    if (this.sp) {
      this.d = mkGain(ctx, 1); this.p = ctx.createPanner();
      this.hr = false; this.aud = 0; this.dist = 0; // HRTF attribué par le moteur aux sources les plus audibles
      this.p.panningModel = 'equalpower'; this.p.distanceModel = 'inverse';
      this.p.refDistance = this.ref; this.p.maxDistance = Math.max(10000, this.maxD); this.p.rolloffFactor = def.roll ?? 1;
      setPannerPos(this.p, p);
      tail.connect(this.d); this.d.connect(this.p); this.p.connect(B.sp);
      this.s = mkGain(ctx, 0); tail.connect(this.s); this.s.connect(B.rv);
      if (this.occ) { const w = E.occlude(p); if (w == null) E.occQ.push(this); else { this.walls = w; this.occT = ctx.currentTime; } }
      this.place(true);
      E.grantHRTF(this);
    } else {
      tail.connect(B.d2);
      const s2 = num(+o.send, this.bus === 'ui' ? 0 : (SEND_2D[this.bus] || 0) * (def.rev ?? 1));
      if (s2 > 0) { this.s = mkGain(ctx, s2); tail.connect(this.s); this.s.connect(B.rv); }
    }
  }
  // distance, murs, envoi réverbération (à la création, puis à chaque update)
  place(now) {
    const L = this.E.lis, P = this.pos, t = this.E.ctx.currentTime;
    const dist = Math.hypot(P.x - L.x, P.y - L.y, P.z - L.z), w = this.occ ? this.walls : 0;
    const culled = this.mode !== 'shot' && dist > this.maxD; // continu hors de portée : muet mais conservé
    const cut = Math.min(this.cut0, wallCut(w)), dry = culled ? 0 : Math.pow(10, -0.2 * w); // −4 dB par mur
    const r = this.ref, roll = this.def.roll ?? 1;
    this.dist = dist; this.aud = this.stopping ? 0 : this.vol * this.base * dry * (dist <= r ? 1 : r / (r + roll * (dist - r)));
    // le champ réverbéré décroît bien moins vite que le direct ; derrière des murs : plus de réverbération, moins de direct
    const send = culled ? 0 : REV * (this.def.rev ?? 1) * this.ref / (this.ref + 0.15 * Math.max(0, dist - this.ref)) * Math.pow(10, -0.075 * w) * (1 + 0.12 * w);
    this.culled = culled;
    // plafond du nombre d'instances (muet, l'audibilité continue d'être calculée) ; boucles des appareils : baissées
    // pendant qu'un personnage parle (Engine.duck)
    const mute = this.capped ? 0 : 1, dk = this.mode === 'loop' && this.bus !== 'voice' && this.bus !== 'music' ? this.E.duckK : 1, tc = this.lcap !== this.capped ? 0.15 : 0.08;
    const dd = dry * mute * dk, ss = send * mute; this.lcap = this.capped;
    if (now) { this.f.frequency.value = cut; this.d.gain.value = dd; this.s.gain.value = ss; this.lc = cut; this.ld = dd; this.ls = ss; return; }
    if (Math.abs(cut - this.lc) > this.lc * 0.03) { smooth(this.f.frequency, cut, t, 0.08); this.lc = cut; }
    if (Math.abs(dd - this.ld) > 0.01 || (dd === 0 && this.ld !== 0)) { smooth(this.d.gain, dd, t, tc); this.ld = dd; }
    if (Math.abs(ss - this.ls) > Math.max(0.004, this.ls * 0.05) || (ss === 0 && this.ls !== 0)) { smooth(this.s.gain, ss, t, tc + 0.04); this.ls = ss; }
  }
  setCapped(on, born) { // trop d'instances de ce son : celle-ci se tait (fondu), sans s'arrêter ; née muette : sans fondu
    if (this.capped === on || !this.alive) return; this.capped = on;
    const t = this.E.ctx.currentTime;
    if (born && on) { if (this.sp) { this.d.gain.value = 0; this.s.gain.value = 0; this.ld = 0; this.ls = 0; this.lcap = true; } else { hold(this.g.gain, t); this.g.gain.setValueAtTime(0, t); } return; }
    if (!this.sp) smooth(this.g.gain, on ? 0 : this.vol * this.base * this.rg, t, 0.15); else this.place(false);
  }
  startBuf(buf, rate, loop, offset, when) {
    const s = this.E.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.loop = !!loop;
    s.connect(this.g); s.start(when, offset || 0); this.src = s;
    if (!loop) { s.onended = () => this.end(); this.endAt = when + buf.duration / rate + 0.5; }
  }
  fadeIn(when, tc = 0.03) { const g = this.g.gain; g.setValueAtTime(0, when); g.setTargetAtTime(this.capped && !this.sp ? 0 : this.vol * this.base * this.rg, when, tc); }
  stopAt(t, fade) { // arrêt programmé (son continu joué en ponctuel, note tenue)
    this.g.gain.setTargetAtTime(0, t, fade / 4);
    const end = t + fade + 0.05;
    try { this.src && this.src.stop(end); } catch (e) { /* */ }
    try { this.ctl && this.ctl.stop(end); } catch (e) { /* */ }
    this.endAt = end + 0.1;
  }
  setPos(p) {
    if (!this.alive || !this.sp) return; const v = vec(p); if (!v) return;
    const P = this.pos, dx = v.x - P.x, dy = v.y - P.y, dz = v.z - P.z, d2 = dx * dx + dy * dy + dz * dz, t = perfNow() / 1000;
    if (this.pt) { const dt = t - this.pt; if (dt > 0.005) { const sp = Math.sqrt(d2) / dt; this.vel = this.vel == null ? sp : this.vel + (sp - this.vel) * Math.min(1, dt * 6); this.pt = t; } } else this.pt = t;
    if (d2 < 1e-6) return;
    P.x = v.x; P.y = v.y; P.z = v.z; setPannerPos(this.p, P);
  }
  setVolume(v, ramp = 0.1) {
    if (!this.alive || this.stopping) return;
    v = Math.max(0, num(+v, this.vol)); if (Math.abs(v - this.vol) < 1e-4) return;
    this.vol = v; smooth(this.g.gain, this.capped && !this.sp ? 0 : v * this.base * this.rg, this.E.ctx.currentTime, Math.max(0.004, num(+ramp, 0.1) / 3));
  }
  setParam(k, v) {
    if (!this.alive) return;
    if (this.P) {
      const old = this.P[k];
      if (old === v || (typeof v === 'number' && typeof old === 'number' && Math.abs(v - old) < Math.max(0.005, Math.abs(old) * 0.005))) return; // dérive infime : ignorée
      this.P[k] = v; try { this.ctl && this.ctl.set(k, v); } catch (e) { warnOnce('set:' + this.name, 'paramètre refusé', this.name, k, e); } }
    else if ((k === 'pitch' || k === 'rate') && this.src && this.src.loop) smooth(this.src.playbackRate, clamp(num(+v, 1), 0.1, 8), this.E.ctx.currentTime, 0.05);
  }
  stop(fade = 0.2) {
    if (!this.alive || this.stopping) return; this.stopping = true;
    const t = this.E.ctx.currentTime; fade = clamp(num(+fade, 0.2), 0.005, 30);
    const g = this.g.gain; hold(g, t); g.linearRampToValueAtTime(0, t + fade);
    const end = t + fade + 0.02;
    try { this.src && this.src.stop(end); } catch (e) { /* déjà arrêtée */ }
    try { this.ctl && this.ctl.stop(end); } catch (e) { /* */ }
    this.endAt = end + 0.1;
  }
  end() {
    if (!this.alive) return; this.alive = false; this.stopping = true;
    if (this.src) { this.src.onended = null; try { this.src.stop(); } catch (e) { /* déjà arrêtée */ } }
    for (const n of [this.src, this.g, this.f, this.d, this.p, this.s]) if (n) try { n.disconnect(); } catch (e) { /* */ }
    try { this.ctl && this.ctl.dispose(); } catch (e) { /* */ }
    if (this.hr) { this.E.hrtf--; this.hr = false; }
    this.E.remove(this);
  }
}
class Handle {
  constructor(v) { this._v = v; }
  get playing() { const v = this._v; return !!(v && v.alive && !v.stopping); }
  setPos(p) { try { this._v.setPos(p); } catch (e) { /* */ } return this; }
  setVolume(x, ramp) { try { this._v.setVolume(x, ramp); } catch (e) { /* */ } return this; }
  setParam(k, x) { try { this._v.setParam(k, x); } catch (e) { /* */ } return this; }
  stop(fade) { try { this._v.stop(fade); } catch (e) { /* */ } }
}

class Engine {
  constructor(opts) {
    const AC = window.AudioContext || window.webkitAudioContext;
    // tampon de sortie « équilibré » plutôt qu'« interactif » : quelques ms de latence en plus, mais le fil audio ne
    // manque plus d'échantillons (craquements) quand la machine est chargée
    const ctx = this.ctx = opts.context || new AC({ latencyHint: 'balanced' });
    this.sr = ctx.sampleRate;
    this.voices = new Set(); this.spatial = []; this.rr = 0; this.budget = OCC_BUDGET; this.occFn = null; this.occCache = new Map(); this.occQ = [];
    this.cache = new Map(); this.mem = 0; this.hrtf = 0; this.shots = 0; this.last = new Map(); this.lastK = new Map(); this.bg = []; this.queued = new Set(); this.bgBusy = false; this.waiters = new Map(); this.inflight = new Map(); this.wseq = 0; this.worker = null;
    this.lis = { x: 0, y: 0, z: 0, set: false }; this.lo = [0, 0, -1, 0, 1, 0]; this.waves = new Map(); this.curves = new Map(); this.irs = new Map();
    // chaîne maître : bus → (monde → étouffement) → maître → limiteur doux → sortie
    const comp = this.comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = mkGain(ctx, 1); this.master.connect(comp);
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.6; this.muffle.connect(this.master);
    this.world = mkGain(ctx, 1); this.world.connect(this.muffle);
    // réverbération : un convolueur par lieu récent (LRU), fondus enchaînés entre lieux
    this.revIn = mkGain(ctx, 1); this.revs = new Map(); this.zone = null; this.active = null;
    this.bus = {};
    // atténuation passagère de l'ambiance (quelqu'un parle, un événement important) : étage dédié du bus « ambience »
    this.duckA = mkGain(ctx, 1); this.duckA.connect(this.world); this.duckK = 1; this.duckD = 0; this.duckEnd = 0;
    for (const b of BUSES) {
      const d2 = mkGain(ctx, 1), sp = mkGain(ctx, 1), rv = mkGain(ctx, 1), dst = b === 'ambience' ? this.duckA : this.world;
      d2.connect(WORLD_2D[b] ? dst : this.master); sp.connect(dst); rv.connect(this.revIn);
      this.bus[b] = { d2, sp, rv };
    }
    this.buildPA();
    this.pumpT = setInterval(() => { try { this.pump(); this.watchdog(); } catch (e) { /* */ } }, 50);
    this.startWorker();
    this.prewarm();
  }
  resume() { // les navigateurs suspendent l'audio tant qu'il n'y a pas eu de geste : on réessaie à chaque interaction
    const ctx = this.ctx;
    if (!ctx.resume || (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext)) return;
    const go = () => { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => { }); } catch (e) { /* */ } };
    if (ctx.state === 'suspended') go();
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    const evs = ['pointerdown', 'keydown', 'touchstart'];
    const h = () => { if (ctx.state === 'running') { for (const e of evs) window.removeEventListener(e, h, true); this.listening = false; return; } go(); };
    for (const e of evs) window.addEventListener(e, h, true);
  }

  // ── tampons : synthèse paresseuse (worker de synthèse si possible), cache LRU borné en mémoire ──
  srOf(def) { return def.sr === 'H' ? this.sr : Math.min(this.sr, RATES[def.sr] || RATES.M); }
  cached(name, k) { const e = this.cache.get(name), b = e && e.b[k]; if (b) e.t = perfNow(); return b || null; }
  store(name, k, b) {
    let e = this.cache.get(name);
    if (!e) { e = { b: [], bytes: 0, t: 0 }; this.cache.set(name, e); }
    if (!e.b[k]) {
      e.b[k] = b; e.t = perfNow();
      const by = b.length * b.numberOfChannels * 4; e.bytes += by; this.mem += by;
      if (this.mem > MEM_LIMIT) this.evict(name);
    }
    this.done(name + '|' + k, e.b[k]);
    return e.b[k];
  }
  buf(name, k = 0) { // synchrone (sons ponctuels : latence nulle ; ils sont courts)
    const def = SND[name]; if (!def || def.graph) return this.silence();
    k = clamp(k | 0, 0, (def.v || 1) - 1);
    const b = this.cached(name, k); if (b) return b;
    const sr = this.srOf(def); return this.store(name, k, this.toBuffer(synth(name, def, k, sr), sr));
  }
  bufAsync(name, k, cb) { // asynchrone (boucles, graphes) : rien ne bloque le jeu quand le worker est là
    const def = SND[name]; if (!def || def.graph) return;
    k = clamp(k | 0, 0, (def.v || 1) - 1);
    const b = this.cached(name, k); if (b) { cb(b); return; }
    if (!this.worker) { cb(this.buf(name, k)); return; }
    const key = name + '|' + k; let w = this.waiters.get(key); if (!w) this.waiters.set(key, (w = [])); w.push(cb);
    this.queue(key, true);
  }
  bufIfReady(name, k = 0) { // prêt, sinon demandé en priorité (jamais de blocage dans un séquenceur)
    const def = SND[name]; if (!def || def.graph) return null;
    k = clamp(k | 0, 0, (def.v || 1) - 1);
    const b = this.cached(name, k); if (b) return b;
    this.queue(name + '|' + k, true); return null;
  }
  done(key, b) { const w = this.waiters.get(key); if (!w) return; this.waiters.delete(key); for (const cb of w) { try { cb(b); } catch (e) { warnOnce('cb:' + key, e); } } }
  silence() { return this._sil || (this._sil = this.ctx.createBuffer(1, 128, this.sr)); }
  evict(keep) { // les sons essentiels (pas, impacts, interface) ne sont jamais évincés
    const list = [...this.cache.entries()].filter(([n]) => n !== keep && !CORE.has(n)).sort((a, b) => a[1].t - b[1].t);
    for (const [n, e] of list) { if (this.mem <= MEM_LIMIT * 0.75) break; this.mem -= e.bytes; this.cache.delete(n); }
  }
  toBuffer(data, sr) {
    const ch = data.length, n = data[0].length;
    try {
      const buf = this.ctx.createBuffer(ch, n, sr);
      for (let c = 0; c < ch; c++) buf.getChannelData(c).set(data[c]);
      return buf;
    } catch (e) { // cadence refusée par le navigateur : rééchantillonnage linéaire
      const q = this.sr / sr, m = Math.max(1, Math.round(n * q)), buf = this.ctx.createBuffer(ch, m, this.sr);
      for (let c = 0; c < ch; c++) { const d = data[c], o = buf.getChannelData(c); for (let i = 0; i < m; i++) { const x = i / q, j = Math.floor(x), f = x - j; o[i] = (d[j] || 0) * (1 - f) + (d[j + 1] || 0) * f; } }
      return buf;
    }
  }
  noiseBuf() { // bruit blanc stéréo partagé par les graphes temps réel (normalement livré par le worker)
    if (this._nz) return this._nz;
    const n = Math.round(4 * this.sr), b = this.ctx.createBuffer(2, n, this.sr), r = mulberry(0xC0FFEE);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * 0.7; }
    return (this._nz = b);
  }
  wave(name) { // formes d'onde périodiques (moteurs, orgue)
    let w = this.waves.get(name); if (w) return w;
    const N = name === 'petrol' ? 40 : name === 'organ' ? 16 : name === 'half' ? 20 : 24, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    if (name === 'organ') { const dr = { 1: 0.8, 2: 1, 3: 0.8, 4: 0.45, 6: 0.3, 8: 0.25, 10: 0.1, 12: 0.1, 16: 0.08 }; for (const k in dr) im[k] = dr[k]; } // tirettes 88 8000 000 environ
    else { const e = name === 'diesel' ? 0.35 : name === 'petrol' ? 0.6 : 0.9; for (let k = 1; k <= N; k++) re[k] = 1 / Math.pow(k, e); } // trains d'impulsions
    w = this.ctx.createPeriodicWave(re, im); this.waves.set(name, w); return w;
  }
  curve(name) {
    let c = this.curves.get(name); if (c) return c;
    if (name === 'pa') { // petit ampli, asymétrique (harmoniques paires) ; longueur impaire : 0 → exactement 0, sinon la
      c = new Float32Array(1025); // chaîne entière (convolution comprise) calculerait sans fin même au repos (plus de silence propagé)
      for (let i = 0; i < 1025; i++) { const x = i / 512 - 1; c[i] = Math.tanh(1.6 * (x + 0.15 * x * x)) / Math.tanh(1.84); }
      c[512] = 0; this.curves.set(name, c); return c;
    }
    c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = name === 'peaks' ? Math.pow(Math.max(0, x), 4) : Math.tanh(x * 2.5) / Math.tanh(2.5); }
    this.curves.set(name, c); return c;
  }
  ir(type) { let b = this.irs.get(type); if (!b) { b = this.toBuffer(irData(ZONES[type], hash('ir:' + type), this.sr), this.sr); this.irs.set(type, b); } return b; }
  // ── synthèse de fond : worker dédié (même module), sinon temps morts du fil principal ──
  startWorker() {
    if (typeof Worker === 'undefined' || this.noWorker) return;
    try {
      const w = new Worker(new URL(import.meta.url), { type: 'module', name: 'synthese-audio' });
      w.onmessage = (e) => this.fromWorker(e.data || {});
      w.onerror = (e) => { try { e.preventDefault(); } catch (x) { /* */ } this.killWorker('erreur'); };
      this.worker = w;
    } catch (e) { this.worker = null; }
  }
  killWorker(why) {
    if (!this.worker) return;
    try { this.worker.terminate(); } catch (e) { /* */ }
    this.worker = null; this.noWorker = true;
    warnOnce('worker', 'worker de synthèse indisponible (' + why + ') : calcul sur le fil principal');
    for (const x of this.inflight.values()) { this.queued.add(x.it); this.bg.unshift(x.it); }
    this.inflight.clear(); this.bgBusy = false; this.kick();
  }
  watchdog() { // worker muet trop longtemps : repli sur le fil principal (sans compter les moments où c'est le jeu qui bloquait)
    const t = perfNow(), gap = t - (this.lastWd || t); this.lastWd = t;
    if (gap > 500) { for (const x of this.inflight.values()) x.t += gap; return; }
    for (const x of this.inflight.values()) if (t - x.t > 8000) { this.killWorker('délai dépassé'); return; }
  }
  fromWorker(m) {
    const x = this.inflight.get(m.id); if (!x) return; this.inflight.delete(m.id);
    const it = x.it;
    try {
      if (it === '#noise') { if (!this._nz && m.data) this._nz = this.toBuffer(m.data, m.sr); }
      else if (it[0] === '#') { const z = it.slice(1); if (!this.irs.has(z)) this.irs.set(z, m.data ? this.toBuffer(m.data, m.sr) : this.toBuffer(irData(ZONES[z], hash('ir:' + z), this.sr), this.sr)); this.done(it, this.irs.get(z)); }
      else { const j = it.lastIndexOf('|'), name = it.slice(0, j), k = +it.slice(j + 1); if (m.data && !this.cached(name, k)) this.store(name, k, this.toBuffer(m.data, m.sr)); else this.buf(name, k); }
    } catch (e) { warnOnce('wmsg', 'réponse du worker inutilisable', e); }
    this.kick();
  }
  queue(item, front = false) {
    if (this.queued.has(item)) { if (front) { const i = this.bg.indexOf(item); if (i > 0) { this.bg.splice(i, 1); this.bg.unshift(item); } } return; }
    this.queued.add(item); if (front) this.bg.unshift(item); else this.bg.push(item);
    this.kick();
  }
  run(it) { if (it === '#noise') this.noiseBuf(); else if (it[0] === '#') this.done(it, this.ir(it.slice(1))); else { const j = it.lastIndexOf('|'); this.buf(it.slice(0, j), +it.slice(j + 1)); } }
  kick() {
    if (this.worker) {
      while (this.inflight.size < 2 && this.bg.length) {
        const it = this.bg.shift(); this.queued.delete(it);
        let name = it, k = 0, sr = this.sr;
        if (it === '#noise') { if (this._nz) continue; }
        else if (it[0] === '#') { const z = it.slice(1); if (this.irs.has(z)) { this.done(it, this.irs.get(z)); continue; } }
        else {
          const j = it.lastIndexOf('|'); name = it.slice(0, j); k = +it.slice(j + 1);
          const def = SND[name], b = this.cached(name, k);
          if (b) { this.done(it, b); continue; }
          if (!def || def.graph) continue;
          sr = this.srOf(def);
        }
        const id = ++this.wseq; this.inflight.set(id, { it, t: perfNow() });
        try { this.worker.postMessage({ id, name, k, sr }); } catch (e) { this.killWorker('envoi'); return; }
      }
      return;
    }
    if (this.bgBusy || !this.bg.length) return; this.bgBusy = true;
    const step = (dl) => {
      const t0 = perfNow(), budget = dl && !dl.didTimeout && dl.timeRemaining ? Math.max(2, dl.timeRemaining() - 1) : 8;
      do { const it = this.bg.shift(); this.queued.delete(it); try { this.run(it); } catch (e) { /* synthèse à la demande */ } } while (this.bg.length && perfNow() - t0 < budget);
      if (this.bg.length) sched(); else this.bgBusy = false;
    };
    const sched = () => (typeof requestIdleCallback === 'function' ? requestIdleCallback(step, { timeout: 1000 }) : setTimeout(step, 30));
    setTimeout(sched, 30);
  }
  prewarm() {
    const add = (list, all) => { for (const n of list) { const d = SND[n]; if (!d || d.graph) continue; for (let k = all ? 1 : 0; k < (all ? d.v || 1 : 1); k++) this.queue(n + '|' + k); } };
    this.queue('#corridor'); this.queue('#noise'); add(PREWARM, false);
    for (const z in ZONES) if (!ZONES[z].lazy) this.queue('#' + z);
    add(PREWARM, true); add(PREWARM2, false); add(PREWARM2, true);
  }

  // ── lecture ──
  pickVariant(def, name, it) {
    const n = def.v || 1; if (n === 1) return 0;
    let a = 0, b = n;
    if (def.split) { if (it != null && it >= 0.8) a = def.split; else b = def.split; }
    const last = this.lastK.get(name); let k = a + Math.floor(Math.random() * (b - a));
    if (k === last && b - a > 1) k = a + ((k - a + 1) % (b - a)); // jamais deux fois la même variante d'affilée
    this.lastK.set(name, k); return k;
  }
  play(name, o, loop) {
    o = o && typeof o === 'object' ? o : {};
    const def = SND[name];
    if (!def) { warnOnce('unk:' + name, `son inconnu : « ${name} »`); if (!loop) this.play('tick', { pos: o.pos, bus: o.bus, volume: num(+o.volume, 1) * 0.3 }, false); return dummy(); }
    const ctx = this.ctx;
    if (!loop && ctx.state !== 'running') return dummy(); // contexte suspendu : pas d'avalanche à la reprise
    const p = vec(o.pos), sp = !!p && o.bus !== 'ui' && o.bus !== 'pa', t = ctx.currentTime;
    let est = -1; // audibilité estimée d'un ponctuel spatialisé (plafond, atténuation de l'ambiance)
    if (sp && !loop) {
      const L = this.lis, d = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z);
      if (d > num(+o.maxDist, def.md ?? 60) * 1.1) return dummy(); // trop loin : on ne joue même pas
      const r = Math.max(0.1, num(+o.ref, def.ref ?? 2)); est = Math.max(0, num(+o.volume, 1)) * num(def.g, 0.8) * (d <= r ? 1 : r / (r + (def.roll ?? 1) * (d - r)));
      const cap = def.cap ?? CAP_SHOT; let n = 0, low = null;
      for (const x of this.voices) if (x.shot && x.sp && x.name === name && !x.stopping) { n++; if (!low || x.aud < low.aud) low = x; }
      if (n >= cap) { if (low && est > low.aud * 1.2) low.stop(0.04); else return dummy(); } // trop d'instances : la plus discrète cède, ou celle-ci ne part pas
    }
    if (!loop) { // anti-doublon (rafales d'impacts physiques)
      const l = this.last.get(name);
      if (l && t - l.t < 0.015 && (!p || !l.p || Math.hypot(p.x - l.p.x, p.y - l.p.y, p.z - l.p.z) < 0.5)) return dummy();
      this.last.set(name, { t, p });
      if (this.shots >= MAX_SHOTS) this.steal();
    }
    const when = Math.max(t, num(+o.when, 0)), pitch = clamp(num(+o.pitch, 1), 0.05, 16);
    const v = new Voice(this, name, def, o, loop ? 'loop' : 'shot');
    try {
      if (def.graph) {
        v.P = { ...(def.param || {}) };
        for (const k in v.P) if (o[k] !== undefined) v.P[k] = o[k];
        if (o.param && typeof o.param === 'object') Object.assign(v.P, o.param);
        v.ctl = def.graph(this, v.g, v.P, pitch, v, when, name);
        v.fadeIn(when, 0.02);
        if (!loop) v.stopAt(when + (v.ctl.dur ?? def.os ?? 2.5), 0.4);
      } else if (def.loop) {
        const go = (buf, at) => {
          if (!v.alive || v.stopping) return;
          v.startBuf(buf, pitch, true, def.o0 ? 0 : Math.random() * buf.duration, at); // cadences, mélodies : depuis le début
          v.fadeIn(at, loop ? 0.03 : 0.01);
          if (def.start) { const s = ctx.createBufferSource(); s.buffer = this.buf(def.start, 0); s.playbackRate.value = pitch; s.connect(v.g); s.start(at); s.onended = () => { try { s.disconnect(); } catch (e) { /* */ } }; }
          if (!loop) v.stopAt(at + (def.os ?? 2.5), 0.3);
        };
        const b = this.cached(name, 0);
        if (b) go(b, when); else { v.endAt = loop ? 0 : when + 12; this.bufAsync(name, 0, (buf) => go(buf, Math.max(when, ctx.currentTime))); }
      } else if (loop) {
        v.ctl = gRepeat(this, v.g, {}, pitch, v, when, name);
        v.fadeIn(when, 0.02);
      } else {
        const k = this.pickVariant(def, name, v.it), b = this.cached(name, k), jit = def.jit ?? ((def.v || 1) > 1 ? 0.035 : 0.015);
        const rate = pitch * (1 + (Math.random() * 2 - 1) * jit);
        v.rg = jit === 0 ? 1 : 0.84 + Math.random() * 0.3; // ±1,5 dB : deux pas ne sonnent jamais pareil
        v.g.gain.value = v.vol * v.base * v.rg;
        v.shot = true; this.shots++;
        const go = (buf, at) => { v.startBuf(buf, rate, false, 0, at); if (o._dur > 0) v.stopAt(at + o._dur, 0.25); };
        if (b || !this.worker) go(b || this.buf(name, k), when);
        else { // pas encore synthétisé : le worker le calcule (≈10-40 ms), joué dès réception plutôt qu'un gel de l'image
          const t0 = Math.max(when, ctx.currentTime), late = clamp(num(+o.late, 0.6), 0, 10); v.endAt = t0 + 3 + late; // late : retard toléré (bruits d'ambiance)
          this.bufAsync(name, k, (buf) => { if (!v.alive || v.stopping) return; const at = Math.max(when, ctx.currentTime); if (at - t0 > late) { v.end(); return; } go(buf, at); });
        }
      }
    } catch (e) { warnOnce('play:' + name, 'échec de lecture :', name, e); v.end(); return dummy(); }
    this.voices.add(v); if (v.sp) this.spatial.push(v);
    if (loop) { const a = []; for (const x of this.voices) if (x.mode === 'loop' && x.name === name && x.sp === v.sp && x.alive && !x.stopping) a.push(x); if (a.length > 1) this.capList(a, v); }
    if (def.duck && (sp ? est : v.vol * v.base) > 0.25) this.duck(def.duck, def.dkT ?? 1.5); // événement important : l'ambiance s'efface un instant
    if (v.ctl && v.ctl.tick) { try { v.ctl.tick(t, t + 0.3); } catch (e) { /* */ } }
    return new Handle(v);
  }
  // HRTF (coûteux pour le fil audio) : réservé aux sons ponctuels audibles (pas, impacts, présences), au plus MAX_HRTF
  // à la fois, choisi à la naissance de la voix et gardé jusqu'à sa fin. Jamais de bascule de modèle sur une voix qui
  // joue : changer panningModel en cours de lecture fait claquer le son (saut de retard et de phase).
  setHR(v, on) {
    if (v.hr === on) return;
    try { v.p.panningModel = on ? 'HRTF' : 'equalpower'; } catch (e) { return; }
    v.hr = on; this.hrtf += on ? 1 : -1;
  }
  grantHRTF(v) {
    if (!v.sp || v.mode !== 'shot' || v.culled || v.capped || v.aud <= 1e-4 || this.hrtf >= MAX_HRTF) return;
    this.setHR(v, true);
  }
  freeHRTF(v) { if (v.hr) { v.hr = false; this.hrtf--; } } // fin de voix : la place se libère sans toucher au panner
  // plafond par son : parmi les boucles d'un même son (spatialisées : def.cap ?? CAP_LOOP ; 2D : une seule), les plus
  // audibles jouent, les autres se taisent en fondu ; hystérésis pour qu'elles ne s'échangent pas sans cesse
  capAll() {
    const G = new Map();
    for (const v of this.voices) { if (v.mode !== 'loop' || !v.alive || v.stopping) continue; const k = (v.sp ? 's|' : 'd|') + v.name; const a = G.get(k); if (a) a.push(v); else G.set(k, [v]); }
    for (const a of G.values()) if (a.length > 1 || a[0].capped) this.capList(a);
  }
  capList(a, born) {
    const cap = a[0].sp ? a[0].def.cap ?? CAP_LOOP : 1;
    if (a.length <= cap) { for (const v of a) v.setCapped(false); return; }
    const sc = (v) => (v.sp ? v.aud : v.vol * v.base) * (v.capped || v === born ? 1 : 1.3);
    a.sort((x, y) => sc(y) - sc(x)); a.forEach((v, i) => v.setCapped(i >= cap, v === born));
  }
  // atténuation passagère de l'ambiance et des boucles d'appareils (depth 0..0,9 pendant dur s ; les appels se cumulent)
  duck(depth, dur) {
    const t = this.ctx.currentTime; depth = clamp(num(+depth, 0.3), 0, 0.9); dur = clamp(num(+dur, 1), 0.05, 30);
    this.duckEnd = Math.max(this.duckEnd, t + dur);
    if (this.duckD && depth <= this.duckD) return;
    this.duckD = depth; this.duckK = 1 - depth; smooth(this.duckA.gain, this.duckK, t, 0.08);
  }
  steal() { // trop de sons ponctuels : on coupe le plus ancien
    let old = null; for (const v of this.voices) if (v.shot && !v.stopping && (!old || v.t0 < old.t0)) old = v;
    if (old) old.stop(0.03);
  }
  remove(v) {
    this.voices.delete(v); this.freeHRTF(v);
    if (v.sp) { const i = this.spatial.indexOf(v); if (i >= 0) this.spatial.splice(i, 1); }
    if (v.shot) { this.shots--; v.shot = false; }
  }
  spatialExt(o) { // entrée positionnelle pour le module musique (radios, enceintes…)
    const v = new Voice(this, '#spatial', { g: 1, rev: num(+o.rev, 1) }, { bus: o.bus ?? 'music', pos: o.pos, ref: o.ref, maxDist: o.maxDist, occlude: o.occlude, volume: o.volume }, 'ext');
    v.g.gain.value = v.vol;
    this.voices.add(v); if (v.sp) this.spatial.push(v);
    return { input: v.g, setPos: (p) => { try { v.setPos(p); } catch (e) { /* */ } }, setVolume: (x, r) => { try { v.setVolume(x, r); } catch (e) { /* */ } }, dispose: () => { try { v.end(); } catch (e) { /* */ } } };
  }
  dtmf(d) {
    const F = DTMF[String(d).toUpperCase()[0]], ctx = this.ctx; if (!F || ctx.state !== 'running') return dummy();
    const t = ctx.currentTime, g = mkGain(ctx, 0), o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.frequency.value = F[0]; o2.frequency.value = F[1]; o1.connect(g); o2.connect(g); g.connect(this.bus.ui.d2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.004); g.gain.setValueAtTime(0.2, t + 0.116); g.gain.linearRampToValueAtTime(0, t + 0.124);
    o1.start(t); o2.start(t); o1.stop(t + 0.13); o2.stop(t + 0.13);
    o2.onended = () => { try { g.disconnect(); o1.disconnect(); o2.disconnect(); } catch (e) { /* */ } };
    return dummy();
  }
  note(instr, midi, o) {
    o = o && typeof o === 'object' ? o : {};
    instr = INSTR[instr] ? instr : 'piano';
    const m = clamp(Math.round(num(+midi, 60)), 12, 120);
    if (instr === 'organ' || instr === 'synth') return this.play('_' + instr, { ...o, param: { midi: m, dur: num(+o.dur, 0.5) } }, false);
    const base = Math.round(m / 3) * 3, name = `_n_${instr}_${base}`;
    if (!SND[name]) SND[name] = noteDef(instr, base);
    return this.play(name, { ...o, pitch: Math.pow(2, (m - base) / 12) * num(+o.pitch, 1), _dur: instr === 'piano' ? num(+o.dur, 0) : 0 }, false);
  }

  // ── auditeur, lieux, occlusion ──
  setListener(p, f, u) {
    const v = vec(p); if (!v) return;
    const L = this.lis, l = this.ctx.listener, t = this.ctx.currentTime;
    const fw = vec(f) || { x: 0, y: 0, z: -1 }, up = vec(u) || { x: 0, y: 1, z: 0 };
    const mv = Math.abs(v.x - L.x) + Math.abs(v.y - L.y) + Math.abs(v.z - L.z), jump = !L.set || mv > 5;
    L.x = v.x; L.y = v.y; L.z = v.z; L.set = true;
    const ori = [fw.x, fw.y, fw.z, up.x, up.y, up.z]; let turned = false;
    for (let i = 0; i < 6; i++) if (Math.abs(ori[i] - this.lo[i]) > 0.001) { turned = true; break; }
    if (l.positionX) {
      const P = [l.positionX, l.positionY, l.positionZ], O = [l.forwardX, l.forwardY, l.forwardZ, l.upX, l.upY, l.upZ], pv = [v.x, v.y, v.z];
      if (jump) { for (let i = 0; i < 3; i++) P[i].value = pv[i]; for (let i = 0; i < 6; i++) O[i].value = ori[i]; }
      else {
        if (mv > 0.002) for (let i = 0; i < 3; i++) P[i].setTargetAtTime(pv[i], t, 0.015);
        if (turned) for (let i = 0; i < 6; i++) O[i].setTargetAtTime(ori[i], t, 0.015);
      }
    } else { l.setPosition(v.x, v.y, v.z); l.setOrientation(fw.x, fw.y, fw.z, up.x, up.y, up.z); }
    if (turned) this.lo = ori;
  }
  occlude(p) { // nombre de murs (budget d'appels par image, cache spatial court)
    const fn = this.occFn; if (!fn) return 0;
    const L = this.lis, key = Math.round(p.x) + ',' + Math.round(p.y) + ',' + Math.round(p.z) + '|' + Math.round(L.x / 2) + ',' + Math.round(L.y / 2) + ',' + Math.round(L.z / 2);
    const c = this.occCache.get(key), t = perfNow();
    if (c && (t - c.t < 400 || this.budget <= 0)) return c.w;
    if (this.budget <= 0) return null;
    this.budget--;
    let w = 0; try { w = clamp(num(+fn(p), 0), 0, 8); } catch (e) { warnOnce('occ', 'fonction d’occlusion en erreur', e); }
    if (this.occCache.size > 512) this.occCache.clear();
    this.occCache.set(key, { w, t });
    return w;
  }
  setZone(type, fade = 1.5) {
    type = ZONES[type] ? type : 'corridor';
    if (type === this.zone) return;
    this.zone = type; fade = clamp(num(+fade, 1.5), 0, 10);
    if (this.irs.has(type) || this.revs.has(type) || !this.worker) { this.applyZone(type, fade); return; }
    const key = '#' + type; let w = this.waiters.get(key); if (!w) this.waiters.set(key, (w = []));
    w.push(() => { if (this.zone === type) this.applyZone(type, fade); }); // réponse impulsionnelle en cours de calcul : on bascule à sa livraison
    this.queue(key, true);
  }
  applyZone(type, fade) {
    if (type === this.active) return;
    this.active = type;
    const ctx = this.ctx, t = ctx.currentTime;
    let R = this.revs.get(type);
    if (!R) {
      const conv = ctx.createConvolver(); conv.normalize = false;
      try { conv.buffer = this.ir(type); } catch (e) { warnOnce('conv', 'réverbération indisponible', e); return; }
      const g = mkGain(ctx, 0); conv.connect(g); g.connect(this.world);
      R = { conv, g, on: false, timer: 0, t: 0 }; this.revs.set(type, R);
    }
    R.t = perfNow(); clearTimeout(R.timer);
    if (!R.on) { this.revIn.connect(R.conv); R.on = true; }
    fadeTo(R.g.gain, ZONES[type].wet, t, fade);
    for (const [k, X] of this.revs) { // les autres lieux s'éteignent puis sont déconnectés (plus aucun calcul)
      if (X === R || !X.on) continue;
      fadeTo(X.g.gain, 0, t, fade); clearTimeout(X.timer);
      X.timer = setTimeout(() => { if (this.active !== k && X.on) { try { this.revIn.disconnect(X.conv); } catch (e) { /* */ } X.on = false; this.trimRevs(); } }, (fade + 0.8) * 1000);
    }
  }
  trimRevs() { // au plus quatre convolueurs gardés prêts (les lieux récents)
    if (this.revs.size <= 4) return;
    const idle = [...this.revs.entries()].filter(([, X]) => !X.on).sort((a, b) => a[1].t - b[1].t);
    while (this.revs.size > 4 && idle.length) { const [k, X] = idle.shift(); try { X.conv.disconnect(); X.g.disconnect(); } catch (e) { /* */ } this.revs.delete(k); }
  }
  setBusVolume(b, v) {
    v = clamp(num(+v, 1), 0, 4); const t = this.ctx.currentTime;
    if (b === 'master') { smooth(this.master.gain, v, t, 0.03); return; }
    const B = this.bus[b]; if (B) for (const n of [B.d2, B.sp, B.rv]) smooth(n.gain, v, t, 0.03);
  }
  setMuffle(a) { // casque d'astronaute, bouchons d'oreille : passe-bas global + légère atténuation
    a = clamp(num(+a, 0), 0, 1); const t = this.ctx.currentTime;
    smooth(this.muffle.frequency, 20000 * Math.pow(300 / 20000, a), t, 0.12); smooth(this.world.gain, 1 - 0.3 * a, t, 0.12);
  }
  // ── sonorisation (bus « pa ») : haut-parleurs du plafond d'un immense centre commercial vide ──
  // entrée (2D ; une position n'a pas de sens : la sono est partout) → mono → passe-haut → petit ampli qui sature
  // doucement → couleur de haut-parleur bon marché (≈ 250 Hz-5 kHz, bosse de présence) → plusieurs haut-parleurs à des
  // distances différentes (retards 11-58 ms, niveaux et aigus décroissants, presque mono) + longue queue de grand hall
  // (convolution, calculée et branchée à la première utilisation) → monde (étouffement global compris).
  // Au repos (aucune entrée), WebAudio cesse de calculer la chaîne (propagation du silence) : coût nul.
  buildPA() {
    const ctx = this.ctx, B = { d2: mkGain(ctx, 1), sp: mkGain(ctx, 1), rv: mkGain(ctx, 1) };
    const f = (type, fr, q, g) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = fr; n.Q.value = q; if (g) n.gain.value = g; return n; };
    const mono = mkGain(ctx, 1); mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
    B.d2.connect(mono); B.sp.connect(mono); B.rv.connect(this.revIn);
    const ws = ctx.createWaveShaper(); ws.curve = this.curve('pa');
    const C = [mono, f('highpass', 200, 0.6), mkGain(ctx, 1.6), ws, mkGain(ctx, 0.43), f('highpass', 250, 0.75), f('peaking', 2400, 1.1, 3.5), f('peaking', 750, 1.4, 1.5), f('lowpass', 5000, 0.75), f('lowpass', 5200, 0.6)];
    for (let i = 1; i < C.length; i++) C[i - 1].connect(C[i]);
    const col = C[C.length - 1], mix = mkGain(ctx, 1), dry = mkGain(ctx, PA_DRY); dry.connect(mix); mix.connect(this.world);
    for (const [t, g, pan, lp] of PA_TAPS) {
      const dl = ctx.createDelay(0.1); dl.delayTime.value = t; let x = mkGain(ctx, g); col.connect(dl); dl.connect(x);
      if (lp) { const l = f('lowpass', lp, 0.6); x.connect(l); x = l; }
      if (ctx.createStereoPanner) { const s = ctx.createStereoPanner(); s.pan.value = pan; x.connect(s); x = s; }
      x.connect(dry);
    }
    this.pa = { col, mix, wet: null }; this.bus.pa = B;
  }
  paUse() { // première utilisation de la sono : réponse impulsionnelle du hall (worker), puis fondu d'entrée de la queue
    const P = this.pa; if (!P || P.wet) return;
    const ctx = this.ctx, wet = P.wet = mkGain(ctx, 0); wet.connect(P.mix);
    const go = (ir) => { // une seule voie de convolution (moitié moins coûteuse) ; largeur : la voie droite retardée de 17 ms
      if (!ir) return;
      try {
        const m = ctx.createBuffer(1, ir.length, ir.sampleRate); m.getChannelData(0).set(ir.getChannelData(0));
        const c = ctx.createConvolver(); c.normalize = false; c.buffer = m; P.col.connect(c);
        const mg = ctx.createChannelMerger(2), dl = ctx.createDelay(0.05); dl.delayTime.value = 0.017; c.connect(mg, 0, 0); c.connect(dl); dl.connect(mg, 0, 1); mg.connect(wet);
        fadeTo(wet.gain, PA_WET, ctx.currentTime, 0.5);
      } catch (e) { warnOnce('pa', 'réverbération de la sono indisponible', e); }
    };
    if (this.irs.has('pahall') || !this.worker) { go(this.ir('pahall')); return; }
    const key = '#pahall'; let w = this.waiters.get(key); if (!w) this.waiters.set(key, (w = [])); w.push(go); this.queue(key, true);
  }
  update() {
    const t = this.ctx.currentTime; this.budget = OCC_BUDGET;
    if (!this.zone) this.setZone('corridor', 0.3);
    while (this.occQ.length && this.budget > 0) { const v = this.occQ.shift(); if (!v.alive) continue; const w = this.occlude(v.pos); if (w == null) { this.occQ.unshift(v); break; } v.walls = w; v.occT = t; }
    const S = this.spatial, n = S.length;
    if (n) {
      let k = 0;
      for (; k < n && this.budget > 0; k++) { const v = S[(this.rr + k) % n]; if (!v.alive || !v.occ || v.culled || t - v.occT < 0.1) continue; const w = this.occlude(v.pos); if (w != null) { v.walls = w; v.occT = t; } }
      this.rr = (this.rr + k) % n;
      const now = perfNow() / 1000;
      for (let i = S.length - 1; i >= 0; i--) { const v = S[i]; if (!v.alive) continue; v.place(false); if (v.vel && v.pt && now - v.pt > 0.25) v.vel *= 0.85; }

    }
    const pn = perfNow(); if (pn - (this.capT || 0) > 250) { this.capT = pn; this.capAll(); }
    if (this.duckD && t >= this.duckEnd) { this.duckD = 0; this.duckK = 1; smooth(this.duckA.gain, 1, t, 0.35); }
    for (const v of this.voices) if (v.endAt && t > v.endAt) v.end();
    this.pump();
  }
  pump() { // séquenceurs des sons temps réel : on programme ~0,3 s à l'avance (plus si l'onglet est caché)
    const t = this.ctx.currentTime; if (t === this.lastPump) return; this.lastPump = t;
    const until = t + (typeof document !== 'undefined' && document.hidden ? 1.2 : 0.3);
    for (const v of this.voices) if (v.alive && v.ctl && v.ctl.tick) { try { v.ctl.tick(t, until); } catch (e) { warnOnce('tick:' + v.name, 'erreur de séquenceur :', v.name, e); } }
  }
  stats() { let loops = 0; for (const v of this.voices) if (!v.shot) loops++; return { voices: this.voices.size, shots: this.shots, loops, spatial: this.spatial.length, hrtf: this.hrtf, cacheMB: +(this.mem / 1e6).toFixed(2), zone: this.active, worker: !!this.worker, queue: this.bg.length + this.inflight.size, state: this.ctx.state, pa: !!(this.pa && this.pa.wet) }; }
  // ── mesure (réglages, tests) : niveau efficace et crête de chaque bus (direct 2D + spatialisé, avant réverbération),
  // du maître (avant limiteur) et de la sortie, cumulés entre deux relevés. Branché au premier appel seulement.
  meter(reset) {
    const ctx = this.ctx, N = 16384;
    if (!this.taps) {
      const T = this.taps = {};
      const tap = (k, srcs) => {
        const up = mkGain(ctx, 1); up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers'; // mono → deux canaux
        const sp = ctx.createChannelSplitter(2), A = [ctx.createAnalyser(), ctx.createAnalyser()];
        for (const s of srcs) s.connect(up);
        up.connect(sp); A.forEach((a, i) => { a.fftSize = N; sp.connect(a, i); });
        T[k] = { A, ss: 0, n: 0, pk: 0 };
      };
      tap('out', [this.comp]); tap('master', [this.master]);
      for (const b of BUSES) tap(b, [this.bus[b].d2, this.bus[b].sp]);
      tap('pa', [this.pa.mix]);
      this.mbuf = new Float32Array(N); this.mLast = ctx.currentTime;
      this.mTimer = setInterval(() => { try { this.meterPoll(); } catch (e) { /* */ } }, 150);
    }
    this.meterPoll();
    const db = (x) => (x > 1e-9 ? +(10 * Math.log10(x)).toFixed(1) : -120), out = {};
    for (const k in this.taps) { const T = this.taps[k]; out[k] = { rms: db(T.n ? T.ss / T.n : 0), peak: db(T.pk * T.pk), s: +(T.n / 2 / this.sr).toFixed(1) }; if (reset) { T.ss = 0; T.n = 0; T.pk = 0; } }
    return out;
  }
  meterPoll() { // seuls les échantillons nouveaux depuis le relevé précédent sont comptés
    const t = this.ctx.currentTime, N = this.mbuf.length, n = Math.min(N, Math.round((t - this.mLast) * this.sr)); if (n <= 0) return;
    this.mLast = t; const d = this.mbuf;
    for (const k in this.taps) { const T = this.taps[k]; for (const a of T.A) { a.getFloatTimeDomainData(d); for (let i = N - n; i < N; i++) { const x = d[i], ax = x < 0 ? -x : x; T.ss += x * x; if (ax > T.pk) T.pk = ax; } T.n += n; } }
  }
}

// ───────────────────────────── façade publique ─────────────────────────────
let E = null;
const pending = { occ: null, bus: {}, muffle: 0 };
const safe = (key, fn, fb) => { try { return fn(); } catch (e) { warnOnce(key, 'erreur interne :', e); return fb; } };

export const Audio = {
  ctx: null,
  init(opts) {
    try {
      if (!E) {
        if (typeof window === 'undefined' || !(window.AudioContext || window.webkitAudioContext || (opts && opts.context))) { warnOnce('noapi', 'Web Audio indisponible : jeu silencieux.'); return; }
        E = new Engine(opts && typeof opts === 'object' ? opts : {}); this.ctx = E.ctx;
        if (pending.occ) E.occFn = pending.occ;
        for (const b in pending.bus) E.setBusVolume(b, pending.bus[b]);
        if (pending.muffle) E.setMuffle(pending.muffle);
      }
      E.resume();
    } catch (e) { warnOnce('init', 'initialisation audio impossible :', e); E = null; this.ctx = null; }
  },
  setListener(pos, forward, up) { if (E) safe('lis', () => E.setListener(pos, forward, up)); },
  setReverbZone(type, fade = 1.5) { if (E) safe('zone', () => E.setZone(type, fade)); },
  setOcclusionFn(fn) { const f = typeof fn === 'function' ? fn : null; pending.occ = f; if (E) E.occFn = f; },
  // opts : pos, volume, pitch, bus ('sfx'|'music'|'ambience'|'voice'|'ui'|'pa'), occlude, ref, maxDist, intensity, when, param,
  // late (s : retard toléré si la synthèse n'est pas prête ; 0,6 par défaut, plus pour les bruits d'ambiance non synchronisés)
  play(name, opts) { return E ? safe('play:' + name, () => E.play(String(name), opts, false), dummy()) : dummy(); },
  loop(name, opts) { return E ? safe('loop:' + name, () => E.play(String(name), opts, true), dummy()) : dummy(); },
  dtmf(digit) { return E ? safe('dtmf', () => E.dtmf(digit), dummy()) : dummy(); },
  note(instr, midi, opts) { return E ? safe('note', () => E.note(instr, midi, opts), dummy()) : dummy(); },
  drum(kind, opts) { return E ? safe('drum', () => E.play('_dr_' + (DRUMS[kind] ? kind : 'snare'), opts, false), dummy()) : dummy(); },
  setBusVolume(bus, v) { pending.bus[bus] = v; if (E) safe('bus', () => E.setBusVolume(bus, v)); }, // 'master'|'sfx'|'music'|'ambience'|'voice'|'ui'|'pa'
  setMuffle(amount) { pending.muffle = amount; if (E) safe('muffle', () => E.setMuffle(amount)); },
  // l'ambiance (bus « ambience ») et les boucles des appareils baissent un instant : depth 0..0,9 (0,35 ≈ -4 dB), dur s
  duck(depth, dur) { if (E) safe('duck', () => E.duck(depth, dur)); },
  update(dt) { if (E) safe('update', () => E.update(dt)); },
  // pour le module musique : entrée 2D d'un bus, et entrée spatialisée (même traitement que play/loop).
  // output('pa') : entrée de la sonorisation du centre (haut-parleurs du plafond, grand hall vide ; cf. Engine.buildPA),
  // comme play/loop(…, { bus: 'pa' }) ; volume : setBusVolume('pa', v)
  output(bus) { if (!E) return null; if (bus === 'pa') safe('pa', () => E.paUse()); return (E.bus[bus] || E.bus.sfx).d2; },
  spatial(opts) {
    const none = { input: null, setPos() { }, setVolume() { }, dispose() { } };
    return E ? safe('spatial', () => E.spatialExt(opts && typeof opts === 'object' ? opts : {}), none) : none;
  },
  // outils (tests, débogage)
  has(name) { return !!SND[name]; },
  get names() { return Object.keys(SND).filter((n) => n[0] !== '_'); },
  stats() { return E ? E.stats() : null; },
  voices() { return E ? [...E.voices].map((v) => ({ name: v.name, mode: v.mode, bus: v.bus, d: v.sp ? +v.dist.toFixed(1) : null, aud: v.sp ? +v.aud.toFixed(4) : null, hrtf: !!v.hr, culled: v.culled, walls: v.walls })) : []; },
  render(name, variant = 0) { return E ? safe('render', () => E.buf(String(name), variant), null) : null; },
  // niveaux mesurés depuis le dernier relevé : { out, master, sfx, music, ambience, voice, ui, pa } → { rms, peak (dBFS), s }
  // (efficace : moyenne des deux canaux ; reset : remet les cumuls à zéro après lecture)
  meter(reset = false) { return E ? safe('meter', () => E.meter(reset), null) : null; },
  // derniers échantillons (mono) de la sortie maître avant limiteur, d'un bus 2D, ou de la sortie de la sono ('pa')
  probe(bus = 'master') {
    return E ? safe('probe', () => {
      const M = E.probes || (E.probes = new Map()); let a = M.get(bus);
      if (!a) { a = E.ctx.createAnalyser(); a.fftSize = 16384; (bus === 'master' ? E.master : bus === 'pa' ? E.pa.mix : (E.bus[bus] || E.bus.sfx).d2).connect(a); M.set(bus, a); } // (vide au tout premier appel)
      const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); return d;
    }, null) : null;
  },
};

// ───────────────────────────── worker de synthèse ─────────────────────────────
// Chargé comme module Web Worker, ce même fichier calcule tampons et réponses impulsionnelles hors du fil
// principal : le préchargement et le démarrage des boucles ne provoquent aucune saccade.
if (typeof window === 'undefined' && typeof document === 'undefined' && typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (e) => {
    const m = e.data || {};
    try {
      let data;
      if (m.name === '#noise') { const r = mulberry(0xC0FFEE), n = Math.round(4 * m.sr); data = [new Float32Array(n), new Float32Array(n)]; for (const d of data) for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * 0.7; }
      else if (m.name[0] === '#') data = irData(ZONES[m.name.slice(1)], hash('ir:' + m.name.slice(1)), m.sr);
      else {
        if (!SND[m.name] && m.name.startsWith('_n_')) { const p = m.name.split('_'); SND[m.name] = noteDef(p[2], +p[3]); } // note d'instrument créée à la volée
        const def = SND[m.name]; if (!def || def.graph) throw new Error('son inconnu du worker'); data = synth(m.name, def, m.k, m.sr); }
      self.postMessage({ id: m.id, sr: m.sr, data }, data.map((d) => d.buffer));
    } catch (err) { self.postMessage({ id: m.id, err: String((err && err.message) || err) }); }
  };
}
