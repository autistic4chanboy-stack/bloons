// Lore du Centre Commercial Hélios : textes des livres, notes, journaux, fragments de vérité.
//
// L'HISTOIRE (spoilers) — Le centre Hélios a été inauguré le 14 novembre 1987. Pendant la fête d'inauguration,
// une coupure de courant plonge le centre dans le noir. Lucie Marchand, 8 ans, qui suivait Bobby l'Ourson (la mascotte
// du Royaume du Jouet, jouée par Marcel, le frère de Gérard), disparaît. On retrouve seulement le costume de Bobby, vide,
// au sous-sol, devant la porte du local B-13. Le local est muré « par sécurité ». Marcel est accusé, puis relâché faute
// de preuves ; il disparaît à son tour quelques années plus tard, pendant une garde de nuit.
// Depuis, le centre « garde » ce qu'il aime. Les mannequins bougent, le costume de Bobby marche seul, une ombre rôde,
// quelque chose rampe dans les conduits. Gérard, gardien de nuit depuis 25 ans, a appris les règles pour survivre.
// La vérité : Lucie s'est cachée dans B-13 pendant la coupure pour jouer à cache-cache avec Bobby. La porte s'est
// refermée. Personne ne l'a entendue. Sa broche (L.M.) a été retrouvée plus tard et revendue à la bijouterie.
// Pour la libérer (vraie fin) : réunir les 5 fragments, puis, la 10e nuit, ouvrir B-13 (code 1987) et y déposer
// la broche, la peluche Bobby et faire jouer la boîte à musique.

export const FRAGMENTS = [
  { id: 'vhs_security_1987', name: 'Cassette « CCTV 14/11/87 »', how: 'Regarder la cassette dans un magnétoscope.' },
  { id: 'old_newspaper', name: 'Le vieux journal de 1987', how: 'Le lire (Tabac-Presse).' },
  { id: 'vhs_gerard', name: 'La cassette de Gérard', how: 'La regarder (elle apparaît dans le poste la 5e nuit).' },
  { id: 'album', name: 'L\'album photo du centre', how: 'Le lire (Flash Photo).' },
  { id: 'cursed_brooch', name: 'La broche de Lucie', how: 'La trouver (Bijouterie) et l\'examiner.' },
];

