"use client";

import { useEffect, useRef, useState } from "react";
import { useProperty } from "@/contexts/property-context";
import { createClient } from "@/lib/supabase/client";
import { QRCodeCanvas } from "qrcode.react";

export default function SettingsPage() {
  const { currentProperty, role } = useProperty();
  const supabase = createClient();

  const [towingEmail, setTowingEmail] = useState("");
  const [towingPhone, setTowingPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const APP_URL =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? "";
  const claimUrl = currentProperty?.id
    ? `${APP_URL}/claim?property=${currentProperty.id}`
    : null;

  function downloadQR() {
    const canvas = qrRef.current;
    if (!canvas || !currentProperty) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `parking-registration-qr-${currentProperty.name.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
  }

  async function copyClaimUrl() {
    if (!claimUrl) return;
    await navigator.clipboard.writeText(claimUrl);
    setQrCopied(true);
    setTimeout(() => setQrCopied(false), 2000);
  }

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

        {/* Property Registration QR Code */}
        {claimUrl && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Resident Registration QR</h2>
            <p className="text-sm text-gray-500 mb-5">
              Print this QR code and post it in your parking lot. Residents scan it to register their vehicle — no need to hunt for a link.
            </p>

            <div className="flex flex-col items-center gap-4">
              {/* QR code */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <QRCodeCanvas
                  ref={qrRef}
                  value={claimUrl}
                  size={200}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* Property label below QR */}
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">{currentProperty?.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">Scan to register for parking</p>
              </div>

              {/* URL */}
              <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-xs font-mono text-gray-500 break-all text-center">{claimUrl}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 w-full">
                <button
                  onClick={downloadQR}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PNG
                </button>
                <button
                  onClick={copyClaimUrl}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {qrCopied ? "Copied!" : "Copy link"}
                </button>
              </div>
            </div>
          </div>
        )}

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
