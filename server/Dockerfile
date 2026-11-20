# BFF CoachChris (Fastify). Node 24 exécute le TypeScript directement : pas d'étape de build.
# Contexte de build : la racine du dépôt (workspaces npm).
# Serveur MCP communautaire MyWhoosh (D160) : commit figé, relu avant usage (n'appelle que *.mywhoosh.com).
# Lancé en stdio par le BFF (MYWHOOSH_MCP_CMD) ; absent de la configuration, il n'est jamais démarré.
FROM node:24 AS mywhoosh
ARG MYWHOOSH_COMMIT=b252b102eac5ab0af1a0032ff56136fb801b4d2a
WORKDIR /build
RUN git clone https://github.com/mywhoosh-community/mywhoosh-mcp-server.git . \
  && git checkout "$MYWHOOSH_COMMIT" \
  && npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev

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
COPY --from=mywhoosh /build/package.json mcp/mywhoosh/package.json
COPY --from=mywhoosh /build/build mcp/mywhoosh/build
COPY --from=mywhoosh /build/node_modules mcp/mywhoosh/node_modules

USER node
EXPOSE 3000
# La même image sert le job de synchro quotidien, avec la commande « node server/src/sync-cli.ts ».
CMD ["node", "server/src/main.ts"]
