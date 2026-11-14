# Sunrooof backend workflow

14 November 2026. Built from the whiteboard (13 Nov), the three meeting recordings and the owner's walkthrough of 14 Nov. Backend only: the UI/UX redesign comes later. Code: `backend/sunroof.py` (endpoints, permissions, email, notifications), `backend/sunroof_rules.py` (stages, money, allocation, calendar), `backend/sunroof_zoho.py` (read-only staff lookup). Tests: `backend/tests/test_sunroof.py` (25).

## Stages and owners

Every order shows exactly one stage (`stageInfo`: key, label, owner, detail, step of 20). The designer sees every stage and is notified of every change someone else makes; the next owner is notified when work reaches them.

| # | Stage | Owner |
|---|---|---|
| 1 | Designer to be assigned | Design Head / automatic |
| 2 | Measurement to be assigned | Designer |
| 3 | Measurement in progress (assigned · on the way · reached site · done, waiting for review) | Measurement |
| 4 | Measurement done | Designer |
| 5 | Design in progress | Designer |
| 6 | Approval pending (with the client, or with the Design Head from V4) | Designer |
| 7 | Approved | Designer |
| 8 | Production payment pending | Designer |
| 9 | Production payment verification | Accounts |
| 10 | Handover to factory | Designer |
| 11 | Production pending (accepted by factory) | Factory |
| 12 | Production started (also after a failed QC: repair or replace) | Factory |
| 13 | QC | Factory |
| 14 | Ready & packed | Factory |
| 15 | Rafter dispatch payment (then Console dispatch payment) | Designer |
| 16 | Rafter payment verification (then console) | Accounts |
| 17 | Request for dispatch | Designer |
| 18 | Dispatch pending | Dispatch team |
| 19 | Ready to dispatch | Dispatch team |
| 20 | Dispatched | Dispatch team |

Rafters go first, consoles after. A verified dispatch payment requests dispatch automatically; the designer can also request it. There is no dispatch department yet, so the Factory login moves Ready to dispatch and Dispatched.

## Rules

**Designer allocation (Design Head, 14 Nov).** First the skill matrix decides who *can* take the order: every needed skill must be at least 4 (editable, `minimumSkill`). Needed skills: the client type column (Normal, HNI or Celebrity Client), Residential or Commercial, Property Size for large or complex sites, Geography for sites outside India. Among those, the order goes to whoever has the most room under their monthly revenue target this month (order value assigned this month, by assignment date). Default target ₹40 lakh a month for everyone; the Design Head can change the default (`/allocation`) or one designer's target (`/staff/{id}` `target`). If nobody meets the bar, the highest-rated designers are used; if nobody is rated at all, auto-assignment refuses and asks for the skill matrix. Upload the sheet as CSV to `POST /api/sunroof/skill-matrix?revision=N`; designers match by Zoho user ID, then name; review notes are kept. Punched-in designers only, when anyone has punched in today. The Design Head can still assign by hand.

**Measurement.** Delhi NCR (Delhi, Gurugram, Noida, Faridabad, Ghaziabad) goes to the in-house team (Rahul and Amit), Mumbai (Mumbai, Navi Mumbai, Thane) to Sohail and Anas; every other city to the Installation Managers from Zoho, nearest first. Set an executive's region with `/staff/{id}` `region`. Three slots a day: 09:00–12:00, 13:00–16:00, 17:00–19:00 (IST); a long trip can take consecutive slots. `/calendar` shows every visit person's slots for up to 31 days, nearby people first, with a suggestion. `/visits/auto` books the nearest person's earliest free slot (Executives before Installation Managers). No double booking. Measurement Executives are confirmed straight away; Installation Managers accept or decline. Both can reschedule, but only after saying who they spoke to and why; every reschedule is logged and counted, and the third is flagged to the designer (not blocked). Visit progress: on the way → reached site (time, lateness in minutes, optional location) → done.

**Design approval.** Each version needs a new CAD file and client PDF. V4 and later go to the Design Head first. Send to client: emails the client a link to that exact version and returns the same link plus WhatsApp desktop (`whatsapp://`) and web (`wa.me`) share links. The client opens the link without signing in, sees the PDF and approves or asks for changes (reason required). Links last 30 days and stop working once decided or replaced. The designer can also record a decision that came by phone. The designer fills in missing client details (email, phone, address, city, state…) instead of sending them back to Sales.

