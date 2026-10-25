# Multijoueur

## Lancer le serveur

```bash
npm run server:online
```

### Jouer sur Internet

1. `npm run server:online`
2. Autre terminal : `cloudflared tunnel --url http://127.0.0.1:4000`
3. Coller l’URL `https://…` dans **Serveur** du lobby
4. Créer un salon → **Copier lien d’invitation**

## Sauvegardes

### Solo
- Menu **Continuer** / **Charger une partie** (8 slots + autosave)
- En partie : menu **⋯** (coin haut droit) → **Sauvegarder** (aussi dans Plus / planner)
- Export / import JSON depuis l’écran Charger

### Multi (serveur)
- Autosave disque après chaque action (dossier `apps/server/data/rooms/`)
- Hôte : **Sauver (serveur)** dans le panneau multijoueur
- Lobby : **Parties sauvegardées → Reprendre** (même code salon)
- Les jetons de reconnexion sont gardés → même lien / pseudo pour revenir

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run server` | Local uniquement |
| `npm run server:online` | LAN + prêt pour tunnel |
