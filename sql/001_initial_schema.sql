-- =============================================================================
-- 001_initial_schema.sql
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================


-- =============================================================================
-- SECTION 1: Custom ENUM types
-- =============================================================================

create type user_role as enum ('admin', 'operator', 'viewer');

create type tender_status as enum (
  'new', 'reviewed', 'interested', 'applied', 'won', 'lost', 'withdrawn', 'expired'
);

create type supplier_type as enum ('intermediary', 'manufacturer', 'distributor');

create type request_status as enum ('pending', 'replied', 'quoted', 'rejected', 'no_response');

create type bid_result as enum ('pending', 'won', 'lost', 'withdrawn');

create type feature_priority as enum ('low', 'medium', 'high', 'critical');

create type feature_status as enum ('idea', 'planned', 'in_progress', 'done');


-- =============================================================================
-- SECTION 2: Tables (in dependency order)
-- =============================================================================

-- profiles -------------------------------------------------------------------
-- One row per auth.users entry; auto-created by trigger below.
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  role        user_role not null default 'operator',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- tender_categories ----------------------------------------------------------
create table tender_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_by  uuid references profiles on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- tenders --------------------------------------------------------------------
create table tenders (
  id                    uuid primary key default gen_random_uuid(),
  external_id           text not null unique,
  title                 text not null,
  description           text,
  contracting_authority text not null,
  estimated_value       numeric,
  currency              text not null default 'RON',
  cpv_code              text,
  deadline              timestamptz not null,
  publication_date      timestamptz not null,
  source_url            text,
  status                tender_status not null default 'new',
  category_id           uuid references tender_categories on delete set null,
  notes                 text,
  raw_data              jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- suppliers ------------------------------------------------------------------
create table suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact_person text,
  email          text,
  phone          text,
  country        text not null default 'China',
  type           supplier_type not null,
  categories     uuid[],
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- supplier_requests ----------------------------------------------------------
create table supplier_requests (
  id               uuid primary key default gen_random_uuid(),
  tender_id        uuid not null references tenders on delete cascade,
  supplier_id      uuid not null references suppliers on delete cascade,
  sent_at          timestamptz not null,
  sent_by          uuid references profiles on delete set null,
  message_content  text not null,
  response_status  request_status not null default 'pending',
  response_notes   text,
  quoted_price     numeric,
  quoted_currency  text,
  responded_at     timestamptz
);

-- bids -----------------------------------------------------------------------
create table bids (
  id            uuid primary key default gen_random_uuid(),
  tender_id     uuid not null references tenders on delete cascade,
  company_name  text not null,
  bid_price     numeric not null,
  bid_currency  text not null default 'RON',
  submitted_at  timestamptz,
  result        bid_result,
  result_price  numeric,
  notes         text,
  created_by    uuid references profiles on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- feature_requests -----------------------------------------------------------
create table feature_requests (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  priority     feature_priority not null default 'medium',
  status       feature_status not null default 'idea',
  requested_by uuid references profiles on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- =============================================================================
-- SECTION 3: Indexes
-- =============================================================================

create index on tenders (external_id);
create index on tenders (status);
create index on tenders (deadline);
create index on tenders (category_id);
create index on supplier_requests (tender_id);
create index on bids (tender_id);


-- =============================================================================
-- SECTION 4: Trigger — auto-create profile on signup
-- =============================================================================
-- When a new row is inserted into auth.users (i.e. a new Supabase Auth signup),
-- automatically create a matching profiles row with role = 'operator'.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    'operator'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- =============================================================================
-- SECTION 5: Row Level Security (RLS)
-- =============================================================================

-- Enable RLS on all tables
alter table profiles          enable row level security;
alter table tender_categories enable row level security;
alter table tenders           enable row level security;
alter table suppliers         enable row level security;
alter table supplier_requests enable row level security;
alter table bids              enable row level security;
alter table feature_requests  enable row level security;

-- Helper: resolve the calling user's role from profiles without recursion.
-- Used inside policy expressions.
create or replace function auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;


-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
-- Admins: full CRUD
create policy "admin: full access on profiles"
  on profiles for all
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- Any authenticated user can read their own profile
create policy "self: read own profile"
  on profiles for select
  using (id = auth.uid());


-- ----------------------------------------------------------------------------
-- tender_categories
-- ----------------------------------------------------------------------------
-- Admins: full CRUD
create policy "admin: full access on tender_categories"
  on tender_categories for all
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- Operators & viewers: read-only
create policy "operator/viewer: select tender_categories"
  on tender_categories for select
  using (auth_role() in ('operator', 'viewer'));


-- ----------------------------------------------------------------------------
-- tenders
-- ----------------------------------------------------------------------------
-- Admins: full CRUD
create policy "admin: full access on tenders"
  on tenders for all
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- Operators: read all
create policy "operator: select tenders"
  on tenders for select
  using (auth_role() = 'operator');

-- Operators: update status and notes only
create policy "operator: update tenders status/notes"
  on tenders for update
  using (auth_role() = 'operator')
  with check (auth_role() = 'operator');

-- Viewers: read-only
create policy "viewer: select tenders"
  on tenders for select
  using (auth_role() = 'viewer');


-- ----------------------------------------------------------------------------
-- suppliers
-- ----------------------------------------------------------------------------
-- Admins: full CRUD
create policy "admin: full access on suppliers"
  on suppliers for all
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- Operators: read all
create policy "operator: select suppliers"
  on suppliers for select
  using (auth_role() = 'operator');


-- ----------------------------------------------------------------------------
-- supplier_requests
-- ----------------------------------------------------------------------------
-- Admins: full CRUD
create policy "admin: full access on supplier_requests"
  on supplier_requests for all
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- Operators: read all + insert + update
create policy "operator: select supplier_requests"
  on supplier_requests for select
  using (auth_role() = 'operator');

create policy "operator: insert supplier_requests"
  on supplier_requests for insert
  with check (auth_role() = 'operator');

create policy "operator: update supplier_requests"
  on supplier_requests for update
  using (auth_role() = 'operator')
  with check (auth_role() = 'operator');


-- ----------------------------------------------------------------------------
-- bids
-- ----------------------------------------------------------------------------
-- Admins: full CRUD
create policy "admin: full access on bids"
  on bids for all
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- Operators: read all + insert + update
create policy "operator: select bids"
  on bids for select
  using (auth_role() = 'operator');

create policy "operator: insert bids"
  on bids for insert
  with check (auth_role() = 'operator');

create policy "operator: update bids"
  on bids for update
  using (auth_role() = 'operator')
  with check (auth_role() = 'operator');

-- Viewers: read-only
create policy "viewer: select bids"
  on bids for select
  using (auth_role() = 'viewer');


-- ----------------------------------------------------------------------------
-- feature_requests
-- ----------------------------------------------------------------------------
-- Admins: full CRUD
create policy "admin: full access on feature_requests"
  on feature_requests for all
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- Operators: read all + insert + update own
create policy "operator: select feature_requests"
  on feature_requests for select
  using (auth_role() = 'operator');

create policy "operator: insert feature_requests"
  on feature_requests for insert
  with check (auth_role() = 'operator');

create policy "operator: update own feature_requests"
  on feature_requests for update
  using (auth_role() = 'operator' and requested_by = auth.uid())
  with check (auth_role() = 'operator');

-- Operators: delete own
create policy "operator: delete own feature_requests"
  on feature_requests for delete
  using (auth_role() = 'operator' and requested_by = auth.uid());

-- Viewers: read all + insert + update own
create policy "viewer: select feature_requests"
  on feature_requests for select
  using (auth_role() = 'viewer');

create policy "viewer: insert feature_requests"
  on feature_requests for insert
  with check (auth_role() = 'viewer');

create policy "viewer: update own feature_requests"
  on feature_requests for update
  using (auth_role() = 'viewer' and requested_by = auth.uid())
  with check (auth_role() = 'viewer');

-- Viewers: delete own
create policy "viewer: delete own feature_requests"
  on feature_requests for delete
  using (auth_role() = 'viewer' and requested_by = auth.uid());
