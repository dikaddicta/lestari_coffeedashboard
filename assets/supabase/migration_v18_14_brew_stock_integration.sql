alter table public.brew_logs add column if not exists stock_bean_id uuid references public.stock_beans(id) on delete set null;
alter table public.brew_logs add column if not exists stock_bean_code text;
alter table public.brew_logs add column if not exists stock_usage_g numeric;

create or replace function public.consume_stock_for_brew(p_stock_id uuid, p_amount numeric)
returns public.stock_beans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stock_beans%rowtype;
  v_amount numeric := greatest(coalesce(p_amount, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Login required to consume stock.';
  end if;

  select * into v_row
  from public.stock_beans
  where id = p_stock_id
  for update;

  if not found then
    raise exception 'Stock bean not found.';
  end if;

  if not public.is_workspace_member(v_row.workspace_id) then
    raise exception 'You are not allowed to update stock in this workspace.';
  end if;

  update public.stock_beans
  set stock_g = greatest(coalesce(stock_g, 0) - v_amount, 0),
      updated_at = now()
  where id = p_stock_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.consume_stock_for_brew(uuid, numeric) from public;
grant execute on function public.consume_stock_for_brew(uuid, numeric) to authenticated;
