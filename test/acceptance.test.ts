import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { questionerArgs, standInArgs, standInSystemPrompt } from "../src/ClaudeSession.ts";
import { opener } from "../src/Conversation.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin", "slickroot.ts");
const newSpecFixture = join(root, "test", "fixtures", "new-spec");

const standInPrompt = "You answer in Maya's place. Read docs/specs/ and the code.\n";
const goal = "A todo app that syncs across devices.\n";
const topic = "Adding a todo from the terminal.";
const question = "Who is the user and what do they want first?";
const answer = "Maya wants to add a todo from the terminal.";
const slug = "add-a-todo";
const storyText = "Maya types one command and a todo is saved.";
const specBody = `# Add a todo

${storyText}

## Acceptance Criteria

- A todo is saved when Maya runs the command.
- The saved todo is listed afterwards.

## Technical Design
`;

function tempDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

function gitRepo(): string {
  const repo = tempDir("repo-");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  mkdirSync(join(repo, "docs", "specs"), { recursive: true });
  writeFileSync(join(repo, "docs", "specs", "001-existing.md"), "# Existing\n");
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=Maya", "-c", "user.email=maya@example.com", "commit", "-q", "-m", "Initial"], { cwd: repo });
  return repo;
}

function configHome(repo: string, withGoal: boolean): string {
  const xdg = tempDir("xdg-");
  const config = join(xdg, "slickroot");
  mkdirSync(join(config, basename(repo)), { recursive: true });
  writeFileSync(join(config, "stand-in.md"), standInPrompt);
  if (withGoal) writeFileSync(join(config, basename(repo), "goal.md"), goal);
  return xdg;
}

function homeWithNewSpec(): string {
  const home = tempDir("home-");
  const scripts = join(home, ".claude", "skills", "xp-stories", "scripts");
  mkdirSync(scripts, { recursive: true });
  copyFileSync(newSpecFixture, join(scripts, "new-spec"));
  chmodSync(join(scripts, "new-spec"), 0o755);
  return home;
}

function fakeClaude(): { dir: string; argvs: () => string[][] } {
  const dir = tempDir("fake-claude-");
  const log = join(dir, "argv.jsonl");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "commonjs" }));
  writeFileSync(join(dir, "script.json"), JSON.stringify({ topic, question, answer, slug, specBody }));
  writeFileSync(
    join(dir, "claude"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const dir = ${JSON.stringify(dir)};
const argv = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "argv.jsonl"), JSON.stringify(argv) + "\\n");
const script = JSON.parse(fs.readFileSync(path.join(dir, "script.json"), "utf8"));
const reply = (sessionId, result) => process.stdout.write(JSON.stringify({ type: "result", is_error: false, session_id: sessionId, result }));
const countCall = (name) => {
  const counter = path.join(dir, name);
  const calls = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0) + 1;
  fs.writeFileSync(counter, String(calls));
  return calls;
};
if (argv.includes("--append-system-prompt")) {
  reply("stand-in-session", countCall("stand-in-calls") === 1 ? script.topic : script.answer);
} else {
  if (countCall("questioner-calls") === 1) {
    reply("questioner-session", script.question);
  } else {
    const allowed = argv[argv.indexOf("--allowedTools") + 1];
    const newSpec = /Bash\\((\\/.*?):\\*\\)/.exec(allowed)[1];
    const written = execFileSync(newSpec, [script.slug], { input: script.specBody, encoding: "utf8" }).trim();
    reply("questioner-session", "Wrote " + written);
  }
}
`,
  );
  chmodSync(join(dir, "claude"), 0o755);
  return {
    dir,
    argvs: () =>
      existsSync(log)
        ? readFileSync(log, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as string[])
        : [],
  };
}

function runSlickroot(repo: string, env: Record<string, string>) {
  return spawnSync(bin, [], { cwd: repo, env: { ...process.env, ...env }, encoding: "utf8" });
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  return haystack.some((_, start) => needle.every((item, offset) => haystack[start + offset] === item));
}

test("one run turns the goal file into exactly one new spec and prints its path", () => {
  const repo = gitRepo();
  const xdg = configHome(repo, true);
  const home = homeWithNewSpec();
  const claude = fakeClaude();
  const specsBefore = readdirSync(join(repo, "docs", "specs"));

  const result = runSlickroot(repo, {
    PATH: `${claude.dir}${delimiter}${process.env.PATH}`,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
  });

  assert.equal(result.status, 0, result.stderr);

  const newSpecs = readdirSync(join(repo, "docs", "specs")).filter((name) => !specsBefore.includes(name));
  assert.equal(newSpecs.length, 1);
  const specPath = join(repo, "docs", "specs", newSpecs[0]!);
  assert.equal(result.stdout, `${specPath}\n`);

  const spec = readFileSync(specPath, "utf8");
  assert.ok(spec.includes(storyText));
  assert.match(spec, /^## Acceptance Criteria\n\n(- .+\n)+/m);
  assert.match(spec, /\n## Technical Design\n*$/);

  const runsDir = join(xdg, "slickroot", basename(repo), "runs");
  const runs = readdirSync(runsDir);
  assert.equal(runs.length, 1);
  const transcript = readFileSync(join(runsDir, runs[0]!), "utf8");
  assert.ok(transcript.startsWith(`## StandIn system prompt\n\n${standInSystemPrompt(standInPrompt, goal)}\n\n`), transcript);
  assert.ok(transcript.includes(goal));
  assert.ok(transcript.includes(opener));
  assert.ok(transcript.includes(topic));
  assert.ok(transcript.includes(question));
  assert.ok(transcript.includes(answer));

  const argvs = claude.argvs();
  const standInCalls = argvs.filter((argv) => argv.includes("--append-system-prompt"));
  const questionerCalls = argvs.filter((argv) => !argv.includes("--append-system-prompt"));
  assert.equal(standInCalls.length, 2);
  assert.equal(questionerCalls.length, 2);
  assert.equal(standInCalls[0]![1], opener);
  assert.equal(questionerCalls[0]![1], `/xp-stories ${topic}`);
  for (const argv of questionerCalls) {
    assert.ok(!argv.includes("--model"), JSON.stringify(argv));
    assert.ok(containsSequence(argv, questionerArgs(home)), JSON.stringify(argv));
    assert.ok(argv.every((arg) => !arg.includes(goal.trim())), JSON.stringify(argv));
  }
  for (const argv of standInCalls) {
    assert.ok(containsSequence(argv, ["--model", "claude-sonnet-5-5"]), JSON.stringify(argv));
    assert.ok(containsSequence(argv, standInArgs(standInPrompt, goal)), JSON.stringify(argv));
  }
});

test("without a goal file nothing happens and claude is never called", () => {
  const repo = gitRepo();
  const xdg = configHome(repo, false);
  const home = homeWithNewSpec();
  const claude = fakeClaude();
  const specsBefore = readdirSync(join(repo, "docs", "specs"));

  const result = runSlickroot(repo, {
    PATH: `${claude.dir}${delimiter}${process.env.PATH}`,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.deepEqual(claude.argvs(), []);
  assert.deepEqual(readdirSync(join(repo, "docs", "specs")), specsBefore);
});
