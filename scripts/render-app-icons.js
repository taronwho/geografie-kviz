// Ikony aplikace a logo ze samolepky sovy (branding/sova.png – vyříznutá z branding/sova-original.jpg skriptem scripts/logo-cutout.py)
// Potřebuje Playwright (npm i -D playwright). Spuštění: node scripts/render-app-icons.js
// Pozadí ikon je tmavě šedé jako u původního loga, se světlem za sovou a jemným stínem pod samolepkou.
const { chromium } = require('playwright');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ICONS_DIR = path.join(ROOT, 'icons');
const OWL = `data:image/png;base64,${readFileSync(path.join(ROOT, 'branding', 'sova.png')).toString('base64')}`;
const BACKGROUND = 'radial-gradient(circle at 50% 40%, #464a51 0%, #2d3034 55%, #1c1d20 100%)';

// height = výška sovy jako podíl ikony; round = zaoblené rohy (jinak přes celou plochu – maskovatelná ikona, iOS si zaoblí sám);
// top = svislý posun středu sovy; crop = jen hlava (malá ikona v záložce prohlížeče)
const OUTPUTS = [
    { file: 'icon-192.png', size: 192, height: 0.84, round: true },
    { file: 'icon-512.png', size: 512, height: 0.84, round: true },
    // Maskovatelná: obsah uvnitř kruhu 80 % plochy (Android ořízne do kruhu nebo kapky)
    { file: 'icon-maskable-512.png', size: 512, height: 0.62 },
    { file: 'apple-touch-icon.png', size: 180, height: 0.8 },
    { file: 'favicon-32.png', size: 32, height: 1.25, round: true, top: 0.6 }
];

const iconHtml = ({ size, height, round, top = 0.5 }) => `
    <style>html,body{margin:0;background:transparent}</style>
    <div style="position:relative;width:${size}px;height:${size}px;overflow:hidden;border-radius:${round ? size * 0.225 : 0}px;background:${BACKGROUND}">
        <img src="${OWL}" style="position:absolute;left:50%;top:${top * 100}%;height:${height * size}px;transform:translate(-50%,-50%);filter:drop-shadow(0 ${size * 0.012}px ${size * 0.025}px rgba(0,0,0,.45))">
    </div>`;

(async () => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage();
    for (const output of OUTPUTS) {
        await page.setViewportSize({ width: output.size, height: output.size });
        await page.setContent(iconHtml(output));
        await page.waitForFunction(() => document.images[0].complete);
        await page.screenshot({ path: path.join(ICONS_DIR, output.file), omitBackground: true, clip: { x: 0, y: 0, width: output.size, height: output.size } });
        console.log(`${output.file} (${output.size}×${output.size})`);
    }
    // Logo v aplikaci: průhledná samolepka (WebP), 320 px na výšku stačí i pro displeje s hustotou 3×
    const height = 320;
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${OWL}" style="display:block;height:${height}px">`);
    await page.waitForFunction(() => document.images[0].complete);
    const width = await page.evaluate(() => document.images[0].getBoundingClientRect().width);
    await page.setViewportSize({ width: Math.ceil(width), height });
    const png = await page.screenshot({ omitBackground: true });
    const webp = await page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return canvas.toDataURL('image/webp', 0.9).split(',')[1];
    }, png.toString('base64'));
    writeFileSync(path.join(ICONS_DIR, 'logo.webp'), Buffer.from(webp, 'base64'));
    console.log(`logo.webp (${Math.ceil(width)}×${height})`);
    await browser.close();
})();
