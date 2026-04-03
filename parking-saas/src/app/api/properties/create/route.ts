import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// This route is superseded by the create_property RPC called directly from the client.
// Kept as a server-side alternative for non-browser clients.
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, address1, city, state, zip, timezone } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data: propertyId, error } = await supabase.rpc("create_property", {
    p_name: name.trim(),
    p_address1: address1?.trim() || null,
    p_city: city?.trim() || null,
    p_state: state?.trim() || null,
    p_zip: zip?.trim() || null,
    p_timezone: timezone || "America/Chicago",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ propertyId });
}
