begin;
do $$ declare t text; begin
foreach t in array array['uploaded_documents','projects','extracted_datasets','document_templates','signatures','generation_jobs','generated_documents','business_profiles','tender_projects','document_comparisons','audit_logs','signing_authorisations'] loop
 execute format('alter table public.%I add column if not exists payload jsonb not null default ''{}''::jsonb',t);
 execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()',t);
 -- All mutations pass through the backend's allowlist and ownership checks.
 -- A user JWT can read its own rows but cannot forge jobs or audit events.
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
do $$ declare t text; begin
foreach t in array array['subscription_plans','user_subscriptions'] loop
 execute format('alter table public.%I add column if not exists payload jsonb not null default ''{}''::jsonb',t);
 execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()',t);
 if t='user_subscriptions' then
  revoke insert,update,delete on public.user_subscriptions from anon,authenticated;
  grant select on public.user_subscriptions to authenticated;
 else
  execute format('revoke all on public.%I from anon, authenticated',t);
 end if;
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
alter table public.generation_jobs alter column template_id drop not null;
alter table public.generation_jobs alter column dataset_id drop not null;
alter table public.generation_jobs drop constraint generation_jobs_template_id_owner_id_fkey;
alter table public.generation_jobs drop constraint generation_jobs_dataset_id_owner_id_fkey;
alter table public.generation_jobs add foreign key(template_id,owner_id) references public.document_templates(id,owner_id) on delete set null (template_id);
alter table public.generation_jobs add foreign key(dataset_id,owner_id) references public.extracted_datasets(id,owner_id) on delete set null (dataset_id);
alter table public.signing_authorisations alter column signature_id drop not null;
alter table public.signing_authorisations drop constraint signing_authorisations_signature_id_owner_id_fkey;
alter table public.signing_authorisations add foreign key(signature_id,owner_id) references public.signatures(id,owner_id) on delete set null (signature_id);
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
do $$ declare t text; begin
foreach t in array array['uploaded_documents','projects','extracted_datasets','document_templates','signatures','generation_jobs','generated_documents','business_profiles','tender_projects','document_comparisons','audit_logs','signing_authorisations'] loop
 execute format('create trigger update_timestamp before update on public.%I for each row execute function public.touch_updated_at()',t);
end loop; end $$;
create function public.create_user_profile() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''));return new;end $$;
create trigger new_user_profile after insert on auth.users for each row execute function public.create_user_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
grant select,update on public.profiles to authenticated;
update storage.buckets set public=false where id in ('documents','signatures');
commit;
