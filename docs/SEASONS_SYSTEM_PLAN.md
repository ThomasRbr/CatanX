# Système de saisons CatanX — plan directeur

> **SUPERSEDÉ (19 juillet 2026).** Voir [`docs/SEASONS.md`](./SEASONS.md) pour l’extension simplifiée livrée (`catanx-seasons-v2`, 12 climats, schéma v5).

**Statut :** supersédé — implémentation dans `packages/engine/src/engine/seasons/`  
**Date de référence :** 18 juillet 2026  
**Propriétaire fonctionnel :** système de jeu CatanX  
**Périmètre :** moteur, interface, IA, audio/visuel, sauvegarde, replay, réseau et équilibrage

## 1. Décision produit

Le cœur de CatanX doit rester immédiatement reconnaissable comme un jeu de la famille Catan :

> lancer les dés → recevoir des ressources → négocier → construire → gagner des points.

Les saisons donnent son identité à CatanX en faisant évoluer publiquement les opportunités de l'île. Elles ne doivent pas transformer le jeu en simulation industrielle.

Décisions actées :

- le préréglage **CatanX** active les saisons ;
- le préréglage **CatanX** désactive les chaînes de production industrielles ;
- l'industrie et le craft restent disponibles comme extension optionnelle ;
- le système saisonnier agit d'abord sur les cinq ressources classiques : bois, argile, blé, mouton et minerai ;
- les règles normales de colonie, ville, route, commerce, brigand et victoire par points restent le socle ;
- les saisons utilisent des quantités entières et des effets visibles, jamais des multiplicateurs silencieux arrondis ;
- aucune saison ne doit ajouter une phase répétitive à chaque tour ;
- le module Événements peut enrichir les saisons, mais les saisons doivent fonctionner seules.

## 2. Promesse joueur

À tout instant, le joueur doit pouvoir répondre à quatre questions :

1. Quelle est la saison actuelle ?
2. Quel avantage concret produit-elle ?
3. Quand changera-t-elle ?
4. Quelle sera la prochaine saison et comment puis-je m'y préparer ?

La sensation recherchée est :

- **anticipation** : voir venir un changement et ajuster ses échanges ou constructions ;
- **adaptation** : exploiter une opportunité sans abandonner son plan principal ;
- **interaction** : la nouvelle rareté stimule les échanges entre joueurs ;
- **lisibilité** : comprendre l'effet sans consulter un manuel ;
- **monde vivant** : voir et entendre l'île changer.

## 3. Garde-fous « rester Catan »

### 3.1 Invariants

- Un lancer de dés reste la source principale de ressources.
- Une colonie produit normalement 1 ressource et une ville 2.
- Construire et commercer restent plus importants que gérer un moteur de production.
- Les cinq ressources classiques conservent leur rôle et leurs coûts familiers.
- Une saison modifie une décision existante ; elle ne crée pas une seconde feuille de jeu.
- Les effets sont publics et symétriques.
- Les ports spécialisés restent meilleurs que tout avantage commercial saisonnier éventuel.
- Le brigand conserve son rôle de frein et bloque aussi les éventuels bonus saisonniers de la tuile.
- La victoire par points reste la condition par défaut.

### 3.2 Non-objectifs du système principal

- pas de farine, pain, acier, outils ou autres ressources intermédiaires ;
- pas d'ouvriers à affecter ;
- pas de file de fabrication multi-tours ;
- pas d'entretien économique saisonnier ;
- pas de famine automatique retirant des cartes ;
- pas de météo cachée décidant arbitrairement du vainqueur ;
- pas de nouvelle monnaie ;
- pas de points de victoire distribués directement par les saisons dans la première version ;
- pas de mini-jeu différent pour chaque saison.

## 4. État actuel et écarts

### 4.1 Éléments déjà présents

- type `Season` avec printemps, été, automne et hiver ;
- état `season` et compteur `seasonTurn` dans `GameState` ;
- changement automatique après quatre tours globaux ;
- modificateurs de production dans `SEASON_EFFECTS` ;
- widget de saison dans le HUD ;
- teintes, éclairages, particules et transitions 2D/3D ;
- sons de transition ;
- listes d'événements thématiques par saison.

