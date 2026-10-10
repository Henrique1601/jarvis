-- Jarvis 0.6 queue: apply AFTER schema.sql, reviewed as a separate migration.
-- Additive tables; existing notes/history/tasks/messages are preserved.
-- No service-role key. Both server env AND this admin-only gate are required
-- for dispatch. Keep enabled=false until the actual CLI policy is proven.
-- Expiry is lazy on RPC access (no cron required). Requests expire after 7 days;
-- terminal request/result records remain exportable, prompts are erased.
begin;

create table if not exists public.jarvis_queue_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into public.jarvis_queue_settings(singleton,enabled) values(true,false) on conflict(singleton) do nothing;
create table if not exists public.jarvis_worker_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'blocked' check(status in ('blocked','ready','processing','offline','error','paused')),
  reason text not null default 'policy_unverified' check(reason in ('none','policy_unverified','cli_missing','login_required','offline','busy','runtime_error','revoked','quota_exceeded','connection_error')),
  created_at timestamptz not null default clock_timestamp(),
  last_seen timestamptz,
  revoked_at timestamptz,
  unique(id,owner_id)
);
create unique index if not exists jarvis_worker_one_active on public.jarvis_worker_devices(owner_id) where revoked_at is null;
create table if not exists public.jarvis_chat_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  request text not null check(char_length(request) between 1 and 12000),
  status text not null default 'queued' check(status in ('queued','processing','completed','failed','cancelled','expired')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '7 days',
  device_id uuid,
  attempt_id uuid,
  lease_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  prompt text check(prompt is null or char_length(prompt)<=32000),
  sources jsonb not null default '[]'::jsonb check(jsonb_typeof(sources)='array' and jsonb_array_length(sources)<=6 and octet_length(sources::text)<=10000),
  answer text check(answer is null or char_length(answer) between 1 and 32000),
  answer_hash text,
  message_id uuid references public.jarvis_messages(id),
  error_code text check(error_code is null or error_code in ('cancelled','expired','runtime_error','policy_unverified','login_required','cli_missing','context_error','execution_uncertain','timeout','result_uncertain','quota_exceeded','auth_required','policy_blocked','execution_failed','device_revoked','connection_error')),
  unique(owner_id,request_id),
  foreign key(device_id,owner_id) references public.jarvis_worker_devices(id,owner_id)
);
create index if not exists jarvis_jobs_owner_fifo on public.jarvis_chat_jobs(owner_id,created_at,id);
create index if not exists jarvis_jobs_active_lease on public.jarvis_chat_jobs(owner_id,lease_until) where status='processing';
alter table public.jarvis_queue_settings enable row level security;
alter table public.jarvis_worker_devices enable row level security;
alter table public.jarvis_chat_jobs enable row level security;
-- No raw table SELECT: token hashes and temporary prompts are private even to
-- the browser owner. Sanitized, owner-scoped RPCs provide all visible data.
revoke all on public.jarvis_queue_settings,public.jarvis_worker_devices,public.jarvis_chat_jobs from public,anon,authenticated;
drop policy if exists jarvis_jobs_owner on public.jarvis_chat_jobs;
create policy jarvis_jobs_owner on public.jarvis_chat_jobs for select to authenticated
  using(owner_id=(select auth.uid()) and (select public.jarvis_can_access()));
drop policy if exists jarvis_devices_owner on public.jarvis_worker_devices;
create policy jarvis_devices_owner on public.jarvis_worker_devices for select to authenticated
  using(owner_id=(select auth.uid()) and (select public.jarvis_can_access()));

