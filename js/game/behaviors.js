// Comportements des objets tenus en main (clic gauche = primary, maintien = hold, clic droit = secondary,
// R sans cible = alt), pièges au sol, objets « actifs » (boîtes à musique, radios, lampes, robots…).
// Tout ce qui modifie le monde passe par des actions de l'hôte (game.sim.do).
import * as THREE from 'three';
import { Net } from '../net/net.js';
import { ITEMS } from '../data/items.js';
import { LORE } from '../data/lore.js';
import { LAYER } from '../engine/physics.js';
import { Audio } from '../engine/audio.js';

const DOLL_LINES = ['Maman !', 'On joue ?', 'Je t\'aime !', 'Fais-moi un câlin !', 'J\'ai faim !', 'Bonne nuit !', 'Tu es mon ami !', 'Hi hi hi !', 'Encore !', 'Chante avec moi !', 'Où est mon ours ?', 'Au clair de la lune…'];
const DOLL_CREEPY = ['Elle est en bas.', 'Ne te retourne pas.', 'Tu restes avec moi ?', 'Il fait froid ici.', 'Un, deux, trois… je viens te chercher.'];
const SCALE = [60, 62, 64, 65, 67, 69, 71, 72];
const CHORDS = [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59]];
const CHORD_NAMES = ['Do', 'La m', 'Fa', 'Sol', 'Mi m'];

function fwdPoint(p, d) { const f = p.forward(); return p.camera.position.clone().addScaledVector(f, d); }
function placeOnAim(g, p, prop, maxD = 3) {
  const hit = g.interaction.rayWorld(maxD);
  if (!hit) return false;
  const n = hit.normal; const q = new THREE.Quaternion();
  let pos;
  if (n[1] > 0.6) { pos = [hit.point[0], hit.point[1] + prop.half[1] + 0.003, hit.point[2]]; q.setFromEuler(new THREE.Euler(0, p.yaw + Math.PI, 0)); }
  else { // sur un mur : face tournée vers le joueur
    pos = [hit.point[0] + n[0] * (prop.half[2] + 0.01), hit.point[1], hit.point[2] + n[2] * (prop.half[2] + 0.01)];
    q.setFromEuler(new THREE.Euler(0, Math.atan2(n[0], n[2]), 0));
  }
  g.sim.do('drop', { id: prop.id, pos, vel: null, quat: [q.x, q.y, q.z, q.w], place: true });
  return pos;
}

export function useHeld(g, p, prop, verb, dt = 0) {
  if (!prop) return false;
  const d = prop.def; const h = HANDLERS[d.use];
  try { if (h) return h(g, p, prop, verb, dt) || false; } catch (e) { console.error('[behavior]', d.use, e); }
  if (verb === 'primary') { g.toast(d.name + (d.desc ? ' — ' + d.desc : '')); return true; }
  return false;
}

function consume(g, p, prop, sound, effect, amount) {
  g.sim.do('consume', { id: prop.id });
  if (sound) g.sim.do('sfx', { s: sound, pos: p.camera.position.toArray(), v: 0.8 });
  p.vmAnim.raise = 1; p.useCooldown = 0.6;
  if (effect) applyFood(g, p, effect, amount, prop.def);
}
function applyFood(g, p, effect, amount, def) {
  const S = p.stats;
  switch (effect) {
    case 'calm': S.stress = Math.max(0, S.stress - (amount || 15)); break;
    case 'energy': p.applyEffect('energy', 60); break;
    case 'drunk': p.applyEffect('drunk', 45); S.stress = Math.max(0, S.stress - 10); break;
    case 'sleepy': p.applyEffect('sleepy', 40); break;
    case 'sugar': p.applyEffect('sugar', 30); break;
    case 'spicy': p.shake(0.4, 0.8); g.ui.damageFlash(0.3); g.toast('Ça pique !!'); break;
    case 'cold': p.applyEffect('cold', 10); if (def?.id === 'ice_cream') g.toast('Aïe, mal de crâne !'); break;
    case 'sour': p.shake(0.2, 0.4); g.toast('Grimace.'); break;
    case 'sick': p.applyEffect('sick', 20); g.toast('Beurk…'); break;
  }
}
function sfx(g, p, s, v = 0.8) { g.sim.do('sfx', { s, pos: p.camera.position.toArray(), v }); }
function noise(g, p, l, k) { g.sim.do('noise', { pos: p.pos.toArray(), l, k }); }

