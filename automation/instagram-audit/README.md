# OpenCode daily LastBerth social job

This workflow is owned and executed by **OpenCode on this Mac**, not a cloud worker, OpenClaw, or a separate AI runtime.

The scheduled job uses a self-contained OpenCode workspace at `~/.local/share/opencode/lastberth-social/workspace`. This avoids macOS blocking unattended processes from accessing the original project under Documents. The source definitions remain in this repository. After editing them, run `node automation/instagram-audit/install-local.mjs` to sync the dedicated workspace and run `npm ci` in its `automation/instagram-audit` folder if dependencies changed.

## Configuration

- Project `opencode.json` enables `opencode-scheduler@1.3.0` and a dedicated Chrome DevTools MCP.
- OpenCode agent: `.opencode/agents/lastberth-social.md`, using `openai/gpt-6-astra` with the existing OpenCode API credential.
- Command: `/lastberth-daily-social` (or arguments `audit-only` / `login-check`).
- Skill: `.opencode/skills/lastberth-daily-audit/SKILL.md` and its audit/publishing references.
- Schedule: `0 11 * * *`, 11am on the Mac's UK local calendar. Keep the Mac's timezone set to Europe/London to follow BST/GMT. OpenCode's scheduler uses launchd underneath and catches up on waking from sleep.
- Account: **@lastberth.in**. One verified post per day; skip when no qualifying result exists.
- Corridors: NDLS→PNBE, ANVT→PPTA, CSMT→PNBE, HWH→PURI; 1–5 days ahead in India time.

The Mac needs to be logged in and online. Closing OpenCode's UI does not remove its scheduler job: the scheduler launches a fresh `opencode run`. Scheduled runs time out after 45 minutes and cannot overlap.

## Browser sign-in

```sh
node automation/instagram-audit/control.mjs ensure-browser
```

Sign in to @lastberth.in in the dedicated Chrome window. Its profile is under `~/.local/share/opencode/lastberth-social/browser`; the MCP connects at localhost:19444. It does not use your other Chrome profiles. Do not send passwords in chat or commit cookies.

## Evidence and publishing checks

The helper validates same train, exact route/date, General quota, every offered class WL/REGRET, positive available seats on every contiguous leg, non-overlapping times, fresh evidence and fare arithmetic. Tatkal, RAC, unknown classes/statuses, expanded endpoints and train changes are excluded.

The agent preserves original 1280px desktop screenshots and designs 1080×1350 screenshot-led slides. Captions disclose separate tickets and class/berth changes. The helper atomically reserves one candidate and one post per London day; uncertain publications are not retried. The agent verifies the logged-in account and resulting Instagram permalink.

Artifacts and private reports: `~/.local/share/opencode/lastberth-social/runs/`.
Latest result: `node automation/instagram-audit/control.mjs status`.
OpenCode scheduler metadata/logs: `~/.config/opencode/scheduler/` and `~/.config/opencode/logs/scheduler/`.

To manage the schedule in OpenCode: “show my scheduled jobs across all workspaces”, “show logs for LastBerth Daily Instagram”, or “delete the LastBerth Daily Instagram job”. Its scope belongs to the dedicated workspace above.

## Checks

```sh
npm ci --prefix automation/instagram-audit
npm test --prefix automation/instagram-audit
```

Restart the OpenCode UI after adding the configuration so the scheduler tools, agent, command and skill appear in the current session. New CLI sessions load them immediately.
