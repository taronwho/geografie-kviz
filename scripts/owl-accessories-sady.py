# Varianta scripts/owl-accessories.py pro sady doplňků k tématům (docs/OBRAZKY.md oddíl 13, branding/doplnky/<id>.jpg ze SETS): souběžně
# vznikla s úpravami pro sezónní doplňky, proto je samostatně. Spuštění stejné jako u owl-accessories.py, jen s id ze sad.
# Doplňky sovy: z obrázků sovy s doplňky (branding/doplnky/<id>.jpg, generátor je překreslil na plátno 2048×2048 vždy trochu jinak)
# vyrobí průhledné vrstvy icons/doplnky/<id>.webp ve stejném rámu jako icons/logo.webp (258×320), které se v aplikaci skládají
# přes sovu. Postup: obrázek se zarovná na původní sovu (affinní ECC), rozdíl proti původní sově je doplněk, ten se vyřízne.
# Pokrývky hlavy (helma, přilba, baret) a koruna se vyřezávají po plochách ohraničených obrysem (head_object, crown_object), síťka má horní část
# jako konvexní obal (hull_top); přebarvení (recolor_layer) pracuje v Lab a zachovává stínování. Vlajka má vlastní postup (split_cloth, recolor).
# Spuštění: python3 scripts/owl-accessories.py [id ...]   (Pillow, numpy, opencv-python-headless)
# Sova bez monoklu: python3 scripts/owl-accessories.py --logo vyrobí icons/logo-bez-monoklu.webp (z branding/sova-bez-monoklu.jpg, viz monocle_free)
# a ikonu volby Monokl icons/doplnky/monokl-ikona.webp; barvy obleku loga bez monoklu pak dělá scripts/owl-robes.py.
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
# Sova bez monoklu (generátor ji překreslil celou, proto se z ní bere jen okolí očí, viz monocle_free)
NOMONO = os.path.join(ROOT, 'branding', 'sova-bez-monoklu.jpg')
LOGO = os.path.join(ROOT, 'icons', 'logo.webp')
LOGO_NOMONO = os.path.join(ROOT, 'icons', 'logo-bez-monoklu.webp')
# Obrázky doplňků, na kterých generátor sově monokl vynechal: rozdíl se počítá proti sově bez monoklu, jinak by holé oko a peří
# v místě monoklu byly součástí vrstvy (a překryly by monokl i tomu, kdo ho s doplňkem nosí)
NO_MONOCLE = {'zlaty-retez', 'srdickove-bryle', 'hulka', 'hrnek', 'mec', 'maska', 'stetoskop', 'plast', 'letecke-bryle', 'pochoden', 'vencek'}
# Levé oko (bez monoklu) se bere také ze sovy bez monoklu, ať mají obě oči stejnou kresbu: elipsa v podílu rámu loga (střed x, y, poloosy)
LEFT_EYE = (0.415, 0.457, 0.115, 0.07)
LOGO_SIZE = (258, 320)
# Vrstva má rám loga rozšířený o okraje (koruna, sluchátka a lupa přesahují obrys sovy): podíl šířky/výšky loga
PAD = {'l': 0.34, 'r': 0.22, 't': 0.26, 'b': 0.12}
# Doplňky v obličeji zakrývají i oči a monokl pod sebou, proto se jejich plocha vyplní celá (bez děr)
FILL = {'bryle', 'slunecni-bryle', 'koruna', 'lab-bryle', '3d-bryle', 'helma', 'prilba', 'baret',
        'kouzelnicky-klobouk', 'piratsky-klobouk', 'vrtulka', 'cylindr', 'paska', 'letecke-bryle', 'srdickove-bryle', 'maska'}
