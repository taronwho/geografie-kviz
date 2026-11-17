# Obrázky Dobývání, které nejsou běžné ikony:
#  - pecet (č. 265): branding/ikony/pecet.png → icons/topics/pecet.webp (256 × 256): prázdná šedá vosková pečeť vystředěná na tělo
#    pečeti (ne na kapky), aby střed vtlačeného kruhu byl přesně uprostřed; conquest.js sealSvg ji přebarví na barvu hráče
#    (feColorMatrix) a vtiskne znak.
#  - akvarel (č. 264): branding/textury/textura-akvarel.jpg → icons/textury/textura-akvarel.webp (512 × 512): šedá akvarelová lazura,
#    kterou mapa násobí přes barvu obsazených území (nerovnoměrnost skutečného akvarelu).
#  - vzory (č. 278–284): branding/ikony/vzor-<id>.png → icons/vzory/<id>.webp (512 × 512, bezešvé): látka praporce, pečeti a vlaječek
#    (conquest.js PATTERNS). Generátor dlaždice úplně bezešvé nedělá: obrázek se rozloží na periodickou a hladkou složku (Moisan 2011)
#    a použije se jen periodická (kresba zůstane, schod na okraji zmizí bez rozmazaných pruhů). Šedé vzory se srovnají (medián, tmavé
#    tahy a světla na stejné hodnoty), aby barva hráče po vynásobení zůstala poznat a kresba byla vidět; barevné (Brokát, Duha) zůstanou.
#  - znaky (č. 285–296): branding/ikony/znak-<id>.png (černá silueta na bílém) → icons/znaky/<id>.webp (256 × 256, bílá s průhledností:
#    maska, černá = neprůhledná) a <id>-obrys.webp (táž maska rozšířená o obrys, podklad znaku na barevném vzoru). Silueta se ořízne,
#    vystředí do čtverce s malým okrajem; drobné bílé mezery, které by na pečeti 24 px slily, se zaplní a tenké tahy se mírně rozšíří
#    (EMBLEMS níže). conquest.js RARE_EMBLEMS ji tiskne maskou (SVG <mask>) do pečeti a na praporec v barvě hráče.
# Spuštění: python3 scripts/conquest-art.py [pecet] [akvarel] [vzory] [znaky]   (bez argumentu vše; Pillow, numpy, scipy)
import os, sys, importlib.util
import numpy as np
from PIL import Image
from scipy import ndimage

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(root, 'branding', 'ikony')
jobs = set(sys.argv[1:]) or {'pecet', 'akvarel', 'vzory', 'znaky'}


def pecet():
    spec = importlib.util.spec_from_file_location('topic_icons', os.path.join(root, 'scripts', 'topic-icons.py'))
    icons = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(icons)
    im = icons.cut(os.path.join(SRC, 'pecet.png'), 'pecet')
    alpha = np.asarray(im)[..., 3] > 128
    labels, count = ndimage.label(alpha)
    sizes = ndimage.sum(alpha, labels, range(1, count + 1))
    body = labels == (int(np.argmax(sizes)) + 1)
    ys, xs = np.nonzero(body)
    cy, cx = ys.mean(), xs.mean()
    ya, xa = np.nonzero(alpha)
    half = int(np.sqrt((ya - cy) ** 2 + (xa - cx) ** 2).max()) + 6
    canvas = Image.new('RGBA', (2 * half, 2 * half), (0, 0, 0, 0))
    canvas.paste(im, (int(round(half - cx)), int(round(half - cy))), im)
    canvas.resize((256, 256), Image.LANCZOS).save(os.path.join(root, 'icons', 'topics', 'pecet.webp'), 'WEBP', quality=90, method=6)
    print('pecet: tělo pečeti má poloměr', round(np.sqrt(body.sum() / np.pi) / (2 * half), 3), 'strany')


def akvarel():
    tex = Image.open(os.path.join(root, 'branding', 'textury', 'textura-akvarel.jpg')).convert('L').resize((512, 512), Image.LANCZOS)
    tex.convert('RGB').save(os.path.join(root, 'icons', 'textury', 'textura-akvarel.webp'), 'WEBP', quality=88, method=6)
    print('akvarel: průměrný jas', round(float(np.asarray(tex).mean()), 1))


