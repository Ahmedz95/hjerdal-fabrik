#!/usr/bin/env python3
"""HJERDAL:s sajtfabrik: från en kundfil till en färdig restaurangsajt.

Fabriken skriver ingen kod. Den kopierar startern (starter/), lägger in kundens
fil och bilder och kundens egen design om den har en (kunder/<kund>/src/), tar
bort sidor kunden inte har valt, bygger med Astro och kontrollerar resultatet.
Inga AI-anrop, så en ny sajt kostar inga credits. Hur en kund får en egen
design med Claude Code står i CLAUDE.md.

    python3 fabrik.py ny <kund> --namn "Bistro Nordvik" [--egen-design]
    python3 fabrik.py bygg <kund>
    python3 fabrik.py kvalitet [<kund> ...] [--snabb]
    python3 fabrik.py validera <kund>
    python3 fabrik.py varianter <kund> [klassisk:linne kvarter:skiffer:kort ...]
    python3 fabrik.py visa <kund> [--varianter]
    python3 fabrik.py kontroll <kund>
    python3 fabrik.py publicera <kund> [--varianter]
    python3 fabrik.py lista
    python3 fabrik.py designer
    python3 fabrik.py mcp

Bara Pythons standardbibliotek (Python 3.9 eller senare). Kräver Node 20
eller senare för bygget.
"""
from __future__ import annotations

import argparse
import datetime as dt
import functools
import hashlib
import html
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import webbrowser
from html.parser import HTMLParser
from pathlib import Path

FABRIK = Path(__file__).resolve().parent
STARTER = FABRIK / "starter"
KUNDER = FABRIK / "kunder"
UT = FABRIK / "ut"
SCHEMAN = FABRIK / "schemas"
# Mallen för en ny kunds kundfil.
MALL = SCHEMAN / "mallar" / "kund.json"
# De fält som går att redigera: kundfilens schema, stilar och teman. Kommer från startern
# (npm run schema i starter/), så att fabriken, startern och HJERDAL Designer alltid
# känner till samma val.
MANIFEST = STARTER / "cms.manifest.json"
SCHEMA = json.loads(MANIFEST.read_text(encoding="utf-8"))
_design = SCHEMA["schema"]["properties"]["design"]["properties"]
# Stilens delar, som kundfilen kan byta var för sig. Utan val gäller stilens (STIL_DELAR).
DELAR = ("typsnitt", "former", "etiketter", "foton")
DESIGNVAL = {falt: tuple(_design[falt]["enum"]) for falt in ("stil", *DELAR, "tema", "hero", "meny")}
STILAR, TEMAN, HEROS, MENYER = (DESIGNVAL[k] for k in ("stil", "tema", "hero", "meny"))
STIL_DELAR = {s["id"]: s["delar"] for s in SCHEMA["stilar"]}
STIL_TEMAN = {s["id"]: tuple(s["teman"]) for s in SCHEMA["stilar"]}
NAMN = SCHEMA["namn"]
STIL_NAMN = SCHEMA["namn"]["stil"]
TEMA_NAMN = SCHEMA["namn"]["tema"]
HERO_NAMN = SCHEMA["namn"]["hero"]
MENY_NAMN = SCHEMA["namn"]["meny"]
TEMA_FARG = {t["id"]: (t["bg"], t["ink"]) for t in SCHEMA["teman"]}
# Sidor som kan stängas av i kundfilen, och vilken flagga som styr dem.
VALBARA_SIDOR = {"om-oss.astro": "omOss", "skarm.astro": "skarm", "qr.astro": "qr"}
# Det som aldrig kopieras från startern till en kund.
HOPPA_OVER = {"node_modules", "dist", ".astro", ".wrangler", "scripts", "cms.manifest.json", "CLAUDE.md", "DESIGN_LANGUAGE.md"}
# En kund med egen design har sina filer i kunder/<kund>/src/ och public/, som läggs ovanpå
# startern. Kunden får lägga till filer i de här mapparna och byta ut sidor, brand-komponenter,
# tokens.css, brand.css och brand.json. Allt annat, som src/components/core/, src/layouts/
# och src/lib/, delas av alla kunder och ändras bara i starter/.
EGET_MAPPAR = ("src/components/brand/", "src/pages/", "src/styles/", "src/assets/", "public/")
EGET_ERSATTER = ("src/components/brand/", "src/pages/", "public/")
EGET_FILER = {"src/styles/tokens.css", "src/styles/brand.css", "src/config/brand.json"}
# Beroendena installeras en gång per version av package.json och delas av alla kunder.
BEROENDEN = UT / ".beroenden"
PLATSHALLARE = "FYLL I"


class FabrikFel(Exception):
    """Ett fel som stoppar fabriken med ett meddelande till den som kör den.

    falt är felen i kundfilen som (fält, meddelande), till exempel
    ("kontakt.telefon", "skrivs som +46 70 123 45 67"), så att HJERDAL
    Designer kan visa dem vid rätt fält.
    """

    def __init__(self, text: str, falt: list[tuple[str, str]] | None = None) -> None:
        super().__init__(text)
        self.falt = falt or []


def kundfel(falt: list[tuple[str, str]], rubrik: str = "Kundfilen har fel") -> FabrikFel:
    return FabrikFel(f"{rubrik}:\n" + "\n".join(f"    - {f}: {m}" for f, m in falt), falt)


def info(text: str) -> None:
    print(f"  {text}")


def rubrik(text: str) -> None:
    print(f"\n▸ {text}")


def kort_vag(vag: Path) -> str:
    """Sökvägen sett från där fabriken körs, eller hela sökvägen om den ligger utanför."""
    try:
        return str(vag.resolve().relative_to(Path.cwd()))
    except ValueError:
        return str(vag)


# --- Kundfilen --------------------------------------------------------------

def kundmapp(kund: str) -> Path:
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", kund):
        raise FabrikFel(f"Kundnamnet '{kund}' ska vara små bokstäver, siffror och bindestreck, till exempel bistro-nordvik.")
    return KUNDER / kund


