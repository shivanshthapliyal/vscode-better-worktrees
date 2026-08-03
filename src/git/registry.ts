import path from "node:path";
import * as vscode from "vscode";
import { log } from "../logger";

interface GitApiRepository {
  readonly rootUri: vscode.Uri;
}

interface GitExtensionApi {
  readonly repositories: readonly GitApiRepository[];
  openRepository(uri: vscode.Uri): Promise<unknown>;
  getRepository(uri: vscode.Uri): unknown;
}

interface GitExtensionExports {
  getAPI(version: 1): GitExtensionApi;
}

/**
 * Registers, lists and closes repositories in the Source Control view.
 *
 * Registration goes through the `git.openRepository` *command* rather than the
 * Git extension API method of the same name. The command forwards to
 * `model.openRepository(path, true)`, and that flag is the only thing that
 * reopens a repository the user (or a previous run of this extension) has
 * closed; the API method omits it and silently declines. Closing is likewise
 * done per-repository against exact roots, because `git.close` falls back to an
 * interactive picker when its argument does not resolve.
 */
export interface GitRepositoryRegistry {
  open(fsPath: string): Promise<boolean>;
  close(fsPath: string): Promise<void>;
  list(): string[];
}

const UNAVAILABLE_REGISTRY: GitRepositoryRegistry = {
  open: async () => false,
  close: async () => {},
  list: () => [],
};

export async function createGitRepositoryRegistry(): Promise<GitRepositoryRegistry> {
  const extension =
    vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
  if (!extension) {
    log("Built-in Git extension (vscode.git) is not available.");
    return UNAVAILABLE_REGISTRY;
  }

  const exports = extension.isActive
    ? extension.exports
    : await extension.activate();
  const api = exports.getAPI(1);

  const list = (): string[] =>
    api.repositories.map((repository) => repository.rootUri.fsPath);

  const isRegistered = (fsPath: string): boolean => {
    const target = path.resolve(fsPath);
    return list().some((root) => path.resolve(root) === target);
  };

  return {
    list,

    async open(fsPath: string): Promise<boolean> {
      if (isRegistered(fsPath)) {
        return true;
      }
      try {
        await vscode.commands.executeCommand("git.openRepository", fsPath);
      } catch (error) {
        log(`Failed to open repository ${fsPath}: ${String(error)}`);
      }
      const registered = isRegistered(fsPath);
      if (!registered) {
        log(`openRepository(${fsPath}) did not register the repository.`);
      }
      return registered;
    },

    async close(fsPath: string): Promise<void> {
      if (!isRegistered(fsPath)) {
        return;
      }
      try {
        await vscode.commands.executeCommand(
          "git.close",
          vscode.Uri.file(fsPath),
        );
      } catch (error) {
        log(`Failed to close repository ${fsPath}: ${String(error)}`);
      }
    },
  };
}
