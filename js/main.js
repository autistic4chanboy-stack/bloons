// Point d'entrée : menu principal (histoire, infini, multijoueur, options, wiki), chargement, lancement.
import * as Save from './game/save.js';
import { Net } from './net/net.js';
import { COSTUMES } from './data/costumes.js';
import { NIGHTS } from './data/story.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TIPS = [
  'Les braqueurs ne viennent pas si la bijouterie est éclairée.',
  'Un appareil qui crépite ? Coupez son disjoncteur au sous-sol.',
  'Les baskets rendent vos pas presque silencieux. Les escarpins, l\'inverse.',
  'Gardez la lumière allumée chez Élégance : les mannequins détestent ça.',
  'Si Bobby n\'est plus à sa place, fermez la porte du poste.',
  'Les enregistrements CCTV sont des preuves… contre les autres comme contre vous.',
  'Nourrissez le chat errant : il vous préviendra du danger.',
  'Une nuit dure 15 minutes. Tenez jusqu\'à 6 h.',
  'L\'horloge parlante répond toujours au 3699.',
  'La farine révèle ce qui ne veut pas être vu.',
];

let settings = Save.settings();
let mpInfo = null;

function menu(html) { const m = $('#menu'); m.innerHTML = html; m.classList.remove('hidden'); return m; }
function hideMenu() { $('#menu').classList.add('hidden'); }

function titleScreen() {
  const s = Save.load();
  const m = menu(`
    <div class="title-bg"><canvas id="static"></canvas></div>
    <div class="title">
      <div class="logo"><span class="nb">NUIT BLANCHE</span><span class="sub">Centre Commercial Hélios</span></div>
      <nav class="main-menu">
        <button data-a="story">Mode histoire <small>10 nuits</small></button>
        <button data-a="infinite">Mode infini <small>record : ${s.infinite.best} nuit(s)</small></button>
        <button data-a="multi">Multijoueur <small>${mpInfo ? 'serveur détecté' : 'coopération en ligne'}</small></button>
        <button data-a="options">Options</button>
        <a class="btn" href="wiki/index.html" target="_blank" rel="noopener">Wiki du joueur ↗</a>
        <button data-a="credits">Crédits</button>
      </nav>
      <p class="foot">Casque recommandé · Clic pour capturer la souris · Échap pour la pause</p>
    </div>`);
  animateStatic($('#static'));
  m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    clickSound();
    const a = b.dataset.a;
    if (a === 'story') storyMenu(); if (a === 'infinite') launch({ mode: 'infinite', night: 1 }); if (a === 'multi') multiMenu(); if (a === 'options') optionsMenu(); if (a === 'credits') credits();
  });
}

function storyMenu() {
  const s = Save.load();
  const slots = s.slots.map((sl, i) => sl ? `<div class="slot"><h3>Emplacement ${i + 1}</h3><p>Nuit ${sl.night} — « ${esc(NIGHTS[sl.night]?.subtitle || '')} »</p><p class="small">${new Date(sl.updated).toLocaleString('fr-FR')}</p><button data-c="${i}">Continuer</button><button data-n="${i}" class="ghost">Recommencer</button><button data-d="${i}" class="danger">Supprimer</button></div>`
    : `<div class="slot empty"><h3>Emplacement ${i + 1}</h3><p>Vide</p><button data-n="${i}">Nouvelle partie</button></div>`).join('');
  const m = menu(`<div class="panel"><h1>Mode histoire</h1><div class="slots">${slots}</div><button class="back">← Retour</button></div>`);
  m.querySelector('.back').onclick = titleScreen;
  m.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const i = +b.dataset.c; const sl = Save.slot(i); launch({ mode: 'story', night: sl.night, slot: i, data: sl }); });
  m.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { const i = +b.dataset.n; if (Save.slot(i) && !confirm('Écraser cette sauvegarde ?')) return; Save.saveSlot(i, { night: 1, flags: {}, stats: {} }); launch({ mode: 'story', night: 1, slot: i, data: Save.slot(i) }); });
  m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (confirm('Supprimer définitivement ?')) { Save.deleteSlot(+b.dataset.d); storyMenu(); } });
}

