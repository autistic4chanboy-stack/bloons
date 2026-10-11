// Présences : tout ce qui bouge dans le centre en dehors des joueurs.
// - Jour : foule de clients, commerçants (dialogues, numéros de téléphone), Gérard (tutoriel).
// - Nuit : le chat errant, l'Ombre (surtout visible sur les caméras), Bobby (le costume qui marche seul, ne bouge
//   que quand personne ne le regarde), les mannequins, la chose des conduits, la Chose de B-13 (dernière nuit),
//   apparitions, ballons, rats. Coherence : lumière, portes fermées, rideaux, scotch, trappe, costumes comptent.
// - Humains de la nuit : braqueurs (renoncent si c'est éclairé, forcent les portes, tirent), police, pompiers, livreur.
// L'hôte simule (IA, A* sur le graphe de navigation) ; les pairs reçoivent création ('ent+'), suppression ('ent-')
// et instantanés de position ('ents'). Les visuels existent sur tous les pairs (calques CCTV pour les apparitions).
import * as THREE from 'three';
import { Net } from '../net/net.js';
import { WorldObject } from '../world/world.js';
import { LAYER } from '../engine/physics.js';
import { buildHumanoid, animateHumanoid, setHumanoidLayer, litHumanoid } from './humanoid.js';
import { NIGHTS } from '../data/story.js';
import { SHOPS } from '../data/shops.js';
import { CAM_LAYERS } from './security.js';

