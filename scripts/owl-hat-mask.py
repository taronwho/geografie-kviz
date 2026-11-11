# Maska čepice sovy: icons/logo-maska.webp (258×320, stejný rám jako logo). Průhledná je výchozí čepice (vínová, její obrys, zlatý knoflík
# a světlý okraj nálepky kolem ní), zbytek je neprůhledný. Používá se jako CSS maska loga, když doplněk na hlavě čepici nahrazuje (helma, přilba, baret):
# výchozí čepice pak za doplňkem není vidět. Spuštění: python3 scripts/owl-hat-mask.py   (Pillow, numpy, opencv-python-headless)
# Stejně maska ruky icons/logo-maska-ruka.webp: průhledná je zvednutá ruka se vztyčeným prstem (bez rukávu), když doplněk v ruce kreslí
# ruku jinak (hrnek drží níž, hůlku a pochodeň pěstí bez prstu); icons/logo-maska-oba.webp skryje čepici i ruku (CSS maska je na obrázku jen jedna).
import os
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LOGO = os.path.join(ROOT, 'icons', 'logo.webp')
OUT = os.path.join(ROOT, 'icons', 'logo-maska.webp')
OUT_HAND = os.path.join(ROOT, 'icons', 'logo-maska-ruka.webp')
OUT_BOTH = os.path.join(ROOT, 'icons', 'logo-maska-oba.webp')
HAT_BOTTOM = 112  # pod touto řádkou už je hlava sovy (čepice sahá nejníž k obočí)
# Zvednutá ruka v pixelech loga: mnohoúhelník vlevo od hlavy a límce, od špičky prstu po rukáv; vínový rukáv v něm zůstává (barva obleku)
HAND_POLY = [(0, 128), (57, 128), (57, 186), (68, 200), (72, 246), (64, 272), (0, 272)]


