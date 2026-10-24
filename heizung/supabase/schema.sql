-- ===========================================================================
-- Heizungs-Dashboard — Cloud-Schema für Supabase
-- Einmal im Supabase-SQL-Editor ausführen (siehe ANLEITUNG-CLOUD.md).
-- Kann auch erneut ausgeführt werden (Aktualisierung) — Daten bleiben erhalten.
--
-- Ein Supabase-Projekt = eine Firma. Wer was sehen darf, regelt die Ebene in
-- der Tabelle „mitglieder":
--   geschaeftsfuehrung  alles, inkl. Einrichtung und Löschen
--   planung             alle Projekte bearbeiten (Planer/Bearbeiter, Projektleitung)
--   monteur             nur zugewiesene Baustellen; keine Angebote/Aufträge/Rechnungen
--   partner             externe Partner: nur zugewiesene Einsätze, nur das Nötigste
-- Kunden haben keinen Zugang — sie laden nur über ihren persönlichen Link hoch.
-- ===========================================================================

create table if not exists public.projekte (
  id         text primary key,
  daten      jsonb  not null,
  geaendert  bigint not null default 0,
  geloescht  boolean not null default false
);

create table if not exists public.dateien (
  id         uuid primary key default gen_random_uuid(),
  projekt_id text not null references public.projekte(id) on delete cascade,
  kategorie  text not null,
  name       text not null,
  typ        text,
  groesse    bigint,
  pfad       text not null unique,
  quelle     text not null default 'team',   -- 'team' | 'kunde' | 'partner'
  neu        boolean not null default false,
  am         timestamptz not null default now()
);
create index if not exists dateien_projekt on public.dateien(projekt_id);

create table if not exists public.einstellungen (
  id        int primary key default 1 check (id = 1),
  daten     jsonb,
  geaendert bigint not null default 0
);

create table if not exists public.upload_links (
  token      text primary key,
  projekt_id text not null references public.projekte(id) on delete cascade,
  erstellt   timestamptz not null default now(),
  gueltig_bis timestamptz not null default now() + interval '180 days'
);

-- Zahlen je Projekt (Angebot, Auftrag, Rechnung, Kosten) — nur Geschäftsführung
create table if not exists public.kennzahlen (
  projekt_id text primary key references public.projekte(id) on delete cascade,
  daten      jsonb not null default '{}'::jsonb,
  geaendert  bigint not null default 0
);

-- Wer darf rein, auf welcher Ebene? (wird in der Einrichtung gepflegt)
create table if not exists public.mitglieder (
  email     text primary key,
  id        text not null unique,          -- Kürzel (Team) bzw. Partner-ID
  ebene     text not null check (ebene in ('geschaeftsfuehrung', 'planung', 'monteur', 'partner')),
  name      text,
  formulare text[] not null default '{}'   -- Partner: welche Formulare sie sehen
);
-- Konten: Benutzername, gesperrt?, muss beim nächsten Login das Passwort ändern?
alter table public.mitglieder add column if not exists benutzer text;
alter table public.mitglieder add column if not exists aktiv boolean not null default true;
alter table public.mitglieder add column if not exists muss_aendern boolean not null default false;
alter table public.mitglieder add column if not exists user_id uuid;
alter table public.mitglieder drop constraint if exists mitglieder_id_key;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen: Wer bin ich, was darf ich?
-- ---------------------------------------------------------------------------
create or replace function public.ich_email() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
create or replace function public.ich_ebene() returns text language sql stable security definer set search_path = public as $$
  select ebene from mitglieder where email = ich_email() and aktiv
$$;
create or replace function public.ich_id() returns text language sql stable security definer set search_path = public as $$
  select id from mitglieder where email = ich_email() and aktiv
$$;
create or replace function public.ist_buero() returns boolean language sql stable as $$
  select coalesce(ich_ebene() in ('geschaeftsfuehrung', 'planung'), false)
$$;
create or replace function public.ist_gf() returns boolean language sql stable as $$
  select coalesce(ich_ebene() = 'geschaeftsfuehrung', false)
$$;
create or replace function public.zugewiesen(d jsonb) returns boolean language sql stable as $$
  select coalesce(d -> 'zugriff' ? ich_id(), false)
