-- Coffee Brew OS v42.0
-- Security hardening, append-only audit trail, and role safeguards.
-- Run this file once in Supabase SQL Editor after backing up the database.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Append-only audit events
-- -----------------------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  category text not null default 'system',
  entity_type text,
  entity_id text,
  outcome text not null default 'success',
  severity text not null default 'info',
  message text,
  metadata jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint audit_events_action_length check (char_length(action) between 2 and 80),
  constraint audit_events_category_allowed check (category in ('auth', 'access', 'workspace', 'moderation', 'stock', 'brew', 'qa', 'suggestion', 'security', 'system')),
  constraint audit_events_outcome_allowed check (outcome in ('success', 'failure', 'blocked', 'info')),
  constraint audit_events_severity_allowed check (severity in ('info', 'notice', 'warning', 'critical')),
  constraint audit_events_message_length check (message is null or char_length(message) <= 1000),
  constraint audit_events_metadata_size check (octet_length(metadata::text) <= 8192),
  constraint audit_events_user_agent_length check (user_agent is null or char_length(user_agent) <= 500)
);

comment on table public.audit_events is 'Append-only workspace activity trail. No client update or delete policies are provided.';
comment on column public.audit_events.metadata is 'Sanitized metadata only. Never store passwords, tokens, API keys, or session payloads.';

create index if not exists audit_events_workspace_created_idx
  on public.audit_events (workspace_id, created_at desc);
create index if not exists audit_events_actor_created_idx
  on public.audit_events (actor_id, created_at desc);
create index if not exists audit_events_category_action_idx
  on public.audit_events (category, action, created_at desc);
create index if not exists audit_events_severity_idx
  on public.audit_events (workspace_id, severity, created_at desc);

alter table public.audit_events enable row level security;

-- Explicitly remove any accidental broad policies from prior experiments.
drop policy if exists "Audit events public read" on public.audit_events;
drop policy if exists "Audit events authenticated insert" on public.audit_events;
drop policy if exists "Audit events update" on public.audit_events;
drop policy if exists "Audit events delete" on public.audit_events;
drop policy if exists "Audit events read own or workspace admin" on public.audit_events;

create policy "Audit events read own or workspace admin" on public.audit_events
  for select
  using (
    (select auth.uid()) is not null
    and (
      actor_id = (select auth.uid())
      or (workspace_id is not null and public.is_workspace_admin(workspace_id))
    )
  );

-- No INSERT/UPDATE/DELETE policy is intentionally created. Authenticated clients
-- write through the controlled RPC below; audit rows remain immutable to clients.

