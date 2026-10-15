// Ikonerna i Designer, ritade som linjer i 24 × 24 och färgade med currentColor.
const NS = 'http://www.w3.org/2000/svg';

const RITNINGAR = {
  visa: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  forslag: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  moln: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.4 9.1 4.75 4.75 0 0 0 7 18.5Z"/><path d="M12 15.5v-6m-2.5 2.5L12 9.5l2.5 2.5"/>',
  mer: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  hjalp: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.85.85c0 1.7-2.45 2.25-2.45 3.75"/><circle cx="12" cy="17.1" r=".9" fill="currentColor" stroke="none"/>',
  stang: '<path d="M6 6l12 12M18 6 6 18"/>',
  skicka: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  gem: '<path d="m20 11.5-7.6 7.6a5 5 0 0 1-7.1-7.1l8.1-8.1a3.4 3.4 0 0 1 4.8 4.8l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>',
  stopp: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  mobil: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  surfplatta: '<rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  dator: '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
  bygg: '<path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4.5V9h-4.5"/>',
  extern: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sok: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  tillbaka: '<path d="m14.5 6-6 6 6 6"/>',
  bock: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  ny: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
  hamta: '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  avsluta: '<path d="M12 3.5v8"/><path d="M7 6.3a7.5 7.5 0 1 0 10 0"/>',
  mapp: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
  angra: '<path d="M9 14.5 4.5 10 9 5.5"/><path d="M4.5 10h10a5 5 0 0 1 0 10H11"/>',
  bild: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5.5-5.5 4 4 2.5-2.5 4.5 4.5"/>',
  hoger: '<path d="m9.5 6 6 6-6 6"/>',
  arkiv: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1.2"/><path d="M5.2 9v9a2 2 0 0 0 2 2h9.6a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  export: '<path d="M12 14.5V4m-4 4 4-4 4 4"/><path d="M5 12.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5"/>',
  mote: '<rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="m10.5 8.2 4 2.55-4 2.55Z"/><path d="M8.5 20.5h7"/>',
};

/** En ikon som SVG. Claude-ikonen är en egen, fylld stjärna. */
export function ikon(namn, storlek = 18) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', storlek);
  svg.setAttribute('height', storlek);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `ikon ikon-${namn}`);
  if (namn === 'claude') {
    svg.innerHTML = claudeStjarna();
    return svg;
  }
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = RITNINGAR[namn] ?? '';
  return svg;
}

/** En strålande stjärna med tolv rundade strålar av olika längd, i Claudes färg. */
function claudeStjarna() {
  const langder = [9.6, 7.4, 9, 7.8, 9.8, 7.2, 9.2, 7.6, 9.6, 7.4, 8.8, 7.8];
  return langder.map((l, i) => {
    const v = (i / langder.length) * Math.PI * 2 - Math.PI / 2;
    const x = (12 + Math.cos(v) * l).toFixed(2);
    const y = (12 + Math.sin(v) * l).toFixed(2);
    return `<line x1="12" y1="12" x2="${x}" y2="${y}" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`;
  }).join('');
}
