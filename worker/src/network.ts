/**
 * Per-instance addressing.
 *
 * Every shell instance is given a unique address in **100.64.0.0/10** (RFC 6598
 * carrier-grade NAT space). That range is deliberately *non-operable*: it is
 * never routed on the public internet, so the address is purely an identity for
 * the private SSH mesh between instances - it can be handed out freely and can
 * never be used to reach or be reached from the open web.
 *
 * The address is derived deterministically from the Durable Object id, so a
 * session keeps the same address across restarts and reconnects.
 */

// 100.64.0.0 as a 32-bit integer; the /10 block is 100.64.0.0 - 100.127.255.255.
const CGNAT_BASE = 0x64400000;
const CGNAT_SIZE = 1 << 22; // 4,194,304 addresses

/** FNV-1a 32-bit, so the mapping is stable and dependency-free. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable, unique, non-routable address for an instance id. */
export function nonRoutableIpFor(id: string): string {
  const n = (CGNAT_BASE + (fnv1a(id) % CGNAT_SIZE)) >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/** True if `ip` is inside the reserved 100.64.0.0/10 block. */
export function isNonRoutable(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const n = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  return n >= CGNAT_BASE && n < CGNAT_BASE + CGNAT_SIZE;
}
