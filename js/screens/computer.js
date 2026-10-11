// Ordinateurs « HÉLIOS-DOS 3.1 » : démarrage BIOS, menus (flèches / Entrée / chiffres, Retour arrière pour revenir),
// visionneuse de texte, courriel, invite de commandes (avec fichiers protégés par mot de passe), calculatrice,
// jeux intégrés et économiseur d'écran. Le contenu dépend de la machine : poste de sécurité ou boutique (opts.shop).
import { drawText, textWidth, wrap } from './font.js';
import { rect, frame, hash, clamp } from './util.js';
import { createGame, highScore, GAMES } from './games.js';
import { VHS_TAPES } from './vhs.js';

const W = 256, H = 192, COLS = 40, ROWS = 14, TOP = 30;
const C = {
  bg: '#0000a8', text: '#c8c8ff', hi: '#ffffff', title: '#ffff55', bar: '#a8a8a8', barText: '#000000',
  sel: '#00a8a8', selText: '#000000', dim: '#6c6cd8', alert: '#ff5555', ok: '#55ff55',
};
const OS = 'HÉLIOS-DOS 3.1';
const GAME_HINT = { demineur: 'ESPACE : DÉCOUVRIR  F : DRAPEAU', snake: 'FLÈCHES : DIRIGER' };

export const COMPUTERS = [
  { id: 'security', title: 'Ordinateur du poste de sécurité' },
  { id: 'shop', title: 'Ordinateur de boutique' },
];

const SHOP_NAMES = {
  hyper: 'HYPERMARCHÉ HÉLIOS', pharma: 'PHARMACIE DU CENTRE', boulangerie: 'AU BON GRAIN', fleuriste: 'FLEURS DE LUNE',
  quincaillerie: 'QUINCAILLERIE MARTIN', animalerie: 'ARCHE DE NOÉ', bijouterie: 'ORFÈVRE & FILS', tabac: 'LE BALTO',
  cafe: 'LE PETIT NOIR', jouets: 'ROYAUME DU JOUET', electro: 'ELECTROMAISON', pixel: 'PIXEL PLANET', videoclub: 'RÉTRO VIDÉO CLUB',
  librairie: 'LIBRAIRIE LA PAGE', mobizone: 'MOBIZONE', opticien: 'OPTIQUE CLAIRVOYANCE', parfumerie: 'PARFUMERIE ESSENCE',
  mode: 'ÉLÉGANCE', chaussures: 'PAS DE DEUX', sport: 'HÉLIOS SPORT', instruments: 'DO RÉ MI MUSIQUE', costumes: 'MILLE MASQUES',
  coiffeur: 'SALON TIF\'HAIR', photo: 'FLASH PHOTO', deco: 'DÉCO & LUMIÈRES', arcade: 'GALAXY ARCADE', pizzeria: 'PIZZERIA NAPOLI',
  burger: 'BIG BURGER', sushi: 'SUSHI ZEN', cinema: 'CINÉ HÉLIOS', glacier: 'GLACIER BANQUISE', bonbons: 'LA BONBONNIÈRE',
  octet: 'OCTET INFORMATIQUE', direction: 'DIRECTION', staff: 'SALLE DU PERSONNEL', security: 'POSTE DE SÉCURITÉ',
};
function shopKey(s) {
  s = String(s || '').toLowerCase();
  if (!s) return '';
  if (SHOP_NAMES[s]) return s;
  for (const k of Object.keys(SHOP_NAMES)) if (s.includes(k)) return k;
  return s.replace(/[^a-z0-9]/g, '');
}

// ───────────────────────── Vues ─────────────────────────
const menu = (title, items) => ({ type: 'menu', title, items, sel: 0 });
const text = (title, body, o = {}) => ({ type: 'text', title, lines: wrap(body, COLS), top: 0, ...o });
const pages = (title, list) => ({ type: 'pages', title, pages: list.map((p) => wrap(p, COLS)), page: 0, top: 0 });
const mailbox = (title, mails) => ({ type: 'mail', title, mails, sel: 0 });
const game = (id, title) => ({ type: 'game', id, title, game: null });
const calc = () => ({ type: 'calc', title: 'CALCULATRICE', disp: '0', acc: null, op: null, fresh: true, sel: 0 });
const prompt = (files, motd) => ({ type: 'prompt', title: 'INVITE DE COMMANDES', files, lines: motd ? wrap(motd, COLS) : [], input: '', hist: [], hi: -1, pass: null });

const mail = (from, subj, date, body, o = {}) => ({ from, subj, date, body, read: false, ...o });
function mailText(m) { return 'De : ' + m.from + '\nDate : ' + m.date + '\nObjet : ' + m.subj + '\n' + '-'.repeat(COLS) + '\n' + m.body; }

