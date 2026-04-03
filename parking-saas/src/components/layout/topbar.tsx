"use client";

import Link from "next/link";
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
        <Link
          href="/properties"
          className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors"
        >
          ParkingSystem
        </Link>

        {propertyId && (
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}

        {memberships.length > 1 ? (
          <select
            value={propertyId ?? ""}
            onChange={(e) => {
              setPropertyId(e.target.value);
              router.push(`/properties/${e.target.value}`);
            }}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="" disabled>Select a property</option>
            {memberships.map((m) => (
              <option key={m.property_id} value={m.property_id}>
                {m.properties.name}
              </option>
            ))}
          </select>
        ) : memberships.length === 1 && propertyId ? (
          <span className="text-sm text-gray-600 font-medium">
            {memberships[0].properties.name}
          </span>
        ) : null}
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
