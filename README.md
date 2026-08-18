<p align="center">
  <img src="https://raw.githubusercontent.com/shivanshthapliyal/vscode-better-worktrees/HEAD/icon.png" alt="Better Worktrees" width="112" height="112">
</p>

<h1 align="center">Better Worktrees</h1>

<p align="center">
  <a href="#installation"><img src="https://img.shields.io/badge/Install-VS%20Code%20%26%20Cursor-007ACC?style=flat-square" alt="Install"></a>
  <a href="https://open-vsx.org/extension/shivanshthapliyal/better-worktrees"><img src="https://img.shields.io/open-vsx/v/shivanshthapliyal/better-worktrees?style=flat-square&label=Open%20VSX" alt="Open VSX version"></a>
  <a href="https://open-vsx.org/extension/shivanshthapliyal/better-worktrees"><img src="https://img.shields.io/open-vsx/dt/shivanshthapliyal/better-worktrees?style=flat-square&label=downloads" alt="Open VSX downloads"></a>
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License">
</p>

A small wrapper extension that solves worktree visibility. It shows every git worktree in your Explorer sidebar, colour-coded by branch type, with uncommitted work, ahead/behind, and the current one visible at a glance, and adds `find`, `focus`, `prune stale` and `lock` alongside many other commands to manage worktrees and see their state.

<p align="center">
  <img src="https://raw.githubusercontent.com/shivanshthapliyal/vscode-better-worktrees/HEAD/docs/better-worktrees-demo.gif" alt="Better Worktrees demo: the Worktrees view, per-worktree status, Source Control focus, filtering, and the command palette" width="720">
</p>

Worktrees let you keep several branches checked out at once, but the editor leaves you guessing which one has unsaved work and which the current window is on. Better Worktrees puts them all in one place and keeps every action one click away.

