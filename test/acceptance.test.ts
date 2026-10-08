import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { standInModel, designerArgs, designStandInArgs, leadArgs, ownerArgs, questionerArgs, standInArgs, standInSystemPrompt } from "../src/ClaudeSession.ts";
import { skill as implementSkill } from "../src/Implementer.ts";
import { bareName } from "../src/ConversationCommand.ts";
import { maxTurns } from "../src/Conversation.ts";
import { opener } from "../src/StoryConversation.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin", "slickroot.ts");
const newSpecFixture = join(root, "test", "fixtures", "new-spec");

const standInPrompt = "You answer in Maya's place. Read docs/specs/ and the code.\n";
const keeperRole = "You are the project's goal keeper.";
const goal = [
  "# Goal",
  "",
  "A todo app that syncs across devices.",
  "",
  "#done",
  "",
  "#backlog",
  "",
  "- Add a todo from the terminal",
  "* Sync todos across devices",
  "- Show the list of todos",
  "",
].join("\n");
const updatedGoal = [
  "# Goal",
  "",
  "A todo app that syncs across devices.",
  "",
  "#done",
  "- Add a todo from the terminal",
  "* Sync todos across devices",
  "",
  "#backlog",
  "",
  "* Resolve conflicts on sync",
  "- Show the list of todos",
  "",
].join("\n");
const verdicts = JSON.stringify({
  1: { verdict: "done" },
  2: { verdict: "partial", done: "Sync todos across devices", leftover: "Resolve conflicts on sync" },
  3: { verdict: "untouched" },
});
const topic = "Adding a todo from the terminal.";
const question = "Who is the user and what do they want first?";
const answer = "Maya wants to add a todo from the terminal.";
const slug = "add-a-todo";
const relativeSpecPath = join("docs", "specs", "002-add-a-todo.md");
const designQuestion = "Where should the todo be stored?";
const designAnswer = "In a plain file in the repo.";
const designText = "Store todos as lines in todos.txt.";
const prLink = "https://github.com/maya/todo/pull/7";
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

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function gitRepo(): string {
  const repo = tempDir("repo-");
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Maya");
  git(repo, "config", "user.email", "maya@example.com");
  mkdirSync(join(repo, "docs", "specs"), { recursive: true });
  writeFileSync(join(repo, "docs", "specs", "001-existing.md"), "# Existing\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "Initial");
  const remote = tempDir("remote-");
  git(remote, "init", "-q", "--bare", "-b", "main");
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "-q", "origin", "main");
  return repo;
}

function remoteOf(repo: string): string {
  return git(repo, "remote", "get-url", "origin");
}

