import { createClient } from "@/lib/supabase/server";
import { errorResponse, AuthenticationError, NotFoundError, ValidationError } from "@/lib/errors";
import { NextRequest } from "next/server";
import { z } from "zod";

const UpdateFilterRuleSchema = z.object({
  type: z.literal("filter"),
  pattern: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const UpdateProcessingRuleSchema = z.object({
  type: z.literal("processing"),
  match_value: z.string().min(1).optional(),
  priority_override: z.enum(["critical", "high", "medium", "low", "info"]).nullable().optional(),
  delegate_to: z.string().uuid().nullable().optional(),
  instruction_text: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const UpdateRuleSchema = z.discriminatedUnion("type", [
  UpdateFilterRuleSchema,
  UpdateProcessingRuleSchema,
]);

/**
 * PATCH /api/rules/[id]
 * Update a filter rule or processing rule.
 */
export async function PATCH(
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
    const parsed = UpdateRuleSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }

    const input = parsed.data;

    if (input.type === "filter") {
      const { type: _, ...updates } = input;
      const { data, error } = await supabase
        .from("filter_rules")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id, rule_type, pattern, description, is_active, updated_at")
        .single();

      if (error || !data) throw new NotFoundError("Filter rule");
      return Response.json({ data: { ...data, type: "filter" } });
    } else {
      const { type: _, ...updates } = input;
      const { data, error } = await supabase
        .from("processing_rules")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select(
          "id, match_type, match_value, priority_override, delegate_to, instruction_text, is_active, updated_at",
        )
        .single();

      if (error || !data) throw new NotFoundError("Processing rule");
      return Response.json({ data: { ...data, type: "processing" } });
    }
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/rules/[id]
 * Delete a filter rule or processing rule.
 * Tries both tables since the client specifies the type in query params.
 */
export async function DELETE(
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
    const ruleType = new URL(request.url).searchParams.get("type");

    if (ruleType === "processing") {
      const { error } = await supabase
        .from("processing_rules")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    } else {
      // Default to filter rule, or try both
      const { error } = await supabase
        .from("filter_rules")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        // Try processing rules as fallback
        const { error: error2 } = await supabase
          .from("processing_rules")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (error2) throw new NotFoundError("Rule");
      }
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
