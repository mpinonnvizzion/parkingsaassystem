# ParkingSystem — Full Architecture Design

> **Last updated:** 2026-04-01
> **Supabase project:** `mwjczjwqdqavhqehmdgn` (us-west-2)
> **Status:** Schema applied and verified

---

## Step 1: PostgreSQL Schema (APPLIED)

### Design Decisions

- **Multi-tenant via `property_id`**: Every tenant-facing table includes a `property_id` FK. RLS policies filter on this column.
- **Organizations above properties**: An `organizations` table allows grouping properties under a parent org (future: multi-property operators).
- **Roles are property-scoped via `property_members`**: Roles: `super_admin`, `org_admin`, `property_admin`, `staff`, `resident`. A user can have different roles on different properties.
- **Permits model** (not just vehicles): A `permits` table with types (`resident`, `visitor`) and statuses (`active`, `expired`, `revoked`) is more flexible than a simple vehicle list.
- **Credentials table**: Supports `qr`, `rfid`, and `plate_only` — future-proof for RFID gates and LPR cameras.
- **Unit claim codes**: Hashed invite codes for resident self-signup.
- **Scan events**: Full audit trail of every enforcement scan.
- **Profiles table**: 1:1 with `auth.users`, auto-created on signup via trigger.

### Tables (13 total)

| Table | Purpose | Key Columns |
|---|---|---|
| `organizations` | Parent org grouping | id, name |
| `properties` | Tenant (apartment/lot) | id, organization_id, name, address1, city, state, zip, timezone, settings |
| `profiles` | User display data (1:1 auth.users) | id→auth.users, email, full_name, phone, avatar_url |
| `property_members` | User↔property role link | property_id, user_id, role (enum) |
| `units` | Apartment units | id, property_id, unit_label, building, floor, max_vehicles |
| `unit_members` | User↔unit link | unit_id, user_id |
| `vehicles` | Registered vehicles | id, property_id, owner_user_id, plate, state, make, model, color, year, is_active |
| `permits` | Parking permits | id, property_id, type, status, vehicle_id, unit_id, created_by, valid_from, valid_to |
| `credentials` | QR/RFID/plate tokens | id, property_id, permit_id, type, token (unique), is_active |
| `zones` | Parking zones | id, property_id, name, description |
| `permit_zone_access` | Permit↔zone access | permit_id, zone_id |
| `scan_events` | Enforcement audit log | id, property_id, scanned_by, credential_id, permit_id, scan_result, lat, lng |
| `unit_claim_codes` | Self-signup invite codes | unit_id, property_id, code_hash, is_active |

### Enums

- `member_role`: super_admin, org_admin, property_admin, staff, resident
- `permit_type`: resident, visitor
- `permit_status`: active, expired, revoked
- `credential_type`: qr, rfid, plate_only

### Key Indexes

- `property_members(user_id)` — fast "my properties" lookup
- `vehicles(property_id, plate)` — unique plate per property
- `vehicles(property_id, is_active)` — active vehicle queries
- `permits(property_id, status)` — active permits per property
- `credentials(property_id, is_active)` — active credentials
- `credentials(token)` — unique, for QR scan lookups
- `scan_events(property_id, scan_time DESC)` — recent scans
- `units(property_id, unit_label)` — unique unit label per property
- `zones(property_id, name)` — unique zone name per property

### Triggers

- `handle_updated_at()` — auto-sets `updated_at = now()` on UPDATE for: profiles, properties, units, vehicles, permits, credentials, zones
- `handle_new_user()` — auto-creates a `profiles` row when a user signs up via `auth.users`

### Helper Functions

| Function | Purpose |
|---|---|
| `is_property_member(property_id)` | Returns true if current user is any member of the property |
| `is_staff_plus(property_id)` | Returns true if current user is staff, property_admin, org_admin, or super_admin |
| `has_property_role(property_id, roles[])` | Returns true if current user has one of the specified roles |
| `is_unit_member(unit_id)` | Returns true if current user is a member of the unit |
| `property_role(property_id)` | Returns the user's role for the given property |
| `set_unit_claim_code(...)` | Sets/rotates the hashed claim code for a unit |

---

## Step 2: Row Level Security (APPLIED)

