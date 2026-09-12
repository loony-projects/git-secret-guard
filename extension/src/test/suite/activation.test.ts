import * as assert from "assert";
import * as vscode from "vscode";

suite("Git Secret Guard activation", () => {
  test("extension activates and registers its commands", async () => {
    const ext = vscode.extensions.getExtension("git-secret-guard.git-secret-guard");
    assert.ok(ext, "extension not found — check publisher.name in package.json");
    await ext!.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      "gitSecretGuard.scanWorkspace",
      "gitSecretGuard.regenerateGitignoreSuggestions",
      "gitSecretGuard.installHook",
      "gitSecretGuard.uninstallHook",
      "gitSecretGuard.showOutput",
    ]) {
      assert.ok(commands.includes(command), `command not registered: ${command}`);
    }
  });
});
