-- Run AFTER reviewed queue.sql. All changes (including temporary gate=true)
-- are inside this transaction and rolled back. No production rows are deleted.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('d1111111-1111-4111-8111-111111111111','jarvis-queue-qa-a@example.invalid',now(),false),
('e2222222-2222-4222-8222-222222222222','jarvis-queue-qa-b@example.invalid',now(),false),
('f3333333-3333-4333-8333-333333333333','jarvis-queue-qa-c@example.invalid',now(),false);
insert into public.jarvis_allowed_emails(email) values('jarvis-queue-qa-a@example.invalid'),('jarvis-queue-qa-b@example.invalid');
update public.jarvis_queue_settings set enabled=false where singleton;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ declare a jsonb; b jsonb; d jsonb; n jsonb; state jsonb;
begin
  n:=public.jarvis_note_create('Fila QA fonte','configuração evidência','raw');
  perform set_config('jarvis.qa.qnote',n->>'id',true);
  a:=public.jarvis_chat_enqueue('configuração primeiro','a1111111-1111-4111-8111-111111111111');
  b:=public.jarvis_chat_enqueue('segundo depois da resposta','b2222222-2222-4222-8222-222222222222');
  if a->>'position'<>'1' or b->>'position'<>'2' then raise exception 'QA enqueue FIFO positions'; end if;
  if public.jarvis_chat_job((b->>'jobId')::uuid)->>'position'<>'2' then raise exception 'QA get FIFO position'; end if;
  perform set_config('jarvis.qa.qfirst',a->>'jobId',true);
  perform set_config('jarvis.qa.qsecond',b->>'jobId',true);
  if public.jarvis_chat_enqueue('configuração primeiro','a1111111-1111-4111-8111-111111111111')->>'jobId'<>a->>'jobId' then raise exception 'QA enqueue not idempotent'; end if;
  begin perform public.jarvis_chat_enqueue('different payload','a1111111-1111-4111-8111-111111111111'); raise exception 'QA mismatched id accepted';
  exception when sqlstate 'JQ409' then null; end;
  d:=public.jarvis_worker_register(repeat('a',64));
  perform set_config('jarvis.qa.qdevice',d->>'deviceId',true);
  perform public.jarvis_worker_heartbeat((d->>'deviceId')::uuid,repeat('a',64),'ready','none');
  state:=public.jarvis_queue_state();
  if state->'worker'->>'status'<>'blocked' or state->'worker'->>'reason'<>'policy_unverified' then raise exception 'QA gate bypass via heartbeat'; end if;
  if state->'jobs'->0->>'position'<>'2' or state->'jobs'->1->>'position'<>'1' then raise exception 'QA state FIFO positions'; end if;
  begin perform public.jarvis_worker_claim((d->>'deviceId')::uuid,repeat('a',64)); raise exception 'QA disabled dispatch gate bypass';
  exception when sqlstate 'JQ503' then null; end;
  begin update public.jarvis_queue_settings set enabled=true; raise exception 'QA client gate write';
  exception when insufficient_privilege then null; end;
  begin perform token_hash from public.jarvis_worker_devices; raise exception 'QA token hash exposed';
  exception when insufficient_privilege then null; end;
  begin perform prompt from public.jarvis_chat_jobs; raise exception 'QA raw prompt exposed';
  exception when insufficient_privilege then null; end;
  begin perform public.jarvis_queue_maintenance(auth.uid()); raise exception 'QA private helper executable';
  exception when insufficient_privilege then null; end;
end $$;

