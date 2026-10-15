// Kundens bilder. fabrik.py kopierar dem från kunder/<kund>/bilder/ till
// src/assets/bilder/, så att Astro gör om dem till WebP i flera storlekar.
import type { ImageMetadata } from 'astro';
import { kund } from './kund';
import { arMorkt } from './tema';

const filer = import.meta.glob<{ default: ImageMetadata }>('../assets/bilder/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', {
  eager: true,
});
const svgFiler = import.meta.glob<string>('../assets/bilder/*.{svg,SVG}', { eager: true, query: '?raw', import: 'default' });

// Felen skrivs som kundfilens fel, så att fabrik.py och Designer kan visa dem vid fältet.
const hitta = <T>(lista: Record<string, T>, fil: string, falt: string) => {
  const hit = Object.entries(lista).find(([sokvag]) => sokvag.endsWith(`/${fil}`));
  if (!hit) throw new Error(`Kundfilen har fel och sajten byggs inte:\n  - bilder.${falt}: ${fil} finns inte i kundens mapp bilder/`);
  return hit[1];
};

export function bild(vilken: 'hero' | 'om') {
  const val = kund.bilder[vilken];
  if (!val) return undefined;
  return { src: hitta(filer, val.fil, `${vilken}.fil`).default, alt: val.alt };
}

/**
 * Loggan i sidhuvudet. En SVG läggs direkt i sidan, så att den inte kostar
 * en extra hämtning och kan ta textfärgen med currentColor.
 */
export function logo(): { svg: string } | { src: ImageMetadata } | undefined {
  const falt = arMorkt(kund.design.tema) && kund.bilder.logoMork ? 'logoMork' : 'logo';
  const fil = kund.bilder[falt];
  if (!fil) return undefined;
  if (!/\.svg$/i.test(fil)) return { src: hitta(filer, fil, falt).default };

  const kalla = hitta(svgFiler, fil, falt);
  if (/<script|\son\w+\s*=|javascript:/i.test(kalla)) {
    throw new Error(`Kundfilen har fel och sajten byggs inte:\n  - bilder.${falt}: ${fil} innehåller skript, spara om loggan utan dem`);
  }
  if (!/viewBox=/i.test(kalla)) {
    throw new Error(`Kundfilen har fel och sajten byggs inte:\n  - bilder.${falt}: ${fil} saknar viewBox och kan inte skalas`);
  }
  const svg = kalla
    .replace(/<\?xml[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!--[\s\S]*?-->/gi, '')
    .trim()
    .replace(/^<svg\b/i, '<svg class="logo-svg" aria-hidden="true" focusable="false"');
  return { svg };
}
