import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();

vi.mock("@/lib/db/index", () => ({
  getDb: () => ({ $queryRaw: queryRaw }),
}));

const { isDatabaseHealthy } = await import("@/lib/db/health");

describe("isDatabaseHealthy", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns true when the database answers", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    await expect(isDatabaseHealthy()).resolves.toBe(true);
  });

  it("returns false instead of throwing when the query fails", async () => {
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 user=app"));
    await expect(isDatabaseHealthy()).resolves.toBe(false);
  });

  it("logs only the error class, never the driver message", async () => {
    queryRaw.mockRejectedValue(new TypeError("password authentication failed for user app"));
    await isDatabaseHealthy();
    expect(console.error).toHaveBeenCalledWith("[health] database check failed:", "TypeError");
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("password");
  });

  it("returns false when the database does not answer in time", async () => {
    queryRaw.mockReturnValue(new Promise(() => {}));
    await expect(isDatabaseHealthy(20)).resolves.toBe(false);
  });
});
