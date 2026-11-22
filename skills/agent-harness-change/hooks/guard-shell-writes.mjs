#!/usr/bin/env node
// Opt-in PreToolUse hook (matcher "Bash") for the RUNTIME agents of a harness you build - not for your own dev session.
// Works for Claude Code and Codex: both send tool_name "Bash" and tool_input.command (Codex exec_command too).
// Heuristic: blocks editing source/doc files through the shell (sed -i, perl -i, inline python/node/ruby writes, and
// cat/echo/printf/tee or heredocs writing into such files). Those edits fail silently when a pattern does not match, so the
// agent is told to use its file-editing tool. Builds, tests and output redirected to logs or temp files are allowed.
// Wiring (Claude Code settings the runtime agent loads, e.g. the workspace .claude/settings.json or `claude -p --settings`):
//   { "hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node <abs>/guard-shell-writes.mjs" } ] } ] } }
// Codex: the same entry in .codex/hooks.json (or [hooks] in config.toml); review it once with /hooks.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXT = String.raw`(?:md|mdx|toml|ya?ml|json|[cm]?[jt]sx?|py|cs|java|kt|go|rs|rb|php|html?|css|scss|sql|sh|ps1|xml|csproj)`;
const DEST = String.raw`['"]?[^\s'"|;&<>]*\.` + EXT + String.raw`['"]?(?=$|[\s|;&)])`; // whole destination name ends in a code/doc extension
const RULES = [
  [/(^|[\s;&|(])sed\s+(-[a-zA-Z]+\s+)*-[a-zA-Z]*i/, 'sed -i'],
  [/(^|[\s;&|(])perl\s+-[a-zA-Z]*i/, 'perl -i'],
  [/(^|[\s;&|(])(python3?|py)\b[^|;&]*\s-c\s[\s\S]*(open\([^)]*['"][wa]|write_text\(|\.write\()/, 'inline python write'],
  [/(^|[\s;&|(])(node|bun|deno)\b[^|;&]*\s(-e|--eval)\s[\s\S]*(writeFileSync|appendFileSync|writeFile\()/, 'inline node write'],
  [/(^|[\s;&|(])ruby\b[^|;&]*\s-e\s[\s\S]*File\.write/, 'inline ruby write'],
  [new RegExp(String.raw`(^|[\s;&|(])(cat|echo|printf)\b[^|;&]*>>?\s*` + DEST), 'shell redirect into a source/doc file'],
  [new RegExp(String.raw`(^|[\s;&|(])tee\s+(-a\s+)?` + DEST), 'tee into a source/doc file'],
  [new RegExp(String.raw`<<-?\s*['"]?\w+['"]?[^\n]*>>?\s*` + DEST + '|>>?\\s*' + DEST + String.raw`[^\n]*<<-?\s*['"]?\w+`), 'heredoc into a source/doc file'],
];

// Blank out quoted arguments so text inside quotes (printf 'sed -i') is not read as a command; keep quoted redirect targets.
function unquote(cmd) {
  return cmd.replace(/(>>?\s*)(['"])([^'"]*)\2/g, (m, op, q, name) => op + name.replace(/\s/g, '_')).replace(/'[^'\n]*'|"[^"\n]*"/g, (m) => (/[({]/.test(m) && /write|open\(/.test(m) ? m : '""'));
}

export function verdict(command) {
  const raw = Array.isArray(command) ? command.join(' ') : String(command || '');
  const cmd = unquote(raw);
  for (const [re, what] of RULES) if (re.test(cmd)) return what;
  return null;
}

async function main() {
  let raw = '';
  for await (const c of process.stdin) raw += c;
  const input = JSON.parse(raw || '{}');
  if (input.tool_name && input.tool_name !== 'Bash') return;
  const what = verdict(input.tool_input?.command);
  if (what) {
    process.stderr.write(`Blocked (${what}): edit files with your file-editing tool (Edit/Write, or apply_patch in Codex), not through the shell. Shell edits fail silently when a pattern does not match. Running builds/tests and redirecting output to .log or temp files is fine.\n`);
    process.exit(2);
  }
}

function selfTest() {
  const block = [
    "sed -i 's/a/b/' src/x.ts", "sed -E -i 's/a/b/' a.md", "perl -pi -e 's/a/b/' a.py",
    `python -c "open('src/a.py','w').write('x')"`, `node -e "require('fs').writeFileSync('a.ts','x')"`,
    "cat > src/app.ts <<'EOF'\nx\nEOF", "echo 'x' >> README.md", "printf 'x' | tee -a config.yml", "cat <<EOF > docs/a.md\nx\nEOF",
    'echo x > "a b.json"',
  ];
  const allow = [
    'npm test > test-output.log 2>&1', 'dotnet build', 'grep -rn foo src', "sed -n '1,20p' a.ts", 'cat src/app.ts',
    'echo done', 'pytest -q | tee pytest.log', 'git diff > /tmp/patch.diff', `python -c "print(1)"`,
    "printf 'sed -i'", 'echo done > build.json.log', `grep -n "cat > x.md" notes.txt`,
  ];
  const wrong = [...block.filter((c) => !verdict(c)).map((c) => `not blocked: ${c}`), ...allow.filter((c) => verdict(c)).map((c) => `blocked: ${c} (${verdict(c)})`)];
  if (verdict(['bash', '-lc', "sed -i 's/a/b/' x.md"]) !== 'sed -i') wrong.push('array command not handled');
  console.log(wrong.length ? `self-test FAILED\n${wrong.join('\n')}` : 'self-test ok');
  process.exit(wrong.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--self-test')) selfTest();
  else main().catch(() => process.exit(0));
}
