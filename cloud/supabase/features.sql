-- Apply after schema.sql and queue.sql. Additive; no records are deleted.
-- Rollback: restore the previous application. Preserve these columns and tables.
begin;
create table if not exists public.jarvis_conversations (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 160), created_at timestamptz not null default now(),
 is_default boolean not null default false, unique(id,owner_id));
create unique index if not exists jarvis_conversation_default on public.jarvis_conversations(owner_id) where is_default;
alter table public.jarvis_conversations enable row level security;
revoke all on public.jarvis_conversations from public,anon,authenticated;
grant select on public.jarvis_conversations to authenticated;
drop policy if exists jarvis_conversations_read on public.jarvis_conversations;
create policy jarvis_conversations_read on public.jarvis_conversations for select to authenticated using(owner_id=(select auth.uid()) and (select public.jarvis_can_access()));
alter table public.jarvis_notes add column if not exists tags text[] not null default '{}';
alter table public.jarvis_tasks add column if not exists due_date date;
alter table public.jarvis_tasks add column if not exists priority text not null default 'normal' check(priority in ('low','normal','high'));
alter table public.jarvis_tasks add column if not exists project text not null default '' check(char_length(project)<=80);
alter table public.jarvis_messages add column if not exists conversation_id uuid;
alter table public.jarvis_chat_jobs add column if not exists conversation_id uuid;
alter table public.jarvis_chat_jobs add column if not exists context_note_ids uuid[];
alter table public.jarvis_chat_jobs add column if not exists include_tasks boolean not null default true;
create or replace function public.jarvis_default_conversation(p_owner uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 insert into public.jarvis_conversations(owner_id,title,is_default) values(p_owner,'Geral',true) on conflict(owner_id) where is_default do nothing;
 select id into result from public.jarvis_conversations where owner_id=p_owner and is_default; return result;
end; $$;
insert into public.jarvis_conversations(owner_id,title,is_default)
 select distinct owner_id,'Geral',true from (select owner_id from public.jarvis_messages union select owner_id from public.jarvis_chat_jobs) owners
 on conflict(owner_id) where is_default do nothing;
update public.jarvis_messages m set conversation_id=c.id from public.jarvis_conversations c where m.owner_id=c.owner_id and c.is_default and m.conversation_id is null;
update public.jarvis_chat_jobs j set conversation_id=c.id from public.jarvis_conversations c where j.owner_id=c.owner_id and c.is_default and j.conversation_id is null;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='jarvis_messages_conversation_owner') then alter table public.jarvis_messages add constraint jarvis_messages_conversation_owner foreign key(conversation_id,owner_id) references public.jarvis_conversations(id,owner_id); end if;
 if not exists(select 1 from pg_constraint where conname='jarvis_jobs_conversation_owner') then alter table public.jarvis_chat_jobs add constraint jarvis_jobs_conversation_owner foreign key(conversation_id,owner_id) references public.jarvis_conversations(id,owner_id); end if;
