create or replace function public.delete_brew_log_and_restore_stock(p_brew_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brew public.brew_logs%rowtype;
  v_stock public.stock_beans%rowtype;
  v_stock_id uuid;
  v_usage numeric := 0;
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

  v_usage := greatest(coalesce(v_brew.stock_usage_g, 0), 0);
  v_stock_id := v_brew.stock_bean_id;

  if v_usage > 0 and v_stock_id is null and nullif(v_brew.stock_bean_code, '') is not null then
    select id into v_stock_id
    from public.stock_beans
    where workspace_id = v_brew.workspace_id
      and bean_code = v_brew.stock_bean_code
    order by updated_at desc nulls last, created_at desc
    limit 1;
  end if;

  if v_usage > 0 and v_stock_id is null then
    select id into v_stock_id
    from public.stock_beans
    where workspace_id = v_brew.workspace_id
      and lower(coalesce(coffee_name, '')) = lower(coalesce(v_brew.bean_name, ''))
      and lower(coalesce(origin, '')) = lower(coalesce(v_brew.origin, ''))
      and lower(coalesce(variety, '')) = lower(coalesce(v_brew.variety, ''))
      and lower(coalesce(process, '')) = lower(coalesce(v_brew.process, ''))
      and lower(coalesce(roast_profile, '')) = lower(coalesce(v_brew.roast_profile, ''))
    order by updated_at desc nulls last, created_at desc
    limit 1;
  end if;

  if v_usage > 0 and v_stock_id is not null then
    update public.stock_beans
    set stock_g = coalesce(stock_g, 0) + v_usage,
        updated_at = now()
    where id = v_stock_id
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
    'stock_id', v_stock_id,
    'stock_usage_g', v_usage,
    'stock_restored', v_restored,
    'stock_g', case when v_restored then v_stock.stock_g else null end
  );
end;
$$;

revoke all on function public.delete_brew_log_and_restore_stock(uuid) from public;
grant execute on function public.delete_brew_log_and_restore_stock(uuid) to authenticated;
