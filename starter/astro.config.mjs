// @ts-check
// Starterns konfiguration. Domänen kommer från kundfilen, så samma starter bygger
// alla kunder. FABRIK_BASE sätts av fabrik.py när varianter byggs till
// förhandsvisningen, där varje variant ligger i en egen mapp.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import kund from './src/data/kund.json' with { type: 'json' };

// Stilen väljer typsnitt och former (src/styles/stilar/<stil>.css). Bara den valda
// stilens fil, och därmed dess typsnitt, kommer med i bygget.
const stil = /** @type {{ stil?: string }} */ (kund.design ?? {}).stil ?? 'hjerdal';
const stilFil = fileURLToPath(new URL(`./src/styles/stilar/${stil}.css`, import.meta.url));
if (!/^[a-z]+$/.test(stil) || !existsSync(stilFil)) {
  throw new Error(`Kundfilen har fel och sajten byggs inte:\n  - design.stil: stilen ${stil} finns inte i src/styles/stilar/`);
}

// En SVG-logga läggs direkt i varje sida (src/lib/bilder.ts). En tung SVG, ofta
// en export från Canva eller Illustrator med en inbäddad bild, skulle då göra
// varje sida flera MB. Astro gör inte om SVG till andra format, så den blir en
// PNG här, <fil>.png bredvid, och visas som en vanlig bild.
const bilder = /** @type {{ bilder?: { logo?: string, logoMork?: string } }} */ (/** @type {unknown} */ (kund)).bilder ?? {};
for (const fil of [bilder.logo, bilder.logoMork]) {
  const kalla = fil && /\.svg$/i.test(fil) && fileURLToPath(new URL(`./src/assets/bilder/${fil}`, import.meta.url));
  if (!kalla || !existsSync(kalla)) continue;
  const svg = readFileSync(kalla);
  if (svg.length <= 20_000 && !/<image\b/i.test(svg.toString('utf8'))) continue;
  const { default: sharp } = await import('sharp');
  // Två gånger loggans höjd i sidhuvudet (88 px), så att den är skarp på alla skärmar.
  const { height = 176 } = await sharp(svg).metadata();
  await sharp(svg, { density: Math.min(1200, Math.max(72, Math.ceil((72 * 176) / height))) })
    .resize({ height: 176 })
    .png()
    .toFile(`${kalla}.png`);
}

export default defineConfig({
  site: `https://${kund.doman}`,
  base: process.env.FABRIK_BASE ?? '/',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      // Menyskärmen och QR-skylten är till för lokalen, inte för Google.
      filter: (page) => !page.includes('/skarm/') && !page.includes('/qr/'),
    }),
  ],
  vite: {
    resolve: { alias: { '@stil': stilFil } },
  },
  build: { inlineStylesheets: 'always' },
  compressHTML: true,
});
