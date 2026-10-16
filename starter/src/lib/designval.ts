// Designvalen: stilar, stilarnas delar, färgteman, startsidans överdel och menyns
// layout. Det här är den enda listan: kundfilens schema, fabrik.py och HJERDAL
// Designer läser den (via cms.manifest.json), så ett nytt val läggs till här och
// som en CSS-fil i src/styles/, inget annat.
//
// En stil är en utgångspunkt: den väljer typsnitt, former, etiketter och foton
// (delar), och har sina egna grepp i src/styles/stilar/<id>.css, som den centrerade
// startsidan i Klassisk. Varje del kan bytas för sig i kundfilen, så att två kunder
// med samma stil ändå får var sin sajt.

/** Typsnitten: rubrik och brödtext, rubrikernas storlek, knapparnas och loggans text.
 *  En fil per val i src/styles/typsnitt/<id>.css. */
export const typsnittInfo = {
  albert: { namn: 'Albert Sans', beskrivning: 'Lätta stora rubriker och priser i mono. Fraunces i rubrikerna i teman med serif.' },
  garamond: { namn: 'Cormorant och Source Serif', beskrivning: 'Serif i rubriker och text, som en tryckt meny.' },
  oswald: { namn: 'Oswald och Archivo', beskrivning: 'Smala versala rubriker och en tydlig grotesk.' },
  bricolage: { namn: 'Bricolage och Figtree', beskrivning: 'Vänliga, lite egensinniga rubriker och en mjuk grotesk.' },
  bodoni: { namn: 'Bodoni och Jost', beskrivning: 'Bodoni med kursiva ord, spärrade knappar och en geometrisk grotesk.' },
  schibsted: { namn: 'Schibsted Grotesk', beskrivning: 'Ett typsnitt i allt, fett och tätt i jätteformat.' },
  archivo: { namn: 'Archivo och Fraunces', beskrivning: 'Feta versaler blandade med en mjuk och rund serif.' },
} as const;

/** Formerna: hörn, linjer, knappar och skuggor. En fil per val i src/styles/former/. */
export const formerInfo = {
  runda: { namn: 'Runda', beskrivning: 'Runda knappar, tunna linjer och inga skuggor.' },
  raka: { namn: 'Raka', beskrivning: 'Raka hörn och tunna linjer.' },
  kantiga: { namn: 'Kantiga', beskrivning: 'Små hörn och kraftiga linjer mellan avsnitten.' },
  mjuka: { namn: 'Mjuka', beskrivning: 'Rundade kort, bilder och band.' },
  tunna: { namn: 'Tunna', beskrivning: 'Raka hörn, hårfina linjer och mer luft mellan avsnitten.' },
  tjocka: { namn: 'Tjocka', beskrivning: 'Tjocka linjer i textfärgen och runda knappar.' },
  klistermarken: { namn: 'Klistermärken', beskrivning: 'Kraftiga linjer, knappar och kort med en förskjuten skugga.' },
} as const;

/** Etiketterna ovanför rubrikerna och märkningen i menyn. En fil per val i src/styles/etiketter/. */
export const etiketterInfo = {
  sparrade: { namn: 'Spärrade', beskrivning: 'Små spärrade versaler i grått.' },
  kursiva: { namn: 'Kursiva', beskrivning: 'En kursiv rad i rubrikernas typsnitt.' },
  ruta: { namn: 'Med ruta', beskrivning: 'Feta versaler efter en liten ruta i accentfärgen.' },
  brickor: { namn: 'Brickor', beskrivning: 'Små runda brickor.' },
  linje: { namn: 'Med linje', beskrivning: 'Spärrade versaler i accentfärgen efter en tunn linje.' },
  versaler: { namn: 'Versaler', beskrivning: 'Små versaler i textfärgen, som på en affisch.' },
  tejp: { namn: 'Tejp', beskrivning: 'Versaler på en remsa tejp, lite snett, och märkningen som stämplar.' },
} as const;

/** Fotona på startsidan och Om oss. En fil per val i src/styles/foton/. */
export const fotonInfo = {
  naturliga: { namn: 'Som de är', beskrivning: 'I färg, utan effekter.' },
  svartvita: { namn: 'Svartvita', beskrivning: 'I svartvitt, med lodräta linjer över bilden bredvid rubriken.' },
  lutande: { namn: 'Lutande', beskrivning: 'Lite snett, med en ram och en platta i accentfärgen bakom.' },
} as const;

type Delar = {
  typsnitt: keyof typeof typsnittInfo;
  former: keyof typeof formerInfo;
  etiketter: keyof typeof etiketterInfo;
  foton: keyof typeof fotonInfo;
};

