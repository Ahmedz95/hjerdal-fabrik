// Formuläret ritas från kundfilens schema (starter/cms.manifest.json). Varje fält
// i schemat får en kontroll efter sin typ: text, tal, ja/nej, val, listor och
// grupper. Ett nytt fält i startern syns därför här utan att Designer ändras.
//
// Etiketterna kommer från .describe('Etikett|Hjälptext|tips') i schemat.
// Några fält får en bättre kontroll än standard, och den väljs efter vad fältet
// tar emot, inte vad det heter: ett mönster som godtar 11:00 blir en klocka,
// ett som godtar bild.jpg blir en bildväljare och en lista med namn och
// beskrivning i schemafilen (stilar, teman) blir kort att välja bland.

export const h = (tag, attr = {}, ...barn) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attr ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [n, x] of Object.entries(v)) n.startsWith('--') ? el.style.setProperty(n, x) : (el.style[n] = x);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const b of barn.flat(Infinity)) if (b != null && b !== false) el.append(b instanceof Node ? b : String(b));
  return el;
};

export const hamta = (obj, vag) => vag.reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function satt(obj, vag, varde) {
  let o = obj;
  for (let i = 0; i < vag.length - 1; i++) {
    if (o[vag[i]] == null || typeof o[vag[i]] !== 'object') o[vag[i]] = typeof vag[i + 1] === 'number' ? [] : {};
    o = o[vag[i]];
  }
  const sista = vag.at(-1);
  if (varde === undefined && !Array.isArray(o)) delete o[sista];
  else o[sista] = varde ?? '';
}

export function etikett(s) {
  const [namn = '', hjalp = '', tips = ''] = (s?.description ?? '').split('|');
  return { namn, hjalp, tips: tips.split(',').map((t) => t.trim()).filter(Boolean) };
}

const kopia = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Ett nytt värde för en grupp eller lista: standardvärdena och det som måste finnas. */
export function standard(s) {
  if (s.default !== undefined) return kopia(s.default);
  if (s.type === 'object') {
    const o = {};
    for (const [k, p] of Object.entries(s.properties ?? {})) {
      if (p.default !== undefined) o[k] = kopia(p.default);
      else if (s.required?.includes(k) && (p.type === 'object' || p.type === 'array')) o[k] = standard(p);
    }
    return o;
  }
  if (s.type === 'array') {
    if (Array.isArray(s.items)) return s.items.map(() => '');
    return Array.from({ length: s.minItems ?? 0 }, () => standard(s.items));
  }
  return undefined;
}

// --- Vad ett fält tar emot ----------------------------------------------------

const godtar = (s, ...prov) => {
  if (!s.pattern) return false;
  const re = new RegExp(s.pattern);
  return prov.every((p) => (p.startsWith('!') ? !re.test(p.slice(1)) : re.test(p)));
};
const arTid = (s) => godtar(s, '11:00', '!1100');
const arDatum = (s) => godtar(s, '2026-12-24');
const arFarg = (s) => godtar(s, '#1E1B16', '!1E1B16');
const bildtyper = (s) => (godtar(s, '!bild.txt') ? ['jpg', 'png', 'webp', 'svg'].filter((t) => godtar(s, `bild.${t}`)) : []);

// --- Kontrollen i webbläsaren -------------------------------------------------
// Samma regler som bygget, eftersom de kommer från samma schema. Det bygget ser
// utöver detta (bilder som saknas, kontrast) kommer tillbaka från bygget.

