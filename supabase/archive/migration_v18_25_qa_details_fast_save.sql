alter table public.qa_scores add column if not exists primary_variable_changed text;
alter table public.qa_scores add column if not exists hypothesis text;
alter table public.qa_scores add column if not exists result_notes text;

create index if not exists qa_scores_brew_workspace_details_idx
  on public.qa_scores (workspace_id, brew_code, created_at desc);
