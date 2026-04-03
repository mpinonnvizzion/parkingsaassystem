const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1F4E78" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("Parking SaaS: Admin & Resident Guide")]
      }),

      new Paragraph({
        children: [new TextRun("This guide explains how to use both the admin dashboard (property management) and resident portal (vehicle registration & permits).")]
      }),

      new Paragraph({ children: [new TextRun("")] }),

      // ADMIN SIDE
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("ADMIN SIDE (Property Managers)")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Overview")] }),

      new Paragraph({
        children: [new TextRun("The admin side is for property managers to set up and manage parking permits for their buildings.")]
      }),

      new Paragraph({ children: [new TextRun("")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("1. Sign Up & Create a Property")] }),

      new Paragraph({ children: [new TextRun("Step 1: Go to Sign Up on the landing page")] }),
      new Paragraph({ children: [new TextRun("• Enter email and password")] }),
      new Paragraph({ children: [new TextRun("• Confirm via email link")] }),

      new Paragraph({ children: [new TextRun("")] }),

      new Paragraph({ children: [new TextRun("Step 2: Log in and go to Properties tab")] }),
      new Paragraph({ children: [new TextRun("• Click Create Property")] }),
      new Paragraph({ children: [new TextRun("• Fill in: name, address, timezone")] }),
      new Paragraph({ children: [new TextRun("• You become the owner")] }),

      new Paragraph({ children: [new TextRun("")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2. Add Units (Apartments)")] }),

      new Paragraph({ children: [new TextRun("Go to Units tab")] }),
      new Paragraph({ children: [new TextRun("• Click Create Unit")] }),
      new Paragraph({ children: [new TextRun("• Enter: unit label (e.g., 101, Suite A), building, floor, max vehicles")] }),

      new Paragraph({ children: [new TextRun("")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3. Register Vehicles")] }),

      new Paragraph({ children: [new TextRun("Go to Vehicles tab")] }),
      new Paragraph({ children: [new TextRun("• Click Add Vehicle")] }),
      new Paragraph({ children: [new TextRun("• Enter: plate, state, make, model, color, year")] }),

      new Paragraph({ children: [new TextRun("")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4. Create Permits")] }),

      new Paragraph({ children: [new TextRun("Go to Permits tab")] }),
      new Paragraph({ children: [new TextRun("• Click Create Permit")] }),
      new Paragraph({ children: [new TextRun("• Choose: Resident (owned by unit member) OR Visitor (temporary)")] }),
      new Paragraph({ children: [new TextRun("• System auto-generates a QR code for parking validation")] }),

      new Paragraph({ children: [new TextRun("")] }),

      // RESIDENT SIDE
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("RESIDENT SIDE (Vehicle Owners)")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Current State")] }),

      new Paragraph({
        children: [new TextRun("The resident portal is PARTIALLY BUILT. Right now residents can:")]
      }),

      new Paragraph({ children: [new TextRun("1. Get invited to a property by the admin")] }),
      new Paragraph({ children: [new TextRun("2. Log in and view their assigned unit")] }),
      new Paragraph({ children: [new TextRun("3. View permits for their unit")] }),
      new Paragraph({ children: [new TextRun("4. See the QR code for parking validation")] }),

      new Paragraph({ children: [new TextRun("")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("How to Test as a Resident")] }),

      new Paragraph({
        children: [new TextRun("Step 1: Create a SECOND user account (resident@example.com)")]
      }),

      new Paragraph({
        children: [new TextRun("Step 2: As admin, add the resident to your property")]
      }),

      new Paragraph({
        children: [new TextRun("Note: This is database-level only, not yet in the UI. You'll need to ask an admin to set this up or use the Supabase dashboard directly.")]
      }),

      new Paragraph({
        children: [new TextRun("Step 3: Log in as the resident")]
      }),

      new Paragraph({
        children: [new TextRun("• They'll see your property and their assigned units")]
      }),

      new Paragraph({
        children: [new TextRun("• They can view permits and scan QR codes")]
      }),

      new Paragraph({ children: [new TextRun("")] }),

      // WHAT'S MISSING
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("What's NOT Yet Built (To-Do)")] }),

      new Paragraph({ children: [new TextRun("1. Resident self-signup UI - invite code claiming")] }),
      new Paragraph({ children: [new TextRun("2. Resident dashboard - view units, vehicles, permits")] }),
      new Paragraph({ children: [new TextRun("3. Resident vehicle management - add/edit own cars")] }),
      new Paragraph({ children: [new TextRun("4. Visitor permit management - residents create guest permits")] }),
      new Paragraph({ children: [new TextRun("5. QR scanner UI - mobile-friendly permit validation")] }),
      new Paragraph({ children: [new TextRun("6. Scan analytics - view parking activity and audit trail")] }),

      new Paragraph({ children: [new TextRun("")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Summary")] }),

      new Paragraph({
        children: [new TextRun("✅ Admin side = COMPLETE (manage properties, units, vehicles, permits)")]
      }),

      new Paragraph({
        children: [new TextRun("⚠️ Resident side = PARTIAL (can view units and permits, but no self-signup or management UI)")]
      }),

      new Paragraph({
        children: [new TextRun("Next step: Build resident portal pages to let residents self-signup and manage vehicles")]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("ADMIN_RESIDENT_GUIDE.docx", buffer);
  console.log("✓ Guide created: ADMIN_RESIDENT_GUIDE.docx");
});
