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


// ═════════════════════════ GAMMES DES RAYONS ═════════════════════════
// G(catégorie, défauts, lignes) : ligne = [id, nom, forme, [l, h, p], couleur, options]. Les options complètent les
// défauts (p fusionné). Étiquettes : b marque, l nom imprimé, sub poids / variante, pi pictogramme, c2 accent ou
// bouchon, lc fond d'étiquette (sinon la couleur). cat : famille utilisée par le remplissage des rayons (stocking.js).
function G(cat, def, rows) {
  for (const r of rows) {
    const x = r[5] || {}, o = Object.assign({}, def, x); const p = Object.assign({}, def.p || {}, x.p || {});
    delete o.mat; delete o.use; if (Object.keys(p).length) o.p = p; else delete o.p; o.cat = x.cat || cat;
    d(r[0], r[1], r[2], r[3], r[4], x.mat || def.mat, x.use || def.use, o);
  }
}
const low = (n) => n.charAt(0).toLowerCase() + n.slice(1);
const deN = (n) => (/^[aeiouyéèêàâîïôûœh]/i.test(n) ? 'd\'' : 'de ') + low(n);
// Présentoir prêt-à-vendre (barquette carton) : nx × nz unités, rangs arrière simplifiés
// (unités plates : présentoir de comptoir avec fronton imprimé, sinon invisible sur l'étagère)
function TRAY(of, nx, nz, o = {}) {
  const u = ITEMS[of], n = nx * nz, W = +(nx * (u.s[0] + 0.004) + 0.008).toFixed(3), flat = u.s[1] < 0.05;
  const { pk = {}, ...rest } = o;
  d(o.id || 'tray_' + of, 'Présentoir ' + deN(u.name) + ' (×' + n + ')', 'ptray', [W, flat ? +Math.min(0.15, Math.max(0.1, W * 0.4)).toFixed(3) : +(u.s[1] + 0.006).toFixed(3), +(nz * (u.s[2] + 0.004) + 0.008).toFixed(3)], 0xf5f5f5, 'cardboard', 'container',
    Object.assign({ cat: u.cat, p: { contains: Array(n).fill(of) }, desc: 'Barquette en carton prête à vendre : ' + n + ' × ' + low(u.name) + '. R sur le rayon pour en prendre un, ou emportez tout.' }, rest, { pk: { of, nx, nz, ...(flat ? { hdr: true } : {}), ...pk } }));
}
// Carton de réserve fermé (n unités)
function CASE(of, n, o = {}) {
  const u = ITEMS[of]; const per = Math.max(1, Math.round(Math.cbrt(n)));
  const s = o.s || [+Math.min(0.6, Math.max(0.2, (u.s[0] + 0.005) * Math.ceil(n / (per * per)) + 0.02)).toFixed(2), +Math.min(0.5, Math.max(0.15, (u.s[1] + 0.005) * per + 0.02)).toFixed(2), +Math.min(0.5, Math.max(0.2, (u.s[2] + 0.005) * per + 0.02)).toFixed(2)];
  d(o.id || 'case_' + of, 'Carton ' + deN(u.name) + ' (×' + n + ')', 'pcase', s, 0xc8a46e, 'cardboard', 'container',
    Object.assign({ cat: u.cat, b: u.b, l: u.l ?? u.name, sub: '× ' + n, pk: { of, n }, p: { contains: Array(n).fill(of) }, mass: 3, desc: 'Carton de réserve scellé : ' + n + ' × ' + low(u.name) + '. Ouvrez-le (clic gauche) pour en sortir un.' }, o));
}
// Lot sous film ou étui carton
function PACK(id, name, of, nx, nz, s, c, o = {}) {
  const u = ITEMS[of], { mat = 'plastic', pk = {}, ...rest } = o;
  d(id, name, 'pmulti', s, c, mat, 'container', Object.assign({ cat: u.cat, b: u.b, l: u.l ?? u.name, p: { contains: Array(nx * nz).fill(of) }, desc: 'Lot de ' + nx * nz + ' × ' + low(u.name) + '. Ouvrez-le (clic gauche) pour en prendre un.' }, rest, { pk: { of, nx, nz, ...pk } }));
}

// ───────────────────────── HYPERMARCHÉ : ÉPICERIE SALÉE ─────────────────────────
const CRUNCH = { sound: 'eat_crunch' }, SOFT = { sound: 'eat_soft' };
G('pates', { mat: 'cardboard', use: 'eat', p: { ...CRUNCH, food: 2, raw: true }, desc: 'Des pâtes crues. Ça craque sous la dent, mais ça cale (un peu).' }, [
  ['pasta_spaghetti', 'Spaghetti n° 5', 'pbox', [0.075, 0.27, 0.04], 0x1565c0, { b: 'Pastavia', l: 'Spaghetti', sub: '500 g', pi: 'pasta', c2: 0xffd600 }],
  ['pasta_penne', 'Penne rigate', 'pbox', [0.1, 0.2, 0.055], 0x0d47a1, { b: 'Pastavia', l: 'Penne', sub: '500 g', pi: 'pasta', c2: 0xffca28 }],
  ['pasta_fusilli', 'Fusilli', 'pbox', [0.1, 0.2, 0.055], 0x1976d2, { b: 'Pastavia', l: 'Fusilli', sub: '500 g', pi: 'pasta', c2: 0xffffff }],
  ['pasta_coquillettes', 'Coquillettes', 'pbox', [0.1, 0.19, 0.055], 0xc62828, { b: 'La Ferme Dorée', l: 'Coquillettes', sub: '500 g', pi: 'pasta', c2: 0xffd600, desc: 'Avec du jambon et du gruyère, le repas des nuits blanches. Crues, c\'est moins bien.' }],
  ['pasta_tagliatelle', 'Tagliatelles aux œufs', 'pbox', [0.14, 0.17, 0.05], 0xffb300, { b: 'Bella Pasta', l: 'Tagliatelle', sub: 'aux œufs frais', pi: 'egg', c2: 0x2e7d32 }],
  ['pasta_lasagne', 'Feuilles de lasagne', 'pbox', [0.12, 0.2, 0.035], 0x2e7d32, { b: 'Bella Pasta', l: 'Lasagne', sub: '500 g', pi: 'pasta', c2: 0xd32f2f }],
  ['pasta_farfalle', 'Farfalle', 'ppouch', [0.13, 0.22, 0.06], 0xfff8e1, { b: 'Bella Pasta', l: 'Farfalle', sub: '500 g', pi: 'pasta', c2: 0x2e7d32, mat: 'plastic' }],
]);
G('riz', { mat: 'cardboard', use: 'eat', p: { ...CRUNCH, food: 2, raw: true }, desc: 'Cru, c\'est du gravier. Mais du gravier qui nourrit.' }, [
  ['rice_long', 'Riz long grain', 'pbox', [0.12, 0.19, 0.07], 0xd32f2f, { b: 'Riz d\'Or', l: 'Riz long', sub: '1 kg', pi: 'rice', c2: 0xffd600 }],
  ['rice_basmati', 'Riz basmati', 'ppouch', [0.15, 0.24, 0.07], 0x6a1b9a, { b: 'Riz d\'Or', l: 'Basmati', sub: '1 kg', pi: 'rice', c2: 0xffd600, mat: 'plastic' }],
  ['rice_risotto', 'Riz pour risotto', 'pbox', [0.11, 0.18, 0.065], 0x283593, { b: 'Bella Pasta', l: 'Arborio', sub: 'risotto', pi: 'rice', c2: 0x43a047 }],
  ['semoule', 'Semoule moyenne', 'pbox', [0.11, 0.17, 0.06], 0xf9a825, { b: 'La Ferme Dorée', l: 'Semoule', sub: '500 g', pi: 'wheat', c2: 0x1565c0 }],
  ['lentils', 'Lentilles vertes', 'ppouch', [0.13, 0.2, 0.05], 0x33691e, { b: 'Potagerie', l: 'Lentilles', sub: 'vertes', pi: 'leaf', c2: 0xfff176, mat: 'plastic' }],
  ['quinoa', 'Quinoa blond', 'pbox', [0.11, 0.17, 0.06], 0xf5f5f5, { b: 'Bio Village', l: 'Quinoa', sub: 'bio', pi: 'leaf', c2: 0x43a047, lay: 4 }],
  ['puree_flakes', 'Purée en flocons', 'pbox', [0.15, 0.19, 0.05], 0xfbc02d, { b: 'Potagerie', l: 'Purée', sub: '4 × 125 g', pi: 'bowl', c2: 0x1b5e20, p: { sound: 'eat_soft', food: 4 }, desc: 'Ajoutez de l\'eau chaude… ou mangez les flocons à la poignée.' }],
]);
G('conserves', { mat: 'can', use: 'eat', p: { ...SOFT, food: 14 }, desc: 'Une boîte de conserve. Froide, mais nourrissante.' }, [
  ['can_peas', 'Petits pois carottes', 'pcan', [0.075, 0.11, 0.075], 0x2e7d32, { b: 'Potagerie', l: 'Petits pois carottes', pi: 'carrot', sub: '400 g' }],
  ['can_corn', 'Maïs doux', 'pcan', [0.075, 0.11, 0.075], 0xfbc02d, { b: 'Potagerie', l: 'Maïs doux', pi: 'sun', sub: '285 g', lc: 0x1b5e20 }],
  ['can_beans', 'Haricots verts extra-fins', 'pcan', [0.075, 0.11, 0.075], 0x388e3c, { b: 'Potagerie', l: 'Haricots verts', pi: 'leaf', sub: 'extra-fins' }],
  ['can_tomato', 'Tomates pelées', 'pcan', [0.075, 0.11, 0.075], 0xd32f2f, { b: 'Tomatissima', l: 'Tomates pelées', pi: 'tomato', sub: '400 g' }],
  ['can_cassoulet', 'Cassoulet', 'pcan', [0.1, 0.125, 0.1], 0x8d4a1d, { b: 'Bonne Table', l: 'Cassoulet', pi: 'soup', sub: '840 g', p: { food: 30, cook: 'hot_cassoulet' }, desc: 'Le cassoulet du gardien. Meilleur réchauffé au micro-ondes.' }],
  ['can_chili', 'Chili con carne', 'pcan', [0.085, 0.11, 0.085], 0xbf360c, { b: 'Bonne Table', l: 'Chili', pi: 'pepper', sub: 'épicé', p: { food: 20, effect: 'spicy' } }],
  ['can_soup', 'Velouté de potiron', 'pcan', [0.075, 0.12, 0.075], 0xef6c00, { b: 'Bonne Table', l: 'Velouté', pi: 'soup', sub: 'potiron', p: { food: 10, effect: 'calm' } }],
  ['can_lentils', 'Lentilles cuisinées', 'pcan', [0.085, 0.11, 0.085], 0x5d4037, { b: 'Bonne Table', l: 'Lentilles', pi: 'soup', sub: 'au jambon', p: { food: 20 } }],
  ['can_chickpeas', 'Pois chiches', 'pcan', [0.075, 0.11, 0.075], 0xf9a825, { b: 'Potagerie', l: 'Pois chiches', pi: 'leaf', lc: 0x6d4c41 }],
  ['can_mushrooms', 'Champignons de Paris', 'pcan', [0.075, 0.09, 0.075], 0x6d4c41, { b: 'Potagerie', l: 'Champignons', pi: 'leaf', lc: 0xfff8e1, sub: 'émincés' }],
  ['can_peaches', 'Pêches au sirop', 'pcan', [0.085, 0.11, 0.085], 0xffb74d, { b: 'Vergers du Sud', l: 'Pêches au sirop', pi: 'orange', pc: 0xffa726, p: { food: 12, effect: 'sugar' } }],
  ['can_tuna', 'Thon au naturel', 'pcan', [0.085, 0.04, 0.085], 0x0277bd, { b: 'Marée Belle', l: 'Thon', pi: 'fish', sub: 'au naturel', p: { food: 12, smell: true }, desc: 'Le chat errant sent l\'odeur à trois rayons de distance.' }],
  ['can_mackerel', 'Maquereaux à la moutarde', 'pcan', [0.085, 0.035, 0.085], 0xffd600, { b: 'Marée Belle', l: 'Maquereaux', pi: 'fish', pc: 0x37474f, sub: 'moutarde', p: { food: 12, smell: true } }],
  ['can_sardines', 'Sardines à l\'huile', 'pbox', [0.105, 0.025, 0.075], 0x1a237e, { b: 'Marée Belle', l: 'Sardines', pi: 'fish', sub: 'à l\'huile d\'olive', top: true, p: { food: 12, smell: true }, desc: 'La boîte s\'ouvre avec une languette. Le chat errant l\'adore.' }],
  ['choucroute', 'Choucroute garnie', 'pcan', [0.1, 0.13, 0.1], 0xf0f4c3, { b: 'Bonne Table', l: 'Choucroute', pi: 'soup', lc: 0x1b5e20, p: { food: 30 } }],
]);
d('hot_cassoulet', 'Cassoulet chaud', 'pcan', [0.1, 0.125, 0.1], 0x8d4a1d, 'can', 'eat', { cat: 'conserves', b: 'Bonne Table', l: 'Cassoulet', pi: 'flame', p: { sound: 'eat_soft', food: 40, effect: 'calm' }, desc: 'Brûlant, réconfortant, parfait à 3 h du matin.' });
G('sauces', { mat: 'glass', use: 'eat', p: { ...SOFT, food: 4, breakable: true }, desc: 'Un condiment. À la petite cuillère, c\'est discutable.' }, [
  ['sauce_tomato', 'Sauce tomate basilic', 'pjar', [0.075, 0.13, 0.075], 0xc62828, { b: 'Tomatissima', l: 'Sauce tomate', sub: 'basilic', pi: 'tomato', c2: 0x2e7d32 }],
  ['sauce_bolo', 'Sauce bolognaise', 'pjar', [0.075, 0.13, 0.075], 0x8d2a2a, { b: 'Tomatissima', l: 'Bolognaise', pi: 'tomato', c2: 0xffd600, p: { food: 8 } }],
  ['pesto', 'Pesto alla genovese', 'pjar', [0.065, 0.085, 0.065], 0x558b2f, { b: 'Bella Pasta', l: 'Pesto', pi: 'leaf', c2: 0xd32f2f }],
  ['mustard', 'Moutarde de Dijon', 'pjar', [0.068, 0.1, 0.068], 0xfdd835, { b: 'Moutarderie Fine', l: 'Moutarde', sub: 'de Dijon', pi: 'leaf', c2: 0x6d4c41, lay: 4, p: { effect: 'spicy', food: 1 }, desc: 'Forte. Très forte. Les yeux pleurent.' }],
  ['mayonnaise', 'Mayonnaise', 'pbot', [0.07, 0.19, 0.07], 0xfff9c4, { sil: 'sauce', mat: 'plastic', b: 'Moutarderie Fine', l: 'Mayonnaise', pi: 'egg', c2: 0xffd600, p: { breakable: false, food: 6 } }],
  ['cornichons', 'Cornichons extra-fins', 'pjar', [0.08, 0.15, 0.08], 0x689f38, { b: 'Potagerie', l: 'Cornichons', pi: 'leaf', c2: 0xd32f2f, p: { effect: 'sour', food: 2 } }],
  ['olives_jar', 'Olives vertes', 'pjar', [0.075, 0.12, 0.075], 0x827717, { b: 'Saveurs du Midi', l: 'Olives', pi: 'olive', c2: 0x2e7d32 }],
  ['harissa', 'Harissa', 'ptube', [0.05, 0.15, 0.03], 0xd50000, { mat: 'plastic', b: 'Saveurs du Midi', l: 'Harissa', pi: 'pepper', c2: 0xffd600, p: { effect: 'spicy', breakable: false }, desc: 'Une noisette suffit. Le tube entier : mauvaise idée.' }],
  ['soy_sauce_bottle', 'Sauce soja', 'pbot', [0.055, 0.17, 0.055], 0x3e2723, { sil: 'oil', b: 'Zen', l: 'Sauce soja', pi: 'leaf', c2: 0xd32f2f, lc: 0xfafafa }],
  ['salt_box', 'Sel fin iodé', 'pcan', [0.075, 0.14, 0.075], 0x1e88e5, { mat: 'cardboard', b: 'Salins du Midi', l: 'Sel fin', pi: 'waves', p: { food: 0, sound: 'eat_crunch', breakable: false }, desc: 'Du sel. On raconte qu\'une ligne de sel empêche certaines choses de passer.' }],
  ['pepper_jar', 'Poivre noir moulu', 'pjar', [0.05, 0.1, 0.05], 0x212121, { b: 'Épices Lucie', l: 'Poivre noir', pi: 'leaf', c2: 0x212121, p: { effect: 'spicy', food: 0 } }],
  ['herbes_provence', 'Herbes de Provence', 'pjar', [0.05, 0.1, 0.05], 0x33691e, { b: 'Épices Lucie', l: 'Herbes de Provence', pi: 'leaf', c2: 0x7b1fa2, p: { food: 0 } }],
  ['bouillon_cubes', 'Bouillon cubes', 'pbox', [0.08, 0.06, 0.04], 0xffb300, { mat: 'cardboard', b: 'Bonne Table', l: 'Bouillon', sub: '×10', pi: 'chicken', p: { food: 1, breakable: false, sound: 'eat_crunch' } }],
]);
G('huiles', { mat: 'glass', use: 'drink', p: { food: 2, effect: 'sick', breakable: true }, desc: 'Ça ne se boit pas. Vraiment pas.' }, [
  ['oil_olive', 'Huile d\'olive vierge extra', 'pbot', [0.075, 0.3, 0.075], 0x33691e, { sil: 'oil', b: 'Olivia', l: 'Huile d\'olive', sub: 'vierge extra', pi: 'olive', c2: 0xd4af37, lc: 0xfff8e1 }],
  ['oil_sunflower', 'Huile de tournesol', 'pbot', [0.08, 0.3, 0.08], 0xfbc02d, { sil: 'oil', mat: 'plastic', b: 'Tournesoleil', l: 'Tournesol', sub: '1 L', pi: 'sun', c2: 0x2e7d32, lc: 0x1b5e20, p: { breakable: false } }],
  ['vinegar', 'Vinaigre de vin rouge', 'pbot', [0.07, 0.27, 0.07], 0x7b1f1f, { sil: 'oil', b: 'Moutarderie Fine', l: 'Vinaigre', sub: 'de vin', pi: 'grape', c2: 0xd4af37, lc: 0xfff8e1 }],
  ['balsamic', 'Vinaigre balsamique', 'pbot', [0.06, 0.24, 0.06], 0x212121, { sil: 'liquor', b: 'Bella Pasta', l: 'Balsamique', pi: 'grape', c2: 0xd4af37, lc: 0x4e342e }],
]);
G('apero', { mat: 'paper', use: 'eat', p: { sound: 'eat_chips', food: 8, loud: true }, desc: 'Pour l\'apéritif. Bruyant à manger : les présences entendent tout.' }, [
  ['chips_paprika', 'Chips paprika', 'pbag', [0.2, 0.28, 0.07], 0xd84315, { b: 'Croustil', l: 'Paprika', pi: 'chips', sub: '150 g' }],
  ['chips_vinegar', 'Chips sel & vinaigre', 'pbag', [0.2, 0.28, 0.07], 0x1e88e5, { b: 'Croustil', l: 'Sel & vinaigre', pi: 'chips' }],
  ['chips_bbq', 'Chips goût barbecue', 'pbag', [0.2, 0.28, 0.07], 0x4e342e, { b: 'Croustil', l: 'Barbecue', pi: 'flame' }],
  ['tortilla_chips', 'Tortillas chips', 'pbag', [0.2, 0.28, 0.07], 0xf9a825, { b: 'El Sol', l: 'Tortillas', pi: 'sun', pc: 0xff6f00 }],
  ['chips_tube', 'Tuiles salées en tube', 'pcan', [0.075, 0.24, 0.075], 0xd32f2f, { mat: 'cardboard', b: 'Croustil', l: 'Tuiles', sub: 'original', pi: 'chips' }],
  ['peanuts', 'Cacahuètes grillées', 'pbag', [0.14, 0.2, 0.05], 0x8d6e63, { b: 'Apéro Club', l: 'Cacahuètes', pi: 'bean', sub: 'grillées salées' }],
  ['pretzels', 'Bretzels', 'pbag', [0.16, 0.24, 0.06], 0x1565c0, { b: 'Apéro Club', l: 'Bretzels', pi: 'bread' }],
  ['crackers', 'Biscuits apéritif', 'pbox', [0.2, 0.14, 0.05], 0xffa000, { mat: 'cardboard', b: 'Apéro Club', l: 'Crackers', pi: 'cookie', sub: 'emmental' }],
  ['popcorn_micro', 'Pop-corn pour micro-ondes', 'pbox', [0.15, 0.2, 0.05], 0xd32f2f, { mat: 'cardboard', b: 'Ciné Club', l: 'Pop-corn', sub: '3 sachets', pi: 'star', p: { food: 2, raw: true, cook: 'popcorn', loud: false }, desc: 'Trois minutes au micro-ondes et le poste sent le cinéma.' }],
]);

// ───────────────────────── PETIT-DÉJEUNER & SUCRÉ ─────────────────────────
G('cereales', { mat: 'cardboard', use: 'eat', p: { ...CRUNCH, food: 12 }, desc: 'Des céréales, même sans lait. Croc, croc, croc.' }, [
  ['cereal_choco', 'Pétales au chocolat', 'pbox', [0.19, 0.29, 0.07], 0x5d4037, { b: 'Matinal', l: 'Pétales Choco', pi: 'bowl', sub: '375 g', c2: 0xffd600 }],
  ['cereal_honey', 'Boules au miel', 'pbox', [0.19, 0.29, 0.07], 0xffb300, { b: 'Matinal', l: 'Boules au miel', pi: 'bowl', pc: 0xff8f00, sub: '400 g', c2: 0x6d4c41 }],
  ['cereal_flakes', 'Pétales de maïs', 'pbox', [0.19, 0.29, 0.07], 0xfdd835, { b: 'Matinal', l: 'Corn Flakes', pi: 'sun', c2: 0xd32f2f }],
  ['cereal_muesli', 'Muesli croustillant', 'pbox', [0.17, 0.27, 0.07], 0x2e7d32, { b: 'Bio Village', l: 'Muesli', pi: 'wheat', sub: 'aux fruits secs', c2: 0xffd600 }],
  ['cereal_bobby', 'Céréales Bobby', 'pbox', [0.19, 0.29, 0.07], 0xc8873a, { b: 'Royaume du Jouet', l: 'Bobby Céréales', pi: 'bear', pc: 0xc8873a, sub: 'avec surprise', c2: 0xd32f2f, desc: 'Une boîte à l\'effigie de Bobby l\'Ourson. Le sourire de l\'ours sur la boîte est… un peu trop large.' }],
  ['cereal_fiber', 'Son & fibres', 'pbox', [0.17, 0.27, 0.06], 0x6d4c41, { b: 'Matinal', l: 'Fibres +', pi: 'wheat', c2: 0xfff176, lay: 4 }],
]);
G('cafe', { mat: 'paper', use: 'eat', p: { ...CRUNCH, food: 1, effect: 'energy' }, desc: 'Du café en grains ou moulu : croqué tel quel, il réveille un mort.' }, [
  ['coffee_ground', 'Café moulu pur arabica', 'pbox', [0.08, 0.14, 0.055], 0x3e2723, { b: 'Arôme Noir', l: 'Pur Arabica', pi: 'bean', sub: '250 g', c2: 0xd4af37 }],
  ['coffee_beans', 'Café en grains', 'ppouch', [0.13, 0.22, 0.07], 0x212121, { b: 'Arôme Noir', l: 'Grains', pi: 'bean', sub: '1 kg', c2: 0xd4af37, mat: 'plastic' }],
  ['coffee_instant', 'Café soluble', 'pjar', [0.085, 0.14, 0.085], 0x4e342e, { mat: 'glass', b: 'Arôme Noir', l: 'Soluble', pi: 'cup', c2: 0xd32f2f, p: { breakable: true } }],
  ['coffee_pods', 'Dosettes de café', 'pbox', [0.13, 0.13, 0.11], 0x6d4c41, { mat: 'cardboard', b: 'Arôme Noir', l: 'Dosettes', sub: '×36', pi: 'cup', c2: 0xffb300 }],
  ['tea_mint', 'Thé vert à la menthe', 'pbox', [0.13, 0.075, 0.07], 0x2e7d32, { mat: 'cardboard', b: 'Thé des Brumes', l: 'Menthe', pi: 'tea', p: { effect: 'calm', sound: 'paper' } }],
  ['tea_earl', 'Thé noir bergamote', 'pbox', [0.13, 0.075, 0.07], 0x1a237e, { mat: 'cardboard', b: 'Thé des Brumes', l: 'Earl Grey', pi: 'tea', c2: 0xd4af37, p: { effect: 'calm', sound: 'paper' } }],
  ['infusion_night', 'Infusion « Nuit calme »', 'pbox', [0.13, 0.075, 0.07], 0x5e35b1, { mat: 'cardboard', b: 'Thé des Brumes', l: 'Nuit calme', pi: 'moon', sub: 'verveine tilleul', p: { effect: 'sleepy', sound: 'paper' }, desc: 'Verveine et tilleul. À déconseiller pendant une garde de nuit.' }],
  ['cocoa_powder', 'Chocolat en poudre', 'pcan', [0.11, 0.17, 0.11], 0xffd600, { mat: 'cardboard', b: 'Mireille', l: 'Cacao', pi: 'cup', pc: 0x6d4c41, lc: 0xffd600, sub: '800 g', p: { effect: 'calm', sound: 'eat_soft', food: 4 } }],
]);
G('tartiner', { mat: 'glass', use: 'eat', p: { ...SOFT, food: 10, breakable: true }, desc: 'À la cuillère, en cachette. Personne ne verra rien. Sauf les caméras.' }, [
  ['spread_choco', 'Pâte à tartiner noisette', 'pjar', [0.09, 0.12, 0.09], 0x4e342e, { b: 'Mireille', l: 'Choco Noisette', pi: 'choco', c2: 0xffffff, lc: 0xfafafa, p: { effect: 'calm', food: 15 } }],
  ['jam_apricot', 'Confiture d\'abricots', 'pjar', [0.075, 0.1, 0.075], 0xff8f00, { b: 'Mère Odile', l: 'Abricot', pi: 'orange', c2: 0xd32f2f, lc: 0xfff8e1 }],
  ['marmalade', 'Marmelade d\'oranges', 'pjar', [0.075, 0.1, 0.075], 0xef6c00, { b: 'Mère Odile', l: 'Orange amère', pi: 'orange', c2: 0x2e7d32, lc: 0xfff8e1 }],
  ['honey_lavender', 'Miel de lavande', 'pjar', [0.07, 0.09, 0.07], 0xffca28, { b: 'Rucher du Val', l: 'Lavande', pi: 'flower', pc: 0x7e57c2, c2: 0xd4af37, p: { effect: 'calm' }, desc: 'Bobby adore le miel. Celui-ci aussi.' }],
  ['biscottes', 'Biscottes', 'pbox', [0.2, 0.11, 0.07], 0xffb300, { mat: 'cardboard', b: 'Fournil Doré', l: 'Biscottes', pi: 'bread', sub: '×36', p: { ...CRUNCH, food: 8, breakable: false } }],
  ['brioche_sliced', 'Brioche tranchée', 'pbox', [0.12, 0.12, 0.27], 0xffca28, { mat: 'paper', b: 'Fournil Doré', l: 'Brioche', pi: 'bread', p: { food: 15, breakable: false } }],
  ['pains_au_lait', 'Pains au lait ×10', 'pbag', [0.22, 0.12, 0.16], 0xfff3e0, { mat: 'paper', b: 'Fournil Doré', l: 'Pains au lait', pi: 'bread', lc: 0x1565c0, p: { food: 14, breakable: false } }],
]);
G('biscuits', { mat: 'cardboard', use: 'eat', p: { ...CRUNCH, food: 10 }, desc: 'Un paquet de biscuits. Le meilleur ami du gardien de nuit.' }, [
  ['biscuit_butter', 'Sablés au beurre', 'pbox', [0.2, 0.06, 0.06], 0xfbc02d, { b: 'Biscuiterie Lucien', l: 'Sablés au beurre', pi: 'cookie', c2: 0x1565c0 }],
  ['biscuit_choco', 'Biscuits fourrés chocolat', 'pbox', [0.2, 0.06, 0.06], 0x4e342e, { b: 'Biscuiterie Lucien', l: 'Fourrés choco', pi: 'cookie', c2: 0xffd600 }],
  ['cookies_pack', 'Cookies aux pépites', 'pbag', [0.18, 0.22, 0.05], 0x5d4037, { mat: 'paper', b: 'Croquandise', l: 'Cookies', pi: 'cookie', sub: 'pépites de chocolat' }],
  ['speculoos', 'Spéculoos', 'pbox', [0.2, 0.06, 0.07], 0xbf360c, { b: 'Biscuiterie Lucien', l: 'Spéculoos', pi: 'cookie', c2: 0xffd600, lay: 4 }],
  ['madeleines', 'Madeleines', 'pbag', [0.17, 0.22, 0.06], 0xffe082, { mat: 'paper', b: 'Petit Breton', l: 'Madeleines', pi: 'croissant', p: { sound: 'eat_soft' } }],
  ['galettes_tin', 'Galettes bretonnes (boîte métal)', 'pcan', [0.16, 0.08, 0.16], 0x1565c0, { mat: 'metal', b: 'Petit Breton', l: 'Galettes', pi: 'cookie', lc: 0x1565c0, p: { food: 14 } }],
  ['gaufrettes', 'Gaufrettes vanille', 'pbox', [0.18, 0.05, 0.08], 0xfff176, { b: 'Croquandise', l: 'Gaufrettes', pi: 'star', c2: 0xd32f2f }],
  ['barquettes', 'Barquettes à la fraise', 'pbox', [0.2, 0.05, 0.08], 0xe91e63, { b: 'Croquandise', l: 'Barquettes', pi: 'strawberry', p: { effect: 'sugar' } }],
]);
G('chocolat', { mat: 'paper', use: 'eat', p: { ...CRUNCH, food: 12, effect: 'calm' }, desc: 'Une tablette de chocolat. Réduit le stress, carré après carré.' }, [
  ['choco_dark', 'Chocolat noir 70 %', 'pbox', [0.08, 0.012, 0.16], 0x212121, { b: 'Mireille', l: 'Noir 70 %', pi: 'choco', c2: 0xd4af37 }],
  ['choco_milk', 'Chocolat au lait', 'pbox', [0.08, 0.012, 0.16], 0x1565c0, { b: 'Mireille', l: 'Au lait', pi: 'cow', c2: 0xffffff }],
  ['choco_hazelnut', 'Chocolat noisettes entières', 'pbox', [0.08, 0.015, 0.16], 0x6d4c41, { b: 'Mireille', l: 'Noisettes', pi: 'bean', c2: 0xffd600 }],
  ['choco_white', 'Chocolat blanc', 'pbox', [0.08, 0.012, 0.16], 0xfafafa, { b: 'Mireille', l: 'Blanc', pi: 'choco', pc: 0xfff8e1, c2: 0x1565c0 }],
  ['choco_box', 'Boîte de chocolats assortis', 'pbox', [0.25, 0.04, 0.18], 0x4a148c, { mat: 'cardboard', b: 'Mireille', l: 'Assortiment', pi: 'heart', c2: 0xd4af37, p: { food: 20 }, desc: 'Un ballotin de fête. Il en manque déjà un.' }],
  ['candy_bears', 'Oursons gélifiés', 'pbag', [0.15, 0.2, 0.05], 0xe53935, { b: 'Sucrette', l: 'Oursons', pi: 'bear', pc: 0xffb300, p: { sound: 'eat_soft', effect: 'sugar', food: 6 } }],
  ['candy_sour', 'Bonbons acidulés', 'pbag', [0.15, 0.2, 0.05], 0x7cb342, { b: 'Sucrette', l: 'Acidulés', pi: 'candy', p: { effect: 'sour', food: 5 } }],
  ['mints_tin', 'Pastilles à la menthe', 'pbox', [0.06, 0.018, 0.04], 0x00897b, { mat: 'metal', b: 'Fraîcheur Alpine', l: 'Menthe forte', pi: 'snow', p: { effect: 'energy', food: 1 }, desc: 'Extra-fortes. Les yeux piquent, le cerveau se réveille.' }],
]);

