# SUNROOOF frontend

Next.js 15 App Router and TypeScript foundation at the existing CRM repository root. Abhishek’s app/components/hooks/lib/types organization is retained; five departmental routes are additive. Project configuration lives at repository root (the Next.js convention), not inside src.

## Run

1. `npm ci`
2. Copy `.env.example` to `.env.local` and provide your organization’s Clerk keys and API base URL.
3. `npm run dev` — http://localhost:4303
4. `npm run typecheck` and `npm run build`

Without Clerk keys, the app displays setup information and does not render protected CRM data. Never put secret keys in NEXT_PUBLIC variables.

## Implemented here

- Clerk login/register UI, protected dashboard layout, Query provider, typed Axios token interceptor.
- Five department routes, responsive navigation, Zustand navigation state.
- TanStack Query workspace reads and TanStack Table paginated project table, search and contact history.
- Optional authenticated Socket.IO invalidation with query polling fallback.
- Requested libraries installed, shadcn-compatible Button and configuration. Forms, draggable pipeline and remaining shadcn components will be built as workflow mutations are migrated.

## Integration boundary — not a completed migration

The Python FastAPI backend remains unchanged; the separate React frontend entries are retired by this migration. Its current cookie authentication does not validate Clerk JWTs. Before connecting real data, the backend owner must implement Clerk issuer/audience verification and map user/org identities to existing department permissions. Never trust a department query parameter alone. The client uses GET /api/sunroof/workspace?department=... and expects the Workspace type in src/types/deal.ts. The configured API origin needs appropriate CORS. Socket.IO is optional and requires a real authenticated server emitting workspace:updated; the existing backend does not provide it.

Existing department screens, visit booking, payment submission/review and factory action forms are ported into src/components/deals/workflow, using the existing revision-checked API contracts through authenticated Axios. No new sub-order APIs, drag transitions or client approval links are invented here. Reserved companies/tasks/reports/settings routes explicitly say they are not connected. No fabricated records or successful saves are displayed.

Clerk session policy must be configured separately; the legacy 20-minute inactivity behavior is not yet ported. Contact links retain the originating department; the backend must authorize that department and scope its records. Backend permissions still control access. Outstanding workflow decisions are in SUNROOOF-MEETING-UPDATES-2026-11-13.md.

## References

- https://nextjs.org/docs/15/app
- https://clerk.com/docs/reference/nextjs/app-router/auth
- https://clerk.com/docs/reference/nextjs/clerk-middleware

## Hosting and migration

The repository root is the Next.js frontend. Vercel configuration now targets Next.js and automatic Git deployments remain disabled. FastAPI must run as a separate configured API service; the former combined FastAPI/static build is no longer the default deployment. Local backup of retired frontend files is under ignored `.local/frontend-migration-backup/`; committed history also preserves the old implementation.

React Hook Form, Zod and dnd-kit are installed for new forms and the agreed pipeline work. Ported business forms retain their existing validation during this structural migration; this is not a claim that every form has been rewritten with React Hook Form. Existing static HTML assets are legacy compatibility files, not Next.js entry points.

## Verification — 13 November 2026

- `npm run typecheck`: passed for the new src tree.
- `npm run build`: passed on Next.js 15.5.29; all five department routes generated.
- Production startup on 127.0.0.1:4303: passed. Login, Design, Measurement, Accounts and Factory correctly show the setup screen without Clerk keys; protected CRM data is not rendered.
- Signed-in browser workflows and backend mutations remain unverified until Clerk keys and backend token verification are configured.
