-- Coffee Brew & Beans Recommendation Web App
-- Supabase Commercial MVP schema: Auth + Workspace + Roles + Moderation
-- Run in Supabase Dashboard > SQL Editor.
-- Safe to run more than once for most objects/policies.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Utility
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Auth profile
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text,
  display_name text,
  avatar_url text,
  status text not null default 'active'
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Optional trigger: create profile automatically when Auth user is created.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

-- -----------------------------------------------------------------------------
-- Workspaces: coffee shop / roastery / community tenant
-- -----------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  slug text unique not null,
  description text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null
);

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'brewer' check (role in ('brewer', 'qa', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

drop trigger if exists trg_workspace_members_updated_at on public.workspace_members;
create trigger trg_workspace_members_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

-- Default public workspace for demo/community browsing.
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

-- When a user creates a workspace, they automatically become admin.
create or replace function public.handle_new_workspace_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.workspace_members (workspace_id, user_id, role, status)
    values (new.id, new.created_by, 'admin', 'active')
    on conflict (workspace_id, user_id) do update set role = 'admin', status = 'active', updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_workspace_created_admin on public.workspaces;
create trigger on_workspace_created_admin
after insert on public.workspaces
for each row execute function public.handle_new_workspace_admin();

-- -----------------------------------------------------------------------------
-- Role helper functions used by RLS policies
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

create or replace function public.can_moderate_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_workspace_role(ws), '') in ('qa', 'admin');
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

-- -----------------------------------------------------------------------------
-- Data tables
-- -----------------------------------------------------------------------------
create table if not exists public.stock_beans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bean_code text,
  coffee_name text not null,
  origin text,
  producer text,
  variety text,
  variety2_optional text,
  process text,
  roast_profile text,
  flavor_family text,
  flavor_family2_optional text,
  flavor_family3_optional text,
  notes text,
  sweetness numeric,
  acidity numeric,
  body numeric,
  stock_g numeric default 0,
  best_brew text default 'Both',
  price numeric default 0,
  roast_date date,
  active text default 'Yes',
  visibility text not null default 'public',
  status text not null default 'pending',
  source_client_id text,
  workspace_id uuid references public.workspaces(id) default '00000000-0000-0000-0000-000000000001',
  created_by uuid references auth.users(id) on delete set null,
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_notes text,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz
);

create table if not exists public.brew_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  brew_code text,
  brew_date date default current_date,
  bean_name text,
  origin text,
  variety text,
  process text,
  roast_profile text,
  dripper text,
  method text,
  grinder text,
  grind_setting text,
  temp_c numeric,
  ratio numeric,
  dose_g numeric,
  total_water_ml numeric,
  hot_water_ml numeric,
  ice_g numeric,
  brew_time_sec numeric,
  bloom_ml numeric,
  pour_count numeric,
  pour_plan text,
  water text,
  tds_ppm numeric,
  agitation text,
  filter_type text,
  parent_brew_code text,
  primary_variable_changed text,
  hypothesis text,
  result_notes text,
  qa_code text,
  qa_final numeric,
  qa_status text,
  manual_approval text default 'No',
  approved_for_recipe text default 'No',
  recipe_key text,
  current_match_score numeric,
  water_formula_note text,
  switch_valve_mode text,
  valve_plan text,
  visibility text not null default 'public',
  status text not null default 'pending',
  source_client_id text,
  workspace_id uuid references public.workspaces(id) default '00000000-0000-0000-0000-000000000001',
  created_by uuid references auth.users(id) on delete set null,
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_notes text,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz
);

create table if not exists public.qa_scores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  qa_code text,
  brew_code text,
  qa_date date default current_date,
  evaluator text,
  aroma numeric,
  flavor numeric,
  aftertaste numeric,
  acidity_quality numeric,
  sweetness numeric,
  body numeric,
  balance numeric,
  clarity numeric,
  finish numeric,
  defect_penalty numeric,
  consistency numeric,
  final_qa numeric,
  status text,
  approver text,
  qa_notes text,
  visibility text not null default 'public',
  source_client_id text,
  workspace_id uuid references public.workspaces(id) default '00000000-0000-0000-0000-000000000001',
  created_by uuid references auth.users(id) on delete set null,
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_notes text,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz
);

