import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { standInModel } from "../src/ClaudeSession.ts";
import { Implementer, ImplementerError, skill } from "../src/Implementer.ts";
import { FakeEcho } from "./support/FakeEcho.ts";

function stubClaude(lines: object[], exitCode = 0): { argvs: () => string[][] } {
  const dir = mkdtempSync(join(tmpdir(), "stub-claude-"));
  writeFileSync(join(dir, "lines.json"), JSON.stringify(lines));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "commonjs" }));
  writeFileSync(
    join(dir, "claude"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dir = ${JSON.stringify(dir)};
fs.appendFileSync(path.join(dir, "argv.jsonl"), JSON.stringify(process.argv.slice(2)) + "\\n");
for (const line of JSON.parse(fs.readFileSync(path.join(dir, "lines.json"), "utf8"))) console.log(JSON.stringify(line));
process.exit(${exitCode});
`,
  );
  chmodSync(join(dir, "claude"), 0o755);
  process.env.PATH = `${dir}${delimiter}${process.env.PATH}`;
  return {
    argvs: () =>
      readFileSync(join(dir, "argv.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
  };
}

const said = (text: string) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
const finished = (result: string, isError = false) => ({ type: "result", is_error: isError, result });

test("runs the implement skill on the spec with the sonnet model", async () => {
  const stub = stubClaude([finished("done")]);

  await Implementer.for(new FakeEcho()).implement("docs/specs/002-x.md");

  const [argv] = stub.argvs();
  assert.equal(argv![argv!.indexOf("-p") + 1], `${skill} docs/specs/002-x.md`);
  assert.equal(argv![argv!.indexOf("--model") + 1], standInModel);
});

test("runs in auto mode so the unattended run can edit, test and commit", async () => {
  const stub = stubClaude([finished("done")]);

  await Implementer.for(new FakeEcho()).implement("docs/specs/002-x.md");

  const [argv] = stub.argvs();
  assert.equal(argv![argv!.indexOf("--permission-mode") + 1], "auto");
});

test("shows what claude says as it happens", async () => {
  stubClaude([said("Building slice one."), said("PR: https://example.com/pr/1"), finished("done")]);
  const echo = new FakeEcho();

  await Implementer.for(echo).implement("docs/specs/002-x.md");

  const shown = echo.writes.join("");
  assert.ok(shown.includes("Building slice one."), shown);
  assert.ok(shown.includes("PR: https://example.com/pr/1"), shown);
});

test("fails when claude exits non-zero", async () => {
  stubClaude([said("oops")], 1);

  await assert.rejects(Implementer.for(new FakeEcho()).implement("docs/specs/002-x.md"), ImplementerError);
});

test("fails when claude reports an error result", async () => {
  stubClaude([finished("it broke", true)]);

  await assert.rejects(Implementer.for(new FakeEcho()).implement("docs/specs/002-x.md"), /it broke/);
});
