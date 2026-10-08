import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WatchedPath } from "../src/WatchedPath.ts";

function emptyDir(): string {
  return mkdtempSync(join(tmpdir(), "watched-"));
}

test("reports no change right after construction", () => {
  const dir = emptyDir();
  const watched = WatchedPath.at(dir);

  assert.equal(watched.changed(), false);
  rmSync(dir, { recursive: true, force: true });
});

test("reports a change after a new file appears in the directory", () => {
  const dir = emptyDir();
  const watched = WatchedPath.at(dir);

  writeFileSync(join(dir, "new.md"), "hello");

  assert.equal(watched.changed(), true);
  rmSync(dir, { recursive: true, force: true });
});

test("reports a change after an existing file is edited", () => {
  const dir = emptyDir();
  const file = join(dir, "story.md");
  writeFileSync(file, "short");
  const watched = WatchedPath.at(dir);

  writeFileSync(file, "a considerably longer body of text");

  assert.equal(watched.changed(), true);
  rmSync(dir, { recursive: true, force: true });
});

test("reports a change after a file is deleted from the directory", () => {
  const dir = emptyDir();
  writeFileSync(join(dir, "gone.md"), "hello");
  const watched = WatchedPath.at(dir);

  rmSync(join(dir, "gone.md"));

  assert.equal(watched.changed(), true);
  rmSync(dir, { recursive: true, force: true });
});

test("reports no change when files elsewhere on disk change", () => {
  const watchedDir = emptyDir();
  const otherDir = emptyDir();
  const watched = WatchedPath.at(watchedDir);

  writeFileSync(join(otherDir, "unrelated.md"), "hello");

  assert.equal(watched.changed(), false);
  rmSync(watchedDir, { recursive: true, force: true });
  rmSync(otherDir, { recursive: true, force: true });
});

test("reports a change after the watched file itself is edited", () => {
  const dir = emptyDir();
  const file = join(dir, "spec.md");
  writeFileSync(file, "short");
  const watched = WatchedPath.at(file);

  writeFileSync(file, "a considerably longer body of text");

  assert.equal(watched.changed(), true);
  rmSync(dir, { recursive: true, force: true });
});