export function validera(s, v, kravd) {
  if (v === undefined || v === null || v === '') return kravd ? 'måste fyllas i' : null;
  const em = s.errorMessage ?? {};
  if (s.enum && !s.enum.includes(v)) return `välj bland ${s.enum.join(', ')}`;
  if (s.type === 'string') {
    if (typeof v !== 'string') return 'ska vara text';
    if (s.minLength && v.length < s.minLength) return em.minLength ?? (s.minLength === 1 ? 'måste fyllas i' : `ska vara minst ${s.minLength} tecken, nu ${v.length}`);
    if (s.maxLength && v.length > s.maxLength) return em.maxLength ?? `får vara högst ${s.maxLength} tecken, nu ${v.length}`;
    if (s.pattern && !new RegExp(s.pattern).test(v)) return em.pattern ?? 'har fel form';
    if (s.format === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return em.format ?? 'skrivs som namn@exempel.se';
    if (s.format === 'uri' && !/^https?:\/\/[^\s/]+\.[^\s]+$/.test(v)) return em.format ?? 'måste börja med https://';
  }
  if (s.type === 'number') {
    if (typeof v !== 'number' || Number.isNaN(v)) return 'ska vara ett tal';
    if (s.minimum !== undefined && v < s.minimum) return `får inte vara mindre än ${s.minimum}`;
  }
  if (s.type === 'array' && Array.isArray(v) && s.minItems && v.length < s.minItems) {
    return s.minItems === 1 ? 'behöver minst en' : `behöver minst ${s.minItems}`;
  }
  return null;
}

/** Alla fel i hela kundfilen, som [väg, meddelande]. */
export function allaFel(s, v, vag = [], kravd = true) {
  const fel = [];
  const eget = validera(s, v, kravd);
  if (eget) return [[vag.join('.'), eget]];
  if (v == null) return fel;
  if (s.type === 'object' && typeof v === 'object') {
    for (const [k, p] of Object.entries(s.properties ?? {})) {
      fel.push(...allaFel(p, v[k], [...vag, k], Boolean(s.required?.includes(k)) && p.default === undefined));
    }
  } else if (s.type === 'array' && Array.isArray(v)) {
    v.forEach((x, i) => fel.push(...allaFel(Array.isArray(s.items) ? s.items[i] ?? {} : s.items, x, [...vag, i], true)));
  }
  return fel;
}

// --- Formuläret ---------------------------------------------------------------

/**
 * ctx: { schemafil, data, kund, bilder, stangda (Set), andra(vag, v), ritaOm(), laddaUpp(fil, typer) }
 * Returnerar sektionerna att visa och navigera mellan.
 */
export function ritaFormular(ctx) {
  const s = ctx.schemafil.schema;
  const sektioner = [];
  let enkla = null;
  const sektion = (id, namn, hjalp) => h('section', { class: 'sektion', id },
    h('header', { class: 'sektion-huvud' }, h('span', { class: 'steg' }, sektioner.length + 1), h('h2', {}, namn)),
    hjalp && h('p', { class: 'hjalp sektion-hjalp' }, hjalp));
  for (const [k, p] of Object.entries(s.properties)) {
    const kravd = Boolean(s.required?.includes(k));
    const grupp = p.type === 'object' || (p.type === 'array' && p.items?.type === 'object');
    if (!grupp) {
      // Fälten på översta nivån som inte är grupper samlas i en egen sektion först.
      if (!enkla) {
        enkla = { id: 's-restaurangen', namn: 'Restaurangen', nycklar: [], el: sektion('s-restaurangen', 'Restaurangen') };
        sektioner.push(enkla);
      }
      enkla.nycklar.push(k);
      enkla.el.append(falt(p, [k], kravd, ctx));
      continue;
    }
    const { namn, hjalp } = etikett(p);
    const id = `s-${k}`;
    const el = sektion(id, namn, hjalp);
    el.append(falt(p, [k], kravd, ctx, { utanRubrik: true }));
    sektioner.push({ id, namn, el, nycklar: [k] });
  }
  return sektioner;
}

function falt(s, vag, kravd, ctx, opt = {}) {
  if (s.type === 'object') return grupp(s, vag, kravd, ctx, opt);
  if (s.type === 'array') {
    if (s.items?.type === 'object') return ram(s, vag, kravd, lista(s, vag, ctx), { ...opt, utanEtikett: opt.utanRubrik });
    if (s.items?.type === 'array' && Array.isArray(s.items.items)) return ram(s, vag, kravd, tuppelLista(s, vag, ctx));
    if (s.items?.enum) return ram(s, vag, kravd, flerval(s, vag, ctx));
    if (etikett(s).tips.includes('flerrad')) return ram(s, vag, kravd, textLista(s, vag, ctx));
    return ram(s, vag, kravd, taggar(s, vag, ctx));
  }
  if (s.type === 'boolean') return vaxel(s, vag, ctx);
  if (s.enum) {
    const info = valInfo(s.enum, ctx);
    return ram(s, vag, kravd, info && !etikett(s).tips.includes('kompakt') ? kortval(s, vag, kravd, info, ctx) : segment(s, vag, kravd, ctx));
  }
  if (s.type === 'string' && bildtyper(s).length) return ram(s, vag, kravd, bildval(s, vag, kravd, ctx));
  if (s.type === 'string' && arFarg(s)) return ram(s, vag, kravd, farg(s, vag, ctx));
  return ram(s, vag, kravd, inmatning(s, vag, kravd, ctx));
}

/** Etikett, hjälptext och felrad runt en kontroll. */
function ram(s, vag, kravd, kontroll, opt = {}) {
  const { namn, hjalp } = etikett(s);
  const id = `f-${vag.join('-')}`;
  const forsta = kontroll.id === id || kontroll.querySelector?.(`[id="${id}"]`);
  return h('div', { class: `falt${s.type === 'number' || arTid(s) || arDatum(s) ? ' smal' : ''}`, 'data-vag': vag.join('.') },
    !opt.utanEtikett && namn && h(forsta ? 'label' : 'p', { class: 'etikett', for: forsta ? id : null }, namn, !kravd && s.default === undefined && h('span', { class: 'valfri' }, 'valfritt')),
    !opt.utanEtikett && hjalp && h('p', { class: 'hjalp' }, hjalp),
    kontroll,
    h('p', { class: 'felrad', role: 'alert' }));
}

function inmatning(s, vag, kravd, ctx) {
  const v = hamta(ctx.data, vag);
  const flerrad = etikett(s).tips.includes('flerrad');
  const typ = s.type === 'number' ? 'number' : arTid(s) ? 'time' : arDatum(s) ? 'date'
    : s.format === 'email' ? 'email' : s.format === 'uri' ? 'url' : 'text';
  const el = flerrad
    ? h('textarea', { rows: s.maxLength && s.maxLength <= 200 ? 2 : 3, placeholder: s.default ?? '' })
    : h('input', { type: typ, inputmode: typ === 'number' ? 'decimal' : null, min: s.minimum, step: typ === 'number' ? 'any' : null,
      placeholder: s.format === 'uri' ? 'https://' : s.default ?? '', autocomplete: 'off', spellcheck: typ === 'text' });
  if (typ === 'text' && s.errorMessage?.pattern?.startsWith('skrivs som ')) el.placeholder = s.errorMessage.pattern.slice(11);
  el.id = `f-${vag.join('-')}`;
  el.value = v ?? '';
  const raknare = s.maxLength ? h('span', { class: 'raknare' }) : null;
  const visa = () => raknare && (raknare.textContent = `${el.value.length} / ${s.maxLength}`, raknare.classList.toggle('over', el.value.length > s.maxLength || el.value.length < (s.minLength ?? 0)));
  visa();
  el.addEventListener('input', () => {
    const ny = el.value === '' ? undefined : typ === 'number' ? Number(el.value) : el.value;
    ctx.andra(vag, ny);
    visa();
  });
  el.addEventListener('blur', () => ctx.kolla(vag, s, kravd));
  return raknare ? h('div', { class: 'med-raknare' }, el, raknare) : el;
}

function vaxel(s, vag, ctx) {
  const { namn, hjalp } = etikett(s);
  const v = hamta(ctx.data, vag) ?? s.default ?? false;
  const id = `f-${vag.join('-')}`;
  const ruta = h('input', { type: 'checkbox', role: 'switch', id, checked: v, onchange: () => ctx.andra(vag, ruta.checked) });
  return h('div', { class: 'falt vaxel', 'data-vag': vag.join('.') },
    h('label', { for: id }, ruta, h('span', { class: 'spak', 'aria-hidden': 'true' }), h('span', {}, namn)),
    hjalp && h('p', { class: 'hjalp' }, hjalp),
    h('p', { class: 'felrad', role: 'alert' }));
}

/** Visningsnamn för valen i en lista, från den grupp i schemafilen som innehåller alla värdena. */
export function valNamn(varden, ctx) {
  const grupp = Object.values(ctx.schemafil.namn ?? {}).find((g) => varden.every((v) => v in g));
  return (v) => grupp?.[v] ?? (v.length > 3 ? v.charAt(0).toUpperCase() + v.slice(1) : v);
}

function valInfo(varden, ctx) {
  return Object.values(ctx.schemafil).find((l) => Array.isArray(l) && l[0]?.id && l.length === varden.length && varden.every((v) => l.some((x) => x.id === v)));
}

/** Det stilen väljer för en av stilens delar (design.typsnitt, former, etiketter eller foton),
 *  som id, när fältet har tipset stilens. Visas som valet "Som stilen". */
function stilensDel(s, vag, ctx) {
  if (!etikett(s).tips.includes('stilens')) return undefined;
  const stil = hamta(ctx.data, [...vag.slice(0, -1), 'stil']) ?? 'hjerdal';
  return ctx.schemafil.stilar?.find((x) => x.id === stil)?.delar?.[vag.at(-1)] ?? null;
}

function segment(s, vag, kravd, ctx) {
  const v = hamta(ctx.data, vag) ?? s.default;
  const namn = valNamn(s.enum, ctx);
  const info = valInfo(s.enum, ctx);
  const stilens = stilensDel(s, vag, ctx);
  const tom = stilens === undefined ? 'Inget val' : `Som stilen${stilens ? ` (${namn(stilens)})` : ''}`;
  const val = [...(kravd || s.default !== undefined ? [] : [[undefined, tom]]), ...s.enum.map((x) => [x, namn(x)])];
  return h('div', { class: 'segment', role: 'radiogroup' }, val.map(([x, text]) =>
    h('button', { type: 'button', role: 'radio', title: info?.find((i) => i.id === x)?.beskrivning ?? null, 'aria-checked': String(v === x),
      onclick: () => { ctx.andra(vag, x); ctx.ritaOm(); } }, text)));
}

const stilTyp = {
  hjerdal: { fontWeight: 300, letterSpacing: '-0.04em' },
  klassisk: { fontFamily: 'ui-serif, Georgia, serif', fontStyle: 'italic' },
  kvarter: { fontFamily: '"Avenir Next Condensed", "Arial Narrow", sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.01em' },
  mjuk: { fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif', fontWeight: 600 },
  afton: { fontFamily: 'Didot, "Bodoni 72", "Bodoni MT", Georgia, serif', fontStyle: 'italic' },
  affisch: { fontFamily: '"Helvetica Neue", Arial, sans-serif', fontWeight: 800, letterSpacing: '-0.05em' },
  stampel: { fontFamily: '"Arial Black", "Helvetica Neue", sans-serif', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em' },
};
// Typsnitten ser ut som stilarna de kommer från.
Object.assign(stilTyp, { albert: stilTyp.hjerdal, garamond: stilTyp.klassisk, oswald: stilTyp.kvarter, bricolage: stilTyp.mjuk,
  bodoni: stilTyp.afton, schibsted: stilTyp.affisch, archivo: stilTyp.stampel });

function kortval(s, vag, kravd, info, ctx) {
  const v = hamta(ctx.data, vag) ?? s.default;
  // Ett valfritt fält som följer stilen börjar med valet "Som stilen", i stilens typsnitt.
  const stilens = stilensDel(s, vag, ctx);
  const lista = stilens === undefined || kravd ? info
    : [{ id: undefined, namn: 'Som stilen', beskrivning: info.find((x) => x.id === stilens)?.namn, typ: stilens }, ...info];
  return h('div', { class: 'kortval', role: 'radiogroup' }, lista.map((x) => {
    const farg = x.bg && { background: x.bg, color: x.ink, '--accent': x.accent, '--linje': x.line };
    return h('button', { type: 'button', role: 'radio', class: farg ? 'tema' : 'val', style: farg || null, 'aria-checked': String(v === x.id),
      onclick: () => { ctx.andra(vag, x.id); ctx.ritaOm(); } },
      h('span', { class: 'val-namn', style: stilTyp[x.typ ?? x.id] ?? null }, x.namn),
      farg ? h('span', { class: 'prov' }, h('span', { class: 'prick' }), x.mork ? 'Mörkt' : 'Ljust')
        : [x.passar && h('span', { class: 'val-passar' }, x.passar), x.beskrivning && h('span', { class: 'val-text' }, x.beskrivning)]);
  }));
}

function flerval(s, vag, ctx) {
  const v = hamta(ctx.data, vag) ?? [];
  const namn = valNamn(s.items.enum, ctx);
  return h('div', { class: 'chips' }, s.items.enum.map((x) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v.includes(x)), onclick: (e) => {
      const nu = hamta(ctx.data, vag) ?? [];
      const ny = nu.includes(x) ? nu.filter((y) => y !== x) : s.items.enum.filter((y) => y === x || nu.includes(y));
      ctx.andra(vag, ny);
      e.currentTarget.setAttribute('aria-pressed', String(ny.includes(x)));
    } }, namn(x))));
}

