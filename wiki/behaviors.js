// Explications en français des comportements d'objets (`use`), des effets (`p.effect`), des matériaux (`mat`)
// et des principaux paramètres (`p`) définis dans js/data/items.js.
// Un `use` absent de cette table est affiché avec un texte générique (le wiki ne casse pas si le jeu en ajoute).

import { W, html, sp, itemChip, join } from './lib.js';

// Familles d'usages (ordre d'affichage des filtres).
export const USE_GROUPS = {
  outils: 'Outils du gardien',
  securite: 'Sécurité & surveillance',
  lumiere: 'Lumière & énergie',
  nourriture: 'Nourriture & boissons',
  soin: 'Soins & bien-être',
  jouets: 'Jouets & diversions',
  tenues: 'Vêtements & costumes',
  musique: 'Musique',
  medias: 'Écrans, jeux & médias',
  lecture: 'Lecture & indices',
  animaux: 'Animaux & plantes',
  appareils: 'Appareils',
  valeur: 'Objets de valeur',
  installations: 'Installations fixes',
  divers: 'Divers',
};

const U = (group, label, text) => ({ group, label, text });

// Une entrée par valeur distincte de `use` trouvée dans ITEMS.
export const USE_INFO = {
  // ── Outils du gardien ──
  keys: U('outils', 'Clés', 'Ouvrent les portes verrouillées : portes de service, poste, magasins débloqués. Gardez-les dans l\'inventaire et appuyez sur E devant la porte.'),
  lockpick: U('outils', 'Crochetage', 'E sur une serrure, une caisse ou une porte fermée lance le mini-jeu de crochetage. Un échec laisse des rayures… qui ressemblent beaucoup à des traces d\'effraction.'),
  tool: U('outils', 'Outil', 'Clic gauche sur la cible. Le tournevis dévisse les grilles d\'aération (pratique pour passer dans les conduits).'),
  melee: U('outils', 'Arme de mêlée', 'Clic gauche pour frapper. Les objets qui « cassent » brisent les vitres ; le pied-de-biche force aussi les portes. Les dégâts varient d\'un objet à l\'autre.'),
  tape: U('outils', 'Scotch', 'Clic gauche sur une grille d\'aération pour la sceller, ou sur l\'objectif d\'une caméra pour la masquer. Nombre d\'utilisations limité.'),
  ladder: U('outils', 'Escabeau', 'Clic gauche pour le poser sous une grille au plafond, puis grimpez (E) pour atteindre les conduits.'),
  measure: U('outils', 'Mesure', 'Clic gauche : affiche la distance jusqu\'au point visé.'),
  wd40: U('outils', 'Dégrippant', 'Clic gauche sur une porte qui grince : elle se tait pour de bon. Moins de bruit, moins de sursauts.'),
  scatter: U('outils', 'Piège à répandre', 'Clic gauche pour renverser le contenu par terre. Quiconque marche dessus fait du bruit (ou se fait mal) — vous compris. Les bottes de sécurité protègent.'),
  paint: U('outils', 'Peinture', 'Lancez le pot (clic droit) : il éclate et éclabousse tout autour.'),
  extinguisher: U('outils', 'Extincteur', 'Maintenez le clic gauche en visant la base des flammes. La charge est limitée (en secondes) : ne la gaspillez pas.'),
  fuel: U('outils', 'Carburant', 'E sur le groupe électrogène du sous-sol pour remplir son réservoir.'),
  fuse: U('outils', 'Fusible', 'E sur le tableau électrique du sous-sol pour remplacer un fusible grillé.'),
  bulb: U('outils', 'Ampoule', 'E sur une ampoule grillée pour la remplacer. Les packs servent plusieurs fois.'),

  // ── Sécurité & surveillance ──
  padlock: U('securite', 'Cadenas', 'E sur une porte pour le poser. Ralentit fortement les intrus. Une chaîne rend la porte quasiment inviolable.'),
  place_sensor: U('securite', 'Détecteur de mouvement', 'Clic gauche pour le poser n\'importe où. Alerte sonore et visuelle au poste quand quelque chose passe devant… le chat compris.'),
  place_cam: U('securite', 'Caméra à poser', 'Clic gauche pour la poser n\'importe où : elle rejoint le système CCTV et s\'affiche sur les écrans du poste.'),
  rc_car: U('securite', 'Voiture télécommandée', 'Posez-la, puis pilotez-la depuis l\'onglet RC de la console du poste ou avec la télécommande. On peut y fixer une caméra pour explorer sans risque.'),
  rc_remote: U('securite', 'Télécommande RC', 'Clic gauche : pilote la voiture télécommandée en vue caméra, où que vous soyez.'),
  walkie: U('securite', 'Talkie-walkie', 'Clic gauche pour parler et écouter. En multijoueur, tenir un talkie permet au chat textuel de porter à toute distance. Parfois, quelqu\'un d\'autre répond…'),
  mobile: U('securite', 'Téléphone portable', 'Clic gauche pour composer un numéro depuis n\'importe où dans le centre. Fait aussi office de petite lampe.'),
  tablet: U('securite', 'Tablette de surveillance', 'À configurer sur le PC du poste. Ensuite, elle affiche les caméras partout dans le centre.'),
  phone: U('securite', 'Téléphone fixe', 'E pour décrocher et composer un numéro (voir la page Téléphone).'),
  usb: U('securite', 'Clé USB', 'À brancher sur le PC du poste de sécurité (E) pour lire son contenu.'),

  // ── Lumière & énergie ──
  flashlight: U('lumiere', 'Lampe', 'Prenez-la en main puis F pour l\'allumer ou l\'éteindre. Les piles s\'usent : R pour recharger si vous avez des piles. Le modèle fixe la puissance, la portée et l\'autonomie (voir Costumes & lampes).'),
  battery: U('lumiere', 'Recharge', 'R recharge la lampe torche. La batterie externe recharge complètement la lampe et le téléphone portable.'),
  lighter: U('lumiere', 'Flamme', 'Clic gauche pour une petite flamme vacillante, qui allume les bougies. Les allumettes sont en nombre limité.'),
  candle: U('lumiere', 'Bougie', 'Posez-la, puis allumez-la avec un briquet ou une allumette. Une source de lumière chaude qui ne consomme pas de piles.'),
  lamp: U('lumiere', 'Lampe d\'appoint', 'E pour l\'allumer : une vraie source de lumière, précieuse contre tout ce qui fuit la lumière.'),
  nightlight: U('lumiere', 'Veilleuse', 'Posez-la et allumez-la : une petite lumière bleue qui projette des étoiles. Rassurant.'),
  disco: U('lumiere', 'Boule à facettes', 'E pour l\'allumer. Ambiance garantie, même seul à 3 h du matin.'),
  bike: U('lumiere', 'Vélo d\'appartement', 'E pour pédaler. Produit une infime fraction de l\'électricité du centre. Courage.'),

  // ── Nourriture & boissons ──
  eat: U('nourriture', 'Manger', 'Clic gauche pour manger : restaure votre énergie (valeur « nourriture »). Certains aliments calment, excitent ou rendent malade (voir l\'effet). Les produits crus ou surgelés gagnent à être cuits.'),
  drink: U('nourriture', 'Boire', 'Clic gauche pour boire : restaure un peu et applique l\'effet de la boisson (calme, énergie, ivresse, somnolence…).'),
  soda: U('nourriture', 'Canette', 'Clic gauche pour l\'ouvrir et la boire. Secouez-la d\'abord (clic droit maintenu)… si vous aimez les geysers.'),
  champagne: U('nourriture', 'Champagne', 'Clic gauche : le bouchon saute. Bruyant et festif.'),
  cake: U('nourriture', 'Gâteau d\'anniversaire', 'Clic gauche pour souffler les bougies et faire un vœu.'),
  peel: U('nourriture', 'Peau de banane', 'Posée au sol, elle fait glisser quiconque marche dessus.'),
  flour: U('nourriture', 'Nuage de farine', 'Lancez le sac (clic droit) : il éclate en nuage blanc qui révèle les silhouettes invisibles.'),
  cat_food: U('animaux', 'Nourriture pour chat', 'Clic gauche pour en déposer par terre (ou remplir une gamelle). Le chat errant viendra manger — et s\'attachera à vous si vous recommencez chaque nuit.'),

  // ── Soins & bien-être ──
  pills: U('soin', 'Médicament', 'Clic gauche pour avaler. L\'effet dépend de la boîte (calme, énergie, somnolence). Ne dépassez pas la dose.'),
  heal: U('soin', 'Soin', 'Clic gauche pour se soigner. La valeur indique les points de vie rendus.'),
  thermometer: U('soin', 'Thermomètre', 'Affiche la température ambiante. Elle chute près de certaines présences : un bon signal d\'alerte.'),
  earplugs: U('soin', 'Bouchons d\'oreille', 'Coupent les sons : moins de stress… mais plus aucun avertissement sonore.'),
  dumbbell: U('soin', 'Haltère', 'Clic gauche pour faire une série : réduit le stress. Lourd à transporter.'),
  yoga: U('soin', 'Méditation', 'Posez le tapis et méditez (clic gauche) : grand calme.'),
  massage: U('soin', 'Massage', 'Une pièce, deux minutes de massage : le stress fond.'),
  flower: U('animaux', 'Plante', 'Clic gauche pour sentir les fleurs : effet calmant. S\'arrosent avec l\'arrosoir.'),
  cactus: U('animaux', 'Cactus', 'À ne pas serrer contre soi (clic gauche : aïe).'),

  // ── Jouets & diversions ──
  squeak: U('jouets', 'Couine', 'Couine (ou fait son bruit) quand on l\'utilise : clic gauche. Un bruit attire l\'attention — parfait pour une diversion.'),
  bobby: U('jouets', 'Peluche parlante', 'Clic gauche pour la serrer… elle vous parle.'),
  toy_walk: U('jouets', 'Jouet mécanique', 'Remontez-le (clic gauche) et posez-le : il marche tout seul en cliquetant.'),
  toy_roll: U('jouets', 'Roule tout seul', 'Posez-le et lancez-le (clic gauche) : il file droit devant en faisant du bruit.'),
  doll: U('jouets', 'Poupée', 'Clic gauche pour l\'entendre parler.'),
  jack: U('jouets', 'Diable en boîte', 'Tournez la manivelle (clic gauche)… attendez… attendez…'),
  ball: U('jouets', 'Balle', 'Lancez-la (clic droit) : elle rebondit selon son élasticité. Bruyant, idéal pour attirer quelque chose ailleurs.'),
  music_box: U('jouets', 'Boîte à musique', 'Clic gauche pour la remonter : elle joue « Au clair de la lune ».'),
  top: U('jouets', 'Toupie', 'Posez-la et lancez-la (clic gauche).'),
  yoyo: U('jouets', 'Yo-yo', 'Clic gauche pour le faire descendre et remonter.'),
  rubik: U('jouets', 'Casse-tête', 'Clic gauche pour tourner une face.'),
  popper: U('jouets', 'Confettis', 'Clic gauche : le pétard à confettis éclate (BANG) et repousse les présences toutes proches, puis il est usé. Le sachet de confettis fait une pluie silencieuse, cinq fois.'),
  dart_gun: U('jouets', 'Pistolet à fléchettes', 'Clic gauche pour tirer une fléchette en mousse (munitions limitées). Déclenche les détecteurs de mouvement à distance.'),
  bubbles: U('jouets', 'Bulles', 'Clic gauche : des bulles qui suivent les courants d\'air… et révèlent ce qui bouge.'),
  toy_horn: U('jouets', 'Trompette jouet', 'Clic gauche pour souffler dedans.'),
  dice: U('jouets', 'Dé', 'Lancez-le (clic droit) : le résultat s\'affiche quand il s\'arrête.'),
  kaleido: U('jouets', 'Kaléidoscope', 'Clic gauche pour regarder dedans.'),
  toy_phone: U('jouets', 'Téléphone jouet', 'Clic gauche pour appuyer sur les touches.'),
  toilet_paper: U('jouets', 'Rouleau volant', 'Lancez-le (clic droit) : il se déroule en vol.'),
  whistle: U('jouets', 'Sifflet', 'Coup de sifflet strident. Fait fuir le chat… et certains intrus.'),
  air_horn: U('jouets', 'Corne de brume', 'TRÈS fort. Repousse temporairement les présences proches.'),
  hoop: U('jouets', 'Panier de basket', 'Lancez un ballon dedans (clic droit).'),
  wand: U('jouets', 'Baguette magique', 'Abracadabra (clic gauche). Il se passe… quelque chose ?'),
  globe: U('jouets', 'Globe', 'Clic gauche pour le faire tourner.'),
  snowglobe: U('jouets', 'Boule à neige', 'Secouez-la (clic gauche).'),
  hide: U('jouets', 'Cachette', 'E pour s\'y cacher. Rien ne vous voit… vous non plus.'),

  // ── Vêtements & costumes ──
  wear: U('tenues', 'À porter', 'Clic gauche pour l\'enfiler. Chaque objet occupe un emplacement (tête, visage, corps, mains, cou, pieds). Certaines tenues changent le bruit de vos pas ou vous protègent.'),
  costume: U('tenues', 'Costume', 'Clic gauche pour l\'enfiler. Un costume change la façon dont les présences vous perçoivent (voir Costumes & lampes).'),
  glasses: U('tenues', 'Lunettes', 'Clic gauche pour les mettre. L\'effet dépend du modèle : solaires (tout s\'assombrit), 3D anaglyphe, vision nocturne (consomme des piles).'),
  zoom: U('tenues', 'Zoom', 'Maintenez le clic gauche pour zoomer.'),
  mirror: U('tenues', 'Miroir de poche', 'Maintenez le clic gauche pour voir ce qu\'il y a derrière vous.'),
  lipstick: U('tenues', 'Rouge à lèvres', 'Clic gauche devant un miroir pour y écrire un message.'),
  spray: U('tenues', 'Vaporisateur', 'Clic gauche pour vaporiser. Les parfums laissent une odeur qui persiste (le chat déteste).'),
  headphones: U('tenues', 'Casque audio', 'De la musique dans les oreilles : vous n\'entendez plus rien venir. Dangereux.'),
  vr: U('tenues', 'Réalité virtuelle', 'Clic gauche pour mettre le casque. Vous ne voyez plus le vrai centre commercial…'),

  // ── Musique ──
  piano: U('musique', 'Clavier', 'E pour jouer avec la rangée du milieu du clavier (Q S D F G H J K L M en AZERTY) ; la rangée du haut donne les dièses.'),
  drumkit: U('musique', 'Batterie', 'E puis Q grosse caisse, S caisse claire, D charleston, F tom, G cymbale.'),
  guitar: U('musique', 'Guitare', 'Clic gauche pour gratter, R pour changer d\'accord.'),
  instrument: U('musique', 'Instrument', 'Clic gauche : joue la note suivante de sa gamme.'),
  xylo: U('musique', 'Xylophone', 'Chaque clic joue la note suivante de la gamme.'),
  toy_drum: U('musique', 'Tambour', 'Clic gauche pour taper dessus.'),
  turntable: U('musique', 'Platine vinyle', 'E avec un vinyle en main pour le poser et l\'écouter.'),
  vinyl: U('musique', 'Vinyle', 'À poser sur une platine (E). Chaque disque a son style de musique.'),
  radio: U('musique', 'Radio / enceinte', 'Clic gauche ou E pour allumer, R pour changer de station. Posée et allumée quelque part : diversion parfaite.'),
  pa: U('musique', 'Sonorisation', 'Régie d\'annonces du sous-sol : annonces au micro et musique diffusée dans tout le centre.'),

  // ── Écrans, jeux & médias ──
  tv: U('medias', 'Téléviseur', 'E pour allumer, R pour changer de chaîne. Branché à un magnétoscope, lit les cassettes VHS.'),
  vcr: U('medias', 'Magnétoscope', 'E avec une cassette en main pour l\'insérer, E pour la lecture, R pour éjecter.'),
  vhs: U('medias', 'Cassette VHS', 'À insérer dans un magnétoscope. Certaines cassettes sont des indices de l\'histoire.'),
  console: U('medias', 'Console de démo', 'E avec une cartouche en main pour l\'insérer, puis E pour jouer.'),
  cartridge: U('medias', 'Cartouche', 'À insérer dans une console de démo ou une PocketBoy (E avec la cartouche en main).'),
  handheld: U('medias', 'Console portable', 'Clic gauche pour jouer n\'importe où ; insérez-y une cartouche (E).'),
  arcade: U('medias', 'Borne d\'arcade', 'Insérez un jeton (ou une pièce) et jouez (E). Les meilleurs scores restent affichés.'),
  claw: U('medias', 'Machine à pinces', 'Un jeton, une chance : les peluches gagnées tombent dans le bac.'),
  kiddie: U('medias', 'Manège', 'Une pièce et c\'est parti. Il démarre parfois tout seul, la nuit.'),
  token_machine: U('medias', 'Distributeur de jetons', 'Une pièce de 2 € donne 5 jetons d\'arcade.'),
  computer: U('medias', 'Ordinateur', 'E pour l\'utiliser : bureau, e-mails, fichiers. Certains contiennent des numéros ou des indices.'),
  printer: U('medias', 'Imprimante', 'E pour imprimer une page. Elle imprime parfois toute seule.'),
  projector: U('medias', 'Projecteur', 'E pour lancer le film sur le grand écran, R pour changer de film.'),
  film_reel: U('medias', 'Bobine de film', 'Une bobine de cinéma. À essayer près du projecteur.'),
  photobooth: U('medias', 'Photomaton', 'Entrez et appuyez sur E : quatre photos. Regardez-les bien.'),
  polaroid: U('medias', 'Appareil photo', 'Clic gauche pour prendre une vraie photo (nombre de vues limité). Le flash peut aveugler un instant ce qui est en face. Regardez bien chaque photo…'),
  photo: U('medias', 'Photo', 'Clic gauche pour la regarder de près.'),

  // ── Lecture & indices ──
  read: U('lecture', 'À lire', 'Clic gauche pour lire. Livres, notes, affiches : certains textes racontent l\'histoire du centre ou cachent des indices.'),
  newspaper: U('lecture', 'Journal', 'Clic gauche pour lire les gros titres.'),
  map: U('lecture', 'Plan du centre', 'Gardez-le dans l\'inventaire : la touche M affiche le plan du centre.'),
  scratch: U('lecture', 'Ticket à gratter', 'Clic gauche pour gratter. Qui sait ?'),
  gum: U('lecture', 'Chewing-gum', 'Mâchez-le (clic gauche), puis collez-le sur l\'objectif d\'une caméra pour l\'aveugler.'),
  clock: U('lecture', 'Horloge', 'Donne l\'heure. Le coucou chante à chaque heure… même à 3 h.'),
  watch: U('valeur', 'Montre', 'Clic gauche pour lire l\'heure exacte. Et elle vaut une fortune.'),

  // ── Animaux & plantes ──
  fish_food: U('animaux', 'Nourriture pour poissons', 'Clic gauche devant un aquarium pour nourrir les poissons.'),
  bird_seed: U('animaux', 'Graines pour oiseaux', 'Nourrissez Coco le perroquet (clic gauche devant sa cage) : nourri, il répète des choses intéressantes.'),
  cat_toy: U('animaux', 'Jouet pour chat', 'Agitez-le (clic gauche) devant le chat errant : il adore.'),
  pet_bed: U('animaux', 'Panier', 'Posez-le quelque part : le chat errant viendra y dormir.'),
  water_can: U('animaux', 'Arrosoir', 'Clic gauche sur une plante pour l\'arroser.'),
  aquarium: U('animaux', 'Aquarium', 'Des poissons qui bullent dans le noir. Nourrissez-les.'),
  parrot: U('animaux', 'Perroquet', 'Coco répète la dernière phrase qu\'il a entendue.'),
  hamster: U('animaux', 'Hamster', 'Un hamster insomniaque. Sa roue grince toute la nuit.'),
  terrarium: U('animaux', 'Terrarium', 'Un python. Ne tapotez pas la vitre.'),

  // ── Appareils ──
  loopdevice: U('appareils', 'Appareil bruyant', 'Clic gauche pour le mettre en marche (certains se maintiennent appuyés). Il fait du bruit tant qu\'il tourne : utile comme diversion. La perceuse vient à bout d\'un cadenas.'),
  microwave: U('appareils', 'Micro-ondes / four', 'E avec un aliment en main pour le mettre dedans, puis E pour lancer la cuisson. Les surgelés et conserves deviennent des plats chauds. Pas de métal dedans !'),
  toaster: U('appareils', 'Grille-pain', 'Pain de mie → toast. Oublié trop longtemps → toast carbonisé… voire pire.'),
  kettle: U('appareils', 'Bouilloire', 'Clic gauche pour la lancer : elle siffle quand l\'eau bout.'),
  fan: U('appareils', 'Ventilateur', 'Allumez-le : il souffle les objets légers et la fumée.'),
  vacuum: U('appareils', 'Aspirateur', 'Clic gauche : aspire les petits objets au sol. Terrifie le chat.'),
  washer: U('appareils', 'Lave-linge / lave-vaisselle', 'E pour lancer un cycle. Un peu de lessive dans un lave-linge en marche : mousse garantie.'),
  fridge: U('appareils', 'Réfrigérateur', 'E pour l\'ouvrir ou le fermer.'),
  coffee_maker: U('appareils', 'Machine à boissons', 'E pour obtenir une boisson ou une friandise ; R pour changer de produit (café ou chocolat chaud sur la machine du poste).'),
  button_test: U('appareils', 'Bouton test', 'Clic gauche : l\'alarme sonne quelques secondes. Aïe les oreilles.'),
  fryer: U('appareils', 'Friteuse', 'Friteuse professionnelle de la restauration. Elle grésille quand elle chauffe.'),
  conveyor: U('appareils', 'Tapis roulant', 'Le tapis à sushis. Il tourne… parfois tout seul.'),
  gumball: U('appareils', 'Distributeur de boules', 'Une pièce → une boule de chewing-gum.'),
  vending: U('appareils', 'Distributeur', 'Une pièce → une boisson ou une friandise.'),
  water_fountain: U('appareils', 'Fontaine à eau', 'E pour boire un verre d\'eau fraîche.'),
  boiler: U('appareils', 'Chaudière', 'Elle cogne. Une clé à molette resserre les tuyaux qui cognent.'),

  // ── Objets de valeur ──
  jewel: U('valeur', 'Bijou', 'Un bijou de grande valeur (voir le prix). Le voler augmente la suspicion ; les braqueurs, eux, viennent pour ça.'),
  cash: U('valeur', 'Argent', 'De l\'argent qui n\'est pas le vôtre. Le prendre sous l\'œil d\'une caméra qui enregistre est une très mauvaise idée.'),
  coin: U('valeur', 'Pièce / jeton', 'E sur une machine (arcade, distributeur, manège, fauteuil massant…). Lancée dans la fontaine de l\'atrium : faites un vœu.'),

  // ── Installations fixes ──
  register: U('installations', 'Caisse enregistreuse', 'Verrouillée. Un crochet peut l\'ouvrir… à vos risques (suspicion).'),
  safe: U('installations', 'Coffre-fort', 'Code à quatre chiffres.'),
  locker: U('installations', 'Casier', 'E pour l\'ouvrir ; R pour s\'y cacher.'),
  container: U('installations', 'Contenant', 'E pour l\'ouvrir et voir ce qu\'il contient (contenu fixe ou aléatoire).'),
  fire_alarm: U('installations', 'Alarme incendie', 'Brisez la glace (E) : l\'alarme incendie sonne dans tout le centre.'),
  sink: U('installations', 'Lavabo', 'E pour ouvrir le robinet.'),
  toilet: U('installations', 'Toilettes', 'E pour tirer la chasse.'),
  sit: U('installations', 'Siège', 'E pour s\'asseoir.'),
  chair_spin: U('installations', 'Fauteuil pivotant', 'E pour s\'asseoir. Il tourne.'),
  atm: U('installations', 'Distributeur de billets', 'Le distributeur du hall d\'entrée.'),
  fountain: U('installations', 'Fontaine', 'La fontaine de l\'atrium. Jetez-y une pièce pour faire un vœu.'),
  generator: U('installations', 'Groupe électrogène', 'Au sous-sol. Remplissez le réservoir (jerrican), puis tirez le démarreur (E) plusieurs fois : il est capricieux. Il alimente le centre quand le secteur tombe.'),
  breakers: U('installations', 'Tableau électrique', 'Au sous-sol. E pour basculer les disjoncteurs de chaque circuit et remplacer les fusibles grillés.'),
  recorder: U('installations', 'Enregistreur CCTV', 'Au poste. Enregistre les caméras (bouton REC) : des preuves pour la police… et pour le directeur.'),
  forklift: U('installations', 'Chariot élévateur', 'Un engin de l\'entrepôt.'),
  car: U('installations', 'Voiture', 'Une voiture oubliée au parking. Son alarme se déclenche parfois.'),
  mannequin: U('installations', 'Mannequin', 'Il ne bouge pas. Normalement.'),
  mirror_wall: U('installations', 'Miroir', 'Il reflète la pièce… et parfois un peu plus.'),
  wig_head: U('installations', 'Tête à perruque', 'Elle a l\'air de vous regarder.'),
  cart: U('installations', 'Caddie', 'Maintenez E pour le pousser. Bruyant sur le carrelage.'),

  // ── Divers ──
  generic: U('divers', 'Objet ordinaire', 'Pas d\'action spéciale : il se ramasse (E), se lance (clic droit) et se pose (G). Un objet lancé fait du bruit en retombant.'),
};

