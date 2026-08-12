# Development

```bash
npm install
npm test        # vitest
npm run lint    # eslint
npm run compile # tsc
npm run package # produces a .vsix
```

## Project layout

```
src/
  extension.ts    activation and wiring, no logic of its own
  types.ts        shared shapes, imports nothing
  config.ts       every setting, read in one place
  display.ts      labels, badges, paths, sort order
  worktreePath.ts where a new worktree goes, template expansion
  removal.ts      the safety rules for remove and prune
  repoManager.ts  what worktrees exist, plus the file watcher
  git/            cli.ts (git invocations), porcelain.ts (parsing),
                  discovery.ts (repo scan), registry.ts (Source Control)
  commands/       one module per group of commands
  views/          tree and file decorations
```

Modules that import `vscode` are the editor-facing ones: `extension`, `config`, `commands/`, `views/`, `repoManager`, `git/registry`, `notifications`, `prompts`, and `logger`. Everything else is pure and tested without an editor stub. Git is always invoked through `execFile` with an argument array (never a shell string), and destructive subcommands place `--` before path operands, so nothing in a path or branch name can be misread as a flag.

## Design notes

Creation covers **new branches only**. Checking out an existing branch, tracking a remote one, or a detached checkout are handled by the separate *Checkout Branch as Worktree...* and *Worktree from Pull Request...* commands; keeping creation to a single path avoids turning the flow into a mode picker.

Checkout skips branches already in a worktree because git refuses to check the same branch out twice; the ones it hides are the ones the command could not act on anyway. *Worktree from Pull Request...* creates the worktree detached and lets `gh pr checkout` switch it to the PR branch, which is how gh reaches PRs from forks and remotes that raw `git worktree add` cannot; if the checkout fails the worktree is removed so a failed attempt leaves nothing behind. *Pull* is fast-forward only on purpose: a merge or rebase from a menu, with no diff in front of you, is better done deliberately in a terminal.

The extension registers worktrees with the built-in Git extension through the `git.openRepository` *command* rather than the Git API method of the same name, because only the command reopens a repository that was previously closed. Narrowing the Source Control view works by closing the other repositories, since there is no API to select a repository row; every close is reversible through *Show All Worktrees in Source Control*.
