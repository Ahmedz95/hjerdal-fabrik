// Det som rör sig av sig självt: regnet, ångan och neonets flimmer. Med minskad
// rörelse står det still från början, och knappen Pausa rörelsen i första
// skärmen stoppar det för alla andra (WCAG 2.2.2). Flimret stoppas av CSS när
// rutan är ikryssad, också utan JavaScript; regnet och ångan lyssnar här.

const minskad = matchMedia('(prefers-reduced-motion: reduce)');
const pausad = () => Boolean(document.querySelector<HTMLInputElement>('[data-paus]')?.checked);

/** Sant när inget får röra sig. */
export const stilla = () => minskad.matches || pausad();

/** Kör fn när besökaren pausar eller startar rörelsen. */
export function narRorelsenAndras(fn: () => void) {
  document.querySelector('[data-paus]')?.addEventListener('change', fn);
  minskad.addEventListener('change', fn);
}
