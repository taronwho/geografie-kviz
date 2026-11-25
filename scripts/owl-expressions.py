# Výrazy Mudrlanta (Easter eggy: spánek, spirálky, mrknutí…): z obrázků branding/vyrazy/<výraz>-vek<n>.jpg (stejná sova jako
# branding/sova-bez-monoklu.jpg nebo sova-vek-<n>.jpg, změněné jen oči) vyrobí průhlednou vrstvu jen s očima ve stejném rámu jako
# icons/logo.webp (258×320): icons/vyrazy/<výraz>-vek<n>.webp (sova bez monoklu) a <výraz>-vek<n>-monokl.webp (přes oči znovu monokl).
# Vrstva se položí přes logo (libovolná barva taláru, oči se nepřebarvují). Obrázek se zarovná na původní sovu (owl-accessories.py align),
# z rozdílu proti sově bez výrazu vznikne maska očí s měkkým okrajem (jen v pásu obličeje).
# Spuštění: python3 scripts/owl-expressions.py [výraz …] [--preview=soubor.png]   (bez výrazů všechny v branding/vyrazy)
import importlib.util, os, re, sys
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
age_spec = importlib.util.spec_from_file_location('owl_age', os.path.join(ROOT, 'scripts', 'owl-age.py'))
age = importlib.util.module_from_spec(age_spec)
age_spec.loader.exec_module(age)
acc = age.acc  # stejný modul jako v owl-age.py (MONOCLE_AREA nastaví monocle_free)
SRC = os.path.join(ROOT, 'branding', 'vyrazy')
OUT = os.path.join(ROOT, 'icons', 'vyrazy')


def reference(n):
    name = 'sova-bez-monoklu.jpg' if n == 1 else f'sova-vek-{n}.jpg'
    return np.asarray(Image.open(os.path.join(ROOT, 'branding', name)).convert('RGB'))


def eye_mask(expr, ref, frame):
    """Maska změněných očí: rozdíl proti sově bez výrazu v pásu obličeje, uzavřený, vyplněný a s měkkým okrajem."""
    x0, y0, w, h = frame
    d = np.abs(expr.astype(np.int16) - ref.astype(np.int16)).max(axis=2)
    band = np.zeros(d.shape, np.uint8)
    band[y0 + int(h * 0.30):y0 + int(h * 0.56), x0 + int(w * 0.22):x0 + int(w * 0.86)] = 1
    m = ((d > 45) & (band > 0)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (45, 45)))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61))) & band
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(m)
    for c in contours:
        if cv2.contourArea(c) > 2000: cv2.drawContours(filled, [cv2.convexHull(c)], -1, 1, -1)
    return cv2.GaussianBlur(filled.astype(np.float32), (0, 0), 6)


def monocle_over(expr, base):
    """Monokl přes nové oči: zlaté obroučky a řetízek z původní sovy a jen jejich tenký tmavý obrys. Na rozdíl od owl-age.py
    bez tmavých míst uvnitř skla (tam má původní sova otevřené oko a jeho zornice by prosvítala přes zavřené oko výrazu)."""
    area = acc.MONOCLE_AREA
    hsv = cv2.cvtColor(base, cv2.COLOR_RGB2HSV).astype(np.int16)
    gold = (hsv[..., 0] >= 8) & (hsv[..., 0] <= 34) & (hsv[..., 1] > 90) & (hsv[..., 2] > 80) & (area > 0)
    gold = cv2.morphologyEx(gold.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    # jen obroučka a řetízek (velké souvislé části); tenké zlatavé odlesky uvnitř skla původní sovy pryč
    count, labels, stats, _ = cv2.connectedComponentsWithStats(gold)
    gold = np.isin(labels, [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] > 1500]).astype(np.uint8)
    # vnitřek skla: díry uvnitř obroučky
    filled = gold.copy()
    contours, _ = cv2.findContours(gold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(filled, contours, -1, 1, -1)
    glass_all = ((filled > 0) & (gold == 0)).astype(np.uint8)
    inside = cv2.erode(glass_all, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    band = cv2.dilate(gold, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))) & (area > 0) & (inside == 0)
    take = (gold > 0) | ((band > 0) & (hsv[..., 2] < 90))
    take = cv2.morphologyEx(take.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    a = cv2.GaussianBlur(take.astype(np.float32), (0, 0), 1.0)[..., None]
    # sklo: lehký odlesk jako na původní sově (zesvětlení vnitřku o pár procent)
    glass = cv2.GaussianBlur(inside.astype(np.float32), (0, 0), 2.0)[..., None] * 0.08
    out = expr.astype(np.float32) * (1 - glass) + 255 * glass
    rgb = np.clip(out * (1 - a) + base.astype(np.float32) * a, 0, 255).astype(np.uint8)
    # vrstva musí zakrýt celé sklo i obroučku (pod ní je v logu otevřené oko)
    cover = cv2.dilate((filled > 0).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(np.float32)
    return rgb, cover


def main(names, preview):
    base = acc.load_base()
    frame = acc.logo_frame(base)
    acc.monocle_free(base, frame)
    os.makedirs(OUT, exist_ok=True)
    files = sorted(f for f in os.listdir(SRC) if re.match(r'^[a-z-]+-vek[1-5]\.(jpg|png)$', f))
    shots = []
    for f in files:
        name, n = re.match(r'^([a-z-]+)-vek([1-5])', f).groups()
        if names and name not in names: continue
        n = int(n)
        expr = acc.align(base, np.asarray(Image.open(os.path.join(SRC, f)).convert('RGB')), border=0)
        ref = acc.align(base, reference(n), border=0)
        mask = eye_mask(expr, ref, frame)
        with_monocle, cover = monocle_over(expr, base)
        for suffix, rgb, alpha in (('', expr, mask), ('-monokl', with_monocle, np.maximum(mask, cover))):
            path = os.path.join(OUT, f'{name}-vek{n}{suffix}.webp')
            age.to_logo(rgb, alpha, frame, path)
        shots.append((name, n))
    if preview:
        tiles = []
        for name, n in shots:
            for suffix, logo in (('', f'logo{"" if n == 1 else f"-vek{n}"}-bez-monoklu'), ('-monokl', f'logo{"" if n == 1 else f"-vek{n}"}')):
                for robe in ('', '-modra'):
                    under = Image.open(os.path.join(ROOT, 'icons', f'{logo}{robe}.webp')).convert('RGBA')
                    over = Image.open(os.path.join(OUT, f'{name}-vek{n}{suffix}.webp')).convert('RGBA')
                    tile = Image.new('RGBA', under.size, (45, 48, 52, 255))
                    tile.alpha_composite(under); tile.alpha_composite(over)
                    tiles.append(tile)
        cols = 4
        W, H = tiles[0].size
        sheet = Image.new('RGBA', (W * cols, H * ((len(tiles) + cols - 1) // cols)), (45, 48, 52, 255))
        for i, t in enumerate(tiles): sheet.alpha_composite(t, ((i % cols) * W, (i // cols) * H))
        sheet.save(preview)
        print(preview)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    prev = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--preview=')), None)
    main(args, prev)