def save_mask(mask, path):
    out = np.zeros(mask.shape + (4,), np.uint8)
    out[..., :3] = 255
    out[..., 3] = (np.clip(mask, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(path, 'WEBP', lossless=True)


def hand_mask(rgba):
    """Maska ruky (1 = vidět, 0 = skrýt): neprůhledné pixely loga v HAND_POLY kromě vínového rukávu a jeho světlejších záhybů."""
    from PIL import ImageDraw
    poly = Image.new('L', (rgba.shape[1], rgba.shape[0]), 0)
    ImageDraw.Draw(poly).polygon(HAND_POLY, fill=1)
    zone = np.asarray(poly) > 0
    hsv = cv2.cvtColor(rgba[..., :3], cv2.COLOR_RGB2HSV).astype(np.int32)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    sleeve = ((h >= 160) | (h <= 6)) & (s > 90) & (v > 80)
    sleeve = cv2.morphologyEx(sleeve.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
    cut = zone & ~sleeve
    cut = cv2.GaussianBlur(cut.astype(np.float32), (0, 0), 0.6)
    return np.clip(1.0 - cut * 3.0, 0, 1)


def build():
    rgba = np.asarray(Image.open(LOGO).convert('RGBA'))
    rgb = rgba[..., :3]
    alpha = rgba[..., 3]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.int32)  # H 0–179
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    ys = np.arange(rgba.shape[0])[:, None]
    # vínová čepice: červeno-fialový odstín, sytá, ne světlá
    maroon = ((h >= 160) | (h <= 6)) & (s > 110) & (v < 190) & (alpha > 128) & (ys < HAT_BOTTOM)
    maroon = cv2.morphologyEx(maroon.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # největší souvislá plocha = čepice (obočí a obrys sovy pod ní jsou tmavší a menší)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(maroon, 8)
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    hat = (labels == biggest).astype(np.uint8)
    hat = cv2.morphologyEx(hat, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    # Čepice sahá v každém sloupci jen po svůj spodní okraj: pod ním je hlava sovy (obočí, obrys), ta zůstává
    h_, w_ = hat.shape
    bottom = np.full(w_, -1, np.int32)
    for x in range(w_):
        col = np.nonzero(hat[:, x])[0]
        if col.size:
            bottom[x] = col.max()
    # sloupce bez čepice vedle ní (okraj nálepky): spodní okraj se převezme od nejbližšího sloupce s čepicí
    cols = np.nonzero(bottom >= 0)[0]
    for x in range(w_):
        if bottom[x] < 0 and cols.size:
            nearest = cols[np.argmin(np.abs(cols - x))]
            if abs(nearest - x) <= 14:
                bottom[x] = bottom[nearest] - abs(nearest - x) // 2
    below_hat = ys > (bottom[None, :] + 2)
    dark = (v < 120) & (alpha > 128)
    cream = (v > 190) & (s < 140) & (alpha > 128) & (ys < 100)
    outline = cv2.dilate(hat, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) & dark.astype(np.uint8)
    border = cv2.dilate(hat, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (23, 23))) & cream.astype(np.uint8)
    zone = np.maximum(np.maximum(hat, outline), border)
    zone = np.where(below_hat, 0, zone).astype(np.uint8)
    zone = cv2.morphologyEx(zone, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    # zlatý knoflík nahoře uprostřed (s obrysem a okrajem)
    gold = ((h >= 12) & (h <= 30) & (s > 120) & (v > 120) & (alpha > 128)).astype(np.uint8)
    gold[45:, :] = 0
    knob_area = cv2.dilate(gold, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    knob = (knob_area & ((dark | cream | (gold > 0)).astype(np.uint8)))
    knob = np.maximum(gold, knob)
    knob[50:, :] = 0
    cut = np.maximum(zone, knob)
    # Tenké zbytky obrysu čepice: cokoli neprůhledného těsně u odstraněné plochy (nad spodním okrajem čepice) se odstraní také
    near = cv2.dilate(cut, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    fringe = (near > 0) & (alpha > 0) & (~below_hat)
    cut = np.maximum(cut, fringe.astype(np.uint8))
    # Světlý okraj nálepky podél oušek vedle čepice: po odstranění čepice z něj zbudou tenké čáry nad hlavou (u klobouků bez křidélek
    # trčí vedle krempy jako růžky). Co je nad spodním okrajem čepice a po otevření (9 × 9) zmizí, je takový zbytek a odstraní se také.
    rest = ((alpha > 128) & (cut == 0)).astype(np.uint8)
    thin = (rest > 0) & (cv2.morphologyEx(rest, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) == 0) & (ys < HAT_BOTTOM)
    thin = cv2.dilate(thin.astype(np.uint8), np.ones((3, 3), np.uint8)) & (ys < HAT_BOTTOM).astype(np.uint8)
    cut = np.maximum(cut, thin)
    cut = cv2.GaussianBlur(cut.astype(np.float32), (0, 0), 0.6)
    mask = np.clip(1.0 - cut * 3.0, 0, 1)
    out = np.zeros((rgba.shape[0], rgba.shape[1], 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = (mask * 255).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(OUT, 'WEBP', lossless=True)
    hand = hand_mask(rgba)
    save_mask(hand, OUT_HAND)
    save_mask(np.minimum(mask, hand), OUT_BOTH)
    if os.environ.get('HAND'):
        mask = hand
    # náhled
    prev = rgba.copy()
    prev[..., 3] = (alpha.astype(np.float32) * mask).astype(np.uint8)
    return Image.fromarray(prev, 'RGBA')


if __name__ == '__main__':
    preview = build()
    bg = Image.new('RGBA', preview.size, (52, 53, 58, 255))
    bg.alpha_composite(preview)
    if os.environ.get('PREVIEW'):
        bg.resize((bg.width * 2, bg.height * 2), Image.LANCZOS).convert('RGB').save(os.environ['PREVIEW'])
    print('ok')
