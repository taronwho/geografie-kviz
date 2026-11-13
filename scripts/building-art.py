# Stavby na mapě Dobývání (conquest.js BUILDINGS): branding/ikony/<stavba>.png → icons/stavby/<stavba>.webp + <stavba>-barva.webp
# Základ je vyříznutá ikona 192×192 jako u ikon témat (scripts/topic-icons.py). Vrstva -barva nese jen střechy a vlaječky:
# šedé stínování (světlá i stinná strana střechy) s průhledností podle toho, jak moc pixel patří ke střeše nebo vlajce.
# conquest.js ji na mapě položí přes základ a filtrem (feColorMatrix) vynásobí barvou hráče, který území drží.
# Hradba (č. 239) vlajku nemá: dostane vlajku z pevnosti (č. 261), zapíchnutou za hradbou.
# Spuštění: python3 scripts/building-art.py [stavba …]   (Pillow, numpy, scipy)
import sys, os, importlib.util
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
spec = importlib.util.spec_from_file_location('topic_icons', os.path.join(root, 'scripts', 'topic-icons.py'))
topic_icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(topic_icons)

# Střechy: 'blue' = břidlicově modré kuželové střechy hradů; seznam mnohoúhelníků = dřevěná střecha (bere se celá prkna,
# která v něm leží většinou plochy). Vlajky: obdélníky (x0, y0, x1, y1) v souřadnicích ikony 192×192, v nich zlatá látka
# (koruna citadely a rozsvícená okna leží mimo, hvězda na vlajce zůstane krémová)
BUILDINGS = {
    'hrad-domov': {'roof': 'blue', 'flags': [(94, 6, 124, 28)]},
    'hrad-domov-1': {'roof': 'blue', 'flags': [(95, 6, 120, 25)]},
    'hrad-domov-2': {'roof': 'blue', 'flags': [(95, 15, 120, 34), (20, 70, 38, 85), (166, 70, 185, 85)]},
    'hrad-domov-3': {'roof': 'blue', 'flags': [(95, 10, 120, 30), (24, 37, 43, 52), (162, 37, 185, 52), (49, 63, 66, 75), (138, 63, 155, 75)]},
    'palisada': {'roof': [[(64, 30), (132, 33), (163, 76), (100, 86)], [(62, 29), (68, 34), (38, 80), (27, 79)]], 'flags': [(104, 5, 133, 28)]},
    'hradba': {'roof': None, 'flags': [], 'flag_from': 'pevnost'},
    'pevnost': {'roof': None, 'flags': [(95, 6, 142, 32)]},
}
# Vlajka pevnosti s žerdí (bez cimbuří pod ní): výřez z pevnosti, žerď v x = POLE_X výřezu
FLAG_CROP = (86, 0, 146, 37)
FLAG_BOX = (98, 6, 142, 32)

def channels(im):
    a = np.asarray(im).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    return rgb, alpha, sat, lum

def gold_weight(rgb, sat):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # Krémový obrys samolepky (sytost kolem 0,3) do vlajky nepatří, jinak by kolem ní zůstal barevný lem
    return np.clip((r - b - 0.2) / 0.15, 0, 1) * np.clip((sat - 0.42) / 0.12, 0, 1) * np.clip((g - 0.25) / 0.12, 0, 1)

def blue_weight(rgb, sat, lum):
    r, b = rgb[..., 0], rgb[..., 2]
    return np.clip((b - r - 0.01) / 0.07, 0, 1) * np.clip((sat - 0.08) / 0.08, 0, 1) * np.clip((lum - 0.1) / 0.08, 0, 1)

def polygon_planks(lum, alpha, polygons):
    # Světlé plochy oddělené tmavými čarami (prkna); prkno patří ke střeše, když v mnohoúhelníku leží aspoň 60 % jeho plochy
    inside = Image.new('L', lum.shape[::-1], 0)
    draw = ImageDraw.Draw(inside)
    for poly in polygons: draw.polygon(poly, fill=255)
    inside = np.asarray(inside) > 0
    light = (lum > 0.17) & (alpha > 0.9)
    labels, count = ndi.label(light)
    keep = np.zeros(count + 1, bool)
    sizes = ndi.sum(np.ones_like(lum), labels, range(count + 1))
    hits = ndi.sum(inside, labels, range(count + 1))
    keep[1:] = (hits[1:] / np.maximum(sizes[1:], 1)) >= 0.6
    mask = keep[labels]
    # Tmavé čáry mezi prkny uvnitř střechy patří ke střeše taky (ztmaví se do barvy hráče, obrys střechy zůstane)
    grown = ndi.binary_closing(mask, iterations=2) & inside & (alpha > 0.9)
    return np.maximum(mask.astype(np.float32), grown.astype(np.float32) * 0.85)

