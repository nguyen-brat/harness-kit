#!/usr/bin/env node
// What did an agent run actually do? Reads Claude Code session transcripts (.jsonl, plus <session>/subagents/*.jsonl)
// and Codex rollouts (response_item records). Prints a summary, or every event in time order with --timeline.
// Usage: node run-audit.mjs <session.jsonl | dir>... [--timeline] [--gap 60] [--file <regex>] | --self-test
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SHELL_WRITE = /\bsed\s+-i\b|\bperl\s+-[a-z]*i|>\s*[^\s&|>]+\.(md|toml|ya?ml|json|[jt]sx?|mjs|py|cs|java|go|rs|txt|sh)\b|\btee\s+[^|]*\.\w+|<<\s*['"]?\w+['"]?\s*>|\bwrite_text\(|open\([^)]*['"]w['"]|writeFileSync\(/;

function files(args) {
  const out = [];
  for (const a of args) {
    const st = fs.statSync(a);
    if (st.isFile()) {
      out.push(a);
      const sub = path.join(a.replace(/\.jsonl$/, ''), 'subagents');
      if (fs.existsSync(sub)) for (const f of fs.readdirSync(sub)) if (f.endsWith('.jsonl')) out.push(path.join(sub, f));
    } else for (const f of fs.readdirSync(a)) if (/\.(jsonl|ndjson)$/.test(f)) out.push(...files([path.join(a, f)]));
  }
  return [...new Set(out)];
}

// Normalise both formats to {ts, file, kind: text|tool|result, name, input, isError, text}
export function events(file) {
  const ev = [], short = path.basename(file);
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    const ts = o.timestamp || o.ts;
    if (o.type === 'assistant' || o.type === 'user') {
      const c = o.message?.content;
      if (typeof c === 'string') { if (o.type === 'user' && !o.isMeta) ev.push({ ts, file: short, kind: 'text', role: 'user', text: c }); continue; }
      for (const b of c || []) {
        if (b.type === 'text') ev.push({ ts, file: short, kind: 'text', role: o.type, text: b.text });
        else if (b.type === 'tool_use') ev.push({ ts, file: short, kind: 'tool', name: b.name, input: b.input || {} });
        else if (b.type === 'tool_result') ev.push({ ts, file: short, kind: 'result', isError: !!b.is_error,
          text: typeof b.content === 'string' ? b.content : (b.content || []).map((x) => x.text || '').join('') });
      }
    } else if (o.type === 'response_item' && o.payload) {
      const p = o.payload;
      if (p.type === 'function_call') { let input = {}; try { input = JSON.parse(p.arguments || '{}'); } catch { input = { raw: p.arguments }; }
        ev.push({ ts, file: short, kind: 'tool', name: p.name, input }); }
      else if (p.type === 'function_call_output') ev.push({ ts, file: short, kind: 'result', isError: /error|exit code [1-9]/i.test(String(p.output).slice(0, 300)), text: String(p.output) });
      else if (p.type === 'message') ev.push({ ts, file: short, kind: 'text', role: p.role, text: (p.content || []).map((x) => x.text || '').join('') });
    }
  }
  return ev;
}

const cmdOf = (e) => e.input.command ?? e.input.cmd ?? (Array.isArray(e.input.command) ? e.input.command.join(' ') : '');

export function audit(evs, { gap = 60, fileRe } = {}) {
  const r = { tools: {}, read: new Set(), editedByTool: new Set(), shellWrites: [], skills: [], agents: [], errors: [], gaps: [], fileHits: [], last: '' };
  let prev;
  for (const e of evs) {
    if (prev && e.ts && prev.ts) { const s = (Date.parse(e.ts) - Date.parse(prev.ts)) / 1000; if (s > gap) r.gaps.push(`${prev.ts} +${Math.round(s)}s before ${e.kind} ${e.name || ''}`); }
    if (e.ts) prev = e;
    if (e.kind === 'text' && e.role === 'assistant' && e.text.trim()) r.last = e.text.trim();
    if (e.kind === 'result' && e.isError) r.errors.push(`${e.ts} ${e.text.slice(0, 160).replace(/\s+/g, ' ')}`);
    if (e.kind !== 'tool') continue;
    r.tools[e.name] = (r.tools[e.name] || 0) + 1;
    const fp = e.input.file_path || e.input.path || e.input.notebook_path;
    if (/^(Read|view|read_file)$/i.test(e.name) && fp) r.read.add(fp);
    if (/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch)$/i.test(e.name)) r.editedByTool.add(fp || '(patch)');
    if (/^(Skill)$/.test(e.name)) r.skills.push(e.input.skill);
    if (/^(Agent|Task|spawn_agent)$/i.test(e.name)) r.agents.push(e.input.subagent_type || e.input.agent_type || e.input.description || '?');
    const cmd = String(cmdOf(e) || '');
    if (cmd && SHELL_WRITE.test(cmd)) r.shellWrites.push(`${e.ts} ${cmd.slice(0, 140).replace(/\s+/g, ' ')}`);
    if (fileRe && fileRe.test(JSON.stringify(e.input))) r.fileHits.push(`${e.ts} ${e.name} ${JSON.stringify(e.input).slice(0, 140)}`);
  }
  return r;
}