### 4.2 Problèmes à corriger

- les multiplicateurs fractionnaires sont souvent annulés par `Math.floor` : une colonie produisant 1 reste à 1 avec un bonus de 20 % ;
- `movementModifier` et `specialEvents` sont déclarés mais ne pilotent pas encore de règle complète ;
- l'interface n'affiche qu'une partie des modificateurs ;
- le compteur affiché et la frontière exacte du changement de saison doivent être spécifiés sans ambiguïté ;
- le moteur saisonnier est dispersé entre types, collecte et avancement de tour ;
- la carte CatanX peut produire des ressources avancées même lorsque les chaînes industrielles sont désactivées ;
- plusieurs modules avancés consomment encore des ressources non classiques ;
- aucune IA ne planifie explicitement en fonction de la prochaine saison ;
- aucun test dédié ne couvre le calendrier complet, les bonus entiers, le brigand et la sérialisation saisonnière.

## 5. Règle cible — version 1

### 5.1 Calendrier

- Ordre fixe initial : **printemps → été → automne → hiver**.
- Départ standard : printemps.
- Durée standard : **4 tours globaux complets** par saison.
- Un tour global est terminé lorsque chaque joueur a joué une fois.
- Le changement intervient après la fin du quatrième tour global de la saison.
- Une année complète dure 16 tours globaux.
- Le calendrier est déterministe et inclus dans les sauvegardes/replays.
- Les scénarios pourront choisir une saison de départ et une durée différente, sans modifier le preset standard.

Le HUD affiche :

- `Tour saisonnier 2/4` ;
- `Prochaine saison : Été` ;
- l'effet actuel en une phrase ;
- l'effet de la prochaine saison sous forme d'aperçu.

### 5.2 Abondance saisonnière

Chaque saison possède deux ressources favorisées. La production normale est calculée en premier. Ensuite :

- si un joueur a produit au moins une ressource favorisée pendant ce lancer, il reçoit **au maximum 1 carte bonus saisonnière** ;
- si les deux ressources favorisées ont été produites, la priorité publique inscrite sur la saison détermine le bonus ;
- le plafond est appliqué par joueur et par lancer, pas par tuile ni par bâtiment ;
- une ville augmente toujours la production normale, mais pas le plafond saisonnier ;
- une tuile bloquée par le brigand ne contribue ni à la production normale ni à l'éligibilité saisonnière ;
- aucun bonus n'est accordé sur un 7 ;
- si la banque ne possède plus la ressource dans une future implémentation à stock limité, la règle classique de disponibilité s'applique aussi au bonus.

Cette règle est volontairement entière, modérée et facile à expliquer. Elle rend les saisons visibles sans doubler l'économie.

### 5.3 Calendrier d'abondance candidat

Les valeurs ci-dessous constituent le point de départ des tests, pas un équilibrage définitif.

| Saison    | Priorité 1 | Priorité 2 | Lecture stratégique                       |
| --------- | ---------- | ---------- | ----------------------------------------- |
| Printemps | mouton     | blé        | développement des nouvelles colonies      |
| Été       | argile     | minerai    | construction et expansion plus agressives |
| Automne   | blé        | bois       | récolte et préparation du réseau          |
| Hiver     | minerai    | bois       | consolidation, villes et routes préparées |

Principes d'équilibrage :

- chaque ressource doit être favorisée au moins une fois par année ;
- les ressources structurellement rares ne doivent pas devenir dominantes à cause du bonus ;
- une position initiale ne doit pas devenir manifestement gagnante uniquement parce qu'elle couvre la première saison ;
- les probabilités 6/8 restent plus importantes que la saison ;
- le bonus doit augmenter les échanges, pas rendre les échanges inutiles.

### 5.4 Prévision

