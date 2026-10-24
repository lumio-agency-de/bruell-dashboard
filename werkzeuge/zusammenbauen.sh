#!/bin/bash
# Baut das Brüll Dashboard (Gesamt) aus den beiden Einzel-Dashboards neu zusammen.
# Die Einzelversionen werden NICHT verändert – gepflegt wird weiter dort, dann hier neu zusammenbauen.
#   ./werkzeuge/zusammenbauen.sh
set -euo pipefail
HIER="$(cd "$(dirname "$0")/.." && pwd)"
BAD="$HIER/../Bad Dashboard/Dashboard"
HEIZ="$HIER/../Heizung Dashboard/Dashboard"
V="$(date +%Y%m%d%H%M)"

baue() {   # $1 = Quelle, $2 = Zielordner (bad|heizung), $3 = alter Speicher-Präfix
  local q="$1" z="$HIER/$2" pre="$3"
  rsync -a --delete --exclude ".git" --exclude ".DS_Store" --exclude "werkzeuge/ordner-sync/.env" "$q/" "$z/"
  # Eine Anmeldung für beide Bereiche: Konten + Sitzung gemeinsam, Projekte/Dateien bleiben getrennt
  sed -i '' -e "s/\"$pre:konten\"/\"bruell:konten\"/g" -e "s/\"$pre:sitzung\"/\"bruell:sitzung\"/g" "$z/app/js/daten.js"
  # Bereichs-Umschalter einbinden
  sed -i '' -e "s#</body>#  <link rel=\"stylesheet\" href=\"../gesamt/bereiche.css?v=$V\">\\
  <script src=\"../gesamt/bereiche.js?v=$V\" data-bereich=\"$2\"></script>\\
</body>#" "$z/index.html"
  echo "✓ $2 ← $(cd "$q" && git log -1 --format='%h %s' 2>/dev/null | cut -c1-70)"
}
baue "$BAD"  bad     baddashboard
baue "$HEIZ" heizung heizdashboard
echo "Fertig. Vorschau: python3 -m http.server 8790 → http://localhost:8790/?demo=1"
