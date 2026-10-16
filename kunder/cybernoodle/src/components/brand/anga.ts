// Ånga som stiger ur skålarna på fotona. Varje canvas har var ångan börjar
// (data-ox, data-oy) och hur bred den är (data-spread), som andelar av fotot.
// Står still med minskad rörelse, och ritar bara när fotot syns.

type Puff = { x: number; p: number; r: number; s: number; fas: number };

export function startaAnga(cv: HTMLCanvasElement) {
  const x = cv.getContext('2d');
  if (!x || cv.dataset.startad) return;
  cv.dataset.startad = '1';
  const stilla = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    x!.globalCompositeOperation = 'lighter';
    for (const f of puffar) {
      const p = stilla ? f.p : (f.p + (t / 9000) * f.s) % 1;
      const y = oy * H - p * oy * H * 1.05;
      const px = f.x + Math.sin(p * 5 + f.fas) * W * 0.05 * p;
      const r = f.r * (1 + p * 1.8);
      const a = Math.sin(p * Math.PI) * 0.16;
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

  function bild(t: number) {
    if (!synlig || stilla) {
      igang = false;
      return;
    }
    rita(t);
    requestAnimationFrame(bild);
  }

  storlek();
  rita(0);
  addEventListener('resize', () => {
    storlek();
    rita(0);
  });
  new IntersectionObserver(([e]) => {
    synlig = e.isIntersecting;
    if (synlig && !igang && !stilla) {
      igang = true;
      requestAnimationFrame(bild);
    }
  }).observe(cv);
}
