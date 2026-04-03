import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";

/** Sends the same password-recovery email as POST /auth/v1/recover (uses service role). */
async function sendRecoverForEmail(email: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[update_password] recover failed:", res.status, text.slice(0, 300));
    return false;
  }
  return true;
}

async function updatePassword(user: { email?: string }) {
  const email = user.email;
  if (!email) {
    return createErrorResponse(400, "Missing user email");
  }
  const ok = await sendRecoverForEmail(email);
  if (!ok) {
    return createErrorResponse(500, "Failed to send recovery email");
  }

  return new Response(JSON.stringify({ data: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method === "PATCH") {
          return updatePassword(user);
        }

        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