function taggar(s, vag, ctx) {
  const v = () => hamta(ctx.data, vag) ?? [];
  const falt = h('input', { type: 'text', placeholder: 'Skriv och tryck Enter', autocomplete: 'off' });
  const lagg = () => {
    const nya = falt.value.split(',').map((t) => t.trim()).filter(Boolean);
    if (!nya.length) return;
    ctx.andra(vag, [...v(), ...nya.filter((t) => !v().includes(t))]);
    falt.value = '';
    ctx.ritaOm(`f-${vag.join('-')}`);
  };
  falt.id = `f-${vag.join('-')}`;
  falt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); lagg(); }
    if (e.key === 'Backspace' && !falt.value && v().length) { ctx.andra(vag, v().slice(0, -1)); ctx.ritaOm(falt.id); }
  });
  falt.addEventListener('blur', lagg);
  return h('div', { class: 'taggar' }, v().map((t, i) =>
    h('span', { class: 'tagg' }, t, h('button', { type: 'button', 'aria-label': `Ta bort ${t}`, onclick: () => { ctx.andra(vag, v().filter((_, j) => j !== i)); ctx.ritaOm(); } }, '×'))), falt);
}

function textLista(s, vag, ctx) {
  const v = hamta(ctx.data, vag) ?? [];
  // Minst så många rader som listan kräver, så att det första stycket går att skriva direkt.
  const rader = Math.max(v.length, s.minItems ?? 0);
  return h('div', { class: 'textlista' },
    Array.from({ length: rader }, (_, i) => h('div', { class: 'rad', 'data-vag': [...vag, i].join('.') },
      inmatning({ ...s.items, description: s.description }, [...vag, i], true, ctx),
      h('button', { type: 'button', class: 'ikonknapp', 'aria-label': 'Ta bort', onclick: () => { ctx.andra(vag, v.filter((_, j) => j !== i)); ctx.ritaOm(); } }, '×'))),
    h('button', { type: 'button', class: 'lagg-till', onclick: () => { ctx.andra(vag, [...v, '']); ctx.ritaOm(`f-${[...vag, v.length].join('-')}`); } }, 'Lägg till ett stycke'));
}

