// Ånga som stiger ur skålarna på fotona. Varje canvas har var ångan börjar
// (data-ox, data-oy) och hur bred den är (data-spread), som andelar av fotot.
// Står still med minskad rörelse och när besökaren pausar, och ritar bara när
// fotot syns.
import { stilla, narRorelsenAndras } from './rorelse';

type Puff = { x: number; p: number; r: number; s: number; fas: number };

export function startaAnga(cv: HTMLCanvasElement) {
  const x = cv.getContext('2d');
  if (!x || cv.dataset.startad) return;
  cv.dataset.startad = '1';
  const ox = Number(cv.dataset.ox);
  const oy = Number(cv.dataset.oy);
  const spread = Number(cv.dataset.spread);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let puffar: Puff[] = [];
  let synlig = false;
  let igang = false;

  function storlek() {
    const r = cv.getBoundingClientRect();
    W = r.width;
    H = r.height;
    cv.width = W * dpr;
    cv.height = H * dpr;
    x!.setTransform(dpr, 0, 0, dpr, 0, 0);
    puffar = Array.from({ length: 34 }, () => ({
      x: (ox + (Math.random() - 0.5) * spread) * W, p: Math.random(), r: (0.05 + Math.random() * 0.08) * W, s: 0.35 + Math.random() * 0.6, fas: Math.random() * 6,
    }));
  }

  function rita(t: number) {
    x!.clearRect(0, 0, W, H);
    // screen i stället för lighter, så att puffarna inte summeras till en vit lampa.
    x!.globalCompositeOperation = 'screen';
    for (const f of puffar) {
      const p = (f.p + (t / 9000) * f.s) % 1;
      const y = oy * H - p * oy * H * 1.05;
      const px = f.x + Math.sin(p * 5 + f.fas) * W * 0.05 * p;
      const r = f.r * (1 + p * 1.8);
      const a = Math.sin(p * Math.PI) * 0.11;
      const g = x!.createRadialGradient(px, y, 0, px, y, r);
      g.addColorStop(0, `rgba(255,244,232,${a})`);
      g.addColorStop(0.6, `rgba(255,220,235,${a * 0.45})`);
      g.addColorStop(1, 'rgba(255,244,232,0)');
      x!.fillStyle = g;
      x!.beginPath();
      x!.arc(px, y, r, 0, Math.PI * 2);
      x!.fill();
    }
    x!.globalCompositeOperation = 'source-over';
  }

  // Tiden står still medan ångan är pausad, så att den fortsätter där den var.
  let tid = 0;
  let forra: number | undefined;
  function bild(t: number) {
    if (!synlig || stilla()) {
      igang = false;
      forra = undefined;
      return;
    }
    tid += forra === undefined ? 0 : Math.min(t - forra, 100);
    forra = t;
    rita(tid);
    requestAnimationFrame(bild);
  }
  const kor = () => {
    if (synlig && !igang && !stilla()) {
      igang = true;
      requestAnimationFrame(bild);
    }
  };

  storlek();
  rita(0);
  let vantar: number | undefined;
  addEventListener('resize', () => {
    clearTimeout(vantar);
    vantar = window.setTimeout(() => {
      if (Math.abs(cv.getBoundingClientRect().width - W) < 1) return;
      storlek();
      rita(tid);
    }, 150);
  });
  new IntersectionObserver(([e]) => {
    synlig = e.isIntersecting;
    kor();
  }).observe(cv);
  narRorelsenAndras(kor);
}
