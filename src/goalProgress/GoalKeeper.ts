import type { GoalDocument, Verdict, Verdicts } from "./GoalDocument.ts";
import type { Session } from "../Session.ts";
import type { Transcript } from "../Transcript.ts";

const instructions = `You are recording what a finished story built, so that a goal file can show what is done and what is still owed.

For every numbered line in the #backlog section below, decide what the spec does to it:

- "done" — the spec builds the line in full.
- "untouched" — the spec leaves the line alone.
- "partial" — the spec builds part of the line. Say what it built in "done" and what is still owed in "leftover".

Answer with JSON only: one entry per numbered line, keyed by the line number as a string, and nothing else. Exactly one entry per number, no missing and no extra numbers. For "partial", both "done" and "leftover" are required, non-empty, and each a single line.

The reply looks like this:

{
  "3": { "verdict": "done" },
  "4": { "verdict": "untouched" },
  "5": { "verdict": "partial",
         "done": "h l move between texts inside a row horizontally",
         "leftover": "j k move between texts inside a row vertically" }
}`;

const verdictNames = ["done", "untouched", "partial"];

export class GoalKeeperError extends Error {
  override name = "GoalKeeperError";
}

export class GoalKeeper {
  readonly #session: Session;
  readonly #transcript: Transcript;
  readonly #roleText: string;

  private constructor(session: Session, transcript: Transcript, roleText: string) {
    this.#session = session;
    this.#transcript = transcript;
    this.#roleText = roleText;
  }

  static for(session: Session, transcript: Transcript, roleText: string): GoalKeeper {
    return new GoalKeeper(session, transcript, roleText);
  }

  async classify(document: GoalDocument, specText: string): Promise<Verdicts> {
    const prompt = this.#prompt(document, specText);
    this.#transcript.append("slickroot", prompt);

    const reply = await this.#session.send(prompt);
    this.#transcript.append("GoalKeeper", reply);

    return parseVerdicts(reply, document);
  }

  #prompt(document: GoalDocument, specText: string): string {
    return [
      this.#roleText,
      instructions,
      "# goal.md",
      document.content.trimEnd(),
      "# #backlog",
      ...document.backlog.map((goal) => `${goal.index}. ${goal.line}`),
      "# spec",
      specText.trimEnd(),
    ].join("\n\n");
  }
}

function parseVerdicts(reply: string, document: GoalDocument): Verdicts {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply);
  } catch (error) {
    throw new GoalKeeperError(`the goal keeper's reply is not JSON: ${(error as Error).message}`, { cause: error });
  }
  if (!isObject(parsed)) throw new GoalKeeperError("the goal keeper's reply is not a JSON object");

  const expected = document.backlog.map((goal) => String(goal.index));
  const keys = Object.keys(parsed);
  if (keys.length !== expected.length || !expected.every((index) => keys.includes(index))) {
    throw new GoalKeeperError(
      `the goal keeper's reply covers ${keys.length} lines, expected one per numbered backlog line: ${expected.join(", ")}`,
    );
  }

  const verdicts: Record<number, Verdict> = {};
  for (const goal of document.backlog) {
    verdicts[goal.index] = verdictOf(parsed[String(goal.index)]);
  }
  return verdicts;
}

function verdictOf(entry: unknown): Verdict {
  if (!isObject(entry)) throw new GoalKeeperError("a verdict is not a JSON object");

  const verdict = entry.verdict;
  if (typeof verdict !== "string" || !verdictNames.includes(verdict)) {
    throw new GoalKeeperError(`unknown verdict: ${JSON.stringify(verdict)}`);
  }
  if (verdict === "done" || verdict === "untouched") return { verdict };

  const done = singleLine(entry.done, "done");
  const leftover = singleLine(entry.leftover, "leftover");
  return { verdict: "partial", done, leftover };
}

function singleLine(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GoalKeeperError(`a partial verdict's ${field} is missing or empty`);
  }
  if (value.split("\n").length !== 1) throw new GoalKeeperError(`a partial verdict's ${field} spans more than one line`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}