import * as assert from "assert";
import { redactPreview, redactFinding, formatFindingMessage } from "../../redact";

describe("redact", () => {
  it("keeps only first/last 2 chars of a normal-length secret", () => {
    // Deliberately not a provider-shaped prefix (see fixtures/secretFixtures.ts
    // for why this codebase avoids contiguous secret-shaped literals) — this
    // test only exercises redactPreview's own truncation logic.
    const preview = redactPreview("zzABCDEFGHIJKLMNzz");
    assert.strictEqual(preview.startsWith("zz"), true);
    assert.strictEqual(preview.endsWith("zz"), true);
    assert.strictEqual(preview.includes("ABCDEFGHIJKLMN"), false);
  });

  it("fully masks very short values instead of leaking them via head/tail overlap", () => {
    const preview = redactPreview("abcd");
    assert.strictEqual(preview, "****");
  });

  it("never includes the raw secret in the formatted message", () => {
    const rawSecret = "totally-not-a-real-secret-value-001";
    const finding = redactFinding({
      ruleId: "aws-access-key-id",
      description: "AWS access key ID",
      file: "src/config.ts",
      line: 12,
      rawSecret,
    });
    const message = formatFindingMessage(finding);
    assert.strictEqual(message.includes(rawSecret), false);
    assert.strictEqual(message.includes("aws-access-key-id"), true);
  });
});
