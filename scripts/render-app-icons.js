// Vykreslí PNG ikony aplikace ze SVG v icons/ (potřebuje Playwright: npm i -D playwright)
// Spuštění: node scripts/render-app-icons.js
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ICONS_DIR = path.join(__dirname, '..', 'icons');
const OUTPUTS = [
    { source: 'icon.svg', file: 'icon-192.png', size: 192 },
    { source: 'icon.svg', file: 'icon-512.png', size: 512 },
    { source: 'icon-maskable.svg', file: 'icon-maskable-512.png', size: 512 },
    // iOS si rohy zaobluje sám, proto ikona přes celou plochu
    { source: 'icon-maskable.svg', file: 'apple-touch-icon.png', size: 180 }
];

(async () => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage();
    for (const { source, file, size } of OUTPUTS) {
        const svg = readFileSync(path.join(ICONS_DIR, source), 'utf8');
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
        await page.screenshot({ path: path.join(ICONS_DIR, file), omitBackground: true });
        console.log(`${file} (${size}×${size})`);
    }
    await browser.close();
})();
