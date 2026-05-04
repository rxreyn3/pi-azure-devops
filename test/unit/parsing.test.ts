import test from "node:test";
import assert from "node:assert/strict";

import { parsePositiveIntegerStrict } from "../../src/core/parsing.js";

test("parsePositiveIntegerStrict parses positive integers", () => {
  assert.equal(parsePositiveIntegerStrict("42", "--id"), 42);
});

test("parsePositiveIntegerStrict rejects mixed alphanumeric", () => {
  assert.throws(() => parsePositiveIntegerStrict("123abc", "--id"), /--id must be a positive integer/);
});

test("parsePositiveIntegerStrict rejects zero", () => {
  assert.throws(() => parsePositiveIntegerStrict("0", "--id"), /--id must be a positive integer/);
});
