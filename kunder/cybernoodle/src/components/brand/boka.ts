// Bokningen i webbläsaren: de närmaste sex dagarna med öppet, tiderna var
// trettionde minut fram till en timme före stängning, och en bekräftelse.
// Det är en demo; ingen bokning skickas och inga tider är fullbokade. Hos en
// riktig kund går den till restaurangens bokningssystem, som vet vilka tider
// som är lediga.
import { lasOppet, tiderFor, nuIStockholm } from './oppet';

const dagKort = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const dagLang = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const manad = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "19.00", som tiderna på resten av sajten. */
const tidText = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;

export function startaBokning() {
  const form = document.querySelector<HTMLFormElement>('[data-bokning]');
  const o = lasOppet();
  if (!form || !o) return;
  const dagRuta = form.querySelector<HTMLElement>('[data-dagar]')!;
  const tidRuta = form.querySelector<HTMLElement>('[data-tider]')!;
  const tidGrupp = tidRuta.closest('fieldset')!;
  const tidFel = form.querySelector<HTMLElement>('[data-tid-fel]')!;
  const svar = form.querySelector<HTMLElement>('[data-bekraftelse]')!;

  const nu = nuIStockholm();
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
    const etikett = d.idag ? 'I dag' : `${stor(dagKort[d.datum.getDay()])} ${d.datum.getDate()}`;
    dagRuta.insertAdjacentHTML('beforeend', `<label><input type="radio" name="dag" value="${i}"${i === 0 ? ' checked' : ''}><span>${etikett}</span></label>`);
  });

  const valt = (namn: string) => form.querySelector<HTMLInputElement>(`input[name="${namn}"]:checked`)?.value;

  function visaFel(text: string) {
    tidFel.textContent = text;
    tidFel.hidden = !text;
    tidGrupp.classList.toggle('fel', Boolean(text));
    if (text) tidGrupp.setAttribute('aria-describedby', tidFel.id);
    else tidGrupp.removeAttribute('aria-describedby');
  }

  /** Ritar dagens tider. Den valda tiden står kvar om den finns den nya dagen. */
  function ritaTider() {
    const fore = valt('tid');
    const dag = dagar[Number(valt('dag') ?? 0)];
    tidRuta.innerHTML = '';
    for (const m of tider(dag.datum, dag.idag)) {
      const tid = tidText(m);
      tidRuta.insertAdjacentHTML('beforeend', `<label><input type="radio" name="tid" value="${tid}"${tid === fore ? ' checked' : ''}><span>${tid}</span></label>`);
    }
    if (fore && !valt('tid')) visaFel(`${fore} går inte att boka den dagen. Välj en annan tid.`);
  }

  form.addEventListener('change', (e) => {
    const namn = (e.target as HTMLInputElement).name;
    if (namn === 'tid') visaFel('');
    if (namn === 'dag') ritaTider();
    if (namn !== 'namn') svar.replaceChildren();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const tid = valt('tid');
    if (!tid) {
      visaFel('Välj en tid först.');
      tidGrupp.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      form.querySelector<HTMLInputElement>('input[name="tid"]')?.focus();
      return;
    }
    const dag = dagar[Number(valt('dag') ?? 0)].datum;
    const gaster = valt('gaster') ?? '2';
    const namn = (form.querySelector<HTMLInputElement>('input[name="namn"]')!.value || '').trim();
    const ruta = document.createElement('div');
    ruta.className = 'cn-bekraftelse-ruta';
    const b = document.createElement('b');
    b.textContent = `${namn ? `${namn}, b` : 'B'}ord för ${gaster} ${dagLang[dag.getDay()]} ${dag.getDate()} ${manad[dag.getMonth()]} kl.\u00a0${tid}. Vi ses under neonet.`;
    const p = document.createElement('p');
    p.textContent = 'Det här är en demo, så ingen bokning har skickats.';
    ruta.append(b, p);
    svar.replaceChildren(ruta);
    ruta.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  ritaTider();
  form.hidden = false;
}
