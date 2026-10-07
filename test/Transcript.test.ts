import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Transcript } from "../src/Transcript.ts";
import { FakeEcho } from "./support/FakeEcho.ts";

function configDir(): string {
  return mkdtempSync(join(tmpdir(), "config-"));
}

function block(speaker: string, text: string): string {
  return `## ${speaker}\n\n${text}\n\n`;
}

test("puts the run file in the repo's runs folder, named after the start time", () => {
  const dir = configDir();
  const startedAt = new Date("2026-10-07T09:05:03.042Z");

  const transcript = Transcript.forRun(dir, "project", "stories", startedAt, new FakeEcho());

  assert.equal(dirname(transcript.path), join(dir, "project", "runs"));
  assert.match(transcript.path, /\.md$/);
});

test("gives runs started at different times different files", () => {
  const dir = configDir();

  const first = Transcript.forRun(dir, "project", "stories", new Date("2026-10-07T09:05:03.042Z"), new FakeEcho());
  const second = Transcript.forRun(dir, "project", "stories", new Date("2026-10-07T09:05:03.043Z"), new FakeEcho());

  assert.notEqual(first.path, second.path);
});

test("names run files so they sort in start order", () => {
  const dir = configDir();

  const earlier = Transcript.forRun(dir, "project", "stories", new Date("2026-10-07T09:59:59.999Z"), new FakeEcho());
  const later = Transcript.forRun(dir, "project", "stories", new Date("2026-10-07T10:00:00.000Z"), new FakeEcho());

  assert.ok(earlier.path < later.path);
});

test("keeps run file names free of characters some filesystems reject", () => {
  const transcript = Transcript.forRun(
    configDir(),
    "project",
    "stories",
    new Date("2026-10-07T09:05:03.042Z"),
    new FakeEcho(),
  );

  assert.doesNotMatch(transcript.path.slice(transcript.path.lastIndexOf("/") + 1), /[:\\]/);
});

test("writes each message as it is appended, creating the runs folder", () => {
  const transcript = Transcript.forRun(configDir(), "project", "stories", new Date(), new FakeEcho());

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

  const stories = Transcript.forRun(configDir(), "project", "stories", startedAt, new FakeEcho());
  const story = Transcript.forRun(configDir(), "project", "story-export-csv", startedAt, new FakeEcho());

  assert.ok(basename(stories.path).startsWith("stories-"));
  assert.ok(basename(story.path).startsWith("story-export-csv-"));
});

test("gives runs with different prefixes started at the same time different files", () => {
  const dir = configDir();
  const startedAt = new Date("2026-10-07T09:05:03.042Z");

  const first = Transcript.forRun(dir, "project", "stories", startedAt, new FakeEcho());
  const second = Transcript.forRun(dir, "project", "story-export-csv", startedAt, new FakeEcho());

  assert.notEqual(first.path, second.path);
});

test("creates the empty run file as soon as the transcript is made", () => {
  const transcript = Transcript.forRun(configDir(), "project", "stories", new Date(), new FakeEcho());

  assert.ok(existsSync(transcript.path));
  assert.equal(readFileSync(transcript.path, "utf8"), "");
});

test("echoes each block exactly as it goes into the file", () => {
  const echo = new FakeEcho();
  const transcript = Transcript.forRun(configDir(), "project", "stories", new Date(), echo);

  transcript.append("StandIn system prompt", "You are the StandIn.");
  const afterFirst = readFileSync(transcript.path, "utf8");
  transcript.append("StandIn", "Export to CSV.");

  assert.deepEqual(echo.writes, [afterFirst, readFileSync(transcript.path, "utf8").slice(afterFirst.length)]);
});

test("dims the Questioner's blocks and leaves every other speaker plain", () => {
  const echo = new FakeEcho();
  const transcript = Transcript.forRun(configDir(), "project", "stories", new Date(), echo);

  transcript.append("Questioner", "What is the next step?");
  transcript.append("slickroot", "Export to CSV.");
  transcript.append("StandIn system prompt", "You are the StandIn.");

  assert.deepEqual(echo.writes, [
    echo.dim(block("Questioner", "What is the next step?")),
    block("slickroot", "Export to CSV."),
    block("StandIn system prompt", "You are the StandIn."),
  ]);
});

test("keeps dim markers out of the run file", () => {
  const transcript = Transcript.forRun(configDir(), "project", "stories", new Date(), new FakeEcho());

  transcript.append("Questioner", "What is the next step?");

  assert.doesNotMatch(readFileSync(transcript.path, "utf8"), /<\/?dim>/);
});