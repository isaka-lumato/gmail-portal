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
