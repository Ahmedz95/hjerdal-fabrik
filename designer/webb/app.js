// HJERDAL Designer i webbläsaren: kunderna, formuläret, chatten med Claude,
// förhandsvisningen och förslagen. Allt arbete görs av servern
// (designer/server.py) och fabriken.
import { h, hamta, satt, ritaFormular, allaFel, validera, vagNamn } from './formular.js';
import { ikon } from './ikoner.js';
import { skapaChatt } from './chatt.js';

const app = {
  schemafil: null,
  info: null,
  kund: null,
  data: null,
  andrad: null,
  bilder: [],
  stangda: new Set(),
  fel: [], // [väg, text] som visas vid fälten just nu
  fran: new Map(), // väg -> 'klient' eller 'bygg', var felet kom ifrån
  sektioner: [],
  osparat: false,
  sparning: null,
  timer: null,
  upptagen: false,
  visning: null, // förhandsvisningen eller förslagen i helskärm
  start: null, // kunderna på startsidan och hur de ritas om
  arkiv: null, // när den öppna kunden arkiverades och tas bort, om den är arkiverad
};
const rot = document.getElementById('app');
// replaceChildren skriver ut null och false som text, så de filtreras bort först.
const fyll = (el, ...barn) => el.replaceChildren(...barn.flat().filter((b) => b != null && b !== false));
const knapp = (namn, text, attr = {}) => h('button', { type: 'button', class: 'knapp', ...attr }, ikon(namn, 17), h('span', {}, text));

/** Rullar formuläret, inte hela fönstret, till ett element. */
function rullaTill(el, block = 'start') {
  const yta = document.getElementById('yta');
  if (!el || !yta) return;
  const y = el.getBoundingClientRect().top - yta.getBoundingClientRect().top + yta.scrollTop;
  yta.scrollTo({ top: Math.max(0, block === 'center' ? y - yta.clientHeight / 3 : y - 16), behavior: 'smooth' });
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
  const el = h('div', { class: `meddelande ${typ}`, role: 'status' }, typ === 'fel' ? null : ikon('bock', 16), text);
  document.body.append(el);
  setTimeout(() => el.classList.add('borta'), typ === 'fel' ? 7000 : 3500);
  setTimeout(() => el.remove(), typ === 'fel' ? 7600 : 4100);
}

