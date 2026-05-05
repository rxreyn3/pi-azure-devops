import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  extractTimelineRecords,
  findTimelineRecordById,
  lookupTimelineRecord,
  resolveTimelineRecordLookups,
  summarizeTimelineRecords,
} from "../../src/core/client.js";
import type { TimelineRecord } from "../../src/core/models.js";

const fixturePath = path.join(process.cwd(), "test", "fixtures", "timeline-get.json");
const selectorFixturePath = path.join(process.cwd(), "test", "fixtures", "timeline-name-selectors.json");

async function loadRecords(filePath: string): Promise<TimelineRecord[]> {
  const raw = await readFile(filePath, "utf8");
  return extractTimelineRecords(JSON.parse(raw));
}

test("extractTimelineRecords supports records[] and dedupes with value[]", async () => {
  const records = await loadRecords(fixturePath);
  assert.equal(records.length, 3);
  assert.equal(records[0]?.id, "stage-1");
  assert.equal(records[1]?.id, "job-1");
  assert.equal(records[2]?.id, "task-1");
});

test("findTimelineRecordById is case-insensitive", async () => {
  const records = await loadRecords(fixturePath);
  const match = findTimelineRecordById(records, "TASK-1");
  assert.equal(match?.id, "task-1");
  assert.equal(match?.logId, 2);
});

test("summarizeTimelineRecords counts failures and warnings", async () => {
  const records = await loadRecords(fixturePath);
  const summary = summarizeTimelineRecords(records);

  assert.equal(summary.totalRecords, 3);
  assert.equal(summary.failedRecords, 3);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.problemCount, 1);
});

test("lookupTimelineRecord matches by ID across roles", async () => {
  const records = await loadRecords(fixturePath);

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "id", value: "task-1" });
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.record.id, "task-1");
    assert.equal(result.matchMode, undefined);
  }
});

test("lookupTimelineRecord returns noMatch for unknown ID", async () => {
  const records = await loadRecords(fixturePath);

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "id", value: "does-not-exist" });
  assert.equal(result.status, "noMatch");
});

test("lookupTimelineRecord exact name match for task", async () => {
  const records = await loadRecords(selectorFixturePath);

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "name", value: "Run Linter" });
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.record.id, "task-run-linter");
    assert.equal(result.matchMode, "exact");
  }
});

test("lookupTimelineRecord case-insensitive exact name match", async () => {
  const records = await loadRecords(selectorFixturePath);

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "name", value: "publish results" });
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.record.id, "task-publish-results");
    assert.equal(result.matchMode, "caseInsensitiveExact");
  }
});

test("lookupTimelineRecord substring name match", async () => {
  const records = await loadRecords(selectorFixturePath);

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "name", value: "linter" });
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.record.id, "task-run-linter");
    assert.equal(result.matchMode, "substring");
  }
});

test("lookupTimelineRecord returns ambiguous on duplicate exact names", async () => {
  const records = await loadRecords(selectorFixturePath);

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "name", value: "Run Tests" });
  assert.equal(result.status, "ambiguous");
  if (result.status === "ambiguous") {
    assert.equal(result.matchMode, "exact");
    assert.equal(result.candidates.length, 2);
    const ids = new Set(result.candidates.map((candidate) => candidate.id));
    assert.equal(ids.has("task-run-tests-a"), true);
    assert.equal(ids.has("task-run-tests-b"), true);
  }
});

test("lookupTimelineRecord returns ambiguous on substring tier without falling through", async () => {
  const records = await loadRecords(selectorFixturePath);

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "name", value: "Run" });
  assert.equal(result.status, "ambiguous");
  if (result.status === "ambiguous") {
    assert.equal(result.matchMode, "substring");
    const ids = result.candidates.map((candidate) => candidate.id);
    assert.deepEqual(ids.sort(), ["task-run-linter", "task-run-tests-a", "task-run-tests-b"].sort());
  }
});

test("lookupTimelineRecord filters name selectors by role type", async () => {
  const records = await loadRecords(selectorFixturePath);

  const stageMatch = lookupTimelineRecord(records, { role: "stage", selectorKind: "name", value: "Test" });
  assert.equal(stageMatch.status, "matched");
  if (stageMatch.status === "matched") {
    assert.equal(stageMatch.record.id, "stage-test");
    assert.equal(stageMatch.record.type, "Stage");
  }
});

test("lookupTimelineRecord noMatch for non-matching name", async () => {
  const records = await loadRecords(selectorFixturePath);

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "name", value: "Nope" });
  assert.equal(result.status, "noMatch");
});

test("lookupTimelineRecord treats whitespace-only value as noMatch", async () => {
  const records = await loadRecords(selectorFixturePath);

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "name", value: "   " });
  assert.equal(result.status, "noMatch");
});

