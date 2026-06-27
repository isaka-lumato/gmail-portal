import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleOptions, jsonResponse } from '../_shared/cors.ts';

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function supabaseSecretKey() {
  return Deno.env.get('SUPABASE_SECRET_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY');
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const requestUrl = new URL(req.url);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const expectedState = Deno.env.get('OWNER_SETUP_TOKEN');

    if (expectedState && state !== expectedState) {
      return jsonResponse({ error: 'Invalid owner setup token.' }, 403);
    }

    if (!code) {
      return jsonResponse({ error: 'Missing Google authorization code.' }, 400);
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env('GOOGLE_CLIENT_ID'),
        client_secret: env('GOOGLE_CLIENT_SECRET'),
        redirect_uri: env('GOOGLE_REDIRECT_URI'),
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      return jsonResponse({ error: await tokenResponse.text() }, 400);
    }

    const tokenJson = await tokenResponse.json();
    if (!tokenJson.refresh_token) {
      return jsonResponse(
        { error: 'Google did not return a refresh token. Revoke app access and try again with prompt=consent.' },
        400,
      );
    }

    const serviceClient = createClient(env('SUPABASE_URL'), supabaseSecretKey());
    const ownerEmail = env('OWNER_EMAIL');

    const { error } = await serviceClient.from('owner_gmail_tokens').upsert({
      id: true,
      owner_email: ownerEmail,
      refresh_token: tokenJson.refresh_token,
      scope: tokenJson.scope,
    });

    if (error) throw error;

    return new Response(
      '<!doctype html><html><body><h1>Gmail connected</h1><p>You can close this tab.</p></body></html>',
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html',
        },
      },
    );
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
