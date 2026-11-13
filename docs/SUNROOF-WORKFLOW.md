# Sunrooof CRM workflow and implementation record

Updated 13 November 2026. This is the meeting record and implementation checklist. Confirmed requirements are not claims of completed features.

## Scope

Retain the React and FastAPI architecture and evolve the UI in this separate Sunrooof project. No new opportunities or new orders are created here. Existing booked orders arrive from the agreed Sales/Zoho source. Each person has a separate departmental dashboard connected to the shared order. Scope starts at post-design and ends at cleared for dispatch: production, QC, packing and Accounts confirmation of dispatch-stage dues. Actual shipping and installation are later phases. Preserve the original Magppie project.

Visual direction: approximately 45% powder blue (#8DB9F0), 45% soft lavender-white (#E9E8F8), 10% warm peach (#F5B69E). Use clear typography, generous spacing, restrained motion, accessible controls and responsive layouts. Ratios are a visual balance, not a pixel constraint. Apple-inspired restraint is the primary direction. Bento layout and Swiss typography provide structure; glass, neumorphism, skeuomorphism, Art Nouveau curves, liquid chrome and De Stijl are subtle influences only, never competing decoration.

## Confirmed workflow

1. CRM assigns a designer using location, workload and square feet relative to pay-grade capacity. Shivang is Design Head; he can assign/reassign manually and configure capacity. Exact capacity calculation is deferred.
2. Designer chooses an available person and slot from a location-aware calendar. Slots cannot overlap for one person. Measurement Executive bookings are directly confirmed; that executive cannot accept, reject or reschedule. Installation Managers contact the client and can accept/set time, reschedule or reject. Rejection returns to the designer.
3. Measurement normally happens once. Completed checklist, drawings and photos are mandatory. Designer can request corrections or exceptionally book a fresh visit. Designer approval is required before drawing preparation.
4. Each drawing submission requires internal CAD and client PDF. Client approves/rejects the exact version using a shared link; rejection reason is mandatory. Keep history. V4 and all later versions require Shivang approval before sharing with the client.
5. Unpaid booking amounts carry forward to production dues. Accounts verifies receipts; rejection needs a reason and returns to the designer. Factory handover requires approved drawings and confirmed production dues; no payment block when nothing is due under the agreed plan.
6. Designer clicks Send to factory. If no PDI has been assigned, ask whether to book one. Yes holds factory handover until the visit is completed and approved by the designer. No permits handover once other gates are satisfied. PDI requires checklist, drawings and photos.
7. Designer supplies model codes and quantities. Retrieve the Sales-generated BOM; generate/retrieve the order PI and matching production files automatically. Factory accesses the package from the order. A code alone does not replace order-specific prices, quantities or payment terms.
8. An order can contain multiple codes, each with its own quantity. The order moves through production together; no partial-order readiness was agreed.
9. Chitranjan can accept factory handover or report an issue; he cannot reject the order. Issue handling is undecided.
10. Production started, production completed, QC, packing, then cleared for dispatch. Failed QC requires Repair or Reproduce, a mandatory reason and a fresh QC pass before proceeding. Accounts confirms dispatch-stage dues before clearance.

## Flags and provisional rules

| ID | Decision | Status |
| --- | --- | --- |
| F01 | Capacity formula, monthly versus unfinished square feet, weighting and eligibility | Deferred. Do not invent thresholds. |
| F02 | Designer records payment and submits to Accounts during post-design | Provisional owner; confirm later. |
| F03 | PDI uses the measurement calendar and acceptance rules | Provisional; confirm later. |
| F04 | Fresh client approval when PDI changes an approved design | Undecided. |
| F05 | Action and production blocking when Chitranjan reports a handover issue | Undecided. |
| F06 | Chitranjan marks production started and completed | Provisional owner. |
| F07 | Chitranjan performs and records QC | Provisional owner. |
| F08 | Scope of repair/reproduction within an order | Unresolved. The affected-items-only proposal was rejected; no replacement was specified. |
| F09 | Same two-password access arrangement | Requested; exact permissions and setup are unconfirmed. No passwords belong in source. |
| F10 | Location/workload assignment before capacity policy is defined | Keep automatic capacity-based assignment pending; manual assignment is available initially. |

## Required inputs and remaining planning

- Model catalogue, model-code matching production files and access to the BOM source. Files will be supplied later.
- PI source/template, agreed order pricing and Sales handoff contract. No new percentage defaults.
- Measurement and PDI checklist templates, personnel, locations and calendar availability.
- Account-to-person role mapping for Shivang, designers, Accounts, Chitranjan and visit staff. Existing generic administrator permissions are not these business roles.
- Separate rafter/console schedules, customer installation versus arrival dates, regional transit data and production lead times need confirmation. Conversations proposed a 15-day warning; do not enforce it without final rules.
- QC checklist, packing evidence and clearance ownership still need definition.
- Isolated Sunrooof database/storage and environment configuration before live use. Zoho data migration is a later step.

## Zoho evidence

Read-only research on 12 November inspected module definitions, blueprints, automation metadata and selected operational records. Main observed factory route: Handover to Factory → Planning Stage → Handover to Production → Production Started → Produced. Planning also exposes Pending from SM and Assign Designer. No explicit factory-handover rejection action was found in the inspected main route; custom widget internals and ordinary-user permissions remain unverified. See docs/sunroof-research-2026-11-12/WORKFLOW-REVIEW.txt. New confirmed Sunrooof rules take precedence over legacy Zoho alternatives.

## Work completed before implementation

- Created the separate project copy; original Magppie project unchanged.
- Reviewed the three supplied workflow conversations and recorded the decisions above.
- Completed read-only Zoho research; no live Zoho records changed.
- No Sunrooof deployment, database import or production credential setup.

## Current departmental implementation

The first central intake screen was superseded after the user clarified that the Magppie-style departmental structure must remain. New-order controls and the creation API were removed. Separate Design, Design Head, Measurement, Accounts and Factory workspaces now share order data and department-scoped actions. Details and explicit limits are recorded in SUNROOF-BUILD-STATUS.md; demo instructions are in SUNROOOF-DEMO-GUIDE.md.

The official brand is Sunrooof with three o characters. Existing source-folder and technical module names are retained to avoid breaking paths.
