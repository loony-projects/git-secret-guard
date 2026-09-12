import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { extractRuleBlocks, extractScalarField } from "../../scanEngine/configMerge";
import { SECRET_FIXTURES } from "./fixtures/secretFixtures";

/**
 * Compiles every rule's regex from the bundled default.toml as a real
 * RegExp and runs it against the fixture corpus — this is what actually
 * exercises the ruleset's quality (does the AWS fixture get flagged? does
 * the UUID lookalike NOT get flagged?), since the gitleaksClient unit tests
 * mock the CLI process entirely and never touch these regexes.
 *
 * The "secrets" half of the corpus comes from fixtures/secretFixtures.ts
 * (built from split string literals at runtime, not literal file content —
 * see that file for why) rather than static files on disk; the lookalikes
 * (UUID, git hash, base64 blob — none of them secret-shaped) are still
 * plain committed files under the repo's top-level fixtures/lookalikes/.
 *
 * gitleaks compiles these with Go's RE2 engine, which supports an inline
 * `(?i)` flag but — unlike PCRE/JS — applies it as a mode-setting group,
 * not something `new RegExp()` understands directly. We translate a
 * leading `(?i)` into the JS `i` flag here so the test faithfully reflects
 * what gitleaks would actually match; the rule text handed to gitleaks
 * itself is untouched.
 */

const EXTENSION_ROOT = path.join(__dirname, "..", "..", "..");
const FIXTURES_ROOT = path.join(EXTENSION_ROOT, "..", "fixtures");
const DEFAULT_TOML_PATH = path.join(EXTENSION_ROOT, "resources", "gitleaks", "default.toml");

interface CompiledRule {
  id: string;
  regex: RegExp;
}

function compileRules(): CompiledRule[] {
  const tomlText = fs.readFileSync(DEFAULT_TOML_PATH, "utf8");
  const blocks = extractRuleBlocks(tomlText);
  return blocks.map((block) => {
    const id = extractScalarField(block, "id");
    const rawRegex = extractScalarField(block, "regex");
    if (!id || !rawRegex) {
      throw new Error(`Rule block missing id/regex: ${block.slice(0, 80)}`);
    }
    let pattern = rawRegex;
    let flags = "";
    if (pattern.startsWith("(?i)")) {
      pattern = pattern.slice(4);
      flags = "i";
    }
    return { id, regex: new RegExp(pattern, flags) };
  });
}

const SECRET_FIXTURE_EXPECTATIONS: Record<string, string[]> = {
  "aws.txt": ["aws-access-key-id", "aws-secret-access-key"],
  "gcp.txt": ["gcp-api-key"],
  "azure.txt": ["azure-storage-account-key"],
  "pem.txt": ["pem-private-key"],
  "github.txt": ["github-token-classic", "github-token-fine-grained"],
  "gitlab.txt": ["gitlab-pat"],
  "slack.txt": ["slack-token", "slack-webhook-url"],
  "stripe.txt": ["stripe-live-key"],
  "openai.txt": ["openai-api-key"],
  "anthropic.txt": ["anthropic-api-key"],
  "npm.txt": ["npm-token"],
  "twilio.txt": ["twilio-api-key-sid", "twilio-auth-token"],
  "sendgrid.txt": ["sendgrid-api-key"],
  "jwt.txt": ["jwt"],
  "db-connection-string.txt": ["connection-string-with-password"],
  "dotenv.txt": ["dotenv-style-secret-assignment"],
};

describe("bundled default.toml ruleset", () => {
  const rules = compileRules();

  it("compiles every rule's regex without error", () => {
    assert.ok(rules.length >= 15, `expected at least 15 rules, found ${rules.length}`);
  });

  it("has exactly one expectation per registered secret fixture", () => {
    assert.deepStrictEqual(Object.keys(SECRET_FIXTURES).sort(), Object.keys(SECRET_FIXTURE_EXPECTATIONS).sort());
  });

  for (const [fixtureName, expectedRuleIds] of Object.entries(SECRET_FIXTURE_EXPECTATIONS)) {
    it(`flags the ${fixtureName} fixture with ${expectedRuleIds.join(", ")}`, () => {
      const content = SECRET_FIXTURES[fixtureName];
      assert.ok(content, `no fixture registered for "${fixtureName}"`);
      for (const ruleId of expectedRuleIds) {
        const rule = rules.find((r) => r.id === ruleId);
        assert.ok(rule, `rule "${ruleId}" not found in default.toml`);
        assert.ok(rule!.regex.test(content), `expected rule "${ruleId}" to match the ${fixtureName} fixture`);
      }
    });
  }

  const lookalikeFiles = fs.readdirSync(path.join(FIXTURES_ROOT, "lookalikes"));
  for (const fixtureFile of lookalikeFiles) {
    it(`does NOT flag fixtures/lookalikes/${fixtureFile} with any rule`, () => {
      const content = fs.readFileSync(path.join(FIXTURES_ROOT, "lookalikes", fixtureFile), "utf8");
      const matched = rules.filter((r) => r.regex.test(content)).map((r) => r.id);
      assert.deepStrictEqual(matched, [], `expected no rules to match fixtures/lookalikes/${fixtureFile}, but got: ${matched.join(", ")}`);
    });
  }
});