# --- Vzory praporců ---
# grey: šedá textura (násobí se barvou hráče); mid a low: kam se posune medián a 1. percentil jasu (0–1). Světlejší medián = barva hráče
# zůstane sytá, nižší low = výraznější kresba. Hvězdná noc má světlé hvězdy na tmavším pozadí, proto pozadí (medián) výš a světla se oříznou.
PATTERN_SIZE = 512
PATTERNS = {
    'hvezdna-noc': {'grey': True, 'mid': 0.74, 'low': 0.62},
    'plameny': {'grey': True, 'mid': 0.86, 'low': 0.5},
    'mramor': {'grey': True, 'mid': 0.92, 'low': 0.55},
    'listi': {'grey': True, 'mid': 0.86, 'low': 0.48},
    'led': {'grey': True, 'mid': 0.8, 'low': 0.52},
    'brokat': {'grey': False},
    'duha': {'grey': False},
}


def periodic(u):
    # Periodická složka obrázku (Moisan: Periodic plus smooth image decomposition); u je H × W × K float
    H, W = u.shape[:2]
    v = np.zeros_like(u)
    v[0] += u[-1] - u[0]
    v[-1] += u[0] - u[-1]
    v[:, 0] += u[:, -1] - u[:, 0]
    v[:, -1] += u[:, 0] - u[:, -1]
    q = np.arange(H).reshape(-1, 1)
    r = np.arange(W).reshape(1, -1)
    den = 2 * np.cos(2 * np.pi * q / H) + 2 * np.cos(2 * np.pi * r / W) - 4
    den[0, 0] = 1
    out = np.empty_like(u)
    for k in range(u.shape[2]):
        s = np.fft.fft2(v[..., k]) / den
        s[0, 0] = 0
        out[..., k] = u[..., k] - np.real(np.fft.ifft2(s))
    return out


def resize_wrap(a, size):
    # Zmenšení s přesahem přes okraj (dlaždice se opakuje), aby filtr na okraji nevyrobil nový šev
    H = a.shape[0]
    pad = H // 32
    big = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), mode='wrap')
    k = size / H
    out_pad = int(round(pad * k))
    im = Image.fromarray(np.clip(big, 0, 255).astype(np.uint8).squeeze() if a.shape[2] == 1 else np.clip(big, 0, 255).astype(np.uint8))
    im = im.resize((size + 2 * out_pad, size + 2 * out_pad), Image.LANCZOS)
    arr = np.asarray(im).astype(np.float64)
    if arr.ndim == 2: arr = arr[..., None]
    return arr[out_pad:out_pad + size, out_pad:out_pad + size]


def seam(a):
    # Schod na okraji dlaždice vůči běžnému rozdílu sousedních pixelů (1 = bez švu)
    g = a.mean(axis=2)
    inner_x = np.abs(np.diff(g, axis=1)).mean()
    inner_y = np.abs(np.diff(g, axis=0)).mean()
    return np.abs(g[:, 0] - g[:, -1]).mean() / inner_x, np.abs(g[0] - g[-1]).mean() / inner_y


def vzory():
    out_dir = os.path.join(root, 'icons', 'vzory')
    os.makedirs(out_dir, exist_ok=True)
    for name, opt in PATTERNS.items():
        img = Image.open(os.path.join(SRC, f'vzor-{name}.png'))
        a = np.asarray(img.convert('L' if opt['grey'] else 'RGB')).astype(np.float64)
        if a.ndim == 2: a = a[..., None]
        before = seam(a)
        a = resize_wrap(periodic(a), PATTERN_SIZE)
        if opt['grey']:
            t = a[..., 0] / 255
            m, lo = np.median(t), np.percentile(t, 1)
            t = opt['mid'] + (t - m) * (opt['mid'] - opt['low']) / max(m - lo, 1e-3)
            a = np.clip(t, 0, 1)[..., None] * 255
        after = seam(a)
        arr = np.clip(np.round(a), 0, 255).astype(np.uint8)
        out = Image.fromarray(arr[..., 0], 'L').convert('RGB') if opt['grey'] else Image.fromarray(arr, 'RGB')
        path = os.path.join(out_dir, f'{name}.webp')
        out.save(path, 'WEBP', quality=82, method=6)
        print(f'vzor {name}: šev před {before[0]:.2f}/{before[1]:.2f}, po {after[0]:.2f}/{after[1]:.2f}, průměrný jas {arr.mean() / 255:.2f}, {os.path.getsize(path) // 1024} kB')


