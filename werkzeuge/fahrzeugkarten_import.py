#!/usr/bin/env python3
"""Ergänzt die Fahrzeuge (window.FZ_VOLL in personal/daten-lokal.js) um die Daten der alten Fahrzeugkarten
(z. B. „fahrzeuge/002_Wagner_BBDB2655.html“): Führerschein, Leasing, Steuer, Versicherung, DKV-Karte.
  python3 werkzeuge/fahrzeugkarten_import.py fahrzeuge
Zuordnung über das Kennzeichen; Fahrzeuge, die es noch nicht gibt, werden mit der Nummer aus dem Dateinamen angelegt.
Der neue Datenstand wird beim nächsten Öffnen des Dashboards in den Browser übernommen. Nur lokal (.gitignore).
"""
import json, re, sys, time, pathlib
from html.parser import HTMLParser

HIER = pathlib.Path(__file__).resolve().parent.parent
QUELLE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else HIER / "fahrzeuge")
ZIEL = HIER / "personal" / "daten-lokal.js"

# Felder der alten Karte → Felder der neuen Fahrzeugkarte (gesamt/fahrzeuge.js)
FELDER = ["fz_kennzeichen", "fz_modell", "fz_fahrer", "fz_fuehrerschein", "fz_fs_gueltig", "fz_leasingrate", "fz_steuer", "fz_leasing_nr",
          "fz_leasing_ende", "fz_vers_beitrag", "fz_vers_nr", "fz_versicherungsgeber", "fz_dkv", "fz_tuev", "fz_km", "fz_schaeden"]

class Karte(HTMLParser):
    """liest die vorausgefüllten Felder (value="…", ausgewählte Option, Textarea-Inhalt)"""
    def __init__(self):
        super().__init__(); self.d = {}; self.select = self.textarea = None; self.option = None
    def handle_starttag(self, tag, a):
        a = dict(a); i = a.get("id") or ""
        if tag == "input" and i.startswith("fz_") and a.get("type") != "checkbox": self.d[i] = (a.get("value") or "").strip()
        if tag == "select" and i.startswith("fz_"): self.select = i
        if tag == "option" and self.select: self.option = ("selected" in a, a.get("value"))
        if tag == "textarea" and i.startswith("fz_"): self.textarea = i; self.d[i] = ""
    def handle_data(self, x):
        if self.textarea: self.d[self.textarea] += x
        if self.select and self.option and self.option[0]: self.d[self.select] = (self.option[1] if self.option[1] is not None else x).strip()
    def handle_endtag(self, tag):
        if tag == "textarea": self.textarea = None
        if tag == "select": self.select = None
        if tag == "option": self.option = None

kennz = lambda s: re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
src = ZIEL.read_text(encoding="utf8")
pk = json.loads(re.search(r"window\.PK_VOLL = (\{.*?\});\s*$", src, re.M | re.S).group(1))
m = re.search(r"window\.FZ_VOLL = (\{.*?\});\s*$", src, re.M | re.S)
fz = json.loads(m.group(1)) if m else {}
personen = {(d.get("vorname", "") + " " + d.get("nachname", "")).strip().lower(): (d.get("vorname", "") + " " + d.get("nachname", "")).strip() for d in pk.values()}

neu, ergaenzt = [], []
for f in sorted(QUELLE.glob("[0-9][0-9][0-9]_*.html")):
    k = Karte(); k.feed(f.read_text(encoding="utf8")); d = k.d
    if not d.get("fz_kennzeichen"): continue
    werte = {x: d[x] for x in FELDER if d.get(x) not in (None, "")}
    if d.get("fz_kategorie"): werte["fz_typ"] = d["fz_kategorie"]
    if werte.get("fz_leasingrate") == "Eigentum": werte.pop("fz_leasingrate"); werte["fz_status"] = "Eigentum"
    elif werte.get("fz_leasing_nr"): werte["fz_status"] = "Leasing"
    if werte.get("fz_dkv"): werte["fz_tankkarte"] = "Ja"
    if werte.get("fz_fahrer"): werte["fz_fahrer"] = personen.get(werte["fz_fahrer"].lower(), werte["fz_fahrer"])   # Schreibweise der Personalkarte
    nr = next((n for n, x in fz.items() if kennz(x.get("fz_kennzeichen")) == kennz(werte["fz_kennzeichen"])), None)
    if nr is None:
        nr = str(int(f.name[:3])); fz[nr] = {"fz_nr_intern": nr.zfill(3)}; neu.append(werte["fz_kennzeichen"])
    else: ergaenzt.append(werte["fz_kennzeichen"])
    if fz[nr].get("fz_fahrer") and not d.get("fz_fahrer"): werte.pop("fz_fahrer", None)             # Excel-Zuordnung (z. B. „Anhänger Bad“) bleibt
    fz[nr].update(werte)

stand = time.strftime("%Y%m%d%H%M%S")
src = (src.replace(m.group(0), "window.FZ_VOLL = " + json.dumps(fz, ensure_ascii=False) + ";") if m
       else src + "window.FZ_VOLL = " + json.dumps(fz, ensure_ascii=False) + ";\n")
src = re.sub(r'window\.DATEN_STAND = "[^"]*";', f'window.DATEN_STAND = "{stand}";', src) if "window.DATEN_STAND" in src else src + f'window.DATEN_STAND = "{stand}";\n'
ZIEL.write_text(src, encoding="utf8"); ZIEL.chmod(0o600)
print(f"✓ {len(ergaenzt)} Fahrzeuge ergänzt" + (f", {len(neu)} neu angelegt ({', '.join(neu)})" if neu else "") + f" → {ZIEL.name} (Stand {stand})")
