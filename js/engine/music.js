// Musique « dans le monde » (aucune musique de fond) : radio du poste, régie de sonorisation, platine vinyle, baladeur,
// bornes d'arcade, manège, boîtes à musique, projecteur, autoradio, TV, téléphone. Aucun fichier audio.
//
// Architecture : chaque morceau est calculé en JavaScript par MusicEngine, dans un worker (repli : fil principal), à
// 32 kHz, par tranches de 0,2 s (fondu de recouvrement de 4 ms). Voie normale : le worker envoie les tranches
// directement à un processeur AudioWorklet (MessageChannel) qui les recolle, les rééchantillonne et réclame la suite —
// le fil principal ne voit pas passer l'audio et un blocage du jeu n'interrompt pas la musique. Repli (AudioWorklet
// absent, contexte non sécurisé) : AudioBufferSourceNode enchaînés, programmés par le fil principal. Sortie vers
// Audio.output(bus) ou une entrée spatialisée Audio.spatial(). Le coût d'une voix en JS est ~2× plus faible qu'un nœud
// WebAudio, et la réverbération algorithmique ~5× moins chère qu'un ConvolverNode : le budget (≤ 3 % d'un cœur par
// morceau) permet un vrai mixage.
//   Échantillons : calculés dans le worker par modèles physiques/additifs, à la demande (échéance = première note qui
//     en a besoin) : piano à partiels inharmoniques (cordes doublées : battements et double décroissance, marteau,
//     table d'harmonie), Rhodes (lame + micro non linéaire, deux couches de vélocité), guitares/basses/clavecin/harpe en
//     Karplus-Strong étendu (accord fractionnaire, position de pincement, caisse modale), cordes/cuivres/bois/orgues/
//     accordéon/chœur en tables d'onde bouclées sans couture (exécutants désaccordés, vibrato périodique), lames
//     (boîte à musique, célesta, glockenspiel, vibraphone, cloches), batteries synthétisées couche par couche.
//   Voix : interpolation, enveloppes, filtre par voix (vélocité), vibrato, glissés, désaccord global lissé.
//   Pistes : EQ, saturation/ampli + baffle (suréchantillonnée), chorus, trémolo, cabine Leslie, wah, compresseur,
//     envois écho/réverbération ; bus : compression « glue », plaque de Dattorro, couleur (bande, vinyle, 78 tours),
//     haut-parleur (radio, TV, sono, téléphone, jouet), limiteur à anticipation, calibration de sonie (≈ −20 LUFS).
//   Composition : programmes par style (morceaux successifs avec intro/couplet/refrain/pont/fin, motifs, conduite des
//     voix, grooves du genre, humanisation), répertoire du domaine public (repertoire.js).
//   Démarrage : quand un son est attendu tout de suite, la prise est d'abord calculée abrégée (≈ 1,2 s) puis en entier
//     ; le premier bloc accepte une prise voisine ; à vide, le worker prépare les premières notes de chaque style.
//     Si le fil principal se bloque, la ligne de temps glisse (le morceau reprend où il était) au lieu de calculer de
//     la musique déjà passée.
// Contrat public inchangé : Music.play(style, opts) → { stop, setPos, setVolume, setParam('tempo'|'detune'|
// 'intensity'|'track:<nom>') }, Music.stopAll, Music.active, Music.styles ; opts.bus === 'pa' → Audio.output('pa').
import { Audio } from './audio.js';
import { REPERTOIRE } from './repertoire.js';

// ═════════════════════════════════════════ MOTEUR (worker) ═════════════════════════════════════════
// Fonction autonome (sérialisée telle quelle dans le worker) : aucune référence à la portée du module.
export function MusicEngine(host) {
  'use strict';
  const SR = 32000, BLK = 128, TAU = Math.PI * 2, CHUNK = 50 * BLK, OVL = BLK, MEM_MAX = 34e6;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const mod = (a, n) => ((a % n) + n) % n;
  const dB = (x) => Math.pow(10, x / 20);
  const t60k = (t60, sr = SR) => Math.pow(0.001, 1 / Math.max(1e-4, t60 * sr)); // facteur de décroissance par échantillon
  const perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const EMPTY = Object.freeze({});
  const warned = new Set();
  const log = (key, ...a) => { if (warned.has(key)) return; warned.add(key); try { host.post({ t: 'log', msg: a.map((x) => (x && x.stack) || String(x)).join(' ') }); } catch (e) { /* */ } };
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function makeRng(seed) {
    const f = mulberry32(seed), r = () => f();
    r.range = (a, b) => a + (b - a) * f();
    r.int = (a, b) => Math.floor(a + (b - a + 1) * f());
    r.pick = (a) => a[Math.floor(f() * a.length)];
    r.chance = (p) => f() < p;
    r.gauss = () => (f() + f() + f() + f() - 2) * 1.73;
    r.wpick = (pairs) => { let tot = 0; for (const p of pairs) tot += p[1]; let x = f() * tot; for (const p of pairs) { x -= p[1]; if (x <= 0) return p[0]; } return pairs[pairs.length - 1][0]; };
    r.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    return r;
  }

  // ═══════════════ DSP hors ligne (rendu des échantillons) ═══════════════
  // coefficients RBJ normalisés [b0, b1, b2, a1, a2] — lp, hp, bp (crête 0 dB), pk, ls, hs, ap
  function bqc(type, f, q = 0.707, g = 0, sr = SR) {
    const w = TAU * clamp(f, 5, sr * 0.49) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, g / 40);
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    if (type === 'lp') { b1 = 1 - cs; b0 = b2 = b1 / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'hp') { b0 = b2 = (1 + cs) / 2; b1 = -(1 + cs); a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'pk') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
    else if (type === 'ap') { b0 = 1 - al; b1 = -2 * cs; b2 = 1 + al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'ls' || type === 'hs') {
      const s2 = 2 * Math.sqrt(A) * al, sg = type === 'ls' ? 1 : -1;
      b0 = A * ((A + 1) - sg * (A - 1) * cs + s2); b1 = 2 * sg * A * ((A - 1) - sg * (A + 1) * cs); b2 = A * ((A + 1) - sg * (A - 1) * cs - s2);
      a0 = (A + 1) + sg * (A - 1) * cs + s2; a1 = -2 * sg * ((A - 1) + sg * (A + 1) * cs); a2 = (A + 1) + sg * (A - 1) * cs - s2;
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function filtSr(d, type, f, q = 0.707, g = 0, sr = SR) {
    const c = bqc(type, f, q, g, sr), b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4]; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < d.length; i++) { const x = d[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] = y; }
    return d;
  }
  const filt = (d, type, f, q = 0.707, g = 0) => filtSr(d, type, f, q, g, SR);
  function lp1(d, fc) { const a = 1 - Math.exp(-TAU * fc / SR); let y = 0; for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; } return d; }
  function hp1(d, fc) { const a = 1 - Math.exp(-TAU * fc / SR); let y = 0; for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] -= y; } return d; }
  // partiel amorti (oscillateur récursif) : enveloppe double exponentielle (T60 t1 et t2, part m2), attaque linéaire ;
  // s'arrête sous `floor` (absolu, défaut −94 dB du partiel) ; sr : fréquence d'échantillonnage de la prise
  function partial(d, f, amp, t1, t2 = 0, m2 = 0, att = 0, ph = 0, i0 = 0, floor = 0, sr = SR) {
    if (!(f > 0) || f >= sr * 0.475 || !(amp > 1e-7)) return;
    const w = TAU * f / sr, c = 2 * Math.cos(w), k1 = t60k(t1, sr), k2 = t2 ? t60k(t2, sr) : 0, na = Math.max(1, Math.round(att * sr)), N = d.length, stop = Math.max(floor, amp * 2e-5);
    let y1 = Math.sin(ph - w), y2 = Math.sin(ph - 2 * w), e1 = amp * (1 - m2), e2 = amp * m2;
    for (let i = i0, j = 0; i < N; i++, j++) {
      const y = c * y1 - y2; y2 = y1; y1 = y;
      d[i] += j < na ? y * (e1 + e2) * (j / na) : y * (e1 + e2);
      e1 *= k1; e2 *= k2;
      if ((j & 255) === 255 && e1 + e2 < stop) break;
    }
  }
  // deux partiels voisins (cordes d'un même chœur légèrement désaccordées) dans une seule boucle : battements et double
  // décroissance (son « prompt » puis « rémanent »)
  function partial2(d, fa, fb, aa, ab, ta, tb, att, floor, sr) {
    if (fa >= sr * 0.475 || fb >= sr * 0.475) return;
    const wa = TAU * fa / sr, wb = TAU * fb / sr, ca = 2 * Math.cos(wa), cb = 2 * Math.cos(wb), ka = t60k(ta, sr), kb = t60k(tb, sr), na = Math.max(1, Math.round(att * sr)), N = d.length;
    let a1 = Math.sin(-wa), a2 = Math.sin(-2 * wa), b1 = Math.sin(-wb), b2 = Math.sin(-2 * wb), ea = aa, eb = ab;
    for (let i = 0; i < N; i++) {
      const ya = ca * a1 - a2, yb = cb * b1 - b2; a2 = a1; a1 = ya; b2 = b1; b1 = yb;
      const y = ya * ea + yb * eb; d[i] += i < na ? y * (i / na) : y;
      ea *= ka; eb *= kb;
      if ((i & 255) === 255 && ea + eb < floor) break;
    }
  }
  // bruit blanc : attaque linéaire puis décroissance exponentielle (T60)
  function burstSr(d, r, amp, att, t60, sr = SR, i0 = 0) {
    const na = Math.max(1, Math.round(att * sr)), k = t60k(t60, sr), N = Math.min(d.length, i0 + na + Math.ceil(t60 * 1.7 * sr)); let e = amp;
    for (let i = i0, j = 0; i < N; i++, j++) { if (j < na) d[i] += (r() * 2 - 1) * amp * (j / na); else { d[i] += (r() * 2 - 1) * e; e *= k; } }
    return d;
  }
  const burst = (d, r, amp, att, t60, i0 = 0) => burstSr(d, r, amp, att, t60, SR, i0);
  // résonances (caisse, table, corps) : passe-bandes parallèles excités par le signal, ajoutés au direct
  function body(d, modes, wet = 1) {
    const src = Float32Array.from(d);
    for (const [f, t60, g] of modes) {
      const Q = Math.max(0.5, Math.PI * f * t60 / 6.91), c = bqc('bp', f, Q), b0 = c[0], a1 = c[3], a2 = c[4], gg = g * wet; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < d.length; i++) { const x = src[i], y = b0 * (x - x2) - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] += y * gg; }
    }
    return d;
  }
  // petite salle hors ligne (prise « room » des batteries) : 4 peignes amortis + 2 passe-tout
  function room(d, mix, size = 1, damp = 0.35) {
    const src = Float32Array.from(d), out = new Float32Array(d.length);
    for (const L0 of [1116, 1188, 1277, 1356]) {
      const L = Math.round(L0 * size * SR / 44100), buf = new Float32Array(L); let k = 0, lp = 0;
      for (let i = 0; i < d.length; i++) { const y = buf[k]; lp = y * (1 - damp) + lp * damp; buf[k] = src[i] + lp * 0.72; if (++k >= L) k = 0; out[i] += y * 0.25; }
    }
    for (const L0 of [556, 341]) {
      const L = Math.round(L0 * size * SR / 44100), buf = new Float32Array(L); let k = 0;
      for (let i = 0; i < d.length; i++) { const b = buf[k], x = out[i] + b * 0.5; buf[k] = x; out[i] = b - x * 0.5; if (++k >= L) k = 0; }
    }
    for (let i = 0; i < d.length; i++) d[i] = src[i] * (1 - mix * 0.5) + out[i] * mix;
    return d;
  }
  function peak(d) { let p = 0; for (let i = 0; i < d.length; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > p) p = a; } return p; }
  function rms(d, i0 = 0, i1 = d.length) { let s = 0; i1 = Math.min(i1, d.length); for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); }
  function scale(d, k) { for (let i = 0; i < d.length; i++) d[i] *= k; return d; }
  function fadeEndSr(d, sec = 0.02, sr = SR) { const n = Math.min(d.length >> 1, Math.round(sec * sr)); for (let i = 0; i < n; i++) d[d.length - 1 - i] *= i / n; return d; }
  const fadeEnd = (d, sec = 0.02) => fadeEndSr(d, sec, SR);
  function fadeIn(d, sec = 0.001) { const n = Math.min(d.length >> 1, Math.max(1, Math.round(sec * SR))); for (let i = 0; i < n; i++) d[i] *= i / n; return d; }
  // enveloppe spectrale : points [Hz, dB] interpolés en fréquence logarithmique
  function spec(pts) { const lf = pts.map((p) => Math.log(p[0])); return (f) => { const x = Math.log(Math.max(1, f)); if (x <= lf[0]) return dB(pts[0][1]); for (let i = 1; i < pts.length; i++) if (x <= lf[i]) { const u = (x - lf[i - 1]) / (lf[i] - lf[i - 1]); return dB(pts[i - 1][1] + u * (pts[i][1] - pts[i - 1][1])); } return dB(pts[pts.length - 1][1]); }; }
  // table d'onde d'une période (WT points + 2 de garde), harmoniques k = amps[k], phases optionnelles
  const WT = 2048;
  function table(amps, phases) {
    const t = new Float32Array(WT + 2);
    for (let k = 1; k < amps.length; k++) {
      const a = amps[k]; if (!a) continue;
      const w = TAU * k / WT, c = 2 * Math.cos(w), p = phases ? phases[k] : 0; let y1 = Math.sin(p - w), y2 = Math.sin(p - 2 * w);
      for (let i = 0; i < WT; i++) { const y = c * y1 - y2; y2 = y1; y1 = y; t[i] += a * y; }
    }
    t[WT] = t[0]; t[WT + 1] = t[1]; return t;
  }
  // bruit périodique (période L) filtré circulairement : la boucle de souffle/archet n'a pas de couture
  function noiseLoop(L, r, filters) {
    const d = new Float32Array(L); for (let i = 0; i < L; i++) d[i] = r() * 2 - 1;
    const two = new Float32Array(L * 2); two.set(d); two.set(d, L);
    for (const [type, f, q, g] of filters) filt(two, type, f, q, g || 0);
    const out = two.subarray(L, 2 * L).slice(); const k = 1 / (rms(out) || 1); for (let i = 0; i < L; i++) out[i] *= k; return out;
  }
  // Ensemble en table d'onde bouclée : P exécutants (désaccord, vibrato, trémolo, décalage d'attaque). Toutes les
  // fréquences (notes, LFO) sont quantifiées sur 1/boucle : [A, A+L[ est exactement périodique → boucle sans couture.
  // o : harm(k, fk) amplitude, P, det (cents, écart), vib [Hz, cents], am (profondeur), att (s), spread (s), loop (s),
  //     noise { lvl, f: [[type, f, q, g]…], att (souffle d'attaque), atk (niveau du bruit d'attaque) }, phase ('rand'|'saw')
  let RMAX = Infinity; // durée maximale d'une prise : abrégée (≈ 1,2 s) quand le son est attendu tout de suite
  function ensemble(f, o, r) {
    const Lp = Math.round(Math.min(o.loop ?? 1.6, RMAX * 0.5) * SR), q = SR / Lp, P = o.P ?? 1, det = o.det ?? 0, spread = o.spread ?? 0;
    const A = Math.round(((o.att ?? 0.08) + spread) * SR) + 256, N = A + Lp + 3, d = new Float32Array(N);
    const fq = (x) => Math.max(1, Math.round(x / q)) * q, f0 = fq(f);
    const maxR = Math.pow(2, (det + (o.vib ? o.vib[1] : 0)) / 1200 * 1.5), K = Math.max(1, Math.floor(SR * 0.46 / (f0 * maxR)));
    const amps = new Float32Array(K + 1), ph = new Float32Array(K + 1);
    for (let k = 1; k <= K; k++) { amps[k] = o.harm(k, k * f0); ph[k] = o.phase === 'saw' ? 0 : r() * TAU; }
    const tab = table(amps, ph), tp = peak(tab) || 1; for (let i = 0; i < tab.length; i++) tab[i] /= tp;
    for (let p = 0; p < P; p++) {
      const cents = P > 1 ? det * ((p / (P - 1)) * 2 - 1) * (0.7 + 0.3 * r()) : 0, fp = fq(f0 * Math.pow(2, cents / 1200)), inc0 = fp / SR * WT;
      const vr = o.vib ? Math.max(1, Math.round(o.vib[0] * (0.85 + 0.3 * r()) * Lp / SR)) : 0, vd = o.vib ? (Math.pow(2, o.vib[1] * (0.7 + 0.6 * r()) / 1200) - 1) : 0;
      const ar = Math.max(1, Math.round((0.3 + 1.2 * r()) * Lp / SR)), ad = o.am ?? 0, w1 = TAU * vr / Lp, w2 = TAU * ar / Lp, p1 = r() * TAU, p2 = r() * TAU;
      const on = Math.round(spread * r() * SR), na = Math.max(1, Math.round((o.att ?? 0.08) * (0.8 + 0.4 * r()) * SR)), g = 1 / Math.sqrt(P);
      const c1 = Math.cos(w1), s1 = Math.sin(w1), c2 = Math.cos(w2), s2 = Math.sin(w2);
      let phase = r() * WT, vc = Math.cos(p1), vs = Math.sin(p1), ac = Math.cos(p2), as = Math.sin(p2);
      // les LFO (rotations récursives) tournent depuis n = 0 (périodicité), l'exécutant n'entre qu'à `on`
      for (let n = 0; n < N; n++) {
        phase += inc0 * (1 + vd * vs); if (phase >= WT) phase -= WT;
        const am = 1 + ad * as;
        let t = vc * c1 - vs * s1; vs = vc * s1 + vs * c1; vc = t; t = ac * c2 - as * s2; as = ac * s2 + as * c2; ac = t;
        if (n < on) continue;
        const ip = phase | 0, fr = phase - ip, s = tab[ip] + (tab[ip + 1] - tab[ip]) * fr, j = n - on;
        d[n] += s * g * am * (j < na ? (j / na) * (j / na) * (3 - 2 * j / na) : 1);
      }
    }
    if (o.noise) {
      const nz = o.noise, nl = noiseLoop(Lp, r, nz.f || [['bp', f0 * 2, 0.7]]), ga = nz.lvl ?? 0.05, na = Math.round((o.att ?? 0.08) * SR);
      for (let n = 0; n < N; n++) d[n] += nl[n % Lp] * ga * (n < na ? n / na : 1);
      if (nz.atk) { const b = new Float32Array(Math.min(N, Math.round(0.12 * SR))); burst(b, r, nz.atk, 0.002, nz.atkT ?? 0.05); for (const [type, ff, qq, gg] of nz.f || []) filt(b, type, ff, qq, gg || 0); for (let i = 0; i < b.length; i++) d[i] += b[i]; }
    }
    return { d, f0, ls: A, le: A + Lp };
  }
  // Karplus-Strong étendu : accord fractionnaire (passe-tout de Thiran), perte dépendant de la fréquence (passe-bas à
  // un pôle compensé), excitation = bruit filtré (brillance) avec peigne de position de pincement, raideur optionnelle
  // o : t60 (fondamental), damp (0..0.9 : assombrissement), bright (0..1), pos (0..0.5), len (s), pick (clic), exc (Float32Array)
  function kstr(d, f, o, r, gain = 1, i0 = 0) {
    const a = clamp(o.damp ?? 0.25, 0, 0.95), w = TAU * f / SR, P = SR / f;
    const dLp = Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w)) / w, total = P - dLp;
    const Li = Math.max(2, Math.floor(total - 0.5)), frac = total - Li, eta = (1 - frac) / (1 + frac);
    const lpMag = (1 - a) / Math.sqrt(1 - 2 * a * Math.cos(w) + a * a), g = Math.min(0.99999, Math.pow(0.001, 1 / (f * (o.t60 ?? 2))) / lpMag);
    const buf = new Float32Array(Li);
    // excitation : une période de bruit, passe-bas (brillance), peigne de position, moyenne nulle
    const br = clamp(o.bright ?? 0.5, 0.02, 1); let z = 0, mean = 0;
    const ex = o.exc || null;
    for (let i = 0; i < Li; i++) { const x = ex ? (ex[i] || 0) : r() * 2 - 1; z += (x - z) * br; buf[i] = z; mean += z; }
    mean /= Li; for (let i = 0; i < Li; i++) buf[i] -= mean;
    if (o.pos) { const pp = Math.max(1, Math.round(Li * o.pos)), cp = buf.slice(); for (let i = 0; i < Li; i++) buf[i] = cp[i] - cp[(i - pp + Li) % Li]; }
    const bp = peak(buf) || 1; for (let i = 0; i < Li; i++) buf[i] *= gain / bp;
    let idx = 0, apx = 0, apy = 0, lp = 0; const N = d.length;
    for (let i = i0; i < N; i++) {
      const y = buf[idx];
      const ap = eta * y + apx - eta * apy; apx = y; apy = ap;
      lp = (1 - a) * ap + a * lp;
      buf[idx] = lp * g; if (++idx >= Li) idx = 0;
      d[i] += y;
    }
    return SR / (Li + frac + dLp); // fréquence réelle (≈ f)
  }
  // lames, barres, peignes, cloches : partiels inharmoniques [rapport, amplitude, T60 (s)]
  function modal(d, f, parts, o, r) {
    const sc = o.scale ?? 1;
    for (const [ra, am, t] of parts) { const fr = f * ra * (1 + (o.jit ?? 0) * (r() - 0.5)); if (fr < SR * 0.46) partial(d, fr, am, t * sc, 0, 0, o.att ?? 0.0005, r() * TAU); }
  }

  // ═══════════════ instruments échantillonnés ═══════════════
  // Chaque instrument : grid (pas en demi-tons entre prises), lo/hi (tessiture des prises), layers (couches de
  // vélocité), render(note, couche, rng) → { d, f0, ls?, le? } ; rel (relâchement s), env (attaque, décroissance…),
  // vf (filtre de vélocité : coupure = f(vel)), pan (étalement selon la hauteur), nodamp (au-dessus : pas d'étouffoir)
  const pianoB = (n) => Math.pow(10, n < 60 ? -3.4 + 0.027 * (n - 60) : -3.4 + 0.0475 * (n - 60));
  function renderPiano(n, layer, r) {
    // le grave est calculé à 16 kHz (partiels < 7,5 kHz) : deux fois moins de calcul et de mémoire
    const sr = n <= 45 ? SR / 2 : SR, f0 = mtof(n), B = pianoB(n), sec = Math.min(RMAX, n <= 40 ? 5.5 : n <= 60 ? 5.5 - (n - 40) * 0.08 : n <= 84 ? 3.9 - (n - 60) * 0.06 : Math.max(1.1, 2.4 - (n - 84) * 0.055));
    const N = Math.ceil(sec * sr), d = new Float32Array(N + 3), fmax = Math.min(12000, sr * 0.46);
    const T1 = clamp(6.5 * Math.pow(262 / f0, 0.55), 0.35, 17), beta = 0.115 + 0.025 * r(), hc = clamp(f0 * 7, 1600, 5200), K = Math.min(170, Math.floor(fmax / f0));
    const strings = n < 28 ? 1 : n < 40 ? 2 : 3, att = 0.0006 + 0.0012 * Math.exp(-n / 40), parts = [];
    let amax = 0;
    for (let k = 1; k <= K; k++) {
      const fk = k * f0 * Math.sqrt(1 + B * k * k); if (fk > fmax) break;
      let a = (Math.abs(Math.sin(Math.PI * k * beta)) + 0.04) / Math.pow(k, 0.7) / Math.sqrt(1 + Math.pow(fk / hc, 3));
      a *= fk / Math.sqrt(fk * fk + 160 * 160) * (1 + 0.35 * Math.exp(-Math.pow((fk - 2800) / 1400, 2)));
      parts.push([fk, a, T1 / (1 + Math.pow(fk / 1500, 1.5) * 1.3 + (k - 1) * 0.035)]); if (a > amax) amax = a;
    }
    const floor = amax * 6e-5;
    for (const [fk, a, tk] of parts) {
      if (a < amax * 4e-4) continue;
      const tAfter = tk * (1 + 2.2 * Math.exp(-fk / 1200)); // le son rémanent ne concerne que les premiers partiels
      if (strings === 1) partial(d, fk, a, tk, tAfter, 0.2, att, 0, 0, floor, sr);
      else { const c = (0.35 + 0.9 * r()) * (strings === 3 ? 1 : 0.6), m = Math.pow(2, c / 1200); partial2(d, fk * m, fk / m, a * 0.8, a * 0.2, tk, tAfter, att, floor, sr); }
    }
    // marteau : choc feutré bref + cognement sourd de la table (plus marqué dans le grave)
    const h = new Float32Array(Math.round(0.09 * sr)); burstSr(h, r, 1, 0.0004, 0.012 + 0.03 * clamp((70 - n) / 40, 0, 1), sr);
    filtSr(h, 'lp', clamp(f0 * 5, 900, 5000), 0.8, 0, sr); filtSr(h, 'hp', 50, 0.7, 0, sr);
    const hp = peak(d.subarray(0, Math.round(0.03 * sr))) || 1, hg = hp * (0.05 + 0.07 * clamp((72 - n) / 50, 0, 1));
    const hk = peak(h) || 1; for (let i = 0; i < h.length; i++) d[i] += h[i] / hk * hg;
    partial(d, 95 + 30 * r(), hp * 0.035, 0.12, 0, 0, 0.001, 0, 0, 0, sr);
    filtSr(d, 'pk', 115, 1.1, 2.5, sr); filtSr(d, 'pk', 650, 1.2, -1.5, sr); filtSr(d, 'pk', 2600, 1.4, 1.5, sr); filtSr(d, 'hp', 32, 0.7, 0, sr);
    // sonie uniforme sur le clavier (RMS des 250 premières ms), grave un peu plus nourri
    scale(d, 0.22 / (rms(d, 0, Math.round(0.25 * sr)) || 1) * (1 + 0.3 * clamp((60 - n) / 36, 0, 1)) * (n > 90 ? 0.8 : 1));
    fadeEndSr(d, Math.min(0.4, sec * 0.25), sr);
    return { d, f0, sr };
  }
  // Rhodes : lame + barre de tonalité (fondamental, 2e mode faible, « ding » inharmonique bref), micro non linéaire
  // asymétrique (la vélocité change le timbre : couche douce ronde, couche forte qui « grogne »)
  function renderRhodes(n, layer, r) {
    const f0 = mtof(n), sec = Math.min(RMAX, clamp(1.6 + (78 - n) * 0.055, 1.1, 4.2)), N = Math.ceil(sec * SR), d = new Float32Array(N + 3);
    const A = layer === 'h' ? 1.15 : 0.42, T = clamp(7 * Math.pow(220 / f0, 0.55), 1.2, 9), x = new Float32Array(N);
    partial(x, f0, A, T, T * 2.5, 0.3, 0.0008, 0); partial(x, f0 * 2, A * 0.05, T * 0.3, 0, 0, 0.001, 0);
    partial(x, f0 * 7.1, A * 0.55 * (layer === 'h' ? 1 : 0.6), 0.05, 0, 0, 0.0003, 0); partial(x, f0 * 15.8, A * 0.2, 0.02, 0, 0, 0.0003, 0);
    const k = 1.55, off = 0.38, t0 = Math.tanh(k * off);
    for (let i = 0; i < N; i++) d[i] = Math.tanh(k * (x[i] + off)) - t0;
    const b = new Float32Array(Math.round(0.03 * SR)); burst(b, r, 0.02 * A, 0.0003, 0.008); filt(b, 'bp', 2500, 0.8); for (let i = 0; i < b.length; i++) d[i] += b[i];
    hp1(d, 70); filt(d, 'lp', 7500, 0.6); filt(d, 'pk', 220, 0.9, 1.5);
    scale(d, 0.25 / (rms(d, 0, Math.round(0.3 * SR)) || 1) * (layer === 'h' ? 1.25 : 0.85));
    fadeEnd(d, 0.25); return { d, f0 };
  }
  // cordes pincées / frappées en Karplus-Strong étendu + caisse de résonance
  function renderPluck(n, layer, r, o) {
    const f0 = mtof(n), t60 = typeof o.t60 === 'function' ? o.t60(f0) : o.t60, sec = Math.min(RMAX, clamp(o.len ? o.len(f0) : t60 * 0.9, 0.12, 6)), N = Math.ceil(sec * SR) + 3, d = new Float32Array(N);
    let fr = f0;
    if (o.excite) { const e = new Float32Array(Math.ceil(SR / f0) + 4); o.excite(e, r, f0); fr = kstr(d, f0, { ...o, t60, exc: e }, r); }
    else fr = kstr(d, f0, { ...o, t60 }, r);
    if (o.chord) { let i0 = 0; for (const [iv, g] of o.chord) { i0 += Math.round((o.strum ?? 0.004) * SR); kstr(d, f0 * Math.pow(2, iv / 12), { ...o, t60: t60 * (1 - iv / 60) }, r, g, i0); } } // accord de quinte : cordes plaquées dans une seule prise
    if (o.second) { const [ra, g2, tt] = o.second; kstr(d, f0 * ra, { ...o, t60: t60 * (tt ?? 0.8), pos: (o.pos ?? 0.2) * 1.3 }, r, g2); }
    if (o.thump) { const ph0 = r() * 0.1; for (let i = 0; i < Math.min(N, SR * 0.12); i++) d[i] += Math.sin(TAU * f0 * i / SR + ph0) * Math.exp(-i / SR / 0.025) * o.thump; }
    if (o.pick) { const b = new Float32Array(Math.round(0.02 * SR)); burst(b, r, o.pick, 0.0002, 0.004); filt(b, 'hp', 1500, 0.7); for (let i = 0; i < b.length; i++) d[i] += b[i]; }
    if (o.modes) body(d, o.modes, o.bodyWet ?? 1);
    if (o.post) o.post(d, f0, r);
    hp1(d, o.hp ?? 35);
    scale(d, 0.25 / (rms(d, 0, Math.round(0.2 * SR)) || 1)); fadeEnd(d, Math.min(0.05, sec * 0.2)); fadeIn(d, 0.0004);
    return { d, f0: fr };
  }
  // caisses : guitare classique, folk (table épicéa), archtop jazz, contrebasse, harpe, clavecin
  const BODY = {
    nylon: [[98, 0.06, 1.4], [204, 0.05, 1.1], [390, 0.04, 0.6], [550, 0.035, 0.35], [1100, 0.02, 0.15]],
    steel: [[105, 0.06, 1.2], [215, 0.05, 1.0], [420, 0.035, 0.55], [700, 0.03, 0.3], [2300, 0.015, 0.12]],
    archtop: [[120, 0.05, 0.8], [250, 0.04, 0.7], [500, 0.03, 0.4]],
    upright: [[62, 0.09, 1.6], [125, 0.07, 1.0], [260, 0.04, 0.5]],
    harp: [[150, 0.08, 0.6], [300, 0.05, 0.4]],
    harpsi: [[180, 0.05, 0.5], [420, 0.04, 0.4], [1300, 0.02, 0.2]],
  };
  const PLUCK = {
    nylon: { t60: (f) => clamp(5 * Math.pow(110 / f, 0.5), 1.2, 6), len: (f) => clamp(3.2 * Math.pow(110 / f, 0.4), 0.9, 4), damp: 0.32, bright: 0.38, pos: 0.16, modes: BODY.nylon, pick: 0.01 },
    steel: { t60: (f) => clamp(7 * Math.pow(110 / f, 0.5), 1.5, 8), len: (f) => clamp(3.8 * Math.pow(110 / f, 0.4), 1, 4.5), damp: 0.16, bright: 0.62, pos: 0.13, modes: BODY.steel, pick: 0.04 },
    jazzgtr: { t60: (f) => clamp(4 * Math.pow(110 / f, 0.5), 1, 5), len: (f) => clamp(2.6 * Math.pow(110 / f, 0.4), 0.8, 3.5), damp: 0.45, bright: 0.33, pos: 0.2, modes: BODY.archtop, bodyWet: 0.6, pick: 0.015 },
    eclean: { t60: (f) => clamp(9 * Math.pow(110 / f, 0.45), 2, 9), len: (f) => clamp(3.5 * Math.pow(110 / f, 0.35), 1.2, 4), damp: 0.2, bright: 0.55, pos: 0.25, pick: 0.03, post: (d) => filt(d, 'pk', 2500, 1, 3) },
    elec: { t60: (f) => clamp(14 * Math.pow(110 / f, 0.4), 3, 12), len: (f) => clamp(4 * Math.pow(110 / f, 0.3), 1.5, 4.5), damp: 0.14, bright: 0.7, pos: 0.18, pick: 0.05 },
    epm: { t60: 0.22, len: () => 0.34, damp: 0.6, bright: 0.45, pos: 0.18, pick: 0.06 },
    clav: { t60: (f) => clamp(2.2 * Math.pow(220 / f, 0.4), 0.6, 2.5), len: (f) => clamp(1.4 * Math.pow(220 / f, 0.3), 0.4, 1.6), damp: 0.08, bright: 0.95, pos: 0.07, pick: 0.05, post: (d) => { filt(d, 'pk', 1200, 1.5, 4); filt(d, 'hp', 150, 0.7); } },
    harpsi: { t60: (f) => clamp(9 * Math.pow(110 / f, 0.55), 1.8, 10), len: (f) => clamp(3.5 * Math.pow(110 / f, 0.45), 0.9, 4.5), damp: 0.05, bright: 0.95, pos: 0.07, second: [1.0018, 0.6, 0.9], modes: BODY.harpsi, bodyWet: 0.8, pick: 0.06 },
    harp: { t60: (f) => clamp(8 * Math.pow(110 / f, 0.5), 1.6, 9), len: (f) => clamp(3.4 * Math.pow(110 / f, 0.4), 1, 4), damp: 0.3, bright: 0.42, pos: 0.32, modes: BODY.harp, bodyWet: 0.7 },
    upright: { t60: (f) => clamp(2.4 * Math.pow(55 / f, 0.3), 0.9, 3), len: (f) => clamp(1.8 * Math.pow(55 / f, 0.3), 0.7, 2.2), damp: 0.55, bright: 0.18, pos: 0.22, thump: 0.6, modes: BODY.upright, hp: 25 },
    ebass: { t60: (f) => clamp(8 * Math.pow(55 / f, 0.3), 2.5, 9), len: (f) => clamp(2.6 * Math.pow(55 / f, 0.25), 1.2, 3), damp: 0.4, bright: 0.32, pos: 0.18, thump: 0.25, hp: 25, post: (d) => filt(d, 'lp', 3500, 0.7) },
    pbass: { t60: (f) => clamp(6 * Math.pow(55 / f, 0.3), 2, 7), len: (f) => clamp(2.2 * Math.pow(55 / f, 0.25), 1, 2.6), damp: 0.25, bright: 0.6, pos: 0.12, pick: 0.06, hp: 25, post: (d) => filt(d, 'lp', 4500, 0.7) },
    slap: { t60: (f) => clamp(4 * Math.pow(55 / f, 0.3), 1.2, 5), len: (f) => clamp(1.6 * Math.pow(55 / f, 0.25), 0.8, 2), damp: 0.12, bright: 0.85, pos: 0.06, thump: 0.5, pick: 0.12, hp: 25, post: (d) => { filt(d, 'pk', 90, 0.8, 3); filt(d, 'pk', 2500, 1, 4); filt(d, 'pk', 600, 1, -4); } },
    pizz: { t60: (f) => clamp(1.1 * Math.pow(220 / f, 0.4), 0.35, 1.6), len: (f) => clamp(0.9 * Math.pow(220 / f, 0.4), 0.3, 1.3), damp: 0.5, bright: 0.3, pos: 0.3, modes: [[280, 0.04, 1.2], [480, 0.03, 0.8], [2600, 0.02, 0.4]] },
    power: { t60: (f) => clamp(14 * Math.pow(110 / f, 0.4), 3, 12), len: (f) => clamp(4 * Math.pow(110 / f, 0.3), 1.5, 4.5), damp: 0.14, bright: 0.7, pos: 0.18, pick: 0.05, chord: [[7, 0.85], [12, 0.6]], strum: 0.005 },
    powpm: { t60: 0.22, len: () => 0.34, damp: 0.6, bright: 0.45, pos: 0.18, pick: 0.06, chord: [[7, 0.8]], strum: 0.002 },
    uke: { t60: (f) => clamp(2.2 * Math.pow(262 / f, 0.5), 0.6, 2.5), len: (f) => clamp(1.4 * Math.pow(262 / f, 0.4), 0.5, 1.8), damp: 0.3, bright: 0.5, pos: 0.15, modes: [[230, 0.05, 1], [460, 0.04, 0.6]] },
  };
  // modèles en table d'onde (tenus, bouclés)
  const S_STR = spec([[60, -18], [196, -4], [280, 3], [450, 1], [700, -2], [1100, -1], [2600, 3], [4200, -3], [7000, -16], [12000, -34]]);
  const S_CELLO = spec([[40, -14], [100, -2], [200, 3], [400, 0], [800, -3], [1600, 0], [2600, -4], [5000, -14], [9000, -30]]);
  const S_TPT = spec([[150, -14], [400, -3], [900, 2], [1400, 4], [2200, 1], [3500, -6], [6000, -18], [10000, -34]]);
  const S_BONE = spec([[60, -10], [200, -1], [500, 2], [900, 1], [1600, -4], [3000, -14], [6000, -30]]);
  const S_HORN = spec([[60, -10], [180, 0], [400, 1], [800, -5], [1500, -14], [3000, -28], [6000, -44]]);
  const S_SAX = spec([[100, -10], [300, 0], [600, 3], [1200, 1], [2400, -2], [4000, -8], [7000, -20], [12000, -36]]);
  const S_ACC = spec([[80, -12], [300, -2], [800, 2], [1600, 1], [3000, -3], [5500, -12], [9000, -26]]);
  const S_ORG = spec([[30, -6], [500, 0], [2000, -4], [5000, -14], [10000, -30]]);
  const S_CHOIR = { a: [[700, 110], [1150, 120], [2650, 160], [3450, 200]], o: [[450, 80], [800, 90], [2830, 140], [3500, 200]], u: [[325, 70], [700, 80], [2530, 140], [3500, 200]] };
  function formants(list, f) { let a = 0; for (const [fc, bw] of list) { const x = (f - fc) / bw; a += 1 / (1 + x * x); } return a; }
  const WIND = {
    // cordes d'orchestre (pupitre) : dent de scie colorée par la caisse, 6 exécutants, vibrato individuel, archet
    strings: (f, r) => ensemble(f, { harm: (k, fk) => S_STR(fk) / Math.pow(k, 0.85), P: 5, det: 9, vib: [5.4, 11], am: 0.07, att: 0.09, spread: 0.035, loop: 1.4, noise: { lvl: 0.035, f: [['hp', 1800, 0.7], ['lp', 7000, 0.7]], atk: 0.1, atkT: 0.06 } }, r),
    strings_lo: (f, r) => ensemble(f, { harm: (k, fk) => S_CELLO(fk) / Math.pow(k, 0.8), P: 4, det: 8, vib: [5, 10], am: 0.06, att: 0.1, spread: 0.03, loop: 1.6, noise: { lvl: 0.03, f: [['hp', 900, 0.7], ['lp', 5000, 0.7]], atk: 0.1 } }, r),
    // violon / violoncelle solo : sans vibrato pré-calculé (vibrato expressif appliqué par la voix)
    violin: (f, r) => ensemble(f, { harm: (k, fk) => S_STR(fk) / Math.pow(k, 0.75), P: 1, am: 0.04, att: 0.06, loop: 1.2, noise: { lvl: 0.05, f: [['hp', 2500, 0.7], ['lp', 8000, 0.7]], atk: 0.12, atkT: 0.05 } }, r),
    cello: (f, r) => ensemble(f, { harm: (k, fk) => S_CELLO(fk) / Math.pow(k, 0.72), P: 1, am: 0.04, att: 0.07, loop: 1.2, noise: { lvl: 0.04, f: [['hp', 1200, 0.7], ['lp', 6000, 0.7]], atk: 0.1 } }, r),
    // cuivres : spectre ff (la voix referme le filtre selon la nuance), section à 2 ou solo
    trumpet: (f, r) => ensemble(f, { harm: (k, fk) => S_TPT(fk) / Math.pow(k, 0.25), P: 2, det: 5, am: 0.03, att: 0.035, loop: 1, noise: { lvl: 0.012, f: [['bp', 1500, 0.8]], atk: 0.05, atkT: 0.03 } }, r),
    trombone: (f, r) => ensemble(f, { harm: (k, fk) => S_BONE(fk) / Math.pow(k, 0.3), P: 2, det: 5, am: 0.03, att: 0.045, loop: 1, noise: { lvl: 0.01, f: [['bp', 900, 0.8]], atk: 0.04 } }, r),
    horn: (f, r) => ensemble(f, { harm: (k, fk) => S_HORN(fk) / Math.pow(k, 0.4), P: 3, det: 6, am: 0.03, att: 0.07, loop: 1.2, noise: { lvl: 0.008, f: [['bp', 700, 0.8]] } }, r),
    tuba: (f, r) => ensemble(f, { harm: (k, fk) => S_HORN(fk * 1.4) / Math.pow(k, 0.5), P: 1, am: 0.02, att: 0.05, loop: 1, noise: { lvl: 0.01, f: [['bp', 400, 0.8]] } }, r),
    sax: (f, r) => ensemble(f, { harm: (k, fk) => S_SAX(fk) / Math.pow(k, 0.45), P: 1, am: 0.05, att: 0.04, loop: 1.1, noise: { lvl: 0.04, f: [['bp', 2200, 0.6]], atk: 0.06, atkT: 0.04 } }, r),
    // bois : flûte (presque sinusoïdale, souffle), clarinette (harmoniques impairs), hautbois (nasal)
    flute: (f, r) => ensemble(f, { harm: (k, fk) => (k === 1 ? 1 : k === 2 ? 0.25 : k === 3 ? 0.12 : 0.05 / k) * (fk < 9000 ? 1 : 0), P: 1, am: 0.06, att: 0.05, loop: 1.1, noise: { lvl: 0.07, f: [['bp', f * 2, 0.9], ['lp', 9000, 0.7]], atk: 0.1, atkT: 0.04 } }, r),
    clarinet: (f, r) => ensemble(f, { harm: (k, fk) => (k % 2 ? 1 / k : 0.18 / k) * (fk < 1800 ? 1 : 1800 / fk), P: 1, am: 0.03, att: 0.04, loop: 1.1, noise: { lvl: 0.025, f: [['bp', 1500, 0.7]] } }, r),
    oboe: (f, r) => ensemble(f, { harm: (k, fk) => spec([[200, -12], [800, -2], [1300, 3], [2800, -2], [5000, -14], [9000, -30]])(fk) / Math.pow(k, 0.2), P: 1, am: 0.03, att: 0.035, loop: 1.1, noise: { lvl: 0.02, f: [['bp', 1300, 0.8]] } }, r),
    recorder: (f, r) => ensemble(f, { harm: (k) => (k === 1 ? 1 : k === 2 ? 0.08 : k === 3 ? 0.06 : 0.01), P: 1, am: 0.03, att: 0.03, loop: 1, noise: { lvl: 0.04, f: [['bp', f * 3, 1]], atk: 0.08, atkT: 0.02 } }, r),
    // accordéon « musette » : trois anches (−, juste, +), soufflet
    accordion: (f, r) => ensemble(f, { harm: (k, fk) => S_ACC(fk) / Math.pow(k, 0.55), P: 3, det: 17, am: 0.035, att: 0.03, loop: 2, noise: { lvl: 0.012, f: [['bp', 2500, 0.7]] } }, r),
    melodica: (f, r) => ensemble(f, { harm: (k, fk) => S_ACC(fk * 1.3) / Math.pow(k, 0.7), P: 1, am: 0.03, att: 0.03, loop: 1.2, noise: { lvl: 0.03, f: [['bp', 2000, 0.7]] } }, r),
    harmonica: (f, r) => ensemble(f, { harm: (k, fk) => S_ACC(fk * 0.8) / Math.pow(k, 0.6), P: 2, det: 6, am: 0.05, att: 0.03, loop: 1.2, noise: { lvl: 0.03, f: [['bp', 1800, 0.7]] } }, r),
    // orgue d'église (fonds 8'+4' + mixture, deux rangs), orgue de foire (les orgues Hammond sont plus bas)
    church: (f, r) => ensemble(f, { harm: (k, fk) => (k === 1 ? 1 : k === 2 ? 0.75 : k === 3 ? 0.35 : k === 4 ? 0.4 : k === 6 ? 0.18 : k === 8 ? 0.15 : 0.12 / k) * S_ORG(fk), P: 2, det: 3, am: 0.01, att: 0.06, loop: 1.6, noise: { lvl: 0.012, f: [['bp', f * 2, 1.2]], atk: 0.08, atkT: 0.03 } }, r),
    calliope: (f, r) => ensemble(f, { harm: (k) => (k === 1 ? 1 : k === 2 ? 0.3 : k === 3 ? 0.15 : 0.04), P: 1, am: 0.02, att: 0.02, loop: 1, noise: { lvl: 0.06, f: [['bp', f * 2, 0.8]], atk: 0.06 } }, r),
    // chœur (« aah ») : source glottique × formants, 6 chanteurs
    choir: (f, r) => ensemble(f, { harm: (k, fk) => formants(S_CHOIR.a, fk) / Math.pow(k, 1.1) * (fk < 6000 ? 1 : 0.2), P: 6, det: 12, vib: [5.5, 18], am: 0.08, att: 0.18, spread: 0.06, loop: 2, noise: { lvl: 0.03, f: [['bp', 1100, 1], ['lp', 6000, 0.7]] } }, r),
    choir_oo: (f, r) => ensemble(f, { harm: (k, fk) => formants(S_CHOIR.u, fk) / Math.pow(k, 1.2) * (fk < 5000 ? 1 : 0.2), P: 6, det: 12, vib: [5.3, 16], am: 0.07, att: 0.2, spread: 0.06, loop: 2, noise: { lvl: 0.025, f: [['bp', 700, 1]] } }, r),
    // synthés (bouclés) : nappe chaude (dents de scie désaccordées), machine à cordes 70s, nappe de verre
    pad: (f, r) => ensemble(f, { harm: (k, fk) => 1 / k * (fk < 4000 ? 1 : 4000 / fk), P: 5, det: 14, am: 0.04, att: 0.02, loop: 2, phase: 'rand' }, r),
    strmachine: (f, r) => ensemble(f, { harm: (k, fk) => 1 / k * (fk < 3000 ? 1 : Math.pow(3000 / fk, 2)), P: 3, det: 10, vib: [6, 6], att: 0.02, loop: 1.6 }, r),
    glass: (f, r) => ensemble(f, { harm: (k) => (k === 1 ? 1 : k === 2 ? 0.2 : k === 4 ? 0.12 : k === 3 ? 0.08 : 0), P: 2, det: 6, am: 0.03, att: 0.01, loop: 1.5 }, r),
    synbrass: (f, r) => ensemble(f, { harm: (k, fk) => 1 / k * (fk < 2500 ? 1 : Math.pow(2500 / fk, 1.5)), P: 2, det: 9, att: 0.01, loop: 1 }, r),
  };
  // lames, peignes et barres : [rapport, amplitude, T60]
  const MALLET = {
    // boîte à musique : dent encastrée-libre (modes 1 : 6,27 : 17,55), paire de dents presque à l'unisson (battement),
    // déclic de la goupille et brève résonance de la boîte
    mbox: { parts: (f) => [[1, 1, 3.2], [1.0011, 0.4, 3.8], [2.0, 0.035, 0.6], [6.27, 0.22, 0.25], [17.55, 0.05, 0.06]], scale: (f) => clamp(Math.pow(700 / f, 0.6), 0.35, 1.6), len: (f) => clamp(3.6 * Math.pow(700 / f, 0.5), 0.8, 4.5), click: 0.12, box: [[480, 0.04, 0.12], [1050, 0.03, 0.08], [2300, 0.02, 0.05]] },
    celesta: { parts: () => [[1, 1, 2.4], [2, 0.12, 0.6], [3.98, 0.07, 0.3], [6.2, 0.02, 0.1]], scale: (f) => clamp(Math.pow(523 / f, 0.5), 0.4, 1.6), len: (f) => clamp(2.6 * Math.pow(523 / f, 0.4), 0.8, 3.2), att: 0.0025, click: 0.02 },
    glock: { parts: () => [[1, 1, 2.2], [2.756, 0.4, 0.6], [5.404, 0.18, 0.22], [8.933, 0.07, 0.09]], scale: (f) => clamp(Math.pow(1046 / f, 0.4), 0.5, 1.5), len: (f) => clamp(2.4 * Math.pow(1046 / f, 0.3), 1, 3), click: 0.06 },
    vibes: { parts: () => [[1, 1, 4.5], [4, 0.2, 1], [10, 0.05, 0.25]], scale: (f) => clamp(Math.pow(440 / f, 0.4), 0.5, 1.4), len: (f) => clamp(4 * Math.pow(440 / f, 0.3), 1.5, 5), att: 0.0015, click: 0.03 },
    xylo: { parts: () => [[1, 1, 0.7], [3, 0.4, 0.3], [6, 0.12, 0.1]], scale: (f) => clamp(Math.pow(880 / f, 0.5), 0.4, 1.6), len: () => 1, click: 0.08 },
    marimba: { parts: () => [[1, 1, 1.4], [4, 0.22, 0.35], [10, 0.04, 0.08]], scale: (f) => clamp(Math.pow(330 / f, 0.5), 0.4, 1.8), len: (f) => clamp(1.8 * Math.pow(330 / f, 0.4), 0.6, 2.4), att: 0.002, click: 0.03 },
    bell: { parts: () => [[0.5, 0.45, 6], [1, 1, 4.2], [1.19, 0.55, 3.2], [1.5, 0.35, 2.6], [2, 0.42, 2], [2.51, 0.18, 1.3], [2.66, 0.15, 1.2], [3.01, 0.1, 0.9], [4.1, 0.06, 0.5]], scale: (f) => clamp(Math.pow(440 / f, 0.4), 0.4, 1.5), len: (f) => clamp(5.5 * Math.pow(440 / f, 0.3), 2, 6.5), click: 0.04, jit: 0.004 },
    tubular: { parts: () => [[1, 1, 3.5], [2.0, 0.5, 2.5], [2.67, 0.35, 2], [3.42, 0.25, 1.5], [4.2, 0.15, 1], [5.3, 0.08, 0.6]], scale: (f) => clamp(Math.pow(523 / f, 0.4), 0.5, 1.4), len: () => 4.5, click: 0.05 },
    toy: { parts: () => [[1, 1, 0.9], [3.9, 0.3, 0.22], [9.8, 0.12, 0.06]], scale: (f) => clamp(Math.pow(880 / f, 0.5), 0.4, 1.5), len: () => 1.2, click: 0.1 },
    kalimba: { parts: () => [[1, 1, 1.6], [5.9, 0.12, 0.2], [14.8, 0.03, 0.05]], scale: (f) => clamp(Math.pow(440 / f, 0.5), 0.4, 1.6), len: () => 1.8, click: 0.06, box: [[300, 0.05, 0.3]] },
  };
  function renderMallet(n, layer, r, o) {
    const f0 = mtof(n), sec = Math.min(RMAX, o.len(f0)), N = Math.ceil(sec * SR) + 3, d = new Float32Array(N);
    modal(d, f0, o.parts(f0), { scale: o.scale(f0), att: o.att ?? 0.0006, jit: o.jit }, r);
    if (o.click) { const b = new Float32Array(Math.round(0.01 * SR)); burst(b, r, o.click, 0.0001, 0.003); filt(b, 'hp', 2000, 0.7); for (let i = 0; i < b.length; i++) d[i] += b[i]; }
    if (o.box) body(d, o.box, 1);
    scale(d, 0.26 / (rms(d, 0, Math.round(0.15 * SR)) || 1)); fadeEnd(d, Math.min(0.3, sec * 0.2));
    return { d, f0 };
  }
  // couches de vélocité (clé « s » douce, « h » forte)
  const INSTR = {};
  const reg = (name, o) => { INSTR[name] = { grid: 3, lo: 24, hi: 108, layers: null, rel: 0.12, vf: null, pan: 0, ...o, name }; };
  reg('piano', { render: (n, l, r) => renderPiano(n, l, r), lo: 21, hi: 108, rel: 0.1, vf: (v, n) => 600 + mtof(n) * 2 + 9000 * v * v, pan: 0.55, nodamp: 89 });
  reg('rhodes', { render: renderRhodes, lo: 28, hi: 100, layers: [0.62], rel: 0.09, vf: (v) => 1500 + 9000 * v, pan: 0.3 });
  for (const k in PLUCK) reg(k, { render: (n, l, r) => renderPluck(n, l, r, PLUCK[k]), lo: k === 'upright' || k.endsWith('bass') || k === 'slap' ? 24 : 36, hi: k === 'upright' || k.endsWith('bass') || k === 'slap' ? 72 : 96, rel: k === 'harpsi' ? 0.06 : k === 'harp' ? 0.6 : 0.07, vf: (v, n) => 400 + mtof(n) * 3 + 8000 * v * v, pan: k === 'harp' || k === 'harpsi' ? 0.4 : 0 });
  for (const k in WIND) reg(k, { render: (n, l, r) => WIND[k](mtof(n), r), lo: 28, hi: 100, rel: k === 'church' ? 0.25 : k.startsWith('choir') ? 0.35 : 0.14, sus: true, vf: (v, n) => mtof(n) * (2 + 10 * v * v) + 300 });
  for (const k in MALLET) reg(k, { render: (n, l, r) => renderMallet(n, l, r, MALLET[k]), lo: 36, hi: 108, rel: k === 'vibes' ? 0.25 : 0.4, vf: (v, n) => mtof(n) * 3 + 7000 * v, pan: 0.3, nodamp: k === 'vibes' ? 200 : 0 });
  INSTR.harpsi.vf = null; INSTR.church.vf = INSTR.calliope.vf = null;
  // orgue à roues phoniques : tirettes (16' 5⅓' 8' 4' 2⅔' 2' 1⅗' 1⅓' 1'), clic de touche ; table construite à f/2
  const DRAWBAR = [1, 3, 2, 4, 6, 8, 10, 12, 16];
  function renderTonewheel(n, reg8, r) {
    const f = mtof(n) / 2, amps = [];
    reg8.forEach((lv, i) => { if (lv > 0) amps[DRAWBAR[i]] = (amps[DRAWBAR[i]] || 0) + Math.pow(10, -3 * (8 - lv) / 20); });
    for (let k = 0; k <= 16; k++) amps[k] = (amps[k] || 0) * (k * f * 2 > SR * 0.46 ? 0 : 1);
    const o = ensemble(f, { harm: (k) => amps[k] || 0, P: 1, att: 0.003, loop: 0.5, phase: 'saw' }, r);
    const b = new Float32Array(Math.round(0.012 * SR)); burst(b, r, 0.12, 0.0002, 0.006); filt(b, 'bp', 3000, 0.6);
    for (let i = 0; i < b.length; i++) o.d[i] += b[i];
    scale(o.d, 0.3 / (rms(o.d, o.ls, o.le) || 1)); o.f0 *= 2; return o;
  }
  reg('organ', { render: (n, l, r) => renderTonewheel(n, [8, 8, 8, 0, 0, 0, 0, 0, 0], r), grid: 4, lo: 28, hi: 100, rel: 0.025, sus: true });
  reg('organ_full', { render: (n, l, r) => renderTonewheel(n, [8, 8, 8, 8, 6, 8, 0, 4, 6], r), grid: 4, lo: 28, hi: 100, rel: 0.025, sus: true });
  reg('organ_soft', { render: (n, l, r) => renderTonewheel(n, [0, 0, 8, 4, 0, 0, 0, 0, 0], r), grid: 4, lo: 28, hi: 100, rel: 0.03, sus: true });
  reg('combo', { render: (n, l, r) => renderTonewheel(n, [0, 0, 8, 8, 0, 6, 0, 0, 5], r), grid: 4, lo: 36, hi: 100, rel: 0.02, sus: true });
  // timbales (pitch) : modes de membrane chargée par l'air, léger glissando, battue feutrée
  reg('timpani', { lo: 36, hi: 64, rel: 1.5, render(n, l, r) {
    const f0 = mtof(n), N = Math.ceil(3.2 * SR), d = new Float32Array(N);
    for (const [ra, am, t] of [[1, 1, 2.6], [1.5, 0.5, 1.8], [1.98, 0.32, 1.3], [2.44, 0.18, 0.9], [2.97, 0.1, 0.6], [3.5, 0.05, 0.4]]) partial(d, f0 * ra, am, t, 0, 0, 0.002, r() * TAU);
    const b = new Float32Array(Math.round(0.15 * SR)); burst(b, r, 1.5, 0.001, 0.05); filt(b, 'lp', 300, 0.7); for (let i = 0; i < b.length; i++) d[i] += b[i];
    scale(d, 0.3 / (rms(d, 0, Math.round(0.2 * SR)) || 1)); fadeEnd(d, 0.4); return { d, f0 };
  } });

  // ═══════════════ batteries et percussions ═══════════════
  // Membranes (modes à hauteur glissante), timbre de caisse claire (bruit filtré), cymbales et charleston (dizaines
  // de partiels inharmoniques qui battent entre eux), baguette, prise de salle. Deux couches (s/h) et 3 variantes.
  // table de sinus (phase en cycles)
  const SIN_N = 4096, SINT = new Float32Array(SIN_N + 1);
  for (let i = 0; i <= SIN_N; i++) SINT[i] = Math.sin(TAU * i / SIN_N);
  const fsin = (ph) => { ph -= Math.floor(ph); const x = ph * SIN_N, i = x | 0; return SINT[i] + (SINT[i + 1] - SINT[i]) * (x - i); };
  function membrane(d, f0, f1, pd, t60, amp, modes, att = 0.0004) {
    const N = d.length, M = modes.length, ph = new Float64Array(M + 1), k0 = t60k(t60), km = modes.map((m) => t60k(t60 * m[2])), em = modes.map((m) => amp * m[1]), ra = modes.map((m) => m[0]), na = Math.max(1, att * SR), kp = Math.exp(-1 / (pd * SR));
    let e = amp, ed = f0 - f1;
    for (let i = 0; i < N; i++) {
      const f = (f1 + ed) / SR; ed *= kp; ph[0] += f; let y = fsin(ph[0]) * e; e *= k0;
      for (let m = 0; m < M; m++) { ph[m + 1] += f * ra[m]; y += fsin(ph[m + 1]) * em[m]; em[m] *= km[m]; }
      d[i] += i < na ? y * i / na : y;
      if ((i & 255) === 255 && e < amp * 1e-4 && (M === 0 || em[0] < amp * 1e-4)) break;
    }
  }
  function metal(d, r, o) {
    const n = o.n ?? 50, lo = Math.log(o.lo ?? 2500), hi = Math.log(o.hi ?? 13000), g = 1 / Math.sqrt(n);
    for (let i = 0; i < n; i++) { const f = Math.exp(lo + (hi - lo) * r()), t = o.t60 * (0.55 + 0.9 * r()) * Math.pow(4000 / f, o.tilt ?? 0.35); partial(d, f, (0.35 + 0.65 * r()) * g, t, 0, 0, o.att ?? 0.0002, r() * TAU, 0, g * 4e-4); }
    if (o.noise) { const b = new Float32Array(d.length); burst(b, r, o.noise, o.att ?? 0.0002, o.nt ?? o.t60 * 0.5); filt(b, 'hp', o.nhp ?? 5000, 0.7); filt(b, 'lp', 14500, 0.7); for (let i = 0; i < d.length; i++) d[i] += b[i]; }
  }
  function square6(d, r, mult, amp) { // « 808 » : six oscillateurs carrés inharmoniques
    const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => x * mult / SR), ph = fr.map(() => r());
    for (let i = 0; i < d.length; i++) { let s = 0; for (let k = 0; k < 6; k++) { ph[k] += fr[k]; if (ph[k] >= 1) ph[k] -= 1; s += ph[k] < 0.5 ? 1 : -1; } d[i] += s / 6 * amp; }
  }
  function addB(d, b, g = 1, i0 = 0) { for (let i = 0; i < b.length && i + i0 < d.length; i++) d[i + i0] += b[i] * g; }
  function noiseB(r, sec, amp, att, t60, filters) { const b = new Float32Array(Math.ceil(sec * SR)); burst(b, r, amp, att, t60); for (const [t, f, q, g] of filters || []) filt(b, t, f, q, g || 0); return b; }
  const DLEN = { kick: 0.8, kick808: 1.6, snare: 0.6, gsnare: 0.5, rim: 0.2, clap: 0.6, hat: 0.25, phat: 0.15, ohat: 1.1, ride: 2.6, rbell: 2, crash: 3, tom: 0.9, ltom: 1.1, htom: 0.8, shaker: 0.2, tamb: 0.5, sleigh: 0.7, brush: 0.45, sweep: 0.8, tri: 2.4, block: 0.2, cow: 0.5, syn: 0.7, bdrum: 2.2, cym: 3.5, conga: 0.5, bongo: 0.3, tick: 0.05, nkick: 0.25, nsnare: 0.3, nhat: 0.08, cabasa: 0.2, claves: 0.25 };
  const DRUM = {
    kick(d, r, p, h) {
      membrane(d, p.f0 * (h ? 1.05 : 0.97), p.f1, p.pd, p.t60, 1, [[1.6, p.m2 ?? 0.2, 0.25]]);
      addB(d, noiseB(r, 0.02, p.click * (h ? 1 : 0.6), 0.0002, 0.006, [['bp', p.cf ?? 3200, 0.8], ['lp', 9000, 0.7]]));
      if (p.drive) { const k = p.drive, nk = Math.tanh(k); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * k) / nk; }
    },
    kick808(d, r, p) { membrane(d, 130, p.f1 ?? 47, 0.035, p.t60 ?? 1.4, 1, []); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.4); addB(d, noiseB(r, 0.01, 0.15, 0.0001, 0.003, [['hp', 2000, 0.7]])); },
    snare(d, r, p, h) {
      membrane(d, p.f * 1.3, p.f, 0.012, p.t60 ?? 0.2, p.tone * (h ? 1 : 0.75), [[1.59, 0.55, 0.6], [2.14, 0.3, 0.5], [2.3, 0.28, 0.45]]);
      const w = noiseB(r, DLEN.snare, p.wires * (h ? 1 : 0.55), 0.0008, p.wt * (h ? 1 : 0.75), [['hp', p.whp ?? 1700, 0.7], ['pk', p.wpk ?? 4800, 1, 4], ['lp', h ? (p.wlp ?? 11000) : 7000, 0.7]]); addB(d, w);
      addB(d, noiseB(r, 0.01, (h ? 0.5 : 0.25) * (p.stick ?? 1), 0.0001, 0.003, [['bp', 3500, 1]]));
      if (h && p.rim) partial(d, 920 + r() * 60, p.rim, 0.07, 0, 0, 0.0002, 0);
    },
    gsnare(d, r, p, h) { DRUM.snare(d, r, p, h); room(d, 0.9, 0.8, 0.2); const g0 = Math.round(0.28 * SR); for (let i = g0; i < d.length; i++) d[i] *= Math.max(0, 1 - (i - g0) / (0.02 * SR)); },
    rim(d, r) { partial(d, 1650 + r() * 80, 0.6, 0.035); partial(d, 470 + r() * 30, 0.5, 0.07); addB(d, noiseB(r, 0.008, 1.2, 0.0001, 0.003, [['bp', 3000, 2]])); },
    clap(d, r, p) {
      if (p.live) { for (let k = 0; k < 4; k++) addB(d, noiseB(r, 0.06, 0.8 + 0.4 * r(), 0.0005, 0.03, [['bp', 1100 + r() * 900, 1.3], ['hp', 500, 0.7]]), 1, Math.round((k ? r() * 0.018 : 0) * SR)); room(d, 0.5, 0.7); return; }
      const b = noiseB(r, DLEN.clap, 1, 0, 0.5, []), e = new Float32Array(b.length);
      for (let i = 0; i < b.length; i++) { const t = i / SR; let x = 0; for (const o of [0, 0.0095, 0.019]) if (t >= o) x += Math.exp(-(t - o) / 0.0042); if (t >= 0.028) x += 0.85 * Math.exp(-(t - 0.028) / (p.tail ?? 0.11)); e[i] = b[i] * x; }
      filt(e, 'bp', 1150, 1.4); filt(e, 'hp', 600, 0.7); addB(d, e);
    },
    hat(d, r, p, h) { if (p.e808) { square6(d, r, p.m ?? 1.6, 1); filt(d, 'hp', 7000, 0.7); filt(d, 'bp', 10000, 1); for (let i = 0; i < d.length; i++) d[i] *= Math.exp(-i / SR / (p.t60 * 0.15)); } else metal(d, r, { n: 36, lo: p.lo ?? 3200, hi: p.hi ?? 14000, t60: p.t60 * (h ? 1.15 : 0.85), noise: 0.5, nhp: 6500, nt: p.t60 * 0.5 }); addB(d, noiseB(r, 0.006, 0.4, 0.0001, 0.002, [['hp', 4000, 0.7]])); },
    phat(d, r, p) { metal(d, r, { n: 24, lo: (p.lo ?? 3200) * 0.8, hi: 10000, t60: 0.05, noise: 0.4, nhp: 4000, nt: 0.03 }); addB(d, noiseB(r, 0.03, 0.25, 0.002, 0.02, [['bp', 900, 1.2]])); },
    ohat(d, r, p) { if (p.e808) { square6(d, r, p.m ?? 1.6, 1); filt(d, 'hp', 7000, 0.7); filt(d, 'bp', 10000, 1); for (let i = 0; i < d.length; i++) d[i] *= Math.exp(-i / SR / (p.ot ?? 0.25)); } else metal(d, r, { n: 50, lo: p.lo ?? 3000, hi: p.hi ?? 14000, t60: p.ot ?? 0.8, noise: 0.6, nhp: 5500 }); },
    ride(d, r, p) {
      for (const [ra, am, t] of [[1, 1, 3.4], [2.06, 0.55, 2.6], [2.94, 0.4, 2.1], [4.1, 0.25, 1.6]]) partial(d, (p.bell ?? 760) * ra, am * (p.bellAmt ?? 0.18), t, 0, 0, 0.0003, r() * TAU);
      metal(d, r, { n: 56, lo: 2200, hi: 12000, t60: p.t60 ?? 2.6, att: 0.0006, noise: 0.25, nhp: 4000, nt: 0.8, tilt: 0.25 });
      addB(d, noiseB(r, 0.006, 0.5, 0.0001, 0.002, [['bp', 5000, 1]]));
    },
    rbell(d, r, p) { DRUM.ride(d, r, { ...p, bellAmt: 0.9 }); },
    crash(d, r, p) { metal(d, r, { n: 64, lo: 1300, hi: 14000, t60: p.t60 ?? 2.4, att: 0.0005, noise: 1.2, nhp: 3500, nt: 1.1, tilt: 0.2 }); },
    cym(d, r, p) { DRUM.crash(d, r, { t60: 3.2 }); },
    tom(d, r, p) { membrane(d, p.f * 1.35, p.f, 0.045, p.t60 ?? 0.55, 1, [[1.59, 0.3, 0.5], [2.14, 0.15, 0.4]]); addB(d, noiseB(r, 0.01, 0.3, 0.0001, 0.003, [['bp', 3000, 1]])); },
    ltom(d, r, p) { DRUM.tom(d, r, { ...p, f: p.f * 0.72, t60: (p.t60 ?? 0.55) * 1.2 }); },
    htom(d, r, p) { DRUM.tom(d, r, { ...p, f: p.f * 1.35, t60: (p.t60 ?? 0.55) * 0.85 }); },
    shaker(d, r) { const b = new Float32Array(d.length); for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] = (r() * 2 - 1) * (t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / 0.05)); } filt(b, 'hp', 5000, 0.8); filt(b, 'pk', 8500, 1, 6); addB(d, b); },
    cabasa(d, r) { DRUM.shaker(d, r); },
    tamb(d, r) { for (let j = 0; j < 7; j++) { const o = Math.round((j ? r() * 0.03 : 0) * SR), a = j ? 0.4 + r() * 0.5 : 1; for (let k = 0; k < 3; k++) partial(d, 5000 + r() * 5500, a * 0.25, 0.12 + r() * 0.08, 0, 0, 0.0002, r() * TAU, o); } addB(d, noiseB(r, 0.2, 0.3, 0.001, 0.08, [['hp', 6000, 0.7]])); },
    sleigh(d, r) { for (let j = 0; j < 12; j++) { const o = Math.round((j ? r() * 0.16 : 0) * SR), a = j ? 0.35 + r() * 0.5 : 1; for (let k = 0; k < 3; k++) partial(d, 4200 + r() * 6300, a * 0.22, 0.15 + r() * 0.1, 0, 0, 0.0002, r() * TAU, o); } addB(d, noiseB(r, 0.4, 0.2, 0.01, 0.2, [['hp', 5500, 0.7]])); },
    brush(d, r, p, h) { addB(d, noiseB(r, DLEN.brush, 1, 0.012, h ? 0.16 : 0.12, [['bp', 3200, 0.5], ['lp', 7000, 0.7]])); membrane(d, 230, 200, 0.02, 0.08, 0.2, []); },
    sweep(d, r) { const b = new Float32Array(d.length); for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] = (r() * 2 - 1) * Math.sin(Math.PI * Math.min(1, t / 0.7)) * 0.5; } filt(b, 'bp', 2800, 0.6); filt(b, 'lp', 6000, 0.7); addB(d, b); },
    tri(d) { const fs = [2410, 3630, 5290, 6620, 7940, 9620], am = [1, 0.8, 0.65, 0.5, 0.35, 0.25]; for (let k = 0; k < 6; k++) partial(d, fs[k], am[k] * 0.3, 2.4 - k * 0.25, 0, 0, 0.0003); },
    block(d, r, p) { const f = p.f ?? 1100; partial(d, f, 1, 0.07, 0, 0, 0.0002); partial(d, f * 2.71, 0.4, 0.03, 0, 0, 0.0002); addB(d, noiseB(r, 0.005, 0.2, 0.0001, 0.002, [['bp', 2500, 1]])); },
    claves(d, r) { partial(d, 2500, 1, 0.12, 0, 0, 0.0002); partial(d, 2500 * 2.7, 0.15, 0.04); },
    cow(d, r) { const b = new Float32Array(d.length); let p1 = 0, p2 = 0; for (let i = 0; i < b.length; i++) { const t = i / SR; p1 += 562 / SR; p2 += 845 / SR; b[i] = ((p1 % 1 < 0.5 ? 1 : -1) + (p2 % 1 < 0.5 ? 1 : -1)) * (0.6 * Math.exp(-t / 0.012) + 0.5 * Math.exp(-t / 0.13)); } filt(b, 'bp', 2600, 1.1); addB(d, b); },
    syn(d) { let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / SR; ph += (165 + 650 * Math.exp(-t / 0.11)) / SR; d[i] += Math.sin(TAU * ph) * Math.exp(-t / 0.32); } },
    bdrum(d, r) { membrane(d, 75, 55, 0.08, 1.8, 1, [[1.5, 0.3, 0.5]], 0.004); addB(d, noiseB(r, 0.1, 0.4, 0.002, 0.05, [['lp', 300, 0.7]])); room(d, 0.4, 1.2); },
    conga(d, r, p) { membrane(d, (p.f ?? 300) * 1.08, p.f ?? 300, 0.01, 0.35, 1, [[1.5, 0.3, 0.4], [2, 0.12, 0.3]]); addB(d, noiseB(r, 0.01, 0.3, 0.0001, 0.004, [['bp', 2000, 1]])); },
    bongo(d, r, p) { DRUM.conga(d, r, { f: 480 }); },
    tick(d, r) { addB(d, noiseB(r, 0.05, 1, 0.0001, 0.006, [['bp', 3800, 1.5]])); partial(d, 1900, 0.4, 0.01); },
    nkick(d) { let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / SR; ph += (50 + 330 * Math.exp(-t / 0.025)) / SR; d[i] += (Math.round((4 * Math.abs((ph % 1) - 0.5) - 1) * 7.5) / 7.5) * (Math.ceil(15 * Math.exp(-t / 0.08)) / 15); } },
    nsnare(d) { let reg = 1, v = 0, acc = 0; for (let i = 0; i < d.length; i++) { acc += 11000 / SR; if (acc >= 1) { acc -= 1; const bit = (reg ^ (reg >> 1)) & 1; reg = (reg >> 1) | (bit << 14); v = reg & 1 ? 1 : -1; } d[i] += (v * Math.ceil(15 * Math.exp(-i / SR / 0.07))) / 15; } },
    nhat(d) { let reg = 1, v = 0, acc = 0; for (let i = 0; i < d.length; i++) { acc += 26000 / SR; if (acc >= 1) { acc -= 1; const bit = (reg ^ (reg >> 6)) & 1; reg = (reg >> 1) | (bit << 14); v = reg & 1 ? 1 : -1; } d[i] += (v * Math.ceil(15 * Math.exp(-i / SR / 0.02))) / 15; } },
  };
  // kits : réglages par type (le reste vient du mixage)
  const KIT0 = { kick: { f0: 130, f1: 52, pd: 0.035, t60: 0.45, click: 0.35, drive: 1.4, room: 0.15 }, snare: { f: 190, tone: 0.6, wires: 0.9, wt: 0.3, room: 0.2, rim: 0.15 }, hat: { t60: 0.09 }, ohat: { ot: 0.8 }, ride: {}, crash: {}, tom: { f: 120, room: 0.2 }, ltom: { f: 120, room: 0.2 }, htom: { f: 120, room: 0.2 }, clap: {}, conga: {}, block: {} };
  const KITS = {
    std: {},
    rock: { kick: { f0: 145, f1: 52, pd: 0.032, t60: 0.5, click: 0.5, drive: 2, room: 0.28 }, snare: { f: 182, tone: 0.65, wires: 1, wt: 0.34, room: 0.35, rim: 0.25 }, hat: { t60: 0.1 }, tom: { f: 105, t60: 0.65, room: 0.3 }, ltom: { f: 105, t60: 0.65, room: 0.3 }, htom: { f: 105, t60: 0.65, room: 0.3 } },
    metal: { kick: { f0: 170, f1: 58, pd: 0.018, t60: 0.28, click: 0.9, cf: 4500, drive: 2.4, room: 0.1 }, snare: { f: 205, tone: 0.55, wires: 1, wt: 0.26, room: 0.3, rim: 0.3 }, tom: { f: 110, t60: 0.5, room: 0.2 }, ltom: { f: 110, room: 0.2 }, htom: { f: 110, room: 0.2 } },
    funk: { kick: { f0: 140, f1: 56, pd: 0.03, t60: 0.32, click: 0.4, drive: 1.6, room: 0.1 }, snare: { f: 235, tone: 0.55, wires: 0.85, wt: 0.22, room: 0.15, rim: 0.2 }, hat: { t60: 0.07 } },
    disco: { kick: { f0: 135, f1: 50, pd: 0.03, t60: 0.38, click: 0.45, drive: 1.8, room: 0.1 }, snare: { f: 200, tone: 0.55, wires: 0.9, wt: 0.25, room: 0.2 }, ohat: { ot: 0.35 } },
    jazz: { kick: { f0: 105, f1: 64, pd: 0.03, t60: 0.3, click: 0.12, drive: 1.1, room: 0.2 }, snare: { f: 240, tone: 0.45, wires: 0.6, wt: 0.22, room: 0.25 }, hat: { t60: 0.08, lo: 2500, hi: 11000 }, ride: { t60: 3, bell: 640, bellAmt: 0.14 }, tom: { f: 140, room: 0.25 } },
    lofi: { kick: { f0: 110, f1: 47, pd: 0.035, t60: 0.38, click: 0.12, drive: 1.8, room: 0.1 }, snare: { f: 195, tone: 0.5, wires: 0.65, wt: 0.2, wlp: 6500, room: 0.25 }, hat: { t60: 0.06, hi: 9000 }, ohat: { ot: 0.4, hi: 9000 }, lofi: true },
    soft: { kick: { f0: 100, f1: 52, pd: 0.03, t60: 0.3, click: 0.08, drive: 1.1, room: 0.15 }, snare: { f: 220, tone: 0.5, wires: 0.45, wt: 0.18, room: 0.2 } },
    e808: { kick: { f0: 140, f1: 46, pd: 0.06, t60: 0.7, click: 0.15, drive: 1.6 }, snare: { f: 200, tone: 0.5, wires: 0.8, wt: 0.2, room: 0.4 }, hat: { e808: true, t60: 0.3 }, ohat: { e808: true, ot: 0.3 }, tom: { f: 140, t60: 0.4, room: 0.1 }, clap: {} },
    orch: { tom: { f: 70, t60: 1 } },
  };
  function renderDrum(kit, type, layer, r) {
    const K = KITS[kit] || {}, p = { ...(KIT0[type] || {}), ...(K[type] || {}) }, d = new Float32Array(Math.ceil(Math.min(RMAX, DLEN[type] || 0.5) * SR) + 3);
    (DRUM[type] || DRUM.rim)(d, r, p, layer === 'h');
    if (p.room) room(d, p.room, type === 'kick' ? 0.6 : 0.8);
    if (K.lofi) { filt(d, 'lp', 7000, 0.7); for (let i = 0; i < d.length; i++) d[i] = Math.round(Math.tanh(d[i] * 1.5) * 2048) / 2048; }
    const pk = peak(d) || 1; scale(d, 0.9 / pk); fadeEnd(d, Math.min(0.04, d.length / SR * 0.2)); hp1(d, 25);
    return { d, f0: 0 };
  }
  // niveaux relatifs des frappes (avant mixage)
  const DGAIN = { kick: 0.95, kick808: 0.9, snare: 0.75, gsnare: 0.7, rim: 0.45, clap: 0.6, hat: 0.32, phat: 0.28, ohat: 0.3, ride: 0.3, rbell: 0.3, crash: 0.4, cym: 0.4, tom: 0.62, ltom: 0.65, htom: 0.6, shaker: 0.25, cabasa: 0.22, tamb: 0.3, sleigh: 0.3, brush: 0.4, sweep: 0.3, tri: 0.28, block: 0.4, claves: 0.35, cow: 0.35, syn: 0.5, bdrum: 0.9, conga: 0.5, bongo: 0.45, tick: 0.35, nkick: 0.6, nsnare: 0.45, nhat: 0.25 };

  // ═══════════════ magasin d'échantillons : rendu à la demande par échéance, cache LRU ═══════════════
  // clés : « inst:note[:couche] » ou « dr:kit:type:couche+variante »
  const STORE = new Map(), WANT = new Map(); let memBytes = 0, renderMs = 0, renderN = 0;
  const baseOf = (I, n) => clamp(Math.round((n - I.lo) / I.grid) * I.grid + I.lo, I.lo, I.hi);
  const layerOf = (I, v) => (I.layers ? (v >= I.layers[0] ? 'h' : 's') : '');
  const keyOf = (inst, base, layer) => inst + ':' + base + (layer ? ':' + layer : '');
  const QUICK = 1.2;
  function renderKey(key, quick = false) {
    const p = key.split(':'), r = mulberry32(hashStr(key)), t0 = perf();
    let o;
    RMAX = quick ? QUICK : Infinity;
    try {
      if (p[0] === 'dr') o = renderDrum(p[1], p[2], p[3][0], r);
      else { const I = INSTR[p[0]]; if (!I) return null; o = I.render(+p[1], p[2] || '', r); }
    } finally { RMAX = Infinity; }
    const d = o.d, loop = o.le > 0;
    if (quick && !loop) fadeEndSr(d, 0.25, o.sr || SR); // prise abrégée : extinction douce
    for (let i = 0; i < d.length; i++) if (d[i] !== d[i]) d[i] = 0; // aucune valeur NaN ne doit entrer dans le mixage
    const end = loop ? o.le : d.length - 2;
    if (loop && o.le + 1 < d.length) { d[o.le] = d[o.ls]; d[o.le + 1] = d[o.ls + 1]; }
    const env = new Float32Array(Math.ceil(d.length / 1024) + 1);
    for (let i = 0; i < d.length; i++) { const a = d[i] < 0 ? -d[i] : d[i], j = i >> 10; if (a > env[j]) env[j] = a; }
    if (loop) scale(d, 0.25 / (rms(d, o.ls, o.le) || 1)); // tenus : même niveau efficace pour toutes les prises
    const s = { key, d, f0: o.f0 || 0, sr: o.sr || SR, ls: o.ls || 0, le: end, loop, env, bytes: d.byteLength + env.byteLength, t: perf(), refs: 0, quick };
    renderMs += perf() - t0; renderN++;
    return s;
  }
  function putSample(s) {
    const old = STORE.get(s.key); if (old) memBytes -= old.bytes;
    STORE.set(s.key, s); memBytes += s.bytes;
    if (memBytes > MEM_MAX) { // éviction des moins récemment utilisés qui ne jouent pas
      const list = [...STORE.values()].filter((x) => x.refs <= 0 && x !== s).sort((a, b) => a.t - b.t);
      for (const x of list) { if (memBytes <= MEM_MAX * 0.85) break; STORE.delete(x.key); memBytes -= x.bytes; }
    }
  }
  function want(key, due) { const w = WANT.get(key); if (w === undefined || due < w) WANT.set(key, due); }
  const UPGRADE = new Set(); // prises abrégées qui ont servi : à recalculer en entier quand le moteur est libre
  function renderNext(idle = true) { // l'échantillon le plus urgent
    let best = null, bd = Infinity;
    for (const [k, due] of WANT) if (due < bd) { bd = due; best = k; }
    if (best === null) {
      if (!idle || SLICE < 5) return false; // fil principal (repli sans worker) : on garde les prises abrégées
      for (const k of UPGRADE) {
        UPGRADE.delete(k); const o = STORE.get(k); if (!o || !o.quick) continue;
        try { const s2 = renderKey(k); if (s2) { s2.t = o.t; putSample(s2); } } catch (e) { log('render:' + k, 'rendu impossible', k, e); }
        return true;
      }
      return false;
    }
    WANT.delete(best);
    // attendu dans moins de 150 ms (début de morceau, note imprévue) ou un morceau presque à court d'avance : prise
    // abrégée tout de suite (coût borné), complète plus tard
    let low = false; for (const s of SONGS.values()) if (s.made > 0 && s.made * CHUNK - s.play < 0.35 * SR) low = true;
    if (!STORE.has(best)) { try { const s = renderKey(best, bd - perf() < 150 || low || SLICE < 5); if (s) putSample(s); } catch (e) { log('render:' + best, 'rendu impossible', best, e); } }
    return true;
  }
  // une prise de remplacement existe-t-elle (note voisine, autre couche, autre variante de frappe) ?
  function hasNear(key) {
    const p = key.split(':');
    if (p[0] === 'dr') { for (const l of ['s', 'h']) for (let k = 0; k < 3; k++) if (STORE.has('dr:' + p[1] + ':' + p[2] + ':' + l + k)) return true; return false; }
    const I = INSTR[p[0]]; if (!I) return false; const b0 = +p[1];
    for (let j = 0; j <= 3; j++) for (const sg of [1, -1]) { const b = b0 + sg * j * I.grid; if (b < I.lo || b > I.hi) continue; if (STORE.has(keyOf(p[0], b, p[2])) || (I.layers && STORE.has(keyOf(p[0], b, p[2] === 'h' ? 's' : 'h')))) return true; }
    return false;
  }
  function getSample(key) { const s = STORE.get(key); if (s) s.t = perf(); return s || null; }
  // échantillon d'une note : prise exacte, sinon la plus proche déjà prête (transposition plus forte) ; null si aucune
  function sampleFor(inst, n, v) {
    const I = INSTR[inst]; if (!I) return null;
    const base = baseOf(I, n), layer = layerOf(I, v), k = keyOf(inst, base, layer);
    let s = getSample(k); if (s) return s;
    want(k, perf());
    for (let j = 1; j <= 3; j++) for (const sg of [1, -1]) { const b = base + sg * j * I.grid; if (b < I.lo || b > I.hi) continue; s = getSample(keyOf(inst, b, layer)) || (I.layers ? getSample(keyOf(inst, b, layer === 'h' ? 's' : 'h')) : null); if (s) return s; }
    return null;
  }
  function drumKey(kit, type, v, rr) { const two = type === 'snare' || type === 'kick' || type === 'brush' || type === 'gsnare' || type === 'hat'; return 'dr:' + kit + ':' + type + ':' + (two && v >= 0.62 ? 'h' : 's') + (rr % 3); }

  // ═══════════════ voix ═══════════════
  // kind : 0 échantillon, 1 synthé analogique (polyBLEP + filtre d'état), 2 puce 8 bits, 3 voix formantique
  class Voice {
    constructor() { this.reset(); }
    reset() {
      this.on = false; this.kind = 0; this.s = null; this.d = null; this.pos = 0; this.inc = 1; this.ls = 0; this.le = 0; this.ll = 0; this.loop = false; this.env = null;
      this.tr = null; this.amp = 0; this.gl = 1; this.gr = 1; this.lvl = 0; this.stage = 0; this.atk = 0; this.decB = 1; this.sus = 1; this.relB = 0.9; this.relAt = -1; this.hold = false;
      this.ft = 0; this.fc0 = 0; this.fc1 = 0; this.fcT = 1; this.fq = 0.707; this.z1 = 0; this.z2 = 0; this.fa = 0; this.fg = 0;
      this.vd = 0; this.vr = 0; this.vph = 0; this.vdel = 0; this.vfade = 1; this.pe = 0; this.peT = 1; this.glF = 1; this.glT = 0; this.slR = 1; this.slAt = -1; this.slT = 1;
      this.td = 0; this.tr2 = 0; this.tph = 0; this.age = 0; this.id = 0; this.choke = 0; this.pri = 1; this.cr = 1; this.sus2 = 0;
      this.osc = 0; this.ph1 = 0; this.ph2 = 0; this.ph3 = 0; this.det = 1; this.pw = 0.5; this.mix2 = 0; this.sub = 0; this.nz = 0; this.freq = 0; this.steps = 0; this.arp = null; this.arpT = 0;
      this.fm = null; this.fm2 = null; this.br = 0.7; this.nk = null;
    }
  }
  const POOL = []; const newVoice = () => POOL.pop() || new Voice();
  function freeVoice(v) { if (v.s) v.s.refs--; v.reset(); if (POOL.length < 256) POOL.push(v); }
  const blep = (t, dt) => (t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0);
  // facteur de hauteur d'une voix à l'âge a (images) : vibrato différé, attaque « par en dessous », portamento, glissé final
  function pitchAt(v, a) {
    let f = v.cr;
    if (v.vd && a > v.vdel) { const u = a - v.vdel; f *= 1 + v.vd * Math.min(1, u / v.vfade) * Math.sin(v.vph + v.vr * u); }
    if (v.pe) f *= Math.pow(2, v.pe * Math.exp(-a / v.peT) / 1200);
    if (v.glT && a < v.glT) f *= Math.pow(v.glF, 1 - a / v.glT);
    if (v.slAt >= 0 && a > v.slAt) f *= Math.pow(v.slR, Math.min(1, (a - v.slAt) / v.slT));
    return f;
  }
  const tremAt = (v, a) => (v.td ? 1 - v.td * (0.5 + 0.5 * Math.sin(v.tph + v.tr2 * a)) : 1);
  // enveloppe : attaque linéaire (atk images), décroissance exponentielle vers sus, relâchement exponentiel
  function envStep(v, n) {
    if (v.relAt >= 0 && v.stage < 2) { v.relAt -= n; if (v.relAt < 0 && !v.hold) v.stage = 2; }
    if (v.stage === 0) { v.lvl += v.atk > 0 ? n / v.atk : 1; if (v.lvl >= 1) { v.lvl = 1; v.stage = 1; } }
    else if (v.stage === 1) { if (v.sus < 1) v.lvl = v.sus + (v.lvl - v.sus) * (n === BLK ? v.decB : Math.pow(v.decB, n / BLK)); }
    else if (v.stage === 2) { v.lvl *= n === BLK ? v.relB : Math.pow(v.relB, n / BLK); if (v.lvl < 1e-4) v.stage = 3; }
  }
  function cutAt(v, a) { return v.fc1 + (v.fc0 - v.fc1) * Math.exp(-a / v.fcT); }
  function setFilt(v, a) {
    const fc = clamp(cutAt(v, a), 20, SR * 0.45);
    if (v.ft === 1) v.fa = 1 - Math.exp(-TAU * fc / SR);
    else { v.fg = Math.tan(Math.PI * fc / SR); }
  }
  // une voix sur un bloc [n0, BLK[ → L (et R si stéréo)
  function runVoice(v, L, R, n0, pm) {
    const n = BLK - n0, a0 = v.age, a1 = a0 + n;
    const pa = pm * pitchAt(v, a0), pb = pm * pitchAt(v, a1);
    const l0 = v.lvl; envStep(v, n);
    let g = v.amp * l0 * tremAt(v, a0); const gEnd = v.amp * v.lvl * tremAt(v, a1), dg = (gEnd - g) / n;
    const gl = v.gl, gr = v.gr;
    if (v.ft) setFilt(v, a0);
    if (v.kind === 0) {
      const d = v.d, le = v.le, ll = v.ll, loop = v.loop; let pos = v.pos, inc = v.inc * pa; const dinc = (v.inc * pb - inc) / n;
      if (v.ft === 0) {
        for (let i = n0; i < BLK; i++) {
          const ip = pos | 0, s0 = d[ip], x = (s0 + (d[ip + 1] - s0) * (pos - ip)) * g;
          L[i] += x * gl; if (R !== null) R[i] += x * gr;
          pos += inc; inc += dinc; g += dg;
          if (pos >= le) { if (loop) pos -= ll; else { v.stage = 3; break; } }
        }
      } else if (v.ft === 1) {
        const fa = v.fa; let z = v.z1;
        for (let i = n0; i < BLK; i++) {
          const ip = pos | 0, s0 = d[ip]; z += fa * (s0 + (d[ip + 1] - s0) * (pos - ip) - z); const x = z * g;
          L[i] += x * gl; if (R !== null) R[i] += x * gr;
          pos += inc; inc += dinc; g += dg;
          if (pos >= le) { if (loop) pos -= ll; else { v.stage = 3; break; } }
        }
        v.z1 = dn(z);
      } else {
        const fg = v.fg, k = 1 / v.fq, a1c = 1 / (1 + fg * (fg + k)), a2c = fg * a1c, a3c = fg * a2c, bp = v.ft === 3; let ic1 = v.z1, ic2 = v.z2;
        for (let i = n0; i < BLK; i++) {
          const ip = pos | 0, s0 = d[ip], xin = s0 + (d[ip + 1] - s0) * (pos - ip);
          const v3 = xin - ic2, v1 = a1c * ic1 + a2c * v3, v2 = ic2 + a2c * ic1 + a3c * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
          const x = (bp ? v1 : v2) * g; L[i] += x * gl; if (R !== null) R[i] += x * gr;
          pos += inc; inc += dinc; g += dg;
          if (pos >= le) { if (loop) pos -= ll; else { v.stage = 3; break; } }
        }
        v.z1 = dn(ic1); v.z2 = dn(ic2);
      }
      v.pos = pos;
      // fin naturelle : l'échantillon est devenu inaudible
      if (!loop && v.stage < 3) { const e = v.env[(pos | 0) >> 10]; if (e !== undefined && e * v.amp * v.lvl < 2e-5 && a1 > 2048) v.stage = 3; }
    } else if (v.kind === 1 || v.kind === 2) runSynth(v, L, R, n0, n, pa, pb, g, dg);
    else runFormant(v, L, R, n0, n, pa, pb, g, dg);
    v.age = a1;
  }
  // synthé analogique (kind 1) : osc1 (0 scie, 1 carré, 2 impulsion, 3 triangle, 4 sinus), osc2 désaccordé, sous-octave,
  // bruit → filtre d'état passe-bas (enveloppe) ; puce (kind 2) : impulsion / triangle 4 bits, volume par paliers
  let NZ = 22222;
  const nzv = () => { NZ ^= NZ << 13; NZ ^= NZ >>> 17; NZ ^= NZ << 5; return (NZ >>> 0) / 2147483648 - 1; };
  function runSynth(v, L, R, n0, n, pa, pb, g, dg) {
    const chip = v.kind === 2, gl = v.gl, gr = v.gr, osc = v.osc, pw = v.pw, mix2 = v.mix2, sub = v.sub, nz = v.nz, det = v.det;
    let f = v.freq * pa / SR; const df = (v.freq * pb / SR - f) / n;
    if (chip && v.arp) { const st = Math.floor(v.age / v.arpT) % v.arp.length; f *= Math.pow(2, v.arp[st] / 12); }
    let p1 = v.ph1, p2 = v.ph2, p3 = v.ph3;
    const flt = v.ft > 0, fg = v.fg, k = 1 / v.fq, a1c = 1 / (1 + fg * (fg + k)), a2c = fg * a1c, a3c = fg * a2c; let ic1 = v.z1, ic2 = v.z2;
    if (chip) { const q = 15; g = Math.round(g * q / (v.amp || 1)) / q * (v.amp || 1); dg = 0; } // volume par paliers de 1/15
    for (let i = n0; i < BLK; i++) {
      p1 += f; if (p1 >= 1) p1 -= 1;
      let x;
      if (osc === 0) x = 2 * p1 - 1 - blep(p1, f);
      else if (osc === 1 || osc === 2) { const w = osc === 1 ? 0.5 : pw; x = (p1 < w ? 1 : -1) + blep(p1, f) - blep(p1 >= w ? p1 - w : p1 - w + 1, f); }
      else if (osc === 3) x = chip ? Math.round((4 * Math.abs(p1 - 0.5) - 1) * 7.5) / 7.5 : 4 * Math.abs(p1 - 0.5) - 1;
      else x = Math.sin(TAU * p1);
      if (mix2) { const f2 = f * det; p2 += f2; if (p2 >= 1) p2 -= 1; x += mix2 * (osc === 1 || osc === 2 ? ((p2 < pw ? 1 : -1) + blep(p2, f2) - blep(p2 >= pw ? p2 - pw : p2 - pw + 1, f2)) : 2 * p2 - 1 - blep(p2, f2)); }
      if (sub) { p3 += f * 0.5; if (p3 >= 1) p3 -= 1; x += sub * ((p3 < 0.5 ? 1 : -1) + blep(p3, f * 0.5) - blep(p3 >= 0.5 ? p3 - 0.5 : p3 + 0.5, f * 0.5)); }
      if (nz) x += nz * nzv();
      if (flt) { const v3 = x - ic2, v1 = a1c * ic1 + a2c * v3, v2 = ic2 + a2c * ic1 + a3c * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; x = v.ft === 3 ? v1 : v2; }
      x *= g; g += dg; f += df;
      L[i] += x * gl; if (R !== null) R[i] += x * gr;
    }
    v.ph1 = p1; v.ph2 = p2; v.ph3 = p3; v.z1 = dn(ic1); v.z2 = dn(ic2);
  }
  // voix formantique (fantôme de la radio) : glotte (scie) + souffle → 3 formants qui glissent d'une voyelle à l'autre
  const VOWEL = { a: [730, 1090, 2440], o: [570, 840, 2410], u: [300, 870, 2240], e: [530, 1840, 2480], i: [270, 2290, 3010] };
  function runFormant(v, L, R, n0, n, pa, pb, g, dg) {
    const F = v.fm, u = clamp(v.age / (v.slT || 1), 0, 1), gl = v.gl, gr = v.gr;
    if (!v.fs) v.fs = new Float64Array(6);
    const fs = v.fs, fq = [9, 11, 12], fw = [1.2, 0.7, 0.3], co = [];
    for (let k = 0; k < 3; k++) { const fc = F[0][k] + (F[1][k] - F[0][k]) * u, gg = Math.tan(Math.PI * fc / SR), kk = 1 / fq[k], a1c = 1 / (1 + gg * (gg + kk)); co.push(a1c, gg * a1c, gg * gg * a1c); }
    let f = v.freq * pa / SR; const df = (v.freq * pb / SR - f) / n, br = v.br; let p1 = v.ph1;
    for (let i = n0; i < BLK; i++) {
      p1 += f; if (p1 >= 1) p1 -= 1;
      const src = (2 * p1 - 1 - blep(p1, f)) * (1 - br) + nzv() * br * 1.5; let y = 0;
      for (let k = 0; k < 3; k++) { const a1c = co[k * 3], a2c = co[k * 3 + 1], a3c = co[k * 3 + 2], ic1 = fs[k * 2], ic2 = fs[k * 2 + 1], v3 = src - ic2, v1 = a1c * ic1 + a2c * v3, v2 = ic2 + a2c * ic1 + a3c * v3; fs[k * 2] = 2 * v1 - ic1; fs[k * 2 + 1] = 2 * v2 - ic2; y += v1 * fw[k]; }
      const x = y * g; g += dg; f += df; L[i] += x * gl; if (R !== null) R[i] += x * gr;
    }
    v.ph1 = p1; for (let k = 0; k < 6; k++) fs[k] = dn(fs[k]);
  }

  // ═══════════════ effets temps réel ═══════════════
  // LFO par rotation (sinus/cosinus récursifs, renormalisés à chaque bloc) et tanh rationnelle rapide
  const rot = (hz, ph = 0) => ({ c: Math.cos(ph), s: Math.sin(ph), cw: Math.cos(TAU * hz / SR), sw: Math.sin(TAU * hz / SR) });
  const renorm = (l) => { const k = 1 / Math.sqrt(l.c * l.c + l.s * l.s); l.c *= k; l.s *= k; };
  const ftanh = (x) => (x < -3 ? -1 : x > 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x));
  const dn = (x) => (x < 1e-18 && x > -1e-18 ? 0 : x); // évite les nombres dénormaux dans les états récursifs
  class BQ { // biquad (forme directe I), états par canal
    constructor(type, f, q = 0.707, g = 0) { this.z = new Float64Array(8); this.set(type, f, q, g); }
    set(type, f, q = 0.707, g = 0) { const c = bqc(type, f, q, g); this.b0 = c[0]; this.b1 = c[1]; this.b2 = c[2]; this.a1 = c[3]; this.a2 = c[4]; }
    run(x, n, ch = 0) {
      const z = this.z, o = ch * 4, b0 = this.b0, b1 = this.b1, b2 = this.b2, a1 = this.a1, a2 = this.a2; let x1 = z[o], x2 = z[o + 1], y1 = z[o + 2], y2 = z[o + 3];
      for (let i = 0; i < n; i++) { const xi = x[i], y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = y; x[i] = y; }
      z[o] = dn(x1); z[o + 1] = dn(x2); z[o + 2] = dn(y1); z[o + 3] = dn(y2);
    }
    process(L, R, n) { this.run(L, n, 0); if (R) this.run(R, n, 1); }
  }
  // filtre à un pôle (6 dB/octave) : passe-bas « lp1 » / passe-haut « hp1 », bien moins coûteux qu'un biquad
  class OP {
    constructor(type, f) { this.hp = type === 'hp1'; this.a = 1 - Math.exp(-TAU * f / SR); this.zl = 0; this.zr = 0; }
    run(x, n, ch = 0) { const a = this.a; let z = ch ? this.zr : this.zl; if (this.hp) for (let i = 0; i < n; i++) { z += a * (x[i] - z); x[i] -= z; } else for (let i = 0; i < n; i++) { z += a * (x[i] - z); x[i] = z; } if (ch) this.zr = dn(z); else this.zl = dn(z); }
    process(L, R, n) {
      const a = this.a, hp = this.hp; let z = this.zl;
      if (hp) for (let i = 0; i < n; i++) { z += a * (L[i] - z); L[i] -= z; } else for (let i = 0; i < n; i++) { z += a * (L[i] - z); L[i] = z; }
      this.zl = dn(z); if (!R) return; z = this.zr;
      if (hp) for (let i = 0; i < n; i++) { z += a * (R[i] - z); R[i] -= z; } else for (let i = 0; i < n; i++) { z += a * (R[i] - z); R[i] = z; }
      this.zr = dn(z);
    }
  }
  const mkEq = (e) => (e[0] === 'lp1' || e[0] === 'hp1' ? new OP(e[0], e[1]) : new BQ(e[0], e[1], e[2] ?? 0.707, e[3] ?? 0));
  // compresseur (détection crête, genou doux, gain recalculé tous les 16 échantillons et interpolé)
  class Comp {
    constructor(o) { this.thr = o.thr ?? -18; this.ratio = o.ratio ?? 3; this.knee = o.knee ?? 6; this.mk = dB(o.makeup ?? 0); this.aA = 1 - Math.exp(-1 / ((o.att ?? 0.01) * SR)); this.aR = 1 - Math.exp(-1 / ((o.rel ?? 0.15) * SR)); this.env = 0; this.g = 1; this.gr = 0; }
    gain(env) {
      const x = 20 * Math.log10(env + 1e-9), o = x - this.thr, k = this.knee; let red;
      if (o <= -k / 2) red = 0; else if (o >= k / 2) red = o * (1 - 1 / this.ratio); else { const u = o + k / 2; red = (1 - 1 / this.ratio) * u * u / (2 * k); }
      this.gr = red; return Math.pow(10, -red / 20);
    }
    process(L, R, n) {
      let env = this.env, g = this.g; const aA = this.aA, aR = this.aR, mk = this.mk;
      for (let i0 = 0; i0 < n; i0 += 32) { // gain recalculé toutes les 32 images (1 ms), interpolé entre-temps
        const i1 = Math.min(n, i0 + 32);
        for (let i = i0; i < i1; i++) { const a = Math.max(L[i] < 0 ? -L[i] : L[i], R ? (R[i] < 0 ? -R[i] : R[i]) : 0); env += (a - env) * (a > env ? aA : aR); }
        const gt = this.gain(env) * mk, dg = (gt - g) / (i1 - i0);
        for (let i = i0; i < i1; i++) { g += dg; L[i] *= g; if (R) R[i] *= g; }
      }
      this.env = dn(env); this.g = g;
    }
  }
  // limiteur à anticipation (1,5 ms) + écrêtage doux de sécurité au-dessus du plafond
  class Limiter {
    constructor(ceil = 0.89) { this.c = ceil; this.la = 48; this.bl = new Float32Array(64); this.br = new Float32Array(64); this.w = 0; this.g = 1; this.gm = 1; this.hc = 0; this.rel = 1 - Math.exp(-1 / (0.12 * SR)); this.att = 1 - Math.exp(-1 / 10); }
    process(L, R, n) {
      const c = this.c, la = this.la, bl = this.bl, br = this.br; let w = this.w, g = this.g, gm = this.gm, hc = this.hc; const rel = this.rel, att = this.att;
      for (let i = 0; i < n; i++) {
        const l = L[i], r = R ? R[i] : 0, a = Math.max(l < 0 ? -l : l, r < 0 ? -r : r), gt = a > c ? c / a : 1;
        if (gt <= gm) { gm = gt; hc = la; } else if (hc > 0) hc--; else gm = Math.min(gt, gm + (1 - gm) * rel);
        g += (gm - g) * (gm < g ? att : rel);
        const rd = (w - la + 64) & 63; let yl = bl[rd] * g, yr = br[rd] * g; bl[w] = l; br[w] = r; w = (w + 1) & 63;
        if (yl > 0.95 || yl < -0.95) yl = Math.sign(yl) * (0.95 + 0.05 * Math.tanh((Math.abs(yl) - 0.95) / 0.05));
        L[i] = yl; if (R) { if (yr > 0.95 || yr < -0.95) yr = Math.sign(yr) * (0.95 + 0.05 * Math.tanh((Math.abs(yr) - 0.95) / 0.05)); R[i] = yr; }
      }
      this.w = w; this.g = g; this.gm = gm; this.hc = hc;
    }
  }
  // plaque de Dattorro (1997) : diffusion d'entrée, réservoir à deux boucles (passe-tout modulés), prises de sortie
  // (boucle déroulée : aucun modulo, LFO par rotation, prises lues par pointeurs qui avancent avec l'écriture)
  class Plate {
    constructor(o = EMPTY) {
      this.half = o.half ?? true; const fs = this.half ? SR / 2 : SR; // le réservoir tourne à 16 kHz : queue < 8 kHz, deux fois moins de calcul
      const k = fs / 29761 * (o.size ?? 1), D = (x) => Math.max(2, Math.round(x * k)), T = (x) => Math.round(x * k);
      this.pre = new Float32Array(Math.max(1, Math.round((o.pre ?? 0.012) * fs)) + 1); this.pw = 0;
      this.q0 = new Float32Array(D(142)); this.q1 = new Float32Array(D(107)); this.q2 = new Float32Array(D(379)); this.q3 = new Float32Array(D(277)); this.j = new Int32Array(4);
      this.m1L = D(672); this.m2L = D(908); this.m1 = new Float32Array(this.m1L + 64); this.m2 = new Float32Array(this.m2L + 64); this.mi1 = 0; this.mi2 = 0;
      this.d1 = new Float32Array(D(4453)); this.d2 = new Float32Array(D(3720)); this.d3 = new Float32Array(D(4217)); this.d4 = new Float32Array(D(3163));
      this.a2 = new Float32Array(D(1800)); this.a4 = new Float32Array(D(2656)); this.ix = new Int32Array(6);
      this.tL = [T(266), T(2974), T(1913), T(1996), T(1990), T(187), T(1066)]; this.tR = [T(353), T(3627), T(1228), T(2673), T(2111), T(335), T(121)];
      this.lp1 = 0; this.lp2 = 0; this.bw = 0; this.ex = 16 * k * (o.mod ?? 1); const w = TAU * 0.6 / fs; this.lc = 1; this.ls = 0; this.lcw = Math.cos(w); this.lsw = Math.sin(w); this.pl = 0; this.pr = 0;
      this.setDecay(o.decay ?? 0.6); this.damp = o.damp ?? 0.35; this.bwc = o.bw ?? 0.75;
    }
    setDecay(dc) { this.decay = clamp(dc, 0, 0.97); }
    process(inp, oL, oR, n) {
      const pre = this.pre, PL = pre.length, q0 = this.q0, q1 = this.q1, q2 = this.q2, q3 = this.q3, Q0 = q0.length, Q1 = q1.length, Q2 = q2.length, Q3 = q3.length, J = this.j;
      const d1 = this.d1, d2 = this.d2, d3 = this.d3, d4 = this.d4, a2 = this.a2, a4 = this.a4, m1 = this.m1, m2 = this.m2, X = this.ix;
      const L1 = d1.length, L2 = d2.length, L3 = d3.length, L4 = d4.length, A2 = a2.length, A4 = a4.length, M1 = m1.length, M2 = m2.length, m1L = this.m1L, m2L = this.m2L;
      const dec = this.decay, g1 = 1 - this.damp, bwc = this.bwc, ex = this.ex, lcw = this.lcw, lsw = this.lsw, tL = this.tL, tR = this.tR;
      let pw = this.pw, j0 = J[0], j1 = J[1], j2 = J[2], j3 = J[3], i1 = X[0], i2 = X[1], i3 = X[2], i4 = X[3], ia2 = X[4], ia4 = X[5], mi1 = this.mi1, mi2 = this.mi2;
      let lp1 = this.lp1, lp2 = this.lp2, bw = this.bw, lc = this.lc, ls = this.ls, k, pl = this.pl, pr = this.pr;
      const half = this.half, step = half ? 2 : 1;
      for (let i = 0; i < n; i += step) {
        pre[pw] = (half ? (inp[i] + inp[i + 1]) * 0.5 : inp[i]) + 1e-18; pw = pw + 1 === PL ? 0 : pw + 1; let x = pre[pw];
        bw += bwc * (x - bw); x = bw;
        let y = q0[j0], w = x + 0.75 * y; q0[j0] = w; x = y - 0.75 * w; j0 = j0 + 1 === Q0 ? 0 : j0 + 1;
        y = q1[j1]; w = x + 0.75 * y; q1[j1] = w; x = y - 0.75 * w; j1 = j1 + 1 === Q1 ? 0 : j1 + 1;
        y = q2[j2]; w = x + 0.625 * y; q2[j2] = w; x = y - 0.625 * w; j2 = j2 + 1 === Q2 ? 0 : j2 + 1;
        y = q3[j3]; w = x + 0.625 * y; q3[j3] = w; x = y - 0.625 * w; j3 = j3 + 1 === Q3 ? 0 : j3 + 1;
        const tt = lc * lcw - ls * lsw; ls = lc * lsw + ls * lcw; lc = tt; const mo = ls * ex;
        // moitié gauche du réservoir (entrée : sortie de la moitié droite)
        let t = x + d4[i4] * dec;
        let rp = mi1 - m1L - mo; if (rp < 0) rp += M1; let ri = rp | 0, fr = rp - ri, rn = ri + 1 === M1 ? 0 : ri + 1; y = m1[ri] + (m1[rn] - m1[ri]) * fr;
        w = t - 0.7 * y; m1[mi1] = w; mi1 = mi1 + 1 === M1 ? 0 : mi1 + 1; t = y + 0.7 * w;
        d1[i1] = t; i1 = i1 + 1 === L1 ? 0 : i1 + 1;
        let u = d1[i1]; lp1 += g1 * (u - lp1); u = lp1 * dec;
        y = a2[ia2]; w = u + 0.5 * y; a2[ia2] = w; ia2 = ia2 + 1 === A2 ? 0 : ia2 + 1; u = y - 0.5 * w;
        d2[i2] = u; i2 = i2 + 1 === L2 ? 0 : i2 + 1;
        // moitié droite
        t = x + d2[i2] * dec;
        rp = mi2 - m2L + mo; if (rp < 0) rp += M2; ri = rp | 0; fr = rp - ri; rn = ri + 1 === M2 ? 0 : ri + 1; y = m2[ri] + (m2[rn] - m2[ri]) * fr;
        w = t - 0.7 * y; m2[mi2] = w; mi2 = mi2 + 1 === M2 ? 0 : mi2 + 1; t = y + 0.7 * w;
        d3[i3] = t; i3 = i3 + 1 === L3 ? 0 : i3 + 1;
        u = d3[i3]; lp2 += g1 * (u - lp2); u = lp2 * dec;
        y = a4[ia4]; w = u + 0.5 * y; a4[ia4] = w; ia4 = ia4 + 1 === A4 ? 0 : ia4 + 1; u = y - 0.5 * w;
        d4[i4] = u; i4 = i4 + 1 === L4 ? 0 : i4 + 1;
        // prises (k = position d'écriture − 1 − retard)
        let yl = 0;
        k = i3 - 1 - tL[0]; yl += d3[k < 0 ? k + L3 : k]; k = i3 - 1 - tL[1]; yl += d3[k < 0 ? k + L3 : k]; k = ia4 - 1 - tL[2]; yl -= a4[k < 0 ? k + A4 : k];
        k = i4 - 1 - tL[3]; yl += d4[k < 0 ? k + L4 : k]; k = i1 - 1 - tL[4]; yl -= d1[k < 0 ? k + L1 : k]; k = ia2 - 1 - tL[5]; yl -= a2[k < 0 ? k + A2 : k];
        k = i2 - 1 - tL[6]; yl -= d2[k < 0 ? k + L2 : k];
        if (half) { oL[i] += (pl + yl) * 0.3; oL[i + 1] += yl * 0.6; pl = yl; } else oL[i] += yl * 0.6;
        if (oR !== null) {
          let yr = 0;
          k = i1 - 1 - tR[0]; yr += d1[k < 0 ? k + L1 : k]; k = i1 - 1 - tR[1]; yr += d1[k < 0 ? k + L1 : k]; k = ia2 - 1 - tR[2]; yr -= a2[k < 0 ? k + A2 : k];
          k = i2 - 1 - tR[3]; yr += d2[k < 0 ? k + L2 : k]; k = i3 - 1 - tR[4]; yr -= d3[k < 0 ? k + L3 : k]; k = ia4 - 1 - tR[5]; yr -= a4[k < 0 ? k + A4 : k];
          k = i4 - 1 - tR[6]; yr -= d4[k < 0 ? k + L4 : k];
          if (half) { oR[i] += (pr + yr) * 0.3; oR[i + 1] += yr * 0.6; pr = yr; } else oR[i] += yr * 0.6;
        }
      }
      this.pl = pl; this.pr = pr;
      const nn = 1 / Math.sqrt(lc * lc + ls * ls); lc *= nn; ls *= nn;
      this.pw = pw; J[0] = j0; J[1] = j1; J[2] = j2; J[3] = j3; X[0] = i1; X[1] = i2; X[2] = i3; X[3] = i4; X[4] = ia2; X[5] = ia4; this.mi1 = mi1; this.mi2 = mi2;
      this.lp1 = dn(lp1); this.lp2 = dn(lp2); this.bw = dn(bw); this.lc = lc; this.ls = ls;
    }
  }
  // écho (bande ou numérique) : retard, réinjection filtrée et légèrement saturée, ping-pong en stéréo
  class Echo {
    constructor(o) { this.L = new Float32Array(Math.round(1.9 * SR) + 2); this.R = new Float32Array(this.L.length); this.setTime(o.time ?? 0.375); this.w = 0; this.fb = o.fb ?? 0.35; this.lpf = 1 - Math.exp(-TAU * (o.lp ?? 3000) / SR); this.hpf = 1 - Math.exp(-TAU * (o.hp ?? 150) / SR); this.zl = 0; this.zr = 0; this.hl = 0; this.hr = 0; this.pp = !!o.pp; this.sat = !!o.sat; }
    setTime(sec) { this.n = Math.round(clamp(sec, 0.02, 1.85) * SR); if (this.w >= this.n) this.w = 0; }
    process(inL, inR, oL, oR, n) {
      const bl = this.L, br = this.R, N = this.n, fb = this.fb, a = this.lpf, h = this.hpf, pp = this.pp, sat = this.sat; let w = this.w, zl = this.zl, zr = this.zr, hl = this.hl, hr = this.hr;
      // repos : aucune entrée depuis plus longtemps que la traîne des répétitions (-80 dB) → rien à calculer
      let any = false; for (let i = 0; i < n; i += 4) if (inL[i] !== 0) { any = true; break; }
      if (any) this.quiet = 0; else if ((this.quiet = (this.quiet || 0) + n) > N * (1 + Math.log(1e-4) / Math.log(Math.max(0.05, Math.min(0.95, fb))))) { if (!this.cleared) { bl.fill(0); br.fill(0); this.cleared = true; zl = zr = hl = hr = 0; this.zl = this.zr = this.hl = this.hr = 0; } return; }
      this.cleared = false;
      if (!oR) { // morceau mono : une seule ligne
        for (let i = 0; i < n; i++) {
          const yl = bl[w]; zl += a * (yl - zl); hl += h * (zl - hl);
          let fl = (zl - hl) * fb; if (sat) fl = ftanh(fl * 1.3) / 1.3;
          bl[w] = inL[i] + fl + 1e-18; w = w + 1 === N ? 0 : w + 1; oL[i] += yl;
        }
        this.w = w; this.zl = dn(zl); this.hl = dn(hl); return;
      }
      for (let i = 0; i < n; i++) {
        const yl = bl[w], yr = br[w]; zl += a * (yl - zl); zr += a * (yr - zr); hl += h * (zl - hl); hr += h * (zr - hr);
        let fl = (zl - hl) * fb, fr = (zr - hr) * fb; if (sat) { fl = ftanh(fl * 1.3) / 1.3; fr = ftanh(fr * 1.3) / 1.3; }
        const xl = inL[i], xr = inR ? inR[i] : xl;
        if (pp && oR) { bl[w] = xl * 0.7 + fr + 1e-18; br[w] = xr * 0.3 + fl + 1e-18; } else { bl[w] = xl + fl + 1e-18; br[w] = xr + fr + 1e-18; }
        w = w + 1 === N ? 0 : w + 1;
        oL[i] += yl; if (oR) oR[i] += yr;
      }
      this.w = w; this.zl = dn(zl); this.zr = dn(zr); this.hl = dn(hl); this.hr = dn(hr);
    }
  }
  // chorus / ensemble : deux lignes modulées en opposition (stéréo), mélange
  class Chorus { // deux lignes modulées en opposition (stéréo), LFO par rotation
    constructor(o) { this.N = 2048; this.b = new Float32Array(this.N); this.b2 = new Float32Array(this.N); this.w = 0; this.base = (o.base ?? 0.012) * SR; this.dep = (o.depth ?? 0.003) * SR; this.mix = o.mix ?? 0.5; this.l1 = rot(o.rate ?? 0.6); this.l2 = rot(o.rate2 ?? 0.21); }
    process(L, R, n) {
      const b = this.b, b2 = this.b2, M = this.N - 1, base = this.base, dep = this.dep, mix = this.mix, l1 = this.l1, l2 = this.l2; let w = this.w, c1 = l1.c, s1 = l1.s, c2 = l2.c, s2 = l2.s;
      for (let i = 0; i < n; i++) {
        let t = c1 * l1.cw - s1 * l1.sw; s1 = c1 * l1.sw + s1 * l1.cw; c1 = t; t = c2 * l2.cw - s2 * l2.sw; s2 = c2 * l2.sw + s2 * l2.cw; c2 = t;
        const m = (s1 * 0.7 + s2 * 0.3) * dep, xl = L[i], xr = R ? R[i] : xl; b[w] = xl; b2[w] = xr;
        let p = w - base - m; if (p < 0) p += M + 1; let ip = p | 0, f = p - ip; const dl = b[ip] + (b[(ip + 1) & M] - b[ip]) * f;
        p = w - base + m; if (p < 0) p += M + 1; ip = p | 0; f = p - ip; const dr = b2[ip] + (b2[(ip + 1) & M] - b2[ip]) * f;
        w = (w + 1) & M;
        if (R) { L[i] = xl + mix * (dl - xl * 0.3); R[i] = xr + mix * (dr - xr * 0.3); } else L[i] = xl + mix * 0.35 * (dl + dr);
      }
      this.w = w; l1.c = c1; l1.s = s1; l2.c = c2; l2.s = s2; renorm(l1); renorm(l2);
    }
  }
  class Trem { // trémolo (stéréo : panoramique alterné, « suitcase » Rhodes)
    constructor(o) { this.l = rot(o.rate ?? 4.5); this.d = o.depth ?? 0.4; this.st = !!o.stereo; }
    process(L, R, n) {
      const l = this.l, d = this.d * 0.5, st = this.st && R; let c = l.c, sn = l.s;
      for (let i = 0; i < n; i++) { const t = c * l.cw - sn * l.sw; sn = c * l.sw + sn * l.cw; c = t; if (st) { L[i] *= 1 - d - d * sn; R[i] *= 1 - d + d * sn; } else { const g = 1 - d - d * sn; L[i] *= g; if (R) R[i] *= g; } }
      l.c = c; l.s = sn; renorm(l);
    }
  }
  // cabine Leslie : séparation 800 Hz, pavillon (aigu) et tambour (grave) tournants : effet Doppler + modulation d'amplitude
  class Leslie {
    constructor(o) { this.N = 1024; this.h = new Float32Array(this.N); this.w = 0; this.lp = 0; this.a = 1 - Math.exp(-TAU * 800 / SR); this.fast = !!o.fast; this.sp = this.fast ? 6.6 : 0.8; this.sp2 = this.fast ? 5.8 : 0.7; this.l1 = rot(this.sp); this.l2 = rot(this.sp2); }
    process(L, R, n) {
      const h = this.h, M = this.N - 1, a = this.a; let w = this.w, lp = this.lp;
      this.sp += ((this.fast ? 6.6 : 0.8) - this.sp) * 0.004 * n / BLK; this.sp2 += ((this.fast ? 5.8 : 0.7) - this.sp2) * 0.002 * n / BLK; // inertie des rotors
      const l1 = this.l1, l2 = this.l2; l1.cw = Math.cos(TAU * this.sp / SR); l1.sw = Math.sin(TAU * this.sp / SR); l2.cw = Math.cos(TAU * this.sp2 / SR); l2.sw = Math.sin(TAU * this.sp2 / SR);
      let c1 = l1.c, s1 = l1.s, c2 = l2.c, s2 = l2.s;
      for (let i = 0; i < n; i++) {
        let t = c1 * l1.cw - s1 * l1.sw; s1 = c1 * l1.sw + s1 * l1.cw; c1 = t; t = c2 * l2.cw - s2 * l2.sw; s2 = c2 * l2.sw + s2 * l2.cw; c2 = t;
        const x = R ? (L[i] + R[i]) * 0.5 : L[i]; lp += a * (x - lp); const hi = x - lp;
        h[w] = hi; let p = w - (14 + 9 * s1); if (p < 0) p += M + 1; const ip = p | 0, fr = p - ip, hd = h[ip] + (h[(ip + 1) & M] - h[ip]) * fr; w = (w + 1) & M;
        const drum = lp * (0.875 - 0.125 * s2);
        if (R) { L[i] = drum + hd * (0.65 + 0.35 * c1); R[i] = drum + hd * (0.65 - 0.35 * c1); } else L[i] = drum + hd * (0.7 + 0.3 * c1);
      }
      this.w = w; this.lp = dn(lp); l1.c = c1; l1.s = s1; l2.c = c2; l2.s = s2; renorm(l1); renorm(l2);
    }
  }
  // ampli saturé : pré-filtre, gain, écrêtage asymétrique suréchantillonné ×2 (interpolateur demi-bande), baffle 4×12
  class Drive {
    constructor(o) {
      this.g = o.gain ?? 8; this.asym = o.asym ?? 0.15; this.pre = [new BQ('hp', o.tight ?? 110, 0.7), new BQ('pk', o.mid ?? 750, 0.8, o.midG ?? 4)];
      this.cab = [new BQ('lp', o.cab ?? 4800, 1.0), new BQ('pk', 2400, 1.2, 2), new OP('hp1', 110)];
      this.x = new Float64Array(8); this.lvl = o.out ?? 0.5; this.up = new Float32Array(BLK * 2); this.hz = new Float64Array(14); this.lp2 = new Float64Array(2);
    }
    process(L, R, n) { this.ch(L, n, 0); if (R) this.ch(R, n, 1); }
    ch(buf, n, c) {
        const pre = this.pre; pre[0].run(buf, n, c); pre[1].run(buf, n, c);
        const up = this.up, x = this.x, o = c * 4, g = this.g, as = this.asym, hz = this.hz, ho = c * 7;
        for (let i = 0; i < n; i++) { // ×2 : échantillons pairs = originaux, impairs = interpolation cubique
          const x0 = x[o], x1 = x[o + 1], x2 = x[o + 2], x3 = buf[i]; x[o] = x1; x[o + 1] = x2; x[o + 2] = x3;
          up[2 * i] = x1; up[2 * i + 1] = (-x0 + 9 * x1 + 9 * x2 - x3) / 16;
        }
        const t0 = ftanh(as); for (let i = 0; i < 2 * n; i++) { const u = up[i] * g + as; up[i] = (u > 0 ? ftanh(u) : ftanh(u * 0.8) * 1.25) - t0; }
        let h0 = hz[ho], h1 = hz[ho + 1], h2 = hz[ho + 2], h3 = hz[ho + 3], h4 = hz[ho + 4]; const lv = this.lvl / 32;
        for (let i = 0; i < n; i++) { // décimation : demi-bande 7 points (h5, h6 = anciens h3, h4)
          const a = up[2 * i], b = up[2 * i + 1];
          buf[i] = (-h4 + 9 * h2 + 16 * h1 + 9 * h0 - b) * lv; // points : b, a, h0, h1, h2, h3, h4
          h4 = h2; h3 = h1; h2 = h0; h1 = a; h0 = b;
        }
        hz[ho] = h0; hz[ho + 1] = h1; hz[ho + 2] = h2; hz[ho + 3] = h3; hz[ho + 4] = h4;
        const cab = this.cab; cab[0].run(buf, n, c); cab[1].run(buf, n, c); cab[2].run(buf, n, c);
    }
  }
  // wah à enveloppe (clavinet, guitare funk) : passe-bande d'état dont la fréquence suit le niveau
  class Wah {
    constructor(o) { this.lo = o.lo ?? 450; this.hi = o.hi ?? 2600; this.q = o.q ?? 3; this.env = 0; this.a = 1 - Math.exp(-1 / (0.004 * SR)); this.r = 1 - Math.exp(-1 / (0.09 * SR)); this.s = new Float64Array(4); this.sens = o.sens ?? 6; }
    process(L, R, n) {
      let env = this.env; for (let i = 0; i < n; i++) { const a = Math.abs(L[i]); env += (a - env) * (a > env ? this.a : this.r); }
      this.env = env = dn(env); const fc = this.lo + (this.hi - this.lo) * Math.min(1, env * this.sens), g = Math.tan(Math.PI * fc / SR), k = 1 / this.q, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
      [L, R].forEach((buf, c) => { if (!buf) return; const s = this.s; let ic1 = s[c * 2], ic2 = s[c * 2 + 1]; for (let i = 0; i < n; i++) { const v3 = buf[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; buf[i] = v1 * 2.2 + buf[i] * 0.15; } s[c * 2] = dn(ic1); s[c * 2 + 1] = dn(ic2); });
    }
  }
  class Crush { // réduction de résolution et de fréquence (puce, téléphone, jouets)
    constructor(o) { this.q = Math.pow(2, (o.bits ?? 8) - 1); this.hold = o.hold ?? 1; this.c = 0; this.vl = 0; this.vr = 0; }
    process(L, R, n) { const q = this.q; for (let i = 0; i < n; i++) { if (++this.c >= this.hold) { this.c = 0; this.vl = Math.round(L[i] * q) / q; if (R) this.vr = Math.round(R[i] * q) / q; } L[i] = this.vl; if (R) R[i] = this.vr; } }
  }
  class Gain { // gain fixe (calibrage de sonie du style, avant le haut-parleur)
    constructor(g) { this.g = g; }
    process(L, R, n) { const g = this.g; if (g === 1) return; for (let i = 0; i < n; i++) L[i] *= g; if (R) for (let i = 0; i < n; i++) R[i] *= g; }
  }
  class Sat { // saturation douce (bande, lampes)
    constructor(o) { this.k = o.k ?? 1.5; this.nk = ftanh(this.k); this.mix = o.mix ?? 1; }
    process(L, R, n) { const k = this.k, g = this.mix / this.nk, d = 1 - this.mix; for (let i = 0; i < n; i++) { L[i] = L[i] * d + ftanh(L[i] * k) * g; if (R) R[i] = R[i] * d + ftanh(R[i] * k) * g; } }
  }
  // pleurage / scintillement (bande, vinyle) : ligne à retard modulée, dérive aléatoire lente
  class Wow {
    constructor(o) { this.N = 2048; this.L = new Float32Array(this.N); this.R = new Float32Array(this.N); this.w = 0; this.l1 = rot((o.rate ?? 0.5) * 16); this.l2 = rot((o.frate ?? 6) * 16); this.dPrev = -1; this.dep = (Math.pow(2, (o.cents ?? 4) / 1200) - 1) / (TAU * (o.rate ?? 0.5)) * SR; this.dep2 = (Math.pow(2, (o.fcents ?? 1.5) / 1200) - 1) / (TAU * (o.frate ?? 6)) * SR; this.base = 20 + this.dep + this.dep2 + 4; this.drift = 0; this.dt = 0; this.extra = 0; this.ex = 0; }
    process(L, R, n) {
      const M = this.N - 1, bl = this.L, br = this.R, l1 = this.l1, l2 = this.l2, dep = this.dep, dep2 = this.dep2; let w = this.w, c1 = l1.c, s1 = l1.s, c2 = l2.c, s2 = l2.s;
      if (nzv() < -1 + n / SR) this.dt = nzv() * this.dep * 0.3;
      this.ex += (this.extra - this.ex) * 0.02; this.drift += (this.dt - this.drift) * 0.006; const base = Math.min(M - dep - dep2 - 4, Math.max(dep + dep2 + 3, this.base + this.drift + this.ex)); // retard toujours positif et dans la mémoire
      let d = this.dPrev < 0 ? base + dep * s1 + dep2 * s2 : this.dPrev;
      for (let i0 = 0; i0 < n; i0 += 16) {
        let t = c1 * l1.cw - s1 * l1.sw; s1 = c1 * l1.sw + s1 * l1.cw; c1 = t; t = c2 * l2.cw - s2 * l2.sw; s2 = c2 * l2.sw + s2 * l2.cw; c2 = t;
        const i1 = i0 + 16 < n ? i0 + 16 : n, dd = (base + dep * s1 + dep2 * s2 - d) / (i1 - i0);
        for (let i = i0; i < i1; i++) {
          d += dd; bl[w] = L[i]; if (R) br[w] = R[i];
          let p = w - d; if (p < 0) p += M + 1; const ip = p | 0, fr = p - ip, j = (ip + 1) & M;
          L[i] = bl[ip] + (bl[j] - bl[ip]) * fr; if (R) R[i] = br[ip] + (br[j] - br[ip]) * fr; w = (w + 1) & M;
        }
      }
      this.dPrev = d;
      this.w = w; l1.c = c1; l1.s = s1; l2.c = c2; l2.s = s2; renorm(l1); renorm(l2);
    }
  }
  // bruits de support : souffle (bande), craquements (vinyle, 78 tours), parasites (radio)
  class Noise {
    constructor(o) { this.hiss = (o.hiss ?? 0) + (o.crackle ?? 0) * 0.02; this.crk = o.crackle ?? 0; this.st = o.static ?? 0; this.pop = 0; this.big = 0; this.h1 = 0; this.h2 = 0; this.lp = 0; this.rev = Math.round(SR * 1.8); this.c = 0; this.np = 10; this.nb = 1000; this.sw = 0; this.sl = rot(0.07); this.z = new Int32Array([0x2545f491]); }
    // prochain événement d'un processus de Poisson (taux par seconde) : nombre d'échantillons à attendre
    next(rate) { return Math.max(1, Math.round(-Math.log(0.5 + 0.5 * nzv() + 1e-9) * SR / rate)); }
    process(L, R, n) {
      const hs = this.hiss, ck = this.crk, st = this.st; let h1 = this.h1, h2 = this.h2, pop = this.pop, big = this.big, lp = this.lp;
      if (st) { const l = this.sl; const t = l.c * l.cw - l.s * l.sw; l.s = l.c * l.sw + l.s * l.cw; l.c = t; renorm(l); this.sw += nzv() * 0.03; this.sw *= 0.97; }
      const sg = st * (0.75 + 0.25 * this.sl.s + this.sw); let np = this.np, nb = this.nb, c = this.c; const rv = this.rev; let z = this.z[0];
      for (let i = 0; i < n; i++) {
        let x = 0;
        if (hs) { z ^= z << 13; z ^= z >>> 17; z ^= z << 5; const w = z * 4.656612873077393e-10; h1 += 0.6 * (w - h1); x += (w - h1) * hs; }
        if (ck) {
          if (--np <= 0) { pop += nzv() * Math.abs(nzv()); np = this.next(30); }
          if (--nb <= 0) { big += nzv() > 0 ? 0.8 : -0.8; nb = this.next(0.6); }
          if (++c >= rv) { c = 0; big += 0.35; }
          lp += 0.25 * (big - lp); x += (pop + lp) * ck; pop *= 0.42; big *= 0.9;
        }
        if (st) { z ^= z << 13; z ^= z >>> 17; z ^= z << 5; const w = z * 4.656612873077393e-10; h2 += 0.3 * (w - h2); x += h2 * sg; }
        L[i] += x; if (R) R[i] += x;
      }
      this.z[0] = z; this.np = np; this.nb = nb; this.c = c;
      this.h1 = dn(h1); this.h2 = dn(h2); this.pop = dn(pop); this.big = dn(big); this.lp = dn(lp);
    }
  }
  // haut-parleurs : petite radio, TV cathodique, sono de plafond, téléphone, jouet, cinéma, casque/bande, hi-fi ;
  // gain : remet chaque haut-parleur à la sonie du morceau nu (la saturation remonte les signaux faibles)
  const SPEAKERS = {
    radio: { eq: [['hp', 170, 0.9], ['hp', 170, 0.7], ['pk', 1400, 1.1, 4], ['pk', 3200, 2, -3], ['lp', 5400, 0.9], ['lp', 6200, 0.6]], sat: 1.6, comp: { thr: -20, ratio: 4, att: 0.005, rel: 0.2, makeup: 5 }, gain: -7.7 },
    tv: { eq: [['hp', 190, 0.8], ['pk', 2500, 1.2, 3], ['lp', 6500, 0.8], ['lp', 7500, 0.6]], sat: 1.3, gain: -4.1 },
    pa: { eq: [['hp', 240, 0.8], ['hp', 200, 0.7], ['pk', 2100, 1, 3.5], ['lp', 6800, 0.8], ['lp', 7600, 0.6]], sat: 1.4, comp: { thr: -20, ratio: 3, att: 0.01, rel: 0.25, makeup: 3 }, gain: -5.9 },
    phone: { eq: [['hp', 320, 0.9], ['hp', 320, 0.7], ['pk', 1800, 1, 4], ['lp', 3300, 0.9], ['lp', 3300, 0.7]], sat: 2, crush: { bits: 8, hold: 2 }, gain: -6.9 },
    toy: { eq: [['hp', 320, 0.8], ['pk', 1700, 1.4, 5], ['lp', 4800, 0.9], ['lp', 5200, 0.6]], sat: 2.2, gain: -7.9 },
    cinema: { eq: [['hp', 55, 0.7], ['pk', 2000, 0.8, 1.5], ['lp', 9500, 0.7]], sat: 1.1, gain: -3.4 },
    headphones: { eq: [['hs', 9000, 0.7, -2]], noise: { hiss: 0.0016 } },
    hifi: { eq: [['hp', 28, 0.7], ['hs', 12500, 0.7, -2]] },
    box: { eq: [['hp', 260, 0.7]] },
    none: { eq: [] },
  };

  // ═══════════════ pistes ═══════════════
  // o : db, pan, rev (envoi réverb), dly (envoi écho), eq [[type, f, q, g]…], drive {…}, wah {…}, comp {…}, chorus {…},
  //     trem {…}, leslie {…}, crush {…}, sat {…}, width (étalement des voix 0..1)
  class Track {
    constructor(s, name, o) {
      // piste mono (panoramique au mixage) sauf effets stéréo ou instruments étalés : deux fois moins de calcul
      const st = !s.mono && (o.stereo || o.chorus || o.leslie || (o.trem && o.trem.stereo) || (o.width ?? 0) >= 0.6);
      this.s = s; this.name = name; this.o = o; this.L = new Float32Array(BLK); this.R = st ? new Float32Array(BLK) : null;
      this.g = dB(o.db ?? 0); this.user = 1; this.cur = this.g; this.rev = o.rev ?? 0; this.dly = o.dly ?? 0; this.width = o.width ?? 0.5; this.dk = 0; this.dkR = Math.exp(-BLK / ((o.duckRel ?? 0.16) * SR));
      this.setPan(o.pan ?? 0); this.fx = []; this.idle = 1e9; this.tail = Math.round((o.tail ?? 0.3) * SR / BLK);
      if (o.drive) this.fx.push(new Drive(o.drive));
      if (o.wah) this.fx.push(new Wah(o.wah));
      if (o.crush) this.fx.push(new Crush(o.crush));
      if (o.sat) this.fx.push(new Sat(o.sat));
      for (const e of o.eq || []) this.fx.push(mkEq(e));
      if (o.comp) this.fx.push(new Comp(o.comp));
      if (o.leslie) { this.fx.push(new Leslie(o.leslie)); this.leslie = this.fx[this.fx.length - 1]; }
      if (o.chorus) this.fx.push(new Chorus(o.chorus));
      if (o.trem) this.fx.push(new Trem(o.trem));
      if (o.leslie || o.chorus || o.trem || o.drive) this.tail = Math.max(this.tail, 8);
    }
    setPan(p) { this.pan = clamp(p, -1, 1); const a = (this.pan + 1) * Math.PI / 4; this.pl = Math.cos(a) * Math.SQRT2; this.pr = Math.sin(a) * Math.SQRT2; }
  }

  // ═══════════════ synthés temps réel ═══════════════
  // osc : 0 scie, 1 carré, 2 impulsion, 3 triangle, 4 sinus ; ft : 2 passe-bas, 3 passe-bande ; key : coupure ∝ note
  const SYN = {
    synbass: { osc: 0, sub: 0.6, ft: 2, fc0: 7, fc1: 1.6, fcT: 0.14, fq: 1.3, key: 1, a: 0.002, dec: 0.35, s: 0.75, r: 0.05, g: 0.55 },
    acidbass: { osc: 0, ft: 2, fc0: 14, fc1: 2, fcT: 0.09, fq: 3.2, key: 1, a: 0.002, dec: 0.2, s: 0.6, r: 0.04, g: 0.5 },
    subbass: { osc: 4, a: 0.004, s: 1, r: 0.05, g: 0.85 },
    synlead: { osc: 1, mix2: 0.75, det: 1.0055, ft: 2, fc0: 9, fc1: 5, fcT: 0.25, fq: 0.9, key: 1, a: 0.008, dec: 0.4, s: 0.85, r: 0.18, vib: [12, 5.4, 0.3], g: 0.32 },
    sawlead: { osc: 0, mix2: 0.8, det: 1.007, ft: 2, fc0: 10, fc1: 5, fcT: 0.3, fq: 0.8, key: 1, a: 0.01, dec: 0.4, s: 0.85, r: 0.2, vib: [10, 5.2, 0.35], g: 0.3 },
    arp: { osc: 0, ft: 2, fc0: 12, fc1: 2.4, fcT: 0.07, fq: 2.6, key: 1, a: 0.002, dec: 0.16, s: 0.25, r: 0.07, g: 0.36 },
    pluck: { osc: 2, pw: 0.3, ft: 2, fc0: 10, fc1: 1.5, fcT: 0.06, fq: 1.5, key: 1, a: 0.001, dec: 0.25, s: 0, r: 0.1, g: 0.4 },
    sine: { osc: 4, a: 0.006, s: 1, r: 0.06, g: 0.55 },
    whistle: { osc: 4, nz: 0.02, a: 0.05, s: 1, r: 0.1, vib: [8, 5.5, 0.2], g: 0.4 },
    pulse: { kind: 2, osc: 2, pw: 0.25, a: 0, s: 1, r: 0.01, g: 0.3 },
    square: { kind: 2, osc: 1, a: 0, s: 1, r: 0.01, g: 0.28 },
    tri: { kind: 2, osc: 3, a: 0, s: 1, r: 0.01, g: 0.5 },
    ghost: { kind: 3, a: 0.3, s: 0.85, dec: 0.5, r: 0.7, vib: [22, 5.2, 0.15], g: 0.9 },
  };

  // ═══════════════ théorie : gammes, accords en chiffrage romain, voicings ═══════════════
  const SCALE = {
    maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], mel: [0, 2, 3, 5, 7, 9, 11], dor: [0, 2, 3, 5, 7, 9, 10],
    mix: [0, 2, 4, 5, 7, 9, 10], lyd: [0, 2, 4, 6, 7, 9, 11], phr: [0, 1, 3, 5, 7, 8, 10], pmaj: [0, 2, 4, 7, 9], pmin: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10],
  };
  const QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7, 12], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
    mmaj7: [0, 3, 7, 11], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], 69: [0, 4, 7, 9, 14], 11: [0, 7, 10, 14, 17],
    m11: [0, 3, 7, 10, 14, 17], 13: [0, 4, 7, 10, 14, 21], '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15], dim: [0, 3, 6], dim7: [0, 3, 6, 9],
    m7b5: [0, 3, 6, 10], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14],
    'maj7#11': [0, 4, 7, 11, 18], '7b13': [0, 4, 7, 10, 20], '+7': [0, 4, 8, 10],
  };
  const ROMAN = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
  const MINOR_Q = { '': 'm', 6: 'm6', 7: 'm7', 9: 'm9', 11: 'm11', maj7: 'mmaj7', add9: 'madd9', o: 'dim', o7: 'dim7', ø: 'm7b5' };
  const chordCache = new Map();
  // « bVII9 », « ii7 », « V7b9 », « I/3 » (renversement : /3 tierce à la basse, /5 quinte, /7 septième) ; majuscule =
  // majeur, minuscule = mineur, altérations relatives à la gamme majeure de la tonique
  function parseChord(sym) {
    let c = chordCache.get(sym); if (c) return c;
    const [main, inv] = sym.split('/');
    const m = /^([b#]?)(iii|vii|ii|iv|vi|v|i)(.*)$/i.exec(main) || [0, '', 'I', ''];
    const low = m[2] === m[2].toLowerCase(), r = ROMAN[m[2].toLowerCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
    let q = m[3]; if (low && q in MINOR_Q) q = MINOR_Q[q]; else if (!low && q === 'o') q = 'dim'; else if (!low && q === 'o7') q = 'dim7';
    const iv = QUAL[q] || (low ? QUAL.m : QUAL['']), inv2 = inv === '3' ? iv[1] : inv === '5' ? iv[2] : inv === '7' ? (iv[3] ?? 10) : 0;
    c = { r, iv, bass: r + inv2, sym }; chordCache.set(sym, c); return c;
  }
  // progression : mesures séparées par des espaces, plusieurs accords par mesure séparés par des virgules
  const prog = (str) => str.trim().split(/\s+/).map((bar) => bar.split(',').map(parseChord));
  const isTone = (rel, ch) => ch.iv.some((x) => mod(ch.r + x - rel, 12) === 0);
  const DROP = [7, 0, 14, 21, 17, 9];
  // voicing avec conduite des voix : parmi renversements/octaves, celui qui bouge le moins depuis le précédent
  // (o.rootless : sans fondamentale, o.drop2 : ouvert, o.hi : note la plus haute permise, o.top : note de tête visée)
  function voicing(ch, key, prev, lo, n = 4, o = EMPTY) {
    let iv = ch.iv.filter((x) => x !== 12);
    if (o.rootless && iv.length > 3) iv = iv.filter((x) => x !== 0);
    for (const d of DROP) { if (iv.length <= n) break; const k = iv.indexOf(d); if (k >= 0 && iv.length > 3) iv.splice(k, 1); }
    while (iv.length > n) iv.pop();
    const pcs = iv.map((x) => mod(key + ch.r + x, 12));
    let best = null, bc = 1e9;
    for (let oct = 0; oct < 2; oct++) for (let rot = 0; rot < pcs.length; rot++) {
      const notes = []; let cur = lo + oct * 12 + mod(pcs[rot] - lo, 12);
      for (let k = 0; k < pcs.length; k++) { if (k) cur += mod(pcs[(rot + k) % pcs.length] - cur, 12) || 12; notes.push(cur); }
      if (o.drop2 && notes.length >= 4) notes.unshift(notes.splice(notes.length - 2, 1)[0] - 12);
      if (o.hi && notes[notes.length - 1] > o.hi) continue;
      let cost = 0;
      if (prev && prev.length) { for (const a of notes) { let m = 99; for (const b of prev) m = Math.min(m, Math.abs(a - b)); cost += m; } for (const b of prev) { let m = 99; for (const a of notes) m = Math.min(m, Math.abs(a - b)); cost += m * 0.5; } }
      else cost = Math.abs(notes[0] + notes[notes.length - 1] - 2 * (lo + 7));
      if (o.top !== undefined) cost += Math.abs(notes[notes.length - 1] - o.top) * 0.8;
      if (notes[0] < lo - 4) cost += 20;
      if (cost < bc) { bc = cost; best = notes; }
    }
    return best || pcs.map((p) => lo + mod(p - lo, 12)).sort((a, b) => a - b);
  }
  // banques de rythmes (une mesure) « début:durée » en temps
  const RH = {
    lyric: ['0:2 2:2', '0:1.5 1.5:0.5 2:2', '0:1 1:1 2:2', '0:3 3:1', '0:1 1:0.5 1.5:0.5 2:1 3:1', '0:0.5 0.5:0.5 1:1 2:2', '0:2 2:1 3:1', '1:1 2:1 3:1'],
    pop: ['0:1 1:0.5 1.5:0.5 2:1 3:1', '0:0.5 0.5:0.5 1:0.5 1.5:1 2.5:0.5 3:1', '0:1.5 1.5:1 2.5:1.5', '0:0.5 0.5:1 1.5:0.5 2:2', '0:0.75 0.75:0.75 1.5:0.5 2:1 3:0.5 3.5:0.5', '0.5:0.5 1:0.5 1.5:0.5 2:1 3:1'],
    busy: ['0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:0.5 2.5:0.5 3:1', '0:0.25 0.25:0.25 0.5:0.5 1:0.5 1.5:0.5 2:1 3:0.5 3.5:0.5', '0:0.5 0.5:0.25 0.75:0.25 1:0.5 1.5:0.5 2:0.5 2.5:0.5 3:0.5 3.5:0.5', '0:0.5 0.5:0.5 1:1 2:0.5 2.5:0.5 3:0.5 3.5:0.5'],
    sparse: ['0:1.5 2:0.5 2.5:1', '1:0.5 1.5:0.5 2:2', '0.5:0.5 1:1 3:1', '0:3', '2:0.5 2.5:0.5 3:1', '0:0.75 0.75:0.75 1.5:2.5', '0.5:1 1.5:0.5 2:2'],
    waltz: ['0:2 2:1', '0:1 1:1 2:1', '0:1.5 1.5:0.5 2:1', '0:0.5 0.5:0.5 1:1 2:1', '0:1 1:0.5 1.5:0.5 2:1', '0:2.5 2.5:0.5', '0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:1'],
    march: ['0:0.75 0.75:0.25 1:1 2:0.75 2.75:0.25 3:1', '0:1.5 1.5:0.5 2:1 3:1', '0:0.75 0.75:0.25 1:0.75 1.75:0.25 2:2', '0:1 1:1 2:1 3:0.75 3.75:0.25', '0:0.5 0.5:0.5 1:1 2:1 3:1'],
    chip: ['0:0.5 0.5:0.5 1:0.25 1.25:0.25 1.5:0.5 2:0.5 2.5:0.5 3:1', '0:0.75 0.75:0.75 1.5:0.5 2:0.5 2.5:0.5 3:0.5 3.5:0.5', '0:0.25 0.25:0.25 0.5:0.25 0.75:0.25 1:1 2:0.5 2.5:0.5 3:1', '0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:0.75 2.75:0.75 3.5:0.5'],
    swing: ['0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:1 3:0.5 3.5:0.5', '0.5:0.5 1:0.5 1.5:1 2.5:0.5 3:1', '0:1.5 1.5:0.5 2:0.5 2.5:0.5 3:1', '0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:0.5 2.5:0.5 3:0.5 3.5:0.5', '0:1 1.5:0.5 2:1.5 3.5:0.5'],
    jingle: ['0:1 1:1 2:2', '0:0.5 0.5:0.5 1:1 2:0.5 2.5:0.5 3:1', '0:1 1:1 2:1.5 3.5:0.5', '0:0.5 0.5:0.5 1:0.5 1.5:0.5 2:1 3:1'],
    synco: ['0:0.75 0.75:0.75 1.5:1 2.5:0.5 3:1', '0.5:0.5 1:0.5 1.5:0.5 2.5:1.5', '0:0.5 0.5:1 1.5:0.5 2:0.5 2.5:1 3.5:0.5', '0:1.5 1.5:0.5 2:0.5 2.5:0.75 3.25:0.75'],
    cad4: ['0:4', '0:2 2:2', '0:1 1:3', '0:3', '0:1.5 1.5:2.5'], cad3: ['0:3', '0:1 1:2', '0:2'],
  };
  const rhCache = new Map();
  const rhythm = (str) => { let r = rhCache.get(str); if (!r) rhCache.set(str, (r = str.split(' ').map((p) => p.split(':').map(Number)))); return r; };
  const degOf = (rel, sc) => { const o = Math.floor(rel / 12), pc = mod(rel, 12); let k = 0, bd = 99; sc.forEach((s, i) => { const d = Math.abs(s - pc); if (d < bd) { bd = d; k = i; } }); return o * sc.length + k; };
  const relOf = (d, sc) => 12 * Math.floor(d / sc.length) + sc[mod(d, sc.length)];
  const stepSc = (rel, k, sc) => relOf(degOf(rel, sc) + k, sc);
  const nearOct = (n, ref) => n + 12 * Math.round((ref - n) / 12);
  const minorish = (str) => /^(b?i(?!i|v)|bvi)/.test(str.trim().split(/\s+/)[0].split(',')[0]);

  // ═══════════════ morceau : séquenceur, voix, pistes, bus, sortie par tranches ═══════════════
  const MAXV = 44;
  class Song {
    constructor(id, name, o) {
      this.id = id; this.name = name; this.o = o; this.mono = !!o.mono; this.style = STYLES[name] || STYLES.muzak;
      const sd = o.seed ?? Math.floor(Math.random() * 4294967296);
      this.seed = hashStr(name + '|' + String(sd)); this.R = makeRng(this.seed); this.H = makeRng((this.seed ^ 0x2545f491) >>> 0);
      this.intensity = Number.isFinite(+o.intensity) ? clamp(+o.intensity, 0, 1) : 0.6;
      this.tempo = 1; this.cents = 0; this.baseCents = 0; this.pm = 1; this.errors = 0; this.mg = 1; this.mgR = 0; this.gc = 0; this.gcR = 0; this.gtm = 1; this.gtR = 0;
      this.beat = 0; this.bpmCur = 100; this.st = 1; this.stT = 1; this.stR = 0; this.q = []; this.qi = 0; this.composed = 0; this.cur = null;
      this.voices = []; this.tracks = []; this.trk = {}; this.rrc = {};
      this.bpm = 100; this.key = 60; this.meter = 4; this.sc = SCALE.maj; this.kit = 'std'; this.swing = 0; this.swingUnit = 0.5; this.hum = 0.006; this.humV = 0.07;
      this.p = null; this.pieceN = 0; this.form = null; this.fi = 0; this.bis = 0; this.secs = null; this.sec = null; this.secName = ''; this.secLen = 0; this.chords = null; this.barN = 0; this.vl = {}; this.ended = false;
      this.L = new Float32Array(BLK); this.Rb = this.mono ? null : new Float32Array(BLK); this.rvIn = new Float32Array(BLK); this.dl = new Float32Array(BLK); this.dr = this.mono ? null : new Float32Array(BLK);
      this.made = 0; this.need = 0; this.play = 0; this.tail = null; this.born = perf(); this.cpu = 0;
      this.mfx = []; this.plate = null; this.echo = null; this.glue = null;
      this.style.init(this);
      this.master();
      this.composeTo(this.meter * 2.5);
    }
    // fin de chaîne : calibrage du style (≈ −20 LUFS) → haut-parleur (EQ, compression, saturation…) → gain du haut-parleur,
    // fondus → limiteur à −1 dBFS
    master() {
      this.mfx.push(new Gain(dB(this.style.gain ?? 0)));
      const sp = SPEAKERS[this.o.speaker] || SPEAKERS.none;
      for (const e of sp.eq) this.mfx.push(mkEq(e));
      if (sp.comp) this.mfx.push(new Comp(sp.comp));
      if (sp.sat) this.mfx.push(new Sat({ k: sp.sat }));
      if (sp.crush) this.mfx.push(new Crush(sp.crush));
      const bo = this.busO || EMPTY;
      if (sp.wow && !bo.wow) this.mfx.push(new Wow(sp.wow));
      if (sp.noise && !bo.noise) this.mfx.push(new Noise(sp.noise));
      this.calib = dB(sp.gain ?? 0);
      this.lim = new Limiter(0.89);
    }
    // ── mise en place (styles) ──
    track(name, o = EMPTY) { const t = new Track(this, name, o); this.tracks.push(t); this.trk[name] = t; return t; }
    // bus : réverbération (plaque), écho, compression de bus, EQ et couleur du support (bande, vinyle)
    bus(o) {
      this.busO = o;
      if (o.rev) this.plate = new Plate(o.rev);
      if (o.echo) this.echo = new Echo(o.echo);
      if (o.glue) this.mfx.push(this.glue = new Comp({ thr: -16, ratio: 2.5, att: 0.012, rel: 0.2, knee: 8, ...o.glue }));
      for (const e of o.eq || []) this.mfx.push(mkEq(e));
      if (o.sat) this.mfx.push(new Sat(o.sat));
      if (o.wow) this.mfx.push(this.wow = new Wow(o.wow));
      if (o.noise) this.mfx.push(this.noiseFx = new Noise(o.noise));
    }
    // ── contrôle ──
    param(k, v) {
      const x = +v;
      if (k === 'tempo' && Number.isFinite(x)) this.tempo = clamp(x, 0.05, 4);
      else if (k === 'detune' && Number.isFinite(x)) this.cents = clamp(x, -2400, 2400);
      else if (k === 'intensity' && Number.isFinite(x)) this.intensity = clamp(x, 0, 1);
      else if (typeof k === 'string' && k.startsWith('track:') && Number.isFinite(x)) { const t = this.trk[k.slice(6)]; if (t) t.user = clamp(x, 0, 4); }
      if (this.style.param) { try { this.style.param(this, k, v); } catch (e) { log('param', e); } }
    }
    // ── écriture des événements (b, d en temps relatifs à la mesure en cours) ──
    ev(tr, i, b, d, n, v, x = EMPTY) {
      if (typeof n === 'number' ? !Number.isFinite(n) : typeof n !== 'string') return; // jamais de note indéfinie
      let bb = b;
      if (!x.tight) {
        const sw = x.sw ?? this.swing; if (sw) { const u = this.swingUnit, k = b / u, kr = Math.round(k); if (Math.abs(k - kr) < 1e-3 && (kr & 1)) bb += sw * u / 3; }
        const hum = x.hum ?? this.hum; if (hum) bb += this.H.gauss() * hum * this.bpm / 60;
      }
      if (x.dt) bb += x.dt * this.bpm / 60;
      const vv = x.tight ? v : clamp(v * (1 + (this.H() - 0.5) * 2 * (x.hv ?? this.humV)), 0.02, 1);
      this.cur.push({ b: Math.max(0, bb), tr, i, d, n, v: vv, x });
    }
    hit(type, b, v = 0.8, x = EMPTY) {
      const rr = (this.rrc[type] = ((this.rrc[type] || 0) + 1 + (this.H() < 0.3 ? 1 : 0)) % 3);
      this.ev(x.tr || (this.trk.hh && /hat|ride|bell|shaker|cabasa|tamb/.test(type) ? 'hh' : 'dr'), 'drum', b, 0.25, type, v, { ...x, rr });
    }
    pat(str, type, x = EMPTY, vel = 1) { const n = str.length, step = this.barLen / n; for (let i = 0; i < n; i++) { const c = str[i], v = c === 'X' ? 1 : c === 'x' ? 0.86 : c === 'o' ? 0.68 : c === 'h' ? 0.5 : c === 'g' ? 0.28 : 0; if (v) this.hit(type, i * step, v * vel, x); } }
    tempoAt(b, f, ramp = 0) { this.cur.push({ b, i: 'tempo', n: f, d: ramp, x: EMPTY }); }
    fx(b, fn, x = EMPTY) { this.cur.push({ b, i: 'fx', n: fn, x }); }
    fadeOut(b, beats) { this.fx(b, (S) => { S.mgR = -1 / Math.max(0.5, beats); }); }
    // arrêt de bande : hauteur et tempo s'effondrent ensemble (fin de morceau lo-fi)
    tapeStop(b, sec) { this.fx(b, (S) => { const n = sec * SR; S.gcR = -2000 / n; S.gtR = -0.9 / n; S.mgR = -1 / Math.max(0.3, sec * S.bpmCur / 60 * 0.6); }); }
    chordAt(b, chs = this.chords) { return chs[Math.min(chs.length - 1, Math.floor(b / (this.barLen / chs.length)))]; }
    nextChord() {
      if (this.bis + 1 < this.secLen) return this.sec.prog[(this.bis + 1) % this.sec.prog.length][0];
      const nx = this.secs[this.form[this.fi + 1]]; return nx ? nx.prog[0][0] : this.sec.prog[0][0];
    }
    bassOf(ch, lo = 33) { return lo + mod(this.key + ch.bass - lo, 12); }
    vo(slot, ch, lo, n = 4, o = EMPTY) { return (this.vl[slot] = voicing(ch, this.key, this.vl[slot], lo, n, o)); }
    mel(tr, inst, notes, x = EMPTY, tp = 0, vel = 1, leg = 0.95) { if (notes) for (const n of notes) this.ev(tr, inst, n.b, n.d * leg, this.key + n.n + tp, n.v * vel, n.x ? { ...x, ...n.x } : x); }
    strum(tr, inst, b, d, notes, v, x = EMPTY, gap = 0.012) { notes.forEach((n, k) => this.ev(tr, inst, b, d, n, v * (k === notes.length - 1 ? 1 : 0.9), gap ? { ...x, dt: (x.dt || 0) + k * gap } : x)); }
    // ── composition : morceaux successifs (forme, sections), mesure par mesure, deux mesures d'avance ──
    nextPiece() {
      if (this.form) this.composed += Math.max(0, (this.p && this.p.gap) ?? 1.6) * this.bpm / 60; // silence entre deux morceaux
      this.vl = {}; this.p = {}; this.fi = 0; this.bis = 0; this.ended = false;
      this.style.piece(this, this.pieceN++);
      this.q.push({ B: this.composed, i: 'bpm', n: this.bpm, d: 0, x: EMPTY }, { B: this.composed, i: 'tempo', n: 1, d: 0, x: EMPTY });
      this.enter();
    }
    enter() { this.secName = this.form[this.fi]; this.sec = this.secs[this.secName]; this.secLen = this.sec.len || this.sec.prog.length; }
    composeTo(target) {
      for (let guard = 0; this.composed < target && guard < 48; guard++) {
        if (!this.form || this.ended) this.nextPiece();
        const sec = this.sec, k = this.bis;
        this.chords = sec.prog[k % sec.prog.length]; this.first = k === 0; this.fill = k === this.secLen - 1;
        this.last = this.fill && this.fi === this.form.length - 1; this.barLen = this.meter; this.cur = [];
        try { this.style.bar(this, sec, k); } catch (e) { log('bar:' + this.name, 'erreur de composition', e); }
        const B0 = this.composed, bpf = this.bpm / 60 / SR, due0 = perf() + Math.max(0, (B0 - this.beat) / bpf / SR * 1000 - 300);
        for (const e of this.cur) { e.B = B0 + e.b; const key = this.keyOf(e); if (key && !STORE.has(key)) want(key, due0 + e.b / bpf / SR * 1000); }
        if (this.cur.length) { if (this.qi) { this.q = this.q.slice(this.qi); this.qi = 0; } for (const e of this.cur) this.q.push(e); this.q.sort((a, b) => a.B - b.B); }
        this.cur = null; this.composed += this.barLen; this.bis++; this.barN++;
        if (this.bis >= this.secLen) { this.bis = 0; this.fi++; if (this.fi >= this.form.length) this.ended = true; else this.enter(); }
      }
    }
    keyOf(e) {
      if (e.i === 'drum') return drumKey(e.x.kit || (this.trk[e.tr] && this.trk[e.tr].o.kit) || this.kit, e.n, e.v, e.x.rr | 0);
      const I = INSTR[e.i]; return I ? keyOf(e.i, baseOf(I, e.n), layerOf(I, e.v)) : null;
    }
    readyFor(frames, near = false) {
      const bpf = this.bpmCur * this.tempo * this.st / 60 / SR, bEnd = this.beat + frames * bpf;
      for (let k = this.qi; k < this.q.length && this.q[k].B < bEnd; k++) { const key = this.keyOf(this.q[k]); if (key && !STORE.has(key) && !(near && hasNear(key))) return false; }
      return true;
    }
    pan(v, p) { const a = (clamp(p, -1, 1) + 1) * Math.PI / 4; v.gl = Math.cos(a) * Math.SQRT2; v.gr = Math.sin(a) * Math.SQRT2; }
    setSample(v, s) {
      if (s.quick) UPGRADE.add(s.key); v.s = s; s.refs++; v.d = s.d; v.loop = s.loop; v.ls = s.ls; v.le = s.le; v.ll = s.le - s.ls; v.env = s.env; v.pos = 0; }
    // ── déclenchement d'un événement (off : décalage dans le bloc, bpf : temps par image) ──
    trigger(e, off, bpf) {
      const i = e.i;
      if (i === 'bpm') { this.bpmCur = e.n; this.mg = 1; this.mgR = 0; this.gc = 0; this.gcR = 0; this.gtm = 1; this.gtR = 0; return; } // début de morceau
      if (i === 'tempo') { if (e.d > 0) { this.stT = e.n; this.stR = (e.n - this.st) / e.d; } else { this.st = this.stT = e.n; this.stR = 0; } return; }
      if (i === 'fx') { try { e.n(this, e.x); } catch (err) { log('fx:' + this.name, err); } return; }
      const tr = this.trk[e.tr]; if (!tr) return;
      const x = e.x, durF = Math.max(1, Math.round((e.d + (x.ped || 0)) / bpf));
      const v = newVoice();
      if (i === 'drum') {
        const kit = x.kit || tr.o.kit || this.kit, s = getSample(drumKey(kit, e.n, e.v, x.rr | 0)) || getSample(drumKey(kit, e.n, e.v, 0)) || getSample(drumKey(kit, e.n, 0.3, 0)) || getSample(drumKey(kit, e.n, 0.9, 0));
        if (!s) { freeVoice(v); return; }
        if (e.n === 'hat' || e.n === 'phat') for (const u of this.voices) if (u.tr === tr && u.choke === 1 && u.stage < 2) { u.stage = 2; u.relB = 0.35; }
        this.setSample(v, s); v.inc = (x.p ?? 1) * (1 + (this.H() - 0.5) * 0.012) * s.sr / SR; v.amp = (DGAIN[e.n] ?? 0.5) * Math.pow(e.v, 1.5) * (x.g ?? 1);
        v.lvl = 1; v.stage = 1; v.relAt = x.cut ? Math.round(x.cut * SR) : -1; v.relB = Math.pow(0.001, BLK / (0.015 * SR)); v.choke = e.n === 'ohat' ? 1 : 0; v.pri = e.n === 'kick' || e.n === 'snare' ? 3 : 1;
        if (e.v < 0.7 && !x.nof) { v.ft = 1; v.fc0 = v.fc1 = 2200 + 16000 * e.v * e.v; }
        if (x.duck) for (const nm of x.duck) { const t2 = this.trk[nm]; if (t2) t2.dk = Math.max(t2.dk, x.dd ?? 0.3); } // « pompage » façon compression latérale
        this.pan(v, x.pan ?? 0);
      } else if (INSTR[i]) {
        const I = INSTR[i], s = sampleFor(i, e.n, e.v); if (!s) { freeVoice(v); return; }
        this.setSample(v, s); v.inc = mtof(e.n) / s.f0 * s.sr / SR; v.amp = Math.pow(e.v, 1.6) * (x.g ?? 1);
        const a = x.a ?? 0; v.atk = a * SR; v.lvl = a > 0 ? 0 : 1; v.stage = a > 0 ? 0 : 1;
        v.sus = x.s ?? 1; if (v.sus < 1) v.decB = Math.pow(0.001, BLK / ((x.dec ?? 1.5) * SR));
        v.relB = Math.pow(0.001, BLK / (Math.max(0.006, x.r ?? I.rel) * SR));
        v.relAt = I.nodamp && e.n >= I.nodamp && !x.damp ? -1 : durF;
        if (I.vf && !x.nof) { v.ft = 1; v.fc0 = v.fc1 = I.vf(e.v, e.n) * (x.bright ?? 1); }
        this.pan(v, x.pan ?? (I.pan ? clamp((e.n - 62) / 30, -1, 1) * I.pan * tr.width : 0));
        v.pri = x.pri ?? 2;
      } else {
        const P = SYN[i]; if (!P) { freeVoice(v); return; }
        v.kind = P.kind ?? 1; v.osc = x.osc ?? P.osc ?? 0; v.freq = mtof(e.n); v.det = x.det ?? P.det ?? 1.006; v.mix2 = x.mix2 ?? P.mix2 ?? 0; v.sub = x.sub ?? P.sub ?? 0; v.nz = x.nz ?? P.nz ?? 0; v.pw = x.pw ?? P.pw ?? 0.5;
        v.amp = Math.pow(e.v, 1.3) * (x.g ?? 1) * (P.g ?? 0.3);
        const a = x.a ?? P.a ?? 0.005; v.atk = a * SR; v.lvl = a > 0 ? 0 : 1; v.stage = a > 0 ? 0 : 1; v.sus = x.s ?? P.s ?? 1; v.decB = Math.pow(0.001, BLK / ((x.dec ?? P.dec ?? 0.5) * SR));
        v.relB = Math.pow(0.001, BLK / (Math.max(0.004, x.r ?? P.r ?? 0.05) * SR)); v.relAt = durF;
        if (P.ft) { const kf = P.key ? v.freq : 1; v.ft = x.ft ?? P.ft; v.fc0 = (x.fe ?? P.fc0) * kf; v.fc1 = (x.fc ?? P.fc1) * kf; v.fcT = (x.fct ?? P.fcT ?? 0.2) * SR; v.fq = x.fq ?? P.fq ?? 0.707; }
        if (x.arp) { v.arp = x.arp; v.arpT = Math.max(1, (x.as ?? 1 / 60) * SR); }
        if (v.kind === 3) { v.fm = [VOWEL[x.vw || 'u'], VOWEL[x.vw2 || x.vw || 'o']]; v.slT = durF * 0.7; v.br = x.breath ?? 0.6; }
        const vib = x.vib ?? P.vib; if (vib && !x.vib0) { v.vd = Math.pow(2, vib[0] / 1200) - 1; v.vr = TAU * vib[1] / SR; v.vdel = (vib[2] ?? 0.2) * SR; v.vfade = 0.25 * SR; v.vph = this.H() * TAU; }
        v.ph1 = this.H(); v.ph2 = this.H(); this.pan(v, x.pan ?? 0); v.pri = x.pri ?? 2;
      }
      v.cr = Math.pow(2, ((x.c || 0) + this.baseCents) / 1200);
      if (x.vib && v.kind === 0) { v.vd = Math.pow(2, x.vib[0] / 1200) - 1; v.vr = TAU * x.vib[1] / SR; v.vdel = (x.vib[2] ?? 0.25) * SR; v.vfade = (x.vib[3] ?? 0.3) * SR; v.vph = this.H() * TAU; }
      if (x.pe) { v.pe = x.pe; v.peT = (x.pet ?? 0.04) * SR; }
      if (x.gl !== undefined) { v.glF = mtof(x.gl) / mtof(e.n); v.glT = Math.max(1, (x.glt ?? 0.06) * SR); }
      if (x.sl) { v.slR = Math.pow(2, x.sl / 12); v.slT = Math.max(1, (x.slt ?? 0.08) * SR); v.slAt = Math.max(0, durF - v.slT); }
      if (x.trem) { v.td = x.trem[0]; v.tr2 = TAU * x.trem[1] / SR; v.tph = this.H() * TAU; }
      if (x.fc && v.kind === 0) { v.ft = x.ft ?? 2; v.fc1 = x.fc; v.fc0 = x.fe ?? x.fc; v.fcT = (x.fct ?? 0.2) * SR; v.fq = x.fq ?? 0.707; }
      if (!(Number.isFinite(v.inc) && Number.isFinite(v.amp) && Number.isFinite(v.cr) && Number.isFinite(v.freq))) { freeVoice(v); return; }
      if (!tr.R) { v.gl = 1; v.gr = 1; } // piste mono : le panoramique se fait au mixage
      v.nk = e.n;
      if (i === 'drum') { // une cymbale ou une caisse ne sonne pas en dix exemplaires : on garde les deux dernières frappes
        let cnt = 0, old = null; for (const u of this.voices) if (u.tr === tr && u.nk === e.n && u.stage < 2) { cnt++; if (!old || u.age > old.age) old = u; }
        if (cnt >= (e.n === 'kick' || e.n === 'snare' ? 2 : 1) && old) { old.stage = 2; old.relB = Math.pow(0.001, BLK / (0.07 * SR)); }
      } else if (!x.keep && v.kind === 0) { // même corde frappée à nouveau
        for (const u of this.voices) if (u.tr === tr && u.nk === e.n && u.stage < 2 && u.kind === 0) { u.stage = 2; u.relB = Math.min(u.relB, Math.pow(0.001, BLK / (0.12 * SR))); }
      }
      v.tr = tr; v.id = x.id | 0; v.n0 = off; v.on = true; tr.idle = 0;
      if (this.voices.length >= MAXV) this.steal();
      this.voices.push(v);
    }
    steal() { // la voix la moins prioritaire (relâchée, puis la plus ancienne) s'éteint en 5 ms
      let best = null, bs = Infinity;
      for (const v of this.voices) { if (v.stage >= 2 && v.relB < 0.2) continue; const sc = v.pri * 1e7 + (v.stage === 2 ? 0 : 5e6) - v.age * (v.loop ? 0.5 : 1); if (sc < bs) { bs = sc; best = v; } }
      if (best) { best.stage = 2; best.relB = 0.08; }
    }
    // ── un bloc de 128 images → out (canaux L, R) à la position o ──
    block(oL, oR, o) {
      let bpf = this.bpmCur * this.tempo * this.st * this.gtm / 60 / SR;
      const q = this.q, b1 = this.beat + BLK * bpf;
      while (this.qi < q.length && q[this.qi].B < b1) { const e = q[this.qi++]; this.trigger(e, clamp(Math.floor((e.B - this.beat) / bpf), 0, BLK - 1), bpf); }
      for (const t of this.tracks) if (t.idle <= t.tail) { t.L.fill(0); if (t.R) t.R.fill(0); }
      const pmT = Math.pow(2, (this.cents + this.gc) / 1200); this.pm += (pmT - this.pm) * 0.05; const pm = this.pm;
      const V = this.voices; let w = 0;
      for (let k = 0; k < V.length; k++) { const v = V[k]; runVoice(v, v.tr.L, v.tr.R, v.n0, pm); v.n0 = 0; v.tr.idle = 0; if (v.stage >= 3) freeVoice(v); else V[w++] = v; }
      V.length = w;
      const L = this.L, R = this.Rb, rv = this.rvIn, dl = this.dl, dr = this.dr; L.fill(0); if (R) R.fill(0); rv.fill(0); dl.fill(0); if (dr) dr.fill(0);
      for (const t of this.tracks) {
        if (t.idle > t.tail) continue; t.idle++;
        const tl = t.L, trr = t.R;
        for (const f of t.fx) f.process(tl, trr, BLK);
        const gt = t.g * t.user * (1 - t.dk), g0 = t.cur, dg = (gt - g0) / BLK; t.cur = gt; t.dk = t.dk > 1e-5 ? t.dk * t.dkR : 0;
        const rs = t.rev, ds = t.dly; let g = g0;
        if (R && trr) {
          const pl = t.pl, pr = t.pr; for (let i = 0; i < BLK; i++) { g += dg; tl[i] *= g * pl; trr[i] *= g * pr; L[i] += tl[i]; R[i] += trr[i]; }
          if (rs) { const k = rs * 0.5; for (let i = 0; i < BLK; i++) rv[i] += (tl[i] + trr[i]) * k; }
          if (ds) for (let i = 0; i < BLK; i++) { dl[i] += tl[i] * ds; dr[i] += trr[i] * ds; }
        } else if (R) { // piste mono dans un morceau stéréo
          const pl = t.pl, pr = t.pr; for (let i = 0; i < BLK; i++) { g += dg; tl[i] *= g; L[i] += tl[i] * pl; R[i] += tl[i] * pr; }
          if (rs) for (let i = 0; i < BLK; i++) rv[i] += tl[i] * rs;
          if (ds) { const kl = ds * pl, kr = ds * pr; for (let i = 0; i < BLK; i++) { dl[i] += tl[i] * kl; dr[i] += tl[i] * kr; } }
        } else {
          for (let i = 0; i < BLK; i++) { g += dg; tl[i] *= g; L[i] += tl[i]; }
          if (rs) for (let i = 0; i < BLK; i++) rv[i] += tl[i] * rs;
          if (ds) for (let i = 0; i < BLK; i++) dl[i] += tl[i] * ds;
        }
      }
      if (this.echo) this.echo.process(dl, dr, L, R, BLK);
      if (this.plate) this.plate.process(rv, L, R, BLK);
      for (const f of this.mfx) f.process(L, R, BLK);
      const m0 = this.mg; if (this.mgR) this.mg = clamp(this.mg + this.mgR * BLK * bpf, 0, 1);
      const c0 = this.calib * m0, dc = this.calib * (this.mg - m0) / BLK;
      for (let i = 0; i < BLK; i++) L[i] *= c0 + dc * i; if (R) for (let i = 0; i < BLK; i++) R[i] *= c0 + dc * i;
      this.lim.process(L, R, BLK);
      oL.set(L, o); if (oR) oR.set(R || L, o);
      if (this.stR) { this.st += this.stR * BLK * bpf; if ((this.stR > 0 && this.st >= this.stT) || (this.stR < 0 && this.st <= this.stT)) { this.st = this.stT; this.stR = 0; } }
      if (this.gcR) this.gc = Math.max(-3600, this.gc + this.gcR * BLK);
      if (this.gtR) this.gtm = clamp(this.gtm + this.gtR * BLK, 0.03, 4);
      this.beat = b1;
      this.composeTo(this.beat + this.meter * 2.5);
    }
    chunk() {
      // tableaux recyclés (renvoyés par le fil principal) : chaque échantillon est réécrit, pas besoin de remise à zéro
      const t0 = perf(), N = CHUNK, M = OVL, len = N + M, L = FREE.pop() || new Float32Array(len), R = this.mono ? null : FREE.pop() || new Float32Array(len);
      if (!this.tail) { this.tail = [new Float32Array(M), R ? new Float32Array(M) : null]; this.block(this.tail[0], this.tail[1], 0); }
      L.set(this.tail[0]); if (R) R.set(this.tail[1]);
      for (let o = M; o < len; o += BLK) this.block(L, R, o);
      let nan = 0; for (let i = 0; i < len; i++) { if (L[i] !== L[i]) { L[i] = 0; nan++; } if (R && R[i] !== R[i]) { R[i] = 0; nan++; } }
      if (nan) { log('nan:' + this.name, 'valeurs non numériques dans « ' + this.name + ' » : effets réinitialisés'); this.panic(); }
      this.tail[0].set(L.subarray(N, len)); if (R) this.tail[1].set(R.subarray(N, len));
      for (let i = 0; i < M; i++) { const u = (i + 0.5) / M; L[i] *= u; L[N + i] *= 1 - u; if (R) { R[i] *= u; R[N + i] *= 1 - u; } }
      this.made++; this.cpu += perf() - t0;
      return R ? [L, R] : [L];
    }
    free() { for (const v of this.voices) freeVoice(v); this.voices = []; this.q = []; this.dead = true; }
    // remise à neuf des états (voix coupées, effets reconstruits) si un calcul a divergé
    panic() {
      for (const v of this.voices) freeVoice(v); this.voices = [];
      for (const t of this.tracks) { const n = new Track(this, t.name, t.o); n.user = t.user; Object.assign(t, { fx: n.fx, leslie: n.leslie, cur: t.g }); t.L.fill(0); if (t.R) t.R.fill(0); }
      const mf = this.mfx.length; this.mfx = []; this.plate = null; this.echo = null; this.glue = null; this.wow = null;
      if (this.busO) this.bus(this.busO);
      this.master(); return mf;
    }
  }

  // ═══════════════ répertoire : lecture des partitions (repertoire.js) ═══════════════
  // jetons : hauteur + durée (w h q e s t, « . » pointé, « 3 » triolet), r = silence, [A,B]q = accord, « ~ » = liaison,
  // « | » = barre de mesure (durée vérifiée), !p … !ff = nuance ; ch : accords absolus par mesure (« C G7,C Am »)
  const PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, DURS = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 0.125 }, DYNS = { pp: 0.35, p: 0.45, mp: 0.55, mf: 0.66, f: 0.8, ff: 0.92 };
  const pitchN = (s) => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); return m ? 12 * (+m[3] + 1) + PCN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : null; };
  function parseVoice(str, meter, pickup, errs, name) {
    const out = []; let t = 0, barStart = 0, bar = 0, vel = 0.66, tie = null;
    const check = () => { const len = t - barStart, want = bar === 0 && pickup ? pickup : meter; if (Math.abs(len - want) > 1e-6) errs.push(`${name}, mesure ${bar} : ${+len.toFixed(3)} temps au lieu de ${want}`); };
    for (const tok of str.trim().split(/\s+/)) {
      if (!tok) continue;
      if (tok === '|') { check(); bar++; barStart = t; continue; }
      if (tok[0] === '!') { vel = DYNS[tok.slice(1)] ?? vel; continue; }
      const m = /^(\[[^\]]+\]|r|[A-G][#b]?-?\d)([whqest])(\.?)(3?)(~?)$/.exec(tok);
      if (!m) { errs.push(`${name} : jeton illisible « ${tok} »`); continue; }
      const d = DURS[m[2]] * (m[3] ? 1.5 : 1) * (m[4] ? 2 / 3 : 1);
      if (m[1] === 'r') tie = null;
      else {
        const ps = m[1][0] === '[' ? m[1].slice(1, -1).split(',').map(pitchN) : [pitchN(m[1])];
        let last = null;
        for (const n of ps) {
          if (n === null) { errs.push(`${name} : hauteur illisible « ${tok} »`); continue; }
          if (tie && tie.n === n && Math.abs(tie.t + tie.d - t) < 1e-6) { tie.d += d; last = tie; } else { last = { t, d, n, v: vel }; out.push(last); }
        }
        tie = m[5] && ps.length === 1 ? last : null;
      }
      t += d;
    }
    if (t > barStart + 1e-6) check();
    return { notes: out, len: t, bars: bar + (t > barStart + 1e-6 ? 1 : 0) };
  }
  const ABSQ = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], dim7: [0, 3, 6, 9], sus4: [0, 5, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 9: [0, 4, 7, 10, 14], aug: [0, 4, 8] };
  function absChord(sym) {
    const m = /^([A-G])([#b]?)([a-z0-9]*)(?:\/([A-G][#b]?))?$/.exec(sym); if (!m) return null;
    const r = mod(PCN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), 12), iv = ABSQ[m[3]] || ABSQ[''];
    const bass = m[4] ? mod(PCN[m[4][0]] + (m[4][1] === '#' ? 1 : m[4][1] === 'b' ? -1 : 0) - r, 12) + r : r;
    return { r, iv, bass, sym };
  }
  const SCORES = new Map();
  // partition prête à jouer : notes par voix et par mesure (b relatif à la mesure), accords par mesure
  function score(id) {
    if (SCORES.has(id)) return SCORES.get(id);
    const P = REP[id]; if (!P) return null;
    const errs = [], m = P.m || 4, pk = P.pk || 0, voices = {};
    let bars = P.bars || 0;
    if (P.ev) voices.all = P.ev.map(([t, d, n, v]) => ({ t, d, n, v: v ?? 0.6 }));
    for (const k in P.v || {}) { const r = parseVoice(P.v[k], m, pk, errs, k); voices[k] = r.notes; bars = Math.max(bars, r.bars); }
    const start = (k) => (k === 0 ? 0 : pk ? pk + (k - 1) * m : k * m), barOf = (t) => (pk ? (t < pk ? 0 : 1 + Math.floor((t - pk) / m + 1e-9)) : Math.floor(t / m + 1e-9));
    const byBar = {};
    for (const k in voices) { const arr = Array.from({ length: bars }, () => []); for (const n of voices[k]) { const b = barOf(n.t); if (b < bars) arr[b].push({ b: n.t - start(b), d: n.d, n: n.n, v: n.v }); } byBar[k] = arr; }
    const ch = P.ch ? P.ch.trim().split(/\s+/).map((bar) => bar.split(',').map((c) => (c === 'r' ? null : absChord(c)))) : null;
    if (ch && ch.length !== bars) errs.push(`accords : ${ch.length} mesures au lieu de ${bars}`);
    const sc = { id, P, m, pk, bars, byBar, ch, errs, start, len: start(bars) };
    if (errs.length) log('score:' + id, 'partition ' + id + ' : ' + errs.join(' ; '));
    SCORES.set(id, sc); return sc;
  }

  // ═══════════════ outils de composition partagés ═══════════════
  // Mélodie en périodes de 8 mesures : motif A (rythme + contour) repris, séquencé (transposé d'un degré), motif B au
  // second membre qui monte vers le sommet, cadences (demi-cadence au milieu, tonique à la fin), appuis sur l'accord.
  // Renvoie par mesure des notes { b, d, n (demi-tons depuis la tonique), v }.
  function genMelody(R, prg, o = EMPTY) {
    const sc = o.scale || SCALE.maj, L = sc.length, meter = o.meter || 4, P = o.phrase || 4;
    const bank = o.bank || RH.pop, cad = o.cad || (meter === 3 ? RH.cad3 : RH.cad4);
    const lo = o.lo ?? 0, hi = o.hi ?? 19, leap = o.leap ?? 0.35;
    const near = (d, ok) => { for (let k = 0; k <= L; k++) { if (ok(relOf(d - k, sc))) return d - k; if (ok(relOf(d + k, sc))) return d + k; } return null; };
    const mk = () => { const r = rhythm(R.pick(bank)); return { r, st: r.map(() => R.wpick([[0, o.rep ?? 1.2], [1, 3], [-1, 3.4], [2, 1.5], [-2, 1.6], [3, 0.5], [-3, 0.6], [4, leap], [-4, leap * 0.8], [7, leap * 0.2]])) }; };
    const A = mk(), B = mk(), second = R.chance(0.55) ? B : A, start = o.start ?? (L === 5 ? 2 : 4), seqShift = R.pick([0, 1, -1, 0, 2]);
    const out = []; let d = start;
    for (let i = 0; i < prg.length; i++) {
      const chs = prg[i], inP = i % P, endP = inP === P - 1, final = i === prg.length - 1 || i % 8 === 7, lift = i % 8 === 4 || i % 8 === 5;
      const chAt = (b) => chs[Math.min(chs.length - 1, Math.floor(b / (meter / chs.length)))];
      if (i % 8 === 0) d = start;
      const mot = endP ? { r: rhythm(R.pick(cad)), st: null } : inP === 0 ? A : inP === 1 ? second : (i % 8 >= 4 && R.chance(0.4) ? B : A);
      if (inP === 2 && !endP) d += seqShift;
      const notes = [];
      mot.r.forEach(([b, dur], k) => {
        if (b >= meter) return;
        const ch = chAt(b), last = k === mot.r.length - 1;
        let st = mot.st ? mot.st[k] : k === 0 ? R.pick([-1, 1, 0, -2, 2]) : R.pick([-1, 1]);
        if (lift && st < 0 && R.chance(0.5)) st = -st;
        const pos = (relOf(d, sc) - lo) / Math.max(1, hi - lo);
        if ((pos > 0.8 && st > 0) || (pos < 0.2 && st < 0)) st = -st;
        d += st;
        const strong = b % (meter === 3 ? 3 : 2) === 0 || dur >= 1.5, chordTone = (rel) => isTone(rel, ch);
        if (endP && last) d = near(d, (rel) => (final ? mod(rel, 12) === 0 : [7, 4, 2].includes(mod(rel, 12))) && isTone(rel, ch)) ?? near(d, chordTone) ?? d;
        else if (strong) d = near(d, chordTone) ?? d;
        while (relOf(d, sc) > hi) d -= L; while (relOf(d, sc) < lo) d += L;
        if (o.rest && !strong && R.chance(o.rest)) return;
        notes.push({ b, d: Math.min(dur, meter - b), n: relOf(d, sc), v: b === 0 ? 0.9 : strong ? 0.8 : 0.68 });
      });
      out.push(notes);
    }
    return out;
  }
  // variation : notes de passage, broderies, anticipations, répétitions (les appuis restent sur l'accord)
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
  // section : progression (o.rep : jouée deux fois), mélodie générée (o.mel), longueur en mesures
  function section(s, str, o = EMPTY) {
    const p = prog(o.rep ? str + ' ' + str : str), sec = { prog: p, len: o.len || p.length, str, o };
    if (o.mel) { sec.melo = { scale: minorish(str) ? (o.minSc || SCALE.dor) : s.sc, meter: s.meter, ...o.mel }; sec.mel = genMelody(s.R, p, sec.melo); }
    return sec;
  }
  // reprise variée d'une mélodie déjà entendue (deuxième couplet, dernier refrain)
  const varied = (s, sec, amt = 0.3) => (sec.mel ? (sec.mv || (sec.mv = vary(s.R, sec.mel, amt, sec.melo.scale))) : null);
  // ── répertoire ──
  function repPiece(s, id, o = EMPTY) {
    const sc = score(id); if (!sc || sc.errs.length) return false;
    s.p.rep = sc; s.p.tp = o.tp ?? 0; s.bpm = sc.P.bpm * (o.tempo ?? 1); s.meter = sc.m; s.key = 60 + s.p.tp; s.sc = SCALE.maj;
    s.secs = { R: { prog: [[parseChord('I')]], len: sc.bars * (o.loops ?? sc.P.loop ?? 1) } }; s.form = ['R'];
    return true;
  }
  // mesure k : chaque voix de la partition → { i (instrument), tr (piste), tp, vel, leg (legato), x } ; renvoie l'index
  // longueur de la mesure k d'un air du répertoire : la levée ne compte que sa durée ; avant une reprise, la dernière
  // mesure est raccourcie d'autant (comme une première fin) pour que la levée tombe en mesure
  function repLen(s, sc, k) { const kk = k % sc.bars; return kk === 0 && sc.pk ? sc.pk : kk === sc.bars - 1 && sc.pk && k < s.secLen - 1 ? sc.m - sc.pk : sc.m; }
  function repBar(s, k, arr) {
    const sc = s.p.rep, kk = k % sc.bars, last = k === s.secLen - 1;
    s.barLen = repLen(s, sc, k);
    for (const v in arr) {
      const a = arr[v], notes = a && sc.byBar[v] ? sc.byBar[v][kk] : null; if (!notes) continue;
      const short = kk !== 0 && s.barLen < sc.m - 1e-6; // fin écourtée avant la reprise
      for (const n of notes) {
        if (short && n.b >= s.barLen - 1e-6) continue;
        const d = short ? Math.min(n.d, s.barLen - n.b) : n.d;
        s.ev(a.tr, a.i, n.b, d * (a.leg ?? 1) * (last && n.b + n.d >= s.barLen - 0.01 ? 1.6 : 1), n.n + s.p.tp + (a.tp ?? 0), n.v * (a.vel ?? 1), a.x || EMPTY);
      }
    }
    s.chords = sc.ch ? sc.ch[kk].map((c) => (c ? { r: c.r, iv: c.iv, bass: c.bass, sym: c.sym } : null)) : [null];
    if (sc.P.accel) s.tempoAt(0, 1 + (sc.P.accel - 1) * (k + 1) / s.secLen, s.barLen);
    if (sc.P.end === 'rit' && k >= s.secLen - 2) s.tempoAt(0, k === s.secLen - 1 ? 0.72 : 0.9, s.barLen);
    return kk;
  }
  const hasChord = (s) => s.chords && s.chords[0];
  const melK = (sec, k) => (sec.mel && sec.mel[k]) || []; // mélodie de la mesure k (vide si la section n'en a pas)
  // seconde voix : la note de l'accord la plus proche sous la mélodie (tierce, quarte ou sixte) — jamais de frottement
  function below(s, rel, b) {
    const c = s.chordAt(b), m = s.key + rel; if (!c) return rel - 4;
    const pcs = c.iv.map((v) => mod(s.key + c.r + v, 12));
    for (let d = 3; d <= 9; d++) if (pcs.includes(mod(m - d, 12))) return rel - d;
    return rel - 5;
  }
  // ── basse « walking » : fondamentale sur l'accord, notes de l'accord, approche chromatique de l'accord suivant ──
  function walk(s, tr, inst, lo, x = EMPTY) {
    const R = s.R, nch = s.chords.length, seg = s.barLen / nch, hi = lo + 15;
    const fit = (n, ref) => { n = nearOct(n, ref); while (n > hi) n -= 12; while (n < lo - 4) n += 12; return n; };
    const pcs = (c) => c.iv.map((v) => mod(s.key + c.r + v, 12));
    let prev = s.p.lastBass ?? s.bassOf(s.chords[0], lo);
    for (let i = 0; i < nch; i++) {
      const ch = s.chords[i] || s.chords[0], b0 = i * seg, L = Math.max(1, Math.round(seg));
      const nx = i + 1 < nch ? (s.chords[i + 1] || ch) : s.nextChord();
      const tones = pcs(ch), isCt = (n) => tones.includes(mod(n, 12));
      let n1 = fit(s.key + ch.bass, prev);
      if (n1 === prev) n1 = fit(s.key + ch.r + (R.chance(0.5) ? ch.iv[2] : ch.iv[1]), prev + 3); // même accord qu'avant : autre note
      const line = [n1];
      if (L >= 2) {
        const T = fit(s.key + nx.bass, n1);
        // approche de la fondamentale suivante : demi-ton dessous / dessus, dominante, ton
        let ap = T + R.wpick([[-1, 3.5], [1, 3], [7, 1.2], [-5, 0.8], [-2, 0.8], [2, 0.7]]); if (ap > hi + 2) ap -= 12; if (ap < lo - 5) ap += 12;
        // notes de passage : candidats (notes de l'accord, neuvième, sixte/quarte, chromatismes), meilleur chemin par coût
        const cand = []; for (let n = lo - 4; n <= hi; n++) { const pc = mod(n - (s.key + ch.r), 12); if (isCt(n) || pc === 2 || pc === (ch.iv[1] === 3 ? 5 : 9)) cand.push(n); }
        const mid = L - 2, cost = (seq) => {
          let c = 0, dirCh = 0, pd = 0;
          for (let k = 1; k < seq.length; k++) { const d = seq[k] - seq[k - 1], ad = Math.abs(d); c += ad === 0 ? 10 : ad <= 2 ? 0 : ad <= 4 ? 0.5 : ad <= 7 ? 1.4 : 4; if (pd && d && Math.sign(d) !== Math.sign(pd)) dirCh++; if (d) pd = d; }
          for (let k = 1; k <= mid; k++) { const n = seq[k]; if (!isCt(n)) c += k === 2 ? 0.7 : 0.25; if (n < lo || n > hi - 2) c += 0.8; }
          return c + dirCh * 0.45 + R() * 0.9;
        };
        let best = null, bc = Infinity;
        if (mid === 0) best = [];
        else if (mid === 1) { for (const m of cand) { const c = cost([n1, m, ap, T]); if (c < bc) { bc = c; best = [m]; } } for (const m of [ap - 1, ap + 1]) { const c = cost([n1, m, ap, T]) + 0.3; if (c < bc) { bc = c; best = [m]; } } }
        else for (const m2 of cand) for (const m3 of cand.concat([ap - 1, ap + 1])) { const c = cost([n1, m2, m3, ap, T]) + (isCt(m3) || Math.abs(m3 - ap) === 1 ? 0 : 0.3); if (c < bc) { bc = c; best = [m2, m3]; } }
        line.push(...best.slice(0, mid)); line.push(ap === line[line.length - 1] ? ap + (R.chance(0.5) ? 1 : -1) : ap);
      }
      line.forEach((n, j) => {
        const b = b0 + j; s.ev(tr, inst, b, 0.9, n, b % 2 ? 0.76 : 0.86, x);
        if (j === line.length - 2 && L >= 3 && R.chance(0.1)) s.ev(tr, inst, b + 2 / 3, 0.2, line[j + 1] + R.pick([0, 1, -1]), 0.32, x); // note fantôme en triolet
      });
      prev = line[line.length - 1];
    }
    s.p.lastBass = prev;
  }

  // ── phrase « bebop » en croches : appuis sur l'accord, notes de passage diatoniques et chromatiques, enclaves ──
  function bebop(s, tr, inst, lo, hi, x = EMPTY, density = 0.75) {
    const R = s.R; let n = s.p.lastSolo ?? s.key + 12, dir = R.chance(0.5) ? 1 : -1;
    const startB = R.chance(0.3) ? R.pick([0.5, 1, 1.5]) : 0, len = R.chance(density) ? 8 : R.int(4, 6);
    for (let i = 0; i < len; i++) {
      const b = startB + i * 0.5; if (b >= s.barLen) break; const ch = s.chordAt(b);
      if (n > hi) dir = -1; else if (n < lo) dir = 1; else if (R.chance(0.2)) dir = -dir;
      let m = n + dir;
      if (i % 2 === 0) { while (!isTone(m - s.key, ch) && Math.abs(m - n) < 6) m += dir; }
      else if (R.chance(0.7)) { while (!SCALE.maj.includes(mod(m - s.key, 12)) && Math.abs(m - n) < 3) m += dir; }
      n = m; s.ev(tr, inst, b, i === len - 1 ? 0.9 : 0.42, n, i % 2 ? 0.6 : 0.74, x);
    }
    s.p.lastSolo = n;
  }
  // roulement de toms / caisse claire sur les deux derniers temps
  function fill(s, kind = 'toms', v = 0.8, from = 2) {
    const n = Math.round((s.barLen - from) * 4);
    for (let i = 0; i < n; i++) { const b = from + i / 4, u = i / Math.max(1, n - 1); if (kind === 'snare') s.hit('snare', b, v * (0.6 + 0.4 * u)); else s.hit(u < 0.34 ? 'htom' : u < 0.67 ? 'tom' : 'ltom', b, v * (0.75 + 0.25 * u)); }
  }
  // accords plaqués (arpégés si gap > 0) sur une piste
  const chord = (s, tr, inst, b, d, notes, v, x = EMPTY, gap = 0.006) => s.strum(tr, inst, b, d, notes, v, x, gap);
  // fin : accord tenu, ralenti, cymbale
  function finale(s, b = 0) { s.tempoAt(b, 0.78, s.barLen * 0.5); }

  // @@COMPOSE@@

  // ═══════════════ styles ═══════════════
  const STYLES = {};
  // ── grooves partagés ──
  // bossa : basse fondamentale/quinte avec anticipation, guitare syncopée sur deux mesures, cross-stick, shaker
  function bossaBass(s, tr, inst, lo, x = EMPTY) {
    const ch = s.chords[0], last = s.chords[s.chords.length - 1], root = s.bassOf(ch, lo), nx = s.bassOf(s.nextChord(), lo);
    s.ev(tr, inst, 0, 1.4, root, 0.86, x); s.ev(tr, inst, 1.5, 0.45, root + 7 - (root + 7 > lo + 14 ? 12 : 0), 0.55, x);
    s.ev(tr, inst, 2, 1.4, s.chords.length > 1 ? s.bassOf(last, lo) : root + 7 - (root + 7 > lo + 14 ? 12 : 0), 0.78, x); s.ev(tr, inst, 3.5, 0.45, nearOct(nx, root) + (s.R.chance(0.5) ? 0 : -1), 0.55, x);
  }
  function bossaComp(s, tr, inst, lo, hi, v = 0.55, x = EMPTY) {
    for (const b of s.barN & 1 ? [0.5, 2, 3.5] : [0, 1.5, 3]) chord(s, tr, inst, b, 0.55, s.vo('g' + tr, s.chordAt(b), lo, 4, { drop2: true, hi }), v * s.R.range(0.9, 1.1), x, 0.008);
  }
  function bossaDrums(s, v = 1) {
    for (let i = 0; i < 16; i++) s.hit('shaker', i / 4, (i % 2 ? 0.3 : 0.5) * v);
    for (const b of s.barN & 1 ? [1, 2.5] : [0, 1.5, 3]) s.hit('rim', b, 0.55 * v);
    s.hit('kick', 0, 0.6 * v); s.hit('kick', 1.5, 0.3 * v); s.hit('kick', 2, 0.5 * v); s.hit('kick', 3.5, 0.3 * v);
  }
  // swing : ride « ding ding-a », charleston au pied sur 2 et 4, grosse caisse « plumée », caisse claire qui commente
  function swingDrums(s, o = EMPTY) {
    const R = s.R, brushes = o.brushes, act = o.act ?? 0.12;
    if (brushes) { s.hit('sweep', 0, 0.45); s.hit('sweep', 2, 0.4); for (const b of [1, 3]) s.hit('brush', b, 0.55); if (R.chance(0.5)) s.hit('brush', 2.5, 0.3); }
    else for (const b of s.barLen === 3 ? [0, 1, 1.5, 2] : [0, 1, 1.5, 2, 3, 3.5]) s.hit('ride', b, b % 1 ? 0.42 : b % 2 ? 0.7 : 0.56);
    for (const b of s.barLen === 3 ? [1, 2] : [1, 3]) s.hit('phat', b, 0.5);
    if (!brushes) for (let b = 0; b < s.barLen; b++) s.hit('kick', b, 0.14);
    for (let i = 0; i < s.barLen * 2; i++) if (R.chance(act)) s.hit('snare', i / 2, R.range(0.15, 0.36));
    if (s.fill && !brushes) { s.hit('snare', s.barLen - 0.5, 0.62); s.hit('kick', s.barLen - 0.5, 0.45); }
    if (s.first && s.fi === 0 && !brushes) s.hit('crash', 0, 0.42);
  }
  // piano jazz : voicings sans fondamentale, rythmes « Charleston » et anticipations
  function jazzComp(s, tr, inst, lo, hi, v = 0.5, sparse = 0) {
    const R = s.R, pats = s.barLen === 3 ? ['1:0.6 2:0.6', '0:0.6 2:0.5', '1.5:0.5'] : ['0:0.6 1.5:0.4', '1.5:0.5 3:0.6', '0.5:0.4 2.5:0.5', '0:0.5 3.5:0.5', '2:0.5 3.5:0.5', '1:0.4 2.5:1', '0:1.5'];
    if (R.chance(sparse)) return;
    for (const [b, d] of rhythm(R.pick(pats))) chord(s, tr, inst, b, d, s.vo('p' + tr, s.chordAt(b), lo, 4, { rootless: true, hi }), v * R.range(0.85, 1.12), EMPTY, 0.004);
  }

  // ── lo-fi hip-hop jazzy (radio du poste : le « lieu sûr ») : Rhodes doux, basse ronde, batterie poussiéreuse,
  //    vibraphone / trompette en sourdine / flûte, bande et vinyle ; fin en arrêt de bande ──
  const LOFI_P = ['ii9 V13 Imaj9 vi9', 'Imaj9 vi9 ii9 V13', 'IVmaj9 iii7 vi9 ii9,V7b9', 'ii9 V9 iii7 VI7b9', 'Imaj7 I7 IVmaj7 iv6', 'vi9 ii9 V13 Imaj9', 'IVmaj9 IVmaj9 iii9 VI7b9', 'bVImaj7 bVII9 Imaj9 Imaj9', 'Imaj9 IVmaj9 Imaj9 IVmaj9', 'ii9 ii9 Imaj9 Imaj9', 'vi9 IVmaj9 ii9 V7sus4'];
  const LOFI_COMP = ['0:3.5', '0:1.5 1.75:2', '0:2.5 2.75:1.25', '0:0.75 1.5:2.5', '0.5:3.5', '0:1.75 2:2', '0:1 2.5:1.5'];
  const LOFI_KICK = ['x.........x.....', 'x.......x.x.....', 'x..x......x.....', 'x.........x..x..', 'x.....x...x.....', 'x..x....x.......'];
  STYLES.lofi = {
    gain: -4.2,
    init(s) {
      s.track('keys', { rev: 0.25, width: 0.6, eq: [['hp1', 117], ['lp1', 4400]], trem: { rate: 3.8, depth: 0.16, stereo: true }, chorus: { rate: 0.35, depth: 0.002, mix: 0.3 } });
      s.track('lead', { pan: 0.2, rev: 0.3, dly: 0.2, eq: [['hp1', 286], ['lp1', 3360]] });
      s.track('bass', { eq: [['hp1', 42], ['lp', 900, 0.7]], comp: { thr: -20, ratio: 4, att: 0.008, rel: 0.12, makeup: 3 } });
      s.track('dr', { eq: [['hp1', 46], ['lp1', 5600]], comp: { thr: -18, ratio: 3.5, att: 0.004, rel: 0.09, makeup: 3 }, rev: 0.05 });
      s.track('hh', { pan: 0.18, eq: [['hp1', 650], ['lp1', 6400]], rev: 0.05 });
      s.bus({ rev: { decay: 0.55, damp: 0.5, size: 0.85, pre: 0.015 }, echo: { time: 0.4, fb: 0.32, lp: 2200, sat: true }, glue: { thr: -16, ratio: 2.5, makeup: 1 }, eq: [['ls', 110, 0.7, 2], ['lp', 9500, 0.6]], sat: { k: 1.4, mix: 0.45 }, wow: { rate: 0.45, cents: 6, frate: 5.5, fcents: 1.8 }, noise: { crackle: 0.035, hiss: 0.0035 } });
    },
    piece(s) {
      const R = s.R; s.bpm = R.int(70, 88); s.key = R.int(60, 67); s.sc = SCALE.maj; s.meter = 4; s.swing = R.range(0.35, 0.6); s.swingUnit = 0.25; s.kit = 'lofi'; s.hum = 0.008;
      const P = R.shuffle(LOFI_P), mel = { scale: SCALE.pmaj, bank: RH.sparse, lo: 2, hi: 16, rest: 0.3, leap: 0.3 };
      s.secs = { I: section(s, P[0], { len: 4 }), A: section(s, P[0], { rep: true, mel }), B: section(s, P[1], { rep: true, mel }), C: section(s, P[2], { rep: true }), O: section(s, P[0], { len: 4 }) };
      s.form = R.pick([['I', 'A', 'B', 'A', 'C', 'B', 'O'], ['I', 'A', 'A', 'B', 'C', 'B', 'O'], ['I', 'B', 'A', 'B', 'C', 'A', 'O']]);
      Object.assign(s.p, { lead: R.pick(['vibes', 'piano', 'trumpet', 'flute', 'rhodes']), kick: R.pick(LOFI_KICK), hat16: R.chance(0.4), gap: 2.4 });
      if (s.echo) s.echo.setTime(60 / s.bpm * 0.75);
    },
    bar(s, sec, k) {
      const R = s.R, name = s.secName, intro = name === 'I', out = name === 'O', brk = name === 'C', chs = s.chords, seg = s.barLen / chs.length;
      for (const [b, d] of rhythm(R.pick(LOFI_COMP))) chord(s, 'keys', 'rhodes', b, d, s.vo('k', s.chordAt(b), 53, 4, { rootless: true, hi: 77 }), R.range(0.38, 0.55) * (intro ? 0.85 : 1), { bright: intro ? 0.55 : 0.85 }, R.range(0.01, 0.025));
      if (!intro) chs.forEach((ch, i) => {
        const b0 = i * seg, root = s.bassOf(ch, 34);
        s.ev('bass', 'ebass', b0, seg * 0.62, root, 0.82, { r: 0.1 });
        if (seg >= 4 && R.chance(0.6)) s.ev('bass', 'ebass', b0 + 2.5, 0.9, root + R.pick([7, 12, ch.iv.includes(10) ? 10 : 7, 7]), 0.6, { r: 0.1 }); // septième mineure seulement si l'accord l'a
        if (seg >= 4 && R.chance(0.4)) s.ev('bass', 'ebass', b0 + 3.5, 0.45, s.bassOf(i + 1 < chs.length ? chs[i + 1] : s.nextChord(), 34) - 1, 0.55, { r: 0.08 });
      });
      if (!intro && !brk && !(out && k >= 2)) {
        s.pat(s.fill && R.chance(0.5) ? 'x...............' : s.p.kick, 'kick', { duck: ['keys'], dd: 0.16 });
        s.pat('....x.......x...', 'snare', { dt: 0.016 }, 0.82);
        for (let i = 1; i < 16; i++) if (i % 4 && R.chance(0.06)) s.hit('snare', i / 4, 0.2, { dt: 0.012 });
        for (let i = 0; i < 16; i += s.p.hat16 ? 1 : 2) s.hit('hat', i / 4, (i % 4 === 0 ? 0.62 : i % 2 ? 0.32 : 0.48) * R.range(0.85, 1.1));
        if (s.fill) s.hit('ohat', 3.5, 0.45);
      } else if (brk) { for (let b = 0; b < 4; b++) s.hit('hat', b + 0.5, 0.32); if (k % 2) s.hit('rim', 3, 0.4); }
      const lead = s.p.lead, lx = lead === 'trumpet' ? { fc: 1700, ft: 3, fq: 1.3, vib: [12, 5, 0.25] } : lead === 'flute' ? { vib: [14, 5.2, 0.2] } : lead === 'vibes' ? { trem: [0.22, 5] } : EMPTY;
      if (sec.mel && !intro && (name === 'B' || s.fi > 2)) s.mel('lead', lead, (name === 'A' && s.fi > 2 ? varied(s, sec) : sec.mel)[k], lx, lead === 'trumpet' || lead === 'flute' ? 0 : 12, 0.72);
      if (out && s.last) s.tapeStop(2, 1.6);
    },
  };
  // ── musique d'ambiance de galerie (régie, TV « shopping ») : bossa douce, guitare nylon, flûte ou vibraphone,
  //    cordes légères ; dernier couplet monté d'un ton (« changement de vitesse »), fin ralentie sur un accord de 9e ──
  const MUZAK_A = ['Imaj7 Imaj7 II7 II7 ii7 bII7 Imaj7 Imaj7', 'Imaj7 vi7 ii7 V7 Imaj7 vi7 ii7 V7', 'IVmaj7 iii7 ii7 V7sus4,V7 Imaj7 vi7 ii7 V7', 'iii7 VI7 ii7 V7 Imaj7 IVmaj7 ii7 V7', 'Imaj7 I6 ii7 V7 iii7 VI7 ii7 V7'];
  const MUZAK_B = ['IVmaj7 IVmaj7 iv6 iv6 iii7 VI7b9 ii7 V7', 'vi7 vi7 II7 II7 ii7 ii7 V7 V7', 'IVmaj7 V7 iii7 vi7 ii7 V7 Imaj7 Imaj7', 'ii7 V7 Imaj7 VI7 ii7 V7 Imaj7 V7sus4'];
  STYLES.muzak = {
    gain: -3.5,
    init(s) {
      s.track('gtr', { pan: -0.35, rev: 0.18, eq: [['hp1', 143], ['pk', 2500, 1, 1.5]] });
      s.track('keys', { pan: 0.25, rev: 0.25, width: 0.5, eq: [['hp1', 156]], trem: { rate: 4.5, depth: 0.12, stereo: true } });
      s.track('lead', { pan: 0.1, rev: 0.32, dly: 0.12, eq: [['hp1', 260]] });
      s.track('pad', { rev: 0.4, width: 0.8, eq: [['hp1', 260], ['lp1', 4000]], chorus: { mix: 0.3 } });
      s.track('bass', { eq: [['lp', 1500, 0.7]], comp: { thr: -20, ratio: 3, att: 0.003, makeup: 3 } });
      s.track('dr', { rev: 0.1, eq: [['lp1', 7200]] }); s.track('hh', { pan: 0.3, rev: 0.08, eq: [['hp1', 520]] });
      s.bus({ rev: { decay: 0.6, damp: 0.45, size: 1, pre: 0.02 }, echo: { time: 0.45, fb: 0.25, lp: 3000 }, glue: { thr: -16, ratio: 2 }, eq: [['hs', 8000, 0.7, -1.5]] });
    },
    piece(s) {
      const R = s.R; s.bpm = R.int(94, 110); s.key = R.pick([60, 65, 62, 63, 67, 58]); s.sc = SCALE.maj; s.meter = 4; s.swing = 0.1; s.kit = 'soft'; s.hum = 0.007;
      const mel = { bank: RH.lyric, lo: 4, hi: 21, leap: 0.3, rep: 1 };
      s.secs = { I: section(s, 'ii7 V7 ii7 V7', { len: 4 }), A: section(s, R.pick(MUZAK_A), { mel }), B: section(s, R.pick(MUZAK_B), { mel: { ...mel, bank: RH.pop } }), O: section(s, 'Imaj7 Imaj7', { len: 2 }) };
      s.secs.Z = { ...s.secs.A, up: R.pick([1, 2]) }; s.form = ['I', 'A', 'A', 'B', 'Z', 'O'];
      Object.assign(s.p, { lead: R.pick(['flute', 'sax', 'vibes', 'clarinet']), keys: R.pick(['rhodes', 'vibes', 'piano']), gap: 2 });
      if (s.echo) s.echo.setTime(60 / s.bpm * 0.75);
    },
    bar(s, sec, k) {
      const R = s.R, name = s.secName, ch = s.chords[0], p = s.p;
      if (sec.up && k === 0) s.key += sec.up;
      const full = name === 'B' || name === 'Z', out = name === 'O';
      if (out) {
        if (k === 0) { s.tempoAt(0, 0.85, 4); bossaComp(s, 'gtr', 'nylon', 50, 72, 0.5); s.ev('bass', 'upright', 0, 2, s.bassOf(ch, 36), 0.8); }
        else { chord(s, 'gtr', 'nylon', 0, 4, s.vo('ggtr', ch, 50, 4, { drop2: true }), 0.6, EMPTY, 0.05); s.ev('bass', 'upright', 0, 4, s.bassOf(ch, 36), 0.8); chord(s, 'keys', 'vibes', 0, 4, s.vo('k', parseChord('Imaj9'), 62, 5).map((n) => n + 12), 0.45, { trem: [0.25, 4.5] }, 0.09); s.tempoAt(0, 0.7, 2); }
        return;
      }
      bossaComp(s, 'gtr', 'nylon', 50, 72, R.range(0.5, 0.6));
      bossaBass(s, 'bass', 'upright', 36);
      bossaDrums(s, name === 'I' ? 0.7 : 1);
      if (full || (name === 'A' && s.fi > 1)) chord(s, 'keys', p.keys, 0, 3.8, s.vo('k', ch, 57, 4, { rootless: true, hi: 76 }), 0.4, p.keys === 'vibes' ? { trem: [0.2, 4.5] } : EMPTY, 0.01);
      if (full) for (const n of s.vo('pad', ch, 60, 3)) s.ev('pad', 'strings', 0, 3.9, n, 0.42, { a: 0.4, r: 0.6 });
      if (sec.mel && name !== 'I') {
        const lx = p.lead === 'flute' || p.lead === 'sax' || p.lead === 'clarinet' ? { vib: [12, 5.2, 0.25] } : { trem: [0.22, 4.5] };
        s.mel('lead', p.lead, (name === 'Z' ? varied(s, sec, 0.25) : sec.mel)[k], lx, p.lead === 'vibes' ? 12 : 0, 0.82);
        if (name === 'Z') s.mel('lead', 'glock', sec.mel[k], EMPTY, 24, 0.3);
      }
      if (s.fill && name !== 'I' && R.chance(0.5)) s.hit('shaker', 3.75, 0.6);
    },
  };
  // ── jazz (radio, vinyle « Jazz de minuit ») : trio + sax ou trompette ; swing, ballade aux balais, bossa, valse,
  //    blues ; thème, chorus improvisés, reprise du thème, coda ii–V–I et accord final ──
  const JAZZ_A = ['Imaj7 vi7 ii7 V7 iii7 VI7 ii7 V7', 'Imaj7 VI7b9 ii7 V7 Imaj7 I7 IVmaj7 #ivo7', 'ii7 V7 Imaj7 Imaj7 ii7 V7 Imaj7 VI7b9', 'Imaj7 Imaj7 ii7 V7 iii7 biiio7 ii7 V7', 'vi7 II7 ii7 V7 Imaj7 vi7 ii7 V7'];
  const JAZZ_B = ['III7 III7 VI7 VI7 II7 II7 V7 V7', 'iii7 VI7 ii7 V7 iii7 VI7 ii7 V7', 'IVmaj7 iv7 iii7 VI7 ii7 V7 Imaj7 V7', 'v7 I7 IVmaj7 IVmaj7 iv7 bVII7 Imaj7 VI7b9'];
  const BLUES = 'I7 IV7 I7 v7,I7 IV7 #ivo7 I7 VI7b9 ii7 V7 I7,VI7 ii7,V7';
  STYLES.jazz = {
    gain: -3.6,
    init(s) {
      s.track('pno', { pan: 0.15, rev: 0.18, width: 0.75, eq: [['hp1', 78]] });
      s.track('bass', { pan: -0.05, rev: 0.06, eq: [['hp1', 46], ['pk', 700, 1, 2], ['lp1', 2800]], comp: { thr: -20, ratio: 3, att: 0.003, makeup: 3.5 } });
      s.track('dr', { db: 3, pan: -0.15, rev: 0.12, eq: [['hp1', 52]] }); s.track('hh', { db: 6, pan: 0.25, rev: 0.14, eq: [['hp1', 390]] });
      s.track('horn', { pan: -0.2, rev: 0.22, eq: [['hp1', 156], ['pk', 2500, 1, 1.5]] });
      s.bus({ rev: { decay: 0.52, damp: 0.45, size: 0.9, pre: 0.012 }, glue: { thr: -18, ratio: 2 }, eq: [['hs', 9000, 0.7, -1]] });
    },
    piece(s) {
      const R = s.R, p = s.p; p.sub = R.wpick([['swing', 5], ['ballad', 2], ['bossa', 1.6], ['waltz', 1], ['blues', 1.8]]);
      p.horn = R.wpick([['sax', 4], ['trumpet', 2.5], ['', 2]]); p.gap = 2.5; s.key = R.pick([65, 58, 63, 60, 67, 62]); s.sc = SCALE.maj; s.kit = 'jazz'; s.hum = 0.008;
      const sw = { bank: RH.swing, lo: 5, hi: 21, leap: 0.4 };
      if (p.sub === 'ballad') { s.bpm = R.int(56, 70); s.meter = 4; s.swing = 0.5; s.swingUnit = 0.5; const A = R.pick(JAZZ_A), B = R.pick(JAZZ_B); s.secs = { I: section(s, 'ii7 V7', { len: 2 }), A: section(s, A, { mel: { ...sw, bank: RH.lyric } }), B: section(s, B, { mel: { ...sw, bank: RH.lyric } }), S: section(s, A), O: section(s, 'ii7 V7 Imaj7 Imaj7') }; s.form = ['I', 'A', 'A', 'B', 'A', 'S', 'B', 'A', 'O']; }
      else if (p.sub === 'bossa') { s.bpm = R.int(118, 138); s.meter = 4; s.swing = 0; const A = R.pick(JAZZ_A), B = R.pick(JAZZ_B); s.secs = { I: section(s, 'ii7 V7 ii7 V7', { len: 4 }), A: section(s, A, { mel: { ...sw, bank: RH.lyric } }), B: section(s, B, { mel: { ...sw, bank: RH.pop } }), S: section(s, A + ' ' + B), O: section(s, 'ii7 V7 Imaj7 Imaj7') }; s.form = ['I', 'A', 'B', 'A', 'S', 'A', 'B', 'O']; }
      else if (p.sub === 'waltz') { s.bpm = R.int(140, 168); s.meter = 3; s.swing = 0.6; s.swingUnit = 0.5; const A = R.pick(JAZZ_A); s.secs = { I: section(s, 'ii7 V7 ii7 V7', { len: 4 }), A: section(s, A, { rep: true, mel: { ...sw, bank: RH.waltz } }), S: section(s, A, { rep: true }), O: section(s, 'ii7 V7 Imaj7 Imaj7') }; s.form = ['I', 'A', 'S', 'A', 'O']; }
      else if (p.sub === 'blues') { s.bpm = R.int(110, 150); s.meter = 4; s.swing = 0.75; s.swingUnit = 0.5; s.secs = { I: section(s, 'ii7 V7 ii7 V7', { len: 4 }), A: section(s, BLUES, { mel: { ...sw, scale: SCALE.mix } }), S: section(s, BLUES), O: section(s, 'ii7 V7 I7 I7') }; s.form = ['I', 'A', 'A', 'S', 'S', 'S', 'A', 'O']; }
      else { s.bpm = R.int(120, 186); s.meter = 4; s.swing = 0.72; s.swingUnit = 0.5; const A = R.pick(JAZZ_A), B = R.pick(JAZZ_B); s.secs = { I: section(s, A.split(' ').slice(4).join(' '), { len: 4 }), A: section(s, A, { mel: sw }), B: section(s, B, { mel: sw }), S: section(s, A + ' ' + A + ' ' + B + ' ' + A), O: section(s, 'iii7 VI7 ii7 V7 iii7 VI7 ii7 V7 Imaj7 Imaj7') }; s.form = ['I', 'A', 'A', 'B', 'A', 'S', 'S', 'A', 'B', 'A', 'O']; }
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, name = s.secName, sub = p.sub, solo = name === 'S', out = name === 'O', ch = s.chords[0];
      const hx = p.horn === 'sax' ? { vib: [14, 5.4, 0.3], pe: -30 } : { vib: [10, 5.8, 0.3], pe: -40 };
      if (out && s.last) { // accord final tenu (point d'orgue), cymbale
        chord(s, 'pno', 'piano', 0, 4, s.vo('ppno', ch, 52, 5), 0.6, { ped: 2 }, 0.03); s.ev('bass', 'upright', 0, 4, s.bassOf(ch, 36), 0.85);
        if (p.horn) s.ev('horn', p.horn, 0, 4, s.key + (p.horn === 'sax' ? 4 : 16), 0.7, hx);
        s.hit(sub === 'ballad' ? 'sweep' : 'ride', 0, 0.6); s.hit('crash', 0, 0.35); s.hit('kick', 0, 0.5); finale(s); return;
      }
      const nS = s.form.slice(0, s.fi).filter((x) => x === 'S').length, soloist = solo ? (p.horn && nS % 2 === 0 ? p.horn : 'pno') : null;
      // basse
      if (sub === 'bossa') bossaBass(s, 'bass', 'upright', 36);
      else if (sub === 'ballad' && !solo) s.chords.forEach((c, i) => { const seg = s.barLen / s.chords.length, r = s.bassOf(c, 36); s.ev('bass', 'upright', i * seg, seg * 0.9, r, 0.82); if (seg >= 4) s.ev('bass', 'upright', i * seg + 2, 1.8, r + 7 - (r + 7 > 50 ? 12 : 0), 0.66); });
      else walk(s, 'bass', 'upright', 36);
      // batterie
      if (sub === 'bossa') bossaDrums(s, 0.9);
      else swingDrums(s, { brushes: sub === 'ballad', act: solo ? 0.2 : 0.1 });
      // piano
      if (soloist !== 'pno') jazzComp(s, 'pno', 'piano', 50, 72, sub === 'ballad' ? 0.42 : 0.5, sub === 'ballad' ? 0.3 : 0.08);
      else jazzComp(s, 'pno', 'piano', 48, 64, 0.38, 0.35);
      // thème / improvisation
      if (sec.mel && !solo && !out) {
        const notes = (s.fi > 4 ? varied(s, sec) : sec.mel)[k];
        if (p.horn) s.mel('horn', p.horn, notes, hx, p.horn === 'sax' ? -12 : 0, 0.85, 0.92); else s.mel('pno', 'piano', notes, EMPTY, 12, 0.85);
      }
      if (soloist) bebop(s, soloist === 'pno' ? 'pno' : 'horn', soloist === 'pno' ? 'piano' : soloist, s.key + (soloist === 'sax' ? -5 : 7), s.key + (soloist === 'sax' ? 14 : 26), soloist === 'pno' ? EMPTY : hx, sub === 'ballad' ? 0.5 : 0.78);
      if (out && R.chance(0.5)) bebop(s, 'pno', 'piano', s.key + 12, s.key + 26, EMPTY, 0.5);
    },
  };
  // ── disco (vinyle « Disco Fever 78 », chaîne musicale, régie) : quatre temps, basse en octaves, charleston ouvert,
  //    guitare funky étouffée, cordes (stabs et longues phrases), cuivres, fondu de fin comme sur un 45 tours ──
  const DISCO_P = ['i7 i7 iv7 iv7', 'i7 IV7 i7 IV7', 'ii7 V7 Imaj7 vi7', 'vi7 ii7 V7 Imaj7', 'i7 bVII bVI V7', 'Imaj7 iii7 vi7 V7sus4', 'IVmaj7 iii7 ii7 Imaj7', 'i9 i9 bVII9 bVII9'];
  STYLES.disco = {
    gain: -6.3,
    init(s) {
      s.track('dr', { db: 2.5, comp: { thr: -16, ratio: 3, att: 0.003, rel: 0.08, makeup: 2 }, rev: 0.06 }); s.track('hh', { db: 6, pan: 0.28, eq: [['hp1', 600]], rev: 0.06 });
      s.track('bass', { eq: [['hp1', 40], ['lp', 2500, 0.7]], comp: { thr: -18, ratio: 4, att: 0.006, rel: 0.1, makeup: 3 } });
      s.track('gtr', { pan: -0.4, eq: [['hp1', 500], ['pk', 2200, 1, 3]], rev: 0.1 });
      s.track('str', { pan: 0.2, width: 0.9, rev: 0.32, eq: [['hp1', 200]], chorus: { mix: 0.25 } });
      s.track('brass', { pan: -0.15, rev: 0.2, eq: [['hp1', 180]] });
      s.track('keys', { pan: 0.35, rev: 0.15, eq: [['hp1', 150]] });
      s.track('lead', { pan: 0.05, rev: 0.25, dly: 0.12 });
      s.bus({ rev: { decay: 0.55, damp: 0.4, size: 1, pre: 0.02 }, echo: { time: 0.375, fb: 0.25, lp: 3500, pp: true }, glue: { thr: -15, ratio: 2.5, makeup: 1 }, eq: [['ls', 90, 0.7, 1.5], ['hs', 9000, 0.7, 1]] });
    },
    piece(s) {
      const R = s.R; s.bpm = R.int(116, 126); s.key = R.pick([57, 62, 64, 55, 60, 65]); s.sc = SCALE.maj; s.meter = 4; s.kit = 'disco'; s.hum = 0.004; s.swing = 0;
      const P = R.shuffle(DISCO_P), mel = { bank: RH.pop, lo: 0, hi: 17 };
      s.secs = { I: section(s, P[0], { rep: true }), A: section(s, P[0], { rep: true }), B: section(s, P[1], { rep: true, mel }), C: section(s, P[2], { rep: true }), O: section(s, P[1], { rep: true, mel }) };
      s.form = ['I', 'A', 'B', 'A', 'B', 'C', 'B', 'O'];
      Object.assign(s.p, { lead: R.pick(['strings', 'flute', 'strmachine']), keys: R.pick(['rhodes', 'piano', 'organ_soft']), gtrPat: R.pick(['x.xxx.x.x.xxx.x.', '.xx.x.xx.xx.x.xx', 'x.x.xx.xx.x.xx.x']), gap: 1 });
      if (s.echo) s.echo.setTime(60 / s.bpm * 0.75);
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, name = s.secName, chs = s.chords, seg = 4 / chs.length, intro = name === 'I', brk = name === 'C', full = name === 'B' || name === 'O';
      if (name === 'O' && k === 0) s.fadeOut(0, s.secLen * 4);
      // batterie : 4 temps, caisse claire + clap sur 2 et 4, charleston ouvert sur les contretemps
      if (!(brk && k < 4)) {
        s.pat('x...x...x...x...', 'kick'); if (!intro || k >= 2) { s.pat('....x.......x...', 'snare', EMPTY, 0.78); s.pat('....x.......x...', 'clap', EMPTY, 0.5); }
        s.pat('..o...o...o...o.', 'ohat'); s.pat('h.g.h.g.h.g.h.g.', 'hat', EMPTY, 0.85);
      } else { s.pat('x...x...x...x...', 'kick', EMPTY, 0.9); if (k >= 2) for (let i = 0; i < 16; i++) s.hit('hat', i / 4, i % 2 ? 0.3 : 0.5); }
      if (s.first && !intro) s.hit('crash', 0, 0.6);
      if (s.fill && !intro) [1.3, 1.15, 1, 0.85].forEach((pp, i) => s.hit('syn', 3 + i * 0.25, 0.6, { p: pp }));
      // basse en octaves
      if (!(brk && k < 2)) chs.forEach((ch, i) => { const r = s.bassOf(ch, 33); for (let j = 0; j < seg * 2; j++) s.ev('bass', 'ebass', i * seg + j * 0.5, 0.4, r + (j % 2 ? 12 : 0) + (j === seg * 2 - 1 && R.chance(0.3) ? -2 : 0), j % 2 ? 0.7 : 0.9, { r: 0.05 }); });
      if (intro || (brk && k < 4)) return;
      // guitare : accords étouffés en doubles croches
      const gv = s.vo('g', chs[0], 64, 3).slice(1);
      for (let i = 0; i < 16; i++) if (p.gtrPat[i] === 'x') chord(s, 'gtr', 'eclean', i / 4, 0.1, gv, i % 4 === 2 ? 0.62 : 0.42, { r: 0.03 }, 0.003);
      // clavier : accords sur les temps
      if (name !== 'B') for (const b of [0, 2]) chord(s, 'keys', p.keys, b + 0.5, 0.4, s.vo('k', s.chordAt(b), 57, 4, { rootless: true }), 0.45);
      // cordes : stabs au couplet, nappe + mélodie au refrain, glissando montant avant le refrain
      if (name === 'A') { for (const b of [1.5, 3.5]) for (const n of s.vo('s', s.chordAt(b), 65, 3)) s.ev('str', 'strings', b, 0.25, n, 0.7, { r: 0.12 }); }
      else if (full || brk) { for (const n of s.vo('s', chs[0], 62, 3)) s.ev('str', 'strings', 0, 3.85, n, 0.42, { a: 0.25, r: 0.4 }); }
      if (sec.mel && full) { s.mel('lead', p.lead, sec.mel[k], p.lead === 'flute' ? { vib: [14, 5.2, 0.2] } : { vib: [10, 5.5, 0.15] }, 12, 0.8); if (k % 4 === 3) for (const n of s.vo('b', chs[0], 62, 3)) s.ev('brass', 'trumpet', 3.5, 0.3, n, 0.85, { pe: -40 }); }
      if (s.fill && name === 'A') for (let i = 0; i < 8; i++) s.ev('str', 'strings', 2 + i * 0.25, 0.24, s.key + 12 + relOf(i, s.sc), 0.4 + i * 0.05, { r: 0.08 });
      if (name === 'B' && k % 2 === 1) for (const b of [0.5, 1.5]) for (const n of s.vo('b', chs[0], 62, 3)) s.ev('brass', 'trumpet', b, 0.2, n, 0.75, { pe: -30 });
    },
  };
  // ── rock (radio, vinyle, baladeur) : guitares saturées doublées gauche/droite, basse au médiator, batterie avec
  //    prise de salle, riff, couplet en notes étouffées, refrain en accords ouverts, solo, fin sur un accord qui sonne ──
  const ROCK_P = ['I bVII IV I', 'I V vi IV', 'vi IV I V', 'i bVI bVII i', 'I IV bVII IV', 'i bVII bVI bVII', 'I bIII IV I', 'i iv bVI bVII', 'I IV vi V'];
  STYLES.rock = {
    gain: -10.2,
    init(s) {
      const amp = { gain: 9, cab: 4600, tight: 110, mid: 800, midG: 3, out: 0.5 };
      s.track('gL', { pan: -0.8, drive: amp, rev: 0.06 }); s.track('gR', { pan: 0.8, drive: { ...amp, cab: 4300, mid: 700 }, rev: 0.06 });
      s.track('lead', { pan: 0.12, drive: { gain: 14, cab: 4800, mid: 900, midG: 5, out: 0.42 }, rev: 0.18, dly: 0.22 });
      s.track('bass', { eq: [['hp1', 40], ['pk', 800, 1, 2], ['lp', 3500, 0.7]], comp: { thr: -18, ratio: 4, att: 0.005, rel: 0.1, makeup: 3 } });
      s.track('dr', { db: 3, comp: { thr: -14, ratio: 3, att: 0.004, rel: 0.12, makeup: 2 }, rev: 0.1 }); s.track('hh', { db: 3, pan: 0.25, eq: [['hp1', 500]], rev: 0.08 });
      s.track('keys', { pan: -0.25, leslie: { fast: false }, rev: 0.15, eq: [['hp1', 120]] });
      s.bus({ rev: { decay: 0.45, damp: 0.4, size: 0.8, pre: 0.01 }, echo: { time: 0.4, fb: 0.28, lp: 3000 }, glue: { thr: -14, ratio: 3, att: 0.01, makeup: 1.5 }, eq: [['ls', 100, 0.7, 1.5], ['pk', 350, 1, -1.5], ['hs', 8000, 0.7, 1]] });
    },
    piece(s) {
      const R = s.R, p = s.p; p.sub = R.wpick([['classic', 5], ['punk', 2], ['ballad', 1.6]]);
      s.key = R.pick([64, 69, 62, 67, 57]); s.sc = SCALE.maj; s.meter = 4; s.kit = 'rock'; s.hum = 0.005; s.swing = 0;
      s.bpm = p.sub === 'punk' ? R.int(160, 184) : p.sub === 'ballad' ? R.int(68, 80) : R.int(112, 140);
      const P = R.shuffle(ROCK_P), minor = minorish(P[0]);
      s.secs = { I: section(s, P[0], { len: 4 }), A: section(s, P[0], { rep: true, mel: { bank: RH.pop, lo: 0, hi: 14, scale: minor ? SCALE.pmin : SCALE.pmaj } }), B: section(s, P[1], { rep: true, mel: { bank: RH.lyric, lo: 4, hi: 17, scale: minor ? SCALE.min : SCALE.maj } }), S: section(s, P[2], { rep: true, mel: { scale: SCALE.pmin, bank: RH.busy, lo: 3, hi: 22, leap: 0.3 } }), O: section(s, P[1], { len: 4 }) };
      s.form = p.sub === 'punk' ? ['I', 'A', 'B', 'A', 'B', 'S', 'B', 'O'] : ['I', 'A', 'B', 'A', 'B', 'S', 'B', 'B', 'O'];
      p.riff = R.pick(['x.x.x.xxx.x.x.x.', 'x..x..x.x..x..x.', 'x.xx.xx.x.xx.x.x', 'x...x.x.x...x.xx']); p.organ = R.chance(0.4); p.gap = 2;
      if (s.echo) s.echo.setTime(60 / s.bpm * 0.75);
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, name = s.secName, chs = s.chords, seg = 4 / chs.length, ballad = p.sub === 'ballad', chorus = name === 'B', solo = name === 'S';
      if (name === 'O' && s.last) { // accord final : guitares qui sonnent, roulement, cymbales
        const r = s.bassOf(chs[0], 40);
        for (const [t, off] of [['gL', 0], ['gR', 0.01]]) s.ev(t, 'power', 0, 4, r, 0.95, { dt: off });
        s.ev('bass', 'pbass', 0, 4, r - 12, 0.95); s.hit('crash', 0, 0.9); s.hit('kick', 0, 1); fill(s, 'toms', 0.8, 1); s.hit('crash', 3.75, 0.8); finale(s); return;
      }
      // guitares rythmiques (doublées) et basse
      chs.forEach((ch, i) => {
        const r = s.bassOf(ch, 40);
        for (let j = 0; j < seg * 2; j++) {
          const b = i * seg + j * 0.5, acc = j === 0 || (chorus && j % 2 === 0), riffHit = p.riff[Math.round(b * 4) % 16] === 'x';
          if (ballad && !chorus) { if (j % 2 === 0) for (const [t, d] of [['gL', 0], ['gR', 0.008]]) { const vv = s.vo('c' + t, ch, 52, 4); s.ev(t, 'eclean', b, 0.9, vv[(j / 2) % vv.length], 0.6, { dt: d }); } }
          else if (chorus || name === 'O') { if (j % 2 === 0) for (const [t, d] of [['gL', 0], ['gR', 0.012]]) s.ev(t, 'power', b, 0.95, r, acc ? 0.95 : 0.8, { dt: d, r: 0.08 }); }
          else if (name === 'I' || name === 'A' || solo) { if (riffHit || name !== 'I') for (const [t, d] of [['gL', 0], ['gR', 0.01]]) s.ev(t, acc ? 'power' : 'powpm', b, acc ? 0.45 : 0.3, r, acc ? 0.95 : 0.75, { dt: d, r: 0.04 }); }
          if (!(ballad && !chorus && j % 2)) s.ev('bass', 'pbass', b, ballad && !chorus ? 0.95 : 0.42, r - 12, acc ? 0.95 : 0.8, { r: 0.04 });
        }
      });
      // batterie
      if (name !== 'I' || k >= 2) {
        if (ballad && !chorus) { s.pat('x.......x.x.....', 'kick'); s.pat('....x.......x...', 'snare', EMPTY, 0.75); s.pat('x.x.x.x.x.x.x.x.', 'hat', EMPTY, 0.6); }
        else {
          s.pat(chorus ? 'x.x...x.x.x...x.' : p.sub === 'punk' ? 'x...x...x...x...' : 'x.......x.x.....', 'kick'); s.pat('....x.......x...', 'snare');
          if (chorus || solo) s.pat('x.x.x.x.x.x.x.x.', 'ride', EMPTY, 0.8); else s.pat(p.sub === 'punk' ? 'xxxxxxxxxxxxxxxx' : 'x.o.x.o.x.o.x.o.', 'hat', EMPTY, 0.8);
        }
      }
      if (s.first && name !== 'I') s.hit('crash', 0, 0.85);
      if (s.fill && name !== 'O') fill(s, R.chance(0.5) ? 'toms' : 'snare', 0.8, R.pick([2, 3]));
      // orgue (Leslie) au refrain, chant de guitare au couplet, solo
      if (p.organ && chorus) for (const n of s.vo('o', chs[0], 55, 4)) s.ev('keys', 'organ', 0, 3.9, n, 0.55);
      if (sec.mel && name === 'B') s.mel('lead', 'elec', sec.mel[k], { vib: [18, 5.5, 0.2], r: 0.15 }, 12, 0.7);
      if (sec.mel && solo) s.mel('lead', 'elec', sec.mel[k], { vib: [25, 5.8, 0.15], pe: R.chance(0.3) ? -150 : 0, pet: 0.06, r: 0.12 }, 12, 0.85);
    },
  };
  // ── classique (radio, régie, vinyle « Valses de Vienne ») : programme de pièces — répertoire du domaine public
  //    (Bach, Pachelbel, Petzold, Beethoven, Grieg, Greensleeves) et pièces originales (valse viennoise, invention à
  //    deux voix, nocturne, choral) ; salle de concert ──
  const CLASSIC_REP = ['bach_prelude', 'canon', 'menuet_sol', 'fur_elise', 'ode_joie', 'greensleeves', 'roi_montagne'];
  STYLES.classical = {
    gain: -3.6,
    init(s) {
      s.track('pno', { rev: 0.3, width: 0.8, eq: [['hp1', 45]] });
      s.track('vn1', { pan: -0.45, rev: 0.32, width: 0.3 }); s.track('vn2', { pan: 0.35, rev: 0.32, width: 0.3 }); s.track('vla', { pan: 0.15, rev: 0.32 }); s.track('vc', { pan: 0.4, rev: 0.3 });
      s.track('cb', { pan: 0.25, rev: 0.25, eq: [['lp', 2500, 0.7]], comp: { thr: -22, ratio: 3, att: 0.002, rel: 0.12, makeup: 2 } }); s.track('hpd', { pan: -0.1, rev: 0.25, width: 0.6, eq: [['hp1', 120]] });
      s.track('ww', { pan: -0.1, rev: 0.32 }); s.track('br', { pan: 0.1, rev: 0.35 }); s.track('perc', { pan: 0, rev: 0.3 }); s.track('harp', { pan: -0.3, rev: 0.32, width: 0.7 });
      s.bus({ rev: { decay: 0.78, damp: 0.42, size: 1.25, pre: 0.025, bw: 0.7 }, glue: { thr: -20, ratio: 1.8, att: 0.03, rel: 0.3 }, eq: [['hs', 9000, 0.7, -1]] });
    },
    piece(s, n) {
      const R = s.R, p = s.p; s.kit = 'orch'; s.hum = 0.01; s.humV = 0.06; s.swing = 0;
      if (!s.prog) { s.prog = R.shuffle([...CLASSIC_REP, 'valse', 'valse', 'invention', 'nocturne', 'choral']); if (s.o.seed !== undefined && s.o.seed !== null) s.prog.unshift('valse'); } // la platine « Valses de Vienne » commence par une valse
      const id = s.prog[n % s.prog.length]; p.id = id; p.gap = 3;
      if (s.R && REP[id] && repPiece(s, id)) return;
      s.key = R.pick([62, 60, 65, 67, 64, 58]); s.sc = SCALE.maj;
      if (id === 'valse') { s.meter = 3; s.bpm = R.int(150, 172); const mel = { bank: RH.waltz, lo: 4, hi: 19, leap: 0.45, phrase: 4 }; s.secs = { I: section(s, 'V7 V7 V7 V7', { len: 4 }), A: section(s, R.pick(['I I V7 V7 V7 V7 I I', 'I I I V7 V7 V7 V7 I']), { rep: true, mel }), B: section(s, R.pick(['IV IV I I V7 V7 I I', 'vi vi ii ii V7 V7 I I']), { rep: true, mel }), O: section(s, 'V7 I', { len: 2 }) }; s.form = ['I', 'A', 'B', 'A', 'O']; }
      else if (id === 'invention') { s.meter = 4; s.bpm = R.int(84, 100); const g = R.pick(['I IV vii iii vi ii V I', 'i iv bVII bIII bVI iiø V i', 'I vi ii V I IV V I']); if (g[0] === 'i' && g[1] === ' ') s.sc = SCALE.harm; s.secs = { A: section(s, g), O: section(s, 'V I', { len: 2 }) }; s.form = ['A', 'A', 'A', 'O']; p.motif = R.pick([[0, 1, 2, 0, 4, 2, 1, 0], [0, 2, 4, 2, 7, 4, 2, 4], [4, 3, 2, 1, 0, 1, 2, 4], [0, 4, 2, 4, 0, 4, 2, 4]]); }
      else if (id === 'nocturne') { s.meter = 4; s.bpm = R.int(54, 64); const mel = { bank: RH.lyric, lo: 7, hi: 22, leap: 0.45 }; s.secs = { A: section(s, R.pick(['I vi IV V7 I iii IV V7', 'I I7 IV iv I vi ii7 V7']), { mel }), B: section(s, 'vi iii IV I ii7 V7 I V7', { mel }), O: section(s, 'IV iv I I', { len: 4 }) }; s.form = ['A', 'B', 'A', 'O']; }
      else { s.meter = 4; s.bpm = R.int(52, 62); s.secs = { A: section(s, R.pick(['I IV V I vi ii V I', 'I V vi iii IV I ii,V I'])), O: section(s, 'IV I', { len: 2 }) }; s.form = ['A', 'A', 'O']; }
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, id = p.id;
      if (p.rep) {
        if (id === 'bach_prelude' || id === 'fur_elise') repBar(s, k, { all: { i: 'piano', tr: 'pno', x: { ped: id === 'bach_prelude' ? 0.6 : 0 } }, rh: { i: 'piano', tr: 'pno' }, lh: { i: 'piano', tr: 'pno', vel: 0.85 } });
        else if (id === 'canon') { repBar(s, k, { bass: { i: 'cello', tr: 'vc', vel: 0.8, x: { a: 0.05, r: 0.2, vib: [10, 5, 0.3] } }, v1: { i: 'violin', tr: 'vn1', x: { a: 0.06, r: 0.3, vib: [16, 5.4, 0.25] } }, v2: { i: 'violin', tr: 'vn2', vel: 0.92, x: { a: 0.06, r: 0.3, vib: [16, 5.1, 0.25] } }, v3: { i: 'violin', tr: 'vla', tp: -12, vel: 0.85, x: { a: 0.06, r: 0.3, vib: [14, 5.6, 0.25] } } }); if (hasChord(s)) s.chords.forEach((c, i) => { if (c) chord(s, 'hpd', 'harpsi', i, 0.9, s.vo('h', c, 55, 3), 0.42, EMPTY, 0.02); }); }
        else if (id === 'menuet_sol') repBar(s, k, { mel: { i: 'harpsi', tr: 'hpd' }, bass: { i: 'harpsi', tr: 'hpd', vel: 0.85 } });
        else if (id === 'ode_joie') { repBar(s, k, { mel: { i: k >= 8 ? 'trumpet' : 'strings', tr: k >= 8 ? 'br' : 'vn1', vel: 0.9, x: { a: 0.04, r: 0.2 } } }); orch(s, k >= 8 ? 1 : 0.6); }
        else if (id === 'greensleeves') { repBar(s, k, { mel: { i: k >= 17 ? 'violin' : 'flute', tr: 'ww', x: { vib: [14, 5.2, 0.25], a: 0.03 } } }); if (hasChord(s)) { const c = s.chords[0]; [0, 1, 2].forEach((b) => s.ev('harp', 'harp', b, 1, s.vo('hp', c, 50, 3)[b], 0.5)); s.ev('cb', 'pizz', 0, 1, s.bassOf(c, 36), 0.7); } }
        else if (id === 'roi_montagne') { const loop = Math.floor(k / 4), x = { r: 0.08 }; repBar(s, k, { mel: { i: loop < 2 ? 'pizz' : loop < 4 ? 'strings' : 'trumpet', tr: loop < 2 ? 'vc' : 'vn1', tp: loop < 1 ? -12 : 0, vel: 0.6 + loop * 0.07, x, leg: loop < 2 ? 0.6 : 0.85 } }); if (loop >= 1) s.ev('cb', 'pizz', 0, 0.5, 35, 0.8); s.ev('cb', 'pizz', 2, 0.5, 42, 0.7); if (loop >= 3) s.ev('perc', 'timpani', 0, 1.5, 47, 0.5 + loop * 0.05); if (loop >= 4) s.ev('br', 'horn', 0, 3.8, 47, 0.7); if (s.last) { s.ev('br', 'trumpet', 0, 4, 59, 0.9); s.ev('cb', 'pizz', 0, 2, 35, 1); s.hit('cym', 0, 0.8); } }
        return;
      }
      const ch = s.chords[0];
      if (id === 'valse') { // valse viennoise : basse sur 1, accords sur 2 et 3 (le 2 un peu en avance), mélodie aux violons
        if (s.secName === 'O' && s.last) { s.ev('cb', 'pizz', 0, 1, s.bassOf(ch, 36), 0.9); for (const n of s.vo('v', ch, 60, 4)) s.ev('vn2', 'strings', 0, 2.5, n, 0.8, { a: 0.02 }); s.ev('vn1', 'violin', 0, 2.5, s.key + 12, 0.85, { vib: [18, 5.5, 0.2] }); s.hit('cym', 0, 0.5); finale(s); return; }
        s.ev('cb', 'pizz', 0, 0.9, s.bassOf(ch, 36) + (k % 2 && s.secName !== 'I' ? 7 : 0), 0.85); s.ev('vc', 'cello', 0, 0.9, s.bassOf(ch, 48), 0.55, { a: 0.03, r: 0.15 });
        for (const b of [0.92, 2]) for (const n of s.vo('v', ch, 57, 3)) s.ev('vla', 'strings', b, 0.45, n, 0.5, { a: 0.01, r: 0.1, tight: true });
        if (sec.mel) { s.mel('vn1', 'violin', sec.mel[k], { vib: [18, 5.5, 0.2], a: 0.04, r: 0.25 }, 12, 0.85); if (s.fi >= 3) s.mel('ww', 'flute', sec.mel[k], { vib: [12, 5, 0.25] }, 24, 0.45); }
        if (s.secName === 'B' && k % 4 === 3) s.ev('br', 'horn', 0, 2.8, s.key + ch.r + 7 - 12, 0.6, { a: 0.08 });
        if (s.first && s.secName !== 'I') s.tempoAt(0, 0.93, 0.5), s.tempoAt(0.5, 1, 2.5); // le « hésitation » viennoise
        return;
      }
      if (id === 'invention') { // invention à deux voix (clavecin) : motif à la main droite, imitation à la basse
        const sc = s.sc, d0 = degOf(ch.r, sc);
        if (s.secName === 'O') { if (s.last) { chord(s, 'hpd', 'harpsi', 0, 4, s.vo('h', ch, 48, 4), 0.7, EMPTY, 0.04); finale(s); } else { p.motif.forEach((m, i) => s.ev('hpd', 'harpsi', i * 0.5, 0.45, s.key + 12 + relOf(d0 + m, sc), 0.6)); s.ev('hpd', 'harpsi', 0, 2, s.bassOf(ch, 40), 0.6); } return; }
        p.motif.forEach((m, i) => { for (const h of [0, 1]) s.ev('hpd', 'harpsi', i * 0.5 + h * 0.25, 0.24, s.key + 12 + relOf(d0 + m + (h ? (i % 2 ? -1 : 1) : 0), sc), h ? 0.5 : 0.62); });
        const r = s.bassOf(ch, 40); (s.fi % 2 ? p.motif.slice(0, 4) : [0, 4, 7, 4]).forEach((m, i) => s.ev('hpd', 'harpsi', i, 0.9, s.fi % 2 ? s.key + relOf(d0 + m, sc) - 12 : r + [0, 7, 12, 7][i], 0.55));
        return;
      }
      if (id === 'nocturne') { // main gauche en arpèges larges (pédale), mélodie chantante, rubato
        if (s.secName === 'O' && s.last) { chord(s, 'pno', 'piano', 0, 4, [s.bassOf(ch, 36), ...s.vo('n', ch, 55, 4)], 0.5, { ped: 2 }, 0.08); finale(s); return; }
        const r = s.bassOf(ch, 36), t = ch.iv; [0, 7, t[1] + 12, 12, t[1] + 12, 7].forEach((iv, j) => s.ev('pno', 'piano', j * 0.666, 1.4, r + iv, j ? 0.36 : 0.5, { ped: 0.8 }));
        if (sec.mel) for (const nn of sec.mel[k]) s.ev('pno', 'piano', nn.b, nn.d, s.key + nn.n + 12, nn.v * 0.72, { ped: 0.3 });
        s.tempoAt(0, k % 4 === 3 ? 0.88 : R.range(0.96, 1.04), 4);
        return;
      }
      // choral pour cordes : quatre voix, conduite des voix
      const v = s.vo('c', ch, 52, 4), dur = s.secName === 'O' && s.last ? 4 : 1.95;
      for (let h = 0; h < (s.secName === 'O' && s.last ? 1 : 2); h++) { const c2 = h ? s.chordAt(2) : ch, vv = h ? s.vo('c', c2, 52, 4) : v; s.ev('cb', 'strings_lo', h * 2, dur, s.bassOf(c2, 36), 0.6, { a: 0.15, r: 0.5 }); vv.forEach((nn, i) => s.ev(['vc', 'vla', 'vn2', 'vn1'][i], i < 2 ? 'strings_lo' : 'strings', h * 2, dur, nn + (i === 3 ? 12 : 0), 0.5 + i * 0.05, { a: 0.18, r: 0.6 })); }
      if (s.secName === 'O' && s.last) finale(s);
    },
  };
  // ── synthwave (baladeur, vinyle « Néon 1986 », cassette de science-fiction) : arpèges en doubles croches au filtre
  //    qui s'ouvre, nappes chorusées, basse analogique, lead en dents de scie avec portamento, caisse claire « gated » ──
  STYLES.synthwave = {
    gain: -5.2,
    init(s) {
      s.track('arp', { pan: 0.25, rev: 0.22, dly: 0.28, eq: [['hp1', 180]] });
      s.track('pad', { rev: 0.4, width: 0.9, chorus: { rate: 0.45, depth: 0.0035, mix: 0.45 }, eq: [['hp1', 220], ['lp', 5200, 0.7]] });
      s.track('bass', { eq: [['hp1', 38]], comp: { thr: -18, ratio: 4, att: 0.004, rel: 0.1, makeup: 3 } });
      s.track('lead', { pan: -0.12, rev: 0.3, dly: 0.3, eq: [['hp1', 250]] });
      s.track('dr', { comp: { thr: -15, ratio: 3, att: 0.003, rel: 0.1, makeup: 2 }, rev: 0.1 }); s.track('hh', { db: 5, pan: 0.22, eq: [['hp1', 700]], rev: 0.05 });
      s.bus({ rev: { decay: 0.72, damp: 0.3, size: 1.2, pre: 0.02 }, echo: { time: 0.375, fb: 0.38, lp: 3200, pp: true }, glue: { thr: -15, ratio: 2.5, makeup: 1 }, eq: [['ls', 80, 0.7, 2], ['hs', 9500, 0.7, 1.5]] });
    },
    piece(s) {
      const R = s.R; s.bpm = R.int(92, 118); s.key = R.pick([57, 64, 66, 62, 60, 59]); s.sc = SCALE.min; s.meter = 4; s.kit = 'e808'; s.hum = 0.003; s.swing = 0;
      const P = R.shuffle(['i bVI bIII bVII', 'i bVII bVI bVII', 'bVI bVII i i', 'i iv bVI bVII', 'i bIII bVII iv', 'i bVI iv bVII', 'bVI bIII bVII i']), mel = { scale: SCALE.min, bank: RH.lyric, lo: 0, hi: 15, leap: 0.4 };
      s.secs = { I: section(s, P[0], { len: 8 }), A: section(s, P[0], { rep: true }), B: section(s, P[1], { rep: true, mel, minSc: SCALE.min }), C: section(s, P[2], { rep: true }), O: section(s, P[0], { len: 8 }) };
      s.form = ['I', 'A', 'B', 'C', 'B', 'O'];
      Object.assign(s.p, { arp: R.pick([[0, 1, 2, 3, 2, 1], [0, 1, 2, 3], [0, 2, 1, 3, 2, 4], [0, 1, 2, 4, 3, 2, 1, 2]]), bassPat: R.pick(['x.x.x.x.x.x.x.x.', '.x.x.x.x.x.x.x.x', 'x.xxx.xxx.xxx.xx']), gap: 2 });
      if (s.echo) s.echo.setTime(60 / s.bpm * 0.75);
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, name = s.secName, ch = s.chords[0], intro = name === 'I', out = name === 'O', brk = name === 'C', B = name === 'B';
      if (out && k === 2) s.fadeOut(0, (s.secLen - 2) * 4);
      const tones = s.vo('a', ch, 57, 3), arp = [...tones, ...tones.map((n) => n + 12)], open = intro ? 0.35 + 0.65 * k / s.secLen : out ? 1 - 0.5 * k / s.secLen : 1;
      for (let i = 0; i < 16; i++) s.ev('arp', 'arp', i / 4, 0.22, arp[p.arp[i % p.arp.length] % arp.length], i % 4 ? 0.55 : 0.75, { fc: 2.4 * open, fe: 12 * open, tight: true });
      if (!intro || k >= 4) for (const n of s.vo('p', ch, 55, 4)) s.ev('pad', 'pad', 0, 3.9, n, 0.55, { a: 0.35, r: 0.8 });
      if (intro || out) return;
      if (!brk || k >= 4) { const r = s.bassOf(ch, 33); for (let i = 0; i < 16; i++) if (p.bassPat[i] === 'x') s.ev('bass', 'synbass', i / 4, 0.22, r + (i === 14 && R.chance(0.4) ? 12 : 0), i % 4 ? 0.7 : 0.9, { tight: true }); }
      if (!brk) {
        s.pat(R.chance(0.75) ? 'x...x...x...x...' : 'x.....x.x.......', 'kick', { duck: ['pad', 'bass'], dd: 0.3 });
        s.pat('....x.......x...', 'gsnare'); s.pat(B ? 'x.x.x.x.x.x.x.xo' : 'x.x.x.x.x.x.x.x.', 'hat', EMPTY, 0.7);
        if (s.fill) [1.4, 1.2, 1, 0.8].forEach((pp, i) => s.hit('tom', 3 + i * 0.25, 0.75, { p: pp }));
        if (s.first) s.hit('crash', 0, 0.55);
      } else if (k >= 4) { s.pat('x.......x.......', 'kick'); s.pat('........x.......', 'clap', EMPTY, 0.7); }
      if (B && sec.mel) { let prev = p.lastLead; for (const n of sec.mel[k]) { const m = s.key + n.n + 12; s.ev('lead', 'sawlead', n.b, n.d * 0.97, m, n.v * 0.82, { gl: prev && Math.abs(prev - m) < 8 ? prev : undefined, glt: 0.07 }); prev = m; } p.lastLead = prev; }
    },
  };
  // ── funk (vinyle « Funky Galerie », cassette kung-fu) : batterie serrée et notes fantômes, basse slap syncopée,
  //    clavinet wah, guitare « chicken scratch », section de cuivres ──
  STYLES.funk = {
    gain: -7.2,
    init(s) {
      s.track('bass', { eq: [['hp1', 38]], comp: { thr: -18, ratio: 4, att: 0.003, rel: 0.08, makeup: 3 } });
      s.track('clav', { db: -4.5, pan: -0.35, wah: { lo: 450, hi: 2600, q: 3, sens: 5 }, eq: [['hp1', 180]], rev: 0.08 });
      s.track('gtr', { db: -1.5, pan: 0.4, eq: [['hp1', 400], ['pk', 2500, 1, 3]], comp: { thr: -24, ratio: 4, att: 0.001, rel: 0.05, makeup: 2 }, rev: 0.06 });
      s.track('horn', { pan: 0.15, rev: 0.18, eq: [['hp1', 160]] });
      s.track('keys', { pan: -0.15, rev: 0.12, leslie: { fast: true } });
      s.track('dr', { db: 2, comp: { thr: -16, ratio: 3.5, att: 0.003, rel: 0.08, makeup: 2.5 }, rev: 0.06 }); s.track('hh', { db: 3, pan: 0.3, eq: [['hp1', 600]] });
      s.bus({ rev: { decay: 0.4, damp: 0.45, size: 0.75, pre: 0.008 }, glue: { thr: -15, ratio: 3, att: 0.006, makeup: 1.5 }, eq: [['ls', 90, 0.7, 2], ['hs', 8500, 0.7, 1.5]] });
    },
    piece(s) {
      const R = s.R; s.bpm = R.int(96, 112); s.key = R.pick([64, 57, 62, 67, 65]); s.sc = SCALE.mix; s.meter = 4; s.kit = 'funk'; s.swing = R.range(0.1, 0.25); s.swingUnit = 0.25; s.hum = 0.004;
      s.secs = { I: section(s, 'I9', { len: 2 }), A: section(s, R.pick(['I9 I9 I9 I9', 'i7 i7 IV9 IV9', 'I9 IV9 I9 IV9', 'i9 i9 i9 bVII9'])), B: section(s, R.pick(['IV9 IV9 I9 I9 V9 IV9 I9 V7#9', 'IV9 IV9 I9 I9 bVII9 bVII9 V7#9 V7#9']), { mel: { scale: SCALE.pmin, bank: RH.synco, lo: 0, hi: 14 } }), C: section(s, 'I9 I9 I9 I9'), O: section(s, 'I9', { len: 1 }) };
      s.form = ['I', 'A', 'A', 'B', 'A', 'C', 'B', 'A', 'O'];
      Object.assign(s.p, { bpat: R.pick(['R..xO.R.x.Rx.O.7', 'R.xR.O.x5.R.O.xR', 'R..R.xO..R.x7.O.', 'R.x.O.xRR..xO.5.']), cpat: R.pick(['x.gx.g.xg.x.gx.g', '.x.xg.x..x.xg.x.', 'x..xg.x.x..xg.xg']), gpat: R.pick(['.x.x.x.x.x.x.x.x', 'x.xx.xx.x.xx.xx.']), kpat: R.pick(['x.....x...x.....', 'x..x......x..x..', 'x.....x..x.x....']), gap: 1.5 });
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, name = s.secName, ch = s.chords[0];
      if (name === 'O') { const r = s.bassOf(ch, 28); s.ev('bass', 'slap', 0, 2, r, 1); for (const n of s.vo('h', ch, 62, 3)) s.ev('horn', 'trumpet', 0, 1.5, n, 0.95, { pe: -40 }); chord(s, 'clav', 'clav', 0, 0.5, s.vo('c', ch, 60, 3), 0.9); s.hit('crash', 0, 0.85); s.hit('kick', 0, 1); s.hit('snare', 0, 0.9); return; }
      if (name === 'I') { s.pat('x.x.x.x.xxxxxxxx', 'snare', EMPTY, 0.7); s.pat('x...x...x.x.x.x.', 'kick'); return; }
      const brk = name === 'C';
      for (let i = 0; i < 16; i++) {
        const c = p.bpat[i], b = i / 4, rr = s.bassOf(s.chordAt(b), 28);
        if (c === 'R') s.ev('bass', 'slap', b, 0.22, rr, 0.95, { r: 0.04 }); else if (c === 'O') s.ev('bass', 'slap', b, 0.15, rr + 12, 0.85, { r: 0.03 });
        else if (c === 'x') s.ev('bass', 'slap', b, 0.04, rr, 0.35, { r: 0.015, bright: 0.4 }); else if (c === '5' || c === '7') s.ev('bass', 'slap', b, 0.2, rr + (c === '5' ? 7 : 10), 0.75, { r: 0.04 });
      }
      s.pat(p.kpat, 'kick'); s.pat('....x..g.g..x..g', 'snare', EMPTY, 0.9); s.pat('xhxhxhxhxhxhxhx.', 'hat', EMPTY, 0.7); s.hit('ohat', 3.75, 0.5);
      if (s.fill) { s.hit('snare', 3.5, 0.8); s.hit('snare', 3.75, 0.9); }
      if (brk && k < 2) return;
      const cv = s.vo('c', ch, 60, 3, { rootless: true });
      for (let i = 0; i < 16; i++) { const c = p.cpat[i]; if (c === 'x') chord(s, 'clav', 'clav', i / 4, 0.18, cv, 0.75, { r: 0.03 }, 0.003); else if (c === 'g') s.ev('clav', 'clav', i / 4, 0.08, cv[R.int(0, cv.length - 1)], 0.35, { r: 0.02 }); }
      const gv = s.vo('g', ch, 64, 3); for (let i = 0; i < 16; i++) if (p.gpat[i] === 'x') chord(s, 'gtr', 'eclean', i / 4, 0.06, gv, i % 4 === 2 ? 0.7 : 0.4, { r: 0.015, bright: i % 4 === 2 ? 1 : 0.6 }, 0.002);
      if (name === 'B' && sec.mel) { s.mel('horn', 'trumpet', sec.mel[k], { pe: -35, r: 0.08 }, 12, 0.88, 0.85); s.mel('horn', 'sax', sec.mel[k].map((n) => ({ ...n, n: below(s, n.n, n.b) })), { r: 0.08 }, 0, 0.7, 0.85); }
      else if (R.chance(0.55)) { const b = R.pick([0.75, 2.5, 3.75, 1.75]); for (const n of s.vo('h', ch, 62, 3, { hi: 76 })) s.ev('horn', 'trumpet', b, 0.22, n, 0.85, { pe: -30, r: 0.06 }); }
      if (name === 'A' && s.fi >= 4) for (const n of s.vo('o', ch, 55, 3)) s.ev('keys', 'organ', 0, 3.8, n, 0.4);
    },
  };
  // ── chanson française rétro (radio, autoradio, karaoké, vinyle « Chansons d'hier ») : valse musette (accordéon,
  //    guitare « pompe », contrebasse, balais), java, ballade (piano, accordéon, cordes), swing manouche ──
  STYLES.chanson = {
    gain: -5.6,
    init(s) {
      s.track('acc', { pan: 0.12, rev: 0.2, eq: [['hp1', 150], ['pk', 1300, 1, 1.5]] });
      s.track('gtr', { pan: -0.3, rev: 0.15, eq: [['hp1', 120]] }); s.track('bass', { pan: -0.05, rev: 0.1, eq: [['lp', 2500, 0.7]], comp: { thr: -18, ratio: 3, makeup: 2 } });
      s.track('pno', { pan: -0.1, rev: 0.25, width: 0.7 }); s.track('str', { pan: 0.25, rev: 0.35, width: 0.8, eq: [['hp1', 200]] }); s.track('vln', { pan: 0.3, rev: 0.25 });
      s.track('dr', { pan: -0.2, rev: 0.12 });
      s.bus({ rev: { decay: 0.5, damp: 0.5, size: 0.9, pre: 0.012 }, glue: { thr: -17, ratio: 2 }, eq: [['hs', 7500, 0.7, -2]], sat: { k: 1.2, mix: 0.3 }, wow: { rate: 0.4, cents: 2.5, frate: 6, fcents: 1 } });
    },
    piece(s) {
      const R = s.R, p = s.p; p.sub = R.wpick([['valse', 4], ['java', 1.5], ['ballade', 2], ['swing', 1.6]]); s.key = R.pick([69, 62, 67, 64, 65, 60]); s.sc = SCALE.harm; s.kit = 'soft'; s.hum = 0.008; s.swing = 0;
      const waltz = p.sub === 'valse' || p.sub === 'java'; s.meter = waltz ? 3 : 4;
      s.bpm = p.sub === 'valse' ? R.int(160, 184) : p.sub === 'java' ? R.int(126, 144) : p.sub === 'ballade' ? R.int(64, 78) : R.int(170, 200);
      if (p.sub === 'swing') { s.swing = 0.7; s.swingUnit = 0.5; }
      const mel = { bank: waltz ? RH.waltz : p.sub === 'swing' ? RH.swing : RH.lyric, lo: 0, hi: 17, leap: 0.4, rep: 1, phrase: 4 };
      s.secs = { I: section(s, waltz ? 'V7 V7 V7 V7' : 'iv V7', { len: waltz ? 4 : 2 }), A: section(s, R.pick(['i i iv i V7 V7 i i', 'i i V7 V7 V7 V7 i i', 'i iv V7 i iv i V7 i', 'i VI iv V7 i iv V7 i']), { mel, minSc: SCALE.harm }), B: section(s, R.pick(['bIII bIII bVII7 bVII7 bIII bIII V7 V7', 'iv iv i i V7 V7 i V7', 'VI VI iv iv V7 V7 i i']), { mel: { ...mel, scale: SCALE.min } }), O: section(s, 'V7 i', { len: 2 }) };
      s.form = ['I', 'A', 'A', 'B', 'A', 'B', 'A', 'O']; p.lead = p.sub === 'ballade' ? R.pick(['accordion', 'violin']) : p.sub === 'swing' ? R.pick(['violin', 'accordion']) : 'accordion'; p.gap = 2;
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, name = s.secName, ch = s.chords[0], waltz = s.meter === 3, lx = p.lead === 'violin' ? { vib: [22, 5.6, 0.18], a: 0.04, r: 0.2 } : { a: 0.02, r: 0.08 };
      if (name === 'O' && s.last) { const r = s.bassOf(ch, 36); s.ev('bass', 'upright', 0, s.barLen, r, 0.9); chord(s, waltz || p.sub === 'swing' ? 'gtr' : 'pno', waltz || p.sub === 'swing' ? 'nylon' : 'piano', 0, s.barLen, s.vo('g', ch, 52, 4), 0.7, EMPTY, 0.03); s.ev('acc', p.lead, 0, s.barLen, s.key + 12, 0.8, lx); s.hit('brush', 0, 0.5); finale(s); return; }
      const r = s.bassOf(ch, 36) + (k % 2 && name !== 'I' ? 7 : 0), cv = s.vo('c', ch, 55, 3);
      if (waltz) { // valse : basse sur 1, accord sur 2 et 3 (guitare et accordéon main gauche), balais
        s.ev('bass', 'upright', 0, 0.9, r - (r > 43 ? 12 : 0), 0.85); s.ev('acc', 'accordion', 0, 0.8, r, 0.45, { a: 0.01, r: 0.06 });
        for (const b of [1, 2]) { chord(s, 'gtr', 'nylon', b, 0.35, cv, 0.5, { r: 0.05 }, 0.008); for (const n of cv) s.ev('acc', 'accordion', b, 0.3, n, 0.32, { a: 0.008, r: 0.05 }); }
        s.hit('brush', 1, 0.4); s.hit('brush', 2, 0.35);
        if (p.sub === 'valse' && s.fill && s.fi % 2) s.tempoAt(2, 0.86, 0.5); else if (s.first) s.tempoAt(0, 1);
      } else if (p.sub === 'swing') { // pompe manouche : basse sur 1 et 3, accord bref sur 2 et 4 (guitare)
        walk(s, 'bass', 'upright', 36);
        for (let b = 0; b < 4; b++) chord(s, 'gtr', 'nylon', b, b % 2 ? 0.18 : 0.3, s.vo('g', s.chordAt(b), 52, 4), b % 2 ? 0.7 : 0.5, { r: 0.03 }, 0.006);
        s.hit('brush', 1, 0.45); s.hit('brush', 3, 0.45);
      } else { // ballade : piano en arpèges, cordes tenues
        const t = ch.iv; [0, 7, t[1] + 12, 7].forEach((iv, j) => s.ev('pno', 'piano', j, 1.6, s.bassOf(ch, 36) + iv, j ? 0.4 : 0.55, { ped: 0.5 }));
        if (name !== 'I') for (const n of s.vo('s', ch, 60, 3)) s.ev('str', 'strings', 0, 3.9, n, 0.38, { a: 0.4, r: 0.6 });
        s.ev('bass', 'upright', 0, 1.8, s.bassOf(ch, 36), 0.7); s.ev('bass', 'upright', 2, 1.8, s.bassOf(ch, 36) + 7 - 12, 0.6);
      }
      for (const n of (sec.mel && name !== 'I' ? (s.fi > 3 ? varied(s, sec) : sec.mel)[k] : null) || []) {
        if (p.lead === 'accordion' && n.d >= 1 && R.chance(0.3)) s.ev('acc', 'accordion', n.b, 0.1, s.key + n.n + 11, n.v * 0.6, { dt: -0.04, r: 0.03 }); // appogiature chromatique
        s.ev(p.lead === 'violin' ? 'vln' : 'acc', p.lead, n.b, n.d * 0.92, s.key + n.n + 12, n.v * 0.85, lx);
      }
    },
  };
  // ── reggae (vinyle « Soleil Reggae ») : one-drop, skank sur les contretemps, « bubble » d'orgue, basse profonde,
  //    mélodica, échos dub ──
  STYLES.reggae = {
    gain: -3.4,
    init(s) {
      s.track('skank', { pan: 0.3, eq: [['hp1', 900]], comp: { thr: -22, ratio: 3, att: 0.002, rel: 0.06, makeup: 2 }, rev: 0.1, dly: 0.25 }); s.track('org', { pan: -0.3, eq: [['hp1', 200], ['lp', 3000, 0.7]], rev: 0.1 });
      s.track('bass', { db: 2, eq: [['hp1', 35], ['lp', 650, 0.7]], comp: { thr: -20, ratio: 4, att: 0.01, rel: 0.15, makeup: 3 } });
      s.track('dr', { rev: 0.1, comp: { thr: -16, ratio: 3, makeup: 2 } }); s.track('hh', { db: 8, pan: 0.25, eq: [['hp1', 600]] }); s.track('dub', { pan: -0.15, dly: 0.6, rev: 0.2 });
      s.track('mel', { pan: 0.15, rev: 0.2, dly: 0.35, eq: [['hp1', 300]] });
      s.bus({ rev: { decay: 0.55, damp: 0.5, size: 0.9 }, echo: { time: 0.5, fb: 0.45, lp: 2000, sat: true }, glue: { thr: -16, ratio: 2.5 }, eq: [['ls', 100, 0.7, 2]] });
    },
    piece(s) {
      const R = s.R; s.bpm = R.int(66, 80); s.key = R.pick([67, 69, 60, 62, 64]); s.sc = SCALE.maj; s.meter = 4; s.kit = 'std'; s.swing = R.range(0.2, 0.4); s.swingUnit = 0.25; s.hum = 0.006;
      const A = R.pick(['I IV I IV', 'i iv i iv', 'I V vi IV', 'i bVII i bVII', 'I IV V IV', 'I ii I ii']);
      s.secs = { I: section(s, A, { len: 4 }), A: section(s, A, { rep: true }), B: section(s, R.pick(['IV I V I', 'iv i bVI bVII', 'ii V ii V', 'vi IV I V']), { rep: true, mel: { bank: RH.lyric, lo: 2, hi: 17, scale: SCALE.pmaj }, minSc: SCALE.pmin }), C: section(s, A, { rep: true }), O: section(s, A, { len: 4 }) };
      s.form = ['I', 'A', 'B', 'A', 'B', 'C', 'B', 'O'];
      s.p.riff = R.pick(['..r-r.f-t---f.r.', 'r---..r-f-t-s-o-', '..t-r---f-..r-a-', 'r-.r..f-t-f-r---']); s.p.gap = 2;
      if (s.echo) s.echo.setTime(60 / s.bpm * 0.75);
    },
    bar(s, sec, k) {
      const R = s.R, name = s.secName, ch = s.chords[0], dubbing = name === 'C', cv = s.vo('s', ch, 62, 3);
      if (name === 'O' && k === 0) s.fadeOut(0, 16);
      if (!dubbing || k % 2) for (const b of [1, 3]) { chord(s, 'skank', 'eclean', b, 0.16, cv, 0.65, { r: 0.03 }, 0.005); if (R.chance(0.3)) chord(s, 'skank', 'eclean', b + 0.5, 0.1, cv, 0.4, { r: 0.02 }, 0.004); }
      if (!dubbing) for (const b of [0.5, 1.5, 2.5, 3.5]) chord(s, 'org', 'organ_soft', b, 0.22, s.vo('o', s.chordAt(b), 55, 3), 0.42, { r: 0.04 }, 0);
      const rp = s.p.riff, r = s.bassOf(ch, 33);
      if (name !== 'I' || k >= 2) for (let i = 0; i < 16; i++) {
        const c = rp[i]; if (c === '.' || c === '-') continue; let len = 1; while (i + len < 16 && rp[i + len] === '-') len++;
        const iv = c === 'r' ? 0 : c === 't' ? ch.iv[1] : c === 'f' ? 7 : c === 'o' ? 12 : c === 's' ? (ch.iv[1] === 3 || ch.iv.includes(10) ? 10 : 9) : -1; // septième sur accord mineur ou de dominante, sixte sinon
        s.ev('bass', 'ebass', i / 4, len / 4 * 0.95, c === 'a' ? s.bassOf(s.nextChord(), 33) - 1 : r + iv, 0.9, { r: 0.06 });
      }
      s.hit('kick', 2, 0.9); s.hit('rim', 2, 0.75, { tr: 'dub' });
      for (let i = 0; i < 8; i++) s.hit('hat', i / 2, i % 2 ? 0.35 : 0.5);
      if (s.fill) for (let i = 0; i < 3; i++) s.hit('snare', 3 + i / 3, 0.4 + i * 0.15, { tr: 'dub', sw: 0 });
      if (dubbing && k % 4 === 3) s.fx(2, (S) => { if (S.echo) S.echo.fb = 0.62; }), s.fx(3.9, (S) => { if (S.echo) S.echo.fb = 0.45; });
      if (name === 'B' && sec.mel) s.mel('mel', 'melodica', sec.mel[k], { vib: [10, 5, 0.3] }, 12, 0.85);
    },
  };
  // ── metal (vinyle « Acier Hurlant ») : riffs en doubles croches étouffées, accents en quintes, double pédale,
  //    solos harmonisés à la tierce, pont en demi-tempo, accord final ──
  STYLES.metal = {
    gain: -10.7,
    init(s) {
      const amp = { gain: 22, cab: 4200, tight: 140, mid: 700, midG: -2, out: 0.42 };
      s.track('gL', { pan: -0.85, drive: amp }); s.track('gR', { pan: 0.85, drive: { ...amp, cab: 4000 } });
      s.track('lead', { pan: 0.1, drive: { gain: 26, cab: 4600, mid: 900, midG: 4, out: 0.38 }, rev: 0.15, dly: 0.2 });
      s.track('bass', { eq: [['hp1', 40], ['pk', 900, 1, 3], ['lp', 3000, 0.7]], sat: { k: 2.2, mix: 0.8 }, comp: { thr: -16, ratio: 4, makeup: 2 } }); // grain de basse saturée sans ampli suréchantillonné
      s.track('dr', { db: 3.5, comp: { thr: -14, ratio: 4, att: 0.002, rel: 0.08, makeup: 2.5 }, rev: 0.08 }); s.track('hh', { db: 5, pan: 0.3, eq: [['hp1', 800]] });
      s.bus({ rev: { decay: 0.4, damp: 0.45, size: 0.8 }, echo: { time: 0.36, fb: 0.25, lp: 3000 }, glue: { thr: -13, ratio: 3, att: 0.008, makeup: 1 }, eq: [['ls', 90, 0.7, 2], ['pk', 400, 1, -2], ['hs', 7000, 0.7, 1.5]] });
    },
    piece(s) {
      const R = s.R; s.bpm = R.int(150, 186); s.key = R.pick([52, 50, 49, 52]); s.sc = SCALE.min; s.meter = 4; s.kit = 'metal'; s.hum = 0.003; s.swing = 0;
      const P = R.shuffle(['i i bVI bVII', 'i bII i bVII', 'i bVI bIII bVII', 'i i iv bII', 'i bVII bVI V']);
      s.secs = { I: section(s, P[0], { len: 4 }), A: section(s, P[0], { rep: true }), B: section(s, P[1], { rep: true, mel: { scale: SCALE.harm, bank: RH.lyric, lo: 12, hi: 27 }, minSc: SCALE.harm }), C: section(s, P[2], { rep: true }), S: section(s, P[3], { rep: true, mel: { scale: SCALE.harm, bank: RH.busy, lo: 12, hi: 29, leap: 0.3 }, minSc: SCALE.harm }), O: section(s, 'i', { len: 1 }) };
      s.form = ['I', 'A', 'B', 'A', 'B', 'C', 'S', 'B', 'O'];
      Object.assign(s.p, { riff: R.pick(['m.mmA.m.mmA.mmb.', 'mmmmA...mmmmb...', 'm.m.A.m.m.f.A.m.', 'mmA.mmA.mmb.mmA.', 'm.mmm.mmA.A.b...']), gap: 2.5 });
      if (s.echo) s.echo.setTime(60 / s.bpm * 0.75);
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, name = s.secName, B = name === 'B', C = name === 'C', S = name === 'S', two = (b, d, inst, n, v) => { s.ev('gL', inst, b, d, n, v, { r: 0.04 }); s.ev('gR', inst, b, d, n, v, { r: 0.04, dt: 0.009 }); };
      if (name === 'O') { const r = s.bassOf(s.chords[0], 38); two(0, 4, 'power', r, 1); s.ev('bass', 'pbass', 0, 4, r - 12, 1); s.hit('crash', 0, 1); s.hit('kick', 0, 1); s.hit('crash', 0.02, 0.8, { pan: 0.5 }); finale(s); return; }
      s.chords.forEach((ch, ci) => {
        const seg = 4 / s.chords.length, r = s.bassOf(ch, 38);
        if (B) { two(ci * seg, seg * 0.95, 'power', r, 0.95); for (let i = 0; i < seg * 4; i++) s.ev('bass', 'pbass', ci * seg + i / 4, 0.22, r - 12, 0.85, { r: 0.03 }); return; }
        for (let i = 0; i < seg * 4; i++) {
          const c = C ? 'm.mm'[i % 4] : p.riff[(ci * seg * 4 + i) % 16], b = ci * seg + i / 4; if (c === '.') continue;
          const n = c === 'm' ? s.bassOf(s.chords[0], 38) : r + (c === 'b' ? 1 : c === 'f' ? 6 : 0);
          two(b, c === 'm' ? 0.22 : 0.45, c === 'm' ? 'powpm' : 'power', n, c === 'm' ? 0.8 : 1);
          s.ev('bass', 'pbass', b, 0.22, n - 12, 0.85, { r: 0.03 });
        }
      });
      if (B) { s.pat('xxxxxxxxxxxxxxxx', 'kick', { cut: 0.16 }, 0.85); s.pat('....X.......X...', 'snare'); s.pat('x.x.x.x.x.x.x.x.', 'crash', EMPTY, 0.4); }
      else if (C) { s.pat('x.......x.x.....', 'kick'); s.pat('........x.......', 'snare'); s.pat('x...x...x...x...', 'ride', EMPTY, 0.7); }
      else if (S) { s.pat('x.x.x.x.x.x.x.x.', 'kick', { cut: 0.25 }); s.pat('....x.......x...', 'snare'); s.pat('x.x.x.x.x.x.x.x.', 'ride', EMPTY, 0.6); }
      else { for (let i = 0; i < 16; i++) if (p.riff[i] !== '.') s.hit('kick', i / 4, 0.85, { cut: 0.2 }); s.pat('....X.......X...', 'snare'); s.pat('x.x.x.x.x.x.x.x.', 'hat', EMPTY, 0.7); }
      if (s.first) s.hit('crash', 0, 0.9);
      if (s.fill) fill(s, 'toms', 0.85, 2);
      if ((B || S) && sec.mel) { s.mel('lead', 'elec', sec.mel[k], { vib: [22, 6, 0.15], r: 0.1 }, 0, 0.9); s.mel('lead', 'elec', sec.mel[k].map((n) => ({ ...n, n: stepSc(n.n, 2, SCALE.harm) })), { vib: [22, 5.6, 0.15], dt: 0.006, r: 0.1 }, 0, 0.7); }
    },
  };
  // ── ambiance (vinyle « Nuages », cassette nature) : nappes lentes qui évoluent, lames éparses dans un grand écho,
  //    bourdon grave, gouttes d'eau, piano rare ; pas de batterie ──
  STYLES.ambient = {
    gain: -5.5,
    init(s) {
      s.track('pad', { rev: 0.5, width: 0.9, chorus: { rate: 0.2, depth: 0.004, mix: 0.4 }, eq: [['hp1', 120], ['lp', 3500, 0.7]] });
      s.track('air', { rev: 0.6, width: 0.9, stereo: true, eq: [['hp1', 600]] }); s.track('sub', { eq: [['lp', 180, 0.7]] });
      s.track('bell', { pan: -0.3, rev: 0.45, dly: 0.45 }); s.track('pno', { pan: 0.2, rev: 0.5, dly: 0.2, width: 0.7 }); s.track('fx', { pan: 0.4, rev: 0.5, dly: 0.35 });
      s.bus({ rev: { decay: 0.86, damp: 0.35, size: 1.6, pre: 0.03 }, echo: { time: 0.62, fb: 0.5, lp: 2600, pp: true }, glue: { thr: -20, ratio: 1.8, att: 0.05, rel: 0.4 } });
    },
    piece(s) {
      const R = s.R; s.bpm = 60; s.key = R.pick([62, 64, 60, 65, 57]); s.sc = SCALE.maj; s.meter = 4; s.hum = 0.02; s.swing = 0;
      const P = R.shuffle(['Iadd9 Iadd9 IVmaj7 IVmaj7', 'vi9 vi9 Imaj9 Imaj9', 'IVmaj9 IVmaj9 Iadd9 Iadd9', 'iii7 iii7 IVmaj7#11 IVmaj7#11', 'Imaj7 Imaj7 bVIImaj7 bVIImaj7', 'ii9 ii9 Iadd9 Iadd9']);
      s.secs = { A: section(s, P[0] + ' ' + P[1]), B: section(s, P[2] + ' ' + P[3]), O: section(s, P[0]) }; s.form = ['A', 'B', 'A', 'O'];
      Object.assign(s.p, { padI: R.pick(['strings_lo', 'choir_oo', 'pad', 'glass']), bellI: R.pick(['vibes', 'celesta', 'kalimba', 'glock']), gap: 4 });
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, ch = s.chords[0], name = s.secName;
      if (name === 'O' && k === 0) s.fadeOut(0, 14);
      if (k % 2 === 0) {
        for (const n of s.vo('p', ch, 52, 4)) s.ev('pad', p.padI, R.range(0, 0.5), 7.6, n, R.range(0.55, 0.72), { a: 2.4, r: 3.5 });
        if (R.chance(0.5)) for (const n of s.vo('h', ch, 74, 2)) s.ev('air', 'glass', 2, 6, n, 0.4, { a: 3, r: 4 });
        s.ev('sub', 'sine', 0, 7.8, s.bassOf(ch, 33), 0.6, { a: 2, r: 3 });
      }
      const pen = SCALE.pmaj; for (let i = 0; i < 3; i++) if (R.chance(0.42)) s.ev('bell', p.bellI, R.int(0, 7) / 2, 3, s.key + 12 + relOf(R.int(0, 7), pen), R.range(0.25, 0.5), p.bellI === 'vibes' ? { trem: [0.15, 3] } : EMPTY);
      if (R.chance(0.25)) { const b0 = R.int(0, 4) / 2, deg = R.int(0, 4); [0, 1, 2].forEach((j) => s.ev('pno', 'piano', b0 + j * 0.75, 2.5, s.key + relOf(deg + j * 2, SCALE.maj), 0.3, { ped: 2 })); }
      if (R.chance(0.45)) { const n = R.int(84, 98); s.ev('fx', 'sine', R.range(0, 3.5), 0.12, n, R.range(0.25, 0.5), { gl: n - 9, glt: 0.04, a: 0.002, s: 0, dec: 0.07, r: 0.04 }); }
    },
  };
  // ── outils pour les airs du répertoire : tessiture, mode mineur (comptine « qui tourne mal »), accompagnement ──
  function repRange(sc, voice) { let lo = 127, hi = 0; for (const bar of sc.byBar[voice] || []) for (const n of bar) { lo = Math.min(lo, n.n); hi = Math.max(hi, n.n); } return [lo, hi]; }
  const toMinorN = (n, tonic) => { const d = mod(n - tonic, 12); return d === 4 || d === 9 ? n - 1 : n; }; // tierce et sixte abaissées (mineur harmonique)
  function toMinorC(c, tonicPc) {
    if (!c) return c; const d = mod(c.r - tonicPc, 12), maj = c.iv[1] === 4;
    if ((d === 0 || d === 5) && maj) return { ...c, iv: [0, 3, 7, ...c.iv.slice(3)] };
    if (d === 9 || d === 4) return { r: c.r - 1, iv: [0, 4, 7], bass: c.r - 1, sym: '' };
    if (d === 2) return { ...c, iv: [0, 3, 6] };
    return c;
  }
  // accompagnement de boîte à musique / de comptine à partir des accords : basse au temps fort, notes de l'accord ensuite
  function combAcc(s, tr, inst, lo, vel, x = EMPTY, chs = s.chords, minorPc = null) {
    if (!chs || !chs[0]) return;
    const seg = s.barLen / chs.length;
    chs.forEach((c0, i) => {
      const c = minorPc === null ? c0 : toMinorC(c0, minorPc); if (!c) return;
      const tones = voicing(c, s.key, null, lo + 5, 3), b0 = i * seg;
      s.ev(tr, inst, b0, seg, lo + mod(s.key + c.bass - lo, 12), vel, x);
      for (let b = 1; b < seg - 0.01; b++) s.ev(tr, inst, b0 + b, 1, tones[(b - 1) % tones.length], vel * 0.72, x);
    });
  }
  // ── vieux 78 tours (platine fantôme, cassette d'horreur) : valse triste ou comptine en mineur, piano et violon,
  //    disque voilé et désaccordé, craquements, sillon qui saute, vitesse qui flanche ──
  STYLES.creepy_vinyl = {
    gain: -9.3, mono: true,
    init(s) {
      s.track('pno', { db: 3, rev: 0.2 }); s.track('vln', { rev: 0.25, eq: [['lp', 3200, 0.7]] }); s.track('click', {});
      s.bus({ rev: { decay: 0.5, damp: 0.6, size: 0.7 }, eq: [['hp', 280, 0.8], ['pk', 1500, 1, 5], ['lp', 3600, 0.8]], sat: { k: 1.6, mix: 0.6 }, wow: { rate: 0.5, cents: 24, frate: 7, fcents: 7 }, noise: { crackle: 0.12, hiss: 0.012 } });
    },
    piece(s, n) {
      const R = s.R, p = s.p; p.gap = 2.5; s.baseCents = R.pick([-37, -41, 33, -28]); s.hum = 0.02; s.humV = 0.15;
      const id = R.pick(['', '', 'clair_lune', 'vous_dirai', 'fur_elise']);
      if (id && repPiece(s, id, { tempo: id === 'fur_elise' ? 0.62 : 0.72 })) { p.rep2 = id; p.minor = id !== 'fur_elise'; return; }
      s.bpm = R.int(62, 74); s.key = R.pick([67, 69, 65, 66]); s.sc = SCALE.harm; s.meter = 3;
      const mel = { bank: RH.waltz, lo: 0, hi: 15, leap: 0.45, phrase: 4 };
      s.secs = { A: section(s, R.pick(['i i iv iv V7 V7 i i', 'i VI iv V7 i iv V7 i']), { mel, minSc: SCALE.harm }), B: section(s, 'bIII bIII bVI bVI iv iv V7 V7', { mel: { ...mel, scale: SCALE.harm } }) };
      s.form = ['A', 'B', 'A'];
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, sour = () => (R.chance(0.2) ? R.pick([-1, 1]) * R.range(30, 65) : 0);
      s.tempoAt(0, R.range(0.88, 1.03), s.barLen * 0.5);
      if (s.barN > 4 && R.chance(0.08)) { // sillon rayé : le même temps se répète avec le clic de l'aiguille
        const reps = R.int(3, 5), ch = s.chords[0]; s.barLen = reps;
        for (let i = 0; i < reps; i++) { s.hit('tick', i, 0.9, { tr: 'click', p: 0.6 }); s.ev('pno', 'piano', i, 0.9, s.bassOf(ch, 36), 0.6, { c: sour() }); }
        if (R.chance(0.6)) s.bis--; return;
      }
      if (s.wow && R.chance(0.1)) { const b = R.range(0, 2); s.fx(b, (S) => { S.wow.extra = 80; }); s.fx(b + 1.5, (S) => { S.wow.extra = 0; }); } // le moteur du tourne-disque flanche
      if (p.rep) {
        const sc = p.rep, kk = k % sc.bars, tonic = s.key;
        s.barLen = repLen(s, sc, k);
        const mv = sc.byBar.mel ? 'mel' : 'rh';
        for (const nn of sc.byBar[mv][kk]) s.ev('vln', 'violin', nn.b, nn.d * 0.95, (p.minor ? toMinorN(nn.n, tonic) : nn.n) + 12, nn.v * 0.8, { vib: [24, 5.2, 0.15], a: 0.08, r: 0.3, c: sour() });
        if (sc.byBar.lh) for (const nn of sc.byBar.lh[kk]) s.ev('pno', 'piano', nn.b, nn.d * 2, nn.n, nn.v * 0.7, { c: sour() });
        else if (sc.ch) combAcc(s, 'pno', 'piano', 48, 0.5, { c: sour() }, sc.ch[kk], p.minor ? mod(tonic, 12) : null);
        if (k >= s.secLen - 2) s.tempoAt(0, 0.7, s.barLen);
        return;
      }
      const ch = s.chords[0];
      s.ev('pno', 'piano', 0, 0.9, s.bassOf(ch, 36) + (k % 2 ? 7 : 0), 0.7, { c: sour() });
      const cv = s.vo('c', ch, 55, 3); for (const b of [1, 2]) for (const n of cv) s.ev('pno', 'piano', b, 0.5, n, 0.45, { c: sour() });
      for (const n of melK(sec, k)) s.ev('vln', 'violin', n.b, n.d * 0.95, s.key + n.n, n.v * 0.8, { a: 0.09, r: 0.3, vib: [26, 5.2, 0.12], c: sour() });
      if (s.fill) s.tempoAt(2, 0.7, 1);
    },
  };
  // ── boîtes à musique : airs du répertoire au peigne métallique (mélodie dans l'aigu, basse et accords aux dents graves),
  //    tempo du ressort qui fluctue ; version « fausse » : désaccordée, notes qui manquent, ressort qui se détend, remontage ──
  const BOX_TUNES = [['clair_lune', 4], ['vous_dirai', 2], ['frere_jacques', 1.5], ['anniversaire', 1], ['fur_elise', 1.5], ['greensleeves', 1], ['douce_nuit', 1], ['menuet_sol', 1]];
  function boxPiece(s, n, wrong) {
    const R = s.R, p = s.p; p.gap = wrong ? 0.8 : 1.4; s.hum = wrong ? 0.02 : 0.008; s.humV = wrong ? 0.2 : 0.1;
    if (!s.tune || n % 3 === 0) s.tune = R.wpick(BOX_TUNES);
    const sc = score(s.tune); if (!sc) return;
    // mélodie transposée par octaves dans le registre du peigne (mi 5 – do 7)
    const mv = sc.byBar.mel ? 'mel' : 'rh', [lo, hi] = repRange(sc, mv); let tp = Math.round(Math.min(96 - hi, Math.max(76 - lo, 0)) / 12) * 12; if (hi + tp > 98) tp -= 12;
    repPiece(s, s.tune, { tp, tempo: R.range(0.85, 1) });
    p.mv = mv; p.spring = R() * 10; p.drift = 1; p.minor = wrong && n % 2 === 1 && s.tune !== 'fur_elise' && s.tune !== 'greensleeves';
    if (wrong) s.baseCents = -30;
  }
  function boxBar(s, sec, k, wrong) {
    const R = s.R, p = s.p, sc = p.rep; if (!sc) return;
    const kk = k % sc.bars; s.barLen = repLen(s, sc, k);
    p.spring += 0.7; let tempo = 1 + Math.sin(p.spring) * 0.03 + Math.sin(p.spring * 0.37) * 0.025;
    if (wrong) {
      if (p.winding) { p.winding = false; p.drift = 1.04; for (let t = 0, gap = 0.4; t < s.barLen - 0.1; t += gap, gap = Math.max(0.09, gap * 0.8)) s.hit('tick', t, 0.5 + R() * 0.4, { tr: 'box', p: 0.7 + R() * 0.5 }); s.bis--; return; }
      p.drift *= R.range(0.86, 0.95); if (p.drift < 0.42 || (p.drift < 0.6 && R.chance(0.15))) p.winding = true;
      tempo *= p.drift;
      if (R.chance(0.035)) { s.tempoAt(0, 0.75); s.bis--; return; } // la mécanique accroche : silence, puis reprend
    }
    s.tempoAt(0, tempo, s.barLen * 0.3);
    if (k === s.secLen - 1) s.tempoAt(s.barLen * 0.4, tempo * (wrong ? 0.4 : 0.82), s.barLen * 0.6);
    const tp = s.p.tp, tonic = s.key, sag = wrong ? -50 * (1 - p.drift) : 0;
    const note = (n) => { let m = (p.minor ? toMinorN(n + tp, tonic) : n + tp); let c = sag; if (wrong) { if (R.chance(0.08)) m += R.pick([-1, 1, -2]); if (R.chance(0.25)) c += R.pick([-1, 1]) * R.range(25, 70); } return [m, c]; };
    for (const nn of sc.byBar[p.mv][kk]) { if (wrong && R.chance(0.12)) continue; const [m, c] = note(nn.n); s.ev('box', 'mbox', nn.b, nn.d, m, nn.v * 0.95, { c }); }
    const acc = sc.byBar.lh ? 'lh' : sc.byBar.bass ? 'bass' : null;
    if (acc) for (const nn of sc.byBar[acc][kk]) { if (wrong && R.chance(0.15)) continue; const [m, c] = note(nn.n); s.ev('box', 'mbox', nn.b, Math.max(nn.d, 0.5), m + (m < tonic - 12 ? 12 : 0), nn.v * 0.6, { c }); }
    else if (sc.ch) combAcc(s, 'box', 'mbox', tonic - 12, 0.55, { c: sag }, sc.ch[kk], p.minor ? mod(tonic, 12) : null);
  }
  const boxInit = (s) => { s.track('box', { rev: 0.18, eq: [['hp1', 300], ['pk', 2600, 1.2, 2]] }); s.bus({ rev: { decay: 0.4, damp: 0.3, size: 0.5, pre: 0.004 }, noise: { hiss: 0.0012 } }); };
  STYLES.music_box = { gain: -1.5, init: boxInit, piece(s, n) { boxPiece(s, n, false); }, bar(s, sec, k) { boxBar(s, sec, k, false); } };
  STYLES.music_box_wrong = { gain: -0.4, init: boxInit, piece(s, n) { boxPiece(s, n, true); }, bar(s, sec, k) { boxBar(s, sec, k, true); } };
  // ── borne d'arcade (mode démonstration) : deux voies d'impulsions, triangle, bruit ; mélodie accrocheuse, arpèges ──
  STYLES.arcade = {
    gain: -13.1,
    init(s) { s.track('p1', { db: 2, rev: 0.04 }); s.track('p2', { rev: 0.04 }); s.track('tri', {}); s.track('noi', {}); s.bus({ rev: { decay: 0.2, damp: 0.5, size: 0.4 } }); },
    piece(s, n) {
      const R = s.R; s.bpm = R.int(138, 160); s.key = R.pick([72, 69, 74, 67]) + (n % 3) * 2; s.meter = 4; s.hum = 0.0005; s.humV = 0.02; s.swing = 0;
      const minor = R.chance(0.4), P = minor ? R.shuffle(['i bVI bVII i', 'i bVII bVI V', 'i iv bVII bIII']) : R.shuffle(['I V vi IV', 'vi IV I V', 'I vi IV V', 'IV V iii vi']);
      s.sc = minor ? SCALE.min : SCALE.maj;
      const mel = { bank: RH.chip, lo: 0, hi: 19, leap: 0.45, rep: 1.8 };
      s.secs = { I: section(s, minor ? 'i V' : 'I V'), A: section(s, P[0], { rep: true, mel, minSc: SCALE.min }), B: section(s, P[1], { rep: true, mel, minSc: SCALE.min }) };
      s.form = ['I', 'A', 'A', 'B', 'A']; s.p.gap = 0.6;
    },
    bar(s, sec, k) {
      const ch = s.chords[0];
      if (s.secName === 'I') { const t = ch.iv.map((x) => s.key + ch.r + x); [t[0], t[1], t[2], t[0] + 12, t[1] + 12, t[2] + 12, t[0] + 24].forEach((n, i) => s.ev('p1', 'pulse', i * 0.5, i === 6 ? 0.45 : 0.4, n, 0.9, { pw: 0.25, tight: true })); s.ev('tri', 'tri', 0, 3.5, s.bassOf(ch, 36), 0.9, { tight: true }); s.hit('nkick', 0, 0.8, { tr: 'noi' }); s.hit('nsnare', 3, 0.8, { tr: 'noi' }); return; }
      s.chords.forEach((c, i) => { const seg = 4 / s.chords.length, r = s.bassOf(c, 36); for (let j = 0; j < seg * 2; j++) s.ev('tri', 'tri', i * seg + j / 2, 0.42, r + (j % 2 ? 12 : 0), 0.9, { tight: true }); });
      for (let b = 0; b < 4; b++) { const c = s.chordAt(b); s.ev('p2', 'pulse', b, 0.9, s.key + c.r - (c.r > 6 ? 12 : 0), 0.5, { pw: 0.5, arp: [0, c.iv[1], c.iv[2], 12], as: 1 / 50, tight: true }); }
      s.mel('p1', 'pulse', sec.mel[k], { pw: s.secName === 'B' ? 0.125 : 0.25, vib: [18, 6, 0.15], tight: true }, 0, 0.95, 0.85);
      s.pat('x.......x.......', 'nkick', { tr: 'noi' }); s.pat('....x.......x...', 'nsnare', { tr: 'noi' }); s.pat('x.x.x.x.x.x.x.x.', 'nhat', { tr: 'noi' }, 0.6);
      if (s.fill) for (let i = 12; i < 16; i++) s.hit('nsnare', i / 4, 0.6 + (i - 12) * 0.1, { tr: 'noi' });
    },
  };
  // ── manège / chaîne enfants / jouets : comptines du répertoire à l'orgue de foire (un peu faux), glockenspiel,
  //    « oum-pa » de tuba, wood-block, triangle ; « Frère Jacques » en canon ──
  STYLES.kiddie = {
    gain: -8.8,
    init(s) {
      s.track('call', { pan: 0.1, rev: 0.15, eq: [['pk', 1800, 1, 2]] }); s.track('call2', { pan: -0.3, rev: 0.15 }); s.track('glock', { pan: -0.25, rev: 0.2 });
      s.track('oom', { eq: [['lp', 1500, 0.7]] }); s.track('pah', { pan: 0.2, eq: [['lp', 3000, 0.7]] }); s.track('dr', { db: 5, pan: -0.1, rev: 0.1 });
      s.bus({ rev: { decay: 0.35, damp: 0.5, size: 0.6 }, wow: { rate: 0.35, cents: 9, frate: 5, fcents: 2 } });
    },
    piece(s, n) {
      const R = s.R, p = s.p; p.gap = 1.2; s.kit = 'soft';
      p.id = R.wpick([['frere_jacques', 2], ['clair_lune', 1.5], ['vous_dirai', 1.5], ['anniversaire', 1], ['', 1.5]]);
      if (p.id && repPiece(s, p.id, { tempo: R.range(1.08, 1.25), tp: R.pick([0, 5, 7, -5]) + 12 })) { if (p.id === 'frere_jacques') { s.secs.R.len = 8 + 4 + 1; p.canon = true; } return; }
      s.bpm = R.int(116, 132); s.key = R.pick([72, 65, 67, 70]); s.sc = SCALE.maj; s.meter = 4; s.swing = 0.6; s.swingUnit = 0.5;
      const mel = { bank: RH.jingle, lo: 0, hi: 16, leap: 0.4, rep: 2 };
      s.secs = { A: section(s, R.pick(['I I V7 V7 V7 V7 I I', 'I IV V7 I I IV V7 I', 'I vi ii V7 I vi ii V7']), { mel }), B: section(s, R.pick(['IV IV I I V7 V7 I I', 'IV iv I VI7 ii V7 I I']), { mel }) };
      s.form = ['A', 'A', 'B', 'A'];
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, off = () => R.range(-14, 14);
      let chs = s.chords;
      if (p.rep) {
        const sc = p.rep;
        if (p.canon) { // canon à trois voix (calliope, glockenspiel deux mesures plus tard, orgue deux mesures après) sur pédale de tonique
          s.barLen = 4; chs = [parseChord('I')];
          if (k === s.secLen - 1) { // accord final, en point d'orgue
            s.tempoAt(0, 0.75, 2); const t = 60 + p.tp;
            s.ev('call', 'calliope', 0, 3, t, 0.8, { a: 0.02 }); s.ev('glock', 'glock', 0, 3, t + 12, 0.6); s.ev('call2', 'combo', 0, 3, t - 8, 0.6); s.ev('call2', 'combo', 0, 3, t - 5, 0.55);
            s.ev('oom', 'tuba', 0, 3, s.bassOf(chs[0], 36), 0.85); s.hit('tri', 0, 0.6); s.hit('block', 0, 0.6); return;
          }
          const k1 = k < 8 ? k : -1, k2 = k >= 2 && k - 2 < 8 ? k - 2 : -1, k3 = k >= 4 && k - 4 < 8 ? k - 4 : -1;
          if (k1 >= 0) for (const nn of sc.byBar.mel[k1]) s.ev('call', 'calliope', nn.b, nn.d * 0.9, nn.n + p.tp, nn.v, { c: off(), a: 0.02 });
          if (k2 >= 0) for (const nn of sc.byBar.mel[k2]) s.ev('glock', 'glock', nn.b, nn.d, nn.n + p.tp + 12, nn.v * 0.6, { c: 15 });
          if (k3 >= 0) for (const nn of sc.byBar.mel[k3]) s.ev('call2', 'combo', nn.b, nn.d * 0.9, nn.n + p.tp - 12, nn.v * 0.7, { c: off() });
          if (k === s.secLen - 2) s.tempoAt(2, 0.85, 2);
        } else {
          const kk = repBar(s, k, { mel: { i: 'calliope', tr: 'call', x: { a: 0.02 } } });
          if (s.pieceN % 2 === 0 || kk >= sc.bars / 2) for (const nn of sc.byBar.mel[kk]) s.ev('glock', 'glock', nn.b, nn.d, nn.n + p.tp + 12, nn.v * 0.55, { c: 15 });
          chs = s.chords;
        }
      } else {
        for (const n of melK(sec, k)) { s.ev('call', 'calliope', n.b, n.d * 0.9, s.key + n.n, n.v, { c: off(), a: 0.02 }); if (s.fi % 2 || s.secName === 'B') s.ev('glock', 'glock', n.b, n.d, s.key + n.n + 12, n.v * 0.6, { c: 15 }); }
      }
      if (!chs || !chs[0]) return;
      const ch = chs[0], r = s.bassOf(ch, 36), r2 = chs.length > 1 && chs[1] ? s.bassOf(chs[1], 36) : r + 7;
      s.ev('oom', 'tuba', 0, 0.8, r, 0.85); s.ev('oom', 'tuba', 2, 0.8, r2 > 47 ? r2 - 12 : r2, 0.75);
      for (const b of [1, 3]) { const c = s.chordAt(b, chs); if (c) for (const n of s.vo('p', c, 57, 3)) s.ev('pah', 'combo', b, 0.4, n, 0.5, { c: off() }); }
      for (let b = 0; b < 4; b++) s.hit('block', b, b % 2 ? 0.5 : 0.65, { p: b % 2 ? 1.26 : 1 });
      if (s.first) s.hit('tri', 0, 0.5);
    },
  };
  // ── musique de film (projecteur, cassette western) : épique (ostinato de cordes, cors, timbales), western (sifflement,
  //    guitare, trompette), suspense (trémolos, pulsations graves), Grieg ; l'intensité règle la densité ──
  STYLES.cinema_score = {
    gain: -4.3,
    init(s) {
      s.track('ost', { pan: -0.2, rev: 0.3 }); s.track('str', { pan: 0.15, rev: 0.4, width: 0.8 }); s.track('horn', { pan: 0.1, rev: 0.4 }); s.track('tpt', { pan: 0.25, rev: 0.35 });
      s.track('low', { pan: -0.1, rev: 0.3, eq: [['lp', 2000, 0.7]] }); s.track('perc', { rev: 0.35 }); s.track('choir', { rev: 0.5, width: 0.8 }); s.track('gtr', { pan: -0.35, rev: 0.3 }); s.track('whis', { pan: 0.2, rev: 0.45, dly: 0.2 });
      s.bus({ rev: { decay: 0.8, damp: 0.4, size: 1.4, pre: 0.025 }, echo: { time: 0.5, fb: 0.3, lp: 2500 }, glue: { thr: -18, ratio: 2 } });
    },
    piece(s, n) {
      const R = s.R, p = s.p; p.gap = 3; s.kit = 'orch'; s.hum = 0.006; s.swing = 0;
      p.sub = R.wpick([['epic', 3], ['western', 2], ['suspense', 2], ['roi', 1]]);
      if (p.sub === 'roi' && repPiece(s, 'roi_montagne')) return;
      if (p.sub === 'roi') p.sub = 'epic';
      s.key = R.pick([62, 60, 64, 57]); s.sc = SCALE.min; s.meter = 4;
      const mel = { scale: SCALE.harm, bank: RH.cad4.concat(RH.lyric), lo: -5, hi: 12, leap: 0.5, phrase: 4 };
      if (p.sub === 'western') { s.bpm = R.int(84, 100); s.sc = SCALE.min; s.secs = { I: section(s, 'i i', { len: 2 }), A: section(s, R.pick(['i iv i V7 i iv V7 i', 'i bVII bVI V7 i bVII bVI V7']), { mel: { ...mel, lo: 0, hi: 15, bank: RH.lyric }, minSc: SCALE.harm }), B: section(s, 'bIII bVII iv V7 bIII bVII iv V7', { mel: { ...mel, lo: 2, hi: 17 }, minSc: SCALE.harm }), O: section(s, 'i i', { len: 2 }) }; s.form = ['I', 'A', 'B', 'A', 'O']; }
      else if (p.sub === 'suspense') { s.bpm = R.int(70, 84); s.secs = { A: section(s, 'i i bII bII i i bvi bvi'), B: section(s, 'iv iv bII bII V V V V'), O: section(s, 'i i', { len: 2 }) }; s.form = ['A', 'B', 'A', 'O']; }
      else { s.bpm = R.int(92, 108); s.secs = { I: section(s, 'i i'), A: section(s, R.pick(['i i bVI bVI bIII bIII bVII bVII', 'i i bVI bVI iv iv V V']), { mel, minSc: SCALE.harm }), B: section(s, R.pick(['i bVI bIII bVII', 'i iv bVI V']), { rep: true, mel, minSc: SCALE.harm }), C: section(s, R.pick(['i bII i bII', 'i i bvi i'])), O: section(s, 'i i', { len: 2 }) }; s.form = ['I', 'A', 'B', 'C', 'A', 'B', 'O']; }
      p.ost = R.pick([[0, 0, 12, 0, 7, 0, 12, 7], [0, 12, 0, 7, 0, 12, 0, 10], [0, 0, 7, 0, 0, 12, 7, 3]]);
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, name = s.secName, it = s.intensity;
      if (p.rep) { // Grieg : basson/cordes en pizzicato puis tutti, accélération
        const loop = Math.floor(k / 4); repBar(s, k, { mel: { i: loop < 2 ? 'pizz' : loop < 4 ? 'strings' : 'trumpet', tr: loop < 2 ? 'low' : 'str', tp: loop < 1 ? -12 : 0, vel: 0.6 + loop * 0.07, leg: loop < 2 ? 0.6 : 0.85, x: { r: 0.08 } } });
        s.ev('low', 'pizz', 0, 0.5, 35, 0.8); s.ev('low', 'pizz', 2, 0.5, 42, 0.7); if (loop >= 3) s.ev('perc', 'timpani', 0, 1.5, 47, 0.5 + loop * 0.05); if (loop >= 4) s.ev('horn', 'horn', 0, 3.8, 59, 0.7);
        if (s.last) { s.ev('tpt', 'trumpet', 0, 4, 59, 0.9); s.hit('cym', 0, 0.8, { tr: 'perc' }); s.hit('bdrum', 0, 0.9, { tr: 'perc' }); }
        return;
      }
      const ch = s.chords[0], r = s.bassOf(ch, 38);
      if (name === 'O' && s.last) { for (const n of s.vo('s', ch, 50, 4)) s.ev('str', 'strings', 0, 4, n, 0.7, { a: 0.1 }); s.ev('low', 'trombone', 0, 4, r, 0.8); s.ev('perc', 'timpani', 0, 3, s.bassOf(ch, 40), 0.8); s.hit('cym', 0, 0.6, { tr: 'perc' }); finale(s); return; }
      if (p.sub === 'western') {
        for (let b = 0; b < 4; b++) chord(s, 'gtr', 'nylon', b, b % 2 ? 0.4 : 0.9, b % 2 ? s.vo('g', ch, 52, 4).slice(1) : [r + 12], b % 2 ? 0.5 : 0.7, EMPTY, 0.01);
        s.hit('rim', 1, 0.4, { tr: 'perc' }); s.hit('rim', 3, 0.4, { tr: 'perc' }); if (k % 2 === 0) s.ev('perc', 'timpani', 0, 1, s.bassOf(ch, 40), 0.45);
        if (sec.mel) { if (name === 'A' && s.fi < 3) s.mel('whis', 'whistle', sec.mel[k], EMPTY, 12, 0.8); else s.mel('tpt', 'trumpet', sec.mel[k], { vib: [18, 5.5, 0.25], pe: -40 }, 0, 0.85); }
        if (name === 'B') for (const n of s.vo('s', ch, 55, 3)) s.ev('str', 'strings', 0, 3.9, n, 0.4, { a: 0.4, r: 0.6 });
        return;
      }
      if (p.sub === 'suspense') {
        for (const n of s.vo('s', ch, 55, 3)) s.ev('str', 'strings', 0, 3.95, n, 0.35 + it * 0.2, { trem: [0.6, 11], a: 0.5, r: 0.6 });
        for (let i = 0; i < 4; i++) s.ev('low', 'cello', i, 0.5, r - 12, 0.5 + it * 0.3, { r: 0.1 });
        if (k % 2 === 1) s.ev('choir', 'choir_oo', 0, 7.5, s.key + ch.r + 13, 0.35, { a: 1.5, r: 1 });
        if (it > 0.6 || name === 'B') { s.hit('bdrum', 0, 0.5 + it * 0.3, { tr: 'perc' }); if (name === 'B') s.ev('perc', 'timpani', 3, 1, s.bassOf(ch, 40), 0.3 + it * 0.4); }
        return;
      }
      const oi = (v) => (v === 3 ? ch.iv[1] : v === 10 ? (ch.iv.includes(10) ? 10 : 12) : v); // l'ostinato suit l'accord (tierce majeure ou mineure)
      for (let i = 0; i < 16; i++) s.ev('ost', 'strings', i / 4, 0.18, r + oi(p.ost[i % 8]), i % 4 === 0 ? 0.85 : i % 2 ? 0.5 : 0.65, { r: 0.07, a: 0.004 });
      if (it > 0.7 || name === 'B') for (let i = 0; i < 16; i += 2) s.ev('ost', 'strings', i / 4, 0.18, r + 12 + oi(p.ost[i % 8]), 0.45, { r: 0.07 });
      if (name !== 'I') for (const n of s.vo('s', ch, 55, 4)) s.ev('str', name === 'C' ? 'choir_oo' : 'strings', 0, 3.95, n, name === 'C' ? 0.45 : 0.42, { a: 0.6, r: 0.8, trem: name === 'C' ? [0.5, 10] : undefined });
      if ((name === 'A' || name === 'B') && sec.mel) s.mel('horn', 'horn', sec.mel[k], { a: 0.1, r: 0.3 }, 0, name === 'B' ? 0.95 : 0.75);
      if (name === 'B' && sec.mel) s.mel('tpt', 'trumpet', sec.mel[k], { a: 0.05, r: 0.2 }, 12, 0.6);
      if (name === 'B' || (name === 'A' && k % 2 === 0)) { s.ev('perc', 'timpani', 0, 1.5, s.bassOf(ch, 40), 0.8); if (name === 'B') { s.hit('bdrum', 0, 0.8, { tr: 'perc' }); for (const n of s.vo('l', ch, 43, 3)) s.ev('low', 'trombone', 0, 1.2, n, 0.85, { a: 0.03 }); } }
      if (s.fill) { for (let i = 0; i < 8; i++) s.ev('perc', 'timpani', 2 + i / 4, 0.3, s.bassOf(ch, 40), 0.3 + i * 0.08); }
      if (s.first && name !== 'I' && name !== 'C') s.hit('cym', 0, 0.55, { tr: 'perc' });
    },
  };
  // ── piano-bar (film muet du projecteur, cassette de cuisine, vinyle « Piano Bar ») : stride / ragtime, ballade de
  //    salon (rubato, pédale), valse lente façon gymnopédie (pièce originale), swing en solo, prélude de Bach ──
  STYLES.piano_bar = {
    gain: -2.2,
    init(s) { s.track('pno', { rev: 0.22, width: 0.85, eq: [['hp1', 40]] }); s.bus({ rev: { decay: 0.5, damp: 0.45, size: 0.8, pre: 0.01 }, glue: { thr: -18, ratio: 2 } }); },
    piece(s, n) {
      const R = s.R, p = s.p; p.gap = 2.5; s.swing = 0; s.hum = 0.01;
      p.sub = R.wpick([['stride', 4], ['ballad', 3], ['gymno', 1.5], ['swing', 2], ['bach', 0.7]]);
      if (p.sub === 'bach' && repPiece(s, 'bach_prelude')) return;
      if (p.sub === 'bach') p.sub = 'ballad';
      s.key = R.pick([60, 65, 67, 58, 63, 62]); s.sc = SCALE.maj;
      if (p.sub === 'stride') { s.meter = 4; s.bpm = R.int(150, 178); s.swing = 0.3; s.swingUnit = 0.5; const m = { bank: RH.pop, lo: 7, hi: 24, leap: 0.45 }; s.secs = { A: section(s, R.pick(['I I VI7 VI7 II7 V7 I V7', 'I I7 IV #ivo7 I VI7 II7,V7 I']), { mel: m }), B: section(s, 'IV IV I I II7 II7 V7 V7', { mel: m }), O: section(s, 'I V7 I', { len: 3 }) }; s.form = ['A', 'A', 'B', 'A', 'O']; }
      else if (p.sub === 'gymno') { s.meter = 3; s.bpm = R.int(66, 76); s.secs = { A: section(s, 'Imaj7 IVmaj7 Imaj7 IVmaj7 Imaj7 IVmaj7 iii7 vi7', { mel: { bank: RH.waltz, lo: 9, hi: 21, leap: 0.4, rest: 0.25 } }), B: section(s, 'ii7 V7 iii7 vi7 ii7 V7 Imaj7 IVmaj7', { mel: { bank: RH.waltz, lo: 9, hi: 21 } }), O: section(s, 'Imaj7 IVmaj7 Imaj7 Imaj7', { len: 4 }) }; s.form = ['A', 'A', 'B', 'A', 'O']; }
      else if (p.sub === 'swing') { s.meter = 4; s.bpm = R.int(110, 150); s.swing = 0.7; s.swingUnit = 0.5; s.secs = { A: section(s, R.pick(JAZZ_A), { mel: { bank: RH.swing, lo: 7, hi: 24 } }), B: section(s, R.pick(JAZZ_B), { mel: { bank: RH.swing, lo: 7, hi: 24 } }), O: section(s, 'ii7 V7 Imaj7 Imaj7') }; s.form = ['A', 'A', 'B', 'A', 'O']; }
      else { s.meter = 4; s.bpm = R.int(64, 78); s.swing = 0.15; s.swingUnit = 0.5; s.secs = { A: section(s, R.pick(['Imaj7 iii7 vi7 IVmaj7 ii7 V7sus4 Imaj7 V7', 'Imaj9 IVmaj7 iii7 VI7b9 ii9 V13 Imaj7 V7sus4']), { mel: { bank: RH.lyric, lo: 7, hi: 24 } }), B: section(s, 'IVmaj7 iv6 iii7 VI7 ii7 V7 Imaj7 Imaj7', { mel: { bank: RH.lyric, lo: 7, hi: 24 } }), O: section(s, 'IVmaj7 iv6 Imaj7 Imaj7', { len: 4 }) }; s.form = ['A', 'A', 'B', 'A', 'O']; }
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, name = s.secName;
      if (p.rep) { repBar(s, k, { all: { i: 'piano', tr: 'pno', x: { ped: 0.5 } } }); return; }
      const ch = s.chords[0];
      if (name === 'O' && s.last) { chord(s, 'pno', 'piano', 0, s.barLen, [s.bassOf(ch, 36) - 12, s.bassOf(ch, 36), ...s.vo('r', ch, 60, 4)], 0.6, { ped: 3 }, p.sub === 'stride' ? 0.01 : 0.05); finale(s); return; }
      if (p.sub === 'stride') { // pompe stride : basse en octaves sur 1 et 3, accord médium sur 2 et 4 ; mélodie en tierces/sixtes
        for (let b = 0; b < 4; b++) { const c = s.chordAt(b); if (b % 2 === 0) { const r = s.bassOf(c, 36) + (b === 2 ? 7 : 0) - (b === 2 && s.bassOf(c, 36) + 7 > 47 ? 12 : 0); s.ev('pno', 'piano', b, 0.8, r, 0.8); s.ev('pno', 'piano', b, 0.8, r - 12, 0.55); } else chord(s, 'pno', 'piano', b, 0.5, s.vo('c', c, 53, 3), 0.55, EMPTY, 0.003); }
        for (const n of melK(sec, k)) { s.ev('pno', 'piano', n.b, n.d * 0.9, s.key + n.n, n.v * 0.85); if (n.d >= 0.5) s.ev('pno', 'piano', n.b, n.d * 0.9, s.key + below(s, n.n, n.b), n.v * 0.55); }
      } else if (p.sub === 'gymno') { // basse au temps fort, accord sur les temps 2–3, mélodie lente et nue
        s.ev('pno', 'piano', 0, 2.9, s.bassOf(ch, 40) - 12 * (k % 2), 0.55, { ped: 0.2 }); chord(s, 'pno', 'piano', 1, 1.9, s.vo('c', ch, 59, 3), 0.42, { ped: 0.2 }, 0.004);
        for (const n of melK(sec, k)) s.ev('pno', 'piano', n.b, n.d * 1.1, s.key + n.n + 12, n.v * 0.62, { ped: 0.3 });
        s.tempoAt(0, k % 4 === 3 ? 0.92 : R.range(0.97, 1.02), 3);
      } else if (p.sub === 'swing') { // main gauche en dixièmes et accords, main droite en phrases swing
        s.chords.forEach((c, i) => { const seg = 4 / s.chords.length, r = s.bassOf(c, 36); s.ev('pno', 'piano', i * seg, seg * 0.5, r, 0.62); chord(s, 'pno', 'piano', i * seg + 1, 0.6, s.vo('c', c, 52, 3, { rootless: true }), 0.48); });
        if (s.fi === 2 || s.fi === 3) bebop(s, 'pno', 'piano', s.key + 10, s.key + 27, EMPTY, 0.7); else for (const n of melK(sec, k)) s.ev('pno', 'piano', n.b, n.d * 0.9, s.key + n.n, n.v * 0.85);
      } else { // ballade : arpèges larges, mélodie et accords à la main droite, rubato
        s.chords.forEach((c, i) => { const seg = 4 / s.chords.length, r = s.bassOf(c, 36), t = c.iv; [0, 7, t[1] + 12, 7 + 12, t[1] + 12, 7].slice(0, seg * 2).forEach((iv, j) => s.ev('pno', 'piano', i * seg + j / 2, 1.6, r + iv, j ? 0.4 : 0.58, { ped: 0.6 })); });
        for (const n of melK(sec, k)) { s.ev('pno', 'piano', n.b, n.d, s.key + n.n, n.v * 0.8, { ped: 0.4 }); if (n.b === 0 && R.chance(0.5)) chord(s, 'pno', 'piano', 0, n.d, s.vo('r', s.chordAt(0), s.key + n.n - 10, 3, { hi: s.key + n.n - 1 }), 0.4, { ped: 0.4 }, 0.02); }
        s.tempoAt(0, k % 4 === 3 ? 0.9 : R.range(0.97, 1.03), 4); if (k % 4 === 3) s.tempoAt(3, 0.8, 1);
      }
    },
  };
  // ── station morte (radio, journal télévisé) : parasites, sifflements d'accord, et une voix fantôme qui chante des
  //    bribes d'« Au clair de la lune » ──
  STYLES.radio_static_voice = {
    gain: -10.7, mono: true,
    init(s) {
      // la voix et les sifflements restent sous les parasites, qui forment le fond continu de la station
      s.track('ghost', { db: -12, rev: 0.3, dly: 0.35, eq: [['hp', 250, 0.7], ['pk', 1100, 1.5, 6], ['lp', 3000, 0.7]] }); s.track('whistle', { db: -8 }); s.track('static', { db: -6, eq: [['hp', 500, 0.7], ['lp', 4500, 0.7]] });
      s.bus({ rev: { decay: 0.5, damp: 0.5, size: 0.8 }, echo: { time: 0.45, fb: 0.35, lp: 1800 }, eq: [['hp', 200, 0.7], ['lp', 5000, 0.7]], sat: { k: 1.6, mix: 0.7 }, wow: { rate: 0.3, cents: 15, frate: 4, fcents: 4 }, noise: { static: 0.5 } });
    },
    piece(s) { const R = s.R; s.bpm = 60; s.key = R.pick([57, 59, 55, 62]); s.sc = SCALE.maj; s.meter = 4; s.hum = 0.03; s.secs = { A: { prog: prog('I'), len: 16 } }; s.form = ['A']; s.p.sig = 0.45; s.p.gap = 0; s.tuneSc = score('clair_lune'); },
    bar(s, sec, k) {
      // force du signal : marche aléatoire attirée vers le milieu ; quand la voix passe, les parasites reculent
      const R = s.R, p = s.p; p.sig = clamp(p.sig + R.range(-0.3, 0.3) + (0.5 - p.sig) * 0.25, 0, 1); const sig = p.sig;
      s.fx(0, (S) => { const g = S.trk.ghost; if (g) g.user = 0.35 + 1.6 * sig; if (S.noiseFx) S.noiseFx.st = 0.5 * (1.3 - 0.8 * sig); });
      const sc = s.tuneSc;
      if (sc && sig > 0.3 && R.chance(0.8)) { // une bribe de la comptine, chantée très lentement
        const bar = sc.byBar.mel[R.int(0, sc.bars - 1)], t0 = R.int(0, 1);
        for (const nn of bar) if (t0 + nn.b * 1.4 < 4) s.ev('ghost', 'ghost', t0 + nn.b * 1.4, nn.d * 1.4, nn.n - 60 + s.key, R.range(0.55, 0.85), { vw: R.pick(['u', 'o', 'a']), vw2: R.pick(['o', 'u', 'a']), breath: 0.75 });
      }
      if (R.chance(0.3)) s.ev('whistle', 'whistle', R.range(0, 2), R.range(1.5, 3), R.int(84, 100), 0.4, { gl: R.int(80, 104), glt: R.range(0.5, 2) });
      for (let i = 0; i < 4; i++) if (R.chance(0.2)) s.hit('tick', R.range(0, 3.9), R.range(0.2, 0.6), { tr: 'static', p: R.range(0.5, 1.5) });
    },
  };
  // ── attente téléphonique / chaîne météo : classiques du domaine public en arrangement « synthé de standard » ──
  STYLES.hold_music = {
    gain: -3.2,
    init(s) {
      s.track('lead', { pan: 0.1, rev: 0.25, dly: 0.12 }); s.track('keys', { pan: -0.15, rev: 0.25, width: 0.6 }); s.track('pad', { rev: 0.35, width: 0.8, chorus: { mix: 0.3 } });
      s.track('bass', { eq: [['lp', 1200, 0.7]] }); s.track('dr', { rev: 0.1 }); s.track('hh', { pan: 0.25, eq: [['hp1', 500]] });
      s.bus({ rev: { decay: 0.5, damp: 0.4, size: 0.9 }, echo: { time: 0.4, fb: 0.2, lp: 3000 }, glue: { thr: -16, ratio: 2.5 } });
    },
    piece(s, n) {
      const R = s.R, p = s.p; p.gap = 1.5; s.kit = 'soft';
      if (!s.prog) s.prog = R.shuffle(['fur_elise', 'ode_joie', 'menuet_sol', 'canon', 'greensleeves']);
      p.id = s.prog[n % s.prog.length]; p.lead = R.pick(['flute', 'rhodes', 'glass', 'clarinet', 'strmachine']); p.beat = R.chance(0.6);
      repPiece(s, p.id, { tempo: p.id === 'fur_elise' ? 1 : R.range(0.92, 1.05), loops: p.id === 'fur_elise' ? 2 : 1 });
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, sc = p.rep; if (!sc) return;
      const lx = p.lead === 'flute' || p.lead === 'clarinet' ? { vib: [12, 5.2, 0.25] } : EMPTY;
      if (p.id === 'fur_elise') repBar(s, k, { rh: { i: p.lead === 'strmachine' ? 'rhodes' : p.lead, tr: 'lead', x: lx }, lh: { i: 'rhodes', tr: 'keys', vel: 0.8 } });
      else if (p.id === 'canon') { repBar(s, k, { bass: { i: 'ebass', tr: 'bass', vel: 0.8 }, v1: { i: p.lead, tr: 'lead', x: lx }, v2: { i: 'strmachine', tr: 'pad', vel: 0.7, x: { a: 0.05 } } }); }
      else if (p.id === 'menuet_sol') repBar(s, k, { mel: { i: p.lead, tr: 'lead', x: lx }, bass: { i: 'ebass', tr: 'bass', tp: -12 } });
      else { repBar(s, k, { mel: { i: p.lead, tr: 'lead', x: lx } }); if (hasChord(s)) s.chords.forEach((c, i) => { if (!c) return; const seg = s.barLen / s.chords.length; chord(s, 'keys', 'rhodes', i * seg, seg * 0.9, s.vo('k', c, 55, 3), 0.42); s.ev('bass', 'ebass', i * seg, seg * 0.8, s.bassOf(c, 36), 0.7); }); }
      if (p.beat && s.barLen >= 3) { if (s.meter === 4) { s.hit('kick', 0, 0.55); s.hit('kick', 2, 0.45); s.hit('rim', 1, 0.4); s.hit('rim', 3, 0.4); for (let i = 0; i < 8; i++) s.hit('shaker', i / 2, i % 2 ? 0.3 : 0.45); } else { s.hit('kick', 0, 0.5); s.hit('rim', 1, 0.35); s.hit('rim', 2, 0.35); } }
    },
  };
  // ── hymne parodique (original) : fanfare pompeuse, trompettes à la tierce, cors, trombones, tuba, caisse claire ──
  STYLES.national_anthem_parody = {
    gain: -5.3,
    init(s) {
      s.track('tpt', { pan: 0.2, rev: 0.3 }); s.track('tpt2', { pan: 0.35, rev: 0.3 }); s.track('horn', { pan: -0.25, rev: 0.35, eq: [['lp', 2500, 0.7]] }); s.track('bone', { pan: -0.1, rev: 0.3 });
      s.track('tuba', { eq: [['lp', 1000, 0.7]] }); s.track('dr', { db: 4, pan: -0.1, rev: 0.25 }); s.track('perc', { rev: 0.35 });
      s.bus({ rev: { decay: 0.65, damp: 0.4, size: 1.2, pre: 0.02 }, glue: { thr: -16, ratio: 2.5 } });
    },
    piece(s) {
      const R = s.R; s.bpm = R.int(100, 112); s.key = R.pick([70, 63, 65, 67]); s.sc = SCALE.maj; s.meter = 4; s.kit = 'orch'; s.hum = 0.007; s.p.gap = 3; s.p.sour = R.chance(0.6); // le tubiste rate une note
      const mel = { bank: RH.march, lo: 0, hi: 16, leap: 0.65, rep: 1 };
      s.secs = { I: section(s, 'I V7'), A: section(s, 'I IV I V7 I IV V7 I', { mel }), B: section(s, R.pick(['IV I V7 I vi ii V7 V7', 'vi iii IV I ii V7 I V7']), { mel }), F: section(s, 'I I') };
      s.form = ['I', 'A', 'B', 'A', 'F'];
    },
    bar(s, sec, k) {
      const R = s.R, ch = s.chords[0], name = s.secName, r = s.bassOf(ch, 34);
      if (name === 'I') { [[0, 0.75, 0], [0.75, 0.25, 0], [1, 1, 4], [2, 0.75, 4], [2.75, 0.25, 4], [3, 1, 7]].forEach(([b, d, n]) => s.ev('tpt', 'trumpet', b, d * 0.9, s.key + n, 0.9, { pe: -30 })); s.hit('snare', 0, 0.6); s.hit('snare', 3, 0.8); s.ev('tuba', 'tuba', 0, 3, r, 0.8); return; }
      if (name === 'F') {
        if (k === 0) { s.tempoAt(0, 0.7, 2); for (const n of s.vo('h', ch, 58, 4)) s.ev('horn', 'horn', 0, 7.5, n, 0.8, { a: 0.1 }); s.ev('tpt', 'trumpet', 0, 7.5, s.key + 12, 0.95); s.ev('tuba', 'tuba', 0, 7.5, r, 0.9); s.hit('cym', 0, 0.9, { tr: 'perc' }); s.hit('bdrum', 0, 1, { tr: 'perc' }); for (let i = 0; i < 16; i++) s.ev('perc', 'timpani', i / 4, 0.3, s.bassOf(ch, 40), 0.3 + i * 0.03); }
        else { s.hit('cym', 2, 0.6, { tr: 'perc' }); s.hit('bdrum', 2, 0.9, { tr: 'perc' }); }
        return;
      }
      s.ev('tuba', 'tuba', 0, 0.8, r, 0.85, { c: name === 'B' && k === 5 && s.p.sour ? -70 : 0 }); s.ev('tuba', 'tuba', 2, 0.8, r + 7 - (r + 7 > 45 ? 12 : 0), 0.75);
      for (const b of [1, 3]) for (const n of s.vo('h', s.chordAt(b), 55, 3)) s.ev('horn', 'horn', b, 0.4, n, 0.55, { a: 0.02 });
      s.mel('tpt', 'trumpet', sec.mel[k], { pe: -25 }, 0, 0.95, 0.88);
      s.mel('tpt2', 'trumpet', melK(sec, k).map((n) => ({ ...n, n: below(s, n.n, n.b) })), EMPTY, 0, 0.7, 0.88);
      if (name === 'B') s.mel('bone', 'trombone', sec.mel[k], EMPTY, -12, 0.6, 0.88);
      s.pat(R.chance(0.6) ? 'x.xxx.x.x.xxx.x.' : 'x.x.x.xxx.x.xxxx', 'snare', EMPTY, 0.6); s.hit('bdrum', 0, 0.8, { tr: 'perc' }); s.hit('bdrum', 2, 0.7, { tr: 'perc' });
      if (k % 4 === 0) s.hit('cym', 0, 0.5, { tr: 'perc' });
    },
  };
  // ── Noël (régie, vinyle « Noël au Centre ») : chants traditionnels — célesta, glockenspiel, grelots, cordes, harpe,
  //    chœur, pizzicati ──
  STYLES.xmas = {
    gain: -3.4,
    init(s) {
      s.track('cel', { pan: 0.15, rev: 0.3 }); s.track('glock', { pan: -0.3, rev: 0.3 }); s.track('bells', { db: 5, pan: 0.35, eq: [['hp1', 3000]], rev: 0.15 });
      s.track('str', { rev: 0.4, width: 0.8 }); s.track('choir', { rev: 0.5, width: 0.8 }); s.track('harp', { pan: -0.2, rev: 0.35, width: 0.6 }); s.track('bass', { eq: [['lp', 1500, 0.7]], rev: 0.15 });
      s.track('dr', { rev: 0.15 }); s.track('church', { pan: -0.15, rev: 0.5 });
      s.bus({ rev: { decay: 0.7, damp: 0.4, size: 1.2, pre: 0.02 }, glue: { thr: -17, ratio: 2 } });
    },
    piece(s, n) {
      const R = s.R, p = s.p; p.gap = 2; s.kit = 'soft';
      if (!s.prog) s.prog = R.shuffle(['vive_le_vent', 'douce_nuit', 'we_wish', 'deck_halls']);
      p.id = s.prog[n % s.prog.length]; const swing = p.id === 'vive_le_vent' && R.chance(0.6);
      repPiece(s, p.id, { tp: R.pick([0, 5, -2, 2, 7]), loops: p.id === 'douce_nuit' ? 1 : 2 });
      s.swing = swing ? 0.6 : 0; s.swingUnit = 0.5; p.lead = p.id === 'douce_nuit' ? R.pick(['choir', 'celesta', 'harp']) : R.pick(['celesta', 'glock', 'strings']);
    },
    bar(s, sec, k) {
      const R = s.R, p = s.p, sc = p.rep; if (!sc) return;
      const second = k >= sc.bars, lead = p.lead === 'strings' ? 'strings' : p.lead === 'choir' ? 'choir' : p.lead, tr = lead === 'glock' ? 'glock' : lead === 'strings' ? 'str' : lead === 'choir' ? 'choir' : lead === 'harp' ? 'harp' : 'cel';
      repBar(s, k, { mel: { i: lead, tr, tp: lead === 'celesta' || lead === 'glock' ? 12 : 0, x: lead === 'strings' || lead === 'choir' ? { a: 0.08, r: 0.3 } : EMPTY } });
      if (second && lead !== 'glock') for (const nn of sc.byBar.mel[k % sc.bars]) s.ev('glock', 'glock', nn.b, nn.d, nn.n + s.p.tp + 24, nn.v * 0.4);
      if (!hasChord(s)) return;
      const slow = p.id === 'douce_nuit';
      s.chords.forEach((c, i) => {
        if (!c) return; const seg = s.barLen / s.chords.length, b = i * seg, rr = s.bassOf(c, 36);
        if (slow) { const t = voicing(c, s.key, null, 50, 3); for (let j = 0; j < seg - 0.01; j++) s.ev('harp', 'harp', b + j, 1.5, j ? t[(j - 1) % t.length] + 12 : rr, 0.5); for (const nn of s.vo('s', c, 55, 3)) s.ev('str', 'strings', b, seg * 0.95, nn, 0.32, { a: 0.4, r: 0.6 }); }
        else { s.ev('bass', 'pizz', b, 0.8, rr, 0.8); if (seg >= 2) s.ev('bass', 'pizz', b + seg / 2, 0.8, rr + 7 - (rr + 7 > 50 ? 12 : 0), 0.6); for (const nn of s.vo('s', c, 60, 3)) s.ev('str', 'strings', b, seg * 0.9, nn, 0.36, { a: 0.2, r: 0.4 }); }
      });
      if (!slow) { for (let i = 0; i < s.barLen * 2; i++) s.hit('sleigh', i / 2, i % 2 ? 0.38 : 0.55, { tr: 'bells' }); if (s.meter === 4) { s.hit('brush', 1, 0.35); s.hit('brush', 3, 0.35); } s.hit('kick', 0, 0.35); }
      if (k === 0) s.ev('church', 'bell', 0, 4, s.key - 12, 0.5);
      if (k === s.secLen - 1) s.hit('tri', 0, 0.45, { tr: 'bells' });
    },
  };
  // accompagnement orchestral d'une mélodie du répertoire (accords de la partition) : cordes, basses, timbales
  function orch(s, en) {
    if (!hasChord(s)) return;
    s.chords.forEach((c, i) => {
      if (!c) return; const seg = s.barLen / s.chords.length, b = i * seg;
      for (const n of s.vo('o', c, 55, 3)) s.ev('vn2', 'strings', b, seg * 0.95, n, 0.4 * en + 0.15, { a: 0.08, r: 0.3 });
      s.ev('cb', 'strings_lo', b, seg * 0.95, s.bassOf(c, 36), 0.55 * en + 0.2, { a: 0.05, r: 0.3 });
      if (en > 0.8 && i === 0) s.ev('perc', 'timpani', b, 1.5, s.bassOf(c, 40), 0.5);
    });
  }

  // ═══════════════ messages et boucle de travail ═══════════════
  let REP = {};
  const SONGS = new Map();
  const FREE = []; // tranches de sortie déjà jouées, rendues par le fil principal
  let workT = null, SLICE = 14; // tranche de travail (ms) : courte quand le moteur partage le fil principal
  const kick = () => { if (workT === null) workT = setTimeout(work, 0); };
  function emit(s) {
    let ch;
    try { ch = s.chunk(); } catch (e) { log('chunk:' + s.name, 'erreur de rendu', e); s.errors++; const z = new Float32Array(CHUNK + OVL); ch = s.mono ? [z] : [z, new Float32Array(CHUNK + OVL)]; s.made++; }
    const msg = { t: 'chunk', id: s.id, k: s.made - 1, ch }, tr = ch.map((c) => c.buffer);
    if (s.port) { try { s.port.postMessage(msg, tr); } catch (e) { log('port', 'envoi au processeur audio impossible', e); } } else host.post(msg, tr);
  }
  function work() {
    workT = null; const t0 = perf();
    for (let guard = 0; guard < 400 && perf() - t0 < SLICE; guard++) {
      let best = null, bb = Infinity;
      for (const s of SONGS.values()) { if (s.made * CHUNK >= s.need) continue; const buf = s.made * CHUNK - s.play; if (buf < bb) { bb = buf; best = s; } }
      if (best) {
        const start = best.made === 0;
        const age = perf() - best.born;
        if (start ? (best.readyFor(CHUNK + OVL) || (age > 80 && best.readyFor(CHUNK + OVL, true)) || age > 300) : (bb < 0.2 * SR || best.readyFor(CHUNK * 2) || !WANT.size)) { emit(best); continue; }
      }
      if (renderNext(!best)) continue;
      if (best) { emit(best); continue; }
      break;
    }
    let more = WANT.size > 0; for (const s of SONGS.values()) if (s.made * CHUNK < s.need) more = true;
    if (more) kick();
  }
  // ── préchauffage à vide : tant qu'aucun morceau ne joue, on prépare (en prises abrégées) les premières notes de chaque
  //    style et on fait tourner une fois le rendu, pour que le premier play() d'un style sonne en quelques dizaines de ms ──
  const WARM = []; let warmT = null, warmN = 0;
  const WARM_ORDER = ['muzak', 'lofi', 'chanson', 'jazz', 'rock', 'classical', 'radio_static_voice', 'kiddie', 'disco', 'music_box', 'hold_music', 'xmas', 'synthwave',
    'creepy_vinyl', 'cinema_score', 'piano_bar', 'funk', 'reggae', 'metal', 'ambient', 'arcade', 'music_box_wrong', 'national_anthem_parody'];
  function warmStep() {
    warmT = null; if (!WARM.length) return;
    if (SONGS.size || WANT.size) { warmT = setTimeout(warmStep, 1000); return; } // de la musique joue : le préchauffage attend
    const t0 = perf(), job = WARM.shift();
    try {
      if (typeof job === 'string') { // morceau factice : clés des 1,6 premières secondes (retirées de la file des urgences)
        const before = new Set(WANT.keys()), s = new Song(-1, job, { seed: 1 + (warmN % 3), mono: true, speaker: 'none' }), keys = [];
        for (const k of [...WANT.keys()]) if (!before.has(k)) WANT.delete(k);
        const bEnd = 1.6 * s.bpm / 60; for (const e of s.q) { if (e.B > bEnd) break; const k = s.keyOf(e); if (k && !STORE.has(k) && !keys.includes(k)) keys.push(k); }
        WARM.unshift(...keys.map((k) => ({ k })), ...(warmN < 3 ? [{ song: s }] : [])); warmN++;
        if (warmN >= 3) s.free();
      } else if (job.song) { job.song.chunk(); job.song.chunk(); job.song.free(); } // rendu à blanc : compile mixage et effets
      else if (!STORE.has(job.k)) { const smp = renderKey(job.k, true); if (smp) { smp.t = 0; putSample(smp); } } // t = 0 : premières évincées
    } catch (e) { /* préchauffage facultatif */ }
    warmT = setTimeout(warmStep, Math.max(20, (perf() - t0) * 3)); // ≤ 25 % d'un cœur
  }
  function receive(m) {
    try {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'init') {
        if (m.rep) REP = m.rep; if (m.inline) SLICE = 3;
        if (m.warm && !WARM.length && warmT === null) { WARM.push(...WARM_ORDER); warmT = setTimeout(warmStep, 1500); }
      }
      else if (m.t === 'new') {
        try {
          const s = new Song(m.id, m.style, m); SONGS.set(m.id, s); host.post({ t: 'tracks', id: m.id, names: s.tracks.map((t) => t.name) });
          if (m.port) { s.port = m.port; s.port.onmessage = (e) => receive(e.data); } // processeur audio : il réclame la suite lui-même
        }
        catch (e) { log('new:' + m.style, 'création impossible', e); host.post({ t: 'fail', id: m.id }); }
      } else if (m.t === 'need') {
        if (m.rec) for (const a of m.rec) if (a instanceof Float32Array && a.length === CHUNK + OVL && FREE.length < 48) FREE.push(a);
        const s = SONGS.get(m.id); if (s) { s.need = Math.max(s.need, m.upTo | 0); s.play = m.play | 0; }
      }
      else if (m.t === 'param') { const s = SONGS.get(m.id); if (s) s.param(m.k, m.v); }
      else if (m.t === 'drop') { const s = SONGS.get(m.id); if (s) { s.free(); SONGS.delete(m.id); if (s.port) { try { s.port.onmessage = null; s.port.close(); } catch (e) { /* */ } } } }
      else if (m.t === 'stats') { let v = 0, cpu = 0; for (const s of SONGS.values()) { v += s.voices.length; cpu += s.cpu; } host.post({ t: 'stats', id: m.id, mem: memBytes, samples: STORE.size, want: WANT.size, voices: v, renderMs, renderN, cpu, songs: [...SONGS.values()].map((s) => ({ id: s.id, style: s.name, made: s.made, cpu: s.cpu, voices: s.voices.length, tempo: s.tempo, cents: s.cents, speaker: s.o.speaker, mono: s.mono })) }); }
      else if (m.t === 'warm') { for (const k of m.keys || []) want(k, perf() + 5000); }
    } catch (e) { log('msg', e); }
    kick();
  }
  // rendu hors ligne synchrone (tests, analyse) : tranches recollées par addition des fondus
  function offline(id, secs, onChunk, clock = perf) {
    const s = SONGS.get(id); if (!s) return null;
    const frames = Math.ceil(secs * SR / CHUNK) * CHUNK, L = new Float32Array(frames + OVL), R = s.mono ? null : new Float32Array(frames + OVL);
    for (let k = 0; k * CHUNK < frames; k++) {
      while (renderNext());
      const t0 = clock(), ch = s.chunk(); if (onChunk) onChunk(k, clock() - t0, s);
      for (let i = 0; i < ch[0].length; i++) { L[k * CHUNK + i] += ch[0][i]; if (R) R[k * CHUNK + i] += ch[1][i]; }
    }
    return { L: L.subarray(0, frames), R: R ? R.subarray(0, frames) : null };
  }
  return { receive, offline, score, STYLES, INSTR, renderKey, renderNext, SR, CHUNK, OVL, _songs: SONGS, _store: STORE, _want: WANT, stats: () => ({ memBytes, renderMs, renderN, store: STORE.size, warm: WARM.length, upgrade: UPGRADE.size }) };
}

// ═════════════════════════════════════════ FIL PRINCIPAL ═════════════════════════════════════════
const STYLE_NAMES = ['lofi', 'muzak', 'jazz', 'disco', 'rock', 'classical', 'synthwave', 'funk', 'chanson', 'reggae', 'metal', 'ambient', 'creepy_vinyl',
  'music_box', 'music_box_wrong', 'arcade', 'kiddie', 'cinema_score', 'piano_bar', 'radio_static_voice', 'hold_music', 'national_anthem_parody', 'xmas'];
const E_SR = 32000, E_CHUNK = 6400, LOOKAHEAD = 1.6, LOOKAHEAD_HIDDEN = 2.4, PUMP_MS = 60; // 1,6 s d'avance : un à-coup du jeu ne coupe pas la musique
const SPEAKER_NAMES = new Set(['radio', 'tv', 'pa', 'phone', 'toy', 'cinema', 'headphones', 'hifi', 'box', 'none']);
const RADIO_STYLES = new Set(['lofi', 'chanson', 'jazz', 'rock', 'classical', 'radio_static_voice']);
const clampM = (x, a, b) => (x < a ? a : x > b ? b : x);
const warnedM = new Set();
function warnOnce(key, ...msg) { if (warnedM.has(key)) return; warnedM.add(key); try { console.warn('[music]', ...msg); } catch (e) { /* */ } }
const LIVE = new Set(), BY_ID = new Map(), STATS_CB = new Map();
// processeur audio (AudioWorklet) : tampon circulaire à 32 kHz où les tranches s'additionnent (fondus de recouvrement),
// lecture rééchantillonnée (Hermite 4 points) au rythme du contexte, silence sans avancer si les données manquent,
// demandes de la suite envoyées directement au worker
const WORKLET_SRC = `class NbMusic extends AudioWorkletProcessor {
  constructor(opt) {
    super(); const o = (opt && opt.processorOptions) || {};
    this.id = o.id; this.N = o.chunk; this.look = Math.round(o.look * o.sr); this.nch = o.nch || 2; this.cap = 1 << 17; this.mask = this.cap - 1;
    this.buf = []; for (let c = 0; c < this.nch; c++) this.buf.push(new Float32Array(this.cap));
    this.have = 0; this.rd = 0; this.clr = 0; this.ratio = o.sr / sampleRate; this.alive = true; this.p = null; this.lastAsk = -1e9; this.rec = [];
    this.port.onmessage = (e) => { const m = e.data || {}; if (m.t === 'port' && m.port) { this.p = m.port; this.p.onmessage = (ev) => this.chunk(ev.data); this.ask(true); } else if (m.t === 'end') { this.alive = false; if (this.p) { try { this.p.onmessage = null; this.p.close(); } catch (x) { } } } };
  }
  chunk(m) {
    if (!m || m.t !== 'chunk' || !m.ch || !m.ch[0]) return;
    const off = m.k * this.N, len = m.ch[0].length, mask = this.mask;
    if (off >= this.clr && off + len - this.rd < this.cap - 256) {
      for (let c = 0; c < this.nch; c++) { const src = m.ch[c < m.ch.length ? c : 0], dst = this.buf[c]; for (let i = 0; i < len; i++) dst[(off + i) & mask] += src[i]; }
      if (off + this.N > this.have) this.have = off + this.N;
    }
    for (const a of m.ch) if (this.rec.length < 8) this.rec.push(a);
    this.ask(false);
  }
  ask(force) {
    if (!this.p || !this.alive) return;
    const play = Math.floor(this.rd);
    if (!force && play - this.lastAsk < 1600 && this.have - play > this.look * 0.6) return;
    this.lastAsk = play; const rec = this.rec; this.rec = [];
    const msg = { t: 'need', id: this.id, upTo: play + this.look, play, rec };
    try { this.p.postMessage(msg, rec.map((a) => a.buffer)); } catch (x) { try { msg.rec = null; this.p.postMessage(msg); } catch (y) { } }
  }
  process(inputs, outputs) {
    const out = outputs[0], n = out[0].length, r = this.ratio, mask = this.mask;
    if (this.rd + n * r + 4 > this.have) { for (const o of out) o.fill(0); this.ask(false); return this.alive; }
    let p = this.rd;
    for (let c = 0; c < out.length; c++) {
      const s = this.buf[c < this.nch ? c : 0], o = out[c]; p = this.rd;
      for (let i = 0; i < n; i++) {
        const ip = Math.floor(p), f = p - ip, xm = s[(ip - 1) & mask], x0 = s[ip & mask], x1 = s[(ip + 1) & mask], x2 = s[(ip + 2) & mask];
        o[i] = ((((0.5 * (x2 - xm) + 1.5 * (x0 - x1)) * f + (xm - 2.5 * x0 + 2 * x1 - 0.5 * x2)) * f + 0.5 * (x1 - xm)) * f) + x0; p += r;
      }
    }
    this.rd = p;
    const upto = Math.floor(p) - 3;
    if (upto > this.clr) { for (let c = 0; c < this.nch; c++) { const d = this.buf[c]; for (let i = this.clr; i < upto; i++) d[i & mask] = 0; } this.clr = upto; }
    this.ask(false);
    return this.alive;
  }
}
registerProcessor('nb-music', NbMusic);`;
const WK = { state: 0, ctx: null }; // 0 pas encore chargé, 1 en cours, 2 prêt, -1 indisponible
function loadWorklet(ctx) {
  if (!ctx || (WK.ctx === ctx && WK.state !== 0)) return;
  WK.ctx = ctx; WK.state = -1;
  const eng = engine();
  if (!eng || eng.kind !== 'worker' || !ctx.audioWorklet || typeof AudioWorkletNode === 'undefined' || typeof MessageChannel === 'undefined') return;
  try {
    WK.state = 1;
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }));
    ctx.audioWorklet.addModule(url).then(() => { if (WK.ctx === ctx) WK.state = 2; }, (e) => { WK.state = -1; warnOnce('worklet', 'AudioWorklet indisponible : lecture par tranches AudioBuffer', e); });
  } catch (e) { WK.state = -1; }
}
let ENG = null, nextId = 1, pumpT = null, noWorker = false, statsId = 0;
// moteur : worker construit à partir du code source de MusicEngine (aucun fichier de plus), sinon fil principal
function engine() {
  if (ENG) return ENG;
  if (!noWorker && typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
    try {
      const src = `'use strict';\nconst api = (${MusicEngine.toString()})({ post: (m, t) => self.postMessage(m, t || []) });\nself.onmessage = (e) => api.receive(e.data);\n`;
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { name: 'musique' });
      w.onmessage = (e) => onEngine(e.data);
      w.onerror = (e) => { try { e.preventDefault(); } catch (x) { /* */ } engineFailed('erreur du worker' + (e && e.message ? ' : ' + e.message : '')); };
      const post = (m, t) => {
        try { w.postMessage(m, t || []); } catch (err) {
          if (t && t.length) { try { m.rec = null; w.postMessage(m); return; } catch (e2) { /* */ } } // transfert refusé : message sans les tableaux
          engineFailed(err);
        }
      };
      ENG = { kind: 'worker', post, w };
    } catch (e) { ENG = null; }
  }
  if (!ENG) { // repli : même moteur sur le fil principal (messages asynchrones)
    const api = MusicEngine({ post: (m) => setTimeout(() => onEngine(m), 0) });
    ENG = { kind: 'inline', post: (m) => setTimeout(() => api.receive(m), 0) };
  }
  ENG.post({ t: 'init', rep: REPERTOIRE, inline: ENG.kind === 'inline', warm: ENG.kind === 'worker' });
  return ENG;
}
function engineFailed(why) {
  warnOnce('worker', 'worker de musique indisponible, calcul sur le fil principal :', why);
  try { ENG && ENG.w && ENG.w.terminate(); } catch (e) { /* */ }
  ENG = null; noWorker = true;
  for (const s of [...LIVE]) s.stop(0.2);
}
function onEngine(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'log') { warnOnce('eng:' + m.msg, '(moteur)', m.msg); return; }
  if (m.t === 'stats') { const cb = STATS_CB.get(m.id); if (cb) { STATS_CB.delete(m.id); cb(m); } return; }
  const s = BY_ID.get(m.id); if (!s) return;
  if (m.t === 'chunk') s.onChunk(m);
  else if (m.t === 'tracks') s.trackNames = m.names || [];
  else if (m.t === 'fail') s.stop(0);
}
function pump() {
  for (const s of LIVE) { try { s.request(); } catch (e) { warnOnce('pump', e); } }
  if (!LIVE.size && pumpT !== null) { clearInterval(pumpT); pumpT = null; }
}
const hidden = () => typeof document !== 'undefined' && !!document.hidden;
// bus « pa » (haut-parleurs du plafond) s'il existe vraiment dans le moteur audio, sinon bus musique
function resolveBus(o) {
  const want = typeof o.bus === 'string' && o.bus ? o.bus : 'music';
  if (want !== 'pa') return { name: want, pa: false, paFallback: false };
  let pa = null, sfx = null;
  try { pa = Audio.output('pa'); sfx = Audio.output('sfx'); } catch (e) { pa = null; }
  if (pa && pa !== sfx) return { name: 'pa', pa: true, paFallback: false };
  return { name: 'music', pa: false, paFallback: true };
}
// couleur du haut-parleur : explicite (opts.speaker), sinon déduite de la source (radio, TV, platine…)
function speakerFor(name, o, pos, bus) {
  if (typeof o.speaker === 'string' && SPEAKER_NAMES.has(o.speaker)) return o.speaker;
  if (bus.paFallback) return 'pa';
  if (bus.pa) return 'none';
  if (bus.name === 'ui') return 'phone';
  if (!pos) return 'headphones';
  if (name === 'music_box' || name === 'music_box_wrong') return 'box';
  if (o.seed !== undefined && o.seed !== null) return 'hifi'; // platine vinyle (graine du disque)
  if (RADIO_STYLES.has(name)) return 'radio';
  if (name === 'arcade') return 'toy'; // haut-parleur de borne ; les comptines passent surtout par les TV
  if (name === 'cinema_score' || name === 'piano_bar') return 'cinema';
  return 'tv';
}
class LiveSong {
  constructor(ctx, name, o) {
    this.ctx = ctx; this.id = nextId++; this.name = name; this.trackNames = []; this.srcs = new Set();
    this.vol = Number.isFinite(+o.volume) ? clampM(+o.volume, 0, 4) : 1;
    this.stopped = false; this.dead = false; this.endT = Infinity; this.T0 = null; this.reqUpTo = 0; this.lastPlay = 0; this.late = 0; this.got = 0;
    this.pool = []; this.rec = []; // tampons audio réutilisables (sources terminées) ; tableaux à rendre au moteur
    this.lastK = -1; this.slips = 0; // dernière tranche reçue ; glissements de la ligne de temps (fil principal bloqué)
    this.out = ctx.createGain(); this.out.gain.value = 0;
    const bus = resolveBus(o), pos = o.pos && typeof o.pos === 'object' ? o.pos : null;
    this.spatial = null;
    if (pos) {
      try { const sp = Audio.spatial({ pos, ref: o.ref ?? 2, maxDist: o.maxDist ?? 60, bus: bus.name, occlude: o.occlude ?? true, volume: 1 }); if (sp && sp.input) this.spatial = sp; } catch (e) { warnOnce('spatial', 'Audio.spatial indisponible', e); }
    }
    let dest = this.spatial ? this.spatial.input : null;
    if (!dest) { try { dest = Audio.output(bus.name); } catch (e) { dest = null; } }
    this.out.connect(dest || ctx.destination);
    const mono = !!this.spatial || bus.pa || bus.paFallback || bus.name === 'ui';
    this.speaker = speakerFor(name, o, pos, bus);
    LIVE.add(this); BY_ID.set(this.id, this);
    const eng = engine(); let port = null;
    loadWorklet(ctx);
    if (WK.state === 2 && WK.ctx === ctx && eng.kind === 'worker') { // voie directe worker → processeur audio
      try {
        this.node = new AudioWorkletNode(ctx, 'nb-music', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [mono ? 1 : 2], processorOptions: { id: this.id, sr: E_SR, chunk: E_CHUNK, look: LOOKAHEAD + 0.2, nch: mono ? 1 : 2 } });
        const mc = new MessageChannel(); this.node.port.postMessage({ t: 'port', port: mc.port1 }, [mc.port1]); port = mc.port2;
        this.node.onprocessorerror = () => { warnOnce('wkerr', 'erreur du processeur audio de musique'); WK.state = -1; this.stop(0); };
        this.node.connect(this.out); this.wk = true;
        const now = ctx.currentTime; this.out.gain.setValueAtTime(0, now); this.out.gain.linearRampToValueAtTime(this.vol, now + 0.02); this.T0 = now;
      } catch (e) { warnOnce('wknode', 'AudioWorkletNode impossible : tranches AudioBuffer', e); this.wk = false; port = null; try { this.node && this.node.disconnect(); } catch (x) { /* */ } this.node = null; }
    }
    eng.post({ t: 'new', id: this.id, style: name, seed: o.seed ?? undefined, mono, speaker: this.speaker, intensity: o.intensity, port }, port ? [port] : undefined);
    this.request();
    if (pumpT === null) pumpT = setInterval(pump, PUMP_MS);
  }
  // demande au moteur de calculer jusqu'à « tête de lecture + anticipation »
  request() {
    if (this.dead || !ENG) return;
    const now = this.ctx.currentTime;
    if (this.stopped && now > this.endT + 0.1) { this.dispose(); return; }
    if (this.wk) return; // le processeur audio réclame lui-même la suite au worker
    let play = 0, upTo;
    // sous-alimentation (onglet ou fil principal bloqué) : plutôt que de calculer de la musique déjà passée, la ligne
    // de temps glisse et le morceau reprend là où il s'était arrêté
    if (this.T0 !== null && this.lastK >= 0 && !this.stopped) { const endRecv = this.T0 + (this.lastK + 1) * E_CHUNK / E_SR; if (now > endRecv + 0.02) { this.T0 += now - endRecv; this.slips++; } }
    if (this.T0 === null) upTo = Math.round(E_SR * 0.42);
    else { play = Math.max(0, Math.round((now - this.T0) * E_SR)); upTo = play + Math.round((hidden() ? LOOKAHEAD_HIDDEN : LOOKAHEAD) * E_SR); }
    if (this.stopped) upTo = Math.min(upTo, Math.round((this.endT - (this.T0 ?? now) + 0.1) * E_SR));
    if (upTo > this.reqUpTo || play - this.lastPlay > E_CHUNK) {
      const rec = this.rec.length ? this.rec : null; this.rec = [];
      ENG.post({ t: 'need', id: this.id, upTo, play, rec }, rec && ENG.kind === 'worker' ? rec.map((a) => a.buffer) : undefined);
      this.reqUpTo = Math.max(this.reqUpTo, upTo); this.lastPlay = play;
    }
  }
  onChunk(m) {
    if (this.dead) return;
    const ctx = this.ctx, now = ctx.currentTime, ch = m.ch, frames = ch[0].length;
    if (this.T0 === null) { // premier son : le morceau commence maintenant (fondu de 15 ms)
      this.T0 = now + 0.035; const g = this.out.gain; g.cancelScheduledValues(now); g.setValueAtTime(0, now);
      if (!this.stopped) { g.setValueAtTime(0, this.T0); g.linearRampToValueAtTime(this.vol, this.T0 + 0.015); }
    }
    let t = this.T0 + m.k * E_CHUNK / E_SR;
    if (t < now + 0.004 && !this.stopped && m.k > this.lastK) { this.T0 += now + 0.02 - t; t = now + 0.02; this.slips++; } // tranche en retard : on décale plutôt que de sauter
    const end = t + frames / E_SR;
    const giveBack = () => { if (this.rec.length < 8) for (const a of ch) if (a.buffer && a.buffer.byteLength) this.rec.push(a); };
    if (end <= now + 0.003 || (this.stopped && t > this.endT)) { if (end <= now + 0.003) this.late++; giveBack(); return; }
    if (m.k > this.lastK) this.lastK = m.k;
    let buf = null;
    while (!buf && this.pool.length) { const b = this.pool.pop(); if (b.length === frames && b.numberOfChannels === ch.length) buf = b; }
    try { if (!buf) buf = ctx.createBuffer(ch.length, frames, E_SR); for (let c = 0; c < ch.length; c++) buf.copyToChannel(ch[c], c); } catch (e) { warnOnce('buf', 'tampon impossible', e); return; }
    giveBack();
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(this.out);
    if (t >= now) src.start(t); else src.start(now, now - t);
    this.srcs.add(src); this.got++;
    src.onended = () => { this.srcs.delete(src); if (this.pool.length < 6 && !this.dead) this.pool.push(buf); try { src.disconnect(); } catch (e) { /* */ } };
    this.request();
  }
  setVolume(v, ramp = 0.1) {
    if (this.dead || this.stopped) return; const x = +v; if (!Number.isFinite(x)) return;
    this.vol = clampM(x, 0, 4); if (this.T0 === null && !this.wk) return;
    const now = this.ctx.currentTime, g = this.out.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(this.vol, now + Math.max(0.01, +ramp || 0));
  }
  setParam(k, v) { if (!this.dead && ENG && typeof k === 'string') ENG.post({ t: 'param', id: this.id, k, v: typeof v === 'number' ? v : +v }); }
  setPos(v) { if (!this.dead && this.spatial && v && typeof v === 'object') this.spatial.setPos(v); }
  stop(fade = 0.5) {
    if (this.dead) return;
    const now = this.ctx.currentTime, f = clampM(Number.isFinite(+fade) ? +fade : 0.5, 0, 30);
    if (this.stopped && now + f >= this.endT) return;
    this.stopped = true; this.endT = now + f;
    const g = this.out.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
    if (f > 0.01) g.linearRampToValueAtTime(0, now + f); else g.setTargetAtTime(0, now, 0.004);
    clearTimeout(this.killT); this.killT = setTimeout(() => this.dispose(), (f + 0.15) * 1000);
  }
  dispose() {
    if (this.dead) return; this.dead = true; this.stopped = true; clearTimeout(this.killT);
    for (const s of this.srcs) { try { s.onended = null; s.stop(); s.disconnect(); } catch (e) { /* */ } }
    this.srcs.clear(); this.pool = []; this.rec = [];
    if (this.node) { try { this.node.port.postMessage({ t: 'end' }); this.node.onprocessorerror = null; this.node.disconnect(); } catch (e) { /* */ } this.node = null; }
    try { this.out.disconnect(); } catch (e) { /* */ }
    try { this.spatial?.dispose(); } catch (e) { /* */ }
    LIVE.delete(this); BY_ID.delete(this.id);
    if (ENG) ENG.post({ t: 'drop', id: this.id });
  }
}

// ───────────────────────── API publique ─────────────────────────
const dummy = () => ({ playing: false, style: null, tracks: [], stop() { }, setPos() { }, setVolume() { }, setParam() { } });
function handle(s) {
  return {
    get playing() { return !s.stopped && !s.dead; },
    get style() { return s.name; },
    get tracks() { return s.trackNames.slice(); },
    stop(fade = 0.5) { try { s.stop(fade); } catch (e) { warnOnce('stop', e); } },
    setPos(v) { try { s.setPos(v); } catch (e) { warnOnce('setPos', e); } },
    setVolume(v, ramp = 0.1) { try { s.setVolume(v, ramp); } catch (e) { warnOnce('setVolume', e); } },
    setParam(k, v) { try { s.setParam(k, v); } catch (e) { warnOnce('setParam', e); } },
  };
}
export const Music = {
  styles: STYLE_NAMES.slice(),
  // style : nom (repli « muzak »), opts : { pos (→ spatialisé), volume = 1, bus = 'music' | 'pa' | …, seed, ref, maxDist,
  // intensity, speaker ('radio'|'tv'|'pa'|'phone'|'toy'|'cinema'|'headphones'|'hifi'|'box'|'none') }
  play(style, opts) {
    try {
      const o = opts && typeof opts === 'object' ? opts : {};
      let ctx = Audio.ctx;
      if (!ctx) { try { Audio.init(); } catch (e) { /* */ } ctx = Audio.ctx; }
      if (!ctx) return dummy();
      let name = String(style ?? '');
      if (!STYLE_NAMES.includes(name)) { warnOnce('style:' + name, `style inconnu « ${name} » : repli sur « muzak »`); name = 'muzak'; }
      return handle(new LiveSong(ctx, name, o));
    } catch (e) { warnOnce('play:' + style, 'Music.play a échoué', e); return dummy(); }
  },
  // arrête tous les morceaux en cours (changement de scène, fin de partie)
  stopAll(fade = 0.5) { for (const s of [...LIVE]) { try { s.stop(fade); } catch (e) { /* */ } } },
  get active() { return LIVE.size; },
  // outils (tests) : statistiques du moteur (asynchrone), type de moteur
  _stats() { return new Promise((res) => { if (!ENG) { res(null); return; } const id = ++statsId; STATS_CB.set(id, res); ENG.post({ t: 'stats', id }); setTimeout(() => { if (STATS_CB.delete(id)) res(null); }, 2000); }); },
  get _engineKind() { return ENG ? ENG.kind : null; },
  get _worklet() { return WK.state === 2 ? 'prêt' : WK.state === 1 ? 'chargement' : WK.state === -1 ? 'indisponible' : 'non chargé'; },
  get _paths() { let w = 0, b = 0; for (const s of LIVE) { if (s.wk) w++; else b++; } return { worklet: w, buffers: b }; },
};
// le worker est préparé dès le chargement (analyse du code hors du fil principal) : le premier morceau démarre vite
if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
  let tries = 0;
  const prep = () => { try { engine(); if (Audio.ctx) loadWorklet(Audio.ctx); else if (++tries < 30) setTimeout(prep, 2000); } catch (e) { /* */ } };
  setTimeout(prep, 0);
}
