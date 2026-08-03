import { describe, expect, it } from "vitest";
import { parseWorktreeList, shortenBranchRef } from "./porcelain";

const SAMPLE_PORCELAIN = [
  "worktree /home/dev/project",
  "HEAD 1111111111111111111111111111111111111111",
  "branch refs/heads/main",
  "",
  "worktree /home/dev/.worktrees/project-feature",
  "HEAD 2222222222222222222222222222222222222222",
  "branch refs/heads/feature/login",
  "",
  "worktree /home/dev/.worktrees/project-detached",
  "HEAD 3333333333333333333333333333333333333333",
  "detached",
  "",
  "worktree /home/dev/.worktrees/project-locked",
  "HEAD 4444444444444444444444444444444444444444",
  "branch refs/heads/release",
  "locked waiting for CI",
  "",
  "worktree /private/tmp/project-stale",
  "HEAD 5555555555555555555555555555555555555555",
  "detached",
  "prunable gitdir file points to non-existent location",
  "",
].join("\n");

describe("shortenBranchRef", () => {
  it("strips the refs/heads prefix", () => {
    expect(shortenBranchRef("refs/heads/feature/login")).toBe("feature/login");
    expect(shortenBranchRef("refs/heads/main")).toBe("main");
  });

  it("leaves a ref without the prefix alone", () => {
    expect(shortenBranchRef("feature/login")).toBe("feature/login");
  });
});

describe("parseWorktreeList", () => {
  it("parses porcelain output into structured entries", () => {
    const worktrees = parseWorktreeList(SAMPLE_PORCELAIN);

    expect(worktrees).toHaveLength(5);
    expect(worktrees[0]).toEqual({
      path: "/home/dev/project",
      head: "1111111111111111111111111111111111111111",
      branch: "main",
      isBare: false,
      isDetached: false,
      isLocked: false,
      lockReason: undefined,
      isPrunable: false,
      prunableReason: undefined,
    });
    expect(worktrees[1].branch).toBe("feature/login");
    expect(worktrees[2].isDetached).toBe(true);
    expect(worktrees[2].branch).toBeUndefined();
    expect(worktrees[0].isPrunable).toBe(false);
  });

  it("captures the reason a worktree is locked", () => {
    const worktrees = parseWorktreeList(SAMPLE_PORCELAIN);

    expect(worktrees[3].isLocked).toBe(true);
    expect(worktrees[3].lockReason).toBe("waiting for CI");
  });

  it("captures the reason a worktree is stale", () => {
    const worktrees = parseWorktreeList(SAMPLE_PORCELAIN);

    expect(worktrees[4].isPrunable).toBe(true);
    expect(worktrees[4].prunableReason).toBe(
      "gitdir file points to non-existent location",
    );
  });

  it("treats a bare attribute with no reason as flag-only", () => {
    const worktrees = parseWorktreeList(
      ["worktree /home/dev/project.git", "bare", ""].join("\n"),
    );

    expect(worktrees[0].isBare).toBe(true);
  });

  it("marks a locked worktree with no stated reason", () => {
    const worktrees = parseWorktreeList(
      ["worktree /home/dev/wt", "locked", ""].join("\n"),
    );

    expect(worktrees[0].isLocked).toBe(true);
    expect(worktrees[0].lockReason).toBeUndefined();
  });

  it("returns nothing for empty output", () => {
    expect(parseWorktreeList("")).toEqual([]);
  });
});