# --- Vzácné znaky ---
# fill: bílé mezery menší než tolik pixelů (z 2048) se zaplní (na malé pečeti by byly šum); grow: o kolik pixelů (z 2048) se silueta
# rozšíří, aby tenké tahy (vousy draka, chapadla, oblouky koruny) na 24 px nezmizely.
MASK_SIZE = 256
MARGIN = 0.06       # okraj čtverce (podíl strany), do něj se vejde obrys
HALO = 0.035        # šířka obrysu (podíl strany), podklad znaku na barevném vzoru
EMBLEMS = {
    'gryf': {'fill': 900, 'grow': 8},
    'sfinga': {'fill': 600, 'grow': 6},
    'cinsky-drak': {'fill': 900, 'grow': 10},
    'orel-belohlavy': {'fill': 900, 'grow': 6},
    'dvouocasy-lev': {'fill': 900, 'grow': 8},
    'pegas': {'fill': 900, 'grow': 6},
    'fenix': {'fill': 1200, 'grow': 10},
    'kraken': {'fill': 900, 'grow': 10},
    'jednorozec': {'fill': 600, 'grow': 8},
    'dvouhlavy-orel': {'fill': 1200, 'grow': 8},
    'svatovaclavska-koruna': {'fill': 1500, 'grow': 10},
    'sova-mudrlant': {'fill': 900, 'grow': 6},
}


def znaky():
    out_dir = os.path.join(root, 'icons', 'znaky')
    os.makedirs(out_dir, exist_ok=True)
    for name, opt in EMBLEMS.items():
        path = os.path.join(SRC, f'znak-{name}.png')
        if not os.path.exists(path):
            print(f'znak {name}: chybí {path}')
            continue
        g = np.asarray(Image.open(path).convert('L')).astype(np.float64) / 255
        ink = g < 0.5
        # Smetí (tečky z JPG, šum na okraji) pryč: jen kusy aspoň 0,02 % plochy
        labels, count = ndimage.label(ink)
        sizes = ndimage.sum(ink, labels, range(1, count + 1))
        keep = np.isin(labels, 1 + np.nonzero(sizes >= ink.size * 0.0002)[0])
        # Malé bílé mezery uvnitř siluety zaplnit
        holes = ~keep
        hl, hc = ndimage.label(holes)
        hs = ndimage.sum(holes, hl, range(1, hc + 1))
        border = set(np.unique(np.concatenate([hl[0], hl[-1], hl[:, 0], hl[:, -1]]))) - {0}
        small = [i + 1 for i, s in enumerate(hs) if s < opt['fill'] and (i + 1) not in border]
        solid = keep | np.isin(hl, small)
        # Hladký okraj ze vzdálenosti od hranice (místo zubů z prahu), rozšířený o grow
        inside = ndimage.distance_transform_edt(solid)
        outside = ndimage.distance_transform_edt(~solid)
        sd = np.where(solid, inside - 0.5, 0.5 - outside) + opt['grow']
        ys, xs = np.nonzero(sd > 0)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        side = max(y1 - y0, x1 - x0)
        full = int(round(side / (1 - 2 * MARGIN)))
        cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
        halo_px = HALO * full
        # Čtverec kolem středu siluety (mimo obrázek = bílá, tedy prázdno)
        oy, ox = int(round(cy - full / 2)), int(round(cx - full / 2))
        canvas = np.full((full, full), -1e3)
        sy0, sx0 = max(0, oy), max(0, ox)
        sy1, sx1 = min(sd.shape[0], oy + full), min(sd.shape[1], ox + full)
        canvas[sy0 - oy:sy1 - oy, sx0 - ox:sx1 - ox] = sd[sy0:sy1, sx0:sx1]
        # Vzdálenost znovu na celém čtverci (silueta může končit u okraje zdrojového obrázku)
        body = canvas > 0
        d_in = ndimage.distance_transform_edt(body)
        d_out = ndimage.distance_transform_edt(~body)
        sdist = np.where(body, d_in - 0.5, 0.5 - d_out)
        for suffix, offset in (('', 0.0), ('-obrys', halo_px)):
            alpha = np.clip(sdist + offset + 0.5, 0, 1)
            small_img = Image.fromarray((alpha * 255).astype(np.uint8), 'L').resize((MASK_SIZE, MASK_SIZE), Image.LANCZOS)
            rgba = Image.merge('RGBA', [Image.new('L', small_img.size, 255)] * 3 + [small_img])
            target = os.path.join(out_dir, f'{name}{suffix}.webp')
            rgba.save(target, 'WEBP', lossless=True, quality=100, method=6)
        fill_ratio = (np.asarray(Image.open(os.path.join(out_dir, f'{name}.webp')))[..., 3] > 127).mean()
        print(f'znak {name}: {x1 - x0}×{y1 - y0} px, zaplněno {fill_ratio:.2f} čtverce, {os.path.getsize(os.path.join(out_dir, name + ".webp")) // 1024} kB')


if 'pecet' in jobs: pecet()
if 'akvarel' in jobs: akvarel()
if 'vzory' in jobs: vzory()
if 'znaky' in jobs: znaky()
