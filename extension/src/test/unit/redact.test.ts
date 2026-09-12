import * as assert from "assert";
import { redactPreview, redactFinding, formatFindingMessage } from "../../redact";

describe("redact", () => {
  it("keeps only first/last 2 chars of a normal-length secret", () => {
    const preview = redactPreview("AKIAABCDEFGHIJKLMNOP");
    assert.strictEqual(preview.startsWith("AK"), true);
    assert.strictEqual(preview.endsWith("OP"), true);
    assert.strictEqual(preview.includes("ABCDEFGHIJKLMN"), false);
  });

  it("fully masks very short values instead of leaking them via head/tail overlap", () => {
    const preview = redactPreview("abcd");
    assert.strictEqual(preview, "****");
  });

  it("never includes the raw secret in the formatted message", () => {
    const rawSecret = "AKIASUPERSECRETVALUE1";
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
