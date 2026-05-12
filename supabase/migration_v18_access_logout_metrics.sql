alter table public.workspace_members drop constraint if exists workspace_members_status_check;
alter table public.workspace_members add constraint workspace_members_status_check check (status in ('pending', 'active', 'rejected', 'disabled'));

drop policy if exists "Members request access or admin add" on public.workspace_members;
create policy "Members request access or admin add" on public.workspace_members
  for insert with check (
    (
      user_id = auth.uid()
      and role in ('brewer', 'qa')
      and status = 'pending'
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.status = 'active'
      )
    )
    or public.is_workspace_admin(workspace_id)
  );

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

create or replace function public.get_dashboard_user_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    coalesce((select count(*)::integer from public.profiles), 0)
    + coalesce((
      select count(distinct lower(coalesce(nullif(evaluator, ''), source_client_id)))::integer
      from public.qa_scores
      where created_by is null
        and coalesce(nullif(evaluator, ''), source_client_id) is not null
    ), 0)
  );
$$;

grant execute on function public.get_dashboard_user_count() to anon, authenticated;
