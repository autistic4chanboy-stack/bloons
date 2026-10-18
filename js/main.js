// Point d'entrée : menu principal (histoire, infini, multijoueur, options, wiki), chargement, lancement.
import * as Save from './game/save.js';
import { Net } from './net/net.js';
import { COSTUMES } from './data/costumes.js';
import { NIGHTS } from './data/story.js';
import { esc, SUN, keys, win, optionsHTML, bindOptions, navKey, hoverFocus, focusFirst, fmtDur } from './game/menukit.js';

const $ = (s, r = document) => r.querySelector(s);
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

// Les menus s'affichent par-dessus une même bande de vidéosurveillance (fond animé et incrustation, posés une fois) ;
// seul l'écran au premier plan change. Échap revient en arrière, ↑ ↓ ← → passent d'un élément à l'autre.
const nav = { back: null };
function shell() {
  const m = $('#menu');
  if (!m.querySelector('.title-bg')) {
    m.innerHTML = `<div class="title-bg"><canvas id="static"></canvas></div><div class="title-osd" aria-hidden="true"><span class="tl">CAM 07 — GALERIE RDC</span><span class="tr"><b class="rec">●</b> REC</span><span class="bl" id="osd-ts">14/11/87  03:33:00</span></div><div class="screen"></div>`;
    animateStatic($('#static'));
  }
  m.classList.remove('hidden');
  return m.querySelector('.screen');
}
function menu(html, { back = null, cls = '', focus = null } = {}) {
  const old = shell(), sc = document.createElement('div'); sc.className = 'screen ' + cls; sc.innerHTML = html; old.replaceWith(sc); // écran neuf : pas d'écouteurs qui s'empilent
  $('#menu').classList.toggle('sub', !!back); $('#menu').scrollTop = 0; nav.back = back;
  hoverFocus(sc); focusFirst(sc, focus);
  return sc;
}
function hideMenu() { const m = $('#menu'); m.classList.add('hidden'); m.innerHTML = ''; nav.back = null; } // vide le menu : l'animation du fond titre s'arrête
window.addEventListener('keydown', (e) => {
  const m = $('#menu'), sc = m.querySelector('.screen'); if (!sc || m.classList.contains('hidden')) return;
  if (e.key === 'Escape' && nav.back) { e.preventDefault(); clickSound(); nav.back(); return; }
  navKey(sc, e);
});
const backBtn = '<button class="back">Retour</button>';
const footKeys = (extra = []) => keys([['↑ ↓', 'Choisir'], ['Entrée', 'Valider'], ...extra, ['Échap', 'Retour']]);

function titleScreen() {
  const s = Save.load();
  const m = menu(`<div class="title">
      <header class="brand">
        <p class="mall">${SUN}<span><small>Centre commercial</small>Hélios</span></p>
        <h1 class="nb">Nuit blanche</h1>
        <p class="tag">Le centre ferme à 20 h. Vous, vous restez.</p>
      </header>
      <nav class="nb-osdmenu main-menu" aria-label="Menu principal">
        <button data-a="story"><span>Mode histoire</span><small>10 nuits</small></button>
        <button data-a="infinite"><span>Mode infini</span><small>record : ${s.infinite.best} nuit(s)</small></button>
        <button data-a="multi"><span>Multijoueur</span><small>${mpInfo ? 'serveur détecté' : 'coopération en ligne'}</small></button>
        <button data-a="options"><span>Options</span><small>poste & réglages</small></button>
        <a href="wiki/index.html" target="_blank" rel="noopener"><span>Wiki du joueur ↗</span><small>guide</small></a>
        <button data-a="credits"><span>Crédits</span><small>générique</small></button>
      </nav>
      <footer class="foot">${keys([['↑ ↓', 'Choisir'], ['Entrée', 'Valider']])}<span class="desc" aria-live="polite"></span><span class="tip">Casque recommandé · Clic pour capturer la souris · Échap pour la pause</span></footer>
    </div>`, { cls: 'home' });
  // petit écran : l'info de la ligne choisie (record…) passe dans le pied, comme la ligne d'état d'un magnétoscope
  const desc = m.querySelector('.desc'), setDesc = () => { desc.textContent = document.activeElement?.closest?.('.main-menu > *')?.querySelector('small')?.textContent || ''; };
  m.addEventListener('focusin', setDesc); setDesc();
  m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    clickSound();
    const a = b.dataset.a;
    if (a === 'story') storyMenu(); if (a === 'infinite') launch({ mode: 'infinite', night: 1 }); if (a === 'multi') multiMenu(); if (a === 'options') optionsMenu(); if (a === 'credits') credits();
  });
}
const backTo = (sel) => () => { titleScreen(); focusFirst($('#menu .screen'), `[data-a=${sel}]`); };

