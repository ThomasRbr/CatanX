# CatanX photoreal building materials

Original CatanX production assets generated with the built-in OpenAI image
generation workflow on 2026-07-22. They do not derive from CATAN artwork.

- `aged_plaster`: neutral, seamless, front-facing lime-plaster material scan.
- `weathered_timber`: neutral, seamless, front-facing aged-oak material scan.
- `rubble_stone` v2: original warm-gray European fieldstone masonry with
  aged lime mortar, restrained moss and no baked directional light.

The albedo sources explicitly excluded baked lighting, objects, text and
watermarks. Normal, roughness, AO and height channels were generated locally
and deterministically with `tools/build_pbr_from_albedo.py`.

`rubble_stone` was generated with the built-in OpenAI image workflow using a
tileable PBR-albedo brief, then processed at 2048 px by the same local pipeline.
