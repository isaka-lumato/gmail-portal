-- Run this in the Supabase SQL editor for the project:
-- https://zgvhkngtplsnlbhlxxil.supabase.co

create extension if not exists pgcrypto;

create table if not exists public.mailbox_policy (
  id boolean primary key default true,
  owner_email text not null,
  allowed_contact_email text not null,
  can_send boolean not null default true,
  allow_any_authenticated_user boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mailbox_policy_singleton check (id)
);

create table if not exists public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.owner_gmail_tokens (
  id boolean primary key default true,
  owner_email text not null,
  refresh_token text not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_gmail_tokens_singleton check (id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_email text not null,
  action text not null,
  gmail_message_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.mailbox_policy enable row level security;
alter table public.allowed_users enable row level security;
alter table public.owner_gmail_tokens enable row level security;
alter table public.audit_logs enable row level security;

alter table public.mailbox_policy
add column if not exists allow_any_authenticated_user boolean not null default false;

drop policy if exists "allowed users can read policy" on public.mailbox_policy;
create policy "allowed users can read policy"
on public.mailbox_policy
for select
to authenticated
using (
  allow_any_authenticated_user
  or exists (
    select 1
    from public.allowed_users
    where allowed_users.email = auth.jwt() ->> 'email'
      and allowed_users.active
  )
);

drop policy if exists "allowed users can read own allow record" on public.allowed_users;
create policy "allowed users can read own allow record"
on public.allowed_users
for select
to authenticated
using (email = auth.jwt() ->> 'email' and active);

drop policy if exists "allowed users can insert own audit logs" on public.audit_logs;
create policy "allowed users can insert own audit logs"
on public.audit_logs
for insert
to authenticated
with check (actor_email = auth.jwt() ->> 'email');

create index if not exists audit_logs_actor_created_idx
on public.audit_logs (actor_email, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mailbox_policy_updated_at on public.mailbox_policy;
create trigger mailbox_policy_updated_at
before update on public.mailbox_policy
for each row execute function public.set_updated_at();

drop trigger if exists owner_gmail_tokens_updated_at on public.owner_gmail_tokens;
create trigger owner_gmail_tokens_updated_at
before update on public.owner_gmail_tokens
for each row execute function public.set_updated_at();

insert into public.mailbox_policy (id, owner_email, allowed_contact_email, can_send, allow_any_authenticated_user)
values (
  true,
  'isakawilly10@gmail.com',
  'ufc5lumato@gmail.com',
  true,
  true
)
on conflict (id) do update
set
  owner_email = excluded.owner_email,
  allowed_contact_email = excluded.allowed_contact_email,
  can_send = excluded.can_send,
  allow_any_authenticated_user = excluded.allow_any_authenticated_user;

insert into public.allowed_users (email, active)
values ('isaaclumato10@gmail.com', true)
on conflict (email) do update
set active = excluded.active;
