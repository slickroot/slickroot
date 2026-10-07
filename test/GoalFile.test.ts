import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoalFile } from "../src/GoalFile.ts";

function configDir(): string {
  return mkdtempSync(join(tmpdir(), "config-"));
}

test("resolves goal.md inside the repo's folder of the config dir", () => {
  const dir = configDir();

  assert.equal(GoalFile.for(dir, "project").path, join(dir, "project", "goal.md"));
});

test("reads the goal text", () => {
  const dir = configDir();
  mkdirSync(join(dir, "project"));
  writeFileSync(join(dir, "project", "goal.md"), "Ship it.\n");

  assert.equal(GoalFile.for(dir, "project").read(), "Ship it.\n");
});

test("reads nothing when there is no goal file", () => {
  assert.equal(GoalFile.for(configDir(), "project").read(), undefined);
});
