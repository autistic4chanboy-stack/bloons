// Catalogue de tous les objets du centre commercial.
// Chaque objet : {id, name, shape, s:[w,h,d], c:couleur, c2, label, mat, use, p:{params}, desc, fixed, value}
// mat : matériau d'impact (son) — plastic|metal|wood|glass|cardboard|soft|paper|can|ceramic
// use : comportement (voir js/world/behaviors.js et le wiki)

export const ITEMS = {};

function d(id, name, shape, s, c, mat, use, o = {}) {
  ITEMS[id] = Object.assign({ id, name, shape, s, c, mat, use }, o);
}
const F = { fixed: true };

// ───────────────────────── OUTILS & ÉQUIPEMENT DU GARDIEN ─────────────────────────
d('flashlight', 'Lampe torche', 'flashlight', [0.05, 0.05, 0.22], 0x222222, 'metal', 'flashlight', { p: { kind: 'basic' }, desc: 'La vieille lampe de Gérard. Fiable, un peu faible.' });
d('flashlight_tac', 'Lampe tactique', 'flashlight', [0.06, 0.06, 0.28], 0x111111, 'metal', 'flashlight', { p: { kind: 'tactical' }, desc: 'Faisceau puissant et large. Vide les piles deux fois plus vite.' });
d('flashlight_uv', 'Lampe UV', 'flashlight', [0.045, 0.045, 0.2], 0x3a1d6e, 'plastic', 'flashlight', { p: { kind: 'uv' }, desc: 'Lumière noire. Révèle ce qui est écrit à l\'encre invisible…' });
d('headlamp', 'Lampe frontale', 'headlamp', [0.18, 0.06, 0.18], 0x1a5c2a, 'plastic', 'flashlight', { p: { kind: 'headlamp' }, desc: 'Garde les mains libres. Faisceau étroit.' });
d('battery', 'Piles AA', 'battery', [0.04, 0.06, 0.02], 0xd4a017, 'metal', 'battery', { desc: 'Recharge la lampe torche (touche R).' });
d('powerbank', 'Batterie externe', 'box', [0.07, 0.02, 0.14], 0x333333, 'plastic', 'battery', { p: { amount: 2 }, desc: 'Recharge complètement la lampe et le portable.' });
d('keys', 'Trousseau de clés', 'keys', [0.08, 0.02, 0.08], 0xc0a060, 'metal', 'keys', { desc: 'Ouvre les portes de service, le poste et les magasins débloqués.' });
d('master_key', 'Passe-partout', 'keys', [0.08, 0.02, 0.08], 0xffd700, 'metal', 'keys', { p: { master: true }, desc: 'Le passe du directeur. Ouvre absolument tout… sauf B-13.' });
d('lockpick', 'Crochet de serrurier', 'lockpick', [0.12, 0.01, 0.02], 0x888888, 'metal', 'lockpick', { desc: 'Pour crocheter serrures et caisses. Mal utilisé, il laisse des rayures.' });
d('padlock', 'Cadenas', 'padlock', [0.06, 0.08, 0.025], 0xb8860b, 'metal', 'padlock', { desc: 'À poser sur une porte (E). Ralentit fortement les intrus.' });
d('crowbar', 'Pied-de-biche', 'stick', [0.03, 0.03, 0.6], 0xb02020, 'metal', 'melee', { p: { dmg: 3, breaks: true, pry: true }, desc: 'Un classique. Casse les vitres, force les portes.' });
d('hammer', 'Marteau', 'hammer', [0.12, 0.3, 0.04], 0x5a3a1a, 'metal', 'melee', { p: { dmg: 2, breaks: true }, desc: 'Brise-vitre improvisé.' });
d('screwdriver', 'Tournevis', 'stick', [0.02, 0.02, 0.22], 0xe0c020, 'metal', 'tool', { p: { tool: 'screw' }, desc: 'Dévisse les grilles d\'aération.' });
d('wrench', 'Clé à molette', 'stick', [0.04, 0.015, 0.25], 0x9a9a9a, 'metal', 'melee', { p: { dmg: 2, tool: 'wrench' }, desc: 'Resserre les tuyaux qui cognent. Ou autre chose.' });
d('drill', 'Perceuse', 'drill', [0.08, 0.22, 0.2], 0x2f7a2f, 'plastic', 'loopdevice', { p: { sound: 'drill', tool: 'drill', hold: true }, desc: 'Perce un cadenas en quelques secondes. Très bruyant.' });
d('saw', 'Scie', 'stick', [0.12, 0.01, 0.5], 0xaaaaaa, 'metal', 'melee', { p: { dmg: 2 }, desc: 'Scie égoïne.' });
d('duct_tape', 'Rouleau de scotch', 'tape', [0.1, 0.05, 0.1], 0x8a8a8a, 'plastic', 'tape', { p: { uses: 3 }, desc: 'Scelle une grille d\'aération ou masque l\'objectif d\'une caméra.' });
d('extinguisher', 'Extincteur', 'extinguisher', [0.16, 0.5, 0.16], 0xcc1111, 'metal', 'extinguisher', { p: { charge: 30 }, desc: 'Maintenir le clic gauche pour éteindre un feu. 30 secondes de charge.' });
d('fuel_can', 'Jerrican d\'essence', 'jerrycan', [0.2, 0.3, 0.12], 0xc8102e, 'metal', 'fuel', { p: { amount: 50 }, desc: 'Remplit le réservoir du groupe électrogène.' });
d('fuse', 'Fusible', 'battery', [0.03, 0.08, 0.03], 0xe8e8e8, 'ceramic', 'fuse', { desc: 'Remplace un fusible grillé du tableau électrique.' });
d('bulb', 'Ampoule', 'bulb', [0.06, 0.1, 0.06], 0xfff8dd, 'glass', 'bulb', { desc: 'Pour remplacer une ampoule grillée.' });
d('motion_sensor', 'Détecteur de mouvement', 'sensor', [0.08, 0.1, 0.05], 0xf0f0f0, 'plastic', 'place_sensor', { desc: 'À poser (clic gauche). Alerte le poste de sécurité. Le chat le déclenche aussi…' });
d('portable_cam', 'Caméra portative', 'camera', [0.1, 0.08, 0.14], 0x222222, 'plastic', 'place_cam', { desc: 'À poser n\'importe où (clic gauche). Apparaît dans le système CCTV.' });
d('webcam', 'Webcam', 'camera', [0.06, 0.05, 0.05], 0x111111, 'plastic', 'place_cam', { desc: 'Une petite caméra USB. Se connecte au réseau CCTV.' });
d('rc_car', 'Voiture télécommandée', 'rccar', [0.25, 0.1, 0.4], 0xd01818, 'plastic', 'rc_car', { desc: 'Pose-la puis pilote-la depuis le poste (onglet RC) ou avec la télécommande. On peut y fixer une caméra.' });
d('rc_remote', 'Télécommande RC', 'remote', [0.12, 0.06, 0.1], 0x333333, 'plastic', 'rc_remote', { desc: 'Pilote la voiture télécommandée en vue caméra.' });
d('walkie', 'Talkie-walkie', 'walkie', [0.06, 0.16, 0.03], 0x222222, 'plastic', 'walkie', { desc: 'Grésille. Parfois, quelqu\'un répond.' });
d('mobile_phone', 'Téléphone portable', 'phone', [0.07, 0.14, 0.01], 0x111111, 'plastic', 'mobile', { desc: 'Appelle n\'importe quel numéro depuis n\'importe où. Fait aussi lampe (faible).' });
d('tablet', 'Tablette de surveillance', 'tablet', [0.24, 0.17, 0.01], 0x1a1a1a, 'plastic', 'tablet', { desc: 'Une fois configurée sur le PC du poste, affiche les caméras partout.' });
d('polaroid', 'Appareil photo instantané', 'camera', [0.14, 0.1, 0.1], 0xeeeeee, 'plastic', 'polaroid', { p: { shots: 10 }, desc: 'Prend une vraie photo. Parfois, il y a quelqu\'un en plus sur la photo.' });
d('photo', 'Photo', 'card', [0.09, 0.11, 0.003], 0xffffff, 'paper', 'photo', { desc: 'Une photo instantanée.' });
d('cash', 'Liasse de billets', 'cash', [0.15, 0.02, 0.07], 0x4a8a4a, 'paper', 'cash', { value: 200, desc: 'De l\'argent. Pas le vôtre.' });
d('coin', 'Pièce de 2 €', 'coin', [0.026, 0.003, 0.026], 0xd4af37, 'metal', 'coin', { value: 2, desc: 'Pour les machines. Ou pour faire un vœu dans la fontaine.' });
d('token', 'Jeton d\'arcade', 'coin', [0.026, 0.003, 0.026], 0xb08d57, 'metal', 'coin', { value: 0, p: { token: true }, desc: 'Fonctionne sur les bornes de la Galaxy Arcade.' });
d('ladder', 'Escabeau', 'ladder', [0.5, 1.6, 0.12], 0xb8b8b8, 'metal', 'ladder', { mass: 8, desc: 'À poser (clic gauche) sous une grille au plafond pour y grimper.' });
d('rope', 'Corde', 'rope', [0.2, 0.08, 0.2], 0xa08050, 'soft', 'generic', { desc: 'Dix mètres de corde. On ne sait jamais.' });
d('paint_can', 'Pot de peinture', 'can', [0.18, 0.2, 0.18], 0x2266cc, 'metal', 'paint', { desc: 'Lancez-le : éclaboussure garantie.' });
d('nails', 'Boîte de clous', 'box', [0.1, 0.06, 0.06], 0x777777, 'metal', 'scatter', { p: { trap: true }, desc: 'Répandez-les au sol : piège bruyant pour qui marche dessus.' });
d('measuring_tape', 'Mètre ruban', 'box', [0.07, 0.07, 0.04], 0xffcc00, 'plastic', 'measure', { desc: 'Mesure la distance jusqu\'à ce que vous visez.' });
d('chain', 'Chaîne', 'rope', [0.2, 0.05, 0.2], 0x666666, 'metal', 'padlock', { p: { strong: true }, desc: 'Chaîne + cadenas : quasiment inviolable.' });
d('lighter', 'Briquet', 'box', [0.025, 0.07, 0.012], 0xcc2222, 'plastic', 'lighter', { desc: 'Petite flamme vacillante. Allume les bougies.' });
d('candle', 'Bougie', 'candle', [0.06, 0.12, 0.06], 0xf5f0e0, 'soft', 'candle', { desc: 'À poser et allumer avec un briquet. Lumière chaude.' });
d('matches', 'Allumettes', 'box', [0.05, 0.015, 0.035], 0xaa3322, 'cardboard', 'lighter', { p: { matches: 10 }, desc: 'Dix allumettes.' });

