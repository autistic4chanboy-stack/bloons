// Textes rédigés du wiki : règles du jeu, contrôles, systèmes du poste, présences, astuces, FAQ, multijoueur…
// Tout ce qui existe déjà dans js/data/*.js est lu depuis les données ; ce fichier ne contient que ce qui n'y est pas.
//
// Texte riche (voir lib.js → rich) :
//   [[item:id]] [[item:id|libellé]] [[shop:id]] [[area:id]] [[costume:clé]] [[lamp:clé]] [[page:route|libellé]]
//   [[key:E]] [[num:service|kind|numéro]] [[night:3]] [[ent:bobby]] [[end:id]] [[v:variable]]
//   {{sp}}texte masqué{{/sp}} · **gras**

// Durée réelle d'une nuit (22:00 → 06:00). Fixe : il n'y a pas d'option de durée.
export const NIGHT_REAL_MINUTES = 15;

// ───────────────────────── CONTRÔLES ─────────────────────────
// keys : liste de touches ; { azerty: [...], qwerty: [...] } quand la disposition change le libellé.
export const CONTROLS = [
  { group: 'Se déplacer', rows: [
    { keys: { azerty: ['Z', 'Q', 'S', 'D'], qwerty: ['W', 'A', 'S', 'D'] }, action: 'Avancer, aller à gauche, reculer, aller à droite' },
    { keys: ['Souris'], action: 'Regarder autour de soi' },
    { keys: ['Maj'], action: 'Courir (l\'endurance se vide)' },
    { keys: ['Ctrl', 'C'], or: true, action: 'S\'accroupir — obligatoire dans les conduits d\'aération' },
    { keys: ['Espace'], action: 'Sauter' },
  ] },
  { group: 'Interagir & objets', rows: [
    { keys: ['E'], action: 'Interagir : ramasser, ouvrir, allumer, s\'asseoir au bureau' },
    { keys: ['E maintenu'], action: 'Pousser un caddie' },
    { keys: ['Clic gauche'], action: 'Utiliser l\'objet en main' },
    { keys: ['Clic droit'], action: 'Lancer l\'objet (maintenir pour lancer plus fort)' },
    { keys: ['G'], action: 'Poser l\'objet' },
    { keys: ['F'], action: 'Allumer ou éteindre la lampe torche' },
    { keys: ['R'], action: 'Recharger la lampe / action secondaire : changer de chaîne, d\'accord de guitare, éjecter une cassette…' },
    { keys: ['Tab'], action: 'Ouvrir l\'inventaire' },
    { keys: ['1 – 9', 'Molette'], or: true, action: 'Choisir l\'objet en main' },
  ] },
  { group: 'Interface', rows: [
    { keys: ['M'], action: 'Afficher le plan (si vous avez le Guide du centre)' },
    { keys: ['N'], action: 'Regarder l\'heure' },
    { keys: ['T'], action: 'Chat textuel (multijoueur)' },
    { keys: ['Échap'], action: 'Pause' },
  ] },
  { group: 'Au bureau de sécurité', rows: [
    { keys: ['Clic'], action: 'Appuyer sur les boutons de la console' },
    { keys: ['←', '→', '1 – 9'], or: true, action: 'Changer de caméra' },
    { keys: ['Espace'], action: 'Vision infrarouge' },
    { keys: ['Échap'], action: 'Se lever du bureau' },
  ] },
];

// ───────────────────────── ACCUEIL ─────────────────────────
export const PITCH = [
  'Vous venez d\'être embauché comme **gardien de nuit** au Centre Commercial Hélios, deux étages de boutiques autour d\'un atrium à verrière. Gérard, l\'ancien gardien, vous fait visiter le premier soir. Ensuite, vous êtes seul, de 22:00 à 06:00.',
  'Surveillez les caméras, faites vos rondes à la lampe torche, gérez l\'électricité, appelez les secours quand il le faut… et apprenez les règles. Parce qu\'à Hélios, certaines choses ne bougent que lorsqu\'on ne les regarde pas.',
];

export const QUICK_TIPS = [
  '**Restez dans la lumière.** Lampe torche, éclairage des magasins, bougies : beaucoup de choses détestent la lumière.',
  '**Ce qui est observé ne bouge pas.** Une caméra affichée au poste suffit à figer [[ent:bobby|Bobby]] et [[ent:mannequin|les mannequins]].',
  '**Gardez des [[item:battery]].** [[key:R]] recharge la lampe ; une lampe vide, c\'est le noir complet.',
  '**Café ou chocolat ?** La machine du poste fait les deux ([[key:R]] pour changer) : le café donne de l\'énergie, le chocolat chaud calme.',
  '**Lisez les notes de Gérard** posées sur le bureau au début de chaque nuit : elles annoncent les nouveautés.',
  '**Nourrissez le chat.** Il est inoffensif et, une fois apprivoisé, il feule quand un danger approche.',
  '**Un objet lancé fait du bruit.** Une balle, une enceinte allumée ou une petite voiture font d\'excellentes diversions.',
  '**Les secours ne sont pas un jouet.** [[num:police]], [[num:pompiers]], [[num:samu]] : seulement quand c\'est vraiment nécessaire.',
];

