import * as vscode from "vscode";
import { GitRepositoryRegistry } from "../git/registry";
import { RepoManager } from "../repoManager";

/**
 * What every command handler needs. The registry is requested lazily rather
 * than passed in, because activating the built-in Git extension to obtain it
 * is work no command should pay for until it actually touches Source Control.
 */
export interface CommandContext {
  extension: vscode.ExtensionContext;
  repos: RepoManager;
  getRegistry(): Promise<GitRepositoryRegistry>;
}
