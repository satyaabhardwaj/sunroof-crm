# Sunrooof CRM build status

Updated 13 November 2026. Departmental demo increment. Local only; not a completed production rollout.

## Corrected application structure

The initial central order-intake screen was the wrong interpretation and has been replaced. There is no New opportunity or New order screen or Sunrooof order-creation API. This CRM starts with existing booked orders entering post-design. Live source mapping is still pending; labelled fictional booked orders populate the isolated demo.

Five separate workspaces use the same order record:

- Design at `/design/`: assigned orders, measurement/PDI booking, measurement review, payment submission, factory issues and order updates.
- Design Head at `/design-head/`: Shivang's assignments/reassignments, team workload, personnel roster and flagged decisions. The V4 approval queue is explicitly awaiting the drawing-version integration.
- Measurement at `/measurement/`: assigned visits, schedule, Installation Manager acceptance/rescheduling/rejection, mandatory checklist/drawing/photo submission and designer-review status.
- Accounts at `/accounts/`: receipts awaiting verification, production/dispatch dues and payment history. Only Accounts can confirm/reject a receipt; rejection requires a reason.
- Factory at `/factory/`: received handovers, acceptance, production start/completion, QC pass/fail, repair/reproduce with a reason, packing and issues sent back to Design.

## Interconnection and permissions

Booking creates Measurement work from Design. Executive bookings confirm immediately; Installation Managers must respond. Rejection returns booking responsibility to Design. Measurement submission becomes a designer review task; approval moves to drawing preparation, and requested corrections return to the measurement person.

Designer payment submissions appear in Accounts. Confirmed receipts reduce the known milestone balance and the result appears in Design. Unknown Sales payment plans remain unknown; no percentages or totals are invented. Factory updates and issues appear in Design's shared history. Updates can be opened directly to their order.

Ordinary logins are mapped server-side to departments. Designers see their assigned orders and measurement personnel see their assigned visits. URL or query-string changes cannot impersonate another department. Administrators can preview all department screens and filter by person. Shared data refreshes every four seconds when the screen is idle; open forms retain their contents and stale writes require refresh and review. Files are authorised per order and tied to the specific visit; prior-visit evidence cannot fulfil a new submission.

## Verification

- Design and authentication TypeScript checks and production builds passed.
- Backend department and existing API tests: 22 passed. Covers role and personal-order isolation, denied privilege switching, absence of order creation, slot conflicts, executive/IM differences, mandatory evidence, designer review, receipt verification, revision rollback, factory prerequisites and shared issues.
- Visit-specific upload safeguards were rechecked with all 5 departmental test cases passing.
- Browser checks passed for all five routes, no opportunity/order creation controls, Design-to-Measurement booking, Accounts-to-Design confirmation, Factory-to-Design issues, and all five personal login routes. The designer login was verified to exclude another designer's order. Browser console errors: none. Mobile widths were checked at 390px; a clipped mobile navigation row found during visual inspection was corrected and rechecked.

## Important limits

- Real Zoho Orders/V2 mapping, import/deduplication and live data synchronisation are NOT complete. No live Zoho records were changed by this increment.
- Automatic designer allocation awaits the capacity formula.
- CAD/PDF versioning, public client approvals, Shivang's V4 approval action and production package generation are NOT implemented. The supplied BOM source and model-code production files are still needed.
- The Send to factory/PDI warning flow and final dispatch clearance are not implemented. Sample factory orders explicitly start from a pre-existing handover snapshot for the demo; the UI does not fabricate prior approvals or files.
- Rework scope and factory-issue handling are still flagged. Issues are recorded without rejecting or changing the order stage. Starting an issue-bearing handover is not implemented pending that policy. The return from repair/reproduction to repeat QC is not enabled until its scope is agreed.
- Checklist templates are not supplied. Demo submissions require recorded checklist findings, a drawing and a site photo; these are not claimed as the final business checklist.
- Local document storage is implemented for the isolated preview only. Hosted document storage must be explicitly connected; there is no silent hosted fallback.
- Account-to-person mappings in the demo are fictional, although the reference names now come from Zoho. Real staff provisioning and the earlier two-password requirement remain for confirmation.
- Magppie's original application and credentials remain untouched.

## 13 November: compact screens, phone view and staff reference

- Replaced repeated dashboard cards with one work list and stage filters in each department. Original Magppie client windows, departmental navigation and payment review remain the basis.
- The supplied SUNROOOF_1.png wordmark (including its trademark) replaces the old sun icon and screenshot wordmark on sign-in and module headers. The original PNG is preserved; its surrounding whitespace is framed out in the UI. Restrained spacing and typography were informed by https://sunrooof.com; the agreed powder blue, lavender-white and peach palette stays subtle.
- Cash totals are visible in all five departments, scoped to visible orders. Factory and Measurement get aggregate totals, not private receipt references.
- A Phone/Desktop chooser appears before sign-in. Phone view uses readable labelled cards, touch navigation and single-column client forms.
- New sessions expire after 20 minutes without input. Explicit user activity renews them; background polling does not. Expired sessions cannot be renewed. Sleep/focus and cross-tab activity are handled by the client monitor.
- A read-only, fully paginated Zoho user lookup supplied 7 active designers, 10 active installation managers, Shivang Sharma and Ranjay. See SUNROOOF-STAFF-REFERENCE.md for source roles, inactive records and unresolved ownership/measurement-role mappings. Live Zoho was not changed.
- The owner requested a new shared password for the six local QA/demo logins. It was applied to the isolated SQLite database, with their previous sessions revoked. No password is stored in source files or documentation.

### Verification of this update

- Authentication UI: 49 tests passed. Design UI: 53 tests passed across the initial run and the focused appliance-suite retry (its first run hit the time limit under parallel load). Both TypeScript/production builds passed.
- Backend: 61 distinct selected tests now pass across the initial run and focused rechecks. A SQLite logout cascade assumption was corrected with explicit realm-session cleanup; all three role cases and both inactivity tests passed afterward. Existing MFA/policy, departmental and payment tests passed.
- Browser: new requested password signs in successfully; Phone/Desktop chooser works; phone widths stay within 390px; labelled client payment cards use one column; cash flow is visible across all five departments; directory shows 7 active designers, 10 installation managers, Shivang and Ranjay with source notes. Desktop was checked at 1440px. No browser console errors were reported.
- Screenshot proofs: `Documents/ChatGPT/satya/artifacts/sunrooof-desktop.jpg` and `sunrooof-phone.jpg`.