// ───────────────────────── POSTE DE SÉCURITÉ & SYSTÈMES ─────────────────────────
export const SECURITY_SECTIONS = [
  { id: 'bureau', title: 'Le bureau', paras: [
    'Le poste de sécurité se trouve à l\'extrémité ouest du rez-de-chaussée, juste à côté du [[shop:cafe]]. Appuyez sur [[key:E]] face aux écrans pour vous asseoir au bureau : la souris sert alors à cliquer sur les boutons de la console, [[key:←]] / [[key:→]] ou [[key:1]]–[[key:9]] changent de caméra, [[key:Espace]] active la vision infrarouge et [[key:Échap]] vous relève.',
    'Sur le bureau : les écrans CCTV, l\'enregistreur, le téléphone et son post-it, la radio, la machine à café, et chaque soir une note de Gérard.',
  ] },
  { id: 'cameras', title: 'Caméras', feature: 'cameras', paras: [
    'Chaque magasin surveillé a ses caméras ; de nouvelles s\'ajoutent à chaque nuit du mode histoire (voir le tableau ci-dessous). La nuit, l\'image passe en **vision infrarouge** ([[key:Espace]]) : on voit dans le noir, mais en noir et blanc.',
    'Une caméra affichée « regarde » vraiment : ce qui ne bouge que lorsqu\'on ne l\'observe pas reste figé tant qu\'elle est à l\'écran.',
  ] },
  { id: 'recorder', title: 'Enregistreur (REC)', feature: 'recorder', paras: [
    'Le bouton **REC** lance l\'enregistrement caméra par caméra. Les enregistrements servent de **preuves** pour la police (un braquage filmé, par exemple).',
    'Mais attention : si une caméra qui enregistre vous filme en train de voler, **le directeur verra la cassette**. {{sp}}Assez d\'indices de vol et c\'est la fin « Licencié ».{{/sp}}',
  ] },
  { id: 'sensors', title: 'Détecteurs de mouvement', feature: 'sensors', paras: [
    'À poser n\'importe où (clic gauche) : une alerte sonore et visuelle s\'affiche au poste quand quelque chose passe devant. Idéal dans un couloir de service, à l\'entrée d\'une réserve ou dans les conduits. Le chat errant les déclenche aussi…',
  ] },
  { id: 'portable', title: 'Caméras portatives', feature: 'portable_cams', paras: [
    'Une [[item:portable_cam]] ou une [[item:webcam]] se pose n\'importe où et apparaît aussitôt dans le système CCTV : couvrez les angles morts.',
  ] },
  { id: 'rc', title: 'Voiture télécommandée', feature: 'rc', paras: [
    'La [[item:rc_car]] du Royaume du Jouet, équipée d\'une caméra, se pilote depuis l\'onglet **RC** de la console (ou avec la [[item:rc_remote]]). Parfaite pour aller voir ce qui a fait du bruit sans quitter le poste.',
  ] },
  { id: 'door', title: 'Porte blindée', feature: 'door', paras: [
    'Les boutons **FERMER / OUVRIR** de la console commandent la porte blindée du poste. Fermée, rien n\'entre — mais elle **consomme de l\'énergie** tant qu\'elle reste fermée. Fermez au bon moment, rouvrez dès que possible.',
  ] },
  { id: 'hatch', title: 'Trappe d\'aération', feature: 'hatch', paras: [
    'À partir de la nuit 8, le bouton **TRAPPE** ferme une trappe blindée sur le conduit qui passe au-dessus du poste. Si ça gratte au plafond, fermez-la.',
  ] },
  { id: 'lights', title: 'Éclairage des magasins', feature: 'lights', paras: [
    'La console allume et éteint l\'éclairage de chaque magasin ; on peut aussi le faire sur place avec les interrupteurs. Un magasin éclairé décourage beaucoup de monde… mais il se voit de loin.',
  ] },
  { id: 'alarms', title: 'Alarmes de magasin', feature: 'alarms', paras: [
    'Depuis la console, armez l\'alarme d\'un magasin : la sirène hurle si une vitre est brisée ou une porte forcée. Les cambrioleurs détestent ça.',
  ] },
  { id: 'phone', title: 'Téléphone & post-it', feature: 'phone', paras: [
    'Le téléphone fixe du bureau appelle n\'importe quel numéro. Le post-it collé à côté donne les numéros utiles (ci-dessous) ; les autres se trouvent en explorant — voir la page [[page:telephone|Téléphone]].',
  ] },
  { id: 'radio', title: 'Radio lofi', paras: [
    'La petite radio du poste diffuse une musique lofi douce : elle **calme**. Indispensable vers 4 h du matin.',
  ] },
  { id: 'coffee', title: 'Machine à café', paras: [
    'Un [[item:coffee]] donne de l\'énergie ; [[key:R]] fait passer la machine en mode [[item:hot_choc]], qui calme. Gérard ne jure que par elle.',
  ] },
];

