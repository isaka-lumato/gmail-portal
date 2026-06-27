import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { logAudit, requireAllowedUser } from '../_shared/auth.ts';
import { assertAllowedMessage, getAccessToken, gmailFetch, toSafeDetail } from '../_shared/gmail.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { messageId } = await req.json();
    if (!messageId || typeof messageId !== 'string') {
      return jsonResponse({ error: 'messageId is required.' }, 400);
    }

    const context = await requireAllowedUser(req);
    const accessToken = await getAccessToken(context);
    const message = await gmailFetch(accessToken, `messages/${messageId}?format=full`);

    assertAllowedMessage(message, context.policy.allowed_contact_email);
    await logAudit(context, 'mail.get', messageId);

    return jsonResponse({ message: toSafeDetail(message) });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
