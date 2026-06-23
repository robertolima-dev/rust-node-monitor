/**
 * Integração com Express.
 *
 * Uso:
 *   import { monitorMiddleware } from "rust-node-monitor/express";
 *   app.use(monitorMiddleware());
 */

import type { Request, Response, NextFunction } from "express";
import { performance } from "node:perf_hooks";
import {
  RequestMetrics,
  globalRequestMetrics,
  type RequestMetricsSnapshot,
} from "./metrics";

export interface MonitorMiddlewareOptions {
  /** Coletor a usar. Padrão: instância global compartilhada. */
  metrics?: RequestMetrics;
}

/**
 * Cria um middleware Express que mede latência e contabiliza erros por
 * requisição. Não bloqueia o fluxo: registra no evento `finish` da resposta.
 */
export function monitorMiddleware(options: MonitorMiddlewareOptions = {}) {
  const metrics = options.metrics ?? globalRequestMetrics;

  return function rustNodeMonitor(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const start = performance.now();
    res.once("finish", () => {
      metrics.record(performance.now() - start, res.statusCode);
    });
    next();
  };
}

/** Lê o snapshot agregado das métricas de requisição. */
export function getRequestMetrics(
  metrics: RequestMetrics = globalRequestMetrics,
): RequestMetricsSnapshot {
  return metrics.snapshot();
}