def las_kund(kund: str) -> dict:
    fil = kundmapp(kund) / "kund.json"
    if not fil.exists():
        raise FabrikFel(f"Hittar inte {kort_vag(fil)}. Skapa kunden med: fabrik.py ny {kund}")
    try:
        data = json.loads(fil.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise FabrikFel(f"{fil.name} är inte giltig JSON: rad {e.lineno}, kolumn {e.colno}: {e.msg}") from e
    granska_kund(data)
    return data


def granska_kund(data: dict) -> None:
    """Det som går att se direkt i kundfilen. Resten kontrolleras mot schemat när sajten byggs."""
    if not isinstance(data, dict):
        raise kundfel([("(hela filen)", "ska vara ett JSON-objekt")])
    fel = [(k, "måste fyllas i") for k in SCHEMA["schema"]["required"] if k not in data]
    fel += [(v, "är inte ifyllt") for v in platshallare(data)]
    design = data.get("design", {})
    fel += [(f"design.{k}", f"'{design[k]}' finns inte, välj {', '.join(val)}")
            for k, val in DESIGNVAL.items() if k in design and design[k] not in val]
    if fel:
        raise kundfel(fel)


def platshallare(varde, vag: str = "") -> list[str]:
    """Alla fält som fortfarande har texten FYLL I."""
    if isinstance(varde, dict):
        return [r for k, v in varde.items() for r in platshallare(v, f"{vag}.{k}" if vag else k)]
    if isinstance(varde, list):
        return [r for i, v in enumerate(varde) for r in platshallare(v, f"{vag}.{i}")]
    return [vag] if isinstance(varde, str) and PLATSHALLARE in varde else []


def json_text(data) -> str:
    """Kundfilen som JSON, skriven som för hand: korta grupper och listor på en rad,
    listor med grupper (rätter, öppettider) en rad per sak. Så blir ändringarna
    från Designer små och lätta att läsa i git."""

    def kompakt(v) -> str:
        if isinstance(v, dict):
            return "{ " + ", ".join(f"{json.dumps(k, ensure_ascii=False)}: {kompakt(x)}" for k, x in v.items()) + " }" if v else "{}"
        if isinstance(v, list):
            return "[" + ", ".join(kompakt(x) for x in v) + "]"
        return json.dumps(v, ensure_ascii=False)

    def skriv(v, indrag: int, fore: int, i_lista: bool = False) -> str:
        if not isinstance(v, (dict, list)) or not v:
            return kompakt(v)
        # En grupp som har grupper i sig (kontakt med adress, en sektion med rätter) skrivs på flera rader.
        inuti = v.values() if isinstance(v, dict) else v
        har_grupper = any(isinstance(x, dict) or (isinstance(x, list) and any(isinstance(y, dict) for y in x)) for x in inuti)
        text = kompakt(v)
        # En sak i en lista (en rätt, en öppettid) får vara längre än en vanlig grupp.
        bredd = 180 if i_lista or isinstance(v, list) else 100
        if indrag and not har_grupper and indrag + fore + len(text) <= bredd:
            return text
        inre = " " * (indrag + 2)
        if isinstance(v, dict):
            rader = [f"{inre}{json.dumps(k, ensure_ascii=False)}: {skriv(x, indrag + 2, len(k) + 4)}" for k, x in v.items()]
            return "{\n" + ",\n".join(rader) + "\n" + " " * indrag + "}"
        rader = [f"{inre}{skriv(x, indrag + 2, 0, True)}" for x in v]
        return "[\n" + ",\n".join(rader) + "\n" + " " * indrag + "]"

    return skriv(data, 0, 0) + "\n"


def med_design(data: dict, **val: str | None) -> dict:
    """En kopia av kundfilen med andra designval, till exempel stil="klassisk". En annan stil
    kommer med sina egna delar, så kundfilens typsnitt, former, etiketter och foton gäller
    bara om de anges igen."""
    ny = json.loads(json.dumps(data))
    design = ny.setdefault("design", {})
    val = {k: v for k, v in val.items() if v}
    if val.get("stil") and val["stil"] != design.get("stil", "hjerdal"):
        for k in DELAR:
            design.pop(k, None)
    design.update(val)
    return ny


def design_med_standard(data: dict) -> dict:
    """Alla designval med standardvärdena, och delarna från stilen där kundfilen inte väljer."""
    d = data.get("design", {})
    stil = d.get("stil", "hjerdal")
    forval = STIL_DELAR.get(stil, STIL_DELAR["hjerdal"])
    return {"stil": stil, **{k: d.get(k) or forval[k] for k in DELAR},
            "tema": d.get("tema", "fjall"), "hero": d.get("hero", "text"), "meny": d.get("meny", "lista")}


def varianttext(d: dict) -> str:
    """Designvalen som en variant till varianter: stil, tema, hero och meny, och de delar som
    inte är stilens, som 'afton:kol:bild:numrerad:garamond'."""
    forval = STIL_DELAR[d["stil"]]
    return ":".join([d["stil"], d["tema"], d["hero"], d["meny"], *(d[k] for k in DELAR if d[k] != forval[k])])


def variantnamn(d: dict) -> str:
    """Mappen en variant byggs till, som 'afton-kol-bild-numrerad-garamond'."""
    return varianttext(d).replace(":", "-")


# --- Underlaget: brief och designspec ----------------------------------------

TYPNAMN = {"object": "en grupp", "array": "en lista", "string": "text", "number": "ett tal",
           "integer": "ett heltal", "boolean": "true eller false", "null": "null"}


def schemafel(varde, schema: dict, vag: str = "", rot: dict | None = None) -> list[tuple[str, str]]:
    """Felen när ett värde kontrolleras mot ett JSON Schema i schemas/, som (fält, meddelande).
    Bara det schemana använder: type, required, properties, additionalProperties, items,
    enum, minLength, pattern, minItems, minimum och $ref till #/$defs/."""
    rot = rot or schema
    if "$ref" in schema:
        schema = rot["$defs"][schema["$ref"].rsplit("/", 1)[-1]]
    falt = vag or "(hela filen)"
    typer = schema.get("type")
    if typer:
        typer = typer if isinstance(typer, list) else [typer]
        ar_tal = isinstance(varde, (int, float)) and not isinstance(varde, bool)
        passar = {"object": isinstance(varde, dict), "array": isinstance(varde, list), "string": isinstance(varde, str),
                  "number": ar_tal, "integer": ar_tal and float(varde).is_integer(),
                  "boolean": isinstance(varde, bool), "null": varde is None}
        if not any(passar[t] for t in typer):
            return [(falt, "ska vara " + " eller ".join(TYPNAMN[t] for t in typer))]
    fel: list[tuple[str, str]] = []
    if "enum" in schema and varde not in schema["enum"]:
        fel.append((falt, "ska vara en av " + ", ".join(map(str, schema["enum"]))))
    if isinstance(varde, str):
        if len(varde.strip()) < schema.get("minLength", 0):
            fel.append((falt, "måste fyllas i" if not varde.strip() else f"är för kort, minst {schema['minLength']} tecken"))
        elif "pattern" in schema and not re.search(schema["pattern"], varde):
            fel.append((falt, schema.get("formatText", "har fel format")))
    if isinstance(varde, (int, float)) and not isinstance(varde, bool) and varde < schema.get("minimum", varde):
        fel.append((falt, f"ska vara minst {schema['minimum']}"))
    if isinstance(varde, list):
        if len(varde) < schema.get("minItems", 0):
            fel.append((falt, f"ska ha minst {schema['minItems']}"))
        for i, x in enumerate(varde):
            fel += schemafel(x, schema.get("items", {}), f"{vag}.{i}" if vag else str(i), rot)
    if isinstance(varde, dict):
        egenskaper = schema.get("properties", {})
        fel += [(f"{vag}.{k}" if vag else k, "måste fyllas i") for k in schema.get("required", []) if k not in varde]
        for k, x in varde.items():
            under = f"{vag}.{k}" if vag else k
            if k in egenskaper:
                fel += schemafel(x, egenskaper[k], under, rot)
            elif schema.get("additionalProperties") is False:
                fel.append((under, "finns inte i schemat"))
            elif isinstance(schema.get("additionalProperties"), dict):
                fel += schemafel(x, schema["additionalProperties"], under, rot)
    return fel


def wcag_kontrast(a: str, b: str) -> float:
    """WCAG-kontrasten mellan två färger #RRGGBB, 1 till 21. Samma som src/lib/tema.ts."""
    def lum(hex_: str) -> float:
        rgb = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        r, g, b_ = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        return 0.2126 * r + 0.7152 * g + 0.0722 * b_
    x, y = sorted((lum(a), lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def granska_underlag(kund: str) -> None:
    """Briefen och designspecen i kundens mapp (brief.json, design.json), om de finns, mot
    schemas/. Designspecens färgpar ska klara WCAG AA och referenserna finnas i examples/."""
    mapp = kundmapp(kund)
    for namn in ("brief", "design"):
        fil = mapp / f"{namn}.json"
        if not fil.exists():
            continue
        try:
            data = json.loads(fil.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise FabrikFel(f"{fil.name} är inte giltig JSON: rad {e.lineno}, kolumn {e.colno}: {e.msg}") from e
        fel = schemafel(data, json.loads((SCHEMAN / f"{namn}.schema.json").read_text(encoding="utf-8")))
        fel += [(v, "är inte ifyllt") for v in platshallare(data)]
        if not fel:
            fel = [(f"referenser.{i}", f"{r} finns inte i examples/") for i, r in enumerate(data.get("referenser", []))
                   if "/" not in r and not (FABRIK / "examples" / r).is_dir()]
        if namn == "design" and not fel:
            for i, par in enumerate(data["kontrast"]):
                saknas = [f for f in (par["text"], par["bakgrund"]) if f not in data["farger"]]
                if saknas:
                    fel.append((f"kontrast.{i}", f"{', '.join(saknas)} finns inte i farger"))
                    continue
                k = wcag_kontrast(data["farger"][par["text"]], data["farger"][par["bakgrund"]])
                krav = 3.0 if par.get("storText") else 4.5
                if k < krav:
                    fel.append((f"kontrast.{i}", f"{par['text']} mot {par['bakgrund']} har kontrasten "
                                                 f"{k:.1f}".replace(".", ",") + f", minst {krav:.1f}".replace(".", ",") + " krävs"))
        if fel:
            raise kundfel(fel, f"{fil.name} har fel")
    sprak = mapp / "DESIGN_LANGUAGE.md"
    if sprak.exists() and PLATSHALLARE in sprak.read_text(encoding="utf-8"):
        rader = [r.lstrip("#- ").strip() for r in sprak.read_text(encoding="utf-8").splitlines() if PLATSHALLARE in r]
        raise FabrikFel(f"{sprak.name} är inte ifylld:\n" + "\n".join(f"    - {r}" for r in rader))


# --- Bygget -----------------------------------------------------------------

def kor(cmd: list[str], cwd: Path, env: dict | None = None, tyst: bool = False) -> None:
    res = subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})}, text=True,
                         stdout=subprocess.PIPE if tyst else None, stderr=subprocess.STDOUT if tyst else None)
    if res.returncode != 0:
        # Fel i kundfilen eller temat (src/lib/kund.ts, src/lib/tema.ts) visas utan Astros stackspår.
        kund_fel = re.search(r"((Kundfilen har fel|Temat \S+ har för låg kontrast).*?)(?:\n\s*(?:Location|Stack trace):|\Z)",
                             res.stdout or "", re.S)
        if kund_fel:
            text = kund_fel.group(1).strip()
            rader = re.findall(r"^\s*- (.+?): (.+)$", text, re.M)
            if kund_fel.group(2).startswith("Temat"):
                # Kontrasten beror på accenten om det är knapptexten som syns dåligt, annars på temat.
                rader = [("design.accent" if v.startswith("knapptexten") else "design.tema", f"{v}: {k}") for v, k in rader]
            raise FabrikFel(text, [(f, m.strip()) for f, m in rader])
        if tyst and res.stdout:
            print(res.stdout[-6000:])
        raise FabrikFel(f"Kommandot misslyckades: {' '.join(cmd)}")


