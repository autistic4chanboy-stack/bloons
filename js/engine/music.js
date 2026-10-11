// Musique procédurale : séquenceur + synthèse WebAudio, aucun fichier audio. Chaque morceau est composé à partir
// d'une graine (mulberry32) : tous les pairs entendent la même chanson pour la même graine.
// Sources « dans le monde » : radio du poste, régie, TV/VHS, bornes d'arcade, manège, projecteur, platines, attente
// téléphonique, boîtes à musique, écrans de fin.
// Chaîne : Song (horloge en temps musical + ordonnanceur à anticipation) → pistes (bus + FX partagés : filtres,
// chorus, trémolo, écho, distorsion) → couleur du morceau (EQ, pleurage) → compresseur → gain de sortie
// → Audio.output(bus) (2D, stéréo) ou Audio.spatial().input (HRTF + occlusion + réverbe gérées par le moteur audio).
// Instruments : batteries, pianos, lames, cordes pincées rendus une fois en JS (DSP) puis mis en cache par contexte ;
// instruments tenus (Rhodes FM, nappes, orgue, accordéon, cuivres, synthés) en oscillateurs temps réel.
import { Audio } from './audio.js';
import { mulberry32, hashString } from './rng.js';

const TAU = Math.PI * 2, LOOKAHEAD = 0.16, TICK_MS = 30, MAX_COST = 24, EMPTY = Object.freeze({});
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mod = (a, n) => ((a % n) + n) % n;
const warned = new Set();
function warnOnce(key, ...msg) { if (warned.has(key)) return; warned.add(key); try { console.warn('[music]', ...msg); } catch (e) { /* */ } }

// PRNG enrichi : la composition (R) et l'humanisation (H) utilisent deux flux séparés, pour que le contenu musical
// ne dépende jamais du moment où les notes sont effectivement jouées.
function makeRng(seed) {
  const f = mulberry32(seed);
  const r = () => f();
  r.range = (a, b) => a + (b - a) * f();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  r.pick = (a) => a[Math.floor(f() * a.length)];
  r.chance = (p) => f() < p;
  r.gauss = () => (f() + f() + f() + f() - 2) * 1.73;
  r.wpick = (pairs) => { let tot = 0; for (const p of pairs) tot += p[1]; let x = f() * tot; for (const p of pairs) { x -= p[1]; if (x <= 0) return p[0]; } return pairs[pairs.length - 1][0]; };
  r.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return r;
}

// ───────────────────────── théorie : gammes, accords en chiffrage romain, voicings ─────────────────────────
const SCALE = {
  maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], dor: [0, 2, 3, 5, 7, 9, 10],
  mix: [0, 2, 4, 5, 7, 9, 10], lyd: [0, 2, 4, 6, 7, 9, 11], phr: [0, 1, 3, 5, 7, 8, 10], pmaj: [0, 2, 4, 7, 9], pmin: [0, 3, 5, 7, 10],
};
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7, 12], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  mmaj7: [0, 3, 7, 11], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], 69: [0, 4, 7, 9, 14], 11: [0, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 14, 17], 13: [0, 4, 7, 10, 14, 21], '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15], dim: [0, 3, 6], dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14],
  'maj7#11': [0, 4, 7, 11, 18],
};
const ROMAN = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
const MINOR_Q = { '': 'm', 6: 'm6', 7: 'm7', 9: 'm9', 11: 'm11', maj7: 'mmaj7', add9: 'madd9', o: 'dim', o7: 'dim7' };
const chordCache = new Map();
// « bVII9 », « ii7 », « V7b9 », « I/3 » (renversement : /3 tierce à la basse, /5 quinte, /7 septième).
// Majuscule = accord majeur, minuscule = mineur ; altérations relatives à la gamme majeure de la tonique.
function parseChord(sym) {
  let c = chordCache.get(sym); if (c) return c;
  const [main, inv] = sym.split('/');
  const m = /^([b#]?)(iii|vii|ii|iv|vi|v|i)(.*)$/i.exec(main) || [0, '', 'I', ''];
  const low = m[2] === m[2].toLowerCase();
  const r = ROMAN[m[2].toLowerCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
  let q = m[3]; if (low && q in MINOR_Q) q = MINOR_Q[q]; else if (!low && q === 'o') q = 'dim';
  const iv = QUAL[q] || (low ? QUAL.m : QUAL['']);
  const inv2 = inv === '3' ? iv[1] : inv === '5' ? iv[2] : inv === '7' ? (iv[3] ?? 10) : 0;
  c = { r, iv, bass: r + inv2, sym };
  chordCache.set(sym, c); return c;
}
// progression : mesures séparées par des espaces, plusieurs accords dans la mesure séparés par des virgules
const prog = (str) => str.trim().split(/\s+/).map((bar) => bar.split(',').map(parseChord));
const isTone = (rel, ch) => ch.iv.some((x) => mod(ch.r + x - rel, 12) === 0);

const DROP_ORDER = [7, 0, 14, 21, 17, 9];
// Voicing avec conduite des voix : parmi les renversements/octaves possibles, garde celui qui bouge le moins
// par rapport au précédent (o.rootless : sans fondamentale, o.drop2 : voicing ouvert, o.hi : note la plus haute).
function voicing(ch, key, prev, lo, n = 4, o = EMPTY) {
  let iv = ch.iv.filter((x) => x !== 12);
  if (o.rootless && iv.length > 3) iv = iv.filter((x) => x !== 0);
  for (const d of DROP_ORDER) { if (iv.length <= n) break; const k = iv.indexOf(d); if (k >= 0 && iv.length > 3) iv.splice(k, 1); }
  while (iv.length > n) iv.pop();
  const pcs = iv.map((x) => mod(key + ch.r + x, 12));
  let best = null, bestCost = 1e9;
  for (let oct = 0; oct < 2; oct++) for (let rot = 0; rot < pcs.length; rot++) {
    const notes = []; let cur = lo + oct * 12 + mod(pcs[rot] - lo, 12);
    for (let k = 0; k < pcs.length; k++) { if (k) cur += mod(pcs[(rot + k) % pcs.length] - cur, 12) || 12; notes.push(cur); }
    if (o.drop2 && notes.length >= 4) notes.unshift(notes.splice(notes.length - 2, 1)[0] - 12);
    if (o.hi && notes[notes.length - 1] > o.hi) continue;
    let cost = 0;
    if (prev && prev.length) {
      for (const a of notes) { let m = 99; for (const b of prev) m = Math.min(m, Math.abs(a - b)); cost += m; }
      for (const b of prev) { let m = 99; for (const a of notes) m = Math.min(m, Math.abs(a - b)); cost += m * 0.5; }
    } else cost = Math.abs(notes[0] + notes[notes.length - 1] - 2 * (lo + 7));
    if (notes[0] < lo - 4) cost += 20;
    if (cost < bestCost) { bestCost = cost; best = notes; }
  }
  return best || pcs.map((p) => lo + mod(p - lo, 12)).sort((a, b) => a - b);
}

// ───────────────────────── mélodies : motifs rythmiques + contours, notes d'appui sur l'accord ─────────────────────────
// Banques de rythmes (une mesure) : « début:durée » en temps
const RH = {
  lyric: ['0:2 2:2', '0:1.5 1.5:0.5 2:2', '0:1 1:1 2:2', '0:3 3:1', '0:1 1:0.5 1.5:0.5 2:1 3:1', '0:0.5 0.5:0.5 1:1 2:2', '0:2 2:1 3:1', '1:1 2:1 3:1'],
  pop: ['0:1 1:0.5 1.5:0.5 2:1 3:1', '0:0.5 0.5:0.5 1:0.5 1.5:1 2.5:0.5 3:1', '0:1.5 1.5:1 2.5:1.5', '0:0.5 0.5:1 1.5:0.5 2:2', '0:0.75 0.75:0.75 1.5:0.5 2:1 3:0.5 3.5:0.5', '0.5:0.5 1:0.5 1.5:0.5 2:1 3:1'],
  busy: ['0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:0.5 2.5:0.5 3:1', '0:0.25 0.25:0.25 0.5:0.5 1:0.5 1.5:0.5 2:1 3:0.5 3.5:0.5', '0:0.5 0.5:0.25 0.75:0.25 1:0.5 1.5:0.5 2:0.5 2.5:0.5 3:0.5 3.5:0.5', '0:0.5 0.5:0.5 1:1 2:0.5 2.5:0.5 3:0.5 3.5:0.5'],
  sparse: ['0:1.5 2:0.5 2.5:1', '1:0.5 1.5:0.5 2:2', '0.5:0.5 1:1 3:1', '0:3', '2:0.5 2.5:0.5 3:1', '0:0.75 0.75:0.75 1.5:2.5', '0.5:1 1.5:0.5 2:2'],
  waltz: ['0:2 2:1', '0:1 1:1 2:1', '0:1.5 1.5:0.5 2:1', '0:0.5 0.5:0.5 1:1 2:1', '0:1 1:0.5 1.5:0.5 2:1', '0:2.5 2.5:0.5', '0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:1'],
  march: ['0:0.75 0.75:0.25 1:1 2:0.75 2.75:0.25 3:1', '0:1.5 1.5:0.5 2:1 3:1', '0:0.75 0.75:0.25 1:0.75 1.75:0.25 2:2', '0:1 1:1 2:1 3:0.75 3.75:0.25', '0:0.5 0.5:0.5 1:1 2:1 3:1'],
  chip: ['0:0.5 0.5:0.5 1:0.25 1.25:0.25 1.5:0.5 2:0.5 2.5:0.5 3:1', '0:0.75 0.75:0.75 1.5:0.5 2:0.5 2.5:0.5 3:0.5 3.5:0.5', '0:0.25 0.25:0.25 0.5:0.25 0.75:0.25 1:1 2:0.5 2.5:0.5 3:1', '0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:0.75 2.75:0.75 3.5:0.5'],
  swing: ['0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:1 3:0.5 3.5:0.5', '0.5:0.5 1:0.5 1.5:1 2.5:0.5 3:1', '0:1.5 1.5:0.5 2:0.5 2.5:0.5 3:1', '0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:0.5 2.5:0.5 3:0.5 3.5:0.5'],
  jingle: ['0:1 1:1 2:2', '0:0.5 0.5:0.5 1:1 2:0.5 2.5:0.5 3:1', '0:1 1:1 2:1.5 3.5:0.5', '0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:1 3:1'],
  cad4: ['0:4', '0:2 2:2', '0:1 1:3', '0:3', '0:1.5 1.5:2.5'], cad3: ['0:3', '0:1 1:2', '0:2'],
};
const rhCache = new Map();
const rhythm = (str) => { let r = rhCache.get(str); if (!r) rhCache.set(str, (r = str.split(' ').map((p) => p.split(':').map(Number)))); return r; };
const degOf = (rel, sc) => { const o = Math.floor(rel / 12), pc = mod(rel, 12); let k = 0, bd = 99; sc.forEach((s, i) => { const d = Math.abs(s - pc); if (d < bd) { bd = d; k = i; } }); return o * sc.length + k; };
const relOf = (d, sc) => 12 * Math.floor(d / sc.length) + sc[mod(d, sc.length)];
const stepSc = (rel, k, sc) => relOf(degOf(rel, sc) + k, sc);

// Mélodie en périodes (antécédent → demi-cadence, conséquent → tonique), motifs répétés et séquencés.
// Renvoie, par mesure, des notes { b, d, n (demi-tons relatifs à la tonique), v }.
function genMelody(R, prg, o = EMPTY) {
  const sc = o.scale || SCALE.maj, L = sc.length, meter = o.meter || 4, P = o.phrase || 4;
  const bank = o.bank || RH.pop, cad = o.cad || (meter === 3 ? RH.cad3 : RH.cad4);
  const lo = o.lo ?? 0, hi = o.hi ?? 19, leap = o.leap ?? 0.35;
  const near = (d, ok) => { for (let k = 0; k <= L; k++) { if (ok(relOf(d - k, sc))) return d - k; if (ok(relOf(d + k, sc))) return d + k; } return d; };
  const mk = () => { const r = rhythm(R.pick(bank)); return { r, st: r.map(() => R.wpick([[0, o.rep ?? 1.3], [1, 3], [-1, 3.4], [2, 1.5], [-2, 1.6], [3, 0.5], [-3, 0.6], [4, leap], [-4, leap * 0.8], [7, leap * 0.25]])) }; };
  const A = mk(), B = mk(), second = R.chance(0.55) ? B : A, start = o.start ?? (L === 5 ? 2 : 4);
  const out = []; let d = start, seqShift = R.pick([0, 1, -1, 0]);
  for (let i = 0; i < prg.length; i++) {
    const chs = prg[i], inP = i % P, endP = inP === P - 1, final = i === prg.length - 1 || i % 8 === 7;
    const chAt = (b) => chs[Math.min(chs.length - 1, Math.floor(b / (meter / chs.length)))];
    if (i % 8 === 0) d = start;
    const mot = endP ? { r: rhythm(R.pick(cad)), st: null } : inP === 0 ? A : inP === 1 ? second : A;
    if (inP === 2 && !endP) d += seqShift;
    const notes = [];
    mot.r.forEach(([b, dur], k) => {
      if (b >= meter) return;
      const ch = chAt(b), last = k === mot.r.length - 1;
      d += mot.st ? mot.st[k] : k === 0 ? R.pick([-1, 1, 0, -2, 2]) : R.pick([-1, 1]);
      const strong = b % (meter === 3 ? 3 : 2) === 0 || dur >= 1.5;
      if (endP && last) d = near(d, (rel) => (final ? mod(rel, 12) === 0 : [7, 4, 2].includes(mod(rel, 12))) && isTone(rel, ch)) ;
      else if (strong) d = near(d, (rel) => isTone(rel, ch));
      while (relOf(d, sc) > hi) d -= L;
      while (relOf(d, sc) < lo) d += L;
      if (o.rest && !strong && R.chance(o.rest)) return;
      notes.push({ b, d: Math.min(dur, meter - b), n: relOf(d, sc), v: b === 0 ? 0.9 : strong ? 0.8 : 0.68 });
    });
    out.push(notes);
  }
  return out;
}
// Variation d'une mélodie : notes de passage, broderies, anticipations, répétitions (les appuis restent sur l'accord)
function vary(R, mel, amt, sc = SCALE.maj) {
  return mel.map((bar) => {
    if (!bar.length || !R.chance(amt)) return bar;
    const out = bar.map((n) => ({ ...n })), k = R.int(0, out.length - 1), n = out[k], op = R.int(0, 3);
    if (op === 0 && n.d >= 1) { const h = n.d / 2; out.splice(k, 1, { ...n, d: h }, { b: n.b + h, d: h, n: stepSc(n.n, R.pick([-1, 1]), sc), v: n.v * 0.85 }); }
    else if (op === 1 && n.b % 1 && k > 0) n.n = stepSc(n.n, R.pick([-1, 1]), sc);
    else if (op === 2 && k > 0 && out[k - 1].d >= 1 && n.b >= 0.5) { out[k - 1].d -= 0.5; n.b -= 0.5; n.d += 0.5; }
    else if (op === 3 && n.d >= 0.5) { const h = n.d / 2; out.splice(k, 1, { ...n, d: h }, { ...n, b: n.b + h, d: h, v: n.v * 0.8 }); }
    return out;
  });
}

// ───────────────────────── rendu d'échantillons (DSP en JS, une fois par contexte) ─────────────────────────
const CACHE = new WeakMap();
const store = (ctx) => { let m = CACHE.get(ctx); if (!m) CACHE.set(ctx, (m = new Map())); return m; };
// biquad RBJ (rendu hors ligne)
function rbj(type, f, q, sr) {
  const w = (TAU * Math.min(f, sr * 0.45)) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  let b0, b1, b2;
  if (type === 'lp') { b1 = (1 - cs) / a0; b0 = b2 = b1 / 2; } else if (type === 'hp') { b1 = -(1 + cs) / a0; b0 = b2 = -b1 / 2; } else { b0 = al / a0; b1 = 0; b2 = -b0; }
  const a1 = (-2 * cs) / a0, a2 = (1 - al) / a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
function makeBuf(ctx, key, sec, sr, fill, o = EMPTY) {
  const m = store(ctx); let b = m.get(key); if (b) return b;
  b = ctx.createBuffer(1, Math.max(64, Math.ceil(sec * sr)), sr);
  const d = b.getChannelData(0), f0 = fill(d, sr, mulberry32(hashString(key)));
  let pk = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
  if (pk > 0) { const k = (o.norm ?? 0.9) / pk; for (let i = 0; i < d.length; i++) d[i] *= k; }
  if (!o.loop) { const fl = Math.min(d.length >> 2, Math.ceil(sr * 0.012)); for (let i = 0; i < fl; i++) d[d.length - 1 - i] *= i / fl; }
  b.f0 = f0 || 0; m.set(key, b); return b;
}
// 6 oscillateurs carrés à rapports inharmoniques (cymbales « 808 »)
function metal(sr, r, mult) {
  const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => (x * mult) / sr), ph = fr.map(() => r());
  return () => { let s = 0; for (let k = 0; k < 6; k++) { ph[k] += fr[k]; if (ph[k] >= 1) ph[k] -= 1; s += ph[k] < 0.5 ? 1 : -1; } return s / 6; };
}
function jingles(d, sr, r, n, spread, dec, lo, hi) {
  const hp = rbj('hp', 5500, 0.7, sr);
  for (let j = 0; j < n; j++) {
    const t0 = j ? r() * spread : 0, a = j ? 0.35 + r() * 0.5 : 1, fs = [0, 1, 2].map(() => TAU * (lo + r() * (hi - lo)));
    const s0 = Math.floor(t0 * sr), len = Math.min(d.length - s0, Math.floor(dec * 6 * sr));
    for (let i = 0; i < len; i++) { const t = i / sr; d[s0 + i] += (Math.sin(fs[0] * t) + Math.sin(fs[1] * t) + Math.sin(fs[2] * t)) * a * 0.25 * Math.exp(-t / dec); }
  }
  for (let i = 0; i < d.length; i++) d[i] += hp(r() * 2 - 1) * 0.22 * Math.exp(-i / sr / (spread + dec));
}
function lfsr(short) { let reg = 1; return () => { const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1; reg = (reg >> 1) | (bit << 14); return reg & 1 ? 1 : -1; }; }
const DLEN = { kick: 0.7, snare: 0.55, rim: 0.15, clap: 0.45, hat: 0.15, phat: 0.1, ohat: 0.75, ride: 1.9, rbell: 1.3, crash: 2.4, tom: 0.75, shaker: 0.16, tamb: 0.45, sleigh: 0.6, brush: 0.4, timp: 2.6, tri: 2.2, block: 0.18, cow: 0.45, syn: 0.7, bd: 1.5, tick: 0.04, nkick: 0.25, nsnare: 0.3, nhat: 0.08 };
const DR = {
  kick(d, sr, r, p) {
    const f0 = p.f0 ?? 150, f1 = p.f1 ?? 48, pd = p.pd ?? 0.04, ad = p.ad ?? 0.38, cl = p.click ?? 0.3, dr = p.drive ?? 2, nd = Math.tanh(dr);
    let ph = 0, z = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; ph += (TAU * (f1 + (f0 - f1) * Math.exp(-t / pd))) / sr;
      let y = Math.sin(ph) * Math.exp(-t / ad);
      if (t < 0.006) { z += (r() * 2 - 1 - z) * 0.35; y += z * cl * (1 - t / 0.006); }
      d[i] = Math.tanh(y * dr) / nd;
    }
  },
  snare(d, sr, r, p) {
    const bp = rbj('bp', p.nf ?? 3200, 0.7, sr), hp = rbj('hp', p.hp ?? 1000, 0.7, sr), lp = rbj('lp', p.lp ?? 10000, 0.6, sr), lt = rbj('lp', 5000, 0.5, sr);
    const f = p.f ?? 190, tn = p.tone ?? 0.55, nz = p.noise ?? 0.8, nd = p.nd ?? 0.17, gate = p.gate || 0; let a = 0, b = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, ff = f * (1 + 0.35 * Math.exp(-t / 0.012)); a += (TAU * ff) / sr; b += (TAU * ff * 1.72) / sr;
      const tone = (Math.sin(a) * Math.exp(-t / 0.075) + 0.45 * Math.sin(b) * Math.exp(-t / 0.05)) * tn, w = r() * 2 - 1;
      let n = lp(hp(w) * 0.6 + bp(w) * 0.8) * Math.exp(-t / nd) * nz;
      if (gate) n += lt(w) * 0.5 * Math.exp(-t / 0.6) * (t < gate ? Math.min(1, t / 0.01) : Math.max(0, 1 - (t - gate) / 0.015));
      d[i] = Math.tanh((tone + n) * 1.4);
    }
  },
  rim(d, sr, r) { const bp = rbj('bp', 3000, 2, sr); for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(TAU * 1650 * t) * Math.exp(-t / 0.009) * 0.6 + Math.sin(TAU * 470 * t) * Math.exp(-t / 0.018) * 0.55 + bp(r() * 2 - 1) * Math.exp(-t / 0.004) * 1.2; } },
  clap(d, sr, r) {
    const bp = rbj('bp', 1150, 1.4, sr), hp = rbj('hp', 600, 0.7, sr);
    for (let i = 0; i < d.length; i++) { const t = i / sr; let e = 0; for (const o of [0, 0.0095, 0.019]) if (t >= o) e += Math.exp(-(t - o) / 0.0042); if (t >= 0.028) e += 0.85 * Math.exp(-(t - 0.028) / 0.11); d[i] = hp(bp(r() * 2 - 1)) * e; }
  },
  hat(d, sr, r, p) {
    const m = metal(sr, r, p.m ?? 1.6), h1 = rbj('hp', p.hp ?? 7500, 0.7, sr), h2 = rbj('hp', p.hp ?? 7500, 0.7, sr), bp = rbj('bp', p.bp ?? 10500, 1, sr), dec = p.d ?? 0.04, mx = p.metal ?? 0.7;
    for (let i = 0; i < d.length; i++) { const t = i / sr; let y = h2(h1(m() * mx + (r() * 2 - 1) * (1 - mx))); y = y * 0.6 + bp(y) * 0.8; d[i] = y * Math.exp(-t / dec) * Math.min(1, t * 3000); }
  },
  phat(d, sr, r, p) { DR.hat(d, sr, r, { ...p, d: 0.018 }); },
  ohat(d, sr, r, p) { DR.hat(d, sr, r, { ...p, d: p.od ?? 0.3 }); },
  ride(d, sr, r, p) {
    const m = metal(sr, r, p.m ?? 1.15), h = rbj('hp', 4000, 0.7, sr), bp = rbj('bp', 7500, 0.9, sr), pf = p.pf ?? [3100, 4650, 5900], ph = pf.map(() => 0), bell = p.bell ?? 0.08;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let y = h(m() * 0.6 + (r() * 2 - 1) * 0.4); y = y * 0.4 + bp(y) * 0.7; let ping = 0;
      for (let k = 0; k < 3; k++) { ph[k] += (TAU * pf[k]) / sr; ping += Math.sin(ph[k]); }
      d[i] = y * (0.35 * Math.exp(-t / 0.02) + 0.65 * Math.exp(-t / (p.d ?? 1.3))) * (1 - bell * 2) + ping * bell * Math.exp(-t / 0.5);
    }
  },
  rbell(d, sr, r, p) { DR.ride(d, sr, r, { ...p, bell: 0.3, pf: [2250, 3380, 4790], d: 0.9 }); },
  crash(d, sr, r, p) { const m = metal(sr, r, 1.35), h1 = rbj('hp', p.hp ?? 3500, 0.7, sr), h2 = rbj('hp', 5000, 0.5, sr); for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = h2(h1(m() * 0.5 + (r() * 2 - 1) * 0.7)) * (0.5 * Math.exp(-t / 0.08) + 0.6 * Math.exp(-t / (p.d ?? 1.2))) * Math.min(1, t * 1500); } },
  tom(d, sr, r, p) { const f = p.f ?? 115, ad = p.ad ?? 0.42, lp = rbj('lp', 1800, 0.7, sr); let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / sr; ph += (TAU * f * (1 + 0.5 * Math.exp(-t / 0.055))) / sr; d[i] = Math.tanh(1.5 * (Math.sin(ph) * Math.exp(-t / ad) + lp(r() * 2 - 1) * 0.25 * Math.exp(-t / 0.012))); } },
  shaker(d, sr, r, p) { const h = rbj('hp', 5000, 0.8, sr), b = rbj('bp', 9000, 1, sr), a = p.a ?? 0.012, dec = p.d ?? 0.05; for (let i = 0; i < d.length; i++) { const t = i / sr, w = r() * 2 - 1; d[i] = (h(w) * 0.5 + b(w) * 0.6) * (t < a ? t / a : Math.exp(-(t - a) / dec)); } },
  tamb(d, sr, r) { jingles(d, sr, r, 5, 0.03, 0.05, 5000, 9800); },
  sleigh(d, sr, r) { jingles(d, sr, r, 9, 0.16, 0.06, 4200, 10500); },
  brush(d, sr, r, p) { const b = rbj('bp', 3200, 0.5, sr), l = rbj('lp', 7000, 0.7, sr), a = p.a ?? 0.02, dec = p.d ?? 0.13; for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = l(b(r() * 2 - 1)) * (t < a ? t / a : Math.exp(-(t - a) / dec)) + Math.sin(TAU * 200 * t) * Math.exp(-t / 0.03) * 0.25; } },
  timp(d, sr, r, p) {
    const f = p.f ?? 87.3, parts = [[1, 1, 1.9], [1.5, 0.5, 1.2], [1.98, 0.32, 0.8], [2.44, 0.18, 0.55], [2.97, 0.1, 0.4]], lp = rbj('lp', 280, 0.7, sr), ph = parts.map(() => 0);
    for (let i = 0; i < d.length; i++) { const t = i / sr, g = 1 + 0.018 * Math.exp(-t / 0.08); let y = 0; for (let k = 0; k < 5; k++) { ph[k] += (TAU * f * parts[k][0] * g) / sr; y += Math.sin(ph[k]) * parts[k][1] * Math.exp(-t / parts[k][2]); } d[i] = y + lp(r() * 2 - 1) * 1.6 * Math.exp(-t / 0.03); }
  },
  tri(d, sr) { const fs = [2410, 3630, 5290, 6620, 7940, 9620], am = [1, 0.8, 0.65, 0.5, 0.35, 0.25]; for (let i = 0; i < d.length; i++) { const t = i / sr; let y = 0; for (let k = 0; k < 6; k++) y += Math.sin(TAU * fs[k] * t) * am[k] * Math.exp(-t / (2 - k * 0.22)); d[i] = y * Math.min(1, t * 4000); } },
  block(d, sr, r, p) { const f = p.f ?? 1100; for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(TAU * f * t) * Math.exp(-t / 0.028) + 0.4 * Math.sin(TAU * f * 2.71 * t) * Math.exp(-t / 0.012); } },
  cow(d, sr) { const b = rbj('bp', 2600, 1.1, sr); let p1 = 0, p2 = 0; for (let i = 0; i < d.length; i++) { const t = i / sr; p1 += 562 / sr; p2 += 845 / sr; d[i] = b((p1 % 1 < 0.5 ? 1 : -1) + (p2 % 1 < 0.5 ? 1 : -1)) * (0.6 * Math.exp(-t / 0.012) + 0.5 * Math.exp(-t / 0.13)); } },
  syn(d, sr) { let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / sr; ph += (TAU * (165 + 650 * Math.exp(-t / 0.11))) / sr; d[i] = Math.sin(ph) * Math.exp(-t / 0.32); } },
  bd(d, sr, r) { DR.kick(d, sr, r, { f0: 78, f1: 41, pd: 0.09, ad: 0.8, click: 0.12, drive: 1.2 }); },
  tick(d, sr, r) { const b = rbj('bp', 3800, 1.5, sr); for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = b(r() * 2 - 1) * Math.exp(-t / 0.0025) + Math.sin(TAU * 1900 * t) * Math.exp(-t / 0.004) * 0.4; } },
  nkick(d, sr) { let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / sr; ph += (50 + 330 * Math.exp(-t / 0.025)) / sr; d[i] = (Math.round((4 * Math.abs((ph % 1) - 0.5) - 1) * 7.5) / 7.5) * (Math.ceil(15 * Math.exp(-t / 0.08)) / 15); } },
  nsnare(d, sr) { const n = lfsr(false); let v = 0, acc = 0; for (let i = 0; i < d.length; i++) { acc += 11000 / sr; if (acc >= 1) { acc -= 1; v = n(); } d[i] = (v * Math.ceil(15 * Math.exp(-i / sr / 0.07))) / 15; } },
  nhat(d, sr) { const n = lfsr(true); let v = 0, acc = 0; for (let i = 0; i < d.length; i++) { acc += 28000 / sr; if (acc >= 1) { acc -= 1; v = n(); } d[i] = (v * Math.ceil(15 * Math.exp(-i / sr / 0.02))) / 15; } },
};
// kits : réglages par style (le reste de la couleur vient des filtres de piste)
const KITS = {
  std: {},
  lofi: { kick: { f0: 118, f1: 46, pd: 0.035, ad: 0.3, click: 0.08, drive: 1.6 }, snare: { tone: 0.4, noise: 0.6, nf: 1900, nd: 0.13, lp: 6000 }, hat: { d: 0.03, metal: 0.4 }, ohat: { od: 0.22, metal: 0.4 } },
  jazz: { kick: { f0: 110, f1: 62, pd: 0.03, ad: 0.25, click: 0.05, drive: 1.1 }, snare: { f: 240, tone: 0.4, nd: 0.12 }, ride: { d: 1.6 } },
  disco: { kick: { f0: 170, f1: 50, pd: 0.03, ad: 0.3, click: 0.35, drive: 2.2 }, snare: { f: 200, nd: 0.15 }, ohat: { od: 0.26 } },
  rock: { kick: { f0: 160, f1: 52, pd: 0.035, ad: 0.33, click: 0.4, drive: 2.4 }, snare: { f: 180, tone: 0.65, nd: 0.22, noise: 0.9 }, tom: { f: 100, ad: 0.5 } },
  metal: { kick: { f0: 210, f1: 58, pd: 0.018, ad: 0.18, click: 0.7, drive: 2.8 }, snare: { f: 210, tone: 0.5, nd: 0.16, noise: 0.95 }, tom: { f: 105, ad: 0.4 } },
  synth: { kick: { f0: 140, f1: 44, pd: 0.06, ad: 0.5, click: 0.15, drive: 2 }, snare: { f: 200, tone: 0.45, nd: 0.12, gate: 0.32 }, tom: { f: 140, ad: 0.32 } },
  funk: { kick: { f0: 150, f1: 55, pd: 0.03, ad: 0.24, click: 0.3, drive: 2 }, snare: { f: 230, tone: 0.5, nd: 0.11 } },
  reggae: { kick: { f0: 120, f1: 44, pd: 0.05, ad: 0.45, click: 0.1, drive: 1.5 }, snare: { f: 260, tone: 0.6, nd: 0.1 } },
  soft: { kick: { f0: 105, f1: 50, pd: 0.03, ad: 0.25, click: 0.05, drive: 1.2 }, snare: { tone: 0.5, nd: 0.1, noise: 0.5 } },
  orch: { timp: { f: 73.4 }, tom: { f: 70, ad: 0.9 } },
};
function drumBuf(ctx, kit, kind) {
  if (!DR[kind]) return null;
  const p = (KITS[kit] && KITS[kit][kind]) || EMPTY;
  return makeBuf(ctx, 'dr:' + kit + ':' + kind, DLEN[kind] || 0.5, ctx.sampleRate, (d, sr, r) => DR[kind](d, sr, r, p));
}
// craquements de vinyle (boucle de 5,4 s = 3 tours de 33 tr/min, une rayure par tour), souffle, bruit blanc
function crackleBuf(ctx) {
  return makeBuf(ctx, 'crackle', 5.4, ctx.sampleRate, (d, sr, r) => {
    const lp = rbj('lp', 4200, 0.7, sr), hp = rbj('hp', 180, 0.7, sr), plp = rbj('lp', 2500, 0.7, sr), rev = Math.round(sr * 1.8), at = Math.round(sr * 0.31);
    let pop = 0, big = 0;
    for (let i = 0; i < d.length; i++) {
      if (r() < 38 / sr) pop += (r() < 0.5 ? -1 : 1) * r() * r() * 0.6;
      if (r() < 0.9 / sr) big += (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.4);
      if (i % rev === at) big += 0.45;
      d[i] = hp(lp(r() * 2 - 1) * 0.04 + pop + plp(big)); pop *= 0.45; big *= 0.93;
    }
  }, { loop: true });
}
const noiseBuf = (ctx) => makeBuf(ctx, 'noise', 2, ctx.sampleRate, (d, sr, r) => { for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }, { loop: true });

