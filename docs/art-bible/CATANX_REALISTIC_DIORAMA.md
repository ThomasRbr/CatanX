# CatanX — bible du diorama réaliste

## Intention

Le monde de CatanX est une île crédible observée comme une maquette architecturale haut de
gamme. Les matériaux, la lumière et la météo sont réalistes ; les proportions des pièces de jeu
restent légèrement amplifiées pour conserver une lecture stratégique immédiate.

Le rendu ne doit jamais évoquer un jouet en plastique, un dessin animé ou une collection de
prismes colorés. Le plateau doit toutefois rester plus clair qu'une photographie aérienne réelle.

## Règles visuelles non négociables

- Les terrains utilisent une palette naturelle et désaturée, des normales, de la rugosité et une
  variation d'albédo à plusieurs échelles.
- Les couleurs des joueurs sont des accents d'émail, de textile ou de signalétique. Elles ne
  remplacent jamais le bois, la pierre, la terre ou le métal d'un objet entier.
- Les hexagones sont une structure de règle. Leur contour apparaît au survol, pendant une action
  ou lorsque la grille est activée, pas comme une bordure permanente.
- Les routes et bâtiments restent volontairement plus larges et plus hauts que leur échelle réelle.
- Le fantastique lumineux est réservé au Cristal, à l'Éther, aux terrains sacrés et aux effets qui
  le justifient.
- Le HUD reste contemporain : verre fumé, typographie Sora/Inter, icônes nettes, aucun parchemin.

## Matières

| Famille | Réponse attendue |
| --- | --- |
| Sol | rugosité 0,82–0,98, microrelief mat, variations larges peu saturées |
| Pierre | rugosité 0,68–0,9, cassures et stratification, métal quasi nul |
| Bois | fibres visibles, rugosité 0,58–0,82, reflets doux |
| Métal | métal 0,55–0,9 selon usure, rugosité 0,28–0,65 |
| Eau | réflexion environnementale, normales croisées, écume côtière |
| Glace | rugosité 0,25–0,5, clearcoat discret, jamais blanc uniforme |
| Textile | rugosité forte, couleur de joueur lisible sans émission permanente |

## Lisibilité

- Une colonie, une ville et une métropole doivent être distinguables par leur silhouette en LOD2.
- Une route doit rester traçable sur toute une carte epic, y compris sous la neige.
- Les numéros 6 et 8 conservent leur priorité visuelle sans utiliser un halo agressif.
- Toute information donnée par une couleur possède aussi une forme, une icône, un texte ou une
  position distincte.
- Le climat ne masque jamais durablement une cible interactive.

## Performance

- `balanced` est la référence de production : 60 FPS médian en 1080p sur une carte medium.
- Les textures KTX2 et les GLB LOD sont les formats de livraison finaux.
- Les textures procédurales du client constituent uniquement un fallback déterministe.
- LOD0 : capture rapprochée ; LOD1 : jeu normal ; LOD2 : carte epic ou caméra éloignée.
- Les scènes de validation utilisent une graine, une caméra et une saison fixes.

## Extensions

- **Saisons** : modification des matières et accumulation physique avant toute teinte globale.
- **Villes & Chevaliers** : pierre, acier, cuir et textile ; activité lisible par posture et anneau.
- **Souterrain** : roche humide, vapeur et éclairage indirect chaud/froid.
- **Ciel** : lumière atmosphérique, bois verni, toile, cuivre et nuages sobres.
