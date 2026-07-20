---
name: railway-project
description: Railway project/environment IDs for the traintickets (lastberth) app — use for Railway MCP/CLI calls without re-discovering via list_projects.
metadata: 
  node_type: memory
  type: reference
  originSessionId: 9c2355a7-56c9-427a-ae44-6ea3e0905eb3
---

The traintickets app's Railway project is **lastberth**, in workspace "bizzareus's Projects".

- Dashboard URL: https://railway.com/project/8cae8315-8d87-411c-9cd3-e9e8644bff84?environmentId=a63efa2d-4e09-4b35-9d50-a3588756bc70
- `project_id`: `8cae8315-8d87-411c-9cd3-e9e8644bff84`
- `environment_id` (production): `a63efa2d-4e09-4b35-9d50-a3588756bc70`
- Services:
  - `backend` — `service_id`: `979f1c46-7ca6-4dbb-8c6b-370ef1e4ed5d`
  - `frontend` — `service_id`: `1737b7dd-73e7-4728-bd1a-833e11ee6191`

Pass these IDs directly to Railway MCP tools (`mcp__railway__*`) or the CLI
(`--project lastberth --environment production --service backend`) instead of
calling `list_projects`/`railway link` again. Verify the IDs still resolve
before trusting them blindly (projects/services can be renamed or removed) —
just re-run `list_projects` if a call against these IDs 404s.

**Caution on `list_variables`/`railway variable list`**: these return raw
secret values. Never print the full output — pipe the JSON through a script
that only prints presence (SET/unset) or specific named non-secret keys, e.g.:
`railway variable list --service backend --json | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log('KEY=', d.KEY ? 'SET' : 'unset')"`.
See [[irctc-keeper-railway-status]] for the project this came up in.
