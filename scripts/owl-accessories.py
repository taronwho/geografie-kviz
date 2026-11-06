# Doplňky sovy: z obrázků sovy s doplňky (branding/doplnky/<id>.jpg, generátor je překreslil na plátno 2048×2048 vždy trochu jinak)
# vyrobí průhledné vrstvy icons/doplnky/<id>.webp ve stejném rámu jako icons/logo.webp (258×320), které se v aplikaci skládají
# přes sovu. Postup: obrázek se zarovná na původní sovu (affinní ECC), rozdíl proti původní sově je doplněk, ten se vyřízne.
# Pokrývky hlavy (helma, přilba, baret) a koruna se vyřezávají po plochách ohraničených obrysem (head_object, crown_object), síťka má horní část
# jako konvexní obal (hull_top); přebarvení (recolor_layer) pracuje v Lab a zachovává stínování. Vlajka má vlastní postup (split_cloth, recolor).
# Spuštění: python3 scripts/owl-accessories.py [id ...]   (Pillow, numpy, opencv-python-headless)
# Ladění: WARP_CACHE=<složka> uloží zarovnání obrázků (pomalé) pro další běhy, DEBUG_DIR=<složka> uloží masky.
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
SHADE_MIN = 0.62
HAND = {'vlajka', 'svitek', 'brk', 'sitka'}
# Doplněk zlaté barvy na zlatém podkladu (koruna přes knoflík čepice, stuha medaile přes zlatý límec) se od původní sovy skoro neliší:
# silnější uzavření masky, ať se přebarví celý a nezůstanou zlaté kusy. Poloměr v pixelech původního obrázku.
# Doplňky, které sedí na zlatém knoflíku čepice: knoflík se do masky přidá (jinak by prosvítal zlatý uprostřed přebarveného doplňku)
KNOB = {'koruna'}
# Doplňky vyřezané po plochách (ne jen rozdílem proti sově): pokrývky hlavy po plochách ohraničených obrysem, koruna jen zlatá část
MODE = {'helma': 'hat', 'prilba': 'hat', 'baret': 'hat', 'koruna': 'crown'}
# Síťka: horní část (obruč a síť) se nahradí konvexním obalem, protože na čepici je rozdíl proti sově roztřepený
HULL = {'sitka': 0.6}
CLOSE = {'koruna': 45, 'medaile': 77, 'kvetina': 21, 'sala': 25}
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


def background_of(warped):
    """Barva pozadí obrázku doplňku (medián okraje) a vzdálenost každého pixelu od ní."""
    border_px = np.concatenate([warped[:8].reshape(-1, 3), warped[-8:].reshape(-1, 3), warped[:, :8].reshape(-1, 3), warped[:, -8:].reshape(-1, 3)])
    bgc = np.median(border_px.reshape(-1, 3), axis=0)
    return np.sqrt(((warped.astype(np.float32) - bgc) ** 2).sum(axis=2))


def regions_of(base, warped, away):
    """Rozdělení obrázku doplňku na plochy ohraničené tmavým obrysem a hlasování, čí která plocha je.
    Rozdíl proti původní sově sám o sobě nestačí: doplněk podobné barvy jako peří sovy (zlatá helma na zlatém peří) se tím vyřízne s dírami
    a naopak obočí a oušky sovy, které AI obrázek nakreslil o pár pixelů jinak, se do vrstvy dostanou jako „rozdíl“ a pak se přebarví s doplňkem.
    Plocha, jejíž většina (po odečtení posunu o pár pixelů) se od původní sovy liší, patří doplňku; plocha, která s ní splývá, je sova.
    Vrací: popisky ploch, příznak „liší se“ po pixelech, podíl odlišných pixelů v ploše, velikost plochy, plochy dotýkající se pozadí (nálepkový okraj)."""
    hsv = cv2.cvtColor(warped, cv2.COLOR_RGB2HSV)
    bg = away < 28
    outline = ((hsv[..., 2] < 95) & ~bg).astype(np.uint8)
    outline = cv2.dilate(outline, np.ones((3, 3), np.uint8))
    free = ((outline == 0) & ~bg).astype(np.uint8)
    n, labels = cv2.connectedComponents(free, connectivity=4)
    diff = np.abs(warped.astype(np.int16) - base.astype(np.int16)).max(axis=2).astype(np.uint8)
    diff = cv2.GaussianBlur(diff, (0, 0), 1.2)
    differs = cv2.erode(diff, np.ones((9, 9), np.uint8)) > 38  # nejmenší rozdíl v okolí: posun o pár pixelů nevadí
    flat = labels.ravel()
    count = np.bincount(flat, minlength=n)
    dif = np.bincount(flat, weights=differs.ravel().astype(np.float32), minlength=n)
    frac = dif / np.maximum(count, 1)
    near_bg = cv2.dilate(bg.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))) > 0
    touching = np.bincount(labels[near_bg & (labels > 0)], minlength=n) > 0
    return labels, differs, frac, count, touching, outline > 0, hsv


