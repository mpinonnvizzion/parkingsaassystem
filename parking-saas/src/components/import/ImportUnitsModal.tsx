"use client";

import { useState, useCallback, useRef } from "react";
import { Modal } from "@/components/ui/modal";

// ─── CSV / XLSX Parser ────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      fields.push(current); current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
  );
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i]?.trim() ?? ""; });
    return row;
  });
}

async function parseFile(file: File): Promise<Record<string, string>[]> {
  const isExcel =
    file.name.endsWith(".xlsx") ||
    file.name.endsWith(".xls") ||
    file.type.includes("spreadsheetml") ||
    file.type.includes("excel");

  if (isExcel) {
    try {
      // Dynamic import — works after `npm install xlsx`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = await import("xlsx" as string) as any;
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (raw.length < 2) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headers = raw[0].map((h: any) =>
        String(h ?? "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return raw.slice(1)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any[]) => row.some((c: any) => c != null && c !== ""))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any[]) => {
          const obj: Record<string, string> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          headers.forEach((h: string, i: number) => { obj[h] = String(row[i] ?? "").trim(); });
          return obj;
        });
    } catch {
      throw new Error(
        'Excel parsing requires the xlsx package. Run "npm install xlsx" in your project, or save your file as CSV and upload that instead.'
      );
    }
  }

  const text = await file.text();
  return parseCSV(text);
}

// ─── Column normalisation ─────────────────────────────────────────────────────

const UNIT_LABEL_KEYS = ["unit_label", "unit", "label", "apt", "apartment", "unit_number", "unitlabel", "unitnumber", "unit#"];
const BUILDING_KEYS   = ["building", "bldg", "bld", "building_name"];
const FLOOR_KEYS      = ["floor", "fl", "story", "storey"];
const MAX_VEH_KEYS    = ["max_vehicles", "max_cars", "vehicles", "max_vehicle", "vehicle_limit", "maxvehicles", "max"];

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return "";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedUnit {
  _row: number;
  unit_label: string;
  building: string | null;
  floor: number | null;
  max_vehicles: number;
  _error?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  skipReasons: { unit_label: string; reason: string }[];
}

type Step = "idle" | "preview" | "importing" | "done";

