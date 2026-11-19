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

    def ellipse(self, part, cx, cy, rx, ry, only=None, ymax=None):
        for y in range(H):
            if ymax is not None and y > ymax:
                continue
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
          ('pants', 'belt'), ('shirt', 'hand'), ('coat', 'belt'), ('coat', 'btn'), ('hat', 'pom'), ('hat', 'star'),
          ('crown', 'gem'), ('overall', 'strap'), ('overall', 'btn'), ('shirt', 'stripe'), ('coat', 'stripe'),
          ('hood', 'spot'), ('vest', 'pocket'), ('band', 'lamp'), ('cape', 'trim'), ('shirt', 'trim'), ('coat', 'hand'),
          ('vest', 'hand'), ('skin', 'band'), ('hair', 'band'), ('hair', 'crown'), ('coat', 'skin'), ('coat', 'hair'),
          ('shirt', 'pocket'), ('pants', 'legskin'), ('legskin', 'boot'), ('pack', 'shirt'), ('mask', 'skin'), ('mask', 'hair'),
          ('mask', 'band'), ('helm', 'plume'), ('helm', 'skin'), ('helm', 'hair'), ('shirt', 'gem'), ('shirt', 'ribbon'),
          ('shirt', 'belt'), ('hair', 'bow'), ('hair', 'cup'), ('skin', 'cup'), ('hat', 'hair'), ('hat', 'skin'),
          ('vest', 'stripe'), ('shirt', 'hilt'), ('pants', 'hilt'), ('trim', 'ribbon'), ('pants', 'belt')]
NO_EDGE = set(_pairs) | {(b, a) for a, b in _pairs}

SKIN = {'clara': ('f6cfa3', 'e2ad80', 'fde3c4', 'f3a091'),
        'media': ('d49a6a', 'b47a4c', 'e3b285', 'e08a78'),
        'escura': ('8f5a37', '74452a', 'a86e48', 'b86a5a')}
HAIR = {'clara': ('7a4a2a', '5a3418', '9a6438'), 'media': ('3e2716', '2a190d', '5a3a22'), 'escura': ('241610', '150c08', '3a2418')}


def P(base, shade, light=None):
    return (hx(base), hx(shade), hx(light) if light else None)