-- Authorization is independent of the API. A different account cannot see a
-- job or use its device even if it knows their UUIDs and the token hash.
select set_config('request.jwt.claims','{"sub":"e2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ declare other_note jsonb; begin
  if jsonb_array_length(public.jarvis_queue_state()->'jobs')<>0 then raise exception 'QA cross-owner state'; end if;
  begin perform public.jarvis_chat_job(current_setting('jarvis.qa.qfirst')::uuid); raise exception 'QA cross-owner job';
  exception when sqlstate 'PT404' then null; end;
  begin perform public.jarvis_chat_cancel(current_setting('jarvis.qa.qfirst')::uuid); raise exception 'QA cross-owner cancel';
  exception when sqlstate 'PT404' then null; end;
  begin perform public.jarvis_worker_heartbeat(current_setting('jarvis.qa.qdevice')::uuid,repeat('a',64),'ready','none'); raise exception 'QA cross-owner device';
  exception when sqlstate 'JQ403' then null; end;
  other_note:=public.jarvis_note_create('Outro dono','Não pode ser fonte de A','raw');
  perform set_config('jarvis.qa.qothernote',other_note->>'id',true);
end $$;
select set_config('request.jwt.claims','{"sub":"f3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
do $$ begin
  begin perform public.jarvis_chat_enqueue('unauthorized',gen_random_uuid()); raise exception 'QA allowlist bypass';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform public.jarvis_queue_state(); raise exception 'QA anonymous state'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Administrative test gate change is temporary and invisible to other
-- transactions until commit; this file ends with ROLLBACK, never commit.
update public.jarvis_queue_settings set enabled=true where singleton;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ declare job jsonb; done jsonb; replay jsonb; device uuid:=current_setting('jarvis.qa.qdevice')::uuid; sources jsonb;
begin
  job:=public.jarvis_worker_claim(device,repeat('a',64));
  if job->>'jobId'<>current_setting('jarvis.qa.qfirst') then raise exception 'QA FIFO order'; end if;
  if public.jarvis_chat_job((job->>'jobId')::uuid)->>'position'<>'1'
    or public.jarvis_chat_job(current_setting('jarvis.qa.qsecond')::uuid)->>'position'<>'2' then raise exception 'QA position must include processing'; end if;
  perform set_config('jarvis.qa.qattempt',job->>'attemptId',true);
  if public.jarvis_worker_claim(device,repeat('a',64))<>jsonb_build_object('job',null) then raise exception 'QA multiple processing jobs'; end if;
  begin perform public.jarvis_worker_complete(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid,'before start'); raise exception 'QA completed before start';
  exception when sqlstate 'JQ409' then null; end;
  sources:=jsonb_build_array(jsonb_build_object('id',current_setting('jarvis.qa.qnote'),'title','Fila QA fonte'));
  begin perform public.jarvis_worker_prepare(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid,repeat('x',32001),sources); raise exception 'QA prompt over budget';
  exception when sqlstate 'PT400' then null; end;
  begin perform public.jarvis_worker_prepare(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid,'safe',
    jsonb_build_array(jsonb_build_object('id',current_setting('jarvis.qa.qothernote'),'title','Outro dono'))); raise exception 'QA cross-owner sources';
  exception when sqlstate 'PT400' then null; end;
  perform public.jarvis_worker_prepare(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid,'bounded synthetic prompt',sources);
  begin perform public.jarvis_worker_prepare(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid,'different prompt',sources); raise exception 'QA mutated snapshot';
  exception when sqlstate 'JQ409' then null; end;
  if public.jarvis_worker_start(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid)->>'alreadyStarted'<>'false' then raise exception 'QA first start'; end if;
  if public.jarvis_worker_start(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid)->>'alreadyStarted'<>'true' then raise exception 'QA replay start'; end if;
  perform public.jarvis_worker_renew(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid);
  done:=public.jarvis_worker_complete(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid,'first answer');
  replay:=public.jarvis_worker_complete(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid,'first answer');
  if done<>replay then raise exception 'QA completion not idempotent'; end if;
  if done->'position'<>'null'::jsonb or public.jarvis_chat_job(current_setting('jarvis.qa.qsecond')::uuid)->>'position'<>'1' then raise exception 'QA terminal/advanced position'; end if;
  if jsonb_array_length(public.jarvis_state()->'messages')<>2 then raise exception 'QA duplicate or partial message pair'; end if;
  if done->'sources'<>sources then raise exception 'QA sources not from snapshot'; end if;
  begin perform public.jarvis_worker_complete(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid,'different result'); raise exception 'QA mismatched completion';
  exception when sqlstate 'JQ409' then null; end;
  job:=public.jarvis_worker_claim(device,repeat('a',64));
  if job->>'jobId'<>current_setting('jarvis.qa.qsecond') or job->'context'->'messages'->1->>'content'<>'first answer' then raise exception 'QA next context before prior reply'; end if;
  perform set_config('jarvis.qa.qoldattempt',job->>'attemptId',true);
end $$;
reset role;
update public.jarvis_chat_jobs set lease_until=clock_timestamp()-interval '1 second'
  where owner_id='d1111111-1111-4111-8111-111111111111' and id=current_setting('jarvis.qa.qsecond')::uuid;
set local role authenticated;
do $$ declare job jsonb; device uuid:=current_setting('jarvis.qa.qdevice')::uuid;
begin
  if public.jarvis_chat_job(current_setting('jarvis.qa.qsecond')::uuid)->>'status'<>'queued' then raise exception 'QA pre-start loss not requeued'; end if;
  begin perform public.jarvis_worker_start(device,repeat('a',64),current_setting('jarvis.qa.qsecond')::uuid,current_setting('jarvis.qa.qoldattempt')::uuid); raise exception 'QA stale start accepted';
  exception when sqlstate 'JQ409' then null; end;
  job:=public.jarvis_worker_claim(device,repeat('a',64));
  if job->>'attemptId'=current_setting('jarvis.qa.qoldattempt') then raise exception 'QA attempt reused'; end if;
  perform set_config('jarvis.qa.qnewattempt',job->>'attemptId',true);
  perform public.jarvis_worker_prepare(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid,'safe prompt','[]'::jsonb);
  perform public.jarvis_worker_start(device,repeat('a',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid);
end $$;
reset role;
update public.jarvis_queue_settings set enabled=false where singleton;
set local role authenticated;
do $$ declare device uuid:=current_setting('jarvis.qa.qdevice')::uuid; begin
  begin perform public.jarvis_worker_renew(device,repeat('a',64),current_setting('jarvis.qa.qsecond')::uuid,current_setting('jarvis.qa.qnewattempt')::uuid); raise exception 'QA renew bypass after disabling gate';
  exception when sqlstate 'JQ503' then null; end;
  begin perform public.jarvis_worker_complete(device,repeat('a',64),current_setting('jarvis.qa.qsecond')::uuid,current_setting('jarvis.qa.qnewattempt')::uuid,'blocked new answer'); raise exception 'QA completion bypass after disabling gate';
  exception when sqlstate 'JQ503' then null; end;
  if public.jarvis_worker_complete(device,repeat('a',64),current_setting('jarvis.qa.qfirst')::uuid,current_setting('jarvis.qa.qattempt')::uuid,'first answer')->>'status'<>'completed' then raise exception 'QA disabled gate should permit exact completed replay'; end if;
end $$;
reset role;
update public.jarvis_queue_settings set enabled=true where singleton;
update public.jarvis_chat_jobs set lease_until=clock_timestamp()-interval '1 second'
  where owner_id='d1111111-1111-4111-8111-111111111111' and id=current_setting('jarvis.qa.qsecond')::uuid;
update public.jarvis_worker_devices set last_seen=clock_timestamp()-interval '91 seconds'
  where owner_id='d1111111-1111-4111-8111-111111111111' and id=current_setting('jarvis.qa.qdevice')::uuid;
set local role authenticated;
do $$ declare job jsonb; device uuid:=current_setting('jarvis.qa.qdevice')::uuid; backup jsonb; n integer:=0;
begin
  job:=public.jarvis_chat_job(current_setting('jarvis.qa.qsecond')::uuid);
  if job->>'status'<>'failed' or job->>'errorCode'<>'execution_uncertain' then raise exception 'QA post-start loss not uncertain'; end if;
  if public.jarvis_worker_claim(device,repeat('a',64))<>jsonb_build_object('job',null) then raise exception 'QA uncertain execution re-run'; end if;
  begin perform public.jarvis_worker_complete(device,repeat('a',64),current_setting('jarvis.qa.qsecond')::uuid,current_setting('jarvis.qa.qnewattempt')::uuid,'late result'); raise exception 'QA late result accepted';
  exception when sqlstate 'JQ409' then null; end;
  if public.jarvis_queue_state()->'worker'->>'status'<>'offline' then raise exception 'QA offline threshold'; end if;
  for i in 1..5 loop perform public.jarvis_chat_enqueue('pending '||i,gen_random_uuid()); end loop;
  begin perform public.jarvis_chat_enqueue('sixth pending',gen_random_uuid()); raise exception 'QA pending limit';
  exception when sqlstate 'JQ429' then null; end;
  for job in select value from jsonb_array_elements(public.jarvis_queue_state()->'jobs') loop
    if job->>'status'='queued' then perform public.jarvis_chat_cancel((job->>'jobId')::uuid); end if;
  end loop;
  loop
    begin
      job:=public.jarvis_chat_enqueue('hourly '||n,gen_random_uuid());
      perform public.jarvis_chat_cancel((job->>'jobId')::uuid);
      n:=n+1;
      if n>20 then raise exception 'QA hourly quota bypass'; end if;
    exception when sqlstate 'PT429' then exit; end;
  end loop;
  if n<>13 then raise exception 'QA exact quota (2 original + 5 pending + 13): %',n; end if;
  backup:=public.jarvis_backup();
  if jsonb_array_length(backup->'jobs')<>20 or jsonb_array_length(backup->'messages')<>2 then raise exception 'QA backup incomplete'; end if;
  if backup::text like '%token_hash%' or backup::text like '%"prompt"%' or backup::text like '%bounded synthetic prompt%' then raise exception 'QA private data in export'; end if;
  perform public.jarvis_worker_revoke(device);
  begin perform public.jarvis_worker_complete(device,repeat('a',64),current_setting('jarvis.qa.qfirst')::uuid,current_setting('jarvis.qa.qattempt')::uuid,'first answer'); raise exception 'QA revoked result retry accepted';
  exception when sqlstate 'JQ403' then null; end;
end $$;
reset role;
-- Only synthetic records are modified for lazy TTL and revocation checks.
update public.jarvis_chat_jobs set created_at=clock_timestamp()-interval '2 hours'
  where owner_id='d1111111-1111-4111-8111-111111111111';
set local role authenticated;
do $$ declare device jsonb; next_device jsonb; job jsonb;
begin
  device:=public.jarvis_worker_register(repeat('b',64));
  job:=public.jarvis_chat_enqueue('expire this',gen_random_uuid());
  perform set_config('jarvis.qa.qexpiry',job->>'jobId',true);
  job:=public.jarvis_worker_claim((device->>'deviceId')::uuid,repeat('b',64));
  perform public.jarvis_worker_prepare((device->>'deviceId')::uuid,repeat('b',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid,'safe','[]'::jsonb);
  perform public.jarvis_worker_start((device->>'deviceId')::uuid,repeat('b',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid);
  next_device:=public.jarvis_worker_register(repeat('c',64));
  if public.jarvis_chat_job((job->>'jobId')::uuid)->>'status'<>'cancelled' then raise exception 'QA replacement did not cancel lease'; end if;
  begin perform public.jarvis_worker_renew((device->>'deviceId')::uuid,repeat('b',64),(job->>'jobId')::uuid,(job->>'attemptId')::uuid); raise exception 'QA old device renewal';
  exception when sqlstate 'JQ403' then null; end;
  job:=public.jarvis_chat_enqueue('TTL queued',gen_random_uuid());
  perform set_config('jarvis.qa.qexpiry',job->>'jobId',true);
end $$;
reset role;
update public.jarvis_chat_jobs set expires_at=clock_timestamp()-interval '1 second'
  where owner_id='d1111111-1111-4111-8111-111111111111' and id=current_setting('jarvis.qa.qexpiry')::uuid;
set local role authenticated;
do $$ begin
  if public.jarvis_chat_job(current_setting('jarvis.qa.qexpiry')::uuid)->>'status'<>'expired' then raise exception 'QA lazy TTL'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.jarvis_chat_jobs where owner_id='d1111111-1111-4111-8111-111111111111' and status in ('completed','failed','cancelled','expired') and prompt is not null) then raise exception 'QA terminal prompt retained'; end if;
  if (select count(*) from public.jarvis_worker_devices where owner_id='d1111111-1111-4111-8111-111111111111' and revoked_at is null)<>1 then raise exception 'QA multiple active devices'; end if;
end $$;
select 'passed' as queue_transactional_smoke;
rollback;
