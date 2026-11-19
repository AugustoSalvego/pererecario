"""Cenários e alvos dos minijogos de trabalho (client/assets/sprites/job-*.png).

Cada trabalho tem 3 rodadas e uma tela final. Cada cenário tem 96 x 72 pixels (ampliado no jogo);
os marcadores (o que se toca) são sprites pequenos desenhados por cima.

O progresso é gradual: cada toque muda um pedaço da cena de vez.
- rodada "reveal": cada toque revela um pedaço da imagem seguinte (o tijolo sobe, o telhado aparece,
  a tinta cobre a parede, a fumaça some, o barro sai, a terra fica molhada). Os pedaços são
  calculados aqui, comparando as duas imagens, e gravados em client/js/ui/jobcells.js.
- rodada "items": cada toque tira um objeto da cena (porca, mato, tomate).

Uso: python3 scripts/gerar_trabalhos.py [--previa arquivo.png]   (requer Pillow)
"""
import json
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
    # rodada 3: pintar (paredes de tijolo, telhado pronto): é exatamente como a casa fica no fim da rodada 2
    p = Pix(SW, SH); sky_ground(p); tree(p, 2, 30)
    house_walls(p); roof_frame(p); scaffold(p); roof_frame(p, tiles=True)
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
    if state == 'dirty':     # barro: 6 manchas separadas (cada toque limpa uma)
        for (x, y) in DIRT:
            car.ellipse(x - 18, y - 10, 3.2, 2.2, hx('7a5a3a'))
            car.put(x - 19, y - 11, hx('9a7a50'))
    return car


DIRT = [(31, 47), (41, 50), (51, 47), (61, 50), (70, 47), (48, 38)]   # manchas de barro (na cena)
ENGINE_BOLTS = [(32, 25), (48, 25), (64, 25), (38, 45), (58, 45)]     # parafusos do motor (cena de perto)
WHEEL = (54, 36)          # centro da roda na cena de perto
NUT_R = 11                # raio onde ficam as 5 porcas
NUTS = [(round(WHEEL[0] + NUT_R * __import__('math').cos(__import__('math').radians(a))),
         round(WHEEL[1] + NUT_R * __import__('math').sin(__import__('math').radians(a)))) for a in (-90, -18, 54, 126, 198)]


def wheel_scene():
    """Rodada 1 do carro: a roda furada vista de perto (as porcas são marcadores, por cima)."""
    p = Pix(SW, SH); workshop(p)
    cx, cy = WHEEL
    body, body_d = hx('5fbf4a'), hx('3e9a3a')
    p.rect(22, 0, SW - 1, 9, body); p.rect(22, 10, SW - 1, 11, body_d)       # lataria em cima
    p.ellipse(cx, cy - 4, 30, 26, hx('1c1f27'))                               # caixa de roda
    p.rect(0, 0, 21, 0, hx('6f8aa6'))
    tire, tread = hx('2b2b33'), hx('3d3d48')
    p.ellipse(cx, cy, 25, 25, tire)
    p.rect(cx - 27, cy + 18, cx + 27, cy + 24, tire)                          # pneu murcho: achatado embaixo
    p.rect(cx - 28, cy + 21, cx + 28, cy + 24, tire)
    for y in range(cy + 25, SH):
        p.rect(cx - 30, y, cx + 30, y, hx('a9b0ba'))                          # chão por baixo
    p.rect(cx - 28, cy + 25, cx + 28, cy + 25, hx('8a929c'))                  # sombra
    for a in range(0, 360, 20):                                               # ranhuras
        import math
        x = cx + 22 * math.cos(math.radians(a)); y = cy + 22 * math.sin(math.radians(a))
        if y < cy + 18:
            p.put(round(x), round(y), tread)
    p.ellipse(cx, cy, 17, 17, hx('a3a9b3'))
    p.ellipse(cx, cy, 15, 15, hx('c9ced6'))
    p.ellipse(cx - 4, cy - 5, 5, 3, hx('e3e7ec'))
    p.ellipse(cx, cy, 5, 5, hx('8a9099'))
    p.ellipse(cx, cy, 2, 2, hx('5a5f6a'))
    for (x, y) in NUTS:                                                       # pinos que ficam sem a porca
        p.rect(x - 1, y - 1, x, y, hx('6a707a'))
    p.rect(8, 52, 20, 60, hx('d9473a')); p.rect(12, 46, 16, 52, hx('d9473a'))   # macaco
    p.rect(10, 44, 18, 45, hx('8a9099'))
    return p


