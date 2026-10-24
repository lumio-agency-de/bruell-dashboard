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
  # Weißer Hintergrund statt Karo (auch auf der Kunden-Upload-Seite)
  sed -i '' -e 's#^  background-color: var(--papier);$#  background-color: \#fff;#' -e '/background-image: linear-gradient(var(--fuge) 1px, transparent 1px), linear-gradient(90deg/d' -e '/^  background-size: 44px 44px; background-position: -1px -1px;$/d' "$z/app/css/app.css"
  # Hell/Dunkel-Umschalter (im Kopf, damit nichts aufblitzt)
  sed -i '' -e "s#</head>#  <link rel=\"stylesheet\" href=\"../gesamt/dunkel-auto.css?v=$V\">\\
  <link rel=\"stylesheet\" href=\"../gesamt/thema.css?v=$V\">\\
  <script src=\"../gesamt/thema.js?v=$V\"></script>\\
</head>#" "$z/index.html"
  # Bereichs-Umschalter einbinden
  sed -i '' -e "s#</body>#  <link rel=\"stylesheet\" href=\"../gesamt/bereiche.css?v=$V\">\\
  <script src=\"../gesamt/bereiche.js?v=$V\" data-bereich=\"$2\"></script>\\
</body>#" "$z/index.html"
  echo "✓ $2 ← $(cd "$q" && git log -1 --format='%h %s' 2>/dev/null | cut -c1-70)"
}
baue "$BAD"  bad     baddashboard
baue "$HEIZ" heizung heizdashboard
python3 "$HIER/werkzeuge/dunkel_css.py"
echo "Fertig. Vorschau: python3 -m http.server 8790 → http://localhost:8790/?demo=1"
