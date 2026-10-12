# Nuit Blanche — Centre Commercial Hélios

Un jeu d'horreur à la première personne dans le navigateur : vous êtes le nouveau **gardien de nuit** d'un grand
centre commercial de deux étages coiffé d'une verrière sur toute la longueur des galeries (plus de 30 boutiques, un
hypermarché, des kiosques, une aile administrative avec sa salle des coffres, un ascenseur panoramique, un parking
souterrain, un sous-sol technique, des conduits d'aération, un entrepôt et un toit). Caméras, téléphone, électricité,
lampe torche… et des règles à apprendre, parce qu'à Hélios certaines choses ne bougent que quand personne ne regarde.

- **Mode histoire** : 10 nuits. La première commence en journée, au milieu des clients : on discute avec les
  commerçants, Gérard (l'ancien gardien) explique le poste, le centre ferme, la nuit tombe. Chaque nuit débloque des
  magasins, des zones et des outils. Plusieurs fins selon vos choix.
- **Mode infini** : tout le centre ouvert dès le départ, des centaines d'événements aléatoires, des nuits de plus en
  plus dures. Score = nombre de nuits survécues.
- **Tout se manipule** : objets des rayons, appareils, tiroirs, vitrines, caisses, voitures du parking, consoles et
  bornes d'arcade jouables, cassettes VHS, instruments, sonnette de l'accueil, conteneurs à fouiller… (et les portiques
  antivol sonnent si l'on sort d'une boutique avec un article).
- **Multijoueur coopératif** (jusqu'à 4 gardiens) avec un petit serveur Node.js fourni.

Une nuit dure toujours **15 minutes réelles** (de 22 h à 6 h).

## Jouer

### Version navigateur (GitHub Pages)

Le jeu est un site statique : aucun build, aucune dépendance à installer.

- En ligne : `https://<votre-compte>.github.io/<nom-du-dépôt>/` une fois GitHub Pages activé
  (voir « Publier » ci-dessous).
- En local : servez le dossier avec n'importe quel serveur statique, par exemple
  `python3 -m http.server 8000` puis ouvrez <http://localhost:8000>. (Ouvrir `index.html` directement en `file://`
  ne fonctionne pas : les navigateurs bloquent les modules JavaScript en local.)

Il faut un navigateur récent avec **WebGL 2** (Chrome, Edge, Firefox, Safari 15+). Un casque est recommandé : tous les
sons sont spatialisés, avec réverbération selon la pièce et sons étouffés à travers les murs.

Si le jeu rame : la résolution dynamique (activée par défaut) baisse d'elle-même la définition ; dans les options,
« Qualité : basse » réduit aussi la distance d'affichage et les ombres (et coupe l'occlusion ambiante, la brume du
faisceau et les reflets), et « Échelle de rendu » descend jusqu'à 40 %. La case « Effet caméra-piéton » retire la
distorsion de l'objectif et l'incrustation « REC » si elles vous gênent.

### Sauvegardes

La version navigateur sauvegarde **dans le navigateur** (`localStorage`) : 3 emplacements pour le mode histoire,
les réglages, le record du mode infini, les fins débloquées et les secrets découverts. La sauvegarde se fait
automatiquement au début de chaque nuit. Les options permettent d'**exporter/importer** un fichier `.json`
(pour changer de navigateur ou d'ordinateur).

### Contrôles principaux

| Touche | Action |
| --- | --- |
| ZQSD (AZERTY) / WASD (QWERTY), souris | Se déplacer, regarder |
| Maj · Ctrl ou C · Espace | Courir · s'accroupir (conduits) · sauter |
| E | Interagir (ramasser, ouvrir, parler, s'asseoir au bureau…) |
| Clic gauche · clic droit | Utiliser l'objet en main · le lancer |
| F · R · G | Lampe torche · recharger / action secondaire · poser |
| Tab · 1–9 / molette | Inventaire · objet en main |
| N · M · T · Échap | Heure · plan · chat (multijoueur) · pause |

Au bureau de sécurité : ←/→ ou 1–9 pour les caméras, Espace pour l'infrarouge, glisser pour orienter la caméra,
molette pour zoomer, L pour la lumière de la zone filmée, R pour l'enregistrement, Tab pour regarder la pièce,
Échap pour se lever. Le reste est dans le wiki.

## Wiki des joueurs

`wiki/index.html` (lien depuis le menu du jeu) : contrôles, poste de sécurité, nuits, présences et comment leur
survivre, magasins et plan, objets, événements, numéros de téléphone, costumes, fins, lore, secrets (spoilers masqués
par défaut). Il lit directement les données du jeu : il est toujours à jour.

## Multijoueur

Le dossier [`multiplayer/`](multiplayer/README.md) contient un serveur **sans aucune dépendance** (Node.js 18+) qui
sert le jeu et relaie les échanges entre joueurs par WebSocket :

```bash
node multiplayer/server.js
# puis ouvrir http://localhost:8080 → Multijoueur → Créer un salon (code de 5 lettres)
```

Le navigateur du premier joueur (l'hôte) simule le monde ; les autres envoient leurs actions et reçoivent les
effets. Depuis la version GitHub Pages, le menu Multijoueur permet aussi de rejoindre un serveur hébergé en
indiquant son adresse (`wss://…/ws`). Si l'hôte part, un autre joueur prend le relais. Les parties multijoueur sont sauvegardées sur le serveur.
Hébergement : blueprint Render (`multiplayer/render.yaml`) ou image Docker (`multiplayer/Dockerfile`) — détails dans
[`multiplayer/README.md`](multiplayer/README.md).

## Publier sur GitHub Pages

Le workflow `.github/workflows/pages.yml` publie le jeu et le wiki à chaque push sur `main` (ou à la demande depuis
l'onglet Actions). À faire une seule fois : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

## Sous le capot

- Moteur : [three.js](https://threejs.org) r170 (fourni dans `vendor/`, licence MIT), modules ES natifs, aucun build.
- Tout est généré par le code : textures (canvas), modèles, sons et musiques (WebAudio), écrans des télés et jeux
  d'arcade, voix babillées à la Animal Crossing (syllabes synthétisées). Aucun fichier image ou audio.
- Monde déterministe (même graine pour tous les joueurs), éclairage par zone + lumières dynamiques, ombres de la lampe
  torche, post-traitement maison (bloom, grain, vignettage, effets de stress), caméras de surveillance rendues en
  temps réel.
- Architecture : `js/engine/` (rendu, audio, physique, entrées), `js/world/` (centre commercial, magasins, objets,
  appareils, électricité), `js/game/` (joueur, interface, vidéosurveillance, téléphone, présences, événements,
  histoire, sauvegardes), `js/net/` (réseau), `js/screens/` (écrans, jeux, VHS), `js/data/` (données du jeu),
  `docs/ARCHITECTURE.md` (contrats entre modules).
