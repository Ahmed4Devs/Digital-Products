"use client";

import { inferAdditionalFields, magicLinkClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "./server";

/**
 * Browser client for the Better Auth endpoints under /api/auth. Forms call it directly so
 * every request goes through Better Auth's rate limiter, origin checks and the policy
 * hooks. Same origin, so no base URL is configured.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>(), usernameClient(), magicLinkClient()],
});
