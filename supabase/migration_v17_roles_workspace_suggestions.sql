-- Migration v17: role signup approval, private company workspace, suggestions box
-- Jalankan setelah migration v15 untuk project yang sudah berjalan.

-- 1) Workspace member status now supports pending/rejected for approval workflow.
alter table public.workspace_members drop constraint if exists workspace_members_status_check;
alter table public.workspace_members add constraint workspace_members_status_check
  check (status in ('pending', 'active', 'rejected', 'disabled'));

-- 2) Workspaces are listed as active companies for signup dropdown, but app modules
--    remain protected by workspace_members active membership and existing RLS.
DROP POLICY IF EXISTS "Workspaces read public or member" ON public.workspaces;
DROP POLICY IF EXISTS "Workspaces read active directory or member" ON public.workspaces;
CREATE POLICY "Workspaces read active directory or member" ON public.workspaces
  FOR SELECT USING (status = 'active' OR public.is_workspace_member(id));

-- 3) Users can request Brewer/QA access. Admin still approves through update.
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

-- 4) Allow workspace admins to read pending users' profile names/emails.
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

-- 5) Signup metadata creates pending membership automatically for Brewer/QA.
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
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
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
      role = excluded.role,
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

-- 6) Kotak Saran table.
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
CREATE POLICY "Suggestions read owner or workspace admin" ON public.suggestions
  FOR SELECT USING (
    created_by = auth.uid()
    OR (workspace_id is not null AND public.is_workspace_admin(workspace_id))
  );

DROP POLICY IF EXISTS "Suggestions update workspace admin" ON public.suggestions;
CREATE POLICY "Suggestions update workspace admin" ON public.suggestions
  FOR UPDATE USING (workspace_id is not null AND public.is_workspace_admin(workspace_id))
  WITH CHECK (workspace_id is not null AND public.is_workspace_admin(workspace_id));

create index if not exists idx_suggestions_status_created on public.suggestions (status, created_at desc);
create index if not exists idx_suggestions_workspace on public.suggestions (workspace_id, created_at desc);
