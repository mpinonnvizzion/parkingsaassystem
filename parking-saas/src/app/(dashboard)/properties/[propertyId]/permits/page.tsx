"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Modal } from "@/components/ui/modal";

type PermitRow = {
  id: string;
  type: string;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  visitor_name: string | null;
  created_at: string;
  vehicles: { plate: string; make: string | null; color: string | null } | null;
  units: { unit_label: string } | null;
};

type Vehicle = {
  id: string;
  plate: string;
};

type Unit = {
  id: string;
  unit_label: string;
};

type FormData = {
  type: "resident" | "visitor" | "";
  vehicle_id: string;
  unit_id: string;
  valid_from: string;
  valid_to: string;
  visitor_name: string;
  notes: string;
};

export default function PermitsPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const { user } = useAuth();
  const [permits, setPermits] = useState<PermitRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    type: "",
    vehicle_id: "",
    unit_id: "",
    valid_from: "",
    valid_to: "",
    visitor_name: "",
    notes: "",
  });
  const supabase = createClient();

  // Load permits
  useEffect(() => {
    async function loadPermits() {
      const { data, error } = await supabase
        .from("permits")
        .select(
          "id, type, status, valid_from, valid_to, visitor_name, created_at, vehicles(plate, make, color), units(unit_label)"
        )
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (!error && data) setPermits(data as unknown as PermitRow[]);
      setIsLoading(false);
    }
    loadPermits();
  }, [propertyId, supabase]);

  // Load vehicles and units when modal opens
  useEffect(() => {
    if (!isModalOpen) return;

    async function loadDropdownData() {
      // Load active vehicles
      const { data: vehicleData } = await supabase
        .from("vehicles")
        .select("id, plate")
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .order("plate");

      if (vehicleData) setVehicles(vehicleData);

      // Load units
      const { data: unitData } = await supabase
        .from("units")
        .select("id, unit_label")
        .eq("property_id", propertyId)
        .order("unit_label");

      if (unitData) setUnits(unitData);
    }

    loadDropdownData();
  }, [isModalOpen, propertyId, supabase]);

  const handleCreatePermit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      // Use RPC to atomically create permit + QR credential
      const { error } = await supabase.rpc("create_permit_with_credential", {
        p_property_id: propertyId,
        p_type: formData.type,
        p_vehicle_id: formData.vehicle_id || undefined,
        p_unit_id: formData.unit_id || undefined,
        p_valid_from: formData.valid_from || undefined,
        p_valid_to: formData.valid_to || undefined,
        p_visitor_name: formData.type === "visitor" ? formData.visitor_name || undefined : undefined,
        p_notes: formData.notes || undefined,
      });

      if (error) throw error;

      // Reset form and close modal
      setFormData({
        type: "",
        vehicle_id: "",
        unit_id: "",
        valid_from: "",
        valid_to: "",
        visitor_name: "",
        notes: "",
      });
      setIsModalOpen(false);

      // Refresh permits list
      const { data } = await supabase
        .from("permits")
        .select(
          "id, type, status, valid_from, valid_to, visitor_name, created_at, vehicles(plate, make, color), units(unit_label)"
        )
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (data) setPermits(data as unknown as PermitRow[]);
    } catch (error) {
      console.error("Error creating permit:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokePermit = async (permitId: string) => {
    try {
      const { error } = await supabase
        .from("permits")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
        })
        .eq("id", permitId);

      if (error) throw error;

      // Refresh permits list
      const { data } = await supabase
        .from("permits")
        .select(
          "id, type, status, valid_from, valid_to, visitor_name, created_at, vehicles(plate, make, color), units(unit_label)"
        )
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (data) setPermits(data as unknown as PermitRow[]);
    } catch (error) {
      console.error("Error revoking permit:", error);
    }
  };

  const statusColor: Record<string, string> = {
    active: "bg-green-50 text-green-700",
    expired: "bg-gray-50 text-gray-500",
    revoked: "bg-red-50 text-red-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Permits</h1>
          <p className="text-sm text-gray-500 mt-1">{permits.length} permits</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Create permit
        </button>
      </div>

      {/* Create Permit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Create Permit</h2>
          <form onSubmit={handleCreatePermit} className="space-y-4">
            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as "resident" | "visitor" | "",
                  })
                }
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select type</option>
                <option value="resident">Resident</option>
                <option value="visitor">Visitor</option>
              </select>
            </div>

            {/* Vehicle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.vehicle_id}
                onChange={(e) =>
                  setFormData({ ...formData, vehicle_id: e.target.value })
                }
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate}
                  </option>
                ))}
              </select>
            </div>

            {/* Unit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.unit_id}
                onChange={(e) =>
                  setFormData({ ...formData, unit_id: e.target.value })
                }
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_label}
                  </option>
                ))}
              </select>
            </div>

            {/* Visitor Name - only show for visitor type */}
            {formData.type === "visitor" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Visitor Name
                </label>
                <input
                  type="text"
                  value={formData.visitor_name}
                  onChange={(e) =>
                    setFormData({ ...formData, visitor_name: e.target.value })
                  }
                  placeholder="Enter visitor name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Valid From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valid From
              </label>
              <input
                type="datetime-local"
                value={formData.valid_from}
                onChange={(e) =>
                  setFormData({ ...formData, valid_from: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Valid To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valid To
              </label>
              <input
                type="datetime-local"
                value={formData.valid_to}
                onChange={(e) =>
                  setFormData({ ...formData, valid_to: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Optional notes"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "Creating..." : "Create Permit"}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : permits.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 text-sm">No permits created yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Type
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Vehicle
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Unit
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Valid Until
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {permits.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    <span className="capitalize">{p.type}</span>
                    {p.visitor_name && (
                      <span className="text-gray-400 ml-1">
                        ({p.visitor_name})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        statusColor[p.status] ?? ""
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500">
                    {p.vehicles?.plate ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {p.units?.unit_label ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {p.valid_to ? new Date(p.valid_to).toLocaleDateString() : "No expiry"}
                  </td>
                  <td className="px-4 py-3">
                    {p.status === "active" && (
                      <button
                        onClick={() => handleRevokePermit(p.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
