#!/usr/bin/env node
// bench.mjs — harness-agnostic eval runner over OpenRouter.
//
// Runs every prompt in ./prompts/*.txt against every model in MODELS,
// captures response text + token usage + cost + latency, and appends:
//   - results/results.csv    (one row per (model,prompt) run)
//   - responses/<run_id>.txt (raw model response for manual grading)
//
// Usage:
//   export OPENROUTER_API_KEY="sk-or-..."
//   node bench.mjs                    # runs all default models x all prompts
//   node bench.mjs --models z-ai/glm-5.2
//   node bench.mjs --prompts prompts/02-refactor-async-await.txt
//   node bench.mjs --n 3              # repeat each run N times
//
// Requires: Node 18+ (uses global fetch). No other deps.

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODELS = ["z-ai/glm-5.2", "deepseek/deepseek-v4-flash"];

// ---- arg parsing ----------------------------------------------------------
const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : null;
}
const modelsArg = arg("models");
const promptsArg = arg("prompts");
const n = parseInt(arg("n") || "1", 10);

const MODELS = (modelsArg ? modelsArg.split(",") : DEFAULT_MODELS).map((s) => s.trim());

// ---- collect prompt files ------------------------------------------------
async function collectPrompts() {
  if (promptsArg) {
    const files = promptsArg.split(",").map((s) => s.trim());
    return Promise.all(
      files.map(async (f) => ({ name: f, text: (await readFile(f, "utf8")).trim() }))
    );
  }
  const dir = "prompts";
  const files = (await readdir(dir)).filter((f) => f.endsWith(".txt")).sort();
  return Promise.all(
    files.map(async (f) => ({ name: `${dir}/${f}`, text: (await readFile(join(dir, f), "utf8")).trim() }))
  );
}

// ---- single OpenRouter call ---------------------------------------------
async function callModel(model, text) {
  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/local/open-weight-agent-bench",
      "X-Title": "open-weight-agent-bench",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: text }],
    }),
  });
  const latency = Date.now() - t0;
  const body = await res.json();
  if (!res.ok) {
    return { error: `HTTP ${res.status}`, detail: JSON.stringify(body).slice(0, 500), latency };
  }
  const content = body?.choices?.[0]?.message?.content ?? "";
  const usage = body?.usage ?? {};
  return {
    content,
    prompt_tokens: usage.prompt_tokens ?? "",
    completion_tokens: usage.completion_tokens ?? "",
    total_tokens: usage.total_tokens ?? "",
    // OpenRouter may include cost directly in usage; otherwise blank (fill via dashboard).
    cost_usd: usage.cost ?? body?.cost ?? "",
    latency,
  };
}

// ---- CSV helpers ----------------------------------------------------------
async function ensureResultsCsv() {
  try {
    await stat("results/results.csv");
  } catch {
    await mkdir("results", { recursive: true });
    const header =
      "run_id,timestamp,model,prompt,prompt_tokens,completion_tokens,total_tokens,cost_usd,latency_ms,pass,response_file\n";
    await writeFile("results/results.csv", header, "utf8");
  }
}
function csvRow(fields) {
  return (
    fields
      .map((f) => {
        const s = String(f ?? "");
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      })
      .join(",") + "\n"
  );
}

// ---- main -----------------------------------------------------------------
async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("ERROR: OPENROUTER_API_KEY is not set. Aborting.");
    process.exit(1);
  }
  await mkdir("responses", { recursive: true });
  await ensureResultsCsv();

  const prompts = await collectPrompts();
  if (prompts.length === 0) {
    console.error("No prompts found in ./prompts/. Aborting.");
    process.exit(1);
  }

  console.log(`Models:   ${MODELS.join(", ")}`);
  console.log(`Prompts:  ${prompts.length}`);
  console.log(`Repeats:  ${n}`);
  console.log("");

  for (const model of MODELS) {
    for (const p of prompts) {
      for (let i = 0; i < n; i++) {
        const run_id = `${model.replace(/[\/.]/g, "-")}__${p.name.replace(/[/.\s]/g, "-")}__${i + 1}`;
        process.stdout.write(`  [${run_id}] ... `);
        const r = await callModel(model, p.text);
        if (r.error) {
          console.log(`FAIL ${r.error} ${r.detail}`);
          continue;
        }
        const ts = new Date().toISOString();
        const respFile = `responses/${run_id}.txt`;
        await writeFile(respFile, r.content, "utf8");
        const row = csvRow([
          run_id,
          ts,
          model,
          p.name,
          r.prompt_tokens,
          r.completion_tokens,
          r.total_tokens,
          r.cost_usd,
          r.latency,
          "", // pass column — manual
          respFile,
        ]);
        const { appendFile } = await import("node:fs/promises");
        await appendFile("results/results.csv", row, "utf8");
        console.log(
          `ok  tok=${r.total_tokens}  lat=${r.latency}ms  cost=${r.cost_usd || "?"}  -> ${respFile}`
        );
      }
    }
  }
  console.log("\nDone. See results/results.csv + responses/. Fill the `pass` column manually.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
