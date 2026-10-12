// Catalogue des événements aléatoires (mode histoire et mode infini).
// Un « template » est instancié pour chaque lieu de sa liste `locs`, ce qui donne le catalogue complet
// (buildEventCatalog() → plus de 250 événements distincts). Chaque événement exécute une ou plusieurs
// primitives « fx » (voir js/game/events.js) : sound, knock, flicker, lights, device, door, shutter, phone, pa,
// shadow, cam_glitch, cat, move, whisper, footsteps, power, car_alarm, water, cold, uv_writing, tv_message,
// print, pc_message, balloon, toy_parade, mannequin_pose, screamer, radio_voice, rats, pipe, weather,
// item_rain, cart_roll, kids_laugh, entity, fire, sparks, sprinkler, alarm, police_patrol, fountain, escalator…
//
// cat : catégorie (subtle, items, shadow, devices, phone, mannequin, power, vents, food, garage, basement,
//       weather, finale, screamer). minNight : nuit minimale (mode histoire). weight : probabilité relative.
// scare : intensité 0..3 (sert au wiki et au dosage).

import { SHOPS, AREAS } from './shops.js';

const ALL_SHOPS = SHOPS.map(s => s.id);
const RETAIL = SHOPS.filter(s => !['direction', 'staff', 'toilettes'].includes(s.id)).map(s => s.id);
const BACKROOM_SHOPS = SHOPS.filter(s => !['toilettes', 'direction', 'staff'].includes(s.id)).map(s => s.id);
const VENT_SHOPS = SHOPS.filter(s => s.floor === 0).map(s => s.id);

const T = [];
function t(id, name, cat, minNight, weight, scare, desc, fx, locs = null) { T.push({ id, name, cat, minNight, weight, scare, desc, fx, locs }); }

// ───────── SUBTILS ─────────
t('creak', 'Craquement de structure', 'subtle', 1, 3, 0, 'La structure du bâtiment craque dans {loc}. Les variations de température… sûrement.', [{ fx: 'sound', sound: 'building_creak' }], ['gallery0', 'gallery1', 'service', 'warehouse', 'garage', 'basement', 'roof']);
t('far_steps', 'Pas lointains', 'subtle', 1, 2, 1, 'Des pas résonnent quelque part dans {loc}. Personne sur les caméras.', [{ fx: 'footsteps', path: 'zone', n: 8 }], ['gallery0', 'gallery1', 'service', 'garage', 'basement']);
t('drip', 'Goutte-à-goutte', 'subtle', 1, 1, 0, 'Une fuite goutte dans {loc}.', [{ fx: 'sound', sound: 'water_drip', count: 12, interval: 1.4 }], ['toilettes', 'basement', 'garage', 'staff']);
t('pipe', 'Tuyauterie qui cogne', 'subtle', 1, 1, 0, 'Les canalisations cognent dans {loc}.', [{ fx: 'pipe' }], ['basement', 'service', 'toilettes']);
t('backroom_creak', 'Porte de réserve qui grince', 'subtle', 1, 1, 1, 'La porte de la réserve de {loc} grince lentement.', [{ fx: 'door', action: 'creak', target: 'backroom' }], BACKROOM_SHOPS);
t('wall_knock', 'Coups dans le mur', 'subtle', 2, 1, 1, 'Trois coups secs contre un mur de {loc}.', [{ fx: 'sound', sound: 'knock_triple' }], ['jouets', 'hyper', 'electro', 'videoclub', 'mode', 'cinema', 'librairie', 'staff', 'direction', 'toilettes']);
t('giggle', 'Rire d\'enfant', 'subtle', 1, 1, 2, 'Un petit rire d\'enfant dans {loc}.', [{ fx: 'kids_laugh' }], ['jouets', 'arcade', 'gallery0', 'bonbons']);
t('squeak', 'Couinement', 'subtle', 1, 2, 0, 'Une peluche couine toute seule.', [{ fx: 'sound', sound: 'squeak' }], ['jouets']);
t('whisper', 'Murmure', 'subtle', 2, 1, 2, 'Quelqu\'un murmure votre nom, juste derrière vous.', [{ fx: 'whisper' }]);
t('breath', 'Respiration', 'subtle', 3, 1, 2, 'Une respiration lente, tout près.', [{ fx: 'sound', sound: 'breathing_heavy', where: 'behind_player', volume: 0.5 }]);
t('wind', 'Rafale', 'subtle', 1, 1, 0, 'Le vent siffle contre {loc}.', [{ fx: 'sound', sound: 'wind', dur: 6 }], ['roof', 'entrance']);
t('owl', 'Chouette', 'subtle', 1, 1, 0, 'Une chouette hulule sur le parking.', [{ fx: 'sound', sound: 'owl', where: 'outside' }]);
t('dog', 'Chien au loin', 'subtle', 1, 1, 0, 'Un chien aboie au loin, puis gémit et se tait.', [{ fx: 'sound', sound: 'dog_bark_far', where: 'outside' }, { fx: 'sound', sound: 'dog_whine', where: 'outside', delay: 3 }]);
t('patrol', 'Patrouille de police', 'subtle', 1, 1, 0, 'Une voiture de police passe devant le centre, gyrophare allumé.', [{ fx: 'police_patrol' }]);
t('cold', 'Zone froide', 'subtle', 2, 1, 1, 'La température chute brutalement dans {loc}. Votre souffle fait de la buée.', [{ fx: 'cold', dur: 25 }], ['toilettes', 'basement', 'mode', 'jouets', 'cinema']);
t('thud', 'Bruit sourd à l\'étage', 'subtle', 2, 1, 1, 'Un bruit sourd, comme quelque chose de lourd qui tombe, au-dessus de vous.', [{ fx: 'sound', sound: 'thud', where: 'above_player' }]);
t('flicker', 'Néon qui clignote', 'subtle', 1, 2, 0, 'Les éclairages de {loc} clignotent un instant.', [{ fx: 'flicker', dur: 3 }], [...RETAIL, 'gallery0', 'gallery1', 'service', 'garage', 'basement', 'security']);

