"""Cenários e alvos dos minijogos de trabalho (client/assets/sprites/job-*.png).

Cada trabalho tem 3 rodadas e uma tela final. Cada cenário tem 96 x 72 pixels (ampliado no jogo);
os alvos (o que se toca) são sprites de 12 x 12 desenhados por cima.
Uso: python3 scripts/gerar_trabalhos.py [--previa arquivo.png]   (requer Pillow)
"""
import os
import random
import sys

from PIL import Image

SW, SH = 96, 72
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'client', 'assets', 'sprites')
INK = (28, 31, 39, 255)


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class Pix:
    def __init__(self, w, h):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.px = self.im.load()
        self.w, self.h = w, h

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def frame(self, x0, y0, x1, y1, c):
        self.rect(x0, y0, x1, y0, c); self.rect(x0, y1, x1, y1, c)
        self.rect(x0, y0, x0, y1, c); self.rect(x1, y0, x1, y1, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    self.put(x, y, c)

    def tri(self, cx, top, base_y, half, c):
        for y in range(top, base_y + 1):
            k = (y - top) / max(1, base_y - top)
            hw = int(round(half * k))
            self.rect(cx - hw, y, cx + hw, y, c)

    def outline(self, c=INK):
        src = self.im.copy().load()
        for y in range(self.h):
            for x in range(self.w):
                if src[x, y][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and src[nx, ny][3] > 200:
                        self.px[x, y] = c
                        break

    def paste(self, other, x, y):
        self.im.alpha_composite(other.im if isinstance(other, Pix) else other, (x, y))


# ------------------------------------------------------------------ fundos
def sky_ground(p, ground_y=44, grass='#7cc35b', sky=('#8fd8f7', '#b8ecff')):
    for y in range(ground_y):
        p.rect(0, y, SW - 1, y, hx(sky[0] if y < ground_y * 0.45 else sky[1]))
    for y in range(ground_y, SH):
        p.rect(0, y, SW - 1, y, hx(grass))
    rnd = random.Random(ground_y)
    for _ in range(40):
        p.put(rnd.randrange(SW), rnd.randrange(ground_y + 1, SH), hx('5aa83f'))
    for cx, cy in ((14, 8), (74, 12)):  # nuvens
        p.ellipse(cx, cy, 6, 2.4, hx('ffffff'))
        p.ellipse(cx + 4, cy - 1, 4, 2.2, hx('ffffff'))


def tree(p, x, y):
    t = Pix(16, 22)
    t.rect(7, 13, 8, 21, hx('7a4a26'))
    t.ellipse(7.5, 8, 6.5, 6.5, hx('4f9a48'))
    t.ellipse(5, 6, 3, 3, hx('74bd6a'))
    t.outline()
    p.paste(t, x, y)


# ------------------------------------------------------------------ casinha
BRICK, BRICK_D, MORTAR = hx('c9673a'), hx('a24f2a'), hx('e8cba8')


def house_walls(p, upto_row=None, plaster=None):
    """Paredes de tijolo de y=28 a y=55. upto_row: até onde já tem tijolo."""
    x0, x1, y0, y1 = 26, 69, 28, 55
    p.rect(x0 - 2, y1 + 1, x1 + 2, y1 + 3, hx('8a8f99'))           # alicerce
    top = y0 if upto_row is None else upto_row
    p.rect(x0, top, x1, y1, MORTAR)
    for y in range(top, y1 + 1, 4):
        off = 0 if (y // 4) % 2 == 0 else 3
        for x in range(x0 + off - 3, x1 + 1, 6):
            p.rect(max(x0, x), y, min(x1, x + 4), min(y1, y + 2), BRICK)
            p.rect(max(x0, x), min(y1, y + 2), min(x1, x + 4), min(y1, y + 2), BRICK_D)
    if plaster:
        p.rect(x0, y0, x1, y1, hx(plaster))
    return x0, x1, y0, y1


def roof_frame(p, tiles=False):
    cx, top, base = 47, 10, 27
    if tiles:
        p.tri(cx, top, base, 26, hx('d9473a'))
        for y in range(top + 3, base + 1, 3):
            k = (y - top) / (base - top)
            hw = int(26 * k)
            p.rect(cx - hw, y, cx + hw, y, hx('a8342a'))
    else:
        wood = hx('a8743a')
        for y in range(top, base + 1):
            k = (y - top) / (base - top)
            hw = int(round(26 * k))
            p.put(cx - hw, y, wood); p.put(cx + hw, y, wood)
            p.put(cx - hw + 1, y, wood); p.put(cx + hw - 1, y, wood)
        p.rect(cx - 26, base, cx + 26, base, wood)
        for bx in (-16, -6, 4, 14):  # caibros
            for y in range(top + 3, base):
                k = (y - top) / (base - top)
                if abs(bx) <= int(26 * k):
                    p.put(cx + bx, y, wood)


def door_window(p, color='#7a4a26'):
    p.rect(42, 43, 51, 55, hx(color)); p.put(49, 49, hx('f2c230'))
    p.rect(30, 34, 38, 41, hx('9fd8f2')); p.frame(29, 33, 39, 42, hx('ffffff'))
    p.rect(56, 34, 64, 41, hx('9fd8f2')); p.frame(55, 33, 65, 42, hx('ffffff'))


def scaffold(p):
    wood = hx('a8743a')
    for x in (20, 74):
        p.rect(x, 24, x + 1, 57, wood)
    p.rect(19, 36, 76, 36, wood)


def house_scenes():
    out = {}
    # rodada 1: assentar tijolos (parede pela metade + andaime)
    p = Pix(SW, SH); sky_ground(p); tree(p, 2, 30)
    house_walls(p, upto_row=44); scaffold(p)
    out['casa-1'] = p
    # rodada 2: martelar o telhado (paredes prontas, estrutura do telhado)
    p = Pix(SW, SH); sky_ground(p); tree(p, 2, 30)
    house_walls(p); roof_frame(p); scaffold(p)
    out['casa-2'] = p
    # rodada 3: pintar (reboco cinza, telhado pronto)
    p = Pix(SW, SH); sky_ground(p); tree(p, 2, 30)
    house_walls(p, plaster='#b9bec6'); roof_frame(p, tiles=True); door_window(p, '#8a8f99')
    out['casa-3'] = p
    # pronta
    p = Pix(SW, SH); sky_ground(p); tree(p, 2, 30)
    house_walls(p, plaster='#ffd76a'); roof_frame(p, tiles=True); door_window(p)
    for fx in (24, 28, 66, 70):
        p.put(fx, 57, hx('ff7aa8')); p.put(fx, 58, hx('4f9a48'))
    out['casa-4'] = p
    return out


# ------------------------------------------------------------------ oficina
def workshop(p):
    for y in range(SH):
        p.rect(0, y, SW - 1, y, hx('6f8aa6') if y < 40 else hx('a9b0ba'))
    p.rect(0, 40, SW - 1, 41, hx('56708c'))
    p.rect(6, 6, 30, 22, hx('a8743a')); p.frame(6, 6, 30, 22, hx('7a4a26'))   # quadro de ferramentas
    p.rect(10, 9, 11, 19, hx('c3ccd6')); p.rect(9, 9, 12, 10, hx('c3ccd6'))
    p.rect(16, 10, 17, 19, hx('7a4a26')); p.rect(14, 9, 19, 11, hx('8a9099'))
    p.rect(23, 9, 26, 12, hx('d9473a')); p.rect(24, 13, 25, 19, hx('2b2b33'))
    p.ellipse(78, 62, 8, 2.5, hx('8a929c'))   # mancha de óleo


def big_car(state):
    """Hatch grande, de lado, para a oficina."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import gerar_carros as gc
    im = gc.frame('hatch', 'right', 0).resize((64, 56), Image.NEAREST)
    car = Pix(64, 56)
    car.paste(im, 0, 0)
    if state == 'flat':      # pneu da frente murcho
        car.rect(40, 44, 54, 53, (0, 0, 0, 0))
        car.ellipse(47, 50, 7, 4, hx('2b2b33')); car.rect(46, 49, 48, 50, hx('c9ced6'))
    if state == 'hood':      # capô aberto
        car.rect(44, 18, 62, 20, hx('3e9a3a'))
        car.rect(46, 21, 58, 27, hx('5a5f6a')); car.rect(48, 22, 56, 26, hx('7a808c'))
    if state == 'dirty':     # barro
        rnd = random.Random(3)
        for _ in range(7):
            car.ellipse(rnd.randint(10, 52), rnd.randint(28, 40), rnd.uniform(2, 4), rnd.uniform(1.5, 2.5), hx('7a5a3a'))
    return car


def car_scenes():
    out = {}
    for i, state in enumerate(('flat', 'hood', 'dirty', 'ok'), 1):
        p = Pix(SW, SH); workshop(p)
        car = big_car(state)
        p.paste(car, 18, 10)
        if state == 'flat':
            p.rect(60, 58, 70, 60, hx('d9473a')); p.rect(64, 54, 66, 58, hx('d9473a'))  # macaco
        if state == 'hood':
            for sx, sy in ((70, 22), (74, 18), (69, 15)):  # fumacinha
                p.ellipse(sx, sy, 2.5, 2, hx('e6e9ec'))
        if state == 'dirty':
            p.rect(80, 54, 88, 62, hx('3f8fd8')); p.rect(81, 52, 87, 53, hx('8a9099'))  # balde
        if state == 'ok':
            for sx, sy in ((30, 22), (60, 26), (46, 18)):  # brilhos
                p.put(sx, sy, hx('ffffff')); p.put(sx - 1, sy, hx('fff3a8')); p.put(sx + 1, sy, hx('fff3a8'))
                p.put(sx, sy - 1, hx('fff3a8')); p.put(sx, sy + 1, hx('fff3a8'))
        out[f'carro-{i}'] = p
    return out


# ------------------------------------------------------------------ horta
def garden(p, rows_ok=True, wet=False):
    sky_ground(p, ground_y=30)
    for x in range(0, SW, 6):   # cerquinha
        p.rect(x, 24, x + 1, 31, hx('d9b77a'))
    p.rect(0, 26, SW - 1, 26, hx('d9b77a'))
    for i, y in enumerate((38, 50, 62)):  # canteiros
        p.rect(4, y - 3, SW - 5, y + 3, hx('6a4a2e') if wet else hx('8a5f3a'))
        p.rect(4, y + 3, SW - 5, y + 3, hx('553a24'))
        for x in range(10, SW - 8, 12):
            p.ellipse(x, y - 2, 3.2, 2.4, hx('5fbf48') if rows_ok else hx('8bbf5a'))
            p.put(x, y - 3, hx('a6ec7a'))


def garden_scenes():
    out = {}
    p = Pix(SW, SH); garden(p); out['horta-1'] = p                      # arrancar o mato
    p = Pix(SW, SH); garden(p)
    p.rect(80, 14, 88, 20, hx('3f8fd8')); p.rect(88, 15, 92, 16, hx('3f8fd8'))  # regador
    out['horta-2'] = p                                                   # regar
    p = Pix(SW, SH); garden(p, wet=True)
    p.rect(78, 12, 90, 20, hx('c99a5a')); p.frame(78, 12, 90, 20, hx('8a5f3a'))  # cesto
    out['horta-3'] = p                                                   # colher
    p = Pix(SW, SH); garden(p, wet=True)
    p.rect(78, 12, 90, 20, hx('c99a5a')); p.frame(78, 12, 90, 20, hx('8a5f3a'))
    for i, (x, c) in enumerate(((80, '#e8463a'), (83, '#ff8a2a'), (86, '#e8463a'), (81, '#5fbf48'), (85, '#ff8a2a'))):
        p.ellipse(x + 1, 11 + (i // 3) * 2, 1.6, 1.6, hx(c))
    out['horta-4'] = p
    return out


# ------------------------------------------------------------------ alvos (12 x 12)
def targets():
    t = {}
    p = Pix(12, 12)  # vaga de tijolo (pontilhada)
    for x in range(1, 11):
        if x % 2: p.put(x, 3, hx('ffffff')); p.put(x, 8, hx('ffffff'))
    for y in range(3, 9):
        if y % 2: p.put(1, y, hx('ffffff')); p.put(10, y, hx('ffffff'))
    t['vaga'] = p
    p = Pix(12, 12); p.rect(2, 4, 9, 7, BRICK); p.rect(2, 7, 9, 7, BRICK_D); p.outline(); t['tijolo'] = p
    p = Pix(12, 12); p.ellipse(5.5, 3.5, 3, 1.6, hx('c3ccd6')); p.rect(5, 4, 6, 10, hx('9aa1ab')); p.outline(); t['prego'] = p
    p = Pix(12, 12); p.ellipse(5.5, 5.5, 4.5, 3.8, hx('9aa0a8')); p.ellipse(4, 4, 1.5, 1, hx('c3c8ce')); t['reboco'] = p
    p = Pix(12, 12); p.ellipse(5.5, 5.5, 4.5, 3.8, hx('ffd76a')); p.ellipse(4, 4, 1.5, 1, hx('ffeaa0')); t['tinta'] = p
    p = Pix(12, 12)  # parafuso sextavado
    p.rect(3, 3, 8, 8, hx('c3ccd6')); p.put(3, 3, (0, 0, 0, 0)); p.put(8, 3, (0, 0, 0, 0)); p.put(3, 8, (0, 0, 0, 0)); p.put(8, 8, (0, 0, 0, 0))
    p.rect(5, 4, 6, 7, hx('8a9099')); p.outline(); t['parafuso'] = p
    p = Pix(12, 12); p.ellipse(5.5, 6, 4.5, 3.4, hx('7a5a3a')); p.ellipse(4, 5, 1.6, 1.2, hx('9a7a50')); t['lama'] = p
    p = Pix(12, 12)  # bolhas de sabão
    p.ellipse(4, 6, 2.6, 2.6, hx('e6f6ff')); p.ellipse(8, 4, 2, 2, hx('e6f6ff')); p.put(3, 5, hx('ffffff')); p.outline(hx('9fd8f2')); t['bolha'] = p
    p = Pix(12, 12)  # mato
    for x, h in ((3, 6), (5, 8), (7, 7), (9, 5)):
        p.rect(x, 11 - h, x, 10, hx('3f7a2e')); p.put(x - 1, 11 - h + 1, hx('3f7a2e'))
    p.outline(); t['mato'] = p
    p = Pix(12, 12); p.ellipse(5.5, 6.5, 5, 3.4, hx('d9b77a'))  # terra seca rachada
    p.put(3, 6, hx('a8875a')); p.put(4, 7, hx('a8875a')); p.put(7, 5, hx('a8875a')); p.put(8, 6, hx('a8875a')); t['seca'] = p
    p = Pix(12, 12); p.ellipse(5.5, 6.5, 5, 3.4, hx('553a24')); p.put(4, 5, hx('7fc8ff')); t['molhada'] = p
    p = Pix(12, 12); p.ellipse(5.5, 6.5, 3.8, 3.6, hx('e8463a')); p.ellipse(4.2, 5.2, 1, .9, hx('ff9a8a'))  # tomate
    p.rect(5, 2, 6, 3, hx('3f7a2e')); p.put(4, 3, hx('3f7a2e')); p.put(7, 3, hx('3f7a2e')); p.outline(); t['tomate'] = p
    p = Pix(12, 12)  # caixa da entrega
    p.rect(1, 3, 10, 10, hx('c99a5a')); p.rect(1, 3, 10, 4, hx('e0b878')); p.rect(5, 3, 6, 10, hx('e8dcc0')); p.outline(); t['caixa'] = p
    return t


# onde ficam os alvos em cada rodada (posições no cenário, em pixels do cenário)
SLOTS = {
    'casa-1': [(26, 38), (32, 38), (38, 38), (44, 38), (50, 38), (56, 38), (62, 38), (29, 32), (41, 32), (53, 32), (65, 32)],
    'casa-2': [(30, 20), (38, 17), (46, 13), (54, 17), (62, 20), (26, 23), (68, 23), (42, 21), (50, 21)],
    'casa-3': [(28, 30), (40, 30), (52, 30), (62, 30), (30, 46), (56, 46), (64, 48), (36, 50)],
    'carro-1': [(60, 52), (66, 52), (63, 48), (63, 56)],
    'carro-2': [(62, 30), (70, 30), (66, 34), (62, 36), (72, 36)],
    'carro-3': [(28, 36), (38, 34), (48, 40), (58, 38), (66, 42), (34, 44), (52, 46)],
    'horta-1': [(14, 30), (32, 30), (52, 42), (70, 42), (20, 54), (44, 54), (78, 54)],
    'horta-2': [(10, 33), (34, 33), (58, 45), (82, 45), (22, 57), (70, 57)],
    'horta-3': [(8, 30), (32, 30), (56, 42), (80, 42), (20, 54), (44, 54), (68, 54)],
}
TARGET_OF = {'casa-1': 'vaga', 'casa-2': 'prego', 'casa-3': 'reboco', 'carro-1': 'parafuso', 'carro-2': 'parafuso',
             'carro-3': 'lama', 'horta-1': 'mato', 'horta-2': 'seca', 'horta-3': 'tomate'}


def all_scenes():
    s = {}
    s.update(house_scenes()); s.update(car_scenes()); s.update(garden_scenes())
    return s


def save():
    for k, p in all_scenes().items():
        p.im.save(os.path.join(OUT, f'job-{k}.png'))
    for k, p in targets().items():
        p.im.save(os.path.join(OUT, f'job-alvo-{k}.png'))
    print('cenários dos trabalhos gerados em', OUT)


def preview(path):
    sc = 3
    scenes, tg = all_scenes(), targets()
    jobs = [('casa', 'Construir casinha', ['Assentar tijolos', 'Martelar o telhado', 'Pintar', 'Pronta!']),
            ('carro', 'Consertar carro', ['Soltar o pneu', 'Apertar o motor', 'Lavar', 'Pronto!']),
            ('horta', 'Ajudar na horta', ['Arrancar o mato', 'Regar', 'Colher', 'Pronto!'])]
    from PIL import ImageDraw, ImageFont
    f1 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26)
    f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
    pw, ph = SW * sc, SH * sc
    img = Image.new('RGB', (4 * (pw + 16) + 16, len(jobs) * (ph + 80) + 10), (206, 232, 190))
    d = ImageDraw.Draw(img)
    for r, (key, title, labels) in enumerate(jobs):
        y = 10 + r * (ph + 80)
        d.text((16, y), title, font=f1, fill=(40, 70, 40))
        for i in range(4):
            sk = f'{key}-{i + 1}'
            scene = scenes[sk].im.copy()
            for (x, yy) in SLOTS.get(sk, []):
                tgt = tg[TARGET_OF[sk]].im
                ring = Image.new('RGBA', (14, 14), (0, 0, 0, 0))
                rp = ring.load()
                for a in range(14):
                    for b in range(14):
                        if 5.2 <= ((a - 6.5) ** 2 + (b - 6.5) ** 2) ** .5 <= 6.6:
                            rp[a, b] = (255, 255, 255, 230)
                scene.alpha_composite(tgt, (x - 6, yy - 6))
                scene.alpha_composite(ring, (x - 7, yy - 7))
            big = scene.resize((pw, ph), Image.NEAREST)
            px0 = 16 + i * (pw + 16)
            img.paste(big, (px0, y + 36))
            d.text((px0 + 4, y + 36 + ph + 4), f'{i + 1 if i < 3 else "✓"}. {labels[i]}' if i < 3 else labels[i], font=f2, fill=(40, 70, 40))
    img.save(path)


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--previa':
        preview(sys.argv[2])
    else:
        save()