def engine_scene():
    """Rodada 2 do carro: o motor visto de perto, de cima, com o capô aberto. Os parafusos soltos são
    marcadores; aqui ficam só as cabeças já apertadas, que aparecem quando o marcador sai."""
    p = Pix(SW, SH)
    p.rect(0, 0, SW - 1, SH - 1, hx('3a3f48'))                                  # cofre do motor
    p.rect(0, 0, SW - 1, 8, hx('5fbf4a')); p.rect(0, 9, SW - 1, 10, hx('2e7a2c'))   # capô levantado
    p.rect(0, 11, 5, SH - 1, hx('5fbf4a')); p.rect(SW - 6, 11, SW - 1, SH - 1, hx('5fbf4a'))
    p.rect(6, 11, 6, SH - 1, hx('2e7a2c')); p.rect(SW - 7, 11, SW - 7, SH - 1, hx('2e7a2c'))
    for y in range(62, 70, 3):                                                   # grade da frente
        p.rect(10, y, SW - 11, y + 1, hx('8a9099'))
    p.rect(26, 18, 70, 54, hx('8a9099')); p.rect(26, 18, 70, 19, hx('a9b0ba'))  # bloco
    p.rect(28, 20, 68, 30, hx('5a6270'))                                         # tampa de válvulas
    for x in range(31, 67, 4):
        p.rect(x, 21, x + 1, 29, hx('6a7380'))
    p.rect(30, 36, 66, 52, hx('7a808c'))
    p.ellipse(48, 41, 6, 3, hx('2b2b33')); p.ellipse(48, 41, 4, 2, hx('d9a520'))   # tampa do óleo
    p.rect(9, 28, 21, 46, hx('2b2b33')); p.rect(11, 25, 13, 27, hx('d9473a')); p.rect(17, 25, 19, 27, hx('1c1f27'))  # bateria
    p.rect(9, 28, 21, 29, hx('454a55'))
    p.rect(75, 24, 87, 40, hx('e0c060')); p.rect(75, 24, 87, 26, hx('f2d888')); p.rect(79, 21, 83, 23, hx('3a3f48'))  # reservatório
    for (x, y) in ENGINE_BOLTS:                                                   # cabeças já apertadas
        p.rect(x - 1, y - 1, x + 1, y + 1, hx('c3ccd6')); p.put(x, y, hx('8a9099'))
    return p


