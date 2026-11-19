"""Gera as pererecas exclusivas dos lugares do campus (client/assets/frogs_campus.png).

Cada uma parte de uma perereca do atlas original (mesmo traço), recebe cores novas e um
acessório desenhado em "pixels" do mesmo tamanho dos do desenho original.
Uso: python3 scripts/gerar_pererecas_campus.py   (requer Pillow)
"""
import colorsys
import json
import os
import random

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'client', 'assets')
PX = 6  # tamanho de um "pixel" do desenho original, em pixels da imagem


def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def load_base():
    d = json.load(open(os.path.join(ASSETS, 'species.json')))
    atlas = Image.open(os.path.join(ASSETS, 'frogs_atlas.png')).convert('RGBA')
    out = {}
    for s in d['species']:
        x, y, w, h = s['rect']
        out[s['id']] = atlas.crop((x, y, x + w, y + h))
    return out


def recolor(im, hue=None, sat=1.0, val=1.0, white=False, keep_belly=False):
    """Troca a cor do corpo e mantém contorno (escuro) e olhos (pretos e brancos)."""
    im = im.copy()
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if vv < 0.28 or ss < 0.12:          # contorno, pupila, brilho do olho
                continue
            if keep_belly and ss < 0.32 and vv > 0.82:   # barriga clara
                continue
            if white:
                ns, nv = ss * 0.08, min(1, 0.62 + vv * 0.42)
                nh = hh
            else:
                nh = hue / 360 if hue is not None else hh
                ns, nv = min(1, ss * sat), min(1, vv * val)
            nr, ng, nb = colorsys.hsv_to_rgb(nh, ns, nv)
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return im


def eyes(im):
    """Acha os dois olhos: as manchas escuras mais "grossas" (o contorno é fino e some na erosão)."""
    from PIL import ImageFilter
    w, h = im.size
    mask = Image.new('L', im.size, 0)
    src, m = im.load(), mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a > 200 and r + g + b < 170:
                m[x, y] = 255
    core = mask.filter(ImageFilter.MinFilter(13)).load()
    pts = [(x, y) for y in range(int(h * 0.6)) for x in range(w) if core[x, y]]
    if not pts:
        return (w * 0.35, h * 0.25), (w * 0.65, h * 0.25)
    cx = sum(p[0] for p in pts) / len(pts)
    def center(ps):
        return (sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps))
    left = [p for p in pts if p[0] < cx] or pts
    right = [p for p in pts if p[0] >= cx] or pts
    return center(left), center(right)


def top_at(im, x):
    """Primeira linha (de cima) com pixel visível na coluna x."""
    px = im.load()
    for y in range(im.size[1]):
        if px[int(x), y][3] > 120:
            return y
    return 0


class Pen:
    """Desenha em blocos de PX x PX, alinhados a partir de uma origem."""

    def __init__(self, im, ox, oy, bs=PX):
        self.im, self.ox, self.oy, self.bs = im, ox, oy, bs
        self.px = im.load()

    def dot(self, gx, gy, color):
        bs = self.bs
        x0, y0 = int(self.ox + gx * bs), int(self.oy + gy * bs)
        for y in range(y0, y0 + bs):
            for x in range(x0, x0 + bs):
                if 0 <= x < self.im.size[0] and 0 <= y < self.im.size[1]:
                    self.px[x, y] = (*color, 255)

    def rect(self, gx0, gy0, gx1, gy1, color):
        for gy in range(gy0, gy1 + 1):
            for gx in range(gx0, gx1 + 1):
                self.dot(gx, gy, color)

    def rows(self, gx, gy, art, pal):
        for j, line in enumerate(art):
            for i, ch in enumerate(line):
                if ch in pal:
                    self.dot(gx + i, gy + j, pal[ch])


def with_margin(im, top=60, side=10):
    """Abre espaço em cima (para chapéus) sem mudar o tamanho do sapo."""
    w, h = im.size
    out = Image.new('RGBA', (w + side * 2, h + top), (0, 0, 0, 0))
    out.alpha_composite(im, (side, top))
    return out, side, top


