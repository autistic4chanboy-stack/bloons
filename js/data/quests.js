// Mini-quêtes scriptées du mode histoire : pour chaque nuit, des objectifs ordonnés (parfois à embranchements),
// donnés par Gérard (note, téléphone) ou déclenchés par les événements. Moteur : js/game/quests.js ; bornes de ronde :
// js/world/checkpoints.js. Données pures (le wiki les lit aussi). Les heures sont des heures de jeu ('HH:MM'), les délais
// des minutes de jeu (1 min de jeu ≈ 1,9 s réelle).
//
// Quête : { id, title, giver, optional, maybe (ne compte que si elle a commencé), start, intro, onStart, steps, reward }
//   start : at 'HH:MM' (pas avant) · after 'quête' | 'quête.étape' (résolue), delay (minutes) · on 'déclencheur'
//           · test 'prédicat' · fallback 'HH:MM' (au plus tard, quoi qu'il arrive)
//   intro : { call: répliques, unless: 'drapeau' } (appel au poste) ou { say: [qui, texte] }
// Étape : { id, title, desc, kind, until 'HH:MM' (échec au-delà ; « wait » : réussite), optional, at (cible du suivi),
//           onStart / onDone / onFail (effets), autoDone / autoFail (prédicat), with (démarre avec la précédente),
//           after: 'all' (quand toutes les précédentes sont résolues), fallback 'HH:MM', reward, repeat { every, fx },
//           enter { zone, fx } (un gardien entre dans la zone pendant l'étape) }
//   kind : goto { zone | point, r, stay } · ronde { points, ordered, last (borne à pointer en dernier) } · state { test, arg, count } · flag { flag }
//          items { def, mode: hold | place | shelve, count, zone } · cctv { cams, see, hold, direct } · call { service }
//          answer { caller, lines, retry } · wait · signal { name } · choice { test, arg, branches [{ id, label, test, fx }] }
//   at : 'desk' (bureau du poste) · 'phone' · 'cp:<borne>' · 'zone:<zone>' · 'pt:<point nommé>' · 'rear:<magasin>'
//        · 'dev' (appareil choisi par la quête) · 'fire'
// Effets : say { who, text } · call { lines } · trigger { name, delay } · event { …primitive fx } · flag { k, v }
//          · toast { text } · calm { amount } · scare { amount } · fridge { shop } · tv { shop, msg } · shadowcam { cams, dur }
// Répliques : [qui, texte] ; conditionnelles : ['?done:quête.étape', qui, texte], ['?!done:…', …], ['?flag:k=v', …]
// Récompenses : { coins, items: [...], note: 'texte de Gérard', bonus (prime en €), text }

export const CHECKPOINTS = {
  poste: { name: 'Poste de sécurité', zone: 'security' },
  vestiaire: { name: 'Vestiaire des gardiens', zone: 'vestiaire' },
  galerie_o: { name: 'Galerie ouest', zone: 'gallery0_w' },
  galerie_e: { name: 'Galerie est', zone: 'gallery0_e' },
  hall: { name: 'Hall d\'entrée', zone: 'entrance' },
  jouets: { name: 'Royaume du Jouet', zone: 'jouets', shop: 'jouets' },
  hyper: { name: 'Hypermarché — rayons', zone: 'hyper', shop: 'hyper' },
  hyper_reserve: { name: 'Hypermarché — réserve', zone: 'hyper_back', shop: 'hyper' },
  service_n: { name: 'Couloir de service nord', zone: 'service_n0' },
  service_s: { name: 'Couloir de service sud', zone: 'service_s0' },
  electro: { name: 'ElectroMaison', zone: 'electro', shop: 'electro' },
  pixel: { name: 'Pixel Planet', zone: 'pixel', shop: 'pixel' },
  videoclub: { name: 'Rétro Vidéo Club', zone: 'videoclub', shop: 'videoclub' },
  bijouterie: { name: 'Bijouterie Orfèvre & Fils', zone: 'bijouterie', shop: 'bijouterie' },
  galerie1_o: { name: 'Galerie de l\'étage — ouest', zone: 'gallery1_w' },
  galerie1_e: { name: 'Galerie de l\'étage — est', zone: 'gallery1_e' },
  mode: { name: 'Élégance', zone: 'mode', shop: 'mode' },
  parking_est: { name: 'Parking — pilier est', zone: 'garage' },
  parking_rampe: { name: 'Parking — rampe', zone: 'garage' },
  parking_ouest: { name: 'Parking — pilier ouest', zone: 'garage' },
  soussol: { name: 'Sous-sol — couloir technique', zone: 'westwingB' },
  groupe: { name: 'Local du groupe électrogène', zone: 'generator' },
  electrique: { name: 'Local électrique', zone: 'electrical' },
  regie: { name: 'Régie d\'annonces', zone: 'pa' },
  toit: { name: 'Toit', zone: 'roof' },
  entrepot: { name: 'Entrepôt', zone: 'warehouse' },
};