/** Stilen är en utgångspunkt: delarna den väljer, de teman den passar bäst med (först
 *  i förslagen) och vilka ställen den passar. Stilens egna grepp ligger i
 *  src/styles/stilar/<id>.css. */
export const stilInfo = {
  hjerdal: {
    namn: 'HJERDAL',
    passar: 'Det mesta',
    beskrivning: 'Vårt eget formspråk: lätta stora rubriker, spärrade versala etiketter, runda knappar och priser i mono.',
    delar: { typsnitt: 'albert', former: 'runda', etiketter: 'sparrade', foton: 'naturliga' },
    teman: ['fjall', 'hav', 'skiffer', 'linne'],
  },
  klassisk: {
    namn: 'Klassisk',
    passar: 'Vita dukar, vinbarer, gamla bistroer',
    beskrivning: 'Serif i rubriker och text, centrerad startsida, raka hörn, kursiva etiketter och punktlinjer fram till priset.',
    delar: { typsnitt: 'garamond', former: 'raka', etiketter: 'kursiva', foton: 'naturliga' },
    teman: ['linne', 'ek', 'plommon', 'mossa'],
  },
  kvarter: {
    namn: 'Kvarter',
    passar: 'Pizzerior, burgare, streetfood',
    beskrivning: 'Smala versala rubriker, kraftiga linjer, små hörn och tydliga block.',
    delar: { typsnitt: 'oswald', former: 'kantiga', etiketter: 'ruta', foton: 'naturliga' },
    teman: ['skiffer', 'senap', 'kol', 'fjall'],
  },
  mjuk: {
    namn: 'Mjuk',
    passar: 'Kaféer, bagerier, brunch',
    beskrivning: 'Vänliga rubriker, rundade kort och bilder och etiketter som små brickor.',
    delar: { typsnitt: 'bricolage', former: 'mjuka', etiketter: 'brickor', foton: 'naturliga' },
    teman: ['salvia', 'terrakotta', 'linne', 'oliv'],
  },
  afton: {
    namn: 'Afton',
    passar: 'Avsmakningsmenyer, fine dining, vinbarer',
    beskrivning: 'Stora rubriker i Bodoni med kursiva ord i accentfärgen, spärrade etiketter, mycket luft och tunna linjer.',
    delar: { typsnitt: 'bodoni', former: 'tunna', etiketter: 'linje', foton: 'naturliga' },
    teman: ['kol', 'mossa', 'plommon', 'ek'],
  },
  affisch: {
    namn: 'Affisch',
    passar: 'Vedeldade kök, vinbarer, ställen med ett starkt namn',
    beskrivning: 'Ett typsnitt i jätteformat, tjocka linjer, svartvita foton och etiketter som på en affisch.',
    delar: { typsnitt: 'schibsted', former: 'tjocka', etiketter: 'versaler', foton: 'svartvita' },
    teman: ['senap', 'fjall', 'ek', 'kol'],
  },
  stampel: {
    namn: 'Stämpel',
    passar: 'Kvarterskrogar, delade rätter, kaféer med personlighet',
    beskrivning: 'Feta versaler blandade med en mjuk serif, etiketter som tejp, lutande bilder och stämplar.',
    delar: { typsnitt: 'archivo', former: 'klistermarken', etiketter: 'tejp', foton: 'lutande' },
    teman: ['oliv', 'terrakotta', 'linne', 'plommon'],
  },
} as const satisfies Record<string, { namn: string; passar: string; beskrivning: string; delar: Delar; teman: readonly string[] }>;

type Farger = { bg: string; surface: string; ink: string; muted: string; line: string; accent: string };

/**
 * Temat styr bara färgerna. I stilen hjerdal har temat också ett eget
 * rubriktypsnitt (rubrik). Bygget stoppar om en färg får för låg kontrast.
 */
