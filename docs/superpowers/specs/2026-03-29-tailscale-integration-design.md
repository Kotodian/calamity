# Tailscale Integration Design

## Goal

Replace mock Tailscale data with real `tailscale` CLI integration. Support device listing, exit node switching, login/logout, and Funnel management.

## Architecture

Backend (Rust/Tauri) executes `tailscale` CLI commands and parses output. Frontend service layer switches from mock to Tauri invoke calls. Existing UI is kept as-is — it's already production-ready.

### CLI Path Detection

1. Try `which tailscale` first
2. Fall back to `/Applications/Tailscale.app/Contents/MacOS/Tailscale`
3. If neither found, return error prompting user to install Tailscale

### CLI Command Mapping

| Tauri Command | CLI Call | Purpose |
|---------------|----------|---------|
| `tailscale_status` | `tailscale status --json` | Account info + device list + exit node state |
| `tailscale_login` | `tailscale login` | Trigger browser auth flow |
| `tailscale_logout` | `tailscale logout` | Sign out |
| `tailscale_set_exit_node` | `tailscale set --exit-node=<ip>` | Set or clear exit node |
| `tailscale_get_serve_status` | `tailscale serve status --json` | Get serve/funnel config |
| `tailscale_add_funnel` | `tailscale funnel <port>` | Add funnel on port |
| `tailscale_remove_funnel` | `tailscale funnel <port> off` | Remove funnel on port |

## Data Model Mapping

### `tailscale status --json` Output → TailnetAccount + TailnetDevice[]

The `tailscale status --json` output structure:

```json
{
  "Self": {
    "ID": "n1234",
    "HostName": "my-mac",
    "DNSName": "my-mac.tailnet-name.ts.net.",
    "TailscaleIPs": ["100.x.y.z", "fd7a::1"],
    "OS": "macOS",
    "Online": true,
    "ExitNode": false,
    "ExitNodeOption": true
  },
  "Peer": {
    "nodekey:abc123": {
      "ID": "n5678",
      "HostName": "server",
      "DNSName": "server.tailnet-name.ts.net.",
      "TailscaleIPs": ["100.a.b.c"],
      "OS": "linux",
      "Online": true,
      "ExitNode": false,
      "ExitNodeOption": true,
      "LastSeen": "2026-03-29T10:00:00Z"
    }
  },
  "CurrentTailnet": {
    "Name": "user@example.com",
    "MagicDNSSuffix": "tailnet-name.ts.net"
  },
  "BackendState": "Running"
}
```

**Mapping:**

- `TailnetAccount.loginName` ← `CurrentTailnet.Name`
- `TailnetAccount.tailnetName` ← `CurrentTailnet.MagicDNSSuffix`
- `TailnetAccount.loggedIn` ← `BackendState == "Running"`
- `TailnetDevice.id` ← `ID`
- `TailnetDevice.name` ← `DNSName` (trimmed of trailing dot and suffix)
- `TailnetDevice.hostname` ← `HostName`
- `TailnetDevice.ip` ← `TailscaleIPs[0]`
- `TailnetDevice.os` ← `OS`
- `TailnetDevice.status` ← `Online ? "online" : "offline"`
- `TailnetDevice.isExitNode` ← `ExitNodeOption`
- `TailnetDevice.isCurrentExitNode` ← `ExitNode`
- `TailnetDevice.isSelf` ← from `Self` vs `Peer`
- `TailnetDevice.lastSeen` ← `LastSeen` (or now for Self)

### `tailscale serve status --json` Output → FunnelEntry[]

```json
{
  "TCP": {},
  "Web": {
    "foo.tailnet-name.ts.net:443": {
      "Handlers": {
        "/": {
          "Proxy": "http://127.0.0.1:3000"
        }
      }
    }
  },
  "AllowFunnel": {
    "foo.tailnet-name.ts.net:443": true
  }
}
```

**Mapping:**

- Parse `Web` entries to extract port from proxy URL
- Check `AllowFunnel` to determine if funnel is enabled (public) vs serve-only (local)
- `FunnelEntry.localPort` ← extracted from proxy URL
- `FunnelEntry.publicUrl` ← the key in Web (e.g., `https://foo.tailnet-name.ts.net`)
- `FunnelEntry.enabled` ← always true (configured = enabled)
- `FunnelEntry.allowPublic` ← `AllowFunnel[key]`
- `FunnelEntry.protocol` ← "https" for Web entries, "tcp" for TCP entries

## Login Flow

1. Frontend calls `tailscale_login`
2. Backend runs `tailscale login`
3. CLI outputs auth URL to stderr
4. Backend parses URL, opens system browser via `open <url>` on macOS
5. Backend returns auth URL to frontend (displayed as fallback)
6. User completes auth in browser
7. Frontend polls `tailscale_status` to detect login completion

## Error Handling

- **Tailscale not installed**: `tailscale_status` returns specific error, UI shows install prompt
- **Not logged in**: `BackendState != "Running"`, UI shows login panel (existing)
- **CLI execution failure**: Return error string, frontend shows toast
- **Exit node not available**: CLI returns error, pass through to frontend

## Update Strategy

- Device list: Fetch on page enter + manual refresh button
- No auto-polling — device status changes infrequently
- After exit node change: re-fetch status to confirm

## Files

### Backend (Create)
- `src-tauri/src/commands/tailscale.rs` — All Tauri commands
- `src-tauri/src/singbox/tailscale_cli.rs` — CLI execution and output parsing

### Backend (Modify)
- `src-tauri/src/commands/mod.rs` — Add `pub mod tailscale`
- `src-tauri/src/singbox/mod.rs` — Add `pub mod tailscale_cli`
- `src-tauri/src/lib.rs` — Register commands

### Frontend (Modify)
- `src/services/tailnet.ts` — Add Tauri implementation alongside mock
- Minor store/UI adjustments if needed

### Frontend (No Change)
- `src/stores/tailnet.ts` — Interface matches, no changes needed
- `src/pages/TailnetPage.tsx` — UI already complete
- `src/services/types.ts` — Types already defined
