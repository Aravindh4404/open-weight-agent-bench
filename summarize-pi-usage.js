#!/usr/bin/env node
// Reads pi-usage-log.csv (one row per TURN) and produces
// pi-usage-summary.csv (one row per SESSION), matching the same column
// format as claude-usage-log.csv — so all three harnesses can be
// compared side by side at the session level.
//
// Usage: node summarize-pi-usage.js

const fs = require("fs");
const os = require("os");
const path = require("path");

const INPUT_PATH = path.join(__dirname, "pi-usage-log.csv");
const OUTPUT_PATH = path.join(__dirname, "pi-usage-summary.csv");
const PI_SESSIONS_DIR = path.join(os.homedir(), ".pi", "agent", "sessions");

// pi-usage-log.csv carries no model column — the token-logger extension
// never recorded one. Pi's own session transcripts do: every assistant
// message embeds the model id, and a mid-session /model switch shows up
// as a `model_change` record. So read the model from there and take the
// majority across the session's messages.
//
// Transcript layout:
//   ~/.pi/agent/sessions/--<slugified-cwd>--/<timestamp>_<session_id>.jsonl
// The directory slug also gives us the run's working directory, which is
// what ties a session to a benchmark instance — kept as a column so the
// full-results join doesn't have to guess from token totals.
function scanPiSessions() {
  const map = {};
  let dirs;
  try {
    dirs = fs.readdirSync(PI_SESSIONS_DIR, { withFileTypes: true });
  } catch {
    console.warn(`WARNING: ${PI_SESSIONS_DIR} not readable — every row will be model=unknown.`);
    return map;
  }

  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const dirPath = path.join(PI_SESSIONS_DIR, dirent.name);
    const slug = dirent.name.replace(/^-+|-+$/g, "");

    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith(".jsonl")) continue;
      const sid = file.replace(/\.jsonl$/, "").split("_").pop();
      const counts = {};

      for (const line of fs.readFileSync(path.join(dirPath, file), "utf8").split("\n")) {
        if (!line.trim()) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue; // partial final line on an interrupted run
        }
        // `model` appears at varying depths depending on record type
        (function walk(node) {
          if (Array.isArray(node)) return node.forEach(walk);
          if (node && typeof node === "object") {
            for (const [k, v] of Object.entries(node)) {
              if (k === "model" && typeof v === "string") counts[v] = (counts[v] ?? 0) + 1;
              else walk(v);
            }
          }
        })(obj);
      }

      const model = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (model) map[sid] = { model, directory: slug };
    }
  }
  return map;
}

const lines = fs.readFileSync(INPUT_PATH, "utf8").split("\n").filter((l) => l.trim());
const header = lines[0].split(",");
const rows = lines.slice(1).map((line) => {
  const cols = line.split(",");
  const obj = {};
  header.forEach((col, i) => (obj[col] = cols[i]));
  return obj;
});

const sessions = {};

for (const row of rows) {
  const sid = row.session_id;
  if (!sessions[sid]) {
    sessions[sid] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }
  sessions[sid].input += Number(row.input) || 0;
  sessions[sid].output += Number(row.output) || 0;
  sessions[sid].cacheRead += Number(row.cache_read) || 0;
  sessions[sid].cacheWrite += Number(row.cache_write) || 0;
}

const sessionMeta = scanPiSessions();

const outHeader =
  "session_id,model,input_combined,output,cache_read,cache_creation,total_tokens,directory\n";
const outRows = [];
let unknownModels = 0;

for (const [sid, t] of Object.entries(sessions)) {
  // Same combined-input formula verified for Claude Code and confirmed
  // exact against OpenRouter for Pi too: fresh input + cache read (+
  // cache write, included on the same reasoning, not independently
  // verified since it's been 0 in every session checked so far).
  const inputCombined = t.input + t.cacheRead + t.cacheWrite;
  const totalTokens = inputCombined + t.output;
  const meta = sessionMeta[sid];
  if (!meta) unknownModels++;
  outRows.push(
    [
      sid,
      meta?.model ?? "unknown",
      inputCombined,
      t.output,
      t.cacheRead,
      t.cacheWrite,
      totalTokens,
      meta?.directory ?? "",
    ].join(","),
  );
}

fs.writeFileSync(OUTPUT_PATH, outHeader + outRows.join("\n") + (outRows.length ? "\n" : ""));
console.log(`Summarized ${rows.length} turn(s) into ${outRows.length} session row(s).`);
if (unknownModels) {
  console.warn(`WARNING: ${unknownModels} session(s) had no matching transcript — model=unknown.`);
}
console.log(outHeader + outRows.join("\n"));
