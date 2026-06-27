# Locked Gmail Portal - Agent Handoff

## Project Goal

We are building a minimal custom email web app that lets one trusted friend access a Gmail mailbox, but only for messages involving one allowed email address.

The friend must not be able to:

- Read unrelated inbox messages
- Delete messages
- Modify labels, settings, forwarding, filters, or mailbox state
- Send arbitrary emails to arbitrary people

Sending/replying is allowed only to the configured `ALLOWED_CONTACT_EMAIL`.

The app now supports `mailbox_policy.allow_any_authenticated_user`. When true, any Supabase-authenticated email can use the portal, while Gmail data is still restricted to `ALLOWED_CONTACT_EMAIL`. When false, the old `allowed_users` table is enforced.

## Current Test Policy

These values are for testing and may change later:

```env
OWNER_EMAIL=isakawilly10@gmail.com
ALLOWED_CONTACT_EMAIL=ufc5lumato@gmail.com
FRIEND_LOGIN_EMAIL=isaaclumato10@gmail.com
```

Google OAuth redirect URL has already been added in Google Cloud:

```text
https://zgvhkngtplsnlbhlxxil.functions.supabase.co/owner-oauth-callback
```

## Stack

- React + Vite frontend
- Supabase Auth for friend login
- Supabase Edge Functions for all Gmail API access
- Gmail API with only:
  - `gmail.readonly`
  - `gmail.send`

The frontend must never receive Gmail tokens or backend secrets.

## Supabase Project

Project URL:

```env
SUPABASE_URL=https://zgvhkngtplsnlbhlxxil.supabase.co
```

The project uses current Supabase key naming:

```env
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Legacy fallbacks are still supported in code:

```env
VITE_SUPABASE_ANON_KEY=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not commit secret keys. `.env.local` contains only frontend-safe values.

## Important Files

- `src/App.tsx` - main UI/auth/mail reader/reply composer
- `src/lib/supabase.ts` - Supabase browser client
- `src/lib/mailApi.ts` - frontend calls to Supabase Edge Functions
- `supabase/migrations/202606270001_locked_mail.sql` - database schema/RLS
- `supabase/setup.sql` - one-shot SQL editor setup with schema and current test seed
- `supabase/seed.example.sql` - test policy seed template
- `supabase/config.toml` - function JWT config
- `supabase/functions/_shared/auth.ts` - user authorization guard
- `supabase/functions/_shared/gmail.ts` - Gmail helpers and message policy checks
- `supabase/functions/mail-list/index.ts` - lists only allowed messages
- `supabase/functions/mail-get/index.ts` - reads a message only after header validation
- `supabase/functions/mail-send/index.ts` - sends only to allowed contact
- `supabase/functions/owner-auth-url/index.ts` - starts owner Gmail OAuth, protected by setup token
- `supabase/functions/owner-oauth-callback/index.ts` - stores owner refresh token

## Security Model

The backend is the enforcement point.

Frontend behavior is helpful UX, not security. Every Edge Function must:

1. Verify the Supabase user JWT where appropriate.
2. Confirm the signed-in email exists in `allowed_users` and is active.
3. Load `mailbox_policy`.
4. For reads, fetch the Gmail message and verify `From`, `To`, or `Cc` includes `ALLOWED_CONTACT_EMAIL`.
5. For sends, force `To` to `ALLOWED_CONTACT_EMAIL`.
6. Never call Gmail modify/delete/settings APIs.
7. Write audit logs for list/read/send actions.

Owner OAuth setup functions have JWT verification disabled in `supabase/config.toml` because the Google callback cannot include a Supabase JWT. They are protected by `OWNER_SETUP_TOKEN`.

## Next Steps

1. Run `supabase/setup.sql` in the Supabase SQL editor, or run the migration plus seed separately.
2. Confirm `mailbox_policy` and `allowed_users` contain the current test emails.
3. For "friend can log in with any email", confirm `mailbox_policy.allow_any_authenticated_user = true`.
3. Set Supabase function secrets:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://zgvhkngtplsnlbhlxxil.functions.supabase.co/owner-oauth-callback
OWNER_EMAIL=isakawilly10@gmail.com
OWNER_SETUP_TOKEN=
```

4. Deploy Edge Functions.
5. Open app, click `Owner Gmail setup`, enter `OWNER_SETUP_TOKEN`, authorize Gmail.
6. Sign in as `isaaclumato10@gmail.com` and test list/read/send behavior.

## Verification

Last verified command:

```bash
npm.cmd run build
```

It passes.