export const QUESTS = {
  // ───────── Nuit 1 — Le Royaume du Jouet ─────────
  1: [
    { id: 'n1_ronde', title: 'La première ronde', giver: 'Gérard', start: { at: '22:00' },
      intro: { unless: 'tuto', call: [['Gérard', 'Allô, petit ? C\'est Gérard, depuis le parking. J\'ai oublié de te dire : fais ta première ronde maintenant.'], ['Gérard', 'Tu pointes à chaque borne jaune avec E : la galerie, le Royaume du Jouet, le vestiaire, et tu reviens au poste. Desmarais épluche les relevés.']] },
      steps: [
        { id: 'ronde', kind: 'ronde', points: ['galerie_o', 'jouets', 'vestiaire', 'poste'], last: 'poste', until: '01:30',
          title: 'Faire la première ronde', desc: 'Pointez (E) aux bornes jaunes, dans l\'ordre que vous voulez : galerie ouest, Royaume du Jouet (relevez le rideau), vestiaire ; le poste en dernier.' },
      ] },
    { id: 'n1_bruit', title: 'Du bruit au Royaume du Jouet', start: { after: 'n1_ronde', delay: 8, fallback: '23:20' },
      onStart: [{ do: 'trigger', name: 'n1_bruit' }],
      steps: [
        { id: 'voir', kind: 'goto', zone: ['jouets', 'jouets_back'], until: '02:30', title: 'Aller voir ce qui ne va pas',
          desc: 'Un bruit sourd au Royaume du Jouet, puis plus rien. Allez voir, lampe allumée (F).',
          onDone: [{ do: 'trigger', name: 'n1_boite' }, { do: 'event', fx: 'knock', where: 'shop:jouets', n: 1, item: 'ball' }] },
        { id: 'boite', kind: 'choice', test: 'musicbox', arg: 'jouets', at: 'dev', until: '03:30', title: 'Faire taire la boîte à musique',
          desc: 'Elle joue toute seule. Arrêtez-la (R)… ou laissez-la finir, comme le veut la superstition du magasin.',
          branches: [
            { id: 'stop', label: 'L\'arrêter', fx: [{ do: 'flag', k: 'n1_boite', v: 'stop' }, { do: 'event', fx: 'kids_laugh', where: 'shop:jouets' }, { do: 'say', who: 'Voix d\'enfant', text: 'Pourquoi tu l\'as arrêtée ?', voice: false, delay: 2 }] },
            { id: 'finish', label: 'La laisser finir', fx: [{ do: 'flag', k: 'n1_boite', v: 'finish' }, { do: 'calm', amount: 30 }, { do: 'toast', text: 'La mélodie s\'éteint d\'elle-même. Le silence revient, presque apaisant.' }] },
          ] },
        { id: 'retour', kind: 'goto', zone: ['security'], until: '04:00', title: 'Revenir au poste', desc: 'Retournez au poste de sécurité et gardez un œil sur les écrans.' },
      ] },
    { id: 'n1_appel', title: 'L\'appel de Gérard', start: { at: '03:00' },
      steps: [
        { id: 'repondre', kind: 'answer', caller: 'gerard_n1', retry: 1, at: 'phone', until: '04:30', title: 'Répondre au téléphone du poste',
          desc: 'Le téléphone du poste sonne. À cette heure-ci, ça ne peut être que Gérard.',
          lines: [
            ['Gérard', 'Allô, petit ? C\'est Gérard. Je voulais juste savoir si ça allait.'],
            ['?done:n1_ronde.ronde', 'Gérard', 'J\'ai vu passer tes pointages de ronde. Proprement. Desmarais sera content.'],
            ['?!done:n1_ronde.ronde', 'Gérard', 'Tu n\'as pas pointé ta ronde ? Fais attention, Desmarais lit les relevés le matin.'],
            ['?flag:n1_boite=stop', 'Gérard', 'La boîte à musique… tu l\'as arrêtée ? … Bon. La prochaine fois, laisse-la finir. Ne me demande pas pourquoi.'],
            ['?flag:n1_boite=finish', 'Gérard', 'La boîte à musique a joué ? Et tu l\'as laissée finir. Bien. Très bien, petit.'],
            ['Gérard', 'Tu verras, on s\'habitue. Ah, et… ne descends pas au sous-sol après trois heures. Bonne nuit.'],
          ] },
      ] },
    { id: 'n1_casier', title: 'Le casier du nouveau', optional: true, start: { at: '22:00' },
      steps: [
        { id: 'lampe', kind: 'items', def: 'flashlight_spare', mode: 'hold', at: 'cp:vestiaire', until: '05:30', title: 'Récupérer la lampe de votre casier',
          desc: 'Au vestiaire, le casier « VOUS » (R : prendre) : Gérard y a laissé une lampe de rechange.' },
      ],
      reward: { coins: 1, text: 'Au fond du casier, une pièce de 2 € et un mot : « Pour le distributeur. Bienvenue. — G. »' } },
  ],

  // ───────── Nuit 2 — Les rayons ─────────
  2: [
    { id: 'n2_rayons', title: 'Les rayons', giver: 'Gérard', start: { at: '22:00' },
      steps: [
        { id: 'rec', kind: 'state', test: 'rec_on', at: 'desk', until: '00:00', title: 'Lancer l\'enregistrement des caméras',
          desc: 'Gérard a branché l\'enregistreur : console du poste, bouton REC (ou R devant les écrans).' },
        { id: 'ronde', kind: 'ronde', points: ['hyper', 'hyper_reserve', 'service_n', 'poste'], last: 'poste', fallback: '22:30', until: '02:00',
          title: 'Ronde des rayons', desc: 'Bornes de l\'hypermarché (rayons, puis réserve), du couloir de service nord par la porte de la réserve (clés), puis le poste.',
          enter: { zone: ['hyper', 'hyper_back'], fx: [{ do: 'trigger', name: 'n2_hyper' }] } },
      ] },
    { id: 'n2_desordre', title: 'Le désordre des rayons', start: { on: 'n2_hyper', fallback: '22:51' },
      steps: [
        { id: 'ranger', kind: 'items', mode: 'shelve', zone: ['hyper', 'hyper_back'], count: 3, at: 'zone:hyper', until: '03:00',
          title: 'Remettre en rayon les articles tombés', desc: 'Des articles sont tombés des étagères. Ramassez-en trois (E) et reposez-les sur une étagère (G en visant la planche).' },
        { id: 'frigo', kind: 'state', test: 'fridges_closed', arg: 'hyper', fallback: '01:30', at: 'dev', until: '04:00',
          title: 'Refermer le frigo de l\'hypermarché', desc: 'Une porte réfrigérée s\'est ouverte toute seule au rayon frais. Allez la refermer (E).',
          onStart: [{ do: 'trigger', name: 'n2_frigo' }, { do: 'fridge', shop: 'hyper' }] },
      ] },
    { id: 'n2_ombre', title: 'Une silhouette dans les rayons', start: { after: 'n2_rayons.ronde', delay: 15, fallback: '23:40' },
      onStart: [{ do: 'trigger', name: 'n2_ombre' }],
      steps: [
        { id: 'cctv', kind: 'cctv', cams: 'hyper', see: 'shadow', hold: 0.6, at: 'desk', until: '01:30',
          title: 'Surveiller l\'hypermarché sur les caméras', desc: 'Du mouvement entre les rayons. Asseyez-vous au poste et passez sur les caméras de l\'hypermarché.',
          onStart: [{ do: 'shadowcam', cams: 'hyper', dur: 40 }], repeat: { every: 25, fx: [{ do: 'shadowcam', cams: 'hyper', dur: 40 }] },
          onDone: [{ do: 'toast', text: 'La silhouette s\'efface de l\'image. Le chat, sûrement. Sûrement.' }] },
      ] },
    { id: 'n2_caddie', title: 'Le caddie fantôme', optional: true, start: { at: '00:46' },
      steps: [
        { id: 'caddie', kind: 'items', def: 'shopping_cart', mode: 'place', zone: ['hyper'], at: 'dev', until: '05:30',
          title: 'Ramener le caddie à l\'hypermarché', desc: 'Un caddie a roulé tout seul dans la galerie. Poussez-le (E) jusque dans l\'hypermarché.' },
      ],
      reward: { coins: 2, text: 'Deux pièces étaient restées coincées au fond du caddie.' } },
  ],

  // ───────── Nuit 3 — Bobby ─────────
  3: [
    { id: 'n3_detecteurs', title: 'Les détecteurs', giver: 'Gérard', start: { at: '22:00' },
      steps: [
        { id: 'poser', kind: 'state', test: 'sensors_armed', arg: 2, count: 2, at: 'desk', until: '00:30',
          title: 'Poser les deux détecteurs de mouvement', desc: 'Ils sont sur le bureau. Clic gauche en visant une surface : devant le Royaume du Jouet, dans la galerie…' },
      ] },
    { id: 'n3_bobby', title: 'Bobby', start: { at: '22:10' },
      steps: [
        { id: 'cam', kind: 'cctv', cams: 'jouets', see: 'bobby', hold: 0.8, at: 'desk', until: '23:00',
          title: 'Vérifier Bobby sur les caméras', desc: 'Gérard : « si Bobby n\'est plus à l\'entrée du magasin de jouets… ». Vérifiez qu\'il est bien à sa place (caméras du Royaume du Jouet).',
          onDone: [{ do: 'trigger', name: 'n3_bobby', delay: 25 }] },
        { id: 'porte', kind: 'state', test: 'door_closed', on: 'n3_bobby', fallback: '23:00', at: 'desk', until: '01:00',
          title: 'Bobby a disparu : fermer la porte du poste', desc: 'Il n\'est plus à sa place. Bouton PORTE de la console, ou badge de la porte blindée.',
          onStart: [{ do: 'toast', text: 'Sur l\'écran, l\'entrée du Royaume du Jouet est vide.' }] },
        { id: 'retrouver', kind: 'cctv', cams: 'any', see: 'bobby', hold: 0.8, direct: true, at: 'desk', until: '02:30',
          title: 'Le retrouver sur les caméras', desc: 'Repérez où il est passé. Il ne bouge que quand personne ne le regarde.' },
      ] },
    { id: 'n3_bonsoir', title: 'BONSOIR', start: { at: '22:20' },
      steps: [
        { id: 'aller', kind: 'goto', zone: ['electro'], until: '01:00', title: 'Inspecter ElectroMaison',
          desc: 'Le rideau d\'ElectroMaison est déverrouillé ce soir : faites le tour des rayons.',
          onDone: [{ do: 'trigger', name: 'n3_tv' }] },
        { id: 'tele', kind: 'state', test: 'tv_off', at: 'dev', until: '02:00', title: 'Éteindre le téléviseur resté allumé',
          desc: 'Un téléviseur affiche encore « BONSOIR ». Éteignez-le (E).', onStart: [{ do: 'tv', shop: 'electro', msg: 'BONSOIR' }] },
      ] },
    { id: 'n3_miel', title: 'Le miel de Bobby', optional: true, start: { at: '22:00' },
      steps: [
        { id: 'miel', kind: 'items', def: 'honey', mode: 'place', zone: ['gallery0_w', 'atrium', 'gallery0_e'], at: 'zone:hyper', until: '05:30',
          title: 'Poser un pot de miel dans la galerie', desc: 'Gérard : « pense au miel ». Un pot de l\'hypermarché, posé (G) dans la galerie : Bobby s\'y arrêtera.' },
      ],
      reward: { coins: 1 } },
  ],

  // ───────── Nuit 4 — Rétro ─────────
  4: [
    { id: 'n4_ronde', title: 'Ronde rétro', giver: 'Gérard', start: { at: '22:05' },
      steps: [
        { id: 'ronde', kind: 'ronde', points: ['pixel', 'videoclub', 'galerie_e', 'poste'], until: '01:30',
          title: 'Faire la ronde des nouvelles boutiques', desc: 'Bornes de Pixel Planet et du Rétro Vidéo Club, de la galerie est, puis le poste.' },
      ] },
    { id: 'n4_crochet', title: 'Le crochet de serrurier', start: { at: '22:00' },
      steps: [
        { id: 'trouver', kind: 'items', def: 'lockpick', mode: 'hold', at: 'zone:videoclub_back', until: '01:30',
          title: 'Trouver le crochet de serrurier', desc: 'Il traînerait sur le bureau de la réserve du Rétro Vidéo Club.',
          onDone: [{ do: 'trigger', name: 'n4_vhs', delay: 10 }] },
      ] },
    { id: 'n4_vhs', title: 'La cassette sans étiquette', start: { on: 'n4_vhs', fallback: '02:00' },
      steps: [
        { id: 'vhs', kind: 'choice', test: 'vcr', arg: 'videoclub', at: 'dev', until: '04:00',
          title: 'Le magnétoscope s\'est allumé tout seul', desc: 'Gérard : « ne regarde pas les cassettes sans étiquette ». Éteignez le magnétoscope du vidéo-club (E)… ou regardez-la jusqu\'au bout.',
          branches: [
            { id: 'stop', label: 'L\'éteindre sans regarder', fx: [{ do: 'toast', text: 'L\'écran devient noir. Vous avez sûrement bien fait.' }] },
            { id: 'watch', label: 'La regarder jusqu\'au bout', fx: [{ do: 'scare', amount: 25 }, { do: 'toast', text: 'Les dernières images restent imprimées derrière vos paupières.' }] },
          ] },
      ] },
    { id: 'n4_casier', title: 'Le casier de Gérard', optional: true, start: { after: 'n4_crochet.trouver' },
      steps: [
        { id: 'casier', kind: 'state', test: 'locker_open', arg: 'GÉRARD', at: 'cp:vestiaire', until: '05:30',
          title: 'Crocheter le casier de Gérard', desc: 'Au vestiaire, le casier « GÉRARD » est fermé à clé. Le crochet en poche : R.' },
      ],
      reward: { note: 'Si tu lis ça, c\'est que tu as trouvé le crochet de Rémi. Je ne t\'en veux pas : j\'ai fait pareil avec le casier de Marcel, en 1993. Il n\'y avait qu\'une chose dedans : une photo de lui et d\'une petite fille en robe jaune, devant la fontaine. Je l\'ai gardée. — G.' } },
  ],

  // ───────── Nuit 5 — Les mannequins ─────────
  5: [
    { id: 'n5_mannequins', title: 'Compter les mannequins', giver: 'Gérard', start: { at: '22:00' },
      steps: [
        { id: 'compter', kind: 'goto', zone: ['mode'], stay: 3, until: '00:30', title: 'Compter les mannequins d\'Élégance',
          desc: 'L\'étage est ouvert (escalators, ascenseur). Allez chez Élégance et comptez les mannequins.',
          onDone: [{ do: 'trigger', name: 'n5_mq' }, { do: 'toast', text: 'Un, deux, trois… Il en manque un. Il en manquait un ?' }] },
        { id: 'lumiere', kind: 'state', test: 'lit', arg: 'mode', at: 'desk', until: '02:00',
          title: 'Il en manque un : allumer la lumière d\'Élégance', desc: 'Interrupteur du magasin ou console du poste. Gérard : « ils détestent la lumière ».' },
      ] },
    { id: 'n5_piano', title: 'Au clair de la lune', start: { after: 'n5_mannequins', delay: 30, fallback: '01:00' },
      onStart: [{ do: 'trigger', name: 'n5_piano' }],
      steps: [
        { id: 'aller', kind: 'goto', zone: ['instruments'], until: '03:00', title: 'Aller voir qui joue du piano',
          desc: 'Quelques notes résonnent à l\'étage, au Do Ré Mi Musique.' },
        { id: 'jouer', kind: 'flag', flag: 'played_lune', optional: true, at: 'zone:instruments', until: '05:30',
          title: 'Jouer « Au clair de la lune » au piano', desc: 'De mémoire, ou avec la partition de la librairie : Q Q Q S D, S, Q D S S Q.' },
      ] },
    { id: 'n5_rc', title: 'La voiture télécommandée', optional: true, start: { at: '22:00' },
      steps: [
        { id: 'monter', kind: 'state', test: 'rc_cam', at: 'desk', until: '05:30', title: 'Fixer la caméra portative sur la voiture',
          desc: 'Posez la voiture (clic gauche), puis caméra en main : R sur la voiture.' },
        { id: 'piloter', kind: 'state', test: 'rc_in', arg: 'atrium', at: 'zone:atrium', until: '05:30', title: 'Piloter la voiture jusqu\'à l\'atrium',
          desc: 'Onglet RC de la console, ou télécommande en main (clic gauche).' },
      ],
      reward: { coins: 1 } },
    { id: 'n5_cassette', title: 'La cassette de Gérard', optional: true, start: { at: '22:00' },
      steps: [
        { id: 'regarder', kind: 'flag', flag: 'frag_vhs_gerard', at: 'zone:videoclub', until: '05:30', title: 'Regarder la cassette de Gérard',
          desc: 'Elle est sur le bureau. Il faut un magnétoscope : le Rétro Vidéo Club en a un.' },
      ] },
  ],

  // ───────── Nuit 6 — Braquage ─────────
  6: [
    { id: 'n6_bijouterie', title: 'Protéger la bijouterie', giver: 'Gérard', start: { at: '22:00' },
      steps: [
        { id: 'proteger', kind: 'choice', at: 'desk', until: '01:20', title: 'Protéger la bijouterie',
          desc: 'Gérard : les braqueurs détestent la lumière et les alarmes. Armez l\'alarme de la bijouterie (console), ou laissez le magasin éclairé.',
          branches: [{ id: 'alarme', label: 'Armer son alarme', test: 'alarm', arg: 'bijouterie' }, { id: 'lumiere', label: 'La laisser éclairée', test: 'lit', arg: 'bijouterie' }] },
        { id: 'cadenas', kind: 'state', test: 'padlock', arg: 'bijouterie', optional: true, with: true, at: 'rear:bijouterie', until: '01:20', reward: { coins: 1 },
          title: 'Cadenasser la porte de service de la bijouterie', desc: 'Cadenas sur le bureau. La porte donne sur le couloir de service nord : clic gauche en visant la porte fermée.' },
      ] },
    { id: 'n6_parking', title: 'Le parking souterrain', start: { after: 'n6_bijouterie.proteger', delay: 5, fallback: '23:00' },
      steps: [
        { id: 'ronde', kind: 'ronde', points: ['parking_est', 'parking_rampe', 'parking_ouest'], until: '01:15',
          title: 'Ronde du parking souterrain', desc: 'Par l\'escalier est (porte du hall) ou l\'ascenseur. Bornes du pilier est, de la rampe et du pilier ouest.' },
      ] },
    { id: 'n6_braquage', title: 'Le braquage', maybe: true, start: { test: 'robbery_arriving' },
      steps: [
        { id: 'reperer', kind: 'cctv', cams: 'any', see: 'robber', hold: 0.5, direct: true, autoDone: 'robbery_aborted', at: 'desk', until: '05:30',
          title: 'Repérer les braqueurs sur les caméras', desc: 'Un moteur dans le parking. Regardez les caméras du parking et de la bijouterie.' },
        { id: 'police', kind: 'call', service: 'police', with: true, autoDone: 'robbery_aborted', at: 'phone', until: '05:30',
          title: 'Appeler la police (17)', desc: 'Téléphone du poste : 17, « Intrusion / cambriolage en cours ». Ne jouez pas au héros.' },
      ] },
  ],

  // ───────── Nuit 7 — Incendie ─────────
  7: [
    { id: 'n7_soussol', title: 'Le sous-sol technique', giver: 'Gérard', start: { at: '22:00' },
      steps: [
        { id: 'ronde', kind: 'ronde', points: ['soussol', 'groupe', 'electrique', 'regie'], until: '00:45',
          title: 'Ronde du sous-sol technique', desc: 'Porte arrière du poste (clés), escalier de service ouest, tout en bas : couloir technique, groupe électrogène, local électrique, régie.',
          onDone: [{ do: 'trigger', name: 'n7_sparks', delay: 12 }] },
      ] },
    { id: 'n7_etincelles', title: 'Ça sent le brûlé', start: { on: 'n7_sparks', fallback: '00:20' },
      steps: [
        { id: 'origine', kind: 'goto', zone: ['electro'], point: 'electroFire', r: 6, autoDone: 'breaker_off:electro', until: '01:15',
          title: 'Trouver l\'origine des étincelles', desc: 'Ça grésille chez ElectroMaison : le présentoir des grille-pains.' },
        { id: 'disjoncteur', kind: 'state', test: 'breaker_off', arg: 'electro', with: true, autoFail: 'fire_started', at: 'pt:breakers', until: '01:15',
          title: 'Couper le disjoncteur « ElectroMaison »', desc: 'Tableau électrique, local du milieu au sous-sol. Avant que ça prenne feu.' },
      ] },
    { id: 'n7_incendie', title: 'Incendie !', maybe: true, start: { test: 'fire_started' },
      steps: [
        { id: 'appel', kind: 'call', service: 'pompiers', at: 'phone', autoDone: 'fire_out', until: '05:30', title: 'Appeler les pompiers (18)',
          desc: 'Téléphone du poste : 18, « Incendie ». L\'alarme incendie prévient aussi les secours toute seule.' },
        { id: 'eteindre', kind: 'state', test: 'fire_out', with: true, at: 'fire', until: '05:59', title: 'Maîtriser l\'incendie',
          desc: 'Extincteur (clic gauche maintenu), disjoncteur coupé pour qu\'il cesse de grossir… ou évacuez et laissez faire les pompiers.' },
      ] },
    { id: 'n7_regie', title: 'La régie d\'annonces', optional: true, start: { after: 'n7_soussol' },
      steps: [
        { id: 'annonce', kind: 'signal', name: 'pa', at: 'cp:regie', until: '05:30', title: 'Faire une annonce au micro',
          desc: 'À la régie du sous-sol, ou depuis la console du poste. Pour rassurer les vivants. Ou les autres.' },
      ],
      reward: { coins: 1 } },
  ],

  // ───────── Nuit 8 — Dans les murs ─────────
  8: [
    { id: 'n8_trappe', title: 'La trappe blindée', giver: 'Gérard', start: { at: '22:00' },
      steps: [
        { id: 'tester', kind: 'state', test: 'hatch_closed', at: 'desk', until: '23:30', title: 'Tester la trappe blindée (TRAPPE)',
          desc: 'Console du poste : bouton TRAPPE. Elle bloque le conduit au-dessus du bureau.', onDone: [{ do: 'trigger', name: 'n8_proj', delay: 15 }] },
        { id: 'scotch', kind: 'state', test: 'grate_taped', with: true, at: 'zone:westwing0', until: '03:00', title: 'Sceller une grille d\'aération au scotch',
          desc: 'Le rouleau est sur le bureau : clic gauche en visant une grille (réserves du rez-de-chaussée, aile ouest).' },
      ] },
    { id: 'n8_seance', title: 'La séance fantôme', start: { on: 'n8_proj', fallback: '23:01' },
      steps: [
        { id: 'projecteur', kind: 'state', test: 'projector_off', hold: 'projector', at: 'dev', until: '02:00', title: 'Arrêter le projecteur du cinéma',
          desc: 'Le projecteur du Ciné Hélios s\'est lancé tout seul, à l\'étage. Cabine de projection : E.' },
        { id: 'rangm', kind: 'goto', point: 'rowM13', r: 1.3, optional: true, with: true, until: '04:00', title: 'Vérifier le rang M, siège 13',
          desc: 'Lucas, le projectionniste : « personne ne s\'y assoit jamais ».' },
      ] },
    { id: 'n8_conduits', title: 'Ça rampe', start: { at: '23:30' },
      steps: [
        { id: 'cam', kind: 'cctv', cams: 'vents', see: 'crawler', hold: 0.5, direct: true, at: 'desk', until: '03:00',
          title: 'Repérer la chose dans les conduits', desc: 'Les caméras des conduits sont reliées au poste. Quelque chose y rampe.' },
        { id: 'trappe', kind: 'state', test: 'hatch_closed', fallback: '03:10', at: 'desk', until: '04:30',
          title: 'Ça gratte au-dessus du poste : fermer la trappe', desc: 'Tout de suite.',
          onStart: [{ do: 'trigger', name: 'n8_bang' }, { do: 'event', fx: 'sound', sound: 'scratch', where: 'security_vent', count: 3 }] },
      ] },
    { id: 'n8_coco', title: 'Coco', optional: true, start: { at: '22:00' },
      steps: [
        { id: 'nourrir', kind: 'state', test: 'parrot_fed', at: 'zone:animalerie', until: '05:30', title: 'Nourrir Coco le perroquet',
          desc: 'Animalerie, au rez-de-chaussée : des graines pour oiseaux, puis E devant sa cage. Il répète des choses… intéressantes.' },
      ] },
  ],

  // ───────── Nuit 9 — L'obscurité ─────────
  9: [
    { id: 'n9_panne', title: 'Préparer la panne', giver: 'Gérard', start: { at: '22:00' },
      steps: [
        { id: 'plein', kind: 'state', test: 'gen_fuel', arg: 12, at: 'pt:generator', until: '01:50', title: 'Faire le plein du groupe électrogène',
          desc: 'Le jerrican est sur le bureau. Sous-sol, local du groupe : E en le tenant.' },
        { id: 'cams', kind: 'state', test: 'portable_cams', arg: 2, count: 2, with: true, at: 'desk', until: '02:00', title: 'Poser deux caméras portatives',
          desc: 'Sur le bureau. Posez-les (clic gauche) là où il n\'y a pas de caméra : elles s\'ajoutent au système CCTV.' },
      ] },
    { id: 'n9_toit', title: 'Le toit et l\'entrepôt', start: { after: 'n9_panne.plein', delay: 5, fallback: '23:00' },
      steps: [
        { id: 'ronde', kind: 'ronde', points: ['toit', 'entrepot', 'poste'], until: '01:50', title: 'Ronde du toit et de l\'entrepôt',
          desc: 'L\'orage gronde. Toit par l\'escalier de service ouest (porte du haut, clés), entrepôt par l\'aile ouest. Puis le poste.' },
      ] },
    { id: 'n9_noir', title: 'Panne générale', start: { at: '02:00' },
      steps: [
        { id: 'groupe', kind: 'state', test: 'gen_running', at: 'pt:generator', until: '03:00', title: 'Démarrer le groupe électrogène',
          desc: 'Tout est noir. Sous-sol, local du groupe : tirez plusieurs fois sur le démarreur (E).' },
        { id: 'tenir', kind: 'wait', with: true, until: '03:00', title: 'Rester dans la lumière jusqu\'à 3 h',
          desc: 'L\'Ombre chasse. Restez dans les zones éclairées, lampe allumée.' },
      ] },
    { id: 'n9_chat', title: 'Le chat de l\'entrepôt', optional: true, start: { at: '22:00' },
      steps: [
        { id: 'nourrir', kind: 'flag', flag: 'cat_fed_tonight', at: 'cp:entrepot', until: '05:59', title: 'Nourrir le chat errant',
          desc: 'Il dort dans l\'entrepôt. Des croquettes (hypermarché, animalerie) posées par terre (clic gauche) : il viendra.' },
      ] },
  ],

  // ───────── Nuit 10 — B-13 ─────────
  10: [
    { id: 'n10_ronde', title: 'La dernière ronde', giver: 'Gérard', start: { at: '22:00' },
      steps: [
        { id: 'ronde', kind: 'ronde', points: ['hall', 'galerie1_e', 'mode', 'jouets', 'poste'], until: '03:00',
          title: 'Faire la dernière ronde', desc: 'Tout le centre est sous votre garde : hall, galerie de l\'étage, Élégance, Royaume du Jouet, et le poste.' },
      ] },
    { id: 'n10_gateau', title: 'Joyeux anniversaire', optional: true, start: { at: '22:06' },
      steps: [
        { id: 'souffler', kind: 'state', test: 'cake_blown', at: 'zone:boulangerie', until: '05:30', title: 'Souffler les bougies d\'un gâteau d\'anniversaire',
          desc: 'Le centre fête ses 37 ans. Boulangerie Au Bon Grain : prenez un gâteau, clic gauche.' },
      ] },
    { id: 'n10_lucie', title: 'Ce qui lui appartient', optional: true, start: { at: '22:00' },
      steps: [
        { id: 'broche', kind: 'items', def: 'cursed_brooch', mode: 'hold', at: 'zone:bijouterie', until: '05:59', title: 'Récupérer la broche de Lucie',
          desc: 'Une petite broche en forme de lune, gravée « L.M. ». Vitrine de la bijouterie (crochet ou passe-partout).' },
        { id: 'peluche', kind: 'items', def: 'bobby_plush', mode: 'hold', with: true, at: 'zone:jouets', until: '05:59', title: 'Prendre une peluche Bobby',
          desc: 'Au Royaume du Jouet.' },
        { id: 'boite', kind: 'items', def: 'music_box', mode: 'hold', with: true, at: 'zone:jouets', until: '05:59', title: 'Prendre une boîte à musique',
          desc: 'Elle aimait la musique.' },
        { id: 'porte', kind: 'flag', flag: 'b13_opened', with: true, at: 'pt:b13', until: '05:59', title: 'Ouvrir la porte B-13',
          desc: 'Sous-sol, couloir technique : un clavier à code. Gérard : « l\'année où tout a commencé ».' },
        { id: 'rituel', kind: 'flag', flag: 'ritual', after: 'all', at: 'pt:b13Altar', until: '05:59', title: 'Lui rendre ce qui lui appartient',
          desc: 'Dans B-13, devant la petite table : la broche, la peluche, et la boîte à musique qui joue. Il faut avoir réuni les cinq fragments de vérité.' },
      ] },
    { id: 'n10_333', title: '3 h 33', start: { at: '03:20' },
      steps: [
        { id: 'poste', kind: 'goto', zone: ['security'], until: '03:33', title: 'Revenir au poste avant 3 h 33', desc: 'Quelque chose se réveille sous le centre.' },
        { id: 'survivre', kind: 'wait', fallback: '03:33', autoDone: 'flag:ritual', until: '06:00', title: 'Survivre jusqu\'à l\'aube',
          desc: 'La Chose de B-13 force les portes et les rideaux. La lumière la ralentit. Ne vous laissez pas acculer.' },
      ] },
  ],
};

// Mode infini : un seul objectif générique par nuit, une ronde de bornes tirées au hasard (points : nombre de bornes).
export const INFINITE_QUEST = {
  id: 'inf_ronde', title: 'Ronde de nuit', optional: true, start: { at: '22:30' }, points: 4,
  steps: [{ id: 'ronde', kind: 'ronde', until: '04:00', title: 'Faire la ronde de nuit', desc: 'Pointez (E) aux bornes indiquées, dans l\'ordre que vous voulez.' }],
  reward: { coins: 2, items: ['battery'], text: 'Ronde complète : prime de ronde versée en pièces, et des piles neuves.' },
};

// Touches (rappel pour le HUD et le wiki)
export const QUEST_KEYS = { journal: 'J', hud: 'H' };