// ───────────────────────── Contenus : poste de sécurité ─────────────────────────
const RULES = 'RÈGLES DU POSTE (recopiées par Gérard)\n\n1. La lumière est ton amie.\n2. Ne laisse jamais Bobby entrer. Ferme la porte s\'il n\'est plus à sa place.\n3. Regarde les mannequins. Compte-les.\n4. Le chat sait. Écoute-le.\n5. Quand ça gratte au plafond, ferme la trappe.\n6. Ne descends pas au sous-sol après 3 h.';
function incidents(night) {
  return 'JOURNAL DES INCIDENTS — CENTRE HÉLIOS\n\n' +
    '14/11/1987 20h47 — Inauguration. Coupure générale de 54 minutes. Disparition d\'une enfant, Lucie M., 8 ans. Recherches toute la nuit avec la police.\n\n' +
    '14/11/1987 21h41 — Retour du courant. Le costume de la mascotte (Bobby) est retrouvé vide au sous-sol B, devant le local B-13.\n\n' +
    '16/11/1987 — Local B-13 muré sur ordre de la direction.\n\n' +
    '13/11/1993 — Le gardien de nuit Marcel R. ne s\'est pas présenté à la relève. Porté disparu.\n\n' +
    '03/02/1998 03h33 — Costume Bobby absent de sa vitrine. Coups contre la porte du poste jusqu\'à 4 h. Costume retrouvé à sa place à 6 h.\n\n' +
    '17/08/2004 02h10 — Mannequins déplacés chez Élégance (étage) : tous tournés vers l\'escalator.\n\n' +
    '22/12/2009 01h47 — L\'éclairage de la galerie clignote sans raison. Électricien : rien à signaler.\n\n' +
    '29/10/2013 03h12 — Griffures dans les gaines d\'aération au-dessus du poste. Trappe fermée.\n\n' +
    '12/01/2021 23h58 — Le chat errant est revenu. Il feule vers l\'escalier du sous-sol.\n\n' +
    '05/06/2023 04h02 — La boîte à musique des objets trouvés joue seule : « Au clair de la lune ».\n\n' +
    'Nuit ' + night + ' — Prise de poste du nouveau gardien. Gérard R. part à la retraite.';
}
function securityDef(S) {
  const ctx = S.ctx || {};
  const night = clamp(Number(ctx.night) || 1, 1, 10);
  const flags = ctx.flags || {};
  const notes = (Array.isArray(S.opts.notes) ? S.opts.notes : []).filter((n) => typeof n === 'string' && n.trim());
  const mails = [
    mail('M. Desmarais (Direction)', 'Restrictions budgétaires', '02/11', 'Suite au dernier conseil d\'administration, le budget de la sécurité est réduit de 40 %.\n\nÀ compter de ce mois :\n- un seul gardien de nuit ;\n- les caméras défectueuses ne seront pas remplacées ;\n- limitez la consommation électrique : éteignez ce qui ne sert pas.\n\nJe compte sur votre sens des responsabilités.\n\nM. Desmarais, directeur du Centre Hélios'),
    mail('M. Desmarais (Direction)', 'Arrivée du nouveau gardien', '08/11', 'Gérard part à la retraite après 25 ans de service. Son remplaçant prend son poste cette semaine. Merci de lui laisser les consignes et les clés.\n\nRappel : aucune ronde au sous-sol après 3 h. Le local B-13 ne fait pas partie du périmètre de surveillance.'),
    mail('Gérard R.', 'Pour toi, petit', '10/11', 'Je t\'ai laissé une note sur le bureau pour chaque nuit. Lis-les.\n\nMon numéro est sur le post-it. Appelle si ça ne va pas, même tard.\n\nSi ça gratte dans les murs, ce n\'est pas le chat. Enfin, pas toujours.\n\nEt si tu entends une comptine au sous-sol… ne la chante pas avec elle.\n\nG.'),
    mail('Dubois Électricité', 'Intervention ElectroMaison', '11/11', 'Monsieur,\n\nLors de mon passage chez ElectroMaison, j\'ai constaté que le présentoir des grille-pains fait des étincelles : le câblage est cuit.\n\nEn cas d\'odeur de brûlé ou de fumée, coupez immédiatement le disjoncteur « ElectroMaison » au tableau général du sous-sol.\n\nJe peux intervenir en urgence, de jour comme de nuit.\n\nCordialement,\nM. Dubois — Dubois Électricité\nTél. : 01 80 11 22 33', { discover: { kind: 'number', id: '0180112233' } }),
    mail('Service technique', 'Tablette de surveillance', '12/11', 'La tablette CCTV est livrée au poste. Pour voir les caméras partout dans le centre, appairez-la avec ce PC : tenez-la en main et utilisez l\'ordinateur (E).'),
  ];
  if (night >= 6 || flags.cursed_tape) mails.push(mail('(inconnu)', '(sans objet)', '14/11/1987', 'Tu restes avec moi ?'));
  const planning = 'CENTRE COMMERCIAL HÉLIOS — SÉCURITÉ\nSemaine 46 — Gardien de nuit : VOUS\nNuit n° ' + night + ' / 10\n\n22h00  Prise de poste, lecture des consignes\n23h00  Ronde rez-de-chaussée (vitrines, rideaux)\n00h30  Ronde étage et parking\n02h00  Contrôle du groupe électrogène\n03h00  NE PLUS DESCENDRE AU SOUS-SOL\n04h30  Ronde rez-de-chaussée\n06h00  Fin de service, relève de l\'équipe de jour\n\nGérard R. : retraité. « Appelle-moi si besoin. »';
  const tablet = () => 'TABLETTE DE SURVEILLANCE\n\nBranchez la tablette en la tenant et appuyez sur E sur le PC pour l\'appairer.\n\nUne fois appairée : clic gauche en la tenant pour afficher les caméras, où que vous soyez dans le centre.\n\nÉtat : ' + ((S.ctx && S.ctx.flags && S.ctx.flags.tabletLinked) ? 'APPAIRÉE ✓' : 'NON APPAIRÉE');
  const files = {
    'NOTES.TXT': { text: notes.length ? notes.join('\n\n') : 'Fichier vide.' },
    'REGLES.TXT': { text: RULES },
    'JOURNAL.LOG': { text: incidents(night) },
    'B13.TXT': { text: 'NOTE DE SERVICE — 16/11/1987 (copie)\n\nLe local technique B-13 (sous-sol B, couloir du groupe électrogène) est muré ce jour sur ordre de la direction. Les recherches sont closes. Ne communiquer aucun détail à la presse.\n\nCode d\'origine de la porte : l\'année de l\'inauguration.', pass: '1987', lore: 'pc_security_b13' },
  };
  return {
    title: 'Ordinateur du poste de sécurité', label: 'POSTE DE SÉCURITÉ',
    root: menu('MENU PRINCIPAL', [
      ['Notes de Gérard', () => pages('NOTES DE GÉRARD', notes.length ? notes : ['Aucune note pour le moment.'])],
      ['Journal des incidents', () => { S.emit?.('discover', { kind: 'lore', id: 'pc_incidents' }); return text('JOURNAL DES INCIDENTS', incidents(night)); }],
      ['Courriel', () => mailbox('COURRIEL', mails)],
      ['Planning', () => text('PLANNING DES GARDES', planning)],
      ['Démineur', () => game('demineur', 'DÉMINEUR')],
      ['Tablette', () => text('TABLETTE', tablet())],
      ['Invite de commandes', () => prompt(files, OS + '. Tapez AIDE pour la liste des commandes.')],
    ]),
  };
}

