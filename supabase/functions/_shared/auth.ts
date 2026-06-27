import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type AppContext = {
  actorEmail: string;
  policy: {
    owner_email: string;
    allowed_contact_email: string;
    can_send: boolean;
    allow_any_authenticated_user: boolean;
  };
  serviceClient: ReturnType<typeof createClient>;
};

export async function requireAllowedUser(req: Request): Promise<AppContext> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const secretKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !publishableKey || !secretKey) {
    throw new Error('Supabase environment is not configured.');
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user?.email) {
    throw new Response(JSON.stringify({ error: 'Not authenticated.' }), { status: 401 });
  }

  const serviceClient = createClient(supabaseUrl, secretKey);
  const actorEmail = userData.user.email.toLowerCase();

  const { data: policy, error: policyError } = await serviceClient
    .from('mailbox_policy')
    .select('owner_email, allowed_contact_email, can_send, allow_any_authenticated_user')
    .eq('id', true)
    .single();

  if (policyError) throw policyError;

  if (!policy.allow_any_authenticated_user) {
    const { data: allowedUser, error: allowedError } = await serviceClient
      .from('allowed_users')
      .select('email, active')
      .eq('email', actorEmail)
      .eq('active', true)
      .maybeSingle();

    if (allowedError) throw allowedError;
    if (!allowedUser) {
      throw new Response(JSON.stringify({ error: 'This account is not allowed to use this mailbox.' }), {
        status: 403,
      });
    }
  }

  return {
    actorEmail,
    policy,
    serviceClient,
  };
}

export async function logAudit(
  context: AppContext,
  action: string,
  gmailMessageId?: string,
  details: Record<string, unknown> = {},
) {
  await context.serviceClient.from('audit_logs').insert({
    actor_email: context.actorEmail,
    action,
    gmail_message_id: gmailMessageId,
    details,
  });
}
