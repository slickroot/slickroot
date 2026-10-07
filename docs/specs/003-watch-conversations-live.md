# Watch the conversations live in the terminal

Maya runs slickroot in her project's repo. She doesn't have to hunt for a transcript file to tail. The story conversation and then the design conversation scroll by in her terminal as they happen, and the Questioner's lines are dimmed so she can tell who's talking. When it's done, the spec path is printed as usual. Happy, she watches the last answer land and goes to grab a coffee.

## Acceptance Criteria

- During a run, each message shows in the terminal as soon as it's said, for both the story conversation and the design conversation.
- The terminal shows the same content as the transcripts, starting with the `StandIn system prompt` entry.
- The `story turn n/30…` and `design turn n/30…` lines still show, in the same places as today.
- The Questioner's messages are dimmed. Everything else shows in the normal style.
- Standard output holds only the spec path, so it can still be piped. The conversation doesn't mix into it.

## Technical Design

Every message already goes through `Transcript.append(speaker, text)`, including the `StandIn system prompt` entry and the story opener. `Transcript` now also echoes each block to stderr, so the terminal shows the same content as the file. `Conversation`, `StoryConversation` and `DesignConversation` don't change.

### Components

**`TerminalEcho`** (new, `src/TerminalEcho.ts`) exports the `Echo` type `{ write(text: string): void; dim(text: string): string }` and the factory `TerminalEcho.for(stream: { write(text: string): unknown; isTTY?: boolean })`:
- `write(text)` passes the text to `stream.write`.
- `dim(text)` returns `\x1b[2m<text>\x1b[22m` when `stream.isTTY` is true, and `text` unchanged otherwise. This keeps escape codes out of redirected stderr (`2> log.txt`).

**`Transcript`** takes the echo at creation: `Transcript.forRun(configDir, repo, prefix, startedAt, echo)`. `append(speaker, text)` builds the block `## <speaker>\n\n<text>\n\n` once, then:
1. appends it to the file, as today (always plain);
2. calls `echo.write(block)`, wrapping the whole block in `echo.dim(...)` when `speaker === "Questioner"`. Every other speaker (`slickroot`, `StandIn`, `StandIn system prompt`) is written as is.

**`bin/slickroot.ts`** creates `const echo = TerminalEcho.for(process.stderr)` once and passes it to both `Transcript.forRun` calls. The `stderr` used for the `story turn n/30…` and `design turn n/30…` lines and for errors doesn't change. Both write to the same stream in call order, so each turn line still shows before that turn's Questioner reply. stdout still only gets the spec path, after the design conversation finishes.

### What the terminal shows

On stderr, in order:
1. The `StandIn system prompt` block.
2. The story opener exchange, then `story turn 1/30…`, `## slickroot` → `/xp-stories …`, and the Questioner/StandIn blocks as each reply arrives.
3. `design turn 1/30…`, `## slickroot` → `/xp-tech-design …`, and the design Questioner/StandIn blocks.
4. On failure, `slickroot: <message>` as today.

The Questioner blocks are dimmed only when stderr is a TTY.

### Tests

- **Unit:**
  - `TerminalEcho`: a fake stream with `isTTY: true` gets the dim codes around the text, and one with `isTTY: false` or no `isTTY` gets the text unchanged. `write` passes the text through to the stream.
  - `Transcript`: a recording fake echo with `dim = t => "<dim>" + t + "</dim>"`. Each `append` sends exactly the block written to the file. Only `Questioner` blocks are dimmed, and the file never contains dim markers. Existing tests pass the fake echo to `forRun`.
- **Acceptance:** the real `bin/slickroot.ts` with the fake `claude`. stderr is piped, so it isn't a TTY. The test asserts:
  - stderr starts with the `## StandIn system prompt` block.
  - stderr contains each transcript's content.
  - `story turn 1/30…` comes before the first story Questioner block, and `design turn 1/30…` comes before the first design Questioner block.
  - stderr has no `\x1b[` escape codes.
  - stdout is exactly the spec path followed by a newline.
