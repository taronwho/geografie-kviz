# Vyřízne samolepku sovy z tmavého pozadí obrázku z generátoru (branding/sova-original.jpg → branding/sova.png).
# Pozadí = tmavé pixely souvislé s okrajem obrázku (flood fill), takže tmavé obrysy a zornice uvnitř samolepky zůstanou.
# Na hranici krémového obrysu se průhlednost dopočítá z odstínu, ať je okraj hladký i na světlém pozadí.
# Potřebuje Pillow a numpy. Spuštění: python3 scripts/logo-cutout.py branding/sova-original.jpg branding/sova.png
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert('RGB')
img = img.crop((4, 4, img.width - 4, img.height - 4))  # krajní řádky JPEGu mají jinou barvu
a = np.asarray(img).astype(np.float32)
H, W, _ = a.shape
border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
bg = np.median(border, axis=0)
dist = np.sqrt(((a - bg) ** 2).sum(axis=2))

dark = Image.fromarray(((dist < 40) * 255).astype(np.uint8)).copy()
ImageDraw.floodfill(dark, (10, 10), 128)
outside = np.asarray(dark) == 128
outside_img = Image.fromarray((outside * 255).astype(np.uint8))
# Pás kolem hranice (vnějšek rozšířený o 4 px) a krémová barva obrysu těsně uvnitř
ring = np.asarray(outside_img.filter(ImageFilter.MaxFilter(9))) > 0
inner_band = (np.asarray(outside_img.filter(ImageFilter.MaxFilter(25))) > 0) & ~ring
cream = np.median(a[inner_band], axis=0)

span = np.sqrt(((cream - bg) ** 2).sum())
lo, hi = 14.0, span * 0.92
edge_alpha = np.clip((dist - lo) / (hi - lo), 0, 1)
alpha = np.ones((H, W), np.float32)
alpha[ring] = edge_alpha[ring]
# Barva na okraji bez příměsi pozadí: c = (p - (1 - α) · bg) / α
rgb = a.copy()
m = ring & (alpha > 0.02)
rgb[m] = np.clip((a[m] - (1 - alpha[m])[:, None] * bg) / alpha[m][:, None], 0, 255)
rgb[ring & (alpha <= 0.02)] = cream

result = Image.fromarray(np.dstack([rgb, alpha * 255]).round().astype(np.uint8), 'RGBA')
bbox = result.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
pad = 6
result.crop((bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad)).save(out, optimize=True)
print(out, 'pozadí', bg, 'obrys', cream)
