import * as fs from "fs";
import * as path from "path";
import { BINARY_NAME } from "../constants";

/**
 * Resolves the `gitleaks` binary to invoke, in priority order:
 *   1. `gitSecretGuard.gitleaksPath`, when the user set one explicitly.
 *   2. A bundled, platform-specific binary shipped inside the extension
 *      (extension/bin/<platform>-<arch>/gitleaks[.exe]) — populated by CI
 *      at package time via scripts/fetch-gitleaks.sh (downloaded from
 *      gitleaks' own GitHub releases and checksum-verified there; this repo
 *      does not vendor a binary directly, the same binary-distribution
 *      problem the sibling rust-prettier project solves for rustfmt).
 *   3. `gitleaks` resolved from PATH — the normal case for a developer who
 *      installed gitleaks themselves (`brew install gitleaks`, etc.).
 *
 * Never hard-codes an absolute path — platform/arch are read from
 * `process.platform`/`process.arch`, which VS Code's own extension host
 * already reports correctly per-OS.
 */
export class BinaryResolver {
  constructor(
    private readonly extensionPath: string,
    private readonly configuredPath: string,
  ) {}

  resolve(): string {
    if (this.configuredPath && this.configuredPath.trim().length > 0) {
      return this.configuredPath;
    }
    const bundled = this.bundledBinaryPath();
    if (bundled && fs.existsSync(bundled)) {
      return bundled;
    }
    return BINARY_NAME.replace(/\.exe$/, "");
  }

  private bundledBinaryPath(): string | undefined {
    const platformDir = this.platformArchDir();
    if (!platformDir) {
      return undefined;
    }
    return path.join(this.extensionPath, "bin", platformDir, BINARY_NAME);
  }

  private platformArchDir(): string | undefined {
    const platform = process.platform;
    const arch = process.arch;

    const platformName =
      platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform === "linux" ? "linux" : undefined;
    const archName = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : undefined;

    if (!platformName || !archName) {
      return undefined;
    }
    return `${platformName}-${archName}`;
  }
}
