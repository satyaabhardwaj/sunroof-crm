# Sunrooof frontend

Next.js 15 App Router and TypeScript at the repository root (`src/`). Five department routes: `/design`, `/design-head`, `/measurement`, `/accounts`, `/factory`. The FastAPI backend keeps all business rules and permissions.

## Sign-in: the CRM's own login (14 November 2026)

Clerk was removed. Sign-in is the existing CRM login: email + password, authenticator codes, password reset, and the 20-minute idle sign-out.

- The browser only talks to the Next.js origin. `src/app/api/[...path]/route.ts` forwards `/api/*` to FastAPI with the `crm_session` cookie (`src/lib/backend-proxy.ts`).
- `/login`, `/security`, `/forgot-password`, `/reset-password` and `/auth-assets/*` are FastAPI's own pages, served through the same proxy.
- Writes are accepted only when the request's `Origin` matches the Next.js host; the proxy then sends them on with the backend's origin, which is what FastAPI checks.
- `src/app/(dashboard)/layout.tsx` asks FastAPI who is signed in. Signed out → `/login`; authenticator setup required → `/security`; backend not running → a notice.
- `useIdleSession` (same rules as the old `session.js`): only real input renews the session, at most every 30 s; polling never does; tabs share activity.
- A 401 from any API call goes to `/login?expired=1`.

## Run locally

1. `npm ci`
2. Start the backend (`Start CRM.cmd` on Windows → 4301; on this Mac the QA backend `.local/sunroof-qa/serve.py` → 4302).
3. `CRM_BACKEND_URL=http://127.0.0.1:4301 npm run dev` (use 4302 for the QA backend), then open http://127.0.0.1:4303/.
4. `npm run typecheck` and `npm run build`.

Open the site on `127.0.0.1` or `localhost` consistently; the session cookie belongs to the host name you signed in on.

## Verification — 14 November 2026

- Typecheck and `npm run build` pass.
- Against the QA backend on 4302: signed out `/design` redirects to `/login`; the login page and its assets load through the proxy; a wrong password returns the backend's message; a signed-in session loads the Design workspace (8 orders) with no console errors; "Start design" saved through the proxy; writes from another origin or without an origin get 403.
- Not yet checked: signing in by typing a password in the browser, authenticator (MFA) sign-in, and password reset through the proxy.

## Hosting

Run FastAPI as its own service and set `CRM_BACKEND_URL` on the Next.js server; the browser never needs the backend address. No cloud deployment is authorized without the owner's explicit approval.
