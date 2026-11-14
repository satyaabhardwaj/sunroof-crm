import { proxy } from "@/lib/backend-proxy";
export const dynamic = "force-dynamic";
// Public client approval links (no sign-in): the page, its PDF and the decision.
const handle = (request: Request) =>
  proxy(request, new URL(request.url).pathname);
export { handle as GET, handle as POST };
