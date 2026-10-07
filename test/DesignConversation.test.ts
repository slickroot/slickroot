import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DesignConversation } from "../src/DesignConversation.ts";
import { SpecFile } from "../src/SpecFile.ts";
import { Transcript } from "../src/Transcript.ts";
import { FakeEcho } from "./support/FakeEcho.ts";
import { FakeSession } from "./support/FakeSession.ts";

const relativeSpecPath = "docs/specs/002-next.md";
const specWithoutDesign = "# Story\n\n## Technical Design\n";
const designText = "Add a Todo class.\n";

function setup() {
  const specPath = join(mkdtempSync(join(tmpdir(), "spec-")), "002-next.md");
  writeFileSync(specPath, specWithoutDesign);
  const transcript = Transcript.forRun(mkdtempSync(join(tmpdir(), "config-")), "project", "tech-design", new Date(), new FakeEcho());
  const writeDesign = () => appendFileSync(specPath, designText);
  return { specPath, transcript, writeDesign };
}

function conversation(questioner: FakeSession, standIn: FakeSession, { specPath, transcript }: ReturnType<typeof setup>) {
  return DesignConversation.between({
    questioner,
    standIn,
    specFile: SpecFile.at(specPath),
    relativeSpecPath,
    transcript,
    stderr: () => {},
  });
}

test("starts the Questioner with /xp-tech-design on the spec path", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([{ reply: "Designed.", before: env.writeDesign }]);

  await conversation(questioner, FakeSession.replying("unused"), env).run();

  assert.deepEqual(questioner.received, [`/xp-tech-design ${relativeSpecPath}`]);
});

test("sends the StandIn no opener, only the Questioner's questions", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([
    { reply: "Which storage?" },
    { reply: "Designed.", before: env.writeDesign },
  ]);
  const standIn = FakeSession.replying("A file.");

  await conversation(questioner, standIn, env).run();

  assert.deepEqual(standIn.received, ["Which storage?"]);
});

test("stops once the spec gains a Technical Design", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([
    { reply: "Q1" },
    { reply: "Q2" },
    { reply: "Designed.", before: env.writeDesign },
  ]);
  const standIn = FakeSession.replying("A.");

  await conversation(questioner, standIn, env).run();

  assert.equal(questioner.received.length, 3);
  assert.equal(standIn.received.length, 2);
});
