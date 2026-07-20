const http = require("http");
const fs = require("fs");
const logFile = require("path").join(__dirname, "opencode-otlp-log.jsonl");

http.createServer((req, res) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    fs.appendFileSync(logFile, body + "\n");
    res.writeHead(200); res.end("{}");
  });
}).listen(4318, () => console.log("Listening on :4318 for OTLP logs/traces"));