$$;
-- Ordner einer Rolle bzw. eines Partner-Gewerks (Konten → „Ordner & Bilder“, einstellungen.daten.freigabeStandard)
--   e = 'planung' | 'monteur' | 'partner:<Gewerk>'
create or replace function public.ordner_standard(e text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select daten -> 'freigabeStandard' -> e from einstellungen where id = 1 and jsonb_typeof(daten -> 'freigabeStandard' -> e) = 'array'),
    (select daten -> 'freigabeStandard' -> 'partner' from einstellungen where id = 1 and e like 'partner%' and jsonb_typeof(daten -> 'freigabeStandard' -> 'partner') = 'array'),
    case split_part(e, ':', 1)
      when 'planung' then '["bilder-alt","grundriss","heizung","skizzen","planung","angebot","auftrag","baustelle","auswahl","expose","freigabe","rechnungen","fertig","sonstiges"]'::jsonb
      when 'monteur' then '["bilder-alt","grundriss","heizung","skizzen","planung","baustelle","auswahl","expose","freigabe","fertig","sonstiges"]'::jsonb
      else '["planung","skizzen","baustelle","auswahl"]'::jsonb end)
$$;
-- Gewerk eines Partners (aus dem Adressbuch in den Einstellungen)
create or replace function public.partner_gewerk(pid text) returns text language sql stable security definer set search_path = public as $$
  select x ->> 'gewerk' from einstellungen, jsonb_array_elements(coalesce(daten -> 'partner', '[]'::jsonb)) x where id = 1 and x ->> 'id' = pid limit 1
$$;
-- Darf ich Dateien dieses Projekts in diesem Ordner sehen?
create or replace function public.darf_datei(pid text, kat text) returns boolean language sql stable security definer set search_path = public as $$
  select ist_gf()
    or (ich_ebene() = 'planung' and ordner_standard('planung') ? kat)
    or exists (
      select 1 from projekte p
      where p.id = pid and not p.geloescht and ich_ebene() in ('monteur', 'partner') and zugewiesen(p.daten)
        and ordner_standard(case when ich_ebene() = 'partner' then 'partner:' || coalesce(partner_gewerk(ich_id()), '') else ich_ebene() end) ? kat
    )
$$;
-- Darf ich in diesen Ordner hochladen?
create or replace function public.darf_hochladen(pid text, kat text) returns boolean language sql stable as $$
  select ist_gf()
    or (ich_ebene() = 'planung' and darf_datei(pid, kat))
    or (ich_ebene() = 'monteur' and kat in ('baustelle', 'fertig') and darf_datei(pid, kat))
    or (ich_ebene() = 'partner' and kat = 'baustelle' and darf_datei(pid, kat))
$$;

-- ---------------------------------------------------------------------------
-- Zugriffsregeln (alte Fassungen werden ersetzt)
-- ---------------------------------------------------------------------------
alter table public.projekte      enable row level security;
alter table public.dateien       enable row level security;
alter table public.einstellungen enable row level security;
alter table public.upload_links  enable row level security;
alter table public.mitglieder    enable row level security;
alter table public.kennzahlen    enable row level security;

drop policy if exists team_projekte on public.projekte;
drop policy if exists team_dateien on public.dateien;
drop policy if exists team_einstellungen on public.einstellungen;
drop policy if exists team_links on public.upload_links;
drop policy if exists team_akten on storage.objects;

drop policy if exists p_lesen on public.projekte;
create policy p_lesen on public.projekte for select to authenticated
  using (ist_buero() or (ich_ebene() = 'monteur' and zugewiesen(daten)));
drop policy if exists p_anlegen on public.projekte;
create policy p_anlegen on public.projekte for insert to authenticated with check (ist_buero());
drop policy if exists p_aendern on public.projekte;
create policy p_aendern on public.projekte for update to authenticated
  using (ist_buero() or (ich_ebene() = 'monteur' and zugewiesen(daten)))
  with check (ist_buero() or (ich_ebene() = 'monteur' and zugewiesen(daten)));