// ───────────────────────── BOISSONS ─────────────────────────
G('eaux', { mat: 'plastic', use: 'drink', p: { food: 2, effect: 'calm' }, desc: 'De l\'eau. Indispensable pour tenir la nuit.' }, [
  ['water_sparkling', 'Eau gazeuse', 'pbot', [0.09, 0.31, 0.09], 0x66bb6a, { sil: 'soda', b: 'Pétillante', l: 'Eau gazeuse', pi: 'bubbles', c2: 0xd32f2f, lc: 0xfafafa, sub: '1,25 L' }],
  ['water_small', 'Petite bouteille d\'eau', 'pbot', [0.065, 0.21, 0.065], 0x81d4fa, { sil: 'water', b: 'Source des Aiguilles', l: 'Eau de source', pi: 'mountain', c2: 0x1565c0, lc: 0xe3f2fd, sub: '50 cl' }],
  ['water_lemon', 'Eau aromatisée citron', 'pbot', [0.085, 0.3, 0.085], 0xdce775, { sil: 'water', b: 'Source des Aiguilles', l: 'Citron', pi: 'lemon', c2: 0xffd600, lc: 0xf9fbe7 }],
]);
G('sodas', { mat: 'plastic', use: 'drink', p: { food: 5, effect: 'energy' }, desc: 'Sucré, pétillant, réveille un peu.' }, [
  ['soda_cola_big', 'Cola 1,5 L', 'pbot', [0.09, 0.31, 0.09], 0x3e2723, { sil: 'soda', b: 'Hélios', l: 'COLA', pi: 'bubbles', c2: 0xd50000, lc: 0xd50000 }],
  ['soda_orange', 'Soda à l\'orange', 'pbot', [0.09, 0.31, 0.09], 0xff9800, { sil: 'soda', b: 'Fruitéa', l: 'Orange', pi: 'orange', c2: 0x1565c0, lc: 0x1565c0 }],
  ['ice_tea', 'Thé glacé pêche', 'pbot', [0.09, 0.3, 0.09], 0xbf6f2b, { sil: 'soda', b: 'Fruitéa', l: 'Ice Tea pêche', pi: 'leaf', c2: 0x2e7d32, lc: 0xffcc80 }],
  ['soda_lemon_lime', 'Limonade citron vert', 'pbot', [0.09, 0.3, 0.09], 0xc5e1a5, { sil: 'soda', b: 'Limonaderie Dubois', l: 'Citron vert', pi: 'lemon', c2: 0x2e7d32, lc: 0x2e7d32 }],
  ['syrup_grenadine', 'Sirop de grenadine', 'pbot', [0.08, 0.28, 0.08], 0xc2185b, { sil: 'liquor', mat: 'glass', b: 'Sirops Teisseyre', l: 'Grenadine', pi: 'cherry', c2: 0xfafafa, lc: 0xfafafa, p: { effect: 'sugar', breakable: true } }],
  ['syrup_mint', 'Sirop de menthe', 'pbot', [0.08, 0.28, 0.08], 0x00c853, { sil: 'liquor', mat: 'glass', b: 'Sirops Teisseyre', l: 'Menthe', pi: 'leaf', c2: 0xfafafa, lc: 0xfafafa, p: { effect: 'sugar', breakable: true } }],
  ['cola_can_zero', 'Cola zéro (canette)', 'pcan', [0.066, 0.122, 0.066], 0x212121, { mat: 'can', use: 'soda', b: 'Hélios', l: 'COLA ZÉRO', pi: 'bubbles', lc: 0x212121, rim: true, desc: 'Secouez-la avant d\'ouvrir… si vous voulez finir trempé.' }],
  ['orange_can', 'Soda orange (canette)', 'pcan', [0.066, 0.122, 0.066], 0xff9800, { mat: 'can', use: 'soda', b: 'Fruitéa', l: 'ORANGE', pi: 'orange', rim: true, desc: 'Pétillant. Secouée, elle explose.' }],
]);
G('jus', { mat: 'cardboard', use: 'drink', p: { food: 8 }, desc: 'Un jus de fruits. Vitamines et sucre pour tenir jusqu\'à l\'aube.' }, [
  ['juice_apple', 'Jus de pomme', 'pbrick', [0.07, 0.2, 0.06], 0x9ccc65, { b: 'Vergers du Sud', l: 'Pomme', pi: 'apple', c2: 0x2e7d32 }],
  ['juice_multi', 'Jus multifruit', 'pbrick', [0.07, 0.2, 0.06], 0xff7043, { b: 'Fruitéa', l: 'Multifruit', pi: 'strawberry', c2: 0xffd600 }],
  ['juice_grape', 'Jus de raisin', 'pbot', [0.085, 0.27, 0.085], 0x6a1b9a, { sil: 'juice', mat: 'plastic', b: 'Vergers du Sud', l: 'Raisin', pi: 'grape', c2: 0x6a1b9a, lc: 0xf3e5f5 }],
  ['juice_tomato', 'Jus de tomate', 'pbot', [0.07, 0.22, 0.07], 0xc62828, { sil: 'juice', mat: 'glass', b: 'Tomatissima', l: 'Tomate', pi: 'tomato', c2: 0x2e7d32, lc: 0xfff8e1, p: { breakable: true } }],
  ['juice_kids', 'Briquette de jus (paille)', 'pbrick', [0.055, 0.1, 0.035], 0xffb300, { b: 'Fruitéa', l: 'Mini jus', pi: 'orange', c2: 0x1e88e5, p: { food: 4, effect: 'sugar' } }],
]);
G('vins', { mat: 'glass', use: 'drink', p: { effect: 'drunk', breakable: true }, desc: 'Une bouteille de vin. La tête tourne vite, la garde s\'en ressent.' }, [
  ['wine_rose', 'Rosé de Provence', 'pbot', [0.075, 0.3, 0.075], 0xf8bbd0, { sil: 'wine', b: 'Château Lacombe', l: 'Côtes de Provence', pi: 'sun', c2: 0xd4af37, lc: 0xfff8e1 }],
  ['wine_white', 'Vin blanc sec', 'pbot', [0.075, 0.3, 0.075], 0xd7d7a0, { sil: 'wine', b: 'Domaine des Saules', l: 'Blanc sec', pi: 'grape', pc: 0xc0ca33, c2: 0xd4af37, lc: 0xfff8e1 }],
  ['wine_red_cdr', 'Côtes-du-Rhône rouge', 'pbot', [0.075, 0.3, 0.075], 0x3e0f14, { sil: 'wine', b: 'Cellier des Papes', l: 'Côtes-du-Rhône', pi: 'grape', c2: 0x7b1f1f, lc: 0xf5e6c8 }],
  ['wine_beaujolais', 'Beaujolais', 'pbot', [0.075, 0.3, 0.075], 0x4a0e0e, { sil: 'wine', b: 'Domaine des Saules', l: 'Beaujolais', pi: 'grape', c2: 0xd32f2f, lc: 0xffffff }],
  ['cider', 'Cidre brut de Normandie', 'pbot', [0.085, 0.3, 0.085], 0x6d4c1a, { sil: 'bubbly', b: 'Manoir du Pressoir', l: 'Cidre brut', pi: 'apple', c2: 0xd4af37, lc: 0xfff8e1 }],
  ['sparkling_wine', 'Crémant', 'pbot', [0.09, 0.31, 0.09], 0x1b3a1b, { sil: 'bubbly', use: 'champagne', b: 'Caves Hélios', l: 'Crémant', pi: 'star', c2: 0xd4af37, lc: 0xfafafa, desc: 'Le bouchon saute (clic gauche). Pour fêter l\'aube ?' }],
]);
G('bieres', { mat: 'glass', use: 'drink', p: { effect: 'drunk', food: 3, breakable: true }, desc: 'Une bière fraîche… enfin, à température ambiante. À consommer avec modération (surtout en service).' }, [
  ['beer_blonde', 'Bière blonde', 'pbot', [0.062, 0.23, 0.062], 0x6d4c1a, { sil: 'beer', b: 'Brasserie des Remparts', l: 'Blonde', pi: 'wheat', c2: 0xd4af37, lc: 0xfff8e1 }],
  ['beer_amber', 'Bière ambrée', 'pbot', [0.062, 0.23, 0.062], 0x4e2a0e, { sil: 'beer', b: 'Brasserie des Remparts', l: 'Ambrée', pi: 'wheat', c2: 0xb71c1c, lc: 0x4e342e }],
  ['beer_can', 'Bière blonde (canette)', 'pcan', [0.066, 0.122, 0.066], 0xffc107, { mat: 'can', b: 'Hélios Pils', l: 'PILS', pi: 'beer', lc: 0x0d47a1, rim: true, p: { breakable: false } }],
]);
G('alcools', { mat: 'glass', use: 'drink', p: { effect: 'drunk', breakable: true }, desc: 'Un alcool fort. Une très mauvaise idée pendant une garde.' }, [
  ['pastis', 'Pastis de Marseille', 'pbot', [0.085, 0.3, 0.085], 0xffd54f, { sil: 'liquor', b: 'Le Vieux Port', l: 'Pastis', pi: 'sun', c2: 0x1565c0, lc: 0x1565c0 }],
  ['rum', 'Rhum ambré', 'pbot', [0.085, 0.28, 0.085], 0x8d4a1d, { sil: 'liquor', b: 'Île Bourbon', l: 'Rhum ambré', pi: 'leaf', c2: 0x212121, lc: 0xf5e6c8 }],
  ['calvados', 'Calvados', 'pbot', [0.08, 0.28, 0.08], 0xa0522d, { sil: 'liquor', b: 'Manoir du Pressoir', l: 'Calvados', pi: 'apple', c2: 0xd4af37, lc: 0xfafafa }],
]);

// ───────────────────────── CRÈMERIE & SURGELÉS ─────────────────────────
G('lait', { mat: 'cardboard', use: 'drink', p: { food: 10 }, desc: 'Du lait. Un grand verre et ça repart.' }, [
  ['milk_half', 'Lait demi-écrémé', 'pbrick', [0.07, 0.2, 0.065], 0x1e88e5, { b: 'Laiterie Clément', l: 'Demi-écrémé', pi: 'cow', c2: 0x1e88e5, lc: 0xe3f2fd }],
  ['milk_whole', 'Lait entier', 'pbrick', [0.07, 0.2, 0.065], 0xd32f2f, { b: 'Laiterie Clément', l: 'Entier', pi: 'cow', c2: 0xd32f2f, lc: 0xffebee }],
  ['milk_choco', 'Lait chocolaté', 'pbrick', [0.06, 0.12, 0.04], 0x6d4c41, { b: 'Mireille', l: 'Choco', pi: 'cup', c2: 0xffd600, p: { effect: 'calm', food: 8 } }],
  ['milk_oat', 'Boisson à l\'avoine', 'pbrick', [0.07, 0.2, 0.065], 0xd7ccc8, { b: 'Bio Village', l: 'Avoine', pi: 'wheat', c2: 0x43a047 }],
]);
G('cremerie', { mat: 'plastic', use: 'eat', p: { ...SOFT, food: 8 }, desc: 'Un produit frais. Il aurait dû rester au frigo.' }, [
  ['yogurt_pot', 'Yaourt nature', 'pcan', [0.06, 0.07, 0.06], 0xffffff, { b: 'Crèmerie du Pré', l: 'Nature', pi: 'cow', lid: 0xe0e0e0, p: { food: 5 } }],
  ['yogurt_straw', 'Yaourt à la fraise', 'pcan', [0.06, 0.07, 0.06], 0xf8bbd0, { b: 'Crèmerie du Pré', l: 'Fraise', pi: 'strawberry', lid: 0xf48fb1, p: { food: 6 } }],
  ['dessert_choco', 'Crème dessert chocolat', 'pcan', [0.065, 0.06, 0.065], 0x5d4037, { b: 'Crèmerie du Pré', l: 'Crème choco', pi: 'choco', lid: 0x8d6e63, p: { food: 7, effect: 'calm' } }],
  ['compote', 'Compote de pommes', 'pcan', [0.065, 0.06, 0.065], 0xc5e1a5, { b: 'Vergers du Sud', l: 'Compote', pi: 'apple', lid: 0x9ccc65, p: { food: 5 } }],
  ['cream_fresh', 'Crème fraîche épaisse', 'pjar', [0.08, 0.08, 0.08], 0xfafafa, { b: 'Crèmerie du Pré', l: 'Crème fraîche', pi: 'cow', c2: 0x1565c0, p: { food: 6 } }],
  ['butter', 'Beurre doux', 'pbox', [0.12, 0.035, 0.07], 0xfff59d, { mat: 'paper', b: 'Laiterie Clément', l: 'Beurre doux', pi: 'cow', c2: 0x1565c0, top: true, p: { food: 6 }, desc: 'Une plaquette de beurre. Croquée nature : on ne juge pas.' }],
  ['cheese_grated', 'Emmental râpé', 'ppouch', [0.15, 0.2, 0.04], 0xfff176, { b: 'Laiterie Clément', l: 'Emmental râpé', pi: 'cheese', c2: 0x1565c0, p: { food: 8 } }],
  ['cheese_comte', 'Comté 12 mois', 'pbox', [0.12, 0.04, 0.1], 0xffe082, { mat: 'paper', b: 'Fruitière du Jura', l: 'Comté', pi: 'cheese', c2: 0x2e7d32, p: { food: 14, smell: true }, desc: 'Le chat errant fait des kilomètres pour ça.' }],
  ['cheese_goat', 'Bûche de chèvre', 'pbox', [0.18, 0.05, 0.06], 0xfafafa, { mat: 'paper', b: 'Fromagerie Belle-Rive', l: 'Chèvre', pi: 'leaf', c2: 0x2e7d32, p: { food: 12, smell: true } }],
  ['ham', 'Jambon blanc (4 tranches)', 'pbox', [0.18, 0.02, 0.12], 0xf8bbd0, { b: 'Charcuterie Martel', l: 'Jambon', pi: 'pig', c2: 0xd32f2f, top: true, p: { food: 12, smell: true } }],
  ['eggs_12', 'Œufs frais ×12', 'peggs', [0.3, 0.07, 0.1], 0xd7ccc8, { mat: 'cardboard', l: '×12', pn: 6, b: 'Ferme du Coq', p: { food: 8, splat: true, raw: true }, desc: 'Douze œufs. Lancés, ils éclatent en laissant des traces.' }],
]);
G('surgeles', { mat: 'cardboard', use: 'eat', p: { sound: 'eat_crunch', food: 4, raw: true, effect: 'cold' }, desc: 'Un surgelé qui a eu le temps de dégeler. À cuire, idéalement.' }, [
  ['frozen_fries', 'Frites surgelées', 'pbag', [0.22, 0.3, 0.07], 0x1565c0, { mat: 'plastic', b: 'Grand Froid', l: 'Frites', pi: 'fries', p: { cook: 'fries' } }],
  ['frozen_veg', 'Poêlée de légumes', 'pbag', [0.2, 0.28, 0.06], 0x2e7d32, { mat: 'plastic', b: 'Grand Froid', l: 'Poêlée', pi: 'carrot', p: { food: 6 } }],
  ['fish_sticks', 'Bâtonnets de poisson', 'pbox', [0.2, 0.05, 0.14], 0x0277bd, { b: 'Grand Froid', l: 'Poisson pané', pi: 'fish', top: true, p: { food: 8 } }],
  ['ice_cream_tub', 'Bac de glace vanille', 'pbox', [0.2, 0.1, 0.13], 0xfff8e1, { mat: 'plastic', b: 'Banquise', l: 'Vanille', pi: 'icecream', pc: 0xfff59d, top: false, p: { sound: 'eat_soft', food: 12, raw: false }, desc: 'Un litre de glace à moitié fondue. Mal de crâne garanti.' }],
]);

// ───────────────────────── FRUITS & LÉGUMES ─────────────────────────
G('fruits', { mat: 'soft', use: 'eat', p: { ...SOFT, food: 7 }, desc: 'Un fruit frais. Vitamines !' }, [
  ['pear', 'Poire', 'pfruit', [0.07, 0.1, 0.07], 0xcddc39, { fr: 'pear' }],
  ['peach', 'Pêche', 'pfruit', [0.075, 0.07, 0.075], 0xffab91, { lf: true }],
  ['kiwi', 'Kiwi', 'pfruit', [0.055, 0.065, 0.055], 0x8d6e63, { fl: false }],
  ['plum', 'Prune', 'pfruit', [0.045, 0.05, 0.045], 0x6a1b9a, { fr: 'small' }],
  ['apricot', 'Abricot', 'pfruit', [0.05, 0.05, 0.05], 0xffa726, { fr: 'small' }],
  ['clementine', 'Clémentine', 'pfruit', [0.06, 0.05, 0.06], 0xff8f00, { lf: true }],
  ['grapes', 'Grappe de raisin', 'pfruit', [0.12, 0.16, 0.08], 0x7b1fa2, { fr: 'grapes', p: { food: 10 } }],
  ['pineapple', 'Ananas', 'pfruit', [0.13, 0.3, 0.13], 0xc8a03a, { fr: 'pineapple', p: { food: 16 }, mass: 1.5 }],
  ['melon', 'Melon charentais', 'pfruit', [0.15, 0.13, 0.15], 0xc5e1a5, { fr: 'melon', p: { food: 18, splat: true }, mass: 1.2 }],
  ['avocado', 'Avocat', 'pfruit', [0.07, 0.1, 0.07], 0x33691e, { fr: 'pear', p: { food: 10 } }],
  ['mango', 'Mangue', 'pfruit', [0.08, 0.12, 0.07], 0xffb300, { p: { food: 12 } }],
  ['lime', 'Citron vert', 'pfruit', [0.05, 0.05, 0.05], 0x7cb342, { fr: 'small', p: { effect: 'sour', food: 1 } }],
]);
G('legumes', { mat: 'soft', use: 'eat', p: { ...CRUNCH, food: 4 }, desc: 'Un légume cru. Croquant, sain, pas très réconfortant.' }, [
  ['potato', 'Pomme de terre', 'pfruit', [0.07, 0.055, 0.06], 0xc8a165, { fl: false, p: { food: 2, raw: true } }],
  ['onion', 'Oignon jaune', 'pfruit', [0.07, 0.07, 0.07], 0xd4a056, { fr: 'onion', p: { effect: 'sour', food: 1 }, desc: 'Croqué cru, il fait pleurer. Même les plus durs.' }],
  ['garlic', 'Tête d\'ail', 'pfruit', [0.05, 0.05, 0.05], 0xf5f0e6, { fr: 'onion', p: { food: 1, smell: true } }],
  ['leek', 'Poireau', 'pfruit', [0.04, 0.4, 0.04], 0xf1f8e9, { fr: 'leek', p: { food: 3 } }],
  ['zucchini', 'Courgette', 'pfruit', [0.045, 0.2, 0.045], 0x33691e, { fr: 'long' }],
  ['eggplant', 'Aubergine', 'pfruit', [0.07, 0.2, 0.07], 0x4a148c, { fr: 'long', c2: 0x2e7d32 }],
  ['pepper_red', 'Poivron rouge', 'pfruit', [0.08, 0.09, 0.08], 0xd50000, { fr: 'pepper' }],
  ['pepper_green', 'Poivron vert', 'pfruit', [0.08, 0.09, 0.08], 0x2e7d32, { fr: 'pepper' }],
  ['pepper_yellow', 'Poivron jaune', 'pfruit', [0.08, 0.09, 0.08], 0xffd600, { fr: 'pepper' }],
  ['cabbage', 'Chou vert', 'pfruit', [0.17, 0.15, 0.17], 0x7cb342, { fr: 'cabbage', p: { food: 6 }, mass: 1 }],
  ['cauliflower', 'Chou-fleur', 'pfruit', [0.16, 0.14, 0.16], 0xf5f5dc, { fr: 'cabbage', p: { food: 6 }, mass: 1 }],
  ['cucumber', 'Concombre', 'pfruit', [0.05, 0.25, 0.05], 0x2e7d32, { fr: 'long', c2: 0x1b5e20 }],
  ['mushrooms_box', 'Barquette de champignons', 'pfruit', [0.06, 0.05, 0.06], 0xefebe9, { fr: 'mushroom', p: { food: 3 } }],
  ['pumpkin', 'Potiron', 'pfruit', [0.25, 0.18, 0.25], 0xef6c00, { fr: 'melon', p: { food: 12, raw: true }, mass: 3, desc: 'Un potiron. Il fera une belle lanterne… ou une belle soupe.' }],
]);

// ───────────────────────── HYGIÈNE, BÉBÉ, ENTRETIEN, PAPIER, ANIMAUX, BAZAR ─────────────────────────
G('hygiene', { mat: 'plastic', use: 'spray', p: { sound: 'spray' }, desc: 'Un produit d\'hygiène. Clic gauche : pschitt.' }, [
  ['shampoo_family', 'Shampoing doux familial', 'pbot', [0.075, 0.22, 0.045], 0x4fc3f7, { sil: 'shampoo', b: 'Douceline', l: 'Doux familial', pi: 'drop', c2: 0xffffff }],
  ['shampoo_anti', 'Shampoing antipelliculaire', 'pbot', [0.075, 0.22, 0.045], 0x263238, { sil: 'shampoo', b: 'Brillance', l: 'Anti-pelliculaire', pi: 'sparkle', c2: 0x00bcd4 }],
  ['conditioner', 'Après-shampoing', 'pbot', [0.075, 0.2, 0.045], 0xf48fb1, { sil: 'shampoo', b: 'Brillance', l: 'Après-shampoing', pi: 'flower', c2: 0xffffff }],
  ['shower_gel', 'Gel douche fleur de coton', 'pbot', [0.075, 0.2, 0.045], 0x81d4fa, { sil: 'flat', b: 'Douceline', l: 'Gel douche', sub: 'fleur de coton', pi: 'flower', pc: 0xffffff, c2: 0x1565c0 }],
  ['soap_liquid', 'Savon liquide', 'pbot', [0.07, 0.2, 0.07], 0xce93d8, { sil: 'pump', b: 'Douceline', l: 'Savon mains', pi: 'bubbles', pc: 0x7b1fa2, c2: 0xfafafa }],
  ['shaving_foam', 'Mousse à raser', 'pbot', [0.06, 0.2, 0.06], 0x1565c0, { sil: 'aero', mat: 'can', b: 'Fil d\'Acier', l: 'Mousse à raser', pi: 'snow', c2: 0x212121 }],
  ['deo_roll', 'Déodorant bille', 'pbot', [0.05, 0.13, 0.05], 0x00897b, { sil: 'vial', b: 'Fraîcheur Alpine', l: 'Bille 48 h', pi: 'snow', c2: 0x00897b, use: 'generic', desc: 'Un déodorant à bille. Pas de pschitt, juste la fraîcheur alpine.' }],
  ['toothpaste', 'Dentifrice menthe', 'pbox', [0.2, 0.045, 0.04], 0xfafafa, { mat: 'cardboard', use: 'generic', b: 'Dentiblanc', l: 'Menthe fraîche', pi: 'tooth', c2: 0xd32f2f, lc: 0x1565c0, desc: 'Un tube de dentifrice dans sa boîte. Haleine fraîche pour les rencontres nocturnes.' }],
  ['toothbrush_pack', 'Brosses à dents ×2', 'pblist', [0.08, 0.22, 0.03], 0x1e88e5, { use: 'generic', b: 'Dentiblanc', l: 'Souple ×2', pi: 'tooth', c2: 0xffffff, desc: 'Deux brosses à dents souples sous blister.' }],
  ['cotton_swabs', 'Cotons-tiges', 'pbox', [0.08, 0.06, 0.05], 0xe3f2fd, { mat: 'cardboard', use: 'generic', b: 'Douceline', l: 'Cotons-tiges', sub: '×200', pi: 'star', pc: 0x90caf9, desc: 'Deux cents cotons-tiges. Toujours utile.' }],
  ['tissue_box', 'Boîte de mouchoirs', 'pbox', [0.24, 0.09, 0.12], 0xb3e5fc, { mat: 'cardboard', use: 'generic', b: 'Doux Nuage', l: 'Mouchoirs', pi: 'flower', pc: 0xffffff, top: false, desc: 'Des mouchoirs. Pour les rhumes et les grosses frayeurs.' }],
  ['hand_cream', 'Crème mains', 'ptube', [0.045, 0.14, 0.028], 0xfff8e1, { b: 'Douceline', l: 'Crème mains', pi: 'flower', c2: 0x8d6e63, use: 'generic', desc: 'Une crème pour les mains. Les gants de travail, c\'est mieux.' }],
  ['razors', 'Rasoirs jetables ×5', 'pblist', [0.12, 0.2, 0.03], 0xff9800, { use: 'generic', b: 'Fil d\'Acier', l: 'Rasoirs ×5', pi: 'tool', c2: 0x1565c0, desc: 'Cinq rasoirs jetables. Rasage de près avant l\'aube.' }],
]);
G('bebe', { mat: 'plastic', use: 'eat', p: { ...SOFT, food: 6 }, desc: 'Pour bébé. Mais un gardien affamé ne fait pas le difficile.' }, [
  ['diapers', 'Couches taille 4', 'pbox', [0.35, 0.38, 0.2], 0x4fc3f7, { use: 'generic', b: 'Bébé Câlin', l: 'Couches T4', sub: '×52', pi: 'baby', c2: 0xffd600, mass: 2, desc: 'Un gros paquet de couches. Sert surtout de cachette pour… non.' }],
  ['baby_wipes', 'Lingettes bébé', 'ppouch', [0.2, 0.12, 0.06], 0xe1f5fe, { use: 'generic', b: 'Bébé Câlin', l: 'Lingettes', sub: '×72', pi: 'baby', c2: 0x29b6f6, desc: 'Des lingettes douces. Efface tout, même le rouge à lèvres sur les miroirs.' }],
  ['baby_food', 'Petit pot carottes', 'pjar', [0.06, 0.07, 0.06], 0xffb74d, { mat: 'glass', b: 'Petit Chou', l: 'Carottes', pi: 'carrot', c2: 0x1e88e5, p: { breakable: true } }],
  ['baby_food_fruit', 'Petit pot pomme-banane', 'pjar', [0.06, 0.07, 0.06], 0xfff59d, { mat: 'glass', b: 'Petit Chou', l: 'Pomme banane', pi: 'apple', c2: 0xe91e63, p: { breakable: true, effect: 'sugar' } }],
  ['baby_milk', 'Lait infantile', 'pcan', [0.12, 0.17, 0.12], 0xfafafa, { mat: 'metal', use: 'eat', b: 'Bébé Câlin', l: 'Lait 2e âge', pi: 'baby', lc: 0xfafafa, c2: 0x1565c0, p: { food: 4, sound: 'eat_soft' } }],
]);
G('entretien', { mat: 'plastic', use: 'spray', p: { sound: 'spray' }, desc: 'Un produit ménager. À ne surtout pas avaler.' }, [
  ['dish_soap', 'Liquide vaisselle citron', 'pbot', [0.07, 0.24, 0.045], 0xc6e000, { sil: 'shampoo', b: 'Net\'Éclat', l: 'Vaisselle', sub: 'citron', pi: 'lemon', c2: 0x2e7d32 }],
  ['cleaner_multi', 'Nettoyant multi-usages', 'pbot', [0.08, 0.27, 0.06], 0x29b6f6, { sil: 'bleach', b: 'Maison Propre', l: 'Multi-usages', pi: 'sparkle', c2: 0xff6f00 }],
  ['glass_cleaner', 'Nettoyant vitres', 'pbot', [0.08, 0.27, 0.06], 0x40c4ff, { sil: 'bleach', b: 'Maison Propre', l: 'Vitres', pi: 'sparkle', c2: 0x0d47a1, desc: 'Des vitres impeccables. Pratique pour mieux voir ce qui se cache derrière.' }],
  ['softener', 'Adoucissant fleurs blanches', 'jerrycan', [0.15, 0.27, 0.1], 0xb39ddb, { b: 'Lave+', l: 'Adoucissant', pi: 'flower', use: 'generic', desc: 'Sent les fleurs blanches. À verser dans un lave-linge.' }],
  ['laundry_pods', 'Lessive en capsules', 'ppouch', [0.2, 0.26, 0.08], 0x0d47a1, { use: 'generic', b: 'Lave+', l: 'Capsules', sub: '×30', pi: 'bubbles', c2: 0xff6f00, desc: 'Trente capsules de lessive. Ce ne sont PAS des bonbons.' }],
  ['dishwasher_tabs', 'Tablettes lave-vaisselle', 'pbox', [0.18, 0.12, 0.1], 0x1565c0, { mat: 'cardboard', use: 'generic', b: 'Net\'Éclat', l: 'Tout-en-1', sub: '×40', pi: 'sparkle', c2: 0x00e5ff, desc: 'Quarante tablettes. Pour le lave-vaisselle de la salle du personnel.' }],
  ['wc_gel', 'Gel WC javel', 'pbot', [0.075, 0.26, 0.055], 0x00acc1, { sil: 'bleach', b: 'Javelor', l: 'Gel WC', pi: 'drop', c2: 0x0d47a1 }],
  ['insecticide', 'Insecticide volants', 'pbot', [0.065, 0.24, 0.065], 0xffeb3b, { sil: 'aero', mat: 'can', b: 'Stop-Bêtes', l: 'Insecticide', pi: 'bolt', c2: 0xd32f2f, desc: 'Tue mouches et moustiques. Inefficace sur tout le reste.' }],
  ['air_freshener', 'Désodorisant lavande', 'pbot', [0.065, 0.24, 0.065], 0x9575cd, { sil: 'aero', mat: 'can', b: 'Maison Propre', l: 'Lavande', pi: 'flower', c2: 0xffffff, p: { scent: true }, desc: 'Masque les odeurs. Et peut-être la vôtre.' }],
  ['floor_cleaner', 'Nettoyant sols', 'jerrycan', [0.14, 0.27, 0.09], 0x43a047, { b: 'Maison Propre', l: 'Sols', pi: 'house', use: 'generic', desc: 'Pour faire briller le carrelage de la galerie.' }],
  ['trash_bags', 'Sacs poubelle 50 L', 'pbox', [0.15, 0.1, 0.07], 0x37474f, { mat: 'cardboard', use: 'generic', b: 'Maison Propre', l: 'Sacs 50 L', sub: '×20', pi: 'house', c2: 0xffeb3b, desc: 'Vingt sacs poubelle. On y range de tout. Même de mauvais souvenirs.' }],
  ['rubber_gloves', 'Gants de ménage', 'pblist', [0.12, 0.25, 0.03], 0xffeb3b, { use: 'wear', b: 'Maison Propre', l: 'Gants latex', pi: 'sparkle', c2: 0xffeb3b, p: { slot: 'hands', look: 'gants de ménage', quiet: true }, desc: 'Des gants de ménage. Pas d\'empreintes, mais un look discutable.' }],
  ['sponges_pack', 'Éponges grattantes ×3', 'pblist', [0.12, 0.16, 0.04], 0x43a047, { use: 'generic', b: 'Net\'Éclat', l: 'Éponges ×3', pi: 'sparkle', c2: 0xffd600, desc: 'Trois éponges. Pour effacer les traces suspectes.' }],
]);
G('papier', { mat: 'soft', use: 'generic', desc: 'Du papier. On en a toujours besoin.' }, [
  ['tp_pack', 'Papier toilette ×12', 'prolls', [0.33, 0.22, 0.22], 0xfafafa, { b: 'Doux Nuage', sub: '×12', rx: 3, ry: 2, rz: 2, lc: 0x1e88e5, mass: 1, use: 'container', p: { contains: ['toilet_paper', 'toilet_paper', 'toilet_paper', 'toilet_paper', 'toilet_paper', 'toilet_paper', 'toilet_paper', 'toilet_paper', 'toilet_paper', 'toilet_paper', 'toilet_paper', 'toilet_paper'] }, desc: 'Douze rouleaux sous film. Ouvrez le paquet pour en lancer un.' }],
  ['kitchen_roll', 'Essuie-tout ×4', 'prolls', [0.24, 0.26, 0.12], 0xfafafa, { b: 'Essuitout', sub: '×4', rx: 2, ry: 1, rz: 1, lc: 0x43a047, desc: 'Quatre rouleaux d\'essuie-tout. Absorbe tout. Presque tout.' }],
  ['alu_foil', 'Papier aluminium', 'pbox', [0.32, 0.05, 0.05], 0xb0bec5, { mat: 'cardboard', b: 'Maison Propre', l: 'Aluminium 20 m', pi: 'sparkle', c2: 0x1565c0, desc: 'Vingt mètres de papier aluminium. Certains en font des chapeaux. Contre quoi, au juste ?' }],
  ['cling_film', 'Film étirable', 'pbox', [0.32, 0.05, 0.05], 0x4fc3f7, { mat: 'cardboard', b: 'Maison Propre', l: 'Film étirable', pi: 'sparkle', c2: 0xffffff }],
  ['paper_napkins', 'Serviettes en papier', 'ppouch', [0.17, 0.17, 0.06], 0xffcdd2, { b: 'Doux Nuage', l: 'Serviettes', sub: '×100', pi: 'flower', c2: 0xd32f2f }],
  ['paper_plates', 'Assiettes en carton ×20', 'pbox', [0.23, 0.08, 0.23], 0xfafafa, { mat: 'cardboard', b: 'Fête Facile', l: 'Assiettes ×20', pi: 'star', c2: 0xd32f2f }],
  ['plastic_cups', 'Gobelets ×50', 'pcan', [0.08, 0.2, 0.08], 0xe1f5fe, { mat: 'plastic', b: 'Fête Facile', l: 'Gobelets ×50', pi: 'star', c2: 0x1e88e5 }],
]);
G('animaux', { mat: 'paper', use: 'cat_food', desc: 'De la nourriture pour animaux. Posez-en par terre : le chat errant viendra peut-être.' }, [
  ['dog_food_bag', 'Croquettes pour chien 4 kg', 'pbag', [0.3, 0.45, 0.12], 0xd84315, { b: 'Ouaf !', l: 'Croquettes chien', pi: 'dog', sub: '4 kg', mass: 4, use: 'generic', desc: 'Quatre kilos de croquettes pour chien. Le chat errant les dédaigne.' }],
  ['cat_food_premium', 'Croquettes chat au saumon', 'pbag', [0.18, 0.26, 0.07], 0x00838f, { b: 'Croquinou', l: 'Saumon', pi: 'cat', sub: '1,5 kg' }],
  ['cat_food_can', 'Pâtée pour chat', 'pcan', [0.075, 0.04, 0.075], 0x8e24aa, { mat: 'can', b: 'Miaou', l: 'Pâtée', pi: 'cat', sub: 'bœuf' }],
  ['cat_treats', 'Friandises pour chat', 'ppouch', [0.12, 0.16, 0.04], 0xff8f00, { mat: 'plastic', b: 'Croquinou', l: 'Friandises', pi: 'fish', desc: 'Le chat errant ferait n\'importe quoi pour une poignée de ces friandises.' }],
  ['dog_treats', 'Friandises pour chien', 'ppouch', [0.12, 0.18, 0.04], 0x6d4c41, { mat: 'plastic', b: 'Ouaf !', l: 'Os à mâcher', pi: 'bone', use: 'generic', desc: 'Des os à mâcher. Aucun chien dans le centre… normalement.' }],
  ['cat_litter', 'Litière minérale 10 L', 'pbag', [0.3, 0.4, 0.12], 0x90a4ae, { b: 'Croquinou', l: 'Litière', pi: 'cat', sub: '10 L', mass: 5, use: 'generic', desc: 'Dix litres de litière. Lourd, poussiéreux, inutile sans chat apprivoisé.' }],
]);
G('bazar', { mat: 'plastic', use: 'generic', desc: 'Un article de bazar. Toujours utile dans un centre commercial désert.' }, [
  ['batteries_aaa', 'Piles AAA ×8', 'pblist', [0.1, 0.15, 0.02], 0x212121, { use: 'battery', b: 'Énergix', l: 'AAA ×8', pi: 'battery', c2: 0xffb300, desc: 'Huit piles AAA. Rechargent la lampe torche (touche R).' }],
  ['batteries_9v', 'Pile 9 V', 'pblist', [0.08, 0.12, 0.025], 0x1565c0, { use: 'battery', b: 'Énergix', l: '9 V', pi: 'battery', c2: 0xffb300, desc: 'Une pile 9 V. Recharge aussi la lampe (touche R), et le doute.' }],
  ['bulb_led_pack', 'Ampoules LED ×2', 'pbox', [0.1, 0.13, 0.06], 0xfff59d, { mat: 'cardboard', use: 'bulb', b: 'Lumina', l: 'LED E27 ×2', pi: 'bulb', c2: 0x1565c0, p: { uses: 2 }, desc: 'Deux ampoules : de quoi remplacer les ampoules grillées du centre.' }],
  ['tealights', 'Bougies chauffe-plat ×30', 'pbag', [0.15, 0.06, 0.15], 0xfafafa, { use: 'container', b: 'Cire & Mèche', l: 'Chauffe-plats ×30', pi: 'flame', c2: 0xd32f2f, p: { contains: ['candle', 'candle', 'candle'] }, desc: 'Un sachet de petites bougies (ouvrez-le). Une flamme, c\'est déjà ça.' }],
  ['charcoal', 'Charbon de bois 3 kg', 'pbag', [0.3, 0.42, 0.1], 0x212121, { b: 'Grill & Co', l: 'Charbon de bois', pi: 'flame', sub: '3 kg', mass: 3, desc: 'Pour le barbecue. Rien à faire ici en pleine nuit.' }],
  ['freezer_bags', 'Sacs congélation', 'pbox', [0.15, 0.1, 0.05], 0x29b6f6, { mat: 'cardboard', b: 'Maison Propre', l: 'Congélation', sub: '×40', pi: 'snow' }],
  ['umbrella_compact', 'Parapluie pliant', 'stick', [0.05, 0.05, 0.3], 0x1a237e, { mat: 'soft', desc: 'Un parapluie pliant. Il ne pleut jamais dans le centre. Normalement.' }],
]);

