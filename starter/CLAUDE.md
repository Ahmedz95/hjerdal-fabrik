# Startern

Astro-sajten som varje kund byggs från. `fabrik.py` kopierar den till `ut/<kund>/`,
lägger kundens `kund.json` i `src/data/`, kundens bilder i `src/assets/bilder/` och en
kunds egen design (`kunder/<kund>/src/` och `public/`) ovanpå, och bygger.

## Lagren

| Lager | Var | Vem ändrar |
|---|---|---|
| Innehållet | `src/data/kund.json`, kontrollerad mot `src/lib/schema.ts` | Säljaren i Designer |
| Funktionen | `src/components/core/`, `src/layouts/`, `src/lib/`, `src/config/site.ts` | Startern, för alla kunder |
| Utseendet | `src/components/brand/`, `src/pages/`, `src/styles/tokens.css`, `src/styles/brand.css`, `src/config/brand.json` | Kunden med egen design, i `kunder/<kund>/` |

CSS:en läggs i den här ordningen i `src/layouts/Bas.astro`: `tokens.css`
(standardvärden), `bas.css` (starterns grund), delarna (`src/styles/typsnitt/`,
`former/`, `etiketter/` och `foton/`, en fil per val), stilens egna grepp
(`src/styles/stilar/<stil>.css`) och sist `brand.css` (kundens egen, tom här). Det som
står senare vinner. Vilka filer det blir avgör `astro.config.mjs` från kundfilen
(`valdaDelar()` i `src/lib/designval.ts`), och en del märker sina regler med sitt
attribut på `<html>`, som `[data-typsnitt="bodoni"]`.

`src/config/brand.json` säger hur kundens design tar över:

- `"farger": "tema"` (standard): färgerna kommer från temat i kundfilen.
  `"egna"`: kundens `tokens.css` sätter `--bg`, `--surface`, `--ink`, `--muted`,
  `--line`, `--accent`, `--accent-ink` och `color-scheme`, och `temaFarg` är
  webbläsarens färg runt sidan i mobilen.
- `"skript": true`: egen JavaScript är tillåten på alla sidor, som förbättring.

## Regler för koden

- **Fakta kommer från kundfilen.** Meny, priser, öppettider, adress, telefon och bokning
  läses från `kund` (`src/lib/kund.ts`) och skrivs aldrig in i en komponent, så att
  säljaren kan ändra dem i Designer. Text som hör till designen, som en rubrik i en egen
  sektion, får stå i kundens komponent.
- **Använd det som finns.** `url()` för länkar inom sajten (förhandsvisningarna ligger
  under en annan sökväg), `telLank()`, `bild()` och `<Picture>` från `astro:assets` med
  `widths`, `sizes` och AVIF och WebP, `MenySektion` och `Oppettider` för menyn och
  öppettiderna, `restaurangLd()` och `menyLd()` för strukturerad data.
- **En sida har `Bas` som ram** med titel, description och sökväg, och exakt en `<h1>`.
  Rubrikerna kommer i ordning. Sidor som kunden kan stänga av (om-oss, skarm, qr) tas
  bort av fabriken.
- **Tillgängligt.** Riktiga `<button>`, `<a>` och formulärfält med `<label>`. Synligt
  fokus. Knappar minst 44 px höga. Status som ändras (en bokning skickad, ett filter
  valt) i ett element med `aria-live="polite"`. Text i bilder finns också som text.
- **Mobilen först.** Skriv CSS för 360 px och lägg till för större skärmar med
  `min-width`. Storlekar med `clamp()`. Ingen sidledsscroll, aldrig.
- **CSS-variablerna** från `tokens.css` och temat i stället för fasta värden. Inga
  `!important` utom för minskad rörelse.
- **Rörelse.** Allt som rör sig av sig självt står still med
  `@media (prefers-reduced-motion: reduce)`, och animationer stannar när de inte syns
  (IntersectionObserver). Rörelse förstärker; innehållet väntar aldrig på den.
- **JavaScript** som `<script>` i komponenten (Astro buntar den), utan ramverk, och bara
  när det gör något besökaren märker. Sidan fungerar utan.
- **Typsnitt** från ett `@fontsource`-paket (lägg till det i `package.json` här, så finns
  det för alla kunder) eller en `.woff2` i kundens `src/assets/typsnitt/`, laddat med
  `@import` eller `@font-face` i kundens CSS. Aldrig från Google Fonts eller en CDN.
- **Inget från andra webbplatser** när sidan laddas: inga skript, typsnitt, kartor eller
  spårning. En länk till kartan går bra.

## Prova

```sh
python3 fabrik.py bygg <kund>                # bygg och kontrollera
python3 fabrik.py kvalitet <kund> --snabb    # webbläsarkontrollen och skärmdumpar
npm run dev                                  # i ut/<kund>/, för att se ändringar direkt
```

`npm run dev` i `ut/<kund>/` visar en kopia: ändra i `starter/` eller `kunder/<kund>/`
och bygg igen, annars försvinner ändringen vid nästa bygge.
