// @ts-check
// Kärnans konfiguration. Domänen kommer från kundfilen, så samma kärna bygger
// alla kunder. FABRIK_BASE sätts av fabrik.py när varianter byggs till
// förhandsvisningen, där varje variant ligger i en egen mapp.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import kund from './src/data/kund.json' with { type: 'json' };

// Stilen väljer typsnitt och former. Bara den valda stilens fil, och därmed
// dess typsnitt, kommer med i bygget.
const stilar = ['hjerdal', 'klassisk', 'kvarter', 'mjuk'];
const stil = /** @type {{ stil?: string }} */ (kund.design ?? {}).stil ?? 'hjerdal';
if (!stilar.includes(stil)) {
  throw new Error(`Kundfilen har fel och sajten byggs inte:\n  - design.stil: välj ${stilar.join(', ')}`);
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
    resolve: { alias: { '@stil': fileURLToPath(new URL(`./src/stilar/${stil}.css`, import.meta.url)) } },
  },
  build: { inlineStylesheets: 'always' },
  compressHTML: true,
});
