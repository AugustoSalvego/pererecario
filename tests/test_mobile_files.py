import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

class MobileAssetsTest(unittest.TestCase):
    def test_game_screens_and_navigation_exist(self):
        code = (ROOT/'src/app.js').read_text(encoding='utf-8')
        for token in ['game-map-screen', 'journal-hero', 'brejo-hero', 'traveler-hero', 'capture-dialog', 'bottom-nav', 'showZone', 'data-encounter', 'Recovery', 'dbMany']:
            if token == 'Recovery':
                token = 'recover()'
            self.assertIn(token, code)

    def test_mobile_design_and_no_forced_zoom_disable(self):
        css=(ROOT/'src/app.css').read_text(encoding='utf-8')
        html=(ROOT/'index.html').read_text(encoding='utf-8')
        self.assertIn('@media(max-width:720px)',css)
        self.assertIn('grid-template-columns:repeat(2,minmax(0,1fr))',css)
        self.assertNotIn('user-scalable=no',html)

    def test_offline_assets_cached(self):
        sw=(ROOT/'sw.js').read_text(encoding='utf-8')
        for file in ['/src/app.js','/src/app.css','/src/map.js','/src/sync.js','/assets/frogs_atlas.png','/data/campus.json']:
            self.assertIn(file,sw)
        self.assertIn('pererecario-v2',sw)

if __name__=='__main__':unittest.main()
