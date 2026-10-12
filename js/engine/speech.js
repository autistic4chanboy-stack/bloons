// Voix des personnages : babillage « à la Animal Crossing » (plus aucune synthèse vocale du navigateur). Chaque réplique
// devient une rafale de petites syllabes synthétisées, à peu près une par lettre prononcée (digrammes et lettres muettes
// du français pris en compte), dont la couleur de voyelle suit le texte affiché ; la ponctuation fait des pauses et la
// durée suit la longueur du texte (toujours plus courte que le sous-titre). Chaque personnage a sa hauteur, son débit et
// son timbre : Gérard grave et bourru, braqueurs graves et pressés, enfants aigus, police et pompiers secs, clients et
// commerçants variés (hommes, femmes) ; l'annonceur passe par la sono (bus « pa ») après son carillon, le téléphone par
// le combiné (bande étroite), la radio et le talkie-walkie grésillent, les jouets parlent par leur petit haut-parleur.
// Coût : un petit graphe WebAudio par réplique (oscillateur, deux formants, un bruit pour les consonnes), entièrement
// programmé d'avance par automatismes d'AudioParam puis détruit : rien à calculer à chaque image. Une seule réplique à
// la fois par personnage (file courte), trois au plus en même temps ; l'ambiance s'efface un peu pendant qu'on parle.
// Les sous-titres restent gérés par l'UI (game.say).
import { Audio } from './audio.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── phonèmes (approximation du français écrit) ──
// voyelles et sonantes : formants F1, F2 (Hz, voix d'homme ; multipliés par k selon la voix) ; A : nasale « an »
const FM = {
  a: [740, 1300], e: [420, 2000], E: [560, 1750], i: [300, 2200], o: [450, 850], O: [560, 950], u: [330, 780], y: [300, 1800],
  2: [420, 1450], '@': [500, 1450], A: [650, 1050], m: [280, 1000], n: [290, 1500], l: [370, 1250], r: [520, 1250], w: [330, 800], j: [300, 2150],
};
// bruit des consonnes : [centre (Hz), Q, niveau, durée de la bouffée (s, 0 = toute la case)]
const NZ = { p: [900, 0.9, 0.55, 0.012], t: [3600, 1.1, 0.55, 0.012], k: [2100, 1.2, 0.6, 0.016], f: [4300, 0.7, 0.24, 0], s: [5600, 1.8, 0.36, 0], S: [2800, 1.4, 0.38, 0] };
const VOW = 'aàâäeéèêëiîïoôöuùûüyÿ';
const isV = (c) => !!c && VOW.includes(c);
const DIGITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const MONO_E = new Set(['le', 'de', 'je', 'me', 'te', 'se', 'ce', 'ne', 'que']); // e prononcé
const MONO_ES = new Set(['les', 'des', 'mes', 'tes', 'ses', 'ces']);            // « é »

