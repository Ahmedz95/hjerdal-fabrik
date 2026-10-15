// Färgteman: tre ljusa och tre mörka. Temat styr bara färgerna; typsnitt och
// former kommer från stilen (src/stilar/). I stilen hjerdal har temat också
// ett eget rubriktypsnitt. Accenten kan bytas per kund; bygget stoppar om
// texten på knapparna då blir svår att läsa.
import type { Kund } from './kund';

type Farger = { bg: string; surface: string; ink: string; muted: string; line: string; accent: string };
type Tema = Farger & { rubrik: 'sans' | 'serif'; namn: string };

export const temaLista: Record<Kund['design']['tema'], Tema> = {
  // HJERDAL:s egna färger: Snö, Is, Granit och Skiffer.
  fjall: { namn: 'Fjäll', bg: '#F5F6F4', surface: '#E8EBE9', ink: '#101315', muted: '#596066', line: '#D5DAD8', accent: '#101315', rubrik: 'sans' },
  linne: { namn: 'Linne', bg: '#F3EFE7', surface: '#E9E2D4', ink: '#221E18', muted: '#62594C', line: '#D8CFBE', accent: '#6B4226', rubrik: 'serif' },
  ek: { namn: 'Ek', bg: '#1B1814', surface: '#25211B', ink: '#F2EDE3', muted: '#B3A999', line: '#3A332A', accent: '#D9BC8C', rubrik: 'serif' },
  skiffer: { namn: 'Skiffer', bg: '#111417', surface: '#1A1E22', ink: '#EEF1F2', muted: '#A9B0B5', line: '#2B3136', accent: '#B9D3D9', rubrik: 'sans' },
  salvia: { namn: 'Salvia', bg: '#EEF1EA', surface: '#E1E7DB', ink: '#1C261F', muted: '#4F5D52', line: '#CCD5C6', accent: '#2F4A37', rubrik: 'serif' },
  hav: { namn: 'Hav', bg: '#0E1822', surface: '#15222E', ink: '#EEF3F6', muted: '#A4B3BF', line: '#23384A', accent: '#F0B65A', rubrik: 'sans' },
};

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG-kontrast mellan två färger, 1 till 21. */
export const kontrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const typsnitt = {
  sans: '"Albert Sans Variable", "Albert Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: '"Fraunces Variable", "Fraunces", Georgia, "Times New Roman", serif',
};

/** Ljus eller mörk bakgrund, för loggan och color-scheme. */
export const arMorkt = (tema: Kund['design']['tema']) => lum(temaLista[tema].bg) < 0.5;

/** CSS-variablerna för kundens tema och accent, och i stilen hjerdal rubriktypsnittet. */
export function temaVariabler(design: Kund['design']) {
  const t = temaLista[design.tema];
  const accent = design.accent ?? t.accent;
  // Texten på accenten blir den av temats ljusaste och mörkaste färg som syns bäst.
  const [ljus, mork] = lum(t.bg) > lum(t.ink) ? [t.bg, t.ink] : [t.ink, t.bg];
  const accentInk = kontrast(accent, ljus) >= kontrast(accent, mork) ? ljus : mork;

  const krav: [string, number][] = [
    ['brödtexten mot bakgrunden', kontrast(t.ink, t.bg)],
    ['den grå texten mot bakgrunden', kontrast(t.muted, t.bg)],
    ['den grå texten mot ytorna', kontrast(t.muted, t.surface)],
    [`knapptexten mot accenten ${accent}`, kontrast(accent, accentInk)],
  ];
  const fel = krav.filter(([, k]) => k < 4.5);
  if (fel.length) {
    throw new Error(
      `Temat ${t.namn} har för låg kontrast (minst 4,5 krävs):\n` +
        fel.map(([vad, k]) => `  - ${vad}: ${k.toFixed(1).replace('.', ',')}`).join('\n'),
    );
  }

  const vars: Record<string, string> = {
    '--bg': t.bg,
    '--surface': t.surface,
    '--ink': t.ink,
    '--muted': t.muted,
    '--line': t.line,
    '--accent': accent,
    '--accent-ink': accentInk,
  };
  // De andra stilarna har sina rubriktypsnitt i src/stilar/.
  if (design.stil === 'hjerdal') {
    const rubrik = design.rubrik ?? t.rubrik;
    vars['--f-display'] = typsnitt[rubrik];
    // Serifen får lite tyngre vikt och mindre spärrning än den lätta grotesken.
    vars['--display-weight'] = rubrik === 'serif' ? '360' : '300';
    vars['--display-track'] = rubrik === 'serif' ? '-0.025em' : '-0.045em';
  }
  const morkt = arMorkt(design.tema);
  return {
    css: `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')};color-scheme:${morkt ? 'dark' : 'light'}}`,
    bg: t.bg,
    mork: morkt,
  };
}
