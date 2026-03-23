import { createClient } from "@/lib/supabase/server";
import { AuthenticationError, errorResponse } from "@/lib/errors";

interface IntegrationStatus {
  provider: string;
  connected: boolean;
  active: boolean;
  tokenExpired: boolean;
  lastSync: string | null;
  metadata: Record<string, unknown>;
}

/**
 * GET /api/integrations/status
 * Returns connection status for all integration providers.
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

    // Fetch connections and sync states with explicit columns
    const [connectionsResult, syncStatesResult] = await Promise.all([
      supabase
        .from("integration_connections")
        .select("provider, is_active, token_expires_at, provider_metadata")
        .eq("user_id", user.id),
      supabase
        .from("sync_state")
        .select("provider, last_sync_completed_at")
        .eq("user_id", user.id),
    ]);

    const connections = connectionsResult.data ?? [];
    const syncStates = syncStatesResult.data ?? [];

    // Build status for each provider
    const providers: Array<"gmail" | "slack"> = ["gmail", "slack"];

    const statuses: IntegrationStatus[] = providers.map((provider) => {
      const connection = connections.find((c) => c.provider === provider);
      const syncState = syncStates.find((s) => s.provider === provider);

      if (!connection) {
        return {
          provider,
          connected: false,
          active: false,
          tokenExpired: false,
          lastSync: null,
          metadata: {},
        };
      }

      const tokenExpired = connection.token_expires_at
        ? new Date(connection.token_expires_at) < new Date()
        : false;

      return {
        provider,
        connected: true,
        active: connection.is_active,
        tokenExpired,
        lastSync: syncState?.last_sync_completed_at ?? null,
        metadata: (connection.provider_metadata ?? {}) as Record<string, unknown>,
      };
    });

    return Response.json({ data: statuses });
  } catch (error) {
    return errorResponse(error);
  }
}
