import { test } from "node:test";
import assert from "node:assert/strict";
import { Primed } from "../src/Primed.ts";
import { FakeSession } from "./support/FakeSession.ts";

const prefix = "/xp-tech-design-owner @docs/specs/001-x.md";

test("sends the first message with the prefix and a blank line between them", async () => {
  const session = FakeSession.replying("ok");

  await Primed.with(session, prefix).send("Who is the user?");

  assert.deepEqual(session.received, [`${prefix}\n\nWho is the user?`]);
});

test("sends every later message unchanged", async () => {
  const session = FakeSession.scripted([{ reply: "one" }, { reply: "two" }]);
  const primed = Primed.with(session, prefix);

  await primed.send("Who is the user?");
  await primed.send("Maya.");
  await primed.send("Done?");

  assert.deepEqual(session.received, [`${prefix}\n\nWho is the user?`, "Maya.", "Done?"]);
});
