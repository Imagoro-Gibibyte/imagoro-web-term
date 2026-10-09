export type SessionKind = "demo" | "agent";

export interface Session {
  id: string;
  title: string;
  kind: SessionKind;
  /** Shell id for agent sessions, e.g. "powershell.exe", "bash". */
  shell?: string;
}

export interface AgentInfo {
  ok: boolean;
  platform: string;
  shell: string;
  shells: string[];
  version: string;
}