// ───────────────────────── Contenus : boutiques ─────────────────────────
function recordsText() {
  let t = 'TABLEAU DES RECORDS — GALAXY ARCADE\n\n';
  for (const g of GAMES) {
    if (g.id === 'claw') continue;
    const h = highScore(g.id), name = g.title.toUpperCase();
    t += name + ' ' + '.'.repeat(Math.max(2, 26 - name.length - String(h.score).length)) + ' ' + h.score + ' ' + h.name + '\n';
  }
  return t + '\nLA LÉGENDE : personne n\'a jamais atteint 10 000 points à GLOUTON. Il paraît qu\'à 10 000, la machine affiche un message. Kevin y croit dur comme fer.';
}
function rentals() {
  let t = 'BASE DES LOCATIONS\n\n';
  let n = 0;
  VHS_TAPES.forEach((v, i) => {
    if (v.id === 'gerard' || v.id === 'security_1987') return;
    const ref = 'V' + String(++n).padStart(2, '0');
    if (v.id === 'no_label') t += '\n' + ref + ' (sans étiquette)\n    LOUÉE le 14/11/1987, client n° 0813.\n    JAMAIS RENDUE DEPUIS 1987.\n    Remarque : retrouvée en rayon chaque matin. NE PAS LOUER.\n';
    else { const title = v.title.length > 24 ? v.title.slice(0, 23) + '…' : v.title; t += ref + ' ' + title.padEnd(25) + (hash(i * 7) > 0.7 ? 'LOUÉE' : 'DISPO') + '\n'; }
  });
  return t;
}
const PROMPT_MOTD = OS + '. Tapez AIDE pour la liste des commandes.';
function shopDef(S, rawShop) {
  const k = shopKey(rawShop);
  const label = SHOP_NAMES[k] || (k ? k.toUpperCase().slice(0, 18) : 'BOUTIQUE');
  const def = (title, items, files = {}) => ({ title, label, root: menu(label + ' — MENU', [...items, ['Invite de commandes', () => prompt(files, PROMPT_MOTD)]]) });
  const lore = (id) => S.emit?.('discover', { kind: 'lore', id });
  switch (k) {
    case 'pixel': {
      const mails = [
        mail('Kevin', 'GLOUTON !!!', '09/11', 'Tonio, j\'ai encore raté les 10 000 à Glouton. 9 870 points. J\'étais à DEUX fantômes, mec.\n\nIl paraît qu\'à 10 000 la machine affiche un message caché. Le vieux Gérard dit que ce sont des bêtises, mais il change de sujet à chaque fois.\n\nPasse demain avec ta manette, on retente.\n\n--\nKevin — Pixel Planet, votre boutique de jeux vidéo\nPerso : 06 12 48 33 90 (pas après minuit !)', { discover: { kind: 'number', id: '0612483390' } }),
        mail('Famicube France', 'Livraison n° 4471', '06/11', 'Bonjour,\n\nVotre commande est partie : 12 x « Turbo Hélios », 8 x « Blocs », 6 x « Glouton », 4 x « Envahisseurs ».\n\nRappel : les consoles de démonstration doivent être éteintes la nuit (risque de marquage des écrans).'),
        mail('M. Desmarais (Direction)', 'Console allumée la nuit', '10/11', 'Kevin,\n\nLe gardien me signale que votre console de démonstration reste allumée toute la nuit. Merci de l\'éteindre en partant.\n\nM. Desmarais'),
      ];
      return def('Ordinateur de Pixel Planet', [
        ['Courriel', () => mailbox('COURRIEL DE KEVIN', mails)],
        ['Records des bornes', () => text('RECORDS', recordsText())],
        ['Stock jeux vidéo', () => text('STOCK', 'CONSOLES\nFamicube ........... 3\nHyperdrive ......... 2\nPlayBox ............ 1\nPocketBoy .......... 5\n\nCARTOUCHES\nGlouton ............ 6\nEnvahisseurs ....... 4\nBlocs .............. 8\nTurbo Hélios ...... 12\nSuper Gardien ...... 3\nSerpent ............ 5\nSimon .............. 2\nDémineur ........... 4\nL\'Oiseau ........... 3\nCasse-Briques ...... 4\n\nFIGURINES : édition limitée. « NE PAS TOUCHER. — Kevin »')],
        ['Démo : Serpent', () => game('snake', 'SERPENT')],
      ], { 'RECORDS.TXT': { text: recordsText() }, 'KEVIN.TXT': { text: 'Liste de courses : piles LR6, chips, manette neuve (celle-là colle).\n\nNe pas oublier : 10 000 À GLOUTON. CETTE SEMAINE.' } });
    }
    case 'direction': {
      const mails = [
        mail('Mairie — Service des fêtes', '37 ans du centre', '04/11', 'Monsieur le directeur,\n\nLa mairie organisera une cérémonie pour les 37 ans du Centre Hélios, le 14 novembre.\n\nMerci d\'éviter toute allusion à l\'incident de 1987 dans les discours.'),
        mail('Bureau d\'études Fabre', 'Local B-13', '05/11', 'Monsieur,\n\nNous vous rappelons que le local technique B-13 du sous-sol B a été muré par sécurité en novembre 1987, sur décision de la direction de l\'époque. Aucune intervention n\'est autorisée.\n\nNB : nos relevés indiquent une température anormalement basse derrière la cloison (4 °C), et un bruit que nous n\'avons pas su identifier.\n\nIng. Fabre', { lore: 'pc_direction_b13' }),
        mail('M. Desmarais', 'Pense-bête', '07/11', 'Code du coffre : l\'anniversaire de ma fille, 14/11.\nNe l\'écrire nulle part ailleurs.\n\n(Oui, le même jour que l\'inauguration. Je sais.)'),
        mail('Gérard R.', 'Ma retraite', '08/11', 'Monsieur le directeur,\n\nAprès vingt-cinq ans de nuits, je vous rends mes clés.\n\nUne dernière chose, et je sais ce que vous en pensez : ne faites jamais rouvrir le B-13. Et laissez une lumière allumée au Royaume du Jouet.\n\nGérard'),
        mail('Mutuelle Commerciale', 'Sinistres', '09/11', 'Suite aux tentatives de cambriolage dans la zone, nous vous rappelons que l\'indemnisation est conditionnée au déclenchement des alarmes et à l\'appel immédiat des forces de l\'ordre (17).'),
      ];
      return def('Ordinateur du directeur', [
        ['Courriel', () => mailbox('COURRIEL DE LA DIRECTION', mails)],
        ['Fichier du personnel', () => text('PERSONNEL — SÉCURITÉ', 'FICHIER DU PERSONNEL — SÉCURITÉ\n\nMarcel R. — Animateur (mascotte Bobby) en 1987, puis gardien de nuit de 1988 à 1993. Disparu en service le 13/11/1993. Dossier classé.\n\nGérard R. — Gardien de nuit de 1999 à 2024. Frère de Marcel R. Retraité.\n\nVous — Gardien de nuit depuis cette semaine. Période d\'essai : 10 nuits.')],
        ['Agenda', () => text('AGENDA', 'AGENDA DE M. DESMARAIS\n\nLundi    — Conseil d\'administration (budget sécurité)\nMercredi — Visite des pompiers (extincteurs)\n14/11    — 37 ans du centre : cérémonie, discours\n14/11    — Anniversaire de Claire ! (ne pas oublier le cadeau)')],
        ['Finances', () => text('FINANCES', 'BUDGET ANNUEL — CENTRE HÉLIOS\n\nLoyers perçus .......... en baisse\nÉlectricité ............ en hausse\nSécurité ............... -40 %\nAssurances ............. en hausse\n\nConclusion du cabinet : « Le centre perd des clients. Les gens disent qu\'il s\'y passe des choses la nuit. »')],
      ], {
        'DISCOURS.DOC': { text: 'Mesdames et messieurs, il y a 37 ans, le Centre Hélios ouvrait ses portes… (Ne surtout pas parler de 1987. Enfin, de ce qui s\'est passé en 1987.)' },
        'B13.DOC': { text: 'ARCHIVES — 16/11/1987\n\nLe local B-13 sera muré ce jour. Les recherches sont terminées.\n\nOrdre de ne communiquer aucun détail à la presse. Le costume de la mascotte est remis au Royaume du Jouet, en réserve.\n\nLa Direction', pass: '1987', lore: 'pc_direction_archive' },
        'COFFRE.TXT': { text: '(fichier supprimé)' },
      });
    }
    case 'videoclub': {
      const mails = [mail('Nanou (gérante)', 'La cassette', '07/11', 'Quelqu\'un remet la cassette sans étiquette en rayon tous les soirs. Ce n\'est pas drôle.\n\nJe l\'ai jetée trois fois. Elle revient toujours.\n\nNanou')];
      return def('Ordinateur du vidéo-club', [
        ['Base des locations', () => { lore('pc_videoclub_tape'); return text('BASE DES LOCATIONS', rentals()); }],
        ['Clients en retard', () => text('CLIENTS EN RETARD', 'CLIENTS EN RETARD\n\n0102  M. Lambert  « Planète Rouge »     12 j\n0347  Mme Roux    « Gym Tonic Matin »    3 j\n0519  M. Petit    « Le Poing du Dragon » 5 j\n0813  ???         « (sans étiquette) »\n      13 513 jours de retard.\n\nRemarque : aucune adresse pour le client 0813. Le dossier ne contient qu\'un dessin d\'enfant.')],
        ['Courriel', () => mailbox('COURRIEL', mails)],
      ]);
    }
    case 'jouets': {
      const mails = [
        mail('Mme Lefèvre', 'Le costume', '09/11', 'Le costume de Bobby a encore changé de place cette nuit. Je l\'avais rangé dans la réserve, il était devant la vitrine ce matin.\n\nLes caméras n\'ont rien filmé.\n\nMme Lefèvre'),
        mail('Jouets & Cie (fournisseur)', 'Réassort peluches', '05/11', 'Votre réassort de 24 peluches Bobby (petit modèle) sera livré lundi. Les peluches géantes sont en rupture.'),
      ];
      return def('Ordinateur du Royaume du Jouet', [
        ['Inventaire', () => { lore('pc_jouets_costume'); return text('INVENTAIRE', 'INVENTAIRE — ROYAUME DU JOUET\n\nPeluche Bobby (petite) ......... 24\nPeluche Bobby (géante) .......... 2\nRobot Zorg ...................... 6\nVoiture télécommandée ........... 3\nPoupée Clémentine ............... 8\nToupie musicale ................. 5\nBoîte à musique « Au clair de la lune » : 1 (objets trouvés, 1987)\n\nCostume Bobby (1987) — réserve — NE PAS UTILISER'); }],
        ['Ventes', () => text('VENTES', 'HISTORIQUE DES VENTES\n\nAujourd\'hui ......... 64 tickets\nHier ................ 71 tickets\n\nArchive — 14/11/1987 : 1 peluche Bobby (non payée).')],
        ['Courriel', () => mailbox('COURRIEL', mails)],
      ]);
    }
    case 'bijouterie': {
      const mails = [mail('Commissariat central', 'Vigilance cambriolages', '06/11', 'Une bande organisée vise les bijouteries de la région. Vérifiez vos alarmes, ne laissez pas de stock en vitrine la nuit, et composez le 17 au moindre doute.')];
      return def('Ordinateur de la bijouterie', [
        ['Stock', () => { lore('pc_bijouterie_broche'); return text('STOCK', 'STOCK — BIJOUTERIE ORFÈVRE & FILS\n\nBague solitaire or 18 ct ..... 2 400 €\nCollier perles de culture .... 1 150 €\nMontre Hélios Chrono ........... 890 €\nBoucles d\'oreilles saphir ...... 640 €\nGourmette argent ............... 180 €\n\nBroche ancienne gravée L.M. — achetée en 1994 (rachat à un particulier). Invendable : trois clients l\'ont rapportée. « Elle est froide. »'); }],
        ['Courriel', () => mailbox('COURRIEL', mails)],
        ['Calculatrice', () => calc()],
      ]);
    }
    case 'pharma':
      return def('Ordinateur de la pharmacie', [
        ['Stock', () => text('STOCK', 'STOCK — PHARMACIE DU CENTRE\n\nParacétamol 500 mg ....... 48 boîtes\nSomnifères ....... armoire fermée (ordonnance)\nPansements ............... 30\nPastilles pour la gorge .. 22\nCrème pour les mains ..... 12\n\n« Le gardien de nuit vient souvent chercher du paracétamol. Pas plus de trois par nuit. » — Dr Morel')],
        ['Pharmacies de garde', () => { S.emit?.('discover', { kind: 'number', id: '0145229810' }); return text('GARDES', 'PHARMACIE DE GARDE CETTE SEMAINE\n\nDr Morel — 01 45 22 98 10\n\nEn cas d\'urgence vitale : 15 (SAMU).'); }],
        ['Calculatrice', () => calc()],
      ]);
    case 'electro':
      return def('Ordinateur d\'ElectroMaison', [
        ['Rappel produits', () => { S.emit?.('discover', { kind: 'number', id: '0180112233' }); return text('RAPPEL PRODUIT', 'RAPPEL PRODUIT — GRILLE-PAIN TOASTMATIC 2000\n\nRisque de surchauffe et d\'étincelles. Retirer immédiatement du présentoir.\n\nUnités rapportées : 14 / 30.\n\nPrésentoir grille-pains : câblage à refaire. Intervention de M. Dubois (Dubois Électricité, 01 80 11 22 33).'); }],
        ['Stock', () => text('STOCK', 'STOCK — ELECTROMAISON\n\nTéléviseur couleur 51 cm ....... 6\nMagnétoscope VHS ............... 4\nRadio-réveil ................... 9\nFour à micro-ondes ............. 3\nAspirateur ..................... 5\nGrille-pain Toastmatic 2000 .... RETIRÉ')],
        ['Calculatrice', () => calc()],
      ]);
    case 'octet':
      return def('PC de démonstration', [
        ['Présentation', () => text('OCTET 286', 'OCTET 286 — LE PC DE DEMAIN, DÈS AUJOURD\'HUI !\n\nProcesseur 80286 à 12 MHz\nMémoire vive : 640 Ko\nDisque dur : 20 Mo\nÉcran couleur 16 couleurs\nLecteur de disquettes 3"1/2\n\n9 990 F (ou 10 mensualités de 999 F)\n\nDemandez une démonstration à notre vendeur !')],
        ['Démineur', () => game('demineur', 'DÉMINEUR')],
        ['Serpent', () => game('snake', 'SERPENT')],
        ['Calculatrice', () => calc()],
      ], { 'LISEZMOI.TXT': { text: 'Merci de ne pas éteindre le PC de démonstration. Merci de ne pas jouer au Démineur pendant 3 heures. — La direction d\'Octet' } });
    default: {
      const r = (i) => (((hash(i * 31 + k.length * 7) * 900) | 0) + 100);
      return def('Ordinateur de boutique', [
        ['Stock', () => text('STOCK', 'STOCK — ' + label + '\n\nArticles en rayon ........ ' + r(1) + '\nArticles en réserve ...... ' + r(2) + '\nCommandes en attente ..... ' + (r(3) % 12) + '\nRuptures ................. ' + (r(4) % 7) + '\n\nInventaire annuel : à faire avant le 31/12.')],
        ['Caisse', () => text('JOURNAL DE CAISSE', 'JOURNAL DE CAISSE — ' + label + '\n\nTickets du jour ......... ' + (r(5) % 90 + 20) + '\nChiffre d\'affaires ...... ' + r(6) + ',' + String(r(7) % 100).padStart(2, '0') + ' €\nFond de caisse .......... 150,00 €\n\nTiroir verrouillé. Code gérant requis.')],
        ['Calculatrice', () => calc()],
      ]);
    }
  }
}

