"""Claude i Designer: chatten bredvid formuläret.

Chatten kör säljarens egen Claude Code (kommandot claude), inloggad med
säljarens Claude-konto. Det går alltså på abonnemanget, utan API-nyckel.
Designer rör aldrig inloggningen; den sköts helt av Claude Code.

Claude Code får bara Designers verktyg (MCP-servern i designer/mcp.py),
webbsökning, att läsa en webbsida och att läsa filer i kundens chattmapp
(ut/claude/<kund>/), där bilagorna säljaren skickar hamnar. Inget annat på
datorn. Varje kund har en egen konversation som fortsätter där den slutade.

Claude arbetar i en egen tråd (starta), så att arbetet fortsätter när säljaren
byter kund eller stänger fönstret. Webbläsaren följer händelserna med folj och
kan ansluta igen var som helst i flödet. Före varje tur sparas kundfilen, så att
säljaren kan ångra precis de fält Claude ändrade (angra).
"""
from __future__ import annotations

import glob
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import fabrik
from designer import bild

MAPP = fabrik.UT / "claude"
SERVER = "hjerdal-designer"
BILAGENAMN = re.compile(r"[\w][\w.-]*\.(jpe?g|png|webp|gif|pdf|txt|md|csv)", re.I)
MAX_BILAGA = 40 * 1024 * 1024
# Verktyg som inte hör hemma i chatten: GitHub sparar säljaren själv, och fönstret är redan öppet.
SPARRADE = ("spara_till_github", "oppna_designer")
# Verktyg som ändrar kundfilen eller bilderna, så att formuläret läser om dem direkt.
ANDRAR = ("spara_kundfil", "andra_falt", "hamta_bild")

VERKTYGSTEXT = {
    "kundfilens_falt": "Läser vilka fält som finns",
    "lista_kunder": "Tittar på kunderna",
    "las_kundfil": "Läser kundfilen",
    "spara_kundfil": "Fyller i formuläret",
    "andra_falt": "Fyller i formuläret",
    "bygg_forhandsvisning": "Bygger förhandsvisningen",
    "skapa_forslag": "Skapar förslag",
    "hamta_bild": "Hämtar en bild",
    "skapa_kund": "Skapar kunden",
    "WebSearch": "Söker på webben",
    "WebFetch": "Läser en webbsida",
    "Read": "Läser bilagan",
}

pagar: dict[str, subprocess.Popen] = {}
las = threading.Lock()
SAKNAS = object()


def systemtext(kund: str, namn: str) -> str:
    return f"""Du är Claude i HJERDAL Designer och hjälper en säljare på HJERDAL att göra en restaurangsajt.
Kunden är {namn} med id {kund}. Säljaren ser formuläret bredvid chatten, och det uppdateras när du sparar.
Läs kundfilen med las_kundfil innan du ändrar något. Fyll i med andra_falt, som ändrar enskilda fält;
använd spara_kundfil bara när du skriver om stora delar. Läs kundfilens_falt om du är osäker på ett fält.
Hitta aldrig på fakta om restaurangen: öppettider, priser, adress, telefon och rätter kommer från säljaren,
från kunden, från bilagor eller från restaurangens egen webbplats (WebFetch). Saknas något, fråga säljaren.
Texter du skriver själv, som om oss-text och beskrivningen för Google, ska vara korta, sakliga och på svenska.
Bilagor ligger i mappen bilagor/ och läses med Read. Saknas bilder, hämta restaurangens egna foton från
dess webbplats med hamta_bild (de görs lagom stora av sig själva): ett brett foto till bilder.hero och ett till
bilder.om, var och en med en kort alt-text som säger vad bilden visar. Ta aldrig bilder från andra webbplatser.
Bygg förhandsvisningen när kundfilen är ifylld och rätta det bygget säger. Svara säljaren kort på svenska,
utan rubriker, och säg vad du fyllt i och vad som saknas."""


# --- Claude Code på datorn ------------------------------------------------------

def hitta() -> str | None:
    """Kommandot claude. Designer startas från Dock med en kort PATH, så de vanliga platserna prövas också."""
    hem = Path.home()
    vagar = [os.environ.get("PATH", ""), str(hem / ".local/bin"), str(hem / ".claude/local"), "/opt/homebrew/bin",
             "/usr/local/bin", str(hem / ".npm-global/bin"), str(hem / ".bun/bin")]
    hit = shutil.which("claude", path=os.pathsep.join(vagar))
    if hit:
        return hit
    # Installerad med npm under nvm, eller Claude-appens egen Claude Code; den nyaste versionen duger.
    for monster in (".nvm/versions/node/*/bin/claude", ".volta/bin/claude", "Library/Application Support/Claude/claude-code/*/claude"):
        hittade = sorted(glob.glob(str(hem / monster)))
        if hittade:
            return hittade[-1]
    return None


