import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { extractTimelineRecords, findTimelineRecordById, summarizeTimelineRecords } from "../../src/core/client.js";

const fixturePath = path.join(process.cwd(), "test", "fixtures", "timeline-get.json");

test("extractTimelineRecords supports records[] and dedupes with value[]", async () => {
  const raw = await readFile(fixturePath, "utf8");
  const payload = JSON.parse(raw) as unknown;

  const records = extractTimelineRecords(payload);
  assert.equal(records.length, 3);
  assert.equal(records[0]?.id, "stage-1");
  assert.equal(records[1]?.id, "job-1");
  assert.equal(records[2]?.id, "task-1");
});

test("findTimelineRecordById is case-insensitive", async () => {
  const raw = await readFile(fixturePath, "utf8");
  const payload = JSON.parse(raw) as unknown;

  const records = extractTimelineRecords(payload);
  const match = findTimelineRecordById(records, "TASK-1");
  assert.equal(match?.id, "task-1");
  assert.equal(match?.logId, 2);
});

test("summarizeTimelineRecords counts failures and warnings", async () => {
  const raw = await readFile(fixturePath, "utf8");
  const payload = JSON.parse(raw) as unknown;

  const records = extractTimelineRecords(payload);
  const summary = summarizeTimelineRecords(records);

  assert.equal(summary.totalRecords, 3);
  assert.equal(summary.failedRecords, 3);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.problemCount, 1);
});
