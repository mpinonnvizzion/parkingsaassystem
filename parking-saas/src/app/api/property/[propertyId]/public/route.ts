import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Public endpoint — returns just the property name and address so the
// unauthenticated /claim page can show which property the resident is
// registering for. No sensitive data is exposed.
export async function GET(
  _req: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  const { propertyId } = params;

  if (!propertyId) {
    return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("properties")
    .select("name, address1, city, state")
    .eq("id", propertyId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  return NextResponse.json({
    name: data.name,
    address: [data.address1, data.city, data.state].filter(Boolean).join(", ") || null,
  });
}
