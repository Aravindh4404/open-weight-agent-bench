#!/usr/bin/env node
/**
 * OTLP receiver with configurable storage.
 *
 * Receives OTLP metrics from Claude Code and stores them
 * using your choice of storage strategy (CSV, JSONL, SQLite, custom).
 *
 * Usage:
 *   node otlp-receiver-with-storage.js
 *
 * Configuration:
 *   Set OTLP_STORAGE env var to one of: csv, jsonl, database, or custom
 *   Default: csv
 *
 * Example:
 *   OTLP_STORAGE=csv node otlp-receiver-with-storage.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const storage = require("./otlp-storage");

const PORT = 4318;
const RAW_LOG = path.join(__dirname, "otlp-raw-payloads.jsonl");
const STORAGE_TYPE = process.env.OTLP_STORAGE || "csv";

// Extract a value from OTLP attribute
function getAttr(attributes, key) {
  if (!attributes) return undefined;
  const found = attributes.find((a) => a.key === key);
  if (!found) return undefined;
  const v = found.value;
  return v?.stringValue ?? v?.intValue ?? v?.doubleValue;
}

// Extract token data from an OTLP metric
function extractTokenData(payload) {
  const sessions = {};

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

          if (!sessionId) continue;

          if (!sessions[sessionId]) {
            sessions[sessionId] = {
              session_id: sessionId,
              model: model || "unknown",
              timestamp: new Date().toISOString(),
              metrics: {},
            };
          }

          const key = `${querySource}:${tokenType}`;
          sessions[sessionId].metrics[key] = value;
        }
      }
    }
  }

  return sessions;
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
      const payload = JSON.parse(body);

      // Save raw payload
      fs.appendFileSync(RAW_LOG, body + "\n");

      // Extract token data
      const sessions = extractTokenData(payload);

      if (Object.keys(sessions).length === 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "No claude_code.token.usage metrics found" }));
        return;
      }

      // Store using chosen strategy
      console.log(`\n[${new Date().toISOString()}] Processing OTLP metrics...`);
      for (const [sessionId, data] of Object.entries(sessions)) {
        console.log(`  Session: ${sessionId}`);
        console.log(`  Model: ${data.model}`);
        console.log(`  Metrics: ${JSON.stringify(data.metrics)}`);
      }

      try {
        if (STORAGE_TYPE === "csv") storage.csv(sessions);
        else if (STORAGE_TYPE === "jsonl") storage.jsonl(sessions);
        else if (STORAGE_TYPE === "database") storage.database(sessions);
        else if (STORAGE_TYPE === "custom") {
          storage.custom(sessions, (data) => {
            console.log("Custom handler received:", data);
          });
        } else {
          throw new Error(`Unknown storage type: ${STORAGE_TYPE}`);
        }
      } catch (storageErr) {
        console.error("Storage error:", storageErr.message);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, sessions: Object.keys(sessions) }));
    } catch (err) {
      console.error("Error processing payload:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log("\n" + "=".repeat(70));
  console.log(`OTLP Receiver listening on http://localhost:${PORT}`);
  console.log(`Storage type: ${STORAGE_TYPE}`);
  console.log("=".repeat(70));
  console.log("\nTo test:");
  console.log("  export CLAUDE_CODE_ENABLE_TELEMETRY=1");
  console.log("  export OTEL_METRICS_EXPORTER=otlp");
  console.log("  export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318");
  console.log("  claude");
  console.log("\nTo change storage:");
  console.log("  OTLP_STORAGE=jsonl node otlp-receiver-with-storage.js");
  console.log("  OTLP_STORAGE=database node otlp-receiver-with-storage.js");
  console.log(`\nRaw payloads logged to: ${RAW_LOG}\n`);
});
