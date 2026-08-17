import { describe, expect, it } from "vitest";
import {
  BranchType,
  DEFAULT_BRANCH_TYPE_MAP,
  branchTypeColorId,
  branchTypeForBranch,
  formatWorktreeLabel,
  formatWorktreeLocation,
  paletteIndexForKey,
  shortenHomePath,
  sortWorktreesForDisplay,
  worktreeBadge,
  worktreeColorKey,
  worktreeMatchesFilter,
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

  it("falls back to the directory name when there is no branch and no detached flag", () => {
    expect(formatWorktreeLabel(makeWorktree({ path: "/repos/scratch-dir" }))).toBe(
      "scratch-dir",
    );
  });

  it("says unknown rather than rendering an empty detached label", () => {
    expect(
      formatWorktreeLabel(makeWorktree({ isDetached: true, head: undefined })),
    ).toBe("detached @ unknown");
  });

  it("prefers the branch over the detached flag when a worktree has both", () => {
    expect(
      formatWorktreeLabel(
        makeWorktree({ branch: "feature/login", isDetached: true }),
      ),
    ).toBe("feature/login");
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

  it("accepts the options object form and behaves like the string form", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/main", branch: "main" }),
      makeWorktree({ path: "/r/feature", branch: "feature" }),
    ];

    const viaString = sortWorktreesForDisplay(worktrees, "/r/feature");
    const viaObject = sortWorktreesForDisplay(worktrees, {
      currentPath: "/r/feature",
    });

    expect(viaObject.map((w) => w.path)).toEqual(viaString.map((w) => w.path));
  });

  it("surfaces dirty worktrees ahead of clean ones when asked", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/apple", branch: "apple" }),
      makeWorktree({ path: "/r/banana", branch: "banana" }),
      makeWorktree({ path: "/r/cherry", branch: "cherry" }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, {
      dirtyPaths: new Set(["/r/cherry"]),
    });

    // cherry is dirty so it leads; the clean rest stay alphabetical.
    expect(sorted.map((w) => w.path)).toEqual([
      "/r/cherry",
      "/r/apple",
      "/r/banana",
    ]);
  });

  it("keeps the current worktree first even when another is dirty", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/apple", branch: "apple" }),
      makeWorktree({ path: "/r/banana", branch: "banana" }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, {
      currentPath: "/r/apple",
      dirtyPaths: new Set(["/r/banana"]),
    });

    expect(sorted.map((w) => w.path)).toEqual(["/r/apple", "/r/banana"]);
  });

  it("treats the dirtyFirst mode as equivalent to passing dirty paths", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/apple", branch: "apple" }),
      makeWorktree({ path: "/r/banana", branch: "banana" }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, {
      mode: "dirtyFirst",
      dirtyPaths: new Set(["/r/banana"]),
    });

    expect(sorted.map((w) => w.path)).toEqual(["/r/banana", "/r/apple"]);
  });

  it("ignores dirty paths in modes that did not ask for them", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/apple", branch: "apple" }),
      makeWorktree({ path: "/r/banana", branch: "banana" }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, {
      mode: "branch",
      dirtyPaths: new Set(["/r/banana"]),
    });

    expect(sorted.map((w) => w.path)).toEqual(["/r/apple", "/r/banana"]);
  });

  it("sorts by newest commit first in lastCommit mode", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/apple", branch: "apple" }),
      makeWorktree({ path: "/r/banana", branch: "banana" }),
      makeWorktree({ path: "/r/cherry", branch: "cherry" }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, {
      mode: "lastCommit",
      timestamps: new Map([
        ["/r/apple", { lastCommit: 100 }],
        ["/r/banana", { lastCommit: 300 }],
        ["/r/cherry", { lastCommit: 200 }],
      ]),
    });

    expect(sorted.map((w) => w.path)).toEqual([
      "/r/banana",
      "/r/cherry",
      "/r/apple",
    ]);
  });

  it("sorts by newest worktree first in created mode", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/apple", branch: "apple" }),
      makeWorktree({ path: "/r/banana", branch: "banana" }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, {
      mode: "created",
      timestamps: new Map([
        ["/r/apple", { created: 100 }],
        ["/r/banana", { created: 200 }],
      ]),
    });

    expect(sorted.map((w) => w.path)).toEqual(["/r/banana", "/r/apple"]);
  });

  it("sinks worktrees with no timestamp below those that have one", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/apple", branch: "apple" }),
      makeWorktree({ path: "/r/banana", branch: "banana" }),
      makeWorktree({ path: "/r/cherry", branch: "cherry" }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, {
      mode: "lastCommit",
      timestamps: new Map([["/r/banana", { lastCommit: 1 }]]),
    });

    // banana has a timestamp, so it leads however old it is; the unknown rest
    // fall back to alphabetical rather than to an arbitrary order.
    expect(sorted.map((w) => w.path)).toEqual([
      "/r/banana",
      "/r/apple",
      "/r/cherry",
    ]);
  });

  it("falls back to alphabetical when timestamps tie", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/cherry", branch: "cherry" }),
      makeWorktree({ path: "/r/apple", branch: "apple" }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, {
      mode: "lastCommit",
      timestamps: new Map([
        ["/r/apple", { lastCommit: 500 }],
        ["/r/cherry", { lastCommit: 500 }],
      ]),
    });

    expect(sorted.map((w) => w.path)).toEqual(["/r/apple", "/r/cherry"]);
  });

  it("keeps current-first and bare-last ahead of every timestamp mode", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/bare", isBare: true }),
      makeWorktree({ path: "/r/apple", branch: "apple" }),
      makeWorktree({ path: "/r/banana", branch: "banana" }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, {
      currentPath: "/r/apple",
      mode: "lastCommit",
      // The bare worktree looks newest and apple oldest, so an ordering that
      // respected timestamps first would put both in the wrong place.
      timestamps: new Map([
        ["/r/bare", { lastCommit: 900 }],
        ["/r/apple", { lastCommit: 100 }],
        ["/r/banana", { lastCommit: 500 }],
      ]),
    });

    expect(sorted.map((w) => w.path)).toEqual([
      "/r/apple",
      "/r/banana",
      "/r/bare",
    ]);
  });

  it("resolves timestamp keys by path, not by the string it was given", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/r/apple", branch: "apple" }),
      makeWorktree({ path: "/r/banana/", branch: "banana" }),
    ];

    const sorted = sortWorktreesForDisplay(worktrees, {
      mode: "lastCommit",
      timestamps: new Map([["/r/banana", { lastCommit: 900 }]]),
    });

    expect(sorted.map((w) => w.path)).toEqual(["/r/banana/", "/r/apple"]);
  });
});

