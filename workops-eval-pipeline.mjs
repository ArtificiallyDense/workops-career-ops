#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { paths } from './lib/workops-paths.mjs';

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function clean(value) {
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/^[-:\s]+|[-:\s]+$/g, '')
    .trim();
}

function extractSummaryField(text, name) {
  const summary =
    text.match(/---SCORE_SUMMARY---([\s\S]*?)---END_SUMMARY---/) ||
    text.match(/---_SCORE_SUMMARY---([\s\S]*?)---END_SUMMARY---/);

  const block = summary ? summary[1] : text;
  const match = block.match(new RegExp(`${name}:\\s*(.+)`, 'i'));
  return match ? clean(match[1]) : null;
}

function extractHeader(text) {
  const line = text.split(/\r?\n/).find((item) => item.startsWith('# Evaluation:'));
  if (!line) return {};
  const cleanLine = line.replace('# Evaluation:', '').trim();
  const parts = cleanLine.split(/\s+(?:—|â€”|-)\s+/);
  return {
    company: clean(parts[0]),
    role: clean(parts.slice(1).join(' - ')),
  };
}

function key(company, role) {
  return `${clean(company).toLowerCase()}::${clean(role).toLowerCase()}`;
}

function evaluatedKeys() {
  const keys = new Set();

  if (!existsSync(paths.reportsDir)) return keys;

  for (const file of readdirSync(paths.reportsDir).filter((name) => name.endsWith('.md'))) {
    const text = readFileSync(join(paths.reportsDir, file), 'utf8');
    const header = extractHeader(text);
    const company = extractSummaryField(text, 'COMPANY') || header.company;
    const role = extractSummaryField(text, 'ROLE') || header.role;

    if (company && role && company.length <= 60) {
      keys.add(key(company, role));
    }
  }

  return keys;
}

const top = Number.parseInt(argValue('--top', '3'), 10);
const model = argValue('--model', process.env.GEMINI_MODEL_PIPELINE || process.env.GEMINI_MODEL || 'gemini-3.5-flash');
const includeEvaluated = args.includes('--include-evaluated');

if (!existsSync(paths.pipeline)) {
  console.error(`Pipeline not found: ${paths.pipeline}`);
  process.exit(1);
}

const done = evaluatedKeys();
const text = readFileSync(paths.pipeline, 'utf8');

const jobs = text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('- [ ] '))
  .map((line) => {
    const raw = line.replace('- [ ] ', '');
    const parts = raw.split('|').map((part) => part.trim());
    return {
      url: parts[0],
      company: parts[1] || 'Unknown company',
      role: parts[2] || 'Unknown role',
    };
  })
  .filter((job) => job.url.startsWith('http'))
  .filter((job) => includeEvaluated || !done.has(key(job.company, job.role)));

const selected = jobs.slice(0, top);

if (selected.length === 0) {
  console.log('No unchecked unevaluated jobs found in pipeline.');
  console.log('Use --include-evaluated to force re-evaluation.');
  process.exit(0);
}

console.log(`Evaluating ${selected.length} unevaluated job(s) from pipeline using ${model}.`);

for (const [index, job] of selected.entries()) {
  console.log('');
  console.log(`=== ${index + 1}/${selected.length}: ${job.company} — ${job.role} ===`);
  console.log(job.url);

  const result = spawnSync(
    process.execPath,
    ['workops-eval-url.mjs', job.url, '--model', model],
    { stdio: 'inherit', env: process.env }
  );

  if (result.error) {
    console.error(`Spawn error: ${result.error.message}`);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    console.error(`Failed with exit code ${result.status}: ${job.company} — ${job.role}`);
    process.exit(result.status ?? 1);
  }
}

console.log('');
console.log('Pipeline evaluation complete.');
console.log('Run: npm run workops:review');