// ───────────────────────── PHARMACIE ─────────────────────────
G('pharma', { mat: 'cardboard', use: 'pills', p: { effect: 'calm', amount: 20 }, lk: 'pharma', desc: 'Un médicament. Calme les nerfs. Pas plus de trois par nuit.' }, [
  ['ibuprofen', 'Ibuprofène 200 mg', 'pbox', [0.1, 0.06, 0.025], 0xe65100, { l: 'Ibuprofène', sub: '200 mg — 20 cp', b: 'Pharmalys' }],
  ['aspirin', 'Aspirine 500 mg', 'pbox', [0.1, 0.06, 0.025], 0x1565c0, { l: 'Aspirine', sub: '500 mg', b: 'Pharmalys' }],
  ['paracetamol_1g', 'Paracétamol 1 g', 'pbox', [0.11, 0.06, 0.03], 0xd32f2f, { l: 'Paracétamol', sub: '1 g — 8 cp', b: 'Vidalune', p: { amount: 30 } }],
  ['throat_lozenges', 'Pastilles pour la gorge', 'pbox', [0.08, 0.1, 0.025], 0x00897b, { l: 'Gorge apaisée', sub: 'miel citron', b: 'Pharmalys', p: { effect: 'calm', amount: 10 }, desc: 'Au miel et au citron. Pour une gorge irritée par les cris.' }],
  ['magnesium', 'Magnésium marin', 'pbox', [0.09, 0.09, 0.05], 0x0277bd, { l: 'Magnésium', sub: 'anti-stress', b: 'Oligomer', p: { amount: 15 } }],
  ['melatonin', 'Mélatonine', 'pbox', [0.09, 0.06, 0.025], 0x283593, { l: 'Mélatonine', sub: 'sommeil', b: 'Vidalune', p: { effect: 'sleepy' }, desc: 'Pour s\'endormir. À ne surtout pas prendre pendant une garde.' }],
  ['energy_ampoules', 'Ampoules énergie ginseng', 'pbox', [0.12, 0.08, 0.04], 0xf9a825, { l: 'Énergie +', sub: 'ginseng gelée royale', b: 'Oligomer', p: { effect: 'energy' }, desc: 'Des ampoules buvables qui donnent un coup de fouet.' }],
  ['vitamin_d', 'Vitamine D3', 'pjar', [0.05, 0.08, 0.05], 0xfff176, { mat: 'plastic', lk: 'wrap', l: 'Vitamine D3', b: 'Oligomer', pi: 'sun', c2: 0xfafafa, p: { effect: 'energy' } }],
  ['homeopathy', 'Granules homéopathiques', 'pcan', [0.02, 0.06, 0.02], 0xfafafa, { mat: 'plastic', lk: 'wrap', l: 'Arnica 9 CH', b: 'Boiron-Lune', pi: 'leaf', lid: 0xffd600, p: { effect: 'calm', amount: 5 }, desc: 'Des petits granules. L\'effet est… surtout psychologique.' }],
]);
G('parapharma', { mat: 'plastic', use: 'heal', p: { amount: 10 }, desc: 'Un produit de soin. Soigne un peu les blessures.' }, [
  ['band_aids', 'Pansements ×20', 'pbox', [0.1, 0.07, 0.03], 0xffccbc, { mat: 'cardboard', b: 'Pharmalys', l: 'Pansements', sub: '×20 — 3 tailles', pi: 'cross', pc: 0xd32f2f, p: { amount: 10 } }],
  ['compresses', 'Compresses stériles', 'pbox', [0.12, 0.08, 0.04], 0xe3f2fd, { mat: 'cardboard', b: 'Pharmalys', l: 'Compresses', sub: 'stériles', pi: 'cross', pc: 0x1565c0, p: { amount: 15 } }],
  ['antiseptic', 'Antiseptique', 'pbot', [0.06, 0.16, 0.06], 0xd32f2f, { sil: 'syrup', b: 'Pharmalys', l: 'Antiseptique', pi: 'cross', c2: 0xfafafa, p: { amount: 12 }, desc: 'Ça pique, mais ça désinfecte.' }],
  ['arnica_gel', 'Gel d\'arnica', 'ptube', [0.045, 0.15, 0.028], 0xffd600, { b: 'Boiron-Lune', l: 'Arnica', pi: 'flower', pc: 0xff9800, c2: 0x2e7d32, p: { amount: 8 }, desc: 'Pour les bosses et les bleus. Vous allez en avoir.' }],
  ['ice_pack', 'Poche de froid', 'ppouch', [0.12, 0.2, 0.03], 0x81d4fa, { b: 'Pharmalys', l: 'Froid instantané', pi: 'snow', p: { amount: 12 }, desc: 'Une poche de froid instantané. Calme les coups et les tempes qui battent.' }],
  ['elastic_bandage', 'Bande élastique', 'pcan', [0.07, 0.08, 0.07], 0xffe0b2, { mat: 'soft', b: 'Pharmalys', l: 'Bande', pi: 'cross', p: { amount: 20 } }],
  ['face_cream', 'Crème hydratante', 'pjar', [0.065, 0.05, 0.065], 0xfafafa, { use: 'generic', b: 'Eau Thermale d\'Hélios', l: 'Crème hydratante', pi: 'drop', c2: 0x29b6f6, desc: 'Une crème pour le visage. Les cernes du gardien de nuit résistent.' }],
  ['lip_balm', 'Baume à lèvres', 'stick', [0.018, 0.018, 0.07], 0x29b6f6, { use: 'generic', desc: 'Un stick pour les lèvres gercées par les courants d\'air des conduits.' }],
  ['aftersun', 'Lait après-soleil', 'pbot', [0.07, 0.2, 0.04], 0xffcc80, { sil: 'flat', use: 'spray', b: 'Soleil d\'Été', l: 'Après-soleil', pi: 'sun', c2: 0xff6f00, p: { sound: 'spray' }, desc: 'Après-soleil. Plutôt après-lune, ici.' }],
  ['mosquito_spray', 'Spray anti-moustiques', 'pbot', [0.055, 0.17, 0.055], 0x2e7d32, { sil: 'vial', use: 'spray', b: 'Stop-Bêtes', l: 'Anti-moustiques', pi: 'bolt', c2: 0xffd600, p: { sound: 'spray' } }],
  ['mouthwash', 'Bain de bouche', 'pbot', [0.08, 0.24, 0.06], 0x00bfa5, { sil: 'bleach', use: 'drink', b: 'Dentiblanc', l: 'Bain de bouche', pi: 'tooth', c2: 0xfafafa, p: { effect: 'sour', food: 0 }, desc: 'À recracher. Vous ne l\'avez pas recraché.' }],
  ['dental_floss', 'Fil dentaire', 'pbox', [0.05, 0.05, 0.02], 0x80deea, { mat: 'plastic', use: 'generic', b: 'Dentiblanc', l: 'Fil dentaire', pi: 'tooth', desc: 'Cinquante mètres de fil dentaire. Un piège à fil tendu, peut-être ?' }],
  ['mask_ffp2', 'Masques FFP2 ×10', 'pbox', [0.16, 0.1, 0.08], 0xfafafa, { mat: 'cardboard', use: 'wear', b: 'Pharmalys', l: 'FFP2 ×10', pi: 'cross', pc: 0x1565c0, p: { slot: 'face', look: 'masque FFP2' }, desc: 'Masques filtrants. Protège de la poussière des conduits.' }],
  ['hot_water_bottle', 'Bouillotte', 'pbox', [0.2, 0.3, 0.03], 0xd84315, { mat: 'soft', use: 'generic', b: 'Douceline', l: 'Bouillotte', pi: 'heart', c2: 0xffffff, desc: 'Une bouillotte. Le centre devient glacial près de… certaines choses.' }],
  ['herbal_tea_sleep', 'Tisane du soir', 'pbox', [0.12, 0.07, 0.07], 0x7e57c2, { mat: 'cardboard', use: 'eat', b: 'Herboristerie Lune', l: 'Tisane du soir', pi: 'moon', p: { effect: 'calm', food: 1, sound: 'paper' }, desc: 'Camomille et fleur d\'oranger. Calme, très calme.' }],
  ['baby_powder', 'Talc pour bébé', 'pbot', [0.065, 0.16, 0.065], 0xfce4ec, { sil: 'vial', use: 'flour', b: 'Bébé Câlin', l: 'Talc', pi: 'baby', c2: 0xf48fb1, desc: 'Lancez-le : un nuage de poudre… qui révèle les silhouettes invisibles, comme la farine.' }],
]);

// ───────────────────────── BOULANGERIE ─────────────────────────
G('boulangerie', { mat: 'soft', use: 'eat', p: { ...SOFT, food: 12 }, desc: 'Une spécialité de la boulangerie, d\'hier soir. Encore bonne.' }, [
  ['pain_campagne', 'Pain de campagne', 'pfruit', [0.22, 0.1, 0.16], 0xb07a3c, { fr: 'loaf', p: { food: 20, sound: 'eat_crunch' } }],
  ['pain_complet', 'Pain complet', 'pfruit', [0.2, 0.1, 0.11], 0x8d5a2b, { fr: 'loaf', p: { food: 18, sound: 'eat_crunch' } }],
  ['ficelle', 'Ficelle', 'baguette', [0.04, 0.04, 0.55], 0xd9a85c, { p: { food: 10, sound: 'eat_crunch', melee: 1 }, desc: 'Une baguette fine. Arme improvisée encore plus fragile.' }],
  ['pain_raisins', 'Pain aux raisins', 'cyl', [0.11, 0.03, 0.11], 0xd4a056, {}],
  ['chausson', 'Chausson aux pommes', 'pfruit', [0.14, 0.04, 0.09], 0xe0a040, { fr: 'round', fl: false }],
  ['tarte_citron', 'Tarte au citron meringuée', 'cake', [0.22, 0.06, 0.22], 0xfff59d, { p: { food: 22, splat: true } }],
  ['millefeuille', 'Mille-feuille', 'pbox', [0.11, 0.05, 0.06], 0xfff3e0, { lk: 'plain', top: false, p: { food: 12 } }],
  ['paris_brest', 'Paris-Brest', 'cake', [0.14, 0.05, 0.14], 0xc8954f, { p: { food: 16 } }],
  ['religieuse', 'Religieuse au café', 'pfruit', [0.08, 0.1, 0.08], 0x6d4c41, { fr: 'pear', fl: false, p: { food: 12 } }],
  ['canele', 'Canelé', 'cyl', [0.05, 0.05, 0.05], 0x5d2e0c, { p: { food: 6 } }],
  ['fougasse', 'Fougasse aux olives', 'pfruit', [0.22, 0.04, 0.16], 0xd9a85c, { fr: 'loaf', p: { food: 16 } }],
  ['quiche', 'Quiche lorraine', 'cake', [0.2, 0.05, 0.2], 0xf0c060, { p: { food: 25 } }],
  ['sandwich_ham', 'Sandwich jambon-beurre', 'baguette', [0.06, 0.06, 0.3], 0xd9a85c, { p: { food: 25, sound: 'eat_crunch' }, desc: 'Le grand classique. Pas encore rassis.' }],
  ['chouquettes', 'Sachet de chouquettes', 'pbag', [0.15, 0.2, 0.08], 0xf5f0e0, { mat: 'paper', b: 'Au Bon Grain', l: 'Chouquettes', pi: 'croissant', c2: 0x8d6e63, p: { food: 10, effect: 'sugar' } }],
  ['galette_rois', 'Galette des rois', 'cake', [0.24, 0.04, 0.24], 0xe0a040, { p: { food: 30 }, desc: 'Il y a une fève dedans. Peut-être.' }],
]);

// ───────────────────────── FLEURISTE ─────────────────────────
G('fleurs', { mat: 'soft', use: 'flower', desc: 'Des fleurs fraîches. Sentez-les (clic gauche) : un peu de calme.' }, [
  ['bouquet_field', 'Bouquet champêtre', 'bouquet', [0.18, 0.45, 0.18], 0xffeb3b, {}],
  ['peonies', 'Bouquet de pivoines', 'bouquet', [0.18, 0.45, 0.18], 0xf48fb1, {}],
  ['gerberas', 'Gerberas', 'bouquet', [0.16, 0.45, 0.16], 0xff7043, {}],
  ['carnations', 'Œillets rouges', 'bouquet', [0.15, 0.45, 0.15], 0xd50000, {}],
  ['chrysanthemums', 'Chrysanthèmes', 'pplant', [0.25, 0.35, 0.25], 0xfdd835, { fo: 'flower', mat: 'ceramic', desc: 'Les fleurs de la Toussaint. On en dépose sur les tombes.' }],
  ['bucket_roses', 'Seau de roses', 'pbucket', [0.28, 0.6, 0.28], 0xc2185b, { mat: 'metal', use: 'container', p: { contains: ['roses', 'roses', 'roses'] }, desc: 'Un seau de roses coupées. Servez-vous (R).' }],
  ['bucket_tulips', 'Seau de tulipes', 'pbucket', [0.26, 0.55, 0.26], 0xff5722, { mat: 'metal', use: 'container', p: { contains: ['tulips', 'tulips'] }, desc: 'Des tulipes de toutes les couleurs, au seau.' }],
]);
G('plantes', { mat: 'ceramic', use: 'flower', desc: 'Une plante en pot. Arrosez-la, parlez-lui : elle vous écoute.' }, [
  ['lavender_pot', 'Lavande en pot', 'pplant', [0.18, 0.32, 0.18], 0x9575cd, { fo: 'flower' }],
  ['fern', 'Fougère', 'pplant', [0.32, 0.4, 0.32], 0x388e3c, { fo: 'bush' }],
  ['ficus', 'Ficus', 'pplant', [0.4, 0.9, 0.4], 0x2e7d32, { fo: 'tall', mass: 4 }],
  ['monstera', 'Monstera', 'pplant', [0.5, 0.7, 0.5], 0x1b5e20, { fo: 'palm', mass: 3 }],
  ['succulent', 'Plante grasse', 'pplant', [0.1, 0.1, 0.1], 0x80cbc4, { fo: 'succulent' }],
  ['cactus_tall', 'Cactus cierge', 'pplant', [0.14, 0.4, 0.14], 0x43a047, { fo: 'cactus', use: 'cactus', desc: 'Grand, droit, piquant. Ne le serrez pas.' }],
  ['basil_pot', 'Basilic en pot', 'pplant', [0.13, 0.22, 0.13], 0x4caf50, { fo: 'bush', use: 'eat', p: { sound: 'eat_crunch', food: 2 }, desc: 'Du basilic frais. Ça se mange, feuille par feuille.' }],
  ['olive_tree', 'Petit olivier', 'pplant', [0.4, 0.8, 0.4], 0x8a9a5b, { fo: 'tall', mass: 5 }],
  ['orchid_white', 'Orchidée blanche', 'flowerpot', [0.12, 0.45, 0.12], 0xfafafa, {}],
  ['bonsai_juniper', 'Bonsaï genévrier', 'flowerpot', [0.22, 0.22, 0.16], 0x33691e, { desc: 'Un jeune bonsaï. Pas aussi vieux que celui du magasin.' }],
]);
G('jardin', { mat: 'plastic', use: 'generic', desc: 'Pour le jardin ou le balcon.' }, [
  ['potting_soil', 'Terreau universel 20 L', 'pbag', [0.32, 0.48, 0.12], 0x3e2723, { b: 'Jardins de Lune', l: 'Terreau', pi: 'plant', sub: '20 L', mass: 6, desc: 'Vingt litres de terreau. Lourd. Ça sent la cave humide.' }],
  ['pot_terracotta', 'Pot en terre cuite', 'pplant', [0.2, 0.18, 0.2], 0xb5653a, { fo: 'none', mat: 'ceramic', p: { breakable: true } }],
  ['flower_food', 'Engrais liquide', 'pbot', [0.07, 0.2, 0.07], 0x43a047, { sil: 'bleach', b: 'Jardins de Lune', l: 'Engrais', pi: 'plant', c2: 0xffd600 }],
  ['seeds_tomato', 'Graines de tomates', 'pcard', [0.09, 0.13, 0.004], 0xd32f2f, { mat: 'paper', use: 'read', lk: 'box', b: 'Jardins de Lune', l: 'Tomates', pi: 'tomato', p: { text: 'Tomate « Cœur de bœuf ». Semer au printemps, à l\'abri du gel. Au dos, au crayon : « elles poussaient très bien sous les néons de la réserve ».' } }],
  ['seeds_sunflower', 'Graines de tournesol', 'pcard', [0.09, 0.13, 0.004], 0xfdd835, { mat: 'paper', use: 'read', lk: 'box', b: 'Jardins de Lune', l: 'Tournesol', pi: 'sun', p: { text: 'Tournesol géant. Il suit le soleil… ou la lumière la plus proche.' } }],
  ['gift_ribbon', 'Rouleau de ruban', 'tape', [0.09, 0.03, 0.09], 0xd81b60, { mat: 'soft', desc: 'Du ruban d\'emballage. Pour un bouquet… ou pour attacher une porte.' }],
  ['greeting_card', 'Carte « Pensées »', 'pcard', [0.11, 0.15, 0.004], 0x7e57c2, { mat: 'paper', use: 'read', b: 'Fleurs de Lune', l: 'Pensées', pi: 'flower', p: { text: '« Avec toutes nos pensées. » La carte est déjà signée, d\'une écriture ronde d\'enfant : « Lucie ».' } }],
]);

// ───────────────────────── QUINCAILLERIE ─────────────────────────
G('outils', { mat: 'metal', use: 'tool', desc: 'Un outil. Toujours utile pour un gardien bricoleur.' }, [
  ['pliers', 'Pince universelle', 'ptool', [0.06, 0.02, 0.2], 0xd32f2f, { tl: 'pliers', p: { tool: 'pliers' }, desc: 'Une pince universelle. Coupe les fils, serre les écrous.' }],
  ['cutter', 'Cutter', 'ptool', [0.025, 0.02, 0.16], 0xffd600, { tl: 'cutter', mat: 'plastic', use: 'melee', p: { dmg: 1 }, desc: 'Un cutter à lame sécable. Ouvre les cartons. Le reste, mieux vaut pas.' }],
  ['level', 'Niveau à bulle', 'ptool', [0.03, 0.05, 0.4], 0xffc107, { tl: 'level', mat: 'plastic', use: 'generic', desc: 'Tout est droit. Sauf le sol du sous-sol, étrangement.' }],
  ['paint_brush', 'Pinceau plat', 'ptool', [0.06, 0.02, 0.25], 0xc8a165, { tl: 'brush', mat: 'wood', use: 'generic', desc: 'Un pinceau. Sans peinture, il ne sert pas à grand-chose.' }],
  ['paint_roller', 'Rouleau à peinture', 'ptool', [0.2, 0.08, 0.3], 0xeceff1, { tl: 'roller', mat: 'plastic', use: 'generic' }],
  ['trowel', 'Truelle', 'ptool', [0.1, 0.03, 0.26], 0x8d5524, { tl: 'trowel', use: 'melee', p: { dmg: 1 } }],
  ['mallet', 'Maillet en caoutchouc', 'hammer', [0.1, 0.28, 0.06], 0x212121, { mat: 'soft', use: 'melee', p: { dmg: 1.5 }, desc: 'Frappe fort, sans bruit métallique.' }],
  ['hacksaw', 'Scie à métaux', 'stick', [0.1, 0.01, 0.4], 0x1565c0, { use: 'melee', p: { dmg: 1.5 } }],
  ['chisel', 'Ciseau à bois', 'stick', [0.02, 0.02, 0.24], 0x8d6e63, { use: 'tool', p: { tool: 'screw' }, desc: 'Fait levier sur les vis rouillées des grilles d\'aération.' }],
  ['screwdriver_set', 'Coffret de tournevis', 'pbox', [0.22, 0.05, 0.12], 0xd32f2f, { mat: 'plastic', use: 'container', b: 'Martin Pro', l: 'Tournevis ×6', pi: 'screw', c2: 0x212121, top: true, p: { contains: ['screwdriver', 'screwdriver'] }, desc: 'Six tournevis, dont deux vraiment utiles. Ouvrez le coffret.' }],
]);
G('quincaillerie', { mat: 'plastic', use: 'generic', desc: 'Petite quincaillerie. Vis, chevilles et compagnie.' }, [
  ['screws_box', 'Boîte de vis à bois', 'pbox', [0.1, 0.04, 0.06], 0xffb300, { mat: 'cardboard', use: 'scatter', b: 'Martin Pro', l: 'Vis 4×40', pi: 'screw', top: true, p: { trap: true }, desc: 'Deux cents vis. Répandues par terre : piège bruyant (et douloureux).' }],
  ['wall_plugs', 'Chevilles ×50', 'pblist', [0.1, 0.16, 0.03], 0x1565c0, { b: 'Martin Pro', l: 'Chevilles ×50', pi: 'screw', c2: 0xffd600 }],
  ['cable_ties', 'Colliers de serrage', 'pblist', [0.1, 0.22, 0.02], 0x212121, { b: 'Martin Pro', l: 'Colliers ×100', pi: 'tool', c2: 0xff6f00, desc: 'Cent colliers de serrage. Pour bloquer une poignée, par exemple.' }],
  ['hinge', 'Charnières ×2', 'pblist', [0.1, 0.16, 0.03], 0x9e9e9e, { b: 'Martin Pro', l: 'Charnières', pi: 'lock', c2: 0x1565c0 }],
  ['door_handle', 'Poignée de porte', 'pblist', [0.12, 0.25, 0.05], 0xbdbdbd, { b: 'Serrurerie Hélios', l: 'Poignée', pi: 'key', c2: 0x37474f }],
  ['padlock_code', 'Cadenas à code', 'padlock', [0.05, 0.08, 0.02], 0x37474f, { mat: 'metal', use: 'padlock', desc: 'À poser sur une porte (E). Un cadenas de plus : les intrus perdent du temps.' }],
  ['allen_keys', 'Jeu de clés Allen', 'pblist', [0.09, 0.18, 0.02], 0xd32f2f, { b: 'Martin Pro', l: 'Clés Allen', pi: 'tool', c2: 0x212121 }],
  ['drill_bits', 'Coffret de forets', 'pblist', [0.12, 0.2, 0.025], 0x2e7d32, { b: 'Martin Pro', l: 'Forets ×10', pi: 'drill', c2: 0xffd600 }],
  ['glue_tube', 'Colle forte', 'ptube', [0.03, 0.1, 0.018], 0xffd600, { b: 'Super Colle', l: 'Colle forte', pi: 'drop', pc: 0xd32f2f, c2: 0xd32f2f, desc: 'Colle tout, en trois secondes. Même les doigts.' }],
  ['silicone', 'Mastic silicone', 'pcan', [0.05, 0.24, 0.05], 0xfafafa, { b: 'Martin Pro', l: 'Silicone', pi: 'drop', lid: 0xd32f2f }],
  ['electrical_tape', 'Ruban isolant', 'tape', [0.08, 0.02, 0.08], 0x212121, { use: 'tape', p: { uses: 2 }, desc: 'Du chatterton noir. Masque l\'objectif d\'une caméra ou scelle une grille.' }],
  ['socket_strip', 'Multiprise 4 prises', 'box', [0.3, 0.04, 0.06], 0xfafafa, { desc: 'Quatre prises. Le câblage du centre n\'en demandait pas tant.' }],
  ['sandpaper', 'Papier de verre', 'pcard', [0.11, 0.23, 0.003], 0xd7a86e, { mat: 'paper', lk: 'plain', b: 'Grain 120' }],
  ['safety_glasses', 'Lunettes de protection', 'pglass', [0.15, 0.05, 0.15], 0xffd600, { use: 'wear', c2: 0xb3e5fc, p: { slot: 'face', look: 'lunettes de protection' }, desc: 'Protège les yeux. Pas du reste.' }],
  ['ear_muffs', 'Casque anti-bruit', 'headset', [0.2, 0.2, 0.18], 0xffd600, { use: 'earplugs', desc: 'Coupe les sons. Moins de stress… et plus aucun avertissement.' }],
  ['dust_mask', 'Masque anti-poussière', 'mask', [0.12, 0.1, 0.08], 0xfafafa, { use: 'wear', p: { slot: 'face', look: 'masque anti-poussière' }, desc: 'Pour les conduits poussiéreux.' }],
  ['flashlight_led', 'Lampe LED compacte', 'flashlight', [0.04, 0.04, 0.15], 0x37474f, { mat: 'metal', use: 'flashlight', p: { kind: 'basic' }, desc: 'Une lampe de poche honnête. Comparable à celle de Gérard.' }],
  ['bucket', 'Seau de chantier', 'ppan', [0.3, 0.28, 0.3], 0x212121, { pt: 'bowl', c2: 0x424242, desc: 'Un seau noir. Pour l\'eau, le plâtre… ou pour s\'asseoir.' }],
  ['broom', 'Balai', 'stick', [0.04, 0.04, 1.2], 0xc62828, { mat: 'wood', use: 'melee', p: { dmg: 1 }, desc: 'Un balai. Arme de dernier recours.' }],
  ['garden_hose', 'Tuyau d\'arrosage', 'rope', [0.4, 0.1, 0.4], 0x43a047, { desc: 'Quinze mètres de tuyau. Sans robinet, inutile.' }],
]);
G('peinture', { mat: 'metal', use: 'paint', desc: 'Lancez le pot (clic droit) : il éclate et éclabousse tout autour.' }, [
  ['paint_white', 'Peinture blanche 2,5 L', 'can', [0.18, 0.2, 0.18], 0xfafafa, { b: 'Couleurs Martin', label: 'Blanc mat' }],
  ['paint_red', 'Peinture rouge 2,5 L', 'can', [0.18, 0.2, 0.18], 0xc62828, { b: 'Couleurs Martin', label: 'Rouge vif' }],
  ['paint_green', 'Peinture verte 2,5 L', 'can', [0.18, 0.2, 0.18], 0x2e7d32, { b: 'Couleurs Martin', label: 'Vert sapin' }],
  ['paint_yellow', 'Peinture jaune 0,5 L', 'can', [0.11, 0.12, 0.11], 0xfdd835, { b: 'Couleurs Martin', label: 'Jaune soleil' }],
  ['spray_paint', 'Bombe de peinture', 'pbot', [0.065, 0.2, 0.065], 0xff1744, { sil: 'aero', mat: 'can', use: 'spray', b: 'Graff Tonic', l: 'Rouge fluo', pi: 'spray', c2: 0x212121, p: { sound: 'spray', splat: true }, desc: 'Clic gauche : un nuage de peinture qui laisse une tache.' }],
  ['varnish', 'Vernis bois', 'pcan', [0.11, 0.13, 0.11], 0x8d4a1d, { b: 'Couleurs Martin', l: 'Vernis chêne', pi: 'brush', p: {} }],
]);

