import { createClient } from "@/lib/supabase/server";
import { errorResponse, AuthenticationError, NotFoundError, ValidationError } from "@/lib/errors";
import { z } from "zod";
import type { Database, Json } from "@/types/database";

const UpdateProfileSchema = z.object({
  display_name: z.string().min(1).optional(),
  job_title: z.string().nullable().optional(),
  role_description: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  company_description: z.string().nullable().optional(),
  team_structure: z.string().nullable().optional(),
  work_preferences: z.record(z.string(), z.unknown()).optional(),
  system_prompt_override: z.string().nullable().optional(),
});

/**
 * GET /api/user-context
 * Get the user's profile context used in LLM prompts.
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

    const { data, error } = await supabase
      .from("user_profiles")
      .select(
        "id, display_name, job_title, role_description, company_name, company_description, team_structure, work_preferences, system_prompt_override, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      throw new NotFoundError("User profile");
    }

    return Response.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/user-context
 * Update the user's profile context.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AuthenticationError();
    }

    const body = await request.json();
    const parsed = UpdateProfileSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }

    const { work_preferences, ...rest } = parsed.data;

    const updates: Record<string, unknown> = { ...rest };
    if (work_preferences !== undefined) {
      updates.work_preferences = work_preferences as Json;
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .update(updates as Database["public"]["Tables"]["user_profiles"]["Update"])
      .eq("user_id", user.id)
      .select(
        "id, display_name, job_title, role_description, company_name, company_description, team_structure, work_preferences, system_prompt_override, updated_at",
      )
      .single();

    if (error || !data) {
      throw new NotFoundError("User profile");
    }

    return Response.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
