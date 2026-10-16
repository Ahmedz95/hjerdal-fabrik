"""Kundens underlag som en enda HTML-fil att skicka till kunden.

Allt som står i kundfilen, uppställt så att restaurangen kan läsa igenom det i
webbläsaren: kontakt, öppettider, menyn, texterna, bilderna och utseendet, och
det som fortfarande saknas. Bilderna ligger inne i filen, så den fungerar som
bilaga i ett mejl, utan internet och efter att kunden har tagits bort ur arkivet.
Den skrivs bara från kundfilen och ändrar ingenting.
"""
from __future__ import annotations

import base64
import datetime as dt
import re
from html import escape
from pathlib import Path

import fabrik
from designer import bild

EXPORTBILD = 1600  # största sida för en bild i filen, så att den går att mejla
MIME = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "svg": "image/svg+xml"}
DATUM = re.compile(r"\d{4}-\d{2}-\d{2}")
DAGAR = ["man", "tis", "ons", "tor", "fre", "lor", "son"]
MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"]


def filnamn(kund: str) -> str:
    return f"{kund}-underlag.html"


def faltnamn(vag: str) -> str:
    """Fältets namn som i formuläret: "Meny › Sektion 1 › Rätt 2 › Pris" (vagNamn i webb/formular.js)."""
    namn: list[str] = []
    s: dict | None = fabrik.SCHEMA["schema"]
    for k in vag.split("."):
        if not s:
            break
        if k.isdigit():
            delar = s.get("items")
            s = (delar[int(k)] if int(k) < len(delar) else None) if isinstance(delar, list) else delar
            if s and s.get("type") == "object":
                namn[-1:] = [f"{etikett(s) or 'Rad'} {int(k) + 1}"]
        else:
            s = (s.get("properties") or {}).get(k)
            if s:
                namn.append(etikett(s) or k)
    return " › ".join(namn) or vag


def etikett(s: dict) -> str:
    return (s.get("description") or "").split("|")[0]


def lank(url: str, text: str | None = None) -> str:
    """Bara https, mejl och telefon blir länkar. Allt annat visas som text."""
    if not re.match(r"(https?://|mailto:|tel:)", url or ""):
        return escape(text or url or "")
    return f'<a href="{escape(url)}">{escape(text or re.sub(r"^(https?://|mailto:|tel:)", "", url).rstrip("/"))}</a>'


def datum(d: dt.date | str) -> str:
    """2026-11-14 blir 14 november 2026."""
    d = dt.date.fromisoformat(d[:10]) if isinstance(d, str) else d
    return f"{d.day} {MANADER[d.month - 1]} {d.year}"


def tider(par: list) -> str:
    return ", ".join(f"{a}–{b}" for a, b in par) if par else "Stängt"


def dagar(lista: list[str]) -> str:
    """["man", "tis", "ons", "tor", "fre"] blir Mån–Fre."""
    namn = fabrik.SCHEMA["namn"]["dag"]
    nr = sorted(DAGAR.index(d) for d in lista if d in DAGAR)
    if len(nr) >= 3 and nr == list(range(nr[0], nr[-1] + 1)):
        return f"{namn[DAGAR[nr[0]]]}–{namn[DAGAR[nr[-1]]]}"
    return ", ".join(namn[DAGAR[i]] for i in nr)


def pris(ratt: dict) -> str:
    if ratt.get("prisText"):
        return escape(ratt["prisText"])
    if isinstance(ratt.get("pris"), (int, float)) and not isinstance(ratt.get("pris"), bool):
        return f"{ratt['pris']:g}&nbsp;kr"
    return ""


def bilddata(mapp: Path, fil: str | None) -> str | None:
    """Bilden som data-URL, nedskalad så att filen går att mejla. None om den saknas."""
    if not fil or not re.fullmatch(r"[\w.-]+\.(jpe?g|png|webp|svg)", fil, re.I):
        return None
    sokvag = mapp / fil
    if not sokvag.is_file():
        return None
    innehall, ext = sokvag.read_bytes(), sokvag.suffix[1:].lower().replace("jpeg", "jpg")
    if ext != "svg":
        try:
            innehall, ext, _ = bild.komprimera(innehall, ext, EXPORTBILD, (ext,))
        except bild.BildFel:
            pass
    return f"data:{MIME.get(ext, 'application/octet-stream')};base64,{base64.b64encode(innehall).decode()}"


def framhav(text: str) -> str:
    """En rubrik med ord mellan *stjärnor* framhävda, som på sajten (Framhavd.astro)."""
    return re.sub(r"\*([^*\n]+)\*", r"<em>\1</em>", escape(text))


