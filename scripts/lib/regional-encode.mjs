// Zápis cest slepých map regionů (data/regiony.json): celá čísla po q stupních, první bod absolutně a další rozdílově,
// opakované body vynechané; každé číslo jako znaky base64url po pěti bitech (šestý bit = pokračuje další znak), znaménko
// v nejnižším bitu – drobné posuny zaberou jeden znak. Čte quiz-core.js (decodeNumbers, regionalPath).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { REGIONAL_DIGITS: DIGITS } = require('../../quiz-core.js');

export const encodeNumber = (value) => {
    let rest = value < 0 ? -value * 2 - 1 : value * 2;
    let text = '';
    do {
        const chunk = rest & 31;
        rest = Math.floor(rest / 32);
        text += DIGITS[rest ? chunk | 32 : chunk];
    } while (rest);
    return text;
};
export const encodePoints = (points, q) => {
    let text = '';
    let px = 0, py = 0, count = 0;
    for (const [x, y] of points) {
        const ix = Math.round(x / q);
        const iy = Math.round(y / q);
        if (count && ix === px && iy === py) continue;
        text += encodeNumber(ix - px) + encodeNumber(iy - py);
        px = ix; py = iy; count++;
    }
    return { text, count };
};
