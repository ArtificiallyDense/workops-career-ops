#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { paths } from './lib/workops-paths.mjs';

const runsRoot = dirname(paths.reportsDir);
const queueJson = join(runsRoot, 'today-apply-queue.json');
const queueMd = join(runsRoot, 'today-apply-queue.md');
const healthMd = join(runsRoot, 'queue-health.md');
const healthJson = join(runsRoot, 'queue-health.json');

function clean(value) {
  return String(value || '')
    .replace(/â€“|â€”|–|—/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/upwork\s*\(client:\s*([^)]+)\)/gi, '$1')
    .replace(/^(.+?)\s*\(upwork client\)$/gi, '$1')
    .replace(/movies\s*&\s*mocktails/gi, 'movies and mocktails')
    .replace(/\bneed a\b/g, '')
    .replace(/\bremote\b/g, '')
    .replace(/\bfreelance\b/g, '')
    .replace(/\bcontract\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function key(row) {
  return `${normalize(row.company)}||${normalize(row.role)}`;
}

if (!existsSync(queueJson)) {
  console.error(`Missing queue JSON: ${queueJson}`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(queueJson, 'utf8'));
const rows = payload.rows || [];

const warnings = [];

const seen = new Map();
for (const row of rows) {
  const k = key(row);
  if (seen.has(k)) {
    warnings.push({
      level: 'high',
      type: 'duplicate',
      message: `Possible duplicate: ${row.company} - ${row.role} duplicates ${seen.get(k).replace(/â€“|â€”|–|—/g, "-")}`,
    });
  } else {
    seen.set(k, `${row.company} - ${row.role}`);
  }
}

for (const row of rows) {
  const score = Number.parseFloat(row.score) || 0;

  if (score >= 4.6 && row.priority === 'C') {
    warnings.push({
      level: 'high',
      type: 'high_score_backlog',
      message: `High-score opportunity is in C: ${row.company} - ${row.role} (${row.score})`,
    });
  }

  if (!row.applyUrl) {
    warnings.push({
      level: 'medium',
      type: 'missing_apply_url',
      message: `Missing apply URL: ${row.company} - ${row.role}`,
    });
  }

  if (!row.payTarget) {
    warnings.push({
      level: 'medium',
      type: 'missing_pay_target',
      message: `Missing pay target: ${row.company} - ${row.role}`,
    });
  }

  if (!row.applyPack) {
    warnings.push({
      level: 'medium',
      type: 'missing_apply_pack',
      message: `Missing apply pack: ${row.company} - ${row.role}`,
    });
  }

  if (!row.compensationFile) {
    warnings.push({
      level: 'low',
      type: 'missing_compensation_file',
      message: `Missing compensation file: ${row.company} - ${row.role}`,
    });
  }

  if (String(row.linkRisk || '').toLowerCase().includes('missing')) {
    warnings.push({
      level: 'medium',
      type: 'link_risk',
      message: `Link risk: ${row.company} - ${row.role}: ${row.linkRisk}`,
    });
  }
}

const bCount = rows.filter((r) => r.priority === 'B').length;

if (bCount > 12) {
  warnings.push({
    level: 'medium',
    type: 'b_list_overloaded',
    message: `B-list has ${bCount} items. Consider stricter thresholds or move weaker roles to C.`,
  });
}

const counts = {
  rows: rows.length,
  a: rows.filter((r) => r.priority === 'A').length,
  b: rows.filter((r) => r.priority === 'B').length,
  c: rows.filter((r) => r.priority === 'C').length,
  warnings: warnings.length,
  high: warnings.filter((w) => w.level === 'high').length,
  medium: warnings.filter((w) => w.level === 'medium').length,
  low: warnings.filter((w) => w.level === 'low').length,
};

const md = [
  '# WorkOps Queue Health',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Summary',
  '',
  `- Rows: ${counts.rows}`,
  `- A-list: ${counts.a}`,
  `- B-list: ${counts.b}`,
  `- C-list: ${counts.c}`,
  `- Warnings: ${counts.warnings}`,
  `- High: ${counts.high}`,
  `- Medium: ${counts.medium}`,
  `- Low: ${counts.low}`,
  '',
  '## Warnings',
  '',
];

if (!warnings.length) {
  md.push('No warnings found.');
} else {
  for (const warning of warnings) {
    md.push(`- **${warning.level.toUpperCase()} / ${warning.type}:** ${warning.message}`);
  }
}

writeFileSync(healthMd, md.join('\n'), 'utf8');
writeFileSync(healthJson, JSON.stringify({ generated: new Date().toISOString(), counts, warnings }, null, 2) + '\n', 'utf8');

console.log(`Warnings: ${warnings.length}`);
console.log(`Saved: ${healthMd}`);
console.log(`Saved: ${healthJson}`);
