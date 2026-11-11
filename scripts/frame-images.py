# Obrázkové rámečky profilu (docs/OBRAZKY.md č. 109–118): branding/ramecky/<id>.jpg (prsten z generátoru na tmavém pozadí #2d3034,
# krémový obrys na vnějším i vnitřním okraji, prázdný kulatý střed) → icons/frames/<id>.webp (SIZE × SIZE, průhledné pozadí vně
# prstenu i v jeho středu, aby byl vidět obrázek hráče).
# Pozadí se vyřízne jako u ikon (scripts/topic-icons.py cut(): vně výplň od okraje, uvnitř uzavřené mezery lemované krémovým obrysem,
# tedy i střed prstenu; měkký přechod okraje bez šedého lemu). Díru pak najde výplň od středu (průhledná souvislá oblast; když střed
# průhledný není nebo díra sahá k okraji, skript skončí chybou) a v jejím kruhu je vše průhledné (žádné zbytky šumu JPEG).
# Každý rámeček se zmenší a posune tak, aby střed díry byl uprostřed plátna a díra měla vždy stejnou
# velikost: obrázek hráče (kolečko) zabere BOX plátna a jeho okraj leží pod vnitřním krémovým obrysem (FIT). CSS (.frame-art
# v src/input.css) tak pro všechny rámečky použije stejný přesah inset: -(1 / BOX - 1) / 2 · 100 %. Ozdoby (koruna, hlava draka,
# slunce, manometr) přesahují prsten ven, to nevadí.
# Spuštění: python3 scripts/frame-images.py [id …] [--preview=soubor.png]   (Pillow, numpy)
#   Vypíše a zapíše branding/ramecky/rozmery.json: průměr díry (hole), vnější průměr prstenu (ring, medián přes směry, ozdoby
#   nevadí) a nejvzdálenější bod (reach, dvojnásobek) v podílech strany obrázku hráče (1 = šířka kolečka), kruhovost díry
#   (round: 5. a 95. percentil poloměru vůči mediánu) a velikost souboru. tests/look-frames.test.js podle ní hlídá, že se všechno
#   vejde na plátno. --preview=soubor.png uloží náhled všech rámečků na světlém a tmavém pozadí s barevným kolečkem v díře.
import io, json, os, sys, glob, importlib.util
import numpy as np
from PIL import Image, ImageDraw

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
spec = importlib.util.spec_from_file_location('topic_icons', os.path.join(root, 'scripts', 'topic-icons.py'))
topic_icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(topic_icons)

SIZE = 256   # strana výsledného obrázku
BOX = 0.5    # obrázek hráče (kolečko) = polovina strany plátna → v CSS inset: -50 %
FIT = 1.03   # kolečko je o 3 % větší než díra: jeho okraj se schová pod vnitřní krémový obrys (žádná mezera ani šedá čára)
WORK = 1024  # vyřezává se v tomto rozlišení (pro něj jsou nastavené filtry v topic-icons.py), zmenší se až výsledek

