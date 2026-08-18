#!/usr/bin/env node
// Per-lane token breakdown helper for run-matrix.sh.
//
//   node scripts/lane-usage.js snapshot <harness> <snapfile>
//     Refresh <harness>'s usage summary, then record the session ids that exist
//     RIGHT NOW into <snapfile>. Call immediately BEFORE running a lane.
//
//   node scripts/lane-usage.js diff <harness> <snapfile>
//     Refresh again, diff against <snapfile>, and print the breakdown of the
//     session(s) that appeared since, as:
//       input_combined,fresh_input,output,cache_read,cache_creation,reasoning,total_tokens,session_id
//     Prints ",,,,,,," (all-empty) if nothing new appeared, so the caller still
//     gets a well-formed row rather than a silently short one.
//
// WHY SNAPSHOT/DIFF RATHER THAN `tail -n +N`
// The old run-matrix.sh counted lines before and after. That is fragile here:
// claude-usage-log.csv is REWRITTEN WHOLE by the OTLP receiver on every payload
// (not appended to), and pi-usage-summary.csv / opencode-usage-summary.csv are
// fully regenerated each time. Line counts also can't tell a new session from a
// resumed one. Diffing session ids is exact.
//
// If more than one new session appears (e.g. the harness internally spawned a
// second session, or a lane was retried), their token counts are SUMMED and the
// session_id field lists all of them joined by "|" — nothing is dropped.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// How to refresh each harness's summary, and where the result lands.
const HARNESS = {
  claude: { refresh: ["scripts/rebuild-usage-csv.js"], file: "claude-usage-log-rebuilt.csv" },
  pi: { refresh: ["summarize-pi-usage.js"], file: "pi-usage-summary.csv" },
  opencode: { refresh: ["scripts/extract-opencode-usage.js"], file: "opencode-usage-summary.csv" },
};

const [mode, harness, snapFile] = process.argv.slice(2);
if (!["snapshot", "diff"].includes(mode) || !HARNESS[harness] || !snapFile) {
  console.error("usage: lane-usage.js <snapshot|diff> <claude|pi|opencode> <snapfile>");
  process.exit(2);
}

function refresh() {
  for (const script of HARNESS[harness].refresh) {
    try {
      execFileSync(process.execPath, [path.join(ROOT, script)], { stdio: "pipe" });
    } catch (err) {
      // A refresh failure must not kill the matrix run — the lane still
      // completed, we just can't read its tokens. Warn and carry on.
      console.error(`WARNING: ${script} failed: ${err.message.split("\n")[0]}`);
    }
  }
}

function readRows() {
  const full = path.join(ROOT, HARNESS[harness].file);
  if (!fs.existsSync(full)) return [];
  const lines = fs.readFileSync(full, "utf8").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cols[i]]));
  });
}

refresh();
const rows = readRows();

if (mode === "snapshot") {
  fs.writeFileSync(snapFile, rows.map((r) => r.session_id).join("\n") + "\n");
  process.exit(0);
}

const seen = new Set(
  fs.existsSync(snapFile)
    ? fs.readFileSync(snapFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean)
    : [],
);
const fresh = rows.filter((r) => r.session_id && !seen.has(r.session_id));

if (!fresh.length) {
  console.log(",,,,,,,");
  process.exit(0);
}

const num = (v) => Number(v) || 0;
const sum = (key) => fresh.reduce((acc, r) => acc + num(r[key]), 0);

const inputCombined = sum("input_combined");
const cacheRead = sum("cache_read");
const cacheCreation = sum("cache_creation");
const output = sum("output");
// reasoning exists only in the OpenCode summary; blank elsewhere by design.
const reasoning = fresh.some((r) => r.reasoning !== undefined) ? sum("reasoning") : "";

console.log(
  [
    inputCombined,
    inputCombined - cacheRead - cacheCreation,
    output,
    cacheRead,
    cacheCreation,
    reasoning,
    inputCombined + output,
    fresh.map((r) => r.session_id).join("|"),
  ].join(","),
);
