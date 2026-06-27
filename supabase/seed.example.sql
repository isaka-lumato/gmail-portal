-- Replace these three values before running in Supabase SQL editor.
insert into public.mailbox_policy (id, owner_email, allowed_contact_email, can_send)
values (
  true,
  'isakawilly10@gmail.com',
  'ufc5lumato@gmail.com',
  true
)
on conflict (id) do update
set
  owner_email = excluded.owner_email,
  allowed_contact_email = excluded.allowed_contact_email,
  can_send = excluded.can_send;

insert into public.allowed_users (email, active)
values ('isaaclumato10@gmail.com', true)
on conflict (email) do update
set active = excluded.active;
