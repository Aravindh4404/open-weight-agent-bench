#!/usr/bin/env node
// Extracts per-session token breakdown from OpenCode's own SQLite DB and
// writes opencode-usage-summary.csv, in the same shape as
// claude-usage-log.csv / pi-usage-summary.csv.
//
// Usage: node scripts/extract-opencode-usage.js
//
// WHY THIS EXISTS: run-matrix.sh recorded OpenCode as "MANUAL" because no
// reliable per-session `opencode stats` command existed, so only a hand-copied
// total ever reached comparison-results.csv. The breakdown was never actually
// lost — OpenCode's `session` table has had dedicated tokens_input /
// tokens_output / tokens_reasoning / tokens_cache_read / tokens_cache_write /
// cost columns all along. This reads them directly.
//
// TWO GOTCHAS, both load-bearing:
//
// 1. DB PATH. setup/token-measurement-methods.md says
//    ~/AppData/Roaming/opencode/opencode.db. That is WRONG on this machine —
//    the live DB is at ~/.local/share/opencode/opencode.db.
//
// 2. WAL. There is a multi-MB uncheckpointed write-ahead log alongside the DB.
//    Reading opencode.db alone silently returns stale data. We copy .db, .db-wal
//    and .db-shm together to a temp dir and read the copy — never the original,
//    so a running OpenCode can't be disturbed and we can't corrupt it.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_DIR = path.join(os.homedir(), ".local", "share", "opencode");
const DB_NAME = "opencode.db";
const TMP_DIR = path.join(os.tmpdir(), "opencode-usage-extract");
const OUT_PATH = path.join(__dirname, "..", "opencode-usage-summary.csv");

function copyDbWithWal() {
  const src = path.join(DB_DIR, DB_NAME);
  if (!fs.existsSync(src)) {
    console.error(`ERROR: no OpenCode DB at ${src}`);
    console.error("If OpenCode moved its storage, update DB_DIR in this script.");
    process.exit(1);
  }
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  // -wal and -shm are optional (absent if the DB was cleanly checkpointed),
  // but when present they MUST come along or the read is stale.
  for (const suffix of ["", "-wal", "-shm"]) {
    const from = path.join(DB_DIR, DB_NAME + suffix);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(TMP_DIR, DB_NAME + suffix));
  }
  return path.join(TMP_DIR, DB_NAME);
}

// session.model holds a JSON blob, not a plain string:
//   {"id":"z-ai/glm-5.2","providerID":"openrouter","variant":"default"}
function parseModel(raw) {
  if (!raw) return "unknown";
  try {
    return JSON.parse(raw).id ?? "unknown";
  } catch {
    return raw;
  }
}

// Turn an absolute run directory into the benchmark instance id:
//   .../tasks/xarray-4094/clean-opencode-sonnet -> xarray-4094
function instanceFromDirectory(dir) {
  const m = (dir ?? "").replace(/\\/g, "/").match(/\/tasks\/([^/]+)\//);
  return m ? m[1] : "";
}

const dbPath = copyDbWithWal();
const db = new DatabaseSync(dbPath);

const sessions = db
  .prepare(
    `SELECT id, directory, model, cost,
            tokens_input, tokens_output, tokens_reasoning,
            tokens_cache_read, tokens_cache_write, time_created
       FROM session
      ORDER BY time_created`,
  )
  .all();

const header =
  "session_id,model,instance_id,input_combined,fresh_input,output,reasoning,cache_read,cache_creation,total_tokens,cost,directory\n";
const rows = [];

for (const s of sessions) {
  const freshInput = s.tokens_input ?? 0;
  const cacheRead = s.tokens_cache_read ?? 0;
  const cacheWrite = s.tokens_cache_write ?? 0;
  const output = s.tokens_output ?? 0;

  // Same formula as the other two harnesses, so the columns are comparable.
  // NOTE: tokens_reasoning is reported as its own column and deliberately NOT
  // folded into total_tokens here — Claude Code and Pi have no equivalent
  // field, so including it would make the harnesses non-comparable. See the
  // reconciliation note in the header of build-full-results.js.
  const inputCombined = freshInput + cacheRead + cacheWrite;
  const totalTokens = inputCombined + output;

  rows.push(
    [
      s.id,
      parseModel(s.model),
      instanceFromDirectory(s.directory),
      inputCombined,
      freshInput,
      output,
      s.tokens_reasoning ?? 0,
      cacheRead,
      cacheWrite,
      totalTokens,
      (s.cost ?? 0).toFixed(4),
      (s.directory ?? "").replace(/,/g, ";"),
    ].join(","),
  );
}

db.close();
fs.rmSync(TMP_DIR, { recursive: true, force: true });

fs.writeFileSync(OUT_PATH, header + rows.join("\n") + (rows.length ? "\n" : ""));
console.log(`Read ${sessions.length} OpenCode session(s) -> ${OUT_PATH}`);
