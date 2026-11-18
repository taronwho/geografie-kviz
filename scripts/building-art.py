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
    # Sady hradů (č. 297–308): domovský hrad stupeň 0–3; opevnění ostatních území (č. 362–367): 1 = palisáda, 2 = hradba
    'hrad-goticky-0': {'roof': 'blue', 'flags': [(93, 8, 117, 27)]},
    'hrad-goticky-1': {'roof': 'blue', 'flags': [(93, 8, 116, 27)]},
    'hrad-goticky-2': {'roof': 'blue', 'flags': [(93, 9, 116, 27), (22, 92, 35, 101), (168, 92, 181, 101)]},
    'hrad-goticky-3': {'roof': 'blue', 'flags': [(96, 7, 130, 26), (74, 44, 84, 52), (116, 45, 125, 52), (44, 47, 56, 56), (145, 47, 157, 56), (24, 89, 36, 99), (167, 90, 180, 99)]},
    'opevneni-goticky-1': {'roof': 'blue', 'flags': [(93, 9, 116, 27)]},
    'opevneni-goticky-2': {'roof': 'blue', 'flags': [(94, 8, 117, 27)]},
    'hrad-orientalni-0': {'roof': 'blue', 'flags': [(96, 4, 121, 22)]},
    'hrad-orientalni-1': {'roof': 'blue', 'flags': [(96, 4, 121, 22)]},
    'hrad-orientalni-2': {'roof': 'blue', 'flags': [(96, 7, 121, 24), (20, 82, 35, 94), (168, 82, 185, 94)]},
    'hrad-orientalni-3': {'roof': 'blue', 'flags': [(96, 6, 124, 31), (45, 20, 59, 32), (142, 20, 158, 32), (16, 82, 36, 96), (169, 82, 186, 96)]},
    'opevneni-orientalni-1': {'roof': 'blue', 'flags': [(96, 4, 121, 23)]},
    'opevneni-orientalni-2': {'roof': 'blue', 'flags': [(146, 4, 171, 23)]},
    'hrad-japonsky-0': {'roof': 'blue', 'flags': [(145, 94, 173, 158)]},
    'hrad-japonsky-1': {'roof': 'blue', 'flags': [(145, 94, 174, 154)]},
    'hrad-japonsky-2': {'roof': 'blue', 'flags': [(7, 93, 26, 136), (143, 93, 167, 153)]},
    'hrad-japonsky-3': {'roof': 'blue', 'flags': [(94, 3, 134, 23), (30, 73, 45, 102), (6, 94, 26, 139), (149, 72, 166, 99), (144, 96, 163, 154)]},
    'opevneni-japonsky-1': {'roof': 'blue', 'flags': [(155, 26, 186, 102)]},
    # Nízká hradba: posunout dolů na zem (spodní okraj 184 jako ostatní stavby), praporek v posunutých souřadnicích
    'opevneni-japonsky-2': {'roof': 'blue', 'flags': [(142, 97, 167, 156)], 'ground': True},
    # Další sady hradů (č. 414–437): Perníkový hrad, Parostrojní pevnost, Ledový palác. Ledový palác je celý z modrého ledu, proto
    # se v něm barví jen praporky (roof None). Parostrojní pevnost stupeň 3 nemá krémový obrys samolepky: vyřízne se podle pozadí (plain).
    'hrad-pernikovy-0': {'roof': 'blue', 'flags': [(97, 11, 125, 24), (157, 47, 177, 58)]},
    'hrad-pernikovy-1': {'roof': 'blue', 'flags': [(97, 29, 118, 40), (142, 57, 160, 67)]},
    'hrad-pernikovy-2': {'roof': 'blue', 'flags': [(97, 33, 117, 47), (131, 53, 146, 62), (38, 77, 51, 86), (150, 77, 166, 86)]},
    'hrad-pernikovy-3': {'roof': 'blue', 'flags': [(89, 44, 123, 63), (58, 73, 73, 81), (133, 71, 149, 81), (36, 104, 50, 113), (152, 102, 167, 111)], 'ground': True},
    'opevneni-pernikovy-1': {'roof': 'blue', 'flags': [(108, 68, 131, 79)], 'ground': True},
    'opevneni-pernikovy-2': {'roof': 'blue', 'flags': [(57, 41, 76, 52)]},
    'hrad-parostrojni-0': {'roof': 'blue', 'flags': [(97, 9, 119, 24)]},
    'hrad-parostrojni-1': {'roof': 'blue', 'flags': [(99, 8, 120, 24)]},
    'hrad-parostrojni-2': {'roof': 'blue', 'flags': [(101, 16, 116, 28), (24, 72, 39, 83), (165, 72, 183, 83), (112, 99, 128, 110)]},
    'hrad-parostrojni-3': {'roof': 'blue', 'flags': [(20, 79, 35, 90), (166, 81, 181, 92), (110, 104, 119, 111)], 'plain': True},
    'opevneni-parostrojni-1': {'roof': 'blue', 'flags': [(83, 68, 102, 83)], 'ground': True},
    'opevneni-parostrojni-2': {'roof': 'blue', 'flags': [(137, 11, 161, 25)]},
    'hrad-ledovy-0': {'roof': None, 'flags': [(97, 9, 119, 24)]},
    'hrad-ledovy-1': {'roof': None, 'flags': [(97, 9, 120, 24)]},
    'hrad-ledovy-2': {'roof': None, 'flags': [(97, 13, 118, 28), (26, 54, 41, 65), (162, 54, 181, 67)]},
    'hrad-ledovy-3': {'roof': None, 'flags': [(104, 15, 128, 31), (57, 47, 72, 57), (19, 70, 34, 80), (166, 62, 182, 74), (112, 88, 127, 99)]},
    'opevneni-ledovy-1': {'roof': None, 'flags': [(119, 13, 149, 35)]},
    'opevneni-ledovy-2': {'roof': None, 'flags': [(125, 10, 150, 26)]},
    # Stavby na území (č. 409–411 a 438–458, docs/DOBYVANI-STAVBY.md): strážní věž, důl a zřícenina, základní a v každé sadě hradů.
    # Zřícenina je ozdoba bez barvy majitele (tint False: bez vrstvy -barva). Tábor obléhatelů (č. 412): praporky v barvě útočníka,
    # pomník vítěze (č. 413): praporek v barvě vítěze; ostatní (stany, děla, socha) se nebarví. Nízké stavby stojí na zemi (ground).
    'vez': {'roof': 'blue', 'flags': [(97, 8, 117, 23)]},
    'dul': {'roof': 'blue', 'flags': [(134, 36, 158, 55)], 'ground': True},
    'zricenina': {'tint': False, 'ground': True},
    'tabor': {'roof': None, 'flags': [(53, 55, 83, 74), (120, 55, 149, 74)], 'ground': True},
    'pomnik': {'roof': None, 'flags': [(103, 37, 129, 58)], 'ground': True},
    'vez-goticky': {'roof': 'blue', 'flags': [(96, 8, 118, 21)]},
    'dul-goticky': {'roof': 'blue', 'flags': [(91, 9, 113, 23)]},
    'zricenina-goticky': {'tint': False, 'ground': True},
    'vez-orientalni': {'roof': 'blue', 'flags': [(96, 8, 116, 22)]},
    'dul-orientalni': {'roof': 'blue', 'flags': [(109, 14, 130, 29)]},
    'zricenina-orientalni': {'tint': False, 'ground': True},
    'vez-japonsky': {'roof': 'blue', 'flags': [(89, 8, 119, 29)]},
    'dul-japonsky': {'roof': 'blue', 'flags': [(141, 35, 160, 65)], 'ground': True},
    'zricenina-japonsky': {'tint': False, 'ground': True},
    'vez-pernikovy': {'roof': 'blue', 'flags': [(98, 26, 117, 37)]},
    'dul-pernikovy': {'roof': 'blue', 'flags': [(108, 39, 128, 52)]},
    'zricenina-pernikovy': {'tint': False, 'ground': True},
    'vez-parostrojni': {'roof': 'blue', 'flags': [(73, 10, 93, 23)]},
    'dul-parostrojni': {'roof': 'blue', 'flags': [(63, 19, 88, 37)]},
    'zricenina-parostrojni': {'tint': False, 'ground': True},
    'vez-ledovy': {'roof': None, 'flags': [(99, 19, 118, 34)]},
    'dul-ledovy': {'roof': None, 'flags': [(134, 19, 155, 35)]},
    'zricenina-ledovy': {'tint': False, 'ground': True},
}
SETS = ('goticky', 'orientalni', 'japonsky', 'pernikovy', 'parostrojni', 'ledovy')
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

