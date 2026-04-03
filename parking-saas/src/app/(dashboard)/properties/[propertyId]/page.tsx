"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProperty } from "@/contexts/property-context";

type Stats = {
  units: number;
  vehicles: number;
  activePermits: number;
};

export default function PropertyDashboardPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const { setPropertyId, currentProperty } = useProperty();
  const [stats, setStats] = useState<Stats>({ units: 0, vehicles: 0, activePermits: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    setPropertyId(propertyId);
  }, [propertyId, setPropertyId]);

  useEffect(() => {
    async function loadStats() {
      const [unitsRes, vehiclesRes, permitsRes] = await Promise.all([
        supabase
          .from("units")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId),
        supabase
          .from("vehicles")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .eq("is_active", true),
        supabase
          .from("permits")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .eq("status", "active"),
      ]);

      setStats({
        units: unitsRes.count ?? 0,
        vehicles: vehiclesRes.count ?? 0,
        activePermits: permitsRes.count ?? 0,
      });
      setIsLoading(false);
    }

    loadStats();
  }, [propertyId, supabase]);

  const statCards = [
    { label: "Units", value: stats.units },
    { label: "Active Vehicles", value: stats.vehicles },
    { label: "Active Permits", value: stats.activePermits },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          {currentProperty?.name ?? "Dashboard"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Property overview</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading stats...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-gray-200 rounded-xl p-5"
            >
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
