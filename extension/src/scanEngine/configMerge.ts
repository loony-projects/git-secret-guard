/**
 * Merges the bundled default ruleset, an optional user custom-rules file,
 * and an optional user allowlist file into one effective gitleaks TOML
 * config, without pulling in a full TOML parser dependency.
 *
 * This intentionally supports only the subset of TOML that gitleaks configs
 * actually need for this merge:
 *   - a `title` (and any other top-level scalars) taken ONLY from the
 *     default config, so the merged file never has a duplicate top-level
 *     key;
 *   - any number of `[[rules]]` array-of-tables blocks, concatenated from
 *     all three sources in order (default, then custom rules, so a custom
 *     rule with the same id can shadow a default one — gitleaks uses the
 *     last-defined rule with a given id);
 *   - a single `[allowlist]` table, whose `paths` / `regexes` / `stopwords`
 *     arrays are concatenated across all sources that define one (TOML
 *     itself has no way to merge two `[allowlist]` tables, so this is done
 *     at the field level).
 *
 * Custom-rules and allowlist files are expected to be "fragment" files
 * containing only `[[rules]]` and/or `[allowlist]` blocks (documented in
 * docs/configuration.md) — any other top-level content in them is ignored
 * rather than guessed at.
 */

interface AllowlistFields {
  description: string | undefined;
  paths: string[];
  regexes: string[];
  stopwords: string[];
}

const RULES_HEADER = /^\[\[rules\]\]\s*$/;
const ALLOWLIST_HEADER = /^\[allowlist\]\s*$/;
const TOP_LEVEL_TABLE_HEADER = /^\[/;

function splitLines(text: string): string[] {
  return text.split(/\r\n|\n/);
}

/** Everything before the first top-level `[...]` table header — title, etc. */
export function extractHeader(text: string): string {
  const lines = splitLines(text);
  const headerLines: string[] = [];
  for (const line of lines) {
    if (TOP_LEVEL_TABLE_HEADER.test(line.trim())) {
      break;
    }
    headerLines.push(line);
  }
  return headerLines.join("\n").trim();
}

/** All `[[rules]]` blocks, each returned as its full source text including the header line. */
export function extractRuleBlocks(text: string): string[] {
  const lines = splitLines(text);
  const blocks: string[] = [];
  let current: string[] | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (RULES_HEADER.test(trimmed)) {
      if (current) {
        blocks.push(current.join("\n").trim());
      }
      current = [line];
      continue;
    }
    if (current && TOP_LEVEL_TABLE_HEADER.test(trimmed) && !RULES_HEADER.test(trimmed)) {
      blocks.push(current.join("\n").trim());
      current = undefined;
      continue;
    }
    if (current) {
      current.push(line);
    }
  }
  if (current) {
    blocks.push(current.join("\n").trim());
  }
  return blocks;
}

/** Extracts a single-line array value, e.g. `paths = [ '''a''', '''b''' ]` -> ["a", "b"]. */
function extractSingleLineArray(blockText: string, field: string): string[] {
  const re = new RegExp(`^\\s*${field}\\s*=\\s*\\[(.*)\\]\\s*$`, "m");
  const match = re.exec(blockText);
  if (!match) {
    return [];
  }
  const inner = match[1].trim();
  if (inner.length === 0) {
    return [];
  }
  return inner
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => stripTomlStringQuotes(entry));
}

export function extractScalarField(blockText: string, field: string): string | undefined {
  const re = new RegExp(`^\\s*${field}\\s*=\\s*(.+)\\s*$`, "m");
  const match = re.exec(blockText);
  if (!match) {
    return undefined;
  }
  return stripTomlStringQuotes(match[1].trim());
}

function stripTomlStringQuotes(value: string): string {
  const triple = /^'''([\s\S]*)'''$/.exec(value) || /^"""([\s\S]*)"""$/.exec(value);
  if (triple) {
    return triple[1];
  }
  const single = /^'(.*)'$/.exec(value) || /^"(.*)"$/.exec(value);
  if (single) {
    return single[1];
  }
  return value;
}

/** Extracts the `[allowlist]` table's fields, if present. */
export function extractAllowlist(text: string): AllowlistFields | undefined {
  const lines = splitLines(text);
  let current: string[] | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (ALLOWLIST_HEADER.test(trimmed)) {
      current = [line];
      continue;
    }
    if (current && TOP_LEVEL_TABLE_HEADER.test(trimmed) && !ALLOWLIST_HEADER.test(trimmed)) {
      break;
    }
    if (current) {
      current.push(line);
    }
  }
  if (!current) {
    return undefined;
  }
  const blockText = current.join("\n");
  return {
    description: extractScalarField(blockText, "description"),
    paths: extractSingleLineArray(blockText, "paths"),
    regexes: extractSingleLineArray(blockText, "regexes"),
    stopwords: extractSingleLineArray(blockText, "stopwords"),
  };
}

function tomlLiteralArray(values: string[]): string {
  return `[ ${values.map((v) => `'''${v}'''`).join(", ")} ]`;
}

/**
 * Produces one effective gitleaks TOML config from the bundled default and
 * optional custom-rules / allowlist fragment texts.
 */
export function mergeGitleaksConfigs(
  defaultTomlText: string,
  customRulesTomlText: string | undefined,
  allowlistTomlText: string | undefined,
): string {
  const header = extractHeader(defaultTomlText);
  const ruleBlocks = [
    ...extractRuleBlocks(defaultTomlText),
    ...(customRulesTomlText ? extractRuleBlocks(customRulesTomlText) : []),
  ];

  const allowlists = [
    extractAllowlist(defaultTomlText),
    customRulesTomlText ? extractAllowlist(customRulesTomlText) : undefined,
    allowlistTomlText ? extractAllowlist(allowlistTomlText) : undefined,
  ].filter((a): a is AllowlistFields => a !== undefined);

  const parts: string[] = [];
  if (header) {
    parts.push(header);
  }
  parts.push(...ruleBlocks);

  if (allowlists.length > 0) {
    const paths = dedupe(allowlists.flatMap((a) => a.paths));
    const regexes = dedupe(allowlists.flatMap((a) => a.regexes));
    const stopwords = dedupe(allowlists.flatMap((a) => a.stopwords));
    const description = allowlists.map((a) => a.description).find((d) => d !== undefined);

    if (paths.length > 0 || regexes.length > 0 || stopwords.length > 0) {
      const allowlistLines = ["[allowlist]"];
      if (description) {
        allowlistLines.push(`description = '''${description}'''`);
      }
      if (paths.length > 0) {
        allowlistLines.push(`paths = ${tomlLiteralArray(paths)}`);
      }
      if (regexes.length > 0) {
        allowlistLines.push(`regexes = ${tomlLiteralArray(regexes)}`);
      }
      if (stopwords.length > 0) {
        allowlistLines.push(`stopwords = ${tomlLiteralArray(stopwords)}`);
      }
      parts.push(allowlistLines.join("\n"));
    }
  }

  return parts.join("\n\n") + "\n";
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