const datum = (s) => new Date(s * 1000).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
// "2026-11-14" eller "2026-10-15T13:10:00" blir "14 november".
const dag = (iso) => new Date(iso.length === 10 ? `${iso}T12:00` : iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
const storlek = (b) => (b >= 1e6 ? `${(b / 1048576).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);

// --- Chatten ----------------------------------------------------------------------

const chatt = skapaChatt({
  api,
  meddela,
  kund: () => app.kund,
  nyttData: () => { if (!app.osparat && !app.sparning) laddaOm(true); },
  visaBygge: (url) => visa({ lage: 'visa', url, enhet: 'mobil' }),
  // "Meny › Sektion 1 › Rätt 2 › Pris", eller kort bara "Rätt 2 › Pris".
  faltNamn: (vag, kort) => {
    const namn = vagNamn(app.schemafil.schema, vag);
    return kort ? namn.split(' › ').slice(-2).join(' › ') : namn;
  },
  visaFalt,
  async angra(id) {
    await sparaNu();
    await api('POST', `kunder/${app.kund}/claude/angra`, { id });
    await laddaOm(true);
  },
});
document.addEventListener('hjerdal-visa', (e) => {
  const m = e.detail.match(/^\/(visa|forslag)\/([a-z0-9-]+)\//);
  if (m) visa({ lage: m[1], url: e.detail, enhet: m[1] === 'visa' ? 'mobil' : 'dator', varianter: app.visning?.varianter ?? [] });
});

// --- Sidhuvudet ----------------------------------------------------------------------

function sidhuvud(kund) {
  const meny = h('div', { class: 'meny', hidden: true, role: 'menu' },
    kund && h('button', { type: 'button', role: 'menuitem', onclick: sparaGithub }, ikon('moln'), 'Spara till GitHub'),
    kund && h('button', { type: 'button', role: 'menuitem', onclick: () => exportera(kund, app.data?.namn || kund) }, ikon('export'), 'Exportera för kunden'),
    kund && (app.arkiv
      ? h('button', { type: 'button', role: 'menuitem', onclick: () => aterstallKund({ kund, namn: app.data?.namn || kund }) }, ikon('angra'), 'Ta tillbaka från arkivet')
      : h('button', { type: 'button', role: 'menuitem', onclick: () => arkiveraKund({ kund, namn: app.data?.namn || kund }) }, ikon('arkiv'), 'Arkivera kunden')),
    kund && h('hr'),
    h('button', { type: 'button', role: 'menuitem', onclick: uppdatera }, ikon('hamta'), 'Hämta senaste fabriken'),
    h('button', { type: 'button', role: 'menuitem', onclick: visaHjalp }, ikon('hjalp'), 'Så använder du Designer'),
    h('hr'),
    h('button', { type: 'button', role: 'menuitem', onclick: avsluta }, ikon('avsluta'), 'Avsluta Designer'));
  const merKnapp = h('button', { type: 'button', class: 'ikonknapp stor', 'aria-label': 'Mer', 'aria-haspopup': 'menu', onclick: (e) => {
    e.stopPropagation();
    meny.hidden = !meny.hidden;
  } }, ikon('mer', 20));
  return h('header', { class: 'topp' },
    h('a', { class: 'marke', href: '#/', 'aria-label': 'HJERDAL Designer, till kunderna' }, h('img', { src: '/ikon.png', alt: '' }), h('span', {}, 'Designer')),
    kund
      ? h('nav', { class: 'brodsmulor', 'aria-label': 'Var du är' },
        h('a', { href: '#/' }, 'Kunder'), h('span', { class: 'snedstreck' }, '/'),
        h('strong', { id: 'kundnamn' }, app.data?.namn || kund),
        h('span', { id: 'sparstatus', class: 'sparstatus' }, 'Sparat'))
      : h('span', { class: 'brodsmulor' }),
    h('div', { class: 'knappar' },
      kund && knapp('forslag', 'Förslag', { id: 'k-forslag', title: 'Bygg kunden i fyra stilar att visa', onclick: () => skapaForslag() }),
      kund && knapp('visa', 'Förhandsvisa', { id: 'k-visa', class: 'knapp primar', onclick: forhandsvisa }),
      kund && h('button', { type: 'button', class: 'knapp claude-knapp', id: 'k-claude', 'aria-pressed': String(chatt.oppen), onclick: () => {
        chatt.vaxla();
        document.getElementById('k-claude').setAttribute('aria-pressed', String(chatt.oppen));
      } }, ikon('claude', 18), h('span', {}, 'Claude')),
      h('div', { class: 'mer' }, merKnapp, meny)));
}

document.addEventListener('click', () => document.querySelectorAll('.meny').forEach((m) => (m.hidden = true)));

// --- Start: kunderna -------------------------------------------------------------------

async function visaStart() {
  app.kund = null;
  app.arkiv = null;
  document.title = 'HJERDAL Designer';
  document.body.className = '';
  chatt.laddaKund();
  const kunder = await api('GET', 'kunder');
  const tema = Object.fromEntries(app.schemafil.teman.map((t) => [t.id, t]));
  const stil = app.schemafil.namn.stil;
  const dialog = nyKundDialog();
  const lista = h('ul', { class: 'kundlista' });
  const sok = h('input', { type: 'search', placeholder: 'Sök kund', 'aria-label': 'Sök kund', autocomplete: 'off' });
  const antal = h('span', {});
  const arkivRubrik = h('summary', {});
  const arkivLista = h('ul', { class: 'arkivlista' });
  const arkiv = h('details', { class: 'arkiv', id: 'arkiv' }, arkivRubrik, arkivLista);
  const ritaLista = () => {
    const q = sok.value.trim().toLowerCase();
    const traff = (k) => !q || `${k.namn} ${k.kund}`.toLowerCase().includes(q);
    const aktiva = app.start.kunder.filter((k) => !k.arkiv);
    const arkiverade = app.start.kunder.filter((k) => k.arkiv);
    const urval = aktiva.filter(traff).sort((a, b) => b.andrad - a.andrad);
    const arkivUrval = arkiverade.filter(traff).sort((a, b) => a.arkiv.tas_bort.localeCompare(b.arkiv.tas_bort));
    antal.textContent = aktiva.length;
    fyll(lista,
      !q && h('li', {}, h('button', { class: 'kundkort ny', onclick: () => dialog.showModal() },
        h('span', { class: 'plus' }, ikon('plus', 28)), h('span', { class: 'kund-namn' }, 'Ny kund'), h('span', { class: 'kund-design' }, 'Börja med ett namn'))),
      urval.map((k) => kundkort(k, tema[k.design?.tema] ?? tema.fjall, stil)),
      q && !urval.length && h('li', { class: 'inga' }, arkivUrval.length ? `Ingen aktiv kund heter något med ”${sok.value}”, men det finns i arkivet.` : `Ingen kund heter något med ”${sok.value}”.`));
    arkiv.hidden = !arkiverade.length;
    if (q && arkivUrval.length) arkiv.open = true;
    fyll(arkivRubrik, ikon('arkiv', 18), h('strong', {}, 'Arkiv'), h('span', { class: 'arkiv-antal' }, arkiverade.length),
      h('span', { class: 'arkiv-hjalp' }, 'Tas bort ur fabriken 30 dagar efter att de arkiverades'));
    fyll(arkivLista, arkivUrval.map(arkivrad));
    skalaMiniatyrer(lista);
  };
  app.start = { kunder, ritaLista, laddaOm: async () => { app.start.kunder = await api('GET', 'kunder'); ritaLista(); } };
  sok.addEventListener('input', ritaLista);
  ritaLista();
  fyll(rot,
    sidhuvud(null),
    h('main', { class: 'start' },
      h('section', { class: 'start-hjalte' },
        h('p', { class: 'etikett-stor' }, 'Sajtfabriken'),
        h('h1', {}, 'Vilken restaurang gör vi i dag?'),
        h('p', { class: 'ingress' }, 'Fyll i det kunden berättar, eller låt Claude göra det. Välj en stil och visa förslag direkt. Sajten byggs av fabriken på några sekunder.'),
        h('div', { class: 'start-knappar' },
          h('button', { type: 'button', class: 'knapp primar stor', onclick: () => dialog.showModal() }, ikon('plus', 18), 'Ny kund'),
          h('button', { type: 'button', class: 'knapp stor', onclick: visaHjalp }, ikon('hjalp', 18), 'Så funkar det'))),
      h('section', { class: 'start-kunder' },
        h('div', { class: 'start-rubrik' }, h('h2', {}, 'Kunder', antal), kunder.length > 6 && h('label', { class: 'sok' }, ikon('sok', 17), sok)),
        lista,
        arkiv),
      dialog),
    h('footer', { class: 'fot' },
      h('span', {}, `Kärnan ${app.info.karna}${app.info.gren ? ` · ${app.info.gren}` : ''}`),
      h('button', { class: 'lank', onclick: uppdatera }, 'Hämta senaste fabriken'),
      h('button', { class: 'lank', onclick: avsluta }, 'Avsluta Designer')));
}

const STATUS = {
  utkast: (k) => (k.kvar ? `Utkast · ${k.kvar} kvar` : 'Utkast'),
  klar: () => 'Klar att spara',
  sparad: () => 'Sparad i GitHub',
  publicerad: () => 'Publicerad',
};
const STATUSHJALP = {
  utkast: 'Fält kvar att fylla i innan sajten kan byggas',
  klar: 'Allt är ifyllt. Spara till GitHub när kunden har sagt ja.',
  sparad: 'Sparad i GitHub men inte publicerad från den här datorn',
  publicerad: 'Publicerad med fabrik.py publicera och inte ändrad sedan dess',
};

/** Kunden på startsidan: den senaste förhandsvisningen i liten skala, eller temat om sajten inte är byggd. */
function kundkort(k, t, stil) {
  const bild = h('span', { class: 'kund-bild', style: { background: t.bg, color: t.ink, '--accent': t.accent } },
    k.forhandsvisning
      ? h('iframe', { src: `${k.forhandsvisning}?v=${Math.round(k.byggd)}`, title: '', tabindex: '-1', 'aria-hidden': 'true', loading: 'lazy', sandbox: 'allow-same-origin' })
      : h('span', { class: 'kund-tema' }, h('span', { class: 'kund-prick' }), h('b', {}, 'Aa'), h('small', {}, 'Inte förhandsvisad än')),
    k.arbetar && h('span', { class: 'kund-claude' }, ikon('claude', 14), 'Claude arbetar…'));
  const meny = h('div', { class: 'meny', hidden: true, role: 'menu' },
    h('button', { type: 'button', role: 'menuitem', onclick: () => exportera(k.kund, k.namn) }, ikon('export'), 'Exportera för kunden'),
    h('button', { type: 'button', role: 'menuitem', onclick: () => arkiveraKund(k) }, ikon('arkiv'), 'Arkivera'));
  const mer = h('button', { type: 'button', class: 'ikonknapp kort-mer', 'aria-label': `Mer för ${k.namn}`, 'aria-haspopup': 'menu', onclick: (e) => {
    e.stopPropagation();
    const dold = meny.hidden;
    document.querySelectorAll('.meny').forEach((m) => (m.hidden = true));
    meny.hidden = !dold;
  } }, ikon('mer', 18));
  return h('li', { class: 'kund-plats' }, h('a', { class: 'kundkort', href: `#/kund/${k.kund}` },
    bild,
    h('span', { class: 'kund-info' },
      h('span', { class: 'kund-namn' }, k.namn),
      k.status && h('span', { class: 'kund-status', 'data-status': k.status, title: STATUSHJALP[k.status] }, STATUS[k.status](k)),
      h('span', { class: 'kund-design' }, k.fel ?? `${stil[k.design.stil] ?? k.design.stil} · ${t.namn}`),
      h('span', { class: 'kund-andrad' }, `Ändrad ${datum(k.andrad)}`))),
  h('div', { class: 'mer kort-meny' }, mer, meny));
}

