# Strawberry Web (Next.js client)

Next.js web client for Strawberry Server. Supports user authentication, listing recent chat messages, sending messages, and rendering assistant replies over WebSocket events.

What's inside?

- Apps
  - web: Next.js 15.5+ app (React 19, App Router, Turbopack)
  - mobile: Expo React Native app (kept from template; optional)
- Packages
  - @repo/ui: shared UI components
  - @repo/eslint-config and @repo/typescript-config
  - @strawberry/shared: shared types (User, Message, HTTP/WS envelopes)
  - @strawberry/api-client: HTTP client (auth, me, agent, chat send)
  - @strawberry/ws-client: WebSocket client with reconnect + manual close

Requirements

- Node 20+
- pnpm 9+ (via corepack)
- Running Strawberry Server (HTTP :8080, WS :9002)
  - Build/run per server docs:
    - cmake -S . -B build -DDEBUG=ON && cmake --build build -j 4 && ./build/strawberry
  - API reference: ~/strawberry-server/docs/APIv1.md

Install

```bash
pnpm i
```

Runtime Config

- apps/web/public/app-config.json

```json
{
  "apiBaseUrl": "",
  "wsUrl": "ws://localhost:9002/ws",
  "releaseTag": "dev",
  "minServerVersion": "1.0.0"
}
```

- apiBaseUrl empty string means HTTP calls use same-origin and are proxied in dev by Next.js rewrites to http://localhost:8080, avoiding CORS.
- WebSocket connects directly to wsUrl.

Next.js Dev Proxy (HTTP only)

- apps/web/next.config.js includes a dev rewrite:
  - /v1/:path* → http://localhost:8080/v1/:path*
- This keeps browser HTTP same-origin and avoids OPTIONS preflights.

Develop

```bash
# Run only web on port 3100
pnpm --filter web dev

# Or run all workspace dev scripts
pnpm dev

# Open the app
http://localhost:3100
```

Build

```bash
pnpm --filter web build
```

Start (prod)

```bash
pnpm --filter web start   # listens on 3100
```

Features

- Auth
  - Register: POST /v1/user/register {email,password,name?}
  - Login: POST /v1/user/login {email,password}
  - Token stored in localStorage and used for subsequent calls + WS
- Chat
  - Initial history via WS action get_messages (avoids HTTP session cookie requirement)
  - New assistant replies via WS event new_message
  - Send message via HTTP POST /v1/conversations/messages {content}; ack is HTTP, assistant reply arrives via WS
  - WS client auto‑reconnects with backoff and stops on manual close

Key files

- apps/web/app/page.tsx: login/register
- apps/web/app/chat/page.tsx: chat view (WS get_messages + new_message)
- apps/web/lib/config.ts: load app-config.json
- apps/web/lib/sdk.ts: binds API + WS with token
- packages/shared/src/index.ts: shared types
- packages/api-client/src: HTTP client
- packages/ws-client/src: WebSocket client

Troubleshooting

- Port 3000 busy: web runs on 3100 to avoid conflicts with local SSE services.
- Multiple WS connections in dev: guarded by a StrictMode-safe ref and cleanup.
- 401 on /v1/conversations/messages: expected if using HTTP without a session cookie; this client uses WS get_messages for history.

Done criteria

- Register/login persists token
- Recent messages load and render
- Sending a message updates UI and assistant reply is appended via WS
- WS reconnects if dropped
