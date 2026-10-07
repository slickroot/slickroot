export interface Echo {
  write(text: string): void;
  dim(text: string): string;
}

type Stream = { write(text: string): unknown; isTTY?: boolean };

export const TerminalEcho = {
  for(stream: Stream): Echo {
    return {
      write(text: string): void {
        stream.write(text);
      },
      dim(text: string): string {
        return stream.isTTY ? `\x1b[2m${text}\x1b[22m` : text;
      },
    };
  },
};