// ───────────────────────── ROYAUME DU JOUET ─────────────────────────
d('teddy', 'Ours en peluche', 'plush', [0.25, 0.32, 0.18], 0x9c6b3e, 'soft', 'squeak', { p: { sound: 'squeak' }, desc: 'Doux et câlin. Il couine quand on le serre.' });
d('bobby_plush', 'Peluche Bobby l\'Ourson', 'plush', [0.3, 0.38, 0.22], 0xc8873a, 'soft', 'bobby', { label: 'BOBBY', desc: 'La mascotte du Royaume du Jouet. Serrez-le… il dit « Tu restes avec moi ? »' });
d('bunny_plush', 'Lapin en peluche', 'plush', [0.2, 0.34, 0.15], 0xeeeeee, 'soft', 'squeak', { p: { sound: 'squeak', pitch: 1.3 } });
d('dino_plush', 'Dinosaure en peluche', 'plush', [0.3, 0.25, 0.18], 0x4caf50, 'soft', 'squeak', { p: { sound: 'squeak', pitch: 0.7 }, desc: 'RAAAWR (couine).' });
d('cat_plush', 'Chat en peluche', 'plush', [0.2, 0.22, 0.15], 0x333333, 'soft', 'squeak', { p: { sound: 'meow' }, desc: 'Fait miaou. Le chat errant le déteste.' });
d('robot', 'Robot mécanique', 'robot', [0.12, 0.22, 0.1], 0xa0a8b0, 'metal', 'toy_walk', { p: { sound: 'toy_robot', speed: 0.25 }, desc: 'Remontez-le, posez-le : il marche tout seul. Les yeux s\'allument.' });
d('toy_car', 'Petite voiture', 'toycar', [0.08, 0.05, 0.14], 0x1565c0, 'metal', 'toy_roll', { p: { speed: 2.5 }, desc: 'Tirez en arrière et lâchez : elle file.' });
d('doll', 'Poupée parlante', 'doll', [0.12, 0.35, 0.08], 0xf2c6b4, 'plastic', 'doll', { desc: 'Appuyez sur son ventre. Elle connaît 12 phrases. Parfois 13.' });
d('porcelain_doll', 'Poupée de porcelaine', 'doll', [0.12, 0.3, 0.08], 0xf8f0ea, 'ceramic', 'doll', { p: { creepy: true }, desc: 'Ses yeux suivent la lumière.' });
d('jack_box', 'Diable en boîte', 'jackbox', [0.14, 0.14, 0.14], 0xe53935, 'wood', 'jack', { desc: 'Tournez la manivelle… attendez… attendez…' });
d('ball', 'Balle rebondissante', 'ball', [0.06, 0.06, 0.06], 0xff4081, 'plastic', 'ball', { p: { bounce: 0.92 }, desc: 'Rebondit presque indéfiniment.' });
d('beach_ball', 'Ballon de plage', 'ball', [0.4, 0.4, 0.4], 0xffeb3b, 'soft', 'ball', { p: { bounce: 0.6, light: true } });
d('music_box', 'Boîte à musique', 'musicbox', [0.12, 0.08, 0.09], 0x8d5524, 'wood', 'music_box', { desc: 'Joue « Au clair de la lune ». Ne la laissez pas jouer seule la nuit.' });
d('spinning_top', 'Toupie', 'top', [0.07, 0.08, 0.07], 0xff7043, 'metal', 'top', { desc: 'Posez-la et lancez-la (clic gauche).' });
d('yoyo', 'Yo-yo', 'yoyo', [0.06, 0.03, 0.06], 0x7e57c2, 'plastic', 'yoyo');
d('rubik', 'Cube magique', 'rubik', [0.06, 0.06, 0.06], 0xffffff, 'plastic', 'rubik', { desc: 'Clic gauche pour tourner une face. Résolu ? Bonne chance.' });
d('xylophone', 'Xylophone', 'xylo', [0.3, 0.05, 0.12], 0xffffff, 'wood', 'xylo', { desc: 'Chaque clic joue la note suivante de la gamme.' });
d('toy_drum', 'Tambour', 'drum', [0.2, 0.14, 0.2], 0xd32f2f, 'wood', 'toy_drum');
d('dart_gun', 'Pistolet à fléchettes', 'gun', [0.04, 0.12, 0.2], 0xff9800, 'plastic', 'dart_gun', { p: { ammo: 12 }, desc: 'Tire des fléchettes en mousse qui déclenchent les détecteurs à distance.' });
d('bubble_gun', 'Pistolet à bulles', 'gun', [0.05, 0.12, 0.18], 0x29b6f6, 'plastic', 'bubbles', { desc: 'Des bulles de savon. Elles révèlent les courants d\'air… et ce qui bouge dedans.' });
d('toy_horn', 'Trompette jouet', 'horn', [0.05, 0.05, 0.25], 0xffd600, 'plastic', 'toy_horn');
d('dice', 'Gros dé en mousse', 'dice', [0.08, 0.08, 0.08], 0xffffff, 'soft', 'dice', { desc: 'Lancez-le (clic droit). Le résultat s\'affiche quand il s\'arrête.' });
d('lego', 'Boîte de briques', 'labelbox', [0.3, 0.2, 0.08], 0xffcc00, 'cardboard', 'scatter', { label: 'BRIQUES 1000', p: { trap: true, lego: true }, desc: 'Renversez-les par terre. Quiconque marche dessus le regrettera (vous aussi).' });
d('puzzle', 'Puzzle 1000 pièces', 'labelbox', [0.35, 0.06, 0.25], 0x26a69a, 'cardboard', 'read', { label: 'PUZZLE', p: { text: 'L\'image du puzzle montre le centre commercial Hélios à son inauguration, en 1987. Une pièce manque : à l\'endroit d\'une fenêtre du sous-sol.' } });
d('board_game', 'Jeu de société', 'labelbox', [0.3, 0.07, 0.3], 0x5d4037, 'cardboard', 'read', { label: 'LE MANOIR', p: { text: '« Le Manoir Hanté » — 2 à 6 joueurs. Règle n°1 : ne jamais jouer seul après minuit.' } });
d('slime', 'Pot de slime', 'jar', [0.07, 0.07, 0.07], 0x76ff03, 'plastic', 'squeak', { p: { sound: 'eat_soft' }, desc: 'Squish.' });
d('kaleidoscope', 'Kaléidoscope', 'stick', [0.04, 0.04, 0.2], 0xab47bc, 'plastic', 'kaleido', { desc: 'Regardez dedans (clic gauche).' });
d('toy_phone', 'Téléphone jouet', 'phone', [0.15, 0.1, 0.1], 0xe91e63, 'plastic', 'toy_phone', { desc: 'Appuyez sur les touches. Il ne devrait pas sonner tout seul.' });
d('nightlight', 'Veilleuse étoiles', 'lamp', [0.1, 0.12, 0.1], 0x1a237e, 'plastic', 'nightlight', { desc: 'Projette des étoiles. Une petite lumière bleue rassurante.' });
d('toy_blocks', 'Cubes ABC', 'labelbox', [0.2, 0.2, 0.2], 0x42a5f5, 'wood', 'scatter', { label: 'ABC' });
d('toy_train', 'Petit train', 'toycar', [0.08, 0.07, 0.2], 0x2e7d32, 'metal', 'toy_roll', { p: { speed: 1.5, sound: 'toy_car' } });

// ───────────────────────── HYPERMARCHÉ ─────────────────────────
d('apple', 'Pomme', 'fruit', [0.08, 0.08, 0.08], 0xc62828, 'soft', 'eat', { p: { sound: 'eat_crunch', food: 8 } });
d('green_apple', 'Pomme verte', 'fruit', [0.08, 0.08, 0.08], 0x7cb342, 'soft', 'eat', { p: { sound: 'eat_crunch', food: 8 } });
d('banana', 'Banane', 'banana', [0.04, 0.04, 0.18], 0xfdd835, 'soft', 'eat', { p: { sound: 'eat_soft', food: 10, peel: true }, desc: 'Laisse une peau. Glissante.' });
d('orange', 'Orange', 'fruit', [0.08, 0.08, 0.08], 0xfb8c00, 'soft', 'eat', { p: { sound: 'eat_soft', food: 8 } });
d('tomato', 'Tomate', 'fruit', [0.07, 0.06, 0.07], 0xe53935, 'soft', 'eat', { p: { sound: 'eat_soft', food: 4, splat: true } });
d('lemon', 'Citron', 'fruit', [0.06, 0.06, 0.06], 0xfff176, 'soft', 'eat', { p: { sound: 'eat_soft', food: 1, effect: 'sour' }, desc: 'Grimace garantie.' });
d('watermelon', 'Pastèque', 'sphere', [0.3, 0.25, 0.3], 0x2e7d32, 'soft', 'eat', { p: { sound: 'eat_soft', food: 25, splat: true }, mass: 4 });
d('baguette', 'Baguette', 'baguette', [0.06, 0.06, 0.65], 0xd4a056, 'soft', 'eat', { p: { sound: 'eat_crunch', food: 15, melee: 1 }, desc: 'Peut servir d\'arme en cas d\'urgence (faible).' });
d('bread', 'Pain de mie', 'labelbox', [0.12, 0.12, 0.25], 0xf5deb3, 'soft', 'eat', { label: 'MIE', p: { sound: 'eat_soft', food: 10, toastable: true } });
d('toast', 'Toast', 'box', [0.1, 0.012, 0.1], 0xb5651d, 'soft', 'eat', { p: { sound: 'eat_crunch', food: 8 } });
d('burnt_toast', 'Toast carbonisé', 'box', [0.1, 0.012, 0.1], 0x221100, 'soft', 'eat', { p: { sound: 'eat_crunch', food: 1, effect: 'sick' } });
d('milk', 'Bouteille de lait', 'carton', [0.07, 0.2, 0.07], 0xffffff, 'cardboard', 'drink', { label: 'LAIT', p: { food: 10 } });
d('water', 'Bouteille d\'eau', 'bottle', [0.07, 0.25, 0.07], 0x81d4fa, 'plastic', 'drink', { p: { food: 2, effect: 'calm' } });
d('soda', 'Canette de soda', 'can', [0.065, 0.12, 0.065], 0xd50000, 'can', 'soda', { label: 'COLA', p: { food: 5, effect: 'energy' }, desc: 'Secouez-la (clic droit maintenu) avant de l\'ouvrir… si vous osez.' });
d('lemonade', 'Limonade', 'can', [0.065, 0.12, 0.065], 0xc0ca33, 'can', 'soda', { label: 'LIMO', p: { food: 5 } });
d('juice', 'Jus d\'orange', 'carton', [0.09, 0.22, 0.06], 0xff9800, 'cardboard', 'drink', { label: 'JUS', p: { food: 8 } });
d('wine', 'Bouteille de vin', 'wine', [0.08, 0.32, 0.08], 0x4a0e0e, 'glass', 'drink', { p: { effect: 'drunk', breakable: true }, desc: 'Un bordeaux. La tête tourne.' });
d('champagne', 'Champagne', 'wine', [0.09, 0.32, 0.09], 0x1b3a1b, 'glass', 'champagne', { desc: 'Le bouchon saute (clic gauche). Pour fêter la 10e nuit ?' });
d('energy_drink', 'Boisson énergisante', 'can', [0.06, 0.15, 0.06], 0x1e88e5, 'can', 'drink', { label: 'VOLT', p: { effect: 'energy', food: 3 }, desc: 'Endurance infinie pendant 60 s. Le cœur s\'emballe.' });
d('chips', 'Paquet de chips', 'bag', [0.2, 0.28, 0.07], 0xffc107, 'paper', 'eat', { label: 'CHIPS', p: { sound: 'eat_chips', food: 10, loud: true }, desc: 'Délicieux. Et extrêmement bruyant.' });
d('cereal', 'Boîte de céréales', 'labelbox', [0.2, 0.3, 0.07], 0xff7043, 'cardboard', 'eat', { label: 'CROC\'O', p: { sound: 'eat_crunch', food: 12 } });
d('chocolate', 'Tablette de chocolat', 'labelbox', [0.08, 0.015, 0.16], 0x4e342e, 'paper', 'eat', { label: 'CHOCO', p: { sound: 'eat_crunch', food: 12, effect: 'calm' }, desc: 'Réduit le stress.' });
d('cheese', 'Camembert', 'cyl', [0.11, 0.04, 0.11], 0xfff3e0, 'cardboard', 'eat', { p: { sound: 'eat_soft', food: 15, smell: true }, desc: 'Le chat errant l\'adore.' });
d('saucisson', 'Saucisson', 'baguette', [0.05, 0.05, 0.25], 0x8d3b3b, 'soft', 'eat', { p: { sound: 'eat_soft', food: 15 }, desc: 'Le chat errant l\'adore encore plus.' });
d('pasta', 'Paquet de pâtes', 'labelbox', [0.1, 0.25, 0.05], 0x1565c0, 'cardboard', 'eat', { label: 'PÂTES', p: { sound: 'eat_crunch', food: 2, raw: true }, desc: 'Crues. Croquant mais discutable.' });
d('frozen_pizza', 'Pizza surgelée', 'labelbox', [0.3, 0.04, 0.3], 0xc62828, 'cardboard', 'eat', { label: 'PIZZA', p: { sound: 'eat_crunch', food: 3, cook: 'pizza', raw: true }, desc: 'Passez-la au micro-ondes ou au four de la pizzeria.' });
d('canned_food', 'Conserve de raviolis', 'can', [0.08, 0.11, 0.08], 0x9e9e9e, 'can', 'eat', { label: 'RAVIOLI', p: { sound: 'eat_soft', food: 18, cook: 'hot_ravioli' } });
d('hot_ravioli', 'Raviolis chauds', 'can', [0.08, 0.11, 0.08], 0xbf360c, 'can', 'eat', { p: { sound: 'eat_soft', food: 30, effect: 'calm' } });
d('eggs', 'Boîte d\'œufs', 'labelbox', [0.15, 0.07, 0.1], 0xd7ccc8, 'cardboard', 'eat', { label: 'ŒUFS', p: { sound: 'eat_soft', food: 4, splat: true, raw: true }, desc: 'Lancés, ils éclatent.' });
d('flour', 'Sac de farine', 'bag', [0.15, 0.22, 0.08], 0xfafafa, 'paper', 'flour', { label: 'FARINE', desc: 'Lancez-le : un nuage de farine… qui révèle les silhouettes invisibles.' });
d('sugar', 'Sucre en morceaux', 'labelbox', [0.1, 0.06, 0.15], 0xffffff, 'cardboard', 'eat', { label: 'SUCRE', p: { sound: 'eat_crunch', food: 3, effect: 'energy' } });
d('coffee_pack', 'Paquet de café', 'labelbox', [0.08, 0.15, 0.06], 0x3e2723, 'paper', 'eat', { label: 'CAFÉ', p: { sound: 'eat_crunch', food: 1, effect: 'energy' }, desc: 'Croquer du café moulu : désespéré mais efficace.' });
d('tea', 'Boîte de thé', 'labelbox', [0.08, 0.1, 0.08], 0x2e7d32, 'cardboard', 'eat', { label: 'THÉ', p: { food: 1, effect: 'calm', sound: 'paper' } });
d('toilet_paper', 'Papier toilette', 'cyl', [0.11, 0.1, 0.11], 0xffffff, 'soft', 'toilet_paper', { desc: 'Lancez-le : il se déroule en volant.' });
d('detergent', 'Lessive', 'jerrycan', [0.15, 0.25, 0.1], 0xff5722, 'plastic', 'generic', { label: 'LAVE+', desc: 'À mettre dans un lave-linge en marche. Mousse garantie.' });
d('cat_food', 'Croquettes pour chat', 'bag', [0.15, 0.22, 0.06], 0x7b1fa2, 'paper', 'cat_food', { label: 'MIAOU', desc: 'Posez-en par terre : le chat errant viendra. Nourrissez-le chaque nuit…' });
d('baby_bottle', 'Biberon', 'bottle', [0.05, 0.15, 0.05], 0xe1f5fe, 'plastic', 'drink', { p: { food: 2 } });
d('honey', 'Pot de miel', 'jar', [0.08, 0.1, 0.08], 0xffb300, 'glass', 'eat', { p: { food: 10, effect: 'calm', breakable: true }, desc: 'Bobby adore le miel.' });
d('jam', 'Confiture', 'jar', [0.08, 0.1, 0.08], 0xad1457, 'glass', 'eat', { p: { food: 8, breakable: true } });
d('yogurt', 'Yaourts', 'box', [0.12, 0.07, 0.06], 0xfce4ec, 'plastic', 'eat', { p: { sound: 'eat_soft', food: 6 } });
d('ice_bag', 'Sachet de glaçons', 'bag', [0.15, 0.2, 0.06], 0xe0f7fa, 'soft', 'eat', { p: { sound: 'eat_crunch', food: 0, effect: 'cold' } });
d('carrot', 'Carottes', 'banana', [0.03, 0.03, 0.18], 0xff6f00, 'soft', 'eat', { p: { sound: 'eat_crunch', food: 5 } });
d('salad', 'Salade', 'sphere', [0.18, 0.14, 0.18], 0x8bc34a, 'soft', 'eat', { p: { sound: 'eat_crunch', food: 4 } });
d('shopping_cart', 'Caddie', 'cart', [0.6, 1.0, 0.9], 0xb0b0b0, 'metal', 'cart', { mass: 15, desc: 'Poussez-le (E maintenu). Bruyant sur le carrelage.' });
d('basket', 'Panier', 'box', [0.4, 0.22, 0.28], 0xd32f2f, 'plastic', 'generic');
d('sponge', 'Éponges', 'box', [0.1, 0.03, 0.07], 0xfdd835, 'soft', 'generic');
d('bleach', 'Javel', 'bottle', [0.09, 0.28, 0.09], 0xffffff, 'plastic', 'read', { p: { text: 'NE PAS BOIRE. Vraiment. Ne pas boire.' } });

