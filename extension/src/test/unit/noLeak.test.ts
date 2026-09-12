import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { Logger, OutputSink } from "../../logger";
import { redactFinding, formatFindingMessage } from "../../redact";
import { RawFinding } from "../../scanEngine/types";

/**
 * The safety invariant this whole extension exists to uphold: a detected
 * secret must never be logged, echoed, or transmitted verbatim. This test
 * takes every fixture secret value, runs it through the exact
 * redact-then-log path the commands use (see commands/scanWorkspace.ts),
 * and greps everything the output channel ever received for the raw value.
 */

const FIXTURES_SECRETS_DIR = path.join(__dirname, "..", "..", "..", "..", "fixtures", "secrets");

class RecordingSink implements OutputSink {
  readonly lines: string[] = [];
  appendLine(value: string): void {
    this.lines.push(value);
  }
  show(): void {
    // no-op
  }
  dispose(): void {
    // no-op
  }
}

function extractLikelySecretTokens(fixtureContent: string): string[] {
  // Anything that looks like the "value" half of a KEY=value or KEY: value line,
  // plus any long contiguous token — deliberately broad so this test is a strong
  // grep, not a narrow one tailored to what we expect to find.
  const tokens = new Set<string>();
  for (const match of fixtureContent.matchAll(/[A-Za-z0-9_/+.=-]{16,}/g)) {
    tokens.add(match[0]);
  }
  return Array.from(tokens);
}

describe("no secret ever reaches the logger", () => {
  const fixtureFiles = fs.readdirSync(FIXTURES_SECRETS_DIR);

  for (const fixtureFile of fixtureFiles) {
    it(`redact -> log pipeline never echoes a raw token from fixtures/secrets/${fixtureFile}`, () => {
      const content = fs.readFileSync(path.join(FIXTURES_SECRETS_DIR, fixtureFile), "utf8");
      const tokens = extractLikelySecretTokens(content);
      assert.ok(tokens.length > 0, "fixture should contain at least one long token to test with");

      const sink = new RecordingSink();
      const logger = new Logger(sink);

      for (const token of tokens) {
        const finding: RawFinding = {
          ruleId: "test-rule",
          description: "test finding",
          file: fixtureFile,
          line: 1,
          rawSecret: token,
        };
        const redacted = redactFinding(finding);
        logger.warn(`  ${redacted.file}:${redacted.line} — ${formatFindingMessage(redacted)}`);
      }

      const allLoggedText = sink.lines.join("\n");
      for (const token of tokens) {
        assert.strictEqual(
          allLoggedText.includes(token),
          false,
          `raw token from ${fixtureFile} leaked into logger output: ${token.slice(0, 4)}...`,
        );
      }
    });
  }
});
