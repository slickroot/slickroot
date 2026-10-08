export type Verdict = { verdict: "done" } | { verdict: "untouched" } | { verdict: "partial"; done: string; leftover: string };

export type Verdicts = Readonly<Record<number, Verdict>>;

export type GoalLine = { index: number; line: string };

const heading = /^#{1,6}\s*\S/;
const backlogHeading = /^#\s*backlog\s*$/i;
const doneHeading = /^#\s*done\s*$/i;
const doneHeadingLine = "#done";
const listMarker = /^([-*] )/;

export class GoalDocumentError extends Error {
  override name = "GoalDocumentError";
}

type Section = { headerLine: string; headerAt: number; bodyFrom: number; bodyTo: number };

export class GoalDocument {
  readonly backlog: readonly GoalLine[];
  readonly #lines: readonly string[];
  readonly #trailingNewline: boolean;
  readonly #backlog: Section;
  readonly #done: Section | undefined;
  readonly #gap: readonly string[];

  private constructor(
    lines: readonly string[],
    trailingNewline: boolean,
    backlog: readonly GoalLine[],
    backlogSection: Section,
    doneSection: Section | undefined,
    gap: readonly string[],
  ) {
    this.#lines = lines;
    this.#trailingNewline = trailingNewline;
    this.backlog = backlog;
    this.#backlog = backlogSection;
    this.#done = doneSection;
    this.#gap = gap;
  }

  static parse(content: string): GoalDocument {
    const split = content.split("\n");
    const trailingNewline = split.length > 1 && split[split.length - 1] === "";
    const lines = trailingNewline ? split.slice(0, -1) : split;

    const backlogHeaderAt = lines.findIndex((line) => backlogHeading.test(line));
    if (backlogHeaderAt === -1) throw new GoalDocumentError("no #backlog header");

    const doneHeaderAt = lines.findIndex((line) => doneHeading.test(line));
    const backlog = sectionOf(lines, backlogHeaderAt);
    const done = doneHeaderAt === -1 ? undefined : sectionOf(lines, doneHeaderAt);

    const backlogLines: GoalLine[] = [];
    for (let at = backlog.bodyFrom; at < backlog.bodyTo; at++) {
      const line = lines[at];
      if (line.trim() === "") continue;
      backlogLines.push({ index: backlogLines.length + 1, line });
    }

    return new GoalDocument(lines, trailingNewline, backlogLines, backlog, done, gapBetween(done, backlog, lines));
  }

  render(verdicts: Verdicts): string {
    const appended: string[] = [];
    const kept: string[] = [];
    for (const goal of this.backlog) {
      const verdict = verdicts[goal.index] ?? { verdict: "untouched" as const };
      if (verdict.verdict === "untouched") kept.push(goal.line);
      else if (verdict.verdict === "done") appended.push(goal.line);
      else {
        appended.push(withMarker(goal.line, verdict.done));
        kept.push(withMarker(goal.line, verdict.leftover));
      }
    }

    const done = this.#done;
    const doneBody = splitTrailingBlanks(done === undefined ? [] : this.#body(done));
    const out = [
      ...this.#lines.slice(0, done?.headerAt ?? this.#backlog.headerAt),
      done?.headerLine ?? doneHeadingLine,
      ...doneBody.leading,
      ...doneBody.content,
      ...(appended.length === 0 || doneBody.content.length === 0 ? [] : [""]),
      ...appended,
      ...(doneBody.trailing.length === 0 ? this.#gap : doneBody.trailing),
      this.#backlog.headerLine,
      ...leadingBlanks(this.#body(this.#backlog)),
      ...kept,
      ...this.#lines.slice(this.#backlog.bodyTo),
    ];

    return out.join("\n") + (this.#trailingNewline ? "\n" : "");
  }

  #body(section: Section): readonly string[] {
    return this.#lines.slice(section.bodyFrom, section.bodyTo);
  }
}

function sectionOf(lines: readonly string[], headerAt: number): Section {
  return {
    headerLine: lines[headerAt],
    headerAt,
    bodyFrom: headerAt + 1,
    bodyTo: sectionEnd(lines, headerAt),
  };
}

function sectionEnd(lines: readonly string[], headerAt: number): number {
  for (let at = headerAt + 1; at < lines.length; at++) {
    if (heading.test(lines[at])) return at;
  }
  return lines.length;
}

function gapBetween(done: Section | undefined, backlog: Section, lines: readonly string[]): readonly string[] {
  if (done === undefined) return [""];
  if (done.bodyTo <= backlog.headerAt) return lines.slice(done.bodyTo, backlog.headerAt);
  return lines.slice(backlog.bodyTo, done.headerAt);
}

function leadingBlanks(lines: readonly string[]): readonly string[] {
  let at = 0;
  while (at < lines.length && lines[at].trim() === "") at++;
  return lines.slice(0, at);
}

function trailingBlanks(lines: readonly string[]): readonly string[] {
  let at = lines.length;
  while (at > 0 && lines[at - 1].trim() === "") at--;
  return lines.slice(at);
}

function splitTrailingBlanks(
  lines: readonly string[],
): { leading: readonly string[]; content: readonly string[]; trailing: readonly string[] } {
  const trailing = trailingBlanks(lines);
  const leading = leadingBlanks(lines.slice(0, lines.length - trailing.length));
  return { leading, content: lines.slice(leading.length, lines.length - trailing.length), trailing };
}

function withMarker(line: string, text: string): string {
  return `${listMarker.exec(line)?.[1] ?? ""}${text}`;
}