import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { logAudit, requireAllowedUser } from '../_shared/auth.ts';
import { assertAllowedMessage, getAccessToken, gmailFetch, toSafeSummary } from '../_shared/gmail.ts';

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const context = await requireAllowedUser(req);
    const accessToken = await getAccessToken(context);
    const allowed = context.policy.allowed_contact_email;
    const query = encodeURIComponent(`from:${allowed} OR to:${allowed} OR cc:${allowed}`);

    const list = await gmailFetch<GmailListResponse>(
      accessToken,
      `messages?q=${query}&maxResults=20&includeSpamTrash=false`,
    );

    const detailed = await Promise.all(
      (list.messages ?? []).map((message) =>
        gmailFetch(accessToken, `messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`),
      ),
    );

    const messages = detailed
      .filter((message) => {
        try {
          assertAllowedMessage(message, allowed);
          return true;
        } catch {
          return false;
        }
      })
      .map(toSafeSummary);

    await logAudit(context, 'mail.list', undefined, { count: messages.length });

    return jsonResponse({ messages });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
