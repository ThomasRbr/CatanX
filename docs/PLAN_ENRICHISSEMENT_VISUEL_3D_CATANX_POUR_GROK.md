# CatanX — Plan de rattrapage visuel 3D premium

## Mission pour Grok

La carte 3D orthographique est fonctionnelle, mais elle reste visuellement au stade prototype. Elle doit devenir un diorama médiéval low-poly riche, animé et cohérent, inspiré par la qualité de composition de Dorfromantik tout en restant entièrement original et propre à CatanX.

Cette mission n’est pas une nouvelle réécriture du renderer. Il faut enrichir le système existant avec de vrais modèles GLB, davantage de variations, une forte densité environnementale, des animations ambiantes, des effets de gameplay et une direction artistique stricte.

Ne pas considérer que des cônes, boîtes et cylindres procéduraux constituent les assets finaux.

---

## 1. Diagnostic actuel à accepter comme point de départ

- Le renderer Three.js/React Three Fiber existe et fonctionne.
- Le dépôt ne contient pratiquement aucun asset public réel : `public/assets` contient seulement un `.gitkeep` pour les textures.
- `meshCatalog.ts` annonce des URL GLB, mais la source visuelle réelle reste composée de géométries procédurales.
- Aucun chargement `useGLTF` ou `useTexture` n’est réellement utilisé dans la scène.
- Les forêts ne génèrent que 5 à 8 arbres par tuile et les autres biomes 2 à 6 objets en moyenne.
- Les décorations sont limitées aux arbres, broussailles, rochers, champs, pics et dunes.
- L’animation de l’eau est essentiellement une très légère pulsation de couleur.
- Les animations ambiantes sont rares et presque imperceptibles.
- La carte classique occupe une part trop faible de l’écran et flotte dans une vaste surface d’eau uniforme.
- Le terrain reste lisible comme une collection d’hexagones plats au lieu de former un paysage continu.

La priorité n’est donc plus d’ajouter des abstractions TypeScript. La priorité est de produire, charger, mettre en scène et animer du contenu visuel réel.

---

## 2. Résultat visuel exigé

À la fin de cette phase :

- chaque hexagone doit ressembler à un petit diorama ;
- aucune tuile terrestre ne doit paraître vide à zoom normal ;
- deux terrains voisins compatibles doivent former visuellement un ensemble continu ;
- chaque biome doit être identifiable par sa silhouette, pas seulement par sa couleur ;
- la carte doit sembler habitée avant même la construction des joueurs ;
- les routes, ports, villages et villes doivent ressembler à des éléments du monde, pas à des marqueurs techniques ;
- l’eau, les arbres, les champs, la fumée et les petits éléments vivants doivent bouger ;
- les animations doivent soutenir le gameplay sans rendre la carte illisible ;
- une capture sans HUD doit pouvoir servir d’image promotionnelle du prototype.

---

## 3. Direction artistique verrouillée

### Style

- Diorama 3D orthographique low-poly.
- Volumes doux, stylisés et légèrement exagérés.
- Palette pastel naturelle avec contrastes locaux suffisants.
- Éclairage chaud venant du nord-ouest.
- Ombres douces et occlusion de contact.
- Matériaux mats, rugueux, non photoréalistes.
- Petites imperfections de couleur et de forme.
- Pas de contour noir permanent.
- Pas de texture réaliste haute fréquence.
- Pas d’assets copiés ou extraits de Dorfromantik.

### Identité CatanX

- architecture médiévale miniature ;
- ressources visibles dans le paysage ;
- bannières et toits portant les couleurs des joueurs ;
- ports et commerce fortement représentés ;
- évolution visuelle des villes et technologies ;
- saisons et événements lisibles dans le monde ;
- figurines militaires sur socles discrets ;
- jetons de production intégrés comme pièces de plateau premium.

---

## 4. Pipeline d’assets obligatoire

### 4.0 Installation obligatoire de Blender

Blender n’est actuellement ni installé ni disponible dans le `PATH` de la machine. Grok doit commencer par installer Blender avant toute production artistique définitive.

Sous Windows, utiliser en priorité l’installation officielle ou `winget` :

```powershell
winget install --exact --id BlenderFoundation.Blender
```

Cette installation constitue une modification du système et doit être autorisée par l’utilisateur avant exécution. Si `winget` n’est pas disponible, télécharger Blender depuis le site officiel ou utiliser une version portable dans un dossier d’outils dédié.

Après installation, rechercher automatiquement l’exécutable dans :

