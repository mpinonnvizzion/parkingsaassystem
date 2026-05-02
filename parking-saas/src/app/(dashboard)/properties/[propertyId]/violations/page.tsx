"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useProperty } from "@/contexts/property-context";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  tow_requested_by: string | null;
  towed_at: string | null;
  resolved_at: string | null;
  units: { unit_label: string } | null;
};

type ProfileInfo = {
  full_name: string | null;
  email: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ["super_admin", "org_admin", "property_admin", "staff"];

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

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["warning_issued", "tow_requested", "dismissed"],
  warning_issued: ["tow_requested", "dismissed"],
  tow_requested: ["towed", "dismissed"],
  towed: [],
  dismissed: [],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ViolationsPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const { user } = useAuth();
  const { role } = useProperty();
  const supabase = createClient();

  const isAdmin = !!(role && ADMIN_ROLES.includes(role as string));

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [plateFilter, setPlateFilter] = useState(""); // also serves as vehicle history view

  // ── Data state ───────────────────────────────────────────────────────────────
  const [violations, setViolations] = useState<ViolationRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [isLoading, setIsLoading] = useState(true);

  // ── Detail + action modals ───────────────────────────────────────────────────
  const [detailViolation, setDetailViolation] = useState<ViolationRow | null>(null);
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);
  const [towConfirm, setTowConfirm] = useState<{ id: string; plate: string } | null>(null);
  const [isTowConfirming, setIsTowConfirming] = useState(false);

  // ─── Load violations ─────────────────────────────────────────────────────────

  const loadViolations = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);

    let query = (supabase as any)
      .from("violations")
      .select("*, units(unit_label)")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (filterStatus !== "all") query = query.eq("status", filterStatus);
    if (filterDateFrom) query = query.gte("created_at", filterDateFrom);
    if (filterDateTo) query = query.lte("created_at", filterDateTo + "T23:59:59");
    if (plateFilter.trim()) query = query.ilike("plate", `%${plateFilter.trim()}%`);

    const { data, error } = await query;

    if (!error && data) {
      setViolations(data as ViolationRow[]);

      // Resolve logged_by UUIDs to profile names
      const ids = [...new Set<string>(
        (data as ViolationRow[])
          .map((v) => v.logged_by)
          .filter((id): id is string => !!id)
      )];

      if (ids.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);

        const map: Record<string, ProfileInfo> = {};
        for (const p of profileData ?? []) {
          map[p.id] = { full_name: p.full_name, email: p.email };
        }
        setProfiles(map);
      }
    }

    setIsLoading(false);
  }, [propertyId, filterStatus, filterDateFrom, filterDateTo, plateFilter, isAdmin, supabase]);

  useEffect(() => {
    loadViolations();
  }, [loadViolations]);

  // ─── Update violation status ──────────────────────────────────────────────────

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

  // ─── Confirm tow request ──────────────────────────────────────────────────────

  async function confirmTowRequest() {
    if (!towConfirm) return;
    setIsTowConfirming(true);
    await handleStatusChange(towConfirm.id, "tow_requested");
    if (detailViolation?.id === towConfirm.id) {
      setDetailViolation((v) =>
        v ? { ...v, status: "tow_requested", tow_requested_at: new Date().toISOString() } : v
      );
    }
    setTowConfirm(null);
    setIsTowConfirming(false);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function displayName(userId: string | null) {
    if (!userId) return "—";
    const p = profiles[userId];
    if (!p) return userId.slice(0, 8) + "…";
    return p.full_name ?? p.email;
  }

  function clearFilters() {
    setFilterStatus("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPlateFilter("");
  }

  const hasActiveFilters =
    filterStatus !== "all" || filterDateFrom || filterDateTo || plateFilter;

  // ─── Access guard ─────────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-gray-500">
          You do not have access to the violations log.
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
          <h1 className="text-xl font-bold text-gray-900">Violations</h1>
          <p className="text-sm text-gray-500 mt-1">
            All violations logged at this property
          </p>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-end gap-3">
        {/* Status */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            Status
          </label>
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
        </div>

        {/* Date from */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            From
          </label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Date to */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            To
          </label>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Plate search */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            Plate
          </label>
          <input
            type="text"
            value={plateFilter}
            onChange={(e) => setPlateFilter(e.target.value.toUpperCase())}
            placeholder="Search…"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 w-32 placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
          />
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 hover:text-gray-700 underline pb-1.5 transition-colors"
          >
            Clear filters
          </button>
        )}

        {!isLoading && (
          <span className="text-sm text-gray-400 ml-auto pb-1.5">
            {violations.length} result{violations.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Vehicle history banner */}
      {plateFilter && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-blue-700">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Showing violation history for plate{" "}
            <strong className="font-mono">{plateFilter}</strong>
          </span>
          <button
            onClick={() => setPlateFilter("")}
            className="ml-auto text-blue-500 hover:text-blue-700 font-medium transition-colors"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* ── Violations table ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading violations…</div>
      ) : violations.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-14 text-center">
          <div className="text-4xl mb-3">🛡️</div>
          <p className="font-medium text-gray-800">No violations found</p>
          <p className="text-sm text-gray-500 mt-1">
            {hasActiveFilters
              ? "Try adjusting or clearing your filters"
              : "No violations have been logged at this property yet"}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium underline transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Plate", "Unit", "Location", "Date", "Status", "Logged By", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {violations.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  {/* Plate — click to open detail; history icon to filter by plate */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDetailViolation(v)}
                        className="font-mono font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {v.plate}
                      </button>
                      <button
                        onClick={() => setPlateFilter(v.plate)}
                        title="View all violations for this plate"
                        className={`transition-colors ${
                          plateFilter === v.plate
                            ? "text-blue-500"
                            : "text-gray-300 hover:text-blue-400"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </div>
                    {v.notes && (
                      <p
                        className="text-xs text-gray-400 mt-0.5 max-w-[140px] truncate"
                        title={v.notes}
                      >
                        {v.notes}
                      </p>
                    )}
                  </td>

                  {/* Unit */}
                  <td className="px-4 py-3 text-gray-600">
                    {v.units?.unit_label ?? (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3 text-gray-600 max-w-[130px]">
                    <span className="truncate block" title={v.location ?? ""}>
                      {v.location ?? <span className="text-gray-400">—</span>}
                    </span>
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(v.created_at).toLocaleDateString()}
                    <p className="text-xs text-gray-400">
                      {new Date(v.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </td>

                  {/* Status badge */}
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

                  {/* Logged by */}
                  <td className="px-4 py-3 text-gray-600 max-w-[140px]">
                    <span className="truncate block text-xs" title={displayName(v.logged_by)}>
                      {displayName(v.logged_by)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {/* Dedicated tow request button */}
                      {(v.status === "open" || v.status === "warning_issued") && (
                        <button
                          onClick={() => setTowConfirm({ id: v.id, plate: v.plate })}
                          className="text-left text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors whitespace-nowrap"
                        >
                          🚛 Request Tow
                        </button>
                      )}

                      {/* Tow outcome buttons */}
                      {v.status === "tow_requested" && (
                        <>
                          <button
                            onClick={() => handleStatusChange(v.id, "towed")}
                            className="text-left text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors whitespace-nowrap"
                          >
                            ✓ Mark Towed
                          </button>
                          <button
                            onClick={() => handleStatusChange(v.id, "dismissed")}
                            className="text-left text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Dismiss
                          </button>
                        </>
                      )}

                      {/* Other transitions (excluding tow_requested) */}
                      {STATUS_TRANSITIONS[v.status]
                        ?.filter(
                          (s) =>
                            s !== "tow_requested" && v.status !== "tow_requested"
                        )
                        .length > 0 && (
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
                          {STATUS_TRANSITIONS[v.status]
                            .filter((s) => s !== "tow_requested")
                            .map((next) => (
                              <option key={next} value={next}>
                                → {STATUS_LABELS[next]}
                              </option>
                            ))}
                        </select>
                      )}

                      {!STATUS_TRANSITIONS[v.status]?.length && (
                        <span className="text-xs text-gray-400">Closed</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tow Confirmation Dialog ──────────────────────────────────────────────── */}
      {towConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isTowConfirming)
              setTowConfirm(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 mx-auto mb-4">
                <span className="text-2xl">🚛</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900 text-center">
                Request Tow for{" "}
                <span className="font-mono">{towConfirm.plate}</span>?
              </h2>
              <p className="text-sm text-gray-500 text-center mt-2">
                This will escalate the violation status to{" "}
                <strong>Tow Requested</strong> and record the timestamp and
                your user ID. Contact your towing company to arrange removal.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setTowConfirm(null)}
                disabled={isTowConfirming}
                className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmTowRequest}
                disabled={isTowConfirming}
                className="flex-1 bg-orange-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {isTowConfirming ? "Requesting…" : "Confirm Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Violation Detail Modal ───────────────────────────────────────────────── */}
      {detailViolation && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailViolation(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex items-start justify-between">
              <div>
                <span className="text-2xl font-mono font-black text-gray-900 tracking-widest">
                  {detailViolation.plate}
                </span>
                {detailViolation.units?.unit_label && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    Unit {detailViolation.units.unit_label}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                    STATUS_COLORS[detailViolation.status] ??
                    "bg-gray-50 text-gray-600 border-gray-200"
                  }`}
                >
                  {STATUS_LABELS[detailViolation.status] ?? detailViolation.status}
                </span>
                <button
                  onClick={() => setDetailViolation(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Meta row */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Logged by
                  </span>
                  <p className="text-gray-800 mt-0.5">
                    {displayName(detailViolation.logged_by)}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Date
                  </span>
                  <p className="text-gray-800 mt-0.5">
                    {new Date(detailViolation.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>

              {/* Location + Notes */}
              {(detailViolation.location || detailViolation.notes) && (
                <div className="space-y-3">
                  {detailViolation.location && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        Location
                      </p>
                      <p className="text-sm text-gray-800">{detailViolation.location}</p>
                    </div>
                  )}
                  {detailViolation.notes && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        Notes
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {detailViolation.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Photo */}
              {detailViolation.photo_url && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Photo Evidence
                  </p>
                  <button
                    onClick={() => setPhotoModalUrl(detailViolation.photo_url!)}
                    className="block w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={detailViolation.photo_url}
                      alt="Violation evidence"
                      className="w-full rounded-xl object-cover max-h-48 hover:opacity-90 transition-opacity"
                    />
                  </button>
                </div>
              )}

              {/* Timeline */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Timeline
                </p>
                <ol className="relative border-l-2 border-gray-200 ml-2 space-y-4">
                  <li className="ml-5">
                    <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-red-500 border-2 border-white" />
                    <p className="text-sm font-semibold text-gray-800">Violation logged</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(detailViolation.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </li>

                  {detailViolation.tow_requested_at && (
                    <li className="ml-5">
                      <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-orange-500 border-2 border-white" />
                      <p className="text-sm font-semibold text-gray-800">Tow requested</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(detailViolation.tow_requested_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {detailViolation.tow_requested_by && (
                          <span className="ml-1.5">
                            by {displayName(detailViolation.tow_requested_by)}
                          </span>
                        )}
                      </p>
                    </li>
                  )}

                  {detailViolation.towed_at && (
                    <li className="ml-5">
                      <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-gray-500 border-2 border-white" />
                      <p className="text-sm font-semibold text-gray-800">Vehicle towed</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(detailViolation.towed_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </li>
                  )}

                  {detailViolation.resolved_at &&
                    detailViolation.status === "dismissed" && (
                      <li className="ml-5">
                        <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-gray-300 border-2 border-white" />
                        <p className="text-sm font-semibold text-gray-500">Dismissed</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(detailViolation.resolved_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </li>
                    )}
                </ol>
              </div>

              {/* Actions */}
              {STATUS_TRANSITIONS[detailViolation.status]?.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Actions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(detailViolation.status === "open" ||
                      detailViolation.status === "warning_issued") && (
                      <button
                        onClick={() => {
                          setDetailViolation(null);
                          setTowConfirm({
                            id: detailViolation.id,
                            plate: detailViolation.plate,
                          });
                        }}
                        className="bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-orange-700 transition-colors"
                      >
                        🚛 Request Tow
                      </button>
                    )}
                    {detailViolation.status === "tow_requested" && (
                      <button
                        onClick={async () => {
                          await handleStatusChange(detailViolation.id, "towed");
                          setDetailViolation((v) =>
                            v
                              ? { ...v, status: "towed", towed_at: new Date().toISOString() }
                              : v
                          );
                        }}
                        className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-900 transition-colors"
                      >
                        ✓ Mark Towed
                      </button>
                    )}
                    {STATUS_TRANSITIONS[detailViolation.status]
                      .filter((s) => s !== "tow_requested" && s !== "towed")
                      .map((next) => (
                        <button
                          key={next}
                          onClick={async () => {
                            await handleStatusChange(detailViolation.id, next);
                            setDetailViolation((v) =>
                              v
                                ? {
                                    ...v,
                                    status: next,
                                    resolved_at:
                                      next === "dismissed"
                                        ? new Date().toISOString()
                                        : v.resolved_at,
                                  }
                                : v
                            );
                          }}
                          className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                          {STATUS_LABELS[next]}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* View full history for this plate */}
              <div className="border-t border-gray-100 pt-4">
                <button
                  onClick={() => {
                    setDetailViolation(null);
                    setPlateFilter(detailViolation.plate);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  View all violations for {detailViolation.plate}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo viewer modal ───────────────────────────────────────────────────── */}
      {photoModalUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPhotoModalUrl(null)}
        >
          <div
            className="relative max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
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
