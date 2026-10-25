# Campagne de validation (Phase 7)

Checklist manuelle + automatisée avant livraison d’une build.

## Automatisé (CI)

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run format:check`
- [x] `npm run test` (Vitest)
- [x] `npm run build`
- [x] `npm run budget` (gzip)
- [x] `npm run test:e2e` (Playwright smoke + parcours menu + toggle C&K)
- [x] Batch C&K CI (40 parties Vitest) ; long run : `npm run sim:ck`

## Manuelle — classique

1. Nouvelle partie preset **Classique**, **3 ou 4** joueurs (1 humain + IA).
2. Disposition **Débutant** puis **Variable** (vérifier île 19 tuiles).
3. Placement serpent (preview + confirm).
4. Tour complet : dés → collecte → construction / banque → fin de tour.
5. Flux 7 : défausse → brigand → vol.
6. Sauvegarde / rechargement.
7. Victoire par points (ou raccourcir l’objectif en config custom).

## Manuelle — CatanX modules

1. Preset **CatanX** : saisons, tech, conseil et barbares ; le craft industriel reste désactivé.
2. Partie personnalisée : activer explicitement **Industrie et craft avancés**, puis vérifier l'onglet Villes.
3. Vérifier que les panneaux HUD respectent les modules `enable*`.

## Manuelle — Villes & Chevaliers

1. Nouvelle partie → **Plateau & extensions** → activer **Villes & Chevaliers** (résumé affiche +3 PV).
2. Setup colonie puis ville ; vérifier marchandises `ck_*` et chevaliers dans le HUD.
3. Sauvegarde / rechargement mid-partie (idéalement pendant un choix Aqueduc ou retraite).
4. Optionnel : `npm run sim:ck -- --games=50` (batch IA headless).

## Manuelle — multijoueur

1. `npm run server` + deux clients (voir aussi `docs/MULTIPLAYER.md` pour tunnel Internet).
2. Créer salon → preset CatanX / extensions → ajouter 1 IA → rejoindre → lancer.
3. Jouer un tour humain + vérifier qu’un tour IA avance côté serveur.
4. Copier le lien d’invitation ; ouvrir dans un 2e navigateur.
5. Couper / reconnecter un client (même pseudo / jeton).

## Manuelle — robustesse / perf

1. Ouvrir le **Guide** depuis le menu (Échap / backdrop pour fermer).
2. En partie, **Guide** disponible sur le ruban (tous modes d’UI).
3. **Charger une partie** ouvre la liste des sauvegardes (lazy LoadGame).
4. Activer le compteur FPS ; confirmer ≥ 30 en partie tiny (thread principal).
5. Forcer une erreur carte (devtools) : `MapErrorBoundary` propose Réessayer / Recharger.
