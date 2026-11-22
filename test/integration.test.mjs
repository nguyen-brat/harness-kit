// Integration tests through the real entry points (CLI, hook stdin, copied build scripts). Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  hook: path.join(root, 'hooks/instruction-edit-hook.mjs'),
  guard: path.join(root, 'skills/agent-harness-change/hooks/guard-shell-writes.mjs'),
  lint: path.join(root, 'skills/agent-harness-change/scripts/check-instructions.mjs'),
  audit: path.join(root, 'skills/trace-agent-run/scripts/run-audit.mjs'),
  coverage: path.join(root, 'skills/long-plan-build/scripts/coverage.mjs'),
  stop: path.join(root, 'skills/long-plan-build/scripts/stop-check.mjs'),
  install: path.join(root, 'scripts/install-codex-agents.mjs'),
};
const node = (file, args = [], input) => spawnSync(process.execPath, [file, ...args], { input, encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hk-it-'));
const decision = (r) => { assert.equal(r.status, 0, r.stderr); return r.stdout.trim() ? JSON.parse(r.stdout) : null; };
const write = (dir, rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };

test('edit hook: Claude edit inside an existing fence is not blamed; a prose history note is', () => {
  const d = tmp();
  const f = write(d, 'skills/x/SKILL.md', '# X\n```\nrun on 2026-01-01\n```\nThis used to be different.\n');
  const fenced = node(P.hook, [], JSON.stringify({ tool_name: 'Edit', cwd: d, tool_input: { file_path: f, old_string: 'a', new_string: 'run on 2026-01-01' } }));
  assert.equal(decision(fenced), null);
  const prose = node(P.hook, [], JSON.stringify({ tool_name: 'Edit', cwd: d, tool_input: { file_path: f, old_string: 'a', new_string: 'This used to be different.' } }));
  const d2 = decision(prose); assert.equal(d2.decision, 'block'); assert.match(d2.reason, /edit was applied[\s\S]*history phrase/);
});

test('edit hook: Codex apply_patch with add, move and delete; ordinary files ignored; bad stdin fails open', () => {
  const d = tmp();
  write(d, 'skills/new/SKILL.md', '# New\nPreviously done by hand.\n');
  write(d, 'skills/moved dir/SKILL.md', 'one\nclean line\nthree\n');
  write(d, 'src/app.ts', 'Previously\n');
  const patch = ['*** Begin Patch', '*** Add File: skills/new/SKILL.md', '+# New', '+Previously done by hand.',
    '*** Update File: skills/old/SKILL.md', '*** Move to: skills/moved dir/SKILL.md', '@@', ' one', '-two', '+clean line', ' three',
    '*** Delete File: skills/gone/SKILL.md', '*** Update File: src/app.ts', '@@', '-x', '+Previously', '*** End Patch'].join('\n');
  const r = node(P.hook, [], JSON.stringify({ tool_name: 'apply_patch', cwd: d, tool_input: { command: patch } }));
  const j = decision(r); assert.match(j.reason, /history phrase: Previously done by hand/); assert.doesNotMatch(j.reason, /app\.ts/);
  const bad = node(P.hook, [], 'not json'); assert.equal(bad.status, 0); assert.equal(bad.stdout, '');
});

test('shell guard through stdin (Claude string and Codex array commands)', () => {
  const run = (command) => node(P.guard, [], JSON.stringify({ tool_name: 'Bash', tool_input: { command } }));
  assert.equal(run("sed -i 's/a/b/' a.md").status, 2);
  assert.equal(run(['bash', '-lc', "sed -i 's/a/b/' a.md"]).status, 2);
  assert.equal(run("printf 'sed -i'").status, 0);
  assert.equal(run('npm test > out.log 2>&1').status, 0);
});

test('linter CLI scans .github, survives % in links, exits 1 on errors', () => {
  const d = tmp();
  write(d, '.github/instructions/a.md', 'This was removed before.\n');
  write(d, '100%.md', 'x\n'); write(d, 'b.md', 'See [p](100%.md).\n');
  const r = node(P.lint, [d]);
  assert.equal(r.status, 1); assert.match(r.stdout, /a\.md:1 history phrase/); assert.doesNotMatch(r.stdout, /broken link/);
});

test('coverage: TODO is not evidence, suite exit is preserved, review needs boolean true, bad args change nothing', () => {
  const d = tmp();
  fs.copyFileSync(P.coverage, path.join(d, 'coverage.mjs'));
  const reqs = { requirements: [
    { id: 'C1.01', verify: 'test', passes: false }, { id: 'C1.02', verify: 'test', passes: false },
    { id: 'C1.03', verify: 'test', passes: false }, { id: 'R1.01', verify: 'review', passes: 'true' } ] };
  const reqFile = write(d, 'requirements.json', JSON.stringify(reqs));
  write(d, 'last-test.txt', '✔ C1.01 C1.03 works (1ms)\n✔ C1.02 future (0.8ms) # TODO\nℹ fail 0\n');
  write(d, 'last-test.exit', '0\n');
  const cov = path.join(d, 'coverage.mjs');
  const before = fs.readFileSync(reqFile, 'utf8');
  assert.equal(node(cov, ['--self-test']).status, 2); assert.equal(fs.readFileSync(reqFile, 'utf8'), before);
  const r = node(cov);
  assert.equal(r.status, 1); assert.match(r.stdout, /GAP C1\.02/); assert.match(r.stdout, /GAP R1\.01/);
  const doc = JSON.parse(fs.readFileSync(reqFile, 'utf8'));
  assert.equal(doc.requirements[0].passes, true); assert.equal(doc.requirements[2].passes, true); assert.equal(doc.requirements[1].passes, false);
  write(d, 'last-test.exit', '7\n');
  assert.equal(node(cov).status, 7);
});

test('stop hook: finished build allows; stale or undated waits block; fresh waits and PAUSED allow', () => {
  const d = tmp();
  fs.copyFileSync(P.stop, path.join(d, 'stop-check.mjs'));
  const stop = path.join(d, 'stop-check.mjs');
  write(d, 'ACTIVE', '');
  const reqs = (passes) => write(d, 'requirements.json', JSON.stringify({ requirements: [{ id: 'A.01', verify: 'test', passes }] }));
  const old = new Date(Date.now() - 5 * 3600e3).toISOString();
  reqs(true); write(d, 'WAITING', `${old} a1 builder C1\n`);
  assert.equal(node(stop).status, 0, 'finished build with a stale line');
  reqs('false');
  const blocked = node(stop); assert.equal(blocked.status, 2); assert.match(blocked.stderr, /stale/);
  write(d, 'WAITING', 'a1 builder C1\n'); assert.equal(node(stop).status, 2, 'undated line');
  write(d, 'WAITING', `${old} a1 builder C1\n${new Date().toISOString()} a2 builder C2\n`); assert.equal(node(stop).status, 0, 'one fresh line');
  fs.rmSync(path.join(d, 'WAITING')); write(d, 'PAUSED', 'question'); assert.equal(node(stop).status, 0);
});

test('run-audit CLI: parent plus sub-agent, --share hides excerpts, --file matches paths not mentions', () => {
  const d = tmp();
  const L = (o) => JSON.stringify(o);
  const main = write(d, 's.jsonl', [
    L({ type: 'assistant', timestamp: '2026-01-01T00:00:01Z', message: { content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'README.md', new_string: 'see AGENTS.md CANARY' } }] } }),
    L({ type: 'user', timestamp: '2026-01-01T00:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'denied CANARY' }] } }),
  ].join('\n'));
  write(d, 's/subagents/a.jsonl', L({ type: 'response_item', timestamp: '2026-01-01T00:00:03Z', payload: { type: 'custom_tool_call', name: 'apply_patch', call_id: 'c', input: '*** Begin Patch\n*** Update File: AGENTS.md\n@@\n-a\n+b\n*** End Patch' } }));
  const share = node(P.audit, [main, '--share']);
  assert.equal(share.status, 0); assert.doesNotMatch(share.stdout, /CANARY/); assert.match(share.stdout, /edits failed or without result \(2\)/);
  const tl = node(P.audit, [main, '--timeline', '--file', 'AGENTS\\.md', '--share']);
  assert.equal(tl.stdout.trim().split('\n').length, 1); assert.match(tl.stdout, /apply_patch unknown AGENTS\.md/);
});

test('Codex role installer CLI installs into a project and refuses to overwrite', () => {
  const d = tmp();
  const r = node(P.install, ['--project', d]);
  assert.equal(r.status, 0, r.stderr);
  const f = path.join(d, '.codex/agents/harness-kit-reviewer.toml');
  assert.match(fs.readFileSync(f, 'utf8'), /^name = "harness-kit-reviewer"/m);
  fs.appendFileSync(f, '# mine\n');
  assert.equal(node(P.install, ['--project', d]).status, 1);
});

test('shipped files reference no removed helper and no machine paths', () => {
  const offenders = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'test'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(md|mjs|json|toml)$/.test(e.name)) {
      const t = fs.readFileSync(p, 'utf8');
      if (/remote-track|<helper>|[A-Z]:\\Users\\|\/home\/[a-z]/.test(t)) offenders.push(path.relative(root, p));
    } } };
  walk(root);
  assert.deepEqual(offenders, []);
});