// ───────────────────────── BOULANGERIE ─────────────────────────
d('croissant', 'Croissant', 'croissant', [0.14, 0.05, 0.08], 0xe0a040, 'soft', 'eat', { p: { sound: 'eat_soft', food: 12, effect: 'calm' } });
d('pain_choc', 'Pain au chocolat', 'box', [0.12, 0.04, 0.07], 0xd18f3a, 'soft', 'eat', { p: { sound: 'eat_soft', food: 12, effect: 'calm' }, desc: 'Ou chocolatine. Le débat ne sera pas tranché ici.' });
d('eclair', 'Éclair au café', 'baguette', [0.04, 0.04, 0.14], 0x6d4c41, 'soft', 'eat', { p: { sound: 'eat_soft', food: 10 } });
d('tarte', 'Tarte aux fraises', 'cake', [0.25, 0.05, 0.25], 0xe53935, 'soft', 'eat', { p: { sound: 'eat_soft', food: 25, splat: true } });
d('macarons', 'Boîte de macarons', 'labelbox', [0.15, 0.05, 0.08], 0xf8bbd0, 'cardboard', 'eat', { label: 'MACARONS', p: { sound: 'eat_soft', food: 10, effect: 'calm' } });
d('birthday_cake', 'Gâteau d\'anniversaire', 'cake', [0.25, 0.14, 0.25], 0xfff0f5, 'soft', 'cake', { desc: 'Avec des bougies. Soufflez-les (clic gauche) et faites un vœu.' });
d('brioche', 'Brioche', 'sphere', [0.14, 0.1, 0.14], 0xe6a24b, 'soft', 'eat', { p: { sound: 'eat_soft', food: 15 } });
d('cookie', 'Cookie', 'cyl', [0.08, 0.015, 0.08], 0xc08a4a, 'soft', 'eat', { p: { sound: 'eat_crunch', food: 6 } });
d('flan', 'Flan pâtissier', 'cake', [0.1, 0.05, 0.1], 0xffe082, 'soft', 'eat', { p: { sound: 'eat_soft', food: 10 } });

// ───────────────────────── PHARMACIE ─────────────────────────
d('paracetamol', 'Paracétamol', 'pills', [0.08, 0.02, 0.05], 0xffffff, 'cardboard', 'pills', { p: { effect: 'calm', amount: 30 }, desc: 'Réduit le stress de 30. Pas plus de 3 par nuit.' });
d('vitamins', 'Vitamines C', 'jar', [0.05, 0.08, 0.05], 0xff9800, 'plastic', 'pills', { p: { effect: 'energy' } });
d('sleeping_pills', 'Somnifères', 'pills', [0.08, 0.02, 0.05], 0x5c6bc0, 'cardboard', 'pills', { p: { effect: 'sleepy' }, desc: 'Très mauvaise idée pendant une garde de nuit.' });
d('bandage', 'Bandage', 'cyl', [0.06, 0.06, 0.06], 0xfafafa, 'soft', 'heal', { p: { amount: 25 } });
d('first_aid', 'Trousse de secours', 'box', [0.25, 0.15, 0.08], 0xd32f2f, 'plastic', 'heal', { p: { amount: 100 }, desc: 'Soigne complètement.' });
d('cough_syrup', 'Sirop pour la toux', 'bottle', [0.06, 0.14, 0.06], 0x6a1b9a, 'glass', 'drink', { p: { effect: 'sleepy', breakable: true } });
d('thermometer', 'Thermomètre', 'stick', [0.015, 0.015, 0.13], 0xffffff, 'plastic', 'thermometer', { desc: 'Affiche la température ambiante. Elle chute près de… certaines présences.' });
d('sanitizer', 'Gel hydroalcoolique', 'bottle', [0.05, 0.12, 0.05], 0xb3e5fc, 'plastic', 'spray', { p: { sound: 'spray' } });
d('sunscreen', 'Crème solaire', 'bottle', [0.05, 0.15, 0.03], 0xffeb3b, 'plastic', 'spray', { p: { sound: 'spray' } });
d('mask_medical', 'Masques chirurgicaux', 'box', [0.18, 0.09, 0.1], 0x81d4fa, 'cardboard', 'wear', { p: { slot: 'face', look: 'masque chirurgical' } });
d('earplugs', 'Bouchons d\'oreille', 'box', [0.05, 0.02, 0.05], 0xff8a65, 'plastic', 'earplugs', { desc: 'Coupe les sons. Plus de stress… et plus d\'avertissement.' });
d('glucose', 'Comprimés de glucose', 'pills', [0.06, 0.02, 0.04], 0x80cbc4, 'cardboard', 'pills', { p: { effect: 'energy' } });

// ───────────────────────── FLEURISTE ─────────────────────────
d('roses', 'Bouquet de roses', 'bouquet', [0.15, 0.45, 0.15], 0xc2185b, 'soft', 'flower', { desc: 'Sentez-les (clic gauche) : calme.' });
d('tulips', 'Tulipes en pot', 'flowerpot', [0.14, 0.35, 0.14], 0xff7043, 'ceramic', 'flower');
d('sunflower', 'Tournesol', 'flowerpot', [0.16, 0.6, 0.16], 0xfdd835, 'ceramic', 'flower', { desc: 'Il se tourne vers la lumière. Même la nuit, même vers votre lampe.' });
d('cactus', 'Cactus', 'cactus', [0.1, 0.25, 0.1], 0x388e3c, 'ceramic', 'cactus', { desc: 'Ne le serrez pas.' });
d('orchid', 'Orchidée', 'flowerpot', [0.12, 0.45, 0.12], 0xe1bee7, 'ceramic', 'flower');
d('bonsai', 'Bonsaï', 'flowerpot', [0.25, 0.25, 0.18], 0x2e7d32, 'ceramic', 'flower', { desc: 'Il a 40 ans. Arrosez-le.' });
d('watering_can', 'Arrosoir', 'watering', [0.25, 0.2, 0.12], 0x43a047, 'metal', 'water_can', { desc: 'Arrose les plantes. Arrosez le bonsaï trois nuits de suite…' });
d('seeds', 'Sachet de graines', 'card', [0.08, 0.12, 0.005], 0x8d6e63, 'paper', 'read', { p: { text: 'Graines de « Belle-de-nuit » : fleurit uniquement dans l\'obscurité.' } });
d('vase', 'Vase', 'jar', [0.12, 0.3, 0.12], 0x1e88e5, 'ceramic', 'generic', { p: { breakable: true } });
d('lilies', 'Lys blancs', 'bouquet', [0.15, 0.5, 0.15], 0xffffff, 'soft', 'flower', { desc: 'Les fleurs des enterrements.' });
d('wreath', 'Couronne mortuaire', 'ring_big', [0.5, 0.5, 0.1], 0x33691e, 'soft', 'read', { p: { text: 'Le ruban dit : « À Lucie, 1979-1987. Le Royaume ne t\'oubliera jamais. »' } });

// ───────────────────────── QUINCAILLERIE ─────────────────────────
d('extension_cord', 'Rallonge', 'rope', [0.2, 0.06, 0.2], 0xff6f00, 'plastic', 'generic');
d('flashlight_spare', 'Lampe de poche bon marché', 'flashlight', [0.04, 0.04, 0.16], 0xffd600, 'plastic', 'flashlight', { p: { kind: 'cheap' }, desc: 'Faisceau jaunâtre qui clignote.' });
d('light_bulbs', 'Pack d\'ampoules', 'labelbox', [0.12, 0.12, 0.06], 0xfff59d, 'cardboard', 'bulb', { label: 'LED x4', p: { uses: 4 } });
d('gloves', 'Gants de travail', 'box', [0.12, 0.03, 0.2], 0x8d6e63, 'soft', 'wear', { p: { slot: 'hands', look: 'gants', quiet: true }, desc: 'Avec des gants : pas d\'empreintes sur les caisses.' });
d('helmet', 'Casque de chantier', 'hat', [0.25, 0.15, 0.28], 0xffd600, 'plastic', 'wear', { p: { slot: 'head', look: 'casque de chantier', armor: true } });
d('toolbox', 'Caisse à outils', 'box', [0.4, 0.2, 0.2], 0xc62828, 'metal', 'container', { p: { contains: ['screwdriver', 'duct_tape', 'fuse'] }, desc: 'Ouvrez-la (E) pour voir son contenu.' });
d('wd40', 'Dégrippant', 'bottle', [0.05, 0.2, 0.05], 0x1565c0, 'can', 'wd40', { desc: 'Fait taire une porte qui grince. Pour de bon.' });
d('mousetrap', 'Tapette à souris', 'box', [0.1, 0.02, 0.05], 0xc8a165, 'wood', 'scatter', { p: { trap: true, snap: true } });

