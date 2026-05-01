"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useProperty } from "@/contexts/property-context";

// ─── Types ────────────────────────────────────────────────────────────────────

type LookupResult = {
  plate: string;
  registered: boolean;
  is_guest: boolean;
  vehicle: {
    id: string;
    make: string | null;
    model: string | null;
    color: string | null;
    year: number | null;
  } | null;
  unit: {
    id: string;
    unit_label: string;
  } | null;
  permit: {
    id: string;
    type: string;
    status: string;
    valid_to: string | null;
  } | null;
  violation_count: number;
};

type ViolationRow = {
  id: string;
  plate: string;
  location: string | null;
  notes: string | null;
  status: string;
  photo_url: string | null;
  logged_by: string | null;
  created_at: string;
  unit_id: string | null;
  vehicle_id: string | null;
  tow_requested_at: string | null;
  towed_at: string | null;
  resolved_at: string | null;
  units: { unit_label: string } | null;
};

type LogForm = {
  plate: string;
  unit_id: string;
  location: string;
  notes: string;
  photo: File | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ["super_admin", "org_admin", "property_admin", "staff"];
const ENFORCEMENT_ROLES = [...ADMIN_ROLES, "patrol_officer"];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  warning_issued: "Warning Issued",
  tow_requested: "Tow Requested",
  towed: "Towed",
  dismissed: "Dismissed",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-50 text-red-700 border-red-200",
  warning_issued: "bg-yellow-50 text-yellow-700 border-yellow-200",
  tow_requested: "bg-orange-50 text-orange-700 border-orange-200",
  towed: "bg-gray-50 text-gray-600 border-gray-200",
  dismissed: "bg-gray-50 text-gray-400 border-gray-200",
};