- La saison suivante est toujours publique.
- En version 1, l'ordre est fixe : aucune mémorisation n'est exigée car le HUD l'affiche.
- L'aperçu indique les deux ressources favorisées et le nombre de tours restants.
- Le changement est annoncé au début du dernier tour global de la saison.
- Aucune fenêtre modale ne bloque tous les joueurs lors d'un simple changement.

### 5.5 Transition

Lors du changement :

1. terminer toutes les résolutions du tour global courant ;
2. incrémenter le calendrier ;
3. enregistrer un événement moteur `season_changed` ;
4. mettre à jour les éventuelles pondérations d'événements ;
5. diffuser le nouvel état ;
6. jouer la transition visuelle et sonore côté client ;
7. afficher une notification non bloquante ;
8. commencer le nouveau compteur à `1/4`.

La transition ne doit jamais :

- interrompre un échange en cours ;
- modifier rétroactivement une production ;
- demander une commande à un joueur absent ;
- dépendre de l'animation client pour avancer le moteur.

## 6. Préparation saisonnière — version 2 conditionnelle

Cette couche ne sera ajoutée que si les tests montrent que la prévision seule ne crée pas assez de décisions.

Une fois par saison, chaque joueur pourrait choisir une préparation publique parmi trois options simples :

- **Récolte** : le premier bonus saisonnier reçu pendant chaque tour global peut suivre la seconde priorité si le joueur la produit ;
- **Commerce** : une fois pendant la saison, améliorer d'un cran un échange avec la banque, sans dépasser un port spécialisé 2:1 ;
- **Réserve** : lors du premier 7 de la saison, augmenter de 2 le seuil de main avant défausse.

Contraintes :

- une seule décision au début de la saison, jamais à chaque tour ;
- choix public et iconographique ;
- choix automatique sûr en cas de délai réseau ;
- aucune préparation ne donne directement de PV ;
- aucune ne doit être obligatoire pour comprendre ou apprécier le module ;
- si le temps de partie augmente de plus de 5 %, abandonner ou automatiser cette couche.

## 7. Articulation avec les autres modules

### 7.1 Événements

Lorsque le module Événements est actif :

- la saison pondère les événements compatibles au lieu de garantir un événement ;
- un même événement climatique majeur ne peut pas se répéter dans la même saison ;
- un événement peut neutraliser ou déplacer un bonus, mais doit l'annoncer explicitement ;
- sans le module Événements, aucune règle saisonnière ne disparaît.

Exemples :

- printemps : fortes pluies, pèlerinage, bonne récolte ;
- été : sécheresse, incendie, ruée ;
- automne : migration, essor commercial, raid ;
- hiver : blizzard, hiver rude, fatigue de guerre.

### 7.2 Technologies

Pour la première version : aucune technologie ne multiplie le bonus saisonnier.

Évolution possible : une technologie de prévision peut révéler un événement saisonnier futur, mais ne doit pas rendre le calendrier inaccessible aux joueurs sans technologie.

### 7.3 Armées et barbares

Le `movementModifier` actuel reste désactivé dans la première version. Une pénalité globale de mouvement en hiver risquerait de rendre un module externe moins agréable.

Évolution possible après tests :

- effets uniquement sur certains terrains ;
- coûts ou limites annoncés une saison à l'avance ;
- IA et pathfinding testés avant activation ;
- aucun effet militaire lorsque le module Armées est désactivé.

### 7.4 Diplomatie et conseil mondial

- Les saisons ne créent pas de ressource diplomatique.
- Le Conseil peut exceptionnellement modifier la prochaine saison via une résolution, mais seulement dans une version ultérieure.
- Une résolution doit être déterministe, publique et limitée à une saison.

### 7.5 Industrie et craft avancés

- Extension désactivée par défaut dans CatanX.
- Les ressources transformées ne reçoivent aucun bonus d'abondance direct.
- Si l'extension est activée, elle consomme les ressources obtenues normalement et saisonnièrement.
- Les saisons ne gèrent ni ouvriers ni progression des recettes.
- Un profil de partie combinant saisons et industrie doit être équilibré séparément ; il ne définit pas l'expérience CatanX principale.

