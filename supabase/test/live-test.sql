-- Anwesenheit (läuft am Ende)
begin; set local role authenticated; select _als('daniel@konto.bad-dashboard.de');
select _pruef('Anwesenheit: allein auf der Seite', anwesenheit_melden('personal/karte.html?nr=901') = '[]'::jsonb);
commit;
begin; set local role authenticated; select _als('moritz@konto.bad-dashboard.de');
select _pruef('Anwesenheit: sieht Daniel auf derselben Seite', (anwesenheit_melden('personal/karte.html?nr=901') -> 0 ->> 'kuerzel') = 'DANIEL');
select _pruef('Anwesenheit: andere Seite → niemand', anwesenheit_melden('lager/') = '[]'::jsonb);
do $$ begin perform count(*) from anwesenheit; perform _pruef('Anwesenheit: Tabelle nicht direkt lesbar', false); exception when others then perform _pruef('Anwesenheit: Tabelle nicht direkt lesbar', true); end $$;
commit;
