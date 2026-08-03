import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({}), { virtual: true });
vi.mock("../logger", () => ({ log: vi.fn() }));

import { findGitRepos } from "./discovery";

describe("findGitRepos", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "better-worktrees-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeRepo(relative: string): Promise<string> {
    const repoDir = path.join(root, relative);
    await mkdir(repoDir, { recursive: true });
    await mkdir(path.join(repoDir, ".git"));
    return repoDir;
  }

  it("finds a repo at the scan root", async () => {
    const repo = await makeRepo(".");
    expect(await findGitRepos(root, 3)).toEqual([repo]);
  });

  it("finds repos nested several levels deep", async () => {
    const nested = await makeRepo("org/repos/main/api");
    expect(await findGitRepos(root, 4)).toContain(nested);
  });

  it("finds multiple sibling repos", async () => {
    const a = await makeRepo("org/repos/api");
    const b = await makeRepo("org/repos/web");
    const found = await findGitRepos(root, 4);
    expect(found).toContain(a);
    expect(found).toContain(b);
  });

  it("treats a .git file (linked worktree) as a repo", async () => {
    const wt = path.join(root, "worktrees", "feature");
    await mkdir(wt, { recursive: true });
    await writeFile(path.join(wt, ".git"), "gitdir: /somewhere/.git/worktrees/x");
    expect(await findGitRepos(root, 3)).toContain(wt);
  });

  it("does not descend into a repo once found", async () => {
    const repo = await makeRepo("outer");
    await makeRepo("outer/inner-submodule");
    const found = await findGitRepos(root, 5);
    expect(found).toEqual([repo]);
  });

  it("skips ignored directories like node_modules", async () => {
    await makeRepo("node_modules/some-pkg");
    const real = await makeRepo("src/app");
    const found = await findGitRepos(root, 4);
    expect(found).toEqual([real]);
  });

  it("respects the max depth limit", async () => {
    await makeRepo("a/b/c/deep");
    expect(await findGitRepos(root, 1)).toEqual([]);
  });

  it("scans only the root at depth 0", async () => {
    await makeRepo("child");
    expect(await findGitRepos(root, 0)).toEqual([]);
  });
});
