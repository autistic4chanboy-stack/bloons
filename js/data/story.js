// Mode histoire : 10 nuits. Chaque nuit débloque magasins, zones, caméras et fonctionnalités.
// scripted : événements à heure fixe (format 'HH:MM'), mêmes primitives « fx » que les événements aléatoires
//            (voir js/data/events.js). cond (optionnel) : condition évaluée par le moteur.
// random : {rate: événements aléatoires par heure de jeu, cats: catégories autorisées}
// entities : présences actives cette nuit (avec niveau d'agressivité 0..1).

export const NIGHT_START = '22:00';
export const NIGHT_END = '06:00';
// Une nuit dure toujours 15 minutes réelles (8 heures de jeu → 1 h de jeu ≈ 112,5 s).
export const NIGHT_REAL_MINUTES = 15;

export const FEATURES = {
  flashlight: { name: 'Lampe torche', desc: 'Touche F. Les piles se vident : rechargez avec R si vous avez des piles.' },
  phone: { name: 'Téléphone du poste', desc: 'Post-it avec les numéros utiles. Police 17, pompiers 18, SAMU 15.' },
  cameras: { name: 'Caméras de surveillance', desc: 'Asseyez-vous au bureau (E sur les écrans). Vision infrarouge la nuit.' },
  recorder: { name: 'Enregistreur CCTV', desc: 'Enregistrez les caméras (bouton REC). Les enregistrements servent de preuves… et peuvent vous trahir.' },
  sensors: { name: 'Détecteurs de mouvement', desc: 'Posez-les n\'importe où : alerte sonore et visuelle au poste.' },
  door: { name: 'Porte blindée du poste', desc: 'Bouton PORTE sur la console. Consomme de l\'énergie quand elle est fermée.' },
  lights: { name: 'Contrôle des éclairages', desc: 'Allumez/éteignez les magasins depuis la console ou les interrupteurs sur place.' },
  lockpick: { name: 'Crochet de serrurier', desc: 'Trouvable dans la réserve du vidéo-club. Ouvre caisses et portes.' },
  rc: { name: 'Voiture télécommandée + caméra', desc: 'Pilotez-la depuis l\'onglet RC de la console.' },
  padlocks: { name: 'Cadenas', desc: 'À poser sur les portes pour ralentir les intrus.' },
  alarms: { name: 'Alarmes de magasins', desc: 'Armez l\'alarme d\'un magasin depuis la console : sirène si une vitre est brisée ou une porte forcée.' },
  basement: { name: 'Sous-sol technique', desc: 'Groupe électrogène, tableau électrique (disjoncteurs), régie d\'annonces.' },
  pa: { name: 'Régie d\'annonces', desc: 'Faites des annonces au micro, diffusez de la musique dans tout le centre.' },
  hatch: { name: 'Trappe d\'aération blindée', desc: 'Bouton TRAPPE : bloque le conduit au-dessus du poste.' },
  portable_cams: { name: 'Caméras portatives', desc: 'À poser n\'importe où, ajoutées au système CCTV.' },
  costumes: { name: 'Costumes', desc: 'Mille Masques : chaque costume change le comportement des présences.' },
  roof: { name: 'Toit', desc: 'Accès par l\'escalier de service ouest.' },
};