test("resolveTimelineRecordLookups composes stage/job/task lookups and tracks anySelectorRequested", async () => {
  const records = await loadRecords(selectorFixturePath);

  const lookups = resolveTimelineRecordLookups(records, {
    stageName: "Test",
    jobName: "Test Suite",
    taskName: "Run Linter",
  });

  assert.equal(lookups.anySelectorRequested, true);
  assert.equal(lookups.matchedStageRecord?.id, "stage-test");
  assert.equal(lookups.matchedJobRecord?.id, "job-test-suite");
  assert.equal(lookups.matchedTaskRecord?.id, "task-run-linter");
  assert.equal(lookups.stageLookup.status, "matched");
  assert.equal(lookups.jobLookup.status, "matched");
  assert.equal(lookups.taskLookup.status, "matched");
});

test("resolveTimelineRecordLookups marks unrequested roles as notRequested and reports anySelectorRequested=false when nothing supplied", async () => {
  const records = await loadRecords(selectorFixturePath);

  const lookups = resolveTimelineRecordLookups(records, {});

  assert.equal(lookups.anySelectorRequested, false);
  assert.equal(lookups.stageLookup.status, "notRequested");
  assert.equal(lookups.jobLookup.status, "notRequested");
  assert.equal(lookups.taskLookup.status, "notRequested");
  assert.equal(lookups.matchedStageRecord, undefined);
  assert.equal(lookups.matchedJobRecord, undefined);
  assert.equal(lookups.matchedTaskRecord, undefined);
});

test("resolveTimelineRecordLookups prefers ID over name when both supplied for a role", async () => {
  const records = await loadRecords(selectorFixturePath);

  const lookups = resolveTimelineRecordLookups(records, {
    taskId: "task-run-linter",
    taskName: "Run Tests",
  });

  assert.equal(lookups.matchedTaskRecord?.id, "task-run-linter");
  assert.equal(lookups.taskLookup.status, "matched");
  if (lookups.taskLookup.status === "matched") {
    assert.equal(lookups.taskLookup.selector.selectorKind, "id");
  }
});

test("lookupTimelineRecord returns noMatch on empty timeline", () => {
  const result = lookupTimelineRecord([], { role: "task", selectorKind: "name", value: "Anything" });
  assert.equal(result.status, "noMatch");
});

test("lookupTimelineRecord skips records missing a type when matching by name", () => {
  const records: TimelineRecord[] = [
    { id: "rec-no-type", name: "Compile Sources", issues: [] },
    { id: "rec-task", type: "Task", name: "Compile Sources", logId: 7, issues: [] },
  ];

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "name", value: "Compile Sources" });
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.record.id, "rec-task");
  }
});

test("lookupTimelineRecord skips records missing a name when matching by name", () => {
  const records: TimelineRecord[] = [
    { id: "task-no-name", type: "Task", logId: 9, issues: [] },
  ];

  const result = lookupTimelineRecord(records, { role: "task", selectorKind: "name", value: "Anything" });
  assert.equal(result.status, "noMatch");
});

test("resolveTimelineRecordLookups: matched stage with ambiguous job lookup keeps stage context and surfaces ambiguity", () => {
  const records: TimelineRecord[] = [
    { id: "stage-1", type: "Stage", name: "Test", issues: [] },
    { id: "job-a", parentId: "stage-1", type: "Job", name: "Run", logId: 11, issues: [] },
    { id: "job-b", parentId: "stage-1", type: "Job", name: "Run", logId: 12, issues: [] },
  ];

  const lookups = resolveTimelineRecordLookups(records, { stageName: "Test", jobName: "Run" });

  assert.equal(lookups.matchedStageRecord?.id, "stage-1");
  assert.equal(lookups.matchedJobRecord, undefined);
  assert.equal(lookups.stageLookup.status, "matched");
  assert.equal(lookups.jobLookup.status, "ambiguous");
  if (lookups.jobLookup.status === "ambiguous") {
    assert.equal(lookups.jobLookup.matchMode, "exact");
    assert.equal(lookups.jobLookup.candidates.length, 2);
  }
  assert.equal(lookups.anySelectorRequested, true);
});

test("lookupTimelineRecord ID selector is role-agnostic by design (cross-role match documented)", () => {
  const records: TimelineRecord[] = [
    { id: "actually-a-task", type: "Task", name: "Run Tests", logId: 21, issues: [] },
  ];

  // Caller passes the Task GUID via a `job` selector; the ID branch matches without
  // role filtering. This locks in the documented behavior: name selectors are
  // role-scoped, ID selectors are not.
  const result = lookupTimelineRecord(records, {
    role: "job",
    selectorKind: "id",
    value: "actually-a-task",
  });
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.record.id, "actually-a-task");
    assert.equal(result.record.type, "Task");
  }
});
