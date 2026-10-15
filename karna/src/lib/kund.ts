// Kundfilen (src/data/kund.json) är det enda som skiljer en kunds sajt från en
// annans. fabrik.py skriver den; här kontrolleras den mot schemat
// (src/lib/schema.ts) vid bygget, så att ett fel i kundfilen stoppar bygget
// med ett begripligt meddelande i stället för att synas på sajten.
import data from '../data/kund.json';
import { schema, svenskaFel, type Kund } from './schema';

export { dagar, dagNamn, taggar, type Dag, type Kund, type Sektion, type Ratt } from './schema';

function lasKund(): Kund {
  const res = schema.safeParse(data, { errorMap: svenskaFel });
  if (!res.success) {
    const rader = res.error.issues.map((i) => `  - ${i.path.join('.') || '(hela filen)'}: ${i.message}`);
    throw new Error(`Kundfilen har fel och sajten byggs inte:\n${rader.join('\n')}`);
  }
  return res.data;
}

export const kund = lasKund();

// Länkar inom sajten. BASE_URL är "/" i drift och "/varianter/<namn>/" i förhandsvisningen.
export const url = (sokvag: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${sokvag}`;

/** Sidorna i menyn, i ordning. Sidor som är avstängda i kundfilen tas bort av fabrik.py. */
export const sidor = [
  { href: '/meny/', label: 'Meny' },
  ...(kund.funktioner.omOss && kund.om ? [{ href: '/om-oss/', label: 'Om oss' }] : []),
  { href: '/kontakt/', label: 'Hitta hit' },
];

export const telLank = (t: string) => `tel:${t.replace(/[^\d+]/g, '')}`;
