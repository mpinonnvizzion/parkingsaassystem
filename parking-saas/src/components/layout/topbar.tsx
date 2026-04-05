"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useProperty } from "@/contexts/property-context";

export function Topbar() {
  const { user } = useAuth();
  const { memberships, propertyId, setPropertyId } = useProperty();
  const router = useRouter();
  const supabase = createClient();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setIsPlatformAdmin(!!data));
  }, [user]);

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
        <Link
          href="/properties?new=1"
          className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New property
        </Link>
        {isPlatformAdmin && (
          <Link
            href="/admin/invites"
            className="text-sm text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
            Admin
          </Link>
        )}
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
