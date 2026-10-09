/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full ws(s):// URL of a pty agent, e.g. wss://term.example/ws. */
  readonly VITE_AGENT_URL?: string;
  /** Optional bearer token passed to the agent as ?token=. */
  readonly VITE_AGENT_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