-- Helpers have NO execute grants to clients. Every exposed RPC calls owner().
create or replace function public.jarvis_queue_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select enabled from public.jarvis_queue_settings where singleton),false);
$$;
create or replace function public.jarvis_queue_lock(p_owner uuid) returns void
language sql security definer set search_path='' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('queue:'||p_owner::text,0));
$$;
create or replace function public.jarvis_queue_maintenance(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.jarvis_queue_lock(p_owner);
  -- A pre-start loss can safely be requeued. Any post-start loss is uncertain
  -- and terminal, never automatically dispatched again.
  update public.jarvis_chat_jobs set
    status=case when started_at is not null then 'failed' when expires_at<=clock_timestamp() then 'expired' else 'queued' end,
    error_code=case when started_at is not null then 'execution_uncertain' when expires_at<=clock_timestamp() then 'expired' else null end,
    finished_at=case when started_at is not null or expires_at<=clock_timestamp() then clock_timestamp() else null end,
    prompt=null,
    device_id=case when started_at is null then null else device_id end,
    attempt_id=case when started_at is null then null else attempt_id end,
    sources=case when started_at is null then '[]'::jsonb else sources end,
    lease_until=null
  where owner_id=p_owner and status='processing' and (lease_until<=clock_timestamp() or expires_at<=clock_timestamp());
  update public.jarvis_chat_jobs set status='expired',error_code='expired',finished_at=clock_timestamp(),prompt=null,lease_until=null
    where owner_id=p_owner and status='queued' and expires_at<=clock_timestamp();
end; $$;
create or replace function public.jarvis_job_view(p_job public.jarvis_chat_jobs) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('jobId',(p_job).id,'requestId',(p_job).request_id,'text',(p_job).request,
    'status',(p_job).status,'createdAt',(p_job).created_at,'expiresAt',(p_job).expires_at,
    'startedAt',(p_job).started_at,'finishedAt',(p_job).finished_at,'answer',(p_job).answer,
    'sources',(p_job).sources,'errorCode',(p_job).error_code,
    'position',case when (p_job).status in ('queued','processing') then
      (select count(*) from public.jarvis_chat_jobs q where q.owner_id=(p_job).owner_id and q.status in ('queued','processing')
        and (q.created_at,q.id)<=((p_job).created_at,(p_job).id)) else null end);
$$;
create or replace function public.jarvis_worker_authorize(p_device_id uuid,p_token_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner();
begin
  perform public.jarvis_queue_lock(owner);
  if p_device_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or not exists(select 1 from public.jarvis_worker_devices where id=p_device_id and owner_id=owner
      and revoked_at is null and token_hash=p_token_hash) then
    raise sqlstate 'JQ403' using message='invalid device';
  end if;
  return owner;
end; $$;
create or replace function public.jarvis_worker_attempt(p_device_id uuid,p_token_hash text,p_job_id uuid,p_attempt_id uuid) returns public.jarvis_chat_jobs
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_worker_authorize(p_device_id,p_token_hash); job public.jarvis_chat_jobs;
begin
  perform public.jarvis_queue_maintenance(owner);
  select * into job from public.jarvis_chat_jobs where id=p_job_id and owner_id=owner for update;
  if not found or job.status<>'processing' or job.device_id is distinct from p_device_id
    or job.attempt_id is distinct from p_attempt_id or job.lease_until<=clock_timestamp() or job.expires_at<=clock_timestamp() then
    raise sqlstate 'JQ409' using message='inactive attempt';
  end if;
  return job;
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
    if job.request<>p_request then raise sqlstate 'JQ409' using message='idempotency mismatch'; end if;
    return jsonb_build_object('jobId',job.id,'status',job.status,'expiresAt',job.expires_at,'position',public.jarvis_job_view(job)->'position');
  end if;
  if (select count(*) from public.jarvis_chat_jobs where owner_id=owner and status in ('queued','processing'))>=5 then
    raise sqlstate 'JQ429' using message='queue full'; end if;
  if (select count(*) from public.jarvis_chat_jobs where owner_id=owner and created_at>clock_timestamp()-interval '1 hour')>=20 then
    raise sqlstate 'PT429' using message='hourly new request limit'; end if;
  insert into public.jarvis_chat_jobs(owner_id,request_id,request) values(owner,p_request_id,p_request) returning * into job;
  return jsonb_build_object('jobId',job.id,'status',job.status,'expiresAt',job.expires_at,'position',public.jarvis_job_view(job)->'position');
end; $$;
create or replace function public.jarvis_chat_job(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); job public.jarvis_chat_jobs;
begin
  perform public.jarvis_queue_maintenance(owner);
  select * into job from public.jarvis_chat_jobs where owner_id=owner and id=p_id;
  if not found then raise sqlstate 'PT404' using message='job not found'; end if;
  return public.jarvis_job_view(job);
end; $$;
create or replace function public.jarvis_chat_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); job public.jarvis_chat_jobs;
begin
  perform public.jarvis_queue_maintenance(owner);
  select * into job from public.jarvis_chat_jobs where owner_id=owner and id=p_id for update;
  if not found then raise sqlstate 'PT404' using message='job not found'; end if;
  if job.status in ('queued','processing') then
    update public.jarvis_chat_jobs set status='cancelled',error_code='cancelled',finished_at=clock_timestamp(),prompt=null,lease_until=null
      where id=p_id and owner_id=owner returning * into job;
  end if;
  return public.jarvis_job_view(job);
end; $$;
create or replace function public.jarvis_queue_state() returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); device public.jarvis_worker_devices; worker jsonb;
begin
  perform public.jarvis_queue_maintenance(owner);
  select * into device from public.jarvis_worker_devices where owner_id=owner and revoked_at is null;
  worker:=jsonb_build_object('deviceId',device.id,'status',case
    when not public.jarvis_queue_enabled() then 'blocked'
    when device.id is null or device.last_seen is null or device.last_seen<clock_timestamp()-interval '90 seconds' then 'offline'
    else device.status end,'lastSeen',device.last_seen,'reason',case
    when not public.jarvis_queue_enabled() then 'policy_unverified'
    when device.id is null or device.last_seen is null or device.last_seen<clock_timestamp()-interval '90 seconds' then 'offline'
    else device.reason end);
  return jsonb_build_object('jobs',(select coalesce(jsonb_agg(public.jarvis_job_view(j::public.jarvis_chat_jobs) order by created_at desc,id desc),'[]'::jsonb)
    from (select * from public.jarvis_chat_jobs where owner_id=owner order by created_at desc,id desc limit 20) j),'worker',worker);
