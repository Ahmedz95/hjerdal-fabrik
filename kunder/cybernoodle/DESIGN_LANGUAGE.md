# Designspråk: CyberNoodle

Den godkända designriktningen för kunden, i ord. Samma beslut i en form som går att
kontrollera står i design.json. Byggaren följer den här filen, och designkritikern
granskar sajten mot den. Ändras bara när riktningen ändras och är godkänd igen.

Riktningen är HJERDAL:s case i `examples/cybernoodle/`. Sajten är samma koncept gjort
om i fabriken: Astro-komponenter på startern, typsnitten på sajten och fakta i kundfilen.

## Idén

En gränd i Osaka klockan tre på natten. Mörkt, vått och upplyst av skyltar, med en
rykande skål ramen i mitten. Idén kommer från stället självt: kökschefen lärde sig ramen
i en gränd bakom Dotonbori, och restaurangen har öppet sent. Lugn japansk typografi gör
det elegant i stället för skrikigt.

## Känslan

Nattlig, våt och upplyst, elegant, hantverk. Inte skrikig, inte en spelsajt och inte en
pastisch med japanska tecken överallt: de japanska tecknen sitter på skyltarna och på
rätternas namn, där de skulle sitta i Osaka.

## Färg

- **Natten** `#09090F`, med `#12121C` och `#1B1B29` för ytor. Nattsvart med en blå ton.
- **Rispapper** `#EFE8DC` för texten, varm i stället för vit. Dämpad text `#9A96AD`.
- **Sakura** `#FF3D8B`, rosa neon: det man klickar på, namnet och de japanska namnen.
- **Cyan** `#3FE0FF`, kall neon: det som är valt, öppet nu, fokus och skärmens klocka.
- **Buljong** `#F3B65C`: bara priser och kvällens special.
- **Violett** `#C58BFF`: en skylt i fjärran, aldrig text man ska läsa.

Neon lyser med `text-shadow` och `box-shadow` i sin egen färg, aldrig på brödtext. Linjer
`#2A2A3D` skiljer avsnitt och menyns kort; formulärfält har kanten `#646180`, som syns.
Alla par av text och bakgrund klarar WCAG AA och står i design.json.

## Typografi

- **Shippori Mincho B1** (500, 700, 800) i namnet, rubrikerna, rätternas namn och
  skyltarna. En japansk serif med latinska tecken, så att svenska och japanska ser ut som
  samma hand. Namnet clamp(54px, 15vw, 110px), rubriker clamp(34px, 5.4vw, 64px).
- **Zen Kaku Gothic New** (400, 700) i brödtexten, 16-17 px.
- **Chakra Petch** (400, 500, 600) för etiketter, priser, klockor och siffror, spärrade
  med versaler i 11-13 px, som displayer i en stad.

Typsnitten ligger i `src/assets/typsnitt/` med sina licenser (OFL). De är beskurna med
`pyftsubset` till de latinska tecken som svenska behöver (U+0020-007E, U+00A0-00FF,
U+2010-203A, U+20AC, U+2190-2193, U+2212, U+2605) och de japanska tecken som står i
kundens filer, med `vert` och `palt` kvar för de vertikala skyltarna. Shippori och Zen
Kaku har en latinsk och en japansk fil per vikt, med `unicode-range` i tokens.css, så att
de latinska kommer först; Shippori 800 och Zen Kaku 400 hämtas direkt (Huvud.astro).
Chakra Petch har bara latinska tecken, och inget av typsnitten har ō, så japanska ord
skrivs utan streck (Dotonbori). Läggs en rätt med nya japanska tecken till, gör om
beskärningen från typsnittens TTF-filer (github.com/google/fonts, mappen `ofl/`):

```sh
pyftsubset ShipporiMinchoB1-ExtraBold.ttf --flavor=woff2 --unicodes="<japanska tecken>" \
  --layout-features+=palt,vert,vrt2,vkrn,vpal,tnum --output-file=src/assets/typsnitt/shippori-mincho-b1-800-jp.woff2
```

## Layout och rytm

Mobil först. Första skärmen i mobilen är namnet i neon, rubriken, Boka bord och Menyn,
och öppet nu. Fotot med ånga och de vertikala skyltarna kommer därefter; från 900 px står
de bredvid namnet. Menyns kort ligger i ett rutnät med en pixels linjer, en i bredd i
mobilen och två eller tre i dator. Avsnitten skiljs med linjer och nyanser av natt, med
gott om luft mellan dem. Sidhuvudet ligger fast överst, och Boka bord finns alltid där.

## Bilder

Två ramenfoton från Unsplash under Unsplash-licensen: en shoyu-ramen i en blåmönstrad skål
i första skärmen och en tonkotsu i en svart skål i Historia. Beskurna stående i dator och
liggande i mobilen, med ett rosa och blått neonskimmer och ånga ovanpå. Sidfoten säger
"Foton: Unsplash". Riktiga kunder har egna foton.

## Rörelse

Regn faller över en stadssiluett med tända fönster och suddiga skyltar. Ånga stiger från
skålarna. Namnet flimrar ibland som en skylt med glappkontakt, och neonskyltarna pulserar
långsamt. När köket ändrar menyn glitchar raderna som ändras, kort. Siffrorna
i Historia räknas upp när de syns. Allt som rör sig av sig självt stannar utanför
skärmen, och knappen Pausa rörelsen i första skärmen stoppar regnet, ångan och flimret.
Med minskad rörelse står allt still från början: regnet och ångan ritas en gång som en
stillbild, och ändringar syns direkt.

## Wow-ögonblicket

Bakom kulisserna: besökaren ändrar ett pris, markerar en rätt som slut eller skriver en
ny special, eller trycker på Fredagsrusning eller Happy hour. Menyn på sajten, QR-menyn i
mobilen och skärmen ovanför baren ändras samtidigt, och en ruta säger hur många
millisekunder det tog. Det är restaurangens verkliga problem, menyn på tre ställen, visat.

## Gör och gör inte

- Gör: menyn som riktig text som fungerar utan JavaScript. Skriptet ändrar bara det som
  redan står på sidan.
- Gör: öppet nu räknat från öppettiderna i kundfilen.
- Gör inte: väntetider, lediga platser, omdömen eller andra siffror som inte går att räkna
  fram. Caset hade väntetid och lediga platser; de är borttagna här.
- Gör inte: neon på brödtext eller fler än två neonfärger i samma ruta.
- Gör inte: typsnitt eller bilder från andra webbplatser.
- Bokningen är en demo och säger det i bekräftelsen. Den hittar inte på fullbokade
  tider; hos en riktig kund kommer de lediga tiderna från bokningssystemet. Utan
  JavaScript står telefonnumret där.
- 404-sidan är en fel gränd med en släckt skylt (迷子), och favikonen är namnets C i
  rosa neon.
