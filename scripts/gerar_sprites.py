"""Gera os sprites em pixel art do Pererecário (client/assets/sprites/).

Mesmo estilo das pererecas: contorno escuro, 2-3 tons e brilho.
Uso: python3 scripts/gerar_sprites.py   (requer Pillow)
"""
import json
import os
import random

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'client', 'assets', 'sprites')
os.makedirs(OUT, exist_ok=True)


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def grid(rows, pal):
    w = len(rows[0])
    for r in rows:
        assert len(r) == w, (len(r), w, r)
    im = Image.new('RGBA', (w, len(rows)), (0, 0, 0, 0))
    px = im.load()
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c != '.':
                px[x, y] = pal[c]
    return im


def mirror(rows):
    return [r[::-1] for r in rows]


# ------------------------------------------------------------------ bonecos
# Cada quadro: 21 linhas de cabeça/corpo + 6 linhas de pernas = 20x27.
SKINS = {
    'clara': ('f6cfa3', 'dea477', 'f3a091', '6b4428'),
    'media': ('d9a172', 'b7794a', 'e08a78', '3e2716'),
    'escura': ('8f5a37', '6e4026', 'b0644f', '1f140d'),
}

EXPLORER = {
    'down': [
        "......OOOOOOOO......",
        ".....OHHHHHHHHO.....",
        "....OHHHHhhHHHHO....",
        "...OHHHHHHHHHHHHO...",
        "..OOBBBBBBBBBBBBOO..",
        ".OHHHHHHHHHHHHHHHHO.",
        "..OOAAAAAAAAAAAAOO..",
        "...OAASSSSSSSSAAO...",
        "...OASSSSSSSSSSAO...",
        "...OASWESSSSWESAO...",
        "...OASEESSSSEESAO...",
        "...OOSCSSSSSSCSOO...",
        "....OSSSSOOSSSSO....",
        ".....OOSSSSSSOO.....",
        "....OGVGGGGGGVGO....",
        "...OGGVGGGGGGVGGO...",
        "..OSOGVGGGGGGVGOSO..",
        "..OSOGGVGGGGVGGOSO..",
        "..OsOgGGGGGGGGgOsO..",
        "...OOBBBBYYBBBBOO...",
        "....OPPPPPPPPPPO....",
    ],
    'up': [
        "......OOOOOOOO......",
        ".....OHHHHHHHHO.....",
        "....OHHHHhhHHHHO....",
        "...OHHHHHHHHHHHHO...",
        "..OOBBBBBBBBBBBBOO..",
        ".OHHHHHHHHHHHHHHHHO.",
        "..OOAAAAAAAAAAAAOO..",
        "...OAAAAAAAAAAAAO...",
        "...OAAAAaAAaAAAAO...",
        "...OAAAAAAAAAAAAO...",
        "...OAaAAAAAAAAaAO...",
        "...OOAAAAAAAAAAOO...",
        "....OSSAAAAAASSO....",
        ".....OOSSSSSSOO.....",
        "....OGKKKKKKKKGO....",
        "...OGKKkkkkkkKKGO...",
        "..OSOKkKKKKKKkKOSO..",
        "..OSOKKKVVVVKKKOSO..",
        "..OsOkKKKKKKKKkOsO..",
        "...OOBBBBBBBBBBOO...",
        "....OPPPPPPPPPPO....",
    ],
    'right': [
        ".......OOOOOO.......",
        "......OHHHHHHO......",
        ".....OHHHHhhHHO.....",
        "....OHHHHHHHHHHO....",
        "...OOBBBBBBBBBBOO...",
        ".OHHHHHHHHHHHHHHHHO.",
        "...OOAAAAAAAAAAOO...",
        "...OAAAAAAASSSSO....",
        "...OAAAAAASSSSSO....",
        "...OAAAAASSSSWEO....",
        "...OAAAAASSSSEEO....",
        "....OAAASSSSCSSO....",
        ".....OASSSSSSSOO....",
        "......OOSSSSSO......",
        ".....OKKGGGGGO......",
        "....OKKkGGGGGGO.....",
        "....OKkkGGSSGGO.....",
        "....OKKkGGSSGGO.....",
        "....OkKKgGsSgGO.....",
        ".....OOBBBBBBBO.....",
        ".....OPPPPPPPPO.....",
    ],
}

