"""HJERDAL Designer: fabriken i ett formulär, för den som inte vill skriva JSON.

    python3 fabrik.py designer

Startar en webbserver på den här datorn (bara 127.0.0.1) och öppnar formuläret
i webbläsaren. Formuläret byggs från kärnans schema (karna/fabrik-schema.json),
så ett nytt fält eller en ny stil i kärnan syns här utan att Designer ändras.
Allt arbete görs av fabrik.py: Designer läser och skriver kundfilen, bygger
förhandsvisningar och förslag och sparar kunden i GitHub med git.

Samma API används av webbläsaren och av Claude via MCP (designer/mcp.py).
Chatten med Claude i formuläret kör säljarens egen Claude Code (designer/claude.py).
Allt under /api/ som ändrar något kräver rubriken X-Hjerdal, så att en annan
webbplats inte kan skicka förfrågningar hit.
"""
from __future__ import annotations

import contextlib
import hashlib
import io
import json
import mimetypes
import os
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import fabrik
from designer import bild, claude

APP = "HJERDAL Designer"
WEBB = Path(__file__).resolve().parent / "webb"
IKON = Path(__file__).resolve().parent / "ikon.png"
# Designerns byggen ligger för sig, så att de aldrig blandas ihop med ut/<kund>/ som publiceras.
DESIGNER_UT = fabrik.UT / "designer"
STATUSFIL = fabrik.UT / ".designer.json"
# Servern stänger sig själv när ingen webbläsare eller Claude har hörts av på en halvtimme.
VILA = 30 * 60
BILDNAMN = re.compile(r"[A-Za-z0-9_][\w.-]*\.(jpe?g|png|webp|svg)", re.I)
MAX_BILD = 40 * 1024 * 1024


def kodens_version() -> str:
    """Ett fingeravtryck av Designers Python-kod, så att en Designer som kör äldre kod känns igen."""
    h = hashlib.sha1()
    for fil in sorted([fabrik.FABRIK / "fabrik.py", *Path(__file__).resolve().parent.glob("*.py")]):
        h.update(fil.read_bytes())
    return h.hexdigest()[:12]


KOD = kodens_version()

bygglas = threading.Lock()
senast_hord = time.monotonic()


# --- Kunder -------------------------------------------------------------------

def kundfil(kund: str) -> Path:
    return fabrik.kundmapp(kund) / "kund.json"


def andrad(kund: str) -> float:
    fil = kundfil(kund)
    return fil.stat().st_mtime if fil.exists() else 0.0


def lista_kunder() -> list[dict]:
    """Kunderna på startsidan, med den senaste förhandsvisningen och hur långt sajten har kommit."""
    andrade = osparade_kunder()
    kunder = []
    for mapp in sorted(p for p in fabrik.KUNDER.iterdir() if (p / "kund.json").exists()):
        rad = {"kund": mapp.name, "andrad": andrad(mapp.name), "arbetar": claude.arbetar(mapp.name)}
        try:
            data = json.loads((mapp / "kund.json").read_text(encoding="utf-8"))
            rad.update(namn=data.get("namn", mapp.name), design=fabrik.design_med_standard(data),
                       **kundstatus(mapp.name, data, andrade))
        except (json.JSONDecodeError, AttributeError):
            rad.update(namn=mapp.name, fel="Kundfilen går inte att läsa", status="utkast")
        sida = DESIGNER_UT / mapp.name / "dist" / "index.html"
        if sida.exists():
            rad.update(forhandsvisning=f"/visa/{mapp.name}/", byggd=sida.stat().st_mtime)
        kunder.append(rad)
    return kunder


def osparade_kunder() -> set[str] | None:
    """Kunderna med ändringar som inte är sparade i GitHub. None om fabriken inte är en git-mapp."""
    res = git("status", "--porcelain", "--untracked-files=all", "--", "kunder", kolla=False)
    if res.returncode != 0:
        return None
    return {rad[3:].strip('"').split("/")[1] for rad in res.stdout.splitlines() if rad[3:].strip('"').count("/") >= 2}


def kundstatus(kund: str, data: dict, osparade: set[str] | None) -> dict:
    """Utkast tills inget saknas, sedan klar, sparad i GitHub och publicerad."""
    kvar = len(problem(data))
    if kvar:
        return {"status": "utkast", "kvar": kvar}
    publicerad = fabrik.UT / kund / ".publicerad"
    if publicerad.exists() and publicerad.stat().st_mtime >= andrad(kund):
        return {"status": "publicerad"}
    if osparade is not None and kund not in osparade:
        return {"status": "sparad"}
    return {"status": "klar"}


