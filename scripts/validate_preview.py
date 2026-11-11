#!/usr/bin/env python3
"""Regression checks for the self-contained visual preview, no extra dependencies."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / 'preview.html').read_text(encoding='utf-8')
start = html.index('const DATA=') + len('const DATA=')
end = html.index(';\nconst ATLAS=', start)
embedded = json.loads(html[start:end])
catalog = json.loads((root / 'assets/species.json').read_text(encoding='utf-8'))
assert embedded == catalog, 'Preview is out of sync with assets/species.json'
assert 'for(let row=0;row<sh;' not in html, 'Strip stretching has reappeared'
assert 'personality(s,now,hero)' in html, 'Details must use an elapsed-time animation'
assert 'gridStart=performance.now()' in html, 'Grid animations need an anchor'
assert "mode==='album'?now:null,true" in html, 'Details must start the trait from zero'
flutter = (root / 'lib/frog_sprite.dart').read_text(encoding='utf-8')
assert 'for (double row' not in flutter, 'Flutter strip stretching has reappeared'
assert 'immediateTrait' in flutter, 'Flutter detail animation is not instant'
print('Preview animation OK: embedded catalog, fast start, art-safe drawing')
