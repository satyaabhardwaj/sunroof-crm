# Sunrooof departmental demo

13 November 2026. Use this to show the architecture and implemented handoffs accurately.

## Open the local demo

Use http://127.0.0.1:4302/login on this Mac. The existing QA administrator login opens all five departmental tabs. The owner updated the password for all six local demo logins on 13 November. Do not put passwords in this document or source control. Choose Phone or Desktop before signing in; sessions expire after 20 minutes without user activity.

Personal demo logins use the same local QA password:

| Email | Workspace and access |
| --- | --- |
| design@sunroof.local | Fictional assignments shown under Amisha Sunrooof's reference name |
| design-head@sunroof.local | Shivang's design-head role with team assignment access |
| measurement@sunroof.local | Demo Measurement Executive's assigned visits |
| accounts@sunroof.local | Accounts receipt verification and balances |
| factory@sunroof.local | Factory handovers, production and QC |

These are fictional local demo accounts, not real staff accounts. Sign out before demonstrating another personal login, or use separate browser profiles. The admin department tabs are the easiest way to demonstrate the complete handoff.

## Demo sequence

1. Open Design Head. Show existing booked orders, assignment and team workload. Explain that there is no opportunity or order creation in this phase. Automatic pay-grade capacity allocation remains a flagged decision.
2. Open Design. Choose an existing order awaiting measurement. Choose a measurement person, location and future time; show recorded occupied slots. Measurement Executives confirm directly. Installation Managers contact the client and accept/reschedule/reject.
3. Open Measurement. Refresh if needed. The visit from Design is visible. Upload a real test drawing (PDF/image) and site photo (image), record checklist findings and submit. Return to Design to review, approve or request corrections.
4. In Design, submit a test receipt with an amount, reference and milestone. Open Accounts to confirm or return it with a reason. Return to Design to show the Accounts decision on the same order. Only confirmed receipts reduce the balance.
5. Open Factory. Use a labelled sample order that already starts at factory handover, accept it, mark production started/completed and record QC. Failed QC needs a reason and repair/reproduce choice. Report an issue and show it on Design's order and Updates list.
6. Open Workflow decisions in Design Head. Show what is agreed, what is provisional and what is not yet implemented. Do not describe pending client-approval links, BOM/PI generation or dispatch clearance as completed features.

If another team changed the data while a form was open, the app asks to refresh and review before retrying. This deliberately protects against overwriting the other person's work.

## Demo data and source material

The small Demo badge labels the isolated sample orders. Existing sample orders are fictional and are not imported live Zoho orders. Read-only Zoho research is documented under `docs/sunroof-research-2026-11-12`. Operational Orders/V2 reconciliation is required before live import. The original Magppie module screens and the confirmed conversation decisions guided the departmental structure.

## Staff and cash flow

People contains a read-only Zoho reference: 7 active designers, 10 installation managers and the two heads, with inactive records available separately. Measurement-executive classification is unconfirmed. Ranjay is Zoho's factory head; Chitranjan remains the provisional workflow owner until confirmed. See SUNROOOF-STAFF-REFERENCE.md. Real staff logins are not provisioned.

Every department shows received, pending confirmation and known outstanding amounts for its visible orders. Cash flow opens the client breakdown; outgoing expenses are not recorded. The blue/lavender-white palette with small peach accents is shared by the phone and desktop layouts.

## Verification record

Verified in browser: all five departmental routes, absence of new-order controls, measurement booking handoff, payment confirmation handoff, factory issue handoff, personal-login routing and designer-specific visibility. No browser console errors were found.


See SUNROOF-BUILD-STATUS.md for backend and build checks. Screenshots and disposable browser test artefacts are in `.local/sunroof-qa` and are not committed. The local server uses a separate disposable SQLite database; the production architecture remains the inherited FastAPI/database architecture and needs an isolated live configuration.