export const NIGHTS = [
  null,
  { n: 1, title: 'Première nuit', subtitle: 'Le Royaume du Jouet', day: true, start: '18:30',
    shops: ['cafe', 'jouets', 'staff', 'toilettes'], areas: ['security', 'gallery0', 'entrance'],
    camAreas: [], features: ['flashlight', 'phone', 'cameras', 'lights'], give: [],
    entities: { cat: 0.2 },
    random: { rate: 1.2, cats: ['subtle'] },
    scripted: [
      { at: '22:35', fx: 'sound', sound: 'squeak', where: 'shop:jouets' },
      { at: '23:20', fx: 'knock', where: 'shop:jouets', n: 1, item: 'ball' },
      { at: '00:30', fx: 'device', kind: 'music_box', where: 'shop:jouets', dur: 40 },
      { at: '01:40', fx: 'device', kind: 'kiddie', where: 'shop:jouets', dur: 12 },
      { at: '02:30', fx: 'cat', where: 'shop:jouets', act: 'knock' },
      { at: '03:00', fx: 'phone', caller: 'gerard_n1' },
      { at: '04:10', fx: 'flicker', where: 'shop:jouets', dur: 4 },
      { at: '05:20', fx: 'sound', sound: 'giggle', where: 'shop:jouets', volume: 0.4 },
    ],
    news: ['Nouveau poste : gardien de nuit du Centre Commercial Hélios.', 'Surveillez le Royaume du Jouet.'] },
  { n: 2, title: 'Deuxième nuit', subtitle: 'Les rayons', start: '21:30',
    shops: ['hyper'], areas: ['service'], camAreas: ['gallery0', 'service'], features: ['recorder'], give: [],
    entities: { cat: 0.4, shadow: 0.15 },
    random: { rate: 1.8, cats: ['subtle', 'items', 'shadow'] },
    scripted: [
      { at: '22:50', fx: 'knock', where: 'shop:hyper', n: 6 },
      { at: '23:40', fx: 'shadow', where: 'shop:hyper', dur: 3, cam: true },
      { at: '00:45', fx: 'cart_roll', where: 'gallery0' },
      { at: '01:30', fx: 'sound', sound: 'fridge_open', where: 'shop:hyper' },
      { at: '02:15', fx: 'knock', where: 'shop:hyper', n: 10 },
      { at: '03:00', fx: 'pa', chime: true, line: '' },
      { at: '03:33', fx: 'shadow', where: 'shop:jouets', dur: 2, cam: true },
      { at: '04:30', fx: 'flicker', where: 'gallery0', dur: 6 },
    ],
    news: ['Hypermarché ajouté à la surveillance (+3 caméras).', 'Enregistreur CCTV disponible.'] },
  { n: 3, title: 'Troisième nuit', subtitle: 'Bobby', start: '21:30',
    shops: ['electro', 'boulangerie', 'tabac'], camAreas: ['entrance'], features: ['sensors', 'door'], give: [['motion_sensor', 2]],
    entities: { cat: 0.4, shadow: 0.2, bobby: 0.35 },
    random: { rate: 2.2, cats: ['subtle', 'items', 'shadow', 'devices'] },
    scripted: [
      { at: '22:30', fx: 'tv_message', where: 'shop:electro', text: 'BONSOIR' },
      { at: '23:00', fx: 'entity', type: 'bobby', action: 'activate' },
      { at: '01:00', fx: 'device', kind: 'tv', where: 'shop:electro', dur: 30 },
      { at: '02:40', fx: 'phone', caller: 'breath' },
      { at: '04:00', fx: 'sound', sound: 'knock_triple', where: 'security_door' },
    ],
    news: ['ElectroMaison, la boulangerie et le tabac-presse sont surveillés.', 'Deux détecteurs de mouvement dans le tiroir.', 'Porte blindée du poste activée.'] },
  { n: 4, title: 'Quatrième nuit', subtitle: 'Rétro', start: '21:30',
    shops: ['pixel', 'videoclub'], features: ['lockpick'], give: [],
    entities: { cat: 0.5, shadow: 0.25, bobby: 0.5 },
    random: { rate: 2.5, cats: ['subtle', 'items', 'shadow', 'devices', 'phone'] },
    scripted: [
      { at: '22:45', fx: 'device', kind: 'console', where: 'shop:pixel', dur: 60 },
      { at: '00:00', fx: 'device', kind: 'arcade', where: 'shop:pixel', dur: 20 },
      { at: '02:00', fx: 'device', kind: 'vcr', where: 'shop:videoclub', tape: 'no_label', dur: 90 },
      { at: '03:20', fx: 'device', kind: 'turntable', where: 'shop:videoclub', genre: 'creepy_vinyl', dur: 60 },
    ],
    news: ['Pixel Planet et le Rétro Vidéo Club ajoutés.', 'Un crochet de serrurier traînerait dans la réserve du vidéo-club…'] },
  { n: 5, title: 'Cinquième nuit', subtitle: 'Les mannequins', start: '21:30',
    shops: ['mode', 'chaussures', 'sport', 'instruments', 'librairie'], areas: ['gallery1'], camAreas: ['gallery1'], features: ['rc'],
    give: [['rc_car', 1], ['rc_remote', 1], ['portable_cam', 1], ['vhs_gerard', 1]],
    entities: { cat: 0.5, shadow: 0.3, bobby: 0.5, mannequin: 0.45 },
    random: { rate: 2.8, cats: ['subtle', 'items', 'shadow', 'devices', 'phone', 'mannequin'] },
    scripted: [
      { at: '22:20', fx: 'entity', type: 'mannequin', action: 'activate', count: 1 },
      { at: '01:00', fx: 'device', kind: 'piano', where: 'shop:instruments', dur: 25 },
      { at: '02:30', fx: 'mannequin_pose', where: 'shop:mode' },
      { at: '03:33', fx: 'entity', type: 'mannequin', action: 'activate', count: 2 },
    ],
    news: ['L\'étage est ouvert : Élégance, Pas de Deux, Hélios Sport, Do Ré Mi, Librairie.', 'Voiture télécommandée + caméra sur le bureau.', 'Une cassette de Gérard vous attend.'] },
  { n: 6, title: 'Sixième nuit', subtitle: 'Braquage', start: '21:30',
    shops: ['bijouterie', 'quincaillerie'], areas: ['garage'], camAreas: ['garage'], features: ['padlocks', 'alarms'], give: [['padlock', 3]],
    entities: { cat: 0.4, shadow: 0.2, bobby: 0.3, mannequin: 0.3, robbers: 1 },
    random: { rate: 2.2, cats: ['subtle', 'items', 'shadow', 'devices', 'phone', 'garage'] },
    scripted: [
      { at: '23:30', fx: 'police_patrol' },
      { at: '01:20', fx: 'entity', type: 'robbers', action: 'spawn', target: 'bijouterie', window: [0, 50] },
    ],
    special: 'robbery',
    news: ['Bijouterie, quincaillerie et parking souterrain sous surveillance.', 'Cadenas dans le tiroir. Alarmes de magasins armables depuis la console.', 'Une bande de cambrioleurs sévit dans le quartier.'] },
  { n: 7, title: 'Septième nuit', subtitle: 'Incendie', start: '21:30',
    shops: ['mobizone', 'costumes', 'direction'], areas: ['basement'], camAreas: ['basement'], features: ['basement', 'pa', 'costumes'], give: [['extinguisher', 1]],
    entities: { cat: 0.5, shadow: 0.35, bobby: 0.5, mannequin: 0.45 },
    random: { rate: 2.6, cats: ['subtle', 'items', 'shadow', 'devices', 'phone', 'mannequin', 'power', 'basement'] },
    scripted: [
      { at: '00:20', fx: 'sparks', where: 'shop:electro', cond: 'electro_powered' },
      { at: '00:50', fx: 'sparks', where: 'shop:electro', cond: 'electro_powered' },
      { at: '01:15', fx: 'fire', where: 'shop:electro', cause: 'wiring', cond: 'electro_powered' },
      { at: '03:00', fx: 'pipe' },
    ],
    special: 'fire',
    news: ['Sous-sol technique accessible : groupe électrogène, tableau électrique, régie d\'annonces.', 'MobiZone, Mille Masques et le bureau du directeur ajoutés.', 'L\'électricien s\'inquiète du câblage d\'ElectroMaison.'] },
  { n: 8, title: 'Huitième nuit', subtitle: 'Dans les murs', start: '21:30',
    shops: ['pizzeria', 'burger', 'sushi', 'cinema', 'arcade', 'animalerie', 'coiffeur', 'photo', 'deco'], areas: ['vents'], camAreas: ['vents'], features: ['hatch'], give: [['duct_tape', 1], ['screwdriver', 1]],
    entities: { cat: 0.6, shadow: 0.35, bobby: 0.5, mannequin: 0.5, crawler: 0.55 },
    random: { rate: 3, cats: ['subtle', 'items', 'shadow', 'devices', 'phone', 'mannequin', 'power', 'vents', 'food'] },
    scripted: [
      { at: '23:00', fx: 'device', kind: 'projector', where: 'shop:cinema', dur: 120 },
      { at: '23:30', fx: 'entity', type: 'crawler', action: 'activate' },
      { at: '02:00', fx: 'device', kind: 'conveyor', where: 'shop:sushi', dur: 90 },
      { at: '03:10', fx: 'sound', sound: 'vent_bang', where: 'vents' },
    ],
    news: ['Conduits d\'aération sous caméra. Trappe blindée au-dessus du poste.', 'Restauration, cinéma, arcade, animalerie, coiffeur, photo, déco ajoutés.'] },
  { n: 9, title: 'Neuvième nuit', subtitle: 'L\'obscurité', start: '21:30',
    shops: ['pharma', 'fleuriste', 'opticien', 'parfumerie', 'glacier', 'bonbons', 'octet'], areas: ['roof', 'warehouse'], camAreas: ['roof', 'warehouse'], features: ['portable_cams', 'roof'],
    give: [['portable_cam', 3], ['fuel_can', 1]],
    entities: { cat: 0.6, shadow: 0.8, bobby: 0.45, mannequin: 0.5, crawler: 0.5 },
    random: { rate: 3.2, cats: ['subtle', 'items', 'shadow', 'devices', 'phone', 'mannequin', 'power', 'vents', 'food', 'weather'] },
    scripted: [
      { at: '22:10', fx: 'weather', kind: 'storm' },
      { at: '01:50', fx: 'power', action: 'flicker', dur: 4 },
      { at: '02:00', fx: 'power', action: 'cut', dur: 0 },
      { at: '02:01', fx: 'entity', type: 'shadow', action: 'hunt' },
    ],
    special: 'blackout',
    news: ['Toit et entrepôt accessibles. Pharmacie, fleuriste, opticien, parfumerie, glacier, bonbonnière, informatique ajoutés.', 'Trois caméras portatives + un jerrican.', 'Réseau électrique de la ville instable.'] },
  { n: 10, title: 'Dixième nuit', subtitle: 'B-13', start: '21:30',
    shops: [], areas: [], camAreas: [], features: [], give: [['fuel_can', 1], ['first_aid', 1]],
    entities: { cat: 0.6, shadow: 0.6, bobby: 0.65, mannequin: 0.6, crawler: 0.6, thing: 1 },
    random: { rate: 3.5, cats: ['subtle', 'items', 'shadow', 'devices', 'phone', 'mannequin', 'power', 'vents', 'food', 'weather', 'finale'] },
    scripted: [
      { at: '22:05', fx: 'pa', chime: true, line: 'Mesdames et messieurs, le centre commercial Hélios fête ce soir son anniversaire. Merci de votre fidélité.' },
      { at: '03:30', fx: 'power', action: 'flicker', dur: 3 },
      { at: '03:33', fx: 'entity', type: 'thing', action: 'awaken' },
    ],
    special: 'finale',
    news: ['Tout le centre est sous votre garde.', 'Dernière nuit.'] },
];