create or replace function public.write_audit_event(
  p_workspace_id uuid,
  p_action text,
  p_category text default 'system',
  p_entity_type text default null,
  p_entity_id text default null,
  p_outcome text default 'success',
  p_severity text default 'info',
  p_message text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
  v_id uuid;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if v_actor is null then
    raise exception 'Authentication required to write audit events.';
  end if;

  if p_workspace_id is not null and not public.is_workspace_member(p_workspace_id) then
    raise exception 'Active workspace membership required to write this audit event.';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'Audit metadata must be a JSON object.';
  end if;

  if octet_length(v_metadata::text) > 8192 then
    raise exception 'Audit metadata exceeds 8 KB.';
  end if;

  select p.email into v_actor_email
  from public.profiles p
  where p.id = v_actor;

  insert into public.audit_events (
    workspace_id, actor_id, actor_email, action, category, entity_type,
    entity_id, outcome, severity, message, metadata, user_agent
  ) values (
    p_workspace_id,
    v_actor,
    v_actor_email,
    left(coalesce(nullif(trim(p_action), ''), 'system.info'), 80),
    case when p_category in ('auth', 'access', 'workspace', 'moderation', 'stock', 'brew', 'qa', 'suggestion', 'security', 'system') then p_category else 'system' end,
    nullif(left(coalesce(p_entity_type, ''), 80), ''),
    nullif(left(coalesce(p_entity_id, ''), 160), ''),
    case when p_outcome in ('success', 'failure', 'blocked', 'info') then p_outcome else 'info' end,
    case when p_severity in ('info', 'notice', 'warning', 'critical') then p_severity else 'info' end,
    nullif(left(coalesce(p_message, ''), 1000), ''),
    v_metadata,
    nullif(left(coalesce(p_user_agent, ''), 500), '')
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.write_audit_event(uuid, text, text, text, text, text, text, text, jsonb, text) from public;
grant execute on function public.write_audit_event(uuid, text, text, text, text, text, text, text, jsonb, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Database-side audit capture for privileged changes
-- -----------------------------------------------------------------------------
create or replace function public.audit_workspace_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.workspace_members%rowtype;
  v_action text;
  v_severity text := 'notice';
  v_outcome text := 'success';
  v_metadata jsonb;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if tg_op = 'INSERT' then
    v_action := case when new.status = 'pending' then 'member.requested' else 'member.added' end;
  elsif tg_op = 'DELETE' then
    v_action := 'member.removed';
    v_severity := 'warning';
  elsif old.role is distinct from new.role then
    v_action := 'member.role_changed';
    v_severity := 'warning';
  elsif old.status is distinct from new.status then
    v_action := 'member.status_changed';
    v_severity := case when new.status in ('disabled', 'rejected') then 'warning' else 'notice' end;
  else
    return v_row;
  end if;

  v_metadata := jsonb_build_object(
    'target_user_id', v_row.user_id,
    'old_role', case when tg_op = 'INSERT' then null else old.role end,
    'new_role', case when tg_op = 'DELETE' then null else new.role end,
    'old_status', case when tg_op = 'INSERT' then null else old.status end,
    'new_status', case when tg_op = 'DELETE' then null else new.status end
  );

  insert into public.audit_events (
    workspace_id, actor_id, action, category, entity_type, entity_id,
    outcome, severity, message, metadata
  ) values (
    v_row.workspace_id,
    auth.uid(),
    v_action,
    'access',
    'workspace_member',
    v_row.user_id::text,
    v_outcome,
    v_severity,
    'Workspace membership changed.',
    v_metadata
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.audit_moderation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text := coalesce(to_jsonb(old) ->> 'moderation_status', '');
  v_new_status text := coalesce(to_jsonb(new) ->> 'moderation_status', '');
  v_workspace uuid := nullif(to_jsonb(new) ->> 'workspace_id', '')::uuid;
  v_id text := to_jsonb(new) ->> 'id';
  v_entity text := tg_argv[0];
begin
  if v_old_status is not distinct from v_new_status then
    return new;
  end if;

  insert into public.audit_events (
    workspace_id, actor_id, action, category, entity_type, entity_id,
    outcome, severity, message, metadata
  ) values (
    v_workspace,
    auth.uid(),
    'moderation.status_changed',
    'moderation',
    v_entity,
    v_id,
    'success',
    case when v_new_status = 'rejected' then 'warning' else 'notice' end,
    'Moderation status changed.',
    jsonb_build_object('from', v_old_status, 'to', v_new_status)
  );
  return new;
end;
$$;

create or replace function public.audit_workspace_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.workspaces%rowtype;
  v_action text;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;
  v_action := case
    when tg_op = 'INSERT' then 'workspace.created'
    when tg_op = 'DELETE' then 'workspace.deleted'
    when old.status is distinct from new.status then 'workspace.status_changed'
    else 'workspace.updated'
  end;

  insert into public.audit_events (
    workspace_id, actor_id, action, category, entity_type, entity_id,
    outcome, severity, message, metadata
  ) values (
    case when tg_op = 'DELETE' then null else v_row.id end,
    auth.uid(),
    v_action,
    'workspace',
    'workspace',
    v_row.id::text,
    'success',
    case when tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.status = 'archived') then 'warning' else 'notice' end,
    'Workspace configuration changed.',
    jsonb_build_object(
      'name', v_row.name,
      'slug', v_row.slug,
      'status', v_row.status,
      'visibility', v_row.visibility
    )
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_workspace_members on public.workspace_members;
create trigger trg_audit_workspace_members
after insert or update or delete on public.workspace_members
for each row execute function public.audit_workspace_member_change();

drop trigger if exists trg_audit_brew_moderation on public.brew_logs;
create trigger trg_audit_brew_moderation
after update on public.brew_logs
for each row execute function public.audit_moderation_change('brew_log');

drop trigger if exists trg_audit_qa_moderation on public.qa_scores;
create trigger trg_audit_qa_moderation
after update on public.qa_scores
for each row execute function public.audit_moderation_change('qa_score');

drop trigger if exists trg_audit_workspace_change on public.workspaces;
create trigger trg_audit_workspace_change
after insert or update or delete on public.workspaces
for each row execute function public.audit_workspace_change();

-- -----------------------------------------------------------------------------
-- Prevent removal or demotion of the last active workspace admin
-- -----------------------------------------------------------------------------
create or replace function public.protect_last_workspace_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removes_active_admin boolean;
  v_other_admins integer;
begin
  if tg_op = 'DELETE' then
    v_removes_active_admin := old.role = 'admin' and old.status = 'active';
  else
    v_removes_active_admin := old.role = 'admin' and old.status = 'active'
      and not (new.role = 'admin' and new.status = 'active');
  end if;

  if not v_removes_active_admin then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select count(*) into v_other_admins
  from public.workspace_members wm
  where wm.workspace_id = old.workspace_id
    and wm.user_id <> old.user_id
    and wm.role = 'admin'
    and wm.status = 'active';

  if v_other_admins = 0 then
    raise exception 'A workspace must keep at least one active admin.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_last_workspace_admin on public.workspace_members;
create trigger trg_protect_last_workspace_admin
before update or delete on public.workspace_members
for each row execute function public.protect_last_workspace_admin();

-- -----------------------------------------------------------------------------
-- RLS hardening
-- -----------------------------------------------------------------------------
-- Private workspaces must not be exposed as a public directory.
drop policy if exists "Workspaces read active directory or member" on public.workspaces;
drop policy if exists "Workspaces read public or member" on public.workspaces;
create policy "Workspaces read public or member" on public.workspaces
  for select
  using (
    (visibility = 'public' and status = 'active')
    or public.is_workspace_member(id)
  );

-- Workspace creation must always bind ownership to the authenticated creator.
drop policy if exists "Workspaces insert authenticated" on public.workspaces;
create policy "Workspaces insert authenticated" on public.workspaces
  for insert
  with check (
    (select auth.uid()) is not null
    and created_by = (select auth.uid())
  );

-- Suggestions remain public, but anonymous submissions are confined to the
-- public community workspace. Logged-in submissions must use the caller ID.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'suggestions_message_length'
      and conrelid = 'public.suggestions'::regclass
  ) then
    alter table public.suggestions
      add constraint suggestions_message_length
      check (char_length(trim(message)) between 1 and 4000) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'suggestions_email_length'
      and conrelid = 'public.suggestions'::regclass
  ) then
    alter table public.suggestions
      add constraint suggestions_email_length
      check (email is null or char_length(email) <= 320) not valid;
  end if;
end;
$$;

drop policy if exists "Suggestions public insert" on public.suggestions;
create policy "Suggestions controlled insert" on public.suggestions
  for insert
  with check (
    status = 'open'
    and char_length(trim(message)) between 1 and 4000
    and (
      (
        (select auth.uid()) is null
        and created_by is null
        and (workspace_id is null or workspace_id = '00000000-0000-0000-0000-000000000001')
      )
      or
      (
        (select auth.uid()) is not null
        and created_by = (select auth.uid())
        and (
          workspace_id is null
          or workspace_id = '00000000-0000-0000-0000-000000000001'
          or public.is_workspace_member(workspace_id)
        )
      )
    )
  );

-- Make grants explicit for audit reads and keep write access RPC-only.
grant select on public.audit_events to authenticated;
revoke insert, update, delete on public.audit_events from anon, authenticated;

-- Optional server-side summary used by admins. It returns no member identity.
create or replace function public.get_workspace_security_summary(p_workspace_id uuid)
returns table (
  active_admins bigint,
  active_qa bigint,
  active_brewers bigint,
  pending_members bigint,
  disabled_members bigint,
  audit_events_30d bigint,
  warnings_30d bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Workspace admin access required.';
  end if;

  return query
  select
    count(*) filter (where wm.role = 'admin' and wm.status = 'active'),
    count(*) filter (where wm.role = 'qa' and wm.status = 'active'),
    count(*) filter (where wm.role = 'brewer' and wm.status = 'active'),
    count(*) filter (where wm.status = 'pending'),
    count(*) filter (where wm.status = 'disabled'),
    (select count(*) from public.audit_events ae where ae.workspace_id = p_workspace_id and ae.created_at >= now() - interval '30 days'),
    (select count(*) from public.audit_events ae where ae.workspace_id = p_workspace_id and ae.created_at >= now() - interval '30 days' and ae.severity in ('warning', 'critical'))
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.get_workspace_security_summary(uuid) from public;
grant execute on function public.get_workspace_security_summary(uuid) to authenticated;
