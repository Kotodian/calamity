# Plan 1: Cargo Workspace + Core Extraction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared singbox logic from `src-tauri/` into `crates/calamity-core/`, set up Cargo workspace, and have the GUI depend on core — all existing tests pass, macOS GUI works identically.

**Architecture:** Create a Cargo workspace at repo root. Move all `src-tauri/src/singbox/` modules (storage, config, process, BGP, etc.) into `crates/calamity-core/`. The Tauri app (`src-tauri/`) becomes a thin shell that re-exports core types and delegates to core functions. The only Tauri-specific code in core's `process.rs` tests (`tauri::async_runtime::block_on`) is replaced with `tokio::runtime::Runtime::block_on`.

**Tech Stack:** Rust 2021, Tokio, serde/serde_json, reqwest, dirs

---

## File Map

### New files (calamity-core crate)

| File | Responsibility |
|:---|:---|
| `Cargo.toml` (root) | Workspace definition |
| `crates/calamity-core/Cargo.toml` | Core crate manifest |
| `crates/calamity-core/src/lib.rs` | Re-export singbox module |
| `crates/calamity-core/src/singbox/mod.rs` | Module declarations (copied from src-tauri) |
| `crates/calamity-core/src/singbox/storage.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/nodes_storage.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/rules_storage.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/dns_storage.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/subscriptions_storage.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/tailscale_storage.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/tailscale_api.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/tailscale_config.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/clash_api.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/clash_parse.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/config.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/config_io.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/outbounds.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/subscription_fetch.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/process.rs` | Moved from src-tauri (tauri dep removed) |
| `crates/calamity-core/src/singbox/gateway.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/ruleset_market.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/bgp/mod.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/bgp/codec.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/bgp/fsm.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/bgp/speaker.rs` | Moved from src-tauri |
| `crates/calamity-core/src/singbox/bgp/storage.rs` | Moved from src-tauri |

### Modified files (src-tauri)

| File | Change |
|:---|:---|
| `src-tauri/Cargo.toml` | Add workspace member, add calamity-core dependency, remove deps now in core |
| `src-tauri/src/singbox/mod.rs` | Replace module declarations with re-exports from calamity-core |
| `src-tauri/src/lib.rs` | No changes (commands still reference `crate::singbox::*`) |
| `src-tauri/src/commands/*.rs` | No changes (re-exports make paths transparent) |

---

### Task 1: Create workspace root Cargo.toml

**Files:**
- Create: `Cargo.toml` (repo root)

- [ ] **Step 1: Create the workspace root manifest**

```toml
[workspace]
members = [
    "src-tauri",
    "crates/calamity-core",
]
resolver = "2"
```

- [ ] **Step 2: Verify workspace is recognized**

