DROP POLICY IF EXISTS "Brew insert member pending unless moderator" ON public.brew_logs;
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

DROP POLICY IF EXISTS "QA insert member pending unless moderator" ON public.qa_scores;
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

update public.brew_logs
set moderation_status = 'approved',
    approved_for_recipe = 'Yes',
    status = 'approved'
where visibility = 'public'
  and coalesce(qa_final, 0) >= 6.5
  and lower(coalesce(approved_for_recipe, '')) = 'yes'
  and moderation_status = 'pending';

create index if not exists idx_brew_logs_public_feed_v15 on public.brew_logs (visibility, moderation_status, qa_final desc, created_at desc);
