#!/usr/bin/env python3
"""Erzeugt gesamt/dunkel-auto.css: Dunkel-Modus-Ausnahmen für alle Regeln, die Firmen-Navy (--tinte)
als Fläche oder fest Weiß als Hintergrund benutzen. Läuft beim Zusammenbauen automatisch mit.
  python3 werkzeuge/dunkel_css.py
Die Farb-Variablen selbst und Handarbeit stehen in gesamt/thema.css.
"""
import re, pathlib
HIER = pathlib.Path(__file__).resolve().parent.parent
QUELLEN = ["bad/app/css/app.css", "heizung/app/css/app.css", "gesamt/uebersicht.css", "gesamt/personal.css", "gesamt/bereiche.css"]
D = 'html[data-thema="dunkel"]'

def regeln(css):
    """(Selektor, Deklarationen) aller einfachen Regeln – auch innerhalb von @media, ohne @keyframes/@print."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    aus, i, stapel = [], 0, []
    for m in re.finditer(r"([^{}]*)\{([^{}]*)\}|([^{}]*)\{|\}", css):
        if m.group(1) is not None:
            sel = m.group(1).strip()
            if not any(s.startswith(("@keyframes", "@media print")) for s in stapel) and sel and not sel.startswith(("@", "from", "to")) and not re.match(r"^\d+%", sel):
                aus.append((sel, m.group(2)))
        elif m.group(3) is not None: stapel.append(m.group(3).strip())
        elif stapel: stapel.pop()
    return aus

def dunkel(sel):
    return ", ".join(f"{D} {s.strip()}" for s in sel.split(",") if s.strip())

zeilen, gesehen = [], set()
for q in QUELLEN:
    p = HIER / q
    if not p.exists(): continue
    for sel, dekl in regeln(p.read_text(encoding="utf8")):
        neu = []
        bg = re.search(r"background(?:-color)?\s*:\s*([^;]+)", dekl)
        wert = bg.group(1).strip().replace("!important", "").strip() if bg else ""
        if wert == "var(--tinte)": neu.append("background: var(--flaeche-stark)")
        elif re.fullmatch(r"(#fff|#ffffff|white)", wert, re.I): neu.append("background: var(--feld)")
        elif re.fullmatch(r"#fff[0-9a-f]{3}|#f[4-9a-f][0-9a-f]{4}", wert, re.I): neu.append("background: var(--feld-warm)")
        if re.search(r"(?<![-\w])color\s*:\s*var\(--(blatt|papier)\)", dekl): neu.append("color: var(--text-auf-flaeche)")
        if "var(--akzent)" in wert and re.search(r"(?<![-\w])color\s*:\s*var\(--(tinte|text)\)", dekl): neu.append("color: #18181b")
        if not neu: continue
        zeile = f"{dunkel(sel)} {{ {'; '.join(x + ' !important' for x in neu)}; }}"
        if zeile not in gesehen: gesehen.add(zeile); zeilen.append(zeile)

ziel = HIER / "gesamt" / "dunkel-auto.css"
ziel.write_text("/* Automatisch erzeugt von werkzeuge/dunkel_css.py – nicht von Hand ändern. */\n" + "\n".join(zeilen) + "\n", encoding="utf8")
print(f"✓ {len(zeilen)} Regeln → {ziel.relative_to(HIER)}")