end $$;
create or replace function public.jarvis_assign_conversation() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.conversation_id is null then new.conversation_id:=public.jarvis_default_conversation(new.owner_id); end if; return new;
end; $$;
drop trigger if exists jarvis_message_conversation on public.jarvis_messages;
create trigger jarvis_message_conversation before insert on public.jarvis_messages for each row execute function public.jarvis_assign_conversation();
drop trigger if exists jarvis_job_conversation on public.jarvis_chat_jobs;
create trigger jarvis_job_conversation before insert on public.jarvis_chat_jobs for each row execute function public.jarvis_assign_conversation();
alter table public.jarvis_messages alter column conversation_id set not null;
alter table public.jarvis_chat_jobs alter column conversation_id set not null;
create index if not exists jarvis_messages_conversation on public.jarvis_messages(owner_id,conversation_id,sequence);
create or replace function public.jarvis_conversation_create(p_title text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare owner uuid:=public.jarvis_owner(); c public.jarvis_conversations; begin
 if p_title is null or char_length(btrim(p_title)) not between 1 and 160 then raise sqlstate 'PT400' using message='invalid title'; end if;
 perform public.jarvis_queue_lock(owner);
 if (select count(*) from public.jarvis_conversations where owner_id=owner)>=200 then raise sqlstate 'PT413' using message='conversation limit'; end if;
 insert into public.jarvis_conversations(owner_id,title) values(owner,btrim(p_title)) returning * into c;
 return jsonb_build_object('id',c.id,'title',c.title,'createdAt',c.created_at);
end; $$;
create or replace function public.jarvis_conversation_update(p_id uuid,p_title text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare owner uuid:=public.jarvis_owner(); c public.jarvis_conversations; begin
 if p_title is null or char_length(btrim(p_title)) not between 1 and 160 then raise sqlstate 'PT400' using message='invalid title'; end if;
 update public.jarvis_conversations set title=btrim(p_title) where id=p_id and owner_id=owner returning * into c;
 if not found then raise sqlstate 'PT404' using message='conversation not found'; end if;
 return jsonb_build_object('id',c.id,'title',c.title,'createdAt',c.created_at);
end; $$;
create or replace function public.jarvis_task_details(p_id uuid,p_text text,p_done boolean,p_due_date date,p_priority text,p_project text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare owner uuid:=public.jarvis_owner(); t public.jarvis_tasks; begin
 if p_text is null or char_length(btrim(p_text)) not between 1 and 300 or p_priority is null or p_priority not in ('low','normal','high') or p_project is null or char_length(p_project)>80 then raise sqlstate 'PT400' using message='invalid task'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tasks:'||owner::text,0));
 if p_id is null then
 if (select count(*) from public.jarvis_tasks where owner_id=owner)>=500 then raise sqlstate 'PT413' using message='task count limit'; end if;
 insert into public.jarvis_tasks(owner_id,text,done,due_date,priority,project) values(owner,btrim(p_text),coalesce(p_done,false),p_due_date,p_priority,p_project) returning * into t;
 else
 update public.jarvis_tasks set text=btrim(p_text),done=coalesce(p_done,done),due_date=p_due_date,priority=p_priority,project=p_project where id=p_id and owner_id=owner returning * into t;
 if not found then raise sqlstate 'PT404' using message='task not found'; end if; end if;
 return (to_jsonb(t)-'owner_id'-'due_date')||jsonb_build_object('dueDate',t.due_date);
end; $$;
create or replace function public.jarvis_note_metadata(p_id uuid,p_revision text,p_tags text[],p_folder text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare owner uuid:=public.jarvis_owner(); n public.jarvis_notes; begin
 if p_tags is null or cardinality(p_tags)>10 or p_folder is null or p_folder not in ('raw','wiki','outputs') or exists(select 1 from unnest(p_tags) tag where tag is null or char_length(btrim(tag)) not between 1 and 40) then raise sqlstate 'PT400' using message='invalid metadata'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('notes:'||owner::text,0));
 select * into n from public.jarvis_notes where id=p_id and owner_id=owner for update;
 if not found then raise sqlstate 'PT404' using message='note not found'; end if;
 if p_revision is null or n.revision<>p_revision then raise sqlstate 'PT409' using message='revision conflict'; end if;
 update public.jarvis_notes set tags=p_tags,folder=p_folder where id=p_id and owner_id=owner returning * into n;
 return to_jsonb(n)-'owner_id';
end; $$;

create or replace function public.jarvis_note_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.revision := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object('content',new.content,'folder',new.folder,'tags',new.tags)::text, 'UTF8')), 'hex');
  new.updated_at := now();
  if tg_op = 'UPDATE' and old.content is distinct from new.content then
    if (select coalesce(sum(octet_length(content)),0) from public.jarvis_history where owner_id = old.owner_id)
       + octet_length(old.content) > 1000000 then
      raise sqlstate 'PT413' using message = 'history storage limit';
    end if;
    insert into public.jarvis_history(owner_id, note_id, content, revision)
      values(old.owner_id, old.id, old.content, old.revision);
  end if;
  return new;
