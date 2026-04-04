# Process Info in Connections & App Picker for Rules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable process-level visibility in the connections list, and provide a native app picker UI for selecting macOS applications when creating process-path rules.

**Architecture:** Two independent changes: (1) Enable `find_process` in sing-box route config so the Clash API returns `processPath` metadata — the frontend already displays it. (2) Add a Rust command that scans `/Applications` (+ `~/Applications`) for `.app` bundles, parses `Info.plist` for display name and executable path, and returns a list to the frontend. The rules page gets a "Browse" button next to the match value input that opens a searchable app picker popover.

**Tech Stack:** Rust (plist crate for Info.plist parsing), Tauri 2 IPC, React, shadcn/ui Popover + Command components.

---

### Task 1: Enable `find_process` in sing-box route config

**Files:**
- Modify: `src-tauri/src/singbox/config.rs:88-94`

- [ ] **Step 1: Add `find_process` to the route section**

In `src-tauri/src/singbox/config.rs`, modify the route section construction (around line 88):

```rust
let mut route_section = json!({
    "auto_detect_interface": true,
    "find_process": true,
    "final": route_final,
    "default_domain_resolver": {
        "server": default_resolver
    }
});
```

- [ ] **Step 2: Build and verify**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "feat(singbox): enable find_process in route config for process-level connection visibility"
```

---

### Task 2: Add Rust command to list installed macOS apps

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `plist` dependency)
- Create: `src-tauri/src/commands/apps.rs`
- Modify: `src-tauri/src/commands/mod.rs` (add module)
- Modify: `src-tauri/src/lib.rs` (register command)

- [ ] **Step 1: Add `plist` crate dependency**

In `src-tauri/Cargo.toml`, add under `[dependencies]`:

```toml
plist = "1"
```

- [ ] **Step 2: Create the `list_apps` command**

Create `src-tauri/src/commands/apps.rs`:

```rust
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub bundle_id: String,
    pub executable_path: String,
    pub app_path: String,
}

fn scan_app_dir(dir: &Path) -> Vec<AppInfo> {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut apps = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.extension().is_some_and(|ext| ext == "app") {
            continue;
        }

        let plist_path = path.join("Contents/Info.plist");
        let plist: plist::Dictionary = match plist::from_file(&plist_path) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let name = plist
            .get("CFBundleName")
            .or_else(|| plist.get("CFBundleDisplayName"))
            .and_then(|v| v.as_string())
            .unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
            })
            .to_string();

        let bundle_id = plist
            .get("CFBundleIdentifier")
            .and_then(|v| v.as_string())
            .unwrap_or("")
            .to_string();

        let executable = plist
            .get("CFBundleExecutable")
            .and_then(|v| v.as_string())
            .unwrap_or("")
            .to_string();

        if executable.is_empty() {
            continue;
        }

        let executable_path = path
            .join("Contents/MacOS")
            .join(&executable)
            .to_string_lossy()
            .to_string();

        apps.push(AppInfo {
            name,
            bundle_id,
            executable_path,
            app_path: path.to_string_lossy().to_string(),
        });
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

#[tauri::command]
pub async fn list_apps() -> Result<Vec<AppInfo>, String> {
    let mut apps = scan_app_dir(Path::new("/Applications"));

    // Also scan ~/Applications
    if let Some(home) = dirs::home_dir() {
        apps.extend(scan_app_dir(&home.join("Applications")));
    }

    // Also scan /System/Applications
    apps.extend(scan_app_dir(Path::new("/System/Applications")));

    // Deduplicate by bundle_id
    let mut seen = std::collections::HashSet::new();
    apps.retain(|app| {
        if app.bundle_id.is_empty() {
            return true;
        }
        seen.insert(app.bundle_id.clone())
    });

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(apps)
}
```

- [ ] **Step 3: Register the module and command**

In `src-tauri/src/commands/mod.rs`, add:

```rust
pub mod apps;
```

In `src-tauri/src/lib.rs`, add `commands::apps::list_apps` to the `invoke_handler` list.

- [ ] **Step 4: Build and verify**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/commands/apps.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(apps): add list_apps command to enumerate installed macOS applications"
```

---

### Task 3: Add frontend app picker to the rules page

**Files:**
- Modify: `src/pages/RulesPage.tsx` (add browse button + app picker popover)
- Modify: `src/i18n/resources.ts` (add i18n keys)

- [ ] **Step 1: Add i18n keys**

In `src/i18n/resources.ts`, add under the `rules` namespace for both `en` and `zhCN`:

English:
```typescript
browseApp: "Browse",
selectApp: "Select Application",
searchApp: "Search applications...",
noAppsFound: "No applications found",
```

Chinese:
```typescript
browseApp: "浏览",
selectApp: "选择应用程序",
searchApp: "搜索应用程序...",
noAppsFound: "未找到应用程序",
```

- [ ] **Step 2: Add app picker to RulesPage**

In `src/pages/RulesPage.tsx`:

1. Add imports:
```typescript
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { FolderOpen } from "lucide-react";
```

2. Add state for app list and popover:
```typescript
const [apps, setApps] = useState<{ name: string; bundleId: string; executablePath: string; appPath: string }[]>([]);
const [appPickerOpen, setAppPickerOpen] = useState(false);
```

3. Add app loading effect (lazy-load when picker opens):
```typescript
useEffect(() => {
  if (!appPickerOpen || apps.length > 0) return;
  (async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<typeof apps>("list_apps");
      setApps(result);
    } catch {
      // Not on Tauri or command failed
    }
  })();
}, [appPickerOpen]);
```

4. Next to the match value `<Input>`, when `form.matchType` is `"process-path"`, add a browse button with popover:

```tsx
{(form.matchType === "process-path" || form.matchType === "process-name") && (
  <Popover open={appPickerOpen} onOpenChange={setAppPickerOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className="shrink-0 border-white/[0.06]">
        <FolderOpen className="h-3.5 w-3.5 mr-1" />
        {t("rules.browseApp")}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-[300px] p-0" align="start">
      <Command>
        <CommandInput placeholder={t("rules.searchApp")} />
        <CommandList className="max-h-[240px]">
          <CommandEmpty>{t("rules.noAppsFound")}</CommandEmpty>
          {apps.map((app) => (
            <CommandItem
              key={app.executablePath}
              value={`${app.name} ${app.bundleId}`}
              onSelect={() => {
                setForm({
                  ...form,
                  matchValue: form.matchType === "process-name"
                    ? app.executablePath.split("/").pop() || app.name
                    : app.executablePath,
                });
                setAppPickerOpen(false);
              }}
              className="text-xs"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{app.name}</span>
                <span className="text-[10px] text-muted-foreground truncate">{app.bundleId}</span>
              </div>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
)}
```

- [ ] **Step 3: Verify Command and Popover components exist**

Check that `@/components/ui/command` and `@/components/ui/popover` exist. If not, generate them with shadcn:

```bash
npx shadcn@latest add command popover
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/RulesPage.tsx src/i18n/resources.ts
git commit -m "feat(rules): add app picker for process-path and process-name rule types"
```

---

### Task 4: Version bump and release

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Bump version to 0.2.15-beta**

Update version in all three files from current version to `0.2.15-beta`.

- [ ] **Step 2: Commit and push**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: bump version to 0.2.15-beta"
git push origin main
```

- [ ] **Step 3: Trigger release build**

```bash
gh workflow run manual-release.yml --ref main -f tag_name=v0.2.15-beta
```
