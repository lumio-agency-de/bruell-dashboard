-- Rechte je Konto (läuft nach personal-test.sql + fahrzeuge-test.sql; Konten daniel/max/erika/moritz)
begin; set local role authenticated; select _als('daniel@konto.bad-dashboard.de');
select konto_aktiv('max@konto.bad-dashboard.de', true);
select _pruef('Standard Monteur: Übersicht/Bad/Heizung', (select k->'bereicheWirksam' from jsonb_array_elements(konten_liste()) k where k->>'benutzer' = 'moritz') = '["uebersicht","bad","heizung"]');
select konto_bereiche('moritz@konto.bad-dashboard.de', array['uebersicht','fahrzeuge','personal']);
select _pruef('Admin setzt Bereiche', (select k->'bereiche' from jsonb_array_elements(konten_liste()) k where k->>'benutzer' = 'moritz') = '["uebersicht","fahrzeuge","personal"]');
commit;
-- Moritz (Monteur) mit Freigabe Fahrzeuge + Personal
begin; set local role authenticated; select _als('moritz@konto.bad-dashboard.de');
select _pruef('Freigabe Fahrzeuge: Fahrzeuge lesen', (select count(*) from fahrzeuge) = 1);
update fahrzeuge set daten = '{}' where nr = '1';
select _pruef('Freigabe Fahrzeuge: Fahrzeug-Dokumente lesen', (select count(*) from storage.objects where bucket_id = 'fahrzeuge') = 1);
do $$ begin insert into fahrzeuge (nr, daten) values ('8', '{}'); perform _pruef('Nicht-Admin: Fahrzeug anlegen gesperrt', false); exception when others then perform _pruef('Nicht-Admin: Fahrzeug anlegen gesperrt', true); end $$;
select _pruef('Freigabe Personal: alle Karten, ohne interne Felder', jsonb_array_length(personal_alle()) = 2 and not exists (select 1 from jsonb_array_elements(personal_alle()) x where x->'daten' ?| array['stars_fach','sonstnotiz','bew_notiz']));
select _pruef('Freigabe Personal: Fotos/Dokumente, keine Lohnzettel', exists (select 1 from storage.objects where name = 'dokumente/902/zeugnis.pdf') and not exists (select 1 from storage.objects where name like 'lohnzettel/%'));
select _pruef('Freigabe Personal: Karten direkt ändern gesperrt', (select count(*) from personal) = 0);
do $$ begin perform konto_bereiche('moritz@konto.bad-dashboard.de', array['betrieb']); perform _pruef('Nicht-Admin: Rechte ändern gesperrt', false); exception when others then perform _pruef('Nicht-Admin: Rechte ändern gesperrt', true); end $$;
commit;
select _pruef('Fahrzeug unverändert nach Nicht-Admin-Versuch', (select daten ->> 'fz_kennzeichen' from fahrzeuge where nr = '1') = 'BB-XX 1');
-- Max (Mitarbeiter, Standard = nichts): keine Freigaben
begin; set local role authenticated; select _als('max@konto.bad-dashboard.de');
select _pruef('Mitarbeiter ohne Freigabe: keine Fahrzeuge', (select count(*) from fahrzeuge) = 0);
do $$ begin perform personal_alle(); perform _pruef('Mitarbeiter ohne Freigabe: Personal-Liste gesperrt', false); exception when others then perform _pruef('Mitarbeiter ohne Freigabe: Personal-Liste gesperrt', true); end $$;
select _pruef('Mitarbeiter: meine_bereiche leer, eigene Karte weiter da', meine_bereiche() = array[]::text[] and (meine_personalkarte() ->> 'nr') = '901');
commit;