// Mode histoire : les emplacements sont des dossiers d'agent (nuit en cours, frise des 10 nuits, dernière garde,
// temps de service, avertissements de la direction)
function storyMenu() {
  const s = Save.load(), name = esc(settings.playerName || 'Gardien');
  const dossier = (sl, i) => {
    const n = String(i + 1).padStart(2, '0');
    if (!sl) return `<article class="dossier vacant"><span class="tab">Dossier n° ${n}</span><div class="d-b"><p class="d-v">Poste à pourvoir</p><p class="d-ad">Gardien de nuit (H/F). Débutant accepté. Prise de poste immédiate.</p></div><footer><button data-n="${i}" class="primary">Nouvelle partie</button></footer></article>`;
    const N = NIGHTS[sl.night] || {}, st = sl.stats || {}, warn = Math.floor(st.suspicion || 0), d = new Date(sl.updated);
    const bar = Array.from({ length: 10 }, (_, k) => `<i class="${k + 1 < sl.night ? 'done' : k + 1 === sl.night ? 'cur' : ''}"></i>`).join('');
    const when = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `<article class="dossier"><span class="tab">Dossier n° ${n}</span><header><p class="d-night"><b>Nuit ${String(sl.night).padStart(2, '0')}</b> / 10</p><span class="st">Actif</span></header>
      <div class="d-b"><p class="d-sub">« ${esc(N.subtitle || '')} »</p><div class="d-n" aria-label="Nuit ${sl.night} sur 10">${bar}</div><dl>
        <div><dt>Garde</dt><dd>${when}</dd></div>
        ${st.played ? `<div><dt>Service</dt><dd>${fmtDur(st.played)}</dd></div>` : ''}
        ${warn ? `<div class="warn"><dt>Blâmes</dt><dd>${warn}</dd></div>` : ''}
      </dl></div>
      <footer><button data-c="${i}" class="primary">Continuer</button><button data-n="${i}" class="ghost" title="Recommencer à la nuit 1" aria-label="Recommencer"><i aria-hidden="true">↺</i><span class="lbl">Recommencer</span></button><button data-d="${i}" class="danger" title="Supprimer ce dossier" aria-label="Supprimer"><i aria-hidden="true">✕</i><span class="lbl">Supprimer</span></button></footer></article>`;
  };
  const m = menu(win({ title: 'Mode histoire', k: 'Hélios Sécurité · Personnel de nuit', ref: 'Agent : ' + name, cls: 'w-story', body: `<div class="dossiers">${s.slots.map(dossier).join('')}</div>`, foot: footKeys() + backBtn }), { back: backTo('story'), focus: '[data-c], [data-n]' });
  m.querySelector('.back').onclick = backTo('story');
  m.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const i = +b.dataset.c; const sl = Save.slot(i); launch({ mode: 'story', night: sl.night, slot: i, data: sl }); });
  m.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { const i = +b.dataset.n; if (Save.slot(i) && !confirm('Écraser cette sauvegarde ?')) return; Save.saveSlot(i, { night: 1, flags: {}, stats: {} }); launch({ mode: 'story', night: 1, slot: i, data: Save.slot(i) }); });
  m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (confirm('Supprimer définitivement ?')) { Save.deleteSlot(+b.dataset.d); storyMenu(); } });
}

