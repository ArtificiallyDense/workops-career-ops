#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { paths } from './lib/workops-paths.mjs';

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const minScore = Number.parseFloat(argValue('--min-score', '4.1'));
const max = Number.parseInt(argValue('--max', '50'), 10);

const runsRoot = dirname(paths.reportsDir);
const reviewPath = join(runsRoot, 'opportunity-review.md');
const outMd = join(runsRoot, 'qualified-opportunities.md');
const outJson = join(runsRoot, 'qualified-opportunities.json');

function clean(value) {
  return String(value || '')
    .replace(/â€“|â€”|–|—/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeCell(value) {
  return clean(value).replace(/\|/g, '/');
}

function num(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\([^)]*upwork[^)]*\)/gi, '')
    .replace(/upwork\s*\(client:\s*([^)]+)\)/gi, '$1')
    .replace(/movies\s*&\s*mocktails/gi, 'movies and mocktails')
    .replace(/\bneed a\b/g, '')
    .replace(/\bremote\b/g, '')
    .replace(/\bfreelance\b/g, '')
    .replace(/\bcontract\b/g, '')
    .replace(/\bfull[- ]?time\b/g, '')
    .replace(/\bpart[- ]?time\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalCompany(company) {
  const text = clean(company);

  const upworkClient =
    text.match(/upwork\s*\(client:\s*([^)]+)\)/i) ||
    text.match(/^(.+?)\s*\(upwork client\)$/i);

  if (upworkClient) return normalizeText(upworkClient[1]);

  return normalizeText(text);
}

function canonicalRole(role) {
  return normalizeText(role)
    .replace(/\blogo creator\b/g, 'logo designer')
    .replace(/\bbrand style guide\b/g, 'brand guide')
    .replace(/\bgraphic designers\b/g, 'graphic designer')
    .trim();
}

function dedupeKey(row) {
  return `${canonicalCompany(row.company)}||${canonicalRole(row.role)}`;
}

function reportPathFor(row) {
  if (!row.report) return '';
  return join(paths.reportsDir, row.report.replace(/^reports[\\/]/, ''));
}

function extractUrl(row) {
  const file = reportPathFor(row);
  if (!file || !existsSync(file)) return '';

  const text = readFileSync(file, 'utf8');
  const match =
    text.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/i) ||
    text.match(/^URL:\s*(https?:\/\/\S+)/im) ||
    text.match(/Apply URL:\s*(https?:\/\/\S+)/i);

  return match ? match[1].trim() : '';
}

function linkRisk(url) {
  const value = clean(url).toLowerCase();
  if (!value) return 'missing';
  if (value.includes('indeed.com')) return 'gated';
  if (value.includes('google.com/search')) return 'google-jobs';
  if (value.includes('upwork.com')) return 'marketplace';
  if (value.includes('linkedin.com')) return 'login';
  return 'normal';
}

function parseReview() {
  if (!existsSync(reviewPath)) {
    console.error(`Missing review file: ${reviewPath}`);
    process.exit(1);
  }

  return readFileSync(reviewPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|') && !line.includes('---:') && !line.includes('Rank |'))
    .map((line) => line.split('|').map((part) => clean(part)).filter(Boolean))
    .map((parts) => ({
      rank: Number.parseInt(parts[0], 10),
      company: parts[1],
      role: parts[2],
      score: num(parts[3]),
      decision: parts[4],
      legitimacy: parts[5],
      archetype: parts[6],
      report: parts[7],
    }))
    .filter((row) => row.company && row.role && row.report && row.report.endsWith('.md'));
}

function isQualified(row) {
  const decision = clean(row.decision).toLowerCase();

  // Act Now can bypass min-score because urgency/fit was explicitly judged high.
  if (decision.includes('act now')) return true;

  // Strong Maybe still needs to meet the quality floor.
  if (decision.includes('strong maybe') && row.score >= minScore) return true;

  return row.score >= minScore;
}

function betterRow(a, b) {
  if (!a) return b;
  if (b.score > a.score) return b;
  if (b.score === a.score && linkRisk(extractUrl(b)) === 'normal' && linkRisk(extractUrl(a)) !== 'normal') return b;
  return a;
}

const raw = parseReview();
const qualifiedRaw = raw.filter(isQualified);

const map = new Map();
const duplicates = [];

for (const row of qualifiedRaw) {
  const key = dedupeKey(row);
  const existing = map.get(key);

  if (existing) {
    duplicates.push({
      key,
      kept: `${existing.company} — ${existing.role}`,
      removed: `${row.company} — ${row.role}`,
    });
  }

  map.set(key, betterRow(existing, row));
}

const rows = [...map.values()]
  .map((row) => {
    const url = extractUrl(row);
    return {
      ...row,
      applyUrl: url,
      linkRisk: linkRisk(url),
      dedupeKey: dedupeKey(row),
    };
  })
  .sort((a, b) => b.score - a.score || a.rank - b.rank)
  .slice(0, max);

const summary = {
  schema_version: '1.0',
  generated: new Date().toISOString(),
  source: reviewPath,
  min_score: minScore,
  max,
  raw_review_count: raw.length,
  qualified_before_dedupe: qualifiedRaw.length,
  qualified_after_dedupe: rows.length,
  duplicates_removed: duplicates.length,
};

const md = [
  '# WorkOps Qualified Opportunities',
  '',
  `Generated: ${summary.generated}`,
  `Min score: ${minScore}`,
  `Max shown: ${max}`,
  `Raw review count: ${raw.length}`,
  `Qualified before dedupe: ${qualifiedRaw.length}`,
  `Qualified after dedupe: ${rows.length}`,
  `Duplicates removed: ${duplicates.length}`,
  '',
  '## Qualified',
  '',
  '| Rank | Company | Role | Score | Decision | Link Risk | Report |',
  '|---:|---|---|---:|---|---|---|',
];

for (const row of rows) {
  md.push(`| ${safeCell(row.rank)} | ${safeCell(row.company)} | ${safeCell(row.role)} | ${safeCell(row.score)} | ${safeCell(row.decision)} | ${safeCell(row.linkRisk)} | ${safeCell(row.report)} |`);
}

if (duplicates.length) {
  md.push('', '## Duplicate / Merge Notes', '');
  for (const dup of duplicates) {
    md.push(`- ${dup.removed} merged into ${dup.kept}`);
  }
}

writeFileSync(outMd, md.join('\n'), 'utf8');
writeFileSync(outJson, JSON.stringify({ ...summary, rows, duplicates }, null, 2) + '\n', 'utf8');

console.log(`Qualified opportunities: ${rows.length}`);
console.log(`Duplicates removed: ${duplicates.length}`);
console.log(`Saved: ${outMd}`);
console.log(`Saved: ${outJson}`);
