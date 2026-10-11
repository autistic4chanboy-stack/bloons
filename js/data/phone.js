// Annuaire du téléphone. Numéros normalisés (chiffres uniquement).
// known: noté sur le post-it du poste dès le départ. found: où le trouver dans le jeu.
// calls: liste de répliques selon le nombre d'appels (le dernier élément se répète).
// Chaque réplique : tableau de [qui, texte]. Les services d'urgence ont une logique dédiée (js/game/phone.js).

export const PHONE_NUMBERS = [
  // ── Urgences ──
  { num: '17', name: 'Police secours', kind: 'emergency', service: 'police', known: true },
  { num: '18', name: 'Sapeurs-pompiers', kind: 'emergency', service: 'pompiers', known: true },
  { num: '15', name: 'SAMU', kind: 'emergency', service: 'samu', known: true },
  { num: '112', name: 'Numéro d\'urgence européen', kind: 'emergency', service: 'tri', known: true },

  // ── Contacts du post-it ──
  { num: '0647221987', name: 'Gérard (ancien gardien)', kind: 'gerard', known: true, found: 'Post-it du poste' },
  { num: '0144871987', name: 'M. Desmarais (directeur)', kind: 'director', known: true, found: 'Post-it du poste' },

  // ── Employés (numéros à trouver) ──
  { num: '0612483390', name: 'Kevin (Pixel Planet)', kind: 'employee', found: 'E-mails du PC du vendeur (Pixel Planet)', calls: [
    [['Kevin', 'Allô ? … Mec, il est quelle heure là ? C\'est qui ?'], ['Kevin', 'Le gardien ? Ah. Euh, si la console est allumée, laisse-la, je fais un speedrun de Glouton. Ne touche pas à ma sauvegarde.']],
    [['Kevin', 'Encore toi ? Écoute, si tu arrives à 10 000 points à Glouton, il paraît qu\'il y a un message caché. Moi j\'y suis jamais arrivé. Bonne nuit.']],
    [['Kevin', 'Sérieux ?! Je dors ! Je vais le dire à Desmarais !']] ] },
  { num: '0698765412', name: 'Mme Lefèvre (Royaume du Jouet)', kind: 'employee', found: 'Elle vous le donne le premier jour', calls: [
    [['Mme Lefèvre', 'Allô ? Ah, c\'est vous, le nouveau gardien. Tout va bien avec mon magasin ?'], ['Mme Lefèvre', 'Si la boîte à musique joue toute seule… laissez-la finir. Ne l\'arrêtez jamais au milieu. C\'est une vieille superstition du magasin.']],
    [['Mme Lefèvre', 'Bobby ? Ce costume est là depuis 1987. On ne s\'en sert plus. Personne n\'ose le jeter.'], ['Mme Lefèvre', 'Il paraît qu\'il adore le miel… comme dans les livres.']],
    [['Mme Lefèvre', 'Il est très tard, jeune homme. Allez dormir un peu… enfin, non, vous ne pouvez pas. Courage.']] ] },
  { num: '0621436587', name: 'Sandrine (Boulangerie)', kind: 'employee', found: 'Panneau d\'affichage du personnel', calls: [
    [['Sandrine', 'Mmh… allô ? La boulangerie ? Le four est éteint normalement… Il y a des croissants d\'hier en vitrine, servez-vous, ils seront jetés.']],
    [['Sandrine', 'C\'est pour la colocation ? À trois heures du matin ?! … Non.']],
    [['Sandrine', '(Elle a raccroché sans un mot.)']] ] },
  { num: '0633187042', name: 'Jean-Mi (Quincaillerie)', kind: 'employee', found: 'Panneau d\'affichage du personnel', calls: [
    [['Jean-Mi', 'Ouais, Jean-Mi. Le scooter ? Ah non, t\'es le gardien. Écoute, si t\'as besoin d\'un cadenas ou d\'une lampe, sers-toi au magasin, je mettrai ça sur le compte de la sécurité.']],
    [['Jean-Mi', 'Un conseil : le pied-de-biche, rayon 2. On sait jamais, dans ce centre.']],
    [['Jean-Mi', 'Mec, je bosse à 7h. Lâche-moi.']] ] },
  { num: '0145229810', name: 'Dr Morel (Pharmacie)', kind: 'employee', found: 'Panneau d\'affichage du personnel', calls: [
    [['Dr Morel', 'Pharmacie de garde, j\'écoute. … Le gardien du centre ? Si vous êtes stressé, du paracétamol, pas plus de trois par nuit. Et du chocolat. Surtout du chocolat.']],
    [['Dr Morel', 'Vous dormez mal ? Vous entendez des choses ? C\'est fréquent chez les gardiens d\'Hélios. Trop fréquent.']] ] },
  { num: '0180112233', name: 'M. Dubois (Électricien)', kind: 'employee', found: 'E-mail du directeur / panneau d\'affichage', calls: [
    [['M. Dubois', 'Dubois, électricité. … ElectroMaison ? Ah oui, le présentoir des grille-pains. Le câblage est cuit, je l\'ai signalé. Si vous voyez des étincelles, coupez le disjoncteur « ElectroMaison » au tableau du sous-sol. Tout de suite.']],
    [['M. Dubois', 'Le groupe électrogène ? Tirez le démarreur trois-quatre fois, il est capricieux. Et vérifiez le niveau d\'essence.']] ] },
  { num: '0147701234', name: 'Pizzeria Napoli', kind: 'pizza', found: 'Panneau d\'affichage / vitrine de la pizzeria' },
  { num: '0681234567', name: 'Paulo (Pizzeria Napoli, perso)', kind: 'employee', found: 'Post-it sous la caisse de la pizzeria', calls: [
    [['Paulo', 'Pronto ? Ah, le gardien ! Le four à pizza marche encore, il faut juste mettre une pizza dedans et appuyer. Buon appetito !']],
    [['Paulo', 'Madonna, il est tard…']] ] },
  { num: '0699887766', name: 'Lucas (Projectionniste du cinéma)', kind: 'employee', found: 'Ticket de cinéma / cabine de projection', calls: [
    [['Lucas', 'Allô… Le projecteur ? Il démarre tout seul parfois, à 23h, pour la « séance fantôme ». Je ne programme rien, hein. Rang M, siège 13 : personne ne s\'y assoit jamais.']],
    [['Lucas', 'Si vous voyez quelqu\'un assis au rang M… ne lui parlez pas.']] ] },
  { num: '0140198700', name: 'Poste de sécurité (ligne directe)', kind: 'self', found: 'Panneau d\'affichage du personnel' },

  // ── Easter eggs ──
  { num: '3699', name: 'Horloge parlante', kind: 'clock', found: 'Tout le monde connaît ce numéro… (ou presque)' },
  { num: '0800198713', name: '« Avez-vous vu Lucie ? »', kind: 'lucie', found: 'L\'affiche jaunie près des toilettes' },
  { num: '080026229', name: 'Hotline Bobby (0 800 BOBBY)', kind: 'bobby', found: 'La cassette « Pub Royaume du Jouet 1987 »' },
  { num: '0600000000', name: 'Maman', kind: 'mom', found: 'Votre mémoire (06 00 00 00 00)' },
  { num: '666', name: '???', kind: 'devil' },
  { num: '3615', name: 'Minitel', kind: 'minitel', found: 'Un vieux réflexe' },
  { num: '0143331987', name: 'Taxi Hélios', kind: 'taxi', found: 'Carte postale du centre' },
  { num: '1987', name: '1987', kind: 'year' },
  { num: '0333333333', name: '3h33', kind: '333' },
  { num: '0101010101', name: 'Répondeur de l\'usine Lumière', kind: 'factory', found: 'Livre « Histoire de la ville »' },
];

