"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EnforcementPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const supabase = createClient();
  const [isExporting, setIsExporting] = useState(false);

  async function handleExportCSV() {
    setIsExporting(true);
    const { data } = await supabase
      .from("vehicles")
      .select("plate, state, make, model, color, year")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .order("plate");

    if (data) {
      const headers = ["Plate", "State", "Make", "Model", "Color", "Year"];
      const rows = data.map((v) =>
        [v.plate, v.state, v.make, v.model, v.color, v.year].join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `valid-plates-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setIsExporting(false);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Enforcement</h1>
        <p className="text-sm text-gray-500 mt-1">Export valid plates and view scan history</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-2">Export Valid Plates</h2>
          <p className="text-sm text-gray-500 mb-4">
            Download a CSV of all currently registered and active vehicle plates.
          </p>
          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isExporting ? "Exporting..." : "Download CSV"}
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-2">QR Scanner</h2>
          <p className="text-sm text-gray-500 mb-4">
            Scan a vehicle QR code to verify its parking permit status.
          </p>
          <p className="text-xs text-gray-400">
            Coming soon — use your phone camera to scan QR codes
          </p>
        </div>
      </div>
    </div>
  );
}
