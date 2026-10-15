// HJERDAL Designer i webbläsaren: kundlistan, formuläret, förhandsvisningen
// och förslagen. Allt arbete görs av servern (designer/server.py) och fabriken.
import { h, hamta, satt, ritaFormular, allaFel, validera, vagNamn } from './formular.js';

const app = {
  schemafil: null,
  info: null,
  kund: null,
  data: null,
  andrad: null,
  bilder: [],
  stangda: new Set(),
  fel: [],
  osparat: false,
  sparning: null,
  timer: null,
  upptagen: false,
  panel: null, // { lage: 'visa' | 'forslag', url, varianter, enhet }
};
const rot = document.getElementById('app');
// replaceChildren skriver ut null och false som text, så de filtreras bort först.
const fyll = (el, ...barn) => el.replaceChildren(...barn.flat().filter((b) => b != null && b !== false));

/** Rullar formuläret, inte hela fönstret, till ett element. */
function rullaTill(el, block = 'start') {
  const yta = document.getElementById('yta');
  if (!el || !yta) return;
  const y = el.getBoundingClientRect().top - yta.getBoundingClientRect().top + yta.scrollTop;
  yta.scrollTo({ top: Math.max(0, block === 'center' ? y - yta.clientHeight / 3 : y - 8), behavior: 'smooth' });
}

// --- API ------------------------------------------------------------------------

async function api(metod, vag, kropp) {
  const fil = kropp instanceof Blob;
  const svar = await fetch(`/api/${vag}`, {
    method: metod,
    headers: { 'X-Hjerdal': '1', ...(kropp && !fil ? { 'Content-Type': 'application/json' } : {}) },
    body: fil ? kropp : kropp ? JSON.stringify(kropp) : undefined,
  });
  const data = await svar.json().catch(() => ({}));
  if (!svar.ok) throw Object.assign(new Error(data.fel ?? `Fel ${svar.status}`), { status: svar.status, falt: data.falt ?? [], logg: data.logg ?? '' });
  return data;
}

