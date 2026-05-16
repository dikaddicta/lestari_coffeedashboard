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