export const POWER_PARAS = [
  'Le centre tourne sur le **secteur**. Quand il tombe (orage, réseau instable, disjoncteur…), il faut descendre au [[area:basement]] :',
];
export const POWER_STEPS = [
  '**Groupe électrogène** — vérifiez le carburant, remplissez avec un [[item:fuel_can]] (E), puis tirez le démarreur **plusieurs fois** : il est capricieux. Surveillez le niveau d\'essence pendant la nuit.',
  '**Tableau électrique** — chaque circuit a son disjoncteur. Un disjoncteur sauté se réarme à la main ; un fusible grillé se remplace par un [[item:fuse]]. Couper un circuit peut aussi vous sauver la vie…',
  '**Régie d\'annonces** — le micro de la régie diffuse vos annonces dans tous les haut-parleurs du centre, et la console peut y passer de la musique.',
];
// Circuits du tableau électrique (identifiants utilisés par le jeu).
export const CIRCUITS = [
  { id: 'gallery', name: 'Galerie', desc: 'Éclairage des allées, de l\'atrium et des escalators.' },
  { id: 'shops0', name: 'Magasins RDC', desc: 'Éclairage et vitrines des boutiques du rez-de-chaussée.' },
  { id: 'shops1', name: 'Magasins étage', desc: 'Éclairage et vitrines des boutiques de l\'étage.' },
  { id: 'service', name: 'Service', desc: 'Couloirs de service et réserves.' },
  { id: 'cameras', name: 'Caméras', desc: 'Le réseau CCTV. Coupé : plus aucune image au poste.' },
  { id: 'basement', name: 'Sous-sol', desc: 'Éclairage du sous-sol technique.' },
  { id: 'garage', name: 'Parking', desc: 'Éclairage du parking souterrain.' },
  { id: 'pa', name: 'Sonorisation', desc: 'Haut-parleurs et régie d\'annonces.' },
  { id: 'hvac', name: 'Ventilation', desc: 'Climatisation et ventilation des gaines.' },
  { id: 'roof', name: 'Toit', desc: 'Équipements et éclairage du toit.' },
  { id: 'electro', name: 'ElectroMaison', desc: 'Circuit dédié du magasin d\'électroménager… au câblage douteux.' },
];