export const LORE = {
  news1987: { title: 'L\'Écho du Soir — 16 novembre 1987', text:
    'DRAME À L\'INAUGURATION DU CENTRE HÉLIOS\n\nLa petite Lucie M., 8 ans, a disparu samedi soir pendant la fête d\'ouverture du nouveau centre commercial. ' +
    'Selon les témoins, l\'enfant suivait la mascotte du magasin de jouets lorsqu\'une panne générale a plongé le bâtiment dans le noir pendant près d\'une heure.\n\n' +
    'Seul le costume de la mascotte a été retrouvé, vide, au deuxième sous-sol technique. L\'employé qui le portait, M. Marcel R., a été entendu par les enquêteurs.\n\n' +
    'La direction annonce que « certaines zones techniques seront définitivement condamnées ». Les recherches continuent.' },
  book_gardien: { title: 'Le Gardien — roman (extrait)', text:
    'Chapitre 13.\n\nIl comprit trop tard que ce n\'était pas lui qui gardait le bâtiment. C\'était le bâtiment qui le gardait.\n\n' +
    'Les règles étaient simples, écrites au feutre sur un post-it jauni :\n1. Garde les lumières allumées là où tu ne peux pas regarder.\n2. Ne laisse jamais la porte ouverte quand l\'ours n\'est plus à sa place.\n3. Si les mannequins se sont rapprochés, ne cligne pas des yeux.\n4. Quand ça gratte au-dessus, ferme la trappe.\n5. Ne descends pas après 3 h 33.' },
  book_cook: { title: 'Cuisine facile — Recette du chocolat chaud de minuit', text:
    'Faites chauffer le lait sans le faire bouillir. Ajoutez deux carrés de chocolat noir, une pincée de sel.\n\nNote manuscrite dans la marge : « Gérard le fait avec la machine du poste, touche R. Ça calme. »' },
  book_bobby: { title: 'Bobby et la Lune — album jeunesse', text:
    'Bobby l\'Ourson aimait trois choses : le miel, les comptines, et jouer à cache-cache avec ses amis.\n\n« Un, deux, trois… Je vais te trouver ! » disait Bobby.\n\nMais cette nuit-là, la Lune s\'éteignit, et Bobby chercha, chercha, chercha…\n\n(Les dernières pages ont été arrachées.)' },
  book_history: { title: 'Histoire de la ville — chapitre « Le Centre Hélios »', text:
    'Construit sur l\'emplacement de l\'ancienne usine électrique Lumière (fermée en 1971), le Centre Commercial Hélios ouvre ses portes le 14 novembre 1987.\n\n' +
    'Avec ses 33 boutiques sur deux niveaux, son atrium à verrière et sa fontaine, il était alors le plus grand centre de la région.\n\nLes anciens ouvriers de l\'usine disaient que le sous-sol « ne dormait jamais ».' },
  book_electric: { title: 'Manuel d\'électricité — chapitre 7 : Disjoncteurs', text:
    'Un appareil qui crépite, une odeur de plastique chaud, des étincelles : coupez IMMÉDIATEMENT le disjoncteur du circuit concerné au tableau général.\n\n' +
    'Un court-circuit non traité peut provoquer un départ de feu en moins d\'une heure. Ne jamais utiliser d\'eau sur un feu électrique : utilisez un extincteur à CO2.' },
  book_cats: { title: 'Le Langage des chats', text:
    'Un chat qui feule, dos rond et poils hérissés, a perçu une menace que vous ne voyez pas encore.\n\nUn chat errant nourri plusieurs jours de suite au même endroit finit par vous accorder sa confiance… et vous suivra partout.' },
  book_poetry: { title: 'Poèmes nocturnes', text:
    'Sous la verrière, la lune pâle\nCompte les pas dans la galerie,\nEt les vitrines, l\'une après l\'autre,\nRetiennent leur souffle à l\'infini.\n\nÀ trois heures trente-trois, mon cœur,\nLe sous-sol chante une berceuse :\n« Au clair de la lune », dit-on,\nMais la lune, ici, est menteuse.' },
  comic: { title: 'BD « Super Hélio » n°12', text:
    'Super Hélio, le héros du centre commercial, affronte le terrible Docteur Néon qui veut éteindre toutes les lumières de la ville !\n\n« Tant qu\'il y aura de la lumière, il y aura de l\'espoir ! »' },
  citymap: { title: 'Plan de la ville', text:
    'Le centre Hélios est entouré au crayon rouge. Une note : « Commissariat : 4 min en voiture. Caserne : 5 min. »' },
  sheet: { title: 'Partition — « Au clair de la lune »', text:
    'Do Do Do Ré Mi — Ré — Do Mi Ré Ré Do\n\nAu piano : Q Q Q S D — S — Q D S S Q\n\nQuelqu\'un a écrit dessous : « Elle aimait quand on la jouait. Joue-la pour elle. »' },
  frame: { title: 'Cadre photo', text:
    'Une photo de l\'équipe du centre en 1987, devant la fontaine. Au premier rang, un homme en costume d\'ours tient la main d\'une petite fille.\nAu dos : « Marcel & Lucie — inauguration ».' },
  album: { title: 'Album photo du Centre Hélios (1987-2024)', text:
    'Page 1 — 14/11/1987, coupure du ruban. Au fond, Bobby l\'Ourson et une petite fille à la robe jaune.\n' +
    'Page 2 — même soir, 21h40. Le centre dans le noir. Sur la photo prise au flash, une silhouette d\'enfant devant une porte métallique marquée « B-13 ».\n' +
    'Page 7 — 1995, Gérard reçoit la médaille du meilleur gardien.\n' +
    'Dernière page — une photo de VOUS, prise cette semaine, de nuit, depuis l\'intérieur d\'un conduit d\'aération.' },
  usb: { title: 'Clé USB — fichier « temoignage_marcel.txt »', text:
    'Je n\'ai rien fait. Elle voulait jouer à cache-cache. J\'ai compté jusqu\'à vingt, les lumières se sont éteintes. ' +
    'Je l\'ai entendue rire, en bas, près des locaux techniques. Après, plus rien. Quand la lumière est revenue, la porte du B-13 était fermée et je n\'avais plus la clé. ' +
    'Ils ont muré la porte le lendemain. Je l\'entends encore, la nuit. Elle fredonne « Au clair de la lune ». Gérard, si tu lis ça, pardonne-moi.' },
  noticeboard: { title: 'Panneau d\'affichage du personnel', text:
    '• RAPPEL : les gardiens de nuit ne doivent PAS descendre au sous-sol après 3h00 (consigne de M. Desmarais).\n' +
    '• Cherche colocataire — Sandrine (boulangerie) : 06 21 43 65 87\n' +
    '• Vends scooter — Jean-Mi (quincaillerie) : 06 33 18 70 42\n' +
    '• Pizzeria Napoli — commandes : 01 47 70 12 34\n' +
    '• Dr Morel, pharmacie de garde : 01 45 22 98 10\n' +
    '• Électricien (urgences) — M. Dubois : 01 80 11 22 33\n' +
    '• Objet trouvé : une boîte à musique. Personne ne l\'a réclamée depuis 1987.\n' +
    '• Ligne directe du poste de sécurité : 01 40 19 87 00' },
  gerard_note: { title: 'Note de Gérard', text: '(Le texte dépend de la nuit.)' },
  page: { title: 'Page déchirée du registre des gardiens', text:
    '03/02/1998 — 3h33. Le costume n\'est plus dans la vitrine. Porte fermée, il a tapé jusqu\'à 4h.\n' +
    '17/08/2004 — Les mannequins de l\'étage regardaient tous vers l\'escalator ce matin.\n' +
    '29/10/2013 — Bruits dans les gaines. J\'ai fermé la trappe. Ça a griffé.\n' +
    '12/01/2021 — Le chat est revenu. Il feule toujours vers le sous-sol.' },
  brooch: { title: 'Broche ancienne', text:
    'Une petite broche en forme de lune, gravée au dos : « L.M. — 14.11.1987 ». Elle est froide, beaucoup plus froide qu\'elle ne devrait.\n\nEn la tenant, vous entendez — très loin — une comptine.' },
};