### 7.6 Brouillard de guerre

- Le calendrier et les effets saisonniers restent publics malgré le brouillard.
- Les effets visuels ne doivent jamais révéler une unité ou un bâtiment caché.

## 8. Économie à cinq ressources — migration progressive

Désactiver les chaînes industrielles supprime le craft automatique du preset, mais ne suffit pas encore à garantir que toutes les tuiles et tous les modules n'utilisent que cinq ressources.

### 8.1 Audit obligatoire

Inventorier :

- productions de chaque `TerrainType` ;
- coûts de bâtiments ;
- coûts et entretiens militaires ;
- coûts technologiques ;
- récompenses d'événements ;
- conditions de victoire ;
- échanges et ports ;
- effets des civilisations.

### 8.2 Politique cible

Trois catégories explicites :

1. **Ressources classiques** : bois, argile, blé, mouton, minerai — toujours actives.
2. **Ressources de module** : science et influence, uniquement sous forme de compteurs clairement rattachés à leur module, pas comme cartes de production ordinaires.
3. **Ressources industrielles** : toutes les matières rares et transformées, uniquement si l'extension industrie est active.

### 8.3 Compatibilité de carte

Lorsque l'industrie est désactivée, les biomes exotiques peuvent rester visuellement présents, mais leur production doit être convertie vers une ressource classique cohérente ou devenir une caractéristique sans carte de ressource supplémentaire.

Une table de conversion devra être validée. Exemple de travail :

| Terrain exotique            | Production principale (sans industrie) |
| --------------------------- | -------------------------------------- |
| rivière / lac               | blé                                    |
| jungle                      | bois                                   |
| toundra                     | mouton                                 |
| volcan / mine d'or / ruines | minerai                                |
| marécage                    | argile                                 |
| sacré                       | aucune carte                           |
| côte / océan / glacier      | aucune production terrestre            |

Implémenté via `getBaseProduction` (`MapGenerator`) et `classicBaseProduction`.

La conversion ne doit pas être livrée avant :

- inventaire complet des coûts ;
- test de disponibilité de chaque ressource classique par graine ;
- test des positions de départ ;
- validation que les modules actifs restent jouables.

## 9. Architecture moteur cible

### 9.1 Nouveau domaine

Créer `packages/engine/src/engine/seasons/SeasonSystem.ts` comme source unique des règles saisonnières.

API pure proposée :

```ts
export interface SeasonDefinition {
  id: Season;
  durationRounds: number;
  favoredResources: readonly ClassicResourceType[];
  description: string;
  next: Season;
}

export interface SeasonClock {
  current: Season;
  roundInSeason: number;
  year: number;
}

export interface SeasonalProductionBonus {
  playerId: string;
  resource: ClassicResourceType;
  amount: 1;
  season: Season;
}

export function getSeasonDefinition(season: Season): SeasonDefinition;
export function getNextSeason(season: Season): Season;
export function advanceSeasonClock(clock: SeasonClock): SeasonAdvanceResult;
export function calculateSeasonalBonuses(
  normalProduction: readonly CollectionResult[],
  state: GameState,
): SeasonalProductionBonus[];
```

### 9.2 Séparation des responsabilités

- `SeasonSystem` décide du calendrier et des bonus.
- `ResourceSystem` calcule la production normale puis appelle le système saisonnier.
- `GameEngine` déclenche l'avancement du calendrier à la frontière du tour global.
- `EventSystem` ne lit que la saison publique pour pondérer ses événements.
- React/Three/Pixi ne calculent aucune règle.
- Le serveur ne fait qu'appliquer les commandes via le moteur autoritaire.

### 9.3 Types

Introduire un type restreint :

```ts
export type ClassicResourceType = 'wood' | 'clay' | 'wheat' | 'sheep' | 'ore';
```

Ne pas utiliser `string` pour les clés des effets saisonniers.

Remplacer progressivement `SeasonEffect` par une définition explicite. Supprimer les champs non utilisés ou les déplacer vers des extensions typées :

