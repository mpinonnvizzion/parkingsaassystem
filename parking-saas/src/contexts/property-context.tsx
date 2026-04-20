"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./auth-context";
import type { Enums } from "@/types/database";

type PropertyMembership = {
  property_id: string;
  role: Enums<"member_role">;
  properties: {
    id: string;
    name: string;
    address1: string | null;
    city: string | null;
    state: string | null;
    settings: Record<string, string> | null;
  };
};

type PropertyContextType = {
  propertyId: string | null;
  role: Enums<"member_role"> | null;
  memberships: PropertyMembership[];
  isLoading: boolean;
  setPropertyId: (id: string) => void;
  currentProperty: PropertyMembership["properties"] | null;
};

const PropertyContext = createContext<PropertyContextType>({
  propertyId: null,
  role: null,
  memberships: [],
  isLoading: true,
  setPropertyId: () => {},
  currentProperty: null,
});

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [propertyId, setPropertyIdState] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<PropertyMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const setPropertyId = useCallback((id: string) => {
    setPropertyIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("activePropertyId", id);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setMemberships([]);
      setPropertyIdState(null);
      setIsLoading(false);
      return;
    }

    async function loadMemberships() {
      const { data, error } = await supabase
        .from("property_members")
        .select(
          "property_id, role, properties(id, name, address1, city, state, settings)"
        )
        .eq("user_id", user!.id);

      if (error) {
        console.error("Failed to load memberships:", error);
        setIsLoading(false);
        return;
      }

      const typed = (data ?? []) as unknown as PropertyMembership[];
      setMemberships(typed);

      // Restore last selected property or pick the first one
      const stored =
        typeof window !== "undefined"
          ? localStorage.getItem("activePropertyId")
          : null;
      const validStored = typed.find((m) => m.property_id === stored);

      if (validStored) {
        setPropertyIdState(validStored.property_id);
      } else if (typed.length > 0) {
        setPropertyIdState(typed[0].property_id);
      }

      setIsLoading(false);
    }

    loadMemberships();
  }, [user, supabase]);

  const current = memberships.find((m) => m.property_id === propertyId);

  return (
    <PropertyContext.Provider
      value={{
        propertyId,
        role: current?.role ?? null,
        memberships,
        isLoading,
        setPropertyId,
        currentProperty: current?.properties ?? null,
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
}

export const useProperty = () => {
  const context = useContext(PropertyContext);
  if (!context) {
    throw new Error("useProperty must be used within a PropertyProvider");
  }
  return context;
};