// Status transitions — what statuses can a violation move to from its current state
const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["warning_issued", "tow_requested", "dismissed"],
  warning_issued: ["tow_requested", "dismissed"],
  tow_requested: ["towed", "dismissed"],
  towed: [],
  dismissed: [],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnforcementPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const { user } = useAuth();
  const { role } = useProperty();
  const supabase = createClient();

  const isAdmin = !!(role && ADMIN_ROLES.includes(role));
  const isEnforcement = !!(role && ENFORCEMENT_ROLES.includes(role));

  // Tab state — admins default to violations list, patrol defaults to lookup
  const [activeTab, setActiveTab] = useState<"lookup" | "violations">(
    isAdmin ? "violations" : "lookup"
  );

  // ── Plate lookup state ──────────────────────────────────────────────────────
  const [plateInput, setPlateInput] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // ── Violations list state ───────────────────────────────────────────────────
  const [violations, setViolations] = useState<ViolationRow[]>([]);
  const [isLoadingViolations, setIsLoadingViolations] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // ── Log violation modal state ───────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logForm, setLogForm] = useState<LogForm>({
    plate: "",
    unit_id: "",
    location: "",
    notes: "",
    photo: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Photo detail modal ──────────────────────────────────────────────────────
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);

  // ─── Load violations ────────────────────────────────────────────────────────

  const loadViolations = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingViolations(true);

    let query = (supabase as any)
      .from("violations")
      .select("*, units(unit_label)")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (filterStatus !== "all") {
      query = query.eq("status", filterStatus);
    }

    const { data, error } = await query;
    if (!error && data) setViolations(data as ViolationRow[]);
    setIsLoadingViolations(false);
  }, [propertyId, filterStatus, isAdmin, supabase]);

  useEffect(() => {
    if (isAdmin) loadViolations();
  }, [loadViolations, isAdmin]);

  // ─── Plate lookup ───────────────────────────────────────────────────────────

  async function handleLookup() {
    const plate = plateInput.trim().toUpperCase();
    if (!plate) return;
    setIsLookingUp(true);
    setLookupError(null);
    setLookupResult(null);

    const { data, error } = await (supabase.rpc as any)(
      "lookup_plate_for_enforcement",
      { p_property_id: propertyId, p_plate: plate }
    );

    if (error) {
      setLookupError("Lookup failed: " + error.message);
    } else {
      setLookupResult(data as LookupResult);
    }
    setIsLookingUp(false);
  }

  // ─── Open log modal ─────────────────────────────────────────────────────────

  function openLogModal(prefillPlate?: string, prefillUnitId?: string) {
    setLogForm({
      plate: prefillPlate ?? lookupResult?.plate ?? "",
      unit_id: prefillUnitId ?? lookupResult?.unit?.id ?? "",
      location: "",
      notes: "",
      photo: null,
    });
    setSubmitError(null);
    setIsModalOpen(true);
  }

  // ─── Submit violation ───────────────────────────────────────────────────────

  async function handleSubmitViolation() {
    const plate = logForm.plate.trim().toUpperCase();
    if (!plate) {
      setSubmitError("License plate is required.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    let photoUrl: string | null = null;

    if (logForm.photo) {
      const ext = logForm.photo.name.split(".").pop() ?? "jpg";
      const path = `${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("violation-photos")
        .upload(path, logForm.photo);

      if (uploadError) {
        setSubmitError("Photo upload failed: " + uploadError.message);
        setIsSubmitting(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("violation-photos")
        .getPublicUrl(path);
      photoUrl = urlData.publicUrl;
    }

    const { error } = await (supabase as any).from("violations").insert({
      property_id: propertyId,
      unit_id: logForm.unit_id || null,
      plate,
      location: logForm.location.trim() || null,
      notes: logForm.notes.trim() || null,
      photo_url: photoUrl,
      logged_by: user?.id,
      status: "open",
    });

    if (error) {
      setSubmitError("Failed to log violation: " + error.message);
      setIsSubmitting(false);
      return;
    }

    setIsModalOpen(false);
    setLookupResult(null);
    setPlateInput("");
    if (isAdmin) loadViolations();
    setIsSubmitting(false);
  }

  // ─── Update violation status ─────────────────────────────────────────────────

  async function handleStatusChange(violationId: string, newStatus: string) {
    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === "tow_requested") {
      update.tow_requested_at = new Date().toISOString();
      update.tow_requested_by = user?.id;
    }
    if (newStatus === "towed") update.towed_at = new Date().toISOString();
    if (newStatus === "dismissed") update.resolved_at = new Date().toISOString();

    await (supabase as any)
      .from("violations")
      .update(update)
      .eq("id", violationId)
      .eq("property_id", propertyId);

    loadViolations();
  }

  // ─── Access guard ────────────────────────────────────────────────────────────

  if (!isEnforcement) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-gray-500">
          You do not have access to enforcement tools.
        </p>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Enforcement</h1>
          <p className="text-sm text-gray-500 mt-1">
            Plate lookup and violation tracking
          </p>
        </div>
        <button
          onClick={() => openLogModal()}
          className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700 transition-colors"
        >
          + Log Violation
        </button>
      </div>

      {/* Tabs (admins only — patrol officers only see plate lookup) */}
      {isAdmin && (
        <div className="flex border-b border-gray-200 mb-6">
          {(["lookup", "violations"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "lookup" ? "Plate Lookup" : "Violations"}
            </button>
          ))}
        </div>
      )}

      {/* ── Plate Lookup ──────────────────────────────────────────────────────── */}
      {(activeTab === "lookup" || !isAdmin) && (
        <div className="max-w-lg">
          <div className="flex gap-3">
            <input
              type="text"
              value={plateInput}
              onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="Enter license plate…"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-xl font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 placeholder:text-base placeholder:tracking-normal placeholder:font-sans"
            />
            <button
              onClick={handleLookup}
              disabled={isLookingUp || !plateInput.trim()}
              className="bg-blue-600 text-white rounded-lg px-6 font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isLookingUp ? "…" : "Lookup"}
            </button>
          </div>

          {lookupError && (
            <p className="mt-3 text-sm text-red-600">{lookupError}</p>
          )}

          {/* Lookup result card */}
          {lookupResult && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Status banner */}
              <div
                className={`px-5 py-3 flex items-center justify-between ${
                  lookupResult.permit
                    ? "bg-green-50 border-b border-green-100"
                    : "bg-red-50 border-b border-red-100"
                }`}
              >
                <span className="text-2xl font-mono font-bold tracking-widest text-gray-900">
                  {lookupResult.plate}
                </span>
                <span
                  className={`text-xs font-bold uppercase tracking-wide ${
                    lookupResult.permit
                      ? "text-green-700"
                      : "text-red-700"
                  }`}
                >
                  {lookupResult.permit
                    ? "✓ Valid Permit"
                    : lookupResult.is_guest
                    ? "⚠ Guest — No Active Permit"
                    : lookupResult.registered
                    ? "⚠ Registered — No Active Permit"
                    : "✕ Not Registered"}
                </span>
              </div>

              <div className="px-5 py-4 space-y-3">
                {/* Vehicle details */}
                {lookupResult.vehicle ? (
                  <div className="text-sm text-gray-700">
                    <span className="font-medium text-gray-500 mr-1.5">Vehicle</span>
                    {[
                      lookupResult.vehicle.color,
                      lookupResult.vehicle.year,
                      lookupResult.vehicle.make,
                      lookupResult.vehicle.model,
                    ]
                      .filter(Boolean)
                      .join(" ") || "Details not on file"}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">
                    Vehicle not registered at this property
                  </div>
                )}

                {/* Unit */}
                {lookupResult.unit && (
                  <div className="text-sm text-gray-700">
                    <span className="font-medium text-gray-500 mr-1.5">Unit</span>
                    {lookupResult.unit.unit_label}
                  </div>
                )}

                {/* Permit */}
                {lookupResult.permit && (
                  <div className="text-sm text-gray-700">
                    <span className="font-medium text-gray-500 mr-1.5">Permit</span>
                    <span className="capitalize">{lookupResult.permit.type}</span>
                    {lookupResult.permit.valid_to && (
                      <span className="text-gray-500">
                        {" "}— valid until{" "}
                        {new Date(lookupResult.permit.valid_to).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Prior violations */}
                {lookupResult.violation_count > 0 && (
                  <div
                    className={`flex items-center gap-1.5 text-sm font-medium ${
                      lookupResult.violation_count >= 3
                        ? "text-red-600"
                        : "text-yellow-600"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {lookupResult.violation_count} prior violation
                    {lookupResult.violation_count !== 1 ? "s" : ""} on record
                    {lookupResult.violation_count >= 3 && " — repeat offender"}
                  </div>
                )}

                {/* Log violation CTA */}
                {!lookupResult.permit && (
                  <button
                    onClick={() =>
                      openLogModal(lookupResult.plate, lookupResult.unit?.id)
                    }
                    className="w-full mt-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-red-700 transition-colors"
                  >
                    Log Violation for {lookupResult.plate}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Violations Dashboard ───────────────────────────────────────────────── */}
      {activeTab === "violations" && isAdmin && (
        <div>
          {/* Filter bar */}
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm font-medium text-gray-600">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
            {!isLoadingViolations && (
              <span className="text-sm text-gray-400 ml-auto">
                {violations.length} result{violations.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {isLoadingViolations ? (
            <div className="text-sm text-gray-500">Loading violations…</div>
          ) : violations.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-14 text-center">
              <div className="text-4xl mb-3">🛡️</div>
              <p className="font-medium text-gray-800">No violations found</p>
              <p className="text-sm text-gray-500 mt-1">
                {filterStatus !== "all"
                  ? "Try a different status filter"
                  : "No violations have been logged at this property yet"}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {[
                      "Plate",
                      "Unit",
                      "Location",
                      "Date",
                      "Status",
                      "Photo",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {violations.map((v) => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-gray-900">
                          {v.plate}
                        </span>
                        {v.notes && (
                          <p
                            className="text-xs text-gray-400 mt-0.5 max-w-[140px] truncate"
                            title={v.notes}
                          >
                            {v.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {v.units?.unit_label ?? (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[130px]">
                        <span className="truncate block" title={v.location ?? ""}>
                          {v.location ?? (
                            <span className="text-gray-400">—</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(v.created_at).toLocaleDateString()}
                        <p className="text-xs text-gray-400">
                          {new Date(v.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                            STATUS_COLORS[v.status] ??
                            "bg-gray-50 text-gray-600 border-gray-200"
                          }`}
                        >
                          {STATUS_LABELS[v.status] ?? v.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {v.photo_url ? (
                          <button
                            onClick={() => setPhotoModalUrl(v.photo_url!)}
                            className="text-blue-600 hover:text-blue-700 text-xs font-medium underline"
                          >
                            View
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {STATUS_TRANSITIONS[v.status]?.length > 0 ? (
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleStatusChange(v.id, e.target.value);
                                e.target.value = "";
                              }
                            }}
                            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="" disabled>
                              Update…
                            </option>
                            {STATUS_TRANSITIONS[v.status].map((next) => (
                              <option key={next} value={next}>
                                → {STATUS_LABELS[next]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-400">Closed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Log Violation Modal ────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Log Violation</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Record an unauthorized or non-compliant vehicle
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Plate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  License Plate{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={logForm.plate}
                  onChange={(e) =>
                    setLogForm((f) => ({
                      ...f,
                      plate: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="ABC123"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 font-mono uppercase tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={logForm.location}
                  onChange={(e) =>
                    setLogForm((f) => ({ ...f, location: e.target.value }))
                  }
                  placeholder="e.g. Level 2, Row B, Spot 14"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={logForm.notes}
                  onChange={(e) =>
                    setLogForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={3}
                  placeholder="Any additional details about this violation…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Photo upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Photo Evidence{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) =>
                    setLogForm((f) => ({
                      ...f,
                      photo: e.target.files?.[0] ?? null,
                    }))
                  }
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-lg py-3 text-sm transition-colors ${
                    logForm.photo
                      ? "border-green-400 bg-green-50 text-green-700"
                      : "border-gray-300 text-gray-500 hover:border-gray-400"
                  }`}
                >
                  {logForm.photo ? (
                    <>📷 {logForm.photo.name}</>
                  ) : (
                    "Tap to take photo or choose a file"
                  )}
                </button>
              </div>

              {submitError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {submitError}
                </p>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitViolation}
                disabled={isSubmitting || !logForm.plate.trim()}
                className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Logging…" : "Log Violation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo viewer modal ──────────────────────────────────────────────────── */}
      {photoModalUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPhotoModalUrl(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPhotoModalUrl(null)}
              className="absolute -top-10 right-0 text-white text-sm font-medium hover:text-gray-300 transition-colors"
            >
              Close ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoModalUrl}
              alt="Violation evidence"
              className="w-full rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
