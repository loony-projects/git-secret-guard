import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");
    const workspacePath = path.resolve(__dirname, "../../src/test/fixtures/sample-workspace");

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspacePath, "--disable-extensions", "--disable-gpu", "--no-sandbox"],
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to run integration tests", err);
    process.exit(1);
  }
}

void main();