// ───────────────────────── PRÉSENCES ─────────────────────────
// Variables [[v:…]] calculées depuis les données par la page (voir pages/extras.js).
export const ENTITIES = [
  { id: 'cat', danger: 0, tag: 'Inoffensif',
    summary: 'Un chat noir s\'est installé dans le centre. Il n\'est pas dangereux, mais il fait du bruit : il renverse des articles et déclenche les détecteurs de mouvement. Avec un peu de patience, c\'est votre meilleur allié.',
    signs: [
      'Des articles tombent des étagères sans raison apparente.',
      'Un détecteur de mouvement sonne… pour rien.',
      'Un miaulement dans une réserve, un ronronnement sous le bureau.',
    ],
    rules: [
      'Il est totalement inoffensif.',
      'Nourrissez-le avec des [[item:cat_food]], du [[item:cheese]] ou du [[item:saucisson]] : il vous suit ensuite partout.',
      'Un chat apprivoisé **feule** quand un danger approche, même si vous ne le voyez pas encore.',
      'Il déteste le parfum, le sifflet, l\'aspirateur et le [[item:cat_plush]].',
      '{{sp}}Nourrissez-le au moins [[v:catNights]] nuits en mode histoire : l\'épilogue secret « Le Chat » vous attend.{{/sp}}',
    ],
    counters: [
      'Posez un [[item:pet_bed]] quelque part : il viendra y dormir.',
      'Agitez le [[item:cat_toy]] devant lui pour l\'amadouer.',
    ],
    items: ['cat_food', 'cheese', 'saucisson', 'pet_bowl', 'cat_toy', 'pet_bed'] },

  { id: 'shadow', danger: 2, tag: 'Craint la lumière',
    summary: 'Une silhouette noire qui se tient à la lisière de votre champ de vision et traverse les caméras. Elle s\'évanouit dès qu\'on l\'éclaire.',
    signs: [
      'Quelqu\'un au bout du couloir… qui n\'est plus là quand vous regardez.',
      'Une forme sombre qui traverse le champ d\'une caméra.',
      'Un visage collé aux portes vitrées de l\'entrée.',
    ],
    rules: [
      'Elle disparaît dans la lumière : lampe torche, éclairage des magasins, bougies…',
      '**À partir de la nuit [[v:shadowHunt]]**, elle chasse les joueurs qui restent dans l\'obscurité. Gardez les lumières allumées et la lampe chargée.',
      'Un nuage de [[item:flour]] la rend visible.',
    ],
    counters: [
      'Ayez toujours des [[item:battery]] (ou une [[item:powerbank]]) sur vous.',
      'Allumez depuis la console les magasins que vous allez traverser.',
    ],
    items: ['flour', 'flashlight_tac', 'battery', 'candle', 'lamp'] },

  { id: 'bobby', danger: 3, tag: 'Ne bouge que si personne ne regarde',
    summary: 'Le costume de mascotte du [[shop:jouets]]. Vide. Plus personne ne le porte depuis des années. Il se tient à l\'entrée du magasin et semble sourire.',
    signs: [
      'Bobby n\'est plus à l\'entrée du Royaume du Jouet.',
      'Des pas lourds et feutrés dans la galerie.',
      'Il apparaît sur une caméra plus proche du poste que la fois précédente.',
    ],
    rules: [
      'Actif à partir de la nuit [[v:bobbyNight]].',
      'Il ne bouge **que lorsque personne ne le regarde** : ni un joueur, ni une caméra affichée sur l\'écran du poste.',
      'Il marche vers le poste de sécurité.',
      'Quand il arrive au [[shop:cafe]], juste à côté du poste, **fermez la porte blindée** — et rouvrez-la quand il est reparti : elle consomme de l\'énergie.',
    ],
    counters: [
      'Gardez sa caméra à l\'écran pour le figer sur place.',
      'Le [[item:honey]] le distrait.',
    ],
    items: ['honey', 'bobby_plush'] },

  { id: 'mannequin', danger: 2, tag: 'Figés dans la lumière',
    summary: 'Une douzaine de mannequins chez [[shop:mode]]. Comptez-les en arrivant. Recomptez-les.',
    signs: [
      'Les poses ont changé depuis votre dernier passage.',
      'Un mannequin se tient dans la galerie, face à l\'escalator.',
      'Il y en a un de plus que tout à l\'heure.',
    ],
    rules: [
      'Actifs à partir de la nuit [[v:mannequinNight]].',
      'Ils ne bougent que lorsqu\'ils ne sont pas observés.',
      'Dans un magasin éclairé, ils restent figés.',
    ],
    counters: [
      'Laissez la lumière d\'Élégance allumée depuis la console.',
      'Une caméra affichée les observe aussi bien que vous.',
    ],
    items: ['costume_mannequin', 'lamp'] },

  { id: 'crawler', danger: 3, tag: 'Dans les murs',
    summary: 'Quelque chose vit dans les conduits d\'aération qui relient le poste, les réserves et le couloir de service.',
    signs: [
      'Bruits de reptation, coups métalliques dans les gaines.',
      'Une grille d\'aération tombée au sol d\'une réserve.',
      'Un souffle régulier au-dessus du poste.',
    ],
    rules: [
      'Actif à partir de la nuit [[v:crawlerNight]].',
      'Il se déplace dans les conduits : on l\'entend bien avant de le voir.',
      'Quand il approche du poste, **fermez la trappe d\'aération** (bouton TRAPPE).',
      'Ailleurs, **scellez la grille** de la réserve concernée avec du [[item:duct_tape]] quand il est tout près.',
    ],
    counters: [
      'Des [[item:motion_sensor|détecteurs de mouvement]] posés dans les conduits suivent sa progression.',
      'Les caméras des conduits (nuit [[v:crawlerNight]]) montrent par où il passe.',
    ],
    items: ['duct_tape', 'motion_sensor', 'screwdriver'] },

  { id: 'robbers', danger: 3, tag: 'Armés',
    summary: 'Une bande de cambrioleurs vise la [[shop:bijouterie]]. Eux, ils sont bien réels — et armés.',
    signs: [
      'Le rideau métallique de la rampe du parking qui tremble.',
      'Des silhouettes sur les caméras du parking souterrain.',
      'Un moteur qui tourne au parking.',
    ],
    rules: [
      'Nuit [[v:robNight]] en mode histoire, et au hasard en mode infini.',
      'Ils entrent par la rampe du [[area:garage]] {{sp}}entre [[v:robWindow]]{{/sp}} et visent la [[shop:bijouterie]].',
      'Ils **renoncent** si le magasin visé ou la galerie est éclairé, ou si l\'alarme du magasin est armée.',
      'Les [[item:padlock|cadenas]] (et la [[item:chain]]) les ralentissent fortement.',
      '**S\'ils vous voient, ils tirent.** Ne jouez pas au héros.',
    ],
    counters: [
      'Appelez le **[[num:police]]** dès que vous les voyez : la police arrive en **4 minutes** environ. Déverrouillez l\'entrée principale depuis la console pour qu\'elle puisse entrer.',
      'Enregistrez-les (REC) : les images servent de preuves.',
    ],
    items: ['padlock', 'chain', 'costume_police'] },

  { id: 'fire', danger: 3, tag: 'Danger réel',
    summary: 'Pas une présence, mais un danger bien réel. Un feu qui s\'étend trop fait échouer la nuit.',
    signs: [
      'Des étincelles et une odeur de plastique chaud.',
      'De la fumée sur une caméra, un détecteur de fumée qui hurle.',
    ],
    rules: [
      'Nuit [[v:fireNight]] : le câblage défectueux d\'[[shop:electro]] fait des étincelles {{sp}}à [[v:fireSparks]], puis prend feu à [[v:fireTime]]{{/sp}} — **sauf si vous coupez avant le disjoncteur « ElectroMaison » au tableau électrique du sous-sol**.',
      'En mode infini, un incendie a toujours une cause : câblage défectueux, appareil resté allumé (grille-pain oublié, fer à repasser…).',
      'Un feu qui s\'étend trop loin fait échouer la nuit.',
    ],
    counters: [
      'Appelez le **[[num:pompiers]]** : les pompiers sont à 5 minutes.',
      'Videz les [[item:extinguisher|extincteurs]] à la base des flammes (clic gauche maintenu) — pas d\'eau sur un feu électrique.',
    ],
    items: ['extinguisher', 'extinguisher_box', 'fire_alarm', 'smoke_detector'] },

  { id: 'thing', danger: 3, tag: '???', spoiler: true,
    summary: 'La dernière nuit, à [[v:thingTime]], ce qui a été muré derrière la porte B-13 s\'éveille.',
    signs: [
      'On frappe de l\'intérieur de la porte murée du sous-sol.',
      'Une boîte à musique joue derrière la porte.',
      'Tous les écrans du centre affichent la même porte.',
    ],
    rules: [
      'Elle ne se manifeste que la nuit [[v:thingNight]], à [[v:thingTime]] précises.',
      '« Ne descends pas après 3 h 33 » : la dernière des règles de Gérard.',
      'Aucun outil ne l\'arrête. La seule issue passe par la vérité sur 1987 — voir [[page:lore|Lore & fragments]] et [[page:fins|Fins]].',
    ],
    counters: [],
    items: ['b13_key', 'music_box', 'bobby_plush', 'cursed_brooch'] },
];

