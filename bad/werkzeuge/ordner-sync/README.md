# Ordner-Sync

Hält einen ganz normalen Ordner (auf dem NAS oder Büro-PC) mit dem Dashboard abgeglichen.
Damit gibt es beides: die Projektordner im Dashboard **und** eine sichtbare Ordnerstruktur im Explorer.

```
Projekte Bad/
├── _Eingang Palette/               ← Palette CAD speichert Exposé, Angebot, Renderings hierhin
├── B-2026-014_Kaufmann_Karin/
│   ├── 01 Bilder alt/               ← Kunden-Uploads erscheinen hier automatisch
│   ├── 04 Planung & Renderings/
│   ├── 09 Exposé/
│   └── …
```

- **Dashboard → Ordner:** Jede Datei im Dashboard (auch vom Kunden-Link) wird in den passenden Ordner kopiert.
- **Ordner → Dashboard:** Was jemand in einen Projektordner legt, erscheint nach spätestens einer Minute im Dashboard (als „neu“ markiert).
- **Palette-Eingang:** Steht die Projektnummer im Dateinamen (`B-2026-014 Exposé.pdf`), wird die Datei dem Projekt zugeordnet und einsortiert: „Exposé“ → Exposé, „Angebot“ → Angebote, alles andere → Planung & Renderings. Dateien ohne erkennbare Projektnummer bleiben im Eingang liegen.
- **Gelöscht wird nie automatisch**, weder im Ordner noch im Dashboard.

## Einrichten

1. Node.js 18 oder neuer installieren. Auf Synology geht das über das Paketzentrum oder Docker.
2. Neben dieser Datei eine `.env` anlegen:
   ```
   SUPABASE_URL=https://<server-adresse>
   SUPABASE_SERVICE_KEY=<service_role key>
   ```
   Der Service-Key hat Vollzugriff. Er bleibt nur auf diesem Gerät und gehört nie ins Dashboard oder auf GitHub.
3. Starten:
   ```
   node ordner-sync.mjs --wurzel "/volume1/Projekte Bad"
   ```
   Mit `--einmal` läuft nur ein einziger Abgleich, gut zum Testen.
4. Als Dienst einrichten, damit es nach einem Neustart weiterläuft (Synology: Aufgabenplaner → „Beim Hochfahren“).

Die Ordnernamen kommen aus `einstellungen/ablauf.js` (`KATEGORIEN`), also aus derselben Liste wie im Dashboard.
Der Abgleich-Stand liegt in `.ordner-sync.json` im Wurzelordner. Die Datei nicht löschen, sonst wird alles neu kopiert.
