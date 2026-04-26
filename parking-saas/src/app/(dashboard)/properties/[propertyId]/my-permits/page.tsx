"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProperty } from "@/contexts/property-context";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "@/components/ui/modal";

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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const statusColor: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  expired: "bg-gray-50 text-gray-500 border-gray-200",
  revoked: "bg-red-50 text-red-700 border-red-200",
};

type MyVehicle = { id: string; plate: string; make: string | null; color: string | null };
type MyUnit = { id: string; unit_label: string; max_vehicles: number; active_permits: number };

export default function MyPermitsPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const { currentProperty } = useProperty();

  // Guest parking settings — read from property, default to enabled / 24h if not set.
  // guestParkingEnabled gates the "Invite a guest" button (task 868jd9c5a).
  // defaultGuestHours pre-fills the duration picker in the guest invite modal.
  const propertySettings = (currentProperty?.settings ?? {}) as Record<string, string>;
  const guestParkingEnabled = propertySettings.guest_parking_enabled !== "false";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const defaultGuestHours = parseInt(propertySettings.default_guest_hours ?? "24", 10);

  const [permits, setPermits] = useState<MyPermit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedQr, setExpandedQr] = useState<string | null>(null);
  const supabase = createClient();

  // Permit creation state
  const [modalOpen, setModalOpen] = useState(false);
  const [myVehicles, setMyVehicles] = useState<MyVehicle[]>([]);
  const [myUnits, setMyUnits] = useState<MyUnit[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  async function loadPermits() {
    const { data, error } = await supabase.rpc("get_my_permits", {
      p_property_id: propertyId,
    });
    if (!error && data) setPermits(data as MyPermit[]);
    setIsLoading(false);
  }

  useEffect(() => {
    loadPermits();
  }, [propertyId]);

  async function openCreateModal() {
    setCreateError("");
    setSelectedVehicle("");
    setSelectedUnit("");

    // Load resident's own vehicles and units in parallel
    const [{ data: vehicles }, { data: units }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, plate, make, color")
        .eq("property_id", propertyId)
        .eq("is_active", true),
      supabase.rpc("get_my_units", { p_property_id: propertyId }),
    ]);

    const unitList = (units as { id: string; unit_label: string }[]) ?? [];

    // Enrich units with max_vehicles limit and current active permit count
    if (unitList.length > 0) {
      const unitIds = unitList.map((u) => u.id);
      const [{ data: unitDetails }, { data: activePermits }] = await Promise.all([
        supabase.from("units").select("id, max_vehicles").in("id", unitIds),
        supabase
          .from("permits")
          .select("unit_id")
          .in("unit_id", unitIds)
          .eq("property_id", propertyId)
          .eq("status", "active")
          .eq("type", "resident"),
      ]);

      const maxMap = Object.fromEntries(
        (unitDetails ?? []).map((u) => [u.id, u.max_vehicles as number])
      );
      const countMap: Record<string, number> = {};
      for (const p of activePermits ?? []) {
        if (p.unit_id) countMap[p.unit_id] = (countMap[p.unit_id] ?? 0) + 1;
      }

      const enriched: MyUnit[] = unitList.map((u) => ({
        ...u,
        max_vehicles: maxMap[u.id] ?? 2,
        active_permits: countMap[u.id] ?? 0,
      }));
      setMyUnits(enriched);
      if (enriched.length === 1) setSelectedUnit(enriched[0].id);
    } else {
      setMyUnits([]);
    }

    setMyVehicles((vehicles as MyVehicle[]) ?? []);
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
        p_vehicle_id: selectedVehicle,
        p_unit_id: selectedUnit || undefined,
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

  async function handleRevokePermit(permitId: string) {
    if (!window.confirm("Revoke this permit? Your parking spot will no longer be valid.")) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("resident_revoke_permit", { p_permit_id: permitId });
      if (error) throw error;
      await loadPermits();
    } catch (err: unknown) {
      alert((err as { message?: string })?.message ?? "Failed to revoke permit");
    }
  }

  // Limit enforcement: find the unit currently selected in the modal
  const selectedUnitInfo = myUnits.find((u) => u.id === selectedUnit);
  const isAtLimit =
    selectedUnitInfo != null &&
    selectedUnitInfo.active_permits >= selectedUnitInfo.max_vehicles;

  const activePermits = permits.filter((p) => p.status === "active");
  const otherPermits = permits.filter((p) => p.status !== "active");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Permits</h1>
          <p className="text-sm text-gray-500 mt-1">Your active parking permits and QR codes</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Invite a Guest button — rendered by task 868jd9c5a, hidden when guest parking is disabled */}
          {guestParkingEnabled && null /* placeholder for InviteGuestButton */}
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Get permit
          </button>
        </div>
      </div>

      {/* Create permit modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Get a parking permit</h2>
          <p className="text-sm text-gray-500 mb-4">Select the vehicle you want to register for parking.</p>

          {createError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{createError}</div>
          )}

          {/* At-limit warning */}
          {isAtLimit && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <p className="font-medium">Vehicle limit reached</p>
              <p className="mt-0.5">
                Unit {selectedUnitInfo?.unit_label} allows{" "}
                {selectedUnitInfo?.max_vehicles} vehicle{selectedUnitInfo?.max_vehicles !== 1 ? "s" : ""} and already has{" "}
                {selectedUnitInfo?.active_permits} active permit{selectedUnitInfo?.active_permits !== 1 ? "s" : ""}.
                Contact your property manager to increase the limit.
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
                <select
                  value={selectedVehicle}
                  onChange={(e) => setSelectedVehicle(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
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
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select unit</option>
                  {myUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      Unit {u.unit_label}
                      {u.active_permits >= u.max_vehicles ? " — limit reached" : ` — ${u.active_permits}/${u.max_vehicles} permits`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Permit usage indicator (shown when a single unit or unit is selected) */}
            {selectedUnitInfo && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                  <span>Unit {selectedUnitInfo.unit_label} — permits used</span>
                  <span className={`font-semibold ${isAtLimit ? "text-red-600" : "text-gray-700"}`}>
                    {selectedUnitInfo.active_permits} / {selectedUnitInfo.max_vehicles}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${isAtLimit ? "bg-red-500" : "bg-blue-500"}`}
                    style={{
                      width: `${Math.min(
                        100,
                        (selectedUnitInfo.active_permits / selectedUnitInfo.max_vehicles) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating || !selectedVehicle || myVehicles.length === 0 || isAtLimit}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? "Creating..." : "Get permit"}
              </button>
            </div>
          </form>
        </div>
      </Modal>

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
          <p className="text-sm text-gray-400 mt-1">Click <strong>Get permit</strong> above to register your vehicle for parking.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active permits */}
          {activePermits.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Active
              </h2>
              <div className="space-y-4">
                {activePermits.map((permit) => (
                  <PermitCard
                    key={permit.id}
                    permit={permit}
                    expandedQr={expandedQr}
                    onToggleQr={setExpandedQr}
                    onRevoke={handleRevokePermit}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Past permits */}
          {otherPermits.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Past
              </h2>
              <div className="space-y-4">
                {otherPermits.map((permit) => (
                  <PermitCard
                    key={permit.id}
                    permit={permit}
                    expandedQr={expandedQr}
                    onToggleQr={setExpandedQr}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

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
  const scanUrl = permit.qr_token
    ? `${APP_URL}/scan/${permit.qr_token}`
    : null;
  const isExpanded = expandedQr === permit.id;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Status badge + type */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${
                  statusColor[permit.status] ?? ""
                }`}
              >
                {permit.status}
              </span>
              <span className="text-xs text-gray-400 capitalize">{permit.type} permit</span>
            </div>

            {/* Vehicle */}
            {permit.plate && (
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span className="font-mono font-semibold text-gray-900">{permit.plate}</span>
                {(permit.color || permit.make || permit.model) && (
                  <span className="text-sm text-gray-500">
                    — {[permit.color, permit.make, permit.model].filter(Boolean).join(" ")}
                  </span>
                )}
              </div>
            )}

            {/* Visitor */}
            {permit.type === "visitor" && permit.visitor_name && (
              <div className="text-sm text-gray-600 mb-1">
                Visitor: <span className="font-medium">{permit.visitor_name}</span>
              </div>
            )}

            {/* Unit */}
            {permit.unit_label && (
              <div className="text-sm text-gray-500 mb-1">Unit {permit.unit_label}</div>
            )}

            {/* Dates */}
            <div className="text-xs text-gray-400 mt-2">
              {permit.valid_from && (
                <span>From {new Date(permit.valid_from).toLocaleDateString()}</span>
              )}
              {permit.valid_to && (
                <span>
                  {permit.valid_from ? " · " : ""}
                  Expires {new Date(permit.valid_to).toLocaleDateString()}
                </span>
              )}
              {!permit.valid_from && !permit.valid_to && (
                <span>No expiry</span>
              )}
            </div>
          </div>

          {/* Actions: QR toggle + revoke */}
          {permit.status === "active" && (
            <div className="shrink-0 flex flex-col items-center gap-2">
              {scanUrl && (
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
                  className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                  title="Revoke this permit"
                >
                  Revoke
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded QR Code */}
      {isExpanded && scanUrl && (
        <div className="border-t border-gray-100 bg-gray-50 p-6 flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <QRCodeSVG
              value={scanUrl}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">Scan to verify permit</p>
            <p className="text-xs text-gray-400 mt-0.5 font-mono break-all max-w-xs">
              {scanUrl}
            </p>
          </div>
          <a
            href={scanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Open scan page →
          </a>
        </div>
      )}
    </div>
  );
}
