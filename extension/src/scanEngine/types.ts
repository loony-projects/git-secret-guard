/** Shape of one entry in a gitleaks JSON report (fields we actually use). */
export interface GitleaksReportEntry {
  RuleID: string;
  Description: string;
  File: string;
  StartLine: number;
  EndLine: number;
  Secret: string;
  Match: string;
  Commit?: string;
}

/** In-process representation of a finding, before it is ever redacted for display. */
export interface RawFinding {
  ruleId: string;
  description: string;
  file: string;
  line: number;
  rawSecret: string;
}

export function fromReportEntry(entry: GitleaksReportEntry): RawFinding {
  return {
    ruleId: entry.RuleID,
    description: entry.Description,
    file: entry.File,
    line: entry.StartLine,
    rawSecret: entry.Secret || entry.Match,
  };
}

export type ScanMode = "protect-staged" | "detect-history" | "detect-no-git" | "stdin" | "detect-head";
