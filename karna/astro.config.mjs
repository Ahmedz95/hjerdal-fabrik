// @ts-check
// Kärnans konfiguration. Domänen kommer från kundfilen, så samma kärna bygger
// alla kunder. FABRIK_BASE sätts av fabrik.py när varianter byggs till
// förhandsvisningen, där varje variant ligger i en egen mapp.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import kund from './src/data/kund.json' with { type: 'json' };

// Stilen väljer typsnitt och former (src/stilar/<stil>.css). Bara den valda
// stilens fil, och därmed dess typsnitt, kommer med i bygget.
const stil = /** @type {{ stil?: string }} */ (kund.design ?? {}).stil ?? 'hjerdal';
const stilFil = fileURLToPath(new URL(`./src/stilar/${stil}.css`, import.meta.url));
if (!/^[a-z]+$/.test(stil) || !existsSync(stilFil)) {
  throw new Error(`Kundfilen har fel och sajten byggs inte:\n  - design.stil: stilen ${stil} finns inte i src/stilar/`);
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
