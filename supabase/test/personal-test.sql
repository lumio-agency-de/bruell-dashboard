-- Zugriffsregeln Personal prüfen. Aufruf: sh test/pruefen.sh  → jede Zeile OK/FEHLER
\set QUIET on
\pset tuples_only on
\pset format unaligned
-- Hilfen: als Konto handeln / Ergebnis prüfen
create or replace function public._als(e text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('email', e, 'role', 'authenticated')::text, true); end $$;
create table if not exists public._erg (n serial, txt text);
grant all on public._erg, public._erg_n_seq to authenticated, anon;
create or replace function public._pruef(name text, ok boolean) returns void language sql as $$ insert into public._erg (txt) values ((case when ok then 'OK     ' else 'FEHLER ' end) || name) $$;

-- Aufbau (Wartung/Postgres + Geschäftsführung)
select erster_zugang('daniel', 'Start12345', 'DB', 'Daniel Brüll');
begin; set local role authenticated; select _als('daniel@konto.bad-dashboard.de');
select konto_anlegen('max', 'Start12345', 'pk-901', 'mitarbeiter', 'Max Muster');
select konto_anlegen('erika', 'Start12345', 'pk-902', 'mitarbeiter', 'Erika Beispiel');
select konto_anlegen('moritz', 'Start12345', 'MO', 'monteur', 'Moritz Monteur');
select konto_personal('max@konto.bad-dashboard.de', '901', false);
select konto_personal('erika@konto.bad-dashboard.de', '902', true);
insert into personal (nr, daten) values
 ('901', '{"vorname":"Max","nachname":"Muster","position":"Monteur","weiterbildung":"Schweißkurs","stars_fach":4,"bew_notiz":"intern","sonstnotiz":"geheim","_dokumente":"[]"}'),
 ('902', '{"vorname":"Erika","nachname":"Beispiel","position":"Büro","stars_team":5,"sonstnotiz":"geheim2"}');
select _pruef('GF sieht alle Karten', (select count(*) from personal) = 2);
select _pruef('GF sieht interne Felder', (select daten ? 'sonstnotiz' from personal where nr = '901'));
select _pruef('GF: Kontenliste mit Personalkarte + Freigabe', (select count(*) from jsonb_array_elements(konten_liste()) k where k->>'pk' = '902' and (k->>'lohnzettel')::boolean) = 1);
commit;
insert into storage.objects (bucket_id, name) values ('personal', 'foto/901/foto'), ('personal', 'dokumente/901/vertrag.pdf'),
  ('personal', 'dokumente/902/zeugnis.pdf'), ('personal', 'lohnzettel/901/2026-01.pdf'), ('personal', 'lohnzettel/902/2026-01.pdf'), ('akten', 'projekte/x/planung/a.pdf');

-- Mitarbeiter Max (Nr. 901)
begin; set local role authenticated; select _als('max@konto.bad-dashboard.de');
select _pruef('Max: keine Karte direkt aus der Tabelle', (select count(*) from personal) = 0);
select _pruef('Max: eigene Karte über meine_personalkarte()', (meine_personalkarte() ->> 'nr') = '901');
select _pruef('Max: Name und Weiterbildung sichtbar', (meine_personalkarte() -> 'daten' ->> 'vorname') = 'Max' and (meine_personalkarte() -> 'daten' ->> 'weiterbildung') = 'Schweißkurs');
select _pruef('Max: Bewertung + Notizen ausgeblendet', not (meine_personalkarte() -> 'daten' ?| array['stars_fach', 'bew_notiz', 'sonstnotiz']));
select _pruef('Max: Fotoliste nur eigenes Foto', (select array_agg(k) from jsonb_object_keys(personal_fotos()) k) = array['901']);
update personal set daten = '{}' where nr = '901';
select _pruef('Max: Dateien nur eigene (Foto, Dokument, Lohnzettel)', (select array_agg(name order by name) from storage.objects) = array['dokumente/901/vertrag.pdf', 'foto/901/foto', 'lohnzettel/901/2026-01.pdf']);
commit;
select _pruef('Max konnte die Karte NICHT ändern', (select daten ->> 'vorname' from personal where nr = '901') = 'Max');
begin; set local role authenticated; select _als('max@konto.bad-dashboard.de');
savepoint a; do $$ begin perform personal_namen(); perform _pruef('Max: Namensliste gesperrt', false); exception when others then perform _pruef('Max: Namensliste gesperrt', true); end $$;
do $$ begin insert into storage.objects (bucket_id, name) values ('personal', 'lohnzettel/901/fake.pdf'); perform _pruef('Max: Hochladen gesperrt', false); exception when others then perform _pruef('Max: Hochladen gesperrt', true); end $$;
do $$ begin perform konto_personal('max@konto.bad-dashboard.de', '902', true); perform _pruef('Max: sich selbst umhängen/freigeben gesperrt', false); exception when others then perform _pruef('Max: sich selbst umhängen/freigeben gesperrt', true); end $$;
commit;