def engine_smoke():
    """Fumaça por cima do motor (camada separada: vai sumindo a cada parafuso apertado)."""
    p = Pix(SW, SH)
    for (x, y, rx, ry) in ((44, 15, 6, 4), (54, 11, 5, 3.6), (40, 7, 4.5, 3.2), (60, 5, 4, 3), (50, 3, 3.5, 2.6), (34, 13, 3.5, 2.8)):
        p.ellipse(x, y, rx, ry, hx('e6e9ec', 215))
        p.ellipse(x - 1, y - 1, rx * .5, ry * .5, hx('ffffff', 235))
    return p


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
    out['carro-1'] = wheel_scene()
    out['carro-2'] = engine_scene()
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
    p = Pix(12, 12); p.ellipse(5.5, 3.5, 3, 1.6, hx('c3ccd6')); p.rect(5, 4, 6, 10, hx('9aa1ab')); p.outline(); t['prego'] = p
    p = Pix(12, 12); p.ellipse(5.5, 5.5, 4.5, 3.8, hx('ffd76a')); p.ellipse(4, 4, 1.5, 1, hx('ffeaa0')); t['tinta'] = p
    p = Pix(12, 12)  # parafuso sextavado
    p.rect(3, 3, 8, 8, hx('c3ccd6')); p.put(3, 3, (0, 0, 0, 0)); p.put(8, 3, (0, 0, 0, 0)); p.put(3, 8, (0, 0, 0, 0)); p.put(8, 8, (0, 0, 0, 0))
    p.rect(5, 4, 6, 7, hx('8a9099')); p.outline(); t['parafuso'] = p
    p = Pix(12, 12)  # bolhas de sabão
    p.ellipse(4, 6, 2.6, 2.6, hx('e6f6ff')); p.ellipse(8, 4, 2, 2, hx('e6f6ff')); p.put(3, 5, hx('ffffff')); p.outline(hx('9fd8f2')); t['bolha'] = p
    p = Pix(12, 12)  # mato
    for x, h in ((3, 6), (5, 8), (7, 7), (9, 5)):
        p.rect(x, 11 - h, x, 10, hx('3f7a2e')); p.put(x - 1, 11 - h + 1, hx('3f7a2e'))
    p.outline(); t['mato'] = p
    p = Pix(12, 12); p.ellipse(5.5, 6.5, 3.8, 3.6, hx('e8463a')); p.ellipse(4.2, 5.2, 1, .9, hx('ff9a8a'))  # tomate
    p.rect(5, 2, 6, 3, hx('3f7a2e')); p.put(4, 3, hx('3f7a2e')); p.put(7, 3, hx('3f7a2e')); p.outline(); t['tomate'] = p
    p = Pix(8, 8)  # porca sextavada da roda
    p.rect(1, 1, 6, 6, hx('d6dbe2')); p.put(1, 1, (0, 0, 0, 0)); p.put(6, 1, (0, 0, 0, 0)); p.put(1, 6, (0, 0, 0, 0)); p.put(6, 6, (0, 0, 0, 0))
    p.rect(3, 3, 4, 4, hx('8a9099')); p.put(2, 2, hx('ffffff')); p.outline(); t['porca'] = p
    p = Pix(12, 12)  # gota d'água (onde regar)
    p.put(5, 1, hx('3f8fd8')); p.put(6, 1, hx('3f8fd8')); p.rect(4, 2, 7, 3, hx('3f8fd8')); p.rect(3, 4, 8, 6, hx('3f8fd8'))
    p.rect(3, 7, 8, 8, hx('2c74b8')); p.rect(4, 9, 7, 9, hx('2c74b8')); p.put(4, 4, hx('bfe6ff')); p.put(4, 5, hx('bfe6ff'))
    p.outline(); t['gota'] = p
    p = Pix(12, 12)  # caixa da entrega
    p.rect(1, 3, 10, 10, hx('c99a5a')); p.rect(1, 3, 10, 4, hx('e0b878')); p.rect(5, 3, 6, 10, hx('e8dcc0')); p.outline(); t['caixa'] = p
    return t


