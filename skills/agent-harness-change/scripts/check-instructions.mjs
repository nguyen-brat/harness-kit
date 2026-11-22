#!/usr/bin/env node
// Lint agent instruction files (roles, skills, prompts, AGENTS.md/CLAUDE.md) for the habits that bloat harnesses:
// history notes, broken relative links, ticket-like ids, dense emphasis, paragraphs copied between files, size over budget.
// Format/schema validation (frontmatter, manifests) is left to dedicated linters such as agnix.
// Usage: node check-instructions.mjs <file|dir>... [--max-kb 12] [--ext md,toml,txt,yml,yaml]  |  --self-test
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const EMPHASIS = /\b(MUST|NEVER|ALWAYS|MANDATORY|CRITICAL|IMPORTANT|BLOCKING|FORBIDDEN|REQUIRED)\b/g;
const HISTORY = [
  [/\b20\d\d-[01]\d-[0-3]\d\b/, 'date'],
  [/\b(previously|prior version|old version|the old flow|used to|no longer|was (removed|added|changed)|as of v?\d|since v\d)\b/i, 'history phrase'],
  [/\b(post-?mortem|regression from)\b/i, 'incident note'],
];
const TICKET = /\b[A-Z][A-Z0-9]{1,9}(?:-[A-Z][A-Z0-9]*)*-\d{2,}(?:\.\d+)?\b/g;
const LINK = /\]\(([^)\s#]+)(?:#[^)]*)?\)/g;

function walk(p, exts, out = []) {
  const st = fs.statSync(p);
  if (st.isFile()) { if (exts.includes(path.extname(p).slice(1).toLowerCase())) out.push(p); return out; }
  for (const e of fs.readdirSync(p)) {
    if (e === 'node_modules' || e === '.git') continue;
    walk(path.join(p, e), exts, out);
  }
  return out;
}

// Fence state per line: [{ text, n (1-based), fence }]; the ``` lines themselves count as fenced. Shared with the edit hook.
export function scanLines(text) {
  let inFence = false;
  return text.split(/\r?\n/).map((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return { text: line, n: i + 1, fence: true }; }
    return { text: line, n: i + 1, fence: inFence };
  });
}

// Checks for one prose line (callers skip fenced lines). Shared with the edit hook.
export function lineFindings(line, dir) {
  const errors = [], warnings = [];
  const prose = line.replace(/`[^`]*`|"[^"]*"/g, ''); // quoted words are mentions, not notes
  for (const [re, what] of HISTORY) if (re.test(prose)) errors.push(`${what}: ${line.trim().slice(0, 100)}`);
  for (const m of line.matchAll(LINK)) {
    const target = m[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith('/')) continue;
    let decoded = target;
    try { decoded = decodeURI(target); } catch { /* malformed escape such as 100%.md: try the literal name */ }
    if (!fs.existsSync(path.resolve(dir, decoded)) && !fs.existsSync(path.resolve(dir, target))) errors.push(`broken link: ${target}`);
  }
  const ids = line.match(TICKET);
  if (ids) warnings.push(`ticket-like id ${ids.join(', ')} (use a placeholder unless it is a real fixed name)`);
  return { errors, warnings };
}

export function check(files, { maxKb = 12 } = {}) {
  const errors = [], warnings = [], paras = new Map();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const { text: line, n, fence } of scanLines(text)) {
      if (fence) continue;
      const r = lineFindings(line, path.dirname(f));
      for (const e of r.errors) errors.push(`${f}:${n} ${e}`);
      for (const w of r.warnings) warnings.push(`${f}:${n} ${w}`);
    }
    const words = text.split(/\s+/).filter(Boolean).length || 1;
    const shouts = (text.match(EMPHASIS) || []).length;
    if (shouts >= 5 && shouts / words > 0.004) warnings.push(`${f} ${shouts} emphasis words in ${words} words: keep them for the few rules that matter`);
    const kb = Buffer.byteLength(text) / 1024;
    if (kb > maxKb) warnings.push(`${f} ${kb.toFixed(1)} KB > ${maxKb} KB budget: split by job or move procedure to a skill/reference`);
    for (const p of text.split(/\n\s*\n/)) {
      const norm = p.replace(/\s+/g, ' ').trim().toLowerCase();
      if (norm.length < 120 || norm.startsWith('```')) continue;
      if (!paras.has(norm)) paras.set(norm, new Set());
      paras.get(norm).add(f);
    }
  }
  for (const [p, set] of paras) if (set.size > 1) warnings.push(`same paragraph in ${[...set].join(' and ')}: "${p.slice(0, 80)}..."`);
  return { errors, warnings };
}

function selfTest() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'chk-'));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text); };
  const dup = 'This paragraph is long enough to count as a duplicate when it appears in two different instruction files of the same harness.';
  w('a.md', `# A\nSee [b](b.md) and [gone](missing.md).\nPreviously we did X.\nFix PROJ-ABC-123.1 here.\n\n${dup}\n\n\`\`\`\n2026-01-01 inside a fence is fine\n\`\`\`\n`);
  w('b.md', `# B\nUse the Edit tool.\nAfter the merge, run the full suite.\n\n${dup}\n`);
  w('.github/instructions/c.md', 'This was removed last week.\n');
  w('100%.md', 'x\n');
  w('e.md', 'See [p](100%.md) and [q](gone2.md).\n');
  w('.git/config.md', 'Previously ignored.\n');
  const r = check(walk(d, ['md']), { maxKb: 12 });
  const has = (arr, s) => arr.some((x) => x.includes(s));
  const checks = {
    brokenLink: has(r.errors, 'broken link: missing.md'), goodLink: !has(r.errors, 'broken link: b.md'), history: has(r.errors, 'history phrase'),
    fencedDate: !has(r.errors, 'date'), ticket: has(r.warnings, 'PROJ-ABC-123.1'), dup: has(r.warnings, 'same paragraph'),
    githubScanned: has(r.errors, 'c.md'), percentLink: !has(r.errors, '100%.md'), afterPercent: has(r.errors, 'gone2.md'),
    noFalseIncident: !r.errors.some((e) => e.includes(`b.md:`)), gitSkipped: !has(r.errors, 'config.md'),
  };
  fs.rmSync(d, { recursive: true, force: true });
  const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(bad.length ? `self-test FAILED: ${bad.join(', ')}\n${JSON.stringify(r, null, 2)}` : 'self-test ok');
  process.exit(bad.length ? 1 : 0);
}

const args = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (!isMain) { /* imported as a module */ }
else if (args.includes('--self-test')) selfTest();
else {
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
  const maxKb = Number(opt('--max-kb', 12));
  const exts = opt('--ext', 'md,toml,txt,yml,yaml').split(',');
  if (!args.length) { console.error('usage: check-instructions.mjs <file|dir>... [--max-kb 12] [--ext md,toml]'); process.exit(2); }
  const files = args.flatMap((a) => walk(a, exts));
  const { errors, warnings } = check(files, { maxKb });
  for (const e of errors) console.log(`ERROR ${e}`);
  for (const x of warnings) console.log(`WARN  ${x}`);
  console.log(`${files.length} files, ${errors.length} errors, ${warnings.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
