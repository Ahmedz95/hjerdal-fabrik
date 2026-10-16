// Startsidans natt: regn, en stadssiluett med tända fönster och suddiga skyltar
// långt bort. Ritas bakom texten. Står still med minskad rörelse och när besökaren
// pausar, och ritar bara när överdelen syns.
//
// Tre canvasar ovanpå varandra, så att ingen bild blir tung att rita på en långsam
// telefon: skyltarna längst bak i halv upplösning (de är suddiga ändå), som pulserar
// åtta gånger i sekunden; staden, som ritas en gång; och regnet överst, 30 gånger i
// sekunden, i andra bilder än skyltarna.
import { stilla, narRorelsenAndras } from './rorelse';

const RGB = { sakura: '255,61,139', cyan: '63,224,255', broth: '243,182,92' };
const TECKEN = 'ラーメン夜豚骨味噌大阪東京麺';
const BILD_MS = 1000 / 30;
const SKYLT_MS = 1000 / 8;
const SKYLT_SKALA = 0.5;

type Droppe = { x: number; y: number; l: number; v: number; rosa: boolean };
type Skylt = { x: number; y: number; r: number; fas: number; bild: HTMLCanvasElement };

export function startaRegn(cv: HTMLCanvasElement) {
  const lager = () => {
    const c = cv.cloneNode() as HTMLCanvasElement;
    c.removeAttribute('data-regn');
    return c;
  };
  const skyltCv = lager();
  const stadCv = lager();
  cv.before(skyltCv, stadCv);
  const x = cv.getContext('2d');
  const sk = skyltCv.getContext('2d');
  const st = stadCv.getContext('2d');
  if (!x || !sk || !st) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let droppar: Droppe[] = [];
  let skyltar: Skylt[] = [];
  let synlig = true;
  let igang = false;
  let senast = 0;
  let senastSkylt = 0;

  /** En skylt långt bort: ett sken och ett tecken, ritat en gång med full styrka. */
  function skyltBild(r: number, rgb: string, tecken: string) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(r * 2 * SKYLT_SKALA);
    const k = c.getContext('2d')!;
    k.setTransform(SKYLT_SKALA, 0, 0, SKYLT_SKALA, 0, 0);
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

  /** Husen i två lager, med tända fönster. Ritas en gång per storlek. */
  function staden() {
    st!.clearRect(0, 0, W, H);
    for (let bakre = 0; bakre < 2; bakre++) {
      let bx = -20;
      while (bx < W) {
        const bw = 40 + Math.random() * 90;
        const bh = H * (bakre ? 0.25 + Math.random() * 0.35 : 0.4 + Math.random() * 0.4);
        st!.fillStyle = bakre ? '#0F0F1A' : '#0B0B14';
        st!.fillRect(bx, H - bh, bw, bh);
        for (let wy = H - bh + 10; wy < H - 6; wy += 9) {
          for (let wx = bx + 6; wx < bx + bw - 6; wx += 8) {
            if (Math.random() < 0.16) {
              st!.fillStyle = Math.random() < 0.7 ? 'rgba(160,190,255,.22)' : 'rgba(243,182,92,.3)';
              st!.fillRect(wx, wy, 3, 4);
            }
          }
        }
        bx += bw + (bakre ? 6 : 14);
      }
    }
  }

  function storlek() {
    const r = cv.getBoundingClientRect();
    W = r.width;
    H = r.height;
    for (const [c, k, skala] of [[cv, x, dpr], [stadCv, st, dpr], [skyltCv, sk, SKYLT_SKALA]] as const) {
      c.width = W * skala;
      c.height = H * skala;
      k!.setTransform(skala, 0, 0, skala, 0, 0);
    }
    droppar = Array.from({ length: Math.round(W / 9) }, () => ({
      x: Math.random() * W, y: Math.random() * H, l: 8 + Math.random() * 22, v: 5 + Math.random() * 9, rosa: Math.random() < 0.18,
    }));
    staden();
    skyltarna();
  }

  function ritaSkyltar(t: number) {
    sk!.clearRect(0, 0, W, H);
    for (const s of skyltar) {
      sk!.globalAlpha = 0.1 + 0.06 * Math.sin(t / 900 + s.fas);
      sk!.drawImage(s.bild, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    sk!.globalAlpha = 1;
  }

  function ritaRegnet(flytta: boolean) {
    x!.clearRect(0, 0, W, H);
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
      ritaRegnet(true);
    } else if (t - senastSkylt >= SKYLT_MS) {
      senastSkylt = t;
      ritaSkyltar(t);
    }
    requestAnimationFrame(bild);
  }
  const stillbild = () => {
    ritaSkyltar(0);
    ritaRegnet(false);
  };
  const kor = () => {
    if (stilla()) return stillbild();
    if (igang || !synlig) return;
    igang = true;
    requestAnimationFrame(bild);
  };

  storlek();
  stillbild();
  // Skyltarnas tecken ritas om när typsnittet har kommit.
  document.fonts?.ready.then(() => {
    skyltarna();
    if (stilla()) ritaSkyltar(0);
  });
  // I mobilen ändras höjden när adressfältet visas och döljs; då behöver staden inte ritas om.
  let vantar: number | undefined;
  addEventListener('resize', () => {
    clearTimeout(vantar);
    vantar = window.setTimeout(() => {
      if (Math.abs(cv.getBoundingClientRect().width - W) < 1) return;
      storlek();
      stillbild();
    }, 150);
  });
  new IntersectionObserver(([e]) => {
    synlig = e.isIntersecting;
    kor();
  }).observe(cv);
  narRorelsenAndras(kor);
  kor();
}
