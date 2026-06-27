import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { logAudit, requireAllowedUser } from '../_shared/auth.ts';
import { buildRawEmail, getAccessToken, gmailFetch } from '../_shared/gmail.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { subject, body, threadId } = await req.json();
    if (!subject || !body || typeof subject !== 'string' || typeof body !== 'string') {
      return jsonResponse({ error: 'subject and body are required.' }, 400);
    }

    const context = await requireAllowedUser(req);
    if (!context.policy.can_send) {
      return jsonResponse({ error: 'Sending is disabled by policy.' }, 403);
    }

    const accessToken = await getAccessToken(context);
    const raw = buildRawEmail({
      from: context.policy.owner_email,
      to: context.policy.allowed_contact_email,
      subject,
      body,
      threadId,
    });

    await gmailFetch(accessToken, 'messages/send', {
      method: 'POST',
      body: JSON.stringify({
        raw,
        ...(threadId ? { threadId } : {}),
      }),
    });

    await logAudit(context, 'mail.send', undefined, { subject, threadId: threadId ?? null });

    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
