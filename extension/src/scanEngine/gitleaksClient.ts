import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { ProcessRunner, spawnProcessRunner } from "./processRunner";
import { GitleaksReportEntry, RawFinding, fromReportEntry } from "./types";

export interface GitleaksClientOptions {
  binaryPath: string;
  /** Already-merged effective config (see configMerge.ts) as TOML text. */
  effectiveConfig: string;
  runner?: ProcessRunner;
}

export class GitleaksToolError extends Error {}

/**
 * Thin wrapper around the gitleaks CLI. Every method here follows the same
 * shape: write the effective config to a 0600 temp file, tell gitleaks to
 * write its JSON report to a second 0600 temp file, read that file back
 * into memory, and delete BOTH temp files in a `finally` — regardless of
 * outcome. Findings are only ever handed back as RawFinding[]; callers must
 * redact (see ../redact.ts) before showing anything to the user. Nothing
 * gitleaks writes to stdout/stderr is treated as containing secret content
 * (matches only ever go into the report file, never the CLI's own log
 * output), but we still don't forward stderr verbatim anywhere user-facing
 * beyond a generic failure message, out of caution.
 */
export class GitleaksClient {
  private readonly runner: ProcessRunner;

  constructor(private readonly options: GitleaksClientOptions) {
    this.runner = options.runner ?? spawnProcessRunner;
  }

  /** Pre-commit hook path: scan only what's staged. */
  scanStaged(cwd: string): Promise<RawFinding[]> {
    return this.run(["protect", "--staged"], { cwd });
  }

  /** "Scan Workspace" inside a git repo: full history, gitleaks' native strength. */
  scanHistory(cwd: string): Promise<RawFinding[]> {
    return this.run(["detect"], { cwd });
  }

  /** "Scan Workspace" outside a git repo, or a non-repo folder. */
  scanDirectoryNoGit(sourceDir: string): Promise<RawFinding[]> {
    return this.run(["detect", "--no-git", "--source", sourceDir], {});
  }

  /** post-commit safety net: just the commit that was made (covers --no-verify). */
  scanHeadCommit(cwd: string): Promise<RawFinding[]> {
    return this.run(["detect", "--log-opts=-1"], { cwd });
  }

  /** on-save diagnostics: pipe the buffer directly, never touching disk with its content. */
  scanStdin(content: string): Promise<RawFinding[]> {
    return this.run(["stdin"], { input: content });
  }

  private async run(
    subArgs: string[],
    context: { cwd?: string; input?: string },
  ): Promise<RawFinding[]> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-secret-guard-"));
    const configPath = path.join(tempDir, "config.toml");
    const reportPath = path.join(tempDir, `report-${crypto.randomBytes(8).toString("hex")}.json`);

    try {
      fs.writeFileSync(configPath, this.options.effectiveConfig, { mode: 0o600 });

      const args = [
        ...subArgs,
        "--config",
        configPath,
        "--report-format",
        "json",
        "--report-path",
        reportPath,
        "--no-banner",
        "--exit-code",
        "1",
      ];

      const runOptions: { cwd?: string; input?: string } = {};
      if (context.cwd !== undefined) {
        runOptions.cwd = context.cwd;
      }
      if (context.input !== undefined) {
        runOptions.input = context.input;
      }

      const result = await this.runner(this.options.binaryPath, args, runOptions);

      if (fs.existsSync(reportPath)) {
        const raw = fs.readFileSync(reportPath, "utf8");
        return this.parseReport(raw);
      }

      if (result.exitCode !== 0) {
        throw new GitleaksToolError(
          `gitleaks exited with code ${result.exitCode} and produced no report file. ` +
            `Check that gitleaks is installed and the effective config is valid (see the ` +
            `"Git Secret Guard" output channel for the exit code; the tool's own stderr is not ` +
            `shown here since it may echo file paths from the command it was given).`,
        );
      }
      return [];
    } finally {
      this.safeUnlink(configPath);
      this.safeUnlink(reportPath);
      this.safeRmdir(tempDir);
    }
  }

  private parseReport(raw: string): RawFinding[] {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return [];
    }
    const entries = JSON.parse(trimmed) as GitleaksReportEntry[];
    return entries.map(fromReportEntry);
  }

  private safeUnlink(filePath: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // already gone, or was never created — fine either way.
    }
  }

  private safeRmdir(dirPath: string): void {
    try {
      fs.rmdirSync(dirPath);
    } catch {
      // non-empty (shouldn't happen) or already gone — leave it rather than force-delete.
    }
  }
}