function meddela(text, typ = '') {
  const el = h('div', { class: `meddelande ${typ}`, role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.classList.add('borta'), typ === 'fel' ? 7000 : 3500);
  setTimeout(() => el.remove(), typ === 'fel' ? 7600 : 4100);
}

const datum = (s) => new Date(s * 1000).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// --- Start: kundlistan ------------------------------------------------------------

async function visaStart() {
  app.kund = null;
  document.title = 'HJERDAL Designer';
  const kunder = await api('GET', 'kunder');
  const tema = Object.fromEntries(app.schemafil.teman.map((t) => [t.id, t]));
  const stil = app.schemafil.namn.stil;
  const dialog = nyKundDialog();
  document.body.classList.remove('i-kund');
  fyll(rot, 
    h('header', { class: 'topp' }, h('a', { class: 'marke', href: '#/' }, 'HJERDAL', h('span', {}, 'Designer'))),
    h('main', { class: 'start' },
      h('p', { class: 'etikett-stor' }, 'Sajtfabriken'),
      h('h1', {}, 'Vilken restaurang gör vi i dag?'),
      h('p', { class: 'ingress' }, 'Fyll i det kunden berättar, välj en stil och visa förslag direkt. Sajten byggs av fabriken, utan kod och utan AI-kostnad.'),
      h('ul', { class: 'kundlista' },
        h('li', {}, h('button', { class: 'kundkort ny', onclick: () => dialog.showModal() }, h('span', { class: 'plus' }, '+'), h('span', { class: 'kund-namn' }, 'Ny kund'))),
        kunder.map((k) => {
          const t = tema[k.design?.tema] ?? tema.fjall;
          return h('li', {}, h('a', { class: 'kundkort', href: `#/kund/${k.kund}`, style: { background: t.bg, color: t.ink } },
            h('span', { class: 'kund-namn' }, k.namn),
            h('span', { class: 'kund-design' }, k.fel ?? `${stil[k.design.stil] ?? k.design.stil} · ${t.namn}`),
            h('span', { class: 'kund-andrad' }, `Ändrad ${datum(k.andrad)}`)));
        })),
      dialog),
    h('footer', { class: 'fot' },
      h('span', {}, `Kärnan ${app.info.karna}${app.info.gren ? ` · ${app.info.gren}` : ''}`),
      h('button', { class: 'lank', onclick: uppdatera }, 'Hämta senaste fabriken'),
      h('button', { class: 'lank', onclick: avsluta }, 'Avsluta Designer')));
}

function nyKundDialog() {
  const namn = h('input', { type: 'text', id: 'ny-namn', required: true, autocomplete: 'off', placeholder: 'Bistro Nordvik' });
  const mapp = h('p', { class: 'hjalp' }, 'Mappen får samma namn med små bokstäver.');
  const fel = h('p', { class: 'felrad', role: 'alert' });
  namn.addEventListener('input', () => {
    const slug = namn.value.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/&/g, ' och ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    mapp.textContent = slug ? `Sparas i kunder/${slug}/` : 'Mappen får samma namn med små bokstäver.';
  });
  const dialog = h('dialog', { class: 'dialog' },
    h('form', { method: 'dialog', onsubmit: async (e) => {
      e.preventDefault();
      try {
        const ny = await api('POST', 'kunder', { namn: namn.value });
        dialog.close();
        location.hash = `#/kund/${ny.kund}`;
      } catch (err) {
        fel.textContent = err.message;
      }
    } },
      h('h2', {}, 'Ny kund'),
      h('label', { class: 'etikett', for: 'ny-namn' }, 'Restaurangens namn'),
      namn, mapp, fel,
      h('div', { class: 'dialog-knappar' },
        h('button', { type: 'button', class: 'knapp', onclick: () => dialog.close() }, 'Avbryt'),
        h('button', { type: 'submit', class: 'knapp primar' }, 'Skapa'))));
  return dialog;
}

// --- Kunden: formuläret --------------------------------------------------------------

async function visaKund(kund) {
  const [svar, bilder] = await Promise.all([api('GET', `kunder/${kund}`), api('GET', `kunder/${kund}/bilder`)]);
  Object.assign(app, { kund, data: svar.data, andrad: svar.andrad, bilder, fel: [], osparat: false, panel: null, stangda: new Set() });
  document.title = `${svar.data.namn ?? kund} | HJERDAL Designer`;
  document.body.classList.add('i-kund');
  fyll(rot, 
    h('header', { class: 'topp' },
      h('a', { class: 'tillbaka', href: '#/', 'aria-label': 'Till kunderna' }, '←'),
      h('div', { class: 'titel' }, h('strong', { id: 'kundnamn' }, svar.data.namn ?? kund), h('span', { id: 'sparstatus', class: 'sparstatus' }, 'Sparat på datorn')),
      h('div', { class: 'knappar' },
        h('button', { class: 'knapp primar', id: 'k-visa', onclick: forhandsvisa }, 'Förhandsvisa'),
        h('button', { class: 'knapp', id: 'k-forslag', onclick: () => skapaForslag() }, 'Skapa förslag'),
        h('button', { class: 'knapp', id: 'k-spara', onclick: sparaGithub }, 'Spara till GitHub'))),
    h('div', { class: 'redigera', id: 'redigera' },
      h('nav', { class: 'sektionsnav', id: 'nav', 'aria-label': 'Delar av formuläret' }),
      h('main', { class: 'formular-yta', id: 'yta' }, h('div', { id: 'sammanfattning' }), h('form', { id: 'formular', onsubmit: (e) => e.preventDefault() })),
      h('aside', { class: 'panel', id: 'panel', hidden: true })));
  ritaOm();
}

const ctx = {
  get schemafil() { return app.schemafil; },
  get data() { return app.data; },
  get bilder() { return app.bilder; },
  get stangda() { return app.stangda; },
  bildUrl: (fil) => `/api/kunder/${app.kund}/bilder/${encodeURIComponent(fil)}`,
  andra(vag, varde) {
    satt(app.data, vag, varde);
    const el = document.querySelector(`[data-vag="${CSS.escape(vag.join('.'))}"]`);
    if (el?.classList.contains('har-fel')) {
      el.classList.remove('har-fel');
      el.querySelector(':scope > .felrad')?.replaceChildren();
      app.fel = app.fel.filter(([v]) => v !== vag.join('.'));
    }
    if (vag[0] === 'namn') document.getElementById('kundnamn').textContent = varde || app.kund;
    sparaSnart();
  },
  kolla(vag, s, kravd) {
    const text = validera(s, hamta(app.data, vag), kravd);
    const id = vag.join('.');
    app.fel = app.fel.filter(([v]) => v !== id);
    if (text) app.fel.push([id, text]);
    visaFel(false);
  },
  ritaOm: (fokus) => ritaOm(fokus),
  async laddaUpp(fil) {
    try {
      const svar = await api('POST', `kunder/${app.kund}/bilder?namn=${encodeURIComponent(fil.name)}`, fil);
      app.bilder = await api('GET', `kunder/${app.kund}/bilder`);
      meddela(`${svar.fil} är uppladdad`);
      return svar.fil;
    } catch (err) {
      meddela(err.message, 'fel');
      return undefined;
    }
  },
};

function ritaOm(fokus) {
  const yta = document.getElementById('yta');
  const form = document.getElementById('formular');
  if (!yta || !form) return;
  const scroll = yta.scrollTop;
  const sektioner = ritaFormular(ctx);
  form.replaceChildren(...sektioner.map((s) => s.el));
  document.getElementById('nav').replaceChildren(h('ul', {}, sektioner.map((s) =>
    h('li', {}, h('a', { href: `#${s.id}`, 'data-sektion': s.id, onclick: (e) => { e.preventDefault(); rullaTill(document.getElementById(s.id)); } },
      s.namn, h('span', { class: 'antal-fel', hidden: true }))))));
  yta.scrollTop = scroll;
  visaFel(false);
  bevakaSektioner(sektioner);
  if (fokus) document.querySelector(`[id="${fokus}"], [id^="${fokus}-"]`)?.focus();
}

/** Markerar den sektion i navigeringen som formuläret visar just nu. */
function bevakaSektioner(sektioner) {
  const yta = document.getElementById('yta');
  const markera = () => {
    const topp = yta.getBoundingClientRect().top + 120;
    const aktiv = sektioner.filter((s) => s.el.getBoundingClientRect().top <= topp).at(-1) ?? sektioner[0];
    document.querySelectorAll('.sektionsnav a').forEach((a) => a.classList.toggle('aktiv', a.dataset.sektion === aktiv?.id));
  };
  yta.onscroll = markera;
  markera();
}

/** Visar app.fel vid fälten, i navigeringen och, om sammanfatta, överst i formuläret. */
function visaFel(sammanfatta = true) {
  document.querySelectorAll('.har-fel').forEach((e) => e.classList.remove('har-fel'));
  document.querySelectorAll('.felrad').forEach((e) => e.replaceChildren());
  const perSektion = new Map();
  const poster = app.fel.map(([vag, text]) => {
    let el = null;
    let v = vag;
    while (v && !(el = document.querySelector(`[data-vag="${CSS.escape(v)}"]`))) v = v.includes('.') ? v.slice(0, v.lastIndexOf('.')) : '';
    if (el) {
      const falt = el.querySelector(':scope > .felrad') ? el : el.parentElement.closest('[data-vag]') ?? el;
      falt.classList.add('har-fel');
      const rad = falt.querySelector(':scope > .felrad');
      if (rad) rad.textContent = rad.textContent ? `${rad.textContent}. ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
      for (let d = el.closest('details'); d; d = d.parentElement.closest('details')) d.open = true;
      const sektion = el.closest('.sektion')?.id;
      if (sektion) perSektion.set(sektion, (perSektion.get(sektion) ?? 0) + 1);
    }
    return { vag, text, el };
  });
  document.querySelectorAll('.sektionsnav a').forEach((a) => {
    const n = perSektion.get(a.dataset.sektion) ?? 0;
    const bricka = a.querySelector('.antal-fel');
    bricka.hidden = !n;
    bricka.textContent = n;
  });
  const ruta = document.getElementById('sammanfattning');
  if (!ruta) return;
  if (!poster.length) return ruta.replaceChildren();
  if (!sammanfatta && !ruta.childElementCount) return;
  ruta.replaceChildren(h('div', { class: 'felruta', role: 'alert' },
    h('h2', {}, poster.length === 1 ? 'En sak att rätta innan sajten kan byggas' : `${poster.length} saker att rätta innan sajten kan byggas`),
    h('ul', {}, poster.map((p) => h('li', {}, h('button', { type: 'button', class: 'lank', onclick: () => {
      rullaTill(p.el, 'center');
      p.el?.querySelector('input, textarea, button')?.focus({ preventScroll: true });
    } }, vagNamn(app.schemafil.schema, p.vag)), `: ${p.text}`)))));
  if (sammanfatta) document.getElementById('yta').scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Spara på datorn ------------------------------------------------------------------

function status(text, typ = '') {
  const el = document.getElementById('sparstatus');
  if (el) { el.textContent = text; el.dataset.typ = typ; }
}

function sparaSnart() {
  app.osparat = true;
  status('Sparar…');
  clearTimeout(app.timer);
  app.timer = setTimeout(sparaNu, 600);
}

async function sparaNu() {
  clearTimeout(app.timer);
  if (app.sparning) await app.sparning;
  if (!app.osparat || !app.kund) return;
  app.osparat = false;
  app.sparning = api('PUT', `kunder/${app.kund}`, { data: app.data, andrad: app.andrad })
    .then((svar) => { app.andrad = svar.andrad; status('Sparat på datorn'); })
    .catch(async (err) => {
      if (err.status === 409) {
        meddela('Kundfilen ändrades utanför Designer, till exempel av Claude. Formuläret visar nu den nya versionen.');
        await laddaOm();
      } else {
        app.osparat = true;
        status('Kunde inte spara', 'fel');
        meddela(err.message, 'fel');
      }
    })
    .finally(() => { app.sparning = null; });
  await app.sparning;
}

async function laddaOm() {
  const [svar, bilder] = await Promise.all([api('GET', `kunder/${app.kund}`), api('GET', `kunder/${app.kund}/bilder`)]);
  Object.assign(app, { data: svar.data, andrad: svar.andrad, bilder, osparat: false });
  document.getElementById('kundnamn').textContent = svar.data.namn ?? app.kund;
  status('Sparat på datorn');
  ritaOm();
}

// Pulsen håller servern vid liv och märker när någon annan, till exempel Claude, ändrar kundfilen.
setInterval(async () => {
  try {
    const svar = await api('GET', `puls${app.kund ? `?kund=${app.kund}` : ''}`);
    if (app.kund && svar.andrad && Math.abs(svar.andrad - app.andrad) > 0.001 && !app.osparat && !app.sparning && !app.upptagen) {
      await laddaOm();
      meddela('Kundfilen ändrades utanför Designer. Formuläret visar den nya versionen.');
    }
  } catch { /* servern startar om eller är avslutad */ }
}, 4000);

addEventListener('beforeunload', (e) => { if (app.osparat) e.preventDefault(); });

// --- Förhandsvisning och förslag -----------------------------------------------------

async function kontrollera() {
  await sparaNu();
  app.fel = allaFel(app.schemafil.schema, app.data);
  visaFel(true);
  if (app.fel.length) meddela('Rätta fälten som är markerade först.', 'fel');
  return !app.fel.length;
}

async function arbeta(knappId, text, jobb) {
  if (app.upptagen) return;
  app.upptagen = true;
  const knappar = document.querySelectorAll('.topp .knapp');
  knappar.forEach((k) => (k.disabled = true));
  const knapp = document.getElementById(knappId);
  const forra = knapp.textContent;
  const start = Date.now();
  const rakna = setInterval(() => (knapp.textContent = `${text} ${Math.round((Date.now() - start) / 1000)} s`), 500);
  knapp.textContent = text;
  knapp.classList.add('arbetar');
  try {
    return await jobb();
  } finally {
    clearInterval(rakna);
    knapp.textContent = forra;
    knapp.classList.remove('arbetar');
    knappar.forEach((k) => (k.disabled = false));
    app.upptagen = false;
  }
}

async function forhandsvisa() {
  if (!(await kontrollera())) return;
  await arbeta('k-visa', 'Bygger', async () => {
    try {
      const svar = await api('POST', `kunder/${app.kund}/bygg`);
      app.fel = [];
      visaFel(true);
      visaPanel({ lage: 'visa', url: svar.url, enhet: app.panel?.enhet ?? 'mobil', varn: svar.varn, granskning: svar.fel, logg: svar.logg });
      if (svar.fel.length) meddela(`Sajten är byggd men kontrollen hittade ${svar.fel.length} fel. Se under förhandsvisningen.`, 'fel');
    } catch (err) {
      byggfel(err);
    }
  });
}

async function skapaForslag(varianter) {
  if (!(await kontrollera())) return;
  await arbeta('k-forslag', 'Skapar förslag', async () => {
    try {
      const svar = await api('POST', `kunder/${app.kund}/forslag`, { varianter: varianter ?? [] });
      visaPanel({ lage: 'forslag', url: svar.url, varianter: svar.varianter, enhet: 'dator', logg: svar.logg });
    } catch (err) {
      byggfel(err);
    }
  });
}

function byggfel(err) {
  if (err.falt?.length) {
    app.fel = err.falt;
    visaFel(true);
    meddela('Bygget stoppade på fälten som är markerade.', 'fel');
  } else {
    visaPanel({ lage: 'fel', text: err.message, logg: err.logg });
  }
}

function visaPanel(p) {
  app.panel = p;
  const panel = document.getElementById('panel');
  document.getElementById('redigera').classList.add('med-panel');
  panel.hidden = false;
  const stang = h('button', { class: 'ikonknapp', 'aria-label': 'Stäng', onclick: () => { panel.hidden = true; document.getElementById('redigera').classList.remove('med-panel'); } }, '×');
  if (p.lage === 'fel') {
    fyll(panel, h('div', { class: 'panel-topp' }, h('strong', {}, 'Bygget stoppade'), stang),
      h('div', { class: 'panel-fel' }, h('p', {}, p.text), p.logg && h('details', {}, h('summary', {}, 'Visa vad fabriken skrev'), h('pre', {}, p.logg))));
    return;
  }
  const ram = h('iframe', { title: p.lage === 'visa' ? 'Förhandsvisning' : 'Förslag', src: `${p.url}?v=${Date.now()}` });
  const enhet = (e) => { p.enhet = e; ruta.dataset.enhet = e; panel.querySelectorAll('[data-enhet]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.enhet === e))); };
  const ruta = h('div', { class: 'enhet', 'data-enhet': p.enhet }, ram);
  fyll(panel,
    h('div', { class: 'panel-topp' },
      h('strong', {}, p.lage === 'visa' ? 'Förhandsvisning' : 'Förslag'),
      h('div', { class: 'segment litet', role: 'radiogroup' },
        h('button', { type: 'button', role: 'radio', 'data-enhet': 'mobil', 'aria-checked': String(p.enhet === 'mobil'), onclick: () => enhet('mobil') }, 'Mobil'),
        h('button', { type: 'button', role: 'radio', 'data-enhet': 'dator', 'aria-checked': String(p.enhet === 'dator'), onclick: () => enhet('dator') }, 'Dator')),
      h('a', { class: 'lank', href: p.url, target: '_blank', rel: 'noopener' }, 'Öppna i ny flik'),
      stang),
    p.lage === 'forslag' && h('div', { class: 'varianter' }, p.varianter.map((v) => {
      const namn = app.schemafil.namn;
      return h('div', { class: 'variant' },
        h('button', { type: 'button', class: 'lank', onclick: () => (ram.src = `${p.url}${v.mapp}/`) }, `${namn.stil[v.stil]} · ${namn.tema[v.tema]}`),
        h('button', { type: 'button', class: 'knapp litet', onclick: () => valjVariant(v) }, 'Välj'));
    })),
    ruta,
    (p.varn?.length || p.granskning?.length) ? h('details', { class: 'granskning' }, h('summary', {}, [
      p.granskning?.length ? `${p.granskning.length} fel` : '', p.granskning?.length && p.varn?.length ? ' och ' : '', p.varn?.length ? `${p.varn.length} varningar` : '', ' från kontrollen']),
    h('ul', {}, [...(p.granskning ?? []).map((t) => h('li', { class: 'fel' }, t)), ...(p.varn ?? []).map((t) => h('li', {}, t))])) : null);
}

function valjVariant(v) {
  for (const k of ['stil', 'tema', 'hero', 'meny']) satt(app.data, ['design', k], v[k]);
  sparaSnart();
  ritaOm();
  rullaTill(document.getElementById('s-design'));
  meddela(`${app.schemafil.namn.stil[v.stil]} med ${app.schemafil.namn.tema[v.tema]} är vald. Tryck Förhandsvisa för att se hela sajten.`);
}

// --- GitHub och fabriken --------------------------------------------------------------

async function sparaGithub() {
  await sparaNu();
  await arbeta('k-spara', 'Sparar', async () => {
    try {
      const svar = await api('POST', `kunder/${app.kund}/spara`);
      meddela(svar.meddelande);
    } catch (err) {
      visaPanel({ lage: 'fel', text: err.message, logg: err.logg });
    }
  });
}

async function uppdatera() {
  try {
    const svar = await api('POST', 'uppdatera');
    meddela(svar.meddelande);
    if (!svar.andrat) return;
    document.body.classList.remove('i-kund');
    fyll(rot, h('main', { class: 'start' }, h('h1', {}, 'Startar om med den nya fabriken…')));
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try { await api('GET', 'info'); location.reload(); return; } catch { /* inte uppe än */ }
    }
  } catch (err) {
    meddela(err.message, 'fel');
  }
}

async function avsluta() {
  await api('POST', 'avsluta').catch(() => {});
  document.body.classList.remove('i-kund');
  fyll(rot, h('main', { class: 'start' }, h('p', { class: 'etikett-stor' }, 'HJERDAL Designer'), h('h1', {}, 'Avslutad.'), h('p', { class: 'ingress' }, 'Du kan stänga fönstret. Öppna Designer igen från Dock.')));
}

// --- Start -------------------------------------------------------------------------------

async function route() {
  await sparaNu();
  const m = location.hash.match(/^#\/kund\/([a-z0-9-]+)/);
  try {
    if (m) await visaKund(m[1]);
    else await visaStart();
  } catch (err) {
    meddela(err.message, 'fel');
    if (m) location.hash = '#/';
  }
}

(async () => {
  [app.schemafil, app.info] = await Promise.all([api('GET', 'schema'), api('GET', 'info')]);
  addEventListener('hashchange', route);
  route();
})();
