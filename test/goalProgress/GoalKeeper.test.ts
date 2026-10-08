import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoalDocument } from "../../src/goalProgress/GoalDocument.ts";
import { GoalKeeper, GoalKeeperError } from "../../src/goalProgress/GoalKeeper.ts";
import { Transcript } from "../../src/Transcript.ts";
import { FakeEcho } from "../support/FakeEcho.ts";
import { FakeSession } from "../support/FakeSession.ts";

const goal = `# Goal

Ship the thing.

#done

- The old thing already shipped

#backlog

- Move between texts horizontally
* Move between texts vertically
Plain line with no marker
`;

const spec = `# The story

## Acceptance Criteria

- The text moves.
`;

const roleText = "You are the project's goal keeper.";

function setup() {
  const echo = new FakeEcho();
  const transcript = Transcript.forRun(
    mkdtempSync(join(tmpdir(), "config-")),
    "project",
    "goal",
    new Date(),
    echo,
  );
  return { echo, transcript };
}

function keeperFor(reply: string, env: ReturnType<typeof setup> = setup()) {
  const session = FakeSession.replying(reply);
  const keeper = GoalKeeper.for(session, env.transcript, roleText);
  return { session, keeper, env };
}

const allVerdicts = JSON.stringify({
  1: { verdict: "done" },
  2: { verdict: "untouched" },
  3: { verdict: "partial", done: "a line built in part", leftover: "the rest of it" },
});

test("tells claude the role, the whole goal file, the numbered backlog lines and the whole spec", async () => {
  const { session, keeper } = keeperFor(allVerdicts);

  await keeper.classify(GoalDocument.parse(goal), spec);

  const prompt = session.received[0];
  assert.ok(prompt.includes(roleText));
  assert.ok(prompt.includes(goal.trimEnd()));
  assert.ok(prompt.includes("1. - Move between texts horizontally"));
  assert.ok(prompt.includes("2. * Move between texts vertically"));
  assert.ok(prompt.includes("3. Plain line with no marker"));
  assert.ok(prompt.includes(spec.trimEnd()));
  assert.ok(prompt.indexOf(roleText) < prompt.indexOf(goal.trimEnd()));
  assert.ok(prompt.indexOf(goal.trimEnd()) < prompt.indexOf("1. - Move between texts horizontally"));
  assert.ok(prompt.indexOf("3. Plain line with no marker") < prompt.indexOf(spec.trimEnd()));
});

test("states the fixed JSON schema in the prompt", async () => {
  const { session, keeper } = keeperFor(allVerdicts);

  await keeper.classify(GoalDocument.parse(goal), spec);

  assert.match(session.received[0], /"3": \{ "verdict": "done" \}/);
  assert.match(session.received[0], /"leftover":/);
});

test("records the prompt and the reply in the transcript", async () => {
  const { session, keeper, env } = keeperFor(allVerdicts);

  await keeper.classify(GoalDocument.parse(goal), spec);

  const recorded = env.echo.writes.join("");
  assert.ok(recorded.includes(session.received[0]));
  assert.ok(recorded.includes(allVerdicts));
});

test("sends the prompt once", async () => {
  const { session, keeper } = keeperFor(allVerdicts);

  await keeper.classify(GoalDocument.parse(goal), spec);

  assert.equal(session.received.length, 1);
});

test("returns the verdict for every numbered backlog line", async () => {
  const { keeper } = keeperFor(allVerdicts);

  const verdicts = await keeper.classify(GoalDocument.parse(goal), spec);

  assert.deepEqual(verdicts, {
    1: { verdict: "done" },
    2: { verdict: "untouched" },
    3: { verdict: "partial", done: "a line built in part", leftover: "the rest of it" },
  });
});

test("throws when the reply is not JSON", async () => {
  const { keeper } = keeperFor("The spec built all three lines.");

  await assert.rejects(() => keeper.classify(GoalDocument.parse(goal), spec), GoalKeeperError);
});

test("throws when an index is missing", async () => {
  const { keeper } = keeperFor(JSON.stringify({ 1: { verdict: "done" }, 2: { verdict: "done" } }));

  await assert.rejects(() => keeper.classify(GoalDocument.parse(goal), spec), GoalKeeperError);
});

test("throws when an unexpected index appears", async () => {
  const reply = JSON.stringify({
    1: { verdict: "done" },
    2: { verdict: "done" },
    3: { verdict: "done" },
    4: { verdict: "done" },
  });
  const { keeper } = keeperFor(reply);

  await assert.rejects(() => keeper.classify(GoalDocument.parse(goal), spec), GoalKeeperError);
});

test("throws on an unknown verdict value", async () => {
  const reply = JSON.stringify({
    1: { verdict: "half" },
    2: { verdict: "done" },
    3: { verdict: "done" },
  });
  const { keeper } = keeperFor(reply);

  await assert.rejects(() => keeper.classify(GoalDocument.parse(goal), spec), GoalKeeperError);
});

test("throws when a partial verdict is missing done and leftover", async () => {
  const reply = JSON.stringify({
    1: { verdict: "done" },
    2: { verdict: "done" },
    3: { verdict: "partial", done: "a line built in part" },
  });
  const { keeper } = keeperFor(reply);

  await assert.rejects(() => keeper.classify(GoalDocument.parse(goal), spec), GoalKeeperError);
});

test("throws when a partial verdict's text is empty", async () => {
  const reply = JSON.stringify({
    1: { verdict: "done" },
    2: { verdict: "done" },
    3: { verdict: "partial", done: "", leftover: "the rest of it" },
  });
  const { keeper } = keeperFor(reply);

  await assert.rejects(() => keeper.classify(GoalDocument.parse(goal), spec), GoalKeeperError);
});

test("throws when a partial verdict's text spans more than one line", async () => {
  const reply = JSON.stringify({
    1: { verdict: "done" },
    2: { verdict: "done" },
    3: { verdict: "partial", done: "a line built in part\nand more", leftover: "the rest of it" },
  });
  const { keeper } = keeperFor(reply);

  await assert.rejects(() => keeper.classify(GoalDocument.parse(goal), spec), GoalKeeperError);
});

test("classifies a goal file with an empty backlog as an empty verdict set", async () => {
  const { keeper } = keeperFor("{}");

  const verdicts = await keeper.classify(GoalDocument.parse("# Goal\n\n#backlog\n\n"), spec);

  assert.deepEqual(verdicts, {});
});