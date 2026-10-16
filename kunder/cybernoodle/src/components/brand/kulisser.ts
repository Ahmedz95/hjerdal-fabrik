// Köksadmin i webbläsaren. En ändring skrivs på alla ställen som visar rätten
// (data-ratt): kortet i menyn, raden på skärmen och raden i QR-menyn. Inget
// sparas och inget skickas; sidan visar kvällens riktiga meny igen när den laddas om.

type Ratt = { id: string; namn: string; sektion: string; pris?: number; prisText?: string; slut: boolean; stark: boolean };
type Data = { special: string; sektioner: string[]; ratter: Ratt[] };

const kr = (n: number) => `${n.toLocaleString('sv-SE')} kr`;
const prisPa = (r: Ratt) => (r.pris !== undefined ? kr(r.pris) : (r.prisText ?? ''));

function glitch(el: HTMLElement) {
  el.classList.remove('cn-glitch');
  void el.offsetWidth;
  el.classList.add('cn-glitch');
}

export function startaKulisser() {
  const kalla = document.getElementById('cn-meny-data');
  const panel = document.querySelector<HTMLElement>('[data-panel]');
  if (!kalla?.textContent || !panel) return;
  const start = JSON.parse(kalla.textContent) as Data;
  const kopia = () => JSON.parse(JSON.stringify(start)) as Data;
  let lage = kopia();
  const ratt = (id: string) => lage.ratter.find((r) => r.id === id)!;

  const falt = panel.querySelector<HTMLFieldSetElement>('[data-redigera]')!;
  falt.disabled = false;
  const specialIn = panel.querySelector<HTMLTextAreaElement>('[data-falt="special"]')!;

  function ritaRatt(r: Ratt) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-ratt="${r.id}"]`)) {
      el.classList.toggle('slut', r.slut);
      const stampel = el.querySelector<HTMLElement>('[data-stampel]');
      if (stampel) stampel.hidden = !r.slut;
      el.querySelector('[data-pris]')?.replaceChildren(prisPa(r));
      el.querySelector('[data-pris-tal]')?.replaceChildren(r.pris !== undefined ? String(r.pris) : (r.prisText ?? ''));
      el.querySelector('[data-pris-mobil]')?.replaceChildren(r.slut ? 'Slut' : prisPa(r));
      glitch(el);
    }
  }

  function ritaSpecial() {
    const text = lage.special.trim();
    for (const el of document.querySelectorAll<HTMLElement>('[data-special-text]')) {
      el.textContent = text || 'Ingen special i kväll';
      glitch(el);
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-special-tv]')) {
      el.textContent = `★ ${text || 'Ingen special i kväll'}`;
      glitch(el);
    }
    for (const ruta of document.querySelectorAll<HTMLElement>('[data-special-ruta]')) {
      ruta.hidden = !text;
      if (text) glitch(ruta);
    }
  }

  // Panelens fält följer läget, efter ett snabbval.
  function ritaPanel() {
    for (const r of lage.ratter) {
      const pris = panel!.querySelector<HTMLInputElement>(`[data-id="${r.id}"][data-falt="pris"]`);
      if (pris && r.pris !== undefined) {
        pris.value = String(r.pris);
        markeraPris(pris, true);
      }
      const slut = panel!.querySelector<HTMLInputElement>(`[data-id="${r.id}"][data-falt="slut"]`);
      if (slut) slut.checked = r.slut;
    }
    specialIn.value = lage.special;
  }

  const toast = document.querySelector<HTMLElement>('[data-toast]');
  const meddelande = document.querySelector<HTMLElement>('[data-meddelande]');
  let toastTimer: number | undefined;
  const pingTimers = new Map<Element, number>();

  /** vad syns i toasten; lasas, om det finns, läses upp i stället och säger mer. */
  function uppdatera(andrade: string[], vad: string, lasas = vad) {
    const t0 = performance.now();
    for (const id of andrade) {
      if (id === 'special') ritaSpecial();
      else ritaRatt(ratt(id));
    }
    const ms = Math.max(1, Math.round(performance.now() - t0));
    for (const el of document.querySelectorAll('[data-ping]')) {
      el.classList.add('on');
      clearTimeout(pingTimers.get(el));
      pingTimers.set(el, window.setTimeout(() => el.classList.remove('on'), 1600));
    }
    if (meddelande) meddelande.textContent = `${lasas}. Menyn, QR-menyn och skärmen är ändrade.`;
    if (toast) {
      toast.textContent = `${vad} · Hemsida, QR-meny och skärm uppdaterade på ${ms} ms`;
      toast.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove('on'), 2600);
    }
  }

  // Ett pris gäller när man har skrivit klart: efter en kort paus, eller när fältet lämnas.
  const prisFel = panel.querySelector<HTMLElement>('[data-pris-fel]')!;
  function markeraPris(el: HTMLInputElement, giltigt: boolean) {
    if (giltigt) {
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
    } else {
      el.setAttribute('aria-invalid', 'true');
      el.setAttribute('aria-describedby', prisFel.id);
    }
    // Felet står under raden som är fel, eller under den första om flera är det.
    const fel = panel!.querySelector('[data-falt="pris"][aria-invalid]');
    if (fel) fel.closest('.cn-rad')!.after(prisFel);
    prisFel.hidden = !fel;
  }
  const prisTimers = new Map<string, number>();
  function sattPris(el: HTMLInputElement) {
    const id = el.dataset.id!;
    clearTimeout(prisTimers.get(id));
    const v = Number(el.value);
    const giltigt = el.value.trim() !== '' && Number.isInteger(v) && v >= 0 && v <= 999;
    markeraPris(el, giltigt);
    const r = ratt(id);
    if (!giltigt || r.pris === v) return;
    r.pris = v;
    uppdatera([id], `${r.namn}: ${kr(v)}`);
  }
  falt.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (!el.dataset.id || el.dataset.falt !== 'pris') return;
    clearTimeout(prisTimers.get(el.dataset.id));
    prisTimers.set(el.dataset.id, window.setTimeout(() => sattPris(el), 600));
  });
  falt.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    const id = el.dataset.id;
    if (id && el.dataset.falt === 'pris') return sattPris(el);
    if (!id || el.dataset.falt !== 'slut') return;
    const r = ratt(id);
    r.slut = el.checked;
    uppdatera([id], `${r.namn}: ${r.slut ? 'slut i kväll' : 'tillbaka på menyn'}`);
  });
  let specialTimer: number | undefined;
  specialIn.addEventListener('input', () => {
    clearTimeout(specialTimer);
    specialTimer = window.setTimeout(() => {
      lage.special = specialIn.value;
      uppdatera(['special'], 'Ny special');
    }, 350);
  });

  // Snabbvalen väljer rätterna ur menyn, så att de fungerar när menyn ändras.
  const forsta = lage.sektioner[0];
  const sista = lage.sektioner.at(-1);
  panel.querySelector('[data-snabb="rusning"]')?.addEventListener('click', () => {
    const mat = lage.ratter.filter((r) => r.sektion === forsta && !r.slut);
    const dyrast = [...mat].sort((a, b) => (b.pris ?? 0) - (a.pris ?? 0))[0];
    const smatt = lage.ratter.find((r) => r.sektion === lage.sektioner[1] && !r.slut) ?? mat.find((r) => r !== dyrast);
    const tips = mat.find((r) => r.stark && r !== dyrast) ?? mat.find((r) => r !== dyrast && r !== smatt);
    const slut = [dyrast, smatt].filter((r): r is Ratt => Boolean(r));
    if (!slut.length) return;
    for (const r of slut) r.slut = true;
    const namn = slut.map((r) => r.namn).join(' och ');
    lage.special = `Fredagsrusning: ${namn} är slut.${tips ? ` Prova ${tips.namn} i stället.` : ''}`;
    ritaPanel();
    uppdatera([...slut.map((r) => r.id), 'special'], 'Fredagsrusning', `Fredagsrusning: ${namn} är slut i kväll`);
  });
  panel.querySelector('[data-snabb="happy"]')?.addEventListener('click', () => {
    const dryck = lage.ratter.filter((r) => lage.sektioner.length > 1 && r.sektion === sista && r.pris !== undefined);
    if (!dryck.length) return;
    for (const r of dryck) r.pris = Math.round((start.ratter.find((s) => s.id === r.id)!.pris ?? 0) * 0.85);
    lage.special = 'Happy hour 17–19: alla drycker 15 % billigare. Kampai!';
    ritaPanel();
    uppdatera([...dryck.map((r) => r.id), 'special'], 'Happy hour', 'Happy hour: drycken 15 procent billigare');
  });
  panel.querySelector('[data-snabb="aterstall"]')?.addEventListener('click', () => {
    lage = kopia();
    ritaPanel();
    uppdatera([...lage.ratter.map((r) => r.id), 'special'], 'Menyn återställd');
  });

  // Klockan på skärmen.
  const klocka = () => {
    const nu = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    for (const el of document.querySelectorAll('[data-klocka]')) el.textContent = nu;
  };
  klocka();
  setInterval(klocka, 20000);
}
