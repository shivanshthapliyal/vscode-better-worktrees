import * as vscode from "vscode";

const OUTPUT_CHANNEL_NAME = "Better Worktrees";
let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }
  return outputChannel;
}

export function log(message: string): void {
  getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function disposeOutputChannel(): void {
  outputChannel?.dispose();
  outputChannel = undefined;
}