// ───────── OBJETS ─────────
t('knock', 'Articles tombés', 'items', 2, 3, 1, 'Des articles tombent des étagères de {loc}.', [{ fx: 'knock', n: [2, 6] }], RETAIL);
t('item_rain', 'Pluie d\'objets', 'items', 4, 1, 2, 'Des objets tombent de la coursive de l\'étage dans l\'atrium.', [{ fx: 'item_rain' }]);
t('ball', 'Balle qui rebondit', 'items', 2, 1, 1, 'Une balle rebondit toute seule dans {loc}.', [{ fx: 'knock', n: 1, item: 'ball' }], ['jouets', 'sport']);
t('cart', 'Caddie fantôme', 'items', 2, 1, 1, 'Un caddie roule tout seul dans {loc}.', [{ fx: 'cart_roll' }], ['gallery0', 'hyper', 'garage']);
t('plush_desk', 'Visiteur en peluche', 'items', 3, 1, 3, 'Une peluche Bobby est posée sur votre bureau. Elle n\'y était pas.', [{ fx: 'move', what: 'plush_to_desk' }]);
t('toy_parade', 'Parade des jouets', 'items', 4, 1, 2, 'Les robots mécaniques sortent du Royaume du Jouet, en file indienne.', [{ fx: 'toy_parade' }]);
t('books', 'Livres renversés', 'items', 5, 1, 1, 'Une rangée de livres tombe dans la librairie.', [{ fx: 'knock', n: 8 }], ['librairie']);
t('dolls_turn', 'Poupées tournées', 'items', 4, 1, 3, 'Toutes les poupées de porcelaine de {loc} regardent maintenant la caméra.', [{ fx: 'move', what: 'dolls_face_cam' }], ['jouets', 'deco']);
t('balloon', 'Ballon rouge', 'items', 3, 1, 2, 'Un ballon rouge flotte dans {loc}. Personne ne vend de ballons ici.', [{ fx: 'balloon' }], ['gallery0', 'gallery1', 'jouets']);
t('chair_spin', 'Fauteuil qui tourne', 'items', 8, 1, 2, 'Un fauteuil du salon de coiffure tourne lentement sur lui-même.', [{ fx: 'device', kind: 'chair_spin', dur: 15 }], ['coiffeur']);
t('hangers', 'Cintres qui s\'entrechoquent', 'items', 5, 1, 1, 'Les cintres d\'un portant s\'entrechoquent chez {loc}.', [{ fx: 'sound', sound: 'wind_chime', count: 3, interval: 0.6 }], ['mode', 'costumes']);
t('shoes', 'Boîtes à chaussures', 'items', 5, 1, 1, 'Une pile de boîtes à chaussures s\'effondre.', [{ fx: 'knock', n: 5 }], ['chaussures']);
t('bottles', 'Bouteille brisée', 'items', 2, 1, 1, 'Une bouteille se brise au sol de {loc}.', [{ fx: 'knock', n: 1, item: 'wine' }], ['hyper']);
t('snowglobe', 'Boule à neige secouée', 'items', 8, 1, 1, 'Une boule à neige tourbillonne, alors que personne ne l\'a touchée.', [{ fx: 'device', kind: 'snowglobe', dur: 10 }], ['deco']);

