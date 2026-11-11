# Postavičky (profilové obrázky za odměny): branding/ikony/avatar-<název>.png → icons/avatars/<id>.webp (192 × 192, průhledné pozadí)
# a k nim vrstvy přebarvitelných částí icons/avatars/<id>-<část><barva>.webp (část 1–2, barva 1–9 podle PALETTE; stejné plátno
# jako základní obrázek, mimo část průhledné). Aplikace vrstvu položí přes základní obrázek (look.js CHARACTERS, app.js avatarHtml).
# Část se najde podle barvy (odstín, sytost, jas) a případně výřezů; přebarví se posunem odstínu (barevné části, zachová přechody
# a stínování) nebo obarvením (bílé a šedé části, např. čelenka). Spuštění: python3 scripts/avatar-icons.py [id …] [--preview]
import os, sys, importlib.util
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
spec = importlib.util.spec_from_file_location('topic_icons', os.path.join(root, 'scripts', 'topic-icons.py'))
topic_icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(topic_icons)

SIZE = 192
WORK = 768  # části se hledají a přebarvují ve větším rozlišení, zmenší se až výsledek
EDGE = 17   # šířka krémového okraje samolepky v pixelech plátna WORK (liché číslo)
# Barvy částí: (odstín 0–360, sytost, jas); pořadí = číslo barvy v uloženém obrázku (look.js AVATAR_COLORS)
PALETTE = [
    (355, 0.80, 0.86),  # 1 červená
    (26, 0.86, 0.96),   # 2 oranžová
    (49, 0.85, 0.98),   # 3 žlutá
    (128, 0.68, 0.74),  # 4 zelená
    (178, 0.76, 0.80),  # 5 tyrkysová
    (218, 0.74, 0.88),  # 6 modrá
    (272, 0.58, 0.80),  # 7 fialová
    (328, 0.52, 0.96),  # 8 růžová
    (225, 0.18, 0.30),  # 9 černá
]

# Postavičky: id → zdroj a části. Pravidlo části: hue (od, do; přes 360 = zabalí se), smin/smax (sytost), vmin/vmax (jas),
# box/out = výřezy v podílech šířky a výšky (x0, y0, x1, y1), kde se část hledá / nehledá, poly/outpoly = mnohoúhelníky [(x, y), …], kde ano / kde ne. Části jedné postavičky se nepřekrývají.
# outer = jen plochy, které sahají až ke krémovému okraji samolepky (záře za postavičkou); číslo = jak hluboko pod okrajem (px plátna WORK)
# se plocha musí objevit. Postavička má vlastní tmavý obrys, takže její stejně barevné věci (zlaté vavříny, svitky) do části nepatří.
# inner = naopak jen plochy, které ke krémovému okraji nesahají (krystaly bez záře za nimi).
# Část může mít edge = užší ochranný pruh u okraje místo EDGE (záře s tenkými paprsky až k okraji; krémovou barvu odstín části stejně nevybere).

