// Interface (DOM) : HUD, invites, sous-titres, inventaire, lecteur de textes, plan, montre, modes « écran »
// (jeux, ordinateurs), instruments, tableau électrique, régie, résumés de nuit, mort, fins, chat.
import { ITEMS } from '../data/items.js';
import { SHOPS, AREAS } from '../data/shops.js';
import { CIRCUITS } from '../world/power.js';
import { COSTUMES } from '../data/costumes.js';
import { Net } from '../net/net.js';
import { Audio } from '../engine/audio.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.root.innerHTML = '';
    this.modal = null; this.modalStack = [];
    const r = this.root;
    this.cross = el('div', 'nb-cross'); r.appendChild(this.cross);
    this.promptEl = el('div', 'nb-prompt'); r.appendChild(this.promptEl);
    this.subEl = el('div', 'nb-subs'); r.appendChild(this.subEl);
    this.toastEl = el('div', 'nb-toasts'); r.appendChild(this.toastEl);
    this.bar = el('div', 'nb-hotbar'); r.appendChild(this.bar);
    this.stats = el('div', 'nb-stats', '<div class="nb-st"><span>♥</span><i class="hp"></i></div><div class="nb-st"><span>⚡</span><i class="sta"></i></div><div class="nb-st"><span>🔦</span><i class="bat"></i></div>'); r.appendChild(this.stats);
    this.clockEl = el('div', 'nb-clock'); r.appendChild(this.clockEl);
    this.objEl = el('div', 'nb-objective'); r.appendChild(this.objEl);
    this.alertsEl = el('div', 'nb-alerts'); r.appendChild(this.alertsEl);
    this.dmg = el('div', 'nb-damage'); r.appendChild(this.dmg);
    this.fadeEl = el('div', 'nb-fade'); r.appendChild(this.fadeEl);
    this.cardEl = el('div', 'nb-card'); r.appendChild(this.cardEl);
    this.layerEl = el('div', 'nb-layers'); r.appendChild(this.layerEl);
    this.scream = el('div', 'nb-scream'); r.appendChild(this.scream);
    this.rear = el('canvas', 'nb-rear'); this.rear.width = 320; this.rear.height = 180; r.appendChild(this.rear);
    this.chatEl = el('div', 'nb-chat'); r.appendChild(this.chatEl);
    this.netEl = el('div', 'nb-net'); r.appendChild(this.netEl);
    this.osd = el('div', 'nb-osd'); r.appendChild(this.osd); this._osdKey = ''; // incrustation de la caméra-piéton
    this.slotsVersion = -1; this.subQueue = []; this.subT = 0;
    this.objective = '';
    window.addEventListener('keydown', (e) => this.onKey(e));
    game.input.onLockChange = (locked) => { if (!locked && !this.modal && game.running && !this._noPauseOnUnlock && game.player.mode !== 'desk' && game.player.mode !== 'spectate') this.openPause(); };
  }

  onKey(e) {
    if (this.game.input.textMode) return;
    if (e.code === 'Escape') {
      if (this.modal) { if (this.modal.onEsc) this.modal.onEsc(); else this.closeModal(); e.preventDefault(); return; }
      if (this.game.security?.fullscreen || this.game.player.mode === 'desk') return;
      this.openPause(); return;
    }
    if (e.code === 'Tab' && !this.game.input.captureHandler) { e.preventDefault(); if (this.modal?.kind === 'inventory') this.closeModal(); else if (!this.modal && this.game.player.alive) this.openInventory(); }
    if (e.code === 'KeyT' && Net.online && !this.modal && !this.game.input.captureHandler) { e.preventDefault(); this.openChat('local'); }
  }

  // ── base ──
  toast(text, dur = 3) {
    const t = el('div', 'nb-toast', esc(text)); this.toastEl.appendChild(t);
    while (this.toastEl.children.length > 4) this.toastEl.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 600); }, dur * 1000);
  }
  setPrompt(text, target) { if (this._lastPrompt !== text) { this._lastPrompt = text; this.promptEl.innerHTML = text ? esc(text).replace(/(E|R|G|F|Clic gauche|Clic droit)( :)/g, '<b>$1</b>$2') : ''; this.cross.classList.toggle('on', !!text); } }
  subtitle(who, text, dur) {
    if (this.game.settings.subtitles === false) return;
    const d = dur || Math.max(2.5, text.length * 0.065 + 1);
    this.subQueue.push({ who, text, d });
    if (this.subQueue.length > 3) this.subQueue.shift();
    this.renderSubs();
  }
  renderSubs() { this.subEl.innerHTML = this.subQueue.map(s => `<div class="nb-sub">${s.who ? '<b>' + esc(s.who) + ' :</b> ' : ''}${esc(s.text)}</div>`).join(''); }
  setObjective(t) { this.objective = t || ''; this.objEl.textContent = this.objective; this.objEl.style.display = t ? 'block' : 'none'; }
  alert(text, kind = 'warn', dur = 6) { const a = el('div', 'nb-alert ' + kind, esc(text)); this.alertsEl.prepend(a); while (this.alertsEl.children.length > 5) this.alertsEl.lastChild.remove(); setTimeout(() => a.remove(), dur * 1000); }
  damageFlash(a) { this.dmg.style.transition = 'none'; this.dmg.style.opacity = Math.min(0.8, a); requestAnimationFrame(() => { this.dmg.style.transition = 'opacity 0.8s'; this.dmg.style.opacity = 0; }); }
  fade(to, dur = 1) { this.fadeEl.style.transition = `opacity ${dur}s`; this.fadeEl.style.opacity = to; return new Promise(r => setTimeout(r, dur * 1000)); }
  card(title, sub, dur = 4) { this.cardEl.innerHTML = `<h1>${esc(title)}</h1><h2>${esc(sub || '')}</h2>`; this.cardEl.classList.add('on'); clearTimeout(this._cardT); this._cardT = setTimeout(() => this.cardEl.classList.remove('on'), dur * 1000); }
  flashSlot(i) { this._flash = { i, t: 0.6 }; }
  error(e) { if (this._errShown) return; this._errShown = true; this.toast('Erreur : ' + (e?.message || e), 8); setTimeout(() => this._errShown = false, 5000); }
  showWatch() { this.toast('🕒 ' + this.game.clockString() + (this.game.isDay ? '' : '  —  nuit ' + this.game.night), 2.5); }

  // ── calques modaux ──
  openModal(kind, node, opts = {}) {
    this.closeModal(true);
    const wrap = el('div', 'nb-modal ' + (opts.cls || '')); wrap.appendChild(node);
    this.layerEl.appendChild(wrap);
    this.modal = { kind, node: wrap, onEsc: opts.onEsc, onClose: opts.onClose };
    this._noPauseOnUnlock = true; this.game.input.unlock(); setTimeout(() => this._noPauseOnUnlock = false, 200);
    if (opts.pause) this.game.paused = true;
    return wrap;
  }
  closeModal(silent = false) {
    if (!this.modal) return;
    const m = this.modal; this.modal = null;
    m.node.remove(); this.game.input.captureHandler = null; this.game.paused = false;
    m.onClose?.();
    if (!silent && this.game.running && this.game.player.mode !== 'desk') this.game.input.lock();
  }

  showText(title, text) {
    const n = el('div', 'nb-paper', `<h2>${esc(title)}</h2><div class="txt">${esc(text).replace(/\n/g, '<br>')}</div><p class="hint">Échap ou clic pour fermer</p>`);
    n.addEventListener('click', () => this.closeModal());
    this.openModal('text', n);
    this.game.sfx('paper', null, { volume: 0.4, bus: 'ui' });
    this.game.hooks.emit('text_read', text);
  }
  keypad(title, digits, cb) {
    const g = this.game;
    if (g.keypadModule?.startKeypad) { this._noPauseOnUnlock = true; g.input.unlock(); g.input.enabled = false; g.keypadModule.startKeypad({ title, digits, sound: (s) => g.sfx(s, null, { bus: 'ui' }), onDone: (code) => { g.input.enabled = true; g.input.lock(); setTimeout(() => this._noPauseOnUnlock = false, 300); cb(code); } }); return; }
    const code = prompt(title + ' (' + digits + ' chiffres)'); cb(code && code.replace(/\D/g, '').slice(0, digits));
  }
  lockpick(difficulty, cb) {
    const g = this.game;
    if (g.lockpickModule?.startLockpick) { this._noPauseOnUnlock = true; g.input.unlock(); g.input.enabled = false; g.lockpickModule.startLockpick({ difficulty, sound: (s) => g.sfx(s, null, { bus: 'ui' }), onDone: (ok, q, cancelled) => { g.input.enabled = true; g.input.lock(); setTimeout(() => this._noPauseOnUnlock = false, 300); if (!cancelled) cb(ok, q ?? 1); } }); return; }
    const ok = Math.random() < 0.6; cb(ok, Math.random());
  }

  // Jouer sur un écran (borne, console, ordinateur)
  playScreen(device, kind, opts = {}) {
    const g = this.game;
    const entry = g.screens.personal(kind, { notes: g.story?.computerNotes?.(), shop: device?.opts?.shop || device?.zone || null });
    const wrap = el('div', 'nb-screenplay');
    const c = entry.screen.canvas; c.className = 'nb-screen-canvas';
    wrap.appendChild(c);
    wrap.appendChild(el('p', 'hint', esc(device?.name || '') + ' — flèches / ZQSD, Entrée, Espace — Échap pour quitter'));
    let raf = 0, last = performance.now();
    const loop = () => { const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now; try { entry.screen.update(dt); } catch (e) { /* */ } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    g.player.mode = 'screen';
    const off = g.hooks.on('screen:claw_win', (d) => device?.onScreenEvent?.('claw_win', d));
    const off2 = g.hooks.on('screen:highscore', (d) => { if (d.game === 'glouton' && d.score >= 10000) { g.sim.do('flag', { k: 'glouton_secret', v: true }); g.discover('egg', 'glouton'); } });
    this.openModal('screen', wrap, {
      onClose: () => { cancelAnimationFrame(raf); g.player.mode = 'walk'; try { entry.screen.dispose?.(); } catch (e) { /* */ } off(); off2(); },
    });
    g.input.captureHandler = (code, down) => { if (code === 'Escape') return false; try { entry.screen.key(code, down); } catch (e) { /* */ } return true; };
  }
  playScreenOverlay(kind, prop) { this.playScreen({ name: prop?.def?.name }, kind); }

  instrument(device, instr) {
    const g = this.game; const pos = device.center;
    const WHITE = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
    const WN = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76];
    const BLACK = { KeyW: 61, KeyE: 63, KeyT: 66, KeyY: 68, KeyU: 70, KeyO: 73, KeyP: 75 };
    const DRUMS = { KeyA: 'kick', KeyS: 'snare', KeyD: 'hat', KeyF: 'tom', KeyG: 'crash' };
    const LABELS = 'Q S D F G H J K L M'.split(' ');
    const wrap = el('div', 'nb-instrument');
    if (instr === 'drums') wrap.innerHTML = `<h2>Batterie</h2><div class="keys">${Object.entries(DRUMS).map(([k, v], i) => `<div class="key w" data-k="${k}">${'QSDFG'[i]}<small>${v}</small></div>`).join('')}</div><p class="hint">Échap pour arrêter</p>`;
    else wrap.innerHTML = `<h2>${esc(device.name)}</h2><div class="keys">${WHITE.map((k, i) => `<div class="key w" data-k="${k}">${LABELS[i]}</div>`).join('')}</div><p class="hint">Rangée Q-S-D-F-G-H-J-K-L-M (touches blanches), Z-E-T-Y-U-O-P (dièses) — Échap pour arrêter</p>`;
    const hist = [];
    const play = (code) => {
      const kEl = wrap.querySelector(`[data-k="${code}"]`); if (kEl) { kEl.classList.add('on'); setTimeout(() => kEl.classList.remove('on'), 150); }
      if (instr === 'drums') { if (DRUMS[code]) g.sim.do('drum', { k: DRUMS[code], pos: pos.toArray() }); return; }
      let n = WN[WHITE.indexOf(code)]; if (n === undefined) n = BLACK[code]; if (n === undefined) return;
      g.sim.do('note', { instr, n, pos: pos.toArray(), v: 0.85, from: Net.myId });
      hist.push(n % 12); if (hist.length > 11) hist.shift();
      const lune = [0, 0, 0, 2, 4, 2, 0, 4, 2, 2, 0];
      if (hist.length === 11 && hist.every((x, i) => x === lune[i])) { g.sim.do('flag', { k: 'played_lune', v: true }); g.toast('♪ Au clair de la lune… Quelque part, quelqu\'un applaudit doucement.'); g.discover('egg', 'lune'); g.hooks.emit('played_lune'); }
    };
    g.player.mode = 'screen';
    this.openModal('instrument', wrap, { onClose: () => { g.player.mode = 'walk'; } });
    g.input.captureHandler = (code, down) => { if (code === 'Escape') return false; if (down) play(code); return true; };
    wrap.querySelectorAll('.key').forEach(k => k.addEventListener('mousedown', () => play(k.dataset.k)));
  }

  breakers(dev) {
    const g = this.game; const P = g.power;
    const wrap = el('div', 'nb-panel');
    const render = () => {
      const s = P.state; const gen = s.gen;
      wrap.innerHTML = `<h2>Tableau électrique général</h2>
        <div class="row ${s.mains ? 'ok' : 'bad'}">Réseau EDF : <b>${s.mains ? 'PRÉSENT' : 'COUPÉ'}</b> — Groupe : <b>${gen.running ? 'EN MARCHE' : 'ARRÊTÉ'}</b> (${Math.round(gen.fuel)} %)</div>
        <div class="grid">${Object.entries(CIRCUITS).map(([c, name]) => {
          const on = s.breakers[c] !== false, blown = s.blown[c];
          return `<button class="brk ${on ? 'on' : 'off'} ${blown ? 'blown' : ''}" data-c="${c}"><span>${esc(name)}</span><b>${blown ? 'FUSIBLE GRILLÉ' : on ? 'ON' : 'OFF'}</b></button>`;
        }).join('')}</div>
        <p class="hint">Cliquez pour basculer un disjoncteur. Un fusible grillé se remplace avec un fusible en main. Échap pour fermer.</p>`;
      wrap.querySelectorAll('.brk').forEach(b => b.onclick = () => {
        const c = b.dataset.c;
        if (P.state.blown[c]) { if (g.player.hasItem('fuse')) g.sim.do('fuse', { c, prop: g.player.inv.findDef('fuse') }); else this.toast('Il faut un fusible.'); return; }
        g.sim.do('breaker', { c, on: P.state.breakers[c] === false });
        g.sfx('breaker', null, { bus: 'ui' });
      });
    };
    render(); const off = g.hooks.on('power_state', render);
    this.openModal('breakers', wrap, { onClose: off });
  }

  pa(dev) {
    const g = this.game;
    const wrap = el('div', 'nb-panel');
    const styles = [['muzak', 'Musique d\'ambiance'], ['jazz', 'Jazz'], ['classical', 'Classique'], ['disco', 'Disco'], ['chanson', 'Variété'], ['xmas', 'Noël'], ['lofi', 'Lofi'], ['music_box', 'Boîte à musique']];
    wrap.innerHTML = `<h2>Régie d'annonces</h2>
      <textarea maxlength="200" placeholder="Votre annonce (elle sera diffusée dans tout le centre)…"></textarea>
      <div class="btns"><button data-a="say">📢 Annoncer</button><button data-a="chime">🔔 Carillon</button><button data-a="bell">🚨 Test alarme</button></div>
      <h3>Musique dans le centre</h3><div class="btns">${styles.map(([s, n]) => `<button data-m="${s}">${n}</button>`).join('')}<button data-m="stop">⏹ Arrêter</button></div>
      <p class="hint">Échap pour fermer</p>`;
    const ta = wrap.querySelector('textarea');
    ta.addEventListener('focus', () => g.input.textMode = true); ta.addEventListener('blur', () => g.input.textMode = false);
    wrap.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'say') { const t = ta.value.trim(); if (t) { g.sim.do('pa', { text: t.slice(0, 200), chime: true }); ta.value = ''; } }
      if (a === 'chime') g.sim.do('pa', { chime: true });
      if (a === 'bell') g.sim.do('pa', { bell: true });
    });
    wrap.querySelectorAll('[data-m]').forEach(b => b.onclick = () => g.sim.do('pa', { music: b.dataset.m }));
    this.openModal('pa', wrap, { onClose: () => { g.input.textMode = false; } });
  }

  openInventory() {
    const g = this.game, p = g.player;
    const wrap = el('div', 'nb-inv');
    const render = () => {
      const slots = p.inv.slots.map((id, i) => { const pr = id ? g.props.get(id) : null; return `<div class="slot ${i === p.inv.sel ? 'sel' : ''}" data-i="${i}"><b>${(i + 1) % 10}</b>${pr ? `<span class="sw" style="background:#${pr.def.c.toString(16).padStart(6, '0')}"></span>${esc(pr.def.name)}` : '<em>vide</em>'}</div>`; }).join('');
      const held = p.heldProp;
      const worn = Object.entries(p.wear).filter(([k, v]) => v && ['feet', 'head', 'face', 'body', 'neck', 'hands'].includes(k) && typeof v === 'string').map(([k, v]) => `<li>${esc(ITEMS[v]?.name || v)} <button data-un="${k}">Retirer</button></li>`).join('');
      wrap.innerHTML = `<h2>Inventaire</h2><div class="slots">${slots}</div>
        <div class="detail">${held ? `<h3>${esc(held.def.name)}</h3><p>${esc(held.def.desc || '')}</p>${held.data.value || held.def.value ? `<p>Valeur : ${held.data.value || held.def.value} €</p>` : ''}${held.data.battery !== undefined ? `<p>Piles : ${Math.round(held.data.battery * 100)} %</p>` : ''}` : '<p>Sélectionnez un objet (1-0 ou clic).</p>'}</div>
        <div class="worn"><h3>Tenue</h3><p>Costume : <b>${esc(COSTUMES[p.costume]?.name)}</b> ${p.costume !== 'guard' ? '<button data-un="costume">Retirer</button>' : ''}</p><ul>${worn}</ul></div>
        <p class="hint">Tab ou Échap pour fermer — G : poser — clic droit : lancer</p>`;
      wrap.querySelectorAll('.slot').forEach(s => s.onclick = () => { p.inv.select(+s.dataset.i); render(); });
      wrap.querySelectorAll('[data-un]').forEach(b => b.onclick = () => { this.unwear(b.dataset.un); render(); });
    };
    render();
    this.openModal('inventory', wrap);
  }
  unwear(slot) {
    const g = this.game, p = g.player;
    if (slot === 'costume') { const c = p.costume; p.setCostume('guard'); g.sim.do('spawnprop', { def: 'costume_' + c, pos: p.dropPos(), held: true }); return; }
    const v = p.wear[slot]; if (!v) return; p.wear[slot] = null; if (slot === 'face') p.wear.faceItem = null; g.sim.do('spawnprop', { def: v, pos: p.dropPos(), held: true }); p.setCostume(p.costume);
  }

  openPause() {
    const g = this.game;
    const wrap = el('div', 'nb-pause');
    const s = g.settings;
    wrap.innerHTML = `<h1>Pause</h1>
      <div class="menu"><button data-a="resume">Reprendre</button><button data-a="options">Options</button>${g.mode === 'story' && !Net.online ? '<button data-a="restart">Recommencer la nuit</button>' : ''}<button data-a="quit">Quitter vers le menu</button></div>
      <div class="opts" style="display:none">
        <label>Volume <input type="range" min="0" max="1" step="0.05" data-o="volume" value="${s.volume ?? 0.9}"></label>
        <label>Musique <input type="range" min="0" max="1" step="0.05" data-o="musicVolume" value="${s.musicVolume ?? 0.8}"></label>
        <label>Sensibilité <input type="range" min="0.2" max="3" step="0.1" data-o="sensitivity" value="${s.sensitivity ?? 1}"></label>
        <label>Champ de vision <input type="range" min="55" max="100" step="1" data-o="fov" value="${s.fov ?? 72}"></label>
        <label>Échelle de rendu <input type="range" min="0.4" max="1" step="0.05" data-o="renderScale" value="${s.renderScale ?? 1}"></label>
        <label><input type="checkbox" data-o="autoScale" ${s.autoScale !== false ? 'checked' : ''}> Résolution dynamique</label>
        <label><input type="checkbox" data-o="shadows" ${s.shadows !== false ? 'checked' : ''}> Ombres de la lampe</label>
        <label><input type="checkbox" data-o="bloom" ${s.bloom !== false ? 'checked' : ''}> Halo lumineux (bloom)</label>
        <label><input type="checkbox" data-o="bodycam" ${s.bodycam !== false ? 'checked' : ''}> Effet caméra-piéton</label>
        <label><input type="checkbox" data-o="screamers" ${s.screamers !== false ? 'checked' : ''}> Screamers</label>
        <label><input type="checkbox" data-o="subtitles" ${s.subtitles !== false ? 'checked' : ''}> Sous-titres</label>
        <label><input type="checkbox" data-o="voices" ${s.voices !== false ? 'checked' : ''}> Voix de synthèse</label>
        <label><input type="checkbox" data-o="invertY" ${s.invertY ? 'checked' : ''}> Inverser l'axe vertical</label>
        <button data-a="back">Retour</button>
      </div>`;
    wrap.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'resume') this.closeModal();
      if (a === 'options') { wrap.querySelector('.menu').style.display = 'none'; wrap.querySelector('.opts').style.display = 'grid'; }
      if (a === 'back') { wrap.querySelector('.menu').style.display = ''; wrap.querySelector('.opts').style.display = 'none'; }
      if (a === 'restart') { this.closeModal(true); g.story.restartNight('Nuit recommencée.'); }
      if (a === 'quit') { g.onQuit?.(); }
    });
    wrap.querySelectorAll('[data-o]').forEach(inp => inp.oninput = inp.onchange = () => {
      const k = inp.dataset.o; const v = inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value);
      s[k] = v; g.applySettings?.(k);
    });
    this.openModal('pause', wrap, { pause: true });
  }

  // ── plan ──
  toggleMap() { if (this.modal?.kind === 'map') { this.closeModal(); return; } const n = el('div', 'nb-map', this.mapSVG()); n.addEventListener('click', () => this.closeModal()); this.openModal('map', n); }
  mapSVG() {
    const g = this.game; const p = g.player.pos;
    const floor = p.y < -1 ? -1 : p.y > 4.5 ? 1 : 0;
    const sx = (x) => (x + 115) * 3.3, sz = (z) => (z + 28) * 3.3 + 20;
    let s = `<svg viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="210" fill="#0c1016"/>`;
    s += `<text x="10" y="13" fill="#9ab" font-size="10" font-family="monospace">${floor === 1 ? 'ÉTAGE' : floor === -1 ? 'SOUS-SOL' : 'REZ-DE-CHAUSSÉE'} — le point rouge, c'est vous</text>`;
    if (floor >= 0) {
      s += `<rect x="${sx(-66)}" y="${sz(-8)}" width="${132 * 3.3}" height="${16 * 3.3}" fill="#1c2430"/>`;
      for (const sh of SHOPS.filter(x => x.floor === floor)) {
        const x0 = -66 + sh.slot * 12; const z0 = sh.side === 'N' ? 8 : -22;
        const locked = !g.isShopUnlocked(sh.id);
        s += `<rect x="${sx(x0) + 1}" y="${sz(z0) + 1}" width="${sh.w * 12 * 3.3 - 2}" height="${14 * 3.3 - 2}" fill="#${sh.color.toString(16).padStart(6, '0')}" opacity="${locked ? 0.15 : 0.55}"/>`;
        s += `<text x="${sx(x0 + sh.w * 6)}" y="${sz(z0 + 7)}" fill="#fff" font-size="6" text-anchor="middle" font-family="Arial">${esc(sh.name.split(' ')[0])}</text>`;
      }
      if (floor === 0) { s += `<rect x="${sx(-76)}" y="${sz(-5)}" width="${10 * 3.3}" height="${10 * 3.3}" fill="#29b6f6" opacity="0.6"/><text x="${sx(-71)}" y="${sz(1)}" fill="#fff" font-size="6" text-anchor="middle">POSTE</text>`; s += `<rect x="${sx(-112)}" y="${sz(-25)}" width="${32 * 3.3}" height="${30 * 3.3}" fill="#795548" opacity="0.35"/><text x="${sx(-96)}" y="${sz(-10)}" fill="#fff" font-size="7" text-anchor="middle">ENTREPÔT</text>`; s += `<rect x="${sx(66)}" y="${sz(-8)}" width="${14 * 3.3}" height="${16 * 3.3}" fill="#ffb300" opacity="0.4"/><text x="${sx(73)}" y="${sz(1)}" fill="#fff" font-size="6" text-anchor="middle">ENTRÉE</text>`; }
      s += `<circle cx="${sx(0)}" cy="${sz(0)}" r="${3 * 3.3}" fill="#4fc3f7" opacity="0.4"/>`;
      if (floor === 1) { // vide central (entre les passerelles) et aile administrative
        for (const [a, b] of [[-61.5, -46.5], [-43.5, -28], [-24, 24], [28, 43.5], [46.5, 61.5]]) s += `<rect x="${sx(a)}" y="${sz(-4)}" width="${(b - a) * 3.3}" height="${8 * 3.3}" fill="#06080b" stroke="#2a3644" stroke-dasharray="2 2"/>`;
        s += `<rect x="${sx(-76)}" y="${sz(-22)}" width="${10 * 3.3}" height="${35 * 3.3}" fill="#8d6e63" opacity="0.45"/><text x="${sx(-71)}" y="${sz(-4)}" fill="#fff" font-size="6" text-anchor="middle">ADMIN.</text>`;
      }
      if (floor === 0) s += `<rect x="${sx(66)}" y="${sz(-8)}" width="${14 * 3.3}" height="${16 * 3.3}" fill="#c9a227" opacity="0.35"/><text x="${sx(70.5)}" y="${sz(-5)}" fill="#fff" font-size="6" text-anchor="middle">HALL</text>`;
      s += `<rect x="${sx(-80)}" y="${sz(22)}" width="${160 * 3.3}" height="${3 * 3.3}" fill="#455a64"/><rect x="${sx(-80)}" y="${sz(-25)}" width="${160 * 3.3}" height="${3 * 3.3}" fill="#455a64"/>`;
    } else {
      s += `<rect x="${sx(-66)}" y="${sz(-24)}" width="${132 * 3.3}" height="${48 * 3.3}" fill="#263238"/><text x="${sx(0)}" y="${sz(0)}" fill="#cfd8dc" font-size="10" text-anchor="middle">PARKING</text>`;
      for (const [n, z0, z1] of [['Groupe', -24, -12], ['Électrique', -12, -2], ['Régie', -2, 6], ['Chaufferie', 6, 13]]) s += `<rect x="${sx(-76)}" y="${sz(z0)}" width="${10 * 3.3}" height="${(z1 - z0) * 3.3}" fill="#5d4037" opacity="0.6" stroke="#000"/><text x="${sx(-71)}" y="${sz((z0 + z1) / 2)}" fill="#fff" font-size="5" text-anchor="middle">${n}</text>`;
      s += `<rect x="${sx(-88)}" y="${sz(-10)}" width="${8 * 3.3}" height="${6 * 3.3}" fill="#000" stroke="#b71c1c"/><text x="${sx(-84)}" y="${sz(-6.5)}" fill="#e57373" font-size="5" text-anchor="middle">B-13</text>`;
    }
    s += `<rect x="${sx(-55.2)}" y="${sz(1.5)}" width="${2.4 * 3.3}" height="${2.4 * 3.3}" fill="#b2ebf2" opacity="0.8"/><text x="${sx(-54)}" y="${sz(6.4)}" fill="#b2ebf2" font-size="5" text-anchor="middle">ascenseur</text>`;
    s += `<circle cx="${sx(p.x)}" cy="${sz(p.z)}" r="3.5" fill="#ff1744"><animate attributeName="r" values="3;5;3" dur="1s" repeatCount="indefinite"/></circle>`;
    return s + '</svg><p class="hint">Clic ou Échap pour fermer</p>';
  }
  mapText() {
    return 'REZ-DE-CHAUSSÉE (ouest → est)\nNord : ' + SHOPS.filter(s => s.floor === 0 && s.side === 'N').map(s => s.name).join(' · ') + '\nSud : ' + SHOPS.filter(s => s.floor === 0 && s.side === 'S').map(s => s.name).join(' · ') +
      '\n\nÉTAGE\nNord : ' + SHOPS.filter(s => s.floor === 1 && s.side === 'N').map(s => s.name).join(' · ') + '\nSud : ' + SHOPS.filter(s => s.floor === 1 && s.side === 'S').map(s => s.name).join(' · ') +
      '\n\nPoste de sécurité : extrémité ouest du rez-de-chaussée. Hall d\'entrée et accueil : extrémité est. Escalators de part et d\'autre de l\'atrium. Ascenseur panoramique : galerie ouest (parking, rez-de-chaussée, étage). Administration : bout ouest de l\'étage. Escaliers de service aux deux bouts. Parking au sous-sol.';
  }

  // ── écrans de fin / mort / résumé ──
  showSummary(html, buttons) {
    const n = el('div', 'nb-summary', html);
    const b = el('div', 'btns'); for (const [label, fn] of buttons) { const bt = el('button', '', esc(label)); bt.onclick = () => { this.closeModal(true); fn(); }; b.appendChild(bt); } n.appendChild(b);
    this.openModal('summary', n, { onEsc: () => { } });
  }
  screamerFlash(kind = 'face', dur = 0.7) {
    if (this.game.settings.screamers === false) return;
    const c = document.createElement('canvas'); c.width = 400; c.height = 400; drawScreamFace(c.getContext('2d'), kind);
    this.scream.innerHTML = ''; this.scream.appendChild(c); this.scream.classList.add('on');
    this.game.sfx('jumpscare', null, { volume: 1, bus: 'ui' });
    setTimeout(() => this.scream.classList.remove('on'), dur * 1000);
  }
  rearView(on) { this.rear.style.display = on ? 'block' : 'none'; this.game.photo.rearView(on ? this.rear : null); }

  // ── chat multijoueur ──
  openChat(channel = 'local') {
    const g = this.game;
    const box = el('div', 'nb-chatinput', `<span>${channel === 'radio' ? '📻 Radio' : '💬 Proximité'}</span><input maxlength="200" placeholder="Message… (Entrée pour envoyer, Échap pour annuler)">`);
    const inp = box.querySelector('input');
    this.root.appendChild(box); g.input.textMode = true; this._noPauseOnUnlock = true; g.input.unlock(); inp.focus();
    const close = () => { box.remove(); g.input.textMode = false; g.input.lock(); setTimeout(() => this._noPauseOnUnlock = false, 300); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const t = inp.value.trim(); if (t) g.sync.sendChat(t, channel); close(); } if (e.key === 'Escape') close(); });
  }
  chatLine(name, text, kind = '') { const l = el('div', 'line ' + kind, `<b>${esc(name)}</b> ${esc(text)}`); this.chatEl.appendChild(l); while (this.chatEl.children.length > 8) this.chatEl.firstChild.remove(); setTimeout(() => l.classList.add('old'), 12000); }

  update(dt) {
    const g = this.game, p = g.player;
    // sous-titres
    if (this.subQueue.length) { this.subQueue[0].d -= dt; if (this.subQueue[0].d <= 0) { this.subQueue.shift(); this.renderSubs(); } }
    this.updateQuests?.(dt); // objectifs de la nuit (suivi, témoins des bornes)
    // barre d'inventaire
    if (this.slotsVersion !== p.inv.version) {
      this.slotsVersion = p.inv.version;
      this.bar.innerHTML = p.inv.slots.map((id, i) => { const pr = id ? g.props.get(id) : null; return `<div class="hs ${i === p.inv.sel ? 'sel' : ''}"><b>${(i + 1) % 10}</b>${pr ? `<span class="sw" style="background:#${pr.def.c.toString(16).padStart(6, '0')}"></span><em>${esc(pr.def.name)}</em>` : ''}</div>`; }).join('');
    }
    const S = p.stats;
    const q = (sel) => this.stats.querySelector(sel);
    q('.hp').style.width = Math.max(0, S.health) + '%'; q('.sta').style.width = Math.max(0, S.stamina) + '%'; q('.bat').style.width = Math.round((p.battery ?? 1) * 100) + '%';
    this.stats.classList.toggle('lowbat', (p.battery ?? 1) < 0.2);
    if (g.settings.showClock !== false) this.clockEl.textContent = (g.isDay ? '☀ ' : '☾ ') + g.clockString() + (g.mode === 'infinite' ? '  ·  nuit ' + g.night : g.isDay ? '' : '  ·  nuit ' + g.night + '/10');
    const hideHud = !!this.modal || p.mode === 'desk' || g.security?.fullscreen;
    this.root.classList.toggle('hud-hidden', hideHud);
    this.root.classList.toggle('cctv-on', !!g.security?.fullscreen);
    this.updateOSD();
    if (Net.online) this.netEl.textContent = `🌐 ${Net.room} · ${Net.playerCount} joueur(s)${Net.isHost ? ' · hôte' : ''} · ${Math.round(Net.latency)} ms`;
    this.netEl.style.display = Net.online ? 'block' : 'none';
  }
}

