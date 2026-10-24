#!/usr/bin/env python3
"""Erzeugt aus einer alten Personalkarte (HTML) die LEERE Vorlage personal/karte.html.
Alle personenbezogenen Werte werden entfernt – übrig bleiben Aufbau, Feld-IDs, Auswahllisten und Funktionen.
  python3 werkzeuge/personalkarte_vorlage.py Personalkarten/Personalkarten_Code/002_Wagner_Steven.html
"""
import re, sys, pathlib, time
VERSION = time.strftime("%Y%m%d%H%M")
from bs4 import BeautifulSoup

quelle = pathlib.Path(sys.argv[1]); ziel = pathlib.Path(__file__).resolve().parent.parent / "personal" / "karte.html"
s = quelle.read_text(encoding="utf8")
soup = BeautifulSoup(s, "html.parser")
haupt = max((x.string or "" for x in soup.find_all("script")), key=len)

main = soup.find("main")
# --- Werte entfernen ---
for el in main.find_all("input"):
    t = (el.get("type") or "text").lower()
    if t in ("checkbox", "radio"): el.attrs.pop("checked", None)
    elif t not in ("file", "button", "submit"): el.attrs.pop("value", None)
for el in main.find_all("option"): el.attrs.pop("selected", None)
for el in main.find_all("textarea"): el.string = ""
for lbl in main.select(".abt-chip-label"): lbl["class"] = [c for c in lbl.get("class", []) if not c.startswith("checked-")]
for tid in ("ak-tbody", "wz-tbody", "bestell-tbody", "bestell-neu-tbody", "kinderListe", "urlaubBody"):
    el = main.find(id=tid)
    if el: el.clear()
for sel in (".header-name", ".header-position", ".header-nr", ".tb-title", ".tb-nr", ".photo-initials"):
    for el in main.select(sel): el.string = ""
img = main.find(id="photoImg")
if img: img["src"] = ""; img["style"] = "display:none"
ph = main.find(id="ph")
if ph: ph["style"] = "display:flex"
for b in main.find_all("button"):
    if "saveData" in (b.get("onclick") or ""): b["class"] = ["btn", "jetzt", "btn-save"]; b.attrs.pop("style", None)
back = main.select_one(".back-btn")
if back: back["href"] = "./"; back.string = "← Personal"

# --- Skript: Personalnummer aus der Adresse, externe Abhängigkeiten weg ---
js = haupt
# Fehler in den Original-Karten: echter Zeilenumbruch in einer Meldung → Skript bricht ab
js = js.replace("Browser-Speicher voll.\nBitte", "Browser-Speicher voll.\\nBitte")
js = re.sub(r"const SK = 'pk_\d+';", "const SK = 'pk_' + PK_NR;", js)
js = re.sub(r"const _\d+ = '\d+';", "const _NR = PK_NR;", js)
js = re.sub(r"\b_\d+\b(?=[),])", "_NR", js)           # BrüllStore.getPhoto(_2) / set('mitarbeiter',_2,d)
js = re.sub(r"'ph_\d+'", "'ph_'+PK_NR", js)
js = re.sub(r"nr:\d+\}", "nr:PK_NR}", js)
assert "pk_2" not in js and "'ph_2'" not in js, "Nummer nicht vollständig ersetzt"

html = f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Brüll · Personalkarte</title>
<link rel="icon" href="../bad/app/img/logo.svg">
<link rel="stylesheet" href="../bad/app/css/app.css?v={VERSION}">
<link rel="stylesheet" href="../gesamt/personal.css?v={VERSION}">
</head>
<body class="personal-seite karte-seite">
<div class="shell">
  <aside class="rail" aria-label="Hauptnavigation" id="rail"></aside>
  {str(main).replace('<main class="main">', '<main class="main pk-main" id="main">', 1)}
</div>
<script src="team.js"></script>
<script>document.write('<script src="daten-lokal.js" onerror="this.remove()"><\\/script>')</script>
<script src="../gesamt/personal.js?v={VERSION}"></script>
<script>
/* ===== Funktionen der Personalkarte (aus der Vorlage übernommen) ===== */
function applyPendingQty() {{}}
{js}
pkKopfAktualisieren();
</script>
</body>
</html>
"""
ziel.write_text(html, encoding="utf8")
print("✓", ziel, len(html), "Zeichen")