const HANDLERS = {
  flashlight(g, p, pr, v) { if (v === 'primary') { p.flashProp = pr.id; if (!p.flashOn) p.toggleFlash(); else p.toggleFlash(); return true; } if (v === 'alt') return p.reloadBattery(); },
  battery(g, p, pr, v) { if (v === 'primary') { p.reloadBattery(); return true; } },
  eat(g, p, pr, v) {
    if (v !== 'primary') return;
    const P = pr.def.p || {};
    if (pr.def.id === 'cheese' || pr.def.id === 'saucisson') { /* le chat les adore : aussi posables */ }
    if (P.raw && P.cook && !g.settings.allowRaw) g.toast('Cru… vous mangez quand même.');
    if (P.uses && (pr.data.uses ?? P.uses) > 1) { g.sim.do('propdata', { id: pr.id, data: { uses: (pr.data.uses ?? P.uses) - 1 } }); sfx(g, p, P.sound || 'eat_soft'); p.vmAnim.raise = 1; applyFood(g, p, P.effect, 5, pr.def); return true; }
    consume(g, p, pr, P.sound || 'eat_soft', P.effect, 12);
    p.stats.stamina = Math.min(100, p.stats.stamina + (P.food || 5));
    if (P.loud) noise(g, p, 0.5, 'chips');
    if (P.peel) g.sim.do('spawnprop', { def: 'banana_peel', pos: fwdPoint(p, 0.5).toArray(), vel: [0, -1, 0] });
    if (pr.def.id === 'honey') g.toast('Bobby n\'aurait pas aimé que vous le mangiez.');
    return true;
  },
  drink(g, p, pr, v) { if (v !== 'primary') return; const P = pr.def.p || {}; consume(g, p, pr, 'drink', P.effect, 10); p.stats.stamina = Math.min(100, p.stats.stamina + (P.food || 3)); if (pr.def.id === 'director_whisky') g.sim.do('flag', { k: 'whisky', v: true }); return true; },
  soda(g, p, pr, v, dt) {
    if (v === 'secondaryHold') { pr.data.shaken = (pr.data.shaken || 0) + dt; if (Math.random() < dt * 4) sfx(g, p, 'rattle', 0.3); return true; }
    if (v === 'secondary') { if ((pr.data.shaken || 0) > 0.3) { g.toast('Vous secouez la canette… (clic gauche pour l\'ouvrir)'); return true; } return false; }
    if (v !== 'primary') return;
    if ((pr.data.shaken || 0) > 1.2) { sfx(g, p, 'drink_can_open', 1); g.sim.do('decal', { kind: 'wet', pos: fwdPoint(p, 0.8).setY(p.pos.y + 0.01).toArray(), color: pr.def.c }); g.particles.spray(fwdPoint(p, 0.4), p.forward(), 0xc68642, 80); g.toast('PSCHHHHHHT ! Vous êtes trempé.'); g.sim.do('consume', { id: pr.id }); return true; }
    sfx(g, p, 'drink_can_open', 0.6); consume(g, p, pr, 'drink', pr.def.p?.effect, 10); return true;
  },
  champagne(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'bottle_open', 1); g.sim.do('spawnprop', { def: 'foam_dart', pos: fwdPoint(p, 0.4).toArray(), vel: p.forward().multiplyScalar(14).toArray() }); g.particles.spray(fwdPoint(p, 0.4), p.forward(), 0xfff8e1, 60); setTimeout(() => consume(g, p, pr, 'drink', 'drunk'), 900); if (g.night === 10) g.toast('À la dixième nuit !'); return true; },
  squeak(g, p, pr, v) { if (v !== 'primary') return; const P = pr.def.p || {}; g.sim.do('sfx', { s: P.sound || 'squeak', pos: p.camera.position.toArray(), v: 0.7 }); p.vmAnim.swing = 0.3; if (P.sound === 'meow') noise(g, p, 0.3, 'meow'); return true; },
  bobby(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'squeak', 0.6); if (Math.random() < 0.35 || !g.isDay) g.sim.do('say', { who: 'Peluche Bobby', text: Math.random() < 0.8 ? 'Tu restes avec moi ?' : 'Elle m\'attend en bas…', pos: p.camera.position.toArray() }); p.scare(3); return true; },
  toy_walk(g, p, pr, v) { if (v !== 'primary') return; const pos = placeOnAim(g, p, pr, 2.5); if (pos) { g.sim.do('walker', { id: pr.id, yaw: p.yaw, kind: 'walk' }); sfx(g, p, 'toy_robot', 0.5); } else g.toast('Visez le sol pour poser le robot.'); return true; },
  toy_roll(g, p, pr, v) { if (v !== 'primary') return; const f = p.forward(); f.y = 0; f.normalize(); const sp = pr.def.p?.speed || 2; g.sim.do('drop', { id: pr.id, pos: fwdPoint(p, 0.6).setY(p.pos.y + 0.1).toArray(), vel: [f.x * sp, 0, f.z * sp], quat: [0, 0, 0, 1] }); g.sim.do('walker', { id: pr.id, yaw: p.yaw, kind: 'roll', speed: sp }); return true; },
  doll(g, p, pr, v) {
    if (v !== 'primary') return;
    const creepy = pr.def.p?.creepy || (!g.isDay && Math.random() < 0.12);
    const line = creepy ? DOLL_CREEPY[Math.floor(Math.random() * DOLL_CREEPY.length)] : DOLL_LINES[Math.floor(Math.random() * DOLL_LINES.length)];
    g.sim.do('say', { who: 'Poupée', text: line, pos: p.camera.position.toArray() }); sfx(g, p, creepy ? 'giggle' : 'doll_voice', 0.5);
    if (creepy) p.scare(8);
    return true;
  },
  jack(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'jack_music', 0.6); setTimeout(() => { sfx(g, p, 'jack_in_box', 1); p.scare(15); p.shake(0.2, 0.3); }, 3000 + Math.random() * 2500); return true; },
  ball(g, p, pr, v) { if (v !== 'primary') return; p.throwHeld(0.25); return true; },
  music_box(g, p, pr, v) { if (v !== 'primary') return; g.sim.do('propdata', { id: pr.id, data: { on: !pr.data.on } }); return true; },
  top(g, p, pr, v) { if (v !== 'primary') return; if (pr.def.id === 'metronome') { g.sim.do('propdata', { id: pr.id, data: { on: !pr.data.on } }); return true; } const pos = placeOnAim(g, p, pr, 2.5); if (pos) g.sim.do('walker', { id: pr.id, kind: 'spin' }); return true; },
  yoyo(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'yoyo'); p.vmAnim.swing = 0.8; return true; },
  rubik(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'rubik', 0.6); const n = (pr.data.twists || 0) + 1; pr.data.twists = n; if (n > 30 && Math.random() < 0.02) { g.toast('Vous avez résolu le cube ! (par hasard)'); g.discover('egg', 'rubik'); } return true; },
  xylo(g, p, pr, v) { if (v !== 'primary') return; const i = (pr.data.n || 0) % 8; pr.data.n = i + 1; g.sim.do('note', { instr: 'xylo', n: SCALE[i] + 12, pos: p.camera.position.toArray(), v: 0.7, from: p.id }); return true; },
  toy_drum(g, p, pr, v) { if (v !== 'primary') return; g.sim.do('drum', { k: Math.random() < 0.5 ? 'tom' : 'snare', pos: p.camera.position.toArray() }); return true; },
  dart_gun(g, p, pr, v) {
    if (v !== 'primary') return; const ammo = pr.data.ammo ?? pr.def.p.ammo;
    if (ammo <= 0) { g.toast('Plus de fléchettes. (Ramassez-les.)'); return true; }
    g.sim.do('propdata', { id: pr.id, data: { ammo: ammo - 1 } }); sfx(g, p, 'toy_gun', 0.7);
    g.sim.do('spawnprop', { def: 'foam_dart', pos: fwdPoint(p, 0.5).toArray(), vel: p.forward().multiplyScalar(16).toArray() });
    return true;
  },
  bubbles(g, p, pr, v) { if (v === 'primary' || v === 'hold') { g.particles.bubbles(fwdPoint(p, 0.4), p.forward()); if (v === 'primary') sfx(g, p, 'bubbles', 0.5); return true; } },
  toy_horn(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'toy_horn', 0.8); noise(g, p, 0.6, 'horn'); return true; },
  air_horn(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'air_horn', 1); noise(g, p, 1, 'airhorn'); g.sim.do('repel', { pos: p.pos.toArray(), r: 9 }); p.shake(0.1, 0.3); return true; },
  // Pétard à confettis (usage unique : BANG, repousse les présences proches) / sachet de confettis (pluie silencieuse)
  popper(g, p, pr, v) {
    if (v !== 'primary') return; const bang = pr.def.shape !== 'ppouch', at = fwdPoint(p, 0.45), dir = p.forward(); dir.y += 0.35; dir.normalize();
    for (const c of [0xff1744, 0xffd600, 0x00e676, 0x2979ff, 0xd500f9, 0xff9100]) g.particles.spray(at, dir, c, bang ? 14 : 8, bang ? 0.55 : 0.35);
    g.particles.sparkle(at); p.vmAnim.raise = 1; p.useCooldown = 0.6;
    if (bang) { sfx(g, p, 'toy_gun', 1); noise(g, p, 0.8, 'popper'); g.sim.do('repel', { pos: p.pos.toArray(), r: 4 }); p.shake(0.06, 0.2); g.sim.do('consume', { id: pr.id }); }
    else { sfx(g, p, 'cash_rustle', 0.5); const n = (pr.data.uses || 0) + 1; if (n >= 5) { g.sim.do('consume', { id: pr.id }); g.toast('Le sachet est vide.'); } else g.sim.do('propdata', { id: pr.id, data: { uses: n } }); }
    return true;
  },
  whistle(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'page', 1); noise(g, p, 0.9, 'whistle'); g.sim.do('repel', { pos: p.pos.toArray(), r: 5, cat: true }); return true; },
  dice(g, p, pr, v) { if (v !== 'primary') return; p.throwHeld(0.35); return true; },
  scatter(g, p, pr, v) {
    if (v !== 'primary') return;
    const hit = g.interaction.rayWorld(3); const pos = hit && hit.normal[1] > 0.6 ? hit.point : fwdPoint(p, 1).setY(p.pos.y).toArray();
    g.sim.do('consume', { id: pr.id }); g.sim.do('trap', { pos, kind: pr.def.id, r: 0.7 });
    sfx(g, p, pr.def.id === 'nails' ? 'hit_metal' : 'hit_plastic', 0.8); return true;
  },
  read(g, p, pr, v) { if (v !== 'primary') return; const P = pr.def.p || {}; const lore = P.lore ? LORE[P.lore] : null; const text = pr.data.text || P.text || lore?.text || pr.def.desc || ''; g.ui.showText(lore?.title || pr.def.name, text); if (P.lore) g.discover('lore', P.lore); if (pr.defId === 'old_newspaper') g.discover('fragment', 'old_newspaper'); if (pr.defId === 'photo_album') g.discover('fragment', 'album'); g.sim.do('sfx', { s: 'book_page', pos: p.camera.position.toArray(), v: 0.5 }); return true; },
  newspaper(g, p, pr, v) { if (v !== 'primary') return; g.ui.showText(pr.def.name, g.story.newspaperText(pr.def.p?.mag)); sfx(g, p, 'paper', 0.5); return true; },
  kaleido(g, p, pr, v) { if (v !== 'primary') return; p.applyEffect('kaleido', 6); return true; },
  toy_phone(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'beep', 0.5); if (!g.isDay && Math.random() < 0.2) setTimeout(() => g.sim.do('say', { who: 'Téléphone jouet', text: 'Allô ? Tu viens jouer ?', pos: p.camera.position.toArray() }), 800); return true; },
  nightlight(g, p, pr, v) { if (v !== 'primary') return; g.sim.do('propdata', { id: pr.id, data: { on: !pr.data.on } }); return true; },
  lamp(g, p, pr, v) { if (v !== 'primary') return; g.sim.do('propdata', { id: pr.id, data: { on: !pr.data.on } }); return true; },
  disco(g, p, pr, v) { if (v !== 'primary') return; g.sim.do('propdata', { id: pr.id, data: { on: !pr.data.on } }); return true; },
  flower(g, p, pr, v) { if (v !== 'primary') return; p.stats.stress = Math.max(0, p.stats.stress - 8); g.toast(pr.def.id === 'lilies' ? 'L\'odeur des lys… elle vous rappelle quelque chose de triste.' : 'Ça sent bon. Vous vous sentez un peu mieux.'); return true; },
  cactus(g, p, pr, v) { if (v !== 'primary') return; p.damage(3, 'cactus'); g.toast('Aïe !'); return true; },
  water_can(g, p, pr, v) {
    if (v !== 'primary') return; const t = g.interaction.target;
    if ((pr.data.water ?? 3) <= 0) { g.toast('L\'arrosoir est vide (remplissez-le à un lavabo).'); return true; }
    sfx(g, p, 'sprinkler', 0.3); g.sim.do('propdata', { id: pr.id, data: { water: (pr.data.water ?? 3) - 1 } });
    if (t && t.kind === 'prop' && t.def.use === 'flower') { g.sim.do('water_plant', { id: t.id }); g.toast('Vous arrosez ' + t.def.name + '.'); }
    return true;
  },
  fish_food(g, p, pr, v) { if (v === 'primary') { g.toast('Utilisez-la devant un aquarium (E).'); return true; } },
  bird_seed(g, p, pr, v) { if (v === 'primary') { g.toast('Pour Coco le perroquet (E devant sa cage).'); return true; } },
  cat_food(g, p, pr, v) { if (v !== 'primary') return; const pos = placeOnAim(g, p, pr, 3); if (pos) { g.sim.do('propdata', { id: pr.id, data: { placed: true } }); g.toast('Croquettes posées. Le chat viendra peut-être…'); } return true; },
  cat_toy(g, p, pr, v) { if (v !== 'primary') return; p.vmAnim.swing = 1; g.sim.do('cat_play', { pos: p.pos.toArray() }); return true; },
  pet_bed(g, p, pr, v) { if (v !== 'primary') return; placeOnAim(g, p, pr, 3); return true; },
  jewel(g, p, pr, v) { if (v !== 'primary') return; if (pr.defId === 'cursed_brooch') { g.ui.showText('Broche ancienne', LORE.brooch.text); g.discover('fragment', 'cursed_brooch'); p.applyEffect('cold', 6); return true; } g.toast(pr.def.name + ' — ' + pr.def.value + ' €. Ça brille.'); return true; },
  watch(g, p, pr, v) { if (v !== 'primary') return; g.toast('Il est ' + g.clockString() + '.'); return true; },
  scratch(g, p, pr, v) {
    if (v !== 'primary') return; sfx(g, p, 'scratch', 0.5); g.sim.do('consume', { id: pr.id });
    const r = Math.random();
    if (r < 0.001) { g.toast('JACKPOT ! 100 000 € ! … Le ticket est daté du 14/11/1987. Il n\'est plus valable.'); g.discover('egg', 'jackpot'); }
    else if (r < 0.12) { g.toast('Gagné : 2 € !'); g.sim.do('spawnprop', { def: 'coin', pos: fwdPoint(p, 0.4).toArray(), held: true }); }
    else g.toast(['Perdu.', 'Perdu. Encore.', 'Perdu ! (Comme d\'habitude.)', 'Rien. Au dos : « La chance, c\'est pour ceux qui partent avant 3h. »'][Math.floor(Math.random() * 4)]);
    return true;
  },
  gum(g, p, pr, v) {
    if (v !== 'primary') return; const t = g.interaction.target;
    if (!pr.data.chewed) { g.sim.do('propdata', { id: pr.id, data: { chewed: true } }); sfx(g, p, 'eat_soft', 0.4); g.toast('Vous mâchez le chewing-gum. Collez-le sur un objectif de caméra ou un détecteur (clic gauche en visant).'); return true; }
    const cam = g.security.cameraAt(p.camera.position, p.forward());
    if (cam) { g.sim.do('cam_block', { id: cam.id, on: true }); g.sim.do('consume', { id: pr.id }); g.toast('Objectif masqué !'); return true; }
    g.toast('Rien à coller ici.'); return true;
  },
  coin(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'coin_drop', 0.4); g.toast(Math.random() < 0.5 ? 'Pile.' : 'Face.'); return true; },
  cash(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'cash_rustle', 0.5); g.toast('Liasse de ' + (pr.data.value || pr.def.value) + ' €.'); return true; },
  keys(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'keys', 0.6); g.toast(pr.def.desc); return true; },
  lockpick(g, p, pr, v) { if (v !== 'primary') return; g.toast('Visez une serrure (porte, caisse, vitrine, casier) et appuyez sur R.'); return true; },
  padlock(g, p, pr, v) {
    if (v !== 'primary') return; const t = g.interaction.target;
    if (t && t.kind === 'door' && !t.state.open && !t.state.padlock) { g.sim.do('padlock', { door: t.id, prop: pr.id, strong: !!pr.def.p?.strong }); return true; }
    g.toast('Visez une porte fermée pour poser le cadenas.'); return true;
  },
  melee(g, p, pr, v) {
    if (v !== 'primary') return; if (p.useCooldown > 0) return true;
    p.useCooldown = 0.55; p.vmAnim.swing = 1; sfx(g, p, 'swing', 0.6);
    const f = p.forward(); const o = p.camera.position;
    setTimeout(() => g.sim.do('melee', { o: o.toArray(), d: f.toArray(), dmg: pr.def.p?.dmg || 1, breaks: !!pr.def.p?.breaks, pry: !!pr.def.p?.pry, item: pr.defId }), 120);
    return true;
  },
  tool(g, p, pr, v) { if (v !== 'primary') return; const t = g.interaction.target; if (pr.def.p?.tool === 'screw' && t && t.kind === 'grate') { g.sim.do('interact', { id: t.id, verb: 'unscrew', held: pr.id }); return true; } g.toast(pr.def.desc || pr.def.name); return true; },
  tape(g, p, pr, v) {
    if (v !== 'primary') return; const t = g.interaction.target;
    if (t && t.kind === 'grate' && !t.state.taped) { g.sim.do('tape', { grate: t.id, prop: pr.id }); return true; }
    const cam = g.security.cameraAt(p.camera.position, p.forward()); if (cam) { g.sim.do('cam_block', { id: cam.id, on: true }); g.sim.do('tape_use', { prop: pr.id }); g.toast('Caméra masquée au scotch.'); return true; }
    if (t && t.kind === 'glass' && t.state.broken) { g.toast('Le trou est trop grand pour du scotch.'); return true; }
    g.toast('Visez une grille d\'aération ou une caméra.'); return true;
  },
  extinguisher(g, p, pr, v, dt) {
    if (v !== 'hold' && v !== 'primary') { if (v === 'release') { if (p._ext) { p._ext.stop(0.2); p._ext = null; } return true; } return; }
    const charge = pr.data.charge ?? pr.def.p.charge;
    if (charge <= 0) { if (v === 'primary') g.toast('Extincteur vide.'); return true; }
    if (!p._ext) p._ext = g.loop('extinguisher', null, { volume: 0.8, bus: 'sfx' });
    const mult = p.hasCostumeEffect('fire_resist') ? 0.5 : 1;
    pr.data.charge = charge - dt * mult;
    g.particles.spray(fwdPoint(p, 0.5), p.forward(), 0xf5f5f5, 6, 0.4);
    p._extAcc = (p._extAcc || 0) + dt;
    if (p._extAcc > 0.25) { p._extAcc = 0; g.sim.do('extinguish', { o: p.camera.position.toArray(), d: p.forward().toArray(), power: 0.25 }); g.sim.do('propdata', { id: pr.id, data: { charge: pr.data.charge } }); }
    return true;
  },
  fuel(g, p, pr, v) { if (v === 'primary') { g.toast('Visez le groupe électrogène (sous-sol) et appuyez sur E.'); return true; } },
  fuse(g, p, pr, v) { if (v === 'primary') { g.toast('À utiliser au tableau électrique du sous-sol.'); return true; } },
  bulb(g, p, pr, v) { if (v === 'primary') { g.toast('Aucune ampoule grillée ici. Pour l\'instant.'); return true; } },
  place_sensor(g, p, pr, v) { if (v !== 'primary') return; const pos = placeOnAim(g, p, pr, 3); if (pos) { g.sim.do('propdata', { id: pr.id, data: { armed: true } }); g.toast('Détecteur posé et armé.'); sfx(g, p, 'beep', 0.6); } else g.toast('Visez une surface proche.'); return true; },
  place_cam(g, p, pr, v) { if (v !== 'primary') return; const pos = placeOnAim(g, p, pr, 3); if (pos) { g.sim.do('propdata', { id: pr.id, data: { cam: true, yaw: p.yaw, pitch: p.pitch } }); g.toast('Caméra posée : elle apparaît dans le système CCTV.'); sfx(g, p, 'camera_switch', 0.6); } else g.toast('Visez une surface proche.'); return true; },
  rc_car(g, p, pr, v) { if (v !== 'primary') return; const pos = placeOnAim(g, p, pr, 3); if (pos) g.toast('Voiture posée. Pilotez-la avec la télécommande ou depuis la console (onglet RC).'); return true; },
  rc_remote(g, p, pr, v) { if (v !== 'primary') return; const car = g.props.find('rc_car').find(c => c.state.where === 'world'); if (!car) { g.toast('Posez d\'abord la voiture télécommandée.'); return true; } g.security.driveRC(car.id); return true; },
  walkie(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'static_burst', 0.5); if (Net.online) g.ui.openChat('radio'); else if (!g.isDay && Math.random() < 0.3) setTimeout(() => g.say('Talkie-walkie', ['… ici … sous-sol … répondez …', '… elle compte … un … deux …', '… Gérard ? C\'est toi ? …'][Math.floor(Math.random() * 3)], { voice: false }), 1200); else g.toast('Grésillements.'); return true; },
  mobile(g, p, pr, v) { if (v !== 'primary') return; g.phone.openMobile(); return true; },
  tablet(g, p, pr, v) { if (v !== 'primary') return; if (!g.flags.tabletLinked) { g.toast('La tablette n\'est pas configurée. (Branchez-la sur le PC du poste : E sur le PC en la tenant.)'); return true; } g.security.enterTablet(); return true; },
  polaroid(g, p, pr, v) { if (v !== 'primary') return; const shots = pr.data.shots ?? pr.def.p.shots; if (shots <= 0) { g.toast('Plus de pellicule.'); return true; } g.sim.do('propdata', { id: pr.id, data: { shots: shots - 1 } }); g.photo.snapshot(p, pr.def.p?.flash || pr.defId === 'polaroid'); return true; },
  photo(g, p, pr, v) { if (v !== 'primary') return; g.photo.view(pr); return true; },
  costume(g, p, pr, v) { if (v !== 'primary') return; g.sim.do('consume', { id: pr.id }); const prev = p.costume; p.setCostume(pr.def.p.costume); if (prev !== 'guard') g.sim.do('spawnprop', { def: 'costume_' + prev, pos: p.dropPos(), held: false }); sfx(g, p, 'zipper', 0.7); g.toast('Vous enfilez : ' + pr.def.name + '. ' + (g.costumeDesc(pr.def.p.costume) || '')); return true; },
  wear(g, p, pr, v) {
    if (v !== 'primary') return; const P = pr.def.p || {};
    const slot = P.slot || 'body'; const prev = p.wear[slot];
    g.sim.do('consume', { id: pr.id }); p.wear[slot] = slot === 'feet' ? pr.defId.replace(/s$/, '') === 'sneaker' ? 'sneakers' : pr.defId : pr.defId;
    if (slot === 'feet') p.wear.feet = pr.defId; if (slot === 'body') p.wear.bodyColor = P.color;
    if (prev) g.sim.do('spawnprop', { def: prev, pos: p.dropPos(), held: true });
    sfx(g, p, 'cloth', 0.7); g.toast('Vous portez : ' + pr.def.name + '.' + (P.quiet && P.quiet < 1 ? ' Vos pas sont plus discrets.' : P.quiet > 1 ? ' Vos pas résonnent dans tout le centre.' : ''));
    p.setCostume(p.costume);
    return true;
  },
  glasses(g, p, pr, v) {
    if (v !== 'primary') return; const mode = pr.def.p.mode;
    if (p.wear.face === mode) { p.wear.face = null; g.toast('Vous retirez les lunettes.'); return true; }
    p.wear.face = mode; p.wear.faceItem = pr.id;
    if (mode === 'nightvision') { const bat = p.inv.findDef('battery'); if (!bat && !pr.data.charged) { p.wear.face = null; g.toast('Il faut une pile pour les lunettes de vision nocturne.'); return true; } if (bat && !pr.data.charged) { g.sim.do('consume', { id: bat }); g.sim.do('propdata', { id: pr.id, data: { charged: 180 } }); } sfx(g, p, 'crt_whine', 0.4); }
    g.toast(mode === 'nightvision' ? 'Vision nocturne activée.' : mode === 'anaglyph' ? 'Tout est en 3D ! (ou presque)' : 'Vous mettez des lunettes de soleil. La nuit. Courageux.');
    return true;
  },
  zoom(g, p, pr, v) { if (v === 'hold') { p.zoom = pr.def.p?.zoom || 2.2; return true; } if (v === 'release') { p.zoom = 1; return true; } if (v === 'primary') return true; },
  headphones(g, p, pr, v) {
    if (v !== 'primary') return;
    if (p._phones) { p._phones.stop(0.5); p._phones = null; Audio.setMuffle(p.costume === 'astronaut' ? 0.55 : 0); g.toast('Vous retirez le casque.'); return true; }
    p._phones = g.music(pr.def.p?.walkman ? 'synthwave' : 'rock', { volume: 0.5, bus: 'music' }); Audio.setMuffle(0.75); g.toast('La musique couvre tout. Vous n\'entendez plus rien venir…');
    return true;
  },
  earplugs(g, p, pr, v) { if (v !== 'primary') return; p._plugs = !p._plugs; Audio.setMuffle(p._plugs ? 0.85 : 0); g.toast(p._plugs ? 'Silence.' : 'Les sons reviennent.'); return true; },
  handheld(g, p, pr, v) { if (v !== 'primary') return; g.ui.playScreenOverlay('game:' + (pr.data.game || 'glouton'), pr); return true; },
  cartridge(g, p, pr, v) { if (v !== 'primary') return; const pb = p.inv.findDef('pocketboy'); if (pb) { g.sim.do('propdata', { id: pb, data: { game: pr.def.p.game } }); g.toast('Cartouche insérée dans la PocketBoy.'); return true; } g.toast('Insérez-la dans une console (E sur la borne) ou une PocketBoy.'); return true; },
  vinyl(g, p, pr, v) { if (v === 'primary') { g.toast('Posez-le sur une platine (E sur la platine en le tenant).'); return true; } },
  vhs(g, p, pr, v) { if (v === 'primary') { g.toast('Insérez-la dans un magnétoscope (E en la tenant).'); return true; } },
  vr(g, p, pr, v) { if (v !== 'primary') return; p.applyEffect('vr', 15); g.toast('Bienvenue dans HÉLIOS VR ! Le centre… en mieux ?'); if (!g.isDay && Math.random() < 0.4) setTimeout(() => { g.ui.screamerFlash('vr'); p.scare(20); }, 8000); return true; },
  instrument(g, p, pr, v) {
    if (v !== 'primary') return; const P = pr.def.p || {}; const scale = P.scale || SCALE;
    const idx = Math.max(0, Math.min(scale.length - 1, Math.round((p.pitch + 0.8) / 1.6 * (scale.length - 1))));
    let n = scale[idx]; if (P.squeaky && Math.random() < 0.4) n += Math.random() < 0.5 ? 1 : -1;
    g.sim.do('note', { instr: P.instr || 'synth', n, pos: p.camera.position.toArray(), v: 0.8, from: p.id }); p.vmAnim.swing = 0.2;
    if (!pr._hint) { pr._hint = true; g.toast('Regardez plus haut ou plus bas pour changer de note.'); }
    return true;
  },
  guitar(g, p, pr, v) {
    if (v === 'alt') { pr.data.chord = ((pr.data.chord || 0) + 1) % CHORDS.length; g.toast('Accord : ' + CHORD_NAMES[pr.data.chord]); return true; }
    if (v !== 'primary') return; const ch = CHORDS[pr.data.chord || 0];
    ch.forEach((n, i) => setTimeout(() => g.sim.do('note', { instr: pr.def.p?.electric ? 'synth' : 'guitar', n, pos: p.camera.position.toArray(), v: 0.6, from: p.id }), i * 25));
    p.vmAnim.swing = 0.3; return true;
  },
  spray(g, p, pr, v) { if (v !== 'primary' && v !== 'hold') return; if (v === 'primary') sfx(g, p, pr.def.p?.sound || 'spray', 0.6); g.particles.spray(fwdPoint(p, 0.35), p.forward(), pr.def.c, 10, 0.2); if (pr.def.p?.scent && v === 'primary') g.sim.do('scent', { pos: p.pos.toArray() }); if (pr.def.p?.splat && v === 'primary') g.sim.do('decal', { kind: 'splat', pos: fwdPoint(p, 1.5).setY(p.pos.y + 0.01).toArray(), color: pr.def.c }); if (pr.def.p?.lighterCombo && p.flashOn && p.flashKind === 'lighter' && v === 'primary') { g.particles.fireBurst(fwdPoint(p, 0.8)); g.sim.do('ignite', { pos: fwdPoint(p, 1.4).toArray(), cause: 'deodorant' }); g.toast('… C\'était une très mauvaise idée.'); } return true; },
  lipstick(g, p, pr, v) { if (v !== 'primary') return; const t = g.interaction.target; if (t && (t.def?.use === 'mirror_wall')) { g.sim.do('decal', { kind: 'text', pos: g.interaction.point.toArray(), text: ['AIDE-MOI', 'J\'AI VU', 'GÉRARD MENT', 'B-13', '♥', 'ICI'][Math.floor(Math.random() * 6)], color: 0xc2185b, n: (t.ry ?? 0) }); return true; } g.toast('Écrivez sur un miroir.'); return true; },
  mirror(g, p, pr, v) { if (v === 'hold') { g.ui.rearView(true); return true; } if (v === 'release') { g.ui.rearView(false); return true; } if (v === 'primary') return true; },
  pills(g, p, pr, v) { if (v !== 'primary') return; const P = pr.def.p || {}; consume(g, p, pr, 'pickup', null); p.pillsTaken = (p.pillsTaken || 0) + 1; if (P.effect === 'calm') { p.stats.stress = Math.max(0, p.stats.stress - (P.amount || 25)); if (p.pillsTaken > 3) { p.applyEffect('sick', 20); p.applyEffect('sleepy', 30); g.toast('Vous avez trop forcé sur les cachets…'); } } else applyFood(g, p, P.effect, 20); return true; },
  heal(g, p, pr, v) { if (v !== 'primary') return; consume(g, p, pr, 'zipper', null); p.stats.health = Math.min(100, p.stats.health + (pr.def.p?.amount || 25)); g.toast('Soigné.'); return true; },
  thermometer(g, p, pr, v) { if (v !== 'primary') return; const t = g.env.temperatureAt(p.pos); g.toast('Température : ' + t.toFixed(1) + ' °C' + (t < 12 ? ' — anormalement froid…' : '')); return true; },
  dumbbell(g, p, pr, v) { if (v !== 'primary') return; p.vmAnim.raise = 1; p.stats.stamina = Math.max(0, p.stats.stamina - 8); p.stats.stress = Math.max(0, p.stats.stress - 4); sfx(g, p, 'breathing_heavy', 0.3); return true; },
  cake(g, p, pr, v) { if (v !== 'primary') return; if (!pr.data.blown) { g.sim.do('propdata', { id: pr.id, data: { blown: true } }); sfx(g, p, 'wind', 0.3); g.toast(g.night === 10 ? 'Vous faites un vœu : que tout s\'arrête. Quelque part, une petite fille souffle avec vous.' : 'Vous soufflez les bougies et faites un vœu.'); g.discover('egg', 'cake'); return true; } consume(g, p, pr, 'eat_soft', 'calm', 20); return true; },
  wand(g, p, pr, v) { if (v !== 'primary') return; g.particles.sparkle(fwdPoint(p, 0.6)); sfx(g, p, 'wind_chime', 0.5); g.sim.do('wand', { pos: p.pos.toArray() }); return true; },
  lighter(g, p, pr, v) { if (v !== 'primary') return; if (pr.def.p?.matches) { const n = pr.data.matches ?? pr.def.p.matches; if (n <= 0) { g.toast('Plus d\'allumettes.'); return true; } g.sim.do('propdata', { id: pr.id, data: { matches: n - 1 } }); } p.flashOn = !p.flashOn || p.flashKind !== 'lighter'; p.flashKind = 'lighter'; sfx(g, p, 'switch', 0.4); const t = g.interaction.target; if (t && t.kind === 'prop' && t.def.use === 'candle' && !t.data.lit) g.sim.do('interact', { id: t.id, verb: 'alt' }); return true; },
  candle(g, p, pr, v) { if (v !== 'primary') return; placeOnAim(g, p, pr, 3); g.toast('Bougie posée. R en la visant pour l\'allumer (briquet).'); return true; },
  wd40(g, p, pr, v) { if (v !== 'primary') return; const t = g.interaction.target; sfx(g, p, 'spray', 0.6); if (t && t.kind === 'door') { g.sim.do('door_oil', { id: t.id }); g.toast(t.state.oiled ? 'Déjà dégrippée.' : 'Gonds dégrippés : cette porte ne grincera plus.'); } else g.toast('Visez une porte qui grince.'); return true; },
  toaster(g, p, pr, v) { if (v !== 'primary') return; const on = !pr.data.on; g.sim.do('propdata', { id: pr.id, data: { on, t0: on ? g.time : null, jam: on && Math.random() < (g.mode === 'infinite' ? 0.12 : 0.05) } }); sfx(g, p, 'switch', 0.5); if (on) g.toast('Grille-pain en marche. Posez-le et attendez le « ding ».'); return true; },
  kettle(g, p, pr, v) { if (v !== 'primary') return; const on = !pr.data.on; g.sim.do('propdata', { id: pr.id, data: { on, t0: on ? g.time : null } }); sfx(g, p, 'switch', 0.5); return true; },
  fan(g, p, pr, v) { if (v !== 'primary') return; g.sim.do('propdata', { id: pr.id, data: { on: !pr.data.on } }); sfx(g, p, 'switch', 0.5); if (!pr.data.on) g.toast('Ventilateur en marche : il souffle ce qui est léger… et attise les flammes.'); return true; },
  wig_head(g, p, pr, v) { if (v !== 'primary') return; const night = !g.isDay; const lines = ['Ses yeux peints suivent les vôtres.', 'Elle a une petite mèche de vrais cheveux collée sur la tempe.', 'Une étiquette : « Salon Tif — modèle Josiane, 1987 ».']; if (night && Math.random() < 0.08) { g.say('Tête à perruque', 'Coiffe-moi…', { pitch: 1.4, voice: false }); p.scare(12); } else g.toast(lines[Math.floor(Math.random() * lines.length)]); return true; },
  loopdevice(g, p, pr, v, dt) {
    const P = pr.def.p || {};
    if (P.hold) { if (v === 'primary') { p._dev = g.loop(P.sound, null, { volume: 0.7 }); noise(g, p, 0.5, 'device'); return true; } if (v === 'release') { if (p._dev) { p._dev.stop(0.2); p._dev = null; } return true; } if (v === 'hold') { if (P.tool === 'drill') { const t = g.interaction.target; if (t && t.kind === 'door' && t.state.padlock) { p._drill = (p._drill || 0) + dt; if (p._drill > 3) { p._drill = 0; g.sim.do('drill_padlock', { door: t.id }); } } } if (P.blow) g.sim.do('blow', { o: p.camera.position.toArray(), d: p.forward().toArray() }); return true; } }
    if (v !== 'primary') return;
    if (P.smoothie && pr.data.fruit) { g.sim.do('propdata', { id: pr.id, data: { fruit: null } }); g.sim.do('spawnprop', { def: 'milkshake', pos: p.dropPos(), held: true }); sfx(g, p, 'blender', 0.8); return true; }
    g.sim.do('propdata', { id: pr.id, data: { on: !pr.data.on } }); return true;
  },
  radio(g, p, pr, v) { if (v === 'alt') { g.sim.do('propdata', { id: pr.id, data: { station: ((pr.data.station || 0) + 1) % 6 } }); return true; } if (v !== 'primary') return; g.sim.do('propdata', { id: pr.id, data: { on: !pr.data.on } }); return true; },
  clock(g, p, pr, v) { if (v !== 'primary') return; g.toast('L\'horloge indique ' + g.clockString() + '.'); return true; },
  snowglobe(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'wind_chime', 0.4); g.particles.snow(fwdPoint(p, 0.4)); if (!g.isDay && Math.random() < 0.15) g.toast('Dans la boule, une minuscule silhouette se tient devant la porte du sous-sol.'); return true; },
  globe(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'spinning_top', 0.3); g.toast('Le globe s\'arrête sur : ' + ['la France', 'le Japon', 'l\'océan Pacifique', 'le Brésil', 'la Norvège', 'Madagascar', 'un endroit qui n\'existe pas'][Math.floor(Math.random() * 7)] + '.'); return true; },
  measure(g, p, pr, v) { if (v !== 'primary') return; const h = g.interaction.rayWorld(30); g.toast(h ? 'Distance : ' + h.t.toFixed(2) + ' m' : 'Trop loin.'); return true; },
  vacuum(g, p, pr, v, dt) {
    if (v === 'release') { if (p._vac) { p._vac.stop(0.3); p._vac = null; } return true; }
    if (v !== 'hold' && v !== 'primary') return;
    if (!p._vac) p._vac = g.loop('vacuum', null, { volume: 0.8 });
    p._vacAcc = (p._vacAcc || 0) + dt; if (p._vacAcc > 0.4) { p._vacAcc = 0; g.sim.do('vacuum', { pos: p.pos.toArray(), d: p.forward().toArray() }); noise(g, p, 0.7, 'vacuum'); }
    return true;
  },
  button_test(g, p, pr, v) { if (v !== 'primary') return; sfx(g, p, 'smoke_alarm', 1); noise(g, p, 0.9, 'alarm'); return true; },
  container(g, p, pr, v) { if (v !== 'primary') return; if (pr.data.contents?.length) { g.sim.do('interact', { id: pr.id, verb: 'alt' }); return true; } const c = pr.def.p?.contains; if (c && !pr.data.opened) { g.sim.do('propdata', { id: pr.id, data: { contents: [...c], opened: true } }); setTimeout(() => g.sim.do('interact', { id: pr.id, verb: 'alt' }), 100); return true; } g.toast('C\'est vide.'); return true; },
  map(g, p, pr, v) { if (v !== 'primary') return; g.ui.toggleMap(); return true; },
  usb(g, p, pr, v) { if (v !== 'primary') return; g.toast('Branchez-la sur un ordinateur (E sur un PC en la tenant).'); return true; },
  film_reel(g, p, pr, v) { if (v !== 'primary') return; g.toast('Une bobine de « La Nuit des Mannequins ». Le projecteur du cinéma la lit déjà.'); return true; },
  computer(g, p, pr, v) { if (v !== 'primary') return; g.ui.playScreenOverlay('computer:shop', pr); return true; },
  peel(g, p, pr, v) { if (v !== 'primary') return; placeOnAim(g, p, pr, 3); g.sim.do('trap', { pos: pr.state.pos, kind: 'banana_peel', r: 0.4, prop: pr.id }); return true; },
  ladder(g, p, pr, v) { if (v !== 'primary') return; const pos = placeOnAim(g, p, pr, 3); if (pos) g.toast('Escabeau posé.'); return true; },
  generic(g, p, pr, v) { if (v !== 'primary') return; g.toast(pr.def.name + (pr.def.desc ? ' — ' + pr.def.desc : '') + (pr.data.value ? ' (' + pr.data.value + ' €)' : '')); return true; },
  flour(g, p, pr, v) { if (v !== 'primary') return; p.throwHeld(0.5); return true; },
  paint(g, p, pr, v) { if (v !== 'primary') return; p.throwHeld(0.6); return true; },
  toilet_paper(g, p, pr, v) { if (v !== 'primary') return; p.throwHeld(0.6); return true; },
  sit(g, p, pr, v) { if (v !== 'primary') return; placeOnAim(g, p, pr, 3); return true; },
  chair_spin(g, p, pr, v) { if (v !== 'primary') return; placeOnAim(g, p, pr, 3); return true; },
  yoga(g, p, pr, v) { if (v !== 'primary') return; placeOnAim(g, p, pr, 3); g.toast('Tapis posé. R pour méditer.'); return true; },
  cart(g, p, pr, v) { return false; },
  hide(g, p, pr, v) { return false; },
};

