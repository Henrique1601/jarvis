-- Synthetic accounts and changes are rolled back; no existing data is touched.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('d5555555-5555-4555-8555-555555555555','jarvis-features-qa-a@example.invalid',now(),false),
('e6666666-6666-4666-8666-666666666666','jarvis-features-qa-b@example.invalid',now(),false);
insert into public.jarvis_allowed_emails(email) values('jarvis-features-qa-a@example.invalid'),('jarvis-features-qa-b@example.invalid');
update public.jarvis_queue_settings set enabled=true where singleton;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d5555555-5555-4555-8555-555555555555","role":"authenticated"}',true);
do $$ declare c jsonb; other jsonb; n jsonb; t jsonb; j jsonb; claimed jsonb; d jsonb; result jsonb; begin
 c:=public.jarvis_conversation_create('Estudos'); other:=public.jarvis_conversation_create('Trabalho');
 perform set_config('jarvis.qa.fc',c->>'id',true);
 if public.jarvis_conversation_update((c->>'id')::uuid,'JavaScript')->>'title'<>'JavaScript' then raise exception 'rename failed'; end if;
 n:=public.jarvis_note_create('Biologia','Células','raw'); perform set_config('jarvis.qa.fn',n->>'id',true);
 result:=public.jarvis_note_metadata((n->>'id')::uuid,n->>'revision',array['Estudos'],'wiki');
 if result->>'revision'=n->>'revision' then raise exception 'metadata revision unchanged'; end if;
 begin perform public.jarvis_note_metadata((n->>'id')::uuid,n->>'revision',array['Old'],'raw'); raise exception 'stale metadata accepted'; exception when sqlstate 'PT409' then null; end;
 t:=public.jarvis_task_details(null,'Estudar',false,'2026-10-12','high','JavaScript');
 if t->>'dueDate'<>'2026-10-12' or t->>'priority'<>'high' then raise exception 'task details lost'; end if;
 perform set_config('jarvis.qa.ft',t->>'id',true);
 j:=public.jarvis_chat_enqueue_options('Pedido selecionado','a5555555-5555-4555-8555-555555555555',(c->>'id')::uuid,'{}',false);
 if public.jarvis_chat_enqueue_options('Pedido selecionado','a5555555-5555-4555-8555-555555555555',(c->>'id')::uuid,'{}',false)->>'jobId'<>j->>'jobId' then raise exception 'duplicate job'; end if;
 begin perform public.jarvis_chat_enqueue_options('Pedido selecionado','a5555555-5555-4555-8555-555555555555',(other->>'id')::uuid,'{}',false); raise exception 'conversation mismatch accepted'; exception when sqlstate 'JQ409' then null; end;
 begin perform public.jarvis_chat_enqueue_options('Pedido selecionado','a5555555-5555-4555-8555-555555555555',(c->>'id')::uuid,null,false); raise exception 'selection mismatch accepted'; exception when sqlstate 'JQ409' then null; end;
 begin perform public.jarvis_chat_enqueue('Pedido selecionado','a5555555-5555-4555-8555-555555555555'); raise exception 'legacy idempotency bypass'; exception when sqlstate 'JQ409' then null; end;
 d:=public.jarvis_worker_register(repeat('a',64)); claimed:=public.jarvis_worker_claim((d->>'deviceId')::uuid,repeat('a',64));
 if jsonb_array_length(claimed->'context'->'notes')<>0 or jsonb_array_length(claimed->'context'->'tasks')<>0 then raise exception 'selection not honored'; end if;
 perform public.jarvis_worker_prepare((d->>'deviceId')::uuid,repeat('a',64),(claimed->>'jobId')::uuid,(claimed->>'attemptId')::uuid,'Synthetic prompt','[]');
 perform public.jarvis_worker_start((d->>'deviceId')::uuid,repeat('a',64),(claimed->>'jobId')::uuid,(claimed->>'attemptId')::uuid);
 perform public.jarvis_worker_complete((d->>'deviceId')::uuid,repeat('a',64),(claimed->>'jobId')::uuid,(claimed->>'attemptId')::uuid,'Synthetic answer');
 j:=public.jarvis_chat_enqueue_options('Outro assunto',gen_random_uuid(),(other->>'id')::uuid,array[(n->>'id')::uuid],true);
 claimed:=public.jarvis_worker_claim((d->>'deviceId')::uuid,repeat('a',64));
 if jsonb_array_length(claimed->'context'->'messages')<>0 then raise exception 'conversation history leaked'; end if;
 if jsonb_array_length(claimed->'context'->'notes')<>1 or jsonb_array_length(claimed->'context'->'tasks')<>1 then raise exception 'selected context missing'; end if;
 result:=public.jarvis_state();
 if result->'messages'->0->>'conversationId'<>c->>'id' then raise exception 'response conversation lost'; end if;
 if public.jarvis_backup()->>'format'<>'jarvis-cloud-v2' then raise exception 'backup format'; end if;
 begin perform public.jarvis_default_conversation(auth.uid()); raise exception 'private helper public'; exception when insufficient_privilege then null; end;
 begin insert into public.jarvis_conversations(owner_id,title) values(auth.uid(),'bypass'); raise exception 'direct write'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"e6666666-6666-4666-8666-666666666666","role":"authenticated"}',true);
do $$ declare s jsonb; begin
 s:=public.jarvis_state();
 if jsonb_array_length(s->'messages')<>0 or jsonb_array_length(s->'notes')<>0 then raise exception 'cross owner state'; end if;
 begin perform public.jarvis_conversation_update(current_setting('jarvis.qa.fc')::uuid,'Forged'); raise exception 'cross owner conversation'; exception when sqlstate 'PT404' then null; end;
 begin perform public.jarvis_task_details(current_setting('jarvis.qa.ft')::uuid,'Forged',true,null,'low',''); raise exception 'cross owner task'; exception when sqlstate 'PT404' then null; end;
 begin perform public.jarvis_note_metadata(current_setting('jarvis.qa.fn')::uuid,repeat('a',64),'{}','raw'); raise exception 'cross owner metadata'; exception when sqlstate 'PT404' then null; end;
 begin perform public.jarvis_chat_enqueue_options('Forged',gen_random_uuid(),current_setting('jarvis.qa.fc')::uuid,'{}',false); raise exception 'cross owner queue'; exception when sqlstate 'PT404' then null; end;
 begin perform public.jarvis_chat_enqueue_options('Forged',gen_random_uuid(),null,array[current_setting('jarvis.qa.fn')::uuid],false); raise exception 'cross owner selected note'; exception when sqlstate 'PT404' then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.jarvis_conversation_create('Anonymous'); raise exception 'anon create'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'features isolation, idempotency, metadata revisions, context and completion passed' as verification;
rollback;
