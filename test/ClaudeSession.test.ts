import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { ClaudeSession, ClaudeSessionError, designStandInArgs, designStandInPrompt, designerArgs, leadArgs, ownerArgs, questionerArgs, readOnlyTools, standInArgs, standInModel, standInSystemPrompt } from "../src/ClaudeSession.ts";

type Reply = { exitCode?: number; stdout: string };

function stubClaude(replies: Reply[]): { argvs: () => string[][] } {
  const dir = mkdtempSync(join(tmpdir(), "stub-claude-"));
  const log = join(dir, "argv.jsonl");
  const counter = join(dir, "count");
  writeFileSync(log, "");
  writeFileSync(counter, "0");
  writeFileSync(join(dir, "replies.json"), JSON.stringify(replies));
  const script = join(dir, "claude");
  writeFileSync(
    script,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dir = ${JSON.stringify(dir)};
fs.appendFileSync(path.join(dir, "argv.jsonl"), JSON.stringify(process.argv.slice(2)) + "\\n");
const n = Number(fs.readFileSync(path.join(dir, "count"), "utf8"));
fs.writeFileSync(path.join(dir, "count"), String(n + 1));
const reply = JSON.parse(fs.readFileSync(path.join(dir, "replies.json"), "utf8"))[n];
process.stdout.write(reply.stdout);
process.exit(reply.exitCode ?? 0);
`,
  );
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "commonjs" }));
  chmodSync(script, 0o755);
  process.env.PATH = `${dir}${delimiter}${process.env.PATH}`;
  return {
    argvs: () =>
      readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
  };
}

function ok(sessionId: string, result: string): Reply {
  return { stdout: JSON.stringify({ type: "result", is_error: false, session_id: sessionId, result }) };
}

const fixedArgs = ["--allowedTools", "Read"];

test("first call sends the message with json output and the fixed args, returning the result", async () => {
  const stub = stubClaude([ok("abc-123", "What is the goal?")]);
  const session = ClaudeSession.withArgs(fixedArgs);

  const reply = await session.send("/xp-stories");

  assert.equal(reply, "What is the goal?");
  assert.deepEqual(stub.argvs(), [["-p", "/xp-stories", "--output-format", "json", ...fixedArgs]]);
});

test("later calls resume the session id from the previous reply", async () => {
  const sessionId = "session-42";
  const stub = stubClaude([ok(sessionId, "first"), ok(sessionId, "second")]);
  const session = ClaudeSession.withArgs(fixedArgs);

  await session.send("one");
  const reply = await session.send("two");

  assert.equal(reply, "second");
  assert.deepEqual(stub.argvs()[1], ["-p", "two", "--output-format", "json", ...fixedArgs, "--resume", sessionId]);
});

test("throws when claude exits non-zero", async () => {
  stubClaude([{ exitCode: 2, stdout: "" }]);
  const session = ClaudeSession.withArgs(fixedArgs);

  await assert.rejects(session.send("hello"), ClaudeSessionError);
});

test("throws when the reply is an error", async () => {
  stubClaude([{ stdout: JSON.stringify({ is_error: true, session_id: "s", result: "boom" }) }]);
  const session = ClaudeSession.withArgs(fixedArgs);

  await assert.rejects(session.send("hello"), (error: Error) => {
    assert.ok(error instanceof ClaudeSessionError);
    assert.match(error.message, /boom/);
    return true;
  });
});

test("questioner args allow read-only tools plus the new-spec script under the given home", () => {
  const home = "/home/maya";

  assert.deepEqual(questionerArgs(home), [
    "--allowedTools",
    `Read Grep Glob Bash(${join(home, ".claude", "skills", "xp-stories", "scripts", "new-spec")}:*) Bash(scripts/new-spec:*)`,
  ]);
});

test("stand-in system prompt is the role prompt followed by the goal", () => {
  assert.equal(standInSystemPrompt("You answer in Maya's place.", "Ship the thing."), "You answer in Maya's place.\n\n## Goal\n\nShip the thing.");
});

test("stand-in args run on Sonnet, allow read-only tools and append the role prompt followed by the goal", () => {
  const prompt = "You answer in Maya's place.";
  const goal = "Ship the thing.";

  assert.deepEqual(standInArgs(prompt, goal), [
    "--model",
    "claude-sonnet-5-5",
    "--allowedTools",
    "Read Grep Glob",
    "--append-system-prompt",
    standInSystemPrompt(prompt, goal),
  ]);
});

test("designer args allow read-only tools plus editing only the given spec file", () => {
  const spec = "docs/specs/002-story-with-technical-design.md";

  assert.deepEqual(designerArgs(spec), ["--allowedTools", `Read Grep Glob Edit(${spec})`]);
});

test("designer args allow neither Write nor Bash", () => {
  const allowed = designerArgs("docs/specs/002-x.md")[1] ?? "";

  assert.doesNotMatch(allowed, /\bWrite\b/);
  assert.doesNotMatch(allowed, /\bBash\b/);
});

test("lead args allow read, grep, glob, edit and bash and pin no model", () => {
  const args = leadArgs();

  assert.deepEqual(args, ["--allowedTools", `${readOnlyTools} Edit Bash`]);
  assert.equal(args.includes("--model"), false);
});

test("owner args allow read-only tools and pin the stand-in model", () => {
  assert.deepEqual(ownerArgs(), ["--model", standInModel, "--allowedTools", readOnlyTools]);
});

test("design stand-in args run on the stand-in model with read-only tools and the design stand-in prompt", () => {
  assert.deepEqual(designStandInArgs(), [
    "--model",
    standInModel,
    "--allowedTools",
    "Read Grep Glob",
    "--append-system-prompt",
    designStandInPrompt,
  ]);
});
