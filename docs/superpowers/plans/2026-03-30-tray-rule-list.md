# Tray Rule List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display enabled routing rules in the tray window when in "rule" mode, with per-rule outbound selection via node group dropdown, applying changes immediately.

**Architecture:** Add a `TrayRuleList` component between `TrayModeSwitch` and `TraySiteRule` in `TrayApp.tsx`, conditionally rendered when mode is "rule". The component fetches rules and node groups from existing stores, shows up to 10 enabled rules with a `<Select>` dropdown for each, and calls `updateRule` on change which triggers sing-box restart. The tray window height is increased to accommodate the list.

**Tech Stack:** React, Zustand (existing stores), shadcn/ui Select component, i18next, Tauri window API

---

### Task 1: Add i18n keys for tray rule list

**Files:**
- Modify: `src/i18n/resources.ts`

- [ ] **Step 1: Add English tray rule list keys**

In `src/i18n/resources.ts`, add keys to the `tray` section of the English translation (after the existing `systemProxy` key at line 104):

```typescript
        systemProxy: "System Proxy",
        rules: "Rules",
        viewAll: "View all in dashboard",
        noRules: "No enabled rules",
```

- [ ] **Step 2: Add Chinese tray rule list keys**

In the `zh-CN` `tray` section (after line 360):

```typescript
        systemProxy: "系统代理",
        rules: "规则",
        viewAll: "在面板中查看全部",
        noRules: "没有启用的规则",
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/resources.ts
git commit -m "feat(tray): add i18n keys for rule list"
```

---

### Task 2: Create TrayRuleList component

**Files:**
- Create: `src/tray/TrayRuleList.tsx`

- [ ] **Step 1: Create the TrayRuleList component**

Create `src/tray/TrayRuleList.tsx`:

```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRulesStore } from "@/stores/rules";
import { useNodesStore } from "@/stores/nodes";
import type { OutboundType } from "@/services/types";

const MAX_VISIBLE_RULES = 10;

function outboundDisplayValue(
  outbound: OutboundType,
  outboundNode: string | undefined,
  groups: { id: string; name: string }[]
): string {
  if (outbound === "direct") return "direct";
  if (outbound === "reject") return "reject";
  // For proxy outbound, check if it matches a group name
  if (outboundNode) {
    const group = groups.find((g) => g.name === outboundNode);
    if (group) return `group:${group.id}`;
  }
  return "proxy";
}

export function TrayRuleList() {
  const { t } = useTranslation();
  const { rules, fetchRules, updateRule } = useRulesStore();
  const { groups, fetchGroups } = useNodesStore();

  useEffect(() => {
    fetchRules();
    fetchGroups();
  }, [fetchRules, fetchGroups]);

  const enabledRules = rules.filter((r) => r.enabled).slice(0, MAX_VISIBLE_RULES);
  const totalEnabled = rules.filter((r) => r.enabled).length;

  const handleOutboundChange = async (ruleId: string, value: string) => {
    if (value === "direct" || value === "reject") {
      await updateRule(ruleId, { outbound: value as OutboundType, outboundNode: undefined });
    } else if (value === "proxy") {
      await updateRule(ruleId, { outbound: "proxy", outboundNode: undefined });
    } else if (value.startsWith("group:")) {
      const groupId = value.slice(6);
      const group = groups.find((g) => g.id === groupId);
      if (group) {
        await updateRule(ruleId, { outbound: "proxy", outboundNode: group.name });
      }
    }
  };

  const openDashboardRules = async () => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const main = await WebviewWindow.getByLabel("main");
      if (main) {
        await main.show();
        await main.unminimize();
        await main.setFocus();
      }
    } catch (e) {
      console.error("Failed to open dashboard:", e);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {t("tray.rules")}
      </p>
      {enabledRules.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 py-1">{t("tray.noRules")}</p>
      ) : (
        <div className="space-y-1 max-h-[240px] overflow-y-auto">
          {enabledRules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-1.5">
              <span className="text-[11px] truncate flex-1 min-w-0" title={rule.name}>
                {rule.name}
              </span>
              <Select
                value={outboundDisplayValue(rule.outbound, rule.outboundNode, groups)}
                onValueChange={(v) => handleOutboundChange(rule.id, v)}
              >
                <SelectTrigger className="h-6 w-[90px] shrink-0 bg-transparent text-[10px] border-white/[0.06] px-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proxy">{t("common.outbound.proxy")}</SelectItem>
                  <SelectItem value="direct">{t("common.outbound.direct")}</SelectItem>
                  <SelectItem value="reject">{t("common.outbound.reject")}</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={`group:${g.id}`}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
      {totalEnabled > MAX_VISIBLE_RULES && (
        <button
          onClick={openDashboardRules}
          className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          {t("tray.viewAll")}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tray/TrayRuleList.tsx
git commit -m "feat(tray): create TrayRuleList component with group selection"
```

---

### Task 3: Integrate TrayRuleList into TrayApp

**Files:**
- Modify: `src/TrayApp.tsx`

- [ ] **Step 1: Add TrayRuleList import and conditional rendering**

In `src/TrayApp.tsx`, add the import:

```typescript
import { TrayRuleList } from "./tray/TrayRuleList";
```

Add the `useConnectionStore` mode selector:

```typescript
const mode = useConnectionStore((s) => s.mode);
```

Insert `TrayRuleList` between `TrayModeSwitch` and `TraySiteRule`, conditionally rendered when mode is "rule":

```tsx
        <TrayModeSwitch />
        {mode === "rule" && (
          <>
            <Separator className="bg-border/50" />
            <TrayRuleList />
          </>
        )}
        <Separator className="bg-border/50" />
        <TraySiteRule />
```

- [ ] **Step 2: Commit**

```bash
git add src/TrayApp.tsx
git commit -m "feat(tray): show rule list in tray when rule mode active"
```

---

### Task 4: Increase tray window height

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Increase logical_h to accommodate rule list**

In `src-tauri/src/lib.rs`, change the tray window height from 420 to 600 to accommodate up to 10 rules in the list:

```rust
                                let logical_h = 600.0_f64;
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tray): increase tray window height for rule list"
```

---

### Task 5: Verify and test

- [ ] **Step 1: Build the frontend to check for compilation errors**

```bash
cd /Users/linqiankai/calamity && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Manual verification checklist**

Run `npm run dev` (or `cargo tauri dev`) and verify:
- In "rule" mode, the tray shows enabled rules with dropdown selectors
- Each dropdown lists: Proxy, Direct, Reject, and all node group names
- Changing a dropdown immediately updates the rule and restarts sing-box
- When more than 10 enabled rules exist, a "View all in dashboard" link appears
- Switching to "global" or "direct" mode hides the rule list
- The tray window has no overflow/clipping issues

- [ ] **Step 3: Commit any fixes if needed**
