#!/usr/bin/env node
// PostToolUse hook for Claude Code (Edit / Write / MultiEdit) and Codex (apply_patch). When an agent instruction file was
// changed, it lints only the text this edit wrote, using fence state from the resulting file, for history notes and broken
// links, and asks what was removed when an edit adds many net lines. Silent for other files. Fails open on any error.
// The edit has already happened: the {"decision":"block","reason"} reply sends the note back to the model as a correction.
// Set HARNESS_HOOK_DEBUG=<file> to append each raw hook input to that file.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lineFindings, scanLines } from '../skills/agent-harness-change/scripts/check-instructions.mjs';

const INSTRUCTION = [
  /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$/i,
  /(^|\/)SKILL\.md$/,
  /\.(agent|prompt|instructions|chatmode)\.md$/i,
  /(^|\/)\.?(agents|skills|prompts|commands|instructions|rules)\/.+\.(md|toml|ya?ml|txt)$/i,
];
const NET_LINES = Number(process.env.HARNESS_HOOK_NET_LINES || 8);
const isInstruction = (p) => INSTRUCTION.some((re) => re.test(p.replace(/\\/g, '/')));

// Codex apply_patch text -> [{ path, kind: add|update|delete, hunks: [{ newText, added, removed }] }]
export function parsePatch(text) {
  const files = [];
  let cur = null, hunk = null;
  const newHunk = () => { hunk = { lines: [], added: 0, removed: 0 }; cur.hunks.push(hunk); };
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const head = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (head) { cur = { path: head[2], kind: head[1].toLowerCase(), hunks: [] }; files.push(cur); hunk = null; continue; }
    if (!cur) continue;
    const move = /^\*\*\* Move to: (.+)$/.exec(line);
    if (move) { cur.path = move[1]; continue; }
    if (line === '*** End Patch' || line === '*** Begin Patch') { cur = line === '*** End Patch' ? null : cur; continue; }
    if (line === '*** End of File') continue;
    if (cur.kind === 'add') { if (line.startsWith('+')) { if (!hunk) newHunk(); hunk.lines.push(line.slice(1)); hunk.added++; } continue; }
    if (cur.kind !== 'update') continue;
    if (line.startsWith('@@')) { newHunk(); continue; }
    if (!hunk) newHunk();
    if (line.startsWith('+')) { hunk.lines.push(line.slice(1)); hunk.added++; }
    else if (line.startsWith('-')) hunk.removed++;
    else if (line.startsWith(' ')) hunk.lines.push(line.slice(1));
  }
  for (const f of files) for (const h of f.hunks) { h.newText = h.lines.join('\n'); delete h.lines; }
  return files;
}

// Lint the lines of `fragment` where it occurs exactly once in `fileText`, with fence state from the whole file.
function lintFragment(fileText, fragment, dir) {
  if (!fragment.trim()) return [];
  const at = fileText.indexOf(fragment);
  if (at < 0 || fileText.indexOf(fragment, at + 1) >= 0) return []; // not locatable unambiguously: skip rather than blame other lines
  const first = fileText.slice(0, at).split(/\r?\n/).length;
  const count = fragment.split(/\r?\n/).length;
  return scanLines(fileText).filter((l) => l.n >= first && l.n < first + count && !l.fence).flatMap((l) => lineFindings(l.text, dir).errors);
}

export function review(input, read = (p) => fs.readFileSync(p, 'utf8')) {
  const ti = input.tool_input || {};
  const cwd = input.cwd || process.cwd();
  const changes = []; // { file, fragments: [text], whole: bool, added, removed }
  if (input.tool_name === 'apply_patch' || (typeof ti.command === 'string' && ti.command.includes('*** Begin Patch'))) {
    for (const f of parsePatch(ti.command ?? ti.patch ?? ti.input ?? '')) {
      if (f.kind === 'delete') continue;
      changes.push({ file: path.resolve(cwd, f.path), fragments: f.hunks.map((h) => h.newText), whole: f.kind === 'add',
        added: f.hunks.reduce((s, h) => s + h.added, 0), removed: f.hunks.reduce((s, h) => s + h.removed, 0) });
    }
  } else if (ti.file_path) {
    const pairs = input.tool_name === 'MultiEdit' ? (ti.edits || []) : [{ old_string: ti.old_string ?? '', new_string: ti.new_string ?? ti.content ?? '' }];
    const lines = (s) => (String(s || '') ? String(s).split(/\r?\n/).length : 0);
    changes.push({ file: path.resolve(cwd, ti.file_path), fragments: pairs.map((p) => String(p.new_string || '')), whole: input.tool_name === 'Write',
      added: pairs.reduce((s, p) => s + lines(p.new_string), 0), removed: pairs.reduce((s, p) => s + lines(p.old_string), 0) });
  }
  const notes = [];
  for (const c of changes) {
    if (!isInstruction(c.file)) continue;
    let text;
    try { text = read(c.file); } catch { continue; }
    const dir = path.dirname(c.file);
    const found = c.whole ? scanLines(text).filter((l) => !l.fence).flatMap((l) => lineFindings(l.text, dir).errors) : c.fragments.flatMap((f) => lintFragment(text, f, dir));
    if (!c.whole && c.added - c.removed >= NET_LINES)
      found.push(`this edit adds ${c.added - c.removed} net lines. Did it remove the rule it replaces, and does the agent that reads this file need every new line?`);
    if (found.length) notes.push(`${path.basename(c.file)}:\n- ${[...new Set(found)].join('\n- ')}`);
  }
  return notes.length ? `The edit was applied and is on disk. Instruction file check on the text it wrote:\n${notes.join('\n')}\nFix these with a follow-up edit, or say why they are intentional (agent-harness-change skill).` : null;
}

