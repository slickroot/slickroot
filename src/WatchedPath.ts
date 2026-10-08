import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type FileState = {
  mtimeMs: number;
  size: number;
};

export class WatchedPath {
  readonly #path: string;
  readonly #files: Map<string, FileState>;

  private constructor(path: string, files: Map<string, FileState>) {
    this.#path = path;
    this.#files = files;
  }

  static at(path: string): WatchedPath {
    return new WatchedPath(path, WatchedPath.#snapshot(path));
  }

  changed(): boolean {
    const now = WatchedPath.#snapshot(this.#path);
    if (now.size !== this.#files.size) return true;
    for (const [name, state] of this.#files) {
      const other = now.get(name);
      if (!other || other.mtimeMs !== state.mtimeMs || other.size !== state.size) return true;
    }
    return false;
  }

  static #snapshot(path: string): Map<string, FileState> {
    const stats = statSync(path);
    if (stats.isDirectory()) return WatchedPath.#snapshotDirectory(path);
    return new Map([[path, { mtimeMs: stats.mtimeMs, size: stats.size }]]);
  }

  static #snapshotDirectory(dir: string): Map<string, FileState> {
    const files = new Map<string, FileState>();
    for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      const full = join(entry.parentPath, entry.name);
      const stats = statSync(full);
      files.set(relative(dir, full), { mtimeMs: stats.mtimeMs, size: stats.size });
    }
    return files;
  }
}