// ── instruments à hauteur (une prise toutes les 6 demi-tons, transposée par playbackRate) ──
const PSR = 32000;
function partials(d, sr, f, parts, att, click, r, two) {
  const nyq = sr * 0.46, N = d.length;
  for (const [ra, am, de] of parts) {
    const fr = f * ra; if (fr >= nyq || am < 1e-4) continue;
    const w = (TAU * fr) / sr, c = Math.cos(w), s = Math.sin(w), p0 = r() * TAU, k1 = Math.exp(-1 / (de * sr)), k2 = Math.exp(-5 / (de * sr));
    let x = Math.cos(p0), y = Math.sin(p0), e1 = two ? am * 0.45 : am, e2 = two ? am * 0.55 : 0;
    for (let i = 0; i < N; i++) { const nx = x * c - y * s; y = x * s + y * c; x = nx; d[i] += y * (e1 + e2); e1 *= k1; e2 *= k2; if (e1 < 1e-6 && e2 < 1e-6) break; }
  }
  const na = Math.max(1, Math.floor(att * sr)); for (let i = 0; i < na && i < N; i++) d[i] *= i / na;
  if (click) { const h = rbj('hp', 2500, 0.7, sr), nc = Math.floor(0.004 * sr); for (let i = 0; i < nc && i < N; i++) d[i] += h(r() * 2 - 1) * click * (1 - i / nc); }
}
// lames métalliques : [rapport, amplitude, décroissance (s)]
const TINE = {
  mbox: { p: [[1, 1, 1.5], [1.0016, 0.45, 1.9], [2, 0.06, 0.5], [5.93, 0.32, 0.12], [13.4, 0.08, 0.04]], att: 0.0008, click: 0.16, len: 2.4 },
  glock: { p: [[1, 1, 1.4], [2.76, 0.42, 0.45], [5.4, 0.22, 0.18], [8.93, 0.1, 0.08]], att: 0.0005, click: 0.08, len: 2 },
  celesta: { p: [[1, 1, 1.3], [2, 0.12, 0.5], [3.01, 0.05, 0.3], [4.1, 0.16, 0.22], [6.8, 0.04, 0.08]], att: 0.0025, click: 0.03, len: 2.2 },
  vibes: { p: [[1, 1, 2.8], [4, 0.22, 0.6], [9.8, 0.05, 0.18]], att: 0.002, click: 0.03, len: 3 },
  bell: { p: [[0.5, 0.45, 4], [1, 1, 2.8], [1.19, 0.55, 2.2], [1.5, 0.35, 1.8], [2, 0.42, 1.4], [2.51, 0.18, 0.9], [2.66, 0.15, 0.8], [3.01, 0.1, 0.6]], att: 0.001, click: 0.05, len: 4 },
  toy: { p: [[1, 1, 0.7], [2.92, 0.35, 0.2], [6.1, 0.2, 0.07]], att: 0.0005, click: 0.2, len: 1.2 },
};
// cordes pincées (Karplus-Strong) : durée de résonance, brillance de l'excitation, position du pincement
const PLUCK = {
  nylon: { t60: 2.6, bright: 0.32, pos: 0.16 }, harpsi: { t60: 3.2, bright: 0.92, pos: 0.07, oct: 0.35 }, upright: { t60: 1.6, bright: 0.12, pos: 0.22, thump: 0.35 },
  pizz: { t60: 0.6, bright: 0.3, pos: 0.3 }, clean: { t60: 1.1, bright: 0.55, pos: 0.2 }, harp: { t60: 3.5, bright: 0.42, pos: 0.32 },
};
function ks(d, sr, f, r, o, gain = 1) {
  const N = Math.max(4, Math.round(sr / f + 0.5)), f0 = sr / (N - 0.5), loss = Math.pow(0.001, 1 / (f0 * (o.t60 ?? 2))), br = o.bright ?? 0.5;
  let buf = new Float32Array(N), z = 0, mean = 0;
  for (let i = 0; i < N; i++) { z += (r() * 2 - 1 - z) * br; buf[i] = z; mean += z; }
  mean /= N; for (let i = 0; i < N; i++) buf[i] -= mean;
  if (o.pos) { const P = Math.max(1, Math.round(N * o.pos)), cp = buf.slice(); for (let i = 0; i < N; i++) buf[i] = cp[i] - cp[(i - P + N) % N]; }
  let idx = 0;
  for (let i = 0; i < d.length; i++) { const nx = idx + 1 === N ? 0 : idx + 1, y = buf[idx]; d[i] += y * gain; buf[idx] = loss * 0.5 * (y + buf[nx]); idx = nx; }
  return f0;
}
function pitched(ctx, kind, n) {
  const base = Math.round(n / 6) * 6, f = mtof(base), sr = Math.min(PSR, ctx.sampleRate);
  if (kind === 'piano') {
    return makeBuf(ctx, 'piano:' + base, clamp(5 * Math.sqrt(110 / f), 1.2, 5), sr, (d, sr2, r) => {
      const B = 0.00008 * Math.pow(Math.max(f, 60) / 60, 1.1), K = Math.min(22, Math.floor((sr2 * 0.45) / f)), t1 = clamp(3.4 * Math.pow(220 / f, 0.55), 0.7, 9), parts = [];
      for (let k = 1; k <= K; k++) {
        const ra = k * Math.sqrt(1 + B * k * k), am = (Math.abs(Math.sin(Math.PI * k * 0.118)) / Math.pow(k, 0.95)) * Math.exp(-k * 0.06), de = t1 / (1 + 0.45 * (k - 1));
        parts.push([ra, am, de]); if (k <= 3) parts.push([ra * 1.0007, am * 0.5, de * 1.6]);
      }
      partials(d, sr2, f, parts, 0.0015, 0.1, r, true); return f;
    });
  }
  if (TINE[kind]) {
    const T = TINE[kind], sc = Math.pow(523 / f, 0.4);
    return makeBuf(ctx, kind + ':' + base, clamp(T.len * sc, 0.4, T.len * 1.6), sr, (d, sr2, r) => { partials(d, sr2, f, T.p.map(([ra, am, de]) => [ra, am, clamp(de * sc, 0.03, 8)]), T.att, T.click, r); return f; });
  }
  const P = PLUCK[kind] || PLUCK.nylon;
  return makeBuf(ctx, kind + ':' + base, Math.min(4, P.t60 * 1.15 + 0.1), sr, (d, sr2, r) => {
    const f0 = ks(d, sr2, f, r, P);
    if (P.oct) ks(d, sr2, f * 2, r, { ...P, t60: P.t60 * 0.7 }, P.oct);
    if (P.thump) for (let i = 0; i < Math.min(d.length, sr2 * 0.08); i++) d[i] += Math.sin((TAU * f0 * i) / sr2) * Math.exp(-i / sr2 / 0.02) * P.thump;
    return f0;
  });
}
// formes d'onde (PeriodicWave) : harmoniques en sinus, ou coefficients complets pour les impulsions « chiptune »
function wave(ctx, name) {
  const m = store(ctx), key = 'w:' + name; let w = m.get(key); if (w) return w;
  const H = { organ: [1, 0.75, 0.55, 0.3, 0, 0.18, 0, 0.12], calliope: [1, 0.32, 0.12, 0.05, 0.02], bass: [1, 0.55, 0.35, 0.22, 0.14, 0.09, 0.06, 0.04], sub: [1, 0.12, 0.03],
    flute: [1, 0.22, 0.07, 0.03], melodica: [1, 0.45, 0.55, 0.25, 0.3, 0.12, 0.15, 0.08], combo: [1, 0, 0.45, 0, 0.3, 0, 0.2, 0, 0.12, 0, 0.08] };
  let re, im;
  if (name.startsWith('pulse')) {
    const D = +name.slice(5) / 100; re = new Float32Array(48); im = new Float32Array(48);
    for (let k = 1; k < 48; k++) re[k] = ((2 / (k * Math.PI)) * Math.sin(k * Math.PI * D));
  } else if (name === 'tri4') { // triangle 4 bits en 32 marches (canal triangle des consoles 8 bits)
    re = new Float32Array(32); im = new Float32Array(32); const s = [];
    for (let j = 0; j < 32; j++) s.push((j < 16 ? 15 - j : j - 16) / 7.5 - 1);
    for (let k = 1; k < 32; k++) { let a = 0, b = 0; for (let j = 0; j < 32; j++) { a += s[j] * Math.cos((TAU * k * j) / 32); b += s[j] * Math.sin((TAU * k * j) / 32); } re[k] = a / 16; im[k] = b / 16; }
  } else if (name === 'reed') {
    re = new Float32Array(27); im = new Float32Array(27); for (let k = 1; k < 27; k++) im[k] = (k % 2 ? 1 : 0.7) / Math.pow(k, 0.85);
  } else { const a = H[name] || H.organ; re = new Float32Array(a.length + 1); im = new Float32Array(a.length + 1); a.forEach((x, k) => (im[k + 1] = x)); }
  w = ctx.createPeriodicWave(re, im); m.set(key, w); return w;
}

// ───────────────────────── nœuds utilitaires ─────────────────────────
// filtres en k-rate : coefficients recalculés par bloc de 128 échantillons (≈ 3× moins cher qu'en a-rate)
function bq(c, type, f, q = 0.7, gain = 0) {
  const n = c.createBiquadFilter(); n.type = type;
  try { n.frequency.automationRate = 'k-rate'; n.Q.automationRate = 'k-rate'; } catch (e) { /* navigateur ancien */ }
  n.frequency.value = f; n.Q.value = q; n.gain.value = gain; return n;
}
const satCache = new Map();
// limiteur doux : linéaire jusqu'à 0,5 (-6 dBFS), puis genou en tanh vers 0,95 — coût négligeable
let limCurve = null;
function limiter() {
  if (limCurve) return limCurve; limCurve = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) { const x = (i / 2047.5 - 1) * 2, a = Math.abs(x); limCurve[i] = Math.sign(x) * (a < 0.5 ? a : 0.5 + 0.45 * Math.tanh((a - 0.5) / 0.45)); }
  return limCurve;
}
function satCurve(k, bits = 0) {
  const key = k + ':' + bits; let cv = satCache.get(key); if (cv) return cv;
  cv = new Float32Array(2048); const q = bits ? Math.pow(2, bits - 1) : 0, nk = Math.tanh(k * 3);
  for (let i = 0; i < 2048; i++) { let x = Math.tanh(((i / 1023.5) - 1) * k * 3) / nk; if (q) x = Math.round(x * q) / q; cv[i] = x; }
  satCache.set(key, cv); return cv;
}
// profondeur (s) d'une modulation de retard donnant ±cents de variation de hauteur à la fréquence rate
const depthFor = (rate, cents) => (Math.pow(2, cents / 1200) - 1) / (TAU * rate);
const ACTIVE = new Set();