-- Schutz: nur das Büro weist zu und gibt Ordner frei, nur die Geschäftsführung löscht
create or replace function public.projekte_schutz() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- gilt für angemeldete Nutzer; Wartung (SQL-Editor) und Service-Key (Ordner-Sync) sind ausgenommen
  if coalesce(auth.jwt() ->> 'role', '') not in ('authenticated', 'anon') then return new; end if;
  if not ist_buero() and (new.daten -> 'zugriff' is distinct from old.daten -> 'zugriff' or new.daten -> 'freigaben' is distinct from old.daten -> 'freigaben') then
    raise exception 'Zuweisungen und Freigaben ändert nur das Büro';
  end if;
  if not ist_gf() and (new.geloescht is distinct from old.geloescht or new.daten -> 'geloescht' is distinct from old.daten -> 'geloescht') then
    raise exception 'Projekte löscht nur die Geschäftsführung';
  end if;
  return new;
end $$;
drop trigger if exists projekte_schutz on public.projekte;
create trigger projekte_schutz before update on public.projekte for each row execute function public.projekte_schutz();
drop policy if exists p_loeschen on public.projekte;
create policy p_loeschen on public.projekte for delete to authenticated using (ist_gf());

drop policy if exists d_lesen on public.dateien;
create policy d_lesen on public.dateien for select to authenticated using (darf_datei(projekt_id, kategorie));
drop policy if exists d_anlegen on public.dateien;
create policy d_anlegen on public.dateien for insert to authenticated with check (darf_hochladen(projekt_id, kategorie));
drop policy if exists d_aendern on public.dateien;
create policy d_aendern on public.dateien for update to authenticated using (ist_buero()) with check (ist_buero());
drop policy if exists d_loeschen on public.dateien;
create policy d_loeschen on public.dateien for delete to authenticated using (ist_buero());

drop policy if exists e_lesen on public.einstellungen;
create policy e_lesen on public.einstellungen for select to authenticated using (true);
drop policy if exists e_schreiben on public.einstellungen;
create policy e_schreiben on public.einstellungen for all to authenticated using (ist_gf()) with check (ist_gf());

drop policy if exists k_gf on public.kennzahlen;
create policy k_gf on public.kennzahlen for all to authenticated using (ist_gf()) with check (ist_gf());

drop policy if exists l_buero on public.upload_links;
create policy l_buero on public.upload_links for all to authenticated using (ist_buero()) with check (ist_buero());

drop policy if exists m_lesen on public.mitglieder;
create policy m_lesen on public.mitglieder for select to authenticated using (email = ich_email() or ist_buero());
drop policy if exists m_schreiben on public.mitglieder;
create policy m_schreiben on public.mitglieder for all to authenticated using (ist_gf()) with check (ist_gf());

