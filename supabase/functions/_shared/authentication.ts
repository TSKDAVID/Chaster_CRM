// Based on https://github.com/supabase/supabase/blob/master/examples/edge-functions/supabase/functions/_shared/jwt/default.ts
import * as jose from "jsr:@panva/jose@6";
import { createClient, type User } from "jsr:@supabase/supabase-js@2";
import { createErrorResponse } from "./utils.ts";

const supabaseUrlForJwt = Deno.env.get("SUPABASE_URL") ?? "";

const SUPABASE_JWT_ISSUER =
  Deno.env.get("SB_JWT_ISSUER") ?? `${supabaseUrlForJwt}/auth/v1`;

const SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
  new URL(`${supabaseUrlForJwt}/auth/v1/.well-known/jwks.json`),
);

/** Platform injects SUPABASE_ANON_KEY; local .env may use SB_PUBLISHABLE_KEY only. */
function getSupabasePublicApiKey(): string {
  return (
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SB_PUBLISHABLE_KEY") ??
    ""
  );
}

function getAuthToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }
  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer") {
    throw new Error(`Auth header is not 'Bearer {token}'`);
  }

  return token;
}

function verifySupabaseJWT(jwt: string) {
  return jose.jwtVerify(jwt, SUPABASE_JWT_KEYS, {
    issuer: SUPABASE_JWT_ISSUER,
  });
}

/**
 * Validates the Authorization header to ensure that a user is authenticated.
 */
export const AuthMiddleware = async (
  req: Request,
  next: (req: Request) => Promise<Response>,
) => {
  if (req.method === "OPTIONS") return await next(req);

  try {
    const token = getAuthToken(req);
    const isValidJWT = await verifySupabaseJWT(token);

    if (isValidJWT) return await next(req);

    return createErrorResponse(401, "Invalid authentication");
  } catch (_e) {
    return createErrorResponse(401, "Unauthorized");
  }
};

/**
 * Get the authenticated user using the authorization header.
 * User will be undefined for OPTIONS requests.
 */
export const UserMiddleware = async (
  req: Request,
  next: (req: Request, user?: User) => Promise<Response>,
) => {
  if (req.method === "OPTIONS") return await next(req);

  try {
    const authHeader = req.headers.get("Authorization")!;
    const publicApiKey = getSupabasePublicApiKey();
    if (!publicApiKey) {
      console.error(
        "UserMiddleware: missing SUPABASE_ANON_KEY (or SB_PUBLISHABLE_KEY for local dev)",
      );
      return createErrorResponse(
        500,
        "Edge function misconfigured: set SUPABASE_ANON_KEY or deploy with default project secrets",
      );
    }
    const localClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      publicApiKey,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data, error: authError } = await localClient.auth.getUser();
    if (!data?.user || authError) {
      return createErrorResponse(401, "Unauthorized");
    }

    return next(req, data.user);
  } catch (_err) {
    return createErrorResponse(401, "Unauthorized");
  }
};
