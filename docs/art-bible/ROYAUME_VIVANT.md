# CatanX — Bible artistique « Royaume vivant »

Direction : diorama médiéval vivant, chaleureux et noble, entièrement original.  
Lisibilité stratégique prioritaire sur le spectacle.

La modélisation 3D reste documentée dans [`assets-src/blender/art-bible/ART_BIBLE_H1.md`](../../assets-src/blender/art-bible/ART_BIBLE_H1.md).  
Cette bible couvre **marque, UI, matériaux, mouvement et saisons shell**.

---

## 1. Marque

### Signature

- Mot-symbole **CatanX** vectoriel (pas une fonte générique pour le logo).
- Monogramme : **X formé par deux routes croisées dans un hexagone**, entouré d’une rose des quatre saisons.
- Versions : horizontal, monogramme, monochrome clair/foncé, icône d’application.

### Fichiers

| Asset | Chemin |
|-------|--------|
| Logo horizontal | `apps/client/public/brand/logo-horizontal.svg` |
| Monogramme | `apps/client/public/brand/monogram.svg` |
| Mono clair | `apps/client/public/brand/logo-mono-light.svg` |
| Mono foncé | `apps/client/public/brand/logo-mono-dark.svg` |
| Icône app | `apps/client/public/brand/app-icon.svg` |
| Rose saisonnière | `apps/client/public/brand/season-rose.svg` |
| Sources | `assets-src/brand/` |

### Règles d’usage

1. Zone de protection : hauteur du X monogramme autour du logo.
2. Ne jamais étirer, incliner ou appliquer un contour noir permanent.
3. Sur fond sombre : version ivoire/or ; sur fond clair : version encre/vert royaume.
4. Le monogramme seul suffit sous 48 px ; le logo horizontal dès 160 px de large.
5. Interdit : ombre portée multi-couches, glow violet, dégradés arc-en-ciel.

---

## 2. Palette canonique

| Token | Hex | Usage |
|-------|-----|--------|
| `nightTeal` | `#102E2B` | Fond laqué, shell sombre |
| `kingdomGreen` | `#315A48` | Surfaces bois/laque, accents |
| `ivory` | `#F4E8C9` | Panneaux de contenu détaillés |
| `antiqueGold` | `#C79A45` | CTA, focus, survol stratégique |
| `copper` | `#A34F3D` | Danger, guerre, alertes |
| `ink` | `#1B1712` | Texte principal |

### Accents saisonniers

| Saison | Hex | Usage |
|--------|-----|--------|
| Printemps | `#6B9E78` | Bourgeons, HUD saison |
| Été | `#D4A84B` | Lumière chaude |
| Automne | `#C4783A` | Feuillages secs |
| Hiver | `#7A9BB8` | Brume, neige |

Les couleurs joueurs restent distinctes (voir tokens TS) et ne remplacent jamais les accents saisonniers.

---

## 3. Typographie

| Rôle | Famille | Notes |
|------|---------|--------|
| Mot-symbole / logo | SVG CatanX | Jamais substitué par Cinzel pour le logo |
| Titres | Cinzel | 600–800 |
| Interface | Source Sans 3 | Corps UI, boutons, tableaux |
| Narratif | Cormorant Garamond | Lore, tutoriel, victoire uniquement |

Fontes auto-hébergées via `@fontsource/*` (WOFF2 bundlés, aucun Google Fonts CDN).

---

## 4. Matériaux UI

- **Bois sombre / laque bleu-vert** : coques de menus et docks.
- **Bronze patiné** : cadres, bordures d’élévation.
- **Ivoire** : réservé aux contenus détaillés (listes, formulaires, modales de lecture).
- Interdit : grandes cartes beiges génériques type parchemin plein écran.

---

## 5. Icônes

Famille SVG originale (`apps/client/src/ui/icons/`).  
Chaque état combine **forme + libellé accessible** ; aucune information portée uniquement par la couleur.

---

## 6. Mouvement

| Catégorie | Durée |
|-----------|--------|
| Feedback (hover/press) | 120 ms |
| Contrôles | 200 ms |
| Panneaux | 320 ms |
| Transitions de scène | 600 ms |

`prefers-reduced-motion` / `reducedMotion` : supprimer tout mouvement non fonctionnel.

---

## 7. Saisons (shell)

`data-season` sur `.app-shell` synchronise HUD, menus et scène 3D.  
Les saisons se lisent par lumière, ciel, feuillage et accents — pas par une recoloration uniforme du plateau.

---

## 8. Exemples autorisés / anti-exemples

**Autorisé**

- Diorama miniature dans le menu, logo à gauche, navigation claire.
- Survol doré discret sur hex/route valides.
- Mode cinématique sans HUD pour captures promo.

**Interdit**

- Dashboard de stats dans le premier viewport menu.
- Violet néon, glow, pills arrondis génériques.
- Packs graphiques génériques / assets copiés.
- États « erreur / succès » uniquement par rouge/vert sans icône ni texte.
