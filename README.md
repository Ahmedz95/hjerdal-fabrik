# Sajtfabriken

Fabriken bygger en färdig restaurangsajt från en kundfil, utan AI-anrop och utan
att någon skriver kod. Du fyller i namn, meny, öppettider, bilder och designval,
kör ett kommando och får en sajt som är kontrollerad och klar att publicera.
Säljare använder [HJERDAL Designer](#hjerdal-designer), ett formulär som gör
samma sak utan Terminal.

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
sekunder i `ut/.beroenden/`, och de delas sedan av alla kunder och förslag. Ett
bygge tar runt tio sekunder. Inget konto behövs utom för `publicera`.

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
| `designer` | Öppnar [HJERDAL Designer](#hjerdal-designer). |
| `mcp` | MCP-servern som låter [Claude](#claude) arbeta i Designer. Startas av Claude-appen, inte för hand. |

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
| `hero` | `text` (Stor rubrik), `delad` (Text och bild bredvid varandra), `bild` (Helbild med texten ovanpå) | `text` |
| `meny` | `lista` (sektionsrubrik till vänster, rätter till höger), `kolumner` (Två kolumner), `kort` (rätterna som kort) | `lista` |
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

## HJERDAL Designer

Ett program för säljare: fyll i det kunden berättar, välj stil och färger, visa
en förhandsvisning och fyra förslag direkt på mötet och spara kunden i GitHub.
Ingen Terminal, ingen JSON och inga AI-kostnader. Allt arbete görs av fabriken.

**Installera** på varje Mac en gång: klona det här repot, öppna mappen
`designer/` i Finder och dubbelklicka på `installera.command`. Skriptet kontrollerar
Python, Node och git, provbygger exempelkunden, gör programmet *HJERDAL Designer*
i Program-mappen i hemmappen, lägger det i Dock och kopplar Claude-appen om den
finns. Kör skriptet igen om fabriken flyttas.

**Använda.** Klicka på ikonen. Designer öppnas i ett eget fönster (Chrome i
appläge om Chrome finns, annars standardwebbläsaren).

1. *Ny kund* och restaurangens namn. Kunden sparas i `kunder/<kund>/`.
2. Fyll i formuläret. Allt sparas på datorn medan du skriver. Fält som krävs och
   fält med fel markeras, och navigeringen till vänster visar var de finns.
3. *Förhandsvisa* bygger sajten och visar den som mobil eller dator.
4. *Skapa förslag* bygger fyra varianter i olika stilar. *Välj* sätter den
   kunden gillar som kundens design.
5. *Spara till GitHub* checkar in kundens mapp och skickar den. Bara
   `kunder/<kund>/` följer med, aldrig något annat.

*Hämta senaste fabriken* på startsidan hämtar nya stilar, fält och rättningar
från GitHub och startar om Designer. Designer stänger sig själv efter en
halvtimme utan öppet fönster. Publicering görs fortfarande med `fabrik.py
publicera`.

**Så växer den med fabriken.** Formuläret ritas från kundfilens schema
(`karna/src/lib/schema.ts`), som `npm run schema` i `karna/` skriver till
`karna/fabrik-schema.json`. Ett nytt fält i schemat blir ett nytt fält i
Designer, en ny stil eller ett nytt tema i `karna/src/lib/designval.ts` blir ett
nytt kort att välja. Etiketten och hjälptexten är `.describe('Etikett|Hjälptext')`,
och `|flerrad` sist ger en textruta med flera rader. Fältets kontroll väljs efter
vad det tar emot: ett mönster som godtar `11:00` blir en klocka, ett som godtar
`bild.jpg` blir en bildväljare. CI stoppar om `fabrik-schema.json` inte är
uppdaterad.

**Tekniskt.** `designer/server.py` är en webbserver på `127.0.0.1` med bara
Pythons standardbibliotek. Formuläret i `designer/webb/` är vanlig JavaScript
utan byggsteg, så samma formulär kan flyttas in i portalen på hjerdal.se senare.
Förhandsvisningarna byggs i `ut/designer/`, skilt från `ut/<kund>/` som
publiceras. Servern svarar bara förfrågningar till sig själv: allt som ändrar
något kräver rubriken `X-Hjerdal`, och fel värdnamn nekas. `python3
designer/prov.py` provkör API:t och MCP-servern, och CI kör det med Python 3.9.

## Claude

Med Claude-appen kan säljaren be Claude göra jobbet i Designer, till exempel
*"gör en sajt till Café Solros, här är menyn och öppettiderna"* eller *"byt till
mörka färger och skapa förslag"*. Claude fyller i kundfilen, bygger
förhandsvisningen, rättar det bygget hittar och visar länken. Formuläret i
Designer uppdateras när Claude ändrar kundfilen.

Det går på säljarens vanliga Claude-abonnemang, utan API-nyckel. Claude-appen
startar `python3 fabrik.py mcp` (en MCP-server, `designer/mcp.py`) och använder
samma API som formuläret. Fabriken själv anropar aldrig någon AI.

`installera.command` kopplar Claude-appen. För hand: lägg till det här i
`~/Library/Application Support/Claude/claude_desktop_config.json` och starta om
Claude-appen.

```json
{
  "mcpServers": {
    "hjerdal-designer": {
      "command": "/usr/bin/python3",
      "args": ["/Users/<du>/hjerdal-fabrik/fabrik.py", "mcp"],
      "env": { "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" }
    }
  }
}
```

I Claude Code: `claude mcp add --scope user hjerdal-designer -- python3 /sökväg/till/fabrik.py mcp`.

| Verktyg | Vad Claude kan göra |
| --- | --- |
| `kundfilens_falt` | läsa alla fält, regler, stilar och teman |
| `lista_kunder`, `las_kundfil`, `skapa_kund`, `spara_kundfil` | läsa, skapa och fylla i kunder |
| `bygg_forhandsvisning`, `skapa_forslag` | bygga, kontrollera och visa förslag |
| `hamta_bild` | hämta en bild från en https-länk till kundens bilder |
| `oppna_designer` | öppna Designer-fönstret på kunden |
| `spara_till_github` | spara kunden i GitHub, bara när säljaren ber om det |

Claude är instruerad att aldrig hitta på öppettider, priser, adresser eller
rätter. Det som saknas lämnas tomt, så att bygget visar vad som behöver fyllas i.

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
designer/          HJERDAL Designer
  installera.command installerar programmet på en Mac
  server.py          webbservern och API:t, bara Pythons standardbibliotek
  mcp.py             MCP-servern för Claude
  webb/              formuläret: HTML, CSS och JavaScript utan byggsteg
  prov.py            provkörningen som CI kör
karna/             Astro-sajten alla kunder byggs från
  src/lib/schema.ts  kundfilens fält, regler och etiketter
  src/lib/designval.ts stilarna, färgtemana och layouterna
  fabrik-schema.json schemat för fabrik.py och Designer (npm run schema)
  src/lib/tema.ts    kontrastkontrollen
  src/stilar/        en CSS-fil per stil med dess typsnitt och former
  src/styles/bas.css grunden som alla stilar bygger på
  src/lib/ld.ts      strukturerad data
  src/data/kund.json exempelkunden, så att kärnan går att köra med npm run dev
kunder/<kund>/     kund.json och bilder/, en mapp per kund
ut/                byggda sajter, förhandsvisningar och delade beroenden (checkas inte in)
```

Ändringar görs i `karna/`, aldrig i en kunds kopia i `ut/`. Varje bygge skriver
`fabrik.json` med kärnans version, så att det syns vilken kärna en kund har.

En ny stil är en ny fil i `karna/src/stilar/` som sätter variablerna överst i
`bas.css` och laddar sina typsnitt, plus stilens namn och beskrivning i
`karna/src/lib/designval.ts`. Kör sedan `npm run schema` i `karna/`, så känner
fabrik.py och Designer till den. Ett nytt fält läggs till i
`karna/src/lib/schema.ts` på samma sätt.

## Nästa steg

- **Kunden ändrar menyn själv.** Keystatic ovanpå `kund.json`, för paketet Tillväxt.
- **Ett repo per kund.** `publicera` skapar ett GitHub-repo från `ut/<kund>/`, så att
  koden kan lämnas över enligt allmänna villkoren 19.2.
- **Kärnan som paket.** När en andra nisch tillkommer flyttas det gemensamma till
  versionerade paket, så att en rättning når alla kunder som en PR per kund.
- **Bokning och beställning.** En modul för paketet Lokal, med en Worker och D1.
