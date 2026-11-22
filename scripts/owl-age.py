# Mudrlant stárne (look.js AGE_STAGES): z obrázků branding/sova-vek-<n>.jpg (sova bez monoklu, stejná póza jako branding/sova-bez-monoklu.jpg)
# vyrobí icons/logo-vek<n>-bez-monoklu.webp a s monoklem icons/logo-vek<n>.webp ve stejném rámu jako icons/logo.webp (258×320), takže
# na ně sedí doplňky. Obrázek se zarovná na původní sovu (scripts/owl-accessories.py align), průhlednost se vyřízne z tmavého pozadí
# (jako scripts/logo-cutout.py) a monokl se přenese z původní sovy: jen zlaté obroučky, řetízek a jejich tmavý obrys, sklo a oko pod ním
# zůstanou ze stárnoucí sovy. Barvy obleku pak: ONLY=logo-vek2,logo-vek2-bez-monoklu,… python3 scripts/owl-robes.py
# Spuštění: python3 scripts/owl-age.py [n …]   (bez argumentů všechny stupně 2–5)
import importlib.util, os, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
spec = importlib.util.spec_from_file_location('owl_accessories', os.path.join(ROOT, 'scripts', 'owl-accessories.py'))
acc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acc)
STAGES = [2, 3, 4, 5]


def cutout_alpha(a):
    """Průhlednost samolepky: tmavé pozadí souvislé s okrajem (i černá plocha mimo zarovnaný obrázek) je průhledné."""
    f = a.astype(np.float32)
    zero = f.sum(axis=2) < 6
    border = np.concatenate([f[:8].reshape(-1, 3), f[-8:].reshape(-1, 3), f[:, :8].reshape(-1, 3), f[:, -8:].reshape(-1, 3)])
    border = border[border.sum(axis=1) > 6]
    bg = np.median(border, axis=0)
    dist = np.sqrt(((f - bg) ** 2).sum(axis=2))
    dark = Image.fromarray((((dist < 40) | zero) * 255).astype(np.uint8)).copy()
    ImageDraw.floodfill(dark, (5, 5), 128)
    outside = np.asarray(dark) == 128
    alpha = (~outside).astype(np.float32)
    # měkký okraj (2 px) jako u loga
    return cv2.GaussianBlur(alpha, (0, 0), 1.2)


def monocle_over(aged, base):
    """Zlaté obroučky a řetízek monoklu z původní sovy (base) s jejich tmavým obrysem položené na stárnoucí sovu."""
    area = acc.MONOCLE_AREA
    hsv = cv2.cvtColor(base, cv2.COLOR_RGB2HSV).astype(np.int16)
    gold = (hsv[..., 0] >= 8) & (hsv[..., 0] <= 34) & (hsv[..., 1] > 90) & (hsv[..., 2] > 80) & (area > 0)
    gold = cv2.morphologyEx(gold.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    band = cv2.dilate(gold, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))) & (area > 0)
    dark = (hsv[..., 2] < 90)
    take = (gold > 0) | ((band > 0) & dark)
    take = cv2.morphologyEx(take.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    a = cv2.GaussianBlur(take.astype(np.float32), (0, 0), 1.0)[..., None]
    return np.clip(aged.astype(np.float32) * (1 - a) + base.astype(np.float32) * a, 0, 255).astype(np.uint8)


def to_logo(rgb, alpha, frame, path):
    x0, y0, w, h = frame
    size = Image.open(acc.LOGO).size
    span = size[0] * h / size[1]
    small = lambda arr: np.asarray(Image.fromarray(arr[y0:y0 + h, x0:x0 + int(np.ceil(span)) + 1]).resize(size, Image.LANCZOS, box=(0, 0, span, h))).astype(np.float32)
    out = np.dstack([small(rgb), small((alpha * 255).astype(np.uint8))])
    Image.fromarray(out.round().clip(0, 255).astype(np.uint8), 'RGBA').save(path, 'WEBP', quality=90, alpha_quality=100, method=6)
    print(path)


def main(stages):
    base = acc.load_base()
    frame = acc.logo_frame(base)
    acc.monocle_free(base, frame)
    for n in stages:
        img = np.asarray(Image.open(os.path.join(ROOT, 'branding', f'sova-vek-{n}.jpg')).convert('RGB'))
        aged = acc.align(base, img, border=0)
        alpha = cutout_alpha(aged)
        to_logo(aged, alpha, frame, os.path.join(ROOT, 'icons', f'logo-vek{n}-bez-monoklu.webp'))
        to_logo(monocle_over(aged, base), alpha, frame, os.path.join(ROOT, 'icons', f'logo-vek{n}.webp'))


if __name__ == '__main__':
    main([int(x) for x in sys.argv[1:]] or STAGES)
