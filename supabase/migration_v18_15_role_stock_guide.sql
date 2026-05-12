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
