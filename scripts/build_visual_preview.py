"""Generate an offline, file:// friendly HTML preview from assets/species.json."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
data = json.loads((root / 'assets/species.json').read_text(encoding='utf-8'))
metadata = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html = f'''<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#faf7ee">
  <meta name="description" content="Pererecário — álbum, captura simulada e Meu Brejo.">
  <title>Pererecário · Caderno de campo</title>
  <link rel="stylesheet" href="visual/app.css">
</head>
<body>
  <div id="app" role="application" aria-label="Prévia visual do Pererecário"></div>
  <script>const DATA={metadata}; const ATLAS='assets/frogs_atlas.png';</script>
  <script src="visual/app.js"></script>
</body>
</html>
'''
(root / 'preview_v04.html').write_text(html, encoding='utf-8')
print('Generated preview_v04.html with',len(data['species']),'species')
