# PerimeterGuard — Frontend

A working React frontend for the Perimeter Guard Post Checking Solution, covering **both** applications described in the design brief:

- **Web Control Room / Admin Dashboard** — 12 screens (`/web/*`)
- **Handheld Scanner App** — 8 screens (`/mobile/*`), styled for a phone-sized viewport

This is a frontend-only build: all data lives in React state (via Context + `useReducer`) and is persisted to `localStorage` so a page refresh doesn't lose your demo data. There is no backend — wiring it to a real local server / REST API is the natural next step (see **Connecting a real backend** below).

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173
```

Open `http://localhost:5173/web/login` for the dashboard, or `http://localhost:5173/mobile/login` for the handheld app (best viewed narrow — resize your browser or open dev tools' device toolbar).

Build for production:

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Demo accounts

| Surface | Login | Password / PIN |
|---|---|---|
| Web dashboard | `r.sharma` (Administrator) | `password` |
| Web dashboard | `p.nair` (Security Officer) | `password` |
| Web dashboard | `k.iyer` (Supervisor) | `password` |
| Web dashboard | `v.rao` (Checking Officer — limited web access) | `password` |
| Handheld app | Officer ID `OFC-014` (or any officer ID in Officer Management) | PIN `1234` |

Role-based navigation and per-module view/edit permissions are enforced live — edit them yourself in **User Roles & Access Control** and watch the sidebar / buttons change immediately.

## What's actually functional

This isn't a static mockup — every screen reads and writes real application state:

- **Guard Post Management** — add / edit / delete posts, toggle active, zones.
- **QR Code Management** — generates a real, scannable QR code (via `qrcode.react`) encoding the post ID, downloadable as PNG.
- **Officer Management** — add / edit / remove officers, reset PIN.
- **Round & Route Management** — build a round's post sequence (add/remove/reorder stops), assign officers, shift, frequency, late threshold, active days.
- **Live Round Monitoring** — start a round and record scans directly from the web (useful for demoing without a phone): choosing a post other than the expected one simulates an out-of-sequence scan, and the classification logic (on-time / late / missed) runs for real.
- **Alerts & Exceptions** — acknowledge / resolve alerts that were actually raised by the scan logic (or by the handheld app's Emergency button).
- **Reports** — filters by date range and report type, computed live from session/scan history, with working **CSV export** and print-to-PDF.
- **Guard Post History (Audit Trail)** — full scan log per post with a deterministic "tamper-evident" record hash.
- **User Roles & Access Control** — live permission matrix; toggling a checkbox immediately changes what that role can see.
- **Settings** — sync method / auto-sync / backup config, plus a simulated per-device sync with a progress bar.
- **Handheld app** — officer login, round selection, **real camera QR scanning** (via `html5-qrcode`, with a manual-entry fallback when no camera is available/permitted), remark chips + real photo capture (`<input capture="environment">`), round progress with a live "behind schedule" calculation, round completion (auto-logs any un-scanned stops as **Missed**), simulated sync, and an Emergency button that raises a real alert visible immediately in the web dashboard's Alerts page (same shared state).

## Project structure

```
src/
  lib/
    mockData.js       seed data (posts, officers, rounds, alerts, users, shifts...)
    utils.js          formatting, CSV export, scan classification helpers
  context/
    DataContext.jsx   the single source of truth — reducer + all business logic
  components/
    web/              Sidebar, Topbar, Modal, form primitives, badges, layout
    mobile/           phone chrome, bottom nav, remark chips
  pages/
    web/              the 12 dashboard screens
    mobile/           the 8 handheld screens
```

`DataContext.jsx` is the most important file to read first — it documents every action (`startSession`, `recordScan`, `completeSession`, `sendEmergencyAlert`, etc.) that encodes the actual round/scan/alert business rules from the design brief.

## Connecting a real backend

Everything the reducer does maps directly onto REST endpoints you'd build against the "local server / main gate PC" described in the original solution:

- `POST /posts`, `PATCH /posts/:id` ↔ `addPost` / `updatePost`
- `POST /posts/:id/qr` ↔ `generateQR`
- `POST /rounds/:id/sessions` ↔ `startSession`
- `POST /sessions/:id/scans` ↔ `recordScan`
- `POST /sessions/:id/complete` ↔ `completeSession`
- `POST /alerts/:id/acknowledge` / `/resolve` ↔ `acknowledgeAlert` / `resolveAlert`
- `POST /devices/:id/sync` ↔ `syncDevice`

The cleanest path is to replace the body of each function in `DataContext.jsx` with a `fetch`/axios call, and switch from `useReducer` state to a data-fetching layer (React Query, SWR, etc.) once a backend exists — the screens themselves don't need to change since they only call `actions.*` and read state from `useData()`.

## Notes on the QR scanning integration

The handheld **QR Scan** screen uses [`html5-qrcode`](https://github.com/mebjas/html5-qrcode) to request the device camera and decode QR codes in real time. Since the QR codes generated in **QR Code Management** encode the post's ID directly (e.g. `PST-003`), scanning a printed QR with a phone browser will work out of the box against this frontend. If the browser has no camera or the user denies permission, the screen automatically falls back to a manual "Enter Code Manually" post picker — this fallback is always available, not only when the camera fails.
