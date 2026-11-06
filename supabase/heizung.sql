-- ===========================================================================
-- Brüll Dashboard — Heizung in derselben Datenbank wie Bad (Brüll-Server / Mac mini)
-- Läuft NACH schema.sql (Bad), personal.sql, fahrzeuge.sql, rechte.sql. Wiederholbar.
--
-- Bad nutzt die Tabellen in „public“. Heizung hat dieselben Tabellen in einem eigenen Schema
-- „heizung“ (Projekte, Dateien, Einstellungen, Kunden-Links, Kennzahlen, Schreibschutz) und
-- den Bucket „akten-heizung“. Gemeinsam: Konten (public.mitglieder) und die Hilfsfunktionen
-- ist_gf(), ich_ebene(), ich_id() … – eine Anmeldung für alles.
-- Zusätzlich zur Ebene braucht man den Bereich „heizung“ (Einstellungen → Konten & Rechte).
-- Die App spricht das Schema über supabase-js .schema("heizung") an (heizung/app/js/daten.js);
-- dafür muss PostgREST es ausliefern: PGRST_DB_SCHEMAS enthält „heizung“ (supabase/.env).
-- ===========================================================================

create schema if not exists heizung;
grant usage on schema heizung to anon, authenticated, service_role;

create table if not exists heizung.projekte (
  id         text primary key,
  daten      jsonb  not null,
  geaendert  bigint not null default 0,
  geloescht  boolean not null default false
);
create table if not exists heizung.dateien (
  id         uuid primary key default gen_random_uuid(),
  projekt_id text not null references heizung.projekte(id) on delete cascade,
  kategorie  text not null,
  name       text not null,
  typ        text,
  groesse    bigint,
  pfad       text not null unique,
  quelle     text not null default 'team',
  neu        boolean not null default false,
  am         timestamptz not null default now()
);
create index if not exists dateien_projekt on heizung.dateien(projekt_id);
create table if not exists heizung.einstellungen (
  id        int primary key default 1 check (id = 1),
  daten     jsonb,
  geaendert bigint not null default 0
);
create table if not exists heizung.upload_links (
  token       text primary key,
  projekt_id  text not null references heizung.projekte(id) on delete cascade,
  erstellt    timestamptz not null default now(),
  gueltig_bis timestamptz not null default now() + interval '180 days'
);
create table if not exists heizung.kennzahlen (
  projekt_id text primary key references heizung.projekte(id) on delete cascade,
  daten      jsonb not null default '{}'::jsonb,
  geaendert  bigint not null default 0
);
create table if not exists heizung.sperren (
  ressource text primary key,
  wer       text not null,
  name      text,
  seit      timestamptz not null default now(),
  bis       timestamptz not null
);
grant select, insert, update, delete on all tables in schema heizung to authenticated;
grant all on all tables in schema heizung to service_role;
revoke all on all tables in schema heizung from anon;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen (Heizung-Fassungen; lesen heizung.einstellungen / heizung.projekte)
-- ---------------------------------------------------------------------------
create or replace function heizung.darf() returns boolean language sql stable as $$
  select public.darf_bereich('heizung')
$$;
create or replace function heizung.ist_buero() returns boolean language sql stable as $$
  select public.ist_buero() and heizung.darf()
$$;
create or replace function heizung.ordner_standard(e text) returns jsonb language sql stable security definer set search_path = heizung, public as $$
  select coalesce(
    (select daten -> 'freigabeStandard' -> e from heizung.einstellungen where id = 1 and jsonb_typeof(daten -> 'freigabeStandard' -> e) = 'array'),
    (select daten -> 'freigabeStandard' -> 'partner' from heizung.einstellungen where id = 1 and e like 'partner%' and jsonb_typeof(daten -> 'freigabeStandard' -> 'partner') = 'array'),
    case split_part(e, ':', 1)
      when 'planung' then '["bilder-alt","grundriss","heizung","skizzen","planung","angebot","auftrag","baustelle","auswahl","expose","freigabe","rechnungen","fertig","sonstiges"]'::jsonb
      when 'monteur' then '["bilder-alt","grundriss","heizung","skizzen","planung","baustelle","auswahl","expose","freigabe","fertig","sonstiges"]'::jsonb
      else '["planung","skizzen","baustelle","auswahl"]'::jsonb end)
