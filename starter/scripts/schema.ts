// Skriver cms.manifest.json: de fält som går att redigera, alltså kundfilens schema
// som JSON Schema, designvalen, namnen på alla val och starterns version. fabrik.py och
// HJERDAL Designer läser filen, så att de alltid känner till samma fält, stilar och teman
// som bygget, och Designer ritar sitt formulär från den.
// Körs med npm run schema efter en ändring i src/lib/schema.ts eller
// src/lib/designval.ts. CI stoppar om filen inte är uppdaterad.
import { readFileSync, writeFileSync } from 'node:fs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { schema, dagNamn, taggar } from '../src/lib/schema';
import { heroInfo, menyInfo, stilInfo, temaInfo } from '../src/lib/designval';
import { arMorkt } from '../src/lib/tema';

const paket = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

const ut = {
  starter: paket.version as string,
  stilar: Object.entries(stilInfo).map(([id, s]) => ({ id, ...s })),
  teman: Object.entries(temaInfo).map(([id, t]) => ({ id, ...t, mork: arMorkt(id as keyof typeof temaInfo) })),
  heros: Object.entries(heroInfo).map(([id, h]) => ({ id, ...h })),
  menyer: Object.entries(menyInfo).map(([id, m]) => ({ id, ...m })),
  // Visningsnamn för valen i schemats listor (enum). Designer väljer den grupp
  // som innehåller alla värden i en lista, så en ny lista får sina namn här.
  namn: {
    dag: dagNamn,
    tagg: taggar,
    stil: Object.fromEntries(Object.entries(stilInfo).map(([id, s]) => [id, s.namn])),
    tema: Object.fromEntries(Object.entries(temaInfo).map(([id, t]) => [id, t.namn])),
    hero: Object.fromEntries(Object.entries(heroInfo).map(([id, h]) => [id, h.namn])),
    meny: Object.fromEntries(Object.entries(menyInfo).map(([id, m]) => [id, m.namn])),
    rubrik: { sans: 'Sans', serif: 'Serif' },
  },
  schema: zodToJsonSchema(schema, { target: 'jsonSchema7', $refStrategy: 'none', errorMessages: true }),
};

writeFileSync(new URL('../cms.manifest.json', import.meta.url), JSON.stringify(ut, null, 2) + '\n');
console.log('Skrev cms.manifest.json');
