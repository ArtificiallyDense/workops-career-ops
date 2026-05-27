#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);
const url = args.find((arg) => !arg.startsWith('--'));
const modelIndex = args.indexOf('--model');
const model = modelIndex >= 0 ? args[modelIndex + 1] : (process.env.GEMINI_MODEL || 'gemini-3.5-flash');

if (!url) {
  console.error('Usage: npm run workops:eval-url -- <JOB_URL> [--model gemini-3.5-flash]');
  process.exit(1);
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

const response = await fetch(url, {
  headers: {
    'user-agent': 'Mozilla/5.0 WorkOps job evaluator',
  },
});

if (!response.ok) {
  console.error(`Failed to fetch URL: HTTP ${response.status}`);
  process.exit(1);
}

const html = await response.text();
const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : url;
const slug = slugify(title || url);

mkdirSync('jds', { recursive: true });

const jdPath = join('jds', `${slug || 'job-description'}.txt`);
writeFileSync(jdPath, `SOURCE_URL: ${url}\nTITLE: ${title}\n\n${html}`, 'utf8');

console.log(`Saved JD: ${jdPath}`);
console.log(`Evaluating with model: ${model}`);

const result = spawnSync(
  process.execPath,
  ['gemini-eval.mjs', '--model', model, '--file', jdPath],
  { stdio: 'inherit', env: process.env }
);

process.exit(result.status ?? 1);
