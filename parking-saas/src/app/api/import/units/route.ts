import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface UnitRow {
  unit_label: string;
  building?: string | null;
  floor?: number | null;
  max_vehicles?: number;
  max_guest_vehicles?: number;
}

interface SkippedRow {
  unit_label: string;
  reason: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { propertyId?: string; rows?: UnitRow[]; defaultMaxGuestVehicles?: number };
    const { propertyId, rows, defaultMaxGuestVehicles = 2 } = body;

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Fetch existing unit_labels for this property
    const { data: existing, error: fetchError } = await supabase
      .from("units")
      .select("unit_label")
      .eq("property_id", propertyId);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const existingLabels = new Set(
      (existing ?? []).map((u) => u.unit_label.toLowerCase().trim())
    );

    const toInsert: {
      property_id: string;
      unit_label: string;
      building: string | null;
      floor: number | null;
      max_vehicles: number;
      max_guest_vehicles: number;
    }[] = [];
    const skipped: SkippedRow[] = [];

    for (const row of rows) {
      const label = row.unit_label?.toString().trim();

      if (!label) {
        skipped.push({ unit_label: "(empty)", reason: "Missing unit_label" });
        continue;
      }

      if (existingLabels.has(label.toLowerCase())) {
        skipped.push({ unit_label: label, reason: `Unit "${label}" already exists` });
        continue;
      }

      // Prevent duplicates within the uploaded file
      existingLabels.add(label.toLowerCase());

      const maxVehicles =
        row.max_vehicles != null && !isNaN(Number(row.max_vehicles))
          ? Math.max(1, Math.round(Number(row.max_vehicles)))
          : 2;

      const maxGuestVehicles =
        row.max_guest_vehicles != null && !isNaN(Number(row.max_guest_vehicles))
          ? Math.max(0, Math.round(Number(row.max_guest_vehicles)))
          : defaultMaxGuestVehicles;

      const floorVal = row.floor;
      const floor =
        floorVal != null && !isNaN(Number(floorVal))
          ? Math.round(Number(floorVal))
          : null;

      toInsert.push({
        property_id: propertyId,
        unit_label: label,
        building: row.building?.toString().trim() || null,
        floor,
        max_vehicles: maxVehicles,
        max_guest_vehicles: maxGuestVehicles,
      });
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("units").insert(toInsert);
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
    console.error("[import/units]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
