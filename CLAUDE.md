# Sajtfabriken

HJERDAL:s fabrik för restaurangsajter. En sajt görs på ett av två sätt:

- **Från mallen.** Säljaren fyller i kundfilen i HJERDAL Designer och väljer stil, tema
  och layout. Ingen kod, inga AI-anrop. Det är så alla kunder byggs i dag.
- **Med egen design.** Claude Code gör en egen design för kunden ovanpå samma starter,
  från en brief och en godkänd designriktning, och mäter den mot HJERDAL:s case. Det är
  så en sajt når standarden i `quality/STANDARD.md`. Arbetsgången står i
  `.claude/skills/ny-sajt/SKILL.md`.

## Kartan

| Var | Vad |
|---|---|
| `fabrik.py` | Fabrikens kommandon: ny, bygg, kvalitet, validera, varianter, publicera, designer, mcp. Ligger kvar i roten eftersom Designer-programmet och Claude-appens MCP-inställning pekar hit. |
| `starter/` | Astro-sajten alla kunder byggs från. Regler för koden i `starter/CLAUDE.md`. |
| `starter/src/components/core/` | Det som fungerar likadant för alla: metadata och SEO, menyn, öppettiderna. Delas av alla kunder. |
| `starter/src/components/brand/` | Utseendet: sidhuvud, startsidans överdel, sidfot. En kund med egen design byter dem. |
| `starter/src/styles/` | `tokens.css` (mått, typsnitt, former), `bas.css` (starterns grund), mallens delar i `typsnitt/`, `former/`, `etiketter/` och `foton/`, `stilar/` (det bara en av mallens sju stilar har) och `brand.css` (tom, kundens egen). |
| `starter/cms.manifest.json` | De fält som går att redigera: kundfilens schema, stilar och teman. Designer ritar sitt formulär från den. Skrivs av `npm run schema` i `starter/`. |
| `kunder/<kund>/` | `kund.json` och `bilder/`. Med egen design även `brief.json`, `design.json`, `DESIGN_LANGUAGE.md` och kundens egna filer i `src/` och `public/`, som läggs ovanpå startern vid bygget. |
| `schemas/` | JSON Schema för briefen och designspecen, och mallarna för en ny kund. |
| `quality/` | Standarden, rubriken för designgranskningen och kraven för Lighthouse. |
| `examples/` | HJERDAL:s godkända case och Ahmeds inspiration, med vad som gör dem bra. |
| `scripts/` | Verktyg som fabriken kör, som webbläsarkontrollen `kvalitet.mjs`. |
| `.claude/skills/`, `.claude/agents/` | Arbetsgångarna och specialisterna: byggare, designkritiker och granskare. |
| `designer/` | HJERDAL Designer, formuläret och Mac-programmet för säljare. |
| `ut/` | Byggen och förhandsvisningar. Checkas aldrig in och ändras aldrig för hand. |

## Regler

- **Svenska** i kod, kommentarer, texter, commits och PR:er, som resten av repot. Namn i
  koden utan å, ä och ö (`kundmapp`, `starterns_version`).
- **Python bara med standardbiblioteket och för Python 3.9**, den som följer med macOS.
  Designer körs på säljarnas datorer. Kör `python3.9 designer/prov.py` efter en ändring i
  `fabrik.py` eller `designer/`.
- **Startern ändras i `starter/`**, aldrig i `ut/`. En ändring i `core/`, `layouts/` eller
  `lib/` når alla kunder, så kör `python3 fabrik.py kvalitet` (alla kunder) före en PR.
  Efter en ändring i `src/lib/schema.ts` eller `src/lib/designval.ts`: `npm run schema` i
  `starter/` och checka in `cms.manifest.json`.
- **En kunds egen design bara i kundens mapp:** `src/components/brand/`, `src/pages/`,
  `src/styles/`, `src/assets/`, `public/` och `src/config/brand.json`. Fabriken stoppar
  allt annat. Behövs något nytt i det delade, gör det i `starter/` så att alla kunder får det.
- **Grinden ska vara grön** (`python3 fabrik.py kvalitet <kund>`) innan en sajt visas för
  Ahmed. Grinden mäter bara det mätbara; designen bedöms mot `quality/rubrik.md`.
- **Inget från andra webbplatser.** Typsnitt ligger på sajten (ett `@fontsource`-paket i
  `starter/package.json` eller en fil i kundens `src/assets/typsnitt/`), inga CDN:er,
  ingen spårning, inga kakor. Därför behövs ingen cookiebanner.
- **JavaScript bara som förbättring**, med `"skript": true` i kundens `brand.json`. Allt
  innehåll ska finnas och fungera utan.
- **Sanningsenligt.** En riktig kund har bara riktiga uppgifter: inga påhittade omdömen,
  betyg, siffror, personer eller priser. Ett koncept märks Koncept. Bilder är kundens
  egna eller har en licens för kommersiell användning, och står i `design.json`.
- **Inspiration är inte material.** Från `examples/inspiration.md` tar vi idéer och nivå,
  aldrig texter, bilder, logotyper eller kod.
- **Repot är publikt** (oktober 2026). Inga hemligheter, inga skärmdumpar av andras sajter
  och inga kunduppgifter som inte redan står på kundens egen sajt. Skärmdumpar och
  källfiler till exemplen ligger i projektets delade mapp, `/mnt/project-files/`.
- **Ahmed godkänner, Claude publicerar aldrig.** Designriktningen godkänns innan sidorna
  byggs (`godkand` i `design.json`) och den färdiga sajten innan `fabrik.py publicera`,
  som Ahmed kör själv. Arbetet lämnas som en PR, aldrig direkt på `main`.

## Kommandon

```sh
python3 fabrik.py ny <kund> --namn "Namn" --egen-design   # mappen med brief, designspec och egen design
python3 fabrik.py validera <kund>                          # kundfil, brief, designspec och egna filer, utan bygge
python3 fabrik.py bygg <kund>                              # bygg och kontrollera i ut/<kund>/
python3 fabrik.py kvalitet <kund> --snabb                  # grinden utan Lighthouse, med skärmdumpar i ut/<kund>/kvalitet/
python3 fabrik.py kvalitet <kund>                          # hela grinden
python3.9 designer/prov.py                                 # Designer och MCP
```