function configHome(repo: string, withGoal: boolean, withKeeper = false): string {
  const xdg = tempDir("xdg-");
  const config = join(xdg, "slickroot");
  mkdirSync(join(config, basename(repo)), { recursive: true });
  writeFileSync(join(config, "stand-in.md"), standInPrompt);
  if (withGoal) writeFileSync(join(config, basename(repo), "goal.md"), goal);
  if (withKeeper) writeFileSync(join(config, "goal-keeper.md"), keeperRole);
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

function fakeClaude(designFails = false, implementFails = false): { dir: string; argvs: () => string[][] } {
  const dir = tempDir("fake-claude-");
  const log = join(dir, "argv.jsonl");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "commonjs" }));
  writeFileSync(join(dir, "script.json"), JSON.stringify({ topic, question, answer, slug, specBody, designQuestion, designAnswer, designText, designFails, implementFails, prLink, keeperRole, verdicts }));
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
const emit = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
if (argv[1].startsWith(${JSON.stringify(implementSkill)})) {
  emit({ type: "assistant", message: { content: [{ type: "text", text: "Implementing the story." }] } });
  if (script.implementFails) {
    process.stderr.write("implementation failed\\n");
    process.exit(1);
  }
  emit({ type: "assistant", message: { content: [{ type: "text", text: "Opened " + script.prLink }] } });
  emit({ type: "result", is_error: false, session_id: "implement-session", result: "Opened " + script.prLink });
  process.exit(0);
}
if (argv[1].startsWith(script.keeperRole)) {
  reply("goal-keeper-session", script.verdicts);
  process.exit(0);
}
const allowed = argv[argv.indexOf("--allowedTools") + 1];
const systemPrompt = argv.includes("--append-system-prompt") ? argv[argv.indexOf("--append-system-prompt") + 1] : undefined;
const isStoryStandIn = systemPrompt !== undefined && systemPrompt.includes("## Goal");
const isDesignQuestioner = allowed.includes("Edit(");
const isDesignStandIn = !isStoryStandIn && argv.includes("--model");
if (isStoryStandIn) {
  reply("stand-in-session", countCall("stand-in-calls") === 1 ? script.topic : script.answer);
} else if (isDesignStandIn) {
  reply("design-stand-in-session", script.designAnswer);
} else if (isDesignQuestioner) {
  if (script.designFails) {
    process.stderr.write("design failed\\n");
    process.exit(1);
  }
  if (countCall("design-questioner-calls") === 1) {
    reply("design-questioner-session", script.designQuestion);
  } else {
    const specPath = path.resolve(process.cwd(), /Edit\\((.*?)\\)/.exec(allowed)[1]);
    const spec = fs.readFileSync(specPath, "utf8");
    fs.writeFileSync(specPath, spec.replace(/## Technical Design\\n*$/, "## Technical Design\\n\\n" + script.designText + "\\n"));
    reply("design-questioner-session", "Designed " + specPath);
  }
} else {
  if (countCall("questioner-calls") === 1) {
    reply("questioner-session", script.question);
  } else {
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
    argvs: () => argvsIn(log),
  };
}

function argvsIn(log: string): string[][] {
  return existsSync(log)
    ? readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[])
    : [];
}

function fakeConversationClaude(writtenSpec: string): { dir: string; argvs: () => string[][] } {
  const dir = tempDir("fake-claude-");
  const log = join(dir, "argv.jsonl");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "commonjs" }));
  writeFileSync(join(dir, "script.json"), JSON.stringify({ question, answer, writtenSpec, specBody }));
  writeFileSync(
    join(dir, "claude"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dir = ${JSON.stringify(dir)};
const argv = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "argv.jsonl"), JSON.stringify(argv) + "\\n");
const script = JSON.parse(fs.readFileSync(path.join(dir, "script.json"), "utf8"));
const reply = (sessionId, result) => process.stdout.write(JSON.stringify({ type: "result", is_error: false, session_id: sessionId, result }));
const counter = path.join(dir, "lead-calls");
const leadCalls = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0) + 1;
if (argv.includes("--model")) {
  reply("owner-session", script.answer);
} else {
  fs.writeFileSync(counter, String(leadCalls));
  if (leadCalls === 1) {
    reply("lead-session", script.question);
  } else {
    fs.writeFileSync(path.resolve(process.cwd(), script.writtenSpec), script.specBody);
    reply("lead-session", "Wrote " + script.writtenSpec);
  }
}
`,
  );
  chmodSync(join(dir, "claude"), 0o755);
  return {
    dir,
    argvs: () => argvsIn(log),
  };
}

function runSlickroot(repo: string, env: Record<string, string>, args: string[] = []) {
  return spawnSync(bin, args, { cwd: repo, env: { ...process.env, ...env }, encoding: "utf8" });
}

function blocks(markdown: string): string[] {
  return markdown
    .split(/(?=^## )/m)
    .filter((block) => block.startsWith("## "));
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  return haystack.some((_, start) => needle.every((item, offset) => haystack[start + offset] === item));
}

test("one run turns the goal file into a designed spec, then builds the story and shows the PR link", () => {
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
  assert.equal(result.stdout, "");

  const spec = readFileSync(specPath, "utf8");
  assert.ok(spec.includes(storyText));
  assert.match(spec, /^## Acceptance Criteria\n\n(- .+\n)+/m);

  const designSection = spec.slice(spec.indexOf("## Technical Design"));
  assert.ok(designSection.includes(designText), designSection);

  assert.equal(git(remoteOf(repo), "log", "-1", "--format=%s", "main"), `Add spec ${basename(specPath, ".md")}`);
  assert.equal(git(remoteOf(repo), "show", `main:${relativeSpecPath}`), spec.trim());

  const runsDir = join(xdg, "slickroot", basename(repo), "runs");
  const runs = readdirSync(runsDir);
  const storiesRun = runs.find((name) => name.startsWith("stories-"));
  const designRun = runs.find((name) => name.startsWith("tech-design-"));
  assert.equal(runs.length, 2);
  assert.ok(storiesRun !== undefined && designRun !== undefined, runs.join(", "));
  assert.equal(storiesRun.replace("stories-", ""), designRun.replace("tech-design-", ""));

  const systemPromptBlock = `## StandIn system prompt\n\n${standInSystemPrompt(standInPrompt, goal)}\n\n`;
  const storiesTranscript = readFileSync(join(runsDir, storiesRun), "utf8");
  assert.ok(storiesTranscript.startsWith(systemPromptBlock), storiesTranscript);
  assert.ok(storiesTranscript.includes(goal));
  assert.ok(storiesTranscript.includes(opener));
  assert.ok(storiesTranscript.includes(topic));
  assert.ok(storiesTranscript.includes(question));
  assert.ok(storiesTranscript.includes(answer));

  const designTranscript = readFileSync(join(runsDir, designRun), "utf8");
  assert.ok(designTranscript.startsWith(`## slickroot\n\n/xp-tech-design ${relativeSpecPath}\n\n`), designTranscript);
  assert.ok(designTranscript.includes(designQuestion));
  assert.ok(designTranscript.includes(designAnswer));
  assert.ok(!designTranscript.includes(goal.trim()));

  const firstStoryQuestion = `## Questioner\n\n${question}\n\n`;
  const firstDesignQuestion = `## Questioner\n\n${designQuestion}\n\n`;
  assert.ok(result.stderr.startsWith(systemPromptBlock), result.stderr);
  for (const transcript of [storiesTranscript, designTranscript]) {
    for (const block of blocks(transcript)) {
      assert.ok(result.stderr.includes(block), block);
    }
  }
  assert.ok(
    result.stderr.indexOf(`story turn 1/${maxTurns}…`) < result.stderr.indexOf(firstStoryQuestion),
    result.stderr,
  );
  assert.ok(
    result.stderr.indexOf(`design turn 1/${maxTurns}…`) < result.stderr.indexOf(firstDesignQuestion),
    result.stderr,
  );
  assert.ok(!result.stderr.includes("\x1b["), result.stderr);

  assert.ok(result.stderr.includes(prLink), result.stderr);
  assert.ok(result.stderr.trimEnd().endsWith(`Opened ${prLink}`), result.stderr);

  const argvs = claude.argvs();
  const implementCalls = argvs.filter((argv) => argv[1]?.startsWith(implementSkill));
  assert.equal(implementCalls.length, 1);
  assert.equal(implementCalls[0]![1], `${implementSkill} ${relativeSpecPath}`);
  assert.ok(containsSequence(implementCalls[0]!, ["--model", standInModel]), JSON.stringify(implementCalls[0]));
  assert.equal(argvs.at(-1), implementCalls[0]);
  const isDesignQuestioner = (argv: string[]) => containsSequence(argv, designerArgs(relativeSpecPath));
  const isDesignStandIn = (argv: string[]) => containsSequence(argv, designStandInArgs());
  const isStandIn = (argv: string[]) => containsSequence(argv, standInArgs(standInPrompt, goal));
  const standInCalls = argvs.filter(isStandIn);
  const questionerCalls = argvs.filter((argv) => !implementCalls.includes(argv) && !isStandIn(argv) && !isDesignQuestioner(argv) && !isDesignStandIn(argv));
  const designQuestionerCalls = argvs.filter(isDesignQuestioner);
  const designStandInCalls = argvs.filter(isDesignStandIn);
  assert.equal(standInCalls.length, 2);
  assert.equal(questionerCalls.length, 2);
  assert.equal(designQuestionerCalls.length, 2);
  assert.equal(designStandInCalls.length, 1);
  assert.equal(standInCalls[0]![1], opener);
  assert.equal(questionerCalls[0]![1], `/xp-stories ${topic}`);
  assert.equal(designQuestionerCalls[0]![1], `/xp-tech-design ${relativeSpecPath}`);
  assert.equal(designStandInCalls[0]![1], designQuestion);
  for (const argv of questionerCalls) {
    assert.ok(!argv.includes("--model"), JSON.stringify(argv));
    assert.ok(containsSequence(argv, questionerArgs(home)), JSON.stringify(argv));
    assert.ok(argv.every((arg) => !arg.includes(goal.trim())), JSON.stringify(argv));
  }
  for (const argv of standInCalls) {
    assert.ok(containsSequence(argv, ["--model", "claude-sonnet-5-5"]), JSON.stringify(argv));
    assert.ok(containsSequence(argv, standInArgs(standInPrompt, goal)), JSON.stringify(argv));
  }
  assert.ok(!designQuestionerCalls[0]!.includes("--resume"), JSON.stringify(designQuestionerCalls[0]));
  assert.ok(!designStandInCalls[0]!.includes("--resume"), JSON.stringify(designStandInCalls[0]));
  for (const argv of [...designQuestionerCalls, ...designStandInCalls]) {
    assert.ok(argv.every((arg) => !arg.includes(goal.trim())), JSON.stringify(argv));
  }
});