function print(r, evs) {
  const t = evs.filter((e) => e.ts).map((e) => Date.parse(e.ts));
  const list = (title, a, n = 30) => { console.log(`\n${title} (${a.length})`); for (const x of a.slice(0, n)) console.log(`  ${x}`); if (a.length > n) console.log(`  ... ${a.length - n} more`); };
  console.log(`events ${evs.length}, span ${t.length ? Math.round((Math.max(...t) - Math.min(...t)) / 1000) : 0}s`);
  console.log('tools', JSON.stringify(r.tools));
  list('files read', [...r.read]); list('edited with an edit tool', [...r.editedByTool]); list('shell commands that write files', r.shellWrites);
  list('skills loaded', r.skills); list('sub-agents spawned', r.agents); list('tool errors', r.errors); list('idle gaps', r.gaps);
  if (r.fileHits.length) list('calls matching --file', r.fileHits);
  console.log(`\nlast assistant text:\n  ${r.last.slice(0, 600)}`);
}

function selfTest() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  const L = (o) => JSON.stringify(o);
  const main = path.join(d, 's1.jsonl');
  fs.writeFileSync(main, [
    L({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { content: 'do it' } }),
    L({ type: 'assistant', timestamp: '2026-01-01T00:00:01Z', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'rules/sa.md' } }] } }),
    L({ type: 'assistant', timestamp: '2026-01-01T00:00:02Z', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: "sed -i 's/a/b/' src/x.ts" } }] } }),
    L({ type: 'user', timestamp: '2026-01-01T00:00:03Z', message: { content: [{ type: 'tool_result', is_error: true, content: 'boom' }] } }),
    L({ type: 'assistant', timestamp: '2026-01-01T00:05:00Z', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'review' } }, { type: 'text', text: 'done' }] } }),
  ].join('\n'));
  fs.mkdirSync(path.join(d, 's1', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(d, 's1', 'subagents', 'a.jsonl'), L({ type: 'response_item', timestamp: '2026-01-01T00:01:00Z', payload: { type: 'function_call', name: 'apply_patch', arguments: '{}' } }));
  const fl = files([main]);
  const evs = fl.flatMap(events).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const r = audit(evs, { gap: 60, fileRe: /sa\.md/ });
  const ok = fl.length === 2 && r.read.has('rules/sa.md') && r.shellWrites.length === 1 && r.errors.length === 1 && r.skills[0] === 'review'
    && r.editedByTool.has('(patch)') && r.gaps.length === 1 && r.fileHits.length === 1 && r.last === 'done';
  fs.rmSync(d, { recursive: true, force: true });
  console.log(ok ? 'self-test ok' : `self-test FAILED ${JSON.stringify({ ...r, read: [...r.read], editedByTool: [...r.editedByTool] })}`);
  process.exit(ok ? 0 : 1);
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) selfTest();
else {
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
  const gap = Number(opt('--gap', 60)); const fileArg = opt('--file'); const timeline = args.includes('--timeline');
  const paths = args.filter((a) => a !== '--timeline');
  if (!paths.length) { console.error('usage: run-audit.mjs <session.jsonl | dir>... [--timeline] [--gap 60] [--file <regex>]'); process.exit(2); }
  const evs = files(paths).flatMap(events).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  if (timeline) for (const e of evs) {
    const what = e.kind === 'tool' ? `${e.name} ${JSON.stringify(e.input).slice(0, 200)}` : e.kind === 'result' ? `${e.isError ? 'ERROR ' : ''}${e.text.slice(0, 200)}` : `${e.role}: ${e.text.slice(0, 300)}`;
    console.log(`${e.ts || '-'} [${e.file}] ${e.kind} ${what.replace(/\s+/g, ' ')}`);
  }
  else print(audit(evs, { gap, fileRe: fileArg ? new RegExp(fileArg) : undefined }), evs);
}
