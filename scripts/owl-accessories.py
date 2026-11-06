# Doplňky sovy: z obrázků sovy s doplňky (branding/doplnky/<id>.jpg, generátor je překreslil na plátno 2048×2048 vždy trochu jinak)
# vyrobí průhledné vrstvy icons/doplnky/<id>.webp ve stejném rámu jako icons/logo.webp (258×320), které se v aplikaci skládají
# přes sovu. Postup: obrázek se zarovná na původní sovu (affinní ECC), rozdíl proti původní sově je doplněk, ten se vyřízne.
# Spuštění: python3 scripts/owl-accessories.py [id ...]   (Pillow, numpy, opencv-python-headless)
import os, sys, glob, json
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'branding', 'doplnky')
OUT = os.path.join(ROOT, 'icons', 'doplnky')
BASE = os.path.join(ROOT, 'branding', 'sova-original.jpg')
CUT = os.path.join(ROOT, 'branding', 'sova.png')
LOGO_SIZE = (258, 320)
# Vrstva má rám loga rozšířený o okraje (koruna, sluchátka a lupa přesahují obrys sovy): podíl šířky/výšky loga
PAD = {'l': 0.34, 'r': 0.22, 't': 0.26, 'b': 0.12}
# Doplňky v obličeji zakrývají i oči a monokl pod sebou, proto se jejich plocha vyplní celá (bez děr)
FILL = {'bryle', 'slunecni-bryle', 'koruna', 'lab-bryle', '3d-bryle', 'helma', 'prilba', 'baret'}
# Doplňky v ruce posunou na obrázku celou sovu (obdélník sovy zahrnuje i předmět): zarovná se podle čepice a hlavy
# Doplňky, které nahrazují čepici: v místě, kde byla výchozí čepice (icons/logo-maska.webp, scripts/owl-hat-mask.py), se přebírá i hlava sovy z obrázku doplňku
HATS = {'helma', 'prilba', 'baret'}
# Doplňky s pevnou částí: barvu mění jen plátno (modrá plocha), zbytek (tyčka, ruka) je v samostatné vrstvě <id>-zaklad.webp, která se nikdy nepřebarvuje
SPLIT = {'vlajka'}
# Nejtmavší místo stínování vlajky státu (1 = bez stínu): stín nesmí vlajku příliš ztmavit
SHADE_MIN = 0.55
# Vlajka státu: do tolika pixelů od kraje masky stínování ztmavne až na FLAG_EDGE_MIN (okraj vlajky splyne s tmavým obrysem plátna,
# i když prohlížeč masku při zmenšení převzorkuje); obrázek vlajky přesahuje masku aspoň o tento podíl své velikosti na každé straně
# (vlnění posouvá body, vlajka musí masku všude vyplnit)
FLAG_EDGE = 2.0
FLAG_EDGE_MIN = 0.3
FLAG_OVERSCAN = 0.06
# Vlnění: mapa posunutí vlajka-vlna.webp pro SVG filtr feDisplacementMap v index.html (feImage roztažená přes obrázek vlajky).
# Zelený kanál = svislý posun: vlajka sleduje střednici plátna (sloupec po sloupci střed mezi horním a dolním okrajem masky),
# takže pruhy a znaky vlajky se vlní s látkou. FLAG_WAVE = podíl zakřivení střednice (1 = přesně po plátně), FLAG_WAVE_SCALE musí být
# stejná jako atribut scale filtru (v podílu výšky obrázku vlajky): posun v px = (G − 0,5) · scale · výška obrázku.
FLAG_WAVE = 1.0
FLAG_WAVE_SCALE = 0.5
HAND = {'vlajka', 'svitek', 'brk', 'sitka'}
# Doplněk zlaté barvy na zlatém podkladu (koruna přes knoflík čepice, stuha medaile přes zlatý límec) se od původní sovy skoro neliší:
# silnější uzavření masky, ať se přebarví celý a nezůstanou zlaté kusy. Poloměr v pixelech původního obrázku.
# Doplňky, které sedí na zlatém knoflíku čepice: knoflík se do masky přidá (jinak by prosvítal zlatý uprostřed přebarveného doplňku)
KNOB = {'koruna'}
CLOSE = {'koruna': 45, 'medaile': 41, 'kvetina': 21, 'sala': 25}
BORDER = 360  # okraj plátna při zarovnání, aby se vešlo i to, co přesahuje původní obrázek


