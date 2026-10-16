# Designspråk: startern

Starterns eget utseende, som varje kund från mallen får: HJERDAL:s formspråk, samma som
hjerdal.se. Säljaren varierar det med sju stilar, tolv färgteman och layouterna i
Designer. En kund med egen design har ett eget `DESIGN_LANGUAGE.md` i `kunder/<kund>/`,
skrivet från mallen i `schemas/mallar/`, och det går före det här.

## Idén

Lugnt, luftigt och tydligt. Restaurangen och maten står i centrum, sajten håller sig i
bakgrunden och gör det lätt att se menyn, hitta dit och boka.

## Färg

Temat i kundfilen ger sju färger: bakgrund, yta, text, grå text, linjer, accent och
texten på accenten. Accenten bara på det man kan klicka på och i ord som framhävs i en
rubrik. Där används `--accent-tekst`, som blir textfärgen när accenten är för svag mot
bakgrunden. Bygget stoppar om en färg får för låg kontrast (`src/lib/tema.ts`).

## Typografi

Stilen `hjerdal`: stora lätta rubriker i Albert Sans (Fraunces i teman med serif),
spärrade versala etiketter och priser i mono. De andra stilarna byter typsnitt och
former: `klassisk` (Cormorant Garamond och Source Serif), `kvarter` (Oswald och Archivo),
`mjuk` (Bricolage Grotesque och Figtree), `afton` (Bodoni Moda och Jost), `affisch`
(Schibsted Grotesk i allt) och `stampel` (Archivo med Fraunces). De tre sista bygger på
inspirationen i `examples/inspiration.md`. Ord mellan `*stjärnor*` i en rubrik i kundfilen
blir `<em>`, och stilen bestämmer hur de framhävs.

## Layout och rytm

En spalt i mobilen, två i datorn. Stora avstånd mellan sektionerna, 1 px linjer, inga
skuggor, runda knappar. Startsidans överdel är text, text och bild eller helbild, och
menyn är lista, två kolumner, kort eller numrerad. Afton, Affisch och Stämpel bryter
mot det här med tunna eller tjocka linjer, raka hörn och skuggor; det står i deras filer
i `src/styles/stilar/`.

## Rörelse

Nästan ingen: knappar lyfter två pixlar under muspekaren. Ingen JavaScript utom på
menyskärmen.

## Var mallen slutar

Mallen ger en prydlig sajt, och rubriken för designgranskningen sätter den till 3. Det
som saknas för en 5:a är det som bara går att göra per kund: en idé från verksamheten,
egna typsnitt och bilder, en egen rytm och ett wow-ögonblick. Det är vad egen design är till för.
