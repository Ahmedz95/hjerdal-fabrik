// Chatten med Claude bredvid formuläret. Servern kör säljarens egen Claude Code
// (designer/claude.py), som fyller i kundfilen med Designers verktyg. Formuläret
// läses om när Claude har sparat, så att säljaren ser fälten fyllas i.
import { h } from './formular.js';
import { ikon } from './ikoner.js';

const FORSLAG = [
  { text: 'Fyll i från deras webbplats', fyll: 'Fyll i allt du kan från restaurangens webbplats: https://' },
  { text: 'Läs in menyn från en bild', bilaga: true, fyll: 'Lägg in menyn från bilden. Behåll rätternas namn och priser exakt som de står.' },
  { text: 'Skriv en Om oss-text', fyll: 'Skriv en kort Om oss-text utifrån det som står i kundfilen. Hitta inte på något.' },
  { text: 'Vad saknas?', fyll: 'Vad saknas innan sajten kan byggas? Svara med en kort lista.' },
];

/**
 * opt: { api, kund(): id, nyttData(): void, visaBygge(url): void, meddela(text, typ) }
 */
export function skapaChatt(opt) {
  const s = { status: null, meddelanden: [], arbetar: false, styr: null, bilagor: [], oppen: false };

  const flode = h('div', { class: 'chatt-flode', 'aria-live': 'polite' });
  const text = h('textarea', { rows: 1, placeholder: 'Skriv till Claude…', 'aria-label': 'Meddelande till Claude' });
  const filval = h('input', { type: 'file', multiple: true, hidden: true, accept: 'image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,.md,.csv' });
  const bilagerad = h('div', { class: 'chatt-bilagor' });
  const skickaKnapp = h('button', { type: 'submit', class: 'chatt-skicka', 'aria-label': 'Skicka' }, ikon('skicka', 18));
  const stoppKnapp = h('button', { type: 'button', class: 'chatt-skicka stopp', 'aria-label': 'Stoppa Claude', hidden: true, onclick: stoppa }, ikon('stopp', 18));
  const skriv = h('form', { class: 'chatt-skriv', onsubmit: (e) => { e.preventDefault(); skicka(); } },
    bilagerad, text,
    h('div', { class: 'chatt-rad' },
      h('button', { type: 'button', class: 'ikonknapp', title: 'Bifoga en bild eller pdf, till exempel menyn', 'aria-label': 'Bifoga', onclick: () => filval.click() }, ikon('gem', 18)),
      filval,
      h('span', { class: 'chatt-tips' }, 'Enter skickar'),
      skickaKnapp, stoppKnapp));
  const kropp = h('div', { class: 'chatt-kropp' }, flode, skriv);
  const el = h('aside', { class: 'chatt', id: 'chatt', 'aria-label': 'Claude' },
    h('header', { class: 'chatt-topp' },
      h('span', { class: 'chatt-marke' }, ikon('claude', 20)),
      h('div', { class: 'chatt-titel' }, h('strong', {}, 'Claude'), h('span', {}, 'Fyller i formuläret åt dig')),
      h('button', { type: 'button', class: 'ikonknapp', title: 'Ny konversation', 'aria-label': 'Ny konversation', onclick: nyKonversation }, ikon('ny', 18)),
      h('button', { type: 'button', class: 'ikonknapp', title: 'Stäng', 'aria-label': 'Stäng chatten', onclick: () => stang() }, ikon('stang', 18))),
    kropp);

  text.addEventListener('input', vaxText);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); skicka(); }
  });
  text.addEventListener('paste', (e) => {
    const filer = [...(e.clipboardData?.files ?? [])];
    if (filer.length) { e.preventDefault(); laddaUpp(filer); }
  });
  filval.addEventListener('change', () => { laddaUpp([...filval.files]); filval.value = ''; });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dra'); });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('dra'); });
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('dra'); laddaUpp([...e.dataTransfer.files]); });

  function vaxText() {
    text.style.height = 'auto';
    text.style.height = `${Math.min(text.scrollHeight, 220)}px`;
  }

  // --- Läget: installerad, inloggad, konversationen -------------------------------

  async function laddaKund() {
    // Byter säljaren kund medan Claude arbetar stoppar Claude. Det som redan är ändrat är sparat.
    if (s.arbetar) s.styr?.abort();
    const nr = (s.laddning = (s.laddning ?? 0) + 1);
    s.meddelanden = [];
    s.bilagor = [];
    ritaBilagor();
    if (!opt.kund()) return;
    let tidigare = [];
    try {
      tidigare = (await opt.api('GET', `kunder/${opt.kund()}/claude`)).meddelanden ?? [];
    } catch { /* ingen konversation än */ }
    if (nr !== s.laddning) return;
    if (s.arbetar) {
      // Säljaren hann skriva innan konversationen var laddad: lägg den tidigare konversationen före.
      s.meddelanden.unshift(...tidigare);
      flode.prepend(...tidigare.map(ritaMeddelande));
      return;
    }
    s.meddelanden = tidigare;
    ritaFlode();
  }

  async function kollaStatus(farsk = false) {
    try {
      s.status = await opt.api('GET', `claude${farsk ? '?farsk=1' : ''}`);
    } catch {
      s.status = { installerad: false, inloggad: false };
    }
    ritaLage();
    return s.status;
  }

  function ritaLage() {
    const redo = s.status?.installerad && s.status?.inloggad;
    if (redo) {
      // Flödet ritas bara om när det inte redan visas, så att ett svar som pågår aldrig försvinner.
      if (!kropp.contains(flode)) {
        kropp.replaceChildren(flode, skriv);
        if (!s.arbetar) ritaFlode();
      }
      return;
    }
    const steg = (nr, rubrik, text_, knapp) => h('li', {}, h('span', { class: 'steg' }, nr), h('div', {}, h('strong', {}, rubrik), h('p', {}, text_), knapp));
    kropp.replaceChildren(h('div', { class: 'chatt-koppla' },
      h('span', { class: 'chatt-stor-ikon' }, ikon('claude', 40)),
      h('h3', {}, 'Koppla in Claude'),
      h('p', {}, 'Chatten använder Claude Code på den här datorn, inloggad med ditt eget Claude-konto. Den går på ditt abonnemang, utan API-nyckel.'),
      s.status?.fel && h('p', { class: 'felrad' }, s.status.fel),
      h('ol', {},
        !s.status?.installerad && steg(1, 'Installera Claude Code', 'Terminal öppnas och installerar. Det tar någon minut.',
          h('button', { type: 'button', class: 'knapp litet', onclick: () => terminal('installera') }, 'Installera')),
        steg(s.status?.installerad ? 1 : 2, 'Logga in', 'Välj ditt Claude-konto i webbläsaren som öppnas, inte en API-nyckel.',
          h('button', { type: 'button', class: 'knapp litet', disabled: !s.status?.installerad, onclick: () => terminal('logga-in') }, 'Logga in'))),
      h('button', { type: 'button', class: 'knapp primar', onclick: () => kollaStatus(true) }, 'Jag är klar, kontrollera igen'),
      h('p', { class: 'hjalp' }, 'Du kan också använda Claude-appen. HJERDAL Designer finns bland dess verktyg om installationen kopplade in den.')));
  }

  async function terminal(vad) {
    try {
      await opt.api('POST', `claude/${vad}`);
      opt.meddela(vad === 'installera' ? 'Terminal installerar Claude Code. Logga in när den frågar.' : 'Logga in i webbläsaren som öppnas.');
    } catch (err) {
      opt.meddela(err.message, 'fel');
    }
  }

  // --- Flödet ------------------------------------------------------------------------

  function ritaFlode() {
    if (!s.meddelanden.length) {
      flode.replaceChildren(h('div', { class: 'chatt-tom' },
        h('span', { class: 'chatt-stor-ikon' }, ikon('claude', 36)),
        h('h3', {}, 'Vad vet du om restaurangen?'),
        h('p', {}, 'Skriv det kunden berättat, klistra in en länk eller bifoga en bild på menyn. Claude fyller i formuläret medan du tittar.'),
        h('div', { class: 'chatt-forslag' }, FORSLAG.map((f) => h('button', { type: 'button', onclick: () => anvandForslag(f) }, f.text)))));
      return;
    }
    flode.replaceChildren(...s.meddelanden.map(ritaMeddelande));
    rullaNer();
  }

  function anvandForslag(f) {
    text.value = f.fyll;
    vaxText();
    text.focus();
    text.setSelectionRange(text.value.length, text.value.length);
    if (f.bilaga) filval.click();
  }

  function ritaMeddelande(m) {
    if (m.roll === 'saljare') {
      return h('div', { class: 'msg du' },
        m.bilagor?.length ? h('div', { class: 'msg-bilagor' }, m.bilagor.map((b) => h('span', { class: 'bilaga' }, ikon('gem', 13), b))) : null,
        h('div', { class: 'bubbla' }, m.text));
    }
    const el = h('div', { class: 'msg claude' });
    if (m.verktyg?.length) el.append(h('div', { class: 'verktyg-lista' }, [...new Set(m.verktyg)].map((v) => verktygRad(v, 'klar'))));
    el.append(h('div', { class: 'msg-text' }, markdown(m.text)));
    if (m.fel) el.append(h('p', { class: 'msg-fel' }, m.fel));
    return el;
  }

  function verktygRad(text_, lage) {
    return h('div', { class: `verktyg ${lage}` }, h('span', { class: 'verktyg-ikon' }, lage === 'klar' ? ikon('bock', 13) : null), text_);
  }

  function rullaNer() {
    requestAnimationFrame(() => (flode.scrollTop = flode.scrollHeight));
  }

  // --- Skicka --------------------------------------------------------------------------

  async function skicka(fraga = text.value.trim(), bilagor) {
    if (!fraga || s.arbetar) return;
    if (!s.status) await kollaStatus();
    if (!s.status?.installerad || !s.status?.inloggad) { oppna(); return; }
    const bifogat = bilagor ?? s.bilagor.splice(0);
    ritaBilagor();
    text.value = '';
    vaxText();
    if (!s.meddelanden.length) flode.replaceChildren();
    const mig = { roll: 'saljare', text: fraga, bilagor: bifogat };
    const svar = { roll: 'claude', text: '', verktyg: [] };
    s.meddelanden.push(mig, svar);
    flode.append(ritaMeddelande(mig));
    const svarEl = h('div', { class: 'msg claude arbetar' });
    const lista = h('div', { class: 'verktyg-lista' });
    const textEl = h('div', { class: 'msg-text' }, h('span', { class: 'tanker' }, h('i'), h('i'), h('i')));
    svarEl.append(lista, textEl);
    flode.append(svarEl);
    rullaNer();
    arbeta(true);

    let senaste = null;
    const klarVerktyg = () => { if (senaste) { senaste.className = 'verktyg klar'; senaste.firstChild.replaceChildren(ikon('bock', 13)); } };
    try {
      s.styr = new AbortController();
      const res = await fetch(`/api/kunder/${opt.kund()}/claude`, {
        method: 'POST', signal: s.styr.signal,
        headers: { 'X-Hjerdal': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fraga, bilagor: bifogat }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).fel ?? `Fel ${res.status}`);
      const lasare = res.body.getReader();
      const avkoda = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await lasare.read();
        if (done) break;
        buf += avkoda.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const rad = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!rad.trim()) continue;
          const hand = JSON.parse(rad);
          if (hand.typ === 'text') {
            klarVerktyg();
            senaste = null;
            svar.text += hand.text;
            textEl.replaceChildren(markdown(svar.text));
          } else if (hand.typ === 'verktyg') {
            klarVerktyg();
            svar.verktyg.push(hand.text);
            senaste = verktygRad(hand.text, 'pagar');
            lista.append(senaste);
          } else if (hand.typ === 'verktyg-fel') {
            if (senaste) senaste.className = 'verktyg misslyckad';
            senaste = null;
          } else if (hand.typ === 'andrad') {
            klarVerktyg();
            opt.nyttData();
          } else if (hand.typ === 'byggd') {
            klarVerktyg();
            svarEl.append(h('button', { type: 'button', class: 'knapp litet', onclick: () => opt.visaBygge(`/visa/${opt.kund()}/`) }, ikon('visa', 15), 'Visa förhandsvisningen'));
          } else if (hand.typ === 'fel') {
            svar.fel = hand.text;
            svarEl.append(h('p', { class: 'msg-fel' }, hand.text));
            if (/inte inloggad|installerad/.test(hand.text)) kollaStatus(true);
          }
          rullaNer();
        }
      }
      klarVerktyg();
    } catch (err) {
      if (err.name === 'AbortError') {
        svarEl.append(h('p', { class: 'msg-not' }, 'Stoppad.'));
      } else {
        svar.fel = err.message;
        svarEl.append(h('p', { class: 'msg-fel' }, err.message));
      }
    } finally {
      if (!svar.text) textEl.remove();
      svarEl.classList.remove('arbetar');
      s.styr = null;
      arbeta(false);
      rullaNer();
      text.focus();
    }
  }

  async function stoppa() {
    s.styr?.abort();
    await opt.api('POST', `kunder/${opt.kund()}/claude/stoppa`).catch(() => {});
  }

  function arbeta(ja) {
    s.arbetar = ja;
    skickaKnapp.hidden = ja;
    stoppKnapp.hidden = !ja;
    el.classList.toggle('arbetar', ja);
  }

  async function nyKonversation() {
    if (s.arbetar) await stoppa();
    await opt.api('DELETE', `kunder/${opt.kund()}/claude`).catch(() => {});
    s.meddelanden = [];
    s.bilagor = [];
    ritaBilagor();
    ritaFlode();
    text.focus();
  }

  // --- Bilagor --------------------------------------------------------------------------

  async function laddaUpp(filer) {
    for (const fil of filer) {
      try {
        const svar = await opt.api('POST', `kunder/${opt.kund()}/claude/bilagor?namn=${encodeURIComponent(fil.name || 'bild.png')}`, fil);
        s.bilagor.push(svar.fil);
      } catch (err) {
        opt.meddela(err.message, 'fel');
      }
    }
    ritaBilagor();
    text.focus();
  }

  function ritaBilagor() {
    bilagerad.replaceChildren(...s.bilagor.map((b, i) => h('span', { class: 'bilaga' }, ikon('gem', 13), b,
      h('button', { type: 'button', 'aria-label': `Ta bort ${b}`, onclick: () => { s.bilagor.splice(i, 1); ritaBilagor(); } }, '×'))));
  }

  // --- Visa och dölj -----------------------------------------------------------------------

  function oppna() {
    s.oppen = true;
    document.body.classList.add('med-chatt');
    try { localStorage.setItem('hjerdal-chatt', '1'); } catch { /* privat läge */ }
    if (!s.status) kollaStatus();
    setTimeout(() => text.focus(), 50);
  }

  function stang() {
    s.oppen = false;
    document.body.classList.remove('med-chatt');
    try { localStorage.setItem('hjerdal-chatt', '0'); } catch { /* privat läge */ }
  }

  return {
    el,
    oppna,
    stang,
    vaxla: () => (s.oppen ? stang() : oppna()),
    laddaKund,
    skicka: (fraga) => { oppna(); return skicka(fraga); },
    get oppen() { return s.oppen; },
    get arbetar() { return s.arbetar; },
  };
}