describe("worktreeMatchesFilter", () => {
  it("matches everything when the filter is blank", () => {
    expect(worktreeMatchesFilter(makeWorktree({ branch: "feat/x" }), "")).toBe(
      true,
    );
    expect(
      worktreeMatchesFilter(makeWorktree({ branch: "feat/x" }), "   "),
    ).toBe(true);
  });

  it("matches on a branch substring, case-insensitively", () => {
    const worktree = makeWorktree({ branch: "feat/new-login" });
    expect(worktreeMatchesFilter(worktree, "login")).toBe(true);
    expect(worktreeMatchesFilter(worktree, "LOGIN")).toBe(true);
    expect(worktreeMatchesFilter(worktree, "release")).toBe(false);
  });

  it("matches on a path fragment when the branch does not", () => {
    const worktree = makeWorktree({
      path: "/home/dev/worktrees/hotfix",
      branch: "main",
    });
    expect(worktreeMatchesFilter(worktree, "worktrees")).toBe(true);
    expect(worktreeMatchesFilter(worktree, "hotfix")).toBe(true);
  });
});

describe("badges and colours", () => {
  it("derives short, stable badges from the worktree", () => {
    expect(worktreeBadge(makeWorktree({ branch: "feature/login" }))).toBe("LO");
    expect(worktreeBadge(makeWorktree({ branch: "main" }))).toBe("MA");
    expect(worktreeBadge(makeWorktree({ isDetached: true }))).toBe("DT");
    expect(worktreeBadge(makeWorktree({ isBare: true }))).toBe("BA");
  });

  it("badges an unbranched worktree from its directory name", () => {
    expect(worktreeBadge(makeWorktree({ path: "/repos/hotfix" }))).toBe("HO");
  });

  it("keeps a badge for a branch segment with no alphanumerics left to take", () => {
    // Stripping non-alphanumerics can empty the segment; falling back to the raw
    // segment keeps the decoration from rendering as a blank box.
    expect(worktreeBadge(makeWorktree({ branch: "feat/+++" }))).toBe("++");
  });

  it("returns a one-character badge rather than padding a short branch", () => {
    expect(worktreeBadge(makeWorktree({ branch: "x" }))).toBe("X");
  });

  it("assigns a stable palette index within range for a key", () => {
    const first = paletteIndexForKey("feature/login", 20);
    const second = paletteIndexForKey("feature/login", 20);

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(20);
  });

  it("spreads a set of branches across most of the palette", () => {
    const branches = [
      "main",
      "develop",
      "feat/login",
      "feat/signup",
      "fix/crash",
      "fix/typo",
      "release/1.0",
      "chore/deps",
      "user/login-fix",
      "user/dark-mode",
      "bot/nightly-build",
      "bot/cache-warmup",
      "wip/spike",
      "docs/readme",
      "perf/query",
    ];
    const indices = new Set(
      branches.map((b) => paletteIndexForKey(b, 20)),
    );
    // With 20 slots and 15 distinct keys, a good hash should land on many
    // different colours rather than clustering onto a handful.
    expect(indices.size).toBeGreaterThanOrEqual(10);
  });

  it("keys worktree colour by branch, falling back to path", () => {
    expect(worktreeColorKey(makeWorktree({ branch: "main" }))).toBe("main");
    expect(
      worktreeColorKey(makeWorktree({ path: "/r/detached", isDetached: true })),
    ).toBe("/r/detached");
  });
});

