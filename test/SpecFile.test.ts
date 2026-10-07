import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpecFile } from "../src/SpecFile.ts";

function specWith(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "spec-")), "spec.md");
  writeFileSync(path, content);
  return path;
}

test("a Technical Design section with nothing after the header has no technical design", () => {
  const path = specWith("# Story\n\nText.\n\n## Technical Design\n");

  assert.equal(SpecFile.at(path).hasTechnicalDesign(), false);
});

test("a Technical Design section with only whitespace has no technical design", () => {
  const path = specWith("# Story\n\n## Technical Design\n\n   \n\t\n\n");

  assert.equal(SpecFile.at(path).hasTechnicalDesign(), false);
});

test("a Technical Design section with content has a technical design", () => {
  const path = specWith("# Story\n\n## Technical Design\n\nAdd a SpecFile class.\n");

  assert.equal(SpecFile.at(path).hasTechnicalDesign(), true);
});

test("content under a level three subsection counts as technical design", () => {
  const path = specWith("# Story\n\n## Technical Design\n\n### Classes\n\nSpecFile.\n\n## Other\n");

  assert.equal(SpecFile.at(path).hasTechnicalDesign(), true);
});

test("an empty Technical Design followed by another level two section has no technical design", () => {
  const path = specWith("# Story\n\n## Technical Design\n\n## Notes\n\nSome notes.\n");

  assert.equal(SpecFile.at(path).hasTechnicalDesign(), false);
});

test("content before a following level two section counts as technical design", () => {
  const path = specWith("# Story\n\n## Technical Design\n\nAdd a SpecFile class.\n\n## Notes\n\nSome notes.\n");

  assert.equal(SpecFile.at(path).hasTechnicalDesign(), true);
});

test("a spec without a Technical Design header has no technical design and does not throw", () => {
  const path = specWith("# Story\n\n## Acceptance Criteria\n\n- Something.\n");

  assert.equal(SpecFile.at(path).hasTechnicalDesign(), false);
});

test("reads the file fresh on every call", () => {
  const path = specWith("# Story\n\n## Technical Design\n");
  const spec = SpecFile.at(path);

  assert.equal(spec.hasTechnicalDesign(), false);

  writeFileSync(path, "# Story\n\n## Technical Design\n\nNow designed.\n");

  assert.equal(spec.hasTechnicalDesign(), true);
});
