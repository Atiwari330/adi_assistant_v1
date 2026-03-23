import { createClient } from "@/lib/supabase/server";
import { errorResponse, AuthenticationError, NotFoundError, ValidationError } from "@/lib/errors";
import { NextRequest } from "next/server";
import { z } from "zod";

const UpdateContactSchema = z.object({
  full_name: z.string().min(1).optional(),
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
 * GET /api/contacts/[id]
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

    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, full_name, email, slack_user_id, job_title, organization, relationship, is_delegate, notes, created_at, updated_at",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      throw new NotFoundError("Contact");
    }

    return Response.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/contacts/[id]
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
    const parsed = UpdateContactSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }

    const { data, error } = await supabase
      .from("contacts")
      .update(parsed.data)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        "id, full_name, email, slack_user_id, job_title, organization, relationship, is_delegate, notes, updated_at",
      )
      .single();

    if (error || !data) {
      throw new NotFoundError("Contact");
    }

    return Response.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/contacts/[id]
 */
export async function DELETE(
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

    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
