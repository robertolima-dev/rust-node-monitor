/**
 * Alertas simples por threshold sobre as métricas do processo.
 *
 * `checkAlerts` é uma função **sem estado**: você passa os limites que quer
 * vigiar e (opcionalmente) um snapshot já coletado; ela devolve a lista de
 * alertas disparados. Um alerta dispara quando a métrica **excede** o limite
 * (`value > threshold`). Apenas os limites informados são avaliados.
 *
 * Sem estado de propósito: o chamador decide quando avaliar (a cada amostra do
 * `Monitor`, num handler de `/health`, num cron, etc.) e o que fazer com o
 * resultado (logar, abrir incidente, enviar ao ImmutableLog…).
 */

import * as native from "../binding.js";
import type { Snapshot } from "../binding.js";

/** Limites a vigiar. Cada campo é opcional; só os definidos são avaliados. */
export interface AlertThresholds {
  /** Dispara quando `cpuPercent` excede este valor (em %, agregado por core). */
  cpuPercent?: number;
  /** Dispara quando a memória residente (RSS) excede este valor, em bytes. */
  memoryRssBytes?: number;
  /** Dispara quando a memória virtual excede este valor, em bytes. */
  memoryVirtualBytes?: number;
}

/** Um alerta disparado. */
export interface Alert {
  /** Qual limite disparou: `"cpuPercent"`, `"memoryRssBytes"` ou `"memoryVirtualBytes"`. */
  metric: keyof AlertThresholds;
  /** Valor observado da métrica (na mesma unidade do limite). */
  value: number;
  /** O limite configurado que foi excedido. */
  threshold: number;
  /** Severidade do alerta. Por enquanto, sempre `"warning"`. */
  severity: "warning";
}

/**
 * Avalia `thresholds` contra `stats` (por padrão, um `snapshot()` recém-coletado)
 * e devolve os alertas disparados.
 *
 * Dica: para `cpuPercent` confiável, passe `monitor.stats()` em vez do default —
 * um `snapshot()` isolado reporta CPU `0` na primeira leitura.
 *
 * @example
 * ```ts
 * const fired = checkAlerts({ cpuPercent: 80, memoryRssBytes: 500_000_000 });
 * // [{ metric: "cpuPercent", value: 91.2, threshold: 80, severity: "warning" }]
 * ```
 */
export function checkAlerts(
  thresholds: AlertThresholds,
  stats: Snapshot = native.snapshot(),
): Alert[] {
  const fired: Alert[] = [];

  const evaluate = (metric: keyof AlertThresholds, value: number) => {
    const threshold = thresholds[metric];
    if (threshold !== undefined && value > threshold) {
      fired.push({ metric, value, threshold, severity: "warning" });
    }
  };

  evaluate("cpuPercent", stats.cpuPercent);
  evaluate("memoryRssBytes", stats.memoryRss);
  evaluate("memoryVirtualBytes", stats.memoryVirtual);

  return fired;
}
