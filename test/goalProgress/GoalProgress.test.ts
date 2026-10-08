import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Session } from "../../src/Session.ts";
import { GoalFile } from "../../src/GoalFile.ts";
import { GoalProgress } from "../../src/goalProgress/GoalProgress.ts";
import { FakeEcho } from "../support/FakeEcho.ts";

const repo = "project";
const startedAt = new Date("2026-02-03T04:05:06.789Z");
const timestamp = "2026-02-03T04-05-06.789Z";
const role = "You are the project's goal keeper.";
const warningPrefix = "slickroot: goal progress not recorded: ";

const goal = `# Goal

Ship the thing.

#done

- The old thing already shipped

#backlog

- Move between texts horizontally
* Move between texts vertically
Plain line with no marker
`;

const spec = `# The story

## Acceptance Criteria

- The text moves.
`;

const verdicts = JSON.stringify({
  1: { verdict: "done" },
  2: { verdict: "untouched" },
  3: { verdict: "partial", done: "a line built in part", leftover: "the rest of it" },
});

class RecordingSession implements Session {
  readonly received: string[] = [];
  readonly #reply: string | (() => Promise<string>);

  constructor(reply: string | (() => Promise<string>)) {
    this.#reply = reply;
  }

  send(message: string): Promise<string> {
    this.received.push(message);
    return typeof this.#reply === "function" ? this.#reply() : Promise.resolve(this.#reply);
  }
}

type Env = {
  configDir: string;
  specPath: string;
  goalPath: string;
  stderr: string[];
  session: RecordingSession;
};

function setup(options: { goal?: string; keeper?: boolean; reply?: string | (() => Promise<string>) } = {}): Env {
  const configDir = mkdtempSync(join(tmpdir(), "config-"));
  mkdirSync(join(configDir, repo), { recursive: true });
  mkdirSync(join(configDir, "specs"), { recursive: true });
  if (options.keeper !== false) writeFileSync(join(configDir, "goal-keeper.md"), role);

  const specPath = join(configDir, "specs", "story.md");
  writeFileSync(specPath, spec);

  const goalPath = join(configDir, repo, "goal.md");
  if (options.goal !== undefined) writeFileSync(goalPath, options.goal);

  return { configDir, specPath, goalPath, stderr: [], session: new RecordingSession(options.reply ?? "...") };
}

async function afterRun(env: Env, specPath?: string): Promise<void> {
  await GoalProgress.afterRun({
    configDir: env.configDir,
    repo,
    specPath: specPath ?? env.specPath,
    startedAt,
    echo: new FakeEcho(),
    stderr: (text) => env.stderr.push(text),
    newSession: () => env.session,
  });
}

function read(env: Env): string {
  return readFileSync(env.goalPath, "utf8");
}

function goalTranscript(env: Env): string {
  return readFileSync(join(env.configDir, repo, "runs", `goal-${timestamp}.md`), "utf8");
}

test("does nothing at all when there is no goal-keeper.md", async () => {
  const env = setup({ goal, keeper: false, reply: verdicts });

  await afterRun(env);

  assert.deepEqual(env.stderr, []);
  assert.deepEqual(env.session.received, []);
  assert.equal(read(env), goal);
  assert.equal(existsSync(join(env.configDir, repo, "runs")), false);
});

test("moves the done line to #done, splits the partial line and keeps the untouched one", async () => {
  const env = setup({ goal, reply: verdicts });

  await afterRun(env);

  assert.equal(
    read(env),
    [
      "# Goal",
      "",
      "Ship the thing.",
      "",
      "#done",
      "",
      "- The old thing already shipped",
      "",
      "- Move between texts horizontally",
      "a line built in part",
      "",
      "#backlog",
      "",
      "* Move between texts vertically",
      "the rest of it",
      "",
    ].join("\n"),
  );
  assert.deepEqual(env.stderr, []);
});

test("warns and leaves the goal file alone when there is no goal.md", async () => {
  const env = setup({ reply: verdicts });

  await afterRun(env);

  assert.equal(env.stderr.length, 1);
  assert.ok(env.stderr[0].startsWith(warningPrefix));
  assert.deepEqual(env.session.received, []);
  assert.equal(existsSync(env.goalPath), false);
});

test("warns and leaves the goal file alone when it has no #backlog section", async () => {
  const malformed = "# Goal\n\nNothing to track.\n";
  const env = setup({ goal: malformed, reply: verdicts });

  await afterRun(env);

  assert.equal(env.stderr.length, 1);
  assert.ok(env.stderr[0].startsWith(warningPrefix));
  assert.match(env.stderr[0], /backlog/);
  assert.equal(read(env), malformed);
});

test("warns and leaves the goal file alone when the spec file is missing", async () => {
  const env = setup({ goal, reply: verdicts });

  await afterRun(env, join(env.configDir, "specs", "gone.md"));

  assert.equal(env.stderr.length, 1);
  assert.ok(env.stderr[0].startsWith(warningPrefix));
  assert.equal(read(env), goal);
});

test("warns and leaves the goal file alone when the goal keeper's reply is not JSON", async () => {
  const env = setup({ goal, reply: "The spec built the first line." });

  await afterRun(env);

  assert.equal(env.stderr.length, 1);
  assert.ok(env.stderr[0].startsWith(warningPrefix));
  assert.equal(read(env), goal);
});

test("warns and leaves the goal file alone when the claude session fails", async () => {
  const env = setup({
    goal,
    reply: () => Promise.reject(new Error("claude failed: exit 1")),
  });

  await afterRun(env);

  assert.equal(env.stderr.length, 1);
  assert.ok(env.stderr[0].startsWith(warningPrefix));
  assert.match(env.stderr[0], /claude failed: exit 1/);
  assert.equal(read(env), goal);
});

test("writes a goal transcript named after the run's start time", async () => {
  const env = setup({ goal, reply: verdicts });

  await afterRun(env);

  assert.equal(
    goalTranscript(env),
    `## slickroot\n\n${env.session.received[0]}\n\n## GoalKeeper\n\n${verdicts}\n\n`,
  );
});

test("never throws", async () => {
  const env = setup({ goal, reply: () => Promise.reject(new Error("boom")) });

  await afterRun(env);

  assert.equal(env.stderr.length, 1);
  assert.equal(read(env), goal);
});

test("writes the goal file whole, replacing the old content", () => {
  const env = setup({ goal });
  const goalFile = GoalFile.for(env.configDir, repo);

  goalFile.write("brand new\n");

  assert.equal(goalFile.read(), "brand new\n");
  assert.equal(env.goalPath, join(env.configDir, repo, "goal.md"));
});

