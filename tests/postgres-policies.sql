\set ON_ERROR_STOP on
insert into auth.users(id,raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','{"display_name":"Alice"}'),
 ('22222222-2222-4222-8222-222222222222','{"display_name":"Bob"}');
insert into public.projects(id,owner_id,name,payload) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Alice project','{"name":"Alice project"}'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Bob project','{"name":"Bob project"}');
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ begin
 if (select count(*) from public.projects)<>1 then raise exception 'Cross-user row leak';end if;
 if (select count(*) from public.profiles)<>1 then raise exception 'Cross-user profile leak';end if;
 if (select display_name from public.profiles)<>'Alice' then raise exception 'Profile trigger failed';end if;
 begin
 insert into public.audit_logs(owner_id,action) values(auth.uid(),'Forged action');
 raise exception 'Audit insert was allowed';
 exception when insufficient_privilege then null;end;
 begin
 insert into public.projects(owner_id,name) values(auth.uid(),'Direct client bypass');
 raise exception 'Direct mutation bypass was allowed';
 exception when insufficient_privilege then null;end;
 update public.profiles set display_name='Alice updated' where id=auth.uid();
 update public.profiles set display_name='Hacked' where id='22222222-2222-4222-8222-222222222222';
end $$;
insert into storage.objects(bucket_id,name) values('documents','11111111-1111-4111-8111-111111111111/own.pdf');
do $$ begin
 begin
 insert into storage.objects(bucket_id,name) values('signatures','22222222-2222-4222-8222-222222222222/forged.png');
 raise exception 'Foreign storage write was allowed';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into storage.objects(bucket_id,name) values('signatures','22222222-2222-4222-8222-222222222222/private.png');
set role authenticated;
do $$ begin
 if (select count(*) from storage.objects)<>1 then raise exception 'Cross-user storage listing leak';end if;
end $$;
reset role;
do $$ begin
 if (select display_name from public.profiles where id='22222222-2222-4222-8222-222222222222')<>'Bob' then raise exception 'Foreign profile was modified';end if;
 begin
 insert into public.uploaded_documents(owner_id,project_id,name,storage_path,content_hash,size_bytes) values('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Forbidden relation','x','unique',1);
 raise exception 'Cross-user project link allowed';
 exception when foreign_key_violation then null;end;
end $$;
select 'PASS: row/profile isolation, backend-only writes, audit protection, private storage policies and ownership FKs' as result;
-- Deletion preserves generation/signing history without retaining the original assets.
insert into public.document_templates(id,owner_id,name) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','Disposable template');
insert into public.extracted_datasets(id,owner_id,name) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','Disposable data');
insert into public.signatures(id,owner_id,name,storage_path) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','Disposable image','private/path');
insert into public.generation_jobs(id,owner_id,template_id,dataset_id) values('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
insert into public.signing_authorisations(owner_id,signature_id,job_id,scope) values('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff','{}');
delete from public.document_templates where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
delete from public.extracted_datasets where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
delete from public.signatures where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
do $$ begin
 if not exists(select 1 from public.generation_jobs where id='ffffffff-ffff-4fff-8fff-ffffffffffff' and template_id is null and dataset_id is null and owner_id='11111111-1111-4111-8111-111111111111') then raise exception 'History lost on source deletion';end if;
 if not exists(select 1 from public.signing_authorisations where signature_id is null and owner_id='11111111-1111-4111-8111-111111111111') then raise exception 'Authorisation lost on signature deletion';end if;
end $$;
