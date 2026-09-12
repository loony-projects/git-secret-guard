import * as vscode from "vscode";
import { MANIFEST_FILE_NAMES } from "./gitignoreAdvisor/projectDetector";
import { readConfig } from "./configuration";
import { runAdvisorAndShowDiff } from "./commands/regenerateGitignore";
import { GitignoreDiffContentProvider } from "./gitignoreAdvisor/diffPreviewProvider";
import { Logger } from "./logger";

/**
 * A dismissible (never blocking) notification when a manifest file appears
 * mid-session (e.g. the user runs `npm init`). Read-only until the user
 * explicitly opts to see/apply suggestions — this never writes .gitignore
 * itself, it only offers to run the same Advisor flow as the command.
 */
export function watchForNewManifests(
  context: vscode.ExtensionContext,
  logger: Logger,
  diffProvider: GitignoreDiffContentProvider,
): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }

  const pattern = new vscode.RelativePattern(folder, `**/{${MANIFEST_FILE_NAMES.join(",")}}`);
  const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, true);

  watcher.onDidCreate(async (uri) => {
    const cfg = readConfig(folder.uri);
    if (!cfg.autoDetectProjectType || !cfg.notifyOnNewManifest) {
      return;
    }
    logger.info(`New manifest detected: ${uri.fsPath}`);
    const choice = await vscode.window.showInformationMessage(
      `Git Secret Guard: new project manifest detected (${uri.fsPath.split("/").pop()}). Update .gitignore suggestions?`,
      "Review Suggestions",
      "Dismiss",
    );
    if (choice === "Review Suggestions") {
      await runAdvisorAndShowDiff(context, logger, diffProvider);
    }
  });

  context.subscriptions.push(watcher);
}