// ───────────────────────── Actions hôte liées aux objets ─────────────────────────
export function registerBehaviorActions(g) {
  const S = g.sim;
  S.action('walker', (p) => { const pr = g.props.get(p.id); if (!pr) return; pr.set({ data: { ...pr.data, walk: p.kind, wyaw: p.yaw || 0, t: p.kind === 'spin' ? 8 : 20, speed: p.speed || 0.25 } }); });
  S.action('door_oil', (p) => { const d = g.world.get(p.id); if (d && d.kind === 'door') { d.set({ oiled: true }); g.sim.emit('fx', { s: 'spray', pos: d.pos.toArray(), v: 0.5 }); } });
  S.action('padlock', (p, actor) => { const d = g.world.get(p.door); const pr = g.props.get(p.prop); if (!d || !pr || d.state.open) return; pr.set({ where: 'gone' }); d.set({ padlock: p.strong ? 2 : 1 }); g.hooks.emit('padlocked', { door: d, actor }); });
  S.action('drill_padlock', (p) => { const d = g.world.get(p.door); if (d && d.state.padlock) { d.set({ padlock: 0 }); g.sim.emit('fx', { s: 'metal_screech', pos: d.pos.toArray() }); } });
  S.action('tape', (p) => { const gr = g.world.get(p.grate); const pr = g.props.get(p.prop); if (!gr || !pr) return; gr.set({ taped: true }); const u = (pr.data.uses ?? pr.def.p.uses) - 1; if (u <= 0) pr.set({ where: 'gone' }); else pr.set({ data: { ...pr.data, uses: u } }); g.sim.emit('fx', { s: 'sticker', pos: gr.pos.toArray() }); });
  S.action('tape_use', (p) => { const pr = g.props.get(p.prop); if (!pr) return; const u = (pr.data.uses ?? pr.def.p.uses) - 1; if (u <= 0) pr.set({ where: 'gone' }); else pr.set({ data: { ...pr.data, uses: u } }); });
  S.action('trap', (p) => g.sim.emit('trap', p));
  S.effect('trap', (p) => g.traps.add(p));
  S.action('repel', (p) => g.entities.repel(new THREE.Vector3(...p.pos), p.r, p.cat));
  S.action('scent', (p) => g.entities.scent?.(new THREE.Vector3(...p.pos)));
  S.action('cat_play', (p) => g.entities.catPlay?.(new THREE.Vector3(...p.pos)));
  S.action('water_plant', (p) => { const pr = g.props.get(p.id); if (!pr) return; const n = (pr.data.watered || 0) + 1; pr.set({ data: { ...pr.data, watered: n, night: g.night } }); if (pr.defId === 'bonsai') g.flagInc('bonsai_water'); });
  S.action('wand', (p) => { const pos = new THREE.Vector3(...p.pos); const z = g.world.zoneAt(pos.x, pos.y + 1, pos.z); if (z) g.lighting.flickerZone(z.id, 1.5); if (Math.random() < 0.01) g.entities.spawnBobbyGlimpse?.(pos); });
  S.action('vacuum', (p) => { const pos = new THREE.Vector3(...p.pos), d = new THREE.Vector3(...p.d); const front = pos.clone().addScaledVector(d, 1); for (const pr of g.props.find(x => x.def.s[0] < 0.2 && x.def.s[1] < 0.2 && x.state.where === 'world')) { if (new THREE.Vector3(...pr.state.pos).distanceTo(front) < 1.0) { pr.set({ where: 'gone' }); g.sim.emit('fx', { s: 'pickup', pos: pr.state.pos, v: 0.6 }); } } g.entities.repel(pos, 4, true); });
  S.action('blow', (p) => { const o = new THREE.Vector3(...p.o), d = new THREE.Vector3(...p.d); for (const pr of g.props.find(x => (x.def.mass || 0.5) < 0.3 && (x.state.where === 'world' || x.state.where === 'home'))) { const pp = new THREE.Vector3(...pr.state.pos); const to = pp.clone().sub(o); const dist = to.length(); if (dist < 2.5 && to.normalize().dot(d) > 0.85) g.props.push(pr, [d.x * 2, 0.6, d.z * 2]); } g.fire?.blow?.(o, d); });
  S.action('melee', (p, actor) => {
    const o = new THREE.Vector3(...p.o), d = new THREE.Vector3(...p.d);
    const hit = g.world.physics.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 2.2, LAYER.WALL | LAYER.DOOR | LAYER.GLASS | LAYER.FURN);
    const ent = g.entities.raycast(o, d, 2.2);
    if (ent && (!hit || ent.t < hit.t)) { g.entities.hit(ent.e, p.dmg, actor); g.sim.emit('fx', { s: 'hit_body', pos: ent.point.toArray(), v: 0.9 }); return; }
    const pick = g.world.pick.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 2.2, LAYER.ALL);
    if (hit && hit.box.data && hit.box.data.kind === 'glass' && p.breaks) { hit.box.data.smash(actor, 3); return; }
    if (pick && pick.box.data?.kind === 'glass' && p.breaks && (!hit || pick.t <= hit.t + 0.1)) { pick.box.data.smash(actor, 3); return; }
    if (pick && pick.box.data?.kind === 'prop' && (!hit || pick.t <= hit.t + 0.1)) { g.props.push(pick.box.data, [d.x * 4, 1.5, d.z * 4]); g.sim.emit('fx', { s: 'hit_plastic', pos: pick.box.data.state.pos, v: 0.8 }); return; }
    if (pick && pick.box.data?.kind === 'car' && p.breaks) { pick.box.data.alarmOn?.(); }
    if (hit) { const pt = o.clone().addScaledVector(d, hit.t); g.sim.emit('fx', { s: p.item === 'baseball_bat' || p.item === 'baguette' ? 'hit_wood' : 'hit_metal', pos: pt.toArray(), v: 0.9 }); g.noise(pt, 0.6, 'melee'); const dev = hit.box.data; if (dev?.def?.use === 'car' || dev?.kind === 'car') dev.alarmOn?.(); }
  });
  S.action('cartmove', (p) => { const pr = g.props.get(p.id); if (!pr) return; const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw + Math.PI, 0)); if (pr.body) { g.world.physics.removeBody(pr.body); g.props.awake.delete(pr); pr.body = null; } pr.set({ where: 'world', pos: p.pos, quat: [q.x, q.y, q.z, q.w] }); });
}

