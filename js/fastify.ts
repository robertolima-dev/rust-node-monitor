/**
 * Integração com Fastify.
 *
 * Uso:
 *   import { monitorPlugin } from "rust-node-monitor/fastify";
 *   fastify.register(monitorPlugin);
 */

import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import {
  RequestMetrics,
  globalRequestMetrics,
  type RequestMetricsSnapshot,
} from "./metrics";

export interface MonitorPluginOptions extends FastifyPluginOptions {
  /** Coletor a usar. Padrão: instância global compartilhada. */
  metrics?: RequestMetrics;
}

/**
 * Plugin Fastify que usa o hook `onResponse` (que já fornece `reply.elapsedTime`)
 * para registrar latência e status de cada requisição.
 */
export async function monitorPlugin(
  fastify: FastifyInstance,
  options: MonitorPluginOptions = {},
): Promise<void> {
  const metrics = options.metrics ?? globalRequestMetrics;

  fastify.addHook(
    "onResponse",
    (_request: FastifyRequest, reply: FastifyReply, done: () => void) => {
      metrics.record(reply.elapsedTime, reply.statusCode);
      done();
    },
  );
}

/** Lê o snapshot agregado das métricas de requisição. */
export function getRequestMetrics(
  metrics: RequestMetrics = globalRequestMetrics,
): RequestMetricsSnapshot {
  return metrics.snapshot();
}
