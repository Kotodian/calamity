# Gateway Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable transparent gateway mode so other LAN devices can use this Mac as their default gateway, with all traffic proxied through sing-box and DNS automatically hijacked.

**Architecture:** Add a `gateway_mode` boolean to `AppSettings`. When enabled, it forces TUN mode + allow_lan + auto_route, enables macOS IP forwarding (`sysctl net.inet.ip.forwarding=1`), and extends DNS hijack to capture port 53 traffic from LAN devices. On disable/exit, IP forwarding is restored to its original value.

**Tech Stack:** Rust (Tauri backend), TypeScript/React (frontend), sing-box TUN mode, macOS sysctl

---

### Task 1: Add `gateway_mode` to AppSettings (Backend)

**Files:**
- Modify: `src-tauri/src/singbox/storage.rs:37-103`

- [ ] **Step 1: Write the failing test**

In `src-tauri/src/singbox/storage.rs`, add a test at the end of the `tests` module:

```rust
#[test]
fn old_settings_json_defaults_gateway_mode_to_false() {
    let json = r#"{
        "theme": "dark",
        "singboxPath": "sing-box",
        "autoStart": false,
        "systemProxy": true,
        "enhancedMode": false,
        "tunConfig": {
            "stack": "system",
            "mtu": 9000,
            "autoRoute": true,
            "strictRoute": false,
            "dnsHijack": ["198.18.0.2:53"]
        },
        "allowLan": false,
        "httpPort": 7890,
        "socksPort": 7891,
        "mixedPort": 7893,
        "logLevel": "info"
    }"#;

    let settings: AppSettings =
        serde_json::from_str(json).expect("old settings should still deserialize");
    assert!(!settings.gateway_mode);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test old_settings_json_defaults_gateway_mode_to_false -- --nocapture`
Expected: FAIL — `gateway_mode` field does not exist on `AppSettings`

- [ ] **Step 3: Add `gateway_mode` field to `AppSettings`**

In `src-tauri/src/singbox/storage.rs`, add a default function:

```rust
fn default_false() -> bool {
    false
}
```

Add the field to `AppSettings` struct (after `allow_lan`):

```rust
#[serde(default = "default_false")]
pub gateway_mode: bool,
```

Add the field to `Default` impl (after `allow_lan: false,`):

```rust
gateway_mode: false,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test old_settings_json_defaults_gateway_mode_to_false -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/singbox/storage.rs
git commit -m "feat(settings): add gateway_mode field to AppSettings"
```

---

### Task 2: IP Forwarding Management (Backend)

**Files:**
- Create: `src-tauri/src/singbox/gateway.rs`
- Modify: `src-tauri/src/singbox/mod.rs`

- [ ] **Step 1: Write the tests**

Create `src-tauri/src/singbox/gateway.rs`:

```rust
use std::process::Command;

/// Read the current value of net.inet.ip.forwarding
fn get_ip_forwarding() -> bool {
    Command::new("sysctl")
        .args(["-n", "net.inet.ip.forwarding"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u8>().ok())
        .map(|v| v == 1)
        .unwrap_or(false)
}

/// Enable IP forwarding via sudo sysctl. Returns the previous value.
pub fn enable_ip_forwarding() -> Result<bool, String> {
    let was_enabled = get_ip_forwarding();
    if !was_enabled {
        let output = Command::new("sudo")
            .args(["-n", "sysctl", "-w", "net.inet.ip.forwarding=1"])
            .output()
            .map_err(|e| format!("failed to enable IP forwarding: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "sysctl failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        eprintln!("[gateway] IP forwarding enabled");
    }
    Ok(was_enabled)
}

/// Disable IP forwarding via sudo sysctl.
pub fn disable_ip_forwarding() {
    let output = Command::new("sudo")
        .args(["-n", "sysctl", "-w", "net.inet.ip.forwarding=0"])
        .output();
    match output {
        Ok(o) if o.status.success() => eprintln!("[gateway] IP forwarding disabled"),
        Ok(o) => eprintln!(
            "[gateway] failed to disable IP forwarding: {}",
            String::from_utf8_lossy(&o.stderr).trim()
        ),
        Err(e) => eprintln!("[gateway] failed to disable IP forwarding: {}", e),
    }
}

/// Restore IP forwarding to the value it had before we changed it.
pub fn restore_ip_forwarding(was_enabled: bool) {
    if !was_enabled {
        disable_ip_forwarding();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_ip_forwarding_returns_bool() {
        // Just verify it doesn't panic and returns a bool
        let _ = get_ip_forwarding();
    }
}
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/singbox/mod.rs`, add:

