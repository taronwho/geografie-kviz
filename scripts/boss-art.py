# Bossové týdne (docs/OBRAZKY.md č. 215–230, 244–259) a jejich arény (č. 231, 268–274).
#  - branding/ikony/boss-<id>[-zraneny|-vkoncich|-porazeny].png → icons/topics/boss-….webp (SIZE × SIZE, průhledné pozadí).
#    Pozadí se vyřízne jako u ikon (scripts/topic-icons.py cut()) s jednou výjimkou: díra uvnitř postavy (mezera mezi křídlem
#    a tělem) je průhledná, jen když ji lemuje teplý krémový okraj samolepky. Frak Maestra nebo svetr Režiséra mají skoro barvu
#    pozadí a lemuje je bílá košile nebo tmavá linka, takže zůstanou. Postava stojí u spodního okraje (v aréně na zemi).
#  - branding/areny/arena-<id>.jpg → icons/topics/arena-<id>.webp (na výšku, šířka ARENA_W).
# Spuštění: python3 scripts/boss-art.py [jméno …] [--preview=soubor.png]   (Pillow, numpy)
import os, sys, glob, importlib.util
from PIL import Image

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
spec = importlib.util.spec_from_file_location('topic_icons', os.path.join(root, 'scripts', 'topic-icons.py'))
icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icons)
SIZE = 384
ARENA_W = 720
WORK = 1024

_cream_like = icons.cream_like
def warm_cream_like(a, bg, cream, full):
    # Krémová musí být teplá (červená složka výrazně nad modrou): bílá košile nebo plášť krémový okraj nejsou
    return _cream_like(a, bg, cream, full) & ((a[..., 0] - a[..., 2]) > 28)
icons.cream_like = warm_cream_like

# Bossové s plochami skoro v barvě pozadí (černý frak Maestra): pozadí se vyřízne jen vně krémového okraje samolepky. Výplň od
# rohu jde jen přes pixely barvy pozadí a nepřekročí krémový okraj (o 4 px rozšířený, ať švem neproteče); vše ostatní zůstane
# neprůhledné, měkký je jen přechod na samém okraji
NO_HOLES = {'boss-maestro'}

def cut_outline_only(path):
    import numpy as np
    from PIL import ImageDraw, ImageFilter
    img = Image.open(path).convert('RGB')
    a = np.asarray(img).astype(np.float32)
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    warm = (a[..., 0] - a[..., 2] > 25) & (a.mean(axis=2) > 130)
    wall = np.asarray(Image.fromarray((warm * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    open_ = Image.fromarray((((dist < 40) & ~wall) * 255).astype(np.uint8)).copy()
    ImageDraw.floodfill(open_, (3, 3), 128)
    outside = np.asarray(open_) == 128
    inside = ~outside
    alpha = np.where(inside, 255.0, np.clip((dist - 14) / 60, 0, 1) * 255)
    alpha = np.asarray(Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)
    alpha[inside & ~np.asarray(Image.fromarray((outside * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))).astype(bool)] = 255
    im = Image.fromarray(np.dstack([a, alpha]).round().astype(np.uint8), 'RGBA')
    return im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())

def portrait(name):
    src = os.path.join(root, 'branding', 'ikony', name + '.png')
    tmp = os.path.join(root, 'branding', 'ikony', '.' + name + '.work.png')
    Image.open(src).convert('RGB').resize((WORK, WORK), Image.LANCZOS).save(tmp)
    try: im = cut_outline_only(tmp) if name in NO_HOLES else icons.cut(tmp, name)
    finally: os.remove(tmp)
    inner = SIZE - 8
    scale = inner / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((SIZE - im.width) // 2, SIZE - 4 - im.height), im)
    out = os.path.join(root, 'icons', 'topics', name + '.webp')
    canvas.save(out, 'WEBP', quality=88, method=6)
    print(name, os.path.getsize(out), 'B')
    return canvas

def arena(name):
    im = Image.open(os.path.join(root, 'branding', 'areny', name + '.jpg')).convert('RGB')
    im = im.resize((ARENA_W, round(im.height * ARENA_W / im.width)), Image.LANCZOS)
    out = os.path.join(root, 'icons', 'topics', name + '.webp')
    im.save(out, 'WEBP', quality=78, method=6)
    print(name, im.size, os.path.getsize(out), 'B')

if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    preview = next((x.split('=', 1)[1] for x in sys.argv[1:] if x.startswith('--preview=')), None)
    names = args or sorted(os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(root, 'branding', 'ikony', 'boss-*.png')))
    tiles = [portrait(n) for n in names if n.startswith('boss-')]
    for p in sorted(glob.glob(os.path.join(root, 'branding', 'areny', 'arena-*.jpg'))):
        n = os.path.splitext(os.path.basename(p))[0]
        if not args or n in args: arena(n)
    if preview and tiles:
        cols = 4
        sheet = Image.new('RGB', (cols * 200, ((len(tiles) + cols - 1) // cols) * 200), (58, 46, 40))
        for i, t in enumerate(tiles):
            small = t.resize((196, 196), Image.LANCZOS)
            sheet.paste(small, ((i % cols) * 200 + 2, (i // cols) * 200 + 2), small)
        sheet.save(preview)