def load_base():
    img = Image.open(BASE).convert('RGB')
    img = img.crop((4, 4, img.width - 4, img.height - 4))  # stejně jako scripts/logo-cutout.py
    return np.asarray(img)


def owl_bbox(a):
    """Obdélník sovy podle odlišnosti od pozadí (barva pozadí = medián okraje)."""
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.sqrt(((a.astype(np.float32) - bg) ** 2).sum(axis=2))
    m = (d > 60).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    ys, xs = np.nonzero(m)
    return xs.min(), ys.min(), xs.max(), ys.max(), bg


def logo_frame(base_rgb):
    """Rám loga v souřadnicích původního obrázku (výřez sova.png): x0, y0, šířka, výška."""
    cut = np.asarray(Image.open(CUT).convert('RGBA'))
    alpha = cut[..., 3]
    # najdi výřez šablonou: sova.png je výřez obrázku base_rgb (po ořezu okrajů), takže stačí porovnat neprůhledné pixely
    h, w = alpha.shape
    gray_cut = cv2.cvtColor(cut[..., :3], cv2.COLOR_RGB2GRAY)
    gray_base = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2GRAY)
    res = cv2.matchTemplate(gray_base, gray_cut, cv2.TM_SQDIFF_NORMED, mask=(alpha > 250).astype(np.uint8) * 255)
    _, _, (x0, y0), _ = cv2.minMaxLoc(res)
    return x0, y0, w, h


def hat_box(a):
    """Obdélník čepice (vínová barva v pásu hlavy); vrací x0, x1 (šířka čepice) a y0 (její vršek)."""
    h = a.shape[0]
    y0w, y1w = int(h * 0.15), int(h * 0.36)
    win = a[y0w:y1w].astype(np.int16)
    r, g, b = win[..., 0], win[..., 1], win[..., 2]
    m = (r > 90) & (r < 190) & (g < 70) & (b > 40) & (b < 120) & (r - g > 60)
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    ys, xs = np.nonzero(m)
    return xs.min(), xs.max(), ys.min() + y0w


