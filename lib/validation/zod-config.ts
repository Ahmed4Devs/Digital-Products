import { z } from "zod";

// Zod compiles parsers with `new Function` when it can, and probes for it on the first
// parse. The nonce CSP forbids eval (spec §17.5 §2), so the probe would only produce a
// violation report; parsing without the JIT is fast enough for these forms. Imported for
// its side effect by every schema module that also runs in the browser.
z.config({ jitless: true });
