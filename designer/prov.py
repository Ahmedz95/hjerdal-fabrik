"""Provkör HJERDAL Designer och MCP-servern från början till slut. Körs i CI.

    python3 designer/prov.py

Startar Designer på en ledig port, går igenom API:t som formuläret och Claude
använder, bygger exempelkunden och kontrollerar att servern bara svarar den här
datorn. Skapar en tillfällig kund och tar bort den efteråt.
"""
from __future__ import annotations

import json
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
        kolla(status == 200 and json.loads(svar)["app"] == "HJERDAL Designer", "info svarar")
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
        kolla(status == 200 and json.loads(svar)["meddelanden"] == [], "en ny kund har ingen konversation")
        kolla(fraga(bas, "POST", f"/api/kunder/{PROVKUND}/claude", {"text": "hej"}, rubriker={})[0] == 403, "chatten kräver X-Hjerdal")
        kolla(fraga(bas, "DELETE", f"/api/kunder/{PROVKUND}/claude")[0] == 200, "en ny konversation kan börjas")

        print("\n▸ Förhandsvisning av exempelkunden")
        status, svar = fraga(bas, "POST", "/api/kunder/bistro-nordvik/bygg")
        bygge = json.loads(svar)
        kolla(status == 200 and not bygge["fel"], f"bygget är utan fel ({bygge.get('sidor')} sidor)")
        status, svar = fraga(bas, "GET", "/visa/bistro-nordvik/meny/")
        kolla(status == 200 and b'href="/visa/bistro-nordvik/' in svar, "förhandsvisningen har rätt sökvägar")

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
        mcp.stdin.close()
        mcp.wait(timeout=10)
    finally:
        shutil.rmtree(FABRIK / "kunder" / PROVKUND, ignore_errors=True)
        shutil.rmtree(FABRIK / "ut" / "designer" / PROVKUND, ignore_errors=True)
        shutil.rmtree(FABRIK / "ut" / "claude" / PROVKUND, ignore_errors=True)
        server.terminate()
        server.wait(timeout=10)
    print(f"\n{'✗ ' + str(len(fel)) + ' fel' if fel else '✓ Designer och MCP fungerar'}")
    return 1 if fel else 0


if __name__ == "__main__":
    sys.exit(main())
