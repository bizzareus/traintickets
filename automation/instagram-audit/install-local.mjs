// Stage the OpenCode-owned job outside macOS's protected Documents directory.
// Scheduling itself is managed by opencode-scheduler, not this installer.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = join(homedir(), '.local/share/opencode/lastberth-social/workspace');
const files = [
  'automation/instagram-audit/package.json',
  'automation/instagram-audit/package-lock.json',
  'automation/instagram-audit/config.json',
  'automation/instagram-audit/control.mjs',
  'automation/instagram-audit/validation.mjs',
  'automation/instagram-audit/README.md',
  '.opencode/agents/lastberth-social.md',
  '.opencode/commands/lastberth-daily-social.md',
  '.opencode/skills/lastberth-daily-audit',
  '.opencode/plugins/local-node.js',
];
for (const file of files) {
  await mkdir(dirname(join(target, file)), { recursive: true });
  await cp(join(source, file), join(target, file), { recursive: true });
}
const config = JSON.parse(await readFile(join(source, 'opencode.json'), 'utf8'));
config.mcp.railway = { enabled: false };
config.mcp['chrome-devtools'] = { enabled: false };
await writeFile(join(target, 'opencode.json'), `${JSON.stringify(config, null, 2)}\n`);
console.log(JSON.stringify({ workspace: target, files: files.length, next: 'Run npm ci in workspace/automation/instagram-audit, then update the OpenCode scheduler job workdir to this workspace.' }, null, 2));