# Como cada rodada progride. reveal: cada toque revela um pedaço de `to` dentro de `roi`
# (x0, y0, x1, y1), em pedaços de uma grade (grid = colunas, linhas) ou um por mancha (blobs).
# items: cada toque tira o objeto que está em cada posição de `slots`.
ROUNDS = {
    'casa-1': dict(kind='reveal', to='casa-2', roi=(26, 28, 69, 43), mode='grid', grid=(4, 2)),
    'casa-2': dict(kind='reveal', to='casa-3', roi=(0, 0, 95, 27), mode='grid', grid=(4, 2)),
    'casa-3': dict(kind='reveal', to='casa-4', roi=(24, 28, 71, 58), mode='grid', grid=(4, 2)),
    'carro-1': dict(kind='items', slots=NUTS),
    'carro-2': dict(kind='items', slots=ENGINE_BOLTS, fade='carro-2-fumaca'),
    'carro-3': dict(kind='reveal', to='carro-4', roi=(22, 32, 78, 56), mode='blobs', n=len(DIRT)),
    'horta-1': dict(kind='items', slots=[(16, 35), (40, 35), (76, 35), (28, 47), (64, 47), (16, 59), (52, 59)]),
    'horta-2': dict(kind='reveal', to='horta-3', roi=(0, 33, 95, 67), mode='grid', grid=(2, 3)),
    'horta-3': dict(kind='items', slots=[(22, 34), (58, 34), (10, 46), (46, 46), (82, 46), (34, 58), (70, 58)]),
}
MARKER_OF = {'casa-1': 'vaga', 'casa-2': 'prego', 'casa-3': 'tinta', 'carro-1': 'porca', 'carro-2': 'parafuso',
             'carro-3': None, 'horta-1': 'mato', 'horta-2': 'gota', 'horta-3': 'tomate'}


def diff_mask(a, b, roi):
    pa, pb = a.im.load(), b.im.load()
    x0, y0, x1, y1 = roi
    return {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if pa[x, y] != pb[x, y]}


def bbox(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def cells_grid(mask, cols, rows):
    x0, y0, x1, y1 = bbox(mask)
    out = []
    for r in range(rows):
        for c in range(cols):
            cx0 = x0 + (x1 - x0 + 1) * c // cols; cx1 = x0 + (x1 - x0 + 1) * (c + 1) // cols - 1
            cy0 = y0 + (y1 - y0 + 1) * r // rows; cy1 = y0 + (y1 - y0 + 1) * (r + 1) // rows - 1
            pts = [p for p in mask if cx0 <= p[0] <= cx1 and cy0 <= p[1] <= cy1]
            if pts:
                out.append((cx0, cy0, cx1, cy1, pts))
    return out


def cells_blobs(mask, n):
    left, groups = set(mask), []
    while left:
        stack = [left.pop()]; g = set(stack)
        while stack:
            x, y = stack.pop()
            for dx in (-2, -1, 0, 1, 2):
                for dy in (-2, -1, 0, 1, 2):
                    q = (x + dx, y + dy)
                    if q in left:
                        left.discard(q); g.add(q); stack.append(q)
        groups.append(g)
    while len(groups) > n:   # junta as duas manchas mais próximas
        best = None
        for i in range(len(groups)):
            for j in range(i + 1, len(groups)):
                bi, bj = bbox(groups[i]), bbox(groups[j])
                d = abs((bi[0] + bi[2]) - (bj[0] + bj[2])) + abs((bi[1] + bi[3]) - (bj[1] + bj[3]))
                if best is None or d < best[0]:
                    best = (d, i, j)
        _, i, j = best
        groups[i] |= groups.pop(j)
    return [(*bbox(g), sorted(g)) for g in groups]


def round_cells():
    """{cena: [ {r: [x0, y0, x1, y1], t: [x, y]} ]} para reveal; {cena: [ {t: [x, y]} ]} para items"""
    scenes = all_scenes()
    out = {}
    for name, spec in ROUNDS.items():
        if spec['kind'] == 'items':
            out[name] = [{'t': list(t)} for t in spec['slots']]
            continue
        mask = diff_mask(scenes[name], scenes[spec['to']], spec['roi'])
        cells = cells_grid(mask, *spec['grid']) if spec['mode'] == 'grid' else cells_blobs(mask, spec['n'])
        lst = []
        for (cx0, cy0, cx1, cy1, pts) in cells:
            bx0, by0, bx1, by1 = bbox(pts)   # só a parte que muda dentro do pedaço
            lst.append({'r': [bx0, by0, bx1 + 1, by1 + 1], 't': [round((bx0 + bx1) / 2), round((by0 + by1) / 2)]})
        lst.sort(key=lambda c: (c['t'][1], c['t'][0]))
        out[name] = lst
    return out


def all_scenes():
    s = {}
    s.update(house_scenes()); s.update(car_scenes()); s.update(garden_scenes())
    return s


def save():
    for k, p in all_scenes().items():
        p.im.save(os.path.join(OUT, f'job-{k}.png'))
    for k, p in targets().items():
        p.im.save(os.path.join(OUT, f'job-alvo-{k}.png'))
    engine_smoke().im.save(os.path.join(OUT, 'job-carro-2-fumaca.png'))
    cells = round_cells()
    js = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'client', 'js', 'ui', 'jobcells.js')
    with open(js, 'w') as f:
        f.write('// Gerado por scripts/gerar_trabalhos.py: não edite à mão.\n')
        f.write('// Pedaços de cada rodada (pixels do cenário 96 x 72). r = área que muda com o toque; t = onde tocar.\n')
        f.write('export const CELLS = {\n')
        for k, v in cells.items():
            f.write(f"  '{k}': {json.dumps(v, separators=(',', ':'))},\n")
        f.write('};\n')
    for k, v in cells.items():
        pts = [c['t'] for c in v]
        close = min((abs(a[0] - b[0]) ** 2 + abs(a[1] - b[1]) ** 2) ** .5 for i, a in enumerate(pts) for b in pts[i + 1:]) if len(pts) > 1 else 99
        print(f'  {k}: {len(v)} toques, menor distância entre marcadores {close:.1f} px')
    print('cenários dos trabalhos gerados em', OUT)


