import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Preflight, PreflightError } from "../src/Preflight.ts";

const standInPrompt = "You answer in Maya's place.\n";
const goal = "Ship the thing.\n";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function gitRepo(branch = "main"): string {
  const repo = tempDir("repo-");
  execFileSync("git", ["init", "-q", "-b", branch], { cwd: repo });
  mkdirSync(join(repo, "docs", "specs"), { recursive: true });
  return repo;
}

function configFor(repo: string, goalText: string | null = goal): string {
  const config = tempDir("config-");
  writeFileSync(join(config, "stand-in.md"), standInPrompt);
  if (goalText !== null) {
    mkdirSync(join(config, basename(repo)));
    writeFileSync(join(config, basename(repo), "goal.md"), goalText);
  }
  return config;
}

test("is ready with everything the run needs when all checks pass", async () => {
  const repo = gitRepo();

  const outcome = await Preflight.for(repo, configFor(repo)).run();

  assert.deepEqual(outcome, {
    kind: "ready",
    repo: basename(repo),
    goal,
    standInPrompt,
    specsDir: join(repo, "docs", "specs"),
  });
});

test("names the repo after the git toplevel when run from a subdirectory", async () => {
  const repo = gitRepo();
  const subdir = join(repo, "src");
  mkdirSync(join(subdir, "docs", "specs"), { recursive: true });

  const outcome = await Preflight.for(subdir, configFor(repo)).run();

  assert.equal(outcome.kind === "ready" && outcome.repo, basename(repo));
});

test("fails outside a git repo", async () => {
  const dir = tempDir("not-a-repo-");
  mkdirSync(join(dir, "docs", "specs"), { recursive: true });

  await assert.rejects(Preflight.for(dir, configFor(dir)).run(), PreflightError);
});

test("fails when HEAD is not on main", async () => {
  const repo = gitRepo("feature");

  await assert.rejects(Preflight.for(repo, configFor(repo)).run(), PreflightError);
});

test("fails when HEAD is detached", async () => {
  const repo = gitRepo();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo });
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
  git("checkout", "-q", "--detach");

  await assert.rejects(Preflight.for(repo, configFor(repo)).run(), PreflightError);
});

test("fails when docs/specs/ is missing", async () => {
  const repo = tempDir("repo-");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });

  await assert.rejects(Preflight.for(repo, configFor(repo)).run(), PreflightError);
});

test("fails when stand-in.md is missing", async () => {
  const repo = gitRepo();
  const config = tempDir("config-");

  await assert.rejects(Preflight.for(repo, config).run(), PreflightError);
});

test("reports no goal when the repo has no goal file", async () => {
  const repo = gitRepo();

  const outcome = await Preflight.for(repo, configFor(repo, null)).run();

  assert.deepEqual(outcome, { kind: "noGoal" });
});

test("reports no goal when the goal file is empty", async () => {
  const repo = gitRepo();

  const outcome = await Preflight.for(repo, configFor(repo, "")).run();

  assert.deepEqual(outcome, { kind: "noGoal" });
});

test("checks the branch before the config dir", async () => {
  const repo = gitRepo("feature");
  const branchOnly = await Preflight.for(repo, configFor(repo)).run().catch((error: unknown) => error);

  await assert.rejects(Preflight.for(repo, tempDir("config-")).run(), branchOnly as Error);
});
