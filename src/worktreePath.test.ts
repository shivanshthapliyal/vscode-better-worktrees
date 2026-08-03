import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKTREE_PATH_TEMPLATE,
  resolveWorktreePath,
  sanitizeBranchForPath,
} from "./worktreePath";

describe("sanitizeBranchForPath", () => {
  it("keeps a plain branch name unchanged", () => {
    expect(sanitizeBranchForPath("hotfix")).toBe("hotfix");
  });

  it("flattens slashes so a namespaced branch stays one directory", () => {
    expect(sanitizeBranchForPath("feat/DATA-123-add-page")).toBe(
      "feat-DATA-123-add-page",
    );
  });

  it("flattens backslashes too", () => {
    expect(sanitizeBranchForPath("feat\\win")).toBe("feat-win");
  });

  it("collapses runs of separators into one", () => {
    expect(sanitizeBranchForPath("feat//a___b")).toBe("feat-a_b");
  });

  it("strips leading and trailing separators and dots", () => {
    expect(sanitizeBranchForPath("/feat/x/")).toBe("feat-x");
    expect(sanitizeBranchForPath(".hidden.")).toBe("hidden");
  });

  it("replaces characters that are hostile in a path", () => {
    expect(sanitizeBranchForPath("feat:a*b?c")).toBe("feat-a-b-c");
  });

  it("never returns a name that starts with a dash", () => {
    expect(sanitizeBranchForPath("--force")).toBe("force");
  });

  it("falls back to a placeholder when nothing usable is left", () => {
    expect(sanitizeBranchForPath("///")).toBe("worktree");
  });
});

describe("resolveWorktreePath", () => {
  const HOME = "/home/dev";
  const REPO = "/home/dev/repos/api";

  it("places a worktree beside the repo with the default template", () => {
    expect(
      resolveWorktreePath(DEFAULT_WORKTREE_PATH_TEMPLATE, {
        repoPath: REPO,
        branch: "hotfix",
        homeDir: HOME,
      }),
    ).toBe("/home/dev/repos/api-hotfix");
  });

  it("sanitizes the branch when expanding it into a path", () => {
    expect(
      resolveWorktreePath(DEFAULT_WORKTREE_PATH_TEMPLATE, {
        repoPath: REPO,
        branch: "feat/DATA-123",
        homeDir: HOME,
      }),
    ).toBe("/home/dev/repos/api-feat-DATA-123");
  });

  it("expands a leading tilde against the home directory", () => {
    expect(
      resolveWorktreePath("~/.worktrees/${repoName}/${branch}", {
        repoPath: REPO,
        branch: "feat/x",
        homeDir: HOME,
      }),
    ).toBe("/home/dev/.worktrees/api/feat-x");
  });

  it("supports the repoPath placeholder for a nested layout", () => {
    expect(
      resolveWorktreePath("${repoPath}/.worktrees/${branch}", {
        repoPath: REPO,
        branch: "hotfix",
        homeDir: HOME,
      }),
    ).toBe("/home/dev/repos/api/.worktrees/hotfix");
  });

  it("resolves a relative template against the repo, not the process cwd", () => {
    expect(
      resolveWorktreePath("../side/${branch}", {
        repoPath: REPO,
        branch: "hotfix",
        homeDir: HOME,
      }),
    ).toBe("/home/dev/repos/side/hotfix");
  });

  it("normalizes away traversal segments", () => {
    expect(
      resolveWorktreePath("${repoPath}/../../${branch}", {
        repoPath: REPO,
        branch: "hotfix",
        homeDir: HOME,
      }),
    ).toBe("/home/dev/hotfix");
  });

  it("leaves an unknown placeholder alone rather than emptying it", () => {
    expect(
      resolveWorktreePath("${repoPath}/${nope}", {
        repoPath: REPO,
        branch: "hotfix",
        homeDir: HOME,
      }),
    ).toBe("/home/dev/repos/api/${nope}");
  });

  it("falls back to the default template when the setting is blank", () => {
    expect(
      resolveWorktreePath("   ", {
        repoPath: REPO,
        branch: "hotfix",
        homeDir: HOME,
      }),
    ).toBe("/home/dev/repos/api-hotfix");
  });
});
