import { describe, expect, it, vi } from "vitest";
import { runInBackground, settleBackgroundTasks } from "@/lib/auth/background";

describe("runInBackground", () => {
  it("lets callers wait for queued work", async () => {
    let done = false;
    runInBackground(
      new Promise<void>((resolve) => setTimeout(() => ((done = true), resolve()), 10)),
      "test",
    );
    expect(done).toBe(false);
    await settleBackgroundTasks();
    expect(done).toBe(true);
  });

  it("logs failures by error class only, never the message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    runInBackground(Promise.reject(new TypeError("to: buyer@example.com")), "email");
    await settleBackgroundTasks();
    expect(log).toHaveBeenCalledWith("[background] email failed:", "TypeError");
    expect(JSON.stringify(log.mock.calls)).not.toContain("buyer@example.com");
  });
});
