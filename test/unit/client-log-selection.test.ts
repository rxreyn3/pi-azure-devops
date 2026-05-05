import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildSelectedLogInfo,
  extractTimelineRecords,
  resolveTimelineRecordLookups,
  selectLogId,
} from "../../src/core/client.js";
import type { LogSummary, TimelineRecord } from "../../src/core/models.js";

const localTask: TimelineRecord = { id: "task-1", logId: 4, issues: [] };
const localJob: TimelineRecord = { id: "job-1", logId: 3, issues: [] };
const logs: LogSummary[] = [{ id: 2 }, { id: 1 }];

const selectorFixturePath = path.join(process.cwd(), "test", "fixtures", "timeline-name-selectors.json");

async function loadSelectorRecords(): Promise<TimelineRecord[]> {
  const raw = await readFile(selectorFixturePath, "utf8");
  return extractTimelineRecords(JSON.parse(raw));
}

test("selectLogId prefers task log", () => {
  const selected = selectLogId({ taskRecord: localTask, jobRecord: localJob, explicitLogId: 9, logs });
  assert.equal(selected.logId, 4);
  assert.equal(selected.source, "timelineTask");
});

test("selectLogId then prefers job log", () => {
  const selected = selectLogId({ taskRecord: undefined, jobRecord: localJob, explicitLogId: 9, logs });
  assert.equal(selected.logId, 3);
  assert.equal(selected.source, "timelineJob");
});

test("selectLogId then explicit log", () => {
  const selected = selectLogId({ taskRecord: undefined, jobRecord: undefined, explicitLogId: 9, logs });
  assert.equal(selected.logId, 9);
  assert.equal(selected.source, "explicit");
});

test("selectLogId falls back to first listed log", () => {
  const selected = selectLogId({ taskRecord: undefined, jobRecord: undefined, explicitLogId: undefined, logs });
  assert.equal(selected.logId, 2);
  assert.equal(selected.source, "logsListFirst");
});

test("selectLogId omits first-log fallback when caller suppresses logs list", () => {
  const selected = selectLogId({ taskRecord: undefined, jobRecord: undefined, explicitLogId: undefined, logs: undefined });
  assert.equal(selected.logId, undefined);
  assert.equal(selected.source, undefined);
});

test("name-resolved task selector picks task log over explicit override", async () => {
  const records = await loadSelectorRecords();
  const lookups = resolveTimelineRecordLookups(records, { taskName: "Run Linter" });
  const selected = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: 99,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });
  const info = buildSelectedLogInfo(lookups, selected);

  assert.equal(info.resolvedLogId, 3);
  assert.equal(info.resolvedLogSource, "timelineTask");
  assert.equal(info.matchedTaskRecordId, "task-run-linter");
  assert.equal(info.taskLookup?.status, "matched");
});

test("name-resolved job selector picks job log over explicit override", async () => {
  const records = await loadSelectorRecords();
  const lookups = resolveTimelineRecordLookups(records, { jobName: "Test Suite" });
  const selected = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: 99,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });
  const info = buildSelectedLogInfo(lookups, selected);

  assert.equal(info.resolvedLogId, 4);
  assert.equal(info.resolvedLogSource, "timelineJob");
  assert.equal(info.matchedJobRecordId, "job-test-suite");
});

test("explicit log is honored when no record-derived log is available", async () => {
  const records = await loadSelectorRecords();
  // Selector matches a record without logId would still allow explicit; here use a stage selector (no log id used) plus explicit.
  const lookups = resolveTimelineRecordLookups(records, { stageName: "Build" });
  const selected = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: 99,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });
  const info = buildSelectedLogInfo(lookups, selected);

  assert.equal(info.resolvedLogId, 99);
  assert.equal(info.resolvedLogSource, "explicit");
  assert.equal(info.matchedStageRecordId, "stage-build");
  assert.equal(info.matchedJobRecordId, undefined);
  assert.equal(info.matchedTaskRecordId, undefined);
});

test("first-log fallback occurs only when no selector was supplied", async () => {
  const records = await loadSelectorRecords();
  const lookups = resolveTimelineRecordLookups(records, {});
  const selected = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: undefined,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });

  assert.equal(selected.logId, 2);
  assert.equal(selected.source, "logsListFirst");
});

test("ambiguous selector does not fall back to first log", async () => {
  const records = await loadSelectorRecords();
  const lookups = resolveTimelineRecordLookups(records, { taskName: "Run Tests" });
  const selected = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: undefined,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });
  const info = buildSelectedLogInfo(lookups, selected);

  assert.equal(info.resolvedLogId, undefined);
  assert.equal(info.resolvedLogSource, undefined);
  assert.equal(info.taskLookup?.status, "ambiguous");
  if (info.taskLookup?.status === "ambiguous") {
    assert.equal(info.taskLookup.candidates.length, 2);
  }
});

test("no-match selector does not fall back to first log", async () => {
  const records = await loadSelectorRecords();
  const lookups = resolveTimelineRecordLookups(records, { taskName: "Nope" });
  const selected = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: undefined,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });
  const info = buildSelectedLogInfo(lookups, selected);

  assert.equal(info.resolvedLogId, undefined);
  assert.equal(info.resolvedLogSource, undefined);
  assert.equal(info.taskLookup?.status, "noMatch");
});

test("stage selector alone does not infer a task/job log", async () => {
  const records = await loadSelectorRecords();
  const lookups = resolveTimelineRecordLookups(records, { stageName: "Test" });
  const selected = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: undefined,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });
  const info = buildSelectedLogInfo(lookups, selected);

  assert.equal(info.matchedStageRecordId, "stage-test");
  assert.equal(info.matchedJobRecordId, undefined);
  assert.equal(info.matchedTaskRecordId, undefined);
  assert.equal(info.resolvedLogId, undefined);
  assert.equal(info.resolvedLogSource, undefined);
});
