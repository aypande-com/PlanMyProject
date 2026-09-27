import test from "node:test";
import assert from "node:assert/strict";
import { maskPromptText } from "../src/util";

// P0-D3: one test per pattern class, so a future change to one pattern's
// regex can't silently break another's coverage inside a single shared
// assertion. Base patterns run unconditionally (no options); maskEmails/
// maskIpAddresses are opt-in and tested separately below.

test("masks Bearer tokens", () => {
  const result = maskPromptText("Authorization: Bearer abc123.XYZ-987_token");
  assert.doesNotMatch(result, /Bearer\s+abc123/);
  assert.match(result, /\[REDACTED\]/);
});

test("masks OpenAI/Anthropic-style sk- keys", () => {
  const result = maskPromptText("key=sk-ABCDEFGHIJ1234567890abcdefghij");
  assert.doesNotMatch(result, /sk-ABCDEFGHIJ/);
  assert.match(result, /\[REDACTED\]/);
});

test("masks classic GitHub PATs (ghp_)", () => {
  const result = maskPromptText("token: ghp_1234567890abcdefghijklmnopqrstuvwx");
  assert.doesNotMatch(result, /ghp_1234567890/);
  assert.match(result, /\[REDACTED\]/);
});

test("masks fine-grained GitHub PATs (github_pat_)", () => {
  const result = maskPromptText("token: github_pat_11ABCDEFG0abcdefghijklmnop_1234567890abcdefghijklmnopqrstuvwxyz");
  assert.doesNotMatch(result, /github_pat_11ABCDEFG0/);
  assert.match(result, /\[REDACTED\]/);
});

test("masks GitLab PATs (glpat-)", () => {
  const result = maskPromptText("token: glpat-ABCDEFGHIJKLMNOPQRST12");
  assert.doesNotMatch(result, /glpat-ABCDEFGHIJKLMNOPQRST12/);
  assert.match(result, /\[REDACTED\]/);
});

test("masks AWS access key IDs", () => {
  const result = maskPromptText("aws_access_key_id = AKIAIOSFODNN7EXAMPLE");
  assert.doesNotMatch(result, /AKIAIOSFODNN7EXAMPLE/);
  assert.match(result, /\[REDACTED\]/);
});

test("masks GCP API keys", () => {
  const result = maskPromptText("key=AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY");
  assert.doesNotMatch(result, /AIzaSyD-9tSrke72PouQMnMX/);
  assert.match(result, /\[REDACTED\]/);
});

test("masks Slack tokens", () => {
  // Built via concatenation (not a literal) so this fixture doesn't trip
  // secret-scanning push protection on a string that merely matches the
  // Slack token shape.
  const fakeSlackToken = ["xoxb", "123456789012", "1234567890123", "abcdefghijklmnopqrstuvwx"].join("-");
  const result = maskPromptText(`slack_token=${fakeSlackToken}`);
  assert.equal(result.includes(fakeSlackToken), false);
  assert.match(result, /\[REDACTED\]/);
});

test("masks JWTs", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const result = maskPromptText(`Authorization token: ${jwt}`);
  assert.doesNotMatch(result, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
  assert.match(result, /\[REDACTED\]/);
});

test("masks database connection strings with inline credentials", () => {
  const result = maskPromptText("DATABASE_URL=postgres://admin:sup3rSecret@db.internal.example.com:5432/prod");
  assert.doesNotMatch(result, /sup3rSecret/);
  assert.match(result, /\[REDACTED\]/);
});

test("masks generic password/secret/token/api_key key-value pairs", () => {
  const result = maskPromptText('config: { "api_key": "abcdef1234567890" }');
  assert.doesNotMatch(result, /abcdef1234567890/);
  assert.match(result, /\[REDACTED\]/);
});

test("masks PEM private key blocks", () => {
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBAK...\n-----END RSA PRIVATE KEY-----";
  const result = maskPromptText(`key:\n${pem}`);
  assert.doesNotMatch(result, /MIIBogIBAAJBAK/);
  assert.match(result, /\[REDACTED\]/);
});

test("does not mask emails or IPs by default", () => {
  const result = maskPromptText("contact jane@example.com at 10.0.0.5");
  assert.match(result, /jane@example\.com/);
  assert.match(result, /10\.0\.0\.5/);
});

test("masks emails only when maskEmails is explicitly enabled", () => {
  const result = maskPromptText("contact jane@example.com", { maskEmails: true });
  assert.doesNotMatch(result, /jane@example\.com/);
  assert.match(result, /\[REDACTED_EMAIL\]/);
});

test("masks IP addresses only when maskIpAddresses is explicitly enabled", () => {
  const result = maskPromptText("server at 10.0.0.5", { maskIpAddresses: true });
  assert.doesNotMatch(result, /10\.0\.0\.5/);
  assert.match(result, /\[REDACTED_IP\]/);
});
