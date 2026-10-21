import { z } from "zod";
import { runMaintenance } from "@/features/maintenance/run";
import { createStorage } from "@/lib/storage/client";
import { connectDatabase, loadLocalEnv, readEnv } from "./lib/cli-env";

// `pnpm maintenance:run`: daily housekeeping (spec §17.5 §10). Schedule it inside the
// app container (Coolify/Dokploy scheduled task); it needs no public endpoint.

loadLocalEnv();
const env = readEnv(
  z.object({
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET_PRIVATE: z.string().min(1),
    S3_BUCKET_PUBLIC: z.string().min(1),
  }),
);
const db = connectDatabase();
try {
  const report = await runMaintenance(db, createStorage(env));
  console.log(JSON.stringify({ task: "maintenance", ...report }));
} catch (error) {
  console.error("Maintenance failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
