#!/usr/bin/env node
// Joins the three harnesses' per-session token breakdowns onto the 30 rows of
// comparison-results.csv, producing comparison-results-full.csv.
//
// Usage: node scripts/build-full-results.js
//
// Inputs (regenerate these first if stale):
//   claude-usage-log-rebuilt.csv   <- node scripts/rebuild-usage-csv.js
//   pi-usage-summary.csv           <- node summarize-pi-usage.js
//   opencode-usage-summary.csv     <- node scripts/extract-opencode-usage.js
//   comparison-results.csv         <- authoritative totals + pass/fail
//
// HOW A LANE IS MATCHED TO A SESSION
// comparison-results.csv has no session_id, so the join is:
//   1. Narrow to sessions whose working directory belongs to that instance and
//      whose model matches the lane. Directory comes from the harness's own
//      on-disk layout (~/.claude/projects/<slug>/, ~/.pi/agent/sessions/<slug>/,
//      session.directory in opencode.db) — never inferred from token counts.
//   2. Within that pool, prefer the session whose reconstructed total EXACTLY
//      equals the trusted total in comparison-results.csv. Several lane dirs
//      hold extra sessions (later debugging runs, aborted starts), so an exact
//      total match is what identifies the real benchmark run.
//   3. If nothing matches exactly, fall back to the largest session in the pool
//      and record the delta rather than pretending it matched.
//
// TRUST MODEL: total_tokens is copied verbatim from comparison-results.csv and
// never recomputed — those numbers were verified against OpenRouter and are the
// canonical record. The reconstructed figure is reported separately as
// breakdown_total, with total_delta = breakdown_total - total_tokens. A nonzero
// delta means "the breakdown covers a different scope", not "the total is wrong".
//
// KNOWN NONZERO DELTAS (OpenCode, all 10 lanes, expected):
// OpenCode's session counters exclude two things the OpenRouter-sourced totals
// include: (a) tokens_reasoning, and (b) a per-session title-generation call.
// After subtracting reasoning, the residual is near-identical across both models
// of the same instance and scales with prompt length (flask 591/592 ... django
// 787/784), which is the signature of that title call. Reported, not silently
// absorbed.
//
// REASONING TOKENS: OpenCode reports tokens_reasoning; Claude Code and Pi have
// no equivalent field. The column is emitted for all rows but is only ever
// populated for OpenCode — it is NOT part of total_tokens for any harness.

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "comparison-results-full.csv");
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

function readCsv(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    console.error(`ERROR: missing ${file} — see the input list at the top of this script.`);
    process.exit(1);
  }
  const lines = fs.readFileSync(full, "utf8").split("\n").filter((l) => l.trim());
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cols[i]]));
  });
}

const num = (v) => Number(v) || 0;

// Lane model names in comparison-results.csv are short ("glm"/"sonnet");
// harness logs use full ids. Match on family, not exact string, since the three
// harnesses spell the same model differently (claude-sonnet-5 vs
// anthropic/claude-sonnet-5).
function modelFamily(model) {
  const m = (model ?? "").toLowerCase();
  if (m.includes("glm")) return "glm";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("opus")) return "opus";
  if (m.includes("haiku")) return "haiku";
  return m || "unknown";
}

function instanceFromSlug(slug) {
  const m = (slug ?? "").match(/tasks-(.+?)-clean/);
  return m ? m[1] : "";
}

// ---- Claude: rebuilt OTLP rows + session->directory from ~/.claude/projects
function claudeCandidates() {
  const sessionDirs = {};
  if (fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    for (const dirent of fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const dirPath = path.join(CLAUDE_PROJECTS_DIR, dirent.name);
      for (const file of fs.readdirSync(dirPath)) {
        if (file.endsWith(".jsonl")) sessionDirs[file.replace(/\.jsonl$/, "")] = dirent.name;
      }
    }
  }
  return readCsv("claude-usage-log-rebuilt.csv").map((r) => ({
    session_id: r.session_id,
    model: r.model,
    instance_id: instanceFromSlug(sessionDirs[r.session_id]),
    input_combined: num(r.input_combined),
    output: num(r.output),
    cache_read: num(r.cache_read),
    cache_creation: num(r.cache_creation),
    reasoning: "",
    total: num(r.total_tokens),
  }));
}

