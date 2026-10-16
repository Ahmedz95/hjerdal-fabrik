# Inspiration

Restaurangsajter som Ahmed valde ut den 16 oktober 2026 som inspiration för designen.
Det är andras arbete: vi tar efter idéer och nivå, aldrig texter, bilder, logotyper eller
kod. Skärmdumpar i mobil och dator, första skärmen och hela sidan, ligger i
`/mnt/project-files/inspiration/restauranger/<adress>/`, med typsnitt och färger i
`info.json`.

## Det de har gemensamt

- **Rubriken har en röst.** Kort, konkret och bara möjlig för just det stället: "Many
  little dishes. One generous meal." (WATDA), "We cook with the dark and a little fire."
  (Ombra), "Do mundo para a brasa" (Assador 29). Aldrig "Välkommen till".
- **Första skärmen är en bild av stället eller maten, inte en stockbild.** Rök, eld,
  händer, fulla bord.
- **En idé från verksamheten bär sajten.** Köttets resa över världen som en karta med
  stämplar, avsmakningsmenyn som sex satser, stämpelkortet för kaffe.
- **Det praktiska direkt under första skärmen:** öppettider, adress, pris och boka, ofta
  som en smal rad eller en löpande remsa med det stället erbjuder.
- **Menyn som text med pris,** som kort med bild, som numrerad berättelse eller i flikar.
- **Två typsnitt som kontrasterar:** en stark rubrik (kondenserad grotesk, kursiv serif
  eller en sliten display) mot en lugn brödtext.

## Sajterna

| Sajt | Vad den gör bra | Ta inte efter |
|---|---|---|
| [Ombra](https://ombra-lemon.vercel.app) | Mörk, varm och stilla. Cormorant med kursiva ord i bärnsten, mycket luft, avsmakningsmenyn som sex numrerade satser, kockens historia som en tidslinje, en enda knapp: Reserve a seat. Närmast nivån vi vill ha för en finare restaurang. | Bakgrundsbilder så mörka att de försvinner. |
| [WATDA](https://watda.co.nz) | Mest personlighet för minst pengar: krämvit botten, oliv och tegelröd, jättelika versaler blandade med kursiv serif, lutade kort och stämplar på koreanska, en remsa med det viktigaste och en lista med frågor före besöket (bokning, lunch, veganskt, var). | Fyra olika stilgrepp i samma sektion blir lätt rörigt i mobilen. |
| [Assador 29](https://www.assador29.pt) | Film av kött på grillen som första skärm, en sliten displaystil som passar glöden, och en idé som håller: köttets ursprung som en karta och ett pass med stämplar. Tillbehören i flikar med bilder. | Texturer överallt, liten brödtext och omdömen från Google som utfyllnad. |
| [Chez Bacchus](https://chezbacchus-lb.com) | Fine dining i djupgrönt, plommon och guld. En rad under första skärmen med öppettider, prisnivå, adress och bokning. Varje upplevelse (chef's table, afternoon tea, vinkvällar) har en egen tydlig sektion med pris och tider. | En cookiebanner som täcker första skärmen, och för många erbjudanden på en sida. |
| [Glød](https://ottis-astro.pages.dev) | Självsäker typografi: namnet i jätteformat i svart på senapsgult, svartvita foton med gula linjer. En färg och ett typsnitt räcker långt. | Allt under första skärmen ritas fram av scrollanimationer, så en helsidesbild blir tom, och sidan heter "Your Page Title". |
| [Casa Victoria](https://casavictoria.cafe) | Ett wow som hör ihop med kaféet: stämpelkortet "8 kaffe och nästa bjuder vi på" direkt på sajten. Varma foton av lokalen och en remsa med det de serverar. | Allmänna typsnitt (Inter och Poppins) och karuseller. |
| [ÉTÉ](https://ete.restaurant/) | Palatsträdgården som första skärm med stora versaler över bilden, menyrader med punktlinjer fram till priset, varm beige. | Cookiebanner över rubriken, och stora tomma ytor där innehållet väntar på scrollanimationer. |
| [Bubbeleh](https://bubbeleh.com.br) | Mat i händer, en tydlig orange knapp för att beställa och rätterna som kort med pris. Lätt att förstå på en sekund. | Det ser ut som en mall; det är nivån vi vill bort från, inte till. |

## I mallen

Det här finns nu som val i Designer, så att en kund från mallen kan få nivån utan egen
design. Idéerna är tagna härifrån; texter, bilder och kod är våra egna.

| Val | Från | Vad |
|---|---|---|
| Stilen `afton` | Ombra, Chez Bacchus | Bodoni Moda med kursiva ord i accentfärgen, spärrade etiketter efter en tunn linje, mycket luft, en enda knapp. |
| Stilen `affisch` | Glød | Ett typsnitt i jätteformat, ingressen överst och rubriken längst ner, tjocka linjer, svartvita foton med linjer över. |
| Stilen `stampel` | WATDA, Casa Victoria | Feta versaler blandade med en mjuk serif, etiketter som tejp, lutande bilder, märkningen som stämplar, det praktiska som en mörk remsa. |
| Temana `kol`, `mossa`, `plommon` | Assador 29, Chez Bacchus, Ombra | Glöd, djupgrönt och vinrött med guld, för mörka och varma ställen. |
| Temana `oliv`, `terrakotta`, `senap` | WATDA, ÉTÉ, Glød | Kräm med oliv, varm beige med tegel och senapsgult med svart. |
| Menyn `numrerad` | Ombra | Sektionerna med stora siffror, romerska i Afton, som satserna i en avsmakningsmeny. |
| `*stjärnor*` i rubriken | Ombra, WATDA | Ett par ord i rubriken framhävs, kursivt eller i en annan stil. |
| `remsa` i kundfilen | WATDA, Casa Victoria | Det stället har som en remsa under första skärmen. Den står still, så att inget rör sig av sig självt. |
| `stampelkort` | Casa Victoria | Stämpelkortet från kassan som ett kort på startsidan, med den sista rutan som det som bjuds. |
| `fragor` | WATDA | Frågor före besöket på startsidan, som öppnas utan JavaScript. |
| `om.historia` | Ombra | Ställets historia som en tidslinje på sidan Om oss. |

Kännetecknen syns bara när kunden har fyllt i dem, med kundens riktiga innehåll.

## Det vi gör bättre som standard

- **Ingen cookiebanner.** Fabrikens sajter har ingen spårning och inga typsnitt eller
  skript från andra webbplatser, så det finns inget att fråga om. Första skärmen är fri.
- **Allt syns utan JavaScript.** Rörelse förstärker, men innehållet väntar aldrig på den.
- **Riktiga titlar och beskrivningar** på varje sida, kontrollerade i bygget.
