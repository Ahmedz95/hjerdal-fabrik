#!/bin/bash
# Gör programmet HJERDAL Designer.app. installera.command kör det, och Mac-kontrollen i GitHub.
#
#   designer/fonster/gor-app.sh <programmet.app> <python>
#
# Med Swift från Apples utvecklarverktyg blir det ett eget program: Designer i ett fönster med
# Safaris motor, egen ikon i Dock och vanliga menyer (Designer.swift). Går det inte att bygga
# blir det en startare som öppnar Designer i Chrome i appläge, eller i webbläsaren.
set -euo pipefail

APP="$1"
PY="$2"
FABRIK="$(cd "$(dirname "$0")/../.." && pwd -P)"
NAMN="HJERDAL Designer"
MAL="$(mktemp -d)"
trap 'rm -rf "$MAL"' EXIT

# Programmet startas från Dock med en kort PATH, så Node och git läggs till här.
SOKVAG="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
command -v node >/dev/null && SOKVAG="$(dirname "$(command -v node)"):$SOKVAG"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

FONSTER=0
if xcrun --find swiftc >/dev/null 2>&1; then
  printf '  Bygger fönstret …\n'
  if xcrun swiftc -O -swift-version 5 -parse-as-library -target "$(uname -m)-apple-macos12.0" \
       -o "$APP/Contents/MacOS/$NAMN" "$FABRIK/designer/fonster/Designer.swift" 2> "$MAL/swiftc.log"; then
    FONSTER=1
    if [[ -n "${CI:-}" ]]; then cat "$MAL/swiftc.log"; fi  # varningarna syns i GitHub
  else
    printf '  Fönstret gick inte att bygga, så Designer öppnas i Chrome eller webbläsaren i stället:\n'
    sed 's/^/    /' "$MAL/swiftc.log" | tail -40
  fi
fi
if [[ $FONSTER == 0 ]]; then
  {
    echo '#!/bin/bash'
    echo '# macOS kan starta ett skriptprogram under Rosetta, och då fungerar inte git. Starta om som arm64.'
    echo '[[ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" == 1 ]] && exec /usr/bin/arch -arm64 /bin/bash "$0" "$@"'
    printf 'export PATH=%q:"$PATH"\n' "$SOKVAG"
    printf 'FABRIK=%q\n' "$FABRIK"
    printf 'PY=%q\n' "$PY"
    echo 'mkdir -p "$FABRIK/ut"'
    echo 'nohup "$PY" "$FABRIK/fabrik.py" designer >> "$FABRIK/ut/designer.log" 2>&1 &'
  } > "$APP/Contents/MacOS/$NAMN"
  chmod +x "$APP/Contents/MacOS/$NAMN"
fi

# Ikonen: Assets.car har den i macOS 26:s format (se designer/ikon/), ikon.icns är för äldre macOS.
IKONER="$MAL/ikon.iconset"
mkdir -p "$IKONER"
for storlek in 16 32 128 256 512; do
  sips -z $storlek $storlek "$FABRIK/designer/ikon.png" --out "$IKONER/icon_${storlek}x${storlek}.png" >/dev/null
  sips -z $((storlek * 2)) $((storlek * 2)) "$FABRIK/designer/ikon.png" --out "$IKONER/icon_${storlek}x${storlek}@2x.png" >/dev/null
done
iconutil -c icns "$IKONER" -o "$APP/Contents/Resources/ikon.icns"
ASSETS=0
if [[ -s "$FABRIK/designer/ikon/Assets.car" ]]; then
  cp "$FABRIK/designer/ikon/Assets.car" "$APP/Contents/Resources/"
  ASSETS=1
fi

"$PY" - "$APP/Contents/Info.plist" "$FABRIK" "$PY" "$SOKVAG" "$FONSTER" "$ASSETS" <<'PYTHON'
import plistlib, sys
fil, fabrik, py, sokvag, fonster, assets = sys.argv[1:]
namn = "HJERDAL Designer"
p = {
    "CFBundleName": namn,
    "CFBundleDisplayName": namn,
    "CFBundleIdentifier": "se.hjerdal.designer",
    "CFBundleExecutable": namn,
    "CFBundlePackageType": "APPL",
    "CFBundleShortVersionString": "1.1",
    "CFBundleVersion": "2",
    "CFBundleIconFile": "ikon",
    "LSMinimumSystemVersion": "12.0" if fonster == "1" else "11.0",
    "LSApplicationCategoryType": "public.app-category.productivity",
    "NSHighResolutionCapable": True,
    # Läses av Designer.swift och av server.py, som öppnar Designer här om programmet har eget fönster.
    "HJERDALFabrik": fabrik,
    "HJERDALPython": py,
    "HJERDALPath": sokvag,
    "HJERDALFonster": fonster == "1",
}
if assets == "1":
    p["CFBundleIconName"] = "AppIcon"
if fonster == "1":
    p["NSPrincipalClass"] = "NSApplication"
    p["CFBundleURLTypes"] = [{"CFBundleURLName": "se.hjerdal.designer", "CFBundleURLSchemes": ["hjerdal-designer"]}]
    p["NSAppTransportSecurity"] = {"NSAllowsLocalNetworking": True}
else:
    # Startaren startar servern och öppnar fönstret, sedan är den klar.
    p["LSUIElement"] = True
with open(fil, "wb") as f:
    plistlib.dump(p, f)
PYTHON

if [[ $FONSTER == 1 ]]; then
  codesign --force --sign - "$APP" >/dev/null 2>&1 || true
fi
touch "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" >/dev/null 2>&1 || true
[[ $FONSTER == 1 ]] && printf '  Designer får ett eget fönster.\n' || true