-- Add v2 columns when upgrading from v1 schema.
alter table public.stock_beans add column if not exists workspace_id uuid references public.workspaces(id) default '00000000-0000-0000-0000-000000000001';
alter table public.stock_beans add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.stock_beans add column if not exists moderation_status text not null default 'pending';
alter table public.stock_beans add column if not exists moderation_notes text;
alter table public.stock_beans add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.stock_beans add column if not exists moderated_at timestamptz;

alter table public.brew_logs add column if not exists workspace_id uuid references public.workspaces(id) default '00000000-0000-0000-0000-000000000001';
alter table public.brew_logs add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.brew_logs add column if not exists moderation_status text not null default 'pending';
alter table public.brew_logs add column if not exists moderation_notes text;
alter table public.brew_logs add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.brew_logs add column if not exists moderated_at timestamptz;

alter table public.qa_scores add column if not exists workspace_id uuid references public.workspaces(id) default '00000000-0000-0000-0000-000000000001';
alter table public.qa_scores add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.qa_scores add column if not exists moderation_status text not null default 'pending';
alter table public.qa_scores add column if not exists moderation_notes text;
alter table public.qa_scores add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.qa_scores add column if not exists moderated_at timestamptz;

-- Existing v1 published rows become approved.
update public.stock_beans set moderation_status = 'approved' where moderation_status = 'pending' and status = 'published';
update public.brew_logs set moderation_status = 'approved' where moderation_status = 'pending' and status = 'published';
update public.qa_scores set moderation_status = 'approved' where moderation_status = 'pending' and visibility = 'public';

-- Triggers
drop trigger if exists trg_stock_beans_updated_at on public.stock_beans;
create trigger trg_stock_beans_updated_at
before update on public.stock_beans
for each row execute function public.set_updated_at();

drop trigger if exists trg_brew_logs_updated_at on public.brew_logs;
create trigger trg_brew_logs_updated_at
before update on public.brew_logs
for each row execute function public.set_updated_at();

drop trigger if exists trg_qa_scores_updated_at on public.qa_scores;
create trigger trg_qa_scores_updated_at
before update on public.qa_scores
for each row execute function public.set_updated_at();

-- Prevent ordinary row owners from self-approving data through direct API calls.
create or replace function public.enforce_moderation_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if (old.moderation_status is distinct from new.moderation_status
        or old.moderated_by is distinct from new.moderated_by
        or old.moderated_at is distinct from new.moderated_at
        or old.moderation_notes is distinct from new.moderation_notes)
       and not public.can_moderate_workspace(old.workspace_id) then
      raise exception 'Only QA/Admin can change moderation fields';
    end if;

    if old.workspace_id is distinct from new.workspace_id
       and not public.is_workspace_admin(old.workspace_id) then
      raise exception 'Only Admin can move rows between workspaces';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stock_beans_moderation_guard on public.stock_beans;
create trigger trg_stock_beans_moderation_guard
before update on public.stock_beans
for each row execute function public.enforce_moderation_permissions();

drop trigger if exists trg_brew_logs_moderation_guard on public.brew_logs;
create trigger trg_brew_logs_moderation_guard
before update on public.brew_logs
for each row execute function public.enforce_moderation_permissions();

drop trigger if exists trg_qa_scores_moderation_guard on public.qa_scores;
create trigger trg_qa_scores_moderation_guard
before update on public.qa_scores
for each row execute function public.enforce_moderation_permissions();

