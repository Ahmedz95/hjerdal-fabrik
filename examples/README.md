# Exempel

Måttstocken för fabriken. Byggaren läser dem innan designen bestäms, och designkritikern
jämför skärmdumparna från `fabrik.py kvalitet` med dem. En kunds `design.json` pekar ut
de exempel sajten ska mätas mot, med mappens namn under `referenser`.

Det finns två sorter:

- **HJERDAL:s egna case** (en mapp per case här). Godkända av Ahmed, och det är den nivån
  varje kundsajt ska nå. Varje mapp säger vad caset är, var filerna finns och vad som gör
  det bra.
- **Inspiration** (`inspiration.md`). Andra restaurangsajter Ahmed har valt ut, med vad
  som är värt att ta efter och vad som inte är det. De är andras arbete: vi lär oss av
  idéerna och gör aldrig kopior av texter, bilder, logotyper eller kod.

Repot är publikt, så skärmdumparna och källfilerna ligger i projektets delade mapp och
inte här: `/mnt/project-files/case/` för casen och `/mnt/project-files/inspiration/`
för inspirationen. En Claude-session i projektet når dem direkt. Utanför projektet går
det att ta egna skärmdumpar av inspirationen från adresserna.

## Casen

| Mapp | Vad | Varför det är med |
|---|---|---|
| `cybernoodle/` | Ramenrestaurang, koncept | Stämning från första sekunden, menyn som köket ändrar på ett ställe |
| `alvskogs-bageri/` | Stenugnsbageri, koncept | Värme utan klichéer, förbeställning med tummen, dolda överraskningar |

HJERDAL:s andra case (hantverkare, mäklare, redovisning, tandklinik, barberare) ligger i
`/mnt/project-files/case/` och visar samma nivå för andra branscher. Grand Taxi Lund är
en riktig kund med personuppgifter i bilderna och används inte som exempel.
