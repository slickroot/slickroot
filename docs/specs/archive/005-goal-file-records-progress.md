# Goal file records what the run built

Maya's `goal.md` has a `#done` section, empty at first, and a `#backlog` section. She runs slickroot and goes off for a coffee. The run builds a story and opens a pull request. When she comes back and opens `goal.md`, she finds that what the story built has moved to `#done`, and what's still owed is still in `#backlog`. Happy, she knows exactly where she stands.

## Acceptance Criteria

- `goal.md` has a `#done` section and a `#backlog` section. `#done` may be empty.
- Once the pull request is opened, slickroot updates `goal.md`.
- A line the story fully built moves to `#done`, word for word.
- A line the story only partly built is split into two lines. The built part goes to `#done` and the leftover stays in `#backlog`. slickroot may reword the two pieces. Example: "`h` `j` `k` `l` move between texts inside a row" becomes "`h` `l` move between texts inside a row horizontally" under `#done` and "`j` `k` move between texts inside a row vertically" under `#backlog`.
- If the run fails before the pull request is opened, `goal.md` stays exactly as it was.

## Technical Design

Recording progress is an **isolated, optional plugin**. It takes a finished spec and `goal.md` and updates `goal.md`; it touches nothing else. The core (`Preflight`, the conversations, `SpecPublisher`, `Implementer`) stays exactly as it is and knows nothing about `#done`/`#backlog`, `goal-keeper.md`, goal parsing, or the goal keeper's `claude` call. If the plugin is disabled, slickroot runs unchanged.

The core changes are confined to `bin/slickroot.ts`: one call site, run **after `/xp-implement`** (so the pull request is already open), plus a `goal-keeper` subcommand that runs the plugin on its own.

```ts
await GoalProgress.afterRun({ configDir, repo: outcome.repo, specPath, startedAt, echo, stderr });
```

### Plugin layout

New folder `src/goalProgress/`:

| File | Responsibility |
|---|---|
| `GoalProgress.ts` | Plugin entry point. Orchestrates the update and swallows every error into a warning. |
| `GoalDocument.ts` | Pure markdown shape: parse `#done` / `#backlog`, number the backlog lines, render the result. |
| `GoalKeeper.ts` | The `claude` boundary: build the prompt, send it, parse and strictly validate the JSON verdicts. |

### Command line

`bin/slickroot.ts` takes an optional command and a spec file:

```
slickroot                        # the full run, exactly as today
slickroot goal-keeper <spec-file>  # run only the goal-progress plugin
```

With no command, `bin/slickroot.ts` behaves as it does today. With `goal-keeper`, it skips everything else and runs the plugin alone, which is how the plugin is tested by hand. Both share the same `configDir` and `repo` already used elsewhere in the run: `configDir = slickrootConfigDir(process.env, homedir())`, `repo = basename(git toplevel of cwd)`. The spec file is resolved against cwd. The command builds `TerminalEcho.for(process.stderr)` and calls:

```ts
await GoalProgress.afterRun({ configDir, repo, specPath, startedAt: new Date(), echo, stderr });
```

This is the only entry point; the full run calls the same `afterRun` in-process after `/xp-implement`.

The plugin reuses existing utilities without changing their behaviour: `ClaudeSession.withArgs(...)`, `standInModel`, `Transcript.forRun(...)`, and `GoalFile` (which gains an additive `write(content)`). No new factory is added to `ClaudeSession`; no `Preflight` change; no dependency added.

### Configuration

`<configDir>/goal-keeper.md` — global role prompt, manually editable, like `stand-in.md` but **optional**. If it is missing the plugin is **disabled** and returns silently: slickroot must work without the plugin. The file holds the role/instructions only; the JSON schema is fixed in `GoalKeeper`.

### `GoalProgress.afterRun(context)`

`context = { configDir, repo, specPath, startedAt, echo, stderr }`. Best-effort and self-contained:

