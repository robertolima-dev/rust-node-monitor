/**
 * Integração com NestJS.
 *
 * Uso:
 *   import { RustNodeMonitorInterceptor } from "rust-node-monitor/nestjs";
 *   app.useGlobalInterceptors(new RustNodeMonitorInterceptor());
 *
 * Usamos `import type` para `@nestjs/common`, ou seja, NÃO há import em runtime
 * do Nest aqui — o pacote não força o Nest como dependência. A única dependência
 * de runtime é o operador `tap` do RxJS (já presente em qualquer app Nest).
 */

import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs";
import { performance } from "node:perf_hooks";
import { RequestMetrics, globalRequestMetrics } from "./metrics";

export class RustNodeMonitorInterceptor implements NestInterceptor {
  constructor(private readonly metrics: RequestMetrics = globalRequestMetrics) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = performance.now();
    const http = context.switchToHttp();

    return next.handle().pipe(
      tap({
        next: () => this.record(start, http),
        error: () => this.record(start, http, true),
      }),
    );
  }

  private record(
    start: number,
    http: ReturnType<ExecutionContext["switchToHttp"]>,
    errored = false,
  ): void {
    const response = http.getResponse?.() as { statusCode?: number } | undefined;
    const status = errored ? 500 : response?.statusCode ?? 200;
    this.metrics.record(performance.now() - start, status);
  }
}