function tuppelLista(s, vag, ctx) {
  const v = hamta(ctx.data, vag) ?? [];
  const delar = s.items.items;
  return h('div', { class: 'tider' },
    v.map((rad, i) => h('div', { class: 'tidrad', 'data-vag': [...vag, i].join('.') },
      delar.map((d, j) => [j > 0 && h('span', { class: 'streck' }, '–'), inmatning(d, [...vag, i, j], true, ctx)]),
      h('button', { type: 'button', class: 'ikonknapp', 'aria-label': 'Ta bort tiden', onclick: () => { ctx.andra(vag, v.filter((_, k) => k !== i)); ctx.ritaOm(); } }, '×'))),
    h('button', { type: 'button', class: 'lagg-till', onclick: () => { ctx.andra(vag, [...v, standard(s.items)]); ctx.ritaOm(`f-${[...vag, v.length, 0].join('-')}`); } }, 'Lägg till en tid'));
}

function grupp(s, vag, kravd, ctx, opt = {}) {
  const v = hamta(ctx.data, vag);
  const { namn, hjalp } = etikett(s);
  const valfri = !kravd && s.default === undefined;
  if (valfri && v === undefined) {
    // En grupp med en bild, som den stora bilden på startsidan, kan också läggas till genom att släppa en bild här.
    const [bildnyckel, bildschema] = Object.entries(s.properties ?? {}).find(([, p]) => p.type === 'string' && bildtyper(p).length) ?? [];
    const el = h('div', { class: 'valfri-grupp', 'data-vag': vag.join('.') },
      h('button', { type: 'button', class: 'lagg-till', onclick: () => { ctx.andra(vag, standard(s)); ctx.ritaOm(); } }, `Lägg till ${namn.toLowerCase()}`),
      bildnyckel && h('span', { class: 'slapp-har' }, 'eller släpp en bild här'),
      !opt.utanRubrik && hjalp && h('p', { class: 'hjalp' }, hjalp));
    if (bildnyckel) {
      taEmotBilder(el, bildtyper(bildschema), ctx, (fil) => {
        ctx.andra(vag, { ...standard(s), [bildnyckel]: fil });
        const nasta = Object.keys(s.properties).find((k) => k !== bildnyckel);
        ctx.ritaOm(nasta && `f-${[...vag, nasta].join('-')}`);
      });
    }
    return el;
  }
  const barn = Object.entries(s.properties ?? {}).map(([k, p]) => falt(p, [...vag, k], Boolean(s.required?.includes(k)) && p.default === undefined, ctx));
  if (opt.inneKort) return barn;
  return h('fieldset', { class: `grupp${opt.utanRubrik ? ' platt' : ''}`, 'data-vag': vag.join('.') },
    !opt.utanRubrik && h('legend', {}, namn),
    !opt.utanRubrik && hjalp && h('p', { class: 'hjalp' }, hjalp),
    valfri && h('button', { type: 'button', class: 'ta-bort', onclick: () => { ctx.andra(vag, undefined); ctx.ritaOm(); } }, `Ta bort ${namn.toLowerCase()}`),
    h('div', { class: 'grupp-falt' }, barn),
    h('p', { class: 'felrad', role: 'alert' }));
}

