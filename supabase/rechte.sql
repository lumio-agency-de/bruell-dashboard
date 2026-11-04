-- ===========================================================================
-- Brüll Dashboard — Rechte je Konto: welche Menüpunkte (Bereiche) jemand sieht
-- Läuft NACH schema.sql (Bad), personal.sql und fahrzeuge.sql. Wiederholbar.
--
-- Admin = Geschäftsführung: sieht alles und ist der Einzige, der in den Gesamt-Bereichen
-- (Personal, Fahrzeuge, Werkzeuge, Betrieb …) etwas ändert. Alle anderen: nur lesen, nur die
-- freigegebenen Bereiche. Bad/Heizung: was jemand dort bearbeitet, regelt weiter die Ebene.
-- Bereiche (Schlüssel): uebersicht, bad, heizung, personal, lohn, fahrzeuge, werkzeuge, betrieb,
--   buchhaltung, bank, monitor, monat, jahr, abschluss
-- mitglieder.bereiche = null → Standard je Ebene (siehe bereiche_standard).
-- ===========================================================================

alter table public.mitglieder add column if not exists bereiche text[];

create or replace function public.bereiche_standard(e text) returns text[] language sql immutable as $$
  select case e
    when 'geschaeftsfuehrung' then array['uebersicht','bad','heizung','personal','lohn','fahrzeuge','werkzeuge','betrieb','buchhaltung','bank','monitor','monat','jahr','abschluss']
    when 'planung' then array['uebersicht','bad','heizung']
    when 'monteur' then array['uebersicht','bad','heizung']
    when 'partner' then array['bad']
    else array[]::text[] end
$$;

create or replace function public.meine_bereiche() returns text[] language sql stable security definer set search_path = public as $$
  select case when ist_gf() then bereiche_standard('geschaeftsfuehrung')
    else coalesce((select coalesce(bereiche, bereiche_standard(ebene)) from mitglieder where email = ich_email() and aktiv), array[]::text[]) end
$$;
create or replace function public.darf_bereich(b text) returns boolean language sql stable security definer set search_path = public as $$
  select ist_gf() or b = any(meine_bereiche())
$$;
revoke all on function public.meine_bereiche() from public, anon;
revoke all on function public.darf_bereich(text) from public, anon;
grant execute on function public.meine_bereiche(), public.darf_bereich(text) to authenticated;

-- Rechte eines Kontos setzen (nur Admin). null = Standard der Ebene.
create or replace function public.konto_bereiche(p_email text, p_bereiche text[]) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not ist_gf() then raise exception 'nicht erlaubt'; end if;
  update mitglieder set bereiche = p_bereiche where email = lower(p_email);
  return found;
end $$;
revoke all on function public.konto_bereiche(text, text[]) from public, anon;
grant execute on function public.konto_bereiche(text, text[]) to authenticated;

-- Kontenliste (Admin) zusätzlich mit Bereichen
create or replace function public.konten_liste() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not ist_gf() then raise exception 'nicht erlaubt'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'email', m.email, 'benutzer', coalesce(m.benutzer, m.email), 'id', m.id, 'ebene', m.ebene, 'name', m.name,
      'aktiv', m.aktiv, 'mussAendern', m.muss_aendern, 'letzterLogin', u.last_sign_in_at, 'pk', m.pk, 'lohnzettel', m.lohnzettel,
      'bereiche', m.bereiche, 'bereicheWirksam', coalesce(m.bereiche, bereiche_standard(m.ebene))))
    from mitglieder m left join auth.users u on u.email = m.email), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Lesen mit Freigabe (ändern weiter nur Admin)
-- ---------------------------------------------------------------------------
-- Personal: alle Karten lesen (ohne Bewertung/Sonstige Notizen) mit Freigabe „personal“
create or replace function public.personal_alle() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not darf_bereich('personal') then raise exception 'nicht erlaubt'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('nr', nr, 'daten', case when ist_gf() then daten else personal_ohne_intern(daten) end, 'geaendert', geaendert) order by nr::int)
    from personal where not geloescht), '[]'::jsonb);
end $$;
revoke all on function public.personal_alle() from public, anon;
grant execute on function public.personal_alle() to authenticated;

-- Personal-Dateien: Fotos + Dokumente lesen mit „personal“, Lohnzettel mit „lohn“
drop policy if exists personal_lesen on storage.objects;
create policy personal_lesen on storage.objects for select to authenticated using (
  bucket_id = 'personal' and (
    ist_gf()
    or ((storage.foldername(name))[1] in ('foto', 'dokumente', 'lohnzettel') and (storage.foldername(name))[2] = ich_pk())
    or ((storage.foldername(name))[1] = 'lohnzettel' and (darf_lohnzettel() or darf_bereich('lohn')))
    or ((storage.foldername(name))[1] in ('foto', 'dokumente') and darf_bereich('personal'))
  ));

-- Fahrzeuge + Tankbuchungen + Fahrzeug-Dokumente lesen mit „fahrzeuge“ (Tanken auch mit „monitor“)
drop policy if exists fz_gf on public.fahrzeuge;
drop policy if exists fz_lesen on public.fahrzeuge;
drop policy if exists fz_admin on public.fahrzeuge;
create policy fz_lesen on public.fahrzeuge for select to authenticated using (darf_bereich('fahrzeuge'));
create policy fz_admin on public.fahrzeuge for all to authenticated using (ist_gf()) with check (ist_gf());
drop policy if exists ta_gf on public.tanken;
drop policy if exists ta_lesen on public.tanken;
drop policy if exists ta_admin on public.tanken;
create policy ta_lesen on public.tanken for select to authenticated using (darf_bereich('fahrzeuge') or darf_bereich('monitor'));
create policy ta_admin on public.tanken for all to authenticated using (ist_gf()) with check (ist_gf());
drop policy if exists fahrzeuge_gf on storage.objects;
drop policy if exists fahrzeuge_lesen on storage.objects;
drop policy if exists fahrzeuge_admin on storage.objects;
create policy fahrzeuge_lesen on storage.objects for select to authenticated using (bucket_id = 'fahrzeuge' and darf_bereich('fahrzeuge'));
create policy fahrzeuge_admin on storage.objects for all to authenticated using (bucket_id = 'fahrzeuge' and ist_gf()) with check (bucket_id = 'fahrzeuge' and ist_gf());
