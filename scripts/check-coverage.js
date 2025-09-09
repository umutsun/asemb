#!/usr/bin/env node
/*
 Simple coverage gate for CI:
   node scripts/check-coverage.js --statements=60 --branches=40
 Reads coverage/coverage-summary.json and enforces minimum thresholds.
*/
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { statements: 0, branches: 0 };
  for (const arg of args) {
    const [k, v] = arg.split('=');
    if (k === '--statements') out.statements = Number(v);
    if (k === '--branches') out.branches = Number(v);
  }
  return out;
}

function readSummary() {
  const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    console.error('coverage-summary.json not found at', summaryPath);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
}

function main() {
  const { statements, branches } = parseArgs();
  const summary = readSummary();
  const total = summary.total || {};
  const st = total.statements?.pct ?? 0;
  const br = total.branches?.pct ?? 0;
  let ok = true;
  if (st < statements) {
    console.error(`Statements coverage ${st}% is below threshold ${statements}%`);
    ok = false;
  }
  if (br < branches) {
    console.error(`Branches coverage ${br}% is below threshold ${branches}%`);
    ok = false;
  }
  if (!ok) {
    process.exit(1);
  } else {
    console.log('Coverage OK:', { statements: st, branches: br });
  }
}

main();