test("a failing design conversation fails the run but leaves the spec with its story", () => {
  const repo = gitRepo();
  const xdg = configHome(repo, true);
  const home = homeWithNewSpec();
  const claude = fakeClaude(true);
  const specsBefore = readdirSync(join(repo, "docs", "specs"));

  const result = runSlickroot(repo, {
    PATH: `${claude.dir}${delimiter}${process.env.PATH}`,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
  });

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.notEqual(result.stderr, "");
  const newSpecs = readdirSync(join(repo, "docs", "specs")).filter((name) => !specsBefore.includes(name));
  assert.equal(newSpecs.length, 1);
  const spec = readFileSync(join(repo, "docs", "specs", newSpecs[0]!), "utf8");
  assert.ok(spec.includes(storyText));
  assert.match(spec, /\n## Technical Design\n*$/);
  assert.equal(git(remoteOf(repo), "log", "-1", "--format=%s", "main"), "Initial");
  assert.equal(git(repo, "log", "-1", "--format=%s"), "Initial");
});

test("a failing implementation fails the run after the spec is designed and published", () => {
  const repo = gitRepo();
  const xdg = configHome(repo, true);
  const home = homeWithNewSpec();
  const claude = fakeClaude(false, true);

  const result = runSlickroot(repo, {
    PATH: `${claude.dir}${delimiter}${process.env.PATH}`,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
  });

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.includes("slickroot:"), result.stderr);
  assert.match(git(remoteOf(repo), "log", "-1", "--format=%s", "main"), /^Add spec /);
});

