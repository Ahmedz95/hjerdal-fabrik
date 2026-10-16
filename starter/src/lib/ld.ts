// Strukturerad data (schema.org) som Google läser: restaurangen med adress,
// öppettider och bokning, och menyn med rätter och priser.
import { kund, type Sektion } from './kund';
import { schemaDag } from './format';

const bas = `https://${kund.doman}`;
const id = `${bas}/#restaurang`;

const tider = (dagarna: readonly (keyof typeof schemaDag)[], tiderna: readonly (readonly [string, string])[]) =>
  tiderna.map(([opens, closes]) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: dagarna.map((d) => `https://schema.org/${schemaDag[d]}`),
    opens,
    closes,
  }));

export function restaurangLd(bildUrl?: string) {
  const { kontakt } = kund;
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': id,
    name: kund.namn,
    description: kund.beskrivning,
    url: `${bas}/`,
    telephone: kontakt.telefon.replace(/\s/g, ''),
    ...(kontakt.epost && { email: kontakt.epost }),
    ...(bildUrl && { image: bildUrl }),
    address: {
      '@type': 'PostalAddress',
      streetAddress: kontakt.adress.gata,
      postalCode: kontakt.adress.postnummer,
      addressLocality: kontakt.adress.ort,
      addressCountry: 'SE',
    },
    ...(kontakt.geo && { geo: { '@type': 'GeoCoordinates', latitude: kontakt.geo.lat, longitude: kontakt.geo.lng } }),
    ...(kontakt.karta && { hasMap: kontakt.karta }),
    ...(kund.kok.length && { servesCuisine: kund.kok }),
    ...(kund.prisniva && { priceRange: kund.prisniva }),
    openingHoursSpecification: kund.oppettider.flatMap((o) => tider(o.dagar, o.tider)),
    ...(kund.avvikelser.length && {
      specialOpeningHoursSpecification: kund.avvikelser.map((a) =>
        a.stangt || !a.tider.length
          ? { '@type': 'OpeningHoursSpecification', validFrom: a.datum, validThrough: a.datum, opens: '00:00', closes: '00:00' }
          : { '@type': 'OpeningHoursSpecification', validFrom: a.datum, validThrough: a.datum, opens: a.tider[0][0], closes: a.tider.at(-1)![1] },
      ),
    }),
    hasMenu: `${bas}/meny/`,
    acceptsReservations: kund.boka ? kund.boka.url : false,
    ...(Object.values(kund.sociala).some(Boolean) && { sameAs: Object.values(kund.sociala).filter(Boolean) }),
  };
}

const diet: Record<string, string> = {
  vegansk: 'https://schema.org/VeganDiet',
  vegetarisk: 'https://schema.org/VegetarianDiet',
  glutenfri: 'https://schema.org/GlutenFreeDiet',
  laktosfri: 'https://schema.org/LowLactoseDiet',
};

const sektionLd = (s: Sektion) => ({
  '@type': 'MenuSection',
  name: s.namn,
  ...(s.text && { description: s.text }),
  hasMenuItem: s.ratter.map((r) => ({
    '@type': 'MenuItem',
    name: r.namn,
    ...(r.text && { description: r.text }),
    ...(r.pris !== undefined && { offers: { '@type': 'Offer', price: r.pris, priceCurrency: 'SEK' } }),
    ...(r.taggar.some((t) => diet[t]) && { suitableForDiet: r.taggar.filter((t) => diet[t]).map((t) => diet[t]) }),
  })),
});

export function menyLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    '@id': `${bas}/meny/#meny`,
    name: `${kund.meny.rubrik} – ${kund.namn}`,
    url: `${bas}/meny/`,
    inLanguage: 'sv-SE',
    hasMenuSection: kund.meny.sektioner.map(sektionLd),
  };
}
