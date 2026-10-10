-- Jarvis cloud: execute the entire file in the Supabase SQL Editor.
-- All application writes go through narrowly scoped RPCs. No service-role key
-- is required by the backend. Owner checks remain explicit inside definer RPCs.
begin;

-- Keep this admin-only list synchronized with the server ALLOWED_EMAILS env.
-- Insert confirmed user emails through SQL Editor; never grant client writes.
create table if not exists public.jarvis_allowed_emails (
  email text primary key check (email = lower(email) and char_length(email) between 3 and 320)
);
alter table public.jarvis_allowed_emails enable row level security;
revoke all on public.jarvis_allowed_emails from public, anon, authenticated;

create table if not exists public.jarvis_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  folder text not null default 'raw' check (folder in ('raw', 'wiki', 'outputs')),
  content text not null check (char_length(content) <= 200000),
  revision text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, owner_id)
);
create table if not exists public.jarvis_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null,
  content text not null,
  revision text not null,
  time timestamptz not null default now(),
  foreign key(note_id, owner_id) references public.jarvis_notes(id, owner_id) on delete cascade
);
create table if not exists public.jarvis_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.jarvis_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 32000),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  time timestamptz not null default now(),
  sequence bigint generated always as identity
);
create table if not exists public.jarvis_chat_slots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  reserved_at timestamptz not null default now(),
  completed boolean not null default false
);

create index if not exists jarvis_notes_owner on public.jarvis_notes(owner_id, created_at);
create index if not exists jarvis_history_owner_note on public.jarvis_history(owner_id, note_id, time);
create index if not exists jarvis_tasks_owner on public.jarvis_tasks(owner_id, created_at);
create index if not exists jarvis_messages_owner on public.jarvis_messages(owner_id, sequence);
create index if not exists jarvis_slots_owner on public.jarvis_chat_slots(owner_id, reserved_at);

alter table public.jarvis_notes enable row level security;
alter table public.jarvis_history enable row level security;
alter table public.jarvis_tasks enable row level security;
alter table public.jarvis_messages enable row level security;
alter table public.jarvis_chat_slots enable row level security;
-- Direct writes are denied even when a caller bypasses the Vercel API.
revoke all on public.jarvis_notes, public.jarvis_history, public.jarvis_tasks,
  public.jarvis_messages, public.jarvis_chat_slots from public, anon, authenticated;
grant select on public.jarvis_notes, public.jarvis_history, public.jarvis_tasks, public.jarvis_messages to authenticated;

create or replace function public.jarvis_can_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join public.jarvis_allowed_emails a on a.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
  );
$$;

drop policy if exists jarvis_notes_read on public.jarvis_notes;
create policy jarvis_notes_read on public.jarvis_notes for select to authenticated using (owner_id = (select auth.uid()) and (select public.jarvis_can_access()));
drop policy if exists jarvis_history_read on public.jarvis_history;
create policy jarvis_history_read on public.jarvis_history for select to authenticated using (owner_id = (select auth.uid()) and (select public.jarvis_can_access()));
drop policy if exists jarvis_tasks_read on public.jarvis_tasks;
create policy jarvis_tasks_read on public.jarvis_tasks for select to authenticated using (owner_id = (select auth.uid()) and (select public.jarvis_can_access()));
drop policy if exists jarvis_messages_read on public.jarvis_messages;
create policy jarvis_messages_read on public.jarvis_messages for select to authenticated using (owner_id = (select auth.uid()) and (select public.jarvis_can_access()));
-- The quota ledger has RLS and no client table grants/policies.

create or replace function public.jarvis_owner() returns uuid
language plpgsql security invoker set search_path = '' as $$
declare owner uuid := auth.uid();
begin
  if owner is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) or not public.jarvis_can_access() then
    raise sqlstate '42501' using message = 'authenticated account required';
  end if;
  return owner;
end; $$;

create or replace function public.jarvis_note_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.revision := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(new.content, 'UTF8')), 'hex');
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
drop trigger if exists jarvis_notes_revision on public.jarvis_notes;
create trigger jarvis_notes_revision before insert or update on public.jarvis_notes
  for each row execute function public.jarvis_note_trigger();

create or replace function public.jarvis_note_create(p_title text, p_content text, p_folder text default 'raw') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); result public.jarvis_notes;
begin
  if p_title is null or char_length(p_title) not between 1 and 160 or p_content is null
     or char_length(p_content) not between 1 and 20000 or p_folder not in ('raw','wiki','outputs') then
    raise sqlstate 'PT400' using message = 'invalid note';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('notes:' || owner::text, 0));
  if (select count(*) from public.jarvis_notes where owner_id = owner) >= 200
     or (select coalesce(sum(octet_length(content)),0) from public.jarvis_notes where owner_id = owner) + octet_length(p_content) > 1000000 then
    raise sqlstate 'PT413' using message = 'note storage limit';
  end if;
  insert into public.jarvis_notes(owner_id,title,content,folder,revision)
    values(owner,p_title,p_content,p_folder,'') returning * into result;
  return to_jsonb(result) - 'owner_id';
end; $$;

