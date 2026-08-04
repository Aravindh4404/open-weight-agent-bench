#!/usr/bin/env node
// One-off/offline re-aggregation of claude-otlp-raw.jsonl using the same
// (corrected) logic as claude-otlp-receiver.js. Use this any time the live
// receiver's in-memory state is suspected stale/wrong, without restarting
// the live process and losing its in-memory tracking.
const fs = require("fs");
const path = require("path");

const RAW_LOG_PATH = path.join(__dirname, "..", "claude-otlp-raw.jsonl");
const OUT_CSV_PATH = path.join(__dirname, "..", "claude-usage-log-rebuilt.csv");

const data = {};
const sessionModelTokens = {};

function getAttr(attributes, key) {
  const found = attributes?.find((a) => a.key === key);
  if (!found) return undefined;
  const v = found.value;
  return v?.stringValue ?? v?.intValue ?? v?.doubleValue;
}

function processMetricsPayload(payload) {
  const resourceMetrics = payload.resourceMetrics ?? [];
  for (const rm of resourceMetrics) {
    for (const sm of rm.scopeMetrics ?? []) {
      for (const metric of sm.metrics ?? []) {
        if (metric.name !== "claude_code.token.usage") continue;
        const dataPoints = metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? [];
        for (const dp of dataPoints) {
          const attrs = dp.attributes ?? [];
          const sessionId = getAttr(attrs, "session.id");
          const querySource = getAttr(attrs, "query_source");
          const tokenType = getAttr(attrs, "type");
          const model = getAttr(attrs, "model");
          const value = dp.asInt !== undefined ? Number(dp.asInt) : dp.asDouble;

          if (!sessionId || !querySource || !tokenType || value === undefined) continue;

          if (model) {
            if (!sessionModelTokens[sessionId]) sessionModelTokens[sessionId] = {};
            sessionModelTokens[sessionId][model] = (sessionModelTokens[sessionId][model] ?? 0) + value;
          }

          if (!data[sessionId]) data[sessionId] = {};
          if (!data[sessionId][querySource]) data[sessionId][querySource] = {};
          const prev = data[sessionId][querySource][tokenType] ?? 0;
          data[sessionId][querySource][tokenType] = prev + value;
        }
      }
    }
  }
}

const lines = fs.readFileSync(RAW_LOG_PATH, "utf-8").split("\n").filter(Boolean);
for (const line of lines) {
  try {
    processMetricsPayload(JSON.parse(line));
  } catch (err) {
    console.error("Skipping unparseable line:", err.message);
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
  const modelTokens = sessionModelTokens[sessionId] ?? {};
  const model = Object.entries(modelTokens).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  rows.push([sessionId, model, inputCombined, totalOutput, totalCacheRead, totalCacheCreation, totalTokens].join(","));
}

fs.writeFileSync(OUT_CSV_PATH, header + rows.join("\n") + (rows.length ? "\n" : ""));
console.log(`Wrote ${rows.length} rows to ${OUT_CSV_PATH}`);
