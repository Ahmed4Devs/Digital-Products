#!/usr/bin/env node
// Vendors the Twemoji SVG set into public/twemoji from a pinned jdecked/twemoji release.
// The graphics are licensed CC-BY 4.0 (attribution is rendered in the site footer).
//
// Upgrading: bump VERSION, run once with SHA256 set to "" to print the new digest, review
// the archive, paste the digest, then run `pnpm twemoji:sync` and the emoji unit tests.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VERSION = "17.0.3";
const SHA256 = "a0855654b633045ae2337537e77f1bb4361162f7fcd910e613eaab1d6d9c5fca";
const ARCHIVE_URL = `https://codeload.github.com/jdecked/twemoji/tar.gz/refs/tags/v${VERSION}`;
const TARGET = join(process.cwd(), "public", "twemoji");

const response = await fetch(ARCHIVE_URL);
if (!response.ok) {
  throw new Error(`Download failed with HTTP ${response.status}`);
}
const archive = Buffer.from(await response.arrayBuffer());
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== SHA256) {
  throw new Error(`Checksum mismatch for v${VERSION}: got ${digest}`);
}

const workDir = await mkdtemp(join(tmpdir(), "twemoji-"));
try {
  await writeFile(join(workDir, "twemoji.tar.gz"), archive);
  // Relative paths + cwd avoid drive letters, which GNU tar would read as a remote host.
  execFileSync("tar", ["-xzf", "twemoji.tar.gz"], { cwd: workDir, stdio: "inherit" });

  const extracted = join(workDir, `twemoji-${VERSION}`);
  await rm(TARGET, { recursive: true, force: true });
  await mkdir(TARGET, { recursive: true });
  await cp(join(extracted, "assets", "svg"), TARGET, { recursive: true });
  await cp(join(extracted, "LICENSE-GRAPHICS"), join(TARGET, "LICENSE-GRAPHICS.txt"));
  await writeFile(join(TARGET, "VERSION"), `${VERSION}\n`);
  console.log(`Twemoji v${VERSION} SVGs written to public/twemoji`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
