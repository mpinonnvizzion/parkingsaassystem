"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Tables } from "@/types/database";

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) setProfile(data);
      setIsLoading(false);
    }
    loadProfile();
  }, [user, supabase]);

  if (isLoading) return <p className="text-sm text-gray-500">Loading profile...</p>;

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Profile</h1>
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-gray-500">Name</dt>
            <dd className="text-gray-900 font-medium">{profile?.full_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Email</dt>
            <dd className="text-gray-900">{profile?.email}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Phone</dt>
            <dd className="text-gray-900">{profile?.phone || "—"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
