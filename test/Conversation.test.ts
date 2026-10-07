import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Conversation, ConversationError, maxTurns } from "../src/Conversation.ts";
import { SpecDirectory } from "../src/SpecDirectory.ts";
import { Transcript } from "../src/Transcript.ts";
import { FakeSession } from "./support/FakeSession.ts";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function setup() {
  const specsDir = tempDir("specs-");
  writeFileSync(join(specsDir, "001-existing.md"), "# Existing\n");
  const transcript = Transcript.forRun(tempDir("config-"), "project", new Date());
  const progress: string[] = [];
  const writeSpec = (name: string) => () => writeFileSync(join(specsDir, name), "# Story\n");
  return { specsDir, transcript, progress, writeSpec };
}

function conversation(
  questioner: FakeSession,
  standIn: FakeSession,
  { specsDir, transcript, progress }: ReturnType<typeof setup>,
): Conversation {
  return Conversation.between({
    questioner,
    standIn,
    specs: SpecDirectory.snapshot(specsDir),
    transcript,
    stderr: (text) => progress.push(text),
  });
}

test("returns the new spec as soon as the Questioner writes one", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([
    { reply: "Who is the user?" },
    { reply: "Spec written.", before: env.writeSpec("002-next.md") },
  ]);
  const standIn = FakeSession.replying("Maya.");

  const specPath = await conversation(questioner, standIn, env).run();

  assert.equal(specPath, join(env.specsDir, "002-next.md"));
  assert.equal(questioner.received.length, 2);
  assert.equal(standIn.received.length, 1);
});

test("passes messages between the sessions in order and records them", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([
    { reply: "Q1" },
    { reply: "Q2" },
    { reply: "Q3", before: env.writeSpec("002-next.md") },
  ]);
  const standIn = FakeSession.scripted([{ reply: "A1" }, { reply: "A2" }]);

  await conversation(questioner, standIn, env).run();

  assert.deepEqual(questioner.received, ["/xp-stories", "A1", "A2"]);
  assert.deepEqual(standIn.received, ["Q1", "Q2"]);
  const recorded = [...readFileSync(env.transcript.path, "utf8").matchAll(/## (\w+)\n\n(\w+)/g)].map(
    ([, speaker, text]) => `${speaker}: ${text}`,
  );
  assert.deepEqual(recorded, ["Questioner: Q1", "StandIn: A1", "Questioner: Q2", "StandIn: A2", "Questioner: Q3"]);
});

test("writes one progress line per turn", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([
    { reply: "Q1" },
    { reply: "Q2", before: env.writeSpec("002-next.md") },
  ]);

  await conversation(questioner, FakeSession.replying("A"), env).run();

  assert.deepEqual(env.progress, [`turn 1/${maxTurns}…\n`, `turn 2/${maxTurns}…\n`]);
});

test("fails when the Questioner writes more than one spec", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([
    {
      reply: "Two specs.",
      before: () => {
        env.writeSpec("002-a.md")();
        env.writeSpec("003-b.md")();
      },
    },
  ]);

  await assert.rejects(conversation(questioner, FakeSession.replying("A"), env).run(), ConversationError);
});

test("fails once maxTurns is exceeded without a spec", async () => {
  const env = setup();
  const questioner = FakeSession.replying("Another question?");
  const standIn = FakeSession.replying("An answer.");

  await assert.rejects(conversation(questioner, standIn, env).run(), ConversationError);

  assert.equal(questioner.received.length, maxTurns);
  assert.equal(env.progress.length, maxTurns);
  assert.equal(env.progress.at(-1), `turn ${maxTurns}/${maxTurns}…\n`);
});

test("still accepts a spec written on the last turn", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([
    ...Array.from({ length: maxTurns - 1 }, () => ({ reply: "Q" })),
    { reply: "Done.", before: env.writeSpec("002-next.md") },
  ]);

  const specPath = await conversation(questioner, FakeSession.replying("A"), env).run();

  assert.equal(specPath, join(env.specsDir, "002-next.md"));
});