export const temaInfo = {
  // HJERDAL:s egna färger: Snö, Is, Granit och Skiffer.
  fjall: { namn: 'Fjäll', bg: '#F5F6F4', surface: '#E8EBE9', ink: '#101315', muted: '#596066', line: '#D5DAD8', accent: '#101315', rubrik: 'sans' },
  linne: { namn: 'Linne', bg: '#F3EFE7', surface: '#E9E2D4', ink: '#221E18', muted: '#62594C', line: '#D8CFBE', accent: '#6B4226', rubrik: 'serif' },
  salvia: { namn: 'Salvia', bg: '#EEF1EA', surface: '#E1E7DB', ink: '#1C261F', muted: '#4F5D52', line: '#CCD5C6', accent: '#2F4A37', rubrik: 'serif' },
  ek: { namn: 'Ek', bg: '#1B1814', surface: '#25211B', ink: '#F2EDE3', muted: '#B3A999', line: '#3A332A', accent: '#D9BC8C', rubrik: 'serif' },
  skiffer: { namn: 'Skiffer', bg: '#111417', surface: '#1A1E22', ink: '#EEF1F2', muted: '#A9B0B5', line: '#2B3136', accent: '#B9D3D9', rubrik: 'sans' },
  hav: { namn: 'Hav', bg: '#0E1822', surface: '#15222E', ink: '#EEF3F6', muted: '#A4B3BF', line: '#23384A', accent: '#F0B65A', rubrik: 'sans' },
  // Från inspirationen i examples/inspiration.md: glöden över grillen, fine dining i
  // grönt och plommon, krämvitt med oliv, senapsgult med svart och ett varmt kafé.
  kol: { namn: 'Kol', bg: '#15110E', surface: '#1F1915', ink: '#F2E9DC', muted: '#B3A594', line: '#362C24', accent: '#E07A3F', rubrik: 'serif' },
  mossa: { namn: 'Mossa', bg: '#10201A', surface: '#172A22', ink: '#EFE8D6', muted: '#A9B5A6', line: '#284034', accent: '#CDA85E', rubrik: 'serif' },
  plommon: { namn: 'Plommon', bg: '#26121D', surface: '#321927', ink: '#F5E9EC', muted: '#C7AEB9', line: '#4A2B3B', accent: '#D9B56C', rubrik: 'serif' },
  oliv: { namn: 'Oliv', bg: '#F1E9D6', surface: '#E6DCC3', ink: '#1F1E14', muted: '#5A5640', line: '#CFC4A8', accent: '#7E9346', rubrik: 'serif' },
  senap: { namn: 'Senap', bg: '#D9A21E', surface: '#E3B23A', ink: '#191C22', muted: '#3A2E0E', line: '#B8861A', accent: '#191C22', rubrik: 'sans' },
  terrakotta: { namn: 'Terrakotta', bg: '#F7EFE6', surface: '#EFE2D3', ink: '#2A1A12', muted: '#6B5446', line: '#E2D2C0', accent: '#A84B24', rubrik: 'sans' },
} as const satisfies Record<string, Farger & { namn: string; rubrik: 'sans' | 'serif' }>;

/** Startsidans överdel. Delad och bild kräver en herobild; utan den blir det text. */
export const heroInfo = {
  text: { namn: 'Stor rubrik', beskrivning: 'Rubriken och ingressen i stort format, utan bild.' },
  delad: { namn: 'Text och bild', beskrivning: 'Texten på ena sidan och den stora bilden på den andra.' },
  bild: { namn: 'Helbild', beskrivning: 'Den stora bilden över hela bredden med texten ovanpå.' },
} as const;

/** Menyns layout på /meny/. */
export const menyInfo = {
  lista: { namn: 'Lista', beskrivning: 'Sektionens rubrik till vänster och rätterna till höger.' },
  kolumner: { namn: 'Två kolumner', beskrivning: 'Två sektioner bredvid varandra.' },
  kort: { namn: 'Kort', beskrivning: 'Varje rätt som ett eget kort.' },
  numrerad: { namn: 'Numrerad', beskrivning: 'Sektionerna numrerade med stora siffror, som rätterna i en avsmakningsmeny.' },
} as const;

type Id<T> = [keyof T & string, ...(keyof T & string)[]];
export const stilar = Object.keys(stilInfo) as Id<typeof stilInfo>;
export const typsnitt = Object.keys(typsnittInfo) as Id<typeof typsnittInfo>;
export const former = Object.keys(formerInfo) as Id<typeof formerInfo>;
export const etiketter = Object.keys(etiketterInfo) as Id<typeof etiketterInfo>;
export const foton = Object.keys(fotonInfo) as Id<typeof fotonInfo>;
export const teman = Object.keys(temaInfo) as Id<typeof temaInfo>;
export const heros = Object.keys(heroInfo) as Id<typeof heroInfo>;
export const menyer = Object.keys(menyInfo) as Id<typeof menyInfo>;

/** Delarna en kund får: det kundfilen väljer, annars stilens. */
export const valdaDelar = (design: { stil?: keyof typeof stilInfo } & Partial<Delar>): Delar => {
  const stilens = stilInfo[design.stil ?? 'hjerdal'].delar;
  return {
    typsnitt: design.typsnitt ?? stilens.typsnitt,
    former: design.former ?? stilens.former,
    etiketter: design.etiketter ?? stilens.etiketter,
    foton: design.foton ?? stilens.foton,
  };
};