def preview(path):
    """cada rodada no começo (com os marcadores), no meio (metade dos toques) e no fim"""
    sc = 3
    scenes, tg, cells = all_scenes(), targets(), round_cells()
    from PIL import ImageDraw, ImageFont
    f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
    pw, ph = SW * sc, SH * sc
    names = list(ROUNDS)
    img = Image.new('RGB', (3 * (pw + 16) + 16, len(names) * (ph + 34) + 10), (206, 232, 190))
    d = ImageDraw.Draw(img)

    def state(name, done):
        spec, cl = ROUNDS[name], cells[name]
        im = scenes[name].im.copy()
        if spec.get('fade'):
            smoke = engine_smoke().im.copy()
            a = smoke.split()[3].point(lambda v: int(v * (1 - done / len(cl))))
            smoke.putalpha(a); im.alpha_composite(smoke)
        for i, c in enumerate(cl):
            if i < done:
                if spec['kind'] == 'reveal':
                    x0, y0, x1, y1 = c['r']
                    im.paste(scenes[spec['to']].im.crop((x0, y0, x1, y1)), (x0, y0))
                continue
            m = MARKER_OF[name]
            if m:
                t = tg[m].im
                im.alpha_composite(t, (c['t'][0] - t.width // 2, c['t'][1] - t.height // 2))
            else:
                ImageDraw.Draw(im).ellipse((c['t'][0] - 5, c['t'][1] - 5, c['t'][0] + 5, c['t'][1] + 5), outline=(255, 255, 255, 255))
        return im

    for r, name in enumerate(names):
        y = 10 + r * (ph + 34)
        n = len(cells[name])
        for j, (done, lab) in enumerate(((0, 'começo'), (n // 2, f'{n // 2} de {n}'), (n, 'fim'))):
            big = state(name, done).resize((pw, ph), Image.NEAREST)
            img.paste(big, (16 + j * (pw + 16), y))
            d.text((16 + j * (pw + 16) + 4, y + ph + 4), f'{name} · {lab}', font=f2, fill=(40, 70, 40))
    img.save(path)


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--previa':
        preview(sys.argv[2])
    else:
        save()
