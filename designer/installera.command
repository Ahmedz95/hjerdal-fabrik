#!/bin/bash
# Installerar HJERDAL Designer på en Mac. Dubbelklicka på filen i Finder.
#
# Gör programmet "HJERDAL Designer" i ~/Applications med ikon, lägger det i
# Dock, installerar fabrikens beroenden och kopplar Claude-appen till
# Designer, så att säljaren kan be Claude fylla i en kund. Kan köras igen
# när som helst, till exempel efter att fabriken har flyttats.
set -euo pipefail

FABRIK="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Applications/HJERDAL Designer.app"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

rubrik() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
stopp() { printf '\n\033[31m✗ %s\033[0m\n\n' "$1"; read -r -p "Tryck Enter för att stänga." _; exit 1; }
fraga() { local svar; read -r -p "  $1 [J/n] " svar; [[ -z "$svar" || "$svar" =~ ^[JjYy] ]]; }

cd "$FABRIK"
rubrik "HJERDAL Designer installeras från $FABRIK"

# --- Verktygen ----------------------------------------------------------------
xcode-select -p >/dev/null 2>&1 || {
  xcode-select --install >/dev/null 2>&1 || true
  stopp "Apples utvecklarverktyg (git och Python) saknas. Ett fönster har öppnats för att installera dem. Kör den här filen igen när det är klart."
}
PY="$(command -v python3)"
"$PY" -c 'import sys; sys.exit(sys.version_info < (3, 9))' || stopp "Python 3.9 eller senare behövs. Installera med: brew install python"
command -v node >/dev/null || stopp "Node saknas. Installera Homebrew från https://brew.sh och kör sedan: brew install node"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 20 ? 1 : 0)' || stopp "Node 20 eller senare behövs. Uppdatera med: brew upgrade node"
info "Python $("$PY" -c 'import platform; print(platform.python_version())'), Node $(node --version), $(git --version)"

# --- Git ------------------------------------------------------------------------
if [[ -z "$(git config user.email || true)" ]]; then
  rubrik "Vem sparar kunderna i GitHub?"
  read -r -p "  Ditt namn: " namn
  read -r -p "  Din e-post (samma som på GitHub): " epost
  git config --global user.name "$namn"
  git config --global user.email "$epost"
fi
rubrik "Kontrollerar att GitHub går att nå"
if git ls-remote --heads origin >/dev/null 2>&1; then
  info "GitHub: OK"
else
  info "GitHub svarar inte eller vill att du loggar in. Designer fungerar ändå, men Spara till GitHub"
  info "kräver att du kan köra git push i den här mappen. Logga in med GitHub Desktop eller: gh auth login"
fi

# --- Beroenden --------------------------------------------------------------------
rubrik "Installerar fabrikens beroenden och provbygger exempelkunden"
"$PY" fabrik.py bygg bistro-nordvik

# --- Programmet ---------------------------------------------------------------------
rubrik "Gör programmet $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>HJERDAL Designer</string>
  <key>CFBundleDisplayName</key><string>HJERDAL Designer</string>
  <key>CFBundleIdentifier</key><string>se.hjerdal.designer</string>
  <key>CFBundleExecutable</key><string>designer</string>
  <key>CFBundleIconFile</key><string>ikon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <!-- Programmet startar servern och öppnar fönstret, sedan är det klart. -->
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
# Startaren: sökvägarna skrivs in nu, så att programmet hittar fabriken och rätt Python.
{
  echo '#!/bin/bash'
  echo 'export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"'
  printf 'FABRIK=%q\n' "$FABRIK"
  printf 'PY=%q\n' "$PY"
  echo 'mkdir -p "$FABRIK/ut"'
  echo 'nohup "$PY" "$FABRIK/fabrik.py" designer >> "$FABRIK/ut/designer.log" 2>&1 &'
} > "$APP/Contents/MacOS/designer"
chmod +x "$APP/Contents/MacOS/designer"

IKONER="$(mktemp -d)/ikon.iconset"
mkdir -p "$IKONER"
for storlek in 16 32 128 256 512; do
  sips -z $storlek $storlek designer/ikon.png --out "$IKONER/icon_${storlek}x${storlek}.png" >/dev/null
  sips -z $((storlek * 2)) $((storlek * 2)) designer/ikon.png --out "$IKONER/icon_${storlek}x${storlek}@2x.png" >/dev/null