// Effets de costume → texte et présence concernée.
export const COSTUME_EFFECTS = {
  bobby_ignore: { label: 'Bobby vous ignore', ent: 'bobby' },
  bobby_flee: { label: 'Bobby s\'enfuit', ent: 'bobby' },
  shadow_ignore: { label: 'L\'Ombre vous ignore', ent: 'shadow' },
  robbers_hesitate: { label: 'Les braqueurs hésitent', ent: 'robbers' },
  robbers_flee: { label: 'Les braqueurs fuient', ent: 'robbers' },
  fire_resist: { label: 'Résiste au feu', ent: 'fire' },
  smoke_immune: { label: 'Immunisé contre la fumée', ent: 'fire' },
  mannequin_still: { label: 'Ignoré des mannequins (immobile)', ent: 'mannequin' },
  cat_friend: { label: 'Le chat vous suit', ent: 'cat' },
  aggro: { label: 'Agace tout le reste', ent: null },
  muffled: { label: 'Sons étouffés', ent: null },
};

// ───────────────────────── MODE INFINI ─────────────────────────
export const INFINITE = {
  intro: [
    'Le mode infini enchaîne les nuits sans fin. **Tout le centre est ouvert dès la première nuit** — magasins, parking, sous-sol, conduits, toit — et **tous les outils sont disponibles** : caméras, enregistreur, porte, trappe, alarmes, détecteurs, voiture RC…',
    'Les événements aléatoires sont tirés du **catalogue complet ([[v:events]] événements)**, toutes catégories confondues. La difficulté augmente à chaque nuit : plus d\'événements, des présences plus agressives.',
    'Votre **score est le nombre de nuits survécues**.',
  ],
  majors: [
    { title: 'Braquage', text: 'Une bande vise un magasin de valeur. Elle ne vient **pas** si le magasin visé est éclairé ou sous alarme : à vous de lire les caméras du parking et de réagir.' },
    { title: 'Incendie', text: 'Un feu a toujours une **cause** : câblage défectueux, appareil resté allumé (grille-pain, fer à repasser…). Repérez les étincelles, coupez le bon disjoncteur, gardez un extincteur à portée.' },
    { title: 'Coupure de courant', text: 'Le réseau tombe : groupe électrogène, carburant, disjoncteurs. Et dans le noir, l\'Ombre chasse.' },
    { title: 'Présences', text: 'Bobby, les mannequins, le Rampant et l\'Ombre arrivent dans un ordre et avec une intensité tirés au hasard — mais toujours de façon cohérente avec l\'état du centre.' },
  ],
  tips: [
    'Commencez chaque nuit par une tournée des lumières à la console : un centre éclairé décourage braqueurs et Ombre.',
    'Coupez les appareils inutiles : moins de risques d\'incendie.',
    'Gardez un jerrican près du groupe électrogène et des piles dans la poche.',
    'Posez vos détecteurs et caméras portatives dès la première nuit : ils restent en place.',
  ],
};