end; $$;
create or replace function public.jarvis_chat_enqueue_options(p_request text,p_request_id uuid,p_conversation_id uuid,p_context_note_ids uuid[],p_include_tasks boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); convo uuid; prior public.jarvis_chat_jobs; result jsonb; ids uuid[];
begin
 perform public.jarvis_queue_lock(owner);
 convo:=coalesce(p_conversation_id,public.jarvis_default_conversation(owner));
 if not exists(select 1 from public.jarvis_conversations where id=convo and owner_id=owner) then raise sqlstate 'PT404' using message='conversation not found'; end if;
 if p_include_tasks is null or (p_context_note_ids is not null and cardinality(p_context_note_ids)>6) then raise sqlstate 'PT400' using message='invalid selection'; end if;
 if p_context_note_ids is not null then
 select coalesce(array_agg(distinct n order by n),'{}'::uuid[]) into ids from unnest(p_context_note_ids) n;
 if exists(select 1 from unnest(ids) n where n is null or not exists(select 1 from public.jarvis_notes where id=n and owner_id=owner)) then raise sqlstate 'PT404' using message='note not found'; end if;
 end if;
 select * into prior from public.jarvis_chat_jobs where owner_id=owner and request_id=p_request_id;
 if found and (prior.request is distinct from p_request or prior.conversation_id is distinct from convo or prior.context_note_ids is distinct from ids or prior.include_tasks is distinct from p_include_tasks) then raise sqlstate 'JQ409' using message='idempotency mismatch'; end if;
 if p_request_id is null or p_request is null or char_length(p_request) not between 1 and 12000 or btrim(p_request)='' then raise sqlstate 'PT400' using message='invalid request'; end if;
 perform public.jarvis_queue_maintenance(owner);
 if prior.id is null then
 if (select count(*) from public.jarvis_chat_jobs where owner_id=owner and status in ('queued','processing'))>=5 then raise sqlstate 'JQ429' using message='queue full'; end if;
 if (select count(*) from public.jarvis_chat_jobs where owner_id=owner and created_at>clock_timestamp()-interval '1 hour')>=20 then raise sqlstate 'PT429' using message='hourly new request limit'; end if;
 insert into public.jarvis_chat_jobs(owner_id,request_id,request,conversation_id,context_note_ids,include_tasks) values(owner,p_request_id,p_request,convo,ids,p_include_tasks) returning * into prior;
 else select * into prior from public.jarvis_chat_jobs where id=prior.id and owner_id=owner;
 end if;
 result:=jsonb_build_object('jobId',prior.id,'status',prior.status,'expiresAt',prior.expires_at,'position',public.jarvis_job_view(prior)->'position');
 return result||jsonb_build_object('conversationId',convo);
end; $$;
create or replace function public.jarvis_conversation_context(p_conversation_id uuid,p_note_ids uuid[],p_include_tasks boolean) returns jsonb
language plpgsql security definer set search_path='' as $$ declare owner uuid:=public.jarvis_owner(); begin
 if not exists(select 1 from public.jarvis_conversations where id=p_conversation_id and owner_id=owner) then raise sqlstate 'PT404' using message='conversation not found'; end if;
 return jsonb_build_object(
 'notes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'content',content) order by id),'[]'::jsonb) from public.jarvis_notes where owner_id=owner and (p_note_ids is null or id=any(p_note_ids))),
 'explicitNotes',p_note_ids is not null,
 'tasks',case when p_include_tasks then (select coalesce(jsonb_agg(to_jsonb(t)-'owner_id' order by created_at,id),'[]'::jsonb) from (select * from public.jarvis_tasks where owner_id=owner order by created_at desc,id desc limit 50) t) else '[]'::jsonb end,
 'messages',(select coalesce(jsonb_agg(jsonb_build_object('role',role,'content',left(content,2000)) order by sequence),'[]'::jsonb) from (select * from public.jarvis_messages where owner_id=owner and conversation_id=p_conversation_id order by sequence desc limit 10) m));
end; $$;

