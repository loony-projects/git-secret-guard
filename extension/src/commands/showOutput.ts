import * as vscode from "vscode";
import { Logger } from "../logger";

export function registerShowOutputCommand(logger: Logger): vscode.Disposable {
  return vscode.commands.registerCommand("gitSecretGuard.showOutput", () => {
    logger.show();
  });
}
