"""CatanX H1 art palette — soft pastel medieval diorama colors."""

from __future__ import annotations

PALETTE = {
    # Nature
    "trunk": (0.42, 0.29, 0.20, 1.0),
    "trunk_birch": (0.86, 0.84, 0.78, 1.0),
    "foliage_dark": (0.18, 0.42, 0.28, 1.0),
    "foliage": (0.26, 0.50, 0.34, 1.0),
    "foliage_light": (0.36, 0.58, 0.38, 1.0),
    "foliage_oak": (0.32, 0.52, 0.30, 1.0),
    "scrub": (0.48, 0.58, 0.35, 1.0),
    "scrub_dark": (0.40, 0.50, 0.30, 1.0),
    "rock": (0.54, 0.52, 0.50, 1.0),
    "rock_dark": (0.44, 0.42, 0.40, 1.0),
    "rock_light": (0.62, 0.60, 0.58, 1.0),
    "peak": (0.60, 0.62, 0.64, 1.0),
    "snow": (0.90, 0.92, 0.94, 1.0),
    "sand": (0.91, 0.83, 0.63, 1.0),
    "sand_dark": (0.84, 0.75, 0.55, 1.0),
    "grass": (0.53, 0.66, 0.38, 1.0),
    "wheat": (0.86, 0.74, 0.42, 1.0),
    # Architecture
    "plaster": (0.93, 0.90, 0.84, 1.0),
    "plaster_warm": (0.90, 0.86, 0.78, 1.0),
    "wood": (0.55, 0.40, 0.26, 1.0),
    "wood_dark": (0.42, 0.30, 0.20, 1.0),
    "roof_terracotta": (0.72, 0.42, 0.30, 1.0),
    "roof_slate": (0.45, 0.48, 0.52, 1.0),
    "stone": (0.62, 0.60, 0.56, 1.0),
    "dock": (0.48, 0.36, 0.24, 1.0),
    "rope": (0.70, 0.60, 0.42, 1.0),
    "crate": (0.62, 0.48, 0.30, 1.0),
    "barrel": (0.50, 0.36, 0.22, 1.0),
    "banner_neutral": (0.78, 0.72, 0.58, 1.0),
    # Water / accents
    "water_deep": (0.25, 0.44, 0.56, 1.0),
    "foam": (0.85, 0.90, 0.92, 1.0),
}

# Triangle budgets from the H1 plan
BUDGETS = {
    "prop_small": (50, 400),
    "tree_rock": (150, 800),
    "building": (500, 2500),
    "unit": (500, 2000),
    "wonder": (2000, 6000),
}
