"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { QRCodeSVG } from "qrcode.react";

type MyPermit = {
  id: string;
  type: string;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  visitor_name: string | null;
  notes: string | null;
  qr_token: string | null;
  credential_id: string | null;
  plate: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  unit_label: string | null;
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const statusColor: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  expired: "bg-gray-50 text-gray-500 border-gray-200",
  revoked: "bg-red-50 text-red-700 border-red-200",
};

export default function MyPermitsPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;
  const [permits, setPermits] = useState<MyPermit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedQr, setExpandedQr] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadPermits() {
      const { data, error } = await supabase.rpc("get_my_permits", {
        p_property_id: propertyId,
      });
      if (!error && data) {
        setPermits(data as MyPermit[]);
      }
      setIsLoading(false);
    }
    loadPermits();
  }, [propertyId, supabase]);

  const activePermits = permits.filter((p) => p.status === "active");
  const otherPermits = permits.filter((p) => p.status !== "active");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">My Permits</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your active parking permits and QR codes
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : permits.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium">No permits found</p>
          <p className="text-sm text-gray-400 mt-1">
            Ask your property manager to create a permit for your vehicle.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active permits */}
          {activePermits.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Active
              </h2>
              <div className="space-y-4">
                {activePermits.map((permit) => (
                  <PermitCard
                    key={permit.id}
                    permit={permit}
                    expandedQr={expandedQr}
                    onToggleQr={setExpandedQr}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Past permits */}
          {otherPermits.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Past
              </h2>
              <div className="space-y-4">
                {otherPermits.map((permit) => (
                  <PermitCard
                    key={permit.id}
                    permit={permit}
                    expandedQr={expandedQr}
                    onToggleQr={setExpandedQr}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function PermitCard({
  permit,
  expandedQr,
  onToggleQr,
}: {
  permit: MyPermit;
  expandedQr: string | null;
  onToggleQr: (id: string | null) => void;
}) {
  const scanUrl = permit.qr_token
    ? `${APP_URL}/scan/${permit.qr_token}`
    : null;
  const isExpanded = expandedQr === permit.id;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Status badge + type */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${
                  statusColor[permit.status] ?? ""
                }`}
              >
                {permit.status}
              </span>
              <span className="text-xs text-gray-400 capitalize">{permit.type} permit</span>
            </div>

            {/* Vehicle */}
            {permit.plate && (
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span className="font-mono font-semibold text-gray-900">{permit.plate}</span>
                {(permit.color || permit.make || permit.model) && (
                  <span className="text-sm text-gray-500">
                    — {[permit.color, permit.make, permit.model].filter(Boolean).join(" ")}
                  </span>
                )}
              </div>
            )}

            {/* Visitor */}
            {permit.type === "visitor" && permit.visitor_name && (
              <div className="text-sm text-gray-600 mb-1">
                Visitor: <span className="font-medium">{permit.visitor_name}</span>
              </div>
            )}

            {/* Unit */}
            {permit.unit_label && (
              <div className="text-sm text-gray-500 mb-1">Unit {permit.unit_label}</div>
            )}

            {/* Dates */}
            <div className="text-xs text-gray-400 mt-2">
              {permit.valid_from && (
                <span>From {new Date(permit.valid_from).toLocaleDateString()}</span>
              )}
              {permit.valid_to && (
                <span>
                  {permit.valid_from ? " · " : ""}
                  Expires {new Date(permit.valid_to).toLocaleDateString()}
                </span>
              )}
              {!permit.valid_from && !permit.valid_to && (
                <span>No expiry</span>
              )}
            </div>
          </div>

          {/* QR toggle button */}
          {scanUrl && permit.status === "active" && (
            <button
              onClick={() => onToggleQr(isExpanded ? null : permit.id)}
              className="shrink-0 flex flex-col items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors"
              title="Show QR code"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                />
              </svg>
              <span className="text-xs font-medium">QR Code</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded QR Code */}
      {isExpanded && scanUrl && (
        <div className="border-t border-gray-100 bg-gray-50 p-6 flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <QRCodeSVG
              value={scanUrl}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">Scan to verify permit</p>
            <p className="text-xs text-gray-400 mt-0.5 font-mono break-all max-w-xs">
              {scanUrl}
            </p>
          </div>
          <a
            href={scanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Open scan page →
          </a>
        </div>
      )}
    </div>
  );
}
