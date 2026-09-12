import * as vscode from "vscode";

export const DIFF_SCHEME = "git-secret-guard-preview";

/**
 * Backs the virtual "proposed .gitignore" side of the diff view VS Code
 * opens via `vscode.diff`. The real .gitignore is opened as an ordinary
 * file Uri; only the "after" side is virtual, and it is never written
 * anywhere until the user runs the Apply command.
 */
export class GitignoreDiffContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  setContent(id: string, content: string): vscode.Uri {
    this.contents.set(id, content);
    const uri = vscode.Uri.parse(`${DIFF_SCHEME}:/${id}/.gitignore%20(proposed)`);
    this.emitter.fire(uri);
    return uri;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const id = uri.path.split("/")[1];
    return this.contents.get(id) ?? "";
  }
}