```text
C:\Program Files\Blender Foundation\Blender *\blender.exe
```

Ne pas supposer que la commande `blender` est immédiatement ajoutée au `PATH`. Créer un script PowerShell de résolution :

```text
tools/blender/find-blender.ps1
```

Ce script doit :

1. tester `Get-Command blender` ;
2. rechercher les installations officielles ;
3. accepter `BLENDER_PATH` comme surcharge ;
4. retourner un chemin absolu ;
5. échouer avec une instruction claire si Blender est introuvable.

Vérifications obligatoires :

```powershell
& $blenderPath --version
& $blenderPath --background --factory-startup --python-expr "import bpy; print(bpy.app.version_string)"
```

Ajouter au `package.json` racine :

```json
{
  "scripts": {
    "assets:blender:check": "powershell -ExecutionPolicy Bypass -File tools/blender/check-blender.ps1",
    "assets:blender:generate": "powershell -ExecutionPolicy Bypass -File tools/blender/generate-all.ps1",
    "assets:blender:validate": "node scripts/validate-3d-assets.mjs",
    "assets:blender:previews": "powershell -ExecutionPolicy Bypass -File tools/blender/render-previews.ps1"
  }
}
```

Ne pas lancer la génération complète tant que `assets:blender:check` n’est pas vert.

### 4.1 Sources Blender versionnées

Créer et versionner :

```text
assets-src/blender/
├── art-bible/
├── environment/
├── buildings/
├── units/
├── ports/
├── wildlife/
├── materials/
└── previews/
```

Les fichiers `.blend` peuvent être utilisés pour les assets héroïques et les scènes étalons. Les modèles répétitifs doivent rester reproductibles depuis des scripts Python versionnés.

Ne jamais considérer le seul fichier GLB comme source de vérité lorsqu’un asset a été créé dans Blender. Conserver le `.blend` ou le script Python source.

### 4.2 Générateurs Python Blender

Créer :

```text
tools/blender/
├── check-blender.ps1
├── find-blender.ps1
├── generate-all.ps1
├── render-previews.ps1
├── lib/
│   ├── palette.py
│   ├── materials.py
│   ├── geometry.py
│   ├── modifiers.py
│   ├── composition.py
│   ├── validation.py
│   └── export_glb.py
└── generators/
    ├── generate_trees.py
    ├── generate_rocks.py
    ├── generate_mountains.py
    ├── generate_fields.py
    ├── generate_buildings.py
    ├── generate_ports.py
    ├── generate_units.py
    ├── generate_wildlife.py
    └── generate_props.py
```

Chaque générateur doit réellement construire les meshes dans Blender avec `bpy`, créer les matériaux, appliquer les transformations, fixer le pivot, valider le modèle et exporter le GLB.

Commande de référence :

```powershell
& $blenderPath `
  --background `
  --factory-startup `
  --python tools/blender/generators/generate_trees.py `
  -- `
  --output apps/client/public/assets/models/environment/trees `
  --preview assets-src/blender/previews/trees
```

### 4.3 Création physique des assets exigée

Grok doit produire les fichiers, pas seulement écrire le code qui pourrait un jour les produire.

Pour chaque lot d’assets, la livraison doit contenir :

- le script Python Blender ou le fichier `.blend` source ;
- les GLB exportés dans `apps/client/public/assets/models` ;
- une planche PNG de previews rendue par Blender ;
- les entrées du manifeste typé ;
- la licence et la provenance ;
- les tests de validation ;
- l’intégration effective avec `useGLTF` ou un loader partagé ;
- une capture de l’asset dans la scène CatanX.

Un asset n’est pas terminé si :

- seul son identifiant existe dans un catalogue ;
- son URL pointe vers un fichier absent ;
- il est encore remplacé par `meshCatalog.ts` ;
- il n’apparaît pas dans une vraie partie ;
- il n’a pas de preview ;
- son fichier source est introuvable.

### 4.4 Méthode de création d’un asset

Chaque modèle doit suivre ce cycle :

1. sélectionner une référence dans l’art bible ;
2. définir silhouette, palette, dimensions et budget polygonal ;
3. générer ou modéliser le mesh dans Blender ;
4. appliquer `flat shading` et corriger les normales ;
5. créer 2 à 4 variations significatives ;
6. appliquer les transformations et placer le pivot au sol ;
7. vérifier collisions visuelles et bounding box ;
8. exporter en GLB ;
9. rendre une preview orthographique avec le même éclairage que le jeu ;
10. charger le modèle dans CatanX ;
11. vérifier sa lisibilité aux trois niveaux de zoom ;
12. mesurer triangles, matériaux, taille disque et draw calls ;
13. documenter provenance et licence ;
14. remplacer le placeholder correspondant.