// ───────────────────────── ANIMALERIE ─────────────────────────
G('animalerie', { mat: 'plastic', use: 'generic', desc: 'Pour nos amis les bêtes.' }, [
  ['hamster_food', 'Mélange pour hamster', 'ppouch', [0.13, 0.2, 0.05], 0xffb300, { b: 'Arche de Noé', l: 'Hamster', pi: 'wheat', c2: 0x6d4c41, desc: 'Graines et granulés. Le hamster insomniaque en raffole.' }],
  ['rabbit_hay', 'Foin de Crau', 'pbag', [0.24, 0.34, 0.1], 0x9e9d24, { mat: 'paper', b: 'Arche de Noé', l: 'Foin', pi: 'leaf', mass: 1 }],
  ['aquarium_gravel', 'Gravier d\'aquarium', 'pbag', [0.16, 0.22, 0.05], 0x4fc3f7, { b: 'Arche de Noé', l: 'Gravier', pi: 'fish', mass: 2, use: 'scatter', p: { trap: true }, desc: 'Du gravier coloré. Répandu au sol, il crisse sous les pas.' }],
  ['aquarium_plant', 'Plante d\'aquarium', 'pplant', [0.08, 0.16, 0.08], 0x00c853, { fo: 'bush', c2: 0x0277bd }],
  ['fish_net', 'Épuisette', 'stick', [0.08, 0.02, 0.35], 0x1e88e5, {}],
  ['dog_collar', 'Collier pour chien', 'ring_big', [0.14, 0.14, 0.02], 0xd32f2f, { mat: 'soft' }],
  ['cat_scratcher', 'Griffoir en carton', 'pbox', [0.4, 0.05, 0.2], 0xc8a46e, { mat: 'cardboard', b: 'Croquinou', l: 'Griffoir', pi: 'cat', top: true, use: 'cat_toy', desc: 'Grattez-le devant le chat errant : il adore.' }],
  ['pet_brush', 'Brosse pour animaux', 'ptool', [0.07, 0.03, 0.2], 0x8d6e63, { tl: 'brush', mat: 'wood' }],
  ['dog_ball', 'Balle pour chien', 'ball', [0.07, 0.07, 0.07], 0xff7043, { mat: 'soft', use: 'ball', p: { bounce: 0.8 } }],
  ['chew_bone', 'Os en nylon', 'bone', [0.05, 0.04, 0.14], 0xfff3e0, { use: 'squeak', p: { sound: 'squeak', pitch: 0.6 }, desc: 'Un os qui couine. Aucun chien ne viendra… n\'est-ce pas ?' }],
  ['squeaky_chicken', 'Poulet qui couine', 'pplush', [0.12, 0.2, 0.1], 0xffeb3b, { an: 'penguin', c2: 0xd32f2f, mat: 'soft', use: 'squeak', p: { sound: 'squeak', pitch: 1.6 }, desc: 'Un poulet en caoutchouc. Il hurle quand on le serre.' }],
  ['pet_shampoo', 'Shampoing pour chien', 'pbot', [0.07, 0.2, 0.045], 0x26a69a, { sil: 'shampoo', use: 'spray', b: 'Ouaf !', l: 'Shampoing', pi: 'dog', c2: 0xffd600, p: { sound: 'spray' } }],
  ['bird_toy', 'Clochette pour oiseau', 'bulb', [0.05, 0.08, 0.05], 0xffd600, { mat: 'metal', use: 'squeak', p: { sound: 'wind_chime' }, desc: 'Une clochette. Coco le perroquet adore la faire sonner.' }],
  ['litter_tray', 'Bac à litière', 'ppan', [0.4, 0.12, 0.3], 0x80cbc4, { pt: 'bowl', c2: 0x4db6ac }],
]);

// ───────────────────────── BIJOUTERIE ─────────────────────────
G('bijoux', { mat: 'metal', use: 'jewel', desc: 'Un bijou. Ça brille, et ça vaut cher.' }, [
  ['ring_silver', 'Bague en argent', 'ring', [0.025, 0.025, 0.01], 0xe0e0e0, { value: 180 }],
  ['ring_ruby', 'Bague rubis', 'ring', [0.025, 0.03, 0.01], 0xd50000, { value: 2200 }],
  ['ring_sapphire', 'Bague saphir', 'ring', [0.025, 0.03, 0.01], 0x1565c0, { value: 2600 }],
  ['pendant_heart', 'Pendentif cœur', 'necklace', [0.1, 0.02, 0.1], 0xffd54f, { value: 450 }],
  ['chain_gold', 'Chaîne en or', 'necklace', [0.12, 0.015, 0.12], 0xffc107, { value: 1200 }],
  ['earrings_pearl', 'Boucles d\'oreilles perles', 'ring', [0.02, 0.02, 0.01], 0xfafafa, { value: 380 }],
  ['bracelet_charm', 'Bracelet à breloques', 'ring_big', [0.08, 0.08, 0.015], 0xe0e0e0, { value: 320 }],
  ['watch_sport', 'Montre de sport', 'watch', [0.045, 0.015, 0.045], 0x212121, { use: 'watch', value: 250, desc: 'Étanche, chronomètre, et affiche l\'heure (clic gauche).' }],
  ['watch_gold', 'Montre classique dorée', 'watch', [0.04, 0.012, 0.04], 0xd4af37, { use: 'watch', value: 3400, desc: 'Une montre élégante. Clic gauche : l\'heure exacte.' }],
  ['jewel_box', 'Écrin à bague', 'pbox', [0.05, 0.045, 0.05], 0x880e4f, { mat: 'soft', use: 'container', lk: 'plain', b: 'Orfèvre & Fils', p: { contains: ['ring_silver'] }, desc: 'Un écrin de velours. Il y a quelque chose dedans.' }],
  ['cufflinks', 'Boutons de manchette', 'pbox', [0.06, 0.03, 0.05], 0x212121, { mat: 'soft', use: 'container', lk: 'plain', b: 'Orfèvre & Fils', value: 0, p: { contains: ['coin'] }, desc: 'Une petite boîte de boutons de manchette… vide, sauf une pièce oubliée.' }],
]);

// ───────────────────────── TABAC-PRESSE ─────────────────────────
G('presse', { mat: 'paper', use: 'newspaper', p: { mag: true }, desc: 'Un magazine. Feuilletez-le (clic gauche).' }, [
  ['mag_auto', 'Magazine « Auto Passion »', 'pmag', [0.21, 0.28, 0.006], 0xd32f2f, { l: 'AUTO PASSION', sub: 'ESSAI', photo: 'car' }],
  ['mag_people', 'Magazine « Stars & Potins »', 'pmag', [0.21, 0.28, 0.006], 0xe91e63, { l: 'STARS & POTINS', sub: 'EXCLU' }],
  ['mag_tv', 'Programme « Télé Semaine »', 'pmag', [0.17, 0.24, 0.006], 0x1565c0, { l: 'TÉLÉ SEMAINE', sub: '-50 %' }],
  ['mag_cuisine', 'Magazine « Cuisine & Saveurs »', 'pmag', [0.21, 0.28, 0.006], 0xff7043, { l: 'CUISINE', sub: '100 RECETTES' }],
  ['mag_sport', 'Magazine « Sport Mag »', 'pmag', [0.21, 0.28, 0.006], 0x2e7d32, { l: 'SPORT MAG', sub: 'MERCATO' }],
  ['mag_crosswords', 'Mots fléchés « Force 3 »', 'pmag', [0.17, 0.24, 0.006], 0xffd600, { l: 'MOTS FLÉCHÉS', sub: 'FORCE 3', use: 'read', p: { text: 'La grille est à moitié remplie. 7 lettres, « gardien de la nuit » : V-E-I-L-L-E-U-R. Quelqu\'un a ajouté au stylo, dans la marge : « il ne dort jamais ».' } }],
  ['mag_mystery', 'Magazine « Science & Mystères »', 'pmag', [0.21, 0.28, 0.006], 0x311b92, { l: 'MYSTÈRES', sub: 'OVNI', use: 'read', p: { text: 'Dossier spécial : « Les lieux hantés de nos régions ». Page 12, une photo floue du parking d\'un centre commercial. La légende a été découpée.' } }],
  ['mag_bobby', 'Journal de Bobby', 'pmag', [0.2, 0.27, 0.006], 0xffb300, { l: 'BOBBY', sub: 'JEUX', photo: 'bear', use: 'read', p: { text: 'Le journal des enfants du Royaume du Jouet. Jeu des 7 erreurs : dans la seconde image, Bobby n\'est plus sur son étagère.' } }],
  ['mag_deco', 'Magazine « Maison Douce »', 'pmag', [0.22, 0.29, 0.006], 0xa1887f, { l: 'MAISON DOUCE', photo: 'house' }],
  ['mag_games', 'Magazine « Pixel Mag »', 'pmag', [0.21, 0.28, 0.006], 0x7c4dff, { l: 'PIXEL MAG', sub: 'SOLUCES', photo: 'pad' }],
  ['mag_rock', 'Magazine « Rock & Folk Hélios »', 'pmag', [0.23, 0.3, 0.006], 0x212121, { l: 'ROCK & FOLK', photo: 'face' }],
  ['mag_women', 'Magazine « Madame Rose »', 'pmag', [0.21, 0.28, 0.006], 0xf06292, { l: 'MADAME ROSE', sub: 'MODE' }],
  ['newspaper_local', 'La Gazette d\'Hélios', 'newspaper', [0.29, 0.015, 0.38], 0xf3f0e8, { use: 'newspaper', p: {}, l: 'LA GAZETTE', sub: 'TRAVAUX AU SOUS-SOL ?', desc: 'Le quotidien local. Lisez les gros titres (clic gauche).' }],
  ['newspaper_sport', 'Le Sport du Jour', 'newspaper', [0.29, 0.015, 0.38], 0xfff8e1, { use: 'newspaper', p: {}, l: 'LE SPORT', sub: 'VICTOIRE !', desc: 'Les résultats d\'hier. Lisez les gros titres (clic gauche).' }],
]);
G('tabac', { mat: 'paper', use: 'generic', desc: 'Un article du bureau de tabac.' }, [
  ['scratch_cash', 'Ticket « Cash Hélios »', 'pcard', [0.1, 0.15, 0.002], 0x43a047, { use: 'scratch', l: 'CASH HÉLIOS', sub: 'Jusqu\'à 50 000 €', pi: 'star', desc: 'Grattez (clic gauche). On ne sait jamais.' }],
  ['scratch_astro', 'Ticket « Astro »', 'pcard', [0.08, 0.12, 0.002], 0x311b92, { use: 'scratch', l: 'ASTRO', sub: 'Votre signe gagnant', pi: 'moon', desc: 'Grattez (clic gauche). Les astres vous sourient. Ou pas.' }],
  ['stamps', 'Carnet de timbres', 'pcard', [0.06, 0.09, 0.003], 0xd32f2f, { lk: 'card', l: 'TIMBRES', sub: 'Lettre verte ×12', pi: 'star', use: 'read', p: { text: 'Douze timbres « Lettre verte ». Pour écrire à qui ? Le centre n\'a plus de boîte aux lettres depuis 1987.' } }],
  ['envelopes', 'Enveloppes ×25', 'pbox', [0.23, 0.04, 0.12], 0xfafafa, { mat: 'paper', lk: 'plain', b: 'Papeterie Hélios', top: true }],
  ['ballpoint_pen', 'Stylo bille', 'stick', [0.01, 0.01, 0.14], 0x1565c0, { mat: 'plastic', desc: 'Un stylo bleu. Pour noter les heures de ronde… et le reste.' }],
  ['school_notebook', 'Cahier à grands carreaux', 'book', [0.17, 0.22, 0.008], 0x29b6f6, { use: 'read', p: { text: 'Un cahier neuf. Sauf la dernière page, griffonnée : un plan du sous-sol, et une flèche vers une porte marquée « B-13 ».' } }],
  ['phone_card', 'Télécarte 50 unités', 'pcard', [0.085, 0.054, 0.002], 0x0277bd, { mat: 'plastic', lk: 'card', l: 'TÉLÉCARTE', sub: '50 unités', pi: 'phone', use: 'read', p: { text: 'Une télécarte. Il ne reste plus de cabine téléphonique dans le centre… sauf une, au parking, que personne n\'a vue fonctionner.' } }],
  ['postcard_night', 'Carte postale « Hélios la nuit »', 'pcard', [0.15, 0.1, 0.002], 0x1a237e, { lk: 'card', l: 'Hélios la nuit', sub: 'Centre Commercial Hélios', pi: 'moon', use: 'read', p: { text: 'La galerie illuminée, la nuit. En regardant de près, une silhouette se tient devant le Royaume du Jouet.' } }],
  ['postcard_fountain', 'Carte postale « La fontaine »', 'pcard', [0.15, 0.1, 0.002], 0x4fc3f7, { lk: 'card', l: 'La fontaine', sub: 'Atrium du centre', pi: 'drop', use: 'read', p: { text: '« Jetez une pièce, faites un vœu ! » Au dos : « Nous avons fait le même vœu. Il ne s\'est jamais réalisé. »' } }],
  ['lighter_storm', 'Briquet tempête', 'box', [0.035, 0.055, 0.012], 0x9e9e9e, { mat: 'metal', use: 'lighter', desc: 'Résiste au vent des conduits. Flamme vacillante (clic gauche).' }],
  ['lighter_disposable', 'Briquet jetable', 'box', [0.025, 0.08, 0.012], 0x1e88e5, { mat: 'plastic', use: 'lighter', desc: 'Un briquet bon marché. Allume les bougies.' }],
  ['keychain_torch', 'Porte-clés lampe', 'flashlight', [0.02, 0.02, 0.07], 0xd32f2f, { mat: 'plastic', use: 'flashlight', p: { kind: 'cheap' }, desc: 'Une minuscule lampe de porte-clés. Mieux que rien.' }],
  ['road_map', 'Carte routière régionale', 'book', [0.13, 0.25, 0.01], 0xfbc02d, { use: 'read', p: { text: 'Carte routière. Le centre Hélios y est entouré au feutre rouge, avec la mention « ne pas s\'arrêter ».' } }],
  ['crossword_book', 'Recueil de mots croisés', 'pbook', [0.15, 0.21, 0.01], 0xffeb3b, { use: 'read', b: 'Jeux & Grilles', l: 'Mots croisés', sub: '200 grilles', pi: 'star', p: { text: 'Deux cents grilles. La grille n° 87 est entièrement remplie de « HÉLIOS ».' } }],
]);

// ───────────────────────── CAFÉ ─────────────────────────
G('cafeteria', { mat: 'ceramic', use: 'drink', p: { food: 3, effect: 'energy', hot: true }, desc: 'Servi au comptoir. Encore tiède, par miracle.' }, [
  ['espresso', 'Expresso', 'cup', [0.06, 0.05, 0.06], 0xffffff, {}],
  ['cafe_creme', 'Café crème', 'cup', [0.08, 0.09, 0.08], 0xffffff, { p: { food: 5 } }],
  ['latte', 'Latte macchiato', 'cup', [0.07, 0.15, 0.07], 0xe0f2f1, { mat: 'glass', p: { food: 7, breakable: true } }],
  ['orange_juice_glass', 'Jus d\'orange pressé', 'cup', [0.07, 0.12, 0.07], 0xffb74d, { mat: 'glass', p: { food: 6, effect: 'energy', hot: false, breakable: true } }],
  ['tartine', 'Tartine beurrée', 'box', [0.2, 0.02, 0.08], 0xe0a05c, { mat: 'soft', use: 'eat', p: { sound: 'eat_crunch', food: 10, hot: false, effect: null } }],
  ['croque_monsieur', 'Croque-monsieur', 'box', [0.12, 0.04, 0.12], 0xd4893a, { mat: 'soft', use: 'eat', p: { sound: 'eat_crunch', food: 20, effect: 'calm' } }],
  ['cake_slice', 'Part de cake aux fruits', 'box', [0.04, 0.08, 0.09], 0xc8954f, { mat: 'soft', use: 'eat', p: { sound: 'eat_soft', food: 10, hot: false, effect: null } }],
  ['teapot', 'Théière', 'kettle', [0.2, 0.16, 0.14], 0xfafafa, { use: 'generic', desc: 'Une théière en porcelaine. Vide.' }],
  ['mug_helios', 'Mug « Hélios »', 'pmug', [0.11, 0.1, 0.09], 0xffffff, { use: 'generic', b: 'Hélios', l: 'HÉLIOS', pi: 'sun', c2: 0x3e2723, desc: 'Un mug au logo du centre. « Ouvert depuis 1987 ».' }],
  ['sugar_bowl', 'Sucrier', 'pjar', [0.09, 0.09, 0.09], 0xfafafa, { use: 'eat', p: { sound: 'eat_crunch', food: 3, effect: 'sugar' }, c2: 0xfafafa, desc: 'Des morceaux de sucre. Pour les coups de fatigue.' }],
]);

// ───────────────────────── ROYAUME DU JOUET ─────────────────────────
G('peluches', { mat: 'soft', use: 'squeak', p: { sound: 'squeak' }, desc: 'Une peluche toute douce. Elle couine quand on la serre.' }, [
  ['plush_panda', 'Panda en peluche', 'pplush', [0.24, 0.3, 0.18], 0xfafafa, { an: 'panda' }],
  ['plush_elephant', 'Éléphant en peluche', 'pplush', [0.26, 0.28, 0.2], 0x90a4ae, { an: 'elephant', p: { pitch: 0.7 } }],
  ['plush_lion', 'Lion en peluche', 'pplush', [0.26, 0.3, 0.2], 0xffb300, { an: 'lion', c3: 0x8d4a1d }],
  ['plush_unicorn', 'Licorne en peluche', 'pplush', [0.24, 0.32, 0.18], 0xfce4ec, { an: 'unicorn', c3: 0xab47bc, p: { pitch: 1.3 } }],
  ['plush_penguin', 'Pingouin en peluche', 'pplush', [0.18, 0.26, 0.16], 0x263238, { an: 'penguin' }],
  ['plush_dog', 'Chien en peluche', 'pplush', [0.22, 0.26, 0.18], 0xa1887f, { an: 'dog', c3: 0xd32f2f }],
  ['plush_fox', 'Renard en peluche', 'pplush', [0.22, 0.26, 0.18], 0xef6c00, { an: 'fox', c2: 0xfafafa }],
  ['plush_frog', 'Grenouille en peluche', 'pplush', [0.2, 0.2, 0.18], 0x7cb342, { an: 'frog', p: { pitch: 0.9 } }],
  ['plush_snake', 'Serpent en peluche', 'pplush', [0.2, 0.3, 0.2], 0x43a047, { an: 'snake', c2: 0xffeb3b }],
  ['plush_bobby_mini', 'Mini Bobby porte-clés', 'pplush', [0.1, 0.13, 0.08], 0xc8873a, { an: 'bear', c3: 0xd32f2f, use: 'bobby', desc: 'Un petit Bobby. Serrez-le : il demande si vous restez avec lui.' }],
]);
G('jeux', { mat: 'cardboard', use: 'read', lk: 'toybox', desc: 'Un jouet dans sa boîte. Les enfants l\'auraient adoré.' }, [
  ['toy_dollhouse', 'Maison de poupée', 'pbox', [0.5, 0.42, 0.18], 0xf48fb1, { b: 'Jouéclat', l: 'Maison de poupée', pi: 'house', sub: '3+', mass: 2, p: { text: 'Une maison de poupée en kit. Sur l\'illustration, une petite fille regarde par la fenêtre du deuxième étage.' } }],
  ['toy_firetruck', 'Camion de pompiers', 'pbox', [0.36, 0.2, 0.15], 0xd32f2f, { b: 'Jouéclat', l: 'Camion pompiers', pi: 'car', pc: 0xd32f2f, sub: 'sons et lumières', p: { text: 'Pin-pon ! Piles non fournies. Les pompiers du jouet ont l\'air bien plus rassurants que les vrais.' } }],
  ['toy_racetrack', 'Circuit de voitures', 'pbox', [0.55, 0.12, 0.35], 0x1565c0, { b: 'Turbo Kids', l: 'Circuit 8 m', pi: 'car', sub: '2 voitures', top: true, p: { text: 'Huit mètres de piste et deux bolides. Le looping « de la mort » est en option.' } }],
  ['toy_robot_kit', 'Robot à construire', 'pbox', [0.3, 0.25, 0.1], 0x546e7a, { b: 'Méca Junior', l: 'Robot à monter', pi: 'robot', sub: '8+', p: { text: '« Assemble ton robot et programme-le ! » Le robot de la photo a les yeux rouges.' } }],
  ['toy_castle', 'Château fort', 'pbox', [0.45, 0.35, 0.15], 0x6d4c41, { b: 'Jouéclat', l: 'Château fort', pi: 'house', pc: 0x9e9e9e, sub: '4+', p: { text: 'Un château avec pont-levis et oubliettes. « Les oubliettes n\'ont pas de fond », dit la notice. Bizarre.' } }],
  ['toy_kitchen', 'Dînette', 'pbox', [0.35, 0.25, 0.12], 0xff7043, { b: 'Jouéclat', l: 'Ma dînette', pi: 'cup', sub: '3+', p: { text: 'Assiettes, couverts et petite casserole. Pour jouer à la marchande.' } }],
  ['toy_doctor', 'Mallette du docteur', 'pbox', [0.3, 0.22, 0.1], 0xfafafa, { b: 'Jouéclat', l: 'Petit docteur', pi: 'cross', pc: 0xd32f2f, p: { text: 'Stéthoscope, seringue en plastique, pansements. « Soigne tes peluches ! »' } }],
  ['toy_magic', 'Coffret de magie', 'pbox', [0.38, 0.06, 0.28], 0x311b92, { b: 'Mystéria', l: 'Magie 100 tours', pi: 'star', top: true, p: { text: 'Cent tours de magie. Le tour n° 13 : « faire disparaître quelqu\'un ». La page est arrachée.' } }],
  ['toy_chemistry', 'Petit chimiste', 'pbox', [0.38, 0.07, 0.26], 0x00897b, { b: 'Méca Junior', l: 'Petit chimiste', pi: 'drop', top: true, p: { text: 'Quarante expériences. Lunettes de protection incluses. Ne pas mélanger le flacon n° 7 avec quoi que ce soit.' } }],
  ['toy_figure_astro', 'Figurine astronaute', 'pbox', [0.12, 0.2, 0.05], 0x1565c0, { b: 'Galaxie Héros', l: 'Astronaute', pi: 'star', p: { text: 'Figurine articulée, casque amovible. Série limitée « Mission Lune ».' } }],
  ['toy_figure_knight', 'Figurine chevalier', 'pbox', [0.12, 0.2, 0.05], 0x8d6e63, { b: 'Galaxie Héros', l: 'Chevalier', pi: 'mask', pc: 0x9e9e9e, p: { text: 'Le chevalier noir, avec épée et bouclier. Il garde le château… la nuit.' } }],
  ['toy_cars_5', 'Coffret 5 petites voitures', 'pbox', [0.3, 0.06, 0.12], 0xffd600, { b: 'Turbo Kids', l: '5 voitures', pi: 'car', use: 'container', p: { contains: ['toy_car', 'toy_car'] }, desc: 'Cinq voitures miniatures. Ouvrez le coffret pour en sortir.' }],
  ['toy_train_set', 'Coffret train électrique', 'pbox', [0.6, 0.12, 0.4], 0x2e7d32, { b: 'Rail Hélios', l: 'Train électrique', pi: 'car', top: true, use: 'container', p: { contains: ['toy_train'] }, mass: 2, desc: 'Locomotive, wagons, rails. Ouvrez-le pour sortir le petit train.' }],
  ['puzzle_500', 'Puzzle 500 pièces', 'pbox', [0.3, 0.05, 0.2], 0x00acc1, { b: 'Ravenel', l: 'Puzzle 500', pi: 'puzzle', top: true, p: { text: 'Le phare de nuit. 500 pièces. Il en manque une, au milieu du faisceau.' } }],
  ['game_cards', 'Jeu de 54 cartes', 'pbox', [0.065, 0.09, 0.02], 0xd32f2f, { b: 'Jeux Lunaires', l: '54 cartes', pi: 'heart', p: { text: 'Un jeu de 54 cartes. Il contient trois jokers. Ce n\'est pas normal.' } }],
  ['game_colors', 'Jeu de cartes « Couleurs »', 'pbox', [0.1, 0.14, 0.04], 0x212121, { b: 'Jeux Lunaires', l: 'COULEURS', pi: 'star', p: { text: 'Le jeu de cartes de la famille. +4 ! Changement de sens ! Passe ton tour !' } }],
  ['game_dominos', 'Dominos', 'pbox', [0.2, 0.05, 0.08], 0x5d4037, { mat: 'wood', b: 'Jeux Lunaires', l: 'Dominos', pi: 'cube', p: { text: 'Vingt-huit dominos dans une boîte en bois.' } }],
  ['game_chess', 'Jeu d\'échecs', 'pbox', [0.3, 0.05, 0.3], 0x3e2723, { mat: 'wood', b: 'Jeux Lunaires', l: 'Échecs', pi: 'star', top: true, p: { text: 'Un échiquier pliant. Une pièce noire manque : la reine.' } }],
  ['game_memo', 'Mémo des animaux', 'pbox', [0.25, 0.06, 0.25], 0x43a047, { b: 'Jeux Lunaires', l: 'Mémo animaux', pi: 'cat', top: true, p: { text: 'Retrouve les paires ! Une carte n\'a pas de jumelle : un ours souriant.' } }],
  ['game_quiz', 'Quiz de la famille', 'pbox', [0.28, 0.08, 0.28], 0x1e88e5, { b: 'Jeux Lunaires', l: 'Quiz familial', pi: 'star', top: true, p: { text: 'Question au hasard : « En quelle année a ouvert le centre Hélios ? » Réponse : 1987.' } }],
]);
G('jouets_divers', { mat: 'plastic', use: 'squeak', p: { sound: 'squeak' }, desc: 'Un jouet. Il fait du bruit, forcément.' }, [
  ['water_gun', 'Pistolet à eau', 'gun', [0.05, 0.13, 0.22], 0x29b6f6, { use: 'spray', p: { sound: 'spray' }, desc: 'Un pistolet à eau. Clic gauche : pschitt. Les présences n\'aiment pas être mouillées… peut-être.' }],
  ['soap_bubbles', 'Flacon de bulles', 'pbot', [0.045, 0.12, 0.045], 0xec407a, { sil: 'vial', use: 'bubbles', b: 'Jouéclat', l: 'Bulles', pi: 'bubbles', c2: 0xffd600, desc: 'Des bulles de savon : elles révèlent les courants d\'air… et ce qui bouge dedans.' }],
  ['crayons', 'Crayons de couleur ×12', 'pbox', [0.18, 0.1, 0.012], 0xffd600, { mat: 'cardboard', use: 'generic', b: 'Arc-en-ciel', l: '12 crayons', pi: 'brush', desc: 'Douze crayons de couleur. Le noir est usé jusqu\'au bout.' }],
  ['chalk_box', 'Craies de trottoir', 'pbox', [0.15, 0.1, 0.06], 0xab47bc, { mat: 'cardboard', use: 'generic', b: 'Arc-en-ciel', l: 'Craies géantes', pi: 'star', desc: 'Des craies géantes. Pour dessiner une marelle… ou des flèches au sol.' }],
  ['play_dough', 'Pâte à modeler ×4', 'pbox', [0.2, 0.08, 0.06], 0xff7043, { mat: 'cardboard', use: 'generic', b: 'Modelo', l: 'Pâte à modeler', pi: 'cube', desc: 'Quatre pots de pâte à modeler. Ça sent l\'école maternelle.' }],
  ['balloons_bag', 'Sachet de ballons de baudruche', 'ppouch', [0.12, 0.18, 0.02], 0xe91e63, { use: 'generic', b: 'Fête Facile', l: 'Ballons ×20', pi: 'star', desc: 'Vingt ballons à gonfler. Un ballon qui flotte dans le noir, ça fait toujours peur.' }],
  ['party_popper', 'Pétard à confettis', 'pcan', [0.04, 0.12, 0.04], 0xffd600, { use: 'popper', lid: 0xd32f2f, b: 'Fête Facile', l: 'POP !', pi: 'star', desc: 'Tirez la ficelle (clic gauche) : BANG, et une pluie de confettis. Les présences sursautent aussi.' }],
  ['toy_microphone', 'Micro karaoké', 'stick', [0.05, 0.05, 0.22], 0xe040fb, { p: { sound: 'beep' }, desc: 'Un micro jouet. Il fait écho… même éteint.' }],
  ['baby_rattle', 'Hochet', 'maracas', [0.06, 0.14, 0.06], 0x4fc3f7, { p: { sound: 'rattle', pitch: 1.5 } }],
  ['stacking_rings', 'Anneaux à empiler', 'top', [0.1, 0.16, 0.1], 0xffd600, { use: 'generic', desc: 'Des anneaux de couleur à empiler. Jouet d\'éveil.' }],
  ['kite', 'Cerf-volant', 'pbox', [0.5, 0.65, 0.02], 0xe53935, { mat: 'soft', use: 'generic', lk: 'card', l: 'Cerf-volant', pi: 'star', b: '', desc: 'Un cerf-volant losange. Pas de vent dans le centre. Sauf dans les conduits.' }],
  ['jump_rope', 'Corde à sauter', 'rope', [0.16, 0.04, 0.16], 0xec407a, { use: 'generic', desc: 'Une corde à sauter avec poignées en bois.' }],
  ['toy_piano', 'Piano jouet', 'xylo', [0.32, 0.06, 0.14], 0xd32f2f, { use: 'xylo', desc: 'Chaque clic joue la note suivante.' }],
]);

// ───────────────────────── ÉLECTROMAISON ─────────────────────────
G('electro', { mat: 'cardboard', use: 'container', lk: 'device', desc: 'Un appareil neuf dans son carton. Ouvrez-le (clic gauche) pour le sortir.' }, [
  ['box_toaster', 'Grille-pain (carton)', 'pbox', [0.32, 0.24, 0.2], 0xfafafa, { b: 'Électra', l: 'Grille-pain 2 fentes', pi: 'bread', p: { contains: ['toaster'] }, mass: 1.5 }],
  ['box_kettle', 'Bouilloire (carton)', 'pbox', [0.22, 0.28, 0.18], 0xeceff1, { b: 'Électra', l: 'Bouilloire 1,7 L', pi: 'cup', p: { contains: ['kettle'] }, mass: 1.2 }],
  ['box_blender', 'Blender (carton)', 'pbox', [0.2, 0.42, 0.2], 0x263238, { b: 'Électra', l: 'Blender', pi: 'drop', fg: 0xffffff, p: { contains: ['blender'] }, mass: 2 }],
  ['box_hairdryer', 'Sèche-cheveux (carton)', 'pbox', [0.25, 0.25, 0.1], 0xf8bbd0, { b: 'Beauté Pro', l: 'Sèche-cheveux', pi: 'spray', p: { contains: ['hairdryer'] } }],
  ['box_iron', 'Fer à repasser (carton)', 'pbox', [0.3, 0.17, 0.14], 0x0277bd, { b: 'Électra', l: 'Fer vapeur', pi: 'house', p: { contains: ['iron'] } }],
  ['box_fan', 'Ventilateur (carton)', 'pbox', [0.42, 0.45, 0.14], 0xfafafa, { b: 'Électra', l: 'Ventilateur', pi: 'snow', pc: 0x29b6f6, p: { contains: ['fan'] }, mass: 3 }],
  ['box_radio', 'Radio (carton)', 'pbox', [0.34, 0.22, 0.13], 0x795548, { b: 'Sonora', l: 'Radio FM', pi: 'note', p: { contains: ['radio'] } }],
  ['box_lamp', 'Lampe de chevet (carton)', 'pbox', [0.22, 0.38, 0.22], 0xfff3e0, { b: 'Lumina', l: 'Lampe de chevet', pi: 'bulb', p: { contains: ['lamp'] } }],
  ['box_vacuum', 'Aspirateur (carton)', 'pbox', [0.36, 0.4, 0.45], 0x7b1fa2, { b: 'Électra', l: 'Aspirateur', pi: 'house', fg: 0xffffff, p: { contains: ['vacuum'] }, mass: 5 }],
  ['box_shaver', 'Rasoir électrique (carton)', 'pbox', [0.16, 0.22, 0.07], 0x37474f, { b: 'Fil d\'Acier', l: 'Rasoir 3 têtes', pi: 'tool', p: { contains: ['shaver'] } }],
  ['box_toothbrush', 'Brosse à dents électrique (carton)', 'pbox', [0.1, 0.28, 0.07], 0x00bcd4, { b: 'Dentiblanc', l: 'Brosse électrique', pi: 'tooth', p: { contains: ['toothbrush'] } }],
  ['box_speaker', 'Enceinte Bluetooth (carton)', 'pbox', [0.12, 0.22, 0.12], 0x263238, { b: 'Sonora', l: 'Enceinte', pi: 'note', pc: 0x00e5ff, p: { contains: ['speaker'] } }],
  ['radio_alarm', 'Radio-réveil', 'pbox', [0.2, 0.09, 0.1], 0x212121, { mat: 'plastic', use: 'radio', lk: 'plain', b: '03:33', fg: 0xff1744, lc: 0x111111, desc: 'Allumer (clic gauche), changer de station (R). L\'alarme est réglée sur 3 h 33.' }],
  ['kitchen_scale', 'Balance de cuisine', 'box', [0.2, 0.03, 0.2], 0xfafafa, { mat: 'plastic', use: 'generic', desc: 'Une balance électronique. Elle affiche 0,0 g. Puis 13 g, sans rien dessus.' }],
  ['tv_remote', 'Télécommande universelle', 'pbox', [0.05, 0.02, 0.18], 0x212121, { lk: 'keys', mat: 'plastic', use: 'squeak', p: { sound: 'button' }, desc: 'Une télécommande. Elle ne commande que les télés du magasin… normalement.' }],
]);

