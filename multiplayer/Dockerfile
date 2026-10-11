# Serveur multijoueur de Nuit Blanche — sert aussi les fichiers du jeu.
# À construire depuis la RACINE du dépôt (le contexte doit contenir tout le jeu) :
#   docker build -f multiplayer/Dockerfile -t nuit-blanche .
#   docker run --rm -p 8080:8080 nuit-blanche
FROM node:20-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

WORKDIR /app

# Tout le dépôt : index.html, js/, vendor/, wiki/… sont servis depuis /app.
COPY . .

# Dossier de sauvegardes vide et accessible en écriture par l'utilisateur non privilégié « node ».
RUN rm -rf multiplayer/saves \
 && mkdir -p multiplayer/saves \
 && chown node:node multiplayer/saves

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/mp-info.json" || exit 1

CMD ["node", "multiplayer/server.js"]