### 4.5 Rôle limité de l’actuel exporteur Node

`scripts/export-render3d-glb.mjs` peut rester comme fallback et outil de test, mais il ne doit plus être présenté comme pipeline premium. Ses GLB sont des miroirs des géométries procédurales de `meshCatalog.ts`.

À terme :

- les véritables GLB Blender deviennent la source visuelle principale ;
- `meshCatalog.ts` conserve seulement des fallbacks légers ;
- l’application charge les modèles premium avec `useGLTF` ;
- un échec de chargement déclenche le fallback sans casser la partie.

Créer :

```text
public/assets/models/environment/
public/assets/models/buildings/
public/assets/models/units/
public/assets/models/props/
public/assets/models/ports/
public/assets/models/wildlife/
public/assets/textures/
public/assets/materials/
public/assets/animations/
```

Ajouter un manifeste typé :

```ts
interface VisualAssetDefinition {
  id: string;
  url: string;
  category: string;
  biome?: TerrainType[];
  lod: 0 | 1 | 2;
  footprint: number;
  castsShadow: boolean;
  receivesShadow: boolean;
  animationClips?: string[];
  license: string;
  author: string;
}
```

Pour chaque modèle :

- format GLB ;
- pivot normalisé ;
- unité d’échelle commune ;
- transformations appliquées ;
- noms de nœuds stables ;
- matériaux regroupés ;
- nombre de triangles documenté ;
- miniature de validation ;
- provenance et licence ;
- fallback procédural uniquement en cas d’échec de chargement.

Créer un outil de validation qui refuse un asset :

- trop lourd ;
- sans licence ;
- sans bounding box valide ;
- avec trop de matériaux ;
- avec textures manquantes ;
- dépassant les budgets de triangles définis.

### Budgets par modèle

- petit décor : 50–400 triangles ;
- arbre ou rocher principal : 150–800 triangles ;
- bâtiment : 500–2 500 triangles ;
- unité : 500–2 000 triangles ;
- merveille : 2 000–6 000 triangles ;
- maximum de 1 à 3 matériaux par modèle.

---

## 5. Inventaire minimal d’assets premium

La première bibliothèque visuelle complète doit contenir au minimum :

### Nature

- 12 variantes d’arbres : conifères, chênes, bouleaux, arbres morts et arbres tropicaux ;
- 8 groupes d’arbres précomposés ;
- 8 buissons et plantes basses ;
- 12 variantes de rochers ;
- 8 formations montagneuses ;
- 6 collines ;
- 6 dunes ;
- 6 plaques de neige ou glace ;
- 8 formations marécageuses ;
- 6 végétations tropicales ;
- 6 ruines naturelles ou anciennes.

### Agriculture et ressources

- 6 champs cultivés ;
- 4 pâturages ;
- 4 troupeaux ;
- 4 mines et entrées de galerie ;
- 3 carrières ;
- 4 camps de bûcherons ;
- 4 gisements de ressources ;
- 4 moulins ;
- 4 chariots et stocks de marchandises.

### Vie du monde

- 6 animaux terrestres ;
- 4 oiseaux ou groupes d’oiseaux ;
- 4 bateaux ;
- 3 bancs de poissons ou silhouettes aquatiques ;
- 8 personnages civils très simples ;
- 12 petits accessoires : tonneaux, caisses, charrettes, puits, lanternes, panneaux, clôtures et pontons.

### Bâtiments

- colonie niveau 1 : 4 variantes ;
- village niveau 2 : 4 variantes ;
- ville niveau 3 : 4 variantes ;
- bâtiments économiques : 8 modèles ;
- bâtiments militaires : 6 modèles ;
- bâtiments scientifiques ou culturels : 6 modèles ;
- bâtiments religieux ou diplomatiques : 4 modèles ;
- merveilles : au moins 3 modèles ;
- murailles, tours, portes et bannières modulaires.

### Routes et ports

- chemin de terre ;
- route pavée ;
- pont ;
- carrefour ;
- bordures et bornes ;
- 4 styles de quai ;
- phare ;
- grue portuaire ;
- entrepôt ;
- 4 bateaux commerciaux ;
- 6 ensembles de marchandises spécialisées.