def align(base, img, border=BORDER, hat=False):
    """Zarovná img (2048²) na souřadnice base; vrátí obraz o rozměru base."""
    bx0, by0, bx1, by1, _ = owl_bbox(base)
    ix0, iy0, ix1, iy1, ibg = owl_bbox(img)
    # počáteční odhad: stejná výška a střed obdélníku sovy
    s = (by1 - by0) / (iy1 - iy0)
    scale_x = (bx1 - bx0) / (ix1 - ix0)
    s = (s + scale_x) / 2
    cx_b, cy_b = (bx0 + bx1) / 2, (by0 + by1) / 2
    cx_i, cy_i = (ix0 + ix1) / 2, (iy0 + iy1) / 2
    warp = np.array([[s, 0, cx_b - s * cx_i], [0, s, cy_b - s * cy_i]], np.float32)
    if hat:
        # podle čepice: její šířka dává měřítko, její levý okraj a vršek posun
        bx_a, bx_b, by_a = hat_box(base)
        ix_a, ix_b, iy_a = hat_box(img)
        s = (bx_b - bx_a) / (ix_b - ix_a)
        warp = np.array([[s, 0, bx_a - s * ix_a], [0, s, by_a - s * iy_a]], np.float32)
    # ECC pracuje v souřadnicích šablony (base) → img: potřebujeme zobrazení base → img, tedy inverzi
    inv = cv2.invertAffineTransform(warp)
    g_base = cv2.GaussianBlur(cv2.cvtColor(base, cv2.COLOR_RGB2GRAY), (0, 0), 2).astype(np.float32)
    g_img = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), (0, 0), 2).astype(np.float32)
    # menší měřítko pro rychlost
    k = 0.4
    gb = cv2.resize(g_base, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    gi = cv2.resize(g_img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    inv_small = inv.copy()
    # base_small(x) → img_small: x_i_small = k * (inv @ (x_b_small / k))
    inv_small[:, 2] = inv[:, 2] * k
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-7)
    try:
        mask_small = None
        if hat:
            # jen hlava a čepice (střed obrazu): předmět v ruce s původní sovou nesouvisí
            mask_small = np.zeros(gi.shape, np.uint8)
            mask_small[:, int(gi.shape[1] * 0.30):int(gi.shape[1] * 0.80)] = 1
        _, inv_small = cv2.findTransformECC(gb, gi, inv_small, cv2.MOTION_AFFINE, crit, mask_small, 5)
    except cv2.error as error:
        print('  ECC selhalo, použit odhad:', error)
    refined = inv_small.copy()
    refined[:, 2] = inv_small[:, 2] / k
    # plátno rozšířené o okraj: souřadnice e = x + border
    ext = refined.copy()
    ext[:, 2] = refined[:, 2] - refined[:, :2] @ np.array([border, border], np.float32)
    size = (base.shape[1] + 2 * border, base.shape[0] + 2 * border)
    warped = cv2.warpAffine(img, ext, size, flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    return warped


def hat_zone(frame, shape, border=BORDER):
    """Plocha výchozí čepice v souřadnicích rozšířeného plátna (z masky loga)."""
    x0, y0, w, h = frame
    m = np.asarray(Image.open(os.path.join(ROOT, 'icons', 'logo-maska.webp')).convert('RGBA').getchannel('A').resize((w, h), Image.LANCZOS))
    zone = np.zeros(shape[:2], np.uint8)
    zone[y0 + border:y0 + border + h, x0 + border:x0 + border + w] = (m < 128).astype(np.uint8)
    return zone


def extract(base, warped, fill=False, border=BORDER, close=9, knob=False, zone=None):
    base = cv2.copyMakeBorder(base, border, border, border, border, cv2.BORDER_REPLICATE)
    diff = np.abs(warped.astype(np.int16) - base.astype(np.int16)).max(axis=2).astype(np.uint8)
    diff = cv2.GaussianBlur(diff, (0, 0), 1.2)
    mask = (diff > 38).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close, close)))
    # nejvýš tři největší souvislé plochy větší než šum
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    keep = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 600:
            keep[labels == i] = 1
    if knob:
        # zlatý knoflík čepice (nahoře uprostřed sovy): sytě žlutá až oranžová místa v horní části
        hsv = cv2.cvtColor(base, cv2.COLOR_RGB2HSV).astype(np.float32)
        x0, y0, x1, y1, _ = owl_bbox(base)
        zone = np.zeros(base.shape[:2], bool)
        zone[y0:y0 + int((y1 - y0) * 0.14), x0:x1] = True
        gold = zone & (hsv[..., 0] >= 15) & (hsv[..., 0] <= 28) & (hsv[..., 1] > 130) & (hsv[..., 2] > 140)
        gold = cv2.dilate(gold.astype(np.uint8), np.ones((9, 9), np.uint8))
        keep = np.maximum(keep, gold)
    # tam, kde je v obrázku doplňku jen pozadí, doplněk není (nic se nepřekrývá tmavou barvou pozadí)
    border_px = np.concatenate([warped[:8].reshape(-1, 3), warped[-8:].reshape(-1, 3), warped[:, :8].reshape(-1, 3), warped[:, -8:].reshape(-1, 3)])
    bgc = np.median(border_px.reshape(-1, 3), axis=0)
    away = np.sqrt(((warped.astype(np.float32) - bgc) ** 2).sum(axis=2))
    keep = np.where(away < 28, 0, keep).astype(np.uint8)
    if zone is not None:
        # místo čepice: vše, co obrázek doplňku v této ploše kreslí (hlava sovy, helma), se převezme; mimo ni jen rozdíl
        keep = np.where((zone > 0) & (away >= 28), 1, keep).astype(np.uint8)
    if fill:
        # vyplnění děr: co není vnějšek, je doplněk
        inv = (1 - keep).astype(np.uint8)
        flood = inv.copy()
        h, w = flood.shape
        ff = np.zeros((h + 2, w + 2), np.uint8)
        cv2.floodFill(flood, ff, (0, 0), 2)
        keep = ((flood != 2)).astype(np.uint8)
    return keep, diff