$$;
create or replace function heizung.partner_gewerk(pid text) returns text language sql stable security definer set search_path = heizung, public as $$
  select x ->> 'gewerk' from heizung.einstellungen, jsonb_array_elements(coalesce(daten -> 'partner', '[]'::jsonb)) x where id = 1 and x ->> 'id' = pid limit 1
$$;
create or replace function heizung.darf_datei(pid text, kat text) returns boolean language sql stable security definer set search_path = heizung, public as $$
  select heizung.darf() and (ist_gf()
    or (ich_ebene() = 'planung' and heizung.ordner_standard('planung') ? kat)
    or exists (
      select 1 from heizung.projekte p
      where p.id = pid and not p.geloescht and ich_ebene() in ('monteur', 'partner') and zugewiesen(p.daten)
        and heizung.ordner_standard(case when ich_ebene() = 'partner' then 'partner:' || coalesce(heizung.partner_gewerk(ich_id()), '') else ich_ebene() end) ? kat
    ))
$$;
create or replace function heizung.darf_hochladen(pid text, kat text) returns boolean language sql stable set search_path = heizung, public as $$
  select heizung.darf() and (ist_gf()
    or (ich_ebene() = 'planung' and heizung.darf_datei(pid, kat))
    or (ich_ebene() = 'monteur' and kat in ('baustelle', 'fertig') and heizung.darf_datei(pid, kat))
    or (ich_ebene() = 'partner' and kat = 'baustelle' and heizung.darf_datei(pid, kat)))
$$;

-- ---------------------------------------------------------------------------
-- Zugriffsregeln
-- ---------------------------------------------------------------------------
alter table heizung.projekte      enable row level security;
alter table heizung.dateien       enable row level security;
alter table heizung.einstellungen enable row level security;
alter table heizung.upload_links  enable row level security;
alter table heizung.kennzahlen    enable row level security;
alter table heizung.sperren       enable row level security;   -- nur über die Funktionen unten

drop policy if exists p_lesen on heizung.projekte;
create policy p_lesen on heizung.projekte for select to authenticated
  using (heizung.ist_buero() or (heizung.darf() and ich_ebene() = 'monteur' and zugewiesen(daten)));
drop policy if exists p_anlegen on heizung.projekte;
create policy p_anlegen on heizung.projekte for insert to authenticated with check (heizung.ist_buero());
drop policy if exists p_aendern on heizung.projekte;
create policy p_aendern on heizung.projekte for update to authenticated
  using (heizung.ist_buero() or (heizung.darf() and ich_ebene() = 'monteur' and zugewiesen(daten)))
  with check (heizung.ist_buero() or (heizung.darf() and ich_ebene() = 'monteur' and zugewiesen(daten)));
drop policy if exists p_loeschen on heizung.projekte;
create policy p_loeschen on heizung.projekte for delete to authenticated using (ist_gf());
create or replace function heizung.projekte_schutz() returns trigger language plpgsql security definer set search_path = heizung, public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('authenticated', 'anon') then return new; end if;
  if not public.ist_buero() and (new.daten -> 'zugriff' is distinct from old.daten -> 'zugriff' or new.daten -> 'freigaben' is distinct from old.daten -> 'freigaben') then
    raise exception 'Zuweisungen und Freigaben ändert nur das Büro';
  end if;
  if not ist_gf() and (new.geloescht is distinct from old.geloescht or new.daten -> 'geloescht' is distinct from old.daten -> 'geloescht') then
    raise exception 'Projekte löscht nur die Geschäftsführung';
  end if;
  return new;
end $$;
drop trigger if exists projekte_schutz on heizung.projekte;
create trigger projekte_schutz before update on heizung.projekte for each row execute function heizung.projekte_schutz();

drop policy if exists d_lesen on heizung.dateien;
create policy d_lesen on heizung.dateien for select to authenticated using (heizung.darf_datei(projekt_id, kategorie));
drop policy if exists d_anlegen on heizung.dateien;
create policy d_anlegen on heizung.dateien for insert to authenticated with check (heizung.darf_hochladen(projekt_id, kategorie));
drop policy if exists d_aendern on heizung.dateien;
create policy d_aendern on heizung.dateien for update to authenticated using (heizung.ist_buero()) with check (heizung.ist_buero());
drop policy if exists d_loeschen on heizung.dateien;
create policy d_loeschen on heizung.dateien for delete to authenticated using (heizung.ist_buero());

