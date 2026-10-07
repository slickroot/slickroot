import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Transcript } from "../src/Transcript.ts";

function configDir(): string {
  return mkdtempSync(join(tmpdir(), "config-"));
}

test("puts the run file in the repo's runs folder, named after the start time", () => {
  const dir = configDir();
  const startedAt = new Date("2026-10-07T09:05:03.042Z");

  const transcript = Transcript.forRun(dir, "project", "stories", startedAt);

  assert.equal(dirname(transcript.path), join(dir, "project", "runs"));
  assert.match(transcript.path, /\.md$/);
});

test("gives runs started at different times different files", () => {
  const dir = configDir();

  const first = Transcript.forRun(dir, "project", "stories", new Date("2026-10-07T09:05:03.042Z"));
  const second = Transcript.forRun(dir, "project", "stories", new Date("2026-10-07T09:05:03.043Z"));

  assert.notEqual(first.path, second.path);
});

test("names run files so they sort in start order", () => {
  const dir = configDir();

  const earlier = Transcript.forRun(dir, "project", "stories", new Date("2026-10-07T09:59:59.999Z"));
  const later = Transcript.forRun(dir, "project", "stories", new Date("2026-10-07T10:00:00.000Z"));

  assert.ok(earlier.path < later.path);
});

test("keeps run file names free of characters some filesystems reject", () => {
  const transcript = Transcript.forRun(configDir(), "project", "stories", new Date("2026-10-07T09:05:03.042Z"));

  assert.doesNotMatch(transcript.path.slice(transcript.path.lastIndexOf("/") + 1), /[:\\]/);
});

test("writes each message as it is appended, creating the runs folder", () => {
  const transcript = Transcript.forRun(configDir(), "project", "stories", new Date());

  transcript.append("Questioner", "What is the next step?");
  const afterFirst = readFileSync(transcript.path, "utf8");
  transcript.append("StandIn", "Export to CSV.");
  const afterSecond = readFileSync(transcript.path, "utf8");

  assert.match(afterFirst, /Questioner[\s\S]*What is the next step\?/);
  assert.ok(afterSecond.startsWith(afterFirst));
  assert.match(afterSecond.slice(afterFirst.length), /StandIn[\s\S]*Export to CSV\./);
});

test("starts every run file with the given prefix", () => {
  const startedAt = new Date("2026-10-07T09:05:03.042Z");

  const stories = Transcript.forRun(configDir(), "project", "stories", startedAt);
  const story = Transcript.forRun(configDir(), "project", "story-export-csv", startedAt);

  assert.ok(basename(stories.path).startsWith("stories-"));
  assert.ok(basename(story.path).startsWith("story-export-csv-"));
});

test("gives runs with different prefixes started at the same time different files", () => {
  const dir = configDir();
  const startedAt = new Date("2026-10-07T09:05:03.042Z");

  const first = Transcript.forRun(dir, "project", "stories", startedAt);
  const second = Transcript.forRun(dir, "project", "story-export-csv", startedAt);

  assert.notEqual(first.path, second.path);
});

test("creates the empty run file as soon as the transcript is made", () => {
  const transcript = Transcript.forRun(configDir(), "project", "stories", new Date());

  assert.ok(existsSync(transcript.path));
  assert.equal(readFileSync(transcript.path, "utf8"), "");
});
