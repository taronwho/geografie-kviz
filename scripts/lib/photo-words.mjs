// Slova z názvu souboru obrázku pro OCR nápisů (photo-text.mjs, photo-masks.mjs)
// Obrázek, který otázka ukazuje hned (vlajka, znak), je často kresba (SVG) a nápis na něm bývá v jazyce originálu
// (CALIFORNIA REPUBLIC, ASTANA): u takových témat se čtou všechny obrázky a za slova odpovědi se berou i slova z názvu
// souboru (Flag of California.svg → california), bez obecných slov vlajek a znaků
export const QUESTION_IMAGE_TOPICS = new Set(['vlajky']);
const FILE_GENERIC = new Set(['flag', 'flags', 'coat', 'arms', 'emblem', 'seal', 'great', 'greater', 'lesser', 'middle', 'small', 'large', 'svg', 'png', 'jpg', 'jpeg',
    'znak', 'vlajka', 'city', 'town', 'state', 'states', 'province', 'region', 'oblast', 'county', 'municipality', 'official', 'version', 'variant', 'latin',
    'standard', 'civil', 'ensign', 'historical', 'proposed', 'specifications', 'with', 'from', 'escudo', 'bandera', 'wappen', 'flagge', 'drapeau', 'armoiries',
    'herb', 'flaga', 'stemma', 'bandiera', 'logo', 'symbol', 'blason', 'coats', 'heraldic', 'shield', 'crest', 'colour', 'color', 'colors', 'colours']);
export const fileNameWords = (file, plain) => String(file || '').replace(/\.[a-z]+$/i, '').split(/[\s_,.:;!?()'"–-]+/)
    .map(plain).filter(key => key.length >= 4 && !/\d/.test(key) && !FILE_GENERIC.has(key));

// Kresba vlajky či znaku: drobný nápis v pečeti (ARKANSAS, WISCONSIN, IOWA) přečte OCR až na bílém pozadí, dvakrát větší,
// v odstínech šedi s roztaženým kontrastem (ImageMagick). Výsledek se ukládá zvlášť (přípona .prep), ať se nemíchá se čtením fotek.
export const OCR_PREP_SUFFIX = '.prep';
export const prepareForOcr = async (run, image, topic) => {
    if (!QUESTION_IMAGE_TOPICS.has(topic)) return image;
    const out = `${image.replace(/\.\w+$/, '')}-ocr.png`;
    await run('convert', [image, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-resize', '200%', '-colorspace', 'Gray', '-normalize', out]);
    return out;
};
export const ocrSuffix = (topic) => QUESTION_IMAGE_TOPICS.has(topic) ? OCR_PREP_SUFFIX : '';