function multiMenu() {
  const url = settings.serverUrl || (mpInfo ? Net.defaultServerUrl() : '');
  const rooms = (mpInfo?.rooms || []).map(r => `<li><b>${esc(r.code)}</b><span>${r.players}/${r.max} · ${r.mode === 'infinite' ? 'infini' : 'histoire'}${r.locked ? ' · 🔒' : ''}</span><button data-join="${esc(r.code)}">Rejoindre</button></li>`).join('') || '<li class="empty">Aucun salon public pour l\'instant.</li>';
  const fld = (label, input, cls = '') => `<label class="nb-fld ${cls}"><span>${label}</span>${input}</label>`;
  const m = menu(win({ title: 'Multijoueur', k: 'Hélios Sécurité · Liaison radio', ref: 'Coopération', cls: 'w-multi', body: `
    <p class="lead">${mpInfo ? 'Vous êtes sur un serveur Nuit Blanche : tout est prêt.' : 'Le multijoueur nécessite le serveur Node.js du dossier <code>multiplayer/</code> (voir le wiki). Indiquez son adresse ci-dessous.'}</p>
    <div class="nb-form">
      ${fld('Adresse du serveur', `<input id="mp-url" value="${esc(url)}" placeholder="wss://mon-serveur.exemple.com/ws" spellcheck="false" autocomplete="off">`, 'wide')}
      ${fld('Votre nom', `<input id="mp-name" maxlength="20" value="${esc(settings.playerName || 'Gardien')}" spellcheck="false">`)}
      ${fld('Costume de départ', `<select id="mp-cost">${Object.entries(COSTUMES).map(([k, c]) => `<option value="${k}" ${k === (settings.costume || 'guard') ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
    </div>
    <div class="cols">
      <section class="nb-grp"><h3>Créer un salon</h3>
        ${fld('Mode', '<select id="mp-mode"><option value="story">Histoire (10 nuits)</option><option value="infinite">Infini</option></select>')}
        ${fld('Mot de passe (optionnel)', '<input id="mp-pass-c" type="password" maxlength="30">')}
        <button id="mp-create" class="primary">Créer</button></section>
      <section class="nb-grp"><h3>Rejoindre</h3>
        ${fld('Code du salon', '<input id="mp-code" maxlength="5" class="code" spellcheck="false" autocomplete="off">')}
        ${fld('Mot de passe', '<input id="mp-pass-j" type="password" maxlength="30">')}
        <button id="mp-join" class="primary">Rejoindre</button></section>
    </div>
    <section class="nb-grp"><h3>Salons ouverts</h3><ul class="nb-list rooms">${rooms}</ul></section>
    <p class="err" id="mp-err" role="status"></p>`, foot: footKeys() + backBtn }), { back: backTo('multi'), focus: mpInfo ? '#mp-name' : '#mp-url' });
  m.querySelector('.back').onclick = backTo('multi');
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

// Options : les réglages du pupitre (mêmes rubriques et mêmes commandes que dans le menu pause), puis les sauvegardes
function optionsMenu() {
  const s = settings;
  const m = menu(win({ title: 'Options', k: 'Hélios Sécurité · Réglages du poste', ref: 'Pupitre', cls: 'w-opts', body: optionsHTML(s) + `
    <section class="nb-grp saves"><h3>Sauvegardes <small>stockées dans ce navigateur</small></h3>
    <div class="btns"><button id="exp">Exporter (fichier .json)</button><label class="btn file" tabindex="0">Importer<input id="imp" type="file" accept=".json,application/json" hidden></label><button id="rst" class="danger">Tout effacer</button></div></section>`,
  foot: footKeys([['← →', 'Régler']]) + backBtn }), { back: backTo('options') });
  bindOptions(m, s, () => Save.saveSettings(s));
  $('#exp').onclick = () => { const blob = new Blob([Save.exportJSON()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nuit-blanche-sauvegarde.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#imp').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { Save.importJSON(await f.text()); settings = Save.settings(); alert('Sauvegarde importée.'); optionsMenu(); } catch (err) { alert('Erreur : ' + err.message); } };
  $('#rst').onclick = () => { if (confirm('Effacer toutes les sauvegardes et réglages de ce navigateur ?')) { Save.resetAll(); settings = Save.settings(); optionsMenu(); } };
  m.querySelector('.back').onclick = backTo('options');
}

function credits() {
  const m = menu(win({ title: 'Crédits', k: 'Hélios Sécurité · Archives', ref: 'Générique', cls: 'w-credits', body: `
    <p class="lead">« Nuit Blanche — Centre Commercial Hélios » : un jeu d'horreur et un bac à sable de gardien de nuit.</p>
    <dl class="nb-dl"><div><dt>Moteur</dt><dd><a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (licence MIT)</dd></div>
    <div><dt>Tout le reste</dt><dd>Sons, musiques, textures, modèles, écrans, mini-jeux : générés par le code, sans aucun fichier externe.</dd></div></dl>
    <p class="sig">Merci à tous les gardiens de nuit. Et à Gérard.</p>`, foot: footKeys() + backBtn }), { back: backTo('credits'), focus: '.back' });
  m.querySelector('.back').onclick = backTo('credits');
}

async function launch(opts) {
  hideMenu();
  const ld = $('#loading'); ld.classList.remove('hidden');
  $('.ld-tip').innerHTML = '<b>Le mot de Gérard</b>' + esc(TIPS[Math.floor(Math.random() * TIPS.length)]);
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
    msg.innerHTML = '<b style="color:#ff5252">Impossible de lancer le jeu :</b> ' + esc(e.message) + '<br><small>Il faut un navigateur récent avec WebGL 2 (Chrome, Firefox, Edge, Safari 15+).</small><br><button class="primary" onclick="location.reload()">Retour</button>';
  }
}

// Fond des menus : bande de vidéosurveillance d'une galerie déserte (parasites, silhouette furtive) ; l'incrustation
// (caméra, REC, horodatage) est en HTML par-dessus
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
  const t0 = performance.now(), ts = document.getElementById('osd-ts'); let last = 0, fig = 0, lastSec = -1;
  const draw = (now) => {
    if (!document.body.contains(c)) return;
    requestAnimationFrame(draw);
    if (now - last < 50) return; last = now; // ~20 images/s, comme une vieille caméra
    const t = Math.max(0, (now - t0) / 1000); // l'horodatage de la première image peut précéder t0
    ctx.drawImage(bg, 0, 0);
    // silhouette au bout de la galerie, quelques instants toutes les ~9 s, un peu plus près à chaque fois
    const cyc = Math.floor(t / 9), ph = t % 9;
    if (ph > 6.2 && ph < 6.9 && cyc > 0) { fig = Math.min(5, cyc); const s = 0.6 + fig * 0.25, fx = vx + Math.sin(cyc * 1.7) * 18, fy = vy + 9 + fig * 3; ctx.fillStyle = '#000'; ctx.fillRect(fx - 2.2 * s, fy - 14 * s, 4.4 * s, 14 * s); ctx.beginPath(); ctx.arc(fx, fy - 16 * s, 2.4 * s, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(fx - 1.1 * s, fy - 16.5 * s, 0.7, 0.7); ctx.fillRect(fx + 0.6 * s, fy - 16.5 * s, 0.7, 0.7); }
    ctx.drawImage(noise[Math.floor(t * 20) % noise.length], 0, 0);
    if (Math.random() < 0.06) { const y = Math.floor(Math.random() * (H - 8)); try { ctx.drawImage(c, 0, y, W, 6, Math.round((Math.random() - 0.5) * 12), y, W, 6); } catch (e) { /* bande de parasites facultative */ } }
    for (let y = 0; y < H; y += 2) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, y, W, 1); }
    // horodatage : dans l'incrustation (texte net, même style que celle de la caméra-piéton en jeu), une fois par seconde
    const sec = Math.floor(t); if (sec !== lastSec) { lastSec = sec; if (ts) ts.textContent = '14/11/87  03:' + String(33 + Math.floor(sec / 60) % 27).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
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