def hole_of(alpha):
    # Díra = souvislá průhledná oblast od prostředka obrázku (výplň od středu); nesmí sahat k okraji, jinak prsten není uzavřený
    H, W = alpha.shape
    clear = Image.fromarray(((alpha < 128) * 255).astype(np.uint8)).copy()
    ys, xs = np.nonzero(alpha >= 128)
    seed = (int((xs.min() + xs.max()) // 2), int((ys.min() + ys.max()) // 2))
    if alpha[seed[1], seed[0]] >= 128: raise SystemExit(f'střed obrázku není průhledný: {seed}')
    ImageDraw.floodfill(clear, seed, 128)
    hole = np.asarray(clear) == 128
    if hole[0].any() or hole[-1].any() or hole[:, 0].any() or hole[:, -1].any(): raise SystemExit('díra sahá k okraji obrázku')
    return hole

def rays(alpha, cx, cy, steps=720):
    # V každém směru od středu díry: kde začíná prsten (první neprůhledné místo) a kde končí (první průhledné za ním)
    H, W = alpha.shape
    inner, outer = [], []
    angles = np.linspace(0, 2 * np.pi, steps, endpoint=False)
    for angle in angles:
        dx, dy = np.cos(angle), np.sin(angle)
        r, start = 0.0, None
        while True:
            x, y = int(round(cx + dx * r)), int(round(cy + dy * r))
            if x < 0 or y < 0 or x >= W or y >= H: break
            if start is None and alpha[y, x] >= 128: start = r
            elif start is not None and alpha[y, x] < 128: break
            r += 0.5
        inner.append(start if start is not None else r)
        outer.append(r)
    return angles, np.array(inner), np.array(outer)

def fit_circle(xs, ys):
    # Kružnice metodou nejmenších čtverců (Kåsa): x² + y² = 2ax + 2by + c
    A = np.stack([2 * xs, 2 * ys, np.ones_like(xs)], 1)
    (ax, by, c), *_ = np.linalg.lstsq(A, xs ** 2 + ys ** 2, rcond=None)
    return ax, by, float(np.sqrt(c + ax ** 2 + by ** 2))

def process(path):
    src = Image.open(path).convert('RGB')
    if max(src.size) != WORK: src = src.resize((WORK, round(src.height * WORK / src.width)), Image.LANCZOS)
    buf = io.BytesIO()
    src.save(buf, 'PNG')
    buf.seek(0)
    im = topic_icons.cut(buf)
    a = np.asarray(im).astype(np.float32)
    alpha = a[..., 3]
    hole = hole_of(alpha)
    ys, xs = np.nonzero(hole)
    cx, cy = xs.mean(), ys.mean()
    # Střed a poloměr díry: kružnice proložená okrajem díry; směry, kde do díry zasahuje ozdoba (hlava draka, slunce, šlahoun),
    # se vynechají (víc než 3 % od mediánu); třikrát po sobě, ať se střed ustálí
    for _ in range(3):
        angles, inner, outer = rays(alpha, cx, cy)
        keep = np.abs(inner - np.median(inner)) < 0.03 * np.median(inner)
        cx, cy, r_hole = fit_circle(cx + np.cos(angles[keep]) * inner[keep], cy + np.sin(angles[keep]) * inner[keep])
    angles, inner, outer = rays(alpha, cx, cy)
    # V kruhu díry nic nezůstane (šum JPEG, osamělé tečky): celý průhledný až k měkkému okraji
    H, W = alpha.shape
    gy, gx = np.mgrid[0:H, 0:W]
    rr = np.sqrt((gx - cx) ** 2 + (gy - cy) ** 2)
    a[..., 3][(rr < inner.min() - 1) | hole] = 0
    r_max = float(rr[a[..., 3] > 12].max())
    # Kolečko hráče: o FIT větší než díra a aspoň v 90 % směrů až pod prsten (u nepravidelné díry, např. Růže a trny, ať mezi
    # obrázkem a prstenem nezůstane mezera)
    radius = max(r_hole * FIT, float(np.percentile(inner, 90)))
    scale = BOX * SIZE / (2 * radius)
    # Výřez kolem středu díry (plátno = kolečko / BOX) se zmenší najednou i s posunem o zlomek pixelu, s předem vynásobenou
    # průhledností (jinak by se do měkkých okrajů vmíchala barva průhledných pixelů); okraj navíc pro ozdoby u kraje výřezu
    pad = W
    big = Image.new('RGBA', (W + 2 * pad, H + 2 * pad), (0, 0, 0, 0))
    big.paste(Image.fromarray(a.round().astype(np.uint8), 'RGBA'), (pad, pad))
    half = SIZE / 2 / scale
    region = (pad + cx - half, pad + cy - half, pad + cx + half, pad + cy + half)
    canvas = big.convert('RGBa').resize((SIZE, SIZE), Image.LANCZOS, box=region).convert('RGBA')
    box = 2 * radius  # strana kolečka hráče v pixelech výřezu
    median = float(np.median(inner))
    info = {'hole': round(2 * r_hole / box, 4), 'ring': round(2 * float(np.median(outer)) / box, 4), 'reach': round(2 * r_max / box, 4),
            'round': [round(float(np.percentile(inner, 5)) / median, 3), round(float(np.percentile(inner, 95)) / median, 3)]}
    if r_max * scale > SIZE / 2 - 1: raise SystemExit(f'{path}: ozdoba přesahuje plátno (reach {info["reach"]}, víc než {1 / BOX})')
    return canvas, info

def preview(names, out):
    tile = 220
    sheet = Image.new('RGB', (tile * len(names), tile * 2), 'white')
    draw = ImageDraw.Draw(sheet)
    for index, name in enumerate(names):
        frame = Image.open(os.path.join(root, 'icons', 'frames', name + '.webp')).convert('RGBA').resize((tile, tile), Image.LANCZOS)
        for row, bg in enumerate(['#f7f6f3', '#212326']):
            x0, y0 = index * tile, row * tile
            draw.rectangle([x0, y0, x0 + tile, y0 + tile], fill=bg)
            d = tile * BOX
            draw.ellipse([x0 + (tile - d) / 2, y0 + (tile - d) / 2, x0 + (tile + d) / 2, y0 + (tile + d) / 2], fill='#10b981')
            sheet.paste(frame, (x0, y0), frame)
    sheet.save(out)
    print('náhled', out)

def main(args):
    wanted = [arg for arg in args if not arg.startswith('--')]
    os.makedirs(os.path.join(root, 'icons', 'frames'), exist_ok=True)
    table_path = os.path.join(root, 'branding', 'ramecky', 'rozmery.json')
    try:
        with open(table_path) as handle: table = json.load(handle)['frames']
    except (OSError, ValueError, KeyError): table = {}
    names = []
    for path in sorted(glob.glob(os.path.join(root, 'branding', 'ramecky', '*.jpg'))):
        name = os.path.splitext(os.path.basename(path))[0]
        names.append(name)
        if wanted and name not in wanted: continue
        canvas, info = process(path)
        out = os.path.join(root, 'icons', 'frames', name + '.webp')
        canvas.save(out, 'WEBP', quality=88, method=6, alpha_quality=100)
        info['bytes'] = os.path.getsize(out)
        table[name] = info
        print(name, info)
    # Jeden řádek na rámeček (čitelné v diffu)
    rows = ',\n'.join(f'  {json.dumps(name)}: {json.dumps(table[name])}' for name in sorted(table))
    with open(table_path, 'w') as handle:
        handle.write(f'{{"size": {SIZE}, "box": {BOX}, "fit": {FIT}, "frames": {{\n{rows}\n}}}}\n')
    for arg in args:
        if arg.startswith('--preview='): preview(names, arg.split('=', 1)[1])

if __name__ == '__main__':
    main(sys.argv[1:])
