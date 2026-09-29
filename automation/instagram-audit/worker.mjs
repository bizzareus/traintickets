import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, open, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cron } from 'croner';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { z } from 'zod';
import { auditSchema, auditTargets, parseAgentResult, postKey, publishSchema, validateCandidate } from './validation.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(root, 'config.json'), 'utf8'));
const data = resolve(process.env.DATA_DIR || '/data');
await mkdir(join(data, 'runs'), { recursive: true, mode: 0o700 });
await mkdir(join(data, 'post-claims'), { recursive: true, mode: 0o700 });

async function save(path, value) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function reserve(path, value) {
  try {
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value)); } finally { await file.close(); }
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

async function confinedFile(path, runDir) {
  const canonical = await realpath(resolve(runDir, path));
  if (!canonical.startsWith(`${await realpath(runDir)}${sep}`)) throw new Error('Artifact path escapes the run directory');
  return canonical;
}

async function runAgent(phase, prompt, schema, runDir, timeoutMs) {
  if (timeoutMs <= 0) throw new Error('Run deadline reached');
  const schemaPath = join(runDir, `${phase}-schema.json`);
  const promptPath = join(runDir, `${phase}-prompt.md`);
  await save(schemaPath, z.toJSONSchema(schema));
  await writeFile(promptPath, prompt);
  const logPath = join(runDir, `${phase}.jsonl`);
  const log = await open(logPath, 'w', 0o600);
  try {
    await new Promise((resolveRun, reject) => {
      const child = spawn('/usr/local/bin/railway-agent', [
        'run', '--no-memory', '--no-skills', '--no-context-files', '--no-prompt-templates',
        '--no-retry', '--max-steps', phase === 'audit' ? '110' : '65', '--max-tokens', '4096',
        '--tools', 'bash,read,write,edit,ls', '--output-schema', schemaPath,
        '--json', '--no-session-persistence', `@${promptPath}`,
        'Execute the attached workflow. Return only facts verified with the browser and finish using structured_output.',
      ], { cwd: root, detached: true, stdio: ['ignore', log.fd, log.fd] });
      let timedOut = false;
      let forceKill;
      const timeout = setTimeout(() => {
        timedOut = true;
        try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
        forceKill = setTimeout(() => {
          try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
        }, 10_000);
      }, timeoutMs);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('close', (code) => {
        clearTimeout(timeout);
        clearTimeout(forceKill);
        if (timedOut) reject(new Error(`${phase} timed out; do not retry a possible publication`));
        else if (code !== 0) reject(new Error(`${phase} failed with exit ${code}; inspect private run logs`));
        else resolveRun();
      });
    });
  } finally { await log.close(); }
  return parseAgentResult(await readFile(logPath, 'utf8'), schema);
}

