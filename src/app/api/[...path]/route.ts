import { proxy } from "@/lib/backend-proxy";
export const dynamic = "force-dynamic";
const handle = (request: Request) =>
  proxy(request, new URL(request.url).pathname);
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