/** En arkiverad kund: när den tas bort, och knappar för att exportera eller ta tillbaka den. */
function arkivrad(k) {
  const kvar = k.arkiv.dagar_kvar;
  return h('li', { class: 'arkivrad' },
    h('a', { class: 'arkiv-namn', href: `#/kund/${k.kund}` }, k.namn),
    h('span', { class: 'arkiv-nar' }, `Arkiverad ${dag(k.arkiv.arkiverad)}${k.arkiv.av ? ` av ${k.arkiv.av}` : ''}`),
    h('span', { class: 'arkiv-bort', 'data-snart': String(kvar <= 3) }, kvar ? `Tas bort ${dag(k.arkiv.tas_bort)}, om ${kvar} ${kvar === 1 ? 'dag' : 'dagar'}` : 'Tas bort nu'),
    h('span', { class: 'arkiv-knappar' },
      h('button', { type: 'button', class: 'knapp litet', onclick: () => exportera(k.kund, k.namn) }, ikon('export', 15), 'Exportera'),
      h('button', { type: 'button', class: 'knapp litet', onclick: () => aterstallKund(k) }, ikon('angra', 15), 'Ta tillbaka')));
}

// --- Arkivet och exporten ---------------------------------------------------------------

/** Kundens underlag som en HTML-fil i Hämtade filer, att skicka till kunden. */
async function exportera(kund, namn) {
  if (app.kund === kund) await sparaNu();
  try {
    const svar = await fetch(`/api/kunder/${kund}/export`);
    if (!svar.ok) throw new Error((await svar.json().catch(() => ({}))).fel ?? `Fel ${svar.status}`);
    const fil = `${kund}-underlag.html`;
    const url = URL.createObjectURL(await svar.blob());
    const a = h('a', { href: url, download: fil });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    meddela(`${fil} ligger i Hämtade filer. Skicka den till ${namn}, den öppnas i webbläsaren.`);
  } catch (err) {
    meddela(err.message, 'fel');
  }
}

function arkiveraKund(k) {
  const fel = h('p', { class: 'felrad', role: 'alert' });
  const ja = h('button', { type: 'button', class: 'knapp primar', onclick: async () => {
    ja.disabled = true;
    ja.lastChild.textContent = 'Arkiverar…';
    try {
      if (app.kund === k.kund) await sparaNu();
      const svar = await api('POST', `kunder/${k.kund}/arkivera`);
      dialog.close();
      meddela(svar.meddelande);
      if (app.kund) location.hash = '#/';
      else await app.start.laddaOm();
    } catch (err) {
      fel.textContent = err.message;
      ja.disabled = false;
      ja.lastChild.textContent = 'Arkivera';
    }
  } }, ikon('arkiv', 17), h('span', {}, 'Arkivera'));
  const dialog = h('dialog', { class: 'dialog' },
    h('h2', {}, `Arkivera ${k.namn}?`),
    h('p', {}, 'Kunden försvinner från startsidan och läggs i Arkiv längst ner. Efter 30 dagar tas den bort ur fabriken. Fram till dess kan du ta tillbaka den.'),
    h('p', { class: 'hjalp' }, 'Ska kunden få allt som står om restaurangen? Exportera först. Filen öppnas i webbläsaren och går att mejla.'),
    fel,
    h('div', { class: 'dialog-knappar' },
      h('button', { type: 'button', class: 'knapp vanster', onclick: () => exportera(k.kund, k.namn) }, ikon('export', 17), h('span', {}, 'Exportera först')),
      h('button', { type: 'button', class: 'knapp', onclick: () => dialog.close() }, 'Avbryt'),
      ja));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

async function aterstallKund(k) {
  try {
    const svar = await api('POST', `kunder/${k.kund}/aterstall`);
    meddela(svar.meddelande);
    if (app.kund === k.kund) {
      app.arkiv = null;
      ritaArkivruta();
      document.querySelector('.topp').replaceWith(sidhuvud(app.kund));
    } else if (app.start) {
      await app.start.laddaOm();
    }
  } catch (err) {
    meddela(err.message, 'fel');
  }
}

/** Överst i en arkiverad kund: när den tas bort och en knapp för att ta tillbaka den. */
function ritaArkivruta() {
  const ruta = document.getElementById('arkivruta');
  if (!ruta) return;
  fyll(ruta, app.arkiv && h('div', { class: 'arkivruta', role: 'status' }, ikon('arkiv', 18),
    h('span', {}, `Kunden är arkiverad och tas bort ur fabriken ${dag(app.arkiv.tas_bort)}.`),
    h('button', { type: 'button', class: 'knapp litet', onclick: () => aterstallKund({ kund: app.kund, namn: app.data?.namn || app.kund }) }, ikon('angra', 15), 'Ta tillbaka')));
}

/** Sajterna på startsidan ritas i datorbredd och skalas ner till kortet. */
function skalaMiniatyrer(lista) {
  skalaMiniatyrer.obs?.disconnect();
  skalaMiniatyrer.obs = new ResizeObserver((poster) => {
    for (const p of poster) p.target.style.setProperty('--s', (p.contentRect.width / 1280).toFixed(4));
  });
  lista.querySelectorAll('.kund-bild').forEach((el) => skalaMiniatyrer.obs.observe(el));
}

function nyKundDialog() {
  const namn = h('input', { type: 'text', id: 'ny-namn', required: true, autocomplete: 'off', placeholder: 'Bistro Nordvik' });
  const mapp = h('p', { class: 'hjalp' }, 'Mappen får samma namn med små bokstäver.');
  const om = h('textarea', { id: 'ny-om', rows: 4, placeholder: 'Till exempel: Familjeägd pizzeria på Möllan, öppet alla dagar 11–22. Webbplats: https://…' });
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
        const text = om.value.trim();
        dialog.close();
        location.hash = `#/kund/${ny.kund}`;
        if (text) {
          // När kunden är öppnad tar Claude över och fyller i det säljaren skrev.
          addEventListener('hjerdal-kund-oppnad', () => chatt.skicka(`Det här vet jag om restaurangen:\n\n${text}\n\nFyll i allt du kan i kundfilen. Hitta inte på något som inte står här eller på deras webbplats.`), { once: true });
        }
      } catch (err) {
        fel.textContent = err.message;
      }
    } },
      h('h2', {}, 'Ny kund'),
      h('label', { class: 'etikett', for: 'ny-namn' }, 'Restaurangens namn'),
      namn, mapp,
      h('label', { class: 'etikett', for: 'ny-om' }, ikon('claude', 14), 'Vad vet du om restaurangen?', h('span', { class: 'valfri' }, 'valfritt')),
      om,
      h('p', { class: 'hjalp' }, 'Skriver du något här fyller Claude i formuläret åt dig när kunden öppnas.'),
      fel,
      h('div', { class: 'dialog-knappar' },
        h('button', { type: 'button', class: 'knapp', onclick: () => dialog.close() }, 'Avbryt'),
        h('button', { type: 'submit', class: 'knapp primar' }, 'Skapa kunden'))));
  return dialog;
}

// --- Kunden: formuläret ------------------------------------------------------------------

