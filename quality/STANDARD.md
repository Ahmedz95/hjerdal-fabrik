# HJERDAL:s standard för en kundsajt

En sajt från fabriken ska kunna stå bredvid HJERDAL:s egna case i `examples/` utan att
skämmas. Standarden har två delar: grinden, som en maskin kontrollerar och som stoppar
bygget, och granskningen, som Claude gör mot `rubrik.md` och som Ahmed avgör.

Ingen sajt publiceras utan att grinden är grön och Ahmed har sett den färdiga sajten.
Claude publicerar aldrig själv.

## Grinden

`python3 fabrik.py kvalitet <kund>` kör allt, och CI kör det för varje aktiv kund i
`kunder/`. `--snabb` hoppar över Lighthouse, för att prova ofta medan man bygger.

| Vad | Kontrolleras av | Kravet |
|---|---|---|
| Kundfilen, briefen och designspecen | `fabrik.py validera`, bygget | Följer `starter/src/lib/schema.ts` och `schemas/`. Inga FYLL I. Färgparen i design.json klarar WCAG AA (4,5, eller 3 för stor text). |
| Kundens egen design | bygget | Bara i `src/components/brand/`, `src/pages/`, `src/styles/`, `src/assets/`, `public/` och `src/config/brand.json`. Det som delas av alla kunder ändras i `starter/`. |
| Typer och innehåll | `astro check` i bygget | Inga typfel, inga trasiga bilder i kundfilen. |
| Varje sida | `fabrik.py kontroll` | `lang="sv"`, titel, description 50–160 tecken, canonical, exakt en h1, alt-text på alla bilder, giltig strukturerad data, högst 120 kB HTML, 404, robots.txt, sitemap och favikon. Inga skript från andra webbplatser. Egen JavaScript bara med `"skript": true` i brand.json. |
| I webbläsaren, mobil 360 och 390 px och dator 1440 px | `scripts/kvalitet.mjs` | Ingen sidledsscroll. Inga fel i konsolen. Inga filer eller länkar inom sajten som saknas, inga ankare som leder ingenstans, inga trasiga bilder. Inget hämtas från andra webbplatser (typsnitt, skript, spårning). Innehållet finns utan JavaScript. Inga eviga animationer med minskad rörelse. |
| Lighthouse i mobil | `quality/lighthouserc.json` | Tillgänglighet, bästa praxis och SEO minst 95, färgkontrasten utan anmärkning. Prestanda 95 är en varning. |

Grinden fångar det som går att mäta. Den säger ingenting om huruvida sajten är bra.

## Granskningen

Designkritikern (`.claude/agents/designkritiker.md`) bedömer skärmdumparna från grinden
mot `rubrik.md`, mot kundens `DESIGN_LANGUAGE.md` och mot referenserna i `design.json`.
Granskaren (`.claude/agents/granskare.md`) går igenom det grinden inte kan mäta:
tangentbord, fokus, skärmläsare, formulär och hur sajten känns på en riktig telefon.

Det här är vad HJERDAL:s case har gemensamt, och vad varje sajt ska ha:

- **Stämning från första sekunden.** Första skärmen i mobilen säger vad stället är och
  hur det känns, innan besökaren har scrollat. Inte en rubrik på en tom bakgrund.
- **En egen identitet.** Byt namn och logga, och det ska inte gå att tro att det är en
  annan restaurang. Typsnitt, färg, bilder och text är valda för just den här kunden.
- **Det viktiga med tummen.** Menyn, öppettiderna, adressen och boka eller ring nås med
  ett tumtryck från första skärmen. Knapparna är minst 44 px höga.
- **Menyn som riktig text.** Med priser, märkning och allergener, aldrig en PDF eller en
  bild. Google ska kunna läsa den.
- **Ett wow-ögonblick.** Något besökaren minns och berättar om, som hör ihop med
  verksamheten. I CyberNoodle ändrar köket menyn och tre skärmar ändras samtidigt.
- **Elegant, inte högljudd.** Starka idéer med lugn typografi, luft och få färger.
  Rörelse som förstärker, aldrig stör, och som står still med minskad rörelse.
- **Byggd för alla.** Riktiga knappar och formulärfält, synligt fokus, statusrader som
  läses upp, rubriker i ordning och text som går att förstora.
- **Lätt.** Självhostade typsnitt med bara de tecken som används, bilder i AVIF och WebP
  i rätt storlek, ingen JavaScript som inte gör något besökaren märker.
- **Sanningsenlig.** En riktig kund har bara riktiga uppgifter: inga påhittade omdömen,
  betyg, siffror eller personer. Ett koncept märks Koncept.

## Godkännande

1. Ahmed godkänner briefen och designriktningen (DESIGN_LANGUAGE.md och design.json,
   `godkand` i design.json) innan sidorna byggs.
2. Grinden är grön och designkritikern ger minst 4 i varje del av rubriken.
3. Ahmed ser den färdiga sajten i mobil och dator och publicerar själv med
   `python3 fabrik.py publicera <kund>`.
