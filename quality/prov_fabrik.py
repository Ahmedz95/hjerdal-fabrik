#!/usr/bin/env python3
"""Provkör fabrikens delar för egen design: kundens egna filer ovanpå startern, gränsen mot
det som delas av alla kunder, och kontrollen av brief och designspec. CI kör den.

    python3 quality/prov_fabrik.py

Bygger en provkund i en tillfällig mapp, med Bistro Nordviks kundfil, och lämnar inget
efter sig i kunder/ eller ut/.
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

FABRIK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FABRIK))
import fabrik  # noqa: E402

fel = 0


def prov(namn: str, villkor: bool, detalj: str = "") -> None:
    global fel
    print(f"  {'ok ' if villkor else 'FEL'} {namn}" + (f": {detalj}" if detalj and not villkor else ""))
    fel += not villkor


def stoppar(fn, *args) -> str:
    """Felmeddelandet om fn stoppar med FabrikFel, annars tom text."""
    try:
        fn(*args)
    except fabrik.FabrikFel as e:
        return str(e)
    return ""


def skriv(fil: Path, text: str) -> None:
    fil.parent.mkdir(parents=True, exist_ok=True)
    fil.write_text(text, encoding="utf-8")


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="hjerdal-prov-"))
    fabrik.KUNDER = tmp / "kunder"
    kund = "prov-eget"
    mapp = fabrik.KUNDER / kund
    try:
        shutil.copytree(FABRIK / "kunder" / "bistro-nordvik", mapp)

        fabrik.rubrik("Schemat")
        schema = json.loads((fabrik.SCHEMAN / "design.schema.json").read_text(encoding="utf-8"))
        prov("en färg i fel format stoppas", any(f == "farger.bg" for f, _ in fabrik.schemafel(
            {"farger": {"bg": "svart"}}, schema)))
        prov("ett fält som inte finns stoppas", ("okant", "finns inte i schemat") in fabrik.schemafel({"okant": 1}, schema))
        prov("WCAG-kontrasten räknas som i temat", abs(fabrik.wcag_kontrast("#000000", "#FFFFFF") - 21) < 0.01)

        fabrik.rubrik("Delar, unik design och förslag")
        data = fabrik.las_kund(kund)
        prov("en variant kan byta en del", fabrik.tolka_variant("afton:kol:tejp") == {"stil": "afton", "tema": "kol", "etiketter": "tejp"})
        prov("en del som inte finns stoppas", "finns inte" in stoppar(fabrik.tolka_variant, "afton:komiska"))
        d = fabrik.design_med_standard(fabrik.med_design(fabrik.med_design(data, stil="hjerdal", typsnitt="garamond"), stil="afton"))
        prov("en annan stil kommer med sina egna delar", d["typsnitt"] == "bodoni" and d["etiketter"] == "linje", str(d))
        d = fabrik.design_med_standard(fabrik.med_design(data, stil="mjuk", foton="svartvita"))
        prov("en vald del går före stilens", d["foton"] == "svartvita" and d["former"] == "mjuka", str(d))
        prov("variantens mapp har delarna som inte är stilens", fabrik.variantnamn(d) == f"mjuk-{d['tema']}-{d['hero']}-{d['meny']}-svartvita")
        tvilling = fabrik.KUNDER / "prov-tvilling"
        tvilling.mkdir(parents=True)
        skriv(tvilling / "kund.json", json.dumps({**data, "namn": "Tvillingen"}, ensure_ascii=False))
        lika = fabrik.lika_kunder(kund, data)
        prov("samma design som en annan kund märks", [n for _, n, _ in lika] == ["Tvillingen"], str(lika))
        prov("rådet säger vad som behöver bytas", fabrik.likhet_rad(lika[0][2]) == "Byt typsnitt eller färger och två val till." if lika else False)
        prov("en egen accent räcker inte", bool(fabrik.lika_kunder(kund, fabrik.med_design(data, accent="#7A3B2E"))))
        prov("en annan stil räcker", not fabrik.lika_kunder(kund, fabrik.med_design(data, stil="stampel")))
        prov("samma typsnitt och färger är för lika, även med annan layout", bool(fabrik.lika_kunder(kund, fabrik.med_design(
            data, former="tjocka", etiketter="tejp", foton="lutande", meny="numrerad"))))
        skriv(tvilling / "arkiv.json", "{}")
        prov("en arkiverad kund räknas inte", not fabrik.lika_kunder(kund, data))
        (tvilling / "arkiv.json").unlink()
        skriv(tvilling / "design.json", "{}")
        prov("en kund med egen design räknas inte", not fabrik.lika_kunder(kund, data))
        (tvilling / "design.json").unlink()
        forslag = fabrik.forslag(kund, data)
        valda = [fabrik.designavtryck(fabrik.med_design(data, **fabrik.tolka_variant(v))) for v in forslag]
        prov("förslagen är fyra olika stilar", len({d["stil"] for d in valda}) == 4, str(forslag))
        prov("förslagen har fyra olika teman", len({d["tema"] for d in valda}) == 4, str(forslag))
        prov("inget förslag är för likt en annan kund", not any(fabrik.lika_kunder(kund, fabrik.med_design(data, **fabrik.tolka_variant(v)))
                                                               for v in forslag), str(forslag))
        prov("förslagen är inte för lika varandra", all(fabrik.for_lik(a, b) is None for i, a in enumerate(valda) for b in valda[i + 1:]))
        prov("samma kund får samma förslag", fabrik.forslag(kund, data) == forslag)
        prov("ett kafé får Mjuk först", fabrik.forslag(kund, {**data, "kok": ["Kafé", "Bageri"]})[0].startswith("mjuk:"))
        shutil.rmtree(tvilling)

        fabrik.rubrik("Brief och designspec")
        shutil.copy2(fabrik.SCHEMAN / "mallar" / "brief.json", mapp / "brief.json")
        prov("en brief från mallen stoppas tills den är ifylld", "är inte ifyllt" in stoppar(fabrik.granska_underlag, kund))
        brief = {"kund": kund, "verksamhet": "En provrestaurang som finns för att fabriken ska kunna provköras i CI.",
                 "malgrupp": "Fabrikens egna kontroller, inga riktiga gäster.", "mal": ["att bygget går igenom"],
                 "kansla": ["lugn", "tydlig"], "maste": ["menyn som riktig text"], "fakta": "koncept",
                 "referenser": ["cybernoodle"]}
        skriv(mapp / "brief.json", json.dumps(brief, ensure_ascii=False))
        design = json.loads((fabrik.SCHEMAN / "mallar" / "design.json").read_text(encoding="utf-8"))
        design.update(ide="En provrestaurang i svart och vitt, utan annat än det som behövs.",
                      typskala="som startern", layout="som startern", wow="Att allt går igenom grinden utan ett enda fel.")
        design["rorelse"]["princip"] = "Ingen rörelse alls i provet."
        design["farger"]["muted"] = "#BBBBBB"
        skriv(mapp / "design.json", json.dumps(design, ensure_ascii=False))
        prov("för låg kontrast i designspecen stoppas", "kontrasten" in stoppar(fabrik.granska_underlag, kund))
        design["farger"]["muted"] = "#596066"
        design["referenser"] = ["finns-inte"]
        skriv(mapp / "design.json", json.dumps(design, ensure_ascii=False))
        prov("en referens som inte finns i examples/ stoppas", "finns inte i examples/" in stoppar(fabrik.granska_underlag, kund))
        design["referenser"] = ["cybernoodle"]
        skriv(mapp / "design.json", json.dumps(design, ensure_ascii=False))
        shutil.copy2(fabrik.SCHEMAN / "mallar" / "DESIGN_LANGUAGE.md", mapp / "DESIGN_LANGUAGE.md")
        prov("ett designspråk från mallen stoppas", "inte ifylld" in stoppar(fabrik.granska_underlag, kund))
        skriv(mapp / "DESIGN_LANGUAGE.md", "# Designspråk: provet\n\nSvart och vitt.\n")
        prov("ifylld brief och designspec går igenom", not stoppar(fabrik.granska_underlag, kund), stoppar(fabrik.granska_underlag, kund))

        fabrik.rubrik("Gränsen mot det delade")
        skriv(mapp / "src/components/core/Seo.astro", "---\n---\n")
        prov("en ändrad core-komponent stoppas", "delas av alla kunder" in stoppar(fabrik.egna_filer, kund))
        (mapp / "src/components/core/Seo.astro").unlink()
        skriv(mapp / "src/lib/egen.ts", "export const x = 1;\n")
        prov("en fil i src/lib/ stoppas", "utanför det en kund får ändra" in stoppar(fabrik.egna_filer, kund))
        shutil.rmtree(mapp / "src/lib")
        skriv(mapp / "src/styles/bas.css", "")
        prov("en ny bas.css stoppas", "delas av alla kunder" in stoppar(fabrik.egna_filer, kund))
        (mapp / "src/styles/bas.css").unlink()

        fabrik.rubrik("Egen design ovanpå startern")
        # Kännetecknen från inspirationen syns när de är ifyllda, också med en egen design.
        data = json.loads((mapp / "kund.json").read_text(encoding="utf-8"))
        data["remsa"] = ["Surdeg", "Naturvin", "Uteservering"]
        data["stampelkort"] = {"rubrik": "Kaffe*kortet*", "text": "Köp nio kaffe, det tionde bjuder vi på.", "antal": 10}
        data["fragor"] = [{"fraga": "Behöver vi boka?", "svar": "Till middag, ja."}, {"fraga": "Får hunden följa med?", "svar": "Ja, ute."}]
        data["om"]["historia"] = [{"nar": "2009", "text": "Vi öppnar vid hamnen."}, {"nar": "I dag", "text": "Samma kök."}]
        skriv(mapp / "kund.json", json.dumps(data, ensure_ascii=False, indent=2))
        skriv(mapp / "src/config/brand.json", json.dumps({"farger": "egna", "temaFarg": "#0A0B10", "skript": True}))
        tokens = (fabrik.STARTER / "src/styles/tokens.css").read_text(encoding="utf-8")
        skriv(mapp / "src/styles/tokens.css", tokens.replace("html {\n", "html {\n  --bg: #0A0B10; --surface: #15171F; --ink: #F2EEE6; --muted: #B9B2A6;"
                                                               " --line: #2A2D38; --accent: #FF4FA3; --accent-ink: #0A0B10; color-scheme: dark;\n", 1))
        skriv(mapp / "src/styles/brand.css", ".prov-egen { letter-spacing: .5em; }\n")
        sidhuvud = (fabrik.STARTER / "src/components/brand/Sidhuvud.astro").read_text(encoding="utf-8")
        skriv(mapp / "src/components/brand/Sidhuvud.astro", sidhuvud.replace('<header class="top">', '<header class="top prov-egen">'))
        sidfot = (fabrik.STARTER / "src/components/brand/Sidfot.astro").read_text(encoding="utf-8")
        skriv(mapp / "src/components/brand/Sidfot.astro", sidfot + "<script>document.documentElement.dataset.js = '1';</script>\n")
        skriv(mapp / "public/prov.txt", "provkunden\n")
        ut = fabrik.bygg(kund, tmp / "ut")
        start = (ut / "dist/index.html").read_text(encoding="utf-8")
        prov("kundens sidhuvud används", '<header class="top prov-egen">' in start)
        prov("kundens brand.css kommer med", ".prov-egen{letter-spacing:.5em}" in start)
        prov("kundens tokens.css kommer med", "--bg: #0A0B10" in start or "--bg:#0A0B10" in start)
        prov("temats färger används inte med egna färger", ":root{--bg:" not in start)
        prov("theme-color kommer från brand.json", '<meta name="theme-color" content="#0A0B10">' in start)
        prov("egen JavaScript är tillåten med skript i brand.json", "dataset.js" in start or any(
            "dataset.js" in f.read_text(encoding="utf-8") for f in (ut / "dist").rglob("*.js")))
        prov("kundens public/ kommer med", (ut / "dist/prov.txt").exists())
        om_oss = (ut / "dist/om-oss/index.html").read_text(encoding="utf-8")
        prov("remsan står under första skärmen", "<li>Naturvin</li>" in start and start.index('class="remsa"') < start.index('id="fran-menyn"'))
        prov("stämpelkortet har tio rutor och den sista bjuds", start.count('class="stampelkort-ruta') == 10
             and start.count('stampelkort-ruta bjuds"') == 1 and "Kaffe<em>kortet</em>" in start)
        prov("frågorna går att öppna utan JavaScript", start.count('<details class="fraga">') == 2)
        prov("historien är en tidslinje på Om oss", om_oss.count('class="tidslinje-nar"') == 2 and 'class="tidslinje-nar"' not in start)
        prov("kundens filer stannar i ut/, inte i startern", not (fabrik.STARTER / "public/prov.txt").exists())

        fabrik.rubrik("Utan brand.json gäller starterns regler")
        (mapp / "src/config/brand.json").unlink()
        prov("egen JavaScript utan skript i brand.json stoppas", "Kontrollen hittade" in stoppar(fabrik.bygg, kund, tmp / "ut"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{'Allt fungerar.' if not fel else f'{fel} fel.'}")
    return 1 if fel else 0


if __name__ == "__main__":
    sys.exit(main())
