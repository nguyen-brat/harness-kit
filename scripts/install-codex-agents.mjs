#!/usr/bin/env node
// Install the harness-kit Codex role files (codex/agents/*.toml), because Codex plugins do not ship agent roles.
//   node install-codex-agents.mjs [--project <repo>]   -> <repo>/.codex/agents/ (default: current directory)
//   node install-codex-agents.mjs --user               -> ~/.codex/agents/
//   add --uninstall to remove only files that are byte-identical to the bundled ones.
// Never overwrites: an existing different file is a conflict and nothing is written. Identical files are skipped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'codex', 'agents');

export function run(argv, { home = os.homedir(), cwd = process.cwd(), src = SRC } = {}) {
  const args = [...argv];
  const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
  const has = (flag) => { const i = args.indexOf(flag); if (i < 0) return false; args.splice(i, 1); return true; };
  const project = take('--project'), user = has('--user'), uninstall = has('--uninstall');
  if (args.length || (user && project)) return { code: 2, out: ['usage: install-codex-agents.mjs [--project <repo> | --user] [--uninstall]'] };
  const dest = user ? path.join(home, '.codex', 'agents') : path.join(path.resolve(cwd, project || '.'), '.codex', 'agents');
  const files = fs.readdirSync(src).filter((f) => f.endsWith('.toml'));
  const out = [];
  if (uninstall) {
    for (const f of files) {
      const d = path.join(dest, f);
      if (!fs.existsSync(d)) continue;
      if (fs.readFileSync(d).equals(fs.readFileSync(path.join(src, f)))) { fs.unlinkSync(d); out.push(`removed ${d}`); }
      else out.push(`kept ${d} (changed since install)`);
    }
    return { code: 0, out };
  }
  const plan = files.map((f) => { const d = path.join(dest, f); const exists = fs.existsSync(d); return { f, d, exists, same: exists && fs.readFileSync(d).equals(fs.readFileSync(path.join(src, f))) }; });
  const conflicts = plan.filter((p) => p.exists && !p.same);
  if (conflicts.length) return { code: 1, out: conflicts.map((p) => `conflict: ${p.d} exists and differs; nothing was written`) };
  fs.mkdirSync(dest, { recursive: true });
  for (const p of plan) {
    if (p.same) { out.push(`up to date ${p.d}`); continue; }
    fs.copyFileSync(path.join(src, p.f), p.d, fs.constants.COPYFILE_EXCL);
    out.push(`installed ${p.d}`);
  }
  out.push('Start a new Codex session to load the roles.');
  return { code: 0, out };
}

function selfTest() {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-inst-'));
  const repo = path.join(t, 'repo'); fs.mkdirSync(repo);
  const opts = { home: path.join(t, 'home'), cwd: repo };
  const dest = path.join(repo, '.codex', 'agents');
  const checks = {};
  checks.install = run([], opts).code === 0 && fs.readdirSync(dest).length === fs.readdirSync(SRC).filter((f) => f.endsWith('.toml')).length;
  checks.repeat = run([], opts).out.some((l) => l.startsWith('up to date'));
  const victim = path.join(dest, fs.readdirSync(dest)[0]);
  fs.appendFileSync(victim, '# user edit\n');
  const r = run([], opts); checks.conflict = r.code === 1 && /conflict/.test(r.out[0]);
  const u = run(['--uninstall'], opts); checks.uninstallKeepsEdited = fs.existsSync(victim) && u.out.some((l) => l.startsWith('kept')) && u.out.some((l) => l.startsWith('removed'));
  checks.user = run(['--user'], opts).code === 0 && fs.existsSync(path.join(opts.home, '.codex', 'agents'));
  checks.badArgs = run(['--bogus'], opts).code === 2;
  fs.rmSync(t, { recursive: true, force: true });
  const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(bad.length ? `self-test FAILED: ${bad.join(', ')}` : 'self-test ok');
  process.exit(bad.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--self-test')) selfTest();
  else { const r = run(process.argv.slice(2)); for (const l of r.out) console.log(l); process.exit(r.code); }
}