def head_object(base, warped, away, zone):
    """Pokrývka hlavy (helma, přilba, baret) jako celek ploch: vrací masku doplňku a masku „sova“ (plochy sovy uvnitř masky, které se nesmí přebarvit).
    Doplněk = plochy, které se liší od sovy, jejich obrys a nálepkový okraj kolem nich; v ploše výchozí čepice (zone) se navíc převezme vše,
    protože výchozí čepice se tam skrývá maskou a hlava sovy se musí vzít z tohoto obrázku."""
    labels, differs, frac, count, touching, outline, hsv = regions_of(base, warped, away)
    bg = away < 28
    acc_label = (frac > 0.5) & (count >= 12) & ~touching  # plocha dotýkající se pozadí je nálepkový okraj kolem všeho (i sovy): o něm rozhoduje halo níže
    acc_label[0] = False
    owl_label = (frac <= 0.5) & ~touching & (count >= 12)
    owl_label[0] = False
    body = acc_label[labels]
    owl = owl_label[labels]
    # obrys doplňku: tmavé pixely těsně u jeho ploch (obrys sovy uvnitř ploch sovy se nebere)
    near_body = cv2.dilate(body.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19))) > 0
    line = outline & near_body & ~bg
    # nálepkový okraj: odlišné pixely v okolí doplňku, které nepatří ploše sovy
    ring = cv2.dilate((body | line).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0
    halo = ring & differs & ~bg & ~owl & (hsv[..., 2] > 150)  # světlé (krémové) pixely; ztmavlý lem na přechodu do pozadí se nebere
    keep = body | line | halo
    if zone is not None:
        keep |= (zone > 0) & ~bg
    keep = keep.astype(np.uint8)
    keep = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    owl = owl & (keep > 0)
    return keep, owl.astype(np.uint8)


def crown_object(base, warped, away):
    """Koruna: jen zlaté plochy, které se liší od sovy (tělo a kuličky koruny), jejich obrys a okraj. Čepice pod korunou zůstává ta výchozí
    (koruna sedí na ní), proto se vínová čepice z obrázku koruny do vrstvy nikdy nedostane; zlatý knoflík čepice se přikryje korunou."""
    labels, differs, frac, count, touching, outline, hsv = regions_of(base, warped, away)
    h, s, v = hsv[..., 0].astype(np.int16), hsv[..., 1].astype(np.int16), hsv[..., 2].astype(np.int16)
    gold = ((h >= 12) & (h <= 34) & (s > 110) & (v > 130)).astype(np.float32)
    # zlatý knoflík výchozí čepice (nahoře uprostřed sovy): zlatá koruna na něm sedí a od něj se téměř neliší, proto se o ní nerozhoduje podle rozdílu
    hsv_b = cv2.cvtColor(base, cv2.COLOR_RGB2HSV)
    x0, y0, x1, y1, _ = owl_bbox(base)
    top = np.zeros(base.shape[:2], bool)
    top[y0:y0 + int((y1 - y0) * 0.14), x0:x1] = True
    knob = top & (hsv_b[..., 0] >= 15) & (hsv_b[..., 0] <= 28) & (hsv_b[..., 1] > 130) & (hsv_b[..., 2] > 140)
    knob = cv2.dilate(knob.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    flat = labels.ravel()
    count_gold = np.bincount(flat, weights=gold.ravel(), minlength=len(count))
    on_knob = np.bincount(flat, weights=knob.ravel().astype(np.float32), minlength=len(count)) > 20
    gold_label = (count_gold / np.maximum(count, 1) > 0.5) & ((frac > 0.5) | on_knob) & (count >= 40)
    gold_label[0] = False
    body = gold_label[labels]
    bg = away < 28
    maroon = ((h >= 160) | (h <= 8)) & (s > 110) & (v < 200)
    near_body = cv2.dilate(body.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19))) > 0
    line = outline & near_body & ~bg
    ring = cv2.dilate((body | line).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0
    # nálepkový okraj koruny: krémové pixely kolem ní (vínová čepice a její obrys se nebere)
    cream = (v > 170) & (s < 150)
    halo = ring & cream & ~bg & ~maroon
    keep = (body | line | halo)
    # knoflík pod korunou se přikryje pixely z obrázku (vínová čepice se nepřebarvuje, viz protect)
    keep = (keep | knob) & ~bg
    keep = cv2.morphologyEx(keep.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    protect = (keep > 0) & maroon
    return keep, protect.astype(np.uint8)


def hull_top(keep, away, warped, top=0.6):
    """Síťka: obruč a síť jsou elipsa, kterou doplněk překrývá čepici, takže rozdíl proti sově je na jejím okraji roztřepený (díry v oku sítě).
    Horní část největší plochy (podíl `top` její výšky) se proto nahradí konvexním obalem (bez vínových pixelů čepice, které obal zachytí);
    dolní část (tyčka) se uzavře svisle, protože zlatá tyčka na zlatém peří sovy se od ní skoro neliší a vyřez je děravý."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(keep, 8)
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    comp = labels == biggest
    ys, xs = np.nonzero(comp)
    ycut = ys.min() + int((ys.max() - ys.min()) * top)
    sel = ys <= ycut
    pts = np.stack([xs[sel], ys[sel]], axis=1).astype(np.int32)
    hull = np.zeros_like(keep)
    cv2.fillConvexPoly(hull, cv2.convexHull(pts), 1)
    hull[ycut:, :] = 0
    hsv = cv2.cvtColor(warped, cv2.COLOR_RGB2HSV).astype(np.int16)
    maroon = ((hsv[..., 0] >= 160) | (hsv[..., 0] <= 8)) & (hsv[..., 1] > 110) & (hsv[..., 2] >= 100) & (hsv[..., 2] < 200)  # plochy čepice; tmavý obrys obruče zůstává
    out = np.where((hull > 0) & (away >= 28) & ~maroon, 1, keep).astype(np.uint8)
    lower = out.copy()
    lower[:ycut, :] = 0
    lower = cv2.morphologyEx(lower, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 121)))
    lower = np.where(away >= 28, lower, 0)
    out[ycut:, :] = lower[ycut:, :]
    return out


def extract(base, warped, fill=False, border=BORDER, close=9, knob=False, zone=None, hull=None, mode=None):
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
    away = background_of(warped)
    keep = np.where(away < 28, 0, keep).astype(np.uint8)
    protect = np.zeros_like(keep)
    if mode == 'hat':
        keep, protect = head_object(base, warped, away, zone)
    elif mode == 'crown':
        keep, protect = crown_object(base, warped, away)
    elif zone is not None:
        # místo čepice: vše, co obrázek doplňku v této ploše kreslí (hlava sovy, helma), se převezme; mimo ni jen rozdíl
        keep = np.where((zone > 0) & (away >= 28), 1, keep).astype(np.uint8)
    if hull is not None:
        keep = hull_top(keep, away, warped, hull)
    if fill:
        # vyplnění děr: co není vnějšek, je doplněk
        inv = (1 - keep).astype(np.uint8)
        flood = inv.copy()
        h, w = flood.shape
        ff = np.zeros((h + 2, w + 2), np.uint8)
        cv2.floodFill(flood, ff, (0, 0), 2)
        keep = ((flood != 2)).astype(np.uint8)
    return keep, diff, protect


def bleed_colors(rgb, mask, reach=5):
    """Pixely těsně vně masky dostanou barvu nejbližšího pixelu uvnitř: měkký okraj průhlednosti pak nemíchá barvu doplňku s tmavým pozadím obrázku
    (jinak by kolem doplňku zůstal tmavý až šedý lem, který se při přebarvení ukáže)."""
    inside = mask > 0
    dist, labels = cv2.distanceTransformWithLabels((~inside).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(inside)
    out = rgb.copy()
    fix = (~inside) & (dist <= reach)
    idx = labels[fix] - 1
    out[fix] = rgb[ys[idx], xs[idx]]
    return out


def layer(base, warped, mask, frame, border=BORDER, protect=None, bleed=False):
    """Vrstva doplňku v rámu loga. S `protect` (plochy sovy ve vrstvě, které se nesmí přebarvit) vrací i jeho výřez stejné velikosti (0–255)."""
    x0, y0, w, h = frame
    l, r, t, b = (int(round(PAD[k] * (w if k in 'lr' else h))) for k in 'lrtb')
    x0, y0 = x0 + border, y0 + border
    m = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.0)
    alpha = np.clip(alpha * 1.4, 0, 1)
    alpha = np.where(alpha < 0.16, 0, alpha)  # slabé zbytky rozdílu (stíny, obrys původní čepice) se zahodí
    color = warped
    if bleed:
        sl = (slice(y0 - t, y0 + h + b), slice(x0 - l, x0 + w + r))
        color = warped.copy()
        color[sl] = bleed_colors(warped[sl], mask[sl])
    rgba = np.dstack([color.astype(np.float32), alpha * 255]).astype(np.uint8)
    crop = rgba[y0 - t:y0 + h + b, x0 - l:x0 + w + r]
    img = Image.fromarray(crop, 'RGBA')
    k = LOGO_SIZE[0] / w
    size = (round(crop.shape[1] * k), round(crop.shape[0] * k))
    img = img.resize(size, Image.LANCZOS)
    if protect is None:
        return img
    pr = cv2.GaussianBlur(protect.astype(np.float32), (0, 0), 1.0)
    pcrop = (np.clip(pr * 255, 0, 255).astype(np.uint8))[y0 - t:y0 + h + b, x0 - l:x0 + w + r]
    return img, np.asarray(Image.fromarray(pcrop, 'L').resize(size, Image.LANCZOS))


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
    cloth = cv2.dilate(cloth, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    cloth_a, base_a = a.copy(), a.copy()
    cloth_a[..., 3] = np.where(cloth > 0, a[..., 3], 0)
    base_a[..., 3] = np.where(cloth > 0, 0, a[..., 3])
    return Image.fromarray(cloth_a, 'RGBA'), Image.fromarray(base_a, 'RGBA'), inner


def flag_layers(cloth_img, inner):
    """Maska a stínování pro vlajku státu na plátně (vlajka-maska.webp, vlajka-stin.webp; stejný rám jako ostatní vrstvy).
    Maska = vnitřek plátna (alfa), obrys zůstane z barevné vrstvy. Stínování = odstíny šedi z jasu původního modrého plátna
    (vlnění látky), které se na vlajku násobí (mix-blend-multiply): nejsvětlejší místo je bez změny, nejtmavší se ztmaví jen mírně.
    Vrací obrázky a ohraničení vnitřku (x, y, šířka, výška) v pixelech vrstvy."""
    alpha = cv2.GaussianBlur(inner.astype(np.float32), (0, 0), 0.8)
    alpha = np.clip(alpha, 0, 1)
    rgb = np.asarray(cloth_img.convert('RGB')).astype(np.float32) / 255.0
    luma = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    inside = inner > 0
    lo, hi = np.percentile(luma[inside], [3, 80])
    level = np.clip((luma - lo) / max(hi - lo, 1e-3), 0, 1)
    level = cv2.GaussianBlur(level, (0, 0), 1.0)
    shade = SHADE_MIN + (1 - SHADE_MIN) * level
    gray = np.clip(shade * 255, 0, 255).astype(np.uint8)
    stin = np.dstack([gray, gray, gray, (alpha * 255).astype(np.uint8)])
    maska = np.dstack([np.full_like(gray, 255)] * 3 + [(alpha * 255).astype(np.uint8)])
    ys, xs = np.nonzero(inside)
    # obdélník o pixel širší na každé straně: měkký okraj masky se nesmí o obrázek vlajky opřít
    box = (int(xs.min()) - 1, int(ys.min()) - 1, int(xs.max() - xs.min() + 3), int(ys.max() - ys.min() + 3))
    return Image.fromarray(maska, 'RGBA'), Image.fromarray(stin, 'RGBA'), box


# Barevné varianty doplňku: id → (cílový odstín 0–360, násobek sytosti, násobek jasu). Přebarví se jen sytá místa; obrys, krémová a šedá zůstanou.
COLORS = {
    'cervena': (355, 1.0, 1.0),
    'oranzova': (27, 1.0, 1.05),
    'zluta': (46, 1.0, 1.15),
    'zelena': (135, 0.95, 0.95),
    'modra': (215, 1.0, 1.0),
    'fialova': (275, 0.95, 1.0),
    'ruzova': (330, 0.85, 1.25),
    'cerna': (0, 0.0, 0.3),  # bez sytosti, tmavá: stínování zůstane
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


# Přebarvení vrstev doplňků (vše mimo vlajku, která má vlastní plátno a používá recolor výše). Pracuje v prostoru Lab: zachová světlost (stínování,
# lesk), změní odstín a chroma celé škály doplňku (ne jen úzkého pásma původního odstínu, takže nezůstanou zbytky původní barvy ve stínech a světlech).
# Neutrální plochy (bílá, šedá, krémová) se kolorují jen u doplňků ve slovníku TINT (síla 0–1), ať je volba barvy znatelná i u bílého kníru,
# šedého mikrofonu a krémového papíru; tmavý obrys a krémový nálepkový okraj kolem doplňku zůstávají vždy.
# id → (odstín v Lab 0–360, násobek chroma, posun světlosti, násobek světlosti)
LAB_COLORS = {
    'cervena': (38, 1.2, 0, 0.84),
    'oranzova': (68, 1.05, 0, 0.95),
    'zluta': (90, 1.1, 14, 1.08),
    'zelena': (142, 1.0, 0, 0.92),
    'modra': (268, 1.05, 0, 0.95),
    'fialova': (312, 1.0, 0, 0.95),
    'ruzova': (350, 0.85, 10, 1.0),
    'cerna': None,  # bez chroma a tmavší: stínování zůstane
}
TINT = {'knir': 1.0, 'mikrofon': 1.0, 'metr': 0.7, 'brk': 1.2, 'svitek': 0.6, 'kompas': 0.65, 'sitka': 0.5, 'lab-bryle': 0.9}
# Z nich krémový papír, brk a síť se koloruje celý (krémová je jejich plocha); u ostatních zůstává krémová vždy (nálepkový okraj, bílá nenasycená)
CREAM_TINT = {'brk', 'svitek', 'kompas', 'sitka', 'lab-bryle'}
TINT_DEFAULT = 0.0
# Doplňky s tmavou výplní (inkoust v kalamáři): tlustá tmavá plocha (ne tenký obrys) se přebarví také
DARKFILL = {'brk'}


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def border_zone(lab, alpha):
    """Krémový nálepkový okraj kolem doplňku: světlé nenasycené pixely, které souvisí s vnějškem do vzdálenosti několika pixelů
    (tmavý obrys za ním leží). Včetně přechodu k obrysu (rozpité pixely by se jinak přebarvily na šedomodrý lem)."""
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    cand = (L > 78) & (C < 46)
    reach = (alpha < 0.08).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    for _ in range(7):
        reach = cv2.dilate(reach, kernel) & (cand | (alpha < 0.08)).astype(np.uint8)
    zone = (reach > 0) & cand
    zone = cv2.dilate(zone.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    return cv2.GaussianBlur(zone.astype(np.float32), (0, 0), 0.8)


def gamut_clip(L, C, hue_rad, active=None):
    """Lab (L, chroma, odstín) → RGB 0–1; chroma se u pixelů mimo gamut zmenšuje, dokud se nevejdou (odstín a světlost zůstanou).
    Počítá se jen v místech `active` (zbytek je černý), ať je přebarvení rychlé."""
    shape = L.shape
    act = np.ones(shape, bool) if active is None else active
    Lf, Cf, Hf = L[act], C[act], hue_rad[act]
    out = np.zeros((Lf.size, 3), np.float32)
    done = np.zeros(Lf.size, bool)
    for f in (1.0, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0.0):
        lab = np.stack([Lf, Cf * f * np.cos(Hf), Cf * f * np.sin(Hf)], axis=-1).astype(np.float32).reshape(-1, 1, 3)
        rgb = cv2.cvtColor(lab, cv2.COLOR_Lab2RGB).reshape(-1, 3)
        ok = (rgb.min(-1) >= -0.003) & (rgb.max(-1) <= 1.003) & ~done
        out[ok] = rgb[ok]
        done |= ok
    full = np.zeros(shape + (3,), np.float32)
    full[act] = np.clip(out, 0, 1)
    return full


def recolor_layer(img, name, color, protect=None):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    alpha = a[..., 3] / 255.0
    rgb = a[..., :3] / 255.0
    lab = cv2.cvtColor(rgb.astype(np.float32), cv2.COLOR_RGB2Lab)
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(A, B)
    keep_out = border_zone(lab, alpha) if name not in CREAM_TINT else np.zeros_like(L)  # krémový papír, brk a síť se koloruje celý, i s okrajem
    if protect is not None:
        keep_out = np.maximum(keep_out, protect.astype(np.float32) / 255.0)
    free = 1 - keep_out
    tint = TINT.get(name, TINT_DEFAULT)
    # barevná místa: kdekoli je znatelné chroma; tmavý obrys (L pod ~20) a krémová/bílá (světlá, málo chroma) ne
    cream = smooth(L, 76, 84) * smooth(C, 10, 16) * (1 - smooth(C, 40, 50))
    colored = smooth(C, 13, 28) * smooth(L, 14, 25) * (1 - cream * (name not in CREAM_TINT)) * free
    # neutrální a krémové plochy (bílá, šedá, papír): kolorují se jen u doplňků v TINT (síla nad 1 přidává i na chroma)
    neutral = (1 - colored) * smooth(L, 26, 42) * free * min(1.0, tint) * (1 - cream * (name not in CREAM_TINT))
    Lm = L
    if name in DARKFILL:
        # tlustá tmavá plocha (inkoust): po otevření zůstane jen výplň, tenký obrys zmizí
        dark = (L < 34).astype(np.uint8)
        fill = cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
        fill = cv2.GaussianBlur(fill.astype(np.float32), (0, 0), 1.2) * free
        neutral = np.maximum(neutral, fill * (1 - colored))
        Lm = L + fill * 16
    act = (colored + neutral) > 0.003
    if LAB_COLORS[color] is None:
        # černá: bez chroma, tmavší; bílé a krémové plochy kolorovaných doplňků ztmavnou na šedou (bílý knír → šedý, ale stále s leskem)
        col_rgb = gamut_clip(5 + 0.52 * Lm, C * 0.0, 0 * L, act)
        neu_rgb = gamut_clip(8 + 0.5 * Lm + 14 * smooth(Lm, 75, 95), C * 0.0, 0 * L, act)
    else:
        hue, gain, d_l, m_l = LAB_COLORS[color]
        h = np.full_like(L, np.deg2rad(hue))
        hi = smooth(Lm, 70, 95)  # světla (lesk) se neztmavují
        # tmavé barvy (tmavě modrý obrys brýlí, hnědý řemínek) se mírně zesvětlí, ať je v nich barva vidět
        new_L = np.clip(Lm * m_l + (Lm - Lm * m_l) * hi + d_l * smooth(Lm, 20, 60) * (1 - hi) + 9 * (1 - smooth(Lm, 22, 52)) * smooth(Lm, 14, 24), 0, 100)
        # nenasycené barvy (šedomodrý motýlek) dostanou aspoň střední chroma, ať je zvolená barva vždy znatelná
        floor = 34 * (0.55 + 0.45 * smooth(Lm, 28, 60)) * min(gain, 1.0)
        col_rgb = gamut_clip(new_L, np.maximum(C * gain, floor), h, act)
        # neutrální plochy: pastelová až středně sytá barva podle světlosti (bílá jen jemně, šedá výrazněji)
        ct = (20 + 30 * np.clip((92 - Lm) / 50, 0, 1)) * gain * max(1.0, tint)
        neu_rgb = gamut_clip(new_L, ct, h, act)
    out = rgb * (1 - colored[..., None]) + col_rgb * colored[..., None]
    out = out * (1 - neutral[..., None]) + neu_rgb * neutral[..., None]
    res = np.dstack([np.clip(out * 255, 0, 255), a[..., 3]]).astype(np.uint8)
    return Image.fromarray(res, 'RGBA')


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
        cache = os.path.join(os.environ['WARP_CACHE'], name + '.npy') if os.environ.get('WARP_CACHE') else None  # jen pro ladění: zarovnání je pomalé
        if cache and os.path.exists(cache):
            warped = np.load(cache)
        else:
            warped = align(base, img, hat=name in HAND)
            if cache:
                os.makedirs(os.path.dirname(cache), exist_ok=True)
                np.save(cache, warped)
        mask, diff, protect = extract(base, warped, fill=name in FILL, close=CLOSE.get(name, 9), knob=name in KNOB, zone=hat_zone(frame, warped.shape) if name in HATS else None,
                                      hull=HULL.get(name), mode=MODE.get(name))
        out, protect_layer = layer(base, warped, mask, frame, protect=protect, bleed=name not in SPLIT)
        if name in SPLIT:
            out, fixed, inner = split_cloth(out)
            save_webp(fixed, os.path.join(OUT, name + '-zaklad.webp'))
            # vlajka státu: maska plátna a stínování (look-owl.js je kreslí přes plátno, třídy s ohraničením jsou v LAYER/FLAG v look-owl.js)
            maska, stin, (bx, by, bw, bh) = flag_layers(out, inner)
            maska.save(os.path.join(OUT, name + '-maska.webp'), 'WEBP', lossless=True, method=6)
            stin.save(os.path.join(OUT, name + '-stin.webp'), 'WEBP', lossless=True, method=6)
            fw, fh = out.size
            pct = lambda v, total: round(v / total * 100, 2)
            print(f'{name}: rám {fw}×{fh}, vnitřek plátna x={bx} y={by} w={bw} h={bh} → left-[{pct(bx, fw)}%] top-[{pct(by, fh)}%] w-[{pct(bw, fw)}%] h-[{pct(bh, fh)}%], aspect-[{fw}/{fh}]')
        save_webp(out, os.path.join(OUT, name + '.webp'))
        # ikony do výběru (<id>-ikona.webp) dělá scripts/owl-accessory-icons.py z vlastních obrázků doplňků
        for color, (hue, sat_mul, val_mul) in COLORS.items():
            recolored = recolor(out, hue, sat_mul, val_mul) if name in SPLIT else recolor_layer(out, name, color, protect_layer)
            save_webp(recolored, os.path.join(OUT, f'{name}-{color}.webp'))
        covered = int(mask.sum())
        print(f'{name}: plocha doplňku {covered} px')
        if os.environ.get('DEBUG_DIR'):
            os.makedirs(os.environ['DEBUG_DIR'], exist_ok=True)
            Image.fromarray(warped).save(os.path.join(os.environ['DEBUG_DIR'], name + '-warped.jpg'))
            Image.fromarray((mask * 255).astype(np.uint8)).save(os.path.join(os.environ['DEBUG_DIR'], name + '-mask.png'))
            Image.fromarray(protect_layer).save(os.path.join(os.environ['DEBUG_DIR'], name + '-protect.png'))


if __name__ == '__main__':
    main(set(sys.argv[1:]))
