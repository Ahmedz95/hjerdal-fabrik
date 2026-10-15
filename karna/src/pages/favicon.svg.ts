import type { APIRoute } from 'astro';
import { kund } from '../lib/kund';
import { temaVariabler } from '../lib/tema';

// Favikon med restaurangens första bokstav i temats accentfärg.
export const GET: APIRoute = () => {
  const css = temaVariabler(kund.design).css;
  const farg = (namn: string) => css.match(new RegExp(`${namn}:(#[0-9a-fA-F]{6})`))?.[1] ?? '#101315';
  const bokstav = kund.namn.trim().charAt(0).toUpperCase().replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${farg('--accent')}"/><text x="32" y="44" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="${farg('--accent-ink')}">${bokstav}</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
