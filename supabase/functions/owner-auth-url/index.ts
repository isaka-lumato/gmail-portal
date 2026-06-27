import { handleOptions, jsonResponse } from '../_shared/cors.ts';

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const expectedSetupToken = Deno.env.get('OWNER_SETUP_TOKEN');
    const body = await req.json().catch(() => ({}));
    const setupToken = typeof body.setupToken === 'string' ? body.setupToken : '';

    if (expectedSetupToken && setupToken !== expectedSetupToken) {
      return jsonResponse({ error: 'Invalid owner setup token.' }, 403);
    }

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env('GOOGLE_CLIENT_ID'));
    url.searchParams.set('redirect_uri', env('GOOGLE_REDIRECT_URI'));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('scope', [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ].join(' '));

    if (expectedSetupToken) {
      url.searchParams.set('state', expectedSetupToken);
    }

    return jsonResponse({ url: url.toString() });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
