#!/usr/bin/env node
// Receives Claude Code's OTLP metrics over HTTP and keeps
// claude-usage-log.csv continuously up to date — no manual copy/paste,
// no stdout/stderr interference with Claude Code's interactivity.
//
// Usage:
//   node otlp-receiver.js
// Then in another terminal, point Claude Code at it:
//   export OTEL_METRICS_EXPORTER=otlp
//   export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
//   claude
//
// The CSV rewrites itself after every payload received — check it any
// time, even mid-session.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4318;
const CSV_PATH = path.join(__dirname, "claude-usage-log.csv");
const RAW_LOG_PATH = path.join(__dirname, "claude-otlp-raw.jsonl");

// sessionId -> querySource -> tokenType -> value (max, since these are
// cumulative counters that may be re-sent with updated totals)
const data = {};
const sessionModels = {};

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

          if (model && !sessionModels[sessionId]) sessionModels[sessionId] = model;

          // IMPORTANT: Claude Code's OTLP metrics use DELTA aggregation
          // temporality (aggregationTemporality: 1), meaning each exported
          // dataPoint is only the INCREMENT since the last flush, not a
          // running total. Multiple flushes happen per session (e.g. one
          // per turn). These must be SUMMED, not compared-and-kept-larger
          // (verified by hand against a real 2-flush session: summing gave
          // the correct total, taking max silently undercounted by ~41%).
          if (!data[sessionId]) data[sessionId] = {};
          if (!data[sessionId][querySource]) data[sessionId][querySource] = {};
          const prev = data[sessionId][querySource][tokenType] ?? 0;
          data[sessionId][querySource][tokenType] = prev + value;
        }
      }
    }
  }
}

function rewriteCsv() {
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

  fs.writeFileSync(CSV_PATH, header + rows.join("\n") + (rows.length ? "\n" : ""));
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      fs.appendFileSync(RAW_LOG_PATH, body + "\n");
      const payload = JSON.parse(body);
      processMetricsPayload(payload);
      rewriteCsv();
      console.log(`[${new Date().toISOString()}] Updated CSV — ${Object.keys(data).length} session(s) tracked.`);
    } catch (err) {
      console.error("Failed to process payload:", err.message);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  });
});

server.listen(PORT, () => {
  console.log(`OTLP receiver listening on :${PORT}`);
  console.log(`CSV auto-updates at: ${CSV_PATH}`);
  console.log(`Raw payloads logged to: ${RAW_LOG_PATH}`);
});