// ───────────────────────── ANIMALERIE ─────────────────────────
d('fish_food', 'Nourriture pour poissons', 'jar', [0.05, 0.08, 0.05], 0xffa000, 'plastic', 'fish_food', { desc: 'À utiliser devant un aquarium.' });
d('bird_seed', 'Graines pour oiseaux', 'bag', [0.12, 0.16, 0.05], 0xcddc39, 'paper', 'bird_seed', { desc: 'Pour Coco, le perroquet. Nourri, il répète des choses intéressantes.' });
d('dog_toy', 'Os en caoutchouc', 'bone', [0.05, 0.04, 0.15], 0xff5252, 'plastic', 'squeak', { p: { sound: 'squeak', pitch: 0.8 } });
d('hamster_ball', 'Boule pour hamster', 'ball', [0.18, 0.18, 0.18], 0x80deea, 'plastic', 'ball', { p: { bounce: 0.3 } });
d('leash', 'Laisse', 'rope', [0.15, 0.04, 0.15], 0xd32f2f, 'soft', 'generic');
d('cat_toy', 'Plumeau pour chat', 'stick', [0.02, 0.02, 0.4], 0xe040fb, 'soft', 'cat_toy', { desc: 'Agitez-le devant le chat errant. Il adore.' });
d('pet_bed', 'Panier pour animal', 'cyl', [0.45, 0.12, 0.45], 0x8d6e63, 'soft', 'pet_bed', { desc: 'Posez-le quelque part : le chat y dormira.' });
d('aquarium', 'Aquarium', 'aquarium', [1.2, 0.6, 0.45], 0x4fc3f7, 'glass', 'aquarium', F);
d('parrot_cage', 'Cage de Coco le perroquet', 'cage', [0.5, 0.8, 0.5], 0xb0bec5, 'metal', 'parrot', F);
d('hamster_cage', 'Cage à hamster', 'cage', [0.5, 0.35, 0.35], 0xff8a65, 'metal', 'hamster', F);
d('terrarium', 'Terrarium (python)', 'aquarium', [1.0, 0.5, 0.45], 0x8d6e63, 'glass', 'terrarium', F);

// ───────────────────────── BIJOUTERIE ─────────────────────────
d('ring', 'Bague en or', 'ring', [0.025, 0.025, 0.01], 0xffd700, 'metal', 'jewel', { value: 900 });
d('diamond_ring', 'Solitaire diamant', 'ring', [0.025, 0.03, 0.01], 0xe0f7fa, 'metal', 'jewel', { value: 6500 });
d('necklace', 'Collier de perles', 'necklace', [0.12, 0.02, 0.12], 0xfafafa, 'metal', 'jewel', { value: 2400 });
d('watch', 'Montre de luxe', 'watch', [0.05, 0.015, 0.05], 0xc0c0c0, 'metal', 'watch', { value: 8000, desc: 'Affiche l\'heure exacte (clic gauche). Une vraie.' });
d('bracelet', 'Bracelet', 'ring_big', [0.08, 0.08, 0.015], 0xffc107, 'metal', 'jewel', { value: 1500 });
d('earrings', 'Boucles d\'oreilles', 'ring', [0.02, 0.02, 0.01], 0xff4081, 'metal', 'jewel', { value: 700 });
d('cursed_brooch', 'Broche ancienne', 'ring', [0.03, 0.03, 0.01], 0x4a148c, 'metal', 'jewel', { value: 0, p: { lore: 'brooch' }, desc: 'Gravée « L.M. 1987 ». Elle n\'a pas d\'étiquette de prix.' });

// ───────────────────────── TABAC-PRESSE ─────────────────────────
d('newspaper', 'Journal du jour', 'newspaper', [0.3, 0.02, 0.4], 0xeeeeee, 'paper', 'newspaper', { desc: 'Lisez les gros titres (clic gauche).' });
d('old_newspaper', 'Vieux journal (1987)', 'newspaper', [0.3, 0.02, 0.4], 0xe8d9b0, 'paper', 'read', { p: { lore: 'news1987' } });
d('magazine', 'Magazine', 'book', [0.21, 0.28, 0.01], 0xe91e63, 'paper', 'newspaper', { p: { mag: true } });
d('comic', 'Bande dessinée', 'book', [0.22, 0.3, 0.01], 0x29b6f6, 'paper', 'read', { p: { lore: 'comic' } });
d('scratch_card', 'Ticket à gratter', 'card', [0.08, 0.12, 0.002], 0xffeb3b, 'paper', 'scratch', { desc: 'Grattez (clic gauche). Qui sait ?' });
d('lottery', 'Grille de loto', 'card', [0.1, 0.15, 0.002], 0x7cb342, 'paper', 'read', { p: { text: 'Numéros cochés au stylo : 4 · 8 · 15 · 16 · 23 · 42. Quelqu\'un y croit très fort.' } });
d('postcard', 'Carte postale du centre', 'card', [0.15, 0.1, 0.002], 0x4fc3f7, 'paper', 'read', { p: { text: '« Bons baisers du Centre Commercial Hélios ! » — Au dos, une écriture tremblante : « Ne restez pas après la fermeture. »' } });
d('city_map', 'Plan de la ville', 'book', [0.15, 0.22, 0.01], 0x8bc34a, 'paper', 'read', { p: { lore: 'citymap' } });
d('gum', 'Chewing-gum', 'box', [0.07, 0.02, 0.03], 0x00e676, 'paper', 'gum', { desc: 'Mâchez-le, puis collez-le sur l\'objectif d\'une caméra (pas les vôtres, de préférence).' });
d('candy_bar', 'Barre chocolatée', 'box', [0.12, 0.02, 0.04], 0x6d4c41, 'paper', 'eat', { p: { sound: 'eat_crunch', food: 10, effect: 'energy' } });

// ───────────────────────── CAFÉ ─────────────────────────
d('coffee', 'Café', 'cup', [0.08, 0.1, 0.08], 0xffffff, 'ceramic', 'drink', { p: { effect: 'energy', food: 2, hot: true }, desc: 'Noir, sans sucre. Indispensable.' });
d('cappuccino', 'Cappuccino', 'cup', [0.09, 0.1, 0.09], 0xf5f5f5, 'ceramic', 'drink', { p: { effect: 'energy', food: 5 } });
d('hot_choc', 'Chocolat chaud', 'cup', [0.09, 0.1, 0.09], 0xffffff, 'ceramic', 'drink', { p: { effect: 'calm', food: 8 }, desc: 'Le meilleur ami des nuits blanches.' });
d('tea_cup', 'Tasse de thé', 'cup', [0.08, 0.08, 0.08], 0xffffff, 'ceramic', 'drink', { p: { effect: 'calm', food: 2 } });
d('muffin', 'Muffin', 'cake', [0.08, 0.08, 0.08], 0x8d6e63, 'soft', 'eat', { p: { sound: 'eat_soft', food: 10 } });
d('sugar_packet', 'Sachet de sucre', 'card', [0.03, 0.06, 0.005], 0xffffff, 'paper', 'eat', { p: { food: 1, sound: 'paper', effect: 'energy' } });

// ───────────────────────── ÉLECTROMÉNAGER ─────────────────────────
d('tv', 'Téléviseur', 'tv', [1.1, 0.65, 0.08], 0x111111, 'glass', 'tv', { fixed: true, desc: 'Allumez (E), changez de chaîne (R). Avec un magnétoscope, lit les VHS.' });
d('crt_tv', 'Vieux téléviseur cathodique', 'crt', [0.6, 0.5, 0.5], 0x3e2723, 'glass', 'tv', { fixed: true, p: { crt: true } });
d('microwave', 'Micro-ondes', 'microwave', [0.5, 0.3, 0.38], 0xeeeeee, 'metal', 'microwave', { fixed: true, desc: 'Mettez un aliment dedans (E avec l\'aliment en main), puis lancez (E). Pas de métal dedans !' });
d('blender', 'Blender', 'blender', [0.16, 0.38, 0.16], 0xd32f2f, 'plastic', 'loopdevice', { p: { sound: 'blender', smoothie: true }, desc: 'Mettez un fruit dedans pour un smoothie.' });
d('toaster', 'Grille-pain', 'toaster', [0.28, 0.2, 0.16], 0xc0c0c0, 'metal', 'toaster', { desc: 'Pain de mie → toast. Oublié trop longtemps → toast carbonisé… ou pire.' });
d('kettle', 'Bouilloire', 'kettle', [0.18, 0.25, 0.15], 0xeeeeee, 'plastic', 'kettle', { desc: 'Siffle quand l\'eau bout.' });
d('fan', 'Ventilateur', 'fan', [0.4, 0.6, 0.3], 0xf5f5f5, 'plastic', 'fan', { desc: 'Souffle les objets légers et la fumée.' });
d('lamp', 'Lampe de chevet', 'lamp', [0.2, 0.35, 0.2], 0xfff3e0, 'ceramic', 'lamp', { desc: 'Une vraie source de lumière (E).' });
d('vacuum', 'Aspirateur', 'vacuum', [0.3, 0.35, 0.4], 0x7b1fa2, 'plastic', 'vacuum', { desc: 'Clic gauche : aspire les petits objets au sol. Terrifie le chat.' });
d('hairdryer', 'Sèche-cheveux', 'drill', [0.08, 0.2, 0.2], 0xec407a, 'plastic', 'loopdevice', { p: { sound: 'hairdryer', hold: true, blow: true } });
d('washer', 'Lave-linge', 'washer', [0.6, 0.85, 0.6], 0xfafafa, 'metal', 'washer', F);
d('fridge', 'Réfrigérateur', 'fridge', [0.7, 1.8, 0.7], 0xeceff1, 'metal', 'fridge', F);
d('coffee_maker', 'Machine à café', 'coffee_maker', [0.25, 0.35, 0.3], 0x212121, 'plastic', 'coffee_maker', { fixed: true, desc: 'Produit un café chaud. Ou un chocolat (R pour changer).' });
d('radio', 'Radio', 'radio', [0.3, 0.18, 0.1], 0x795548, 'wood', 'radio', { desc: 'Allumer (clic gauche/E), changer de station (R).' });
d('speaker', 'Enceinte Bluetooth', 'cyl', [0.08, 0.18, 0.08], 0x263238, 'plastic', 'radio', { p: { speaker: true }, desc: 'Posez-la quelque part et allumez-la : diversion parfaite.' });
d('toothbrush', 'Brosse à dents électrique', 'stick', [0.03, 0.03, 0.22], 0x00bcd4, 'plastic', 'loopdevice', { p: { sound: 'electric_toothbrush', hold: true } });
d('shaver', 'Rasoir électrique', 'box', [0.05, 0.15, 0.04], 0x37474f, 'plastic', 'loopdevice', { p: { sound: 'shaver', hold: true } });
d('iron', 'Fer à repasser', 'iron', [0.12, 0.13, 0.26], 0x039be5, 'plastic', 'loopdevice', { p: { sound: 'smoke_hiss' } });
d('smoke_detector', 'Détecteur de fumée', 'cyl', [0.12, 0.04, 0.12], 0xffffff, 'plastic', 'button_test', { p: { sound: 'smoke_alarm', dur: 2 }, desc: 'Bouton test (clic gauche). Aïe les oreilles.' });
d('dishwasher', 'Lave-vaisselle', 'washer', [0.6, 0.85, 0.6], 0xb0bec5, 'metal', 'washer', F);
d('oven', 'Four', 'microwave', [0.6, 0.6, 0.6], 0x37474f, 'metal', 'microwave', { fixed: true, p: { oven: true } });