- `movementModifier` vers l'intégration militaire future ;
- `specialEvents` vers une table du module Événements ;
- `productionModifiers` vers `favoredResources` et la règle entière.

### 9.4 État et événements

État recommandé :

- conserver `season` pendant la migration ;
- renommer conceptuellement `seasonTurn` en `roundInSeason` ;
- ajouter `seasonYear` si `year` actuel n'a pas cette sémantique ;
- calculer la prochaine saison, ne pas la stocker si elle est strictement dérivable ;
- stocker une préparation par joueur uniquement si la version 2 est retenue.

Événements moteur recommandés :

- `season_about_to_change` ;
- `season_changed` ;
- `seasonal_bonus_awarded`.

Chaque événement doit contenir les données nécessaires à l'UI et au replay, sans texte localisé dans le moteur.

## 10. Déterminisme, sauvegarde et réseau

### 10.1 Déterminisme

- Aucun `Math.random()`.
- L'ordre fixe ne consomme pas la source aléatoire.
- Toute météo future utilise `RandomSource` injecté et journalisé.
- Le calcul du bonus suit une priorité stable, jamais l'ordre d'itération accidentel d'un objet.
- À graine et commandes identiques, les événements saisonniers sont identiques.

### 10.2 Sauvegardes

- Augmenter `schemaVersion` uniquement si la forme persistée change.
- Migration : convertir l'ancien `seasonTurn` vers la nouvelle horloge.
- Borner les valeurs invalides à 1–4 et revenir au printemps si la saison est inconnue.
- Une sauvegarde avec saisons désactivées ne doit pas avancer le calendrier.
- Une sauvegarde legacy avec craft actif conserve ce module lors du chargement ; le changement de preset ne réécrit pas les parties existantes.

### 10.3 Multijoueur

- Seul le serveur avance la saison et accorde les bonus.
- Le client reçoit l'état et les événements, sans prédiction de règle irréversible.
- Une reconnexion récupère saison, compteur et notification en cours sans rejouer le bonus.
- Le changement de saison est atomique avec la fin du tour global.
- Les animations sont tolérantes aux événements reçus en retard.

## 11. Interface et expérience

### 11.1 Widget principal

Le `SeasonWidget` doit contenir au maximum :

- nom et icône de la saison ;
- progression `2/4` ;
- deux ressources favorisées ;
- phrase de règle ;
- prochaine saison repliable ou compacte.

Interactions :

- survol/clic : explication complète ;
- focus clavier : mêmes informations ;
- aucune information uniquement transmise par la couleur ;
- aucun emoji utilisé comme seul pictogramme fonctionnel.

### 11.2 Production

Lors d'un lancer :

- afficher la production normale ;
- distinguer `+1 Saison` sans créer une seconde fenêtre ;
- animer une seule fois par joueur, même si plusieurs tuiles sont éligibles ;
- expliquer pourquoi aucun bonus n'est reçu lorsqu'une tuile est bloquée.

### 11.3 Transition audiovisuelle

- Durée cible : 1,0 à 1,8 seconde.
- Notification non modale.
- Variation d'éclairage progressive.
- Particules limitées selon le niveau de détail.
- Son court avec volume dépendant des réglages.
- Option « réduire les animations » : fondu simple inférieur à 300 ms.
- Aucun flash rapide ou contraste dangereux.

### 11.4 Carte

- Teinte saisonnière subtile : ne pas masquer couleurs de joueurs, numéros ou terrains.
- Les tuiles produisant une ressource favorisée peuvent recevoir un liseré uniquement lors de l'aide ou du survol du widget.
- Les changements décoratifs n'altèrent jamais la hitbox.
- Parité fonctionnelle entre rendu Three.js et rendu Pixi legacy tant que les deux existent.

### 11.5 Configuration de partie

- Le preset CatanX explique : `Économie classique, île vivante et saisons`.
- Industrie/craft porte explicitement la mention `extension optionnelle`.
- Une info-bulle explique qu'activer l'industrie ajoute des ressources et de la gestion.
- Une configuration incompatible est refusée par le validateur avec un message français précis.

