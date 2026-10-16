#!/bin/bash
# Gör Assets.car med programikonen i macOS 26:s format från AppIcon.icon (Icon Composer).
#
#   designer/ikon/bygg-ikon.sh [mapp]
#
# macOS 26 krymper ikoner som bara finns som .icns och lägger dem på en grå platta. Med
# Assets.car och CFBundleIconName visas ikonen i full storlek, och äldre macOS tar en platt
# version ur samma fil. Det kräver actool från Xcode 26, som inte finns i utvecklarverktygen
# på säljarnas datorer, så Mac-kontrollen i GitHub kör skriptet och Assets.car checkas in.
# Kör det igen när AppIcon.icon ändras.
set -euo pipefail

HIT="$(cd "$(dirname "$0")" && pwd)"
UT="${1:-$HIT}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

xcrun --find actool >/dev/null 2>&1 || { echo "actool saknas: det behövs Xcode 26 eller senare." >&2; exit 1; }
xcrun actool "$HIT/AppIcon.icon" --compile "$TMP" --app-icon AppIcon \
  --platform macosx --target-device mac --minimum-deployment-target 12.0 \
  --include-all-app-icons --enable-on-demand-resources NO --development-region sv \
  --output-partial-info-plist "$TMP/partial.plist" \
  --errors --warnings --output-format human-readable-text 2> >(grep -v '^dyld\[' >&2)
[[ -s "$TMP/Assets.car" ]] || { echo "actool gjorde ingen Assets.car." >&2; exit 1; }
mkdir -p "$UT"
cp "$TMP/Assets.car" "$UT/"
echo "Assets.car ligger i $UT"