create or replace function public.jarvis_note_read(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); result public.jarvis_notes;
begin
  select * into result from public.jarvis_notes where id=p_id and owner_id=owner;
  if not found then raise sqlstate 'PT404' using message = 'note not found'; end if;
  return to_jsonb(result) - 'owner_id';
end; $$;

create or replace function public.jarvis_note_update(p_id uuid, p_revision text, p_content text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); previous public.jarvis_notes; result public.jarvis_notes;
begin
  if p_content is null or char_length(p_content)>200000 or p_revision is null then raise sqlstate 'PT400' using message='invalid update'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('notes:' || owner::text, 0));
  select * into previous from public.jarvis_notes where id=p_id and owner_id=owner for update;
  if not found then raise sqlstate 'PT404' using message='note not found'; end if;
  if previous.revision <> p_revision then raise sqlstate 'PT409' using message='revision conflict'; end if;
  if (select coalesce(sum(octet_length(content)),0) from public.jarvis_notes where owner_id=owner)
       - octet_length(previous.content) + octet_length(p_content) > 1000000 then
    raise sqlstate 'PT413' using message='note storage limit';
  end if;
  update public.jarvis_notes set content=p_content where id=p_id and owner_id=owner returning * into result;
  return to_jsonb(result) - 'owner_id';
end; $$;

create or replace function public.jarvis_note_history(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); versions jsonb;
begin
  if not exists(select 1 from public.jarvis_notes where id=p_id and owner_id=owner) then raise sqlstate 'PT404' using message='note not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'time',time,'size',octet_length(content)) order by time desc,id), '[]'::jsonb)
    into versions from public.jarvis_history where note_id=p_id and owner_id=owner;
  return jsonb_build_object('versions',versions);
end; $$;

create or replace function public.jarvis_note_restore(p_id uuid, p_version uuid, p_revision text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); restored text;
begin
  select content into restored from public.jarvis_history where id=p_version and note_id=p_id and owner_id=owner;
  if not found then raise sqlstate 'PT404' using message='version not found'; end if;
  return public.jarvis_note_update(p_id,p_revision,restored);
end; $$;

create or replace function public.jarvis_task_save(p_id uuid, p_done boolean, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); result public.jarvis_tasks;
begin
  if p_id is null then
    if p_text is null or char_length(p_text) not between 1 and 300 then raise sqlstate 'PT400' using message='invalid task'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tasks:' || owner::text, 0));
    if (select count(*) from public.jarvis_tasks where owner_id=owner)>=500 then raise sqlstate 'PT413' using message='task count limit'; end if;
    insert into public.jarvis_tasks(owner_id,text) values(owner,p_text) returning * into result;
  else
    if p_done is null then raise sqlstate 'PT400' using message='invalid task'; end if;
    update public.jarvis_tasks set done=p_done where id=p_id and owner_id=owner returning * into result;
    if not found then raise sqlstate 'PT404' using message='task not found'; end if;
  end if;
  return to_jsonb(result)-'owner_id';
end; $$;

create or replace function public.jarvis_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); result jsonb;
begin
  select jsonb_build_object(
    'notes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'content',left(content,600)) order by created_at,id),'[]'::jsonb) from public.jarvis_notes where owner_id=owner),
    'tasks',(select coalesce(jsonb_agg(to_jsonb(t)-'owner_id' order by created_at,id),'[]'::jsonb) from public.jarvis_tasks t where owner_id=owner),
    'messages',(select coalesce(jsonb_agg(to_jsonb(m)-'owner_id'-'sequence' order by sequence),'[]'::jsonb) from (select * from public.jarvis_messages where owner_id=owner order by sequence desc limit 100) m),
    'viewLimits',jsonb_build_object('messages',100,'notePreviewChars',600)
  ) into result;
  return result;
end; $$;

create or replace function public.jarvis_context() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); result jsonb;
begin
  select jsonb_build_object(
    'notes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'content',content) order by id),'[]'::jsonb) from public.jarvis_notes where owner_id=owner),
    'tasks',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'text',text,'done',done) order by created_at,id),'[]'::jsonb) from (select * from public.jarvis_tasks where owner_id=owner order by created_at desc,id desc limit 50) t),
    'messages',(select coalesce(jsonb_agg(jsonb_build_object('role',role,'content',left(content,2000)) order by sequence),'[]'::jsonb) from (select * from public.jarvis_messages where owner_id=owner order by sequence desc limit 10) m)
  ) into result;
  return result;
end; $$;

create or replace function public.jarvis_chat_reserve() returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); slot uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat:' || owner::text, 0));
  if (select coalesce(sum(octet_length(content)+octet_length(sources::text)),0) from public.jarvis_messages where owner_id=owner) > 800000 then
    raise sqlstate 'PT413' using message='message storage limit';
  end if;
  delete from public.jarvis_chat_slots where owner_id=owner and reserved_at < now()-interval '1 hour';
  if (select count(*) from public.jarvis_chat_slots where owner_id=owner) >= 20 then
    raise sqlstate 'PT429' using message='hourly chat limit';
  end if;
  insert into public.jarvis_chat_slots(owner_id) values(owner) returning id into slot;
  return slot;
