#!/usr/bin/env python3
"""HJERDAL:s sajtfabrik: från en kundfil till en färdig restaurangsajt.

Fabriken skriver ingen kod. Den kopierar kärnan (karna/), lägger in kundens
fil och bilder, tar bort sidor kunden inte har valt, bygger med Astro och
kontrollerar resultatet. Inga AI-anrop, så en ny sajt kostar inga credits.

    python3 fabrik.py ny <kund> --namn "Bistro Nordvik"
    python3 fabrik.py bygg <kund>
    python3 fabrik.py varianter <kund> [klassisk:linne kvarter:skiffer:kort ...]
    python3 fabrik.py visa <kund> [--varianter]
    python3 fabrik.py kontroll <kund>
    python3 fabrik.py publicera <kund> [--varianter]
    python3 fabrik.py lista

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
KARNA = FABRIK / "karna"
KUNDER = FABRIK / "kunder"
UT = FABRIK / "ut"

STILAR = ("hjerdal", "klassisk", "kvarter", "mjuk")
TEMAN = ("fjall", "linne", "salvia", "ek", "skiffer", "hav")
HEROS = ("text", "delad", "bild")
MENYER = ("lista", "kolumner", "kort")
DESIGNVAL = {"stil": STILAR, "tema": TEMAN, "hero": HEROS, "meny": MENYER}
# Förslagen när varianter körs utan argument: fyra stilar som skiljer sig så mycket som möjligt.
STANDARDVARIANTER = ("klassisk:linne:delad:lista", "kvarter:skiffer:bild:kort", "mjuk:salvia:delad:kort", "hjerdal:hav:text:kolumner")
# Sidor som kan stängas av i kundfilen, och vilken flagga som styr dem.
VALBARA_SIDOR = {"om-oss.astro": "omOss", "skarm.astro": "skarm", "qr.astro": "qr"}
# Det som aldrig kopieras från kärnan till en kund.
HOPPA_OVER = {"node_modules", "dist", ".astro", ".wrangler"}
PLATSHALLARE = "FYLL I"


class FabrikFel(Exception):
    """Ett fel som stoppar fabriken med ett meddelande till den som kör den."""


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
    saknas = [k for k in ("namn", "doman", "meny", "kontakt", "oppettider") if k not in data]
    if saknas:
        raise FabrikFel(f"Kundfilen saknar {', '.join(saknas)}. Resten kontrolleras när sajten byggs.")
    rester = [v for v in platshallare(data)]
    if rester:
        raise FabrikFel("Kundfilen har fält som inte är ifyllda:\n" + "\n".join(f"    - {r}" for r in rester))
    design = data.get("design", {})
    fel = [f"design.{k}: '{design[k]}' finns inte, välj {', '.join(val)}"
           for k, val in DESIGNVAL.items() if k in design and design[k] not in val]
    if fel:
        raise FabrikFel("Kundfilen har fel:\n" + "\n".join(f"    - {f}" for f in fel))
    return data


def platshallare(varde, vag: str = "") -> list[str]:
    """Alla fält som fortfarande har texten FYLL I."""
    if isinstance(varde, dict):
        return [r for k, v in varde.items() for r in platshallare(v, f"{vag}.{k}" if vag else k)]
    if isinstance(varde, list):
        return [r for i, v in enumerate(varde) for r in platshallare(v, f"{vag}[{i}]")]
    return [vag] if isinstance(varde, str) and PLATSHALLARE in varde else []


def med_design(data: dict, **val: str | None) -> dict:
    """En kopia av kundfilen med andra designval, till exempel stil="klassisk"."""
    ny = json.loads(json.dumps(data))
    design = ny.setdefault("design", {})
    design.update({k: v for k, v in val.items() if v})
    return ny


def design_med_standard(data: dict) -> dict:
    d = data.get("design", {})
    return {"stil": d.get("stil", "hjerdal"), "tema": d.get("tema", "fjall"), "hero": d.get("hero", "text"), "meny": d.get("meny", "lista")}


# --- Bygget -----------------------------------------------------------------

def kor(cmd: list[str], cwd: Path, env: dict | None = None, tyst: bool = False) -> None:
    res = subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})}, text=True,
                         stdout=subprocess.PIPE if tyst else None, stderr=subprocess.STDOUT if tyst else None)
    if res.returncode != 0:
        # Fel i kundfilen eller temat (src/lib/kund.ts, src/lib/tema.ts) visas utan Astros stackspår.
        kund_fel = re.search(r"((?:Kundfilen har fel|Temat \S+ har för låg kontrast).*?)(?:\n\s*(?:Location|Stack trace):|\Z)",
                             res.stdout or "", re.S)
        if kund_fel:
            raise FabrikFel(kund_fel.group(1).strip())
        if tyst and res.stdout:
            print(res.stdout[-6000:])
        raise FabrikFel(f"Kommandot misslyckades: {' '.join(cmd)}")


def karnans_version() -> str:
    return json.loads((KARNA / "package.json").read_text(encoding="utf-8"))["version"]


def synka_karna(ut: Path) -> None:
    """Gör ut/ till en ren kopia av kärnan men behåll node_modules, så att npm slipper installera om."""
    ut.mkdir(parents=True, exist_ok=True)
    for sak in ut.iterdir():
        if sak.name == "node_modules":
            continue
        shutil.rmtree(sak) if sak.is_dir() and not sak.is_symlink() else sak.unlink()
    shutil.copytree(KARNA, ut, dirs_exist_ok=True, ignore=lambda d, namn: [n for n in namn if n in HOPPA_OVER])


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
            (ut / "src/pages" / sida).unlink()

    wrangler = ut / "wrangler.jsonc"
    wrangler.write_text(wrangler.read_text(encoding="utf-8").replace('"hjerdal-kund"', f'"hjerdal-{kund}"'), encoding="utf-8")

    (ut / "fabrik.json").write_text(json.dumps({
        "kund": kund,
        "karna": karnans_version(),
        "byggd": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }, indent=2) + "\n", encoding="utf-8")


def npm_install(ut: Path) -> None:
    """Installera bara när package.json har ändrats sedan förra bygget."""
    paket = hashlib.sha256((ut / "package.json").read_bytes()).hexdigest()
    markor = ut / "node_modules/.fabrik-paket"
    if markor.exists() and markor.read_text() == paket:
        info("Beroenden: oförändrade")
        return
    info("Beroenden: installerar (npm install)")
    kor(["npm", "install", "--no-audit", "--no-fund", "--loglevel=error"], ut, tyst=True)
    markor.write_text(paket)


def bygg(kund: str, ut: Path | None = None, design: dict | None = None, kontrollera: bool = True) -> Path:
    data = med_design(las_kund(kund), **(design or {}))
    ut = ut or UT / kund
    rubrik(f"Bygger {data['namn']} ({kund}) med kärnan {karnans_version()}")
    synka_karna(ut)
    skriv_kund(ut, kund, data)
    d = design_med_standard(data)
    info(f"Design: stil {d['stil']}, tema {d['tema']}, hero {d['hero']}, meny {d['meny']}")
    npm_install(ut)
    info("Astro: kontrollerar kundfil och typer, bygger sidorna")
    kor(["npm", "run", "build", "--silent"], ut, tyst=True)
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
                if a.get("src"):
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
    """Kontrollerar den byggda sajten. Returnerar antalet fel; varningar stoppar inte."""
    dist = dist or UT / kund / "dist"
    data = data or las_kund(kund)
    rubrik("Kontrollerar sajten")
    if not dist.exists():
        raise FabrikFel(f"Hittar ingen byggd sajt i {dist}. Kör först: fabrik.py bygg {kund}")
    fel: list[str] = []
    varn: list[str] = []

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
        # Bara menyskärmen får ha JavaScript; resten av sajten ska fungera utan.
        if s.skript and namn != "/skarm/":
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
    info(f"{len(sidor)} sidor kontrollerade, typsnittsfiler totalt {typsnitt // 1000} kB (laddas bara de som används)")
    for v in varn:
        info(f"Varning: {v}")
    for f in fel:
        info(f"FEL: {f}")
    if not fel:
        info("Inga fel.")
    return len(fel)


# --- Varianter --------------------------------------------------------------

def tolka_variant(text: str) -> dict:
    """'klassisk:linne:bild:kort' blir stil, tema, hero och meny. Ordningen spelar ingen roll,
    och det som inte anges tas från kundfilen."""
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


def varianter(kund: str, lista: list[str]) -> Path:
    """Bygger samma kund i flera varianter till en förhandsvisning att visa kunden."""
    data = las_kund(kund)
    valda = [tolka_variant(v) for v in (lista or STANDARDVARIANTER)]
    ut = UT / kund
    samling = UT / f"{kund}-varianter"
    if samling.exists():
        shutil.rmtree(samling)
    samling.mkdir(parents=True)
    kort = []
    # Kundens eget bygge i ut/<kund>/dist flyttas undan och tillbaka, så att det inte skrivs över.
    undan = UT / f".{kund}-dist"
    if (ut / "dist").exists():
        shutil.rmtree(undan, ignore_errors=True)
        shutil.move(str(ut / "dist"), str(undan))
    synka_karna(ut)
    npm_install(ut)
    for nr, design in enumerate(valda, start=1):
        d = {**design_med_standard(data), **design}
        # Utan bild blir hero text på sajten, så förhandsvisningen ska heta så också.
        utan_bild = not data.get("bilder", {}).get("hero") and d["hero"] != "text"
        if utan_bild:
            d["hero"] = design["hero"] = "text"
        namn = "-".join(d[k] for k in DESIGNVAL)
        rubrik(f"Variant {nr} av {len(valda)}: {namn}")
        if utan_bild:
            info("Kunden har ingen herobild, så hero visas som text")
        if any(namn == k for k, _ in kort):
            info("Samma som en tidigare variant, hoppar över")
            continue
        skriv_kund(ut, kund, med_design(data, **design))
        kor(["npx", "astro", "build", "--silent"], ut, env={"FABRIK_BASE": f"/{namn}/", "PUBLIC_FORHANDSVISNING": "1"}, tyst=True)
        shutil.move(str(ut / "dist"), str(samling / namn))
        kort.append((namn, d))
        info(f"Klar: /{namn}/")
    # Kundens egen design och bygge ligger kvar i ut/ efter förhandsvisningen.
    skriv_kund(ut, kund, data)
    if undan.exists():
        shutil.move(str(undan), str(ut / "dist"))
    (samling / "index.html").write_text(varianter_index(data["namn"], kort), encoding="utf-8")
    (samling / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    (samling / "wrangler.jsonc").write_text(json.dumps({
        "name": f"hjerdal-{kund}-forslag",
        "compatibility_date": "2026-09-01",
        "assets": {"directory": ".", "html_handling": "force-trailing-slash"},
    }, indent=2) + "\n", encoding="utf-8")
    info(f"Förhandsvisningen ligger i {kort_vag(samling)}/ med {len(kort)} varianter")
    return samling


STIL_NAMN = {"hjerdal": "HJERDAL", "klassisk": "Klassisk", "kvarter": "Kvarter", "mjuk": "Mjuk"}
TEMA_NAMN = {"fjall": "Fjäll", "linne": "Linne", "salvia": "Salvia", "ek": "Ek", "skiffer": "Skiffer", "hav": "Hav"}
# Bakgrund och text per tema, samma som i karna/src/lib/tema.ts.
TEMA_FARG = {
    "fjall": ("#F5F6F4", "#101315"), "linne": ("#F3EFE7", "#221E18"), "salvia": ("#EEF1EA", "#1C261F"),
    "ek": ("#1B1814", "#F2EDE3"), "skiffer": ("#111417", "#EEF1F2"), "hav": ("#0E1822", "#EEF3F6"),
}


def varianter_index(namn: str, kort: list[tuple[str, dict]]) -> str:
    rader = []
    for mapp, d in kort:
        bg, ink = TEMA_FARG[d["tema"]]
        rader.append(
            f'<li><a href="./{mapp}/" style="background:{bg};color:{ink}">'
            f'<span class="t">{STIL_NAMN[d["stil"]]}</span>'
            f'<span class="d">Färger: {TEMA_NAMN[d["tema"]]} · Hero: {d["hero"]} · Meny: {d["meny"]}</span>'
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

def ny(kund: str, namn: str | None) -> None:
    mapp = kundmapp(kund)
    if mapp.exists():
        raise FabrikFel(f"Kunden {kund} finns redan i {kort_vag(mapp)}.")
    mall = json.loads((FABRIK / "mall-kund.json").read_text(encoding="utf-8"))
    if namn:
        mall["namn"] = namn
    (mapp / "bilder").mkdir(parents=True)
    (mapp / "kund.json").write_text(json.dumps(mall, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rubrik(f"Skapade {kort_vag(mapp)}/")
    info("Fyll i kund.json (alla fält med FYLL I) och lägg bilderna i bilder/.")
    info(f"Bygg sedan med: python3 fabrik.py bygg {kund}")


def lista() -> None:
    rubrik("Kunder i fabriken")
    for mapp in sorted(p for p in KUNDER.iterdir() if (p / "kund.json").exists()):
        try:
            data = json.loads((mapp / "kund.json").read_text(encoding="utf-8"))
            d = data.get("design", {})
            byggd = UT / mapp.name / "fabrik.json"
            nar = json.loads(byggd.read_text())["byggd"][:10] if byggd.exists() else "inte byggd"
            info(f"{mapp.name:<24} {data.get('namn', '?'):<28} {d.get('stil', 'hjerdal'):<9} {d.get('tema', 'fjall'):<8} {nar}")
        except (json.JSONDecodeError, KeyError):
            info(f"{mapp.name:<24} (kundfilen går inte att läsa)")


def publicera(kund: str, forslag: bool) -> None:
    mapp = UT / (f"{kund}-varianter" if forslag else kund)
    if not (mapp / "wrangler.jsonc").exists():
        raise FabrikFel(f"Inget att publicera i {mapp}. Kör först: fabrik.py {'varianter' if forslag else 'bygg'} {kund}")
    if not forslag:
        fel = kontroll(kund, mapp / "dist")
        if fel:
            raise FabrikFel("Sajten publiceras inte förrän kontrollen är utan fel.")
    if not os.environ.get("CLOUDFLARE_API_TOKEN"):
        raise FabrikFel("CLOUDFLARE_API_TOKEN saknas. Lägg in en API-token med rätten Workers Scripts: Edit och kör igen.")
    rubrik(f"Publicerar {mapp.name} på Cloudflare")
    kor(["npx", "--yes", "wrangler@4", "deploy"], mapp)


def main() -> int:
    p = argparse.ArgumentParser(prog="fabrik.py", description="HJERDAL:s sajtfabrik för restauranger.")
    sub = p.add_subparsers(dest="kommando", required=True)
    s = sub.add_parser("ny", help="skapa en ny kund från mallen")
    s.add_argument("kund")
    s.add_argument("--namn")
    s = sub.add_parser("bygg", help="bygg och kontrollera kundens sajt")
    s.add_argument("kund")
    for falt, val in DESIGNVAL.items():
        s.add_argument(f"--{falt}", choices=val, help="prova utan att ändra kundfilen")
    s.add_argument("--ut", type=Path, help="mapp att bygga i, standard ut/<kund>")
    s.add_argument("--visa", action="store_true", help="öppna sajten i webbläsaren efteråt")
    s = sub.add_parser("varianter", help="bygg kunden i flera varianter att visa")
    s.add_argument("kund")
    s.add_argument("varianter", nargs="*", help="stil:tema:hero:meny i valfri ordning, standard fyra olika stilar")
    s.add_argument("--visa", action="store_true", help="öppna förhandsvisningen i webbläsaren efteråt")
    s = sub.add_parser("visa", help="öppna en byggd sajt i webbläsaren")
    s.add_argument("kund")
    s.add_argument("--varianter", action="store_true", help="visa förhandsvisningen i stället")
    s = sub.add_parser("kontroll", help="kontrollera en byggd sajt")
    s.add_argument("kund")
    s = sub.add_parser("publicera", help="publicera på Cloudflare Workers")
    s.add_argument("kund")
    s.add_argument("--varianter", action="store_true", help="publicera förhandsvisningen i stället")
    sub.add_parser("lista", help="visa alla kunder")
    a = p.parse_args()

    try:
        if a.kommando == "ny":
            ny(a.kund, a.namn)
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
        elif a.kommando == "publicera":
            publicera(a.kund, a.varianter)
        elif a.kommando == "lista":
            lista()
    except FabrikFel as e:
        print(f"\n✗ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
