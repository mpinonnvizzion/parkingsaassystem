import { NextRequest, NextResponse } from "next/server";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone } = body as { phone?: string };

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // Normalize to E.164
    const digits = phone.replace(/\D/g, "");
    const normalized = phone.startsWith("+") ? `+${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;

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
