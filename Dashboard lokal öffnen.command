#!/bin/bash
# Startet das Brüll Dashboard auf diesem Mac – MIT den vertraulichen Daten (Personal, Kleidung, Fahrzeuge, Fotos),
# die bewusst nicht auf der öffentlichen Seite liegen. Fenster offen lassen, solange das Dashboard benutzt wird.
cd "$(dirname "$0")"
PORT=8790
if ! lsof -i :$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
  sleep 1
fi
open "http://localhost:$PORT/?demo=1"
echo "Brüll Dashboard läuft lokal: http://localhost:$PORT/?demo=1"
echo "Zum Beenden dieses Fenster schließen."
wait
