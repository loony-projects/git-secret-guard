import * as assert from "assert";
import { mergeGitleaksConfigs, extractRuleBlocks, extractAllowlist } from "../../scanEngine/configMerge";

const DEFAULT_TOML = `
title = "default"

[[rules]]
id = "rule-a"
description = "Rule A"
regex = '''AAA'''

[allowlist]
description = "default allowlist"
paths = [ '''\\.env\\.example$''' ]
`;

const CUSTOM_TOML = `
[[rules]]
id = "rule-b"
description = "Rule B"
regex = '''BBB'''
`;

const ALLOWLIST_TOML = `
[allowlist]
regexes = [ '''EXAMPLE_NOT_REAL''' ]
stopwords = [ '''changeme''' ]
`;

describe("configMerge", () => {
  it("keeps only the default file's header (title) — never a duplicate top-level key", () => {
    const merged = mergeGitleaksConfigs(DEFAULT_TOML, CUSTOM_TOML, ALLOWLIST_TOML);
    const titleOccurrences = merged.match(/^title\s*=/gm) ?? [];
    assert.strictEqual(titleOccurrences.length, 1);
  });

  it("concatenates rule blocks from default and custom", () => {
    const merged = mergeGitleaksConfigs(DEFAULT_TOML, CUSTOM_TOML, undefined);
    assert.strictEqual(extractRuleBlocks(merged).length, 2);
    assert.ok(merged.includes('id = "rule-a"'));
    assert.ok(merged.includes('id = "rule-b"'));
  });

  it("merges allowlist fields across all three sources into one [allowlist] table", () => {
    const merged = mergeGitleaksConfigs(DEFAULT_TOML, CUSTOM_TOML, ALLOWLIST_TOML);
    const allowlistOccurrences = merged.match(/^\[allowlist\]/gm) ?? [];
    assert.strictEqual(allowlistOccurrences.length, 1, "must not emit two [allowlist] tables");

    const allowlist = extractAllowlist(merged);
    assert.ok(allowlist);
    assert.deepStrictEqual(allowlist!.paths, ["\\.env\\.example$"]);
    assert.deepStrictEqual(allowlist!.regexes, ["EXAMPLE_NOT_REAL"]);
    assert.deepStrictEqual(allowlist!.stopwords, ["changeme"]);
  });

  it("omits the allowlist table entirely when no source defines one", () => {
    const noAllowlistDefault = `title = "x"\n\n[[rules]]\nid = "r"\nregex = '''X'''\n`;
    const merged = mergeGitleaksConfigs(noAllowlistDefault, undefined, undefined);
    assert.strictEqual(/\[allowlist\]/.test(merged), false);
  });

  it("works with no custom rules or allowlist at all", () => {
    const merged = mergeGitleaksConfigs(DEFAULT_TOML, undefined, undefined);
    assert.ok(merged.includes('id = "rule-a"'));
    assert.strictEqual(extractRuleBlocks(merged).length, 1);
  });
});
