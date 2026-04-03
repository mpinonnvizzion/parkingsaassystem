"use client";

import { useProperty } from "@/contexts/property-context";

export default function SettingsPage() {
  const { currentProperty, role } = useProperty();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage property settings and team members</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-lg">
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
    </div>
  );
}
