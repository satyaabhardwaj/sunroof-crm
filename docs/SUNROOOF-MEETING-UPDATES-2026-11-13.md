# SUNROOOF — new meeting review, 13 November 2026

Status: requirements review, not a record of implemented features. Read alongside SUNROOF-WORKFLOW.md and SUNROOF-BUILD-STATUS.md. No application behavior, live records or deployments changed in this review.

## Sources

- A: round-robin conversation, attachment 2512eb8a-bd18-4af6-b12f-8710f97334a7/Pasted text.txt.
- B: designer/payment/stage conversation, attachment a1a20533-527a-41d3-b6e7-bc3476b61675/Pasted text.txt.
- C: codes, identity and sub-orders conversation, attachment bb7762e3-b60f-4a46-9799-07096eef59e9/Pasted text.txt.
- Whiteboard: WhatsApp Image 2026-11-13 at 3.03.05 PM.jpeg.

Transcripts contain transcription errors and changing proposals. Examples and tentative remarks are not fixed thresholds. The whiteboard supplies stage names; it does not settle every approval, owner or exception.

## Departmental journey from the whiteboard

| Department/action | Stages and handoff |
| --- | --- |
| Designer | Measurement to be assigned → measurement in progress → measurement done → design in progress → approval pending → approved → production payment pending |
| Accounts | Verify production payment; rejection returns with reason |
| Designer | Handover to factory with required dispatch/requirement date, after applicable approvals and payment gates |
| Factory | Production pending/planning → production started → QC → ready for packing/packed |
| Factory exception | QC failure → repair or reproduction with reason → fresh QC |
| Designer + Accounts | Rafter/dispatch payment requested or pending → Accounts verification |
| Dispatch coordination | Request for dispatch → dispatch pending → ready to dispatch → dispatched |

“Ready for packing” versus “packed” is unresolved. Accounts approves money; designer tracks the customer journey. The bottom-row ownership marks do not justify letting designers verify their own receipts. Actual dispatch remains a scope question: the earlier agreed endpoint was ready/cleared for dispatch.

UI interpretation: separate departmental work queues, a simple client window and shared progress history. These are logical stages, not a requirement to display eighteen columns or repeat every stage on every dashboard. Keep the Magppie-style payment review and restrained layout.

## Requirements captured from the new meetings

### Assignment and availability (A; C 15:30–17:49)

- Intelligent allocation uses availability, workload and design suitability rather than blind rotation. Shivang retains manual reassignment.
- Designer suitability considers skill ratings, project complexity, geography/international work, size and client/contact characteristics. Celebrity-client handling is discussed. Residential/commercial alone does not determine difficulty.
- Existing square-footage/pay-grade capacity requirement remains; exact scoring, tie-breaks and fallback when nobody qualifies are open. Designer ratings out of five will be supplied in a spreadsheet.
- Daily availability/punch-in is discussed. Do not silently equate the existing 20-minute idle security logout with going off duty.
- Simple projects may bypass post-design; complex ones enter it. The eligibility checklist and route owner need confirmation. HVAC, plumbing, beams and electrical controls are examples, not a finalized classifier or numeric cutoff.
- Latest C clarification: measurement selection uses geography and travel time with calendar availability; do not apply designer skill scoring to measurement. Installation staffing/man-days require later detail.

### Measurement and communication (A)

- Designer sees suggested suitable people, their location and calendar and may choose another eligible person.
- Slot examples discussed: 09:00–12:00, 13:00–16:00, 17:00–19:00. Travel and work duration can require more than one slot; prevent overlap. Confirm whether these are universal hours.
- Measurement Executive: designer agrees the actual slot with the client; booking is directly confirmed. Executive cannot accept/reject/reschedule.
- Installation Manager: designer assigns the person, optionally suggests a slot; the manager contacts the client/POC and confirms the actual date and time. Rejection returns to the designer.
- Rescheduling count, flag versus approval, and escalation owner are unresolved. Discussion alternates between a limit of two changes and a flag after the third. Do not implement a guessed hard limit.
- Record contact person, notes/voice notes and timing changes for designer visibility. Store full address, map link and site contact.
- Arrival check-in should capture time, photo and location; show lateness. Reminder/travel policy and verification method need definition. Browser location cannot guarantee protection against location spoofing. No automatic fines were agreed.
- Checklist, drawings and photos remain mandatory; designer reviews and can request corrections or a fresh visit. Keep measurement done distinct from design started so holds and design time are visible.
- Measurement staff receive relevant site/contact/drawing information, **not cash-flow information**. This supersedes the earlier request for cash flow in every module; current demo behavior still needs changing.

### Design and client approval (A, B)

- Add an external design-tool launch action; URL and any data passed to it are still required. Do not assume the old kitchen designer URL is correct for SUNROOOF.
- Keep mandatory CAD + client-facing PDF, version history and V4+ approval by Shivang from the earlier agreement.
- Submit for approval prepares/sends the client approval link by email and offers Copy link for manual WhatsApp sharing. No automatic posting to a WhatsApp group is required by this discussion.
- Client approves/rejects the relevant version. Whether designer may record an offline client decision needs clarification; do not let this silently bypass version approval.
- Client updates at visit confirmation and major milestones are requested. Templates, recipients, payment-link provider and delivery rules remain inputs. No messages were sent during this review.

### Payments and dates (A, B; C 17:27–17:43)