async function visaKund(kund) {
  const [svar, bilder] = await Promise.all([api('GET', `kunder/${kund}`), api('GET', `kunder/${kund}/bilder`)]);
  Object.assign(app, { kund, data: svar.data, andrad: svar.andrad, arkiv: svar.arkiv, bilder, fel: [], fran: new Map(), osparat: false, stangda: new Set() });
  document.title = `${svar.data.namn ?? kund} | HJERDAL Designer`;
  document.body.className = 'i-kund';
  let chattOppen = true;
  try { chattOppen = localStorage.getItem('hjerdal-chatt') !== '0'; } catch { /* privat läge */ }
  if (chattOppen && innerWidth > 1100) chatt.oppna(); else chatt.stang();
  fyll(rot,
    sidhuvud(kund),
    h('div', { class: 'redigera', id: 'redigera' },
      h('nav', { class: 'stegnav', id: 'nav', 'aria-label': 'Delar av formuläret' }),
      h('main', { class: 'formular-yta', id: 'yta' },
        h('div', { class: 'formular-bredd' }, h('div', { id: 'arkivruta' }), h('div', { id: 'sammanfattning' }), h('form', { id: 'formular', onsubmit: (e) => e.preventDefault() }))),
      chatt.el));
  ritaArkivruta();
  ritaOm();
  await chatt.laddaKund();
  dispatchEvent(new Event('hjerdal-kund-oppnad'));
}

const ctx = {
  get schemafil() { return app.schemafil; },
  get data() { return app.data; },
  get bilder() { return app.bilder; },
  get stangda() { return app.stangda; },
  bildUrl: (fil) => `/api/kunder/${app.kund}/bilder/${encodeURIComponent(fil)}`,
  andra(vag, varde) {
    satt(app.data, vag, varde);
    if (vag[0] === 'namn') document.getElementById('kundnamn').textContent = varde || app.kund;
    omprova(vag);
    sparaSnart();
  },
  kolla(vag, s, kravd) {
    const text = validera(s, hamta(app.data, vag), kravd);
    const id = vag.join('.');
    app.fel = app.fel.filter(([v]) => v !== id);
    if (text) { app.fel.push([id, text]); app.fran.set(id, 'klient'); }
    visaFel(false);
  },
  ritaOm: (fokus) => ritaOm(fokus),
  laddaUpp: (fil, typer) => laddaUppBild(fil, typer),
};

/**
 * Laddar upp en bild till kundens bilder. Servern gör den lagom stor, vrider den rätt och
 * tar bort metadata som platsen där den togs. typer är formaten bildfältet tar emot.
 */
async function laddaUppBild(fil, typer, tyst = false) {
  try {
    const format = typer?.filter((t) => t !== 'svg').join(',');
    const svar = await api('POST', `kunder/${app.kund}/bilder?namn=${encodeURIComponent(fil.name || 'bild.jpg')}${format ? `&typer=${format}` : ''}`, fil);
    app.bilder = await api('GET', `kunder/${app.kund}/bilder`);
    if (!tyst) meddela(svar.fore > svar.storlek * 1.2 ? `${svar.fil} är uppladdad, ${storlek(svar.fore)} blev ${storlek(svar.storlek)}` : `${svar.fil} är uppladdad`);
    return svar;
  } catch (err) {
    meddela(`${fil.name}: ${err.message}`, 'fel');
    return undefined;
  }
}

// En bild som släpps utanför en bildväljare hamnar bland kundens bilder, i stället för att
// webbläsaren lämnar Designer och visar bilden.
const BILD = /\.(jpe?g|png|webp|heic|heif|svg)$/i;
addEventListener('dragover', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  const hanterad = e.defaultPrevented; // en bildväljare eller chatten tar emot den själv
  e.preventDefault();
  const iFormularet = Boolean(app.kund && e.target.closest?.('#yta'));
  e.dataTransfer.dropEffect = iFormularet || hanterad ? 'copy' : 'none';
  document.body.classList.toggle('slapp-bild', iFormularet && !hanterad);
  clearTimeout(app.draTimer);
  app.draTimer = setTimeout(() => document.body.classList.remove('slapp-bild'), 160);
});
addEventListener('drop', async (e) => {
  document.body.classList.remove('slapp-bild');
  if (e.defaultPrevented || !e.dataTransfer?.files.length) return;
  e.preventDefault();
  if (!app.kund || !e.target.closest?.('#yta')) return;
  const filer = [...e.dataTransfer.files].filter((f) => BILD.test(f.name) || f.type.startsWith('image/'));
  if (!filer.length) { meddela('Släpp en bild: jpg, png, webp, heic eller svg.', 'fel'); return; }
  meddela(filer.length === 1 ? 'Laddar upp bilden…' : `Laddar upp ${filer.length} bilder…`);
  const svar = [];
  for (const f of filer) svar.push(await laddaUppBild(f, undefined, true));
  const klara = svar.filter(Boolean);
  if (!klara.length) return;
  ritaOm();
  const fore = klara.reduce((n, x) => n + x.fore, 0);
  const efter = klara.reduce((n, x) => n + x.storlek, 0);
  meddela(`${klara.length === 1 ? `${klara[0].fil} är uppladdad` : `${klara.length} bilder är uppladdade`}${fore > efter * 1.2 ? `, ${storlek(fore)} blev ${storlek(efter)}` : ''}. Välj ${klara.length === 1 ? 'den' : 'dem'} under Bilder och logga.`);
  rullaTill(document.getElementById('s-bilder'));
});

function ritaOm(fokus) {
  const yta = document.getElementById('yta');
  const form = document.getElementById('formular');
  if (!yta || !form) return;
  const scroll = yta.scrollTop;
  app.sektioner = ritaFormular(ctx);
  form.replaceChildren(...app.sektioner.map((s) => s.el));
  yta.scrollTop = scroll;
  ritaNav();
  visaFel(false);
  bevakaSektioner();
  if (fokus) document.querySelector(`[id="${fokus}"], [id^="${fokus}-"]`)?.focus();
}

// --- Stegen till vänster ---------------------------------------------------------------------

const tomt = (v) => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

/** Hur långt en del av formuläret har kommit: klar, tom (och valfri) eller med fält kvar att fylla i. */
function sektionsLage(s) {
  const sc = app.schemafil.schema;
  const kvar = s.nycklar.flatMap((k) => allaFel(sc.properties[k], app.data[k], [k], Boolean(sc.required?.includes(k)) && sc.properties[k].default === undefined));
  if (kvar.length) return { lage: 'kvar', antal: kvar.length };
  return { lage: s.nycklar.every((k) => tomt(app.data[k])) ? 'tom' : 'klar', antal: 0 };
}

function ritaNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const lagen = app.sektioner.map(sektionsLage);
  const klara = lagen.filter((l) => l.lage !== 'kvar').length;
  fyll(nav,
    h('div', { class: 'framsteg' },
      h('div', { class: 'framsteg-text' }, klara === lagen.length ? 'Klart att bygga' : `${klara} av ${lagen.length} delar klara`),
      h('div', { class: 'framsteg-stapel' }, h('span', { style: { width: `${(klara / lagen.length) * 100}%` } }))),
    h('ol', {}, app.sektioner.map((s, i) => h('li', {}, h('a', { href: `#${s.id}`, 'data-sektion': s.id, 'data-lage': lagen[i].lage, onclick: (e) => {
      e.preventDefault();
      rullaTill(document.getElementById(s.id));
    } },
      h('span', { class: 'steg' }, lagen[i].lage === 'klar' ? ikon('bock', 13) : i + 1),
      h('span', { class: 'steg-namn' }, s.namn),
      lagen[i].lage === 'kvar' && h('span', { class: 'kvar', title: `${lagen[i].antal} fält kvar att fylla i` }, lagen[i].antal),
      h('span', { class: 'antal-fel', hidden: true }))))),
    h('div', { class: 'nav-fot' },
      h('button', { type: 'button', class: 'knapp primar bred', onclick: forhandsvisa }, ikon('visa', 17), 'Förhandsvisa')));
  markeraAktiv();
}

