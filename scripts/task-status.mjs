#!/usr/bin/env node
// Reports which tasks/*.md are in-flight or ready to start, computed from
// frontmatter (status + depends_on) instead of scanning it by eye each session.
//
// Frontmatter is parsed by hand rather than with a YAML library: task ids are
// zero-padded (010, 011, 012, 013...), and YAML's default int schema reads a
// leading-zero all-octal-digit scalar as octal (010 -> 8, 011 -> 9, 013 -> 11) --
// silently wrong for exactly the ids this repo uses. Ids are never used
// arithmetically, so they're kept as plain strings throughout.

import { readdirSync, readFileSync } from "node:fs";

const TASKS_DIR = new URL("../tasks/", import.meta.url);

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("no frontmatter found");
  const data = {};
  for (const line of match[1].split("\n")) {
    const withoutComment = line.replace(/#.*$/, "").trimEnd();
    const m = withoutComment.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.trim();
    if (value.startsWith("[")) {
      const inner = value.slice(1, -1).trim();
      data[key] = inner === "" ? [] : inner.split(",").map((s) => s.trim());
    } else {
      data[key] = value;
    }
  }
  return data;
}

const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".md") && f !== "TEMPLATE.md");

const tasks = new Map();
for (const file of files) {
  const fm = parseFrontmatter(readFileSync(new URL(file, TASKS_DIR), "utf8"));
  tasks.set(fm.id, { ...fm, file });
}

const inFlight = [...tasks.values()].filter((t) => t.status === "in_progress" || t.status === "in_review");

if (inFlight.length > 0) {
  if (inFlight.length > 1) {
    console.warn(
      `warning: ${inFlight.length} tasks are in_progress/in_review at once (expected at most 1 under this repo's sequential execution model):`,
    );
  }
  console.log("Continue:");
  for (const t of inFlight) console.log(`  ${t.id} [${t.status}] ${t.title}`);
  process.exit(0);
}

const ready = [...tasks.values()].filter(
  (t) => t.status === "approved" && t.depends_on.every((depId) => tasks.get(depId)?.status === "done"),
);

console.log(ready.length > 0 ? "Ready to start:" : "No ready tasks.");
for (const t of ready) {
  console.log(`  ${t.id} ${t.title} (depends_on: ${t.depends_on.join(", ") || "none"})`);
}

const blocked = [...tasks.values()].filter((t) => t.status === "approved" && !ready.includes(t));
if (blocked.length > 0) {
  console.log("\nBlocked (waiting on dependencies):");
  for (const t of blocked) {
    const waiting = t.depends_on.filter((d) => tasks.get(d)?.status !== "done");
    console.log(`  ${t.id} ${t.title} — waiting on: ${waiting.join(", ")}`);
  }
}

const needsApproval = [...tasks.values()].filter((t) => t.status === "proposed");
if (needsApproval.length > 0) {
  console.log("\nNeeds approval:");
  for (const t of needsApproval) console.log(`  ${t.id} ${t.title}`);
}

const done = [...tasks.values()].filter((t) => t.status === "done");
if (done.length > 0) {
  console.log("\nDone:");
  for (const t of done) console.log(`  ${t.id} ${t.title}`);
}