All 13 tables have RLS enabled. Policies use the helper functions above.

### Policy Summary

**organizations** — Fully locked (`false` for all). Managed via service role / Edge Functions only.

**properties** — Members can SELECT. Property admins + super admins can UPDATE/DELETE. INSERT blocked (use Edge Function).

**property_members** — Members can SELECT co-members. Admins can INSERT/UPDATE/DELETE.

**units** — Members can SELECT. Admins can INSERT/UPDATE/DELETE.

**unit_members** — Self or staff can SELECT. Admins can INSERT/DELETE. No UPDATE.

**vehicles** — Staff or owner can SELECT/UPDATE/DELETE. Owner can INSERT (must be property member + own vehicle).

**permits** — Staff or vehicle owner or unit member can SELECT. Unit members can INSERT visitor permits. Staff can INSERT any permit type. Staff or creator can UPDATE/DELETE visitor permits.

**credentials** — Staff can full CRUD. Residents can SELECT if they own the linked permit.

**scan_events** — Staff can SELECT and INSERT (must set scanned_by = self). No UPDATE or DELETE (immutable audit log).

**unit_claim_codes** — Admins can full CRUD. SELECT blocked for everyone else (verified server-side via Edge Function).

**zones** — Members can SELECT. Admins can INSERT/UPDATE/DELETE.

**permit_zone_access** — Visible if permit is visible. Staff can INSERT/DELETE. No UPDATE.

**profiles** — Users can SELECT/UPDATE own profile. Staff can SELECT profiles of members in their properties.

---

## Step 3: API Layer

### Approach

Use **Supabase client SDK directly** from Next.js for standard CRUD. Use **Supabase Edge Functions** for operations that need atomicity, service-role access, or public endpoints.

### Key Queries by Feature

#### Authentication
```typescript
// Sign up
const { data, error } = await supabase.auth.signUp({
  email, password,
  options: { data: { full_name } }
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({ email, password });

// Profile is auto-created by the handle_new_user trigger
```

#### Property Management (Admin)
```typescript
// List my properties with my role
const { data } = await supabase
  .from('property_members')
  .select('role, properties(id, name, address1, city, state, zip, timezone, settings)')
  .eq('user_id', userId);

// Update property settings
const { data } = await supabase
  .from('properties')
  .update({ name, settings })
  .eq('id', propertyId);
```

#### Unit Management (Admin)
```typescript
// List units with member count
const { data } = await supabase
  .from('units')
  .select('*, unit_members(user_id, profiles:user_id(full_name, email))')
  .eq('property_id', propertyId)
  .order('unit_label');

// Create unit
const { data } = await supabase
  .from('units')
  .insert({ property_id: propertyId, unit_label, building, floor, max_vehicles });
```

#### Vehicle Registration
```typescript
// My vehicles
const { data } = await supabase
  .from('vehicles')
  .select('*, permits(id, status, type, credentials(token, type, is_active))')
  .eq('property_id', propertyId)
  .eq('owner_user_id', userId)
  .eq('is_active', true);

// Register vehicle
const { data } = await supabase
  .from('vehicles')
  .insert({ property_id: propertyId, owner_user_id: userId, plate, state, make, model, color, year });
```

#### Permit + Credential Creation (Edge Function)
```typescript
// Edge Function: POST /functions/v1/create-permit
// Atomically: create permit → create credential (QR token) → link to zones
// Returns: { permit, credential }
```

#### QR Scan / Validation (Edge Function)
```typescript
// Edge Function: GET /functions/v1/validate-qr?token=<string>
// Public endpoint (rate-limited, no auth required)
// 1. Look up credential by token
// 2. Check credential.is_active
// 3. Load permit → check status + valid_from/valid_to
// 4. Load vehicle + unit info
// Returns: { valid, vehicle: { plate, make, model, color }, unit: { label }, permit: { type, status } }
```

#### Enforcement: Valid Plates Export
```typescript
// All active plates for a property
const { data } = await supabase
  .from('vehicles')
  .select('plate, state, make, model, color, year, owner_user_id, profiles:owner_user_id(full_name)')
  .eq('property_id', propertyId)
  .eq('is_active', true)
  .order('plate');
```

