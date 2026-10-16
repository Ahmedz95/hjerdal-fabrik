---
name: granska-sajt
description: Granskar en kunds sajt mot HJERDAL:s standard: kör grinden, låter designkritikern och granskaren bedöma den och skriver en rapport med betyg och konkreta ändringar. Använd när någon frågar om en sajt håller måttet, före en överlämning, eller efter en ändring i startern.
---

# Granska en sajt

Granskningen ändrar ingenting. Den säger hur sajten står sig och vad som behöver göras.

1. `python3 fabrik.py kvalitet <kund>`. Röd grind: rapportera felen från utskriften och
   `ut/<kund>/kvalitet/rapport.json` först, de går före allt annat.
2. Låt designkritikern (`.claude/agents/designkritiker.md`) och granskaren
   (`.claude/agents/granskare.md`) granska samtidigt. Har kunden ingen `design.json`
   (en kund från mallen), mät mot `starter/DESIGN_LANGUAGE.md` och `examples/cybernoodle`.
3. Skriv rapporten:

```
<Kund>: <godkänd | inte godkänd>

Grinden: grön | röd (<antal> fel)
Design: <medel>, lägst <del> <betyg>
Tillgänglighet och SEO: <antal> fynd

De tre viktigaste ändringarna:
1. <sida och läge>: <vad som syns> -> <ändringen>
...
```

Därefter designkritikerns tabell och granskarens fynd. Hänvisa till skärmdumparna med
namn (`meny-mobil.jpg`), så att den som läser kan se själv.
