"use client";

import { useEffect, useState } from "react";
import { useProperty } from "@/contexts/property-context";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const { currentProperty, role } = useProperty();
  const supabase = createClient();

  const [towingEmail, setTowingEmail] = useState("");
  const [towingPhone, setTowingPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (currentProperty?.settings) {
      const s = currentProperty.settings as Record<string, string>;
      setTowingEmail(s.towing_email ?? "");
      setTowingPhone(s.towing_phone ?? "");
    }
  }, [currentProperty]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!currentProperty) return;
    setIsSaving(true);
    setSaved(false);
    const existing = (currentProperty.settings as Record<string, string>) ?? {};
    const { error } = await supabase
      .from("properties")
      .update({ settings: { ...existing, towing_email: towingEmail, towing_phone: towingPhone } })
      .eq("id", currentProperty.id);
    setIsSaving(false);
    if (!error) setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const canEdit = role === "super_admin" || role === "org_admin" || role === "property_admin";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage property settings and team members</p>
      </div>

      <div className="space-y-6 max-w-lg">
        {/* Property Details */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Property Details</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Name</dt>
              <dd className="text-gray-900 font-medium">{currentProperty?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Address</dt>
              <dd className="text-gray-900">
                {[currentProperty?.address1, currentProperty?.city, currentProperty?.state]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Your Role</dt>
              <dd className="text-gray-900 capitalize">{role?.replace("_", " ") ?? "—"}</dd>
            </div>
          </dl>
        </div>

        {/* Towing Company */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Towing Company</h2>
          <p className="text-sm text-gray-500 mb-4">
            Used when flagging a vehicle for towing from the Permits page.
          </p>
          <form onSubmit={saveSettings} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Towing company email
              </label>
              <input
                type="email"
                value={towingEmail}
                onChange={(e) => setTowingEmail(e.target.value)}
                placeholder="dispatch@towingco.com"
                disabled={!canEdit}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Towing company phone
              </label>
              <input
                type="tel"
                value={towingPhone}
                onChange={(e) => setTowingPhone(e.target.value)}
                placeholder="(555) 123-4567"
                disabled={!canEdit}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            {canEdit && (
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? "Saving..." : saved ? "✓ Saved" : "Save settings"}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
