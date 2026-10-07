import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationError } from "../src/Conversation.ts";
import { SpecDirectory } from "../src/SpecDirectory.ts";
import { opener, StoryConversation } from "../src/StoryConversation.ts";
import { Transcript } from "../src/Transcript.ts";
import { FakeSession } from "./support/FakeSession.ts";

function setup() {
  const specsDir = mkdtempSync(join(tmpdir(), "specs-"));
  writeFileSync(join(specsDir, "001-existing.md"), "# Existing\n");
  const transcript = Transcript.forRun(mkdtempSync(join(tmpdir(), "config-")), "project", "stories", new Date());
  const writeSpec = (name: string) => () => writeFileSync(join(specsDir, name), "# Story\n");
  return { specsDir, transcript, writeSpec };
}

function conversation(questioner: FakeSession, standIn: FakeSession, { specsDir, transcript }: ReturnType<typeof setup>) {
  return StoryConversation.between({
    questioner,
    standIn,
    specs: SpecDirectory.snapshot(specsDir),
    transcript,
    stderr: () => {},
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
  assert.equal(standIn.received.length, 2);
});

test("opens by asking the StandIn for a topic and hands its answer to /xp-stories", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([{ reply: "Spec written.", before: env.writeSpec("002-next.md") }]);
  const standIn = FakeSession.replying("Adding a todo from the terminal.");

  await conversation(questioner, standIn, env).run();

  assert.deepEqual(standIn.received, [opener]);
  assert.deepEqual(questioner.received, ["/xp-stories Adding a todo from the terminal."]);
});

test("records the opener and the topic before the conversation", async () => {
  const env = setup();
  const questioner = FakeSession.scripted([{ reply: "Spec written.", before: env.writeSpec("002-next.md") }]);

  await conversation(questioner, FakeSession.replying("Topic"), env).run();

  const recorded = [...readFileSync(env.transcript.path, "utf8").matchAll(/^## (.+)\n\n(.*)$/gm)].map(
    ([, speaker, text]) => `${speaker}: ${text}`,
  );
  assert.deepEqual(recorded.slice(0, 3), [`slickroot: ${opener}`, "StandIn: Topic", "slickroot: /xp-stories Topic"]);
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
