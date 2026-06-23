//! rust-node-monitor
//!
//! Núcleo nativo (Rust) do monitor. Expõe duas funções para o Node via N-API:
//! - `hello()`     -> string de sanity-check.
//! - `snapshot()`  -> métricas do processo atual.
//!
//! Como o Rust expõe funções para o Node:
//! O macro `#[napi]` (do crate `napi-derive`) gera, em tempo de compilação, o
//! código de "cola" que registra a função no módulo N-API. Quando o Node carrega
//! o arquivo `.node`, essas funções aparecem como funções JavaScript normais.
//! Nomes em `snake_case` no Rust viram `camelCase` no JS automaticamente.

use napi_derive::napi;
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::{get_current_pid, ProcessRefreshKind, ProcessesToUpdate, System};

/// Retorno de `snapshot()`.
///
/// `#[napi(object)]` faz o napi-rs gerar um objeto JS simples (plain object)
/// com os campos abaixo, já em `camelCase`. Usamos `i64`/`f64`/`u32` porque
/// esses tipos viram `number` no JavaScript (evitamos `BigInt`, que poluiria a DX).
#[napi(object)]
pub struct Snapshot {
    /// PID do processo Node atual.
    pub pid: u32,
    /// Uso de CPU do processo em %. Veja a limitação documentada em `snapshot()`.
    pub cpu_percent: f64,
    /// Memória residente (RSS) em bytes.
    pub memory_rss: i64,
    /// Memória virtual em bytes.
    pub memory_virtual: i64,
    /// Número de threads do processo (best-effort por plataforma).
    pub threads: u32,
    /// Há quantos segundos o processo está rodando.
    pub uptime_seconds: i64,
    /// Timestamp Unix (segundos) do momento da coleta.
    pub timestamp: i64,
}

/// Sanity-check: confirma que o addon nativo carregou corretamente.
#[napi]
pub fn hello() -> String {
    "Hello from Rust".to_string()
}

/// Coleta um snapshot pontual das métricas do processo Node atual.
///
/// Limitação de CPU: `cpu_percent` depende de DUAS amostras espaçadas no tempo.
/// Em uma chamada isolada de `snapshot()` ainda não há intervalo de comparação,
/// portanto o valor pode vir `0.0` na primeira leitura. Para CPU contínua e
/// confiável use a classe `Monitor` (amostragem periódica) no lado JS.
///
/// Não usamos `.unwrap()`: erros viram `napi::Error` com mensagem amigável,
/// que no Node é lançada como uma exceção JavaScript comum.
#[napi]
pub fn snapshot() -> napi::Result<Snapshot> {
    let pid = get_current_pid()
        .map_err(|e| napi::Error::from_reason(format!("failed to get current pid: {e}")))?;

    // Criamos um System "vazio" e atualizamos apenas o processo atual.
    // Isso é muito mais barato do que varrer todos os processos do sistema.
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::everything(),
    );

    let process = sys
        .process(pid)
        .ok_or_else(|| napi::Error::from_reason("current process not found by sysinfo"))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    Ok(Snapshot {
        pid: pid.as_u32(),
        cpu_percent: process.cpu_usage() as f64,
        memory_rss: process.memory() as i64,
        memory_virtual: process.virtual_memory() as i64,
        threads: thread_count(),
        uptime_seconds: process.run_time() as i64,
        timestamp,
    })
}

// ---------------------------------------------------------------------------
// Contagem de threads do processo — específica por plataforma.
// ---------------------------------------------------------------------------

/// Linux: cada thread é uma entrada em /proc/self/task.
#[cfg(target_os = "linux")]
fn thread_count() -> u32 {
    std::fs::read_dir("/proc/self/task")
        .map(|dir| dir.count() as u32)
        .unwrap_or(0)
}

/// macOS: consultamos o kernel Mach com `task_threads`.
#[cfg(target_os = "macos")]
fn thread_count() -> u32 {
    use mach2::kern_return::KERN_SUCCESS;
    use mach2::mach_types::thread_act_array_t;
    use mach2::message::mach_msg_type_number_t;
    use mach2::task::task_threads;
    use mach2::traps::mach_task_self;
    use mach2::vm::mach_vm_deallocate;
    use mach2::vm_types::{mach_vm_address_t, mach_vm_size_t};
    use std::mem::size_of;

    // SAFETY: chamadas FFI Mach padrão. Liberamos o array retornado pelo kernel
    // com mach_vm_deallocate para não vazar memória a cada chamada.
    unsafe {
        let task = mach_task_self();
        let mut thread_list: thread_act_array_t = std::ptr::null_mut();
        let mut count: mach_msg_type_number_t = 0;

        if task_threads(task, &mut thread_list, &mut count) != KERN_SUCCESS {
            return 0;
        }

        let result = count as u32;
        let _ = mach_vm_deallocate(
            task,
            thread_list as mach_vm_address_t,
            (count as usize * size_of::<u32>()) as mach_vm_size_t,
        );
        result
    }
}

/// Demais plataformas (ex.: Windows): contagem precisa fica para a v0.2.0.
#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn thread_count() -> u32 {
    0
}
