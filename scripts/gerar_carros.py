"""Gera os carrinhos do Pererecário (client/assets/sprites/car-<modelo>.png).

Cada arquivo é uma folha de 2 colunas (quadro 1 e 2, as rodas "pulam" um pixel) x 4 linhas
(frente/descendo, esquerda, direita, costas/subindo), com quadros de 32 x 28 pixels.
Os modelos são genéricos (não imitam nenhuma marca).
Uso: python3 scripts/gerar_carros.py [--previa arquivo.png]   (requer Pillow)
"""
import os
import sys

from PIL import Image

W, H = 32, 28


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (255,)


class Canvas:
    def __init__(self):
        self.p = [[None] * W for _ in range(H)]

    def put(self, part, x, y):
        if 0 <= x < W and 0 <= y < H:
            self.p[y][x] = part

    def rect(self, part, x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(part, x, y)

    def ellipse(self, part, cx, cy, rx, ry):
        for y in range(H):
            for x in range(W):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.put(part, x, y)

    def render(self, pal, outline):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        px = im.load()
        P = self.p
        for y in range(H):
            for x in range(W):
                part = P[y][x]
                if part is None:
                    continue
                base, dark, light = pal[part]
                c = base
                below = P[y + 1][x] if y + 1 < H else None
                above = P[y - 1][x] if y > 0 else None
                if below != part and dark:
                    c = dark
                elif above != part and light:
                    c = light
                px[x, y] = c
        out = im.copy()
        op = out.load()
        for y in range(H):
            for x in range(W):
                if px[x, y][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and px[nx, ny][3]:
                        op[x, y] = outline
                        break
        return out


def palette(color):
    c = hx(color)
    return {
        'body': (c, shade(c, .72), shade(c, 1.22)),
        'body2': (shade(c, .85), shade(c, .66), None),
        'glass': (hx('9fd8f2'), hx('6aaed0'), hx('d9f3ff')),
        'tire': (hx('2b2b33'), hx('1b1b22'), hx('44444f')),
        'hub': (hx('c9ced6'), hx('9aa1ab'), None),
        'light': (hx('fff3a8'), hx('ffe066'), None),
        'tail': (hx('8a1f1f') if c[0] > 200 and c[1] < 110 else hx('e8463a'), hx('b8322a'), None),
        'bumper': (hx('5a5f6a'), hx('3c4049'), hx('7a808c')),
        'bed': (hx('3a3a44'), hx('2a2a32'), None),
        'spare': (hx('2b2b33'), hx('1b1b22'), None),
        'stripe': (hx('ffffff'), hx('e6e6e6'), None),
        'shadow': (hx('000000', 70), None, None),
    }


# ------------------------------------------------------------------ modelos
# Cada modelo diz o comprimento (lado), a largura (frente), a altura da cabine e extras.
MODELS = {
    'hatch': dict(name='Hatch', color='#5bbf55', length=22, width=18, cab=(0.30, 0.95), roof=6, wheel=3, low=0),
    'sedan': dict(name='Sedã', color='#3d7fd8', length=29, width=20, cab=(0.30, 0.72), roof=5, wheel=3, low=0),
    'pickup': dict(name='Picape', color='#e04a3a', length=30, width=21, cab=(0.42, 0.78), roof=6, wheel=4, low=0, bed=True),
    'jeep': dict(name='Jipe', color='#7d8f4e', length=25, width=20, cab=(0.10, 0.70), roof=7, wheel=4, low=-1, spare=True, boxy=True),
    'super': dict(name='Superesportivo', color='#f2c230', length=29, width=21, cab=(0.30, 0.70), roof=5, wheel=3, low=1, spoiler=True, stripe=True, wedge=True),
}
ORDER = list(MODELS)


def side(c, m, bob):
    """Visto de lado, virado para a direita."""
    L = m['length']
    x0 = (W - L) // 2
    x1 = x0 + L - 1
    ground = H - 3
    wr = m['wheel']
    body_bottom = ground - wr + 1
    body_top = body_bottom - (5 if not m.get('boxy') else 7) + m['low'] // 2
    body_top += bob
    body_bottom += bob
    # carroceria
    c.rect('body', x0, body_top, x1, body_bottom)
    # cabine (vidros)
    ca, cb = m['cab']
    cx0, cx1 = x0 + int(L * ca), x0 + int(L * cb)
    roof_top = body_top - m['roof'] + max(0, m['low'] // 2)
    if m.get('boxy'):
        c.rect('body', cx0, roof_top, cx1, body_top)
        c.rect('glass', cx0 + 1, roof_top + 1, cx1 - 1, body_top - 1)
        c.rect('body', (cx0 + cx1) // 2, roof_top + 1, (cx0 + cx1) // 2, body_top - 1)
    else:
        for y in range(roof_top, body_top):
            k = (y - roof_top) / max(1, body_top - roof_top)
            a = cx0 + int((1 - k) * 3)
            b = cx1 - int((1 - k) * (4 if m.get('spoiler') else 2))
            c.rect('body', a, y, b, y)
        for y in range(roof_top + 1, body_top):
            k = (y - roof_top) / max(1, body_top - roof_top)
            a = cx0 + int((1 - k) * 3) + 1
            b = cx1 - int((1 - k) * (4 if m.get('spoiler') else 2)) - 1
            if b > a:
                c.rect('glass', a, y, b, y)
        mid = (cx0 + cx1) // 2
        c.rect('body', mid, roof_top + 1, mid, body_top - 1)
    if m.get('bed'):
        c.rect('bed', cx1 + 2, body_top, x1 - 1, body_top + 1)
    if m.get('spoiler'):
        c.rect('body2', x0, body_top - 2, x0 + 3, body_top - 2)
        c.rect('body2', x0 + 1, body_top - 1, x0 + 1, body_top - 1)
    if m.get('spare'):
        c.rect('spare', x0 - 2, body_top + 1, x0 - 1, body_bottom - 1)
    if m.get('wedge'):  # frente em cunha
        for k in range(6):
            for y in range(body_top, body_top + (5 - k) // 2):
                c.p[y][x1 - k] = None
    # para-choques e luzes
    c.rect('bumper', x0, body_bottom, x0 + 1, body_bottom)
    c.rect('bumper', x1 - 1, body_bottom, x1, body_bottom)
    c.rect('light', x1, body_top + 1, x1, body_top + 2)
    c.rect('tail', x0, body_top + 1, x0, body_top + 2)
    # rodas
    for wx in (x0 + 4, x1 - 4):
        c.ellipse('tire', wx, ground - wr + 1, wr + .3, wr + .3)
        c.rect('hub', wx, ground - wr + 1, wx, ground - wr + 1)


def front(c, m, bob, back=False):
    """De frente (descendo a tela) ou de costas (subindo)."""
    Wd = m['width']
    x0 = (W - Wd) // 2
    x1 = x0 + Wd - 1
    ground = H - 2
    wr = m['wheel']
    body_bottom = ground - 2 + bob
    body_top = body_bottom - (6 if not m.get('boxy') else 8) + m['low'] // 2
    # rodas aparecendo dos lados, embaixo
    c.rect('tire', x0 - 1, body_bottom - wr, x0 + 1, ground)
    c.rect('tire', x1 - 1, body_bottom - wr, x1 + 1, ground)
    c.rect('body', x0, body_top, x1, body_bottom)
    # cabine
    roof_top = body_top - m['roof'] - 1 + max(0, m['low'] // 2)
    inset = 2 if not m.get('boxy') else 1
    for y in range(roof_top, body_top):
        k = (y - roof_top) / max(1, body_top - roof_top)
        a = x0 + inset + int((1 - k) * 2)
        b = x1 - inset - int((1 - k) * 2)
        c.rect('body', a, y, b, y)
        if y > roof_top and y < body_top:
            c.rect('glass', a + 1, y, b - 1, y)
    if m.get('spoiler') and back:
        c.rect('body2', x0 + 1, body_top - 2, x1 - 1, body_top - 2)
        c.rect('body2', x0 + 2, body_top - 1, x0 + 2, body_top - 1)
        c.rect('body2', x1 - 2, body_top - 1, x1 - 2, body_top - 1)
    if m.get('spare') and back:
        c.ellipse('spare', (x0 + x1) / 2, body_top + 3, 3.2, 3.2)
        c.rect('hub', (x0 + x1) // 2, body_top + 3, (x0 + x1) // 2, body_top + 3)
    if m.get('stripe'):
        c.rect('stripe', (x0 + x1) // 2 - 1, body_top, (x0 + x1) // 2, body_bottom - 2)
    # luzes
    lt = 'tail' if back else 'light'
    c.rect(lt, x0 + 1, body_top + 2, x0 + 3, body_top + 3)
    c.rect(lt, x1 - 3, body_top + 2, x1 - 1, body_top + 3)
    if not back:
        c.rect('bumper', x0 + 5, body_top + 3, x1 - 5, body_top + 3)  # grade
    c.rect('bumper', x0, body_bottom, x1, body_bottom)


def pickup_side(c, m, bob):
    """Picape de lado: capô curto, cabine alta e caçamba com borda."""
    L = m['length']
    x0 = (W - L) // 2
    x1 = x0 + L - 1
    ground = H - 3
    top, bottom = 14 + bob, 21 + bob
    c.rect('body', x0, top, x1, bottom)                     # carroceria inteira
    cab0, cab1 = x1 - 17, x1 - 8                            # cabine
    c.rect('body', cab0, top - 6, cab1, top)
    c.rect('glass', cab0 + 1, top - 5, cab1 - 2, top - 1)
    c.rect('body', cab0 + 4, top - 5, cab0 + 4, top - 1)    # coluna entre os vidros
    for y in range(top - 6, top):                           # para-brisa inclinado
        c.put('body', cab1 + (y - (top - 6)) // 2, y)
    c.rect('bed', x0 + 1, top, cab0 - 2, top)               # boca da caçamba
    c.rect('body2', cab0 - 1, top, cab0 - 1, bottom - 2)    # divisão cabine/caçamba
    c.rect('stripe', x0 + 1, top + 3, x1 - 1, top + 3)      # friso
    c.rect('bumper', x0, bottom, x0 + 2, bottom)
    c.rect('bumper', x1 - 2, bottom, x1, bottom)
    c.rect('light', x1, top + 1, x1, top + 2)
    c.rect('tail', x0, top + 1, x0, top + 3)
    for wx in (x0 + 5, x1 - 5):
        c.ellipse('tire', wx, ground - 2, 3.4, 3.4)
        c.rect('hub', wx, ground - 2, wx, ground - 2)


def pickup_front(c, m, bob, back):
    Wd = m['width']
    x0 = (W - Wd) // 2
    x1 = x0 + Wd - 1
    ground = H - 2
    bottom = ground - 2 + bob
    top = bottom - 7
    c.rect('tire', x0 - 1, bottom - 4, x0 + 1, ground)
    c.rect('tire', x1 - 1, bottom - 4, x1 + 1, ground)
    c.rect('body', x0, top, x1, bottom)
    if back:
        # de costas a gente vê a caçamba aberta, e a cabine lá na frente
        c.rect('body', x0 + 3, top - 8, x1 - 3, top - 3)
        c.rect('glass', x0 + 5, top - 7, x1 - 5, top - 5)
        c.rect('bed', x0 + 1, top - 2, x1 - 1, top + 1)
        c.rect('body', x0, top - 2, x0, top + 1)
        c.rect('body', x1, top - 2, x1, top + 1)
        c.rect('tail', x0 + 1, top + 3, x0 + 2, top + 5)
        c.rect('tail', x1 - 2, top + 3, x1 - 1, top + 5)
        c.put('light', x0 + 1, top + 5)
        c.put('light', x1 - 1, top + 5)
        c.rect('body2', x0 + 6, top + 4, x1 - 6, top + 4)   # puxador da tampa
    else:
        c.rect('body', x0 + 3, top - 7, x1 - 3, top)
        c.rect('glass', x0 + 4, top - 6, x1 - 4, top - 2)
        c.rect('bumper', x0 + 4, top + 2, x1 - 4, top + 4)  # grade grande
        for gx in range(x0 + 5, x1 - 4, 2):
            c.put('body2', gx, top + 3)
        c.rect('light', x0 + 1, top + 2, x0 + 3, top + 3)
        c.rect('light', x1 - 3, top + 2, x1 - 1, top + 3)
    c.rect('bumper', x0, bottom, x1, bottom)


# Sedã desenhado pixel a pixel. B = lataria, b = sombra, L = brilho, G = vidro, g = vidro escuro,
# K = borracha/para-choque, S = cromado, Y = farol, R = lanterna. Rodas (T/H) ficam em outra camada.
SEDAN = {
    'right': [
        "..........LLLLLLLL............",
        ".........LGGGGBGGGgL..........",
        "........LGGGGGBGGGGgL.........",
        ".......LGGGGGGBGGGGGgL........",
        ".LLLLLLBBBBBBBBBBBBBBBLLLLLLL.",
        "RBBBBBBBBBBBBBbBBBBBBBBBBBBBBY",
        "BBBBBBBBBBBBBBbBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBbBBBBBBBBBBBBBBB",
        "bb.......bbbbbbbbbbbb......bbb",
        "KK.......KKKKKKKKKKKK......KKK",
    ],
    'down': [
        ".....LLLLLLLLLLLL.....",
        "....LGGGGGGGGGGGGL....",
        "...LGGGGGGGGGGGGGGL...",
        "..LGGGGGGGGGGGGGGGgL..",
        ".LLLLLLLLLLLLLLLLLLLL.",
        "BBBBBBBBBBBBBBBBBBBBBB",
        "BYYYBBKKKKKKKKKKBBYYYB",
        "BBBBBBKSKSKSKSKSBBBBBB",
        "bbbbbbbbbbbbbbbbbbbbbb",
        "KKKKKKKKKKKKKKKKKKKKKK",
    ],
    'up': [
        ".....LLLLLLLLLLLL.....",
        "....LGGGGGGGGGGGGL....",
        "...LGGGGGGGGGGGGGGL...",
        "..LgGGGGGGGGGGGGGGGL..",
        ".LLLLLLLLLLLLLLLLLLLL.",
        "BBBBBBBBBBBBBBBBBBBBBB",
        "BRRRBBBBBBBBBBBBBBRRRB",
        "BBBBBBBBSSSSSSBBBBBBBB",
        "bbbbbbbbbbbbbbbbbbbbbb",
        "KKKKKKKKKKKKKKKKKKKKKK",
    ],
}
SEDAN_WHEELS = {'right': [(5, 10), (24, 10)], 'down': None, 'up': None}


def draw_art(model, view, f):
    """Desenha um carro feito à mão: rodas atrás, lataria por cima (pula 1 px no quadro 2)."""
    art = SEDAN[view]
    m = MODELS[model]
    c0 = hx(m['color'])
    pal = {'B': c0, 'b': shade(c0, .72), 'L': shade(c0, 1.25), 'G': hx('9fd8f2'), 'g': hx('6aaed0'),
           'K': hx('3c4049'), 'S': hx('e6e9ec'), 'Y': hx('fff3a8'), 'R': hx('e8463a')}
    w = len(art[0])
    ox = (W - w) // 2
    top = H - 2 - (len(art) + 3)          # rodas descem 3 px abaixo da lataria
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    px = im.load()
    tire, hub = hx('2b2b33'), hx('c9ced6')
    if view == 'right':
        for (cx, cy) in SEDAN_WHEELS['right']:
            for y in range(H):
                for x in range(W):
                    if (x - ox - cx) ** 2 + (y - top - cy) ** 2 <= 3.3 ** 2:
                        px[x, y] = tire
            px[ox + cx, top + cy] = hub
    else:
        for x0 in (0, w - 3):
            for y in range(top + 8, top + 13):
                for x in range(ox + x0, ox + x0 + 3):
                    px[x, y] = tire
    lift = 1 if f else 0
    for j, row in enumerate(art):
        for i, ch in enumerate(row):
            if ch in pal:
                px[ox + i, top + j - lift] = pal[ch]
    out = im.copy()
    op = out.load()
    for y in range(H):
        for x in range(W):
            if px[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and px[nx, ny][3]:
                    op[x, y] = hx('1c1f27')
                    break
    return out


def frame(model, view, f):
    m = MODELS[model]
    pal = palette(m['color'])
    c = Canvas()
    bob = 1 if f else 0
    v = 'right' if view == 'left' else view
    if model == 'pickup':
        if v == 'right':
            pickup_side(c, m, bob)
        else:
            pickup_front(c, m, bob, back=(v == 'up'))
    elif model == 'sedan':
        im = draw_art('sedan', v, f)
        return _finish(im, m, v, view)
    elif v == 'right':
        side(c, m, bob)
    else:
        front(c, m, bob, back=(v == 'up'))
    im = c.render(pal, hx('1c1f27'))
    return _finish(im, m, v, view)


def _finish(im, m, v, view):
    # sombra embaixo
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    spx = sh.load()
    span = m['length'] if v == 'right' else m['width'] + 2
    for x in range((W - span) // 2, (W + span) // 2):
        for y in (H - 2, H - 1):
            spx[x, y] = (0, 0, 0, 50)
    sh.alpha_composite(im)
    im = sh
    if view == 'left':
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im


DIRS = ('down', 'left', 'right', 'up')


def sheet(model):
    s = Image.new('RGBA', (W * 2, H * 4), (0, 0, 0, 0))
    for r, d in enumerate(DIRS):
        for f in range(2):
            s.alpha_composite(frame(model, d, f), (f * W, r * H))
    return s


def main():
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'client', 'assets', 'sprites')
    for m in ORDER:
        sheet(m).save(os.path.join(out, f'car-{m}.png'))
    save_icons()
    print('carros e ícones dos trabalhos gerados em', out)


# ------------------------------------------------------------------ ícones dos trabalhos
ICONS = {
    # martelo (construir casinha)
    'casa': ["............",
             "...OOOOO....",
             "..OKKKKKO...",
             "..OKKKKKOO..",
             "...OOOWOO...",
             "......OWO...",
             ".......OWO..",
             "........OWO.",
             ".........OWO",
             "..........OO",
             "............",
             "............"],
    # chave inglesa (consertar carro)
    'carro': [".OO..OO.....",
              "OGGO.OGO....",
              "OGGOOGGO....",
              ".OGGGGGO....",
              "..OGGGGGO...",
              "...OOOGGGO..",
              "......OGGGO.",
              ".......OGGGO",
              "........OGGO",
              ".........OO.",
              "............",
              "............"],
    # broto (ajudar na horta)
    'horta': ["............",
              "..OO....OO..",
              ".OLLO..OLLO.",
              ".OLHLOOLHLO.",
              "..OLLLLLLO..",
              "...OOLLOO...",
              ".....OLO....",
              ".....OLO....",
              "...OOOOOOO..",
              "..ODDDDDDDO.",
              "..ODDDDDDDO.",
              "...OOOOOOO.."],
    # caixinha (entrega)
    'entrega': ["............",
                "............",
                "..OOOOOOOO..",
                ".OBBBTBBBBO.",
                ".OLLLTLLLLO.",
                ".OBBBTBBBBO.",
                ".OBBBTBBBBO.",
                ".OBBBTBBBBO.",
                ".OBBBTBBBBO.",
                "..OOOOOOOO..",
                "............",
                "............"],
}
ICON_PAL = {'O': hx('1c1f27'), 'K': hx('8a9099'), 'W': hx('a8743a'), 'G': hx('b8c2cc'),
            'L': hx('5fbf48'), 'H': hx('a6ec7a'), 'D': hx('8a5a32')}
ICON_PAL_BOX = {'O': hx('1c1f27'), 'B': hx('c99a5a'), 'L': hx('e0b878'), 'T': hx('e8dcc0')}


def bubble(icon):
    """Balãozinho branco com o ícone do trabalho (16 x 18)."""
    im = Image.new('RGBA', (16, 18), (0, 0, 0, 0))
    px = im.load()
    for y in range(15):
        for x in range(16):
            corner = (x in (0, 15) and y in (0, 14)) or (x in (0, 15) and y in (1, 13)) or (y in (0, 14) and x in (1, 14))
            if not corner:
                px[x, y] = hx('ffffff')
    for (x, y) in ((6, 15), (7, 15), (8, 15), (7, 16)):
        px[x, y] = hx('ffffff')
    # contorno
    out = im.copy()
    op = out.load()
    for y in range(18):
        for x in range(16):
            if px[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < 16 and 0 <= ny < 18 and px[nx, ny][3]:
                    op[x, y] = hx('1c1f27')
                    break
    pal = ICON_PAL_BOX if icon == 'entrega' else ICON_PAL
    for j, row in enumerate(ICONS[icon]):
        for i, ch in enumerate(row):
            if ch in pal:
                op[2 + i, 1 + j] = pal[ch]
    return out


def save_icons():
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'client', 'assets', 'sprites')
    for k in ICONS:
        bubble(k).save(os.path.join(out, f'bubble-job-{k}.png'))


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--previa':
        sc = 6
        prev = Image.new('RGBA', (len(ORDER) * (W * 4 + 6) + 6, H + 8), (124, 196, 112, 255))
        for i, m in enumerate(ORDER):
            for j, d in enumerate(('down', 'right', 'up', 'left')):
                prev.alpha_composite(frame(m, d, 0), (6 + i * (W * 4 + 6) + j * W, 4))
        prev.resize((prev.width * sc, prev.height * sc), Image.NEAREST).save(sys.argv[2])
    else:
        main()
