// Exemplo Fastify — execute com: node examples/fastify-example.mjs
// Requer build local: npm run build
import Fastify from "fastify";
import { Monitor, prometheus } from "rust-node-monitor";
import { monitorPlugin, getRequestMetrics } from "rust-node-monitor/fastify";

const monitor = new Monitor({ intervalMs: 1000 }).start();
const fastify = Fastify();

fastify.register(monitorPlugin);

fastify.get("/health", async () => ({ ok: true }));

fastify.get("/stats", async () => ({
  process: monitor.stats(),
  requests: getRequestMetrics(),
}));

fastify.get("/metrics", async (_req, reply) => {
  reply.type("text/plain").send(prometheus(monitor.stats()));
});

fastify.listen({ port: 3001 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Fastify example on ${address}`);
  console.log("Try: /health  /stats  /metrics");
});
