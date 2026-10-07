import { join } from "node:path";

export function slickrootConfigDir(env: Readonly<Record<string, string | undefined>>, homeDir: string): string {
  const configHome = env.XDG_CONFIG_HOME || join(homeDir, ".config");
  return join(configHome, "slickroot");
}
