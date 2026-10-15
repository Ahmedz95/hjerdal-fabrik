// Kundfilen (src/data/kund.json) är det enda som skiljer en kunds sajt från en
// annans. fabrik.py skriver den; här kontrolleras den vid bygget, så att ett
// fel i kundfilen stoppar bygget med ett begripligt meddelande i stället för
// att synas på sajten.
import { z } from 'astro/zod';
import data from '../data/kund.json';

const tid = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'skrivs som 11:00');
const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'skrivs som 2026-12-24');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'skrivs som #1E1B16');
const lank = z.string().url('måste börja med https://');

export const dagar = ['man', 'tis', 'ons', 'tor', 'fre', 'lor', 'son'] as const;
export type Dag = (typeof dagar)[number];
const dag = z.enum(dagar);

export const taggar = {
  vegansk: 'Vegansk',
  vegetarisk: 'Vegetarisk',
  glutenfri: 'Glutenfri',
  laktosfri: 'Laktosfri',
  stark: 'Stark',
  ny: 'Nytt',
} as const;
const tagg = z.enum(Object.keys(taggar) as [keyof typeof taggar, ...(keyof typeof taggar)[]]);

const ratt = z.object({
  namn: z.string().min(1),
  text: z.string().optional(),
  pris: z.number().nonnegative().optional(),
  // När priset inte är ett tal, till exempel "Dagspris".
  prisText: z.string().optional(),
  taggar: z.array(tagg).default([]),
  allergener: z.array(z.string()).default([]),
  // "Slut för idag": rätten står kvar men är överstruken.
  slut: z.boolean().default(false),
});

const sektion = z.object({
  namn: z.string().min(1),
  text: z.string().optional(),
  // Menyskärmen visar sektionen bara de dagar och tider som anges.
  dagar: z.array(dag).optional(),
  fran: tid.optional(),
  till: tid.optional(),
  ratter: z.array(ratt).min(1),
});

const bild = z.object({
  // Filnamnet i kundens mapp bilder/, till exempel hero.jpg.
  fil: z.string().regex(/^[\w.-]+\.(jpe?g|png|webp)$/i, 'ska vara en jpg, png eller webp i kundens mapp bilder/'),
  alt: z.string().min(5, 'beskriv bilden i minst fem tecken'),
});

// Loggan: SVG (helst med currentColor, så att den fungerar på alla teman), PNG eller WebP.
const logga = z.string().regex(/^[\w.-]+\.(svg|png|webp)$/i, 'ska vara en svg, png eller webp i kundens mapp bilder/');

export const teman = ['fjall', 'linne', 'salvia', 'ek', 'skiffer', 'hav'] as const;
export const stilar = ['hjerdal', 'klassisk', 'kvarter', 'mjuk'] as const;

const schema = z.object({
  namn: z.string().min(1),
  doman: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'skrivs utan https://, till exempel bistronordvik.se'),
  // Står i Googles sökresultat. Kortare än 50 tecken säger för lite, längre än 160 klipps.
  beskrivning: z.string().min(50).max(160),
  rubrik: z.string().min(1),
  ingress: z.string().min(1),
  kok: z.array(z.string()).default([]),
  prisniva: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
  kontakt: z.object({
    telefon: z.string().regex(/^\+?[\d ]{7,}$/, 'skrivs som +46 70 123 45 67'),
    epost: z.string().email().optional(),
    adress: z.object({
      gata: z.string().min(1),
      postnummer: z.string().regex(/^\d{3} ?\d{2}$/, 'skrivs som 252 21'),
      ort: z.string().min(1),
    }),
    karta: lank.optional(),
    geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  }),
  boka: z.object({ url: lank, text: z.string().default('Boka bord') }).optional(),
  sociala: z
    .object({ instagram: lank.optional(), facebook: lank.optional(), tiktok: lank.optional() })
    .default({}),
  // Tom lista med tider betyder stängt de dagarna.
  oppettider: z.array(z.object({ dagar: z.array(dag).min(1), tider: z.array(z.tuple([tid, tid])).default([]) })).min(1),
  avvikelser: z
    .array(z.object({ datum, text: z.string().min(1), stangt: z.boolean().default(true), tider: z.array(z.tuple([tid, tid])).default([]) }))
    .default([]),
  om: z.object({ rubrik: z.string().min(1), stycken: z.array(z.string().min(1)).min(1) }).optional(),
  meny: z.object({
    rubrik: z.string().default('Meny'),
    text: z.string().optional(),
    allergiText: z.string().default('Fråga oss om allergener. Vi vet vad som finns i varje rätt.'),
    sektioner: z.array(sektion).min(1),
  }),
  bilder: z
    .object({
      hero: bild.optional(),
      om: bild.optional(),
      logo: logga.optional(),
      // En ljus version av loggan för de mörka temana, om loggan inte använder currentColor.
      logoMork: logga.optional(),
    })
    .default({}),
  design: z
    .object({
      // Stilen styr typsnitt och former, temat färgerna.
      stil: z.enum(stilar).default('hjerdal'),
      tema: z.enum(teman).default('fjall'),
      // Bara i stilen hjerdal: byter temats rubriktypsnitt.
      rubrik: z.enum(['sans', 'serif']).optional(),
      accent: hex.optional(),
      hero: z.enum(['text', 'delad', 'bild']).default('text'),
      meny: z.enum(['lista', 'kolumner', 'kort']).default('lista'),
    })
    .default({}),
  funktioner: z
    .object({
      omOss: z.boolean().default(true),
      skarm: z.boolean().default(false),
      qr: z.boolean().default(false),
      // "Webbplats av HJERDAL" i sidfoten.
      hjerdalLank: z.boolean().default(true),
    })
    .default({}),
});

export type Kund = z.infer<typeof schema>;
export type Sektion = Kund['meny']['sektioner'][number];
export type Ratt = Sektion['ratter'][number];

function lasKund(): Kund {
  const res = schema.safeParse(data);
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
