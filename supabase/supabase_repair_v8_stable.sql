-- Lestari Coffee Dashboard - Supabase Repair v8 Stable
-- Tujuan:
-- 1) Bersihkan policy lama/duplikat yang bisa saling menimpa.
-- 2) Pastikan threshold publik 6.5 tetap aktif.
-- 3) Pastikan helper function, stok, brew log, QA, dan dashboard count stabil.
-- Jalankan SEKALI di Supabase SQL Editor. Setelah sukses, refresh dashboard.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 0. Kolom wajib yang dipakai frontend saat ini
-- -----------------------------------------------------------------------------
alter table public.brew_logs add column if not exists stock_bean_id uuid references public.stock_beans(id) on delete set null;
alter table public.brew_logs add column if not exists stock_bean_code text;
alter table public.brew_logs add column if not exists stock_usage_g numeric;
alter table public.brew_logs add column if not exists primary_variable_changed text;
alter table public.brew_logs add column if not exists hypothesis text;
alter table public.brew_logs add column if not exists result_notes text;
alter table public.brew_logs add column if not exists qa_code text;
alter table public.brew_logs add column if not exists qa_final numeric;
alter table public.brew_logs add column if not exists qa_status text;
alter table public.brew_logs add column if not exists manual_approval text default 'No';
alter table public.brew_logs add column if not exists approved_for_recipe text default 'No';
alter table public.brew_logs add column if not exists recipe_key text;
alter table public.brew_logs add column if not exists current_match_score numeric;
alter table public.brew_logs add column if not exists water_formula_note text;
alter table public.brew_logs add column if not exists switch_valve_mode text;
alter table public.brew_logs add column if not exists valve_plan text;
alter table public.brew_logs add column if not exists visibility text default 'public';
alter table public.brew_logs add column if not exists status text default 'pending';
alter table public.brew_logs add column if not exists source_client_id text;
alter table public.brew_logs add column if not exists moderation_status text default 'pending';
alter table public.brew_logs add column if not exists moderation_notes text;
alter table public.brew_logs add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.brew_logs add column if not exists moderated_at timestamptz;

alter table public.qa_scores add column if not exists primary_variable_changed text;
alter table public.qa_scores add column if not exists hypothesis text;
alter table public.qa_scores add column if not exists result_notes text;
alter table public.qa_scores add column if not exists visibility text default 'public';
alter table public.qa_scores add column if not exists source_client_id text;
alter table public.qa_scores add column if not exists moderation_status text default 'pending';
alter table public.qa_scores add column if not exists moderation_notes text;
alter table public.qa_scores add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.qa_scores add column if not exists moderated_at timestamptz;

alter table public.stock_beans add column if not exists workspace_id uuid references public.workspaces(id) default '00000000-0000-0000-0000-000000000001';
alter table public.stock_beans add column if not exists visibility text default 'private';
alter table public.stock_beans add column if not exists moderation_status text default 'approved';
alter table public.stock_beans add column if not exists source_client_id text;