// ───────────────────────── PIXEL PLANET ─────────────────────────
G('jeuxvideo', { mat: 'plastic', use: 'read', lk: 'media', desc: 'Un jeu vidéo en boîte. Kevin l\'a forcément déjà terminé.' }, [
  ['game_kart', 'Jeu « Hélio Kart »', 'pbox', [0.135, 0.19, 0.014], 0xd32f2f, { l: 'HÉLIO KART', b: 'PIXEL', pi: 'car', sub: 'Course · 1-4 joueurs', p: { text: 'Course de karts déjantée dans un centre commercial. Le circuit « Parking -1 » est réputé maudit.' } }],
  ['game_dragon', 'Jeu « Dragon Quête »', 'pbox', [0.135, 0.19, 0.014], 0x1a237e, { l: 'DRAGON QUÊTE', b: 'PIXEL', pi: 'flame', sub: 'Aventure · RPG', p: { text: 'Cent heures d\'aventure. La sauvegarde de Kevin indique 999 heures de jeu.' } }],
  ['game_zombie', 'Jeu « Zombie Mall »', 'pbox', [0.135, 0.19, 0.014], 0x212121, { l: 'ZOMBIE MALL', b: 'PIXEL', pi: 'skull', sub: 'Interdit -16 ans', p: { text: 'Survivez une nuit dans un centre commercial envahi. Trop réaliste, d\'après les clients.' } }],
  ['game_foot', 'Jeu « Foot Champions 98 »', 'pbox', [0.135, 0.19, 0.014], 0x2e7d32, { l: 'FOOT 98', b: 'PIXEL', pi: 'ball', sub: 'Sport', p: { text: 'Le jeu de foot de référence. La France gagne à tous les coups.' } }],
  ['game_ninja', 'Jeu « Ninja Shadow »', 'pbox', [0.135, 0.19, 0.014], 0x37474f, { l: 'NINJA SHADOW', b: 'PIXEL', pi: 'moon', sub: 'Action · Infiltration', p: { text: 'Restez dans l\'ombre. Ne vous faites jamais voir par les caméras. Ça vous rappelle quelque chose ?' } }],
  ['game_puzzle', 'Jeu « Galaxie Puzzle »', 'pbox', [0.135, 0.19, 0.014], 0x7c4dff, { l: 'GALAXIE PUZZLE', b: 'PIXEL', pi: 'cube', sub: 'Réflexion', p: { text: 'Des blocs qui tombent de l\'espace. Addictif.' } }],
  ['game_farm', 'Jeu « Ma Petite Ferme »', 'pbox', [0.135, 0.19, 0.014], 0x8bc34a, { l: 'PETITE FERME', b: 'PIXEL', pi: 'cow', sub: 'Simulation', p: { text: 'Cultivez, récoltez, vendez. Les vaches regardent la caméra.' } }],
  ['game_horror', 'Jeu « Nuit Blanche »', 'pbox', [0.135, 0.19, 0.014], 0x111111, { l: 'NUIT BLANCHE', b: 'PIXEL', pi: 'eye', sub: 'Horreur', p: { text: 'Un gardien de nuit dans un centre commercial. Sur la jaquette, le centre ressemble trait pour trait à Hélios. Le jeu n\'est sorti nulle part.' } }],
  ['console_box', 'Console de salon (carton)', 'pbox', [0.38, 0.3, 0.12], 0x212121, { mat: 'cardboard', lk: 'device', b: 'NOVA', l: 'Console Nova 64', pi: 'pad', pc: 0x7c4dff, fg: 0xffffff, use: 'container', p: { contains: ['controller'] }, mass: 2.5, desc: 'Une console neuve. Dans le carton : une manette, et un papier « ne jouez pas après minuit ».' }],
  ['pocketboy_box', 'PocketBoy (boîte)', 'pbox', [0.15, 0.2, 0.06], 0x9e9e9e, { mat: 'cardboard', lk: 'device', b: 'NOVA', l: 'PocketBoy', pi: 'pad', pc: 0x8bac0f, use: 'container', p: { contains: ['pocketboy'] }, desc: 'Une PocketBoy neuve, sous blister. Ouvrez la boîte (clic gauche).' }],
  ['controller_wireless', 'Manette sans fil', 'controller', [0.15, 0.04, 0.1], 0xfafafa, { use: 'squeak', p: { sound: 'button' }, desc: 'Une manette blanche. Les boutons cliquent.' }],
  ['memory_card', 'Carte mémoire', 'pblist', [0.09, 0.14, 0.02], 0x1565c0, { use: 'generic', b: 'NOVA', l: 'Carte mémoire', pi: 'cube', c2: 0xffd600, desc: 'Quinze blocs de sauvegarde. Une partie est déjà enregistrée : « LUCIE ».' }],
  ['game_guide', 'Guide officiel « Dragon Quête »', 'pbook', [0.2, 0.27, 0.015], 0x1a237e, { use: 'read', b: 'PIXEL', l: 'Guide officiel', sub: 'Dragon Quête', pi: 'flame', p: { text: 'Toutes les soluces. Page 87 : « Pour ouvrir la porte scellée, il faut la clé du sous-sol. »' } }],
  ['arcade_stick', 'Stick arcade', 'pbox', [0.35, 0.1, 0.22], 0x212121, { lk: 'plain', use: 'squeak', p: { sound: 'button' }, top: true, desc: 'Un stick arcade pour les puristes.' }],
  ['figurine_hero', 'Figurine « Super Hélio »', 'doll', [0.07, 0.18, 0.07], 0xd32f2f, { use: 'generic', desc: 'Le héros de Pixel Planet, en plastique. Kevin en a douze chez lui.' }],
  ['poster_game', 'Poster « Galaxie Puzzle »', 'pcard', [0.4, 0.6, 0.004], 0x7c4dff, { mat: 'paper', lk: 'media', l: 'GALAXIE PUZZLE', pi: 'cube', use: 'read', p: { text: 'Un poster du jeu. « Battez le record de Kevin : 999 999 points ».' } }],
]);

// ───────────────────────── RÉTRO VIDÉO CLUB ─────────────────────────
G('dvd', { mat: 'plastic', use: 'read', lk: 'media', desc: 'Un film en DVD. Le lecteur du vidéo club, lui, ne lit que les VHS.' }, [
  ['dvd_basement', 'DVD « Le Sous-sol »', 'pbox', [0.135, 0.19, 0.014], 0x263238, { l: 'LE SOUS-SOL', pi: 'eye', sub: 'Interdit -16 ans', p: { text: '« Il y a une porte que personne n\'ouvre. » Un huis clos dans les sous-sols d\'un grand magasin.' } }],
  ['dvd_action', 'DVD « Tonnerre sur Paris »', 'pbox', [0.135, 0.19, 0.014], 0xbf360c, { l: 'TONNERRE SUR PARIS', pi: 'bolt', p: { text: 'Explosions, cascades, un flic au bout du rouleau. Le classique du dimanche soir.' } }],
  ['dvd_comedy', 'DVD « Vacances au camping »', 'pbox', [0.135, 0.19, 0.014], 0x29b6f6, { l: 'VACANCES AU CAMPING', pi: 'sun', p: { text: 'La comédie de l\'été. Rires garantis, ou remboursés.' } }],
  ['dvd_romance', 'DVD « Un été à Biarritz »', 'pbox', [0.135, 0.19, 0.014], 0xf48fb1, { l: 'UN ÉTÉ À BIARRITZ', pi: 'heart', p: { text: 'Deux cœurs, une plage, un été. Mouchoirs conseillés.' } }],
  ['dvd_scifi', 'DVD « Orbite 7 »', 'pbox', [0.135, 0.19, 0.014], 0x1a237e, { l: 'ORBITE 7', pi: 'star', p: { text: 'Dans l\'espace, personne ne vous entend ranger les rayons.' } }],
  ['dvd_cartoon', 'DVD « Les P\'tits Monstres »', 'pbox', [0.135, 0.19, 0.014], 0x7cb342, { l: 'LES P\'TITS MONSTRES', pi: 'ghost', p: { text: 'Des monstres gentils qui ont peur des enfants. Dessin animé pour toute la famille.' } }],
  ['dvd_western', 'DVD « Le Dernier Saloon »', 'pbox', [0.135, 0.19, 0.014], 0x8d6e63, { l: 'LE DERNIER SALOON', pi: 'sun', pc: 0xff6f00, p: { text: 'Un shérif, un saloon, un duel au coucher du soleil.' } }],
  ['dvd_thriller', 'DVD « Code B-13 »', 'pbox', [0.135, 0.19, 0.014], 0x111111, { l: 'CODE B-13', pi: 'key', pc: 0xd32f2f, sub: 'D\'après une histoire vraie', p: { text: '« D\'après des faits réels survenus en 1987. » Le résumé au dos a été gratté au couteau.' } }],
  ['dvd_kungfu', 'DVD « La Fureur du Tigre »', 'pbox', [0.135, 0.19, 0.014], 0xffb300, { l: 'LA FUREUR DU TIGRE', pi: 'flame', p: { text: 'Un maître, un disciple, une vengeance. Doublage d\'époque.' } }],
  ['dvd_musical', 'DVD « Disco Nights »', 'pbox', [0.135, 0.19, 0.014], 0xd500f9, { l: 'DISCO NIGHTS', pi: 'star', p: { text: 'Paillettes, boule à facettes et pattes d\'eph\'.' } }],
  ['cd_album_rock', 'CD « Les Néons » — Électrique', 'pbox', [0.142, 0.125, 0.01], 0x212121, { l: 'ÉLECTRIQUE', b: 'LES NÉONS', pi: 'bolt', use: 'generic', desc: 'Le premier album des Néons. Il fallait être là.' }],
  ['cd_album_chanson', 'CD « Mireille Dauphin » — Mes plus belles chansons', 'pbox', [0.142, 0.125, 0.01], 0xc2185b, { l: 'PLUS BELLES CHANSONS', b: 'M. DAUPHIN', pi: 'heart', use: 'generic', desc: 'Les grands succès de la chanson française d\'hier.' }],
  ['cd_album_electro', 'CD « Nuit Synthétique »', 'pbox', [0.142, 0.125, 0.01], 0x311b92, { l: 'NUIT SYNTHÉTIQUE', b: 'HÉLIOS RECORDS', pi: 'sun', use: 'generic', desc: 'Synthétiseurs et boîtes à rythmes. Parfait pour une ronde de nuit.' }],
  ['vhs_blank', 'Cassette vierge E-180', 'pbox', [0.19, 0.105, 0.025], 0x212121, { lk: 'plain', b: 'E-180', use: 'generic', desc: 'Une cassette vierge. Trois heures d\'enregistrement disponibles.' }],
  ['vhs_sleeve_horror', 'Jaquette VHS « La Nuit des Mannequins »', 'pbox', [0.105, 0.19, 0.025], 0x111111, { l: 'LA NUIT DES MANNEQUINS', pi: 'skull', p: { text: 'Une jaquette de location. Vide. Une étiquette « EN RETARD » est collée dessus. La cassette n\'a jamais été rendue.' } }],
  ['popcorn_micro_vc', 'Pop-corn caramel pour micro-ondes', 'pbox', [0.15, 0.2, 0.05], 0xffb300, { mat: 'cardboard', lk: 'box', use: 'eat', b: 'Ciné Club', l: 'Pop-corn caramel', pi: 'star', p: { sound: 'eat_crunch', food: 2, raw: true, cook: 'popcorn' }, desc: 'Le pop-corn des soirées vidéo. Passez-le au micro-ondes.' }],
]);

// ───────────────────────── LIBRAIRIE ─────────────────────────
G('livres', { mat: 'paper', use: 'read', desc: 'Un livre. Lisez un extrait (clic gauche).' }, [
  ['novel_polar', 'Roman « Meurtre au rayon frais »', 'pbook', [0.13, 0.2, 0.025], 0x212121, { l: 'Meurtre au rayon frais', sub: 'Jacques Morel', b: 'Polar', pi: 'eye', pc: 0xd32f2f, p: { text: '« L\'inspecteur Lebrun observa le caddie abandonné. Il était encore tiède. Quelqu\'un avait fait ses courses… à trois heures du matin. »' } }],
  ['novel_romance', 'Roman « Les Amants de la galerie »', 'pbook', [0.13, 0.2, 0.025], 0xf48fb1, { l: 'Les Amants de la galerie', sub: 'Claire Valmont', b: 'Romance', pi: 'heart', p: { text: '« Ils se retrouvaient chaque soir près de la fontaine, après la fermeture, quand les néons s\'éteignaient un à un. »' } }],
  ['novel_scifi', 'Roman « Les Androïdes de Mars »', 'pbook', [0.13, 0.2, 0.03], 0x1a237e, { l: 'Les Androïdes de Mars', sub: 'P. K. Lenoir', b: 'Galaxie', pi: 'robot', p: { text: '« Les mannequins de la colonie avaient appris à ne bouger que lorsque personne ne les regardait. »' } }],
  ['novel_fantasy', 'Roman « La Couronne d\'ombre »', 'pbook', [0.15, 0.23, 0.045], 0x4a148c, { l: 'La Couronne d\'ombre', sub: 'Tome 1', b: 'Fantasy', pi: 'star', pc: 0xffd600, p: { text: '« Au cœur de la cité marchande dormait un roi sans visage, et chaque nuit, ses gardiens disparaissaient un par un. »' } }],
  ['novel_hugo', 'Roman « Notre-Dame de Paris »', 'pbook', [0.11, 0.18, 0.035], 0x5d4037, { l: 'Notre-Dame de Paris', sub: 'Victor Hugo', b: 'Classiques', pi: 'house', p: { text: '« Il y a aujourd\'hui trois cent quarante-huit ans six mois et dix-neuf jours que les Parisiens s\'éveillèrent au bruit de toutes les cloches… »' } }],
  ['novel_horror2', 'Roman « Ne fermez pas les yeux »', 'pbook', [0.13, 0.2, 0.03], 0x111111, { l: 'Ne fermez pas les yeux', sub: 'S. Kingsley', b: 'Frissons', pi: 'eye', p: { text: '« La règle était simple : tant que tu les regardes, ils ne bougent pas. Le problème, c\'est qu\'il faut bien cligner des yeux. »' } }],
  ['comic_pepito', 'BD « Les Aventures de Pépito »', 'pbook', [0.22, 0.3, 0.01], 0xffeb3b, { l: 'Pépito', sub: 'Tome 7', b: 'BD Hélios', pi: 'star', pc: 0xd32f2f, p: { text: 'Pépito et son chien explorent un centre commercial la nuit. Case finale : une silhouette d\'ours derrière une vitrine.' } }],
  ['manga_ninja', 'Manga « Ninja Hiro » vol. 3', 'pbook', [0.115, 0.175, 0.02], 0xfafafa, { l: 'Ninja Hiro', sub: 'Volume 3', b: 'Manga', pi: 'moon', pc: 0x212121, p: { text: 'Se lit de droite à gauche. Hiro affronte l\'esprit des magasins abandonnés.' } }],
  ['kids_counting', 'Album « Compte avec Bobby »', 'pbook', [0.22, 0.22, 0.01], 0xffb300, { l: 'Compte avec Bobby', b: 'Royaume du Jouet', pi: 'bear', p: { text: '« Un, deux, trois… Bobby compte ses amis. Quatre, cinq, six… il en manque une. Où est-elle ? »' } }],
  ['cookbook_pastry', 'Livre « Pâtisserie facile »', 'pbook', [0.2, 0.26, 0.02], 0xf8bbd0, { l: 'Pâtisserie facile', b: 'Cuisine', pi: 'cake', p: { text: 'Recette du Paris-Brest, page 42. Une tache de café, page 87.' } }],
  ['travel_normandy', 'Guide « Normandie »', 'pbook', [0.12, 0.2, 0.02], 0x0277bd, { l: 'Normandie', sub: 'Guide du routard', b: 'Voyage', pi: 'mountain', p: { text: 'Falaises, cidre et camembert. Une page cornée : « centre Hélios, à éviter de nuit ».' } }],
  ['atlas_world', 'Atlas du monde', 'pbook', [0.25, 0.33, 0.03], 0x1565c0, { l: 'Atlas du monde', b: 'Géographie', pi: 'mountain', p: { text: 'Toutes les cartes du monde. Le centre commercial n\'y figure pas, évidemment.' }, mass: 1.5 }],
  ['dict_english', 'Dictionnaire anglais-français', 'pbook', [0.13, 0.2, 0.05], 0xd32f2f, { l: 'Anglais-français', b: 'Dictionnaires', pi: 'book', p: { text: 'WATCHMAN n. — gardien de nuit. To keep watch : veiller. Souligné au crayon.' } }],
  ['coloring_book', 'Cahier de coloriage', 'pbook', [0.21, 0.29, 0.006], 0x43a047, { l: 'Coloriages', b: 'Arc-en-ciel', pi: 'flower', p: { text: 'Des animaux à colorier. Quelqu\'un a colorié toutes les pages en noir.' } }],
  ['sudoku_book', 'Sudoku « Expert »', 'pbook', [0.15, 0.21, 0.01], 0xff7043, { l: 'Sudoku expert', b: 'Jeux & Grilles', pi: 'cube', p: { text: 'Trois cents grilles. Celle de la dernière page est impossible.' } }],
  ['diary_2', 'Agenda perpétuel', 'pbook', [0.15, 0.21, 0.02], 0x37474f, { l: 'Agenda', b: 'Papeterie Hélios', pi: 'star', p: { text: 'Un agenda vierge. Le 14 novembre est entouré, sur toutes les années.' } }],
]);

// ───────────────────────── MOBIZONE ─────────────────────────
G('telephonie', { mat: 'plastic', use: 'generic', desc: 'Un accessoire de téléphonie.' }, [
  ['phone_box_nova', 'Smartphone « Nova S » (boîte)', 'pbox', [0.09, 0.17, 0.05], 0xfafafa, { mat: 'cardboard', lk: 'device', b: 'NOVA', l: 'Nova S', pi: 'phone', use: 'container', p: { contains: ['smartphone'] }, desc: 'Un smartphone neuf. Ouvrez la boîte (clic gauche).' }],
  ['phone_box_flip', 'Téléphone à clapet (boîte)', 'pbox', [0.09, 0.15, 0.05], 0x263238, { mat: 'cardboard', lk: 'device', b: 'Mobiclip', l: 'Clapet 2G', pi: 'phone', fg: 0xffffff, use: 'container', p: { contains: ['mobile_phone'] }, desc: 'Un téléphone à clapet. Increvable, comme on les faisait avant.' }],
  ['screen_protector', 'Verre trempé', 'pblist', [0.09, 0.18, 0.01], 0x29b6f6, { b: 'MobiZone', l: 'Verre trempé', pi: 'phone', c2: 0xffffff }],
  ['usb_cable', 'Câble USB-C 1 m', 'pblist', [0.09, 0.18, 0.02], 0xfafafa, { b: 'MobiZone', l: 'Câble USB-C', pi: 'bolt', c2: 0x1565c0 }],
  ['car_charger', 'Chargeur allume-cigare', 'pblist', [0.09, 0.15, 0.03], 0x212121, { b: 'MobiZone', l: 'Chargeur auto', pi: 'car', c2: 0xffd600 }],
  ['selfie_stick', 'Perche à selfie', 'stick', [0.03, 0.03, 0.3], 0x212121, { use: 'melee', p: { dmg: 0.5 }, desc: 'Une perche télescopique. Arme ridicule, mais arme quand même.' }],
  ['earphones_wired', 'Écouteurs filaires', 'pblist', [0.09, 0.16, 0.025], 0xfafafa, { use: 'headphones', b: 'Sonora', l: 'Écouteurs', pi: 'headphones', c2: 0xd32f2f, desc: 'De la musique dans les oreilles. Vous n\'entendez plus rien venir.' }],
  ['smartwatch', 'Montre connectée', 'watch', [0.04, 0.012, 0.045], 0x212121, { use: 'watch', desc: 'Affiche l\'heure (clic gauche), et vos battements de cœur. Ils s\'accélèrent.' }],
  ['sim_card', 'Carte SIM prépayée', 'pcard', [0.085, 0.054, 0.002], 0xff6f00, { lk: 'card', l: 'SIM prépayée', sub: '5 € de crédit', pi: 'phone', use: 'read', p: { text: 'Une carte SIM. Le numéro imprimé commence par 06 87… Comme celui qui vous appelle parfois la nuit.' } }],
  ['phone_case_flower', 'Coque à fleurs', 'pcard', [0.08, 0.16, 0.012], 0xf8bbd0, { lk: 'fabric', pat: 'floral', desc: 'Une coque de téléphone à fleurs.' }],
  ['phone_case_black', 'Coque renforcée', 'pcard', [0.08, 0.16, 0.014], 0x212121, { lk: 'plain', b: 'ARMOR', desc: 'Résiste aux chutes. Même aux chutes de très haut.' }],
]);

// ───────────────────────── OPTIQUE ─────────────────────────
G('optique', { mat: 'plastic', use: 'wear', p: { slot: 'face' }, desc: 'Une monture de lunettes. Classe, mais ne change rien à votre vue de gardien.' }, [
  ['glasses_round', 'Lunettes rondes écaille', 'pglass', [0.14, 0.05, 0.14], 0x6d4c41, { c2: 0xcfd8dc, p: { look: 'lunettes rondes' } }],
  ['glasses_cateye', 'Lunettes œil de chat', 'pglass', [0.14, 0.05, 0.14], 0xc2185b, { c2: 0xcfd8dc, p: { look: 'lunettes œil de chat' } }],
  ['glasses_square', 'Lunettes carrées noires', 'pglass', [0.14, 0.05, 0.14], 0x212121, { c2: 0xcfd8dc, p: { look: 'lunettes carrées' } }],
  ['glasses_kids', 'Lunettes pour enfant', 'pglass', [0.12, 0.045, 0.12], 0x29b6f6, { c2: 0xe1f5fe, p: { look: 'lunettes d\'enfant' } }],
  ['reading_glasses', 'Lunettes loupe +2', 'pglass', [0.14, 0.045, 0.14], 0x37474f, { c2: 0xe3f2fd, p: { look: 'lunettes loupe' }, desc: 'Pour lire les petits caractères. Comme ceux en bas du tableau d\'acuité.' }],
  ['sunglasses_aviator', 'Lunettes aviateur', 'pglass', [0.15, 0.05, 0.14], 0xd4af37, { use: 'glasses', c2: 0x3e2723, p: { mode: 'sun' }, desc: 'Des lunettes d\'aviateur. La nuit ? Sérieusement ?' }],
  ['sunglasses_sport', 'Lunettes de soleil sport', 'pglass', [0.15, 0.05, 0.14], 0x212121, { use: 'glasses', c2: 0xff6f00, p: { mode: 'sun' } }],
  ['glasses_case', 'Étui à lunettes', 'pbox', [0.16, 0.04, 0.06], 0x37474f, { use: 'container', lk: 'plain', b: 'Clairvoyance', p: { contains: ['glasses_square'] }, desc: 'Un étui rigide. Il y a une paire dedans.' }],
  ['lens_cloth', 'Chiffon microfibre', 'pcard', [0.15, 0.15, 0.003], 0x90caf9, { mat: 'soft', use: 'generic', lk: 'fabric', pat: 'check', desc: 'Pour nettoyer les verres. Et les objectifs des caméras.' }],
  ['opera_glasses', 'Jumelles de théâtre', 'binoculars', [0.11, 0.05, 0.08], 0xd4af37, { mat: 'metal', use: 'zoom', p: { zoom: 2.5 }, desc: 'Maintenez clic gauche pour zoomer. Élégant, et pratique depuis la mezzanine.' }],
]);

// ───────────────────────── PARFUMERIE ─────────────────────────
G('parfums', { mat: 'glass', use: 'spray', p: { sound: 'perfume_spray', scent: true, breakable: true }, desc: 'Un parfum. Pschitt (clic gauche) : le chat déteste, les autres choses… suivent l\'odeur.' }, [
  ['perf_rose', 'Parfum « Rose de Minuit »', 'pperf', [0.07, 0.12, 0.04], 0xf8bbd0, { b: 'Maison Valmont', l: 'Rose de Minuit', sub: 'Eau de parfum', c3: 0xd4af37, lc: 0x880e4f }],
  ['perf_amber', 'Parfum « Ambre Noir »', 'pperf', [0.065, 0.13, 0.045], 0x3e2723, { b: 'Maison Valmont', l: 'Ambre Noir', sub: 'Eau de parfum', c3: 0x212121, lc: 0x212121, cap: 'ball' }],
  ['perf_citrus', 'Eau fraîche « Agrumes Vifs »', 'pperf', [0.07, 0.14, 0.04], 0xfff176, { b: 'Riviera', l: 'Agrumes Vifs', sub: 'Eau de toilette', c3: 0xfafafa, lc: 0xfff9c4 }],
  ['perf_vanilla', 'Parfum « Vanille Lune »', 'pperf', [0.075, 0.11, 0.045], 0xffe0b2, { b: 'Lunaire', l: 'Vanille Lune', sub: 'Eau de parfum', c3: 0xffd54f, lc: 0x3e2723, cap: 'ball' }],
  ['perf_helios', 'Parfum « Hélios Homme »', 'pperf', [0.07, 0.14, 0.04], 0x1a237e, { b: 'Hélios', l: 'Hélios Homme', sub: 'Eau de toilette', c3: 0x9e9e9e, lc: 0x0d47a1 }],
  ['perf_orange_blossom', 'Parfum « Fleur d\'oranger »', 'pperf', [0.07, 0.12, 0.045], 0xfafafa, { b: 'Riviera', l: 'Fleur d\'oranger', sub: 'Eau de Cologne', c3: 0xffb74d, lc: 0xfff3e0 }],
  ['perf_mini', 'Miniature de parfum', 'pperf', [0.03, 0.05, 0.02], 0xce93d8, { b: 'Maison Valmont', l: 'Miniature', c3: 0xd4af37, lc: 0x4a148c, desc: 'Une miniature. Quelques pschitts seulement.' }],
  ['perf_box_rose', 'Coffret « Rose de Minuit »', 'pbox', [0.1, 0.16, 0.07], 0x880e4f, { mat: 'cardboard', use: 'container', lk: 'cosmetic', b: 'Maison Valmont', l: 'Rose de Minuit', sub: '50 ml', p: { contains: ['perf_rose'] }, desc: 'Le flacon dans son étui. Ouvrez-le (clic gauche).' }],
  ['perf_box_amber', 'Coffret « Ambre Noir »', 'pbox', [0.1, 0.17, 0.07], 0x212121, { mat: 'cardboard', use: 'container', lk: 'cosmetic', b: 'Maison Valmont', l: 'Ambre Noir', sub: '100 ml', p: { contains: ['perf_amber'] }, desc: 'Le flacon dans son étui. Ouvrez-le (clic gauche).' }],
]);
G('cosmetiques', { mat: 'plastic', use: 'generic', desc: 'Un produit de beauté.' }, [
  ['lipstick_red', 'Rouge à lèvres carmin', 'stick', [0.02, 0.02, 0.08], 0xb71c1c, { use: 'lipstick', desc: 'Écrivez sur un miroir (clic gauche devant un miroir).' }],
  ['lipstick_pink', 'Rouge à lèvres rose', 'stick', [0.02, 0.02, 0.08], 0xec407a, { use: 'lipstick', desc: 'Écrivez sur un miroir (clic gauche devant un miroir).' }],
  ['lipstick_nude', 'Rouge à lèvres nude', 'stick', [0.02, 0.02, 0.08], 0xbc8f6f, { use: 'lipstick', desc: 'Écrivez sur un miroir (clic gauche devant un miroir).' }],
  ['mascara', 'Mascara volume', 'stick', [0.018, 0.018, 0.13], 0x212121, { desc: 'Cils de biche garantis. Pour faire peur, c\'est raté.' }],
  ['eyeliner', 'Crayon khôl', 'stick', [0.01, 0.01, 0.15], 0x212121, {}],
  ['foundation', 'Fond de teint', 'pbot', [0.04, 0.12, 0.04], 0xe0b089, { sil: 'pump', mat: 'glass', b: 'Lumière Pure', l: 'Fond de teint', pi: 'drop', c2: 0x212121, p: { breakable: true } }],
  ['powder_compact', 'Poudrier', 'cyl', [0.075, 0.015, 0.075], 0xd4af37, { use: 'mirror', mat: 'metal', desc: 'Un poudrier avec miroir. Maintenez clic gauche : voyez ce qu\'il y a derrière vous.' }],
  ['eyeshadow', 'Palette de fards', 'pbox', [0.14, 0.012, 0.09], 0x212121, { lk: 'cosmetic', b: 'Lumière Pure', l: 'Palette nuit', top: true }],
  ['nail_red', 'Vernis rouge cerise', 'bottle', [0.03, 0.06, 0.03], 0xc62828, { mat: 'glass', sil: 'polish', b: 'Ongle d\'Or', l: 'Cerise', pi: 'heart', c2: 0x212121 }],
  ['nail_black', 'Vernis noir minuit', 'bottle', [0.03, 0.06, 0.03], 0x111111, { mat: 'glass', sil: 'polish', b: 'Ongle d\'Or', l: 'Minuit', pi: 'moon', c2: 0x212121 }],
  ['nail_gold', 'Vernis doré pailleté', 'bottle', [0.03, 0.06, 0.03], 0xd4af37, { mat: 'glass', sil: 'polish', b: 'Ongle d\'Or', l: 'Paillettes', pi: 'sparkle', c2: 0x212121 }],
  ['day_cream', 'Crème de jour', 'pjar', [0.06, 0.05, 0.06], 0xfafafa, { mat: 'glass', b: 'Lumière Pure', l: 'Crème de jour', pi: 'sun', c2: 0xd4af37, p: { breakable: true } }],
  ['serum', 'Sérum éclat', 'pbot', [0.035, 0.1, 0.035], 0xffcc80, { sil: 'vial', mat: 'glass', b: 'Lumière Pure', l: 'Sérum', pi: 'drop', c2: 0xd4af37, p: { breakable: true } }],
  ['body_lotion', 'Lait corps amande', 'pbot', [0.07, 0.2, 0.05], 0xfff3e0, { sil: 'lotion', use: 'spray', b: 'Douceline', l: 'Lait corps', pi: 'flower', c2: 0x8d6e63, p: { sound: 'spray' } }],
  ['bath_salts', 'Sels de bain', 'pjar', [0.08, 0.12, 0.08], 0xb39ddb, { mat: 'glass', b: 'Riviera', l: 'Sels de bain', pi: 'bubbles', c2: 0xfafafa, p: { breakable: true } }],
  ['bath_bomb', 'Boule de bain', 'sphere', [0.07, 0.07, 0.07], 0x80deea, { mat: 'soft', desc: 'Une boule de bain effervescente. Sent la menthe et l\'eucalyptus.' }],
  ['makeup_brush', 'Pinceau de maquillage', 'ptool', [0.03, 0.02, 0.18], 0x212121, { tl: 'brush' }],
  ['gift_set_beauty', 'Coffret beauté', 'pbox', [0.28, 0.08, 0.2], 0xf8bbd0, { mat: 'cardboard', use: 'container', lk: 'cosmetic', b: 'Riviera', l: 'Coffret beauté', top: true, p: { contains: ['soap', 'perf_mini', 'lipstick_pink'] }, desc: 'Un coffret cadeau. Savon, miniature de parfum et rouge à lèvres.' }],
]);

