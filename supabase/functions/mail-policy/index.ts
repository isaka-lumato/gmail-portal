import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { requireAllowedUser } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const context = await requireAllowedUser(req);

    return jsonResponse({
      ownerEmail: context.policy.owner_email,
      allowedContactEmail: context.policy.allowed_contact_email,
      canSend: context.policy.can_send,
      allowAnyAuthenticatedUser: context.policy.allow_any_authenticated_user,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
