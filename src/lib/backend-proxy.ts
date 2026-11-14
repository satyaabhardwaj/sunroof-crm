import "server-only";

/** The FastAPI CRM. Server-side only; the browser only ever talks to this Next.js origin. */
export const BACKEND_URL = (
  process.env.CRM_BACKEND_URL || "http://127.0.0.1:4301"
).replace(/\/$/, "");

const passRequest = ["cookie", "content-type", "accept", "user-agent"];
const passResponse = [
  "content-type",
  "cache-control",
  "content-disposition",
  "x-content-type-options",
  "referrer-policy",
];

/**
 * Forwards one request to FastAPI with the CRM session cookie.
 * The backend only accepts writes from its own origin, so writes are checked here
 * against this site's origin first and then sent on with the backend's origin.
 */
export async function proxy(request: Request, path: string) {
  const incoming = new URL(request.url);
  const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const site = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (
    write &&
    (request.headers.get("sec-fetch-site") === "cross-site" ||
      !origin ||
      !site ||
      new URL(origin).host !== site)
  )
    return Response.json(
      { error: "Same-origin request required." },
      { status: 403 },
    );
  const headers = new Headers();
  for (const name of passRequest) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (write) headers.set("origin", BACKEND_URL);
  // Lets the backend build client links on this public address.
  if (site) headers.set("x-forwarded-host", site);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));
  const upstream = await fetch(BACKEND_URL + path + incoming.search, {
    method: request.method,
    headers,
    body: write ? await request.arrayBuffer() : undefined,
    redirect: "manual",
    cache: "no-store",
  }).catch(() => null);
  if (!upstream)
    return Response.json(
      { error: "The CRM backend is not running." },
      { status: 503 },
    );
  const out = new Headers();
  for (const name of passResponse) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie())
    out.append("set-cookie", cookie);
  const location = upstream.headers.get("location");
  if (location) out.set("location", location.replace(BACKEND_URL, ""));
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

/** Who is signed in, read on the server from the CRM session cookie. */
export async function currentUser(cookie: string) {
  const response = await fetch(BACKEND_URL + "/api/auth/me", {
    headers: { cookie },
    cache: "no-store",
  }).catch(() => null);
  if (!response) return { status: "offline" as const };
  if (!response.ok) return { status: "signed-out" as const };
  const me = (await response.json()) as {
    id: string;
    email?: string;
    role: string;
    mfa_enrollment_required?: boolean;
  };
  return { status: "signed-in" as const, me };
}
