#!/usr/bin/env node
// Reads pi-usage-log.csv (one row per TURN) and produces
// pi-usage-summary.csv (one row per SESSION), matching the same column
// format as claude-usage-log.csv — so all three harnesses can be
// compared side by side at the session level.
//
// Usage: node summarize-pi-usage.js

const fs = require("fs");
const path = require("path");

const INPUT_PATH = path.join(__dirname, "pi-usage-log.csv");
const OUTPUT_PATH = path.join(__dirname, "pi-usage-summary.csv");

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

const outHeader = "session_id,model,input_combined,output,cache_read,cache_creation,total_tokens\n";
const outRows = [];

for (const [sid, t] of Object.entries(sessions)) {
  // Same combined-input formula verified for Claude Code and confirmed
  // exact against OpenRouter for Pi too: fresh input + cache read (+
  // cache write, included on the same reasoning, not independently
  // verified since it's been 0 in every session checked so far).
  const inputCombined = t.input + t.cacheRead + t.cacheWrite;
  const totalTokens = inputCombined + t.output;
  outRows.push([sid, "z-ai/glm-5.2", inputCombined, t.output, t.cacheRead, t.cacheWrite, totalTokens].join(","));
}

fs.writeFileSync(OUTPUT_PATH, outHeader + outRows.join("\n") + (outRows.length ? "\n" : ""));
console.log(`Summarized ${rows.length} turn(s) into ${outRows.length} session row(s).`);
console.log(outHeader + outRows.join("\n"));