const R = Math.random;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pick = (a) => a[Math.floor(R() * a.length)];
const POSES = ['idle', 'walk', 'run', 'crouch', 'sit', 'reach', 'aim', 'tpose', 'dead', 'crawl', 'cheer', 'hunched', 'flashlight', 'm0', 'm1', 'm2', 'm3', 'm4', 'lie', 'float'];
const HOSTILE = new Set(['bobby', 'mannequin', 'shadow', 'crawler', 'thing', 'robber']);
const HEIGHT = { cat: 0.3, rat: 0.08, balloon: 1.6, crawler: 0.6, thing: 2.3, shadow: 2.0, bobby: 1.85, lucie: 1.2 };
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const turn = (a, b, k) => a + angDiff(a, b) * Math.min(1, k);
function fwdOf(yaw, pitch = 0) { return V(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }

// Commerçants (jour) : nom, répliques, numéro donné
const KEEPERS = {
  jouets: { name: 'Mme Lefèvre', f: true, num: '0698765412', lines: ['Bienvenue au Royaume du Jouet ! Vous êtes le nouveau gardien ? Tenez, mon numéro, au cas où : zéro six, quatre-vingt-dix-huit, soixante-seize, cinquante-quatre, douze.', 'Bobby, notre mascotte… le costume dort dans la réserve depuis 1987. On ne le sort plus.', 'Si la boîte à musique se met à jouer toute seule, laissez-la finir. Ne l\'arrêtez jamais au milieu.'] },
  pixel: { name: 'Kevin', lines: ['Yo. Tu touches pas à la borne Glouton cette nuit, j\'ai un record en cours.', 'Il paraît qu\'à 10 000 points à Glouton, y a un message caché. Personne y est arrivé.', 'Mes mails ? Ils sont sur le PC derrière la caisse. Pourquoi ?'] },
  boulangerie: { name: 'Sandrine', f: true, lines: ['Les croissants d\'hier finissent à la poubelle. Servez-vous cette nuit, ça me fera moins de peine.', 'Le four est éteint la nuit. Normalement.'] },
  quincaillerie: { name: 'Jean-Mi', lines: ['Besoin d\'un cadenas ou d\'une lampe ? Sers-toi la nuit, je mettrai ça sur le compte de la sécu.', 'Un conseil de pote : le pied-de-biche, rayon 2. On sait jamais, dans ce centre.'] },
  pharma: { name: 'Dr Morel', f: true, lines: ['Les gardiens d\'Hélios dorment mal. Du chocolat. Beaucoup de chocolat.', 'Si vous entendez des voix, ce n\'est pas forcément dans votre tête. Ici, je veux dire.'] },
  pizzeria: { name: 'Paulo', lines: ['Ciao ! Le four à pizza marche encore la nuit, tu mets une pizza dedans et tu appuies. Facile !', 'La nuit, on livre aussi : appelle la pizzeria, le numéro est sur la vitrine.'] },
  cinema: { name: 'Lucas', lines: ['Il y a une « séance fantôme » à 23 h. Je ne programme rien, hein.', 'Rang M, siège 13. Personne ne s\'y assoit jamais. Même les jours de grande affluence.'] },
  cafe: { name: 'Nadia', f: true, lines: ['Un café ? C\'est offert pour le gardien de nuit. Vous en aurez besoin.', 'Gérard prend son café noir, sans sucre, depuis vingt-cinq ans. Il dit que le sucre attire « les autres ».'] },
  mode: { name: 'Mme Vasseur', f: true, lines: ['Nos mannequins datent de l\'ouverture, 1987. Le directeur refuse qu\'on les change.', 'Le matin, ils ne sont jamais tout à fait à la même place. Les vibrations du parking, sûrement.'] },
  bijouterie: { name: 'M. Orfèvre', lines: ['Une bande cambriole les bijouteries de la région. Gardez un œil sur ma vitrine, je vous en prie.', 'Cette petite broche ancienne, gravée « L.M. »… on me l\'a vendue il y a des années. Je n\'arrive pas à m\'en séparer.'] },
  videoclub: { name: 'Rémi', lines: ['On a une cassette sans étiquette dans la réserve. Personne n\'ose la regarder.', 'Les VHS, c\'est l\'avenir. Enfin, c\'était.'] },
  electro: { name: 'Bruno', lines: ['Le présentoir des grille-pains fait des étincelles. J\'ai prévenu Dubois, l\'électricien. Il doit passer… un jour.'] },
  animalerie: { name: 'Claire', f: true, lines: ['Le perroquet répète des trucs bizarres la nuit. Des numéros, des noms.', 'Il y a un chat errant qui dort dans l\'entrepôt. Si vous le nourrissez, il vous adoptera.'] },
  costumes: { name: 'Mme Masque', f: true, lines: ['Un costume, ce n\'est pas qu\'un déguisement. Certains… éloignent les choses.', 'L\'ours en peluche géant ? Ce n\'est pas à nous. Il était là avant.'] },
  tabac: { name: 'Momo', lines: ['Un jeu à gratter ? Le jackpot de 1987 n\'a jamais été réclamé, paraît-il.'] },
  librairie: { name: 'M. Page', lines: ['Le livre sur l\'histoire du centre est au rayon régional. Lisez le chapitre sur l\'inauguration.'] },
  arcade: { name: 'Jo', lines: ['La nuit, les bornes s\'allument toutes seules. C\'est normal. Je crois.'] },
};
const SHOPPER_LINES = [
  'Vous êtes le nouveau gardien ? Bon courage…', 'Il fait toujours froid près des toilettes, vous avez remarqué ?', 'Ma grand-mère dit qu\'une petite fille a disparu ici, à l\'inauguration.',
  'Le cinéma passe de vieux films en noir et blanc la nuit, il paraît.', 'Mon fils a vu un ours géant à la fenêtre de la réserve du magasin de jouets.', 'Je ne viendrais pas ici la nuit, moi.',
  'Les escalators font un bruit bizarre, non ?', 'Vous savez s\'il reste des parts au Big Burger ?', 'On dit que le sous-sol est condamné depuis 87.', 'Bonne soirée, monsieur l\'agent !',
];
const GERARD_LINES = [
  'Les règles, petit : la lumière, c\'est ton amie. Les mannequins, tu les regardes. Bobby, tu ne le laisses jamais entrer.',
  'Si le téléphone sonne à trois heures pile, décroche. Ou pas. Ça dépend des nuits.',
  'Mon frère Marcel gardait ce centre avant moi. Un soir, il n\'est pas rentré.',
  'Le chat de l\'entrepôt, nourris-le. Les chats voient des choses qu\'on ne voit pas.',
  'La porte blindée tient le coup. Tant qu\'il y a du courant.',
];

class NpcPick extends WorldObject {
  constructor(world, sys, e) { super(world, 'npc:' + e.id, 'npc'); this.sys = sys; this.e = e; this.name = e.o.name || 'Personne'; this.init({}); this.place(); world.add(this); }
  place() { const p = this.e.pos; const h = this.e.o.h || 1.8; this.setPick(p.x - 0.32, p.y, p.z - 0.32, p.x + 0.32, p.y + h, p.z + 0.32); }
  prompt(p) { return 'E : Parler à ' + this.name; }
  local(v, p) { if (v === 'use') this.sys.game.sim.do('talk', { npc: this.e.id }); return true; }
  dispose() { if (this.pickBox) this.world.pick.remove(this.pickBox); this.world.objects.delete(this.id); }
}

class Ent {
  constructor(sys, id, type, o = {}) {
    this.sys = sys; this.id = id; this.type = type; this.o = o;
    this.pos = o.p ? V(...o.p) : V(); this.yaw = o.yaw || 0; this.pose = o.pose || 'idle'; this.speed = 0;
    this.camOnly = !!o.camOnly; this.irOnly = !!o.irOnly; this.eyes = !!o.eyes; this.hiddenVis = false;
    this.path = null; this.pi = 0; this.state = 'idle'; this.t = 0; this.wait = 0; this.hp = o.hp || 3;
    this.vis = null; this.tgt = null; this.repath = 0; this.flee = 0; this.stun = 0; this.life = o.life || 0;
    this.netPos = this.pos.clone(); this.netYaw = this.yaw; this.zoneT = 0; this.stepT = 0; this.npc = null; this.loop = null;
  }
  get h() { return HEIGHT[this.type] ?? 1.8; }
  get chest() { return this.pos.clone().add(V(0, this.h * 0.6, 0)); }
}

export class Entities {
  constructor(game) {
    this.game = game; this.world = game.world; this.nav = game.world.nav;
    this.list = new Map(); this.counter = 0; this.levels = {}; this.mode = 'story'; this.night = 1; this.day = false;
    this.snapT = 0; this.pending = []; this.ignore = new Map(); this.catHater = new Set(); this.struck = new Set();
    const S = game.sim;
    S.effect('ent+', (p) => this.add(p.id, p.type, p.o));
    S.effect('ent-', (p) => this.remove(p.id));
    S.effect('ents', (p) => this.applySnap(p));
    S.effect('ehit', (p) => this.applyHit(p));
    S.effect('discovernum', (p) => game.discover('number', p.num));
    S.effect('entflags', (p) => { const e = this.list.get(p.id); if (e) { Object.assign(e, p.f); this.applyLayer(e); } });
    this.linkVentNav();
  }
  get g() { return this.game; }

  // passages grille ↔ pièce pour la chose des conduits
  linkVentNav() {
    const nav = this.nav, W = this.world;
    if (W.securityGrate && nav.nodes.get('vsec1') && !nav.nodes.get('sec_grate')) {
      nav.node('sec_grate', -69, 0, 0.9, 'security', ['security']); nav.link('sec_grate', 'sec_in'); nav.link('sec_grate', 'sec_desk');
      nav.link('vsec1', 'sec_grate', { grate: W.securityGrate.id, hatch: true });
    }
    const wg = (W.ventGrates || []).find(g => g.o.zone === 'westwing0');
    if (wg && nav.nodes.get('vw6') && nav.nodes.get('ww0_9') && !nav.nodes.get('ww_grate')) {
      nav.node('ww_grate', -77.6, 0, 10, 'westwing0'); nav.link('ww_grate', 'ww0_9');
      nav.node('vw10', -78.5, W.ventY + 0.06, 10, 'vent_w', ['vent']); nav.link('vw6', 'vw10', { vent: true }); nav.link('vw10', 'vw12', { vent: true });
      nav.link('vw10', 'ww_grate', { grate: wg.id });
    }
  }

  // ───────────────────────── cycle de vie ─────────────────────────
  configure(mode, n, day) {
    this.mode = mode; this.night = n; this.day = day;
    if (mode === 'story') this.levels = { ...(NIGHTS[Math.min(10, n)].entities || {}) };
    else { const L = Math.min(1, 0.25 + n * 0.08); this.levels = { cat: 0.5, shadow: n >= 2 ? L * 0.8 : 0, bobby: n >= 2 ? L : 0, mannequin: n >= 3 ? L : 0, crawler: n >= 4 ? L : 0 }; }
    this.pending = []; this.ignore.clear(); this.catHater.clear(); this.robbery = null; this.huntUntil = 0; this.struck = new Set();
  }
  reset() {
    for (const id of [...this.list.keys()]) this.remove(id);
    this.counter = 0; this.pending = [];
    // les mannequins retrouvent leur socle (état remis à zéro par le monde)
  }
  serialize() { return { c: this.counter, l: [...this.list.values()].map(e => ({ id: e.id, type: e.type, o: { ...e.o, p: e.pos.toArray(), yaw: e.yaw, pose: e.pose } })) }; }
  deserialize(d) { for (const id of [...this.list.keys()]) this.remove(id); for (const e of d.l || []) this.add(e.id, e.type, e.o); this.counter = d.c || 0; }

  spawn(type, o = {}) {
    if (!Net.isHost) return null;
    const id = type[0] + type[1] + (++this.counter);
    this.game.sim.emit('ent+', { id, type, o });
    return this.list.get(id);
  }
  despawn(e) { if (!Net.isHost || !e) return; this.game.sim.emit('ent-', { id: e.id }); }
  add(id, type, o) {
    if (this.list.has(id)) return this.list.get(id);
    const e = new Ent(this, id, type, o);
    // les humains « normaux » prennent toujours les escalators (même quand l'étage est fermé au gardien)
    if (['shopper', 'keeper', 'gerard', 'police', 'fireman', 'visitor', 'robber', 'thing', 'cat'].includes(type)) e.climbs = true;
    e.vis = this.makeVisual(e);
    if (e.vis) { this.game.scene.add(e.vis); e.vis.position.copy(e.pos); e.vis.rotation.y = e.yaw; this.applyLayer(e); }
    if (o.talk) e.npc = new NpcPick(this.world, this, e);
    this.list.set(id, e);
    return e;
  }
  remove(id) {
    const e = this.list.get(id); if (!e) return;
    if (e.vis) { e.vis.removeFromParent(); }
    if (e.npc) e.npc.dispose();
    if (e.loop) { e.loop.stop(0.4); e.loop = null; }
    this.list.delete(id);
  }
  applyLayer(e) {
    if (!e.vis) return;
    const layer = e.irOnly ? CAM_LAYERS.ir : e.camOnly ? CAM_LAYERS.cam : 0;
    if (e._layer !== layer) { setHumanoidLayer(e.vis, layer); e._layer = layer; }
    if (e.vis.userData.eyes) e.vis.userData.eyes.visible = !!e.eyes || e.type !== 'shadow';
  }
  setFlags(e, f) { if (!Net.isHost) return; this.game.sim.emit('entflags', { id: e.id, f }); }

  // ───────────────────────── visuels ─────────────────────────
  makeVisual(e) {
    const o = e.o; const t = e.type; let v = null;
    const seed = o.v ?? 0; const rnd = (k) => { const x = Math.sin(seed * 91.7 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const skins = [0xf1c8a8, 0xe0b090, 0xc68c64, 0x8d5a3c, 0x5c3a24, 0xf5d5c0];
    const hairs = [0x2b1d14, 0x4e342e, 0x8d6e63, 0xd7b46a, 0x1a1a1a, 0x9e9e9e, 0xb5651d];
    const shirts = [0xc62828, 0x1565c0, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0x37474f, 0xef6c00, 0x00838f, 0xad1457, 0x5d4037, 0xeeeeee];
    switch (t) {
      case 'gerard': v = buildHumanoid({ shirt: 0x2b3a55, pants: 0x1f2a44, hair: 0xbdbdbd, skin: 0xe0b89a, badge: true, hat: 'cap', hatColor: 0x1f2a44, height: 1.74 }); break;
      case 'shopper': case 'keeper': {
        const f = o.f ?? rnd(1) < 0.5;
        v = buildHumanoid({ shirt: o.shirt ?? shirts[Math.floor(rnd(2) * shirts.length)], pants: o.pants ?? [0x263238, 0x1a237e, 0x3e2723, 0x424242, 0x795548][Math.floor(rnd(3) * 5)], skin: skins[Math.floor(rnd(4) * skins.length)], hair: hairs[Math.floor(rnd(5) * hairs.length)], height: f ? 1.6 + rnd(6) * 0.12 : 1.7 + rnd(6) * 0.15, sleeves: rnd(7) < 0.5, badge: t === 'keeper' });
        break;
      }
      case 'police': v = buildHumanoid({ kind: 'police', shirt: 0x1a237e, pants: 0x0d1450, hat: 'cap', hatColor: 0x0d1450, skin: skins[Math.floor(rnd(1) * 4)] }); break;
      case 'fireman': v = buildHumanoid({ kind: 'firefighter', shirt: 0x263238, pants: 0x263238, hat: 'firehelmet' }); break;
      case 'robber': v = buildHumanoid({ shirt: 0x151515, pants: 0x1c1c1c, hat: 'balaclava', shoes: 0x0a0a0a, height: 1.75 + rnd(1) * 0.1 }); break;
      case 'visitor': v = buildHumanoid({ shirt: 0xc62828, pants: 0x263238, hat: 'cap', hatColor: 0xc62828 }); break;
      case 'bobby': v = buildHumanoid({ kind: 'bear', glowEyes: true, height: 1.85 }); this.addEyes(v, 0xff2a00, 0.09, 1.85 * 0.93, 0.2, 0.025); break;
      case 'mannequin': v = buildHumanoid({ kind: 'mannequin' }); if (v.userData.parts.stand) v.userData.parts.stand.visible = false; break;
      case 'lucie': v = buildHumanoid({ shirt: 0xb71c1c, pants: 0xb71c1c, hair: 0x5d4037, skin: 0xead0b8, height: 1.18, sleeves: false }); break;
      case 'shadow': v = this.buildShadow(); break;
      case 'crawler': v = buildHumanoid({ skin: 0xcfc6b8, shirt: 0xcfc6b8, pants: 0xbdb3a3, hair: 0x111111, shoes: 0xcfc6b8, height: 1.95, sleeves: false }); this.addEyes(v, 0xfff4c0, 0.05, 1.42, 0.12, 0.018); break;
      case 'thing': v = this.buildThing(); break;
      case 'cat': v = this.buildCat(); break;
      case 'rat': v = this.buildRat(); break;
      case 'balloon': v = this.buildBalloon(); break;
      default: return null;
    }
    if (t !== 'shadow' && t !== 'balloon') litHumanoid(v);
    return v;
  }
  addEyes(root, color, dx, y, z, r) {
    const m = new THREE.MeshBasicMaterial({ color }); const g = new THREE.SphereGeometry(r, 8, 6);
    const grp = new THREE.Group(); const head = root.userData.parts?.head;
    for (const s of [-1, 1]) { const e = new THREE.Mesh(g, m); e.position.set(s * dx, head ? 0.16 : y, head ? z : z); grp.add(e); }
    if (head) head.add(grp); else { grp.position.y = y; root.add(grp); }
    root.userData.eyes = grp;
  }
  buildShadow() {
    const v = buildHumanoid({ shirt: 0x050505, pants: 0x050505, skin: 0x050505, hair: 0x050505, shoes: 0x050505, height: 2.12 });
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    v.traverse(o => { if (o.isMesh) { o.material = black; o.castShadow = false; } });
    v.scale.set(0.85, 1, 0.7);
    const eyes = new THREE.Group(); const em = new THREE.MeshBasicMaterial({ color: 0xffffff }); const eg = new THREE.SphereGeometry(0.02, 6, 4);
    for (const s of [-1, 1]) { const m = new THREE.Mesh(eg, em); m.position.set(s * 0.05, 0.16, 0.115); eyes.add(m); }
    v.userData.parts.head.add(eyes); v.userData.eyes = eyes; eyes.visible = false;
    return v;
  }
  buildThing() {
    const root = new THREE.Group(); root.userData.parts = null;
    const mat = new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 1 });
    const body = new THREE.Group(); root.add(body);
    for (let i = 0; i < 14; i++) { const r = 0.25 + R() * 0.35; const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); m.position.set((R() - 0.5) * 0.7, 0.5 + R() * 1.6, (R() - 0.5) * 0.5); m.castShadow = true; body.add(m); }
    const tend = [];
    for (let i = 0; i < 9; i++) { const g = new THREE.CylinderGeometry(0.02, 0.07, 1.6 + R(), 6); g.translate(0, -0.8, 0); const m = new THREE.Mesh(g, mat); m.position.set((R() - 0.5) * 0.6, 1.4 + R() * 0.6, (R() - 0.5) * 0.4); m.rotation.set((R() - 0.5) * 1.2, R() * 6, (R() - 0.5) * 1.2); m.castShadow = true; body.add(m); tend.push(m); }
    const em = new THREE.MeshBasicMaterial({ color: 0xff1a1a }); const eg = new THREE.SphereGeometry(0.035, 8, 6);
    const eyes = new THREE.Group();
    for (const [x, y] of [[-0.12, 2.05], [0.12, 2.05], [-0.22, 1.9], [0.2, 1.88]]) { const m = new THREE.Mesh(eg, em); m.position.set(x, y, 0.32); eyes.add(m); }
    root.add(eyes); root.userData.eyes = eyes; root.userData.tend = tend; root.userData.body = body;
    return root;
  }
  buildCat() {
    const root = new THREE.Group(); const fur = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9 });
    const add = (geo, x, y, z, parent = root) => { const m = new THREE.Mesh(geo, fur); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    add(new THREE.BoxGeometry(0.16, 0.15, 0.42), 0, 0.22, 0);
    const head = new THREE.Group(); head.position.set(0, 0.33, 0.24); root.add(head);
    add(new THREE.SphereGeometry(0.09, 10, 8), 0, 0, 0, head);
    for (const s of [-1, 1]) { const ear = add(new THREE.ConeGeometry(0.035, 0.07, 6), s * 0.05, 0.09, -0.01, head); ear.rotation.z = -s * 0.2; }
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x9cff57 }); const eg = new THREE.SphereGeometry(0.014, 6, 4);
    const eyes = new THREE.Group(); for (const s of [-1, 1]) { const m = new THREE.Mesh(eg, eyeM); m.position.set(s * 0.035, 0.02, 0.08); eyes.add(m); } head.add(eyes);
    const legs = []; for (const [x, z] of [[-0.06, 0.15], [0.06, 0.15], [-0.06, -0.15], [0.06, -0.15]]) legs.push(add(new THREE.BoxGeometry(0.04, 0.16, 0.04), x, 0.08, z));
    const tail = new THREE.Group(); tail.position.set(0, 0.27, -0.2); root.add(tail);
    const tm = add(new THREE.CylinderGeometry(0.015, 0.025, 0.32, 6), 0, 0.15, -0.04, tail); tm.rotation.x = -0.4;
    root.userData = { parts: null, head, legs, tail, eyes, cat: true };
    return root;
  }
  buildRat() { const root = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.9 }); const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), m); b.scale.set(0.8, 0.7, 1.6); b.position.y = 0.04; root.add(b); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.14, 4), new THREE.MeshStandardMaterial({ color: 0xc09090 })); t.rotation.x = Math.PI / 2; t.position.set(0, 0.03, -0.13); root.add(t); root.userData.parts = null; return root; }
  buildBalloon() {
    const root = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), new THREE.MeshStandardMaterial({ color: 0xd50000, roughness: 0.25, emissive: 0x220000 })); b.scale.y = 1.2; b.position.y = 1.6; root.add(b);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.4, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd })); s.position.y = 0.75; root.add(s);
    root.userData.parts = null; root.userData.ball = b; return root;
  }

  // ───────────────────────── réseau ─────────────────────────
  applySnap(p) {
    if (Net.isHost) return;
    const a = p.a;
    for (let i = 0; i < a.length; i += 7) {
      const e = this.list.get(a[i]); if (!e) continue;
      e.netPos.set(a[i + 1], a[i + 2], a[i + 3]); e.netYaw = a[i + 4]; e.pose = POSES[a[i + 5]] || 'idle'; e.speed = a[i + 6];
    }
  }
  sendSnap(dt) {
    if (!Net.online) return;
    this.snapT += dt; if (this.snapT < 0.1) return; this.snapT = 0;
    const a = [];
    for (const e of this.list.values()) a.push(e.id, +e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2), +e.yaw.toFixed(2), Math.max(0, POSES.indexOf(String(e.pose))), +e.speed.toFixed(1));
    if (a.length) this.game.sim.emit('ents', { a }, { exceptHost: true });
  }
  applyHit(p) {
    const g = this.game; if (p.to !== Net.myId) return;
    const pl = g.player; if (!pl.alive) return;
    if (p.scr && g.settings.screamers !== false) g.ui.screamerFlash(p.scr, 0.8);
    if (p.kill) { pl.kill('entity', p.by); return; }
    if (p.dmg) pl.damage(p.dmg, p.by);
    if (p.scare) pl.scare(p.scare);
    if (p.shake) pl.shake(p.shake, 0.4);
  }
  hurt(pl, o) {
    // le premier contact de chaque présence, chaque nuit, blesse gravement au lieu de tuer : on a été prévenu
    if (o.kill && o.by) { const k = pl.id + ':' + o.by; if (!this.struck.has(k)) { this.struck.add(k); o = { ...o, kill: false, dmg: Math.max(o.dmg || 0, 55), scare: 45, shake: 0.4 }; } }
    this.game.sim.emit('ehit', { to: pl.id, ...o });
  }
  // agressivité effective : elle monte pendant les quatre premières heures de la nuit
  effL(e, def = 0.4) { const nm = this.game.env?.nightMinutes ?? 240; return (e.L || def) * (0.6 + 0.4 * Math.min(1, Math.max(0, nm) / 240)); }

  // ───────────────────────── perception ─────────────────────────
  eyeOf(pl) { if (pl === this.game.player) return this.game.camera.position.clone(); return pl.pos.clone().add(V(0, pl.crouching ? 1.0 : 1.6, 0)); }
  dirOf(pl) { if (pl === this.game.player) return pl.forward(); return fwdOf(pl.yaw || 0, pl.pitch || 0); }
  los(a, b, layers = LAYER.WALL | LAYER.DOOR) { const d = b.clone().sub(a); const L = d.length(); if (L < 0.05) return true; d.divideScalar(L); return !this.world.physics.raycast(a.x, a.y, a.z, d.x, d.y, d.z, L - 0.1, layers); }
  litAt(p) { const z = this.world.zoneAt(p.x, p.y + 0.5, p.z); return (z?._level || 0) > 0.25; }
  flashOn(e, maxD = 18, cosA = 0.92) {
    for (const pl of this.game.alivePlayers()) {
      if (!pl.flashOn) continue;
      const eye = this.eyeOf(pl); const to = e.chest.sub(eye); const d = to.length(); if (d > maxD) continue;
      if (this.dirOf(pl).dot(to.divideScalar(d)) < cosA) continue;
      if (this.los(eye, e.chest)) return pl;
    }
    return null;
  }
  // un joueur regarde-t-il cette présence (directement ou sur une caméra) ?
  observed(e, opts = {}) {
    const g = this.game; const c = e.chest;
    for (const pl of g.alivePlayers()) {
      const cv = pl === g.player ? (g.security.fullscreen && g.security.mode && !g.security.playback ? g.security.selId : null) : pl.camView;
      if (cv) { const cam = g.security.find(cv); if (cam && g.security.camStatus(cam) === 'ok' && g.security.sees(cam, c, 30)) return pl; }
      if (pl.mode === 'screen' || pl.mode === 'spectate' || (pl.mode === 'desk' && pl === g.player && g.security.fullscreen)) continue;
      const eye = this.eyeOf(pl); const to = c.clone().sub(eye); const d = to.length(); if (d > (opts.maxD || 38)) continue;
      const dot = this.dirOf(pl).dot(to.clone().divideScalar(d));
      if (dot < 0.55) continue;
      if (!this.los(eye, c)) continue;
      const lit = this.litAt(e.pos) || (pl.flashOn && dot > 0.9 && d < 22) || d < 3.5;
      if (lit) return pl;
    }
    return null;
  }
  // joueurs ciblables par un type de présence
  targets(e) {
    const g = this.game; const t = e.type; const now = g.time;
    return g.alivePlayers().filter(pl => {
      if (pl.mode === 'hide' && !(t === 'thing' && pl.pos.distanceTo(e.pos) < 2 && R() < 0.02)) return false;
      if ((this.ignore.get(pl.id + ':' + t) || 0) > now) return false;
      const c = pl.costume;
      if (t === 'bobby' && c === 'bear') return false;
      if (t === 'shadow' && c === 'ghost') return false;
      if (t === 'mannequin' && c === 'mannequin' && this.speedOf(pl) < 0.3) return false;
      if (t === 'crawler' && pl.costume === 'astronaut' && R() < 0.5) return false;
      return true;
    });
  }
  speedOf(pl) { return pl.speed ?? Math.hypot(pl.body?.vel?.[0] || 0, pl.body?.vel?.[2] || 0); }
  nearestTarget(e, maxD = 999) { let best = null, bd = maxD; for (const pl of this.targets(e)) { const d = pl.pos.distanceTo(e.pos); if (d < bd) { bd = d; best = pl; } } return best; }

  // ───────────────────────── navigation ─────────────────────────
  node(id) { return this.nav.nodes.get(id); }
  nearestNode(p, opts = {}) {
    return this.nav.nearest(p.x, p.y, p.z, (n) => {
      if (opts.vent === true && !n.vent) return false;
      if (opts.vent === false && n.vent) return false;
      if (!opts.outside && n.tags?.includes('outside')) return false;
      return true;
    });
  }
  blockedFn(e) {
    const W = this.world, g = this.game;
    return (A, B) => {
      if (e.ghost) { const ed = A.edges?.[B.id]; if (ed?.door) { const d = W.get(ed.door); if (d?.o.armored && !d.state.open) return true; } return !!(A.vent || B.vent); }
      if ((A.vent || B.vent) && !e.canVent) { if (!(A.edges?.[B.id]?.grate)) return true; if (!e.canVent) return true; }
      const ed = A.edges?.[B.id]; if (!ed) return false;
      if (ed.door) { const d = W.get(ed.door); if (d && !d.state.open) { if (d.o.armored) return !e.passArmored; if ((d.state.locked || d.state.sealed || d.state.padlock) && !e.canForce && !(e.hasKeys && d.state.locked && !d.state.padlock && !d.state.sealed)) return true; if (!e.opensDoors && !e.canForce && !e.hasKeys) return true; } }
      if (ed.shutter) { const s = ed.shutter === true ? W.garageGate : W.get(ed.shutter); if (s && s.state.target === 1 && !e.ignoreShutters && !e.forceShutters) return true; }
      if (ed.grate) { const gr = W.get(ed.grate); if (!gr || !e.canVent) return true; if (gr.state.taped) return true; if (ed.hatch && g.power.state.hatchClosed) return true; }
      if (ed.escalator && !g.isAreaUnlocked('gallery1') && !e.climbs) return true;
      return false;
    };
  }
  goTo(e, nodeOrPos, opts = {}) {
    // continuité : on repart du nœud vers lequel on marche (ou de celui où l'on attend devant une porte)
    let from = null;
    if (e.path && e.pi < e.path.length) from = (e.linkOk || e.pi === 0) ? this.node(e.path[e.pi]) : this.node(e.path[e.pi - 1]);
    if (!from) from = this.nearestNode(e.pos, { vent: e.inVent ? true : (e.canVent ? undefined : false), outside: true });
    let to = typeof nodeOrPos === 'string' ? this.node(nodeOrPos) : this.nearestNode(nodeOrPos, { vent: opts.vent, outside: opts.outside });
    if (!from || !to) { e.path = null; return false; }
    const path = this.nav.path(from.id, to.id, this.blockedFn(e), opts.cost || null);
    if (!path) { e.path = null; return false; }
    e.path = path; e.pi = 0; e.linkOk = true; e.dest = typeof nodeOrPos === 'string' ? null : nodeOrPos.clone?.() || null;
    return true;
  }
  // avance le long du chemin. Retourne 'arrived' | 'moving' | 'blocked'
  follow(e, dt, speed) {
    if (!e.path || e.pi >= e.path.length) {
      if (e.dest && e.pos.distanceTo(e.dest) > 0.3 && e.pos.distanceTo(e.dest) < 6) { this.stepTo(e, e.dest, dt, speed); e.speed = speed; return 'moving'; }
      e.speed = 0; return 'arrived';
    }
    const N = this.node(e.path[e.pi]); if (!N) { e.path = null; return 'arrived'; }
    if (e.pi > 0 && !e.linkOk) { const P = this.node(e.path[e.pi - 1]); const r = this.passLink(e, P, N, dt); if (r !== true) { e.speed = 0; e.blockT = (e.blockT || 0) + dt; return 'blocked'; } e.linkOk = true; e.blockT = 0; }
    const target = V(N.x, N.y, N.z);
    if (this.stepTo(e, target, dt, speed)) { e.pi++; e.linkOk = false; e.inVent = !!N.vent; }
    e.speed = speed;
    return 'moving';
  }
  stepTo(e, t, dt, speed) {
    const dx = t.x - e.pos.x, dz = t.z - e.pos.z, dy = t.y - e.pos.y; const d = Math.hypot(dx, dz); const step = speed * dt;
    if (d <= step + 0.04) { e.pos.set(t.x, t.y, t.z); return true; }
    e.pos.x += dx / d * step; e.pos.z += dz / d * step; e.pos.y += dy * Math.min(1, step / Math.max(d, 0.01));
    e.yaw = turn(e.yaw, Math.atan2(dx, dz), dt * 7);
    return false;
  }
  passLink(e, A, B, dt) {
    const g = this.game, W = this.world; const ed = A.edges?.[B.id]; if (!ed) return true;
    if (e.ghost) { if (ed.door) { const d = W.get(ed.door); if (d?.o.armored && !d.state.open) { e.blockedBy = d; return false; } } return true; }
    if (ed.door) {
      const d = W.get(ed.door); if (!d || d.state.open) return true;
      if (d.o.armored) { e.blockedBy = d; return false; }
      if (d.state.locked && e.hasKeys && !d.state.padlock && !d.state.sealed) { d.set({ locked: false, open: 1 }); e.relock = d; return false; }
      if (d.state.locked || d.state.sealed || d.state.padlock) {
        if (!e.canForce) { e.blockedBy = d; return false; }
        e.forceT = (e.forceT || 0) + dt;
        if (!e._forceFx || g.time - e._forceFx > 1.4) { e._forceFx = g.time; g.sim.emit('fx', { s: e.type === 'thing' ? 'low_boom' : e.forceT > 2 ? 'metal_screech' : 'door_rattle', pos: d.pos.toArray(), v: 1 }); g.noise(d.pos, 0.7, 'force'); }
        const pad = d.state.padlock === 2 ? 5 : d.state.padlock === 1 ? 2.5 : 1;
        if (e.forceT > (e.forceTime || 5) * pad) { e.forceT = 0; d.set({ locked: false, padlock: 0, sealed: false, open: 1, broken: true }); g.hooks.emit('door_forced', { door: d, actor: null, by: e.type }); return true; }
        return false;
      }
      if (e.opensDoors || e.canForce) { d.forceOpen(1); if (e.type === 'bobby' || e.type === 'thing') g.sim.emit('fx', { s: 'door_creak', pos: d.pos.toArray(), v: 0.8 }); return false; }
      e.blockedBy = d; return false;
    }
    if (ed.shutter) {
      const s = ed.shutter === true ? W.garageGate : W.get(ed.shutter);
      if (s && s.state.target === 1 && !e.ignoreShutters) {
        if (!e.forceShutters) { e.blockedBy = s; return false; }
        e.forceT = (e.forceT || 0) + dt;
        const sp = s.pos || V(A.x, A.y + 1, A.z);
        if (!e._forceFx || g.time - e._forceFx > 1.5) { e._forceFx = g.time; g.sim.emit('fx', { s: 'metal_screech', pos: sp.toArray(), v: 1 }); g.noise(sp, 0.8, 'force'); }
        if (e.forceT > (e.forceTime || 5) + 3) { e.forceT = 0; s.set({ target: 0, locked: false }); if (s.o?.shop) g.hooks.emit('alarm_trigger', { shop: s.o.shop, reason: 'rideau forcé' }); }
        return false;
      }
    }
    if (ed.grate) {
      const gr = W.get(ed.grate); if (!gr) return true;
      if (gr.state.taped || (ed.hatch && g.power.state.hatchClosed)) { e.blockedBy = gr; if (!e._bang || g.time - e._bang > 2.5) { e._bang = g.time; g.sim.emit('fx', { s: 'vent_bang', pos: [gr.o.x, gr.o.y, gr.o.z], v: 1 }); } return false; }
      if (!gr.state.open) {
        e.bangs = (e.bangs || 0) + dt;
        if (!e._bang || g.time - e._bang > 1.2) { e._bang = g.time; g.sim.emit('fx', { s: 'vent_bang', pos: [gr.o.x, gr.o.y, gr.o.z], v: 1 }); g.noise(V(gr.o.x, gr.o.y, gr.o.z), 0.8, 'vent'); }
        if (e.bangs > 4) { e.bangs = 0; gr.set({ open: true }); return true; }
        return false;
      }
    }
    return true;
  }

  // ───────────────────────── boucle ─────────────────────────
  update(dt) {
    const g = this.game;
    // activations différées
    for (const p of this.pending) if (!p.done && g.env.nightMinutes >= p.at && g.story.phase === 'night') { p.done = true; this.activate(p.type, p.action || 'activate', p.opts || {}); }
    this.updateRobbery(dt);
    this.scanT = (this.scanT || 0) - dt;
    if (this.scanT <= 0) { this.scanT = 1; this.musicBox = g.props.find('music_box', { any: true }).find(p => p.data.on && p.state.where !== 'gone') || null; this.catFood = g.props.find(p => p.state.where === 'world' && ((p.defId === 'cat_food' && p.data.placed) || p.defId === 'cheese' || p.defId === 'saucisson' || (p.defId === 'pet_bowl' && p.data.placed)))[0] || null; this.petBed = g.props.find(p => p.defId === 'pet_bed' && p.state.where === 'world')[0] || null; this.catPlush = g.props.find(p => p.defId === 'cat_plush' && p.state.where === 'world'); this.honey = g.props.find(p => p.defId === 'honey' && (p.state.where === 'world' || p.state.where === 'home')).filter(p => p.state.where === 'world')[0] || null; if (this.robbery && this.robbery.state !== 'planned') this.checkRobberyEnd(); }
    for (const e of [...this.list.values()]) {
      if (!this.list.has(e.id)) continue;
      if (e.life > 0) { e.life -= dt; if (e.life <= 0) { this.despawn(e); continue; } }
      if (e.stun > 0) { e.stun -= dt; e.speed = 0; continue; }
      const fn = this['ai_' + e.type]; if (fn) { try { fn.call(this, e, dt); } catch (err) { console.error('[ent]', e.type, err); } }
    }
    this.separate();
    this.sendSnap(dt);
    this.updateVisuals(dt, true);
  }
  // évite que plusieurs présences se superposent exactement
  separate() {
    const L = [...this.list.values()].filter(e => e.type !== 'balloon' && e.type !== 'rat' && !e.apparition && e.speed > 0.05);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j]; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z; if (Math.abs(a.pos.y - b.pos.y) > 1) continue;
      const d2 = dx * dx + dz * dz; const min = a.type === 'cat' || b.type === 'cat' ? 0.4 : 0.65;
      if (d2 < min * min) { const d = Math.sqrt(d2) || 0.01; const push = (min - d) * 0.5; const nx = d2 ? dx / d : R() - 0.5, nz = d2 ? dz / d : R() - 0.5; a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push; }
    }
  }
  updateClient(dt) {
    for (const e of this.list.values()) {
      const d = e.netPos.distanceTo(e.pos);
      if (d > 6) e.pos.copy(e.netPos); else e.pos.lerp(e.netPos, Math.min(1, dt * 10));
      e.yaw = turn(e.yaw, e.netYaw, dt * 10);
    }
    this.updateVisuals(dt, false);
  }
  updateVisuals(dt, host) {
    const g = this.game; const cam = g.camera.position;
    for (const e of this.list.values()) {
      const v = e.vis; if (!v) continue;
      v.position.copy(e.pos); v.rotation.y = e.yaw;
      const dist = cam.distanceTo(e.pos);
      // culling par distance (les caméras CCTV voient tout dans leur zone : on garde large)
      v.visible = !e.hiddenVis && (dist < 70 || g.security.fullscreen || e.type === 'balloon' || e.type === 'thing');
      if (!v.visible) continue;
      e.zoneT -= dt;
      if (e.zoneT <= 0 && v.userData.zoneU) { e.zoneT = 0.3; const z = this.world.zoneAt(e.pos.x, e.pos.y + 1, e.pos.z); const zu = z ? g.mats.zoneUniform(z.id).value : null; if (zu) v.userData.zoneU.value.copy(zu); else v.userData.zoneU.value.setRGB(0, 0, 0); }
      const pose = e.pose;
      if (v.userData.parts) {
        if (/^m\d$/.test(pose)) animateHumanoid(v, dt, 0, +pose[1]);
        else if (pose === 'lie') { animateHumanoid(v, dt, 0, 'idle'); v.rotation.x = -Math.PI / 2; v.position.y = e.pos.y + 0.18; }
        else { v.rotation.x = 0; animateHumanoid(v, dt, e.speed, pose === 'walk' || pose === 'run' ? 'auto' : pose); }
      } else if (v.userData.cat) {
        const t = g.time * (e.speed > 0.2 ? 10 + e.speed * 4 : 2);
        v.userData.legs.forEach((l, i) => { l.rotation.x = e.speed > 0.2 ? Math.sin(t + (i % 2 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
        v.userData.tail.rotation.z = Math.sin(g.time * 2) * 0.4; v.userData.tail.rotation.x = e.pose === 'sit' ? 0.8 : 0;
        v.scale.y = e.pose === 'sit' ? 0.85 : e.pose === 'lie' ? 0.55 : 1;
      } else if (v.userData.ball) { v.userData.ball.position.y = 1.6 + Math.sin(g.time * 1.3 + e.pos.x) * 0.08; }
      else if (v.userData.tend) { const t = g.time; v.userData.tend.forEach((m, i) => { m.rotation.x = Math.sin(t * 1.7 + i) * 0.5; m.rotation.z = Math.cos(t * 1.3 + i * 2) * 0.5; }); v.userData.body.scale.set(1 + Math.sin(t * 3) * 0.04, 1 + Math.cos(t * 2.3) * 0.03, 1); }
      if (e.npc) { e.npcT = (e.npcT || 0) - dt; if (e.npcT <= 0) { e.npcT = 0.2; e.npc.place(); } }
      // pas
      if (e.speed > 0.3 && dist < 22 && !e.camOnly && e.type !== 'balloon' && e.type !== 'shadow') {
        e.stepT -= dt * e.speed;
        if (e.stepT <= 0) {
          e.stepT = e.type === 'cat' || e.type === 'rat' ? 0.5 : 0.75;
          const snd = e.type === 'bobby' || e.type === 'thing' ? 'footstep_heavy' : e.type === 'cat' ? null : e.type === 'rat' ? 'rat_squeak' : e.type === 'mannequin' ? (R() < 0.25 ? 'creak' : null) : e.type === 'crawler' ? 'scratch' : e.inVent ? 'step_vent' : 'step_concrete';
          if (snd && (e.type !== 'rat' || R() < 0.15)) g.sfx(snd, e.pos.clone().add(V(0, 0.05, 0)), { volume: e.type === 'thing' ? 1 : e.type === 'bobby' ? 0.7 : 0.45, intensity: 0.5 });
        }
      }
    }
  }

  // ───────────────────────── états de jeu ─────────────────────────
  spawnDay() {
    const g = this.game; const W = this.world;
    this.setEntrance(true);
    this.gerardE = this.spawn('gerard', { p: W.points.gerardSpot.toArray(), yaw: -Math.PI / 2, talk: true, name: 'Gérard', h: 1.75 });
    // commerçants
    let n = 0;
    for (const [shop, k] of Object.entries(KEEPERS)) {
      const c = this.node(shop + '_c'); if (!c || n >= 12) continue; n++;
      const s = SHOPS.find(x => x.id === shop);
      this.spawn('keeper', { p: [c.x + (R() - 0.5), c.y, c.z + (R() - 0.5)], yaw: R() * 6, talk: true, name: k.name + ' (' + (s?.name || shop) + ')', keeper: shop, f: !!k.f, shirt: s?.color, v: n * 7 + 3, home: shop + '_c' });
    }
    // clients
    const gnodes = [...this.nav.nodes.values()].filter(nd => /^g[01][ns]/.test(nd.id));
    for (let i = 0; i < 12; i++) { const nd = pick(gnodes); this.spawn('shopper', { p: [nd.x + (R() - 0.5) * 2, nd.y, nd.z + (R() - 0.5) * 2], yaw: R() * 6, talk: true, name: 'Client' + (i % 2 ? 'e' : ''), v: i * 13 + 1, f: i % 2 === 1 }); }
    if (this.levels.cat) this.spawnCat();
  }
  spawnDusk() { if (this.levels.cat) this.spawnCat(); }
  spawnCat() { const p = this.world.points.catBed || V(-84, 0.05, 3.8); return this.spawn('cat', { p: [p.x, 0, p.z], yaw: R() * 6 }); }
  get gerard() { return this.gerardE && this.list.has(this.gerardE.id) ? this.gerardE : null; }
  gerardLeave() { const e = this.gerard; if (!e) return; e.state = 'leave'; e.hasKeys = true; e.opensDoors = true; this.goTo(e, 'ent_door'); }
  setEntrance(open) { for (const id of ['entry_a', 'entry_b']) { const d = this.world.doors?.[id]; if (d) d.set(open ? { locked: false, open: 1 } : { open: 0, locked: true }); } }
  crowdLeave() {
    for (const e of this.list.values()) {
      if (e.type === 'shopper') { e.state = 'leave'; this.goTo(e, 'ent_door'); }
      if (e.type === 'keeper') { e.state = 'leave'; e.wait = 20 + R() * 60; }
    }
  }
  nightStart() {
    const g = this.game;
    // les présences de la nuit qui ne sont pas réveillées par un script le sont un peu plus tard, au hasard
    const scripted = new Set();
    if (this.mode === 'story') for (const s of NIGHTS[Math.min(10, this.night)].scripted || []) if (s.fx === 'entity') scripted.add(s.type);
    for (const [type, L] of Object.entries(this.levels)) {
      if (!L || type === 'cat' || type === 'robbers' || type === 'thing' || scripted.has(type)) continue;
      this.pending.push({ type, at: 15 + R() * 70, opts: { level: L } });
    }
    if (!this.find('cat') && this.levels.cat) this.spawnCat();
    // le costume de Bobby trône à l'entrée du Royaume du Jouet (à partir de son retour en rayon, nuit 3)
    if ((this.levels.bobby || (this.mode === 'story' && this.night >= 3)) && !this.find('bobby')) {
      const n = this.node('jouets_in'), c = this.node('jouets_c');
      if (n && c) { const p = V(n.x, n.y, n.z).lerp(V(c.x, c.y, c.z), 0.35); const e = this.spawn('bobby', { p: p.toArray(), yaw: Math.atan2(n.x - c.x, n.z - c.z) }); if (e) { e.state = 'display'; e.L = this.levels.bobby || 0.3; e.home = 'jouets_c'; } }
    }
    let dayFolks = false;
    for (const e of [...this.list.values()]) if (e.type === 'shopper' || e.type === 'keeper' || e.type === 'gerard') { this.despawn(e); dayFolks = true; }
    if (dayFolks || this.day) this.setEntrance(false);
  }
  find(type) { for (const e of this.list.values()) if (e.type === type) return e; return null; }
  all(type) { return [...this.list.values()].filter(e => e.type === type); }
  level(type, opts) { return Math.max(0.1, Math.min(1, opts?.level ?? this.levels[type] ?? 0.4)); }

  // Activation d'une présence (scripts de l'histoire, événements, mode infini)
  activate(type, action = 'activate', opts = {}) {
    const g = this.game; if (!Net.isHost) return;
    const L = this.level(type, opts);
    switch (type) {
      case 'robbers': return this.planRobbery(opts);
      case 'bobby': { const cur = this.find('bobby'); if (cur) { cur.L = Math.max(cur.L || 0, L); if (cur.state === 'display') { cur.state = 'rest'; cur.wait = 6 + R() * 10; cur.opensDoors = true; cur.canForce = cur.L >= 0.45; cur.forceTime = 32 - cur.L * 16; cur.home = cur.home || 'jouets_c'; g.sim.emit('fx', { s: 'music_box_wrong', pos: cur.chest.toArray(), v: 0.6 }); } return; } const c = this.node('jouets_bk') || this.node('jouets_c'); const e = this.spawn('bobby', { p: [c.x, c.y, c.z], yaw: 0 }); e.L = L; e.state = 'rest'; e.wait = 10 + R() * 20; e.opensDoors = true; e.canForce = L >= 0.45; e.forceTime = 32 - L * 16; e.home = c.id; g.sim.emit('fx', { s: 'music_box_wrong', pos: [c.x, c.y + 1, c.z], v: 0.6 }); return; }
      case 'mannequin': {
        const n = opts.count || 1;
        const devs = g.devices.kind('mannequin').filter(d => !d.state.away).sort((a, b) => (a.zone === 'mode' ? -1 : 1) - (b.zone === 'mode' ? -1 : 1));
        for (let i = 0; i < n && i < devs.length; i++) {
          const d = devs[i]; d.set({ away: true });
          const e = this.spawn('mannequin', { p: [d.center.x, d.center.y - d.def.s[1] / 2, d.center.z], yaw: d.ry, pose: 'm' + (d.state.pose || 0), dev: d.id });
          e.L = L; e.state = 'stalk'; e.opensDoors = false; e.wait = 5 + R() * 10;
        }
        return;
      }
      case 'shadow': {
        let e = this.find('shadow');
        if (!e) { const z = this.darkZoneNear(g.player.pos) || this.world.zone('gallery0_w'); const p = z.randomPoint(R, 1); e = this.spawn('shadow', { p: [p.x, z.min[1], p.z], camOnly: true }); e.state = 'roam'; e.ghost = true; }
        e.L = Math.max(e.L || 0, L);
        if (action === 'hunt') { e.state = 'hunt'; this.huntUntil = g.env.nightMinutes + 60; g.sim.emit('fx', { s: 'low_boom', pos: null, v: 0.7 }); }
        return;
      }
      case 'crawler': { if (this.find('crawler')) return; const s = this.node('vs-30') || [...this.nav.nodes.values()].find(n => n.vent); const e = this.spawn('crawler', { p: [s.x, s.y, s.z], pose: 'crawl' }); e.L = L; e.canVent = true; e.inVent = true; e.state = 'vents'; e.opensDoors = true; e.loop = null; return; }
      case 'thing': return this.awakenThing(L);
      case 'cat': { if (!this.find('cat')) this.spawnCat(); return; }
      case 'lucie': return this.apparition({ pos: opts.pos || g.player.pos, dur: opts.dur || 3, cam: true, lucie: true });
    }
  }
  darkZoneNear(p) {
    const zs = this.world.zones.filter(z => z.type !== 'vent' && !z.outdoor && (z._level || 0) < 0.2 && z.distTo(p.x, p.y, p.z) < 40 && z.distTo(p.x, p.y, p.z) > 6);
    return zs.length ? pick(zs) : null;
  }

  // ───────────────────────── IA : jour ─────────────────────────
  ai_gerard(e, dt) {
    const g = this.game;
    if (e.state === 'leave') { const r = this.follow(e, dt, 1.3); e.pose = 'walk'; if (r === 'arrived') { this.goTo(e, this.world.points.entranceOutside, { outside: true }); e.state = 'out'; } return; }
    if (e.state === 'out') { const r = this.follow(e, dt, 1.3); if (!e.doorOpened && e.pos.x > 77) { e.doorOpened = true; this.world.doors?.entry_a?.set({ locked: false, open: 1 }); } if (r === 'arrived' || e.pos.x > 82) { this.world.doors?.entry_a?.set({ open: 0, locked: true }); this.despawn(e); } return; }
    e.pose = 'idle'; e.speed = 0;
    const pl = g.alivePlayers().find(p => p.pos.distanceTo(e.pos) < 6);
    if (pl) e.yaw = turn(e.yaw, Math.atan2(pl.pos.x - e.pos.x, pl.pos.z - e.pos.z), dt * 3);
  }
  ai_shopper(e, dt) {
    const g = this.game;
    if (e.talkT > 0) { e.talkT -= dt; e.speed = 0; e.pose = 'idle'; return; }
    if (e.state === 'leave') { const r = this.follow(e, dt, 1.5); e.pose = 'walk'; if (r === 'arrived') { this.goTo(e, this.world.points.entranceOutside, { outside: true }); e.state = 'out'; } if (r === 'blocked' && e.blockT > 3) this.despawn(e); return; }
    if (e.state === 'out') { const r = this.follow(e, dt, 1.5); if (r === 'arrived' || e.pos.x > 82) { this.despawn(e); if (!this.all('shopper').some(x => x !== e)) this.setEntrance(false); } return; }
    if (e.wait > 0) { e.wait -= dt; e.speed = 0; e.pose = 'idle'; return; }
    if (!e.path || e.pi >= e.path.length) {
      e.wait = 3 + R() * 10;
      const shops = SHOPS.filter(s => this.node(s.id + '_c') && g.world.shops[s.id]?.shutter?.state.target !== 1);
      const dest = R() < 0.45 && shops.length ? pick(shops).id + '_c' : pick([...this.nav.nodes.values()].filter(n => /^g[01][ns]/.test(n.id))).id;
      this.goTo(e, dest);
      return;
    }
    const r = this.follow(e, dt, e.o.f ? 1.15 : 1.3); e.pose = 'walk';
    if (r === 'blocked' && e.blockT > 2) e.path = null;
  }
  ai_keeper(e, dt) {
    if (e.talkT > 0) { e.talkT -= dt; e.speed = 0; e.pose = 'idle'; return; }
    if (e.state === 'leave') {
      if (e.wait > 0) { e.wait -= dt; e.pose = 'idle'; e.speed = 0; return; }
      if (!e.path) { e.opensDoors = true; this.goTo(e, (e.o.keeper || '') + '_rd') || this.goTo(e, 'ent_door'); }
      const r = this.follow(e, dt, 1.3); e.pose = 'walk'; if (r === 'arrived' || (r === 'blocked' && e.blockT > 4)) this.despawn(e); return;
    }
    e.speed = 0; e.pose = 'idle';
    e.wait -= dt; if (e.wait <= 0) { e.wait = 6 + R() * 12; e.yaw += (R() - 0.5) * 2; }
  }
  talk(npcId, actor, choice) {
    const g = this.game; const e = this.list.get(npcId); const pl = g.playerById(actor); if (!e || !pl) return;
    e.yaw = Math.atan2(pl.pos.x - e.pos.x, pl.pos.z - e.pos.z); e.talkT = 5;
    let who = e.o.name || 'Quelqu\'un', text = '…';
    if (e.type === 'gerard') { who = 'Gérard'; text = pick(GERARD_LINES); }
    else if (e.type === 'keeper') {
      const k = KEEPERS[e.o.keeper]; who = k?.name || who; const i = (e.talks = (e.talks || 0) + 1) - 1; text = k ? k.lines[i % k.lines.length] : 'Bonsoir !';
      if (k?.num && i === 0) { setTimeout(() => g.sim.emit('toast', { text: 'Numéro noté dans le téléphone : ' + k.name + ' — ' + k.num.replace(/(\d\d)(?=\d)/g, '$1 ') }, { to: actor }), 1500); this.discoverFor(actor, k.num); }
    } else if (e.type === 'shopper') { who = e.o.f ? 'Cliente' : 'Client'; text = SHOPPER_LINES[(e.o.v || 0) % SHOPPER_LINES.length]; }
    else if (e.type === 'police') { who = 'Policier'; text = this.robbery?.state === 'inside' ? 'Restez derrière nous, on s\'en occupe.' : 'Tout va bien, monsieur ? On fait le tour et on repart.'; }
    else if (e.type === 'fireman') { who = 'Pompier'; text = 'Reculez, s\'il vous plaît ! Laissez-nous travailler.'; }
    else if (e.type === 'visitor') { who = 'Livreur'; text = 'Pizza Napoli ! C\'est quatorze euros… non, c\'est offert, vous avez une tête à travailler la nuit.'; this.deliverPizza(e, pl); }
    g.sim.emit('dialogue', { who, text }, { to: actor });
  }
  discoverFor(actor, num) { const g = this.game; if (actor === Net.myId) g.discover('number', num); else g.sim.emit('discovernum', { num }, { to: actor }); }

  // ───────────────────────── IA : le chat ─────────────────────────
  ai_cat(e, dt) {
    const g = this.game; e.canVent = true; e.ignoreShutters = true; e.canForce = false; e.opensDoors = false; e.catDoors = true;
    if (e.flee > 0) { e.flee -= dt; const r = this.follow(e, dt, 4.2); e.pose = 'run'; if (r !== 'moving') e.flee = 0; return; }
    // la peluche de chat : il la déteste
    for (const cp of this.catPlush || []) { const cpp = V(...cp.state.pos); if (cpp.distanceTo(e.pos) < 3.5) { e.flee = 4; g.sim.emit('fx', { s: 'hiss', pos: e.pos.toArray(), v: 0.8 }); this.goTo(e, e.pos.clone().add(e.pos.clone().sub(cpp).setY(0).normalize().multiplyScalar(10))); return; } }
    // nourriture posée
    const food = this.catFood && this.catFood.state.where === 'world' ? this.catFood : null;
    if (food && e.state !== 'eat') { const fp = V(...food.state.pos); if (e.state !== 'food') { e.state = 'food'; this.goTo(e, fp); } }
    if (e.state === 'food') {
      if (!food) { e.state = 'idle'; return; }
      const fp = V(...food.state.pos); const r = this.follow(e, dt, 1.8); e.pose = 'walk';
      if (e.pos.distanceTo(fp) < 0.7 || r === 'arrived') { e.state = 'eat'; e.t = 18; e.food = food.id; g.sim.emit('fx', { s: 'eat_crunch', pos: fp.toArray(), v: 0.4 }); }
      if (r === 'blocked' && e.blockT > 3) { e.pos.copy(fp).add(V(0.5, 0, 0)); }
      return;
    }
    if (e.state === 'eat') {
      e.speed = 0; e.pose = 'sit'; e.t -= dt;
      if (R() < dt * 0.4) g.sim.emit('fx', { s: 'eat_crunch', pos: e.pos.toArray(), v: 0.3 });
      if (e.t <= 0) { const f = g.props.get(e.food); if (f) { if (f.defId === 'pet_bowl') f.set({ data: { ...f.data, placed: false } }); else f.set({ where: 'gone' }); } g.flagSet('cat_fed_tonight', true); g.sim.emit('fx', { s: 'purr', pos: e.pos.toArray(), v: 0.6 }); g.sim.emit('toast', { text: 'Le chat a mangé. Il vous regarde avec reconnaissance.' }); e.state = 'idle'; e.friend = true; }
      return;
    }
    // costume de chat (ou chat nourri) : il suit le joueur et le prévient
    const friend = g.alivePlayers().find(p => p.costume === 'cat' && p.pos.distanceTo(e.pos) < 25) || (e.friend && g.alivePlayers().find(p => p.pos.distanceTo(e.pos) < 10 && !this.catHater.has(p.id)));
    if (friend && e.state !== 'play') {
      const d = friend.pos.distanceTo(e.pos);
      if (d > 2.2) { if (!e.path || (e.repath -= dt) <= 0) { e.repath = 1.5; this.goTo(e, friend.pos); } this.follow(e, dt, d > 6 ? 3.5 : 1.6); e.pose = 'walk'; }
      else { e.speed = 0; e.pose = 'sit'; e.yaw = turn(e.yaw, Math.atan2(friend.pos.x - e.pos.x, friend.pos.z - e.pos.z), dt * 3); }
      e.warnT = (e.warnT || 0) - dt;
      if (e.warnT <= 0) { e.warnT = 4; for (const h of this.list.values()) if (HOSTILE.has(h.type) && h.pos.distanceTo(friend.pos) < 14) { e.warnT = 12; g.sim.emit('fx', { s: 'hiss', pos: e.pos.toArray(), v: 0.9 }); g.sim.emit('toast', { text: 'Le chat feule, le poil hérissé, vers ' + (this.world.zoneAt(h.pos.x, h.pos.y + 0.5, h.pos.z)?.name || 'l\'obscurité') + '.' }, { to: friend.id }); break; } }
      return;
    }
    if (e.state === 'play') { e.t -= dt; if (e.playPos && e.pos.distanceTo(e.playPos) > 0.6) { this.follow(e, dt, 3.5); e.pose = 'run'; } else { e.speed = 0; e.pose = R() < 0.5 ? 'sit' : 'lie'; e.yaw += dt * 3; } if (e.t <= 0) { e.state = 'idle'; e.friend = true; } return; }
    if (e.state === 'sleep') { e.speed = 0; e.pose = 'lie'; e.t -= dt; if (R() < dt * 0.03) g.sim.emit('fx', { s: 'purr', pos: e.pos.toArray(), v: 0.4 }); if (e.t <= 0) e.state = 'idle'; return; }
    if (e.wait > 0) { e.wait -= dt; e.speed = 0; e.pose = 'sit'; if (R() < dt * 0.05) g.sim.emit('fx', { s: 'meow', pos: e.pos.toArray(), v: 0.5 }); return; }
    if (!e.path || e.pi >= e.path.length) {
      // arrivé : peut-être faire tomber un objet
      const z = this.world.zoneAt(e.pos.x, e.pos.y + 0.3, e.pos.z);
      if (z?.shop && R() < 0.35) { g.props.knock(z.id, 1); }
      if (this.petBed && e.pos.distanceTo(V(...this.petBed.state.pos)) > 1) { if (R() < 0.35) { this.goTo(e, V(...this.petBed.state.pos)); e.toBed = true; return; } }
      if (R() < 0.2 || (e.toBed && this.petBed)) { e.toBed = false; e.state = 'sleep'; e.t = 40 + R() * 80; return; }
      e.wait = 4 + R() * 12;
      const cands = [...this.nav.nodes.values()].filter(n => !n.vent && !n.tags?.includes('outside') && n.zone !== 'b13');
      const near = cands.filter(n => Math.hypot(n.x - e.pos.x, n.z - e.pos.z) < 40 && Math.abs(n.y - e.pos.y) < 6);
      this.goTo(e, pick(near.length ? near : cands).id);
      return;
    }
    const r = this.follow(e, dt, 1.25); e.pose = 'walk';
    if (r === 'blocked' && e.blockT > 2) e.path = null;
  }
  catAct(act, zoneId) {
    const g = this.game; let e = this.find('cat'); if (!e) e = this.spawnCat(); if (!e) return;
    const z = zoneId ? this.world.zone(zoneId) : null;
    if (z && !z.contains(e.pos.x, e.pos.y + 0.3, e.pos.z) && !this.observed(e)) { const p = z.randomPoint(R, 1); e.pos.set(p.x, z.min[1], p.z); e.path = null; }
    if (act === 'knock' && z) { g.props.knock(z.id, 1 + Math.floor(R() * 2)); g.sim.emit('fx', { s: 'cat_run', pos: e.pos.toArray(), v: 0.6 }); }
    else if (act === 'run') { e.flee = 4; this.goTo(e, pick([...this.nav.nodes.values()].filter(n => !n.vent && n.zone === (zoneId || n.zone))).id); g.sim.emit('fx', { s: 'cat_run', pos: e.pos.toArray(), v: 0.7 }); }
    else if (act === 'hiss') g.sim.emit('fx', { s: 'hiss', pos: e.pos.toArray(), v: 0.9 });
    else g.sim.emit('fx', { s: 'meow', pos: e.pos.toArray(), v: 0.8 });
  }
  catPlay(pos) { if (!Net.isHost) return; const e = this.find('cat'); if (!e || this.catHater.size && R() < 0.5) return; e.state = 'play'; e.t = 10; e.playPos = pos.clone(); this.goTo(e, pos); this.game.sim.emit('fx', { s: 'meow', pos: e.pos.toArray(), v: 0.6 }); }

  // ───────────────────────── IA : Bobby ─────────────────────────
  ai_bobby(e, dt) {
    const g = this.game; const L = this.effL(e, 0.4);
    if (e.state === 'display' || e.state === 'glimpse') { e.speed = 0; e.pose = 'idle'; return; }
    // le miel le distrait (il s'assoit et mange)
    const honey = this.honey && this.honey.state.where === 'world' ? this.honey : null;
    if (honey && !this.observed(e)) {
      const hp = V(...honey.state.pos);
      if (e.pos.distanceTo(hp) < 25) {
        if (e.pos.distanceTo(hp) < 1.2) { e.speed = 0; e.pose = 'sit'; e.honeyT = (e.honeyT || 0) + dt; if (e.honeyT > 40) { honey.set({ where: 'gone' }); e.honeyT = 0; e.wait = 20; g.sim.emit('fx', { s: 'squeak', pos: e.chest.toArray(), v: 0.5 }); } return; }
        if ((e.repath -= dt) <= 0 || !e.path) { e.repath = 3; this.goTo(e, hp); }
        this.follow(e, dt, 1.3); e.pose = 'walk'; return;
      }
    }
    // la boîte à musique l'attire (et le calme)
    const mb = this.musicBox;
    const mbPos = mb ? (mb.state.where === 'held' ? g.playerById(mb.state.owner)?.pos : V(...mb.state.pos)) : null;
    const obs = this.observed(e);
    if (e.flee > 0) { e.flee -= dt; if (!obs) { if (!e.path || e.pi >= e.path.length) this.goTo(e, e.home || 'jouets_c'); this.follow(e, dt, 2.6); e.pose = 'run'; } else e.speed = 0; return; }
    if (obs) { e.speed = 0; e.pose = 'idle'; if (!e._seen || g.time - e._seen > 25) { e._seen = g.time; if (R() < 0.5) g.sim.emit('fx', { s: R() < 0.5 ? 'squeak' : 'giggle', pos: e.chest.toArray(), v: 0.5 }); } return; }
    // costume de clown : il fuit
    const clown = g.alivePlayers().find(p => p.costume === 'clown' && p.pos.distanceTo(e.pos) < 8);
    if (clown) { e.flee = 15; e.path = null; g.sim.emit('fx', { s: 'squeak', pos: e.chest.toArray(), v: 0.9 }); return; }
    if (e.wait > 0) { e.wait -= dt; e.speed = 0; e.pose = mbPos && e.pos.distanceTo(mbPos) < 2.5 ? 'sit' : 'idle'; return; }
    if (mbPos) {
      if (e.pos.distanceTo(mbPos) < 2) { e.speed = 0; e.pose = 'sit'; e.yaw = turn(e.yaw, Math.atan2(mbPos.x - e.pos.x, mbPos.z - e.pos.z), dt * 2); return; }
      if ((e.repath -= dt) <= 0) { e.repath = 3; this.goTo(e, mbPos); }
      this.follow(e, dt, 1.4); e.pose = 'walk'; return;
    }
    // chasse : par à-coups, seulement quand personne ne regarde ; il marche vers le poste de sécurité,
    // sauf si un gardien est tout près
    const tg = this.nearestTarget(e);
    const d = tg ? tg.pos.distanceTo(e.pos) : 1e9;
    if (tg && d < 1.3 && Math.abs(tg.pos.y - e.pos.y) < 1.5) { this.bobbyAttack(e, tg); return; }
    e.burst = (e.burst ?? 4) - dt;
    if (e.burst <= 0) { e.burst = 3 + R() * 4 + L * 3; e.wait = (14 - L * 9) * (0.6 + R() * 0.8); return; }
    const chase = tg && d < 20;
    if ((e.repath -= dt) <= 0 || !e.path) { e.repath = 2.5; if (!(chase ? this.goTo(e, tg.pos) : this.goTo(e, tg && tg.pos.distanceTo(this.world.points.securityInside || tg.pos) < 6 ? 'sec_in' : 'sec_out'))) { e.wait = 6; return; } }
    if (!tg) { const r0 = this.follow(e, dt, 1.2 + L * 1.3); e.pose = 'walk'; if (r0 === 'blocked') this.atBlockedDoor(e, dt); return; }
    if (d < 5 && this.los(e.chest, tg.pos.clone().add(V(0, 1.2, 0)))) { e.path = null; this.stepTo(e, tg.pos, dt, 1.7 + L); e.speed = 1.7 + L; e.pose = 'walk'; return; }
    const r = this.follow(e, dt, 1.2 + L * 1.3); e.pose = 'walk';
    if (r === 'blocked') this.atBlockedDoor(e, dt);
  }
  bobbyAttack(e, tg) {
    const g = this.game; const L = this.effL(e, 0.4);
    this.hurt(tg, { kill: L >= 0.45, dmg: 45, by: 'bobby', scr: 'bear', scare: 40 });
    g.sim.emit('fx', { s: 'jumpscare', pos: e.chest.toArray(), v: 1 });
    // retour à la réserve
    const home = this.node(e.home || 'jouets_c'); if (home) { e.pos.set(home.x, home.y, home.z); e.path = null; }
    e.wait = 40;
  }
  atBlockedDoor(e, dt) {
    const g = this.game; const d = e.blockedBy;
    if (!d) return;
    e.knockT = (e.knockT || 0) - dt;
    if (e.knockT <= 0) { e.knockT = 3 + R() * 3; g.sim.emit('fx', { s: d.kind === 'door' ? (R() < 0.5 ? 'door_rattle' : 'knock_triple') : 'metal_screech', pos: (d.pos || e.pos).toArray(), v: 0.9 }); }
    if (e.blockT > 25 + R() * 15) { e.path = null; e.blockT = 0; e.wait = 30 + R() * 30; if (e.home) this.goTo(e, e.home); }
  }

  // ───────────────────────── IA : mannequins ─────────────────────────
  ai_mannequin(e, dt) {
    const g = this.game; const L = this.effL(e, 0.4);
    if (e.state === 'down') { e.t -= dt; e.pose = 'lie'; e.speed = 0; if (e.t <= 0 && !this.observed(e)) { e.state = 'stalk'; e.pose = 'm0'; } return; }
    const obs = this.observed(e);
    if (obs || this.flashOn(e, 20, 0.9) || this.litAt(e.pos)) { e.speed = 0; if (!e.frozenPose) e.frozenPose = 'm' + Math.floor(R() * 5); e.pose = e.frozenPose; return; }
    e.frozenPose = null;
    if (e.wait > 0) { e.wait -= dt; e.speed = 0; return; }
    const tg = this.nearestTarget(e);
    if (!tg) { e.speed = 0; return; }
    const d = tg.pos.distanceTo(e.pos);
    if (d < 1.1 && Math.abs(tg.pos.y - e.pos.y) < 1.5) { this.hurt(tg, { kill: L >= 0.6, dmg: 40, by: 'mannequin', scr: 'face', scare: 35 }); g.sim.emit('fx', { s: 'jumpscare', pos: e.chest.toArray(), v: 1 }); e.wait = 25; const dv = g.world.get(e.o.dev); if (dv) { e.pos.set(dv.center.x, dv.center.y - dv.def.s[1] / 2, dv.center.z); e.path = null; } return; }
    if (d > 45 + L * 40) { e.speed = 0; return; } // les mannequins restent près de leur magasin
    if ((e.repath -= dt) <= 0 || !e.path) { e.repath = 2; if (!this.goTo(e, tg.pos)) { e.wait = 5; return; } }
    if (d < 6 && this.los(e.chest, tg.pos.clone().add(V(0, 1.2, 0)))) { e.path = null; this.stepTo(e, tg.pos, dt, 2 + L * 2.5); e.speed = 2 + L * 2.5; e.pose = 'm4'; return; }
    const r = this.follow(e, dt, 1.6 + L * 2); e.pose = 'm4';
    if (r === 'blocked') { e.blockT > 15 && (e.path = null, e.wait = 20); }
  }
  mannequinPose(face) {
    const g = this.game;
    const devs = g.devices.kind('mannequin').filter(d => !d.state.away);
    const cam = g.world.cameras.find(c => c.zone === 'mode') || null;
    for (const d of devs) {
      let rot;
      if (face === 'front' || !face) { const tgt = cam ? cam.pos : (this.node('mode_in') ? V(this.node('mode_in').x, 0, this.node('mode_in').z) : d.center); rot = Math.atan2(tgt.x - d.center.x, tgt.z - d.center.z); }
      else rot = R() * Math.PI * 2;
      d.set({ rot });
    }
    g.sim.emit('fx', { s: 'creak', pos: devs[0]?.center.toArray() || null, v: 0.5 });
  }

  // ───────────────────────── IA : l'Ombre ─────────────────────────
  ai_shadow(e, dt) {
    const g = this.game; const L = this.effL(e, 0.3); const hunt = e.state === 'hunt' && g.env.nightMinutes < this.huntUntil;
    if (e.reveal > 0) { e.reveal -= dt; if (e.reveal <= 0 && !e.camOnly) this.setFlags(e, { camOnly: true }); }
    // la lumière la chasse
    const lit = this.litAt(e.pos); const fl = this.flashOn(e, 14, 0.93);
    if (lit || fl) {
      if (!e.fading) { e.fading = true; g.sim.emit('fx', { s: 'whisper', pos: e.chest.toArray(), v: 0.5 }); }
      e.fadeT = (e.fadeT || 0) + dt;
      if (e.fadeT > (fl ? 0.4 : 1.5)) { e.fadeT = 0; e.fading = false; const z = this.darkZoneNear((fl || g.player).pos) || this.world.zone('service_s0'); const p = z.randomPoint(R, 1); e.pos.set(p.x, z.min[1], p.z); e.path = null; e.wait = 8 + R() * 12; }
      return;
    }
    e.fading = false; e.fadeT = 0;
    if (e.wait > 0) { e.wait -= dt; e.speed = 0; e.pose = 'idle'; return; }
    const tg = this.nearestTarget(e, hunt ? 999 : 30 + L * 30);
    if (!tg) { if (!e.path || e.pi >= e.path.length) { const z = this.darkZoneNear(g.player.pos); if (z) this.goTo(e, z.randomPoint(R, 1)); else e.wait = 10; } this.follow(e, dt, 0.9); e.pose = 'walk'; return; }
    const d = tg.pos.distanceTo(e.pos);
    const tgDark = !this.litAt(tg.pos) && !tg.flashOn;
    // drain dans le noir
    if (d < 2.2 && tgDark) {
      e.drainT = (e.drainT || 0) + dt; e.speed = 0; e.pose = 'reach';
      if (!e.camOnly && R() < dt) this.setFlags(e, { eyes: true });
      if (e.drainT > 0.6) { e.drainT = 0; this.hurt(tg, { dmg: 6 + L * 10, by: 'shadow', scare: 8, shake: 0.1 }); if (R() < 0.12 && g.settings.screamers !== false) this.hurt(tg, { scr: 'face', scare: 20 }); }
      return;
    }
    if (!tgDark && d < 8 && !hunt) { e.wait = 4; return; }
    if ((e.repath -= dt) <= 0 || !e.path) { e.repath = 2; this.goTo(e, tg.pos); }
    if (d < 6 && this.los(e.chest, tg.pos.clone().add(V(0, 1.2, 0)))) { e.path = null; this.stepTo(e, tg.pos, dt, hunt ? 2.4 : 1.2 + L); e.speed = 1.2; e.pose = 'walk'; return; }
    this.follow(e, dt, hunt ? 2.6 : 1.0 + L * 1.2); e.pose = 'walk';
  }
  apparition(o) {
    const g = this.game; if (!Net.isHost) return;
    let p = o.pos.clone();
    const gr = this.world.physics.groundAt(p.x, p.z, p.y + 0.5); if (gr && gr.y > -Infinity && p.y - gr.y < 4) p.y = gr.y; else p.y = Math.max(-4.5, p.y - 1.2);
    const lucie = o.lucie || (o.cam && R() < 0.15);
    const tg = g.alivePlayers()[0];
    const yaw = tg ? Math.atan2(tg.pos.x - p.x, tg.pos.z - p.z) : 0;
    const e = this.spawn(lucie ? 'lucie' : 'shadow', { p: p.toArray(), yaw, camOnly: !!o.cam, eyes: !!o.eyes, life: o.dur || 3, pose: o.where === 'cinema_seat' ? 'sit' : 'idle' });
    if (e) { e.state = 'apparition'; e.apparition = true; }
    if (!o.cam) g.sim.emit('fx', { s: 'whisper', pos: p.clone().add(V(0, 1.6, 0)).toArray(), v: 0.4 });
  }
  ai_lucie(e, dt) { e.speed = 0; if (e.camOnly) return; if (this.observed(e)) { e.seen = (e.seen || 0) + dt; if (e.seen > 0.35) { this.game.sim.emit('fx', { s: 'giggle', pos: e.chest.toArray(), v: 0.5 }); this.despawn(e); } } }
  revealAt(pos, r = 6) {
    if (!Net.isHost) return;
    for (const e of this.list.values()) if ((e.type === 'shadow' || e.type === 'lucie') && e.pos.distanceTo(pos) < r) { this.setFlags(e, { camOnly: false, eyes: true }); e.reveal = 6; this.game.sim.emit('fx', { s: 'stinger', pos: e.chest.toArray(), v: 0.8 }); }
  }

  // ───────────────────────── IA : la chose des conduits ─────────────────────────
  ai_crawler(e, dt) {
    const g = this.game; const L = this.effL(e, 0.5);
    e.canVent = true;
    // son de reptation dans les conduits (boucle locale à tous les pairs : gérée par l'effet loopfx ponctuel)
    e.sndT = (e.sndT || 0) - dt;
    if (e.sndT <= 0 && e.speed > 0.3) { e.sndT = 4; g.sim.emit('loopfx', { s: 'vent_crawl', pos: e.pos.toArray(), v: 0.9, dur: 3.5, ref: 3 }); }
    const fl = this.flashOn(e, 9, 0.9);
    if (fl && !e.inVent) { e.flee = 6; e.path = null; g.sim.emit('fx', { s: 'scream', pos: e.chest.toArray(), v: 0.5 }); }
    if (e.flee > 0) { e.flee -= dt; if (!e.path || e.pi >= e.path.length) { const vn = this.nearestNode(e.pos, { vent: true }); if (vn) this.goTo(e, vn.id); } this.follow(e, dt, 4); e.pose = 'crawl'; return; }
    if (e.wait > 0) { e.wait -= dt; e.speed = 0; e.pose = 'crawl'; return; }
    // après une attaque, il se terre dans les conduits un long moment
    const tg = (e.rest && g.time < e.rest) ? null : this.nearestTarget(e, 60);
    if (!tg) { if (!e.path || e.pi >= e.path.length) { const vs = [...this.nav.nodes.values()].filter(n => n.vent); this.goTo(e, pick(vs).id, { vent: true }); } this.follow(e, dt, 1.2); e.pose = 'crawl'; return; }
    const d = tg.pos.distanceTo(e.pos);
    if (d < 1.2 && Math.abs(tg.pos.y - e.pos.y) < 1.4) { this.hurt(tg, { kill: L >= 0.55, dmg: 40, by: 'crawler', scr: 'face', scare: 40 }); g.sim.emit('fx', { s: 'scream', pos: e.chest.toArray(), v: 1 }); e.flee = 10; e.path = null; e.rest = g.time + 60 + R() * 40; return; }
    if ((e.repath -= dt) <= 0 || !e.path) {
      e.repath = 2;
      if (!this.goTo(e, tg.pos, { vent: tg.inVent ? true : undefined })) {
        if (this.goTo(e, tg.pos, { vent: true })) { e.above = true; } else e.wait = 5;
      } else e.above = false;
    }
    if (e.above && e.inVent && (!e.path || e.pi >= e.path.length)) { e.speed = 0; e.bangT = (e.bangT || 0) - dt; if (e.bangT <= 0) { e.bangT = 4 + R() * 5; g.sim.emit('fx', { s: R() < 0.5 ? 'vent_bang' : 'scratch', pos: e.pos.toArray(), v: 0.9 }); } return; }
    if (!e.inVent && d < 5 && this.los(e.chest, tg.pos.clone().add(V(0, 1, 0)))) { e.path = null; this.stepTo(e, tg.pos, dt, 2.6 + L); e.speed = 2.6; e.pose = 'crawl'; return; }
    const r = this.follow(e, dt, e.inVent ? 1.8 + L : 2.4 + L); e.pose = 'crawl';
    if (r === 'blocked' && e.blockT > 12) { e.path = null; e.blockT = 0; e.wait = 15; }
  }
  scent(pos) {
    if (!Net.isHost) return;
    for (const pl of this.game.alivePlayers()) if (pl.pos.distanceTo(pos) < 6) { this.ignore.set(pl.id + ':crawler', this.game.time + 25); this.ignore.set(pl.id + ':thing', this.game.time + 12); }
    const c = this.find('cat'); if (c && c.pos.distanceTo(pos) < 5) { c.flee = 5; this.game.sim.emit('fx', { s: 'hiss', pos: c.pos.toArray(), v: 0.6 }); }
  }

  // ───────────────────────── la Chose de B-13 ─────────────────────────
  awakenThing(L) {
    const g = this.game; if (this.find('thing')) return;
    const b = this.world.doors?.b13; if (b) b.set({ sealed: false, locked: false, open: 1, broken: true });
    const n = this.node('b13n'); const e = this.spawn('thing', { p: [n.x, n.y, n.z], eyes: true });
    e.L = 1; e.canForce = true; e.forceShutters = true; e.forceTime = 3; e.opensDoors = true; e.state = 'hunt';
    g.sim.emit('fx', { s: 'low_boom', pos: null, v: 1 }); g.sim.emit('fx', { s: 'metal_screech', pos: [n.x, n.y + 1, n.z], v: 1 });
    g.sim.emit('flicker', { zones: this.world.zones.map(z => z.id), dur: 4, sound: true });
    setTimeout(() => g.sim.emit('say', { who: 'Voix d\'enfant', text: 'Trois heures trente-trois. On joue à cache-cache ?', pitch: 1.6 }), 2500);
  }
  ai_thing(e, dt) {
    const g = this.game;
    if (g.flags.ritual) { g.sim.emit('fx', { s: 'low_boom', pos: e.chest.toArray(), v: 0.8 }); this.despawn(e); return; }
    e.droneT = (e.droneT || 0) - dt; if (e.droneT <= 0) { e.droneT = 6; g.sim.emit('loopfx', { s: 'drone', pos: e.chest.toArray(), v: 1, dur: 6, ref: 6 }); }
    if (e.wait > 0) { e.wait -= dt; e.speed = 0; return; }
    const tg = this.nearestTarget(e);
    if (!tg) { if (!e.path || e.pi >= e.path.length) { const ns = [...this.nav.nodes.values()].filter(n => !n.vent && !n.tags?.includes('outside')); this.goTo(e, pick(ns).id); } this.follow(e, dt, 1.4); e.pose = 'walk'; return; }
    const d = tg.pos.distanceTo(e.pos);
    if (d < 1.6 && Math.abs(tg.pos.y - e.pos.y) < 1.8) { this.hurt(tg, { kill: true, by: 'thing', scr: 'face' }); g.sim.emit('fx', { s: 'jumpscare', pos: e.chest.toArray(), v: 1 }); e.wait = 8; return; }
    const sp = (this.litAt(e.pos) ? 1.3 : 2.1) * (this.flashOn(e, 14, 0.9) ? 0.6 : 1);
    if ((e.repath -= dt) <= 0 || !e.path) { e.repath = 2; this.goTo(e, tg.pos); }
    if (d < 7 && this.los(e.chest, tg.pos.clone().add(V(0, 1.2, 0)))) { e.path = null; this.stepTo(e, tg.pos, dt, sp + 0.3); e.speed = sp; e.pose = 'walk'; return; }
    const r = this.follow(e, dt, sp); e.pose = 'walk';
    if (r === 'blocked') { this.atBlockedDoor(e, dt); }
  }
  b13Opened() { if (!Net.isHost) return; const n = this.node('b13n'); if (n && !this.find('thing')) setTimeout(() => this.apparition({ pos: V(n.x - 2, n.y, n.z), dur: 3, cam: true, lucie: true }), 1500); }

  // ───────────────────────── braquage ─────────────────────────
  planRobbery(opts) {
    const g = this.game; if (this.robbery) return;
    const target = opts.target && g.world.shops[opts.target] ? opts.target : 'bijouterie';
    const delay = opts.window ? opts.window[0] + R() * (opts.window[1] - opts.window[0]) : 0;
    this.robbery = { target, state: 'planned', at: g.env.nightMinutes + delay, loot: 0, crew: [] };
    g.story.outcome.robbery = { result: null, reported: false, target, loot: 0 };
  }
  updateRobbery(dt) {
    const g = this.game; const Rb = this.robbery; if (!Rb) return;
    if (Rb.state === 'planned' && g.env.nightMinutes >= Rb.at) {
      Rb.state = 'arriving';
      const p = this.world.points.rampEnd || V(97, -0.2, -4.5);
      g.sim.emit('loopfx', { s: 'car_engine', pos: [p.x + 6, p.y + 0.5, p.z], v: 1, dur: 6, ref: 6 });
      for (let i = 0; i < 3; i++) { const e = this.spawn('robber', { p: [p.x + i * 0.8, p.y, p.z + (i - 1) * 0.8], yaw: -Math.PI / 2, v: i * 5 + 2, hp: 3 }); e.canForce = true; e.forceTime = 5; e.forceShutters = true; e.opensDoors = true; e.state = 'approach'; e.idx = i; Rb.crew.push(e.id); this.goTo(e, 'gar_gate', { cost: this.robberCost }); }
      setTimeout(() => g.sim.emit('say', { who: 'Voix (parking)', text: 'Pas un bruit. On entre, on prend, on sort. Cinq minutes.', voice: false }), 3000);
    }
  }
  robberSees(e) {
    const g = this.game;
    for (const pl of g.alivePlayers()) {
      if (pl.mode === 'hide' || pl.mode === 'desk' && pl.pos.distanceTo(e.pos) > 6) continue;
      const d = pl.pos.distanceTo(e.pos); if (d > 18) continue;
      const to = pl.pos.clone().sub(e.pos).normalize(); const f = V(Math.sin(e.yaw), 0, Math.cos(e.yaw));
      if (f.dot(to) < 0.2 && d > 3) continue;
      if (!this.litAt(pl.pos) && !pl.flashOn && d > 6) continue;
      if (this.los(e.chest, this.eyeOf(pl))) return pl;
    }
    return null;
  }
  get robberCost() { return (A, B) => { const ed = A.edges?.[B.id]; return ed?.shutter ? 8 : ed?.door ? 1.6 : 1; }; }
  ai_robber(e, dt) {
    const g = this.game; const Rb = this.robbery; if (!Rb) { this.despawn(e); return; }
    if (e.state === 'ko') { e.t -= dt; e.pose = 'dead'; e.speed = 0; if (e.t <= 0) { e.state = 'flee'; e.path = null; } return; }
    if (e.state === 'arrested') { e.pose = 'cheer'; e.speed = 0; return; }
    if (e.state === 'escorted') { if (!e.path) this.goTo(e, 'ramp2', { outside: true }); const r = this.follow(e, dt, 1.5); e.pose = 'walk'; if (r === 'arrived' || e.pos.x > 90) this.despawn(e); return; }
    const police = this.all('police').filter(p => p.state !== 'out');
    if (police.length && e.state !== 'flee' && e.state !== 'gone') { e.state = 'flee'; e.path = null; if (e.idx === 0) g.sim.emit('say', { who: 'Braqueur', text: 'Les flics ! On se casse !', voice: false }); }
    // réaction aux joueurs
    const seen = this.robberSees(e);
    if (seen && e.state !== 'flee') {
      if (seen.costume === 'police') { e.state = 'flee'; e.path = null; g.sim.emit('say', { who: 'Braqueur', text: 'Un flic ! Dégagez !', voice: false }); }
      else if (seen.costume === 'ghost' && !e.hesitated) { e.hesitated = true; e.wait = 5; g.sim.emit('say', { who: 'Braqueur', text: 'C\'est… c\'est quoi, ça ?', voice: false }); }
      else {
        e.yaw = turn(e.yaw, Math.atan2(seen.pos.x - e.pos.x, seen.pos.z - e.pos.z), dt * 8); e.pose = 'aim'; e.speed = 0;
        e.shotT = (e.shotT ?? 0.8) - dt;
        if (e.shotT <= 0) { e.shotT = 1.6 + R(); g.sim.emit('fx', { s: 'gunshot', pos: e.chest.toArray(), v: 1 }); g.sim.emit('flash', { pos: e.chest.toArray() }); g.noise(e.pos, 1, 'gunshot'); if (R() < 0.7) this.hurt(seen, { dmg: 22 + R() * 12, by: 'robbers', shake: 0.3, scare: 25 }); if (!e.yelled) { e.yelled = true; g.sim.emit('say', { who: 'Braqueur', text: pick(['Bouge pas !', 'Le gardien ! Descends-le !', 'Toi, tu restes où t\'es !']), voice: false }); } }
        return;
      }
    }
    if (e.wait > 0) { e.wait -= dt; e.speed = 0; e.pose = 'idle'; return; }
    const T = Rb.target;
    switch (e.state) {
      case 'approach': {
        const r = this.follow(e, dt, 1.8); e.pose = 'walk';
        if (r === 'arrived') {
          // dernier contrôle : lumières, police, alarme qui sonne → ils renoncent
          if (e.idx === 0 && Rb.state === 'arriving') {
            const ctl = g.world.shops[T]; const zid = typeof ctl?.zone === 'string' ? ctl.zone : ctl?.zone?.id || T;
            const galleryLit = this.world.zones.some(z => (z.area === 'gallery0' || z.area === 'gallery1') && z.circuit === 'gallery' && (z._level || 0) > 0.5 && z.distTo(ctl.x0 ?? 0, ctl.y ?? 0, ctl.zF ?? 0) < 2);
            if (g.lighting.isLit(zid) || galleryLit || this.all('police').length) { this.abortRobbery('Trop de lumière. On annule, on reviendra.'); return; }
            if (g.power.state.alarms?.[T]) { this.abortRobbery('L\'alarme de la boutique est armée. On laisse tomber.'); return; }
            Rb.state = 'inside';
          }
          e.state = 'tocase'; e.path = null;
        }
        break;
      }
      case 'tocase': {
        if (!e.path) {
          const pane = this.pickCase(e); const c = this.node(T + '_c');
          if (pane && c) { e.case = pane.id; const pc = pane.mesh.position.clone().setY(c.y); const dir = V(c.x, c.y, c.z).sub(pc).setY(0); const dl = dir.length(); const dest = dl > 0.01 ? pc.addScaledVector(dir, Math.min(0.9, dl) / dl) : pc; this.goTo(e, dest, { cost: this.robberCost }); }
          else this.goTo(e, T + '_c', { cost: this.robberCost });
        }
        const r = this.follow(e, dt, 1.8); e.pose = 'walk';
        if (r === 'blocked' && e.blockT > 10) { e.path = null; e.blockT = 0; this.goTo(e, T + '_c'); }
        if (r === 'arrived') { e.state = 'steal'; e.t = 14 + R() * 8; const pane = this.world.get(e.case); if (pane && !pane.state.broken) pane.smash(null, 8); }
        break;
      }
      case 'steal': {
        e.pose = 'reach'; e.speed = 0; e.t -= dt;
        const alarm = g.alarms.sirens?.has(T);
        if (R() < dt * 0.6) { const jw = g.props.inZone(T).filter(p => p.def.use === 'jewel' || p.def.value); const it = jw.length ? pick(jw) : null; if (it) { it.set({ where: 'gone' }); Rb.loot += it.def.value || 150; g.sim.emit('fx', { s: 'pickup', pos: it.state.pos, v: 0.5 }); } else Rb.loot += 80; }
        if (e.t <= 0 || (alarm && e.t > 3)) { if (alarm && !Rb.alarmed) { Rb.alarmed = true; g.sim.emit('say', { who: 'Braqueur', text: 'L\'alarme ! On a ce qu\'il faut, on dégage !', voice: false }); } e.cases = (e.cases || 0) + 1; e.state = Rb.loot > 5000 || alarm || e.cases >= 3 || R() < 0.2 ? 'flee' : 'tocase'; e.path = null; }
        break;
      }
      case 'flee': {
        if (!e.path) this.goTo(e, 'ramp2', { outside: true, cost: this.robberCost });
        const r = this.follow(e, dt, 3.4); e.pose = 'run';
        if (r === 'arrived' || e.pos.x > 90) { e.state = 'gone'; this.despawn(e); this.checkRobberyEnd(); }
        if (r === 'blocked' && e.blockT > 6) { e.path = null; e.blockT = 0; }
        break;
      }
    }
  }
  pickCase(e) {
    const ctl = this.world.shops[this.robbery.target]; if (!ctl) return null;
    const panes = (ctl.glass || []).filter(p => !p.state.broken && p.o?.lockable !== false && p.o?.case !== false);
    const inner = panes.filter(p => p.o?.case || p.o?.lockable); const list = inner.length ? inner : panes;
    return list.length ? list[(e.idx || 0) % list.length] : null;
  }
  abortRobbery(line) {
    const g = this.game; const Rb = this.robbery; Rb.state = 'aborted';
    g.story.outcome.robbery.result = 'aborted';
    g.sim.emit('say', { who: 'Voix (parking)', text: line, voice: false });
    for (const id of Rb.crew) { const e = this.list.get(id); if (e) { e.state = 'flee'; e.path = null; } }
    g.hooks.emit('robbery_aborted');
  }
  checkRobberyEnd() {
    const g = this.game; const Rb = this.robbery; if (!Rb || Rb.done) return;
    const out = g.story.outcome.robbery; if (!out) return; out.loot = Rb.loot;
    if (Rb.state === 'aborted') { if (!Rb.crew.some(id => this.list.has(id))) Rb.done = true; return; }
    const crew = Rb.crew.map(id => this.list.get(id)).filter(Boolean);
    if (!crew.length && Rb.crew.length) { if (out.result !== 'arrested') out.result = Rb.loot > 0 ? 'success' : 'escaped'; Rb.done = true; return; }
    const caught = crew.filter(e => e.state === 'arrested' || e.state === 'escorted' || e.state === 'ko');
    const loose = crew.filter(e => !caught.includes(e));
    if (!loose.length && caught.length && this.all('police').length && out.result !== 'arrested') { out.result = 'arrested'; out.loot = 0; }
  }
  // ───────────────────────── police, pompiers, livreur ─────────────────────────
  spawnPolice(info) {
    const g = this.game; const p = this.world.points.entranceOutside || V(84, 0, 0);
    for (let i = 0; i < 2; i++) { const e = this.spawn('police', { p: [p.x + 1 + i, 0, p.z + (i ? 1 : -1)], yaw: -Math.PI / 2, talk: true, name: 'Policier', v: i * 3 + 1 }); e.state = 'wait'; e.t = 0; e.idx = i; e.opensDoors = true; }
    g.sim.emit('loopfx', { s: 'police_siren', pos: [p.x + 8, 1, p.z], v: 0.8, dur: 8, ref: 8 });
  }
  ai_police(e, dt) {
    const g = this.game; const ent = g.power.state.mainEntrance || g.world.doors?.entry_a?.state.open;
    const Rb = this.robbery && this.robbery.state !== 'aborted' && this.robbery.state !== 'planned' ? this.robbery : null;
    if (e.state === 'wait') {
      e.t += dt; e.pose = 'idle'; e.speed = 0;
      if (ent) { e.state = 'enter'; this.goTo(e, 'ent'); return; }
      if (Rb && e.t > 40) { const d = g.world.doors?.entry_a; if (d && e.idx === 0) { d.set({ locked: false, open: 1, broken: true }); g.sim.emit('fx', { s: 'glass_shatter_big', pos: d.pos.toArray(), v: 1 }); g.sim.emit('say', { who: 'Police', text: 'On entre en force !' }); } e.state = 'enter'; this.goTo(e, 'ent'); return; }
      if (e.t > 90) { if (e.idx === 0) g.sim.emit('say', { who: 'Police', text: 'Personne ne nous ouvre. On repart, on note ça dans le rapport.' }); e.state = 'out'; e.path = null; }
      return;
    }
    if (e.state === 'enter' || e.state === 'chase') {
      // cible : braqueurs encore libres, sinon tour du centre
      const crew = Rb ? Rb.crew.map(id => this.list.get(id)).filter(r => r && r.state !== 'arrested' && r.state !== 'gone') : [];
      let t = null, bd = 1e9; for (const r of crew) { const d = r.pos.distanceTo(e.pos); if (d < bd) { bd = d; t = r; } }
      if (t) {
        e.state = 'chase';
        if (bd < 2.2) { t.state = 'arrested'; t.pose = 'cheer'; g.sim.emit('say', { who: 'Police', text: 'Police ! Les mains en l\'air !' }); this.onArrest(); return; }
        if ((e.repath -= dt) <= 0 || !e.path) { e.repath = 1.5; this.goTo(e, t.pos); }
        if (bd < 6) { this.stepTo(e, t.pos, dt, 3.6); e.speed = 3.6; e.pose = 'run'; return; }
        this.follow(e, dt, 3.4); e.pose = 'run'; return;
      }
      const r = this.follow(e, dt, 1.6); e.pose = 'flashlight';
      if (r === 'arrived') { e.patrol = (e.patrol || 0) + 1; if (e.patrol > 3) { e.state = 'out'; e.path = null; if (e.idx === 0) g.sim.emit('say', { who: 'Police', text: Rb ? 'C\'est réglé. Bonne fin de nuit.' : 'Rien à signaler. Bonne nuit, et évitez de nous déranger pour rien.' }); } else this.goTo(e, pick(['g0n-27', 'g0s27', 'g0n45', 'g0s-45', (Rb?.target || 'jouets') + '_c'])); }
      if (r === 'blocked' && e.blockT > 5) e.path = null;
      return;
    }
    if (e.state === 'out') {
      // emmènent les braqueurs arrêtés
      for (const r of this.all('robber')) if (r.state === 'arrested' && r.pos.distanceTo(e.pos) < 4) { r.path = null; this.goTo(r, 'ramp2', { outside: true }); r.state = 'escorted'; }
      if (!e.path) this.goTo(e, 'ent_door');
      const r = this.follow(e, dt, 1.6); e.pose = 'walk';
      if (r === 'arrived' || e.pos.x > 80) this.despawn(e);
    }
  }
  onArrest() {
    const g = this.game; const Rb = this.robbery; if (!Rb) return;
    const crew = Rb.crew.map(id => this.list.get(id)).filter(Boolean);
    if (crew.every(r => r.state === 'arrested' || r.state === 'ko' || r.state === 'escorted')) { g.story.outcome.robbery.result = 'arrested'; g.story.outcome.robbery.loot = 0; g.sim.emit('toast', { text: 'Les braqueurs sont arrêtés.' }); for (const p of this.all('police')) { p.state = 'out'; p.path = null; } }
  }
  ai_escorted() { }
  spawnFiremen() {
    const g = this.game; const p = this.world.points.entranceOutside || V(84, 0, 0);
    this.setEntrance(true); g.power.set({ mainEntrance: true });
    for (let i = 0; i < 3; i++) { const e = this.spawn('fireman', { p: [p.x + i, 0, p.z + (i - 1)], yaw: -Math.PI / 2, talk: true, name: 'Pompier', v: i }); e.state = 'go'; e.canForce = true; e.forceTime = 2; e.opensDoors = true; e.ignoreShutters = true; }
    g.sim.emit('loopfx', { s: 'fire_truck', pos: [p.x + 8, 1, p.z], v: 0.9, dur: 10, ref: 8 });
  }
  ai_fireman(e, dt) {
    const g = this.game;
    if (e.state === 'go') {
      if (!g.fire.active) { e.state = 'out'; e.path = null; return; }
      const c = g.fire.biggest(); if (!e.path) this.goTo(e, c.pos);
      const r = this.follow(e, dt, 2.6); e.pose = 'run';
      if (r === 'arrived' || e.pos.distanceTo(c.pos) < 4) { e.state = 'spray'; }
      if (r === 'blocked' && e.blockT > 6) { e.path = null; e.blockT = 0; }
      return;
    }
    if (e.state === 'spray') {
      if (!g.fire.active) { e.state = 'out'; e.path = null; g.sim.emit('say', { who: 'Pompier', text: 'C\'est éteint. Pensez à vérifier vos installations électriques !' }); return; }
      const c = g.fire.biggest(); e.yaw = turn(e.yaw, Math.atan2(c.pos.x - e.pos.x, c.pos.z - e.pos.z), dt * 5); e.pose = 'aim'; e.speed = 0;
      e.sprT = (e.sprT || 0) - dt; if (e.sprT <= 0) { e.sprT = 0.4; g.sim.emit('foam', { pos: c.pos.toArray() }); g.fire.extinguish(e.chest, c.pos.clone().sub(e.chest).normalize(), 0.5); }
      return;
    }
    if (e.state === 'out') { if (!e.path) this.goTo(e, 'ent_door'); const r = this.follow(e, dt, 1.7); e.pose = 'walk'; if (r === 'arrived' || e.pos.x > 80) this.despawn(e); }
  }
  spawnVisitor(kind = 'pizza') {
    const p = this.world.points.entranceOutside || V(84, 0, 0);
    const e = this.spawn('visitor', { p: [p.x + 0.5, 0, p.z + 0.5], yaw: -Math.PI / 2, talk: true, name: 'Livreur de pizza', v: 9 }); if (e) { e.state = 'wait'; e.t = 0; e.opensDoors = true; }
  }
  ai_visitor(e, dt) {
    const g = this.game;
    if (e.state === 'wait') {
      e.t += dt; e.speed = 0; e.pose = 'idle';
      if (g.power.state.mainEntrance || g.world.doors?.entry_a?.state.open) { e.state = 'enter'; this.goTo(e, 'ent'); return; }
      if (e.t > 110) { const p = this.world.points.entranceOutside; this.game.props.spawn('pizza_box', [p.x - 1.2, 0.05, p.z], { vel: [0, 0, 0] }); g.sim.emit('say', { who: 'Livreur', text: 'Bon… je vous la laisse devant la porte !' }); e.state = 'out'; e.path = null; }
      return;
    }
    if (e.state === 'enter') { const r = this.follow(e, dt, 1.4); e.pose = 'walk'; if (r === 'arrived') { e.state = 'deliver'; e.t = 0; } return; }
    if (e.state === 'deliver') {
      e.t += dt; e.speed = 0; e.pose = 'reach';
      const pl = g.alivePlayers().find(p => p.pos.distanceTo(e.pos) < 3.5);
      if (pl) { this.deliverPizza(e, pl); return; }
      if (e.t > 60) { this.game.props.spawn('pizza_box', [e.pos.x, 0.05, e.pos.z + 0.6], { vel: [0, 0, 0] }); g.sim.emit('say', { who: 'Livreur', text: 'Je la pose sur le banc. Bonne nuit !' }); e.state = 'out'; e.path = null; }
      return;
    }
    if (e.state === 'out') { if (!e.path) this.goTo(e, this.world.points.entranceOutside, { outside: true }); const r = this.follow(e, dt, 1.5); e.pose = 'walk'; if (r === 'arrived' || e.pos.x > 85) this.despawn(e); }
  }
  deliverPizza(e, pl) {
    if (e.delivered) return; e.delivered = true;
    const g = this.game; g.props.giveNew('pizza_box', pl.id); g.sim.emit('say', { who: 'Livreur', text: 'Et voilà, une margherita ! Bon courage pour la nuit, hein. C\'est flippant, votre centre.' });
    e.state = 'out'; e.path = null; g.flagInc('pizzas');
  }

  // ───────────────────────── petites présences ─────────────────────────
  balloon(pos) {
    if (!Net.isHost) return;
    const gr = this.world.physics.groundAt(pos.x, pos.z, pos.y + 1); const y = gr && gr.y > -Infinity ? gr.y : pos.y - 1;
    const e = this.spawn('balloon', { p: [pos.x, y, pos.z], life: 45 + R() * 30 }); if (e) { e.vel = V((R() - 0.5) * 0.8, 0, (R() - 0.5) * 0.4); }
  }
  ai_balloon(e, dt) {
    e.vel = e.vel || V(0.3, 0, 0);
    const n = e.pos.clone().addScaledVector(e.vel, dt);
    if (this.world.physics.raycast(e.pos.x, e.pos.y + 1.5, e.pos.z, Math.sign(e.vel.x) || 1, 0, 0, Math.abs(e.vel.x * dt) + 0.3) || !this.world.zoneAt(n.x, n.y + 1, n.z)) { e.vel.multiplyScalar(-1); return; }
    e.pos.copy(n); e.speed = 0; e.yaw += dt * 0.3;
  }
  rats(zoneId) {
    if (!Net.isHost) return; const z = this.world.zone(zoneId) || this.world.zone('westwingB'); if (!z) return;
    for (let i = 0; i < 5; i++) { const p = z.randomPoint(R, 0.5); const e = this.spawn('rat', { p: [p.x, z.min[1], p.z], yaw: R() * 6, life: 10 + R() * 6 }); if (e) e.zoneId = z.id; }
    this.game.sim.emit('fx', { s: 'rat_squeak', pos: z.center.toArray(), v: 0.8 });
  }
  ai_rat(e, dt) {
    if (!e.goal || e.pos.distanceTo(e.goal) < 0.2) { const z = this.world.zone(e.zoneId); e.goal = z ? z.randomPoint(R, 0.4).setY(e.pos.y) : e.pos.clone(); }
    this.stepTo(e, e.goal, dt, 2.8); e.speed = 2.8; e.pose = 'run';
  }
  spawnBobbyGlimpse(pos) {
    if (!Net.isHost || this.find('bobby')) return;
    const a = R() * Math.PI * 2; const p = pos.clone().add(V(Math.cos(a) * 9, 0, Math.sin(a) * 9));
    const gr = this.world.physics.groundAt(p.x, p.z, pos.y + 1); if (gr && gr.y > -Infinity) p.y = gr.y;
    const e = this.spawn('bobby', { p: p.toArray(), yaw: Math.atan2(pos.x - p.x, pos.z - p.z), life: 2.2 }); if (e) e.state = 'glimpse';
  }
  moveThing(what) {
    const g = this.game; const W = this.world; if (!Net.isHost) return;
    const unseen = (pos) => !g.alivePlayers().some(pl => pl.pos.distanceTo(pos) < 12);
    switch (what) {
      case 'dolls_face_cam': case 'wigheads_face': {
        const def = what === 'dolls_face_cam' ? 'doll' : 'wig_head'; const zone = what === 'dolls_face_cam' ? 'jouets' : 'coiffeur';
        const cam = W.cameras.find(c => c.zone === zone || c.shop === zone);
        const props = g.props.inZone(zone).filter(p => p.defId === def).slice(0, 12);
        for (const p of props) { const pos = V(...p.state.pos); const tgt = cam ? cam.pos : g.player.pos; const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(tgt.x - pos.x, tgt.z - pos.z), 0)); p.set({ where: 'world', pos: p.state.pos, quat: [q.x, q.y, q.z, q.w] }); }
        break;
      }
      case 'mannequin_extra': case 'mannequin_gallery': {
        const dev = g.devices.kind('mannequin').find(d => !d.state.away); if (!dev) return;
        let p;
        if (what === 'mannequin_gallery') { const ns = [...this.nav.nodes.values()].filter(n => /^g0[ns]/.test(n.id)); for (let k = 0; k < 10; k++) { const n = pick(ns); if (unseen(V(n.x, n.y, n.z))) { p = V(n.x, n.y, n.z); break; } } }
        else { const z = W.zone('mode') || W.zone(dev.zone); p = z.randomPoint(R, 1.2).setY(z.min[1]); }
        if (!p) return;
        dev.set({ away: true });
        const sec = W.points.securityDoorOut; const e = this.spawn('mannequin', { p: p.toArray(), yaw: Math.atan2(sec.x - p.x, sec.z - p.z), pose: 'm' + Math.floor(R() * 4), dev: dev.id }); if (e) { e.state = 'statue'; }
        break;
      }
      case 'mannequin_fall': {
        const dev = g.devices.kind('mannequin').find(d => !d.state.away); if (!dev) return;
        dev.set({ away: true }); const c = dev.center; const e = this.spawn('mannequin', { p: [c.x, c.y - dev.def.s[1] / 2, c.z], yaw: dev.ry, pose: 'lie', dev: dev.id }); if (e) e.state = 'statue';
        g.sim.emit('fx', { s: 'thud', pos: c.toArray(), v: 1 }); g.noise(c, 0.6, 'thud');
        break;
      }
      case 'plush_to_desk': {
        const desk = W.points.deskTop; if (!unseen(desk)) return;
        g.props.spawn('bobby_plush', [desk.x + 0.2, desk.y + 0.2, desk.z - 0.4], { vel: null, quat: [0, 0.7071, 0, 0.7071] });
        break;
      }
      case 'vent_drop': {
        const grs = (W.ventGrates || []).filter(gr => gr.o.shop); const gr = grs.length ? pick(grs) : null; if (!gr) return;
        g.sim.emit('fx', { s: 'vent_bang', pos: [gr.o.x, gr.o.y, gr.o.z], v: 1 });
        if (!gr.state.open && !gr.state.taped) gr.set({ open: true });
        g.props.spawn(pick(['doll', 'teddy', 'bobby_plush']), [gr.o.x, gr.o.y - 0.3, gr.o.z], { vel: [0, -1, 0] });
        break;
      }
    }
  }
  ai_mannequin_static() { }

  // ───────────────────────── interactions ─────────────────────────
  hear(pos, loud = 0.5, kind = '') {
    if (!Net.isHost) return;
    for (const e of this.list.values()) {
      const d = e.pos.distanceTo(pos);
      if (e.type === 'cat' && ((loud > 0.6 && d < 15 && kind !== 'rc') || (kind === 'vacuum' && d < 8))) { e.flee = 3; e.path = null; this.goTo(e, e.pos.clone().add(e.pos.clone().sub(pos).setY(0).normalize().multiplyScalar(10))); }
      if ((e.type === 'bobby' || e.type === 'thing' || e.type === 'crawler') && d < loud * 35 && !e.flee) { e.repath = 0; e.heard = pos.clone(); if (e.type !== 'crawler' || !e.inVent) this.goTo(e, pos); }
      if (e.type === 'robber' && d < loud * 25 && e.state === 'steal' && loud > 0.6) e.t = Math.min(e.t, 2);
    }
  }
  repel(pos, r = 8, cat = false) {
    if (!Net.isHost) return;
    for (const e of this.list.values()) {
      if (e.pos.distanceTo(pos) > r) continue;
      if (e.type === 'cat') { if (cat || r >= 8) { e.flee = 5; e.path = null; this.goTo(e, e.pos.clone().add(e.pos.clone().sub(pos).setY(0).normalize().multiplyScalar(12))); this.game.sim.emit('fx', { s: 'hiss', pos: e.pos.toArray(), v: 0.7 }); } continue; }
      if (e.type === 'bobby' || e.type === 'crawler' || e.type === 'mannequin') { e.flee = 12; e.path = null; if (e.type === 'mannequin') { e.state = 'down'; e.t = 6; } }
      if (e.type === 'shadow') { e.pos.copy((this.darkZoneNear(pos) || this.world.zone('service_s0')).randomPoint(R, 1)); e.wait = 15; }
      if (e.type === 'robber' && e.state === 'steal') { e.t = Math.min(e.t, 1); }
    }
  }
  raycast(o, d, maxD = 2.2) {
    let best = null;
    for (const e of this.list.values()) {
      if (e.camOnly || e.type === 'balloon' || e.type === 'rat') continue;
      const r = e.type === 'cat' ? 0.3 : e.type === 'thing' ? 0.6 : 0.38; const h = e.h;
      // rayon contre cylindre vertical
      const ox = o.x - e.pos.x, oz = o.z - e.pos.z; const a = d.x * d.x + d.z * d.z; const b = 2 * (ox * d.x + oz * d.z); const c = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * c; if (disc < 0 || a < 1e-6) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0 || t > maxD) continue;
      const y = o.y + d.y * t; if (y < e.pos.y - 0.05 || y > e.pos.y + h + 0.1) continue;
      if (!best || t < best.t) best = { e, t, point: o.clone().addScaledVector(d, t) };
    }
    return best;
  }
  hit(e, dmg = 1, actor) {
    const g = this.game; if (!Net.isHost || !e) return;
    const pl = g.playerById(actor);
    switch (e.type) {
      case 'cat': this.catHater.add(actor); e.flee = 8; g.sim.emit('fx', { s: 'hiss', pos: e.pos.toArray(), v: 1 }); g.flagInc('cat_hit'); g.sim.emit('toast', { text: 'Le chat s\'enfuit en crachant. Il ne vous fera plus confiance cette nuit.' }, { to: actor }); break;
      case 'bobby': e.stun = 4; e.L = Math.min(1, (e.L || 0.4) + 0.1); g.sim.emit('fx', { s: 'squeak', pos: e.chest.toArray(), v: 1 }); break;
      case 'mannequin': e.state = 'down'; e.t = 8; g.sim.emit('fx', { s: 'hit_plastic', pos: e.chest.toArray(), v: 1 }); break;
      case 'robber': e.hp -= dmg; if (e.hp <= 0) { e.state = 'ko'; e.t = 90; g.sim.emit('say', { who: 'Braqueur', text: 'Aaargh…', voice: false }); this.onArrest(); } else { e.shotT = 0.3; } break;
      case 'crawler': e.flee = 8; e.path = null; g.sim.emit('fx', { s: 'scream', pos: e.chest.toArray(), v: 0.8 }); break;
      case 'thing': g.sim.emit('fx', { s: 'low_boom', pos: e.chest.toArray(), v: 0.6 }); break;
      case 'shopper': case 'keeper': case 'gerard': case 'visitor': case 'fireman':
        g.sim.emit('dialogue', { who: e.o.name || 'Quelqu\'un', text: pick(['Aïe ! Mais ça va pas ?!', 'Hé ! Je vais me plaindre à la direction !', 'Vous êtes malade ou quoi ?']) });
        g.story.stats.suspicion = (g.story.stats.suspicion || 0) + 1; g.story.stats.warn = 'On m\'a signalé que vous aviez frappé quelqu\'un. Je ne veux plus jamais entendre ça.'; break;
      case 'police': g.sim.emit('say', { who: 'Police', text: 'Outrage et violence sur agent ! Vous nous suivez !' }); g.story.stats.pranks = (g.story.stats.pranks || 0) + 5; g.story.fail('Vous avez frappé un policier. Garde à vue, et licenciement.'); break;
    }
  }
  // Flash d'appareil photo : éblouit ce qui est en face
  flashStun(pos, dir) {
    if (!Net.isHost) return;
    for (const e of this.list.values()) {
      const to = e.chest.sub(pos); const d = to.length(); if (d > 9 || d < 0.01) continue;
      if (dir.dot(to.divideScalar(d)) < 0.75 || !this.los(pos, e.chest)) continue;
      if (e.type === 'bobby') e.stun = 3;
      else if (e.type === 'mannequin') { e.wait = Math.max(e.wait || 0, 5); e.frozenPose = 'm' + Math.floor(R() * 4); }
      else if (e.type === 'shadow') { const z = this.darkZoneNear(pos) || this.world.zone('service_s0'); const p = z.randomPoint(R, 1); e.pos.set(p.x, z.min[1], p.z); e.path = null; e.wait = 10; }
      else if (e.type === 'crawler') { e.flee = 6; e.path = null; }
      else if (e.type === 'robber') { e.wait = 2.5; }
      else if (e.type === 'cat') { e.flee = 3; e.path = null; }
      else if (e.type === 'thing') { e.wait = 1.5; }
    }
  }
  actors() {
    const out = [];
    for (const e of this.list.values()) { if (e.type === 'shopper' || e.type === 'keeper') continue; out.push({ pos: e.pos, kind: e.type, h: e.h * 0.6, moving: e.speed > 0.2 || e.type === 'balloon', cam: !e.irOnly }); }
    return out;
  }
  stressNear(pl) {
    let s = 0; const p = pl.pos;
    for (const e of this.list.values()) {
      if (!HOSTILE.has(e.type) && e.type !== 'lucie') continue;
      const d = e.pos.distanceTo(p); if (d > 14) continue;
      s += (1 - d / 14) * (e.type === 'thing' ? 6 : e.type === 'shadow' ? 4 : e.type === 'robber' ? 3 : 2.5);
    }
    return s;
  }
  coldAt(pos) {
    let c = 0;
    for (const e of this.list.values()) {
      if (e.type === 'shadow' || e.type === 'lucie') { const d = e.pos.distanceTo(pos); if (d < 7) c += (1 - d / 7) * 0.7; }
      else if (e.type === 'thing') { const d = e.pos.distanceTo(pos); if (d < 12) c += 1 - d / 12; }
    }
    return Math.min(1, c);
  }
}
