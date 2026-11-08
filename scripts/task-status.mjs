#!/usr/bin/env node
// Reports which tasks/*.md are in-flight or ready to start, computed from
// frontmatter (status + depends_on) instead of scanning it by eye each session.
//
// Frontmatter is parsed by hand rather than with a YAML library: task ids are
// zero-padded (010, 011, 012, 013...), and YAML's default int schema reads a
// leading-zero all-octal-digit scalar as octal (010 -> 8, 011 -> 9, 013 -> 11) --
// silently wrong for exactly the ids this repo uses. Ids are never used
// arithmetically, so they're kept as plain strings throughout.
//
// Usage: pnpm tasks:status [--all]   (--all lists every done task, not just the latest few)

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

const SHOW_ALL = process.argv.includes("--all");
const DONE_TAIL = 3;

// Colors only on a real terminal (agents/pipes get plain text); honors NO_COLOR.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const c = {
  green: paint("32"),
  yellow: paint("33"),
  red: paint("31"),
  cyan: paint("36"),
  dim: paint("2"),
  bold: paint("1"),
};

const STATUS_TAGS = {
  ready: c.green("READY   "),
  blocked: c.red("BLOCKED "),
  review: c.yellow("REVIEW  "),
  progress: c.yellow("PROGRESS"),
  proposed: c.cyan("PROPOSED"),
  done: c.dim("DONE    "),
};

const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".md") && f !== "TEMPLATE.md");

const tasks = new Map();
for (const file of files) {
  const fm = parseFrontmatter(readFileSync(new URL(file, TASKS_DIR), "utf8"));
  tasks.set(fm.id, { ...fm, file });
}
const all = [...tasks.values()].sort((a, b) => a.id.localeCompare(b.id));
const withStatus = (...statuses) => all.filter((t) => statuses.includes(t.status));

const epicNames = [...new Set(all.map((t) => t.epic).filter(Boolean))];
const epicWidth = Math.max(0, ...epicNames.map((e) => e.length));

// One row: status tag, id, epic (dim, fixed-width column so titles line up), title, optional note.
function row(tag, t, note = "") {
  const epic = c.dim((t.epic ?? "").padEnd(epicWidth));
  return `  ${tag} ${t.id}  ${epic}  ${t.title}${note ? c.dim(`  ${note}`) : ""}`;
}

function section(title) {
  console.log(`\n${c.bold(title)}`);
}

const inFlight = withStatus("in_progress", "in_review");

if (inFlight.length > 0) {
  if (inFlight.length > 1) {
    console.warn(
      `warning: ${inFlight.length} tasks are in_progress/in_review at once (expected at most 1 under this repo's sequential execution model):`,
    );
  }
  console.log(c.bold("Continue:"));
  for (const t of inFlight) {
    console.log(row(t.status === "in_review" ? STATUS_TAGS.review : STATUS_TAGS.progress, t));
  }
  process.exit(0);
}

// Epic progress is computed from members' own status, never stored -- same
// no-drift rule as the rest of this script. Finished epics collapse into a count.
const epicRows = epicNames.map((name) => {
  const members = all.filter((t) => t.epic === name);
  const doneCount = members.filter((t) => t.status === "done").length;
  return { name, total: members.length, doneCount };
});
const openEpics = epicRows.filter((e) => e.doneCount < e.total);
const finishedEpics = epicRows.length - openEpics.length;

if (openEpics.length > 0) {
  section("Epics in progress:");
  for (const e of openEpics) {
    console.log(
      `  ${e.name.padEnd(epicWidth)}  ${e.doneCount}/${e.total} done  ${c.dim(`tasks/epics/${e.name}.md`)}`,
    );
  }
  if (finishedEpics > 0) console.log(c.dim(`  (+ ${finishedEpics} finished epics)`));
}

const ready = withStatus("approved").filter((t) =>
  t.depends_on.every((depId) => tasks.get(depId)?.status === "done"),
);

section(ready.length > 0 ? "Ready to start:" : "No ready tasks.");
for (const t of ready) {
  console.log(row(STATUS_TAGS.ready, t, `(depends_on: ${t.depends_on.join(", ") || "none"})`));
}

const blocked = withStatus("approved").filter((t) => !ready.includes(t));
if (blocked.length > 0) {
  section("Blocked (waiting on dependencies):");
  // A multi-task epic that's blocked becomes one line, listing only the
  // outside tasks it waits on -- otherwise a linear chain of N tasks prints N rows.
  const printed = new Set();
  for (const t of blocked) {
    if (printed.has(t.id)) continue;
    const group = t.epic ? blocked.filter((b) => b.epic === t.epic) : [t];
    group.forEach((g) => printed.add(g.id));
    const ids = new Set(group.map((g) => g.id));
    const waiting = [
      ...new Set(
        group.flatMap((g) =>
          g.depends_on.filter((d) => !ids.has(d) && tasks.get(d)?.status !== "done"),
        ),
      ),
    ];
    if (group.length === 1) {
      console.log(row(STATUS_TAGS.blocked, t, `waiting on: ${waiting.join(", ")}`));
    } else {
      const first = group[0].id;
      const last = group[group.length - 1].id;
      console.log(
        `  ${STATUS_TAGS.blocked} ${first}–${last}  ${c.dim(t.epic.padEnd(epicWidth))}  ${group.length} tasks chained` +
          c.dim(waiting.length > 0 ? `  waiting on: ${waiting.join(", ")}` : ""),
      );
    }
  }
}

const needsApproval = withStatus("proposed");
if (needsApproval.length > 0) {
  section("Needs approval:");
  for (const t of needsApproval) console.log(row(STATUS_TAGS.proposed, t));
}

const done = withStatus("done");
if (done.length > 0) {
  const shown = SHOW_ALL ? done : done.slice(-DONE_TAIL);
  section(
    SHOW_ALL
      ? `Done (${done.length}):`
      : `Done (${done.length}, latest ${shown.length}; --all for the rest):`,
  );
  for (const t of shown) console.log(row(STATUS_TAGS.done, t));
}