// ───────── OMBRES ─────────
t('shadow_cam', 'Silhouette sur caméra', 'shadow', 2, 2, 2, 'Une silhouette sombre traverse le champ d\'une caméra de {loc}.', [{ fx: 'shadow', cam: true, dur: 3 }], [...RETAIL, 'gallery0', 'gallery1', 'service', 'garage', 'basement']);
t('shadow_end', 'Au bout du couloir', 'shadow', 2, 1, 3, 'Quelqu\'un se tient au bout du couloir. Puis plus personne.', [{ fx: 'shadow', where: 'player_far', dur: 2.5 }]);
t('shadow_window', 'Visage à la vitre', 'shadow', 3, 1, 3, 'Une silhouette colle son visage aux portes vitrées de l\'entrée.', [{ fx: 'shadow', where: 'entrance_glass', dur: 4 }]);
t('shadow_skylight', 'Sur la verrière', 'shadow', 4, 1, 2, 'Une forme marche sur la verrière de l\'atrium.', [{ fx: 'shadow', where: 'skylight', dur: 5 }]);
t('eyes', 'Yeux dans le noir', 'shadow', 3, 1, 2, 'Deux yeux brillent dans l\'obscurité de {loc}.', [{ fx: 'shadow', eyes: true, dur: 4 }], ['garage', 'warehouse', 'vents']);
t('escalator_fig', 'Silhouette sur l\'escalator', 'shadow', 5, 1, 2, 'Une silhouette immobile monte l\'escalator à l\'arrêt.', [{ fx: 'shadow', where: 'escalator', dur: 6 }]);
t('row_m', 'Rang M, siège 13', 'shadow', 8, 1, 3, 'Quelqu\'un est assis au rang M, siège 13 du cinéma.', [{ fx: 'shadow', where: 'cinema_seat', dur: 20, cam: true }]);
t('mirror_fig', 'Reflet de trop', 'shadow', 3, 1, 3, 'Dans le miroir des toilettes, il y a quelqu\'un derrière votre reflet.', [{ fx: 'shadow', where: 'mirror', dur: 2 }]);