// ───────────────────────── Invite de commandes ─────────────────────────
function runCommand(S, os, v, line) {
  const out = (t) => { for (const l of wrap(t, COLS)) v.lines.push(l); };
  if (v.pass) {
    const f = v.pass; v.pass = null;
    v.lines.push('Mot de passe : ' + '*'.repeat(line.length));
    if (line.trim().toUpperCase() === f.pass) { out(f.text); if (f.lore) S.emit?.('discover', { kind: 'lore', id: f.lore }); }
    else out('Mot de passe incorrect.');
    return;
  }
  v.lines.push('C:\\> ' + line);
  const [cmd = '', ...args] = line.trim().split(/\s+/);
  const arg = args.join(' ').toUpperCase();
  const find = (n) => { const key = Object.keys(v.files).find((f) => f === n || f.split('.')[0] === n); return key ? [key, v.files[key]] : null; };
  switch (cmd.toUpperCase()) {
    case '': break;
    case 'AIDE': case 'HELP': case '?': out('DIR       liste des fichiers\nTYPE x    affiche un fichier\nCLS       efface l\'écran\nVER       version du système\nDATE      date du système\nHEURE     heure actuelle\nMENU      retour au menu'); break;
    case 'DIR': case 'LS': {
      out(' Volume dans le lecteur C : HELIOS');
      const names = Object.keys(v.files);
      for (const n of names) { const [b, e = ''] = n.split('.'); out(' ' + b.padEnd(9) + e.padEnd(4) + String((v.files[n].text.length * 7) % 9000 + 300).padStart(6) + '  14-11-87'); }
      out(' ' + names.length + ' fichier(s)    ' + (20480 - names.length * 97) + ' Ko libres');
      break;
    }
    case 'TYPE': case 'CAT': case 'LIRE': {
      if (!arg) { out('Syntaxe : TYPE <fichier>'); break; }
      const f = find(arg);
      if (!f) { out('Fichier introuvable : ' + arg); break; }
      if (f[1].pass) { v.pass = f[1]; out('Fichier protégé.'); break; }
      out(f[1].text);
      if (f[1].lore) S.emit?.('discover', { kind: 'lore', id: f[1].lore });
      break;
    }
    case 'CLS': v.lines = []; break;
    case 'VER': out(OS + ' (C) 1986-1991 Hélios Informatique'); break;
    case 'DATE': out('Date système : samedi 14-11-1987'); out('(La pile de l\'horloge est morte depuis longtemps.)'); break;
    case 'HEURE': case 'TIME': out('Heure : ' + S.time()); break;
    case 'MENU': case 'EXIT': case 'QUITTER': case 'QUIT': os.back(); break;
    case 'DEL': case 'ERASE': case 'FORMAT': case 'RM': out('Accès refusé.'); break;
    case 'CD': out('Répertoire inexistant.'); break;
    case 'B13': case 'B-13': out('ACCÈS REFUSÉ. LOCAL MURÉ LE 16-11-1987.'); break;
    case 'LUCIE': out('Fichier introuvable.'); out('… elle n\'est pas ici.'); break;
    case 'BOBBY': out('Bobby t\'attend.'); break;
    case 'GLOUTON': out('Programme absent. Essayez une borne de la Galaxy Arcade.'); break;
    case 'WIN': case 'WINDOWS': out('Commande inconnue. Nous sommes en 1987.'); break;
    default: out('Commande ou nom de fichier incorrect.');
  }
}

