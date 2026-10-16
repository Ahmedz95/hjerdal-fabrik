// Bokningen i webbläsaren: de närmaste sex dagarna med öppet, tiderna var
// trettionde minut fram till en timme före stängning, och en bekräftelse.
// Det är en demo; ingen bokning skickas. Hos en riktig kund går den till
// restaurangens bokningssystem.
import { lasOppet, tiderFor } from './oppet';

const dagNamn = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function startaBokning() {
  const form = document.querySelector<HTMLFormElement>('[data-bokning]');
  const o = lasOppet();
  if (!form || !o) return;
  const dagRuta = form.querySelector<HTMLElement>('[data-dagar]')!;
  const tidRuta = form.querySelector<HTMLElement>('[data-tider]')!;
  const svar = form.querySelector<HTMLElement>('[data-bekraftelse]')!;

  const nu = new Date();
  const nuMin = nu.getHours() * 60 + nu.getMinutes();

  /** Tiderna att boka en dag, i minuter: var trettionde minut till en timme före stängning, senast 23. */
  const tider = (d: Date, idag: boolean) =>
    tiderFor(o, d).flatMap(([start, slut]) => {
      const lista: number[] = [];
      for (let m = start; m <= Math.min(slut - 60, 23 * 60); m += 30) if (!idag || m > nuMin + 30) lista.push(m);
      return lista;
    });

  const dagar: { datum: Date; idag: boolean }[] = [];
  for (let i = 0; dagar.length < 6 && i < 14; i++) {
    const d = new Date(nu);
    d.setDate(nu.getDate() + i);
    if (tider(d, i === 0).length) dagar.push({ datum: d, idag: i === 0 });
  }
  if (!dagar.length) return;

  dagRuta.innerHTML = '';
  dagar.forEach((d, i) => {
    const etikett = d.idag ? 'I dag' : `${stor(dagNamn[d.datum.getDay()])} ${d.datum.getDate()}`;
    dagRuta.insertAdjacentHTML('beforeend', `<label><input type="radio" name="dag" value="${i}"${i === 0 ? ' checked' : ''}><span>${etikett}</span></label>`);
  });

  const valt = (namn: string) => form.querySelector<HTMLInputElement>(`input[name="${namn}"]:checked`)?.value;

  function ritaTider() {
    const dag = dagar[Number(valt('dag') ?? 0)];
    const gaster = Number(valt('gaster') ?? 2);
    const seed = dag.datum.getDate();
    tidRuta.innerHTML = '';
    tider(dag.datum, dag.idag).forEach((m, i) => {
      // Några tider är fullbokade, olika varje dag och fler för stora sällskap.
      const full = (i * 7 + seed) % 5 === 0 || (gaster >= 5 && i % 3 === 1);
      const tid = hhmm(m);
      tidRuta.insertAdjacentHTML(
        'beforeend',
        `<label${full ? ' class="full"' : ''}><input type="radio" name="tid" value="${tid}"${full ? ' disabled' : ''}><span>${tid}${full ? '<span class="sr"> fullbokat</span>' : ''}</span></label>`,
      );
    });
  }

  form.addEventListener('change', (e) => {
    const namn = (e.target as HTMLInputElement).name;
    if (namn === 'dag' || namn === 'gaster') ritaTider();
    if (namn !== 'namn') svar.textContent = '';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const tid = valt('tid');
    if (!tid) {
      svar.innerHTML = '<b>Välj en tid först.</b>';
      form.querySelector<HTMLInputElement>('input[name="tid"]:not(:disabled)')?.focus();
      return;
    }
    const dag = dagar[Number(valt('dag') ?? 0)].datum;
    const gaster = valt('gaster') ?? '2';
    const namn = (form.querySelector<HTMLInputElement>('input[name="namn"]')!.value || '').trim();
    const b = document.createElement('b');
    b.textContent = `${namn ? `${namn}, b` : 'B'}ord för ${gaster} ${dagNamn[dag.getDay()]} ${dag.getDate()}/${dag.getMonth() + 1} kl ${tid}. Vi ses under neonet.`;
    const p = document.createElement('p');
    p.textContent = 'Det här är en demo, så ingen bokning har skickats.';
    svar.replaceChildren(b, p);
  });

  ritaTider();
  form.hidden = false;
}
