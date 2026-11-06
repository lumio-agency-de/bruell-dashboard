-- ===========================================================================
-- Brüll Dashboard — Bad nur mit Bereich „bad“ (wie Heizung mit „heizung“, siehe heizung.sql)
-- Läuft als LETZTE Datei: schema.sql (Bad) → personal → fahrzeuge → rechte → ablage → heizung → bad-rechte.
-- Wiederholbar. Wer schema.sql erneut einspielt, spielt danach alle folgenden Dateien wieder ein
-- (schema.sql setzt Kontenliste, Regeln usw. auf die Bad-Fassung zurück).
--
-- Bisher hat nur das Menü verhindert, dass jemand ohne Freigabe „Bad“ Bad-Projekte sieht.
-- Jetzt prüft die Datenbank selbst: Projekte, Dateien, Kunden-Links, Einstellungen, Dateiablage
-- und die Partner-Funktionen gehen nur mit darf_bereich('bad'). Admins dürfen immer.
-- Kundenportal (anonym, per Link) bleibt unverändert.
-- ===========================================================================

create or replace function public.bad_darf() returns boolean language sql stable as $$
  select public.darf_bereich('bad')
$$;
create or replace function public.bad_buero() returns boolean language sql stable as $$
  select public.ist_buero() and public.bad_darf()
$$;
revoke all on function public.bad_darf(), public.bad_buero() from public, anon;
grant execute on function public.bad_darf(), public.bad_buero() to authenticated;

-- Projekte
drop policy if exists p_lesen on public.projekte;
create policy p_lesen on public.projekte for select to authenticated
  using (bad_buero() or (bad_darf() and ich_ebene() = 'monteur' and zugewiesen(daten)));
drop policy if exists p_anlegen on public.projekte;
create policy p_anlegen on public.projekte for insert to authenticated with check (bad_buero());
drop policy if exists p_aendern on public.projekte;
create policy p_aendern on public.projekte for update to authenticated
  using (bad_buero() or (bad_darf() and ich_ebene() = 'monteur' and zugewiesen(daten)))
  with check (bad_buero() or (bad_darf() and ich_ebene() = 'monteur' and zugewiesen(daten)));

-- Dateien (Liste) + Dateiablage „akten“
drop policy if exists d_lesen on public.dateien;
create policy d_lesen on public.dateien for select to authenticated using (bad_darf() and darf_datei(projekt_id, kategorie));
drop policy if exists d_anlegen on public.dateien;
create policy d_anlegen on public.dateien for insert to authenticated with check (bad_darf() and darf_hochladen(projekt_id, kategorie));
drop policy if exists d_aendern on public.dateien;
create policy d_aendern on public.dateien for update to authenticated using (bad_buero()) with check (bad_buero());
drop policy if exists d_loeschen on public.dateien;
create policy d_loeschen on public.dateien for delete to authenticated using (bad_buero());

drop policy if exists akten_lesen on storage.objects;
create policy akten_lesen on storage.objects for select to authenticated using (
  bucket_id = 'akten' and bad_darf() and (
    ((storage.foldername(name))[1] = 'projekte' and darf_datei((storage.foldername(name))[2], (storage.foldername(name))[3]))
    or ((storage.foldername(name))[1] = 'kunde' and ist_buero())
  ));
drop policy if exists akten_hochladen on storage.objects;
create policy akten_hochladen on storage.objects for insert to authenticated with check (
  bucket_id = 'akten' and bad_darf() and (storage.foldername(name))[1] = 'projekte'
  and darf_hochladen((storage.foldername(name))[2], (storage.foldername(name))[3]));
drop policy if exists akten_loeschen on storage.objects;
create policy akten_loeschen on storage.objects for delete to authenticated using (bucket_id = 'akten' and bad_buero());

-- Einstellungen (Firma, Team, Partner, Vorlagen) und Kunden-Links
drop policy if exists e_lesen on public.einstellungen;
create policy e_lesen on public.einstellungen for select to authenticated using (bad_darf());
drop policy if exists l_buero on public.upload_links;
create policy l_buero on public.upload_links for all to authenticated using (bad_buero()) with check (bad_buero());

-- Partner: Einsätze nur mit Freigabe „bad“ (Standard für Partner; siehe bereiche_standard in rechte.sql)
create or replace function public.partner_auftraege()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'projektnr', p.daten ->> 'projektnr',
    'phase', (p.daten ->> 'phase')::int,
    'status', p.daten ->> 'status',
    'kunde', jsonb_build_object(
      'anrede', p.daten #>> '{kunde,anrede}', 'vorname', p.daten #>> '{kunde,vorname}', 'nachname', p.daten #>> '{kunde,nachname}',
      'strasse', p.daten #>> '{kunde,strasse}', 'hausnr', p.daten #>> '{kunde,hausnr}', 'ort', p.daten #>> '{kunde,ort}',
      'telefon', p.daten #>> '{kunde,telefon}', 'mobil', p.daten #>> '{kunde,mobil}'),
    'termine', jsonb_build_object('baustart', p.daten #>> '{termine,baustart}', 'abnahme', p.daten #>> '{termine,abnahme}'),
    'formulare', coalesce((select jsonb_object_agg(f, p.daten -> 'formulare' -> f) from unnest(m.formulare) f where p.daten -> 'formulare' ? f), '{}'::jsonb),
    'meldung', p.daten -> 'partnerStatus' -> m.id,
    'ordner', ordner_standard('partner:' || coalesce(partner_gewerk(m.id), '')),
    'geaendert', p.geaendert
  ) order by p.daten #>> '{termine,baustart}'), '[]'::jsonb)
  from projekte p join mitglieder m on m.email = ich_email() and m.ebene = 'partner' and m.aktiv
  where bad_darf() and not p.geloescht and p.daten -> 'zugriff' ? m.id
$$;
revoke all on function public.partner_auftraege() from public, anon;
grant execute on function public.partner_auftraege() to authenticated;

-- Partner-Meldung: Originalfassung aus schema.sql wird zu partner_melden_ohne_bereich umbenannt,
-- unter dem alten Namen (den die App aufruft) prüft eine Hülle vorher die Freigabe.
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'partner_melden_ohne_bereich') then
    alter function public.partner_melden(text, boolean, text) rename to partner_melden_ohne_bereich;
  else
    -- schema.sql wurde erneut eingespielt → neue Fassung übernehmen
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'partner_melden'
               and pg_get_functiondef(p.oid) not like '%partner_melden_ohne_bereich%') then
      drop function public.partner_melden_ohne_bereich(text, boolean, text);
      alter function public.partner_melden(text, boolean, text) rename to partner_melden_ohne_bereich;
    end if;
  end if;
end $$;
create or replace function public.partner_melden(p_projekt text, p_erledigt boolean, p_notiz text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not bad_darf() then return false; end if;
  return partner_melden_ohne_bereich(p_projekt, p_erledigt, p_notiz);
end $$;
revoke all on function public.partner_melden(text, boolean, text), public.partner_melden_ohne_bereich(text, boolean, text) from public, anon;
grant execute on function public.partner_melden(text, boolean, text) to authenticated;
revoke execute on function public.partner_melden_ohne_bereich(text, boolean, text) from authenticated;
