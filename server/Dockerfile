# BFF CoachChris (Fastify). Node 24 exécute le TypeScript directement : pas d'étape de build.
# Contexte de build : la racine du dépôt (workspaces npm).
FROM node:24-slim

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
COPY domain/package.json domain/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace=server --include-workspace-root=false && npm cache clean --force
COPY domain/src domain/src
COPY server/src server/src

USER node
EXPOSE 3000
# La même image sert le job de synchro quotidien, avec la commande « node server/src/sync-cli.ts ».
CMD ["node", "server/src/main.ts"]