#### Resident Self-Signup (Edge Function)
```typescript
// Edge Function: POST /functions/v1/claim-unit
// 1. Verify claim code against unit_claim_codes (bcrypt hash)
// 2. Create property_member (role: resident)
// 3. Create unit_member
// 4. Return success
```

### Edge Functions Needed (MVP)

| Function | Purpose | Auth |
|---|---|---|
| `create-property` | Creates org + property + owner membership atomically | Authenticated |
| `create-permit` | Creates permit + credential + zone access atomically | Authenticated (staff+) |
| `claim-unit` | Resident self-signup via claim code | Authenticated (new user) |
| `validate-qr` | Resolves QR token → vehicle/permit info | Public (rate-limited) |

---

## Step 4: Next.js Frontend Structure

### Route Structure (App Router)

```
app/
├── (auth)/
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── layout.tsx                  # Auth layout (centered card)
│
├── (dashboard)/
│   ├── layout.tsx                  # Sidebar + topbar, auth guard
│   ├── page.tsx                    # Dashboard home (property selector)
│   │
│   ├── properties/
│   │   ├── page.tsx                # List my properties
│   │   └── [propertyId]/
│   │       ├── page.tsx            # Property overview/stats
│   │       ├── units/
│   │       │   └── page.tsx        # Unit list + management
│   │       ├── vehicles/
│   │       │   └── page.tsx        # Vehicle registry
│   │       ├── permits/
│   │       │   └── page.tsx        # Permit management
│   │       ├── enforcement/
│   │       │   └── page.tsx        # Scan log + plate export
│   │       ├── zones/
│   │       │   └── page.tsx        # Zone management
│   │       └── settings/
│   │           └── page.tsx        # Property settings + members
│   │
│   └── profile/
│       └── page.tsx                # User's own profile
│
├── (resident)/
│   ├── layout.tsx                  # Simpler resident layout
│   ├── page.tsx                    # Resident dashboard
│   ├── vehicles/
│   │   └── page.tsx                # My vehicles + register
│   ├── permits/
│   │   └── page.tsx                # My permits + visitor permits
│   └── qr/
│       └── page.tsx                # My QR codes
│
├── claim/
│   └── page.tsx                    # Resident self-signup (enter claim code)
│
├── scan/
│   └── [token]/page.tsx            # Public QR scan result
│
├── layout.tsx                      # Root layout
├── page.tsx                        # Landing page
└── globals.css
```

### Key Components

```
components/
├── ui/                             # Button, Input, Card, Modal, Table, Badge, Select
├── auth/
│   ├── LoginForm.tsx
│   ├── SignupForm.tsx
│   └── AuthGuard.tsx
├── layout/
│   ├── Sidebar.tsx
│   ├── Topbar.tsx
│   └── PropertySwitcher.tsx        # Dropdown to switch active property
├── properties/
│   ├── PropertyCard.tsx
│   └── PropertyForm.tsx
├── units/
│   ├── UnitTable.tsx
│   └── UnitForm.tsx
├── vehicles/
│   ├── VehicleTable.tsx
│   └── VehicleForm.tsx
├── permits/
│   ├── PermitTable.tsx
│   ├── PermitForm.tsx
│   └── VisitorPermitForm.tsx
├── credentials/
│   ├── QRCodeDisplay.tsx
│   ├── QRScanResult.tsx
│   └── CredentialBadge.tsx
└── enforcement/
    ├── ScanLogTable.tsx
    └── PlateExportButton.tsx
```

### State Management

- **Server state**: TanStack Query for caching, revalidation, optimistic updates
- **Active property context**: React Context (`PropertyContext`) storing selected `propertyId` + user's `role`
- **Auth state**: Supabase `onAuthStateChange` in a context (`AuthContext`)
- **Form state**: React Hook Form + Zod validation
- **No Redux/Zustand for MVP**

---

## Step 5: QR Token System

### How It Works (Using Existing Schema)

The existing schema uses a **Permit → Credential** model:
1. A **permit** is created for a vehicle+unit (type: resident or visitor)
2. A **credential** of type `qr` is created, linked to the permit, with a unique `token` string
3. The QR code encodes: `https://yourapp.com/scan/{token}`

### Token Properties

