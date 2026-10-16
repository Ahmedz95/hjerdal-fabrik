"""HJERDAL Designer för Claude: en MCP-server som låter Claude-appen på datorn
arbeta i Designer, på det Claude-abonnemang säljaren redan har och utan API-nyckel.

    python3 fabrik.py mcp

Claude-appen startar den själv; designer/installera.command lägger in den i
Claude-appens inställningar. Säljaren kan då skriva till exempel "gör en sajt
till Café Solros från den här menyn" i Claude, och Claude fyller i kundfilen,
bygger en förhandsvisning och rättar det bygget hittar.

Servern är en tunn klient till Designer (designer/server.py) och använder samma
API som formuläret, så Claude och formuläret ser alltid samma kundfil och ett
bygge i taget. Kör inte Designer startas den i bakgrunden. Bara Pythons
standardbibliotek. Protokollet är JSON-RPC 2.0, ett meddelande per rad.
"""
from __future__ import annotations

import io
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

FABRIK = Path(__file__).resolve().parent.parent
STATUSFIL = FABRIK / "ut" / ".designer.json"
PROTOKOLL = ("2025-06-18", "2025-03-26", "2024-11-05")

INSTRUKTIONER = """HJERDAL Designer bygger restaurangsajter från en kundfil (kund.json) med HJERDAL:s sajtfabrik.
Arbetsgång: läs kundfilens_falt en gång, skapa_kund eller las_kundfil, fyll i med andra_falt (eller
spara_kundfil med hela kundfilen), bygg_forhandsvisning och rätta det bygget säger, skapa_forslag för att visa kunden flera stilar,
och spara_till_github först när säljaren säger att kunden är klar.
Skriv på svenska och följ fältens hjälptexter (beskrivningen för Google är 50–160 tecken, tider skrivs 11:00).
Hitta aldrig på fakta om restaurangen: öppettider, priser, adress, telefon och rätter kommer från säljaren,
kunden eller material de ger dig. Saknas något, fråga eller lämna det tomt så att bygget visar vad som fattas.
Bilder hämtas med hamta_bild från en https-länk, eller laddas upp av säljaren i Designer."""