# Mnohoúhelníky legendárních postaviček (podíly šířky a výšky): kde část je, když má stejnou barvu jako záře nebo věci kolem ní
SFINGA = [(0, 0.37), (0.1, 0.4), (0.16, 0.44), (0.21, 0.5), (0.24, 0.42), (0.28, 0.21), (0.37, 0.25), (0.63, 0.25), (0.72, 0.21), (0.76, 0.42), (0.79, 0.5), (0.84, 0.44), (0.9, 0.4), (1, 0.37), (1, 1), (0, 1)]  # sfinga s křídly; tyrkysová venku je záře
JELEN_PLAST = [(0.2, 0.86), (0.26, 0.71), (0.4, 0.66), (0.6, 0.66), (0.76, 0.71), (0.82, 0.86), (0.6, 0.99), (0.4, 0.99)]  # zelený plášť; zelená venku je les
# Krystaly na ramenou golema mají vlastní krémový lem (mnohoúhelníky těsně uvnitř něj), za nimi je stejně fialová záře
GOLEM_KRYSTALY_L = [(0.125, 0.5), (0.17, 0.495), (0.2, 0.515), (0.235, 0.515), (0.27, 0.55), (0.3, 0.59), (0.31, 0.76), (0.07, 0.76), (0.07, 0.625), (0.12, 0.615)]
GOLEM_KRYSTALY_R = [(0.66, 0.56), (0.7, 0.51), (0.74, 0.49), (0.77, 0.52), (0.8, 0.5), (0.86, 0.48), (0.875, 0.52), (0.875, 0.6), (0.9, 0.615), (0.915, 0.66), (0.9, 0.76), (0.66, 0.76)]
BOBR_PRILBA = [(0.3, 0.44), (0.31, 0.415), (0.355, 0.395), (0.375, 0.33), (0.41, 0.295), (0.47, 0.275), (0.54, 0.275), (0.6, 0.295), (0.645, 0.33), (0.665, 0.38), (0.705, 0.41), (0.705, 0.445), (0.6, 0.445), (0.5, 0.43), (0.4, 0.43), (0.32, 0.45)]  # přilba bez záře kolem ní
VLK_FRAK = [(0.12, 0.76), (0.12, 0.71), (0.23, 0.7), (0.26, 0.65), (0.29, 0.6), (0.34, 0.57), (0.66, 0.57), (0.74, 0.585), (0.79, 0.63), (0.82, 0.68), (0.85, 0.74), (0.87, 0.8), (0.87, 0.88), (0.6, 0.98), (0.4, 0.98), (0.14, 0.88), (0.11, 0.8)]  # frak bez nebe
VLK_TLAPKA = [(0.43, 0.78), (0.47, 0.755), (0.58, 0.775), (0.64, 0.8), (0.64, 0.87), (0.48, 0.89), (0.43, 0.85)]  # šedá tlapka s manžetou přes frak
KNIHA_L = [(0.02, 0.48), (0.1, 0.41), (0.32, 0.41), (0.37, 0.5), (0.37, 0.58), (0.3, 0.63), (0.22, 0.73), (0.02, 0.66)]  # knihy knižního draka (tmavě modré hřbety)
KNIHA_R = [(0.98, 0.48), (0.9, 0.4), (0.66, 0.4), (0.62, 0.5), (0.63, 0.6), (0.72, 0.62), (0.8, 0.7), (0.98, 0.66)]
CHARACTERS = {
    'cervik': {'src': 'knihomol', 'parts': [
        {'title': 'Kniha', 'rules': [{'hue': (335, 15), 'smin': 0.45}]},
        {'title': 'Červík', 'rules': [{'hue': (60, 115), 'smin': 0.4}]}]},
    'axolot': {'src': 'axolotl', 'parts': [
        {'title': 'Axolotl', 'rules': [{'hue': (315, 15), 'smin': 0.18, 'vmin': 0.6}]},
        {'title': 'Skafandr', 'rules': [{'hue': (160, 200), 'smin': 0.3, 'box': [(0, 0.68, 1, 1)]}]}]},
    'kaktus': {'src': 'kaktus', 'parts': [
        {'title': 'Klobouk', 'rules': [{'hue': (10, 45), 'smin': 0.2, 'box': [(0.2, 0.0, 0.75, 0.3)]}]},
        {'title': 'Květináč', 'rules': [{'hue': (5, 35), 'smin': 0.4, 'box': [(0.15, 0.58, 0.88, 1)]}]}]},
    'drak': {'src': 'drak-konvice', 'parts': [
        {'title': 'Dráček', 'rules': [{'hue': (235, 295), 'smin': 0.22, 'vmin': 0.35}]},
        {'title': 'Krunýř', 'rules': [{'hue': (8, 40), 'smin': 0.35}]}]},
    'mamut': {'src': 'mamut-dj', 'parts': [
        {'title': 'Sluchátka', 'rules': [{'hue': (165, 205), 'smin': 0.4, 'vmin': 0.5, 'box': [(0.15, 0.05, 0.85, 0.55)]},
                                         {'hue': (285, 335), 'smin': 0.4, 'vmin': 0.4, 'box': [(0.15, 0.05, 0.85, 0.55)]}]},
        {'title': 'Srst', 'rules': [{'hue': (5, 40), 'smin': 0.35, 'vmin': 0.25}]}]},
    'meduza': {'src': 'meduza-disko', 'parts': [
        {'title': 'Koule', 'rules': [{'smin': 0, 'smax': 0.14, 'vmin': 0.3, 'box': [(0.12, 0.08, 0.88, 0.62)]}]}]},
    'lenoch': {'src': 'lenochod-kouzelnik', 'parts': [
        {'title': 'Klobouk', 'rules': [{'hue': (200, 255), 'smin': 0.3, 'vmin': 0.18}]},
        {'title': 'Měsíc', 'rules': [{'hue': (38, 62), 'smin': 0.4, 'vmin': 0.6, 'out': [(0.42, 0.0, 1.0, 0.45)]}]}]},
    'tukan': {'src': 'robo-tukan', 'parts': [
        {'title': 'Zobák', 'rules': [{'hue': (12, 58), 'smin': 0.5, 'box': [(0.35, 0.35, 0.95, 0.8)]}]},
        {'title': 'Kytička', 'rules': [{'hue': (10, 50), 'smin': 0.5, 'box': [(0.4, 0.0, 0.8, 0.25)]}]}]},
    'lev': {'src': 'lev-galaxie', 'parts': [
        {'title': 'Hříva', 'rules': [{'hue': (225, 305), 'smin': 0.28, 'vmin': 0.12}]}]},
    'fenix': {'src': 'fenix', 'parts': [
        {'title': 'Peří', 'rules': [{'hue': (340, 25), 'smin': 0.5, 'vmin': 0.35},
                                    {'hue': (25, 40), 'smin': 0.5, 'vmin': 0.35, 'out': [(0.28, 0.33, 0.54, 0.53)]}]}]},
    'krecek': {'src': 'krecek-boxer', 'parts': [
        {'title': 'Rukavice', 'rules': [{'hue': (340, 15), 'smin': 0.45, 'vmin': 0.3}]},
        {'title': 'Čelenka', 'rules': [{'smin': 0, 'smax': 0.13, 'vmin': 0.8, 'box': [(0.2, 0.18, 0.8, 0.38)]}]}]},
    'rytir': {'src': 'pasovec-rytir', 'parts': [
        {'title': 'Chochol', 'rules': [{'hue': (155, 205), 'smin': 0.3}]},
        {'title': 'Brnění', 'rules': [{'hue': (12, 42), 'smin': 0.35, 'vmin': 0.3, 'out': [(0.53, 0.34, 0.84, 0.57)],
                                       'outpoly': [[(0.40, 0.81), (0.46, 0.72), (0.82, 0.55), (0.87, 0.60), (0.53, 0.85), (0.46, 0.92)]]}]}]},
    'narval': {'src': 'narval-serman', 'parts': [
        {'title': 'Narval', 'rules': [{'hue': (185, 220), 'smin': 0.18, 'vmin': 0.55}]},
        {'title': 'Dres', 'rules': [{'smin': 0, 'smax': 0.12, 'vmin': 0.78, 'box': [(0, 0.62, 1, 1)]}]}]},
    'zelva': {'src': 'zelva-sampion', 'parts': [
        {'title': 'Plášť', 'rules': [{'hue': (255, 310), 'smin': 0.3}]},
        {'title': 'Pohár', 'rules': [{'hue': (36, 60), 'smin': 0.72, 'vmin': 0.45}]}]},
    'hodiny': {'src': 'presypaci-hodiny', 'parts': [
        {'title': 'Tenisky', 'rules': [{'hue': (345, 12), 'smin': 0.5, 'box': [(0, 0.78, 1, 1)]}]},
        {'title': 'Písek', 'rules': [{'hue': (28, 50), 'smin': 0.4, 'vmin': 0.6, 'box': [(0.28, 0.25, 0.72, 0.85)]}]}]},
    'gepard': {'src': 'gepard-blesk', 'parts': [
        {'title': 'Gepard', 'rules': [{'hue': (180, 228), 'smin': 0.4}]},
        {'title': 'Čelenka a tenisky', 'rules': [{'hue': (38, 62), 'smin': 0.5, 'vmin': 0.5}]}]},
    'zelvus': {'src': 'zelvusek', 'parts': [
        {'title': 'Tělo', 'rules': [{'hue': (3, 28), 'smin': 0.33, 'vmin': 0.65}]},
        {'title': 'Srdíčka', 'rules': [{'hue': (343, 10), 'smin': 0.6}]}]},
    'tucnak': {'src': 'tucnak-badatel', 'parts': [
        {'title': 'Helma', 'rules': [{'hue': (30, 75), 'smin': 0.26, 'smax': 0.65, 'box': [(0.12, 0.03, 0.88, 0.33)]}]}]},
    'zabak': {'src': 'zabi-lucistnik', 'parts': [
        {'title': 'Žabák', 'rules': [{'hue': (65, 145), 'smin': 0.35}]},
        {'title': 'Terč', 'rules': [{'hue': (345, 12), 'smin': 0.5, 'box': [(0.15, 0.1, 0.55, 0.45)]}]}]},
    'myval': {'src': 'myval-knihovnik', 'parts': [
        {'title': 'Knihy', 'mode': 'tint', 'rules': [{'smin': 0.35, 'box': [(0.28, 0.0, 0.78, 0.36)]}]}]},
    'chamel': {'src': 'chameleon', 'parts': [
        {'title': 'Kůže', 'rules': [{'hue': (75, 165), 'smin': 0.3, 'vmin': 0.3}]},
        {'title': 'Bříško', 'rules': [{'hue': (40, 68), 'smin': 0.35, 'vmin': 0.6}]}]},
    # Legendární postavičky za diplom tématu (docs/OBRAZKY.md č. 119–132): zlatá záře za postavičkou zůstává, přebarvuje se oblečení
    # nebo barevné pozadí samolepky
    'albatr': {'src': 'albatros', 'parts': [
        {'title': 'Uniforma', 'rules': [{'hue': (205, 250), 'smin': 0.3, 'vmin': 0.05, 'vmax': 0.55, 'out': [(0, 0.85, 1, 1)]}]},
        {'title': 'Moře a nebe', 'rules': [{'hue': (185, 245), 'smin': 0.2, 'vmin': 0.56, 'out': [(0.1, 0.38, 0.34, 0.63)]},
                                           {'hue': (185, 245), 'smin': 0.2, 'vmin': 0.05, 'vmax': 0.56, 'box': [(0, 0.85, 1, 1), (0, 0.4, 0.2, 0.85), (0.83, 0.4, 1, 0.85)]}]}]},
    'gryf': {'src': 'gryf', 'parts': [
        {'title': 'Kabátec', 'rules': [{'hue': (320, 15), 'smin': 0.4, 'vmin': 0.42, 'box': [(0.1, 0.66, 0.9, 1), (0.17, 0.6, 0.83, 0.66), (0.3, 0.5, 0.7, 0.6)]}]},
        {'title': 'Záře a prapory', 'edge': 5, 'rules': [{'hue': (320, 15), 'smin': 0.4, 'vmin': 0.42, 'out': [(0.1, 0.66, 0.9, 1), (0.17, 0.6, 0.83, 0.66), (0.3, 0.5, 0.7, 0.6)]}]}]},
    'slon': {'src': 'slon', 'parts': [
        {'title': 'Slon', 'mode': 'tint', 'rules': [{'smin': 0, 'smax': 0.5, 'vmin': 0.2, 'vmax': 0.8, 'box': [(0.18, 0.2, 0.82, 0.66)]},
                                                    {'hue': (0, 60), 'smin': 0, 'smax': 0.7, 'vmin': 0.25, 'vmax': 0.8, 'box': [(0.18, 0.27, 0.3, 0.5)]}]},
        {'title': 'Záře', 'rules': [{'hue': (15, 60), 'smin': 0.3, 'vmin': 0.55, 'outer': 6, 'out': [(0.12, 0.62, 0.88, 1)]}]}]},
    'sfinga': {'src': 'sfinga', 'parts': [
        {'title': 'Sfinga', 'rules': [{'hue': (140, 210), 'smin': 0.25, 'vmin': 0.15, 'poly': [SFINGA]}]},
        {'title': 'Záře', 'rules': [{'hue': (140, 210), 'smin': 0.12, 'vmin': 0.3, 'outpoly': [SFINGA]}]}]},
    'jelen': {'src': 'jelen', 'parts': [
        {'title': 'Plášť', 'rules': [{'hue': (110, 190), 'smin': 0.25, 'vmin': 0.12, 'poly': [JELEN_PLAST]}]},
        {'title': 'Les', 'rules': [{'hue': (60, 165), 'smin': 0.15, 'vmin': 0.2, 'outer': 6, 'outpoly': [JELEN_PLAST]}]}]},
    'golem': {'src': 'golem', 'parts': [
        {'title': 'Krystaly', 'rules': [{'hue': (190, 300), 'smin': 0.2, 'vmin': 0.2, 'poly': [GOLEM_KRYSTALY_L, GOLEM_KRYSTALY_R]}]},
        {'title': 'Záře', 'edge': 3, 'rules': [{'hue': (230, 335), 'smin': 0.2, 'vmin': 0.2, 'outer': 6, 'out': [(0.3, 0.42, 0.65, 0.58), (0.15, 0.75, 0.85, 1)],
                                               'outpoly': [GOLEM_KRYSTALY_L, GOLEM_KRYSTALY_R]}]}]},
    'liska': {'src': 'liska', 'parts': [
        {'title': 'Kabát', 'rules': [{'hue': (80, 165), 'smin': 0.25, 'vmin': 0.1, 'vmax': 0.6, 'box': [(0.15, 0.68, 0.85, 1)]}]},
        {'title': 'Brýle', 'rules': [{'hue': (28, 60), 'smin': 0.3, 'vmin': 0.25, 'box': [(0.3, 0.175, 0.7, 0.32)]}]}]},
    'chobot': {'src': 'chobotnice', 'parts': [
        {'title': 'Chobotnice', 'mode': 'tint', 'rules': [{'hue': (15, 50), 'smin': 0.1, 'smax': 0.45, 'vmin': 0.45, 'out': [(0.68, 0.42, 0.9, 0.56)]}]},
        {'title': 'Záře', 'edge': 5, 'rules': [{'hue': (160, 205), 'smin': 0.25, 'vmin': 0.2}]}]},
    'pav': {'src': 'pav', 'parts': [
        {'title': 'Baret a peří', 'rules': [{'hue': (170, 215), 'smin': 0.3, 'vmin': 0.12, 'box': [(0.25, 0.08, 0.72, 0.42), (0.18, 0.42, 0.55, 0.8), (0.6, 0.72, 0.82, 0.95)]}]},
        {'title': 'Kabátek', 'rules': [{'hue': (325, 10), 'smin': 0.35, 'vmin': 0.15, 'box': [(0.12, 0.7, 0.85, 1), (0.28, 0.3, 0.68, 0.42)], 'out': [(0.5, 0.58, 0.9, 0.75)]}]}]},
    'bobr': {'src': 'bobr', 'parts': [
        {'title': 'Přilba', 'rules': [{'hue': (30, 62), 'smin': 0.18, 'vmin': 0.45, 'poly': [BOBR_PRILBA]}]},
        {'title': 'Plány a nebe', 'rules': [{'hue': (195, 235), 'smin': 0.2, 'vmin': 0.15}]}]},
    'vlk': {'src': 'vlk', 'parts': [
        {'title': 'Frak', 'mode': 'tint', 'rules': [{'hue': (180, 280), 'smin': 0.1, 'vmin': 0.03, 'vmax': 0.5, 'poly': [VLK_FRAK], 'outpoly': [VLK_TLAPKA]},
                                                    {'smin': 0, 'smax': 0.1, 'vmin': 0.03, 'vmax': 0.22, 'poly': [VLK_FRAK], 'outpoly': [VLK_TLAPKA]}]},
        {'title': 'Nebe', 'rules': [{'hue': (195, 240), 'smin': 0.15, 'vmin': 0.12, 'outer': 6, 'out': [(0.1, 0.6, 0.9, 1)]}]}]},
    'kndrak': {'src': 'knizni-drak', 'parts': [
        {'title': 'Dráček', 'rules': [{'hue': (185, 240), 'smin': 0.2, 'vmin': 0.08, 'outpoly': [KNIHA_L, KNIHA_R]}]},
        {'title': 'Záře', 'rules': [{'hue': (25, 60), 'smin': 0.28, 'vmin': 0.5, 'outer': 6}]}]},
    'panda': {'src': 'panda', 'parts': [
        {'title': 'Šála', 'rules': [{'hue': (340, 15), 'smin': 0.5, 'vmin': 0.3, 'box': [(0.25, 0.6, 0.75, 1)]}]},
        {'title': 'Záře', 'rules': [{'hue': (340, 40), 'smin': 0.35, 'vmin': 0.4, 'outer': 6, 'out': [(0.25, 0.6, 0.75, 1)]}]}]},
    'klokan': {'src': 'klokan', 'parts': [
        {'title': 'Dres a čelenka', 'rules': [{'hue': (320, 360), 'smin': 0.4, 'vmin': 0.3, 'box': [(0.12, 0.55, 0.82, 1), (0.36, 0.25, 0.64, 0.36)], 'out': [(0.735, 0.62, 0.9, 1)]}]},
        {'title': 'Záře', 'rules': [{'hue': (18, 48), 'smin': 0.3, 'vmin': 0.5, 'outer': 6, 'out': [(0.72, 0.24, 1, 0.58)]}]}]},
}

