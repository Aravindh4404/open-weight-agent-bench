#!/usr/bin/env node
/**
 * Flexible OTLP receiver for Claude Code telemetry.
 *
 * Receives OTLP metrics, decodes them, pretty-prints what you get,
 * and lets you decide what to do with it.
 *
 * Usage:
 *   node otlp-receiver-flexible.js
 *
 * Then in another terminal:
 *   export CLAUDE_CODE_ENABLE_TELEMETRY=1
 *   export OTEL_METRICS_EXPORTER=otlp
 *   export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 *   claude
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4318;
const RAW_LOG = path.join(__dirname, "otlp-raw-payloads.jsonl");

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
        // We only care about claude_code.token.usage
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

          // Store by query_source and token type for flexible aggregation
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

      // Save raw payload for inspection
      fs.appendFileSync(RAW_LOG, body + "\n");

      // Extract token data
      const sessions = extractTokenData(payload);

      // Pretty-print what we got
      console.log("\n" + "=".repeat(70));
      console.log(`[${new Date().toISOString()}] Received OTLP metrics`);
      console.log("=".repeat(70));

      for (const [sessionId, data] of Object.entries(sessions)) {
        console.log(`\nSession: ${sessionId}`);
        console.log(`Model:   ${data.model}`);
        console.log(`Metrics:`);
        for (const [key, value] of Object.entries(data.metrics)) {
          console.log(`  ${key}: ${value}`);
        }
      }

      console.log("\n" + "=".repeat(70));
      console.log(`Sessions received so far: ${sessionId ? 1 : 0}`);
      console.log(`Raw payload saved to: ${RAW_LOG}`);
      console.log("=".repeat(70) + "\n");

      // Send OK response
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
  console.log("=".repeat(70));
  console.log("\nTo test:");
  console.log("  export CLAUDE_CODE_ENABLE_TELEMETRY=1");
  console.log("  export OTEL_METRICS_EXPORTER=otlp");
  console.log("  export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318");
  console.log("  claude");
  console.log("\nWatch this terminal for incoming metrics.");
  console.log(`Raw payloads logged to: ${RAW_LOG}\n`);
});
