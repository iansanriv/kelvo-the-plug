-- Checkout handlers call these only with the server's service-role credential.
revoke execute on function public.fulfill_order(uuid,text,integer,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.fulfill_paypal_order(uuid,text,text,integer,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.release_order(uuid) from public, anon, authenticated;
revoke execute on function public.reserve_order(uuid) from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.fulfill_order(uuid,text,integer,text,text,jsonb) to service_role;
grant execute on function public.fulfill_paypal_order(uuid,text,text,integer,text,text,jsonb) to service_role;
grant execute on function public.release_order(uuid) to service_role;
grant execute on function public.reserve_order(uuid) to service_role;