// mot → phonèmes {t: 'V'|'S'|'C', f: formants, n: bruit, v: voisée, nas: nasale}
function word(w, out) {
  const P = (o) => out.push(o), V = (f, nas) => P({ t: 'V', f, nas }), S = (f) => P({ t: 'S', f }), C = (n, v) => P({ t: 'C', n, v });
  if (/^\d+$/.test(w)) { for (const d of w) word(DIGITS[+d], out); return; }
  let s = w.replace(/['’]/g, '');
  if (!s) return;
  if (s === 'et') { V('e'); return; } if (s === 'est') { V('E'); return; }
  if (MONO_ES.has(s)) { word(s[0], out); V('e'); return; }
  if (s.length > 2 && /e[rz]$/.test(s) && s !== 'hier' && s !== 'fer' && s !== 'mer') s = s.slice(0, -2) + 'é'; // parler, allez
  let end = s.length;
  if (end > 2 && /ent$/.test(s) && !isV(s[end - 4] || '')) end -= 2; // ils parlent (approximatif)
  if (end > 1 && 'stdxzp'.includes(s[end - 1]) && !(end === 2 && isV(s[0]) === false && s[1] === 's')) end--; // finales muettes
  if (end > 2 && s[end - 1] === 'e' && !isV(s[end - 2]) && !MONO_E.has(s)) end--; // e muet final
  for (let i = 0; i < end;) {
    const c = s[i], n = s[i + 1] || '', n2 = s[i + 2] || '', di = c + n;
    const nasal = (n === 'n' || n === 'm') && !isV(n2) && n2 !== n;
    if (s.startsWith('eau', i)) { V('o'); i += 3; continue; }
    if (di === 'ou' || di === 'où' || di === 'oû') { V('u'); i += 2; continue; }
    if (di === 'au') { V('o'); i += 2; continue; }
    if ((di === 'ai' || di === 'ei' || di === 'aî') && (n2 === 'n' || n2 === 'm') && !isV(s[i + 3] || '')) { V('E', 1); i += 3; continue; }
    if (di === 'ai' || di === 'ei' || di === 'aî') { V('E'); i += 2; continue; }
    if (di === 'eu' || di === 'œu') { V('2'); i += 2; continue; }
    if (di === 'oi' || di === 'oy') { S('w'); V('a'); i += 2; continue; }
    if ((c === 'a' || c === 'e') && nasal) { V('A', 1); i += 2; continue; }
    if (c === 'o' && nasal) { V('O', 1); i += 2; continue; }
    if ((c === 'i' || c === 'u' || c === 'y') && nasal) { V('E', 1); i += 2; continue; }
    if (di === 'ch') { C('S'); i += 2; continue; }
    if (di === 'ph') { C('f'); i += 2; continue; }
    if (di === 'qu') { C('k'); i += 2; continue; }
    if (di === 'gn') { S('n'); S('j'); i += 2; continue; }
    if (c === n && !isV(c)) { i++; continue; } // consonne double
    switch (c) {
      case 'a': case 'à': case 'â': case 'ä': V('a'); break;
      case 'e': V(!isV(n) && n && !isV(n2) && n2 ? 'E' : i === end - 1 ? '@' : '@'); break; // e devant deux consonnes : « è »
      case 'é': V('e'); break;
      case 'è': case 'ê': case 'ë': V('E'); break;
      case 'i': case 'î': case 'ï': case 'y': case 'ÿ': if (isV(n) && i > 0) S('j'); else V('i'); break;
      case 'o': case 'ô': case 'ö': V(isV(n) ? 'o' : !n || i === end - 1 ? 'o' : 'O'); break;
      case 'u': case 'ù': case 'û': case 'ü': if (isV(n) && n !== 'e') S('w'); else V('y'); break;
      case 'p': case 't': case 'k': C(c); break;
      case 'b': C('p', 1); break; case 'd': C('t', 1); break;
      case 'c': C(n === 'e' || n === 'i' || n === 'y' || n === 'é' || n === 'è' ? 's' : 'k'); break;
      case 'ç': C('s'); break;
      case 'g': if (n === 'e' || n === 'i' || n === 'y' || n === 'é') C('S', 1); else C('k', 1); break;
      case 'j': C('S', 1); break;
      case 'f': C('f'); break; case 'v': C('f', 1); break;
      case 's': if (isV(s[i - 1]) && isV(n)) C('s', 1); else C('s'); break;
      case 'z': C('s', 1); break;
      case 'x': C('k'); C('s'); break;
      case 'm': case 'n': case 'l': case 'r': case 'w': S(c); break;
      default: break; // h muet, signes inconnus
    }
    i++;
  }
}
// texte → suite d'unités temporelles : phonèmes, coupures entre mots, pauses de ponctuation (fin de phrase marquée)
function parse(text) {
  const t = String(text || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[«»♪"*_~]/g, ' ').replace(/œ/g, 'eu').replace(/æ/g, 'é');
  const out = [];
  for (const m of t.matchAll(/[a-zàâäéèêëîïôöùûüçÿœ'’]+|\d+|\.\.\.|…|[.,;:!?—–-]/g)) {
    const w = m[0];
    if (/^[a-zàâäéèêëîïôöùûüçÿœ'’\d]/.test(w)) { const n0 = out.length; word(w, out); if (out.length > n0) out.push({ t: 'G' }); continue; }
    const k = w === '…' || w === '...' ? 'ell' : w === '?' ? 'q' : w === '!' ? 'x' : w === '.' ? 'dot' : w === ',' ? 'com' : 'sem';
    if (out.length && out[out.length - 1].t === 'G') out.pop();
    if (!out.length) continue; // ponctuation en tête : pas de silence avant la première syllabe
    if (out[out.length - 1].t === 'P') { const o = out[out.length - 1]; if (PAUSE[k] > PAUSE[o.k]) o.k = k; continue; } // « ?! », « … . » : une seule pause
    out.push({ t: 'P', k });
  }
  while (out.length && (out[out.length - 1].t === 'G' || out[out.length - 1].t === 'P')) out.pop();
  return out;
}
// durées relatives (en « pas » de la voix) et pauses
const W = { V: 1, Vn: 1.1, S: 0.55, Cp: 0.42, Cf: 0.62, G: 0.38 };
const PAUSE = { com: 3.2, sem: 3.6, dot: 5.5, q: 5.5, x: 5, ell: 7.5 };

// ── personnages ──
// f0 (Hz), k (formants), step (s par lettre), vr (variation de hauteur, demi-tons), gruff (rugosité), clip (syllabes
// sèches), wave ('g' glottale, 'b' brillante, 'q' carrée), whisper (chuchoté), chan ('pa'|'phone'|'radio'|'spk'), g (niveau)
const MAN = { f0: 122, k: 1, step: 0.058, vr: 1.7, g: 1 }, WOMAN = { f0: 212, k: 1.15, step: 0.056, vr: 1.9, g: 0.95 };
const P = {
  gerard: { f0: 94, k: 0.9, step: 0.066, vr: 1.25, gruff: 0.5, g: 1.05 },
  robber: { f0: 106, k: 0.95, step: 0.041, vr: 1, gruff: 0.18, clip: 0.25, g: 1 },
  child: { f0: 318, k: 1.3, step: 0.05, vr: 2.4, wave: 'b', g: 0.9 },
  official: { f0: 142, k: 1, step: 0.047, vr: 0.9, clip: 0.6, g: 1 },
  announcer: { f0: 202, k: 1.12, step: 0.06, vr: 0.8, chan: 'pa', g: 1.15 },
  parrot: { f0: 560, k: 1.5, step: 0.044, vr: 3.2, wave: 'b', squawk: 1, g: 0.8 },
  robot: { f0: 138, k: 1, step: 0.06, vr: 0, wave: 'q', clip: 0.3, g: 0.75 },
  creepy: { f0: 0, k: 1.05, step: 0.072, vr: 0, whisper: 1, g: 0.6 },
  old: { f0: 188, k: 1.1, step: 0.066, vr: 2.1, trem: 1, g: 0.9 },
  doll: { f0: 360, k: 1.32, step: 0.058, vr: 1.2, wave: 'b', chan: 'spk', g: 0.8 },
};
const FEM = ['mme', 'madame', 'mademoiselle', 'maman', 'dame', 'cliente', 'sandrine', 'nadia', 'claire', 'lucie', 'josiane', 'opératrice', 'horloge', 'morel', 'lefèvre', 'vasseur', 'masque', 'message', 'enceinte', 'infirmière', 'mère', 'fille'];
const has = (w, list) => list.some((x) => w.includes(x));
// nom affiché → profil (+ indices du jeu : fem, seed, style, channel)
function profile(who, o = {}) {
  const w = String(who || '').toLowerCase().replace(/\s*\(au loin\)\s*$/, '').trim();
  let b = null, chan = o.channel || null;
  if (o.style === 'parrot' || w === 'coco') b = P.parrot;
  else if (w.includes('gérard')) b = P.gerard;
  else if (w.includes('braqueur') || w.includes('parking')) b = P.robber;
  else if (w.includes('annonce') || w.includes('haut-parleur')) { b = w.includes('enfant') ? { ...P.child, chan: 'pa', step: 0.06 } : P.announcer; }
  else if (w.includes('enfant') || w.includes('lucie') || w.includes('bobby')) b = w.includes('bobby') ? { ...P.child, chan: 'spk', f0: 290 } : P.child;
  else if (w.includes('poupée') || w.includes('téléphone jouet')) b = P.doll;
  else if (w.includes('polic') || w.includes('pompier') || w.includes('opérat') || w.includes('samu') || w.includes('commissariat')) b = P.official;
  else if (w.includes('synthétique') || w.includes('minitel') || w.includes('horloge parlante')) b = P.robot;
  else if (w === '???' || w === '…' || w === '?' || w.includes('tête à perruque')) b = P.creepy;
  else if (w.includes('vieille')) b = P.old;
  else if (w.includes('radio') || w.includes('talkie')) { b = MAN; chan = chan || 'radio'; }
  else if (w.includes('enceinte')) { b = WOMAN; chan = chan || 'spk'; }
  const known = !!b;
  if (!b) b = o.fem ?? has(w, FEM) ? WOMAN : MAN;
  const r = rng(hash(w) ^ Math.imul((o.seed | 0) + 1, 0x9E3779B1));
  const p = { ...b, key: w || '?', chan: chan || b.chan || null };
  // variété : deux clients ne se ressemblent pas (le profil d'un personnage nommé reste à peu près le sien)
  const sp = known ? 0.05 : 1;
  p.f0 *= 1 + sp * (r() * 0.24 - 0.1); p.k *= 1 + sp * (r() * 0.08 - 0.04); p.step *= 1 + sp * (r() * 0.16 - 0.08);
  if (!known && o.pitch) { p.f0 *= clamp(o.pitch, 0.4, 2.5); p.k *= clamp(Math.pow(o.pitch, 0.35), 0.8, 1.35); } // réglage d'époque (voix synthétique) : seulement pour les inconnus
  if (o.rate) p.step /= clamp(o.rate, 0.5, 2);
  return p;
}

// ── synthèse ──
let R = null; // ressources partagées par contexte : formes d'onde, bruit, courbe de saturation
function res(ctx) {
  if (R && R.ctx === ctx) return R;
  const wave = (fn, n = 28) => { const re = new Float32Array(n + 1), im = new Float32Array(n + 1); for (let h = 1; h <= n; h++) im[h] = fn(h); return ctx.createPeriodicWave(re, im); };
  const nb = ctx.createBuffer(1, Math.round(ctx.sampleRate * 1.5), ctx.sampleRate), d = nb.getChannelData(0), r = rng(0x5EED);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  const cv = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
  R = { ctx, g: wave((h) => Math.pow(h, -1.15) * (h % 2 ? 1 : 0.85)), b: wave((h) => Math.pow(h, -0.85)), q: wave((h) => (h % 2 ? 1 / h : 0)), noise: nb, curve: cv };
  return R;
}
// niveau : une réplique à volume 1 sort vers −20 dBFS efficaces (mesuré), comme une voix proche
const NORM = 2.4;

class Line {
  constructor(S, text, p, o) {
    const ctx = Audio.ctx, X = res(ctx), seq = parse(text), r = rng(hash(text) ^ 0xA5A5);
    this.S = S; this.p = p; this.key = p.key; this.alive = true; this.nodes = []; this.srcs = [];
    const t0 = this.t0 = ctx.currentTime + 0.04, k = p.k, whisper = !!p.whisper, f0 = p.f0;
    // durée : pas de la voix, ramené si besoin pour rester sous la durée du sous-titre (lecture ≈ 15 lettres/s)
    let units = 0; for (const x of seq) units += x.t === 'P' ? PAUSE[x.k] : x.t === 'G' ? W.G : x.t === 'V' ? (x.nas ? W.Vn : W.V) : x.t === 'S' ? W.S : NZ[x.n][3] ? W.Cp : W.Cf;
    const cap = Math.max(1.2, String(text).length * 0.056 + 0.5), step = units * p.step > cap ? cap / units : p.step;
    this.dur = units * step;
    // graphe : source (oscillateur, ou bruit pour un chuchotement) → enveloppe → [F1 | F2 | corps] → couleur → sortie
    const N = (n) => { this.nodes.push(n); return n; }, G = (v) => { const g = N(ctx.createGain()); g.gain.value = v; return g; };
    const BQ = (type, f, q) => { const b = N(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    let src;
    if (whisper) { src = N(ctx.createBufferSource()); src.buffer = X.noise; src.loop = true; }
    else { src = N(ctx.createOscillator()); src.setPeriodicWave(X[p.wave || 'g']); src.frequency.value = f0; }
    this.srcs.push(src);
    const env = G(0), f1 = BQ('bandpass', 500 * k, whisper ? 4 : 3.2), f2 = BQ('bandpass', 1500 * k, whisper ? 7 : 5.5), body = BQ('lowpass', 900 * k, 0.7);
    const mix = G(1); src.connect(env); env.connect(f1); env.connect(f2); env.connect(body);
    f1.connect(G(1)).connect(mix); f2.connect(G(whisper ? 1.3 : 0.75)).connect(mix); body.connect(G(whisper ? 0 : 0.22)).connect(mix);
    let head = mix;
    if (p.gruff || p.trem) { // rugosité (voix bourrue) ou chevrotement : modulation d'amplitude rapide après l'enveloppe
      const am = G(1), lfo = N(ctx.createOscillator()); lfo.type = p.gruff ? 'triangle' : 'sine'; lfo.frequency.value = p.gruff ? 31 + 6 * r() : 6.5;
      const dep = G(p.gruff ? 0.55 * p.gruff : 0.25); lfo.connect(dep); dep.connect(am.gain); head.connect(am); head = am; lfo.start(t0); this.srcs.push(lfo);
    }
    if (p.squawk && !whisper) { const lfo = N(ctx.createOscillator()), dep = G(70); lfo.frequency.value = 23; lfo.connect(dep); dep.connect(src.detune); lfo.start(t0); this.srcs.push(lfo); } // perroquet : voix qui grince
    // consonnes : bruit filtré dans le même mélange
    const nsrc = N(ctx.createBufferSource()); nsrc.buffer = X.noise; nsrc.loop = true; this.srcs.push(nsrc);
    const nbp = BQ('bandpass', 3000, 1), namp = G(0); nsrc.connect(nbp); nbp.connect(namp); namp.connect(head);
    // couleur du canal, puis sortie
    const chain = [], q = p.chan;
    if (q === 'phone') chain.push(BQ('highpass', 340, 0.7), BQ('lowpass', 3300, 0.8), BQ('peaking', 1700, 1.1), N(ctx.createWaveShaper()));
    else if (q === 'radio') chain.push(BQ('highpass', 480, 0.8), BQ('lowpass', 2600, 0.9), N(ctx.createWaveShaper()));
    else if (q === 'spk') chain.push(BQ('highpass', 420, 0.7), BQ('lowpass', 4300, 0.8), BQ('peaking', 2300, 1.2));
    else if (q !== 'pa') chain.push(BQ('highpass', 85, 0.7));
    for (const n of chain) { if (n.type === 'peaking') n.gain.value = 5; if (n instanceof WaveShaperNode) n.curve = X.curve; }
    const walls = clamp(o.walls | 0, 0, 3); if (walls && q !== 'pa' && q !== 'phone') chain.push(BQ('lowpass', [20000, 2500, 900, 450][walls], 0.6)); // à travers les murs : étouffé
    const out = this.out = G(0);
    for (const n of chain) { head.connect(n); head = n; }
    head.connect(out);
    if (q === 'radio') { // grésillement du haut-parleur pendant la réplique
      const st = N(ctx.createBufferSource()), sb = BQ('bandpass', 2200, 0.7), sg = G(0.05); st.buffer = X.noise; st.loop = true; st.playbackRate.value = 0.7;
      st.connect(sb); sb.connect(sg); sg.connect(out); st.start(t0); this.srcs.push(st);
    }
    let dest = null;
    if (q === 'pa') dest = Audio.output('pa');
    else if (q === 'phone') dest = Audio.output('voice');
    else { this.sp = Audio.spatial({ pos: o.pos || null, bus: 'voice', ref: 1000, maxDist: 1e5, occlude: false, rev: o.pos ? 0.8 : 0.6, volume: 1 }); dest = this.sp && this.sp.input; }
    if (!dest) { this.dispose(); this.alive = false; return; }
    out.connect(dest);
    const vol = clamp(o.volume ?? 0.9, 0, 1.5) * p.g * NORM * S.volume;
    out.gain.setValueAtTime(0, t0 - 0.03); out.gain.linearRampToValueAtTime(vol, t0);
    // programmation : chaque unité à son instant, intonation de phrase (déclinaison, question qui monte, exclamation)
    const E = env.gain, Fq = whisper ? null : src.frequency, F1 = f1.frequency, F2 = f2.frequency, NA = namp.gain, NF = nbp.frequency, NQ = nbp.Q;
    const att = p.clip ? 0.004 : 0.008, hold = p.clip ? 0.62 - 0.3 * p.clip : 0.72, vr = p.vr, ST = [0, 2, -1, 3, -2, 1, 4, -3];
    let t = t0, last = 0, lastF = [500 * k, 1500 * k];
    const phrase = (i) => { // bornes de la phrase courante et sa ponctuation finale
      let j = i; while (j < seq.length && !(seq[j].t === 'P' && seq[j].k !== 'com' && seq[j].k !== 'sem')) j++;
      return seq[j] ? seq[j].k : 'dot';
    };
    let pk = phrase(0), pStart = 0, pLen = 1;
    const span = (i) => { let u = 0; for (let j = i; j < seq.length; j++) { const x = seq[j]; if (x.t === 'P' && x.k !== 'com' && x.k !== 'sem') break; u += x.t === 'P' ? PAUSE[x.k] : 1; } return Math.max(1, u * step); };
    pLen = span(0); pStart = t0;
    const pitchAt = (tt) => {
      const u = clamp((tt - pStart) / pLen, 0, 1);
      let m = 1.06 - 0.12 * u; // déclinaison
      if (pk === 'q' && u > 0.65) m *= 1 + 0.35 * (u - 0.65) / 0.35; else if (pk === 'x') m *= 1.07; else if (pk === 'ell') m *= 1 - 0.08 * u;
      return m;
    };
    const blip = (tt, d, f, a, F, glide) => { // syllabe voisée (ou chuchotée)
      const fa = [F[0] * k, F[1] * k];
      F1.setTargetAtTime(fa[0], tt - 0.006, 0.007); F2.setTargetAtTime(fa[1], tt - 0.006, 0.007);
      if (Fq && f > 0) { Fq.setTargetAtTime(f * (glide ? 1.045 : 1), tt - 0.004, 0.003); Fq.setTargetAtTime(f, tt + 0.006, d * 0.35); }
      E.setTargetAtTime(a, tt, att / 3); E.setTargetAtTime(0, tt + d * hold, d * 0.12 + 0.006);
      lastF = fa;
    };
    for (let i = 0; i < seq.length; i++) {
      const x = seq[i];
      if (x.t === 'P') {
        t += PAUSE[x.k] * step;
        if (x.k !== 'com' && x.k !== 'sem') { pk = phrase(i + 1); pStart = t; pLen = span(i + 1); }
        continue;
      }
      if (x.t === 'G') { t += W.G * step; continue; }
      const m = pitchAt(t), endW = !seq[i + 1] || seq[i + 1].t !== 'V' && seq[i + 1].t !== 'S' && seq[i + 1].t !== 'C';
      if (x.t === 'V') {
        const d = (x.nas ? W.Vn : W.V) * step;
        let s = ST[(r() * ST.length) | 0]; if (s === last) s = ST[(ST.indexOf(s) + 3) % ST.length]; last = s;
        const f = f0 * m * Math.pow(2, s * vr / 12 / 2) * (1 + (r() - 0.5) * 0.03);
        const F = FM[x.f] || FM['@'], Fn = x.nas ? [F[0] * 0.9, F[1] * 0.85] : F;
        blip(t, d * 1.08, f, (x.nas ? 0.78 : 1) * (endW ? 1.1 : 0.95) * (0.88 + 0.12 * r()) * (pk === 'x' ? 1.1 : pk === 'ell' ? 0.85 : 1), Fn, true);
        t += d;
      } else if (x.t === 'S') { // sonante : voisée, plus douce, formants propres
        const d = W.S * step; blip(t, d * 1.1, f0 * m, 0.5, FM[x.f] || FM.n, false); t += d;
      } else { // consonne : bouffée de bruit (+ murmure voisé si sonore)
        const [fc, qq, lv, burst] = NZ[x.n], d = (burst ? W.Cp : W.Cf) * step, b = burst || d * 0.75;
        NF.setValueAtTime(fc * (0.92 + 0.16 * r()), t - 0.002); NQ.setValueAtTime(qq, t - 0.002);
        NA.setTargetAtTime(lv * (whisper ? 0.8 : 1), t, burst ? 0.0008 : 0.008); NA.setTargetAtTime(0, t + b, burst ? 0.005 : 0.012);
        if (x.v && !whisper) blip(t, d, f0 * m * 0.97, 0.22, [260, lastF[1] / k], false);
        t += d;
      }
    }
    const end = t + 0.25;
    src.start(t0); nsrc.start(t0);
    for (const s of this.srcs) { try { s.stop(end); } catch (e) { /* */ } }
    out.gain.setTargetAtTime(0, t + 0.08, 0.04);
    this.end = end;
    this.timer = setTimeout(() => this.finish(), Math.max(200, (end - ctx.currentTime) * 1000 + 120));
  }
  stop(fade = 0.06) {
    if (!this.alive || this.stopping) return; this.stopping = true;
    const ctx = Audio.ctx, t = ctx.currentTime;
    try { const g = this.out.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade); } catch (e) { /* */ }
    clearTimeout(this.timer); this.timer = setTimeout(() => this.finish(), fade * 1000 + 60);
  }
  finish() {
    if (!this.alive) return; this.alive = false; clearTimeout(this.timer);
    this.dispose(); this.S.ended(this);
  }
  dispose() {
    for (const s of this.srcs) { try { s.stop(); } catch (e) { /* */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* */ } }
    try { this.out && this.out.disconnect(); } catch (e) { /* */ }
    try { this.sp && this.sp.dispose(); } catch (e) { /* */ }
    this.nodes.length = 0; this.srcs.length = 0;
  }
}

export const Speech = {
  enabled: true, volume: 1, lines: [], queues: new Map(),
  init() { this.enabled = true; },
  profile,
  // opts : who, volume (0..1, déjà atténué par la distance), pos [x, y, z] (spatialisée), walls (étouffement), channel
  // ('phone'|'pa'|'radio'|'spk'), style ('parrot'), pitch / rate (anciens réglages, voix inconnues), fem, seed, interrupt
  say(text, opts = {}) {
    if (!this.enabled || !text || !Audio.ctx || this.volume <= 0) return;
    try {
      const p = profile(opts.who, opts);
      if (!parse(text).some((x) => x.t === 'V')) return; // rien de prononçable (« … »)
      const busy = this.lines.find((l) => l.alive && l.key === p.key);
      if (busy && !opts.interrupt) { // une seule réplique à la fois par personnage : file d'attente courte
        let q = this.queues.get(p.key); if (!q) this.queues.set(p.key, (q = []));
        q.push([text, opts]); if (q.length > 2) q.shift();
        return;
      }
      if (busy) { busy.stop(); this.queues.delete(p.key); }
      this.start(text, p, opts);
    } catch (e) { /* pas de voix */ }
  },
  start(text, p, opts) {
    const live = this.lines.filter((l) => l.alive && !l.stopping);
    if (live.length >= 3) { const old = live.find((l) => l.p.chan !== 'phone') || live[0]; old.stop(); } // trois voix au plus
    const dying = this.lines.filter((l) => l.alive && l.stopping); if (dying.length > 3) dying[0].finish(); // rafale : on libère tout de suite
    const l = new Line(this, text, p, opts);
    if (!l.alive) return;
    this.lines.push(l);
    try { Audio.duck?.(p.chan === 'pa' ? 0.25 : 0.35, l.dur + 0.4); } catch (e) { /* */ } // l'ambiance s'efface un peu
  },
  ended(l) {
    this.lines = this.lines.filter((x) => x !== l && x.alive);
    const q = this.queues.get(l.key);
    if (q && q.length) { const [text, opts] = q.shift(); if (!q.length) this.queues.delete(l.key); setTimeout(() => { if (this.enabled) this.start(text, profile(opts.who, opts), opts); }, 120); }
  },
  speaking(who) { const k = who ? profile(who).key : null; return this.lines.some((l) => l.alive && (!k || l.key === k)); },
  // tout couper (ou seulement un canal : stop('phone') quand on raccroche)
  stop(channel) {
    for (const l of this.lines) if (!channel || l.p.chan === channel) l.stop();
    if (!channel) this.queues.clear(); else for (const [k, q] of this.queues) if (q.some(([, o]) => profile(o.who, o).chan === channel)) this.queues.delete(k);
  },
  // durée estimée d'une réplique babillée (s)
  duration(text) { const p = MAN; let u = 0; for (const x of parse(text)) u += x.t === 'P' ? PAUSE[x.k] : x.t === 'G' ? W.G : x.t === 'V' ? W.V : x.t === 'S' ? W.S : W.Cf; return Math.min(Math.max(1.2, String(text || '').length * 0.056 + 0.5), u * p.step); },
};
