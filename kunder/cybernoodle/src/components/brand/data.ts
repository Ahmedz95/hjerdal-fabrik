// Det CyberNoodles komponenter och skript delar. Fakta (rätter, priser,
// öppettider) kommer alltid från kundfilen; här står bara det som hör till
// designen, och kundfilen omräknad till den form som skripten behöver.
import { kund, dagar, type Dag } from '../../lib/kund';
import { pris } from '../../lib/format';

/** Rätternas namn på japanska, som dekor ovanför namnet. En rätt som inte står här visas utan. */
export const japanska: Record<string, string> = {
  'Tonkotsu Neon': '豚骨',
  'Miso Blackout': '味噌',
  'Tantan Pulse': '担々',
  'Yuzu Shio Glow': '柚子塩',
  'Vegan Ghost': '精進',
  'Osaka Midnight': '大阪',
  'Gyoza Circuit': '餃子',
  'Karaage Osaka': '唐揚げ',
  'Edamame Static': '枝豆',
  'Yuzu Highball': 'ハイボール',
  'Calpis Soda': 'カルピス',
  Ramune: 'ラムネ',
};

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sektion';

/** Menyn med ett id per rätt, samma på hemsidan, i köksadmin, på skärmen och i QR-menyn. */
let nr = 0;
export const sektioner = kund.meny.sektioner.map((s) => ({
  ...s,
  id: slug(s.namn),
  ratter: s.ratter.map((r) => ({ ...r, id: `r${nr++}` })),
}));
export const ratter = sektioner.flatMap((s) => s.ratter.map((r) => ({ ...r, sektion: s.id })));

export const prisText = (r: { pris?: number; prisText?: string }) => (r.pris !== undefined ? pris(r.pris) : (r.prisText ?? ''));

const tal = ['Noll', 'En', 'Två', 'Tre', 'Fyra', 'Fem', 'Sex', 'Sju', 'Åtta', 'Nio', 'Tio', 'Elva', 'Tolv'];
/** "Sex skålar, en natt i Osaka.", räknat ur menyns första sektion. */
export const menyRubrik = () => {
  const n = sektioner[0].ratter.length;
  return n <= 12 ? `${tal[n]} ${n === 1 ? 'skål' : 'skålar'}, en natt i Osaka.` : 'En natt i Osaka.';
};

const minuter = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const veckodag: Record<Dag, number> = { son: 0, man: 1, tis: 2, ons: 3, tor: 4, fre: 5, lor: 6 };

/** Öppettiderna som minuter efter midnatt per veckodag, 0 är söndag. Stänger stället efter midnatt är slutet över 1440. */
export const oppet = () => {
  const vecka: [number, number][][] = Array.from({ length: 7 }, () => []);
  for (const o of kund.oppettider) {
    for (const d of o.dagar) {
      for (const [fran, till] of o.tider) {
        const a = minuter(fran);
        const b = minuter(till);
        vecka[veckodag[d]].push([a, b <= a ? b + 1440 : b]);
      }
    }
  }
  const avvikelser = kund.avvikelser.map((a) => ({
    datum: a.datum,
    tider: a.stangt ? [] : a.tider.map(([f, t]) => [minuter(f), minuter(t) <= minuter(f) ? minuter(t) + 1440 : minuter(t)]),
  }));
  return { vecka, avvikelser };
};

/** Dagarna i veckan från måndag, med dagens öppettider, till tabellerna. */
export const dagNamnLangt: Record<Dag, string> = {
  man: 'Måndag', tis: 'Tisdag', ons: 'Onsdag', tor: 'Torsdag', fre: 'Fredag', lor: 'Lördag', son: 'Söndag',
};
export const veckan = dagar.map((d) => ({
  dag: d,
  index: veckodag[d],
  namn: dagNamnLangt[d],
  tider: kund.oppettider.filter((o) => o.dagar.includes(d)).flatMap((o) => o.tider),
}));
