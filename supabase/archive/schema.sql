create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
  status text not null default 'active' check (status in ('pending', 'active', 'rejected', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

drop trigger if exists trg_workspace_members_updated_at on public.workspace_members;
create trigger trg_workspace_members_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

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

create or replace function public.is_any_workspace_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = auth.uid()
      and wm.role = 'admin'
      and wm.status = 'active'
  );
$$;

grant execute on function public.is_any_workspace_admin() to authenticated;

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
  visibility text not null default 'private',
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
  brewer_name text,
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

alter table public.stock_beans add column if not exists workspace_id uuid references public.workspaces(id) default '00000000-0000-0000-0000-000000000001';
alter table public.stock_beans add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.stock_beans add column if not exists moderation_status text not null default 'pending';
alter table public.stock_beans add column if not exists moderation_notes text;
alter table public.stock_beans add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.stock_beans add column if not exists moderated_at timestamptz;

alter table public.brew_logs add column if not exists brewer_name text;
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

update public.stock_beans set moderation_status = 'approved' where moderation_status = 'pending' and status = 'published';
update public.brew_logs set moderation_status = 'approved' where moderation_status = 'pending' and status = 'published';
update public.qa_scores set moderation_status = 'approved' where moderation_status = 'pending' and visibility = 'public';

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

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.stock_beans enable row level security;
alter table public.brew_logs enable row level security;
alter table public.qa_scores enable row level security;

DROP POLICY IF EXISTS "Public read stock beans" ON public.stock_beans;
DROP POLICY IF EXISTS "Public read brew logs" ON public.brew_logs;
DROP POLICY IF EXISTS "Public read qa scores" ON public.qa_scores;
DROP POLICY IF EXISTS "Public insert stock beans" ON public.stock_beans;
DROP POLICY IF EXISTS "Public insert brew logs" ON public.brew_logs;
DROP POLICY IF EXISTS "Public insert qa scores" ON public.qa_scores;

DROP POLICY IF EXISTS "Profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select own or workspace admin" ON public.profiles;
CREATE POLICY "Profiles select own or workspace admin" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.user_id = public.profiles.id
        AND public.is_workspace_admin(wm.workspace_id)
    )
  );
DROP POLICY IF EXISTS "Profiles insert own" ON public.profiles;
CREATE POLICY "Profiles insert own" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "Profiles update own" ON public.profiles;
CREATE POLICY "Profiles update own" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Workspaces read public or member" ON public.workspaces;
DROP POLICY IF EXISTS "Workspaces read active directory or member" ON public.workspaces;
CREATE POLICY "Workspaces read active directory or member" ON public.workspaces
  FOR SELECT USING (status = 'active' OR public.is_workspace_member(id));
DROP POLICY IF EXISTS "Workspaces insert authenticated" ON public.workspaces;
CREATE POLICY "Workspaces insert authenticated" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (created_by = auth.uid() OR created_by IS NULL));
DROP POLICY IF EXISTS "Workspaces update admin" ON public.workspaces;
CREATE POLICY "Workspaces update admin" ON public.workspaces
  FOR UPDATE USING (public.is_workspace_admin(id)) WITH CHECK (public.is_workspace_admin(id));
DROP POLICY IF EXISTS "Workspaces delete admin" ON public.workspaces;
CREATE POLICY "Workspaces delete admin" ON public.workspaces
  FOR DELETE USING (public.is_workspace_admin(id));

DROP POLICY IF EXISTS "Members read own or admin" ON public.workspace_members;
CREATE POLICY "Members read own or admin" ON public.workspace_members
  FOR SELECT USING (user_id = auth.uid() OR public.is_workspace_admin(workspace_id));