done
iconutil -c icns "$IKONER" -o "$APP/Contents/Resources/ikon.icns"
touch "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" >/dev/null 2>&1 || true
info "Klart. Programmet finns i Program-mappen i din hemmapp."

# --- Dock ---------------------------------------------------------------------------
if defaults read com.apple.dock persistent-apps 2>/dev/null | grep -q "HJERDAL%20Designer.app"; then
  info "HJERDAL Designer finns redan i Dock."
elif fraga "Lägga HJERDAL Designer i Dock?"; then
  defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://${APP// /%20}/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
  killall Dock
fi

# --- Claude -------------------------------------------------------------------------
CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [[ -d "$(dirname "$CLAUDE_CONFIG")" ]]; then
  rubrik "Claude-appen"
  info "Med kopplingen kan du be Claude fylla i en kund, bygga förhandsvisningen och skapa förslag."
  info "Det går på ditt Claude-abonnemang. Ingen API-nyckel behövs."
  if fraga "Koppla Claude-appen till HJERDAL Designer?"; then
    if "$PY" - "$CLAUDE_CONFIG" "$PY" "$FABRIK" <<'PYTHON'
import json, shutil, sys
from pathlib import Path
fil, py, fabrik = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
config = json.loads(fil.read_text(encoding="utf-8")) if fil.exists() and fil.read_text(encoding="utf-8").strip() else {}
if fil.exists():
    shutil.copy2(fil, fil.with_suffix(".json.fore-hjerdal"))
config.setdefault("mcpServers", {})["hjerdal-designer"] = {
    "command": py,
    "args": [f"{fabrik}/fabrik.py", "mcp"],
    "env": {"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"},
}
fil.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PYTHON
    then
      info "Klart. Avsluta Claude-appen helt (Cmd+Q) och öppna den igen, så syns HJERDAL Designer bland verktygen."
    else
      info "Kunde inte läsa Claude-appens inställningar. Se README under Claude för hur det kopplas för hand."
    fi
  fi
fi

# Chatten i Designer kör Claude Code på den här datorn, inloggad med säljarens eget Claude-konto.
rubrik "Claude-chatten i Designer"
info "Chatten använder Claude Code, inloggad med ditt eget Claude-konto (Pro eller Max)."
info "Den går på ditt abonnemang. Ingen API-nyckel behövs, och Designer rör aldrig inloggningen."
CLAUDE_BIN="$(command -v claude || true)"
[[ -z "$CLAUDE_BIN" && -x "$HOME/.local/bin/claude" ]] && CLAUDE_BIN="$HOME/.local/bin/claude"
if [[ -z "$CLAUDE_BIN" ]]; then
  if fraga "Installera Claude Code nu?"; then
    if curl -fsSL https://claude.ai/install.sh | bash; then
      CLAUDE_BIN="$HOME/.local/bin/claude"
    else
      info "Installationen misslyckades. Chatten i Designer visar hur du installerar senare."
    fi
  else
    info "Hoppar över. Chatten i Designer visar hur du installerar senare."
  fi
fi
if [[ -n "$CLAUDE_BIN" && -x "$CLAUDE_BIN" ]]; then
  inloggad() {
    "$CLAUDE_BIN" auth status 2>/dev/null | "$PY" -c 'import json, sys
d = json.load(sys.stdin)
sys.exit(0 if d.get("loggedIn") and d.get("authMethod") not in ("api_key", "api_key_helper") else 1)' 2>/dev/null
  }
  if inloggad; then
    info "Claude Code: inloggad med ditt Claude-konto."
  elif fraga "Logga in i Claude Code nu? Välj ditt Claude-konto i webbläsaren, inte en API-nyckel."; then
    "$CLAUDE_BIN" auth login || true
    inloggad && info "Claude Code: inloggad." || info "Inte inloggad än. Tryck Claude i Designer när du vill logga in."
  fi
  if ! "$CLAUDE_BIN" mcp get hjerdal-designer >/dev/null 2>&1; then
    "$CLAUDE_BIN" mcp add --scope user hjerdal-designer -- "$PY" "$FABRIK/fabrik.py" mcp >/dev/null 2>&1 \
      && info "Claude Code i terminalen: HJERDAL Designer finns bland verktygen."
  fi
fi

rubrik "HJERDAL Designer är installerad"
info "Starta från Dock eller Program-mappen. Fönstret kan stängas när som helst; allt sparas direkt."
open "$APP"