// ───────────────────────── Pièges au sol ─────────────────────────
export class Traps {
  constructor(game) { this.game = game; this.list = []; this.group = new THREE.Group(); game.scene.add(this.group); }
  add(t) {
    const g = this.game; const pos = new THREE.Vector3(...t.pos);
    const entry = { ...t, pos, meshes: [] };
    if (t.kind !== 'banana_peel') {
      const n = t.kind === 'lego' ? 40 : t.kind === 'nails' ? 50 : t.kind === 'toy_blocks' ? 14 : 3;
      const cols = [0xe53935, 0xffeb3b, 0x1e88e5, 0x43a047, 0xffffff];
      for (let i = 0; i < n; i++) {
        const s = t.kind === 'nails' ? [0.005, 0.005, 0.04] : t.kind === 'toy_blocks' ? [0.05, 0.05, 0.05] : [0.03, 0.02, 0.016];
        const m = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshStandardMaterial({ color: t.kind === 'nails' ? 0x9e9e9e : cols[i % cols.length], metalness: t.kind === 'nails' ? 0.8 : 0.1, roughness: 0.4 }));
        const a = Math.random() * 6.28, r = Math.random() * (t.r || 0.6);
        m.position.set(pos.x + Math.cos(a) * r, pos.y + s[1] / 2, pos.z + Math.sin(a) * r); m.rotation.y = Math.random() * 6;
        this.group.add(m); entry.meshes.push(m);
      }
    }
    this.list.push(entry);
  }
  clear() { for (const t of this.list) for (const m of t.meshes) this.group.remove(m); this.list = []; }
  check(p) {
    const pos = p.pos; const now = this.game.time;
    for (const t of this.list) {
      const d = Math.hypot(pos.x - t.pos.x, pos.z - t.pos.z);
      if (d > (t.r || 0.6) || Math.abs(pos.y - t.pos.y) > 0.5) continue;
      if (t.last && now - t.last < 1.2) continue;
      t.last = now;
      if (t.kind === 'banana_peel') { p.effects.slip = 0.8; p.body.vel[0] *= 2.5; p.body.vel[2] *= 2.5; p.shake(0.5, 0.5); this.game.sfx('hit_soft', pos); this.game.toast('Vous glissez sur une peau de banane !'); p.stats.health -= 2; continue; }
      if (p.wear.feet === 'boots') continue;
      if (Math.hypot(p.body.vel[0], p.body.vel[2]) < 0.3) continue;
      p.damage(t.kind === 'nails' ? 8 : 4, 'trap'); this.game.sfx(t.kind === 'nails' ? 'hit_metal' : 'hit_plastic', pos, { volume: 0.8 });
      this.game.sim.do('noise', { pos: pos.toArray(), l: 0.5, k: 'ouch' });
      this.game.toast(t.kind === 'lego' ? 'AÏE ! Une brique sous le pied !' : t.kind === 'nails' ? 'Aïe, des clous !' : 'Aïe !');
    }
  }
  // pour les présences (braqueurs ralentis)
  hits(pos) { return this.list.some(t => t.kind !== 'banana_peel' && Math.hypot(pos.x - t.pos.x, pos.z - t.pos.z) < (t.r || 0.6) && Math.abs(pos.y - t.pos.y) < 0.6); }
}

