import { execFile } from 'node:child_process';
import { mkdir, open, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { auditSchema, auditTargets, postKey, validateCandidate } from './validation.mjs';

const exec = promisify(execFile);
const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(root, 'config.json'), 'utf8'));
const data = join(homedir(), '.local/share/opencode/lastberth-social');
const londonDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());

async function save(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}

async function reserveFile(path, value) {
  try {
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value)); } finally { await file.close(); }
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

async function runPath(input) {
  const path = await realpath(resolve(input));
  if (dirname(path) !== join(data, 'runs')) throw new Error('Run must be inside the dedicated OpenCode artifact directory');
  return path;
}

async function artifact(path, runDir) {
  const actual = await realpath(resolve(runDir, path));
  if (!actual.startsWith(`${runDir}${sep}`)) throw new Error('Artifact escapes run directory');
  return actual;
}

async function validate(runDir) {
  const audit = auditSchema.parse(JSON.parse(await readFile(join(runDir, 'audit.json'), 'utf8')));
  if (audit.status !== 'verified') throw new Error(`Audit is ${audit.status}, not verified`);
  const candidate = validateCandidate(audit.candidate, new Date(), config.maxEvidenceAgeMinutes);
  const started = JSON.parse(await readFile(join(runDir, 'started.json'), 'utf8'));
  if (!started.targets.some((t) => t.from === candidate.from && t.to === candidate.to && t.journeyDate === candidate.journeyDate)) {
    throw new Error('Candidate is outside the assigned routes/dates');
  }
  if (audit.images.length < 2 || audit.caption.length < 80 || audit.caption.length > 2200) throw new Error('Invalid carousel size or caption length');
  if (!/separate tickets|split.ticket/i.test(audit.caption) || !/berth/i.test(audit.caption)) throw new Error('Caption must disclose separate tickets and berth changes');
  if (new Set(candidate.legs.map((leg) => leg.classCode)).size > 1 && !/class.*change|mixed.class/i.test(audit.caption)) throw new Error('Caption must disclose mixed classes');
  for (const path of [candidate.baseline.screenshot, candidate.lastberthScreenshot]) {
    const info = await sharp(await artifact(path, runDir)).metadata();
    if (info.width !== 1280 || info.height < 800) throw new Error('Original evidence must retain the 1280px desktop viewport');
  }
  for (const path of audit.images) {
    const info = await sharp(await artifact(path, runDir)).metadata();
    if (info.format !== 'png' || info.width !== 1080 || info.height !== 1350) throw new Error('Carousel images must be 1080×1350 PNGs');
  }
  await artifact(audit.report, runDir);
  return { audit, candidate, started };
}

async function main() {
  const [action, argument, ...rest] = process.argv.slice(2);
  for (const folder of ['runs', 'post-claims', 'daily-posts', 'browser']) await mkdir(join(data, folder), { recursive: true, mode: 0o700 });

  if (action === 'ensure-browser') {
    try {
      await exec('/usr/bin/curl', ['-fsS', '--max-time', '2', 'http://127.0.0.1:19444/json/version']);
      return { status: 'ready', browserUrl: 'http://127.0.0.1:19444' };
    } catch {
      await exec('/usr/bin/open', ['-na', 'Google Chrome', '--args', '--remote-debugging-port=19444', `--user-data-dir=${join(data, 'browser')}`, '--no-first-run', 'https://www.instagram.com/']);
      return { status: 'starting', browserUrl: 'http://127.0.0.1:19444', message: 'Use lastberth-browser MCP after Chrome opens. Sign in manually if needed.' };
    }
  }

  if (action === 'begin') {
    const draft = argument === '--draft';
    const day = londonDay();
    const runDir = join(data, 'runs', draft ? `${day}-draft-${Date.now()}` : day);
    await mkdir(runDir, { recursive: true, mode: 0o700 });
    const started = { startedAt: new Date().toISOString(), draft, day, targets: auditTargets(config) };
    const claimed = await reserveFile(join(runDir, 'started.json'), started);
    const details = claimed ? started : JSON.parse(await readFile(join(runDir, 'started.json'), 'utf8'));
    return { status: claimed ? 'started' : 'already_started', runDir, packageJson: join(root, 'package.json'), account: config.instagramAccount, ...details };
  }

  if (action === 'status') {
    try { return JSON.parse(await readFile(join(data, 'latest.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { status: 'not_run', data }; throw error; }
  }

  if (!argument) throw new Error('Expected ensure-browser, begin [--draft], status, or validate/reserve/finish/record <runDir>');
  const runDir = await runPath(argument);
  if (action === 'validate' || action === 'reserve') {
    const { audit, candidate, started } = await validate(runDir);
    const key = postKey(candidate);
    if (action === 'reserve') {
      if (started.draft) throw new Error('Draft runs cannot publish');
      if (started.day !== londonDay()) throw new Error('Run belongs to a different day');
      const claim = { runDir, key, account: config.instagramAccount, status: 'reserved', at: new Date().toISOString() };
      if (!await reserveFile(join(data, 'post-claims', `${key}.json`), claim)) throw new Error('Candidate already attempted; do not publish again');
      if (!await reserveFile(join(data, 'daily-posts', `${started.day}.json`), claim)) throw new Error('Daily post already attempted; do not publish again');
      await save(join(runDir, 'publication-reservation.json'), claim);
    }
    return { status: action === 'reserve' ? 'reserved' : 'validated', key, account: config.instagramAccount, images: audit.images, caption: audit.caption };
  }

  if (action === 'record' || action === 'finish') {
    let result;
    if (action === 'finish') {
      const url = new URL(rest[0]);
      if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || !/^\/(p|reel)\/[\w-]+\/?$/.test(url.pathname)) throw new Error('A verified Instagram post permalink is required');
      const claim = JSON.parse(await readFile(join(runDir, 'publication-reservation.json'), 'utf8'));
      result = { ...claim, status: 'published', postUrl: url.href };
      await save(join(data, 'post-claims', `${claim.key}.json`), result);
    } else {
      if (!['blocked', 'no_match', 'auth_required', 'uncertain', 'draft_ready'].includes(rest[0])) throw new Error('Invalid result status');
      if (rest[0] === 'draft_ready') await validate(runDir);
      result = { status: rest[0], reason: rest.slice(1).join(' ') };
    }
    result = { ...result, runDir, completedAt: new Date().toISOString() };
    await save(join(runDir, 'result.json'), result);
    await save(join(data, 'latest.json'), result);
    return result;
  }
  throw new Error(`Unknown command: ${action}`);
}

main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
  console.error(JSON.stringify({ status: 'blocked', error: error.message }));
  process.exitCode = 1;
});
