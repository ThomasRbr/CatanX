# CatanX render3d assets — licence

Tous les modèles low-poly de `apps/client/public/assets/models/*.glb` et les géométries
équivalentes dans `meshCatalog.ts` sont des **créations originales CatanX**.

- Auteur : projet CatanX
- Licence : © CatanX — usage exclusif dans ce dépôt (pas de redistribution séparée des assets)
- Aucun asset tiers (Sketchfab, Kenney, etc.) n’est embarqué
- Les fichiers `.glb` sont générés depuis `scripts/export-render3d-glb.mjs` (source de vérité = catalogue procédural)

Regénération :

```bash
node scripts/export-render3d-glb.mjs
```
