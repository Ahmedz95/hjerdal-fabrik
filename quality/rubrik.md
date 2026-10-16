# Rubriken för designgranskningen

Designkritikern sätter 1 till 5 på varje del, med en mening om varför och den viktigaste
ändringen som skulle höja betyget. Betyget gäller både mobil och dator; den sämre avgör.

- **5:** i nivå med det bästa i `examples/`. Inget att ändra.
- **4:** bra och genomtänkt, med enstaka detaljer att putsa.
- **3:** prydligt men som en mall. Det här är fabrikens gamla nivå.
- **2:** något är fel som en besökare märker.
- **1:** trasigt eller saknas.

Sajten är godkänd när ingen del har under 4. En 3:a går tillbaka till byggaren med den
konkreta ändringen, och granskningen görs om på nya skärmdumpar.

| Del | Vad som bedöms | En 5:a | En 3:a |
|---|---|---|---|
| Första intrycket | Första skärmen i mobil och dator, innan besökaren scrollar | Stämningen och vad stället är syns direkt, och man vill dit | En rubrik och två knappar, som vilken restaurang som helst |
| Identitet | Hur mycket sajten är just den här kunden | Typsnitt, färg, bilder och ord hör ihop och går inte att flytta till en annan kund | Byt namnet och det kunde vara en annan restaurang |
| Typografi | Hierarki, typsnittspar, storlekar, radlängd, radbrytningar | Rubrikerna bär designen, brödtexten är lugn och lätt att läsa i mobilen | Rätt storlekar men ingen karaktär |
| Färg och kontrast | Paletten, hur accenten används, mörka och ljusa partier | Få färger som bygger stämningen, accenten bara där den betyder något | Färgerna är okej men slumpvisa eller platta |
| Layout och rytm | Rutnät, luft, variation mellan sektioner, mobilen | Varje sektion har sin form, och rytmen leder ögat neråt | Samma block upprepade hela vägen ner |
| Bilder | Kvalitet, beskärning, ljus, samma behandling överallt | Bilderna ser ut som en fotografering för kunden | Olika stilar, dålig beskärning eller för få bilder |
| Text | Konkret, kundens röst, svenska som inte låter översatt | Varje mening säger något om just den här kunden | Allmänna fraser som "kärlek till mat" |
| Med tummen | Meny, öppettider, adress, boka eller ring | Allt viktigt ett tumtryck bort, och bokningen går på under en minut | Det finns men kräver scroll eller letande |
| Wow-ögonblicket | Det besökaren minns och berättar om | Hör ihop med verksamheten och fungerar felfritt | Finns inte, eller är en effekt utan mening |
| Finish | Hover, fokus, tomma lägen, 404, favikon, övergångar, laddning | Allt är omhändertaget, också det man sällan ser | Standardlägen och lösa trådar |

## Så skrivs granskningen

```
Kund: <kund>, granskad <datum> mot <referenser i design.json>

Första intrycket  4  Neonrubriken bär, men ramenfotot är beskuret så att skålen hamnar under kanten i mobilen.
                     Ändra: object-position så att skålen syns helt i 390 px.
...
Godkänd: nej (Layout 3)
```

Skriv vad du ser på skärmdumpen, med sidan och läget (till exempel `meny-mobil.jpg`),
inte vad koden borde göra. Föreslå den minsta ändringen som höjer betyget.
