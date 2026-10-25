"""H1 stub — full generation lives in generate_h1_batch.py. Re-run that for this category."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('generate_h1_batch.py')), run_name='__main__')
