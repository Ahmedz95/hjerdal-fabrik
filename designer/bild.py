"""Bilder som laddas upp i Designer görs lagom stora innan de sparas.

Ett foto från en mobil kan vara 12 MB och 4000 pixlar brett. Det skulle följa med
till GitHub och göra fabriken tung, fast sajten aldrig visar mer än 2560 pixlar.
Därför görs varje bild om med sharp från fabrikens beroenden (designer/komprimera.mjs):
vriden rätt, högst 2560 pixlar, JPEG för foton och PNG för det som är genomskinligt,
och utan metadata, så att platsen där fotot togs aldrig följer med. HEIC från en
iPhone görs först om till JPEG med macOS egna sips. SVG lämnas som den är.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import fabrik

SKRIPT = Path(__file__).resolve().parent / "komprimera.mjs"
FOTO = 2560  # största sida på sajten
BILAGA = 2000  # största sida för en bild som Claude ska läsa
RASTER = {"jpg", "jpeg", "png", "webp", "heic", "heif"}
FORMAT = ("jpg", "png", "webp")  # det en bild kan sparas som


class BildFel(Exception):
    pass


def moduler() -> Path | None:
    """node_modules med sharp, från fabrikens delade beroenden. None innan något har byggts."""
    if not fabrik.BEROENDEN.exists():
        return None
    for mapp in sorted(fabrik.BEROENDEN.iterdir()):
        if (mapp / ".fabrik-klar").exists() and (mapp / "node_modules" / "sharp").exists():
            return mapp / "node_modules"
    return None


def komprimera(innehall: bytes, ext: str, storsta: int = FOTO, tillatna: tuple[str, ...] = FORMAT) -> tuple[bytes, str, dict]:
    """Bilden i lagom storlek: (innehållet, filändelsen, mått). Annat än bilder lämnas orört.
    tillatna är formaten fältet tar emot, till exempel inte JPEG för en logga."""
    ext = ext.lower().replace("jpeg", "jpg")
    if ext not in RASTER:
        return innehall, ext, {}
    with tempfile.TemporaryDirectory(prefix="hjerdal-bild-") as tmp:
        kalla = Path(tmp) / f"in.{ext}"
        kalla.write_bytes(innehall)
        if ext in ("heic", "heif"):
            kalla, ext = heic_till_jpg(kalla), "jpg"
        nm, node = moduler(), shutil.which("node")
        if not nm or not node:
            # Innan fabriken har byggt något finns inte sharp. Då sparas bilden som den är.
            return kalla.read_bytes(), ext, {}
        tillatna = tuple(f for f in tillatna if f in FORMAT) or FORMAT
        res = subprocess.run([node, str(SKRIPT), str(kalla), str(Path(tmp) / "ut"), str(storsta), ",".join(tillatna), ext],
                             capture_output=True, text=True, timeout=120, env={**os.environ, "HJERDAL_MODULER": str(nm)})
        if res.returncode != 0:
            raise BildFel("Bilden gick inte att läsa. Spara den som JPEG eller PNG och försök igen.")
        svar = json.loads(res.stdout.strip().splitlines()[-1])
        ut = Path(svar["fil"])
        # Alltid den nya filen, även om en redan väl packad PNG skulle bli lite större: den har ingen metadata.
        return ut.read_bytes(), ut.suffix[1:], {"bredd": svar["bredd"], "hojd": svar["hojd"]}


def heic_till_jpg(fil: Path) -> Path:
    """HEIC från en iPhone går bara att läsa med macOS egna sips."""
    sips = shutil.which("sips")
    if sys.platform != "darwin" or not sips:
        raise BildFel("HEIC-bilder från iPhone går bara att läsa på en Mac. Spara bilden som JPEG och försök igen.")
    ut = fil.with_name("heic.jpg")
    res = subprocess.run([sips, "-s", "format", "jpeg", "-s", "formatOptions", "95", str(fil), "--out", str(ut)],
                         capture_output=True, text=True, timeout=120)
    if res.returncode != 0 or not ut.exists():
        raise BildFel("HEIC-bilden gick inte att läsa. Spara den som JPEG och försök igen.")
    return ut
