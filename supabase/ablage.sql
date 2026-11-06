-- ===========================================================================
-- Brüll Dashboard — Ablage: übrige Gesamt-Daten, die bisher nur im Browser lagen
-- Läuft NACH rechte.sql. Wiederholbar.
--
-- Je Browser-Schlüssel eine Zeile (Wert unverändert als Text). gesamt/db.js hält sie gleich.
--   bruell:werkzeuge                         → Werkzeuge        (Bereich werkzeuge)
--   buch:umsaetze, buch:rechnungen, bank:saldo → Bank/Buchhaltung (bank, buchhaltung)
--   lohn:konten                              → Lohn (+ Bank/Buchhaltung lesen, für den Abgleich)
--   lohn:<JJJJ-MM>, lohn:import:<JJJJ-MM>    → Lohn             (lohn)
--   bm:<JJJJ>                                → Betriebsmonitor  (monitor)
--   bruell:widgets                           → Widget-Auswahl je Person (uebersicht)
--   bruell:raster:<Konto-ID>                 → eigene Anordnung der Übersicht (nur die Person selbst)
-- Lesen: Admin oder wer einen der Bereiche freigegeben hat. Ändern: nur Admin,
-- die eigene Anordnung (bruell:raster:<ID>) ändert jeder selbst.
-- Werkzeug-Bilder: Bucket „werkzeuge“, Pfad bilder/<Werkzeug-ID>.
-- ===========================================================================

create table if not exists public.ablage (
  schluessel text primary key,
  wert text not null default '',
  bereiche text[] not null default array[]::text[],
  besitzer text,
  geaendert bigint not null default 0,
  geloescht boolean not null default false
);
alter table public.ablage enable row level security;

-- Welche Bereiche einen Schlüssel lesen dürfen (null = Schlüssel nicht erlaubt)
create or replace function public.ablage_bereiche(s text) returns text[] language sql immutable as $$
  select case
    when s = 'bruell:werkzeuge' then array['werkzeuge']
    when s in ('buch:umsaetze', 'buch:rechnungen', 'bank:saldo') then array['bank', 'buchhaltung']
    when s = 'lohn:konten' then array['lohn', 'bank', 'buchhaltung']
    when s ~ '^lohn:(import:)?\d{4}-\d{2}$' then array['lohn']
    when s ~ '^bm:\d{4}$' then array['monitor']
    when s = 'bruell:widgets' then array['uebersicht']
    when s ~ '^bruell:raster:[^:]+$' then array[]::text[]
    else null end
$$;

-- Bereiche + Besitzer setzt die Datenbank selbst (nicht der Browser)
create or replace function public.ablage_vorher() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.bereiche := ablage_bereiche(new.schluessel);
  if new.bereiche is null then raise exception 'Schlüssel % nicht erlaubt', new.schluessel; end if;
  -- Anordnung gehört immer der Person mit dieser Konto-ID (auch wenn der Admin sie überträgt)
  if tg_op = 'INSERT' then new.besitzer := case when new.schluessel like 'bruell:raster:%' then (select email from mitglieder where id = substr(new.schluessel, 15)) end;
  else new.besitzer := old.besitzer; new.schluessel := old.schluessel; end if;
  return new;
end $$;
drop trigger if exists ablage_vorher on public.ablage;
create trigger ablage_vorher before insert or update on public.ablage for each row execute function public.ablage_vorher();

drop policy if exists ablage_lesen on public.ablage;
drop policy if exists ablage_admin on public.ablage;
drop policy if exists ablage_eigen on public.ablage;
create policy ablage_lesen on public.ablage for select to authenticated using (ist_gf() or bereiche && meine_bereiche() or besitzer = ich_email());
create policy ablage_admin on public.ablage for all to authenticated using (ist_gf()) with check (ist_gf());
-- eigene Anordnung: nur Schlüssel bruell:raster:<eigene Konto-ID>
create policy ablage_eigen on public.ablage for all to authenticated
  using (besitzer = ich_email())
  with check (schluessel = 'bruell:raster:' || (select id from mitglieder where email = ich_email() and aktiv) and (besitzer is null or besitzer = ich_email()));

grant select, insert, update, delete on public.ablage to authenticated;
revoke all on public.ablage from anon;
revoke all on function public.ablage_vorher() from public, anon;

-- Werkzeug-Bilder: privater Bucket „werkzeuge“ – lesen mit Freigabe „werkzeuge“, ändern nur Admin
insert into storage.buckets (id, name, public, file_size_limit)
values ('werkzeuge', 'werkzeuge', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
drop policy if exists werkzeuge_lesen on storage.objects;
drop policy if exists werkzeuge_admin on storage.objects;
create policy werkzeuge_lesen on storage.objects for select to authenticated using (bucket_id = 'werkzeuge' and darf_bereich('werkzeuge'));
create policy werkzeuge_admin on storage.objects for all to authenticated using (bucket_id = 'werkzeuge' and ist_gf()) with check (bucket_id = 'werkzeuge' and ist_gf());