// ───────────────────────── PIXEL PLANET (JEUX VIDÉO) ─────────────────────────
d('console_station', 'Borne de démo console', 'console', [0.3, 0.07, 0.25], 0x1a1a1a, 'plastic', 'console', { fixed: true, desc: 'Insérez une cartouche (E avec la cartouche), puis jouez (E).' });
d('cart_snake', 'Cartouche « Serpent »', 'cart', [0.06, 0.08, 0.015], 0x43a047, 'plastic', 'cartridge', { p: { game: 'snake' } });
d('cart_pong', 'Cartouche « Ping »', 'cart', [0.06, 0.08, 0.015], 0xffffff, 'plastic', 'cartridge', { p: { game: 'pong' } });
d('cart_breakout', 'Cartouche « Casse-Briques »', 'cart', [0.06, 0.08, 0.015], 0xff7043, 'plastic', 'cartridge', { p: { game: 'breakout' } });
d('cart_invaders', 'Cartouche « Envahisseurs »', 'cart', [0.06, 0.08, 0.015], 0x7e57c2, 'plastic', 'cartridge', { p: { game: 'invaders' } });
d('cart_blocs', 'Cartouche « Blocs »', 'cart', [0.06, 0.08, 0.015], 0x29b6f6, 'plastic', 'cartridge', { p: { game: 'blocs' } });
d('cart_racer', 'Cartouche « Turbo Route »', 'cart', [0.06, 0.08, 0.015], 0xe53935, 'plastic', 'cartridge', { p: { game: 'racer' } });
d('cart_platformer', 'Cartouche « Super Hélio »', 'cart', [0.06, 0.08, 0.015], 0xfdd835, 'plastic', 'cartridge', { p: { game: 'platformer' } });
d('cart_glouton', 'Cartouche « Glouton »', 'cart', [0.06, 0.08, 0.015], 0xffeb3b, 'plastic', 'cartridge', { p: { game: 'glouton' } });
d('cart_oiseau', 'Cartouche « Oiseau Flap »', 'cart', [0.06, 0.08, 0.015], 0x80deea, 'plastic', 'cartridge', { p: { game: 'oiseau' } });
d('cart_demineur', 'Cartouche « Démineur »', 'cart', [0.06, 0.08, 0.015], 0x9e9e9e, 'plastic', 'cartridge', { p: { game: 'demineur' } });
d('cart_simon', 'Cartouche « Simon »', 'cart', [0.06, 0.08, 0.015], 0xff4081, 'plastic', 'cartridge', { p: { game: 'simon' } });
d('pocketboy', 'Console portable PocketBoy', 'handheld', [0.09, 0.14, 0.025], 0x9e9e9e, 'plastic', 'handheld', { desc: 'Jouez n\'importe où (clic gauche). Insérez une cartouche dedans (E sur la cartouche en main).' });
d('controller', 'Manette', 'controller', [0.15, 0.04, 0.1], 0x212121, 'plastic', 'squeak', { p: { sound: 'button' } });
d('vr_headset', 'Casque VR', 'vr', [0.2, 0.1, 0.12], 0xfafafa, 'plastic', 'vr', { desc: 'Mettez-le (clic gauche). Le centre commercial… en mieux ? Ou en pire.' });
d('gaming_headset', 'Casque gamer', 'headset', [0.2, 0.2, 0.08], 0xff1744, 'plastic', 'headphones', { desc: 'Musique dans les oreilles. Vous n\'entendez plus rien d\'autre. Dangereux.' });
d('figurine', 'Figurine de collection', 'doll', [0.08, 0.2, 0.08], 0x00e5ff, 'plastic', 'generic', { desc: 'Édition limitée. Le vendeur, Kevin, vous tuerait.' });
d('game_box', 'Jeu en boîte', 'labelbox', [0.14, 0.19, 0.015], 0x3949ab, 'plastic', 'read', { label: 'JEU', p: { gamebox: true } });

// ───────────────────────── RÉTRO VIDÉO CLUB ─────────────────────────
d('turntable', 'Platine vinyle', 'turntable', [0.45, 0.12, 0.35], 0x3e2723, 'wood', 'turntable', { fixed: true, desc: 'Posez un vinyle dessus (E avec le vinyle en main).' });
d('vcr', 'Magnétoscope + TV', 'vcr', [0.4, 0.09, 0.3], 0x212121, 'plastic', 'vcr', { fixed: true, desc: 'Insérez une cassette VHS (E avec la cassette), Lecture (E), Éjecter (R).' });
const VINYLS = [['jazz', 'Jazz de minuit', 0x1a237e], ['disco', 'Disco Fever 78', 0xe91e63], ['rock', 'Rock\'n\'Hélios', 0xb71c1c], ['classical', 'Valses de Vienne', 0x4e342e], ['synthwave', 'Néon 1986', 0x6a1b9a], ['funk', 'Funky Galerie', 0xff6f00], ['chanson', 'Chansons d\'hier', 0x33691e], ['reggae', 'Soleil Reggae', 0x2e7d32], ['metal', 'Acier Hurlant', 0x212121], ['ambient', 'Nuages', 0x0277bd], ['creepy_vinyl', 'Sans titre (78 tours)', 0x111111], ['piano_bar', 'Piano Bar', 0x5d4037], ['xmas', 'Noël au Centre', 0xc62828]];
for (const [g, n, c] of VINYLS) d('vinyl_' + g, 'Vinyle « ' + n + ' »', 'vinyl', [0.31, 0.31, 0.01], c, 'cardboard', 'vinyl', { p: { genre: g }, label: n, desc: g === 'creepy_vinyl' ? 'Pas de pochette. Juste une étiquette noire, et une date : 1987.' : 'Un 33 tours.' });
const TAPES = [['cartoon', 'Les Aventures de Pépito', 0xffeb3b], ['aerobic', 'Gym Tonic Matin', 0xff4081], ['cooking', 'La Cuisine de Mamie', 0xff7043], ['birthday', 'Anniversaire de Julie 1991', 0x90caf9], ['nature', 'Les Loups des Vosges', 0x2e7d32], ['kungfu', 'Le Poing du Dragon', 0xd32f2f], ['western', 'Le Shérif de Dodge', 0xa1887f], ['scifi', 'Planète Rouge', 0xb71c1c], ['horror', 'La Nuit des Mannequins', 0x212121], ['karaoke', 'Karaoké Party', 0x7c4dff], ['bobby_ad', 'Pub Royaume du Jouet 1987', 0xffb300], ['security_1987', 'CCTV 14/11/87', 0x9e9e9e], ['gerard', 'Pour mon remplaçant', 0x5d4037], ['no_label', '(sans étiquette)', 0x111111]];
for (const [id, n, c] of TAPES) d('vhs_' + id, 'Cassette VHS « ' + n + ' »', 'vhs', [0.19, 0.025, 0.105], c, 'plastic', 'vhs', { p: { tape: id }, label: n });
d('walkman', 'Baladeur cassette', 'box', [0.12, 0.09, 0.03], 0xb0bec5, 'plastic', 'headphones', { p: { walkman: true }, desc: 'De la musique dans les oreilles. Mais vous n\'entendez plus rien venir.' });
d('audio_tape', 'Cassette audio', 'box', [0.1, 0.065, 0.012], 0x37474f, 'plastic', 'generic');
d('movie_poster', 'Affiche de film', 'card', [0.6, 0.8, 0.003], 0x000000, 'paper', 'read', { p: { text: '« LA NUIT DES MANNEQUINS » — Ils ne bougent que quand vous ne regardez pas.' } });

// ───────────────────────── LIBRAIRIE ─────────────────────────
d('book_horror', 'Roman « Le Gardien »', 'book', [0.14, 0.21, 0.03], 0x212121, 'paper', 'read', { p: { lore: 'book_gardien' } });
d('book_cook', 'Livre de cuisine', 'book', [0.2, 0.26, 0.03], 0xff7043, 'paper', 'read', { p: { lore: 'book_cook' } });
d('book_kids', 'Album « Bobby et la Lune »', 'book', [0.24, 0.24, 0.01], 0xffb300, 'paper', 'read', { p: { lore: 'book_bobby' } });
d('book_history', 'Histoire de la ville', 'book', [0.17, 0.24, 0.04], 0x5d4037, 'paper', 'read', { p: { lore: 'book_history' } });
d('dictionary', 'Dictionnaire', 'book', [0.16, 0.24, 0.07], 0xc62828, 'paper', 'read', { p: { text: 'GARDIEN, IENNE n. — Personne chargée de garder un lieu. Voir aussi : PRISONNIER.' }, mass: 2 });
d('book_electric', 'Manuel d\'électricité', 'book', [0.17, 0.24, 0.03], 0xffd600, 'paper', 'read', { p: { lore: 'book_electric' } });
d('book_cats', 'Le Langage des chats', 'book', [0.17, 0.24, 0.02], 0x8d6e63, 'paper', 'read', { p: { lore: 'book_cats' } });
d('book_poetry', 'Poèmes nocturnes', 'book', [0.13, 0.2, 0.015], 0x311b92, 'paper', 'read', { p: { lore: 'book_poetry' } });
d('mall_guide', 'Guide du centre Hélios', 'book', [0.15, 0.21, 0.005], 0x0288d1, 'paper', 'map', { desc: 'Affiche le plan (touche M en main).' });
d('globe', 'Globe terrestre', 'globe', [0.3, 0.4, 0.3], 0x1565c0, 'plastic', 'globe', { desc: 'Faites-le tourner.' });
d('notebook', 'Carnet', 'book', [0.15, 0.21, 0.01], 0x455a64, 'paper', 'read', { p: { text: 'Pages blanches. Sauf la dernière : « 3h33 ». Souligné trois fois.' } });

// ───────────────────────── TÉLÉPHONIE ─────────────────────────
d('smartphone', 'Smartphone de démo', 'phone', [0.075, 0.15, 0.008], 0x263238, 'glass', 'mobile', { p: { demo: true } });
d('earbuds', 'Écouteurs sans fil', 'box', [0.05, 0.025, 0.04], 0xffffff, 'plastic', 'headphones');
d('charger', 'Chargeur', 'box', [0.04, 0.04, 0.03], 0xfafafa, 'plastic', 'generic');
d('phone_case', 'Coque de téléphone', 'card', [0.08, 0.15, 0.01], 0xff4081, 'plastic', 'generic');

// ───────────────────────── OPTICIEN ─────────────────────────
d('sunglasses', 'Lunettes de soleil', 'glasses', [0.14, 0.05, 0.14], 0x111111, 'plastic', 'glasses', { p: { mode: 'sun' }, desc: 'La nuit ? Vraiment ?' });
d('glasses_3d', 'Lunettes 3D', 'glasses', [0.14, 0.05, 0.14], 0xffffff, 'plastic', 'glasses', { p: { mode: 'anaglyph' } });
d('magnifier', 'Loupe', 'magnifier', [0.08, 0.02, 0.2], 0x8d6e63, 'glass', 'zoom', { desc: 'Maintenez clic gauche pour zoomer.' });
d('night_goggles', 'Lunettes de vision nocturne', 'goggles', [0.16, 0.08, 0.15], 0x33691e, 'metal', 'glasses', { p: { mode: 'nightvision' }, desc: 'Vision verte amplifiée. Vide une pile toutes les 3 minutes.' });
d('eye_chart', 'Tableau d\'acuité', 'card', [0.5, 0.8, 0.01], 0xffffff, 'paper', 'read', { fixed: true, p: { text: 'E\nF P\nT O Z\nL P E D\nP E C F D\nE D F C Z P\n\nTout en bas, minuscule : « s o u s - s o l   b 1 3   1 9 8 7 »' } });
d('contact_lens', 'Solution pour lentilles', 'bottle', [0.05, 0.12, 0.05], 0x4dd0e1, 'plastic', 'read', { p: { text: '« Pour des yeux qui voient tout. » Pas sûr que ce soit souhaitable ici.' } });
d('binoculars', 'Jumelles', 'binoculars', [0.15, 0.06, 0.12], 0x263238, 'metal', 'zoom', { p: { zoom: 4 } });

// ───────────────────────── PARFUMERIE ─────────────────────────
d('perfume', 'Parfum « Nuit d\'Hélios »', 'perfume', [0.07, 0.12, 0.04], 0x7b1fa2, 'glass', 'spray', { p: { sound: 'perfume_spray', scent: true, breakable: true }, desc: 'Le chat déteste. Les autres choses… le suivent.' });
d('perfume2', 'Eau de Cologne', 'perfume', [0.06, 0.14, 0.04], 0xffb74d, 'glass', 'spray', { p: { sound: 'perfume_spray', scent: true, breakable: true } });
d('lipstick', 'Rouge à lèvres', 'stick', [0.02, 0.02, 0.08], 0xc2185b, 'plastic', 'lipstick', { desc: 'Écrivez sur un miroir (clic gauche devant un miroir).' });
d('compact_mirror', 'Miroir de poche', 'cyl', [0.07, 0.015, 0.07], 0xffd54f, 'glass', 'mirror', { desc: 'Maintenez clic gauche : voyez ce qu\'il y a derrière vous.' });
d('soap', 'Savon artisanal', 'box', [0.08, 0.03, 0.05], 0xce93d8, 'soft', 'generic', { desc: 'Sent la lavande.' });
d('shampoo', 'Shampoing', 'bottle', [0.07, 0.2, 0.04], 0x26c6da, 'plastic', 'spray', { p: { sound: 'spray' } });
d('nail_polish', 'Vernis à ongles', 'bottle', [0.03, 0.06, 0.03], 0xd50000, 'glass', 'generic');
d('deodorant', 'Déodorant', 'can', [0.05, 0.15, 0.05], 0x1976d2, 'can', 'spray', { p: { sound: 'spray', lighterCombo: true }, desc: 'Avec un briquet… non. Non.' });