FROGHOOD = {
    'down': [
        "..OOOOO......OOOOO..",
        ".OWWWWWO....OWWWWWO.",
        ".OWWWEEO....OEEWWWO.",
        ".OWWWEEOOOOOOEEWWWO.",
        "..OOGGGGGGGGGGGGOO..",
        ".OGGGGGGGGGGGGGGGGO.",
        ".OGGgOOOOOOOOOOgGGO.",
        ".OGgOAAAAAAAAAAOgGO.",
        ".OGgOASSSSSSSSAOgGO.",
        ".OGgOSWESSSSWESOgGO.",
        ".OGgOSEESSSSEESOgGO.",
        ".OGgOCSSSSSSSSCOgGO.",
        "..OGgOSSSOOSSSOgGO..",
        "..OGGgOOSSSSOOgGGO..",
        "...OGGGGGGGGGGGGO...",
        "..OGGGGGLLLLGGGGGO..",
        "..OSOGGGLLLLGGGOSO..",
        "..OSOGGGGGGGGGGOSO..",
        "..OsOgGGGGGGGGgOsO..",
        "...OOggggggggggOO...",
        "....OPPPPPPPPPPO....",
    ],
    'up': [
        "..OOOOO......OOOOO..",
        ".OGGGGGO....OGGGGGO.",
        ".OGGgGGO....OGGgGGO.",
        ".OGGGGGOOOOOOGGGGGO.",
        "..OOGGGGGGGGGGGGOO..",
        ".OGGGGGGGGGGGGGGGGO.",
        ".OGGGGGGgGGgGGGGGGO.",
        ".OGGGGGGGGGGGGGGGGO.",
        ".OGgGGGGGGGGGGGGgGO.",
        ".OGGGGGGGGGGGGGGGGO.",
        ".OGgGGGGGGGGGGGGgGO.",
        "..OGGGGGGGGGGGGGGO..",
        "..OGgGGGGGGGGGGgGO..",
        "...OOGGGGGGGGGGOO...",
        "...OGGGGGGGGGGGGO...",
        "..OGGGGGGGGGGGGGGO..",
        "..OSOGGGGGGGGGGOSO..",
        "..OSOGGGGGGGGGGOSO..",
        "..OsOgGGGGGGGGgOsO..",
        "...OOggggggggggOO...",
        "....OPPPPPPPPPPO....",
    ],
    'right': [
        "........OOOOO.......",
        ".......OWWWWWO......",
        ".......OWWWEEO......",
        "....OOOOWWWEEO......",
        "...OGGGGOOOOOOO.....",
        "..OGGGGGGGGGGGGO....",
        ".OGGGGGGGGOOOOOOO...",
        ".OGGGGGGGOAAASSSO...",
        ".OGgGGGGGOAASSSSO...",
        ".OGgGGGGGOASSSWEO...",
        ".OGgGGGGGOASSSEEO...",
        ".OGGgGGGGOSSSCSSO...",
        "..OGGgGGGOSSSSOO....",
        "...OGGGGGOOOOO......",
        "....OGGGGGGGO.......",
        "...OGGGGGSSGGO......",
        "...OGGLLGSSGGO......",
        "...OGGLLGsSGGO......",
        "...OgGGGGGGGgO......",
        "....OgggggggggO.....",
        ".....OPPPPPPPPO.....",
    ],
}

LEGS = {
    'front_idle': [
        "....OPPPPOOPPPPO....",
        "....OPPPO..OPPPO....",
        "....OpPPO..OPPpO....",
        "...OTTTTO..OTTTTO...",
        "...OTtTTO..OTTtTO...",
        "....OOOO....OOOO....",
    ],
    'front_walk': [
        "....OPPPPOOPPPPO....",
        "....OPPPO..OPPPO....",
        "...OTTTTO..OPPpO....",
        "...OTtTTO..OTTTTO...",
        "....OOOO...OTTtTO...",
        "............OOOO....",
    ],
    'side_idle': [
        ".....OPPPOPPPPO.....",
        ".....OPPO.OPPPO.....",
        ".....OpPO.OPPpO.....",
        "....OTTTO.OTTTTO....",
        "....OTtTO.OTTtTO....",
        ".....OOO...OOOO.....",
    ],
    'side_walk': [
        ".....OPPPPPPPPO.....",
        "....OPPO...OPPO.....",
        "...OPPO.....OPpO....",
        "..OTTTO......OTTTO..",
        "..OTtTO......OTtTO..",
        "...OOO........OOO...",
    ],
}


