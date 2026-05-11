-- Migration v9: modul privat per workspace + feed hasil seduhan publik
-- Jalankan setelah migration v8 jika database sudah aktif.

-- Stok tetap privat.
alter table public.stock_beans alter column visibility set default 'private';
update public.stock_beans set visibility = 'private' where visibility is null or visibility <> 'private';
update public.stock_beans set moderation_status = 'approved' where moderation_status is null or moderation_status = 'pending';

-- Brew log dan QA disiapkan sebagai kandidat publik, tetapi hanya tampil publik setelah approved.
alter table public.brew_logs alter column visibility set default 'public';
alter table public.qa_scores alter column visibility set default 'public';

-- Brew log lama yang sebelumnya private dibuat public-pending agar tetap tidak tampil publik sebelum dimoderasi.
update public.brew_logs
set visibility = 'public',
    moderation_status = case
      when moderation_status = 'approved' and coalesce(qa_final, 0) >= 8.6 then 'approved'
      else coalesce(moderation_status, 'pending')
    end
where visibility is null or visibility = 'private';

update public.qa_scores
set visibility = 'public',
    moderation_status = coalesce(moderation_status, 'pending')
where visibility is null or visibility = 'private';

-- Stock: hanya pemilik data atau admin workspace.
DROP POLICY IF EXISTS "Stock read approved own or moderator" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock read private owner or admin" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock insert member" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock insert private member" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock update owner or moderator" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock update private owner or admin" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock delete admin" ON public.stock_beans;
DROP POLICY IF EXISTS "Stock delete private owner or admin" ON public.stock_beans;

CREATE POLICY "Stock read private owner or admin" ON public.stock_beans
  FOR SELECT USING (created_by = auth.uid() OR public.is_workspace_admin(workspace_id));

CREATE POLICY "Stock insert private member" ON public.stock_beans
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND public.is_workspace_member(workspace_id)
    AND visibility = 'private'
  );

CREATE POLICY "Stock update private owner or admin" ON public.stock_beans
  FOR UPDATE USING (created_by = auth.uid() OR public.is_workspace_admin(workspace_id))
  WITH CHECK (created_by = auth.uid() OR public.is_workspace_admin(workspace_id));

CREATE POLICY "Stock delete private owner or admin" ON public.stock_beans
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

-- Brew Log: pemilik/workspace dapat melihat data sendiri; publik hanya melihat approved.
DROP POLICY IF EXISTS "Brew read approved own or moderator" ON public.brew_logs;
DROP POLICY IF EXISTS "Brew read public approved or workspace" ON public.brew_logs;
DROP POLICY IF EXISTS "Brew insert member" ON public.brew_logs;
DROP POLICY IF EXISTS "Brew insert member pending unless moderator" ON public.brew_logs;
DROP POLICY IF EXISTS "Brew update owner or moderator" ON public.brew_logs;
DROP POLICY IF EXISTS "Brew delete admin" ON public.brew_logs;

CREATE POLICY "Brew read public approved or workspace" ON public.brew_logs
  FOR SELECT USING (
    (visibility = 'public' AND moderation_status = 'approved')
    OR created_by = auth.uid()
    OR public.is_workspace_member(workspace_id)
    OR public.can_moderate_workspace(workspace_id)
  );

CREATE POLICY "Brew insert member pending unless moderator" ON public.brew_logs
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND public.is_workspace_member(workspace_id)
    AND visibility = 'public'
    AND (moderation_status = 'pending' OR public.can_moderate_workspace(workspace_id))
  );

CREATE POLICY "Brew update owner or moderator" ON public.brew_logs
  FOR UPDATE USING (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id))
  WITH CHECK (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id));

CREATE POLICY "Brew delete admin" ON public.brew_logs
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

-- QA: terkait workspace, publik hanya bila approved.
DROP POLICY IF EXISTS "QA read approved own or moderator" ON public.qa_scores;
DROP POLICY IF EXISTS "QA read public approved or workspace" ON public.qa_scores;
DROP POLICY IF EXISTS "QA insert member" ON public.qa_scores;
DROP POLICY IF EXISTS "QA insert member pending unless moderator" ON public.qa_scores;
DROP POLICY IF EXISTS "QA update owner or moderator" ON public.qa_scores;
DROP POLICY IF EXISTS "QA delete admin" ON public.qa_scores;

CREATE POLICY "QA read public approved or workspace" ON public.qa_scores
  FOR SELECT USING (
    (visibility = 'public' AND moderation_status = 'approved')
    OR created_by = auth.uid()
    OR public.is_workspace_member(workspace_id)
    OR public.can_moderate_workspace(workspace_id)
  );

CREATE POLICY "QA insert member pending unless moderator" ON public.qa_scores
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND public.is_workspace_member(workspace_id)
    AND visibility = 'public'
    AND (moderation_status = 'pending' OR public.can_moderate_workspace(workspace_id))
  );

CREATE POLICY "QA update owner or moderator" ON public.qa_scores
  FOR UPDATE USING (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id))
  WITH CHECK (created_by = auth.uid() OR public.can_moderate_workspace(workspace_id));

CREATE POLICY "QA delete admin" ON public.qa_scores
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

create index if not exists idx_stock_beans_workspace_private on public.stock_beans (workspace_id, created_by, created_at desc);
create index if not exists idx_brew_logs_workspace_private on public.brew_logs (workspace_id, created_by, created_at desc);
create index if not exists idx_brew_logs_public_feed_v9 on public.brew_logs (visibility, moderation_status, qa_final desc, created_at desc);
create index if not exists idx_qa_scores_workspace_private on public.qa_scores (workspace_id, created_by, created_at desc);