> ### 🎨 Colour-coded by branch type
>
> Every worktree is tinted by what kind of branch it is: 🔵 **feature**, 🔴 **fix**, 🟣 **release**, 🟢 **chore**, ⚪ **`main`**, 🟠 **untyped**, so you read the list by kind instead of squinting at names. The type is detected anywhere in the branch, so `user/login-crash-fix` still reads as a fix. [Fully themeable.](#colouring-worktrees)

And each row carries its state inline:

| Badge | Meaning |
|---|---|
| `● main` | the worktree the current window has open |
| `3●` | uncommitted changes |
| `↑2` / `↓2` | commits ahead of / behind upstream |
| `🔒 locked` | locked, protected from removal |
| `⚠ stale` | directory is gone, prune to clean up |

Click a row to focus Source Control on it; right-click for the full action menu.

---

## Features


|                         | What it does                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Create**              | Walk through a branch name, start point, and destination, suggested from a template and editable before anything is written. |
| **Check out existing**  | Pick a local or remote-tracking branch (skipping ones already in a worktree) and get a worktree on it.                     |
| **From a pull request** | `gh pr checkout` into a fresh worktree, cross-fork PRs included.                                                           |
| **Fetch / Pull / Push** | Per-worktree `fetch --all --prune`, fast-forward-only `pull`, and a `push` that sets the upstream on the first one. Never force-pushes. |
| **Filter & sort**       | Filter the view by branch or path; sort by branch name, uncommitted changes, last commit, or when the worktree was created. |
| **Focus**               | Click a worktree to narrow Source Control to just that branch, or add worktrees to it one at a time; restore all in one click. |
| **Open**                | New or current window, workspace root, file manager, or a terminal, plus copy path/branch.                                |
| **Manage safely**       | Lock/unlock with a reason, prune stale entries, move a worktree through git, and remove (guarded against the main, current, and locked worktrees). |
| **Repair**              | Re-point worktrees at their repository after the repository was moved or renamed on disk.                                  |


Branch names are validated by git, slashes are flattened so `feat/api` stays one folder, and every git call runs through `execFile` (never a shell string).

## Requirements

- `git` available on your `PATH`
- The built-in Git extension (`vscode.git`) enabled
- Optionally, the [GitHub CLI](https://cli.github.com) (`gh`) on your `PATH`, only for *Worktree from Pull Request...*

## Installation

Search for *Better Worktrees* in the Extensions view, or:

```bash
cursor --install-extension shivanshthapliyal.better-worktrees
```

This installs from the [Open VSX Registry](https://open-vsx.org/extension/shivanshthapliyal/better-worktrees) and updates itself as new versions ship.

<details>
<summary>Installing from a <code>.vsix</code> instead</summary>

Download the latest from the [Releases page](https://github.com/shivanshthapliyal/vscode-better-worktrees/releases), then:

```bash
code   --install-extension better-worktrees-<version>.vsix   # VS Code
cursor --install-extension better-worktrees-<version>.vsix   # Cursor
```

Or open the Extensions view, click the **⋯** menu → **Install from VSIX…**, and pick the file. Reload the window if prompted.

A `.vsix` install does not auto-update, so you have to repeat this for every release. Prefer the registry unless you specifically need a pinned version.

</details>

The same package works in both editors: Cursor is built on VS Code, so nothing editor-specific is required.

## Usage

The **Worktrees** view appears in the Explorer sidebar and groups worktrees by repository. From there you can:

- click **New Worktree…** in the view title to create one, or open the title menu for **Checkout Branch as Worktree…** and **Worktree from Pull Request…**
- click the **search** icon in the view title to filter by branch or path; it becomes a clear-filter button while a filter is active
- open the title menu for **Sort Worktrees By...** to order the list by branch name, uncommitted changes, last commit, or creation time
- click a worktree row to focus the Source Control view on it, or right-click for *Add This Worktree to Source Control* to add it alongside whatever is already showing
- hover a worktree row for inline icons: reveal in the Explorer, open a terminal, lock or unlock, and remove. The lock icon reflects the current state, and the trash icon appears only where removal is allowed
- right-click a worktree for the full set of fetch, pull, push, open, workspace, copy, lock, move, and remove actions
- right-click a repository to create or check out a worktree, prune stale entries, or repair worktree links; a prune icon also appears inline on the row while it has anything stale to clear

All commands are also available from the Command Palette under the **Worktrees:** category.

## Settings


| Setting                                | Default                                | Description                                                                                                                                                                                       |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `betterWorktrees.showNotifications`    | `true`                                 | Show success notifications. Warnings and errors are always shown.                                                                                                                                 |
| `betterWorktrees.openWorktreeIn`       | `newWindow`                            | Where the open actions put a worktree: `newWindow` or `currentWindow`.                                                                                                                           |
| `betterWorktrees.scanDepth`            | `3`                                    | How many directory levels deep to search each workspace folder for git repositories. `0` scans only the folder root. `node_modules`, `dist`, `.venv`, and similar directories are always skipped. |
| `betterWorktrees.worktreePathTemplate` | `${repoPath}/../${repoName}-${branch}` | Where new worktrees are suggested (see below).                                                                                                                                                    |
| `betterWorktrees.colorMode`            | `branch`                               | How worktree folders are coloured: `branch` (a distinct hashed colour per branch) or `branchType` (a colour per branch kind; see below).                                                         |
| `betterWorktrees.branchTypeMap`        | `{}`                                   | Overrides for the branch-prefix → type mapping used in `branchType` mode. Merged over the built-in defaults.                                                                                      |
| `betterWorktrees.sortBy`               | `branch`                               | The order worktrees appear in: `branch`, `dirtyFirst`, `lastCommit`, or `created`. Change it from the view title (see below).                                                                     |


### Sorting worktrees

*Sort Worktrees By...* in the view title offers four orders:

| Mode | Order |
| --- | --- |
| `branch` | Alphabetical by branch name (the default) |
| `dirtyFirst` | Worktrees with uncommitted changes first |
| `lastCommit` | Most recently committed first, so the branches you are actually working on lead |
| `created` | Most recently created worktree first |

Every mode keeps the current window's worktree at the top and bare worktrees at the bottom, so the list stays easy to orient in whichever order you pick. Within a mode, ties fall back to the branch name rather than to an arbitrary order.

A worktree whose time cannot be read sorts *after* the ones that can, rather than being treated as the oldest — a stale worktree is unknown, not ancient. Git records no creation time for a worktree, so `created` uses the timestamp of the `.git` file git writes when the worktree is added; the main worktree has no such file and therefore no creation time.

`lastCommit` and `created` read timestamps in the background, and only while one of those modes is selected, so the default orders cost no extra git calls.

### Colouring worktrees

Worktree folders are tinted in the Explorer so you can tell at a glance which one a file belongs to. Two modes:

- **`branch`** (default): each branch gets its own stable colour, hashed from the branch name across a 20-colour palette (`betterWorktrees.worktreeColor1` to `20`). Different branches are easy to tell apart; the colour carries no meaning.
- **`branchType`**: colour by the branch's *kind*, so every feature branch is one colour, every fix another. A branch is split on `/`, `-`, `_`, and `.`, and **every** token is matched (case-insensitively) through `branchTypeMap`. This means the type keyword is found even when the branch is prefixed by an author or workflow, so `user/login-crash-fix` reads as **fix** and `bot/release-1.2` as **release**. When more than one type matches, precedence is `fix` > `release` > `feature` > `chore` > `main`. Six types, each with its own themeable colour:

  | Type      | Colour                                         | Default keywords                                                            |
  | --------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
  | `main`    | slate (`betterWorktrees.worktreeTypeMain`)     | `main`, `master`, `develop`, `trunk`                                        |
  | `feature` | blue (`betterWorktrees.worktreeTypeFeature`)   | `feat`, `feature`                                                           |
  | `fix`     | red (`betterWorktrees.worktreeTypeFix`)        | `fix`, `bugfix`, `hotfix`, `bug`, `patch`                                   |
  | `release` | purple (`betterWorktrees.worktreeTypeRelease`) | `release`, `rel`, `rc`                                                      |
  | `chore`   | green (`betterWorktrees.worktreeTypeChore`)    | `chore`, `refactor`, `docs`, `test`, `ci`, `build`, `deps`, `style`, `perf` |
  | `other`   | a shade of orange                              | *(nothing matched)*                                                         |

  Unrecognised branches don't all get the same colour: they hash across eight shades of orange (`betterWorktrees.worktreeTypeOther1` to `8`), so they read as one "untyped" family while staying distinguishable from each other.

Add or remap prefixes without touching the defaults. For example, to treat `wip/` as a chore and `epic/` as a feature:

```json
"betterWorktrees.colorMode": "branchType",
"betterWorktrees.branchTypeMap": { "wip": "chore", "epic": "feature" }
```

Every colour above (both palettes) is themeable through `workbench.colorCustomizations`.

### Where new worktrees go

`worktreePathTemplate` accepts three placeholders:


| Placeholder   | Expands to                                                                       |
| ------------- | -------------------------------------------------------------------------------- |
| `${repoPath}` | Absolute path of the repository                                                  |
| `${repoName}` | The repository's directory name                                                  |
| `${branch}`   | The new branch, with slashes flattened to hyphens so it stays a single directory |


A leading `~` expands to your home directory, and a relative template resolves against the repository. The default places each worktree beside its repo. To collect them all under one directory instead:

```json
"betterWorktrees.worktreePathTemplate": "~/.worktrees/${repoName}/${branch}"
```

The suggestion is always shown and editable before anything is created; the template only sets the starting point.

## Development

Building from source, the test/lint/package commands, and the project layout are in [DEVELOPMENT.md](DEVELOPMENT.md).

## License

[MIT](LICENSE) © Shivansh Thapliyal
