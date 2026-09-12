import * as assert from "assert";
import * as fs from "fs";
import { GitleaksClient, GitleaksToolError } from "../../scanEngine/gitleaksClient";
import { ProcessRunner } from "../../scanEngine/processRunner";

const SAMPLE_REPORT = [
  {
    RuleID: "aws-access-key-id",
    Description: "AWS access key ID",
    File: "src/config.ts",
    StartLine: 12,
    EndLine: 12,
    Secret: "AKIAFAKEEXAMPLE12345",
    Match: "AKIAFAKEEXAMPLE12345",
  },
];

function fakeRunnerWritingReport(reportContent: string, exitCode = 1): ProcessRunner {
  return async (_command, args) => {
    const reportPathIndex = args.indexOf("--report-path");
    const reportPath = args[reportPathIndex + 1];
    fs.writeFileSync(reportPath, reportContent, "utf8");
    return { stdout: "", stderr: "", exitCode };
  };
}

function fakeRunnerNoReport(exitCode: number): ProcessRunner {
  return async () => ({ stdout: "", stderr: "some tool error", exitCode });
}

describe("GitleaksClient", () => {
  it("parses a JSON report into RawFinding[] and cleans up temp files", async () => {
    let capturedReportPath = "";
    const runner: ProcessRunner = async (_command, args) => {
      const idx = args.indexOf("--report-path");
      capturedReportPath = args[idx + 1];
      fs.writeFileSync(capturedReportPath, JSON.stringify(SAMPLE_REPORT), "utf8");
      return { stdout: "", stderr: "", exitCode: 1 };
    };

    const client = new GitleaksClient({ binaryPath: "gitleaks", effectiveConfig: "title = \"t\"\n", runner });
    const findings = await client.scanStaged("/tmp/repo");

    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].ruleId, "aws-access-key-id");
    assert.strictEqual(findings[0].rawSecret, "AKIAFAKEEXAMPLE12345");
    assert.strictEqual(fs.existsSync(capturedReportPath), false, "report temp file must be deleted after reading");
  });

  it("returns an empty array when the report is an empty JSON array (no leaks)", async () => {
    const runner = fakeRunnerWritingReport("[]", 0);
    const client = new GitleaksClient({ binaryPath: "gitleaks", effectiveConfig: "title = \"t\"\n", runner });
    const findings = await client.scanHistory("/tmp/repo");
    assert.deepStrictEqual(findings, []);
  });

  it("throws a generic GitleaksToolError (no raw stderr) when the tool fails without producing a report", async () => {
    const runner = fakeRunnerNoReport(127);
    const client = new GitleaksClient({ binaryPath: "gitleaks", effectiveConfig: "title = \"t\"\n", runner });
    await assert.rejects(() => client.scanStdin("some file content"), (err: unknown) => {
      assert.ok(err instanceof GitleaksToolError);
      assert.strictEqual((err as Error).message.includes("some tool error"), false);
      return true;
    });
  });

  it("writes the effective config to a 0600 temp file for the duration of the call", async () => {
    let observedMode: number | undefined;
    const runner: ProcessRunner = async (_command, args) => {
      const idx = args.indexOf("--config");
      const configPath = args[idx + 1];
      observedMode = fs.statSync(configPath).mode & 0o777;
      const reportIdx = args.indexOf("--report-path");
      fs.writeFileSync(args[reportIdx + 1], "[]", "utf8");
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const client = new GitleaksClient({ binaryPath: "gitleaks", effectiveConfig: "title = \"t\"\n", runner });
    await client.scanDirectoryNoGit("/tmp/some-dir");
    assert.strictEqual(observedMode, 0o600);
  });
});