export function useInfo(use) {
  return USE_INFO[use] || { group: 'divers', label: use, text: 'Comportement spécial, pas encore documenté dans le wiki.' };
}

// Effets des aliments, boissons et médicaments (p.effect).
export const EFFECTS = {
  calm: { label: 'Calme', text: 'fait baisser le stress' },
  energy: { label: 'Énergie', text: 'regain d\'endurance pour courir ; le cœur s\'emballe' },
  sick: { label: 'Malade', text: 'nausée passagère' },
  drunk: { label: 'Ivre', text: 'la tête tourne, la vue tangue' },
  sleepy: { label: 'Somnolence', text: 'paupières lourdes — très mauvaise idée pendant une garde' },
  sugar: { label: 'Sucre', text: 'vitesse accrue pendant un temps' },
  spicy: { label: 'Épicé', text: 'ça monte au nez' },
  cold: { label: 'Froid', text: 'frisson et petit mal de crâne' },
  sour: { label: 'Acide', text: 'grimace garantie' },
};
export const effectInfo = (e) => EFFECTS[e] || { label: e, text: 'effet particulier' };

// Matériaux (mat) : déterminent le son des impacts.
export const MATERIALS = {
  metal: 'Métal', plastic: 'Plastique', ceramic: 'Céramique', glass: 'Verre', paper: 'Papier',
  soft: 'Tissu / souple', cardboard: 'Carton', wood: 'Bois', can: 'Canette',
};
export const matName = (m) => MATERIALS[m] || m;