// ───────────────────────── Calculatrice ─────────────────────────
const CALC_KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+', 'C', '±', '%', '←'];
function calcFmt(n) {
  if (!isFinite(n)) return 'ERREUR';
  let s = String(+n.toPrecision(10));
  if (s.length > 12) s = n.toExponential(5);
  return s;
}
function calcPress(v, k) {
  if (v.disp === 'ERREUR' && k !== 'C') v.disp = '0';
  if (/^[0-9]$/.test(k)) { if (v.fresh) { v.disp = k; v.fresh = false; } else if (v.disp.length < 12) v.disp = v.disp === '0' ? k : v.disp + k; }
  else if (k === '.') { if (v.fresh) { v.disp = '0.'; v.fresh = false; } else if (!v.disp.includes('.')) v.disp += '.'; }
  else if (k === 'C') { v.disp = '0'; v.acc = null; v.op = null; v.fresh = true; }
  else if (k === '±') { if (v.disp !== '0') v.disp = v.disp.startsWith('-') ? v.disp.slice(1) : '-' + v.disp; }
  else if (k === '%') { v.disp = calcFmt(parseFloat(v.disp) / 100); v.fresh = true; }
  else if (k === '←') { if (!v.fresh) v.disp = v.disp.length > 1 ? v.disp.slice(0, -1) : '0'; }
  else {
    const cur = parseFloat(v.disp);
    const ap = (a, b, op) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : b === 0 ? NaN : a / b);
    if (v.op && !v.fresh) { v.acc = ap(v.acc, cur, v.op); v.disp = calcFmt(v.acc); }
    else if (!v.op || v.acc === null) v.acc = cur;
    v.op = k === '=' ? null : k; v.fresh = true;
    if (k === '=') v.acc = null;
  }
}

