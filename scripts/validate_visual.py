"""Static checks for the visual-only experience; does not require a browser."""
from pathlib import Path
import json
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
preview = (ROOT / 'preview_v04.html').read_text(encoding='utf-8')
js = (ROOT / 'visual/app.js').read_text(encoding='utf-8')
css = (ROOT / 'visual/app.css').read_text(encoding='utf-8')
species = json.loads((ROOT / 'assets/species.json').read_text(encoding='utf-8'))['species']
assert len(species) == 15
assert len({s['id'] for s in species}) == 15
assert '<div id="app"' in preview
assert 'visual/app.js' in preview and 'visual/app.css' in preview
assert 'assets/frogs_atlas.png' in preview
assert 'preview_v04.html' in (ROOT / 'preview.html').read_text(encoding='utf-8')
assert 'Constelação viva' in preview
assert all(x in js for x in ['function renderHome(', 'function renderCamera(',
    'function renderInventory(', 'function renderGuide(', 'function openDetail(',
    'function shutter(', 'function closeModal('])
assert 'frog_star' in js and 'function sparkle(' in js
assert 'prefers-reduced-motion:reduce' in css
assert '@media(max-width:640px)' in css
assert 'role="dialog"' in js and 'aria-label' in js
if shutil.which('node'):
    subprocess.run(['node', '--check', str(ROOT / 'visual/app.js')], check=True)
print('Visual UI OK: four sections, 15 species, original atlas and reduced-motion CSS')