function multiMenu() {
  const url = settings.serverUrl || (mpInfo ? Net.defaultServerUrl() : '');
  const rooms = (mpInfo?.rooms || []).map(r => `<li><b>${esc(r.code)}</b> — ${r.players}/${r.max} · ${r.mode === 'infinite' ? 'infini' : 'histoire'}${r.locked ? ' 🔒' : ''} <button data-join="${esc(r.code)}">Rejoindre</button></li>`).join('') || '<li class="small">Aucun salon public pour l\'instant.</li>';
  const m = menu(`<div class="panel"><h1>Multijoueur (coopération)</h1>
    <p class="small">${mpInfo ? 'Vous êtes sur un serveur Nuit Blanche : tout est prêt.' : 'Le multijoueur nécessite le serveur Node.js du dossier <code>multiplayer/</code> (voir le wiki). Indiquez son adresse ci-dessous.'}</p>
    <label>Adresse du serveur <input id="mp-url" value="${esc(url)}" placeholder="wss://mon-serveur.exemple.com/ws"></label>
    <label>Votre nom <input id="mp-name" maxlength="20" value="${esc(settings.playerName || 'Gardien')}"></label>
    <label>Costume de départ <select id="mp-cost">${Object.entries(COSTUMES).map(([k, c]) => `<option value="${k}" ${k === (settings.costume || 'guard') ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <div class="cols">
      <div><h3>Créer un salon</h3>
        <label>Mode <select id="mp-mode"><option value="story">Histoire (10 nuits)</option><option value="infinite">Infini</option></select></label>
        <label>Mot de passe (optionnel) <input id="mp-pass-c" type="password" maxlength="30"></label>
        <button id="mp-create">Créer</button></div>
      <div><h3>Rejoindre</h3>
        <label>Code du salon <input id="mp-code" maxlength="5" style="text-transform:uppercase"></label>
        <label>Mot de passe <input id="mp-pass-j" type="password" maxlength="30"></label>
        <button id="mp-join">Rejoindre</button></div>
    </div>
    <h3>Salons ouverts</h3><ul class="rooms">${rooms}</ul>
    <p class="err" id="mp-err"></p>
    <button class="back">← Retour</button></div>`);
  m.querySelector('.back').onclick = titleScreen;
  const go = async (create, code) => {
    const u = $('#mp-url').value.trim() || Net.defaultServerUrl();
    const name = $('#mp-name').value.trim() || 'Gardien';
    settings.playerName = name; settings.serverUrl = $('#mp-url').value.trim(); settings.costume = $('#mp-cost').value; Save.saveSettings(settings);
    $('#mp-err').textContent = 'Connexion…';
    try {
      const w = await Net.connect(u, { create, room: create ? null : (code || $('#mp-code').value.trim().toUpperCase()), name, password: create ? $('#mp-pass-c').value : $('#mp-pass-j').value, mode: $('#mp-mode').value, costume: settings.costume });
      launch({ mode: w.mode || 'story', night: w.save?.night || 1, mp: w, data: w.save });
    } catch (e) { $('#mp-err').textContent = 'Échec : ' + e.message; }
  };
  $('#mp-create').onclick = () => go(true);
  $('#mp-join').onclick = () => go(false);
  m.querySelectorAll('[data-join]').forEach(b => b.onclick = () => go(false, b.dataset.join));
}

function optionsMenu() {
  const s = settings;
  const m = menu(`<div class="panel"><h1>Options</h1><div class="opts">
    <label>Nom du gardien <input data-o="playerName" type="text" maxlength="20" value="${esc(s.playerName)}"></label>
    <label>Qualité <select data-o="quality"><option value="low" ${s.quality === 'low' ? 'selected' : ''}>Basse</option><option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Moyenne</option><option value="high" ${s.quality === 'high' ? 'selected' : ''}>Haute (anticrénelage)</option></select></label>
    <label>Échelle de rendu <input data-o="renderScale" type="range" min="0.4" max="1" step="0.05" value="${s.renderScale}"></label>
    <label>Volume général <input data-o="volume" type="range" min="0" max="1" step="0.05" value="${s.volume}"></label>
    <label>Musique <input data-o="musicVolume" type="range" min="0" max="1" step="0.05" value="${s.musicVolume}"></label>
    <label>Sensibilité de la souris <input data-o="sensitivity" type="range" min="0.2" max="3" step="0.1" value="${s.sensitivity}"></label>
    <label>Champ de vision <input data-o="fov" type="range" min="55" max="100" step="1" value="${s.fov}"></label>
    <label><input data-o="shadows" type="checkbox" ${s.shadows ? 'checked' : ''}> Ombres de la lampe torche</label>
    <label><input data-o="bloom" type="checkbox" ${s.bloom ? 'checked' : ''}> Halo lumineux</label>
    <label><input data-o="volumetric" type="checkbox" ${s.volumetric ? 'checked' : ''}> Faisceau volumétrique</label>
    <label><input data-o="screamers" type="checkbox" ${s.screamers ? 'checked' : ''}> Screamers (sursauts)</label>
    <label><input data-o="subtitles" type="checkbox" ${s.subtitles ? 'checked' : ''}> Sous-titres</label>
    <label><input data-o="voices" type="checkbox" ${s.voices ? 'checked' : ''}> Voix de synthèse</label>
    <label><input data-o="invertY" type="checkbox" ${s.invertY ? 'checked' : ''}> Inverser l'axe vertical</label>
    </div>
    <h3>Sauvegardes (stockées dans ce navigateur)</h3>
    <div class="btns"><button id="exp">Exporter (fichier .json)</button><label class="btn file">Importer<input id="imp" type="file" accept=".json,application/json" hidden></label><button id="rst" class="danger">Tout effacer</button></div>
    <button class="back">← Retour</button></div>`);
  m.querySelectorAll('[data-o]').forEach(inp => inp.onchange = inp.oninput = () => { const k = inp.dataset.o; s[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? parseFloat(inp.value) : inp.value; Save.saveSettings(s); });
  $('#exp').onclick = () => { const blob = new Blob([Save.exportJSON()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nuit-blanche-sauvegarde.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#imp').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { Save.importJSON(await f.text()); settings = Save.settings(); alert('Sauvegarde importée.'); optionsMenu(); } catch (err) { alert('Erreur : ' + err.message); } };
  $('#rst').onclick = () => { if (confirm('Effacer toutes les sauvegardes et réglages de ce navigateur ?')) { Save.resetAll(); settings = Save.settings(); optionsMenu(); } };
  m.querySelector('.back').onclick = titleScreen;
}

function credits() {
  const m = menu(`<div class="panel"><h1>Crédits</h1>
    <p>« Nuit Blanche — Centre Commercial Hélios » : un jeu d'horreur et un bac à sable de gardien de nuit.</p>
    <p>Moteur : <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (licence MIT). Tout le reste (sons, musiques, textures, modèles, écrans, mini-jeux) est généré par le code, sans aucun fichier externe.</p>
    <p>Merci à tous les gardiens de nuit. Et à Gérard.</p>
    <button class="back">← Retour</button></div>`);
  m.querySelector('.back').onclick = titleScreen;
}

async function launch(opts) {
  hideMenu();
  const ld = $('#loading'); ld.classList.remove('hidden');
  $('.ld-tip').textContent = '💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)];
  const bar = $('.ld-bar i'), msg = $('.ld-msg');
  try {
    const { Game } = await import('./game/game.js');
    const game = new Game($('#game'), settings);
    window.__game = game;
    await game.init(opts, (p, t) => { bar.style.width = Math.round(p * 100) + '%'; msg.textContent = t; });
    game.onQuit = () => { Net.disconnect(); location.reload(); };
    game.story.begin(opts);
    ld.classList.add('hidden');
    game.start();
    game.input.wantLock = true;
    game.input.lock();
  } catch (e) {
    console.error(e);
    msg.innerHTML = '<b style="color:#ff5252">Impossible de lancer le jeu :</b> ' + esc(e.message) + '<br><small>Il faut un navigateur récent avec WebGL 2 (Chrome, Firefox, Edge, Safari 15+).</small><br><button onclick="location.reload()">Retour</button>';
  }
}

// Fond de l'écran titre : bande de vidéosurveillance d'une galerie déserte (horodatage, REC, silhouette furtive)
function animateStatic(c) {
  if (!c) return;
  const W = 320, H = 180; c.width = W; c.height = H; const ctx = c.getContext('2d');
  // décor fixe : galerie en perspective vers un point de fuite
  const bg = document.createElement('canvas'); bg.width = W; bg.height = H; const b = bg.getContext('2d');
  const vx = W * 0.52, vy = H * 0.46;
  b.fillStyle = '#0b0d0e'; b.fillRect(0, 0, W, H);
  const quad = (pts, col) => { b.fillStyle = col; b.beginPath(); b.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) b.lineTo(pts[i], pts[i + 1]); b.closePath(); b.fill(); };
  quad([0, H, W, H, vx + 14, vy + 8, vx - 14, vy + 8], '#1b1e1f'); // sol
  quad([0, 0, W, 0, vx + 14, vy - 8, vx - 14, vy - 8], '#121415'); // plafond
  for (let k = 0; k < 9; k++) { // vitrines et néons
    const t0 = Math.pow(k / 9, 1.6), t1 = Math.pow((k + 0.8) / 9, 1.6);
    const lx = (t) => vx - 14 - (vx - 14) * (1 - t), rx = (t) => vx + 14 + (W - vx - 14) * (1 - t);
    const yT = (t) => vy - 8 - (vy - 8) * (1 - t) * 0.92, yB = (t) => vy + 8 + (H - vy - 8) * (1 - t) * 0.78;
    const shade = 20 + k * 3;
    quad([lx(t0), yT(t0), lx(t1), yT(t1), lx(t1), yB(t1), lx(t0), yB(t0)], `rgb(${shade},${shade + 2},${shade + 3})`);
    quad([rx(t0), yT(t0), rx(t1), yT(t1), rx(t1), yB(t1), rx(t0), yB(t0)], `rgb(${shade - 4},${shade - 2},${shade})`);
    if (k % 2 === 0) { const cy = yT(t0) + (vy - yT(t0)) * 0.25; b.fillStyle = 'rgba(190,200,190,0.10)'; b.fillRect(vx - (vx - lx(t0)) * 0.3, cy, (vx - lx(t0)) * 0.6, 2); }
  }
  const noise = []; for (let f = 0; f < 6; f++) { const im = ctx.createImageData(W, H); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = Math.random() < 0.5 ? 18 : 0; } const nc = document.createElement('canvas'); nc.width = W; nc.height = H; nc.getContext('2d').putImageData(im, 0, 0); noise.push(nc); }
  const t0 = performance.now(); let last = 0, fig = 0;
  const draw = (now) => {
    if (!document.body.contains(c)) return;
    requestAnimationFrame(draw);
    if (now - last < 50) return; last = now; // ~20 images/s, comme une vieille caméra
    const t = (now - t0) / 1000;
    ctx.drawImage(bg, 0, 0);
    // silhouette au bout de la galerie, quelques instants toutes les ~9 s, un peu plus près à chaque fois
    const cyc = Math.floor(t / 9), ph = t % 9;
    if (ph > 6.2 && ph < 6.9 && cyc > 0) { fig = Math.min(5, cyc); const s = 0.6 + fig * 0.25, fx = vx + Math.sin(cyc * 1.7) * 18, fy = vy + 9 + fig * 3; ctx.fillStyle = '#000'; ctx.fillRect(fx - 2.2 * s, fy - 14 * s, 4.4 * s, 14 * s); ctx.beginPath(); ctx.arc(fx, fy - 16 * s, 2.4 * s, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(fx - 1.1 * s, fy - 16.5 * s, 0.7, 0.7); ctx.fillRect(fx + 0.6 * s, fy - 16.5 * s, 0.7, 0.7); }
    ctx.drawImage(noise[Math.floor(t * 20) % noise.length], 0, 0);
    if (Math.random() < 0.06) { const y = Math.floor(Math.random() * (H - 8)); try { ctx.drawImage(c, 0, y, W, 6, Math.round((Math.random() - 0.5) * 12), y, W, 6); } catch (e) { /* bande de parasites facultative */ } }
    for (let y = 0; y < H; y += 2) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, y, W, 1); }
    ctx.font = '8px monospace'; ctx.fillStyle = 'rgba(220,235,220,0.85)';
    ctx.fillText('CAM 07 — GALERIE RDC', 8, 12);
    const sec = Math.floor(t); ctx.fillText('14/11/87  03:' + String(33 + Math.floor(sec / 60) % 27).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'), 8, H - 8);
    if (Math.floor(t * 1.4) % 2 === 0) { ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(W - 34, 9, 3, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(220,235,220,0.85)'; ctx.fillText('REC', W - 28, 12); }
  };
  requestAnimationFrame(draw);
}
let _actx = null;
function clickSound() { try { _actx = _actx || new (window.AudioContext || window.webkitAudioContext)(); const o = _actx.createOscillator(), g = _actx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.05, _actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, _actx.currentTime + 0.08); o.connect(g).connect(_actx.destination); o.start(); o.stop(_actx.currentTime + 0.1); } catch (e) { /* */ } }

(async () => {
  mpInfo = await Net.detectServer();
  const q = new URLSearchParams(location.search);
  if (q.get('autostart')) { launch({ mode: q.get('mode') || 'story', night: +(q.get('night') || 1), test: true }); return; }
  titleScreen();
})();