// ───────────────────────── Objets actifs (sons, lumières, robots) ─────────────────────────
const RADIO_STATIONS = ['lofi', 'chanson', 'jazz', 'rock', 'radio_static_voice', 'classical'];
export class ActiveProps {
  constructor(game) {
    this.game = game; this.fx = new Map();
    game.hooks.on('prop_data', (pr) => this.refresh(pr));
    game.hooks.on('prop_state', (pr) => this.refresh(pr));
    game.hooks.on('prop_reset', (pr) => this.kill(pr.id));
    game.lighting.addSource({ getLight: () => null });
    this.lightSrc = new Set();
  }
  kill(id) { const e = this.fx.get(id); if (!e) return; e.loop?.stop(0.2); e.music?.stop(0.4); if (e.light) this.game.lighting.removeSource(e.light); this.fx.delete(id); }
  refresh(pr) {
    const d = pr.data || {}; const def = pr.def; const alive = pr.state.where === 'world' || pr.state.where === 'held' || pr.state.where === 'home';
    const wants = alive && (d.on || d.lit || d.walk);
    if (!wants) { this.kill(pr.id); return; }
    let e = this.fx.get(pr.id); if (!e) { e = { pr }; this.fx.set(pr.id, e); }
    const pos = this.posOf(pr);
    const g = this.game;
    // sons
    const want = def.use === 'music_box' && d.on ? ['music_box_m', 'music_box'] : def.use === 'radio' && d.on ? ['radio_m', RADIO_STATIONS[d.station || 0]] : def.use === 'loopdevice' && d.on ? ['loop', def.p?.sound || 'fan'] : def.use === 'toaster' && d.on ? ['loop', 'toaster_tick'] : def.use === 'kettle' && d.on ? ['loop', 'kettle'] : def.use === 'fan' && d.on ? ['loop', 'fan'] : def.use === 'top' && d.on ? ['loop', 'clock_tick'] : d.walk === 'walk' ? ['loop', 'toy_robot'] : d.walk === 'spin' ? ['loop', 'spinning_top'] : d.walk === 'roll' ? ['loop', def.p?.sound || 'toy_car'] : d.lit ? ['loop', 'fire_crackle'] : null;
    const key = want ? want.join(':') : null;
    if (e.key !== key) {
      e.loop?.stop(0.2); e.music?.stop(0.4); e.loop = e.music = null; e.key = key;
      if (want) {
        if (want[0] === 'music_box_m') e.music = g.music(g.flags.ritual ? 'music_box' : (!g.isDay && Math.random() < 0.3 ? 'music_box_wrong' : 'music_box'), { pos, volume: 0.55 });
        else if (want[0] === 'radio_m') e.music = g.music(want[1], { pos, volume: 0.5 });
        else e.loop = g.loop(want[1], pos, { volume: want[1] === 'fire_crackle' ? 0.12 : 0.5, param: want[1] === 'fire_crackle' ? { size: 0.05 } : undefined });
      }
    }
    // lumière
    const lightCol = def.use === 'lamp' || def.use === 'nightlight' || def.use === 'disco' ? (def.p?.color ? new THREE.Color(def.p.color) : def.id === 'nightlight' ? new THREE.Color(0x6080ff) : def.id === 'lava_lamp' ? new THREE.Color(0xff5020) : new THREE.Color(0xffd8a0)) : d.lit ? new THREE.Color(0xff9a40) : null;
    if (lightCol && (d.on || d.lit) && !e.light) { e.light = { getLight: () => ({ pos: this.posOf(pr).add(new THREE.Vector3(0, 0.2, 0)), color: [lightCol.r, lightCol.g, lightCol.b], intensity: d.lit ? 0.9 + Math.random() * 0.3 : def.use === 'disco' ? 2 + Math.sin(performance.now() * 0.01) : 1.6, distance: d.lit ? 5 : 6, priority: 1.8 }) }; g.lighting.addSource(e.light); }
    if (e.light && !(d.on || d.lit)) { g.lighting.removeSource(e.light); e.light = null; }
  }
  appliance(pr, pos, dt) {
    const g = this.game; const d = pr.data; const el = g.time - (d.t0 ?? g.time);
    if (pr.def.use === 'toaster') {
      if (!d.jam && el > 25) { pr.set({ data: { ...d, on: false } }); g.sim.emit('fx', { s: 'toaster_pop', pos: pos.toArray(), v: 0.8 }); g.sim.emit('toast', { text: '« Ding ! » Le grille-pain a fini.' }); return; }
      if (d.jam && el > 40 && !d.smoke) { pr.set({ data: { ...d, smoke: true } }); g.sim.emit('sparks', { pos: pos.toArray() }); }
      if (d.jam && el > 40 && Math.random() < dt * 2) g.particles.smokeAt(pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 1, 0.1, 40);
      if (d.jam && el > 70) { pr.set({ data: { ...d, on: false, jam: false } }); g.fire.ignite(pos.clone(), 'grille-pain oublié'); }
    } else if (pr.def.use === 'kettle') {
      if (el > 22 && !d.whistle) { pr.set({ data: { ...d, whistle: true } }); g.sim.emit('loopfx', { s: 'kettle_whistle', pos: pos.toArray(), v: 0.8, dur: 5 }); }
      if (el > 27) pr.set({ data: { ...d, on: false, whistle: false } });
    } else if (pr.def.use === 'fan') {
      this._fanT = (this._fanT || 0) + dt; if (this._fanT < 0.5) return; this._fanT = 0;
      const q = new THREE.Quaternion(...(pr.state.quat || [0, 0, 0, 1])); const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
      if (pr.state.where === 'held') { const pl = g.playerById(pr.state.owner); if (pl?.forward) dir.copy(pl.forward()).setY(0).normalize(); }
      g.fire.blow(pos, dir);
      for (const o of g.props.find(x => x !== pr && x.state.where === 'world' && ((x.def.mass ?? 0.5) < 0.25 || x.def.p?.light))) {
        const op = new THREE.Vector3(...o.state.pos); const to = op.clone().sub(pos); const dist = to.length(); if (dist > 2.5 || dist < 0.05) continue;
        if (to.normalize().dot(dir) > 0.75) g.props.push(o, [dir.x * 1.6, 0.4, dir.z * 1.6]);
      }
    }
  }
  posOf(pr) {
    if (pr.state.where === 'held') { const pl = this.game.playerById(pr.state.owner); if (pl) return pl.pos.clone().add(new THREE.Vector3(0, 1.2, 0)); }
    return new THREE.Vector3(...pr.state.pos);
  }
  update(dt) {
    const g = this.game;
    for (const [id, e] of this.fx) {
      const pr = e.pr; if (!g.world.objects.has(id)) { this.kill(id); continue; }
      const pos = this.posOf(pr);
      e.loop?.setPos(pos); e.music?.setPos?.(pos);
      // appareils posés (hôte) : grille-pain, bouilloire, ventilateur
      if (Net.isHost && pr.data.on && (pr.def.use === 'toaster' || pr.def.use === 'kettle' || pr.def.use === 'fan')) this.appliance(pr, pos, dt);
      // robots / toupies (hôte)
      if (Net.isHost && pr.data.walk) {
        const d = pr.data; d.t -= dt;
        if (d.walk === 'walk' && pr.state.where === 'world') {
          const sp = d.speed || 0.25; const yaw = d.wyaw; const b = g.props._ensureBody(pr);
          if (!b.sleeping || true) { b.vel[0] = -Math.sin(yaw) * sp; b.vel[2] = -Math.cos(yaw) * sp; b.friction = 0; b.sleeping = false; b.sleepTimer = 0; g.world.physics.addBody(b); g.props.awake.add(pr); b.rot[1] = yaw; }
          if (Math.random() < dt * 0.5) d.wyaw += (Math.random() - 0.5) * 1.5;
        }
        if (d.walk === 'spin' && pr.mesh) pr.mesh.rotation.y += dt * 18 * Math.max(0.1, d.t / 8);
        if (d.t <= 0) { const b = pr.body; if (b) b.friction = 5; pr.set({ data: { ...d, walk: null } }); }
      }
    }
  }
}
