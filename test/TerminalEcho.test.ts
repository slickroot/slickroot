import { test } from "node:test";
import assert from "node:assert/strict";
import { TerminalEcho } from "../src/TerminalEcho.ts";

function fakeStream(isTTY?: boolean): { writes: string[]; write(text: string): void; isTTY?: boolean } {
  const writes: string[] = [];
  const stream: { writes: string[]; write(text: string): void; isTTY?: boolean } = {
    writes,
    write(text: string) {
      writes.push(text);
    },
  };
  if (isTTY !== undefined) {
    stream.isTTY = isTTY;
  }
  return stream;
}

test("wraps dim text in dim codes on a terminal", () => {
  const stream = fakeStream(true);

  const dimmed = TerminalEcho.for(stream).dim("listening");

  assert.equal(dimmed, "\x1b[2mlistening\x1b[22m");
});

test("leaves dim text alone when the stream is not a terminal", () => {
  const stream = fakeStream(false);

  const dimmed = TerminalEcho.for(stream).dim("listening");

  assert.equal(dimmed, "listening");
});

test("leaves dim text alone when the stream does not say whether it is a terminal", () => {
  const stream = fakeStream();

  const dimmed = TerminalEcho.for(stream).dim("listening");

  assert.equal(dimmed, "listening");
});

test("writes text to the stream unchanged", () => {
  const stream = fakeStream(true);

  TerminalEcho.for(stream).write("Started\n");

  assert.deepEqual(stream.writes, ["Started\n"]);
});