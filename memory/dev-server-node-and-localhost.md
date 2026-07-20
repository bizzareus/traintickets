---
name: dev-server-node-and-localhost
description: How to run the traintickets Next dev server (Node 22 via nvm) and reach localhost from tooling
metadata: 
  node_type: memory
  type: reference
  originSessionId: 9c2355a7-56c9-427a-ae44-6ea3e0905eb3
---

Running the `traintickets` app locally has two non-obvious gotchas:

1. **Node version**: the login shell defaults to `~/.nvm/versions/node/v14.16.1` (Node 14), but the project needs **Node 22.x** (`package.json` engines). Node 14 fails immediately with `Cannot find module 'node:events'` when starting Next. Prepend Node 22 to PATH before any npm/next command:
   `export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$PATH"`

2. **localhost networking from the Bash tool is sandboxed**: `curl http://localhost:3010` / `:3009` returns HTTP 000 even when the server is up. The running dev server itself CAN reach `localhost:3009` (the NestJS API). To curl a local server from Bash, pass `dangerouslyDisableSandbox: true` — though even that sometimes still blocks; prefer verifying via the dev server's own logs/behavior.

Scripts: `npm run dev` = api(3009)+web(3010) concurrently; `npm run dev:web` = web only on 3010. API base for the web app is `API_URL`/`NEXT_PUBLIC_API_URL` (`.env`, default `http://localhost:3009`).