# Doplňky v ruce posunou na obrázku celou sovu (obdélník sovy zahrnuje i předmět): zarovná se podle čepice a hlavy
# Doplňky, které nahrazují čepici: v místě, kde byla výchozí čepice (icons/logo-maska.webp, scripts/owl-hat-mask.py), se přebírá i hlava sovy z obrázku doplňku
HATS = {'helma', 'prilba', 'baret', 'kouzelnicky-klobouk', 'piratsky-klobouk', 'vrtulka', 'cylindr'}
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
# Doplňky v ruce, které ruku kreslí jinak než výchozí sova se vztyčeným prstem (hrnek drží níž, hůlku, meč a pochodeň pěstí): výchozí ruka
# se v aplikaci skryje maskou (icons/logo-maska-ruka.webp, scripts/owl-hat-mask.py; hidesHand v look.js) a v její ploše se z obrázku doplňku
# převezme celá nová ruka (jako hlava u HATS)
HAND_POSE = {'hrnek', 'hulka', 'mec', 'pochoden'}
# Doplňky, ve kterých nesmí zůstat vínová plocha obleku nebo čepice z obrázku (nad rukávem u nové ruky, čepice pod svatozáří): v jiné barvě
# obleku (look-robes.js) by tam zůstala vínová skvrna; vínová (fialově červená) místa se z vrstvy vynechají a je vidět oblek sovy pod ní
ROBE_FREE = {'hrnek', 'hulka', 'mec', 'pochoden', 'svatozar'}
# Doplňky, které obdélník sovy rozšíří do strany (plášť vlaje za ramenem): zarovná se také podle čepice a hlavy
WIDE = {'plast'}
# Doplňky s tmavou plochou skoro v barvě pozadí (černý klobouk, cylindr, páska přes oko, tmavá skla brýlí): za pozadí se bere jen tmavá plocha
# souvislá s okrajem obrázku, uzavřená tmavá plocha uvnitř obrysu patří doplňku
OUTER_BG = {'piratsky-klobouk', 'cylindr', 'paska', 'srdickove-bryle'}
# Doplňky se zářivou svatozáří kolem sebe (svatozář, plamen pochodně, hvězda hůlky): záře je v obrázku namíchaná do tmavého pozadí, ve vrstvě
# se z ní stane poloprůhledná barva záře (glow_alpha), jinak by na světlém pozadí byla špinavě hnědá. id → barva záře (RGB)
GLOW = {'svatozar': (255, 214, 120), 'pochoden': (255, 176, 72), 'hulka': (255, 222, 130)}
# Z nich předmět v ruce (hůlka, pochodeň) má i tmavá místa skoro v barvě pozadí (dřevo hůlky): pevná část je celá maska doplňku kromě
# pixelů, které nad pozadím přesně odpovídají záři (glow_alpha, solid_all). U svatozáře je pevná jen výrazná část (kruh a jiskry).
GLOW_SOLID = {'hulka', 'pochoden'}
# Doplňky, které přesahují rám vrstvy doprava (cíp pláště): část za hranou rámu se vodorovně stlačí, ať se neusekne
SQUEEZE = {'plast'}
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
# Sady doplňků k tématům (č. 177–204, docs/OBRAZKY.md oddíl 13): obrázky 1024 × 1024 s průhledným pozadím (uložené na tmavé pozadí
# #2d3034 a uložené jako JPEG), sova je na nich vždy bez monoklu. Obdélník sovy mění klobouk i předmět v ruce, proto se zarovnávají podle
# významných bodů (SIFT_ALIGN: SIFT + RANSAC podobnost, pak ECC jen v ploše sovy bez doplňku).
SETS = {'cestovatelsky-klobouk', 'globus', 'namornicka-cepice', 'praporky', 'krejzlik', 'blesk', 'zlate-rouno', 'hnizdo', 'dalekohled',
        'kladivko', 'krystal', 'banka', 'vybuch', 'magnet', 'jablko', 'paleta', 'dali-knir', 'plany', 'tesarska-tuzka', 'hvezdne-bryle',
        'kytara', 'knihy', 'pulmesicove-bryle', 'popcorn', 'filmovy-pas', 'pistalka', 'pohar'}
NO_MONOCLE |= SETS
SIFT_ALIGN = set(SETS)
HATS |= {'cestovatelsky-klobouk', 'namornicka-cepice', 'hnizdo', 'knihy'}
FILL |= {'cestovatelsky-klobouk', 'namornicka-cepice'}
# Místo každého kusu sady: hlava se ořízne pod úrovní očí, obličej pod zobákem, nic mimo ruku nesmí zasahovat do zvednuté ruky (deghost, clip_set)
SET_SLOT = {**{i: 'head' for i in ('cestovatelsky-klobouk', 'namornicka-cepice', 'hnizdo', 'vybuch', 'jablko', 'tesarska-tuzka', 'knihy')},
            **{i: 'face' for i in ('dali-knir', 'hvezdne-bryle', 'pulmesicove-bryle')},
            **{i: 'neck' for i in ('praporky', 'krejzlik', 'zlate-rouno', 'dalekohled', 'krystal', 'kytara', 'filmovy-pas', 'pistalka')},
            **{i: 'hand' for i in ('globus', 'blesk', 'kladivko', 'banka', 'magnet', 'paleta', 'plany', 'popcorn', 'pohar')}}
