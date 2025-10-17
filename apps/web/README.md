# Strawberry Web (apps/web)

Next.js client for Strawberry Server (auth, chat history via WS get_messages, send via HTTP, assistant replies via WS events).

Run

```bash
# From repo root
pnpm --filter web dev
# open http://localhost:3100
```

Runtime config

- apps/web/public/app-config.json

```json
{
  "apiBaseUrl": "",
  "wsUrl": "ws://localhost:9002/ws",
  "releaseTag": "dev",
  "minServerVersion": "1.0.0"
}
```

Dev proxy

- apps/web/next.config.js rewrites /v1/* → http://localhost:8080/v1/* so HTTP is same‑origin in dev and avoids CORS preflights. WS connects directly using wsUrl.

Endpoints used

- Auth: POST /v1/user/register, POST /v1/user/login
- Chat (HTTP): POST /v1/conversations/messages
- Chat (WS): action get_messages, event new_message

Notes

- Dev server runs on port 3100 to avoid conflicts.
- WS connections are guarded to prevent duplicates in React Strict Mode.
