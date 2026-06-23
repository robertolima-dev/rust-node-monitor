// Exemplo Express — execute com: node examples/express-example.mjs
// Requer build local: npm run build
import express from "express";
import { Monitor, prometheus } from "rust-node-monitor";
import { monitorMiddleware, getRequestMetrics } from "rust-node-monitor/express";

const monitor = new Monitor({ intervalMs: 1000 }).start();
const app = express();

app.use(monitorMiddleware());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/stats", (_req, res) => {
  res.json({ process: monitor.stats(), requests: getRequestMetrics() });
});

app.get("/metrics", (_req, res) => {
  res.type("text/plain").send(prometheus(monitor.stats()));
});

app.listen(3000, () => {
  console.log("Express example on http://localhost:3000");
  console.log("Try: /health  /stats  /metrics");
});
