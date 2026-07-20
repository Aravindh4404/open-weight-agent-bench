/**
 * Storage strategies for OTLP telemetry data.
 *
 * Pick one, or mix and match. Each strategy:
 * - Takes extracted token data from the receiver
 * - Stores it however you want (CSV, JSON, database, etc.)
 *
 * Usage in otlp-receiver-flexible.js:
 *   const storage = require('./otlp-storage');
 *   // After extractTokenData():
 *   storage.csv(sessions);        // or
 *   storage.jsonl(sessions);      // or
 *   storage.database(sessions);   // or custom...
 */

const fs = require("fs");
const path = require("path");

// ============================================================================
// CSV STORAGE: Aggregate tokens per session, one row per line
// ============================================================================
const csv = (sessions) => {
  const CSV_FILE = path.join(__dirname, "claude-usage-log-otlp.csv");

  // Initialize header if file doesn't exist
  if (!fs.existsSync(CSV_FILE)) {
    const header =
      "session_id,model,timestamp,input,output,cache_read,cache_creation,total\n";
    fs.writeFileSync(CSV_FILE, header);
  }

  // Aggregate metrics by session
  for (const [sessionId, data] of Object.entries(sessions)) {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheCreation = 0;

    // Sum across query sources (main + auxiliary)
    for (const [key, value] of Object.entries(data.metrics)) {
      const [source, type] = key.split(":");
      if (type === "input") totalInput += value;
      if (type === "output") totalOutput += value;
      if (type === "cacheRead") totalCacheRead += value;
      if (type === "cacheCreation") totalCacheCreation += value;
    }

    const total = totalInput + totalOutput;
    const row = `${sessionId},${data.model},${data.timestamp},${totalInput},${totalOutput},${totalCacheRead},${totalCacheCreation},${total}\n`;
    fs.appendFileSync(CSV_FILE, row);
  }

  console.log(`✓ Stored in CSV: ${CSV_FILE}`);
};

// ============================================================================
// JSONL STORAGE: One JSON object per session, one object per line
// ============================================================================
const jsonl = (sessions) => {
  const JSONL_FILE = path.join(__dirname, "claude-usage-log-otlp.jsonl");

  for (const [sessionId, data] of Object.entries(sessions)) {
    // Aggregate into flat structure
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheCreation = 0;

    for (const [key, value] of Object.entries(data.metrics)) {
      const [source, type] = key.split(":");
      if (type === "input") totalInput += value;
      if (type === "output") totalOutput += value;
      if (type === "cacheRead") totalCacheRead += value;
      if (type === "cacheCreation") totalCacheCreation += value;
    }

    const row = JSON.stringify({
      session_id: sessionId,
      model: data.model,
      timestamp: data.timestamp,
      input_tokens: totalInput,
      output_tokens: totalOutput,
      cache_read_tokens: totalCacheRead,
      cache_creation_tokens: totalCacheCreation,
      total_tokens: totalInput + totalOutput,
      raw_metrics: data.metrics,
    });

    fs.appendFileSync(JSONL_FILE, row + "\n");
  }

  console.log(`✓ Stored in JSONL: ${JSONL_FILE}`);
};

// ============================================================================
// DATABASE STORAGE: SQLite (example — adapt to your DB)
// ============================================================================
const database = (sessions) => {
  // Install first: npm install better-sqlite3
  try {
    const Database = require("better-sqlite3");
    const db = new Database(path.join(__dirname, "claude-telemetry.db"));

    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        model TEXT,
        timestamp TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_read_tokens INTEGER,
        cache_creation_tokens INTEGER,
        total_tokens INTEGER,
        raw_metrics TEXT
      )
    `);

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sessions
      (session_id, model, timestamp, input_tokens, output_tokens,
       cache_read_tokens, cache_creation_tokens, total_tokens, raw_metrics)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [sessionId, data] of Object.entries(sessions)) {
      let totalInput = 0;
      let totalOutput = 0;
      let totalCacheRead = 0;
      let totalCacheCreation = 0;

      for (const [key, value] of Object.entries(data.metrics)) {
        const [source, type] = key.split(":");
        if (type === "input") totalInput += value;
        if (type === "output") totalOutput += value;
        if (type === "cacheRead") totalCacheRead += value;
        if (type === "cacheCreation") totalCacheCreation += value;
      }

      stmt.run(
        sessionId,
        data.model,
        data.timestamp,
        totalInput,
        totalOutput,
        totalCacheRead,
        totalCacheCreation,
        totalInput + totalOutput,
        JSON.stringify(data.metrics)
      );
    }

    db.close();
    console.log(
      `✓ Stored in SQLite: ${path.join(__dirname, "claude-telemetry.db")}`
    );
  } catch (err) {
    console.error("Database storage requires: npm install better-sqlite3");
    console.error(err.message);
  }
};

// ============================================================================
// CUSTOM: Add your own storage logic here
// ============================================================================
const custom = (sessions, callback) => {
  // callback(sessions) receives the extracted data
  // Do whatever you want: HTTP POST, file write, webhook, etc.
  callback(sessions);
};

module.exports = { csv, jsonl, database, custom };