// Notes de Gérard laissées sur le bureau, une par nuit (mode histoire).
export const GERARD_NOTES = {
  1: 'Bienvenue petit ! Les règles : reste au chaud au poste, regarde les écrans, fais une ronde de temps en temps. Lampe : touche F. Le téléphone : les numéros sont sur le post-it. Et ne descends jamais au sous-sol après 3h. — Gérard',
  2: 'Ils ont ouvert l\'hypermarché à la surveillance : 3 caméras de plus. J\'ai branché l\'enregistreur (bouton REC sur la console). Si tu vois des articles par terre… c\'est sûrement le chat. Sûrement. — G.',
  3: 'Deux détecteurs de mouvement dans le tiroir du bureau. Pose-les où tu veux. Et, petit… si Bobby n\'est plus à l\'entrée du magasin de jouets, ferme la porte du poste (bouton PORTE). Il n\'aime pas les portes fermées. — G.',
  4: 'Kevin du Pixel Planet a encore oublié sa console allumée. Le vidéo-club est sous surveillance aussi maintenant. Ne regarde pas les cassettes sans étiquette. Je suis sérieux. — G.',
  5: 'L\'étage est ouvert. Les mannequins de chez Élégance… compte-les en arrivant. Si un manque, garde la lumière du magasin allumée : ils détestent la lumière. Je t\'ai laissé la voiture télécommandée du magasin de jouets avec une caméra dessus. Et une vieille cassette pour toi. Regarde-la seul. — G.',
  6: 'La police tourne dans le quartier : une bande vise les bijouteries. Des cadenas dans le tiroir. Tu peux armer l\'alarme d\'un magasin depuis la console. Les cambrioleurs détestent la lumière et les alarmes… Si tu les vois, appelle le 17. Ne joue pas au héros. — G.',
  7: 'L\'électricien est passé chez ElectroMaison, il dit que le câblage du présentoir est pourri. Le sous-sol est accessible : groupe électrogène, tableau électrique, régie d\'annonces. Si ça sent le brûlé : 18, extincteurs, disjoncteur. — G.',
  8: 'Les gaines d\'aération passent au-dessus du poste. J\'ai installé une trappe blindée (bouton TRAPPE). Si ça gratte au plafond, ferme-la. Tout l\'étage restauration et le cinéma sont surveillés maintenant. — G.',
  9: 'Le réseau électrique de la ville est instable cette nuit. Garde un œil sur le carburant du groupe. Trois caméras portatives dans le placard. L\'ombre… elle ne supporte pas la lumière. Reste dans la lumière, petit. Toujours. — G.',
  10: 'Dernière nuit, petit. Demain je reviens… ou pas. Si tu as trouvé ce que je pense, la porte B-13 s\'ouvre avec l\'année où tout a commencé. Rends-lui ce qui lui appartient. Elle aimait la musique. — Gérard',
};
