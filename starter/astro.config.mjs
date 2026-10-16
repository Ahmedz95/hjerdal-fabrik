// @ts-check
// Starterns konfiguration. Domänen kommer från kundfilen, så samma starter bygger
// alla kunder. FABRIK_BASE sätts av fabrik.py när varianter byggs till
// förhandsvisningen, där varje variant ligger i en egen mapp.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import kund from './src/data/kund.json' with { type: 'json' };
import { valdaDelar } from './src/lib/designval';

// Stilen och delarna den väljer, eller som kundfilen byter: en CSS-fil var i
// src/styles/<mapp>/<val>.css. Bara de valda filerna, och därmed bara de valda
// typsnitten, kommer med i bygget.
const design = /** @type {any} */ (kund.design ?? {});
const stil = design.stil ?? 'hjerdal';
const fil = (/** @type {string} */ vag) => fileURLToPath(new URL(`./src/styles/${vag}`, import.meta.url));
/** @type {Record<string, [string, string]>} */
const val = { stil: ['stilar', stil] };
try {
  for (const [falt, id] of Object.entries(valdaDelar(design))) val[falt] = [falt, id];
} catch {
  // En stil som inte finns får ingen förinställning; felet kommer nedan.
}
const alias = /** @type {Record<string, string>} */ ({});
for (const [falt, [mapp, id]] of Object.entries(val)) {
  if (!/^[a-z]+$/.test(id) || !existsSync(fil(`${mapp}/${id}.css`))) {
    throw new Error(`Kundfilen har fel och sajten byggs inte:\n  - design.${falt}: ${id} finns inte i src/styles/${mapp}/`);
  }
  alias[`@${falt}`] = fil(`${mapp}/${id}.css`);
}
// Typsnittsfilerna som hämtas direkt, eller inga (src/styles/typsnitt/forladda.ts).
const egen = fil(`typsnitt/${val.typsnitt[1]}.forladda.ts`);
alias['@typsnitt-forladda'] = existsSync(egen) ? egen : fil('typsnitt/forladda.ts');

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
    resolve: { alias },
  },
  build: { inlineStylesheets: 'always' },
  compressHTML: true,
});
