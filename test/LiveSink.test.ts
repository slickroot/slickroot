import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LiveSink } from "../src/LiveSink.ts";
import { Transcript } from "../src/Transcript.ts";
import { FakeEcho } from "./support/FakeEcho.ts";

function configDir(): string {
  return mkdtempSync(join(tmpdir(), "config-"));
}

function blockFrom(speaker: string, text: string): string {
  const transcript = Transcript.forRun(configDir(), "project", "stories", new Date(), new FakeEcho());
  transcript.append(speaker, text);
  return readFileSync(transcript.path, "utf8");
}

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

test("echoes the same blocks a Transcript echoes for the same appends", () => {
  const transcriptEcho = new FakeEcho();
  const liveEcho = new FakeEcho();
  const transcript = Transcript.forRun(configDir(), "project", "stories", new Date(), transcriptEcho);
  const sink = LiveSink.for(liveEcho, "Questioner");

  transcript.append("slickroot", "Begin here.");
  sink.append("slickroot", "Begin here.");
  transcript.append("Questioner", "What is the next step?");
  sink.append("Questioner", "What is the next step?");
  transcript.append("StandIn", "Export to CSV.");
  sink.append("StandIn", "Export to CSV.");

  assert.deepEqual(liveEcho.writes, transcriptEcho.writes);
  assert.deepEqual(liveEcho.writes, [
    blockFrom("slickroot", "Begin here."),
    transcriptEcho.dim(blockFrom("Questioner", "What is the next step?")),
    blockFrom("StandIn", "Export to CSV."),
  ]);
});

test("dims the lead's blocks and leaves every other speaker plain", () => {
  const echo = new FakeEcho();
  const sink = LiveSink.for(echo, "Lead");

  sink.append("Lead", "What is the next step?");
  sink.append("slickroot", "Begin here.");
  sink.append("StandIn system prompt", "You are the StandIn.");

  assert.deepEqual(echo.writes, [
    echo.dim(blockFrom("Lead", "What is the next step?")),
    blockFrom("slickroot", "Begin here."),
    blockFrom("StandIn system prompt", "You are the StandIn."),
  ]);
});

test("writes no run file where a Transcript writes one", () => {
  const dir = configDir();
  const startedAt = new Date("2026-10-07T09:05:03.042Z");

  const sink = LiveSink.for(new FakeEcho(), "Questioner");
  sink.append("slickroot", "Begin here.");
  sink.append("Questioner", "What is the next step?");

  assert.deepEqual(filesUnder(dir), []);

  const transcript = Transcript.forRun(dir, "project", "stories", startedAt, new FakeEcho());
  transcript.append("slickroot", "Begin here.");

  assert.deepEqual(filesUnder(dir), [transcript.path]);
});