def starterns_version() -> str:
    return json.loads((STARTER / "package.json").read_text(encoding="utf-8"))["version"]


def egna_filer(kund: str) -> list[tuple[Path, str]]:
    """Kundens egen design som (fil, sökväg i sajten), från kunder/<kund>/src/ och public/.
    Stoppar om kunden har filer som ändrar det som delas av alla kunder."""
    mapp = kundmapp(kund)
    filer: list[tuple[Path, str]] = []
    fel: list[tuple[str, str]] = []
    for del_ in ("src", "public"):
        for fil in sorted((mapp / del_).rglob("*")) if (mapp / del_).is_dir() else []:
            if fil.is_dir() or fil.name in (".DS_Store", ".gitkeep"):
                continue
            vag = fil.relative_to(mapp).as_posix()
            if vag.startswith("src/assets/bilder/"):
                fel.append((vag, "kundens bilder ligger i bilder/, inte i src/assets/bilder/"))
            elif (STARTER / vag).exists() and not vag.startswith(EGET_ERSATTER) and vag not in EGET_FILER:
                fel.append((vag, "delas av alla kunder, så den ändras i starter/ och inte per kund"))
            elif not vag.startswith(EGET_MAPPAR) and vag not in EGET_FILER:
                fel.append((vag, "ligger utanför det en kund får ändra: " + ", ".join(EGET_MAPPAR)))
            else:
                filer.append((fil, vag))
    if fel:
        raise FabrikFel("Kundens egen design har fel:\n" + "\n".join(f"    - {f}: {m}" for f, m in fel))
    return filer


def synka_starter(ut: Path, kund: str) -> None:
    """Gör ut/ till en ren kopia av startern med kundens egen design ovanpå, men behåll
    node_modules, så att npm slipper installera om."""
    egna = egna_filer(kund)
    ut.mkdir(parents=True, exist_ok=True)
    for sak in ut.iterdir():
        if sak.name == "node_modules":
            continue
        shutil.rmtree(sak) if sak.is_dir() and not sak.is_symlink() else sak.unlink()
    shutil.copytree(STARTER, ut, dirs_exist_ok=True, ignore=lambda d, namn: [n for n in namn if n in HOPPA_OVER])
    for fil, vag in egna:
        (ut / vag).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(fil, ut / vag)
    if egna:
        info(f"Egen design: {len(egna)} filer från {kort_vag(kundmapp(kund))}/")


def skriv_kund(ut: Path, kund: str, data: dict) -> None:
    (ut / "src/data/kund.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    bildmapp = ut / "src/assets/bilder"
    for gammal in bildmapp.glob("*"):
        if gammal.name != ".gitkeep":
            gammal.unlink()
    kallor = kundmapp(kund) / "bilder"
    for fil in sorted(kallor.glob("*")) if kallor.exists() else []:
        if fil.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".svg"}:
            shutil.copy2(fil, bildmapp / fil.name)

    funktioner = data.get("funktioner", {})
    standard = {"omOss": True, "skarm": False, "qr": False}
    for sida, flagga in VALBARA_SIDOR.items():
        pa = funktioner.get(flagga, standard[flagga])
        if flagga == "omOss":
            pa = pa and bool(data.get("om"))
        if not pa:
            # Varianterna skriver kundfilen flera gånger i samma kopia, så sidan kan redan vara borta.
            (ut / "src/pages" / sida).unlink(missing_ok=True)

    wrangler = ut / "wrangler.jsonc"
    wrangler.write_text(wrangler.read_text(encoding="utf-8").replace('"hjerdal-kund"', f'"hjerdal-{kund}"'), encoding="utf-8")

    (ut / "fabrik.json").write_text(json.dumps({
        "kund": kund,
        "starter": starterns_version(),
        "byggd": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }, indent=2) + "\n", encoding="utf-8")


