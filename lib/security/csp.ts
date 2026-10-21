// Content Security Policy and other security headers (spec §5.1, §17.5 §2).
//
// Two policies, because nonces need a fresh render per request and catalog pages are
// prerendered:
// - Nonce routes (admin, account, checkout, customer auth pages) render dynamically
//   under the (secure) root layout. proxy.ts creates a nonce per request and sends
//   `script-src 'nonce-…' 'strict-dynamic'`, plus only the third-party origins the route
//   needs (Paddle on checkout, Turnstile on sign-up, the upload endpoint in the admin).
// - Every other route gets a static policy from next.config headers: Next.js's inline
//   framework scripts are allowed ('unsafe-inline') but no third-party origin is, and the
//   rich-text sanitizer is the main XSS defence there.
//
// Pure functions, shared by next.config.ts and proxy.ts.

export type CspContext = {
  /** `next dev`: React needs 'unsafe-eval' for its debugging features. */
  dev: boolean;
  /** Origin of the public bucket or CDN (product images, logos). */
  publicMediaOrigin: string | null;
  /** Origin the owner's browser uploads to with pre-signed PUTs. */
  uploadOrigin: string | null;
  /** Only when the site itself is served over HTTPS; local http would break. */
  upgradeInsecureRequests: boolean;
};

export type NonceRoute = "admin" | "account" | "checkout" | "auth" | "signUp";

const LOCALES = "ar|en";
const AUTH_PAGES = "sign-in|forgot-password|reset-password|verify-email";
const NONCE_ROUTE = new RegExp(
  `^/(?:${LOCALES})/(admin|account|checkout|sign-up|${AUTH_PAGES})(?:/|$)`,
);

/**
 * `source` for next.config headers: every path except the nonce routes, which get their
 * policy from proxy.ts. Two policies on one response would both be enforced.
 */
export const STATIC_POLICY_SOURCE = `/((?!(?:${LOCALES})/(?:admin|account|checkout|sign-up|${AUTH_PAGES})(?:/|$)).*)`;

/** Which nonce policy a path needs, or null for the static policy. */
export function nonceRouteFor(pathname: string): NonceRoute | null {
  const match = NONCE_ROUTE.exec(pathname);
  if (!match) return null;
  const [, section] = match;
  if (section === "admin" || section === "account" || section === "checkout") return section;
  return section === "sign-up" ? "signUp" : "auth";
}

/** Paddle.js and its overlay checkout (checkout routes only). */
const PADDLE = {
  script: ["https://cdn.paddle.com"],
  frame: ["https://buy.paddle.com", "https://sandbox-buy.paddle.com"],
  connect: ["https://*.paddle.com"],
  img: ["https://*.paddle.com"],
};

/** Cloudflare Turnstile on sign-up. */
const TURNSTILE = {
  script: ["https://challenges.cloudflare.com"],
  frame: ["https://challenges.cloudflare.com"],
};

type Directives = Record<string, string[]>;

function serialize(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

function baseDirectives(context: CspContext): Directives {
  const media = context.publicMediaOrigin ? [context.publicMediaOrigin] : [];
  return {
    "default-src": ["'self'"],
    // Inline style attributes (positioned popovers, the editor) cannot carry a nonce.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...media],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(context.upgradeInsecureRequests ? { "upgrade-insecure-requests": [] } : {}),
  };
}

const devEval = (context: CspContext) => (context.dev ? ["'unsafe-eval'"] : []);

/** The static policy for prerendered and other non-nonce routes. */
export function staticPolicy(context: CspContext): string {
  const directives = baseDirectives(context);
  directives["script-src"] = ["'self'", "'unsafe-inline'", ...devEval(context)];
  return serialize(directives);
}

/**
 * A nonce route's policy. With 'strict-dynamic', scripts the nonce'd bundles insert
 * (next/script) are trusted; host sources are listed for browsers without CSP Level 3.
 */
export function noncePolicy(route: NonceRoute, nonce: string, context: CspContext): string {
  const directives = baseDirectives(context);
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...devEval(context)];
  if (route === "checkout") {
    script.push(...PADDLE.script);
    directives["frame-src"] = PADDLE.frame;
    directives["connect-src"]!.push(...PADDLE.connect);
    directives["img-src"]!.push(...PADDLE.img);
  }
  if (route === "signUp") {
    script.push(...TURNSTILE.script);
    directives["frame-src"] = TURNSTILE.frame;
  }
  if (route === "admin" && context.uploadOrigin) {
    directives["connect-src"]!.push(context.uploadOrigin);
  }
  directives["script-src"] = script;
  return serialize(directives);
}

/** A fresh, unguessable nonce (128 bits, base64). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The policy inputs from the environment (read at build for next.config, at runtime in proxy). */
export function cspContextFromEnv(
  env: Record<string, string | undefined> = process.env,
): CspContext {
  return {
    dev: env.NODE_ENV === "development",
    publicMediaOrigin: originOf(env.S3_PUBLIC_BASE_URL),
    uploadOrigin: originOf(env.S3_ENDPOINT),
    upgradeInsecureRequests: (env.APP_URL ?? "").startsWith("https://"),
  };
}

/** Headers for every response besides the CSP (spec §5.1). */
export function securityHeaders(): { key: string; value: string }[] {
  return [
    // Two years; browsers ignore it over plain http, so local development is unaffected.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // frame-ancestors 'none' covers modern browsers; this covers older ones.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "usb=()",
        "browsing-topics=()",
        // Paddle's overlay checkout may use the Payment Request API in its frame.
        `payment=(self ${PADDLE.frame.map((origin) => `"${origin}"`).join(" ")})`,
      ].join(", "),
    },
  ];
}
