// Sauvegardes dans le navigateur (localStorage) : réglages, 3 emplacements d'histoire, mode infini, découvertes.
// Toutes les lectures/écritures sont protégées (navigation privée, stockage bloqué…).
const KEY = 'nuitblanche.v1';

export const DEFAULT_SETTINGS = {
  volume: 0.9, musicVolume: 0.8, sensitivity: 1, fov: 72, renderScale: 1, quality: 'medium', autoScale: true, shadows: true, bloom: true, volumetric: true, bodycam: true,
  screamers: true, subtitles: true, voices: true, invertY: false, showClock: true, playerName: 'Gardien', costume: 'guard', serverUrl: '',
};

function blank() { return { settings: { ...DEFAULT_SETTINGS }, slots: [null, null, null], infinite: { best: 0, runs: 0 }, discovered: {}, highscores: {}, endings: {}, lastSlot: 0 }; }

let cache = null;
export function load() {
  if (cache) return cache;
  let d = null;
  try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch (e) { d = null; }
  cache = Object.assign(blank(), d || {});
  cache.settings = Object.assign({ ...DEFAULT_SETTINGS }, cache.settings || {});
  if (!Array.isArray(cache.slots) || cache.slots.length !== 3) cache.slots = [null, null, null];
  return cache;
}
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(load())); return true; } catch (e) { return false; } }
export function settings() { return load().settings; }
export function saveSettings(s) { load().settings = { ...load().settings, ...s }; persist(); }
export function slot(i) { return load().slots[i] || null; }
export function saveSlot(i, data) { const d = load(); d.slots[i] = { ...data, updated: Date.now() }; d.lastSlot = i; persist(); }
export function deleteSlot(i) { load().slots[i] = null; persist(); }
export function markDiscovered(k) { const d = load(); if (!d.discovered[k]) { d.discovered[k] = Date.now(); persist(); } }
export function recordEnding(id) { const d = load(); d.endings[id] = (d.endings[id] || 0) + 1; persist(); }
export function recordInfinite(nights) { const d = load(); d.infinite.runs++; d.infinite.best = Math.max(d.infinite.best, nights); persist(); }
export function recordHighscore(game, score) { const d = load(); if ((d.highscores[game] || 0) < score) { d.highscores[game] = score; persist(); return true; } return false; }
export function exportJSON() { return JSON.stringify(load(), null, 2); }
export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || typeof d !== 'object' || !d.settings) throw new Error('Fichier de sauvegarde invalide');
  cache = Object.assign(blank(), d); persist(); return true;
}
export function resetAll() { cache = blank(); persist(); }
