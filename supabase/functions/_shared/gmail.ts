import type { AppContext } from './auth.ts';

type GmailHeader = {
  name: string;
  value: string;
};

type GmailPart = {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart & {
    headers?: GmailHeader[];
  };
};

export type SafeMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  internalDate: string;
};

export type SafeMessageDetail = SafeMessage & {
  bodyText: string;
};

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function getHeader(message: GmailMessage, name: string) {
  const header = message.payload?.headers?.find(
    (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? '';
}

function collectBodyText(part?: GmailPart): string {
  if (!part) return '';

  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  const nested = part.parts?.map(collectBodyText).filter(Boolean).join('\n\n');
  if (nested) return nested;

  if (part.body?.data && part.mimeType === 'text/html') {
    return decodeBase64Url(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return '';
}

function includesAddress(headerValue: string, email: string) {
  return headerValue.toLowerCase().includes(email.toLowerCase());
}

export function assertAllowedMessage(message: GmailMessage, allowedContactEmail: string) {
  const from = getHeader(message, 'From');
  const to = getHeader(message, 'To');
  const cc = getHeader(message, 'Cc');

  if (
    !includesAddress(from, allowedContactEmail) &&
    !includesAddress(to, allowedContactEmail) &&
    !includesAddress(cc, allowedContactEmail)
  ) {
    throw new Response(JSON.stringify({ error: 'Message is outside the allowed contact policy.' }), {
      status: 403,
    });
  }
}

export function toSafeSummary(message: GmailMessage): SafeMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    from: getHeader(message, 'From'),
    to: getHeader(message, 'To'),
    subject: getHeader(message, 'Subject'),
    snippet: message.snippet ?? '',
    internalDate: message.internalDate ?? '0',
  };
}

export function toSafeDetail(message: GmailMessage): SafeMessageDetail {
  return {
    ...toSafeSummary(message),
    bodyText: collectBodyText(message.payload),
  };
}

export async function getAccessToken(context: AppContext) {
  const { data, error } = await context.serviceClient
    .from('owner_gmail_tokens')
    .select('refresh_token')
    .eq('id', true)
    .single();

  if (error) throw error;
  if (!data?.refresh_token) throw new Error('Owner Gmail has not been authorized yet.');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: data.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Could not refresh Gmail access token.');
  }

  const tokenJson = await tokenResponse.json();
  return tokenJson.access_token as string;
}

export async function gmailFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gmail request failed: ${message}`);
  }

  return response.json() as Promise<T>;
}

export function buildRawEmail(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}) {
  const message = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    input.body,
  ].join('\r\n');

  const bytes = new TextEncoder().encode(message);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
