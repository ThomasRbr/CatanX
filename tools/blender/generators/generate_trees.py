"""Thin wrappers so the plan inventory of generator scripts exists."""

from __future__ import annotations

import runpy
from pathlib import Path

# Delegate to the H1 batch generator (single source of truth for this phase).
runpy.run_path(str(Path(__file__).with_name("generate_h1_batch.py")), run_name="__main__")