VERKTYG = [
    {
        "name": "kundfilens_falt",
        "description": "Alla fält i kundfilen med svenska etiketter, hjälptexter och regler (JSON Schema), "
                       "plus stilarna, färgtemana och layouterna att välja bland. Läs den innan du skriver en kundfil.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "lista_kunder",
        "description": "Kunderna i fabriken med namn, stil och färgtema. Arkiverade kunder är inte med.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "las_kundfil",
        "description": "En kunds kundfil (kund.json) och vilka bilder som finns i kundens mapp.",
        "inputSchema": {"type": "object", "properties": {"kund": {"type": "string", "description": "Kundens id, till exempel cafe-solros"}},
                        "required": ["kund"]},
    },
    {
        "name": "skapa_kund",
        "description": "Skapar en ny kund från mallen. Id:t blir namnet med små bokstäver och bindestreck.",
        "inputSchema": {"type": "object", "properties": {"namn": {"type": "string", "description": "Restaurangens namn, till exempel Café Solros"}},
                        "required": ["namn"]},
    },
    {
        "name": "spara_kundfil",
        "description": "Sparar hela kundfilen och ersätter den som finns. Läs den först med las_kundfil och skicka "
                       "tillbaka allt, även det du inte ändrar. Svarar med det som syns direkt; bygg_forhandsvisning kontrollerar resten.",
        "inputSchema": {"type": "object", "properties": {
            "kund": {"type": "string"},
            "kundfil": {"type": "object", "description": "Hela kund.json enligt kundfilens_falt"},
        }, "required": ["kund", "kundfil"]},
    },
    {
        "name": "andra_falt",
        "description": "Ändrar enskilda fält i kundfilen och låter resten vara, så att säljarens egna ändringar i "
                       "formuläret finns kvar. Fälten anges som sökvägar med punkt och siffror för listor, till exempel "
                       "{\"kontakt.telefon\": \"+46 40 12 34 56\", \"oppettider\": [...], \"meny.sektioner.0.ratter.2.pris\": 145}. "
                       "Ett index lika med listans längd lägger till sist, null tar bort fältet eller raden. "
                       "Svarar med det som behöver fyllas i eller rättas.",
        "inputSchema": {"type": "object", "properties": {
            "kund": {"type": "string"},
            "falt": {"type": "object", "description": "Sökväg till fältet och dess nya värde"},
        }, "required": ["kund", "falt"]},
    },
    {
        "name": "bygg_forhandsvisning",
        "description": "Bygger kundens sajt och kontrollerar den, ungefär 15 sekunder. Svarar med en länk till "
                       "förhandsvisningen, eller med felen per fält om kundfilen behöver rättas.",
        "inputSchema": {"type": "object", "properties": {"kund": {"type": "string"}}, "required": ["kund"]},
    },
    {
        "name": "skapa_forslag",
        "description": "Bygger kunden i flera stilar att visa kunden, ungefär 15 sekunder per förslag. Utan varianter "
                       "blir det fyra olika stilar som passar stället och inte liknar någon annan kund. En variant skrivs "
                       "stil:tema:hero:meny i valfri ordning, till exempel mjuk:salvia:delad, och kan också byta typsnitt, "
                       "former, etiketter eller foton, till exempel afton:kol:garamond:tejp.",
        "inputSchema": {"type": "object", "properties": {
            "kund": {"type": "string"},
            "varianter": {"type": "array", "items": {"type": "string"}},
        }, "required": ["kund"]},
    },
    {
        "name": "hamta_bild",
        "description": "Hämtar en jpg, png, webp eller svg från en https-länk till kundens bilder, till exempel från "
                       "restaurangens nuvarande sajt. Bilden görs lagom stor och sparas utan metadata. Ange sedan filnamnet i "
                       "kundfilen under bilder. Använd bara bilder kunden äger.",
        "inputSchema": {"type": "object", "properties": {
            "kund": {"type": "string"},
            "url": {"type": "string", "description": "https-länk till bilden"},
            "namn": {"type": "string", "description": "Önskat filnamn utan ändelse, till exempel hero. Ett namn med logo blir PNG, inte JPEG."},
        }, "required": ["kund", "url"]},
    },
    {
        "name": "oppna_designer",
        "description": "Öppnar Designer-fönstret på datorn, på kunden om en kund anges, så att säljaren kan se och ändra själv.",
        "inputSchema": {"type": "object", "properties": {"kund": {"type": "string"}}},
    },
    {
        "name": "spara_till_github",
        "description": "Checkar in kundens mapp och skickar den till GitHub (hjerdal-fabrik). Gör det bara när säljaren ber om det.",
        "inputSchema": {"type": "object", "properties": {"kund": {"type": "string"}}, "required": ["kund"]},
    },
]


class Fel(Exception):
    def __init__(self, text: str, status: int = 0) -> None:
        super().__init__(text)
        self.status = status


# --- Designer -----------------------------------------------------------------------

def adress() -> str:
    """Adressen till Designer. Startar den i bakgrunden om den inte kör."""
    startad = False
    for _ in range(60):
        try:
            port = json.loads(STATUSFIL.read_text(encoding="utf-8"))["port"]
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/info", timeout=2) as svar:
                if json.loads(svar.read()).get("fabrik") == str(FABRIK):
                    return f"http://127.0.0.1:{port}"
        except (OSError, ValueError, KeyError):
            pass
        if not startad:
            STATUSFIL.parent.mkdir(exist_ok=True)
            logg = open(STATUSFIL.parent / "designer.log", "a", encoding="utf-8")  # noqa: SIM115  lever med processen
            subprocess.Popen([sys.executable, str(FABRIK / "fabrik.py"), "designer", "--ingen-webblasare"], cwd=FABRIK,
                             stdin=subprocess.DEVNULL, stdout=logg, stderr=subprocess.STDOUT, start_new_session=True)
            startad = True
        time.sleep(0.25)
    raise Fel("HJERDAL Designer startar inte. Se ut/designer.log i fabriken.")