-- ---------------------------------------------------------------------------
-- Dateispeicher: privater Bucket „akten"
--   projekte/<projekt-id>/<ordner>/<datei>   ← Team, Monteure, Partner
--   kunde/<token>/<ordner>/<datei>           ← Kunden (nur Schreiben)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('akten', 'akten', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists akten_lesen on storage.objects;
create policy akten_lesen on storage.objects for select to authenticated using (
  bucket_id = 'akten' and (
    ((storage.foldername(name))[1] = 'projekte' and darf_datei((storage.foldername(name))[2], (storage.foldername(name))[3]))
    or ((storage.foldername(name))[1] = 'kunde' and ist_buero())
  ));
drop policy if exists akten_hochladen on storage.objects;
create policy akten_hochladen on storage.objects for insert to authenticated with check (
  bucket_id = 'akten' and (storage.foldername(name))[1] = 'projekte'
  and darf_hochladen((storage.foldername(name))[2], (storage.foldername(name))[3]));
drop policy if exists akten_loeschen on storage.objects;
create policy akten_loeschen on storage.objects for delete to authenticated using (bucket_id = 'akten' and ist_buero());

-- Prüft nur „Link gültig ja/nein" — Kunden können die Tabelle selbst nicht lesen
create or replace function public.link_gueltig(p_token text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from upload_links where token = p_token and gueltig_bis > now())
$$;
grant execute on function public.link_gueltig(text) to anon, authenticated;

drop policy if exists kunde_upload on storage.objects;
create policy kunde_upload on storage.objects for insert to anon
  with check (
    bucket_id = 'akten'
    and (storage.foldername(name))[1] = 'kunde'
    and public.link_gueltig((storage.foldername(name))[2])
  );

-- ---------------------------------------------------------------------------
-- Externe Partner: sehen nur einen Auszug ihrer Einsätze
-- ---------------------------------------------------------------------------
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
  from projekte p join mitglieder m on m.email = ich_email() and m.ebene = 'partner'
  where not p.geloescht and p.daten -> 'zugriff' ? m.id
$$;

-- Partner meldet: Gewerk erledigt / Hinweis
create or replace function public.partner_melden(p_projekt text, p_erledigt boolean, p_notiz text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_m mitglieder;
  v_text text;
begin
  select * into v_m from mitglieder where email = ich_email() and ebene = 'partner';
  if not found then return false; end if;
  if not exists (select 1 from projekte where id = p_projekt and daten -> 'zugriff' ? v_m.id) then return false; end if;
  v_text := coalesce(v_m.name, v_m.id) || case when p_erledigt then ': Gewerk erledigt' else ': Rückmeldung' end
            || case when coalesce(p_notiz, '') <> '' then ' – ' || left(p_notiz, 500) else '' end;
  update projekte set
    daten = jsonb_set(
      daten || jsonb_build_object('partnerStatus', coalesce(daten -> 'partnerStatus', '{}'::jsonb) ||
        jsonb_build_object(v_m.id, jsonb_build_object('erledigt', p_erledigt, 'notiz', left(coalesce(p_notiz, ''), 500), 'am', (extract(epoch from now()) * 1000)::bigint))),
      '{verlauf}',
      jsonb_build_array(jsonb_build_object('ts', (extract(epoch from now()) * 1000)::bigint, 'text', v_text)) || coalesce(daten -> 'verlauf', '[]'::jsonb)),
    geaendert = (extract(epoch from now()) * 1000)::bigint
  where id = p_projekt;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Kundenportal: zwei Funktionen, die nur mit gültigem Token etwas tun
-- ---------------------------------------------------------------------------
create or replace function public.portal_info(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_link upload_links;
  v_p    jsonb;
begin
  select * into v_link from upload_links where token = p_token and gueltig_bis > now();
  if not found then return null; end if;
  select daten into v_p from projekte where id = v_link.projekt_id and not geloescht;
  if v_p is null then return null; end if;
  return jsonb_build_object(
    'firma',    (select daten - 'team' - 'partner' from einstellungen where id = 1),
    'anrede',   v_p #>> '{kunde,anrede}',
    'vorname',  v_p #>> '{kunde,vorname}',
    'nachname', v_p #>> '{kunde,nachname}',
    'phase',    (v_p ->> 'phase')::int,
    'hochgeladen', coalesce((
      select jsonb_agg(jsonb_build_object('kategorie', kategorie, 'name', name, 'am', am) order by am)
      from dateien where projekt_id = v_link.projekt_id and quelle = 'kunde'
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.portal_upload_melden(
  p_token text, p_pfad text, p_kategorie text, p_name text, p_typ text, p_groesse bigint)
returns boolean language plpgsql security definer set search_path = public, storage as $$
declare
  v_link upload_links;
begin
  select * into v_link from upload_links where token = p_token and gueltig_bis > now();
  if not found then return false; end if;
  if p_pfad not like 'kunde/' || p_token || '/%' then return false; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'akten' and name = p_pfad) then return false; end if;
  insert into dateien (projekt_id, kategorie, name, typ, groesse, pfad, quelle, neu)
  values (v_link.projekt_id, left(p_kategorie, 40), left(p_name, 200), left(p_typ, 100), p_groesse, p_pfad, 'kunde', true)
  on conflict (pfad) do nothing;
  update projekte set geaendert = (extract(epoch from now()) * 1000)::bigint where id = v_link.projekt_id;
  return true;
end $$;

revoke all on function public.portal_info(text) from public;
revoke all on function public.portal_upload_melden(text, text, text, text, text, bigint) from public;
revoke all on function public.partner_auftraege() from public;
revoke all on function public.partner_melden(text, boolean, text) from public;
grant execute on function public.portal_info(text) to anon, authenticated;
grant execute on function public.portal_upload_melden(text, text, text, text, text, bigint) to anon, authenticated;
grant execute on function public.partner_auftraege() to authenticated;
grant execute on function public.partner_melden(text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- SCHREIBSCHUTZ — wer gerade ein Projekt bearbeitet (läuft nach 90 s ohne Lebenszeichen ab)
-- ---------------------------------------------------------------------------
create table if not exists public.sperren (
  ressource text primary key,
  wer       text not null,
  name      text,
  seit      timestamptz not null default now(),
  bis       timestamptz not null
);
alter table public.sperren enable row level security;   -- nur über die Funktionen unten

create or replace function public.sperre_holen(p_ressource text, p_name text, p_erzwingen boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v sperren;
  v_ich text := ich_id();
begin
  if v_ich is null or ich_ebene() not in ('geschaeftsfuehrung', 'planung', 'monteur') then return jsonb_build_object('frei', false); end if;
  select * into v from sperren where ressource = p_ressource;
  if found and v.bis > now() and v.wer <> v_ich and not (p_erzwingen and ist_gf()) then
    return jsonb_build_object('frei', false, 'wer', v.wer, 'name', v.name, 'seit', v.seit);
  end if;
  insert into sperren (ressource, wer, name, seit, bis) values (p_ressource, v_ich, p_name, now(), now() + interval '90 seconds')
  on conflict (ressource) do update set
    seit = case when sperren.wer = v_ich and sperren.bis > now() then sperren.seit else now() end,
    wer = v_ich, name = p_name, bis = now() + interval '90 seconds';
  return jsonb_build_object('frei', true);
end $$;

create or replace function public.sperre_freigeben(p_ressource text) returns boolean
language sql security definer set search_path = public as $$
  delete from sperren where ressource = p_ressource and wer = ich_id() returning true
$$;

revoke all on function public.sperre_holen(text, text, boolean) from public;
revoke all on function public.sperre_freigeben(text) from public;
grant execute on function public.sperre_holen(text, text, boolean) to authenticated;
grant execute on function public.sperre_freigeben(text) to authenticated;

-- ---------------------------------------------------------------------------
-- KONTEN — die Geschäftsführung verwaltet Zugänge direkt im Dashboard.
-- Benutzername ohne „@“ wird intern zu <name>@konto.heizungs-dashboard.de.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create or replace function public.konto_email(p_benutzer text) returns text language sql immutable as $$
  select lower(case when position('@' in p_benutzer) > 0 then trim(p_benutzer) else trim(p_benutzer) || '@konto.heizungs-dashboard.de' end)
$$;

-- Übersicht aller Konten (nur Geschäftsführung)
create or replace function public.konten_liste() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not ist_gf() then raise exception 'nicht erlaubt'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'email', m.email, 'benutzer', coalesce(m.benutzer, m.email), 'id', m.id, 'ebene', m.ebene, 'name', m.name,
      'aktiv', m.aktiv, 'mussAendern', m.muss_aendern, 'letzterLogin', u.last_sign_in_at))
    from mitglieder m left join auth.users u on u.email = m.email), '[]'::jsonb);
end $$;

-- Zugang anlegen (oder für eine Person neu vergeben)
create or replace function public.konto_anlegen(p_benutzer text, p_passwort text, p_id text, p_ebene text, p_name text, p_formulare text[] default '{}')
returns boolean language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_email text := konto_email(p_benutzer);
  v_uid uuid;
begin
  if not ist_gf() then raise exception 'nicht erlaubt'; end if;
  if length(coalesce(p_passwort, '')) < 8 then raise exception 'Passwort zu kurz (mind. 8 Zeichen)'; end if;
  if p_ebene not in ('geschaeftsfuehrung', 'planung', 'monteur', 'partner') then raise exception 'unbekannte Ebene'; end if;
  if exists (select 1 from mitglieder where email = v_email and id <> p_id) then raise exception 'Benutzername schon vergeben'; end if;
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
      crypt(p_passwort, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('name', p_name),
      now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text, jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  else
    update auth.users set encrypted_password = crypt(p_passwort, gen_salt('bf')), banned_until = null, updated_at = now() where id = v_uid;
  end if;
  delete from mitglieder where id = p_id and email <> v_email;  -- alter Benutzername dieser Person
  insert into mitglieder (email, id, ebene, name, formulare, benutzer, aktiv, muss_aendern, user_id)
  values (v_email, p_id, p_ebene, p_name, coalesce(p_formulare, '{}'), lower(trim(p_benutzer)), true, true, v_uid)
  on conflict (email) do update set id = excluded.id, ebene = excluded.ebene, name = excluded.name, formulare = excluded.formulare,
    benutzer = excluded.benutzer, aktiv = true, muss_aendern = true, user_id = excluded.user_id;
  return true;
end $$;

-- Startpasswort neu setzen (Mitarbeiter muss es beim nächsten Login ändern)
create or replace function public.konto_passwort_zuruecksetzen(p_email text, p_passwort text)
returns boolean language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not ist_gf() then raise exception 'nicht erlaubt'; end if;
  if length(coalesce(p_passwort, '')) < 8 then raise exception 'Passwort zu kurz (mind. 8 Zeichen)'; end if;
  update auth.users set encrypted_password = crypt(p_passwort, gen_salt('bf')), updated_at = now() where email = p_email;
  update mitglieder set muss_aendern = true where email = p_email;
  return found;
end $$;

-- Sperren / entsperren (sich selbst kann man nicht sperren)
create or replace function public.konto_aktiv(p_email text, p_aktiv boolean)
returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  if not ist_gf() then raise exception 'nicht erlaubt'; end if;
  if p_email = ich_email() then raise exception 'eigenes Konto kann nicht gesperrt werden'; end if;
  update mitglieder set aktiv = p_aktiv where email = p_email;
  update auth.users set banned_until = case when p_aktiv then null else '2999-12-31'::timestamptz end where email = p_email;
  return found;
end $$;

-- Ebene/Name/Formulare einer Person nachziehen (wenn in den Konten geändert)
create or replace function public.konto_aendern(p_id text, p_ebene text, p_name text, p_formulare text[] default '{}')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not ist_gf() then raise exception 'nicht erlaubt'; end if;
  if p_id = ich_id() and p_ebene <> 'geschaeftsfuehrung' then raise exception 'eigene Ebene kann nicht geändert werden'; end if;
  update mitglieder set ebene = p_ebene, name = p_name, formulare = coalesce(p_formulare, '{}') where id = p_id;
  return true;
end $$;

-- Nach dem eigenen Passwortwechsel: Pflicht erledigt
create or replace function public.passwort_geaendert() returns boolean
language sql security definer set search_path = public as $$
  update mitglieder set muss_aendern = false where email = ich_email() returning true
$$;

revoke all on function public.konten_liste() from public;
revoke all on function public.konto_anlegen(text, text, text, text, text, text[]) from public;
revoke all on function public.konto_passwort_zuruecksetzen(text, text) from public;
revoke all on function public.konto_aktiv(text, boolean) from public;
revoke all on function public.konto_aendern(text, text, text, text[]) from public;
revoke all on function public.passwort_geaendert() from public;
grant execute on function public.konten_liste() to authenticated;
grant execute on function public.konto_anlegen(text, text, text, text, text, text[]) to authenticated;
grant execute on function public.konto_passwort_zuruecksetzen(text, text) to authenticated;
grant execute on function public.konto_aktiv(text, boolean) to authenticated;
grant execute on function public.konto_aendern(text, text, text, text[]) to authenticated;
grant execute on function public.passwort_geaendert() to authenticated;
grant execute on function public.konto_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ERSTER ZUGANG: die Geschäftsführung eintragen (E-Mail anpassen!).
-- Danach pflegt sie alle weiteren Mitglieder in der Einrichtung des Dashboards.
-- ---------------------------------------------------------------------------
-- Ersten Geschäftsführer-Zugang anlegen — funktioniert nur, solange es noch keinen gibt.
-- Benutzername, Startpasswort (mind. 8 Zeichen), Kürzel und Name anpassen, dann ausführen:
--
--   select public.erster_zugang('daniel', 'Start-Passwort-123', 'DB', 'Daniel Brüll');
--
-- Beim ersten Anmelden wird ein eigenes Passwort verlangt.
create or replace function public.erster_zugang(p_benutzer text, p_passwort text, p_id text, p_name text)
returns boolean language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_email text := konto_email(p_benutzer);
  v_uid uuid := gen_random_uuid();
begin
  if exists (select 1 from mitglieder where ebene = 'geschaeftsfuehrung' and aktiv) then raise exception 'Es gibt schon einen Geschäftsführer-Zugang'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email, crypt(p_passwort, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('name', p_name), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_uid, v_uid::text, jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  insert into mitglieder (email, id, ebene, name, benutzer, aktiv, muss_aendern, user_id)
  values (v_email, p_id, 'geschaeftsfuehrung', p_name, lower(trim(p_benutzer)), true, true, v_uid);
  return true;
end $$;
revoke all on function public.erster_zugang(text, text, text, text) from public, anon, authenticated;
