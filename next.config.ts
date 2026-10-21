import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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
    // Local MinIO listens on 127.0.0.1; only development may optimize from private IPs.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
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
      {
        // Self-hosted Twemoji graphics change only when the vendored set is upgraded.
        source: "/twemoji/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
