# CatanX — pipeline Blender

La direction active est le **diorama réaliste**. Les lots H1–H3 sont conservés
comme compatibilité de transition ; les bâtiments de Surface utilisent le kit
`realistic/` à trois LOD avec matériaux PBR intégrés.

## Prérequis

```powershell
winget install --exact --id BlenderFoundation.Blender
npm run assets:blender:check
```

Surcharge optionnelle : `BLENDER_PATH` vers `blender.exe`.

## Commandes

| Script | Rôle |
|---|---|
| `npm run assets:blender:check` | Vérifie Blender en mode headless |
| `npm run assets:blender:generate` | Génère les lots legacy puis le kit Surface réaliste LOD0–2 |
| `npm run assets:blender:previews` | Génère les planches PNG orthographiques |
| `npm run assets:blender:validate` | Refuse les assets, budgets ou licences invalides |

## Scènes étalons

```text
http://127.0.0.1:3000/?scene=h7
http://127.0.0.1:3000/?scene=h7&view=cinematic
```

## Sources actives

- `tools/blender/generators/generate_realistic_surface_batch.py`
- `tools/textures/generate_pbr_maps.py`
- `tools/textures/generate_road_material.py`
- Bible : `assets-src/blender/art-bible/ART_BIBLE_REALISTIC.md`
- Licence : `apps/client/public/assets/licenses/REALISTIC_SURFACE_ASSETS.md`

## Sources historiques

- `tools/blender/generators/generate_h1_batch.py`
- `tools/blender/generators/generate_h2_batch.py`
- `tools/blender/generators/generate_h3_batch.py`
- `tools/blender/generators/generate_ck_pieces.py`
