#!/usr/bin/env node
// Requirement coverage for node:test (spec reporter). Copy into <build> next to requirements.json, then after a FULL run:
//   node --test --test-reporter=spec > <build>/last-test.txt 2>&1; echo $? > <build>/last-test.exit; node <build>/coverage.mjs
// A verify=test requirement passes when a passing (not TODO/skipped) test name starts with its id and no test with that id
// failed. Updates only `passes`/`evidence` of verify=test items. Exits with the suite's own non-zero status if it failed,
// otherwise 1 while any non-deferred requirement is open, else 0. Ids look like C1.04, E2E.01 (letters/digits, dot, digits).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length > 2) { console.error('usage: node coverage.mjs   (no arguments; reads last-test.txt and last-test.exit next to it)'); process.exit(2); }

const here = dirname(fileURLToPath(import.meta.url));
const reqFile = join(here, 'requirements.json');
const doc = JSON.parse(readFileSync(reqFile, 'utf8'));
const out = readFileSync(join(here, 'last-test.txt'), 'utf8');
const exitFile = join(here, 'last-test.exit');
const suiteExit = existsSync(exitFile) ? Number(readFileSync(exitFile, 'utf8').trim()) : null;

const summary = /ℹ fail (\d+)/.exec(out);
if (!summary) { console.error('last-test.txt has no summary line: the run did not finish'); process.exit(2); }

export function parse(text) {
  const passed = new Map(), failed = new Map();
  for (const line of text.split('\n')) {
    if (/#\s*(TODO|SKIP)\b/i.test(line)) continue; // a TODO/skipped test is not evidence
    // a test name may start with several ids ("C11.01 C11.02 ..."); each of them is covered by it
    const m = /^\s*([✔✖])\s+((?:[A-Z][A-Z0-9]*\.\d+\s+)+)(.*?)(?:\s+\([\d.]+m?s\))?\s*$/.exec(line + ' ');
    if (!m) continue;
    const map = m[1] === '✔' ? passed : failed;
    for (const id of m[2].trim().split(/\s+/)) map.set(id, [...(map.get(id) || []), (m[2] + m[3]).trim()]);
  }
  return { passed, failed };
}

const { passed, failed } = parse(out);
const gaps = [];
for (const r of doc.requirements) {
  if (r.verify === 'deferred') continue;
  if (r.verify !== 'test') { if (r.passes !== true) gaps.push(`${r.id} (review) not confirmed`); continue; }
  const ok = passed.get(r.id) || [], bad = failed.get(r.id) || [];
  r.passes = ok.length > 0 && bad.length === 0;
  r.evidence = r.passes ? ok.slice(0, 3) : bad.length ? bad.map((n) => 'FAIL ' + n) : [];
  if (!r.passes) {
    const near = !ok.length && !bad.length && out.split('\n').find((l) => /^\s*[✔✖]\s/.test(l) && l.includes(r.id));
    gaps.push(`${r.id} ${bad.length ? 'FAILING: ' + bad.join('; ') : near ? `no passing test name STARTS with "${r.id} " (seen in: ${near.trim().slice(0, 90)})` : 'no passing test named with this id'}`);
  }
}
writeFileSync(reqFile, JSON.stringify(doc, null, 2) + '\n');
const counted = doc.requirements.filter((r) => r.verify !== 'deferred');
const suiteLine = suiteExit === null ? 'suite exit status unknown (write last-test.exit)' : `suite exit ${suiteExit}`;
console.log(`${suiteLine}; fail count ${summary[1]}; requirements passing: ${counted.filter((r) => r.passes === true).length}/${counted.length}`);
for (const g of gaps) console.log('  GAP ' + g);
const known = new Set(doc.requirements.map((r) => r.id));
const strays = [...new Set([...passed.keys(), ...failed.keys()])].filter((id) => !known.has(id));
if (strays.length) console.log(`  NOTE test names use ids that are not in requirements.json (typo?): ${strays.join(', ')}`);
if (suiteExit) { console.log('  The suite failed: coverage above is not proof of done.'); process.exit(suiteExit); }
process.exit(gaps.length || summary[1] !== '0' || suiteExit === null ? 1 : 0);
