#!/usr/bin/env node
// Generate design/gen.css from design/tokens.json.
// Run: node design/gen-css.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));

const { color, radius, spacing, font } = tokens;

const lines = [":root {"];
for (const [k, v] of Object.entries(color)) lines.push(`  --${k}: ${v};`);
for (const [k, v] of Object.entries(radius)) lines.push(`  --radius-${k}: ${v};`);
for (const [k, v] of Object.entries(spacing)) lines.push(`  --space-${k}: ${v};`);
lines.push(`  --font-family: ${font.family};`);
lines.push(`  --font-mono: ${font.mono};`);
for (const [k, v] of Object.entries(font.size)) lines.push(`  --font-size-${k}: ${v};`);
lines.push("}");
lines.push("");

writeFileSync(join(here, "gen.css"), lines.join("\n"), "utf8");
console.log(`wrote ${join(here, "gen.css")} (${lines.length} lines)`);
