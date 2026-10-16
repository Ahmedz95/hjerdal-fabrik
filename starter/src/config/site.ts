// Sajtens inställningar för alla sidor: namn, adress och språk från kundfilen,
// och hur kundens egen design (brand.json) tar över från temat. Delas av alla
// kunder; en kund med egen design ändrar bara brand.json, i kunder/<kund>/src/config/.
import { z } from 'zod';
import { kund } from '../lib/kund';
import brandFil from './brand.json';

const brandSchema = z
  .object({
    /** tema: färgerna kommer från temat i kundfilen. egna: från kundens src/styles/tokens.css. */
    farger: z.enum(['tema', 'egna']).default('tema'),
    /** Webbläsarens färg runt sidan i mobilen (theme-color) när färgerna är egna. */
    temaFarg: z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/, 'skrivs som #RRGGBB')]).default(''),
    /** Egen JavaScript på sidorna, som förbättring: allt ska gå att läsa och använda utan. */
    skript: z.boolean().default(false),
  })
  .strict();

function lasBrand() {
  const res = brandSchema.safeParse(brandFil);
  if (!res.success) {
    const rader = res.error.issues.map((i) => `  - ${i.path.join('.') || '(hela filen)'}: ${i.message}`);
    throw new Error(`src/config/brand.json har fel och sajten byggs inte:\n${rader.join('\n')}`);
  }
  if (res.data.farger === 'egna' && !res.data.temaFarg) {
    throw new Error('src/config/brand.json har fel och sajten byggs inte:\n  - temaFarg: behövs när färgerna är egna');
  }
  return res.data;
}

export const brand = lasBrand();

export const sajt = {
  namn: kund.namn,
  url: `https://${kund.doman}`,
  lang: 'sv',
  locale: 'sv_SE',
};
