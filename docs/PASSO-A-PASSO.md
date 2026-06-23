# rust-node-monitor — Implementação passo a passo

Este documento registra, etapa por etapa, **como** o pacote foi construído,
explicando o Rust utilizado e como o `napi-rs` expõe funções Rust para o Node.

> Posicionamento: `rust-node-monitor` é um monitor leve para aplicações Node.js,
> com core em Rust, para coletar métricas de processo (e, futuramente, métricas
> HTTP) com baixo overhead. — _"Lightweight Node.js monitoring powered by Rust."_

---

## Conceito: como o Rust expõe funções para o Node (N-API + napi-rs)

O Node consegue carregar **addons nativos**: bibliotecas dinâmicas (`.node`) que
seguem a **N-API**, a ABI estável do Node para código nativo. Escrever N-API na
mão (em C) é verboso e perigoso. O **`napi-rs`** resolve isso:

- `napi` — runtime que faz a ponte entre tipos Rust e valores JavaScript (V8).
- `napi-derive` — fornece o macro `#[napi]`, que **gera em tempo de compilação**
  o código de registro/conversão.
- `napi-build` — roda no `build.rs` e configura a linkagem para gerar o `.node`.
- `@napi-rs/cli` — a CLI (`napi build`) que compila o crate como `cdylib`,
  renomeia o `.node` por plataforma e gera o loader JS + os tipos `.d.ts`.

Resultado: uma função `#[napi] fn snapshot()` em Rust vira uma função
`snapshot()` em JavaScript. Nomes `snake_case` viram `camelCase` no JS
automaticamente, e os tipos TypeScript são gerados (`binding.d.ts`).

---

## Etapa 1 — Projeto napi-rs e estrutura inicial

Partimos de um projeto Cargo binário e o convertemos em uma **biblioteca**:

1. `Cargo.toml`: definimos `crate-type = ["cdylib"]` (gera o `.node`) e
   adicionamos `napi`, `napi-derive`, `sysinfo` e, só no macOS, `mach2`.
   Em `[build-dependencies]`, `napi-build`.
2. `build.rs` chama `napi_build::setup()`.
3. Removemos `src/main.rs` e criamos `src/lib.rs`.
4. Criamos `package.json` com `@napi-rs/cli` e os scripts de build.

```bash
npm install
npx napi build --platform --js binding.js --dts binding.d.ts   # build debug
```

A flag `--platform` faz o binário ser nomeado por plataforma
(`rust-node-monitor.darwin-arm64.node`). `--js`/`--dts` definem os nomes do
loader e dos tipos gerados.

**Rust usado:** `crate-type = ["cdylib"]` instrui o compilador a gerar uma
biblioteca dinâmica compatível com C, que é o formato que o Node carrega.

---

## Etapas 2–4 — Build, `hello()` e teste

A função mais simples valida toda a cadeia (compilação → loader → Node):

```rust
#[napi]
pub fn hello() -> String {
    "Hello from Rust".to_string()
}
```

**Explicação:** `#[napi]` registra a função no módulo nativo. O `String` do Rust
é convertido automaticamente para uma `string` do JavaScript pelo `napi`.

Teste (`test/hello.test.ts`) com Vitest:

```ts
import { hello } from "../js/index";
expect(hello()).toBe("Hello from Rust");
```

---

## Etapas 5–7 — `sysinfo`, `snapshot()` e testes

### A struct exposta

```rust
#[napi(object)]
pub struct Snapshot {
    pub pid: u32,
    pub cpu_percent: f64,
    pub memory_rss: i64,
    pub memory_virtual: i64,
    pub threads: u32,
    pub uptime_seconds: i64,
    pub timestamp: i64,
}
```

**Explicação:**
- `#[napi(object)]` faz o `napi-rs` gerar um **objeto JS simples** com esses
  campos (em `camelCase`: `cpu_percent` → `cpuPercent`).
- Usamos `i64`/`f64`/`u32` porque mapeiam para `number` no JS. Evitamos `u64`,
  que o `napi-rs` mapeia para `BigInt` — o que poluiria a DX
  (`console.log` mostraria `84520960n`).

### A função

```rust
#[napi]
pub fn snapshot() -> napi::Result<Snapshot> {
    let pid = get_current_pid()
        .map_err(|e| napi::Error::from_reason(format!("failed to get current pid: {e}")))?;

    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::everything(),
    );

    let process = sys
        .process(pid)
        .ok_or_else(|| napi::Error::from_reason("current process not found by sysinfo"))?;
    // ...coleta os campos...
}
```

