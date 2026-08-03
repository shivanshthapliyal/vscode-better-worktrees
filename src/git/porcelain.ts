import { Worktree } from "../types";

/**
 * Parses `git worktree list --porcelain`. The format is one blank-line
 * separated record per worktree, where `worktree <path>` opens a record and the
 * remaining keys are optional flags. Attribute lines carry an optional reason
 * (`locked waiting for CI`), so presence is tested by prefix, not equality.
 */

const BRANCH_REF_PREFIX = "refs/heads/";

export function shortenBranchRef(ref: string): string {
  return ref.startsWith(BRANCH_REF_PREFIX)
    ? ref.slice(BRANCH_REF_PREFIX.length)
    : ref;
}

export function parseWorktreeList(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  let current: Worktree | undefined;

  const commit = (): void => {
    if (current) {
      worktrees.push(current);
      current = undefined;
    }
  };

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trimEnd();

    if (line === "") {
      commit();
      continue;
    }

    if (line.startsWith("worktree ")) {
      commit();
      current = {
        path: line.slice("worktree ".length),
        isBare: false,
        isDetached: false,
        isLocked: false,
        isPrunable: false,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      current.branch = shortenBranchRef(line.slice("branch ".length));
    } else if (line === "bare") {
      current.isBare = true;
    } else if (line === "detached") {
      current.isDetached = true;
    } else if (line === "locked" || line.startsWith("locked ")) {
      current.isLocked = true;
      current.lockReason = optionalReason(line, "locked");
    } else if (line === "prunable" || line.startsWith("prunable ")) {
      current.isPrunable = true;
      current.prunableReason = optionalReason(line, "prunable");
    }
  }

  commit();
  return worktrees;
}

function optionalReason(line: string, key: string): string | undefined {
  const reason = line.slice(key.length).trim();
  return reason === "" ? undefined : reason;
}
