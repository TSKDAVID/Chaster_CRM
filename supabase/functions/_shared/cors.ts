// Use ALLOWED_ORIGIN env var to restrict CORS. Falls back to "*" only in
// local development; production deployments should always set this variable.
const allowedOrigin =
  Deno.env.get("ALLOWED_ORIGIN") ?? "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, PATCH, DELETE, PUT",
};

/**
 * Handle OPTIONS requests for CORS preflight.
 */
export function OptionsMiddleware(
  req: Request,
  next: (req: Request) => Promise<Response>,
) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return next(req);
}
