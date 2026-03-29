# Calamity Frontend Design Spec

## Overview
macOS proxy client based on SingBox with pink minimalist design. Frontend-first implementation with mock backend. No user/account system.

## Tech Stack
| Layer | Choice |
|---|---|
| Shell | Tauri v2 |
| Frontend | React + TypeScript |
| UI Components | Shadcn/ui (Radix + Tailwind) |
| Routing | React Router |
| State Management | Zustand |
| Tray Popup | Independent Tauri WebView window |

## Pages
Fixed sidebar navigation + right content area:

1. **Dashboard** — Connection status (connected/disconnected), upload/download speed, traffic stats, speed chart
2. **Nodes** — Node list with latency, group selector, latency test button
3. **Rules** — Route rules table, outbound types: Proxy/DIRECT/REJECT/Tailnet device
4. **Logs** — Real-time log stream, level filter (Debug/Info/Warn/Error), search
5. **Tailnet** — Device list with online status, Exit Node selector. No MagicDNS, no Subnet Routes
6. **DNS** — DNS server config (Fake-IP/Redir-Host/Direct modes), DNS rules, cache management
7. **Settings** — Theme toggle (light/dark), SingBox core path, auto-start, system proxy config

## Tray Popup
- Proxy mode switch: Rule / Global / Direct
- Current connection speed
- Current website rule quick-set (domain → outbound)
- Quick toggle on/off

## Theme
- Light/Dark mode via Tailwind `dark:` + CSS variables
- Pink primary color via Shadcn/ui CSS variable overrides
- Design system colors from Stitch:
  - Primary: #E91E90
  - Secondary: #F8BBD0
  - Tertiary: #FCE4EC
  - Neutral (light): #FFF0F5
  - Neutral (dark): #1A1A2E

## Mock Strategy
- `src/services/` defines interfaces
- `src/mock/` provides mock implementations with static data
- Service layer exports mock by default, switchable to real API later
- Zustand stores consume services, unaware of mock vs real

## No-Scope
- User accounts / login
- Real SingBox integration
- Real Tailscale integration
- Auto-update