function bevakaSektioner() {
  const yta = document.getElementById('yta');
  yta.onscroll = markeraAktiv;
  markeraAktiv();
}

/** Markerar den del i stegen som formuläret visar just nu. */
function markeraAktiv() {
  const yta = document.getElementById('yta');
  if (!yta) return;
  const topp = yta.getBoundingClientRect().top + 140;
  const aktiv = app.sektioner.filter((s) => s.el.getBoundingClientRect().top <= topp).at(-1) ?? app.sektioner[0];
  document.querySelectorAll('.stegnav a').forEach((a) => a.classList.toggle('aktiv', a.dataset.sektion === aktiv?.id));
}

// --- Felen ----------------------------------------------------------------------------------

/**
 * Prövar felen som visas igen efter en ändring, så att ett fel försvinner så fort
 * fältet är rätt. Fel som bara bygget ser (en bild som saknas, kontrasten) tas
 * bort när säljaren ändrar just det fältet. Nya fel visas först när fältet lämnas.
 */
function omprova(vag) {
  clearTimeout(omprova.timer);
  omprova.timer = setTimeout(() => {
    const id = vag.join('.');
    const nu = new Map(allaFel(app.schemafil.schema, app.data));
    const rors = (v) => v === id || v.startsWith(`${id}.`) || id.startsWith(`${v}.`);
    app.fel = app.fel.flatMap(([v, text]) => {
      if (nu.has(v)) return [[v, nu.get(v)]];
      if (app.fran.get(v) === 'bygg' && !rors(v)) return [[v, text]];
      return [];
    });
    ritaNav();
    visaFel(false);
  }, 120);
}