const SLOTS = { head: 'tête', face: 'visage', body: 'corps', feet: 'pieds', hands: 'mains', neck: 'cou' };
const TOOLS = { screw: 'tournevis (grilles d\'aération)', wrench: 'clé (tuyaux)', drill: 'perceuse (cadenas)' };
const GLASSES = { sun: 'solaires — tout s\'assombrit', anaglyph: '3D anaglyphe rouge/cyan', nightvision: 'vision nocturne — consomme les piles' };
const STEPS = { step_sneakers: 'semelles souples', step_heels: 'talons (clac, clac)', step_concrete: 'semelles lourdes', step_carpet: 'pas étouffés' };
const INSTR = { synth: 'synthétiseur', organ: 'orgue', bell: 'clochette', piano: 'piano', guitar: 'guitare' };
export const GENRES = {
  jazz: 'Jazz', disco: 'Disco', rock: 'Rock', classical: 'Classique', synthwave: 'Synthwave', funk: 'Funk',
  chanson: 'Chanson française', reggae: 'Reggae', metal: 'Metal', ambient: 'Ambient', creepy_vinyl: 'Valse ralentie… désaccordée',
  piano_bar: 'Piano-bar', xmas: 'Noël',
};

function links(ids) { return join((ids || []).map((id) => itemChip(id)), ' '); }
function screenName(list, id) {
  const l = W.screens && W.screens[list];
  if (!l) return null;
  const arr = Array.isArray(l) ? l : Object.entries(l).map(([k, v]) => (typeof v === 'object' ? { id: k, ...v } : { id: k, title: v }));
  const f = arr.find((x) => x && (x.id === id || x.key === id));
  return f ? (f.title || f.name || f.label || null) : null;
}

