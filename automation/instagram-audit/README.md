# Daily screenshot audit and Instagram publisher

Approved configuration: daily **11:00 Europe/London** (BST/GMT aware), account **@lastberth.in**, rotating NDLS→PNBE, ANVT→PPTA, CSMT→PNBE and HWH→PURI, travel dates 1–5 days ahead in India time.

This is an isolated worker, not part of the ticket-search app. It uses Railway's authenticated agent runtime, two persistent Chromium profiles, browser skills, and deterministic verification before invoking the Instagram publishing workflow. AI usage and worker compute are billed by Railway.

## Execution

- The scheduler starts the audit at 11am. Publication follows verification/image generation; it is not guaranteed to occur at exactly 11am.
- After a host restart past 11am, the worker catches up once if that London day's run was never started. An interrupted/uncertain run is never automatically retried.
- At most one daily run and one post attempt. No qualifying result means no post.
- All offered General-quota classes must be explicitly WL/REGRET. Tatkal, RAC, missing statuses, city-cluster substitutions, expanded endpoints and multi-train alternatives are excluded.
- Exact route/date/train, contiguous legs, positive seats on every leg, timestamps and fare arithmetic are verified by `validation.mjs`.
- Preserve 1280px-wide original screenshots. Produce 2–4 original-screenshot-based 1080×1350 slides and a caption disclosing split tickets and class/berth changes.
- The publisher checks fresh availability and the signed-in account, uses Instagram's Create/Post browser flow, clicks Share once, then verifies the permalink. An uncertain attempt stays claimed and is never retried automatically.
- A missing/expired login, challenge or 2FA stops publication and leaves a report. No credentials are committed.

## Host

Railway project `8cae8315-8d87-411c-9cd3-e9e8644bff84`, environment `a63efa2d-4e09-4b35-9d50-a3588756bc70`, cloud agent `c8f57243-0324-4561-abb7-49bbd7ec88a6` (`lastberth-instagram-audit`).

Worker runs in Docker with `--restart unless-stopped`, host networking (all HTTP/CDP listeners bind loopback), persistent `/app/instagram-audit/data:/data`, and a read-only mount of `/usr/local/bin/railway-agent` from the host. Supply ONLY `AI_AGENT_KEY`, `AI_GATEWAY_URL` and optional `AI_AGENT_MODEL` through a private environment file. Do not pass a Railway management token into the container.

## Inspection

On the worker host:

```sh
curl http://127.0.0.1:3098/health
curl -X POST http://127.0.0.1:3098/run-draft  # audit + images; never posts
docker logs --tail 30 lastberth-instagram-audit
docker stop lastberth-instagram-audit         # pauses scheduling
docker start lastberth-instagram-audit
```

Each run writes `/data/runs/<London-date>/result.json`, the structured audit, report, original screenshots, slide PNGs and private agent logs. `/data/latest.json` is the latest result. `/data/post-claims/` prevents posting the same train/route/journey date twice, including ambiguous attempts.

## One-time Instagram login

The dedicated Instagram browser has no login initially. Authenticate @lastberth.in in that browser through an SSH-forwarded Chrome DevTools connection to port 9223. Do not send a password or cookie value in chat or commit them. Verify the account before enabling a real daily post; `/health` reports whether a session cookie is present, and the publisher separately checks account identity.

On this Mac, the registered SSH identity is `~/.ssh/id_rsa`. A localhost-only tunnel can be opened with:

```sh
ssh -fNT -i ~/.ssh/id_rsa -o IdentitiesOnly=yes -o ExitOnForwardFailure=yes \
  -o UserKnownHostsFile=~/.railway/known_hosts_relay \
  -L 127.0.0.1:19223:127.0.0.1:9223 \
  'agent:a63efa2d-4e09-4b35-9d50-a3588756bc70:lastberth-instagram-audit@ssh.railway.com'
```

Open `chrome://inspect/#devices` in Chrome, configure `localhost:19223` under Discover network targets, then inspect the Instagram page. Use Toggle Screencast to interact with the login form. The target ID changes when Chromium restarts; discover it again instead of reusing an old inspector URL. Close the tunnel after login; the remote browser and daily worker keep running.

The worker cannot bypass Instagram login challenges or guarantee that Instagram will keep an unattended session valid. Check the daily result when a post is absent.

## Checks

```sh
npm ci
npm test
node --check worker.mjs
```
