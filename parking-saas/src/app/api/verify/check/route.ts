import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, code, userId } = body as { phone?: string; code?: string; userId?: string };

    if (!phone || !code) {
      return NextResponse.json({ error: "Phone and code are required" }, { status: 400 });
    }

    // Normalize to E.164 (same logic as send route)
    const digits = phone.replace(/\D/g, "");
    const normalized = phone.startsWith("+") ? `+${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;

    // Check OTP via Twilio Verify
    const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
    const res = await fetch(
      `https://verify.twilio.com/v2/Services/${VERIFY_SID}/VerificationCheck`,
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

    if (res.status === 404) {
      console.error("[verify/check] Twilio verification check not found", {
        status: res.status,
        message: data.message,
      });

      return NextResponse.json(
        { error: "Code expired or not found. Please tap 'Resend code' to get a new one." },
        { status: 400 }
      );
    }

    if (!res.ok || data.status !== "approved") {
      console.error("[verify/check] Twilio verification check failed", {
        status: res.status,
        verificationStatus: data.status,
        message: data.message,
      });

      return NextResponse.json(
        { error: data.message ?? "Incorrect code. Please try again." },
        { status: 400 }
      );
    }

    // Save verified phone to the user's profile (if userId provided)
    if (userId) {
      const serviceSupabase = createServiceRoleClient();
      const { error: updateError } = await serviceSupabase
        .from("profiles")
        .update({ phone: normalized })
        .eq("id", userId);

      if (updateError) {
        console.error("[verify/check] profile update error", updateError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[verify/check]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
