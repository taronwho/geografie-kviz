# Maska čepice sovy: icons/logo-maska.webp (258×320, stejný rám jako logo). Průhledná je výchozí čepice (vínová, její obrys, zlatý knoflík
# a světlý okraj nálepky kolem ní), zbytek je neprůhledný. Používá se jako CSS maska loga, když doplněk na hlavě čepici nahrazuje (helma, přilba, baret):
# výchozí čepice pak za doplňkem není vidět. Spuštění: python3 scripts/owl-hat-mask.py   (Pillow, numpy, opencv-python-headless)
import os
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LOGO = os.path.join(ROOT, 'icons', 'logo.webp')
OUT = os.path.join(ROOT, 'icons', 'logo-maska.webp')
HAT_BOTTOM = 112  # pod touto řádkou už je hlava sovy (čepice sahá nejníž k obočí)


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
    # obrys čepice (tmavý, těsně u ní) a světlý okraj nálepky kolem ní; hlava sovy (zlatá, krémová pod čepicí) zůstává
    dark = (v < 120) & (alpha > 128)
    cream = (v > 190) & (s < 140) & (alpha > 128) & (ys < 100)
    outline = cv2.dilate(hat, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) & dark.astype(np.uint8)
    border = cv2.dilate(hat, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))) & cream.astype(np.uint8)
    zone = np.maximum(np.maximum(hat, outline), border)
    zone = cv2.morphologyEx(zone, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    # zlatý knoflík nahoře uprostřed (s obrysem a okrajem)
    gold = ((h >= 12) & (h <= 30) & (s > 120) & (v > 120) & (alpha > 128)).astype(np.uint8)
    gold[45:, :] = 0
    knob_area = cv2.dilate(gold, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    knob = (knob_area & ((dark | cream | (gold > 0)).astype(np.uint8)))
    knob = np.maximum(gold, knob)
    knob[50:, :] = 0
    cut = np.maximum(zone, knob)
    cut = cv2.GaussianBlur(cut.astype(np.float32), (0, 0), 0.7)
    mask = np.clip((1.0 - cut * 1.8 - 0.3) / 0.4, 0, 1)
    out = np.zeros((rgba.shape[0], rgba.shape[1], 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = (mask * 255).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(OUT, 'WEBP', lossless=True)
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