def las(kund: str) -> dict:
    fil = kundfil(kund)
    if not fil.exists():
        raise ApiFel(404, f"Kunden {kund} finns inte.")
    try:
        data = json.loads(fil.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ApiFel(400, f"kund.json är inte giltig JSON: rad {e.lineno}, kolumn {e.colno}: {e.msg}") from e
    return {"kund": kund, "data": data, "andrad": andrad(kund)}


def problem(data: dict) -> list[tuple[str, str]]:
    """Det som syns direkt i kundfilen: samma regler som formuläret kontrollerar, så att
    Claude får veta direkt att till exempel ett telefonnummer har fel form. Det bara
    bygget ser (bilder som saknas, kontrasten) kommer när sajten byggs."""
    fel = schemafel(fabrik.SCHEMA["schema"], data)
    try:
        fabrik.granska_kund(data)
    except fabrik.FabrikFel as e:
        fel += [f for f in e.falt if f[0] not in {v for v, _ in fel}]
    return fel


def schemafel(s: dict, v, vag: str = "", kravd: bool = True) -> list[tuple[str, str]]:
    """Kundfilen mot schemat, som allaFel i webb/formular.js. Fälten skrivs som meny.sektioner.0.namn."""
    if v is None or v == "":
        return [(vag or "(hela filen)", "måste fyllas i")] if kravd else []
    em = s.get("errorMessage") or {}
    if "enum" in s and v not in s["enum"]:
        return [(vag, "välj bland " + ", ".join(map(str, s["enum"])))]
    typ = s.get("type")
    under = lambda k: f"{vag}.{k}" if vag else str(k)  # noqa: E731
    if typ == "string":
        if not isinstance(v, str):
            return [(vag, "ska vara text")]
        if s.get("minLength") and len(v) < s["minLength"]:
            return [(vag, em.get("minLength") or ("måste fyllas i" if s["minLength"] == 1 else f"ska vara minst {s['minLength']} tecken, nu {len(v)}"))]
        if s.get("maxLength") and len(v) > s["maxLength"]:
            return [(vag, em.get("maxLength") or f"får vara högst {s['maxLength']} tecken, nu {len(v)}")]
        with contextlib.suppress(re.error):
            if s.get("pattern") and not re.search(s["pattern"], v):
                return [(vag, em.get("pattern") or "har fel form")]
        if s.get("format") == "email" and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            return [(vag, em.get("format") or "skrivs som namn@exempel.se")]
        if s.get("format") == "uri" and not re.fullmatch(r"https?://[^\s/]+\.\S+", v):
            return [(vag, em.get("format") or "måste börja med https://")]
    elif typ in ("number", "integer"):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            return [(vag, "ska vara ett tal")]
        if "minimum" in s and v < s["minimum"]:
            return [(vag, f"får inte vara mindre än {s['minimum']}")]
    elif typ == "array":
        if not isinstance(v, list):
            return [(vag, "ska vara en lista")]
        if s.get("minItems") and len(v) < s["minItems"]:
            return [(vag, "behöver minst en" if s["minItems"] == 1 else f"behöver minst {s['minItems']}")]
        delar = s.get("items")
        return [f for i, x in enumerate(v)
                for f in schemafel((delar[i] if i < len(delar) else {}) if isinstance(delar, list) else delar or {}, x, under(i))]
    elif typ == "object":
        if not isinstance(v, dict):
            return [(vag, "ska vara en grupp")]
        kravs = s.get("required") or []
        return [f for k, p in (s.get("properties") or {}).items()
                for f in schemafel(p, v.get(k), under(k), k in kravs and "default" not in p)]
    return []


def spara(kund: str, data: dict, forra: float | None = None) -> dict:
    if not isinstance(data, dict):
        raise ApiFel(400, "Kundfilen ska vara ett JSON-objekt.")
    fil = kundfil(kund)
    if not fil.exists():
        raise ApiFel(404, f"Kunden {kund} finns inte.")
    # Har någon annan (till exempel Claude) ändrat filen sedan formuläret läste den?
    if forra is not None and abs(andrad(kund) - forra) > 0.001:
        raise ApiFel(409, "Kundfilen har ändrats utanför formuläret.")
    tmp = fil.with_suffix(".json.tmp")
    tmp.write_text(fabrik.json_text(data), encoding="utf-8")
    tmp.replace(fil)
    return {"andrad": andrad(kund), "problem": problem(data)}


def utan_platshallare(varde):
    """Mallen utan FYLL I-texterna, så att formuläret visar tomma fält i stället."""
    if isinstance(varde, dict):
        return {k: utan_platshallare(v) for k, v in varde.items()
                if not (isinstance(v, str) and fabrik.PLATSHALLARE in v)}
    if isinstance(varde, list):
        return [utan_platshallare(v) for v in varde if not (isinstance(v, str) and fabrik.PLATSHALLARE in v)]
    return varde


def ny_kund(namn: str, kund: str | None = None) -> dict:
    namn = (namn or "").strip()
    if not namn:
        raise ApiFel(400, "Skriv restaurangens namn.", [("namn", "måste fyllas i")])
    kund = kund or slug(namn)
    if kundfil(kund).exists():
        raise ApiFel(409, f"Det finns redan en kund som heter {kund}.", [("kund", "finns redan")])
    mall = json.loads((fabrik.FABRIK / "mall-kund.json").read_text(encoding="utf-8"))
    data = {**utan_platshallare(mall), "namn": namn}
    mapp = fabrik.kundmapp(kund)
    (mapp / "bilder").mkdir(parents=True, exist_ok=True)
    kundfil(kund).write_text(fabrik.json_text(data), encoding="utf-8")
    return las(kund)


def slug(namn: str) -> str:
    text = namn.lower()
    for a, b in (("å", "a"), ("ä", "a"), ("ö", "o"), ("é", "e"), ("ü", "u"), ("&", " och ")):
        text = text.replace(a, b)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    if not text:
        raise ApiFel(400, "Namnet behöver minst en bokstav eller siffra.", [("namn", "behöver en bokstav")])
    return text


# --- Bilder -------------------------------------------------------------------

def bildmapp(kund: str) -> Path:
    if not kundfil(kund).exists():
        raise ApiFel(404, f"Kunden {kund} finns inte.")
    return fabrik.kundmapp(kund) / "bilder"


def bilder(kund: str) -> list[dict]:
    mapp = bildmapp(kund)
    return [{"fil": f.name, "storlek": f.stat().st_size}
            for f in sorted(mapp.glob("*")) if f.is_file() and BILDNAMN.fullmatch(f.name)] if mapp.exists() else []


def bildnamn(kund: str, onskat: str) -> Path:
    """Ett säkert filnamn i kundens bildmapp som inte skriver över en annan bild."""
    stam, _, ext = Path(onskat).name.rpartition(".")
    stam = re.sub(r"[^\w-]+", "-", stam.lower()).strip("-") or "bild"
    ext = ext.lower().replace("jpeg", "jpg")
    if not BILDNAMN.fullmatch(f"{stam}.{ext}"):
        raise ApiFel(400, "Bilden ska vara en jpg, png, webp, heic eller svg.")
    mapp = bildmapp(kund)
    mapp.mkdir(parents=True, exist_ok=True)
    fil, nr = mapp / f"{stam}.{ext}", 2
    while fil.exists():
        fil, nr = mapp / f"{stam}-{nr}.{ext}", nr + 1
    return fil


def spara_bild(kund: str, onskat: str, innehall: bytes, tillatna: tuple[str, ...] = bild.FORMAT) -> dict:
    """Sparar en bild i kundens mapp, gjord lagom stor och utan metadata (designer/bild.py).
    tillatna är formaten bildfältet tar emot, så att en logga aldrig blir JPEG."""
    if not innehall:
        raise ApiFel(400, "Bilden är tom.")
    if len(innehall) > MAX_BILD:
        raise ApiFel(413, f"Bilden är större än {MAX_BILD // 1024 // 1024} MB.")
    stam, _, ext = Path(onskat).name.rpartition(".")
    ext = ext.lower()
    if ext not in bild.RASTER | {"svg"}:
        raise ApiFel(400, "Bilden ska vara en jpg, png, webp, heic eller svg.")
    if ext == "svg" and re.search(rb"<script|\son\w+\s*=|javascript:", innehall, re.I):
        raise ApiFel(400, "SVG-filen innehåller skript. Spara om loggan utan dem.")
    fore = len(innehall)
    bildmapp(kund)  # finns kunden, innan bilden görs om
    try:
        innehall, ext, matt = bild.komprimera(innehall, ext, bild.FOTO, tillatna)
    except bild.BildFel as e:
        raise ApiFel(400, str(e)) from e
    fil = bildnamn(kund, f"{stam or 'bild'}.{ext}")
    fil.write_bytes(innehall)
    return {"fil": fil.name, "storlek": len(innehall), "fore": fore, **matt}


def hamta_bild(kund: str, url: str, namn: str | None = None) -> dict:
    """Hämtar en bild från webben, till exempel från restaurangens gamla sajt. För Claude via MCP."""
    if not re.match(r"https://", url or ""):
        raise ApiFel(400, "Länken ska börja med https://")
    fraga = urllib.request.Request(url, headers={"User-Agent": f"{APP} (hjerdal.se)"})
    try:
        with urllib.request.urlopen(fraga, timeout=30) as svar:
            typ = svar.headers.get_content_type()
            innehall = svar.read(MAX_BILD + 1)
    except (urllib.error.URLError, OSError) as e:
        raise ApiFel(400, f"Kunde inte hämta bilden: {e}") from e
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg"}.get(typ)
    if not ext:
        raise ApiFel(400, f"Länken är ingen jpg, png, webp eller svg utan {typ}.")
    stam = Path(namn or Path(urlparse(url).path).name or "bild").stem
    # En logga ska förbli PNG eller WebP, eftersom loggans fält inte tar emot JPEG.
    tillatna = ("png", "webp") if re.search(r"logo|logga", stam, re.I) else bild.FORMAT
    return spara_bild(kund, f"{stam}.{ext}", innehall, tillatna)


# --- Bygget -------------------------------------------------------------------

def i_fabriken(fn, *args, **kw):
    """Kör fabriken med ett bygge åt gången och fånga det den skriver."""
    if not bygglas.acquire(timeout=600):
        raise ApiFel(503, "Ett annat bygge pågår fortfarande.")
    utskrift = io.StringIO()
    try:
        with contextlib.redirect_stdout(utskrift):
            return fn(*args, **kw), utskrift.getvalue()
    except fabrik.FabrikFel as e:
        raise ApiFel(400, str(e), e.falt, utskrift.getvalue()) from e
    finally:
        bygglas.release()


def forhandsvisa(kund: str) -> dict:
    ut = DESIGNER_UT / kund
    data = las(kund)["data"]

    def kor():
        fabrik.bygg(kund, ut, kontrollera=False, base=f"/visa/{kund}/", forhandsvisning=True)
        return fabrik.granska(ut / "dist", fabrik.las_kund(kund))

    g, logg = i_fabriken(kor)
    return {"url": f"/visa/{kund}/", "namn": data.get("namn"), "logg": logg, **g}


def forslag(kund: str, varianter: list[str] | None = None) -> dict:
    samling = DESIGNER_UT / f"{kund}-forslag"
    _, logg = i_fabriken(fabrik.varianter, kund, varianter or [], ut=DESIGNER_UT / kund,
                         samling=samling, prefix=f"/forslag/{kund}/")
    lista = json.loads((samling / "varianter.json").read_text(encoding="utf-8"))
    return {"url": f"/forslag/{kund}/", "varianter": lista, "logg": logg}


# --- GitHub -------------------------------------------------------------------

def git(*args: str, kolla: bool = True) -> subprocess.CompletedProcess:
    res = subprocess.run(["git", *args], cwd=fabrik.FABRIK, capture_output=True, text=True, timeout=180)
    if kolla and res.returncode != 0:
        raise ApiFel(500, (res.stderr or res.stdout).strip() or f"git {args[0]} misslyckades")
    return res


def spara_github(kund: str) -> dict:
    """Checkar in kundens mapp och skickar den till GitHub. Bara kunder/<kund>/, inget annat."""
    data = las(kund)["data"]
    if not git("config", "user.email", kolla=False).stdout.strip():
        raise ApiFel(400, "Git vet inte vem du är. Kör designer/installera.command igen, "
                          "eller i Terminal: git config --global user.name \"Ditt Namn\" och "
                          "git config --global user.email din@epost.se")
    vag = f"kunder/{kund}"
    with bygglas:
        git("add", "-A", "--", vag)
        if git("diff", "--cached", "--quiet", "--", vag, kolla=False).returncode == 0:
            andringar = False
        else:
            git("commit", "-m", f"{data.get('namn', kund)}: sparad i {APP}", "--", vag)
            andringar = True
        # Hämta det andra har sparat och lägg den här ändringen överst, sedan skicka.
        if git("pull", "--rebase", "--autostash", kolla=False).returncode != 0:
            git("rebase", "--abort", kolla=False)
            raise ApiFel(409, "Någon annan har sparat en ändring som krockar med din. Din ändring finns kvar "
                              "på datorn men är inte skickad. Be någon som kan git om hjälp.")
        skicka = git("push", kolla=False)
        if skicka.returncode != 0:
            raise ApiFel(500, "Kunde inte skicka till GitHub: " + (skicka.stderr or skicka.stdout).strip())
    rad = git("log", "-1", "--format=%h %s", "--", vag).stdout.strip()
    return {"andringar": andringar, "senaste": rad,
            "meddelande": "Sparad i GitHub." if andringar else "Inget nytt att spara, GitHub har redan den här versionen."}


def uppdatera() -> dict:
    """Hämtar den senaste fabriken från GitHub. Servern startar om om något ändrades."""
    fore = git("rev-parse", "HEAD").stdout.strip()
    with bygglas:
        res = git("pull", "--ff-only", kolla=False)
    if res.returncode != 0:
        raise ApiFel(409, "Kunde inte uppdatera: " + (res.stderr or res.stdout).strip())
    efter = git("rev-parse", "HEAD").stdout.strip()
    return {"andrat": fore != efter, "logg": res.stdout.strip(),
            "meddelande": "Fabriken är uppdaterad. Designer startar om." if fore != efter else "Fabriken är redan den senaste."}


def info() -> dict:
    gren = git("branch", "--show-current", kolla=False).stdout.strip()
    return {"app": APP, "karna": fabrik.karnans_version(), "fabrik": str(fabrik.FABRIK), "gren": gren, "kod": KOD}


# --- HTTP ---------------------------------------------------------------------

class ApiFel(Exception):
    def __init__(self, status: int, text: str, falt: list | None = None, logg: str = "") -> None:
        super().__init__(text)
        self.status, self.falt, self.logg = status, falt or [], logg


class Hanterare(BaseHTTPRequestHandler):
    server_version = "HJERDAL-Designer"
    protocol_version = "HTTP/1.1"

    def log_message(self, *args) -> None:
        pass

    def do_GET(self) -> None:
        self.hantera("GET")

    def do_POST(self) -> None:
        self.hantera("POST")

    def do_PUT(self) -> None:
        self.hantera("PUT")

    def do_DELETE(self) -> None:
        self.hantera("DELETE")

    def hantera(self, metod: str) -> None:
        global senast_hord
        senast_hord = time.monotonic()
        url = urlparse(self.path)
        delar = [unquote(d) for d in url.path.split("/") if d]
        try:
            # Bara den här datorn, och bara under det namn servern startades med (mot DNS-rebinding).
            port = self.server.server_address[1]
            if self.headers.get("Host") not in (f"localhost:{port}", f"127.0.0.1:{port}"):
                raise ApiFel(403, "Fel värd.")
            if delar[:1] == ["api"]:
                if metod != "GET" and self.headers.get("X-Hjerdal") != "1":
                    raise ApiFel(403, "Förfrågan saknar X-Hjerdal.")
                self.api(metod, delar[1:], parse_qs(url.query))
            elif metod != "GET":
                raise ApiFel(405, "Bara GET.")
            elif delar[:1] == ["visa"] and len(delar) >= 2:
                self.statiskt(DESIGNER_UT / fabrik.kundmapp(delar[1]).name / "dist", delar[2:], f"/visa/{delar[1]}")
            elif delar[:1] == ["forslag"] and len(delar) >= 2:
                self.statiskt(DESIGNER_UT / f"{fabrik.kundmapp(delar[1]).name}-forslag", delar[2:], f"/forslag/{delar[1]}")
            elif delar == ["ikon.png"]:
                self.fil(IKON)
            else:
                self.statiskt(WEBB, delar, "", spa=True)
        except ApiFel as e:
            self.json({"fel": str(e), "falt": e.falt, "logg": e.logg}, e.status)
        except fabrik.FabrikFel as e:
            self.json({"fel": str(e), "falt": e.falt}, 400)
        except Exception as e:  # noqa: BLE001  servern ska aldrig dö av en förfrågan
            self.json({"fel": f"Något gick fel i Designer: {e.__class__.__name__}: {e}"}, 500)

    def api(self, metod: str, d: list[str], q: dict) -> None:
        kropp = self.las_kropp
        if (metod, d) == ("GET", ["info"]):
            return self.json(info())
        if (metod, d) == ("GET", ["schema"]):
            return self.fil(fabrik.KARNA / "fabrik-schema.json")
        if (metod, d) == ("GET", ["puls"]):
            kund = q.get("kund", [""])[0]
            return self.json({"andrad": andrad(kund) if kund else None})
        if (metod, d) == ("GET", ["kunder"]):
            return self.json(lista_kunder())
        if (metod, d) == ("POST", ["kunder"]):
            b = kropp()
            return self.json(ny_kund(b.get("namn", ""), b.get("kund") or None), 201)
        if (metod, d) == ("POST", ["uppdatera"]):
            svar = uppdatera()
            self.json(svar)
            if svar["andrat"]:
                threading.Timer(0.3, starta_om, args=(self.server,)).start()
            return None
        if (metod, d) == ("POST", ["oppna"]):
            kund = kropp().get("kund")
            port = self.server.server_address[1]
            oppna_fonster(f"http://127.0.0.1:{port}/" + (f"#/kund/{fabrik.kundmapp(kund).name}" if kund else ""))
            return self.json({"oppnad": True})
        if (metod, d) == ("GET", ["claude"]):
            return self.json(claude.status(farsk="farsk" in q))
        if (metod, d) == ("POST", ["claude", "installera"]):
            claude.oppna_terminal("curl -fsSL https://claude.ai/install.sh | bash && ~/.local/bin/claude auth login")
            return self.json({"oppnad": True})
        if (metod, d) == ("POST", ["claude", "logga-in"]):
            claude.oppna_terminal(f"{shlex.quote(claude.hitta() or 'claude')} auth login")
            return self.json({"oppnad": True})
        if (metod, d) == ("POST", ["avsluta"]):
            self.json({"meddelande": "Designer är avslutad."})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return None
        if len(d) >= 2 and d[0] == "kunder":
            kund = fabrik.kundmapp(d[1]).name
            rest = d[2:]
            if (metod, rest) == ("GET", []):
                return self.json(las(kund))
            if (metod, rest) == ("PUT", []):
                b = kropp()
                return self.json(spara(kund, b.get("data"), b.get("andrad")))
            if (metod, rest) == ("POST", ["bygg"]):
                return self.json(forhandsvisa(kund))
            if (metod, rest) == ("POST", ["forslag"]):
                return self.json(forslag(kund, kropp().get("varianter")))
            if (metod, rest) == ("POST", ["spara"]):
                return self.json(spara_github(kund))
            if (metod, rest) == ("GET", ["bilder"]):
                return self.json(bilder(kund))
            if (metod, rest) == ("POST", ["bilder"]):
                langd = int(self.headers.get("Content-Length") or 0)
                if langd > MAX_BILD:
                    raise ApiFel(413, f"Bilden är större än {MAX_BILD // 1024 // 1024} MB.")
                tillatna = tuple(q.get("typer", [",".join(bild.FORMAT)])[0].split(","))
                return self.json(spara_bild(kund, q.get("namn", ["bild.jpg"])[0], self.rfile.read(langd), tillatna), 201)
            if rest[:1] == ["claude"]:
                return self.chatt(metod, kund, rest[1:], q)
            if (metod, rest) == ("POST", ["hamta-bild"]):
                b = kropp()
                return self.json(hamta_bild(kund, b.get("url", ""), b.get("namn")), 201)
            if len(rest) == 2 and rest[0] == "bilder" and BILDNAMN.fullmatch(rest[1]):
                fil = bildmapp(kund) / rest[1]
                if metod == "GET":
                    return self.fil(fil)
                if metod == "DELETE" and fil.exists():
                    fil.unlink()
                    return self.json({"borttagen": rest[1]})
        raise ApiFel(404, "Finns inte.")

    def chatt(self, metod: str, kund: str, rest: list[str], q: dict) -> None:
        if (metod, rest) == ("GET", []):
            return self.json(claude.lage(kund))
        if (metod, rest) == ("POST", []):
            b = self.las_kropp()
            text = str(b.get("text") or "").strip()
            if not text:
                raise ApiFel(400, "Skriv något till Claude.")
            namn = las(kund)["data"].get("namn", kund)
            try:
                claude.starta(kund, namn, text, [str(x) for x in b.get("bilagor") or []])
            except fabrik.FabrikFel as e:
                raise ApiFel(409, str(e)) from e
            # Claude arbetar i en egen tråd. Webbläsaren följer bara med och kan gå när som helst.
            return self.strom(claude.folj(kund))
        if (metod, rest) == ("GET", ["strom"]):
            fran = q.get("fran", ["0"])[0]
            return self.strom(claude.folj(kund, int(fran) if fran.isdigit() else 0))
        if (metod, rest) == ("POST", ["angra"]):
            id_ = str(self.las_kropp().get("id") or "")
            try:
                data = claude.angra(kund, id_)
            except fabrik.FabrikFel as e:
                raise ApiFel(400, str(e)) from e
            return self.json({**spara(kund, data), "data": data})
        if (metod, rest) == ("DELETE", []):
            claude.ny_chatt(kund)
            return self.json({"ny": True})
        if (metod, rest) == ("POST", ["stoppa"]):
            return self.json({"stoppad": claude.stoppa(kund)})
        if (metod, rest) == ("POST", ["bilagor"]):
            langd = int(self.headers.get("Content-Length") or 0)
            if langd > claude.MAX_BILAGA:
                raise ApiFel(413, f"Bilagan är större än {claude.MAX_BILAGA // 1024 // 1024} MB.")
            return self.json({"fil": claude.spara_bilaga(kund, q.get("namn", ["bilaga.jpg"])[0], self.rfile.read(langd))}, 201)
        raise ApiFel(404, "Finns inte.")

    def las_kropp(self) -> dict:
        langd = int(self.headers.get("Content-Length") or 0)
        if not langd:
            return {}
        try:
            kropp = json.loads(self.rfile.read(langd).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise ApiFel(400, "Förfrågan är inte giltig JSON.") from e
        if not isinstance(kropp, dict):
            raise ApiFel(400, "Förfrågan ska vara ett JSON-objekt.")
        return kropp

    def statiskt(self, rot: Path, delar: list[str], prefix: str, spa: bool = False) -> None:
        if any(d.startswith(".") for d in delar):
            raise ApiFel(404, "Finns inte.")
        fil = rot.joinpath(*delar)
        if fil.is_dir():
            if not self.path.split("?")[0].endswith("/"):
                return self.omdirigera(self.path.split("?")[0] + "/")
            fil = fil / "index.html"
        if not fil.is_file() and spa:
            fil = rot / "index.html"
        if not fil.is_file():
            sida404 = rot / "404.html"
            if sida404.is_file():
                return self.fil(sida404, 404)
            hint = "Bygg förhandsvisningen först." if prefix else "Finns inte."
            raise ApiFel(404, hint)
        return self.fil(fil)

    def fil(self, fil: Path, status: int = 200) -> None:
        fil = fil.resolve()
        tillatna = (WEBB.resolve(), DESIGNER_UT.resolve(), fabrik.KUNDER.resolve(), fabrik.KARNA.resolve(), IKON.resolve())
        if not fil.is_file() or not any(fil == t or t in fil.parents for t in tillatna):
            raise ApiFel(404, "Finns inte.")
        typ = mimetypes.guess_type(fil.name)[0] or "application/octet-stream"
        if typ.startswith("text/") or typ in ("application/javascript", "application/json", "image/svg+xml"):
            typ += "; charset=utf-8"
        innehall = fil.read_bytes()
        self.send_response(status)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(innehall)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if fil.suffix == ".svg":
            # En uppladdad SVG visas som bild och får aldrig köra skript här.
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
        self.end_headers()
        self.wfile.write(innehall)

    def strom(self, handelser) -> None:
        """Skickar händelserna en rad JSON i taget medan de kommer, för chatten med Claude."""
        global senast_hord
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        try:
            for h in handelser:
                self.wfile.write((json.dumps(h, ensure_ascii=False) + "\n").encode("utf-8"))
                self.wfile.flush()
                senast_hord = time.monotonic()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            handelser.close()

    def omdirigera(self, till: str) -> None:
        self.send_response(301)
        self.send_header("Location", till)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def json(self, data, status: int = 200) -> None:
        innehall = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(innehall)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(innehall)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address) -> None:
        # Ett fönster som stängs mitt i ett svar är inget fel.
        if not isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            super().handle_error(request, client_address)


# --- Start och stopp ----------------------------------------------------------

def kor_redan() -> str | None:
    """Adressen till en Designer som redan kör från samma fabrik, annars None.

    En Designer som kör äldre kod, till exempel efter git pull eller en ny
    installation, avslutas, så att den nya koden startar i stället för att
    fönstret öppnas mot den gamla servern.
    """
    try:
        port = json.loads(STATUSFIL.read_text(encoding="utf-8"))["port"]
        bas = f"http://127.0.0.1:{port}"
        with urllib.request.urlopen(f"{bas}/api/info", timeout=1.5) as svar:
            i = json.loads(svar.read())
        if i.get("app") != APP or i.get("fabrik") != str(fabrik.FABRIK):
            return None
        if i.get("kod") == KOD:
            return f"{bas}/"
        fabrik.info("En äldre Designer kör. Den avslutas och den nya startar.")
        avsluta = urllib.request.Request(f"{bas}/api/avsluta", data=b"", method="POST", headers={"X-Hjerdal": "1"})
        with urllib.request.urlopen(avsluta, timeout=5):
            pass
        for _ in range(40):
            time.sleep(0.25)
            urllib.request.urlopen(f"{bas}/api/info", timeout=0.5).close()
    except (OSError, ValueError, KeyError):
        pass
    return None


def oppna_fonster(adress: str) -> None:
    """Chrome i appläge ger ett eget fönster utan flikar, som ett vanligt program. Annars standardwebbläsaren."""
    chrome = [Path("/Applications/Google Chrome.app"), Path.home() / "Applications/Google Chrome.app"]
    if sys.platform == "darwin" and any(c.exists() for c in chrome):
        subprocess.Popen(["open", "-na", "Google Chrome", "--args", f"--app={adress}", "--window-size=1440,900"])
    else:
        webbrowser.open(adress)


def starta_om(server: ThreadingHTTPServer) -> None:
    """Efter en uppdatering: samma kommando igen, i samma process och på samma port."""
    port = server.server_address[1]
    server.server_close()
    os.execv(sys.executable, [sys.executable, str(fabrik.FABRIK / "fabrik.py"), "designer",
                              "--port", str(port), "--ingen-webblasare"])


def vakt(server: ThreadingHTTPServer) -> None:
    while True:
        time.sleep(30)
        if time.monotonic() - senast_hord > VILA and not bygglas.locked() and not claude.nagon_arbetar():
            server.shutdown()
            return


def starta(port: int = 4848, oppna: bool = True) -> None:
    redan = kor_redan()
    if redan:
        fabrik.rubrik(f"{APP} kör redan på {redan}")
        if oppna:
            oppna_fonster(redan)
        return
    if not shutil.which("node"):
        raise fabrik.FabrikFel("Node saknas. Installera med: brew install node")
    for p in range(port, port + 20):
        try:
            server = Server(("127.0.0.1", p), Hanterare)
            break
        except OSError:
            continue
    else:
        raise fabrik.FabrikFel(f"Hittar ingen ledig port mellan {port} och {port + 19}.")
    adress = f"http://127.0.0.1:{server.server_address[1]}/"
    fabrik.UT.mkdir(exist_ok=True)
    STATUSFIL.write_text(json.dumps({"port": server.server_address[1], "pid": os.getpid()}), encoding="utf-8")
    fabrik.rubrik(f"{APP} kör på {adress}")
    fabrik.info("Avsluta med Ctrl+C, eller låt den stänga sig själv efter en halvtimme utan fönster.")
    threading.Thread(target=vakt, args=(server,), daemon=True).start()
    if oppna:
        threading.Timer(0.3, oppna_fonster, args=(adress,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
    finally:
        server.server_close()
        with contextlib.suppress(OSError, ValueError, KeyError):
            if json.loads(STATUSFIL.read_text(encoding="utf-8"))["pid"] == os.getpid():
                STATUSFIL.unlink()