// ───────────────────────── Système ─────────────────────────
const BOOT = 3.2;
export function buildComputer(S, id) {
  let def;
  if (id === 'security') def = securityDef(S);
  else def = shopDef(S, S.opts.shop || (id && id !== 'shop' ? id : ''));
  const st = { phase: 'boot', bootT: 0, stack: [def.root], idle: 0, saver: false };
  const top = () => st.stack[st.stack.length - 1];
  const os = {
    push(v) { if (v) st.stack.push(v); },
    back() {
      if (st.stack.length <= 1) return;
      const v = st.stack.pop();
      if (v.type === 'game' && v.game) v.game = null;
    },
  };
  const open = (item) => {
    try { os.push(item[1]()); } catch (e) { os.push(text('ERREUR', 'Erreur de lecture du disque. Abandonner, Réessayer, Ignorer ?')); }
  };

  function chrome(g, title, hint) {
    rect(g, 0, 0, W, H, C.bg);
    rect(g, 0, 0, W, 11, C.bar);
    const head = (OS + ' · ' + def.label);
    drawText(g, head.length > 35 ? head.slice(0, 35) : head, 3, 2, C.barText);
    drawText(g, S.time(), W - 3, 2, C.barText, 1, 'right');
    drawText(g, title.length > 40 ? title.slice(0, 40) : title, 8, 16, C.title);
    rect(g, 6, 26, W - 12, 1, C.dim);
    rect(g, 0, H - 11, W, 11, C.bar);
    drawText(g, hint, 3, H - 9, C.barText);
  }
  function drawLines(g, lines, topLine, x = 8) {
    for (let i = 0; i < ROWS; i++) { const l = lines[topLine + i]; if (l !== undefined) drawText(g, l, x, TOP + i * 10, C.text); }
    if (lines.length > ROWS) {
      const n = Math.max(1, lines.length - ROWS);
      rect(g, W - 6, TOP, 2, ROWS * 10, '#2020c0');
      rect(g, W - 7, TOP + Math.round((topLine / n) * (ROWS * 10 - 10)), 4, 10, C.hi);
    }
  }
  function drawBoot(g) {
    rect(g, 0, 0, W, H, '#000');
    const t = st.bootT;
    const L = [];
    L.push('HÉLIOS BIOS v1.07 (C) 1986');
    if (t > 0.3) L.push('Processeur 80286 - 12 MHz');
    if (t > 0.5) { const m = Math.floor(clamp((t - 0.5) / 0.9, 0, 1) * 640); L.push('Test mémoire : ' + String(m).padStart(3) + ' Ko' + (m >= 640 ? ' OK' : '')); }
    if (t > 1.5) L.push('Lecteur A: 1,44 Mo   Disque C: 20 Mo');
    if (t > 1.9) L.push('');
    if (t > 2.0) L.push('Chargement de ' + OS + '...');
    if (t > 2.6) L.push('C:\\> MENU');
    L.forEach((l, i) => drawText(g, l, 6, 8 + i * 11, i === 0 ? '#fff' : '#bbb'));
    if ((S.t * 3 | 0) % 2) rect(g, 6, 10 + L.length * 11, 6, 2, '#bbb');
    rect(g, W - 46, 6, 40, 30, '#000'); frame(g, W - 46, 6, 40, 30, '#555');
    drawText(g, 'H', W - 26, 12, '#ffd23a', 2, 'center');
  }
  function drawSaver(g) {
    rect(g, 0, 0, W, H, '#000');
    for (let i = 0; i < 50; i++) {
      const z = ((S.t * 0.4 + hash(i)) % 1), a = hash(i * 3) * Math.PI * 2, r = z * z * 170;
      const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r * 0.75;
      g.fillStyle = z > 0.6 ? '#fff' : '#778'; g.fillRect(x | 0, y | 0, z > 0.8 ? 2 : 1, z > 0.8 ? 2 : 1);
    }
    const tw = textWidth('HÉLIOS-DOS', 2), px = Math.abs(((S.t * 23) % ((W - tw) * 2)) - (W - tw)), py = 20 + Math.abs(((S.t * 17) % ((H - 60) * 2)) - (H - 60));
    drawText(g, 'HÉLIOS-DOS', px, py, ['#5ff', '#ff5', '#f5f', '#5f5'][((S.t / 4) | 0) % 4], 2);
    drawText(g, S.time(), W / 2, H - 14, '#555', 1, 'center');
  }
  function draw() {
    const g = S.g;
    if (st.phase === 'boot') { drawBoot(g); return; }
    if (st.saver) { drawSaver(g); return; }
    const v = top();
    switch (v.type) {
      case 'menu': {
        chrome(g, v.title, '↑↓ CHOISIR  ENTRÉE OUVRIR' + (st.stack.length > 1 ? '  ← RETOUR' : ''));
        v.items.forEach((it, i) => {
          const y = TOP + 4 + i * 13;
          if (i === v.sel) { rect(g, 10, y - 3, W - 20, 12, C.sel); drawText(g, (i + 1) + '. ' + it[0], 16, y, C.selText); }
          else drawText(g, (i + 1) + '. ' + it[0], 16, y, C.hi);
        });
        if (def.label === 'POSTE DE SÉCURITÉ') drawText(g, 'Nuit ' + clamp(Number(S.ctx?.night) || 1, 1, 10) + ' / 10', W - 10, H - 24, C.dim, 1, 'right');
        break;
      }
      case 'text': {
        chrome(g, v.title, '↑↓ DÉFILER  ← RETOUR');
        drawLines(g, v.lines, v.top);
        break;
      }
      case 'pages': {
        const p = v.pages[v.page] || [];
        chrome(g, v.title + '  ' + (v.page + 1) + '/' + v.pages.length, '◀▶ PAGE  ↑↓ DÉFILER  ← RETOUR');
        drawLines(g, p, v.top);
        break;
      }
      case 'mail': {
        const unread = v.mails.filter((m) => !m.read).length;
        chrome(g, v.title + ' (' + unread + ' non lu' + (unread > 1 ? 's' : '') + ')', '↑↓ CHOISIR  ENTRÉE LIRE  ← RETOUR');
        v.mails.forEach((m, i) => {
          const who = m.from.replace(/\s*\(.*\)\s*/, '');
          const y = TOP + 2 + i * 12, s = (m.read ? '  ' : '● ') + (who.length > 13 ? who.slice(0, 12) + '.' : who).padEnd(14) + m.subj;
          const line = s.length > 39 ? s.slice(0, 38) + '…' : s;
          if (i === v.sel) { rect(g, 6, y - 2, W - 12, 11, C.sel); drawText(g, line, 8, y, C.selText); }
          else drawText(g, line, 8, y, m.read ? C.text : C.hi);
        });
        break;
      }
      case 'prompt': {
        chrome(g, v.title, 'ENTRÉE VALIDER  ← EFFACER / RETOUR');
        const vis = v.lines.slice(-(ROWS - 1));
        vis.forEach((l, i) => drawText(g, l, 6, TOP + i * 10, '#c8c8c8'));
        const cur = (v.pass ? 'Mot de passe : ' + '*'.repeat(v.input.length) : 'C:\\> ' + v.input);
        const shown = cur.length > 40 ? cur.slice(-40) : cur;
        drawText(g, shown, 6, TOP + vis.length * 10, '#fff');
        if ((S.t * 2.5 | 0) % 2) rect(g, 6 + shown.length * 6, TOP + vis.length * 10 + 7, 5, 2, '#fff');
        break;
      }
      case 'calc': {
        chrome(g, v.title, 'FLÈCHES + ENTRÉE, OU CHIFFRES  ← RETOUR');
        rect(g, 54, 32, 148, 22, '#9ab89a'); frame(g, 54, 32, 148, 22, '#333');
        drawText(g, v.disp.replace('.', ','), 196, 37, '#102010', 2, 'right');
        if (v.op) drawText(g, v.op, 58, 36, '#304030');
        CALC_KEYS.forEach((k, i) => {
          const x = 54 + (i % 4) * 38, y = 60 + Math.floor(i / 4) * 22, sel = i === v.sel;
          rect(g, x, y, 34, 18, sel ? C.sel : '#c8c8c8'); frame(g, x, y, 34, 18, sel ? '#fff' : '#555');
          drawText(g, k, x + 17, y + 6, '#000', 1, 'center');
        });
        break;
      }
      case 'game': {
        if (!v.game) v.game = createGame(S, v.id, { embedded: true });
        if (v.game) { v.game.update(); rect(g, 0, H - 11, W, 11, 'rgba(0,0,0,0.7)'); drawText(g, GAME_HINT[v.id] || '', 4, H - 9, '#ccc'); drawText(g, '← : MENU', W - 4, H - 9, '#ff5', 1, 'right'); }
        else { chrome(g, v.title, '← RETOUR'); drawText(g, 'Programme introuvable.', 8, TOP, C.alert); }
        break;
      }
    }
  }

  const NAV = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', Backspace: 'back', PageUp: 'pgup', PageDown: 'pgdn', Home: 'home', End: 'end' };
  const digit = (code) => { const m = /^(?:Digit|Numpad)([0-9])$/.exec(code); return m ? +m[1] : -1; };
  function scroll(v, lines, d) { v.top = clamp(v.top + d, 0, Math.max(0, lines.length - ROWS)); }
  function charOf(code) {
    let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
    m = /^(?:Digit|Numpad)([0-9])$/.exec(code); if (m) return m[1];
    return { Space: ' ', Period: '.', NumpadDecimal: '.', Comma: ',', Minus: '-', NumpadSubtract: '-', Slash: '/', NumpadDivide: '/', Backslash: '\\', Equal: '=', Semicolon: ';', Quote: '\'' }[code] || null;
  }
  function key(code, down) {
    const v = top();
    if (!down) { if (v.type === 'game' && v.game) v.game.key(code, false); return; }
    st.idle = 0;
    if (st.saver) { st.saver = false; return; }
    if (st.phase === 'boot') { st.phase = 'shell'; return; }
    const a = NAV[code], d = digit(code);
    switch (v.type) {
      case 'menu':
        if (a === 'up') v.sel = (v.sel + v.items.length - 1) % v.items.length;
        else if (a === 'down') v.sel = (v.sel + 1) % v.items.length;
        else if (a === 'ok' || a === 'right') open(v.items[v.sel]);
        else if (d >= 1 && d <= v.items.length) { v.sel = d - 1; open(v.items[d - 1]); }
        else if (a === 'back' || a === 'left') os.back();
        break;
      case 'text':
        if (a === 'up') scroll(v, v.lines, -1);
        else if (a === 'down') scroll(v, v.lines, 1);
        else if (a === 'pgup' || a === 'left') scroll(v, v.lines, -(ROWS - 1));
        else if (a === 'pgdn' || a === 'ok' || a === 'right') scroll(v, v.lines, ROWS - 1);
        else if (a === 'home') v.top = 0;
        else if (a === 'end') scroll(v, v.lines, 1e4);
        else if (a === 'back') os.back();
        break;
      case 'pages': {
        const p = v.pages[v.page] || [];
        if (a === 'up') scroll(v, p, -1);
        else if (a === 'down') scroll(v, p, 1);
        else if (a === 'left' || a === 'pgup') { if (v.page > 0) { v.page--; v.top = 0; } }
        else if (a === 'right' || a === 'pgdn' || a === 'ok') { if (v.page < v.pages.length - 1) { v.page++; v.top = 0; } else if (a === 'ok') scroll(v, p, ROWS - 1); }
        else if (a === 'back') os.back();
        break;
      }
      case 'mail': {
        const openMail = (m) => {
          m.read = true;
          if (m.discover) S.emit?.('discover', m.discover);
          if (m.lore) S.emit?.('discover', { kind: 'lore', id: m.lore });
          os.push(text(m.subj.toUpperCase(), mailText(m)));
        };
        if (a === 'up') v.sel = (v.sel + v.mails.length - 1) % v.mails.length;
        else if (a === 'down') v.sel = (v.sel + 1) % v.mails.length;
        else if (a === 'ok' || a === 'right') openMail(v.mails[v.sel]);
        else if (d >= 1 && d <= v.mails.length) { v.sel = d - 1; openMail(v.mails[d - 1]); }
        else if (a === 'back' || a === 'left') os.back();
        break;
      }
      case 'prompt': {
        if (code === 'Enter' || code === 'NumpadEnter') {
          const line = v.input; v.input = '';
          if (line.trim() && !v.pass) { v.hist.push(line); v.hi = v.hist.length; }
          runCommand(S, os, v, line);
          if (v.lines.length > 200) v.lines.splice(0, v.lines.length - 200);
        } else if (code === 'Backspace') { if (v.input.length) v.input = v.input.slice(0, -1); else if (v.pass) v.pass = null; else os.back(); }
        else if (code === 'ArrowUp') { if (v.hist.length) { v.hi = Math.max(0, v.hi - 1); v.input = v.hist[v.hi] || ''; } }
        else if (code === 'ArrowDown') { if (v.hist.length) { v.hi = Math.min(v.hist.length, v.hi + 1); v.input = v.hist[v.hi] || ''; } }
        else { const c = charOf(code); if (c && v.input.length < 34) v.input += c; }
        break;
      }
      case 'calc': {
        const ops = { NumpadAdd: '+', NumpadSubtract: '−', Minus: '−', NumpadMultiply: '×', NumpadDivide: '÷', Slash: '÷', Equal: '=', NumpadEnter: '=', Period: '.', NumpadDecimal: '.', Comma: '.', KeyC: 'C', Delete: 'C', Escape: 'C' };
        if (d >= 0) { calcPress(v, String(d)); v.typing = true; }
        else if (ops[code]) { calcPress(v, ops[code]); v.typing = true; }
        else if (a === 'up') { v.sel = (v.sel + 16) % 20; v.typing = false; }
        else if (a === 'down') { v.sel = (v.sel + 4) % 20; v.typing = false; }
        else if (a === 'left') { v.sel = (v.sel + 19) % 20; v.typing = false; }
        else if (a === 'right') { v.sel = (v.sel + 1) % 20; v.typing = false; }
        else if (code === 'Enter' && v.typing) calcPress(v, '=');
        else if (a === 'ok') calcPress(v, CALC_KEYS[v.sel]);
        else if (a === 'back') os.back();
        break;
      }
      case 'game':
        if (code === 'Backspace') { os.back(); break; }
        if (v.game) v.game.key(code, true);
        break;
    }
  }

  return {
    title: def.title, wantsInput: true,
    update() {
      if (st.phase === 'boot') { st.bootT += S.dt; if (st.bootT >= BOOT) st.phase = 'shell'; }
      else if (top().type !== 'game') { st.idle += S.dt; if (st.idle > 45) st.saver = true; }
      draw();
    },
    key,
    dispose() { st.stack.length = 1; },
  };
}