// ───────────────────────── MULTIJOUEUR ─────────────────────────
export const MULTIPLAYER = {
  intro: [
    'Une version **coopérative** permet de garder Hélios **jusqu\'à 4 gardiens** ensemble. Elle repose sur un petit serveur **Node.js sans aucune dépendance**, fourni dans le dossier `multiplayer/` du dépôt : il sert les fichiers du jeu et relaie les échanges entre joueurs (WebSocket).',
  ],
  steps: [
    'Installez [Node.js](https://nodejs.org/) (version 18 ou plus récente).',
    'À la racine du dépôt, lancez : `node multiplayer/server.js`',
    'Ouvrez **http://localhost:8080** dans votre navigateur.',
    'Créez un salon (mode histoire ou mode infini, mot de passe facultatif) : le jeu affiche un **code de 5 lettres**. Vos amis le saisissent pour vous rejoindre.',
  ],
  hosting: [
    'Pour jouer à distance, hébergez le serveur sur n\'importe quel hébergeur Node : **Render**, **Railway**, **Fly.io** ou un simple **VPS**. Réglages par variables d\'environnement : `PORT` (8080 par défaut), `MAX_PLAYERS` (4 par défaut, de 2 à 8), `SAVES_DIR` (dossier des sauvegardes).',
    'La version du jeu publiée sur GitHub Pages peut aussi se connecter à un serveur distant : indiquez son adresse dans le menu multijoueur (`wss://…` pour un serveur en HTTPS).',
  ],
  rules: [
    '**Jusqu\'à 4 gardiens** par salon (limite réglable côté serveur avec `MAX_PLAYERS`).',
    'Chaque salon a un **code de 5 lettres** (sans I ni O, pour éviter les confusions) et peut être protégé par un mot de passe.',
    'La partie de l\'**hôte fait autorité** : c\'est elle qui simule le monde, les événements et les présences ; le serveur se contente de relayer.',
    'La progression des salons en mode histoire est **sauvegardée sur le serveur** : revenez avec le même code pour reprendre.',
    'Le poste de sécurité et les caméras sont **partagés**.',
    'Chaque joueur a **sa propre lampe, son inventaire et son costume**.',
    'Un joueur mort devient **spectateur** : il peut encore regarder les caméras et discuter.',
    'Le chat textuel ([[key:T]]) est **de proximité**, sauf si vous tenez un [[item:walkie]] ou si vous êtes au poste de sécurité.',
    'La difficulté et la fréquence des événements **augmentent avec le nombre de joueurs**.',
    'Les présences ciblent le joueur **le plus proche ou le plus exposé**.',
  ],
};

// ───────────────────────── EASTER EGGS ─────────────────────────
// hint : visible sans spoilers. text : sous spoiler. Les fonctions reçoivent les données (D).
export const EASTER_EGGS = [
  { hint: 'Pixel Planet · Galaxy Arcade', title: 'Glouton, 10 000 points',
    text: () => 'Atteignez **10 000 points** à Glouton ([[item:cart_glouton|cartouche]] ou [[item:arcade_glouton|borne d\'arcade]]) : un message caché s\'affiche — **« SOUS-SOL B-13 »**. Débloque l\'épilogue [[end:gamer]]. Kevin en parle si vous l\'appelez deux fois.' },
  { hint: 'Optique Clairvoyance', title: 'Le tableau d\'acuité',
    text: (D) => {
      const t = D.ITEMS && D.ITEMS.eye_chart && D.ITEMS.eye_chart.p && D.ITEMS.eye_chart.p.text;
      const last = t ? t.split('\n').filter(Boolean).pop() : '';
      return 'Lisez la toute dernière ligne du [[item:eye_chart]]' + (last ? ' : ' + last : ', tout en bas, en tout petit.');
    } },
  { hint: 'Do Ré Mi Musique', title: '« Au clair de la lune » au piano',
    text: (D) => {
      const s = D.LORE && D.LORE.sheet && D.LORE.sheet.text;
      const m = s && s.match(/Au piano\s*:\s*([^\n]+)/);
      return 'Jouez « Au clair de la lune » sur le [[item:piano]] : **' + (m ? m[1].trim() : 'Q Q Q S D — S — Q D S S Q') + '** (touches de la rangée du milieu, voir la [[item:sheet_music]]). Débloque l\'épilogue [[end:musician]].';
    } },
  { hint: 'Téléphone', title: 'L\'horloge parlante',
    text: () => 'Composez le **[[num:clock]]** : au quatrième top, il sera exactement l\'heure de la nuit.' },
  { hint: 'Téléphone', title: '0 800 BOBBY',
    text: (D) => 'La cassette publicitaire de 1987 donne la hotline de Bobby : **[[num:bobby]]** (B-O-B-B-Y sur un clavier de téléphone).' + quote(D, 'bobby') },
  { hint: 'Téléphone', title: 'Appeler Maman',
    text: (D) => 'Vous connaissez ce numéro par cœur : **[[num:mom]]**.' + quote(D, 'mom') },
  { hint: 'Atrium', title: 'La fontaine',
    text: () => 'Jetez une [[item:coin]] dans la [[item:fountain]] de l\'atrium : faites un vœu.' },
  { hint: 'Déco & Lumières', title: 'Le coucou à 13 coups',
    text: () => 'Le [[item:cuckoo_clock]] de [[shop:deco]] chante à chaque heure. Certaines nuits, il sonne **treize coups**.' },
  { hint: 'Animalerie Arche de Noé', title: 'Coco le perroquet',
    text: () => '[[item:parrot_cage|Coco]] répète la **dernière phrase qu\'il a entendue**. Nourrissez-le de [[item:bird_seed]] et écoutez bien ce qu\'il a retenu des nuits précédentes.' },
  { hint: 'Flash Photo', title: 'Le photomaton',
    text: () => 'Le [[item:photobooth]] prend quatre photos. Parfois, sur la bande, il y a **une silhouette de plus** derrière vous.' },
  { hint: 'Octet Informatique', title: 'La clé USB « NE PAS OUVRIR »',
    text: (D) => 'Branchez la [[item:usb_key]] sur le PC du poste de sécurité : elle contient un fichier, « ' + ((D.LORE && D.LORE.usb && (D.LORE.usb.title.split('«')[1] || '').replace('»', '').trim()) || 'temoignage_marcel.txt') + ' ». Lisez-le.' },
  { hint: 'Pizzeria Napoli', title: 'Une pizza à 3 h du matin',
    text: () => 'Appelez la pizzeria (**[[num:pizza]]**, le numéro est sur le panneau du personnel) : un livreur se présente à l\'entrée du centre.' },
  { hint: 'Fleurs de Lune', title: 'Le bonsaï',
    text: () => 'Le [[item:bonsai]] a 40 ans. Arrosez-le avec l\'[[item:watering_can]] **trois nuits de suite**… et voyez ce qui arrive.' },
  { hint: 'Royaume du Jouet', title: 'La boîte de briques',
    text: () => 'Renversez une [[item:lego]] par terre et marchez dessus. Aïe. (Les [[item:boots]] protègent.)' },
  { hint: 'Optique · Ciné Hélios', title: 'Les lunettes 3D',
    text: () => 'Mettez les [[item:glasses_3d]] : tout le centre passe en relief rouge et cyan.' },
  { hint: 'Pixel Planet', title: 'Le casque VR',
    text: () => 'Le [[item:vr_headset]] vous montre le centre commercial… en mieux ? Ou en pire.' },
  { hint: 'Ciné Hélios', title: 'Rang M, siège 13',
    text: () => 'Le [[item:ticket]] est imprimé pour ce soir, rang M, siège 13 — alors que vous n\'avez rien acheté. À 23 h, le projecteur lance parfois une « séance fantôme »… et quelqu\'un est assis au rang M.' },
  { hint: 'Sous-sol', title: 'Le code 1987',
    text: (D) => 'L\'année où tout a commencé : **1987** est le code de la porte B-13.' + quote(D, 'year', 'Et si vous le composez au téléphone : ') },
];
function quote(D, key, prefix = ' Au bout du fil : ') {
  const l = D.PHONE_EASTER_LINES && D.PHONE_EASTER_LINES[key];
  if (!l || !l.length) return '';
  return prefix + l.map(([who, txt]) => '« ' + txt + ' »').join(' ');
}