// ───────────────────────── morceau : horloge, ordonnanceur, voix, pistes ─────────────────────────
class Song {
  constructor(ctx, name, def, opts) {
    this.ctx = ctx; this.name = name; this.def = def; this.opts = opts;
    const sd = opts.seed ?? Math.floor(Math.random() * 4294967296);
    this.seed = hashString(name + '|' + String(sd));
    this.R = makeRng(this.seed); this.H = makeRng((this.seed ^ 0x2545f491) >>> 0);
    this.tempo = 1; this.styleTempo = 1; this.cents = 0; this.intensity = Number.isFinite(+opts.intensity) ? clamp(+opts.intensity, 0, 1) : 0.6;
    this.vol = Number.isFinite(+opts.volume) ? clamp(+opts.volume, 0, 4) : 1;
    this.stopped = false; this.dead = false; this.endT = Infinity; this.errors = 0;
    this.live = []; this.queue = []; this.nodes = []; this.srcs = []; this.tracks = {}; this.vl = {}; this.cur = null;
    this.meter = def.meter || 4; this.swing = def.swing || 0; this.swingUnit = def.swingUnit || 0.5; this.hum = def.hum ?? 0.008; this.humV = def.humV ?? 0.08;
    this.kit = def.kit || 'std'; this.barB = 0; this.barN = 0; this.cycle = 0; this.fi = 0; this.bis = 0; this.bpm = 100; this.key = 60; this.sc = SCALE.maj;
  }
  start() {
    const ctx = this.ctx, def = this.def, opts = this.opts;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    // pre (gain de calibration du style) → couleur → limiteur doux (crêtes ≈ -6 dBFS) → out (volume, fondus)
    this.pre = this.node(ctx.createGain()); this.pre.gain.value = def.gain ?? 0.7;
    const lim = this.node(ctx.createWaveShaper()); lim.curve = limiter();
    this.tone(def.tone || EMPTY).connect(lim); lim.connect(this.out);
    const bus = typeof opts.bus === 'string' ? opts.bus : 'music';
    this.spatial = null;
    if (opts.pos && typeof opts.pos === 'object') {
      try { const sp = Audio.spatial({ pos: opts.pos, ref: opts.ref ?? 2, maxDist: opts.maxDist ?? 60, bus, occlude: opts.occlude ?? true, volume: 1 }); if (sp && sp.input) this.spatial = sp; } catch (e) { warnOnce('spatial', 'Audio.spatial indisponible', e); }
    }
    let dest = this.spatial ? this.spatial.input : null;
    if (!dest) { try { dest = Audio.output(bus); } catch (e) { dest = null; } }
    this.out.connect(dest || ctx.destination);
    this.mono = !!this.spatial || !!def.mono;
    def.init(this);
    this.key0 = this.key; this.bpm0 = this.bpm;
    this.enter();
    const now = ctx.currentTime;
    this.anchorT = now + 0.06; this.anchorB = 0;
    const g = this.out.gain; g.setValueAtTime(0, now); g.linearRampToValueAtTime(this.level(), now + 0.08);
    ACTIVE.add(this);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }
  level() { return this.vol; }
  node(n) { this.nodes.push(n); return n; }
  src(n, t) { this.srcs.push(n); this.nodes.push(n); n.start(t ?? this.ctx.currentTime); return n; }
  lfo(rate, depth, param, type = 'sine') {
    const o = this.ctx.createOscillator(), g = this.node(this.ctx.createGain()); o.type = type; o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param); this.src(o); return { o, g };
  }
  // couleur du morceau : filtres, saturation/quantification, pleurage (ligne à retard modulée → hauteur de tout le morceau)
  tone(o) {
    const c = this.ctx; let last = this.pre;
    const add = (n) => { last.connect(n); last = this.node(n); return n; };
    if (o.hp) add(bq(c, 'highpass', o.hp, 0.7));
    if (o.band) { add(bq(c, 'highpass', o.band[0], 0.8)); add(bq(c, 'highpass', o.band[0], 0.8)); add(bq(c, 'lowpass', o.band[1], 0.8)); add(bq(c, 'lowpass', o.band[1], 0.8)); }
    if (o.peak) add(bq(c, 'peaking', o.peak[0], o.peak[2] ?? 1, o.peak[1]));
    if (o.lp) add(bq(c, 'lowpass', o.lp, o.lpq ?? 0.6));
    if (o.sat) { const ws = add(c.createWaveShaper()); ws.curve = satCurve(o.sat, o.bits || 0); }
    if (o.wow) {
      const d = add(c.createDelay(0.5)); d.delayTime.value = 0;
      const base = this.src(c.createConstantSource()); base.offset.value = 0.04; base.connect(d.delayTime); this.wowBase = base.offset;
      this.lfo(o.wow[0], depthFor(o.wow[0], o.wow[1]), d.delayTime);
      if (o.flutter) this.lfo(o.flutter[0], depthFor(o.flutter[0], o.flutter[1]), d.delayTime);
    }
    return last;
  }
  // piste : entrée → [distorsion + baffle] → filtres → [vibrato] → sortie (+chorus, trémolo, ducking) → [pan] → pre ; écho en envoi
  track(name, o = EMPTY) {
    const c = this.ctx, inp = this.node(c.createGain()); let last = inp;
    const add = (n) => { last.connect(n); last = this.node(n); return n; };
    if (o.dist) {
      add(c.createGain()).gain.value = o.dist; const ws = add(c.createWaveShaper()); ws.curve = satCurve(1); ws.oversample = '2x';
      add(bq(c, 'highpass', 90, 0.7)); add(bq(c, 'peaking', 1500, 0.9, 4)); add(bq(c, 'lowpass', o.cab ?? 4600, 0.9)); add(bq(c, 'lowpass', (o.cab ?? 4600) * 1.5, 0.6));
    }
    if (o.hp) add(bq(c, 'highpass', o.hp, o.hpq ?? 0.7));
    if (o.lp) add(bq(c, 'lowpass', o.lp, o.lpq ?? 0.7));
    if (o.peak) add(bq(c, 'peaking', o.peak[0], o.peak[2] ?? 1, o.peak[1]));
    if (o.vib) { const d = add(c.createDelay(0.1)); d.delayTime.value = 0.012; this.lfo(o.vib[0], depthFor(o.vib[0], o.vib[1]), d.delayTime); }
    const gain = o.gain ?? 1, out = this.node(c.createGain()); out.gain.value = gain; last.connect(out);
    if (o.chorus) {
      const d = this.node(c.createDelay(0.1)), w = this.node(c.createGain()); d.delayTime.value = 0.016; w.gain.value = o.chorus;
      last.connect(d); d.connect(w); w.connect(out); this.lfo(0.53, 0.0032, d.delayTime); this.lfo(0.19, 0.0021, d.delayTime, 'triangle');
    }
    if (o.trem) { out.gain.value = gain * (1 - o.trem[1] / 2); this.lfo(o.trem[0], (gain * o.trem[1]) / 2, out.gain); }
    let post = out, dk = null;
    if (o.duck) { dk = this.node(c.createGain()); out.connect(dk); post = dk; }
    if (!this.mono && (o.pan || o.autopan)) {
      const p = this.node(c.createStereoPanner()); p.pan.value = o.pan || 0; post.connect(p); p.connect(this.pre);
      if (o.autopan) this.lfo(o.autopan[0], o.autopan[1], p.pan);
    } else post.connect(this.pre);
    if (o.echo) {
      const [time, fb, wet, lpf] = o.echo, d = this.node(c.createDelay(2)), f = this.node(c.createGain()), l = this.node(bq(c, 'lowpass', lpf ?? 2500, 0.7)), w = this.node(c.createGain());
      d.delayTime.value = Math.min(1.9, time); f.gain.value = fb; w.gain.value = wet;
      post.connect(d); d.connect(l); l.connect(f); f.connect(d); l.connect(w);
      if (!this.mono) { const p = this.node(c.createStereoPanner()); p.pan.value = o.pan ? -o.pan : 0.4; w.connect(p); p.connect(this.pre); } else w.connect(this.pre);
    }
    return (this.tracks[name] = { name, in: inp, out, dk, o, n: 0 });
  }
  // compression « sidechain » simulée : la piste s'efface brièvement (lofi, synthwave)
  duck(tr, t, depth = 0.3, rel = 0.15) {
    if (!tr || !tr.dk) return; const g = tr.dk.gain;
    g.cancelScheduledValues(t); g.setTargetAtTime(1 - depth, t, 0.004); g.setTargetAtTime(1, t + 0.03, rel);
  }
  // ── allocation de voix (≤ MAX_COST oscillateurs/sources par morceau, vol des plus anciennes de priorité ≤) ──
  alloc(t, end, cost, pri) {
    const now = this.ctx.currentTime;
    if (this.live.length > 12) this.live = this.live.filter((v) => v.end > now);
    let used = 0; for (const v of this.live) if (v.end > t) used += v.cost;
    while (used + cost > MAX_COST) {
      let best = null;
      for (const v of this.live) if (v.end > t && v.pri <= pri && (!best || v.pri < best.pri || (v.pri === best.pri && v.t < best.t))) best = v;
      if (!best) return null;
      this.kill(best, Math.max(t, now)); used -= best.cost;
    }
    const v = { t, end, cost, pri, g: null, srcs: [], nodes: [] }; this.live.push(v); return v;
  }
  kill(v, t) {
    v.end = t;
    try { if (v.g) { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.01); } for (const o of v.srcs) o.stop(t + 0.06); } catch (e) { /* */ }
  }
  // ── génération ──
  enter() { this.secName = this.form[this.fi]; this.sec = this.secs[this.secName]; this.secLen = this.sec.len || this.sec.prog.length; }
  genBar() {
    if (this.bis >= this.secLen) {
      this.bis = 0; this.fi++;
      if (this.fi >= this.form.length) { this.fi = 0; this.cycle++; try { (this.def.evolve || evolveDefault)(this); } catch (e) { warnOnce('evolve:' + this.name, e); } }
      this.enter();
    }
    const sec = this.sec, k = this.bis;
    this.chords = sec.prog[k % sec.prog.length];
    this.first = k === 0; this.fill = k === this.secLen - 1; this.barLen = this.meter;
    this.cur = [];
    try { this.def.bar(this, sec, k); } catch (e) { warnOnce('bar:' + this.name, e); }
    const B0 = this.barB;
    for (const e of this.cur) e.B = B0 + clamp(e.b, 0, this.barLen - 1e-6);
    if (this.cur.length) { this.queue.push(...this.cur); this.queue.sort((a, b) => a.B - b.B); }
    this.cur = null; this.barB += this.barLen; this.bis++; this.barN++;
  }
  // ── ordonnanceur à anticipation : convertit les temps musicaux en secondes au fil de l'eau (tempo variable) ──
  tick() {
    if (this.dead) return;
    try {
      const now = this.ctx.currentTime, horizon = now + (typeof document !== 'undefined' && document.hidden ? 1.2 : LOOKAHEAD);
      for (let guard = 0; guard < 600; guard++) {
        const spb = 60 / (this.bpm * this.tempo * this.styleTempo), ev = this.queue[0];
        if (ev) {
          let t = this.anchorT + (ev.B - this.anchorB) * spb;
          if (t > horizon) break;
          this.queue.shift();
          if (t < now - 0.1) t = now + 0.03; // retard (contexte suspendu, onglet ralenti) : on recale l'horloge
          this.anchorT = t; this.anchorB = ev.B;
          if (!this.stopped || t < this.endT) this.dispatch(ev, t, spb, now);
        } else {
          const tb = this.anchorT + (this.barB - this.anchorB) * spb;
          if (tb > horizon || (this.stopped && tb >= this.endT)) break;
          this.genBar();
        }
      }
      if (this.stopped && now >= this.endT + 0.05) this.dispose();
    } catch (e) { warnOnce('tick:' + this.name, 'erreur du séquenceur', e); if (++this.errors > 4) this.stop(0.2); }
  }
  dispatch(ev, t, spb, now) {
    if (ev.i === 'tempo') { this.styleTempo = clamp(ev.v, 0.05, 4); return; }
    const x = ev.x || EMPTY;
    if (ev.i === 'fx') { try { ev.fn(this, Math.max(t, now), ev); } catch (e) { warnOnce('fx:' + this.name, e); } return; }
    const sw = x.sw ?? this.swing;
    if (sw) { const u = this.swingUnit, k = ev.B / u, kr = Math.round(k); if (Math.abs(k - kr) < 1e-3 && kr & 1) t += sw * (u / 3) * spb; }
    const hum = x.hum ?? this.hum; if (hum) t += this.H.gauss() * hum;
    if (x.dt) t += x.dt;
    if (t < now + 0.002) t = now + 0.002;
    const v = clamp(ev.v * (1 + (this.H() - 0.5) * 2 * (x.hv ?? this.humV)), 0, 1.5);
    const tr = this.tracks[ev.tr], fn = INST[ev.i];
    if (tr && fn) fn(this, tr, t, ev.n, v, Math.max(0.02, ev.d * spb), x);
  }
  // ── écriture des événements (b et d en temps, relatifs à la mesure en cours) ──
  ev(tr, i, b, d, n, v, x) { this.cur.push({ b, tr, i, d, n, v, x: x || EMPTY }); }
  hit(kind, b, v = 0.8, x) { this.cur.push({ b, tr: (x && x.tr) || 'dr', i: 'drum', d: 0.25, n: kind, v, x: x || EMPTY }); }
  fx(b, fn, x) { this.cur.push({ b, i: 'fx', fn, x: x || EMPTY }); }
  setTempoAt(b, v) { this.cur.push({ b, i: 'tempo', v }); }
  chordAt(b, chs = this.chords) { return chs[Math.min(chs.length - 1, Math.floor(b / (this.meter / chs.length)))]; }
  nextChord() {
    if (this.bis + 1 < this.secLen) return this.sec.prog[(this.bis + 1) % this.sec.prog.length][0];
    const nx = this.secs[this.form[(this.fi + 1) % this.form.length]]; return nx.prog[0][0];
  }
  bassOf(ch, lo = 33) { return lo + mod(this.key + ch.bass - lo, 12); }
  vo(slot, ch, lo, n = 4, o = EMPTY) { return (this.vl[slot] = voicing(ch, this.key, this.vl[slot], lo, n, o)); }
  // émet les notes d'une mesure de mélodie (relatives à la tonique)
  mel(tr, inst, notes, x = EMPTY, tr2 = 0, vel = 1, leg = 0.95) { if (notes) for (const n of notes) this.ev(tr, inst, n.b, n.d * leg, this.key + n.n + tr2, n.v * vel, x); }
  strum(tr, inst, b, d, notes, v, x = EMPTY, gap = 0.012) { notes.forEach((n, k) => this.ev(tr, inst, b, d, n, v * (k === notes.length - 1 ? 1 : 0.88), gap ? { ...x, dt: (x.dt || 0) + k * gap } : x)); }
  // motif de batterie : un caractère par pas ; X/x accent, o normal, h léger, g fantôme
  pat(str, kind, x, vel = 1) {
    const n = str.length, step = this.meter / n;
    for (let i = 0; i < n; i++) { const c = str[i]; const v = c === 'X' ? 1 : c === 'x' ? 0.88 : c === 'o' ? 0.7 : c === 'h' ? 0.5 : c === 'g' ? 0.28 : 0; if (v) this.hit(kind, i * step, v * vel, x); }
  }
  // ── contrôle ──
  setParam(k, v) {
    if (this.dead) return; const x = +v;
    if (k === 'tempo' && Number.isFinite(x)) this.tempo = clamp(x, 0.05, 4);
    else if (k === 'detune' && Number.isFinite(x)) this.cents = clamp(x, -2400, 2400);
    else if (k === 'intensity' && Number.isFinite(x)) this.intensity = clamp(x, 0, 1);
    else if (typeof k === 'string' && k.startsWith('track:') && Number.isFinite(x)) {
      const tr = this.tracks[k.slice(6)]; if (tr) tr.out.gain.setTargetAtTime(clamp(x, 0, 4) * (tr.o.gain ?? 1) * (tr.o.trem ? 1 - tr.o.trem[1] / 2 : 1), this.ctx.currentTime, 0.03);
    }
    if (this.def.param) this.def.param(this, k, v);
  }
  setVolume(v, ramp = 0.1) {
    if (this.dead || this.stopped) return; const x = +v; if (!Number.isFinite(x)) return;
    this.vol = clamp(x, 0, 4); const now = this.ctx.currentTime, g = this.out.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(this.level(), now + Math.max(0.01, +ramp || 0));
  }
  setPos(v) { if (!this.dead && this.spatial && v && typeof v === 'object') this.spatial.setPos(v); }
  stop(fade = 0.5) {
    if (this.dead) return;
    const now = this.ctx.currentTime, f = clamp(Number.isFinite(+fade) ? +fade : 0.5, 0, 30);
    if (this.stopped && now + f >= this.endT) return;
    this.stopped = true; this.endT = now + f;
    const g = this.out.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
    if (f > 0.01) g.linearRampToValueAtTime(0, now + f); else g.setTargetAtTime(0, now, 0.004);
    clearTimeout(this.killT); this.killT = setTimeout(() => this.dispose(), (f + 0.12) * 1000);
  }
  dispose() {
    if (this.dead) return; this.dead = true; this.stopped = true;
    clearInterval(this.timer); clearTimeout(this.killT); ACTIVE.delete(this);
    for (const v of this.live) for (const o of v.srcs) { try { o.stop(); } catch (e) { /* */ } }
    for (const o of this.srcs) { try { o.stop(); } catch (e) { /* */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* */ } }
    try { this.out.disconnect(); } catch (e) { /* */ }
    try { this.spatial?.dispose(); } catch (e) { /* */ }
    this.live = []; this.queue = []; this.nodes = []; this.srcs = []; this.tracks = {};
  }
}

