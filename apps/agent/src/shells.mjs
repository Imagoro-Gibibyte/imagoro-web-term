import { existsSync, statSync } from "node:fs";
import { basename, delimiter, join } from "node:path";

const IS_WIN = process.platform === "win32";

/** Candidate shells per platform, in preference order. */
function candidatesFor(platform) {
  if (platform === "win32") {
    return ["powershell.exe", "pwsh.exe", "cmd.exe", "bash.exe", "wsl.exe"];
  }
  if (platform === "darwin") {
    return ["zsh", "bash", "fish", "sh"];
  }
  return ["bash", "zsh", "fish", "sh"];
}

function isExecutable(p) {
  try {
    statSync(p);
  } catch {
    return false;
  }
  if (IS_WIN) return true;
  try {
    // eslint-disable-next-line no-bitwise
    return (statSync(p).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** Resolve a command name to an absolute path on PATH (honours PATHEXT on Windows). */
export function resolveOnPath(cmd) {
  if (cmd.includes("/") || cmd.includes("\\")) {
    return existsSync(cmd) ? cmd : null;
  }
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const exts = IS_WIN
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, cmd.endsWith(ext) ? cmd : cmd + ext);
      if (isExecutable(candidate)) return candidate;
    }
    const exact = join(dir, cmd);
    if (isExecutable(exact)) return exact;
  }
  return null;
}

/**
 * List the shells available on this host, honouring an optional allowlist.
 * `AGENT_ALLOWED_SHELLS` is a comma-separated list of shell ids (e.g. "bash,zsh").
 */
export function listShells() {
  const allow = (process.env.AGENT_ALLOWED_SHELLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set();
  const shells = [];
  for (const id of candidatesFor(process.platform)) {
    const resolved = resolveOnPath(id);
    if (!resolved) continue;
    const base = basename(resolved).toLowerCase();
    const key = IS_WIN ? base : base.replace(/\.exe$/, ""); // de-dupe pwsh/PowerShell
    if (seen.has(key)) continue;
    seen.add(key);
    if (allow.length && !allow.includes(id) && !allow.includes(base)) continue;
    shells.push({ id, path: resolved });
  }
  return shells;
}

/** Choose the default shell id: AGENT_SHELL if valid, else the first available. */
export function defaultShellId(shells) {
  const want = (process.env.AGENT_SHELL ?? "").trim();
  if (want) {
    const match = shells.find(
      (s) => s.id === want || basename(s.path).toLowerCase() === want.toLowerCase()
    );
    if (match) return match.id;
  }
  return shells[0]?.id ?? null;
}

export function platformLabel() {
  return `${process.platform}-${process.arch}`;
}
