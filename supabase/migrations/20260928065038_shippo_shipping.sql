-- Private shipping quotes and purchase journal. Only the server can access these.
create table public.shippo_labels (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  test boolean not null,
  status text not null default 'quoted' check (status in ('quoted','purchasing','pending','success','error','unknown')),
  shipment_id text not null,
  shipping_address jsonb not null,
  rates jsonb not null,
  rate jsonb,
  transaction_id text,
  label_url text,
  tracking_number text,
  message text,
  created_at timestamptz not null default now(),
  purchase_started_at timestamptz
);
create index shippo_labels_order_idx on public.shippo_labels(order_id);
create unique index shippo_one_label_per_order on public.shippo_labels(order_id,test)
  where status in ('purchasing','pending','success','unknown');
create index shippo_labels_usage_idx on public.shippo_labels(purchase_started_at) where not test;
alter table public.shippo_labels enable row level security;
revoke all on public.shippo_labels from public, anon, authenticated;
grant select, insert, update on public.shippo_labels to service_role;

-- Serialize claims across all workers; a double-click can never issue two purchases.
create function public.claim_shippo_label(p_id uuid, p_rate_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare q public.shippo_labels; o public.orders; chosen jsonb; used integer;
begin
  perform pg_advisory_xact_lock(726491830);
  select * into q from public.shippo_labels where id = p_id for update;
  if not found or q.status <> 'quoted' then raise exception 'This quote was already used. Refresh the order to check its label.'; end if;
  if q.created_at < now() - interval '15 minutes' then raise exception 'Quote expired. Get new rates.'; end if;
  select * into o from public.orders where id = q.order_id for update;
  if o.status <> 'paid' or o.fulfillment_method <> 'shipping' then raise exception 'Only paid delivery orders can receive a label.'; end if;
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

-- Persist the label and its tracking in one transaction. Test labels never ship orders.
create function public.finish_shippo_label(p_id uuid, p_transaction_id text, p_status text, p_label_url text, p_tracking_number text, p_message text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare q public.shippo_labels;
begin
  select * into q from public.shippo_labels where id = p_id for update;
  if not found or q.status not in ('purchasing','pending','unknown','success') then raise exception 'No purchase to update.'; end if;
  if q.transaction_id is not null and q.transaction_id <> p_transaction_id then raise exception 'Transaction does not match this purchase.'; end if;
  if q.status = 'success' then return to_jsonb(q); end if;
  if p_status not in ('success','error','pending') then raise exception 'Invalid label status.'; end if;
  update public.shippo_labels set status = p_status, transaction_id = p_transaction_id,
    label_url = p_label_url, tracking_number = p_tracking_number, message = p_message
    where id = p_id returning * into q;
  if p_status = 'success' and not q.test then
    update public.orders set tracking_number = p_tracking_number, shipping_carrier = q.rate->>'carrier' where id = q.order_id;
  end if;
  return to_jsonb(q);
end $$;
revoke all on function public.finish_shippo_label(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.finish_shippo_label(uuid,text,text,text,text,text) to service_role;