// ───────────────────────── MODE ─────────────────────────
const WEAR_B = (look, color) => ({ slot: 'body', look, ...(color != null ? { color } : {}) });
G('vetements', { mat: 'soft', use: 'wear', desc: 'Un vêtement. Enfilez-le (clic gauche) par-dessus l\'uniforme.' }, [
  ['tshirt_white', 'T-shirt blanc', 'pfold', [0.3, 0.12, 0.25], 0xfafafa, { pn: 5, p: WEAR_B('t-shirt blanc', 0xfafafa) }],
  ['tshirt_helios', 'T-shirt « Hélios »', 'phang', [0.48, 0.66, 0.06], 0x212121, { gs: 'tee', b: 'HÉLIOS', c2: 0xffb300, p: WEAR_B('t-shirt Hélios', 0x212121), desc: 'Le t-shirt souvenir du centre. « J\'ai survécu à une nuit à Hélios. »' }],
  ['mariniere', 'Marinière', 'phang', [0.48, 0.66, 0.06], 0xfafafa, { gs: 'tee', pat: 'stripes', c2: 0x0d47a1, p: WEAR_B('marinière', 0xfafafa) }],
  ['polo_navy', 'Polo marine', 'pfold', [0.3, 0.12, 0.25], 0x1a237e, { pn: 4, p: WEAR_B('polo marine', 0x1a237e) }],
  ['shirt_check', 'Chemise à carreaux', 'phang', [0.48, 0.74, 0.06], 0xc62828, { gs: 'shirt', pat: 'check', c2: 0x212121, p: WEAR_B('chemise à carreaux', 0xc62828) }],
  ['shirt_blue', 'Chemise bleu ciel', 'phang', [0.48, 0.74, 0.06], 0x90caf9, { gs: 'shirt', p: WEAR_B('chemise bleu ciel', 0x90caf9) }],
  ['jeans', 'Jean brut', 'pfold', [0.3, 0.1, 0.25], 0x1a3a6a, { pn: 3, pat: 'denim', p: WEAR_B('jean brut'), desc: 'Un jean brut. Il ne change que le bas : votre veste d\'uniforme reste visible.' }],
  ['chinos', 'Pantalon chino', 'phang', [0.4, 0.95, 0.05], 0xc2a878, { gs: 'pants', p: WEAR_B('pantalon chino'), desc: 'Un chino beige. Passe-partout.' }],
  ['skirt_pleated', 'Jupe plissée', 'phang', [0.42, 0.6, 0.05], 0x4a148c, { gs: 'dress', pat: 'vstripes', p: WEAR_B('jupe plissée') }],
  ['dress_flower', 'Robe à fleurs', 'phang', [0.46, 1.0, 0.06], 0xfff176, { gs: 'dress', pat: 'floral', c2: 0xe91e63, p: WEAR_B('robe à fleurs', 0xfff176) }],
  ['dress_black', 'Petite robe noire', 'phang', [0.44, 0.95, 0.05], 0x111111, { gs: 'dress', p: WEAR_B('petite robe noire', 0x111111) }],
  ['blazer', 'Blazer', 'phang', [0.52, 0.78, 0.08], 0x37474f, { gs: 'jacket', p: WEAR_B('blazer', 0x37474f) }],
  ['coat_wool', 'Manteau en laine', 'phang', [0.55, 1.0, 0.09], 0x5d4037, { gs: 'jacket', p: { ...WEAR_B('manteau en laine', 0x5d4037), warm: true }, desc: 'Un manteau chaud. Le centre se refroidit parfois brutalement.' }],
  ['down_jacket', 'Doudoune', 'phang', [0.55, 0.75, 0.12], 0xd32f2f, { gs: 'jacket', pat: 'stripes', c2: 0xb71c1c, p: { ...WEAR_B('doudoune', 0xd32f2f), warm: true } }],
  ['cardigan', 'Gilet en maille', 'pfold', [0.3, 0.12, 0.25], 0x8d6e63, { pn: 4, p: WEAR_B('gilet en maille', 0x8d6e63) }],
  ['sweater_cable', 'Pull torsadé', 'pfold', [0.32, 0.14, 0.26], 0xeeeeee, { pn: 4, pat: 'vstripes', p: { ...WEAR_B('pull torsadé', 0xeeeeee), warm: true } }],
  ['hoodie_grey', 'Sweat gris chiné', 'pfold', [0.32, 0.14, 0.26], 0x9e9e9e, { pn: 4, p: WEAR_B('sweat gris', 0x9e9e9e) }],
  ['scarf_silk', 'Foulard en soie', 'pfold', [0.22, 0.03, 0.22], 0xe91e63, { pn: 1, pat: 'floral', c2: 0xffd600, p: { slot: 'neck', look: 'foulard en soie' } }],
  ['tie_red', 'Cravate rouge', 'pbox', [0.08, 0.02, 0.2], 0xb71c1c, { lk: 'fabric', pat: 'vstripes', top: true, p: { slot: 'neck', look: 'cravate' }, desc: 'Une cravate. Pour un gardien de nuit en représentation.' }],
  ['gloves_leather', 'Gants en cuir', 'box', [0.12, 0.03, 0.2], 0x3e2723, { p: { slot: 'hands', look: 'gants en cuir', quiet: true }, desc: 'Des gants fins : pas d\'empreintes sur les caisses.' }],
  ['beret', 'Béret basque', 'hat', [0.25, 0.06, 0.25], 0x212121, { p: { slot: 'head', look: 'béret' } }],
  ['hat_straw', 'Chapeau de paille', 'hat', [0.36, 0.1, 0.36], 0xe6c47a, { p: { slot: 'head', look: 'chapeau de paille' } }],
  ['socks_pack', 'Chaussettes ×3', 'pbox', [0.12, 0.2, 0.03], 0x37474f, { mat: 'cardboard', use: 'generic', lk: 'box', b: 'Pas de Deux', l: 'Chaussettes ×3', pi: 'shoe', desc: 'Trois paires de chaussettes. Les vôtres sont trempées depuis la ronde du parking.' }],
  ['belt_leather', 'Ceinture en cuir', 'rope', [0.16, 0.04, 0.16], 0x4e342e, { use: 'generic', desc: 'Une ceinture en cuir avec boucle dorée.' }],
  ['wallet', 'Portefeuille', 'box', [0.11, 0.02, 0.09], 0x3e2723, { use: 'container', p: { contains: ['coin'] }, desc: 'Un portefeuille neuf. Une pièce porte-bonheur glissée dedans.' }],
  ['backpack', 'Sac à dos', 'pbox', [0.3, 0.42, 0.15], 0x1565c0, { use: 'container', lk: 'plain', b: 'Évasion', p: { contains: [] }, desc: 'Un sac à dos vide. Hélas, l\'inventaire ne s\'agrandit pas.' }],
  ['tote_bag', 'Tote bag « Hélios »', 'pbox', [0.36, 0.4, 0.02], 0xf5f0e6, { lk: 'card', l: 'HÉLIOS', b: '', pi: 'sun', use: 'generic', desc: 'Un sac en toile au logo du centre.' }],
]);
// ───────────────────────── CHAUSSURES ─────────────────────────
G('chaussures', { mat: 'soft', use: 'wear', p: { slot: 'feet' }, desc: 'Une paire de chaussures. Enfilez-les : rien de spécial sur le bruit de vos pas.' }, [
  ['shoes_derby', 'Derbies en cuir', 'ppair', [0.2, 0.1, 0.29], 0x3e2723, { st: 'derby', c2: 0x212121 }],
  ['shoes_running', 'Chaussures de course', 'ppair', [0.22, 0.11, 0.3], 0x1e88e5, { st: 'sneaker', c3: 0xff6f00 }],
  ['shoes_canvas', 'Baskets en toile', 'ppair', [0.2, 0.09, 0.28], 0xd32f2f, { st: 'sneaker', c3: 0xffffff }],
  ['shoes_sandals', 'Sandales', 'ppair', [0.2, 0.05, 0.27], 0x8d6e63, { st: 'heel', c2: 0x5d4037 }],
  ['shoes_chelsea', 'Bottines Chelsea', 'ppair', [0.2, 0.18, 0.29], 0x4e342e, { st: 'boot', c2: 0x212121 }],
  ['shoes_espadrilles', 'Espadrilles', 'ppair', [0.19, 0.07, 0.27], 0x0d47a1, { st: 'sneaker', c2: 0xd7ccc8 }],
  ['shoes_ballerinas', 'Ballerines', 'ppair', [0.17, 0.06, 0.25], 0x212121, { st: 'heel', c2: 0x111111 }],
  ['shoes_kids_light', 'Baskets lumineuses (enfant)', 'ppair', [0.15, 0.07, 0.2], 0xe040fb, { st: 'sneaker', c3: 0x00e5ff, desc: 'Les semelles clignotent à chaque pas. Discrétion : nulle.' }],
  ['shoes_rain_boots', 'Bottes de pluie', 'ppair', [0.2, 0.32, 0.28], 0xffd600, { st: 'boot', c2: 0x212121, mat: 'plastic' }],
  ['shoes_moccasins', 'Mocassins', 'ppair', [0.19, 0.08, 0.28], 0x6d4c41, { st: 'derby', c2: 0x3e2723 }],
]);
G('chaussures_acc', { mat: 'cardboard', use: 'container', desc: 'Une boîte à chaussures. Ouvrez-la pour sortir la paire.' }, [
  ['shoebox_running', 'Boîte « Chaussures de course »', 'pshoebox', [0.2, 0.12, 0.33], 0x1e88e5, { b: 'STRIDE', sub: '43', c2: 0x0d47a1, p: { contains: ['shoes_running'] } }],
  ['shoebox_derby', 'Boîte « Derbies »', 'pshoebox', [0.2, 0.12, 0.33], 0x212121, { b: 'Bottier Martin', serif: true, sub: '42', c2: 0x111111, p: { contains: ['shoes_derby'] } }],
  ['shoebox_boots', 'Boîte « Bottines »', 'pshoebox', [0.22, 0.14, 0.34], 0x8d6e63, { b: 'Bottier Martin', serif: true, sub: '39', c2: 0x5d4037, p: { contains: ['shoes_chelsea'] } }],
  ['shoebox_canvas', 'Boîte « Baskets en toile »', 'pshoebox', [0.19, 0.11, 0.31], 0xfafafa, { b: 'CONVERSA', sub: '40', c2: 0xd32f2f, p: { contains: ['shoes_canvas'] } }],
  ['shoebox_kids', 'Boîte « Baskets enfant »', 'pshoebox', [0.16, 0.1, 0.24], 0xe040fb, { b: 'Petit Pas', sub: '28', c2: 0x7b1fa2, p: { contains: ['shoes_kids_light'] } }],
  ['shoe_polish', 'Cirage noir', 'pcan', [0.07, 0.03, 0.07], 0x212121, { mat: 'metal', use: 'generic', b: 'Brillant', l: 'Cirage', pi: 'shoe', desc: 'Une boîte de cirage. Pour des chaussures impeccables à l\'inspection.' }],
  ['insoles', 'Semelles confort', 'pbox', [0.1, 0.25, 0.03], 0x00897b, { use: 'generic', lk: 'box', b: 'Pas de Deux', l: 'Semelles gel', pi: 'shoe', desc: 'Des semelles en gel. Vos pieds vous remercieront après douze kilomètres de ronde.' }],
  ['shoelaces', 'Lacets', 'pblist', [0.07, 0.16, 0.01], 0xfafafa, { use: 'generic', mat: 'plastic', b: 'Pas de Deux', l: 'Lacets 90 cm', pi: 'shoe' }],
  ['shoe_horn', 'Chausse-pied', 'stick', [0.04, 0.01, 0.25], 0x9e9e9e, { use: 'generic', mat: 'metal', desc: 'Un chausse-pied en métal.' }],
]);

// ───────────────────────── SPORT ─────────────────────────
G('sport', { mat: 'soft', use: 'ball', p: { bounce: 0.7 }, desc: 'Un ballon. Lancez-le (clic gauche) : il rebondit, et fait du bruit.' }, [
  ['volleyball', 'Ballon de volley', 'ball', [0.21, 0.21, 0.21], 0xfafafa, { p: { bounce: 0.72 } }],
  ['rugby_ball', 'Ballon de rugby', 'sphere', [0.18, 0.18, 0.28], 0xd7ccc8, { p: { bounce: 0.55 }, desc: 'Le ballon ovale. Ses rebonds sont imprévisibles.' }],
  ['handball', 'Ballon de handball', 'ball', [0.18, 0.18, 0.18], 0x1e88e5, { p: { bounce: 0.68 } }],
  ['frisbee', 'Frisbee', 'cyl', [0.25, 0.025, 0.25], 0xff6f00, { mat: 'plastic', p: { bounce: 0.4, light: true }, desc: 'Lancez-le (clic gauche) : il plane longtemps dans les allées.' }],
  ['petanque_ball', 'Boule de pétanque', 'sphere', [0.074, 0.074, 0.074], 0x9e9e9e, { mat: 'metal', p: { bounce: 0.1 }, mass: 0.7, desc: 'Une boule d\'acier. Lancée, elle ne rebondit pas : elle cogne.' }],
  ['tennis_balls_tube', 'Tube de 4 balles de tennis', 'pcan', [0.075, 0.26, 0.075], 0xc6ff00, { mat: 'plastic', use: 'container', b: 'Ace', l: 'Balles ×4', pi: 'ball', pc: 0xc6ff00, lc: 0x212121, lid: 0xffffff, p: { contains: ['tennis_ball', 'tennis_ball', 'tennis_ball', 'tennis_ball'] }, desc: 'Quatre balles de tennis sous pression. Ouvrez le tube.' }],
  ['shuttlecocks', 'Volants de badminton', 'pcan', [0.07, 0.22, 0.07], 0xfafafa, { mat: 'plastic', use: 'generic', b: 'Ace', l: 'Volants ×6', pi: 'star', lid: 0x1e88e5 }],
  ['badminton_racket', 'Raquette de badminton', 'racket', [0.22, 0.66, 0.03], 0xe53935, { mat: 'plastic', use: 'melee', p: { dmg: 0.5, hitsBalls: true } }],
  ['pingpong_set', 'Set de ping-pong', 'pbox', [0.18, 0.28, 0.05], 0xd32f2f, { mat: 'cardboard', use: 'generic', lk: 'blister', b: 'Ace', l: '2 raquettes + 3 balles', pi: 'ball', desc: 'Deux raquettes et trois balles. Il ne manque que la table.' }],
  ['kettlebell', 'Kettlebell 8 kg', 'sphere', [0.16, 0.18, 0.16], 0x212121, { mat: 'metal', use: 'dumbbell', mass: 8, desc: 'Lourd. Clic gauche pour une série (réduit le stress, fatigue un peu).' }],
  ['jump_rope_pro', 'Corde à sauter lestée', 'rope', [0.16, 0.04, 0.16], 0x212121, { use: 'generic', desc: 'Une corde à sauter de boxeur.' }],
  ['water_bottle_sport', 'Gourde de sport', 'pbot', [0.075, 0.24, 0.075], 0x00e5ff, { sil: 'juice', mat: 'plastic', use: 'drink', b: 'Hélios Sport', l: 'Gourde', pi: 'drop', c2: 0x212121, lc: 0x212121, p: { food: 3, effect: 'calm' }, desc: 'Une gourde pleine d\'eau fraîche.' }],
  ['isotonic', 'Boisson isotonique', 'pbot', [0.075, 0.23, 0.075], 0x29b6f6, { sil: 'soda', mat: 'plastic', use: 'drink', b: 'Hydra+', l: 'Isotonique', pi: 'bolt', c2: 0xfafafa, lc: 0x0d47a1, p: { food: 4, effect: 'energy' } }],
  ['protein_bar', 'Barre protéinée', 'pbox', [0.12, 0.02, 0.045], 0x37474f, { mat: 'paper', use: 'eat', b: 'Force+', l: 'Protéines', pi: 'bolt', top: true, p: { sound: 'eat_crunch', food: 14, effect: 'energy' } }],
  ['energy_gel', 'Gel énergétique', 'ptube', [0.04, 0.11, 0.015], 0xff6f00, { use: 'eat', b: 'Hydra+', l: 'Gel coup de fouet', pi: 'bolt', c2: 0x212121, p: { sound: 'eat_soft', food: 5, effect: 'energy' } }],
  ['swim_goggles', 'Lunettes de natation', 'goggles', [0.16, 0.05, 0.06], 0x29b6f6, { mat: 'plastic', use: 'wear', p: { slot: 'face', look: 'lunettes de natation' }, desc: 'Pas de piscine ici. Mais de l\'eau dans la fontaine.' }],
  ['swim_cap', 'Bonnet de bain', 'hat', [0.2, 0.1, 0.22], 0x1565c0, { mat: 'plastic', use: 'wear', p: { slot: 'head', look: 'bonnet de bain' } }],
  ['jersey_foot', 'Maillot de foot', 'phang', [0.48, 0.7, 0.05], 0x0d47a1, { gs: 'tee', b: '10', c2: 0xffffff, use: 'wear', p: { slot: 'body', look: 'maillot de foot', color: 0x0d47a1 } }],
  ['shorts_sport', 'Short de sport', 'pfold', [0.28, 0.08, 0.22], 0x212121, { use: 'wear', pn: 3, p: { slot: 'body', look: 'short de sport' } }],
  ['headband', 'Bandeau éponge', 'ring_big', [0.18, 0.18, 0.05], 0xd32f2f, { use: 'wear', p: { slot: 'head', look: 'bandeau éponge' } }],
  ['shin_guards', 'Protège-tibias', 'pbox', [0.15, 0.25, 0.06], 0x212121, { mat: 'plastic', use: 'generic', lk: 'blister', b: 'Hélios Sport', l: 'Protège-tibias', pi: 'ball' }],
  ['compass', 'Boussole', 'cyl', [0.06, 0.015, 0.06], 0xd32f2f, { mat: 'plastic', use: 'generic', desc: 'L\'aiguille tremble. Près du sous-sol, elle tourne en rond.' }],
  ['thermos', 'Bouteille isotherme', 'pbot', [0.075, 0.27, 0.075], 0x37474f, { sil: 'juice', mat: 'metal', use: 'drink', b: 'Évasion', l: 'Isotherme', pi: 'cup', c2: 0x212121, lc: 0x546e7a, p: { food: 4, effect: 'calm', hot: true }, desc: 'Encore chaude. Une boisson chaude qui calme.' }],
  ['bike_helmet', 'Casque de vélo', 'hat', [0.24, 0.16, 0.28], 0xff6f00, { mat: 'plastic', use: 'wear', p: { slot: 'head', look: 'casque de vélo', armor: true }, desc: 'Protège la tête. Ça peut servir.' }],
]);

// ───────────────────────── INSTRUMENTS ─────────────────────────
G('musique', { mat: 'wood', use: 'instrument', desc: 'Un instrument de musique. Jouez (clic gauche) ; regardez plus haut ou plus bas pour changer de note.' }, [
  ['ukulele', 'Ukulélé', 'guitar', [0.19, 0.55, 0.06], 0xd7a86e, { use: 'guitar', desc: 'Petit et joyeux. Clic gauche : grattez. R : changez d\'accord.' }],
  ['bass_guitar', 'Basse électrique', 'guitar', [0.34, 1.1, 0.05], 0x1a237e, { use: 'guitar', p: { electric: true }, desc: 'Quatre cordes, un son grave. Clic gauche : grattez. R : changez d\'accord.' }],
  ['ocarina', 'Ocarina', 'sphere', [0.1, 0.05, 0.07], 0x8d6e63, { mat: 'ceramic', p: { instr: 'organ', scale: [72, 74, 76, 77, 79, 81, 83, 84] } }],
  ['kazoo', 'Kazoo', 'stick', [0.02, 0.02, 0.12], 0xffd600, { mat: 'plastic', use: 'toy_horn', desc: 'Un kazoo. Le son le plus ridicule de la création.' }],
  ['castanets', 'Castagnettes', 'cyl', [0.06, 0.02, 0.06], 0x6d4c41, { use: 'squeak', p: { sound: 'rattle', pitch: 1.6 } }],
  ['drumsticks', 'Baguettes de batterie', 'stick', [0.015, 0.015, 0.4], 0xd7a86e, { use: 'toy_drum', desc: 'Tapez (clic gauche) : un roulement de caisse claire.' }],
  ['bongos', 'Bongos', 'drum', [0.24, 0.18, 0.24], 0x8d4a1d, { use: 'toy_drum' }],
  ['cymbal', 'Cymbale', 'cyl', [0.36, 0.01, 0.36], 0xd4af37, { mat: 'metal', p: { instr: 'bell', scale: [84, 86, 88, 91] } }],
  ['guitar_strings', 'Jeu de cordes de guitare', 'pbox', [0.12, 0.12, 0.01], 0x212121, { mat: 'paper', use: 'generic', lk: 'box', b: 'Corda', l: 'Cordes acier', pi: 'note', pc: 0xd4af37, desc: 'Six cordes neuves. Le mi aigu casse toujours en premier.' }],
  ['guitar_picks', 'Médiators ×6', 'pblist', [0.06, 0.1, 0.01], 0xe53935, { mat: 'plastic', use: 'generic', b: 'Corda', l: 'Médiators', pi: 'note' }],
  ['tuner', 'Accordeur', 'box', [0.06, 0.02, 0.09], 0x212121, { mat: 'plastic', use: 'generic', desc: 'Il capte un la 440 Hz… alors que tout est silencieux.' }],
  ['songbook', 'Recueil « Chansons de veillée »', 'pbook', [0.22, 0.3, 0.012], 0x5d4037, { mat: 'paper', use: 'read', b: 'Do Ré Mi', l: 'Chansons de veillée', pi: 'note', pc: 0xffd600, p: { text: 'Paroles et accords. « Au clair de la lune », page 1. La page a été recopiée à la main, en marge, des centaines de fois.' } }],
]);

// ───────────────────────── DÉGUISEMENTS ─────────────────────────
G('deguisements', { mat: 'plastic', use: 'wear', desc: 'Un accessoire de déguisement. Effet garanti dans les couloirs sombres.' }, [
  ['mask_witch', 'Masque de sorcière', 'mask', [0.2, 0.26, 0.11], 0x7cb342, { p: { slot: 'face', look: 'masque de sorcière', scary: true } }],
  ['mask_vampire', 'Masque de vampire', 'mask', [0.2, 0.25, 0.1], 0xeceff1, { p: { slot: 'face', look: 'masque de vampire', scary: true } }],
  ['mask_zombie', 'Masque de zombie', 'mask', [0.2, 0.25, 0.1], 0x689f38, { p: { slot: 'face', look: 'masque de zombie', scary: true } }],
  ['mask_venice', 'Loup vénitien', 'mask', [0.18, 0.08, 0.06], 0xd4af37, { p: { slot: 'face', look: 'loup vénitien' } }],
  ['hat_pirate', 'Tricorne de pirate', 'hat', [0.32, 0.12, 0.3], 0x212121, { mat: 'soft', p: { slot: 'head', look: 'tricorne' } }],
  ['crown_gold', 'Couronne dorée', 'hat', [0.2, 0.1, 0.2], 0xffd700, { p: { slot: 'head', look: 'couronne' } }],
  ['top_hat', 'Haut-de-forme', 'hat', [0.3, 0.2, 0.3], 0x111111, { mat: 'soft', p: { slot: 'head', look: 'haut-de-forme' } }],
  ['cowboy_hat', 'Chapeau de cow-boy', 'hat', [0.38, 0.13, 0.36], 0x8d6e63, { mat: 'soft', p: { slot: 'head', look: 'chapeau de cow-boy' } }],
  ['clown_nose', 'Nez rouge', 'sphere', [0.04, 0.04, 0.04], 0xd50000, { mat: 'soft', p: { slot: 'face', look: 'nez rouge' } }],
  ['vampire_teeth', 'Dentier de vampire', 'box', [0.05, 0.02, 0.03], 0xfafafa, { p: { slot: 'face', look: 'dents de vampire', scary: true } }],
  ['eyepatch', 'Bandeau de pirate', 'box', [0.06, 0.04, 0.01], 0x111111, { mat: 'soft', p: { slot: 'face', look: 'bandeau de pirate' } }],
  ['wig_blonde', 'Perruque blonde', 'sphere', [0.25, 0.22, 0.27], 0xfdd835, { mat: 'soft', p: { slot: 'head', look: 'perruque blonde' } }],
  ['fake_blood', 'Faux sang', 'pbot', [0.05, 0.14, 0.05], 0xb71c1c, { sil: 'syrup', use: 'spray', b: 'Mille Masques', l: 'Faux sang', pi: 'drop', pc: 0xb71c1c, c2: 0x212121, p: { sound: 'spray', splat: true }, desc: 'Clic gauche : une tache de faux sang. Très convaincant sous les néons.' }],
  ['face_paint', 'Maquillage de fête', 'pbox', [0.14, 0.015, 0.1], 0xfafafa, { use: 'generic', lk: 'box', b: 'Mille Masques', l: 'Maquillage', pi: 'mask', top: true, desc: 'Six couleurs de maquillage pour le visage.' }],
  ['confetti_bag', 'Sachet de confettis', 'ppouch', [0.12, 0.17, 0.03], 0xff4081, { use: 'popper', b: 'Fête Facile', l: 'Confettis', pi: 'star', desc: 'Clic gauche : une pluie de confettis. Festif, même à 3 h du matin.' }],
  ['pirate_hook', 'Crochet de pirate', 'stick', [0.06, 0.06, 0.2], 0xb0bec5, { use: 'melee', p: { dmg: 0.5 }, desc: 'En plastique argenté. Pas très effrayant.' }],
]);

// ───────────────────────── COIFFEUR ─────────────────────────
G('coiffure', { mat: 'plastic', use: 'spray', p: { sound: 'spray' }, desc: 'Un produit de coiffure professionnel.' }, [
  ['shampoo_pro', 'Shampoing professionnel 1 L', 'pbot', [0.09, 0.27, 0.09], 0x212121, { sil: 'pump', b: 'Tif\'Hair Pro', l: 'Shampoing', pi: 'drop', c2: 0xd4af37, lc: 0x212121 }],
  ['hair_mask', 'Masque capillaire', 'pjar', [0.08, 0.07, 0.08], 0xffcc80, { use: 'generic', b: 'Tif\'Hair Pro', l: 'Masque', pi: 'flower', c2: 0x212121 }],
  ['hair_wax', 'Cire coiffante', 'pjar', [0.07, 0.035, 0.07], 0x212121, { use: 'generic', b: 'Tif\'Hair Pro', l: 'Cire mate', pi: 'sparkle', c2: 0x9e9e9e }],
  ['hair_dye', 'Coloration châtain', 'pbox', [0.12, 0.17, 0.06], 0x6d4c41, { mat: 'cardboard', use: 'generic', b: 'Couleur Intense', l: 'Châtain', pi: 'drop', pc: 0x6d4c41 }],
  ['hairbrush', 'Brosse à cheveux', 'ptool', [0.07, 0.04, 0.23], 0x212121, { tl: 'brush', use: 'generic' }],
  ['hair_clips', 'Pinces à cheveux', 'pblist', [0.08, 0.14, 0.02], 0xec407a, { use: 'generic', b: 'Tif\'Hair', l: 'Pinces ×12', pi: 'scissors' }],
  ['hair_ties', 'Élastiques', 'pblist', [0.08, 0.14, 0.02], 0x212121, { use: 'generic', b: 'Tif\'Hair', l: 'Élastiques ×20', pi: 'star' }],
  ['curling_iron', 'Fer à boucler', 'stick', [0.035, 0.035, 0.3], 0xec407a, { use: 'generic', desc: 'Un fer à boucler. Débranché depuis des heures. Pourtant, il est tiède.' }],
  ['salon_towel', 'Serviettes de salon', 'pfold', [0.3, 0.15, 0.22], 0x212121, { mat: 'soft', use: 'generic', pn: 5 }],
  ['water_spray', 'Vaporisateur d\'eau', 'pbot', [0.07, 0.2, 0.07], 0xfafafa, { sil: 'pump', b: 'Tif\'Hair', l: 'Eau', pi: 'drop', c2: 0x212121 }],
]);

// ───────────────────────── FLASH PHOTO ─────────────────────────
G('photo', { mat: 'plastic', use: 'generic', desc: 'Pour la photographie.' }, [
  ['camera_compact', 'Appareil photo compact', 'camera', [0.11, 0.065, 0.05], 0x37474f, { use: 'polaroid', p: { shots: 8, flash: true }, desc: 'Un compact avec flash : il prend de vraies photos (clic gauche). Le flash aveugle brièvement.' }],
  ['film_pack', 'Pellicules couleur ×3', 'pbox', [0.12, 0.05, 0.04], 0xffd600, { mat: 'cardboard', lk: 'box', b: 'Lumicolor', l: '200 ISO ×3', pi: 'film' }],
  ['photo_paper', 'Papier photo 10×15', 'pbox', [0.17, 0.03, 0.12], 0x1565c0, { mat: 'cardboard', lk: 'box', b: 'Lumicolor', l: 'Papier brillant', pi: 'camera', top: true }],
  ['frame_wood', 'Cadre en bois 13×18', 'pcard', [0.16, 0.21, 0.015], 0x8d6e63, { mat: 'wood', lk: 'card', l: 'Souvenirs', pi: 'house', use: 'read', p: { text: 'Un cadre vendu avec sa photo d\'exemple : une famille souriante devant la fontaine du centre. Le petit garçon a les yeux fermés.' } }],
  ['frame_gold', 'Cadre doré', 'pcard', [0.2, 0.25, 0.02], 0xd4af37, { mat: 'wood', lk: 'card', l: 'Portrait', pi: 'heart', use: 'read', p: { text: 'Photo d\'exemple : un couple en 1987. Elle tient une broche violette.' } }],
  ['album_blank', 'Album photo vierge', 'pbook', [0.3, 0.25, 0.04], 0x3e2723, { mat: 'paper', use: 'read', b: 'Lumicolor', l: 'Mes souvenirs', pi: 'camera', p: { text: 'Des pages vides, avec du papier cristal. Sur la première, une photo est déjà collée : le poste de sécurité, vu de l\'extérieur. Vous êtes dedans.' } }],
  ['tripod', 'Trépied', 'stick', [0.06, 0.06, 0.6], 0x212121, { mat: 'metal', use: 'melee', p: { dmg: 1 }, desc: 'Un trépied pliant. Robuste.' }],
  ['camera_bag', 'Sacoche photo', 'pbox', [0.25, 0.18, 0.14], 0x212121, { mat: 'soft', lk: 'plain', b: 'Lumicolor', use: 'container', p: { contains: ['film_roll'] }, desc: 'Une sacoche matelassée. Il reste une pellicule dedans.' }],
  ['camera_lens', 'Objectif 50 mm', 'cyl', [0.07, 0.06, 0.07], 0x212121, { mat: 'metal', use: 'zoom', p: { zoom: 2 }, desc: 'Regardez à travers (maintenez clic gauche) : zoom ×2.' }],
  ['flash_unit', 'Flash cobra', 'box', [0.07, 0.12, 0.08], 0x212121, { desc: 'Un flash externe. Sans appareil, il ne fait que clignoter.' }],
]);