// ───────────────────────── FAQ ─────────────────────────
export const FAQ = [
  { q: 'Combien de temps dure une nuit ?', a: [
    'Une nuit va de **22:00 à 06:00** et dure toujours **[[v:nightMinutes]] minutes réelles** (une heure de jeu ≈ [[v:hourReal]]). Il n\'y a pas d\'option pour changer cette durée. Appuyez sur [[key:N]] pour regarder l\'heure.',
  ] },
  { q: 'J\'ai raté une nuit. Je perds tout ?', a: [
    'Non : une nuit ratée **recommence** depuis le début de cette nuit. Vous gardez votre progression.',
  ] },
  { q: 'Le jeu rame. Que régler ?', a: [
    'Dans **Options › Graphismes** : passez la **qualité** sur Basse ou Moyenne (au lieu de Haute), baissez l\'**échelle de rendu**, désactivez les **ombres** puis le **bloom**. Fermez les autres onglets et vérifiez que l\'accélération matérielle du navigateur est activée.',
  ] },
  { q: 'Où sont mes sauvegardes ?', a: [
    'Dans le **localStorage** de votre navigateur, sur **3 emplacements**. Dans **Options**, vous pouvez **exporter** une sauvegarde en fichier JSON et l\'**importer** ailleurs (autre navigateur, autre ordinateur).',
    'Vider les données du site efface les sauvegardes, et une fenêtre de navigation privée les perd à la fermeture : exportez avant !',
  ] },
  { q: 'Les screamers, c\'est trop pour moi.', a: [
    'Désactivez-les dans **Options** : les événements de la catégorie « Screamers » ne seront plus tirés. L\'ambiance reste, les hurlements en gros plan disparaissent.',
  ] },
  { q: 'Le jeu ne démarre pas (écran noir) en local.', a: [
    'Le jeu utilise des modules JavaScript : il ne se lance pas en ouvrant le fichier directement (`file://`). À la racine du dépôt, lancez `python3 -m http.server`, puis ouvrez **http://localhost:8000**. Sur GitHub Pages, il n\'y a rien à faire. Un navigateur récent avec WebGL est nécessaire.',
  ] },
  { q: 'Je n\'entends rien.', a: [
    'Les navigateurs bloquent le son tant que vous n\'avez pas cliqué dans la page : cliquez sur **Jouer**. Tous les sons du jeu sont synthétisés en direct, aucun fichier audio n\'est téléchargé.',
  ] },
  { q: 'Ma lampe s\'éteint tout le temps.', a: [
    'Les piles se vident : appuyez sur [[key:R]] avec des [[item:battery]] dans l\'inventaire. Chaque lampe a sa propre autonomie (voir [[page:costumes|Costumes & lampes]]) ; la [[item:headlamp]] dure le plus longtemps, la [[item:flashlight_tac]] le moins.',
  ] },
  { q: 'Mon détecteur de mouvement sonne pour rien.', a: [
    'C\'est très probablement le chat errant. Nourrissez-le : il restera près de vous plutôt que de se promener devant vos détecteurs.',
  ] },
  { q: 'Les braqueurs ne sont jamais venus.', a: [
    'Bravo : ils renoncent quand le magasin visé ou la galerie est éclairé, ou quand l\'alarme du magasin est armée.',
  ] },
  { q: 'Comment éviter de me faire licencier ?', a: [
    'Ne volez rien sous l\'œil d\'une caméra qui **enregistre**, et ne laissez pas de traces : les [[item:gloves]] évitent les empreintes, un crochetage raté laisse des rayures. {{sp}}La fin « Licencié » tombe dès que la suspicion atteint [[v:suspicion]].{{/sp}}',
  ] },
  { q: 'Peut-on jouer au téléphone ?', a: [
    'Le jeu se joue au clavier et à la souris, sur ordinateur. Ce wiki, lui, se consulte très bien sur téléphone.',
  ] },
  { q: 'Ce wiki contient-il des spoilers ?', a: [
    'Oui, mais ils sont **floutés par défaut** : numéros secrets, textes du lore, conditions des fins, secrets de l\'histoire et easter eggs. Cliquez sur un bloc flouté pour ne révéler que lui, ou activez **Afficher les spoilers** en haut de la page.',
  ] },
];

