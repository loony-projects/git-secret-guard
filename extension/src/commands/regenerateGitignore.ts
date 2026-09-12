import * as vscode from "vscode";
import * as path from "path";
import { findGitRoot } from "../git/gitRoot";
import { buildProposal, applyProposal } from "../gitignoreAdvisor/advisor";
import { GitignoreDiffContentProvider } from "../gitignoreAdvisor/diffPreviewProvider";
import { readConfig } from "../configuration";
import { Logger } from "../logger";

/**
 * Runs the Advisor and shows the result as an explicit, diffable proposal.
 * Nothing is written to .gitignore unless the user clicks "Apply" — this is
 * also what backs the subtle "new project type detected" notification, so
 * it's factored out from command registration.
 */
export async function runAdvisorAndShowDiff(
  context: vscode.ExtensionContext,
  logger: Logger,
  diffProvider: GitignoreDiffContentProvider,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage("Git Secret Guard: open a folder or workspace first.");
    return;
  }

  const cfg = readConfig(folder.uri);
  const gitRoot = findGitRoot(folder.uri.fsPath) ?? folder.uri.fsPath;
  const gitignorePath = path.join(gitRoot, ".gitignore");

  const proposal = buildProposal({
    repoRoot: gitRoot,
    resourcesDir: path.join(context.extensionPath, "resources"),
    autoDetectProjectType: cfg.autoDetectProjectType,
    gitignorePath,
  });

  if (!proposal.hasChanges) {
    vscode.window.showInformationMessage("Git Secret Guard: .gitignore is already up to date.");
    return;
  }

  logger.info(`.gitignore Advisor: proposing ${proposal.blocks.length} block(s) for ${gitignorePath}`);

  const previewId = `${Date.now()}`;
  const proposedUri = diffProvider.setContent(previewId, proposal.proposedContent);
  const currentUri = vscode.Uri.file(gitignorePath);

  await vscode.commands.executeCommand(
    "vscode.diff",
    currentUri,
    proposedUri,
    "Git Secret Guard: .gitignore (current ↔ proposed)",
  );

  const trackedCount = proposal.secretFileFindings.filter((f) => f.alreadyTracked).length;
  const trackedWarning =
    trackedCount > 0
      ? ` ${trackedCount} matched file(s) are already tracked by git — .gitignore alone will not remove them from history.`
      : "";

  const choice = await vscode.window.showInformationMessage(
    `Git Secret Guard: .gitignore Advisor has ${proposal.blocks.length} suggestion(s).${trackedWarning}`,
    "Apply",
    "Dismiss",
  );

  if (choice === "Apply") {
    applyProposal(gitignorePath, proposal.proposedContent);
    logger.info(`.gitignore Advisor: applied changes to ${gitignorePath}`);
    vscode.window.showInformationMessage("Git Secret Guard: .gitignore updated.");
  }
}

export function registerRegenerateGitignoreCommand(
  context: vscode.ExtensionContext,
  logger: Logger,
  diffProvider: GitignoreDiffContentProvider,
): vscode.Disposable {
  return vscode.commands.registerCommand("gitSecretGuard.regenerateGitignoreSuggestions", () =>
    runAdvisorAndShowDiff(context, logger, diffProvider),
  );
}