## 12. IA

### 12.1 Version minimale

L'IA doit :

- valoriser légèrement les ressources favorisées actuelles ;
- valoriser la prochaine saison avec un poids inférieur à la saison actuelle ;
- ne jamais sacrifier une probabilité 6/8 forte pour un faible bonus saisonnier ;
- tenir compte du plafond de +1 par lancer ;
- rechercher des échanges avant un changement si une construction devient accessible.

### 12.2 Placement initial

Score candidat :

```text
score = valeur probabiliste classique
      + couverture des cinq ressources
      + faible bonus de saison initiale
      + bonus encore plus faible de saison suivante
```

Le bonus saisonnier cumulé ne doit jamais dépasser 10 % du score de placement de base avant calibration.

### 12.3 Mesures IA

- taux de victoire par position dans l'ordre ;
- taux de victoire selon couverture des ressources favorisées ;
- échanges par saison ;
- constructions par saison ;
- cartes saisonnières bonus obtenues ;
- durée moyenne des tours autour d'une transition.

## 13. Équilibrage et télémétrie locale

### 13.1 Indicateurs

- ressources normales produites par joueur et par type ;
- bonus saisonniers par joueur et par type ;
- part saisonnière de l'économie totale ;
- nombre d'échanges joueur-joueur et banque ;
- durée moyenne d'une partie ;
- tour global du premier à 10/15 PV ;
- écart de ressources entre premier et dernier ;
- corrélation entre bonus saisonniers et victoire ;
- fréquence des mains supérieures à 7 ;
- impact des saisons sur les ports.

### 13.2 Seuils de départ

- bonus saisonniers : cible de 8 à 15 % des ressources totales ;
- allongement de partie : entre -5 % et +10 % par rapport au même preset sans saisons ;
- temps de décision supplémentaire : moins de 5 % en version 1 ;
- avantage du premier joueur : ne pas augmenter de plus de 2 points de pourcentage ;
- aucune ressource ne doit représenter plus de 30 % des bonus annuels sans justification ;
- au moins 95 % des joueurs test doivent pouvoir expliquer l'effet actuel après un tour complet.

### 13.3 Protocole de simulation

- graines fixes puis graines aléatoires contrôlées ;
- 2, 3 et 4 joueurs ;
- cartes tiny, small et medium ;
- comparaison saisons ON/OFF ;
- minimum 1 000 parties IA par variante avant verrouillage des valeurs ;
- analyse séparée des parties avec et sans autres modules ;
- conservation des métriques agrégées, sans données personnelles.

## 14. Plan de tests

### 14.1 Tests unitaires

- ordre printemps → été → automne → hiver → printemps ;
- quatre tours globaux exacts par saison ;
- module désactivé = aucun avancement et aucun bonus ;
- une production favorisée = +1 ;
- deux productions favorisées = un seul +1 selon priorité ;
- production non favorisée = aucun bonus ;
- ville = production normale correcte, bonus plafonné ;
- plusieurs bâtiments = bonus plafonné ;
- brigand = aucune production ni éligibilité sur la tuile bloquée ;
- lancer 7 = aucun bonus ;
- absence de résultat = aucun objet bonus vide ;
- ordre des maps/objets sans influence sur le résultat.

### 14.2 Tests d'intégration moteur

- partie créée avec preset CatanX : saisons ON, industrie OFF ;
- partie personnalisée : industrie activable explicitement ;
- collecte complète avec événements `seasonal_bonus_awarded` ;
- changement de saison à la frontière du tour global ;
- replay identique à l'état original ;
- sauvegarde/chargement au tour 4/4 ;
- reconnexion juste avant et juste après transition ;
- coexistence avec événements ON/OFF ;
- coexistence avec brigand et défausse sur 7.

### 14.3 Tests de propriétés

- bonus toujours entier et positif ;
- bonus total par joueur/lancer ≤ 1 ;
- bonus uniquement dans les cinq ressources classiques ;
- aucune mutation du résultat de production normal ;
- saison valide après N avancements arbitraires ;
- déterminisme pour toute graine de test.