// ───────────────────────── MODE / CHAUSSURES ─────────────────────────
const CLOTHES = [['shirt_white', 'Chemise blanche', 0xfafafa], ['shirt_hawaii', 'Chemise hawaïenne', 0x00bfa5], ['jacket_leather', 'Blouson en cuir', 0x3e2723], ['dress_red', 'Robe rouge', 0xc62828], ['hoodie', 'Sweat à capuche', 0x37474f], ['suit', 'Costume trois pièces', 0x212121], ['raincoat', 'Ciré jaune', 0xffd600], ['sweater', 'Pull de Noël', 0xc62828]];
for (const [id, n, c] of CLOTHES) d(id, n, 'shirt', [0.4, 0.05, 0.3], c, 'soft', 'wear', { p: { slot: 'body', look: n.toLowerCase(), color: c } });
d('hat_fedora', 'Chapeau feutre', 'hat', [0.3, 0.12, 0.3], 0x4e342e, 'soft', 'wear', { p: { slot: 'head', look: 'chapeau feutre' } });
d('cap', 'Casquette', 'hat', [0.22, 0.1, 0.28], 0x1565c0, 'soft', 'wear', { p: { slot: 'head', look: 'casquette' } });
d('beanie', 'Bonnet', 'hat', [0.22, 0.12, 0.22], 0xd84315, 'soft', 'wear', { p: { slot: 'head', look: 'bonnet' } });
d('scarf', 'Écharpe', 'rope', [0.3, 0.04, 0.1], 0x8e24aa, 'soft', 'wear', { p: { slot: 'neck', look: 'écharpe', warm: true } });
d('handbag', 'Sac à main', 'bag', [0.3, 0.22, 0.1], 0x6d4c41, 'soft', 'container', { p: { contains: ['lipstick', 'coin', 'gum'] } });
d('sneakers', 'Baskets', 'shoe', [0.12, 0.1, 0.28], 0xfafafa, 'soft', 'wear', { p: { slot: 'feet', step: 'step_sneakers', quiet: 0.5 }, desc: 'Pas silencieux : les présences vous entendent deux fois moins.' });
d('heels', 'Escarpins', 'shoe', [0.09, 0.12, 0.24], 0xd50000, 'plastic', 'wear', { p: { slot: 'feet', step: 'step_heels', quiet: 2 }, desc: 'Clac. Clac. Clac. Tout le centre vous entend.' });
d('boots', 'Bottes de sécurité', 'shoe', [0.12, 0.18, 0.3], 0x4e342e, 'soft', 'wear', { p: { slot: 'feet', step: 'step_concrete', armor: true, quiet: 1.2 }, desc: 'Immunisé contre les briques et les clous.' });
d('slippers', 'Chaussons', 'shoe', [0.11, 0.07, 0.27], 0xf48fb1, 'soft', 'wear', { p: { slot: 'feet', step: 'step_carpet', quiet: 0.3, slow: true }, desc: 'Ultra silencieux. Impossible de courir.' });
d('shoe_box', 'Boîte à chaussures', 'labelbox', [0.2, 0.12, 0.33], 0xff7043, 'cardboard', 'container', { label: 'POINTURE 43', p: { contains: ['sneakers'] } });

// ───────────────────────── SPORT ─────────────────────────
d('football', 'Ballon de foot', 'ball', [0.22, 0.22, 0.22], 0xffffff, 'soft', 'ball', { p: { bounce: 0.7, kick: true } });
d('basketball', 'Ballon de basket', 'ball', [0.24, 0.24, 0.24], 0xe65100, 'soft', 'ball', { p: { bounce: 0.75, sound: 'basketball' } });
d('tennis_ball', 'Balle de tennis', 'ball', [0.065, 0.065, 0.065], 0xc6ff00, 'soft', 'ball', { p: { bounce: 0.75 } });
d('racket', 'Raquette de tennis', 'racket', [0.27, 0.68, 0.03], 0x1565c0, 'plastic', 'melee', { p: { dmg: 1, hitsBalls: true } });
d('baseball_bat', 'Batte de baseball', 'stick', [0.06, 0.06, 0.8], 0xc8a165, 'wood', 'melee', { p: { dmg: 3, breaks: true } });
d('dumbbell', 'Haltère 10 kg', 'dumbbell', [0.3, 0.1, 0.1], 0x424242, 'metal', 'dumbbell', { mass: 10, desc: 'Lourd. Clic gauche pour faire une série (réduit le stress).' });
d('yoga_mat', 'Tapis de yoga', 'cyl', [0.12, 0.6, 0.12], 0x7e57c2, 'soft', 'yoga', { desc: 'Posez-le et méditez (clic gauche). Grand calme.' });
d('skateboard', 'Skateboard', 'skate', [0.2, 0.1, 0.8], 0xff5722, 'wood', 'toy_roll', { p: { speed: 3, sound: 'skate_roll' } });
d('boxing_gloves', 'Gants de boxe', 'plush', [0.15, 0.15, 0.2], 0xd50000, 'soft', 'melee', { p: { dmg: 1 } });
d('whistle', 'Sifflet', 'box', [0.05, 0.02, 0.02], 0xffd600, 'metal', 'whistle', { desc: 'Coup de sifflet strident. Fait fuir le chat… et certains intrus.' });
d('air_horn', 'Corne de brume', 'can', [0.06, 0.18, 0.06], 0xf44336, 'can', 'air_horn', { desc: 'TRÈS fort. Repousse temporairement les présences proches.' });
d('energy_bar', 'Barre de céréales', 'box', [0.12, 0.02, 0.04], 0x8d6e63, 'paper', 'eat', { p: { sound: 'eat_crunch', food: 10, effect: 'energy' } });
d('tent', 'Tente 2 places', 'tent', [1.6, 1.0, 1.4], 0x2e7d32, 'soft', 'hide', { fixed: true, desc: 'Cachez-vous dedans (E). Rien ne vous voit. Vous non plus.' });
d('sleeping_bag', 'Sac de couchage', 'cyl', [0.25, 0.4, 0.25], 0x1565c0, 'soft', 'generic');
d('bike', 'Vélo d\'appartement', 'bike', [0.5, 1.1, 1.0], 0x212121, 'metal', 'bike', { fixed: true, desc: 'Pédalez (E). Produit 0,1 % de l\'électricité du centre. Courage.' });
d('basket_hoop', 'Panier de basket', 'hoop', [0.6, 1.2, 0.5], 0xe65100, 'metal', 'hoop', F);
d('golf_club', 'Club de golf', 'stick', [0.03, 0.03, 0.95], 0xb0bec5, 'metal', 'melee', { p: { dmg: 2 } });

// ───────────────────────── INSTRUMENTS ─────────────────────────
d('piano', 'Piano droit', 'piano', [1.5, 1.25, 0.6], 0x1b1b1b, 'wood', 'piano', { fixed: true, desc: 'Jouez (E) avec les touches du clavier : rangée Q-S-D-F-G-H-J-K-L-M et rangée du haut pour les dièses.' });
d('synth_keyboard', 'Clavier synthé', 'keyboardsynth', [1.0, 0.1, 0.35], 0x263238, 'plastic', 'piano', { fixed: true, p: { instr: 'synth' } });
d('organ', 'Orgue électrique', 'piano', [1.3, 1.1, 0.6], 0x5d4037, 'wood', 'piano', { fixed: true, p: { instr: 'organ' } });
d('drum_kit', 'Batterie', 'drumkit', [1.6, 1.0, 1.2], 0x0d47a1, 'wood', 'drumkit', { fixed: true, desc: 'Jouez (E) : Q grosse caisse, S caisse claire, D charleston, F tom, G cymbale.' });
d('guitar', 'Guitare acoustique', 'guitar', [0.36, 1.0, 0.1], 0xc58940, 'wood', 'guitar', { desc: 'Clic gauche : grattez. R : changez d\'accord.' });
d('electric_guitar', 'Guitare électrique', 'guitar', [0.33, 1.0, 0.05], 0xd50000, 'wood', 'guitar', { p: { electric: true } });
d('violin', 'Violon', 'guitar', [0.2, 0.6, 0.08], 0x8d4a1d, 'wood', 'instrument', { p: { instr: 'organ', scale: [67, 69, 71, 72, 74, 76, 78, 79], squeaky: true }, desc: 'Sans cours, ça grince. Beaucoup.' });
d('trumpet', 'Trompette', 'horn', [0.12, 0.14, 0.5], 0xffc107, 'metal', 'instrument', { p: { instr: 'synth', scale: [60, 62, 64, 65, 67, 69, 70, 72] } });
d('flute', 'Flûte à bec', 'stick', [0.025, 0.025, 0.32], 0xfff3e0, 'plastic', 'instrument', { p: { instr: 'organ', scale: [72, 74, 76, 77, 79, 81, 83, 84] }, desc: 'Le souvenir de l\'école.' });
d('maracas', 'Maracas', 'maracas', [0.06, 0.22, 0.06], 0xff7043, 'wood', 'squeak', { p: { sound: 'rattle' } });
d('triangle', 'Triangle', 'triangle', [0.2, 0.2, 0.01], 0xc0c0c0, 'metal', 'instrument', { p: { instr: 'bell', scale: [96] } });
d('harmonica', 'Harmonica', 'box', [0.1, 0.02, 0.025], 0xb0bec5, 'metal', 'instrument', { p: { instr: 'organ', scale: [60, 64, 67, 72, 76] } });
d('tambourine', 'Tambourin', 'cyl', [0.25, 0.05, 0.25], 0xfff3e0, 'wood', 'squeak', { p: { sound: 'rattle', pitch: 1.4 } });
d('metronome', 'Métronome', 'top', [0.1, 0.2, 0.08], 0x5d4037, 'wood', 'loopdevice', { p: { sound: 'clock_tick' } });
d('sheet_music', 'Partition', 'card', [0.21, 0.3, 0.002], 0xffffff, 'paper', 'read', { p: { lore: 'sheet' } });

// ───────────────────────── DÉGUISEMENTS ─────────────────────────
d('costume_bear', 'Costume d\'ours', 'shirt', [0.5, 0.1, 0.4], 0xc8873a, 'soft', 'costume', { p: { costume: 'bear' } });
d('costume_ghost', 'Costume de fantôme', 'shirt', [0.5, 0.05, 0.4], 0xffffff, 'soft', 'costume', { p: { costume: 'ghost' } });
d('costume_police', 'Costume de policier', 'shirt', [0.45, 0.05, 0.35], 0x1a237e, 'soft', 'costume', { p: { costume: 'police' } });
d('costume_firefighter', 'Tenue de pompier', 'shirt', [0.45, 0.05, 0.35], 0x263238, 'soft', 'costume', { p: { costume: 'firefighter' } });
d('costume_mannequin', 'Body blanc mat', 'shirt', [0.45, 0.05, 0.35], 0xf0ece4, 'soft', 'costume', { p: { costume: 'mannequin' } });
d('costume_cat', 'Costume de chat', 'shirt', [0.45, 0.05, 0.35], 0x212121, 'soft', 'costume', { p: { costume: 'cat' } });
d('costume_clown', 'Costume de clown', 'shirt', [0.45, 0.05, 0.35], 0xff1744, 'soft', 'costume', { p: { costume: 'clown' } });
d('costume_astronaut', 'Combinaison d\'astronaute', 'shirt', [0.5, 0.1, 0.4], 0xeceff1, 'soft', 'costume', { p: { costume: 'astronaut' } });
d('mask_clown', 'Masque de clown', 'mask', [0.2, 0.25, 0.1], 0xffffff, 'plastic', 'wear', { p: { slot: 'face', look: 'masque de clown', scary: true } });
d('mask_pig', 'Masque de cochon', 'mask', [0.2, 0.22, 0.12], 0xf8bbd0, 'plastic', 'wear', { p: { slot: 'face', look: 'masque de cochon', scary: true } });
d('mask_skull', 'Masque de squelette', 'mask', [0.2, 0.25, 0.1], 0xeeeeee, 'plastic', 'wear', { p: { slot: 'face', look: 'masque de squelette', scary: true } });
d('wig', 'Perruque afro', 'sphere', [0.3, 0.25, 0.3], 0xff6d00, 'soft', 'wear', { p: { slot: 'head', look: 'perruque afro' } });
d('witch_hat', 'Chapeau de sorcière', 'cone', [0.35, 0.4, 0.35], 0x311b92, 'soft', 'wear', { p: { slot: 'head', look: 'chapeau de sorcière' } });
d('magic_wand', 'Baguette magique', 'stick', [0.015, 0.015, 0.35], 0xffd600, 'plastic', 'wand', { desc: 'Abracadabra (clic gauche). Il se passe… quelque chose ?' });
d('plastic_sword', 'Épée en plastique', 'stick', [0.05, 0.02, 0.7], 0xb0bec5, 'plastic', 'melee', { p: { dmg: 0.5 } });
d('cape', 'Cape de super-héros', 'shirt', [0.5, 0.02, 0.4], 0xd50000, 'soft', 'wear', { p: { slot: 'neck', look: 'cape' } });
d('fake_mustache', 'Fausse moustache', 'box', [0.08, 0.015, 0.02], 0x3e2723, 'soft', 'wear', { p: { slot: 'face', look: 'moustache' } });

