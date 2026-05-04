import test from "node:test";
import assert from "node:assert/strict";

import { buildBasicAuthHeader } from "../../src/core/auth.js";
import { redactSensitiveText } from "../../src/core/redact.js";

test("redactSensitiveText redacts explicit token and Basic auth", () => {
  const token = "super-secret-token";
  const authHeader = buildBasicAuthHeader(token);
  const input = `token=${token}\nAuthorization: ${authHeader}\nBearer abcdefghijklmnop`;

  const output = redactSensitiveText(input, [token, authHeader]);

  assert.equal(output.includes(token), false);
  assert.equal(output.includes(authHeader), false);
  assert.match(output, /Authorization: \[REDACTED\]/);
  assert.match(output, /Bearer \[REDACTED\]/);
});

test("redactSensitiveText redacts signed URL query values", () => {
  const input = "https://example.invalid/path?sig=abc123&token=secret";
  const output = redactSensitiveText(input);
  assert.equal(output.includes("abc123"), false);
  assert.equal(output.includes("secret"), false);
  assert.match(output, /sig=\[REDACTED\]/);
  assert.match(output, /token=\[REDACTED\]/);
});

test("redactSensitiveText preserves JSON string quotes around signed URLs", () => {
  const input = JSON.stringify({ downloadUrl: "https://example.invalid/path?sig=abc123" });
  const output = redactSensitiveText(input);
  const parsed = JSON.parse(output) as { downloadUrl: string };

  assert.equal(output.includes("abc123"), false);
  assert.equal(parsed.downloadUrl, "https://example.invalid/path?sig=[REDACTED]");
});