// ───────── APPAREILS ─────────
const DEV = [
  ['tv_on', 'Télévisions allumées', 3, 'electro', 'tv', 'Les téléviseurs d\'ElectroMaison s\'allument seuls sur de la neige.', 2],
  ['radio_on', 'Radio fantôme', 3, 'electro', 'radio', 'Une radio s\'allume et grésille entre deux stations.', 1],
  ['music_box', 'Boîte à musique', 1, 'jouets', 'music_box', 'Une boîte à musique joue « Au clair de la lune ».', 2],
  ['kiddie', 'Manège nocturne', 1, 'jouets', 'kiddie', 'Le manège Bobby-Mobile démarre tout seul, musique comprise.', 2],
  ['robot', 'Robot en marche', 2, 'jouets', 'toy_robot', 'Un robot mécanique se met à marcher.', 1],
  ['jack', 'Diable qui sort', 3, 'jouets', 'jack', 'Un diable en boîte jaillit, accompagné de sa ritournelle.', 2],
  ['doll', 'Poupée bavarde', 2, 'jouets', 'doll', 'Une poupée parlante prononce une phrase qu\'elle ne connaît pas.', 2],
  ['toy_phone', 'Téléphone jouet', 2, 'jouets', 'toy_phone', 'Le téléphone jouet sonne. Puis s\'arrête quand vous approchez.', 2],
  ['arcade_pixel', 'Borne en démo', 4, 'pixel', 'console', 'La console de démonstration s\'allume sur l\'écran titre.', 1],
  ['arcade_galaxy', 'Arcade hantée', 8, 'arcade', 'arcade', 'Une borne de la Galaxy Arcade lance une partie. Personne aux commandes.', 2],
  ['claw', 'Pince automatique', 8, 'arcade', 'claw', 'La machine à pinces descend toute seule et attrape une peluche.', 1],
  ['vcr', 'Magnétoscope', 4, 'videoclub', 'vcr', 'Le magnétoscope du vidéo-club se met en lecture.', 2],
  ['turntable', 'Platine vinyle', 4, 'videoclub', 'turntable', 'La platine du vidéo-club joue un vieux disque, trop lentement.', 2],
  ['piano', 'Piano fantôme', 5, 'instruments', 'piano', 'Le piano joue quelques notes. « Au clair de la lune ».', 3],
  ['drums', 'Batterie', 5, 'instruments', 'drums', 'Un coup de cymbale, puis la grosse caisse, lente, comme un cœur.', 2],
  ['metronome', 'Métronome', 5, 'instruments', 'metronome', 'Un métronome se met à battre la mesure.', 1],
  ['printer_octet', 'Imprimante', 9, 'octet', 'printer', 'L\'imprimante imprime une page. Il est écrit : « JE TE VOIS ».', 2],
  ['printer_dir', 'Imprimante du directeur', 7, 'direction', 'printer', 'L\'imprimante du bureau de direction imprime une liste de noms de gardiens. Le vôtre est le dernier.', 2],
  ['pc', 'Message sur le PC', 3, 'security', 'pc', 'Un message s\'affiche sur le PC du poste : « Tu restes avec moi ? »', 2],
  ['projector', 'Séance fantôme', 8, 'cinema', 'projector', 'Le projecteur du cinéma démarre. Le film commence.', 2],
  ['conveyor', 'Tapis à sushis', 8, 'sushi', 'conveyor', 'Le tapis roulant à sushis se met en marche.', 1],
  ['popcorn', 'Pop-corn', 8, 'cinema', 'popcorn', 'La machine à pop-corn éclate quelques grains.', 1],
  ['microwave', 'Micro-ondes', 3, 'electro', 'microwave', 'Un micro-ondes tourne à vide, puis sonne : DING.', 1],
  ['microwave_staff', 'Micro-ondes du personnel', 1, 'staff', 'microwave', 'Le micro-ondes de la salle du personnel sonne. Il est vide.', 1],
  ['blender', 'Blender', 3, 'electro', 'blender', 'Un blender démarre à pleine puissance.', 1],
  ['washer', 'Essorage', 3, 'electro', 'washer', 'Un lave-linge d\'exposition lance un essorage.', 1],
  ['cuckoo', 'Coucou', 8, 'deco', 'cuckoo', 'Le coucou suisse sonne treize coups.', 2],
  ['disco', 'Boule à facettes', 8, 'deco', 'disco', 'La boule à facettes s\'allume et tourne dans le noir.', 1],
  ['dryer', 'Sèche-mains', 1, 'toilettes', 'hand_dryer', 'Un sèche-mains se déclenche dans les toilettes vides.', 2],
  ['tap', 'Robinet ouvert', 1, 'toilettes', 'water', 'Un robinet se met à couler.', 1],
  ['tap_salon', 'Bac à shampoing', 8, 'coiffeur', 'water', 'L\'eau coule dans un bac à shampoing.', 1],
  ['massage', 'Fauteuil massant', 1, 'staff', 'massage', 'Le fauteuil massant se met en marche. Il vibre comme si quelqu\'un était assis.', 1],
  ['vending', 'Distributeur', 1, 'staff', 'vending', 'Le distributeur fait tomber une canette. Personne n\'a payé.', 1],
  ['escalator', 'Escalator', 5, 'gallery0', 'escalator', 'Les escalators redémarrent tout seuls.', 1],
  ['fountain', 'Fontaine', 1, 'gallery0', 'fountain', 'La fontaine de l\'atrium se remet en marche.', 1],
  ['photobooth', 'Flash du photomaton', 8, 'photo', 'photobooth', 'Le photomaton flashe quatre fois. Une bande photo tombe.', 2],
  ['fryer', 'Friteuse', 8, 'burger', 'fryer', 'La friteuse se met à grésiller.', 1],
  ['cotton', 'Barbe à papa', 9, 'bonbons', 'cotton', 'La machine à barbe à papa se met à tourner.', 1],
  ['parrot', 'Coco parle', 8, 'animalerie', 'parrot', 'Coco le perroquet répète : « Lucie ! Lucie ! Cache-cache ! »', 2],
  ['hamster', 'Roue du hamster', 8, 'animalerie', 'hamster', 'La roue du hamster grince frénétiquement.', 0],
  ['speaker', 'Enceinte', 3, 'electro', 'speaker', 'Une enceinte Bluetooth s\'allume : « Appareil connecté : LUCIE ».', 2],
  ['radio_sec', 'Radio du poste', 2, 'security', 'radio_voice', 'La radio du poste se brouille ; une voix lointaine récite des chiffres : 1… 9… 8… 7…', 2],
  ['lava', 'Lampes à lave', 8, 'deco', 'lamps', 'Les lampes à lave s\'allument une à une.', 1],
  ['tv_crt', 'Vieux téléviseur', 3, 'electro', 'tv_crt', 'Un vieux téléviseur cathodique affiche la mire, puis un visage.', 3],
];
for (const [id, name, mn, loc, kind, desc, sc] of DEV) t('dev_' + id, name, 'devices', mn, 1, sc, desc, [{ fx: 'device', kind, dur: 25 }], [loc]);
t('tv_msg', 'Message sur les écrans', 'devices', 3, 1, 3, 'Tous les téléviseurs d\'ElectroMaison affichent le même mot.', [{ fx: 'tv_message', text: ['ICI', 'DERRIÈRE TOI', 'TU RESTES ?', 'B-13', 'COUCOU', '3:33'] }], ['electro']);

