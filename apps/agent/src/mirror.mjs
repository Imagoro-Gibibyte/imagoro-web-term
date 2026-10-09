import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { assertEgressAllowed, assertSandboxWritable, sandboxDir } from "./netpolicy.mjs";

/**
 * Mirror pull.
 *
 * The instances cannot reach the open web. The one repository source they have
 * is the internal mirror at `AGENT_MIRROR_URL`. `mirrorPull` clones/fetches a
 * mirror of it into the sandbox - never onto a host machine - and the egress
 * guard rejects any other host.
 */

export function mirrorUrl() {
  return (process.env.AGENT_MIRROR_URL ?? "").trim();
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: 180_000, maxBuffer: 8 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => {
        if (err) reject(new Error(String(stderr || err.message).trim()));
        else resolve(String(stdout));
      }
    );
  });
}

function stripCredentials(url) {
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Clone the mirror into the sandbox and resolve `ref` to a commit.
 * @param {string} ref git ref to resolve (default HEAD)
 * @returns {Promise<{dir:string,url:string,ref:string,commit:string}>}
 */
export async function mirrorPull(ref = "HEAD") {
  const url = mirrorUrl();
  if (!url) throw new Error("AGENT_MIRROR_URL is not set");
  assertEgressAllowed(url); // only the mirror host is ever allowed
  assertSandboxWritable(); // and only the sandbox is ever written

  const dir = join(sandboxDir(), "mirror");
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(sandboxDir()), { recursive: true });
  await run("git", ["clone", "--mirror", "--quiet", url, dir]);

  let commit = "";
  try {
    commit = (await run("git", ["--git-dir", dir, "rev-parse", ref])).trim();
  } catch {
    /* ref may not exist yet; the clone itself still succeeded */
  }

  return { dir, url: stripCredentials(url), ref, commit };
}
