#!/usr/bin/env node
// Claude Code PreToolUse hook (matcher "Bash") for the RUNTIME agents of a harness you build, not for your own dev session.
// It blocks editing source or doc files through the shell (sed -i, inline python/node/ruby writes, cat/echo/printf/tee or
// heredocs into such files). Those edits fail silently when the pattern does not match. The agent is told to use Edit/Write.
// It allows running builds and tests, and redirecting command output to logs or temp files.
// Wire it in the settings that the runtime agent loads (for example the workspace's .claude/settings.json, or the
// `--settings` file passed to `claude -p`):
//   { "hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node <abs>/guard-shell-writes.mjs" } ] } ] } }
const CODE = String.raw`[\w./-]+\.(?:md|mdx|toml|ya?ml|json|[cm]?[jt]sx?|py|cs|java|kt|go|rs|rb|php|html?|css|scss|sql|sh|ps1|xml|csproj)\b`;
const RULES = [
  [/\bsed\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*i/, 'sed -i'],
  [/\bperl\s+-[a-zA-Z]*i/, 'perl -i'],
  [/\b(python3?|py)\b[^|;&]*\s-c\s[\s\S]*(open\([^)]*['"][wa]['"]|write_text\(|\.write\()/, 'inline python write'],
  [/\b(node|bun|deno)\b[^|;&]*\s(-e|--eval)\s[\s\S]*(writeFileSync|appendFileSync|writeFile\()/, 'inline node write'],
  [/\bruby\b[^|;&]*\s-e\s[\s\S]*File\.write/, 'inline ruby write'],
  [new RegExp(String.raw`\b(cat|echo|printf)\b[^|;&]*>>?\s*['"]?` + CODE), 'shell redirect into a source/doc file'],
  [new RegExp(String.raw`\btee\s+(-a\s+)?['"]?` + CODE), 'tee into a source/doc file'],
  [new RegExp(String.raw`<<-?\s*['"]?\w+['"]?[^\n]*>>?\s*['"]?` + CODE + '|>>?\\s*[\'"]?' + CODE + String.raw`[^\n]*<<-?\s*['"]?\w+`), 'heredoc into a source/doc file'],
];

export function verdict(command) {
  const cmd = String(command || '');
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
    process.stderr.write(`Blocked (${what}): edit files with the Edit or Write tool, not through the shell. Shell edits fail silently when the pattern does not match. Running builds/tests and redirecting output to .log or temp files is fine.\n`);
    process.exit(2);
  }
}

if (process.argv.includes('--self-test')) {
  const block = [
    "sed -i 's/a/b/' src/x.ts", "sed -E -i 's/a/b/' a.md", "perl -pi -e 's/a/b/' a.py",
    `python -c "open('src/a.py','w').write('x')"`, `node -e "require('fs').writeFileSync('a.ts','x')"`,
    "cat > src/app.ts <<'EOF'\nx\nEOF", "echo 'x' >> README.md", "printf 'x' | tee -a config.yml", "cat <<EOF > docs/a.md\nx\nEOF",
  ];
  const allow = [
    'npm test > test-output.log 2>&1', 'dotnet build', 'grep -rn foo src', "sed -n '1,20p' a.ts", 'cat src/app.ts',
    'echo done', 'pytest -q | tee pytest.log', 'git diff > /tmp/patch.diff', `python -c "print(1)"`,
  ];
  const wrong = [...block.filter((c) => !verdict(c)).map((c) => `not blocked: ${c}`), ...allow.filter((c) => verdict(c)).map((c) => `blocked: ${c}`)];
  console.log(wrong.length ? `self-test FAILED\n${wrong.join('\n')}` : 'self-test ok');
  process.exit(wrong.length ? 1 : 0);
} else main().catch(() => process.exit(0));
