"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { QRCodeCanvas } from "qrcode.react";
import type { Tables, TablesInsert } from "@/types/database";

type Unit = Tables<"units">;
type UnitInsert = TablesInsert<"units">;

type UnitWithResidents = Unit & {
  unit_members: Array<{
    user_id: string;
    profiles: { full_name: string | null; email: string; phone: string | null } | null;
  }>;
};

const getClaimUrl = (code?: string | null) => {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return code ? `${base}/claim?code=${encodeURIComponent(code)}` : `${base}/claim`;
};

export default function UnitsPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const [units, setUnits] = useState<UnitWithResidents[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Claim code state
  const [claimCodeUnit, setClaimCodeUnit] = useState<Unit | null>(null);
  const [newCode, setNewCode] = useState("");
  const [codeSaving, setCodeSaving] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [codeSuccess, setCodeSuccess] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const supabase = createClient();

  function downloadQR(unit: Unit) {
    const canvas = qrRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `invite-qr-unit-${unit.unit_label}.png`;
    a.click();
  }

  const [formData, setFormData] = useState<UnitInsert>({
    property_id: propertyId,
    unit_label: "",
    building: null,
    floor: null,
    max_vehicles: 2,
    notes: null,
  });

  useEffect(() => {
    loadUnits();
  }, [propertyId]);

  async function loadUnits() {
    setIsLoading(true);
    setError(null);

    // Step 1: fetch units
    const { data: unitsData, error: fetchError } = await supabase
      .from("units")
      .select("*")
      .eq("property_id", propertyId)
      .order("unit_label");

    if (fetchError) {
      setError(fetchError.message);
      setIsLoading(false);
      return;
    }

    if (!unitsData) {
      setUnits([]);
      setIsLoading(false);
      return;
    }

    // Step 2: fetch unit_members for all units in this property
    const unitIds = unitsData.map((u) => u.id);
    const { data: membersData } = await supabase
      .from("unit_members")
      .select("unit_id, user_id")
      .in("unit_id", unitIds.length > 0 ? unitIds : ["00000000-0000-0000-0000-000000000000"]);

    // Step 3: fetch profiles for those user_ids
    const userIds = (membersData ?? []).map((m) => m.user_id);
    const { data: profilesData } = userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, email, phone").in("id", userIds)
      : { data: [] };

    // Step 4: assemble
    const profileMap = Object.fromEntries((profilesData ?? []).map((p) => [p.id, p]));
    const assembled: UnitWithResidents[] = unitsData.map((unit) => ({
      ...unit,
      unit_members: (membersData ?? [])
        .filter((m) => m.unit_id === unit.id)
        .map((m) => ({ user_id: m.user_id, profiles: profileMap[m.user_id] ?? null })),
    }));

    setUnits(assembled);
    setIsLoading(false);
  }

  function openModalForCreate() {
    setEditingUnit(null);
    setFormData({ property_id: propertyId, unit_label: "", building: null, floor: null, max_vehicles: 2, notes: null });
    setModalOpen(true);
  }

  function openModalForEdit(unit: Unit) {
    setEditingUnit(unit);
    setFormData({ property_id: propertyId, unit_label: unit.unit_label, building: unit.building, floor: unit.floor, max_vehicles: unit.max_vehicles, notes: unit.notes });
    setModalOpen(true);
  }

  function openClaimCodeModal(unit: Unit) {
    setClaimCodeUnit(unit);
    setNewCode("");
    setCodeError("");
    setCodeSuccess(false);
    setCodeCopied(false);
  }

  function handleInputChange(field: keyof UnitInsert, value: string | number | null) {
    setFormData((prev) => ({ ...prev, [field]: value === "" ? null : value }));
  }

  async function handleSave() {
    setError(null);
    if (!formData.unit_label?.trim()) { setError("Unit label is required"); return; }
    setIsSaving(true);
    try {
      if (editingUnit) {
        const { error: e } = await supabase.from("units").update(formData).eq("id", editingUnit.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("units").insert([formData]);
        if (e) throw e;
      }
      await loadUnits();
      setModalOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save unit");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(unitId: string) {
    setError(null);
    try {
      const { error: e } = await supabase.from("units").delete().eq("id", unitId);
      if (e) throw e;
      await loadUnits();
      setDeleteConfirm(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete unit");
    }
  }

  async function handleSetClaimCode(e: React.FormEvent) {
    e.preventDefault();
    if (!claimCodeUnit || !newCode.trim()) return;
    setCodeError("");
    setCodeSaving(true);
    try {
      const { error, count } = await supabase
        .from("units")
        .update({ claim_code_hash: newCode.trim() }, { count: "exact" })
        .eq("property_id", propertyId)
        .eq("unit_label", claimCodeUnit.unit_label);
      if (error) throw error;
      if (count === 0) throw new Error("Update failed: no matching unit found. You may not have permission to edit this unit.");
      setCodeSuccess(true);
      setCodeCopied(false);
      await loadUnits();
    } catch (err: unknown) {
      setCodeError(err instanceof Error ? err.message : "Failed to set invite code");
    } finally {
      setCodeSaving(false);
    }
  }

  async function copyClaimLink(unit?: Unit | null) {
    const url = getClaimUrl(unit?.claim_code_hash);
    await navigator.clipboard.writeText(url);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Units</h1>
          <p className="text-sm text-gray-500 mt-1">{units.length} units</p>
        </div>
        <button
          onClick={openModalForCreate}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Add unit
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : units.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 text-sm">No units yet. Add your first unit to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Unit</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Building</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Floor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Max Vehicles</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Residents</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Invite Code</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{unit.unit_label}</td>
                  <td className="px-4 py-3 text-gray-500">{unit.building ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{unit.floor ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{unit.max_vehicles}</td>
                  <td className="px-4 py-3">
                    {unit.unit_members.length === 0 ? (
                      <span className="text-xs text-gray-400">No residents</span>
                    ) : (
                      <div className="space-y-1">
                        {unit.unit_members.map((m) => (
                          <div key={m.user_id} className="text-xs">
                            <div className="font-medium text-gray-800">{m.profiles?.full_name || m.profiles?.email || "Unknown"}</div>
                            {m.profiles?.phone ? (
                              <div className="text-gray-500 font-mono">{m.profiles.phone}</div>
                            ) : (
                              <div className="text-amber-500">No phone</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {unit.claim_code_hash ? (
                      <span className="inline-flex items-center gap-1 text-xs font-mono bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5">
                        {unit.claim_code_hash}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openModalForEdit(unit)}
                        className="text-blue-600 hover:text-blue-700 font-medium text-xs transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openClaimCodeModal(unit)}
                        className="text-green-600 hover:text-green-700 font-medium text-xs transition-colors"
                      >
                        Invite code
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(unit.id)}
                        className="text-red-600 hover:text-red-700 font-medium text-xs transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Resident sign-up tip */}
      {units.length > 0 && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-900">Resident self-signup</p>
              <p className="text-sm text-blue-700 mt-0.5">
                Set an invite code on any unit, then share the claim link with your resident.
              </p>
              <button
                onClick={() => copyClaimLink()}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {codeCopied ? "Copied!" : "Copy claim link"}
              </button>
              <span className="ml-2 text-xs text-blue-500 font-mono">{getClaimUrl()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Unit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {editingUnit ? "Edit Unit" : "Create Unit"}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit Label <span className="text-red-600">*</span>
              </label>
              <input type="text" value={formData.unit_label || ""} onChange={(e) => handleInputChange("unit_label", e.target.value)}
                placeholder="e.g., 101, Suite A"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Building</label>
              <input type="text" value={formData.building || ""} onChange={(e) => handleInputChange("building", e.target.value)}
                placeholder="e.g., Building A"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Floor</label>
              <input type="number" value={formData.floor || ""} onChange={(e) => handleInputChange("floor", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="e.g., 3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Vehicles</label>
              <input type="number" value={formData.max_vehicles || 2} onChange={(e) => handleInputChange("max_vehicles", parseInt(e.target.value))}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={formData.notes || ""} onChange={(e) => handleInputChange("notes", e.target.value)}
                placeholder="Additional notes..." rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setModalOpen(false)} disabled={isSaving}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={handleSave} disabled={isSaving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Invite Code Modal */}
      <Modal isOpen={!!claimCodeUnit} onClose={() => setClaimCodeUnit(null)}>
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            Invite Code — Unit {claimCodeUnit?.unit_label}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Set a secret code your resident uses to claim this unit.
            Share it with them along with the claim link.
          </p>

          {codeError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {codeError}
            </div>
          )}

          {codeSuccess && claimCodeUnit?.claim_code_hash && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700 font-medium mb-3">✓ Invite code saved! Share the QR code or link below with your resident.</p>
              <div className="flex flex-col items-center gap-3">
                <QRCodeCanvas
                  ref={qrRef}
                  value={getClaimUrl(claimCodeUnit.claim_code_hash)}
                  size={180}
                  includeMargin
                />
                <div className="flex gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => copyClaimLink(claimCodeUnit)}
                    className="flex-1 text-xs font-medium text-blue-700 bg-white border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
                  >
                    {codeCopied ? "Copied!" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadQR(claimCodeUnit)}
                    className="flex-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                  >
                    Download QR
                  </button>
                </div>
                <p className="text-xs text-gray-400 font-mono break-all text-center">{getClaimUrl(claimCodeUnit.claim_code_hash)}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSetClaimCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {codeSuccess ? "Change invite code" : "Set invite code"}
              </label>
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="e.g., RIVER-101-ABCD"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Use something memorable but not guessable. Setting a new code invalidates the previous one.
              </p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setClaimCodeUnit(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Close
              </button>
              <button type="submit" disabled={codeSaving || !newCode.trim()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
                {codeSaving ? "Saving..." : codeSuccess ? "Update code" : "Set code"}
              </button>
            </div>
          </form>

          {!codeSuccess && claimCodeUnit?.claim_code_hash && (
            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-3">Current QR code for this unit</p>
              <div className="flex flex-col items-center gap-3">
                <QRCodeCanvas
                  ref={qrRef}
                  value={getClaimUrl(claimCodeUnit.claim_code_hash)}
                  size={160}
                  includeMargin
                />
                <div className="flex gap-2 w-full">
                  <button type="button" onClick={() => copyClaimLink(claimCodeUnit)}
                    className="flex-1 text-xs font-medium text-blue-700 bg-white border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors">
                    {codeCopied ? "Copied!" : "Copy link"}
                  </button>
                  <button type="button" onClick={() => downloadQR(claimCodeUnit)}
                    className="flex-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                    Download QR
                  </button>
                </div>
              </div>
            </div>
          )}

          {!codeSuccess && !claimCodeUnit?.claim_code_hash && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
              <p className="font-medium mb-1">How it works:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Set a code — a QR code and link are generated automatically</li>
                <li>Print or share the QR with your resident</li>
                <li>Resident scans it, signs up, and is added to Unit {claimCodeUnit?.unit_label}</li>
              </ol>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <Modal isOpen={true} onClose={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Unit</h2>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete this unit? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
