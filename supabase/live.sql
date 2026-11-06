-- ===========================================================================
-- Brüll Dashboard — „Wer ist gerade hier?“ (Anwesenheit je Seite) für die Gesamt-Seiten
-- Läuft nach rechte.sql (egal an welcher Stelle danach). Wiederholbar.
--
-- Jede offene Seite meldet sich alle ~10 s (gesamt/db.js): Konto, Name, Kürzel, Seite.
-- Zurück kommen die anderen, die in den letzten 30 s auf derselben Seite waren.
-- Die Tabelle selbst ist nicht lesbar – nur über die Funktion (nur Name/Kürzel derselben Seite).
-- ===========================================================================

create table if not exists public.anwesenheit (
  email  text primary key,
  name   text,
  kuerzel text,
  seite  text not null,
  bis    timestamptz not null
);
alter table public.anwesenheit enable row level security;   -- keine Regeln = kein direkter Zugriff
revoke all on public.anwesenheit from anon, authenticated;

create or replace function public.anwesenheit_melden(p_seite text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m mitglieder;
begin
  select * into v_m from mitglieder where email = ich_email() and aktiv;
  if not found then return '[]'::jsonb; end if;
  insert into anwesenheit (email, name, kuerzel, seite, bis)
  values (v_m.email, v_m.name, upper(coalesce(v_m.benutzer, v_m.id)), left(coalesce(p_seite, ''), 200), now() + interval '30 seconds')
  on conflict (email) do update set name = excluded.name, kuerzel = excluded.kuerzel, seite = excluded.seite, bis = excluded.bis;
  delete from anwesenheit where bis < now() - interval '10 minutes';
  return coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'kuerzel', a.kuerzel) order by a.kuerzel)
    from anwesenheit a where a.seite = left(coalesce(p_seite, ''), 200) and a.email <> v_m.email and a.bis > now()), '[]'::jsonb);
end $$;

-- Seite verlassen (beim Schließen/Wechseln)
create or replace function public.anwesenheit_weg() returns boolean
language sql security definer set search_path = public as $$
  delete from anwesenheit where email = ich_email() returning true
$$;

revoke all on function public.anwesenheit_melden(text), public.anwesenheit_weg() from public, anon;
grant execute on function public.anwesenheit_melden(text), public.anwesenheit_weg() to authenticated;