// ───────────────────────── COIFFEUR ─────────────────────────
d('scissors', 'Ciseaux', 'scissors', [0.07, 0.01, 0.17], 0xb0bec5, 'metal', 'squeak', { p: { sound: 'lock_pick_click', pitch: 0.6 } });
d('comb', 'Peigne', 'box', [0.03, 0.005, 0.18], 0x212121, 'plastic', 'generic');
d('clippers', 'Tondeuse', 'box', [0.05, 0.16, 0.04], 0x212121, 'plastic', 'loopdevice', { p: { sound: 'shaver', hold: true } });
d('salon_chair', 'Fauteuil de coiffure', 'salonchair', [0.7, 1.1, 0.7], 0x111111, 'metal', 'chair_spin', F);
d('wig_head', 'Tête à perruque', 'head', [0.18, 0.28, 0.2], 0xf5e1d0, 'plastic', 'wig_head', { desc: 'Elle a l\'air de vous regarder.' });
d('hair_spray', 'Laque', 'can', [0.06, 0.2, 0.06], 0xe1bee7, 'can', 'spray', { p: { sound: 'spray' } });

// ───────────────────────── PHOTO ─────────────────────────
d('photobooth', 'Photomaton', 'photobooth', [1.0, 2.0, 1.4], 0xff5252, 'metal', 'photobooth', { fixed: true, desc: 'Entrez et appuyez (E) : 4 photos. Regardez-les bien.' });
d('photo_frame', 'Cadre photo', 'card', [0.2, 0.25, 0.02], 0x8d6e63, 'wood', 'read', { p: { lore: 'frame' } });
d('film_roll', 'Pellicule', 'cyl', [0.035, 0.05, 0.035], 0xffeb3b, 'plastic', 'generic');
d('photo_album', 'Album photo du centre', 'book', [0.3, 0.25, 0.05], 0x4e342e, 'paper', 'read', { p: { lore: 'album' } });
d('disposable_cam', 'Appareil jetable', 'camera', [0.11, 0.06, 0.04], 0xffeb3b, 'plastic', 'polaroid', { p: { shots: 5, flash: true }, desc: 'Le flash aveugle brièvement ce qui est en face.' });

// ───────────────────────── DÉCO & LUMIÈRES ─────────────────────────
d('lava_lamp', 'Lampe à lave', 'lavalamp', [0.12, 0.4, 0.12], 0xff3d00, 'glass', 'lamp', { p: { lava: true } });
d('disco_ball', 'Boule à facettes', 'sphere', [0.3, 0.3, 0.3], 0xe0e0e0, 'glass', 'disco', { desc: 'Allumez-la (E). Ambiance garantie, même seul à 3 h du matin.' });
d('string_lights', 'Guirlande lumineuse', 'rope', [0.2, 0.06, 0.2], 0xffe082, 'plastic', 'lamp', { p: { color: 0xffcc66 } });
d('cuckoo_clock', 'Coucou suisse', 'clock', [0.3, 0.45, 0.15], 0x5d4037, 'wood', 'clock', { desc: 'Coucou à chaque heure. Même à 3 h.' });
d('wall_clock', 'Horloge murale', 'clock', [0.35, 0.35, 0.05], 0xffffff, 'plastic', 'clock');
d('snow_globe', 'Boule à neige', 'snowglobe', [0.1, 0.12, 0.1], 0x90caf9, 'glass', 'snowglobe', { desc: 'Secouez-la (clic gauche). À l\'intérieur, une miniature du centre Hélios.' });
d('wind_chime', 'Carillon à vent', 'triangle', [0.15, 0.3, 0.15], 0xb0bec5, 'metal', 'squeak', { p: { sound: 'wind_chime' } });
d('mirror_deco', 'Miroir soleil', 'ring_big', [0.6, 0.6, 0.03], 0xffd54f, 'glass', 'mirror_wall', F);
d('cushion', 'Coussin', 'box', [0.4, 0.12, 0.4], 0x7986cb, 'soft', 'generic');
d('candle_set', 'Coffret de bougies', 'labelbox', [0.2, 0.1, 0.12], 0xfff3e0, 'cardboard', 'container', { label: 'BOUGIES', p: { contains: ['candle', 'candle', 'matches'] } });
d('neon_sign', 'Néon « OPEN »', 'card', [0.6, 0.25, 0.03], 0xff1744, 'glass', 'lamp', { p: { color: 0xff1744 } });

// ───────────────────────── GALAXY ARCADE ─────────────────────────
const ARCADE_TITLES = { invaders: 'Envahisseurs', racer: 'Turbo Hélios', glouton: 'Glouton', blocs: 'Blocs', platformer: 'Super Gardien', oiseau: 'L\'Oiseau', breakout: 'Casse-Briques', snake: 'Serpent', simon: 'Simon' };
for (const g of Object.keys(ARCADE_TITLES)) d('arcade_' + g, 'Borne d\'arcade « ' + ARCADE_TITLES[g] + ' »', 'arcade', [0.75, 1.8, 0.8], 0x1a1a2e, 'wood', 'arcade', { fixed: true, p: { game: g }, desc: 'Insérez un jeton (ou une pièce) et jouez (E).' });
d('claw_machine', 'Machine à pinces', 'claw', [0.9, 1.9, 0.9], 0xff4081, 'metal', 'claw', { fixed: true, desc: 'Un jeton, une chance. Les peluches gagnées tombent dans le bac.' });
d('kiddie_ride', 'Manège « Bobby-Mobile »', 'kiddie', [0.8, 1.2, 1.3], 0xffb300, 'plastic', 'kiddie', { fixed: true, desc: 'Une pièce et Bobby vous promène. Il démarre parfois tout seul la nuit.' });
d('token_machine', 'Distributeur de jetons', 'locker', [0.5, 1.5, 0.4], 0x1e88e5, 'metal', 'token_machine', { fixed: true, desc: 'Pièce de 2 € → 5 jetons.' });
d('air_hockey', 'Air hockey', 'airhockey', [1.2, 0.8, 2.0], 0x1565c0, 'wood', 'arcade', { fixed: true, p: { game: 'pong', screen: 'top' } });
d('basket_machine', 'Basket arcade', 'hoop', [1.0, 2.0, 2.4], 0xe65100, 'metal', 'hoop', { fixed: true, p: { arcade: true } });
d('dance_machine', 'Machine de danse', 'arcade', [1.2, 2.0, 1.2], 0xd500f9, 'metal', 'arcade', { fixed: true, p: { game: 'simon' } });
d('prize_plush', 'Peluche (lot)', 'plush', [0.18, 0.2, 0.14], 0xe040fb, 'soft', 'squeak', { p: { sound: 'squeak', pitch: 1.1 } });

// ───────────────────────── RESTAURATION ─────────────────────────
d('pizza', 'Pizza chaude', 'pizza', [0.3, 0.02, 0.3], 0xffc107, 'soft', 'eat', { p: { sound: 'eat_soft', food: 40, effect: 'calm' } });
d('pizza_slice', 'Part de pizza', 'box', [0.1, 0.015, 0.15], 0xffb300, 'soft', 'eat', { p: { sound: 'eat_soft', food: 12 } });
d('pizza_box', 'Carton de pizza', 'labelbox', [0.32, 0.04, 0.32], 0xfff8e1, 'cardboard', 'container', { label: 'PIZZA NAPOLI', p: { contains: ['pizza'] } });
d('pizza_oven', 'Four à pizza', 'oven_big', [1.4, 1.4, 1.2], 0x8d6e63, 'ceramic', 'microwave', { fixed: true, p: { oven: true, big: true } });
d('soda_fountain', 'Fontaine à soda', 'coffee_maker', [0.5, 0.7, 0.4], 0xd50000, 'metal', 'coffee_maker', { fixed: true, p: { gives: ['soda', 'lemonade'] } });
d('burger', 'Burger', 'burger', [0.11, 0.08, 0.11], 0xb5651d, 'soft', 'eat', { p: { sound: 'eat_soft', food: 30 } });
d('fries', 'Frites', 'fries', [0.08, 0.12, 0.05], 0xd32f2f, 'paper', 'eat', { p: { sound: 'eat_crunch', food: 15 } });
d('milkshake', 'Milkshake', 'cup', [0.08, 0.18, 0.08], 0xf8bbd0, 'plastic', 'drink', { p: { food: 15, effect: 'cold' } });
d('nuggets', 'Nuggets', 'labelbox', [0.1, 0.06, 0.08], 0xffc107, 'cardboard', 'eat', { label: 'NUGGETS', p: { sound: 'eat_crunch', food: 15 } });
d('ketchup', 'Ketchup', 'bottle', [0.06, 0.2, 0.06], 0xd50000, 'plastic', 'spray', { p: { sound: 'spray', splat: true } });
d('fryer', 'Friteuse', 'washer', [0.5, 0.9, 0.6], 0x9e9e9e, 'metal', 'fryer', F);
d('sushi', 'Plateau de sushis', 'box', [0.2, 0.04, 0.12], 0x263238, 'plastic', 'eat', { p: { sound: 'eat_soft', food: 25 } });
d('maki', 'Makis', 'box', [0.12, 0.04, 0.08], 0x1b5e20, 'plastic', 'eat', { p: { sound: 'eat_soft', food: 12 } });
d('wasabi', 'Wasabi', 'box', [0.03, 0.02, 0.06], 0x76ff03, 'plastic', 'eat', { p: { sound: 'eat_soft', food: 1, effect: 'spicy' }, desc: 'Ça monte au nez.' });
d('green_tea', 'Thé vert', 'can', [0.06, 0.12, 0.06], 0x558b2f, 'can', 'drink', { p: { effect: 'calm' } });
d('chopsticks', 'Baguettes', 'stick', [0.01, 0.01, 0.23], 0xc8a165, 'wood', 'generic');
d('rice_cooker', 'Cuiseur à riz', 'kettle', [0.3, 0.3, 0.3], 0xffffff, 'plastic', 'loopdevice', { fixed: true, p: { sound: 'kettle' } });
d('conveyor', 'Tapis roulant à sushis', 'conveyor', [3.0, 0.15, 0.4], 0x9e9e9e, 'metal', 'conveyor', F);
d('ice_cream', 'Cornet de glace', 'cone', [0.07, 0.18, 0.07], 0xf8bbd0, 'soft', 'eat', { p: { sound: 'eat_soft', food: 10, effect: 'cold' }, desc: 'Attention au mal de crâne.' });
d('sundae', 'Coupe glacée', 'cup', [0.1, 0.15, 0.1], 0xfff8e1, 'glass', 'eat', { p: { sound: 'eat_soft', food: 18, effect: 'cold' } });
d('waffle', 'Gaufre', 'box', [0.15, 0.02, 0.1], 0xd4a056, 'soft', 'eat', { p: { sound: 'eat_crunch', food: 14 } });
d('freezer', 'Congélateur à glaces', 'freezer', [1.4, 0.9, 0.7], 0xe3f2fd, 'metal', 'fridge', { fixed: true, p: { cold: true } });
d('candy_jar', 'Bocal de bonbons', 'jar', [0.15, 0.25, 0.15], 0xff4081, 'glass', 'eat', { p: { sound: 'eat_crunch', food: 5, effect: 'sugar', breakable: true, uses: 10 }, desc: 'Sucre = vitesse. Pendant un temps.' });
d('lollipop', 'Sucette géante', 'lollipop', [0.12, 0.3, 0.02], 0xff1744, 'plastic', 'eat', { p: { sound: 'eat_crunch', food: 4, effect: 'sugar' } });
d('marshmallow', 'Guimauves', 'bag', [0.15, 0.2, 0.06], 0xfce4ec, 'paper', 'eat', { p: { sound: 'eat_soft', food: 6, effect: 'sugar' } });
d('licorice', 'Rouleaux de réglisse', 'cyl', [0.06, 0.02, 0.06], 0x111111, 'soft', 'eat', { p: { sound: 'eat_soft', food: 3 } });
d('cotton_candy_machine', 'Machine à barbe à papa', 'cotton', [0.6, 1.0, 0.6], 0xf48fb1, 'metal', 'coffee_maker', { fixed: true, p: { gives: ['cotton_candy'], sound: 'blender' } });
d('cotton_candy', 'Barbe à papa', 'cotton_candy', [0.15, 0.3, 0.15], 0xf8bbd0, 'soft', 'eat', { p: { sound: 'eat_soft', food: 5, effect: 'sugar' } });
d('gumball_machine', 'Distributeur de boules', 'gumball', [0.3, 0.8, 0.3], 0xd50000, 'glass', 'gumball', { fixed: true, desc: 'Une pièce → une boule de chewing-gum.' });
d('gumball', 'Boule de chewing-gum', 'sphere', [0.025, 0.025, 0.025], 0x00e5ff, 'soft', 'gum');

