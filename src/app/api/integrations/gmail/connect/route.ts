import { createClient } from "@/lib/supabase/server";
import { getAuthUrl } from "@/lib/integrations/gmail/oauth";
import { AuthenticationError, errorResponse } from "@/lib/errors";
import { NextResponse } from "next/server";

/**
 * GET /api/integrations/gmail/connect
 * Redirects the user to Google's OAuth consent screen.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AuthenticationError();
    }

    // Pass user ID as state to verify in callback
    const authUrl = getAuthUrl(user.id);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    return errorResponse(error);
  }
}