/**
 * Paramètres lisibles d'un objet : [[libellé, valeur (texte ou html)], …].
 * Les textes à lire (p.text, p.lore) sont traités à part par la fiche objet (spoilers).
 */
export function describeParams(it) {
  const p = it.p || {};
  const out = [];
  const add = (k, v) => out.push([k, v]);
  for (const [k, v] of Object.entries(p)) {
    switch (k) {
      case 'kind': if (it.use === 'flashlight') { const f = (W.D.FLASHLIGHTS || {})[v]; add('Modèle de lampe', html`<a href="#/costumes?at=lampe-${v}">${f ? f.name : v}</a>`); } break;
      case 'amount':
        if (it.use === 'heal') add('Soin', `+${v} points de vie`);
        else if (it.use === 'battery') add('Recharge', v >= 2 ? 'complète (lampe + portable)' : String(v));
        else if (it.use === 'pills') add('Intensité', p.effect === 'calm' ? `stress −${v}` : String(v));
        else if (it.use === 'fuel') add('Contenance', `${v} % du réservoir`);
        else add('Quantité', String(v));
        break;
      case 'master': add('Passe-partout', 'ouvre toutes les portes… sauf une'); break;
      case 'dmg': add('Dégâts', `${v} (sur 3)`); break;
      case 'breaks': if (v) add('Vitres', 'les brise'); break;
      case 'pry': if (v) add('Portes', 'peut les forcer'); break;
      case 'tool': add('Outil', TOOLS[v] || v); break;
      case 'hold': if (v) add('Utilisation', 'maintenir le clic gauche'); break;
      case 'uses': add('Utilisations', String(v)); break;
      case 'charge': add('Charge', `${v} s`); break;
      case 'shots': add('Vues', String(v)); break;
      case 'token': if (v) add('Jeton', 'pour les bornes de la Galaxy Arcade'); break;
      case 'trap': if (v) add('Piège', 'bruyant (ou douloureux) pour qui marche dessus'); break;
      case 'snap': if (v) add('Piège', 'se referme d\'un coup sec'); break;
      case 'strong': if (v) add('Résistance', 'quasiment inviolable'); break;
      case 'matches': add('Allumettes', String(v)); break;
      case 'creepy': if (v) add('Particularité', 'ses yeux suivent la lumière'); break;
      case 'bounce': add('Rebond', `${Math.round(v * 100)} %`); break;
      case 'light': if (v) add('Poids', 'très léger'); break;
      case 'ammo': add('Munitions', String(v)); break;
      case 'food': add('Nourriture', `+${v}`); break;
      case 'peel': if (v) add('Laisse', itemChip('banana_peel')); break;
      case 'splat': if (v) add('Lancé', 's\'écrase en éclaboussant'); break;
      case 'effect': { const e = effectInfo(v); add('Effet', html`<span class="eff eff-${v}">${e.label}</span> — ${e.text}`); break; }
      case 'melee': add('Arme improvisée', `dégâts ${v}`); break;
      case 'toastable': if (v) add('Grille-pain', html`devient ${itemChip('toast')} (ou ${itemChip('burnt_toast')})`); break;
      case 'breakable': if (v) add('Fragile', 'se brise si on le lance'); break;
      case 'loud': if (v) add('Bruit', 'très bruyant à manger'); break;
      case 'smell': if (v) add('Odeur', 'attire le chat errant'); break;
      case 'raw': if (v) add('Cru', 'meilleur une fois cuit'); break;
      case 'cook': add('Cuisson', html`micro-ondes ou four → ${itemChip(v)}`); break;
      case 'slot': add('Emplacement', SLOTS[v] || v); break;
      case 'quiet':
        if (typeof v === 'number') add('Bruit des pas', v < 1 ? `×${v} — plus discret` : v > 1 ? `×${v} — plus bruyant` : 'normal');
        else if (v) add('Discrétion', 'pas d\'empreintes, gestes feutrés');
        break;
      case 'armor': if (v) add('Protection', 'oui'); break;
      case 'contains': add('Contient', links(v)); break;
      case 'hot': if (v) add('Température', 'brûlant'); break;
      case 'crt': if (v) add('Écran', 'cathodique'); break;
      case 'smoothie': if (v) add('Bonus', 'mettez-y un fruit : smoothie'); break;
      case 'blow': if (v) add('Souffle', 'pousse les objets légers'); break;
      case 'speaker': if (v) add('Diversion', 'posez-la, allumez-la, éloignez-vous'); break;
      case 'dur': add('Durée', `${v} s`); break;
      case 'oven': if (v) add('Type', p.big ? 'grand four à pizza' : 'four'); break;
      case 'game': { const n = screenName('GAMES', v); add('Jeu', html`<a href="#/ecrans?at=jeu-${v}">${n || v}</a>`); break; }
      case 'genre': add('Style', GENRES[v] || v); break;
      case 'tape': { const n = screenName('VHS_TAPES', v); if (n) add('Contenu', html`<a href="#/ecrans?at=vhs-${v}">${n}</a>`); break; }
      case 'demo': if (v) add('Modèle', 'démonstration (vitrine)'); break;
      case 'mode': add('Mode', GLASSES[v] || v); break;
      case 'zoom': add('Grossissement', `×${v}`); break;
      case 'scent': if (v) add('Parfum', 'laisse une odeur persistante'); break;
      case 'lighterCombo': if (v) add('Attention', 'à ne surtout pas combiner avec un briquet'); break;
      case 'warm': if (v) add('Confort', 'tient chaud'); break;
      case 'step': add('Pas', STEPS[v] || v); break;
      case 'slow': if (v) add('Course', 'impossible de courir'); break;
      case 'kick': if (v) add('Bonus', 'se joue au pied'); break;
      case 'hitsBalls': if (v) add('Bonus', 'renvoie les balles'); break;
      case 'instr': add('Son', INSTR[v] || v); break;
      case 'electric': if (v) add('Type', 'électrique'); break;
      case 'scale': if (Array.isArray(v)) add('Notes', `${v.length} ${v.length > 1 ? 'notes' : 'note'}`); break;
      case 'squeaky': if (v) add('Attention', 'grince affreusement sans cours'); break;
      case 'costume': { const c = (W.D.COSTUMES || {})[v]; add('Costume', html`<a href="#/costumes?at=costume-${v}">${c ? c.name : v}</a>`); break; }
      case 'scary': if (v) add('Effet', 'masque effrayant'); break;
      case 'flash': if (v) add('Flash', 'aveugle brièvement ce qui est en face'); break;
      case 'big': break;
      case 'gives': add('Distribue', links(v)); break;
      case 'cold': if (v) add('Type', 'congélateur'); break;
      case 'random': add('Contenu', v === 'trash' ? 'aléatoire (déchets…)' : 'aléatoire'); break;
      case 'bowl': if (v) add('Gamelle', 'à remplir de croquettes pour le chat'); break;
      case 'strip': if (v) add('Format', 'bande de quatre photos'); break;
      case 'b13': if (v) add('Serrure', sp('B-13')); break;
      case 'arcade': if (v) add('Version', 'arcade'); break;
      default: break; // sound, pitch, speed, look, color, lava, os, screen, gamebox, mag, walkman, lego, text, lore… : techniques ou traités ailleurs
    }
  }
  return out;
}

