# Serveur multijoueur — Nuit Blanche : Centre Commercial Hélios

Ce dossier contient le serveur qui permet de jouer **à plusieurs (jusqu'à 8 gardiens)** à Nuit Blanche.
Un seul fichier, `server.js`, joue deux rôles :

1. **Serveur web du jeu** : il sert les fichiers du dépôt (le dossier parent de `multiplayer/`) :
   `index.html`, `js/`, `vendor/`, `wiki/`…
2. **Relais WebSocket** (chemin `/ws`) : il transmet les messages entre les joueurs d'un même salon.
   Le serveur ne simule rien. Le navigateur de l'**hôte** fait tourner le monde et diffuse les effets ;
   les autres navigateurs envoient leurs actions à l'hôte (voir `js/net/net.js` et `js/game/sim.js`).

**Aucune dépendance** : pas de `npm install`. Le protocole WebSocket (RFC 6455) est implémenté à la main
avec les modules intégrés de Node.js (`http`, `crypto`). Il faut seulement **Node.js 18 ou plus récent**.

---

## Lancer en local

Depuis la racine du dépôt :

```bash
node multiplayer/server.js
```

Puis ouvrez **http://localhost:8080**. Le jeu interroge `mp-info.json` : quand il le trouve, il sait qu'il est
servi par le serveur multijoueur et **active le menu « Multijoueur »**. Créez un salon : un code de
5 lettres s'affiche (par exemple `KXRTW`), vos amis le saisissent pour vous rejoindre.

Autres façons de lancer :

```bash
cd multiplayer && npm start                     # même chose, via package.json
PORT=3000 node multiplayer/server.js            # autre port (Linux / macOS)
$env:PORT=3000; node multiplayer/server.js      # autre port (Windows PowerShell)
```

Vérifier que le serveur répond :

```bash
curl http://localhost:8080/mp-info.json
# {"nuitBlanche":true,"version":1,"maxPlayers":4,"rooms":[]}
```

**Sur un réseau local** (même box, même Wi-Fi) : les autres joueurs ouvrent `http://<IP-de-votre-PC>:8080`
(trouvez l'adresse avec `ip addr`, `ifconfig` ou `ipconfig`). Autorisez le port 8080 dans le pare-feu si besoin.

> Le jeu ouvert avec `file://` ou avec un autre serveur statique (`python3 -m http.server`…) fonctionne
> en solo, mais ne trouve pas `mp-info.json` : le menu Multijoueur n'est alors pas activé automatiquement.

---

## Comment ça marche

- Le premier joueur d'un salon en est l'**hôte** : son navigateur exécute les actions de tout le monde et
  diffuse les effets, des instantanés (`snap`) et, à la demande, l'état complet du monde (`full`).
- Si l'hôte part, le **plus ancien membre restant devient hôte** (message `host`). Les salons vides sont
  supprimés de la mémoire ; leurs sauvegardes restent sur le disque.
- Les salons vivent **en mémoire d'un seul processus** : déployez **une seule instance** du serveur, jamais
  plusieurs derrière un répartiteur de charge (les joueurs d'un même salon doivent arriver sur le même
  processus).

---

## Déployer en ligne

Ce qu'il faut savoir, quelle que soit la plateforme :

- Il faut Node.js ≥ 18 (ou Docker) et une plateforme qui **autorise les WebSockets** (Render, Railway, Fly.io,
  un VPS… oui ; l'hébergement statique type GitHub Pages ou Netlify : non).
- Le serveur écoute sur la variable `PORT` fournie par la plateforme (8080 par défaut).
- Derrière HTTPS, l'adresse WebSocket commence par **`wss://`** : `wss://mon-serveur.onrender.com/ws`.
- Une seule instance (voir ci-dessus).

### Jouer depuis GitHub Pages avec un serveur distant

La version GitHub Pages du jeu (`https://<vous>.github.io/<dépôt>/`) n'a pas de serveur : `mp-info.json`
y est introuvable. Le jeu reste jouable en solo, et pour jouer à plusieurs il suffit d'**ouvrir le menu
Multijoueur et d'y saisir l'adresse d'un serveur déployé**, par exemple :

```
wss://mon-serveur.onrender.com/ws
```

Le serveur accepte les connexions venant d'autres origines (aucune restriction `Origin`) et `mp-info.json`
est servi avec `Access-Control-Allow-Origin: *`. Une page en `https://` ne peut se connecter qu'à une
adresse `wss://` (les navigateurs bloquent `ws://` depuis une page sécurisée).

### Render

**Avec le Blueprint fourni** : Render → *New* → *Blueprint* → choisissez le dépôt et indiquez
`multiplayer/render.yaml` comme chemin du Blueprint (ou copiez ce fichier à la racine du dépôt).

**À la main** : *New* → *Web Service* → votre dépôt, puis :

| Réglage | Valeur |
|---|---|
| Runtime | Node |
| Build Command | `node --version` (rien à installer) |
| Start Command | `node multiplayer/server.js` |
| Health Check Path | `/mp-info.json` |

(Variante Docker : runtime *Docker*, Dockerfile `multiplayer/Dockerfile`, contexte `.`.)

L'adresse du jeu sera `https://<nom>.onrender.com` et celle du multijoueur `wss://<nom>.onrender.com/ws`.
À savoir : l'offre gratuite **s'endort après environ 15 minutes sans visite** (le premier accès peut prendre
près d'une minute), et son disque est **éphémère** : les sauvegardes disparaissent à chaque redéploiement ou
redémarrage, sauf avec un disque persistant (offre payante) et `SAVES_DIR` pointé dessus.

### Railway

1. *New Project* → *Deploy from GitHub repo* → votre dépôt.
2. Dans *Variables*, ajoutez `RAILWAY_DOCKERFILE_PATH` = `multiplayer/Dockerfile`.
3. *Settings* → *Networking* → *Generate Domain*.

Adresse : `wss://<nom>.up.railway.app/ws`. Pour garder les sauvegardes, montez un volume (par ex. sur `/data`)
et définissez `SAVES_DIR=/data/saves` ; l'image tourne avec l'utilisateur non privilégié `node`, ajoutez
donc aussi `RAILWAY_RUN_UID=0` pour qu'il puisse écrire dans le volume.

### Fly.io

Depuis la racine du dépôt :

```bash
fly launch --dockerfile multiplayer/Dockerfile --internal-port 8080 --no-deploy
fly deploy
fly scale count 1        # une seule machine : les salons sont en mémoire
```

Adresse : `wss://<app>.fly.dev/ws`.

### VPS (Debian, Ubuntu…)

```bash
git clone https://github.com/<vous>/<dépôt>.git /opt/nuit-blanche
cd /opt/nuit-blanche && HOST=127.0.0.1 PORT=8080 node multiplayer/server.js
```

Service systemd (`/etc/systemd/system/nuit-blanche.service`) :

```ini
[Unit]
Description=Nuit Blanche - serveur multijoueur
After=network.target

[Service]
WorkingDirectory=/opt/nuit-blanche
ExecStart=/usr/bin/node multiplayer/server.js
Environment=HOST=127.0.0.1 PORT=8080
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

(`www-data` doit pouvoir écrire dans `multiplayer/saves/`.) Puis `systemctl enable --now nuit-blanche`.

Reverse proxy avec HTTPS automatique — **Caddy** (gère les WebSockets tout seul) :

```
jeu.mon-domaine.fr {
    reverse_proxy 127.0.0.1:8080
}
```

ou **Nginx** (les en-têtes `Upgrade` / `Connection` sont indispensables) :

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;   # > intervalle des pings (20 s)
}
```

### Docker (n'importe quel hébergeur)

Le Dockerfile copie tout le dépôt : construisez-le **depuis la racine**.

```bash
docker build -f multiplayer/Dockerfile -t nuit-blanche .
docker run -d --name nuit-blanche -p 8080:8080 nuit-blanche
# sauvegardes conservées sur l'hôte (dossier accessible en écriture par l'uid 1000) :
docker run -d -p 8080:8080 -v "$PWD/saves:/app/multiplayer/saves" nuit-blanche
```

L'image (`node:20-alpine`) tourne avec l'utilisateur `node`, expose le port 8080 et déclare un `HEALTHCHECK`
sur `/mp-info.json`. Astuce : un fichier `.dockerignore` à la racine contenant `.git` allège l'image.

---

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8080` | Port HTTP et WebSocket (souvent fourni par la plateforme). |
| `HOST` | `0.0.0.0` | Interface d'écoute. `127.0.0.1` derrière un reverse proxy. |
| `MAX_PLAYERS` | `4` | Joueurs par salon, de 2 à **8**. |
| `MAX_ROOMS` | `200` | Salons ouverts simultanément en mémoire. |
| `SAVES_DIR` | `multiplayer/saves` | Dossier des sauvegardes (pour un disque ou volume persistant). |
| `PING_INTERVAL_MS` | `20000` | Intervalle des pings WebSocket envoyés par le serveur. |
| `PING_TIMEOUT_MS` | `40000` | Connexion coupée si rien n'est reçu pendant ce délai. |

Le journal (sortie standard) tient en une ligne par événement : connexions, salons créés, recréés et
fermés, arrivées, départs, migrations d'hôte, sauvegardes, erreurs de protocole. Les erreurs internes
commencent par `ERREUR`. `Ctrl+C` (ou `SIGTERM`) ferme proprement les connexions (code 1001) et attend la fin des
sauvegardes en cours (3 s au plus) avant de quitter.

---

## Sauvegardes

- Quand l'hôte envoie `{t:'save', data}`, le serveur écrit `multiplayer/saves/<CODE>.json`
  **de façon atomique** (fichier temporaire, `fsync`, puis renommage : jamais de fichier à moitié écrit)
  et répond `{t:'saved'}`. Taille maximale : **1 Mo**. La sauvegarde est aussi gardée en mémoire et envoyée
  dans le `welcome` des joueurs qui arrivent ensuite.
- **Reprendre une partie** : rejoindre avec le code d'un salon qui n'est plus en mémoire mais dont la
  sauvegarde existe **recrée le salon** (même mode, même graine, dernière sauvegarde) ; le premier arrivé
  en devient l'hôte.
- Un salon protégé le reste après recréation : le **même mot de passe** est demandé. Il n'est jamais stocké en
  clair (empreinte HMAC-SHA256 salée). Pour retirer la protection, mettez `"password": null` dans le fichier
  pendant que le salon n'est pas ouvert.
- Un nouveau salon ne reçoit jamais le code d'une sauvegarde existante (rien n'est écrasé). Pour effacer une
  partie, supprimez simplement son fichier.
- Le dossier est ignoré par git (`multiplayer/.gitignore`) et **jamais servi** par le serveur web.

Format du fichier :

```json
{
  "format": "nuit-blanche-salon",
  "version": 1,
  "code": "KXRTW",
  "mode": "story",
  "seed": 1234567890,
  "password": null,
  "savedAt": "2026-10-11T22:41:00.000Z",
  "data": { "…": "objet envoyé par le jeu" }
}
```

---

## Protocole

Trames texte JSON sur `ws(s)://<hôte>/ws` (le chemin `/` est aussi accepté). Le premier message doit être
`hello`, dans les 10 secondes. Tout message invalide ou de type inconnu est ignoré.

**Client → serveur**

| Message | Émetteur | Traitement |
|---|---|---|
| `{t:'hello', room, create, name, password, mode, costume, version:1}` | tous | Crée un salon (`create` vrai ou `room` vide) ou rejoint `room` → `welcome`, ou `error` puis fermeture. |
| `{t:'ping', c}` | tous | → `{t:'pong', c}` à l'émetteur. |
| `{t:'a', n, p}` | non-hôte | Action → l'hôte seul reçoit `{t:'a', n, p, from}`. Ignoré venant de l'hôte. |
| `{t:'e', n, p, to}` | hôte | Effet → le joueur `to`, ou tous les autres si `to` est vide : `{t:'e', n, p, from}`. |
| `{t:'ps', s}` | tous | État du joueur → tous les autres : `{t:'ps', s, from}` (volatil). |
| `{t:'snap', s}` | hôte | Instantané → tous les autres : `{t:'snap', s, from}` (volatil). |
| `{t:'full', to, s}` | hôte | État complet → le joueur `to` : `{t:'full', s, from}`. |
| `{t:'needfull'}` | non-hôte | Demande d'état complet → l'hôte : `{t:'needfull', from}`. |
| `{t:'chat', text, channel, pos}` | tous | Texte nettoyé (200 caractères max), 5 messages / 5 s par joueur → tous les autres : `{t:'chat', text, channel, pos, from, name}`. |
| `{t:'save', data}` | hôte | Écrit la sauvegarde → `{t:'saved'}` (ou `error`). |

Un message relayé n'est jamais renvoyé à son émetteur. Un message envoyé par quelqu'un qui n'en a pas le droit (effet d'un
non-hôte, action de l'hôte…) est ignoré. « Volatil » : le message peut être sauté pour un joueur dont la
connexion est en retard, le suivant le remplace.

**Serveur → clients**

| Message | Destinataires |
|---|---|
| `{t:'welcome', id, hostId, room, players:[{id, name, costume}], mode, save, seed, maxPlayers}` | le joueur qui arrive |
| `{t:'error', message}` | refus de `hello` (`Salon introuvable`, `Salon complet`, `Mot de passe incorrect`, `Version incompatible`, `Nom invalide`, `Serveur plein…`) ou sauvegarde refusée |
| `{t:'join', player:{id, name, costume}}` | les membres déjà présents |
| `{t:'leave', id}` | les membres restants |
| `{t:'host', id}` | tous les membres, après le départ de l'hôte |
| `{t:'saved'}` | l'hôte, une fois la sauvegarde écrite |

Détails : codes de salon de 5 lettres sans `I` ni `O` (`ABCDEFGHJKLMNPQRSTUVWXYZ`), insensibles à la casse ;
identifiants de joueurs `p` + 8 caractères hexadécimaux ; nom de 1 à 20 caractères (`Gardien` par défaut,
caractères de contrôle et `< >` retirés) ; costume inconnu → `guard` ; le mode (`story` ou `infinite`) est
celui du créateur du salon ; `seed` est un entier aléatoire commun à tout le salon, conservé dans la sauvegarde.

**HTTP**

- `GET /mp-info.json` → `{nuitBlanche: true, version: 1, maxPlayers, rooms: [{code, players, max, mode, locked}]}`
  (liste publique des salons ouverts ; `locked` indique un mot de passe, jamais divulgué).
- Tout le reste : fichiers du dépôt, avec les bons types MIME, `index.html` pour un dossier, page 404,
  `Cache-Control: no-cache` pour le HTML, le JS, le CSS et le JSON.

---

## Limites et sécurité

- Message WebSocket : **2 Mo maximum** (au-delà, fermeture avec le code 1009) ; 4 096 fragments maximum.
- Trames client obligatoirement masquées, UTF-8 vérifié, bits réservés interdits (fermeture 1002 / 1007).
- Ping toutes les 20 s ; une connexion silencieuse depuis 40 s est coupée.
- Un joueur dont la connexion accumule du retard ne reçoit plus les messages volatils (`ps`, `snap`) ; au-delà
  de 16 Mo en attente, il est déconnecté. Anti-inondation : au-delà de 1 000 messages par seconde, l'excédent est ignoré.
- Fichiers statiques : `..`, séparateurs encodés (`%2f`, `%5c`), fichiers cachés (`.git`, `.env`…) et liens
  symboliques sortant du dépôt sont refusés (403) ; `multiplayer/saves/` n'est jamais servi.
- Chaque message est validé (types, tailles) ; une entrée malformée est ignorée sans jamais arrêter le serveur.

---

## Dépannage

| Symptôme | Piste |
|---|---|
| Le menu Multijoueur n'apparaît pas | La page doit être servie par ce serveur ; `http://<adresse>/mp-info.json` doit répondre. Sinon (GitHub Pages), saisissez l'adresse `wss://…/ws` d'un serveur dans le menu. |
| « Délai de connexion dépassé » | Serveur endormi (Render gratuit : patientez puis réessayez), mauvaise adresse, ou `ws://` depuis une page `https://`. |
| Erreur 400 ou 426 derrière Nginx | Les en-têtes `Upgrade` et `Connection` ne sont pas transmis (voir la configuration ci-dessus). |
| `le port 8080 est déjà utilisé` | Un autre programme occupe le port : `PORT=8081 node multiplayer/server.js`. |
| « Échec de la sauvegarde sur le serveur » | Le dossier des sauvegardes n'est pas accessible en écriture : le journal l'indique dès le démarrage. |
