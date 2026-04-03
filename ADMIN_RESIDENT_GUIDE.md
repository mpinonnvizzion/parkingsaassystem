# Parking SaaS: Admin & Resident Guide

## ADMIN SIDE (Property Managers)

### Overview
The admin side is for **property managers** to set up and manage parking permits for their buildings.

### 1. Sign Up & Create a Property

**Step 1:** Go to **Sign Up** on the landing page
- Enter email and password
- Confirm via email link

**Step 2:** Log in and go to **Properties** tab
- Click **Create Property**
- Fill in: property name, address, timezone
- You become the owner (super_admin role)

### 2. Add Units (Apartments/Parking Spaces)

Go to **Units** tab
- Click **Create Unit**
- Enter: unit label (e.g., `101`, `Suite A`), building, floor, max vehicles
- Each unit can have a **unit claim code** for residents to self-signup

### 3. Register Vehicles

Go to **Vehicles** tab
- Click **Add Vehicle**
- Enter: license plate, state, make, model, color, year
- Optionally assign to a resident (owner_user_id)
- Mark as active/inactive

### 4. Create Permits

Go to **Permits** tab
- Click **Create Permit**
- Choose: **Resident** (owned by unit member) OR **Visitor** (temporary, e.g., 1 day)
- Select vehicle, unit, validity dates
- System auto-generates a QR code for parking validation
- Active permits → residents can park / visitors can scan QR

### 5. Enforcement

Go to **Enforcement** tab
- Export list of valid license plates as CSV (for parking meters)
- Use phone camera to scan QR codes and verify permit status
- *(Future: full QR scanner UI + enforcement dashboard)*

---

## RESIDENT SIDE (Vehicle Owners)

### Current State ⚠️

The resident portal is **PARTIALLY BUILT**. Right now, a resident can:

1. Get invited to a property by the admin
2. Log in and view their assigned unit
3. View permits associated with their unit
4. See the QR code for parking validation

### How to Test as a Resident

**Step 1:** Create a second user account
- Go to Sign Up on the landing page
- Use a different email (e.g., `resident@example.com`)
- Confirm email link

**Step 2:** Admin adds the resident to the property
- ⚠️ **NOT IN THE UI YET** — requires manual database setup
- Admin would add the user to `property_members` table with role=`resident`
- OR: Admin creates a unit claim code, resident signs up with it (not UI-implemented yet)

**Step 3:** Resident logs in
- Use resident email/password
- Go to **Properties** — they'll see your property
- Click into the property → view units they're members of
- View permits and QR codes for parking validation

---

## Example Workflow

### Admin Setup

| Action | Details |
|--------|---------|
| Sign up as admin | Email: `admin@example.com` |
| Create property | "Riverside Apartments" |
| Create units | Unit 101, 102, 103 (3 units) |
| Register vehicles | ABC123 (Tesla), XYZ789 (Honda) |
| Create permits | Resident permit (ABC123 → Unit 101)<br/>Visitor permit (XYZ789, 1 day) |

### Resident Experience (Currently Limited)

1. Resident signs up: `resident@example.com`
2. Admin adds them to Unit 101 (database-level, not UI)
3. Resident logs in → sees **Riverside Apartments**
4. Resident views Unit 101 → sees their resident permit
5. Resident taps on permit → sees QR code (for gate entry / validation)

---

## What's Missing (To-Do List)

### Not Yet Built (Resident Features)

| Feature | Impact |
|---------|--------|
| **Resident self-signup** | Residents get an invite code to claim their unit without admin manual setup |
| **Resident dashboard** | Dashboard showing units, vehicles, permits, QR codes |
| **Resident vehicle mgmt** | Residents can register/edit their own vehicles (not admin-only) |
| **Visitor permit mgmt** | Residents can add/revoke guest vehicle permits (currently admin-only) |
| **QR scanner UI** | Enforcement staff can scan permits with phone camera (currently placeholder) |
| **Scan analytics** | Dashboard showing permit scans, invalid entries, audit trail |

---

## Next Steps to Build Resident Features

### Priority Order:

1. **Resident self-signup page** — Let residents claim units with invite codes
2. **Resident dashboard** — Show their units, vehicles, and permits
3. **QR scanner UI** — Mobile-friendly permit validation
4. **Scan analytics** — View parking activity by permit/vehicle

### Database Support ✅

The database is **already set up** for residents:

- **`unit_members`** — tracks which users belong to which units
- **`unit_claim_codes`** — invite codes for unit signup
- **`property_members`** — tracks user roles (resident, staff, admin)
- **`scan_events`** — audit trail of every QR validation
- **RLS policies** — automatically restrict residents to their own units/vehicles

**The API/auth layer is ready — just need to build the UI pages!**

---

## Summary

✅ **Admin side = COMPLETE**
- Manage properties, units, vehicles, permits
- Create and revoke visitor passes
- Export valid plates for enforcement

⚠️ **Resident side = PARTIAL**
- Can view units and permits
- Can see QR codes
- **Missing:** self-signup UI, vehicle management, visitor permit creation

**Next step:** Build resident portal pages to let residents self-signup and manage vehicles