-- Indexes
create index if not exists idx_workspaces_visibility on public.workspaces (visibility, status, name);
create index if not exists idx_workspace_members_user on public.workspace_members (user_id, status);
create index if not exists idx_workspace_members_workspace_role on public.workspace_members (workspace_id, role, status);
create index if not exists idx_stock_beans_public on public.stock_beans (visibility, moderation_status, created_at desc);
create index if not exists idx_stock_beans_workspace_status on public.stock_beans (workspace_id, moderation_status, created_at desc);
create index if not exists idx_stock_beans_profile on public.stock_beans (variety, variety2_optional, process, roast_profile);
create index if not exists idx_brew_logs_public on public.brew_logs (visibility, moderation_status, created_at desc);
create index if not exists idx_brew_logs_workspace_status on public.brew_logs (workspace_id, moderation_status, created_at desc);
create index if not exists idx_brew_logs_recipe_key on public.brew_logs (recipe_key, qa_final desc);
create index if not exists idx_qa_scores_public on public.qa_scores (visibility, moderation_status, created_at desc);
create index if not exists idx_qa_scores_workspace_status on public.qa_scores (workspace_id, moderation_status, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.stock_beans enable row level security;
alter table public.brew_logs enable row level security;
alter table public.qa_scores enable row level security;

-- Remove v1 public MVP policies if upgrading from the previous schema.
DROP POLICY IF EXISTS "Public read stock beans" ON public.stock_beans;
DROP POLICY IF EXISTS "Public read brew logs" ON public.brew_logs;
DROP POLICY IF EXISTS "Public read qa scores" ON public.qa_scores;
DROP POLICY IF EXISTS "Public insert stock beans" ON public.stock_beans;
DROP POLICY IF EXISTS "Public insert brew logs" ON public.brew_logs;
DROP POLICY IF EXISTS "Public insert qa scores" ON public.qa_scores;

-- Profiles
DROP POLICY IF EXISTS "Profiles select own" ON public.profiles;
CREATE POLICY "Profiles select own" ON public.profiles
  FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS "Profiles insert own" ON public.profiles;
CREATE POLICY "Profiles insert own" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "Profiles update own" ON public.profiles;
CREATE POLICY "Profiles update own" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Workspaces
DROP POLICY IF EXISTS "Workspaces read public or member" ON public.workspaces;
CREATE POLICY "Workspaces read public or member" ON public.workspaces
  FOR SELECT USING (visibility = 'public' OR public.is_workspace_member(id));
DROP POLICY IF EXISTS "Workspaces insert authenticated" ON public.workspaces;
CREATE POLICY "Workspaces insert authenticated" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (created_by = auth.uid() OR created_by IS NULL));
DROP POLICY IF EXISTS "Workspaces update admin" ON public.workspaces;
CREATE POLICY "Workspaces update admin" ON public.workspaces
  FOR UPDATE USING (public.is_workspace_admin(id)) WITH CHECK (public.is_workspace_admin(id));
DROP POLICY IF EXISTS "Workspaces delete admin" ON public.workspaces;
CREATE POLICY "Workspaces delete admin" ON public.workspaces
  FOR DELETE USING (public.is_workspace_admin(id));

-- Workspace members
DROP POLICY IF EXISTS "Members read own or admin" ON public.workspace_members;
CREATE POLICY "Members read own or admin" ON public.workspace_members
  FOR SELECT USING (user_id = auth.uid() OR public.is_workspace_admin(workspace_id));
DROP POLICY IF EXISTS "Members self join public or admin add" ON public.workspace_members;
CREATE POLICY "Members self join public or admin add" ON public.workspace_members
  FOR INSERT WITH CHECK (
    (
      user_id = auth.uid()
      AND role = 'brewer'
      AND status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = workspace_id AND w.visibility = 'public' AND w.status = 'active'
      )
    )
    OR public.is_workspace_admin(workspace_id)
  );
DROP POLICY IF EXISTS "Members update admin" ON public.workspace_members;
CREATE POLICY "Members update admin" ON public.workspace_members
  FOR UPDATE USING (public.is_workspace_admin(workspace_id)) WITH CHECK (public.is_workspace_admin(workspace_id));