DROP POLICY IF EXISTS "Members self join public or admin add" ON public.workspace_members;
DROP POLICY IF EXISTS "Members request access or admin add" ON public.workspace_members;
CREATE POLICY "Members request access or admin add" ON public.workspace_members
  FOR INSERT WITH CHECK (
    (
      user_id = auth.uid()
      AND role in ('brewer', 'qa')
      AND status = 'pending'
      AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = workspace_id AND w.status = 'active'
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
DROP POLICY IF EXISTS "Brew insert member pending unless moderator" ON public.brew_logs;
DROP POLICY IF EXISTS "Brew insert member or guest approved" ON public.brew_logs;
CREATE POLICY "Brew insert member or guest approved" ON public.brew_logs
  FOR INSERT WITH CHECK (
    (
      auth.uid() IS NOT NULL
      AND created_by = auth.uid()
      AND public.is_workspace_member(workspace_id)
      AND visibility = 'public'
      AND (moderation_status = 'pending' OR public.can_moderate_workspace(workspace_id))
    )
    OR
    (
      auth.uid() IS NULL
      AND created_by IS NULL
      AND workspace_id = '00000000-0000-0000-0000-000000000001'
      AND visibility = 'public'
      AND moderation_status = 'approved'
      AND coalesce(qa_final, 0) >= 6.5
      AND lower(coalesce(approved_for_recipe, '')) = 'yes'
    )
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
DROP POLICY IF EXISTS "QA insert member pending unless moderator" ON public.qa_scores;
DROP POLICY IF EXISTS "QA insert member or guest approved" ON public.qa_scores;
CREATE POLICY "QA insert member or guest approved" ON public.qa_scores
  FOR INSERT WITH CHECK (
    (
      auth.uid() IS NOT NULL
      AND created_by = auth.uid()
      AND public.is_workspace_member(workspace_id)
      AND visibility = 'public'
      AND (moderation_status = 'pending' OR public.can_moderate_workspace(workspace_id))
    )
    OR
    (
      auth.uid() IS NULL
      AND created_by IS NULL
      AND workspace_id = '00000000-0000-0000-0000-000000000001'
      AND visibility = 'public'
      AND moderation_status = 'approved'
      AND coalesce(final_qa, 0) >= 6.5
    )
  );
DROP POLICY IF EXISTS "QA update owner or moderator" ON public.qa_scores;
CREATE POLICY "QA update owner or moderator" ON public.qa_scores
  FOR UPDATE USING (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id))
  WITH CHECK (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id));
DROP POLICY IF EXISTS "QA delete admin" ON public.qa_scores;
CREATE POLICY "QA delete admin" ON public.qa_scores
  FOR DELETE USING (public.is_workspace_admin(workspace_id));



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

drop trigger if exists trg_suggestions_updated_at on public.suggestions;
create trigger trg_suggestions_updated_at
before update on public.suggestions
for each row execute function public.set_updated_at();

alter table public.suggestions enable row level security;

DROP POLICY IF EXISTS "Suggestions public insert" ON public.suggestions;
CREATE POLICY "Suggestions public insert" ON public.suggestions
  FOR INSERT WITH CHECK (status = 'open');

DROP POLICY IF EXISTS "Suggestions read owner or workspace admin" ON public.suggestions;
DROP POLICY IF EXISTS "Suggestions read owner or admin" ON public.suggestions;
CREATE POLICY "Suggestions read owner or admin" ON public.suggestions
  FOR SELECT USING (
    created_by = auth.uid()
    OR public.is_workspace_admin(workspace_id)
    OR public.is_any_workspace_admin()
  );

DROP POLICY IF EXISTS "Suggestions update workspace admin" ON public.suggestions;
DROP POLICY IF EXISTS "Suggestions update admin" ON public.suggestions;
CREATE POLICY "Suggestions update admin" ON public.suggestions
  FOR UPDATE USING (
    public.is_workspace_admin(workspace_id)
    OR public.is_any_workspace_admin()
  )
  WITH CHECK (
    public.is_workspace_admin(workspace_id)
    OR public.is_any_workspace_admin()
  );

create index if not exists idx_suggestions_status_created on public.suggestions (status, created_at desc);
create index if not exists idx_suggestions_workspace on public.suggestions (workspace_id, created_at desc);



alter table public.brew_logs add column if not exists brewer_name text;
alter table public.stock_beans alter column visibility set default 'private';
update public.stock_beans set visibility = 'private' where visibility = 'public';
update public.stock_beans set moderation_status = 'approved' where moderation_status = 'pending';

DROP POLICY IF EXISTS "Stock read approved own or moderator" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock insert member" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock update owner or moderator" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock delete admin" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock read private owner or admin" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock insert private member" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock update private owner or admin" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock delete private owner or admin" ON public.stock_beans;

CREATE POLICY "Stock read private owner or admin" ON public.stock_beans
  FOR SELECT USING (created_by = auth.uid() OR public.is_workspace_admin(workspace_id));

CREATE POLICY "Stock insert private member" ON public.stock_beans
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND public.is_workspace_member(workspace_id)
  );

