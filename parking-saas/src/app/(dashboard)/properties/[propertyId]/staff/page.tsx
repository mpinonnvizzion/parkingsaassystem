"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useProperty } from "@/contexts/property-context";

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffMember = {
  user_id: string;
  role: string;
  created_at: string;
  full_name: string | null;
  email: string;
};

type AddForm = {
  email: string;
  role: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSIGNABLE_ROLES = [
  { value: "property_admin", label: "Property Admin", description: "Full access to this property" },
  { value: "staff",          label: "Staff",          description: "Can manage permits and vehicles" },
  { value: "patrol_officer", label: "Patrol Officer", description: "Plate lookup and violation logging only" },
];

const ROLE_BADGES: Record<string, string> = {
  super_admin:     "bg-purple-50 text-purple-700 border-purple-200",
  org_admin:       "bg-indigo-50 text-indigo-700 border-indigo-200",
  property_admin:  "bg-blue-50 text-blue-700 border-blue-200",
  staff:           "bg-gray-100 text-gray-700 border-gray-200",
  patrol_officer:  "bg-orange-50 text-orange-700 border-orange-200",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin:    "Super Admin",
  org_admin:      "Org Admin",
  property_admin: "Property Admin",
  staff:          "Staff",
  patrol_officer: "Patrol Officer",
};

// Super admin and org admin roles are read-only — property admins cannot modify them
const PROTECTED_ROLES = ["super_admin", "org_admin"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const { user } = useAuth();
  const { role: myRole } = useProperty();

  const canManage =
    myRole === "super_admin" ||
    myRole === "org_admin" ||
    myRole === "property_admin";

  // ── State ────────────────────────────────────────────────────────────────────
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>({ email: "", role: "patrol_officer" });
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ── Load members ─────────────────────────────────────────────────────────────

  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    const res = await fetch(`/api/properties/${propertyId}/staff`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data);
    }
    setIsLoading(false);
  }, [propertyId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // ── Add member ───────────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!addForm.email.trim()) {
      setAddError("Email is required.");
      return;
    }
    setIsAdding(true);
    setAddError(null);

    const res = await fetch(`/api/properties/${propertyId}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addForm.email.trim(), role: addForm.role }),
    });

    const data = await res.json();

    if (!res.ok) {
      setAddError(data.error ?? "Failed to add member.");
      setIsAdding(false);
      return;
    }

    setIsModalOpen(false);
    setAddForm({ email: "", role: "patrol_officer" });
    loadMembers();
    setIsAdding(false);

    // Show contextual success banner
    const banner = data.invited
      ? `Invitation sent to ${data.email} — they'll receive an email to set their password.`
      : `${data.full_name ?? data.email} has been added as ${data.role.replace(/_/g, " ")}.`;
    setSuccessBanner(banner);
    setTimeout(() => setSuccessBanner(null), 6000);
  }

  // ── Change role ──────────────────────────────────────────────────────────────

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdatingId(userId);
    const res = await fetch(`/api/properties/${propertyId}/staff`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, role: newRole }),
    });
    if (res.ok) loadMembers();
    setUpdatingId(null);
  }

  // ── Remove member ────────────────────────────────────────────────────────────

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member from the property?")) return;
    setRemovingId(userId);
    const res = await fetch(`/api/properties/${propertyId}/staff`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    if (res.ok) loadMembers();
    setRemovingId(null);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Success banner */}
      {successBanner && (
        <div className="mb-5 flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <svg className="w-5 h-5 shrink-0 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{successBanner}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Staff</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage who has access to this property and what they can do
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setAddForm({ email: "", role: "patrol_officer" });
              setAddError(null);
              setIsModalOpen(true);
            }}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Add Member
          </button>
        )}
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {ASSIGNABLE_ROLES.map((r) => (
          <div
            key={r.value}
            className="bg-white border border-gray-200 rounded-xl px-4 py-3"
          >
            <span
              className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-1.5 ${ROLE_BADGES[r.value]}`}
            >
              {r.label}
            </span>
            <p className="text-xs text-gray-500">{r.description}</p>
          </div>
        ))}
      </div>

      {/* Members table */}
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading staff members…</div>
      ) : members.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">👥</div>
          <p className="font-medium text-gray-800">No staff members yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Add a property admin, staff member, or patrol officer to get started.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Member", "Role", "Added", "Actions"].map((h) => (
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
              {members.map((m) => {
                const isMe = m.user_id === user?.id;
                const isProtected = PROTECTED_ROLES.includes(m.role);
                const canAct = canManage && !isMe && !isProtected;

                return (
                  <tr key={m.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {m.full_name ?? "—"}
                        {isMe && (
                          <span className="ml-2 text-xs text-gray-400 font-normal">
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{m.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {canAct ? (
                        <select
                          value={m.role}
                          disabled={updatingId === m.user_id}
                          onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                            ROLE_BADGES[m.role] ?? "bg-gray-50 text-gray-600 border-gray-200"
                          }`}
                        >
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {canAct ? (
                        <button
                          onClick={() => handleRemove(m.user_id)}
                          disabled={removingId === m.user_id}
                          className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
                        >
                          {removingId === m.user_id ? "Removing…" : "Remove"}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Member Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Add Staff Member</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                If they don't have an account yet, we'll send them an email invitation to set their password.
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, email: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder="officer@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <div className="space-y-2">
                  {ASSIGNABLE_ROLES.map((r) => (
                    <label
                      key={r.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        addForm.role === r.value
                          ? "border-blue-400 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={r.value}
                        checked={addForm.role === r.value}
                        onChange={() =>
                          setAddForm((f) => ({ ...f, role: r.value }))
                        }
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {r.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {r.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {addError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {addError}
                </p>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isAdding}
                className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={isAdding || !addForm.email.trim()}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isAdding ? "Adding…" : "Add Member"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