# Cada estilo: tipo de cabeça, tipo de roupa e cores. "outline" é o contorno.
MODELS = {
    'froghood': dict(name='Capuz de Sapo', head='hood', torso='plain', legs='pants', outline='1f3a1b', pal={
        'hood': P('6cc04a', '3f8f35', '97dd73'), 'eyeball': P('ffffff', 'd9e8d4'),
        'shirt': P('6cc04a', '3f8f35', '97dd73'), 'belly': P('d9f0a8', 'b9d98a'),
        'pants': P('4a6fa5', '34507c', '6a8fc5'), 'boot': P('f2c230', 'c9961a', 'ffe27a'),
        'strap': P('3f8f35', '3f8f35'), 'band': P('ff7aa8', 'd64f80')}),
    'explorer': dict(name='Explorador', head='safari', torso='straps', legs='pants', outline='2a1f1a', pal={
        'hat': P('ecd28f', 'c9a45e', 'f8e7b6'), 'brim': P('dcbc72', 'b38a45', 'f1dc9c'),
        'band': P('6e4a24', '6e4a24'), 'shirt': P('5bbf55', '3a8f3e', '8fdc72'),
        'strap': P('7a4a26', '5a3418'), 'pack': P('c08a50', '8f5f30', 'dcae74'),
        'pants': P('8a6a45', '634a30', 'a8865c'), 'belt': P('5a3a20', '5a3a20'), 'belly': P('5bbf55', '3a8f3e')}),
    'dartfrog': dict(name='Rã-Flecha', head='hood', torso='plain', legs='pants', outline='14244a', spots=True, pal={
        'hood': P('3d8bf0', '2560b8', '7ab4ff'), 'eyeball': P('ffffff', 'd4e2f0'), 'spot': P('1a1f3a', '1a1f3a'),
        'shirt': P('3d8bf0', '2560b8', '7ab4ff'), 'belly': P('bfe0ff', '9cc6ee'),
        'pants': P('2b2f45', '1c1f30', '41465f'), 'boot': P('ff8a2a', 'd0661a', 'ffb06a'),
        'strap': P('2560b8', '2560b8'), 'band': P('ff8a2a', 'd0661a')}),
    'raincoat': dict(name='Capa de Chuva', head='rainhood', torso='coat', coat='closed', legs='pants', outline='3a2a10', pal={
        'coat': P('ffd23f', 'd9a514', 'ffe88a'), 'btn': P('c98a10', 'c98a10'), 'shirt': P('ffd23f', 'd9a514'),
        'pants': P('3f6fb5', '2c5390', '5d8bd0'), 'boot': P('e64b3c', 'b8322a', 'ff7b6a')}),
    'scientist': dict(name='Bióloga', head='hair', glasses=True, torso='coat', coat='open', legs='pants', outline='22303a', pal={
        'coat': P('f4f7f8', 'c9d3d8', 'ffffff'), 'shirt': P('3bb3a8', '27877f', '6fd3c8'), 'btn': P('9fb2bb', '9fb2bb'),
        'pocket': P('dbe3e7', 'dbe3e7'),
        'pants': P('3a4a66', '283449', '52648a'), 'boot': P('5a4636', '3f3126', '7a6250')}),
    'fisher': dict(name='Pescador', head='bucket', torso='vest', legs='pants', outline='26291a', pal={
        'hat': P('7d8f4e', '5d6c36', 'a0b46a'), 'brim': P('6f8044', '515e30', '93a65e'), 'band': P('4d5a2c', '4d5a2c'),
        'vest': P('c9b27a', 'a08a52', 'e3cf98'), 'pocket': P('a08a52', 'a08a52'), 'shirt': P('5e88a8', '446a88', '82a8c6'),
        'pants': P('4d5560', '383e47', '67707c'), 'boot': P('3e6a46', '2b4c32', '5a8a62')}),
    'sporty': dict(name='Esportista', head='cap', torso='jersey', legs='shorts', outline='2a1418', pal={
        'hat': P('2e9e4f', '1f7a3a', '52c06e'), 'brim': P('25864a', '1a6634', '2e9e4f'), 'band': P('1f7a3a', '1f7a3a'),
        'shirt': P('ffd93a', 'e0b31c', 'ffeb88'), 'stripe': P('2e9e4f', '1f7a3a'),
        'pants': P('2d3a6e', '1f2950', '44559a'), 'legskin': None, 'boot': P('f4f4f4', 'cfcfcf', 'ffffff')}),
    'farmer': dict(name='Jardineiro', head='straw', torso='overalls', legs='pants', outline='2a2016', pal={
        'hat': P('f2d36b', 'cfae45', 'fbe69a'), 'brim': P('e8c75a', 'c2a03a', 'f7df8e'), 'band': P('7a5232', '7a5232'),
        'shirt': P('9ccf5a', '74a83a', 'bfe486'), 'overall': P('4f7fc0', '38609a', '74a0dc'), 'strap': P('4f7fc0', '38609a'),
        'btn': P('f2c230', 'f2c230'), 'pants': P('4f7fc0', '38609a', '74a0dc'), 'boot': P('6a4a2e', '4c3420', '8a6644')}),
    'student': dict(name='Universitário', head='beanie', torso='hoodie', legs='pants', outline='22182e', pal={
        'hat': P('f08a3a', 'c4682a', 'ffb06e'), 'band': P('d0702c', 'a8561f'), 'pom': P('fff1dc', 'e8d6b8'),
        'shirt': P('8a5cc8', '6a429e', 'ae84e6'), 'pocket': P('6a429e', '6a429e'), 'strap': P('3a9c8c', '2a7468'),
        'pack': P('3fb3a0', '2a8a7a', '6ad3c0'), 'stripe': P('ffffff', 'ffffff'),
        'pants': P('3c5d8f', '2b456c', '5579b0'), 'boot': P('f4f4f4', 'cfcfcf', 'ffffff')}),
    'lantern': dict(name='Caçador Noturno', head='headlamp', torso='jacket', legs='pants', outline='10172a', pal={
        'band': P('2b2f3a', '1c1f27'), 'lamp': P('fff3a8', 'ffd84a', 'ffffff'),
        'shirt': P('2f4a7a', '213659', '466aa6'), 'stripe': P('d8f06a', 'b8d040'),
        'pants': P('2a3142', '1c2130', '3e475e'), 'boot': P('4a3a2e', '33281f', '6a5646')}),
    'mage': dict(name='Mago do Brejo', head='wizard', torso='coat', coat='robe', legs='pants', outline='1f1236', pal={
        'hat': P('6a4bc4', '4c3394', '8f72e6'), 'brim': P('5a3db0', '412b86', '7a5fd6'), 'band': P('f2c230', 'c9961a'),
        'star': P('ffe27a', 'ffe27a'),
        'coat': P('6a4bc4', '4c3394', '8f72e6'), 'belt': P('f2c230', 'c9961a'), 'shirt': P('6a4bc4', '4c3394'),
        'pants': P('3a2a6a', '2a1e4c', '4e3a8a'), 'boot': P('3a2a6a', '2a1e4c', '4e3a8a')}),
    'royal': dict(name='Realeza do Brejo', head='crown', torso='cape', legs='pants', outline='2a1414', pal={
        'crown': P('f6c934', 'cf9f1a', 'ffe680'), 'gem': P('e8463a', 'e8463a'),
        'cape': P('c8323e', '96222c', 'e8565e'), 'trim': P('fff6e0', 'e8dcc0'),
        'shirt': P('fff6e0', 'e0d4b8', 'ffffff'), 'btn': P('f6c934', 'f6c934'), 'belt': P('f6c934', 'cf9f1a'),
        'pants': P('3d6b45', '2b4e32', '548a5e'), 'boot': P('5a3a26', '402818', '7a5238')}),
    'ninja': dict(name='Ninja', head='ninja', mask=True, torso='ninja', legs='pants', outline='10131c', pal={
        'mask': P('2f3445', '20242f', '434a60'), 'band': P('d9363a', 'a8262a'),
        'shirt': P('2f3445', '20242f', '434a60'), 'belt': P('d9363a', 'a8262a'), 'stripe': P('5a6178', '5a6178'),
        'pants': P('2f3445', '20242f', '434a60'), 'boot': P('1c1f28', '12141a', '2c303c')}),
    'samurai': dict(name='Samurai', head='topknot', torso='kimono', legs='hakama', outline='161a2a', pal={
        'band': P('d9363a', 'd9363a'), 'shirt': P('3d4f8f', '2b3a6c', '5a6fb0'), 'trim': P('f4efe6', 'd8d0c0'),
        'belt': P('d8d0c0', 'b8ae9a'), 'hilt': P('3a2a20', '3a2a20'), 'gem': P('d4a83a', 'd4a83a'),
        'pants': P('4a4a58', '34343f', '62627a'), 'boot': P('3a2a20', '2a1e16', '5a4636')}),
    'knight': dict(name='Cavaleiro', head='helm', torso='armor', legs='pants', outline='1e232b', pal={
        'helm': P('b8c2cc', '8a96a3', 'e2e8ee'), 'plume': P('d9473a', 'a8342a', 'f07a6a'),
        'shirt': P('b8c2cc', '8a96a3', 'e2e8ee'), 'gem': P('4fbf5a', '3a9a44'), 'belt': P('6a4a2e', '4c3420'),
        'pants': P('6c7682', '535b66', '8a94a0'), 'boot': P('8a96a3', '6c7682', 'b8c2cc')}),
    'pirate': dict(name='Pirata', head='bandana', patch=True, torso='pirate', legs='pants', outline='1e1612', pal={
        'hat': P('d9363a', 'a8262a', 'f06a62'), 'patch': P('1a1414', '1a1414'),
        'shirt': P('f4f1ea', 'd6d0c4', 'ffffff'), 'stripe': P('3a5aa8', '2a4280'), 'vest': P('3a2a24', '2a1e1a', '54403a'),
        'belt': P('2a1e18', '2a1e18'), 'btn': P('f2c230', 'f2c230'), 'pocket': P('2a1e1a', '2a1e1a'),
        'pants': P('7a5432', '5a3c22', '9a6e48'), 'boot': P('2a2220', '1a1514', '403634')}),
    'magical': dict(name='Mágica', head='bow', torso='magic', legs='shorts', outline='3a1630', pal={
        'hair': P('f59ac4', 'd96fa0', 'ffc4de'), 'hair2': P('d96fa0', 'd96fa0'),
        'bow': P('ff4f8a', 'd93a6e', 'ff8ab0'), 'shirt': P('ff9ccb', 'e676aa', 'ffc6e2'), 'trim': P('ffffff', 'f0e6ee'),
        'ribbon': P('ff4f8a', 'd93a6e'), 'star': P('ffe27a', 'ffe27a'), 'hand': P('ffffff', 'e6e0ea'),
        'legskin': P('ffffff', 'e6e0ea'), 'pants': P('ff9ccb', 'e676aa'), 'boot': P('ff4f8a', 'd93a6e', 'ff8ab0')}),
    'pilot': dict(name='Piloto de Robô', head='headset', torso='suit', legs='pants', outline='161c2a', pal={
        'band': P('3a3f4a', '2a2e38'), 'cup': P('2a2e38', '1c1f27', '4a505e'), 'lamp': P('ff8a2a', 'ff8a2a'),
        'shirt': P('f2f4f7', 'c8ced6', 'ffffff'), 'stripe': P('3a6fd8', '2a52a8'), 'trim': P('ff8a2a', 'd0661a'),
        'belt': P('3a3f4a', '2a2e38'), 'pocket': P('3a6fd8', '3a6fd8'),
        'pants': P('e8ecf0', 'c0c8d0', 'ffffff'), 'boot': P('3a6fd8', '2a52a8', '5a8af0')}),
}
MODEL_ORDER = list(MODELS)

