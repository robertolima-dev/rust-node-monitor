import { describe, it, expect } from "vitest";
import { snapshot, Monitor, prometheus } from "../js/index";

describe("snapshot()", () => {
  const s = snapshot();

  it("expõe um pid válido", () => {
    expect(s.pid).toBeGreaterThan(0);
    expect(s.pid).toBe(process.pid);
  });

  it("reporta memória RSS positiva", () => {
    expect(s.memoryRss).toBeGreaterThan(0);
  });

  it("reporta memória virtual positiva", () => {
    expect(s.memoryVirtual).toBeGreaterThan(0);
  });

  it("reporta um timestamp Unix válido", () => {
    expect(s.timestamp).toBeGreaterThan(0);
    // ~depois de 2021 e antes de um futuro distante (sanity check).
    expect(s.timestamp).toBeGreaterThan(1_600_000_000);
  });

  it("cpuPercent é um número não-negativo (pode ser 0 na primeira leitura)", () => {
    expect(typeof s.cpuPercent).toBe("number");
    expect(s.cpuPercent).toBeGreaterThanOrEqual(0);
  });

  it("uptimeSeconds é não-negativo", () => {
    expect(s.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

describe("Monitor", () => {
  it("coleta amostras e calcula CPU contínua", async () => {
    const monitor = new Monitor({ intervalMs: 50 });
    monitor.start();
    // Gera um pouco de trabalho de CPU para sair de 0%.
    const end = Date.now() + 200;
    while (Date.now() < end) {
      Math.sqrt(Math.random());
    }
    await new Promise((r) => setTimeout(r, 120));
    const stats = monitor.stats();
    monitor.stop();

    expect(stats.samples).toBeGreaterThan(0);
    expect(stats.pid).toBe(process.pid);
    expect(typeof stats.cpuPercent).toBe("number");
  });

  it("start()/stop() são idempotentes", () => {
    const monitor = new Monitor();
    expect(() => {
      monitor.start();
      monitor.start();
      monitor.stop();
      monitor.stop();
    }).not.toThrow();
  });
});

describe("prometheus()", () => {
  it("renderiza métricas no formato de exposição", () => {
    const text = prometheus();
    expect(text).toContain("process_memory_rss_bytes");
    expect(text).toContain("# TYPE process_cpu_percent gauge");
  });
});
