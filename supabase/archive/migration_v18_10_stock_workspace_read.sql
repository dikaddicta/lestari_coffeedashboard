drop policy if exists "Stock read private owner or admin" on public.stock_beans;
drop policy if exists "Stock read workspace members" on public.stock_beans;

create policy "Stock read workspace members" on public.stock_beans
  for select using (
    public.is_workspace_member(workspace_id)
    or created_by = auth.uid()
    or public.is_workspace_admin(workspace_id)
  );
