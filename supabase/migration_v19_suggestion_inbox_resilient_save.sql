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
