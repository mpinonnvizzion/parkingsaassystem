"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProperty } from "@/contexts/property-context";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "@/components/ui/modal";

// ─── Types ────────────────────────────────────────────────────────────────────

type MyPermit = {
  id: string;
  type: string;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  visitor_name: string | null;
  notes: string | null;
  qr_token: string | null;
  credential_id: string | null;
  plate: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  unit_label: string | null;
};

type MyVehicle = { id: string; plate: string; make: string | null; color: string | null };

type MyUnit = {
  id: string;
  unit_label: string;
  max_vehicles: number;
  active_permits: number;
  max_guest_vehicles: number;
  active_guest_permits: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const statusColor: Record<string, string> = {
  active:  "bg-green-50 text-green-700 border-green-200",
  expired: "bg-gray-50 text-gray-500 border-gray-200",
  revoked: "bg-red-50 text-red-700 border-red-200",
};

function timeRemaining(validTo: string): string {
  const diff = new Date(validTo).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const totalMins = Math.floor(diff / 60_000);
  const hours     = Math.floor(totalMins / 60);
  const mins      = totalMins % 60;
  if (hours >= 48) return `Expires in ${Math.floor(hours / 24)} days`;
  if (hours > 0)   return `Expires in ${hours}h ${mins}m`;
  return `Expires in ${mins}m`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyPermitsPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const { currentProperty } = useProperty();
  const supabase = createClient();

  // Property-level guest parking settings
  const propertySettings = (currentProperty?.settings ?? {}) as Record<string, string>;
  const guestParkingEnabled  = propertySettings.guest_parking_enabled !== "false";
  const defaultGuestHours    = parseInt(propertySettings.default_guest_hours ?? "24", 10);

  // ── Permits list ────────────────────────────────────────────────────────────
  const [permits, setPermits]     = useState<MyPermit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedQr, setExpandedQr] = useState<string | null>(null);

  async function loadPermits() {
    const { data, error } = await supabase.rpc("get_my_permits", { p_property_id: propertyId });
    if (!error && data) setPermits(data as MyPermit[]);
    setIsLoading(false);
  }

  useEffect(() => { loadPermits(); }, [propertyId]);

  // ── Shared unit loader ──────────────────────────────────────────────────────
  async function loadMyUnits(): Promise<MyUnit[]> {
    const { data: units } = await supabase.rpc("get_my_units", { p_property_id: propertyId });
    const unitList = (units as { id: string; unit_label: string }[]) ?? [];
    if (unitList.length === 0) return [];

    const unitIds = unitList.map((u) => u.id);
    const [{ data: unitDetails }, { data: residentPerms }, { data: guestPerms }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("units") as any).select("id, max_vehicles, max_guest_vehicles").in("id", unitIds),
      supabase.from("permits").select("unit_id").in("unit_id", unitIds).eq("property_id", propertyId).eq("status", "active").eq("type", "resident"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("permits") as any).select("unit_id").in("unit_id", unitIds).eq("property_id", propertyId).eq("status", "active").eq("type", "guest"),
    ]);

    type UnitDetail = { id: string; max_vehicles: number; max_guest_vehicles?: number };
    const detailMap = Object.fromEntries(
      (unitDetails ?? []).map((u: UnitDetail) => [u.id, u])
    );
    const residentCount: Record<string, number> = {};
    for (const p of residentPerms ?? []) {
      if (p.unit_id) residentCount[p.unit_id] = (residentCount[p.unit_id] ?? 0) + 1;
    }
    const guestCount: Record<string, number> = {};
    for (const p of guestPerms ?? []) {
      if (p.unit_id) guestCount[p.unit_id] = (guestCount[p.unit_id] ?? 0) + 1;
    }

    return unitList.map((u) => ({
      ...u,
      max_vehicles:         detailMap[u.id]?.max_vehicles         ?? 2,
      active_permits:       residentCount[u.id]                   ?? 0,
      max_guest_vehicles:   detailMap[u.id]?.max_guest_vehicles   ?? 1,
      active_guest_permits: guestCount[u.id]                      ?? 0,
    }));
  }

  // ── Resident permit modal ───────────────────────────────────────────────────
  const [modalOpen, setModalOpen]         = useState(false);
  const [myVehicles, setMyVehicles]       = useState<MyVehicle[]>([]);
  const [myUnits, setMyUnits]             = useState<MyUnit[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedUnit, setSelectedUnit]   = useState("");
  const [createError, setCreateError]     = useState("");
  const [isCreating, setIsCreating]       = useState(false);

  async function openCreateModal() {
    setCreateError("");
    setSelectedVehicle("");
    setSelectedUnit("");
    const [{ data: vehicles }, units] = await Promise.all([
      supabase.from("vehicles").select("id, plate, make, color").eq("property_id", propertyId).eq("is_active", true),
      loadMyUnits(),
    ]);
    setMyVehicles((vehicles as MyVehicle[]) ?? []);
    setMyUnits(units);
    if (units.length === 1) setSelectedUnit(units[0].id);
    setModalOpen(true);
  }

  async function handleCreatePermit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVehicle) return;
    setCreateError("");
    setIsCreating(true);
    try {
      const { error } = await supabase.rpc("resident_create_permit", {
        p_property_id: propertyId,
        p_vehicle_id:  selectedVehicle,
        p_unit_id:     selectedUnit || undefined,
      });
      if (error) throw error;
      setModalOpen(false);
      setIsLoading(true);
      await loadPermits();
    } catch (err: unknown) {
      setCreateError((err as { message?: string })?.message ?? "Failed to create permit");
    } finally {
      setIsCreating(false);
    }
  }

  const selectedUnitInfo = myUnits.find((u) => u.id === selectedUnit);
  const isAtLimit = selectedUnitInfo != null && selectedUnitInfo.active_permits >= selectedUnitInfo.max_vehicles;

  // ── Guest invite modal ──────────────────────────────────────────────────────
  const [guestModalOpen, setGuestModalOpen]   = useState(false);
  const [guestUnits, setGuestUnits]           = useState<MyUnit[]>([]);
  const [guestUnit, setGuestUnit]             = useState("");
  const [guestPlate, setGuestPlate]           = useState("");
  const [guestName, setGuestName]             = useState("");
  const [guestDuration, setGuestDuration]     = useState(defaultGuestHours.toString());
  const [guestError, setGuestError]           = useState("");
  const [isInviting, setIsInviting]           = useState(false);

  async function openGuestModal() {
    setGuestError("");
    setGuestPlate("");
    setGuestName("");
    setGuestDuration(defaultGuestHours.toString());
    setGuestUnit("");
    const units = await loadMyUnits();
    setGuestUnits(units);
    if (units.length === 1) setGuestUnit(units[0].id);
    setGuestModalOpen(true);
  }

  async function handleCreateGuestPermit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestPlate.trim()) { setGuestError("Guest plate is required"); return; }
    if (!guestUnit)          { setGuestError("Please select a unit");    return; }
    setGuestError("");
    setIsInviting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("resident_create_guest_permit", {
        p_property_id:    propertyId,
        p_unit_id:        guestUnit,
        p_plate:          guestPlate.trim().toUpperCase(),
        p_guest_name:     guestName.trim() || null,
        p_duration_hours: parseInt(guestDuration, 10),
      });
      if (error) throw error;
      setGuestModalOpen(false);
      setIsLoading(true);
      await loadPermits();
    } catch (err: unknown) {
      setGuestError((err as { message?: string })?.message ?? "Failed to create guest permit");
    } finally {
      setIsInviting(false);
    }
  }

  const selectedGuestUnit = guestUnits.find((u) => u.id === guestUnit);
  const isGuestAtLimit    = selectedGuestUnit != null && selectedGuestUnit.active_guest_permits >= selectedGuestUnit.max_guest_vehicles;
  const isGuestBlocked    = selectedGuestUnit != null && selectedGuestUnit.max_guest_vehicles === 0;

  // ── Revoke (shared for both permit types) ───────────────────────────────────
  async function handleRevokePermit(permitId: string) {
    if (!window.confirm("Revoke this permit? It will no longer be valid for parking.")) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("resident_revoke_permit", { p_permit_id: permitId });
      if (error) throw error;
      await loadPermits();
    } catch (err: unknown) {
      alert((err as { message?: string })?.message ?? "Failed to revoke permit");
    }
  }

  // ── Permit buckets ──────────────────────────────────────────────────────────
  const activeResidentPermits = permits.filter((p) => p.status === "active" && p.type === "resident");
  const activeGuestPermits    = permits.filter((p) => p.status === "active" && p.type === "guest");
  const pastPermits           = permits.filter((p) => p.status !== "active");
  const hasAnyActive          = activeResidentPermits.length > 0 || activeGuestPermits.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Permits</h1>
          <p className="text-sm text-gray-500 mt-1">Your active parking permits and QR codes</p>
        </div>
        <div className="flex items-center gap-2">
          {guestParkingEnabled && (
            <button
              onClick={openGuestModal}
              className="border border-purple-300 text-purple-700 bg-purple-50 rounded-lg px-4 py-2 text-sm font-medium hover:bg-purple-100 transition-colors"
            >
              + Invite a guest
            </button>
          )}
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Get permit
          </button>
        </div>
      </div>

      {/* ── Resident permit modal ── */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Get a parking permit</h2>
          <p className="text-sm text-gray-500 mb-4">Select the vehicle you want to register for parking.</p>

          {createError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{createError}</div>
          )}

          {isAtLimit && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <p className="font-medium">Vehicle limit reached</p>
              <p className="mt-0.5">
                Unit {selectedUnitInfo?.unit_label} allows {selectedUnitInfo?.max_vehicles} vehicle{selectedUnitInfo?.max_vehicles !== 1 ? "s" : ""} and already has {selectedUnitInfo?.active_permits} active permit{selectedUnitInfo?.active_permits !== 1 ? "s" : ""}. Contact your property manager to increase the limit.
              </p>
            </div>
          )}

          <form onSubmit={handleCreatePermit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle <span className="text-red-500">*</span></label>
              {myVehicles.length === 0 ? (
                <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  No vehicles registered. Go to <strong>Vehicles</strong> to add one first.
                </p>
              ) : (
                <select value={selectedVehicle} onChange={(e) => setSelectedVehicle(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select a vehicle</option>
                  {myVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate}{v.color || v.make ? ` — ${[v.color, v.make].filter(Boolean).join(" ")}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {myUnits.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <select value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select unit</option>
                  {myUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      Unit {u.unit_label}{u.active_permits >= u.max_vehicles ? " — limit reached" : ` — ${u.active_permits}/${u.max_vehicles} permits`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedUnitInfo && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                  <span>Unit {selectedUnitInfo.unit_label} — permits used</span>
                  <span className={`font-semibold ${isAtLimit ? "text-red-600" : "text-gray-700"}`}>
                    {selectedUnitInfo.active_permits} / {selectedUnitInfo.max_vehicles}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${isAtLimit ? "bg-red-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(100, (selectedUnitInfo.active_permits / selectedUnitInfo.max_vehicles) * 100)}%` }} />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={isCreating || !selectedVehicle || myVehicles.length === 0 || isAtLimit}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {isCreating ? "Creating..." : "Get permit"}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* ── Guest invite modal ── */}
      <Modal isOpen={guestModalOpen} onClose={() => setGuestModalOpen(false)}>
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Invite a guest</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Create a temporary parking permit for a visitor. No account needed for your guest.
          </p>

          {guestError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{guestError}</div>
          )}

          {/* Unit selector — only shown if resident belongs to multiple units */}
          {guestUnits.length > 1 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit <span className="text-red-500">*</span></label>
              <select value={guestUnit} onChange={(e) => setGuestUnit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="">Select unit</option>
                {guestUnits.map((u) => (
                  <option key={u.id} value={u.id} disabled={u.max_guest_vehicles === 0}>
                    Unit {u.unit_label}
                    {u.max_guest_vehicles === 0
                      ? " — guests not allowed"
                      : ` — ${u.active_guest_permits}/${u.max_guest_vehicles} guest permits`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Guest slot indicator */}
          {selectedGuestUnit && !isGuestBlocked && (
            <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between text-xs text-purple-700 mb-1.5">
                <span>Unit {selectedGuestUnit.unit_label} — guest slots used</span>
                <span className={`font-semibold ${isGuestAtLimit ? "text-red-600" : "text-purple-700"}`}>
                  {selectedGuestUnit.active_guest_permits} / {selectedGuestUnit.max_guest_vehicles}
                </span>
              </div>
              <div className="w-full bg-purple-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${isGuestAtLimit ? "bg-red-500" : "bg-purple-500"}`}
                  style={{ width: `${Math.min(100, (selectedGuestUnit.active_guest_permits / selectedGuestUnit.max_guest_vehicles) * 100)}%` }} />
              </div>
            </div>
          )}

          {isGuestBlocked && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              Guest parking is not allowed for this unit. Contact your property manager.
            </div>
          )}

          {isGuestAtLimit && !isGuestBlocked && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <p className="font-medium">Guest limit reached</p>
              <p className="mt-0.5">
                You must revoke an active guest permit before inviting a new guest.
              </p>
            </div>
          )}

          <form onSubmit={handleCreateGuestPermit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest plate <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={guestPlate}
                onChange={(e) => setGuestPlate(e.target.value.toUpperCase())}
                placeholder="e.g. ABC1234"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest name <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
              <select
                value={guestDuration}
                onChange={(e) => setGuestDuration(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
                <option value="72">72 hours</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Permit expires automatically. You can also revoke it early.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setGuestModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isInviting || !guestPlate.trim() || !guestUnit || isGuestAtLimit || isGuestBlocked}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isInviting ? "Creating..." : "Invite guest"}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* ── Permits list ── */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : permits.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium">No permits yet</p>
          <p className="text-sm text-gray-400 mt-1">Click <strong>Get permit</strong> to register your vehicle for parking.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active resident permits */}
          {activeResidentPermits.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Active</h2>
              <div className="space-y-4">
                {activeResidentPermits.map((permit) => (
                  <PermitCard key={permit.id} permit={permit} expandedQr={expandedQr} onToggleQr={setExpandedQr} onRevoke={handleRevokePermit} />
                ))}
              </div>
            </section>
          )}

          {/* Active guest permits */}
          {activeGuestPermits.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Guest Permits</h2>
              <div className="space-y-4">
                {activeGuestPermits.map((permit) => (
                  <PermitCard key={permit.id} permit={permit} expandedQr={expandedQr} onToggleQr={setExpandedQr} onRevoke={handleRevokePermit} />
                ))}
              </div>
            </section>
          )}

          {/* Empty active state with sections hint */}
          {!hasAnyActive && pastPermits.length > 0 && (
            <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-sm text-gray-500">No active permits. Your past permits are listed below.</p>
            </div>
          )}

          {/* Past permits */}
          {pastPermits.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Past</h2>
              <div className="space-y-4">
                {pastPermits.map((permit) => (
                  <PermitCard key={permit.id} permit={permit} expandedQr={expandedQr} onToggleQr={setExpandedQr} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PermitCard ───────────────────────────────────────────────────────────────

function PermitCard({
  permit,
  expandedQr,
  onToggleQr,
  onRevoke,
}: {
  permit: MyPermit;
  expandedQr: string | null;
  onToggleQr: (id: string | null) => void;
  onRevoke?: (id: string) => void;
}) {
  const scanUrl   = permit.qr_token ? `${APP_URL}/scan/${permit.qr_token}` : null;
  const isExpanded = expandedQr === permit.id;
  const isGuest   = permit.type === "guest";

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${isGuest ? "border-purple-200" : "border-gray-200"}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Status badge + type */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${statusColor[permit.status] ?? ""}`}>
                {permit.status}
              </span>
              <span className={`text-xs font-medium capitalize ${isGuest ? "text-purple-600" : "text-gray-400"}`}>
                {isGuest ? "Guest permit" : `${permit.type} permit`}
              </span>
            </div>

            {/* Vehicle plate */}
            {permit.plate && (
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span className="font-mono font-semibold text-gray-900">{permit.plate}</span>
                {(permit.color || permit.make || permit.model) && (
                  <span className="text-sm text-gray-500">— {[permit.color, permit.make, permit.model].filter(Boolean).join(" ")}</span>
                )}
              </div>
            )}

            {/* Guest name */}
            {isGuest && permit.visitor_name && (
              <div className="text-sm text-purple-700 mb-1 font-medium">
                Guest: {permit.visitor_name}
              </div>
            )}

            {/* Visitor name (admin-created visitor permits) */}
            {permit.type === "visitor" && permit.visitor_name && (
              <div className="text-sm text-gray-600 mb-1">
                Visitor: <span className="font-medium">{permit.visitor_name}</span>
              </div>
            )}

            {/* Unit */}
            {permit.unit_label && (
              <div className="text-sm text-gray-500 mb-1">Unit {permit.unit_label}</div>
            )}

            {/* Dates / time remaining */}
            <div className="text-xs text-gray-400 mt-2">
              {isGuest && permit.status === "active" && permit.valid_to ? (
                <span className={`font-medium ${
                  new Date(permit.valid_to).getTime() - Date.now() < 3 * 60 * 60 * 1000
                    ? "text-red-500"
                    : "text-purple-600"
                }`}>
                  {timeRemaining(permit.valid_to)}
                </span>
              ) : (
                <>
                  {permit.valid_from && <span>From {new Date(permit.valid_from).toLocaleDateString()}</span>}
                  {permit.valid_to && (
                    <span>{permit.valid_from ? " · " : ""}Expires {new Date(permit.valid_to).toLocaleDateString()}</span>
                  )}
                  {!permit.valid_from && !permit.valid_to && <span>No expiry</span>}
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          {permit.status === "active" && (
            <div className="shrink-0 flex flex-col items-center gap-2">
              {scanUrl && !isGuest && (
                <button
                  onClick={() => onToggleQr(isExpanded ? null : permit.id)}
                  className="flex flex-col items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors"
                  title="Show QR code"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                    />
                  </svg>
                  <span className="text-xs font-medium">QR Code</span>
                </button>
              )}
              {onRevoke && (
                <button
                  onClick={() => onRevoke(permit.id)}
                  className={`text-xs font-medium transition-colors ${
                    isGuest
                      ? "text-purple-500 hover:text-purple-700"
                      : "text-red-500 hover:text-red-700"
                  }`}
                  title="Revoke this permit"
                >
                  Revoke
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded QR (resident permits only) */}
      {isExpanded && scanUrl && !isGuest && (
        <div className="border-t border-gray-100 bg-gray-50 p-6 flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <QRCodeSVG value={scanUrl} size={200} level="M" includeMargin={false} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">Scan to verify permit</p>
            <p className="text-xs text-gray-400 mt-0.5 font-mono break-all max-w-xs">{scanUrl}</p>
          </div>
          <a href={scanUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
            Open scan page →
          </a>
        </div>
      )}
    </div>
  );
}
