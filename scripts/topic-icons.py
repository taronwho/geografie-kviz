# Ikony témat: branding/ikony/<téma>.png (obrázek z generátoru na tmavém pozadí #2d3034) → icons/topics/<téma>.webp
# Pozadí se vyřízne jako u loga (scripts/logo-cutout.py), ikona se ořízne a vloží do čtverce 192×192 s malým okrajem.
# Spuštění: python3 scripts/topic-icons.py [téma …]   (Pillow, numpy)
import sys, os, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 192
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

def cut(path):
    img = Image.open(path).convert('RGB')
    a = np.asarray(img).astype(np.float32)
    H, W, _ = a.shape
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    dark = Image.fromarray(((dist < 40) * 255).astype(np.uint8)).copy()
    ImageDraw.floodfill(dark, (3, 3), 128)
    outside = np.asarray(dark) == 128
    # Uzavřené mezery uvnitř ikony (mezi drahami elektronů, uvnitř ucha…) mají také barvu pozadí a s okrajem nesouvisí:
    # i ty jsou průhledné, ale jen dostatečně velké a opravdu barvy pozadí (drobné tmavé detaily kresby zůstanou)
    near = (dist < 22) & ~outside
    near_img = Image.fromarray((near * 255).astype(np.uint8))
    core = np.asarray(near_img.filter(ImageFilter.MinFilter(5))) > 0
    holes = Image.fromarray((near * 255).astype(np.uint8)).copy()
    remaining = core.copy()
    while remaining.any():
        y, x = np.unravel_index(np.argmax(remaining), remaining.shape)
        ImageDraw.floodfill(holes, (int(x), int(y)), 100)
        remaining &= ~(np.asarray(holes) == 100)
    outside = outside | (np.asarray(holes) == 100)
    out_img = Image.fromarray((outside * 255).astype(np.uint8))
    ring = np.asarray(out_img.filter(ImageFilter.MaxFilter(7))) > 0
    band = (np.asarray(out_img.filter(ImageFilter.MaxFilter(21))) > 0) & ~ring
    cream = np.median(a[band], axis=0)
    span = np.sqrt(((cream - bg) ** 2).sum())
    edge = np.clip((dist - 14.0) / (span * 0.92 - 14.0), 0, 1)
    alpha = np.ones((H, W), np.float32)
    alpha[ring] = edge[ring]
    rgb = a.copy()
    m = ring & (alpha > 0.02)
    rgb[m] = np.clip((a[m] - (1 - alpha[m])[:, None] * bg) / alpha[m][:, None], 0, 255)
    rgb[ring & (alpha <= 0.02)] = cream
    im = Image.fromarray(np.dstack([rgb, alpha * 255]).round().astype(np.uint8), 'RGBA')
    return im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())

wanted = sys.argv[1:]
for path in sorted(glob.glob(os.path.join(root, 'branding', 'ikony', '*.png'))):
    name = os.path.splitext(os.path.basename(path))[0]
    if wanted and name not in wanted: continue
    im = cut(path)
    inner = SIZE - 8
    scale = inner / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
    out = os.path.join(root, 'icons', 'topics', name + '.webp')
    canvas.save(out, 'WEBP', quality=90, method=6)
    print(name, os.path.getsize(out), 'B')
