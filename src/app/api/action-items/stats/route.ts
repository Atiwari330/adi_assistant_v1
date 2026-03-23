import { createClient } from "@/lib/supabase/server";
import { errorResponse, AuthenticationError } from "@/lib/errors";

/**
 * GET /api/action-items/stats
 * Returns counts by status, priority, and source for the dashboard.
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

    // Fetch all action items (just id, status, priority for counting)
    const { data: items } = await supabase
      .from("action_items")
      .select("id, status, priority")
      .eq("user_id", user.id);

    const allItems = items ?? [];

    // Count by status
    const byStatus: Record<string, number> = {};
    for (const item of allItems) {
      byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    }

    // Count by priority (only active items)
    const activeStatuses = new Set(["new", "read", "acknowledged", "in_progress"]);
    const byPriority: Record<string, number> = {};
    for (const item of allItems) {
      if (activeStatuses.has(item.status)) {
        byPriority[item.priority] = (byPriority[item.priority] ?? 0) + 1;
      }
    }

    const activeCount = allItems.filter((i) => activeStatuses.has(i.status)).length;

    return Response.json({
      data: {
        total: allItems.length,
        active: activeCount,
        byStatus,
        byPriority,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
