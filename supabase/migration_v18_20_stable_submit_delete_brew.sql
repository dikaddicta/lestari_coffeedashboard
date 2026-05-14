create or replace function public.delete_brew_log_and_restore_stock(p_brew_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brew public.brew_logs%rowtype;
  v_stock public.stock_beans%rowtype;
  v_restored boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Login required to delete brew log.';
  end if;

  select * into v_brew
  from public.brew_logs
  where id = p_brew_id
  for update;

  if not found then
    raise exception 'Brew log not found.';
  end if;

  if not public.is_workspace_admin(v_brew.workspace_id) then
    raise exception 'Only workspace admin can delete brew log.';
  end if;

  if v_brew.stock_bean_id is not null and coalesce(v_brew.stock_usage_g, 0) > 0 then
    update public.stock_beans
    set stock_g = coalesce(stock_g, 0) + coalesce(v_brew.stock_usage_g, 0),
        updated_at = now()
    where id = v_brew.stock_bean_id
      and workspace_id = v_brew.workspace_id
    returning * into v_stock;

    v_restored := found;
  end if;

  delete from public.qa_scores
  where workspace_id = v_brew.workspace_id
    and brew_code = v_brew.brew_code;

  delete from public.brew_logs
  where id = v_brew.id;

  return jsonb_build_object(
    'brew_id', v_brew.id,
    'brew_code', v_brew.brew_code,
    'stock_id', v_brew.stock_bean_id,
    'stock_usage_g', v_brew.stock_usage_g,
    'stock_restored', v_restored,
    'stock_g', case when v_restored then v_stock.stock_g else null end
  );
end;
$$;

revoke all on function public.delete_brew_log_and_restore_stock(uuid) from public;
grant execute on function public.delete_brew_log_and_restore_stock(uuid) to authenticated;
