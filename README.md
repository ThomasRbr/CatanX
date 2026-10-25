# CatanX

Prototype web desktop de stratégie inspiré de Catan, enrichi par des modules optionnels (saisons, technologies, armées, diplomatie, etc.).

## Prérequis

- Node.js 20+
- npm 10+

## Démarrage rapide

```bash
npm install
npm run dev
```

Ouvrir [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Multijoueur

```bash
npm run server:online
```

Puis menu **Multijoueur**. Pour un ami sur Internet : tunnel Cloudflare / ngrok — voir [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).

Sauvegardes : solo (slots locaux) et multi (disque serveur, **Reprendre salon**).

```bash
npm run server          # local uniquement
npm run server:online   # LAN + prêt pour tunnel
```

## Scripts

| Commande               | Description                   |
| ---------------------- | ----------------------------- |
| `npm run dev`          | Serveur de développement Vite |
| `npm run server`       | Serveur MJ local (localhost)  |
| `npm run server:online`| Serveur MJ LAN / tunnel       |
| `npm run server:dev`   | Serveur MJ avec watch         |
| `npm run build`        | Build de production           |
| `npm run preview`      | Prévisualisation du build     |
| `npm run typecheck`    | Vérification TypeScript       |
| `npm run lint`         | ESLint                        |
| `npm run format:check` | Prettier (vérification)       |
| `npm run test`         | Tests unitaires (Vitest)      |
| `npm run test:e2e`     | Smoke test Playwright         |
| `npm run budget`       | Budgets gzip du build client  |

## Structure du dépôt

```
apps/client/          Interface React + Three.js (défaut) / PixiJS (historique)
apps/server/          Serveur multijoueur (Phase 6)
packages/engine/      Moteur de règles déterministe
packages/protocol/    Types réseau et commandes
docs/                 Architecture, feuille de route, catalogue des règles
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Feuille de route](docs/ROADMAP.md)
- [Catalogue des règles](docs/RULES_CATALOG.md)
- [Multijoueur en ligne](docs/MULTIPLAYER.md)
- [Renderer de carte (Three / Pixi)](docs/MAP_RENDERER.md)
- [Plan carte 3D](docs/PLAN_CARTE_3D.md)
- [Performance & budgets](docs/PERFORMANCE.md)
- [Campagne de validation](docs/VALIDATION.md)

## Textures et assets

Les textures de terrain sont chargées depuis `apps/client/public/assets/textures/terrain/`. Si un fichier est absent, le rendu utilise des textures procédurales de secours (voir `TerrainRenderer`).

## Licence

Prototype privé — usage non commercial sans revue juridique préalable.