// ───────── TÉLÉPHONE ─────────
const PH = [
  ['silence', 'Appel silencieux', 'Le téléphone sonne. Au bout du fil : rien. Juste un léger souffle.', 1],
  ['breath', 'Respiration au téléphone', 'Une respiration lourde, puis on raccroche.', 2],
  ['child', 'Voix d\'enfant', 'Une petite voix : « Tu veux jouer avec moi ? »', 3],
  ['static', 'Parasites', 'Grésillements, puis quelques notes de boîte à musique.', 1],
  ['gerard', 'Gérard appelle', 'Gérard prend des nouvelles. Il a l\'air inquiet.', 0],
  ['director', 'Le directeur appelle', 'M. Desmarais vérifie que vous ne dormez pas.', 0],
  ['wrong', 'Mauvais numéro', 'Une vieille dame demande si c\'est bien la boulangerie.', 0],
  ['yourself', 'Votre propre voix', 'C\'est votre voix : « N\'ouvre pas la porte. »', 3],
  ['kevin', 'Kevin (ivre)', 'Kevin appelle, en fête : « T\'as battu mon score ou pas ? »', 0],
  ['police', 'Contrôle de police', 'Le commissariat vérifie que tout va bien au centre.', 0],
  ['countdown', 'Compte à rebours', 'Une voix synthétique : « Trois… trois… trois… »', 2],
  ['lullaby', 'Berceuse', 'Quelqu\'un fredonne « Au clair de la lune », faux.', 3],
  ['taxi', 'Taxi', 'Un taxi annonce qu\'il attend devant l\'entrée. Personne n\'a appelé de taxi.', 1],
];
for (const [id, name, desc, sc] of PH) t('phone_' + id, name, 'phone', id === 'gerard' || id === 'director' ? 2 : 4, 1, sc, desc, [{ fx: 'phone', caller: id }]);

// ───────── MANNEQUINS ─────────
t('mq_pose', 'Changement de pose', 'mannequin', 5, 2, 2, 'Les mannequins de {loc} ont changé de pose.', [{ fx: 'mannequin_pose' }], ['mode', 'costumes']);
t('mq_moved', 'Mannequin déplacé', 'mannequin', 5, 1, 3, 'Un mannequin se trouve maintenant dans la galerie, face à l\'escalator.', [{ fx: 'move', what: 'mannequin_gallery' }]);
t('mq_fall', 'Mannequin à terre', 'mannequin', 5, 1, 1, 'Un mannequin est tombé. Un bras s\'est détaché.', [{ fx: 'sound', sound: 'hit_plastic', intensity: 1 }, { fx: 'move', what: 'mannequin_fall' }], ['mode']);
t('mq_extra', 'Un de trop', 'mannequin', 6, 1, 3, 'Il y a un mannequin de plus chez Élégance. Comptez.', [{ fx: 'move', what: 'mannequin_extra' }]);
t('mq_window', 'Face à la vitrine', 'mannequin', 5, 1, 2, 'Tous les mannequins regardent vers la vitrine.', [{ fx: 'mannequin_pose', face: 'front' }], ['mode']);
t('wig_heads', 'Têtes à perruque', 'mannequin', 8, 1, 3, 'Les têtes à perruque du salon se sont toutes tournées vers la porte.', [{ fx: 'move', what: 'wigheads_face' }], ['coiffeur']);

