# Locked Mail

A small Gmail portal where a trusted user can only see messages involving one allowed contact, cannot delete mail, and can only reply/send to that same contact.

## What Is Built

- React + Vite frontend
- Supabase Auth for friend login
- Supabase Edge Functions as the only Gmail API access point
- Gmail scopes limited to:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.send`
- Server-side checks on every list/read/send request
- Audit log table for reads, lists, and sends

## Local Frontend Env

Create `.env` from `.env.example`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## Supabase Secrets

Set these as Supabase Edge Function secrets:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
OWNER_EMAIL=
OWNER_SETUP_TOKEN=
```

Legacy Supabase projects may still show `anon` and `service_role` keys. The code accepts those as fallbacks, but new projects should use `publishable` and `secret` keys.

For deployed Supabase, `GOOGLE_REDIRECT_URI` should usually be:

```text
https://YOUR_PROJECT_REF.functions.supabase.co/owner-oauth-callback
```

For this project:

```text
https://zgvhkngtplsnlbhlxxil.functions.supabase.co/owner-oauth-callback
```

Add that exact URL to the Google OAuth client authorized redirect URIs.

## Database Setup

Run the migration:

```text
supabase/migrations/202606270001_locked_mail.sql
```

Then copy `supabase/seed.example.sql`, replace the emails, and run it in the Supabase SQL editor.

## Edge Functions

Deploy these functions:

```text
mail-policy
mail-list
mail-get
mail-send
owner-auth-url
owner-oauth-callback
```

## Owner Gmail Authorization

After secrets and redirect URL are set:

1. Open the app.
2. Click `Owner Gmail setup`.
3. Sign into the owner Gmail account.
4. Approve the Gmail read/send scopes.
5. Google redirects to `owner-oauth-callback`, which stores the refresh token server-side.

## Run Locally

```bash
npm.cmd i
npm.cmd run dev
```

Production check:

```bash
npm.cmd run build
```
