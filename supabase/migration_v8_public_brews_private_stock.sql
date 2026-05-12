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
