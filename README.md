# Sajtfabriken

Fabriken bygger en färdig restaurangsajt från en kundfil, utan AI-anrop och utan
att någon skriver kod. Du fyller i namn, meny, öppettider, bilder och designval,
kör ett kommando och får en sajt som är kontrollerad och klar att publicera.
Säljare använder [HJERDAL Designer](#hjerdal-designer), ett formulär som gör
samma sak utan Terminal.

Version 1 gör restauranger, kaféer och bagerier (paketet Start på
hjerdal.se/hemsida-for-restaurang/). Frisörer, hantverkare och kliniker blir egna
nischer på samma starter.

En kund kan också få en [egen design](#egen-design), gjord med Claude Code ovanpå samma
starter och mätt mot HJERDAL:s egna case. Reglerna för Claude står i `CLAUDE.md`.

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
| `ny <kund> --namn "…" [--egen-design]` | Skapar `kunder/<kund>/kund.json` från `schemas/mallar/kund.json`. Alla fält med FYLL I måste fyllas i innan bygget går. Med `--egen-design` även brief, designspec, designspråk och en startpunkt för kundens egen design. |
| `bygg <kund> [--visa]` | Kopierar startern till `ut/<kund>/`, lägger in kundfil, bilder och kundens egen design, tar bort sidor kunden inte valt, bygger och kontrollerar. `--stil`, `--tema`, `--hero` och `--meny` provar ett annat designval utan att ändra kundfilen. |
| `varianter <kund> [val …] [--visa]` | Bygger samma kund i flera varianter till `ut/<kund>-varianter/` med en översiktssida. Utan val blir det fyra förslag i fyra olika stilar. Ett val är stil, tema, hero och meny med kolon emellan, i valfri ordning: `varianter cafe-solros mjuk:linne klassisk:ek:bild`. Det som inte anges tas från kundfilen. |
| `visa <kund> [--varianter]` | Öppnar den byggda sajten, eller förhandsvisningen, i webbläsaren. |
| `kontroll <kund>` | Kontrollerar en byggd sajt igen. |
| `kvalitet [<kund> …] [--snabb]` | Kvalitetsgrinden i `quality/STANDARD.md`: bygger, kontrollerar, öppnar varje sida i Chrome i mobil och dator (`scripts/kvalitet.mjs`) och kör Lighthouse. Skärmdumparna hamnar i `ut/<kund>/kvalitet/`. Utan kund: alla aktiva kunder. `--snabb` hoppar över Lighthouse. Kräver Google Chrome. |
| `validera <kund>` | Kontrollerar kundfil, brief, designspec och kundens egna filer utan att bygga. |
| `publicera <kund> [--varianter]` | Publicerar på Cloudflare Workers med `wrangler deploy`. Kräver `CLOUDFLARE_API_TOKEN`. Med `--varianter` publiceras förhandsvisningen, så att kunden kan välja via en länk. |
| `lista` | Visar alla kunder, deras stil och tema och när de byggdes. |
| `designer` | Öppnar [HJERDAL Designer](#hjerdal-designer). |
| `mcp` | MCP-servern som låter [Claude](#claude) arbeta i Designer. Startas av Claude-appen, inte för hand. |

## Designval

Stilen bestämmer typsnitt och former, temat färgerna. Varje kund ska kännas igen
som sin egen restaurang. Det som alltid är HJERDAL är kvaliteten: snabb,
tillgänglig, tydlig och utan onödig JavaScript. Sju stilar, tolv teman, tre
hero och fyra menylayouter ger 1 008 kombinationer, före accentfärg och logga.
Afton, Affisch och Stämpel och de sex nyare temana bygger på inspirationen i
`examples/inspiration.md`.

| Stil | Passar | Känns igen på |
| --- | --- | --- |
| `hjerdal` | det mesta, standard | HJERDAL:s eget formspråk: lätta stora rubriker, spärrade versala etiketter, runda knappar, priser i mono |
| `klassisk` | vita dukar, vinbarer, gamla bistroer | Cormorant Garamond och Source Serif, centrerad startsida, raka hörn, kursiva etiketter, punktlinjer fram till priset |
| `kvarter` | pizzerior, burgare, streetfood | smala versala rubriker i Oswald, Archivo i texten, kraftiga linjer, små hörn |
| `mjuk` | kaféer, bagerier, brunch | Bricolage Grotesque och Figtree, rundade kort och bilder, etiketter som brickor |
| `afton` | avsmakningsmenyer, fine dining, vinbarer | Bodoni Moda och Jost, kursiva ord i accentfärgen, spärrade etiketter efter en tunn linje, mycket luft, romerska siffror i den numrerade menyn |
| `affisch` | vedeldade kök, vinbarer, ställen med ett starkt namn | Schibsted Grotesk i jätteformat, ingressen först och rubriken längst ner som på en affisch, tjocka linjer, svartvita foton |
| `stampel` | kvarterskrogar, delade rätter, kaféer med personlighet | feta versaler i Archivo blandade med Fraunces, etiketter som tejp, lutande bilder med en platta i accentfärgen, det praktiska som en mörk remsa |

| Fält i `design` | Val | Standard |
| --- | --- | --- |
| `stil` | se ovan | `hjerdal` |
| `tema` | ljusa: `fjall` (HJERDAL:s egna färger), `linne` (varm), `salvia` (grön), `oliv` (grön och varm), `terrakotta` (tegel), `senap` (gul bakgrund). Mörka: `ek` (varm), `skiffer` (kall), `hav` (blå), `kol` (glöd), `mossa` (skog och guld), `plommon` (vinrött och guld) | `fjall` |
| `hero` | `text` (Stor rubrik), `delad` (Text och bild bredvid varandra), `bild` (Helbild med texten ovanpå) | `text` |
| `meny` | `lista` (sektionsrubrik till vänster, rätter till höger), `kolumner` (Två kolumner), `kort` (rätterna som kort), `numrerad` (sektionerna med stora siffror, som en avsmakningsmeny) | `lista` |
| `accent` | En egen färg, till exempel `#7A3B2E`. Bygget stoppar om knapptexten då får för låg kontrast. | temats |
| `rubrik` | Bara i stilen `hjerdal`: `sans` (Albert Sans) eller `serif` (Fraunces) | temats |

Utan herobild blir hero alltid `text`. Ord mellan `*stjärnor*` i startsidans rubrik
och i rubriken om restaurangen framhävs, och stilen bestämmer hur: kursivt i
accentfärgen i Afton, i en mjuk serif i Stämpel, kursivt i Klassisk och Affisch
och i accentfärgen i HJERDAL, Kvarter och Mjuk.

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

En tung SVG, över 20 kB eller med en inbäddad bild (vanligt när loggan sparas
från Illustrator eller Canva), skulle göra varje sida flera megabyte. Den blir
i stället en PNG i 176 pixlars höjd vid bygget (`logo.svg.png` bredvid
originalet) och sedan WebP, som andra bilder.

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
Ingen Terminal och ingen JSON. Claude kan fylla i formuläret åt säljaren, på
säljarens eget Claude-abonnemang. Själva bygget görs av fabriken, utan AI.

En kort guide för säljare finns i Designer under de tre prickarna, *Så använder
du Designer*.

**Installera** på varje Mac en gång: klona det här repot, öppna mappen
`designer/` i Finder och dubbelklicka på `installera.command`. Skriptet kontrollerar
Python, Node och git, provbygger exempelkunden, gör programmet *HJERDAL Designer*
i Program-mappen i hemmappen, lägger det i Dock, installerar och loggar in
Claude Code för chatten och kopplar Claude-appen om den finns. Kör skriptet igen
om fabriken flyttas eller efter en uppdatering. Programmet byggs om varje gång,
så det är också så en ny version av själva fönstret kommer till datorn.

**Använda.** Klicka på ikonen. Designer är ett eget program med Safaris motor:
eget fönster, egen ikon i Dock och vanliga menyer, och Cmd + och Cmd − ändrar
storleken. Filer som laddas ner hamnar i Hämtade filer och länkar ut ur Designer
öppnas i webbläsaren. Första gången kan macOS fråga om programmet får använda
mappen Dokument och Hämtade filer, och då ska svaret vara Tillåt. Finns inte
Swift från Apples utvecklarverktyg öppnas Designer i Chrome i appläge, annars i
standardwebbläsaren. Startsidan visar varje kund
med en miniatyr av den senaste förhandsvisningen och hur långt den har kommit:
*Utkast* med antalet fält kvar, *Klar att spara*, *Sparad i GitHub* eller
*Publicerad* (efter `fabrik.py publicera`, tills kundfilen ändras igen).

1. *Ny kund* och restaurangens namn. Kunden sparas i `kunder/<kund>/`. Det
   säljaren skriver i *Vad vet du om restaurangen?* skickas till Claude, som
   fyller i formuläret när kunden öppnas.
2. Fyll i formuläret. Allt sparas på datorn medan du skriver. Stegen till
   vänster visar vilka delar som är klara och hur många fält som är kvar.
   Bilder dras in från Finder, på en bildruta eller var som helst i formuläret
   (se *Bilder i Designer* nedan).
3. *Claude* uppe till höger öppnar chatten. Se [Claude](#claude).
4. *Förhandsvisa* bygger sajten och visar den i helskärm som mobil, surfplatta
   eller dator. Esc stänger. Fel visas i en ruta överst och vid fälten, och
   försvinner så fort fältet är rätt.
5. *Förslag* bygger fyra varianter i olika stilar. *Välj den här stilen* sätter
   den kunden gillar som kundens design. *Visa för kunden* visar förslagen över
   hela skärmen utan Designer runt omkring, för mötet: pilarna byter stil,
   *Välj den här* sparar den och Esc går tillbaka. Raden längst ner gömmer sig
   när musen står still.
6. *Spara till GitHub* under de tre prickarna checkar in kundens mapp och
   skickar den. Bara `kunder/<kund>/` följer med, aldrig något annat.

**Exportera och arkivera.** *Exportera för kunden*, under de tre prickarna på
kundens kort eller i kunden, sparar `<kund>-underlag.html` i Hämtade filer: allt
som står om restaurangen, med kontakt, öppettider, menyn, texterna, bilderna,
utseendet och en lista över det som saknas. Kunden öppnar filen i webbläsaren,
den går att mejla och skriva ut, och bilderna ligger inne i filen.

*Arkivera* flyttar en kund som inte är aktuell från startsidan till *Arkiv*
längst ner. Där syns när den arkiverades och när den tas bort, och *Ta tillbaka*
gör den aktiv igen. Arkivet är filen `kunder/<kund>/arkiv.json`, så en kund som
har sparats i GitHub arkiveras och tas tillbaka i GitHub direkt och syns likadant
hos kollegorna. 30 dagar efter att kunden arkiverades tar Designer bort den, när
Designer startar eller startsidan visas: underlaget sparas först i `ut/arkiv/`,
sedan tas kundens mapp, byggen och konversation med Claude bort, och borttagningen
skickas till GitHub, där kunden finns kvar i historiken. En publicerad sajt
ligger kvar på Cloudflare.

*Hämta senaste fabriken* på startsidan och under de tre prickarna hämtar nya
stilar, fält och rättningar från GitHub och startar om Designer. Kunder som är
sparade på datorn men inte skickade än läggs ovanpå det som har kommit, och
meddelandet säger hur många som väntar på *Spara till GitHub*. Designer stänger sig själv efter en
halvtimme utan öppet fönster. Publicering görs fortfarande med `fabrik.py
publicera`.

**Bilder i Designer.** Ett foto från en mobil kan vara 12 MB och 4000 pixlar
brett. Varje bild som laddas upp, släpps i formuläret, bifogas i chatten eller
hämtas av Claude görs därför om innan den sparas (`designer/bild.py` med sharp
från fabrikens beroenden): vriden rätt efter kamerans EXIF, högst 2560 pixlar
(2000 för bilagor till Claude), JPEG för foton och PNG för det som är
genomskinligt, och utan metadata, så att platsen där fotot togs aldrig följer
med. Tar fältet inte emot JPEG, som loggan, behålls bildens eget format. HEIC
från iPhone görs först om med macOS egna `sips`. SVG lämnas som den är.
Meddelandet efter uppladdningen säger hur mycket mindre bilden blev.

**Så växer den med fabriken.** Formuläret ritas från kundfilens schema
(`starter/src/lib/schema.ts`), som `npm run schema` i `starter/` skriver till
`starter/cms.manifest.json`. Ett nytt fält i schemat blir ett nytt fält i
Designer, en ny stil eller ett nytt tema i `starter/src/lib/designval.ts` blir ett
nytt kort att välja. Etiketten och hjälptexten är `.describe('Etikett|Hjälptext')`,
och `|flerrad` sist ger en textruta med flera rader. Fältets kontroll väljs efter
vad det tar emot: ett mönster som godtar `11:00` blir en klocka, ett som godtar
`bild.jpg` blir en bildväljare. CI stoppar om `cms.manifest.json` inte är
uppdaterad.

**Tekniskt.** `designer/server.py` är en webbserver på `127.0.0.1` med bara
Pythons standardbibliotek. På en Mac med Apple-chip startar fabriken om sig själv
som arm64 om den har startats under Rosetta, eftersom git inte fungerar där på
nyare macOS (`unable to load libxcrun`). Formuläret i `designer/webb/` är vanlig JavaScript
utan byggsteg, så samma formulär kan flyttas in i portalen på hjerdal.se senare.
Förhandsvisningarna byggs i `ut/designer/`, skilt från `ut/<kund>/` som
publiceras. Servern svarar bara förfrågningar till sig själv: allt som ändrar
något kräver rubriken `X-Hjerdal`, och fel värdnamn nekas. `python3
designer/prov.py` provkör API:t och MCP-servern, och CI kör det med Python 3.9.

## Claude

**Chatten i Designer.** *Claude* uppe till höger öppnar en chatt bredvid
formuläret. Säljaren skriver det kunden berättat, klistrar in en länk eller
bifogar en bild på menyn, och Claude fyller i fälten medan säljaren tittar.
Fälten Claude ändrar lyser upp. Saknas bilder hämtar Claude restaurangens egna
foton från dess webbplats, med alt-text.

Under varje svar som ändrade kundfilen står fälten Claude ändrade; ett klick
visar fältet i formuläret. *Ångra* sätter tillbaka just de fälten som de var före
svaret, och det säljaren ändrat i andra fält finns kvar. Kundfilen från före
varje svar sparas i `ut/claude/<kund>/fore/`.

Claude arbetar på servern, inte i fönstret. Byter säljaren kund fortsätter
Claude, startsidan visar *Claude arbetar…* på kunden, och när säljaren kommer
tillbaka visas det Claude gjort hittills medan resten strömmar in. *Stoppa*
avbryter; det Claude hann fylla i finns kvar.

Chatten kör Claude Code på säljarens dator, inloggad med säljarens eget
Claude-konto (Pro eller Max). Den går på abonnemanget, utan API-nyckel, och
Designer läser eller ändrar aldrig inloggningen. Varje säljare behöver ett eget
Claude-konto. Saknas Claude Code eller inloggningen visar chatten knappar som
öppnar Terminal för `curl -fsSL https://claude.ai/install.sh | bash` och
`claude auth login`.

`designer/claude.py` startar `claude -p` med Designers MCP-server och bara
verktygen Read, WebSearch och WebFetch. Claude kan inte köra kommandon, inte
spara till GitHub och läser bara filer i kundens chattmapp. Konversationen och
bilagorna sparas i `ut/claude/<kund>/` och följer aldrig med till GitHub.
`ANTHROPIC_API_KEY` tas bort ur miljön, så att chatten aldrig går på en
API-nyckel. `HJERDAL_CLAUDE_MODELL=sonnet` väljer en annan modell.

**Claude-appen.** Med Claude-appen kan säljaren be Claude göra jobbet i Designer, till exempel
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
| `andra_falt` | ändra enstaka fält, till exempel `kontakt.telefon`, utan att skicka hela kundfilen |
| `bygg_forhandsvisning`, `skapa_forslag` | bygga, kontrollera och visa förslag |
| `hamta_bild` | hämta en bild från en https-länk till kundens bilder |
| `oppna_designer` | öppna Designer-fönstret på kunden |
| `spara_till_github` | spara kunden i GitHub, bara när säljaren ber om det |

Claude är instruerad att aldrig hitta på öppettider, priser, adresser eller
rätter. Det som saknas lämnas tomt, så att bygget visar vad som behöver fyllas i.
`andra_falt` och `spara_kundfil` kontrollerar varje ändring mot schemat och
svarar med felet direkt, till exempel ett telefonnummer i fel format, så att
Claude rättar det innan säljaren ser det.

## Det fabriken kontrollerar

Bygget stoppar om kundfilen har fel, till exempel en tid som skrivs 11.00 i
stället för 11:00, en description som är för lång, en stil som inte finns eller
en accentfärg med för låg kontrast. Felmeddelandet säger vilket fält det gäller.

Efter bygget kontrollerar `fabrik.py` varje sida: `lang="sv"`, title,
description, canonical, exakt en h1, alt-text på alla bilder, giltig
strukturerad data, inga externa skript och ingen JavaScript utom på menyskärmen.
Varningar, till exempel en avvikelse vars datum har passerat, stoppar inte bygget.

Exempelkunden Bistro Nordvik får 100 i alla fyra Lighthouse-kategorier i mobil i
alla sju stilarna. Startsidan väger 49 kB i `hjerdal`, runt 70 kB i `kvarter`
och `mjuk` och 133 kB i `klassisk`, som laddar tre typsnittsfiler. En stil vars
typsnitt annars får rubriker eller knappar att hoppa när de kommer hämtar dem direkt,
med en `<stil>.forladda.ts` bredvid sin CSS, som `afton`. CI-jobbet
Fabrik kör kvalitetsgrinden för varje aktiv kund, provkör egen design
(`quality/prov_fabrik.py`) och Designer och bygger en variant i varje stil vid
varje ändring.

## Mappar

```
fabrik.py          kommandona ovan, bara Pythons standardbibliotek
CLAUDE.md          reglerna för Claude Code i fabriken
starter/           Astro-sajten alla kunder byggs från (regler i starter/CLAUDE.md)
  cms.manifest.json  fälten som går att redigera, för fabrik.py och Designer (npm run schema)
  DESIGN_LANGUAGE.md starterns eget designspråk
  src/components/core/  det som fungerar likadant för alla: Seo, MenySektion, Oppettider
  src/components/brand/ utseendet som en kund med egen design byter: Sidhuvud, Hero, Sidfot
  src/layouts/Bas.astro ramen för alla sidor
  src/styles/        tokens.css (mått, typsnitt, former), bas.css (grunden),
                     stilar/ (en fil per stil med typsnitt och former), brand.css (kundens egen)
  src/config/        site.ts (namn, adress, språk) och brand.json (hur en egen design tar över)
  src/lib/schema.ts  kundfilens fält, regler och etiketter
  src/lib/designval.ts stilarna, färgtemana och layouterna
  src/lib/tema.ts    kontrastkontrollen
  src/lib/ld.ts      strukturerad data
  src/data/kund.json exempelkunden, så att startern går att köra med npm run dev
schemas/           brief.schema.json och design.schema.json, och mallar/ för en ny kund
quality/           STANDARD.md, rubrik.md för designgranskningen, lighthouserc.json och
                   prov_fabrik.py som provkör egen design
examples/          HJERDAL:s godkända case och inspirationen, med vad som gör dem bra
scripts/           kvalitet.mjs, webbläsarkontrollen i grinden
.claude/           skills/ (ny-sajt, granska-sajt) och agents/ (byggare, designkritiker, granskare)
designer/          HJERDAL Designer
  installera.command installerar programmet på en Mac
  server.py          webbservern och API:t, bara Pythons standardbibliotek
  mcp.py             MCP-servern för Claude
  claude.py          chatten: kör Claude Code med säljarens konto, i bakgrunden, med ångra
  export.py          kundens underlag som en HTML-fil att skicka till kunden
  bild.py            gör uppladdade bilder lagom stora och tar bort metadata
  komprimera.mjs     själva bildbehandlingen, med sharp
  fonster/           programmet: Designer.swift är fönstret, gor-app.sh gör HJERDAL Designer.app
  ikon.png           programikonen, från HJERDALs Instagram-profilbild
  ikon/              ikonen i macOS 26:s format (Icon Composer) och Assets.car, som görs i
                     Mac-kontrollen i GitHub med bygg-ikon.sh. Utan den krymper macOS 26 ikonen
  webb/              formuläret och chatten: HTML, CSS och JavaScript utan byggsteg
  prov.py            provkörningen som CI kör
kunder/<kund>/     kund.json och bilder/, en mapp per kund, och arkiv.json om den är arkiverad.
                   Med egen design även brief.json, design.json, DESIGN_LANGUAGE.md, src/ och public/
ut/                byggda sajter, förhandsvisningar och delade beroenden (checkas inte in)
```

Ändringar görs i `starter/`, aldrig i en kunds kopia i `ut/`. Varje bygge skriver
`fabrik.json` med starterns version, så att det syns vilken starter en kund har.

En ny stil är en ny fil i `starter/src/styles/stilar/` som sätter variablerna i
`tokens.css` och laddar sina typsnitt, plus stilens namn och beskrivning i
`starter/src/lib/designval.ts`. Kör sedan `npm run schema` i `starter/`, så känner
fabrik.py och Designer till den. Ett nytt fält läggs till i
`starter/src/lib/schema.ts` på samma sätt.

## Egen design

Mallen ger en prydlig sajt. En kund som ska nå HJERDAL:s standard får en egen design,
gjord av Claude Code ovanpå samma starter:

1. `python3 fabrik.py ny <kund> --namn "…" --egen-design` gör mappen med kundfilen,
   `brief.json`, `design.json` och `DESIGN_LANGUAGE.md`.
2. Briefen säger vem kunden är och vad sajten ska åstadkomma, designspecen och
   designspråket vilken riktning designen tar. Ahmed godkänner riktningen innan något byggs.
3. Kundens egna komponenter, sidor, typsnitt och CSS ligger i `kunder/<kund>/src/` och
   läggs ovanpå startern vid bygget. Det som delas av alla kunder (metadata, menyn,
   öppettiderna, ramen) går inte att ändra per kund, så en rättning i startern når alla.
4. `python3 fabrik.py kvalitet <kund>` måste vara grön, och designkritikern bedömer
   skärmdumparna mot `quality/rubrik.md` och casen i `examples/`.

Hela arbetsgången står i `.claude/skills/ny-sajt/SKILL.md`. Sajten byggs, förhandsvisas
och publiceras sedan som alla andra kunder, och kundfilen går fortfarande att ändra i
Designer.

## Nästa steg

- **Kunden ändrar menyn själv.** Keystatic ovanpå `kund.json`, för paketet Tillväxt.
- **Ett repo per kund.** `publicera` skapar ett GitHub-repo från `ut/<kund>/`, så att
  koden kan lämnas över enligt allmänna villkoren 19.2.
- **Startern som paket.** När kunderna får egna repon flyttas `core/` och `layouts/`
  till ett versionerat paket, så att en rättning når alla kunder som en PR per kund.
- **Bokning och beställning.** En modul för paketet Lokal, med en Worker och D1.