def npm_install(ut: Path) -> None:
    """Beroendena installeras en gång per version av package.json och package-lock.json,
    i ut/.beroenden/<version>/, och länkas in i varje kunds mapp. En ny kund eller
    ett förslag behöver därför aldrig installera, bara den första efter en ändring i startern."""
    h = hashlib.sha256()
    for namn in ("package.json", "package-lock.json"):
        h.update((ut / namn).read_bytes())
    version = h.hexdigest()[:16]
    mal = BEROENDEN / version
    if (mal / ".fabrik-klar").exists():
        info("Beroenden: redan installerade")
    else:
        info("Beroenden: installerar en gång för alla kunder (npm ci)")
        # Installera bredvid och byt namn när det är klart, så att ett avbrutet
        # bygge eller två byggen samtidigt aldrig lämnar en halv installation.
        tmp = BEROENDEN / f".{version}-{os.getpid()}"
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True)
        for namn in ("package.json", "package-lock.json"):
            shutil.copy2(ut / namn, tmp / namn)
        kor(["npm", "ci", "--no-audit", "--no-fund", "--loglevel=error"], tmp, tyst=True)
        (tmp / ".fabrik-klar").write_text(version)
        try:
            tmp.rename(mal)
        except OSError:
            shutil.rmtree(tmp, ignore_errors=True)
        # Äldre versioner används inte längre; en kund som byggs igen länkas till den nya.
        for gammal in BEROENDEN.iterdir():
            if gammal.name != version:
                shutil.rmtree(gammal, ignore_errors=True)
    lank = ut / "node_modules"
    if lank.is_symlink():
        if Path(os.readlink(lank)) == mal / "node_modules":
            return
        lank.unlink()
    elif lank.exists():
        shutil.rmtree(lank)
    lank.symlink_to(mal / "node_modules", target_is_directory=True)


def bygg(kund: str, ut: Path | None = None, design: dict | None = None, kontrollera: bool = True,
         base: str = "/", forhandsvisning: bool = False) -> Path:
    """Bygger kundens sajt i ut/<kund>/dist. base är sökvägen sajten ligger under, till
    exempel /visa/<kund>/ i Designer; en förhandsvisning blir noindex."""
    data = med_design(las_kund(kund), **(design or {}))
    ut = ut or UT / kund
    granska_underlag(kund)
    rubrik(f"Bygger {data['namn']} ({kund}) med startern {starterns_version()}")
    synka_starter(ut, kund)
    skriv_kund(ut, kund, data)
    d = design_med_standard(data)
    info(f"Design: stil {d['stil']} (typsnitt {d['typsnitt']}, former {d['former']}, etiketter {d['etiketter']}, "
         f"foton {d['foton']}), tema {d['tema']}, hero {d['hero']}, meny {d['meny']}")
    for _, namn, lika in lika_kunder(kund, data):
        info(f"Obs: designen ligger för nära {namn}, med samma {lista_text([LIKHET_NAMN[k] for k in lika])}. "
             f"{likhet_rad(lika)} Annars publiceras den inte.")
    npm_install(ut)
    info("Astro: kontrollerar kundfil och typer, bygger sidorna")
    env = {"FABRIK_BASE": base, "PUBLIC_FORHANDSVISNING": "1" if forhandsvisning else ""}
    kor(["npm", "run", "build", "--silent"], ut, env=env, tyst=True)
    info(f"Klart: {kort_vag(ut)}/dist")
    if kontrollera:
        fel = kontroll(kund, ut / "dist", data)
        if fel:
            raise FabrikFel(f"Kontrollen hittade {fel} fel. Sajten är byggd men ska inte publiceras.")
    return ut


# --- Kontrollen -------------------------------------------------------------

class Sida(HTMLParser):
    """Plockar ut det kontrollen behöver ur en HTML-sida."""

    def __init__(self) -> None:
        super().__init__()
        self.lang = None
        self.title = ""
        self.i_title = False
        self.description = None
        self.canonical = None
        self.noindex = False
        self.h1 = 0
        self.bilder_utan_alt = 0
        self.skript = 0
        self.externa_skript: list[str] = []
        self.ld: list[str] = []
        self.i_ld = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.lang = a.get("lang")
        elif tag == "title":
            self.i_title = True
        elif tag == "meta" and a.get("name") == "description":
            self.description = a.get("content") or ""
        elif tag == "meta" and a.get("name") == "robots" and "noindex" in (a.get("content") or ""):
            self.noindex = True
        elif tag == "link" and a.get("rel") == "canonical":
            self.canonical = a.get("href")
        elif tag == "h1":
            self.h1 += 1
        elif tag == "img" and not (a.get("alt") or "").strip():
            self.bilder_utan_alt += 1
        elif tag == "script":
            if a.get("type") == "application/ld+json":
                self.i_ld = True
                self.ld.append("")
            else:
                self.skript += 1
                if re.match(r"(https?:)?//", a.get("src") or ""):
                    self.externa_skript.append(a["src"])

    def handle_endtag(self, tag):
        if tag == "title":
            self.i_title = False
        elif tag == "script":
            self.i_ld = False

    def handle_data(self, data):
        if self.i_title:
            self.title += data
        if self.i_ld:
            self.ld[-1] += data


def kontroll(kund: str, dist: Path | None = None, data: dict | None = None) -> int:
    """Kontrollerar den byggda sajten och skriver ut resultatet. Returnerar antalet fel;
    varningar stoppar inte."""
    dist = dist or UT / kund / "dist"
    data = data or las_kund(kund)
    rubrik("Kontrollerar sajten")
    if not dist.exists():
        raise FabrikFel(f"Hittar ingen byggd sajt i {dist}. Kör först: fabrik.py bygg {kund}")
    g = granska(dist, data)
    info(f"{g['sidor']} sidor kontrollerade, typsnittsfiler totalt {g['typsnitt'] // 1000} kB (laddas bara de som används)")
    for v in g["varn"]:
        info(f"Varning: {v}")
    for f in g["fel"]:
        info(f"FEL: {f}")
    if not g["fel"]:
        info("Inga fel.")
    return len(g["fel"])


def granska(dist: Path, data: dict) -> dict:
    """Går igenom varje sida i en byggd sajt. Ger fel, varningar, antal sidor och typsnittens storlek."""
    fel: list[str] = []
    varn: list[str] = []
    # Inställningarna sajten byggdes med (src/config/brand.json), där en kund med egen design
    # kan ha egen JavaScript.
    brand_fil = dist.parent / "src/config/brand.json"
    skript_ok = brand_fil.exists() and json.loads(brand_fil.read_text(encoding="utf-8")).get("skript") is True

    for fil in ("404.html", "robots.txt", "sitemap-index.xml", "favicon.svg"):
        if not (dist / fil).exists():
            fel.append(f"{fil} saknas")

    sidor = sorted(dist.rglob("*.html"))
    for fil in sidor:
        namn = "/" + str(fil.relative_to(dist)).replace("index.html", "").replace(".html", "/")
        kalla = fil.read_text(encoding="utf-8")
        s = Sida()
        s.feed(kalla)
        if s.lang != "sv":
            fel.append(f"{namn}: saknar lang=\"sv\"")
        if not s.title.strip():
            fel.append(f"{namn}: saknar <title>")
        elif len(html.unescape(s.title)) > 65:
            varn.append(f"{namn}: titeln är {len(s.title)} tecken, Google visar ungefär 60")
        if not s.description:
            fel.append(f"{namn}: saknar meta description")
        elif not s.noindex and not 50 <= len(html.unescape(s.description)) <= 160:
            varn.append(f"{namn}: description är {len(s.description)} tecken, bäst är 50–160")
        if not s.noindex and not s.canonical:
            fel.append(f"{namn}: saknar canonical")
        if s.h1 != 1:
            fel.append(f"{namn}: har {s.h1} h1-rubriker, ska ha exakt en")
        if s.bilder_utan_alt:
            fel.append(f"{namn}: {s.bilder_utan_alt} bilder saknar alt-text")
        if s.externa_skript:
            fel.append(f"{namn}: laddar externa skript ({', '.join(s.externa_skript)})")
        # Bara menyskärmen får ha JavaScript, om inte kunden har egen design med skript i
        # brand.json. Sidan ska ändå gå att läsa och använda utan; det prövar fabrik.py kvalitet.
        if s.skript and namn != "/skarm/" and not skript_ok:
            fel.append(f"{namn}: har {s.skript} skript, sajten ska fungera utan JavaScript")
        for i, ld in enumerate(s.ld):
            try:
                json.loads(ld)
            except json.JSONDecodeError:
                fel.append(f"{namn}: strukturerad data nr {i + 1} är inte giltig JSON")
        storlek = len(kalla.encode("utf-8"))
        if storlek > 120_000:
            fel.append(f"{namn}: HTML-filen är {storlek // 1000} kB, gränsen är 120 kB")

    idag = dt.date.today().isoformat()
    for a in data.get("avvikelser", []):
        if a.get("datum", "9999") < idag:
            varn.append(f"Avvikelsen {a.get('text')} ({a.get('datum')}) har passerat och kan tas bort ur kundfilen")

    typsnitt = sum(f.stat().st_size for f in dist.rglob("*.woff2"))
    return {"fel": fel, "varn": varn, "sidor": len(sidor), "typsnitt": typsnitt}


