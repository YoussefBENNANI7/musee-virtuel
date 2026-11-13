// Photographie chaque sculpture d'un musée depuis la visite 3D, pour la vue simplifiée.
//
// Usage, pendant que le serveur de développement tourne (npm run dev) :
//   npm run vignettes -- demo
//   npm run vignettes -- demo http://localhost:5173
//
// Les images sont rangées dans public/museums/<musée>/thumbs/ et la configuration
// du musée est complétée (champ "photo" de chaque sculpture).
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [museumId = 'demo', server = 'http://localhost:5173'] = process.argv.slice(2);
const dir = new URL(`../public/museums/${museumId}/`, import.meta.url);
const configPath = new URL('museum.json', dir);
const museum = JSON.parse(readFileSync(configPath, 'utf8'));
mkdirSync(new URL('thumbs/', dir), { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let count = 0;
for (const room of museum.rooms) {
  for (const art of room.artworks) {
    if (art.type !== 'sculpture') continue;
    // Une page neuve par vignette : la prise de vue fige la visite.
    const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
    await page.goto(`${server}/?m=${encodeURIComponent(museumId)}&q=medium`);
    await page.waitForSelector('body.ready');
    await page.waitForTimeout(600);
    const dataUrl = await page.evaluate((id) => window.__museum.thumb(id), art.id);
    writeFileSync(new URL(`thumbs/${art.id}.jpg`, dir), Buffer.from(dataUrl.split(',')[1], 'base64'));
    art.photo = `thumbs/${art.id}.jpg`;
    await page.close();
    count++;
  }
}
await browser.close();
writeFileSync(configPath, `${JSON.stringify(museum, null, 2)}\n`);
console.log(`${count} vignette(s) enregistrée(s) pour le musée « ${museumId} ».`);
