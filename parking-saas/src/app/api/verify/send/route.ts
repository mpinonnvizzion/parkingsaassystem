import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const { phone } = body as { phone?: string };

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // Normalize: ensure E.164 format (e.g. +15551234567)
    const normalized = phone.startsWith("+") ? phone : `+1${phone.replace(/\D/g, "")}`;

    // Send OTP via Twilio Verify
    const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
    const res = await fetch(
      `https://verify.twilio.com/v2/Services/${VERIFY_SID}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: normalized, Channel: "sms" }),
      }
    );

    const data = await res.json() as { status?: string; message?: string };

    if (!res.ok) {
      return NextResponse.json({ error: data.message ?? "Failed to send verification" }, { status: 400 });
    }

    return NextResponse.json({ success: true, status: data.status });
  } catch (err) {
    console.error("[verify/send]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
