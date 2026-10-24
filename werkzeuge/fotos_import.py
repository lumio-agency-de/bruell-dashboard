#!/usr/bin/env python3
"""Übernimmt Mitarbeiterfotos aus einem Ordner (z. B. „Mitarbeiter/Wagner Steven/Steven_Wagner.jpg“)
in personal/fotos-lokal.js – quadratisch zugeschnitten, nur lokal (.gitignore), nie ins Repo.
  python3 werkzeuge/fotos_import.py Mitarbeiter
Zuordnung über Vor- und Nachname im Ordner- oder Dateinamen. Fotos mit „ph_“ (in der Karte hochgeladen) haben Vorrang.
"""
import base64, io, json, re, subprocess, sys, tempfile, pathlib, unicodedata
from PIL import Image, ImageOps

HIER = pathlib.Path(__file__).resolve().parent.parent
QUELLE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else HIER / "Mitarbeiter")
ZIEL = HIER / "personal" / "fotos-lokal.js"

def glatt(s):
    s = s.lower().replace("ß", "ss").replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s)

src = (HIER / "personal" / "daten-lokal.js").read_text(encoding="utf8")
pk = json.loads(re.search(r"window\.PK_VOLL = (\{.*?\});\s*$", src, re.M | re.S).group(1))
fotos, ohne = {}, []
bilder = [p for p in QUELLE.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".heic", ".webp") and not p.name.startswith(".")]
for nr, d in pk.items():
    v, n = glatt(d.get("vorname", "")), glatt(d.get("nachname", ""))
    treffer = [p for p in bilder if v and n and v in glatt(str(p.relative_to(QUELLE))) and n in glatt(str(p.relative_to(QUELLE)))]
    if not treffer: ohne.append(f"{d.get('vorname', '')} {d.get('nachname', '')}".strip()); continue
    p = max(treffer, key=lambda x: x.stat().st_size)          # größte Datei = beste Qualität
    try:
        if p.suffix.lower() == ".heic":                           # iPhone-Fotos: mit macOS „sips“ umwandeln
            tmp = pathlib.Path(tempfile.mkdtemp()) / "foto.jpg"
            subprocess.run(["sips", "-s", "format", "jpeg", str(p), "--out", str(tmp)], check=True, capture_output=True)
            im = ImageOps.exif_transpose(Image.open(tmp)).convert("RGB")
        else:
            im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
    except Exception as e:
        ohne.append(f"{d.get('vorname', '')} {d.get('nachname', '')} (Datei nicht lesbar: {p.name})"); continue
    w, h = im.size; s = min(w, h)
    oben = int((h - s) * 0.15)                                # Hochformat: Kopf sitzt oben → etwas höher schneiden
    im = im.crop(((w - s) // 2, oben, (w - s) // 2 + s, oben + s)).resize((400, 400), Image.LANCZOS)
    puf = io.BytesIO(); im.save(puf, "JPEG", quality=82, optimize=True)
    fotos[nr] = "data:image/jpeg;base64," + base64.b64encode(puf.getvalue()).decode()

ZIEL.write_text("/* VERTRAULICH – interne Mitarbeiterfotos. Nur lokal, niemals ins Repo (steht in .gitignore). */\n"
                + "window.PK_FOTOS = " + json.dumps(fotos) + ";\n", encoding="utf8")
ZIEL.chmod(0o600)
print(f"✓ {len(fotos)} Fotos → {ZIEL.name}" + (f"\n  nicht im Ordner gefunden (Website-Foto bleibt, wo vorhanden): {', '.join(ohne)}" if ohne else ""))
