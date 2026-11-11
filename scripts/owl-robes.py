# Barvy obleku sovy: z icons/logo.webp a icons/topics/sova-*.webp (vínový talár) vyrobí varianty <název>-<barva>.webp.
# Přebarví se jen vínová/červená oblast (talár, čepice, kniha, tmavě vínové čáry); oči, zobák, růžový jazyk, peří a zlaté detaily zůstanou.
# Spuštění: python3 scripts/owl-robes.py [barva …]   (Pillow, numpy; bez argumentů všechny barvy). Barvy musí odpovídat ROBES v look.js.
# Jen některé obrázky: ONLY=logo-bez-monoklu python3 scripts/owl-robes.py (názvy bez přípony, oddělené čárkou).
import os, glob, sys
import numpy as np
from PIL import Image

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
# id: (cílový odstín 0-360, násobek sytosti, násobek jasu), nebo tónová křivka (viz TONES)
ROBES = {
    'zelena': (140, 0.95, 1.00),
    'modra': (212, 1.05, 1.05),
    'ruzova': (332, 0.80, 1.55),
    'fialova': (272, 0.95, 1.10),
    'cerna': (230, 0.10, 0.45),
    'zlata': (47, 1.00, 1.45),
    'bila': 'tone',
}
# Tónové křivky: [(jas původního pixelu 0–1, barva RGB)], mezi body lineárně. Bílý talár nejde udělat otočením odstínu (z vínové
# by byla jen světlá růžová), barva se proto určí podle jasu. Vínový talár má tři tóny: obrys a záhyby (jas kolem 0,19–0,28), stín
# (0,38–0,42) a plochu (0,52), odlesky do 0,75. Křivka je převede na tmavě šedý obrys, světle šedomodrý stín, skoro bílou plochu
# a bílé odlesky, takže kresba (cel shading) zůstane čitelná. Stín leží na mírné části křivky (0,36–0,44), aby šum ztrátové
# komprese nevystoupil jako skvrny.
TONES = {
    'bila': [(0.0, (16, 17, 22)), (0.20, (36, 39, 48)), (0.27, (54, 58, 70)), (0.33, (164, 170, 186)), (0.37, (194, 200, 214)),
             (0.44, (211, 216, 228)), (0.50, (239, 241, 247)), (0.55, (248, 249, 252)), (0.66, (255, 255, 255)), (1.0, (255, 255, 255))],
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

def tone(v, points):
    xs = [x for x, _ in points]
    return np.stack([np.interp(v, xs, [rgb[i] / 255 for _, rgb in points]) for i in range(3)], -1)

# Maska posunutá o (dy, dx) bez přetečení přes okraj; rozšíření a zúžení o čtverec (2r+1)²; souvislá oblast z výchozích pixelů
def shift(mask, dy, dx):
    out = np.zeros_like(mask)
    h, w = mask.shape
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = mask[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
    return out

def grow(mask, radius):
    rows = mask.copy()
    for dy in range(-radius, radius + 1): rows |= shift(mask, dy, 0)
    out = rows.copy()
    for dx in range(-radius, radius + 1): out |= shift(rows, 0, dx)
    return out

def erode(mask, radius):
    return ~grow(~mask, radius)

def region(seed, allowed):
    cur = seed & allowed
    while True:
        nxt = (cur | shift(cur, 1, 0) | shift(cur, -1, 0) | shift(cur, 0, 1) | shift(cur, 0, -1)) & allowed
        if (nxt == cur).all(): return cur
        cur = nxt

def recolor(im, spec, area=None):
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255
    h, s, v = rgb_to_hsv(a[..., :3])
    # vínová/červená/purpurová: odstín 300-360 a 0-12, dost sytá; měkký přechod na okrajích rozsahu
    hd = np.where(h > 180, h - 360, h)            # -180 … 180
    w = np.clip((hd + 60) / 15, 0, 1) * np.clip((18 - hd) / 8, 0, 1)
    w *= np.clip((s - 0.18) / 0.15, 0, 1)
    # Růžový jazyk a zobáček (sovy titulů s otevřeným zobákem): světlá červená až růžová (jas od 0,72, odstín od -2°) zůstane;
    # talár a čepice jsou tmavší a do vínova (odstín kolem -15°), jejich světlá místa jsou pod hranicí
    light = np.clip((v - 0.62) / 0.1, 0, 1) * np.clip((hd + 8) / 6, 0, 1)
    keep = np.zeros(w.shape, bool)
    toned = isinstance(spec, list)
    if toned:
        # Na bílém taláru by růžově svítily i světlé odlesky na čepici a taláru (třeba od žárovky): ty, které leží do 16 px od plné
        # plochy taláru (vínová se středním jasem, aspoň 5 × 5 px), se přebarví s ním. Jazyk (světle červená plocha aspoň 3 × 3 px)
        # je od ní ve všech pózách přes 50 px; tmavě vínová tlama kolem něj (do 8 px, jas nad obrysem) zůstane, jak je, jinak by
        # zesvětlala do šedé.
        body = (w > 0.8) & (v > 0.42) & (v < 0.62) & (hd < -8)
        light *= ~grow(erode(body, 2), 16)
        pinkish = (light > 0.5) & (w > 0.5)
        tongue = region(erode(pinkish, 1), pinkish)
        keep = region(tongue, (((w > 0.2) & (v > 0.29)) | tongue) & grow(tongue, 8))
    w *= (1 - light) * ~keep
    if area:
        inside = np.zeros(w.shape, bool)
        for x0, y0, x1, y1 in area['in']: inside[y0:y1, x0:x1] = True
        for x0, y0, x1, y1 in area['out']: inside[y0:y1, x0:x1] = False
        w *= inside
    base = a[..., :3]
    if toned:
        out = tone(v, spec)
        # Okraje oblasti (přebarvené jen zčásti) by na bílé zůstaly narůžovělé: původní barva v nich ztratí sytost úměrně tomu,
        # jak moc patří k taláru
        grey = base.mean(-1, keepdims=True)
        base = grey + (base - grey) * (1 - w[..., None])
    else:
        hue, sat, val = spec
        out = hsv_to_rgb(np.full_like(h, hue), np.clip(s * sat, 0, 1), np.clip(v * val, 0, 1))
    rgb = base * (1 - w[..., None]) + out * w[..., None]
    return Image.fromarray((np.dstack([rgb, a[..., 3]]) * 255).round().astype(np.uint8), 'RGBA')

wanted = sys.argv[1:] or list(ROBES)
unknown = [robe for robe in wanted if robe not in ROBES]
if unknown: sys.exit(f'Neznámá barva: {", ".join(unknown)} (známé: {", ".join(ROBES)})')
# Logo sovy bez monoklu (icons/logo-bez-monoklu.webp ze scripts/owl-accessories.py --logo) má stejné barvy obleku jako logo
sources = [os.path.join(root, 'logo.webp'), os.path.join(root, 'logo-bez-monoklu.webp')] + sorted(glob.glob(os.path.join(root, 'topics', 'sova-*.webp')))
only = set(filter(None, os.environ.get('ONLY', '').split(',')))
for path in sources:
    base = os.path.splitext(os.path.basename(path))[0]
    if only and base not in only: continue
    if base.rsplit('-', 1)[-1] in ROBES: continue  # už je to varianta
    im = Image.open(path)
    for robe in wanted:
        spec = TONES[robe] if ROBES[robe] == 'tone' else ROBES[robe]
        recolor(im, spec, AREAS.get(base)).save(os.path.join(os.path.dirname(path), f'{base}-{robe}.webp'), 'WEBP', quality=82, method=6)
