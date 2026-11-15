#!/usr/bin/env python3
"""Náhled odkazu (Open Graph, 1200×630): icons/og-mudrlant.png z existující kresby sovy (branding/sova.png) v barvách aplikace.

Ukáže se u sdíleného odkazu (výzva, výsledek) v Messengeru, WhatsAppu a dalších: vlevo Mudrlant na krémovém kruhu, vpravo název,
podtitul a zlatý štítek. Písmo Inter (systémové fonty), bez něj DejaVu Sans.
Spuštění: python3 scripts/og-image.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'icons' / 'og-mudrlant.png'
W, H = 1200, 630
BRAND_TOP = (135, 35, 63)      # brand-700 #87233f
BRAND_BOTTOM = (74, 16, 34)
CREAM = (254, 226, 176)        # cream #fee2b0
GOLD = (232, 174, 56)          # gold-400 #e8ae38
GOLD_DARK = (59, 30, 10)       # gold-950


def font(weight, size):
    for path in (f'/usr/share/fonts/opentype/inter/Inter-{weight}.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def wrap(draw, text, face, width):
    lines, line = [], ''
    for word in text.split():
        trial = f'{line} {word}'.strip()
        if draw.textlength(trial, font=face) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + ([line] if line else [])


def main():
    image = Image.new('RGB', (W, H))
    draw = ImageDraw.Draw(image)
    # Svislý přechod v barvě značky
    for y in range(H):
        t = y / (H - 1)
        draw.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BRAND_TOP, BRAND_BOTTOM)))
    # Jemné zlaté tečky (vzor jako na kartách aplikace)
    dots = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dot_draw = ImageDraw.Draw(dots)
    for y in range(18, H, 36):
        for x in range(18 + (18 if (y // 36) % 2 else 0), W, 36):
            dot_draw.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(*GOLD, 34))
    image.paste(dots, (0, 0), dots)

    # Krémový kruh se září a na něm sova
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([40, 55, 560, 575], fill=(*CREAM, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    image.paste(glow, (0, 0), glow)
    disc = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(disc).ellipse([70, 85, 530, 545], fill=(*CREAM, 255), outline=(*GOLD, 255), width=8)
    image.paste(disc, (0, 0), disc)
    owl = Image.open(ROOT / 'branding' / 'sova.png').convert('RGBA')
    owl.thumbnail((470, 520), Image.LANCZOS)
    shadow = Image.new('RGBA', owl.size, (0, 0, 0, 0))
    shadow.putalpha(owl.getchannel('A').point(lambda a: a * 0.35))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    left = 300 - owl.width // 2
    top = 575 - owl.height
    image.paste(shadow, (left + 6, top + 12), shadow)
    image.paste(owl, (left, top), owl)

    # Název, podtitul a štítek
    x = 600
    draw = ImageDraw.Draw(image)
    title = font('Black', 118)
    draw.text((x + 3, 128 + 5), 'Mudrlant', font=title, fill=(40, 6, 16))
    draw.text((x, 128), 'Mudrlant', font=title, fill=CREAM)
    sub = font('Bold', 40)
    y = 290
    for line in wrap(draw, 'Vědomostní kvíz ze zeměpisu, historie, přírody, umění, kultury a sportu', sub, W - x - 50):
        draw.text((x, y), line, font=sub, fill=(255, 255, 255))
        y += 52
    pill = font('ExtraBold', 34)
    label = 'Přijmi výzvu a porovnej se'
    width = draw.textlength(label, font=pill)
    y += 26
    draw.rounded_rectangle([x, y, x + width + 56, y + 70], radius=35, fill=GOLD)
    draw.text((x + 28, y + 14), label, font=pill, fill=GOLD_DARK)
    image.save(OUT, optimize=True)
    print(f'{OUT.relative_to(ROOT)}: {W}×{H}, {OUT.stat().st_size // 1024} kB')


if __name__ == '__main__':
    main()
