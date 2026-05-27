#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { paths } from './lib/workops-paths.mjs';

function clean(value) {
  return String(value || 'Unknown')
    .replace(/\*\*/g, '')
    .replace(/^[-:\s]+|[-:\s]+$/g, '')
    .trim() || 'Unknown';
}

function extractField(block, name) {
  const match = block.match(new RegExp(`${name}:\\s*(.+)`, 'i'));
  return match ? clean(match[1]) : null;
}

function parseReport(filePath) {
  const text = readFileSync(filePath, 'utf8');

  const summary =
    text.match(/---SCORE_SUMMARY---([\s\S]*?)---END_SUMMARY---/) ||
    text.match(/---_SCORE_SUMMARY---([\s\S]*?)---END_SUMMARY---/) ||
    text.match(/---SCORE_SUMMARY---([\s\S]*)/);

  const block = summary ? summary[1] : text;

  const headerMatch = text.match(/^# Evaluation:\s*(.+?)\s+[—-]\s+(.+)$/m);

  const company = clean(
    extractField(block, 'COMPANY') ||
    headerMatch?.[1] ||
    'Unknown'
  );

  const role = clean(
    extractField(block, 'ROLE') ||
    headerMatch?.[2] ||
    'Unknown'
  );

  const scoreRaw =
    extractField(block, 'SCORE') ||
    text.match(/\*\*Score:\*\*\s*([0-9.]+)/i)?.[1] ||
    '0';

  const score = Number.parseFloat(scoreRaw) || 0;

  const archetype = clean(extractField(block, 'ARCHETYPE') || 'Unknown');
  const legitimacy = clean(extractField(block, 'LEGITIMACY') || 'Unknown');

  let decision = 'Ignore';
  if (score >= 4.4) decision = 'Act Now';
  else if (score >= 3.8) decision = 'Strong Maybe';
  else if (score >= 3.2) decision = 'Maybe';
  else if (score >= 2.5) decision = 'Low Priority';

  return {
    filePath,
    fileName: filePath.split(/[\\/]/).pop(),
    company,
    role,
    score,
    archetype,
    legitimacy,
    decision,
  };
}

const reportsDir = paths.reportsDir;
if (!existsSync(reportsDir)) {
  console.error(`Reports directory not found: ${reportsDir}`);
  process.exit(1);
}

const allReports = readdirSync(reportsDir)
  .filter((name) => name.endsWith('.md'))
  .map((name) => parseReport(join(reportsDir, name)))
  .filter((r) => r.score > 0)
  .filter((r) => r.company.length <= 60)
  .filter((r) => r.role.length <= 90)
  .filter((r) => !r.role.includes('|'))
  .filter((r) => r.score >= 2.5);

const bestByRole = new Map();

for (const report of allReports) {
  const key = `${report.company.toLowerCase()}::${report.role.toLowerCase()}`;
  const existing = bestByRole.get(key);
  if (!existing || report.score > existing.score) {
    bestByRole.set(key, report);
  }
}

const reports = [...bestByRole.values()].sort((a, b) => b.score - a.score);

const outputDir = dirname(reportsDir);
mkdirSync(outputDir, { recursive: true });

const outputPath = join(outputDir, 'opportunity-review.md');

const lines = [
  '# WorkOps Opportunity Review',
  '',
  `Generated: ${new Date().toISOString().slice(0, 10)}`,
  '',
  `Reports reviewed: ${allReports.length}`,
  `Unique opportunities: ${reports.length}`,
  '',
  '## Ranked Opportunities',
  '',
  '| Rank | Company | Role | Score | Decision | Legitimacy | Archetype | Report |',
  '|---:|---|---|---:|---|---|---|---|',
];

reports.forEach((r, index) => {
  const reportRef = relative(outputDir, r.filePath).replaceAll('\\', '/');
  lines.push(`| ${index + 1} | ${r.company} | ${r.role} | ${r.score.toFixed(1)} | ${r.decision} | ${r.legitimacy} | ${r.archetype} | ${reportRef} |`);
});

lines.push('');
lines.push('## Action Rules');
lines.push('');
lines.push('- Act Now: generate application package or outreach package.');
lines.push('- Strong Maybe: review manually before spending time.');
lines.push('- Maybe: keep for later or use for portfolio-gap learning.');
lines.push('- Low Priority / Ignore: do not spend application time unless strategically useful.');
lines.push('');

writeFileSync(outputPath, lines.join('\n'), 'utf8');

console.log(`Reviewed ${allReports.length} reports.`);
console.log(`Unique opportunities: ${reports.length}`);
console.log(`Saved: ${outputPath}`);