// ───────── ÉLECTRICITÉ ─────────
t('pw_flicker', 'Baisse de tension', 'power', 7, 2, 1, 'Tout le centre vacille une seconde.', [{ fx: 'power', action: 'flicker', dur: 2 }]);
t('pw_cut', 'Coupure brève', 'power', 7, 1, 2, 'Coupure de courant de quelques secondes.', [{ fx: 'power', action: 'cut', dur: 6 }]);
for (const c of ['gallery', 'shops0', 'shops1', 'service', 'cameras', 'basement', 'garage', 'pa', 'hvac', 'roof']) t('trip_' + c, 'Disjoncteur sauté', 'power', 7, 1, 1, 'Le disjoncteur « ' + c + ' » saute au tableau électrique.', [{ fx: 'power', action: 'trip', circuit: c }]);
t('gen_alone', 'Groupe électrogène', 'power', 7, 1, 2, 'Le groupe électrogène démarre tout seul au sous-sol.', [{ fx: 'device', kind: 'generator', dur: 20 }]);
t('lights_alone', 'Lumières allumées', 'power', 3, 1, 1, 'Les lumières de {loc} s\'allument d\'elles-mêmes.', [{ fx: 'lights', on: true }], RETAIL);
t('lights_off', 'Lumières éteintes', 'power', 3, 1, 2, 'Les lumières de {loc} s\'éteignent d\'un coup.', [{ fx: 'lights', on: false }], RETAIL);
t('wave', 'Vague d\'obscurité', 'power', 8, 1, 3, 'Les lumières de la galerie s\'éteignent une par une, en direction du poste.', [{ fx: 'flicker', where: 'gallery_wave', dur: 8 }]);

// ───────── CONDUITS ─────────
t('vent_crawl', 'Ça rampe', 'vents', 8, 2, 2, 'Quelque chose rampe dans les conduits.', [{ fx: 'sound', sound: 'vent_crawl', where: 'vents', dur: 5 }]);
t('vent_bang', 'Coup dans la gaine', 'vents', 8, 1, 2, 'Un coup métallique résonne dans les gaines.', [{ fx: 'sound', sound: 'vent_bang', where: 'vents' }]);
t('grate', 'Grille tombée', 'vents', 8, 1, 2, 'La grille d\'aération de la réserve de {loc} tombe au sol.', [{ fx: 'door', action: 'grate_fall' }], VENT_SHOPS);
t('vent_breath', 'Souffle au plafond', 'vents', 8, 1, 3, 'Un souffle régulier provient de la grille au-dessus du poste.', [{ fx: 'sound', sound: 'breath', where: 'security_vent', dur: 8 }]);
t('vent_item', 'Objet tombé du conduit', 'vents', 8, 1, 2, 'Une petite chaussure d\'enfant tombe d\'une grille d\'aération.', [{ fx: 'move', what: 'vent_drop' }]);

// ───────── RESTAURATION ─────────
t('oven', 'Four à pizza', 'food', 8, 1, 1, 'Le four à pizza rougeoie dans le noir.', [{ fx: 'device', kind: 'oven_glow', dur: 40 }], ['pizzeria']);
t('soda', 'Fontaine à soda', 'food', 8, 1, 0, 'La fontaine à soda coule toute seule.', [{ fx: 'device', kind: 'soda', dur: 8 }], ['burger', 'pizzeria']);
t('freezer', 'Congélateur ouvert', 'food', 9, 1, 1, 'Le couvercle d\'un congélateur à glaces s\'est ouvert.', [{ fx: 'device', kind: 'freezer_open' }], ['glacier']);
t('trays', 'Plateaux renversés', 'food', 8, 1, 1, 'Des plateaux tombent dans {loc}.', [{ fx: 'knock', n: 4 }], ['pizzeria', 'burger', 'sushi']);

// ───────── PARKING ─────────
t('car_alarm', 'Alarme de voiture', 'garage', 6, 2, 1, 'Une alarme de voiture se déclenche dans le parking.', [{ fx: 'car_alarm' }]);
t('car_lights', 'Phares allumés', 'garage', 6, 1, 2, 'Les phares d\'une voiture s\'allument dans le parking vide.', [{ fx: 'device', kind: 'car_lights', dur: 20 }]);
t('car_horn', 'Klaxon', 'garage', 6, 1, 2, 'Un long coup de klaxon résonne au parking.', [{ fx: 'device', kind: 'car_horn' }]);
t('car_radio', 'Autoradio', 'garage', 6, 1, 2, 'L\'autoradio d\'une voiture garée diffuse une vieille chanson.', [{ fx: 'device', kind: 'car_radio', dur: 30 }]);
t('gate', 'Barrière secouée', 'garage', 6, 1, 2, 'Quelqu\'un secoue le rideau métallique de la rampe du parking.', [{ fx: 'sound', sound: 'door_rattle', where: 'garage_gate', count: 3, interval: 1 }]);
t('engine', 'Moteur', 'garage', 6, 1, 1, 'Un moteur tourne quelques secondes dans le parking, puis s\'arrête.', [{ fx: 'sound', sound: 'car_engine', where: 'zone:garage', dur: 6 }]);

