import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Transcript } from "../src/Transcript.ts";

function configDir(): string {
  return mkdtempSync(join(tmpdir(), "config-"));
}

test("puts the run file in the repo's runs folder, named after the start time", () => {
  const dir = configDir();
  const startedAt = new Date("2026-10-07T09:05:03.042Z");

  const transcript = Transcript.forRun(dir, "project", startedAt);

  assert.equal(dirname(transcript.path), join(dir, "project", "runs"));
  assert.match(transcript.path, /\.md$/);
});

test("gives runs started at different times different files", () => {
  const dir = configDir();

  const first = Transcript.forRun(dir, "project", new Date("2026-10-07T09:05:03.042Z"));
  const second = Transcript.forRun(dir, "project", new Date("2026-10-07T09:05:03.043Z"));

  assert.notEqual(first.path, second.path);
});

test("names run files so they sort in start order", () => {
  const dir = configDir();

  const earlier = Transcript.forRun(dir, "project", new Date("2026-10-07T09:59:59.999Z"));
  const later = Transcript.forRun(dir, "project", new Date("2026-10-07T10:00:00.000Z"));

  assert.ok(earlier.path < later.path);
});

test("keeps run file names free of characters some filesystems reject", () => {
  const transcript = Transcript.forRun(configDir(), "project", new Date("2026-10-07T09:05:03.042Z"));

  assert.doesNotMatch(transcript.path.slice(transcript.path.lastIndexOf("/") + 1), /[:\\]/);
});

test("writes each message as it is appended, creating the runs folder", () => {
  const transcript = Transcript.forRun(configDir(), "project", new Date());

  transcript.append("Questioner", "What is the next step?");
  const afterFirst = readFileSync(transcript.path, "utf8");
  transcript.append("StandIn", "Export to CSV.");
  const afterSecond = readFileSync(transcript.path, "utf8");

  assert.match(afterFirst, /Questioner[\s\S]*What is the next step\?/);
  assert.ok(afterSecond.startsWith(afterFirst));
  assert.match(afterSecond.slice(afterFirst.length), /StandIn[\s\S]*Export to CSV\./);
});