/** Visar app.fel vid fälten, i stegen och, om sammanfatta, överst i formuläret. */
function visaFel(sammanfatta = true) {
  document.querySelectorAll('.har-fel').forEach((e) => e.classList.remove('har-fel'));
  document.querySelectorAll('.felrad').forEach((e) => e.replaceChildren());
  const perSektion = new Map();
  const poster = app.fel.map(([vag, text]) => {
    let el = null;
    let v = vag;
    while (v && !(el = document.querySelector(`[data-vag="${CSS.escape(v)}"]`))) v = v.includes('.') ? v.slice(0, v.lastIndexOf('.')) : '';
    if (!el) el = document.getElementById(`s-${vag.split('.')[0]}`) ?? document.getElementById('s-restaurangen');
    if (el?.dataset.vag) {
      const falt = el.querySelector(':scope > .felrad') ? el : el.parentElement.closest('[data-vag]') ?? el;
      falt.classList.add('har-fel');
      const rad = falt.querySelector(':scope > .felrad');
      if (rad) rad.textContent = rad.textContent ? `${rad.textContent}. ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
      for (let d = el.closest('details'); d; d = d.parentElement.closest('details')) d.open = true;
    }
    const sektion = el?.closest('.sektion')?.id;
    if (sektion) perSektion.set(sektion, (perSektion.get(sektion) ?? 0) + 1);
    return { vag, text, el };
  });
  document.querySelectorAll('.stegnav a').forEach((a) => {
    const n = perSektion.get(a.dataset.sektion) ?? 0;
    const bricka = a.querySelector('.antal-fel');
    bricka.hidden = !n;
    bricka.textContent = n;
    a.classList.toggle('med-fel', n > 0);
  });
  const ruta = document.getElementById('sammanfattning');
  if (!ruta) return;
  if (!poster.length) {
    if (ruta.querySelector('.felruta')) {
      ruta.replaceChildren(h('div', { class: 'klarruta', role: 'status' }, ikon('bock', 18), 'Allt är rättat. Tryck Förhandsvisa för att bygga sajten.'));
      setTimeout(() => ruta.querySelector('.klarruta')?.classList.add('borta'), 4000);
    }
    return;
  }
  if (!sammanfatta && !ruta.querySelector('.felruta')) return;
  ruta.replaceChildren(h('div', { class: 'felruta', role: 'alert' },
    h('h2', {}, poster.length === 1 ? 'En sak att rätta innan sajten kan byggas' : `${poster.length} saker att rätta innan sajten kan byggas`),
    h('ul', {}, poster.map((p) => h('li', {}, h('button', { type: 'button', class: 'lank', onclick: () => {
      rullaTill(p.el, 'center');
      p.el?.querySelector('input, textarea, button')?.focus({ preventScroll: true });
    } }, vagNamn(app.schemafil.schema, p.vag)), `: ${p.text}`)))));
  if (sammanfatta) document.getElementById('yta').scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Spara på datorn ----------------------------------------------------------------------

function status(text, typ = '') {
  const el = document.getElementById('sparstatus');
  if (el) { el.textContent = text; el.dataset.typ = typ; }
}

function sparaSnart() {
  app.osparat = true;
  status('Sparar…', 'sparar');
  clearTimeout(app.timer);
  app.timer = setTimeout(sparaNu, 600);
}

async function sparaNu() {
  clearTimeout(app.timer);
  if (app.sparning) await app.sparning;
  if (!app.osparat || !app.kund) return;
  app.osparat = false;
  app.sparning = api('PUT', `kunder/${app.kund}`, { data: app.data, andrad: app.andrad })
    .then((svar) => { app.andrad = svar.andrad; status('Sparat'); })
    .catch(async (err) => {
      if (err.status === 409) {
        meddela('Kundfilen ändrades samtidigt, till exempel av Claude. Formuläret visar nu den nya versionen.');
        await laddaOm(true);
      } else {
        app.osparat = true;
        status('Kunde inte spara', 'fel');
        meddela(err.message, 'fel');
      }
    })
    .finally(() => { app.sparning = null; });
  await app.sparning;
}

/** Läser kundfilen igen. Med markera lyser fälten som ändrats upp en stund, så att säljaren ser vad Claude gjorde. */
async function laddaOm(markera = false) {
  if (!app.kund) return;
  const fore = JSON.parse(JSON.stringify(app.data ?? {}));
  const [svar, bilder] = await Promise.all([api('GET', `kunder/${app.kund}`), api('GET', `kunder/${app.kund}/bilder`)]);
  Object.assign(app, { data: svar.data, andrad: svar.andrad, bilder, osparat: false });
  const namn = document.getElementById('kundnamn');
  if (namn) namn.textContent = svar.data.namn ?? app.kund;
  status('Sparat');
  ritaOm();
  if (app.fel.length) omprova(['']);
  if (markera) lysUpp(skillnader(fore, svar.data));
}

function skillnader(a, b, vag = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const grupp = (x) => x && typeof x === 'object';
  if (!grupp(a) || !grupp(b) || Array.isArray(a) !== Array.isArray(b)) return [vag.join('.')];
  const nycklar = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...nycklar].flatMap((k) => skillnader(a[k], b[k], [...vag, Array.isArray(b) ? Number(k) : k]));
}

function lysUpp(vagar) {
  const element = new Set();
  for (const vag of vagar) {
    let v = vag;
    let el = null;
    while (v && !(el = document.querySelector(`[data-vag="${CSS.escape(v)}"]`))) v = v.includes('.') ? v.slice(0, v.lastIndexOf('.')) : '';
    if (el) element.add(el.closest('.kort') ?? el);
  }
  for (const el of element) {
    el.classList.remove('nytt');
    void el.offsetWidth;
    el.classList.add('nytt');
  }
  const forsta = [...element].sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0];
  const yta = document.getElementById('yta');
  if (forsta && yta) {
    const r = forsta.getBoundingClientRect();
    const y = yta.getBoundingClientRect();
    if (r.bottom < y.top || r.top > y.bottom) rullaTill(forsta, 'center');
  }
}

/** Rullar till ett fält och lyser upp det, till exempel från ett fält Claude ändrade. */
function visaFalt(vag) {
  let v = vag;
  let el = null;
  while (v && !(el = document.querySelector(`[data-vag="${CSS.escape(v)}"]`))) v = v.includes('.') ? v.slice(0, v.lastIndexOf('.')) : '';
  el ??= document.getElementById(`s-${vag.split('.')[0]}`);
  if (!el) return;
  for (let d = el.closest('details'); d; d = d.parentElement.closest('details')) d.open = true;
  if (innerWidth <= 1100) chatt.stang();
  rullaTill(el, 'center');
  const mal = el.closest('.kort') ?? el;
  mal.classList.remove('nytt');
  void mal.offsetWidth;
  mal.classList.add('nytt');
  el.querySelector('input, textarea, select')?.focus({ preventScroll: true });
}

// Pulsen håller servern vid liv och märker när någon annan, till exempel Claude i appen, ändrar kundfilen.
setInterval(async () => {
  try {
    const svar = await api('GET', `puls${app.kund ? `?kund=${app.kund}` : ''}`);
    if (app.kund && svar.andrad && Math.abs(svar.andrad - app.andrad) > 0.001 && !app.osparat && !app.sparning && !app.upptagen) {
      await laddaOm(true);
      if (!chatt.arbetar) meddela('Kundfilen ändrades utanför formuläret. Ändringarna lyser upp.');
    }
    // På startsidan syns det när Claude blir klar med en kund.
    if (!app.kund && app.start?.kunder.some((k) => k.arbetar)) {
      const nya = await api('GET', 'kunder');
      const nyckel = (l) => JSON.stringify(l.map((k) => [k.kund, k.arbetar, k.status, k.kvar, k.byggd]));
      if (!app.kund && nyckel(nya) !== nyckel(app.start.kunder)) {
        app.start.kunder = nya;
        if (document.querySelector('.kundlista')) app.start.ritaLista();
      }
    }
  } catch { /* servern startar om eller är avslutad */ }
}, 4000);

addEventListener('beforeunload', (e) => { if (app.osparat) e.preventDefault(); });

// --- Förhandsvisning och förslag ----------------------------------------------------------------

async function kontrollera() {
  await sparaNu();
  app.fel = allaFel(app.schemafil.schema, app.data);
  for (const [v] of app.fel) app.fran.set(v, 'klient');
  visaFel(true);
  if (app.fel.length) meddela('Rätta fälten som är markerade först.', 'fel');
  return !app.fel.length;
}

async function arbeta(text, jobb) {
  if (app.upptagen) return undefined;
  app.upptagen = true;
  document.querySelectorAll('#k-visa, #k-forslag').forEach((k) => (k.disabled = true));
  try {
    return await jobb();
  } finally {
    document.querySelectorAll('#k-visa, #k-forslag').forEach((k) => (k.disabled = false));
    app.upptagen = false;
  }
}

async function forhandsvisa() {
  if (!(await kontrollera())) return;
  await arbeta('Bygger', async () => {
    visa({ lage: 'bygger', text: 'Bygger sajten', enhet: app.visning?.enhet ?? 'mobil' });
    try {
      const svar = await api('POST', `kunder/${app.kund}/bygg`);
      app.fel = [];
      visaFel(false);
      visa({ lage: 'visa', url: svar.url, enhet: app.visning?.enhet ?? 'mobil', varn: svar.varn, granskning: svar.fel });
    } catch (err) {
      byggfel(err);
    }
  });
}

async function skapaForslag(varianter) {
  if (!(await kontrollera())) return;
  await arbeta('Skapar förslag', async () => {
    visa({ lage: 'bygger', text: 'Bygger fyra förslag', enhet: 'dator', langsam: true });
    try {
      const svar = await api('POST', `kunder/${app.kund}/forslag`, { varianter: varianter ?? [] });
      visa({ lage: 'forslag', url: `${svar.url}${svar.varianter[0]?.mapp ?? ''}/`, bas: svar.url, varianter: svar.varianter, enhet: 'dator' });
    } catch (err) {
      byggfel(err);
    }
  });
}

function byggfel(err) {
  if (err.falt?.length) {
    stangVisning();
    app.fel = err.falt;
    for (const [v] of app.fel) app.fran.set(v, 'bygg');
    ritaNav();
    visaFel(true);
    meddela('Bygget stoppade på fälten som är markerade.', 'fel');
  } else {
    visa({ lage: 'fel', text: err.message, logg: err.logg });
  }
}

// --- Helskärmen: förhandsvisningen, förslagen och hjälpen ------------------------------------------

const ENHETER = [['mobil', 'Mobil', 390, 844], ['surfplatta', 'Surfplatta', 820, 1180], ['dator', 'Dator', 1440, 900]];

function stangVisning() {
  document.getElementById('visning')?.remove();
  document.body.classList.remove('visar');
  app.visning = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/**
 * p.lage: bygger | visa | forslag | fel. Fönstret täcker hela skärmen, så att
 * sajten syns i riktig storlek. Esc stänger.
 */
function visa(p) {
  // Ett nytt läge börjar om, men behåller skärmstorleken. Annars ändras bara det som skickas med.
  app.visning = p.lage ? { enhet: app.visning?.enhet, ...p } : { ...app.visning, ...p };
  const v = app.visning;
  let ruta = document.getElementById('visning');
  if (!ruta) {
    ruta = h('div', { class: 'visning', id: 'visning', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Förhandsvisning' });
    document.body.append(ruta);
    document.body.classList.add('visar');
  }
  const titel = { bygger: v.text, visa: 'Förhandsvisning', forslag: 'Förslag', fel: 'Bygget stoppade' }[v.lage];
  const stang = h('button', { type: 'button', class: 'ikonknapp stor', 'aria-label': 'Stäng (Esc)', title: 'Stäng (Esc)', onclick: stangVisning }, ikon('stang', 20));
  const enhetsval = h('div', { class: 'segment morkt', role: 'radiogroup', 'aria-label': 'Skärmstorlek' }, ENHETER.map(([id, namn]) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(v.enhet === id), title: namn, onclick: () => visa({ enhet: id }) }, ikon(id, 18), h('span', {}, namn))));
  const valdVariant = v.lage === 'forslag' ? v.varianter.find((x) => v.url.includes(`/${x.mapp}/`)) : null;
  const namn = app.schemafil.namn;
  ruta.classList.toggle('mote', Boolean(v.mote));
  if (v.mote) return ritaMote(ruta, v, valdVariant);
  ruta.onmousemove = null;
  ruta.classList.remove('stilla');

  let innehall;
  if (v.lage === 'bygger') {
    const start = Date.now();
    const tid = h('span', { class: 'tid' }, '0 s');
    const rakna = setInterval(() => (document.body.contains(tid) ? (tid.textContent = `${Math.round((Date.now() - start) / 1000)} s`) : clearInterval(rakna)), 500);
    innehall = h('div', { class: 'visning-bygger' }, h('span', { class: 'snurra' }), h('p', {}, `${v.text}…`), tid,
      h('p', { class: 'hjalp' }, v.langsam ? 'Ungefär 15 sekunder per förslag.' : 'Det tar ungefär 15 sekunder.'));
  } else if (v.lage === 'fel') {
    innehall = h('div', { class: 'visning-fel' }, h('h2', {}, 'Sajten kunde inte byggas'), h('p', {}, v.text),
      v.logg && h('details', {}, h('summary', {}, 'Visa vad fabriken skrev'), h('pre', {}, v.logg)));
  } else {
    const ram = h('iframe', { title: titel, src: `${v.url}${v.url.includes('?') ? '&' : '?'}v=${Date.now()}` });
    const [, , bredd, hojd] = ENHETER.find(([id]) => id === v.enhet);
    const skarm = h('div', { class: `enhet ${v.enhet}`, style: { '--b': `${bredd}px`, '--h': `${hojd}px` } },
      v.enhet === 'dator' && h('div', { class: 'webblasare' }, h('i'), h('i'), h('i'), h('span', {}, (app.data?.doman || 'sajten').replace(/^https?:\/\//, ''))),
      v.enhet === 'mobil' && h('div', { class: 'statusrad' }, '9:41'),
      ram);
    ram.addEventListener('load', () => { farga(ram, skarm); lyssnaIRam(ram); });
    const scen = h('div', { class: 'scen' }, skarm);
    innehall = h('div', { class: 'visning-kropp' },
      v.lage === 'forslag' && h('aside', { class: 'varianter' },
        h('p', { class: 'etikett' }, 'Välj en stil att visa'),
        v.varianter.map((x) => {
          const t = app.schemafil.teman.find((y) => y.id === x.tema);
          return h('button', { type: 'button', class: 'variant', 'aria-pressed': String(x === valdVariant), onclick: () => visa({ url: `${v.bas}${x.mapp}/` }) },
            h('span', { class: 'variant-prov', style: { background: t?.bg, color: t?.ink, '--accent': t?.accent } }, h('b', {}, 'Aa'), h('i')),
            h('span', {}, h('strong', {}, namn.stil[x.stil] ?? x.stil), h('small', {}, `${namn.tema[x.tema] ?? x.tema} · ${namn.hero[x.hero] ?? x.hero}`)));
        })),
      scen,
      (v.varn?.length || v.granskning?.length) ? h('details', { class: 'granskning' }, h('summary', {},
        v.granskning?.length ? `${v.granskning.length} fel` : '', v.granskning?.length && v.varn?.length ? ' och ' : '', v.varn?.length ? `${v.varn.length} att titta på` : '', ' från kontrollen'),
      h('ul', {}, [...(v.granskning ?? []).map((t) => h('li', { class: 'fel' }, t)), ...(v.varn ?? []).map((t) => h('li', {}, t))])) : null);
    requestAnimationFrame(() => skala(scen, skarm, bredd, hojd));
  }

  fyll(ruta,
    h('header', { class: 'visning-topp' },
      h('div', { class: 'visning-titel' }, h('strong', {}, titel), h('span', {}, app.data?.namn ?? '')),
      (v.lage === 'visa' || v.lage === 'forslag') && enhetsval,
      h('div', { class: 'visning-knappar' },
        v.lage === 'visa' && h('button', { type: 'button', class: 'knapp mork', onclick: forhandsvisa, title: 'Bygg om med det senaste i formuläret' }, ikon('bygg', 17), h('span', {}, 'Bygg om')),
        (v.lage === 'visa' || v.lage === 'forslag') && h('button', { type: 'button', class: 'knapp mork', onclick: borjaMote, title: 'Sajten över hela skärmen, utan Designer runt omkring' }, ikon('mote', 17), h('span', {}, 'Visa för kunden')),
        valdVariant && h('button', { type: 'button', class: 'knapp ljus', onclick: () => valjVariant(valdVariant) }, ikon('bock', 17), h('span', {}, 'Välj den här stilen')),
        (v.lage === 'visa' || v.lage === 'forslag') && h('a', { class: 'knapp mork', href: v.url, target: '_blank', rel: 'noopener', title: 'Öppna i webbläsaren' }, ikon('extern', 17), h('span', {}, 'Öppna')),
        stang)),
    innehall);
}

// --- Kundmötet: förslagen över hela skärmen ----------------------------------------------------

/**
 * Sajten fyller skärmen utan Designer runt omkring, för att visa kunden. Pilarna
 * byter stil, Välj den här sparar den och Esc går tillbaka. Raden längst ner
 * gömmer sig när musen står still.
 */
function borjaMote() {
  document.documentElement.requestFullscreen?.().catch(() => {});
  visa({ mote: true });
}

function lamnaMote() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (app.visning?.mote) visa({ mote: false });
}

addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && app.visning?.mote) visa({ mote: false });
});

function ritaMote(ruta, v, vald) {
  const namn = app.schemafil.namn;
  const ram = h('iframe', { title: app.data?.namn ?? 'Sajten', src: `${v.url}${v.url.includes('?') ? '&' : '?'}v=${Date.now()}` });
  const nr = v.varianter?.indexOf(vald) ?? -1;
  const rad = h('div', { class: 'mote-rad', role: 'toolbar', 'aria-label': 'Kundmötet' },
    vald
      ? [h('button', { type: 'button', class: 'mote-pil', 'aria-label': 'Förra stilen (←)', title: 'Förra stilen (←)', onclick: () => bytVariant(-1) }, ikon('tillbaka', 22)),
        h('div', { class: 'mote-stilar' }, v.varianter.map((x, i) => {
          const t = app.schemafil.teman.find((y) => y.id === x.tema);
          return h('button', { type: 'button', 'aria-pressed': String(i === nr), onclick: () => visa({ url: `${v.bas}${x.mapp}/` }) },
            h('i', { style: { background: t?.bg, '--accent': t?.accent } }), namn.stil[x.stil] ?? x.stil);
        })),
        h('button', { type: 'button', class: 'mote-pil', 'aria-label': 'Nästa stil (→)', title: 'Nästa stil (→)', onclick: () => bytVariant(1) }, ikon('hoger', 22)),
        h('button', { type: 'button', class: 'knapp ljus', onclick: () => valjVariant(vald) }, ikon('bock', 17), h('span', {}, 'Välj den här'))]
      : h('span', { class: 'mote-namn' }, app.data?.namn ?? ''),
    h('button', { type: 'button', class: 'mote-stang', 'aria-label': 'Tillbaka till Designer (Esc)', title: 'Tillbaka till Designer (Esc)', onclick: lamnaMote }, ikon('stang', 18)));
  fyll(ruta, h('div', { class: 'mote-scen' }, ram), rad);

  // Raden och muspekaren gömmer sig efter ett par sekunder utan rörelse, så att bara sajten syns.
  const visaRad = () => {
    ruta.classList.remove('stilla');
    clearTimeout(ritaMote.timer);
    ritaMote.timer = setTimeout(() => { if (!rad.matches(':hover')) ruta.classList.add('stilla'); }, 2500);
  };
  ruta.onmousemove = visaRad;
  ram.addEventListener('load', () => {
    lyssnaIRam(ram);
    try { ram.contentWindow.addEventListener('mousemove', visaRad); } catch { /* annan adress */ }
  });
  visaRad();
  return undefined;
}

function bytVariant(steg) {
  const v = app.visning;
  if (v?.lage !== 'forslag' || !v.varianter?.length) return;
  const i = v.varianter.findIndex((x) => v.url.includes(`/${x.mapp}/`));
  const x = v.varianter[(i + steg + v.varianter.length) % v.varianter.length];
  visa({ url: `${v.bas}${x.mapp}/` });
}

/** Pilarna och Esc ska fungera även när sajten i ramen har fokus. */
function lyssnaIRam(ram) {
  try {
    ram.contentWindow.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) tangent(e);
    });
  } catch { /* en sajt från en annan adress */ }
}

function tangent(e) {
  if (!document.getElementById('visning') || document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') {
    if (app.visning?.mote) lamnaMote(); else stangVisning();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && app.visning?.lage === 'forslag' && !e.target.closest?.('input, textarea, select')) {
    e.preventDefault();
    bytVariant(e.key === 'ArrowLeft' ? -1 : 1);
  }
}

/** Ger telefonens statusrad samma färger som sajten, som en riktig telefon. */
function farga(ram, skarm) {
  try {
    const d = ram.contentDocument;
    const genomskinlig = (c) => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
    const bg = [d.body, d.documentElement].map((x) => getComputedStyle(x).backgroundColor).find((c) => !genomskinlig(c));
    if (bg) skarm.style.setProperty('--status-bg', bg);
    skarm.style.setProperty('--status-ink', getComputedStyle(d.body).color);
  } catch { /* En sajt från en annan adress får behålla den vita raden. */ }
}

/** Skalar ner skärmen så att den alltid ryms, med sajten i sin riktiga bredd. */
function skala(scen, skarm, bredd, hojd) {
  const passa = () => {
    if (!document.body.contains(scen)) return removeEventListener('resize', passa);
    if (skarm.classList.contains('dator')) {
      // Datorn fyller hela ytan i riktig storlek, men aldrig smalare än en liten laptop.
      const b = Math.max(1024, scen.clientWidth - 48);
      const hj = Math.max(600, scen.clientHeight - 48 - 36);
      skarm.style.setProperty('--b', `${b}px`);
      skarm.style.setProperty('--h', `${hj}px`);
      skarm.style.setProperty('--skala', Math.min(1, (scen.clientWidth - 48) / b, (scen.clientHeight - 84) / hj).toFixed(3));
      return undefined;
    }
    const f = Math.min(1, (scen.clientWidth - 48) / (bredd + 24), (scen.clientHeight - 48) / (hojd + 24));
    skarm.style.setProperty('--skala', f.toFixed(3));
    return undefined;
  };
  passa();
  addEventListener('resize', passa);
}

function valjVariant(x) {
  for (const k of ['stil', 'tema', 'hero', 'meny']) satt(app.data, ['design', k], x[k]);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  sparaSnart();
  stangVisning();
  ritaOm();
  rullaTill(document.getElementById('s-design'));
  lysUpp(['design.stil', 'design.tema', 'design.hero', 'design.meny']);
  meddela(`${app.schemafil.namn.stil[x.stil]} med ${app.schemafil.namn.tema[x.tema]} är vald.`);
}

addEventListener('keydown', tangent);

function visaHjalp() {
  const steg = [
    ['Skapa kunden', 'Tryck Ny kund och skriv restaurangens namn. Skriv gärna det du vet om restaurangen, så fyller Claude i åt dig.'],
    ['Fyll i formuläret', 'Gå igenom delarna till vänster. En bock betyder att delen är klar, en siffra hur många fält som är kvar. Allt sparas direkt på datorn.'],
    ['Låt Claude hjälpa till', 'Tryck Claude uppe till höger och skriv till exempel ”fyll i från deras webbplats” med en länk. Under svaret står fälten Claude ändrade, och Ångra sätter tillbaka dem. Claude arbetar vidare om du byter kund.'],
    ['Lägg in bilder', 'Dra bilder från Finder till formuläret. De görs lagom stora, vänds rätt och sparas utan platsuppgifter. HEIC från iPhone går bra.'],
    ['Förhandsvisa', 'Tryck Förhandsvisa. Sajten byggs på ungefär 15 sekunder och visas i helskärm. Byt mellan mobil, surfplatta och dator. Esc stänger.'],
    ['Visa kunden förslag', 'Tryck Förslag för fyra stilar och Visa för kunden för helskärm. Pilarna byter stil, Välj den här sparar den kunden gillar.'],
    ['Spara till GitHub', 'När kunden är klar: tryck på de tre prickarna och Spara till GitHub. Då kommer sajten med i fabriken.'],
    ['Exportera och arkivera', 'Exportera för kunden ger en fil med allt om restaurangen som kunden öppnar i webbläsaren. Arkivera det som inte är aktuellt: kunden flyttas till Arkiv längst ner på startsidan och tas bort efter 30 dagar.'],
  ];
  const dialog = h('dialog', { class: 'dialog hjalp-dialog' },
    h('div', { class: 'hjalp-huvud' }, h('h2', {}, 'Så använder du Designer'), h('button', { type: 'button', class: 'ikonknapp', 'aria-label': 'Stäng', onclick: () => dialog.close() }, ikon('stang', 20))),
    h('ol', { class: 'hjalp-steg' }, steg.map(([rubrik, text], i) => h('li', {}, h('span', { class: 'steg' }, i + 1), h('div', {}, h('strong', {}, rubrik), h('p', {}, text))))),
    h('p', { class: 'hjalp' }, 'Claude hittar aldrig på öppettider, priser eller rätter. Det som saknas frågar Claude efter, och bygget visar vad som fattas.'),
    h('div', { class: 'dialog-knappar' }, h('button', { type: 'button', class: 'knapp primar', onclick: () => dialog.close() }, 'Då kör vi')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

// --- GitHub och fabriken --------------------------------------------------------------------

async function sparaGithub() {
  await sparaNu();
  meddela('Sparar till GitHub…');
  try {
    const svar = await api('POST', `kunder/${app.kund}/spara`);
    meddela(svar.meddelande);
  } catch (err) {
    visa({ lage: 'fel', text: err.message, logg: err.logg });
  }
}

async function uppdatera() {
  try {
    const svar = await api('POST', 'uppdatera');
    meddela(svar.meddelande);
    if (!svar.andrat) return;
    document.body.className = '';
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
  await sparaNu();
  await api('POST', 'avsluta').catch(() => {});
  document.body.className = '';
  fyll(rot, h('main', { class: 'start' }, h('section', { class: 'start-hjalte' }, h('p', { class: 'etikett-stor' }, 'HJERDAL Designer'), h('h1', {}, 'Avslutad.'), h('p', { class: 'ingress' }, 'Du kan stänga fönstret. Öppna Designer igen från Dock.'))));
}

// --- Start -------------------------------------------------------------------------------

async function route() {
  await sparaNu();
  stangVisning();
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
