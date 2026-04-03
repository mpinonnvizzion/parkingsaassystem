import { createServiceRoleClient } from "@/lib/supabase/server";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  // Look up credential by token (service role bypasses RLS — token is the secret)
  const { data: credential } = await supabase
    .from("credentials")
    .select(
      `id, is_active, property_id,
       permits(id, status, type, valid_from, valid_to, visitor_name,
         vehicles(plate, make, model, color),
         units(unit_label)
       ),
       properties:property_id(name)`
    )
    .eq("token", token)
    .single();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const permit = (credential as any)?.permits;
  const vehicle = permit?.vehicles;
  const unit = permit?.units;
  const property = (credential as any)?.properties;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const now = new Date();
  const isActive = credential?.is_active && permit?.status === "active";
  const notExpired = !permit?.valid_to || new Date(permit.valid_to) > now;
  const notTooEarly = !permit?.valid_from || new Date(permit.valid_from) <= now;
  const isValid = !!(isActive && notExpired && notTooEarly);

  let reason = "valid";
  if (!credential) reason = "not_found";
  else if (!credential.is_active) reason = "credential_inactive";
  else if (permit?.status !== "active") reason = `permit_${permit?.status ?? "not_found"}`;
  else if (!notTooEarly) reason = "not_yet_valid";
  else if (!notExpired) reason = "expired";

  // Log scan event (fire-and-forget — don't block render)
  if (credential) {
    supabase
      .from("scan_events")
      .insert({
        property_id: credential.property_id,
        scanned_by: null,
        credential_id: credential.id,
        permit_id: permit?.id ?? null,
        scan_time: now.toISOString(),
        scan_result: isValid ? "valid" : "invalid",
        details: { reason, source: "web" },
        lat: null,
        lng: null,
      })
      .then(() => {}); // intentionally not awaited
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          {/* Status indicator */}
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              isValid ? "bg-green-100" : "bg-red-100"
            }`}
          >
            {isValid ? (
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          <h1 className={`text-xl font-bold mb-1 ${isValid ? "text-green-700" : "text-red-700"}`}>
            {isValid ? "Valid Permit" : "Invalid"}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {isValid
              ? "This vehicle is authorized to park here."
              : reason === "not_found"
              ? "This QR code is not recognized."
              : reason === "expired"
              ? "This permit has expired."
              : reason === "not_yet_valid"
              ? "This permit is not active yet."
              : "This permit is not valid."}
          </p>

          {isValid && (
            <div className="text-left border-t border-gray-100 pt-4 space-y-2 text-sm">
              {property?.name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Property</span>
                  <span className="font-medium text-gray-900">{property.name}</span>
                </div>
              )}
              {vehicle && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Plate</span>
                    <span className="font-mono font-medium text-gray-900">{vehicle.plate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Vehicle</span>
                    <span className="text-gray-900">
                      {[vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
                    </span>
                  </div>
                </>
              )}
              {permit?.type === "visitor" && permit.visitor_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Visitor</span>
                  <span className="text-gray-900">{permit.visitor_name}</span>
                </div>
              )}
              {unit && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Unit</span>
                  <span className="text-gray-900">{unit.unit_label}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="capitalize text-gray-900">{permit?.type}</span>
              </div>
              {permit?.valid_to && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Expires</span>
                  <span className="text-gray-900">
                    {new Date(permit.valid_to).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">ParkingSystem</p>
      </div>
    </div>
  );
}
