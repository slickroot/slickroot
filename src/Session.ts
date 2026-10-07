export interface Session {
  send(message: string): Promise<string>;
}
