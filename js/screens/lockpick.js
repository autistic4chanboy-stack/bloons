// Crochetage d'une serrure à goupilles : overlay DOM plein écran (canvas 420×300 en pixel art, mis à l'échelle ×2).
// Maintenir la tension (Espace / clic gauche), placer le crochet sous une goupille (←/→, Q/D, souris) et la soulever
// (↑/Z, molette vers le haut, clic droit). Seule la goupille « bloquante » peut se caler sur la ligne de cisaillement,
// et seulement avec une tension correcte. Trop soulever ou forcer tord le crochet… jusqu'à le casser.
//   startLockpick({ difficulty: 1..5, sound(name), onDone(success, quality 0..1, cancelled) })
import { drawText } from './font.js';

const CW = 420, CH = 300;
const SHEAR = 150, PLUG_BOT = 214, PIN_BASE = 196;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
let active = null; // un seul crochetage à la fois

export function startLockpick(opts = {}) {
  if (active) active.cancel();
  const diff = clamp(Math.round(Number(opts.difficulty) || 1), 1, 5);
  const N = 3 + diff;
  const play = (name) => { try { opts.sound?.(name); } catch (e) { /* son indisponible */ } };
  const zoneW = 0.42 - diff * 0.05, lo = 0.55 - zoneW / 2, hi = 0.55 + zoneW / 2;
  const tol = 3.4 - diff * 0.38;
  const xs = Array.from({ length: N }, (_, i) => Math.round(110 + (i * 240) / Math.max(1, N - 1)));
  const pins = xs.map(() => {
    const kl = 20 + Math.floor(Math.random() * 17);
    return { kl, setH: 46 - kl, lift: 0, set: false, over: false, jitter: 0 };
  });
  const order = pins.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let bind = 0, pick = 0, pickX = xs[0], tension = 0, stress = 0, peakStress = 0, mistakes = 0;
  let wasRed = false, clickT = 0, msg = null, msgT = 0, ended = false, endT = 0, result = null, wheelLift = 0;
  const keys = new Set();
  let mouseT = false, mouseL = false;

  // ── DOM ──
  const root = document.createElement('div');
  root.setAttribute('data-nb-overlay', 'lockpick');
  Object.assign(root.style, {
    position: 'fixed', inset: '0', zIndex: '2147483000', background: 'rgba(4,5,8,0.86)', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '12px', userSelect: 'none', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', color: '#d8d8d8',
  });
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  Object.assign(cv.style, { width: 'min(840px, 94vw, calc(70vh * 1.4))', aspectRatio: CW + ' / ' + CH, imageRendering: 'pixelated', border: '3px solid #3a3e46', borderRadius: '8px', boxShadow: '0 0 40px rgba(255,190,90,0.15)', background: '#000', cursor: 'crosshair' });
  const help = document.createElement('div');
  Object.assign(help.style, { maxWidth: 'min(840px, 94vw)', textAlign: 'center', fontSize: '13px', lineHeight: '1.5', color: '#b8bcc4' });
  help.innerHTML = '<b style="color:#ffd27a">Espace</b> ou <b style="color:#ffd27a">clic gauche</b> maintenu : tension &nbsp;·&nbsp; '
    + '<b style="color:#ffd27a">← →</b> (Q / D) ou souris : choisir la goupille &nbsp;·&nbsp; <b style="color:#ffd27a">↑</b> (Z), molette ou <b style="color:#ffd27a">clic droit</b> : soulever<br>'
    + 'Gardez la tension dans la zone verte et soulevez la goupille qui résiste jusqu\'à la ligne de cisaillement (le trait clair) : déclic ! <b style="color:#ffd27a">Échap</b> : abandonner';
  root.append(cv, help);
  document.body.appendChild(root);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;

  // ── Entrées ──
  const HANDLED = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'KeyZ', 'Escape', 'Enter', 'Tab']);
  const onKeyDown = (e) => {
    // le jeu ne doit rien recevoir pendant le crochetage (pas d'inventaire, de pause…)
    e.stopImmediatePropagation();
    if (HANDLED.has(e.code)) e.preventDefault();
    if (e.code === 'Escape') { finish(false, 0, true); return; }
    if (ended || !HANDLED.has(e.code)) return;
    const first = !keys.has(e.code);
    keys.add(e.code);
    if (first && (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ')) pick = Math.max(0, pick - 1);
    if (first && (e.code === 'ArrowRight' || e.code === 'KeyD')) pick = Math.min(N - 1, pick + 1);
  };
  const onKeyUp = (e) => { keys.delete(e.code); if (HANDLED.has(e.code)) e.preventDefault(); };
  const onBlur = () => { keys.clear(); mouseT = mouseL = false; };
  const toCanvas = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * CW, y: ((e.clientY - r.top) / r.height) * CH }; };
  const onMove = (e) => {
    if (ended) return;
    const p = toCanvas(e);
    if (p.x < 0 || p.x > CW) return;
    let best = 0, bd = 1e9;
    xs.forEach((x, i) => { const d = Math.abs(x - p.x); if (d < bd) { bd = d; best = i; } });
    pick = best;
  };
  const onDown = (e) => { e.preventDefault(); if (e.button === 0) mouseT = true; else if (e.button === 2) mouseL = true; else if (e.button === 1) wheelLift += 5; };
  const onUp = (e) => { if (e.button === 0) mouseT = false; else if (e.button === 2) mouseL = false; };
  const onWheel = (e) => { e.preventDefault(); if (e.deltaY < 0) wheelLift += 4; };
  const onCtx = (e) => e.preventDefault();
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mouseup', onUp, true);
  root.addEventListener('mousemove', onMove);
  root.addEventListener('mousedown', onDown);
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('contextmenu', onCtx);

  function say(t, d = 1.1) { msg = t; msgT = d; }
  function dropSet(reason) {
    let any = false;
    for (const p of pins) { if (p.set) any = true; p.set = false; p.over = false; }
    if (any) { mistakes++; say(reason || 'LES GOUPILLES RETOMBENT'); }
    bind = 0;
  }
  function bend(amount, text) {
    stress += amount; peakStress = Math.max(peakStress, Math.min(1, stress));
    if (text) say(text);
    if (stress >= 1) { play('lock_pick_fail'); result = { ok: false }; ended = true; endT = 0; say('CROCHET CASSÉ !', 9); }
  }

  // ── Logique ──
  function step(dt) {
    if (msgT > 0) msgT -= dt;
    if (ended) { endT += dt; if (endT > (result && result.ok ? 1.1 : 1.3)) finish(!!(result && result.ok), result && result.ok ? quality() : 0, false); return; }
    const holdT = keys.has('Space') || mouseT;
    const lifting = keys.has('ArrowUp') || keys.has('KeyW') || keys.has('KeyZ') || mouseL || wheelLift > 0;
    tension = clamp(tension + (holdT ? 0.85 : -1.7) * dt, 0, 1);
    if (tension < 0.08 && (pins.some((p) => p.set || p.over))) dropSet();
    const red = tension > hi;
    if (red && !wasRed) { mistakes += 0.5; say('TROP DE FORCE !', 0.8); }
    wasRed = red;
    pickX += (xs[pick] - pickX) * Math.min(1, dt * 14);
    const bi = order[bind];
    let stressed = false;
    pins.forEach((p, i) => {
      if (p.set) { p.lift = Math.max(0, p.lift - 120 * dt); return; }
      const under = i === pick && Math.abs(pickX - xs[i]) < 6;
      const binding = i === bi && tension > lo * 0.6;
      if (under && lifting) {
        const impulse = wheelLift > 0 ? wheelLift : 0;
        if (binding && red) { stressed = true; bend(dt * (0.55 + diff * 0.12), null); p.jitter = 1; }
        else if (p.over) { stressed = true; bend(dt * 0.9, null); p.jitter = 1; }
        else { p.lift += (binding ? 26 : 44) * dt + impulse * (binding ? 0.7 : 1); }
        clickT -= dt;
        if (clickT <= 0) { play('lock_pick_click'); clickT = binding ? 0.11 : 0.18; }
      } else if (!p.over) p.lift = Math.max(0, p.lift - 70 * dt);
      p.lift = clamp(p.lift, 0, 40);
      if (binding && !p.over) {
        if (tension >= lo && tension <= hi && Math.abs(p.lift - p.setH) <= tol) {
          p.set = true; p.over = false; bind++; play('lock_pick_set'); say('CLIC !', 0.6);
          if (bind >= N) { ended = true; endT = 0; result = { ok: true }; play('lock_open'); say('OUVERT !', 9); }
        } else if (p.lift > p.setH + tol) { p.over = true; mistakes++; play('lock_pick_fail'); bend(0.38, 'GOUPILLE BLOQUÉE ! RELÂCHEZ LA TENSION'); }
      }
      p.jitter = Math.max(0, p.jitter - dt * 6);
    });
    wheelLift = 0;
    if (!stressed) stress = Math.max(0, stress - dt * 0.12);
  }
  const quality = () => clamp(1 - mistakes * 0.15 - peakStress * 0.4, 0, 1);

  // ── Rendu ──
  function pinRect(x, y, w, h, c1, c2, c3) {
    g.fillStyle = c1; g.fillRect(x, y, w, h);
    g.fillStyle = c2; g.fillRect(x, y, 2, h); g.fillRect(x, y, w, 1);
    g.fillStyle = c3; g.fillRect(x + w - 2, y, 2, h); g.fillRect(x, y + h - 1, w, 1);
  }
  function draw() {
    const grd = g.createLinearGradient(0, 0, 0, CH);
    grd.addColorStop(0, '#1a1d24'); grd.addColorStop(1, '#0b0c10');
    g.fillStyle = grd; g.fillRect(0, 0, CW, CH);
    const rot = result && result.ok ? Math.min(1, endT / 0.5) : 0;
    // corps de serrure
    g.fillStyle = '#7a5a20'; g.fillRect(56, 28, 330, 206);
    g.fillStyle = '#b8902e'; g.fillRect(60, 32, 322, 198);
    g.fillStyle = '#d8b04a'; g.fillRect(60, 32, 322, 3);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(60, 40 + i * 30, 322, 1); }
    // barillet (rotor)
    const plugY = SHEAR + Math.round(rot * 6);
    g.fillStyle = '#5a4214'; g.fillRect(64, plugY - 1, 314, PLUG_BOT - SHEAR + 2);
    g.fillStyle = '#c89a34'; g.fillRect(66, plugY, 310, PLUG_BOT - SHEAR);
    g.fillStyle = '#e0bc5c'; g.fillRect(66, plugY, 310, 2);
    g.fillStyle = '#1a1206'; g.fillRect(66, plugY + 46, 300, 12);
    g.fillStyle = 'rgba(255,240,180,0.25)'; g.fillRect(66, SHEAR, 310, 1);
    // chambres + goupilles
    const bi = order[bind];
    pins.forEach((p, i) => {
      const x = xs[i], cx = x - 8;
      g.fillStyle = '#2a1e0a'; g.fillRect(cx - 2, 40, 20, SHEAR - 40 + (PLUG_BOT - SHEAR) - 14);
      const jit = p.jitter > 0 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      const keyTop = PIN_BASE - p.lift - p.kl;
      const drvBot = p.set ? SHEAR - 1 : keyTop - (p.over ? 0 : 0);
      const drvTop = drvBot - 26;
      // ressort
      g.strokeStyle = '#9aa0aa'; g.lineWidth = 1; g.beginPath();
      const top = 44, coils = 7;
      for (let k = 0; k <= coils * 2; k++) { const yy = top + ((drvTop - top) * k) / (coils * 2); const xx = cx + (k % 2 ? 14 : 2); if (k) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
      g.stroke();
      // goupille menante (acier)
      pinRect(cx + 1 + jit, drvTop, 14, 26, '#c8ccd4', '#eef0f4', '#7a7e88');
      // goupille de clé (laiton), pointe en bas
      const kt = p.set ? PIN_BASE - p.lift - p.kl : keyTop;
      pinRect(cx + 1 + jit, kt + rot * 6, 14, p.kl - 3, '#d89a3c', '#f4c070', '#8a5a1c');
      g.fillStyle = '#d89a3c'; g.beginPath(); g.moveTo(cx + 1 + jit, kt + p.kl - 3 + rot * 6); g.lineTo(cx + 15 + jit, kt + p.kl - 3 + rot * 6); g.lineTo(cx + 8 + jit, kt + p.kl + 1 + rot * 6); g.fill();
      // aide visuelle (difficulté basse) : la goupille qui résiste rougeoie sous tension
      if (diff <= 2 && i === bi && !ended && tension > lo * 0.6) { g.fillStyle = 'rgba(255,80,40,0.25)'; g.fillRect(cx - 1, drvTop, 18, 26); }
      // état
      g.fillStyle = p.set ? '#5f5' : p.over ? '#f55' : '#444';
      g.fillRect(x - 4, 238, 8, 4);
    });
    // crochet
    const p = pins[pick];
    const under = Math.abs(pickX - xs[pick]) < 6;
    const tipY = PIN_BASE - (under && !p.set ? p.lift : 0) + 3;
    const bendA = stress * 0.25;
    g.save();
    g.translate(pickX, tipY);
    g.rotate(bendA);
    g.strokeStyle = stress > 0.6 ? '#e8a0a0' : '#d0d4dc'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-6, 7); g.lineTo(-pickX - 20, 12 + stress * 10); g.stroke();
    g.strokeStyle = '#555a64'; g.lineWidth = 7; g.beginPath(); g.moveTo(-pickX + 20, 13 + stress * 10); g.lineTo(-pickX - 30, 14 + stress * 10); g.stroke();
    g.restore();
    // clé de tension
    g.save();
    g.translate(70, PLUG_BOT - 6); g.rotate(tension * 0.28 + rot * 0.5);
    g.fillStyle = '#3a3e48'; g.fillRect(-4, -4, 10, 8); g.fillRect(-4, 0, 8, 46);
    g.fillStyle = '#6a707c'; g.fillRect(-4, -4, 10, 1);
    g.restore();
    // jauges
    const gx = 110, gy = 252, gw = 200;
    drawText(g, 'TENSION', gx - 8, gy + 1, '#aaa', 1, 'right');
    g.fillStyle = '#1a1c22'; g.fillRect(gx, gy, gw, 9);
    g.fillStyle = '#2a6a2a'; g.fillRect(gx + gw * lo, gy, gw * (hi - lo), 9);
    g.fillStyle = '#6a2020'; g.fillRect(gx + gw * hi, gy, gw * (1 - hi), 9);
    g.fillStyle = tension > hi ? '#f55' : tension >= lo ? '#7f7' : '#ddd'; g.fillRect(gx + gw * tension - 1, gy - 3, 3, 15);
    drawText(g, 'CROCHET', gx - 8, gy + 17, '#aaa', 1, 'right');
    g.fillStyle = '#1a1c22'; g.fillRect(gx, gy + 16, gw, 6);
    g.fillStyle = stress > 0.66 ? '#f44' : stress > 0.33 ? '#fb4' : '#8ac'; g.fillRect(gx, gy + 16, gw * Math.min(1, stress), 6);
    const setN = pins.filter((q) => q.set).length;
    drawText(g, 'GOUPILLES ' + setN + '/' + N, 318, gy + 1, '#ffd27a');
    drawText(g, 'NIVEAU ' + '★'.repeat(diff), 318, gy + 15, '#8a8e98');
    drawText(g, 'CROCHETAGE', 12, 8, '#ffd27a', 2);
    if (msg && msgT > 0) {
      const col = msg === 'OUVERT !' || msg === 'CLIC !' ? '#7f7' : '#f77';
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(CW / 2 - 140, 84, 280, 24);
      drawText(g, msg, CW / 2, 90, col, msg.length > 22 ? 1 : 2, 'center');
    }
  }

  let raf = 0, last = performance.now();
  const loop = (now) => {
    if (!root.isConnected && !ended) { finish(false, 0, true); return; }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    try { step(dt); if (root.isConnected) draw(); } catch (e) { try { console.warn('[crochetage]', e); } catch (_) { /* */ } }
    if (!done) raf = requestAnimationFrame(loop);
  };
  let done = false;
  function finish(success, q, cancelled) {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('mouseup', onUp, true);
    root.remove();
    if (active === handle) active = null;
    try { opts.onDone?.(!!success, cancelled ? 0 : clamp(q || 0, 0, 1), !!cancelled); } catch (e) { try { console.warn('[crochetage] onDone', e); } catch (_) { /* */ } }
  }
  const handle = { cancel: () => finish(false, 0, true) };
  active = handle;
  draw();
  raf = requestAnimationFrame(loop);
  return handle;
}
