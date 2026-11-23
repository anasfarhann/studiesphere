// Fails the build if the shipped stylesheet lost the design tokens (e.g. a stale build cache
// served an old globals.css, which made production render unstyled).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = ".next/static";
const css = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith(".css") && css.push(p); } };
walk(root);
const all = css.map((p) => readFileSync(p, "utf8")).join("\n");
const required = ["--color-ink", "--color-panel", "--color-ground", "--color-pink", "DM Sans"];
const missing = required.filter((k) => !all.includes(k));
if (css.length === 0 || missing.length) {
  console.error(`check-css: built stylesheet is missing ${missing.join(", ") || "all CSS files"}`);
  process.exit(1);
}
console.log(`check-css: ok (${css.length} file(s))`);