1. Read `<configDir>/goal-keeper.md`. Missing → return (disabled).
2. Read the goal file via `GoalFile.for(configDir, repo).read()`. Missing → warn and return.
3. `GoalDocument.parse(content)`. Missing `#backlog` → warn and return.
4. Read the spec at `specPath` (story + acceptance criteria + technical design).
5. Create its own transcript `Transcript.forRun(configDir, repo, "goal", startedAt, echo)`.
6. `GoalKeeper.for(ClaudeSession.withArgs(["--model", standInModel]), transcript, roleText).classify(document, specText)`.
7. `goalFile.write(document.render(verdicts))`.

Any error at any step is caught and written to `stderr` as `slickroot: goal progress not recorded: <message>`. `afterRun` never throws, so it can never change slickroot's exit code or output.

### `GoalDocument`

Pure, no I/O, no `claude`. `GoalDocument.parse(content)` throws `GoalDocumentError` if there is no `#backlog` header (a missing `#done` is fine).

- A **goal line** is every non-empty line between the `#backlog` header and the next `# ` header (or EOF). It is kept verbatim, including any leading `- ` / `* `.
- `backlog` exposes those lines numbered from 1, in order.
- `render(verdicts): string` produces the complete new file:
  - Everything outside `#backlog` and the appended additions is preserved **byte for byte** (title, intro, other sections, comments).
  - `#done` gains the moved lines **appended at the end, in backlog order**: a `done` line verbatim, a `partial` line's `done` string. One blank line separates the appended block from existing `#done` content (none if `#done` was empty).
  - `#backlog` keeps `untouched` lines in place, drops `done` lines, and replaces a `partial` line's text with its `leftover` string at the same position.
  - If `#done` is missing, a `#done` section is inserted immediately before `#backlog`.

### `GoalKeeper`

`GoalKeeper.for(session, transcript, roleText)`; `classify(document, specText): Promise<Verdicts>`.

- Builds one prompt message: the role text, the instructions and the JSON schema, the **whole `goal.md`** verbatim, the `#backlog` lines **numbered**, and the **whole spec**.
- Records the prompt and the reply in the transcript.
- Sends it once (`ClaudeSession.withArgs(["--model", standInModel])`, no tools, instructions in the message). No `--resume`, no opener, no retry.
- Parses the reply as JSON and validates **strictly**, throwing `GoalKeeperError` otherwise:
  - one entry per numbered backlog line, each index exactly once;
  - `verdict` ∈ `{ "done", "untouched", "partial" }`;
  - `partial` carries two non-empty single-line strings, `done` and `leftover`.

```json
{
  "3": { "verdict": "done" },
  "4": { "verdict": "untouched" },
  "5": { "verdict": "partial",
         "done": "h l move between texts inside a row horizontally",
         "leftover": "j k move between texts inside a row vertically" }
}
```

### Behaviour

- Once the pull request is open, the plugin updates `goal.md`: a fully built line moves to `#done` word for word; a partly built line is split, its built part in `#done` and the leftover in `#backlog`.
- If the run fails before the pull request is opened, `afterRun` is never reached, so `goal.md` stays exactly as it was.
- If the update itself fails (missing config, malformed goal, `claude` error, malformed JSON), the file is left untouched, a warning is printed, and the run still exits 0. The write is atomic: the whole new content is built in memory and written in one call.
- The plugin writes a third transcript, `runs/goal-<timestamp>.md` (same `startedAt`), recording the prompt and the verdicts.

### Manual verification

There are no automated tests. The plugin is verified by hand through the `goal-keeper` command, in isolation from the rest of the run:

1. Have a `goal-keeper.md` and a `<repo>/goal.md` (with `#done` and `#backlog`) in the config dir, and a spec file in the repo.
2. From the repo root, run `slickroot goal-keeper <spec-file>` with a real `claude` on `PATH`.
3. Read back the config dir's `<repo>/goal.md` and the new `runs/goal-<timestamp>.md`.

Failure cases to try by hand: no `goal-keeper.md` (silent no-op), a `goal.md` with no `#backlog` (warning, file untouched), a missing spec or malformed JSON (warning, file untouched, exit 0).