### 14.4 Tests UI

- widget affiche saison, progression, effet et prochaine saison ;
- lecture clavier et lecteur d'écran ;
- bonus distingué dans la notification de collecte ;
- animation réduite respectée ;
- pas de débordement à 1280×720, 1920×1080 et ultrawide ;
- contraste AA ;
- rendu Three/Pixi cohérent ;
- absence du panneau craft dans le preset CatanX standard.

### 14.5 Tests E2E

- lancer une partie CatanX depuis le menu ;
- vérifier `enableSeasons=true` et `enableProductionChains=false` ;
- faire avancer quatre tours globaux ;
- constater la transition ;
- sauvegarder avant transition, recharger et reproduire le même résultat ;
- rejoindre une partie réseau pendant une saison en cours.

## 15. Performance

- Calcul saisonnier O(nombre de résultats de collecte), sans parcourir toute la carte.
- Définitions immuables chargées une seule fois.
- Aucun nouveau rendu React par tuile à chaque tick visuel.
- Particules instanciées et limitées par LOD.
- Budget indicatif : moins de 0,2 ms moteur par résolution de production standard desktop.
- Aucun nouvel asset bloquant le premier affichage de la carte.

## 16. Accessibilité et localisation

- Toutes les chaînes visibles passent par l'i18n.
- Ne pas stocker `Printemps` dans l'état moteur ; stocker `spring`.
- Couleur + icône + texte pour chaque saison.
- Mode daltonien vérifié.
- Annonce ARIA polie lors d'un changement, sans voler le focus.
- Préférence de réduction de mouvement respectée.
- Tutoriel disponible en français dès la version 1 ; autres langues ajoutées sans modifier les règles.

## 17. Risques et réponses

| Risque                               | Impact                       | Réponse                                              |
| ------------------------------------ | ---------------------------- | ---------------------------------------------------- |
| Inflation de ressources              | parties trop courtes         | plafond +1 par joueur/lancer, simulations            |
| Avantage d'un placement initial      | victoire prédéterminée       | poids saisonnier faible, calendrier annuel équilibré |
| Règle invisible à cause des arrondis | perte de confiance           | bonus entier et journalisé                           |
| Trop de fenêtres                     | tours plus lents             | transitions non modales, aucune décision en v1       |
| Modules couplés                      | bugs combinatoires           | API saison pure et intégrations opt-in               |
| Ressources avancées encore actives   | promesse produit incohérente | audit et migration en phase 0                        |
| Sauvegardes cassées                  | perte de partie              | migration versionnée et fixtures legacy              |
| Désynchronisation réseau             | état divergent               | serveur seul autoritaire, événement atomique         |
| Effets visuels illisibles            | information masquée          | teintes faibles, tests contraste et LOD              |
| Hiver perçu comme punition           | frustration                  | opportunité différente, pas de retrait automatique   |

## 18. Découpage de livraison

### Phase S0 — Verrouiller le socle économique

Livrables :

- preset CatanX avec industrie désactivée ;
- libellés UI explicites ;
- test de non-régression du preset ;
- inventaire des ressources avancées encore accessibles ;
- décision sur la conversion des biomes exotiques.

Critère de sortie : une partie CatanX standard ne lance aucun système de craft ou de marché industriel.

### Phase S1 — Extraire l'horloge saisonnière

Livrables :

- `SeasonSystem.ts` ;
- définition typée des quatre saisons ;
- frontière exacte des quatre tours globaux ;
- événements moteur de transition ;
- tests unitaires du calendrier.

Critère de sortie : 100 cycles complets déterministes sans décalage.

### Phase S2 — Production saisonnière entière

Livrables :

- suppression des multiplicateurs fractionnaires du cœur ;
- bonus plafonné ;
- événements de collecte détaillés ;
- gestion brigand/7/ville ;
- tests unitaires et propriétés.

Critère de sortie : aucune production saisonnière silencieusement arrondie et aucun bonus supérieur au plafond.

