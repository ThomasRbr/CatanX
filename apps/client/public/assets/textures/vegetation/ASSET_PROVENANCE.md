# Vegetation texture provenance

## `wheat_canopy_*_v1`

- Source: generated specifically for CatanX with OpenAI image generation.
- Date: 2026-07-22.
- Direction: seamless, orthographic crop-canopy albedo of dense ripe wheat, neutral overcast light, no baked shadows, no text or logos.
- Processing: local CatanX PBR derivation pipeline (`tools/build_pbr_from_albedo.py`) for normal, roughness, ambient-occlusion and height maps.
- Intended use: ground-level field clusters in the Diorama renderer. It is not a gameplay texture and carries no rule information.

## `spruce_impostor_v2`, `pine_impostor_v2`, `oak_impostor_v2`

- Source: original three-species atlas generated specifically for CatanX with OpenAI image generation.
- Date: 2026-07-22.
- Direction: mature European trees in orthographic elevation, neutral studio illumination, realistic branch gaps and species-specific silhouettes.
- Processing: deterministic split, neutral-backdrop keying, trimming and transparent framing with `tools/split_tree_atlas.py`.
- Intended use: crossed-plane, alpha-tested vegetation in the Diorama renderer.

## `beech_impostor_v3`

- Source: original mature European beech generated specifically for CatanX with OpenAI image generation.
- Date: 2026-07-23.
- Direction: full botanical elevation, diffuse overcast illumination, asymmetric crown and visible mature branching on a flat magenta key.
- Processing: imagegen `remove_chroma_key.py`, soft matte, despill and one-pixel edge contraction.
- Source archive: `art_sources/imagegen/vegetation/european_beech_v3_chroma_source.png`.
- Intended use: high-detail crossed-plane broadleaf vegetation in the Diorama renderer.

## `spruce_winter_v1`, `beech_winter_v1`

- Source: original winter vegetation generated specifically for CatanX with OpenAI image generation.
- Date: 2026-07-23.
- Direction: snow-laden mature European spruce and leafless mature European beech, orthographic botanical elevations under cold overcast light.
- Processing: imagegen `remove_chroma_key.py`, soft matte, aggressive spill cleanup, despill and two-pixel edge contraction.
- Source archives: `art_sources/imagegen/vegetation/spruce_winter_v1_chroma_source.png` and `art_sources/imagegen/vegetation/beech_winter_v1_chroma_source.png`.
- Intended use: true winter-specific tree silhouettes in the Diorama renderer; no runtime recoloring is required to invent snow or remove leaves.