end; $$;

create or replace function public.jarvis_worker_register(p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); device public.jarvis_worker_devices;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise sqlstate 'PT400' using message='invalid hash'; end if;
  perform public.jarvis_queue_maintenance(owner);
  update public.jarvis_worker_devices set revoked_at=clock_timestamp(),status='offline',reason='revoked' where owner_id=owner and revoked_at is null;
  update public.jarvis_chat_jobs set status='cancelled',error_code='device_revoked',finished_at=clock_timestamp(),prompt=null,lease_until=null
    where owner_id=owner and status='processing';
  insert into public.jarvis_worker_devices(owner_id,token_hash,last_seen) values(owner,p_token_hash,clock_timestamp()) returning * into device;
  return jsonb_build_object('deviceId',device.id);
end; $$;
create or replace function public.jarvis_worker_revoke(p_device_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner();
begin
  perform public.jarvis_queue_maintenance(owner);
  if not exists(select 1 from public.jarvis_worker_devices where id=p_device_id and owner_id=owner) then
    raise sqlstate 'PT404' using message='device not found'; end if;
  update public.jarvis_worker_devices set revoked_at=coalesce(revoked_at,clock_timestamp()),status='offline',reason='revoked' where id=p_device_id and owner_id=owner;
  update public.jarvis_chat_jobs set status='cancelled',error_code='device_revoked',finished_at=clock_timestamp(),prompt=null,lease_until=null
    where device_id=p_device_id and owner_id=owner and status='processing';
  return jsonb_build_object('revoked',true);
end; $$;
create or replace function public.jarvis_worker_heartbeat(p_device_id uuid,p_token_hash text,p_status text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_worker_authorize(p_device_id,p_token_hash);
begin
  perform public.jarvis_queue_maintenance(owner);
  if p_status is null or p_status not in ('blocked','ready','processing','offline','error','paused') or p_reason is null
    or p_reason not in ('none','policy_unverified','cli_missing','login_required','offline','busy','runtime_error','revoked','quota_exceeded','connection_error') then
    raise sqlstate 'PT400' using message='invalid heartbeat'; end if;
  update public.jarvis_worker_devices set last_seen=clock_timestamp(),status=p_status,reason=p_reason where id=p_device_id and owner_id=owner;
  return jsonb_build_object('ok',true);
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
  return jsonb_build_object('jobId',job.id,'attemptId',job.attempt_id,'request',job.request,'context',public.jarvis_context(),'expiresAt',job.expires_at);
end; $$;
create or replace function public.jarvis_worker_prepare(p_device_id uuid,p_token_hash text,p_job_id uuid,p_attempt_id uuid,p_prompt text,p_sources jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); job public.jarvis_chat_jobs; source jsonb;
begin
  job:=public.jarvis_worker_attempt(p_device_id,p_token_hash,p_job_id,p_attempt_id);
  if job.started_at is not null then raise sqlstate 'JQ409' using message='already started'; end if;
  if p_prompt is null or char_length(p_prompt) not between 1 and 32000 or p_sources is null
    or jsonb_typeof(p_sources)<>'array' then raise sqlstate 'PT400' using message='invalid context'; end if;
  if jsonb_array_length(p_sources)>6 or octet_length(p_sources::text)>10000 then raise sqlstate 'PT400' using message='invalid sources'; end if;
  for source in select value from jsonb_array_elements(p_sources) loop
    if jsonb_typeof(source)<>'object' or jsonb_typeof(source->'id') is distinct from 'string' or jsonb_typeof(source->'title') is distinct from 'string'
      or (select count(*) from jsonb_object_keys(source))<>2 then raise sqlstate 'PT400' using message='invalid source shape'; end if;
    if (source->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or char_length(source->>'title') not between 1 and 160 then
      raise sqlstate 'PT400' using message='invalid source'; end if;
    if not exists(select 1 from public.jarvis_notes where id=(source->>'id')::uuid and owner_id=owner and title=source->>'title') then
      raise sqlstate 'PT400' using message='source not owned'; end if;
  end loop;
  if job.prompt is not null and (job.prompt<>p_prompt or job.sources<>p_sources) then raise sqlstate 'JQ409' using message='context immutable'; end if;
  update public.jarvis_chat_jobs set prompt=p_prompt,sources=p_sources where id=p_job_id and owner_id=owner;
  return jsonb_build_object('prepared',true);
end; $$;
create or replace function public.jarvis_worker_start(p_device_id uuid,p_token_hash text,p_job_id uuid,p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); job public.jarvis_chat_jobs; already boolean;
begin
  if not public.jarvis_queue_enabled() then raise sqlstate 'JQ503' using message='policy gate blocked'; end if;
  job:=public.jarvis_worker_attempt(p_device_id,p_token_hash,p_job_id,p_attempt_id);
  if job.prompt is null then raise sqlstate 'JQ409' using message='not prepared'; end if;
  already:=job.started_at is not null;
  if not already then
    update public.jarvis_chat_jobs set started_at=clock_timestamp() where id=p_job_id and owner_id=owner;
  end if;
  -- The worker MUST NOT dispatch if alreadyStarted=true (including lost ACK).
  return jsonb_build_object('started',true,'alreadyStarted',already);
end; $$;
create or replace function public.jarvis_worker_renew(p_device_id uuid,p_token_hash text,p_job_id uuid,p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); job public.jarvis_chat_jobs; until_at timestamptz;
begin
  job:=public.jarvis_worker_attempt(p_device_id,p_token_hash,p_job_id,p_attempt_id);
  if not public.jarvis_queue_enabled() then raise sqlstate 'JQ503' using message='policy gate blocked'; end if;
  until_at:=least(clock_timestamp()+interval '240 seconds',job.expires_at);
  update public.jarvis_chat_jobs set lease_until=until_at where id=p_job_id and owner_id=owner;
  update public.jarvis_worker_devices set last_seen=clock_timestamp() where id=p_device_id and owner_id=owner;
  return jsonb_build_object('renewed',true,'leaseUntil',until_at);
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
  insert into public.jarvis_messages(owner_id,role,content) values(owner,'user',job.request);
  insert into public.jarvis_messages(owner_id,role,content,sources) values(owner,'assistant',p_answer,job.sources) returning * into message;
  update public.jarvis_chat_jobs set status='completed',answer=p_answer,answer_hash=answer_digest,message_id=message.id,
    finished_at=clock_timestamp(),prompt=null,lease_until=null where id=p_job_id and owner_id=owner returning * into job;
  update public.jarvis_worker_devices set status='ready',reason='none',last_seen=clock_timestamp() where id=p_device_id and owner_id=owner;
  return public.jarvis_job_view(job);
end; $$;
create or replace function public.jarvis_worker_fail(p_device_id uuid,p_token_hash text,p_job_id uuid,p_attempt_id uuid,p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); job public.jarvis_chat_jobs;
begin
  if p_code is null or p_code not in ('runtime_error','policy_unverified','login_required','cli_missing','context_error','execution_uncertain','timeout','result_uncertain','quota_exceeded','auth_required','policy_blocked','execution_failed','device_revoked','connection_error') then
    raise sqlstate 'PT400' using message='invalid error code'; end if;
  job:=public.jarvis_worker_attempt(p_device_id,p_token_hash,p_job_id,p_attempt_id);
  update public.jarvis_chat_jobs set status='failed',error_code=p_code,finished_at=clock_timestamp(),prompt=null,lease_until=null
    where id=p_job_id and owner_id=owner returning * into job;
  return public.jarvis_job_view(job);
end; $$;

-- Preserve the original state RPC so notes remain usable before migration.
-- The API combines jarvis_state() + jarvis_queue_state() on demand.
create or replace function public.jarvis_backup() returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.jarvis_owner(); result jsonb;
begin
  perform public.jarvis_queue_maintenance(owner);
  -- Single SELECT: consistent MVCC snapshot. No hashes, devices or prompts.
  select jsonb_build_object('format','jarvis-cloud-v1','exportedAt',clock_timestamp(),
    'notes',(select coalesce(jsonb_agg(to_jsonb(n)-'owner_id' order by created_at,id),'[]'::jsonb) from public.jarvis_notes n where owner_id=owner),
    'history',(select coalesce(jsonb_agg(to_jsonb(h)-'owner_id' order by time,id),'[]'::jsonb) from public.jarvis_history h where owner_id=owner),
    'tasks',(select coalesce(jsonb_agg(to_jsonb(t)-'owner_id' order by created_at,id),'[]'::jsonb) from public.jarvis_tasks t where owner_id=owner),
    'messages',(select coalesce(jsonb_agg(to_jsonb(m)-'owner_id'-'sequence' order by sequence),'[]'::jsonb) from public.jarvis_messages m where owner_id=owner),
    'jobs',(select coalesce(jsonb_agg(public.jarvis_job_view(j) order by created_at,id),'[]'::jsonb) from public.jarvis_chat_jobs j where owner_id=owner)
  ) into result;
  if octet_length(result::text)>3900000 then raise sqlstate 'PT413' using message='export limit'; end if;
  return result;
end; $$;

-- Explicit signatures, including private helpers: PostgreSQL defaults PUBLIC.
revoke all on function public.jarvis_queue_enabled(),public.jarvis_queue_lock(uuid),public.jarvis_queue_maintenance(uuid),
  public.jarvis_job_view(public.jarvis_chat_jobs),public.jarvis_worker_authorize(uuid,text),public.jarvis_worker_attempt(uuid,text,uuid,uuid),
  public.jarvis_chat_enqueue(text,uuid),public.jarvis_chat_job(uuid),public.jarvis_chat_cancel(uuid),public.jarvis_queue_state(),
  public.jarvis_worker_register(text),public.jarvis_worker_revoke(uuid),public.jarvis_worker_heartbeat(uuid,text,text,text),
  public.jarvis_worker_claim(uuid,text),public.jarvis_worker_prepare(uuid,text,uuid,uuid,text,jsonb),public.jarvis_worker_start(uuid,text,uuid,uuid),
  public.jarvis_worker_renew(uuid,text,uuid,uuid),public.jarvis_worker_complete(uuid,text,uuid,uuid,text),public.jarvis_worker_fail(uuid,text,uuid,uuid,text),
  public.jarvis_backup() from public,anon,authenticated;
grant execute on function public.jarvis_chat_enqueue(text,uuid),public.jarvis_chat_job(uuid),public.jarvis_chat_cancel(uuid),public.jarvis_queue_state(),
  public.jarvis_worker_register(text),public.jarvis_worker_revoke(uuid),public.jarvis_worker_heartbeat(uuid,text,text,text),
  public.jarvis_worker_claim(uuid,text),public.jarvis_worker_prepare(uuid,text,uuid,uuid,text,jsonb),public.jarvis_worker_start(uuid,text,uuid,uuid),
  public.jarvis_worker_renew(uuid,text,uuid,uuid),public.jarvis_worker_complete(uuid,text,uuid,uuid,text),public.jarvis_worker_fail(uuid,text,uuid,uuid,text),
  public.jarvis_backup() to authenticated;
commit;

-- Rollback is non-destructive: set the admin gate to false and restore the
-- previous backend/provider; preserve queue tables and exports. Do NOT drop
-- jobs/devices in a production rollback (they contain user records).