function goalPath(xdg: string, repo: string): string {
  return join(xdg, "slickroot", basename(repo), "goal.md");
}

function goalRuns(xdg: string, repo: string): string[] {
  return readdirSync(join(xdg, "slickroot", basename(repo), "runs")).filter((name) => name.startsWith("goal-"));
}

test("the goal-keeper command moves a built backlog line to #done and splits a partly built one", () => {
  const repo = gitRepo();
  const xdg = configHome(repo, true, true);
  const claude = fakeClaude();

  const result = runSlickroot(
    repo,
    { PATH: `${claude.dir}${delimiter}${process.env.PATH}`, XDG_CONFIG_HOME: xdg },
    ["goal-keeper", join("docs", "specs", "001-existing.md")],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(readFileSync(goalPath(xdg, repo), "utf8"), updatedGoal);

  const runs = goalRuns(xdg, repo);
  assert.equal(runs.length, 1);
  const transcript = readFileSync(join(xdg, "slickroot", basename(repo), "runs", runs[0]!), "utf8");
  assert.ok(transcript.startsWith(`## slickroot\n\n${keeperRole}\n\n`), transcript);
  assert.ok(transcript.includes("# #backlog"), transcript);
  assert.ok(transcript.includes("# spec"), transcript);
  assert.ok(transcript.endsWith(`## GoalKeeper\n\n${verdicts}\n\n`), transcript);

  const argvs = claude.argvs();
  assert.equal(argvs.length, 1);
  assert.equal(argvs[0]![0], "-p");
  assert.ok(argvs[0]![1].startsWith(keeperRole), argvs[0]![1]);
  assert.ok(containsSequence(argvs[0]!, ["--model", standInModel]), JSON.stringify(argvs[0]));
});

test("the full run records goal progress once the pull request is opened", () => {
  const repo = gitRepo();
  const xdg = configHome(repo, true, true);
  const home = homeWithNewSpec();
  const claude = fakeClaude();

  const result = runSlickroot(repo, {
    PATH: `${claude.dir}${delimiter}${process.env.PATH}`,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stderr.includes(prLink), result.stderr);
  assert.equal(readFileSync(goalPath(xdg, repo), "utf8"), updatedGoal);
  assert.equal(goalRuns(xdg, repo).length, 1);
  assert.ok(result.stderr.indexOf(prLink) < result.stderr.indexOf(keeperRole), result.stderr);
});

test("a failing implementation leaves the goal file exactly as it was", () => {
  const repo = gitRepo();
  const xdg = configHome(repo, true, true);
  const home = homeWithNewSpec();
  const claude = fakeClaude(false, true);

  const result = runSlickroot(repo, {
    PATH: `${claude.dir}${delimiter}${process.env.PATH}`,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
  });

  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(goalPath(xdg, repo), "utf8"), goal);
  assert.deepEqual(goalRuns(xdg, repo), []);
  assert.ok(!result.stderr.includes(keeperRole), result.stderr);
});

test("the goal-keeper command without a goal-keeper.md is a silent no-op", () => {
  const repo = gitRepo();
  const xdg = configHome(repo, true);
  const claude = fakeClaude();

  const result = runSlickroot(
    repo,
    { PATH: `${claude.dir}${delimiter}${process.env.PATH}`, XDG_CONFIG_HOME: xdg },
    ["goal-keeper", join("docs", "specs", "001-existing.md")],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.equal(readFileSync(goalPath(xdg, repo), "utf8"), goal);
  assert.deepEqual(claude.argvs(), []);
  assert.equal(existsSync(join(xdg, "slickroot", basename(repo), "runs")), false);
});

test("the conversation command runs one lead and owner conversation and stops when the watched path changes", () => {
  const repo = gitRepo();
  const xdg = tempDir("xdg-");
  const writtenSpec = join("docs", "specs", "002-conversation.md");
  const claude = fakeConversationClaude(writtenSpec);
  const specsBefore = readdirSync(join(repo, "docs", "specs"));
  const leadSkill = "/lead";
  const ownerSkill = "/owner";
  const seed = "Adding a todo from the terminal.";

  const result = runSlickroot(
    repo,
    { PATH: `${claude.dir}${delimiter}${process.env.PATH}`, XDG_CONFIG_HOME: xdg },
    ["conversation", "--lead", leadSkill, "--owner", ownerSkill, "--until", join("docs", "specs"), seed],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");

  const newSpecs = readdirSync(join(repo, "docs", "specs")).filter((name) => !specsBefore.includes(name));
  assert.deepEqual(newSpecs, ["002-conversation.md"]);
  assert.equal(readFileSync(join(repo, writtenSpec), "utf8"), specBody);

  const turn = (n: number) => `${bareName(leadSkill)} turn ${n}/${maxTurns}…\n`;
  assert.deepEqual(blocks(result.stderr), [
    `## slickroot\n\n${leadSkill} ${seed}\n\n${turn(1)}`,
    `## Lead\n\n${question}\n\n`,
    `## Owner\n\n${answer}\n\n${turn(2)}`,
    `## Lead\n\nWrote ${writtenSpec}\n\n`,
  ]);
  assert.ok(!result.stderr.includes("\x1b["), result.stderr);

  const argvs = claude.argvs();
  assert.equal(argvs.length, 3);
  const [firstLead, firstOwner, secondLead] = argvs;
  assert.equal(firstLead![1], `${leadSkill} ${seed}`);
  assert.ok(containsSequence(firstLead!, leadArgs()), JSON.stringify(firstLead));
  assert.equal(firstLead!.includes("--model"), false);
  assert.equal(firstOwner![1], `${ownerSkill} ${seed}\n\n${question}`);
  assert.ok(containsSequence(firstOwner!, ownerArgs()), JSON.stringify(firstOwner));
  assert.equal(secondLead![1], answer);
  assert.ok(containsSequence(secondLead!, leadArgs()), JSON.stringify(secondLead));
  assert.ok(secondLead!.includes("--resume"), JSON.stringify(secondLead));

  assert.equal(existsSync(join(xdg, "slickroot", basename(repo), "runs")), false);
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