CLIP_BOTTOM = {'head': 0.42, 'face': 0.66}
# Tenké zlaté obroučky a řetízek půlměsícových brýlí mají barvu peří kolem očí: deghost by je smazal, stačí oříznutí
NO_DEGHOST = {'pulmesicove-bryle', 'dali-knir', 'hvezdne-bryle', 'tesarska-tuzka', 'kladivko'}
# Zlatá kytara a krémový filmový pás mají barvu peří a límce: duchové se hledají jen s menší tolerancí
DEGHOST_TOL = {'kytara': 20, 'filmovy-pas': 20}
# Shora (obličej: nad obočím) a zleva (kladívko: druhá ruka je vpravo) v podílu rámu loga
CLIP_TOP = {'face': 0.28}
CLIP_LEFT = {'kladivko': 0.40}
# Kouř po výbuchu je nad výchozí čepicí, překreslená čepice z obrázku se nebere (vínové čáry by v jiné barvě obleku zůstaly)
ON_CAP = {'vybuch'}
# Nová ruka drží předmět (pravá ruka se vztyčeným prstem se skryje); kladívko drží druhá ruka, prst zůstává
HAND_POSE |= {'globus', 'blesk', 'banka', 'magnet', 'paleta', 'plany', 'popcorn', 'pohar'}
ROBE_FREE |= {'globus', 'blesk', 'banka', 'magnet', 'paleta', 'plany', 'popcorn', 'pohar', 'kladivko', 'kytara', 'vybuch', 'jablko', 'tesarska-tuzka'}
# Části doplňku, které se nepřebarví (popcorn, barvy na paletě…): odstín v Lab od–do (stupně) a nejmenší chroma; přidají se k protect
PROTECT_HUE = {'popcorn': (40, 110, 14), 'kladivko': (40, 100, 12)}
# Zlatý předmět v nové ruce: jasně žluté plochy nejsou peří ruky (hand_pixels bright), přebarví se
GOLD_ITEM = {'blesk', 'pohar'}
# Doplňky sad s pevnou částí: vše, co se nepřebarvuje (protect: nová ruka sovy, PROTECT_HUE), se uloží i do <id>-zaklad.webp, která se v aplikaci
# kreslí nad barevnou vrstvou (fixed v look.js), takže vlastní barva z palety (CSS hue-rotate celé vrstvy) ruku ani pevnou část neotočí
FIXED_SPLIT = (HAND_POSE & SETS) | set(PROTECT_HUE)


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


def sift_warp(base, img):
    """Počáteční zarovnání podle významných bodů (SIFT, RANSAC podobnost): zobrazení img → base (2 × 3) a podíl shodných bodů.
    Doplněk (klobouk, předmět v ruce) obdélník sovy rozšíří, body na sově samotné ale zůstávají."""
    sift = cv2.SIFT_create(6000)
    gb = cv2.cvtColor(base, cv2.COLOR_RGB2GRAY)
    gi = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    kb, db = sift.detectAndCompute(gb, None)
    ki, di = sift.detectAndCompute(gi, None)
    pairs = cv2.BFMatcher(cv2.NORM_L2).knnMatch(di, db, k=2)
    good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
    src = np.float32([ki[m.queryIdx].pt for m in good])
    dst = np.float32([kb[m.trainIdx].pt for m in good])
    warp, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3.0, maxIters=5000, confidence=0.999)
    print(f'  SIFT: {int(inliers.sum())} / {len(good)} shodných bodů')
    return warp.astype(np.float32)


def align(base, img, border=BORDER, hat=False, sift=False):
    """Zarovná img (2048²) na souřadnice base; vrátí obraz o rozměru base."""
    if sift:
        return align_sift(base, img, border)
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


