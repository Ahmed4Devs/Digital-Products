import { getAuth } from "@/lib/auth/server";

// Every Better Auth endpoint (spec §8.3). Rate limits, CSRF/origin checks and the
// policy hooks all run inside the handler.
export function GET(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export function POST(request: Request): Promise<Response> {
  return getAuth().handler(request);
}
