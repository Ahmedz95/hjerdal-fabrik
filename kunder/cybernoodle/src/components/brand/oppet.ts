// Öppettiderna i webbläsaren: om det är öppet just nu, och vilka dagar och tider
// som går att boka. Datan kommer från kundfilen via oppet() i data.ts.

export type Oppet = { vecka: [number, number][][]; avvikelser: { datum: string; tider: number[][] }[] };

const kortDag = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Läser datan som komponenten har lagt i sidan. */
export const lasOppet = (): Oppet | undefined => {
  const el = document.getElementById('cn-oppet');
  return el?.textContent ? (JSON.parse(el.textContent) as Oppet) : undefined;
};

/** Tiderna en viss dag, i minuter efter midnatt, med avvikelserna. */
export function tiderFor(o: Oppet, d: Date): number[][] {
  const avvikelse = o.avvikelser.find((a) => a.datum === iso(d));
  return avvikelse ? avvikelse.tider : o.vecka[d.getDay()];
}

/** "23", "24" för midnatt, "02" efter midnatt och "17.30" för en halvtimme, som på resten av sajten. */
export function klocka(m: number): string {
  if (m === 1440) return '24';
  const h = Math.floor(m / 60) % 24;
  const timme = m > 1440 ? String(h).padStart(2, '0') : String(h);
  return m % 60 ? `${timme}.${String(m % 60).padStart(2, '0')}` : timme;
}

/** "Öppet nu · till 23" eller "Stängt · öppnar tis 17". */
export function status(o: Oppet, nu = new Date()): { oppet: boolean; text: string } {
  const m = nu.getHours() * 60 + nu.getMinutes();
  const igar = new Date(nu);
  igar.setDate(nu.getDate() - 1);
  for (const [, slut] of tiderFor(o, igar)) {
    if (slut > 1440 && m < slut - 1440) return { oppet: true, text: `Öppet nu · till ${klocka(slut)}` };
  }
  for (const [start, slut] of tiderFor(o, nu)) {
    if (m >= start && m < slut) return { oppet: true, text: `Öppet nu · till ${klocka(slut)}` };
  }
  for (let i = 0; i < 8; i++) {
    const d = new Date(nu);
    d.setDate(nu.getDate() + i);
    const starter = tiderFor(o, d)
      .map(([start]) => start)
      .filter((start) => i > 0 || start > m)
      .sort((a, b) => a - b);
    if (starter.length) {
      const dag = i === 0 ? 'i dag' : i === 1 ? 'i morgon' : kortDag[d.getDay()];
      return { oppet: false, text: `Stängt · öppnar ${dag} ${klocka(starter[0])}` };
    }
  }
  return { oppet: false, text: 'Stängt just nu' };
}

/** Fyller i öppet-statusen på de element som har data-oppet-status. */
export function visaStatus() {
  const o = lasOppet();
  if (!o) return;
  const s = status(o);
  for (const el of document.querySelectorAll<HTMLElement>('[data-oppet-status]')) {
    el.querySelector('[data-oppet-text]')!.textContent = s.text;
    el.classList.toggle('stangt', !s.oppet);
    el.hidden = false;
  }
}

/** Dagens rad i öppettiderna. */
export function markeraIdag() {
  const idag = new Date().getDay();
  for (const rad of document.querySelectorAll<HTMLElement>('[data-veckodag]')) {
    if (Number(rad.dataset.veckodag) !== idag) continue;
    rad.classList.add('idag');
    rad.querySelector('[data-idag]')?.removeAttribute('hidden');
  }
}
