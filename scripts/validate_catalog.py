#!/usr/bin/env python3
"""Check catalog structure and PNG atlas bounds without third-party packages."""
from collections import Counter
from pathlib import Path
import json
import struct

ROOT = Path(__file__).resolve().parent.parent
catalog = json.loads((ROOT / 'assets/species.json').read_text(encoding='utf-8'))
atlas = (ROOT / 'assets/frogs_atlas.png').read_bytes()
assert atlas[:8] == b'\x89PNG\r\n\x1a\n', 'Invalid PNG signature'
assert atlas[12:16] == b'IHDR', 'PNG IHDR missing'
width, height = struct.unpack('>II', atlas[16:24])
assert catalog['schemaVersion'] == 2
assert catalog['atlasSize'] == [width, height], 'Catalog/atlas size mismatch'
assert catalog['atlas'] == 'assets/frogs_atlas.png'
species = catalog['species']
assert len(species) == 15, f'Expected 15 species, got {len(species)}'
ids = [entry['id'] for entry in species]
assert len(set(ids)) == len(ids), 'Duplicate species ID'
assert all(item.startswith('frog_') for item in ids)
indices = [entry['index'] for entry in species]
assert sorted(indices) == list(range(1, 16)), 'Species index mismatch'
counts = Counter(entry['tier'] for entry in species)
assert counts == {'common': 6, 'uncommon': 5, 'rare': 3, 'special': 1}, counts
assert sum(v['weight'] for v in catalog['tiers'].values()) == 100
for frog in species:
    x, y, w, h = frog['rect']
    assert 0 <= x < width and 0 <= y < height
    assert w > 0 and h > 0 and x + w <= width and y + h <= height, frog['id']
    trait = frog['albumInteraction']
    assert trait['type'] and trait['description']
    assert 3000 <= trait['periodMs'] <= 4200, frog['id']
    assert 0.4 <= trait['activeFraction'] <= 0.55
    assert 0 <= trait['phaseOffset'] <= 0.10, frog['id']
assert len({item['albumInteraction']['type'] for item in species}) == 15
print(f'Catalog OK: {len(species)} species, {width}x{height} atlas, tier counts {dict(counts)}')
