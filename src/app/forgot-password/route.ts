import { proxy } from "@/lib/backend-proxy";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  proxy(request, new URL(request.url).pathname);
