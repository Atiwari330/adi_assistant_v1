import { createClient } from "@/lib/supabase/server";
import { errorResponse, AuthenticationError, ValidationError } from "@/lib/errors";
import { z } from "zod";
import type { Database } from "@/types/database";

const CreateContactSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  slack_user_id: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  relationship: z
    .enum([
      "team_member",
      "direct_report",
      "manager",
      "executive",
      "customer",
      "vendor",
      "partner",
      "other",
    ])
    .optional(),
  is_delegate: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * GET /api/contacts
 * List contacts with optional search.
 *
 * Query params:
 *   q            - search by name or email
 *   relationship - filter by relationship type
 *   delegates    - if "true", only show contacts with is_delegate=true
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
    const query = searchParams.get("q");
    const relationship = searchParams.get("relationship");
    const delegatesOnly = searchParams.get("delegates") === "true";

    let dbQuery = supabase
      .from("contacts")
      .select(
        "id, full_name, email, slack_user_id, job_title, organization, relationship, is_delegate, notes, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("full_name", { ascending: true });

    if (query) {
      dbQuery = dbQuery.or(`full_name.ilike.%${query}%,email.ilike.%${query}%`);
    }

    if (relationship) {
      dbQuery = dbQuery.eq("relationship", relationship as Database["public"]["Enums"]["contact_relationship"]);
    }

    if (delegatesOnly) {
      dbQuery = dbQuery.eq("is_delegate", true);
    }

    const { data, error } = await dbQuery;

    if (error) throw error;

    return Response.json({ data: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/contacts
 * Create a new contact.
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
    const parsed = CreateContactSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        user_id: user.id,
        ...parsed.data,
      })
      .select(
        "id, full_name, email, slack_user_id, job_title, organization, relationship, is_delegate, notes, created_at",
      )
      .single();

    if (error) throw error;

    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
