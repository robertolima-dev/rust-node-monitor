/**
 * rust-node-monitor — API pública (TypeScript).
 *
 * Esta camada re-exporta as funções nativas geradas pelo Rust/napi-rs e
 * adiciona utilitários puramente JS (a classe `Monitor` e o formato Prometheus).
 *
 * "Lightweight Node.js monitoring powered by Rust."
 */

import { performance } from "node:perf_hooks";
// Namespace import: funciona de forma idêntica em CommonJS e ESM ao consumir o
// addon nativo (que é um módulo CJS gerado pelo napi-rs).
import * as native from "../binding.js";

export type { Snapshot } from "../binding.js";
import type { Snapshot } from "../binding.js";

export {
  RequestMetrics,
  globalRequestMetrics,
  type RequestMetricsSnapshot,
  type RequestMetricsOptions,
} from "./metrics";

/** Sanity-check: retorna "Hello from Rust" vindo do core nativo. */
export const hello: () => string = native.hello;

/**
 * Coleta um snapshot pontual das métricas do processo atual (core em Rust).
 *
 * Observação sobre CPU: numa chamada isolada `cpuPercent` pode vir `0`, pois o
 * cálculo de CPU exige duas amostras espaçadas no tempo. Para CPU contínua e
 * confiável, use a classe {@link Monitor}.
 */
export const snapshot: () => Snapshot = native.snapshot;

export interface MonitorOptions {
  /** Intervalo de amostragem em ms (mínimo efetivo: 50). Padrão: 1000. */
  intervalMs?: number;
  /** Calcular CPU continuamente via deltas. Padrão: true. */
  collectCpu?: boolean;
  /** Coletar métricas de memória. Padrão: true. */
  collectMemory?: boolean;
}

export interface MonitorStats extends Snapshot {
  /** Quantas amostras foram coletadas desde `start()`. */
  samples: number;
}

/**
 * Monitor contínuo de processo.
 *
 * Diferente de `snapshot()`, o `Monitor` calcula `cpuPercent` de forma
 * confiável: ele acumula o tempo de CPU do processo (via `process.cpuUsage()`)
 * entre amostras e divide pelo tempo real decorrido. O valor é agregado em
 * todos os núcleos (pode passar de 100% em cargas multi-thread).
 */
export class Monitor {
  private readonly intervalMs: number;
  private readonly collectCpu: boolean;
  private readonly collectMemory: boolean;

  private timer: ReturnType<typeof setInterval> | null = null;
  private samples = 0;
  private cpuPercent = 0;
  private latest: Snapshot = native.snapshot();

  private prevCpu = process.cpuUsage();
  private prevHrTime = process.hrtime.bigint();

  constructor(options: MonitorOptions = {}) {
    this.intervalMs = Math.max(50, options.intervalMs ?? 1000);
    this.collectCpu = options.collectCpu ?? true;
    this.collectMemory = options.collectMemory ?? true;
  }

  /** Inicia a amostragem periódica. Idempotente. */
  start(): this {
    if (this.timer) return this;
    this.prevCpu = process.cpuUsage();
    this.prevHrTime = process.hrtime.bigint();
    this.timer = setInterval(() => this.sample(), this.intervalMs);
    // Não segura o event loop aberto: o processo pode encerrar normalmente.
    if (typeof this.timer.unref === "function") this.timer.unref();
    return this;
  }

  /** Para a amostragem periódica. Idempotente. */
  stop(): this {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this;
  }

  /** Retorna as métricas mais recentes (com CPU contínua, se habilitada). */
  stats(): MonitorStats {
    if (this.samples === 0) this.sample();
    return { ...this.latest, cpuPercent: this.cpuPercent, samples: this.samples };
  }

  private sample(): void {
    if (this.collectCpu) {
      const curCpu = process.cpuUsage();
      const curHr = process.hrtime.bigint();
      const cpuMicros =
        curCpu.user - this.prevCpu.user + (curCpu.system - this.prevCpu.system);
      const elapsedMicros = Number(curHr - this.prevHrTime) / 1000;
      this.cpuPercent =
        elapsedMicros > 0
          ? Math.round((cpuMicros / elapsedMicros) * 1000) / 10
          : 0;
      this.prevCpu = curCpu;
      this.prevHrTime = curHr;
    }

    if (this.collectMemory) {
      this.latest = native.snapshot();
    }

    this.samples += 1;
  }
}

/**
 * Renderiza um snapshot no formato de exposição do Prometheus (text/plain).
 * Útil para um endpoint `GET /metrics`.
 */
export function prometheus(stats: Snapshot = native.snapshot()): string {
  const lines = [
    "# HELP process_cpu_percent Process CPU usage percent (aggregated across cores).",
    "# TYPE process_cpu_percent gauge",
    `process_cpu_percent ${stats.cpuPercent}`,
    "# HELP process_memory_rss_bytes Resident set size in bytes.",
    "# TYPE process_memory_rss_bytes gauge",
    `process_memory_rss_bytes ${stats.memoryRss}`,
    "# HELP process_memory_virtual_bytes Virtual memory in bytes.",
    "# TYPE process_memory_virtual_bytes gauge",
    `process_memory_virtual_bytes ${stats.memoryVirtual}`,
    "# HELP process_threads Number of OS threads.",
    "# TYPE process_threads gauge",
    `process_threads ${stats.threads}`,
    "# HELP process_uptime_seconds Process uptime in seconds.",
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${stats.uptimeSeconds}`,
  ];
  return lines.join("\n") + "\n";
}
