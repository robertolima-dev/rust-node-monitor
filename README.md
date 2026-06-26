# rust-node-monitor

**Lightweight Node.js monitoring powered by Rust.**

`rust-node-monitor` is a lightweight monitor for Node.js applications with a
core written in Rust, built to collect process metrics — and, in upcoming
releases, HTTP metrics — with very low overhead.

It ships as a prebuilt native addon (via [napi-rs](https://napi.rs/)), so there
is **no compiler required at install time** on supported platforms.

[![CI](https://github.com/robertolima-dev/rust-node-monitor/actions/workflows/CI.yml/badge.svg)](https://github.com/robertolima-dev/rust-node-monitor/actions/workflows/CI.yml)
[![npm](https://img.shields.io/npm/v/rust-node-monitor.svg)](https://www.npmjs.com/package/rust-node-monitor)
![node](https://img.shields.io/badge/node-%3E%3D18-43853d)
![license](https://img.shields.io/badge/license-MIT-blue)

🌐 **Website:** [rust-node-monitor.vercel.app](https://rust-node-monitor.vercel.app/)

---

## Installation

```bash
npm install rust-node-monitor
```

Works with both **ESM** and **CommonJS**, and requires **Node.js 18+**.

---

## Quick start

```ts
import { snapshot } from "rust-node-monitor";

console.log(snapshot());
```

```js
// CommonJS
const { snapshot } = require("rust-node-monitor");
console.log(snapshot());
```

Example output:

```js
{
  pid: 12345,
  cpuPercent: 12.5,
  memoryRss: 84520960,
  memoryVirtual: 312000000,
  threads: 8,
  uptimeSeconds: 3600,
  timestamp: 1710000000
}
```

---

## API

### `hello(): string`

A sanity check that confirms the native addon loaded correctly. Returns
`"Hello from Rust"`.

```ts
import { hello } from "rust-node-monitor";
console.log(hello()); // "Hello from Rust"
```

### `snapshot(): Snapshot`

Collects a point-in-time snapshot of the **current process**.

```ts
import { snapshot } from "rust-node-monitor";

const metrics = snapshot();
console.log(metrics.pid);
console.log(metrics.memoryRss);
console.log(metrics.cpuPercent);
```

| Field            | Type     | Description                                            |
| ---------------- | -------- | ------------------------------------------------------ |
| `pid`            | `number` | Process ID                                             |
| `cpuPercent`     | `number` | Process CPU usage (%). See the CPU note below          |
| `memoryRss`      | `number` | Resident set size, in bytes                            |
| `memoryVirtual`  | `number` | Virtual memory, in bytes                               |
| `threads`        | `number` | OS thread count (best-effort per platform)             |
| `uptimeSeconds`  | `number` | Seconds since the process started                      |
| `timestamp`      | `number` | Unix timestamp (seconds) at collection time            |

> **CPU note:** A single `snapshot()` call may report `cpuPercent: 0`. CPU usage
> requires two samples spaced over time to compute a delta, and an isolated call
> has no interval to compare against. For continuous, reliable CPU use the
> [`Monitor`](#monitor) class.

### `Monitor`

A continuous process monitor. Unlike `snapshot()`, it computes `cpuPercent`
reliably by accumulating process CPU time between samples and dividing by the
real elapsed time (aggregated across all cores — it can exceed 100% under
multi-threaded load).

```ts
import { Monitor } from "rust-node-monitor";

const monitor = new Monitor({
  intervalMs: 1000,
  collectCpu: true,
  collectMemory: true,
});

monitor.start();

setInterval(() => {
  console.log(monitor.stats());
}, 1000);

// later…
monitor.stop();
```

`monitor.stats()` returns a `Snapshot` plus a `samples` counter. The internal
timer is `unref`'d, so it will not keep your process alive on its own.

### `prometheus(stats?): string`

Renders a snapshot in the Prometheus text exposition format.

```ts
import express from "express";
import { prometheus, Monitor } from "rust-node-monitor";

const monitor = new Monitor().start();
const app = express();

app.get("/metrics", (_req, res) => {
  res.type("text/plain").send(prometheus(monitor.stats()));
});
```

### `checkAlerts(thresholds, stats?): Alert[]`

Simple, stateless threshold alerts over the process metrics. Pass the thresholds
you want to watch; it returns the alerts that fired (a metric **exceeds** its
threshold). Only the thresholds you provide are evaluated.

```ts
import { Monitor, checkAlerts } from "rust-node-monitor";

const monitor = new Monitor().start();

setInterval(() => {
  const fired = checkAlerts(
    { cpuPercent: 80, memoryRssBytes: 500_000_000 },
    monitor.stats(), // pass stats for reliable CPU; defaults to snapshot()
  );
  for (const alert of fired) {
    console.warn(`[alert] ${alert.metric}=${alert.value} > ${alert.threshold}`);
  }
}, 5000);
```

Each `Alert` is `{ metric, value, threshold, severity: "warning" }`, where
`metric` is one of `"cpuPercent"`, `"memoryRssBytes"`, `"memoryVirtualBytes"`.
Being stateless, *you* decide when to evaluate and what to do with the result
(log, page, open an incident, forward to ImmutableLog…).

---

## Framework integrations

These subpath imports record per-request latency and error counts into a shared
collector (or one you provide). The framework packages are **optional peer
dependencies** — install only what you use.

### Express

```ts
import express from "express";
import { monitorMiddleware, getRequestMetrics } from "rust-node-monitor/express";

const app = express();
app.use(monitorMiddleware());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/stats", (_req, res) => res.json(getRequestMetrics()));
```

### Fastify

```ts
import Fastify from "fastify";
import { monitorPlugin } from "rust-node-monitor/fastify";

const fastify = Fastify();
fastify.register(monitorPlugin);
```

### NestJS

```ts
import { RustNodeMonitorInterceptor } from "rust-node-monitor/nestjs";

// In main.ts
app.useGlobalInterceptors(new RustNodeMonitorInterceptor());
```

---

## Supported platforms

Prebuilt binaries are published for:

| OS      | Architecture | Triple                       |
| ------- | ------------ | ---------------------------- |
| macOS   | arm64        | `aarch64-apple-darwin`       |
| macOS   | x64          | `x86_64-apple-darwin`        |
| Linux   | x64 (glibc)  | `x86_64-unknown-linux-gnu`   |
| Linux   | arm64 (glibc)| `aarch64-unknown-linux-gnu`  |
| Windows | x64          | `x86_64-pc-windows-msvc`     |

---

## How it works

```
┌──────────────────────────┐     ┌───────────────────────────┐
│  Your Node.js app (TS/JS)│────▶│  rust-node-monitor (JS API)│
└──────────────────────────┘     │  Monitor, prometheus, …    │
                                  └─────────────┬──────────────┘
                                                │ N-API (napi-rs)
                                  ┌─────────────▼──────────────┐
                                  │  Rust core (.node addon)   │
                                  │  snapshot(), hello()       │
                                  │  sysinfo + platform calls  │
                                  └────────────────────────────┘
```

The native core is built with `napi-rs`: the `#[napi]` macro generates the glue
that registers Rust functions as ordinary JavaScript functions. `snake_case`
field names become `camelCase` in JS automatically, and TypeScript types are
generated into `binding.d.ts`.

---

## Limitations (v0.1.0)

- `snapshot()` reports `cpuPercent: 0` on the first call — use `Monitor` for
  continuous CPU.
- `threads` is collected via `/proc` on Linux and Mach APIs on macOS. On other
  platforms it returns `0` for now (planned for v0.2.0).
- Metrics are scoped to the **current process** (no child-process aggregation
  yet).

---

## Roadmap

**Shipped in v0.2.0**

- ✅ Simple threshold alerts (high CPU, high memory) via `checkAlerts(...)`.

**Planned**

- 🔜 Event loop delay tracking (and a "stalled loop" alert).
- 🔜 Full request metrics (total, errors, latency avg/p95/p99) wired natively.
- 🔜 First-class Prometheus exporter helpers per framework.
- 🔜 Windows thread count.
- 🔜 Optional integration with ImmutableLog for health/audit events.

---

## Development

```bash
# install dependencies
npm install

# build the native addon (Rust) + the TypeScript layer
npm run build

# run tests
npm test
```

See [`docs/PASSO-A-PASSO.md`](./docs/PASSO-A-PASSO.md) for a full, step-by-step
build log (in Portuguese) explaining the Rust and napi-rs details.

---

## License

[MIT](./LICENSE) © [Roberto Lima](https://github.com/robertolima-dev)