// ───────────────────────── instruments : (song, piste, t, midi|type, vélocité, durée s, extra) ─────────────────────────
const BUILTIN = new Set(['sine', 'square', 'sawtooth', 'triangle']);
const W = (s, w) => (BUILTIN.has(w) ? w : wave(s.ctx, w));
function V(s, tr, t, end, cost, pri = 1) {
  const v = s.alloc(t, end, cost, pri); if (!v) return null;
  const g = s.ctx.createGain(); g.gain.value = 0; g.connect(tr.in); v.g = g; v.nodes.push(g); return v;
}
function O(s, v, type, f, t, end, cents = 0) {
  const o = s.ctx.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
  o.frequency.value = f; o.detune.value = s.cents + cents; o.start(t); o.stop(end); v.srcs.push(o); v.nodes.push(o); return o;
}
function S(s, v, buf, t, end, rate = 1, cents = 0, loop = false, offset = 0) {
  const b = s.ctx.createBufferSource(); b.buffer = buf; b.playbackRate.value = rate; if (b.detune) b.detune.value = cents; b.loop = loop;
  b.start(t, loop ? offset % buf.duration : 0); b.stop(end); v.srcs.push(b); v.nodes.push(b); return b;
}
const F = (s, v, type, f, q) => { const n = bq(s.ctx, type, f, q); v.nodes.push(n); return n; };
function fin(v) { const last = v.srcs[v.srcs.length - 1]; if (last) last.onended = () => { for (const n of v.nodes) { try { n.disconnect(); } catch (e) { /* */ } } }; }
// ADSR : attaque linéaire, décroissance exponentielle vers sus, relâchement à `off`
function adsr(p, t, a, peak, dec, sus, off, rel) {
  p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
  if (sus !== 1 && off > t + a) p.setTargetAtTime(peak * sus, t + a, dec / 3);
  p.setTargetAtTime(0, Math.max(off, t + a), rel / 5);
}
const BASS = {
  sub: { w: 'sub', a: 0.012, d: 0.6, s: 0.8, r: 0.08, g: 0.42 },
  finger: { w: 'bass', c0: 900, kf: 4, c1: 220, q: 0.9, fd: 0.18, a: 0.006, d: 0.7, s: 0.45, r: 0.06, g: 0.42 },
  synth: { w: 'sawtooth', c0: 1800, kf: 2, c1: 180, q: 5, fd: 0.09, a: 0.003, d: 0.3, s: 0.65, r: 0.05, g: 0.3 },
  slap: { w: 'bass', c0: 3500, kf: 6, c1: 300, q: 1.6, fd: 0.06, a: 0.002, d: 0.35, s: 0.4, r: 0.04, g: 0.42, blip: 1.03 },
  pick: { w: 'sawtooth', c0: 1600, kf: 3, c1: 400, q: 1, fd: 0.2, a: 0.003, d: 0.5, s: 0.6, r: 0.05, g: 0.3 },
  tri: { w: 'tri4', a: 0.002, d: 0.1, s: 1, r: 0.02, g: 0.36 },
  tuba: { w: 'sawtooth', c0: 500, kf: 2.5, c1: 200, q: 0.8, fd: 0.12, a: 0.04, d: 0.4, s: 0.75, r: 0.08, g: 0.36 },
  dead: { w: 'bass', c0: 700, kf: 1, c1: 150, q: 1, fd: 0.02, a: 0.001, d: 0.03, s: 0, r: 0.02, g: 0.3 },
};
const DGAIN = { kick: 1, snare: 0.8, clap: 0.7, hat: 0.35, phat: 0.3, ohat: 0.35, ride: 0.35, rbell: 0.35, crash: 0.45, rim: 0.5, tom: 0.75, shaker: 0.3, tamb: 0.4, sleigh: 0.4, brush: 0.45, timp: 0.9, tri: 0.35, block: 0.5, cow: 0.45, syn: 0.6, bd: 1, tick: 0.4, nkick: 0.7, nsnare: 0.5, nhat: 0.3 };
const VOWEL = { a: [730, 1090, 2440], o: [570, 840, 2410], u: [300, 870, 2240], e: [530, 1840, 2480], i: [270, 2290, 3010] };
const INST = {
  // Rhodes : FM 1:1, indice élevé à l'attaque (attaque « cloche ») qui s'adoucit, extinction selon le registre
  fm(s, tr, t, n, v, dur, x) {
    const f = mtof(n), dec = 2.4 * Math.pow(220 / f, 0.35), off = t + Math.min(dur, dec * 2), end = off + 0.35;
    const vc = V(s, tr, t, end, 2, x.pri ?? 2); if (!vc) return;
    const c = O(s, vc, 'sine', f, t, end), m = O(s, vc, 'sine', f * (x.ratio || 1), t, end, 1.5), mg = s.ctx.createGain(); vc.nodes.push(mg);
    m.connect(mg); mg.connect(c.frequency); c.connect(vc.g);
    const I0 = f * (0.7 + 2.3 * v * v) * (x.idx ?? 1) * Math.min(1.3, Math.sqrt(300 / f));
    mg.gain.setValueAtTime(I0, t); mg.gain.setTargetAtTime(I0 * 0.2, t, 0.1); mg.gain.setTargetAtTime(0, off, 0.08);
    const a = 0.16 * v * (x.g ?? 1), g = vc.g.gain;
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(a, t + 0.003); g.setTargetAtTime(a * 0.55, t + 0.003, 0.12);
    if (off > t + 0.25) g.setTargetAtTime(0, t + 0.25, dec / 2.5);
    g.setTargetAtTime(0, off, 0.06); fin(vc);
  },
  piano(s, tr, t, n, v, dur, x) {
    const buf = pitched(s.ctx, 'piano', n), rate = mtof(n) / buf.f0, len = buf.duration / rate;
    const off = t + Math.min(dur + (x.ped || 0), len), end = Math.min(t + len, off + 0.4);
    const vc = V(s, tr, t, end, 1, x.pri ?? 2); if (!vc) return;
    const src = S(s, vc, buf, t, end, rate, s.cents + (x.c || 0)), lp = F(s, vc, 'lowpass', Math.min(16000, 700 + mtof(n) * (2 + 10 * v * v)), 0.5);
    src.connect(lp); lp.connect(vc.g);
    const g = vc.g.gain; g.setValueAtTime(0.5 * Math.pow(v, 1.3) * (x.g ?? 1), t); g.setTargetAtTime(0, off, 0.07); fin(vc);
  },
  tine(s, tr, t, n, v, dur, x) {
    const buf = pitched(s.ctx, x.k || 'glock', n), rate = mtof(n) / buf.f0, len = buf.duration / rate;
    const off = x.damp ? t + Math.min(dur, len) : t + len, end = Math.min(t + len, off + 0.2) + 0.01;
    const vc = V(s, tr, t, end, 1, x.pri ?? 1); if (!vc) return;
    S(s, vc, buf, t, end, rate, s.cents + (x.c || 0)).connect(vc.g);
    const g = vc.g.gain; g.setValueAtTime(0.5 * Math.pow(v, 1.2) * (x.g ?? 1), t); if (x.damp) g.setTargetAtTime(0, off, 0.05); fin(vc);
  },
  pluck(s, tr, t, n, v, dur, x) {
    const buf = pitched(s.ctx, x.k || 'nylon', n), rate = mtof(n) / buf.f0, len = buf.duration / rate;
    const off = t + Math.min(dur, len), end = Math.min(t + len, off + 0.3);
    const vc = V(s, tr, t, end, 1, x.pri ?? 1); if (!vc) return;
    const src = S(s, vc, buf, t, end, rate, s.cents + (x.c || 0));
    if (x.lp) { const l = F(s, vc, 'lowpass', x.lp, 0.6); src.connect(l); l.connect(vc.g); } else src.connect(vc.g);
    const g = vc.g.gain; g.setValueAtTime(0.55 * Math.pow(v, 1.2) * (x.g ?? 1), t); g.setTargetAtTime(0, off, x.rel ?? 0.06); fin(vc);
  },
  pad(s, tr, t, n, v, dur, x) {
    const f = mtof(n), a = x.a ?? 0.35, r = x.r ?? 0.6, off = t + dur, end = off + r * 1.4 + 0.05, det = x.det || 0;
    const vc = V(s, tr, t, end, det ? 2 : 1, x.pri ?? 1); if (!vc) return;
    const w = W(s, x.w || 'sawtooth'); let dst = vc.g;
    if (x.lp) { const l = F(s, vc, 'lowpass', x.lp, x.q ?? 0.7); l.connect(vc.g); dst = l; if (x.swell) { l.frequency.setValueAtTime(x.lp * 0.35, t); l.frequency.linearRampToValueAtTime(x.lp, t + a * 1.5); } }
    O(s, vc, w, f, t, end, -det / 2 + (x.c || 0)).connect(dst);
    if (det) O(s, vc, w, f, t, end, det / 2 + (x.c || 0)).connect(dst);
    adsr(vc.g.gain, t, a, (0.12 * v * (x.g ?? 1)) / (det ? 1.5 : 1), x.dec ?? 0.8, x.sus ?? 0.85, off, r); fin(vc);
  },
  organ(s, tr, t, n, v, dur, x) { INST.pad(s, tr, t, n, v, dur, { w: 'organ', a: 0.012, r: 0.08, sus: 1, ...x }); },
  // accordéon : deux anches accordées « musette » (battements), soufflet doux
  reed(s, tr, t, n, v, dur, x) { INST.pad(s, tr, t, n, v, dur, { w: 'reed', a: 0.03, r: 0.07, sus: 0.92, dec: 0.4, det: 22, lp: 3400, ...x }); },
  brass(s, tr, t, n, v, dur, x) {
    const f = mtof(n), a = x.a ?? 0.045, off = t + dur, end = off + 0.2;
    const vc = V(s, tr, t, end, 2, x.pri ?? 2); if (!vc) return;
    const l = F(s, vc, 'lowpass', f, 1.1); l.connect(vc.g);
    for (const c of [-4, 5]) { const o = O(s, vc, 'sawtooth', f, t, end, c + (x.c || 0)); o.frequency.setValueAtTime(f * 0.97, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); o.connect(l); }
    const br = x.bright ?? 1, top = Math.min(12000, f * (2 + 7 * v * br)), sus = Math.min(10000, f * (1.6 + 3.5 * v * br));
    l.frequency.setValueAtTime(f * 1.1, t); l.frequency.linearRampToValueAtTime(top, t + a * 1.6); l.frequency.setTargetAtTime(sus, t + a * 1.6, 0.15); l.frequency.setTargetAtTime(f, off, 0.05);
    adsr(vc.g.gain, t, a, 0.11 * v * (x.g ?? 1), 0.3, 0.8, off, 0.12); fin(vc);
  },
  flute(s, tr, t, n, v, dur, x) {
    const f = mtof(n), off = t + dur, end = off + 0.15;
    const vc = V(s, tr, t, end, 2, x.pri ?? 2); if (!vc) return;
    O(s, vc, wave(s.ctx, 'flute'), f, t, end, x.c || 0).connect(vc.g);
    const nb = S(s, vc, noiseBuf(s.ctx), t, end, 1, 0, true, s.H() * 1.5), bp = F(s, vc, 'bandpass', Math.min(9000, f * 2), 1.2), ng = s.ctx.createGain(); vc.nodes.push(ng);
    nb.connect(bp); bp.connect(ng); ng.connect(vc.g); ng.gain.setValueAtTime(0.9, t); ng.gain.setTargetAtTime(0.25, t + 0.03, 0.05);
    adsr(vc.g.gain, t, x.a ?? 0.04, 0.13 * v * (x.g ?? 1), 0.2, 0.85, off, 0.1); fin(vc);
  },
  lead(s, tr, t, n, v, dur, x) {
    const f = mtof(n), off = t + dur, end = off + (x.r ?? 0.1) * 1.5 + 0.02, det = x.det || 0;
    const vc = V(s, tr, t, end, det ? 2 : 1, x.pri ?? 2); if (!vc) return;
    const w = W(s, x.w || 'sawtooth'), cut = x.cut ?? 2400, l = F(s, vc, 'lowpass', cut, x.q ?? 3); l.connect(vc.g);
    const mk = (c) => { const o = O(s, vc, w, f, t, end, c + (x.c || 0)); if (x.from) { o.frequency.setValueAtTime(mtof(x.from), t); o.frequency.exponentialRampToValueAtTime(f, t + (x.gl ?? 0.07)); } o.connect(l); };
    mk(-det / 2); if (det) mk(det / 2);
    l.frequency.setValueAtTime(Math.min(15000, cut * (1 + (x.env ?? 2.5) * v)), t); l.frequency.setTargetAtTime(cut, t, x.fd ?? 0.12);
    adsr(vc.g.gain, t, x.a ?? 0.005, 0.12 * v * (x.g ?? 1), x.dec ?? 0.25, x.sus ?? 0.7, off, x.r ?? 0.1); fin(vc);
  },
  bass(s, tr, t, n, v, dur, x) {
    const P = BASS[x.k || 'finger'] || BASS.finger, f = mtof(n), off = t + dur, end = off + P.r * 1.4 + 0.02;
    const vc = V(s, tr, t, end, 1, x.pri ?? 3); if (!vc) return;
    const o = O(s, vc, W(s, P.w), f, t, end, x.c || 0);
    if (P.blip) { o.frequency.setValueAtTime(f * P.blip, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.025); }
    if (x.slide) { o.frequency.setValueAtTime(f, t + dur * 0.5); o.frequency.exponentialRampToValueAtTime(mtof(n + x.slide), off); }
    if (P.c0) {
      const l = F(s, vc, 'lowpass', P.c0, P.q); o.connect(l); l.connect(vc.g);
      l.frequency.setValueAtTime(Math.min(12000, (P.c0 + f * P.kf) * (0.5 + v) * (x.pop ? 2 : 1)), t); l.frequency.setTargetAtTime(P.c1 + f * 1.5, t + 0.005, P.fd);
    } else o.connect(vc.g);
    adsr(vc.g.gain, t, P.a, P.g * v * (x.g ?? 1), P.d, P.s, off, P.r); fin(vc);
  },
  // clavinet « wah » : impulsion 25 %, passe-bande qui se referme à chaque note (wah à enveloppe)
  clav(s, tr, t, n, v, dur, x) {
    const f = mtof(n), off = t + Math.min(dur, 0.6), end = off + 0.05;
    const vc = V(s, tr, t, end, 1, x.pri ?? 1); if (!vc) return;
    const o = O(s, vc, wave(s.ctx, 'pulse25'), f, t, end), bp = F(s, vc, 'bandpass', 2800, x.q ?? 3.2); o.connect(bp); bp.connect(vc.g);
    bp.frequency.setValueAtTime(Math.min(8000, 900 + 2600 * v + f), t); bp.frequency.setTargetAtTime(500 + f, t + 0.01, x.wah ?? 0.07);
    adsr(vc.g.gain, t, 0.002, 0.34 * v * (x.g ?? 1), 0.18, 0.35, off, 0.025); fin(vc);
  },
  // guitare saturée : dents de scie (quinte/octave) → passe-bas (étouffé si palm mute) → distorsion + baffle de la piste
  gtr(s, tr, t, n, v, dur, x) {
    const pc = x.pc || [0, 7, 12], pm = !!x.pm, off = t + dur, end = off + (pm ? 0.03 : 0.12);
    const vc = V(s, tr, t, end, pc.length, x.pri ?? 2); if (!vc) return;
    const l = F(s, vc, 'lowpass', pm ? 450 + 500 * v : 3200 + 2400 * v, 0.8); l.connect(vc.g);
    for (const iv of pc) O(s, vc, 'sawtooth', mtof(n + iv), t, end, (s.H() - 0.5) * 8 + (x.c || 0)).connect(l);
    const g = vc.g.gain, a = 0.32 * (0.6 + 0.4 * v);
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(a, t + 0.002);
    g.setTargetAtTime(pm ? a * 0.25 : a * 0.6, t + 0.002, pm ? 0.05 : 1.5); g.setTargetAtTime(0, off, 0.02); fin(vc);
  },
  // canal « 8 bits » : impulsion/triangle, volume par paliers, arpèges rapides et vibrato en marches
  chip(s, tr, t, n, v, dur, x) {
    const off = t + dur, end = off + 0.02;
    const vc = V(s, tr, t, end, 1, x.pri ?? 2); if (!vc) return;
    const o = O(s, vc, W(s, x.w || 'pulse50'), mtof(n), t, end, x.c || 0);
    if (x.arp) { const st = x.as || 1 / 60; for (let tt = t, k = 0; tt < off && k < 400; tt += st, k++) o.frequency.setValueAtTime(mtof(n + x.arp[k % x.arp.length]), tt); }
    else if (x.vib && dur > 0.2) { for (let tt = t + 0.15, k = 0; tt < off && k < 200; tt += 1 / 30, k++) o.detune.setValueAtTime(s.cents + Math.sin(k * 1.3) * x.vib, tt); }
    if (x.sl) o.frequency.exponentialRampToValueAtTime(mtof(n + x.sl), off);
    const g = vc.g.gain, a = 0.11 * v * (x.g ?? 1), sus = x.sus ?? 0.55, dec = x.dec ?? 0.03;
    g.setValueAtTime(a, t); for (let k = 1; k <= 6; k++) { const tt = t + k * dec; if (tt >= off) break; g.setValueAtTime(a * (1 - ((1 - sus) * k) / 6), tt); }
    g.setTargetAtTime(0, off, 0.003); fin(vc);
  },
  drum(s, tr, t, kind, v, dur, x) {
    const buf = drumBuf(s.ctx, x.kit || s.kit, kind); if (!buf) return;
    const rate = (x.p ?? 1) * (1 + (s.H() - 0.5) * 0.02), len = buf.duration / rate, end = t + (x.cut ? Math.min(len, x.cut) : len) + 0.01;
    if ((kind === 'hat' || kind === 'phat') && tr.oh && tr.oh.end > t) s.kill(tr.oh, t);
    const vc = V(s, tr, t, end, 1, kind === 'kick' || kind === 'snare' ? 3 : 1); if (!vc) return;
    S(s, vc, buf, t, end, rate, x.c || 0).connect(vc.g);
    const g = vc.g.gain; g.setValueAtTime(Math.pow(v, 1.5) * (x.g ?? 1) * (DGAIN[kind] ?? 0.8), t);
    if (x.cut) g.setTargetAtTime(0, t + x.cut - 0.012, 0.006);
    if (kind === 'ohat') tr.oh = vc;
    if (x.duck) s.duck(s.tracks[x.duck], t, x.dd ?? 0.3, x.dr ?? 0.15);
    fin(vc);
  },
  // voix fantôme : souffle + glotte (dent de scie vibrée) dans trois formants qui glissent d'une voyelle à l'autre
  voice(s, tr, t, n, v, dur, x) {
    const f = mtof(n), off = t + dur, end = off + 0.9, c = s.ctx;
    const vc = V(s, tr, t, end, 3, 2); if (!vc) return;
    const mix = c.createGain(), ng = c.createGain(), og = c.createGain(), lg = c.createGain(); vc.nodes.push(mix, ng, og, lg);
    const ns = S(s, vc, noiseBuf(c), t, end, 1, 0, true, s.H() * 1.5); ng.gain.value = x.breath ?? 0.7; ns.connect(ng); ng.connect(mix);
    const o = O(s, vc, 'sawtooth', f, t, end); og.gain.value = x.tone ?? 0.25; o.connect(og); og.connect(mix);
    const lfo = O(s, vc, 'sine', 5.2, t, end); lg.gain.value = f * 0.012; lfo.connect(lg); lg.connect(o.frequency);
    const v1 = VOWEL[x.vw || 'u'], v2 = VOWEL[x.vw2 || x.vw || 'o'];
    v1.forEach((F0, k) => {
      const bp = F(s, vc, 'bandpass', F0, [9, 11, 12][k]), fg = c.createGain(); vc.nodes.push(fg); fg.gain.value = [1.2, 0.7, 0.3][k];
      mix.connect(bp); bp.connect(fg); fg.connect(vc.g); bp.frequency.setTargetAtTime(v2[k], t + dur * 0.4, dur * 0.3);
    });
    adsr(vc.g.gain, t, x.a ?? 0.35, 0.5 * v * (x.g ?? 1), 0.5, 0.85, off, 0.7); fin(vc);
  },
  // souffle filtré en crescendo (cymbale inversée, rafale de vent, montée)
  swell(s, tr, t, n, v, dur, x) {
    const end = t + dur + (x.r ?? 0.3);
    const vc = V(s, tr, t, end, 1, 1); if (!vc) return;
    const src = S(s, vc, noiseBuf(s.ctx), t, end, 1, 0, true, s.H() * 1.5), f = F(s, vc, x.ft || 'highpass', x.f ?? 3000, x.q ?? 0.7); src.connect(f); f.connect(vc.g);
    if (x.f2) f.frequency.exponentialRampToValueAtTime(x.f2, t + dur);
    const g = vc.g.gain; g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(Math.max(0.001, 0.25 * v * (x.g ?? 1)), t + dur); g.setTargetAtTime(0, t + dur, (x.r ?? 0.3) / 4); fin(vc);
  },
  drop(s, tr, t, n, v, dur, x) {
    const f = mtof(n), end = t + 0.12, vc = V(s, tr, t, end, 1, 0); if (!vc) return;
    const o = O(s, vc, 'sine', f, t, end); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (x.up ?? 2.2), t + 0.05); o.connect(vc.g);
    const g = vc.g.gain; g.setValueAtTime(0, t); g.linearRampToValueAtTime(0.15 * v, t + 0.003); g.setTargetAtTime(0, t + 0.004, 0.025); fin(vc);
  },
  slide(s, tr, t, n, v, dur, x) {
    const off = t + dur, end = off + 0.08, vc = V(s, tr, t, end, 1, 1); if (!vc) return;
    const o = O(s, vc, wave(s.ctx, 'flute'), mtof(n), t, end); o.frequency.setValueAtTime(mtof(n), t); o.frequency.exponentialRampToValueAtTime(mtof(x.to ?? n + 12), off); o.connect(vc.g);
    adsr(vc.g.gain, t, 0.03, 0.12 * v, 0.2, 0.9, off, 0.06); fin(vc);
  },
};
// boucle permanente (craquements, souffle, parasites) branchée sur une piste
function bed(s, trName, buf, gain = 1, rate = 1) {
  const b = s.ctx.createBufferSource(); b.buffer = buf; b.loop = true; b.playbackRate.value = rate;
  const g = s.node(s.ctx.createGain()); g.gain.value = gain; b.connect(g); g.connect(s.tracks[trName].in); s.src(b, s.ctx.currentTime + 0.05); return { src: b, g };
}