def align_sift(base, img, border=BORDER):
    """Zarovnání obrázku sady (SIFT_ALIGN): počáteční odhad z významných bodů, upřesnění ECC jen v místech, kde se obrázek po odhadu
    s původní sovou shoduje (doplněk a místo, kde sova změnila ruku nebo čepici, se do upřesnění nepočítají)."""
    fwd = sift_warp(base, img)  # img → base
    h, w = base.shape[:2]
    first = cv2.warpAffine(img, fwd, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    diff = np.abs(first.astype(np.int16) - base.astype(np.int16)).max(axis=2)
    away = background_of(base) >= 28
    agree = ((diff < 40) & away).astype(np.uint8)
    agree = cv2.erode(agree, np.ones((5, 5), np.uint8))
    inv = cv2.invertAffineTransform(fwd)  # base → img
    # ECC na zmenšených obrázcích stejné velikosti: obrázek se nejdřív přenese odhadem SIFT, ECC najde jen malou opravu C
    # (zmenšená base → přenesený obrázek); celkem base → img: inv ∘ (1/k) ∘ C ∘ k
    k = 0.5
    size_small = (int(w * k), int(h * k))
    fwd_small = fwd * k
    pre = cv2.warpAffine(img, fwd_small, size_small, flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
    g_base = cv2.GaussianBlur(cv2.cvtColor(cv2.resize(base, size_small, interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY), (0, 0), 1.0).astype(np.float32)
    g_pre = cv2.GaussianBlur(cv2.cvtColor(pre, cv2.COLOR_RGB2GRAY), (0, 0), 1.0).astype(np.float32)
    mask_small = cv2.resize(agree, size_small, interpolation=cv2.INTER_NEAREST)
    corr = np.eye(2, 3, dtype=np.float32)
    try:
        crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-7)
        _, corr = cv2.findTransformECC(g_base, g_pre, corr.copy(), cv2.MOTION_AFFINE, crit, mask_small, 5)
    except cv2.error as error:
        print('  ECC selhalo, použit odhad SIFT:', str(error).strip().splitlines()[-1])
        corr = np.eye(2, 3, dtype=np.float32)
    # oprava má být malá (odhad SIFT je přesný na pár pixelů); velký skok znamená, že ECC uteklo
    if np.abs(corr[:, 2]).max() > 12 or np.abs(corr[:, :2] - np.eye(2)).max() > 0.02:
        print('  ECC oprava příliš velká, použit odhad SIFT')
        corr = np.eye(2, 3, dtype=np.float32)
    refined = np.zeros((2, 3), np.float32)
    refined[:, :2] = inv[:, :2] @ corr[:, :2]
    refined[:, 2] = inv[:, :2] @ corr[:, 2] / k + inv[:, 2]
    print(f'  ECC oprava: posun {corr[0, 2] / k:.1f}, {corr[1, 2] / k:.1f} px')
    ext = refined.copy()
    ext[:, 2] = refined[:, 2] - refined[:, :2] @ np.array([border, border], np.float32)
    size = (w + 2 * border, h + 2 * border)
    return cv2.warpAffine(img, ext, size, flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)


def hat_zone(frame, shape, border=BORDER, mask='logo-maska.webp'):
    """Plocha výchozí čepice (nebo s mask='logo-maska-ruka.webp' zvednuté ruky) v souřadnicích rozšířeného plátna (z masky loga)."""
    x0, y0, w, h = frame
    m = np.asarray(Image.open(os.path.join(ROOT, 'icons', mask)).convert('RGBA').getchannel('A').resize((w, h), Image.LANCZOS))
    zone = np.zeros(shape[:2], np.uint8)
    zone[y0 + border:y0 + border + h, x0 + border:x0 + border + w] = (m < 128).astype(np.uint8)
    return zone


def monocle_free(base, frame):
    """Původní sova bez monoklu v souřadnicích base a měkká maska místa, které se vyměnilo (0–1).
    Obrázek sovy bez monoklu se zarovná na původní sovu; vymění se jen monokl s řetízkem (největší souvislý rozdíl) a levé oko (LEFT_EYE),
    zbytek zůstává z původní sovy, takže sova bez monoklu je jinak pixel po pixelu stejná (obrys, čepice, ruka)."""
    img = np.asarray(Image.open(NOMONO).convert('RGB'))
    warped = align(base, img, border=0)
    diff = np.abs(warped.astype(np.int16) - base.astype(np.int16)).max(axis=2).astype(np.uint8)
    diff = cv2.GaussianBlur(diff, (0, 0), 1.5)
    mask = (diff > 45).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    monocle = (labels == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    global MONOCLE_AREA
    MONOCLE_AREA = monocle.copy()  # pro ikonu monoklu (write_monocle_icon)
    x0, y0, w, h = frame
    cx, cy, rx, ry = LEFT_EYE
    cv2.ellipse(monocle, (int(x0 + cx * w), int(y0 + cy * h)), (int(rx * w), int(ry * h)), 0, 0, 360, 1, -1)
    monocle = cv2.dilate(monocle, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    alpha = cv2.GaussianBlur(monocle.astype(np.float32), (0, 0), 5)
    out = base.astype(np.float32) * (1 - alpha[..., None]) + warped.astype(np.float32) * alpha[..., None]
    return np.clip(out, 0, 255).astype(np.uint8), alpha


MONOCLE_AREA = None


def write_monocle_icon(base):
    """icons/doplnky/monokl-ikona.webp (ikona volby Monokl v Nastavení → Mudrlant): z původní sovy zlaté obroučky a řetízek monoklu
    (zlaté pixely v místě, kde se sova bez monoklu liší), s vyplněným sklem a tmavým obrysem kolem."""
    hsv = cv2.cvtColor(base, cv2.COLOR_RGB2HSV).astype(np.int16)
    gold = (hsv[..., 0] >= 8) & (hsv[..., 0] <= 34) & (hsv[..., 1] > 90) & (hsv[..., 2] > 80) & (MONOCLE_AREA > 0)
    gold = cv2.morphologyEx(gold.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    gold = cv2.morphologyEx(gold, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 31)))  # řetízek (kuličky pod sebou)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(gold, 8)
    big = np.zeros_like(gold)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 150:
            big[labels == i] = 1
    flood = (1 - big).astype(np.uint8)
    cv2.floodFill(flood, np.zeros((flood.shape[0] + 2, flood.shape[1] + 2), np.uint8), (0, 0), 2)
    shape = cv2.dilate(((flood != 2)).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    alpha = cv2.GaussianBlur(shape.astype(np.float32), (0, 0), 1.5)
    ys, xs = np.nonzero(shape)
    pad = 12
    box = (xs.min() - pad, ys.min() - pad, xs.max() + pad, ys.max() + pad)
    rgba = np.dstack([base.astype(np.float32), alpha * 255]).astype(np.uint8)[box[1]:box[3], box[0]:box[2]]
    img = Image.fromarray(rgba, 'RGBA')
    side = max(img.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    path = os.path.join(OUT, 'monokl-ikona.webp')
    sq.resize((96, 96), Image.LANCZOS).save(path, 'WEBP', quality=92, alpha_quality=100, method=6)
    print('ikona monoklu', path)


def write_logo_nomono(base, frame):
    """icons/logo-bez-monoklu.webp: logo sovy, ve kterém se místo monoklu (a levé oko) nahradí sovou bez monoklu zmenšenou na rám loga
    s měkkým přechodem. Mimo vyměněné místo je logo beze změny (průhlednost je vždy z loga). Přičíst jen rozdíl obou sov nestačí: i při
    přesném měřítku by po monoklu zůstal slabý stín (logo vzniklo převzorkováním v prohlížeči, ne prostým zmenšením)."""
    nomono, alpha = monocle_free(base, frame)
    x0, y0, w, h = frame
    logo = Image.open(LOGO).convert('RGBA')
    size = logo.size
    # Logo má výšku 320 px a šířku zaokrouhlenou nahoru (scripts/render-app-icons.js): měřítko je stejné v obou směrech, takže se
    # zmenšuje výřez o šířce size[0] / měřítko (o kousek širší než rám); jinak by se obrysy monoklu o půl pixelu minuly a zůstal by jeho stín
    span = size[0] * h / size[1]
    small = lambda arr: np.asarray(Image.fromarray(arr[y0:y0 + h, x0:x0 + int(np.ceil(span)) + 1]).resize(size, Image.LANCZOS, box=(0, 0, span, h))).astype(np.float32)
    a = small((alpha * 255).astype(np.uint8)) / 255
    rgba = np.asarray(logo).astype(np.float32)
    rgba[..., :3] = rgba[..., :3] * (1 - a[..., None]) + small(nomono) * a[..., None]
    Image.fromarray(rgba.round().astype(np.uint8), 'RGBA').save(LOGO_NOMONO, 'WEBP', quality=90, alpha_quality=100, method=6)
    print('logo bez monoklu', LOGO_NOMONO)
    return nomono


def background_of(warped, outer=False):
    """Barva pozadí obrázku doplňku (medián okraje) a vzdálenost každého pixelu od ní. S outer (OUTER_BG) je pozadím jen tmavá plocha
    souvislá s okrajem obrázku: uzavřená tmavá plocha (černý klobouk, páska přes oko) dostane velkou vzdálenost, ať se nezahodí."""
    border_px = np.concatenate([warped[:8].reshape(-1, 3), warped[-8:].reshape(-1, 3), warped[:, :8].reshape(-1, 3), warped[:, -8:].reshape(-1, 3)])
    bgc = np.median(border_px.reshape(-1, 3), axis=0)
    away = np.sqrt(((warped.astype(np.float32) - bgc) ** 2).sum(axis=2))
    if outer:
        bgish = (away < 28).astype(np.uint8)
        n, labels, stats, _ = cv2.connectedComponentsWithStats(bgish, connectivity=4)
        h, w = bgish.shape
        edge = (stats[:, 0] == 0) | (stats[:, 1] == 0) | (stats[:, 0] + stats[:, 2] >= w) | (stats[:, 1] + stats[:, 3] >= h)
        away = np.where((bgish > 0) & ~edge[labels], 255.0, away)
    return away


def glow_alpha(base, warped, keep, away, color, solid_all=False):
    """Záře kolem doplňku (GLOW): pevná část (výrazně odlišná od pozadí, s tmavým obrysem kolem) zůstane neprůhledná, okolí masky nad pozadím
    se rozloží na barvu záře s průhledností: pozorovaná barva = pozadí · (1 − α) + záře · α. Nad sovou se záře vynechá (obrys čepice
    v obrázku doplňku leží o pixel jinde a rozklad by z něj udělal šmouhu). Se solid_all je pevná celá maska kromě pixelů,
    které rozklad na záři vysvětlí (odchylka do 16, aspoň trocha záře): tmavé dřevo hůlky tak zůstane, i když se od pozadí skoro neliší.
    Vrací pevnou část (0/1), průhlednost záře (0–1) a plochu záře v souřadnicích rozšířeného plátna."""
    g = np.array(color, np.float32)
    behind = base.astype(np.float32)
    seen = warped.astype(np.float32)
    d = g - behind
    a = np.clip(((seen - behind) * d).sum(axis=2) / np.maximum((d * d).sum(axis=2), 1.0), 0, 1)
    base_bg = background_of(base) < 28
    if solid_all:
        residual = np.sqrt(((seen - behind - a[..., None] * d) ** 2).sum(axis=2))
        glowish = (away < 150) & (residual < 16) & (a > 0.06)  # i nad sovou: čepice jen zabarvená září zůstane z loga
        solid = ((keep > 0) & ~glowish).astype(np.uint8)
        solid = cv2.morphologyEx(solid, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    else:
        # výrazná místa (kruh, jiskry, světlý okraj) a k nim jen tmavý obrys těsně vedle; zářením zabarvená čepice pod kruhem se nebere
        strong = cv2.morphologyEx((away > 150).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        strong = cv2.morphologyEx(strong, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
        dark = (cv2.cvtColor(warped, cv2.COLOR_RGB2HSV)[..., 2] < 90).astype(np.uint8)
        solid = (strong | (cv2.dilate(strong, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))) & dark)) & keep
        # nad sovou jen to, co se od ní výrazně liší (kruh, jeho obrys); čepice jen zabarvená září zůstane z loga
        far = np.abs(seen - behind).max(axis=2) > 85
        solid &= (base_bg | far).astype(np.uint8)
        # uvnitř kruhu (největší souvislá plocha) není nic z obrázku doplňku ani záře: je tam vidět sova pod ním (knoflík čepice)
        n, labels, stats, _ = cv2.connectedComponentsWithStats(solid, 8)
        ring = (labels == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
        flood = (1 - ring).astype(np.uint8)
        cv2.floodFill(flood, np.zeros((flood.shape[0] + 2, flood.shape[1] + 2), np.uint8), (0, 0), 2)
        inner = flood == 1
        solid &= (~inner).astype(np.uint8)
    zone = (cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61))) > 0) & base_bg
    if not solid_all:
        zone &= ~inner
    glow = zone & (solid == 0)
    a = np.where(glow, cv2.GaussianBlur(a, (0, 0), 1.0), 0)
    a = np.where(a < 0.04, 0, a)
    return solid, a, glow


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


def extract(base, warped, fill=False, border=BORDER, close=9, knob=False, zone=None, hull=None, mode=None, outer=False):
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
    away = background_of(warped, outer)
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


def squeeze_right(frame, mask, arrays, border=BORDER):
    """Část doplňku za pravou hranou rámu vrstvy (cíp pláště) se vodorovně stlačí: sloupce od `start` po poslední sloupec masky se namapují
    do pásu od `start` po hranu rámu (start je dvakrát tak daleko před hranou, jak daleko za ni maska sahá). Vrací pole ve stejném pořadí."""
    x0, y0, w, h = frame
    edge = x0 + border + w + int(round(PAD['r'] * w)) - 4
    last = int(np.nonzero(mask.any(axis=0))[0].max())
    if last <= edge:
        return arrays
    start = edge - 2 * (last - edge)
    xs = np.arange(mask.shape[1], dtype=np.float32)
    src = np.where(xs < start, xs, start + (xs - start) * (last - start) / (edge - start))
    src = np.where(xs > edge, last + 2 + (xs - edge), src).astype(np.float32)
    map_x = np.repeat(src[None, :], mask.shape[0], axis=0)
    map_y = np.repeat(np.arange(mask.shape[0], dtype=np.float32)[:, None], mask.shape[1], axis=1)
    print(f'stlačení: sloupce {start}–{last} → {start}–{edge}')
    return [cv2.remap(a, map_x, map_y, cv2.INTER_LINEAR if a.ndim == 3 else cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0) for a in arrays]


def robe_pixels(warped):
    """Vínová místa obleku a čepice (odstín do fialova, modrá složka nad zelenou, střední jas); plamen a dřevo jsou do oranžova, ty zůstanou."""
    hsv = cv2.cvtColor(warped, cv2.COLOR_RGB2HSV).astype(np.int16)
    rgb = warped.astype(np.int16)
    robe = (hsv[..., 0] >= 158) & (hsv[..., 1] > 90) & (hsv[..., 2] >= 80) & (rgb[..., 2] > rgb[..., 1])
    return cv2.morphologyEx(robe.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0


def hand_pixels(warped, zone, bright=None):
    """Ruka sovy převzatá z obrázku doplňku (HAND_POSE): zlatohnědé peří (odstín v Lab 35–100°) v ploše výchozí ruky a kousek kolem ní.
    Při přebarvení doplňku (recolor_layer, protect) zůstane v barvě sovy; zlaté části předmětu v ruce (rukojeť pochodně, záštita meče)
    zůstanou zlaté také, přebarví se zbytek (plamen, čepel, hrnek, hvězda hůlky)."""
    lab = cv2.cvtColor(warped.astype(np.float32) / 255, cv2.COLOR_RGB2Lab)
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    hue = np.degrees(np.arctan2(lab[..., 2], lab[..., 1]))
    feather = (chroma > 12) & (hue >= (48 if bright is not None else 35)) & (hue <= 100)
    if bright:
        # zlatý předmět v ruce (blesk, pohár): jasně žlutá místa nejsou peří (peří je okrové, světlá místa krémová), ta se přebarví
        feather &= ~((lab[..., 0] > 70) & (chroma > 48))
    near = cv2.dilate(zone, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (81, 81))) > 0
    return (feather & near).astype(np.uint8)


def deghost(base_ext, warped, mask, keep=None, reach=12, step=3, tol=42):
    """Obrázky sad generátor celé překreslil: obrys sovy, peří a rukáv leží o pár pixelů jinde, takže rozdíl proti původní sově je plný
    tenkých „duchů“ obrysů. Pixel masky, ke kterému má původní sova v okolí (posun do `reach` px) skoro stejnou barvu, je duch a vypadne;
    doplněk (barva, kterou sova poblíž nemá) zůstane i s vlastním tmavým obrysem (vrácen jako okolí do 9 px). Plocha `keep` (čepice nebo
    ruka převzatá z obrázku) se nemění."""
    ys, xs = np.nonzero(mask)
    if not len(ys):
        return mask
    y0, y1 = max(ys.min() - reach, 0), min(ys.max() + reach + 1, mask.shape[0])
    x0, x1 = max(xs.min() - reach, 0), min(xs.max() + reach + 1, mask.shape[1])
    w = cv2.GaussianBlur(warped[y0:y1, x0:x1], (0, 0), 1.0).astype(np.int16)
    b = cv2.GaussianBlur(base_ext[y0:y1, x0:x1], (0, 0), 1.0).astype(np.int16)
    best = np.full(w.shape[:2], 255, np.int16)
    for dy in range(-reach, reach + 1, step):
        for dx in range(-reach, reach + 1, step):
            shifted = np.roll(np.roll(b, dy, axis=0), dx, axis=1)
            best = np.minimum(best, np.abs(w - shifted).max(axis=2))
    ghost = np.zeros_like(mask)
    ghost[y0:y1, x0:x1] = (best < tol).astype(np.uint8)
    real = ((mask > 0) & (ghost == 0)).astype(np.uint8)
    real = cv2.morphologyEx(real, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(real, 8)
    if n > 1:
        big = stats[1:, cv2.CC_STAT_AREA].max()
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] < max(400, big * 0.01):
                real[labels == i] = 0
    out = (mask > 0) & (cv2.dilate(real, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19))) > 0)
    if keep is not None:
        out |= (mask > 0) & (keep > 0)
    return out.astype(np.uint8)


def clip_set(name, base, warped, mask, frame, border=BORDER):
    """Kus sady (SETS): bez duchů obrysu sovy (deghost), mimo ruku nic přes zvednutou ruku, hlava a obličej oříznuté zdola (CLIP_BOTTOM)."""
    x0, y0, w, h = frame
    slot = SET_SLOT[name]
    hand = hat_zone(frame, warped.shape, mask='logo-maska-ruka.webp')
    # nová ruka může přesahovat plochu výchozí ruky: její okolí zůstává celé
    keep = hat_zone(frame, warped.shape) if name in HATS else cv2.dilate(hand, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61))) if name in HAND_POSE else None
    if name not in NO_DEGHOST:
        ext = cv2.copyMakeBorder(base, border, border, border, border, cv2.BORDER_REPLICATE)
        mask = deghost(ext, warped, mask, keep, tol=DEGHOST_TOL.get(name, 42))
    if slot != 'hand':
        mask = np.where(hand > 0, 0, mask).astype(np.uint8)
    if slot in CLIP_BOTTOM:
        mask[y0 + border + int(CLIP_BOTTOM[slot] * h):, :] = 0
    if name in ON_CAP:
        # čepice zůstává ta výchozí: z obrázku se nebere nic uvnitř ní (kromě horního okraje, kde kouř sedí)
        cap = cv2.erode(hat_zone(frame, warped.shape), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
        mask = np.where(cap > 0, 0, mask).astype(np.uint8)
    if slot in CLIP_TOP:
        mask[:y0 + border + int(CLIP_TOP[slot] * h), :] = 0
    if name in CLIP_LEFT:
        mask[:, :x0 + border + int(CLIP_LEFT[name] * w)] = 0
    return mask


def hue_pixels(warped, lo, hi, chroma):
    """Místa s odstínem v Lab mezi lo a hi (stupně) a chroma aspoň `chroma` (PROTECT_HUE), rozšířená o pixel (přechody k obrysu)."""
    lab = cv2.cvtColor(warped.astype(np.float32) / 255, cv2.COLOR_RGB2Lab)
    hue = np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360
    sel = (np.hypot(lab[..., 1], lab[..., 2]) >= chroma) & (hue >= lo) & (hue <= hi)
    sel = cv2.morphologyEx(sel.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return cv2.dilate(sel, np.ones((3, 3), np.uint8))


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


def layer(base, warped, mask, frame, border=BORDER, protect=None, bleed=False, glow=None):
    """Vrstva doplňku v rámu loga. S `protect` (plochy sovy ve vrstvě, které se nesmí přebarvit) vrací i jeho výřez stejné velikosti (0–255).
    S `glow` (pevná část, průhlednost záře, barva záře; viz glow_alpha) se pevná část položí přes poloprůhlednou záři."""
    x0, y0, w, h = frame
    l, r, t, b = (int(round(PAD[k] * (w if k in 'lr' else h))) for k in 'lrtb')
    x0, y0 = x0 + border, y0 + border
    if glow is not None:
        mask = glow[0]
    m = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.0)
    alpha = np.clip(alpha * 1.4, 0, 1)
    alpha = np.where(alpha < 0.16, 0, alpha)  # slabé zbytky rozdílu (stíny, obrys původní čepice) se zahodí
    color = warped
    if bleed:
        sl = (slice(y0 - t, y0 + h + b), slice(x0 - l, x0 + w + r))
        color = warped.copy()
        color[sl] = bleed_colors(warped[sl], mask[sl])
    if glow is not None:
        # pevná část přes záři (skládání „over“): barva je vážený průměr podle průhledností
        _, ga, gcolor = glow
        total = alpha + ga * (1 - alpha)
        mix = (color.astype(np.float32) * alpha[..., None] + np.array(gcolor, np.float32) * (ga * (1 - alpha))[..., None]) / np.maximum(total, 1e-6)[..., None]
        color, alpha = np.clip(mix, 0, 255), total
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
TINT = {'knir': 1.0, 'mikrofon': 1.0, 'metr': 0.7, 'brk': 1.2, 'svitek': 0.6, 'kompas': 0.65, 'sitka': 0.5, 'lab-bryle': 0.9, 'mec': 0.7, 'stetoskop': 0.5}
# Z nich krémový papír, brk a síť se koloruje celý (krémová je jejich plocha); u ostatních zůstává krémová vždy (nálepkový okraj, bílá nenasycená)
CREAM_TINT = {'brk', 'svitek', 'kompas', 'sitka', 'lab-bryle'}
TINT_DEFAULT = 0.0
# Doplňky s tmavou výplní (inkoust v kalamáři, černý cylindr a pirátský klobouk, páska přes oko): tlustá tmavá plocha (ne tenký obrys) se přebarví také
DARKFILL = {'brk', 'cylindr', 'piratsky-klobouk', 'paska'}
# Sady témat: bílý krejzlík, šedý kouř, krémový filmový pás, bílá námořnická čepice a bílé okraje praporků se kolorují; černý knír jako cylindr
TINT.update({'kladivko': 0.9, 'krejzlik': 1.0, 'vybuch': 0.9, 'filmovy-pas': 0.8, 'namornicka-cepice': 0.8, 'praporky': 1.0})
# bílé praporky leží těsně u okraje vrstvy: border_zone by je vzala za krémový okraj nálepky, kolorují se celé
CREAM_TINT |= {'praporky'}
DARKFILL |= {'dali-knir'}


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
    original = load_base()
    frame = logo_frame(original)
    print('rám loga', frame)
    nomono = None
    if '--logo' in ids:
        nomono = write_logo_nomono(original, frame)
        write_monocle_icon(original)
        ids = ids - {'--logo'}
        if not ids:
            return
    files = sorted(glob.glob(os.path.join(SRC, '*.jpg')))
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        if ids and name not in ids:
            continue
        # sova bez monoklu na obrázku: rozdíl proti sově bez monoklu (jen jednou za běh, zarovnání je pomalé)
        if name in NO_MONOCLE and nomono is None:
            nomono, _ = monocle_free(original, frame)
        base = nomono if name in NO_MONOCLE else original
        img = np.asarray(Image.open(f).convert('RGB'))
        cache = os.path.join(os.environ['WARP_CACHE'], name + '.npy') if os.environ.get('WARP_CACHE') else None  # jen pro ladění: zarovnání je pomalé
        if cache and os.path.exists(cache):
            warped = np.load(cache)
        else:
            warped = align(base, img, hat=name in HAND or name in WIDE, sift=name in SIFT_ALIGN)
            if cache:
                os.makedirs(os.path.dirname(cache), exist_ok=True)
                np.save(cache, warped)
        mask, diff, protect = extract(base, warped, fill=name in FILL, close=CLOSE.get(name, 9), knob=name in KNOB, zone=hat_zone(frame, warped.shape) if name in HATS else hat_zone(frame, warped.shape, mask='logo-maska-ruka.webp') if name in HAND_POSE else None,
                                      hull=HULL.get(name), mode=MODE.get(name), outer=name in OUTER_BG)
        if name in SQUEEZE:
            warped, mask, protect = squeeze_right(frame, mask, [warped, mask, protect])
        if name in SETS:
            mask = clip_set(name, base, warped, mask, frame)
        if name in ROBE_FREE:
            mask = np.where(robe_pixels(warped), 0, mask).astype(np.uint8)
        if name in HAND_POSE:
            protect = np.maximum(protect, hand_pixels(warped, hat_zone(frame, warped.shape, mask='logo-maska-ruka.webp'), bright=(name in GOLD_ITEM) if name in SETS else None))
        if name in PROTECT_HUE:
            protect = np.maximum(protect, hue_pixels(warped, *PROTECT_HUE[name]) & mask)
        glow = None
        if name in GLOW:
            ext = cv2.copyMakeBorder(base, BORDER, BORDER, BORDER, BORDER, cv2.BORDER_REPLICATE)
            solid, alpha_glow, _ = glow_alpha(ext, warped, mask, background_of(warped, name in OUTER_BG), GLOW[name], solid_all=name in GLOW_SOLID)
            glow = (solid, alpha_glow, GLOW[name])
        out, protect_layer = layer(base, warped, mask, frame, protect=protect, bleed=name not in SPLIT, glow=glow)
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
        if name in FIXED_SPLIT:
            # pevná část nad barevnou vrstvou (viz FIXED_SPLIT): stejné pixely, průhlednost násobená maskou protect
            fixed = np.asarray(out).copy()
            fixed[..., 3] = (fixed[..., 3].astype(np.float32) * protect_layer.astype(np.float32) / 255).astype(np.uint8)
            save_webp(Image.fromarray(fixed, 'RGBA'), os.path.join(OUT, name + '-zaklad.webp'))
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
