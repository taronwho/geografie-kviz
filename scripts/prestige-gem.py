# Vrstvy rozsvícení barev duhového diamantu medailonu prestiže ★10 (prestige.js LIT_REGIONS gem-*): z icons/topics/prestiz-10.webp
# vybere v oblasti diamantu pixely jedné barvy (odstín, sytost) a uloží je zesvětlené jako icons/topics/prestiz-10-gem-<barva>.webp
# (stejné plátno, jinde průhledné). Aplikace je od ★11 postupně klade přes medailon (src/input.css .prestige-lit-l1 … l4).
# Spuštění: python3 scripts/prestige-gem.py [--preview]
import os, sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
# Oblast diamantu jako podíl plátna (x0, y0, x1, y1) a pásma odstínu barev v pořadí rozsvěcení
BOX = (0.33, 0.45, 0.67, 0.73)
# Obrys diamantu (px plátna 192 × 192): jen uvnitř, ať se nepřidají zlaté paprsky pozadí
DIAMOND = [(74, 89), (118, 89), (127, 101), (96, 136), (65, 101)]
BANDS = [('red', 340, 12), ('orange', 12, 38), ('yellow', 38, 68), ('green', 68, 165), ('cyan', 165, 205), ('blue', 205, 248), ('violet', 248, 340)]

def main(preview=False):
    src = Image.open(os.path.join(root, 'icons', 'topics', 'prestiz-10.webp')).convert('RGBA')
    a = np.asarray(src).astype(np.float32) / 255
    h, w = a.shape[:2]
    rgb, alpha = a[..., :3], a[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    d = mx - mn + 1e-6
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    ys, xs = np.mgrid[0:h, 0:w]
    poly = Image.new('L', (w, h), 0)
    ImageDraw.Draw(poly).polygon([(x * w / 192, y * h / 192) for x, y in DIAMOND], fill=255)
    inside = np.asarray(poly) > 0
    base = inside & (sat > 0.3) & (mx > 0.3) & (alpha > 0.8)
    sheet = []
    for name, lo, hi in BANDS:
        band = (hue >= lo) & (hue < hi) if lo < hi else (hue >= lo) | (hue < hi)
        mask = Image.fromarray(((base & band) * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(0.6))
        lit = np.clip(rgb * 1.25 + 0.12, 0, 1)
        out = np.dstack([lit, np.asarray(mask).astype(np.float32) / 255 * alpha]) * 255
        Image.fromarray(out.round().astype(np.uint8), 'RGBA').save(os.path.join(root, 'icons', 'topics', f'prestiz-10-gem-{name}.webp'), 'WEBP', quality=90, method=6)
        print(name, int((base & band).sum()), 'px')
        if preview: sheet.append(np.asarray(mask))
    if preview:
        big = Image.fromarray(np.hstack([s[int(BOX[1]*h)-4:int(BOX[3]*h)+4, int(BOX[0]*w)-4:int(BOX[2]*w)+4] for s in sheet]))
        big.resize((big.width * 4, big.height * 4), Image.NEAREST).save(os.path.join(root, 'prestige-gem-preview.png'))

if __name__ == '__main__':
    main('--preview' in sys.argv)
