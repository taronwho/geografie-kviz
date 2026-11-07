# Ikony témat: branding/ikony/<téma>.png (obrázek z generátoru na tmavém pozadí #2d3034) → icons/topics/<téma>.webp
# Pozadí se vyřízne jako u loga (scripts/logo-cutout.py), ikona se ořízne a vloží do čtverce 192×192 s malým okrajem.
# Spuštění: python3 scripts/topic-icons.py [téma …]   (Pillow, numpy)
import sys, os, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 192
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
# Záře kolem předmětu mimo krémový obrys (sova-titul-9: tyrkysová záře kolem plovoucí knihy): v zadaném výřezu (podíl šířky
# a výšky: x0, y0, x1, y1) se odstraní vše, kam se od okraje dostane výplň bez přechodu přes krémový obrys nebo tmavě vínovou čáru
GLOW = {'sova-titul-9': (0.52, 0.0, 0.92, 0.40)}

def cream_like(a, bg, cream, full):
    # Barva na přímce pozadí → krémový obrys (full=False: i přechod z pozadí do krémové, full=True: jen skoro krémová)
    d = cream - bg
    t = ((a - bg) * d).sum(axis=-1) / (d * d).sum()
    perp = np.sqrt((((a - bg) - t[..., None] * d) ** 2).sum(axis=-1))
    return (perp < 35) & (t > (0.85 if full else 0.15)) & (t < 1.15)

def cut(path, name=''):
    img = Image.open(path).convert('RGB')
    a = np.asarray(img).astype(np.float32)
    H, W, _ = a.shape
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    dark = Image.fromarray(((dist < 40) * 255).astype(np.uint8)).copy()
    ImageDraw.floodfill(dark, (3, 3), 128)
    outside = np.asarray(dark) == 128
    out0 = Image.fromarray((outside * 255).astype(np.uint8))
    band0 = (np.asarray(out0.filter(ImageFilter.MaxFilter(21))) > 0) & ~(np.asarray(out0.filter(ImageFilter.MaxFilter(7))) > 0)
    cream0 = np.median(a[band0], axis=0)
    # Uzavřené mezery uvnitř ikony (mezi drahami elektronů, uvnitř ucha…) mají také barvu pozadí a s okrajem nesouvisí:
    # i ty jsou průhledné, ale jen dostatečně velké, opravdu barvy pozadí a lemované krémovým obrysem
    # (drobné tmavé detaily kresby a tmavé plochy uvnitř předmětu, např. inkoust v kalamáři, zůstanou)
    near = (dist < 22) & ~outside
    near_img = Image.fromarray((near * 255).astype(np.uint8))
    core = np.asarray(near_img.filter(ImageFilter.MinFilter(5))) > 0
    holes = Image.fromarray((near * 255).astype(np.uint8)).copy()
    remaining = core.copy()
    while remaining.any():
        y, x = np.unravel_index(np.argmax(remaining), remaining.shape)
        ImageDraw.floodfill(holes, (int(x), int(y)), 100)
        comp = np.asarray(holes) == 100
        ys, xs = np.nonzero(comp)
        y0, y1, x0, x1 = max(0, ys.min() - 12), min(H, ys.max() + 13), max(0, xs.min() - 12), min(W, xs.max() + 13)
        piece = comp[y0:y1, x0:x1]
        rim = (np.asarray(Image.fromarray((piece * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0) & ~piece & ~near[y0:y1, x0:x1]
        lined = rim.any() and cream_like(a[y0:y1, x0:x1][rim], bg, cream0, False).mean() > 0.5
        ImageDraw.floodfill(holes, (int(x), int(y)), 50 if lined else 60)
        remaining &= ~comp
    outside = outside | (np.asarray(holes) == 50)
    glow = np.zeros((H, W), bool)
    if name in GLOW:
        gx0, gy0, gx1, gy1 = GLOW[name]
        box = np.zeros((H, W), bool)
        box[int(gy0 * H):int(gy1 * H), int(gx0 * W):int(gx1 * W)] = True
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        maroon = (r - g > 25) & (r - b > 8) & (r < 140) & (g < 80)
        # Zůstane krémový obrys, tmavě vínové čáry a jasné plochy (stránky knihy, hvězdičky); tmavá záře zmizí
        wall = cream_like(a, bg, cream0, True) | maroon | (a.max(axis=-1) > 190)
        # Bariéra o dva pixely širší: uzavře šev mezi krémovým obrysem a čárou, tenké čáry mezi stránkami i úhlopříčné mezery
        wall = np.asarray(Image.fromarray((wall * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
        open_img = Image.fromarray((((~wall & box) | outside) * 255).astype(np.uint8)).copy()
        ImageDraw.floodfill(open_img, (3, 3), 128)
        glow = (np.asarray(open_img) == 128) & box
        outside = outside | glow
    out_img = Image.fromarray((outside * 255).astype(np.uint8))
    ring = np.asarray(out_img.filter(ImageFilter.MaxFilter(7))) > 0
    band = (np.asarray(out_img.filter(ImageFilter.MaxFilter(21))) > 0) & ~ring
    cream = np.median(a[band], axis=0)
    span = np.sqrt(((cream - bg) ** 2).sum())
    edge = np.clip((dist - 14.0) / (span * 0.92 - 14.0), 0, 1)
    alpha = np.ones((H, W), np.float32)
    alpha[ring] = edge[ring]
    alpha[glow] = 0
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
    im = cut(path, name)
    size = 320 if name.startswith('sova-') else SIZE  # sova v pózách je větší (zobrazuje se velká)
    inner = size - 8
    scale = inner / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    out = os.path.join(root, 'icons', 'topics', name + '.webp')
    canvas.save(out, 'WEBP', quality=90, method=6)
    print(name, os.path.getsize(out), 'B')