// ───────────────────────── TÉLÉPHONE : services d'urgence ─────────────────────────
export const EMERGENCY_INFO = {
  police: 'La police arrive en 4 minutes environ. Déverrouillez l\'entrée principale depuis la console pour la laisser entrer.',
  pompiers: 'Les pompiers sont à 5 minutes de la caserne. En attendant : extincteurs et disjoncteurs.',
  samu: 'Pour une blessure grave. En attendant, une trousse de secours fait des merveilles.',
  tri: 'Le numéro d\'urgence européen vous oriente vers le bon service.',
};
export const PHONE_KIND_GROUPS = [
  { id: 'emergency', title: 'Urgences', kinds: ['emergency'] },
  { id: 'postit', title: 'Le post-it du poste', kinds: ['gerard', 'director'] },
  { id: 'staff', title: 'Employés & services', kinds: ['employee', 'pizza', 'self'] },
  { id: 'special', title: 'Numéros spéciaux', kinds: null }, // tout le reste
];

// ───────────────────────── Événements scriptés : traduction des primitives ─────────────────────────
export const SOUND_FR = {
  squeak: 'une peluche couine', giggle: 'un petit rire d\'enfant', knock_triple: 'trois coups frappés', fridge_open: 'une porte de frigo s\'ouvre',
  vent_bang: 'un coup métallique dans les gaines', building_creak: 'la structure craque', water_drip: 'une fuite goutte',
  breathing_heavy: 'une respiration lourde', thud: 'un bruit sourd', wind: 'une rafale', owl: 'une chouette', vent_crawl: 'quelque chose rampe',
};
export const DEVICE_FR = {
  music_box: 'la boîte à musique se met à jouer', kiddie: 'le manège Bobby-Mobile démarre', tv: 'les téléviseurs s\'allument',
  console: 'la console de démo s\'allume', arcade: 'une borne se lance toute seule', vcr: 'le magnétoscope se met en lecture',
  turntable: 'la platine joue un disque', piano: 'le piano joue tout seul', projector: 'le projecteur démarre la séance',
  conveyor: 'le tapis à sushis se met en marche', generator: 'le groupe électrogène démarre', radio: 'une radio s\'allume',
};
export const CALLER_FR = {
  gerard_n1: 'Gérard appelle pour prendre des nouvelles', breath: 'une respiration au bout du fil', gerard: 'Gérard appelle',
  director: 'le directeur appelle', scream: 'un hurlement',
};
export const WHERE_FR = {
  security_door: 'à la porte du poste', vents: 'dans les conduits', behind_player: 'derrière vous', above_player: 'au-dessus de vous',
  security_vent: 'au-dessus du poste', outside: 'dehors', b13: 'derrière la porte B-13', all: 'dans tout le centre',
};
export const ENTITY_ACTIONS_FR = {
  activate: 's\'éveille', spawn: 'arrivent', hunt: 'passe en chasse', awaken: 's\'éveille',
};

// ───────────────────────── Fins : variables des conditions ─────────────────────────
export const COND_VARS = {
  pranks: 'appels abusifs aux secours', suspicion: 'suspicion (indices de vol)', resigned: 'vous avez démissionné',
  fragments: 'fragments de vérité réunis', ritual: 'le rituel est accompli', b13_opened: 'la porte B-13 a été ouverte',
  stolen: 'euros volés', survived: 'les dix nuits survécues', cat_nights: 'nuits où le chat a été nourri',
  played_lune: '« Au clair de la lune » joué au piano', glouton_secret: 'le message caché de Glouton trouvé',
};

// ───────────────────────── Magasins : libellés ─────────────────────────
export const LAYOUTS = {
  aisles: 'Rayonnages', walls: 'Étagères murales', food: 'Comptoir et salle', racks: 'Portants', cases: 'Vitrines',
  arcade: 'Salle d\'arcade', cinema: 'Salle de cinéma', salon: 'Salon', music: 'Instruments', pets: 'Animalerie',
  flowers: 'Étals de fleurs', office: 'Bureau', staff: 'Salle du personnel', toilets: 'Sanitaires', court: 'Espace ouvert',
};
export const DOORS = {
  locked: 'Porte verrouillée (passe-partout du directeur)', keys: 'Porte (trousseau du gardien)', open: 'Porte ouverte',
};
