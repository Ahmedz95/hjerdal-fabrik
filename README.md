# Sajtfabriken

Fabriken bygger en färdig restaurangsajt från en kundfil, utan AI-anrop och utan
att någon skriver kod. Du fyller i namn, meny, öppettider, bilder och designval,
kör ett kommando och får en sajt som är kontrollerad och klar att publicera.

Version 1 gör restauranger, kaféer och bagerier (paketet Start på
hjerdal.se/hemsida-for-restaurang/). Frisörer, hantverkare och kliniker blir egna
nischer på samma kärna.

## Snabbstart

```sh
python3 fabrik.py ny cafe-solros --namn "Café Solros"
# fyll i kunder/cafe-solros/kund.json och lägg bilder och logga i kunder/cafe-solros/bilder/
python3 fabrik.py varianter cafe-solros --visa    # fyra förslag att visa kunden
python3 fabrik.py bygg cafe-solros --visa         # bygg, kontrollera och öppna
python3 fabrik.py publicera cafe-solros           # till Cloudflare
```

Kräver Python 3.9 eller senare (den som följer med macOS räcker) och Node 20 eller
senare (`brew install node`). Första bygget installerar beroenden på ungefär 30
sekunder, därefter tar ett bygge runt tio sekunder. Inget konto behövs utom för
`publicera`.

## Kommandon

| Kommando | Vad det gör |
| --- | --- |
| `ny <kund> --namn "…"` | Skapar `kunder/<kund>/kund.json` från `mall-kund.json`. Alla fält med FYLL I måste fyllas i innan bygget går. |
| `bygg <kund> [--visa]` | Kopierar kärnan till `ut/<kund>/`, lägger in kundfil och bilder, tar bort sidor kunden inte valt, bygger och kontrollerar. `--stil`, `--tema`, `--hero` och `--meny` provar ett annat designval utan att ändra kundfilen. |
| `varianter <kund> [val …] [--visa]` | Bygger samma kund i flera varianter till `ut/<kund>-varianter/` med en översiktssida. Utan val blir det fyra förslag i fyra olika stilar. Ett val är stil, tema, hero och meny med kolon emellan, i valfri ordning: `varianter cafe-solros mjuk:linne klassisk:ek:bild`. Det som inte anges tas från kundfilen. |
| `visa <kund> [--varianter]` | Öppnar den byggda sajten, eller förhandsvisningen, i webbläsaren. |
| `kontroll <kund>` | Kontrollerar en byggd sajt igen. |
| `publicera <kund> [--varianter]` | Publicerar på Cloudflare Workers med `wrangler deploy`. Kräver `CLOUDFLARE_API_TOKEN`. Med `--varianter` publiceras förhandsvisningen, så att kunden kan välja via en länk. |
| `lista` | Visar alla kunder, deras stil och tema och när de byggdes. |

## Designval

Stilen bestämmer typsnitt och former, temat färgerna. Varje kund ska kännas igen
som sin egen restaurang. Det som alltid är HJERDAL är kvaliteten: snabb,
tillgänglig, tydlig och utan onödig JavaScript. Fyra stilar, sex teman, tre
hero och tre menylayouter ger 216 kombinationer, före accentfärg och logga.

| Stil | Passar | Känns igen på |
| --- | --- | --- |
| `hjerdal` | det mesta, standard | HJERDAL:s eget formspråk: lätta stora rubriker, spärrade versala etiketter, runda knappar, priser i mono |
| `klassisk` | vita dukar, vinbarer, gamla bistroer | Cormorant Garamond och Source Serif, centrerad startsida, raka hörn, kursiva etiketter, punktlinjer fram till priset |
| `kvarter` | pizzerior, burgare, streetfood | smala versala rubriker i Oswald, Archivo i texten, kraftiga linjer, små hörn |
| `mjuk` | kaféer, bagerier, brunch | Bricolage Grotesque och Figtree, rundade kort och bilder, etiketter som brickor |

| Fält i `design` | Val | Standard |
| --- | --- | --- |
| `stil` | se ovan | `hjerdal` |
| `tema` | ljusa: `fjall` (HJERDAL:s egna färger), `linne` (varm), `salvia` (grön). Mörka: `ek` (varm), `skiffer` (kall), `hav` (blå) | `fjall` |
| `hero` | `text` (stor rubrik), `delad` (text och bild bredvid varandra), `bild` (helbild med texten ovanpå) | `text` |
| `meny` | `lista` (sektionsrubrik till vänster, rätter till höger), `kolumner` (två sektioner i bredd), `kort` (rätterna som kort) | `lista` |
| `accent` | En egen färg, till exempel `#7A3B2E`. Bygget stoppar om knapptexten då får för låg kontrast. | temats |
| `rubrik` | Bara i stilen `hjerdal`: `sans` (Albert Sans) eller `serif` (Fraunces) | temats |

