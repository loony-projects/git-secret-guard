import * as vscode from "vscode";
import * as path from "path";
import { createVscodeLogger, Logger } from "./logger";
import { readConfig } from "./configuration";
import { CONFIG_SECTION } from "./constants";
import { BinaryResolver } from "./scanEngine/binaryResolver";
import { GitleaksClient } from "./scanEngine/gitleaksClient";
import { buildEffectiveConfig } from "./scanEngine/effectiveConfig";
import { DiagnosticsProvider } from "./diagnostics/diagnosticsProvider";
import { GitignoreDiffContentProvider, DIFF_SCHEME } from "./gitignoreAdvisor/diffPreviewProvider";
import { buildProposal } from "./gitignoreAdvisor/advisor";
import { findGitRoot } from "./git/gitRoot";
import { registerScanWorkspaceCommand } from "./commands/scanWorkspace";
import { registerRegenerateGitignoreCommand, runAdvisorAndShowDiff } from "./commands/regenerateGitignore";
import { registerInstallHookCommand, registerUninstallHookCommand } from "./commands/installHook";
import { registerShowOutputCommand } from "./commands/showOutput";
import { watchForNoVerifyAlerts } from "./alertWatcher";
import { watchForNewManifests } from "./manifestWatcher";

export function activate(context: vscode.ExtensionContext): void {
  const logger = createVscodeLogger();
  logger.info("Git Secret Guard activated.");

  const diffProvider = new GitignoreDiffContentProvider();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, diffProvider));

  context.subscriptions.push(registerScanWorkspaceCommand(context, logger));
  context.subscriptions.push(registerRegenerateGitignoreCommand(context, logger, diffProvider));
  context.subscriptions.push(registerInstallHookCommand(context, logger));
  context.subscriptions.push(registerUninstallHookCommand(logger));
  context.subscriptions.push(registerShowOutputCommand(logger));

  let diagnosticsProvider = createDiagnosticsProvider(context);
  context.subscriptions.push({ dispose: () => diagnosticsProvider.dispose() });

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const cfg = readConfig(document.uri);
      if (!cfg.scanOnSave || document.uri.scheme !== "file") {
        return;
      }
      await diagnosticsProvider.scanDocument(document);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => diagnosticsProvider.clear(document.uri)),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${CONFIG_SECTION}.gitleaksPath`)) {
        diagnosticsProvider.dispose();
        diagnosticsProvider = createDiagnosticsProvider(context);
      }
    }),
  );

  watchForNoVerifyAlerts(context, logger);
  watchForNewManifests(context, logger, diffProvider);

  // Read-only, dismissible check on workspace open (spec §5.5) — reuses the same Advisor flow as the command,
  // but only notifies; it never writes anything without the user clicking "Apply" in that same flow.
  void runReadOnlyAdvisorCheckOnStartup(context, logger, diffProvider);

  function createDiagnosticsProvider(ctx: vscode.ExtensionContext): DiagnosticsProvider {
    const cfg = readConfig();
    const binaryPath = new BinaryResolver(ctx.extensionPath, cfg.gitleaksPath).resolve();
    const effectiveConfig = buildEffectiveConfig({
      extensionPath: ctx.extensionPath,
      customRulesPath: cfg.customRulesPath,
      allowlistPath: cfg.allowlistPath,
    });
    const client = new GitleaksClient({ binaryPath, effectiveConfig });
    return new DiagnosticsProvider(client, logger);
  }
}

async function runReadOnlyAdvisorCheckOnStartup(
  context: vscode.ExtensionContext,
  logger: Logger,
  diffProvider: GitignoreDiffContentProvider,
): Promise<void> {
  const cfg = readConfig();
  if (!cfg.autoDetectProjectType) {
    return;
  }
  try {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return;
    }
    const gitRoot = findGitRoot(folder.uri.fsPath) ?? folder.uri.fsPath;
    const gitignorePath = path.join(gitRoot, ".gitignore");
    const proposal = buildProposal({
      repoRoot: gitRoot,
      resourcesDir: path.join(context.extensionPath, "resources"),
      autoDetectProjectType: true,
      gitignorePath,
    });

    if (!proposal.hasChanges) {
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      `Git Secret Guard: .gitignore Advisor has ${proposal.blocks.length} suggestion(s) for this project.`,
      "Review Suggestions",
      "Dismiss",
    );
    if (choice === "Review Suggestions") {
      await runAdvisorAndShowDiff(context, logger, diffProvider);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Startup Advisor check skipped: ${message}`);
  }
}

export function deactivate(): void {
  // All disposables are registered on context.subscriptions; nothing else to clean up.
}