# --- Kvalitetsgrinden -------------------------------------------------------

def aktiva_kunder() -> list[str]:
    return [p.name for p in sorted(KUNDER.iterdir()) if (p / "kund.json").exists() and not (p / "arkiv.json").exists()]


def kvalitet(kunder: list[str], snabb: bool = False) -> int:
    """Kvalitetsgrinden i quality/STANDARD.md för kunderna, standard alla aktiva: bygget med
    kontrollen, webbläsarkontrollen i mobil och dator med skärmdumpar, och Lighthouse.
    snabb hoppar över Lighthouse. Returnerar antalet kunder som inte klarar grinden."""
    trasiga = []
    for kund in kunder or aktiva_kunder():
        try:
            ut = bygg(kund)
            webblasarkontroll(ut)
            if not snabb:
                lighthouse(kund, ut / "dist")
        except FabrikFel as e:
            print(f"\n✗ {kund}: {e}", file=sys.stderr)
            trasiga.append(kund)
    rubrik("Kvalitetsgrinden")
    info(f"Klarar inte: {', '.join(trasiga)}" if trasiga else "Alla kunder klarar grinden." + (" Lighthouse kördes inte (--snabb)." if snabb else ""))
    return len(trasiga)


def webblasarkontroll(ut: Path) -> None:
    """Varje sida i Chrome i mobil och dator (scripts/kvalitet.mjs): ingen sidledsscroll, inga
    fel i konsolen, inga trasiga länkar, bilder eller filer, och innehållet finns utan
    JavaScript. Skärmdumparna hamnar i ut/<kund>/kvalitet/, till granskningen."""
    rubrik("Webbläsarkontroll i mobil och dator")
    mal = ut / "kvalitet"
    res = subprocess.run(["node", str(FABRIK / "scripts" / "kvalitet.mjs"), str(ut / "dist"), str(mal)], cwd=ut, check=False)
    if res.returncode != 0:
        raise FabrikFel(f"Webbläsarkontrollen hittade fel. Skärmdumparna ligger i {kort_vag(mal)}/.")


def indexerade_sidor(dist: Path) -> list[str]:
    """Sidorna som ska synas på Google, till exempel ["/", "/meny/"]: alla utom 404 och noindex."""
    sidor = []
    for fil in dist.rglob("index.html"):
        s = Sida()
        s.feed(fil.read_text(encoding="utf-8"))
        if not s.noindex:
            vag = fil.parent.relative_to(dist).as_posix()
            sidor.append("/" if vag == "." else f"/{vag}/")
    return sorted(sidor, key=lambda x: (x != "/", x))


def lighthouse(kund: str, dist: Path) -> None:
    """Lighthouse i mobil på de indexerade sidorna, med kraven i quality/lighthouserc.json."""
    rubrik("Lighthouse i mobil")
    sidor = indexerade_sidor(dist)
    info(f"Sidor: {', '.join(sidor)}")
    res = subprocess.run(["npx", "--yes", "@lhci/cli@0.14", "autorun", f"--config={FABRIK / 'quality' / 'lighthouserc.json'}",
                          f"--collect.staticDistDir={dist}", *[f"--collect.url=http://localhost{s}" for s in sidor],
                          f"--upload.outputDir={FABRIK / 'lhci' / kund}",
                          # Som root, i en container i molnet, startar Chrome bara utan sandlåda.
                          *(["--collect.settings.chromeFlags=--no-sandbox"] if hasattr(os, "geteuid") and os.geteuid() == 0 else [])],
                         cwd=FABRIK, check=False)
    if res.returncode != 0:
        raise FabrikFel(f"Lighthouse är under kraven i quality/lighthouserc.json. Rapporterna ligger i lhci/{kund}/.")


def validera(kund: str) -> None:
    """Allt i kundens mapp som går att kontrollera utan att bygga: kundfilen, briefen,
    designspecen och kundens egen design."""
    data = las_kund(kund)
    granska_underlag(kund)
    egna = egna_filer(kund)
    rubrik(f"{data['namn']} ({kund})")
    for namn in ("brief.json", "design.json", "DESIGN_LANGUAGE.md"):
        info(f"{namn}: {'finns' if (kundmapp(kund) / namn).exists() else 'finns inte'}")
    info(f"Egen design: {len(egna)} filer" if egna else "Egen design: nej, startern med kundfilens stil och tema")
    info("Inga fel.")


# --- Varianter --------------------------------------------------------------

def tolka_variant(text: str) -> dict:
    """'klassisk:linne:bild:kort' blir stil, tema, hero och meny, och 'afton:kol:garamond' byter
    också typsnittet. Ordningen spelar ingen roll, och det som inte anges tas från kundfilen
    (delarna från stilen, när varianten byter stil)."""
    design: dict = {}
    for del_ in filter(None, text.split(":")):
        falt = next((k for k, val in DESIGNVAL.items() if del_ in val), None)
        if not falt:
            alla = "; ".join(f"{k}: {', '.join(val)}" for k, val in DESIGNVAL.items())
            raise FabrikFel(f"'{del_}' i varianten '{text}' finns inte. Välj bland {alla}.")
        if falt in design:
            raise FabrikFel(f"Varianten '{text}' har två värden för {falt}.")
        design[falt] = del_
    return design


