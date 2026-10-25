# Atmosphère, ciel et eau

Ciel, brouillard, lumière clé, océan et réflexions dérivaient auparavant chacun
leur propre palette et leur propre idée de la position du soleil. Ils étaient en
désaccord, ce qui produisait un horizon incohérent et un spéculaire pointant
nulle part. Tout part maintenant d'une seule description du ciel.

## Source de vérité

`render3d/env/atmosphere.ts` → `resolveAtmosphere({ season, climateId, cinematic, layer })`
renvoie un `AtmosphereGrade` : direction et couleur du soleil, zénith / horizon /
brume, rebond du sol, brouillard, hémisphérique, ambiante, intensité d'IBL et
palette d'eau (haut-fond / intermédiaire / grand fond).

Consommateurs :

| Module                     | Ce qu'il en tire                                 |
| -------------------------- | ------------------------------------------------ |
| `env/SkyDome.tsx`          | Le dégradé plein ciel et le disque solaire       |
| `SceneEnvironment.tsx`     | Rig 3 points + PMREM généré depuis ce même ciel  |
| `terrain/WaterSurface.tsx` | Corps de l'eau, réflexion du ciel, éclat solaire |
| `terrain/InlandWater.tsx`  | Lacs enclavés                                    |

La fonction de dégradé GLSL est partagée via `env/skyGlsl.ts`. Dupliquer ce
dégradé entre le dôme et l'eau est précisément ce qui désaligne la ligne
d'horizon : les deux échantillonnent la même fonction.

## Élévation solaire

Volontairement modeste (26° en hiver → 46° en été). Un soleil haut aplatit une
maquette : chaque toit et chaque crête perd son ombre portée et l'île se lit
comme un disque peint.

## Rig d'éclairage

Trois sources, pas six :

1. **Clé** — directionnelle chaude, seule à projeter des ombres.
2. **Remplissage ciel** — hémisphérique, porte tout ce que la clé manque.
3. **Rebond mer** — directionnelle faible, opposée au soleil.

L'ancien rig cumulait hémisphérique + ambiante + trois directionnelles + une
ponctuelle. Six sources faibles venant de six directions annulent mutuellement
leur modelé, et chaque matériau payait six évaluations de lumière par fragment.

## Océan

- Disque à anneaux **géométriques** (rayon 780) : dense près de l'île, grossier à
  l'horizon. Une grille uniforme assez fine pour les vagues coûterait des
  millions de triangles au loin.
- **Le brouillard est activé.** L'ancienne surface était un plan de 38 unités avec
  `fog={false}` : en dézoomant on voyait un rectangle sombre flottant dans le
  vide, ses quatre bords apparents.
- Le **champ de distance à la côte** (`env/shoreField.ts`) fait épouser au
  haut-fond turquoise le vrai littoral, au lieu d'un dégradé radial autour du
  centre du plateau.
- Fresnel + réflexion du ciel : c'est ce qui fait continuer la surface jusqu'à
  l'horizon plutôt que de s'arrêter sur une arête.

⚠️ Le **sens d'enroulement** des triangles de l'anneau compte. Une inversion
supprime l'océan entier par back-face culling, sans la moindre erreur.

⚠️ Le dôme se fixe au plan lointain en écrivant `w` dans `z`
(`gl_Position = clip.xyww`). C'est **incompatible avec `logarithmicDepthBuffer`**,
désactivé pour cette raison dans `DioramaRenderer`.

## Eau intérieure

Les terrains `lake` / `river` / `coast` sont filtrés hors de la surface
continue. Sans rendu propre, un lac est un trou hexagonal traversant l'île.
`InlandWater` ne couvre que l'eau **réellement enclavée** : un lac qui touche la
mer ouverte est déjà couvert par l'océan, et lui donner sa propre surface calée
sur la hauteur des berges fait flotter une dalle pâle au-dessus de l'eau.

## Houle

L'océan utilise une **houle de Gerstner** (trochoïdale), pas une somme de sinus.
Une somme de sinus produit des bosses symétriques : crêtes rondes, creux ronds.
L'eau réelle fait l'inverse — les particules décrivent des orbites, ce qui pince
les crêtes et aplatit les creux. Gerstner le reproduit en déplaçant aussi les
points **horizontalement** vers chaque crête.

Quatre vagues, avec dispersion en eau profonde (`v = √(g/k)`) : les grandes
longueurs d'onde vont plus vite, donc le motif ne se referme jamais sur
lui-même.

⚠️ Dans une vague de Gerstner, le produit `q·A` est fixé par la seule raideur.
**L'amplitude ne change donc pas la normale** — et donc aucun reflet. Pour
rendre la houle plus lisible il faut augmenter `steepness`, pas l'amplitude.

Trois effets s'y ajoutent :

- **Diffusion sous-surface** — quand une crête se lève entre l'œil et le soleil,
  l'eau y est assez fine pour transmettre. Ce vert à contre-jour est l'essentiel
  de ce qui distingue de l'eau d'un miroir teinté.
- **Écume de crête** pilotée par le jacobien : les moutons se forment là où la
  surface se **pince**, pas là où elle est haute.
- **Levée de fond** — l'amplitude décroît en approchant de la côte, via le champ
  de distance échantillonné aussi dans le vertex shader. Sans ça la houle du
  large garde toute sa course jusqu'à la plage et passe par-dessus le rivage.

Le facteur de levée de fond doit être **identique** dans le vertex et le
fragment, sinon l'ombrage décrit une autre surface que celle déplacée.