// ───────── SOUS-SOL ─────────
t('boiler', 'Chaudière', 'basement', 7, 1, 1, 'La chaudière cogne violemment.', [{ fx: 'sound', sound: 'pipe_knock', where: 'zone:basement', count: 4, interval: 0.5 }]);
t('b13_knock', 'On frappe à B-13', 'basement', 7, 1, 3, 'Quelqu\'un frappe de l\'intérieur de la porte murée B-13.', [{ fx: 'sound', sound: 'knock_triple', where: 'b13' }]);
t('b13_music', 'Comptine derrière la porte', 'basement', 7, 1, 3, 'Une boîte à musique joue derrière la porte B-13.', [{ fx: 'sound', sound: 'music_box', where: 'b13', dur: 20 }]);
t('pa_feedback', 'Larsen', 'basement', 7, 1, 1, 'Le micro de la régie siffle dans tous les haut-parleurs.', [{ fx: 'pa', feedback: true }]);
// La sono se met à jouer toute seule (seule musique « automatique » du jeu) : déformée, puis coupée net
t('pa_music', 'La sono s\'allume', 'basement', 2, 1, 2, 'La sono du centre se met à jouer une musique d\'ambiance, trop lente, dans tous les haut-parleurs… puis se coupe net.', [{ fx: 'pa_music', style: 'muzak', dur: 40 }]);
t('pa_music_xmas', 'Chant de Noël', 'basement', 5, 0.4, 2, 'Un chant de Noël grésille dans les haut-parleurs. Le centre est vide.', [{ fx: 'pa_music', style: 'xmas', dur: 30 }]);
t('pa_music_box', 'Boîte à musique au micro', 'basement', 8, 0.4, 3, 'Une boîte à musique joue dans tous les haut-parleurs du centre, de plus en plus lentement.', [{ fx: 'pa_music', style: 'music_box_wrong', dur: 35 }]);
t('gen_cough', 'Groupe qui tousse', 'basement', 7, 1, 1, 'Le groupe électrogène tousse et crache.', [{ fx: 'sound', sound: 'generator_fail', where: 'generator' }]);
const PA_LINES = [
  'Le centre commercial Hélios ferme ses portes. Merci de vous diriger vers la sortie.',
  'Lucie, ta maman t\'attend à l\'accueil. Lucie, ta maman t\'attend à l\'accueil.',
  'Le gardien de nuit est attendu au local B-13.',
  'Ce soir, au Royaume du Jouet, tout est gratuit. Pour toujours.',
  'Mesdames et messieurs, il est trois heures trente-trois.',
  'Bobby l\'Ourson vous attend au rayon jouets. Ne le faites pas attendre.',
  'Un enfant s\'est perdu. Il porte une robe jaune. Il a très froid.',
  'Merci de votre visite. Revenez quand vous voulez. Vous reviendrez.',
];
PA_LINES.forEach((line, i) => t('pa_' + (i + 1), 'Annonce fantôme n°' + (i + 1), 'basement', i < 2 ? 2 : 4, 1, 2, 'Le carillon retentit, puis : « ' + line + ' »', [{ fx: 'pa', chime: true, line }]));
t('rats', 'Rats', 'basement', 6, 1, 1, 'Des rats détalent dans {loc}.', [{ fx: 'rats' }], ['basement', 'garage', 'warehouse']);

// ───────── MÉTÉO ─────────
t('thunder', 'Coup de tonnerre', 'weather', 9, 2, 1, 'Un coup de tonnerre fait trembler la verrière.', [{ fx: 'weather', kind: 'thunder' }]);
t('storm', 'Orage', 'weather', 9, 1, 1, 'L\'orage éclate. La pluie martèle la verrière.', [{ fx: 'weather', kind: 'storm' }]);
t('rain', 'Averse', 'weather', 2, 1, 0, 'Il se met à pleuvoir.', [{ fx: 'weather', kind: 'rain' }]);
t('hail', 'Grêle', 'weather', 9, 1, 1, 'La grêle crépite sur la verrière.', [{ fx: 'weather', kind: 'hail' }]);
t('lightning_fig', 'Silhouette dans l\'éclair', 'weather', 9, 1, 3, 'Un éclair illumine la verrière : quelqu\'un est debout sur le toit.', [{ fx: 'weather', kind: 'thunder' }, { fx: 'shadow', where: 'skylight', dur: 0.4 }]);