### Unités

- ouvrier ;
- colon ;
- éclaireur ;
- guerrier ;
- archer ;
- cavalier ;
- navire ;
- brigand ;
- variantes de couleur ou accessoires pour les civilisations.

Objectif : 120 à 180 modèles ou variantes réellement exploitables, et non des copies recolorées d’une même primitive.

---

## 6. Densité visuelle par biome

Remplacer les densités actuelles par des budgets proches des valeurs suivantes à LOD 0 :

- forêt : 24–42 arbres, 4–10 buissons, 2–5 rochers, 0–2 éléments narratifs ;
- jungle : 30–50 végétaux, 6–12 plantes basses, 1–3 ruines ou points singuliers ;
- prairie : 10–18 touffes, 3–8 fleurs, 2–6 animaux ou clôtures ;
- plaines agricoles : 16–30 rangées ou groupes de cultures, 1–3 accessoires agricoles ;
- collines : 8–16 rochers, 4–10 végétaux, 1–3 reliefs principaux ;
- montagne : 3–7 pics, 10–24 rochers, neige ou mine selon le contexte ;
- désert : 8–18 dunes, 4–10 rochers, 0–2 oasis ou ruines ;
- marais : 12–24 roseaux et plantes, 3–7 mares, troncs morts et brume ;
- côte : 8–18 rochers ou végétaux, plage, écume, ponton éventuel ;
- toundra/glacier : 6–14 rochers ou blocs de glace, neige irrégulière et végétation rare.

Utiliser l’instancing : ces densités ne doivent pas créer un draw call par objet.

À LOD 1, conserver environ 45 % des objets. À LOD 2, conserver seulement les silhouettes majeures.

### Libérer l’espace central

Le disque vide actuel autour du jeton rend les tuiles artificiellement nues. Modifier le système :

- placer le jeton légèrement au-dessus du décor ;
- autoriser des éléments bas sous le jeton ;
- masquer ou réduire le jeton à très courte distance si nécessaire ;
- réserver uniquement une petite zone aux objets hauts ;
- protéger précisément les intersections et arêtes au lieu de vider une grande portion de la tuile.

---

## 7. Composition procédurale, pas dispersion aléatoire

Chaque biome doit utiliser des « recettes de diorama » :

```ts
interface BiomeCompositionRecipe {
  focalPoints: VisualClusterRule[];
  edgeClusters: VisualClusterRule[];
  fillers: VisualScatterRule[];
  landmarks: VisualLandmarkRule[];
  exclusions: VisualExclusionRule[];
}
```

Exemples :

- forêt dense avec clairière centrale ;
- forêt traversée par route ;
- forêt en lisière de prairie ;
- montagne avec col ;
- montagne avec mine ;
- plaine avec champs concentriques ;
- côte rocheuse ;
- plage avec ponton ;
- désert avec dunes orientées par le vent ;
- ruines envahies par la végétation.

La graine choisit une recette, puis place des groupes cohérents. Ne pas répartir uniformément tous les objets dans un disque.

---

## 8. Continuité entre hexagones

Les hexagones peuvent rester techniquement séparés, mais le paysage doit masquer cette séparation :

- groupes d’arbres orientés vers les bords communs ;
- champs alignés entre cases compatibles ;
- chemins traversant réellement les arêtes ;
- rochers et végétation couvrant partiellement les jonctions ;
- plages et falaises calculées d’après les voisins ;
- rivières continues d’une arête à l’autre ;
- couleurs de sol légèrement mélangées sur les bordures ;
- grille affichée uniquement en interaction.

Créer un `NeighborVisualContext` pour chaque tuile et générer les éléments de bord à partir des six voisins.

---

## 9. Refonte de l’océan

Supprimer l’impression de grand disque pastel uniforme.

Créer :

- surface d’eau continue avec shader de vagues ;
- gradient de profondeur irrégulier épousant l’île ;
- écume animée près des côtes ;
- variations de normales ;
- petites vagues se déplaçant lentement ;
- ombres ou silhouettes de poissons ;
- bateaux ou bouées occasionnels ;
- bord extérieur fondu dans le brouillard plutôt qu’un cercle clairement visible.

Le shader doit exposer : temps, direction du vent, amplitude, couleur profonde, couleur côtière et intensité de l’écume.

---

## 10. Système d’animations ambiantes

Créer un `AmbientAnimationSystem` centralisé. Ne pas multiplier les `useFrame` indépendants pour chaque petit objet.

