import { test } from "node:test";
import assert from "node:assert/strict";
import { bareName, ConversationCommand } from "../src/ConversationCommand.ts";

test("parses the two skills, the watched path and a multi-word seed", () => {
  const args = ConversationCommand.parse([
    "--lead",
    "/xp-stories",
    "--owner",
    "/xp-stories-owner",
    "--until",
    "docs/specs",
    "Adding",
    "a",
    "todo",
    "from",
    "the",
    "terminal.",
  ]);

  assert.deepEqual(args, {
    leadSkill: "/xp-stories",
    ownerSkill: "/xp-stories-owner",
    until: "docs/specs",
    seed: "Adding a todo from the terminal.",
  });
});

test("keeps the seed verbatim, including an @ reference", () => {
  const args = ConversationCommand.parse(["--lead", "/xp-stories", "--owner", "/xp-stories-owner", "--until", "docs/specs", "@docs/specs/001-x.md"]);

  assert.equal(args.seed, "@docs/specs/001-x.md");
});

test("throws when a flag is missing", () => {
  assert.throws(() => ConversationCommand.parse(["--owner", "/xp-stories-owner", "--until", "docs/specs", "A topic"]), /--lead/);
  assert.throws(() => ConversationCommand.parse(["--lead", "/xp-stories", "--until", "docs/specs", "A topic"]), /--owner/);
  assert.throws(() => ConversationCommand.parse(["--lead", "/xp-stories", "--owner", "/xp-stories-owner", "A topic"]), /--until/);
});

test("throws when the seed is empty", () => {
  assert.throws(() => ConversationCommand.parse(["--lead", "/xp-stories", "--owner", "/xp-stories-owner", "--until", "docs/specs"]), /seed/);
});

test("bareName drops the leading slash from a skill name", () => {
  const skill = "/xp-stories";

  assert.equal(bareName(skill), skill.slice(1));
});