end; $$;

create or replace function public.jarvis_chat_append(p_slot uuid, p_request text, p_response text, p_sources jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); result public.jarvis_messages; slot public.jarvis_chat_slots; source jsonb;
begin
  if p_request is null or char_length(p_request) not between 1 and 12000
     or p_response is null or char_length(p_response) not between 1 and 32000
     or p_sources is null or jsonb_typeof(p_sources)<>'array' then
    raise sqlstate 'PT400' using message='invalid chat';
  end if;
  if jsonb_array_length(p_sources)>6 or octet_length(p_sources::text)>10000 then raise sqlstate 'PT400' using message='invalid sources'; end if;
  for source in select value from jsonb_array_elements(p_sources) loop
    if jsonb_typeof(source)<>'object' or jsonb_typeof(source->'id') is distinct from 'string'
       or jsonb_typeof(source->'title') is distinct from 'string' then raise sqlstate 'PT400' using message='invalid source shape'; end if;
    if (select count(*) from jsonb_object_keys(source))<>2
       or (source->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or char_length(source->>'title') not between 1 and 160 then raise sqlstate 'PT400' using message='invalid source'; end if;
    if not exists(select 1 from public.jarvis_notes where id=(source->>'id')::uuid and owner_id=owner and title=source->>'title') then
      raise sqlstate 'PT400' using message='source not owned';
    end if;
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat:' || owner::text,0));
  select * into slot from public.jarvis_chat_slots where id=p_slot and owner_id=owner for update;
  if not found or slot.completed or slot.reserved_at < now()-interval '5 minutes' then raise sqlstate 'PT400' using message='invalid reservation'; end if;
  if (select coalesce(sum(octet_length(content)+octet_length(sources::text)),0) from public.jarvis_messages where owner_id=owner)
       + octet_length(p_request)+octet_length(p_response)+octet_length(p_sources::text)+2>1000000 then raise sqlstate 'PT413' using message='message storage limit'; end if;
  insert into public.jarvis_messages(owner_id,role,content) values(owner,'user',p_request);
  insert into public.jarvis_messages(owner_id,role,content,sources) values(owner,'assistant',p_response,p_sources) returning * into result;
  update public.jarvis_chat_slots set completed=true where id=p_slot and owner_id=owner;
  return to_jsonb(result)-'owner_id'-'sequence';
end; $$;

create or replace function public.jarvis_backup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := public.jarvis_owner(); result jsonb;
begin
  -- One SQL statement provides a consistent MVCC snapshot of every exported table.
  select jsonb_build_object('format','jarvis-cloud-v1','exportedAt',now(),
    'notes',(select coalesce(jsonb_agg(to_jsonb(n)-'owner_id' order by created_at,id),'[]'::jsonb) from public.jarvis_notes n where owner_id=owner),
    'history',(select coalesce(jsonb_agg(to_jsonb(h)-'owner_id' order by time,id),'[]'::jsonb) from public.jarvis_history h where owner_id=owner),
    'tasks',(select coalesce(jsonb_agg(to_jsonb(t)-'owner_id' order by created_at,id),'[]'::jsonb) from public.jarvis_tasks t where owner_id=owner),
    'messages',(select coalesce(jsonb_agg(to_jsonb(m)-'owner_id'-'sequence' order by sequence),'[]'::jsonb) from public.jarvis_messages m where owner_id=owner)
  ) into result;
  if octet_length(result::text)>3900000 then raise sqlstate 'PT413' using message='export limit'; end if;
  return result;
end; $$;

-- PostgreSQL grants new functions to PUBLIC by default. Revoke each explicitly.
revoke all on function public.jarvis_owner() from public,anon,authenticated;
revoke all on function public.jarvis_can_access() from public,anon,authenticated;
revoke all on function public.jarvis_note_trigger() from public,anon,authenticated;
revoke all on function public.jarvis_note_create(text,text,text) from public,anon,authenticated;
revoke all on function public.jarvis_note_read(uuid) from public,anon,authenticated;
revoke all on function public.jarvis_note_update(uuid,text,text) from public,anon,authenticated;
revoke all on function public.jarvis_note_history(uuid) from public,anon,authenticated;
revoke all on function public.jarvis_note_restore(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.jarvis_task_save(uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.jarvis_state() from public,anon,authenticated;
revoke all on function public.jarvis_context() from public,anon,authenticated;
revoke all on function public.jarvis_chat_reserve() from public,anon,authenticated;
revoke all on function public.jarvis_chat_append(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.jarvis_backup() from public,anon,authenticated;
grant execute on function public.jarvis_can_access(),public.jarvis_note_create(text,text,text),public.jarvis_note_read(uuid),
  public.jarvis_note_update(uuid,text,text),public.jarvis_note_history(uuid),public.jarvis_note_restore(uuid,uuid,text),
  public.jarvis_task_save(uuid,boolean,text),public.jarvis_state(),public.jarvis_context(),
  public.jarvis_chat_reserve(),public.jarvis_chat_append(uuid,text,text,jsonb),public.jarvis_backup() to authenticated;

commit;