// Où trouver les objets absents des rayons (en plus des contenants, distributeurs, cuissons et nuits, calculés).
export const ITEM_WHERE = {
  flashlight: 'La lampe de Gérard vous attend au poste de sécurité dès la première nuit.',
  keys: 'Le trousseau du gardien, au poste de sécurité.',
  lockpick: 'Dans la réserve du Rétro Vidéo Club (à partir de la nuit 4).',
  extinguisher: 'Dans les armoires à extincteur du centre.',
  cash: 'Dans les caisses et les coffres… qui ne sont pas à vous.',
  cash_drawer_money: 'Dans les caisses enregistreuses des magasins.',
  coin: 'Un peu partout : sacs, caisses, fontaine…',
  toast: 'Mettez du pain de mie dans un grille-pain.',
  burnt_toast: 'Oubliez du pain de mie dans un grille-pain.',
  photo: 'Prenez une photo avec l\'appareil photo instantané (Flash Photo).',
  polaroid_strip: 'Sortie du photomaton de Flash Photo.',
  foam_dart: 'Tirée par le pistolet à fléchettes du Royaume du Jouet.',
  banana_peel: 'Ce qui reste d\'une banane mangée.',
  gumball: 'Le distributeur de boules de La Bonbonnière (une pièce).',
  vhs_no_label: 'Quelque part dans le Rétro Vidéo Club…',
  gerard_note: 'Sur le bureau du poste, une nouvelle chaque nuit.',
  atm: 'Hall d\'entrée.',
  fountain: 'Au centre de l\'atrium, galerie du rez-de-chaussée.',
  generator: 'Sous-sol technique.',
  breaker_panel: 'Sous-sol technique.',
  pa_console: 'Régie d\'annonces, au sous-sol technique.',
  microphone: 'Régie d\'annonces, au sous-sol technique.',
  boiler: 'Sous-sol technique.',
  water_heater: 'Dans les locaux techniques.',
  forklift: 'Entrepôt.',
  pallet: 'Entrepôt.',
  car: 'Parking souterrain.',
  cassette_rec: 'Poste de sécurité.',
  cardboard_box: 'Dans les réserves et l\'entrepôt.',
  trash_can: 'Dans la galerie et les couloirs.',
  water_fountain: 'Dans la galerie et les couloirs.',
  fire_alarm: 'Sur les murs de la galerie et des couloirs.',
  extinguisher_box: 'Sur les murs de la galerie et des couloirs.',
};
// Emplacements à garder secrets (affichés sous spoiler).
export const ITEM_WHERE_SECRET = {
  vhs_security_1987: 'Un des cinq fragments de vérité : cherchez du côté des archives du centre.',
  b13_key: 'Une clé très ancienne, liée au local muré du sous-sol.',
  lore_page: 'Arrachée au registre des gardiens. Elle traîne quelque part dans le centre.',
};
