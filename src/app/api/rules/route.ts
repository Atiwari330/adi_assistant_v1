import { createClient } from "@/lib/supabase/server";
import { errorResponse, AuthenticationError, ValidationError } from "@/lib/errors";
import { z } from "zod";

const CreateFilterRuleSchema = z.object({
  type: z.literal("filter"),
  rule_type: z.enum(["exclude_domain", "exclude_address", "exclude_channel"]),
  pattern: z.string().min(1),
  description: z.string().optional(),
});

const CreateProcessingRuleSchema = z.object({
  type: z.literal("processing"),
  match_type: z.enum(["email_address", "email_domain", "slack_user_id", "slack_channel"]),
  match_value: z.string().min(1),
  priority_override: z.enum(["critical", "high", "medium", "low", "info"]).nullable().optional(),
  delegate_to: z.string().uuid().nullable().optional(),
  instruction_text: z.string().nullable().optional(),
});

const CreateRuleSchema = z.discriminatedUnion("type", [
  CreateFilterRuleSchema,
  CreateProcessingRuleSchema,
]);

/**
 * GET /api/rules
 * List all filter rules and processing rules.
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

    const [filterResult, processingResult] = await Promise.all([
      supabase
        .from("filter_rules")
        .select("id, rule_type, pattern, description, is_active, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("processing_rules")
        .select(
          "id, match_type, match_value, priority_override, delegate_to, instruction_text, is_active, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    // Fetch delegate contact names for processing rules
    const delegateIds = (processingResult.data ?? [])
      .map((r) => r.delegate_to)
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

    const enrichedProcessingRules = (processingResult.data ?? []).map((rule) => ({
      ...rule,
      type: "processing" as const,
      delegate_to_name: rule.delegate_to ? delegateMap[rule.delegate_to] ?? null : null,
    }));

    const enrichedFilterRules = (filterResult.data ?? []).map((rule) => ({
      ...rule,
      type: "filter" as const,
    }));

    return Response.json({
      data: {
        filter_rules: enrichedFilterRules,
        processing_rules: enrichedProcessingRules,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/rules
 * Create a new filter rule or processing rule.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AuthenticationError();
    }

    const body = await request.json();
    const parsed = CreateRuleSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }

    const input = parsed.data;

    if (input.type === "filter") {
      const { data, error } = await supabase
        .from("filter_rules")
        .insert({
          user_id: user.id,
          rule_type: input.rule_type,
          pattern: input.pattern,
          description: input.description ?? null,
        })
        .select("id, rule_type, pattern, description, is_active, created_at")
        .single();

      if (error) throw error;
      return Response.json({ data: { ...data, type: "filter" } }, { status: 201 });
    } else {
      const { data, error } = await supabase
        .from("processing_rules")
        .insert({
          user_id: user.id,
          match_type: input.match_type,
          match_value: input.match_value,
          priority_override: input.priority_override ?? null,
          delegate_to: input.delegate_to ?? null,
          instruction_text: input.instruction_text ?? null,
        })
        .select(
          "id, match_type, match_value, priority_override, delegate_to, instruction_text, is_active, created_at",
        )
        .single();

      if (error) throw error;
      return Response.json({ data: { ...data, type: "processing" } }, { status: 201 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
