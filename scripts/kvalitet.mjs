// Webbläsarkontrollen i kvalitetsgrinden (quality/STANDARD.md). Öppnar varje sida i en
// byggd sajt i Chrome, i mobil och dator, och stoppar om något av det här händer:
//
//   - sidan går att scrolla i sidled, i 360 eller 390 px bredd eller på datorn
//   - fel i konsolen, eller ett skript som kraschar
//   - en fil som inte finns (bild, typsnitt, skript) eller en länk inom sajten som inte leder någonstans
//   - en bild som inte går att visa
//   - sidan hämtar något från en annan webbplats medan den laddas (typsnitt, skript, spårning)
//   - innehållet syns inte utan JavaScript
//   - något rör sig i en oändlig animation fast besökaren har valt minskad rörelse
//
// Skärmdumpar av varje sida i mobil och dator hamnar i <mål>/, med rapport.json, till
// designgranskningen (.claude/agents/designkritiker.md).
//
//   node scripts/kvalitet.mjs <dist> <mål>
//
// fabrik.py kvalitet kör den i ut/<kund>/, där playwright-core finns bland starterns
// beroenden. Chrome hittas själv; HJERDAL_CHROME kan peka ut en annan.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const [dist, mal] = process.argv.slice(2).map((p) => resolve(p));
if (!dist || !mal) {
  console.error('Använd: node scripts/kvalitet.mjs <dist> <mål>');
  process.exit(2);
}
const { chromium } = createRequire(join(process.cwd(), 'package.json'))('playwright-core');

