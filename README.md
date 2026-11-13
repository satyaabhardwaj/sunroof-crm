# SUNROOOF CRM

The main frontend is now **Next.js 15 App Router + TypeScript**, using Abhishek’s requested structure:

```text
src/
  app/          # (auth), (dashboard), department routes and shared layouts
  components/   # ui, layout, contacts, deals, kanban
  hooks/        # queries, API actions, realtime and client state
  lib/          # Axios client and utilities
  types/        # API contracts
```

Run `npm ci`, configure `.env.local` from `.env.example`, then `npm run dev` (port 4303). Validate with `npm run typecheck` and `npm run build`.

Department screens and existing workflow forms live in `src/components/deals/workflow`. The Python backend remains in `backend/`; its cookie-authenticated API needs a verified Clerk integration before the new frontend can operate against it. No credentials or live client data are committed. Without Clerk configuration, the frontend shows a setup page instead of protected data.

- [Frontend setup and integration boundaries](docs/NEXT-FRONTEND.md)
- [Latest meeting decisions and open questions](docs/SUNROOOF-MEETING-UPDATES-2026-11-13.md)
- [Original workflow record](docs/SUNROOF-WORKFLOW.md)

The old multi-app frontend setup is retired. Historical build/status documents describe the previous demo unless explicitly updated. No cloud deployment is part of this migration.