create or replace function public.jarvis_worker_claim(p_device_id uuid,p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_worker_authorize(p_device_id,p_token_hash); job public.jarvis_chat_jobs;
begin
  if not public.jarvis_queue_enabled() then raise sqlstate 'JQ503' using message='policy gate blocked'; end if;
  perform public.jarvis_queue_maintenance(owner);
  if exists(select 1 from public.jarvis_chat_jobs where owner_id=owner and status='processing') then return jsonb_build_object('job',null); end if;
  select * into job from public.jarvis_chat_jobs where owner_id=owner and status='queued' order by created_at,id limit 1 for update;
  if not found then return jsonb_build_object('job',null); end if;
  update public.jarvis_chat_jobs set status='processing',device_id=p_device_id,attempt_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '240 seconds',
    prompt=null,sources='[]'::jsonb,started_at=null,error_code=null where id=job.id and owner_id=owner returning * into job;
  update public.jarvis_worker_devices set last_seen=clock_timestamp(),status='processing',reason='busy' where id=p_device_id and owner_id=owner;
  return jsonb_build_object('jobId',job.id,'attemptId',job.attempt_id,'request',job.request,'context',public.jarvis_conversation_context(job.conversation_id,job.context_note_ids,job.include_tasks),'expiresAt',job.expires_at);
end; $$;

create or replace function public.jarvis_worker_complete(p_device_id uuid,p_token_hash text,p_job_id uuid,p_attempt_id uuid,p_answer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_worker_authorize(p_device_id,p_token_hash); job public.jarvis_chat_jobs; answer_digest text; message public.jarvis_messages;
begin
  if p_answer is null or char_length(p_answer) not between 1 and 32000 or btrim(p_answer)='' then raise sqlstate 'PT400' using message='invalid answer'; end if;
  -- authorize() already takes this owner lock; make the common ordering
  -- explicit: owner advisory FIRST, job row SECOND, message lock THIRD.
  -- Cancel/revoke/maintenance use the same order, avoiding crossed locks.
  perform public.jarvis_queue_lock(owner);
  answer_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_answer,'UTF8')),'hex');
  select * into job from public.jarvis_chat_jobs where id=p_job_id and owner_id=owner for update;
  if not found or job.device_id is distinct from p_device_id or job.attempt_id is distinct from p_attempt_id then raise sqlstate 'JQ409' using message='inactive attempt'; end if;
  if job.status='completed' then
    if job.answer_hash is distinct from answer_digest then raise sqlstate 'JQ409' using message='completion mismatch'; end if;
    return public.jarvis_job_view(job);
  end if;
  if not public.jarvis_queue_enabled() then raise sqlstate 'JQ503' using message='policy gate blocked'; end if;
  job:=public.jarvis_worker_attempt(p_device_id,p_token_hash,p_job_id,p_attempt_id);
  if job.started_at is null or job.prompt is null then raise sqlstate 'JQ409' using message='not started'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat:'||owner::text,0));
  if (select coalesce(sum(octet_length(content)+octet_length(sources::text)),0) from public.jarvis_messages where owner_id=owner)
    +octet_length(job.request)+octet_length(p_answer)+octet_length(job.sources::text)+2>1000000 then raise sqlstate 'PT413' using message='message storage limit'; end if;
  insert into public.jarvis_messages(owner_id,conversation_id,role,content) values(owner,job.conversation_id,'user',job.request);
  insert into public.jarvis_messages(owner_id,conversation_id,role,content,sources) values(owner,job.conversation_id,'assistant',p_answer,job.sources) returning * into message;
  update public.jarvis_chat_jobs set status='completed',answer=p_answer,answer_hash=answer_digest,message_id=message.id,
    finished_at=clock_timestamp(),prompt=null,lease_until=null where id=p_job_id and owner_id=owner returning * into job;
  update public.jarvis_worker_devices set status='ready',reason='none',last_seen=clock_timestamp() where id=p_device_id and owner_id=owner;
  return public.jarvis_job_view(job);
end; $$;

create or replace function public.jarvis_job_view(p_job public.jarvis_chat_jobs) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('conversationId',(p_job).conversation_id,'contextNoteIds',(p_job).context_note_ids,'includeTasks',(p_job).include_tasks,'jobId',(p_job).id,'requestId',(p_job).request_id,'text',(p_job).request,
    'status',(p_job).status,'createdAt',(p_job).created_at,'expiresAt',(p_job).expires_at,
    'startedAt',(p_job).started_at,'finishedAt',(p_job).finished_at,'answer',(p_job).answer,
    'sources',(p_job).sources,'errorCode',(p_job).error_code,
    'position',case when (p_job).status in ('queued','processing') then
      (select count(*) from public.jarvis_chat_jobs q where q.owner_id=(p_job).owner_id and q.status in ('queued','processing')
        and (q.created_at,q.id)<=((p_job).created_at,(p_job).id)) else null end);
$$;

create or replace function public.jarvis_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); result jsonb;
begin
  perform public.jarvis_default_conversation(owner);
  select jsonb_build_object(
    'conversations',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'createdAt',created_at) order by is_default desc,created_at,id),'[]'::jsonb) from public.jarvis_conversations where owner_id=owner),
    'notes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'content',left(content,600),'tags',tags,'folder',folder,'revision',revision) order by created_at,id),'[]'::jsonb) from public.jarvis_notes where owner_id=owner),
    'tasks',(select coalesce(jsonb_agg((to_jsonb(t)-'owner_id'-'due_date')||jsonb_build_object('dueDate',t.due_date) order by created_at,id),'[]'::jsonb) from public.jarvis_tasks t where owner_id=owner),
    'messages',(select coalesce(jsonb_agg((to_jsonb(m)-'owner_id'-'sequence'-'conversation_id')||jsonb_build_object('conversationId',m.conversation_id) order by sequence),'[]'::jsonb) from (select * from public.jarvis_messages where owner_id=owner order by sequence desc) m),
    'viewLimits',jsonb_build_object('messages',null,'notePreviewChars',600)
  ) into result;
  return result;