CREATE POLICY "Stock update private owner or admin" ON public.stock_beans
  FOR UPDATE USING (created_by = auth.uid() OR public.is_workspace_admin(workspace_id))
  WITH CHECK (created_by = auth.uid() OR public.is_workspace_admin(workspace_id));

CREATE POLICY "Stock delete private owner or admin" ON public.stock_beans
  FOR DELETE USING (created_by = auth.uid() OR public.is_workspace_admin(workspace_id));

create index if not exists idx_brew_logs_public_feed on public.brew_logs (moderation_status, visibility, qa_final desc, created_at desc);


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
-- Latest consolidated patch for a fresh setup
-- -----------------------------------------------------------------------------
-- Source: supabase/migration_v18_10_stock_workspace_read.sql
drop policy if exists "Stock read private owner or admin" on public.stock_beans;
drop policy if exists "Stock read workspace members" on public.stock_beans;

create policy "Stock read workspace members" on public.stock_beans
  for select using (
    public.is_workspace_member(workspace_id)
    or created_by = auth.uid()
    or public.is_workspace_admin(workspace_id)
  );

-- Source: supabase/migration_v18_14_brew_stock_integration.sql
alter table public.brew_logs add column if not exists stock_bean_id uuid references public.stock_beans(id) on delete set null;
alter table public.brew_logs add column if not exists stock_bean_code text;
alter table public.brew_logs add column if not exists stock_usage_g numeric;

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

-- Source: supabase/migration_v18_15_role_stock_guide.sql
create or replace function public.can_moderate_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_workspace_role(ws), '') in ('qa', 'admin');
$$;

-- QA and Admin can moderate/delete rows in the moderation panel only.
drop policy if exists "Brew update owner or moderator" on public.brew_logs;
drop policy if exists "Brew delete admin" on public.brew_logs;
drop policy if exists "Brew delete moderator" on public.brew_logs;
create policy "Brew update owner or moderator" on public.brew_logs
  for update using (created_by = auth.uid() or public.can_moderate_workspace(workspace_id))
  with check (created_by = auth.uid() or public.can_moderate_workspace(workspace_id));
create policy "Brew delete moderator" on public.brew_logs
  for delete using (public.can_moderate_workspace(workspace_id));

drop policy if exists "QA update owner or moderator" on public.qa_scores;
drop policy if exists "QA delete admin" on public.qa_scores;
drop policy if exists "QA delete moderator" on public.qa_scores;
create policy "QA update owner or moderator" on public.qa_scores
  for update using (created_by = auth.uid() or public.can_moderate_workspace(workspace_id))
  with check (created_by = auth.uid() or public.can_moderate_workspace(workspace_id));
create policy "QA delete moderator" on public.qa_scores
  for delete using (public.can_moderate_workspace(workspace_id));

-- Every active workspace member can add stock. Only Admin can edit/delete stock records directly.
drop policy if exists "Stock read private owner or admin" on public.stock_beans;
drop policy if exists "Stock read workspace members" on public.stock_beans;
create policy "Stock read workspace members" on public.stock_beans
  for select using (public.is_workspace_member(workspace_id) or created_by = auth.uid());

drop policy if exists "Stock insert private member" on public.stock_beans;
drop policy if exists "Stock insert member" on public.stock_beans;
drop policy if exists "Stock insert workspace member" on public.stock_beans;
create policy "Stock insert workspace member" on public.stock_beans
  for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

drop policy if exists "Stock update private owner or admin" on public.stock_beans;
drop policy if exists "Stock update owner or moderator" on public.stock_beans;
drop policy if exists "Stock update admin only" on public.stock_beans;
create policy "Stock update admin only" on public.stock_beans
  for update using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists "Stock delete private owner or admin" on public.stock_beans;
drop policy if exists "Stock delete admin" on public.stock_beans;
drop policy if exists "Stock delete admin only" on public.stock_beans;
create policy "Stock delete admin only" on public.stock_beans
  for delete using (public.is_workspace_admin(workspace_id));

-- Source: supabase/migration_v18_23_safer_stock_restore_on_brew_delete.sql
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

-- Source: supabase/migration_v18_24_performance_indexes.sql
create index if not exists brew_logs_workspace_created_idx
  on public.brew_logs (workspace_id, created_at desc);

create index if not exists brew_logs_public_feed_idx
  on public.brew_logs (visibility, moderation_status, created_at desc);

create index if not exists brew_logs_brew_code_idx
  on public.brew_logs (brew_code);

