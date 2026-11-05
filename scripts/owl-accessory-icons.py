# Ikony doplňků sovy pro výběr v Nastavení → Sova: z obrázků branding/doplnky-ikony/<id>.jpg (doplněk na tmavém pozadí) vyřízne
# pozadí (i uvnitř smyček, třeba u šály a medaile), ořízne na obsah a uloží icons/doplnky/<id>-ikona.webp (96×96, průhledné).
# Spuštění: python3 scripts/owl-accessory-icons.py [id ...]   (Pillow, numpy, opencv-python-headless)
import os, sys, glob
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'branding', 'doplnky-ikony')
OUT = os.path.join(ROOT, 'icons', 'doplnky')
SIZE = 96


def cut(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[:10].reshape(-1, 3), rgb[-10:].reshape(-1, 3), rgb[:, :10].reshape(-1, 3), rgb[:, -10:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    bgish = (dist < 26).astype(np.uint8)
    # souvislé plochy barvy pozadí: ty u okraje a velké (díry ve smyčkách, čočky) jsou pozadí, drobné tmavé detaily zůstanou
    n, labels, stats, _ = cv2.connectedComponentsWithStats(bgish, 4)
    remove = np.zeros_like(bgish)
    big = max(900, int(h * w * 0.0004))
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        touches = x == 0 or y == 0 or x + bw >= w or y + bh >= h
        if touches or area >= big:
            remove[labels == i] = 1
    # hladký okraj: průhlednost podle vzdálenosti od pozadí v těsném pásu kolem odstraněné plochy
    near = cv2.dilate(remove, np.ones((9, 9), np.uint8)) > 0
    soft = np.clip((dist - 14) / 40.0, 0, 1)
    alpha = np.where(remove > 0, 0.0, np.where(near, soft, 1.0))
    alpha = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 0.8)
    alpha[remove > 0] = np.minimum(alpha[remove > 0], 0.0)
    rgba = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def icon(img):
    box = img.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    crop = img.crop(box)
    side = max(crop.size)
    pad = int(side * 0.05)
    sq = Image.new('RGBA', (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
    sq.alpha_composite(crop, ((side + 2 * pad - crop.width) // 2, (side + 2 * pad - crop.height) // 2))
    return sq.resize((SIZE, SIZE), Image.LANCZOS)


def drop_specks(img):
    """Z vrstvy se pro ikonu odstraní drobné kousky (zbytky rozdílu proti původní sově)."""
    a = np.asarray(img).copy()
    mask = (a[..., 3] > 40).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n > 2:
        biggest = stats[1:, cv2.CC_STAT_AREA].max()
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] < biggest * 0.04:
                a[labels == i, 3] = 0
    return Image.fromarray(a, 'RGBA')


def layer_ids():
    """Doplňky bez vlastního obrázku ikony (téma doplňky): ikona se vyrobí přímo z vrstvy icons/doplnky/<id>.webp."""
    colors = ('cervena', 'oranzova', 'zluta', 'zelena', 'modra', 'fialova', 'ruzova', 'ikona')
    names = {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(OUT, '*.webp'))}
    have = {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(SRC, '*.jpg'))}
    return sorted(n for n in names if not n.endswith(tuple('-' + c for c in colors)) and n not in have)


def main(ids):
    os.makedirs(OUT, exist_ok=True)
    for name in layer_ids():
        if ids and name not in ids:
            continue
        out = icon(drop_specks(Image.open(os.path.join(OUT, name + '.webp')).convert('RGBA')))
        out.save(os.path.join(OUT, f'{name}-ikona.webp'), 'WEBP', quality=92, alpha_quality=100, method=6)
        print(name, 'ok (z vrstvy)')
    for path in sorted(glob.glob(os.path.join(SRC, '*.jpg'))):
        name = os.path.splitext(os.path.basename(path))[0]
        if ids and name not in ids:
            continue
        out = icon(cut(path))
        out.save(os.path.join(OUT, f'{name}-ikona.webp'), 'WEBP', quality=92, alpha_quality=100, method=6)
        print(name, 'ok')


if __name__ == '__main__':
    main(set(sys.argv[1:]))