### Animations obligatoires

- balancement différencié des arbres et herbes ;
- ondulation des champs ;
- vagues et écume ;
- fumée des cheminées ;
- drapeaux et bannières ;
- rotation lente des moulins ;
- oiseaux suivant de petites trajectoires ;
- bateaux oscillant et naviguant ponctuellement ;
- animaux avec déplacements très courts ;
- torches ou lanternes à proximité des villes ;
- neige, pluie, feuilles ou poussière selon saison et événement.

Pour l’instancing, ajouter des attributs GPU :

- phase ;
- amplitude ;
- vitesse ;
- variation de couleur.

Animer le vent dans le vertex shader ou via `onBeforeCompile`, afin d’éviter une mise à jour CPU de chaque instance.

---

## 11. Animations de gameplay

Ajouter des séquences lisibles :

- construction : fondations, montée du bâtiment, poussière, petite impulsion lumineuse ;
- amélioration : transformation progressive ou remplacement animé ;
- production : ressource apparaissant sur la tuile puis allant vers le HUD ;
- pose de route : chemin se dessinant d’une extrémité à l’autre ;
- lancer de dés : réaction des jetons concernés ;
- déplacement : trajectoire avec easing et orientation de l’unité ;
- combat : anticipation, impact, recul, dégâts et disparition ;
- brigand : déplacement visible et assombrissement temporaire de la tuile ;
- recherche : lueur ou évolution de bâtiment ;
- victoire : caméra, bannières, particules et animation du territoire gagnant.

Chaque animation doit avoir une durée plafonnée et pouvoir être accélérée ou désactivée.

---

## 12. Villes réellement vivantes

Une colonie ne doit pas être une seule maison.

### Colonie

- 2 à 4 maisons ;
- feu de camp ou puits ;
- petit chemin vers les routes ;
- bannière du joueur.

### Village

- 5 à 8 bâtiments ;
- bâtiment central ;
- clôtures, caisses et activité civile ;
- fumée et lumière légère.

### Ville

- 8 à 15 bâtiments visibles ;
- murs, tours ou grande place ;
- silhouette propre à la civilisation ;
- bâtiments spécialisés visibles ;
- animation ambiante accrue.

La couleur du joueur doit apparaître sur les toits, bannières et détails, pas comme une teinte uniforme appliquée à toute la ville.

---

## 13. Éclairage et rendu premium

Améliorer la scène avec mesure des performances :

- color management sRGB ;
- ACES Filmic ;
- contact shadows ou SSAO légère ;
- ombres douces stabilisées ;
- lumière de remplissage froide discrète ;
- soleil chaud principal ;
- fog atmosphérique irrégulière ;
- légère variation de lumière selon les saisons ;
- bloom réservé aux effets magiques, feu et sélection ;
- vignette très faible ;
- pas de profondeur de champ permanente.

Les couleurs des terrains doivent contenir plusieurs valeurs internes. Éviter une surface entière d’une couleur plate.

---

## 14. Cadrage et présence à l’écran

Réduire les marges excessives du cadrage automatique :

- la carte classique doit occuper environ 65 à 75 % de la largeur utile hors HUD ;
- préserver une safe-zone pour les panneaux ;
- cadrer l’île, pas l’intégralité du grand plan d’eau ;
- proposer un bouton de vue cinématique sans jetons ni grille ;
- proposer un bouton de vue stratégique rétablissant tous les marqueurs.

---

## 15. Phases d’exécution

### Phase H1 — Art bible et scène étalon

- Obtenir l’autorisation d’installer Blender.
- Installer Blender et valider son exécution headless.
- Créer les scripts de résolution et de vérification de Blender.
- Créer palette, échelle, éclairage et règles de modélisation.
- Produire une scène étalon de 7 hexagones : forêt, plaine, montagne, prairie, désert, côte et océan.
- Inclure une route, une colonie, un port et un jeton.
- Produire réellement le premier lot d’au moins 20 GLB dans Blender : arbres, rochers, montagne, végétation, maisons, route, quai et accessoires.
- Rendre une planche de previews de ces modèles.
- Charger les GLB avec `useGLTF` dans la scène étalon et désactiver leurs placeholders procéduraux.
- Ne pas poursuivre avant validation visuelle de cette scène.

### Phase H2 — Pipeline GLB réel