def html(kund: str, data: dict, problem: list[tuple[str, str]]) -> str:
    s = fabrik.SCHEMA
    namn_pa = s["namn"]
    design = fabrik.design_med_standard(data)
    tema = next((t for t in s["teman"] if t["id"] == design["tema"]), s["teman"][0])
    accent = data.get("design", {}).get("accent")
    accent = accent if isinstance(accent, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", accent) else tema["accent"]
    serif = design["typsnitt"] in ("garamond", "bodoni") or (
        design["typsnitt"] == "albert" and (data.get("design", {}).get("rubrik") or tema.get("rubrik")) == "serif")
    mapp = fabrik.kundmapp(kund) / "bilder"
    bilder = data.get("bilder") or {}
    kontakt = data.get("kontakt") or {}
    adress = kontakt.get("adress") or {}
    namn = data.get("namn") or kund
    idag = dt.date.today()
    delar: list[str] = []

    def sektion(rubrik: str, innehall: str, klass: str = "") -> None:
        if innehall.strip():
            delar.append(f'<section class="{klass}"><h2>{escape(rubrik)}</h2>{innehall}</section>')

    def rader(par: list[tuple[str, str]]) -> str:
        return "".join(f"<dt>{escape(k)}</dt><dd>{v}</dd>" for k, v in par if v)

    if problem:
        sektion("Det här behöver vi från er",
                "<p>Fälten nedan saknas eller behöver ändras innan webbplatsen kan publiceras.</p><ul>"
                + "".join(f"<li><b>{escape(faltnamn(v))}</b> {escape(t)}</li>" for v, t in problem) + "</ul>", "saknas")

    sektion("Kontakt", "<dl>" + rader([
        ("Telefon", lank(f"tel:{re.sub(r'[^0-9+]', '', kontakt['telefon'])}", kontakt["telefon"]) if kontakt.get("telefon") else ""),
        ("E-post", lank(f"mailto:{kontakt['epost']}", kontakt["epost"]) if kontakt.get("epost") else ""),
        ("Adress", escape(", ".join(x for x in (adress.get("gata"), " ".join(filter(None, (adress.get("postnummer"), adress.get("ort"))))) if x))),
        ("Karta", lank(kontakt.get("karta", ""), "Öppna i Google Maps") if kontakt.get("karta") else ""),
        ("Bordsbokning", lank((data.get("boka") or {}).get("url", ""), (data.get("boka") or {}).get("text") or "Boka bord")
         if (data.get("boka") or {}).get("url") else "Ingen bokning, knappen blir Ring oss"),
        *[(etikett(s["schema"]["properties"]["sociala"]["properties"].get(k, {})) or k, lank(u))
          for k, u in (data.get("sociala") or {}).items() if u],
        ("Webbplats", lank(f"https://{data['doman']}") if data.get("doman") else ""),
    ]) + "</dl>")

    oppet = "".join(f"<tr><th>{escape(dagar(r.get('dagar', [])))}</th><td>{escape(tider(r.get('tider', [])))}</td></tr>"
                    for r in data.get("oppettider") or [])
    avvik = "".join(f"<tr><th>{escape(a.get('text', ''))}, {escape(datum(a['datum']) if DATUM.fullmatch(a.get('datum', '')) else a.get('datum', ''))}</th>"
                    f"<td>{'Stängt' if a.get('stangt', True) else escape(tider(a.get('tider', [])))}</td></tr>"
                    for a in data.get("avvikelser") or [])
    sektion("Öppettider", (f"<table>{oppet}</table>" if oppet else "")
            + (f"<h3>Avvikande öppettider</h3><table>{avvik}</table>" if avvik else ""))

    om = data.get("om") or {}
    if om:
        om_bild = bilddata(mapp, (bilder.get("om") or {}).get("fil"))
        sektion("Om oss", (f"<h3>{framhav(om['rubrik'])}</h3>" if om.get("rubrik") else "")
                + "".join(f"<p>{escape(st)}</p>" for st in om.get("stycken") or [])
                + (f'<img class="foto" src="{om_bild}" alt="{escape((bilder.get("om") or {}).get("alt", ""))}">' if om_bild else "")
                + ("<h3>Historien</h3><table>" + "".join(f"<tr><th>{escape(h.get('nar', ''))}</th><td>{escape(h.get('text', ''))}</td></tr>"
                                                          for h in om["historia"]) + "</table>" if om.get("historia") else ""))

    meny = data.get("meny") or {}
    sektioner = []
    for sek in meny.get("sektioner") or []:
        nar = " · ".join(x for x in (dagar(sek.get("dagar") or []),
                                      f"{sek['fran']}–{sek['till']}" if sek.get("fran") and sek.get("till") else "") if x)
        ratter = []
        for r in (r for r in sek.get("ratter") or [] if r.get("namn")):
            info = [namn_pa["tagg"].get(t, t) for t in r.get("taggar") or []]
            if r.get("allergener"):
                info.append("Allergener: " + ", ".join(r["allergener"]))
            if r.get("slut"):
                info.append("Slut för idag")
            ratter.append(f'<li><div class="ratt"><b>{escape(r.get("namn", ""))}</b><span class="pris">{pris(r)}</span></div>'
                          + (f"<p>{escape(r['text'])}</p>" if r.get("text") else "")
                          + (f'<p class="liten">{escape(" · ".join(info))}</p>' if info else "") + "</li>")
        sektioner.append(f"<h3>{escape(sek.get('namn', ''))}</h3>"
                         + (f'<p class="liten">{escape(nar)}</p>' if nar else "")
                         + (f"<p>{escape(sek['text'])}</p>" if sek.get("text") else "")
                         + f'<ul class="meny">{"".join(ratter)}</ul>')
    sektion(meny.get("rubrik") or "Meny", (f"<p>{escape(meny['text'])}</p>" if meny.get("text") else "") + "".join(sektioner)
            + (f'<p class="liten">{escape(meny["allergiText"])}</p>' if meny.get("allergiText") else ""))

    sektion("Frågor före besöket", "".join(f"<h3>{escape(f.get('fraga', ''))}</h3><p>{escape(f.get('svar', ''))}</p>"
                                           for f in data.get("fragor") or []))
    kort = data.get("stampelkort") or {}
    if kort:
        sektion("Stämpelkort", (f"<h3>{framhav(kort['rubrik'])}</h3>" if kort.get("rubrik") else "")
                + (f"<p>{escape(kort['text'])}</p>" if kort.get("text") else "")
                + f'<p class="liten">{escape(str(kort.get("antal", 10)))} rutor på kortet, den sista bjuds.</p>')

    galleri = []
    for falt, text in (("hero", "Stor bild på startsidan"), ("om", "Bild till Om oss")):
        b = bilder.get(falt) or {}
        src = bilddata(mapp, b.get("fil"))
        if src:
            galleri.append(f'<figure><img src="{src}" alt="{escape(b.get("alt", ""))}"><figcaption><b>{text}</b>'
                           f'{escape(b.get("alt", ""))}</figcaption></figure>')
    for falt, text, bg in (("logo", "Logga", tema["bg"]), ("logoMork", "Logga på mörk bakgrund", "#111417")):
        src = bilddata(mapp, bilder.get(falt))
        if src:
            galleri.append(f'<figure><span class="logga" style="background:{bg}"><img src="{src}" alt="{text}"></span>'
                           f"<figcaption><b>{text}</b></figcaption></figure>")
    sektion("Bilder", f'<div class="galleri">{"".join(galleri)}</div>' if galleri else "")

    if data.get("beskrivning"):
        sektion("Så syns ni på Google", f'<div class="google"><span>{escape(data.get("doman") or "")}</span>'
                f'<b>{escape(namn)}</b><p>{escape(data["beskrivning"])}</p></div>')

    farger = "".join(f'<span class="farg" style="background:{tema[k]}" title="{k}"></span>' for k in ("bg", "surface", "ink", "muted")) \
        + f'<span class="farg" style="background:{accent}" title="accent"></span>'
    sektion("Utseende", "<dl>" + rader([
        ("Stil", escape(namn_pa["stil"].get(design["stil"], design["stil"]))),
        ("Typsnitt", escape(namn_pa["typsnitt"].get(design["typsnitt"], design["typsnitt"]))),
        ("Färgtema", f"{escape(tema['namn'])} <span class=\"farger\">{farger}</span>"),
        ("Startsidan", escape(namn_pa["hero"].get(design["hero"], design["hero"]))),
        ("Menyn", escape(namn_pa["meny"].get(design["meny"], design["meny"]))),
    ]) + "</dl>")

    hero = bilddata(mapp, (bilder.get("hero") or {}).get("fil")) if design["hero"] != "text" else None
    kok = " · ".join(x for x in [*(data.get("kok") or []), data.get("prisniva") or ""] if x)
    rubrikfont = "Georgia, 'Times New Roman', serif" if serif else "-apple-system, 'Helvetica Neue', Arial, sans-serif"
    return f"""<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>{escape(namn)}: underlag för webbplatsen</title>
<style>
:root {{ --bg: {tema['bg']}; --ink: {tema['ink']}; --muted: {tema['muted']}; --accent: {accent}; --rubrik: {rubrikfont}; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: #fbfbfa; color: #16191b; font: 16px/1.55 -apple-system, 'Helvetica Neue', Arial, sans-serif; }}
a {{ color: inherit; text-underline-offset: 3px; }}
header {{ background: var(--bg); color: var(--ink); padding: 56px 24px 48px; }}
header > div, main, footer {{ max-width: 780px; margin: 0 auto; }}
.etikett {{ font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin: 0 0 18px; }}
h1, h2, h3 {{ font-family: var(--rubrik); font-weight: 500; line-height: 1.15; }}
h1 {{ font-size: clamp(34px, 7vw, 54px); margin: 0 0 14px; letter-spacing: -.01em; }}
header .rubrik {{ font-size: 21px; margin: 0 0 8px; }}
header .ingress {{ color: var(--muted); margin: 0 0 14px; max-width: 60ch; }}
header .kok {{ display: inline-block; border: 1px solid var(--accent); color: var(--accent); border-radius: 99px; padding: 3px 12px; font-size: 13px; }}
header .remsa {{ margin: 14px 0 0; font-size: 14px; color: var(--muted); }}
header .hero {{ display: block; width: 100%; max-height: 360px; object-fit: cover; border-radius: 10px; margin-top: 28px; }}
main {{ padding: 8px 24px 40px; }}
section {{ padding: 30px 0; border-bottom: 1px solid #e3e6e4; }}
h2 {{ font-size: 25px; margin: 0 0 16px; }}
h3 {{ font-size: 19px; margin: 24px 0 6px; }}
p {{ margin: 0 0 10px; }}
.liten {{ color: #5c6368; font-size: 14px; }}
dl {{ display: grid; grid-template-columns: max-content 1fr; gap: 8px 24px; margin: 0; }}
dt {{ color: #5c6368; }} dd {{ margin: 0; }}
table {{ border-collapse: collapse; }}
th, td {{ text-align: left; padding: 4px 28px 4px 0; font-weight: 400; vertical-align: top; }}
th {{ color: #5c6368; }}
ul.meny {{ list-style: none; padding: 0; margin: 10px 0 0; }}
ul.meny li {{ padding: 10px 0; border-top: 1px dashed #dde1df; }}
ul.meny p {{ margin: 2px 0 0; }}
.ratt {{ display: flex; justify-content: space-between; gap: 16px; }}
.pris {{ font-variant-numeric: tabular-nums; white-space: nowrap; }}
.saknas {{ background: #fff6e5; border: 1px solid #f1d8a6; border-radius: 10px; padding: 22px 24px; margin-top: 28px; }}
.saknas ul {{ margin: 6px 0 0; padding-left: 20px; }}
.galleri {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }}
figure {{ margin: 0; }}
figure img, .foto {{ width: 100%; border-radius: 8px; display: block; }}
.foto {{ margin-top: 14px; }}
.logga {{ display: flex; align-items: center; justify-content: center; aspect-ratio: 3 / 2; border-radius: 8px; padding: 22px; border: 1px solid #e3e6e4; }}
.logga img {{ max-height: 100%; width: auto; max-width: 100%; border-radius: 0; }}
figcaption {{ font-size: 14px; color: #5c6368; margin-top: 8px; }}
figcaption b {{ display: block; color: #16191b; font-weight: 500; }}
.google {{ border: 1px solid #e3e6e4; border-radius: 10px; padding: 16px 18px; background: #fff; max-width: 600px; }}
.google span {{ font-size: 13px; color: #5c6368; }}
.google b {{ display: block; color: #1a0dab; font-size: 19px; font-weight: 400; margin: 2px 0 4px; }}
.google p {{ font-size: 14px; color: #4d5156; margin: 0; }}
.farger {{ display: inline-flex; gap: 4px; vertical-align: -3px; margin-left: 8px; }}
.farg {{ width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); }}
footer {{ padding: 24px; font-size: 13px; color: #5c6368; }}
@media (max-width: 560px) {{ dl {{ grid-template-columns: 1fr; gap: 2px; }} dd {{ margin-bottom: 10px; }} }}
@media print {{
  body {{ background: #fff; }}
  header {{ padding: 28px 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  section {{ break-inside: avoid-page; }}
  a {{ text-decoration: none; }}
}}
</style>
</head>
<body>
<header><div>
<p class="etikett">Underlag för webbplatsen · {datum(idag)}</p>
<h1>{escape(namn)}</h1>
{f'<p class="rubrik">{framhav(data["rubrik"])}</p>' if data.get("rubrik") else ""}
{f'<p class="ingress">{escape(data["ingress"])}</p>' if data.get("ingress") else ""}
{f'<span class="kok">{escape(kok)}</span>' if kok else ""}
{f'<p class="remsa">{escape(" · ".join(data["remsa"]))}</p>' if data.get("remsa") else ""}
{f'<img class="hero" src="{hero}" alt="{escape((bilder.get("hero") or {}).get("alt", ""))}">' if hero else ""}
</div></header>
<main>
{"".join(delar)}
</main>
<footer>Det här är allt som står om {escape(namn)} i HJERDAL:s sajtfabrik den {datum(idag)}. Hör av er om något ska ändras.</footer>
</body>
</html>
"""
