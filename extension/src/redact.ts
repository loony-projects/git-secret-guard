/**
 * The single chokepoint every finding must pass through before it reaches a
 * Diagnostic, a notification, or the output channel. Nothing else in this
 * extension is permitted to format a raw secret value for display — this is
 * what makes the "never echoed verbatim" invariant checkable in one place
 * (see test/unit/noLeak.test.ts, which greps everything a fake logger ever
 * received for fixture secret values).
 */

/** first/last 2 chars of the raw value, with the middle collapsed — never the full value. */
export function redactPreview(rawValue: string): string {
  if (rawValue.length <= 4) {
    return "*".repeat(rawValue.length);
  }
  const head = rawValue.slice(0, 2);
  const tail = rawValue.slice(-2);
  return `${head}${"*".repeat(Math.min(rawValue.length - 4, 8))}${tail}`;
}

export interface RedactedFinding {
  ruleId: string;
  description: string;
  file: string;
  line: number;
  preview: string;
}

export function redactFinding(input: {
  ruleId: string;
  description: string;
  file: string;
  line: number;
  rawSecret: string;
}): RedactedFinding {
  return {
    ruleId: input.ruleId,
    description: input.description,
    file: input.file,
    line: input.line,
    preview: redactPreview(input.rawSecret),
  };
}

export function formatFindingMessage(finding: RedactedFinding): string {
  return `${finding.description} (rule: ${finding.ruleId}) — ${finding.preview}`;
}