def layer(base, warped, mask, frame, border=BORDER):
    x0, y0, w, h = frame
    l, r, t, b = (int(round(PAD[k] * (w if k in 'lr' else h))) for k in 'lrtb')
    x0, y0 = x0 + border, y0 + border
    m = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.0)
    alpha = np.clip(alpha * 1.4, 0, 1)
    alpha = np.where(alpha < 0.16, 0, alpha)  # slabé zbytky rozdílu (stíny, obrys původní čepice) se zahodí
    rgba = np.dstack([warped.astype(np.float32), alpha * 255]).astype(np.uint8)
    crop = rgba[y0 - t:y0 + h + b, x0 - l:x0 + w + r]
    img = Image.fromarray(crop, 'RGBA')
    k = LOGO_SIZE[0] / w
    return img.resize((round(crop.shape[1] * k), round(crop.shape[0] * k)), Image.LANCZOS)


def fill_outline(a, cloth):
    """Tmavý obrys plátna se od tmavého pozadí původního obrázku skoro neliší, proto ho rozdíl proti sově místy vynechal
    (díry a průhledné proužky v alfě mezi krémovým okrajem a modrou). V okolí plátna se úzké mezery v neprůhledné ploše
    zaplní (morfologické uzavření) barvou, kterou mají v původním obrázku."""
    zone = cv2.dilate(cloth, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    solid = ((a[..., 3] >= 128) & (zone > 0)).astype(np.uint8)
    closed = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    holes = (closed > 0) & (zone > 0) & (a[..., 3] < 255)
    a[holes, 3] = 255
    return int(holes.sum())


def split_cloth(img):
    """Rozdělí vrstvu na barevné plátno (největší modrá plocha s obrysem) a pevný zbytek.
    Vrací i vnitřek plátna (bez obrysu, bez děr) pro masku a stínování vlajky státu: plátno, pevná část, vnitřek."""
    a = np.asarray(img.convert('RGBA')).copy()
    hsv = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2HSV).astype(np.int32)
    blue = ((hsv[..., 0] >= 95) & (hsv[..., 0] <= 130) & (hsv[..., 1] > 90) & (hsv[..., 2] > 90) & (a[..., 3] > 128)).astype(np.uint8)
    blue = cv2.morphologyEx(blue, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(blue, 8)
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    cloth = (labels == biggest).astype(np.uint8)
    # vnitřek plátna: modrá plocha bez děr (tmavší vlnky uvnitř)
    contours, _ = cv2.findContours(cloth, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    inner = np.zeros_like(cloth)
    cv2.drawContours(inner, contours, -1, 1, cv2.FILLED)
    print(f'obrys plátna: doplněno {fill_outline(a, cloth)} px')
    cloth = cv2.dilate(cloth, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    cloth_a, base_a = a.copy(), a.copy()
    cloth_a[..., 3] = np.where(cloth > 0, a[..., 3], 0)
    base_a[..., 3] = np.where(cloth > 0, 0, a[..., 3])
    return Image.fromarray(cloth_a, 'RGBA'), Image.fromarray(base_a, 'RGBA'), inner


def flag_layers(cloth_img, inner):
    """Maska, stínování a mapa vlnění pro vlajku státu na plátně (vlajka-maska.webp, vlajka-stin.webp, vlajka-vlna.webp; maska
    a stínování mají stejný rám jako ostatní vrstvy). Maska = vnitřek plátna (modrá plocha bez obrysu) s měkkým okrajem 1 px (alfa);
    tmavý obrys a krémový okraj zůstanou z barevné vrstvy vidět kolem vlajky. Stínování = odstíny šedi z jasu původního modrého plátna
    (záhyby látky), které se na vlajku násobí (mix-blend-multiply): nejsvětlejší místo je bez změny, nejtmavší se ztmaví na SHADE_MIN;
    u kraje masky ztmavne až na FLAG_EDGE_MIN, ať okraj vlajky splyne s obrysem. Vrací masku, stínování, mapu vlnění a ohraničení
    obrázku vlajky (x, y, šířka, výška) v pixelech vrstvy: obdélník masky zvětšený na každé straně aspoň o FLAG_OVERSCAN a svisle
    o největší posun vlnění (vlajka musí masku přesahovat i po posunutí)."""
    core = inner.astype(np.uint8)
    alpha = cv2.GaussianBlur(core.astype(np.float32), (0, 0), 0.7)
    alpha = np.clip(alpha, 0, 1)
    rgb = np.asarray(cloth_img.convert('RGB')).astype(np.float32) / 255.0
    luma = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    inside = inner > 0
    lo, hi = np.percentile(luma[inside], [3, 80])
    level = np.clip((luma - lo) / max(hi - lo, 1e-3), 0, 1)
    level = cv2.GaussianBlur(level, (0, 0), 1.0)
    shade = SHADE_MIN + (1 - SHADE_MIN) * level
    # ztmavení u kraje masky: vzdálenost od jejího okraje v pixelech
    dist = cv2.distanceTransform(core, cv2.DIST_L2, 5)
    edge = np.clip(dist / FLAG_EDGE, 0, 1)
    shade = shade * (FLAG_EDGE_MIN + (1 - FLAG_EDGE_MIN) * edge)
    gray = np.clip(shade * 255, 0, 255).astype(np.uint8)
    stin = np.dstack([gray, gray, gray, (alpha * 255).astype(np.uint8)])
    maska = np.dstack([np.full_like(gray, 255)] * 3 + [(alpha * 255).astype(np.uint8)])
    ys, xs = np.nonzero(alpha > 0)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    # střednice plátna po sloupcích (jen tam, kde je plátno dost vysoké – špičky rohů by ji strhly), vyhlazená; mimo plátno drží kraj
    tops = np.full(x1 - x0, np.nan)
    bottoms = np.full(x1 - x0, np.nan)
    for i in range(x1 - x0):
        rows = np.nonzero(alpha[:, x0 + i] > 0.5)[0]
        if len(rows):
            tops[i], bottoms[i] = rows.min(), rows.max()
    heights = bottoms - tops
    good = np.nonzero(heights >= 0.6 * np.nanmax(heights))[0]
    centre = np.full(x1 - x0, np.nan)
    centre[good] = (tops[good] + bottoms[good]) / 2
    centre[:good[0]] = centre[good[0]]
    centre[good[-1]:] = centre[good[-1]]
    centre = np.interp(np.arange(x1 - x0), np.nonzero(~np.isnan(centre))[0], centre[~np.isnan(centre)])
    centre = cv2.GaussianBlur(centre.reshape(1, -1).astype(np.float32), (0, 0), 3, borderType=cv2.BORDER_REPLICATE).ravel()
    shift = FLAG_WAVE * (centre - centre[good].mean())
    mx = max(int(np.ceil((x1 - x0) * FLAG_OVERSCAN)), 2)
    my = max(int(np.ceil((y1 - y0) * FLAG_OVERSCAN)), int(np.ceil(np.abs(shift).max())) + 2)
    box = (x0 - mx, y0 - my, x1 - x0 + 2 * mx, y1 - y0 + 2 * my)
    full = np.concatenate([np.full(mx, shift[0]), shift, np.full(mx, shift[-1])])
    green = 0.5 - full / (FLAG_WAVE_SCALE * box[3])
    if green.min() < 0 or green.max() > 1:
        print(f'POZOR: posun vlnění {np.abs(shift).max():.1f} px se nevejde do scale={FLAG_WAVE_SCALE}')
    green = np.clip(np.round(green * 255), 0, 255).astype(np.uint8)
    vlna = np.zeros((box[3], box[2], 4), np.uint8)
    vlna[..., 0] = 128
    vlna[..., 1] = green[None, :]
    vlna[..., 3] = 255
    print(f'vlnění: střednice ±{np.abs(shift).max():.1f} px, mapa {box[2]}×{box[3]}')
    return Image.fromarray(maska, 'RGBA'), Image.fromarray(stin, 'RGBA'), Image.fromarray(vlna, 'RGBA'), box


# Barevné varianty doplňku: id → (cílový odstín 0–360, násobek sytosti, násobek jasu). Přebarví se jen sytá místa; obrys, krémová a šedá zůstanou.
COLORS = {
    'cervena': (355, 1.0, 1.0),
    'oranzova': (27, 1.0, 1.05),
    'zluta': (46, 1.0, 1.15),
    'zelena': (135, 0.95, 0.95),
    'modra': (215, 1.0, 1.0),
    'fialova': (275, 0.95, 1.0),
    'ruzova': (330, 0.85, 1.25),
}


def recolor(img, hue, sat_mul, val_mul):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    rgb = a[..., :3] / 255.0
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    # sytá a dost světlá místa (barva doplňku); tmavý obrys a krémová jsou mimo
    weight = np.clip((s - 0.33) / 0.08, 0, 1) * np.clip((mx - 0.28) / 0.10, 0, 1)
    hsv = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)  # H 0–179
    new = hsv.copy()
    new[..., 0] = hue / 2.0
    new[..., 1] = np.clip(hsv[..., 1] * sat_mul * 1.12, 0, 255)
    # tmavší barvy (tmavě modrá, zelená) po změně odstínu zhnědnou: jas se mírně zvedne
    new[..., 2] = np.clip(255 * (hsv[..., 2] / 255) ** 0.6 * val_mul, 0, 255)
    shifted = cv2.cvtColor(new.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32)
    out = a.copy()
    out[..., :3] = rgb * 255 * (1 - weight[..., None]) + shifted * weight[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')


def save_webp(img, path):
    img.save(path, 'WEBP', quality=90, alpha_quality=100, method=6)


def icon_of(img):
    """Náhled doplňku samotného: oříznutý na viditelnou část a vložený do čtverce 96×96."""
    box = img.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    crop = img.crop(box)
    side = max(crop.size)
    sq = Image.new('RGBA', (side + 8, side + 8), (0, 0, 0, 0))
    sq.alpha_composite(crop, ((side + 8 - crop.width) // 2, (side + 8 - crop.height) // 2))
    return sq.resize((96, 96), Image.LANCZOS)


def main(ids):
    os.makedirs(OUT, exist_ok=True)
    base = load_base()
    frame = logo_frame(base)
    print('rám loga', frame)
    files = sorted(glob.glob(os.path.join(SRC, '*.jpg')))
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        if ids and name not in ids:
            continue
        img = np.asarray(Image.open(f).convert('RGB'))
        warped = align(base, img, hat=name in HAND)
        mask, diff = extract(base, warped, fill=name in FILL, close=CLOSE.get(name, 9), knob=name in KNOB, zone=hat_zone(frame, warped.shape) if name in HATS else None)
        out = layer(base, warped, mask, frame)
        if name in SPLIT:
            out, fixed, inner = split_cloth(out)
            save_webp(fixed, os.path.join(OUT, name + '-zaklad.webp'))
            # vlajka státu: maska plátna a stínování (look-owl.js je kreslí přes plátno, třídy s ohraničením jsou v LAYER/FLAG v look-owl.js)
            maska, stin, vlna, (bx, by, bw, bh) = flag_layers(out, inner)
            maska.save(os.path.join(OUT, name + '-maska.webp'), 'WEBP', lossless=True, method=6)
            stin.save(os.path.join(OUT, name + '-stin.webp'), 'WEBP', lossless=True, method=6)
            vlna.save(os.path.join(OUT, name + '-vlna.webp'), 'WEBP', lossless=True, method=6)
            fw, fh = out.size
            pct = lambda v, total: round(v / total * 100, 2)
            print(f'{name}: rám {fw}×{fh}, obrázek vlajky x={bx} y={by} w={bw} h={bh} → left-[{pct(bx, fw)}%] top-[{pct(by, fh)}%] w-[{pct(bw, fw)}%] h-[{pct(bh, fh)}%], aspect-[{fw}/{fh}]')
        save_webp(out, os.path.join(OUT, name + '.webp'))
        # ikony do výběru (<id>-ikona.webp) dělá scripts/owl-accessory-icons.py z vlastních obrázků doplňků
        for color, (hue, sat_mul, val_mul) in COLORS.items():
            save_webp(recolor(out, hue, sat_mul, val_mul), os.path.join(OUT, f'{name}-{color}.webp'))
        covered = int(mask.sum())
        print(f'{name}: plocha doplňku {covered} px')
        if os.environ.get('DEBUG_DIR'):
            os.makedirs(os.environ['DEBUG_DIR'], exist_ok=True)
            Image.fromarray(warped).save(os.path.join(os.environ['DEBUG_DIR'], name + '-warped.jpg'))
            Image.fromarray((mask * 255).astype(np.uint8)).save(os.path.join(os.environ['DEBUG_DIR'], name + '-mask.png'))


if __name__ == '__main__':
    main(set(sys.argv[1:]))
