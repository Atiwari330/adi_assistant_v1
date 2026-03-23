import { createClient } from "@/lib/supabase/server";
import { errorResponse, AuthenticationError, NotFoundError, ValidationError } from "@/lib/errors";
import { NextRequest } from "next/server";
import { z } from "zod";

const FeedbackSchema = z.object({
  category: z.enum([
    "priority_wrong",
    "action_type_wrong",
    "delegation_wrong",
    "missing_context",
    "not_an_item",
    "should_split",
    "other",
  ]),
  comment: z.string().min(5, "Comment must be at least 5 characters"),
});

/**
 * GET /api/action-items/[id]/feedback
 * List feedback for an action item.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AuthenticationError();
    }

    const { id } = await params;

    const { data: feedback, error } = await supabase
      .from("action_item_feedback")
      .select("id, category, comment, resolved, created_at")
      .eq("action_item_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({ data: feedback ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/action-items/[id]/feedback
 * Submit feedback on an action item.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AuthenticationError();
    }

    const { id } = await params;
    const body = await request.json();

    const parsed = FeedbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }

    // Verify the action item exists and belongs to this user
    const { data: item } = await supabase
      .from("action_items")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!item) {
      throw new NotFoundError("Action item");
    }

    const { data: feedback, error } = await supabase
      .from("action_item_feedback")
      .insert({
        user_id: user.id,
        action_item_id: id,
        category: parsed.data.category,
        comment: parsed.data.comment,
      })
      .select("id, category, comment, resolved, created_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({ data: feedback }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