**Explicação / regras técnicas atendidas:**
- **Sem `.unwrap()`** em caminho crítico: usamos `?` com `map_err`/`ok_or_else`
  para transformar erros em `napi::Error`. No Node, isso vira uma exceção JS
  comum — erros amigáveis.
- **Performance:** `System::new()` cria um coletor vazio e atualizamos **apenas**
  o processo atual (`ProcessesToUpdate::Some(&[pid])`), em vez de varrer todos os
  processos do sistema. Mantém `snapshot()` rápido.
- **CPU:** `process.cpu_usage()` precisa de duas amostras espaçadas. Numa chamada
  isolada, o valor pode vir `0.0`. Isso está **documentado** e resolvido pela
  classe `Monitor` (amostragem contínua).

### Contagem de threads (específica por plataforma)

```rust
#[cfg(target_os = "linux")]   // conta /proc/self/task
#[cfg(target_os = "macos")]   // task_threads() via Mach (crate mach2)
#[cfg(not(any(...)))]         // demais: 0 (planejado p/ v0.2.0)
```

**Explicação:** `#[cfg(target_os = "...")]` é compilação condicional — só o bloco
da plataforma alvo entra no binário. No macOS chamamos a API Mach `task_threads`
e **liberamos** o array retornado com `mach_vm_deallocate` para não vazar memória.

### Testes (`test/snapshot.test.ts`)

Validam o contrato mínimo confiável:

```ts
expect(s.pid).toBeGreaterThan(0);
expect(s.memoryRss).toBeGreaterThan(0);
expect(s.timestamp).toBeGreaterThan(0);
```

---

## Etapa 8 — Tipos TypeScript

O `napi build` gera `binding.d.ts` automaticamente a partir dos comentários e
tipos do Rust. A camada pública (`js/index.ts`) re-exporta tudo e a `tsup`
emite `.d.ts` finais em `dist/` (CJS e ESM):

```ts
import * as native from "../binding.js";
export type { Snapshot } from "../binding.js";
export const snapshot: () => Snapshot = native.snapshot;
```

> Detalhe de ESM: o import precisa da extensão (`../binding.js`), senão o Node
> em modo ESM falha com `ERR_MODULE_NOT_FOUND`.

---

## Etapa 9 — README

`README.md` (inglês) cobre instalação, uso, API, plataformas suportadas,
limitações e roadmap.

---

## Etapas 10–11 — Exemplos Express e Fastify

Em `examples/` há servidores mínimos. A camada de integração
(`js/express.ts`, `js/fastify.ts`) usa um coletor compartilhado
(`js/metrics.ts`) com média e percentis p95/p99 sobre um buffer circular,
mantendo o overhead baixo e a memória limitada.

---

## Etapa 12 — Classe `Monitor`

`Monitor` faz amostragem periódica. O `cpuPercent` é calculado em JS via
`process.cpuUsage()` (tempo de CPU acumulado) dividido pelo tempo real
(`process.hrtime.bigint()`), o que dá um valor **confiável** entre amostras — algo
que um `snapshot()` isolado não consegue. O timer é `unref()`'d para não impedir
o encerramento natural do processo.

---

## Etapa 13 — GitHub Actions

`.github/workflows/CI.yml` tem três jobs:
- **build**: matriz por target (macOS arm64/x64, Linux x64, Linux arm64 via
  `--zig`, Windows x64) — publica os `.node` como artefatos.
- **test**: builda nativamente em cada SO (Node 18/20/22) e roda `npm test`.
- **publish**: em tag `v*`, baixa os artefatos e publica o pacote principal +
  os pacotes por plataforma no npm.

---

## Etapa 14 — Publicação no npm

```bash
npm run build            # build:native + build:js
npm publish --access public
```

A partir da v0.1.2 o pacote é **único**: os binários de todas as plataformas são
empacotados dentro do próprio `rust-node-monitor` (campo `files: ["*.node"]`). O
loader `binding.js` escolhe o `.node` certo em runtime. Assim o usuário instala
sem precisar de compilador e o perfil do npm fica com um só pacote.

> Histórico: as versões 0.1.0/0.1.1 usaram o modelo de `optionalDependencies` com
> um pacote de binário por plataforma (padrão do esbuild/swc). Migramos para o
> pacote único para simplificar a publicação e a organização no npm.

---

## Empacotamento (resumo)

```
src/lib.rs ──(napi build)──▶ binding.js + binding.d.ts + *.node   (camada nativa)
js/*.ts    ──(tsup)────────▶ dist/*.js + *.mjs + *.d.ts            (API pública)
package.json "exports" mapeia ".", "./express", "./fastify", "./nestjs".
```

CommonJS e ESM são suportados (formatos `.js` e `.mjs` + `exports`).
