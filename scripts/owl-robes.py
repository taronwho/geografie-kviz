# Barvy obleku sovy: z icons/logo.webp a icons/topics/sova-*.webp (vínový talár) vyrobí varianty <název>-<barva>.webp.
# Přebarví se jen vínová/červená oblast (talár, čepice, kniha, tmavě vínové čáry); oči, zobák, růžový jazyk, peří a zlaté detaily zůstanou.
# Spuštění: python3 scripts/owl-robes.py   (Pillow, numpy). Barvy musí odpovídat ROBES v look.js.
import os, glob
import numpy as np
from PIL import Image

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
# id: (cílový odstín 0-360, násobek sytosti, násobek jasu)
ROBES = {
    'zelena': (140, 0.95, 1.00),
    'modra': (212, 1.05, 1.05),
    'ruzova': (332, 0.80, 1.55),
    'fialova': (272, 0.95, 1.10),
    'cerna': (230, 0.10, 0.45),
    'zlata': (47, 1.00, 1.45),
}
# Sova titulu Mudrlant (sova-titul-11) sedí v odznaku s purpurovou mlhovinou, vínovými obrysy a červenými drahokamy v odstínech
# taláru: přebarví se jen uvnitř obdélníků s čepicí a talárem ('in'), drahokamy v nich zůstanou ('out');
# souřadnice v pixelech obrázku 320 × 320 (x0, y0, x1, y1)
AREAS = {
    'sova-titul-11': {
        'in': [(116, 34, 207, 84), (97, 76, 229, 130), (74, 200, 100, 246), (98, 180, 128, 256), (108, 195, 214, 280), (190, 186, 254, 262)],
        'out': [(137, 54, 150, 72), (174, 54, 188, 72), (156, 248, 169, 272)],
    },
}

def rgb_to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rc = nz & (mx == r); gc = nz & (mx == g) & ~rc; bc = nz & ~rc & ~gc
    h[rc] = ((g - b)[rc] / d[rc]) % 6
    h[gc] = (b - r)[gc] / d[gc] + 2
    h[bc] = (r - g)[bc] / d[bc] + 4
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    return h * 60, s, mx

def hsv_to_rgb(h, s, v):
    h = (h % 360) / 60
    c = v * s
    x = c * (1 - np.abs(h % 2 - 1))
    m = v - c
    z = np.zeros_like(h)
    conds = [h < 1, h < 2, h < 3, h < 4, h < 5, h >= 5]
    r = np.select(conds, [c, x, z, z, x, c]); g = np.select(conds, [x, c, c, x, z, z]); b = np.select(conds, [z, z, x, c, c, x])
    return np.stack([r + m, g + m, b + m], -1)

def recolor(im, hue, sat, val, area=None):
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255
    h, s, v = rgb_to_hsv(a[..., :3])
    # vínová/červená/purpurová: odstín 300-360 a 0-12, dost sytá; měkký přechod na okrajích rozsahu
    hd = np.where(h > 180, h - 360, h)            # -180 … 180
    w = np.clip((hd + 60) / 15, 0, 1) * np.clip((18 - hd) / 8, 0, 1)
    w *= np.clip((s - 0.18) / 0.15, 0, 1)
    # Růžový jazyk a zobáček (sovy titulů s otevřeným zobákem): světlá červená až růžová (jas od 0,72, odstín od -2°) zůstane;
    # talár a čepice jsou tmavší a do vínova (odstín kolem -15°), jejich světlá místa jsou pod hranicí
    w *= 1 - np.clip((v - 0.62) / 0.1, 0, 1) * np.clip((hd + 8) / 6, 0, 1)
    if area:
        inside = np.zeros(w.shape, bool)
        for x0, y0, x1, y1 in area['in']: inside[y0:y1, x0:x1] = True
        for x0, y0, x1, y1 in area['out']: inside[y0:y1, x0:x1] = False
        w *= inside
    out = hsv_to_rgb(np.full_like(h, hue), np.clip(s * sat, 0, 1), np.clip(v * val, 0, 1))
    rgb = a[..., :3] * (1 - w[..., None]) + out * w[..., None]
    return Image.fromarray((np.dstack([rgb, a[..., 3]]) * 255).round().astype(np.uint8), 'RGBA')

sources = [os.path.join(root, 'logo.webp')] + sorted(glob.glob(os.path.join(root, 'topics', 'sova-*.webp')))
for path in sources:
    base = os.path.splitext(os.path.basename(path))[0]
    if base.rsplit('-', 1)[-1] in ROBES: continue  # už je to varianta
    im = Image.open(path)
    for robe, (hue, sat, val) in ROBES.items():
        recolor(im, hue, sat, val, AREAS.get(base)).save(os.path.join(os.path.dirname(path), f'{base}-{robe}.webp'), 'WEBP', quality=82, method=6)