// ───────────────────────── DÉCO & LUMIÈRES ─────────────────────────
G('deco', { mat: 'ceramic', use: 'generic', desc: 'Un objet de décoration.' }, [
  ['cushion_velvet', 'Coussin en velours', 'pfold', [0.4, 0.12, 0.4], 0x2e7d32, { mat: 'soft', pn: 1, desc: 'Un coussin moelleux. Parfait pour une sieste… interdite.' }],
  ['cushion_stripes', 'Coussin rayé', 'pfold', [0.4, 0.12, 0.4], 0xfafafa, { mat: 'soft', pn: 1, pat: 'stripes', c2: 0x1565c0 }],
  ['plaid', 'Plaid en laine', 'pfold', [0.35, 0.12, 0.28], 0xb71c1c, { mat: 'soft', pn: 4, pat: 'check', c2: 0x212121, desc: 'Un plaid tout doux. Le centre est si froid la nuit.' }],
  ['vase_glass', 'Vase en verre', 'jar', [0.12, 0.28, 0.12], 0x80cbc4, { mat: 'glass', p: { breakable: true } }],
  ['candle_scented', 'Bougie parfumée', 'pjar', [0.09, 0.1, 0.09], 0xf3e5f5, { mat: 'glass', use: 'candle', b: 'Cire & Mèche', l: 'Figue & cèdre', pi: 'flame', c2: 0x212121, desc: 'À poser et allumer avec un briquet. Lumière chaude, odeur rassurante.' }],
  ['candle_pillar', 'Bougie pilier', 'candle', [0.08, 0.15, 0.08], 0xfff8e1, { mat: 'soft', use: 'candle', desc: 'Une grosse bougie. À poser et allumer avec un briquet.' }],
  ['table_lamp', 'Lampe de table', 'plamp', [0.25, 0.4, 0.25], 0xfff3e0, { use: 'lamp', c2: 0x8d6e63, desc: 'Une vraie lampe (E pour l\'allumer).' }],
  ['globe_lamp', 'Lampe boule', 'plamp', [0.2, 0.25, 0.2], 0xfff8e1, { use: 'lamp', lt: 'globe', mat: 'glass', desc: 'Une boule lumineuse et douce (E pour l\'allumer).' }],
  ['clock_wall_retro', 'Horloge rétro', 'clock', [0.3, 0.3, 0.05], 0xd32f2f, { use: 'clock', mat: 'metal', desc: 'Elle indique l\'heure. Le tic-tac s\'entend dans tout le magasin.' }],
  ['clock_station', 'Horloge de gare', 'clock', [0.4, 0.4, 0.06], 0x212121, { use: 'clock', mat: 'metal' }],
  ['diffuser', 'Diffuseur d\'huiles essentielles', 'pjar', [0.1, 0.14, 0.1], 0xefebe9, { b: 'Zen', l: 'Diffuseur', pi: 'leaf', c2: 0x8d6e63, desc: 'Lavande et eucalyptus. Il diffuse seul, la nuit.' }],
  ['cat_figurine', 'Chat en céramique', 'pplush', [0.1, 0.16, 0.1], 0x212121, { an: 'cat', c2: 0x424242, p: { breakable: true }, desc: 'Un chat noir en céramique. Il ressemble beaucoup au chat errant.' }],
  ['fake_plant', 'Plante artificielle', 'pplant', [0.25, 0.45, 0.25], 0x43a047, { mat: 'plastic', fo: 'bush', desc: 'Une plante en plastique. Jamais besoin d\'arrosage. Elle semble pourtant pousser.' }],
  ['wicker_basket', 'Panier en osier', 'ppan', [0.35, 0.2, 0.25], 0xc8a165, { mat: 'wood', pt: 'bowl', c2: 0xa1887f }],
  ['wood_tray', 'Plateau en bois', 'box', [0.45, 0.03, 0.3], 0x8d6e63, { mat: 'wood' }],
  ['deco_bowl', 'Coupe décorative', 'ppan', [0.28, 0.1, 0.28], 0x00897b, { pt: 'bowl', c2: 0x4db6ac, p: { breakable: true } }],
  ['mug_moon', 'Mug « Lune »', 'pmug', [0.11, 0.1, 0.09], 0x1a237e, { b: '', l: 'BONNE NUIT', pi: 'moon', c2: 0x212121 }],
  ['tea_towel', 'Torchon de cuisine', 'pfold', [0.25, 0.04, 0.2], 0xfafafa, { mat: 'soft', pn: 2, pat: 'check', c2: 0xd32f2f }],
  ['photo_frame_deco', 'Cadre « Famille »', 'pcard', [0.2, 0.25, 0.02], 0xfafafa, { mat: 'wood', lk: 'card', l: 'Famille', pi: 'heart', use: 'read', p: { text: 'Photo d\'exemple : une famille dans un jardin. Au dos, l\'étiquette de prix date de 1987.' } }],
]);

// ───────────────────────── GALAXY ARCADE ─────────────────────────
G('lots', { mat: 'plastic', use: 'squeak', p: { sound: 'squeak' }, desc: 'Un lot gagné aux jeux. Ou presque.' }, [
  ['prize_robot', 'Robot (lot)', 'robot', [0.1, 0.18, 0.08], 0xffd600, { mat: 'metal', use: 'toy_walk', p: { sound: 'toy_robot', speed: 0.2 }, desc: 'Remontez-le et posez-le : il marche tout seul.' }],
  ['prize_ball', 'Balle lumineuse (lot)', 'ball', [0.08, 0.08, 0.08], 0x00e5ff, { use: 'ball', p: { bounce: 0.85 } }],
  ['prize_keychain', 'Porte-clés arcade', 'keys', [0.06, 0.02, 0.06], 0xd500f9, { use: 'generic', desc: 'Un porte-clés en forme de manette.' }],
  ['prize_candy', 'Bonbons (lot)', 'pbag', [0.12, 0.16, 0.04], 0xd500f9, { mat: 'paper', use: 'eat', b: 'Galaxy', l: 'Bonbons cosmiques', pi: 'star', p: { sound: 'eat_crunch', food: 5, effect: 'sugar' } }],
  ['token_bag', 'Sachet de jetons', 'ppouch', [0.1, 0.14, 0.02], 0xb08d57, { use: 'container', b: 'Galaxy Arcade', l: 'Jetons ×5', pi: 'star', p: { contains: ['token', 'token', 'token', 'token', 'token'] }, desc: 'Cinq jetons d\'arcade. Ouvrez le sachet.' }],
]);

// ───────────────────────── RESTAURATION ─────────────────────────
G('pizzeria', { mat: 'soft', use: 'eat', p: { sound: 'eat_soft', food: 20 }, desc: 'De la pizzeria Napoli. Froide, mais toujours délicieuse.' }, [
  ['pizza_margherita', 'Pizza margherita', 'pizza', [0.3, 0.02, 0.3], 0xffc107, { p: { food: 35, effect: 'calm' } }],
  ['pizza_reine', 'Pizza reine', 'pizza', [0.3, 0.02, 0.3], 0xffb300, { p: { food: 38, effect: 'calm' } }],
  ['calzone', 'Calzone', 'pfruit', [0.26, 0.06, 0.15], 0xd4a056, { fl: false, p: { food: 30 } }],
  ['tiramisu', 'Tiramisu', 'pbox', [0.1, 0.06, 0.1], 0xd7ccc8, { mat: 'plastic', lk: 'plain', b: 'Napoli', top: true, p: { food: 14, effect: 'energy' } }],
  ['parmesan_shaker', 'Parmesan râpé', 'pcan', [0.065, 0.13, 0.065], 0xfff176, { mat: 'plastic', b: 'Napoli', l: 'Parmigiano', pi: 'cheese', lid: 0x2e7d32, p: { food: 4, sound: 'eat_crunch', smell: true } }],
  ['chili_oil', 'Huile pimentée', 'pbot', [0.055, 0.2, 0.055], 0xe65100, { sil: 'oil', mat: 'glass', use: 'drink', b: 'Napoli', l: 'Olio piccante', pi: 'pepper', c2: 0x212121, lc: 0xfff8e1, p: { effect: 'spicy', food: 0, breakable: true }, desc: 'De l\'huile au piment. À NE PAS boire au goulot.' }],
]);
G('burger', { mat: 'soft', use: 'eat', p: { sound: 'eat_soft', food: 20 }, desc: 'De chez Big Burger. Gras, salé, réconfortant.' }, [
  ['cheeseburger', 'Cheeseburger', 'burger', [0.1, 0.075, 0.1], 0xb5651d, { p: { food: 28 } }],
  ['double_burger', 'Double burger', 'burger', [0.12, 0.11, 0.12], 0xa0522d, { p: { food: 40 }, desc: 'Deux steaks. Un après-midi de digestion.' }],
  ['chicken_wrap', 'Wrap au poulet', 'baguette', [0.06, 0.06, 0.2], 0xfff3e0, { p: { food: 22 } }],
  ['onion_rings', 'Rondelles d\'oignon', 'fries', [0.09, 0.1, 0.06], 0xffb300, { mat: 'paper', p: { sound: 'eat_crunch', food: 12 } }],
  ['salad_box', 'Salade César', 'pbox', [0.16, 0.07, 0.16], 0x8bc34a, { mat: 'plastic', lk: 'plain', b: 'Big Burger', top: true, p: { sound: 'eat_crunch', food: 14 } }],
  ['sundae_caramel', 'Sundae caramel', 'cup', [0.09, 0.11, 0.09], 0xfff8e1, { mat: 'plastic', p: { food: 14, effect: 'cold' } }],
  ['sauce_sachet', 'Sachet de sauce barbecue', 'pcard', [0.05, 0.07, 0.008], 0x4e342e, { mat: 'paper', lk: 'box', b: 'Big Burger', l: 'BBQ', pi: 'flame', p: { food: 1, sound: 'eat_soft' } }],
]);
G('sushi', { mat: 'plastic', use: 'eat', p: { sound: 'eat_soft', food: 14 }, desc: 'De Sushi Zen. Le poisson est-il encore frais ? Mystère.' }, [
  ['nigiri_salmon', 'Nigiris saumon ×4', 'pbox', [0.14, 0.04, 0.08], 0xff8a65, { lk: 'plain', b: 'Sushi Zen', top: true, p: { food: 16 } }],
  ['california_roll', 'California rolls ×8', 'pbox', [0.18, 0.04, 0.1], 0x1b5e20, { lk: 'plain', b: 'Sushi Zen', top: true, p: { food: 20 } }],
  ['bento', 'Bento du jour', 'pbox', [0.22, 0.06, 0.16], 0x212121, { lk: 'plain', b: 'Sushi Zen', top: true, p: { food: 32, effect: 'calm' } }],
  ['edamame', 'Edamame', 'pbox', [0.12, 0.04, 0.12], 0x7cb342, { lk: 'plain', b: 'Sushi Zen', top: true, p: { food: 8 } }],
  ['miso_soup', 'Soupe miso', 'cup', [0.1, 0.08, 0.1], 0x8d6e63, { mat: 'ceramic', use: 'drink', p: { food: 8, effect: 'calm', hot: true } }],
  ['mochi', 'Mochis ×3', 'pbox', [0.12, 0.05, 0.06], 0xf8bbd0, { lk: 'plain', b: 'Sushi Zen', top: true, p: { food: 10, effect: 'sugar' } }],
]);
G('cinema', { mat: 'paper', use: 'eat', p: { sound: 'eat_crunch', food: 8 }, desc: 'Une gourmandise de cinéma. Ne faites pas de bruit pendant le film.' }, [
  ['nachos', 'Nachos fromage', 'fries', [0.16, 0.08, 0.12], 0xfbc02d, { p: { food: 14, loud: true } }],
  ['popcorn_large', 'Seau de pop-corn géant', 'fries', [0.2, 0.28, 0.2], 0xd32f2f, { p: { food: 14, uses: 8 }, desc: 'Un seau géant. Huit poignées.' }],
  ['soda_cup_large', 'Grand gobelet de soda', 'cup', [0.1, 0.2, 0.1], 0xd50000, { mat: 'paper', use: 'drink', p: { food: 6, effect: 'energy' } }],
  ['candy_box_cinema', 'Boîte de bonbons de cinéma', 'pbox', [0.12, 0.16, 0.03], 0xffd600, { mat: 'cardboard', b: 'Ciné Hélios', l: 'Bonbons', pi: 'candy', p: { effect: 'sugar' } }],
  ['choco_bites', 'Billes chocolatées', 'pbag', [0.13, 0.18, 0.04], 0x4e342e, { b: 'Mireille', l: 'Billes choco', pi: 'choco', p: { effect: 'calm' } }],
  ['eskimo', 'Esquimau vanille', 'lollipop', [0.06, 0.16, 0.025], 0x5d4037, { mat: 'soft', p: { sound: 'eat_soft', food: 8, effect: 'cold' } }],
  ['cinema_program', 'Programme du mois', 'pmag', [0.15, 0.21, 0.004], 0x1a237e, { use: 'read', l: 'CINÉ HÉLIOS', sub: 'NOUVEAU', photo: 'film', p: { text: 'À l\'affiche : « La Nuit des Mannequins » (séance de 23 h, tous les soirs). Aucune autre séance n\'est programmée.' } }],
]);
G('glaces', { mat: 'plastic', use: 'eat', p: { sound: 'eat_soft', food: 10, effect: 'cold' }, desc: 'Une glace. Attention au mal de crâne.' }, [
  ['icecream_vanilla', 'Pot de glace vanille', 'pcan', [0.1, 0.1, 0.1], 0xfff8e1, { mat: 'cardboard', b: 'Banquise', l: 'Vanille', pi: 'icecream', pc: 0xfff59d, lid: 0xfff8e1, p: { food: 14 } }],
  ['icecream_choco', 'Pot de glace chocolat', 'pcan', [0.1, 0.1, 0.1], 0x5d4037, { mat: 'cardboard', b: 'Banquise', l: 'Chocolat', pi: 'icecream', pc: 0x6d4c41, lid: 0x8d6e63, p: { food: 14 } }],
  ['icecream_strawberry', 'Pot de glace fraise', 'pcan', [0.1, 0.1, 0.1], 0xf48fb1, { mat: 'cardboard', b: 'Banquise', l: 'Fraise', pi: 'strawberry', lid: 0xf8bbd0, p: { food: 14 } }],
  ['icecream_pistachio', 'Pot de glace pistache', 'pcan', [0.1, 0.1, 0.1], 0xaed581, { mat: 'cardboard', b: 'Banquise', l: 'Pistache', pi: 'icecream', pc: 0xc5e1a5, lid: 0xc5e1a5, p: { food: 14 } }],
  ['ice_pop', 'Glace à l\'eau', 'lollipop', [0.05, 0.15, 0.02], 0xe53935, { p: { food: 4 } }],
  ['cone_choco', 'Cornet chocolat', 'cone', [0.07, 0.18, 0.07], 0x5d4037, { mat: 'soft' }],
  ['crepe_sugar', 'Crêpe au sucre', 'box', [0.16, 0.02, 0.1], 0xe8b86d, { mat: 'soft', p: { food: 12, effect: 'sugar' } }],
  ['milkshake_vanilla', 'Milkshake vanille', 'cup', [0.08, 0.18, 0.08], 0xfff8e1, { use: 'drink', p: { food: 15 } }],
]);
G('bonbons', { mat: 'paper', use: 'eat', p: { sound: 'eat_crunch', food: 4, effect: 'sugar' }, desc: 'Des bonbons. Sucre = vitesse, pendant un temps.' }, [
  ['candy_jar_bears', 'Bocal d\'oursons', 'jar', [0.15, 0.25, 0.15], 0xffb300, { mat: 'glass', p: { breakable: true, uses: 10, sound: 'eat_soft' } }],
  ['candy_jar_lemon', 'Bocal de bonbons citron', 'jar', [0.15, 0.25, 0.15], 0xfff176, { mat: 'glass', p: { breakable: true, uses: 10, effect: 'sour' } }],
  ['candy_strawberries', 'Fraises tendres', 'pbag', [0.15, 0.2, 0.05], 0xe91e63, { b: 'Sucrette', l: 'Fraises tendres', pi: 'strawberry', p: { sound: 'eat_soft' } }],
  ['candy_crocodiles', 'Crocodiles gélifiés', 'pbag', [0.15, 0.2, 0.05], 0x43a047, { b: 'Sucrette', l: 'Crocodiles', pi: 'dino', p: { sound: 'eat_soft' } }],
  ['candy_cola', 'Bouteilles cola', 'pbag', [0.15, 0.2, 0.05], 0x6d4c41, { b: 'Sucrette', l: 'Bouteilles cola', pi: 'bottle', pc: 0x6d4c41, p: { sound: 'eat_soft' } }],
  ['nougat', 'Nougat de Montélimar', 'pbox', [0.16, 0.025, 0.05], 0xfafafa, { mat: 'cardboard', b: 'Confiserie Arnaud', l: 'Nougat', pi: 'star', c2: 0xd32f2f, top: true, p: { food: 10 } }],
  ['calissons', 'Calissons d\'Aix', 'pbox', [0.14, 0.04, 0.09], 0xfafafa, { mat: 'cardboard', b: 'Confiserie Arnaud', l: 'Calissons', pi: 'flower', c2: 0x1565c0, top: true, p: { food: 8 } }],
  ['berlingots', 'Berlingots', 'pbag', [0.12, 0.16, 0.04], 0x29b6f6, { b: 'Confiserie Arnaud', l: 'Berlingots', pi: 'candy' }],
  ['salted_caramels', 'Caramels au beurre salé', 'pbag', [0.13, 0.18, 0.04], 0xd4893a, { b: 'Petit Breton', l: 'Caramels', pi: 'candy', pc: 0xd4893a, p: { sound: 'eat_soft', effect: 'calm', food: 6 } }],
  ['truffles', 'Truffes au chocolat', 'pbox', [0.12, 0.06, 0.08], 0x3e2723, { mat: 'cardboard', b: 'Mireille', l: 'Truffes', pi: 'choco', c2: 0xd4af37, p: { food: 10, effect: 'calm', sound: 'eat_soft' } }],
  ['pralines', 'Pralines roses', 'pbag', [0.12, 0.16, 0.04], 0xec407a, { b: 'Confiserie Arnaud', l: 'Pralines', pi: 'heart' }],
  ['dragees', 'Dragées', 'pbox', [0.1, 0.05, 0.07], 0xe1f5fe, { mat: 'cardboard', b: 'Confiserie Arnaud', l: 'Dragées', pi: 'heart', pc: 0x90caf9 }],
  ['candy_cane', 'Sucre d\'orge', 'lollipop', [0.03, 0.2, 0.015], 0xd50000, { mat: 'soft' }],
  ['lollipops_small', 'Sucettes ×10', 'pbag', [0.12, 0.16, 0.04], 0xff4081, { b: 'Sucrette', l: 'Sucettes ×10', pi: 'candy' }],
  ['chocolate_coins', 'Pièces en chocolat', 'ppouch', [0.1, 0.13, 0.03], 0xffd600, { b: 'Mireille', l: 'Pièces d\'or', pi: 'star', p: { effect: 'calm' }, desc: 'Des pièces en chocolat. Elles ne marchent pas dans les bornes d\'arcade.' }],
  ['marshmallow_twist', 'Guimauves torsadées', 'pbag', [0.15, 0.2, 0.05], 0xf8bbd0, { b: 'Sucrette', l: 'Guimauves', pi: 'candy', p: { sound: 'eat_soft' } }],
]);

// ───────────────────────── OCTET INFORMATIQUE ─────────────────────────
G('informatique', { mat: 'plastic', use: 'generic', desc: 'Du matériel informatique.' }, [
  ['mouse_wireless', 'Souris sans fil', 'box', [0.06, 0.035, 0.1], 0xfafafa, { use: 'squeak', p: { sound: 'switch' } }],
  ['keyboard_compact', 'Clavier compact', 'keyboard', [0.32, 0.025, 0.12], 0xfafafa, { use: 'squeak', p: { sound: 'typewriter' } }],
  ['usb_16', 'Clé USB 16 Go', 'box', [0.018, 0.008, 0.05], 0x1565c0, { desc: 'Une clé USB vierge. Elle, au moins, ne contient rien d\'étrange.' }],
  ['hdd_external', 'Disque dur externe 2 To', 'box', [0.08, 0.015, 0.12], 0x212121, {}],
  ['webcam_box', 'Webcam HD (boîte)', 'pbox', [0.12, 0.16, 0.08], 0x212121, { mat: 'cardboard', lk: 'device', b: 'Octet', l: 'Webcam HD', pi: 'camera', fg: 0xffffff, use: 'container', p: { contains: ['webcam'] }, desc: 'Une webcam neuve. Ouvrez la boîte : elle se connecte au réseau CCTV.' }],
  ['laptop_box', 'Ordinateur portable (carton)', 'pbox', [0.4, 0.3, 0.07], 0xfafafa, { mat: 'cardboard', lk: 'device', b: 'Octet', l: 'Portable 15"', pi: 'laptop', use: 'container', p: { contains: ['laptop'] }, mass: 3, desc: 'Un ordinateur portable neuf. Ouvrez le carton.' }],
  ['monitor_box', 'Écran 24 pouces (carton)', 'pbox', [0.6, 0.42, 0.14], 0x212121, { mat: 'cardboard', lk: 'device', b: 'Octet', l: 'Écran 24"', pi: 'tv', fg: 0xffffff, mass: 5, desc: 'Un écran neuf, trop gros pour l\'inventaire.' }],
  ['ink_cartridges', 'Cartouches d\'encre', 'pblist', [0.1, 0.16, 0.03], 0x212121, { b: 'Octet', l: 'Encre noire + couleur', pi: 'drop', desc: 'Les cartouches de l\'imprimante. Elle en consomme beaucoup, la nuit.' }],
  ['paper_ream', 'Ramette de papier A4', 'pbox', [0.21, 0.05, 0.3], 0xfafafa, { mat: 'paper', lk: 'box', b: 'Octet', l: 'A4 80 g', pi: 'book', top: true, mass: 2.5 }],
  ['mouse_pad', 'Tapis de souris', 'pcard', [0.25, 0.2, 0.003], 0x212121, { mat: 'soft', lk: 'card', l: 'OCTET', pi: 'star', b: '' }],
  ['headset_office', 'Casque-micro', 'headset', [0.18, 0.18, 0.17], 0x212121, { use: 'headphones', desc: 'Musique dans les oreilles : vous n\'entendez plus rien venir.' }],
  ['hdmi_cable', 'Câble HDMI', 'pblist', [0.1, 0.2, 0.03], 0x212121, { b: 'Octet', l: 'HDMI 2 m', pi: 'tv' }],
  ['pc_speakers', 'Enceintes PC', 'pbox', [0.3, 0.2, 0.12], 0x263238, { mat: 'cardboard', lk: 'device', b: 'Sonora', l: 'Enceintes 2.0', pi: 'note', fg: 0xffffff }],
  ['floppy_box', 'Boîte de disquettes', 'pbox', [0.1, 0.1, 0.05], 0x1565c0, { mat: 'plastic', lk: 'box', b: 'Octet', l: 'Disquettes ×10', pi: 'cube', use: 'read', p: { text: 'Dix disquettes 3,5". Sur l\'une d\'elles, une étiquette manuscrite : « inventaire réserve B-13 — NE PAS EFFACER ».' } }],
  ['software_box', 'Logiciel « Compta Facile »', 'pbox', [0.19, 0.24, 0.05], 0x00897b, { mat: 'cardboard', lk: 'media', l: 'COMPTA FACILE', pi: 'cube', use: 'read', p: { text: 'Le logiciel de comptabilité du centre. Version 1987.' } }],
]);

// ───────────────────────── SALLE DU PERSONNEL, DIRECTION, TOILETTES ─────────────────────────
G('personnel', { mat: 'plastic', use: 'generic', desc: 'Un objet du quotidien des employés.' }, [
  ['instant_noodles', 'Nouilles instantanées', 'pcan', [0.1, 0.09, 0.1], 0xd32f2f, { mat: 'paper', use: 'eat', b: 'Ramen Express', l: 'Poulet', pi: 'soup', lid: 0xfafafa, p: { sound: 'eat_crunch', food: 4, raw: true, cook: 'hot_noodles' }, desc: 'Trois minutes au micro-ondes. Crues : de la paille salée.' }],
  ['lunch_box', 'Boîte repas', 'pbox', [0.18, 0.07, 0.12], 0x29b6f6, { lk: 'plain', b: '', top: true, use: 'eat', p: { sound: 'eat_soft', food: 22 }, desc: 'Le repas de quelqu\'un. Un post-it : « NE PAS TOUCHER — Michel ».' }],
  ['thermos_coffee', 'Thermos de café', 'pbot', [0.08, 0.28, 0.08], 0x2e7d32, { sil: 'juice', mat: 'metal', use: 'drink', b: '', l: 'CAFÉ', pi: 'cup', c2: 0x212121, lc: 0x2e7d32, p: { food: 3, effect: 'energy', hot: true }, desc: 'Le café de la nuit. Encore brûlant.' }],
  ['mug_colleague', 'Mug « Meilleur collègue »', 'pmug', [0.11, 0.1, 0.09], 0xfafafa, { b: '', l: 'MEILLEUR COLLÈGUE', pi: 'star', c2: 0x5d4037 }],
  ['biscuit_tin', 'Boîte à biscuits', 'pcan', [0.2, 0.08, 0.2], 0x1565c0, { mat: 'metal', use: 'eat', b: 'Biscuiterie Lucien', l: 'Assortiment', pi: 'cookie', p: { sound: 'eat_crunch', food: 10, uses: 6 }, desc: 'La boîte commune. Six biscuits, si personne ne s\'est servi.' }],
  ['paper_files', 'Dossiers du personnel', 'pbox', [0.24, 0.05, 0.32], 0xfff59d, { mat: 'paper', lk: 'plain', b: 'CONFIDENTIEL', top: true, use: 'read', p: { text: 'Plannings, congés, fiches de paie. Une fiche porte la mention « Gérard — poste de nuit depuis 1987 ». La case « date de départ » est vide.' } }],
  ['stapler', 'Agrafeuse', 'box', [0.04, 0.05, 0.15], 0x212121, { mat: 'metal', use: 'squeak', p: { sound: 'switch' } }],
  ['pen_cup', 'Pot à crayons', 'pcan', [0.08, 0.1, 0.08], 0x37474f, { mat: 'metal', b: '', l: 'BUREAU', pi: 'brush' }],
  ['calculator', 'Calculatrice', 'box', [0.09, 0.015, 0.15], 0x212121, { use: 'squeak', p: { sound: 'button' }, desc: '07734 à l\'envers, ça fait « hELLO ». Très drôle.' }],
  ['binder', 'Classeur « Procédures »', 'pbook', [0.08, 0.32, 0.28], 0xd32f2f, { mat: 'paper', use: 'read', b: 'Hélios', l: 'PROCÉDURES', pi: 'cross', bk: true, p: { text: 'Procédure n° 13 : « En cas d\'anomalie au sous-sol, ne pas intervenir seul. Prévenir la direction. Ne pas ouvrir la porte B-13. »' } }],
  ['rubber_stamp', 'Tampon « Vu »', 'box', [0.05, 0.08, 0.05], 0x3e2723, { mat: 'wood', desc: 'Un tampon encreur « VU ». Il en a vu, des choses.' }],
  ['desk_plant', 'Plante de bureau', 'pplant', [0.12, 0.2, 0.12], 0x2e7d32, { mat: 'ceramic', use: 'flower', fo: 'bush' }],
  ['hand_soap', 'Savon pour les mains', 'pbot', [0.07, 0.18, 0.07], 0xb2dfdb, { sil: 'pump', use: 'spray', b: 'Hélios', l: 'Savon doux', pi: 'bubbles', c2: 0xfafafa, p: { sound: 'spray' } }],
  ['air_freshener_wc', 'Désodorisant WC', 'pbot', [0.065, 0.24, 0.065], 0xffcc80, { sil: 'aero', mat: 'can', use: 'spray', b: 'Maison Propre', l: 'Agrumes', pi: 'orange', c2: 0xfafafa, p: { sound: 'spray', scent: true } }],
  ['toilet_brush', 'Brosse WC', 'stick', [0.08, 0.08, 0.4], 0xfafafa, { use: 'melee', p: { dmg: 0.5 }, desc: 'Arme de dernier, dernier recours.' }],
]);
d('hot_noodles', 'Nouilles chaudes', 'pcan', [0.1, 0.09, 0.1], 0xd32f2f, 'paper', 'eat', { cat: 'personnel', b: 'Ramen Express', l: 'Poulet', pi: 'flame', p: { sound: 'eat_soft', food: 25, effect: 'calm' }, desc: 'Fumantes, salées, parfaites. Le repas officiel du gardien de nuit.' });

// ───────────────────────── LOTS, PRÉSENTOIRS ET CARTONS ─────────────────────────
PACK('pack_water6', 'Pack d\'eau 6 × 1,5 L', 'water', 3, 2, [0.28, 0.33, 0.19], 0x81d4fa, { mass: 9, pk: { all: true, handle: true }, desc: 'Six bouteilles d\'eau sous film. Lourd. Ouvrez le pack (clic gauche) pour en sortir une.' });
PACK('pack_sparkling6', 'Pack d\'eau gazeuse 6 × 1,25 L', 'water_sparkling', 3, 2, [0.28, 0.32, 0.19], 0x66bb6a, { mass: 8, pk: { all: true, handle: true } });
PACK('pack_cola6', 'Pack de 6 canettes de cola', 'soda', 3, 2, [0.21, 0.125, 0.14], 0xd50000, { mat: 'cardboard', b: 'Hélios', l: 'COLA ×6', pi: 'bubbles', pk: { sleeve: true, sh: 0.62, lid: 0xc8c8c8 } });
PACK('pack_beer6', 'Pack de 6 bières blondes', 'beer_blonde', 3, 2, [0.2, 0.24, 0.135], 0x0d47a1, { mat: 'cardboard', b: 'Brasserie des Remparts', l: 'Blonde ×6', pi: 'wheat', lc: 0x0d47a1, pk: { sleeve: true, sh: 0.5, handle: true, tops: false } });
PACK('pack_beercan6', 'Pack de 6 canettes de bière', 'beer_can', 3, 2, [0.21, 0.125, 0.14], 0x0d47a1, { mat: 'cardboard', b: 'Hélios Pils', l: 'PILS ×6', pi: 'beer', pk: { sleeve: true, sh: 0.62, lid: 0xc8c8c8 } });
PACK('pack_milk6', 'Pack de 6 briques de lait', 'milk_half', 3, 2, [0.22, 0.21, 0.135], 0x1e88e5, { mat: 'plastic', pk: { all: true } });
PACK('pack_yogurt4', 'Yaourts à la fraise ×4', 'yogurt_straw', 2, 2, [0.13, 0.075, 0.13], 0xf8bbd0, { mat: 'cardboard', b: 'Crèmerie du Pré', l: 'Fraise ×4', pi: 'strawberry', pk: { sleeve: true, sh: 0.7, lid: 0xf48fb1 } });
PACK('pack_yogurt_nat4', 'Yaourts nature ×4', 'yogurt_pot', 2, 2, [0.13, 0.075, 0.13], 0xfafafa, { mat: 'cardboard', b: 'Crèmerie du Pré', l: 'Nature ×4', pi: 'cow', pk: { sleeve: true, sh: 0.7, lid: 0xe0e0e0 } });
PACK('pack_dessert4', 'Crèmes dessert chocolat ×4', 'dessert_choco', 2, 2, [0.14, 0.065, 0.14], 0x5d4037, { mat: 'cardboard', b: 'Crèmerie du Pré', l: 'Crème choco ×4', pi: 'choco', pk: { sleeve: true, sh: 0.7, lid: 0x8d6e63 } });
PACK('pack_compote4', 'Compotes de pommes ×4', 'compote', 2, 2, [0.14, 0.065, 0.14], 0x9ccc65, { mat: 'cardboard', b: 'Vergers du Sud', l: 'Compote ×4', pi: 'apple', pk: { sleeve: true, sh: 0.7, lid: 0x9ccc65 } });
PACK('pack_juice_kids', 'Briquettes de jus ×6', 'juice_kids', 3, 2, [0.17, 0.1, 0.075], 0xffb300, { mat: 'plastic', pk: { all: true } });
PACK('pack_tuna3', 'Lot de 3 boîtes de thon', 'can_tuna', 3, 1, [0.26, 0.04, 0.086], 0x0277bd, { mat: 'plastic', pk: { all: true } });
PACK('pack_corn3', 'Lot de 3 boîtes de maïs', 'can_corn', 3, 1, [0.23, 0.11, 0.076], 0xfbc02d, { mat: 'plastic', pk: { all: true } });
PACK('pack_catfood4', 'Pâtées pour chat ×4', 'cat_food_can', 2, 2, [0.155, 0.04, 0.155], 0x8e24aa, { mat: 'plastic', pk: { all: true } });
for (const [of, nx, nz, o] of [['can_peas', 3, 3], ['can_beans', 3, 3], ['can_tomato', 3, 3], ['can_chickpeas', 3, 3], ['can_mushrooms', 3, 3], ['can_soup', 3, 3], ['can_lentils', 3, 2], ['can_chili', 3, 2], ['can_peaches', 3, 2], ['can_mackerel', 3, 3], ['can_sardines', 2, 4, { pk: { sq: true } }],
  ['sauce_tomato', 3, 3], ['pesto', 3, 3], ['mustard', 3, 3], ['cornichons', 3, 2], ['olives_jar', 3, 3], ['jam_apricot', 3, 3], ['marmalade', 3, 3], ['honey_lavender', 3, 3], ['spread_choco', 3, 2], ['baby_food', 4, 3], ['baby_food_fruit', 4, 3],
  ['pepper_jar', 4, 3], ['herbes_provence', 4, 3], ['bouillon_cubes', 3, 3, { pk: { sq: true } }], ['mints_tin', 4, 3, { pk: { sq: true } }], ['coffee_ground', 3, 3, { pk: { sq: true } }], ['tea_mint', 2, 3, { pk: { sq: true } }], ['tea_earl', 2, 3, { pk: { sq: true } }], ['infusion_night', 2, 3, { pk: { sq: true } }],
  ['choco_dark', 4, 2, { pk: { sq: true } }], ['choco_milk', 4, 2, { pk: { sq: true } }], ['candy_bar', 4, 3, { pk: { sq: true } }], ['energy_bar', 4, 3, { pk: { sq: true } }], ['protein_bar', 4, 3, { pk: { sq: true } }], ['gum', 4, 3, { pk: { sq: true } }],
  ['ibuprofen', 3, 3, { pk: { sq: true } }], ['aspirin', 3, 3, { pk: { sq: true } }], ['paracetamol', 3, 3, { pk: { sq: true } }], ['throat_lozenges', 3, 3, { pk: { sq: true } }], ['band_aids', 3, 3, { pk: { sq: true } }], ['vitamin_d', 4, 3], ['homeopathy', 6, 4],
  ['cat_food_can', 3, 3], ['nail_red', 4, 3], ['nail_black', 4, 3], ['nail_gold', 4, 3], ['lipstick_red', 4, 3], ['day_cream', 3, 3], ['yogurt_pot', 3, 3], ['dessert_choco', 3, 3], ['icecream_vanilla', 3, 2], ['icecream_choco', 3, 2]]) TRAY(of, nx, nz, o || {});