// ───────────────────────── outils de composition partagés ─────────────────────────
const minorish = (str) => /^(b?i(?!i|v)|bvi)/.test(str.trim().split(/\s+/)[0].split(',')[0]);
// section : progression (o.rep : répétée deux fois), mélodie générée (o.mel), longueur en mesures
function section(s, str, o = EMPTY) {
  const p = prog(o.rep ? str + ' ' + str : str), sec = { prog: p, len: o.len || p.length, str, o };
  if (o.mel) { sec.melo = { scale: minorish(str) ? (o.minSc || SCALE.dor) : s.sc, meter: s.meter, ...o.mel }; sec.mel0 = genMelody(s.R, p, sec.melo); sec.mel = sec.mel0; }
  return sec;
}
// évolution par défaut à chaque tour de forme : variations mélodiques, nouveau pont de temps en temps, modulation
function evolveDefault(s) {
  const R = s.R;
  for (const k in s.secs) { const sec = s.secs[k]; if (sec.mel0) sec.mel = vary(R, sec.mel0, Math.min(0.6, 0.2 + 0.1 * s.cycle), sec.melo.scale); }
  const pool = s.def.pool;
  if (pool && s.cycle % 2 === 0 && s.secs.B) { const old = s.secs.B; s.secs.B = section(s, R.pick(pool), old.o); }
  if (s.def.mods && R.chance(0.4)) s.key = s.key0 + R.pick(s.def.mods);
}
const nearOct = (n, ref) => n + 12 * Math.round((ref - n) / 12);
// walking bass : fondamentale sur l'accord, notes de l'accord, approche chromatique (ou par la quinte) de l'accord suivant
function walk(s, tr, lo, x, inst = 'pluck') {
  const R = s.R, seg = s.meter / s.chords.length; let prev = s.lastBass ?? s.bassOf(s.chords[0], lo);
  for (let b = 0; b < s.meter; b++) {
    const ch = s.chordAt(b), nb = b + 1, nxt = nb >= s.meter ? s.nextChord() : nb % seg === 0 ? s.chordAt(nb) : null;
    let n;
    if (b % seg === 0) n = nearOct(s.bassOf(ch, lo), prev);
    else if (nxt && R.chance(0.8)) n = nearOct(s.bassOf(nxt, lo), prev) + R.pick([-1, 1, -1, 7, -5]);
    else n = nearOct(s.key + ch.r + R.pick(ch.iv.slice(1, 4)), prev + R.pick([-2, 2, 3]));
    while (n > lo + 16) n -= 12; while (n < lo - 5) n += 12;
    s.ev(tr, inst, b, 0.92, n, b % 2 ? 0.72 : 0.86, x); prev = n;
  }
  s.lastBass = prev;
}
// ligne « bebop » en croches : appuis sur les notes de l'accord, passages diatoniques ou chromatiques
function bebop(s, tr, inst, lo, hi, x = EMPTY) {
  const R = s.R, len = R.chance(0.7) ? 8 : R.pick([5, 6]); let n = s.lastSolo ?? s.key + 12, dir = R.chance(0.5) ? 1 : -1;
  for (let i = 0; i < len; i++) {
    const b = i * 0.5, ch = s.chordAt(b);
    if (n > hi) dir = -1; else if (n < lo) dir = 1; else if (R.chance(0.18)) dir = -dir;
    let m = n + dir;
    if (i % 2 === 0) { while (!isTone(m - s.key, ch) && Math.abs(m - n) < 6) m += dir; }
    else if (R.chance(0.7)) { while (!SCALE.maj.includes(mod(m - s.key, 12)) && Math.abs(m - n) < 3) m += dir; }
    n = m; s.ev(tr, inst, b, 0.45, n, i % 2 ? 0.55 : 0.7, x);
  }
  s.lastSolo = n;
}

// ───────────────────────── styles ─────────────────────────
const LOFI_P = ['ii9 V13 Imaj9 vi9', 'Imaj9 vi9 ii9 V13', 'IVmaj9 iii7 vi9 ii9,V7b9', 'ii9 V9 iii7 VI7b9', 'Imaj7 I7 IVmaj7 iv6', 'vi9 ii9 V13 Imaj9', 'IVmaj9 IVmaj9 iii9 VI7b9', 'bVImaj7 bVII9 Imaj9 Imaj9'];
const LOFI_COMP = ['0:3.5', '0:1.5 1.75:2', '0:2.5 2.75:1.25', '0:0.75 1.5:2.5', '0.5:3.5', '0:1.75 2:2'];
const MUZAK_A = ['Imaj7 Imaj7 II7 II7 ii7 bII7 Imaj7 Imaj7', 'Imaj7 vi7 ii7 V7 Imaj7 vi7 ii7 V7', 'IVmaj7 iii7 ii7 V7sus4,V7 Imaj7 vi7 ii7 V7', 'iii7 VI7 ii7 V7 Imaj7 IVmaj7 ii7 V7'];
const MUZAK_B = ['IVmaj7 IVmaj7 iv6 iv6 iii7 VI7b9 ii7 V7', 'vi7 vi7 II7 II7 ii7 ii7 V7 V7', 'IVmaj7 V7 iii7 vi7 ii7 V7 Imaj7 Imaj7'];
const JAZZ_A = ['Imaj7 vi7 ii7 V7 iii7 VI7 ii7 V7', 'Imaj7 VI7b9 ii7 V7 Imaj7 I7 IVmaj7 #ivdim7', 'ii7 V7 Imaj7 Imaj7 ii7 V7 Imaj7 VI7b9'];
const JAZZ_B = ['III7 III7 VI7 VI7 II7 II7 V7 V7', 'iii7 VI7 ii7 V7 iii7 VI7 ii7 V7', 'IVmaj7 iv7 iii7 VI7 ii7 V7 Imaj7 V7'];
const DISCO_P = ['i7 i7 iv7 iv7', 'i7 IV7 i7 IV7', 'ii7 V7 Imaj7 vi7', 'vi7 ii7 V7 Imaj7', 'i7 bVII bVI V7', 'Imaj7 iii7 vi7 V7sus4'];
const ROCK_P = ['I bVII IV I', 'I V vi IV', 'vi IV I V', 'i bVI bVII i', 'I IV bVII IV', 'i bVII bVI bVII', 'I bIII IV I'];

