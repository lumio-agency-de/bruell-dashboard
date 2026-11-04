-- ===========================================================================
-- Brüll Dashboard — Fahrzeuge (Fahrzeugkarten + DKV-Tankbuchungen)
-- Läuft NACH Bad …/schema.sql und personal.sql. Kann erneut ausgeführt werden — Daten bleiben erhalten.
--
-- Nur die Geschäftsführung sieht und bearbeitet Fahrzeuge. (Was Mitarbeiter zu „ihrem“ Fahrzeug sehen,
-- steht in ihrer Personalkarte: fz_kennzeichen, fz_modell … → personal.sql / meine_personalkarte()).
-- Speicherformat wie im Browser: eine Zeile je Fahrzeug, daten = Inhalt von fz_<Nr> (jsonb).
-- Tankbuchungen: eine Zeile je Buchung; nr = Fahrzeug-Nr., leer = noch keinem Fahrzeug zugeordnet.
-- ===========================================================================

create table if not exists public.fahrzeuge (
  nr        text primary key check (nr ~ '^[0-9]+$'),
  daten     jsonb  not null default '{}'::jsonb,
  geaendert bigint not null default 0,
  geloescht boolean not null default false
);
alter table public.fahrzeuge enable row level security;
drop policy if exists fz_gf on public.fahrzeuge;
create policy fz_gf on public.fahrzeuge for all to authenticated using (ist_gf()) with check (ist_gf());

create table if not exists public.tanken (
  id       text primary key,                       -- eindeutige Buchungs-ID (vom DKV-Abruf)
  nr       text check (nr is null or nr ~ '^[0-9]+$'),
  datum    date,
  daten    jsonb not null default '{}'::jsonb,       -- Buchung wie in FZ_TANKEN (datum, km, liter, betrag, art …)
  eingang  timestamptz not null default now()
);
create index if not exists tanken_nr on public.tanken (nr, datum);
alter table public.tanken enable row level security;
drop policy if exists ta_gf on public.tanken;
create policy ta_gf on public.tanken for all to authenticated using (ist_gf()) with check (ist_gf());

-- Dokumente der Fahrzeugkarten: privater Bucket „fahrzeuge“, Pfad dokumente/<Nr>/<Zeilen-ID> – nur GF
insert into storage.buckets (id, name, public, file_size_limit)
values ('fahrzeuge', 'fahrzeuge', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
drop policy if exists fahrzeuge_gf on storage.objects;
create policy fahrzeuge_gf on storage.objects for all to authenticated
  using (bucket_id = 'fahrzeuge' and ist_gf()) with check (bucket_id = 'fahrzeuge' and ist_gf());