function lista(s, vag, ctx) {
  const v = hamta(ctx.data, vag) ?? [];
  const sak = etikett(s.items).namn || 'rad';
  const flytta = (i, j) => { const ny = [...v]; [ny[i], ny[j]] = [ny[j], ny[i]]; ctx.andra(vag, ny); ctx.ritaOm(); };
  const kort = v.map((x, i) => {
    const id = [...vag, i].join('.');
    const sammanfattning = sammanfatta(s.items, x, ctx);
    const el = h('details', { class: 'kort', 'data-vag': id, open: !ctx.stangda.has(id) },
      h('summary', {},
        h('span', { class: 'kort-namn' }, sammanfattning || `${sak} ${i + 1}`),
        h('span', { class: 'kort-knappar' },
          i > 0 && h('button', { type: 'button', class: 'ikonknapp', title: 'Flytta upp', 'aria-label': 'Flytta upp', onclick: (e) => { e.preventDefault(); flytta(i, i - 1); } }, '↑'),
          i < v.length - 1 && h('button', { type: 'button', class: 'ikonknapp', title: 'Flytta ner', 'aria-label': 'Flytta ner', onclick: (e) => { e.preventDefault(); flytta(i, i + 1); } }, '↓'),
          h('button', { type: 'button', class: 'ikonknapp', title: `Ta bort ${sak.toLowerCase()}`, 'aria-label': `Ta bort ${sak.toLowerCase()}`, onclick: (e) => { e.preventDefault(); ctx.andra(vag, v.filter((_, j) => j !== i)); ctx.ritaOm(); } }, '×'))),
      h('div', { class: 'kort-innehall' }, grupp(s.items, [...vag, i], true, ctx, { inneKort: true })),
      h('p', { class: 'felrad', role: 'alert' }));
    el.addEventListener('toggle', () => (el.open ? ctx.stangda.delete(id) : ctx.stangda.add(id)));
    return el;
  });
  return h('div', { class: 'lista' }, kort,
    h('button', { type: 'button', class: 'lagg-till', onclick: () => { ctx.andra(vag, [...v, standard(s.items)]); ctx.ritaOm(`f-${[...vag, v.length].join('-')}`); } }, `Lägg till ${sak.toLowerCase()}`));
}