def spots(im, color, n, seed, rmin=7, rmax=15, avoid=(), belly=None):
    """Manchas arredondadas (vaca, pintinhas) só dentro do corpo, longe dos olhos e da barriga."""
    rnd = random.Random(seed)
    px = im.load()
    w, h = im.size
    placed, tries = 0, 0
    while placed < n and tries < 4000:
        tries += 1
        cx, cy = rnd.randrange(w), rnd.randrange(h)
        r = rnd.randint(rmin, rmax)
        if any((cx - ax) ** 2 + (cy - ay) ** 2 < (ar + r) ** 2 for ax, ay, ar in avoid):
            continue
        if belly and (cx - belly[0]) ** 2 / belly[2] ** 2 + (cy - belly[1]) ** 2 / belly[3] ** 2 < 1:
            continue
        # a mancha é feita de 2 a 3 círculos encostados (forma irregular)
        blobs = [(cx, cy, r)] + [(cx + rnd.randint(-r, r) // 2, cy + rnd.randint(-r, r) // 2, int(r * rnd.uniform(.55, .8))) for _ in range(rnd.randint(1, 2))]
        cells = []
        ok = True
        for gy in range((cy - 2 * r) // PX, (cy + 2 * r) // PX + 1):
            for gx in range((cx - 2 * r) // PX, (cx + 2 * r) // PX + 1):
                x, y = gx * PX + PX // 2, gy * PX + PX // 2
                if not any((x - bx) ** 2 + (y - by) ** 2 <= br * br for bx, by, br in blobs):
                    continue
                if not (0 <= x < w and 0 <= y < h) or px[x, y][3] < 200:
                    ok = False
                    break
                cells.append((gx, gy))
            if not ok:
                break
        if not ok or not cells:
            continue
        for gx, gy in cells:
            for yy in range(gy * PX, gy * PX + PX):
                for xx in range(gx * PX, gx * PX + PX):
                    if 0 <= xx < w and 0 <= yy < h and px[xx, yy][3] > 200:
                        q = px[xx, yy]
                        hh, ss, vv = colorsys.rgb_to_hsv(q[0] / 255, q[1] / 255, q[2] / 255)
                        if vv >= 0.45:
                            px[xx, yy] = (*color, 255)
        placed += 1
    return im


# ------------------------------------------------------------------ acessórios
CAP = [  # capelo de formatura
    "........KKKK........",
    ".....KKKLLKKKKK.....",
    "..KKKKLLKKKKKKKKKK..",
    "KKKKKKKKKKKKKKKKKKKK",
    "..KKKKKKKKKKKKKKKKY.",
    "....KKKKKKKKKKKK..Y.",
    ".....kkkkkkkkkk...Y.",
    ".....kkkkkkkkkk..YYY",
    ".....kkkkkkkkkk..YYY",
]
NURSE = [  # touquinha de enfermagem
    "....OOOOOOOOO....",
    "...OWWWWWWWWWO...",
    "..OWWWWWRWWWWWO..",
    "..OWWWWRRRWWWWO..",
    "..OWWWWWRWWWWWO..",
    "..OWWWWWWWWWWWO..",
    ".OOOOOOOOOOOOOOO.",
]
SPROUT = [  # brotinho
    "..OOO.......OOO..",
    ".OGGGO.....OGGGO.",
    "OGHHGGO...OGGHHGO",
    "OGHGGGGO.OGGGGHGO",
    ".OGGGGGGOGGGGGGO.",
    "..OOGGGGSGGGGOO..",
    "....OOOOSOOOO....",
    "........S........",
    "........S........",
]
DROP = [  # gota d'água
    "....O....",
    "...OBO...",
    "..OBBBO..",
    ".OBWBBBO.",
    "OBWBBBBBO",
    "OBWBBBBBO",
    "OBBBBBBBO",
    ".OBBBBBO.",
    "..OOOOO..",
]
SNOUT = [  # focinho de porquinho
    "..OOOOO..",
    ".OPPPPPO.",
    "OPPKPKPPO",
    "OPPKPKPPO",
    ".OPPPPPO.",
    "..OOOOO..",
]
EAR_L = ["O.....", "OO....", "OPO...", "OPpO..", "OPppO.", "OPPPPO", ".OOOOO"]
EAR_R = [".....O", "....OO", "...OPO", "..OpPO", ".OppPO", "OPPPPO", "OOOOO."]
MANE = [  # crina
    "...M..M..M..M...",
    "..MMM.MMM.MM.MM.",
    ".MMNMMMNMMMMNMMM",
    "MMMMMMMMMMMMMMMM",
    "MMMMMMMMMMMMMMM.",
]
LAPTOP = [  # notebook
    ".OOOOOOOOOOOO.",
    ".OSSSSSSSSSSO.",
    ".OSgSgSSSSSSO.",
    ".OSSSgSgSgSSO.",
    ".OSgSSSSgSSSO.",
    ".OSSSSSSSSSSO.",
    ".OOOOOOOOOOOO.",
    "OKKKKKKKKKKKKO",
    "OKkKkKkKkKkKKO",
    "OOOOOOOOOOOOOO",
]
STETHO = [  # estetoscópio no pescoço
    "GG...............GG",
    "GG...............GG",
    ".GG.............GG.",
    "..GG...........GG..",
    "...GGG.......GGG...",
    ".....GGGGGGGGG.....",
    ".........G.........",
    ".........G.........",
    ".......OOOOO.......",
    "......OSSSSSO......",
    "......OSWSSSO......",
    "......OSSSSSO......",
    ".......OOOOO.......",
]
LUPA = [  # lupa
    "..OOOOO.....",
    ".OLLLLLO....",
    "OLWLLLLLO...",
    "OLWLLLLLO...",
    "OLLLLLLLO...",
    "OLLLLLLLO...",
    ".OLLLLLO....",
    "..OOOOOHH...",
    ".......HHH..",
    "........HHH.",
    ".........HHH",
    "..........HH",
]
CORN = [  # espiga de milho
    "...GG...",
    "..GYYG..",
    ".GYyYYG.",
    ".GYYyYG.",
    ".GYyYYG.",
    ".GYYyYG.",
    ".GYyYYG.",
    "GGGYYGGG",
    ".GG..GG.",
]


def hat(im, art, pal, overlap=1, dx=0, bs=7):
    """Põe o acessório em cima da cabeça, centralizado entre os olhos."""
    (lx, ly), (rx, ry) = eyes(im)
    cx = (lx + rx) / 2 + dx
    top = top_at(im, cx)
    w = len(art[0])
    ox = cx - w * bs / 2
    oy = top - (len(art) - overlap) * bs
    Pen(im, ox, oy, bs).rows(0, 0, art, pal)
    return im


def make(base):
    out = []

    # 1. Prédio central: formanda (verde, barriga clara, capelo)
    im, _, _ = with_margin(recolor(base['frog_pitanga'], hue=112, sat=0.85, val=0.95, keep_belly=True), top=60)
    hat(im, CAP, {'K': hx('262833'), 'L': hx('4a4f66'), 'k': hx('3c4052'), 'Y': hx('f6c934')}, overlap=3, bs=8)
    out.append(('frog_formanda', im))

    # 2. Nascente: azul cristalina com gotinha
    im, _, _ = with_margin(recolor(base['frog_drop'], hue=196, sat=0.75, val=1.12), top=60)
    hat(im, DROP, {'O': hx('1d4f7a'), 'B': hx('6fd0ff'), 'W': hx('ffffff')}, overlap=1)
    rnd = random.Random(7)
    px = im.load()
    for _ in range(9):  # brilhinhos
        x, y = rnd.randrange(30, im.size[0] - 30), rnd.randrange(90, im.size[1] - 40)
        if px[x, y][3] > 200 and sum(px[x, y][:3]) > 380:
            Pen(im, x - x % PX, y - y % PX).dot(0, 0, hx('ffffff'))
    out.append(('frog_nascente', im))

    # 3. Enfermagem: branquinha com touca
    im, _, _ = with_margin(recolor(base['frog_cloud'], white=True), top=50)
    hat(im, NURSE, {'O': hx('5a3a3a'), 'W': hx('ffffff'), 'R': hx('e8463a')}, overlap=2)
    out.append(('frog_enfermeira', im))

    # 4. Agronomia: brotinho
    im, _, _ = with_margin(recolor(base['frog_leaf'], hue=96, sat=1.0, val=1.05), top=60)
    hat(im, SPROUT, {'O': hx('2b4a1e'), 'G': hx('7ccf4a'), 'H': hx('b7ef7a'), 'S': hx('4f9a2e')}, overlap=1)
    out.append(('frog_sementinha', im))

    # 9. Ciência da Computação: óculos quadrados e notebook
    im = recolor(base['frog_lagoon'], hue=222, sat=0.55, val=1.0)
    (lx, ly), (rx, ry) = eyes(im)
    from PIL import ImageDraw
    dr = ImageDraw.Draw(im)
    rim = hx('20242e')
    for (ex, ey) in ((lx, ly), (rx, ry)):
        dr.rectangle((ex - 25, ey - 22, ex + 25, ey + 22), outline=(*rim, 255), width=6)
    dr.rectangle((min(lx, rx) + 25, (ly + ry) / 2 - 3, max(lx, rx) - 25, (ly + ry) / 2 + 2), fill=(*rim, 255))
    Pen(im, (lx + rx) / 2 - 7 * 7, im.size[1] * 0.5, 7).rows(0, 0, LAPTOP, {
        'O': hx('2a2f3a'), 'S': hx('1d2b3a'), 'g': hx('5af07a'), 'K': hx('c3ccd6'), 'k': hx('8f9aa6')})
    im, _, _ = with_margin(im, top=10)
    out.append(('frog_bitinha', im))

    # 11. Biologia: lupa
    im = base['frog_lavender'].copy()
    (lx, ly), (rx, ry) = eyes(im)
    Pen(im, rx - 30, max(ly, ry) + 28, 9).rows(0, 0, LUPA, {
        'O': hx('3a404c'), 'L': hx('bfe8ff'), 'W': hx('ffffff'), 'H': hx('8a5a2e')})
    im, _, _ = with_margin(im, top=10, side=30)
    out.append(('frog_lupinha', im))

    # 10. Hospital Veterinário: estetoscópio
    im = recolor(base['frog_jade'], hue=204, sat=0.55, val=1.08)
    (lx, ly), (rx, ry) = eyes(im)
    Pen(im, (lx + rx) / 2 - 9.5 * 7, max(ly, ry) + 24, 7).rows(0, 0, STETHO, {
        'G': hx('d9383a'), 'O': hx('2c3240'), 'S': hx('dfe5ec'), 'W': hx('ffffff')})
    im, _, _ = with_margin(im, top=10)
    out.append(('frog_doutorinha', im))

    # 5. Laticínio: malhada de vaca
    im = recolor(base['frog_jade'], white=True)
    (lx, ly), (rx, ry) = eyes(im)
    W0, H0 = im.size
    spots(im, hx('2a2a32'), 5, seed=21, rmin=14, rmax=21, avoid=((lx, ly, 40), (rx, ry, 40)),
          belly=(W0 * 0.5, H0 * 0.62, W0 * 0.24, H0 * 0.3))
    im, _, _ = with_margin(im, top=10)
    out.append(('frog_leiteira', im))

    # 6. Fábrica de Ração: amarela de milho, com espiga no colo
    im = recolor(base['frog_honey'], hue=46, sat=1.15, val=1.05)
    (lx, ly), (rx, ry) = eyes(im)
    cx = (lx + rx) / 2
    Pen(im, cx - 4 * 8 + 6, im.size[1] * 0.38, 8).rows(0, 0, CORN, {'G': hx('5aa83a'), 'Y': hx('ffe45a'), 'y': hx('f2a020')})
    im, _, _ = with_margin(im, top=10)
    out.append(('frog_milharina', im))

    # 7. Suinocultura: rosinha com focinho e orelhinhas
    im, _, _ = with_margin(recolor(base['frog_guava'], hue=344, sat=0.9, val=1.05), top=44)
    (lx, ly), (rx, ry) = eyes(im)
    pal = {'O': hx('7a3348'), 'P': hx('ffa3bd'), 'p': hx('f0789a'), 'K': hx('7a3348')}
    Pen(im, (lx + rx) / 2 - 4.5 * 7, max(ly, ry) + 22, 7).rows(0, 0, SNOUT, pal)
    Pen(im, lx - 9 * 7, ly - 6 * 7, 7).rows(0, 0, EAR_L, pal)
    Pen(im, rx + 3 * 7, ry - 6 * 7, 7).rows(0, 0, EAR_R, pal)
    out.append(('frog_porquinha', im))

    # 8. Equoterapia: marrom com crina
    im, _, _ = with_margin(recolor(base['frog_clay'], hue=26, sat=0.72, val=0.92), top=40)
    hat(im, MANE, {'M': hx('4a2a14'), 'N': hx('7a4a26')}, overlap=2, dx=-50, bs=8)
    out.append(('frog_cavalinha', im))
    return out


def preview(frogs, path):
    W = sum(im.size[0] for _, im in frogs) + 20 * (len(frogs) + 1)
    H = max(im.size[1] for _, im in frogs) + 40
    sheet = Image.new('RGBA', (W, H), (226, 240, 220, 255))
    x = 20
    for _, im in frogs:
        sheet.alpha_composite(im, (x, H - im.size[1] - 20))
        x += im.size[0] + 20
    sheet.save(path)


# Pererecas que estão no jogo agora (as outras ficam guardadas para lugares futuros)
IN_GAME = ['frog_enfermeira', 'frog_sementinha', 'frog_bitinha', 'frog_doutorinha', 'frog_lupinha']


def build_atlas(frogs):
    """Junta as pererecas do jogo num atlas e devolve os retângulos de cada uma."""
    chosen = [(k, im) for k, im in frogs if k in IN_GAME]
    chosen.sort(key=lambda t: IN_GAME.index(t[0]))
    W = sum(im.size[0] for _, im in chosen) + 4 * (len(chosen) + 1)
    H = max(im.size[1] for _, im in chosen) + 8
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    rects, x = {}, 4
    for k, im in chosen:
        bbox = im.getbbox()
        crop = im.crop(bbox)
        atlas.alpha_composite(crop, (x, 4))
        rects[k] = [x, 4, crop.size[0], crop.size[1]]
        x += crop.size[0] + 4
    atlas = atlas.crop((0, 0, x, H))
    atlas.save(os.path.join(ASSETS, 'frogs_campus.png'))
    return rects


if __name__ == '__main__':
    import sys
    frogs = make(load_base())
    if len(sys.argv) > 2 and sys.argv[1] == '--previa':
        preview([f for f in frogs if f[0] in IN_GAME] if '--jogo' in sys.argv else frogs, sys.argv[2])
    else:
        print(json.dumps(build_atlas(frogs)))
