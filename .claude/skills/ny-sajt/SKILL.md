---
name: ny-sajt
description: Gör en kundsajt med egen design i fabriken, från brief till en godkänd sajt som klarar grinden. Använd när en kund ska få en egen design i stället för mallen, eller när en befintlig kund ska lyftas till HJERDAL:s standard.
---

# Ny sajt med egen design

Målet är en sajt som kan stå bredvid HJERDAL:s case i `examples/`, inte en snyggare mall.
Läs `CLAUDE.md`, `starter/CLAUDE.md` och `quality/STANDARD.md` först. Arbetet görs på en
gren och lämnas som en PR. Två gånger väntar du på Ahmed: när designriktningen är klar,
och när sajten är klar.

## 1. Underlaget

1. Finns inte kunden: `python3 fabrik.py ny <kund> --namn "Namn" --egen-design`. Finns
   den redan från mallen: lägg till `brief.json`, `design.json` och `DESIGN_LANGUAGE.md`
   från `schemas/mallar/`.
2. Fyll i `kund.json` med kundens riktiga uppgifter: meny, priser, öppettider, adress,
   telefon, bokning. Saknas något, fråga. Hitta aldrig på något för en riktig kund.
3. Skriv `brief.json` från det Ahmed eller kunden har sagt (`schemas/brief.schema.json`
   förklarar varje fält). `fakta` är `riktiga` eller `koncept`.
4. `python3 fabrik.py validera <kund>` ska bara klaga på det som väntar på designen.

## 2. Idén

1. Läs `examples/README.md`, `examples/inspiration.md` och mapparna för de case briefen
   pekar på. Titta på skärmdumparna i `/mnt/project-files/case/<case>/media/` och
   `/mnt/project-files/inspiration/restauranger/`, i mobil och dator.
2. Hitta idén i verksamheten, inte i en trend: en plats, en tid på dygnet, ett hantverk,
   ett problem kunden har varje dag. CyberNoodles idé är en gränd i Osaka klockan tre på
   natten, och dess wow är kundens verkliga problem: menyn på tre ställen.
3. Bestäm wow-ögonblicket. Det ska höra ihop med verksamheten och gå att bygga ordentligt.

## 3. Designriktningen

1. Skriv `DESIGN_LANGUAGE.md` (orden) och `design.json` (besluten): färgerna med varje par
   av text och bakgrund i `kontrast`, typsnitten med källa och licens, rörelsen och vad
   som står still med minskad rörelse, wow och referenserna i `examples/`.
2. `python3 fabrik.py validera <kund>` ska vara grön. Kontrasten räknas där.
3. **Visa Ahmed riktningen och vänta på ett ja.** Kort: idén, känslan, färgerna,
   typsnitten och wow, gärna med en skiss av första skärmen i mobilen. Skriv sedan
   `"godkand": { "av": "Ahmed", "datum": "<datum>" }` i `design.json`.

## 4. Bygget

Ge byggaren (`.claude/agents/byggare.md`) kunden och riktningen. Byggaren arbetar bara i
kundens mapp:

- `src/config/brand.json`: `"farger": "egna"` med `temaFarg`, och `"skript": true` om
  wow kräver JavaScript.
- `src/styles/tokens.css`: färger, typsnitt, mått och former. `src/styles/brand.css`:
  resten av utseendet.
- `src/components/brand/`: `Sidhuvud`, `Hero`, `Sidfot` och kundens egna komponenter.
- `src/pages/`: bara de sidor som behöver en annan uppbyggnad. Fakta läses fortfarande
  från kundfilen.

Efter varje steg: `python3 fabrik.py kvalitet <kund> --snabb`, och titta på
skärmdumparna i `ut/<kund>/kvalitet/`. Grinden ska vara grön hela vägen, inte bara på slutet.

## 5. Granskningen

1. Designkritikern (`.claude/agents/designkritiker.md`) bedömer skärmdumparna mot
   `quality/rubrik.md`, `DESIGN_LANGUAGE.md` och referenserna.
2. Allt under 4 går tillbaka till byggaren med den konkreta ändringen. Upprepa med nya
   skärmdumpar tills ingen del är under 4.
3. Granskaren (`.claude/agents/granskare.md`) kör hela grinden med Lighthouse och går
   igenom det grinden inte mäter. Rätta allt den hittar.

## 6. Lämna över

1. `python3 fabrik.py kvalitet <kund>` är grön.
2. Commit på en gren och en PR med skärmdumparna av första skärmen i mobil och dator,
   designkritikerns tabell och det som återstår.
3. **Visa Ahmed sajten.** Han publicerar själv med `python3 fabrik.py publicera <kund>`.
