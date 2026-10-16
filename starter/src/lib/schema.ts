// Kundfilens schema: vilka fält som finns, vad som är tillåtet och vad fälten
// heter för den som fyller i dem. Bygget kontrollerar kundfilen mot schemat
// (src/lib/kund.ts), och HJERDAL Designer bygger sitt formulär från samma
// schema via cms.manifest.json (npm run schema). Ett nytt fält här dyker
// därför upp i Designer utan att någon ändrar appen.
//
// .describe('Etikett|Hjälptext|tips') är det som visas i formuläret. Tipsen är
// valfria: flerrad ger en textruta med flera rader.
import { z } from 'astro/zod';
import { heros, menyer, stilar, teman } from './designval';

/** Felmeddelanden på svenska. Ett eget meddelande på ett fält, som i tid nedan, går före. */
export const svenskaFel: z.ZodErrorMap = (fel, ctx) => {
  const tom = fel.code === 'invalid_type' && (fel.received === 'undefined' || fel.received === 'null');
  if (tom || (fel.code === 'too_small' && fel.type === 'string' && fel.minimum === 1)) return { message: 'måste fyllas i' };
  switch (fel.code) {
    case 'invalid_type':
      return { message: `ska vara ${{ string: 'text', number: 'ett tal', boolean: 'ja eller nej', array: 'en lista', object: 'en grupp' }[fel.expected as string] ?? fel.expected}` };
    case 'too_small':
      if (fel.type === 'string') return { message: `ska vara minst ${fel.minimum} tecken` };
      if (fel.type === 'array') return { message: fel.minimum === 1 ? 'behöver minst en' : `behöver minst ${fel.minimum}` };
      if (fel.type === 'number') return { message: `får inte vara mindre än ${fel.minimum}` };
      break;
    case 'too_big':
      if (fel.type === 'string') return { message: `får vara högst ${fel.maximum} tecken` };
      if (fel.type === 'array') return { message: `får ha högst ${fel.maximum}` };
      if (fel.type === 'number') return { message: `får inte vara större än ${fel.maximum}` };
      break;
    case 'invalid_enum_value':
      return { message: `'${fel.received}' finns inte, välj ${fel.options.join(', ')}` };
    case 'invalid_string':
      if (fel.validation === 'email') return { message: 'skrivs som namn@exempel.se' };
      if (fel.validation === 'url') return { message: 'måste börja med https://' };
      break;
    case 'unrecognized_keys':
      return { message: `okända fält: ${fel.keys.join(', ')}` };
  }
  return { message: ctx.defaultError };
};

const tid = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'skrivs som 11:00');
const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'skrivs som 2026-12-24');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'skrivs som #1E1B16');
const lank = z.string().url('måste börja med https://');
const tider = z.array(z.tuple([tid, tid])).default([]);

export const dagNamn = { man: 'Mån', tis: 'Tis', ons: 'Ons', tor: 'Tor', fre: 'Fre', lor: 'Lör', son: 'Sön' } as const;
export const dagar = Object.keys(dagNamn) as [keyof typeof dagNamn, ...(keyof typeof dagNamn)[]];
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

const ratt = z
  .object({
    namn: z.string().min(1).describe('Namn'),
    text: z.string().optional().describe('Beskrivning|Till exempel tillbehören.|flerrad'),
    pris: z.number().nonnegative().optional().describe('Pris|I kronor, utan "kr".'),
    prisText: z.string().optional().describe('Pris som text|När priset inte är ett tal, till exempel Dagspris.'),
    taggar: z.array(tagg).default([]).describe('Märkning'),
    allergener: z.array(z.string()).default([]).describe('Allergener|Till exempel gluten, mjölk, nötter.'),
    slut: z.boolean().default(false).describe('Slut för idag|Rätten står kvar men är överstruken.'),
  })
  .describe('Rätt');

const sektion = z
  .object({
    namn: z.string().min(1).describe('Namn|Till exempel Lunch, Kväll eller Att dricka.'),
    text: z.string().optional().describe('Text under rubriken||flerrad'),
    dagar: z.array(dag).optional().describe('Dagar|Menyskärmen visar sektionen bara de här dagarna.'),
    fran: tid.optional().describe('Från|Menyskärmen visar sektionen från den här tiden.'),
    till: tid.optional().describe('Till'),
    ratter: z.array(ratt).min(1).describe('Rätter'),
  })
  .describe('Sektion');

const bild = z.object({
  fil: z
    .string()
    .regex(/^[\w.-]+\.(jpe?g|png|webp)$/i, 'ska vara en jpg, png eller webp i kundens mapp bilder/')
    .describe('Bild'),
  alt: z.string().min(5, 'beskriv bilden i minst fem tecken').describe('Beskrivning av bilden|För den som inte ser bilden, till exempel "Matsalen en kväll med tända ljus".'),
});

// Loggan: SVG (helst med currentColor, så att den fungerar på alla teman), PNG eller WebP.
const logga = z.string().regex(/^[\w.-]+\.(svg|png|webp)$/i, 'ska vara en svg, png eller webp i kundens mapp bilder/');

const oppet = z
  .object({ dagar: z.array(dag).min(1).describe('Dagar'), tider: tider.describe('Tider|Inga tider betyder stängt.') })
  .describe('Öppettider');