// --- Claudes svar som text ----------------------------------------------------------------
// Stycken, listor, fet stil, kod och länkar. Byggs som element, aldrig som HTML.

function markdown(text) {
  // Rad för rad: rader i följd blir ett stycke, punkter i följd en lista och en rubrik fet text.
  const ut = document.createDocumentFragment();
  const punkt = /^\s*([-*•]|\d+[.)])\s+/;
  let stycke = null;
  let lista = null;
  for (const rad of text.split('\n')) {
    if (!rad.trim()) { stycke = lista = null; continue; }
    if (punkt.test(rad)) {
      const numrerad = /^\s*\d/.test(rad);
      if (!lista || (lista.tagName === 'OL') !== numrerad) ut.append((lista = h(numrerad ? 'ol' : 'ul')));
      lista.append(h('li', {}, inline(rad.replace(punkt, ''))));
      stycke = null;
    } else if (/^#{1,4}\s/.test(rad)) {
      ut.append(h('p', {}, h('strong', {}, inline(rad.replace(/^#+\s*/, '')))));
      stycke = lista = null;
    } else {
      if (stycke) stycke.append(h('br'));
      else ut.append((stycke = h('p')));
      stycke.append(...inline(rad));
      lista = null;
    }
  }
  return ut;
}

function inline(text) {
  const delar = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;
  let senast = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > senast) delar.push(text.slice(senast, m.index));
    if (m[1]) delar.push(h('strong', {}, m[1]));
    else if (m[2]) delar.push(h('code', {}, m[2]));
    else delar.push(lank(m[3] ?? m[5], m[4] ?? m[5]));
    senast = m.index + m[0].length;
  }
  if (senast < text.length) delar.push(text.slice(senast));
  return delar;
}

function lank(text, url) {
  // Länkar till förhandsvisningen öppnas i Designer i stället för i en ny flik.
  const lokal = url.startsWith(location.origin);
  return h('a', { href: url, target: lokal ? null : '_blank', rel: 'noopener', onclick: lokal ? (e) => {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('hjerdal-visa', { detail: new URL(url).pathname }));
  } : null }, text);
}
