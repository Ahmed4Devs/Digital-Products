import { BlockList, isIP } from "node:net";

// The client IP for the app's own rate limits, resolved with the same rules Better Auth
// uses for its limiter (AUTH_IP_HEADERS, AUTH_TRUSTED_PROXIES): with trusted proxies the
// forwarded chain is walked from the right to the first untrusted hop; without them only
// a single-value header is believed, because the leftmost entry is client-controlled.

function blockList(trustedProxies: string[]): BlockList {
  const list = new BlockList();
  for (const entry of trustedProxies) {
    const [address, prefix] = entry.split("/");
    const type = isIP(address ?? "");
    if (!address || type === 0) continue;
    const family = type === 6 ? "ipv6" : "ipv4";
    if (prefix === undefined) list.addAddress(address, family);
    else list.addSubnet(address, Number(prefix), family);
  }
  return list;
}

function fromHeader(value: string, trusted: BlockList | null): string | null {
  const chain = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (chain.length === 0) return null;
  if (trusted) {
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const ip = chain[index]!;
      const type = isIP(ip);
      if (type === 0) return null;
      if (!trusted.check(ip, type === 6 ? "ipv6" : "ipv4")) return ip;
    }
    return null;
  }
  return chain.length === 1 && isIP(chain[0]!) !== 0 ? chain[0]! : null;
}

export function clientIp(
  headers: Headers,
  options: { ipHeaders: string[]; trustedProxies: string[] },
): string | null {
  const trusted = options.trustedProxies.length > 0 ? blockList(options.trustedProxies) : null;
  for (const name of options.ipHeaders) {
    const value = headers.get(name);
    if (value) {
      const ip = fromHeader(value, trusted);
      if (ip) return ip;
    }
  }
  return null;
}
