import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import {
  cspContextFromEnv,
  securityHeaders,
  STATIC_POLICY_SOURCE,
  staticPolicy,
} from "./lib/security/csp";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Product images come only from the public bucket or CDN (spec §12). Read at build time:
 * the allowlist is baked into the build, so S3_PUBLIC_BASE_URL is a build argument.
 */
function publicImagePatterns(): URL[] {
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (!base) return [];
  return [new URL(`${base.replace(/\/+$/, "")}/**`)];
}

/**
 * Local MinIO listens on 127.0.0.1, which the image optimizer refuses by default (SSRF
 * protection). Allowed only when the configured public bucket itself is on loopback, so
 * a deployment with a real CDN never relaxes the check.
 */
function publicImagesAreLocal(): boolean {
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (!base) return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname);
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Prefetch one static App Shell per route; recommended alongside Cache Components.
  partialPrefetching: true,
  reactCompiler: true,
  typedRoutes: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75],
    remotePatterns: publicImagePatterns(),
    dangerouslyAllowLocalIP: publicImagesAreLocal(),
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders() },
      {
        // Prerendered and other non-nonce routes (spec §17.5 §2); proxy.ts sets the
        // nonce policy on the rest. Read at build time, like the image allowlist.
        source: STATIC_POLICY_SOURCE,
        headers: [{ key: "Content-Security-Policy", value: staticPolicy(cspContextFromEnv()) }],
      },
      {
        // Self-hosted Twemoji graphics change only when the vendored set is upgraded.
        source: "/twemoji/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
