-- ============================================================================
-- Edara — Accounts + Server-Authoritative Device Management
-- ----------------------------------------------------------------------------
-- Apply this file in the Supabase SQL Editor (or via the Supabase CLI) for the
-- project referenced by VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
--
-- What this creates:
--   1. public.edara_accounts       — one row per ORGANIZATION (school / ministry branch)
--   2. public.edara_devices        — one row per registered installation/device
--   3. Row Level Security          — an account may only see/edit ITS OWN data
--   4. Trigger                     — protects server-controlled columns from clients
--   5. RPCs (SECURITY DEFINER)     — the ONLY way to register / revoke devices and
--                                    (optionally) provision accounts, so the device
--                                    limit is enforced on the server and cannot be
--                                    bypassed by the desktop client.
--
-- The client NEVER sets maximum_devices / account_type / is_active / ownership.
-- Those are changed only by the service_role (future admin panel) — see the
-- protect_edara_account_columns() trigger below. The anon/publishable key is the
-- only key shipped to the desktop client; the service_role key stays server-side.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.edara_accounts (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null unique references auth.users(id) on delete cascade,
  account_type    text not null default 'school'
                    check (account_type in ('school', 'ministry_branch')),
  organization_name text not null default 'مؤسسة جديدة',
  email           text,
  maximum_devices integer not null default 2
                    check (maximum_devices > 0 and maximum_devices <= 1000),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists edara_accounts_auth_user_id_idx on public.edara_accounts (auth_user_id);

create table if not exists public.edara_devices (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.edara_accounts(id) on delete cascade,
  device_id     text not null,
  device_name   text not null default 'جهاز',
  platform      text,
  app_version   text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  is_active     boolean not null default true,
  revoked_at    timestamptz,
  unique (account_id, device_id)   -- one record per installation; no duplicate active devices
);

create index if not exists edara_devices_account_id_idx on public.edara_devices (account_id);
create index if not exists edara_devices_device_id_idx  on public.edara_devices (device_id);

-- ----------------------------------------------------------------------------
-- 2. updated_at maintenance
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists edara_accounts_set_updated_at on public.edara_accounts;
create trigger edara_accounts_set_updated_at
  before update on public.edara_accounts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Protect server-controlled columns from the client.
--    The anon/authenticated key runs with JWT role 'authenticated'. Only the
--    service_role (future admin panel) or direct SQL access (no JWT) may change
--    protected columns.
-- ----------------------------------------------------------------------------

create or replace function public.protect_edara_account_columns() returns trigger as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  -- Clients (JWT role 'authenticated') are blocked from changing protected
  -- columns. The service_role (future admin panel) and direct SQL access
  -- (no JWT) are allowed.
  if auth.jwt() is not null and v_role <> 'service_role' then
    if new.maximum_devices is distinct from old.maximum_devices then
      raise exception 'FORBIDDEN: maximum_devices is server-controlled';
    end if;
    if new.account_type is distinct from old.account_type then
      raise exception 'FORBIDDEN: account_type is server-controlled';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'FORBIDDEN: is_active is server-controlled';
    end if;
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'FORBIDDEN: auth_user_id is server-controlled';
    end if;
    if new.id is distinct from old.id then
      raise exception 'FORBIDDEN: id is immutable';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists edara_accounts_protect_cols on public.edara_accounts;
create trigger edara_accounts_protect_cols
  before update on public.edara_accounts
  for each row execute function public.protect_edara_account_columns();

-- ----------------------------------------------------------------------------
-- 4. Row Level Security
--    - edara_accounts: owner reads/updates only their own row.
--                No INSERT/DELETE policy => clients cannot create/delete accounts;
--                only the SECURITY DEFINER functions (service_role) may.
--    - edara_devices: owner reads only their own devices. Inserts/updates/deletes
--                happen exclusively through the SECURITY DEFINER RPCs below, which
--                is what guarantees the device limit cannot be bypassed client-side.
-- ----------------------------------------------------------------------------

alter table public.edara_accounts enable row level security;
alter table public.edara_devices enable row level security;

drop policy if exists edara_accounts_select_own on public.edara_accounts;
create policy edara_accounts_select_own on public.edara_accounts
  for select using (auth_user_id = auth.uid());

drop policy if exists edara_accounts_update_own on public.edara_accounts;
create policy edara_accounts_update_own on public.edara_accounts
  for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

drop policy if exists edara_devices_select_own on public.edara_devices;
create policy edara_devices_select_own on public.edara_devices
  for select using (
    account_id in (select id from public.edara_accounts where auth_user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 5. RPCs
-- ----------------------------------------------------------------------------

-- ensure_account: provision an account for the signed-in user if one does not
-- exist. Kept for the future admin panel / service_role provisioning. The desktop
-- client's login flow does NOT call this automatically — accounts are created by
-- the administrator (see the provisioning snippet at the bottom of this file).
create or replace function public.ensure_account(
  p_organization_name text default null,
  p_account_type text default 'school',
  p_email text default null
) returns public.edara_accounts as $$
declare
  v_uid uuid := auth.uid();
  v_account public.edara_accounts;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into v_account from public.edara_accounts where auth_user_id = v_uid;
  if not found then
    insert into public.edara_accounts (auth_user_id, organization_name, account_type, email)
    values (
      v_uid,
      coalesce(p_organization_name, 'مؤسسة جديدة'),
      case when p_account_type in ('school', 'ministry_branch') then p_account_type else 'school' end,
      p_email
    )
    returning * into v_account;
  end if;

  return v_account;
end;
$$ language plpgsql security definer;

-- register_device: the authoritative device registration + limit check.
-- Fully atomic: the account row is locked (FOR UPDATE) so two simultaneous
-- registrations for the same account cannot both slip under the limit.
-- Returns a jsonb status the client maps to Arabic messages.
create or replace function public.register_device(
  p_device_id    text,
  p_device_name  text default 'جهاز',
  p_platform     text default null,
  p_app_version  text default null
) returns jsonb as $$
declare
  v_uid    uuid := auth.uid();
  v_account public.edara_accounts;
  v_device  public.edara_devices;
  v_active  integer;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  select * into v_account from public.edara_accounts where auth_user_id = v_uid;
  if not found then
    return jsonb_build_object('status', 'no_account');
  end if;

  if not v_account.is_active then
    return jsonb_build_object('status', 'disabled', 'account_id', v_account.id);
  end if;

  -- Serialize concurrent registrations for this account.
  select * into v_account from public.edara_accounts where id = v_account.id for update;

  select * into v_device
  from public.edara_devices
  where account_id = v_account.id and device_id = p_device_id;

  if found then
    if v_device.is_active then
      update public.edara_devices set last_seen_at = now() where id = v_device.id;
      return jsonb_build_object(
        'status', 'ok',
        'account_id', v_account.id,
        'account_type', v_account.account_type,
        'device_id', p_device_id,
        'active', (select count(*) from public.edara_devices where account_id = v_account.id and is_active = true),
        'maximum', v_account.maximum_devices
      );
    else
      return jsonb_build_object('status', 'revoked', 'account_id', v_account.id);
    end if;
  end if;

  select count(*) into v_active
  from public.edara_devices
  where account_id = v_account.id and is_active = true;

  if v_active >= v_account.maximum_devices then
    return jsonb_build_object('status', 'limit', 'maximum', v_account.maximum_devices, 'active', v_active);
  end if;

  insert into public.edara_devices (account_id, device_id, device_name, platform, app_version, first_seen_at, last_seen_at, is_active)
  values (v_account.id, p_device_id, p_device_name, p_platform, p_app_version, now(), now(), true)
  returning * into v_device;

  return jsonb_build_object(
    'status', 'registered',
    'account_id', v_account.id,
    'account_type', v_account.account_type,
    'device_id', p_device_id,
    'active', v_active + 1,
    'maximum', v_account.maximum_devices
  );
end;
$$ language plpgsql security definer;

-- touch_device: lightweight heartbeat to refresh last_seen_at. Owner-scoped.
create or replace function public.touch_device(p_device_id text) returns jsonb as $$
declare
  v_uid uuid := auth.uid();
  v_rows integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  update public.edara_devices d
  set last_seen_at = now()
  from public.edara_accounts a
  where d.account_id = a.id
    and a.auth_user_id = v_uid
    and d.device_id = p_device_id;

  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return jsonb_build_object('status', 'ok');
  end if;
  return jsonb_build_object('status', 'not_found');
end;
$$ language plpgsql security definer;

-- revoke_device: mark a device inactive and free its slot (keeps the audit row).
-- Owner-scoped today; the future admin panel will call this with the service_role
-- to revoke any device in the organization.
create or replace function public.revoke_device(p_device_id text) returns jsonb as $$
declare
  v_uid uuid := auth.uid();
  v_rows integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  update public.edara_devices d
  set is_active = false, revoked_at = now()
  from public.edara_accounts a
  where d.account_id = a.id
    and a.auth_user_id = v_uid
    and d.device_id = p_device_id
    and d.is_active = true;

  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return jsonb_build_object('status', 'revoked');
  end if;
  return jsonb_build_object('status', 'not_found');
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- 6. Provisioning the FIRST account (run in the Supabase SQL Editor).
--    The desktop client never auto-creates accounts. To create the test account:
--      (a) Create the Auth user in Supabase Dashboard → Authentication → Users
--          (email: test@edara.local, set a password).
--      (b) Run the statement below. It finds that Auth user by email and links an
--          Edara account to it. Re-running is safe (ON CONFLICT DO NOTHING).
--
--    To provision other organizations, change the email / organization_name /
--    account_type / maximum_devices values — or use the future admin panel.
-- ----------------------------------------------------------------------------
--
-- insert into public.edara_accounts (auth_user_id, organization_name, account_type, email, maximum_devices, is_active)
-- select u.id, 'مدرسة تجريبية', 'school', 'test@edara.local', 2, true
-- from auth.users u
-- where u.email = 'test@edara.local'
-- on conflict (auth_user_id) do nothing;
