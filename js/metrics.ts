/**
 * Coletor leve de métricas de requisições HTTP.
 *
 * Mantém um buffer circular das latências recentes para calcular médias e
 * percentis (p95/p99) sem crescer indefinidamente em memória. Compartilhado
 * pelos adaptadores Express, Fastify e NestJS.
 */

export interface RequestMetricsSnapshot {
  /** Total de requisições observadas. */
  totalRequests: number;
  /** Total de respostas com status >= 400. */
  totalErrors: number;
  /** Latência média (ms) na janela atual. */
  latencyAvgMs: number;
  /** Percentil 95 de latência (ms) na janela atual. */
  latencyP95Ms: number;
  /** Percentil 99 de latência (ms) na janela atual. */
  latencyP99Ms: number;
}

export interface RequestMetricsOptions {
  /** Quantas latências recentes manter para os percentis. Padrão: 1024. */
  windowSize?: number;
}

export class RequestMetrics {
  private readonly windowSize: number;
  private readonly latencies: number[] = [];
  private cursor = 0;
  private totalRequests = 0;
  private totalErrors = 0;

  constructor(options: RequestMetricsOptions = {}) {
    this.windowSize = Math.max(1, options.windowSize ?? 1024);
  }

  /** Registra uma requisição finalizada. */
  record(durationMs: number, statusCode: number): void {
    this.totalRequests += 1;
    if (statusCode >= 400) {
      this.totalErrors += 1;
    }

    if (this.latencies.length < this.windowSize) {
      this.latencies.push(durationMs);
    } else {
      this.latencies[this.cursor] = durationMs;
      this.cursor = (this.cursor + 1) % this.windowSize;
    }
  }

  /** Retorna um snapshot agregado das métricas de requisição. */
  snapshot(): RequestMetricsSnapshot {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avg =
      sorted.length === 0
        ? 0
        : sorted.reduce((sum, v) => sum + v, 0) / sorted.length;

    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      latencyAvgMs: round(avg),
      latencyP95Ms: round(percentile(sorted, 0.95)),
      latencyP99Ms: round(percentile(sorted, 0.99)),
    };
  }

  /** Zera os contadores e o buffer de latências. */
  reset(): void {
    this.latencies.length = 0;
    this.cursor = 0;
    this.totalRequests = 0;
    this.totalErrors = 0;
  }
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const index = Math.min(
    sortedAsc.length - 1,
    Math.ceil(p * sortedAsc.length) - 1,
  );
  return sortedAsc[Math.max(0, index)];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Instância global padrão usada pelos middlewares quando nenhuma é informada. */
export const globalRequestMetrics = new RequestMetrics();