**Money.** Gates are cumulative: what must be confirmed by the gate minus everything confirmed so far, including what Sales collected before Design. Unpaid booking money stays inside the production figure; it is not relabelled. From the payment plans in `shared/rules.js`: production gate = all shares up to and including Production; rafter dispatch = plus the next share; console dispatch = 100%. Accounts can instead set explicit per-gate amounts. Only Accounts confirms or rejects a receipt.

**Handover to factory.** Needs the client-approved version, production payment confirmed, the required date and a shipping address. "PDI required?" defaults to No; Yes needs an approved PDI first. Sends the factory email. The factory may change the required date afterwards; the designer may change all dates (required, rafter dispatch, console dispatch, rafter/console installation, puja/handover).

**Areas (sub-orders).** A designer can add an area under an existing project until it is dispatched. It gets the next number (`REF/2`, `REF/3`), copies the client details, runs its own workflow and payments, and is marked to ship with the main order by default. Part codes: `REF-R` (rafters) and `REF-C` (consoles).

**Search.** Each order carries one search text: reference, client, email, phone, architect, POC, billing name, IDs and aliases.

**Tasks.** Every order has one open task, worked out from its stage: what to do, for whom, who gave it (the person whose action created it), since when, and the due date where one exists (visit date, required date, rafter/console dispatch date). Each person sees *For me*, *Given by me* and *Done*. Tasks are not created or reassigned by hand; they close when the work moves on. The person a task is for can report Done or Not done (with a reason); the giver is notified.

**Notifications.** Like the Magppie bell: two columns (Work, Payments), newest first, a red count of what you have not seen (opening the bell clears it), a cross removes one line, Clear all empties a column, and the same line twice for one client shows once. Per person.

**Screens (14 Nov).** The work list can be shown as Cards (stage → next stage, overdue, progress, who has it, due, days at this stage, last note, next action), Table, Kanban (one column per stage, owner tag), Calendar (count per day: overdue, today, coming up; click a day for its list), Agenda, and Status (orders per stage grouped by owner). The choice is remembered per department. Ideas were taken from the Magppie 10x Engine; the look stays Sunrooof's.

## Configuration

- Email: `mail/keys.env` (copy `mail/keys.env.example`): company SMTP mailbox and `FACTORY_EMAIL`. While `MAIL_TEST_EMAIL` is set, every email goes only there. Without a mailbox, links are still created and the history says the email was not sent.
- Client links: `CRM_PUBLIC_URL` (the address clients open). Without it, the address the designer is using is used.
- Zoho: `.local/zoho.env` (git-ignored, owner-only), or `SUNROOOF_ZOHO_ENV`. `/staff-sync` reads active Designers and Installation Managers and adds new ones; it keeps CRM-only fields (skills, location, capacity). Nothing is written to Zoho. Zoho holds no staff locations, so they are entered in the CRM.

## Endpoints added (all under `/api/sunroof`)

`staff/{id}` (skills, location, capacity) · `presence` · `allocation` · `orders/{id}/designer-ranking` · `orders/{id}/auto-assign` · `auto-assign` · `staff-sync` · `calendar` · `orders/{id}/visits` (date + slot) · `orders/{id}/visits/auto` · visit actions `depart`, `arrive`, `reschedule` · `orders/{id}/contact` · `orders/{id}/profile` · `orders/{id}/money` (Accounts) · `orders/{id}/drawings/{v}/send` · `orders/{id}/dispatch` · `orders/{id}/areas` · `notifications/read`. Public: `/client/{token}`, `/client/{token}/file`, `/client/{token}/decision`.

## Open questions

1. Skill matrix: imported 14 Nov (7 designers). What counts as a "large" site in square feet? Is 4 the right "can handle" score (Priyanka has HNI 4 but her note says not HNI)?
2. Rahul and Amit "go together": should one Delhi NCR visit book both of them? Anas is not in the Zoho visit-person list; confirm the spelling.
3. Payment gates: is the rafter dispatch gate "plus the next share" (SM: 100%, AVP: 100%, Founder: 95%)? Where does the PDI share sit?
4. Who is the dispatch team, and should it get its own login?
5. Factory email address and the company mailbox (or Resend) to send from.
6. Measurement Executives are not a Zoho role; who are they?
7. Areas shipping together: who approves a freight waiver, and can a grouped area later ship alone?
8. Simple projects skipping post-design: the checklist and who decides.