describe("branchTypeForBranch", () => {
  it("maps known leading segments to their type", () => {
    expect(branchTypeForBranch("main")).toBe("main");
    expect(branchTypeForBranch("master")).toBe("main");
    expect(branchTypeForBranch("feat/login")).toBe("feature");
    expect(branchTypeForBranch("feature/login")).toBe("feature");
    expect(branchTypeForBranch("fix/crash")).toBe("fix");
    expect(branchTypeForBranch("hotfix/urgent")).toBe("fix");
    expect(branchTypeForBranch("release/1.2.0")).toBe("release");
    expect(branchTypeForBranch("chore/deps")).toBe("chore");
    expect(branchTypeForBranch("docs/readme")).toBe("chore");
  });

  it("matches prefixes case-insensitively", () => {
    expect(branchTypeForBranch("FEAT/login")).toBe("feature");
    expect(branchTypeForBranch("HotFix/x")).toBe("fix");
  });

  it("falls back to other for unknown prefixes and missing branches", () => {
    expect(branchTypeForBranch("wip/experiment")).toBe("other");
    expect(branchTypeForBranch("PROJ-123")).toBe("other");
    expect(branchTypeForBranch(undefined)).toBe("other");
  });

  it("detects a type keyword anywhere in an author- or workflow-prefixed branch", () => {
    expect(branchTypeForBranch("user/login-crash-fix")).toBe("fix");
    expect(branchTypeForBranch("user/image-upload-feat")).toBe("feature");
    expect(branchTypeForBranch("bot/release-1.2")).toBe("release");
    expect(branchTypeForBranch("someone/update-docs")).toBe("chore");
  });

  it("leaves genuinely unmatched work branches as other", () => {
    expect(branchTypeForBranch("user/dashboard-redesign")).toBe("other");
    expect(branchTypeForBranch("bot/dependency-scan")).toBe("other");
  });

  it("resolves multiple matches by precedence (fix beats feature)", () => {
    expect(branchTypeForBranch("feat/urgent-fix")).toBe("fix");
    expect(branchTypeForBranch("feature/main-nav-fix")).toBe("fix");
  });

  it("honours a caller-supplied map over the defaults", () => {
    const map: Record<string, BranchType> = {
      ...DEFAULT_BRANCH_TYPE_MAP,
      wip: "chore",
      epic: "feature",
    };
    expect(branchTypeForBranch("wip/spike", map)).toBe("chore");
    expect(branchTypeForBranch("epic/new-thing", map)).toBe("feature");
    expect(branchTypeForBranch("feat/x", map)).toBe("feature");
  });
});

describe("branchTypeColorId", () => {
  it("returns a distinct semantic colour id per recognised type", () => {
    const types: BranchType[] = ["main", "feature", "fix", "release", "chore"];
    const ids = types.map((t) => branchTypeColorId(t, "irrelevant"));
    expect(new Set(ids).size).toBe(types.length);
    ids.forEach((id) =>
      expect(id.startsWith("betterWorktrees.worktreeType")).toBe(true),
    );
  });

  it("ignores the key for recognised types", () => {
    expect(branchTypeColorId("fix", "a")).toBe(branchTypeColorId("fix", "b"));
  });

  it("hashes other branches across the orange shades, stably", () => {
    const a = branchTypeColorId("other", "user/dashboard-redesign");
    const b = branchTypeColorId("other", "user/dashboard-redesign");
    expect(a).toBe(b);
    expect(a).toMatch(/^betterWorktrees\.worktreeTypeOther[1-8]$/);
  });

  it("spreads different other branches across more than one orange shade", () => {
    const keys = [
      "user/dashboard-redesign",
      "user/dark-mode",
      "bot/dependency-scan",
      "wip/spike",
      "team/describe-contents",
      "x/random-thing",
      "y/another-one",
      "z/and-more",
    ];
    const ids = new Set(keys.map((k) => branchTypeColorId("other", k)));
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });
});

describe("shortenHomePath", () => {
  it("shortens the home directory prefix to a tilde", () => {
    expect(shortenHomePath("/home/dev/repos/app", "/home/dev")).toBe(
      "~/repos/app",
    );
    expect(shortenHomePath("/opt/app", "/home/dev")).toBe("/opt/app");
  });

  it("shortens the home directory itself to a bare tilde", () => {
    expect(shortenHomePath("/home/dev", "/home/dev")).toBe("~");
  });

  it("tolerates a trailing separator on the home directory", () => {
    expect(shortenHomePath("/home/dev/repos", "/home/dev/")).toBe("~/repos");
  });

  it("does not shorten a sibling directory that merely shares the home prefix", () => {
    // Matching on the prefix alone would turn /home/devtools into ~tools.
    expect(shortenHomePath("/home/devtools/app", "/home/dev")).toBe(
      "/home/devtools/app",
    );
  });
});
