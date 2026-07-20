#!/usr/bin/env node
const fs = require("fs");

const logPath = process.argv[2];
const csvPath = process.argv[3] || "claude-usage-log.csv";

if (!logPath) {
  console.error("Usage: node parse-cc-tokens.js <log-file> [output-csv]");
  process.exit(1);
}

const text = fs.readFileSync(logPath, "utf8");

// Match one self-contained dataPoint object at a time: attributes block,
// followed by startTime/endTime, followed by its own value. This prevents
// matching across separate entries (the bug in v1).
// [^{]*? between the attributes' closing brace and "value:" ensures we
// never cross into the NEXT entry's "attributes: {" — safe because nothing
// else in a dataPoint object (startTime/endTime arrays use [ ], not { })
// introduces a "{" before that entry's own value.
const entryRegex =
  /attributes:\s*\{([^{}]*)\}[^{]*?value:\s*([\d.]+)/g;

const data = {};
const sessionModels = {}; // sessionId -> model name
let matchCount = 0;
let skippedCount = 0;

let match;
while ((match = entryRegex.exec(text)) !== null) {
  const [, attrsText, valueStr] = match;

  const sessionIdMatch = /"session\.id":\s*"([^"]+)"/.exec(attrsText);
  const querySourceMatch = /query_source:\s*"([^"]+)"/.exec(attrsText);
  const typeMatch = /type:\s*"([^"]+)"/.exec(attrsText);
  const modelMatch = /model:\s*"([^"]+)"/.exec(attrsText);

  // Skip entries that aren't token.usage data points (e.g. session.count,
  // active_time.total, cost.usage) — they lack either query_source or
  // this specific "type" field (input/output/cacheRead/cacheCreation).
  if (!sessionIdMatch || !querySourceMatch || !typeMatch) {
    skippedCount++;
    continue;
  }

  const sessionId = sessionIdMatch[1];
  const querySource = querySourceMatch[1];
  const tokenType = typeMatch[1];
  const value = parseFloat(valueStr);

  const validTypes = ["input", "output", "cacheRead", "cacheCreation"];
  if (!validTypes.includes(tokenType)) {
    skippedCount++;
    continue;
  }

  if (modelMatch && !sessionModels[sessionId]) {
    sessionModels[sessionId] = modelMatch[1];
  }

  if (!data[sessionId]) data[sessionId] = {};
  if (!data[sessionId][querySource]) data[sessionId][querySource] = {};
  const prev = data[sessionId][querySource][tokenType] ?? 0;
  data[sessionId][querySource][tokenType] = Math.max(prev, value);
  matchCount++;
}

const header = "session_id,model,input_combined,output,cache_read,cache_creation,total_tokens\n";
const rows = [];

for (const [sessionId, sources] of Object.entries(data)) {
  let totalFreshInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;

  for (const types of Object.values(sources)) {
    totalFreshInput += types.input ?? 0;
    totalOutput += types.output ?? 0;
    totalCacheRead += types.cacheRead ?? 0;
    totalCacheCreation += types.cacheCreation ?? 0;
  }

  const inputCombined = totalFreshInput + totalCacheRead + totalCacheCreation;
  const totalTokens = inputCombined + totalOutput;
  const model = sessionModels[sessionId] ?? "unknown";

  rows.push(
    [sessionId, model, inputCombined, totalOutput, totalCacheRead, totalCacheCreation, totalTokens].join(","),
  );
}

const csvContent = header + rows.join("\n") + "\n";
fs.writeFileSync(csvPath, csvContent);

console.log(`Matched ${matchCount} token entries, skipped ${skippedCount} non-token entries.`);
console.log(`Wrote ${rows.length} session row(s) to ${csvPath}`);
console.log(csvContent);