- Opaque string (UUID or random hex) — no encoded data
- Unique index for fast lookup
- `is_active` flag for instant revocation
- `last_seen_at` updated on each scan
- Linked to permit (which has `valid_from`/`valid_to` and `status`)

### Validation Flow

```
QR Scanned → /scan/{token}
  → Edge Function: validate-qr
    → SELECT credential WHERE token = ?
    → Check credential.is_active
    → JOIN permit → check status = 'active', valid_from/to
    → JOIN vehicle → get plate, make, model, color
    → JOIN unit via permit.unit_id → get unit_label
    → Return { valid: true/false, details }
```

### Enforcement Modes

1. **QR Scan**: Officer scans QR on windshield → sees green ✓ or red ✗ with vehicle details
2. **Plate Lookup**: Admin exports CSV of active plates. Future: search-by-plate.
3. **Scan Log**: Every scan creates a `scan_events` record with result, timestamp, and optional GPS coords

### Token Lifecycle

| Event | Action |
|---|---|
| Permit created | Credential (QR token) created via Edge Function |
| Permit revoked | Credential still exists but permit.status check fails |
| Vehicle deactivated | vehicles.is_active = false, validation fails |
| Token compromised | Set credential.is_active = false, issue new one |
| Permit expires | valid_to check fails on scan |

---

## Step 6: MVP Build Order

### Phase 1 — Foundation (Week 1)
> Goal: Auth works, admin can log in, property exists.

1. ~~Supabase project setup + schema~~ ✅ DONE
2. Next.js project init — `create-next-app`, Tailwind, Supabase client setup
3. Auth flow — login, signup, auto-profile creation, auth guard
4. Property creation — Edge Function: create-property (org + property + owner)
5. Property selector — dashboard layout with property switcher

**Milestone**: Admin can sign up, create a property, land on dashboard.

### Phase 2 — Core Data Management (Week 2)
> Goal: Admin can manage units, vehicles, and members.

1. Unit CRUD — table view, create/edit form
2. Property member management — add/remove staff/residents
3. Vehicle management — table view, register vehicles
4. Dashboard stats — unit count, vehicle count, active permits

**Milestone**: Admin can fully set up a property.

### Phase 3 — Permits + QR (Week 3)
> Goal: Permits created, QR codes generated and scannable.

1. Permit creation Edge Function — creates permit + credential atomically
2. Permit management UI — create, revoke, view status
3. QR code display — resident views/downloads QR for their permit
4. QR validation Edge Function — public scan endpoint
5. Scan result page — `/scan/[token]` shows validation result

**Milestone**: Full QR flow: create permit → generate QR → scan → validate.

### Phase 4 — Resident Self-Service (Week 4)
> Goal: Residents self-onboard and manage their own vehicles/permits.

1. Unit claim code system — admin generates codes, resident enters code to join
2. Claim unit Edge Function — verifies code, creates membership
3. Resident dashboard — my unit, my vehicles, my permits
4. Vehicle self-registration — resident adds vehicles (respects max_vehicles)
5. Visitor permit creation — resident creates short-term visitor permits

**Milestone**: Residents self-onboard and manage everything without admin.

### Phase 5 — Enforcement (Week 5)
> Goal: Enforcement team can verify parking.

1. Enforcement role + member management
2. Scan log UI — view recent scans with results
3. Plate export — CSV download of all active plates
4. Optimized mobile scan view — fast QR result display

**Milestone**: Enforcement can verify any vehicle.

### Phase 6 — Polish + Launch (Week 5-6)
> Goal: Production-ready.

1. Error handling — toasts, form validation, loading states
2. Responsive design — mobile-friendly
3. Email notifications — welcome, invite emails
4. Rate limiting — on QR validation endpoint
5. Deploy to Vercel — env vars, domain
6. Zone management UI (if needed for MVP)

---

## Quick Reference

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=https://mwjczjwqdqavhqehmdgn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Package Dependencies
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2",
    "@supabase/ssr": "^0.5",
    "@tanstack/react-query": "^5",
    "react-hook-form": "^7",
    "zod": "^3",
    "@hookform/resolvers": "^3",
    "qrcode.react": "^4",
    "next": "^15",
    "react": "^19",
    "tailwindcss": "^4"
  }
}
```
