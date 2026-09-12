import * as vscode from "vscode";
import { GitleaksClient } from "../scanEngine/gitleaksClient";
import { redactFinding, formatFindingMessage } from "../redact";
import { Logger } from "../logger";
import { OUTPUT_CHANNEL_NAME } from "../constants";

/**
 * On-save diagnostics: pipes the saved buffer straight into `gitleaks
 * stdin` (see GitleaksClient.scanStdin), so the file's content is never
 * written to disk by us. Every Diagnostic message is built from a
 * redacted finding — see redact.ts — never the raw match.
 */
export class DiagnosticsProvider {
  private readonly collection: vscode.DiagnosticCollection;

  constructor(
    private readonly client: GitleaksClient,
    private readonly logger: Logger,
  ) {
    this.collection = vscode.languages.createDiagnosticCollection(OUTPUT_CHANNEL_NAME);
  }

  async scanDocument(document: vscode.TextDocument): Promise<void> {
    try {
      const findings = await this.client.scanStdin(document.getText());
      const diagnostics = findings.map((finding) => {
        const redacted = redactFinding(finding);
        const lineIndex = Math.max(0, redacted.line - 1);
        const line = document.lineAt(Math.min(lineIndex, document.lineCount - 1));
        const range = new vscode.Range(line.range.start, line.range.end);
        const diagnostic = new vscode.Diagnostic(range, formatFindingMessage(redacted), vscode.DiagnosticSeverity.Warning);
        diagnostic.source = OUTPUT_CHANNEL_NAME;
        diagnostic.code = redacted.ruleId;
        return diagnostic;
      });
      this.collection.set(document.uri, diagnostics);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`On-save scan failed for ${document.uri.fsPath}: ${message}`);
    }
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
