-- v27: accurate dashboard user/contributor count for public metric cards
-- Run this once in Supabase SQL Editor for existing projects.

create or replace function public.get_dashboard_user_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with account_ids as (
    select id::text as key from public.profiles where id is not null
    union
    select user_id::text as key from public.workspace_members where user_id is not null
    union
    select created_by::text as key from public.stock_beans where created_by is not null
    union
    select created_by::text as key from public.brew_logs where created_by is not null
    union
    select created_by::text as key from public.qa_scores where created_by is not null
  ),
  guest_keys as (
    select lower(trim(coalesce(nullif(brewer_name, ''), nullif(source_client_id, '')))) as key
    from public.brew_logs
    where created_by is null
      and coalesce(nullif(brewer_name, ''), nullif(source_client_id, '')) is not null
    union
    select lower(trim(coalesce(nullif(evaluator, ''), nullif(source_client_id, '')))) as key
    from public.qa_scores
    where created_by is null
      and coalesce(nullif(evaluator, ''), nullif(source_client_id, '')) is not null
  )
  select
    coalesce((select count(distinct key)::integer from account_ids where key is not null and key <> ''), 0)
    + coalesce((select count(distinct key)::integer from guest_keys where key is not null and key <> ''), 0);
$$;

grant execute on function public.get_dashboard_user_count() to anon, authenticated;