def miljo() -> dict:
    """Säljarens miljö utan API-nycklar, så att Claude Code använder kontot och abonnemanget."""
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDECODE")}
    env["PATH"] = os.pathsep.join([env.get("PATH", ""), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"])
    return env


_status: dict = {"tid": 0.0, "svar": None}


def status(farsk: bool = False) -> dict:
    """Är Claude Code installerad och inloggad med ett Claude-konto? Sparas en minut."""
    if not farsk and _status["svar"] and time.monotonic() - _status["tid"] < 60:
        return _status["svar"]
    claude = hitta()
    svar: dict = {"installerad": bool(claude), "inloggad": False}
    if claude:
        try:
            res = subprocess.run([claude, "auth", "status"], capture_output=True, text=True, timeout=20, env=miljo(),
                                 stdin=subprocess.DEVNULL)
            data = json.loads(res.stdout or "{}")
            svar["inloggad"] = bool(data.get("loggedIn"))
            svar["konto"] = data.get("authMethod")
            if svar["konto"] in ("api_key", "api_key_helper"):
                svar["inloggad"] = False
                svar["fel"] = "Claude Code är inloggad med en API-nyckel. Logga in med ditt Claude-konto i stället."
        except (OSError, subprocess.TimeoutExpired, ValueError):
            # En äldre Claude Code utan "auth status": prova chatten ändå, den säger till om inloggningen saknas.
            svar["inloggad"] = True
            svar["okant"] = True
    _status.update(tid=time.monotonic(), svar=svar)
    return svar


def oppna_terminal(kommando: str) -> None:
    """Öppnar Terminal med ett kommando, för installationen och inloggningen."""
    if sys.platform != "darwin":
        raise fabrik.FabrikFel(f"Kör i en terminal: {kommando}")
    text = kommando.replace("\\", "\\\\").replace('"', '\\"')
    skript = f'tell application "Terminal"\n activate\n do script "{text}"\nend tell'
    subprocess.run(["osascript", "-e", skript], check=False, timeout=20)
    _status["tid"] = 0.0


# --- Konversationen ---------------------------------------------------------------

def kundmapp(kund: str) -> Path:
    mapp = MAPP / kund
    (mapp / "bilagor").mkdir(parents=True, exist_ok=True)
    return mapp


def historik(kund: str) -> dict:
    fil = MAPP / kund / "chatt.json"
    try:
        return json.loads(fil.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"session": None, "meddelanden": []}


def spara_historik(kund: str, data: dict) -> None:
    fil = kundmapp(kund) / "chatt.json"
    tmp = fil.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(fil)


def ny_chatt(kund: str) -> None:
    stoppa(kund)
    j = jobb.pop(kund, None)
    if j:
        # Vänta tills turen har sparat sig, så att den inte skriver tillbaka konversationen efteråt.
        with j.villkor:
            j.villkor.wait_for(lambda: j.klar, timeout=15)
    mapp = MAPP / kund
    if mapp.exists():
        shutil.rmtree(mapp)


def spara_bilaga(kund: str, onskat: str, innehall: bytes) -> str:
    if not innehall or len(innehall) > MAX_BILAGA:
        raise fabrik.FabrikFel(f"Bilagan ska vara mellan 1 byte och {MAX_BILAGA // 1024 // 1024} MB.")
    stam, _, ext = Path(onskat).name.rpartition(".")
    stam = re.sub(r"[^\w-]+", "-", stam.lower()).strip("-") or "bilaga"
    ext = ext.lower()
    if not BILAGENAMN.fullmatch(f"{stam}.{ext}") and ext not in bild.RASTER:
        raise fabrik.FabrikFel("Bifoga en bild (jpg, png, webp, heic), en pdf eller en textfil.")
    # En bild görs lagom stor för Claude, som läser stora bilder dåligt.
    try:
        innehall, ext, _ = bild.komprimera(innehall, ext, bild.BILAGA)
    except bild.BildFel as e:
        raise fabrik.FabrikFel(str(e)) from e
    mapp = kundmapp(kund) / "bilagor"
    fil, nr = mapp / f"{stam}.{ext}", 2
    while fil.exists():
        fil, nr = mapp / f"{stam}-{nr}.{ext}", nr + 1
    fil.write_bytes(innehall)
    return fil.name


def stoppa(kund: str) -> bool:
    with las:
        process = pagar.get(kund)
        if kund in jobb:
            jobb[kund].stoppad = True
    if process and process.poll() is None:
        process.terminate()
        return True
    return False


def chatta(kund: str, namn: str, text: str, bilagor: list[str]) -> Iterator[dict]:
    """Skickar säljarens meddelande till Claude Code och ger händelserna medan Claude arbetar:
    text (bitar av svaret), verktyg (vad Claude gör), andrad (kundfilen är ändrad),
    klar och fel."""
    claude = hitta()
    if not claude:
        yield {"typ": "fel", "text": "Claude Code är inte installerad på den här datorn."}
        return
    mapp = kundmapp(kund)
    data = historik(kund)
    bilagor = [b for b in bilagor if BILAGENAMN.fullmatch(b) and (mapp / "bilagor" / b).is_file()]
    fraga = text + ("\n\nBifogat: " + ", ".join(f"bilagor/{b}" for b in bilagor) if bilagor else "")
    mcp = {"mcpServers": {SERVER: {"command": sys.executable, "args": [str(fabrik.FABRIK / "fabrik.py"), "mcp"]}}}
    cmd = [claude, "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
           "--mcp-config", json.dumps(mcp), "--strict-mcp-config",
           "--tools", "Read,WebSearch,WebFetch",
           "--allowedTools", f"mcp__{SERVER}__*", "WebSearch", "WebFetch",
           "--disallowedTools", *(f"mcp__{SERVER}__{v}" for v in SPARRADE),
           "--append-system-prompt", systemtext(kund, namn)]
    if data.get("session"):
        cmd += ["--resume", data["session"]]
    if os.environ.get("HJERDAL_CLAUDE_MODELL"):
        cmd += ["--model", os.environ["HJERDAL_CLAUDE_MODELL"]]

    with las:
        upptagen = kund in pagar and pagar[kund].poll() is None
        if not upptagen:
            # Frågan går in på stdin, så att den aldrig kan blandas ihop med flaggorna.
            process = subprocess.Popen(cmd, cwd=mapp, env=miljo(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1)
            pagar[kund] = process
    if upptagen:
        yield {"typ": "fel", "text": "Claude arbetar redan med den här kunden. Vänta eller tryck Stoppa."}
        return
    kundjson = fabrik.kundmapp(kund) / "kund.json"
    fore = kundjson.read_text(encoding="utf-8") if kundjson.exists() else ""
    andringar: dict | None = None
    assert process.stdin and process.stdout and process.stderr
    process.stdin.write(fraga)
    process.stdin.close()
    fellogg: list[str] = []
    threading.Thread(target=lambda: fellogg.extend(process.stderr), daemon=True).start()

    svar, verktyg, namn_pa = [], [], {}
    delvis = False
    resultat: dict | None = None
    try:
        for rad in process.stdout:
            try:
                h = json.loads(rad)
            except ValueError:
                continue
            typ = h.get("type")
            if typ == "system" and h.get("subtype") == "init":
                data["session"] = h.get("session_id") or data.get("session")
                trasig = [s.get("name") for s in h.get("mcp_servers", []) if s.get("status") == "failed"]
                if trasig:
                    yield {"typ": "fel", "text": "Designers verktyg startade inte för Claude. Se ut/designer.log."}
            elif typ == "stream_event":
                e = h.get("event", {})
                if h.get("parent_tool_use_id"):
                    continue
                if e.get("type") == "content_block_delta" and e.get("delta", {}).get("type") == "text_delta":
                    delvis = True
                    svar.append(e["delta"]["text"])
                    yield {"typ": "text", "text": e["delta"]["text"]}
                elif e.get("type") == "content_block_start" and e.get("content_block", {}).get("type") == "text" and svar:
                    svar.append("\n\n")
                    yield {"typ": "text", "text": "\n\n"}
            elif typ == "assistant":
                for b in h.get("message", {}).get("content", []):
                    if b.get("type") == "tool_use":
                        kort = b.get("name", "").removeprefix(f"mcp__{SERVER}__")
                        namn_pa[b.get("id")] = kort
                        text_ = VERKTYGSTEXT.get(kort, kort)
                        verktyg.append(text_)
                        yield {"typ": "verktyg", "namn": kort, "text": text_}
                    elif b.get("type") == "text" and not delvis and b.get("text"):
                        # Utan delvisa meddelanden kommer svaret i hela stycken.
                        svar.append(("\n\n" if svar else "") + b["text"])
                        yield {"typ": "text", "text": ("\n\n" if len(svar) > 1 else "") + b["text"]}
            elif typ == "user":
                for b in h.get("message", {}).get("content", []):
                    if b.get("type") != "tool_result":
                        continue
                    kort = namn_pa.get(b.get("tool_use_id"), "")
                    if b.get("is_error"):
                        yield {"typ": "verktyg-fel", "namn": kort}
                    elif kort in ANDRAR:
                        yield {"typ": "andrad"}
                    elif kort == "bygg_forhandsvisning":
                        yield {"typ": "byggd"}
            elif typ == "result":
                resultat = h
                data["session"] = h.get("session_id") or data.get("session")
        process.wait(timeout=30)
    except GeneratorExit:
        # Säljaren tryckte Stoppa eller stängde fönstret.
        process.terminate()
        raise
    finally:
        with las:
            if pagar.get(kund) is process:
                del pagar[kund]
        if process.poll() is None:
            process.terminate()
        meddelanden = data.setdefault("meddelanden", [])
        meddelanden.append({"roll": "saljare", "text": text, "bilagor": bilagor, "tid": time.time()})
        andringar = jamfor(kund, fore)
        if svar or verktyg or andringar:
            meddelanden.append({"roll": "claude", "text": "".join(svar).strip(), "verktyg": verktyg, "tid": time.time(),
                                **(andringar or {})})
        spara_historik(kund, data)

    if andringar:
        yield {"typ": "andringar", **andringar}
    if resultat and not resultat.get("is_error"):
        yield {"typ": "klar"}
        return
    yield {"typ": "fel", "text": felet(resultat, "".join(fellogg))}


# --- Ångra -------------------------------------------------------------------------

def skillnader(a, b, vag: tuple = ()) -> list[str]:
    """Fälten som skiljer, som meny.sektioner.0.namn. En lista som ändrat längd räknas som ett fält."""
    if a == b:
        return []
    if isinstance(a, dict) and isinstance(b, dict):
        return [x for k in dict.fromkeys([*a, *b]) for x in skillnader(a.get(k, SAKNAS), b.get(k, SAKNAS), (*vag, k))]
    if isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        return [x for i, (x1, x2) in enumerate(zip(a, b)) for x in skillnader(x1, x2, (*vag, i))]
    return [".".join(map(str, vag))] if vag else []


def jamfor(kund: str, fore: str) -> dict | None:
    """Sparar kundfilen från före turen om Claude ändrade något, och vilka fält det gällde."""
    kundjson = fabrik.kundmapp(kund) / "kund.json"
    try:
        efter = kundjson.read_text(encoding="utf-8")
        andrat = skillnader(json.loads(fore), json.loads(efter)) if fore and efter != fore else []
    except (OSError, ValueError):
        return None
    if not andrat:
        return None
    id_ = f"{time.time_ns():x}"
    (kundmapp(kund) / "fore").mkdir(exist_ok=True)
    (MAPP / kund / "fore" / f"{id_}.json").write_text(fore, encoding="utf-8")
    return {"id": id_, "andrat": andrat}


def _hamta(obj, delar: list[str]):
    for d in delar:
        if isinstance(obj, list) and d.isdigit() and int(d) < len(obj):
            obj = obj[int(d)]
        elif isinstance(obj, dict) and d in obj:
            obj = obj[d]
        else:
            return SAKNAS
    return obj


def _aterstall(nu: dict, fore: dict, delar: list[str]) -> None:
    """Sätter tillbaka ett fält som det var före Claudes tur, och låter resten av filen vara."""
    varde = _hamta(fore, delar)
    *upp, sista = delar
    forald = nu
    for d in upp:
        nasta = _hamta(forald, [d])
        if not isinstance(nasta, (dict, list)):
            if varde is SAKNAS or not isinstance(forald, dict):
                return
            nasta = forald[d] = {}
        forald = nasta
    if isinstance(forald, dict):
        if varde is SAKNAS:
            forald.pop(sista, None)
        else:
            forald[sista] = varde
    elif isinstance(forald, list) and sista.isdigit() and int(sista) < len(forald) and varde is not SAKNAS:
        forald[int(sista)] = varde


def angra(kund: str, id_: str) -> dict:
    """Kundfilen med fälten från en av Claudes turer tillbakasatta. Ändringar säljaren gjort i andra fält finns kvar."""
    data = historik(kund)
    msg = next((m for m in data.get("meddelanden", []) if m.get("id") == id_ and m.get("roll") == "claude"), None)
    fil = MAPP / kund / "fore" / f"{id_}.json"
    if not msg or not msg.get("andrat") or not re.fullmatch(r"[0-9a-f]+", id_) or not fil.exists():
        raise fabrik.FabrikFel("Det finns inget att ångra för det svaret.")
    if msg.get("angrad"):
        raise fabrik.FabrikFel("Det svaret är redan ångrat.")
    fore = json.loads(fil.read_text(encoding="utf-8"))
    nu = json.loads((fabrik.kundmapp(kund) / "kund.json").read_text(encoding="utf-8"))
    for vag in msg["andrat"]:
        _aterstall(nu, fore, vag.split("."))
    msg["angrad"] = True
    spara_historik(kund, data)
    return nu


# --- Claude i bakgrunden ------------------------------------------------------------

class Jobb:
    """En tur med Claude som pågår eller just är klar, med alla händelser hittills."""

    def __init__(self, text: str, bilagor: list[str]) -> None:
        self.text, self.bilagor, self.start = text, bilagor, time.time()
        self.handelser: list[dict] = []
        self.klar = self.stoppad = False
        self.villkor = threading.Condition()

    def lagg(self, handelse: dict) -> None:
        with self.villkor:
            self.handelser.append(handelse)
            self.villkor.notify_all()

    def avsluta(self) -> None:
        with self.villkor:
            self.klar = True
            self.villkor.notify_all()


jobb: dict[str, Jobb] = {}


def arbetar(kund: str) -> bool:
    j = jobb.get(kund)
    return bool(j and not j.klar)


def nagon_arbetar() -> bool:
    return any(arbetar(k) for k in list(jobb))


def pagaende(kund: str) -> dict | None:
    """Turen som pågår, så att webbläsaren kan visa den efter att ha bytt kund eller laddat om."""
    j = jobb.get(kund)
    if not j or j.klar:
        return None
    with j.villkor:
        return {"text": j.text, "bilagor": j.bilagor, "start": j.start, "handelser": list(j.handelser)}


def lage(kund: str) -> dict:
    """Konversationen som webbläsaren visar: det som är sparat och turen som pågår."""
    data = historik(kund)
    p = pagaende(kund)
    if p:
        # En tur som just blev klar kan redan vara sparad. Då visas den bara som pågående.
        data["meddelanden"] = [m for m in data.get("meddelanden", []) if m.get("tid", 0) < p["start"]]
    return {**data, "arbetar": bool(p), "pagaende": p}


def starta(kund: str, namn: str, text: str, bilagor: list[str]) -> Jobb:
    """Startar en tur i en egen tråd. Den fortsätter tills Claude är klar eller säljaren trycker Stoppa."""
    with las:
        if arbetar(kund):
            raise fabrik.FabrikFel("Claude arbetar redan med den här kunden. Vänta eller tryck Stoppa.")
        j = jobb[kund] = Jobb(text, bilagor)

    def kor() -> None:
        try:
            for handelse in chatta(kund, namn, text, bilagor):
                # Att Claude avslutas för att säljaren tryckte Stoppa är inget fel.
                j.lagg({"typ": "stoppad"} if j.stoppad and handelse["typ"] == "fel" else handelse)
        except Exception as e:  # noqa: BLE001  allt ska nå säljaren, inte försvinna i tråden
            j.lagg({"typ": "fel", "text": f"Chatten stannade: {e}"})
        finally:
            j.avsluta()

    threading.Thread(target=kor, name=f"claude-{kund}", daemon=True).start()
    return j


def folj(kund: str, fran: int = 0) -> Iterator[dict]:
    """Händelserna i kundens tur från och med nummer fran, tills turen är klar. En puls var 15:e sekund
    låter servern märka att webbläsaren har gått; själva turen fortsätter ändå."""
    j = jobb.get(kund)
    if not j:
        yield {"typ": "klar"}
        return
    i = fran
    while True:
        with j.villkor:
            if i >= len(j.handelser) and not j.klar:
                j.villkor.wait(timeout=15)
            nya, klar = j.handelser[i:], j.klar
        if not nya and not klar:
            yield {"typ": "puls"}
        yield from nya
        i += len(nya)
        if klar and i >= len(j.handelser):
            return


def felet(resultat: dict | None, stderr: str) -> str:
    text = " ".join(filter(None, [(resultat or {}).get("result"), *(resultat or {}).get("errors", []), stderr.strip()]))
    if re.search(r"log ?in|logged|authenticat|OAuth|401", text, re.I):
        _status["tid"] = 0.0
        return "Claude Code är inte inloggad. Logga in med ditt Claude-konto och försök igen."
    if re.search(r"usage limit|rate limit|429", text, re.I):
        return "Gränsen för ditt Claude-abonnemang är nådd för stunden. Försök igen senare."
    if re.search(r"unknown option|unrecognized|error: option", text, re.I):
        return "Claude Code är för gammal för chatten. Uppdatera med: claude update"
    return text[:600] or "Claude svarade inte. Försök igen."
