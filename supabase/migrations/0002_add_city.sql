-- 0002: Add the organization account city (governorate) to edara_accounts.
-- The city is part of the organization account and is auto-populated into
-- generated documents (see server.ts school_profile.city fill).

alter table public.edara_accounts
  add column if not exists city text;

comment on column public.edara_accounts.city is 'Governorate (المحافظة) of the organization account.';
