import * as path from "path";
import { execGit } from "../git/execGit";

export interface SecretFileFinding {
  relativePath: string;
  alreadyTracked: boolean;
  matchedPattern: string;
}

/** Conventionally-safe suffixes that should NOT be flagged even though the base name looks secret-shaped. */
const SAFE_SUFFIXES = [".example", ".sample", ".template", ".dist"];

function hasSafeSuffix(fileName: string): boolean {
  return SAFE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

interface PatternRule {
  label: string;
  test: (fileName: string) => boolean;
}

const PATTERN_RULES: PatternRule[] = [
  {
    label: ".env file",
    test: (name) => /^\.env(\..+)?$/.test(name) && !hasSafeSuffix(name),
  },
  {
    label: "PEM/private key",
    test: (name) => name.endsWith(".pem") && !hasSafeSuffix(name),
  },
  {
    label: "SSH private key",
    // Deliberately excludes *.pub: public keys are not secrets.
    test: (name) => /^id_(rsa|dsa|ecdsa|ed25519)$/.test(name),
  },
  {
    label: "credentials file",
    test: (name) => /^credentials(\..+)?\.json$/i.test(name) && !hasSafeSuffix(name),
  },
  {
    label: "service account key",
    test: (name) => /service[-_]?account.*\.json$/i.test(name) && !hasSafeSuffix(name),
  },
  {
    label: "PKCS#12 keystore",
    test: (name) => name.endsWith(".p12") || name.endsWith(".pfx"),
  },
  {
    label: "Java keystore",
    test: (name) => name.endsWith(".keystore") || name.endsWith(".jks"),
  },
];

function matchSecretFilePattern(fileName: string): string | undefined {
  for (const rule of PATTERN_RULES) {
    if (rule.test(fileName)) {
      return rule.label;
    }
  }
  return undefined;
}

/**
 * Finds files matching common secret-file shapes that are tracked, or
 * untracked-but-not-ignored (`git ls-files --cached --others
 * --exclude-standard` already excludes anything .gitignore already covers,
 * so this only ever surfaces files that actually need attention).
 */
export function findSecretShapedFiles(repoRoot: string): SecretFileFinding[] {
  const tracked = new Set(listLines(execGit(repoRoot, ["ls-files", "--cached"])));
  const candidates = listLines(execGit(repoRoot, ["ls-files", "--cached", "--others", "--exclude-standard"]));

  const findings: SecretFileFinding[] = [];
  for (const relativePath of candidates) {
    const baseName = path.basename(relativePath);
    const matchedPattern = matchSecretFilePattern(baseName);
    if (matchedPattern) {
      findings.push({ relativePath, alreadyTracked: tracked.has(relativePath), matchedPattern });
    }
  }
  return findings;
}

function listLines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim().length > 0);
}
