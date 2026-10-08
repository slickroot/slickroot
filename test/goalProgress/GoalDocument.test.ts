import { test } from "node:test";
import assert from "node:assert/strict";
import { GoalDocument, GoalDocumentError } from "../../src/goalProgress/GoalDocument.ts";

const withDone = `# Goal

Ship the thing.

#done

- The old thing already shipped

#backlog

- Move between texts horizontally
* Move between texts vertically
Plain line with no marker
#notes

A trailing comment that must not move.
`;

const withoutDone = "# Goal\n\n#backlog\n\n- Do the thing\n";

const emptyDone = "# Goal\n\n#done\n\n#backlog\n\n- Do the thing\n";

const noMarker = "# Goal\n\n#done\n\n#backlog\n\nPlain line with no marker\n";

test("parses the goal lines verbatim with their markers and numbers them from one", () => {
  const document = GoalDocument.parse(withDone);

  assert.deepEqual(document.backlog, [
    { index: 1, line: "- Move between texts horizontally" },
    { index: 2, line: "* Move between texts vertically" },
    { index: 3, line: "Plain line with no marker" },
  ]);
});

test("stops the goal lines at the next header", () => {
  const document = GoalDocument.parse(withDone);

  assert.ok(!document.backlog.some(({ line }) => line.includes("trailing comment")));
});

test("throws when there is no #backlog header", () => {
  assert.throws(() => GoalDocument.parse("# Goal\n\n- Nothing here\n"), GoalDocumentError);
});

test("does not throw when #done is missing", () => {
  const document = GoalDocument.parse(withoutDone);

  assert.deepEqual(document.backlog, [{ index: 1, line: "- Do the thing" }]);
});

test("inserts a #done section immediately before #backlog when #done is missing", () => {
  const document = GoalDocument.parse(withoutDone);

  const rendered = document.render({ 1: { verdict: "done" } });

  assert.equal(
    rendered,
    ["# Goal", "", "#done", "- Do the thing", "", "#backlog", ""].join("\n") + "\n",
  );
});

test("moves a done line to #done word for word and drops it from #backlog", () => {
  const document = GoalDocument.parse(withDone);

  const rendered = document.render({ 1: { verdict: "done" } });

  assert.equal(
    rendered,
    `# Goal

Ship the thing.

#done

- The old thing already shipped

- Move between texts horizontally

#backlog

* Move between texts vertically
Plain line with no marker
#notes

A trailing comment that must not move.
`,
  );
});

test("splits a partial line into its done part under #done and its leftover in place under #backlog", () => {
  const document = GoalDocument.parse(withDone);

  const rendered = document.render({
    1: { verdict: "partial", done: "Move horizontally", leftover: "Move horizontally with `j`" },
  });

  assert.equal(
    rendered,
    `# Goal

Ship the thing.

#done

- The old thing already shipped

- Move horizontally

#backlog

- Move horizontally with \`j\`
* Move between texts vertically
Plain line with no marker
#notes

A trailing comment that must not move.
`,
  );
});

test("keeps an untouched line in #backlog at its original position", () => {
  const document = GoalDocument.parse(withDone);

  const rendered = document.render({ 1: { verdict: "done" }, 2: { verdict: "untouched" } });

  assert.ok(rendered.includes("#backlog\n\n* Move between texts vertically\nPlain line with no marker\n#notes\n"));
});

test("renders a partial's done part and leftover bare when the original line had no marker", () => {
  const document = GoalDocument.parse(noMarker);

  const rendered = document.render({ 1: { verdict: "partial", done: "Finished it", leftover: "Finish it" } });

  assert.equal(
    rendered,
    ["# Goal", "", "#done", "Finished it", "", "#backlog", "", "Finish it"].join("\n") + "\n",
  );
});

test("appends the moved lines to #done in backlog order, separated from the existing content by one blank line", () => {
  const document = GoalDocument.parse(withDone);

  const rendered = document.render({
    1: { verdict: "done" },
    2: { verdict: "partial", done: "Move vertically", leftover: "Move vertically with `k`" },
  });

  assert.equal(
    rendered.slice(rendered.indexOf("#done"), rendered.indexOf("#backlog")),
    "#done\n\n- The old thing already shipped\n\n- Move between texts horizontally\n* Move vertically\n\n",
  );
});

test("puts no blank line before the appended block when #done was empty", () => {
  const document = GoalDocument.parse(emptyDone);

  const rendered = document.render({ 1: { verdict: "done" } });

  assert.equal(
    rendered,
    ["# Goal", "", "#done", "- Do the thing", "", "#backlog", ""].join("\n") + "\n",
  );
});

test("keeps everything outside #done and #backlog byte for byte", () => {
  const document = GoalDocument.parse(withDone);

  const rendered = document.render({ 1: { verdict: "done" } });

  assert.ok(rendered.startsWith("# Goal\n\nShip the thing.\n\n#done\n"));
  assert.ok(rendered.endsWith("#notes\n\nA trailing comment that must not move.\n"));
});

test("renders the file unchanged when every line is untouched", () => {
  const document = GoalDocument.parse(withDone);

  const rendered = document.render({
    1: { verdict: "untouched" },
    2: { verdict: "untouched" },
    3: { verdict: "untouched" },
  });

  assert.equal(rendered, withDone);
});

test("treats a backlog line with no verdict as untouched", () => {
  const document = GoalDocument.parse(withDone);

  const rendered = document.render({ 1: { verdict: "done" } });

  assert.ok(rendered.includes("#backlog\n\n* Move between texts vertically\nPlain line with no marker\n#notes\n"));
});