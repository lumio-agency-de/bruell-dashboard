-- Minimaler Supabase-Ersatz für lokale Tests (Rollen, auth.jwt(), auth.users, storage.*). Nur zum Testen!
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage; create schema extensions;
create extension pgcrypto with schema extensions;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, confirmation_token text, email_change text,
  email_change_token_new text, recovery_token text, last_sign_in_at timestamptz, banned_until timestamptz);
create table auth.identities (id uuid primary key, user_id uuid, provider_id text, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public, storage, auth, extensions to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