// Incrustation de la caméra-piéton : « ● REC HÉLIOS SÉCURITÉ · AGENT 04 · 14/11 02:13:44 » (horloge du jeu, date de la
// nuit en cours, le jour change à minuit). Le DOM n'est réécrit qu'une fois par seconde réelle : l'horloge du jeu
// tourne ~32 fois plus vite la nuit, les secondes avancent donc par sauts, comme un enregistrement en accéléré.
UI.prototype.updateOSD = function () {
  const g = this.game, on = g.settings.bodycam !== false && g.player.alive;
  this.osd.style.display = on ? '' : 'none';
  if (!on) return;
  const key = Math.floor(performance.now() / 1000) + '|' + g.night; if (key === this._osdKey) return; this._osdKey = key;
  const t = (((g.env ? g.env.minutes : 1320) % 1440) + 1440) % 1440, sec = Math.floor(t * 60);
  const d = new Date(2026, 10, 13 + (g.night || 1) + (t < 720 ? 1 : 0)), p2 = (v) => String(v).padStart(2, '0');
  const agent = Net.online ? p2((parseInt(String(Net.myId).replace(/\D/g, ''), 10) || 4) % 100) : '04';
  this.osd.innerHTML = `<span class="rec">●</span> REC&nbsp; HÉLIOS SÉCURITÉ · AGENT ${agent} · ${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(Math.floor(sec / 3600) % 24)}:${p2(Math.floor(sec / 60) % 60)}:${p2(sec % 60)}`;
};

