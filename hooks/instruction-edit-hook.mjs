#!/usr/bin/env node
// Claude Code PostToolUse hook (Edit|Write|MultiEdit) for the developer session.
// When an agent instruction file is edited, it checks only the text this edit wrote. It reports history notes and broken
// links, and asks what the edit removed when the edit adds many lines.
// It is silent for every other file, and it fails open: any error lets the edit stand.
// Exit 2 sends stderr back to Claude. The edit has already happened; the message asks Claude to correct it.
import path from 'node:path';
import { lineFindings } from '../skills/agent-harness-change/scripts/check-instructions.mjs';

const INSTRUCTION = [
  /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$/i,
  /(^|\/)SKILL\.md$/,
  /\.(agent|prompt|instructions|chatmode)\.md$/i,
  /(^|\/)\.?(agents|skills|prompts|commands|instructions|rules)\/.+\.(md|toml|ya?ml|txt)$/i,
];
const NET_LINES = Number(process.env.HARNESS_HOOK_NET_LINES || 8);

export function review(input) {
  const ti = input.tool_input || {};
  const file = String(ti.file_path || '').replace(/\\/g, '/');
  if (!file || !INSTRUCTION.some((re) => re.test(file))) return null;
  const pairs = input.tool_name === 'MultiEdit' ? (ti.edits || []) : [{ old_string: ti.old_string ?? '', new_string: ti.new_string ?? ti.content ?? '' }];
  const out = [];
  let added = 0, removed = 0, inFence = false;
  for (const p of pairs) {
    const newLines = String(p.new_string || '').split(/\r?\n/);
    added += newLines.length; removed += String(p.old_string || '').split(/\r?\n/).length;
    for (const line of newLines) {
      if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
      if (!inFence) out.push(...lineFindings(line, path.dirname(file)).errors);
    }
  }
  if (input.tool_name !== 'Write' && added - removed >= NET_LINES)
    out.push(`this edit adds ${added - removed} net lines to an instruction file. Did it remove the rule it replaces, and is every new line needed by the agent that reads it?`);
  return out.length ? `Instruction file ${path.basename(file)}:\n- ${out.join('\n- ')}\nFix these, or say why they are intentional (agent-harness-change skill).` : null;
}

async function main() {
  let raw = '';
  for await (const c of process.stdin) raw += c;
  const msg = review(JSON.parse(raw || '{}'));
  if (msg) { process.stderr.write(msg + '\n'); process.exit(2); }
}

if (process.argv.includes('--self-test')) {
  const cases = [
    [{ tool_name: 'Edit', tool_input: { file_path: 'C:\\repo\\.claude\\agents\\qa.md', old_string: 'a', new_string: 'Previously we did X.' } }, /history phrase/],
    [{ tool_name: 'Edit', tool_input: { file_path: '/r/skills/x/SKILL.md', old_string: 'a', new_string: Array(12).fill('line').join('\n') } }, /net lines/],
    [{ tool_name: 'Write', tool_input: { file_path: '/r/src/app.ts', content: 'Previously' } }, null],
    [{ tool_name: 'Edit', tool_input: { file_path: '/r/AGENTS.md', old_string: 'a', new_string: 'Use the Edit tool.' } }, null],
    [{ tool_name: 'MultiEdit', tool_input: { file_path: '/r/prompts/p.prompt.md', edits: [{ old_string: 'x', new_string: 'See [x](missing.md).' }] } }, /broken link/],
  ];
  const bad = cases.filter(([inp, want]) => { const r = review(inp); return want ? !(r && want.test(r)) : r !== null; });
  console.log(bad.length ? `self-test FAILED ${JSON.stringify(bad)}` : 'self-test ok');
  process.exit(bad.length ? 1 : 0);
} else main().catch(() => process.exit(0));
