# One command turns the goal file into the next story

Maya has written a goal file for her project. In her terminal, inside the project's repo, she runs one command. She answers no questions, and a new spec file appears in the project holding the next story toward her goal. Happy, she goes to grab a coffee.

## Acceptance Criteria

- A single command, run in the terminal from inside the project's git repo, starts the run.
- The stand-in takes the end goal from the project's goal file, kept outside the repo at `~/.config/slickroot/<repo>/goal.md`. If there is no goal file for the repo, nothing happens.
- No questions are asked of Maya during the run. The stand-in does the answering.
- The `/xp-stories` skill is used to produce the story.
- Exactly one new spec file appears in the project.
- The spec file has exactly the same layout as `/xp-stories` output: story text, acceptance criteria, and an empty `## Technical Design` header.

## Technical Design

Two headless `claude` sessions talk to each other. The **Questioner** runs `/xp-stories`, and the **StandIn** answers in Maya's place, guided by a goal the Questioner never sees. slickroot passes messages between them until `/xp-stories` writes a spec.

### Stack

- TypeScript on Node 24. Native type stripping runs `.ts` with no build step, so only erasable syntax is allowed (no `enum` or `namespace`).
- **No npm dependencies at all.** `typescript` (for `tsc --noEmit`), `nodejs_24` and `pnpm` come from a `flake.nix` devShell pinned by `flake.lock`, and `.envrc` contains `use flake`.
- pnpm is only a script runner (`pnpm test`, `pnpm typecheck`). It is still hardened for any future dependency: lifecycle scripts stay blocked (pnpm 10 default), `strictDepBuilds: true` and `minimumReleaseAge` are set, `packageManager` is pinned, and CI installs with `--frozen-lockfile`.
- Tests use `node:test` and `node:assert`.
- The `claude` CLI is the user's own install, not part of the flake, so usage bills to the existing plan. The Agent SDK is not used.
- Subprocesses run through `child_process.execFile` with argument arrays and never a shell string.

### Files outside the repo

All paths are under `${XDG_CONFIG_HOME:-~/.config}/slickroot/`:

| Path | Purpose |
|---|---|
| `stand-in.md` | Global StandIn role prompt, shared by every project. Required. |
| `<repo>/goal.md` | Goal for the repo whose git toplevel basename is `<repo>`. Opaque markdown. |
| `<repo>/runs/<timestamp>.md` | Transcript of each run. |

The goal is kept outside the repo so the Questioner can never find it by exploring the code.

### Components

**`bin/slickroot.ts`** is the entry point. It wires the collaborators together, maps outcomes to exit codes, and prints the new spec path to stdout.

**`Preflight`** knows the cwd and config dir. It checks everything before any `claude` call:
- Inside a git repo, else error.
- `HEAD` on `main`, else error. `new-spec` refuses other branches.
- `docs/specs/` exists, else error.
- `stand-in.md` exists, else error.
- `<repo>/goal.md` exists and is non-empty. If not, it **exits 0 silently** and nothing happens.

**`GoalFile`** knows the config dir and the repo basename. It resolves and reads `<repo>/goal.md`.

**`Session`** is an interface, `send(message): Promise<string>`. It is the seam for unit tests (`FakeSession`).

**`ClaudeSession`** implements `Session`. It knows the `session_id` (unset until the first reply) and its fixed CLI args. The first call runs `claude -p <message> --output-format json <args>`, and later calls add `--resume <session_id>`. It parses `session_id` and `result` from the JSON and throws on non-zero exit or `is_error`.
- Questioner args: `--allowedTools "Read Grep Glob Bash(<abs path to ~/.claude/skills/xp-stories/scripts/new-spec>:*) Bash(scripts/new-spec:*)"`. That is read-only exploration plus `new-spec`, with no `Edit`, no `Write` and no general Bash. The relative form is allowed too because a repo with its own `scripts/new-spec` gets that copy run as `scripts/new-spec …`, which the absolute rule doesn't match, and a headless session can't ask for approval.
- StandIn args: `--allowedTools "Read Grep Glob"` and `--append-system-prompt <stand-in.md + "\n\n## Goal\n\n" + goal>`. The goal reaches the StandIn only through its system prompt. The prompt tells the StandIn to read `docs/specs/` and the code itself to work out what already exists and steer towards the next missing step.

**`SpecDirectory`** knows `docs/specs/` and the snapshot of file names taken before the run. `newFiles()` returns the files added since the snapshot.

**`Transcript`** knows its run file path. `append(speaker, text)` writes each message as it happens.

**`Conversation`** collaborates with a Questioner `Session`, a StandIn `Session`, `SpecDirectory` and `Transcript`, and holds `maxTurns` (30).
1. Send `/xp-stories` to the Questioner.
2. After each Questioner reply, record it, then check `SpecDirectory.newFiles()`:
   - exactly one new file: done, return its path;
   - more than one: fail;
   - none: send the reply to the StandIn, record the StandIn's answer, send that answer to the Questioner, and repeat.
3. Fail once `maxTurns` is exceeded.

Each turn writes one progress line to stderr: `turn n/30…`.

### Exit codes

| Outcome | Exit | stdout |
|---|---|---|
| Spec written | 0 | spec path |
| No goal file for this repo | 0 | nothing |
| Preflight error, `claude` error, `maxTurns` exceeded, or ≠1 new spec | non-zero | nothing (message on stderr) |

### Tests

- **Unit:** `Conversation` with `FakeSession`s and a temp spec dir covers the stop on first new file, `maxTurns`, more than one new file, and turn order. `Preflight`, `GoalFile` and `SpecDirectory` are tested against temp dirs. `ClaudeSession` is tested against a stub executable.
- **Acceptance:** this runs the real `bin/slickroot.ts` in a temp git repo on `main` with `docs/specs/`, a temp `XDG_CONFIG_HOME` holding `stand-in.md` and `<repo>/goal.md`, and a **fake `claude` on `PATH`**. The fake is a small Node script that records its argv and returns canned JSON. On the Questioner's final turn it runs `new-spec`. The test asserts that exactly one new spec exists with the `/xp-stories` layout, that the path is printed, that the transcript is written, and that the expected flags were passed: the goal only in the StandIn's `--append-system-prompt`, never in a Questioner call. It never calls the real `claude`.
