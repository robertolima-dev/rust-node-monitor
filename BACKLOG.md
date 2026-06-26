# Backlog — rust-node-monitor

Planning and roadmap for `rust-node-monitor`: a lightweight Node.js process/HTTP
monitor with a Rust core (napi-rs). This file is the single source of truth for
the roadmap; the README mirrors the highlights.

> Status legend: ✅ shipped · 🔜 planned (next) · 💡 idea (no version yet) · ⚠️ note

---

## Shipped — v0.1.x (current: 0.1.2)

- ✅ `snapshot()` — point-in-time process metrics: `pid`, `cpuPercent`,
  `memoryRss`, `memoryVirtual`, `threads`, `uptimeSeconds`, `timestamp`.
- ✅ `Monitor` class — continuous sampling with reliable `cpuPercent` (delta over
  real elapsed time across cores); internal timer is `unref`'d.
- ✅ `prometheus(stats?)` — render a snapshot in Prometheus text exposition format.
- ✅ Framework integrations via subpath imports: `./express`, `./fastify`,
  `./nestjs` (per-request latency + error counts into a shared collector).
- ✅ Prebuilt native addon (napi-rs) for 5 targets — no compiler at install time.
- ✅ CI matrix: build (5 targets) + test (`{ubuntu, macos, windows} × node 18/20/22`).

---

## Planned — v0.2.0

- 🔜 **Event loop delay tracking** — surface lag as a first-class metric.
- 🔜 **Native request metrics** — total, errors, latency avg / p95 / p99 wired
  through the Rust core (today the framework collectors are JS-side).
- 🔜 **First-class Prometheus exporter helpers per framework** — drop-in
  `/metrics` route for Express/Fastify/NestJS (align with `rust-py-monitor`).
- 🔜 **Simple alerts** — high CPU, high memory, stalled event loop.
- 🔜 **Windows thread count** — `threads` currently returns `0` off Linux/macOS.
- 🔜 **ImmutableLog integration** — optional emission of health/audit events
  (shared client/event shape with the other libs).

---

## Ideas / future (no version assigned)

- 💡 Child-process / cluster aggregation (today metrics are scoped to the current
  process only).
- 💡 GC metrics (heap, pauses) alongside CPU/memory.
- 💡 Configurable alert sinks (log, webhook, ImmutableLog).
- 💡 Benchmarks suite (overhead of `Monitor` and the middlewares).

---

## Known limitations (by design, for now)

- Metrics are scoped to the **current process** (no child-process aggregation yet).
- `snapshot()` reports `cpuPercent: 0` on the first call — use `Monitor` for
  continuous CPU.
- `threads` is `0` on platforms other than Linux/macOS (planned for v0.2.0).

---

## Release reminder

Bump the version in **both** `package.json` and `Cargo.toml` (kept in sync), update
the README + website, commit as `rust-node-monitor:<version>`, then tag `v<version>`
and `git push origin main --tags` to trigger the npm publish workflow. See
`../PROMPT_DEFAULT.md` for the full per-feature checklist.