# NPCs dos trabalhos (não aparecem no guarda-roupa do jogador)
NPCS = {
    'pedreiro': dict(name='Pedreiro', head='hardhat', torso='jacket', legs='pants', outline='2a1f12', pal={
        'hat': P('f6c934', 'cf9f1a', 'ffe680'), 'brim': P('e8b520', 'b88a10', 'f6c934'), 'band': P('fff3b0', 'fff3b0'),
        'shirt': P('ff8a2a', 'd0661a', 'ffb06a'), 'stripe': P('e8f0f2', 'c8d0d4'),
        'pants': P('3f6fb5', '2c5390', '5d8bd0'), 'boot': P('7a5232', '5a3a22', '9a7048')}),
    'mecanico': dict(name='Mecânico', head='cap', torso='overalls', legs='pants', outline='141c26', pal={
        'hat': P('d9363a', 'a8262a', 'f06a62'), 'brim': P('b82a2e', '8a1f22', 'd9363a'), 'band': P('8a1f22', '8a1f22'),
        'shirt': P('e6e9ec', 'b9c0c6', 'ffffff'), 'overall': P('3e5f8a', '2b4466', '5a7fae'), 'strap': P('3e5f8a', '2b4466'),
        'btn': P('f2c230', 'f2c230'), 'pants': P('3e5f8a', '2b4466', '5a7fae'), 'boot': P('2a2a30', '1a1a20', '44444c')}),
    'agricultor': dict(name='Agricultor', head='straw', torso='shirt', legs='pants', outline='2a2016', pal={
        'hat': P('f2d36b', 'cfae45', 'fbe69a'), 'brim': P('e8c75a', 'c2a03a', 'f7df8e'), 'band': P('3a7a3a', '3a7a3a'),
        'shirt': P('4f9a48', '3a7a36', '74bd6a'), 'pants': P('8a6a45', '634a30', 'a8865c'), 'boot': P('5a4030', '3e2c20', '7a5a44')}),
    'carteiro': dict(name='Carteiro', head='cap', torso='straps', legs='pants', outline='14202e', pal={
        'hat': P('2f6fc0', '22539a', '5a92de'), 'brim': P('265ea8', '1b4580', '2f6fc0'), 'band': P('1b4580', '1b4580'),
        'shirt': P('8fc4ee', '6aa6d6', 'b5daf6'), 'strap': P('7a5232', '5a3a22'), 'pack': P('c99a5a', 'a07840', 'e0b878'),
        'belt': P('2a3a52', '2a3a52'), 'belly': P('8fc4ee', '6aa6d6'),
        'pants': P('2a3a52', '1c283a', '3e5274'), 'boot': P('2a2a30', '1a1a20', '44444c')}),
}
MODELS.update(NPCS)


def palette(model, skin):
    s, sd, sl, ck = SKIN[skin]
    hr, hd, hl = HAIR[skin]
    pal = {
        'skin': (hx(s), hx(sd), hx(sl)), 'hand': (hx(s), hx(sd), None), 'legskin': (hx(s), hx(sd), None),
        'hair': (hx(hr), hx(hd), hx(hl)), 'hair2': (hx(hd), hx(hd), None),
        'boot': (hx('4a3426'), hx('33231a'), hx('6e523d')),
    }
    for k, v in MODELS[model]['pal'].items():
        if v is not None:
            pal[k] = v
    return pal, hx(s), hx(ck)