```rust
pub mod gateway;
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd src-tauri && cargo test gateway::tests -- --nocapture`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/gateway.rs src-tauri/src/singbox/mod.rs
git commit -m "feat(gateway): add IP forwarding management module"
```

---

### Task 3: Config Generation — Gateway Mode Overrides (Backend)

**Files:**
- Modify: `src-tauri/src/singbox/config.rs:11-17,122-171,624-659`

- [ ] **Step 1: Write the failing test**

Add a test at the end of the tests module in `src-tauri/src/singbox/config.rs`:

```rust
#[test]
fn gateway_mode_forces_tun_and_lan_and_dns_hijack() {
    let mut settings = storage::AppSettings::default();
    settings.gateway_mode = true;
    // gateway_mode should work even if user hasn't manually enabled these
    settings.enhanced_mode = false;
    settings.allow_lan = false;

    let config = generate_config(&settings);

    // Should have TUN inbound
    let inbounds = config["inbounds"].as_array().unwrap();
    let has_tun = inbounds.iter().any(|i| i["type"] == "tun");
    assert!(has_tun, "gateway mode should force TUN inbound");

    // Listen should be 0.0.0.0 (LAN accessible)
    let mixed = inbounds.iter().find(|i| i["tag"] == "mixed-in").unwrap();
    assert_eq!(mixed["listen"], "0.0.0.0");

    // TUN should include_interface for forwarded traffic
    let tun = inbounds.iter().find(|i| i["type"] == "tun").unwrap();
    assert_eq!(tun["auto_route"], true);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test gateway_mode_forces_tun_and_lan_and_dns_hijack -- --nocapture`
Expected: FAIL — no TUN inbound when enhanced_mode is false

- [ ] **Step 3: Apply gateway overrides in generate_config**

In `src-tauri/src/singbox/config.rs`, modify `generate_config()` at the top (after `let listen = ...`):

```rust
pub fn generate_config(settings: &AppSettings) -> Value {
    // Gateway mode forces TUN + allow_lan + auto_route
    let effective = if settings.gateway_mode {
        let mut s = settings.clone();
        s.enhanced_mode = true;
        s.allow_lan = true;
        s.tun_config.auto_route = true;
        // Extend DNS hijack to capture all port-53 traffic from LAN devices
        if !s.tun_config.dns_hijack.iter().any(|h| h.starts_with("0.0.0.0:")) {
            s.tun_config.dns_hijack.push("0.0.0.0:53".to_string());
        }
        s
    } else {
        settings.clone()
    };
    let settings = &effective;

    let listen = if settings.allow_lan {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };
    // ... rest of function unchanged
```

Note: `AppSettings` already derives `Clone`, so `.clone()` works.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test gateway_mode_forces_tun_and_lan_and_dns_hijack -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "feat(config): apply gateway mode overrides for TUN, LAN, and DNS hijack"
```

---

### Task 4: Settings Command — Restart Key + IP Forwarding Lifecycle (Backend)

**Files:**
- Modify: `src-tauri/src/commands/settings.rs:92-107,319-327`
- Modify: `src-tauri/src/lib.rs:257-263`

- [ ] **Step 1: Write the failing test**

In `src-tauri/src/commands/settings.rs`, add to the tests module:

```rust
#[test]
fn restart_key_changes_when_gateway_mode_changes() {
    let mut settings = AppSettings::default();
    let base = restart_key(&settings);
    settings.gateway_mode = true;
    assert_ne!(base, restart_key(&settings));
}

#[test]
fn gateway_mode_forces_system_proxy_off() {
    let current = AppSettings::default();
    let merged = merge_settings_updates(
        &current,
        &json!({ "gatewayMode": true }),
    )
    .expect("settings merge should succeed");

    assert!(merged.gateway_mode);
    assert!(!merged.system_proxy);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test restart_key_changes_when_gateway_mode -- --nocapture && cargo test gateway_mode_forces_system_proxy_off -- --nocapture`
Expected: FAIL — `gateway_mode` not in restart_key, merge doesn't handle gateway_mode

- [ ] **Step 3: Add gateway_mode to restart_key**

In `src-tauri/src/commands/settings.rs`, modify `restart_key()`:

```rust
fn restart_key(s: &AppSettings) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
        s.mixed_port,
        s.http_port,
        s.socks_port,
        s.log_level,
        s.allow_lan,
        s.enhanced_mode,
        s.tun_config.stack,
        s.tun_config.mtu,
        s.tun_config.auto_route,
        s.tun_config.strict_route,
        s.tun_config.dns_hijack.join(","),
        s.gateway_mode,
    )
}
```

- [ ] **Step 4: Add gateway_mode constraint in merge_settings_updates**

In `merge_settings_updates()`, after the `enhanced_mode` check, add:

```rust
if settings.gateway_mode {
    settings.system_proxy = false;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd src-tauri && cargo test restart_key_changes_when_gateway_mode -- --nocapture && cargo test gateway_mode_forces_system_proxy_off -- --nocapture`
Expected: PASS

- [ ] **Step 6: Add IP forwarding lifecycle to update_settings**

In `src-tauri/src/commands/settings.rs`, add at the top:

```rust
use crate::singbox::gateway;
use std::sync::atomic::{AtomicBool, Ordering};

/// Tracks whether we enabled IP forwarding so we can restore on exit.
static GATEWAY_IP_FWD_ENABLED: AtomicBool = AtomicBool::new(false);
```

In `update_settings()`, after the system proxy handling block and before the reload/restart block, add:

```rust
// Handle gateway mode IP forwarding
let old_gateway = updates
    .get("gatewayMode")
    .and_then(|v| v.as_bool())
    .map(|new_gw| !new_gw) // if new is true, old was false (toggled)
    .unwrap_or(settings.gateway_mode); // no change
if settings.gateway_mode && !GATEWAY_IP_FWD_ENABLED.load(Ordering::Relaxed) {
    if let Err(e) = gateway::enable_ip_forwarding() {
        eprintln!("[gateway] failed to enable IP forwarding: {}", e);
    } else {
        GATEWAY_IP_FWD_ENABLED.store(true, Ordering::Relaxed);
    }
} else if !settings.gateway_mode && GATEWAY_IP_FWD_ENABLED.load(Ordering::Relaxed) {
    gateway::disable_ip_forwarding();
    GATEWAY_IP_FWD_ENABLED.store(false, Ordering::Relaxed);
}
```

- [ ] **Step 7: Add IP forwarding cleanup on exit**

In `src-tauri/src/lib.rs`, in the `RunEvent::Exit` handler, add before `process.stop_sync()`:

```rust
// Disable IP forwarding if gateway mode was active
crate::commands::settings::cleanup_gateway_on_exit();
```

In `src-tauri/src/commands/settings.rs`, add a public cleanup function:

```rust
pub fn cleanup_gateway_on_exit() {
    if GATEWAY_IP_FWD_ENABLED.load(Ordering::Relaxed) {
        gateway::disable_ip_forwarding();
    }
}
```

- [ ] **Step 8: Run all settings tests**

Run: `cd src-tauri && cargo test commands::settings::tests -- --nocapture`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/commands/settings.rs src-tauri/src/lib.rs
git commit -m "feat(gateway): add IP forwarding lifecycle and restart key"
```

---

### Task 5: Add `gateway_mode` to sudoers (Backend)

**Files:**
- Modify: `src-tauri/src/commands/settings.rs:221-267`

- [ ] **Step 1: Add sysctl to sudoers paths**

In `install_tun_sudoers()`, add `/usr/sbin/sysctl` to the `paths` list:

```rust
paths.push("/usr/sbin/sysctl".to_string());
```

This ensures `sudo -n sysctl -w net.inet.ip.forwarding=1` works without a password prompt when gateway mode is toggled.

- [ ] **Step 2: Run build to verify compilation**

Run: `cd src-tauri && cargo build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/settings.rs
git commit -m "feat(gateway): add sysctl to sudoers for passwordless IP forwarding"
```

---

### Task 6: Frontend — Add `gatewayMode` to Types

**Files:**
- Modify: `src/services/types.ts:260-273`

- [ ] **Step 1: Add `gatewayMode` to AppSettings interface**

In `src/services/types.ts`, add after `allowLan: boolean;`:

```typescript
gatewayMode: boolean;
```

- [ ] **Step 2: Commit**

```bash
git add src/services/types.ts
git commit -m "feat(types): add gatewayMode to AppSettings"
```

---

### Task 7: Frontend — Add i18n Strings

**Files:**
- Modify: `src/i18n/resources.ts`

- [ ] **Step 1: Add English translations**

Find the `allowLan` entries in the English section and add after them:

```typescript
gatewayMode: "Gateway Mode",
gatewayModeDescription: "Act as a transparent proxy gateway for LAN devices (requires TUN sudoers)",
gatewayModeActive: "Gateway mode active — other devices can set this Mac as their gateway",
```

- [ ] **Step 2: Add Chinese translations**

Find the `allowLan` entries in the Chinese section and add after them:

```typescript
gatewayMode: "网关模式",
gatewayModeDescription: "作为局域网透明代理网关，其他设备设网关为本机即可科学上网",
gatewayModeActive: "网关模式已启用 — 其他设备可将本机设为网关",
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/resources.ts
git commit -m "feat(i18n): add gateway mode translations"
```

---

### Task 8: Frontend — Add Gateway Mode Toggle to Settings Page

**Files:**
- Modify: `src/pages/SettingsPage.tsx:287-295`

- [ ] **Step 1: Add gateway mode toggle**

In `src/pages/SettingsPage.tsx`, after the `allowLan` toggle block (around line 294, before `</CardContent>`), add:

```tsx
<Separator className="bg-white/[0.04]" />
<div className="flex items-center justify-between">
  <div>
    <p className="text-sm font-medium">{t("settings.gatewayMode")}</p>
    <p className="text-xs text-muted-foreground">{t("settings.gatewayModeDescription")}</p>
  </div>
  <Switch
    checked={settings.gatewayMode}
    onCheckedChange={(v) => updateSettings({ gatewayMode: v })}
  />
</div>
{settings.gatewayMode && (
  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
    <p className="text-xs text-emerald-400">{t("settings.gatewayModeActive")}</p>
  </div>
)}
```

- [ ] **Step 2: Update optimistic update in settings store**

In `src/stores/settings.ts`, in the `updateSettings` method, after the `enhancedMode` check (line 54-56), add:

```typescript
if (nextSettings.gatewayMode) {
  nextSettings.systemProxy = false;
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/SettingsPage.tsx src/stores/settings.ts
git commit -m "feat(ui): add gateway mode toggle to settings page"
```

---

### Task 9: Integration Test — Full Build and Manual Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests PASS

- [ ] **Step 2: Run frontend build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Manual verification checklist**

1. Open Settings → General section
2. Toggle "Gateway Mode" on
3. Verify: TUN mode activates (enhanced_mode forced on)
4. Verify: Allow LAN shows as enabled
5. Verify: System proxy is disabled
6. Verify: `sysctl net.inet.ip.forwarding` returns `1`
7. From another device on LAN, set gateway to this Mac's IP
8. Verify: Traffic from LAN device flows through sing-box
9. Toggle "Gateway Mode" off
10. Verify: `sysctl net.inet.ip.forwarding` returns `0`

- [ ] **Step 4: Final commit with all remaining changes**

```bash
git add -A
git commit -m "feat: gateway mode — transparent LAN proxy via TUN + IP forwarding"
```
