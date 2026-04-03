"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useProperty } from "@/contexts/property-context";

export function Topbar() {
  const { user } = useAuth();
  const { memberships, propertyId, setPropertyId } = useProperty();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <span className="text-sm font-bold text-gray-900">ParkingSystem</span>

        {memberships.length > 1 && (
          <select
            value={propertyId ?? ""}
            onChange={(e) => {
              setPropertyId(e.target.value);
              router.push(`/properties/${e.target.value}`);
            }}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {memberships.map((m) => (
              <option key={m.property_id} value={m.property_id}>
                {m.properties.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500">{user?.email}</span>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