DROP POLICY IF EXISTS "Members delete admin" ON public.workspace_members;
CREATE POLICY "Members delete admin" ON public.workspace_members
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

-- Public approved read; own pending read; moderator read.
DROP POLICY IF EXISTS "Stock read approved own or moderator" ON public.stock_beans;
CREATE POLICY "Stock read approved own or moderator" ON public.stock_beans
  FOR SELECT USING (
    (visibility = 'public' AND moderation_status = 'approved')
    OR created_by = auth.uid()
    OR public.can_moderate_workspace(workspace_id)
  );
DROP POLICY IF EXISTS "Stock insert member" ON public.stock_beans;
CREATE POLICY "Stock insert member" ON public.stock_beans
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND public.is_workspace_member(workspace_id)
    AND (moderation_status = 'pending' OR public.can_moderate_workspace(workspace_id))
  );
DROP POLICY IF EXISTS "Stock update owner or moderator" ON public.stock_beans;
CREATE POLICY "Stock update owner or moderator" ON public.stock_beans
  FOR UPDATE USING (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id))
  WITH CHECK (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id));
DROP POLICY IF EXISTS "Stock delete admin" ON public.stock_beans;
CREATE POLICY "Stock delete admin" ON public.stock_beans
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

DROP POLICY IF EXISTS "Brew read approved own or moderator" ON public.brew_logs;
CREATE POLICY "Brew read approved own or moderator" ON public.brew_logs
  FOR SELECT USING (
    (visibility = 'public' AND moderation_status = 'approved')
    OR created_by = auth.uid()
    OR public.can_moderate_workspace(workspace_id)
  );
DROP POLICY IF EXISTS "Brew insert member" ON public.brew_logs;
CREATE POLICY "Brew insert member" ON public.brew_logs
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND public.is_workspace_member(workspace_id)
    AND (moderation_status = 'pending' OR public.can_moderate_workspace(workspace_id))
  );
DROP POLICY IF EXISTS "Brew update owner or moderator" ON public.brew_logs;
CREATE POLICY "Brew update owner or moderator" ON public.brew_logs
  FOR UPDATE USING (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id))
  WITH CHECK (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id));
DROP POLICY IF EXISTS "Brew delete admin" ON public.brew_logs;
CREATE POLICY "Brew delete admin" ON public.brew_logs
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

DROP POLICY IF EXISTS "QA read approved own or moderator" ON public.qa_scores;
CREATE POLICY "QA read approved own or moderator" ON public.qa_scores
  FOR SELECT USING (
    (visibility = 'public' AND moderation_status = 'approved')
    OR created_by = auth.uid()
    OR public.can_moderate_workspace(workspace_id)
  );
DROP POLICY IF EXISTS "QA insert member" ON public.qa_scores;
CREATE POLICY "QA insert member" ON public.qa_scores
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND public.is_workspace_member(workspace_id)
    AND (moderation_status = 'pending' OR public.can_moderate_workspace(workspace_id))
  );
DROP POLICY IF EXISTS "QA update owner or moderator" ON public.qa_scores;
CREATE POLICY "QA update owner or moderator" ON public.qa_scores
  FOR UPDATE USING (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id))
  WITH CHECK (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id));
DROP POLICY IF EXISTS "QA delete admin" ON public.qa_scores;
CREATE POLICY "QA delete admin" ON public.qa_scores
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

-- -----------------------------------------------------------------------------
-- Important operational note
-- -----------------------------------------------------------------------------
-- To promote a user to QA/Admin in a workspace, an existing workspace admin can update
-- workspace_members.role from the SQL editor or a future user-management UI.
-- Example:
-- update public.workspace_members
-- set role = 'qa'
-- where workspace_id = '<workspace_uuid>' and user_id = '<user_uuid>';