// Fins. Évaluées dans l'ordre (la première dont la condition est remplie l'emporte), sauf « early » qui
// peuvent survenir après n'importe quelle nuit.
export const ENDINGS = [
  { id: 'arrested', name: 'Garde à vue', early: true, desc: 'Trop d\'appels abusifs aux secours (5 ou plus). La police vient vous chercher au petit matin.', cond: 'pranks >= 5' },
  { id: 'fired', name: 'Licencié', early: true, desc: 'Le directeur a vu les enregistrements, ou trop d\'indices de vol se sont accumulés (suspicion ≥ 3).', cond: 'suspicion >= 3' },
  { id: 'resign', name: 'Démission', early: true, desc: 'Vous avez appelé le directeur pour démissionner. Vous ne saurez jamais.', cond: 'resigned' },
  { id: 'truth', name: 'La Vérité de B-13', desc: 'Vous avez réuni les 5 fragments, ouvert B-13 la dernière nuit et rendu à Lucie ce qui lui appartenait. La boîte à musique joue juste. Le jour se lève sur un centre apaisé.', cond: 'fragments == 5 && ritual' },
  { id: 'replacement', name: 'Le Remplaçant', desc: 'Vous avez ouvert B-13 sans comprendre. Le centre vous a gardé. Au matin, il y a un nouveau mannequin chez Élégance. Il porte votre uniforme.', cond: 'b13_opened && !ritual' },
  { id: 'rich', name: 'Riche et maudit', desc: 'Vous avez volé plus de 5 000 € sans vous faire prendre. Vous partez riche… mais chaque nuit, chez vous, une boîte à musique se met à jouer.', cond: 'stolen >= 5000' },
  { id: 'guardian', name: 'Le Gardien d\'Hélios', desc: 'Dix nuits, aucun vol, le centre est intact. Gérard vous serre la main : « Tu es des nôtres maintenant. » Le centre a trouvé son nouveau gardien. Pour toujours ?', cond: 'survived' },
];

// Épilogue secret, ajouté à n'importe quelle fin.
export const EPILOGUES = [
  { id: 'cat', name: 'Le Chat', desc: 'Vous avez nourri le chat errant au moins 7 nuits. Il vous suit jusqu\'au parking et saute dans votre voiture. Vous l\'appelez « Hélios ».', cond: 'cat_nights >= 7' },
  { id: 'musician', name: 'Le Musicien', desc: 'Vous avez joué « Au clair de la lune » au piano du Do Ré Mi. Quelque part, quelqu\'un a applaudi.', cond: 'played_lune' },
  { id: 'gamer', name: 'Le Joueur', desc: 'Vous avez trouvé le message caché de Glouton.', cond: 'glouton_secret' },
];
