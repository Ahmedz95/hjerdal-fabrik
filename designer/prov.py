"""Provkör HJERDAL Designer och MCP-servern från början till slut. Körs i CI.

    python3 designer/prov.py

Startar Designer på en ledig port, går igenom API:t som formuläret och Claude
använder, bygger exempelkunden och kontrollerar att servern bara svarar den här
datorn. Skapar en tillfällig kund och tar bort den efteråt. Claude Code behövs
inte: chatten provas utan att Claude svarar, och ångra med en sparad tur. Den
tillfälliga kunden finns aldrig i GitHub, så arkivet provas utan git.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

FABRIK = Path(__file__).resolve().parent.parent
PROVKUND = "prov-designer"
TOMMA_DAGAR = "prov-tomma-dagar"
fel: list[str] = []


def kolla(villkor: bool, text: str) -> None:
    print(f"  {'ok ' if villkor else 'FEL'} {text}")
    if not villkor:
        fel.append(text)


def fraga(bas: str, metod: str, vag: str, data=None, rubriker: dict | None = None) -> tuple[int, bytes]:
    kropp = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(f"{bas}{vag}", data=kropp, method=metod,
                               headers={"Content-Type": "application/json", **(rubriker if rubriker is not None else {"X-Hjerdal": "1"})})
    try:
        with urllib.request.urlopen(r, timeout=600) as svar:
            return svar.status, svar.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main() -> int:
    sys.path.insert(0, str(FABRIK))
    from designer.server import kor_redan  # noqa: PLC0415

    if kor_redan():
        print("Designer kör redan på den här datorn. Avsluta den först, så att provet får en egen.")
        return 1
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    bas = f"http://127.0.0.1:{port}"
    server = subprocess.Popen([sys.executable, "fabrik.py", "designer", "--port", str(port), "--ingen-webblasare"], cwd=FABRIK)
    try:
        for _ in range(40):
            try:
                if fraga(bas, "GET", "/api/info")[0] == 200:
                    break
            except OSError:
                time.sleep(0.25)
        print("\n▸ API")
        status, svar = fraga(bas, "GET", "/api/info")
        kolla(status == 200 and json.loads(svar)["app"] == "HJERDAL Designer" and json.loads(svar)["kod"] and json.loads(svar)["starter"], "info svarar med kodens och starterns version")
        schema = json.loads(fraga(bas, "GET", "/api/schema")[1])
        kolla({"stilar", "teman", "heros", "menyer", "namn", "schema"} <= schema.keys(), "schemat har stilar, teman och fält")
        kunder = json.loads(fraga(bas, "GET", "/api/kunder")[1])
        kolla(any(k["kund"] == "bistro-nordvik" for k in kunder), "kundlistan har exempelkunden")
        status, svar = fraga(bas, "GET", "/")
        kolla(status == 200 and b"HJERDAL Designer" in svar, "formuläret laddas")

        print("\n▸ Bara den här datorn")
        kolla(fraga(bas, "POST", "/api/kunder", {"namn": "X"}, rubriker={})[0] == 403, "ändringar utan X-Hjerdal nekas")
        kolla(fraga(bas, "GET", "/api/info", rubriker={"Host": "evil.example"})[0] == 403, "fel värd nekas")
        kolla(fraga(bas, "GET", "/api/kunder/..%2F..%2Ffabrik.py")[0] in (400, 404), "sökvägar utanför fabriken nekas")
        kolla(fraga(bas, "GET", "/api/kunder/bistro-nordvik/bilder/..%2Fkund.json")[0] == 404, "bilder utanför bildmappen nekas")

        print("\n▸ Ny kund")
        shutil.rmtree(FABRIK / "kunder" / PROVKUND, ignore_errors=True)
        status, svar = fraga(bas, "POST", "/api/kunder", {"namn": "Prov Designer"})
        ny = json.loads(svar)
        kolla(status == 201 and ny["kund"] == PROVKUND, "kunden skapas med id från namnet")
        kolla("FYLL I" not in json.dumps(ny["data"]), "mallens FYLL I-texter är borttagna")
        status, svar = fraga(bas, "PUT", f"/api/kunder/{PROVKUND}", {"data": {**ny["data"], "design": {"stil": "finns-inte"}}, "andrad": ny["andrad"]})
        problem = json.loads(svar).get("problem", [])
        kolla(status == 200 and any(f == "design.stil" for f, _ in problem), "en stil som inte finns syns direkt")
        kolla(any(f == "doman" for f, _ in problem), "ett tomt fält som krävs syns direkt")
        status, svar = fraga(bas, "GET", f"/api/kunder/{PROVKUND}")
        nu = json.loads(svar)
        status, svar = fraga(bas, "PUT", f"/api/kunder/{PROVKUND}", {"data": {**nu["data"], "kontakt": {"telefon": "040-12"}}, "andrad": nu["andrad"]})
        kolla(any(f == "kontakt.telefon" for f, _ in json.loads(svar).get("problem", [])), "ett fält i fel format syns direkt")
        kolla(fraga(bas, "PUT", f"/api/kunder/{PROVKUND}", {"data": ny["data"], "andrad": 1.0})[0] == 409,
              "en ändring utanför formuläret upptäcks")
        status, svar = fraga(bas, "POST", f"/api/kunder/{PROVKUND}/bygg")
        kolla(status == 400 and any(f == "doman" for f, _ in json.loads(svar)["falt"]), "bygget ger felen per fält")
        png = (FABRIK / "designer" / "ikon.png").read_bytes()
        r = urllib.request.Request(f"{bas}/api/kunder/{PROVKUND}/bilder?namn=Min%20Bild.PNG", data=png, method="POST", headers={"X-Hjerdal": "1"})
        with urllib.request.urlopen(r) as svar:
            kolla(json.loads(svar.read())["fil"] == "min-bild.png", "en bild laddas upp med säkert namn")

        print("\n▸ Claude-chatten")
        status, svar = fraga(bas, "GET", "/api/claude")
        kolla(status == 200 and "installerad" in json.loads(svar), "läget för Claude Code svarar, även utan Claude Code")
        status, svar = fraga(bas, "GET", f"/api/kunder/{PROVKUND}/claude")
        lage = json.loads(svar)
        kolla(status == 200 and lage["meddelanden"] == [] and lage["arbetar"] is False and lage["pagaende"] is None,
              "en ny kund har ingen konversation och Claude arbetar inte")
        status, svar = fraga(bas, "GET", f"/api/kunder/{PROVKUND}/claude/strom?fran=0")
        kolla(status == 200 and json.loads(svar.splitlines()[0])["typ"] == "klar", "att följa en kund utan tur slutar direkt")
        kolla(fraga(bas, "POST", f"/api/kunder/{PROVKUND}/claude/angra", {"id": "../kund"})[0] == 400, "ångra med ett id som inte finns nekas")
        kolla(fraga(bas, "POST", f"/api/kunder/{PROVKUND}/claude", {"text": "hej"}, rubriker={})[0] == 403, "chatten kräver X-Hjerdal")
        kolla(fraga(bas, "DELETE", f"/api/kunder/{PROVKUND}/claude")[0] == 200, "en ny konversation kan börjas")

        print("\n▸ Förhandsvisning av exempelkunden")
        status, svar = fraga(bas, "POST", "/api/kunder/bistro-nordvik/bygg")
        bygge = json.loads(svar)
        kolla(status == 200 and not bygge["fel"], f"bygget är utan fel ({bygge.get('sidor')} sidor)")
        status, svar = fraga(bas, "GET", "/visa/bistro-nordvik/meny/")
        kolla(status == 200 and b'href="/visa/bistro-nordvik/' in svar, "förhandsvisningen har rätt sökvägar")

        status, svar = fraga(bas, "GET", "/api/kunder")
        nordvik = next(k for k in json.loads(svar) if k["kund"] == "bistro-nordvik")
        kolla(nordvik.get("forhandsvisning") == "/visa/bistro-nordvik/" and nordvik.get("status") in ("klar", "sparad", "publicerad"),
              f"startsidan visar miniatyren och läget ({nordvik.get('status')})")
        # Klickar säljaren bort alla dagar på en menysektion blir det en tom lista, som betyder alla dagar.
        kopia = json.loads((FABRIK / "kunder" / "bistro-nordvik" / "kund.json").read_text(encoding="utf-8"))
        kopia["meny"]["sektioner"][0]["dagar"] = []
        (FABRIK / "kunder" / TOMMA_DAGAR).mkdir(exist_ok=True)
        (FABRIK / "kunder" / TOMMA_DAGAR / "kund.json").write_text(json.dumps(kopia, ensure_ascii=False), encoding="utf-8")
        status, svar = fraga(bas, "POST", f"/api/kunder/{TOMMA_DAGAR}/bygg")
        kolla(status == 200 and not json.loads(svar).get("fel"), "en menysektion utan valda dagar går att bygga")
        # Kopian har samma design som Bistro Nordvik, så formuläret ska säga till.
        kopian = json.loads(fraga(bas, "GET", f"/api/kunder/{TOMMA_DAGAR}")[1])
        lik = [x for x in kopian.get("likhet", []) if x["namn"] == "Bistro Nordvik"]
        kolla(bool(lik) and "typsnitt" in lik[0]["lika"] and lik[0]["rad"].startswith("Byt"), "en design som en annan kunds syns direkt")
        annan = {**kopian["data"], "design": {**kopian["data"]["design"], "stil": "stampel"}}
        status, svar = fraga(bas, "PUT", f"/api/kunder/{TOMMA_DAGAR}", {"data": annan, "andrad": kopian["andrad"]})
        kolla(status == 200 and json.loads(svar).get("likhet") == [], "en annan stil räcker för att inte vara för lik")

        print("\n▸ Bilder görs lagom stora")
        provbilder(bas)

        print("\n▸ MCP")
        mcp = subprocess.Popen([sys.executable, "fabrik.py", "mcp"], cwd=FABRIK, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8")
        assert mcp.stdin and mcp.stdout

        def rpc(i: int, metod: str, params: dict) -> dict:
            mcp.stdin.write(json.dumps({"jsonrpc": "2.0", "id": i, "method": metod, "params": params}) + "\n")
            mcp.stdin.flush()
            return json.loads(mcp.stdout.readline())

        # MCP-servern hittar Designer via ut/.designer.json, som pekar på den här servern.
        init = rpc(1, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "prov", "version": "1"}})
        kolla(init["result"]["serverInfo"]["name"] == "hjerdal-designer", "MCP svarar på initialize")
        verktyg = [t["name"] for t in rpc(2, "tools/list", {})["result"]["tools"]]
        kolla({"spara_kundfil", "bygg_forhandsvisning", "skapa_forslag"} <= set(verktyg), "MCP har verktygen för att bygga")
        svar = rpc(3, "tools/call", {"name": "las_kundfil", "arguments": {"kund": "bistro-nordvik"}})["result"]
        kolla(not svar["isError"] and json.loads(svar["content"][0]["text"])["kundfil"]["namn"] == "Bistro Nordvik", "MCP läser en kundfil")
        svar = rpc(4, "tools/call", {"name": "andra_falt", "arguments": {"kund": PROVKUND, "falt": {"kontakt.telefon": "+46 40 12 34 56", "kok.0": "Pizza"}}})["result"]
        kolla(not svar["isError"] and "kontakt.telefon" not in svar["content"][0]["text"], "MCP ändrar enstaka fält")
        data = json.loads(fraga(bas, "GET", f"/api/kunder/{PROVKUND}")[1])["data"]
        kolla(data["kontakt"]["telefon"] == "+46 40 12 34 56" and data["kok"] == ["Pizza"], "ändringen finns i kundfilen")
        svar = rpc(5, "tools/call", {"name": "andra_falt", "arguments": {"kund": PROVKUND, "falt": {"kontakt.telefon": "040-12"}}})["result"]
        kolla("kontakt.telefon" in svar["content"][0]["text"], "MCP säger till när ett fält har fel format")
        svar = rpc(6, "tools/call", {"name": "andra_falt", "arguments": {"kund": TOMMA_DAGAR, "falt": {"design.stil": "hjerdal"}}})["result"]
        kolla("för nära Bistro Nordvik" in svar["content"][0]["text"], "MCP säger till när designen ligger för nära en annan kund")
        mcp.stdin.close()
        mcp.wait(timeout=10)

        print("\n▸ Ångra Claudes ändringar")
        provangra(bas)

        print("\n▸ Exportera och arkivera")
        provarkiv(bas)

        print("\n▸ Programmets eget fönster")
        provfonster()
    finally:
        for kund in (PROVKUND, TOMMA_DAGAR):
            shutil.rmtree(FABRIK / "kunder" / kund, ignore_errors=True)
            shutil.rmtree(FABRIK / "ut" / "designer" / kund, ignore_errors=True)
        shutil.rmtree(FABRIK / "ut" / "claude" / PROVKUND, ignore_errors=True)
        shutil.rmtree(FABRIK / "ut" / "prov-bilder", ignore_errors=True)
        for kopia in (FABRIK / "ut" / "arkiv").glob(f"{PROVKUND}-*.html"):
            kopia.unlink()
        server.terminate()
        server.wait(timeout=10)
    print(f"\n{'✗ ' + str(len(fel)) + ' fel' if fel else '✓ Designer och MCP fungerar'}")
    return 1 if fel else 0


def provbilder(bas: str) -> None:
    """Ett stort foto med plats och vriden kamera, och en logga, laddas upp och görs om med sharp."""
    from designer import bild  # noqa: PLC0415

    nm = bild.moduler()
    if not nm:
        kolla(False, "sharp finns bland fabrikens beroenden efter bygget")
        return
    skript = """