INK = hx('1f1712')
WHITE = hx('ffffff')
MOUTH = hx('8a3a2e')
PINK = hx('ff7aa8')
PINK2 = hx('ffc2d8')


# ---------------------------------------------------------------- partes
def legs(c, view, frame, cfg=None):
    """frame 0 = parado, 1 = passo A, 2 = passo B"""
    _legs(c, view, frame)
    if cfg and cfg.get('legs') == 'hakama':
        x0, x1 = (7, 16) if view in ('down', 'up') else (8, 15)
        for y in range(25, 29):
            for x in range(x0, x1 + 1):
                if c.p[y][x] != 'boot':
                    c.put('pants', x, y)
    if cfg and cfg.get('legs') == 'shorts':
        for y in range(27, H):
            for x in range(W):
                if c.p[y][x] == 'pants':
                    c.p[y][x] = 'legskin'


def _legs(c, view, frame):
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
    cfg = MODELS[model]
    kind = cfg['torso']
    arm_swing = {0: 0, 1: 1, 2: -1}[frame]
    front = view == 'down'
    sw = arm_swing if front else 0
    if view in ('down', 'up'):
        if kind == 'cape':   # a capa fica atrás do corpo
            if view == 'up':
                pass
            else:
                c.rect('cape', 5, 20, 18, 27)
        body = 'coat' if kind == 'coat' else 'shirt'
        c.rect(body, 7, 18, 16, 25)
        arm = 'coat' if kind == 'coat' else ('shirt' if kind != 'vest' else 'shirt')
        c.rect(arm, 5, 19, 6, 22 + sw)
        c.rect(arm, 17, 19, 18, 22 - sw)
        c.rect('hand', 5, 23 + sw, 6, 24 + sw)
        c.rect('hand', 17, 23 - sw, 18, 24 - sw)
        if kind == 'plain' and front:
            c.ellipse('belly', 11.5, 22.5, 3.2, 2.6, only={'shirt'})
        if kind == 'straps':
            if front:
                for y in range(18, 25):
                    c.put('strap', 9, y)
                    c.put('strap', 14, y)
            else:
                c.rect('pack', 7, 18, 16, 24)
                c.rect('pack', 8, 17, 15, 17)
                c.rect('strap', 9, 20, 14, 20)
            c.rect('belt', 7, 25, 16, 25)
        if kind == 'coat':
            style = cfg.get('coat')
            low = 28 if style == 'robe' else 27
            c.rect('coat', 7, 18, 16, low)
            if front and style == 'open':
                c.rect('shirt', 11, 18, 12, 24)
                c.put('pocket', 8, 23); c.put('pocket', 9, 23)
                c.put('btn', 10, 21); c.put('btn', 13, 21)
            if front and style == 'closed':
                for y in (20, 22, 24):
                    c.put('btn', 11, y)
            if style == 'robe':
                c.rect('belt', 7, 23, 16, 23)
                if front:
                    c.put('star', 11, 26); c.put('star', 12, 26)
        if kind == 'vest':
            c.rect('vest', 7, 18, 16, 25)
            if front:
                c.rect('shirt', 11, 18, 12, 25)
                for (x, y) in ((8, 21), (9, 21), (14, 21), (15, 21), (8, 23), (9, 23), (14, 23), (15, 23)):
                    c.put('pocket', x, y)
            else:
                for (x, y) in ((9, 20), (14, 20), (11, 22), (12, 22)):
                    c.put('pocket', x, y)
        if kind == 'overalls':
            c.rect('overall', 8, 21, 15, 25)
            if front:
                c.rect('overall', 9, 19, 14, 21)
                for y in (18, 19):
                    c.put('strap', 9, y); c.put('strap', 14, y)
                c.put('btn', 9, 19); c.put('btn', 14, 19)
            else:
                for i in range(4):
                    c.put('strap', 9 + i, 18 + i); c.put('strap', 14 - i, 18 + i)
        if kind == 'jersey':
            c.rect('stripe', 7, 21, 16, 21)
            c.rect('stripe', 5, 21, 6, 21); c.rect('stripe', 17, 21, 18, 21)
        if kind == 'hoodie':
            if front:
                c.rect('pocket', 9, 23, 14, 24)
                for y in range(18, 24):
                    c.put('strap', 8, y); c.put('strap', 15, y)
                c.put('stripe', 10, 19); c.put('stripe', 13, 19)
                c.put('stripe', 10, 20); c.put('stripe', 13, 20)
            else:
                c.rect('pack', 7, 18, 16, 24)
                c.rect('pack', 8, 17, 15, 17)
                c.rect('strap', 9, 21, 14, 21)
        if kind == 'jacket':
            c.rect('stripe', 7, 22, 16, 22)
            c.rect('stripe', 5, 22, 6, 22); c.rect('stripe', 17, 22, 18, 22)
        if kind == 'cape':
            if view == 'up':
                c.rect('cape', 6, 18, 17, 28)
                c.rect('trim', 7, 18, 16, 18)
            else:
                c.rect('trim', 8, 18, 15, 18)
                for y in (20, 22, 24):
                    c.put('btn', 11, y)
                c.rect('belt', 7, 25, 16, 25)
        if kind == 'ninja':
            c.rect('belt', 7, 24, 16, 24)
            for y in (20, 22):
                c.put('stripe', 5, y); c.put('stripe', 6, y); c.put('stripe', 17, y); c.put('stripe', 18, y)
            if view == 'up':
                c.rect('belt', 13, 25, 14, 26)
        if kind == 'kimono':
            c.rect('belt', 7, 24, 16, 24)
            if front:
                for i in range(4):
                    c.put('trim', 8 + i, 18 + i); c.put('trim', 15 - i, 18 + i)
                c.put('hilt', 4, 23); c.put('hilt', 5, 24); c.put('gem', 6, 25)
            else:
                c.rect('trim', 9, 18, 14, 18)
        if kind == 'armor':
            c.rect('belt', 7, 25, 16, 25)
            if front:
                c.rect('gem', 11, 20, 12, 21)
            for y in (19,):
                c.put('shirt', 5, y)
        if kind == 'pirate':
            for y in (19, 21, 23):
                c.rect('stripe', 7, y, 16, y)
                c.rect('stripe', 5, y, 6, y); c.rect('stripe', 17, y, 18, y)
            if front:
                c.rect('vest', 7, 18, 9, 25); c.rect('vest', 14, 18, 16, 25)
            else:
                c.rect('vest', 7, 18, 16, 25)
            c.rect('belt', 7, 25, 16, 25)
            if front:
                c.put('btn', 11, 25); c.put('btn', 12, 25)
        if kind == 'magic':
            c.rect('shirt', 6, 24, 17, 26)
            c.rect('trim', 6, 26, 17, 26)
            c.rect('trim', 8, 18, 15, 18)
            if front:
                for (x, y) in ((9, 19), (9, 20), (10, 20), (14, 19), (14, 20), (13, 20), (11, 20), (12, 20)):
                    c.put('ribbon', x, y)
                c.put('ribbon', 11, 21); c.put('ribbon', 12, 22)
            else:
                c.rect('ribbon', 9, 23, 14, 23)
                c.put('ribbon', 10, 24); c.put('ribbon', 13, 24)
        if kind == 'suit':
            c.rect('stripe', 7, 18, 9, 19); c.rect('stripe', 14, 18, 16, 19)
            c.rect('stripe', 5, 19, 6, 20); c.rect('stripe', 17, 19, 18, 20)
            if front:
                c.rect('trim', 7, 21, 16, 21)
                c.put('lamp', 13, 23); c.put('lamp', 14, 23)
            else:
                c.rect('pocket', 9, 20, 14, 23)
            c.rect('belt', 7, 25, 16, 25)
    else:
        if kind == 'cape':
            c.rect('cape', 5, 18, 9, 28)
        body = 'coat' if kind == 'coat' else 'shirt'
        c.rect(body, 8, 18, 15, 25)
        if kind == 'straps':
            c.rect('pack', 5, 18, 8, 24)
            c.rect('belt', 8, 25, 15, 25)
        if kind == 'hoodie':
            c.rect('pack', 5, 18, 8, 24)
        if kind == 'coat':
            style = cfg.get('coat')
            c.rect('coat', 8, 18, 15, 28 if style == 'robe' else 27)
            if style == 'robe':
                c.rect('belt', 8, 23, 15, 23)
            if style == 'closed':
                c.put('btn', 15, 20); c.put('btn', 15, 22)
        if kind == 'vest':
            c.rect('vest', 8, 18, 14, 25)
            c.put('pocket', 13, 21); c.put('pocket', 14, 21)
        if kind == 'overalls':
            c.rect('overall', 8, 21, 15, 25)
            c.rect('overall', 11, 19, 15, 21)
        if kind == 'jersey':
            c.rect('stripe', 8, 21, 15, 21)
        if kind == 'jacket':
            c.rect('stripe', 8, 22, 15, 22)
        if kind == 'cape':
            c.rect('trim', 8, 18, 15, 18)
            c.rect('belt', 8, 25, 15, 25)
        if kind == 'ninja':
            c.rect('belt', 8, 24, 15, 24)
            c.rect('belt', 6, 24, 7, 26)
        if kind == 'kimono':
            c.rect('belt', 8, 24, 15, 24)
            c.rect('trim', 13, 18, 15, 18); c.put('trim', 14, 19)
            c.put('hilt', 6, 22); c.put('hilt', 7, 23); c.put('gem', 8, 24)
        if kind == 'armor':
            c.rect('belt', 8, 25, 15, 25)
        if kind == 'pirate':
            for y in (19, 21, 23):
                c.rect('stripe', 8, y, 15, y)
            c.rect('vest', 8, 18, 11, 25)
            c.rect('belt', 8, 25, 15, 25)
        if kind == 'magic':
            c.rect('shirt', 7, 24, 16, 26)
            c.rect('trim', 7, 26, 16, 26)
            c.rect('trim', 9, 18, 15, 18)
            c.rect('ribbon', 6, 22, 7, 24)
        if kind == 'suit':
            c.rect('stripe', 9, 18, 14, 19)
            c.rect('trim', 8, 21, 15, 21)
            c.rect('belt', 8, 25, 15, 25)
        sw = {0: 0, 1: 2, 2: -2}[frame]
        arm = 'coat' if kind == 'coat' else 'shirt'
        c.rect(arm, 11 + sw // 2, 19, 13 + sw // 2, 22)
        if kind in ('jersey',):
            c.rect('stripe', 11 + sw // 2, 21, 13 + sw // 2, 21)
        if kind == 'pirate':
            c.rect('stripe', 11 + sw // 2, 19, 13 + sw // 2, 19)
            c.rect('stripe', 11 + sw // 2, 21, 13 + sw // 2, 21)
        if kind == 'suit':
            c.rect('stripe', 11 + sw // 2, 19, 13 + sw // 2, 20)
        if kind == 'ninja':
            c.rect('stripe', 11 + sw // 2, 21, 13 + sw // 2, 21)
        if kind == 'jacket':
            c.rect('stripe', 11 + sw // 2, 22, 13 + sw // 2, 22)
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


def head_base(c, view, fem, long_back=True):
    """cabelo + rosto, sem chapéu (mesmo desenho do explorador)"""
    if view == 'down':
        c.ellipse('hair', 11.5, 12.5, 7.6, 6.2)
        c.ellipse('skin', 11.5, 13.6, 6.6, 5.0)
        c.rect('hair', 6, 9, 17, 10)
        for x in (7, 9, 12, 15):
            c.put('hair', x, 11)
        if fem:
            c.rect('hair', 3, 12, 5, 21)
            c.rect('hair', 18, 12, 20, 21)
    elif view == 'up':
        c.ellipse('hair', 11.5, 12.5, 7.6, 6.2)
        if fem and long_back:
            c.rect('hair', 9, 17, 14, 22)
            c.rect('hair2', 10, 22, 13, 23)
    else:
        c.ellipse('hair', 11.0, 12.6, 7.4, 6.0)
        c.ellipse('skin', 13.4, 13.4, 5.4, 4.3)
        c.rect('hair', 6, 9, 15, 10)
        c.rect('hair', 4, 10, 8, 16)
        if fem:
            c.rect('hair', 3, 14, 6, 21)


def hat_on(c, kind, view, pal):
    side = view not in ('down', 'up')
    cx = 11.0 if side else 11.5
    if kind == 'straw':
        c.ellipse('hat', cx, 4.8, 5.8, 3.8)
        c.ellipse('brim', 12.3 if side else 11.5, 8.0, 11.6, 2.0)
        c.rect('band', 6, 7, 17 if not side else 16, 7)
        for (x, y) in ((8, 3), (11, 2), (14, 3), (9, 5), (13, 5), (4, 8), (19, 8), (8, 9), (15, 9)):
            c.dot(pal['hat'][1], x, y)
    elif kind == 'bucket':
        c.ellipse('hat', cx, 6.6, 6.6, 4.4, ymax=8)
        c.ellipse('brim', 12.0 if side else 11.5, 9.0, 8.8, 1.7)
        c.rect('band', 5, 8, 18 if not side else 17, 8)
    elif kind == 'cap':
        c.ellipse('hat', cx, 9.0, 7.6, 5.6, ymax=9)
        if view == 'down':
            c.ellipse('brim', 11.5, 10.0, 6.4, 1.4)
        elif side:
            c.rect('brim', 15, 9, 21, 10)
            c.rect('brim', 16, 8, 19, 8)
        else:
            c.rect('band', 10, 8, 13, 9)
    elif kind == 'beanie':
        c.ellipse('hat', cx, 9.6, 8.0, 6.4, ymax=10)
        c.rect('band', 4, 9, 19 if not side else 17, 10)
        for x in range(5, 19, 2):
            c.dot(pal['band'][1], x, 10)
        c.ellipse('pom', cx, 2.6, 2.4, 2.2)
    elif kind == 'hardhat':
        c.ellipse('hat', cx, 9.0, 7.2, 6.0, ymax=9)
        c.rect('brim', 3 if not side else 4, 9, 20 if not side else 18, 10)
        c.rect('band', int(cx), 3, int(cx), 8)
    elif kind == 'headlamp':
        c.rect('band', 4, 8, 19 if not side else 17, 9)
        if view == 'down':
            c.rect('lamp', 10, 7, 13, 9)
            c.dot(hx('ffffff'), 11, 8)
        elif side:
            c.rect('lamp', 17, 7, 19, 9)
            c.dot(hx('ffffff'), 18, 8)
    elif kind == 'wizard':
        c.ellipse('brim', 12.0 if side else 11.5, 8.2, 11.0, 2.0)
        for y in range(0, 8):
            half = 1 + y * 0.72
            x0, x1 = int(round(cx - half)), int(round(cx + half))
            c.rect('hat', x0, y, x1, y)
        if side:
            c.rect('hat', int(cx) + 1, 0, int(cx) + 3, 0)
        c.rect('band', 5, 7, 18 if not side else 17, 7)
        if view != 'up':
            c.dot(pal['star'][0], 10, 4); c.dot(pal['star'][0], 13, 2); c.dot(pal['star'][0], 12, 5)
    elif kind == 'crown':
        if side:
            c.rect('crown', 6, 5, 15, 7)
        else:
            c.rect('crown', 7, 5, 16, 7)
        pts = (7, 11, 15) if not side else (6, 10, 14)
        for x in pts:
            c.rect('crown', x, 3, x + 1, 4)
        if view != 'up':
            gx = 11 if not side else 13
            c.put('gem', gx, 6); c.put('gem', gx + 1 if not side else gx, 6)


def head_rainhood(c, view, fem, pal):
    if view == 'down':
        c.ellipse('coat', 11.5, 11.8, 9.6, 8.4)
        c.ellipse('hair', 11.5, 13.0, 6.6, 5.2, only={'coat'})
        c.ellipse('skin', 11.5, 14.0, 6.0, 4.4)
        c.rect('hair', 7, 9, 16, 10)
    elif view == 'up':
        c.ellipse('coat', 11.5, 11.8, 9.6, 8.4)
        c.rect('coat', 9, 2, 14, 3)
    else:
        c.ellipse('coat', 11.0, 11.8, 9.0, 8.2)
        c.ellipse('hair', 14.6, 13.0, 5.4, 5.0, only={'coat'})
        c.ellipse('skin', 15.0, 14.0, 4.8, 4.2)
        c.rect('hair', 11, 9, 18, 10)
    # aba da capa por cima da testa
    if view == 'down':
        c.rect('coat', 5, 7, 18, 8)
    elif view not in ('up',):
        c.rect('coat', 9, 7, 19, 8)


def head_dartfrog(c, view, fem, pal):
    head_froghood(c, view, fem, pal)
    spots = {'down': ((3, 9), (19, 10), (4, 15), (19, 16), (12, 4)),
             'up': ((6, 8), (15, 7), (10, 12), (5, 15), (17, 14), (12, 17), (8, 4), (15, 4)),
             'right': ((4, 9), (6, 14), (8, 5), (5, 18), (9, 10))}[view if view in ('down', 'up') else 'right']
    for (x, y) in spots:
        if c.p[y][x] == 'hood':
            c.put('spot', x, y)
            if x + 1 < W and c.p[y][x + 1] == 'hood':
                c.put('spot', x + 1, y)


def head_helm(c, view, fem, pal):
    if view == 'down':
        c.ellipse('helm', 11.5, 11.4, 8.6, 7.8)
        c.ellipse('skin', 11.5, 14.6, 5.4, 3.8)
        c.rect('helm', 4, 8, 19, 11)
        c.rect('helm', 11, 11, 12, 14)      # protetor de nariz
        c.rect('plume', 11, 0, 12, 3)
        c.rect('plume', 10, 1, 13, 2)
    elif view == 'up':
        c.ellipse('helm', 11.5, 11.4, 8.6, 7.8)
        c.rect('plume', 11, 0, 12, 9)
        c.rect('plume', 10, 1, 13, 2)
    else:
        c.ellipse('helm', 11.0, 11.4, 8.2, 7.6)
        c.ellipse('skin', 15.6, 14.6, 3.8, 3.6)
        c.rect('helm', 4, 8, 19, 11)
        c.rect('helm', 18, 11, 19, 14)
        for x, y in ((14, 0), (13, 0), (12, 0), (11, 0), (10, 1), (9, 1), (8, 2), (7, 2), (6, 3), (5, 4), (4, 5)):
            c.rect('plume', x, y, x, y + 1)
    if fem and view != 'up':
        if view == 'down':
            c.rect('hair', 4, 15, 5, 20)
            c.rect('hair', 18, 15, 19, 20)
        else:
            c.rect('hair', 3, 15, 5, 21)


def head_extra(c, kind, view, fem, pal):
    side = view not in ('down', 'up')
    if kind == 'ninja':
        # máscara cobrindo nariz e boca
        for y in range(15, 20):
            for x in range(W):
                if c.p[y][x] == 'skin':
                    c.p[y][x] = 'mask'
        c.rect('band', 4, 9, 19 if not side else 17, 10)
        if view == 'up':
            c.rect('band', 10, 11, 11, 15); c.rect('band', 12, 11, 13, 14)
        elif side:
            c.rect('band', 2, 10, 4, 11); c.rect('band', 1, 12, 3, 13)
    elif kind == 'topknot':
        cx = 10.0 if side else 11.5
        c.ellipse('hair', cx, 5.4, 2.6, 2.2)
        c.rect('band', int(cx) - 1, 7, int(cx) + 1, 7)
    elif kind == 'bandana':
        cx = 11.0 if side else 11.5
        c.ellipse('hat', cx, 10.4, 8.0, 6.4, ymax=10)
        c.rect('hat', 4, 9, 19 if not side else 17, 10)
        if view == 'down':
            c.rect('hat', 19, 11, 20, 12); c.rect('hat', 20, 13, 21, 14)
        elif view == 'up':
            c.rect('hat', 3, 11, 4, 12); c.rect('hat', 2, 13, 3, 14)
        else:
            c.rect('hat', 2, 10, 4, 12); c.rect('hat', 1, 13, 2, 14)
    elif kind == 'bow':
        if view == 'down':
            c.ellipse('bow', 7.4, 5.6, 2.8, 2.2)
            c.ellipse('bow', 15.6, 5.6, 2.8, 2.2)
            c.rect('bow', 10, 5, 13, 7)
        elif view == 'up':
            c.ellipse('bow', 7.4, 5.6, 2.8, 2.2)
            c.ellipse('bow', 15.6, 5.6, 2.8, 2.2)
            c.rect('bow', 10, 5, 13, 7)
            c.rect('bow', 10, 8, 10, 12); c.rect('bow', 13, 8, 13, 11)
        else:
            c.ellipse('bow', 6.0, 5.0, 2.6, 2.4)
            c.ellipse('bow', 9.6, 4.6, 2.2, 2.0)
            c.rect('bow', 4, 8, 4, 12)
    elif kind == 'headset':
        if view in ('down', 'up'):
            c.rect('band', 7, 5, 16, 5)
            c.rect('band', 5, 6, 6, 8); c.rect('band', 17, 6, 18, 8)
            c.rect('cup', 3, 11, 5, 15); c.rect('cup', 18, 11, 20, 15)
        else:
            c.rect('band', 6, 5, 14, 5)
            c.rect('cup', 9, 11, 11, 15)
            c.rect('band', 10, 6, 11, 10)


def head(c, model, view, fem, pal):
    kind = MODELS[model]['head']
    if kind == 'hood':
        if model == 'dartfrog':
            head_dartfrog(c, view, fem, pal)
        else:
            head_froghood(c, view, fem, pal)
    elif kind == 'safari':
        head_explorer(c, view, fem, pal)
    elif kind == 'rainhood':
        head_rainhood(c, view, fem, pal)
    elif kind == 'helm':
        head_helm(c, view, fem, pal)
    elif kind in ('ninja', 'topknot', 'bandana', 'bow', 'headset'):
        head_base(c, view, fem, long_back=True)
        head_extra(c, kind, view, fem, pal)
    else:
        head_base(c, view, fem, long_back=kind not in ('cap',))
        if kind == 'cap' and fem and view == 'up':
            c.rect('hair', 10, 16, 13, 23)
            c.rect('hair2', 11, 23, 12, 24)
        if kind == 'cap' and fem and view not in ('down', 'up'):
            c.rect('hair', 2, 12, 5, 19)
        hat_on(c, kind, view, pal)


def glasses(c, view):
    rim = hx('7a8a99')
    if view == 'down':
        for (x0, x1) in ((7, 10), (13, 16)):
            for x in range(x0, x1 + 1):
                c.dot(rim, x, 12)
            c.dot(rim, x0, 13); c.dot(rim, x1, 13); c.dot(rim, x0, 14); c.dot(rim, x1, 14)
        c.dot(rim, 11, 12); c.dot(rim, 12, 12)
    elif view != 'up':
        for x in range(14, 18):
            c.dot(rim, x, 12)
        c.dot(rim, 14, 13); c.dot(rim, 17, 13)
        for x in range(10, 14):
            c.dot(rim, x, 12)


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
    kind = MODELS[model]['head']
    if model == 'explorer' and fem and view != 'up':
        x = 15 if view == 'down' else 13
        c.dot(PINK, x, 5); c.dot(PINK2, x + 1, 5); c.dot(PINK, x, 4)
    if model == 'explorer' and fem and view == 'down':
        for (x, y) in ((4, 21), (19, 21)):
            c.dot(PINK, x, y)
    if kind in ('straw', 'bucket', 'beanie', 'wizard') and fem and view != 'up':
        x = 15 if view == 'down' else 13
        y = {'straw': 7, 'bucket': 8, 'beanie': 9, 'wizard': 7}[kind]
        c.dot(PINK, x, y); c.dot(PINK2, x + 1, y); c.dot(PINK, x, y - 1)
    if kind in ('hair', 'cap', 'headlamp', 'crown', 'topknot', 'headset') and fem and view == 'down':
        c.dot(PINK, 16, 9); c.dot(PINK2, 17, 9); c.dot(PINK, 16, 10)
    if model in ('froghood', 'dartfrog') and fem and view != 'up':
        cx = 11 if view == 'down' else 10
        for (dx, dy, col) in ((-1, 0, PINK), (0, 0, PINK2), (1, 0, PINK), (-2, -1, PINK), (2, -1, PINK), (-2, 1, PINK), (2, 1, PINK)):
            c.dot(col, cx + dx, 2 + dy)
    if model in ('froghood', 'dartfrog') and fem and view == 'up':
        for (dx, dy) in ((-1, 0), (0, 0), (1, 0), (-2, -1), (2, -1), (-2, 1), (2, 1)):
            c.dot(PINK, 11 + dx, 2 + dy)


def frame_img(model, gender, skin, view, frame):
    fem = gender == 'feminino'
    cfg = MODELS[model]
    pal, skin_rgb, cheek = palette(model, skin)
    c = Canvas()
    v = 'right' if view == 'left' else view
    legs(c, v, frame, cfg)
    torso(c, model, v, frame, fem)
    head(c, model, v, fem, pal)
    face(c, model, v, fem, pal, skin_rgb, cheek)
    if cfg['head'] == 'hood':
        frog_pupils(c, v)
    if cfg.get('glasses'):
        glasses(c, v)
    if cfg.get('mask'):
        for key in [k for k in c.detail if k[1] >= 15]:
            del c.detail[key]
    if cfg.get('patch') and v == 'down':
        for (x, y) in ((8, 13), (9, 13), (8, 14), (9, 14), (8, 15), (9, 15)):
            c.dot(pal['patch'][0], x, y)
        for (x, y) in ((7, 12), (10, 12), (6, 11), (11, 11)):
            c.dot(pal['patch'][0], x, y)
    if cfg['head'] == 'headset' and v == 'down':
        c.dot(pal['cup'][0], 17, 16); c.dot(pal['cup'][0], 16, 17); c.dot(pal['lamp'][0], 15, 17)
    if cfg['head'] == 'headset' and v not in ('down', 'up'):
        for (x, y) in ((12, 16), (13, 17), (14, 17)):
            c.dot(pal['cup'][0], x, y)
        c.dot(pal['lamp'][0], 15, 17)
    if cfg['head'] == 'bow' and v == 'down':
        c.dot(pal['star'][0], 16, 10); c.dot(pal['star'][0], 17, 11); c.dot(pal['star'][0], 15, 11); c.dot(pal['star'][0], 16, 12)
    extras(c, model, v, fem)
    edged = ('brim', 'hat', 'shirt', 'pants', 'boot', 'pack', 'hood', 'hand', 'coat', 'vest', 'overall', 'cape', 'crown', 'legskin',
             'helm', 'bow', 'cup')
    im = c.render(pal, hx(cfg['outline']), edged)
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
    for npc in NPCS:
        for gender in ('masculino', 'feminino'):
            for skin in SKIN:
                sheet(npc, gender, skin).save(os.path.join(out, f'npc-{npc}-{gender}-{skin}.png'))
    for model in MODEL_ORDER:
        for gender in ('masculino', 'feminino'):
            for skin in SKIN:
                sheet(model, gender, skin).save(os.path.join(out, f'char-{model}-{gender}-{skin}.png'))
    print('bonecos gerados em', out)


def preview(path):
    """folha de conferência: todos os estilos, de frente, de lado e de costas"""
    cols = []
    for npc in NPCS:
        for gender in ('masculino', 'feminino'):
            for skin in SKIN:
                sheet(npc, gender, skin).save(os.path.join(out, f'npc-{npc}-{gender}-{skin}.png'))
    for model in MODEL_ORDER:
        for gender, skin in (('masculino', 'clara'), ('feminino', 'escura')):
            cols.append((model, gender, skin))
    sc = 4
    im = Image.new('RGBA', ((len(cols) // 2) * (W * 3 + 8) + 8, 2 * (H + 4) * 2 + 12), (124, 196, 112, 255))
    for k, (model, gender, skin) in enumerate(cols):
        col, row = k // 2, k % 2
        for j, d in enumerate(('down', 'right', 'up')):
            im.alpha_composite(frame_img(model, gender, skin, d, 0), (8 + col * (W * 3 + 8) + j * W, 6 + row * (H * 2 + 8)))
    im.resize((im.width * sc, im.height * sc), Image.NEAREST).save(path)


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == '--previa':
        preview(sys.argv[2])
    else:
        main()
