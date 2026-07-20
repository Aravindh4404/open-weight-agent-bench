#!/usr/bin/env node
// Re-processes an existing claude-otlp-raw.jsonl file (each line is one
// raw OTLP payload) through the corrected delta-summing logic, rebuilding
// claude-usage-log.csv without needing to re-run Claude Code.
//
// Usage: node replay-otlp-log.js

const fs = require("fs");
const path = require("path");

const RAW_LOG_PATH = path.join(__dirname, "claude-otlp-raw.jsonl");
const CSV_PATH = path.join(__dirname, "claude-usage-log.csv");

const data = {};
const sessionModels = {};

function getAttr(attributes, key) {
  const found = attributes?.find((a) => a.key === key);
  if (!found) return undefined;
  const v = found.value;
  return v?.stringValue ?? v?.intValue ?? v?.doubleValue;
}

const lines = fs.readFileSync(RAW_LOG_PATH, "utf8").split("\n").filter((l) => l.trim());

for (const line of lines) {
  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    continue; // skip malformed/non-JSON lines (e.g. the earlier PowerShell test payload)
  }

  for (const rm of payload.resourceMetrics ?? []) {
    for (const sm of rm.scopeMetrics ?? []) {
      for (const metric of sm.metrics ?? []) {
        if (metric.name !== "claude_code.token.usage") continue;
        for (const dp of metric.sum?.dataPoints ?? []) {
          const attrs = dp.attributes ?? [];
          const sessionId = getAttr(attrs, "session.id");
          const querySource = getAttr(attrs, "query_source");
          const tokenType = getAttr(attrs, "type");
          const model = getAttr(attrs, "model");
          const value = dp.asInt !== undefined ? Number(dp.asInt) : dp.asDouble;

          if (!sessionId || !querySource || !tokenType || value === undefined) continue;
          if (model && !sessionModels[sessionId]) sessionModels[sessionId] = model;

          if (!data[sessionId]) data[sessionId] = {};
          if (!data[sessionId][querySource]) data[sessionId][querySource] = {};
          const prev = data[sessionId][querySource][tokenType] ?? 0;
          data[sessionId][querySource][tokenType] = prev + value; // SUM, not max
        }
      }
    }
  }
}

const header = "session_id,model,input_combined,output,cache_read,cache_creation,total_tokens\n";
const rows = [];

for (const [sessionId, sources] of Object.entries(data)) {
  let totalFreshInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0;
  for (const types of Object.values(sources)) {
    totalFreshInput += types.input ?? 0;
    totalOutput += types.output ?? 0;
    totalCacheRead += types.cacheRead ?? 0;
    totalCacheCreation += types.cacheCreation ?? 0;
  }
  const inputCombined = totalFreshInput + totalCacheRead + totalCacheCreation;
  const totalTokens = inputCombined + totalOutput;
  const model = sessionModels[sessionId] ?? "unknown";
  rows.push([sessionId, model, inputCombined, totalOutput, totalCacheRead, totalCacheCreation, totalTokens].join(","));
}

fs.writeFileSync(CSV_PATH, header + rows.join("\n") + (rows.length ? "\n" : ""));
console.log(`Reprocessed ${lines.length} raw payload(s), wrote ${rows.length} corrected session row(s).`);
console.log(header + rows.join("\n"));
