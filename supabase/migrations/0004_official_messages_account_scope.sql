-- ============================================================================
-- 0004: Account-scoped private Inbox for Edara Desktop (public.official_messages)
-- ----------------------------------------------------------------------------
-- APPLY IN THE SUPABASE SQL EDITOR ONLY. This migration is idempotent and SAFE
-- FOR EXISTING DATA: it never drops columns or rows.
--
-- The two account columns are added NULLABLE, so pre-existing messages are
-- preserved and simply become invisible to all accounts via RLS until a
-- recipient_account_id is assigned (see "EXISTING MESSAGES" note below).
--
-- Edara Desktop ships ONLY the publishable anon key. This migration creates
-- SELECT-only RLS policies and NO insert/update/delete policies, so the client
-- is strictly RECEIVE-ONLY: no Outbox, no send permission, no message mutation.
-- (Edara News inserts via the server-side service_role, which bypasses RLS.)
-- ============================================================================

-- 1) Helper: resolve the caller's Edara Desktop account id from the auth user.
--    auth.uid() -> edara_accounts.auth_user_id -> edara_accounts.id
create or replace function public.get_my_edara_account_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from public.edara_accounts where auth_user_id = auth.uid();
$$;

-- 2) Ensure official_messages exists (fallback for fresh installs).
create table if not exists public.official_messages (
  id                       uuid primary key default gen_random_uuid(),
  sender_account_id        uuid,
  recipient_account_id     uuid,
  sender_organization_type text,
  sender_organization_id   text,
  sender_org_name          text,
  recipient_organization_id text,
  recipient_org_name       text,
  subject                  text not null default '',
  body                     text not null default '',
  status                   text,
  is_read                  boolean not null default false,
  read_at                  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Add the account columns to an EXISTING official_messages table. This preserves
-- every other existing column and every existing row (no data loss).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'official_messages' and column_name = 'recipient_account_id'
  ) then
    alter table public.official_messages add column recipient_account_id uuid;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'official_messages' and column_name = 'sender_account_id'
  ) then
    alter table public.official_messages add column sender_account_id uuid;
  end if;
end $$;

-- 3) Foreign keys. Added NOT VALID so existing unmapped rows (NULL) are NOT
--    rejected. (If official_messages already has a recipient column of a
--    different type, reconcile it separately — this migration does not alter
--    or drop existing typed columns.)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_official_messages_recipient') then
    alter table public.official_messages
      add constraint fk_official_messages_recipient
      foreign key (recipient_account_id) references public.edara_accounts(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_official_messages_sender') then
    alter table public.official_messages
      add constraint fk_official_messages_sender
      foreign key (sender_account_id) references public.edara_accounts(id) on delete set null not valid;
  end if;
end $$;

-- 4) Indexes required by the task.
create index if not exists official_messages_recipient_idx on public.official_messages(recipient_account_id);
create index if not exists official_messages_sender_idx    on public.official_messages(sender_account_id);
create index if not exists official_messages_status_idx    on public.official_messages(status);
create index if not exists official_messages_created_idx   on public.official_messages(created_at);

-- 5) Attachments, protected by the SAME account boundary.
create table if not exists public.official_message_attachments (
  id                    uuid primary key default gen_random_uuid(),
  message_id            uuid not null references public.official_messages(id) on delete cascade,
  recipient_account_id  uuid,
  filename              text,
  mime_type             text,
  size                  bigint,
  storage_path          text,
  created_at            timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'official_message_attachments' and column_name = 'recipient_account_id'
  ) then
    alter table public.official_message_attachments add column recipient_account_id uuid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_official_attachments_recipient') then
    alter table public.official_message_attachments
      add constraint fk_official_attachments_recipient
      foreign key (recipient_account_id) references public.edara_accounts(id) on delete cascade not valid;
  end if;
end $$;

create index if not exists official_attachments_recipient_idx on public.official_message_attachments(recipient_account_id);
create index if not exists official_attachments_message_idx  on public.official_message_attachments(message_id);

-- 6) Row Level Security — the enforced account boundary. Receive-only.
alter table public.official_messages enable row level security;
alter table public.official_message_attachments enable row level security;

drop policy if exists official_messages_select_own on public.official_messages;
create policy official_messages_select_own on public.official_messages
  for select using (recipient_account_id = public.get_my_edara_account_id());

drop policy if exists official_message_attachments_select_own on public.official_message_attachments;
create policy official_message_attachments_select_own on public.official_message_attachments
  for select using (recipient_account_id = public.get_my_edara_account_id());

-- NO INSERT / UPDATE / DELETE policies are created. With RLS enabled and only a
-- SELECT policy present, the anon-key client cannot create, modify, or delete
-- messages or attachments. Edara Desktop is strictly RECEIVE-ONLY: no Outbox
-- and no send permission. (NOTE: if attachments are served from a Supabase
-- Storage bucket, add bucket policies that restrict objects by an
-- account_id path prefix using the same get_my_edara_account_id() boundary.)

-- ============================================================================
-- EXISTING MESSAGES (important — DO NOT GUESS)
-- ----------------------------------------------------------------------------
-- This migration does NOT backfill recipient_account_id. Therefore every
-- pre-existing official_messages row currently has NULL recipient_account_id
-- and, under the new RLS, is hidden from ALL accounts (NULL != any account id).
-- They are preserved (not deleted, not guessed).
--
-- A separate, manual backfill is required and MUST be reviewed by a human:
--   map each message's existing recipient identifier (e.g. the school
--   directory org id currently used by Edara News) -> the corresponding
--   edara_accounts.id, then UPDATE recipient_account_id.
--   Rows whose recipient cannot be resolved to an edara_accounts.id must be
--   LEFT AS NULL (or explicitly reviewed) — never invented.
-- ============================================================================
