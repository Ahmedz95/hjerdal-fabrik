// Startsidans natt: regn, en stadssiluett med tända fönster och suddiga skyltar
// långt bort. Ritas på en canvas bakom texten. Står still med minskad rörelse och
// när besökaren pausar, och ritar bara när överdelen syns. Staden och skyltarna
// ritas en gång; varje bild ritar bara om dem och flyttar dropparna.
import { stilla, narRorelsenAndras } from './rorelse';

const RGB = { sakura: '255,61,139', cyan: '63,224,255', broth: '243,182,92' };
const TECKEN = 'ラーメン夜豚骨味噌大阪東京麺';
const BILD_MS = 1000 / 30;

type Droppe = { x: number; y: number; l: number; v: number; rosa: boolean };
type Skylt = { x: number; y: number; r: number; fas: number; bild: HTMLCanvasElement };

export function startaRegn(cv: HTMLCanvasElement) {
  const x = cv.getContext('2d');
  if (!x) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let droppar: Droppe[] = [];
  let skyltar: Skylt[] = [];
  let stad: HTMLCanvasElement | undefined;
  let synlig = true;
  let igang = false;
  let senast = 0;

  /** En skylt långt bort: ett sken och ett tecken, ritat en gång med full styrka. */
  function skyltBild(r: number, rgb: string, tecken: string) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(r * 2 * dpr);
    const k = c.getContext('2d')!;
    k.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = k.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    k.fillStyle = g;
    k.fillRect(0, 0, r * 2, r * 2);
    k.font = `700 ${Math.round(r * 0.5)}px "Shippori Mincho B1", serif`;
    k.fillStyle = `rgba(${rgb},.9)`;
    k.fillText(tecken, r * 0.8, r * 1.15);
    return c;
  }

  function skyltarna() {
    const farger = [RGB.sakura, RGB.cyan, RGB.broth];
    skyltar = Array.from({ length: Math.round(W / 150) + 3 }, (_, i) => {
      const r = 40 + Math.random() * 120;
      const rgb = farger[Math.random() < 0.5 ? 0 : Math.random() < 0.6 ? 1 : 2];
      return { x: Math.random() * W, y: Math.random() * H * 0.85, r, fas: Math.random() * 6, bild: skyltBild(r, rgb, TECKEN[i % TECKEN.length]) };
    });
  }

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
    skyltarna();
  }

  function rita(t: number, flytta: boolean) {
    x!.clearRect(0, 0, W, H);
    for (const s of skyltar) {
      x!.globalAlpha = 0.1 + 0.06 * Math.sin(t / 900 + s.fas);
      x!.drawImage(s.bild, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    x!.globalAlpha = 1;
    if (stad) x!.drawImage(stad, 0, 0, W, H);
    x!.lineWidth = 1;
    for (const rosa of [false, true]) {
      x!.strokeStyle = rosa ? 'rgba(255,61,139,.35)' : 'rgba(170,190,255,.16)';
      x!.beginPath();
      for (const d of droppar) {
        if (d.rosa !== rosa) continue;
        x!.moveTo(d.x, d.y);
        x!.lineTo(d.x - d.l * 0.18, d.y + d.l);
      }
      x!.stroke();
    }
    if (!flytta) return;
    for (const d of droppar) {
      d.y += d.v;
      d.x -= d.v * 0.18;
      if (d.y > H) {
        d.y = -d.l;
        d.x = Math.random() * W * 1.1;
      }
    }
  }

  function bild(t: number) {
    if (!synlig || stilla()) {
      igang = false;
      return;
    }
    if (t - senast >= BILD_MS) {
      senast = t;
      rita(t, true);
    }
    requestAnimationFrame(bild);
  }
  const kor = () => {
    if (stilla()) return rita(0, false);
    if (igang || !synlig) return;
    igang = true;
    requestAnimationFrame(bild);
  };

  storlek();
  rita(0, false);
  // Skyltarnas tecken ritas om när typsnittet har kommit.
  document.fonts?.ready.then(() => {
    skyltarna();
    if (stilla()) rita(0, false);
  });
  // I mobilen ändras höjden när adressfältet visas och döljs; då behöver staden inte ritas om.
  let vantar: number | undefined;
  addEventListener('resize', () => {
    clearTimeout(vantar);
    vantar = window.setTimeout(() => {
      if (Math.abs(cv.getBoundingClientRect().width - W) < 1) return;
      storlek();
      rita(0, false);
    }, 150);
  });
  new IntersectionObserver(([e]) => {
    synlig = e.isIntersecting;
    kor();
  }).observe(cv);
  narRorelsenAndras(kor);
  kor();
}
