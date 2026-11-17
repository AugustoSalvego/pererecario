"""Gera os bonecos do Pererecário (client/assets/sprites/char-<modelo>-<gênero>-<tom>.png).

Cada arquivo é uma folha de 3 colunas (parado, passo 1, passo 2) x 4 linhas
(frente, esquerda, direita, costas), com quadros de 24 x 32 pixels.
Uso: python3 scripts/gerar_bonecos.py   (requer Pillow)
"""
from PIL import Image

W, H = 24, 32


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class Canvas:
    def __init__(self):
        self.p = [[None] * W for _ in range(H)]
        self.detail = {}

    def put(self, part, x, y):
        if 0 <= x < W and 0 <= y < H:
            self.p[y][x] = part

    def rect(self, part, x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(part, x, y)

    def ellipse(self, part, cx, cy, rx, ry, only=None):
        for y in range(H):
            for x in range(W):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    if only is None or self.p[y][x] in only:
                        self.put(part, x, y)

    def dot(self, color, x, y):
        if 0 <= x < W and 0 <= y < H:
            self.detail[(x, y)] = color

    def render(self, pal, outline, edged=()):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        px = im.load()
        P = self.p
        for y in range(H):
            for x in range(W):
                part = P[y][x]
                if part is None:
                    continue
                base, shade, light = pal[part]
                c = base
                below = P[y + 1][x] if y + 1 < H else None
                above = P[y - 1][x] if y > 0 else None
                right = P[y][x + 1] if x + 1 < W else None
                if below != part or right != part and x > W // 2:
                    c = shade
                elif above != part and light:
                    c = light
                if part in edged:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < W and 0 <= ny < H and P[ny][nx] not in (None, part) and (part, P[ny][nx]) not in NO_EDGE:
                            if dy >= 0:
                                c = outline
                            break
                px[x, y] = c
        for (x, y), c in self.detail.items():
            px[x, y] = c
        # contorno externo
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


_pairs = [('skin', 'hand'), ('hair', 'skin'), ('shirt', 'belly'), ('hood', 'eyeball'), ('hair', 'hair2'),
          ('shirt', 'strap'), ('shirt', 'belt'), ('pack', 'strap'), ('hat', 'band'), ('brim', 'band'), ('hat', 'brim'),
          ('pants', 'belt'), ('shirt', 'hand')]
NO_EDGE = set(_pairs) | {(b, a) for a, b in _pairs}

SKIN = {'clara': ('f6cfa3', 'e2ad80', 'fde3c4', 'f3a091'),
        'media': ('d49a6a', 'b47a4c', 'e3b285', 'e08a78'),
        'escura': ('8f5a37', '74452a', 'a86e48', 'b86a5a')}
HAIR = {'clara': ('7a4a2a', '5a3418', '9a6438'), 'media': ('3e2716', '2a190d', '5a3a22'), 'escura': ('241610', '150c08', '3a2418')}


def palette(model, skin):
    s, sd, sl, ck = SKIN[skin]
    hr, hd, hl = HAIR[skin]
    pal = {
        'skin': (hx(s), hx(sd), hx(sl)), 'hand': (hx(s), hx(sd), None),
        'hair': (hx(hr), hx(hd), hx(hl)), 'hair2': (hx(hd), hx(hd), None),
        'boot': (hx('4a3426'), hx('33231a'), hx('6e523d')),
    }
    if model == 'explorer':
        pal.update({
            'hat': (hx('ecd28f'), hx('c9a45e'), hx('f8e7b6')), 'brim': (hx('dcbc72'), hx('b38a45'), hx('f1dc9c')),
            'band': (hx('6e4a24'), hx('6e4a24'), None), 'shirt': (hx('5bbf55'), hx('3a8f3e'), hx('8fdc72')),
            'strap': (hx('7a4a26'), hx('5a3418'), None), 'pack': (hx('c08a50'), hx('8f5f30'), hx('dcae74')),
            'pants': (hx('8a6a45'), hx('634a30'), hx('a8865c')), 'belt': (hx('5a3a20'), hx('5a3a20'), None),
            'belly': (hx('5bbf55'), hx('3a8f3e'), None),
        })
    else:
        pal.update({
            'hood': (hx('6cc04a'), hx('3f8f35'), hx('97dd73')), 'eyeball': (hx('ffffff'), hx('d9e8d4'), None),
            'shirt': (hx('6cc04a'), hx('3f8f35'), hx('97dd73')), 'belly': (hx('d9f0a8'), hx('b9d98a'), None),
            'pants': (hx('4a6fa5'), hx('34507c'), hx('6a8fc5')), 'boot': (hx('f2c230'), hx('c9961a'), hx('ffe27a')),
            'strap': (hx('3f8f35'), hx('3f8f35'), None), 'band': (hx('ff7aa8'), hx('d64f80'), None),
        })
    return pal, hx(s), hx(ck)


INK = hx('1f1712')
WHITE = hx('ffffff')
MOUTH = hx('8a3a2e')
PINK = hx('ff7aa8')
PINK2 = hx('ffc2d8')


# ---------------------------------------------------------------- partes
def legs(c, view, frame):
    """frame 0 = parado, 1 = passo A, 2 = passo B"""
    if view in ('down', 'up'):
        lx = [(8, 11), (12, 15)]
        lift = {0: (0, 0), 1: (1, 0), 2: (0, 1)}[frame]
        for i, (a, b) in enumerate(lx):
            up = lift[i]
            c.rect('pants', a, 26, b, 28 - up)
            c.rect('boot', a - (1 if i == 0 else 0), 29 - up, b + (1 if i == 1 else 0), 30 - up)
    else:
        if frame == 0:
            c.rect('pants', 9, 26, 14, 28)
            c.rect('boot', 9, 29, 15, 30)
        else:
            f, b = (1, -1) if frame == 1 else (-1, 1)
            c.rect('pants', 10 + f, 26, 12 + f, 28)
            c.rect('boot', 10 + f, 29, 14 + f, 30)
            c.rect('pants', 10 + b, 26, 12 + b, 27)
            c.rect('boot', 9 + b, 28, 12 + b, 29)


def torso(c, model, view, frame, fem):
    arm_swing = {0: 0, 1: 1, 2: -1}[frame]
    if view in ('down', 'up'):
        c.rect('shirt', 7, 18, 16, 25)
        c.rect('shirt', 5, 19, 6, 22 + (arm_swing if view == 'down' else 0))
        c.rect('shirt', 17, 19, 18, 22 - (arm_swing if view == 'down' else 0))
        c.rect('hand', 5, 23 + (arm_swing if view == 'down' else 0), 6, 24 + (arm_swing if view == 'down' else 0))
        c.rect('hand', 17, 23 - (arm_swing if view == 'down' else 0), 18, 24 - (arm_swing if view == 'down' else 0))
        if model == 'froghood' and view == 'down':
            c.ellipse('belly', 11.5, 22.5, 3.2, 2.6, only={'shirt'})
        if model == 'explorer':
            if view == 'down':
                for y in range(18, 25):
                    c.put('strap', 9, y)
                    c.put('strap', 14, y)
            else:
                c.rect('pack', 7, 18, 16, 24)
                c.rect('pack', 8, 17, 15, 17)
                c.rect('strap', 9, 20, 14, 20)
            c.rect('belt', 7, 25, 16, 25)
    else:
        c.rect('shirt', 8, 18, 15, 25)
        if model == 'explorer':
            c.rect('pack', 5, 18, 8, 24)
            c.rect('belt', 8, 25, 15, 25)
        sw = {0: 0, 1: 2, 2: -2}[frame]
        c.rect('shirt', 11 + sw // 2, 19, 13 + sw // 2, 22)
        c.rect('hand', 11 + sw // 2, 23, 13 + sw // 2, 24)


def head_explorer(c, view, fem, pal):
    if view == 'down':
        c.ellipse('hair', 11.5, 12.5, 7.6, 6.2)
        c.ellipse('skin', 11.5, 13.6, 6.6, 5.0)
        c.rect('hair', 6, 9, 17, 10)
        for x in (7, 9, 12, 15):
            c.put('hair', x, 11)
        if fem:
            c.rect('hair', 3, 12, 5, 21)
            c.rect('hair', 18, 12, 20, 21)
        c.ellipse('hat', 11.5, 4.5, 6.2, 4.2)
        c.ellipse('brim', 11.5, 8.0, 11.2, 1.9)
        c.rect('band', 6, 6, 17, 6)
    elif view == 'up':
        c.ellipse('hair', 11.5, 12.5, 7.6, 6.2)
        if fem:
            c.rect('hair', 9, 17, 14, 22)
            c.rect('hair2', 10, 22, 13, 23)
        c.ellipse('hat', 11.5, 4.5, 6.2, 4.2)
        c.ellipse('brim', 11.5, 8.0, 11.2, 1.9)
        c.rect('band', 6, 6, 17, 6)
    else:
        c.ellipse('hair', 11.0, 12.6, 7.4, 6.0)
        c.ellipse('skin', 13.4, 13.4, 5.4, 4.3)
        c.rect('hair', 6, 9, 15, 10)
        c.rect('hair', 4, 10, 8, 16)
        if fem:
            c.rect('hair', 3, 14, 6, 21)
        c.ellipse('hat', 11.0, 4.5, 6.0, 4.2)
        c.ellipse('brim', 12.5, 8.0, 10.5, 1.8)
        c.rect('band', 6, 6, 16, 6)


def head_froghood(c, view, fem, pal):
    if view == 'down':
        c.ellipse('hood', 11.5, 11.5, 10.4, 8.6)
        c.ellipse('eyeball', 6.0, 3.6, 3.3, 3.2)
        c.ellipse('eyeball', 17.0, 3.6, 3.3, 3.2)
        c.ellipse('hair', 11.5, 13.0, 6.6, 5.2, only={'hood'})
        c.ellipse('skin', 11.5, 14.0, 6.0, 4.4)
        c.rect('hair', 7, 9, 16, 10)
        if fem:
            c.rect('hair', 5, 12, 6, 19)
            c.rect('hair', 17, 12, 18, 19)
    elif view == 'up':
        c.ellipse('hood', 11.5, 11.5, 10.4, 8.6)
        c.ellipse('hood', 6.0, 3.6, 3.3, 3.2)
        c.ellipse('hood', 17.0, 3.6, 3.3, 3.2)
        for (x, y) in ((8, 9), (14, 8), (11, 13), (6, 14), (16, 14), (12, 17)):
            c.dot(pal['hood'][1], x, y); c.dot(pal['hood'][1], x + 1, y)
    else:
        c.ellipse('hood', 11.0, 11.6, 9.6, 8.4)
        c.ellipse('hood', 8.5, 4.6, 2.2, 2.2)
        c.ellipse('eyeball', 14.5, 3.6, 3.3, 3.2)
        c.ellipse('hair', 14.6, 13.0, 5.4, 5.0, only={'hood'})
        c.ellipse('skin', 15.0, 14.0, 4.8, 4.2)
        c.rect('hair', 11, 9, 18, 10)


def face(c, model, view, fem, pal, skin_rgb, cheek):
    if view == 'up':
        return
    if view == 'down':
        ey = 13 if model == 'explorer' else 13
        for ex in (8, 14):
            c.dot(INK, ex, ey); c.dot(INK, ex + 1, ey)
            c.dot(INK, ex, ey + 1); c.dot(INK, ex + 1, ey + 1)
            c.dot(INK, ex, ey + 2); c.dot(INK, ex + 1, ey + 2)
            c.dot(WHITE, ex, ey)
        if fem:
            c.dot(INK, 7, ey - 1); c.dot(INK, 16, ey - 1)
        c.dot(cheek, 6, ey + 3); c.dot(cheek, 7, ey + 3)
        c.dot(cheek, 16, ey + 3); c.dot(cheek, 17, ey + 3)
        c.dot(MOUTH, 11, ey + 4); c.dot(MOUTH, 12, ey + 4)
    else:
        ey = 13
        ex = 15
        c.dot(INK, ex, ey); c.dot(INK, ex + 1, ey)
        c.dot(INK, ex, ey + 1); c.dot(INK, ex + 1, ey + 1)
        c.dot(INK, ex, ey + 2); c.dot(INK, ex + 1, ey + 2)
        c.dot(WHITE, ex + 1, ey)
        if fem:
            c.dot(INK, ex + 2, ey - 1)
        c.dot(cheek, 16, ey + 3); c.dot(cheek, 17, ey + 3)
        c.dot(MOUTH, 17, ey + 4)


def frog_pupils(c, view):
    if view == 'down':
        for x in (6, 17):
            c.dot(INK, x, 3); c.dot(INK, x, 4); c.dot(INK, x - 1 if x == 6 else x + 1, 4)
            c.dot(INK, x - 1 if x == 6 else x + 1, 3)
            c.dot(WHITE, x - 1 if x == 6 else x, 2)
    elif view in ('left', 'right'):
        c.dot(INK, 15, 3); c.dot(INK, 16, 3); c.dot(INK, 15, 4); c.dot(INK, 16, 4)
        c.dot(WHITE, 15, 2)


def extras(c, model, view, fem):
    if model == 'explorer' and fem and view != 'up':
        x = 15 if view == 'down' else 13
        c.dot(PINK, x, 5); c.dot(PINK2, x + 1, 5); c.dot(PINK, x, 4)
    if model == 'explorer' and fem and view == 'down':
        for (x, y) in ((4, 21), (19, 21)):
            c.dot(PINK, x, y)
    if model == 'froghood' and fem and view != 'up':
        cx = 11 if view == 'down' else 10
        for (dx, dy, col) in ((-1, 0, PINK), (0, 0, PINK2), (1, 0, PINK), (-2, -1, PINK), (2, -1, PINK), (-2, 1, PINK), (2, 1, PINK)):
            c.dot(col, cx + dx, 2 + dy)
    if model == 'froghood' and fem and view == 'up':
        for (dx, dy) in ((-1, 0), (0, 0), (1, 0), (-2, -1), (2, -1), (-2, 1), (2, 1)):
            c.dot(PINK, 11 + dx, 2 + dy)


def frame_img(model, gender, skin, view, frame):
    fem = gender == 'feminino'
    pal, skin_rgb, cheek = palette(model, skin)
    c = Canvas()
    v = 'right' if view == 'left' else view
    legs(c, v, frame)
    torso(c, model, v, frame, fem)
    if model == 'explorer':
        head_explorer(c, v, fem, pal)
    else:
        head_froghood(c, v, fem, pal)
    face(c, model, v, fem, pal, skin_rgb, cheek)
    if model == 'froghood':
        frog_pupils(c, v)
    extras(c, model, v, fem)
    edged = ('brim', 'hat', 'shirt', 'pants', 'boot', 'pack', 'hood', 'hand')
    im = c.render(pal, hx('2a1f1a') if model == 'explorer' else hx('1f3a1b'), edged)
    if frame:
        bob = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        bob.alpha_composite(im, (0, -1 if frame else 0))
        im = bob
    if view == 'left':
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im


DIRS = ('down', 'left', 'right', 'up')


def sheet(model, gender, skin):
    s = Image.new('RGBA', (W * 3, H * 4), (0, 0, 0, 0))
    for r, d in enumerate(DIRS):
        for f in range(3):
            s.alpha_composite(frame_img(model, gender, skin, d, f), (f * W, r * H))
    return s


def main():
    import os
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'client', 'assets', 'sprites')
    for model in ('froghood', 'explorer'):
        for gender in ('masculino', 'feminino'):
            for skin in SKIN:
                sheet(model, gender, skin).save(os.path.join(out, f'char-{model}-{gender}-{skin}.png'))
    print('bonecos gerados em', out)


if __name__ == '__main__':
    main()
