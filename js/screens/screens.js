// Point d'entrée des écrans du jeu : téléviseurs, magnétoscopes, bornes d'arcade, consoles, ordinateurs, cinéma.
//   import { createScreen, SCREEN_LIST, VHS_TAPES, GAMES, CHANNELS } from './screens/screens.js';
//   const s = createScreen(kind, opts); // → { canvas, w, h, title, wantsInput, update(dt), key(code, down), dispose() }
// Toutes les surfaces font 256×192 (pixel art net). Un type inconnu donne de la neige avec son nom : jamais d'exception.
// opts.ctx (facultatif) : { time() → 'HH:MM', night, flags, emit(name, data) } ; opts.notes (notes de Gérard) ;
// opts.shop (identifiant de boutique, pour varier l'ordinateur de boutique).
import { makeCanvas, drawNoise, rect } from './util.js';
import { drawText } from './font.js';
import { BASIC } from './basic.js';
import { CHANNELS, CHANNEL_BUILDERS } from './channels.js';
import { VHS_TAPES, VHS_BUILDERS } from './vhs.js';
import { GAMES, GAME_BUILDERS } from './games.js';
import { COMPUTERS, buildComputer } from './computer.js';
import { FILMS, CINEMA_BUILDERS } from './cinema.js';

export { CHANNELS, VHS_TAPES, GAMES, FILMS, COMPUTERS };

export const SCREEN_W = 256, SCREEN_H = 192;

export const SCREEN_LIST = [
  { kind: 'off', title: 'Écran éteint' },
  { kind: 'blue', title: 'Écran bleu (entrée vidéo)' },
  { kind: 'static', title: 'Neige' },
  { kind: 'cctv_offline', title: 'Caméra hors ligne' },
  { kind: 'pos', title: 'Terminal de caisse' },
  { kind: 'atm', title: 'Distributeur de billets' },
  { kind: 'boot:famicube', title: 'Console Famicube (démarrage)' },
  { kind: 'boot:hyperdrive', title: 'Console Hyperdrive (démarrage)' },
  { kind: 'boot:playbox', title: 'Console PlayBox (démarrage)' },
  { kind: 'boot:console', title: 'Console sans cartouche' },
  ...CHANNELS.map((c) => ({ kind: 'channel:' + c.id, title: 'TV — ' + c.title })),
  ...VHS_TAPES.map((t) => ({ kind: 'vhs:' + t.id, title: 'VHS — ' + t.title })),
  ...GAMES.map((g) => ({ kind: 'game:' + g.id, title: 'Jeu — ' + g.title })),
  ...COMPUTERS.map((c) => ({ kind: 'computer:' + c.id, title: c.title })),
  ...FILMS.map((f) => ({ kind: 'cinema:' + f.id, title: 'Cinéma — ' + f.title })),
];

const warned = new Set();
function warn(kind, e) {
  if (warned.has(kind)) return;
  warned.add(kind);
  try { console.warn('[écran] ' + kind, e); } catch (_) { /* */ }
}

// Écran de repli : neige + nom du type (petit), ou message d'erreur.
function fallback(S, kind, broken) {
  return {
    title: kind,
    update() {
      const { g, w, h } = S;
      drawNoise(g, w, h, S.t);
      rect(g, 0, h - 14, w, 14, 'rgba(0,0,0,0.6)');
      drawText(g, (broken ? 'ERREUR · ' : '') + String(kind).slice(0, 38), 4, h - 11, broken ? '#f88' : '#ddd');
    },
  };
}

function resolve(S, kind) {
  const i = kind.indexOf(':');
  const type = i < 0 ? kind : kind.slice(0, i), arg = i < 0 ? '' : kind.slice(i + 1);
  switch (type) {
    case 'off': case 'blue': case 'static': case 'cctv_offline': case 'pos': case 'atm':
      return i < 0 ? BASIC[type](S) : null;
    case 'boot': return BASIC.boot(S, arg || 'console');
    case 'channel': return CHANNEL_BUILDERS[arg] ? CHANNEL_BUILDERS[arg](S) : null;
    case 'vhs': return VHS_BUILDERS[arg] ? VHS_BUILDERS[arg](S) : null;
    case 'game': return GAME_BUILDERS[arg] ? GAME_BUILDERS[arg](S) : null;
    case 'computer': return buildComputer(S, arg || 'shop');
    case 'cinema': return CINEMA_BUILDERS[arg] ? CINEMA_BUILDERS[arg](S) : null;
    default: return null;
  }
}

export function createScreen(kind, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  kind = typeof kind === 'string' && kind ? kind : 'static';
  const canvas = makeCanvas(SCREEN_W, SCREEN_H);
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const S = {
    canvas, g, w: SCREEN_W, h: SCREEN_H, t: 0, dt: 0, ctx: opts.ctx, opts, kind,
    // horloge du jeu (ou une horloge de nuit factice si aucun contexte n'est fourni)
    time() {
      try { const v = opts.ctx && typeof opts.ctx.time === 'function' ? opts.ctx.time() : null; if (typeof v === 'string' && v) return v; } catch (_) { /* */ }
      const m = (23 * 60 + 47 + Math.floor(S.t / 15)) % 1440;
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    },
    emit(name, data) { try { opts.ctx?.emit?.(name, data); } catch (e) { warn('emit:' + name, e); } },
  };
  let b = null;
  try { b = resolve(S, kind); } catch (e) { warn(kind, e); b = null; }
  if (!b || typeof b.update !== 'function') b = fallback(S, kind, false);
  let broken = false;
  const screen = {
    canvas, w: SCREEN_W, h: SCREEN_H, kind,
    title: b.title || kind,
    wantsInput: !!b.wantsInput,
    update(dt) {
      dt = +dt;
      if (!(dt > 0)) dt = 0; else if (dt > 0.25) dt = 0.25;
      S.dt = dt; S.t += dt;
      g.save();
      try { b.update(); } catch (e) {
        warn(kind, e);
        broken = true; b = fallback(S, kind, true);
        g.restore(); g.save();
        try { b.update(); } catch (_) { /* */ }
      }
      g.restore();
    },
    key(code, down) {
      if (broken || typeof b.key !== 'function') return;
      try { b.key(String(code), down !== false); } catch (e) { warn(kind + ':key', e); }
    },
    dispose() { try { b.dispose?.(); } catch (_) { /* */ } },
  };
  screen.update(0);
  return screen;
}