drop policy if exists e_lesen on heizung.einstellungen;
create policy e_lesen on heizung.einstellungen for select to authenticated using (heizung.darf());
drop policy if exists e_schreiben on heizung.einstellungen;
create policy e_schreiben on heizung.einstellungen for all to authenticated using (ist_gf()) with check (ist_gf());

drop policy if exists k_gf on heizung.kennzahlen;
create policy k_gf on heizung.kennzahlen for all to authenticated using (ist_gf()) with check (ist_gf());

drop policy if exists l_buero on heizung.upload_links;
create policy l_buero on heizung.upload_links for all to authenticated using (heizung.ist_buero()) with check (heizung.ist_buero());

-- ---------------------------------------------------------------------------
-- Dateispeicher: privater Bucket „akten-heizung“ (gleiche Ordner wie „akten“ bei Bad)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('akten-heizung', 'akten-heizung', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function heizung.link_gueltig(p_token text) returns boolean language sql stable security definer set search_path = heizung, public as $$
  select exists (select 1 from heizung.upload_links where token = p_token and gueltig_bis > now())
$$;

drop policy if exists heizung_akten_lesen on storage.objects;
create policy heizung_akten_lesen on storage.objects for select to authenticated using (
  bucket_id = 'akten-heizung' and (
    ((storage.foldername(name))[1] = 'projekte' and heizung.darf_datei((storage.foldername(name))[2], (storage.foldername(name))[3]))
    or ((storage.foldername(name))[1] = 'kunde' and heizung.ist_buero())
  ));
drop policy if exists heizung_akten_hochladen on storage.objects;
create policy heizung_akten_hochladen on storage.objects for insert to authenticated with check (
  bucket_id = 'akten-heizung' and (storage.foldername(name))[1] = 'projekte'
  and heizung.darf_hochladen((storage.foldername(name))[2], (storage.foldername(name))[3]));
drop policy if exists heizung_akten_loeschen on storage.objects;
create policy heizung_akten_loeschen on storage.objects for delete to authenticated using (bucket_id = 'akten-heizung' and heizung.ist_buero());
drop policy if exists heizung_kunde_upload on storage.objects;
create policy heizung_kunde_upload on storage.objects for insert to anon
  with check (bucket_id = 'akten-heizung' and (storage.foldername(name))[1] = 'kunde' and heizung.link_gueltig((storage.foldername(name))[2]));

-- ---------------------------------------------------------------------------
-- Externe Partner, Kundenportal, Schreibschutz (wie Bad, auf heizung.*)
-- ---------------------------------------------------------------------------
create or replace function heizung.partner_auftraege()
returns jsonb language sql stable security definer set search_path = heizung, public as $$
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
    'ordner', heizung.ordner_standard('partner:' || coalesce(heizung.partner_gewerk(m.id), '')),
    'geaendert', p.geaendert
  ) order by p.daten #>> '{termine,baustart}'), '[]'::jsonb)
  from heizung.projekte p join public.mitglieder m on m.email = ich_email() and m.ebene = 'partner' and m.aktiv
  where heizung.darf() and not p.geloescht and p.daten -> 'zugriff' ? m.id
$$;

create or replace function heizung.partner_melden(p_projekt text, p_erledigt boolean, p_notiz text)
returns boolean language plpgsql security definer set search_path = heizung, public as $$
declare
  v_m public.mitglieder;
  v_text text;
begin
  select * into v_m from public.mitglieder where email = ich_email() and ebene = 'partner' and aktiv;
  if not found or not heizung.darf() then return false; end if;
  if not exists (select 1 from heizung.projekte where id = p_projekt and daten -> 'zugriff' ? v_m.id) then return false; end if;
  v_text := coalesce(v_m.name, v_m.id) || case when p_erledigt then ': Gewerk erledigt' else ': Rückmeldung' end
            || case when coalesce(p_notiz, '') <> '' then ' – ' || left(p_notiz, 500) else '' end;
  update heizung.projekte set
    daten = jsonb_set(
      daten || jsonb_build_object('partnerStatus', coalesce(daten -> 'partnerStatus', '{}'::jsonb) ||
        jsonb_build_object(v_m.id, jsonb_build_object('erledigt', p_erledigt, 'notiz', left(coalesce(p_notiz, ''), 500), 'am', (extract(epoch from now()) * 1000)::bigint))),
      '{verlauf}',
      jsonb_build_array(jsonb_build_object('ts', (extract(epoch from now()) * 1000)::bigint, 'text', v_text)) || coalesce(daten -> 'verlauf', '[]'::jsonb)),
    geaendert = (extract(epoch from now()) * 1000)::bigint
  where id = p_projekt;
  return true;
