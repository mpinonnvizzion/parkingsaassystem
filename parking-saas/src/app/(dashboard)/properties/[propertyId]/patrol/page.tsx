"use client";

import { useRef, useState } from "react";
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

type LogForm = {
  plate: string;
  location: string;
  notes: string;
  photo: File | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ENFORCEMENT_ROLES = [
  "super_admin",
  "org_admin",
  "property_admin",
  "staff",
  "patrol_officer",
];

function statusConfig(result: LookupResult): {
  label: string;
  sublabel: string;
  bg: string;
  text: string;
  icon: string;
  needsAction: boolean;
} {
  if (result.permit) {
    const expiry = result.permit.valid_to
      ? new Date(result.permit.valid_to).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    return {
      label: "Valid Permit",
      sublabel: expiry ? `Expires ${expiry}` : "No expiry",
      bg: "bg-green-500",
      text: "text-white",
      icon: "✓",
      needsAction: false,
    };
  }
  if (result.registered) {
    return {
      label: "Registered — No Active Permit",
      sublabel: "Permit may have expired",
      bg: "bg-yellow-500",
      text: "text-white",
      icon: "⚠",
      needsAction: true,
    };
  }
  if (result.is_guest) {
    return {
      label: "Guest Vehicle — No Active Permit",
      sublabel: "Guest permit expired or revoked",
      bg: "bg-orange-500",
      text: "text-white",
      icon: "⚠",
      needsAction: true,
    };
  }
  return {
    label: "Not Registered",
    sublabel: "Vehicle has no record at this property",
    bg: "bg-red-500",
    text: "text-white",
    icon: "✕",
    needsAction: true,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PatrolPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const { user } = useAuth();
  const { role, currentProperty } = useProperty();
  const supabase = createClient();

  const isEnforcement = !!(role && ENFORCEMENT_ROLES.includes(role as string));

  // ── Lookup state ─────────────────────────────────────────────────────────────
  const [plateInput, setPlateInput] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Violation modal state ────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logForm, setLogForm] = useState<LogForm>({
    plate: "",
    location: "",
    notes: "",
    photo: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Lookup ───────────────────────────────────────────────────────────────────

  async function handleLookup() {
    const plate = plateInput.trim().toUpperCase();
    if (!plate) return;

    setIsLookingUp(true);
    setLookupError(null);
    setResult(null);

    const { data, error } = await (supabase.rpc as any)(
      "lookup_plate_for_enforcement",
      { p_property_id: propertyId, p_plate: plate }
    );

    if (error) {
      setLookupError("Lookup failed. Please try again.");
    } else {
      setResult(data as LookupResult);
    }
    setIsLookingUp(false);
  }

  function handleClear() {
    setResult(null);
    setPlateInput("");
    setLookupError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ── Log violation ─────────────────────────────────────────────────────────────

  function openModal() {
    setLogForm({
      plate: result?.plate ?? plateInput.trim().toUpperCase(),
      location: "",
      notes: "",
      photo: null,
    });
    setSubmitError(null);
    setSubmitSuccess(false);
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    if (!logForm.plate.trim()) {
      setSubmitError("Plate is required.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    let photoUrl: string | null = null;

    if (logForm.photo) {
      const ext = logForm.photo.name.split(".").pop() ?? "jpg";
      const path = `${propertyId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

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
      unit_id: result?.unit?.id ?? null,
      plate: logForm.plate.toUpperCase().trim(),
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

    setSubmitSuccess(true);
    setIsSubmitting(false);

    // Auto-close after showing success, then refresh result to show updated count
    setTimeout(async () => {
      setIsModalOpen(false);
      // Re-run lookup to refresh violation count
      const { data } = await (supabase.rpc as any)(
        "lookup_plate_for_enforcement",
        { p_property_id: propertyId, p_plate: logForm.plate }
      );
      if (data) setResult(data as LookupResult);
    }, 1200);
  }

  // ─── Access guard ─────────────────────────────────────────────────────────────

  if (!isEnforcement) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-gray-500">
          You do not have access to patrol tools.
        </p>
      </div>
    );
  }

  const status = result ? statusConfig(result) : null;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto">
      {/* Property name — helpful context on mobile */}
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
        {currentProperty?.name ?? "Patrol"}
      </p>

      {/* ── Plate input ───────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-4">
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          value={plateInput}
          onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          placeholder="ABC 1234"
          className="flex-1 border-2 border-gray-300 rounded-2xl px-5 py-4 text-3xl font-mono font-bold uppercase tracking-widest text-center focus:outline-none focus:border-blue-500 transition-colors placeholder:text-gray-200 placeholder:text-2xl"
        />
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={handleLookup}
          disabled={isLookingUp || !plateInput.trim()}
          className="flex-1 bg-blue-600 text-white rounded-2xl py-4 text-lg font-bold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 transition-colors"
        >
          {isLookingUp ? "Looking up…" : "Search"}
        </button>
        {result && (
          <button
            onClick={handleClear}
            className="px-5 bg-gray-100 text-gray-600 rounded-2xl font-semibold hover:bg-gray-200 active:bg-gray-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {lookupError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
          {lookupError}
        </div>
      )}

      {/* ── Result card ───────────────────────────────────────────────────────── */}
      {result && status && (
        <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200">
          {/* Status banner */}
          <div className={`${status.bg} px-5 py-4`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`${status.text} text-xl font-black flex items-center gap-2`}>
                  <span>{status.icon}</span>
                  <span>{status.label}</span>
                </div>
                <p className={`${status.text} text-sm opacity-80 mt-0.5`}>
                  {status.sublabel}
                </p>
              </div>
              <span className="text-white text-3xl font-mono font-black opacity-20">
                {result.plate}
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="bg-white px-5 py-4 space-y-3">

            {/* Plate */}
            <div className="flex items-baseline justify-between border-b border-gray-100 pb-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Plate
              </span>
              <span className="text-2xl font-mono font-black text-gray-900 tracking-widest">
                {result.plate}
              </span>
            </div>

            {/* Vehicle */}
            <div className="flex items-start justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-0.5">
                Vehicle
              </span>
              <span className="text-sm font-medium text-gray-800 text-right">
                {result.vehicle
                  ? [
                      result.vehicle.color,
                      result.vehicle.year,
                      result.vehicle.make,
                      result.vehicle.model,
                    ]
                      .filter(Boolean)
                      .join(" ") || "On file — no details"
                  : "Not on file"}
              </span>
            </div>

            {/* Unit */}
            <div className="flex items-start justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-0.5">
                Unit
              </span>
              <span className="text-sm font-medium text-gray-800">
                {result.unit ? result.unit.unit_label : "—"}
              </span>
            </div>

            {/* Permit */}
            <div className="flex items-start justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-0.5">
                Permit
              </span>
              <span className="text-sm font-medium text-gray-800 text-right">
                {result.permit ? (
                  <>
                    <span className="capitalize">{result.permit.type}</span>
                    {result.permit.valid_to && (
                      <span className="block text-xs text-gray-500">
                        Until{" "}
                        {new Date(result.permit.valid_to).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400">None</span>
                )}
              </span>
            </div>

            {/* Prior violations */}
            {result.violation_count > 0 && (
              <div
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 mt-1 ${
                  result.violation_count >= 3
                    ? "bg-red-50 text-red-700"
                    : "bg-yellow-50 text-yellow-700"
                }`}
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-semibold">
                  {result.violation_count} prior violation
                  {result.violation_count !== 1 ? "s" : ""}
                  {result.violation_count >= 3 && " — repeat offender"}
                </span>
              </div>
            )}

            {/* Log violation CTA */}
            {status.needsAction && (
              <button
                onClick={openModal}
                className="w-full mt-2 bg-red-600 text-white rounded-2xl py-4 text-base font-black hover:bg-red-700 active:bg-red-800 transition-colors"
              >
                Log Violation
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Log Violation Modal ────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting)
              setIsModalOpen(false);
          }}
        >
          {/* Sheet slides up from bottom on mobile, centered on desktop */}
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl">
            <div className="p-6 border-b border-gray-100">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4 sm:hidden" />
              <h2 className="text-lg font-bold text-gray-900">Log Violation</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Recording violation for{" "}
                <span className="font-mono font-bold">{logForm.plate}</span>
              </p>
            </div>

            <div className="p-6 space-y-4">
              {submitSuccess ? (
                <div className="text-center py-6">
                  <div className="text-5xl mb-3">✅</div>
                  <p className="font-bold text-gray-900 text-lg">
                    Violation logged
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Closing…</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Location
                    </label>
                    <input
                      type="text"
                      value={logForm.location}
                      onChange={(e) =>
                        setLogForm((f) => ({ ...f, location: e.target.value }))
                      }
                      placeholder="e.g. Level 2, Row B, Spot 14"
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Notes
                    </label>
                    <textarea
                      value={logForm.notes}
                      onChange={(e) =>
                        setLogForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      rows={3}
                      placeholder="Any details about this violation…"
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Photo{" "}
                      <span className="text-gray-400 font-normal">
                        (optional)
                      </span>
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
                      className={`w-full border-2 border-dashed rounded-xl py-4 text-sm font-medium transition-colors ${
                        logForm.photo
                          ? "border-green-400 bg-green-50 text-green-700"
                          : "border-gray-300 text-gray-500 hover:border-gray-400"
                      }`}
                    >
                      {logForm.photo ? (
                        <>📷 {logForm.photo.name}</>
                      ) : (
                        "📷 Take photo or choose file"
                      )}
                    </button>
                  </div>

                  {submitError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                      {submitError}
                    </p>
                  )}
                </>
              )}
            </div>

            {!submitSuccess && (
              <div className="px-6 pb-8 flex gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="flex-1 border border-gray-300 rounded-2xl py-4 text-base font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 bg-red-600 text-white rounded-2xl py-4 text-base font-black hover:bg-red-700 active:bg-red-800 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? "Saving…" : "Log It"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
