alter table public.workspace_members drop constraint if exists workspace_members_status_check;
alter table public.workspace_members add constraint workspace_members_status_check
  check (status in ('pending', 'active', 'rejected', 'disabled'));

drop policy if exists "Members read own or admin" on public.workspace_members;
create policy "Members read own or admin" on public.workspace_members
  for select using (user_id = auth.uid() or public.is_workspace_admin(workspace_id));

drop policy if exists "Members update admin" on public.workspace_members;
create policy "Members update admin" on public.workspace_members
  for update using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists "Members delete admin" on public.workspace_members;
create policy "Members delete admin" on public.workspace_members
  for delete using (public.is_workspace_admin(workspace_id));

drop policy if exists "Profiles select own or workspace admin" on public.profiles;
create policy "Profiles select own or workspace admin" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.workspace_members wm
      where wm.user_id = public.profiles.id
        and public.is_workspace_admin(wm.workspace_id)
    )
  );
