// Hur tider, dagar och priser skrivs på sajten, enligt svensk standard:
// "Mån–fre 11–14 och 17–22", "185 kr".
import { dagar, type Dag } from './kund';

const kort: Record<Dag, string> = { man: 'mån', tis: 'tis', ons: 'ons', tor: 'tor', fre: 'fre', lor: 'lör', son: 'sön' };
export const schemaDag: Record<Dag, string> = {
  man: 'Monday', tis: 'Tuesday', ons: 'Wednesday', tor: 'Thursday', fre: 'Friday', lor: 'Saturday', son: 'Sunday',
};

const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Mån–fre", "Lör", "Mån, ons och fre". Dagar i följd skrivs som ett spann. Inga dagar ger "". */
export function dagText(valda: readonly Dag[]): string {
  if (!valda.length) return '';
  const idx = [...new Set(valda)].map((d) => dagar.indexOf(d)).sort((a, b) => a - b);
  const grupper: number[][] = [];
  for (const i of idx) {
    const g = grupper.at(-1);
    if (g && i === g.at(-1)! + 1) g.push(i);
    else grupper.push([i]);
  }
  const delar = grupper.flatMap((g) =>
    g.length >= 3 ? [`${kort[dagar[g[0]]]}–${kort[dagar[g.at(-1)!]]}`] : g.map((i) => kort[dagar[i]]),
  );
  const text = delar.length > 1 ? `${delar.slice(0, -1).join(', ')} och ${delar.at(-1)}` : delar[0];
  return stor(text);
}

/** "11:00" blir "11", "11:30" blir "11.30". */
const klocka = (t: string) => (t.endsWith(':00') ? String(Number(t.slice(0, 2))) : `${Number(t.slice(0, 2))}.${t.slice(3)}`);

/** "11–14". Midnatt skrivs 24, och efter midnatt med två siffror: "17–01". */
export const spann = ([fran, till]: readonly [string, string]) => {
  const slut = till === '00:00' ? '24' : till < fran ? klocka(till).padStart(2, '0') : klocka(till);
  return `${klocka(fran)}–${slut}`;
};

/** "11–14 och 17–22", eller "Stängt". */
export function tidText(tider: readonly (readonly [string, string])[]): string {
  if (!tider.length) return 'Stängt';
  const delar = tider.map(spann);
  return delar.length > 1 ? `${delar.slice(0, -1).join(', ')} och ${delar.at(-1)}` : delar[0];
}

export const pris = (n: number) => `${n.toLocaleString('sv-SE')} kr`;

/** "24 december" ur "2026-12-24". */
export function datumText(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
}

/** Avvikelser som inte har passerat, räknat från dagen sajten byggs. */
export function kommande<T extends { datum: string }>(lista: readonly T[], idag = new Date()): T[] {
  const nu = idag.toISOString().slice(0, 10);
  return lista.filter((a) => a.datum >= nu).sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Ord mellan stjärnor i en rubrik framhävs: "Vi lagar *med eld*." blir
 *  [["Vi lagar ", false], ["med eld", true], [".", false]]. Stilen bestämmer hur, som
 *  kursivt i accentfärgen i Afton. Se Framhavd.astro. */
export const framhavt = (text: string): [string, boolean][] =>
  text
    .split(/\*([^*\n]+)\*/)
    .map((del, i): [string, boolean] => [del, i % 2 === 1])
    .filter(([del]) => del);