def rgb_to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rc = nz & (mx == r); gc = nz & (mx == g) & ~rc; bc = nz & ~rc & ~gc
    h[rc] = ((g - b)[rc] / d[rc]) % 6
    h[gc] = (b - r)[gc] / d[gc] + 2
    h[bc] = (r - g)[bc] / d[bc] + 4
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    return h * 60, s, mx

def hsv_to_rgb(h, s, v):
    h = (h % 360) / 60
    c = v * s
    x = c * (1 - np.abs(h % 2 - 1))
    m = v - c
    z = np.zeros_like(h)
    conds = [h < 1, h < 2, h < 3, h < 4, h < 5, h >= 5]
    r = np.select(conds, [c, x, z, z, x, c]); g = np.select(conds, [x, c, c, x, z, z]); b = np.select(conds, [z, z, x, c, c, x])
    return np.stack([r + m, g + m, b + m], -1)

def base_image(name):
    im = topic_icons.cut(os.path.join(root, 'branding', 'ikony', f'avatar-{name}.png'), f'avatar-{name}')
    inner = WORK - WORK // 24
    scale = inner / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (WORK, WORK), (0, 0, 0, 0))
    canvas.paste(im, ((WORK - im.width) // 2, (WORK - im.height) // 2), im)
    return canvas

def in_hue(h, lo, hi):
    return (h >= lo) & (h <= hi) if lo <= hi else (h >= lo) | (h <= hi)

def box_mask(shape, boxes):
    H, W = shape
    m = np.zeros(shape, bool)
    for x0, y0, x1, y1 in boxes: m[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)] = True
    return m

def poly_mask(shape, polys):
    H, W = shape
    img = Image.new('L', (W, H), 0)
    draw = ImageDraw.Draw(img)
    for poly in polys: draw.polygon([(x * W, y * H) for x, y in poly], fill=255)
    return np.asarray(img) > 0

def outer_mask(sel, alpha, reach):
    # Souvislé plochy výběru, které začínají v pruhu hned pod krémovým okrajem (EDGE až EDGE + reach px od průhledného pozadí)
    solid = Image.fromarray(((alpha > 0.5) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(EDGE))
    inner = np.asarray(solid) > 0
    for _ in range(max(1, round(reach / 2))): solid = solid.filter(ImageFilter.MinFilter(5))
    grown = sel & inner & ~(np.asarray(solid) > 0)
    # Rekonstrukce: semínka se rozrůstají o pixel (i úhlopříčně) jen po výběru, dokud se plocha mění
    for step in range(4 * WORK):
        img = Image.fromarray((grown * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
        nxt = (np.asarray(img) > 0) & sel
        if step % 8 == 0 and np.array_equal(nxt, grown): break
        grown = nxt
    return grown

def part_mask(a, rules, edge=EDGE):
    h, s, v = rgb_to_hsv(a[..., :3])
    m = np.zeros(h.shape, bool)
    for rule in rules:
        r = in_hue(h, *rule.get('hue', (0, 360))) & (s >= rule.get('smin', 0.25)) & (s <= rule.get('smax', 1.01))
        r &= (v >= rule.get('vmin', 0.3)) & (v <= rule.get('vmax', 1.01))
        if 'box' in rule: r &= box_mask(h.shape, rule['box'])
        if 'out' in rule: r &= ~box_mask(h.shape, rule['out'])
        if 'poly' in rule: r &= poly_mask(h.shape, rule['poly'])
        if 'outpoly' in rule: r &= ~poly_mask(h.shape, rule['outpoly'])
        if rule.get('outer'): r = outer_mask(r, a[..., 3], rule['outer'])
        if rule.get('inner'): r &= ~outer_mask(r, a[..., 3], rule['inner'])
        m |= r
    # Krémový okraj samolepky (pruh u průhledného pozadí) nikdy nepatří k části, i když má podobnou barvu (helma tučňáka)
    inner = Image.fromarray(((a[..., 3] > 0.5) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(edge))
    m &= np.asarray(inner) > 0
    img = Image.fromarray((m * 255).astype(np.uint8))
    # Drobné tečky pryč, drobné díry (odlesky, šum) zalepit; okraj změkčit
    img = img.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    img = img.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    soft = np.asarray(img.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    return soft * a[..., 3]

def part_masks(a, parts):
    # Masky všech částí postavičky (každá s vlastním ochranným pruhem u okraje, výchozí EDGE)
    return [part_mask(a, part['rules'], part.get('edge', EDGE)) for part in parts]

def recolor(a, w, color, mode=None):
    ht, st, vt = color
    h, s, v = rgb_to_hsv(a[..., :3])
    sel = w > 0.5
    ws = np.maximum(s[sel], 0.05)
    s0 = float(np.median(s[sel])); v0 = float(np.median(v[sel]))
    if s0 >= 0.22 and mode != 'tint':
        # Barevná část: posun odstínu o rozdíl mezi převažujícím odstínem části a cílovým (přechody zůstanou)
        ang = np.deg2rad(h[sel])
        h0 = np.rad2deg(np.arctan2((np.sin(ang) * ws).sum(), (np.cos(ang) * ws).sum())) % 360
        nh = h + (ht - h0)
        ks = np.clip(st / s0, 0.2, 1.6); kv = np.clip(vt / v0, 0.3, 1.5)
        ns = np.clip(s * ks, 0, 1); nv = np.clip(v * kv, 0, 1)
    else:
        # Bílá nebo šedá část: obarvit, světlá místa (odlesky) méně syté, stínování podle jasu
        nh = np.full_like(h, ht)
        light = np.clip((v - v0) / max(1 - v0, 0.05), 0, 1)
        ns = np.clip(st * (1 - 0.6 * light), 0, 1)
        nv = np.clip(v * vt / max(v0, 0.3), 0, 1)
    rgb = hsv_to_rgb(nh, ns, nv)
    return np.dstack([rgb, w])

def shrink(arr):
    im = Image.fromarray((arr * 255).round().astype(np.uint8), 'RGBA').convert('RGBa')
    return im.resize((SIZE, SIZE), Image.LANCZOS).convert('RGBA')

def build(cid, preview=False):
    conf = CHARACTERS[cid]
    base = base_image(conf['src'])
    out_dir = os.path.join(root, 'icons', 'avatars')
    os.makedirs(out_dir, exist_ok=True)
    base_small = base.convert('RGBa').resize((SIZE, SIZE), Image.LANCZOS).convert('RGBA')
    base_small.save(os.path.join(out_dir, f'{cid}.webp'), 'WEBP', quality=88, method=6)
    a = np.asarray(base).astype(np.float32) / 255
    layers = []
    offered = []
    for pi, (part, w) in enumerate(zip(conf.get('parts', []), part_masks(a, conf.get('parts', []))), start=1):
        offered.append(offered_colors(a, w, part.get('mode')))
        row = []
        for ci, color in enumerate(PALETTE, start=1):
            layer = shrink(recolor(a, w, color, part.get('mode')))
            layer.save(os.path.join(out_dir, f'{cid}-{pi}{ci}.webp'), 'WEBP', quality=86, method=6)
            row.append(layer)
        layers.append((w, row))
    if preview: return base_small, layers
    return offered

def offered_colors(a, w, mode=None):
    # Barvy palety, které se od původní barvy části viditelně liší: jiný odstín (o víc než 28°) nebo stejný odstín, ale
    # jinak světlý (hnědá × oranžová, vínová × červená). U bílé a šedé části a u obarvení (mode 'tint') všechny;
    # černá jen u částí, které nejsou samy tmavé
    h, s, v = rgb_to_hsv(a[..., :3])
    sel = w > 0.5
    s0 = float(np.median(s[sel])); v0 = float(np.median(v[sel]))
    ang = np.deg2rad(h[sel])
    h0 = np.rad2deg(np.arctan2((np.sin(ang) * s[sel]).sum(), (np.cos(ang) * s[sel]).sum())) % 360
    out = []
    for i, (ht, st, vt) in enumerate(PALETTE, start=1):
        if st < 0.3: keep = v0 > 0.45
        elif s0 < 0.22 or mode == 'tint': keep = True
        else: keep = min(abs(ht - h0), 360 - abs(ht - h0)) > 28 or abs(vt - v0) > 0.25
        if keep: out.append(i)
    return out

def colors_only(cid):
    conf = CHARACTERS[cid]
    a = np.asarray(base_image(conf['src'])).astype(np.float32) / 255
    parts = conf.get('parts', [])
    return [offered_colors(a, w, part.get('mode')) for part, w in zip(parts, part_masks(a, parts))]

if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    # --colors: jen vypíše nabízené barvy částí (look.js CHARACTERS → colors), obrázky nezapisuje
    for cid in (args or CHARACTERS):
        print(cid, colors_only(cid) if '--colors' in sys.argv else build(cid))