export function normalizeNumber(s) { return String(s).replace(/\D/g, ''); }
export function formatNumber(s) {
  const n = normalizeNumber(s);
  if (n.length === 10) return n.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  return n;
}
export function findNumber(s) { const n = normalizeNumber(s); return PHONE_NUMBERS.find(e => e.num === n) || null; }

export const PHONE_EASTER_LINES = {
  lucie: [['Voix d\'enfant', 'Tu viens jouer à cache-cache ? … Un, deux, trois… Je suis en bas. Il fait tout noir en bas.']],
  bobby: [['Bobby (enregistrement)', '♪ Bonjour les amis, c\'est Bobby l\'Ourson ! Au Royaume du Jouet, on joue tous ensemble… pour toujours… pour toujours… pour touj— ♪']],
  mom: [['Maman', 'Allô mon chéri ? Tu travailles de nuit maintenant ? Fais attention à toi, mange quelque chose de chaud. Je suis fière de toi. Bisous.']],
  devil: [['Message', 'Le numéro que vous avez demandé n\'est pas attribué.'], ['???', '(un murmure, très proche du combiné) … derrière toi …']],
  minitel: [['Minitel', 'Piiiiiii-krrrrr-chhhhh… (Le 3615 n\'existe plus depuis 2012. Mais quelque chose répond quand même.)']],
  taxi: [['Taxi', 'Taxi Hélios, bonsoir. Une course depuis le centre commercial ? À cette heure ? Les portes sont verrouillées, mon pauvre. On ne quitte pas Hélios avant 6 heures.']],
  year: [['Message', 'Composez le code à quatre chiffres sur la porte, pas au téléphone.']],
  '333': [['Message', '(Silence. Puis une boîte à musique, très loin, qui joue « Au clair de la lune », faux.)']],
  factory: [['Répondeur', 'Usine électrique Lumière, service de nuit. Nos bureaux sont fermés depuis le… 1971. Veuillez laisser un message après le bip. … BIIIP. … (une respiration)']],
  self_busy: [['Tonalité', '(Occupé : vous appelez le poste depuis le poste.)']],
};