const sharp = require('sharp');
const [ut] = process.argv.slice(1);
const w = 3000, hg = 2000, buf = Buffer.alloc(w * hg * 3);
for (let i = 0; i < buf.length; i++) buf[i] = (i * 7 + ((i * 2654435761) >>> 27)) & 255;
(async () => {
  await sharp(buf, { raw: { width: w, height: hg, channels: 3 } }).withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Make: 'Apple' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 36/1 0/1' } })
    .jpeg({ quality: 95 }).toFile(ut + '/foto.jpg');
  await sharp({ create: { width: 900, height: 300, channels: 3, background: '#1e1b16' } }).png().toFile(ut + '/logga.png');
})();
"""
    tmp = FABRIK / "ut" / "prov-bilder"
    tmp.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(["node", "-e", skript, str(tmp)], check=True, env={**os.environ, "NODE_PATH": str(nm)}, timeout=120)
        foto = (tmp / "foto.jpg").read_bytes()
        kolla(b"Exif" in foto, "provfotot har EXIF med plats")

        def ladda(namn: str, data: bytes, typer: str = "") -> dict:
            r = urllib.request.Request(f"{bas}/api/kunder/{PROVKUND}/bilder?namn={namn}{'&typer=' + typer if typer else ''}",
                                       data=data, method="POST", headers={"X-Hjerdal": "1"})
            with urllib.request.urlopen(r, timeout=120) as svar:
                return json.loads(svar.read())

        svar = ladda("IMG_0001.jpg", foto)
        kolla(svar["storlek"] < svar["fore"] / 2, f"fotot blir mindre ({svar['fore'] // 1024} kB blev {svar['storlek'] // 1024} kB)")
        kolla((svar["bredd"], svar["hojd"]) == (1707, 2560), f"fotot vänds rätt och blir högst 2560 pixlar ({svar['bredd']}×{svar['hojd']})")
        sparad = fraga(bas, "GET", f"/api/kunder/{PROVKUND}/bilder/{svar['fil']}")[1]
        kolla(b"Exif" not in sparad and sparad[:2] == b"\xff\xd8", "fotot sparas som JPEG utan EXIF och plats")
        svar = ladda("logga.png", (tmp / "logga.png").read_bytes(), "png,webp")
        kolla(svar["fil"] == "logga.png", "en logga blir aldrig JPEG när fältet inte tar emot det")
        svar = ladda("skarm.png", (tmp / "logga.png").read_bytes())
        kolla(svar["fil"] == "skarm.jpg", "en ogenomskinlig PNG blir JPEG där JPEG går bra")
        status, svar = fraga(bas, "POST", f"/api/kunder/{PROVKUND}/bilder?namn=trasig.jpg", rubriker={"X-Hjerdal": "1", "Content-Type": "image/jpeg"})
        kolla(status == 400, "en tom bild nekas")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def provangra(bas: str) -> None:
    """En tur där Claude ändrade telefonnumret ångras, och säljarens ändring efteråt i ett annat fält finns kvar."""
    from designer.claude import skillnader  # noqa: PLC0415

    kolla(skillnader({"a": 1, "b": [1, 2], "d": {"e": 1}}, {"a": 2, "b": [1, 3], "c": 1, "d": {"e": 1}}) == ["a", "b.1", "c"],
          "ändrade fält räknas ut per fält")
    nu = json.loads(fraga(bas, "GET", f"/api/kunder/{PROVKUND}")[1])
    fore = json.loads(json.dumps(nu["data"]))
    fore.setdefault("kontakt", {})["telefon"] = "+46 40 11 11 11"
    mapp = FABRIK / "ut" / "claude" / PROVKUND
    (mapp / "fore").mkdir(parents=True, exist_ok=True)
    (mapp / "fore" / "abc123.json").write_text(json.dumps(fore), encoding="utf-8")
    (mapp / "chatt.json").write_text(json.dumps({"session": None, "meddelanden": [
        {"roll": "saljare", "text": "Fyll i telefonnumret", "tid": 1},
        {"roll": "claude", "text": "Klart.", "tid": 2, "id": "abc123", "andrat": ["kontakt.telefon"]}]}), encoding="utf-8")
    data = {**nu["data"], "namn": "Prov Designer Ändrad"}
    fraga(bas, "PUT", f"/api/kunder/{PROVKUND}", {"data": data, "andrad": nu["andrad"]})
    status, svar = fraga(bas, "POST", f"/api/kunder/{PROVKUND}/claude/angra", {"id": "abc123"})
    efter = json.loads(fraga(bas, "GET", f"/api/kunder/{PROVKUND}")[1])["data"]
    kolla(status == 200 and efter["kontakt"]["telefon"] == "+46 40 11 11 11", "ångra sätter tillbaka fältet Claude ändrade")
    kolla(efter["namn"] == "Prov Designer Ändrad", "säljarens ändring i ett annat fält finns kvar")
    lage = json.loads(fraga(bas, "GET", f"/api/kunder/{PROVKUND}/claude")[1])
    kolla(lage["meddelanden"][-1].get("angrad") is True, "svaret visas som ångrat")
    kolla(fraga(bas, "POST", f"/api/kunder/{PROVKUND}/claude/angra", {"id": "abc123"})[0] == 400, "ett svar kan bara ångras en gång")


def provarkiv(bas: str) -> None:
    """Underlaget till kunden, arkivet och att en kund tas bort efter 30 dagar."""
    status, svar = fraga(bas, "GET", "/api/kunder/bistro-nordvik/export")
    text = svar.decode()
    kolla(status == 200 and "Stekt torsk med brynt smör" in text and "Mån–Fre" in text and "Det här behöver vi" not in text,
          "underlaget har menyn och öppettiderna")
    nu = json.loads(fraga(bas, "GET", f"/api/kunder/{PROVKUND}")[1])
    fraga(bas, "PUT", f"/api/kunder/{PROVKUND}", {"data": {**nu["data"], "namn": "Prov <b>Designer</b>"}, "andrad": nu["andrad"]})
    r = urllib.request.Request(f"{bas}/api/kunder/{PROVKUND}/export")
    with urllib.request.urlopen(r) as s:
        text, rubriker = s.read().decode(), s.headers
    kolla(f'filename="{PROVKUND}-underlag.html"' in rubriker.get("Content-Disposition", "") and "default-src 'none'" in rubriker.get("Content-Security-Policy", ""),
          "underlaget laddas ner som en fil som inte kan köra skript")
    kolla("Prov &lt;b&gt;Designer&lt;/b&gt;" in text and "<b>Designer</b>" not in text, "texter från kundfilen escapas")
    kolla("Det här behöver vi från er" in text and "Kontakt › Telefon" not in text and "Domän" in text, "underlaget säger vad som saknas")

    status, svar = fraga(bas, "POST", f"/api/kunder/{PROVKUND}/arkivera")
    arkiv = json.loads(svar).get("arkiv") or {}
    kolla(status == 200 and arkiv.get("tas_bort") == (dt.date.today() + dt.timedelta(days=30)).isoformat(), "en arkiverad kund tas bort om 30 dagar")
    rad = next((k for k in json.loads(fraga(bas, "GET", "/api/kunder")[1]) if k["kund"] == PROVKUND), {})
    kolla(rad.get("arkiv", {}).get("dagar_kvar") == 30, "startsidan vet att kunden är arkiverad")
    kolla(json.loads(fraga(bas, "GET", f"/api/kunder/{PROVKUND}")[1]).get("arkiv") is not None, "kunden går att öppna i arkivet")
    status, svar = fraga(bas, "POST", f"/api/kunder/{PROVKUND}/aterstall")
    kolla(status == 200 and json.loads(svar)["arkiv"] is None and not (FABRIK / "kunder" / PROVKUND / "arkiv.json").exists(),
          "en arkiverad kund kan tas tillbaka")

    gammal = (dt.datetime.now() - dt.timedelta(days=31)).isoformat(timespec="seconds")
    (FABRIK / "kunder" / PROVKUND / "arkiv.json").write_text(json.dumps({"arkiverad": gammal, "av": "Prov"}), encoding="utf-8")
    fraga(bas, "GET", "/api/kunder")
    for _ in range(40):
        if not (FABRIK / "kunder" / PROVKUND).exists():
            break
        time.sleep(0.25)
    kolla(not (FABRIK / "kunder" / PROVKUND).exists() and not (FABRIK / "ut" / "claude" / PROVKUND).exists(),
          "en kund som har legat i arkivet i 30 dagar tas bort med sin konversation")
    kolla(any((FABRIK / "ut" / "arkiv").glob(f"{PROVKUND}-*.html")), "underlaget sparas i ut/arkiv/ innan kunden tas bort")
    kolla(all(k["kund"] != PROVKUND for k in json.loads(fraga(bas, "GET", "/api/kunder")[1])), "kunden syns inte längre")



def provfonster() -> None:
    """Designer öppnas i programmets eget fönster bara om programmet har ett och hör till den här fabriken."""
    import plistlib  # noqa: PLC0415
    import tempfile  # noqa: PLC0415

    from designer import server  # noqa: PLC0415

    gammalt = server.PROGRAMMET
    with tempfile.TemporaryDirectory() as tmp:
        server.PROGRAMMET = Path(tmp) / "HJERDAL Designer.app"
        plist = server.PROGRAMMET / "Contents" / "Info.plist"
        kolla(not server.eget_fonster(), "utan programmet öppnas Designer i Chrome eller webbläsaren")
        plist.parent.mkdir(parents=True)
        plist.write_bytes(plistlib.dumps({"HJERDALFonster": True, "HJERDALFabrik": str(FABRIK)}))
        kolla(server.eget_fonster(), "programmet med eget fönster används")
        plist.write_bytes(plistlib.dumps({"HJERDALFonster": False, "HJERDALFabrik": str(FABRIK)}))
        kolla(not server.eget_fonster(), "men inte startaren som öppnar Chrome")
        plist.write_bytes(plistlib.dumps({"HJERDALFonster": True, "HJERDALFabrik": "/en/annan/fabrik"}))
        kolla(not server.eget_fonster(), "och inte ett program som hör till en annan fabrik")
    server.PROGRAMMET = gammalt


if __name__ == "__main__":
    sys.exit(main())
