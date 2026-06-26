#!/usr/bin/env node
/**
 * sync-chart-times.mjs — Railway cron job that bulk-generates chart-times pages
 * on the live site and commits them back to GitHub.
 *
 * Flow:
 *   1. Clone the repo fresh (token auth) into a temp dir.
 *   2. Read scripts/chart-times-trains.json and take a batch of pending trains.
 *   3. For each, GET <SITE_URL>/api/chart-times-data/<n> (the real generation
 *      code) and write content/chart-times/<slug>.json into the clone.
 *   4. Mark progress (completed / slug / canonicalNumber / httpStatus).
 *   5. Commit, `git pull --rebase`, and push (retrying on races with other bots).
 *
 * Required env:
 *   GITHUB_TOKEN   fine-grained PAT for the repo (Contents: Read & Write)
 *   SITE_URL       live web app base, e.g. https://lastberth.com
 * Optional env:
 *   GITHUB_REPO              default "bizzareus/traintickets"
 *   GIT_BRANCH               default "main"
 *   CHART_TIMES_SYNC_SECRET  sent as x-sync-secret if the endpoint is protected
 *   SYNC_BATCH               trains per run (default 200)
 *   SYNC_RETRIES             per-train retries on non-200 (default 2)
 *   GIT_AUTHOR_NAME/EMAIL    commit identity (defaults to a bot identity)
 *   DRY_RUN                  "1" to generate + write but skip commit/push
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const env = process.env;
const TOKEN = env.GITHUB_TOKEN;
const SITE_URL = (env.SITE_URL || "").replace(/\/$/, "");
const REPO = env.GITHUB_REPO || "bizzareus/traintickets";
const BRANCH = env.GIT_BRANCH || "main";
const SECRET = env.CHART_TIMES_SYNC_SECRET || "";
const BATCH = Number(env.SYNC_BATCH || 200);
const RETRIES = Number(env.SYNC_RETRIES || 2);
const RETRY_DELAY_MS = 4000;
const REQ_TIMEOUT_MS = 180_000;
const AUTHOR_NAME = env.GIT_AUTHOR_NAME || "chart-times-bot";
const AUTHOR_EMAIL = env.GIT_AUTHOR_EMAIL || "bot@lastberth.com";
const DRY_RUN = env.DRY_RUN === "1";
const TRAIN_LIST_REL = "scripts/chart-times-trains.json";

function die(msg) {
  console.error(`[sync] ERROR: ${msg}`);
  process.exit(1);
}
if (!TOKEN) die("GITHUB_TOKEN is required.");
if (!SITE_URL) die("SITE_URL is required (e.g. https://lastberth.com).");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run git without ever printing the token-bearing remote URL.
function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  }).trim();
}

async function fetchTrainData(num) {
  const url = `${SITE_URL}/api/chart-times-data/${num}`;
  const headers = SECRET ? { "x-sync-secret": SECRET } : {};
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
  });
  if (res.status === 200) return { ok: true, data: await res.json() };
  return { ok: false, status: res.status };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chart-times-sync-"));
  const repoDir = path.join(tmp, "repo");
  const remote = `https://x-access-token:${TOKEN}@github.com/${REPO}.git`;

  console.log(`[sync] cloning ${REPO}#${BRANCH} ...`);
  git(["clone", "--single-branch", "--branch", BRANCH, "--quiet", remote, repoDir]);
  git(["config", "user.name", AUTHOR_NAME], repoDir);
  git(["config", "user.email", AUTHOR_EMAIL], repoDir);

  const listPath = path.join(repoDir, TRAIN_LIST_REL);
  if (!fs.existsSync(listPath)) die(`${TRAIN_LIST_REL} not found in repo.`);
  const trains = JSON.parse(fs.readFileSync(listPath, "utf8"));
  if (!Array.isArray(trains)) die(`${TRAIN_LIST_REL} is not a JSON array.`);

  const contentDir = path.join(repoDir, "content", "chart-times");
  fs.mkdirSync(contentDir, { recursive: true });

  const pending = trains.filter((t) => t && t.completed !== true).slice(0, BATCH);
  console.log(
    `[sync] ${trains.length} trains, ${trains.filter((t) => t?.completed === true).length} done; processing ${pending.length} this run.`,
  );
  if (pending.length === 0) {
    console.log("[sync] nothing to do.");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const entry of pending) {
    const num = String(entry.trainNumber || "").trim();
    if (!/^\d{3,6}$/.test(num)) continue;

    let result = { ok: false, status: 0 };
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        result = await fetchTrainData(num);
      } catch {
        result = { ok: false, status: 0 };
      }
      if (result.ok) break;
      if (attempt < RETRIES) await sleep(RETRY_DELAY_MS);
    }

    if (result.ok && result.data?.slug) {
      const data = result.data;
      fs.writeFileSync(
        path.join(contentDir, `${data.slug}.json`),
        JSON.stringify(data, null, 2) + "\n",
        "utf8",
      );
      entry.completed = true;
      entry.httpStatus = 200;
      entry.slug = data.slug;
      entry.canonicalNumber = String(data.trainNumber || "").trim();
      ok++;
      console.log(`[sync] ok   ${num} -> ${data.slug}`);
    } else {
      entry.completed = false;
      entry.httpStatus = result.status || 0;
      failed++;
      console.log(`[sync] fail ${num} (HTTP ${result.status || 0})`);
    }
  }

  fs.writeFileSync(listPath, JSON.stringify(trains, null, 2) + "\n", "utf8");

  // Stage only the data we own.
  git(["add", "content/chart-times", TRAIN_LIST_REL], repoDir);
  const status = git(["status", "--porcelain"], repoDir);
  if (!status) {
    console.log("[sync] no file changes to commit.");
    return;
  }

  const msg = `chart-times: sync ${ok} pages (${failed} failed) [bot]`;
  git(["commit", "--quiet", "-m", msg], repoDir);

  if (DRY_RUN) {
    console.log("[sync] DRY_RUN=1 — committed locally, skipping push.");
    return;
  }

  // Push, rebasing if another bot advanced the branch meanwhile.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      git(["pull", "--rebase", "--quiet", "origin", BRANCH], repoDir);
      git(["push", "--quiet", "origin", BRANCH], repoDir);
      console.log(`[sync] pushed: ${msg}`);
      return;
    } catch {
      console.log(`[sync] push attempt ${attempt} failed; retrying...`);
      await sleep(2000 * attempt);
    }
  }
  die("push failed after 3 attempts.");
}

main().catch((err) => die(err?.message || String(err)));