// ───────── FINALE ─────────
t('fin_lullaby', 'La berceuse partout', 'finale', 10, 1, 3, 'Toutes les boîtes à musique du centre jouent en même temps.', [{ fx: 'device', kind: 'music_box', where: 'all', dur: 30 }]);
t('fin_tvs', 'Tous les écrans', 'finale', 10, 1, 3, 'Tous les écrans du centre affichent la même porte : B-13.', [{ fx: 'tv_message', where: 'all', text: ['B-13'] }]);
t('fin_run', 'Course d\'enfant', 'finale', 10, 1, 3, 'Des petits pas qui courent en riant traversent la galerie.', [{ fx: 'footsteps', path: 'gallery_run', light: true }, { fx: 'kids_laugh', where: 'gallery0' }]);
t('fin_balloons', 'Ballons', 'finale', 10, 1, 2, 'Une dizaine de ballons rouges montent dans l\'atrium.', [{ fx: 'balloon', count: 10, where: 'gallery0' }]);
t('fin_ceiling', 'Pas au plafond', 'finale', 10, 1, 3, 'Des pas lourds traversent le plafond du poste.', [{ fx: 'footsteps', path: 'above_security', heavy: true }]);
t('fin_count', 'On compte', 'finale', 10, 1, 3, 'Une voix d\'enfant compte dans les haut-parleurs : « … dix-huit, dix-neuf, vingt. J\'arrive ! »', [{ fx: 'pa', line: 'Un, deux, trois, quatre, cinq… dix-huit, dix-neuf, vingt. Prêt pas prêt, j\'arrive !', child: true }]);

// ───────── SCREAMERS (option) ─────────
t('scr_cam', 'Visage sur caméra', 'screamer', 3, 1, 3, 'Un visage blafard apparaît en gros plan sur la caméra affichée.', [{ fx: 'screamer', kind: 'cam' }]);
t('scr_mirror', 'Miroir', 'screamer', 3, 1, 3, 'Le reflet dans le miroir ne fait pas la même chose que vous.', [{ fx: 'screamer', kind: 'mirror' }]);
t('scr_window', 'Vitrine', 'screamer', 4, 1, 3, 'Un visage se plaque contre la vitrine devant vous.', [{ fx: 'screamer', kind: 'window' }]);
t('scr_phone', 'Hurlement au téléphone', 'screamer', 4, 1, 3, 'Vous décrochez : un hurlement.', [{ fx: 'phone', caller: 'scream' }]);
t('scr_pc', 'Visage sur le PC', 'screamer', 3, 1, 3, 'L\'écran du PC affiche un visage qui hurle.', [{ fx: 'screamer', kind: 'pc' }]);
t('scr_dark', 'Dans le noir', 'screamer', 5, 1, 3, 'Lampe éteinte, quelque chose est juste devant vous.', [{ fx: 'screamer', kind: 'dark' }]);

export const EVENT_TEMPLATES = T;

export function locName(loc) {
  const s = SHOPS.find(x => x.id === loc);
  if (s) return s.name;
  const a = AREAS.find(x => x.id === loc);
  if (a) return a.name;
  return loc;
}
export function locWhere(loc) {
  if (SHOPS.find(x => x.id === loc)) return 'shop:' + loc;
  return 'zone:' + loc;
}

export const EVENT_CATEGORIES = {
  subtle: 'Subtils', items: 'Objets', shadow: 'Ombres', devices: 'Appareils', phone: 'Téléphone', mannequin: 'Mannequins',
  power: 'Électricité', vents: 'Conduits', food: 'Restauration', garage: 'Parking', basement: 'Sous-sol', weather: 'Météo',
  finale: 'Finale', screamer: 'Screamers',
};

let _catalog = null;
export function buildEventCatalog() {
  if (_catalog) return _catalog;
  const out = [];
  for (const tp of T) {
    if (!tp.locs) {
      out.push({ id: tp.id, tpl: tp.id, name: tp.name, cat: tp.cat, minNight: tp.minNight, weight: tp.weight, scare: tp.scare, desc: tp.desc, loc: null, fx: tp.fx });
      continue;
    }
    for (const loc of tp.locs) {
      const ln = locName(loc);
      out.push({
        id: tp.id + '@' + loc, tpl: tp.id, name: tp.name + ' — ' + ln, cat: tp.cat, minNight: tp.minNight, weight: tp.weight / Math.sqrt(tp.locs.length),
        scare: tp.scare, desc: tp.desc.replace('{loc}', ln), loc,
        fx: tp.fx.map(f => (f.where ? { ...f } : { ...f, where: locWhere(loc) })),
      });
    }
  }
  _catalog = out;
  return out;
}