def frames(model):
    """Quadros [parado, passo 1, passo 2] para cada direção."""
    body = EXPLORER if model == 'explorer' else FROGHOOD
    out = {}
    for d in ('down', 'up'):
        b = body[d]
        out[d] = [b + LEGS['front_idle'], b + LEGS['front_walk'], b + mirror(LEGS['front_walk'])]
    b = body['right']
    out['right'] = [b + LEGS['side_idle'], b + LEGS['side_walk'], b + mirror(LEGS['side_walk'])]
    out['left'] = [mirror(f) for f in out['right']]
    return out


def palette(model, skin):
    s, sd, ck, hair = SKINS[skin]
    common = {'O': hx('2a1f1a'), 'S': hx(s), 's': hx(sd), 'C': hx(ck), 'E': hx('1d1712'), 'W': hx('ffffff'),
              'A': hx(hair), 'a': hx('000000', 70)}
    if model == 'explorer':
        common.update({'H': hx('e6c27a'), 'h': hx('c49a4e'), 'B': hx('6e4a24'), 'G': hx('4fae4f'), 'g': hx('2f7f37'),
                       'V': hx('8a5a33'), 'K': hx('b07a45'), 'k': hx('86562c'), 'Y': hx('f2c230'),
                       'P': hx('7b5a3c'), 'p': hx('5b402a'), 'T': hx('4a3426'), 't': hx('6a4d38')})
        common['a'] = hx('3e2716')
    else:
        common.update({'O': hx('1f3a1b'), 'G': hx('6cc04a'), 'g': hx('3f8f35'), 'L': hx('d9f0a8'),
                       'P': hx('4a6fa5'), 'p': hx('34507c'), 'T': hx('f2c230'), 't': hx('c9961a')})
    return common


DIRS = ('down', 'left', 'right', 'up')


def character_sheet(model, skin):
    fr = frames(model)
    pal = palette(model, skin)
    sheet = Image.new('RGBA', (20 * 3, 27 * 4), (0, 0, 0, 0))
    for row, d in enumerate(DIRS):
        for col, f in enumerate(fr[d]):
            sheet.alpha_composite(grid(f, pal), (col * 20, row * 27))
    return sheet


# ------------------------------------------------------------------ cenário
BUSH = [
    "......OOO..OOO........",
    ".....OGGGOOGgGO.......",
    "...OOOGgGGGGGGGOOO....",
    "..OGGGGGGgGGGGgGGGO...",
    ".OGGgGGGGGGGGGGGGgGGO.",
    "OGGGGGGgGGGGGgGGGGGGGO",
    "OGgGGGGGGGGGGGGGGgGGGO",
    "OGGGGgGGGGdGGGGGGGGGdO",
    "OdGGGGGGGGGGGgGGdGGGGO",
    "OGGdGGGGdGGGGGGGGGGdGO",
    ".OdGGGdGGGGGdGGGdGGdO.",
    "..OddGGddGGGddGGddOO..",
    "...OOddddddddddddOO...",
    ".....OOOOOOOOOOOO.....",
]
BUSH_PEEK = BUSH[:5] + [
    "OGGGGGGGOOGGGOOGGGGGGO",
    "OGgGGGGOWWOGOWWOGgGGGO",
    "OGGGGgGOWEOGOWEOGGGGdO",
    "OdGGGGGGOOGGGOOGdGGGGO",
] + BUSH[9:]
BUSH_PAL = {'O': hx('1f4f27'), 'G': hx('3e9b45'), 'g': hx('86d873'), 'd': hx('2b7a3a'), 'W': hx('ffffff'), 'E': hx('1d1d1d')}

