import { describe, expect, it } from "vitest";
import {
  formatWorktreeLabel,
  formatWorktreeLocation,
  paletteIndexForKey,
  shortenHomePath,
  sortWorktreesForDisplay,
  worktreeBadge,
  worktreeColorKey,
} from "./display";
import { Worktree } from "./types";

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/repos/main",
    head: undefined,
    branch: undefined,
    isBare: false,
    isDetached: false,
    isLocked: false,
    lockReason: undefined,
    isPrunable: false,
    ...overrides,
  };
}

describe("formatWorktreeLocation", () => {
  const HOME = "/home/dev";
  const ROOT = "/home/dev/repos/api";

  it("shows nothing for the main worktree", () => {
    expect(formatWorktreeLocation(ROOT, ROOT, HOME)).toBe("");
  });

  it("shows a path relative to the repo root for nested worktrees", () => {
    expect(
      formatWorktreeLocation(`${ROOT}/.worktrees/feature-login`, ROOT, HOME),
    ).toBe(".worktrees/feature-login");
  });

  it("keeps nested branch-style directories intact", () => {
    expect(
      formatWorktreeLocation(`${ROOT}/.worktrees/fix/ISSUE-123`, ROOT, HOME),
    ).toBe(".worktrees/fix/ISSUE-123");
  });

  it("falls back to a home-shortened path for worktrees outside the repo", () => {
    expect(formatWorktreeLocation(`${HOME}/scratch/hotfix`, ROOT, HOME)).toBe(
      "~/scratch/hotfix",
    );
  });

  it("keeps an absolute path when the worktree is outside home", () => {
    expect(formatWorktreeLocation("/private/tmp/ptest-main", ROOT, HOME)).toBe(
      "/private/tmp/ptest-main",
    );
  });

  it("does not escape the repo root with a .. relative path", () => {
    expect(formatWorktreeLocation("/home/dev/repos/other", ROOT, HOME)).toBe(
      "~/repos/other",
    );
  });
});

describe("formatWorktreeLabel", () => {
  it("labels worktrees by branch, detached state, or bare state", () => {
    expect(formatWorktreeLabel(makeWorktree({ branch: "feature/login" }))).toBe(
      "feature/login",
    );
    expect(
      formatWorktreeLabel(
        makeWorktree({
          path: "/repos/detached",
          isDetached: true,
          head: "abcdef1234",
        }),
      ),
    ).toBe("detached @ abcdef1");
    expect(formatWorktreeLabel(makeWorktree({ isBare: true }))).toBe("(bare)");
  });
});

describe("sortWorktreesForDisplay", () => {
  it("sorts the current worktree first, then alphabetically, with bare last", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/main", branch: "main" }),
      makeWorktree({ path: "/r/feature", branch: "feature" }),
      makeWorktree({ path: "/r/bare", isBare: true }),
      makeWorktree({ path: "/r/detached", isDetached: true }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, "/r/feature");

    expect(sorted.map((w) => w.path)).toEqual([
      "/r/feature",
      "/r/detached",
      "/r/main",
      "/r/bare",
    ]);
  });
});

describe("badges and colours", () => {
  it("derives short, stable badges from the worktree", () => {
    expect(worktreeBadge(makeWorktree({ branch: "feature/login" }))).toBe("LO");
    expect(worktreeBadge(makeWorktree({ branch: "main" }))).toBe("MA");
    expect(worktreeBadge(makeWorktree({ isDetached: true }))).toBe("DT");
    expect(worktreeBadge(makeWorktree({ isBare: true }))).toBe("BA");
  });

  it("assigns a stable palette index within range for a key", () => {
    const first = paletteIndexForKey("feature/login", 8);
    const second = paletteIndexForKey("feature/login", 8);

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(8);
  });

  it("keys worktree colour by branch, falling back to path", () => {
    expect(worktreeColorKey(makeWorktree({ branch: "main" }))).toBe("main");
    expect(
      worktreeColorKey(makeWorktree({ path: "/r/detached", isDetached: true })),
    ).toBe("/r/detached");
  });
});

describe("shortenHomePath", () => {
  it("shortens the home directory prefix to a tilde", () => {
    expect(shortenHomePath("/home/dev/repos/app", "/home/dev")).toBe(
      "~/repos/app",
    );
    expect(shortenHomePath("/opt/app", "/home/dev")).toBe("/opt/app");
  });
});