// ───────────────────────── CINÉMA ─────────────────────────
d('popcorn_machine', 'Machine à pop-corn', 'popcorn_machine', [0.7, 1.6, 0.6], 0xd50000, 'glass', 'coffee_maker', { fixed: true, p: { gives: ['popcorn'], sound: 'popcorn' } });
d('popcorn', 'Pot de pop-corn', 'fries', [0.15, 0.22, 0.15], 0xffffff, 'paper', 'eat', { p: { sound: 'eat_crunch', food: 12, uses: 5 } });
d('ticket', 'Ticket de cinéma', 'card', [0.06, 0.12, 0.002], 0xffcc80, 'paper', 'read', { p: { text: 'Séance de 23h00 — Salle 1 — Rang M, siège 13. Imprimé ce soir. Vous n\'avez pas acheté de ticket.' } });
d('projector', 'Projecteur de cinéma', 'projector', [0.8, 0.8, 1.2], 0x37474f, 'metal', 'projector', { fixed: true, desc: 'Lance le film sur le grand écran (E). R : change de film.' });
d('film_reel', 'Bobine de film', 'cyl', [0.35, 0.05, 0.35], 0x546e7a, 'metal', 'film_reel', { desc: 'Une bobine. À mettre dans le projecteur ?' });

// ───────────────────────── INFORMATIQUE ─────────────────────────
d('laptop', 'Ordinateur portable', 'laptop', [0.34, 0.02, 0.24], 0x9e9e9e, 'plastic', 'computer', { p: { os: 'shop' }, desc: 'Ouvrez-le et utilisez-le (E).' });
d('pc_tower', 'Tour PC', 'locker', [0.2, 0.45, 0.45], 0x212121, 'metal', 'computer', { fixed: true, p: { os: 'shop' } });
d('keyboard', 'Clavier mécanique', 'keyboard', [0.45, 0.03, 0.15], 0x212121, 'plastic', 'squeak', { p: { sound: 'typewriter' } });
d('mouse', 'Souris', 'box', [0.06, 0.035, 0.11], 0x212121, 'plastic', 'squeak', { p: { sound: 'switch' } });
d('printer', 'Imprimante', 'printer', [0.45, 0.25, 0.4], 0xeeeeee, 'plastic', 'printer', { fixed: true, desc: 'Imprime une page (E). Elle imprime parfois des choses toute seule.' });
d('usb_key', 'Clé USB « NE PAS OUVRIR »', 'box', [0.02, 0.008, 0.05], 0xd50000, 'plastic', 'usb', { p: { lore: 'usb' }, desc: 'À brancher sur le PC du poste de sécurité.' });
d('hard_drive', 'Disque dur', 'box', [0.1, 0.02, 0.15], 0x455a64, 'metal', 'generic');
d('router', 'Routeur Wi-Fi', 'box', [0.2, 0.04, 0.12], 0x111111, 'plastic', 'generic', { desc: 'Clignote. Réseau : « HELIOS_GUEST ». Un deuxième réseau : « JE_TE_VOIS ».' });

// ───────────────────────── MOBILIER / FIXES DIVERS ─────────────────────────
d('register', 'Caisse enregistreuse', 'register', [0.45, 0.25, 0.4], 0x333333, 'metal', 'register', { fixed: true, desc: 'Fermée à clé. Un crochet pourrait l\'ouvrir… mais à vos risques.' });
d('safe', 'Coffre-fort', 'safe', [0.6, 0.7, 0.6], 0x37474f, 'metal', 'safe', { fixed: true, desc: 'Code à 4 chiffres.' });
d('locker', 'Casier', 'locker', [0.4, 1.8, 0.5], 0x546e7a, 'metal', 'locker', { fixed: true, desc: 'Ouvrable (E). On peut aussi s\'y cacher (R).' });
d('vending', 'Distributeur de boissons', 'vending', [0.9, 1.8, 0.8], 0xd50000, 'metal', 'vending', { fixed: true, desc: 'Une pièce → une boisson ou une friandise.' });
d('water_fountain', 'Fontaine à eau', 'cooler', [0.35, 1.2, 0.35], 0xe3f2fd, 'plastic', 'water_fountain', F);
d('fire_alarm', 'Déclencheur manuel d\'alarme', 'box', [0.12, 0.12, 0.05], 0xd50000, 'plastic', 'fire_alarm', { fixed: true, desc: 'BRISER LA GLACE. Déclenche l\'alarme incendie dans tout le centre.' });
d('extinguisher_box', 'Armoire à extincteur', 'locker', [0.35, 0.7, 0.25], 0xd50000, 'metal', 'container', { fixed: true, p: { contains: ['extinguisher'] } });
d('sink', 'Lavabo', 'sink', [0.6, 0.9, 0.5], 0xffffff, 'ceramic', 'sink', F);
d('hand_dryer', 'Sèche-mains', 'box', [0.3, 0.3, 0.2], 0xcfd8dc, 'metal', 'loopdevice', { fixed: true, p: { sound: 'hairdryer', dur: 5 } });
d('toilet', 'Toilettes', 'toilet', [0.4, 0.8, 0.6], 0xffffff, 'ceramic', 'toilet', F);
d('mirror_wall', 'Miroir', 'mirror', [1.2, 0.9, 0.02], 0xcfd8dc, 'glass', 'mirror_wall', F);
d('bench', 'Banc', 'bench', [2.0, 0.45, 0.5], 0x6d4c41, 'wood', 'sit', F);
d('chair', 'Chaise', 'chair', [0.45, 0.9, 0.45], 0x455a64, 'plastic', 'sit', { mass: 4 });
d('office_chair', 'Fauteuil de bureau', 'chair', [0.6, 1.1, 0.6], 0x212121, 'plastic', 'chair_spin', { mass: 8 });
d('massage_chair', 'Fauteuil massant', 'salonchair', [0.9, 1.2, 1.2], 0x3e2723, 'soft', 'massage', { fixed: true, desc: 'Une pièce, 2 minutes de massage. Le stress fond.' });
d('atm', 'Distributeur de billets', 'vending', [0.8, 1.9, 0.5], 0x37474f, 'metal', 'atm', F);
d('fountain', 'Fontaine de l\'atrium', 'fountainbig', [6, 1, 6], 0x90a4ae, 'ceramic', 'fountain', F);
d('notice_board', 'Panneau d\'affichage du personnel', 'board', [1.2, 0.9, 0.03], 0x8d6e63, 'wood', 'read', { fixed: true, p: { lore: 'noticeboard' } });
d('generator', 'Groupe électrogène', 'generator', [2.2, 1.6, 1.2], 0xf9a825, 'metal', 'generator', F);
d('breaker_panel', 'Tableau électrique général', 'panel', [1.8, 2.0, 0.3], 0x90a4ae, 'metal', 'breakers', F);
d('pa_console', 'Console de sonorisation', 'console_pa', [1.2, 0.9, 0.7], 0x263238, 'metal', 'pa', F);
d('boiler', 'Chaudière', 'boiler', [1.2, 2.2, 1.2], 0x8d6e63, 'metal', 'boiler', F);
d('forklift', 'Chariot élévateur', 'forklift', [1.2, 2.2, 2.4], 0xffa000, 'metal', 'forklift', F);
d('car', 'Voiture', 'car', [1.8, 1.45, 4.2], 0x1565c0, 'metal', 'car', F);
d('cardboard_box', 'Carton', 'labelbox', [0.5, 0.4, 0.4], 0xa1887f, 'cardboard', 'container', { label: 'FRAGILE', p: { random: true }, desc: 'Ouvrez-le (E) : contenu aléatoire.' });
d('mannequin', 'Mannequin', 'mannequin', [0.5, 1.85, 0.3], 0xf0ece4, 'plastic', 'mannequin', F);
d('pallet', 'Palette', 'box', [1.2, 0.15, 1.0], 0xb08d57, 'wood', 'generic', F);
d('trash_can', 'Poubelle', 'cyl', [0.4, 0.8, 0.4], 0x455a64, 'metal', 'container', { fixed: true, p: { random: 'trash' } });
d('cash_drawer_money', 'Recette de la caisse', 'cash', [0.15, 0.03, 0.08], 0x4a8a4a, 'paper', 'cash', { value: 350 });
d('director_whisky', 'Whisky du directeur', 'wine', [0.09, 0.28, 0.09], 0x8d4a1d, 'glass', 'drink', { p: { effect: 'drunk', breakable: true }, desc: 'Un 18 ans d\'âge. Il va le remarquer.' });
d('desk_phone', 'Téléphone fixe', 'deskphone', [0.22, 0.1, 0.2], 0x212121, 'plastic', 'phone', { fixed: true, desc: 'Composez un numéro (E).' });
d('microphone', 'Micro d\'annonce', 'stick', [0.04, 0.04, 0.2], 0x212121, 'metal', 'pa', F);
d('cassette_rec', 'Enregistreur CCTV', 'vcr', [0.45, 0.12, 0.35], 0x111111, 'metal', 'recorder', F);
d('water_heater', 'Chauffe-eau', 'boiler', [0.6, 1.5, 0.6], 0xeceff1, 'metal', 'boiler', F);
d('pet_bowl', 'Gamelle', 'cyl', [0.15, 0.05, 0.15], 0xff5252, 'plastic', 'cat_food', { p: { bowl: true } });
d('banana_peel', 'Peau de banane', 'box', [0.1, 0.01, 0.06], 0xfbc02d, 'soft', 'peel', { desc: 'Glissant. Très glissant.' });
d('foam_dart', 'Fléchette en mousse', 'stick', [0.015, 0.015, 0.07], 0xff9800, 'soft', 'generic');
d('polaroid_strip', 'Bande du photomaton', 'card', [0.05, 0.2, 0.002], 0xffffff, 'paper', 'photo', { p: { strip: true } });
d('gerard_note', 'Note de Gérard', 'card', [0.1, 0.1, 0.002], 0xfff176, 'paper', 'read', { p: { lore: 'gerard_note' } });
d('lore_page', 'Page déchirée', 'card', [0.15, 0.21, 0.002], 0xe8d9b0, 'paper', 'read', { p: { lore: 'page' } });
d('b13_key', 'Clé rouillée « B-13 »', 'keys', [0.06, 0.02, 0.04], 0x8d6e63, 'metal', 'keys', { p: { b13: true }, desc: 'Une vieille clé. L\'étiquette dit B-13.' });

export const ITEM_COUNT = Object.keys(ITEMS).length;
