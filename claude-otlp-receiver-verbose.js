const http = require("http");
const PORT = 4318;
const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      console.log(`  Payload size: ${body.length} bytes`);
      console.log(`  First 200 chars: ${body.substring(0, 200)}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(PORT, () => {
  console.log(`Verbose OTLP receiver listening on :${PORT}`);
  console.log(`Tip: In another terminal, run:`);
  console.log(`  export CLAUDE_CODE_ENABLE_TELEMETRY=1`);
  console.log(`  export OTEL_METRICS_EXPORTER=otlp`);
  console.log(`  export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`);
  console.log(`  claude`);
});
