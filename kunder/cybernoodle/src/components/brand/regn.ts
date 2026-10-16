// Startsidans natt: regn, en stadssiluett med tända fönster och suddiga skyltar
// långt bort. Ritas på en canvas bakom texten. Står still med minskad rörelse,
// och ritar bara när överdelen syns.

const RGB = { sakura: '255,61,139', cyan: '63,224,255', broth: '243,182,92' };
const TECKEN = 'ラーメン夜豚骨味噌大阪東京麺';

type Droppe = { x: number; y: number; l: number; v: number; rosa: boolean };
type Skylt = { x: number; y: number; r: number; rgb: string; tecken: string; fas: number };

export function startaRegn(cv: HTMLCanvasElement) {
  const x = cv.getContext('2d');
  if (!x) return;
  const stilla = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let droppar: Droppe[] = [];
  let skyltar: Skylt[] = [];
  let stad: HTMLCanvasElement | undefined;
  let synlig = true;
  let igang = false;

  function storlek() {
    const r = cv.getBoundingClientRect();
    W = r.width;
    H = r.height;
    cv.width = W * dpr;
    cv.height = H * dpr;
    x!.setTransform(dpr, 0, 0, dpr, 0, 0);
    droppar = Array.from({ length: Math.round(W / 9) }, () => ({
      x: Math.random() * W, y: Math.random() * H, l: 8 + Math.random() * 22, v: 5 + Math.random() * 9, rosa: Math.random() < 0.18,
    }));
    // Husen ritas en gång på en egen canvas, i två lager.
    stad = document.createElement('canvas');
    stad.width = W * dpr;
    stad.height = H * dpr;
    const k = stad.getContext('2d')!;
    k.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let lager = 0; lager < 2; lager++) {
      let bx = -20;
      while (bx < W) {
        const bw = 40 + Math.random() * 90;
        const bh = H * (lager ? 0.25 + Math.random() * 0.35 : 0.4 + Math.random() * 0.4);
        k.fillStyle = lager ? '#0F0F1A' : '#0B0B14';
        k.fillRect(bx, H - bh, bw, bh);
        for (let wy = H - bh + 10; wy < H - 6; wy += 9) {
          for (let wx = bx + 6; wx < bx + bw - 6; wx += 8) {
            if (Math.random() < 0.16) {
              k.fillStyle = Math.random() < 0.7 ? 'rgba(160,190,255,.22)' : 'rgba(243,182,92,.3)';
              k.fillRect(wx, wy, 3, 4);
            }
          }
        }
        bx += bw + (lager ? 6 : 14);
      }
    }
    const farger = [RGB.sakura, RGB.cyan, RGB.broth];
    skyltar = Array.from({ length: Math.round(W / 150) + 3 }, (_, i) => ({
      x: Math.random() * W, y: Math.random() * H * 0.85, r: 40 + Math.random() * 120,
      rgb: farger[Math.random() < 0.5 ? 0 : Math.random() < 0.6 ? 1 : 2], tecken: TECKEN[i % TECKEN.length], fas: Math.random() * 6,
    }));
  }

  function rita(t: number) {
    x!.clearRect(0, 0, W, H);
    for (const s of skyltar) {
      const a = 0.1 + 0.06 * Math.sin(t / 900 + s.fas);
      const g = x!.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, `rgba(${s.rgb},${a})`);
      g.addColorStop(1, `rgba(${s.rgb},0)`);
      x!.fillStyle = g;
      x!.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
      x!.font = `700 ${Math.round(s.r * 0.5)}px "Shippori Mincho B1", serif`;
      x!.fillStyle = `rgba(${s.rgb},${a * 0.9})`;
      x!.fillText(s.tecken, s.x - s.r * 0.2, s.y + s.r * 0.15);
    }
    if (stad) x!.drawImage(stad, 0, 0, W, H);
    x!.lineWidth = 1;
    for (const d of droppar) {
      x!.strokeStyle = d.rosa ? 'rgba(255,61,139,.35)' : 'rgba(170,190,255,.16)';
      x!.beginPath();
      x!.moveTo(d.x, d.y);
      x!.lineTo(d.x - d.l * 0.18, d.y + d.l);
      x!.stroke();
      if (stilla) continue;
      d.y += d.v;
      d.x -= d.v * 0.18;
      if (d.y > H) {
        d.y = -d.l;
        d.x = Math.random() * W * 1.1;
      }
    }
  }

  function bild(t: number) {
    if (!synlig || stilla) {
      igang = false;
      return;
    }
    rita(t);
    requestAnimationFrame(bild);
  }
  const kor = () => {
    if (stilla) return rita(0);
    if (igang || !synlig) return;
    igang = true;
    requestAnimationFrame(bild);
  };

  storlek();
  rita(0);
  let vantar: number | undefined;
  addEventListener('resize', () => {
    clearTimeout(vantar);
    vantar = window.setTimeout(() => {
      storlek();
      rita(0);
    }, 150);
  });
  new IntersectionObserver(([e]) => {
    synlig = e.isIntersecting;
    kor();
  }).observe(cv);
  kor();
}