QBUBBLE = [
    ".OOOOOOOOO.",
    "OWWWWWWWWWO",
    "OWWWOOOWWWO",
    "OWWOWWWOWWO",
    "OWWWWWWOWWO",
    "OWWWWWOWWWO",
    "OWWWWOWWWWO",
    "OWWWWWWWWWO",
    "OWWWWOWWWWO",
    ".OOOOOOOOO.",
    "...OOO.....",
    "...OO......",
    "...O.......",
]
EXCL = [
    ".OOOOOOOOO.",
    "OYYYYYYYYYO",
    "OYYYYOYYYYO",
    "OYYYYOYYYYO",
    "OYYYYOYYYYO",
    "OYYYYOYYYYO",
    "OYYYYYYYYYO",
    "OYYYYOYYYYO",
    "OYYYYYYYYYO",
    ".OOOOOOOOO.",
    "...OOO.....",
    "...OO......",
    "...O.......",
]
LILYPAD = [
    "...OOOOO.OOO....",
    ".OOGGGGGOGGGOO..",
    "OGGGgGGGGGGGGGO.",
    "OGGGGGGGGGgGGGGO",
    "OGgGGGGGGGGGGGGO",
    ".OGGGGGGGgGGGGO.",
    "..OOOOOOOOOOOO..",
]
HEART = [
    "..OOO...OOO..",
    ".ORRRO.ORRRO.",
    "ORWWRRORRRRRO",
    "ORWRRRRRRRRRO",
    "ORRRRRRRRRRRO",
    "ORRRRRRRRRRrO",
    ".ORRRRRRRRrO.",
    "..ORRRRRRrO..",
    "...ORRRRrO...",
    "....ORRrO....",
    ".....ORO.....",
    "......O......",
]
BOOK = [
    "................",
    ".OOOOOO..OOOOOO.",
    "OWWWWWWOOWWWWWWO",
    "OWkkkkWOOWkkkkWO",
    "OWWWWWWOOWWWWWWO",
    "OWkkkkWOOWkkkWWO",
    "OWWWWWWOOWWWWWWO",
    "OWkkkWWOOWkkkkWO",
    "OWWWWWWOOWWWWWWO",
    "OWkkkkWOOWkkkWWO",
    "OWWWWWWOOWWWWWWO",
    "OGGGGGGOOGGGGGGO",
    ".OGGGGGGGGGGGGO.",
    "..OOOOOOOOOOOO..",
]


def sparkle_frames():
    """4 quadros de um brilho em estrela (11x11)."""
    out = []
    Y, W = hx('ffd84a'), hx('ffffff')
    for k in range(4):
        im = Image.new('RGBA', (11, 11), (0, 0, 0, 0))
        px = im.load()
        c = 5
        r = [1, 3, 5, 4][k]
        for i in range(-r, r + 1):
            px[c + i, c] = Y
            px[c, c + i] = Y
        if k >= 1:
            for d in (2, 3):
                if d <= r:
                    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
                        px[c + sx * d, c + sy * d] = Y
        px[c, c] = W
        if k == 3:
            for i in (-4, 4):
                px[c + i, c] = (0, 0, 0, 0)
                px[c, c + i] = (0, 0, 0, 0)
        out.append(im)
    return out


