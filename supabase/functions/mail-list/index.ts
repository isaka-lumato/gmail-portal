import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { logAudit, requireAllowedUser } from '../_shared/auth.ts';
import { assertAllowedMessage, getAccessToken, gmailFetch, toSafeSummary } from '../_shared/gmail.ts';

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
};

const GMAIL_PAGE_SIZE = 500;
const METADATA_BATCH_SIZE = 25;

function historyLimit() {
  const raw = Deno.env.get('MAIL_HISTORY_LIMIT');
  if (!raw) return Number.POSITIVE_INFINITY;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
}

async function fetchAllowedMessageIds(accessToken: string, query: string) {
  const collected: Array<{ id: string; threadId: string }> = [];
  const limit = historyLimit();
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(GMAIL_PAGE_SIZE, limit - collected.length)),
      includeSpamTrash: 'false',
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const page = await gmailFetch<GmailListResponse>(accessToken, `messages?${params.toString()}`);
    collected.push(...(page.messages ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && collected.length < limit);

  return collected;
}

async function fetchMetadataInBatches(
  accessToken: string,
  messageIds: Array<{ id: string; threadId: string }>,
) {
  const detailed = [];

  for (let index = 0; index < messageIds.length; index += METADATA_BATCH_SIZE) {
    const batch = messageIds.slice(index, index + METADATA_BATCH_SIZE);
    detailed.push(
      ...(await Promise.all(
        batch.map((message) =>
          gmailFetch(
            accessToken,
            `messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`,
          ),
        ),
      )),
    );
  }

  return detailed;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const context = await requireAllowedUser(req);
    const accessToken = await getAccessToken(context);
    const allowed = context.policy.allowed_contact_email;
    const query = `from:${allowed} OR to:${allowed} OR cc:${allowed}`;

    const messageIds = await fetchAllowedMessageIds(accessToken, query);
    const detailed = await fetchMetadataInBatches(accessToken, messageIds);

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

    await logAudit(context, 'mail.list', undefined, {
      count: messages.length,
      searched: messageIds.length,
      historyLimit: Number.isFinite(historyLimit()) ? historyLimit() : null,
    });

    return jsonResponse({ messages });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