function selfTest() {
  const files = {
    '/r/.claude/agents/qa.md': 'Intro\n```\nexample 2026-01-01\n```\nNew prose line.\n',
    '/r/skills/x/SKILL.md': 'a\n' + Array(12).fill('line').join('\n') + '\n',
    '/r/AGENTS.md': 'Use the Edit tool.\nPreviously X.\n',
    '/r/prompts/p.prompt.md': 'See [x](missing.md).\n',
    '/r/skills/new/SKILL.md': '# New\nThis used to be different.\n',
    '/r/skills/moved dir/SKILL.md': 'one\nAs of v2 this works.\nthree\n',
  };
  const read = (p) => { const k = p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, ''); if (!(k in files)) throw new Error('nofile'); return files[k]; };
  const patch = ['*** Begin Patch', '*** Add File: skills/new/SKILL.md', '+# New', '+This used to be different.',
    '*** Update File: skills/old dir/SKILL.md', '*** Move to: skills/moved dir/SKILL.md', '@@', ' one', '-two', '+As of v2 this works.', ' three',
    '*** Delete File: skills/gone/SKILL.md', '*** Update File: src/app.ts', '@@', '-a', '+Previously', '*** End Patch'].join('\n');
  const cases = [
    ['fenced date ignored, prose ok', { tool_name: 'Edit', cwd: '/r', tool_input: { file_path: '/r/.claude/agents/qa.md', old_string: 'x', new_string: 'example 2026-01-01' } }, null],
    ['net lines', { tool_name: 'Edit', tool_input: { file_path: '/r/skills/x/SKILL.md', old_string: 'a', new_string: Array(12).fill('line').join('\n') } }, /net lines/],
    ['untouched old line not blamed', { tool_name: 'Edit', tool_input: { file_path: '/r/AGENTS.md', old_string: 'u', new_string: 'Use the Edit tool.' } }, null],
    ['broken link', { tool_name: 'MultiEdit', tool_input: { file_path: '/r/prompts/p.prompt.md', edits: [{ old_string: 'y', new_string: 'See [x](missing.md).' }] } }, /broken link/],
    ['non-instruction file', { tool_name: 'Write', tool_input: { file_path: '/r/src/app.ts', content: 'Previously' } }, null],
    ['codex patch add+move', { tool_name: 'apply_patch', cwd: '/r', tool_input: { command: patch } }, /SKILL\.md:\n- history phrase: This used to[\s\S]*history phrase: As of v2/],
  ];
  const bad = cases.filter(([, inp, want]) => { const r = review(inp, read); return want ? !(r && want.test(r)) : r !== null; }).map(([n, inp]) => `${n}: ${review(inp, read)}`);
  console.log(bad.length ? `self-test FAILED\n${bad.join('\n')}` : 'self-test ok');
  process.exit(bad.length ? 1 : 0);
}

async function main() {
  let raw = '';
  for await (const c of process.stdin) raw += c;
  if (process.env.HARNESS_HOOK_DEBUG) fs.appendFileSync(process.env.HARNESS_HOOK_DEBUG, raw + '\n');
  const msg = review(JSON.parse(raw || '{}'));
  // A JSON decision on stdout is read by both Claude Code and Codex PostToolUse hooks; the edit itself stays on disk.
  if (msg) process.stdout.write(JSON.stringify({ decision: 'block', reason: msg }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--self-test')) selfTest();
  else main().catch(() => process.exit(0));
}