const STYLES = {
  // radio du poste de sécurité : hip-hop lo-fi jazzy, le « lieu sûr »
  lofi: {
    gain: 0.9, swing: 0.45, swingUnit: 0.25, hum: 0.006, kit: 'lofi', pool: LOFI_P, mods: [0, 0, -2, 3, 5],
    tone: { hp: 35, lp: 7800, wow: [0.55, 6], flutter: [5.8, 2] },
    init(s) {
      const R = s.R; s.bpm = R.int(72, 86); s.key = R.int(60, 67); s.sc = SCALE.maj;
      const P = R.shuffle(LOFI_P), mel = { scale: SCALE.pmaj, bank: RH.sparse, lo: 2, hi: 16, rest: 0.3, leap: 0.3 };
      s.secs = { I: section(s, P[0], { len: 2 }), A: section(s, P[0], { rep: true, mel }), B: section(s, P[1], { rep: true, mel }), C: section(s, P[2]) };
      s.form = ['I', 'A', 'B', 'A', 'C'];
      s.track('keys', { lp: 5200, chorus: 0.35, trem: [4.2, 0.2], duck: true });
      s.track('lead', { lp: 3400, pan: 0.25, gain: 0.7, echo: [(60 / s.bpm) * 0.75, 0.3, 0.2, 1800] });
      s.track('bass', { lp: 400 }); s.track('dr', { lp: 7000, hp: 30, gain: 0.9 });
      s.track('vinyl', { hp: 300 }); bed(s, 'vinyl', crackleBuf(s.ctx), 0.07);
      s.leadInst = R.pick(['piano', 'tine']);
    },
    evolve(s) { evolveDefault(s); s.form = s.R.pick([['A', 'B', 'A', 'C'], ['A', 'A', 'B', 'C'], ['B', 'A', 'C', 'A']]); },
    bar(s, sec, k) {
      const R = s.R, intro = s.secName === 'I', brk = s.secName === 'C', chs = s.chords, seg = s.meter / chs.length;
      for (const [b, d] of rhythm(R.pick(LOFI_COMP))) s.strum('keys', 'fm', b, d, s.vo('k', s.chordAt(b), 52, 4, { rootless: true, hi: 76 }), R.range(0.45, 0.62), EMPTY, R.range(0.008, 0.02));
      if (!intro) chs.forEach((ch, i) => {
        const b0 = i * seg, root = s.bassOf(ch, 33);
        s.ev('bass', 'bass', b0, seg * 0.7, root, 0.85, { k: 'sub' });
        if (seg >= 4 && R.chance(0.55)) s.ev('bass', 'bass', b0 + 3.5, 0.45, R.chance(0.5) ? s.bassOf(i + 1 < chs.length ? chs[i + 1] : s.nextChord(), 33) - 1 : root + 7, 0.6, { k: 'sub' });
        else if (seg >= 4 && R.chance(0.5)) s.ev('bass', 'bass', b0 + 2.5, 1, root + R.pick([7, 12, 10]), 0.62, { k: 'sub' });
      });
      if (!intro && !brk) {
        s.pat(s.fill && R.chance(0.5) ? 'x...............' : R.pick(['x.........x.....', 'x.......x.x.....', 'x..x......x.....', 'x.........x..x..']), 'kick', { duck: 'keys', dd: 0.22, dr: 0.18 });
        s.pat('....x.......x...', 'snare', { dt: 0.014 }, 0.8);
        for (let i = 1; i < 16; i++) if (i % 4 && R.chance(0.07)) s.hit('snare', i / 4, 0.18, { dt: 0.01 });
        for (let i = 0; i < 16; i += 2) s.hit('hat', i / 4, (i % 4 ? 0.45 : 0.62) * R.range(0.8, 1.1));
        if (R.chance(0.35)) s.hit('hat', R.pick([7, 11, 15]) / 4, 0.3);
        if (s.fill) s.hit('ohat', 3.5, 0.5);
      } else if (brk) for (let b = 0; b < 4; b++) s.hit('hat', b + 0.5, 0.3);
      if (sec.mel && !intro && (s.secName === 'B' || s.cycle % 2 === 1 || s.fi > 2)) s.mel('lead', s.leadInst, sec.mel[k], s.leadInst === 'tine' ? { k: 'vibes' } : { ped: 0.3 }, 0, 0.75);
    },
  },
  // musique d'ascenseur / galerie marchande : bossa douce, flûte et glockenspiel, nappe de cordes
  muzak: {
    gain: 0.85, swing: 0.08, hum: 0.007, kit: 'soft', pool: MUZAK_B, mods: [0, 0, 5, -2],
    tone: { hp: 60, lp: 11000 },
    init(s) {
      const R = s.R; s.bpm = R.int(96, 108); s.key = R.pick([60, 65, 62, 63, 67, 64]); s.sc = SCALE.maj;
      const mel = { bank: RH.lyric, lo: 4, hi: 21, leap: 0.3, rep: 1 };
      s.secs = { A: section(s, R.pick(MUZAK_A), { mel }), B: section(s, R.pick(MUZAK_B), { mel: { ...mel, bank: RH.pop } }) };
      s.form = ['A', 'A', 'B', 'A'];
      s.track('gtr', { pan: -0.3, gain: 0.8, hp: 120 }); s.track('bass', { lp: 900 });
      s.track('lead', { pan: 0.2, gain: 0.75, vib: [5.2, 9], echo: [(60 / s.bpm) * 0.75, 0.2, 0.15, 3000] });
      s.track('glock', { pan: 0.35, gain: 0.55 }); s.track('pad', { lp: 3000, chorus: 0.5, gain: 0.6 }); s.track('dr', { lp: 9000, gain: 0.75 });
    },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0], odd = s.barN & 1, isB = s.secName === 'B';
      for (const b of odd ? [0.5, 2, 3.5] : [0, 1.5, 3]) s.strum('gtr', 'pluck', b, 0.5, s.vo('g', s.chordAt(b), 50, 4, { drop2: true, hi: 72 }), R.range(0.5, 0.65), { k: 'nylon' }, 0.009);
      const root = s.bassOf(ch, 36), last = s.chords[s.chords.length - 1];
      s.ev('bass', 'pluck', 0, 1.4, root, 0.85, { k: 'upright' }); s.ev('bass', 'pluck', 1.5, 0.4, root + 7, 0.5, { k: 'upright' });
      s.ev('bass', 'pluck', 2, 1.4, s.chords.length > 1 ? s.bassOf(last, 36) : root + 7, 0.75, { k: 'upright' }); s.ev('bass', 'pluck', 3.5, 0.4, s.bassOf(s.nextChord(), 36), 0.5, { k: 'upright' });
      for (let i = 0; i < 16; i++) s.hit('shaker', i / 4, i % 2 ? 0.32 : 0.5);
      for (const b of odd ? [1, 2] : [0, 1.5, 3]) s.hit('rim', b, 0.55);
      s.hit('kick', 0, 0.65); s.hit('kick', 1.5, 0.35); s.hit('kick', 2, 0.55); s.hit('kick', 3.5, 0.35);
      if (!isB) { s.mel('lead', 'flute', sec.mel[k], EMPTY, 0, 0.9); if (s.cycle % 2) s.mel('glock', 'tine', sec.mel[k], { k: 'glock' }, 12, 0.45); }
      else s.mel('glock', 'tine', sec.mel[k], { k: 'vibes' }, 0, 0.9);
      if (isB || s.fi === 3) for (const n of s.vo('p', ch, 60, 3)) s.ev('pad', 'pad', 0, 3.9, n, 0.5, { a: 0.5, r: 0.9, lp: 2600 });
    },
  },
  // trio swing : walking bass, ride, piano (thème puis improvisation)
  jazz: {
    gain: 0.85, swing: 0.75, hum: 0.008, kit: 'jazz', pool: JAZZ_B, mods: [0, 5, -2],
    tone: { hp: 40, lp: 12000 },
    init(s) {
      const R = s.R; s.bpm = R.int(118, 156); s.key = R.pick([65, 58, 63, 60, 67]); s.sc = SCALE.maj;
      const mel = { bank: RH.swing, lo: 5, hi: 22, leap: 0.4 };
      if (R.chance(0.35)) { s.secs = { A: section(s, 'I7 IV7 I7 v7,I7 IV7 #ivdim7 I7 VI7b9 ii7 V7 I7,VI7 ii7,V7', { mel: { ...mel, scale: SCALE.mix } }) }; s.form = ['A']; }
      else { s.secs = { A: section(s, R.pick(JAZZ_A), { mel }), B: section(s, R.pick(JAZZ_B), { mel }) }; s.form = ['A', 'A', 'B', 'A']; }
      s.track('bass', { lp: 1400 }); s.track('pno', { pan: 0.2, gain: 0.8 }); s.track('dr', { pan: -0.15, gain: 0.8, lp: 11000 });
    },
    bar(s, sec, k) {
      const R = s.R, solo = s.cycle % 3 === 1;
      walk(s, 'bass', 36, { k: 'upright' });
      for (const b of [0, 1, 1.5, 2, 3, 3.5]) s.hit('ride', b, b % 1 ? 0.42 : b % 2 ? 0.7 : 0.58);
      s.hit('phat', 1, 0.55); s.hit('phat', 3, 0.55);
      for (let b = 0; b < 4; b++) s.hit('kick', b, 0.16);
      for (let i = 0; i < 8; i++) if (R.chance(0.13)) s.hit('snare', i / 2, R.range(0.15, 0.35));
      if (s.fill) { s.hit('snare', 3.5, 0.6); s.hit('kick', 3.5, 0.5); }
      if (s.first && s.fi === 0) s.hit('crash', 0, 0.4);
      for (const [b, d] of rhythm(R.pick(['0:0.6 1.5:0.4', '1.5:0.5 3:0.6', '0.5:0.4 2.5:0.5', '0:0.5 3.5:0.5', '2:0.5 3.5:0.5', '1:0.4 2.5:1'])))
        s.strum('pno', 'piano', b, d, s.vo('p', s.chordAt(b), 50, 4, { rootless: true, hi: 72 }), R.range(0.42, 0.58), EMPTY, 0.004);
      if (solo) bebop(s, 'pno', 'piano', s.key + 7, s.key + 26); else s.mel('pno', 'piano', sec.mel[k], EMPTY, 0, 0.85);
    },
  },
  // disco : quatre temps au sol, basse en octaves, charleston ouvert, cordes en stabs et glissandos
  disco: {
    gain: 0.8, kit: 'disco', hum: 0.004, pool: DISCO_P, tone: { hp: 30, lp: 14000 },
    init(s) {
      const R = s.R; s.bpm = R.int(117, 124); s.key = R.pick([57, 62, 64, 55, 60]); s.sc = SCALE.maj;
      const P = R.shuffle(DISCO_P), mel = { bank: RH.pop, lo: 0, hi: 17 };
      s.secs = { A: section(s, P[0], { rep: true }), B: section(s, P[1], { rep: true, mel }), C: section(s, P[2], { rep: true, mel }) };
      s.form = ['A', 'B', 'A', 'C', 'B'];
      s.track('dr', { gain: 0.85 }); s.track('bass', { lp: 2400, gain: 0.9 }); s.track('str', { lp: 5200, chorus: 0.5, pan: 0.2, gain: 0.7 });
      s.track('gtr', { hp: 700, pan: -0.35, gain: 0.5 }); s.track('lead', { pan: -0.1, vib: [5.5, 10], gain: 0.7, echo: [(60 / s.bpm) * 0.75, 0.25, 0.18, 3500] });
    },
    bar(s, sec, k) {
      const R = s.R, chs = s.chords, seg = 4 / chs.length, isA = s.secName === 'A';
      s.pat('x...x...x...x...', 'kick'); s.pat('....x.......x...', 'snare', null, 0.75); s.pat('....x.......x...', 'clap', null, 0.55);
      s.pat('..o...o...o...o.', 'ohat'); s.pat('hg.ghg.ghg.ghg.g', 'hat', null, 0.8);
      if (s.first) s.hit('crash', 0, 0.6);
      if (s.fill) [1.3, 1.15, 1, 0.85].forEach((p, i) => s.hit('syn', 3 + i * 0.25, 0.7, { p }));
      chs.forEach((ch, i) => { const r = s.bassOf(ch, 33); for (let j = 0; j < seg * 2; j++) s.ev('bass', 'bass', i * seg + j * 0.5, 0.4, r + (j % 2 ? 12 : 0) + (j === seg * 2 - 1 && R.chance(0.3) ? -2 : 0), j % 2 ? 0.7 : 0.9, { k: 'finger' }); });
      const gv = s.vo('g', chs[0], 64, 3).slice(1);
      for (let i = 0; i < 16; i++) if ('x.xxx.x.x.xxx.x.'[i] === 'x') s.strum('gtr', 'pluck', i / 4, 0.12, gv, i % 4 === 2 ? 0.6 : 0.4, { k: 'clean' }, 0.004);
      if (isA) { for (const b of [1.5, 3.5]) for (const n of s.vo('s', s.chordAt(b), 65, 3)) s.ev('str', 'pad', b, 0.3, n, 0.7, { a: 0.01, r: 0.12, lp: 6000 }); }
      else { for (const n of s.vo('s', chs[0], 62, 3)) s.ev('str', 'pad', 0, 3.8, n, 0.45, { a: 0.3, r: 0.5 }); s.mel('lead', 'pad', sec.mel[k], { a: 0.02, r: 0.2, lp: 4200 }, 12, 0.85); }
      if (s.fill) for (let i = 0; i < 8; i++) s.ev('str', 'pad', 2 + i * 0.25, 0.22, s.key + 12 + relOf(i, s.sc), 0.4 + i * 0.05, { a: 0.01, r: 0.1, lp: 6000 });
    },
  },
  // rock : guitares saturées doublées gauche/droite, basse, batterie, solo pentatonique
  rock: {
    gain: 0.75, kit: 'rock', hum: 0.005, pool: ROCK_P, tone: { hp: 35, lp: 12000 },
    init(s) {
      const R = s.R; s.bpm = R.int(118, 142); s.key = R.pick([64, 69, 62, 67]); s.sc = SCALE.maj;
      const P = R.shuffle(ROCK_P);
      s.secs = { A: section(s, P[0], { rep: true }), B: section(s, P[1], { rep: true }), C: section(s, P[0], { mel: { scale: SCALE.pmin, bank: RH.busy, lo: 0, hi: 19, leap: 0.3 } }) };
      s.form = ['A', 'B', 'A', 'B', 'C'];
      s.track('gL', { dist: 7, pan: -0.5, gain: 0.45 }); s.track('gR', { dist: 7, pan: 0.5, gain: 0.45, cab: 4100 });
      s.track('lead', { dist: 9, pan: 0.1, vib: [5.5, 14], gain: 0.4, echo: [(60 / s.bpm) * 0.75, 0.25, 0.15, 3000] });
      s.track('bass', { lp: 1800 }); s.track('dr', { gain: 0.9 });
    },
    bar(s, sec, k) {
      const R = s.R, chorus = s.secName === 'B', solo = s.secName === 'C';
      s.chords.forEach((ch, i) => {
        const seg = 4 / s.chords.length, r = s.bassOf(ch, 40);
        for (let j = 0; j < seg * 2; j++) {
          const b = i * seg + j * 0.5, acc = j === 0 || (chorus && j % 2 === 0);
          for (const [tr, dt] of [['gL', 0], ['gR', 0.006]]) s.ev(tr, 'gtr', b, acc && chorus ? 0.48 : 0.42, r, acc ? 0.95 : 0.7, { pm: !acc, pc: acc ? [0, 7, 12] : [0, 7], dt });
          s.ev('bass', 'bass', b, 0.42, r - 12, acc ? 0.95 : 0.8, { k: 'pick' });
        }
      });
      s.pat(chorus ? 'x.x...x.x.x...x.' : 'x.......x.x.....', 'kick'); s.pat('....x.......x...', 'snare');
      s.pat(chorus ? 'x.x.x.x.x.x.x.x.' : 'x.o.x.o.x.o.x.o.', chorus ? 'ride' : 'hat');
      if (s.first) s.hit('crash', 0, 0.8);
      if (s.fill) { for (let i = 12; i < 16; i++) s.hit(i < 14 ? 'snare' : 'tom', i / 4, 0.75, { p: i < 14 ? 1 : 1.3 - (i - 14) * 0.25 }); }
      if (solo) s.mel('lead', 'gtr', sec.mel[k], { pc: [0] }, -12, 0.95);
    },
  },
  // baroque : canon à trois voix sur basse obstinée (cordes + clavecin continuo) ou invention à deux voix au clavecin
  classical: {
    gain: 0.9, hum: 0.01, humV: 0.06, tone: { hp: 50, lp: 10000 },
    init(s) {
      const R = s.R; s.canon = R.chance(0.6); s.key = R.pick([62, 60, 65, 67, 64]); s.sc = SCALE.maj;
      if (s.canon) {
        s.bpm = R.int(60, 74);
        const g = R.pick(['I,V vi,iii IV,I IV,V', 'I,V/3 vi,iii/3 IV,I/3 ii,V', 'I,IV vii,iii vi,ii V,I', 'i,iv bVII,bIII bVI,iv V,i']);
        if (g[0] === 'i') s.sc = SCALE.harm;
        s.secs = { A: section(s, g) }; s.form = ['A'];
        s.track('vc', { lp: 1600, gain: 0.8, pan: -0.15, vib: [4.8, 6] }); s.track('hp', { gain: 0.5, pan: 0.05, hp: 150 });
        s.track('v1', { lp: 4200, gain: 0.7, pan: -0.45, vib: [5.6, 11] }); s.track('v2', { lp: 4200, gain: 0.65, pan: 0.45, vib: [5.3, 11] }); s.track('va', { lp: 3000, gain: 0.6, pan: 0.2, vib: [5, 9] });
        s.lines = []; s.lvl = 0;
      } else {
        s.bpm = R.int(84, 100);
        const g = R.pick(['I IV vii iii vi ii V I', 'i iv bVII bIII bVI iim7b5 V i', 'I vi ii V I IV V I']);
        if (g[0] === 'i' && g[1] === ' ') s.sc = SCALE.harm;
        s.secs = { A: section(s, g) }; s.form = ['A'];
        s.track('rh', { gain: 0.55, pan: 0.15 }); s.track('lh', { gain: 0.55, pan: -0.15 });
        s.motif = R.pick([[0, 1, 2, 0, 4, 2, 1, 0], [0, 2, 4, 2, 7, 4, 2, 4], [4, 3, 2, 1, 0, 1, 2, 4], [0, 4, 2, 4, 0, 4, 2, 4]]);
      }
    },
    evolve(s) { if (!s.canon) s.motif = s.R.pick([[0, 1, 2, 0, 4, 2, 1, 0], [0, 2, 4, 2, 7, 4, 2, 4], [4, 3, 2, 1, 0, 1, 2, 4], [2, 1, 0, 1, 2, 4, 7, 4], [0, 4, 2, 4, 0, 4, 2, 4]]); },
    bar(s, sec, k) {
      const R = s.R, sc = s.sc, deg = (ch) => degOf(ch.r, sc);
      if (s.canon) {
        s.chords.forEach((ch, i) => {
          s.ev('vc', 'pad', i * 2, 1.9, s.bassOf(ch, 38), 0.75, { a: 0.09, r: 0.25, sus: 0.8 });
          s.strum('hp', 'pluck', i * 2, 1.8, s.vo('h', ch, 55, 3), 0.55, { k: 'harpsi' }, 0.035);
        });
        const li = Math.floor(s.barN / 4), j = s.barN % 4;
        if (!s.lines[li]) {
          s.lvl = clamp(s.lvl + R.pick([1, 1, 0, -1]), 0, 3); const sub = [1, 2, 4, 8][li < 1 ? 0 : s.lvl], line = []; let n = s.key + 7 + 12;
          sec.prog.forEach((bar) => bar.forEach((ch, ci) => {
            for (let q = 0; q < sub; q++) {
              const b = ci * 2 + (q * 2) / sub;
              if (q === 0) { let best = n, bd = 99; for (let c = n - 5; c <= n + 5; c++) if (isTone(c - s.key, ch) && Math.abs(c - n) < bd) { bd = Math.abs(c - n); best = c; } n = best; }
              else if (sub === 8) n = nearOct(s.key + ch.r + ch.iv[[0, 1, 2, 1][q % 4] % ch.iv.length] + (q >= 4 ? 12 : 0), n);
              else n = s.key + stepSc(n - s.key, R.chance(0.6) ? -1 : 1, sc);
              while (n > s.key + 31) n -= 12; while (n < s.key + 12) n += 12;
              line.push({ bar: line.length ? null : 0, b, d: (2 / sub) * 0.95, n });
            }
          }));
          const per = line.length / 4; s.lines[li] = [0, 1, 2, 3].map((q) => line.slice(q * per, (q + 1) * per));
          delete s.lines[li - 3];
        }
        const play = (tr, idx, tp, vel) => { const L = s.lines[idx]; if (L) for (const nt of L[j]) s.ev(tr, 'pad', nt.b % 4, nt.d, nt.n + tp, vel, { a: 0.06, r: 0.18, sus: 0.9, lp: 3800 }); };
        play('v1', li, 0, 0.62); play('v2', li - 1, 0, 0.55); play('va', li - 2, -12, 0.5);
        if (s.barN % 32 === 31) s.setTempoAt(2, 0.82);
        else if (s.barN % 32 === 0) s.setTempoAt(0, 1);
      } else {
        const ch = s.chords[0], d0 = deg(ch);
        s.motif.forEach((m, i) => { for (const h of [0, 1]) s.ev('rh', 'pluck', i * 0.5 + h * 0.25, 0.24, s.key + 12 + relOf(d0 + m + (h ? (i % 2 ? -1 : 1) : 0), sc), h ? 0.5 : 0.62, { k: 'harpsi' }); });
        const r = s.bassOf(ch, 40); [0, 7, 12, 7].forEach((iv, i) => s.ev('lh', 'pluck', i, 0.9, iv === 7 ? s.key + relOf(d0 + 4, sc) - 12 * Math.round((s.key + relOf(d0 + 4, sc) - r - 7) / 12) : r + iv, 0.55, { k: 'harpsi' }));
        if (s.fill && s.barN % 16 === 15) s.setTempoAt(3, 0.75); else if (s.first) s.setTempoAt(0, 1);
      }
    },
  },
  // synthwave : arpèges en doubles croches, nappes de dents de scie, caisse claire à réverbe coupée
  synthwave: {
    gain: 0.8, kit: 'synth', hum: 0.003, tone: { hp: 30, lp: 13000 },
    init(s) {
      const R = s.R; s.bpm = R.int(100, 110); s.key = R.pick([57, 64, 66, 62, 60]); s.sc = SCALE.min;
      const P = R.shuffle(['i bVI bIII bVII', 'i bVII bVI bVII', 'bVI bVII i i', 'i iv bVI bVII', 'i bIII bVII iv']), mel = { scale: SCALE.min, bank: RH.lyric, lo: 0, hi: 15, leap: 0.4 };
      s.secs = { A: section(s, P[0], { rep: true }), B: section(s, P[0], { rep: true, mel, minSc: SCALE.min }), C: section(s, P[1], { rep: false }) };
      s.form = ['A', 'B', 'C', 'B'];
      const e = (60 / s.bpm) * 0.75;
      s.track('arp', { lp: 2600, gain: 0.5, pan: 0.25, echo: [e, 0.38, 0.3, 2400] }); s.track('pad', { lp: 2400, chorus: 0.5, gain: 0.55, duck: true });
      s.track('bass', { lp: 1500, gain: 0.85 }); s.track('lead', { pan: -0.15, vib: [5.2, 12], gain: 0.6, echo: [e * 2, 0.3, 0.22, 3000] }); s.track('dr', { gain: 0.85 });
      s.arpPat = R.pick([[0, 1, 2, 3, 2, 1], [0, 1, 2, 3], [0, 2, 1, 3, 2, 4], [0, 1, 2, 4, 3, 2, 1, 2]]);
    },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0], brk = s.secName === 'C', B = s.secName === 'B';
      const tones = s.vo('a', ch, 57, 3), arp = [...tones, ...tones.map((n) => n + 12)];
      for (let i = 0; i < 16; i++) s.ev('arp', 'lead', i / 4, 0.22, arp[s.arpPat[i % s.arpPat.length] % arp.length], i % 4 ? 0.55 : 0.75, { w: 'sawtooth', cut: 1400, q: 6, env: 3, fd: 0.08, sus: 0.3, dec: 0.12 });
      if (B || brk) for (const n of s.vo('p', ch, 55, 4)) s.ev('pad', 'pad', 0, 3.9, n, 0.6, { det: 14, a: 0.4, r: 0.6, lp: 2600 });
      if (!brk) {
        const r = s.bassOf(ch, 33);
        for (let i = 0; i < 8; i++) s.ev('bass', 'bass', i / 2, 0.4, r + (i === 7 && R.chance(0.4) ? 12 : 0), i % 2 ? 0.7 : 0.9, { k: 'synth' });
        s.pat(R.chance(0.7) ? 'x...x...x...x...' : 'x.....x.x.......', 'kick', { duck: 'pad', dd: 0.35, dr: 0.2 });
        s.pat('....x.......x...', 'snare'); s.pat('x.x.x.x.x.x.x.xo', 'hat', null, 0.7);
        if (s.fill) [1.4, 1.2, 1, 0.8].forEach((p, i) => s.hit('tom', 3 + i * 0.25, 0.75, { p }));
        if (s.first) s.hit('crash', 0, 0.55);
      }
      if (B && sec.mel) { let prev = s.lastLead; for (const n of sec.mel[k]) { const m = s.key + n.n; s.ev('lead', 'lead', n.b, n.d * 0.98, m, n.v * 0.8, { w: 'square', cut: 2600, q: 1.5, env: 1.2, sus: 0.8, from: prev && Math.abs(prev - m) < 8 ? prev : 0, gl: 0.06, r: 0.2 }); prev = m; } s.lastLead = prev; }
    },
  },
  // funk : basse slap, clavinet wah, section de cuivres, batterie serrée avec notes fantômes
  funk: {
    gain: 0.8, swing: 0.18, swingUnit: 0.25, kit: 'funk', hum: 0.004, tone: { hp: 35, lp: 13000 },
    init(s) {
      const R = s.R; s.bpm = R.int(96, 112); s.key = R.pick([64, 57, 62, 67, 65]); s.sc = SCALE.mix;
      s.secs = { A: section(s, R.pick(['I9 I9 I9 I9', 'i7 i7 IV9 IV9', 'I9 IV9 I9 IV9'])), B: section(s, R.pick(['IV9 IV9 I9 I9 V9 IV9 I9 V7#9', 'IV9 IV9 I9 I9 bVII9 bVII9 V7#9 V7#9']), { mel: { scale: SCALE.pmin, bank: RH.busy, lo: 0, hi: 14 } }) };
      s.form = ['A', 'A', 'B', 'A'];
      s.track('bass', { lp: 3000, gain: 0.95 }); s.track('clav', { pan: -0.35, gain: 0.6, hp: 200 }); s.track('horn', { pan: 0.3, gain: 0.65 }); s.track('dr', { gain: 0.85 });
      s.bpat = R.pick(['R..xO.R.x.Rx.O.7', 'R.xR.O.x5.R.O.xR', 'R..R.xO..R.x7.O.', 'R.x.O.xRR..xO.5.']);
      s.cpat = R.pick(['x.gx.g.xg.x.gx.g', '.x.xg.x..x.xg.x.', 'x..xg.x.x..xg.xg']);
    },
    evolve(s) { evolveDefault(s); if (s.R.chance(0.5)) s.bpat = s.R.pick(['R..xO.R.x.Rx.O.7', 'R.xR.O.x5.R.O.xR', 'R..R.xO..R.x7.O.', 'R.x.O.xRR..xO.5.']); },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0], r = s.bassOf(ch, 28);
      for (let i = 0; i < 16; i++) {
        const c = s.bpat[i], b = i / 4, chi = s.chordAt(b), rr = s.bassOf(chi, 28);
        if (c === 'R') s.ev('bass', 'bass', b, 0.22, rr, 0.95, { k: 'slap' }); else if (c === 'O') s.ev('bass', 'bass', b, 0.15, rr + 12, 0.85, { k: 'slap', pop: 1 });
        else if (c === 'x') s.ev('bass', 'bass', b, 0.05, rr, 0.6, { k: 'dead' }); else if (c === '5' || c === '7') s.ev('bass', 'bass', b, 0.2, rr + (c === '5' ? 7 : 10), 0.75, { k: 'slap' });
      }
      const cv = s.vo('c', ch, 60, 3, { rootless: true });
      for (let i = 0; i < 16; i++) { const c = s.cpat[i]; if (c === 'x') s.strum('clav', 'clav', i / 4, 0.2, cv, 0.75, EMPTY, 0.003); else if (c === 'g') s.ev('clav', 'clav', i / 4, 0.1, cv[R.int(0, cv.length - 1)], 0.35); }
      s.pat(R.pick(['x.....x...x.....', 'x..x......x..x..', 'x.....x..x.x....']), 'kick'); s.pat('....x..g.g..x..g', 'snare', null, 0.9);
      s.pat('xhxhxhxhxhxhxhx.', 'hat', null, 0.7); s.hit('ohat', 3.75, 0.5);
      if (s.secName === 'B' && sec.mel) { s.mel('horn', 'brass', sec.mel[k], { bright: 1.2 }, 0, 0.9, 0.85); s.mel('horn', 'brass', sec.mel[k], { bright: 1 }, -12, 0.6, 0.85); }
      else if (R.chance(0.6)) { const b = R.pick([0.75, 2.5, 3.75, 1.75]); for (const n of s.vo('h', ch, 62, 3, { hi: 76 })) s.ev('horn', 'brass', b, 0.22, n, 0.85, { a: 0.02, bright: 1.3 }); }
      if (s.fill) { s.hit('snare', 3.5, 0.8); s.hit('snare', 3.75, 0.9); }
    },
  },
  // variété française rétro : valse musette, accordéon (anches désaccordées), contrebasse, balais
  chanson: {
    gain: 0.85, meter: 3, hum: 0.008, kit: 'soft', tone: { hp: 70, lp: 7500, wow: [0.4, 3.5] },
    init(s) {
      const R = s.R; s.bpm = R.int(150, 176); s.key = R.pick([69, 62, 67, 64, 65]); s.sc = SCALE.harm;
      const mel = { bank: RH.waltz, lo: 0, hi: 17, leap: 0.4, rep: 1, phrase: 4 };
      s.secs = { A: section(s, R.pick(['i i iv i V7 V7 i i', 'i i V7 V7 V7 V7 i i', 'i iv V7 i iv i V7 i']), { mel, minSc: SCALE.harm }), B: section(s, 'bIII bIII bVII7 bVII7 bIII bIII V7 V7', { mel: { ...mel, scale: SCALE.min } }), C: section(s, R.pick(['iv iv i i V7 V7 i V7', 'VI VI iv iv V7 V7 i i']), { mel, minSc: SCALE.harm }) };
      s.form = ['A', 'A', 'B', 'A', 'C', 'A'];
      s.track('acc', { lp: 3600, peak: [1300, 4, 1], trem: [5.5, 0.12], pan: 0.15, gain: 0.85 }); s.track('lh', { lp: 2600, gain: 0.55, pan: -0.1 });
      s.track('bass', { lp: 1200 }); s.track('dr', { lp: 8000, gain: 0.6, pan: -0.2 });
    },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0], r = s.bassOf(ch, 36) + (k % 2 ? 7 : 0);
      s.ev('lh', 'reed', 0, 0.8, r, 0.8, { det: 14 }); s.ev('bass', 'pluck', 0, 0.9, r - (r > 43 ? 12 : 0), 0.85, { k: 'upright' });
      const cv = s.vo('l', ch, 55, 3); for (const b of [1, 2]) for (const n of cv) s.ev('lh', 'reed', b, 0.35, n, 0.55, { det: 14 });
      s.hit('brush', 1, 0.4); s.hit('brush', 2, 0.35);
      if (s.fill) s.ev('bass', 'pluck', 2, 0.9, s.bassOf(s.nextChord(), 36) - 1, 0.6, { k: 'upright' });
      for (const n of sec.mel[k] || []) {
        if (n.b === 0 && n.d >= 1 && R.chance(0.3)) s.ev('acc', 'reed', 0, 0.12, s.key + n.n - 1, n.v * 0.6, { dt: -0.04 });
        s.ev('acc', 'reed', n.b, n.d * 0.9, s.key + n.n, n.v, EMPTY);
      }
      if (s.fill && s.fi % 2) s.setTempoAt(2, 0.85); else if (s.first) s.setTempoAt(0, 1);
    },
  },
  // reggae : skank sur les temps 2 et 4, « bubble » d'orgue, one-drop, basse profonde, écho dub
  reggae: {
    gain: 0.85, swing: 0.25, swingUnit: 0.25, kit: 'reggae', hum: 0.006, tone: { hp: 30, lp: 11000 },
    init(s) {
      const R = s.R; s.bpm = R.int(70, 80); s.key = R.pick([67, 69, 60, 62, 64]); s.sc = SCALE.maj;
      const A = R.pick(['I IV I IV', 'i iv i iv', 'I V vi IV', 'i bVII i bVII', 'I IV V IV']);
      s.secs = { A: section(s, A, { rep: true }), B: section(s, R.pick(['IV I V I', 'iv i bVI bVII', 'ii V ii V', 'vi IV I V']), { rep: true, mel: { bank: RH.lyric, lo: 2, hi: 17, scale: SCALE.pmaj }, minSc: SCALE.pmin }) };
      s.form = ['A', 'B', 'A', 'B'];
      s.track('skank', { hp: 900, pan: 0.3, gain: 0.55, echo: [(60 / s.bpm) * 0.75, 0.3, 0.12, 2200] }); s.track('org', { lp: 2600, pan: -0.3, gain: 0.45 });
      s.track('bass', { lp: 330, gain: 1.1 }); s.track('dr', { gain: 0.85 }); s.track('dub', { gain: 0.8, pan: -0.1, echo: [(60 / s.bpm) * 0.75, 0.45, 0.35, 1800] });
      s.track('mel', { lp: 3500, pan: 0.15, gain: 0.6, echo: [(60 / s.bpm) * 0.5, 0.35, 0.25, 2500] });
      s.riff = R.pick(['..r-r.f-t---f.r.', 'r---..r-f-t-s-o-', '..t-r---f-..r-a-', 'r-.r..f-t-f-r---']);
    },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0], cv = s.vo('s', ch, 60, 3);
      for (const b of [1, 3]) { s.strum('skank', 'pluck', b, 0.18, cv, 0.65, { k: 'clean', rel: 0.03 }, 0.006); if (R.chance(0.3)) s.strum('skank', 'pluck', b + 0.5, 0.12, cv, 0.4, { k: 'clean', rel: 0.03 }, 0.004); }
      for (const b of [0.5, 1.5, 2.5, 3.5]) for (const n of s.vo('o', s.chordAt(b), 55, 3)) s.ev('org', 'organ', b, 0.2, n, 0.45, EMPTY);
      const rp = s.riff, r = s.bassOf(ch, 33);
      for (let i = 0; i < 16; i++) {
        const c = rp[i]; if (c === '.' || c === '-') continue; let len = 1; while (i + len < 16 && rp[i + len] === '-') len++;
        const iv = c === 'r' ? 0 : c === 't' ? ch.iv[1] : c === 'f' ? 7 : c === 'o' ? 12 : c === 's' ? 10 : -1;
        s.ev('bass', 'bass', i / 4, len / 4 * 0.95, c === 'a' ? s.bassOf(s.nextChord(), 33) - 1 : r + iv, 0.9, { k: 'sub' });
      }
      s.hit('kick', 2, 0.9); s.hit('rim', 2, 0.75, { tr: 'dub' });
      for (let i = 0; i < 8; i++) s.hit('hat', i / 2, i % 2 ? 0.35 : 0.5);
      if (s.fill) for (let i = 0; i < 3; i++) s.hit('snare', 3 + i / 3, 0.4 + i * 0.15, { tr: 'dub', sw: 0 });
      if (s.secName === 'B' && sec.mel) s.mel('mel', 'pad', sec.mel[k], { w: 'melodica', a: 0.03, r: 0.12, sus: 0.9 }, 0, 0.9);
    },
  },
  // metal : riffs en palm mute à la double croche, accents de quintes, double pédale, harmonies à la tierce
  metal: {
    gain: 0.72, kit: 'metal', hum: 0.003, tone: { hp: 40, lp: 11000 },
    init(s) {
      const R = s.R; s.bpm = R.int(150, 184); s.key = R.pick([52, 50, 49]); s.sc = SCALE.min;
      const P = R.shuffle(['i i bVI bVII', 'i bII i bVII', 'i bVI bIII bVII', 'i i iv bII']);
      s.secs = { A: section(s, P[0], { rep: true }), B: section(s, P[1], { rep: true, mel: { scale: SCALE.harm, bank: RH.lyric, lo: 12, hi: 27 }, minSc: SCALE.harm }), C: section(s, P[2]) };
      s.form = ['A', 'B', 'A', 'C'];
      s.track('gL', { dist: 9, pan: -0.55, gain: 0.42, cab: 4300 }); s.track('gR', { dist: 9, pan: 0.55, gain: 0.42, cab: 3900 });
      s.track('lead', { dist: 10, pan: 0.05, vib: [6, 16], gain: 0.33, echo: [(60 / s.bpm) * 0.75, 0.25, 0.15, 3000] });
      s.track('bass', { lp: 1500, gain: 0.9 }); s.track('dr', { gain: 0.95 });
      s.riff = R.pick(['m.mmA.m.mmA.mmb.', 'mmmmA...mmmmb...', 'm.m.A.m.m.f.A.m.', 'mmA.mmA.mmb.mmA.']);
    },
    evolve(s) { evolveDefault(s); if (s.R.chance(0.6)) s.riff = s.R.pick(['m.mmA.m.mmA.mmb.', 'mmmmA...mmmmb...', 'm.m.A.m.m.f.A.m.', 'mmA.mmA.mmb.mmA.', 'm.mmm.mmA.A.b...']); },
    bar(s, sec, k) {
      const R = s.R, B = s.secName === 'B', C = s.secName === 'C', two = (tr0, b, d, n, v, x) => { s.ev('gL', 'gtr', b, d, n, v, x); s.ev('gR', 'gtr', b, d, n, v, { ...x, dt: 0.007 }); };
      s.chords.forEach((ch, ci) => {
        const seg = 4 / s.chords.length, r = s.bassOf(ch, 38);
        if (B) { two(0, ci * seg, seg * 0.95, r, 0.95, { pc: [0, 7, 12] }); for (let i = 0; i < seg * 4; i++) s.ev('bass', 'bass', ci * seg + i / 4, 0.22, r - 12, 0.85, { k: 'pick' }); return; }
        for (let i = 0; i < seg * 4; i++) {
          const c = C ? 'm.mm'[i % 4] : s.riff[(ci * seg * 4 + i) % 16], b = ci * seg + i / 4;
          if (c === '.') continue;
          const n = c === 'm' ? s.bassOf(s.chords[0], 38) : r + (c === 'b' ? 1 : c === 'f' ? 6 : 0);
          two(0, b, c === 'm' ? 0.22 : 0.45, n, c === 'm' ? 0.8 : 1, c === 'm' ? { pm: 1, pc: [0, 7] } : { pc: [0, 7, 12] });
          s.ev('bass', 'bass', b, 0.22, n - 12, 0.85, { k: 'pick' });
        }
      });
      if (B) { s.pat('xxxxxxxxxxxxxxxx', 'kick', null, 0.85); s.pat('....X.......X...', 'snare'); s.pat('x.x.x.x.x.x.x.x.', 'crash', null, 0.45); }
      else if (C) { s.pat('x.x.x.x.x.x.x.x.', 'kick'); s.pat('.x.x.x.x.x.x.x.x', 'snare', null, 0.8); s.pat('x.x.x.x.x.x.x.x.', 'ride', null, 0.6); }
      else { for (let i = 0; i < 16; i++) if (s.riff[i] !== '.') s.hit('kick', i / 4, 0.85); s.pat('....X.......X...', 'snare'); s.pat('x.x.x.x.x.x.x.x.', 'hat', null, 0.7); }
      if (s.first) s.hit('crash', 0, 0.9);
      if (s.fill) for (let i = 8; i < 16; i++) s.hit(i < 12 ? 'snare' : 'tom', i / 4, 0.8, { p: i < 12 ? 1 : 1.4 - (i - 12) * 0.18 });
      if (B && sec.mel) { s.mel('lead', 'gtr', sec.mel[k], { pc: [0] }, -12, 0.9); s.mel('lead', 'gtr', sec.mel[k].map((n) => ({ ...n, n: stepSc(n.n, 2, SCALE.harm) })), { pc: [0], dt: 0.004 }, -12, 0.7); }
    },
  },
  // ambiance : nappes lentes qui évoluent, cloches éparses, vent et gouttes d'eau, pas de batterie
  ambient: {
    gain: 0.95, hum: 0.02, tone: { hp: 30, lp: 9000 },
    init(s) {
      const R = s.R; s.bpm = 60; s.key = R.pick([62, 64, 60, 65, 57]); s.sc = SCALE.maj;
      const P = R.shuffle(['Iadd9 Iadd9 IVmaj7 IVmaj7', 'vi9 vi9 Imaj9 Imaj9', 'IVmaj9 IVmaj9 Iadd9 Iadd9', 'iii7 iii7 IVmaj7#11 IVmaj7#11', 'Imaj7 Imaj7 bVIImaj7 bVIImaj7']);
      s.secs = { A: section(s, P[0] + ' ' + P[1]), B: section(s, P[2] + ' ' + P[3]) }; s.form = ['A', 'B'];
      s.track('pad', { lp: 2000, chorus: 0.6, gain: 0.9 }); s.track('air', { lp: 4500, chorus: 0.4, gain: 0.35, pan: 0.2 }); s.track('sub', { lp: 200, gain: 0.7 });
      s.track('bell', { pan: -0.3, gain: 0.45, echo: [0.62, 0.55, 0.45, 2600] }); s.track('fx', { pan: 0.4, gain: 0.5, echo: [0.41, 0.4, 0.3, 4000] });
      s.track('wind', { hp: 250, lp: 1100, gain: 1 }); const w = bed(s, 'wind', noiseBuf(s.ctx), 0.05, 0.5); s.lfo(0.06, 0.035, w.g.gain);
    },
    evolve(s) { evolveDefault(s); s.key = s.key0 + s.R.pick([0, 0, 2, -3, 5]); },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0];
      if (k % 2 === 0) {
        for (const n of s.vo('p', ch, 52, 4)) s.ev('pad', 'pad', R.range(0, 0.6), 7.6, n, R.range(0.5, 0.7), { w: 'triangle', det: 9, a: 2.6, r: 3.5, lp: 1800, swell: 1, sus: 0.9 });
        if (R.chance(0.5)) for (const n of s.vo('h', ch, 74, 2)) s.ev('air', 'pad', 2, 6, n, 0.45, { w: 'sine', a: 3, r: 4 });
        s.ev('sub', 'pad', 0, 7.8, s.bassOf(ch, 33), 0.7, { w: 'sine', a: 2, r: 3, sus: 1 });
      }
      const pen = SCALE.pmaj; for (let i = 0; i < 3; i++) if (R.chance(0.45)) s.ev('bell', 'tine', R.int(0, 7) / 2, 3, s.key + 12 + relOf(R.int(0, 7), pen), R.range(0.25, 0.5), { k: R.chance(0.6) ? 'vibes' : 'celesta' });
      if (R.chance(0.5)) s.ev('fx', 'drop', R.range(0, 3.5), 0.1, R.int(84, 100), R.range(0.3, 0.6), { up: R.range(1.6, 2.6) });
      if (R.chance(0.15)) { const b0 = R.range(0, 2.5), base = R.int(96, 103); for (let i = 0; i < R.int(2, 5); i++) s.ev('fx', 'drop', b0 + i * 0.12, 0.05, base + R.int(-2, 3), 0.35, { up: 1.3 }); }
    },
  },
  // vieux 78 tours ralenti et voilé : valse triste, craquements, pleurage profond, notes fausses, sillon qui saute
  creepy_vinyl: {
    gain: 1.0, meter: 3, hum: 0.02, humV: 0.15, mono: true, tone: { hp: 280, lp: 3600, peak: [1500, 5, 1], sat: 1.2, wow: [0.5, 24], flutter: [7, 7] },
    init(s) {
      const R = s.R; s.bpm = R.int(62, 74); s.key = R.pick([67, 69, 65, 66]); s.sc = SCALE.harm; s.cents = R.pick([-37, -41, 33]);
      const mel = { bank: RH.waltz, lo: 0, hi: 15, leap: 0.45, phrase: 4 };
      s.secs = { A: section(s, R.pick(['i i iv iv V7 V7 i i', 'i VI iv V7 i iv V7 i']), { mel, minSc: SCALE.harm }), B: section(s, 'bIII bIII bVI bVI iv iv V7 V7', { mel: { ...mel, scale: SCALE.harm } }) };
      s.form = ['A', 'B', 'A'];
      s.track('pno', { gain: 0.7 }); s.track('vln', { lp: 3000, vib: [5.5, 18], gain: 0.55 }); s.track('vinyl', { gain: 1 }); s.track('click', { gain: 0.6 });
      bed(s, 'vinyl', crackleBuf(s.ctx), 0.22, 0.92);
    },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0], sour = () => (R.chance(0.2) ? R.pick([-1, 1]) * R.range(30, 65) : 0);
      s.setTempoAt(0, R.range(0.9, 1.04));
      if (s.barN > 4 && R.chance(0.1)) { // sillon rayé : le même temps se répète, avec le clic de l'aiguille
        const n = (sec.mel[k] || [])[0], reps = R.int(3, 5); s.barLen = reps;
        for (let i = 0; i < reps; i++) { s.hit('tick', i, 0.9, { tr: 'click', p: 0.6 }); s.ev('pno', 'piano', i, 0.9, s.bassOf(ch, 36), 0.6, { c: sour() }); if (n) s.ev('vln', 'pad', i, 0.85, s.key + n.n, 0.6, { a: 0.05, r: 0.2, c: sour() }); }
        if (R.chance(0.6)) s.bis--; return;
      }
      if (s.wowBase && R.chance(0.1)) s.fx(R.range(0, 2), (S, t) => { const p = S.wowBase; p.cancelScheduledValues(t); p.setValueAtTime(0.04, t); p.linearRampToValueAtTime(0.13, t + 1.4); p.linearRampToValueAtTime(0.04, t + 1.9); });
      s.ev('pno', 'piano', 0, 0.9, s.bassOf(ch, 36) + (k % 2 ? 7 : 0), 0.7, { c: sour() });
      const cv = s.vo('c', ch, 55, 3); for (const b of [1, 2]) for (const n of cv) s.ev('pno', 'piano', b, 0.5, n, 0.45, { c: sour() });
      for (const n of sec.mel[k] || []) s.ev('vln', 'pad', n.b, n.d * 0.95, s.key + n.n, n.v * 0.8, { a: 0.09, r: 0.3, sus: 0.85, c: sour() });
      if (s.fill) s.setTempoAt(2, 0.7);
    },
  },
  music_box: { gain: 1.0, hum: 0.012, humV: 0.12, tone: { hp: 120 }, init(s) { boxInit(s, false); }, evolve() { }, bar(s, sec, k) { boxBar(s, sec, k, false); } },
  music_box_wrong: { gain: 1.0, hum: 0.02, humV: 0.2, tone: { hp: 120, lp: 9000 }, init(s) { boxInit(s, true); s.cents = -30; }, evolve() { }, bar(s, sec, k) { boxBar(s, sec, k, true); } },
  // borne d'arcade (attract mode) : deux impulsions, triangle, bruit — mélodie accrocheuse, arpèges rapides
  arcade: {
    gain: 0.75, hum: 0.001, humV: 0.02, mono: true, tone: { hp: 50, lp: 12000 },
    init(s) {
      const R = s.R; s.bpm = R.int(138, 160); s.key = R.pick([72, 69, 74, 67]); s.sc = SCALE.maj;
      const minor = R.chance(0.4), P = minor ? R.shuffle(['i bVI bVII i', 'i bVII bVI V', 'i iv bVII bIII']) : R.shuffle(['I V vi IV', 'vi IV I V', 'I vi IV V', 'IV V iii vi']);
      if (minor) s.sc = SCALE.min;
      const mel = { bank: RH.chip, lo: 0, hi: 19, leap: 0.45, rep: 1.8 };
      s.secs = { I: section(s, minor ? 'i V' : 'I V'), A: section(s, P[0], { rep: true, mel, minSc: SCALE.min }), B: section(s, P[1], { rep: true, mel, minSc: SCALE.min }) };
      s.form = ['I', 'A', 'A', 'B', 'A'];
      s.track('p1', { gain: 0.8 }); s.track('p2', { gain: 0.5 }); s.track('tri', { gain: 0.9 }); s.track('noi', { gain: 0.7 });
    },
    evolve(s) { evolveDefault(s); s.form = ['A', 'A', 'B', 'A']; s.key = s.key0 + [0, 0, 2, 2, 4, 4][s.cycle % 6]; },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0];
      if (s.secName === 'I') { // jingle d'introduction : arpège ascendant en fanfare
        const t = ch.iv.map((x) => s.key + ch.r + x); [t[0], t[1], t[2], t[0] + 12, t[1] + 12, t[2] + 12, t[0] + 24].forEach((n, i) => s.ev('p1', 'chip', i * 0.5, i === 6 ? 0.45 : 0.4, n, 0.9, { w: 'pulse25' }));
        s.ev('tri', 'bass', 0, 3.5, s.bassOf(ch, 36), 0.9, { k: 'tri' }); s.hit('nkick', 0, 0.8, { tr: 'noi' }); s.hit('nsnare', 3, 0.8, { tr: 'noi' }); return;
      }
      s.chords.forEach((c, i) => { const seg = 4 / s.chords.length, r = s.bassOf(c, 36); for (let j = 0; j < seg * 2; j++) s.ev('tri', 'bass', i * seg + j / 2, 0.42, r + (j % 2 ? 12 : 0), 0.9, { k: 'tri' }); });
      for (let b = 0; b < 4; b++) { const c = s.chordAt(b); s.ev('p2', 'chip', b, 0.9, s.key + c.r - 12 + (c.r > 6 ? -12 : 0) + 12, 0.5, { w: 'pulse50', arp: [0, c.iv[1], c.iv[2], 12], as: 1 / 50, sus: 0.7 }); }
      s.mel('p1', 'chip', sec.mel[k], { w: s.secName === 'B' ? 'pulse12' : 'pulse25', vib: 18, sus: 0.6 }, 0, 0.95, 0.85);
      s.pat('x.......x.......', 'nkick', { tr: 'noi' }); s.pat('....x.......x...', 'nsnare', { tr: 'noi' }); s.pat('x.x.x.x.x.x.x.x.', 'nhat', { tr: 'noi' }, 0.6);
      if (s.fill) for (let i = 12; i < 16; i++) s.hit('nsnare', i / 4, 0.6 + (i - 12) * 0.1, { tr: 'noi' });
    },
  },
  // manège pour enfants / jingle de magasin de jouets : orgue de foire, glockenspiel, « oom-pah », un peu faux
  kiddie: {
    gain: 0.85, swing: 0.9, hum: 0.008, tone: { hp: 90, lp: 9000, wow: [0.35, 12] },
    init(s) {
      const R = s.R; s.bpm = R.int(116, 132); s.key = R.pick([72, 65, 67, 70]); s.sc = SCALE.maj;
      const mel = { bank: RH.jingle, lo: 0, hi: 16, leap: 0.4, rep: 2 };
      s.secs = { A: section(s, R.pick(['I I V7 V7 V7 V7 I I', 'I IV V7 I I IV V7 I', 'I vi ii V7 I vi ii V7']), { mel }), B: section(s, R.pick(['IV IV I I V7 V7 I I', 'IV iv I VI7 ii V7 I I']), { mel }) };
      s.form = ['A', 'A', 'B', 'A'];
      s.track('call', { vib: [6.2, 22], peak: [1800, 3, 1], gain: 0.8, pan: 0.1 }); s.track('glock', { gain: 0.45, pan: -0.25 });
      s.track('oom', { lp: 1500, gain: 0.8 }); s.track('pah', { lp: 3000, gain: 0.45, pan: 0.2 }); s.track('dr', { gain: 0.6, pan: -0.1 });
    },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0], r = s.bassOf(ch, 36), off = () => R.range(-14, 14);
      s.ev('oom', 'bass', 0, 0.8, r, 0.85, { k: 'tuba' }); s.ev('oom', 'bass', 2, 0.8, s.bassOf(s.chordAt(2), 36) + (s.chords.length > 1 ? 0 : 7) - (r + 7 > 47 ? 12 : 0), 0.75, { k: 'tuba' });
      for (const b of [1, 3]) for (const n of s.vo('p', s.chordAt(b), 57, 3)) s.ev('pah', 'organ', b, 0.4, n, 0.55, { w: 'combo', c: off() });
      for (const n of sec.mel[k] || []) { s.ev('call', 'organ', n.b, n.d * 0.9, s.key + n.n, n.v, { w: 'calliope', c: off(), a: 0.02 }); if (s.cycle % 2 || s.secName === 'B') s.ev('glock', 'tine', n.b, n.d, s.key + n.n + 12, n.v * 0.7, { k: 'glock', c: 15 }); }
      for (let b = 0; b < 4; b++) s.hit('block', b, b % 2 ? 0.5 : 0.65, { p: b % 2 ? 1.26 : 1 });
      if (s.first) s.hit('tri', 0, 0.5); if (s.fill) s.ev('call', 'slide', 2, 1.8, s.key - 5, 0.6, { to: s.key + 7 });
    },
  },
  // musique de film : ostinato de cordes, cuivres en crescendo, timbales, tension
  cinema_score: {
    gain: 0.85, hum: 0.006, kit: 'orch', tone: { hp: 30, lp: 12000 },
    init(s) {
      const R = s.R; s.bpm = R.int(92, 108); s.key = R.pick([62, 60, 64, 57]); s.sc = SCALE.min;
      const mel = { scale: SCALE.harm, bank: RH.cad4.concat(RH.lyric), lo: -5, hi: 12, leap: 0.5, phrase: 4 };
      s.secs = { I: section(s, 'i i'), A: section(s, R.pick(['i i bVI bVI bIII bIII bVII bVII', 'i i bVI bVI iv iv V V']), { mel, minSc: SCALE.harm }), B: section(s, R.pick(['i bVI bIII bVII', 'i iv bVI V']), { rep: true, mel, minSc: SCALE.harm }), C: section(s, R.pick(['i bII i bII', 'i i bvi i'])) };
      s.form = ['I', 'A', 'B', 'C', 'A', 'B'];
      s.track('ost', { lp: 2200, gain: 0.8, pan: -0.2 }); s.track('str', { lp: 3400, chorus: 0.4, vib: [5.4, 7], gain: 0.75, pan: 0.2 });
      s.track('horn', { lp: 2600, gain: 0.8, pan: 0.1 }); s.track('low', { lp: 1800, gain: 0.7 }); s.track('perc', { gain: 0.9 }); s.track('trem', { lp: 4500, trem: [9, 0.85], gain: 0.5, pan: -0.3 });
      s.ostPat = R.pick([[0, 0, 12, 0, 7, 0, 12, 7], [0, 12, 0, 7, 0, 12, 0, 10], [0, 0, 7, 0, 0, 12, 7, 3]]);
    },
    evolve(s) { evolveDefault(s); s.form = ['A', 'B', 'C', 'A', 'B']; },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0], name = s.secName, it = s.intensity, r = s.bassOf(ch, 38), p = (n) => mtof(n) / 73.4;
      for (let i = 0; i < 16; i++) s.ev('ost', 'pad', i / 4, 0.2, r + s.ostPat[i % 8], i % 4 === 0 ? 0.9 : i % 2 ? 0.55 : 0.7, { a: 0.008, r: 0.08, sus: 0.6, dec: 0.15 });
      if (it > 0.7 || name === 'B') for (let i = 0; i < 16; i += 2) s.ev('ost', 'pad', i / 4, 0.2, r + 12 + s.ostPat[i % 8], 0.5, { a: 0.008, r: 0.08, sus: 0.6, dec: 0.15 });
      if (name !== 'I') for (const n of s.vo('s', ch, 55, 4)) s.ev(name === 'C' ? 'trem' : 'str', 'pad', 0, 3.95, n, name === 'C' ? 0.45 : 0.5, { det: 8, a: 0.6, r: 0.8 });
      if (name === 'C') s.ev('trem', 'pad', 0, 3.95, s.key + ch.r + 13 + 12, 0.35, { a: 1, r: 0.6 });
      if ((name === 'A' || name === 'B') && sec.mel) for (const n of sec.mel[k]) s.ev('horn', 'brass', n.b, n.d * 0.98, s.key + n.n, n.v * (name === 'B' ? 0.95 : 0.75), { a: 0.12, bright: 0.6 });
      if (name === 'B' || (name === 'A' && k % 2 === 0)) { s.hit('timp', 0, 0.85, { tr: 'perc', p: p(r + 12) }); if (name === 'B') { s.hit('bd', 0, 0.8, { tr: 'perc' }); for (const n of s.vo('l', ch, 43, 3)) s.ev('low', 'brass', 0, 1.2, n, 0.85, { a: 0.03, bright: 1.1 }); } }
      if (s.fill) { for (let i = 0; i < 8; i++) s.hit('timp', 2 + i / 4, 0.3 + i * 0.08, { tr: 'perc', p: p(r + 12) }); s.ev('perc', 'swell', 2, 2, 0, 0.9, { f: 4000 }); }
      if (s.first && name !== 'I' && name !== 'C') s.hit('crash', 0, 0.7, { tr: 'perc' });
    },
  },
  // piano seul : stride/ragtime (film muet) ou ballade de bar (rubato, pédale)
  piano_bar: {
    gain: 0.95, hum: 0.01, tone: { hp: 40, lp: 11000 },
    init(s) {
      const R = s.R; s.stride = R.chance(0.6); s.key = R.pick([60, 65, 67, 58, 63]); s.sc = SCALE.maj;
      if (s.stride) {
        s.bpm = R.int(150, 176); s.swing = 0.35;
        s.secs = { A: section(s, R.pick(['I I VI7 VI7 II7 V7 I V7', 'I I7 IV #ivdim7 I VI7 II7,V7 I']), { mel: { bank: RH.pop, lo: 7, hi: 24, leap: 0.45 } }), B: section(s, 'IV IV I I II7 II7 V7 V7', { mel: { bank: RH.pop, lo: 7, hi: 24 } }) };
      } else {
        s.bpm = R.int(66, 78); s.swing = 0.15;
        s.secs = { A: section(s, R.pick(['Imaj7 iii7 vi7 IVmaj7 ii7 V7sus4 Imaj7 V7', 'Imaj9 IVmaj7 iii7 VI7b9 ii9 V13 Imaj7 V7sus4']), { mel: { bank: RH.lyric, lo: 7, hi: 24 } }), B: section(s, 'IVmaj7 iv6 iii7 VI7 ii7 V7 Imaj7 Imaj7', { mel: { bank: RH.lyric, lo: 7, hi: 24 } }) };
      }
      s.form = ['A', 'A', 'B', 'A'];
      s.track('lh', { pan: -0.2, gain: 0.8 }); s.track('rh', { pan: 0.2, gain: 0.85 });
    },
    bar(s, sec, k) {
      const R = s.R;
      if (s.stride) {
        for (let b = 0; b < 4; b++) {
          const ch = s.chordAt(b);
          if (b % 2 === 0) { const r = s.bassOf(ch, 36) + (b === 2 ? (ch.iv[2] === 7 ? 7 : 0) : 0); s.ev('lh', 'piano', b, 0.8, r, 0.8); s.ev('lh', 'piano', b, 0.8, r - 12, 0.55); }
          else s.strum('lh', 'piano', b, 0.5, s.vo('c', ch, 53, 3), 0.55, EMPTY, 0.003);
        }
        for (const n of sec.mel[k] || []) { s.ev('rh', 'piano', n.b, n.d * 0.9, s.key + n.n, n.v * 0.85); if (n.d >= 0.5) s.ev('rh', 'piano', n.b, n.d * 0.9, s.key + stepSc(n.n, -2, s.sc), n.v * 0.55); }
      } else {
        s.chords.forEach((ch, i) => { const seg = 4 / s.chords.length, r = s.bassOf(ch, 36), t = ch.iv; [0, 7, t[1] + 12, 7 + 12, t[1] + 12, 7].slice(0, seg * 2).forEach((iv, j) => s.ev('lh', 'piano', i * seg + j / 2, 1.6, r + iv, j ? 0.42 : 0.6, { ped: 0.6 })); });
        for (const n of sec.mel[k] || []) { s.ev('rh', 'piano', n.b, n.d, s.key + n.n, n.v * 0.8, { ped: 0.4 }); if (n.b === 0 && R.chance(0.5)) s.strum('rh', 'piano', 0, n.d, s.vo('r', s.chordAt(0), s.key + n.n - 10, 3, { hi: s.key + n.n - 1 }), 0.4, { ped: 0.4 }, 0.02); }
        s.setTempoAt(0, k % 4 === 3 ? 0.9 : R.range(0.97, 1.03)); if (k % 4 === 3) s.setTempoAt(3, 0.8);
      }
    },
  },
  // station morte : parasites, sifflements d'accord, et une voix fantôme filtrée qui chante quelques notes
  radio_static_voice: {
    gain: 0.9, hum: 0.03, mono: true, tone: { hp: 200, lp: 5000, sat: 1.4, wow: [0.3, 15] },
    init(s) {
      const R = s.R; s.bpm = 60; s.key = R.pick([57, 59, 55, 62]); s.sc = SCALE.harm;
      s.secs = { A: section(s, 'i iv V i'), B: section(s, 'i bVI iv V') }; s.form = ['A', 'B'];
      s.track('static', { hp: 500, lp: 4500, peak: [1800, 5, 0.8], gain: 1 }); s.track('ghost', { hp: 250, lp: 3000, peak: [1100, 6, 1.5], gain: 1.6, echo: [0.45, 0.35, 0.3, 1800] });
      s.track('whistle', { gain: 0.25 });
      s.bed = bed(s, 'static', noiseBuf(s.ctx), 0.3); s.lfo(0.13, 0.08, s.bed.g.gain); s.sig = 0.3;
      s.tune = [0, 2, 3, 2, 0, -1, 0, 3, 2, -2, -1, 0].map((d) => relOf(d, SCALE.harm));
    },
    bar(s, sec, k) {
      const R = s.R;
      s.sig = clamp(s.sig + R.range(-0.35, 0.35), 0, 1);
      const sig = s.sig; s.fx(0, (S, t) => { const g = S.tracks.ghost.out.gain, st = S.tracks.static.out.gain; g.setTargetAtTime(0.4 + 1.6 * sig, t, 0.8); st.setTargetAtTime(1 - 0.55 * sig, t, 0.8); });
      if (sig > 0.35 && R.chance(0.75)) {
        let b = R.int(0, 1); const start = R.int(0, s.tune.length - 4), len = R.int(2, 4);
        for (let i = 0; i < len && b < 4; i++) { const d = R.pick([1, 1.5, 2]); s.ev('ghost', 'voice', b, d, s.key + s.tune[start + i], R.range(0.55, 0.85), { vw: R.pick(['u', 'o', 'a']), vw2: R.pick(['o', 'u', 'a']), breath: 0.8, tone: 0.18 + sig * 0.15 }); b += d; }
      }
      if (R.chance(0.3)) s.ev('whistle', 'slide', R.range(0, 2), R.range(1.5, 3), R.int(84, 100), 0.5, { to: R.int(80, 104) });
      if (R.chance(0.35)) s.ev('static', 'swell', R.range(0, 3), R.range(0.3, 1.2), 0, 0.7, { ft: 'bandpass', f: R.range(600, 3000), f2: R.range(400, 4000), q: 4, r: 0.15 });
      for (let i = 0; i < 4; i++) if (R.chance(0.2)) s.hit('tick', R.range(0, 3.9), R.range(0.2, 0.6), { tr: 'static', p: R.range(0.5, 1.5) });
    },
  },
  // attente téléphonique : pièce « classique » originale (façon lettre à Élise), synthé kitsch, bande 300–3400 Hz, mono
  hold_music: {
    gain: 1.1, meter: 3, hum: 0.002, humV: 0.03, mono: true, kit: 'soft', tone: { band: [300, 3400], sat: 1.6, bits: 7, peak: [1800, 4, 1] },
    init(s) {
      const R = s.R; s.bpm = R.int(112, 126); s.key = R.pick([69, 67, 71]); s.sc = SCALE.harm;
      const e = (a) => a.map((n, i) => ({ b: i * 0.5, d: 0.5, n, v: i ? 0.7 : 0.85 }));
      const A = [[7, 6, 7, 8, 7, 3], [2, -1, 2, 5, 3, 2], [3, 2, 3, 7, 12, 10], [8, 7, 5, 3, 2, -1], [0, 3, 7, 12, 11, 12], [8, 7, 5, 3, 0, 3], [2, 5, 3, 2, 0, -1]].map(e).concat([[{ b: 0, d: 3, n: 0, v: 0.8 }]]);
      const B = [[10, 7, 3, 7, 10, 15], [14, 12, 10, 8, 5, 2], [3, 7, 12, 10, 8, 7], [8, 12, 5, 8, 2, 5], [3, 7, 10, 15, 14, 12], [12, 10, 8, 7, 5, 3], [5, 2, -2, 2, 5, 8]].map(e).concat([[{ b: 0, d: 2, n: 7, v: 0.8 }, { b: 2, d: 1, n: 6, v: 0.7 }]]);
      s.secs = { A: { prog: prog('i V7 i iv,V7 i bVI V7 i'), len: 8, mel: A }, B: { prog: prog('bIII bVII7 i iv,bVII7 bIII bVI bVII7 V7'), len: 8, mel: B } };
      s.form = ['A', 'A', 'B', 'A'];
      s.track('lead', { gain: 0.8, vib: [5.5, 8] }); s.track('lh', { gain: 0.6 }); s.track('dr', { gain: 0.5 }); s.track('line', { hp: 1200, gain: 1 }); bed(s, 'line', noiseBuf(s.ctx), 0.012);
    },
    evolve() { },
    bar(s, sec, k) {
      const v = s.cycle % 4;
      s.chords.forEach((ch, i) => { const seg = 3 / s.chords.length, r = s.bassOf(ch, 45), t = ch.iv[1]; [0, 7, 12, 7, 12 + t, 7].slice(0, seg * 2).forEach((iv, j) => s.ev('lh', v === 2 ? 'tine' : 'fm', i * seg + j / 2, 0.5, r + iv, j ? 0.45 : 0.6, v === 2 ? { k: 'celesta' } : { idx: 0.7 })); });
      const L = [['lead', { w: 'square', cut: 3000, q: 1, env: 0.5, sus: 0.8 }], ['flute', EMPTY], ['tine', { k: 'glock' }], ['organ', { w: 'organ' }]][v];
      s.mel('lead', L[0], sec.mel[k], L[1], 0, 0.9, 0.9);
      if (v % 2) { s.hit('kick', 0, 0.7); s.hit('hat', 1, 0.5); s.hit('hat', 2, 0.5); s.hit('rim', 2.5, 0.3); }
    },
  },
  // fanfare pompeuse (hymne parodique original) : trompettes à la tierce, tuba « oom-pah », caisse claire militaire
  national_anthem_parody: {
    gain: 0.8, hum: 0.007, kit: 'orch', tone: { hp: 50, lp: 11000 },
    init(s) {
      const R = s.R; s.bpm = R.int(100, 112); s.key = R.pick([70, 63, 65, 67]); s.sc = SCALE.maj;
      const mel = { bank: RH.march, lo: 0, hi: 16, leap: 0.65, rep: 1 };
      s.secs = { I: section(s, 'I V7'), A: section(s, 'I IV I V7 I IV V7 I', { mel }), B: section(s, R.pick(['IV I V7 I vi ii V7 V7', 'vi iii IV I ii V7 I V7']), { mel }), F: section(s, 'I I') };
      s.form = ['I', 'A', 'B', 'A', 'F'];
      s.track('tpt', { gain: 0.75, pan: 0.2, vib: [5.5, 6] }); s.track('tpt2', { gain: 0.5, pan: 0.35 }); s.track('horn', { lp: 2200, gain: 0.55, pan: -0.25 });
      s.track('tuba', { lp: 900, gain: 0.85 }); s.track('dr', { gain: 0.75, pan: -0.1 }); s.track('fx', { gain: 0.5, pan: 0.3 });
    },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0], name = s.secName, r = s.bassOf(ch, 34);
      if (name === 'I') { [[0, 0.75, 0], [0.75, 0.25, 0], [1, 1, 4], [2, 0.75, 4], [2.75, 0.25, 4], [3, 1, 7]].forEach(([b, d, n]) => s.ev('tpt', 'brass', b, d * 0.9, s.key + n, 0.9, { bright: 1.3 })); s.hit('snare', 0, 0.6); s.hit('snare', 3, 0.8); s.ev('tuba', 'bass', 0, 3, r, 0.8, { k: 'tuba' }); return; }
      if (name === 'F') {
        if (k === 0) { s.setTempoAt(0, 0.7); for (const n of s.vo('h', ch, 58, 4)) s.ev('horn', 'brass', 0, 7.5, n, 0.8, { a: 0.1 }); s.ev('tpt', 'brass', 0, 7.5, s.key + 12, 0.95, { bright: 1.4 }); s.ev('tuba', 'bass', 0, 7.5, r, 0.9, { k: 'tuba' }); s.hit('crash', 0, 0.9); s.hit('bd', 0, 1); for (let i = 0; i < 16; i++) s.hit('timp', i / 4, 0.3 + i * 0.03, { p: mtof(r + 12) / 73.4 }); }
        else { s.setTempoAt(3.9, 1); s.hit('crash', 2, 0.6); s.hit('bd', 2, 0.9); }
        return;
      }
      s.ev('tuba', 'bass', 0, 0.8, r, 0.85, { k: 'tuba', c: name === 'B' && k === 5 && s.cycle % 2 === 0 ? -70 : 0 }); s.ev('tuba', 'bass', 2, 0.8, r + 7 - (r + 7 > 45 ? 12 : 0), 0.75, { k: 'tuba' });
      for (const b of [1, 3]) for (const n of s.vo('h', s.chordAt(b), 55, 3)) s.ev('horn', 'brass', b, 0.4, n, 0.55, { a: 0.02, bright: 0.8 });
      s.mel('tpt', 'brass', sec.mel[k], { bright: 1.3 }, 0, 0.95, 0.88);
      s.mel('tpt2', 'brass', (sec.mel[k] || []).map((n) => ({ ...n, n: stepSc(n.n, -2, s.sc) })), { bright: 1.1 }, 0, 0.7, 0.88);
      s.pat(R.chance(0.6) ? 'x.xxx.x.x.xxx.x.' : 'x.x.x.xxx.x.xxxx', 'snare', null, 0.6); s.hit('bd', 0, 0.8); s.hit('bd', 2, 0.7);
      if (k % 4 === 0) s.hit('crash', 0, 0.55); if (R.chance(0.15)) s.hit('tri', 3.5, 0.6);
      if (name === 'B' && s.fill) s.ev('fx', 'slide', 2, 1.6, s.key, 0.7, { to: s.key + 12 });
    },
  },
  // jingle de Noël : célesta, glockenspiel, grelots, nappe de cordes, pizzicati
  xmas: {
    gain: 0.85, swing: 0.3, hum: 0.007, kit: 'soft', tone: { hp: 50, lp: 12000 },
    init(s) {
      const R = s.R; s.bpm = R.int(120, 138); s.key = R.pick([65, 67, 72, 70]); s.sc = SCALE.maj;
      const mel = { bank: RH.jingle, lo: 0, hi: 14, leap: 0.3, rep: 2.5 };
      s.secs = { A: section(s, R.pick(['I I IV I V7 V7 I I', 'I vi ii V7 I vi ii V7']), { mel }), B: section(s, R.pick(['IV iv I VI7 ii V7 I I', 'I I7 IV iv I V7 I I']), { mel }) };
      s.form = ['A', 'A', 'B', 'A'];
      s.track('cel', { gain: 0.8, pan: 0.15 }); s.track('glock', { gain: 0.45, pan: -0.3 }); s.track('bells', { hp: 3000, gain: 0.6, pan: 0.35 });
      s.track('pad', { lp: 2800, chorus: 0.5, gain: 0.5 }); s.track('bass', { lp: 1500, gain: 0.9 }); s.track('dr', { gain: 0.55 }); s.track('church', { gain: 0.5, pan: -0.15 });
    },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0];
      s.mel('cel', 'tine', sec.mel[k], { k: 'celesta' }, 12, 0.95);
      if (s.secName === 'B' || s.cycle % 2) s.mel('glock', 'tine', sec.mel[k], { k: 'glock' }, 24, 0.5);
      for (let i = 0; i < 8; i++) s.hit('sleigh', i / 2, i % 2 ? 0.4 : 0.6, { tr: 'bells' });
      s.chords.forEach((c, i) => { const seg = 4 / s.chords.length, r = s.bassOf(c, 36); s.ev('bass', 'pluck', i * seg, 0.8, r, 0.8, { k: 'pizz' }); s.ev('bass', 'pluck', i * seg + seg / 2, 0.8, r + 7, 0.6, { k: 'pizz' }); });
      for (const n of s.vo('p', ch, 60, 3)) s.ev('pad', 'pad', 0, 3.9, n, 0.45, { a: 0.4, r: 0.8, det: 6 });
      s.hit('brush', 1, 0.35); s.hit('brush', 3, 0.35); s.hit('kick', 0, 0.35);
      if (s.first) s.ev('church', 'tine', 0, 4, s.key - 12, 0.6, { k: 'bell' });
      if (k % 4 === 3) s.hit('tri', 2, 0.45, { tr: 'bells' });
    },
  },
};

