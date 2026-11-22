// Claude Code Stop hook for a long plan build (see references/hooks.md). Copy into the build folder next to requirements.json.
// Blocks the coordinator from ending a turn while the build is active and a non-deferred requirement is open, unless PAUSED exists or
// WAITING lists a running background agent (lines older than WAITING_MAX_HOURS are stale and do not count).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const f = (name) => join(here, name);
if (!existsSync(f('ACTIVE')) || existsSync(f('PAUSED'))) process.exit(0);

const maxAgeMs = Number(process.env.WAITING_MAX_HOURS || 3) * 3600e3;
if (existsSync(f('WAITING'))) {
  const lines = readFileSync(f('WAITING'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const fresh = Date.now() - statSync(f('WAITING')).mtimeMs < maxAgeMs;
  if (lines.length && fresh) process.exit(0);
  if (lines.length) {
    process.stderr.write(`WAITING lists ${lines.length} agent(s) but was last changed over ${maxAgeMs / 3600e3} h ago: check them, update WAITING, then continue.\n`);
    process.exit(2);
  }
}

let reqs;
try { reqs = JSON.parse(readFileSync(f('requirements.json'), 'utf8')).requirements ?? []; }
catch (e) { process.stderr.write(`stop-check: cannot read requirements.json (${e.message}); not blocking.\n`); process.exit(0); }
const open = reqs.filter((r) => !r.passes && r.verify !== 'deferred').map((r) => r.id);
if (!open.length) process.exit(0);
process.stderr.write(`The plan build is active and ${open.length} requirements are open (${open.slice(0, 12).join(', ')}${open.length > 12 ? ' ...' : ''}). ` +
  'Continue per progress.md, or list the running agent in WAITING, or write your question for the user into PAUSED, before stopping.\n');
process.exit(2);