export function drawScreamFace(ctx, kind) {
  const W = 400, H = 400;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const gr = ctx.createRadialGradient(200, 190, 20, 200, 200, 200); gr.addColorStop(0, '#d8d0c4'); gr.addColorStop(0.6, '#8a8278'); gr.addColorStop(1, '#000');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(200, 200, 130, 170, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(150, 170, 30, 40, 0.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(250, 170, 30, 40, -0.2, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(150, 175, 4, 0, 7); ctx.arc(250, 175, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#100'; ctx.beginPath(); ctx.ellipse(200, 290, 45, 65, 0, 0, 7); ctx.fill();
  for (let i = 0; i < 2000; i++) { ctx.fillStyle = `rgba(${Math.random() * 60},0,0,${Math.random() * 0.3})`; ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  if (kind === 'bear') { ctx.fillStyle = '#8d5a24'; ctx.beginPath(); ctx.arc(85, 60, 50, 0, 7); ctx.arc(315, 60, 50, 0, 7); ctx.fill(); }
}

// ── Objectifs (mini-quêtes, js/game/quests.js) : suivi discret en haut à gauche (style incrustation de caméra-piéton),
// annonces (nouvel objectif, réussi, manqué), journal de la nuit (J), suivi masqué / affiché (H, réglage questHud).
UI.prototype.questInit = function () {
  if (this.qEl) return;
  this.qEl = el('div', 'nb-quests'); this.qToastEl = el('div', 'q-toast'); this.qList = el('div', 'q-list');
  this.qEl.append(this.qToastEl, this.qList); this.root.appendChild(this.qEl);
  this.qKey = ''; this.qT = 0; this.qFresh = new Map(); this.qToasts = []; this.qToastT = 0; this.qRows = [];
  window.addEventListener('keydown', (e) => this.questKey(e));
};
UI.prototype.questKey = function (e) {
  const g = this.game; if (!g.running || g.input.textMode || e.repeat) return;
  if (e.code === 'KeyJ') {
    if (this.modal?.kind === 'journal') { e.preventDefault(); this.closeModal(); return; }
    if (this.modal || g.input.captureHandler || !g.quests?.view || !g.player.alive || !['walk', 'sit', 'hide'].includes(g.player.mode)) return;
    e.preventDefault(); this.openJournal();
  } else if (e.code === 'KeyH') {
    if (this.modal || g.input.captureHandler || !g.quests) return;
    const on = g.settings.questHud === false; g.quests.setHud(on); this.qKey = '';
    this.toast(on ? 'Suivi des objectifs affiché (J : journal).' : 'Suivi des objectifs masqué (H pour le réafficher, J : journal).', 2.5);
  }
};
UI.prototype.questChanged = function () { this.qKey = ''; if (this.modal?.kind === 'journal') this.renderJournal(); };
// annonce : dans le suivi (ou en bandeau central si l'écran est occupé : caméras, fenêtre ouverte)
UI.prototype.questToast = function (kind, text, opt) {
  this.questInit();
  const g = this.game;
  const lead = kind === 'new' ? (opt ? 'Objectif facultatif' : 'Nouvel objectif') : kind === 'done' ? '✓ Objectif accompli' : '✗ Objectif manqué';
  g.sfx(kind === 'new' ? 'notify' : kind === 'done' ? 'success' : 'error', null, { bus: 'ui', volume: kind === 'fail' ? 0.18 : 0.26 });
  if (g.security?.fullscreen || this.modal) { this.toast(lead + ' : ' + text, 4); return; }
  this.qToasts.push({ kind, html: '<b>' + esc(lead) + '</b> · ' + esc(text) + (kind === 'new' && !this._qHinted ? ' <span style="opacity:.6">— J : journal</span>' : '') });
  if (kind === 'new') this._qHinted = true;
  if (this.qToasts.length > 3) this.qToasts.shift();
};
UI.prototype.updateQuests = function (dt) {
  const g = this.game, Q = g.quests; if (!Q) return;
  this.questInit();
  Q.updateReaders?.();
  this.root.classList.toggle('q-modal', !!this.modal);
  this.qEl.classList.toggle('net', !!Net.online);
  // annonces, l'une après l'autre
  if (this.qToastT > 0) { this.qToastT -= dt; if (this.qToastT <= 0) this.qToastEl.classList.remove('on'); }
  else if (this.qToasts.length) { const t = this.qToasts.shift(); this.qToastEl.className = 'q-toast on ' + t.kind; this.qToastEl.innerHTML = t.html; this.qToastT = 4.2; }
  this.qT -= dt; if (this.qT > 0) return; this.qT = 0.1;
  const rows = Q.view ? Q.rows() : [];
  const hide = g.settings.questHud === false;
  this.qList.classList.toggle('off', hide);
  // ligne d'objectif générale : remplacée par le suivi tant qu'il y a des objectifs en cours
  this.objEl.style.display = rows.length && !hide ? 'none' : this.objective ? 'block' : 'none';
  const now = performance.now() / 1000;
  for (const r of rows) if (!this.qFresh.has(r.key)) this.qFresh.set(r.key, now);
  const show = rows.slice(0, 3);
  const key = show.map(r => r.key + '|' + r.prog + '|' + r.sub + '|' + (now - this.qFresh.get(r.key) < 5 ? 1 : 0)).join('§') + '#' + rows.length + (hide ? 'h' : '');
  if (key !== this.qKey) {
    this.qKey = key;
    this.qList.innerHTML = show.map(r => `<div class="q-row ${r.opt ? 'opt' : ''} ${now - this.qFresh.get(r.key) < 5 ? 'fresh' : ''}"><div class="q-t"><span class="q-tt">${esc(r.title)}</span>${r.prog ? `<span class="q-p">${esc(r.prog)}</span>` : ''}</div><div class="q-s"><span class="q-a">▲</span><span class="q-d"></span><span class="q-sub">${esc(r.sub)}</span></div></div>`).join('') + (rows.length > show.length ? `<div class="q-more">+${rows.length - show.length} autre${rows.length - show.length > 1 ? 's' : ''} · J : journal</div>` : '');
    this.qRows = [...this.qList.querySelectorAll('.q-row')].map((n, i) => ({ r: show[i], a: n.querySelector('.q-a'), d: n.querySelector('.q-d'), s: n.querySelector('.q-sub') }));
  }
  // flèche et distance vers la cible de chaque objectif (repère du regard du joueur)
  const p = g.player, pos = p.pos, yaw = p.yaw;
  for (const R of this.qRows) {
    const t = Q.target(R.r.st, R.r.ss);
    if (!t) { R.a.style.visibility = 'hidden'; R.d.textContent = ''; if (!R.r.sub) R.s.textContent = ''; continue; }
    const dx = t.x - pos.x, dz = t.z - pos.z, dy = t.y - (pos.y + 1), dist = Math.hypot(dx, dz);
    const fwd = -dx * Math.sin(yaw) - dz * Math.cos(yaw), right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const near = dist < 2.5 && Math.abs(dy) < 2.5;
    R.a.style.visibility = near ? 'hidden' : 'visible';
    R.a.style.transform = 'rotate(' + Math.atan2(right, fwd).toFixed(2) + 'rad)';
    R.d.textContent = near ? 'ici' : Math.round(dist) + ' m' + (dy > 2.5 ? ' ↑' : dy < -2.5 ? ' ↓' : '');
    if (!R.r.sub) { const z = g.world.zoneAt(t.x, t.y + 0.3, t.z); R.s.textContent = z ? z.name : ''; }
  }
};
UI.prototype.openJournal = function () {
  const n = el('div', 'nb-journal'); this.qJournal = n;
  n.addEventListener('click', (e) => { if (e.target.dataset?.a === 'close') this.closeModal(); if (e.target.dataset?.a === 'hud') { const g = this.game; g.quests.setHud(g.settings.questHud === false); this.qKey = ''; this.renderJournal(); } });
  this.openModal('journal', n);
  this.renderJournal();
  this.game.sfx('book_page', null, { volume: 0.35, bus: 'ui' });
};
UI.prototype.renderJournal = function () {
  const g = this.game, n = this.qJournal; if (!n || this.modal?.kind !== 'journal') return;
  const J = g.quests?.journal();
  if (!J) { n.innerHTML = '<h2>Journal de garde</h2><p class="jr-empty">Aucun objectif pour l\'instant.</p><div class="btns"><button data-a="close">Fermer</button></div>'; return; }
  const head = J.mode === 'story' ? 'Nuit ' + J.night + (J.subtitle ? ' — ' + J.subtitle : '') : 'Mode infini — nuit ' + J.night;
  const step = (s) => s.s === 'hidden' ? '' : `<li class="${s.s}">${esc(s.title)}${s.opt ? ' <span class="jr-tag">facultatif</span>' : ''}${s.prog ? `<span class="jr-p">${esc(s.prog)}</span>` : ''}${s.choice ? `<span class="jr-c">— ${esc(s.choice)}</span>` : ''}${s.s === 'active' && s.desc ? `<p>${esc(s.desc)}</p>` : ''}</li>`;
  const quests = J.quests.map(q => {
    const next = q.steps.findIndex(s => s.s === 'hidden'), upcoming = next >= 0 && q.s === 'active' ? '<li class="hidden">… la suite plus tard</li>' : '';
    const tag = q.s === 'over' ? (q.ok ? '<span class="jr-tag ok">terminée</span>' : '<span class="jr-tag ko">incomplète</span>') : q.optional ? '<span class="jr-tag">facultative</span>' : '';
    return `<section class="jr-q ${q.s}"><h3>${esc(q.title)}${q.giver ? ` <em>${esc(q.giver)}</em>` : ''} ${tag}</h3><ul>${q.steps.map(step).join('')}${upcoming}</ul>${q.reward && q.s !== 'over' ? `<p class="jr-rw">Récompense : ${esc(q.reward)}</p>` : ''}</section>`;
  }).join('') || '<p class="jr-empty">Rien pour l\'instant. La nuit commence à 22 h : lisez la note de Gérard sur le bureau.</p>';
  n.innerHTML = `<h2>Journal de garde<small>${esc(head)}</small></h2><p class="jr-sum">Objectifs : ${J.done}/${J.total} · ${esc(g.clockString())}</p>${quests}<div class="btns"><button data-a="close">Fermer (J)</button><button data-a="hud">${g.settings.questHud === false ? 'Afficher' : 'Masquer'} le suivi à l'écran (H)</button></div><p class="hint">Les objectifs manqués ne bloquent jamais la nuit : ils comptent au rapport de l'aube.</p>`;
};