export const schema = z.object({
  namn: z.string().min(1).describe('Restaurangens namn'),
  doman: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'skrivs utan https://, till exempel bistronordvik.se')
    .describe('Domän|Utan https://, till exempel bistronordvik.se.'),
  beskrivning: z
    .string()
    .min(50)
    .max(160)
    .describe('Beskrivning för Google|En mening på 50–160 tecken: vad, var och varför.|flerrad'),
  rubrik: z.string().min(1).describe('Rubrik på startsidan|Gärna en kort mening.'),
  ingress: z.string().min(1).describe('Ingress|Två meningar under rubriken.|flerrad'),
  kok: z.array(z.string()).default([]).describe('Kök|Till exempel Svensk eller Italiensk. Den första visas på startsidan.'),
  prisniva: z.enum(['$', '$$', '$$$', '$$$$']).optional().describe('Prisnivå'),
  kontakt: z
    .object({
      telefon: z.string().regex(/^\+?[\d ]{7,}$/, 'skrivs som +46 70 123 45 67').describe('Telefon'),
      epost: z.string().email().optional().describe('E-post'),
      adress: z
        .object({
          gata: z.string().min(1).describe('Gata'),
          postnummer: z.string().regex(/^\d{3} ?\d{2}$/, 'skrivs som 252 21').describe('Postnummer'),
          ort: z.string().min(1).describe('Ort'),
        })
        .describe('Adress'),
      karta: lank.optional().describe('Länk till kartan|Från Google Maps, Dela och Kopiera länk.'),
      geo: z.object({ lat: z.number(), lng: z.number() }).optional().describe('Koordinater|Valfritt, för Google.'),
    })
    .describe('Kontakt'),
  boka: z
    .object({
      url: lank.describe('Länk till bokningen|Till exempel från Bokabord eller Waiteraid.'),
      text: z.string().default('Boka bord').describe('Text på knappen'),
    })
    .optional()
    .describe('Bordsbokning|Utan bokning blir knappen Ring oss.'),
  sociala: z
    .object({
      instagram: lank.optional().describe('Instagram'),
      facebook: lank.optional().describe('Facebook'),
      tiktok: lank.optional().describe('TikTok'),
    })
    .default({})
    .describe('Sociala medier'),
  oppettider: z.array(oppet).min(1).describe('Öppettider'),
  avvikelser: z
    .array(
      z
        .object({
          datum: datum.describe('Datum'),
          text: z.string().min(1).describe('Vad|Till exempel Julafton.'),
          stangt: z.boolean().default(true).describe('Stängt hela dagen'),
          tider: tider.describe('Tider|Om det inte är stängt.'),
        })
        .describe('Avvikelse'),
    )
    .default([])
    .describe('Avvikande öppettider|Helgdagar och semester. Visas tills datumet har passerat.'),
  om: z
    .object({
      rubrik: z.string().min(1).describe('Rubrik'),
      stycken: z.array(z.string().min(1)).min(1).describe('Text|Ett eller flera stycken.|flerrad'),
    })
    .optional()
    .describe('Om oss'),
  meny: z
    .object({
      rubrik: z.string().default('Meny').describe('Rubrik'),
      text: z.string().optional().describe('Text under rubriken||flerrad'),
      allergiText: z.string().default('Fråga oss om allergener. Vi vet vad som finns i varje rätt.').describe('Text om allergener||flerrad'),
      sektioner: z.array(sektion).min(1).describe('Sektioner'),
    })
    .describe('Meny'),
  bilder: z
    .object({
      hero: bild.optional().describe('Stor bild på startsidan|Används när hero är delad eller bild.'),
      om: bild.optional().describe('Bild till Om oss'),
      logo: logga.optional().describe('Logga|SVG, PNG eller WebP. En SVG med currentColor fungerar på alla teman.'),
      logoMork: logga.optional().describe('Ljus logga|För de mörka temana, om loggan inte använder currentColor.'),
    })
    .default({})
    .describe('Bilder och logga'),
  design: z
    .object({
      stil: z.enum(stilar).default('hjerdal').describe('Stil|Typsnitt och former.'),
      tema: z.enum(teman).default('fjall').describe('Färger'),
      rubrik: z.enum(['sans', 'serif']).optional().describe('Rubriktypsnitt|Bara i stilen HJERDAL. Utan val används temats.'),
      accent: hex.optional().describe('Egen accentfärg|Färgen på knapparna. Bygget stoppar om texten på dem blir svår att läsa.'),
      hero: z.enum(heros).default('text').describe('Startsidans överdel|Delad och bild kräver en stor bild.'),
      meny: z.enum(menyer).default('lista').describe('Menyns layout'),
    })
    .default({})
    .describe('Design'),
  funktioner: z
    .object({
      omOss: z.boolean().default(true).describe('Sidan Om oss|Kräver att Om oss är ifyllt.'),
      skarm: z.boolean().default(false).describe('Menyskärm|En sida för en skärm i lokalen som visar rätt meny vid rätt tid.'),
      qr: z.boolean().default(false).describe('QR-skylt|En skylt att skriva ut till borden.'),
      hjerdalLank: z.boolean().default(true).describe('"Webbplats av HJERDAL" i sidfoten'),
    })
    .default({})
    .describe('Funktioner'),
});

export type Kund = z.infer<typeof schema>;
export type Sektion = Kund['meny']['sektioner'][number];
export type Ratt = Sektion['ratter'][number];
