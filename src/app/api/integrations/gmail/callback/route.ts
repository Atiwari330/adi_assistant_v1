import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/integrations/gmail/oauth";
import { encrypt } from "@/lib/crypto";
import { errorResponse } from "@/lib/errors";

/**
 * GET /api/integrations/gmail/callback
 * Handles the OAuth callback from Google after user grants consent.
 * Exchanges the code for tokens, encrypts them, and stores in DB.
 */
export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    // User denied consent
    if (error) {
      return NextResponse.redirect(
        new URL("/dashboard?gmail=denied", origin),
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL("/dashboard?gmail=error&reason=no_code", origin),
      );
    }

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", origin));
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/dashboard?gmail=error&reason=no_tokens", origin),
      );
    }

    // Encrypt tokens before storing
    const encryptedAccess = encrypt(tokens.access_token);
    const encryptedRefresh = encrypt(tokens.refresh_token);

    // Upsert integration connection
    const { error: dbError } = await supabase
      .from("integration_connections")
      .upsert(
        {
          user_id: user.id,
          provider: "gmail" as const,
          is_active: true,
          access_token: encryptedAccess,
          refresh_token: encryptedRefresh,
          token_expires_at: tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
          scopes: tokens.scope ? tokens.scope.split(" ") : [],
          provider_metadata: {
            token_type: tokens.token_type ?? null,
            connected_at: new Date().toISOString(),
          },
        },
        { onConflict: "user_id,provider" },
      );

    if (dbError) {
      console.error("Failed to store Gmail tokens:", dbError);
      return NextResponse.redirect(
        new URL("/dashboard?gmail=error&reason=db_error", origin),
      );
    }

    // Initialize sync state for Gmail
    await supabase.from("sync_state").upsert(
      {
        user_id: user.id,
        provider: "gmail" as const,
        status: "idle" as const,
        cursor_data: {},
      },
      { onConflict: "user_id,provider" },
    );

    return NextResponse.redirect(
      new URL("/dashboard?gmail=connected", origin),
    );
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    return errorResponse(err);
  }
}
