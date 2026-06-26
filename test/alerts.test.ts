import { describe, it, expect } from "vitest";
import { checkAlerts } from "../js/index";
import type { Snapshot } from "../binding";

// Snapshot fixo para avaliação determinística (sem depender de CPU/memória reais).
const stats = (over: Partial<Snapshot> = {}): Snapshot => ({
  pid: 123,
  cpuPercent: 50,
  memoryRss: 100_000_000,
  memoryVirtual: 400_000_000,
  threads: 4,
  uptimeSeconds: 10,
  timestamp: 1_700_000_000,
  ...over,
});

describe("checkAlerts", () => {
  it("não dispara quando as métricas estão abaixo dos limites", () => {
    const fired = checkAlerts(
      { cpuPercent: 80, memoryRssBytes: 500_000_000 },
      stats(),
    );
    expect(fired).toEqual([]);
  });

  it("dispara quando a CPU excede o limite", () => {
    const fired = checkAlerts({ cpuPercent: 80 }, stats({ cpuPercent: 91.2 }));
    expect(fired).toEqual([
      { metric: "cpuPercent", value: 91.2, threshold: 80, severity: "warning" },
    ]);
  });

  it("dispara quando a memória RSS excede o limite", () => {
    const fired = checkAlerts(
      { memoryRssBytes: 50_000_000 },
      stats({ memoryRss: 100_000_000 }),
    );
    expect(fired).toEqual([
      {
        metric: "memoryRssBytes",
        value: 100_000_000,
        threshold: 50_000_000,
        severity: "warning",
      },
    ]);
  });

  it("avalia apenas os limites informados", () => {
    const fired = checkAlerts({ memoryVirtualBytes: 1 }, stats());
    expect(fired.map((a) => a.metric)).toEqual(["memoryVirtualBytes"]);
  });

  it("pode disparar múltiplos alertas de uma vez", () => {
    const fired = checkAlerts(
      { cpuPercent: 10, memoryRssBytes: 1, memoryVirtualBytes: 1 },
      stats(),
    );
    expect(fired.map((a) => a.metric).sort()).toEqual([
      "cpuPercent",
      "memoryRssBytes",
      "memoryVirtualBytes",
    ]);
  });

  it("não dispara no empate (value === threshold, não excede)", () => {
    const fired = checkAlerts({ cpuPercent: 50 }, stats({ cpuPercent: 50 }));
    expect(fired).toEqual([]);
  });

  it("limites vazios => nenhum alerta", () => {
    expect(checkAlerts({}, stats())).toEqual([]);
  });
});