const contexts = await Promise.all([9222, 9223].map((port) => chromium.launchPersistentContext(
  join(data, port === 9222 ? 'audit-browser' : 'instagram-browser'),
  { headless: true, viewport: { width: 1280, height: 800 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata',
    args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'] },
)));
// Instagram opens ready for the one-time sign-in over an SSH-forwarded DevTools session.
await contexts[1].pages()[0].goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  .catch(() => console.warn('Instagram initial navigation failed; sign-in can be retried manually.'));

let active = false;
let latest = null;
try { latest = JSON.parse(await readFile(join(data, 'latest.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

async function dailyRun(draft = false) {
  if (active) return;
  active = true;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
  const id = draft ? `${day}-draft-${Date.now()}` : day;
  const runDir = join(data, 'runs', id);
  const deadline = Date.now() + config.maxRunMinutes * 60_000;
  let started = false;
  try {
    await mkdir(runDir, { recursive: true, mode: 0o700 });
    if (!await reserve(join(runDir, 'started.json'), { startedAt: new Date().toISOString(), draft })) {
      return;
    }
    started = true;
    latest = { id, status: 'auditing', startedAt: new Date().toISOString() };
    await save(join(data, 'latest.json'), latest);
    const targets = auditTargets(config);
    const auditSkill = await readFile(join(root, 'skills/browser-audit/SKILL.md'), 'utf8');
    const audit = await runAgent('audit', `${auditSkill}\n\nRUN DIRECTORY: ${runDir}\nTARGETS: ${JSON.stringify(targets)}\nCurrent UTC: ${new Date().toISOString()}\nInstagram account for the caption: @${config.instagramAccount}\nDo not publish.`, auditSchema, runDir, deadline - Date.now());
    await save(join(runDir, 'audit.json'), audit);
    if (audit.status !== 'verified') {
      latest = { ...latest, status: audit.status, reason: audit.reason };
      return;
    }
    const candidate = validateCandidate(audit.candidate, new Date(), config.maxEvidenceAgeMinutes);
    if (!targets.some((t) => t.from === candidate.from && t.to === candidate.to && t.journeyDate === candidate.journeyDate)) {
      throw new Error('Candidate is outside the assigned corridors/dates');
    }
    if (audit.images.length < 2 || audit.caption.length < 80 || audit.caption.length > 2200) {
      throw new Error('Expected 2–4 images and a valid Instagram-length caption');
    }
    if (!/separate tickets|split.ticket/i.test(audit.caption) || !/berth/i.test(audit.caption)) {
      throw new Error('Caption must disclose separate tickets and berth changes');
    }
    if (new Set(candidate.legs.map((leg) => leg.classCode)).size > 1 && !/class.*change|mixed.class/i.test(audit.caption)) {
      throw new Error('Caption must disclose the mixed-class journey');
    }
    for (const path of [candidate.baseline.screenshot, candidate.lastberthScreenshot]) {
      const meta = await sharp(await confinedFile(path, runDir)).metadata();
      if (meta.width !== 1280 || meta.height < 800) throw new Error('Evidence must retain the 1280px desktop viewport');
    }
    const images = [];
    for (const path of audit.images) {
      const file = await confinedFile(path, runDir);
      const meta = await sharp(file).metadata();
      if (meta.format !== 'png' || meta.width !== 1080 || meta.height !== 1350) throw new Error('Carousel images must be 1080×1350 PNGs');
      images.push(file);
    }
    await confinedFile(audit.report, runDir);
    const hasLogin = (await contexts[1].cookies('https://www.instagram.com/')).some((cookie) => cookie.name === 'sessionid');
    if (draft || !hasLogin) {
      latest = { ...latest, status: draft ? 'draft_ready' : 'auth_required', reason: draft ? 'Dry run complete; no publication attempted' : 'Instagram sign-in required; verified draft saved' };
      return;
    }
    const key = postKey(candidate);
    const claimPath = join(data, 'post-claims', `${key}.json`);
    if (!await reserve(claimPath, { id, status: 'reserved', at: new Date().toISOString() })) {
      latest = { ...latest, status: 'duplicate_skipped', key };
      return;
    }
    // Claim survives failure/timeout. Never retry a potentially successful public post.
    latest = { ...latest, status: 'publishing', key };
    await save(join(data, 'latest.json'), latest);
    const publishSkill = await readFile(join(root, 'skills/instagram-publish/SKILL.md'), 'utf8');
    const publication = await runAgent('publish', `${publishSkill}\n\nRUN DIRECTORY: ${runDir}\nCANDIDATE: ${JSON.stringify(candidate)}\nREPORT: ${audit.report}\nIMAGES (in upload order): ${JSON.stringify(images)}\nCAPTION:\n${audit.caption}\n\nOnly approved account: ${config.instagramAccount}. Reverify evidence and logged-in account before the single Share action.`, publishSchema, runDir, deadline - Date.now());
    if (publication.status === 'published') {
      const url = new URL(publication.postUrl);
      if (publication.account !== config.instagramAccount || url.protocol !== 'https:' ||
          !['www.instagram.com', 'instagram.com'].includes(url.hostname) || !/^\/(p|reel)\/[\w-]+\/?$/.test(url.pathname)) {
        throw new Error('Publication result lacks the correct account or verified Instagram permalink');
      }
    }
    await save(claimPath, { id, ...publication, completedAt: new Date().toISOString() });
    await save(join(runDir, 'publication.json'), publication);
    latest = { ...latest, ...publication };
  } catch (error) {
    latest = { ...latest, id, status: latest?.status === 'publishing' ? 'uncertain' : 'failed', reason: error.message };
  } finally {
    if (started && latest?.id === id) {
      latest.completedAt = new Date().toISOString();
      await save(join(runDir, 'result.json'), latest);
      await save(join(data, 'latest.json'), latest);
      console.log(JSON.stringify(latest));
    }
    active = false;
  }
}

const cron = new Cron(config.schedule, { timezone: config.timezone, protect: true }, () => dailyRun());
const server = createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/run-draft') {
    if (active) { response.writeHead(409).end('A run is already active'); return; }
    void dailyRun(true);
    response.writeHead(202).end('Audit-only run started; no Instagram publication');
    return;
  }
  if (request.method !== 'GET' || request.url !== '/health') { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ timezone: config.timezone, schedule: config.schedule, nextRun: cron.nextRun(),
    account: config.instagramAccount, active, latest,
    instagramSessionPresent: (await contexts[1].cookies('https://www.instagram.com/')).some((cookie) => cookie.name === 'sessionid') }));
});
server.listen(3098, '127.0.0.1', () => {
  console.log(JSON.stringify({ status: 'scheduled', timezone: config.timezone, nextRun: cron.nextRun() }));
  // Recover a missed 11am start after a host reboot; the persistent day claim prevents duplicates.
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (hour >= 11) void dailyRun();
});

for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  cron.stop();
  server.close();
  await Promise.all(contexts.map((context) => context.close()));
  process.exit(0);
});
