import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface VehicleRow {
  plate: string;
  state?: string | null;
  make?: string | null;
  model?: string | null;
  color?: string | null;
  year?: number | string | null;
}

interface SkippedRow {
  plate: string;
  reason: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { propertyId?: string; rows?: VehicleRow[] };
    const { propertyId, rows } = body;

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Fetch existing active plates for this property
    const { data: existing, error: fetchError } = await supabase
      .from("vehicles")
      .select("plate")
      .eq("property_id", propertyId)
      .eq("is_active", true);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const existingPlates = new Set(
      (existing ?? []).map((v) => v.plate.toUpperCase().trim())
    );

    const toInsert: {
      property_id: string;
      plate: string;
      state: string | null;
      make: string | null;
      model: string | null;
      color: string | null;
      year: number | null;
      is_active: boolean;
    }[] = [];
    const skipped: SkippedRow[] = [];

    for (const row of rows) {
      const plate = row.plate?.toString().trim().toUpperCase();

      if (!plate) {
        skipped.push({ plate: "(empty)", reason: "Missing plate number" });
        continue;
      }

      if (existingPlates.has(plate)) {
        skipped.push({ plate, reason: `Plate "${plate}" already registered` });
        continue;
      }

      // Prevent duplicates within the uploaded file
      existingPlates.add(plate);

      // Validate year if provided
      let year: number | null = null;
      if (row.year != null && row.year !== "") {
        const yearNum = Number(row.year);
        if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 2) {
          skipped.push({ plate, reason: `Invalid year "${row.year}" for plate ${plate}` });
          continue;
        }
        year = Math.round(yearNum);
      }

      toInsert.push({
        property_id: propertyId,
        plate,
        state: row.state?.toString().trim() || null,
        make: row.make?.toString().trim() || null,
        model: row.model?.toString().trim() || null,
        color: row.color?.toString().trim() || null,
        year,
        is_active: true,
      });
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("vehicles").insert(toInsert);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      imported: toInsert.length,
      skipped: skipped.length,
      skipReasons: skipped,
    });
  } catch (err) {
    console.error("[import/vehicles]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
