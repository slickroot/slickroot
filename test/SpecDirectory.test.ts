import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpecDirectory } from "../src/SpecDirectory.ts";

function specsDirWith(...names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "specs-"));
  for (const name of names) writeFileSync(join(dir, name), "");
  return dir;
}

test("reports no new files when nothing was added since the snapshot", () => {
  const dir = specsDirWith("001-existing.md");
  const specs = SpecDirectory.snapshot(dir);

  assert.deepEqual(specs.newFiles(), []);
});

test("returns the path of a file added since the snapshot", () => {
  const dir = specsDirWith("001-existing.md");
  const specs = SpecDirectory.snapshot(dir);

  writeFileSync(join(dir, "002-new.md"), "");

  assert.deepEqual(specs.newFiles(), [join(dir, "002-new.md")]);
});

test("returns every file added since the snapshot", () => {
  const dir = specsDirWith();
  const specs = SpecDirectory.snapshot(dir);

  writeFileSync(join(dir, "001-first.md"), "");
  writeFileSync(join(dir, "002-second.md"), "");

  assert.deepEqual(specs.newFiles().sort(), [join(dir, "001-first.md"), join(dir, "002-second.md")]);
});