/** Rubriken på ett kort i en lista: namnet, dagarna eller datumet, och priset om det finns. */
function sammanfatta(s, x, ctx) {
  if (!x || typeof x !== 'object') return '';
  const delar = [];
  for (const [k, p] of Object.entries(s.properties ?? {})) {
    const v = x[k];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (p.type === 'string' && !p.enum && delar.length === 0) delar.push(v);
    else if (p.type === 'array' && p.items?.enum && delar.length === 0) delar.push(v.map(valNamn(p.items.enum, ctx)).join(', '));
    else if (p.type === 'number' && delar.length === 1) delar.push(`${v} kr`);
  }
  return delar.join(' · ');
}

function farg(s, vag, ctx) {
  const v = hamta(ctx.data, vag);
  const text = h('input', { type: 'text', id: `f-${vag.join('-')}`, value: v ?? '', placeholder: 'Temats färg', maxlength: 7, autocomplete: 'off', spellcheck: false });
  const valjare = h('input', { type: 'color', value: v ?? '#101315', 'aria-label': 'Välj färg' });
  valjare.addEventListener('input', () => { text.value = valjare.value.toUpperCase(); ctx.andra(vag, text.value); });
  text.addEventListener('input', () => { ctx.andra(vag, text.value || undefined); if (/^#[0-9a-f]{6}$/i.test(text.value)) valjare.value = text.value; });
  return h('div', { class: 'farg' }, valjare, text,
    v && h('button', { type: 'button', class: 'lank', onclick: () => { ctx.andra(vag, undefined); ctx.ritaOm(); } }, 'Använd temats'));
}

function bildval(s, vag, kravd, ctx) {
  const v = hamta(ctx.data, vag);
  const typer = bildtyper(s);
  const bilder = ctx.bilder.filter((b) => typer.includes(b.fil.split('.').pop().toLowerCase().replace('jpeg', 'jpg')));
  const valj = (fil) => { ctx.andra(vag, fil); ctx.ritaOm(); };
  const accept = [...typer.map((t) => `.${t}${t === 'jpg' ? ',.jpeg' : ''}`), '.heic,.heif'].join(',');
  const fil = h('input', { type: 'file', accept, multiple: true, hidden: true,
    onchange: () => { ladda([...fil.files]); fil.value = ''; } });
  const ruta = h('div', { class: 'bildval' },
    !kravd && h('button', { type: 'button', class: 'bild ingen', 'aria-pressed': String(!v), onclick: () => valj(undefined) }, h('span', {}, 'Ingen')),
    bilder.map((b) => h('button', { type: 'button', class: 'bild', 'aria-pressed': String(v === b.fil), title: b.fil, onclick: () => valj(b.fil) },
      h('img', { src: ctx.bildUrl(b.fil), alt: '', loading: 'lazy' }), h('span', {}, b.fil))),
    v && !bilder.some((b) => b.fil === v) && h('span', { class: 'saknas' }, `${v} finns inte bland kundens bilder`),
    h('label', { class: 'bild ladda-upp', title: `${typer.join(', ')} eller HEIC. Stora bilder görs mindre.` }, fil, h('span', { class: 'plus' }, '+'), h('span', {}, 'Dra hit eller välj')));
  const ladda = taEmotBilder(ruta, typer, ctx, valj);
  return ruta;
}

/**
 * Bilder som släpps på el laddas upp och den första väljs. Servern gör om dem till ett format
 * fältet tar emot, så ett foto från iPhone (HEIC) går bra även där bara jpg, png eller webp godtas.
 */
function taEmotBilder(el, typer, ctx, valj) {
  const ladda = async (filer) => {
    let forsta;
    for (const f of filer) {
      const svar = await ctx.laddaUpp(f, typer);
      forsta ??= svar?.fil;
    }
    if (forsta) valj(forsta);
  };
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dra'); });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('dra'); });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('dra');
    if (e.dataTransfer.files.length) ladda([...e.dataTransfer.files]);
  });
  return ladda;
}

/** "Meny › Sektioner 1 › Rätter 2 › Pris" för en väg som "meny.sektioner.0.ratter.1.pris". */
export function vagNamn(schema, vag) {
  const namn = [];
  let s = schema;
  for (const k of vag.split('.')) {
    if (!s) break;
    if (/^\d+$/.test(k)) {
      s = Array.isArray(s.items) ? s.items[Number(k)] : s.items;
      // "Sektioner › Sektion 1" blir "Sektion 1".
      if (s && s.type === 'object') namn.splice(-1, 1, `${etikett(s).namn || 'Rad'} ${Number(k) + 1}`);
    } else {
      s = s.properties?.[k];
      if (s) namn.push(etikett(s).namn || k);
    }
  }
  return namn.join(' › ') || vag;
}
