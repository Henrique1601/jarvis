begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('a1111111-1111-4111-8111-111111111111','jarvis-qa-a@example.invalid',now(),false),
('b2222222-2222-4222-8222-222222222222','jarvis-qa-b@example.invalid',now(),false),
('c3333333-3333-4333-8333-333333333333','jarvis-qa-c@example.invalid',now(),false);
insert into public.jarvis_allowed_emails(email) values('jarvis-qa-a@example.invalid'),('jarvis-qa-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ declare n jsonb; updated jsonb; h jsonb; slot uuid; begin
  n := public.jarvis_note_create('QA nota', '# Memória original', 'raw');
  perform set_config('jarvis.qa.note',n->>'id',true);
  updated := public.jarvis_note_update((n->>'id')::uuid,n->>'revision','# Memória editada');
  begin
    perform public.jarvis_note_update((n->>'id')::uuid,n->>'revision','stale');
    raise exception 'QA expected revision conflict';
  exception when sqlstate 'PT409' then null; end;
  h := public.jarvis_note_history((n->>'id')::uuid);
  if jsonb_array_length(h->'versions') <> 1 then raise exception 'QA history'; end if;
  updated := public.jarvis_note_restore((n->>'id')::uuid,(h->'versions'->0->>'id')::uuid,updated->>'revision');
  if updated->>'content' <> '# Memória original' then raise exception 'QA restore'; end if;
  perform public.jarvis_task_save(null,false,'QA tarefa');
  slot := public.jarvis_chat_reserve();
  perform public.jarvis_chat_append(slot,'QA pedido','QA resposta','[]'::jsonb);
  if jsonb_array_length(public.jarvis_state()->'messages')<>2 then raise exception 'QA atomic message pair'; end if;
  begin
    perform public.jarvis_chat_append(slot,'duplicado','duplicado','[]'::jsonb);
    raise exception 'QA reservation reused';
  exception when sqlstate 'PT400' then null; end;
  slot := public.jarvis_chat_reserve();
  begin
    perform public.jarvis_chat_append(slot,'QA','QA',jsonb_build_array(jsonb_build_object('id',n->>'id','title',repeat('a',12000))));
    raise exception 'QA huge sources accepted';
  exception when sqlstate 'PT400' then null; end;
  for i in 1..18 loop perform public.jarvis_chat_reserve(); end loop;
  begin perform public.jarvis_chat_reserve(); raise exception 'QA hourly quota bypass';
  exception when sqlstate 'PT429' then null; end;
  if jsonb_array_length(public.jarvis_backup()->'history')<>2 then raise exception 'QA backup incomplete'; end if;
  begin
    insert into public.jarvis_tasks(owner_id,text) values(auth.uid(),'direct write');
    raise exception 'QA direct write accepted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ begin
  if (select count(*) from public.jarvis_notes)<>0 then raise exception 'QA cross-user direct read'; end if;
  if jsonb_array_length(public.jarvis_state()->'notes')<>0 then raise exception 'QA cross-user state'; end if;
  begin
    perform public.jarvis_note_read(current_setting('jarvis.qa.note')::uuid);
    raise exception 'QA cross-user note RPC';
  exception when sqlstate 'PT404' then null; end;
  perform public.jarvis_note_create('Outro usuário','Somente conta B','wiki');
end $$;
select set_config('request.jwt.claims','{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
do $$ begin
  if public.jarvis_can_access() then raise exception 'QA allowlist bypass'; end if;
  if (select count(*) from public.jarvis_notes)<>0 then raise exception 'QA unauthorized table read'; end if;
  begin perform public.jarvis_state(); raise exception 'QA unauthorized RPC';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform public.jarvis_state(); raise exception 'QA anonymous RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'passed' as transactional_database_smoke;
rollback;