def varianter(kund: str, lista: list[str], ut: Path | None = None, samling: Path | None = None,
              prefix: str = "/") -> Path:
    """Bygger samma kund i flera varianter till en förhandsvisning att visa kunden.
    prefix är sökvägen förhandsvisningen ligger under, till exempel /forslag/<kund>/ i Designer."""
    data = las_kund(kund)
    valda = [tolka_variant(v) for v in (lista or forslag(kund, data))]
    ut = ut or UT / kund
    samling = samling or UT / f"{kund}-varianter"
    if samling.exists():
        shutil.rmtree(samling)
    samling.mkdir(parents=True)
    kort = []
    # Kundens eget bygge i ut/<kund>/dist flyttas undan och tillbaka, så att det inte skrivs över.
    undan = ut.parent / f".{ut.name}-dist"
    if (ut / "dist").exists():
        shutil.rmtree(undan, ignore_errors=True)
        shutil.move(str(ut / "dist"), str(undan))
    synka_starter(ut, kund)
    npm_install(ut)
    for nr, design in enumerate(valda, start=1):
        d = design_med_standard(med_design(data, **design))
        # Utan bild blir hero text på sajten, så förhandsvisningen ska heta så också.
        utan_bild = not data.get("bilder", {}).get("hero") and d["hero"] != "text"
        if utan_bild:
            d["hero"] = design["hero"] = "text"
        namn = variantnamn(d)
        rubrik(f"Variant {nr} av {len(valda)}: {namn}")
        if utan_bild:
            info("Kunden har ingen herobild, så hero visas som text")
        if any(namn == k for k, _ in kort):
            info("Samma som en tidigare variant, hoppar över")
            continue
        skriv_kund(ut, kund, med_design(data, **design))
        kor(["npx", "astro", "build", "--silent"], ut, env={"FABRIK_BASE": f"{prefix}{namn}/", "PUBLIC_FORHANDSVISNING": "1"}, tyst=True)
        shutil.move(str(ut / "dist"), str(samling / namn))
        kort.append((namn, d))
        info(f"Klar: /{namn}/")
    # Kundens egen design och bygge ligger kvar i ut/ efter förhandsvisningen.
    skriv_kund(ut, kund, data)
    if undan.exists():
        shutil.move(str(undan), str(ut / "dist"))
    (samling / "index.html").write_text(varianter_index(data["namn"], kort), encoding="utf-8")
    (samling / "varianter.json").write_text(json.dumps([{"mapp": m, "variant": varianttext(d), **d} for m, d in kort], indent=2) + "\n",
                                            encoding="utf-8")
    (samling / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    (samling / "wrangler.jsonc").write_text(json.dumps({
        "name": f"hjerdal-{kund}-forslag",
        "compatibility_date": "2026-09-01",
        "assets": {"directory": ".", "html_handling": "force-trailing-slash"},
    }, indent=2) + "\n", encoding="utf-8")
    info(f"Förhandsvisningen ligger i {kort_vag(samling)}/ med {len(kort)} varianter")
    return samling


def varianter_index(namn: str, kort: list[tuple[str, dict]]) -> str:
    rader = []
    for mapp, d in kort:
        bg, ink = TEMA_FARG[d["tema"]]
        rader.append(
            f'<li><a href="./{mapp}/" style="background:{bg};color:{ink}">'
            f'<span class="t">{STIL_NAMN[d["stil"]]}</span>'
            f'<span class="d">Typsnitt: {NAMN["typsnitt"][d["typsnitt"]]} · Färger: {TEMA_NAMN[d["tema"]]} · '
            f'Startsida: {HERO_NAMN[d["hero"]]} · Meny: {MENY_NAMN[d["meny"]]}</span>'
            f'<span class="n">{html.escape(namn)}</span></a></li>'
        )
    return f"""<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Förslag: {html.escape(namn)} | HJERDAL</title>
<style>
body{{margin:0;background:#F5F6F4;color:#101315;font:400 17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}}
main{{max-width:1180px;margin:auto;padding:clamp(40px,8vw,96px) clamp(18px,4.5vw,48px)}}
.l{{font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#596066}}
h1{{margin:.4em 0 .3em;font-weight:300;font-size:clamp(2.4rem,6vw,4.6rem);line-height:1.02;letter-spacing:-.045em}}
p{{max-width:52ch;color:#596066}}
ul{{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:14px;margin:48px 0 0;padding:0;list-style:none}}
a{{display:flex;flex-direction:column;gap:8px;min-height:220px;padding:24px;border-radius:4px;text-decoration:none;box-shadow:inset 0 0 0 1px #D5DAD8;transition:transform .25s}}
a:hover{{transform:translateY(-2px)}}
.t{{font-size:28px;font-weight:300;letter-spacing:-.03em}}.d{{font-size:14px;opacity:.75}}.n{{margin-top:auto;font-size:12px;letter-spacing:.3em;text-transform:uppercase;opacity:.75}}
</style></head><body><main>
<p class="l">Förslag från HJERDAL</p>
<h1>{html.escape(namn)} i {len(kort)} varianter.</h1>
<p>Samma meny, öppettider och texter. Välj den som känns mest som er, så bygger vi vidare på den.</p>
<ul>{"".join(rader)}</ul>
</main></body></html>
"""


# --- Unik design och förslag -------------------------------------------------
# Två kunder från mallen ska inte få samma sajt. Det som syns mest är typsnittet och
# färgerna; sedan formerna, etiketterna, fotona, stilens egna grepp, startsidan och menyn.

LIKHET = ("typsnitt", "farger", "former", "etiketter", "foton", "stil", "hero", "meny")
LIKHET_NAMN = {"typsnitt": "typsnitt", "farger": "färger", "former": "former", "etiketter": "etiketter",
               "foton": "foton", "stil": "stil", "hero": "startsida", "meny": "meny"}


def lista_text(ord_: list[str]) -> str:
    """['a', 'b', 'c'] blir 'a, b och c'."""
    return ", ".join(ord_[:-1]) + " och " + ord_[-1] if len(ord_) > 1 else "".join(ord_)


def designavtryck(data: dict) -> dict:
    """Det som avgör hur en sajt från mallen ser ut. Färgerna är temat och en egen accent."""
    d = design_med_standard(data)
    accent = (data.get("design") or {}).get("accent")
    d["farger"] = d["tema"] + (f":{accent.lower()}" if isinstance(accent, str) else "")
    if not (data.get("bilder") or {}).get("hero"):
        d["hero"] = "text"
    return d


def for_lik(a: dict, b: dict) -> list[str] | None:
    """Valen två designer har gemensamt, om de är för lika: samma typsnitt och färger, eller
    högst två olika val av åtta. Annars None."""
    lika = [k for k in LIKHET if a[k] == b[k]]
    if {"typsnitt", "farger"} <= set(lika) or len(LIKHET) - len(lika) <= 2:
        return lika
    return None


def likhet_rad(lika: list[str]) -> str:
    """Vad som behöver ändras för att en design inte längre ska vara för lik: minst tre val
    olika, och typsnittet eller färgerna ett av dem."""
    kvar = max(0, 3 - (len(LIKHET) - len(lika)))
    tal = {1: "ett", 2: "två", 3: "tre"}
    if {"typsnitt", "farger"} <= set(lika):
        return "Byt typsnitt eller färger" + (f" och {tal[kvar - 1]} val till." if kvar > 1 else ".")
    return f"Byt {tal[kvar]} val till."


def har_egen_design(mapp: Path) -> bool:
    return (mapp / "design.json").exists() or (mapp / "src").is_dir()


def andra_avtryck(kund: str) -> list[tuple[str, str, dict]]:
    """De andra aktiva kunderna från mallen som (mapp, namn, designavtryck). Kunder med egen
    design har en egen sajt och räknas inte, och inte heller arkiverade."""
    ut = []
    for mapp in sorted(KUNDER.iterdir()) if KUNDER.is_dir() else []:
        if mapp.name == kund or not (mapp / "kund.json").exists() or (mapp / "arkiv.json").exists() or har_egen_design(mapp):
            continue
        try:
            annan = json.loads((mapp / "kund.json").read_text(encoding="utf-8"))
            ut.append((mapp.name, annan.get("namn") or mapp.name, designavtryck(annan)))
        except (json.JSONDecodeError, KeyError, AttributeError, TypeError):
            continue
    return ut


def lika_kunder(kund: str, data: dict) -> list[tuple[str, str, list[str]]]:
    """Kunderna vars design ligger för nära den här, som (mapp, namn, gemensamma val)."""
    if har_egen_design(KUNDER / kund):
        return []
    mitt = designavtryck(data)
    return [(mapp, namn, lika) for mapp, namn, annan in andra_avtryck(kund) if (lika := for_lik(mitt, annan)) is not None]


# Vilka stilar som passar vilket slags ställe, efter ord i kundfilens kök, beskrivning,
# namn, rubrik och ingress. Utan träff kommer stilarna i den här ordningen.
STIL_ORD = {
    "afton": ("avsmakning", "fine dining", "vinbar", "sommelier", "champagne", "cocktail", "gastronom", "säsongsmeny", "chef's table"),
    "stampel": ("delade", "smårätter", "tapas", "izakaya", "mezze", "dumpling", "ramen", "bao", "deli", "koreansk", "kvarterskrog"),
    "affisch": ("vedeld", "vedugn", "eld", "grill", "naturvin", "bryggeri", "öl", "bar", "rök"),
    "mjuk": ("kafé", "café", "kaffe", "bageri", "konditori", "brunch", "glass", "frukost", "fika", "bakverk"),
    "klassisk": ("bistro", "brasserie", "husman", "klassisk", "fransk", "vita dukar", "trattoria", "matsal"),
    "kvarter": ("pizza", "burgare", "burger", "street", "kebab", "taco", "falafel", "hamburgare", "korv", "food truck"),
    "hjerdal": (),
}


def stilar_for(data: dict) -> list[str]:
    """Stilarna i den ordning de passar stället bäst, efter orden i STIL_ORD."""
    text = " ".join(str(data.get(k) or "") for k in ("namn", "beskrivning", "rubrik", "ingress"))
    text = (text + " " + " ".join([*(data.get("kok") or []), *(data.get("remsa") or [])])).lower()
    poang = {s: sum(text.count(o) for o in STIL_ORD.get(s, ())) for s in STILAR}
    ordning = [s for s in STIL_ORD if s in STILAR] + [s for s in STILAR if s not in STIL_ORD]
    return sorted(ordning, key=lambda s: -poang[s])


def forslag(kund: str, data: dict, antal: int = 4) -> list[str]:
    """Förslagen när varianter körs utan val: olika stilar som passar stället, i teman och
    delar som ingen annan kund från mallen har, och inte för lika varandra. Samma kund får
    samma förslag varje gång, men två kunder av samma slag börjar på olika teman."""
    andra = [a for _, _, a in andra_avtryck(kund)]
    fro = int(hashlib.sha256(kund.encode()).hexdigest(), 16)
    med_bild = bool((data.get("bilder") or {}).get("hero"))
    heros = ("delad", "bild", "text") if med_bild else ("text",)
    valda: list[dict] = []
    for stil in stilar_for(data):
        if len(valda) == antal:
            break
        nr = len(valda)
        teman = STIL_TEMAN[stil]
        teman = teman[fro % len(teman):] + teman[:fro % len(teman)]
        # Helst ett tema som inget tidigare förslag har, så att de fyra ser olika ut.
        teman = sorted(teman, key=lambda t: t in {v["tema"] for v in valda})
        # Om stilens alla teman är tagna får den lånade etiketter och foton från andra stilar.
        alternativ = [{}] + [{"etiketter": STIL_DELAR[s]["etiketter"], "foton": STIL_DELAR[s]["foton"]}
                             for s in STILAR if STIL_DELAR[s]["etiketter"] != STIL_DELAR[stil]["etiketter"]]
        for byte in alternativ:
            hittad = None
            for tema in teman:
                design = {"stil": stil, "tema": tema, "hero": heros[(fro + nr) % len(heros)],
                          "meny": MENYER[(fro + nr) % len(MENYER)], **byte}
                d = designavtryck(med_design(data, **design))
                if all(for_lik(d, a) is None for a in andra + valda):
                    hittad = design, d
                    break
            if hittad:
                valda.append(hittad[1])
                break
    return [varianttext(d) for d in valda]


# --- Visa ---------------------------------------------------------------------

class TystHanterare(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:
        pass


def visa(kund: str, forslag: bool) -> None:
    """Startar en lokal webbserver för sajten eller förhandsvisningen och öppnar webbläsaren."""
    kundmapp(kund)
    mapp = UT / f"{kund}-varianter" if forslag else UT / kund / "dist"
    if not mapp.exists():
        raise FabrikFel(f"Hittar inget att visa i {kort_vag(mapp)}. Kör först: "
                        f"fabrik.py {'varianter' if forslag else 'bygg'} {kund}")
    hanterare = functools.partial(TystHanterare, directory=str(mapp))
    for port in range(8000, 8020):
        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", port), hanterare)
            break
        except OSError:
            continue
    else:
        raise FabrikFel("Hittar ingen ledig port mellan 8000 och 8019.")
    adress = f"http://localhost:{port}/"
    rubrik(f"Visar {kort_vag(mapp)}")
    info(f"Öppna {adress} om webbläsaren inte öppnas själv. Avsluta med Ctrl+C.")
    webbrowser.open(adress)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
    finally:
        server.server_close()


# --- Ny kund, lista och publicering -------------------------------------------

def ny(kund: str, namn: str | None, egen_design: bool = False) -> None:
    mapp = kundmapp(kund)
    if mapp.exists():
        raise FabrikFel(f"Kunden {kund} finns redan i {kort_vag(mapp)}.")
    mall = json.loads(MALL.read_text(encoding="utf-8"))
    if namn:
        mall["namn"] = namn
    (mapp / "bilder").mkdir(parents=True)
    (mapp / "kund.json").write_text(json_text(mall), encoding="utf-8")
    if egen_design:
        # Underlaget och en startpunkt för kundens egen design: starterns tokens och en tom brand.css.
        brief = json.loads((SCHEMAN / "mallar" / "brief.json").read_text(encoding="utf-8"))
        brief["kund"] = kund
        (mapp / "brief.json").write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        shutil.copy2(SCHEMAN / "mallar" / "design.json", mapp / "design.json")
        shutil.copy2(SCHEMAN / "mallar" / "DESIGN_LANGUAGE.md", mapp / "DESIGN_LANGUAGE.md")
        for vag in ("src/config/brand.json", "src/styles/tokens.css", "src/styles/brand.css"):
            (mapp / vag).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(STARTER / vag, mapp / vag)
        (mapp / "src/components/brand").mkdir(parents=True)
    rubrik(f"Skapade {kort_vag(mapp)}/")
    info("Fyll i kund.json (alla fält med FYLL I) och lägg bilderna i bilder/.")
    if egen_design:
        info("Fyll i brief.json, design.json och DESIGN_LANGUAGE.md. Arbetsgången står i .claude/skills/ny-sajt/.")
    info(f"Bygg sedan med: python3 fabrik.py bygg {kund}")


def lista() -> None:
    rubrik("Kunder i fabriken")
    for mapp in sorted(p for p in KUNDER.iterdir() if (p / "kund.json").exists()):
        try:
            data = json.loads((mapp / "kund.json").read_text(encoding="utf-8"))
            d = data.get("design", {})
            byggd = UT / mapp.name / "fabrik.json"
            nar = json.loads(byggd.read_text())["byggd"][:10] if byggd.exists() else "inte byggd"
            arkiv = "  arkiverad" if (mapp / "arkiv.json").exists() else ""
            info(f"{mapp.name:<24} {data.get('namn', '?'):<28} {d.get('stil', 'hjerdal'):<9} {d.get('tema', 'fjall'):<8} {nar}{arkiv}")
        except (json.JSONDecodeError, KeyError):
            info(f"{mapp.name:<24} (kundfilen går inte att läsa)")


def publicera(kund: str, forslag: bool, trots_likhet: bool = False) -> None:
    mapp = UT / (f"{kund}-varianter" if forslag else kund)
    if not (mapp / "wrangler.jsonc").exists():
        raise FabrikFel(f"Inget att publicera i {mapp}. Kör först: fabrik.py {'varianter' if forslag else 'bygg'} {kund}")
    if not forslag:
        fel = kontroll(kund, mapp / "dist")
        if fel:
            raise FabrikFel("Sajten publiceras inte förrän kontrollen är utan fel.")
        lika = lika_kunder(kund, las_kund(kund))
        if lika and not trots_likhet:
            raise FabrikFel("Designen ligger för nära " + lista_text([f"{namn} (samma {lista_text([LIKHET_NAMN[k] for k in delat])})"
                                                                     for _, namn, delat in lika])
                            + f". {likhet_rad(lika[0][2])} Bygg sedan igen. Ska de vara lika, till exempel två "
                              "ställen med samma ägare, publicera med --trots-likhet.")
    if not os.environ.get("CLOUDFLARE_API_TOKEN"):
        raise FabrikFel("CLOUDFLARE_API_TOKEN saknas. Lägg in en API-token med rätten Workers Scripts: Edit och kör igen.")
    rubrik(f"Publicerar {mapp.name} på Cloudflare")
    kor(["npx", "--yes", "wrangler@4", "deploy"], mapp)
    if not forslag:
        # Designers startsida visar kunden som publicerad tills kundfilen ändras igen.
        (mapp / ".publicerad").write_text(dt.datetime.now().isoformat(timespec="seconds"), encoding="utf-8")


def inte_rosetta() -> None:
    """På en Mac med Apple-chip ska fabriken köra som arm64, aldrig som Intel under Rosetta.

    Apples utvecklarverktyg finns bara för arm64 på nyare macOS, så git slutar fungera
    i en process som körs under Rosetta ("unable to load libxcrun"). Det kan hända när
    Designer startas från Dock, eftersom programmet är ett skript. Då startas samma
    kommando om som arm64, med samma Python om den kan det, annars med Apples egen.
    """
    if sys.platform != "darwin" or os.environ.get("HJERDAL_ARM64"):
        return
    import ctypes  # noqa: PLC0415

    varde, storlek = ctypes.c_int(0), ctypes.c_size_t(ctypes.sizeof(ctypes.c_int))
    try:
        libc = ctypes.CDLL("/usr/lib/libc.dylib")
        if libc.sysctlbyname(b"sysctl.proc_translated", ctypes.byref(varde), ctypes.byref(storlek), None, 0) != 0 or varde.value != 1:
            return
    except OSError:
        return
    os.environ["HJERDAL_ARM64"] = "1"
    for py in (sys.executable, "/usr/bin/python3"):
        prov = subprocess.run(["/usr/bin/arch", "-arm64", py, "-c", "import sys; sys.exit(sys.version_info < (3, 9))"],
                              capture_output=True, timeout=120, check=False)
        if prov.returncode == 0:
            os.execv("/usr/bin/arch", ["arch", "-arm64", py, str(Path(__file__).resolve()), *sys.argv[1:]])


def main() -> int:
    inte_rosetta()
    p = argparse.ArgumentParser(prog="fabrik.py", description="HJERDAL:s sajtfabrik för restauranger.")
    sub = p.add_subparsers(dest="kommando", required=True)
    s = sub.add_parser("ny", help="skapa en ny kund från mallen")
    s.add_argument("kund")
    s.add_argument("--namn")
    s.add_argument("--egen-design", action="store_true", help="med brief, designspec och egen design i kunder/<kund>/src/")
    s = sub.add_parser("bygg", help="bygg och kontrollera kundens sajt")
    s.add_argument("kund")
    for falt, val in DESIGNVAL.items():
        s.add_argument(f"--{falt}", choices=val, help="prova utan att ändra kundfilen")
    s.add_argument("--ut", type=Path, help="mapp att bygga i, standard ut/<kund>")
    s.add_argument("--visa", action="store_true", help="öppna sajten i webbläsaren efteråt")
    s = sub.add_parser("varianter", help="bygg kunden i flera varianter att visa")
    s.add_argument("kund")
    s.add_argument("varianter", nargs="*", help="stil:tema:hero:meny, och typsnitt, former, etiketter eller foton, i valfri "
                   "ordning. Standard fyra förslag som passar stället och inte liknar andra kunder")
    s.add_argument("--visa", action="store_true", help="öppna förhandsvisningen i webbläsaren efteråt")
    s = sub.add_parser("visa", help="öppna en byggd sajt i webbläsaren")
    s.add_argument("kund")
    s.add_argument("--varianter", action="store_true", help="visa förhandsvisningen i stället")
    s = sub.add_parser("kontroll", help="kontrollera en byggd sajt")
    s.add_argument("kund")
    s = sub.add_parser("kvalitet", help="bygg och kör hela kvalitetsgrinden (quality/STANDARD.md)")
    s.add_argument("kunder", nargs="*", help="standard alla aktiva kunder")
    s.add_argument("--snabb", action="store_true", help="utan Lighthouse, för att prova ofta medan man bygger")
    s = sub.add_parser("validera", help="kontrollera kundfil, brief, designspec och egen design utan att bygga")
    s.add_argument("kund")
    s = sub.add_parser("publicera", help="publicera på Cloudflare Workers")
    s.add_argument("kund")
    s.add_argument("--varianter", action="store_true", help="publicera förhandsvisningen i stället")
    s.add_argument("--trots-likhet", action="store_true", help="publicera fast designen ligger nära en annan kunds")
    sub.add_parser("lista", help="visa alla kunder")
    s = sub.add_parser("designer", help="öppna HJERDAL Designer, formuläret för säljare")
    s.add_argument("--port", type=int, default=4848, help="standard 4848, nästa lediga om den är upptagen")
    s.add_argument("--ingen-webblasare", action="store_true", help="starta bara servern")
    sub.add_parser("mcp", help="MCP-server så att Claude-appen kan arbeta i Designer")
    a = p.parse_args()

    try:
        if a.kommando == "ny":
            ny(a.kund, a.namn, a.egen_design)
        elif a.kommando == "bygg":
            ut = bygg(a.kund, a.ut, {k: getattr(a, k) for k in DESIGNVAL})
            if a.visa and not a.ut:
                visa(a.kund, False)
            elif a.visa:
                info(f"--visa fungerar bara utan --ut. Sajten ligger i {ut}/dist.")
        elif a.kommando == "varianter":
            varianter(a.kund, a.varianter)
            if a.visa:
                visa(a.kund, True)
        elif a.kommando == "visa":
            visa(a.kund, a.varianter)
        elif a.kommando == "kontroll":
            return 1 if kontroll(a.kund) else 0
        elif a.kommando == "kvalitet":
            return 1 if kvalitet(a.kunder, a.snabb) else 0
        elif a.kommando == "validera":
            validera(a.kund)
        elif a.kommando == "publicera":
            publicera(a.kund, a.varianter, a.trots_likhet)
        elif a.kommando == "lista":
            lista()
        elif a.kommando == "designer":
            # Designer importerar fabriken som modulen fabrik; det här är samma modul.
            sys.modules.setdefault("fabrik", sys.modules[__name__])
            from designer import server
            server.starta(a.port, oppna=not a.ingen_webblasare)
        elif a.kommando == "mcp":
            from designer import mcp
            mcp.main()
    except FabrikFel as e:
        print(f"\n✗ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
