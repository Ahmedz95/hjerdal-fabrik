import type { APIRoute } from 'astro';

// Favikonen: namnets C i rosa neon mot natten, som skylten i första skärmen.
// Bokstaven är en kurva ur Shippori Mincho B1 (800), så att den ser likadan ut
// utan typsnittet. Byter stället namn, rita om den.
const c = 'M14.9 32.6Q14.9 27.7 17.2 22.9Q19.5 18.1 23.7 15Q28 12 33.5 12Q35.1 12 36.5 12.4Q38 12.7 39.8 13.4Q40.2 13.5 41.2 13.8Q42.2 14.1 42.8 14.1Q43.6 14.1 44.6 13.5Q45 13.3 45.3 13.3Q45.9 13.3 46.1 14L47.8 21.5L47.9 22Q47.9 22.3 47.5 22.5Q47.4 22.5 47.2 22.5Q46.9 22.5 46.7 22.2Q45 19.8 43.4 18Q41.8 16.3 39.5 15.1Q37.2 13.8 34.1 13.8Q29.7 13.8 27.2 17.5Q24.8 21.1 24 25.3Q23.3 29.5 23.3 32.4Q23.3 37.9 25.1 41.8Q26.8 45.7 29.7 47.6Q32.5 49.6 35.7 49.6Q40 49.6 42.7 47.5Q45.5 45.4 47.6 41.9Q48 41.4 48.2 41.2Q48.4 41.1 48.5 41.1Q48.6 41.1 48.8 41.3Q49.1 41.5 49.1 41.8L49 42.1Q47.2 45.9 43.7 48.9Q40.2 52 34.9 52Q30.2 52 25.6 50Q21 47.9 17.9 43.5Q14.9 39.2 14.9 32.6Z';

export const GET: APIRoute = () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="64" height="64" rx="14" fill="#09090F"/><path d="${c}" fill="#FF3D8B" filter="url(#g)"/></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
