"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProperty } from "@/contexts/property-context";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";

function PropertiesPageInner() {
  const { memberships, isLoading, setPropertyId } = useProperty();

  const canCreateProperty =
    memberships.some((m) => ["super_admin", "org_admin", "property_admin"].includes(m.role));
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Auto-open create modal when ?new=1 is in the URL (e.g. from topbar button)
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setIsModalOpen(true);
      // Clean up the URL param without a page reload
      router.replace("/properties");
    }
  }, [searchParams]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    address1: "",
    city: "",
    state: "",
    zip: "",
    timezone: "America/Chicago",
  });

  function handleSelectProperty(propertyId: string) {
    setPropertyId(propertyId);
    router.push(`/properties/${propertyId}`);
  }

  function handleOpenModal() {
    setFormData({ name: "", address1: "", city: "", state: "", zip: "", timezone: "America/Chicago" });
    setError(null);
    setIsModalOpen(true);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { data, error: rpcError } = await supabase.rpc("create_property", {
      p_name: formData.name,
      p_address1: formData.address1 || undefined,
      p_city: formData.city || undefined,
      p_state: formData.state || undefined,
      p_zip: formData.zip || undefined,
      p_timezone: formData.timezone,
    });

    if (rpcError) {
      setError(rpcError.message);
      setIsSubmitting(false);
      return;
    }

    // data is the new property_id
    setIsModalOpen(false);
    setIsSubmitting(false);
    // Navigate to the new property
    if (data) {
      setPropertyId(data);
      router.push(`/properties/${data}`);
    }
    router.refresh();
  }

  const modalContent = (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Property Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="e.g., Sunset Apartments"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input
            type="text"
            name="address1"
            value={formData.address1}
            onChange={handleChange}
            placeholder="123 Main St"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              placeholder="Chicago"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <input
              type="text"
              name="state"
              value={formData.state}
              onChange={handleChange}
              placeholder="IL"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
            <input
              type="text"
              name="zip"
              value={formData.zip}
              onChange={handleChange}
              placeholder="60601"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            name="timezone"
            value={formData.timezone}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="America/New_York">Eastern</option>
            <option value="America/Chicago">Central</option>
            <option value="America/Denver">Mountain</option>
            <option value="America/Los_Angeles">Pacific</option>
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create property"}
          </button>
        </div>
      </form>
    </>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-500">Loading properties...</p>
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <>
        <div className="max-w-lg mx-auto py-20 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No properties yet</h2>
          <p className="text-sm text-gray-500 mb-6">
            You haven&apos;t been added to any properties yet. Use the invite link your property manager sent you to get started.
          </p>
          <a
            href="/claim"
            className="inline-block bg-blue-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Claim your unit →
          </a>
          {canCreateProperty && (
            <div className="mt-4">
              <button
                onClick={handleOpenModal}
                className="text-sm text-gray-400 hover:text-gray-600 underline"
              >
                Or create a new property
              </button>
            </div>
          )}
        </div>
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create new property">
          {modalContent}
        </Modal>
      </>
    );
  }

  return (
    <>
      <div className="max-w-2xl mx-auto py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">Your properties</h1>
          {canCreateProperty && (
            <button
              onClick={handleOpenModal}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Create property
            </button>
          )}
        </div>
        <div className="space-y-3">
          {memberships.map((m) => (
            <button
              key={m.property_id}
              onClick={() => handleSelectProperty(m.property_id)}
              className="w-full bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{m.properties.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {[m.properties.address1, m.properties.city, m.properties.state]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
                <span className="text-xs bg-blue-50 text-blue-700 rounded px-2 py-1 font-medium">
                  {m.role.replace("_", " ")}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create new property">
        {modalContent}
      </Modal>
    </>
  );
}

export default function PropertiesPage() {
  return (
    <Suspense>
      <PropertiesPageInner />
    </Suspense>
  );
}
