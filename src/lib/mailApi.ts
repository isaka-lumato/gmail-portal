import { supabase } from './supabase';

export type MailSummary = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  internalDate: string;
};

export type MailDetail = MailSummary & {
  bodyText: string;
  bodyHtml?: string;
};

export type Policy = {
  ownerEmail: string;
  allowedContactEmail: string;
  canSend: boolean;
  allowAnyAuthenticatedUser: boolean;
};

async function invoke<T>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body as Record<string, unknown> | undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('No response from server.');
  }

  return data;
}

export function getPolicy() {
  return invoke<Policy>('mail-policy');
}

export function listMessages() {
  return invoke<{ messages: MailSummary[] }>('mail-list');
}

export function getMessage(messageId: string) {
  return invoke<{ message: MailDetail }>('mail-get', { messageId });
}

export function sendMessage(input: { subject: string; body: string; threadId?: string }) {
  return invoke<{ ok: true }>('mail-send', input);
}

export function getOwnerAuthUrl(setupToken: string) {
  return invoke<{ url: string }>('owner-auth-url', { setupToken });
}
