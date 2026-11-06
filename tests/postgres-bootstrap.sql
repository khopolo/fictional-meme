-- Minimal Supabase schema contracts for real PostgreSQL policy tests.
-- This does not emulate Auth, PostgREST or the Storage HTTP API.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean default false);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
alter table storage.objects enable row level security;
grant usage on schema public,storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to authenticated;