### Phase S3 — HUD et prévision

Livrables :

- widget restructuré ;
- prochaine saison visible ;
- notification de bonus ;
- aide contextuelle ;
- accessibilité clavier/ARIA.

Critère de sortie : un nouveau joueur identifie l'effet et le prochain changement sans ouvrir le guide.

### Phase S4 — Monde vivant

Livrables :

- transitions Three.js et Pixi cohérentes ;
- ambiance sonore ;
- réduction de mouvement ;
- profil LOD/performance ;
- tests de lisibilité.

Critère de sortie : changement immédiatement perceptible sans gêner la lecture du plateau.

### Phase S5 — IA et équilibrage

Livrables :

- heuristiques saisonnières ;
- métriques du simulateur ;
- campagne de 1 000+ parties par variante ;
- ajustement du calendrier d'abondance.

Critère de sortie : seuils de la section 13 respectés.

### Phase S6 — Événements et modules

Livrables :

- pondération événementielle par saison ;
- tests combinatoires avec tech, armées, conseil et barbares ;
- suppression ou implémentation explicite des champs saisonniers morts.

Critère de sortie : saisons seules et saisons combinées restent jouables et déterministes.

### Phase S7 — Persistance et réseau

Livrables :

- migration de snapshot ;
- fixtures legacy ;
- replay ;
- reconnexion ;
- E2E local et réseau.

Critère de sortie : même résultat avant/après sauvegarde et aucune double attribution à la reconnexion.

### Phase S8 — Préparation saisonnière éventuelle

Cette phase est conditionnelle aux playtests. Elle ne démarre que si la version 1 est lisible mais manque de décisions anticipatives.

Critère de sortie : décision intéressante, moins de 5 % de temps supplémentaire et absence d'option dominante.

## 19. Ordre de modification des fichiers

1. `packages/engine/src/types/resources.ts` — type des ressources classiques.
2. `packages/engine/src/types/events.ts` — définition saisonnière nettoyée.
3. `packages/engine/src/engine/seasons/SeasonSystem.ts` — règles pures.
4. `packages/engine/src/engine/resources/ResourceSystem.ts` — intégration après production normale.
5. `packages/engine/src/engine/game/GameEngine.ts` — horloge et événements.
6. `packages/protocol/src/index.ts` — événements/commandes si nécessaires.
7. snapshot et migrations — persistance.
8. `apps/client/src/components/HUD/SeasonWidget.tsx` — information.
9. rendus Three/Pixi et son — présentation.
10. IA et simulateur — stratégie et métriques.
11. tests moteur, UI et E2E — validation complète.
12. `RULES_CATALOG.md`, `VALIDATION.md` et guide joueur — documentation finale.

## 20. Critères d'acceptation globaux

Le système est terminé lorsque :

- le preset CatanX utilise les saisons et n'active pas l'industrie ;
- la boucle dés/ressources/commerce/construction reste centrale ;
- les effets saisonniers portent sur les cinq ressources classiques ;
- chaque bonus est entier, visible et explicable ;
- la prochaine saison est toujours consultable ;
- le brigand, les villes et le 7 ont un comportement spécifié et testé ;
- aucun effet ne dépend d'un ordre d'itération non garanti ;
- replay, sauvegarde et réseau produisent le même résultat ;
- l'IA tient compte des saisons sans surévaluer leur effet ;
- les objectifs d'équilibrage et de performance sont atteints ;
- l'interface est lisible, accessible et compatible avec la réduction de mouvement ;
- la documentation joueur correspond exactement au moteur.

## 21. Définition de « unique » pour CatanX

Le système ne sera pas considéré comme unique parce qu'il ajoute beaucoup de contenu. Il le sera si les joueurs racontent naturellement ce type d'histoire :

> « Je voyais l'hiver arriver, j'ai échangé mon blé avant que le minerai devienne abondant, puis j'ai construit ma ville au bon moment. »

L'identité recherchée est donc une **anticipation publique sur un plateau vivant**, exprimée avec les composants et les décisions familières de Catan.