// ── boîtes à musique : « Au clair de la lune » (puis variations), mécanisme à ressort ──
// [début, durée, demi-tons depuis la tonique] — « Au clair de la lune, mon ami Pierrot » / « Ma chandelle est morte… »
const LUNE = {
  A: [[[0, 1, 0], [1, 1, 0], [2, 1, 0], [3, 1, 2]], [[0, 2, 4], [2, 2, 2]], [[0, 1, 0], [1, 1, 4], [2, 1, 2], [3, 1, 2]], [[0, 4, 0]]],
  B: [[[0, 1, 2], [1, 1, 2], [2, 1, 2], [3, 1, 2]], [[0, 2, -3], [2, 2, -3]], [[0, 1, 2], [1, 1, 0], [2, 1, -1], [3, 1, -3]], [[0, 4, -5]]],
};
function boxInit(s, wrong) {
  const R = s.R; s.bpm = R.int(92, 108); s.key = 84 + R.pick([0, 2, -1, 1]); s.sc = SCALE.maj;
  s.secs = { A: { prog: prog('I I,V I,V I'), len: 4, tune: LUNE.A }, B: { prog: prog('V ii V7 V'), len: 4, tune: LUNE.B } };
  s.form = ['A', 'A', 'B', 'A'];
  s.track('box', { hp: 260, peak: [2600, 3, 1.2], gain: 1 });
  s.vars = [0, ...R.shuffle([1, 2, 3])]; s.spring = R() * 10; s.drift = 1;
}
function boxBar(s, sec, k, wrong) {
  const R = s.R, v = s.vars[s.cycle % 4], minor = wrong && s.cycle % 2 === 1, sc = minor ? SCALE.min : SCALE.maj;
  s.spring += 0.7; let tempo = 1 + Math.sin(s.spring) * 0.03 + Math.sin(s.spring * 0.37) * 0.025;
  if (wrong) {
    if (s.winding) { // remontage : le cliquet accélère, puis la mélodie repart (la mesure est rejouée)
      s.winding = false; s.drift = 1.04; s.setTempoAt(0, 1);
      for (let t = 0, gap = 0.45; t < 3.7; t += gap, gap = Math.max(0.1, gap * 0.8)) s.hit('tick', t, 0.5 + R() * 0.4, { tr: 'box', p: 0.7 + R() * 0.5 });
      s.bis--; return;
    }
    s.drift *= R.range(0.86, 0.95);
    if (s.drift < 0.4 || (s.drift < 0.6 && R.chance(0.15))) s.winding = true;
    tempo *= s.drift;
    if (R.chance(0.05)) { s.setTempoAt(0, 0.2); return; } // la mécanique accroche : silence
  }
  s.setTempoAt(0, tempo);
  if (k === 3) s.setTempoAt(2.5, tempo * (wrong ? 0.35 : 0.88));
  let tune = sec.tune[k].map(([b, d, n]) => ({ b, d, n: minor && [4, 9, 11].includes(mod(n, 12)) ? n - 1 : n, v: b === 0 ? 0.9 : 0.75 }));
  if (v === 3) tune = tune.flatMap((nt) => (nt.d >= 2 ? [{ ...nt, d: nt.d / 2 }, { ...nt, b: nt.b + nt.d / 2, d: nt.d / 2, n: stepSc(nt.n, R.pick([1, -1]), sc), v: 0.6 }] : [nt]));
  const sag = wrong ? -50 * (1 - s.drift) : 0;
  for (const nt of tune) {
    if (wrong && R.chance(0.12)) continue;
    let m = s.key + nt.n, c = sag;
    if (wrong) { if (R.chance(0.1)) m += R.pick([-1, 1, -2]); if (R.chance(0.25)) c += R.pick([-1, 1]) * R.range(25, 70); }
    s.ev('box', 'tine', nt.b, nt.d, m, nt.v, { k: 'mbox', c });
    if (v === 2) s.ev('box', 'tine', nt.b, nt.d, s.key + stepSc(nt.n, -2, sc), nt.v * 0.55, { k: 'mbox', c });
  }
  s.chords.forEach((ch, i) => {
    const seg = 4 / s.chords.length, r = s.bassOf(ch, s.key - 24), tones = s.vo('b', ch, s.key - 17, 3);
    s.ev('box', 'tine', i * seg, seg, r, 0.6, { k: 'mbox', c: sag });
    if (v === 1 || v === 3) for (let j = 1; j < seg * 2; j++) if (!wrong || R.chance(0.85)) s.ev('box', 'tine', i * seg + j / 2, 0.5, tones[[0, 2, 1, 2][j % 4]], 0.4, { k: 'mbox', c: sag });
  });
}

