# CatanX photoreal terrain PBR v3

- `meadow_lush_scan_*_v3`: original CatanX source generated with the built-in
  OpenAI image-generation tool from a production prompt requesting a neutral,
  top-down temperate meadow albedo. Companion normal, roughness, AO and height
  maps were derived locally with `tools/build_pbr_from_albedo.py`.
- `alpine_strata_scan_*_v3`: original CatanX source generated with the built-in
  OpenAI image-generation tool from a production prompt requesting neutral,
  top-down fractured alpine strata. Companion maps use the same deterministic
  local pipeline.
- `forest_floor_scan_*_v3`: original CatanX source generated with the built-in
  OpenAI image-generation tool from a neutral top-down forest-floor prompt,
  then converted to deterministic PBR companion maps locally.
- `ochre_clay_scan_*_v3`: original CatanX source generated with the built-in
  OpenAI image-generation tool from a neutral compacted-clay prompt, then
  converted to deterministic PBR companion maps locally.
- `warm_dune_scan_*_v3`: original CatanX source generated with the built-in
  OpenAI image-generation tool from a neutral warm dune-and-earth prompt, then
  converted to deterministic PBR companion maps locally.

Source images are versioned in `assets-src/textures/`. No third-party game
asset or CATAN artwork is included.