def api(metod: str, vag: str, data: dict | None = None):
    bas = adress()
    kropp = json.dumps(data).encode("utf-8") if data is not None else None
    fraga = urllib.request.Request(f"{bas}/api/{vag}", data=kropp, method=metod,
                                   headers={"X-Hjerdal": "1", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(fraga, timeout=900) as svar:
            return json.loads(svar.read())
    except urllib.error.HTTPError as e:
        try:
            fel = json.loads(e.read())
        except ValueError:
            raise Fel(f"Designer svarade {e.code}.", e.code) from e
        text = fel.get("fel", f"Designer svarade {e.code}.")
        if fel.get("falt"):
            text = text.splitlines()[0].rstrip(":") + ". Fält att rätta:\n" + "\n".join(f"- {f}: {m}" for f, m in fel["falt"])
        raise Fel(text, e.code) from e


def satt(data: dict, vag: str, varde) -> None:
    """Sätter ett fält som "meny.sektioner.0.ratter.2.pris". Saknade grupper och listor skapas."""
    delar = [int(d) if d.isdigit() else d for d in vag.split(".") if d != ""]
    if not delar:
        raise Fel("Ett fält saknar sökväg.")
    o = data
    for i, d in enumerate(delar[:-1]):
        nasta = [] if isinstance(delar[i + 1], int) else {}
        if isinstance(o, list) and isinstance(d, int) and d <= len(o):
            if d == len(o):
                o.append(nasta)
            elif not isinstance(o[d], (dict, list)):
                o[d] = nasta
        elif isinstance(o, dict) and isinstance(d, str):
            if not isinstance(o.get(d), (dict, list)):
                o[d] = nasta
        else:
            raise Fel(f"{vag}: {'.'.join(map(str, delar[:i + 1]))} finns inte.")
        o = o[d]
    sista = delar[-1]
    if isinstance(o, list) and isinstance(sista, int) and sista <= len(o):
        if varde is None:
            if sista < len(o):
                o.pop(sista)
        elif sista == len(o):
            o.append(varde)
        else:
            o[sista] = varde
    elif isinstance(o, dict) and isinstance(sista, str):
        if varde is None:
            o.pop(sista, None)
        else:
            o[sista] = varde
    else:
        raise Fel(f"{vag}: {'.'.join(map(str, delar))} finns inte.")


def problemtext(svar: dict) -> str:
    problem = svar.get("problem") or []
    if problem:
        text = "Sparad, men det här behöver fyllas i eller rättas:\n" + "\n".join(f"- {f}: {m}" for f, m in problem)
    else:
        text = "Sparad. Bygg förhandsvisningen för att kontrollera resten."
    for x in svar.get("likhet") or []:
        text += (f"\nDesignen ligger för nära {x['namn']} (samma {', '.join(x['lika'])}). {x['rad']} "
                 "Eller använd skapa_forslag, som bara föreslår designer ingen annan kund har. Fabriken publicerar inte en för lik sajt.")
    return text


def kor(namn: str, arg: dict) -> str:
    kund = arg.get("kund", "")
    if namn == "kundfilens_falt":
        s = api("GET", "schema")
        ut = {"stilar": s["stilar"], "teman": [{k: t[k] for k in ("id", "namn", "mork")} for t in s["teman"]],
              "heros": s["heros"], "menyer": s["menyer"], "namn_pa_val": s["namn"], "schema": s["schema"]}
        return json.dumps(ut, ensure_ascii=False)
    if namn == "lista_kunder":
        return json.dumps([{k: x.get(k) for k in ("kund", "namn", "design", "fel") if x.get(k)} for x in api("GET", "kunder") if not x.get("arkiv")],
                          ensure_ascii=False)
    if namn == "las_kundfil":
        svar = api("GET", f"kunder/{kund}")
        bilder = [b["fil"] for b in api("GET", f"kunder/{kund}/bilder")]
        return json.dumps({"kund": kund, "kundfil": svar["data"], "bilder": bilder}, ensure_ascii=False)
    if namn == "skapa_kund":
        svar = api("POST", "kunder", {"namn": arg.get("namn", "")})
        return json.dumps({"kund": svar["kund"], "kundfil": svar["data"],
                           "nasta": "Fyll i kundfilen och spara den med spara_kundfil."}, ensure_ascii=False)
    if namn == "spara_kundfil":
        return problemtext(api("PUT", f"kunder/{kund}", {"data": arg.get("kundfil")}))
    if namn == "andra_falt":
        falt = arg.get("falt")
        if not isinstance(falt, dict) or not falt:
            raise Fel("Ange minst ett fält att ändra.")
        for forsok in range(3):
            nu = api("GET", f"kunder/{kund}")
            data = nu["data"]
            for vag, varde in falt.items():
                satt(data, vag, varde)
            try:
                # Med andrad stoppar Designer sparningen om säljaren hann ändra i formuläret; då läses filen om.
                return problemtext(api("PUT", f"kunder/{kund}", {"data": data, "andrad": nu["andrad"]}))
            except Fel as e:
                if e.status != 409 or forsok == 2:
                    raise
    if namn == "bygg_forhandsvisning":
        svar = api("POST", f"kunder/{kund}/bygg")
        rader = [f"Byggd och kontrollerad: {svar['sidor']} sidor. Förhandsvisning: {adress()}{svar['url']}"]
        rader += [f"Fel från kontrollen: {f}" for f in svar["fel"]]
        rader += [f"Varning: {v}" for v in svar["varn"]]
        return "\n".join(rader)
    if namn == "skapa_forslag":
        svar = api("POST", f"kunder/{kund}/forslag", {"varianter": arg.get("varianter") or []})
        rader = [f"Förslagen: {adress()}{svar['url']}"]
        rader += [f"- {v.get('variant') or v['mapp']} {adress()}{svar['url']}{v['mapp']}/" for v in svar["varianter"]]
        return "\n".join(rader)
    if namn == "hamta_bild":
        svar = api("POST", f"kunder/{kund}/hamta-bild", {"url": arg.get("url", ""), "namn": arg.get("namn")})
        matt = f"{svar['bredd']}×{svar['hojd']} pixlar, " if svar.get("bredd") else ""
        return f"Sparad som {svar['fil']} ({matt}{svar['storlek'] // 1024} kB). Ange filnamnet i kundfilen under bilder."
    if namn == "oppna_designer":
        api("POST", "oppna", {"kund": kund or None})
        return "Designer är öppnad."
    if namn == "spara_till_github":
        return api("POST", f"kunder/{kund}/spara")["meddelande"]
    raise Fel(f"Verktyget {namn} finns inte.")


# --- Protokollet ----------------------------------------------------------------------

def skicka(meddelande: dict) -> None:
    sys.stdout.buffer.write(json.dumps(meddelande, ensure_ascii=False).encode("utf-8") + b"\n")
    sys.stdout.buffer.flush()


def hantera(m: dict) -> dict | None:
    metod, id_ = m.get("method"), m.get("id")
    if id_ is None:
        return None  # notifieringar, till exempel notifications/initialized, får inget svar
    if metod == "initialize":
        onskat = (m.get("params") or {}).get("protocolVersion")
        resultat = {
            "protocolVersion": onskat if onskat in PROTOKOLL else PROTOKOLL[0],
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "hjerdal-designer", "title": "HJERDAL Designer", "version": "0.1.0"},
            "instructions": INSTRUKTIONER,
        }
    elif metod == "ping":
        resultat = {}
    elif metod == "tools/list":
        resultat = {"tools": VERKTYG}
    elif metod == "tools/call":
        p = m.get("params") or {}
        try:
            text, fel = kor(p.get("name", ""), p.get("arguments") or {}), False
        except Fel as e:
            text, fel = str(e), True
        except Exception as e:  # noqa: BLE001  ett fel i ett verktyg ska inte stänga servern
            text, fel = f"Något gick fel: {e.__class__.__name__}: {e}", True
        resultat = {"content": [{"type": "text", "text": text}], "isError": fel}
    else:
        return {"jsonrpc": "2.0", "id": id_, "error": {"code": -32601, "message": f"Okänd metod: {metod}"}}
    return {"jsonrpc": "2.0", "id": id_, "result": resultat}


def main() -> None:
    for rad in io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8"):
        if not rad.strip():
            continue
        try:
            m = json.loads(rad)
        except json.JSONDecodeError:
            skicka({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Inte giltig JSON"}})
            continue
        for del_ in m if isinstance(m, list) else [m]:
            svar = hantera(del_) if isinstance(del_, dict) else None
            if svar:
                skicka(svar)