end $$;

create or replace function heizung.portal_info(p_token text)
returns jsonb language plpgsql security definer set search_path = heizung, public as $$
declare
  v_link heizung.upload_links;
  v_p    jsonb;
begin
  select * into v_link from heizung.upload_links where token = p_token and gueltig_bis > now();
  if not found then return null; end if;
  select daten into v_p from heizung.projekte where id = v_link.projekt_id and not geloescht;
  if v_p is null then return null; end if;
  return jsonb_build_object(
    'firma',    (select daten - 'team' - 'partner' from heizung.einstellungen where id = 1),
    'anrede',   v_p #>> '{kunde,anrede}',
    'vorname',  v_p #>> '{kunde,vorname}',
    'nachname', v_p #>> '{kunde,nachname}',
    'phase',    (v_p ->> 'phase')::int,
    'hochgeladen', coalesce((
      select jsonb_agg(jsonb_build_object('kategorie', kategorie, 'name', name, 'am', am) order by am)
      from heizung.dateien where projekt_id = v_link.projekt_id and quelle = 'kunde'
    ), '[]'::jsonb)
  );
end $$;

create or replace function heizung.portal_upload_melden(
  p_token text, p_pfad text, p_kategorie text, p_name text, p_typ text, p_groesse bigint)
returns boolean language plpgsql security definer set search_path = heizung, public, storage as $$
declare
  v_link heizung.upload_links;
begin
  select * into v_link from heizung.upload_links where token = p_token and gueltig_bis > now();
  if not found then return false; end if;
  if p_pfad not like 'kunde/' || p_token || '/%' then return false; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'akten-heizung' and name = p_pfad) then return false; end if;
  insert into heizung.dateien (projekt_id, kategorie, name, typ, groesse, pfad, quelle, neu)
  values (v_link.projekt_id, left(p_kategorie, 40), left(p_name, 200), left(p_typ, 100), p_groesse, p_pfad, 'kunde', true)
  on conflict (pfad) do nothing;
  update heizung.projekte set geaendert = (extract(epoch from now()) * 1000)::bigint where id = v_link.projekt_id;
  return true;
end $$;

create or replace function heizung.sperre_holen(p_ressource text, p_name text, p_erzwingen boolean default false)
returns jsonb language plpgsql security definer set search_path = heizung, public as $$
declare
  v heizung.sperren;
  v_ich text := ich_id();
begin
  if v_ich is null or not heizung.darf() or ich_ebene() not in ('geschaeftsfuehrung', 'planung', 'monteur') then return jsonb_build_object('frei', false); end if;
  select * into v from heizung.sperren where ressource = p_ressource;
  if found and v.bis > now() and v.wer <> v_ich and not (p_erzwingen and ist_gf()) then
    return jsonb_build_object('frei', false, 'wer', v.wer, 'name', v.name, 'seit', v.seit);
  end if;
  insert into heizung.sperren (ressource, wer, name, seit, bis) values (p_ressource, v_ich, p_name, now(), now() + interval '90 seconds')
  on conflict (ressource) do update set
    seit = case when sperren.wer = v_ich and sperren.bis > now() then sperren.seit else now() end,
    wer = v_ich, name = p_name, bis = now() + interval '90 seconds';
  return jsonb_build_object('frei', true);
end $$;

create or replace function heizung.sperre_freigeben(p_ressource text) returns boolean
language sql security definer set search_path = heizung, public as $$
  delete from heizung.sperren where ressource = p_ressource and wer = ich_id() returning true
$$;

-- Rechte auf die Funktionen: nur, was die App braucht
revoke all on all functions in schema heizung from public, anon;
grant execute on all functions in schema heizung to authenticated;
grant execute on function heizung.link_gueltig(text), heizung.portal_info(text), heizung.portal_upload_melden(text, text, text, text, text, bigint) to anon;
revoke execute on function heizung.projekte_schutz() from authenticated;
