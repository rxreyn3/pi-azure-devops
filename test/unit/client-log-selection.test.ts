import test from "node:test";
import assert from "node:assert/strict";

import { selectLogId } from "../../src/core/client.js";
import type { LogSummary, TimelineRecord } from "../../src/core/models.js";

const task: TimelineRecord = { id: "task-1", logId: 4, issues: [] };
const job: TimelineRecord = { id: "job-1", logId: 3, issues: [] };
const logs: LogSummary[] = [{ id: 2 }, { id: 1 }];

test("selectLogId prefers task log", () => {
  const selected = selectLogId({ taskRecord: task, jobRecord: job, explicitLogId: 9, logs });
  assert.equal(selected.logId, 4);
  assert.equal(selected.source, "timelineTask");
});

test("selectLogId then prefers job log", () => {
  const selected = selectLogId({ taskRecord: undefined, jobRecord: job, explicitLogId: 9, logs });
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
