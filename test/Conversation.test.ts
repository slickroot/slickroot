import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Conversation, ConversationError, maxTurns } from "../src/Conversation.ts";
import { Transcript } from "../src/Transcript.ts";
import { FakeEcho } from "./support/FakeEcho.ts";
import { FakeSession } from "./support/FakeSession.ts";

const label = "story";
const firstMessage = "Begin here.";

function setup() {
  const transcript = Transcript.forRun(mkdtempSync(join(tmpdir(), "config-")), "project", "stories", new Date(), new FakeEcho());
  const progress: string[] = [];
  let finished = false;
  const finish = () => {
    finished = true;
  };
  return { transcript, progress, finish, isFinished: () => finished };
}

function conversation(questioner: FakeSession, standIn: FakeSession, env: ReturnType<typeof setup>): Conversation {
  return Conversation.between({
    questioner,
    standIn,
    transcript: env.transcript,
    stderr: (text) => env.progress.push(text),
    label,
    firstMessage,
    finished: env.isFinished,
  });
}

test("sends the first message to the Questioner and stops as soon as finished() is true", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([{ reply: "Who is the user?" }, { reply: "Done.", before: env.finish }]);
  const standIn = FakeSession.replying("Maya.");

  await conversation(questioner, standIn, env).run();

  assert.equal(questioner.received[0], firstMessage);
  assert.equal(questioner.received.length, 2);
  assert.equal(standIn.received.length, 1);
});

test("passes messages between the sessions in order and records them", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([{ reply: "Q1" }, { reply: "Q2" }, { reply: "Q3", before: env.finish }]);
  const standIn = FakeSession.scripted([{ reply: "A1" }, { reply: "A2" }]);

  await conversation(questioner, standIn, env).run();

  assert.deepEqual(standIn.received, ["Q1", "Q2"]);
  assert.deepEqual(questioner.received, [firstMessage, "A1", "A2"]);
  const recorded = [...readFileSync(env.transcript.path, "utf8").matchAll(/^## (.+)\n\n(.*)$/gm)].map(
    ([, speaker, text]) => `${speaker}: ${text}`,
  );
  assert.deepEqual(recorded, [
    `slickroot: ${firstMessage}`,
    "Questioner: Q1",
    "StandIn: A1",
    "Questioner: Q2",
    "StandIn: A2",
    "Questioner: Q3",
  ]);
});

test("writes one progress line per turn, prefixed with the label", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([{ reply: "Q1" }, { reply: "Q2", before: env.finish }]);

  await conversation(questioner, FakeSession.replying("A"), env).run();

  assert.deepEqual(env.progress, [`${label} turn 1/${maxTurns}…\n`, `${label} turn 2/${maxTurns}…\n`]);
});

test("fails once maxTurns is exceeded without finishing", async () => {
  const env = setup();
  const questioner = FakeSession.replying("Another question?");
  const standIn = FakeSession.replying("An answer.");

  await assert.rejects(
    conversation(questioner, standIn, env).run(),
    new ConversationError(`${label}: not finished within ${maxTurns} turns`),
  );

  assert.equal(questioner.received.length, maxTurns);
  assert.equal(env.progress.length, maxTurns);
  assert.equal(env.progress.at(-1), `${label} turn ${maxTurns}/${maxTurns}…\n`);
});

test("still finishes on the last turn", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([
    ...Array.from({ length: maxTurns - 1 }, () => ({ reply: "Q" })),
    { reply: "Done.", before: env.finish },
  ]);

  await conversation(questioner, FakeSession.replying("A"), env).run();

  assert.equal(questioner.received.length, maxTurns);
});