for (const [of, n, o] of [['pasta_spaghetti', 20], ['pasta_penne', 15], ['rice_long', 12], ['can_peas', 24], ['can_tomato', 24], ['can_cassoulet', 12], ['sauce_tomato', 12], ['cereal_choco', 8], ['cereal_honey', 8], ['coffee_ground', 20], ['biscuit_butter', 20], ['chips', 12], ['soda', 24, { fragile: false }], ['water', 6, { fragile: false }], ['wine', 6, { fragile: true }], ['beer_blonde', 24, { fragile: true }], ['milk_half', 12],
  ['shampoo_family', 12], ['shower_gel', 12], ['detergent', 4], ['dish_soap', 12], ['tp_pack', 4, { s: [0.68, 0.46, 0.46] }], ['cat_food', 10], ['dog_food_bag', 3, { s: [0.62, 0.48, 0.26] }], ['diapers', 3, { s: [0.72, 0.4, 0.42] }], ['battery', 40], ['candle', 24],
  ['ibuprofen', 50], ['band_aids', 30], ['croissant', 30, { l: 'Croissants surgelés' }], ['baguette', 20, { s: [0.7, 0.2, 0.3] }], ['screws_box', 30], ['paint_white', 4], ['light_bulbs', 24], ['fish_food', 24], ['magazine', 40], ['newspaper', 50, { s: [0.42, 0.25, 0.32] }],
  ['toy_car', 24], ['lego', 6], ['teddy', 8], ['game_box', 20], ['book_horror', 24], ['novel_polar', 24], ['perfume', 12], ['soap', 24], ['tshirt_white', 12], ['jeans', 10], ['sneakers', 6], ['shoebox_running', 6, { s: [0.42, 0.38, 0.36] }], ['tennis_ball', 36], ['energy_bar', 48],
  ['coffee_pack', 20], ['pizza_box', 25, { s: [0.34, 0.35, 0.34] }], ['fries', 50], ['soda_cup_large', 50], ['candy_jar', 4], ['lollipop', 50], ['ice_cream', 30], ['laptop_box', 2, { s: [0.45, 0.35, 0.18] }], ['mouse', 20], ['film_roll', 40], ['vhs_blank', 30], ['cart_snake', 10], ['smartphone', 10], ['sunglasses', 20], ['flower_food', 12], ['potting_soil', 2, { s: [0.66, 0.5, 0.26] }]]) CASE(of, n, o || {});
// Cagettes (fruits & légumes, présentoirs de sol)
for (const [id, name, of, c, o] of [['crate_apples', 'Cagette de pommes', 'apple', 0xc8a165], ['crate_oranges', 'Cagette d\'oranges', 'orange', 0xc8a165], ['crate_potatoes', 'Cagette de pommes de terre', 'potato', 0xa1887f, { b: 'POMMES DE TERRE' }], ['crate_tomatoes', 'Cagette de tomates', 'tomato', 0xc8a165], ['crate_lemons', 'Cagette de citrons', 'lemon', 0xc8a165], ['crate_onions', 'Cagette d\'oignons', 'onion', 0xa1887f, { b: 'OIGNONS' }],
  ['crate_peppers', 'Cagette de poivrons', 'pepper_red', 0xc8a165], ['crate_clementines', 'Cagette de clémentines', 'clementine', 0xc8a165, { b: 'CORSE' }], ['crate_pears', 'Cagette de poires', 'pear', 0xc8a165], ['crate_zucchini', 'Cagette de courgettes', 'zucchini', 0xa1887f], ['crate_avocados', 'Cagette d\'avocats', 'avocado', 0xc8a165], ['crate_melons', 'Cagette de melons', 'melon', 0xa1887f, { s: [0.5, 0.26, 0.4] }]])
  d(id, name, 'pcrate', (o && o.s) || [0.5, 0.2, 0.36], c, 'wood', 'container', { cat: ITEMS[of].cat, b: (o && o.b) || 'VERGERS DE FRANCE', c2: c, pk: { of }, p: { contains: [of, of, of, of, of, of] }, mass: 4, desc: 'Une cagette pleine. R sur l\'étal pour en prendre un, ou soulevez-la (lourd).' });

// Nettoyage des paramètres neutres laissés par les défauts de gamme
for (const it of Object.values(ITEMS)) if (it.cat && it.p) { for (const k of Object.keys(it.p)) if (it.p[k] == null || it.p[k] === false) delete it.p[k]; if (!Object.keys(it.p).length) delete it.p; }

// Familles des articles historiques (utilisées par le remplissage des rayons)
for (const [cat, ids] of Object.entries({
  fruits: 'apple green_apple banana orange lemon watermelon', legumes: 'tomato carrot salad', pain: 'baguette bread', lait: 'milk', eaux: 'water', sodas: 'soda lemonade energy_drink', jus: 'juice',
  vins: 'wine champagne', apero: 'chips', cereales: 'cereal', chocolat: 'chocolate candy_bar', cremerie: 'cheese saucisson eggs yogurt', pates: 'pasta flour sugar', surgeles: 'frozen_pizza ice_bag', conserves: 'canned_food',
  cafe: 'coffee_pack tea', tartiner: 'honey jam', papier: 'toilet_paper', entretien: 'detergent sponge bleach', animaux: 'cat_food bird_seed fish_food', bebe: 'baby_bottle', bazar: 'battery candle lighter matches basket',
  // (rayons des boutiques : les articles historiques rejoignent la famille des nouveautés voisines)
  livres: 'book_horror book_cook book_kids book_history dictionary book_electric book_cats book_poetry mall_guide comic notebook', presse: 'newspaper magazine postcard city_map', tabac: 'scratch_card lottery',
  pharma: 'paracetamol vitamins sleeping_pills glucose cough_syrup', parapharma: 'bandage thermometer sanitizer sunscreen mask_medical earplugs',
  outils: 'crowbar hammer screwdriver wrench drill saw measuring_tape toolbox ladder', quincaillerie: 'padlock chain duct_tape light_bulbs bulb fuse gloves wd40 mousetrap rope nails extension_cord helmet', peinture: 'paint_can',
  peluches: 'teddy bobby_plush bunny_plush dino_plush cat_plush', jeux: 'lego puzzle board_game dice rubik toy_blocks',
  jouets_divers: 'robot toy_car toy_train doll porcelain_doll jack_box ball beach_ball music_box spinning_top yoyo xylophone toy_drum dart_gun bubble_gun toy_horn slime kaleidoscope toy_phone nightlight rc_car rc_remote',
  optique: 'sunglasses glasses_3d magnifier contact_lens binoculars', sport: 'football basketball tennis_ball racket baseball_bat dumbbell yoga_mat skateboard boxing_gloves whistle air_horn sleeping_bag golf_club',
  photo: 'polaroid disposable_cam photo_frame film_roll photo_album', deco: 'lamp lava_lamp disco_ball string_lights cuckoo_clock wall_clock snow_globe wind_chime cushion candle_set neon_sign',
})) for (const id of ids.split(' ')) if (ITEMS[id] && !ITEMS[id].cat) ITEMS[id].cat = cat;

// ═════════════════════════ PRÉSENTOIRS MULTI-UNITÉS ═════════════════════════
// Les rayons du centre font plusieurs kilomètres pour ~14 000 objets : un présentoir, une rangée ou une pile ne
// compte que pour un objet mais occupe la place de plusieurs unités (R sur le rayon : en prendre une ; E : tout emporter).
// Présentoirs carton (ptray) : [unité, colonnes, rangs, options]
for (const [of, nx, nz, o] of [
  // hypermarché
  ['sauce_bolo', 3, 3], ['mayonnaise', 4, 2], ['harissa', 6, 3], ['soy_sauce_bottle', 4, 3], ['salt_box', 4, 2], ['cola_can_zero', 4, 3], ['orange_can', 4, 3], ['juice_apple', 4, 2], ['juice_multi', 4, 2],
  ['milk_choco', 5, 3], ['milk_whole', 4, 2], ['milk_oat', 4, 2], ['cream_fresh', 3, 3], ['butter', 3, 3, { pk: { sq: true } }], ['cheese_comte', 3, 2, { pk: { sq: true } }], ['yogurt_straw', 3, 3], ['compote', 3, 3],
  ['shampoo_anti', 4, 2], ['conditioner', 4, 2], ['soap_liquid', 4, 2], ['shaving_foam', 5, 2], ['deo_roll', 6, 2], ['cotton_swabs', 4, 3, { pk: { sq: true } }], ['hand_cream', 6, 3], ['cleaner_multi', 4, 2],
  ['glass_cleaner', 4, 2], ['wc_gel', 4, 2], ['insecticide', 5, 2], ['air_freshener', 5, 2], ['cat_treats', 3, 2], ['dog_treats', 3, 2], ['bulb_led_pack', 3, 2, { pk: { sq: true } }], ['coffee_instant', 4, 2],
  ['cocoa_powder', 3, 2], ['pasta_fusilli', 3, 2, { pk: { sq: true } }], ['pasta_coquillettes', 3, 2, { pk: { sq: true } }], ['pasta_lasagne', 3, 3, { pk: { sq: true } }], ['rice_risotto', 3, 2, { pk: { sq: true } }],
  ['semoule', 3, 2, { pk: { sq: true } }], ['quinoa', 3, 2, { pk: { sq: true } }], ['choucroute', 3, 2], ['vinegar', 4, 2], ['balsamic', 5, 2], ['oil_olive', 4, 2], ['oil_sunflower', 4, 2], ['syrup_grenadine', 4, 2],
  ['syrup_mint', 4, 2], ['juice_tomato', 4, 2], ['juice_grape', 3, 2], ['beer_amber', 5, 2], ['cider', 4, 2], ['wine_rose', 4, 2], ['wine_white', 4, 2], ['wine_red_cdr', 4, 2], ['wine_beaujolais', 4, 2], ['water_small', 5, 2],
  ['choco_hazelnut', 4, 2, { pk: { sq: true } }], ['choco_white', 4, 2, { pk: { sq: true } }], ['chips_tube', 4, 2], ['baby_milk', 3, 2], ['jam', 3, 3], ['honey', 3, 3], ['canned_food', 3, 3],
  // pharmacie
  ['paracetamol_1g', 3, 3, { pk: { sq: true } }], ['magnesium', 3, 2, { pk: { sq: true } }], ['melatonin', 3, 3, { pk: { sq: true } }], ['energy_ampoules', 3, 2, { pk: { sq: true } }], ['compresses', 3, 2, { pk: { sq: true } }],
  ['antiseptic', 5, 2], ['arnica_gel', 6, 3], ['elastic_bandage', 4, 2], ['face_cream', 5, 3], ['aftersun', 4, 3], ['mosquito_spray', 5, 2], ['mouthwash', 4, 2], ['dental_floss', 6, 4, { pk: { sq: true } }],
  ['herbal_tea_sleep', 3, 2, { pk: { sq: true } }], ['baby_powder', 5, 2], ['lip_balm', 12, 3], ['vitamins', 6, 3], ['sanitizer', 6, 2], ['sunscreen', 6, 3], ['cough_syrup', 5, 2], ['glucose', 4, 3, { pk: { sq: true } }],
  ['sleeping_pills', 3, 3, { pk: { sq: true } }], ['earplugs', 5, 3, { pk: { sq: true } }], ['bandage', 5, 3],
  // parfumerie (plateaux laqués noirs)
  ...['perf_rose', 'perf_amber', 'perf_citrus', 'perf_vanilla', 'perf_helios', 'perf_orange_blossom'].map((of) => [of, 4, 2, { lc: 0x1c1c1c, c2: 0x2b2b2b }]), ['perf_mini', 8, 3, { lc: 0x1c1c1c, c2: 0x2b2b2b }],
  ['lipstick_pink', 8, 3], ['lipstick_nude', 8, 3], ['mascara', 8, 2], ['eyeliner', 10, 2], ['foundation', 6, 2], ['serum', 6, 2], ['body_lotion', 4, 2], ['bath_salts', 3, 2], ['powder_compact', 4, 3, { pk: { sq: true } }],
  ['bath_bomb', 4, 3], ['deodorant', 6, 2], ['shampoo', 4, 3], ['compact_mirror', 4, 3, { pk: { sq: true } }], ['makeup_brush', 8, 1],
  // confiserie, tabac-presse
  ['berlingots', 3, 2], ['salted_caramels', 3, 2], ['pralines', 3, 2], ['lollipops_small', 3, 2], ['dragees', 3, 3, { pk: { sq: true } }], ['truffles', 3, 2, { pk: { sq: true } }], 
  ['chocolate_coins', 4, 2], ['licorice', 5, 4, { pk: { sq: true } }], ['chocolate', 4, 2, { pk: { sq: true } }], ['lighter_disposable', 12, 2], ['lighter_storm', 8, 3], ['lighter', 12, 2], ['matches', 6, 4, { pk: { sq: true } }],
  
  // quincaillerie
  ['wall_plugs', 3, 3], ['cable_ties', 3, 3], ['hinge', 3, 3], ['allen_keys', 4, 3], ['drill_bits', 3, 3], ['door_handle', 3, 2], ['glue_tube', 8, 3], ['electrical_tape', 4, 3], ['silicone', 6, 2], ['spray_paint', 5, 2],
  ['varnish', 3, 2], ['paint_yellow', 3, 2], ['padlock_code', 6, 3], ['padlock', 5, 3], ['nails', 3, 3, { pk: { sq: true } }], ['measuring_tape', 5, 3], ['batteries_aaa', 3, 4], ['batteries_9v', 4, 4],
  ['fuse', 10, 3], ['mousetrap', 3, 4, { pk: { sq: true } }], ['duct_tape', 3, 3], ['wd40', 6, 2], ['gloves', 3, 2, { pk: { sq: true } }],
  // photo, téléphonie, informatique
  ['film_pack', 3, 3, { pk: { sq: true } }], ['camera_lens', 4, 2], ['disposable_cam', 3, 3], ['flash_unit', 4, 2], ['camera_compact', 3, 2],
  ['phone_box_nova', 4, 2, { pk: { sq: true } }], ['phone_box_flip', 4, 2, { pk: { sq: true } }], ['screen_protector', 4, 4], ['usb_cable', 4, 4], ['car_charger', 4, 3], ['earphones_wired', 4, 4], ['phone_case_flower', 5, 3],
  ['phone_case_black', 5, 3], ['smartwatch', 6, 3], ['charger', 6, 3], ['earbuds', 6, 3], ['powerbank', 5, 2], ['mobile_phone', 4, 2], ['smartphone', 4, 2],
  ['mouse_wireless', 5, 2], ['usb_16', 10, 3], ['hdd_external', 4, 2], ['webcam_box', 3, 2, { pk: { sq: true } }], ['ink_cartridges', 4, 4], ['hdmi_cable', 4, 4], ['floppy_box', 4, 3, { pk: { sq: true } }],
  ['hard_drive', 3, 2], 
  // animalerie, jouets, jeux vidéo
  ['hamster_food', 3, 2], ['pet_shampoo', 4, 2], ['dog_ball', 5, 3], ['bird_seed', 3, 2], ['fish_food', 6, 3], 
  ['toy_figure_astro', 3, 2, { pk: { sq: true } }], ['toy_figure_knight', 3, 2, { pk: { sq: true } }], ['game_cards', 6, 3, { pk: { sq: true } }], ['game_colors', 3, 3, { pk: { sq: true } }], ['soap_bubbles', 8, 2], ['balloons_bag', 3, 4],
  ['party_popper', 8, 2], ['rubik', 6, 3], ['slime', 5, 3], ['toy_car', 4, 2], ['ball', 6, 3], ['dice', 4, 2], 
  ...['cart_pong', 'cart_breakout', 'cart_invaders', 'cart_blocs', 'cart_racer', 'cart_platformer', 'cart_glouton', 'cart_oiseau', 'cart_demineur', 'cart_simon'].map((of) => [of, 4, 3]), ['pocketboy', 4, 2], ['memory_card', 4, 4],
  
  // sport, musique, déguisements, coiffure, déco
  ['energy_gel', 8, 3], ['tennis_balls_tube', 5, 2], ['shuttlecocks', 5, 2], ['isotonic', 5, 2], ['water_bottle_sport', 5, 2], ['petanque_ball', 4, 3], ['compass', 5, 3], ['whistle', 8, 3], ['thermos', 4, 2],
  ['guitar_picks', 6, 3], ['harmonica', 3, 4, { pk: { sq: true } }], ['castanets', 5, 3], ['tuner', 5, 3], ['ocarina', 3, 3], ['metronome', 3, 2],
  ['fake_mustache', 4, 6, { pk: { sq: true } }], ['vampire_teeth', 6, 4, { pk: { sq: true } }], ['eyepatch', 5, 5, { pk: { sq: true } }], ['fake_blood', 6, 2], ['confetti_bag', 3, 4],
  ['shampoo_pro', 4, 2], ['hair_mask', 4, 3], ['hair_wax', 5, 3], ['hair_dye', 3, 2, { pk: { sq: true } }], ['hair_clips', 4, 4], ['hair_ties', 4, 4], ['water_spray', 5, 2], ['hair_spray', 5, 2],
  ['candle_scented', 4, 2], ['candle_pillar', 4, 2], ['diffuser', 3, 2], 
  // bijouterie (plateaux de velours) et optique (présentoirs de montures)
  ...['ring_silver', 'ring_ruby', 'ring_sapphire', 'earrings_pearl', 'ring', 'earrings'].map((of) => [of, 6, 3, { lc: 0x1a1a1a, c2: 0x2e2e2e }]), ...['watch_sport', 'watch_gold', 'watch', 'cufflinks'].map((of) => [of, 4, 2, { lc: 0x1a1a1a, c2: 0x2e2e2e }]),
  ...['bracelet_charm', 'pendant_heart', 'chain_gold', 'bracelet', 'necklace'].map((of) => [of, 3, 2, { lc: 0x1a1a1a, c2: 0x2e2e2e }]),
  ...['glasses_round', 'glasses_cateye', 'glasses_square', 'glasses_kids', 'reading_glasses', 'sunglasses_aviator', 'sunglasses_sport', 'sunglasses'].map((of) => [of, 3, 2, { lc: 0xeceff1, c2: 0xcfd8dc }]), ['glasses_case', 2, 3],
]) if (ITEMS[of] && !ITEMS['tray_' + of]) TRAY(of, nx, nz, o || {});

// Rangée dos visible (livres, boîtiers, classeurs) : n unités alternant les modèles `of`, dimensions [l, h, p] de la rangée
function ROW(id, name, of, n, s, o = {}) {
  const us = of.filter((x) => ITEMS[x]); if (!us.length) return; const u = ITEMS[us[0]];
  d(id, name + ' (×' + n + ')', 'pspines', s, o.c ?? u.c, o.mat || u.mat, 'container', Object.assign({ cat: u.cat, pn: n, p: { contains: Array.from({ length: n }, (_, i) => us[i % us.length]) },
    desc: 'Une rangée de ' + n + ' ' + (o.what || 'livres') + ' serrés côte à côte. R sur l\'étagère pour en prendre un, E pour emporter toute la rangée.' }, o));
}
const DARK = [0x212121, 0x880e4f, 0x263238, 0xb71c1c, 0x1a237e, 0x3e2723, 0x37474f], PASTEL = [0xf8bbd0, 0xe1bee7, 0xffcdd2, 0xf48fb1, 0xce93d8, 0xffab91, 0xd81b60];
const COOL = [0x0d47a1, 0x006064, 0x1a237e, 0x263238, 0x00838f, 0x4527a0, 0x01579b], WARM = [0x4a148c, 0x1b5e20, 0xbf360c, 0x6a1b9a, 0x33691e, 0xf57f17, 0x880e4f];
const POP = [0xd32f2f, 0xffd600, 0x1976d2, 0x388e3c, 0xff6f00, 0x7b1fa2, 0x0097a7, 0xc2185b];
ROW('row_novel_polar', 'Rangée de romans policiers', ['novel_polar', 'book_horror'], 12, [0.33, 0.21, 0.14], { pal: DARK, titles: ['MEURTRE AU SOUS-SOL', 'LE VEILLEUR', 'NUIT BLANCHE', 'L\'ESCALATOR', 'CODE B-13', 'LA DERNIÈRE RONDE', 'SILENCE', 'LE GARDIEN', 'NIVEAU -3', 'L\'INCONNU', 'BRUME', 'L\'ALARME'] });
ROW('row_novel_romance', 'Rangée de romans sentimentaux', ['novel_romance'], 12, [0.31, 0.2, 0.13], { pal: PASTEL, titles: ['UN ÉTÉ À NICE', 'TOI ET MOI', 'LA LETTRE', 'CŒUR DE VERRE', 'AVRIL', 'LES AMANTS DU QUAI', 'PROMESSE', 'L\'ÎLE', 'VALSE', 'SOUS LA PLUIE', 'CHÈRE ALICE', 'ROSE'] });
ROW('row_novel_scifi', 'Rangée de romans de science-fiction', ['novel_scifi'], 11, [0.34, 0.2, 0.13], { pal: COOL, titles: ['ORBITE 7', 'LES ANDROÏDES', 'NÉBULEUSE', 'STATION HÉLIOS', 'L\'ÉCHO', 'APRÈS LA NUIT', 'COLONIE', 'TITAN', 'LE SIGNAL', 'DÉRIVE', 'ZÉRO'] });
ROW('row_novel_fantasy', 'Rangée de romans de fantasy', ['novel_fantasy'], 8, [0.37, 0.23, 0.15], { pal: WARM, titles: ['LA COURONNE D\'OMBRE', 'LE DRAGON DE CENDRE', 'L\'ÉPÉE DE LUNE', 'LES SEPT TOURS', 'LA FORÊT GRISE', 'LE ROI SANS NOM', 'L\'ORACLE', 'HIVER ÉTERNEL'] });
ROW('row_classics', 'Rangée de classiques reliés', ['novel_hugo'], 10, [0.36, 0.18, 0.11], { c: 0x5d4037, lc: 0x5d4037, even: true, titles: ['LES MISÉRABLES', 'NOTRE-DAME DE PARIS', 'GERMINAL', 'MADAME BOVARY', 'LE ROUGE ET LE NOIR', 'CANDIDE', 'LES FLEURS DU MAL', 'BEL-AMI', 'LE CID', 'PHÈDRE'] });
ROW('row_manga', 'Rangée de mangas', ['manga_ninja'], 14, [0.29, 0.175, 0.115], { pal: POP, titles: Array.from({ length: 14 }, (_, i) => 'NINJA HÉLIOS ' + (i + 1)), what: 'mangas' });
ROW('row_comics', 'Rangée de bandes dessinées', ['comic_pepito', 'comic'], 16, [0.18, 0.3, 0.22], { pal: POP, titles: Array.from({ length: 16 }, (_, i) => 'PÉPITO T.' + (i + 1)), what: 'albums' });
ROW('row_kids', 'Rangée d\'albums jeunesse', ['kids_counting', 'book_kids'], 14, [0.16, 0.24, 0.23], { pal: POP, titles: ['BOBBY ET LA LUNE', 'COMPTE AVEC BOBBY', 'LE PETIT CHAT', 'MAX À LA MER', 'LE LOUP GENTIL', 'BONNE NUIT', 'LES COULEURS', 'LÉO LE LION', 'PIM ET POM', 'LA FUSÉE', 'MON IMAGIER', 'L\'OURSON', 'LA FERME', 'ABC'], what: 'albums' });
ROW('row_cookbooks', 'Rangée de livres de cuisine', ['cookbook_pastry', 'book_cook'], 9, [0.25, 0.26, 0.2], { pal: [0xff7043, 0xf8bbd0, 0x8bc34a, 0xffca28, 0x6d4c41], titles: ['PÂTISSERIE FACILE', 'CUISINE DU MARCHÉ', 'SOUPES', 'LE PAIN', 'DESSERTS', 'TERROIR', 'GRATINS', 'RECETTES DE MAMIE', 'CHOCOLAT'] });
ROW('row_travel', 'Rangée de guides de voyage', ['travel_normandy'], 12, [0.26, 0.2, 0.12], { pal: [0x0277bd, 0xf9a825, 0x2e7d32, 0xc62828, 0x00838f, 0x6a1b9a], titles: ['NORMANDIE', 'BRETAGNE', 'PROVENCE', 'ALSACE', 'CORSE', 'PARIS', 'LOIRE', 'JURA', 'PYRÉNÉES', 'ALPES', 'AUVERGNE', 'LANDES'], what: 'guides' });
ROW('row_dicts', 'Rangée de dictionnaires', ['dict_english', 'dictionary'], 5, [0.3, 0.24, 0.16], { pal: [0x1565c0, 0xc62828, 0x2e7d32, 0xf9a825, 0x4e342e], titles: ['ANGLAIS', 'ESPAGNOL', 'ALLEMAND', 'ITALIEN', 'FRANÇAIS'], what: 'dictionnaires' });
ROW('row_history', 'Rangée de livres d\'histoire', ['book_history'], 8, [0.33, 0.24, 0.17], { pal: [0x5d4037, 0x3e2723, 0x795548, 0x4e342e, 0x8d6e63], titles: ['HISTOIRE DE LA VILLE', 'LES ROIS', 'LA RÉVOLUTION', 'LE MOYEN ÂGE', 'NAPOLÉON', 'LES CATHÉDRALES', '1900', 'LA MINE'] });
ROW('row_games_a', 'Rangée de jeux vidéo', ['game_kart', 'game_foot', 'game_farm', 'game_puzzle'], 16, [0.24, 0.19, 0.135], { mat: 'plastic', pal: [0x1976d2, 0x1565c0, 0x0d47a1, 0x1e88e5], titles: ['HÉLIO KART', 'FOOT 98', 'MA FERME', 'CASSE-TÊTE'], what: 'boîtiers' });
ROW('row_games_b', 'Rangée de jeux d\'aventure', ['game_dragon', 'game_ninja', 'game_zombie', 'game_horror'], 16, [0.24, 0.19, 0.135], { mat: 'plastic', pal: [0x212121, 0x1a237e, 0x2e7d32, 0x4a148c], titles: ['DRAGON QUÊTE', 'NINJA', 'ZOMBIE MALL', 'LE SOUS-SOL'], what: 'boîtiers' });
ROW('row_dvd_a', 'Rangée de DVD d\'action', ['dvd_action', 'dvd_thriller', 'dvd_kungfu', 'dvd_western'], 16, [0.24, 0.19, 0.135], { mat: 'plastic', pal: [0x212121, 0xbf360c, 0x263238, 0x4e342e], titles: ['TONNERRE SUR PARIS', 'L\'OMBRE', 'DRAGON D\'OR', 'COLT 45'], what: 'DVD' });
ROW('row_dvd_b', 'Rangée de DVD familiaux', ['dvd_comedy', 'dvd_romance', 'dvd_cartoon', 'dvd_musical', 'dvd_scifi'], 16, [0.24, 0.19, 0.135], { mat: 'plastic', pal: [0xfdd835, 0xec407a, 0x29b6f6, 0x7e57c2, 0x26a69a], titles: ['LES VACANCES', 'MON AMOUR', 'BOBBY', 'LA REVUE', 'GALAXIE'], what: 'DVD' });
ROW('row_vhs_a', 'Rangée de cassettes VHS', ['vhs_horror', 'vhs_scifi', 'vhs_kungfu', 'vhs_western'], 9, [0.25, 0.19, 0.105], { mat: 'plastic', pal: [0x111111, 0x1b1b1b, 0x263238, 0x3e2723], titles: ['HORREUR', 'SCIENCE-FICTION', 'KUNG-FU', 'WESTERN'], what: 'cassettes' });
ROW('row_vhs_b', 'Rangée de cassettes VHS familiales', ['vhs_cartoon', 'vhs_aerobic', 'vhs_cooking', 'vhs_nature', 'vhs_karaoke'], 9, [0.25, 0.19, 0.105], { mat: 'plastic', pal: [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa], titles: ['DESSINS ANIMÉS', 'AÉROBIC', 'CUISINE', 'NATURE', 'KARAOKÉ'], what: 'cassettes' });
ROW('row_binders', 'Rangée de classeurs', ['binder'], 6, [0.49, 0.32, 0.28], { mat: 'paper', pal: [0xd32f2f, 0x1565c0, 0x2e7d32, 0xf9a825, 0x424242, 0x6a1b9a], titles: ['PROCÉDURES', 'FACTURES', 'PLANNING', 'SÉCURITÉ', 'ARCHIVES 1987', 'PERSONNEL'], what: 'classeurs' });
// Piles d'exemplaires identiques posés à plat (tables de librairie, presse)
function PILE(of, n, o = {}) {
  const u = ITEMS[of]; if (!u) return; const flat = u.s[1] < u.s[2], t = flat ? u.s[1] : u.s[2];
  d(o.id || 'pile_' + of, 'Pile ' + deN(u.name) + ' (×' + n + ')', 'ppile', [u.s[0], +(n * (t + 0.0015)).toFixed(3), flat ? u.s[2] : u.s[1]], u.c, u.mat, 'container',
    Object.assign({ cat: u.cat, b: u.b, l: u.l ?? u.label ?? u.name, sub: u.sub, pi: u.pi, lc: u.lc, pc: u.pc, photo: u.photo, pn: n, p: { contains: Array(n).fill(of) },
      desc: 'Une pile de ' + n + ' exemplaires. R pour en prendre un, E pour emporter la pile entière.' }, o));
}
for (const [of, n, o] of [['novel_polar', 8], ['novel_fantasy', 6], ['novel_scifi', 7], ['comic_pepito', 10], ['coloring_book', 10], ['atlas_world', 5], ['sudoku_book', 10], ['crossword_book', 10], ['cookbook_pastry', 7], ['kids_counting', 10],
  ['book_history', 6], ['diary_2', 8], ['mall_guide', 12], ['magazine', 10, { lk: 'mag' }], ['comic', 10],
  ...['mag_auto', 'mag_people', 'mag_tv', 'mag_cuisine', 'mag_sport', 'mag_crosswords', 'mag_mystery', 'mag_deco', 'mag_games', 'mag_rock', 'mag_women'].map((of) => [of, 10, { lk: 'mag' }]),
  ['newspaper', 12, { lk: 'news' }], ['newspaper_local', 12, { lk: 'news' }], ['newspaper_sport', 12, { lk: 'news' }]]) PILE(of, n, o || {});

export const ITEM_COUNT = Object.keys(ITEMS).length;
