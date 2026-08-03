import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[][] = [];

vi.mock("node:child_process", () => ({
  execFile: (
    _command: string,
    args: string[],
    callback: (error: unknown, result: unknown) => void,
  ) => {
    calls.push(args);
    callback(null, { stdout: "", stderr: "" });
  },
}));
vi.mock("vscode", () => ({}), { virtual: true });
vi.mock("../logger", () => ({ log: vi.fn() }));

import { pruneWorktrees, removeWorktree, setWorktreeLock } from "./cli";

function lastArgs(): string[] {
  return calls[calls.length - 1];
}

/**
 * Git parses a leading-dash operand as a flag unless `--` precedes it. These
 * assertions pin the argv shape because the consequence on a destructive
 * subcommand is silently operating with an unintended flag.
 */
describe("git worktree argv construction", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("separates the path operand from options on remove", async () => {
    await removeWorktree("/repo", "/repo/wt", false);
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "remove",
      "--",
      "/repo/wt",
    ]);
  });

  it("keeps --force before the separator on remove", async () => {
    await removeWorktree("/repo", "/repo/wt", true);
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "remove",
      "--force",
      "--",
      "/repo/wt",
    ]);
  });

  it("does not let a dash-leading path become a flag", async () => {
    await removeWorktree("/repo", "-f", false);
    const args = lastArgs();
    expect(args).toContain("--");
    expect(args.indexOf("-f")).toBeGreaterThan(args.indexOf("--"));
  });

  it("separates the path operand on lock, keeping the reason with its flag", async () => {
    await setWorktreeLock("/repo", "/repo/wt", true, "long build");
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "lock",
      "--reason",
      "long build",
      "--",
      "/repo/wt",
    ]);
  });

  it("omits the reason flag when locking without one", async () => {
    await setWorktreeLock("/repo", "/repo/wt", true, undefined);
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "lock",
      "--",
      "/repo/wt",
    ]);
  });

  it("separates the path operand on unlock", async () => {
    await setWorktreeLock("/repo", "/repo/wt", false, undefined);
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "unlock",
      "--",
      "/repo/wt",
    ]);
  });

  it("prunes against the given repo only", async () => {
    await pruneWorktrees("/repo");
    expect(lastArgs()).toEqual(["-C", "/repo", "worktree", "prune"]);
  });
});
