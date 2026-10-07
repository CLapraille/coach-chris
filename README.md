# coach-chris

Cockpit d'entraînement personnel : données Garmin et Campus Coach (via leurs serveurs MCP), prévu vs réalisé, forme, mobilité.

- Exigences : [requirements.txt](requirements.txt)
- Décisions : [DECISIONS.md](DECISIONS.md)
- Architecture : [ARCHITECTURE.md](ARCHITECTURE.md)
- Audit des MCP : [AUDIT.md](AUDIT.md)
- Bibliothèque de mobilité : [mobility-library.md](mobility-library.md)

## Démarrer en local

Prérequis : Node.js 24 (`.nvmrc`), uv pour `mcp/campus`.

```bash
npm install
npm run dev        # BFF sur :3000, front sur :5173 (proxy /api)
npm test
```

Poste avec antivirus qui inspecte le HTTPS (AVG) : `NODE_OPTIONS=--use-system-ca` pour npm et Node, `--system-certs` pour uv.

## Organisation

| Dossier | Rôle |
| --- | --- |
| `domain/` | règles et calculs en TypeScript pur, testés |
| `server/` | BFF Fastify (API, client MCP, Cosmos, synchro) |
| `web/` | front Vite + React + Tailwind |
| `mcp/campus/` | serveur MCP Campus Coach (Python) |
| `docs/maquettes/` | moteur du mannequin des maquettes (les maquettes elles-mêmes ne sont pas versionnées) |
