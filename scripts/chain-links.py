# Články řetězu pro pás v Řetězovce: branding/ikony/clanek*.png → icons/retez/{celem,bokem,prasknuty}.webp
# Pozadí se vyřízne jako u ikon (scripts/topic-icons.py), článek se otočí podle hlavní osy na ležato, ořízne a uloží.
# celem = článek s velkým otvorem (clanek.png), bokem = článek z boku zúžený na tenkou tyčku (poměr stran 5 : 1), která prochází
# otvory sousedních článků (chain.js linkSvg kreslí její bližší polovinu ještě jednou přes obruč, takže je řetěz provlečený),
# prasknuty = prasklý článek. Spuštění: python3 scripts/chain-links.py   (Pillow, numpy)
import os, importlib.util
import numpy as np
from PIL import Image

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
spec = importlib.util.spec_from_file_location('topic_icons', os.path.join(root, 'scripts', 'topic-icons.py'))
icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icons)

def axis_angle(im):
    # Úhel hlavní osy neprůhledné části (ve stupních, proti směru hodinových ručiček, jak ho čeká Image.rotate)
    a = np.asarray(im)[..., 3] > 40
    ys, xs = np.nonzero(a)
    cov = np.cov(np.vstack([xs - xs.mean(), ys - ys.mean()]))
    vec = np.linalg.eigh(cov)[1][:, 1]
    return -np.degrees(np.arctan2(vec[1], vec[0]))

os.makedirs(os.path.join(root, 'icons', 'retez'), exist_ok=True)
# (zdroj, výstup, šířka v px, poměr šířky k výšce nebo None = jak je)
for name, out, width, ratio in [('clanek', 'celem', 160, None), ('clanek-bokem', 'bokem', 176, 5.0), ('clanek-prasknuty', 'prasknuty', 160, None)]:
    im = icons.cut(os.path.join(root, 'branding', 'ikony', f'{name}.png'), name)
    angle = axis_angle(im)
    angle = (angle + 90) % 180 - 90  # osa je bez směru: otočí se o nejmenší úhel
    if abs(angle) > 2:
        im = im.rotate(-angle, resample=Image.BICUBIC, expand=True)
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    im = im.resize((width, max(1, round(width / ratio if ratio else im.height * width / im.width))), Image.LANCZOS)
    path = os.path.join(root, 'icons', 'retez', f'{out}.webp')
    im.save(path, 'WEBP', quality=90, method=6)
    print(out, im.size, os.path.getsize(path), 'B')