Utan herobild blir hero alltid `text`.

## Bilder och logga

Bilderna läggs i `kunder/<kund>/bilder/` och anges under `bilder` i kundfilen:

```json
"bilder": {
  "hero": { "fil": "hero.jpg", "alt": "Matsalen en kväll med tända ljus" },
  "om": { "fil": "kok.jpg", "alt": "Kocken lägger upp dagens fisk" },
  "logo": "logo.svg",
  "logoMork": "logo-ljus.png"
}
```

Bilderna blir AVIF och WebP i flera storlekar vid bygget. Loggan visas i
sidhuvudet i stället för namnet. En SVG läggs direkt i sidan, och om den ritar
med `currentColor` får den textfärgen och fungerar på både ljusa och mörka
teman. Annars anger `logoMork` en ljus version för de mörka temana. SVG-filen
måste ha `viewBox` och får inte innehålla skript.

## Funktioner

| Fält i `funktioner` | Sida | Standard |
| --- | --- | --- |
| `omOss` | `/om-oss/`, kräver att `om` är ifyllt | på |
| `qr` | `/qr/`, en QR-skylt att skriva ut till borden. Koden leder till `/meny/`. | av |
| `skarm` | `/skarm/`, menyskärmen i lokalen. Visar lunch på lunchtid och kväll på kvällen och laddar om sig själv var femte minut. | av |
| `hjerdalLank` | "Webbplats av HJERDAL" i sidfoten | på |

Alla sajter får startsida, `/meny/`, `/kontakt/`, en riktig 404, sitemap,
robots.txt, favikon och strukturerad data för restaurangen och menyn
(schema.org `Restaurant` och `Menu` med priser, öppettider och avvikelser).

## Det fabriken kontrollerar

Bygget stoppar om kundfilen har fel, till exempel en tid som skrivs 11.00 i
stället för 11:00, en description som är för lång, en stil som inte finns eller
en accentfärg med för låg kontrast. Felmeddelandet säger vilket fält det gäller.

Efter bygget kontrollerar `fabrik.py` varje sida: `lang="sv"`, title,
description, canonical, exakt en h1, alt-text på alla bilder, giltig
strukturerad data, inga externa skript och ingen JavaScript utom på menyskärmen.
Varningar, till exempel en avvikelse vars datum har passerat, stoppar inte bygget.

Exempelkunden Bistro Nordvik får 100 i alla fyra Lighthouse-kategorier i mobil i
alla fyra stilarna. Startsidan väger 49 kB i `hjerdal`, runt 70 kB i `kvarter`
och `mjuk` och 133 kB i `klassisk`, som laddar tre typsnittsfiler. CI-jobbet
Fabrik bygger exempelkunden och en variant i varje stil vid varje ändring och
kör Lighthouse.

## Mappar

```
fabrik.py          kommandona ovan, bara Pythons standardbibliotek
mall-kund.json     mallen för en ny kund
karna/             Astro-sajten alla kunder byggs från
  src/lib/kund.ts    kundfilens schema och kontroller
  src/lib/tema.ts    färgtemana och kontrastkontrollen
  src/stilar/        en CSS-fil per stil med dess typsnitt och former
  src/styles/bas.css grunden som alla stilar bygger på
  src/lib/ld.ts      strukturerad data
  src/data/kund.json exempelkunden, så att kärnan går att köra med npm run dev
kunder/<kund>/     kund.json och bilder/, en mapp per kund
ut/                byggda sajter och förhandsvisningar (checkas inte in)
```

Ändringar görs i `karna/`, aldrig i en kunds kopia i `ut/`. Varje bygge skriver
`fabrik.json` med kärnans version, så att det syns vilken kärna en kund har.

En ny stil är en ny fil i `karna/src/stilar/` som sätter variablerna överst i
`bas.css` och laddar sina typsnitt, plus stilens namn i listorna `stilar` i
`karna/src/lib/kund.ts` och `karna/astro.config.mjs` och `STILAR` i `fabrik.py`.

## Nästa steg

- **Kunden ändrar menyn själv.** Keystatic ovanpå `kund.json`, för paketet Tillväxt.
- **Ett repo per kund.** `publicera` skapar ett GitHub-repo från `ut/<kund>/`, så att
  koden kan lämnas över enligt allmänna villkoren 19.2.
- **Kärnan som paket.** När en andra nisch tillkommer flyttas det gemensamma till
  versionerade paket, så att en rättning når alla kunder som en PR per kund.
- **Bokning och beställning.** En modul för paketet Lokal, med en Worker och D1.