def pond(w, h, seed, rocks=True, reeds=True, lotus=True):
    rnd = random.Random(seed)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = im.load()
    cx, cy = (w - 1) / 2, (h - 1) / 2

    def inside(x, y, rx, ry, dy=0.0, wob=0.0):
        a = ((x - cx) / rx) ** 2 + ((y - cy - dy) / ry) ** 2
        return a <= 1 + wob

    wob = [[rnd.uniform(-0.06, 0.06) for _ in range(w)] for _ in range(h)]
    grass = [[inside(x, y, w / 2 - 0.5, h / 2 - 0.5, 0, wob[y][x]) for x in range(w)] for y in range(h)]
    water = [[inside(x, y, w / 2 - 3.6, h / 2 - 3.8, -0.5) for x in range(w)] for y in range(h)]

    def edge(mask, x, y):
        return any(not (0 <= x + dx < w and 0 <= y + dy < h and mask[y + dy][x + dx])
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))

    for y in range(h):
        for x in range(w):
            if not grass[y][x]:
                continue
            if edge(grass, x, y):
                px[x, y] = hx('2b6b2e')
            elif water[y][x]:
                if edge(water, x, y):
                    px[x, y] = hx('1d5f73')
                elif y - cy > (h / 2 - 4) * 0.3:
                    px[x, y] = hx('2b97ba')
                else:
                    px[x, y] = hx('47bcd6')
            else:
                px[x, y] = hx('86d873') if rnd.random() < 0.18 else hx('62b948')
    for (fx, fy, l) in ((-0.32, -0.28, 5), (0.05, -0.38, 3), (0.22, 0.05, 3), (-0.1, 0.2, 2)):
        x0, y0 = int(cx + fx * w), int(cy + fy * h)
        for i in range(l):
            if water[y0][x0 + i]:
                px[x0 + i, y0] = hx('c9f3fa')

    def stamp(rows, pal, x0, y0):
        for j, r in enumerate(rows):
            for i, c in enumerate(r):
                if c != '.' and 0 <= x0 + i < w and 0 <= y0 + j < h:
                    px[x0 + i, y0 + j] = pal[c]

    pad = [".OOOO.", "OGGgGO", "OGGGGO", ".OOOO."]
    pal = {'O': hx('2b6b2e'), 'G': hx('5fbf4a'), 'g': hx('2b97ba')}
    stamp(pad, pal, int(cx - w * 0.28), int(cy + h * 0.05))
    stamp(pad, pal, int(cx + w * 0.05), int(cy + h * 0.12))
    if lotus:
        stamp(pad, pal, int(cx + w * 0.12), int(cy - h * 0.22))
        fl = [".P.", "PpP", ".P."]
        stamp(fl, {'P': hx('f59ac0'), 'p': hx('fff1a8')}, int(cx + w * 0.12) + 2, int(cy - h * 0.22) - 1)
    if rocks:
        rock = [".OOO.", "OggGO", "OgGGO", ".OOO."]
        rp = {'O': hx('3a3f45'), 'g': hx('b9bec4'), 'G': hx('8a9097')}
        stamp(rock, rp, 1, int(cy + 1))
        stamp(rock, rp, 4, int(cy + h * 0.28))
        stamp([".OO.", "OgGO", ".OO."], rp, 0, int(cy - 3))
    if reeds:
        for (dx, top) in ((-7, 0), (-5, 2), (-3, 1), (-9, 3)):
            x = w + dx
            for y in range(top + 3, int(cy) + 4):
                px[x, y] = hx('2b6b2e')
            for y in range(top, top + 3):
                px[x, y] = hx('8a5a33')
            px[x, top] = hx('a9733f')
    return im


def save(im, name):
    im.save(os.path.join(OUT, name))


def main():
    for model in ('explorer', 'froghood'):
        for skin in SKINS:
            save(character_sheet(model, skin), f'char-{model}-{skin}.png')
    save(pond(60, 34, 7), 'pond-big.png')
    save(pond(40, 24, 3, rocks=False), 'pond-small.png')
    save(grid(BUSH, BUSH_PAL), 'bush.png')
    save(grid(BUSH_PEEK, BUSH_PAL), 'bush-peek.png')
    save(grid(QBUBBLE, {'O': hx('17352a'), 'W': hx('ffffff')}), 'bubble-q.png')
    save(grid(EXCL, {'O': hx('5a3a00'), 'Y': hx('ffd84a')}), 'bubble-ex.png')
    save(grid(LILYPAD, {'O': hx('2b6b2e'), 'G': hx('5fbf4a'), 'g': hx('86d873')}), 'lilypad.png')
    save(grid(HEART, {'O': hx('5a1424'), 'R': hx('ff5a6e'), 'r': hx('c7364b'), 'W': hx('ffd1d8')}), 'icon-heart.png')
    save(grid(BOOK, {'O': hx('1f3a1b'), 'W': hx('fff8e6'), 'k': hx('9ab08f'), 'G': hx('4cae4c')}), 'icon-book.png')
    sp = sparkle_frames()
    strip = Image.new('RGBA', (11 * len(sp), 11), (0, 0, 0, 0))
    for i, f in enumerate(sp):
        strip.alpha_composite(f, (i * 11, 0))
    save(strip, 'sparkle.png')
    print('sprites gerados em', OUT)


if __name__ == '__main__':
    main()
