// Requirement coverage: maps every verify=test requirement to a passing test whose name starts with its id.
// Ids look like C1.04, E2E.01 or POST.02 (letters/digits, a dot, digits). Adapt the ✔/✖ line regex for test runners other than node:test --test-reporter=spec.
// Reads build/last-test.txt (spec reporter output of a FULL node --test run), updates only `passes`/`evidence` of verify=test
// requirements, prints the gaps. Exit 1 while any requirement (test or review) is not passing.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const reqFile = join(here, 'requirements.json');
const doc = JSON.parse(readFileSync(reqFile, 'utf8'));
const out = readFileSync(join(here, 'last-test.txt'), 'utf8');

const summary = /ℹ fail (\d+)/.exec(out);
if (!summary) { console.error('last-test.txt has no summary line: the run did not finish'); process.exit(2); }

const passed = new Map(), failed = new Map();
for (const line of out.split('\n')) {
  // a test name may start with several ids ("C11.01 C11.02 C11.03 …"); each of them is covered by it
  const m = /^\s*([✔✖])\s+((?:[A-Z][A-Z0-9]*\.\d+\s+)+)(.*?)(?:\s+\([\d.]+m?s\))?\s*$/.exec(line + ' ');
  if (!m) continue;
  const map = m[1] === '✔' ? passed : failed;
  for (const id of m[2].trim().split(/\s+/)) map.set(id, [...(map.get(id) || []), (m[2] + m[3]).trim()]);
}

const gaps = [];
for (const r of doc.requirements) {
  if (r.verify === 'deferred') continue;
  if (r.verify !== 'test') { if (!r.passes) gaps.push(`${r.id} (review) not confirmed`); continue; }
  const ok = passed.get(r.id) || [], bad = failed.get(r.id) || [];
  r.passes = ok.length > 0 && bad.length === 0;
  r.evidence = r.passes ? ok.slice(0, 3) : bad.length ? bad.map((n) => 'FAIL ' + n) : [];
  if (!r.passes) {
    const near = !ok.length && !bad.length && out.split('\n').find((l) => /^\s*[✔✖]\s/.test(l) && l.includes(r.id));
    gaps.push(`${r.id} ${bad.length ? 'FAILING: ' + bad.join('; ') : near ? `no test name STARTS with "${r.id} " (found it later in: ${near.trim().slice(0, 90)})` : 'no test named with this id'}`);
  }
}
writeFileSync(reqFile, JSON.stringify(doc, null, 2) + '\n');
const counted = doc.requirements.filter((r) => r.verify !== 'deferred');
console.log(`suite fail count: ${summary[1]}; requirements passing: ${counted.filter((r) => r.passes).length}/${counted.length}`);
for (const g of gaps) console.log('  GAP ' + g);
const known = new Set(doc.requirements.map((r) => r.id));
const strays = [...new Set([...passed.keys(), ...failed.keys()])].filter((id) => !known.has(id));
if (strays.length) console.log(`  NOTE test names use ids that are not in requirements.json (typo?): ${strays.join(', ')}`);
process.exit(gaps.length || summary[1] !== '0' ? 1 : 0);