def with_flag(base, donor):
    # Vlajka z pevnosti za hradbou: žerď na hřebenu hlavní zdi, spodek žerdi schovaný za zdí
    flag = donor.crop(FLAG_CROP)
    alpha = np.asarray(base)[..., 3] > 128
    xs = np.where(alpha.any(0))[0]
    x = int(xs.min() + (xs.max() - xs.min()) * 0.3)  # třetina šířky: nad zdí, vlajka vlaje doprava k věži
    top = int(np.where(alpha[:, x - 3:x + 4].any(1))[0].min())
    pole_x = 10  # žerď ve výřezu
    out = Image.new('RGBA', base.size, (0, 0, 0, 0))
    ox, oy = x - pole_x, top + 7 - flag.height
    out.paste(flag, (ox, oy), flag)
    out.alpha_composite(base)
    box = (FLAG_BOX[0] - FLAG_CROP[0] + ox, FLAG_BOX[1] - FLAG_CROP[1] + oy, FLAG_BOX[2] - FLAG_CROP[0] + ox, FLAG_BOX[3] - FLAG_CROP[1] + oy)
    return out, box

def tint_layer(im, roof, flags):
    rgb, alpha, sat, lum = channels(im)
    h, w = lum.shape
    weight = np.zeros((h, w), np.float32)
    kinds = []
    if roof == 'blue':
        roof_w = blue_weight(rgb, sat, lum) * (alpha > 0.5)
        kinds.append(roof_w)
    elif roof:
        kinds.append(polygon_planks(lum, alpha, roof))
    if flags:
        flag_w = np.zeros((h, w), np.float32)
        gold = gold_weight(rgb, sat) * (alpha > 0.5)
        for x0, y0, x1, y1 in flags: flag_w[y0:y1, x0:x1] = gold[y0:y1, x0:x1]
        kinds.append(flag_w)
    gray = np.zeros((h, w), np.float32)
    for k in kinds:
        core = k > 0.6
        if not core.any(): continue
        ref = float(np.median(lum[core]))
        # Prostřední jas plochy → 0,78 (filtr v conquest.js ho vynásobí na plnou barvu hráče), světlá strana světlejší, stín tmavší
        g = np.clip(lum / max(ref, 0.05) * 0.78, 0, 1)
        gray = np.where(k > weight, g, gray)
        weight = np.maximum(weight, k)
    out = np.dstack([gray, gray, gray, weight * alpha]) * 255
    return Image.fromarray(out.round().astype(np.uint8), 'RGBA'), weight

def main(wanted):
    os.makedirs(os.path.join(root, 'icons', 'stavby'), exist_ok=True)
    cache = {}
    def base_of(name):
        if name not in cache: cache[name] = topic_icons.icon(os.path.join(root, 'branding', 'ikony', name + '.png'), name)
        return cache[name]
    for name, spec in BUILDINGS.items():
        if wanted and name not in wanted: continue
        im = base_of(name)
        flags = list(spec['flags'])
        if spec.get('flag_from'):
            im, box = with_flag(im, base_of(spec['flag_from']))
            flags.append(box)
        tint, weight = tint_layer(im, spec['roof'], flags)
        out = os.path.join(root, 'icons', 'stavby', name + '.webp')
        im.save(out, 'WEBP', quality=90, method=6)
        tint_out = os.path.join(root, 'icons', 'stavby', name + '-barva.webp')
        tint.save(tint_out, 'WEBP', quality=90, method=6)
        print(name, os.path.getsize(out), 'B, barva', os.path.getsize(tint_out), 'B,', int((weight > 0.5).sum()), 'px')

if __name__ == '__main__':
    main(sys.argv[1:])