const LAGEN = [
  { namn: 'mobil', bild: true, kontext: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { namn: 'dator', bild: true, kontext: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  // Den smalaste vanliga mobilen, med minskad rörelse.
  { namn: 'liten', bild: false, kontext: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' } },
];

const TYPER = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.webmanifest': 'application/manifest+json',
};

/** Filen i dist som en sökväg på sajten pekar på, som Cloudflare skulle visa den, eller null. */
function filFor(sokvag) {
  const ren = decodeURIComponent(sokvag.split(/[?#]/)[0]);
  let fil = join(dist, ren);
  if (relative(dist, fil).startsWith('..')) return null;
  if (existsSync(fil) && statSync(fil).isDirectory()) fil = join(fil, 'index.html');
  return existsSync(fil) && statSync(fil).isFile() ? fil : null;
}

const server = createServer((req, res) => {
  const fil = filFor(req.url ?? '/');
  if (!fil) {
    res.writeHead(404, { 'content-type': TYPER['.html'] });
    res.end(existsSync(join(dist, '404.html')) ? readFileSync(join(dist, '404.html')) : 'Finns inte');
    return;
  }
  res.writeHead(200, { 'content-type': TYPER[extname(fil).toLowerCase()] ?? 'application/octet-stream' });
  res.end(readFileSync(fil));
});
await new Promise((klar) => server.listen(0, '127.0.0.1', klar));
const bas = `http://127.0.0.1:${server.address().port}`;

/** Alla sidor i den byggda sajten, till exempel "/", "/meny/" och "/404.html". */
function sidor(mapp = dist) {
  const ut = [];
  for (const namn of readdirSync(mapp)) {
    const fil = join(mapp, namn);
    if (statSync(fil).isDirectory()) ut.push(...sidor(fil));
    else if (namn === 'index.html') ut.push(`/${relative(dist, mapp)}/`.replace(/\/+/g, '/'));
    else if (namn === '404.html' && mapp === dist) ut.push('/404.html');
  }
  return ut.sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
}

async function startaChrome() {
  const satt = [process.env.HJERDAL_CHROME && { executablePath: process.env.HJERDAL_CHROME }, {}, { channel: 'chrome' }];
  let fel;
  for (const s of satt.filter(Boolean)) {
    try {
      return await chromium.launch(s);
    } catch (e) {
      fel = e;
    }
  }
  throw new Error(`Hittar ingen Chrome att köra kontrollen i. Installera Google Chrome, eller ange sökvägen i HJERDAL_CHROME.\n${String(fel?.message ?? '').split('\n')[0]}`);
}

/** Scrollar igenom sidan så att bilder med loading="lazy" laddas, och tillbaka upp. */
async function scrollaIgenom(sida) {
  await sida.evaluate(async () => {
    // Utan glidande scroll, som en sajt kan ha slagit på med scroll-behavior: smooth,
    // så att bilderna längre ned hinner laddas och skärmdumpen tas från toppen.
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight * 0.8) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await sida.waitForLoadState('networkidle').catch(() => {});
}

const bildnamn = (s) => (s === '/' ? 'start' : s.replace(/^\/|\/$|\.html$/g, '').replace(/\//g, '-'));

async function kontrollera(webblasare, lage, sokvag, rapport) {
  const kontext = await webblasare.newContext(lage.kontext);
  const sida = await kontext.newPage();
  const fel = [];
  sida.on('console', (m) => {
    // En fil som inte finns syns också som ett svar nedan, med sökvägen.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) fel.push(`fel i konsolen: ${m.text()}`);
  });
  sida.on('pageerror', (e) => fel.push(`skriptet kraschade: ${e.message}`));
  sida.on('request', (r) => {
    const url = new URL(r.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== bas) fel.push(`hämtar från en annan webbplats: ${url.host}${url.pathname}`);
  });
  sida.on('response', (r) => {
    const url = new URL(r.url());
    if (url.origin === bas && r.status() >= 400 && !(sokvag === '/404.html' && url.pathname === sokvag)) fel.push(`${url.pathname} finns inte (${r.status()})`);
  });
  await sida.goto(bas + sokvag, { waitUntil: 'networkidle' });
  await scrollaIgenom(sida);

  const matt = await sida.evaluate(() => {
    const bredd = document.documentElement.clientWidth;
    const sidled = document.documentElement.scrollWidth > bredd + 1;
    const beskriv = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + [...el.classList].map((k) => `.${k}`).join('');
    return {
      bredd,
      sidbredd: document.documentElement.scrollWidth,
      // De element som sticker ut, så att det går att hitta felet.
      syndare: sidled
        ? [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > bredd + 1).slice(-3).map(beskriv)
        : [],
      trasigaBilder: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
      lankar: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
      saknadeAnkare: [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').slice(1))
        .filter((id) => id && !document.getElementById(decodeURIComponent(id))),
      skript: document.querySelectorAll('script:not([type="application/ld+json"])').length,
      text: (document.querySelector('main') ?? document.body).innerText.trim().length,
      // Animationer som rullar för evigt. Med minskad rörelse ska allt stå still.
      evigaAnimationer: document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length,
    };
  });

  if (matt.sidbredd > matt.bredd + 1) {
    fel.push(`går att scrolla i sidled: sidan är ${matt.sidbredd} px bred och skärmen ${matt.bredd} px` + (matt.syndare.length ? ` (${matt.syndare.join(', ')})` : ''));
  }
  for (const src of matt.trasigaBilder) fel.push(`bilden går inte att visa: ${src.replace(bas, '')}`);
  for (const id of matt.saknadeAnkare) fel.push(`länken #${id} leder ingenstans på sidan`);
  if (lage.namn === 'dator') {
    for (const href of new Set(matt.lankar)) {
      const url = new URL(href, bas + sokvag);
      if (url.origin === bas && !filFor(url.pathname)) fel.push(`länken ${href} leder till en sida som inte finns`);
    }
  }
  if (lage.kontext.reducedMotion === 'reduce' && matt.evigaAnimationer) {
    fel.push(`${matt.evigaAnimationer} animationer rör sig fast besökaren har valt minskad rörelse`);
  }
  if (lage.bild) {
    // Chrome tar inte skärmdumpar högre än 16 384 pixlar, så en lång sida i mobilen
    // tas i en pixel per CSS-pixel i stället för att bli tom längst ned.
    const hojd = await sida.evaluate(() => document.documentElement.scrollHeight);
    const skala = hojd * (lage.kontext.deviceScaleFactor ?? 1) > 16384 ? 'css' : 'device';
    await sida.screenshot({ path: join(mal, `${bildnamn(sokvag)}-${lage.namn}.jpg`), fullPage: true, type: 'jpeg', quality: 80, scale: skala });
  }
  await kontext.close();

  // Utan JavaScript ska innehållet finnas där; skripten får bara göra det bättre.
  if (lage.namn === 'mobil' && matt.skript && sokvag !== '/404.html') {
    const utan = await webblasare.newContext({ ...lage.kontext, javaScriptEnabled: false });
    const s = await utan.newPage();
    await s.goto(bas + sokvag, { waitUntil: 'load' });
    const del = (await s.locator('main').count()) ? 'main' : 'body';
    const text = await s.locator(del).first().innerText().then((t) => t.trim().length).catch(() => 0);
    if (text < matt.text * 0.6) {
      fel.push(`utan JavaScript syns bara ${Math.round((100 * text) / Math.max(matt.text, 1))} % av texten`);
      await s.screenshot({ path: join(mal, `${bildnamn(sokvag)}-utan-js.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
    }
    await utan.close();
  }
  rapport.push({ sida: sokvag, lage: lage.namn, fel });
  return fel;
}

rmSync(mal, { recursive: true, force: true });
mkdirSync(mal, { recursive: true });
const rapport = [];
let antal = 0;
const webblasare = await startaChrome();
try {
  for (const sokvag of sidor()) {
    for (const lage of LAGEN) {
      const fel = await kontrollera(webblasare, lage, sokvag, rapport);
      antal += fel.length;
      console.log(`  ${sokvag.padEnd(22)} ${lage.namn.padEnd(6)} ${fel.length ? `FEL: ${fel[0]}` : 'ok'}`);
      for (const f of fel.slice(1)) console.log(`  ${''.padEnd(29)} FEL: ${f}`);
    }
  }
} finally {
  await webblasare.close();
  server.close();
}
writeFileSync(join(mal, 'rapport.json'), JSON.stringify({ fel: antal, sidor: rapport }, null, 2) + '\n');
console.log(antal ? `  ${antal} fel.` : `  Inga fel. Skärmdumparna ligger i ${relative(process.cwd(), mal) || '.'}/.`);
process.exit(antal ? 1 : 0);