-- Pastikan default public workspace ada untuk guest public brew.
insert into public.workspaces (id, name, slug, description, visibility, status)
values (
  '00000000-0000-0000-0000-000000000001',
  'Public Brew Community',
  'public-brew-community',
  'Default public workspace for shared brew intelligence.',
  'public',
  'active'
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 1. Helper role functions
-- -----------------------------------------------------------------------------
create or replace function public.get_workspace_role(ws uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = ws
    and wm.user_id = auth.uid()
    and wm.status = 'active'
  limit 1;
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;

create or replace function public.is_workspace_admin(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_workspace_role(ws), '') = 'admin';
$$;

create or replace function public.can_moderate_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_workspace_role(ws), '') in ('qa', 'admin');
$$;

-- -----------------------------------------------------------------------------
-- 2. Auth/profile hook + membership request status
-- -----------------------------------------------------------------------------
alter table public.workspace_members drop constraint if exists workspace_members_status_check;
alter table public.workspace_members add constraint workspace_members_status_check
  check (status in ('pending', 'active', 'rejected', 'disabled'));

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  requested_workspace uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
    updated_at = now();

  requested_role := lower(coalesce(new.raw_user_meta_data ->> 'requested_role', ''));

  if requested_role in ('brewer', 'qa') and nullif(new.raw_user_meta_data ->> 'requested_workspace_id', '') is not null then
    requested_workspace := (new.raw_user_meta_data ->> 'requested_workspace_id')::uuid;

    insert into public.workspace_members (workspace_id, user_id, role, status)
    select requested_workspace, new.id, requested_role, 'pending'
    where exists (
      select 1 from public.workspaces w
      where w.id = requested_workspace and w.status = 'active'
    )
    on conflict (workspace_id, user_id) do update set
      role = case when public.workspace_members.status = 'active' then public.workspace_members.role else excluded.role end,
      status = case when public.workspace_members.status = 'active' then 'active' else 'pending' end,
      updated_at = now();
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

-- -----------------------------------------------------------------------------
-- 3. Stock consume + delete brew restore stock functions
-- -----------------------------------------------------------------------------
create or replace function public.consume_stock_for_brew(p_stock_id uuid, p_amount numeric)
returns public.stock_beans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stock_beans%rowtype;
  v_amount numeric := greatest(coalesce(p_amount, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Login required to consume stock.';
  end if;

  select * into v_row
  from public.stock_beans
  where id = p_stock_id
  for update;

  if not found then
    raise exception 'Stock bean not found.';
  end if;

  if not public.is_workspace_member(v_row.workspace_id) then
    raise exception 'You are not allowed to update stock in this workspace.';
  end if;

  update public.stock_beans
  set stock_g = greatest(coalesce(stock_g, 0) - v_amount, 0),
      updated_at = now()
  where id = p_stock_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.consume_stock_for_brew(uuid, numeric) from public;
grant execute on function public.consume_stock_for_brew(uuid, numeric) to authenticated;

create or replace function public.delete_brew_log_and_restore_stock(p_brew_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brew public.brew_logs%rowtype;
  v_stock public.stock_beans%rowtype;
  v_stock_id uuid;
  v_usage numeric := 0;
  v_restored boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Login required to delete brew log.';
  end if;

  select * into v_brew
  from public.brew_logs
  where id = p_brew_id
  for update;

  if not found then
    raise exception 'Brew log not found.';
  end if;

  if not public.is_workspace_admin(v_brew.workspace_id) then
    raise exception 'Only workspace admin can delete brew log.';
  end if;

  v_usage := greatest(coalesce(v_brew.stock_usage_g, 0), 0);
  v_stock_id := v_brew.stock_bean_id;

  if v_usage > 0 and v_stock_id is null and nullif(v_brew.stock_bean_code, '') is not null then
    select id into v_stock_id
    from public.stock_beans
    where workspace_id = v_brew.workspace_id
      and bean_code = v_brew.stock_bean_code
    order by updated_at desc nulls last, created_at desc
    limit 1;
  end if;

  if v_usage > 0 and v_stock_id is null then
    select id into v_stock_id
    from public.stock_beans
    where workspace_id = v_brew.workspace_id
      and lower(coalesce(coffee_name, '')) = lower(coalesce(v_brew.bean_name, ''))
      and lower(coalesce(origin, '')) = lower(coalesce(v_brew.origin, ''))
      and lower(coalesce(variety, '')) = lower(coalesce(v_brew.variety, ''))
      and lower(coalesce(process, '')) = lower(coalesce(v_brew.process, ''))
      and lower(coalesce(roast_profile, '')) = lower(coalesce(v_brew.roast_profile, ''))
    order by updated_at desc nulls last, created_at desc
    limit 1;
  end if;

  if v_usage > 0 and v_stock_id is not null then
    update public.stock_beans
    set stock_g = coalesce(stock_g, 0) + v_usage,
        updated_at = now()
    where id = v_stock_id
      and workspace_id = v_brew.workspace_id
    returning * into v_stock;

    v_restored := found;
  end if;

  delete from public.qa_scores
  where workspace_id = v_brew.workspace_id
    and brew_code = v_brew.brew_code;

  delete from public.brew_logs
  where id = v_brew.id;

  return jsonb_build_object(
    'brew_id', v_brew.id,
    'brew_code', v_brew.brew_code,
    'stock_id', v_stock_id,
    'stock_usage_g', v_usage,
    'stock_restored', v_restored,
    'stock_g', case when v_restored then v_stock.stock_g else null end
  );
end;
$$;

revoke all on function public.delete_brew_log_and_restore_stock(uuid) from public;
grant execute on function public.delete_brew_log_and_restore_stock(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Accurate dashboard public metric count
-- -----------------------------------------------------------------------------
create or replace function public.get_dashboard_user_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with account_ids as (
    select id::text as key from public.profiles where id is not null
    union
    select user_id::text as key from public.workspace_members where user_id is not null
    union
    select created_by::text as key from public.stock_beans where created_by is not null
    union
    select created_by::text as key from public.brew_logs where created_by is not null
    union
    select created_by::text as key from public.qa_scores where created_by is not null
  ),
  guest_keys as (
    select lower(trim(coalesce(nullif(brewer_name, ''), nullif(source_client_id, '')))) as key
    from public.brew_logs
    where created_by is null
      and coalesce(nullif(brewer_name, ''), nullif(source_client_id, '')) is not null
    union
    select lower(trim(coalesce(nullif(evaluator, ''), nullif(source_client_id, '')))) as key
    from public.qa_scores
    where created_by is null
      and coalesce(nullif(evaluator, ''), nullif(source_client_id, '')) is not null
  )
  select
    coalesce((select count(distinct key)::integer from account_ids where key is not null and key <> ''), 0)
    + coalesce((select count(distinct key)::integer from guest_keys where key is not null and key <> ''), 0);
$$;

grant execute on function public.get_dashboard_user_count() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. RLS cleanup: drop old policy names, recreate authoritative policies
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.stock_beans enable row level security;
alter table public.brew_logs enable row level security;
alter table public.qa_scores enable row level security;

-- profiles
drop policy if exists "Profiles select own" on public.profiles;
drop policy if exists "Profiles select own or workspace admin" on public.profiles;
drop policy if exists "Profiles insert own" on public.profiles;
drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles select own or workspace admin" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.workspace_members wm
      where wm.user_id = public.profiles.id
        and public.is_workspace_admin(wm.workspace_id)
    )
  );
create policy "Profiles insert own" on public.profiles
  for insert with check (id = auth.uid());
create policy "Profiles update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- workspaces
drop policy if exists "Workspaces read public or member" on public.workspaces;
drop policy if exists "Workspaces read active directory or member" on public.workspaces;
drop policy if exists "Workspaces insert authenticated" on public.workspaces;
drop policy if exists "Workspaces update admin" on public.workspaces;
drop policy if exists "Workspaces delete admin" on public.workspaces;
create policy "Workspaces read active directory or member" on public.workspaces
  for select using (status = 'active' or public.is_workspace_member(id));
create policy "Workspaces insert authenticated" on public.workspaces
  for insert with check (auth.uid() is not null and created_by = auth.uid());
create policy "Workspaces update admin" on public.workspaces
  for update using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));
create policy "Workspaces delete admin" on public.workspaces
  for delete using (public.is_workspace_admin(id));

-- workspace_members
drop policy if exists "Members read own or admin" on public.workspace_members;
drop policy if exists "Members self join public or admin add" on public.workspace_members;
drop policy if exists "Members request access or admin add" on public.workspace_members;
drop policy if exists "Members update admin" on public.workspace_members;
drop policy if exists "Members delete admin" on public.workspace_members;
create policy "Members read own or admin" on public.workspace_members
  for select using (user_id = auth.uid() or public.is_workspace_admin(workspace_id));
create policy "Members request access or admin add" on public.workspace_members
  for insert with check (
    (
      user_id = auth.uid()
      and role in ('brewer', 'qa')
      and status = 'pending'
      and exists (select 1 from public.workspaces w where w.id = workspace_id and w.status = 'active')
    )
    or public.is_workspace_admin(workspace_id)
  );
create policy "Members update admin" on public.workspace_members
  for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy "Members delete admin" on public.workspace_members
  for delete using (public.is_workspace_admin(workspace_id));

-- stock_beans
drop policy if exists "Stock read approved own or moderator" on public.stock_beans;
drop policy if exists "Stock read private owner or admin" on public.stock_beans;
drop policy if exists "Stock read workspace members" on public.stock_beans;
drop policy if exists "Stock insert member" on public.stock_beans;
drop policy if exists "Stock insert private member" on public.stock_beans;
drop policy if exists "Stock insert workspace member" on public.stock_beans;
drop policy if exists "Stock update owner or moderator" on public.stock_beans;
drop policy if exists "Stock update private owner or admin" on public.stock_beans;
drop policy if exists "Stock update admin only" on public.stock_beans;
drop policy if exists "Stock delete admin" on public.stock_beans;
drop policy if exists "Stock delete private owner or admin" on public.stock_beans;
drop policy if exists "Stock delete admin only" on public.stock_beans;
create policy "Stock read workspace members" on public.stock_beans
  for select using (public.is_workspace_member(workspace_id) or created_by = auth.uid());
create policy "Stock insert workspace member" on public.stock_beans
  for insert with check (auth.uid() is not null and public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "Stock update admin only" on public.stock_beans
  for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy "Stock delete admin only" on public.stock_beans
  for delete using (public.is_workspace_admin(workspace_id));

-- brew_logs
drop policy if exists "Brew read approved own or moderator" on public.brew_logs;
drop policy if exists "Brew read public approved or workspace" on public.brew_logs;
drop policy if exists "Brew insert member" on public.brew_logs;
drop policy if exists "Brew insert member pending unless moderator" on public.brew_logs;
drop policy if exists "Brew insert member or guest approved" on public.brew_logs;
drop policy if exists "Brew update owner or moderator" on public.brew_logs;
drop policy if exists "Brew delete admin" on public.brew_logs;
drop policy if exists "Brew delete moderator" on public.brew_logs;
create policy "Brew read public approved or workspace" on public.brew_logs
  for select using (
    (visibility = 'public' and moderation_status = 'approved')
    or created_by = auth.uid()
    or public.is_workspace_member(workspace_id)
    or public.can_moderate_workspace(workspace_id)
  );
create policy "Brew insert member or guest approved" on public.brew_logs
  for insert with check (
    (
      auth.uid() is not null
      and created_by = auth.uid()
      and public.is_workspace_member(workspace_id)
      and visibility = 'public'
      and (moderation_status = 'pending' or public.can_moderate_workspace(workspace_id))
    )
    or
    (
      auth.uid() is null
      and created_by is null
      and workspace_id = '00000000-0000-0000-0000-000000000001'
      and visibility = 'public'
      and moderation_status = 'approved'
      and coalesce(qa_final, 0) >= 6.5
      and lower(coalesce(approved_for_recipe, '')) = 'yes'
    )
  );
create policy "Brew update owner or moderator" on public.brew_logs
  for update using (created_by = auth.uid() or public.can_moderate_workspace(workspace_id))
  with check (created_by = auth.uid() or public.can_moderate_workspace(workspace_id));
create policy "Brew delete moderator" on public.brew_logs
  for delete using (public.can_moderate_workspace(workspace_id));

-- qa_scores
drop policy if exists "QA read approved own or moderator" on public.qa_scores;
drop policy if exists "QA read public approved or workspace" on public.qa_scores;
drop policy if exists "QA insert member" on public.qa_scores;
drop policy if exists "QA insert member pending unless moderator" on public.qa_scores;
drop policy if exists "QA insert member or guest approved" on public.qa_scores;
drop policy if exists "QA update owner or moderator" on public.qa_scores;
drop policy if exists "QA delete admin" on public.qa_scores;
drop policy if exists "QA delete moderator" on public.qa_scores;
create policy "QA read public approved or workspace" on public.qa_scores
  for select using (
    (visibility = 'public' and moderation_status = 'approved')
    or created_by = auth.uid()
    or public.is_workspace_member(workspace_id)
    or public.can_moderate_workspace(workspace_id)
  );
create policy "QA insert member or guest approved" on public.qa_scores
  for insert with check (
    (
      auth.uid() is not null
      and created_by = auth.uid()
      and public.is_workspace_member(workspace_id)
      and visibility = 'public'
      and (moderation_status = 'pending' or public.can_moderate_workspace(workspace_id))
    )
    or
    (
      auth.uid() is null
      and created_by is null
      and workspace_id = '00000000-0000-0000-0000-000000000001'
      and visibility = 'public'
      and moderation_status = 'approved'
      and coalesce(final_qa, 0) >= 6.5
    )
  );
create policy "QA update owner or moderator" on public.qa_scores
  for update using (created_by = auth.uid() or public.can_moderate_workspace(workspace_id))
  with check (created_by = auth.uid() or public.can_moderate_workspace(workspace_id));
create policy "QA delete moderator" on public.qa_scores
  for delete using (public.can_moderate_workspace(workspace_id));

-- -----------------------------------------------------------------------------
-- 6. Suggestions table/policies
-- -----------------------------------------------------------------------------
create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text,
  email text,
  category text,
  priority text default 'Normal',
  message text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'closed')),
  workspace_id uuid references public.workspaces(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null
);

