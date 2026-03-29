# Connections Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock connections service with real sing-box Clash API data via Tauri backend streaming.

**Architecture:** Backend streams `/connections` via Tauri events (same pattern as traffic stream). New `commands/connections.rs` with subscribe, close, and close-all commands. Frontend service swaps mock for Tauri event listener. Existing UI unchanged.

**Tech Stack:** Rust (Tauri, reqwest, tokio), TypeScript (Zustand, Tauri API)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/singbox/clash_api.rs` | Modify | Add `close_connection()`, `close_all_connections()` |
| `src-tauri/src/commands/connections.rs` | Create | Tauri commands: subscribe, close, close-all |
| `src-tauri/src/commands/mod.rs` | Modify | Add `pub mod connections` |
| `src-tauri/src/lib.rs` | Modify | Register connections commands |
| `src/services/connections.ts` | Modify | Add Tauri implementation |
| `src/stores/connections.ts` | Modify | Update subscribe to use new service pattern |

---

### Task 1: Clash API — close connection methods

Modify `src-tauri/src/singbox/clash_api.rs` to add DELETE methods.

### Task 2: Tauri commands for connections

Create `src-tauri/src/commands/connections.rs` with:
- `subscribe_connections`: streams /connections every 1s, emits `connections-update` event
- `close_connection(id)`: DELETE /connections/{id}
- `close_all_connections`: DELETE /connections

### Task 3: Register commands

Wire up in mod.rs and lib.rs.

### Task 4: Frontend service

Replace mock with Tauri implementation in `src/services/connections.ts`.

### Task 5: Update store

Adjust `src/stores/connections.ts` for new data shape from real API.
