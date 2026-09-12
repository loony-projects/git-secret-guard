/**
 * Fake-but-pattern-valid secrets used by the ruleset self-test and the
 * no-leak logger test — one per provider the bundled ruleset covers.
 *
 * Every value here is built by joining separate string literals at
 * runtime, deliberately, so that no contiguous provider-recognizable
 * secret string ever exists anywhere in this file's committed bytes. A
 * whole literal fixture — even a clearly fake one — is exactly the shape
 * GitHub's (and other hosts') push protection scans for, and would block
 * every push touching this file even though nothing here is real. Static
 * scanners (including gitleaks itself) only ever see raw file content, not
 * evaluated JavaScript, so splitting the literal defeats that scan while
 * `join(...)` still produces the exact same string our own regex tests
 * need at run time. This is the same technique gitleaks' and trufflehog's
 * own test suites use for their fixtures.
 *
 * See docs/gitleaks-compatibility.md and README.md's testing section.
 */

function join(...parts: string[]): string {
  return parts.join("");
}

export const SECRET_FIXTURES: Record<string, string> = {
  "aws.txt":
    `aws_access_key_id = ${join("AKIA", "FAKEEXAMPLE12345")}\n` +
    `aws_secret_access_key = "${join("odJFCrnl2edlBDdz1C5J", "au2RJtBRnlWmTSHf6pWk")}"\n`,

  "gcp.txt": `GOOGLE_API_KEY=${join("AIza", "LUyifDLkDmWJ6UuVTAIjvFu7WICPhDeOZIi")}\n`,

  "azure.txt":
    `DefaultEndpointsProtocol=https;AccountName=fakestorageacct;AccountKey=${join(
      "BOB/Y6sHrFH2ZUCr/lgotu2iXW7GboIRoL3u6aHwnMztVuaP+coUNEhEkk+iqq8vH2BzNZV45pFCiRcDCajhDi",
      "==",
    )};EndpointSuffix=core.windows.net\n`,

  "pem.txt":
    `${join("-----BEGIN ", "RSA PRIVATE KEY-----")}\n` +
    `${join("MIIFAKEKEYDATAFAKEKEYDATAFAKEKEYDATAFAKEKEYDATAFAKEKEYDATAFAKE", "==")}\n` +
    `${join("-----END ", "RSA PRIVATE KEY-----")}\n`,

  "github.txt":
    `GITHUB_TOKEN=${join("ghp_", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}\n` +
    `GITHUB_FINE_GRAINED_TOKEN=${join(
      "github_pat_",
      "5c3veGprQFnIiU74KKEpYEZAmggQBwBAD3UdRP_PgdzUvZ3gpmmICiBlrDp37eCZ32JgdPI1a_f7W2pk",
    )}\n`,

  "gitlab.txt": `GITLAB_TOKEN=${join("glpat-", "ABCDEFGHIJKLMNOPQRST")}\n`,

  "slack.txt":
    `SLACK_BOT_TOKEN=${join("xoxb-", "1234567890-abcdefghijklmnop")}\n` +
    `SLACK_WEBHOOK_URL=${join(
      "https://hooks.slack.com/services/",
      "T012ABCDEF/B012ABCDEF/abcdefghijklmnopqrstuvwx",
    )}\n`,

  "stripe.txt": `STRIPE_SECRET_KEY=${join("sk_live_", "AFEn3z5dkyayq7YYDsBS9UYJ")}\n`,

  "openai.txt": `OPENAI_API_KEY=${join("sk-", "QTFjmsn9dLVIdVuddLEG62HkQTFjmsn9dLVIdVuddLEG62Hk")}\n`,

  "anthropic.txt": `ANTHROPIC_API_KEY=${join("sk-ant-", "api03-hkxiiEZpFfk1OHAOEHYqM6Oj-hkxiiEZpFfk1OHAOEHYqM6Oj")}\n`,

  "npm.txt": `//registry.npmjs.org/:_authToken=${join("npm_", "aDNKgeInGqi7w4e4pxskC1ITtNZPHaQ0Jt7Q")}\n`,

  "twilio.txt":
    `TWILIO_API_KEY_SID=${join("SK", "348334896a68f812d810a485ed03241b")}\n` +
    `TWILIO_AUTH_TOKEN=${join("34833489", "6a68f812d810a485ed03241b")}\n`,

  "sendgrid.txt": `SENDGRID_API_KEY=${join("SG.", "s3qfNUfTAFnT0tEuw0dwQ0", ".", "FIunWe8Cz6SNDCdyZQJiJSZQdoHwHen3SO3oXyGf3az")}\n`,

  "jwt.txt": `Authorization: Bearer ${join(
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    ".",
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkZha2UgVXNlciJ9",
    ".",
    "xBe8Q6vNuQ2hU5tGtQAu-zSsJimAQ8yRV5lNKtzJ1",
  )}\n`,

  "db-connection-string.txt": `DATABASE_URL=${join(
    "postgres://appuser:",
    "S3cretFakeP4ssw0rd",
    "@db.example.internal:5432/appdb",
  )}\n`,

  "dotenv.txt":
    `API_KEY=${join("sk_test_", "FAKEnotrealButShapedLikeASecretValue123")}\n` +
    `CLIENT_SECRET=${join("8f3jd92kd0slfjaP0sl", "dkfjaLKDJflaksjdf9")}\n`,
};
