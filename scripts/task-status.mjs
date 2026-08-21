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

// Groups a list of tasks by their (optional) `epic` field, preserving overall
// order -- an epic's group is inserted at the position of its first member,
// later members join that same group even if not adjacent. Tasks with no
// epic each get their own singleton group, so they print exactly as before.
// This is a pure display grouping over frontmatter already read above -- no
// new data source, so it can't drift from it.
function groupByEpic(list) {
  const groups = [];
  const byEpic = new Map();
  for (const t of list) {
    if (!t.epic) {
      groups.push({ epic: null, tasks: [t] });
      continue;
    }
    if (!byEpic.has(t.epic)) {
      const group = { epic: t.epic, tasks: [] };
      byEpic.set(t.epic, group);
      groups.push(group);
    }
    byEpic.get(t.epic).tasks.push(t);
  }
  return groups;
}

function printGrouped(list, formatLine) {
  for (const group of groupByEpic(list)) {
    if (group.epic) {
      console.log(`  [epic: ${group.epic}] tasks/epics/${group.epic}.md`);
      for (const t of group.tasks) console.log(`    ${formatLine(t)}`);
    } else {
      for (const t of group.tasks) console.log(`  ${formatLine(t)}`);
    }
  }
}

const ready = [...tasks.values()].filter(
  (t) => t.status === "approved" && t.depends_on.every((depId) => tasks.get(depId)?.status === "done"),
);

console.log(ready.length > 0 ? "Ready to start:" : "No ready tasks.");
printGrouped(ready, (t) => `${t.id} ${t.title} (depends_on: ${t.depends_on.join(", ") || "none"})`);

const blocked = [...tasks.values()].filter((t) => t.status === "approved" && !ready.includes(t));
if (blocked.length > 0) {
  console.log("\nBlocked (waiting on dependencies):");
  printGrouped(blocked, (t) => {
    const waiting = t.depends_on.filter((d) => tasks.get(d)?.status !== "done");
    return `${t.id} ${t.title} — waiting on: ${waiting.join(", ")}`;
  });
}

const needsApproval = [...tasks.values()].filter((t) => t.status === "proposed");
if (needsApproval.length > 0) {
  console.log("\nNeeds approval:");
  printGrouped(needsApproval, (t) => `${t.id} ${t.title}`);
}

const done = [...tasks.values()].filter((t) => t.status === "done");
if (done.length > 0) {
  console.log("\nDone:");
  printGrouped(done, (t) => `${t.id} ${t.title}`);
}