end; $$;

create or replace function public.jarvis_backup() returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); result jsonb;
begin
  perform public.jarvis_queue_maintenance(owner);
  -- Single SELECT: consistent MVCC snapshot. No hashes, devices or prompts.
  select jsonb_build_object('format','jarvis-cloud-v2','exportedAt',clock_timestamp(),
    'conversations',(select coalesce(jsonb_agg(to_jsonb(c)-'owner_id' order by created_at,id),'[]'::jsonb) from public.jarvis_conversations c where owner_id=owner),
    'notes',(select coalesce(jsonb_agg(to_jsonb(n)-'owner_id' order by created_at,id),'[]'::jsonb) from public.jarvis_notes n where owner_id=owner),
    'history',(select coalesce(jsonb_agg(to_jsonb(h)-'owner_id' order by time,id),'[]'::jsonb) from public.jarvis_history h where owner_id=owner),
    'tasks',(select coalesce(jsonb_agg(to_jsonb(t)-'owner_id' order by created_at,id),'[]'::jsonb) from public.jarvis_tasks t where owner_id=owner),
    'messages',(select coalesce(jsonb_agg(to_jsonb(m)-'owner_id'-'sequence' order by sequence),'[]'::jsonb) from public.jarvis_messages m where owner_id=owner),
    'jobs',(select coalesce(jsonb_agg(public.jarvis_job_view(j) order by created_at,id),'[]'::jsonb) from public.jarvis_chat_jobs j where owner_id=owner)
  ) into result;
  if octet_length(result::text)>3900000 then raise sqlstate 'PT413' using message='export limit'; end if;
  return result;
end; $$;
create or replace function public.jarvis_chat_enqueue(p_request text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); job public.jarvis_chat_jobs;
begin
  if p_request_id is null or p_request is null or char_length(p_request) not between 1 and 12000 or btrim(p_request)='' then
    raise sqlstate 'PT400' using message='invalid request'; end if;
  perform public.jarvis_queue_maintenance(owner);
  select * into job from public.jarvis_chat_jobs where owner_id=owner and request_id=p_request_id;
  if found then
    if job.request<>p_request or job.conversation_id is distinct from public.jarvis_default_conversation(owner) or job.context_note_ids is not null or not job.include_tasks then raise sqlstate 'JQ409' using message='idempotency mismatch'; end if;
    return jsonb_build_object('jobId',job.id,'status',job.status,'expiresAt',job.expires_at,'position',public.jarvis_job_view(job)->'position');
  end if;
  if (select count(*) from public.jarvis_chat_jobs where owner_id=owner and status in ('queued','processing'))>=5 then
    raise sqlstate 'JQ429' using message='queue full'; end if;
  if (select count(*) from public.jarvis_chat_jobs where owner_id=owner and created_at>clock_timestamp()-interval '1 hour')>=20 then
    raise sqlstate 'PT429' using message='hourly new request limit'; end if;
  insert into public.jarvis_chat_jobs(owner_id,request_id,request) values(owner,p_request_id,p_request) returning * into job;
  return jsonb_build_object('jobId',job.id,'status',job.status,'expiresAt',job.expires_at,'position',public.jarvis_job_view(job)->'position');
end; $$;
revoke all on function public.jarvis_default_conversation(uuid),public.jarvis_assign_conversation(),public.jarvis_conversation_context(uuid,uuid[],boolean),public.jarvis_conversation_create(text),public.jarvis_conversation_update(uuid,text),public.jarvis_task_details(uuid,text,boolean,date,text,text),public.jarvis_note_metadata(uuid,text,text[],text),public.jarvis_chat_enqueue_options(text,uuid,uuid,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.jarvis_conversation_create(text),public.jarvis_conversation_update(uuid,text),public.jarvis_task_details(uuid,text,boolean,date,text,text),public.jarvis_note_metadata(uuid,text,text[],text),public.jarvis_chat_enqueue_options(text,uuid,uuid,uuid[],boolean) to authenticated;
commit;
