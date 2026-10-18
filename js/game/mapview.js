// Vue plein écran du plan du centre : lecture d'une borne (E), touche M (guide du centre), bouton « plan » de la
// console du poste. La pancarte est redessinée à la taille de l'écran (nette en 640 × 360 comme en 4K) ; onglets de
// niveaux (clic, ← →, molette, 1 2 3) ; repère « vous êtes ici » : celui de la borne, ou le joueur en direct (position
// et regard) ; la nuit, en mode histoire, les magasins et niveaux pas encore confiés au gardien sont grisés « fermé ».
// Échap, E, M ou un clic hors des onglets ferment. Purement local (aucune action envoyée à l'hôte).
// Sous la pancarte (qui garde ses horaires d'ouverture), le pied commun des menus rappelle les touches.
import { drawBoard, drawYou } from '../world/mapdraw.js';
import { planLevelAt } from '../world/mallmap.js';
import { keys } from './menukit.js';

const LEVELS = [-1, 0, 1];
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'KeyE', 'KeyM', 'Digit1', 'Digit2', 'Digit3'];

export function openMapView(g, o = {}) {
  const ui = g.ui, model = g.world?.mallPlan; if (!ui || !model) return null;
  const live = !o.sign, wrap = document.createElement('div'), cv = document.createElement('canvas');
  const foot = document.createElement('div'); foot.className = 'nb-map-f';
  foot.innerHTML = keys([['← →', 'Niveau (molette, onglets)'], ['Échap', 'Fermer (E' + (live ? ', M' : '') + ', clic)']]) + '<button>Fermer</button>';
  wrap.className = 'nb-map'; wrap.append(cv, foot);
  const ctx = cv.getContext('2d'), bg = document.createElement('canvas'), bctx = bg.getContext('2d');
  const you = () => (live ? { x: g.player.pos.x, z: g.player.pos.z, yaw: g.player.yaw, k: planLevelAt(g.player.pos.y) } : o.you || null);
  let k = o.level ?? you()?.k ?? 0, follow = live, key = '', info = null, raf = 0, W = 0, H = 0, dpr = 1, closed = false;
  const p0 = g.player.pos ? { x: g.player.pos.x, z: g.player.pos.z } : null;
  const story = () => g.mode === 'story' && !g.isDay;
  const shopClosed = (id) => story() && !!model.shopById[id] && !g.isShopUnlocked(id);
  const levelClosed = (lk) => story() && ((lk === 1 && !g.isAreaUnlocked('gallery1')) || (lk === -1 && !g.isAreaUnlocked('garage')));
  const setLevel = (lk) => { const i = LEVELS.indexOf(lk); if (i < 0 || lk === k) return; k = lk; follow = false; g.sfx('paper', null, { volume: 0.25, bus: 'ui' }); };
  const step = (d) => setLevel(LEVELS[Math.max(0, Math.min(LEVELS.length - 1, LEVELS.indexOf(k) + d))]);
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const w = window.innerWidth, h = window.innerHeight - foot.offsetHeight, r = Math.min(2, window.devicePixelRatio || 1), y = you();
    if (live && follow && y && y.k !== k) k = y.k;
    if (!live && p0 && Math.hypot(g.player.pos.x - p0.x, g.player.pos.z - p0.z) > 2.5) { close(); return; } // on s'est éloigné de la borne
    if (w !== W || h !== H || r !== dpr) { W = w; H = h; dpr = r; for (const c of [cv, bg]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); } cv.style.width = W + 'px'; cv.style.height = H + 'px'; key = ''; }
    const kk = [k, W, H, dpr, g.night, g.isDay, y?.k].join('|');
    if (kk !== key) { // fond : la pancarte entière, sans le repère (redessinée seulement quand elle change)
      key = kk; bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      info = drawBoard(bctx, model, k, W, H, { live: true, you: y, marker: false, closed: shopClosed, levelClosed });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bg, 0, 0);
    if (y && info && String(y.k) === String(k)) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawYou(ctx, info.tf, y, info.u, 0.5 + 0.5 * Math.sin(performance.now() / 260)); }
  };
  const close = () => { if (!closed && ui.modal?.node?.contains(wrap)) ui.closeModal(); };
  cv.addEventListener('click', (e) => {
    const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    const t = info?.tabs.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    if (t) setLevel(t.k); else close();
  });
  foot.querySelector('button').onclick = close;
  cv.addEventListener('wheel', (e) => { e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  ui.openModal('map', wrap, { cls: 'nb-mapmodal', onClose: () => { closed = true; cancelAnimationFrame(raf); } });
  g.input.captureHandler = (code, down) => {
    // Échap : l'interface ferme ; le reste (marcher…) passe ; les relâchements aussi (sinon la touche qui a ouvert le
    // plan resterait « enfoncée » pour le jeu et le prochain appui ne compterait pas)
    if (!down || code === 'Escape' || !KEYS.includes(code)) return false;
    if (code === 'KeyE' || code === 'KeyM') { close(); return true; }
    if (code.startsWith('Digit')) setLevel(LEVELS[+code.slice(5) - 1]);
    else step(code === 'ArrowRight' || code === 'ArrowUp' || code === 'PageUp' ? 1 : -1);
    return true;
  };
  g.sfx('paper', null, { volume: 0.4, bus: 'ui' });
  frame();
  return wrap;
}
