import { z } from "zod";
import {
  attachmentDisposition,
  authorizeDownload,
  DOWNLOAD_URL_TTL_SECONDS,
} from "@/features/downloads/service";
import { getSessionUser } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server";
import { clientIp } from "@/lib/security/client-ip";
import { getStorage } from "@/lib/storage";

// GET /api/downloads/[entitlementId]/[fileId]?locale=ar (spec §8.3, §10.4). Every
// outcome other than a download goes back to My Purchases with a translated notice.
// The pre-signed URL appears only in the Location header: never in pages or logs.

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

function redirect(location: URL, status = 303): Response {
  return new Response(null, { status, headers: { ...NO_STORE, location: location.toString() } });
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/downloads/[entitlementId]/[fileId]">,
) {
  const env = serverEnv();
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") === "en" ? "en" : "ar";
  const library = (notice?: "rateLimited" | "unavailable") => {
    const target = new URL(`/${locale}/account/library`, env.APP_URL);
    if (notice) target.searchParams.set("notice", notice);
    return target;
  };

  // A download started by another site would only burn the customer's quota.
  if (request.headers.get("sec-fetch-site") === "cross-site") return redirect(library());

  const user = await getSessionUser({ fresh: true });
  if (!user) {
    const signIn = new URL(`/${locale}/sign-in`, env.APP_URL);
    signIn.searchParams.set("next", "/account/library");
    return redirect(signIn);
  }

  const ids = z.object({ entitlementId: z.uuid(), fileId: z.uuid() }).safeParse(await params);
  if (!ids.success) return redirect(library("unavailable"));

  const db = getDb();
  const settings = await db.storeSetting.findUnique({
    where: { id: 1 },
    select: { downloadsPerMinute: true },
  });
  const decision = await authorizeDownload(db, {
    userId: user.id,
    entitlementId: ids.data.entitlementId,
    fileId: ids.data.fileId,
    ip: clientIp(request.headers, {
      ipHeaders: env.AUTH_IP_HEADERS,
      trustedProxies: env.AUTH_TRUSTED_PROXIES,
    }),
    userAgent: request.headers.get("user-agent"),
    limitPerMinute: settings?.downloadsPerMinute ?? 5,
    secret: env.BETTER_AUTH_SECRET,
  });
  if (decision.kind === "not_found") return redirect(library("unavailable"));
  if (decision.kind === "rate_limited") return redirect(library("rateLimited"));

  const signed = await getStorage().presignDownload({
    key: decision.file.storageKey,
    contentDisposition: attachmentDisposition(decision.file.fileName),
    contentType: decision.file.mimeType,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  });
  return redirect(new URL(signed), 302);
}
