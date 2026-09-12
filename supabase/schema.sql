-- Kelvo The Plug V4 database. Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  description text not null default '',
  condition text not null default 'New / Deadstock',
  badge text not null default '',
  image_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null,
  price_cents integer not null check (price_cents > 0),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique,
  status text not null default 'pending' check (status in ('pending','paid','expired','failed')),
  amount_total integer not null default 0,
  email text,
  phone text,
  shipping_address jsonb,
  fulfillment_method text not null default 'shipping' check (fulfillment_method in ('shipping','pickup')),
  reserved boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid,
  variant_id uuid,
  product_name text not null,
  size text not null,
  unit_price_cents integer not null,
  quantity integer not null check (quantity > 0)
);

create index if not exists idx_variants_product on public.product_variants(product_id);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_items_order on public.order_items(order_id);

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

insert into storage.buckets (id,name,public)
values ('product-images','product-images',true)
on conflict (id) do update set public=true;

create or replace function public.reserve_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare item record; current_stock integer;
begin
  if exists(select 1 from public.orders where id=p_order_id and reserved=true) then return; end if;
  for item in select * from public.order_items where order_id=p_order_id order by variant_id loop
    select stock into current_stock from public.product_variants where id=item.variant_id and active=true for update;
    if current_stock is null or current_stock < item.quantity then raise exception 'insufficient_stock'; end if;
    update public.product_variants set stock=stock-item.quantity where id=item.variant_id;
  end loop;
  update public.orders set reserved=true where id=p_order_id and status='pending';
end; $$;

create or replace function public.release_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare item record;
begin
  if not exists(select 1 from public.orders where id=p_order_id and status='pending' and reserved=true for update) then return; end if;
  for item in select * from public.order_items where order_id=p_order_id loop
    update public.product_variants set stock=stock+item.quantity where id=item.variant_id;
  end loop;
  update public.orders set status='expired',reserved=false where id=p_order_id;
end; $$;

create or replace function public.fulfill_order(
  p_order_id uuid,
  p_stripe_session_id text,
  p_amount_total integer,
  p_email text,
  p_phone text,
  p_shipping_address jsonb
)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.orders where id=p_order_id and status='paid') then return; end if;
  update public.orders set status='paid',stripe_session_id=p_stripe_session_id,amount_total=p_amount_total,email=p_email,phone=p_phone,shipping_address=p_shipping_address,reserved=false,paid_at=now() where id=p_order_id and status='pending';
  if not found then raise exception 'order_not_pending'; end if;
end; $$;

grant execute on function public.reserve_order(uuid) to service_role;
grant execute on function public.release_order(uuid) to service_role;
grant execute on function public.fulfill_order(uuid,text,integer,text,text,jsonb) to service_role;

-- Demo inventory; remove it from /admin after testing.
insert into public.products (id,name,brand,description,condition,badge,image_url,active) values
('11111111-1111-4111-8111-111111111111','Jordan 4 Military Blue','Jordan','Demo product — replace this pair and photo before launch.','New / Deadstock','NEW DROP','https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80',true),
('22222222-2222-4222-8222-222222222222','Nike Dunk Low Panda','Nike','Demo product — replace this pair and photo before launch.','New / Deadstock','AVAILABLE','https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=1200&q=80',true)
on conflict (id) do nothing;

insert into public.product_variants (id,product_id,size,price_cents,stock,active) values
('11111111-aaaa-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','9',24000,1,true),
('11111111-bbbb-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','10',24000,2,true),
('11111111-cccc-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','11',24000,1,true),
('22222222-aaaa-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','8',15000,1,true),
('22222222-bbbb-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','9.5',15000,2,true),
('22222222-cccc-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','10',15000,1,true)
on conflict (id) do nothing;