interface Props {
  propertyId: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

// ─── Template download ────────────────────────────────────────────────────────

function downloadTemplate() {
  const csv = "unit_label,building,floor,max_vehicles\n101,A,1,2\n102,A,1,2\n201,B,2,1\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "units_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ImportUnitsModal({ propertyId, isOpen, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [rows, setRows] = useState<ParsedUnit[]>([]);
  const [parseError, setParseError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("idle");
    setRows([]);
    setParseError("");
    setResult(null);
    setImportError("");
    setIsDragging(false);
  }

  function handleClose() {
    if (step === "done") onComplete();
    reset();
    onClose();
  }

  async function processFile(file: File) {
    setParseError("");
    try {
      const raw = await parseFile(file);
      if (raw.length === 0) {
        setParseError("No data rows found. Make sure the file has a header row and at least one data row.");
        return;
      }

      const parsed: ParsedUnit[] = raw.map((row, i) => {
        const unit_label = pick(row, UNIT_LABEL_KEYS).trim();
        const buildingRaw = pick(row, BUILDING_KEYS).trim();
        const floorRaw = pick(row, FLOOR_KEYS).trim();
        const maxVehRaw = pick(row, MAX_VEH_KEYS).trim();

        let _error: string | undefined;
        if (!unit_label) _error = "Missing unit label";

        const floor = floorRaw !== "" && !isNaN(Number(floorRaw)) ? Math.round(Number(floorRaw)) : null;
        const max_vehicles =
          maxVehRaw !== "" && !isNaN(Number(maxVehRaw)) && Number(maxVehRaw) > 0
            ? Math.round(Number(maxVehRaw))
            : 2;

        return {
          _row: i + 2,
          unit_label,
          building: buildingRaw || null,
          floor,
          max_vehicles,
          _error,
        };
      });

      // Flag intra-file duplicates
      const seen = new Set<string>();
      for (const row of parsed) {
        if (!row._error && row.unit_label) {
          const key = row.unit_label.toLowerCase();
          if (seen.has(key)) {
            row._error = `Duplicate unit label "${row.unit_label}" in file`;
          } else {
            seen.add(key);
          }
        }
      }

      setRows(parsed);
      setStep("preview");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse file");
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const validRows = rows.filter((r) => !r._error);
  const invalidRows = rows.filter((r) => r._error);

  async function handleImport() {
    if (validRows.length === 0) return;
    setStep("importing");
    setImportError("");
    try {
      const res = await fetch("/api/import/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          rows: validRows.map(({ unit_label, building, floor, max_vehicles }) => ({
            unit_label, building, floor, max_vehicles,
          })),
        }),
      });
      const data = await res.json() as { error?: string; imported?: number; skipped?: number; skipReasons?: { unit_label: string; reason: string }[] };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult({
        imported: data.imported ?? 0,
        skipped: (data.skipped ?? 0) + invalidRows.length,
        skipReasons: [
          ...(data.skipReasons ?? []),
          ...invalidRows.map((r) => ({ unit_label: r.unit_label || "(empty)", reason: r._error! })),
        ],
      });
      setStep("done");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
      setStep("preview");
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Units">
      <div className="p-1">
        {/* ── Idle: drop zone ── */}
        {step === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Upload a CSV or Excel file to bulk-create units. Columns:{" "}
              <span className="font-mono text-xs bg-gray-100 px-1 rounded">unit_label</span>{" "}
              (required),{" "}
              <span className="font-mono text-xs bg-gray-100 px-1 rounded">building</span>,{" "}
              <span className="font-mono text-xs bg-gray-100 px-1 rounded">floor</span>,{" "}
              <span className="font-mono text-xs bg-gray-100 px-1 rounded">max_vehicles</span>.
            </p>

            <button
              onClick={downloadTemplate}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              ↓ Download CSV template
            </button>

            {parseError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {parseError}
              </div>
            )}

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              }`}
            >
              <div className="text-3xl mb-2">📁</div>
              <p className="text-sm font-medium text-gray-700">
                Drop your file here, or{" "}
                <span className="text-blue-600">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">.csv or .xlsx</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          </div>
        )}

        {/* ── Preview ── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 rounded-full px-3 py-1 font-medium">
                ✓ {validRows.length} ready to import
              </span>
              {invalidRows.length > 0 && (
                <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 rounded-full px-3 py-1 font-medium">
                  ✗ {invalidRows.length} will be skipped
                </span>
              )}
            </div>

            {importError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {importError}
              </div>
            )}

            <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-500 w-6">Row</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Unit Label</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Building</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Floor</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Max Vehicles</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row._row}
                      className={`border-b border-gray-100 last:border-0 ${
                        row._error ? "bg-red-50" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-gray-400">{row._row}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {row.unit_label || <span className="text-gray-400 italic">empty</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{row.building ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{row.floor ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{row.max_vehicles}</td>
                      <td className="px-3 py-2">
                        {row._error ? (
                          <span className="text-red-600 font-medium" title={row._error}>
                            ✗ {row._error}
                          </span>
                        ) : (
                          <span className="text-green-600 font-medium">✓ OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={reset}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import {validRows.length} unit{validRows.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        )}

        {/* ── Importing ── */}
        {step === "importing" && (
          <div className="py-12 text-center space-y-3">
            <div className="inline-block w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600">Importing units…</p>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && result && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-4xl mb-2">✅</div>
              <h3 className="text-base font-semibold text-gray-900">Import complete</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{result.imported}</p>
                <p className="text-xs text-green-600 mt-1">Units imported</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
                <p className="text-xs text-gray-500 mt-1">Rows skipped</p>
              </div>
            </div>

            {result.skipReasons.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">
                  View skipped rows ({result.skipReasons.length})
                </summary>
                <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {result.skipReasons.map((s, i) => (
                    <li key={i} className="text-red-600">
                      <span className="font-medium">{s.unit_label}</span>: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <button
              onClick={handleClose}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
