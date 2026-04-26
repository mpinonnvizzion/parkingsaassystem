"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Modal } from "@/components/ui/modal";
import type { Tables } from "@/types/database";
import { ImportVehiclesModal } from "@/components/import/ImportVehiclesModal";

type Vehicle = Tables<"vehicles">;

interface FormData {
  plate: string;
  state: string;
  make: string;
  model: string;
  color: string;
  year: string;
}

export default function VehiclesPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const { user } = useAuth();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    plate: "",
    state: "",
    make: "",
    model: "",
    color: "",
    year: "",
  });

  const supabase = createClient();

  // Load vehicles
  useEffect(() => {
    loadVehicles();
  }, [propertyId]);

  async function loadVehicles() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .order("plate");

    if (!error && data) {
      setVehicles(data);
    }
    setIsLoading(false);
  }

  // Open register modal
  function openRegisterModal() {
    setEditingVehicle(null);
    setFormData({
      plate: "",
      state: "",
      make: "",
      model: "",
      color: "",
      year: "",
    });
    setError("");
    setShowModal(true);
  }

  // Open edit modal
  function openEditModal(vehicle: Vehicle) {
    setEditingVehicle(vehicle);
    setFormData({
      plate: vehicle.plate,
      state: vehicle.state || "",
      make: vehicle.make || "",
      model: vehicle.model || "",
      color: vehicle.color || "",
      year: vehicle.year?.toString() || "",
    });
    setError("");
    setShowModal(true);
  }

  // Handle form input
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "plate" ? value.toUpperCase() : value,
    }));
  }

  // Validate form
  function validateForm(): boolean {
    if (!formData.plate.trim()) {
      setError("Plate is required");
      return false;
    }
    if (formData.year && isNaN(Number(formData.year))) {
      setError("Year must be a valid number");
      return false;
    }
    return true;
  }

  // Save vehicle (create or update)
  async function handleSaveVehicle() {
    if (!validateForm() || !user || !propertyId) return;

    setIsSaving(true);
    setError("");

    try {
      const vehicleData = {
        plate: formData.plate.trim(),
        state: formData.state.trim() || null,
        make: formData.make.trim() || null,
        model: formData.model.trim() || null,
        color: formData.color.trim() || null,
        year: formData.year ? Number(formData.year) : null,
      };

      if (editingVehicle) {
        // Update existing vehicle
        const { error: updateError } = await supabase
          .from("vehicles")
          .update(vehicleData)
          .eq("id", editingVehicle.id)
          .eq("property_id", propertyId);

        if (updateError) {
          setError(updateError.message);
          setIsSaving(false);
          return;
        }
      } else {
        // Create new vehicle
        const { error: insertError } = await supabase
          .from("vehicles")
          .insert([
            {
              ...vehicleData,
              property_id: propertyId,
              owner_user_id: user.id,
              is_active: true,
            },
          ]);

        if (insertError) {
          setError(insertError.message);
          setIsSaving(false);
          return;
        }
      }

      // Reload vehicles and close modal
      await loadVehicles();
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  // Soft delete vehicle
  async function handleDeleteVehicle(vehicleId: string) {
    if (!window.confirm("Are you sure you want to delete this vehicle?")) {
      return;
    }

    setDeletingId(vehicleId);

    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ is_active: false })
        .eq("id", vehicleId)
        .eq("property_id", propertyId);

      if (error) {
        alert("Failed to delete vehicle: " + error.message);
      } else {
        // Reload vehicles
        await loadVehicles();
      }
    } catch (err) {
      alert("An error occurred while deleting the vehicle");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vehicles</h1>
          <p className="text-sm text-gray-500 mt-1">
            {vehicles.length} active vehicle{vehicles.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportModalOpen(true)}
            className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Import CSV
          </button>
          <button
            onClick={openRegisterModal}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Register vehicle
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 text-sm">No vehicles registered yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Plate
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  State
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Make
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Model
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Color
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Year
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer"
                  onClick={() => openEditModal(v)}
                >
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">
                    {v.plate}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{v.state ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{v.make ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{v.model ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{v.color ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{v.year ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteVehicle(v.id);
                      }}
                      disabled={deletingId === v.id}
                      className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingId === v.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Import Modal */}
      <ImportVehiclesModal
        propertyId={propertyId}
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onComplete={() => { setImportModalOpen(false); loadVehicles(); }}
      />

      {/* Modal for create/edit vehicle */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
        <div className="p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {editingVehicle ? "Edit Vehicle" : "Register Vehicle"}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Plate *
              </label>
              <input
                type="text"
                name="plate"
                value={formData.plate}
                onChange={handleInputChange}
                placeholder="ABC123"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleInputChange}
                placeholder="CA"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Make
              </label>
              <input
                type="text"
                name="make"
                value={formData.make}
                onChange={handleInputChange}
                placeholder="Toyota"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model
              </label>
              <input
                type="text"
                name="model"
                value={formData.model}
                onChange={handleInputChange}
                placeholder="Camry"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color
              </label>
              <input
                type="text"
                name="color"
                value={formData.color}
                onChange={handleInputChange}
                placeholder="Silver"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year
              </label>
              <input
                type="number"
                name="year"
                value={formData.year}
                onChange={handleInputChange}
                placeholder="2024"
                min="1900"
                max={new Date().getFullYear() + 1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setShowModal(false)}
              disabled={isSaving}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveVehicle}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving..." : editingVehicle ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
