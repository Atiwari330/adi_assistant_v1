import { createClient } from "@/lib/supabase/server";
import { errorResponse, AuthenticationError } from "@/lib/errors";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { ActionStatus, PriorityLevel, SourceType } from "@/types/database";

/**
 * GET /api/action-items
 * List action items with filters, pagination, and sorting.
 *
 * Query params:
 *   status    - filter by status (new, read, acknowledged, in_progress, done, dismissed)
 *   priority  - filter by priority (critical, high, medium, low, info)
 *   source    - filter by source type (email, slack)
 *   page      - page number (default 1)
 *   pageSize  - items per page (default 20, max 100)
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AuthenticationError();
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as ActionStatus | null;
    const priority = searchParams.get("priority") as PriorityLevel | null;
    const source = searchParams.get("source") as SourceType | null;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10)));

    // Build query
    let query = supabase
      .from("action_items")
      .select(
        "id, title, summary, action_type, priority, status, delegate_reason, ai_reasoning, due_date, snoozed_until, created_at, updated_at, suggested_delegate, metadata",
        { count: "exact" },
      )
      .eq("user_id", user.id);

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    } else {
      // Default: show active items (not done/dismissed)
      query = query.in("status", ["new", "read", "acknowledged", "in_progress"]);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    // Source filter requires joining through action_item_sources
    // For now, we'll skip complex join filtering and handle it client-side if needed
    // TODO: add source filtering via a subquery if performance allows

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Sort: priority first (critical→info), then newest first
    query = query
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    // If we have action items with suggested delegates, fetch contact names
    const delegateIds = (data ?? [])
      .map((item) => item.suggested_delegate)
      .filter((id): id is string => id !== null);

    let delegateMap: Record<string, string> = {};
    if (delegateIds.length > 0) {
      const { data: delegates } = await supabase
        .from("contacts")
        .select("id, full_name")
        .in("id", delegateIds);

      delegateMap = Object.fromEntries(
        (delegates ?? []).map((d) => [d.id, d.full_name]),
      );
    }

    // Enrich items with delegate names
    const enrichedData = (data ?? []).map((item) => ({
      ...item,
      suggested_delegate_name: item.suggested_delegate
        ? delegateMap[item.suggested_delegate] ?? null
        : null,
    }));

    // If source filter was requested, fetch source info
    if (source && enrichedData.length > 0) {
      // Filter client-side via source lookup
      const itemIds = enrichedData.map((item) => item.id);
      const { data: sources } = await supabase
        .from("action_item_sources")
        .select("action_item_id, source_message_id")
        .in("action_item_id", itemIds)
        .eq("is_primary", true);

      if (sources && sources.length > 0) {
        const messageIds = sources.map((s) => s.source_message_id);
        const { data: messages } = await supabase
          .from("source_messages")
          .select("id, source")
          .in("id", messageIds)
          .eq("source", source);

        const validMessageIds = new Set((messages ?? []).map((m) => m.id));
        const validActionIds = new Set(
          (sources ?? [])
            .filter((s) => validMessageIds.has(s.source_message_id))
            .map((s) => s.action_item_id),
        );

        const filtered = enrichedData.filter((item) => validActionIds.has(item.id));
        return Response.json({
          data: filtered,
          pagination: {
            total: filtered.length,
            page,
            pageSize,
            hasMore: false, // Can't accurately paginate with client-side filter
          },
        });
      }
    }

    return Response.json({
      data: enrichedData,
      pagination: {
        total: count ?? 0,
        page,
        pageSize,
        hasMore: (count ?? 0) > page * pageSize,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
