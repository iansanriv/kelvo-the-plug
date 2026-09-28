-- Transactional checks only: all synthetic rows are rolled back, no carrier calls.
begin;
set local role service_role;
do $$
declare oid uuid; qid uuid; q2 uuid; reply jsonb; rejected boolean; i integer;
  addr jsonb := '{"name":"Database test only","address":{"line1":"123 Main St","city":"Denver","state":"CO","postal_code":"80202","country":"US"}}';
  rates jsonb := '[{"id":"test-rate","carrier":"USPS","amount":"8.50","currency":"USD"}]';
begin
  insert into public.orders(status,fulfillment_method,shipping_address) values ('paid','shipping',addr) returning id into oid;
  insert into public.shippo_labels(order_id,test,shipment_id,shipping_address,rates) values (oid,true,'test-shipment',addr,rates) returning id into qid;
  reply := public.claim_shippo_label(qid,'test-rate');
  assert reply->>'status' = 'purchasing', 'Claim failed';
  rejected := false;
  begin perform public.claim_shippo_label(qid,'test-rate'); exception when others then rejected := true; end;
  assert rejected, 'Duplicate claim allowed';
  reply := public.finish_shippo_label(qid,'test-transaction','success','https://example.com/test.pdf','TEST-TRACK',null);
  assert reply->>'status' = 'success', 'Finish failed';
  assert (select tracking_number is null from public.orders where id=oid), 'Test label updated live tracking';
  insert into public.shippo_labels(order_id,test,shipment_id,shipping_address,rates) values (oid,true,'test-shipment',addr,rates) returning id into q2;
  rejected := false;
  begin perform public.claim_shippo_label(q2,'test-rate'); exception when others then rejected := true; end;
  assert rejected, 'Second successful label allowed';
  insert into public.shippo_labels(order_id,test,shipment_id,shipping_address,rates) values (oid,false,'test-shipment',addr,rates) returning id into qid;
  reply := public.claim_shippo_label(qid,'test-rate');
  reply := public.finish_shippo_label(qid,'test-live-transaction','success','https://example.com/test.pdf','LIVE-TRACK',null);
  assert (select tracking_number = 'LIVE-TRACK' and shipped_at is null from public.orders where id=oid), 'Live tracking not saved correctly';
  -- 29 more synthetic successful rows ensure a 31st cannot be claimed.
  for i in 1..29 loop
    insert into public.orders(status,fulfillment_method,shipping_address) values ('paid','shipping',addr) returning id into oid;
    insert into public.shippo_labels(order_id,test,shipment_id,shipping_address,rates,status,purchase_started_at)
      values (oid,false,'test-shipment',addr,rates,'success',now());
  end loop;
  insert into public.orders(status,fulfillment_method,shipping_address) values ('paid','shipping',addr) returning id into oid;
  insert into public.shippo_labels(order_id,test,shipment_id,shipping_address,rates) values (oid,false,'test-shipment',addr,rates) returning id into qid;
  rejected := false;
  begin perform public.claim_shippo_label(qid,'test-rate'); exception when others then rejected := sqlerrm like '30-label%'; end;
  assert rejected, 'Monthly cap did not block the 31st label';
  -- Test mode does not consume the live allowance, but still checks paid status/address.
  insert into public.shippo_labels(order_id,test,shipment_id,shipping_address,rates) values (oid,true,'test-shipment',addr,rates) returning id into q2;
  update public.orders set status='pending' where id=oid;
  rejected := false;
  begin perform public.claim_shippo_label(q2,'test-rate'); exception when others then rejected := sqlerrm like 'Only paid%'; end;
  assert rejected, 'Unpaid order was accepted';
  update public.orders set status='paid',shipping_address='{}'::jsonb where id=oid;
  rejected := false;
  begin perform public.claim_shippo_label(q2,'test-rate'); exception when others then rejected := sqlerrm like 'Delivery address changed%'; end;
  assert rejected, 'Changed destination was accepted';
end $$;
rollback;
select 'Shipping database checks passed; synthetic data rolled back.' as result;