function piCandidates() {
  return readCsv("pi-usage-summary.csv").map((r) => ({
    session_id: r.session_id,
    model: r.model,
    instance_id: instanceFromSlug(r.directory),
    input_combined: num(r.input_combined),
    output: num(r.output),
    cache_read: num(r.cache_read),
    cache_creation: num(r.cache_creation),
    reasoning: "",
    total: num(r.total_tokens),
  }));
}

function opencodeCandidates() {
  return readCsv("opencode-usage-summary.csv").map((r) => ({
    session_id: r.session_id,
    model: r.model,
    instance_id: r.instance_id,
    input_combined: num(r.input_combined),
    output: num(r.output),
    cache_read: num(r.cache_read),
    cache_creation: num(r.cache_creation),
    reasoning: num(r.reasoning),
    total: num(r.total_tokens),
  }));
}

const pools = {
  claude: claudeCandidates(),
  pi: piCandidates(),
  opencode: opencodeCandidates(),
};

const lanes = readCsv("comparison-results.csv");
const header =
  "instance_id,harness,model,elapsed_real_seconds,input_combined,fresh_input,output," +
  "cache_read,cache_creation,total_tokens,pass_fail,verification_method," +
  "reasoning,breakdown_total,total_delta,match_quality,session_id\n";

const outRows = [];
const report = [];

for (const lane of lanes) {
  const trustedTotal = num(lane.total_tokens);
  const pool = (pools[lane.harness] ?? []).filter(
    (c) => c.instance_id === lane.instance_id && modelFamily(c.model) === modelFamily(lane.model),
  );

  const exact = pool.filter((c) => c.total === trustedTotal);
  let pick = null;
  let quality = "no_candidate";

  if (exact.length === 1) {
    pick = exact[0];
    quality = "exact";
  } else if (exact.length > 1) {
    pick = exact[0];
    quality = "exact_ambiguous"; // identical totals in one dir — flagged, not hidden
  } else if (pool.length) {
    pick = pool.reduce((a, b) => (b.total > a.total ? b : a));
    quality = "largest_in_lane";
  }

  const fresh = pick ? pick.input_combined - pick.cache_read - pick.cache_creation : "";
  const delta = pick ? pick.total - trustedTotal : "";

  outRows.push(
    [
      lane.instance_id,
      lane.harness,
      lane.model,
      lane.elapsed_real_seconds ?? "",
      pick ? pick.input_combined : "",
      fresh,
      pick ? pick.output : "",
      pick ? pick.cache_read : "",
      pick ? pick.cache_creation : "",
      trustedTotal, // never recomputed — see TRUST MODEL above
      lane.pass_fail ?? "",
      lane.verification_method ?? "",
      pick ? pick.reasoning : "",
      pick ? pick.total : "",
      delta,
      quality,
      pick ? pick.session_id : "",
    ].join(","),
  );

  report.push({ lane: `${lane.instance_id}/${lane.harness}/${lane.model}`, quality, delta });
}

fs.writeFileSync(OUT_PATH, header + outRows.join("\n") + (outRows.length ? "\n" : ""));

const byQuality = report.reduce((acc, r) => ((acc[r.quality] = (acc[r.quality] ?? 0) + 1), acc), {});
console.log(`Wrote ${outRows.length} rows to comparison-results-full.csv`);
console.log("Match quality:", byQuality);

const noBreakdown = report.filter((r) => r.quality === "no_candidate");
if (noBreakdown.length) {
  console.log(`\nTotal-only (no breakdown recovered): ${noBreakdown.length}`);
  for (const r of noBreakdown) console.log(`  ${r.lane}`);
}
const mismatched = report.filter((r) => r.quality !== "no_candidate" && r.delta !== 0);
if (mismatched.length) {
  console.log(`\nNonzero total_delta (breakdown scope differs from trusted total): ${mismatched.length}`);
  for (const r of mismatched) console.log(`  ${r.lane}: ${r.delta > 0 ? "+" : ""}${r.delta}`);
}