create index if not exists qa_scores_workspace_created_idx
  on public.qa_scores (workspace_id, created_at desc);

create index if not exists qa_scores_brew_code_idx
  on public.qa_scores (brew_code);

create index if not exists stock_beans_workspace_created_idx
  on public.stock_beans (workspace_id, created_at desc);

create index if not exists workspace_members_user_status_idx
  on public.workspace_members (user_id, status, workspace_id);

-- Source: supabase/migration_v18_25_qa_details_fast_save.sql
alter table public.qa_scores add column if not exists primary_variable_changed text;
alter table public.qa_scores add column if not exists hypothesis text;
alter table public.qa_scores add column if not exists result_notes text;

create index if not exists qa_scores_brew_workspace_details_idx
  on public.qa_scores (workspace_id, brew_code, created_at desc);

-- Source: supabase/migration_v19_suggestion_inbox_resilient_save.sql
create extension if not exists pgcrypto;

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
  workspace_id uuid,
  created_by uuid references auth.users(id) on delete set null
);

alter table public.suggestions add column if not exists updated_at timestamptz not null default now();
alter table public.suggestions add column if not exists priority text default 'Normal';
alter table public.suggestions add column if not exists status text not null default 'open';
alter table public.suggestions add column if not exists workspace_id uuid;
alter table public.suggestions add column if not exists created_by uuid references auth.users(id) on delete set null;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_suggestions_updated_at on public.suggestions;
    create trigger trg_suggestions_updated_at
    before update on public.suggestions
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.suggestions enable row level security;

create or replace function public.is_workspace_admin(ws uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed boolean := false;
begin
  if auth.uid() is null or ws is null or to_regclass('public.workspace_members') is null then
    return false;
  end if;

  execute
    'select exists (
       select 1
       from public.workspace_members wm
       where wm.workspace_id = $1
         and wm.user_id = $2
         and wm.role = ''admin''
         and wm.status = ''active''
     )'
  into allowed
  using ws, auth.uid();

  return coalesce(allowed, false);
exception
  when undefined_table or undefined_column then
    return false;
end;
$$;

create or replace function public.is_any_workspace_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed boolean := false;
begin
  if auth.uid() is null or to_regclass('public.workspace_members') is null then
    return false;
  end if;

  execute
    'select exists (
       select 1
       from public.workspace_members wm
       where wm.user_id = $1
         and wm.role = ''admin''
         and wm.status = ''active''
     )'
  into allowed
  using auth.uid();

  return coalesce(allowed, false);
exception
  when undefined_table or undefined_column then
    return false;
end;
$$;

grant execute on function public.is_workspace_admin(uuid) to authenticated;
grant execute on function public.is_any_workspace_admin() to authenticated;

DROP POLICY IF EXISTS "Suggestions public insert" ON public.suggestions;
CREATE POLICY "Suggestions public insert" ON public.suggestions
  FOR INSERT WITH CHECK (status = 'open');

DROP POLICY IF EXISTS "Suggestions read owner or workspace admin" ON public.suggestions;
DROP POLICY IF EXISTS "Suggestions read owner or admin" ON public.suggestions;
CREATE POLICY "Suggestions read owner or admin" ON public.suggestions
  FOR SELECT USING (
    created_by = auth.uid()
    OR public.is_workspace_admin(workspace_id)
    OR public.is_any_workspace_admin()
  );

DROP POLICY IF EXISTS "Suggestions update workspace admin" ON public.suggestions;
DROP POLICY IF EXISTS "Suggestions update admin" ON public.suggestions;
CREATE POLICY "Suggestions update admin" ON public.suggestions
  FOR UPDATE USING (
    public.is_workspace_admin(workspace_id)
    OR public.is_any_workspace_admin()
  )
  WITH CHECK (
    public.is_workspace_admin(workspace_id)
    OR public.is_any_workspace_admin()
  );

create index if not exists idx_suggestions_status_created on public.suggestions (status, created_at desc);
create index if not exists idx_suggestions_workspace on public.suggestions (workspace_id, created_at desc);

do $$
begin
  if to_regclass('public.workspaces') is not null then
    begin
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
    exception
      when undefined_column then
        null;
    end;
  end if;

  update public.suggestions
  set workspace_id = '00000000-0000-0000-0000-000000000001'
  where workspace_id is null;
exception
  when foreign_key_violation then
    null;
end $$;
