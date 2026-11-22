#!/usr/bin/env node
// Stop hook for a long plan build (see references/hooks.md). Copy into the build folder next to requirements.json.
// Order: no ACTIVE or PAUSED -> allow; unreadable requirements -> allow (fail open); all non-deferred passes === true -> allow;
// a fresh WAITING line "<UTC ISO time> <agent id> <role> <component>" -> allow; otherwise block (exit 2) with the reason.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function decide(dir, now = Date.now(), maxHours = Number(process.env.WAITING_MAX_HOURS || 3)) {
  const f = (name) => join(dir, name);
  if (!existsSync(f('ACTIVE')) || existsSync(f('PAUSED'))) return { allow: true };
  let reqs;
  try { reqs = JSON.parse(readFileSync(f('requirements.json'), 'utf8')).requirements ?? []; }
  catch (e) { return { allow: true, msg: `stop-check: cannot read requirements.json (${e.message}); not blocking.` }; }
  const open = reqs.filter((r) => r.verify !== 'deferred' && r.passes !== true).map((r) => r.id);
  if (!open.length) return { allow: true };
  const lines = existsSync(f('WAITING')) ? readFileSync(f('WAITING'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : [];
  const fresh = (l) => { const t = Date.parse(l.split(/\s+/)[0]); return Number.isFinite(t) && now - t < maxHours * 3600e3; };
  if (lines.some(fresh)) return { allow: true };
  const stale = lines.length ? ` WAITING has ${lines.length} stale or undated line(s): check those agents and rewrite each line as "<UTC ISO time> <agent id> <role> <component>", or remove it.` : '';
  return { allow: false, msg: `The plan build is active and ${open.length} requirements are open (${open.slice(0, 12).join(', ')}${open.length > 12 ? ' ...' : ''}).${stale} Continue per progress.md, or write your question for the user into PAUSED, before stopping.` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const r = decide(dirname(fileURLToPath(import.meta.url)));
  if (r.msg) process.stderr.write(r.msg + '\n');
  process.exit(r.allow ? 0 : 2);
}
