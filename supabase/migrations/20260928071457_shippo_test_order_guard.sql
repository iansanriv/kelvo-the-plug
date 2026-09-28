create or replace function public.claim_shippo_label(p_id uuid, p_rate_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare q public.shippo_labels; o public.orders; chosen jsonb; used integer;
begin
  perform pg_advisory_xact_lock(726491830);
  select * into q from public.shippo_labels where id = p_id for update;
  if not found or q.status <> 'quoted' then raise exception 'This quote was already used. Refresh the order to check its label.'; end if;
  if q.created_at < now() - interval '15 minutes' then raise exception 'Quote expired. Get new rates.'; end if;
  select * into o from public.orders where id = q.order_id for update;
  if o.shipping_address->>'test_only' = 'true' and not q.test then raise exception 'Test-only orders cannot buy real postage.'; end if;
  if (o.status <> 'paid' and not (q.test and coalesce(o.shipping_address->>'test_only','false') = 'true')) or o.fulfillment_method <> 'shipping' then raise exception 'Only paid delivery orders can receive a label.'; end if;
  if o.shipped_at is not null or coalesce(o.tracking_number,'') <> '' then raise exception 'This order already has tracking or is shipped.'; end if;
  if o.shipping_address is distinct from q.shipping_address then raise exception 'Delivery address changed. Get new rates.'; end if;
  if exists(select 1 from public.shippo_labels where order_id = q.order_id and test = q.test and status in ('purchasing','pending','success','unknown')) then
    raise exception 'This order already has a label or an unresolved purchase. Refresh its label status.';
  end if;
  if not q.test then
    select count(*) into used from public.shippo_labels where not test and (
      (status = 'success' and purchase_started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
      or status in ('purchasing','pending','unknown')
    );
    if used >= 30 then raise exception '30-label store cap reached. Use Pirate Ship or wait for the next month.'; end if;
  end if;
  select value into chosen from jsonb_array_elements(q.rates) where value->>'id' = p_rate_id limit 1;
  if chosen is null then raise exception 'Choose a rate from this quote.'; end if;
  update public.shippo_labels set status = 'purchasing', rate = chosen, purchase_started_at = now()
    where id = q.id returning * into q;
  return to_jsonb(q);
end $$;
revoke all on function public.claim_shippo_label(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_shippo_label(uuid,text) to service_role;

