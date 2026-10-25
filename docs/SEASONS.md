# Extension Saisons CatanX

**Statut :** implémenté (`catanx-seasons-v2`)  
**Schéma sauvegarde :** 6  
**Registre :** `extensions.seasons`

## Essence

Voir venir, préparer son économie, puis profiter ou survivre.

Saisons V2 ne demande plus de mémoriser une succession d’exceptions. Chaque climat public contient exactement :

1. deux ressources abondantes ;
2. une contrainte ;
3. une sévérité standard ou rude.

Les trois climats « seuil de main −1 » (*Renouveau doux*, *Été doré*, *Moisson dorée*) ajoutent aussi un **bonus généreux** : le premier bonus d’abondance du climat vaut `+2` (puis `+1`). L’Adaptation peut ajouter encore `+1` une fois sur le terrain choisi (max `+3`).

Le cœur CATAN reste inchangé : dés → production → commerce → construction. Aucun PV saisonnier.

## Calendrier et prévision

- Printemps → été → automne → hiver.
- Cinq rondes par saison, vingt par année.
- Climat actuel et prochain climat toujours publics.
- Trois climats par saison : deux standards et un rude.
- Jamais deux climats rudes consécutifs ; maximum deux par année.

## Règle universelle d’abondance

Lorsqu’un joueur produit au moins une des deux ressources abondantes, il reçoit `+1` de cette ressource, maximum une fois par lancer. La première ressource affichée est prioritaire si les deux sont produites.

La pénurie de ce bonus n’annule jamais la production normale.

## Les douze climats

| Saison | Climat | Abondance | Unique contrainte |
| --- | --- | --- | --- |
| Printemps | Renouveau doux | Mouton, Blé · 1ʳᵉ +2 | seuil de main −1 |
| Printemps | Grand dégel | Argile, Blé | routes +1 Argile |
| Printemps | Crues printanières — rude | Blé, Bois | villes : −1 Argile produite |
| Été | Été doré | Blé, Minerai · 1ʳᵉ +2 | seuil de main −1 |
| Été | Orages chauds | Bois, Minerai | routes +1 Bois |
| Été | Grande sécheresse — rude | Argile, Minerai | villes : −1 Blé et Mouton produits |
| Automne | Moisson dorée | Blé, Bois · 1ʳᵉ +2 | seuil de main −1 |
| Automne | Grandes foires | Mouton, Argile | ports génériques à 4:1 |
| Automne | Tempête d’équinoxe — rude | Bois, Minerai | villes : −1 Bois et Minerai produits |
| Hiver | Gel clair | Minerai, Bois | routes +1 Argile |
| Hiver | Hiver marchand | Bois, Mouton | ports génériques à 4:1 |
| Hiver | Blizzard annoncé — rude | Bois, Minerai | toute production classique des villes −1 |

Les colonies ne subissent jamais les pénalités de production.

## Veillée saisonnière

- **Adaptation** : choisir Bois, Argile, Blé, Mouton ou Minerai ; sa première production rapporte `+1`.
- **Caravane** : obtenir une fois un échange à `3:1` ; un port spécialisé à `2:1` reste meilleur.
- **Réserves** : conserver deux cartes de plus avant la défausse sur un 7.
- **Mobilisation** : retirer une ressource de la première construction payante de la saison, sans rendre son coût nul.
- **Abri** : neutraliser la première pénalité climatique de production d’une ville ou la première surcharge climatique de construction.

Le choix du printemps se fait après le placement. Les choix suivants se préparent pendant la cinquième ronde. Ils sont simultanés et secrets : les adversaires et les IA n’exposent que leur état « prêt », jamais leur intention ni leur terrain d’Adaptation. La sélection reste non bloquante ; un joueur sans nouveau choix conserve sa préparation précédente.

## Compatibilité C&K

Saisons ne modifie plus directement la flotte barbare, l’activation, la force ou le déplacement des chevaliers. Les interactions passent par l’économie commune : Blé disponible, coût des routes, production des villes, commerce et murailles.

## Production autoritaire

1. Production normale.
2. Conversion des marchandises C&K.
3. Unique pénalité climatique éventuelle.
4. Résolution de la banque.
5. Bonus universel d’abondance.
6. Autres modules et Aqueduc.

## Sauvegardes

Le schéma 6 migre automatiquement `catanx-seasons-v1` : les anciens climats sont remplacés par le climat V2 correspondant à leur saison, les decks sont assainis et les anciennes préparations conservent leur identifiant interne. Une ancienne Récolte reçoit automatiquement le terrain favorisé prioritaire comme cible d’Adaptation.

## Fichiers clés

- [`packages/engine/src/types/seasons.ts`](../packages/engine/src/types/seasons.ts)
- [`packages/engine/src/engine/seasons/definitions.ts`](../packages/engine/src/engine/seasons/definitions.ts)
- [`packages/engine/src/engine/seasons/production.ts`](../packages/engine/src/engine/seasons/production.ts)
- [`apps/client/src/components/HUD/SeasonWidget.tsx`](../apps/client/src/components/HUD/SeasonWidget.tsx)
- Tests : [`packages/engine/src/engine/seasons/__tests__/seasons.test.ts`](../packages/engine/src/engine/seasons/__tests__/seasons.test.ts)