alter table public.suggestions enable row level security;

drop policy if exists "Suggestions public insert" on public.suggestions;
drop policy if exists "Suggestions read owner or workspace admin" on public.suggestions;
drop policy if exists "Suggestions update workspace admin" on public.suggestions;
create policy "Suggestions public insert" on public.suggestions
  for insert with check (status = 'open');
create policy "Suggestions read owner or workspace admin" on public.suggestions
  for select using (created_by = auth.uid() or (workspace_id is not null and public.is_workspace_admin(workspace_id)));
create policy "Suggestions update workspace admin" on public.suggestions
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id))
  with check (workspace_id is not null and public.is_workspace_admin(workspace_id));

-- -----------------------------------------------------------------------------
-- 7. Indexes + data cleanup
-- -----------------------------------------------------------------------------
create index if not exists brew_logs_workspace_created_idx on public.brew_logs (workspace_id, created_at desc);
create index if not exists brew_logs_public_feed_idx on public.brew_logs (visibility, moderation_status, qa_final desc, created_at desc);
create index if not exists brew_logs_brew_code_idx on public.brew_logs (brew_code);
create index if not exists qa_scores_workspace_created_idx on public.qa_scores (workspace_id, created_at desc);
create index if not exists qa_scores_brew_code_idx on public.qa_scores (brew_code);
create index if not exists qa_scores_brew_workspace_details_idx on public.qa_scores (brew_code, workspace_id, created_at desc);
create index if not exists stock_beans_workspace_created_idx on public.stock_beans (workspace_id, created_at desc);
create index if not exists workspace_members_user_status_idx on public.workspace_members (user_id, status, workspace_id);
create index if not exists idx_suggestions_status_created on public.suggestions (status, created_at desc);
create index if not exists idx_suggestions_workspace on public.suggestions (workspace_id, created_at desc);

update public.stock_beans
set visibility = 'private'
where visibility is null or visibility <> 'private';

update public.stock_beans
set moderation_status = 'approved'
where moderation_status is null or moderation_status = 'pending';

update public.brew_logs
set moderation_status = 'approved',
    approved_for_recipe = 'Yes',
    status = 'approved'
where visibility = 'public'
  and coalesce(qa_final, 0) >= 6.5
  and lower(coalesce(approved_for_recipe, '')) = 'yes'
  and coalesce(moderation_status, 'pending') = 'pending';

notify pgrst, 'reload schema';
