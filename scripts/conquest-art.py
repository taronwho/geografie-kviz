# Obrázky Dobývání, které nejsou běžné ikony (docs/OBRAZKY.md č. 264 a 265):
#  - branding/ikony/pecet.png → icons/topics/pecet.webp (256 × 256): prázdná šedá vosková pečeť vystředěná na tělo pečeti (ne na kapky),
#    aby střed vtlačeného kruhu byl přesně uprostřed; conquest.js sealSvg ji přebarví na barvu hráče (feColorMatrix) a vtiskne znak.
#  - branding/textury/textura-akvarel.jpg → icons/textury/textura-akvarel.webp (512 × 512): šedá akvarelová lazura, kterou mapa násobí přes
#    barvu obsazených území (nerovnoměrnost skutečného akvarelu).
# Spuštění: python3 scripts/conquest-art.py   (Pillow, numpy, scipy)
import os, importlib.util
import numpy as np
from PIL import Image
from scipy import ndimage

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
spec = importlib.util.spec_from_file_location('topic_icons', os.path.join(root, 'scripts', 'topic-icons.py'))
icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icons)

im = icons.cut(os.path.join(root, 'branding', 'ikony', 'pecet.png'), 'pecet')
alpha = np.asarray(im)[..., 3] > 128
labels, count = ndimage.label(alpha)
sizes = ndimage.sum(alpha, labels, range(1, count + 1))
body = labels == (int(np.argmax(sizes)) + 1)
ys, xs = np.nonzero(body)
cy, cx = ys.mean(), xs.mean()
ya, xa = np.nonzero(alpha)
half = int(np.sqrt((ya - cy) ** 2 + (xa - cx) ** 2).max()) + 6
canvas = Image.new('RGBA', (2 * half, 2 * half), (0, 0, 0, 0))
canvas.paste(im, (int(round(half - cx)), int(round(half - cy))), im)
canvas.resize((256, 256), Image.LANCZOS).save(os.path.join(root, 'icons', 'topics', 'pecet.webp'), 'WEBP', quality=90, method=6)
print('pecet: tělo pečeti má poloměr', round(np.sqrt(body.sum() / np.pi) / (2 * half), 3), 'strany')

tex = Image.open(os.path.join(root, 'branding', 'textury', 'textura-akvarel.jpg')).convert('L').resize((512, 512), Image.LANCZOS)
tex.convert('RGB').save(os.path.join(root, 'icons', 'textury', 'textura-akvarel.webp'), 'WEBP', quality=88, method=6)
print('akvarel: průměrný jas', round(float(np.asarray(tex).mean()), 1))
