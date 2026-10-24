# Cloud einrichten (Supabase)

Damit alle Arbeitsplätze dieselben Projekte sehen und Kunden von überall hochladen
können, braucht das Dashboard einen kleinen Server mit Datenbank und Dateispeicher.
Dafür nehmen wir **Supabase** (Server in Frankfurt wählbar). Einmalig ca. 20 Minuten.

## 1. Projekt anlegen

1. Auf <https://supabase.com> ein Konto anlegen (am besten mit der Firmen-E-Mail).
2. **New project** → Name z. B. `bad-dashboard`, **Region: Frankfurt (eu-central-1)**,
   ein starkes Datenbank-Passwort vergeben und sicher ablegen.
3. Tarif: Für den Start reicht **Free** (500 MB Datenbank, 1 GB Dateien). Bei vielen
   Fotos später auf **Pro** (ca. 25 $/Monat, 100 GB Dateien) wechseln.
   Hinweis: Free-Projekte werden nach 7 Tagen ohne Nutzung pausiert — im Alltag kein Problem.

## 2. Datenbank einrichten

**SQL Editor** → **New query** → den kompletten Inhalt von `schema.sql` einfügen →
**Run**. Das legt Tabellen, Dateispeicher und alle Zugriffsregeln an.

## 3. Ersten Zugang anlegen

Unter **Authentication → Sign In / Providers** die öffentliche Registrierung
(**Allow new users to sign up**) **ausschalten** — Konten vergibt nur die Geschäftsführung.

Dann einmalig im SQL Editor den Geschäftsführer-Zugang anlegen (Werte anpassen):

```sql
select public.erster_zugang('daniel', 'Start-Passwort-123', 'DB', 'Daniel Brüll');
```

Benutzername, Startpasswort (mind. 8 Zeichen), Kürzel aus dem Team, Name. Das geht nur,
solange es noch keinen Geschäftsführer-Zugang gibt. Beim ersten Anmelden wird ein eigenes
Passwort verlangt. **Alle weiteren Zugänge** legt die Geschäftsführung danach direkt im
Dashboard unter **Konten** an — ohne Supabase-Oberfläche.

Benutzernamen ohne „@“ werden intern zu `name@konto.bad-dashboard.de`; es wird keine
E-Mail verschickt. Gesperrte Konten können sich nicht mehr anmelden und sehen nichts.

## 4. Zugangsdaten eintragen

**Project Settings → API**: *Project URL* und den *anon / publishable key* kopieren
und in `einstellungen/firma.js` eintragen:

```js
cloud: {
  url: "https://xxxx.supabase.co",
  anonKey: "eyJ…",
  portalUrl: "https://www.ihre-firma.de/bad/kunde.html",
},
```

Der anon-Key ist öffentlich gedacht — geschützt wird über Login und die Regeln aus
`schema.sql`. **Niemals** den `service_role`/`secret`-Key eintragen.

Zum schnellen Testen geht es auch ohne Datei: *Einrichtung → Cloud verbinden*
(gilt dann nur für diesen Browser).

## 5. Online stellen

Damit Kunden ihren Link öffnen können, muss der Ordner (mindestens `kunde.html`,
`einstellungen/`, `app/`) über **https** erreichbar sein, z. B.:

- als Unterordner auf dem eigenen Webspace (IONOS o. ä.) per FTP hochladen, oder
- kostenlos über Netlify / Cloudflare Pages / GitHub Pages.

Das Dashboard (`index.html`) kann im selben Ordner liegen — es ist ohne Login nutzlos.
Danach `portalUrl` auf die echte Adresse von `kunde.html` setzen.

## 6. Datenschutz (DSGVO)

- In Supabase unter **Organization → Legal Documents** den **Auftragsverarbeitungsvertrag
  (DPA)** abschließen.
- In der Datenschutzerklärung der Website ergänzen: Upload-Portal, Speicherung bei
  Supabase (Server Frankfurt), Zweck = Planung und Ausführung des Bauvorhabens,
  Löschung nach Projektabschluss gemäß Aufbewahrungsfristen.
- Kundenlinks sind 180 Tage gültig und lassen nur Hochladen zu — niemand kann damit
  Projekte oder fremde Dateien sehen.

## Sicherung

Supabase sichert die Datenbank täglich (Pro: 7 Tage rückwirkend). Zusätzlich im
Dashboard unter *Einrichtung → Projekte sichern (JSON)* regelmäßig eine Kopie ziehen.

## Getestet

Schema, Konten (Ersteinrichtung, Anlegen im Dashboard, Pflicht-Passwortwechsel, Zurücksetzen, Sperren), Login, alle vier Ebenen (Geschäftsführung, Planung, Monteur, Partner),
Team-, Monteur-, Partner- und Kunden-Uploads sowie die Sperren (kein Lesen ohne Ebene,
Monteur ohne Angebote/Rechnungen, Partner nur Auszug, kein Upload mit falschem Link)
wurden gegen einen lokalen Supabase-Server geprüft.