Run: `cd /Users/linqiankai/calamity && cargo metadata --format-version 1 --no-deps 2>&1 | head -1`
Expected: JSON output starting with `{"packages":[` (may warn about missing crates/calamity-core — that's fine, we create it next)

- [ ] **Step 3: Commit**

```bash
git add Cargo.toml
git commit -m "build: create cargo workspace root"
```

---

### Task 2: Create calamity-core crate scaffold

**Files:**
- Create: `crates/calamity-core/Cargo.toml`
- Create: `crates/calamity-core/src/lib.rs`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p crates/calamity-core/src
```

- [ ] **Step 2: Create Cargo.toml for calamity-core**

```toml
[package]
name = "calamity-core"
version = "0.3.0-beta"
edition = "2021"
description = "Shared core library for Calamity proxy client"

[features]
default = []
macos = []
linux = []

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }
tokio = { version = "1", features = ["process", "io-util", "sync", "time", "macros", "rt-multi-thread"] }
dirs = "6"
log = "0.4"
libc = "0.2"
base64 = "0.22"
chrono = "0.4"
urlencoding = "2"
uuid = { version = "1", features = ["v4"] }
serde_yaml = "0.9"
tokio-util = "0.7"
plist = "1"
rustybgp-packet = { git = "https://github.com/osrg/rustybgp" }
```

- [ ] **Step 3: Create lib.rs with empty singbox module**

```rust
pub mod singbox;
```

- [ ] **Step 4: Create empty singbox/mod.rs**

Create `crates/calamity-core/src/singbox/mod.rs`:

```rust
// Modules will be added as they are moved from src-tauri
```

- [ ] **Step 5: Verify the crate compiles**

Run: `cd /Users/linqiankai/calamity && cargo check -p calamity-core`
Expected: Compiles with no errors

- [ ] **Step 6: Commit**

```bash
git add crates/
git commit -m "build: scaffold calamity-core crate with dependencies"
```

---

### Task 3: Move storage foundation to core

This is the foundation — `storage.rs` provides `app_data_dir()`, `read_json()`, `write_json()` used by every other module.

**Files:**
- Create: `crates/calamity-core/src/singbox/storage.rs` (copy from src-tauri)
- Modify: `crates/calamity-core/src/singbox/mod.rs`

- [ ] **Step 1: Write test to verify core storage compiles and works**

Add to `crates/calamity-core/src/singbox/mod.rs`:

```rust
pub mod storage;
```

Copy `src-tauri/src/singbox/storage.rs` to `crates/calamity-core/src/singbox/storage.rs` with this change — replace the `use super::` import pattern. The file uses no `super::` imports (it's the foundation), so copy as-is.

- [ ] **Step 2: Verify core compiles with storage module**

Run: `cargo check -p calamity-core`
Expected: Compiles successfully (storage.rs has no internal dependencies)

- [ ] **Step 3: Run storage tests in core**

Run: `cargo test -p calamity-core -- singbox::storage`
Expected: 2 tests pass (old_settings_json_defaults_language, old_settings_json_defaults_gateway_mode)

- [ ] **Step 4: Commit**

```bash
git add crates/calamity-core/src/singbox/
git commit -m "feat(core): move storage foundation to calamity-core"
```

---

### Task 4: Move all storage modules to core

Move the 5 domain storage modules that depend only on `storage.rs`.

**Files:**
- Create: `crates/calamity-core/src/singbox/nodes_storage.rs`
- Create: `crates/calamity-core/src/singbox/rules_storage.rs`
- Create: `crates/calamity-core/src/singbox/dns_storage.rs`
- Create: `crates/calamity-core/src/singbox/subscriptions_storage.rs`
- Create: `crates/calamity-core/src/singbox/tailscale_storage.rs`
- Modify: `crates/calamity-core/src/singbox/mod.rs`

- [ ] **Step 1: Copy all 5 files to core**

Copy each file from `src-tauri/src/singbox/` to `crates/calamity-core/src/singbox/`. No code changes needed — they all use `super::storage::{read_json, write_json}` which resolves correctly in core.

- [ ] **Step 2: Add module declarations**

Update `crates/calamity-core/src/singbox/mod.rs`:

```rust
pub mod storage;
pub mod nodes_storage;
pub mod rules_storage;
pub mod dns_storage;
pub mod subscriptions_storage;
pub mod tailscale_storage;
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p calamity-core`
Expected: Compiles successfully

- [ ] **Step 4: Run all storage tests**

Run: `cargo test -p calamity-core`
Expected: All tests pass (storage + rules_storage backward compat tests + tailscale_storage tests)

- [ ] **Step 5: Commit**

```bash
git add crates/calamity-core/src/singbox/
git commit -m "feat(core): move domain storage modules to calamity-core"
```

---

### Task 5: Move networking and protocol modules to core

Move modules with no cross-module dependencies beyond storage: `clash_api.rs`, `outbounds.rs`, `subscription_fetch.rs`, `tailscale_api.rs`.

**Files:**
- Create: `crates/calamity-core/src/singbox/clash_api.rs`
- Create: `crates/calamity-core/src/singbox/outbounds.rs`
- Create: `crates/calamity-core/src/singbox/subscription_fetch.rs`
- Create: `crates/calamity-core/src/singbox/tailscale_api.rs`
- Modify: `crates/calamity-core/src/singbox/mod.rs`

- [ ] **Step 1: Copy files to core**

Copy each from `src-tauri/src/singbox/` to `crates/calamity-core/src/singbox/`. No code changes needed:
- `clash_api.rs` — uses only reqwest/serde (no internal deps)
- `outbounds.rs` — uses `super::nodes_storage::ProxyNode`
- `subscription_fetch.rs` — uses `super::nodes_storage::ProxyNode`
- `tailscale_api.rs` — uses `super::tailscale_storage`

- [ ] **Step 2: Add module declarations**

Update `crates/calamity-core/src/singbox/mod.rs`:

```rust
pub mod storage;
pub mod nodes_storage;
pub mod rules_storage;
pub mod dns_storage;
pub mod subscriptions_storage;
pub mod tailscale_storage;
pub mod clash_api;
pub mod outbounds;
pub mod subscription_fetch;
pub mod tailscale_api;
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p calamity-core`
Expected: Compiles successfully

- [ ] **Step 4: Run tests**

Run: `cargo test -p calamity-core`
Expected: All existing tests pass + tailscale_api tests pass

- [ ] **Step 5: Commit**

```bash
git add crates/calamity-core/src/singbox/
git commit -m "feat(core): move networking and protocol modules to calamity-core"
```

---

### Task 6: Move config generation modules to core

Move config.rs, config_io.rs, tailscale_config.rs, clash_parse.rs — these depend on multiple storage modules.

**Files:**
- Create: `crates/calamity-core/src/singbox/config.rs`
- Create: `crates/calamity-core/src/singbox/config_io.rs`
- Create: `crates/calamity-core/src/singbox/tailscale_config.rs`
- Create: `crates/calamity-core/src/singbox/clash_parse.rs`
- Modify: `crates/calamity-core/src/singbox/mod.rs`

- [ ] **Step 1: Copy files to core**

Copy each from `src-tauri/src/singbox/`. No code changes — all `super::` references resolve correctly within core's singbox module.

- [ ] **Step 2: Add module declarations**

Update `crates/calamity-core/src/singbox/mod.rs`:

```rust
pub mod storage;
pub mod nodes_storage;
pub mod rules_storage;
pub mod dns_storage;
pub mod subscriptions_storage;
pub mod tailscale_storage;
pub mod clash_api;
pub mod outbounds;
pub mod subscription_fetch;
pub mod tailscale_api;
pub mod config;
pub mod config_io;
pub mod tailscale_config;
pub mod clash_parse;
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p calamity-core`
Expected: Compiles successfully

- [ ] **Step 4: Run tests**

Run: `cargo test -p calamity-core`
Expected: All tests pass (config.rs has many tests, config_io.rs has 46 tests)

- [ ] **Step 5: Commit**

```bash
git add crates/calamity-core/src/singbox/
git commit -m "feat(core): move config generation modules to calamity-core"
```

---

### Task 7: Move gateway and ruleset modules to core

**Files:**
- Create: `crates/calamity-core/src/singbox/gateway.rs`
- Create: `crates/calamity-core/src/singbox/ruleset_market.rs`
- Modify: `crates/calamity-core/src/singbox/mod.rs`

- [ ] **Step 1: Copy files to core**

Copy from `src-tauri/src/singbox/`. No changes needed:
- `gateway.rs` — uses only `std::process::Command` and `std::sync::Mutex` (no internal deps)
- `ruleset_market.rs` — uses `super::storage`

- [ ] **Step 2: Add module declarations**

Add to `crates/calamity-core/src/singbox/mod.rs`:

```rust
pub mod gateway;
pub mod ruleset_market;
```

- [ ] **Step 3: Verify compilation and tests**

Run: `cargo check -p calamity-core && cargo test -p calamity-core`
Expected: Compiles and all tests pass

- [ ] **Step 4: Commit**

```bash
git add crates/calamity-core/src/singbox/
git commit -m "feat(core): move gateway and ruleset modules to calamity-core"
```

---

### Task 8: Move BGP modules to core

**Files:**
- Create: `crates/calamity-core/src/singbox/bgp/mod.rs`
- Create: `crates/calamity-core/src/singbox/bgp/storage.rs`
- Create: `crates/calamity-core/src/singbox/bgp/codec.rs`
- Create: `crates/calamity-core/src/singbox/bgp/fsm.rs`
- Create: `crates/calamity-core/src/singbox/bgp/speaker.rs`
- Modify: `crates/calamity-core/src/singbox/mod.rs`

- [ ] **Step 1: Create bgp directory and copy files**

```bash
mkdir -p crates/calamity-core/src/singbox/bgp
```

Copy all 5 files. The BGP modules use `crate::singbox::` paths which need to change to `crate::singbox::` — same path, works identically since we're in the same `singbox` module tree.

Check `bgp/codec.rs` line 1: `use crate::singbox::rules_storage::{RouteRuleConfig, RulesData};` — this becomes `use crate::singbox::rules_storage::{RouteRuleConfig, RulesData};` — no change needed since crate root is now calamity-core.

Check `bgp/storage.rs`: `use crate::singbox::storage::{read_json, write_json};` — same, no change.

Check `bgp/fsm.rs`: `use crate::singbox::rules_storage::RulesData;` — same, no change.

- [ ] **Step 2: Add module declaration**

Add to `crates/calamity-core/src/singbox/mod.rs`:

```rust
pub mod bgp;
```

- [ ] **Step 3: Verify compilation and tests**

Run: `cargo check -p calamity-core && cargo test -p calamity-core`
Expected: Compiles and all BGP tests pass (codec: 7 tests, fsm: 4 tests, storage: 4 tests)

- [ ] **Step 4: Commit**

```bash
git add crates/calamity-core/src/singbox/bgp/
git commit -m "feat(core): move BGP modules to calamity-core"
```

---

### Task 9: Move process.rs to core (remove Tauri dependency)

`process.rs` is the only file with a Tauri import — `tauri::async_runtime::block_on` in 2 test functions. Replace with `tokio::runtime::Runtime`.

**Files:**
- Create: `crates/calamity-core/src/singbox/process.rs`
- Modify: `crates/calamity-core/src/singbox/mod.rs`

- [ ] **Step 1: Copy process.rs and fix Tauri dependency**

Copy `src-tauri/src/singbox/process.rs` to `crates/calamity-core/src/singbox/process.rs`.

The file has one cross-crate import that needs fixing:

Line ~4: `use crate::commands::settings::TunRuntimeStatus;`

This references a Tauri command module. Move the `TunRuntimeStatus` struct definition into core. Add it to `crates/calamity-core/src/singbox/process.rs` directly (before the SingboxProcess struct):

Replace this import:
```rust
use crate::commands::settings::TunRuntimeStatus;
```

With an inline definition:
```rust
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunRuntimeStatus {
    pub running: bool,
    pub mode: String,
    pub target_enhanced_mode: bool,
    pub requires_admin: bool,
    pub last_error: Option<String>,
    pub effective_dns_mode: Option<String>,
}
```

Also replace the 2 test usages of `tauri::async_runtime::block_on` (lines ~1000 and ~1015):

Replace:
```rust
let matched = tauri::async_runtime::block_on(super::wait_for_condition(
```

With:
```rust
let rt = tokio::runtime::Runtime::new().unwrap();
let matched = rt.block_on(super::wait_for_condition(
```

- [ ] **Step 2: Add module declaration**

Add to `crates/calamity-core/src/singbox/mod.rs`:

```rust
pub mod process;
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p calamity-core`
Expected: Compiles successfully

- [ ] **Step 4: Run process tests**

Run: `cargo test -p calamity-core -- singbox::process`
Expected: All process tests pass

- [ ] **Step 5: Run all core tests**

Run: `cargo test -p calamity-core`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add crates/calamity-core/src/singbox/
git commit -m "feat(core): move process.rs to calamity-core, remove tauri dependency"
```

---

### Task 10: Wire src-tauri to depend on calamity-core

Replace `src-tauri/src/singbox/` modules with re-exports from calamity-core, so all `crate::singbox::*` paths in commands still work.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/singbox/mod.rs`
- Delete: All `src-tauri/src/singbox/*.rs` files (except mod.rs)
- Delete: `src-tauri/src/singbox/bgp/` directory

- [ ] **Step 1: Add calamity-core dependency to src-tauri**

In `src-tauri/Cargo.toml`, add under `[dependencies]`:

```toml
calamity-core = { path = "../crates/calamity-core", features = ["macos"] }
```

Remove dependencies that are now in calamity-core (they'll be transitively available, but commands may still need them directly). Keep all dependencies for now — we'll clean up later after verifying everything compiles.

- [ ] **Step 2: Replace singbox/mod.rs with re-exports**

Replace `src-tauri/src/singbox/mod.rs` with:

```rust
// Re-export all modules from calamity-core so that
// `crate::singbox::storage`, `crate::singbox::process`, etc.
// continue to work throughout src-tauri/src/commands/*.

pub use calamity_core::singbox::*;
```

- [ ] **Step 3: Delete old singbox source files from src-tauri**

```bash
# Delete all .rs files in singbox/ except mod.rs
find src-tauri/src/singbox -name '*.rs' ! -name 'mod.rs' -delete
# Delete bgp subdirectory
rm -rf src-tauri/src/singbox/bgp
```

- [ ] **Step 4: Fix TunRuntimeStatus reference in commands/settings.rs**

`src-tauri/src/commands/settings.rs` defines `TunRuntimeStatus` locally. Now that it's in core's `process.rs`, update `settings.rs`:

Remove the local `TunRuntimeStatus` struct definition and replace with:
```rust
pub use crate::singbox::process::TunRuntimeStatus;
```

This keeps the `crate::commands::settings::TunRuntimeStatus` path working for any other code that references it.

- [ ] **Step 5: Verify the GUI crate compiles**

Run: `cargo check -p calamity`
Expected: Compiles successfully. All `crate::singbox::*` paths resolve through re-exports.

- [ ] **Step 6: Run all tests for both crates**

Run: `cargo test --workspace`
Expected: All tests pass in both calamity-core and calamity (src-tauri)

- [ ] **Step 7: Verify the GUI builds**

Run: `cd src-tauri && cargo build`
Expected: Builds successfully

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: wire src-tauri to use calamity-core, remove duplicated singbox modules"
```

---

### Task 11: Clean up transitive dependencies in src-tauri

Now that singbox logic lives in calamity-core, remove dependencies from src-tauri that are only used by singbox modules (now in core). Keep deps still used directly by commands/ or lib.rs.

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Identify removable dependencies**

Dependencies that can be removed from src-tauri (only used in singbox/ which is now in core):
- `rustybgp-packet` — only used in bgp/codec.rs, bgp/fsm.rs (now in core)
- `base64` — only used in subscription_fetch.rs (now in core)
- `urlencoding` — only used in subscription_fetch.rs (now in core)

Dependencies that must stay (used in commands/ or lib.rs):
- `tauri`, `tauri-plugin-*` — GUI framework
- `serde`, `serde_json` — used in commands
- `reqwest` — may be used in commands
- `tokio` — used in lib.rs background tasks
- `dirs` — may be used in commands
- `log` — may be used in commands
- `libc` — may be used in commands
- `chrono` — used in lib.rs subscription auto-update
- `uuid` — may be used in commands
- `serde_yaml` — may be used in commands
- `tokio-util` — may be used
- `plist` — may be used in commands

- [ ] **Step 2: Remove confirmed-safe dependencies**

Remove from `src-tauri/Cargo.toml`:
```
rustybgp-packet
base64
urlencoding
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p calamity`
Expected: Compiles. If any fail, add the dependency back.

- [ ] **Step 4: Run all workspace tests**

Run: `cargo test --workspace`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "build: remove transitive dependencies from src-tauri (now in calamity-core)"
```

---

### Task 12: Update version to v0.3.0-beta

**Files:**
- Modify: `src-tauri/Cargo.toml` — version to "0.3.0-beta"
- Modify: `src-tauri/tauri.conf.json` — version to "0.3.0-beta"
- Modify: `package.json` — version to "0.3.0-beta"

- [ ] **Step 1: Update all version strings**

In `src-tauri/Cargo.toml`:
```
version = "0.3.0-beta"
```

In `src-tauri/tauri.conf.json`, find the version field and update:
```
"version": "0.3.0-beta"
```

In `package.json`:
```
"version": "0.3.0-beta"
```

- [ ] **Step 2: Verify everything builds**

Run: `cargo check --workspace && npm run build`
Expected: Both succeed

- [ ] **Step 3: Run all tests**

Run: `cargo test --workspace && npm test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json package.json
git commit -m "chore: bump version to v0.3.0-beta"
```

---

### Task 13: Final verification — full build and test

**Files:** None (verification only)

- [ ] **Step 1: Clean build**

Run: `cargo clean && cargo build --workspace`
Expected: Full clean build succeeds

- [ ] **Step 2: Run all Rust tests**

Run: `cargo test --workspace`
Expected: All tests pass

- [ ] **Step 3: Run frontend tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 4: Verify Tauri dev works**

Run: `npm run tauri dev` (manual check — start and verify GUI launches)
Expected: GUI launches, dashboard loads, can start/stop proxy

- [ ] **Step 5: Verify workspace structure**

Run: `cargo metadata --format-version 1 --no-deps | python3 -c "import sys,json; pkgs=[p['name'] for p in json.load(sys.stdin)['packages']]; print(pkgs)"`
Expected: `['calamity', 'calamity-core']`
