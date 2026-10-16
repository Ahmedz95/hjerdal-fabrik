import type { APIRoute } from 'astro';

// Förhandsvisningar av varianter ska inte indexeras alls.
export const GET: APIRoute = ({ site }) => {
  const dold = import.meta.env.PUBLIC_FORHANDSVISNING === '1';
  const rader = dold
    ? ['User-agent: *', 'Disallow: /']
    : ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('sitemap-index.xml', site).href}`];
  return new Response(`${rader.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
