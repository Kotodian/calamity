# Tray Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tray window functional with real data: live traffic speeds, current browser domain detection via AppleScript, working connect/disconnect, and copy proxy address.

**Architecture:** Backend adds a Tauri command that runs AppleScript to detect the frontmost browser's URL and extract the domain. Frontend subscribes to traffic updates on tray mount, uses detected domain in site rule UI, and implements copy proxy address from settings.

**Tech Stack:** Rust/Tauri (AppleScript via `osascript`), TypeScript/React/Zustand

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create:** `src-tauri/src/commands/browser.rs` | Tauri command to detect current browser URL via AppleScript |
| **Modify:** `src-tauri/src/commands/mod.rs` | Add `pub mod browser` |
| **Modify:** `src-tauri/src/lib.rs` | Register `get_browser_url` command |
| **Modify:** `src/TrayApp.tsx` | Add traffic subscription on mount |
| **Modify:** `src/tray/TraySiteRule.tsx` | Fetch current domain from backend, editable input, add rule dialog |
| **Modify:** `src/tray/TrayActions.tsx` | Implement copy proxy address |

---

### Task 1: Browser URL Detection (Rust)

**Files:**
- Create: `src-tauri/src/commands/browser.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create browser.rs with AppleScript URL detection**

```rust
// src-tauri/src/commands/browser.rs
use std::process::Command;

/// Try to get the current browser URL via AppleScript.
/// Supports Chrome, Safari, Arc, Edge, Brave, Firefox.
#[tauri::command]
pub async fn get_browser_url() -> Result<Option<String>, String> {
    let scripts = [
        ("Google Chrome", r#"tell application "Google Chrome" to get URL of active tab of first window"#),
        ("Safari", r#"tell application "Safari" to get URL of current tab of first window"#),
        ("Arc", r#"tell application "Arc" to get URL of active tab of first window"#),
        ("Microsoft Edge", r#"tell application "Microsoft Edge" to get URL of active tab of first window"#),
        ("Brave Browser", r#"tell application "Brave Browser" to get URL of active tab of first window"#),
    ];

    // Try the frontmost app first
    let frontmost = Command::new("osascript")
        .args(["-e", r#"tell application "System Events" to get name of first application process whose frontmost is true"#])
        .output()
        .ok()
        .and_then(|o| if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).trim().to_string()) } else { None });

    if let Some(front_app) = &frontmost {
        for (app_name, script) in &scripts {
            if front_app.contains(app_name) || app_name.contains(front_app.as_str()) {
                if let Ok(output) = Command::new("osascript").args(["-e", script]).output() {
                    if output.status.success() {
                        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        if !url.is_empty() && url.starts_with("http") {
                            return Ok(Some(url));
                        }
                    }
                }
            }
        }
    }

    // Fallback: try all browsers
    for (_app_name, script) in &scripts {
        if let Ok(output) = Command::new("osascript").args(["-e", script]).output() {
            if output.status.success() {
                let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !url.is_empty() && url.starts_with("http") {
                    return Ok(Some(url));
                }
            }
        }
    }

    Ok(None)
}
```

- [ ] **Step 2: Register in mod.rs and lib.rs**

Add `pub mod browser;` to `src-tauri/src/commands/mod.rs`.
Add `commands::browser::get_browser_url,` to the invoke_handler in `src-tauri/src/lib.rs`.

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Commit**

---

### Task 2: TrayApp Traffic Subscription

**Files:**
- Modify: `src/TrayApp.tsx`

- [ ] **Step 1: Add subscribeTraffic and fetchDashboardInfo calls**

In `TrayApp.tsx`, import `subscribeTraffic` and `fetchDashboardInfo` from the connection store, and start them in the existing `useEffect`:

```typescript
const subscribeTraffic = useConnectionStore((s) => s.subscribeTraffic);
const fetchDashboardInfo = useConnectionStore((s) => s.fetchDashboardInfo);

useEffect(() => {
  fetchState();
  fetchSettings();
  fetchDashboardInfo();
  const unsub = subscribeTraffic();
  return unsub;
}, [fetchState, fetchSettings, subscribeTraffic, fetchDashboardInfo]);
```

- [ ] **Step 2: Commit**

---

### Task 3: TraySiteRule with Browser Domain Detection

**Files:**
- Modify: `src/tray/TraySiteRule.tsx`

- [ ] **Step 1: Rewrite TraySiteRule to detect browser domain and allow editing**

On mount (or when tray opens), call `get_browser_url` Tauri command, parse domain from URL, display in an editable input. Show outbound selector and "Add Rule" button.

```typescript
import { useState, useEffect } from "react";
import { Globe, Plus, Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { OutboundType } from "@/services/types";
import { useRulesStore } from "@/stores/rules";
import { cn } from "@/lib/utils";

const outboundOptions: { value: OutboundType; label: string }[] = [
  { value: "proxy", label: "Proxy" },
  { value: "direct", label: "Direct" },
  { value: "reject", label: "Reject" },
];

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function TraySiteRule() {
  const [domain, setDomain] = useState("");
  const [detecting, setDetecting] = useState(true);
  const [currentOutbound, setCurrentOutbound] = useState<OutboundType>("proxy");
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const addRule = useRulesStore((s) => s.addRule);

  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const url = await invoke<string | null>("get_browser_url");
        if (url) {
          setDomain(extractDomain(url));
        }
      } catch {
        // Not in Tauri or detection failed
      } finally {
        setDetecting(false);
      }
    })();
  }, []);

  const handleAddRule = async () => {
    if (!domain || adding) return;
    setAdding(true);
    try {
      await addRule({
        name: domain,
        enabled: true,
        matchType: "domain-suffix",
        matchValue: domain,
        outbound: currentOutbound,
      });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Current Site
      </p>
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {detecting ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="h-6 text-xs font-mono bg-muted/30 border-white/[0.06] px-2"
          />
        )}
      </div>
      <div className="flex items-center gap-1">
        {outboundOptions.map((opt) => (
          <Badge
            key={opt.value}
            variant={currentOutbound === opt.value ? "default" : "outline"}
            className={cn("cursor-pointer text-[10px]")}
            onClick={() => setCurrentOutbound(opt.value)}
          >
            {opt.label}
          </Badge>
        ))}
        <button
          onClick={handleAddRule}
          disabled={!domain || adding}
          className={cn(
            "ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-all",
            added
              ? "bg-green-500/20 text-green-400"
              : "bg-primary/10 text-primary hover:bg-primary/20",
            (!domain || adding) && "opacity-50 cursor-not-allowed"
          )}
        >
          {added ? <Check className="h-3 w-3" /> : adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {added ? "Added" : "Add Rule"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 4: Copy Proxy Address

**Files:**
- Modify: `src/tray/TrayActions.tsx`

- [ ] **Step 1: Implement copy proxy address using settings port**

```typescript
// In TrayActions.tsx, update the Copy Proxy Address button:
<button
  onClick={() => {
    const port = settings?.mixedPort ?? 7893;
    navigator.clipboard?.writeText(`127.0.0.1:${port}`);
  }}
  className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
>
  <Copy className="h-3.5 w-3.5" />
  Copy Proxy Address
</button>
```

- [ ] **Step 2: Commit**

---

### Task 5: Integration Test

- [ ] **Step 1: Build and run the app**
- [ ] **Step 2: Open a browser, navigate to a website**
- [ ] **Step 3: Click tray icon — verify domain is detected**
- [ ] **Step 4: Verify speed data is live**
- [ ] **Step 5: Verify copy proxy address copies correct value**
- [ ] **Step 6: Verify connect/disconnect works**