- Finaliser les générateurs Python Blender et les sources `.blend`.
- Charger tous les GLB avec `useGLTF` ou un chargeur centralisé compatible instancing.
- Créer manifeste, préchargement, validation et fallback.
- Produire et intégrer le lot suivant d’assets définitifs.
- Vérifier mémoire GPU et draw calls.

### Phase H3 — Kit classique complet

- Produire tous les assets des biomes classiques.
- Implémenter recettes de composition et densités LOD.
- Refaire l’eau, les côtes et transitions.
- Remplacer tous les placeholders visibles de la carte classique.

### Phase H4 — Vie et animations

- Ajouter vent GPU, eau, fumée, bannières, moulins, animaux et bateaux.
- Ajouter animations de construction, production et route.
- Ajouter réglages de vitesse et réduction des animations.

### Phase H5 — Villes, ports et civilisations

- Créer colonies, villages et villes multi-bâtiments.
- Ajouter variations de civilisation.
- Enrichir ports et commerce.
- Ajouter routes pavées et ponts.

### Phase H6 — Biomes avancés et événements

- Jungle, marais, volcan, toundra, glacier, ruines, sacré, mine d’or et lacs.
- Événements localisés et variantes saisonnières.
- Fallback explicite pour tout biome encore incomplet.

### Phase H7 — Polish promotionnel

- Ajuster cadrage, lumière, post-traitement et densité.
- Corriger collisions visuelles.
- Créer vue cinématique.
- Capturer scènes de référence.
- Effectuer revue artistique complète à chaque résolution cible.

---

## 16. Critères d’acceptation

La passe visuelle n’est terminée que si :

1. Au moins 120 assets ou variantes premium sont réellement chargés ou instanciés.
2. Aucun biome classique ne dépend uniquement de primitives génériques.
3. Chaque tuile terrestre contient une composition dense et identifiable.
4. Les forêts forment des masses, pas des groupes de quelques cônes.
5. L’eau présente vagues, profondeur et écume visibles.
6. Au moins six familles d’animations ambiantes sont actives.
7. Construction, route, production et déplacement sont animés.
8. Colonies et villes sont des ensembles de bâtiments.
9. La carte classique occupe correctement l’écran.
10. Une vue sans HUD peut servir de capture promotionnelle.
11. Le jeu maintient 60 FPS sur carte classique et au moins 45 FPS sur grande carte.
12. Le mode sans animation et le fallback procédural restent fonctionnels.
13. Tous les assets possèdent une licence et une provenance documentées.
14. Typecheck, lint, tests, build et E2E visuels sont verts.
15. Blender peut régénérer les assets depuis une machine propre en suivant la documentation.
16. Chaque GLB premium possède une source `.blend` ou un générateur Python versionné.
17. Les previews Blender et les captures d’intégration sont disponibles pour chaque lot.
18. Les GLB Blender sont réellement chargés par le jeu ; `meshCatalog.ts` n’est plus la source visuelle principale.

---

## 17. Consignes finales pour Grok

- Commencer par la scène étalon H1, pas par produire 180 assets incohérents.
- Demander l’autorisation avant d’installer Blender ou tout autre logiciel système.
- Après autorisation, installer Blender et vérifier le mode headless avant de continuer.
- Créer physiquement les modèles et previews ; ne pas livrer uniquement des générateurs non exécutés.
- Présenter une capture avant/après à chaque phase.
- Ne pas déclarer une phase terminée sans métriques de densité et performances.
- Ne pas augmenter uniquement le nombre de primitives existantes.
- Ne pas ajouter d’effets post-process pour masquer le manque de contenu.
- Ne pas copier Dorfromantik ; reproduire une qualité de composition et de finition avec une identité originale.
- Ne pas modifier les règles du moteur pour résoudre un problème graphique.
- Utiliser l’instancing, le LOD et les matériaux partagés dès la première intégration GLB.
- Conserver les interactions et la lisibilité Catan au-dessus de toute décoration.

## Ordre de démarrage demandé

Implémenter uniquement H1 puis fournir :

1. la preuve d’installation et la version de Blender ;
2. les scripts `check`, `find`, `generate` et `previews` ;
3. la scène étalon de 7 hexagones ;
4. au moins 20 fichiers GLB Blender réellement générés ;
5. leurs sources `.blend` ou scripts Python ;
6. une planche de previews ;
7. une capture en vue normale et une en vue cinématique ;
8. l’art bible utilisée ;
9. FPS, draw calls, triangles et mémoire ;
10. les résultats de validation des assets, typecheck, tests et build.

Attendre la validation artistique de H1 avant H2.