-- Erika (Nr. 902, Lohnzettel-Freigabe)
begin; set local role authenticated; select _als('erika@konto.bad-dashboard.de');
select _pruef('Erika: keine Karten direkt', (select count(*) from personal) = 0);
select _pruef('Erika: Namensliste (2 Einträge, ohne Details)', jsonb_array_length(personal_namen()) = 2 and not (personal_namen() -> 0 ? 'daten'));
select _pruef('Erika: Lohnzettel-Liste für Max setzen', lohnzettel_liste_setzen('901', '{"2026-02":"lz-2026-02"}'));
select _pruef('Erika: sieht eigene Dateien + alle Lohnzettel', (select array_agg(name order by name) from storage.objects) = array['dokumente/902/zeugnis.pdf', 'lohnzettel/901/2026-01.pdf', 'lohnzettel/902/2026-01.pdf']);
insert into storage.objects (bucket_id, name) values ('personal', 'lohnzettel/901/2026-02.pdf');
select _pruef('Erika: Lohnzettel für Max hochgeladen', true);
do $$ begin insert into storage.objects (bucket_id, name) values ('personal', 'foto/901/neu.jpg'); perform _pruef('Erika: Foto fremder Karte gesperrt', false); exception when others then perform _pruef('Erika: Foto fremder Karte gesperrt', true); end $$;
do $$ begin insert into storage.objects (bucket_id, name) values ('personal', 'dokumente/901/x.pdf'); perform _pruef('Erika: Dokument fremder Karte gesperrt', false); exception when others then perform _pruef('Erika: Dokument fremder Karte gesperrt', true); end $$;
commit;
select _pruef('Lohnzettel-Liste bei Max angekommen, Rest unverändert', (select daten ->> '_lohnzettel' = '{"2026-02":"lz-2026-02"}' and daten ->> 'sonstnotiz' = 'geheim' from personal where nr = '901'));

-- Monteur ohne Personalkarte
begin; set local role authenticated; select _als('moritz@konto.bad-dashboard.de');
select _pruef('Monteur ohne Karte: nichts', meine_personalkarte() is null and (select count(*) from personal) = 0 and (select count(*) from storage.objects where bucket_id = 'personal') = 0);
commit;
-- Nicht angemeldet
begin; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select _pruef('Ohne Anmeldung: keine Karte, keine Dateien', (select count(*) from personal) = 0 and (select count(*) from storage.objects where bucket_id = 'personal') = 0);
do $$ begin perform meine_personalkarte(); perform _pruef('Ohne Anmeldung: Funktion gesperrt', false); exception when others then perform _pruef('Ohne Anmeldung: Funktion gesperrt', true); end $$;
commit;
-- Gesperrtes Konto
begin; set local role authenticated; select _als('daniel@konto.bad-dashboard.de'); select konto_aktiv('max@konto.bad-dashboard.de', false); commit;
begin; set local role authenticated; select _als('max@konto.bad-dashboard.de');
select _pruef('Gesperrter Max: keine Karte, keine Dateien', meine_personalkarte() is null and (select count(*) from storage.objects where bucket_id = 'personal') = 0);
commit;

\pset tuples_only on
select txt from public._erg order by n;
insert into projekte (id, daten) values ('p1', '{}'); insert into upload_links (token, projekt_id) values ('tok123', 'p1');
begin; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into storage.objects (bucket_id, name) values ('akten', 'kunde/tok123/fotos/bad.jpg');
select _pruef('Kunden-Upload (anon, Bad) weiterhin möglich', true);
commit;
select txt from public._erg where n > (select max(n) - 1 from public._erg);
