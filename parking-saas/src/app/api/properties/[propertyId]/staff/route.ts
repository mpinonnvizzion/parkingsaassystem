import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ propertyId: string }> };

const STAFF_ROLES = ["property_admin", "staff", "patrol_officer"] as const;
// Cast as any[] to bypass stale generated types that don't include patrol_officer yet
const ALL_STAFF_ROLES = ["super_admin", "org_admin", "property_admin", "staff", "patrol_officer"] as any[];

// ─── GET: list all non-resident members ──────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const { propertyId } = await params;
  const supabase = createServiceRoleClient();

  const { data: members, error } = await supabase
    .from("property_members")
    .select("user_id, role, created_at")
    .eq("property_id", propertyId)
    .in("role", ALL_STAFF_ROLES)
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = (members ?? []).map((m) => m.user_id);

  let profiles: Array<{ id: string; full_name: string | null; email: string }> = [];
  if (userIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    profiles = data ?? [];
  }

  const result = (members ?? []).map((m) => {
    const profile = profiles.find((p) => p.id === m.user_id);
    return {
      user_id: m.user_id,
      role: m.role,
      created_at: m.created_at,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? "—",
    };
  });

  return NextResponse.json(result);
}

// ─── POST: add a new staff member by email ────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const { propertyId } = await params;
  const body = await req.json() as { email?: string; role?: string };
  const { email, role } = body;

  if (!email || !role || !(STAFF_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { error: "A valid email and role (property_admin, staff, or patrol_officer) are required." },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();

  // Look up user by email in profiles
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "No account found with that email address. The user must sign up before they can be added as staff." },
      { status: 404 }
    );
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from("property_members")
    .select("role")
    .eq("property_id", propertyId)
    .eq("user_id", profile.id)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: `This user is already a member of this property with the role: ${existing.role.replace(/_/g, " ")}.` },
      { status: 409 }
    );
  }

  const { error: insertError } = await (supabase as any)
    .from("property_members")
    .insert({ property_id: propertyId, user_id: profile.id, role });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    user_id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    role,
  });
}

// ─── PATCH: change a member's role ────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { propertyId } = await params;
  const body = await req.json() as { user_id?: string; role?: string };
  const { user_id, role } = body;

  if (!user_id || !role || !(STAFF_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { error: "A valid user_id and role are required." },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();

  const { error } = await (supabase as any)
    .from("property_members")
    .update({ role })
    .eq("property_id", propertyId)
    .eq("user_id", user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ─── DELETE: remove a member ──────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const { propertyId } = await params;
  const body = await req.json() as { user_id?: string };
  const { user_id } = body;

  if (!user_id) {
    return NextResponse.json({ error: "user_id is required." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("property_members")
    .delete()
    .eq("property_id", propertyId)
    .eq("user_id", user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
