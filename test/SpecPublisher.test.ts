import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpecPublisher, SpecPublisherError } from "../src/SpecPublisher.ts";

const specPath = join("docs", "specs", "002-add-a-todo.md");

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function gitRepo(withRemote = true): { repo: string; remote: string } {
  const repo = tempDir("repo-");
  const remote = tempDir("remote-");
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Maya");
  git(repo, "config", "user.email", "maya@example.com");
  mkdirSync(join(repo, "docs", "specs"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# Todo\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "Initial");
  if (withRemote) {
    git(remote, "init", "-q", "--bare", "-b", "main");
    git(repo, "remote", "add", "origin", remote);
    git(repo, "push", "-q", "origin", "main");
  }
  writeFileSync(join(repo, specPath), "# Add a todo\n\n## Technical Design\n\nStore todos in todos.txt.\n");
  return { repo, remote };
}

test("commits the spec on main and pushes it to origin", async () => {
  const { repo, remote } = gitRepo();

  await SpecPublisher.in(repo).publish(specPath);

  assert.equal(git(remote, "log", "-1", "--format=%s", "main"), "Add spec 002-add-a-todo");
  assert.match(git(remote, "show", `main:${specPath}`), /Store todos in todos\.txt\./);
  assert.equal(git(repo, "status", "--porcelain", "--", specPath), "");
});

test("commits only the spec, leaving other changes out of the commit", async () => {
  const { repo, remote } = gitRepo();
  writeFileSync(join(repo, "README.md"), "# Todo, edited\n");
  writeFileSync(join(repo, "staged.txt"), "staged\n");
  git(repo, "add", "staged.txt");

  await SpecPublisher.in(repo).publish(specPath);

  assert.deepEqual(git(remote, "show", "--name-only", "--format=", "main").split("\n"), [specPath]);
  assert.equal(git(repo, "status", "--porcelain"), "M README.md\nA  staged.txt");
});

test("fails with a SpecPublisherError when the push fails", async () => {
  const { repo } = gitRepo(false);

  await assert.rejects(SpecPublisher.in(repo).publish(specPath), (error: Error) => {
    assert.ok(error instanceof SpecPublisherError);
    assert.match(error.message, /^git push failed/);
    return true;
  });
});
