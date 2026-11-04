-- ===========================================================================
-- Brüll Dashboard — Personal (Personalkarten, Fotos, Dokumente, Lohnzettel)
-- Läuft NACH Bad Dashboard/Dashboard/supabase/schema.sql (Konten, ich_email(), ist_gf() …).
-- Kann erneut ausgeführt werden (Aktualisierung) — Daten bleiben erhalten.
--
-- Wer darf was?
--   geschaeftsfuehrung   alle Personalkarten lesen/bearbeiten, alle Dateien
--   alle anderen Konten  nur die EIGENE Karte (mitglieder.pk), nur lesen, ohne interne Felder
--                        (Bewertung, Sonstige Notizen); eigene Fotos/Dokumente/Lohnzettel lesen
--   Freigabe lohnzettel  zusätzlich: Lohnzettel für alle hochladen (Namensliste ohne Details)
--
-- Speicherformat wie im Browser: eine Zeile je Karte, daten = Inhalt von pk_<Nr> (jsonb).
-- Dateien im privaten Bucket „personal“:  <art>/<Nr>/<Datei>,  art = foto | dokumente | lohnzettel
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Konten: Ebene „mitarbeiter“, Verknüpfung zur Personalkarte, Freigabe Lohnzettel
-- ---------------------------------------------------------------------------
alter table public.mitglieder drop constraint if exists mitglieder_ebene_check;
alter table public.mitglieder add constraint mitglieder_ebene_check
  check (ebene in ('geschaeftsfuehrung', 'planung', 'monteur', 'partner', 'mitarbeiter'));
alter table public.mitglieder add column if not exists pk text;                 -- Personalnummer der eigenen Karte
alter table public.mitglieder add column if not exists lohnzettel boolean not null default false;

create or replace function public.ich_pk() returns text language sql stable security definer set search_path = public as $$
  select pk from mitglieder where email = ich_email() and aktiv
$$;
create or replace function public.darf_lohnzettel() returns boolean language sql stable security definer set search_path = public as $$
  select ist_gf() or coalesce((select lohnzettel from mitglieder where email = ich_email() and aktiv), false)
$$;
revoke all on function public.ich_pk() from public, anon;
revoke all on function public.darf_lohnzettel() from public, anon;
grant execute on function public.ich_pk(), public.darf_lohnzettel() to authenticated;

-- Konto ↔ Personalkarte verknüpfen und Lohnzettel-Freigabe setzen (nur Geschäftsführung)
create or replace function public.konto_personal(p_email text, p_pk text, p_lohnzettel boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not ist_gf() then raise exception 'nicht erlaubt'; end if;
  if p_pk is not null and p_pk !~ '^[0-9]+$' then raise exception 'ungültige Personalnummer'; end if;
  update mitglieder set pk = nullif(p_pk, ''), lohnzettel = coalesce(p_lohnzettel, false) where email = lower(p_email);
  return found;
end $$;
revoke all on function public.konto_personal(text, text, boolean) from public, anon;
grant execute on function public.konto_personal(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Personalkarten
-- ---------------------------------------------------------------------------
create table if not exists public.personal (
  nr        text primary key check (nr ~ '^[0-9]+$'),
  daten     jsonb  not null default '{}'::jsonb,
  geaendert bigint not null default 0,
  geloescht boolean not null default false
);
alter table public.personal enable row level security;

-- Direkt auf die Tabelle nur die Geschäftsführung; alle anderen über die Funktionen unten
drop policy if exists pe_gf on public.personal;
create policy pe_gf on public.personal for all to authenticated using (ist_gf()) with check (ist_gf());

-- Interne Felder (Reiter „Bewertung“ + „Sonstige Notizen“) – sieht nur die Geschäftsführung
create or replace function public.personal_ohne_intern(d jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  from jsonb_each(d) as e(k, v)
  where k not like 'stars\_%' and k not in ('bew_datum', 'bew_notiz', 'sonstnotiz')
$$;

-- Eigene Personalkarte (nur lesen, ohne interne Felder)
create or replace function public.meine_personalkarte() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nr', p.nr, 'daten', personal_ohne_intern(p.daten), 'geaendert', p.geaendert)
  from personal p where p.nr = ich_pk() and not p.geloescht
$$;

-- Namensliste für die Lohnzettel-Freigabe (keine weiteren Personaldaten)
create or replace function public.personal_namen() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not darf_lohnzettel() then raise exception 'nicht erlaubt'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('nr', nr, 'vorname', daten ->> 'vorname', 'nachname', daten ->> 'nachname',
      'position', daten ->> 'position', 'lohnzettel', daten -> '_lohnzettel') order by nr::int)
    from personal where not geloescht), '[]'::jsonb);
end $$;

-- Lohnzettel-Liste einer Karte setzen (d._lohnzettel, wie im Browser als JSON-Text gespeichert)
create or replace function public.lohnzettel_liste_setzen(p_nr text, p_liste text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not darf_lohnzettel() then raise exception 'nicht erlaubt'; end if;
  if p_liste is not null and jsonb_typeof(p_liste::jsonb) <> 'object' and jsonb_typeof(p_liste::jsonb) <> 'array' then raise exception 'ungültige Liste'; end if;
  update personal set daten = daten || jsonb_build_object('_lohnzettel', p_liste), geaendert = (extract(epoch from now()) * 1000)::bigint
  where nr = p_nr and not geloescht;
  return found;
end $$;

revoke all on function public.meine_personalkarte() from public, anon;
revoke all on function public.personal_namen() from public, anon;
revoke all on function public.lohnzettel_liste_setzen(text, text) from public, anon;
grant execute on function public.meine_personalkarte() to authenticated;
grant execute on function public.personal_namen() to authenticated;
grant execute on function public.lohnzettel_liste_setzen(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Dateien: privater Bucket „personal“   <art>/<Nr>/<Datei>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('personal', 'personal', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists personal_lesen on storage.objects;
create policy personal_lesen on storage.objects for select to authenticated using (
  bucket_id = 'personal' and (
    ist_gf()
    or ((storage.foldername(name))[1] in ('foto', 'dokumente', 'lohnzettel') and (storage.foldername(name))[2] = ich_pk())
    or ((storage.foldername(name))[1] = 'lohnzettel' and darf_lohnzettel())
  ));
drop policy if exists personal_hochladen on storage.objects;
create policy personal_hochladen on storage.objects for insert to authenticated with check (
  bucket_id = 'personal' and (
    ist_gf()
    or ((storage.foldername(name))[1] = 'lohnzettel' and darf_lohnzettel())
  ));
drop policy if exists personal_aendern on storage.objects;
create policy personal_aendern on storage.objects for update to authenticated
  using (bucket_id = 'personal' and (ist_gf() or ((storage.foldername(name))[1] = 'lohnzettel' and darf_lohnzettel())))
  with check (bucket_id = 'personal' and (ist_gf() or ((storage.foldername(name))[1] = 'lohnzettel' and darf_lohnzettel())));
drop policy if exists personal_loeschen on storage.objects;
create policy personal_loeschen on storage.objects for delete to authenticated using (
  bucket_id = 'personal' and (ist_gf() or ((storage.foldername(name))[1] = 'lohnzettel' and darf_lohnzettel())));
