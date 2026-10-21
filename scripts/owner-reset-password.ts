import { createInterface } from "node:readline";
import { OwnerAccountError, resetOwnerPassword } from "@/lib/auth/owner-account";
import { connectDatabase, loadLocalEnv, passwordChecks } from "@/scripts/lib/cli-env";

// `pnpm owner:reset-password`: offline owner recovery on the server (spec §17.5 §7).
// Prompts for the new password without echoing it (or reads one line from stdin when
// piped), sets it and signs the owner out everywhere.

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Echo nothing but the prompt while typing.
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    output._writeToOutput = (text: string) => {
      if (text.includes(prompt)) process.stdout.write(prompt);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readPiped(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/, 1)[0] ?? "";
}

async function main(): Promise<void> {
  loadLocalEnv();
  let password: string;
  if (process.stdin.isTTY) {
    password = await readHidden("New owner password: ");
    if ((await readHidden("Repeat the password: ")) !== password) {
      throw new OwnerAccountError("The passwords do not match.");
    }
  } else {
    password = await readPiped();
  }

  const db = connectDatabase();
  try {
    const revoked = await resetOwnerPassword(db, password, passwordChecks());
    console.log(`Owner password updated. ${revoked} session(s) revoked.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof OwnerAccountError ? error.message : error);
  process.exit(1);
});