def plain_icon(path, size=192):
    # Obrázek bez krémového obrysu samolepky (hrad-parostrojni-3): pozadí = vše od okraje obrázku skoro v barvě pozadí (tmavé obrysy
    # kresby ho od stavby oddělí), drobnosti kolem (kouř, jiskry) pryč; kolem stavby se dokreslí krémový obrys jako u ostatních samolepek
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    bg = np.median(np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3)]), axis=0)
    near = np.sqrt(((a - bg) ** 2).sum(-1)) < 9
    labels, _ = ndi.label(near)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    subject = ~np.isin(labels, list(edge))
    parts, count = ndi.label(subject)
    sizes = ndi.sum(subject, parts, range(count + 1))
    subject = ndi.binary_fill_holes((sizes >= sizes.max() * 0.002)[parts] & subject)
    subject = ndi.binary_opening(subject, iterations=1)
    rim = ndi.binary_dilation(subject, iterations=11) & ~subject
    rgb = np.where(rim[..., None], np.array([246, 236, 214], np.float32), a)
    alpha = ndi.gaussian_filter((subject | rim).astype(np.float32), 1.2)
    im = Image.fromarray(np.dstack([rgb, alpha * 255]).round().astype(np.uint8), 'RGBA')
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    scale = (size - 8) / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return canvas

def on_ground(im, bottom=184):
    # Obsah ikony posune dolů, ať stojí na stejné čáře jako ostatní stavby
    box = im.getchannel('A').getbbox()
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, max(0, bottom - box[3])), im)
    return out

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
        if name not in cache:
            path = os.path.join(root, 'branding', 'ikony', name + '.png')
            cache[name] = plain_icon(path) if BUILDINGS.get(name, {}).get('plain') else topic_icons.icon(path, name)
        return cache[name]
    for name, spec in BUILDINGS.items():
        if wanted and name not in wanted: continue
        im = base_of(name)
        if spec.get('ground'): im = on_ground(im)
        flags = list(spec.get('flags', []))
        if spec.get('flag_from'):
            im, box = with_flag(im, base_of(spec['flag_from']))
            flags.append(box)
        out = os.path.join(root, 'icons', 'stavby', name + '.webp')
        im.save(out, 'WEBP', quality=90, method=6)
        if spec.get('tint') is False:
            print(name, os.path.getsize(out), 'B, bez barvy')
            continue
        tint, weight = tint_layer(im, spec.get('roof'), flags)
        tint_out = os.path.join(root, 'icons', 'stavby', name + '-barva.webp')
        tint.save(tint_out, 'WEBP', quality=90, method=6)
        print(name, os.path.getsize(out), 'B, barva', os.path.getsize(tint_out), 'B,', int((weight > 0.5).sum()), 'px')

if __name__ == '__main__':
    main(sys.argv[1:])