- Keep accrued milestone dues/overdue separate from future installments. Unpaid booking dues retain their identity even when included in the total required to proceed; avoid double counting or relabeling them as a new production charge.
- Example only: contract ₹10 lakh, cumulative due ₹5 lakh, confirmed received ₹1.5 lakh means ₹3.5 lakh outstanding against due milestones and ₹5 lakh future installments. Actual overdue status also depends on the agreed due date/event.
- Designers need the payment journey and confirmed amounts; Accounts verifies submitted receipts with rejection reasons. Unverified receipts do not release factory gates.
- Token-only handoff is proposed; ₹50,000 is mentioned but not safely established as a universal threshold. Four payment plans are to be supplied. Do not invent percentages or replace plans with that example.
- Bank and “management discount” must be distinguishable, but the latter term needs clarification: actual approved discount versus management/cash collection changes the accounting treatment.
- Capture rafter installation, console installation and inauguration dates, and required dispatch/requirement date for factory. Back-calculated deadlines need approved lead times.
- Factory schedules against the required date, not simply the moment payment arrives.

### Factory, PDI and dispatch (B; whiteboard)

- Factory needs a planning/pending stage before production starts. QC failure returns to repair/reproduction and requires another QC pass.
- Keep designer visibility while factory owns the active work; notify designer when the agreed packing/readiness event occurs.
- Prior optional PDI gate conflicts with the brief “PDA? No” exchange in B around 13:26. This is insufficient to remove PDI; clarify its continued role.
- Rafter payment confirmation precedes dispatch authorization. Whether Accounts confirmation automatically creates a dispatch request remains open.
- Factory handover issue handling, QC owner/evidence, packing evidence and affected-item rework scope remain open from the original review.

### Codes, project identity and additional areas (C 0:00–15:00, 17:53–20:46)

- Model codes link the order to Sales BOM, PI and matching production files. Catalogues/templates are still required; a code does not determine commercial totals alone.
- Shipping address and other mandatory handoff fields must be validated. Identify upstream Sales omissions; do not build a new Sales module or modify live Zoho as part of this review.
- Preserve immutable source identifiers and links between lead, opportunity, customer, project and orders. Renaming a project must not break conversion/history links.
- Search should find a project through customer, architect, coordinator/POC, billing name and identifiers. Phone-based matching is discussed, but shared numbers must not silently merge unrelated customers.
- One customer can have multiple sites/projects; a project can have multiple areas/orders. Additional areas may be requested after the initial sale and follow their own workflow, payments and dispatch timing.
- Each area has rafter and console parts, illustrated as 1R/1C, 2R/2C. Final ID format and whether “order” and “sub-order” refer to the same area entity are unresolved.
- Confirmed by the user on 13 November: designers may add an additional area/sub-order under an existing project in this phase. New standalone projects/opportunities still come from Sales/Zoho. This replaces the earlier blanket prohibition on order creation; hierarchy, cutoff and commercial approval remain open.
- Cutoff changes during discussion: before factory handover, then before dispatch; later examples add an area after other areas have shipped. Confirm cutoff per project/area and source/approval of new commercial values.
- Ship together or separately is requested for areas/orders, with potentially different payment progress. This does not automatically authorize partial production of the model-code lines within one area.
- Combined transport should avoid duplicate freight. A freight waiver and a constraint to dispatch together are discussed; approver, revised PI/value, allocation, and ungrouping consequences need approval. Do not silently subtract charges or alter confirmed receipts.
- Sales incentive implications are mentioned, but no incentive formula or new incentive module was agreed.

## Changes against the existing plan

| Earlier plan | New evidence / treatment |
| --- | --- |
| No creation of orders here | Confirmed: designer-created additional area/sub-order under an existing project; standalone projects still come from Sales/Zoho |
| Whole order produced together | Multiple areas can progress/ship separately; distinguish area/order from model-code line before changing gates |
| Designer books both visit types with time | IM should choose/confirm actual slot after contacting client; ME remains directly booked |
| Cash flow in every module | Explicitly exclude measurement staff from financial data |
| Booking arrears carry forward | Preserve original milestone attribution while including arrears in cumulative dues |
| Ends ready for dispatch | Whiteboard includes dispatched; scope extension needs confirmation |
| Optional PDI at factory handover | Latest brief exchange is ambiguous; retain prior rule pending answer |

## Questions — ask one at a time

1. ANSWERED YES, 13 November: designer may add areas/sub-orders under an existing project; standalone projects/opportunities still come from Sales/Zoho.
2. Confirm identity hierarchy: customer → site/project → area/order → rafter and console; are separate sub-orders needed beyond areas?
3. When may an area be added, who approves pricing/payment plan, and can it be added after another area has shipped?
4. How are combined shipments, freight waivers, revised PI and payment allocation approved? Can grouped items later ship separately?
5. What are the four payment plans and the token threshold/event for post-design handoff?
6. Does “management discount” mean a discount or a separate receipt channel? Who approves it?
7. Does availability end only on checkout/leave, rather than idle session expiry? What are allocation weights and fallback?
8. Confirm simple-project bypass criteria and who authorizes it.
9. Confirm IM reschedule limit, escalation owner, and whether it blocks or merely flags; confirm universal slots/travel inputs.
10. Does the optional PDI prompt remain before factory handover?
11. Does this release end at ready for dispatch, or also record actual dispatch? Which packing event returns work to designer?
12. Is dispatch request automatic after payment verification? Who authorizes readiness and manages shipping?
13. Confirm approval-link/offline approval policy, communication recipients, tool URL and notification provider.

## Implementation follow-up

This review changes documentation only. SUNROOF-BUILD-STATUS.md remains the implementation baseline. The new allocation logic, identity/sub-order structure, payment plans, client approval links, dispatch grouping and gates must not be presented as already built. Once questions are settled, update backend permissions/state transitions and departmental views together, with transition and payment tests. Preserve the original Magppie project and existing SUNROOOF visual direction.
