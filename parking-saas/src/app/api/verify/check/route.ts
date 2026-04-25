import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

export async function POST(req: NextRequest) {
  try {
    // Must be authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { phone, code } = body as { phone?: string; code?: string };

    if (!phone || !code) {
      return NextResponse.json({ error: "Phone and code are required" }, { status: 400 });
    }

    const normalized = phone.startsWith("+") ? phone : `+1${phone.replace(/\D/g, "")}`;

    // Check OTP via Twilio Verify
    const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
    const res = await fetch(
      `https://verify.twilio.com/v2/Services/${VERIFY_SID}/VerificationChecks`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: normalized, Code: code }),
      }
    );

    const data = await res.json() as { status?: string; valid?: boolean; message?: string };

    if (!res.ok || data.status !== "approved") {
      return NextResponse.json(
        { error: data.message ?? "Incorrect code. Please try again." },
        { status: 400 }
      );
    }

    // Save verified phone number to the user's profile using service role
    // (profiles table may have RLS that blocks self-update — service role is safe here)
    const serviceSupabase = createServiceRoleClient();
    const { error: updateError } = await serviceSupabase
      .from("profiles")
      .update({ phone: normalized })
      .eq("id", user.id);

    if (updateError) {
      console.error("[verify/check] profile update error", updateError);
      // Still return success — phone was verified, profile update is best-effort
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[verify/check]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
