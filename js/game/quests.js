// Mini-quêtes du mode histoire (et ronde générique du mode infini). L'hôte fait avancer les objectifs : démarrage
// (heure, quête précédente, déclencheur, prédicat, heure de repli), vérification (zones, bornes de ronde, états du
// centre, objets, caméras, téléphone), échéances, effets scriptés, récompenses ; il réplique un état compact (effet
// 'quest', aussi joint à l'état complet d'un joueur qui rejoint). Chaque pair en tire le suivi à l'écran et le journal
// (ui.js) et les témoins des bornes. Rien ne bloque jamais la nuit : un objectif manqué ne compte qu'au rapport de l'aube.
// Données : js/data/quests.js ; bornes : js/world/checkpoints.js ; déclencheurs des scripts : data/story.js (on: '…').
import * as THREE from 'three';
import { QUESTS, CHECKPOINTS, INFINITE_QUEST } from '../data/quests.js';
import { LAYER } from '../engine/physics.js';
import { Net } from '../net/net.js';
import * as Save from './save.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// 'HH:MM' → minutes depuis 22:00 (négatif avant)
export const questNm = (s) => { const [h, m] = String(s).split(':').map(Number); let v = h * 60 + m - 22 * 60; if (v < -12 * 60) v += 1440; return v; };
const POLL = 0.25; // période des vérifications (s de jeu)
const DONE = { done: true };
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Quests {
  constructor(game) {
    this.game = game;
    this.mode = 'story'; this.night = 0; this.defs = [];
    this.state = null;   // hôte : état qui fait foi
    this.view = null;    // tous les pairs : dernier état reçu (suivi, journal, bornes)
    this.mem = {}; this.seen = {}; this.timers = []; this.cache = {}; this.pollT = 0; this.dirty = false;
    const S = game.sim, H = game.hooks;
    S.effect('quest', (p) => this.apply(p));
    S.effect('qfx', (p) => this.applyFx(p));
    // signaux de l'hôte (crochets du jeu)
    H.on('dispatch', (d) => this.mark('dispatch:' + d?.service, d?.info?.actor));
    H.on('pa_announce', (d) => this.mark('pa', d?.actor));
    H.on('fire_started', () => this.mark('fire'));
    H.on('phone_answered', (d) => { const k = d?.data?.key || d?.caller; if (k) this.mark('answer:' + k, d.actor); });
    H.on('taken', (d) => this.onTaken(d));
  }
  get nm() { return this.game.env?.nightMinutes ?? 0; }
  mark(k, actor) { if (!Net.isHost || !this.state) return; this.seen[k] = { nm: this.nm, actor: actor || null }; }

  // ───────────────────────── définitions ─────────────────────────
  buildDefs(mode, n) {
    if (mode === 'story') return QUESTS[Math.min(10, Math.max(1, n))] || [];
    // infini : bornes tirées au hasard (même tirage chez tous les pairs : la graine est le numéro de nuit)
    const ids = Object.keys(CHECKPOINTS).filter(id => this.game.world.checkpoints?.[id]);
    const rnd = mulberry(n * 7919 + 13), pick = [];
    while (pick.length < Math.min(INFINITE_QUEST.points, ids.length)) { const id = ids[Math.floor(rnd() * ids.length)]; if (!pick.includes(id)) pick.push(id); }
    return [{ ...INFINITE_QUEST, steps: [{ ...INFINITE_QUEST.steps[0], points: pick }] }];
  }
  quest(id) { return this.defs.find(q => q.id === id) || null; }
  step(key) { const [qid, sid] = key.split('.'); const q = this.quest(qid); return q ? q.steps.find(s => s.id === sid) || null : null; }

  // ───────────────────────── cycle de la nuit ─────────────────────────
  // Hôte : nouvelle nuit (ou nuit recommencée) → objectifs remis à zéro
  setup(mode, n) {
    if (!Net.isHost) return;
    this.mode = mode; this.night = n; this.defs = this.buildDefs(mode, n);
    const st = { n, mode, q: {}, s: {}, fired: [], m: {}, flags: {}, bonus: 0 };
    for (const q of this.defs) { st.q[q.id] = { s: 'hidden' }; for (const s of q.steps) st.s[q.id + '.' + s.id] = { s: 'hidden' }; }
    this.state = st; this.mem = {}; this.seen = {}; this.timers = []; this.cache = {}; this.pollT = 0; this.dirty = false;
    this.push(true);
  }
  // Tous les pairs : remise à zéro de la nuit (avant l'état de l'hôte)
  reset() { this.view = null; this.game.ui?.questChanged?.(null); this.refreshReaders(); }
  pack(silent) { return { ...JSON.parse(JSON.stringify(this.state)), silent: !!silent }; }
  push(silent = false) { if (!Net.isHost || !this.state) return; this.dirty = false; this.game.sim.emit('quest', this.pack(silent)); }
  snapshot() { return this.state ? this.pack(true) : this.view ? { ...this.view, silent: true } : null; }
  apply(p) {
    if (!p || !p.q) return;
    if (p.n !== this.night || p.mode !== this.mode || !this.defs.length) { this.mode = p.mode; this.night = p.n; this.defs = this.buildDefs(p.mode, p.n); }
    const prev = this.view; this.view = p;
    if (!p.silent && prev && prev.n === p.n && prev.mode === p.mode) this.diff(prev, p);
    this.game.ui?.questChanged?.(p);
    this.refreshReaders();
  }
  // annonces des changements (nouvel objectif, réussi, manqué) : chaque pair, d'après l'état reçu
  diff(a, b) {
    const ui = this.game.ui; if (!ui?.questToast) return;
    for (const q of this.defs) for (const st of q.steps) {
      const k = q.id + '.' + st.id, x = a.s[k]?.s, y = b.s[k]?.s; if (x === y || !y) continue;
      const opt = q.optional || st.optional;
      if (y === 'active' && x === 'hidden') ui.questToast('new', st.title, opt);
      else if (y === 'done') { const br = st.branches?.find(r => r.id === b.s[k].c); ui.questToast('done', st.title + (br ? ' — ' + br.label.toLowerCase() : ''), opt); }
      else if (y === 'failed' && x === 'active') ui.questToast('fail', st.title, opt);
    }
  }
  applyFx(p) {
    const pl = this.game.player; if (!pl?.stats) return;
    if (p.k === 'calm') pl.stats.stress = Math.max(0, pl.stats.stress - (p.a || 20));
    if (p.k === 'scare') pl.scare?.(p.a || 20);
  }
  note(k, v = true) { if (Net.isHost && this.state) { this.state.flags[k] = v; this.dirty = true; } }
  fire(name) { if (!this.state || !name) return; if (!this.state.fired.includes(name)) { this.state.fired.push(name); this.dirty = true; } }
  hasFired(name) { return !!(name && this.state?.fired.includes(name)); }
  // Hôte : un événement scripté que la quête remplace (appel de Gérard remplacé par l'appel de la quête)
  intercept(s) {
    if (!this.state || s.fx !== 'phone') return false;
    for (const q of this.defs) for (const st of q.steps) if (st.kind === 'answer' && st.caller === s.caller) { const ss = this.state.s[q.id + '.' + st.id]; if (ss && (ss.s === 'hidden' || ss.s === 'active')) return true; }
    return false;
  }

  // ───────────────────────── boucle (hôte) ─────────────────────────
  update(dt) {
    if (!Net.isHost || !this.state) return;
    const ph = this.game.story?.phase; if (ph !== 'night' && ph !== 'dusk') return;
    const nm = this.nm;
    if (this.timers.length) for (const t of [...this.timers]) if (nm >= t.at) { this.timers.splice(this.timers.indexOf(t), 1); this.run([t.fx], t.ctx); }
    this.pollT += dt; if (this.pollT < POLL) { if (this.dirty) this.push(); return; }
    const pdt = this.pollT; this.pollT = 0;
    for (const q of this.defs) { try { this.tickQuest(q, nm, pdt); } catch (e) { console.error('[quêtes]', q.id, e); } }
    if (this.dirty) this.push();
  }
  resolved(key) { const s = this.state.s[key]; return !!s && (s.s === 'done' || s.s === 'failed'); }
  // fin d'une quête ('quête') ou d'une étape ('quête.étape') : minute de nuit, ou null
  resolvedAt(ref) {
    if (ref.includes('.')) { const s = this.state.s[ref]; return s && (s.s === 'done' || s.s === 'failed') ? s.t1 ?? 0 : null; }
    const q = this.state.q[ref]; return q && q.s === 'over' ? q.t1 ?? 0 : null;
  }
  canStartQuest(q, nm) {
    const s = q.start || {};
    if (s.at && nm < questNm(s.at)) return false;
    if (s.fallback && nm >= questNm(s.fallback)) return true;
    let gated = false, ok = false;
    if (s.after) { gated = true; const r = this.resolvedAt(s.after); if (r !== null && nm >= r + (s.delay || 0)) ok = true; }
    if (s.on) { gated = true; if (this.hasFired(s.on)) ok = true; }
    if (s.test) { gated = true; if (this.test(s.test, s.arg)) ok = true; }
    return gated ? ok : true;
  }
  canStartStep(q, i, nm) {
    const st = q.steps[i];
    if (st.fallback && nm >= questNm(st.fallback)) return true;
    let pred;
    if (i === 0) pred = true;
    else if (st.with) pred = this.state.s[q.id + '.' + q.steps[i - 1].id].s !== 'hidden';
    else if (st.after === 'all') pred = q.steps.slice(0, i).every(p => this.resolved(q.id + '.' + p.id));
    else pred = this.resolved(q.id + '.' + q.steps[i - 1].id);
    return pred && (!st.on || this.hasFired(st.on));
  }
  tickQuest(q, nm, pdt) {
    const qs = this.state.q[q.id];
    if (qs.s === 'hidden') { if (!this.canStartQuest(q, nm)) return; this.startQuest(q, nm); }
    if (qs.s !== 'active') return;
    let open = 0;
    q.steps.forEach((st, i) => {
      const key = q.id + '.' + st.id, ss = this.state.s[key];
      if (ss.s === 'hidden' && this.canStartStep(q, i, nm)) this.startStep(q, st, nm);
      if (ss.s === 'active') this.tickStep(q, st, ss, nm, pdt);
      if (ss.s === 'hidden' || ss.s === 'active') open++;
    });
    if (!open) this.endQuest(q, nm);
  }
  startQuest(q, nm) {
    const qs = this.state.q[q.id]; qs.s = 'active'; qs.t0 = nm; this.dirty = true;
    const I = q.intro;
    if (I && !(I.unless && this.state.flags[I.unless])) { if (I.call) this.ring('intro:' + q.id, I.call); if (I.say) this.run([{ do: 'say', who: I.say[0], text: I.say[1] }]); }
    this.run(q.onStart, { q });
  }
  startStep(q, st, nm) {
    const key = q.id + '.' + st.id, ss = this.state.s[key], m = this.mem[key] = {};
    ss.s = 'active'; ss.t0 = nm; this.dirty = true;
    const g = this.game;
    if (st.kind === 'ronde') { ss.got = []; ss.n = this.rondePoints(st).length; ss.p = 0; }
    if (st.count) ss.p = 0;
    if (st.test === 'gen_fuel') m.f0 = g.power.state.gen.fuel;
    if (st.kind === 'items' && st.mode === 'place') { const zs = arr(st.zone); m.cands = g.props.find(st.def).filter(pr => !this.inZones(pr.state.pos, zs)).map(pr => pr.id); this.placeTarget(st, ss, m, true); }
    if (st.kind === 'items' && st.mode === 'shelve') { m.taken = []; ss.p = 0; }
    if (st.kind === 'answer') { m.next = nm; m.missed = 0; m.ringing = false; }
    this.run(st.onStart, { q, st, ss });
    if (st.at === 'dev' && !ss.at && this.state.m.dev) ss.at = this.state.m.dev;
  }
  tickStep(q, st, ss, nm, pdt) {
    const key = q.id + '.' + st.id, m = this.mem[key] || (this.mem[key] = {});
    if (st.autoDone && this.test(st.autoDone, undefined, { m, st })) { this.finishStep(q, st, 'done', nm, { auto: true }); return; }
    if (st.autoFail && this.test(st.autoFail, undefined, { m, st })) { this.finishStep(q, st, 'failed', nm); return; }
    if (st.enter && !m.entered && this.playerIn(arr(st.enter.zone))) { m.entered = true; this.run(st.enter.fx, { q, st, ss }); }
    if (st.repeat && nm - (m.rep ?? ss.t0) >= st.repeat.every) { m.rep = nm; this.run(st.repeat.fx, { q, st, ss }); }
    if (st.hold) this.holdDevices(st, ss);
    const r = this.check(q, st, ss, m, nm, pdt);
    if (r?.done) { this.finishStep(q, st, 'done', nm, { choice: r.choice || null, actor: r.actor || m.actor || null }); return; }
    if (r?.fail) { this.finishStep(q, st, 'failed', nm); return; }
    if (st.until && nm >= questNm(st.until) - 0.001) this.finishStep(q, st, st.kind === 'wait' ? 'done' : 'failed', nm);
  }
  finishStep(q, st, result, nm, info = {}) {
    const key = q.id + '.' + st.id, ss = this.state.s[key];
    ss.s = result; ss.t1 = nm; if (info.choice) ss.c = info.choice; if (info.auto) ss.auto = 1;
    this.dirty = true;
    const ctx = { q, st, ss, actor: info.actor };
    if (result === 'done') {
      this.run(st.onDone, ctx);
      const br = st.branches?.find(b => b.id === info.choice); if (br) this.run(br.fx, ctx);
      if (st.reward) this.give(st.reward, info.actor);
    } else this.run(st.onFail, ctx);
  }
  endQuest(q, nm) {
    const qs = this.state.q[q.id]; qs.s = 'over'; qs.t1 = nm; this.dirty = true;
    qs.ok = q.steps.every(st => st.optional || this.state.s[q.id + '.' + st.id].s === 'done') ? 1 : 0;
    if (qs.ok && q.reward) this.give(q.reward, this.lastActor(q));
  }
  lastActor(q) { for (const st of [...q.steps].reverse()) { const a = this.mem[q.id + '.' + st.id]?.actor; if (a) return a; } return null; }

  // ───────────────────────── vérifications (hôte) ─────────────────────────
  check(q, st, ss, m, nm, pdt) {
    const g = this.game;
    switch (st.kind) {
      case 'goto': {
        const pl = this.playerIn(arr(st.zone), st.point ? g.world.points[st.point] : null, st.r || 3);
        if (!pl) { m.stay = 0; return null; }
        m.actor = pl.id; m.stay = (m.stay || 0) + pdt;
        return m.stay >= (st.stay || 0) ? DONE : null;
      }
      case 'ronde': { const pts = this.rondePoints(st); return pts.every(id => (ss.got || []).includes(id)) ? DONE : null; }
      case 'state': {
        const v = this.test(st.test, st.arg, { m, st, ss });
        if (st.count) { const n = Math.min(st.count, +v || 0); if (n !== ss.p) { ss.p = n; this.dirty = true; } return n >= st.count ? DONE : null; }
        return v ? DONE : null;
      }
      case 'flag': return g.flags[st.flag] ? DONE : null;
      case 'items': return this.checkItems(st, ss, m);
      case 'cctv': return this.checkCctv(st, m, pdt);
      case 'call': { const s = this.seen['dispatch:' + st.service]; return s && s.nm >= ss.t0 - 30 ? { done: true, actor: s.actor } : null; }
      case 'answer': return this.checkAnswer(q, st, ss, m, nm);
      case 'signal': { const s = this.seen[st.name]; return s && s.nm >= ss.t0 ? { done: true, actor: s.actor } : null; }
      case 'choice': return this.checkChoice(st, ss, m, nm);
      case 'wait': return null; // réussite à l'échéance
    }
    return null;
  }
  // premier gardien vivant dans l'une des zones (ou à r mètres du point)
  playerIn(zones, point = null, r = 3) {
    const W = this.game.world;
    for (const pl of this.game.alivePlayers()) {
      const p = pl.pos;
      if (point && Math.hypot(p.x - point.x, p.z - point.z) < r && Math.abs(p.y - point.y) < 2.5) return pl;
      if (zones.length) { const z = W.zoneAt(p.x, p.y + 1, p.z); if (z && zones.includes(z.id)) return pl; }
    }
    return null;
  }
  inZones(pos, zones) { const z = this.game.world.zoneAt(pos[0], pos[1] + 0.2, pos[2]); return !!z && zones.includes(z.id); }
  rondePoints(st) { return arr(st.points).filter(id => this.game.world.checkpoints?.[id]); }
  countRuntime(fn) { let n = 0; for (const pr of this.game.props.runtime.values()) if (fn(pr)) n++; return n; }
  checkItems(st, ss, m) {
    const g = this.game;
    if (st.mode === 'hold') {
      const defs = arr(st.def);
      for (const pl of g.alivePlayers()) if (defs.some(d => pl.hasItem?.(d))) return { done: true, actor: pl.id };
      return null;
    }
    const zs = arr(st.zone);
    if (st.mode === 'place') {
      for (const id of m.cands || []) { const pr = g.props.get(id); if (pr && pr.state.where === 'world' && this.inZones(pr.state.pos, zs)) return DONE; }
      this.placeTarget(st, ss, m, false);
      return null;
    }
    if (st.mode === 'shelve') { // articles tombés, ramassés puis reposés sur une étagère (au-dessus du sol)
      let n = 0;
      for (const id of m.taken || []) {
        const pr = g.props.get(id); if (!pr || pr.state.where !== 'world' || g.props.awake.has(pr)) continue;
        const p = pr.state.pos, z = g.world.zoneAt(p[0], p[1] + 0.05, p[2]);
        if (z && zs.includes(z.id) && p[1] - z.min[1] > 0.32) n++;
      }
      n = Math.min(st.count || 1, n); if (n !== ss.p) { ss.p = n; this.dirty = true; }
      return n >= (st.count || 1) ? DONE : null;
    }
    return null;
  }
  // cible du suivi pour « rapporter un objet » : le candidat le plus proche d'un gardien (mise à jour par sauts de 3 m)
  placeTarget(st, ss, m, force) {
    const g = this.game; let best = null, bd = 1e9; const ref = g.alivePlayers()[0]?.pos;
    for (const id of m.cands || []) { const pr = g.props.get(id); if (!pr || pr.state.where === 'gone' || pr.state.where === 'held') continue; const p = V(...pr.state.pos); const d = ref ? p.distanceTo(ref) : 0; if (d < bd) { bd = d; best = p; } }
    if (!best) return;
    const cur = ss.at ? V(...ss.at) : null;
    if (force || !cur || cur.distanceTo(best) > 3) { ss.at = best.toArray().map(v => +v.toFixed(2)); this.dirty = true; }
  }
  onTaken(d) {
    if (!Net.isHost || !this.state || !d?.prop || d.from !== 'world') return;
    for (const q of this.defs) for (const st of q.steps) {
      if (st.kind !== 'items' || st.mode !== 'shelve') continue;
      const key = q.id + '.' + st.id; if (this.state.s[key]?.s !== 'active') continue;
      const hz = d.prop.home?.zone; if (!hz || !arr(st.zone).includes(hz)) continue;
      const m = this.mem[key] || (this.mem[key] = {}); m.taken = m.taken || [];
      if (!m.taken.includes(d.prop.id)) m.taken.push(d.prop.id); m.actor = d.actor;
    }
  }
  camMatch(c, cams) { if (!cams || cams === 'any') return true; return arr(cams).some(k => c.shop === k || c.area === k || c.zone === k); }
  // caméra regardée par un gardien (hôte local : écran plein ; autres : état réseau camView)
  viewers() {
    const g = this.game, out = [];
    for (const pl of g.allPlayers()) {
      const id = pl === g.player ? (g.security.fullscreen && g.security.mode && !g.security.playback ? g.security.selId : null) : pl.camView;
      if (!id) continue; const c = g.security.find(id); if (c && g.security.camStatus(c) === 'ok') out.push({ pl, c });
    }
    return out;
  }
  checkCctv(st, m, pdt) {
    const g = this.game; const types = st.see === 'shadow' ? ['shadow', 'lucie'] : arr(st.see);
    const ents = []; for (const e of g.entities.list.values()) if (types.includes(e.type)) ents.push(e);
    let by = null;
    if (ents.length) {
      for (const { pl, c } of this.viewers()) { if (!this.camMatch(c, st.cams)) continue; if (ents.some(e => g.security.sees(c, e.chest, 32))) { by = pl; break; } }
      if (!by && st.direct) for (const e of ents) { const pl = g.entities.observed(e); if (pl) { by = pl; break; } }
    }
    if (!by) { m.hold = 0; return null; }
    m.hold = (m.hold || 0) + pdt; m.actor = by.id;
    return m.hold >= (st.hold || 0.5) ? DONE : null;
  }
  checkAnswer(q, st, ss, m, nm) {
    const key = q.id + '.' + st.id;
    const a = this.seen['answer:' + key]; if (a && a.nm >= ss.t0) return { done: true, actor: a.actor };
    const ph = this.game.phone;
    const ringing = !!ph.ringingHost && ph.ringingHost.data?.key === key;
    if (m.ringing && !ringing) { m.ringing = false; m.missed++; m.next = m.missed <= (st.retry || 0) ? nm + 15 : null; if (m.next !== null) this.game.sim.emit('toast', { text: 'Personne n\'a décroché. Ça va rappeler…' }); }
    if (!m.ringing && m.next !== null && m.next !== undefined && nm >= m.next) { if (this.ring(key, st.lines)) { m.ringing = true; m.next = null; } else m.next = nm + 1; }
    return null;
  }
  // fait sonner le téléphone du poste (répliques résolues maintenant) ; faux si une autre sonnerie est en cours
  ring(key, lines) {
    const ph = this.game.phone; if (!ph || ph.ringingHost) return false;
    ph.incoming('quest', { key, lines: this.resolveLines(lines) });
    return !!ph.ringingHost;
  }
  resolveLines(lines) {
    const out = [];
    for (const l of lines || []) {
      if (typeof l[0] === 'string' && l[0][0] === '?') { if (this.cond(l[0].slice(1))) out.push([l[1], l[2]]); }
      else out.push([l[0], l[1]]);
    }
    return out;
  }
  cond(c) {
    const neg = c[0] === '!'; if (neg) c = c.slice(1);
    let v = false; const [k, rest] = c.split(/:(.*)/s);
    if (k === 'done') { const s = this.state.s[rest]; v = rest.includes('.') ? s?.s === 'done' : !!this.state.q[rest]?.ok; }
    else if (k === 'flag') { const [f, val] = rest.split('='); const x = this.state.flags[f] ?? this.game.flags[f]; v = val === undefined ? !!x : String(x) === val; }
    return neg ? !v : v;
  }
  checkChoice(st, ss, m, nm) {
    if (st.branches.some(b => b.test)) { for (const b of st.branches) if (b.test && this.test(b.test, b.arg)) return { done: true, choice: b.id }; return null; }
    if (st.test === 'musicbox') return this.checkMusicBox(st, ss, m, nm);
    if (st.test === 'vcr') return this.checkVcr(st, ss, m, nm);
    return null;
  }
  // boîte à musique qui joue seule : arrêtée par un gardien avant la fin (« stop ») ou laissée finir (« finish »)
  musicBoxes(zone) { const g = this.game, out = []; for (const z of [zone, zone + '_back']) for (const pr of g.props.byZone.get(z) || []) if (pr.defId === 'music_box' && pr.state.where !== 'gone') out.push(pr); return out; }
  checkMusicBox(st, ss, m, nm) {
    const g = this.game;
    if (!m.mb) {
      const boxes = this.musicBoxes(st.arg); let pr = boxes.find(p => p.data.on);
      if (!pr && nm - ss.t0 > 2) { pr = boxes.find(p => p.state.where === 'home' || p.state.where === 'world'); if (pr) pr.set({ data: { ...pr.data, on: true } }); }
      if (!pr) return null;
      m.mb = pr.id; m.t = nm; ss.at = pr.state.pos.map(v => +v.toFixed(2)); this.dirty = true; return null;
    }
    const pr = g.props.get(m.mb); if (!pr) return { done: true, choice: 'finish' };
    if (pr.data.on) { if (nm - m.t > 24) { pr.set({ data: { ...pr.data, on: false } }); return { done: true, choice: 'finish' }; } return null; }
    return { done: true, choice: nm - m.t >= 19 ? 'finish' : 'stop' };
  }
  // magnétoscope hanté : éteint pendant la lecture (« stop ») ou regardé jusqu'au bout (« watch » : un gardien tout près
  // ou sur une caméra du magasin à la fin) ; personne → manqué
  checkVcr(st, ss, m, nm) {
    const g = this.game;
    const vcrs = g.devices.kind('vcr').filter(d => String(d.opts?.shop || d.zone || '').startsWith(st.arg));
    if (!m.dev) {
      let d = vcrs.find(x => x.state.ghost);
      if (!d && nm - ss.t0 > 2 && vcrs[0]) { vcrs[0].trigger({ tape: 'no_label', dur: 90 }); d = vcrs[0]; }
      if (!d) return null;
      m.dev = d.id; m.t = nm; ss.at = d.center.toArray().map(v => +v.toFixed(2)); this.dirty = true; return null;
    }
    const d = g.world.get(m.dev); if (!d) return { fail: true };
    if (d.state.ghost && (!d.state.on || !d.state.playing)) return { done: true, choice: 'stop' };
    if (!d.state.ghost) {
      const near = g.alivePlayers().find(p => p.pos.distanceTo(d.center) < 9) || this.viewers().find(v => this.camMatch(v.c, st.arg))?.pl;
      return near ? { done: true, choice: 'watch', actor: near.id } : { fail: true };
    }
    return null;
  }
  // appareils que l'objectif garde allumés (minuterie annulée) jusqu'à ce qu'un gardien les arrête
  holdDevices(st, ss) {
    const g = this.game;
    const list = st.hold === 'projector' ? g.devices.kind('projector') : st.hold === 'tv' ? [g.world.get(this.state.m.tv)].filter(Boolean) : [];
    for (const d of list) if (d.state.on && d.timer > 0) d.timer = 0;
    if (!ss.at) { const d = list.find(x => x.state.on) || list[0]; if (d) { ss.at = d.center.toArray().map(v => +v.toFixed(2)); this.dirty = true; } }
  }
  locker(name) { if (!(name in (this.cache.lk ||= {}))) { let id = null; for (const o of this.game.world.objects.values()) if (o.kind === 'locker' && o.o?.name === name) { id = o.id; break; } this.cache.lk[name] = id; } return this.game.world.get(this.cache.lk[name]); }
  // prédicats ('nom' + argument, ou 'nom:argument')
  test(name, arg, ctx = {}) {
    if (arg === undefined && name.includes(':')) [name, arg] = name.split(/:(.*)/s);
    const g = this.game, P = g.power.state;
    try {
      switch (name) {
        case 'flag': return !!g.flags[arg];
        case 'rec_on': return !!g.security.S.rec;
        case 'door_closed': return !!P.doorClosed;
        case 'hatch_closed': return !!P.hatchClosed;
        case 'lit': return g.lighting.isLit(arg) || (!!g.world.zone(arg + '_back') && g.lighting.isLit(arg + '_back'));
        case 'alarm': return !!P.alarms?.[arg];
        case 'padlock': return !!g.world.shops?.[arg]?.rearDoor?.state.padlock;
        case 'breaker_off': return P.breakers[arg] === false || !!P.blown[arg] || (arg === 'electro' && (P.breakers.shops0 === false || !!P.blown.shops0));
        case 'gen_running': return !!(P.gen.running && P.gen.fuel > 0);
        case 'gen_fuel': return P.gen.fuel >= (ctx.m?.f0 ?? 100) + (+arg || 10);
        case 'sensors_armed': return this.countRuntime(p => p.defId === 'motion_sensor' && p.state.where === 'world' && p.data.armed);
        case 'portable_cams': return this.countRuntime(p => p.def.use === 'place_cam' && p.state.where === 'world' && p.data.cam);
        case 'rc_cam': return this.countRuntime(p => p.defId === 'rc_car' && p.data.camMounted) > 0;
        case 'rc_in': return this.countRuntime(p => p.defId === 'rc_car' && p.state.where === 'world' && g.world.zoneAt(p.state.pos[0], p.state.pos[1] + 0.2, p.state.pos[2])?.id === arg) > 0;
        case 'fridges_closed': return g.devices.inZone(arg, 'fridge').every(d => !d.state.open);
        case 'tv_off': { const d = g.world.get(this.state.m.tv); return !d || !d.state.on; }
        case 'projector_off': return g.devices.kind('projector').every(d => !d.state.on);
        case 'grate_taped': return (g.world.ventGrates || []).some(gr => gr.state.taped);
        case 'parrot_fed': return g.devices.kind('parrot').some(d => d.state.fed > 0);
        case 'cake_blown': { const ids = this.cache.cakes ||= g.props.find('birthday_cake', { any: true }).map(p => p.id); return ids.some(id => g.props.get(id)?.data.blown) || this.countRuntime(p => p.defId === 'birthday_cake' && p.data.blown) > 0; }
        case 'locker_open': { const lk = this.locker(arg); return !!lk && !lk.state.locked; }
        case 'fire_started': return !!this.seen.fire;
        case 'fire_out': return !!this.seen.fire && !g.fire.active;
        case 'robbery_arriving': { const r = g.entities.robbery; return !!r && r.state !== 'planned'; }
        case 'robbery_aborted': return g.story.outcome?.robbery?.result === 'aborted';
      }
    } catch (e) { return false; }
    return false;
  }

  // ───────────────────────── bornes de ronde ─────────────────────────
  // Hôte : un gardien pointe à une borne (E)
  punch(cp, actor) {
    const g = this.game; const r = g.world.checkpoints?.[cp];
    const pos = r ? r.pos.toArray() : null;
    g.sim.emit('fx', { s: 'beep', pos, v: 0.55 });
    if (!this.state) return;
    let hit = 0, order = null, again = false, any = false;
    for (const q of this.defs) for (const st of q.steps) {
      if (st.kind !== 'ronde') continue;
      const key = q.id + '.' + st.id, ss = this.state.s[key]; if (ss.s !== 'active') continue;
      const pts = this.rondePoints(st); if (!pts.includes(cp)) continue;
      any = true; ss.got = ss.got || [];
      if (ss.got.includes(cp)) { again = true; continue; }
      if (st.ordered) { const next = pts.find(id => !ss.got.includes(id)); if (next !== cp) { order = next; continue; } }
      ss.got.push(cp); ss.p = ss.got.length; hit++;
      (this.mem[key] ||= {}).actor = actor;
    }
    if (hit) { this.dirty = true; setTimeout(() => g.sim.emit('fx', { s: 'beep', pos, v: 0.45, i: 0.6 }), 160); this.push(); return; }
    const name = (id) => CHECKPOINTS[id]?.name || id;
    if (order) g.sim.emit('toast', { text: 'Pointage refusé : la ronde commence par « ' + name(order) + ' ».' }, { to: actor });
    else if (again) g.sim.emit('toast', { text: 'Borne déjà pointée.' }, { to: actor });
    else if (!any) g.sim.emit('toast', { text: 'Borne « ' + name(cp) + ' » pointée (elle ne fait pas partie de la ronde en cours).', dur: 3 }, { to: actor });
  }
  // tous les pairs : état d'une borne pour le joueur local ('todo', 'next', 'done' ou null)
  readerStatus(cp) {
    const v = this.view; if (!v) return null; let st = null;
    for (const q of this.defs) for (const s of q.steps) {
      if (s.kind !== 'ronde' || v.s[q.id + '.' + s.id]?.s !== 'active') continue;
      const pts = this.rondePoints(s); if (!pts.includes(cp)) continue;
      const got = v.s[q.id + '.' + s.id].got || [];
      if (got.includes(cp)) { st = st || 'done'; continue; }
      const next = s.ordered ? pts.find(id => !got.includes(id)) : null;
      st = !s.ordered || next === cp ? 'next' : 'todo';
    }
    return st;
  }
  refreshReaders() { this._readersKey = null; }
  // témoins des bornes (orange clignotant : à pointer ; vert : pointée ; rouge sombre : au repos)
  updateReaders() {
    const W = this.game.world, leds = W.checkpointLeds; if (!leds) return;
    const t = performance.now() / 1000, blink = Math.sin(t * 6) > -0.2;
    const ids = W.checkpointOrder || [];
    const key = (this.view ? this.view.v ?? JSON.stringify(this.view.s).length : 'x') + '|' + (blink ? 1 : 0);
    if (key === this._readersKey) return; this._readersKey = key;
    const c = this._ledC || (this._ledC = new THREE.Color());
    ids.forEach((id, i) => {
      const s = this.readerStatus(id);
      if (s === 'done') c.setRGB(0.15, 1.6, 0.35); else if (s === 'next') c.setRGB(blink ? 2.2 : 0.4, blink ? 1.3 : 0.24, 0.05); else if (s === 'todo') c.setRGB(1.2, 0.7, 0.05); else c.setRGB(0.45, 0.03, 0.02);
      leds.setColorAt(i, c);
    });
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
  }

  // ───────────────────────── effets scriptés (hôte) ─────────────────────────
  run(list, ctx = {}) {
    if (!list || !Net.isHost) return;
    const g = this.game;
    for (const f of list) {
      if (f.delay) { this.timers.push({ at: this.nm + f.delay, fx: { ...f, delay: 0 }, ctx }); continue; }
      try {
        switch (f.do) {
          case 'say': g.sim.emit('say', { who: f.who, text: f.text, voice: f.voice }); break;
          case 'call': this.ring('fx:' + (ctx.q?.id || '') + ':' + this.nm.toFixed(1), f.lines); break;
          case 'trigger': this.fire(f.name); break;
          case 'event': g.events.execute({ ...f, do: undefined, id: 'quête' }, true); break;
          case 'flag': this.state.flags[f.k] = f.v ?? true; this.dirty = true; break;
          case 'toast': g.sim.emit('toast', { text: f.text, dur: f.dur || 5 }); break;
          case 'calm': case 'scare': g.sim.emit('qfx', { k: f.do, a: f.amount }); break;
          case 'fridge': {
            const d = g.devices.inZone(f.shop, 'fridge').find(x => !x.state.open) || g.devices.inZone(f.shop, 'fridge')[0];
            if (d) { d.set({ open: 1 }); this.state.m.fridge = d.id; this.state.m.dev = d.center.toArray().map(v => +v.toFixed(2)); if (ctx.ss) ctx.ss.at = this.state.m.dev; this.dirty = true; }
            break;
          }
          case 'tv': {
            const tvs = g.devices.inZone(f.shop, 'tv'); const d = tvs.find(x => x.powered()) || tvs[0];
            if (d) { d.timer = 0; d.set({ on: true, msg: f.msg || null }); this.state.m.tv = d.id; this.state.m.dev = d.center.toArray().map(v => +v.toFixed(2)); this.dirty = true; }
            break;
          }
          case 'shadowcam': this.shadowCam(f.cams, f.dur || 30); break;
        }
      } catch (e) { console.error('[quêtes] effet', f.do, e); }
    }
  }
  // silhouette (visible seulement sur les caméras) posée dans le champ d'une caméra de la zone, sur un sol dégagé
  shadowCam(cams, dur) {
    const g = this.game, W = g.world;
    for (const c of g.security.list()) {
      if (c.kind !== 'fixed' || !this.camMatch(c, cams)) continue;
      const zn = W.zone(c.zone); if (!zn) continue;
      const t = g.security.camTransform(c), f = V(-Math.sin(t.yaw), 0, -Math.cos(t.yaw)).normalize(), y0 = zn.min[1];
      for (const d of [7, 5.5, 9, 4.5, 11, 13]) {
        const p = t.pos.clone().addScaledVector(f, d); p.y = y0 + 1.2;
        if (!zn.contains(p.x, p.y, p.z)) continue;
        if (W.physics.near(p.x - 0.35, p.z - 0.35, p.x + 0.35, p.z + 0.35, LAYER.FURN | LAYER.WALL).some(b => b.max[1] > y0 + 0.15 && b.min[1] < y0 + 1.9 && b.max[0] > p.x - 0.35 && b.min[0] < p.x + 0.35 && b.max[2] > p.z - 0.35 && b.min[2] < p.z + 0.35)) continue;
        if (!g.security.sees(c, p, 30)) continue;
        g.entities.apparition({ pos: p, dur, cam: true });
        return true;
      }
    }
    return false;
  }
  give(rw, actor) {
    const g = this.game; const pl = (actor && g.playerById(actor)) || g.alivePlayers()[0] || g.player; if (!pl || !rw) return;
    for (let i = 0; i < (rw.coins || 0); i++) g.props.giveNew('coin', pl.id);
    for (const it of rw.items || []) g.props.giveNew(it, pl.id);
    if (rw.note) g.props.giveNew('gerard_note', pl.id, { text: rw.note });
    if (rw.bonus) this.state.bonus += rw.bonus;
    const t = rw.text || (rw.coins ? 'Récompense : ' + rw.coins + ' pièce' + (rw.coins > 1 ? 's' : '') + ' de 2 €.' : rw.note ? 'Récompense : une note de Gérard.' : null);
    if (t) g.sim.emit('toast', { text: t, dur: 5 }, { to: pl.id });
    g.sim.emit('fx', { s: 'coins', pos: null, v: 0.35 }, { to: pl.id });
  }

  // ───────────────────────── fin de nuit (hôte) ─────────────────────────
  // Rapport : « Objectifs : X/Y », une ligne par objectif manqué, les facultatifs réussis et les choix ; drapeaux des
  // choix enregistrés dans la partie, bilan dans les statistiques (sauvegarde de l'histoire).
  finish() {
    const S = this.state; if (!S || !this.defs.length) return null;
    const nm = this.nm, g = this.game;
    let done = 0, total = 0, oDone = 0, oTotal = 0; const lines = [], fails = [], extra = [];
    for (const q of this.defs) {
      const qs = S.q[q.id];
      if (q.maybe && qs.s === 'hidden') continue;
      for (const st of q.steps) {
        const ss = S.s[q.id + '.' + st.id];
        if (ss.s === 'active' || ss.s === 'hidden') { ss.s = st.kind === 'wait' && ss.s === 'active' && nm >= questNm(st.until || '06:00') - 1 ? 'done' : 'failed'; ss.t1 = nm; }
        const opt = q.optional || st.optional;
        if (opt) { oTotal++; if (ss.s === 'done') { oDone++; extra.push(['good', '★ ' + st.title + ' (facultatif)']); } continue; }
        total++;
        if (ss.s === 'done') { done++; const br = st.branches?.find(b => b.id === ss.c); if (br) extra.push(['', '« ' + st.title + ' » : ' + br.label.toLowerCase() + '.']); }
        else fails.push(['bad', '✗ ' + st.title + (qs.s === 'hidden' ? ' (jamais commencé)' : '')]);
      }
    }
    if (total) lines.push([done === total ? 'good' : done >= total / 2 ? '' : 'bad', 'Objectifs : ' + done + '/' + total + (oTotal ? ' · facultatifs : ' + oDone + '/' + oTotal : '')]);
    lines.push(...fails, ...extra);
    if (S.bonus) lines.push(['good', 'Prime de ronde : +' + S.bonus + ' €.']);
    for (const [k, v] of Object.entries(S.flags)) if (k !== 'tuto') g.flags['q_' + k] = v;
    const st = g.story?.stats; if (st && this.mode === 'story') { st.quests = { ...(st.quests || {}), [this.night]: { done, total, opt: oDone, optTotal: oTotal } }; if (S.bonus) st.bonus = (st.bonus || 0) + S.bonus; }
    this.push(true);
    return { lines, done, total, opt: oDone, optTotal: oTotal };
  }

  // ───────────────────────── suivi et journal (tous les pairs) ─────────────────────────
  setHud(on) { const s = this.game.settings; s.questHud = !!on; try { Save.saveSettings({ questHud: !!on }); } catch (e) { /* stockage indisponible */ } }
  // objectifs en cours pour le suivi : [{ key, title, prog, sub, opt, target }]
  rows() {
    const v = this.view; if (!v) return [];
    const out = [];
    for (const q of this.defs) for (const st of q.steps) {
      const ss = v.s[q.id + '.' + st.id]; if (!ss || ss.s !== 'active') continue;
      out.push({ key: q.id + '.' + st.id, title: st.title, opt: !!(q.optional || st.optional), prog: this.progText(st, ss), sub: this.subText(st, ss), kind: st.kind, st, ss });
    }
    out.sort((a, b) => (a.opt ? 1 : 0) - (b.opt ? 1 : 0));
    return out;
  }
  progText(st, ss) {
    if (st.kind === 'ronde') return 'Ronde ' + (ss.got?.length || 0) + '/' + (ss.n || this.rondePoints(st).length);
    if (st.count) return (ss.p || 0) + '/' + st.count;
    if (st.kind === 'wait') return '→ ' + st.until;
    if (st.until && st.kind !== 'choice' && questNm(st.until) - this.nm < 30 && questNm(st.until) - this.nm > 0) return 'avant ' + st.until;
    return '';
  }
  subText(st, ss) {
    if (st.kind === 'ronde') { const id = this.nextPoint(st, ss); return id ? 'Borne : ' + (CHECKPOINTS[id]?.name || id) : ''; }
    if (st.kind === 'choice' && st.branches) return st.branches.map(b => b.label).join('  ·  ou  ·  ');
    if (st.kind === 'cctv') return 'Caméras du poste';
    if (st.kind === 'call' || st.kind === 'answer') return 'Téléphone du poste';
    return '';
  }
  // prochaine borne : la suivante dans l'ordre, sinon la plus proche du joueur local
  nextPoint(st, ss) {
    const pts = this.rondePoints(st), got = ss.got || [];
    const left = pts.filter(id => !got.includes(id)); if (!left.length) return null;
    if (st.ordered || left.length === 1) return left[0];
    const p = this.game.player.pos, W = this.game.world;
    let best = left[0], bd = 1e9; for (const id of left) { const r = W.checkpoints[id]; const d = r ? r.pos.distanceTo(p) + Math.abs(r.pos.y - p.y) * 8 : 1e9; if (d < bd) { bd = d; best = id; } }
    return best;
  }
  // cible (position) d'un objectif pour la flèche du suivi
  target(st, ss) {
    const g = this.game, W = g.world, P = W.points;
    if (st.kind === 'ronde') { const id = this.nextPoint(st, ss); return id ? W.checkpoints[id]?.pos.clone() || null : null; }
    if (ss.at) return V(...ss.at);
    const at = st.at || (st.kind === 'goto' ? (st.point ? 'pt:' + st.point : 'zone:' + arr(st.zone)[0]) : st.kind === 'cctv' ? 'desk' : st.kind === 'call' || st.kind === 'answer' ? 'phone' : null);
    if (!at) return null;
    if (at === 'desk') return P.securityDesk ? P.securityDesk.clone().setY(1) : null;
    if (at === 'phone') return g.phone?.deskPos?.clone() || null;
    if (at === 'fire') return g.fire.active ? g.fire.biggest().pos.clone() : null;
    if (at === 'dev') return this.view?.m?.dev ? V(...this.view.m.dev) : null;
    const [k, id] = at.split(':');
    if (k === 'cp') return W.checkpoints?.[id]?.pos.clone() || null;
    if (k === 'pt') return P[id] ? P[id].clone() : null;
    if (k === 'rear') return W.shops?.[id]?.rearDoor?.pos.clone() || null;
    if (k === 'zone') { const z = W.zone(id); return z ? V((z.min[0] + z.max[0]) / 2, z.min[1] + 1, (z.min[2] + z.max[2]) / 2) : null; }
    return null;
  }
  // Journal : quêtes révélées et leurs étapes ; compte des objectifs
  journal() {
    const v = this.view; if (!v) return null;
    let done = 0, total = 0;
    const quests = [];
    for (const q of this.defs) {
      const qs = v.q[q.id]; if (!qs) continue;
      const steps = q.steps.map(st => { const ss = v.s[q.id + '.' + st.id] || { s: 'hidden' }; const br = st.branches?.find(b => b.id === ss.c); return { title: st.title, desc: st.desc, s: ss.s, opt: !!(q.optional || st.optional), prog: ss.s === 'active' ? this.progText(st, ss) : '', choice: br ? br.label : null, auto: !!ss.auto }; });
      if (!(q.maybe && qs.s === 'hidden')) for (const s of steps) if (!s.opt) { total++; if (s.s === 'done') done++; }
      if (qs.s === 'hidden') continue;
      quests.push({ id: q.id, title: q.title, giver: q.giver || null, optional: !!q.optional, s: qs.s, ok: !!qs.ok, steps, reward: q.reward ? this.rewardText(q.reward) : null });
    }
    return { night: this.night, mode: this.mode, quests, done, total };
  }
  rewardText(rw) { const a = []; if (rw.coins) a.push(rw.coins + ' pièce' + (rw.coins > 1 ? 's' : '') + ' de 2 €'); if (rw.items?.length) a.push('des piles'); if (rw.note) a.push('une note de Gérard'); if (rw.bonus) a.push(rw.bonus + ' €'); return a.join(', ') || null; }
}