// ───────────────────────── API publique ─────────────────────────
const dummy = () => ({ playing: false, stop() { }, setPos() { }, setVolume() { }, setParam() { } });
function handle(song) {
  return {
    get playing() { return !song.stopped && !song.dead; },
    get style() { return song.name; },
    stop(fade = 0.5) { try { song.stop(fade); } catch (e) { warnOnce('stop', e); } },
    setPos(v) { try { song.setPos(v); } catch (e) { warnOnce('setPos', e); } },
    setVolume(v, ramp = 0.1) { try { song.setVolume(v, ramp); } catch (e) { warnOnce('setVolume', e); } },
    setParam(k, v) { try { song.setParam(k, v); } catch (e) { warnOnce('setParam', e); } },
  };
}
export const Music = {
  styles: Object.keys(STYLES),
  // style : nom (repli « muzak »), opts : { pos (→ spatialisé), volume = 1, bus = 'music', seed, ref, maxDist, intensity }
  play(style, opts) {
    let song = null;
    try {
      const o = opts && typeof opts === 'object' ? opts : {};
      let ctx = Audio.ctx;
      if (!ctx) { try { Audio.init(); } catch (e) { /* */ } ctx = Audio.ctx; }
      if (!ctx) return dummy();
      let name = String(style ?? '');
      if (!Object.prototype.hasOwnProperty.call(STYLES, name)) { warnOnce('style:' + name, `style inconnu « ${name} » : repli sur « muzak »`); name = 'muzak'; }
      song = new Song(ctx, name, STYLES[name], o);
      song.start();
      return handle(song);
    } catch (e) {
      warnOnce('play:' + style, 'Music.play a échoué', e);
      try { song?.dispose(); } catch (e2) { /* */ }
      return dummy();
    }
  },
  // arrête tous les morceaux en cours (changement de scène, fin de partie)
  stopAll(fade = 0.5) { for (const s of [...ACTIVE]) { try { s.stop(fade); } catch (e) { /* */ } } },
  get active() { return ACTIVE.size; },
};
